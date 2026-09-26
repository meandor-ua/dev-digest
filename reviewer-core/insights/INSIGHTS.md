# Insights — reviewer-core

Non-obvious findings and gotchas. Add an entry whenever something surprised
you, so the next agent/session doesn't relearn it.

## Recurring Errors & Fixes

- **2026-09-17** (corrected 2026-09-21) — `reviewer-core/` is **npm**-managed
  (`package-lock.json`, no pnpm lockfile or `pnpm-workspace.yaml`): use
  `npm install` / `npm test`, which run clean (25/25 on 2026-09-21). Running
  `pnpm` here by habit (as in `client/`/`server/`) fails with
  `ERR_PNPM_IGNORED_BUILDS` — esbuild's postinstall is blocked because only
  those two packages carry an `allowBuilds` block
  (`client/pnpm-workspace.yaml:1-2`, `server/pnpm-workspace.yaml:1,3`). Don't
  add one here; switch to npm. General playbook:
  `.claude/skills/esbuild-arch-mismatch/SKILL.md:1`.
- **2026-09-18** — Nothing told the model which language to write in, so
  DeepSeek (`deepseek/deepseek-v4-flash`) reviewed an English PR entirely in
  Chinese — valid UTF-8, not an encoding bug, just the model's default. The
  fix is a trusted `OUTPUT_LANGUAGE` system rule pinning summary / titles /
  rationale / suggestions to English (code and identifiers verbatim), kept
  SEPARATE from the do-not-touch `INJECTION_GUARD` and appended after it, so it
  applies to every path (studio server and CI) via `assemblePrompt`. Reviews
  already stored in another language stay as they are; only new runs change.
  Evidence: `reviewer-core/src/prompt.ts:35`, `reviewer-core/src/prompt.ts:97`.
