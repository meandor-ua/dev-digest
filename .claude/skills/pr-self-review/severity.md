# Severity rubric and finding schema

This file is verbatim text: inject it into every subagent's prompt unchanged
(quote it, don't paraphrase it) so all buckets and the merge step score
findings against the exact same rubric. None of the vendored reviewer skills
define a severity tier — they are hash-pinned and out of scope for editing —
so this repo's own tiers live here instead.

## Severity tiers

- **blocker** — a correctness bug, a security finding, or a violation of a
  rule this repo states as hard (an onion-architecture iron law, a
  frontend-architecture placement rule, a do-not-touch violation, a failed
  deterministic gate). Requires a `file:line` inside the *changed* lines and a
  concrete failure scenario ("this throws when X", "this leaks Y to Z"), not a
  restatement of a guideline. If you cannot point at the line and the failure,
  it is not a blocker — demote it.
- **should-fix** — real and worth doing, but not a correctness or security
  problem and not a stated hard rule. Style drift from a skill's guidance,
  missing test coverage for new branches, a naming-convention miss, a
  reasonable simplification. Goes in the report and, if a PR is opened, the PR
  body.
- **nit** — everything else worth mentioning but not worth a reader's
  attention individually: phrasing, minor formatting, personal preference.
  Collected and shown collapsed. Never blocks, never counts toward the verdict.

## Two demotions the dispatcher applies after merge (not the subagents)

Subagents report findings at whatever severity they judge; the dispatcher then
applies these two demotions before finalizing:

1. **No `file:line` inside the changed lines** — even if the finding looks
   like a blocker, it demotes out of `blocker`. A skill citing a *pattern* in
   the code without pointing at a specific line/range in the diff is advisory
   at best.
2. **Issue predates the diff** — the changed lines merely touch code that
   already had the problem, and the diff did not introduce or worsen it.
   Relabel `should-fix`, and prefix the finding text with `pre-existing:`.

## Calibration note

If a run routinely produces more than about two blockers, the rubric is
miscalibrated for this repo — tighten toward "few and certain" rather than
flagging everything a skill could theoretically object to. A blocker should
be a finding whoever opens the PR would want to see before anyone else does,
not a laundry list.

## Finding schema

Each subagent returns findings as a flat list, one object per finding:

```json
{
  "severity": "blocker | should-fix | nit",
  "bucket": "client | server | reviewer-core | e2e | shared",
  "skill": "the skill name whose rule this applies (e.g. onion-architecture)",
  "file": "path/relative/to/repo-root.ts",
  "line": "12 or 12-34",
  "summary": "one line: what is wrong",
  "evidence": "the actual code or command output that shows it, quoted",
  "why_it_breaks": "the concrete failure: which test, which runtime path, which rule",
  "pre_existing": false
}
```

Rules for filling it in:

- `file` and `line` are mandatory for `blocker`; omit only for `nit` findings
  that are about the change as a whole (e.g. "consider squashing these two
  commits" — which itself is out of scope, see SKILL.md).
- `evidence` must be something the merge step can check without re-reading the
  whole diff: a quoted line, a quoted deterministic-gate failure, a quoted
  rule from the skill file.
- `skill` lets the merge step dedupe: two buckets citing the same
  `file:line` for the same underlying issue (e.g. `typescript-expert` and
  `react-best-practices` both flagging the same `any`) collapse into one
  finding that lists both skills.
- Deterministic-gate failures are not subagent findings — the dispatcher
  emits them directly, before any subagent runs, using this same schema with
  `skill: "deterministic-gate"`. They are emitted at the tier routing.md
  assigns each check: failed typecheck/lint/test and do-not-touch violations
  are `blocker`; the convention checks (import extensions, test naming,
  missing co-located test) are `should-fix`. Being deterministic makes a
  finding certain, not severe.
