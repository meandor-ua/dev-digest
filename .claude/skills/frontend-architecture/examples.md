# Examples — frontend-architecture

Before/after pairs for the rules in `SKILL.md`. Each pair changes *where code
lives*, not what it does.

---

## 1. Fat route component → thin page + view-model hook + leaf

**Before** — `app/repos/[repoId]/pulls/[number]/page.tsx`: fetching, domain
rules, and markup in one file.

```tsx
"use client";
export default function PullPage() {
  const { repoId, number } = useParams();
  const { data: pull } = useQuery({ queryKey: ["pull", repoId, number], … });
  const { data: findings } = useQuery({ queryKey: ["findings", repoId, number], … });

  // domain rules, inline
  const blockers = (findings ?? []).filter(
    (f) => f.severity === "critical" && !f.dismissedAt,
  );
  const verdict = blockers.length > 0 ? "request_changes" : "approve";

  return (
    <main>
      <h1>{pull?.title}</h1>
      <span style={{ color: verdict === "approve" ? "var(--ok)" : "var(--crit)" }}>
        {verdict === "approve" ? "Approved" : "Changes requested"}
      </span>
      {blockers.map((f) => ( /* 60 lines of finding markup */ ))}
    </main>
  );
}
```

**After** — three files, one job each.

```ts
// src/lib/findings.ts — layer 1: domain. No React, no next/*.
export const isBlocking = (f: Finding) =>
  f.severity === "critical" && f.dismissedAt === null;

export const verdictFor = (findings: Finding[]): Verdict =>
  findings.some(isBlocking) ? "request_changes" : "approve";
```

```ts
// app/repos/[repoId]/pulls/[number]/_hooks/usePullReview.ts — layer 3
"use client";
export function usePullReview(repoId: string, number: number) {
  const pull = usePullDetail(repoId, number);
  const findings = useFindings(repoId, number);
  const list = findings.data ?? [];
  return {
    pull: pull.data,
    blockers: list.filter(isBlocking),
    verdict: verdictFor(list),
    isLoading: pull.isLoading || findings.isLoading,
  };
}
```

```tsx
// page.tsx — layer 4: routing + composition only
"use client";
export default function PullPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const { pull, blockers, verdict, isLoading } = usePullReview(repoId, Number(number));
  if (isLoading) return <Skeleton />;
  return (
    <PageShell title={pull.title}>
      <VerdictBanner verdict={verdict} />
      <FindingsPanel findings={blockers} />
    </PageShell>
  );
}
```

`verdictFor` is now testable with an array and no renderer. `VerdictBanner`
receives a *derived* prop and never learns the rule.

---

## 2. A metadata map duplicated in two files → one owner

This one really happened here (`client/INSIGHTS.md:53-55`): a local
`VERDICT_COLOR` in `ReviewRunAccordion.tsx` disagreed with
`VerdictBanner/constants.ts`'s `VERDICT_META` for the same verdict, so the
same run rendered two different colours in two panels.

**Before**

```ts
// _components/VerdictBanner/constants.ts
export const VERDICT_META: Record<Verdict, { c: string; bg: string; icon: IconName }> = {
  request_changes: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" },
  approve:         { c: "var(--ok)",   bg: "var(--ok-bg)",   icon: "CheckCircle" },
  comment:         { c: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" },
};
```

```tsx
// _components/ReviewRunAccordion/ReviewRunAccordion.tsx — a second, drifting copy
const VERDICT_COLOR = {
  request_changes: "var(--crit)",
  approve: "var(--ok)",
  comment: "var(--muted)",   // ← disagrees: amber elsewhere
};
```

**After** — single-writer rule. One owning module, everyone imports it.

```tsx
// _components/ReviewRunAccordion/ReviewRunAccordion.tsx
import { VERDICT_META } from "../VerdictBanner/constants";

<Dot style={{ background: VERDICT_META[run.verdict].c }} />
```

If two component folders need it and neither owns it, promote the map to the
feature's `constants.ts` and have both import from there — but promote it
*once*, never copy it.

---

## 3. A `utils.ts` dumping ground → util / helper / domain module

**Before** — `src/utils.ts`, 400 lines, no membership criterion.

```ts
export function clamp(n: number, min: number, max: number) { … }
export function lineLabel(f: Finding) { return `${f.path}:${f.line}`; }
export async function fetchRunCost(runId: string) {
  const res = await fetch(`/api/runs/${runId}/cost`);
  return res.json();
}
export function useDebounced<T>(value: T, ms: number) { /* useState + useEffect */ }
```

**After** — four destinations, decided by what each may import.

```ts
// src/utils/number.ts — util: domain-agnostic, publishable as-is
export const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);
```

```ts
// _components/FindingCard/helpers.ts — helper: pure, knows a domain type
export const lineLabel = (f: Finding) => `${f.path}:${f.line}`;
```

```ts
// src/lib/cost.ts — domain module: business operation, async, no React
export const fetchRunCost = (runId: string) => api.get<RunCost>(`/runs/${runId}/cost`);
```

```ts
// src/lib/hooks/useDebounced.ts — it imports React, so it's a hook, not a util
```

`src/utils.ts` is then deleted, not left as a re-export shim.

---

## 4. Premature shared component → demoted back to route-local

**Before** — `src/components/agent-run-badge/` exists, and `grep -rn
"agent-run-badge" src` returns one consumer.

```
src/components/agent-run-badge/
  AgentRunBadge.tsx      ← imported only by app/agents/_components/AgentCard
  index.ts
  styles.ts
```

**After** — one consumer means it was never shared. Move it in.

```
app/agents/_components/AgentCard/
  AgentCard.tsx
  AgentRunBadge.tsx      ← private to the folder; not re-exported from index.ts
  index.ts
  styles.ts
```

The demotion test is mechanical: **count distinct consuming directories.** One
→ demote. It re-graduates the day a second route imports it, and that move is
cheap precisely because nothing outside the folder ever imported it.

---

## 5. `'use client'` at the page root → pushed to the interactive leaf

**Before** — one `useState` for a dropdown makes the whole subtree client-side.

```tsx
// app/repos/[repoId]/page.tsx
"use client";
export default function RepoPage({ params }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <main>
      <RepoSummary repo={repo} />      {/* static, but now client */}
      <PrTable rows={rows} />          {/* static, but now client */}
      <button onClick={() => setMenuOpen(!menuOpen)}>Actions</button>
      {menuOpen && <ActionsMenu />}
    </main>
  );
}
```

**After** — the directive moves down to the only component that needs it.

```tsx
// app/repos/[repoId]/page.tsx — no directive: server component
export default async function RepoPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  const repo = await getRepo(repoId);      // DAL, server-only
  return (
    <main>
      <RepoSummary repo={repo} />
      <PrTable rows={repo.pulls} />
      <RepoActionsMenu repoId={repoId} />
    </main>
  );
}
```

```tsx
// app/repos/[repoId]/_components/RepoActionsMenu/RepoActionsMenu.tsx
"use client";
export function RepoActionsMenu({ repoId }: { repoId: string }) {
  const [open, setOpen] = useState(false);
  …
}
```

Placement rule only: the *semantics* of `'use client'` belong to
`next-best-practices`.

---

## 6. Domain logic in JSX → a pure function, tested without rendering

**Before**

```tsx
<Badge>
  {run.status === "completed"
    ? run.findings.filter((f) => f.severity === "critical" && !f.dismissedAt).length > 0
      ? "Blocked"
      : run.findings.length > 0
        ? "Warnings"
        : "Clean"
    : run.status === "failed"
      ? "Failed"
      : "Running"}
</Badge>
```

**After**

```ts
// src/lib/findings.ts
export type RunOutcome = "blocked" | "warnings" | "clean" | "failed" | "running";

export function runOutcome(run: ReviewRun): RunOutcome {
  if (run.status === "failed") return "failed";
  if (run.status !== "completed") return "running";
  if (run.findings.some(isBlocking)) return "blocked";
  return run.findings.length > 0 ? "warnings" : "clean";
}
```

```tsx
<Badge>{t(OUTCOME_META[runOutcome(run)].labelKey)}</Badge>
```

```ts
// src/lib/findings.test.ts — no renderer, no mocks
it("is blocked when a non-dismissed critical exists", () => {
  expect(runOutcome(run({ findings: [critical()] }))).toBe("blocked");
});
```

The nested ternary was untestable without mounting a tree; the pure function
is five assertions. `OUTCOME_META` is the single owning constant for the
label and colour of each outcome.
