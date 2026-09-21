import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and, or, isNull } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';
import { PR_482_PATCHES, patchStats } from './seed-patches.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db
      .insert(t.prFiles)
      .values(PR_482_PATCHES.map((f) => ({ prId: pr!.id, path: f.path, patch: f.patch, ...patchStats(f.patch) })));

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // Backfill patches on a DB seeded before they existed: without a stored patch
  // (and with no clone for this fictional repo) the PR has no diff to review.
  for (const f of PR_482_PATCHES) {
    await db
      .update(t.prFiles)
      .set({ patch: f.patch, ...patchStats(f.patch) })
      .where(
        and(eq(t.prFiles.prId, pr!.id), eq(t.prFiles.path, f.path), or(isNull(t.prFiles.patch), eq(t.prFiles.patch, ''))),
      );
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Ensures test suites are comprehensive, catch edge cases, and avoid fragile mocks.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  const agentRows = await db
    .select()
    .from(t.agents)
    .where(eq(t.agents.workspaceId, workspaceId));
  const agentByName = (n: string) => agentRows.find((a) => a.name === n)!;

  // ---- demo skills (across the 4 types) ----
  const seedSkills: Array<{
    name: string;
    type: (typeof t.skills.$inferInsert)['type'];
    source?: (typeof t.skills.$inferInsert)['source'];
    description: string;
    body: string;
  }> = [
    { name: 'Bug & Correctness Rubric', type: 'rubric', description: 'Score a diff for correctness, edge cases and error handling.', body: 'Rate correctness 0-5; flag unhandled errors, off-by-one, and race conditions.' },
    { name: 'Readability Rubric', type: 'rubric', description: 'Judge naming, cohesion and comment quality.', body: 'Prefer intention-revealing names; flag functions over ~40 lines.' },
    { name: 'Repo Naming Conventions', type: 'convention', description: 'Kebab-case files, PascalCase components.', body: 'Enforce the naming rules from AGENTS.md across changed files.' },
    { name: 'Error Handling Convention', type: 'convention', description: 'Errors go through the domain error taxonomy.', body: 'No bare throws in routes; use AppError subclasses.' },
    { name: 'Lethal Trifecta Guard', type: 'security', description: 'Secrets, injection, SSRF and the lethal trifecta.', body: 'Block hardcoded secrets and unsanitised sinks before merge.' },
    { name: 'Payments Domain Notes', type: 'custom', description: 'Domain rules specific to the payments service.', body: 'Money is integer minor units; never log full card numbers.' },
    {
      name: 'Test Completeness & Edge Cases Rubric',
      type: 'rubric',
      description: 'Score test suites for branch completeness, boundary conditions, and negative tests.',
      body: 'Rate test completeness 0-5. Flag any missing tests for error branches, edge cases (empty inputs, null/undefined, boundaries), and verify that all code paths introduced or modified by the PR are exercised by corresponding test assertions.',
    },
    {
      name: 'Overmocking & Fragile Test Guard',
      type: 'security',
      description: 'Detect over-mocked tests and fragile implementation coupling.',
      body: 'Flag tests that mock internal domain logic or database layers to the point where tests pass without asserting true system behavior. Recommend integration or contract tests with real or containerized boundaries.',
    },
    {
      name: 'Async & Flakiness Convention',
      type: 'convention',
      description: 'Prevent flaky tests caused by unhandled async operations or leaked state.',
      body: 'All async operations in tests must be properly awaited. Avoid arbitrary sleep/setTimeout calls in tests; use deterministic event triggers or condition polling instead. Ensure test isolation by cleaning state in beforeEach/afterEach.',
    },
    {
      name: 'Test Coverage Nudge',
      type: 'custom',
      source: 'imported_url',
      description: 'Ensure PRs adding features include corresponding unit or integration tests.',
      body: 'When a PR introduces new public endpoints, utility functions, or business logic, ensure matching test files are added or updated. Suggest specific test cases for any uncovered public APIs.',
    },
    {
      name: 'API Breaking Change Rubric',
      type: 'rubric',
      description: 'Flag breaking changes in route signatures, response payloads, or query parameters.',
      body: 'Any modification to existing public API route parameters, status codes, request schemas, or response schemas must be backwards-compatible or explicitly versioned. Flag removed fields or newly required parameters as CRITICAL.',
    },
  ];
  for (const sk of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, sk.name)));
    if (!existing) {
      const [inserted] = await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: sk.name,
          description: sk.description,
          type: sk.type,
          source: sk.source ?? 'manual',
          body: sk.body,
          // Same rule as SkillsService.create: a non-manual skill lands unvetted.
          // The demo's "Test Coverage Nudge" stays linked, but the reviewer
          // ignores it until someone reads and enables it on /skills.
          enabled: (sk.source ?? 'manual') === 'manual',
        })
        .returning();
      if (inserted) {
        await db
          .insert(t.skillVersions)
          .values({
            skillId: inserted.id,
            version: 1,
            body: inserted.body,
          })
          .onConflictDoNothing();
      }
    }
  }
  const skillRows = await db
    .select()
    .from(t.skills)
    .where(eq(t.skills.workspaceId, workspaceId));
  const skillByName = (n: string) => skillRows.find((s) => s.name === n)!;

  // ---- link skills to agents (mixed enabled) ----
  const skillLinks: Array<{ agent: string; skill: string; order: number; enabled: boolean }> = [
    { agent: 'General Reviewer', skill: 'Bug & Correctness Rubric', order: 0, enabled: true },
    { agent: 'General Reviewer', skill: 'Readability Rubric', order: 1, enabled: true },
    { agent: 'General Reviewer', skill: 'Repo Naming Conventions', order: 2, enabled: false },
    { agent: 'Security Reviewer', skill: 'Lethal Trifecta Guard', order: 0, enabled: true },
    { agent: 'Security Reviewer', skill: 'Error Handling Convention', order: 1, enabled: false },
    { agent: 'Performance Reviewer', skill: 'Payments Domain Notes', order: 0, enabled: true },
    { agent: 'Test Quality Reviewer', skill: 'Test Completeness & Edge Cases Rubric', order: 0, enabled: true },
    { agent: 'Test Quality Reviewer', skill: 'Overmocking & Fragile Test Guard', order: 1, enabled: true },
    { agent: 'Test Quality Reviewer', skill: 'Async & Flakiness Convention', order: 2, enabled: true },
    { agent: 'Test Quality Reviewer', skill: 'Test Coverage Nudge', order: 3, enabled: true },
  ];
  for (const l of skillLinks) {
    await db
      .insert(t.agentSkills)
      .values({ agentId: agentByName(l.agent).id, skillId: skillByName(l.skill).id, order: l.order, enabled: l.enabled })
      .onConflictDoNothing();
  }

  // ---- demo agent_runs (+reviews/findings) so the Stats tab & cards render ----
  // Only seed once (idempotent): skip if this workspace already has runs.
  const existingRuns = await db
    .select({ id: t.agentRuns.id })
    .from(t.agentRuns)
    .where(eq(t.agentRuns.workspaceId, workspaceId));
  if (existingRuns.length === 0) {
    const DAY = 24 * 3600 * 1000;
    const now = Date.now();
    const sevCat: Array<{ severity: string; category: string }> = [
      { severity: 'CRITICAL', category: 'security' },
      { severity: 'WARNING', category: 'perf' },
      { severity: 'SUGGESTION', category: 'style' },
      { severity: 'WARNING', category: 'correctness' },
      { severity: 'SUGGESTION', category: 'maintainability' },
    ];

    async function insertRun(spec: {
      agentName: string;
      daysAgo: number;
      score: number;
      costUsd: number;
      durationMs: number;
      tokensIn: number;
      tokensOut: number;
      findings: number;
      /** Seed a run_traces row too, so "View trace" is demoable on this run. */
      withTrace?: boolean;
    }) {
      const agent = agentByName(spec.agentName);
      const ranAt = new Date(now - spec.daysAgo * DAY);
      const [run] = await db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: agent.id,
          prId: pr!.id,
          ranAt,
          provider: agent.provider,
          model: agent.model,
          durationMs: spec.durationMs,
          tokensIn: spec.tokensIn,
          tokensOut: spec.tokensOut,
          costUsd: spec.costUsd,
          status: 'done',
          source: 'local',
          findingsCount: spec.findings,
          score: spec.score,
        })
        .returning();
      if (spec.findings > 0) {
        const [review] = await db
          .insert(t.reviews)
          .values({
            workspaceId,
            prId: pr!.id,
            agentId: agent.id,
            runId: run!.id,
            // Backdate to the run's time. Left at the now() default, every demo
            // review would outrank the original seeded review in the
            // "latest review by created_at" lookups (PR list score/findings,
            // PR detail), replacing PR #482's canonical findings.
            createdAt: ranAt,
            kind: 'review',
            verdict: spec.score >= 75 ? 'approve' : 'request_changes',
            summary: `${agent.name} run: ${spec.findings} finding(s).`,
            score: spec.score,
            model: agent.model,
          })
          .returning();
        await db.insert(t.findings).values(
          Array.from({ length: spec.findings }, (_, i) => {
            const sc = sevCat[i % sevCat.length]!;
            return {
              reviewId: review!.id,
              file: `src/mod${i}.ts`,
              startLine: 10 + i,
              endLine: 10 + i,
              severity: sc.severity,
              category: sc.category,
              title: `${sc.category} issue #${i + 1}`,
              rationale: 'Seeded demo finding.',
              confidence: 0.8,
            };
          }),
        );
      }
      if (spec.withTrace) {
        await db.insert(t.runTraces).values({
          runId: run!.id,
          trace: {
            config: {
              agent: agent.name,
              version: String(agent.version),
              provider: agent.provider,
              model: agent.model,
              pr: pr!.number,
              source: 'local',
            },
            stats: {
              duration_ms: spec.durationMs,
              tokens_in: spec.tokensIn,
              tokens_out: spec.tokensOut,
              cost_usd: spec.costUsd,
              findings: spec.findings,
              grounding: `${spec.findings}/${spec.findings} passed`,
            },
            prompt_assembly: {
              system: agent.systemPrompt,
              skills: null,
              memory: null,
              specs: null,
              callers: null,
              repo_map: null,
              pr_description: null,
              user: `Review the diff for PR #${pr!.number}.`,
            },
            tool_calls: [
              { tool: 'read_diff', args: `pr=${pr!.number}`, meta: null, ms: 40 },
              { tool: 'ground_findings', args: `n=${spec.findings}`, meta: null, ms: 25 },
            ],
            raw_output: `Seeded demo trace: ${spec.findings} grounded finding(s).`,
            memory_pulled: [],
            specs_read: [],
            log: [
              { t: '00.00', kind: 'info', msg: 'Run started (seeded demo).' },
              { t: '00.31', kind: 'tool', msg: 'read_diff' },
              {
                t: String((spec.durationMs / 1000).toFixed(2)),
                kind: 'result',
                msg: `Done — ${spec.findings} finding(s), score ${spec.score}.`,
              },
            ],
          },
        });
      }
    }

    // General Reviewer: 14 runs over ~7 weeks (>10 so cost/score trends render).
    const genOffsets = [2, 5, 9, 13, 18, 22, 26, 30, 34, 38, 42, 45, 47, 49];
    for (let i = 0; i < genOffsets.length; i++) {
      await insertRun({
        agentName: 'General Reviewer',
        daysAgo: genOffsets[i]!,
        score: 60 + ((i * 7) % 35),
        costUsd: 0.02 + (i % 5) * 0.01,
        durationMs: 9000 + (i % 6) * 2500,
        tokensIn: 4000 + i * 250,
        tokensOut: 900 + i * 60,
        findings: i % 3 === 0 ? 3 : i % 3 === 1 ? 1 : 0,
        withTrace: i < 5,
      });
    }
    // Security Reviewer: 4 runs.
    const secOffsets = [3, 12, 20, 33];
    for (let i = 0; i < secOffsets.length; i++) {
      await insertRun({
        agentName: 'Security Reviewer',
        daysAgo: secOffsets[i]!,
        score: 70 + i * 5,
        costUsd: 0.03 + i * 0.005,
        durationMs: 12000 + i * 1500,
        tokensIn: 5200 + i * 300,
        tokensOut: 1100 + i * 80,
        findings: i === 0 ? 2 : 1,
        withTrace: i < 2,
      });
    }
    // Performance Reviewer: 3 runs.
    const perfOffsets = [4, 16, 28];
    for (let i = 0; i < perfOffsets.length; i++) {
      await insertRun({
        agentName: 'Performance Reviewer',
        daysAgo: perfOffsets[i]!,
        score: 65 + i * 8,
        costUsd: 0.04 + i * 0.006,
        durationMs: 14000 + i * 2000,
        tokensIn: 6000 + i * 400,
        tokensOut: 1300 + i * 90,
        findings: i === 1 ? 2 : 1,
        withTrace: i < 2,
      });
    }
    // Test Quality Reviewer: 3 runs.
    const testOffsets = [1, 10, 21];
    for (let i = 0; i < testOffsets.length; i++) {
      await insertRun({
        agentName: 'Test Quality Reviewer',
        daysAgo: testOffsets[i]!,
        score: 75 + i * 6,
        costUsd: 0.025 + i * 0.005,
        durationMs: 11000 + i * 1800,
        tokensIn: 4800 + i * 350,
        tokensOut: 1050 + i * 75,
        findings: i === 0 ? 2 : 1,
        withTrace: i < 2,
      });
    }
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
