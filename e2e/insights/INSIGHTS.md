# Insights — e2e

Non-obvious findings and gotchas. Add an entry whenever something surprised
you, so the next agent/session doesn't relearn it.

## What Doesn't Work

- **2026-09-21** — Clicking anything after opening the run-trace drawer
  (`View trace`) fails. The drawer stays open as an overlay, so e.g.
  `find role button click --name Evals` errors, and no existing flow has a
  close step to copy. Put drawer-opening steps last in a flow. Evidence:
  `specs/12-agent-detail.flow.json` (trace steps at the end).
- **2026-09-18** — `find text X click` right after `wait --url` (no
  intervening `wait --text X`) is a real race against the PR list's async
  fetch — reproduced consistently (not a one-off flake) against the hermetic
  stack: `04-pr-findings.flow.json` and `05-pr-diff.flow.json` both failed on
  "open the PR row" every run until a `wait --text "Add rate limiting to
  public API endpoints"` step was inserted before the `find...click`,
  matching the pattern flow 02 already used (`02-repo-pulls-detail.flow.json`:
  `wait --text` at lines 22-23, before its `find` at 63).
  `find` locates and acts immediately; only `wait` polls for an element to
  appear. Every new flow that opens a PR row should copy flow 02's
  wait-then-click order, not flow 04/05's original (buggy) order.
- **2026-09-18** — `agent-browser find text "X" click` fails to resolve a
  click target when `"X"` is a bare text node sibling to other elements
  inside the same clickable container (e.g. `<button><Icon/><span>{count}</span>{label}</button>`),
  even though `wait --text "X"` (existence-only) succeeds against the exact
  same DOM. Wrapping the label in its own `<span>{label}</span>` fixed it
  immediately. Evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/SeverityFilterPills.tsx:41`.
  For any future flow driving a click via `find text`, prefer text that's
  already an element's sole/direct child over text mixed with sibling nodes.

## Tool & Library Notes

- **2026-09-18** — `agent-browser get count <selector>` (e.g.
  `[data-finding-id]`) plus `"assert": {"stdoutIncludes": "N"}` is a clean,
  deterministic way to prove something disappeared from the DOM after an
  interaction (a real element-count drop), instead of trying to assert
  *absence* of specific text — `agent-browser`'s command model has no
  built-in "assert text is NOT present" primitive; presence is inferred
  through `wait --text`, but there's no symmetric wait-for-gone documented.
  Requires the component under test to already expose a stable, countable
  attribute (`data-finding-id` on `FindingCard`, pre-existing:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:55`).

- **2026-09-18** — `agent-browser find text "Configure agents" click` fails
  against a menu item whose label is `Configure agents…` (U+2026 ellipsis) —
  `find text` did not resolve the partial string here. `find role button
  click --name "Configure agents…"` (full label, real ellipsis character)
  works. Prefer `find role … --name` over `find text` for anything whose
  visible label comes from `messages/en/*.json`, since those strings carry
  typographic characters (…, —, ’) that are easy to mistype in a flow.
  Evidence: `e2e/specs/09-pr-list-actions.flow.json:77-87`.
- **2026-09-18** — `get count "<css>"` + `assert.stdoutIncludes` is enough to
  assert **column ORDER** deterministically, without any new runner
  capability: a selector like `[data-testid='cost-cell']:nth-child(7)`
  matches only when that cell really is the 7th child of its row. That is
  how flow 02 pins the PR table's new order
  (`e2e/specs/02-repo-pulls-detail.flow.json:28-60`). Note the assertion is a
  substring check, so it is only trustworthy when the expected count is a
  single digit that cannot be a prefix of a larger real count (the seed has
  exactly one PR row, so "1" is safe here).
- **2026-09-18** — those `role="menu"` /
  `role="menuitem"` attributes have since been REMOVED from
  `client/src/vendor/ui/kit/Dropdown.tsx:133-139`: none of the keyboard contract the
  ARIA menu pattern promises (arrow keys, focus move on open, Escape,
  `aria-haspopup`/`aria-expanded` on the trigger) is implemented, so the roles
  announced a widget that doesn't behave like one. Dropdown items are plain
  buttons again → locate them with `find role button --name "…"`, and the menu
  container via its stable `[data-testid='dropdown-menu']` (flow 09 uses
  `body > [data-testid='dropdown-menu']` to prove the portal, at
  `e2e/specs/09-pr-list-actions.flow.json:66-76`). The underlying
  lesson still holds: an explicit `role` on a native element hides its implicit
  role from `find role`, so re-run the flows after any a11y-role change.
- **2026-09-18** — `wait --text` matches RENDERED text, not the DOM's source
  casing: `wait --text "Timeline"` times out against `SectionLabel`, whose CSS
  uppercases its children — `wait --text "TIMELINE"` passes against the exact
  same markup. Any label styled with `text-transform` must be waited on in its
  rendered form. Evidence: `e2e/specs/10-timeline-commit-row.flow.json:13`.
- **2026-09-18** — lucide-react re-exports some icon names as ALIASES, and the
  generated `lucide-*` class follows the ALIAS TARGET, not the imported name:
  `Icon.GitCommit` renders `class="lucide-git-commit-horizontal lucide"`, so
  `get count "svg.lucide-git-commit"` returns 0. Prefer a prefix match —
  `svg[class*='lucide-git-commit']` — for any icon-based selector, so a lucide
  bump that re-points an alias can't silently zero out a count assertion.
  Evidence: `e2e/specs/10-timeline-commit-row.flow.json:15`.

## Codebase Conventions

- **2026-09-21** — `server/src/db/seed.ts` seeds demo `agent_runs` (General
  Reviewer ×14 over ~7 weeks, Security ×4, Performance ×3, Test Quality ×3,
  all `status='done'`, on PR #482) and `run_traces` for the first few of each
  (`withTrace`), so the Agents Stats tab, card stats and "View trace" work in
  e2e — flow `12-agent-detail` opens a seeded trace ("Prompt assembly"). The
  canonical seeded *review* row still has no `run_id`
  (`server/src/db/seed.ts:136-147`), so PR #482's Timeline shows COMMIT rows
  only and the run-row widgets (share link, per-run trace button, severity
  chips) are absent. Reaching them needs a live model call, which flows may
  not make — cover them with client unit tests (`RunHistory.test.tsx`).
  Evidence: `server/src/db/seed.ts` (`insertRun`, `withTrace`),
  `e2e/specs/12-agent-detail.flow.json`.
- **2026-09-21** — Repo-scoped Agents UI resolves its repo via `useActiveRepo()`
  (`client/src/lib/repo-context.tsx`: URL `:repoId` > localStorage > first repo
  from the API), so on the `:repoId`-less `/agents` routes it falls back to the
  first/only seeded repo (`acme/payments-api`). That's why flow `12`'s Stats tab
  loads without a repo in the URL — it only works because the hermetic DB has
  exactly one repo. Evidence: `e2e/specs/12-agent-detail.flow.json`.

## Open Questions

- **2026-09-22** — Flow 09 fails deterministically at "it navigates to the
  agents screen" (`agent-browser wait --url /agents` times out after picking
  "Configure agents…"), and it fails identically on a clean `HEAD` of
  `feature/L02-skills-and-CLAUDE-md-commands` (verified with all local changes
  stashed), so it predates the Skills-editor work; flows 03 and 12 reach
  `/agents` fine. Root cause not yet investigated — the menu item calls
  `router.push("/agents")` (`client/src/components/run-review-dropdown/RunReviewDropdown.tsx:97`).
  Evidence: `e2e/specs/09-pr-list-actions.flow.json:77-95`.

- **2026-09-22** — Follow-up on flow 09: it still fails after the
  pr-self-review fix pass, and fails the same way with those fixes stashed.
  Leading hypothesis, not yet verified: this branch added `maxHeight: 320` and
  `overflowY: auto` to the vendored `Dropdown`. With five seeded agents as
  two-line items, "Configure agents…" sits below the menu's fold.
  agent-browser's scroll-into-view then likely scrolls an ancestor too, and the
  portaled menu's capture-phase close-on-scroll dismisses it before the click.
  To confirm, raise `maxHeight` for `RunReviewDropdown`, or scroll the menu
  before clicking in the flow. Evidence: `client/src/vendor/ui/kit/Dropdown.tsx`
  (`maxHeight = 320`).
- **2026-09-22** — RESOLVED (supersedes the two flow-09 entries above).
  Measured on the hermetic stack: the Run Review menu was 318px tall with 444px
  of content and ran past a 633px viewport (menu bottom 673). "Configure
  agents…" sat at y=754. agent-browser's click scrolled it into view, and a
  scroll outside the menu closes a portaled `Dropdown`, so the click missed
  and the URL never changed. A real UI bug, not a flaky flow. Fixed in the
  component, not the flow: `portalPosition()` caps the menu's `maxHeight` to
  the viewport room (or flips it above). 12/12 flows pass. To debug a flow
  interactively, run a copy of `scripts/e2e.sh` whose final `npm test` line
  is replaced by a wait loop, then drive `agent-browser` against :3100.
  Evidence: `client/src/vendor/ui/kit/Dropdown.tsx` (`portalPosition`).
