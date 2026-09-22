---
name: pr-self-review
disable-model-invocation: true
description: Local pre-PR gatekeeper for this repo. Resolves the branch diff against main (plus any uncommitted work), runs the affected packages' own typecheck/lint/test commands, then routes each changed file to the matching review skills: client to frontend-architecture, react-best-practices, next-best-practices and react-testing-library; server to onion-architecture, fastify-best-practices, drizzle-orm-patterns and postgresql-table-design; shared code to typescript-expert, zod and security. Merges their findings into one verdict. A blocker is a correctness, security or stated-rule violation evidenced at file:line inside the changed lines; everything else is advisory. Use before opening a pull request, or on "review my changes", "self review", "am I ready to push", or /pr-self-review. Reports only: it never edits code, commits, pushes or opens the PR.
---

# PR self-review

A dispatcher, not another reviewer skill. This repo already has specialized
skills for every package (`onion-architecture`, `frontend-architecture`,
`fastify-best-practices`, and the rest) but nothing that decides *which of
them apply to this change* and runs them together before a PR goes up. Today
a reviewer skill only fires if the model happens to think it's relevant, one
skill at a time, on whichever file is open. `pr-self-review` resolves the
whole change-set, runs this repo's own deterministic checks first, fans the
change out across the matching skills in parallel, and merges everything into
one verdict.

**Lesson limitation, stated plainly:** this is a skill only. There is no
`.claude/settings.json` hook, no `PreToolUse` gate, no `pre-push` hook in this
lesson. This skill therefore *reports* a verdict and states it clearly; it
cannot hard-block `git push` or opening a PR. Treat the verdict as something
you act on, not something the tooling enforces for you.

**This skill is the authorization to use the Agent/Task tool for its fan-out
step.** Root `AGENTS.md` says not to reach for subagents unless a skill asks
for them — Step 3 below is that ask, and only for the parallel per-bucket
review pass, nothing else in this repo.

## When to use this

Before opening a pull request, on "review my changes", "self review", "am I
ready to push", or `/pr-self-review`. Run it after your own edits are done,
not mid-edit — it reviews a settled diff, not a moving one.

## Step 0 — resolve the change-set

```sh
git merge-base main HEAD          # base, if it exists
git diff <base>...HEAD --name-status   # committed work on this branch
git diff HEAD --name-status            # uncommitted work, if the tree is dirty
```

The change-set is the union of both. Report which of the two contributed
(committed-only, uncommitted-only, or both) so the reader knows what was
actually reviewed.

Handle these explicitly — each one silently produces a false pass if ignored:

- **Empty change-set** (nothing committed on the branch, nothing dirty) — say
  so loudly and stop with an advisory "nothing to review", never "looks good".
- **No merge-base with `main`, or detached HEAD** — state it, fall back to
  `git diff HEAD --name-status` (uncommitted work only) and say the review is
  therefore partial.
- **Deleted or renamed files** — route on the *new* path; don't review deleted
  content.
- **Binary files** — list them, skip content review.
- **Diff over a sane size budget** (a few thousand changed lines) — review the
  highest-risk buckets first (server, then client, then the rest) and name
  exactly what was skipped in the final report. Never silently truncate.

## Step 1 — deterministic gates, before any LLM pass

Run only for packages the change-set actually touches, using each package's
own manager and scripts exactly as `AGENTS.md`'s command table defines them:

| Touched package | Commands |
|---|---|
| `client/` | `pnpm typecheck`, `pnpm lint`, `pnpm test` |
| `server/` | `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| `reviewer-core/` | `npm run typecheck`, `npm run lint`, `npm test` |
| `e2e/` | `npm run typecheck`, `npm run lint` |

Two things are deliberate, not omissions:

- `e2e`'s own `test` script (`tsx run.ts`) is the real browser flow and is
  **not** run here — it needs the hermetic stack via `./scripts/e2e.sh` from
  the root, which is a separate, slower step outside this skill's scope.
- `server`'s `*.it.test.ts` files are excluded because they need Docker and
  already run in `server-integration.yml`; a plain `pnpm test` would try to
  spin up testcontainers mid-review.

A gate failure is a **blocker**, full stop, no LLM judgement involved — use
the finding schema in [severity.md](severity.md) with `skill:
"deterministic-gate"`. If a command fails with an esbuild CPU-architecture
error, hand off to the `esbuild-arch-mismatch` skill instead of improvising a
fix.

Also in this step, run the git-only convention checks from
[routing.md](routing.md) (do-not-touch violations, vendor-copy drift,
lockfile edits, import-extension convention, test naming). These need no
toolchain and run alongside the package gates.

## Step 2 — route the change-set to skills

Look up each changed path in the table in [routing.md](routing.md) and group
files into buckets (`client`, `server`, `reviewer-core`, `e2e`, `shared`).
Preserve the one cross-package edge that's easy to miss: a
`reviewer-core/**`-only change still opens the **server** bucket too, because
`server/tsconfig.json:24` aliases `@devdigest/reviewer-core` straight to
`../reviewer-core/src` — a break there only surfaces in `server`'s typecheck.

Drop any bucket with zero files. Don't invent a bucket the diff doesn't touch.

## Step 3 — fan out one subagent per non-empty bucket

Launch one Task subagent per bucket, all in a single message, so they run in
parallel. Give each subagent:

- only its bucket's diff (file list + content), not the whole change-set;
- the exact skill names from [routing.md](routing.md) to load for that bucket;
- the rubric and finding schema from [severity.md](severity.md), injected
  verbatim, not paraphrased;
- an instruction to return findings only — no edits, no fixes applied.

This fan-out is the subagent use this skill authorizes (see above). Nothing
else in this workflow needs a subagent — Steps 0, 1, 2, 4 and 5 run directly.

**Inline mode.** If the user has asked for no subagents (token budget), run
this step in the main session instead: one bucket at a time, load each
bucket's skills **once** (never also run a skill directly that a bucket
already loaded), and apply the same rubric. Deterministic gates and checks
(Steps 1–2) are unchanged.

## Step 4 — merge

Collect every bucket's findings and normalize them against the
[severity.md](severity.md) schema, then apply the two demotions defined
there (no `file:line` inside the changed lines; issue predates the diff).
Dedupe across buckets: `typescript-expert` and a framework skill frequently
flag the same line for related reasons — collapse those into one finding
that lists both skills, don't report it twice.

## Step 5 — verdict

Report, in order: which change-set was reviewed and how (Step 0), gate
results (Step 1), buckets that fired and why (Step 2), then findings grouped
`blocker` / `should-fix` / `nit` per [severity.md](severity.md). Write the
same data to `.devdigest/cache/pr-self-review/verdict.json` (already
gitignored, no new ignore rule needed) so a later lesson's hook can read a
stable verdict shape without this skill changing.

If blockers routinely exceed about two per run, say so in the report itself —
that's a sign the rubric or the routing is over-triggering, not that the PR
is unusually bad.

Close with one plain sentence: ready to push / fix the blockers first / fix
nothing but note the should-fixes. This is a recommendation, not an
enforced gate — see the lesson limitation above.

## Step 6 — close out

Invoke the `engineering-insights` skill per the root `AGENTS.md` standing
instruction if this run surfaced a non-obvious gotcha (a gate that needed a
workaround, a routing edge that was wrong, a false-positive pattern worth
recording).

## Staying in your lane

| Don't | Do |
|---|---|
| Edit the flagged code, "just fix it while reviewing" | Report findings; fixing is a separate, later pass the human or another skill does |
| Commit, push, or open the PR | Stop at the verdict; those actions are the human's call |
| Treat a should-fix or nit as blocking | Only Step 1 gate failures and Step 4's surviving blockers gate the verdict |
| Skip Step 1 and go straight to subagents | Deterministic gates always run first; they're cheaper and more certain than any LLM pass |
| Claim "looks good" on an empty or partial change-set | Say plainly what was and wasn't reviewed (Step 0) |

## See also

- [routing.md](routing.md) — path -> skill routing table, cross-package edge,
  deterministic convention checks.
- [severity.md](severity.md) — severity tiers, the two merge-time demotions,
  and the finding schema, written to be injected verbatim into subagent
  prompts.
