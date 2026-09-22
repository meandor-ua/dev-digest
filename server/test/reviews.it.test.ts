import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockProjectDocsAdapter,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
        },
      },
    });
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Before any run exists, the PR list omits cost_usd entirely (no badge),
    // not null (which would mean "a run exists, cost unknown").
    const beforeRun = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const prBeforeRun = beforeRun.find((p: { id: string }) => p.id === pr.id);
    expect('cost_usd' in prBeforeRun).toBe(false);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.stats.cost_usd).toBe(0.001);
    expect(trace.log.length).toBeGreaterThan(0);

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');
    expect(run!.costUsd).toBe(0.001);

    // PR-list COST column: all-time sum of the PR's successful runs (only
    // one run here, so it's just this run's cost).
    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listedPr = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.cost_usd).toBe(0.001);

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  it('PR-list COST sums every run of a multi-agent "Review all", not just one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Disable every agent left enabled by earlier tests in this file (agents
    // are workspace-scoped, not PR-scoped) so `all: true` below targets
    // EXACTLY the two we create next.
    await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, workspaceId));

    await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'BatchA', provider: 'openai', model: 'gpt-4.1', system_prompt: 'a' },
    });
    await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'BatchB', provider: 'openai', model: 'gpt-4.1', system_prompt: 'b' },
    });

    // ONE "Review all" click — service.runReview() creates one agent_runs
    // row per enabled agent; the PR-list cost must include both.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    expect(body.runs).toHaveLength(2);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listedPr = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.cost_usd).toBeCloseTo(0.002, 6);

    await app.close();
  });

  it('PR-list COST is a true all-time sum across separate historical batches, not just the latest', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Two runs recorded hours apart — under the old batch-window logic these
    // would NOT have been summed together; the all-time sum must include both.
    await pg.handle.db.insert(t.agentRuns).values([
      {
        workspaceId,
        prId: pr.id,
        status: 'done',
        costUsd: 0.001,
        ranAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        workspaceId,
        prId: pr.id,
        status: 'done',
        costUsd: 0.004,
        ranAt: new Date('2026-01-02T00:00:00Z'),
      },
    ]);

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listedPr = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.cost_usd).toBeCloseTo(0.005, 6);

    await app.close();
  });

  it('PR-list COST is null (not summed as $0) when every run failed, even if one recorded partial cost', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.agentRuns).values([
      { workspaceId, prId: pr.id, status: 'failed', costUsd: 0.0002, ranAt: new Date() },
      { workspaceId, prId: pr.id, status: 'failed', costUsd: null, ranAt: new Date() },
    ]);

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listedPr = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.cost_usd).toBeNull();

    await app.close();
  });

  /**
   * `has_trace` on GET /pulls/:id/runs — a narrow EXISTS flag from a LEFT JOIN
   * against run_traces (never the jsonb `trace` column itself). It gates the
   * timeline's trace button so a run that can never produce a trace document
   * doesn't advertise one.
   */
  it('GET /pulls/:id/runs reports has_trace: true once a trace was saved, false for a reaped run', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec-trace', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    // A real run writes a run_traces document as part of finishing.
    const started = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const tracedRunId = started.runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // A run reaped by reapStaleRunningRuns() never calls saveRunTrace: insert
    // a stuck 'running' row, then reap it exactly the way boot does.
    const [stale] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status: 'running', ranAt: new Date() })
      .returning();
    // buildApp() awaits reapStaleRunningRuns() during boot — booting a second
    // app is the real code path, not a hand-rolled UPDATE.
    const rebooted = await appWith(REVIEW_FIXTURE);
    await rebooted.close();

    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    const traced = runs.find((r: { run_id: string }) => r.run_id === tracedRunId);
    const reapedRun = runs.find((r: { run_id: string }) => r.run_id === stale!.id);
    expect(traced.has_trace).toBe(true);
    expect(reapedRun.status).toBe('failed');
    expect(reapedRun.has_trace).toBe(false);

    // The list endpoint must never ship the trace jsonb itself — only the flag.
    for (const r of runs) expect('trace' in r).toBe(false);

    await app.close();
  });

  it('PR-list COST sums only the successful run when mixed with a failed one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.agentRuns).values([
      { workspaceId, prId: pr.id, status: 'done', costUsd: 0.003, ranAt: new Date() },
      { workspaceId, prId: pr.id, status: 'failed', costUsd: 0.0009, ranAt: new Date() },
    ]);

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listedPr = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.cost_usd).toBeCloseTo(0.003, 6);

    await app.close();
  });

  async function makeAgent(app: Awaited<ReturnType<typeof appWith>>, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
  }

  it('a run reported done (absent from /runs/active) already has its trace', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await makeAgent(app, 'Sec-order');
    const started = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = started.runs[0].run_id as string;

    // Poll the same signal the client uses; the instant the run leaves the
    // active set its trace must exist (never a 404 window).
    for (let i = 0; i < 400; i++) {
      const active = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs/active` })).json();
      if (!active.some((r: { run_id: string }) => r.run_id === runId)) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const trace = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    expect(trace.statusCode).toBe(200);
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs.find((r: { run_id: string }) => r.run_id === runId).has_trace).toBe(true);

    await app.close();
  });

  it('an empty diff fails the run closed: no review, no LLM call, PR untouched', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: llm },
        // GitHub unreachable too — the last-resort patch fetch must not rescue it.
        github: { getPullRequest: async () => { throw new Error('offline'); } } as never,
      },
    });
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    // No stored patch and (empty git diff) no clone → nothing to review.
    await pg.handle.db.update(t.prFiles).set({ patch: null }).where(eq(t.prFiles.prId, pr.id));
    const agent = await makeAgent(app, 'Sec-empty');

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    expect(res.json().runs).toHaveLength(1);

    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('failed');
    expect(runs[0]!.error).toContain('No reviewable diff');
    expect(runs[0]!.error).toContain('GitHub could not be reached');
    expect(runs[0]!.costUsd).toBeNull();

    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews).toHaveLength(0);
    const listed = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` }))
      .json()
      .find((p: { id: string }) => p.id === pr.id);
    expect(listed.score ?? null).toBeNull();
    expect(listed.cost_usd).toBeNull();
    expect(llm.calls.filter((c) => c.method !== 'listModels')).toHaveLength(0);

    await app.close();
  });

  it('a PR with a stored patch still reviews normally (empty-diff guard does not regress it)', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId); // has a patch in pr_files
    const agent = await makeAgent(app, 'Sec-patched');
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews).toHaveLength(1);

    await app.close();
  });

  it('a PR imported without patches fetches them from GitHub and reviews normally', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }), // clone has no diff for the PR head
        github: new MockGitHubClient(), // serves src/config.ts with a patch
        llm: { openai: llm },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    // As the PR list leaves it: no pr_files at all.
    await pg.handle.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    const agent = await makeAgent(app, 'Sec-fetch');

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');
    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    expect(files.map((f) => f.path)).toEqual(['src/config.ts']);
    expect(files[0]!.patch).toContain('stripeKey');

    await app.close();
  });

  it('a PR that GitHub says changes no files fails with THAT reason, not a token hint', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const gh = new MockGitHubClient();
    const real = gh.getPullRequest.bind(gh);
    // Like quick-blog #36: open, 2 commits, but 0 changed files vs base.
    gh.getPullRequest = async (r, n) => ({ ...(await real(r, n)), files: [], files_count: 0, additions: 0, deletions: 0 });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: '' }), github: gh, llm: { openai: llm } },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await pg.handle.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    const agent = await makeAgent(app, 'Sec-nofiles');

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('failed');
    expect(runs[0]!.error).toContain('changes no files');
    expect(runs[0]!.error).not.toContain('token');
    expect(llm.calls.filter((c) => c.method !== 'listModels')).toHaveLength(0);

    await app.close();
  });
  it('injects only enabled, vetted skills into the prompt, in link order', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }), llm: { openai: llm } },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await makeAgent(app, 'Sec-skills');
    const mkSkill = async (name: string, body: string, source: 'manual' | 'imported_url' = 'manual') =>
      (await app.inject({ method: 'POST', url: '/skills', payload: { name, type: 'rubric', body, source } })).json();
    const second = await mkSkill('Second', 'RULE-SECOND');
    const first = await mkSkill('First', 'RULE-FIRST');
    const linkOff = await mkSkill('Link off', 'RULE-LINK-OFF');
    const unvetted = await mkSkill('Unvetted', 'RULE-UNVETTED', 'imported_url'); // stored disabled
    expect(unvetted.enabled).toBe(false);
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: first.id, enabled: true },
          { skill_id: linkOff.id, enabled: false },
          { skill_id: unvetted.id, enabled: true },
          { skill_id: second.id, enabled: true },
        ],
      },
    });

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');

    const prompt = llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => JSON.stringify((c.req as { messages: unknown }).messages))
      .join('\n');
    expect(prompt).toContain('## Skills / rules');
    expect(prompt).toContain('RULE-FIRST');
    expect(prompt).toContain('RULE-SECOND');
    expect(prompt.indexOf('RULE-FIRST')).toBeLessThan(prompt.indexOf('RULE-SECOND'));
    expect(prompt).not.toContain('RULE-LINK-OFF');
    expect(prompt).not.toContain('RULE-UNVETTED');

    await app.close();
  });

  it("injects an enabled skill's attached context docs under ## Project context", async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
        projectDocs: new MockProjectDocsAdapter({
          docs: [{ path: 'docs/README.md', dir: 'docs', category: 'docs' }],
          files: { 'docs/README.md': 'PROJECT-DOC-CONTENT' },
        }),
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await makeAgent(app, 'Sec-context');
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: { name: 'With docs', type: 'rubric', body: 'RULE' } })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['docs/README.md'] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: skill.id, enabled: true }] },
    });

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');

    const prompt = llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => JSON.stringify((c.req as { messages: unknown }).messages))
      .join('\n');
    expect(prompt).toContain('## Project context');
    expect(prompt).toContain('PROJECT-DOC-CONTENT');

    await app.close();
  });

  it('skips an attached doc that is missing from the clone, without failing the run', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
        // `docs` lists the path (so it's a "known" doc) but `files` has no entry
        // for it — same shape as a doc renamed/deleted since the skill attached it.
        projectDocs: new MockProjectDocsAdapter({
          docs: [{ path: 'docs/gone.md', dir: 'docs', category: 'docs' }],
          files: {},
        }),
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await makeAgent(app, 'Sec-context-missing');
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: { name: 'Missing doc', type: 'rubric', body: 'RULE' } })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['docs/gone.md'] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: skill.id, enabled: true }] },
    });

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');

    const prompt = llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => JSON.stringify((c.req as { messages: unknown }).messages))
      .join('\n');
    expect(prompt).not.toContain('## Project context');

    await app.close();
  });

  it('a disabled skill link contributes no context docs', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
        projectDocs: new MockProjectDocsAdapter({
          docs: [{ path: 'docs/README.md', dir: 'docs', category: 'docs' }],
          files: { 'docs/README.md': 'SHOULD-NOT-APPEAR' },
        }),
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await makeAgent(app, 'Sec-context-disabled');
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: { name: 'Disabled link', type: 'rubric', body: 'RULE' } })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['docs/README.md'] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: skill.id, enabled: false }] },
    });

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');

    const prompt = llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => JSON.stringify((c.req as { messages: unknown }).messages))
      .join('\n');
    expect(prompt).not.toContain('## Project context');
    expect(prompt).not.toContain('SHOULD-NOT-APPEAR');

    await app.close();
  });
});
