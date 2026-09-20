---
name: frontend-architecture
description: Defines where every frontend file belongs in a React + Next.js App Router codebase — a tiered colocate-then-graduate directory structure, a four-category component taxonomy, a constants placement ladder, the util/helper/domain-module split, and the layering that keeps business logic out of JSX. Use when creating a new component, hook, constant, type or pure function and deciding where it goes; when splitting a large component or file; when extracting duplication into a shared module; when reviewing or auditing a project's structure; when setting up a new Next.js app; or on "/frontend-architecture". Does not cover performance optimization; for in-component React rules (size limits, useEffect, memoization, container/presenter mechanics) see react-best-practices, for Next.js runtime semantics ('use client', RSC validity, data-fetching APIs, app/ special files) see next-best-practices, and for test placement see react-testing-library.
---

# Frontend architecture

**v1.0.0**

This skill owns exactly one question: **which file does this code go in, and
where does that file live?** Everything here is about boundaries *between*
files — placement, promotion, demotion, and the import rules that hold them
apart. It assumes you already know React and Next.js.

Structure is the cheapest architecture decision to get right and the most
expensive to retrofit, because every import statement written under the wrong
layout is a line that has to change later. The rules below are deliberately
mechanical: an agent should be able to apply them from a file path and an
import list, without taste.

## What this skill does NOT cover

Defer to the skill named, and do not re-litigate these here:

| Topic | Owner |
|---|---|
| Component size / prop-count limits, when to split | `react-best-practices` |
| Container-presenter mechanics, "logic in hooks not bodies" | `react-best-practices` |
| `useEffect`, derived state, memoization, keys, a11y | `react-best-practices` |
| `'use client'` / `'use server'` semantics, RSC validity | `next-best-practices` |
| Server Component vs Server Action vs Route Handler | `next-best-practices` |
| `app/` special files (`layout`, `error`, `loading`, …) | `next-best-practices` |
| Test file placement, naming, and RTL queries | `react-testing-library` |
| Performance — bundles, code-splitting, render cost | out of scope entirely |

This section is load-bearing. When one of those topics comes up, name the
owning skill instead of answering; a second opinion on the same rule is the
duplication this skill exists to prevent.

## 1. The one rule — colocate until it hurts, then graduate

Put code as close as possible to where it is used, and move it up only when
something forces you to. Colocation makes the blast radius of a change equal
to a single directory; the cost of being wrong is one `git mv`.

The inverse — hoisting everything into `components/`, `hooks/`, `utils/` on
day one — pays the abstraction cost before you know the abstraction. A shared
module with one consumer is not shared; it is a file moved away from its only
reader.

**DRY is a consequence of correct placement, not a license to abstract
early.** Two similar blocks in two routes are not yet duplication — they are
two call sites that may diverge. Wait for the third, or for a bug fixed in one
copy and not the other, then extract. Prefer duplication over the wrong
abstraction (Sandi Metz); prefer AHA — "avoid hasty abstractions" (Kent C.
Dodds).

## 2. "Where does this file go?" — the decision tree

Follow this for **every** new file. Answer top to bottom; stop at the first
match.

```
Is it a Next.js route file (page/layout/route/error/loading/template)?
  └─ yes → app/… at its route segment. Nothing else goes there.

Does exactly one route segment use it?
  └─ yes → TIER 1, colocated in that segment:
       component      → app/<route>/_components/<Name>/
       pure function  → app/<route>/_lib/<name>.ts  or  _components/<Name>/helpers.ts
       constant       → sibling constants.ts next to its only consumer
       type           → in the file that owns it; exported from there
       style          → sibling styles.ts next to its component
       data hook      → app/<route>/_hooks/ only if the route is its sole caller

Do 2+ routes in the same product area use it?
  └─ yes → TIER 2, the feature: src/features/<feature>/…
       reached only through src/features/<feature>/index.ts

Is it domain-agnostic — no app types, no feature imports, would make sense
in someone else's product?
  └─ yes → TIER 3, shared:
       renders UI, no domain knowledge      → src/components/ui/<Name>/
       renders UI, app-aware, cross-route   → src/components/<name>/
       pure function, no domain types       → src/utils/<topic>.ts
       business operation / API client      → src/lib/<domain>.ts
       env-derived or deploy-time value     → src/config/
       type shared by 2+ tiers              → src/types/ (or the contracts package)

Otherwise → you have not decided what it is. Go back to the top; do not
create a file whose location you cannot justify from an import list.
```

Two guards on this tree:

- **Never skip a tier on speculation.** New code starts at Tier 1 unless a
  second consumer already exists in the tree, today, in a different route.
- **Never place by file *kind* alone.** "It's a hook, so `hooks/`" is the
  failure mode this tree replaces. Placement is decided by *who consumes it*,
  not by what it is.

## 3. Tier 1 — route-local (the default)

```
app/(dashboard)/repos/[repoId]/
  page.tsx                 ← thin: routing, params, composition
  _components/PrHeader/
    PrHeader.tsx
    index.ts               ← the folder's public API
    styles.ts
    constants.ts
    helpers.ts
    PrHeader.test.tsx
  _lib/format-pr.ts
  _constants.ts
```

- A leading `_` marks the folder **private**: Next excludes it from routing,
  so `_components` can sit inside a route segment without becoming a URL.
  Use it for everything route-local that is not itself a route.
- `(group)` parentheses organize routes without adding a URL segment — use
  them to split a tree by layout or product area once a flat `app/` stops
  reading clearly.
- **`page.tsx` stays thin.** It reads params, calls one hook or one data
  function, and composes components. Business logic in a `page.tsx` is a
  placement bug, not a style preference.
- A component folder is the unit, not a file: one folder per component, and
  its `index.ts` is the only thing outsiders may import.

## 4. Tier 2 — the feature

```
src/features/pr-review/
  api/          ← requests + query/mutation hooks for this feature
  components/   ← components only this feature renders
  hooks/        ← view-model hooks
  model/        ← pure domain logic and types
  constants.ts
  index.ts      ← the public API — the ONLY legal import path
```

Rules, all checkable from an import statement:

- **`index.ts` is the boundary.** Outsiders import `@/features/pr-review`,
  never `@/features/pr-review/components/Foo`.
- **Features never import features.** If two need the same thing, that thing
  is Tier 3 — push it down to `src/`, or lift the composition up into the
  route that already knows about both.
- **Features may import Tier 3.** Flow is one-directional:
  `shared → features → app`.
- A feature that exports more than ~10 symbols is two features.

## 5. Tier 3 — shared

| Folder | Admits | Must not contain |
|---|---|---|
| `src/components/ui/` | Design-system primitives: Button, Badge, Dialog. Styling + a11y only | Any domain type, any fetch, any feature import |
| `src/components/<name>/` | App-aware components used by 2+ routes (page shell, app nav) | Feature-specific logic |
| `src/lib/` | Business/domain modules, the API client, providers, contexts | React components; `next/*` in the pure modules |
| `src/utils/` | Domain-agnostic pure functions (`clamp`, `groupBy`) | Anything importing `@/features` or app types |
| `src/config/` | Env-derived and deploy-time values, feature flags | Anything computed at render time |
| `src/types/` | Types crossing 2+ tiers | Hand-copied API contracts (import them) |

## 6. Graduation and demotion — testable triggers

| Move | Trigger (all must hold) |
|---|---|
| Tier 1 → Tier 2 | A second route, in a different part of the tree, imports it **today** — not "will". |
| Tier 2 → Tier 3 | It imports nothing from `features/` **and** its signature names no domain type. |
| Tier 3 → Tier 2 | A "shared" module's only importers are all inside one feature. |
| Tier 2 → Tier 1 | A feature export has exactly one consumer, in one route. |

**Demotion is a real operation, not a theoretical one.** Run the check with
your editor's find-references or `grep -rn "<name>" src app`: count *distinct
consuming directories*. One consumer means the module moves back down, into
that consumer. Shared folders that only ever grow are how a codebase acquires
a `components/` directory nobody dares delete from.

When you graduate a module, move it — do not leave a re-export behind. A
forwarding stub means two legal import paths for one module, and both will
end up used.

## 7. Component taxonomy — four categories

| Category | Knows domain types? | May fetch? | May hold state? | Lives in |
|---|---|---|---|---|
| **UI primitive** | No | No | Local UI state only (open, hover) | `src/components/ui/<Name>/` |
| **Shared composite** | Yes, via props only | No | Local UI state | `src/components/<name>/` |
| **Feature component** | Yes | Yes, via its feature's hooks | Yes | `src/features/<f>/components/` or `_components/` |
| **Route shell / page** | Yes | Yes (or delegates) | Routing/URL state | `app/<route>/page.tsx`, `layout.tsx` |

Read the table as a set of import bans: a UI primitive that imports a domain
type is misfiled and must move; a shared composite that calls a data hook is
a feature component wearing the wrong folder.

**This replaces atoms / molecules / organisms.** Atomic Design classifies by
visual size, which is not a property the compiler or the import graph can
check — everyone draws the molecule/organism line somewhere different, and a
component changes size without changing category. These four categories are
decided by *what a component is allowed to import*, which is mechanical and
lintable.

## 8. Constants — the placement ladder

Climb one rung only when the current rung fails:

1. **Inline literal** — used once, self-explanatory at the call site.
2. **Module-level `const`** — used 2+ times in one file, or a magic number
   that needs a name. Above the component, never inside it.
3. **Sibling `constants.ts`** — the component folder's own values: metadata
   maps, option lists, thresholds, labels.
4. **Feature `constants.ts`** — shared by 2+ modules inside one feature.
5. **`src/config/`** — env-derived, deploy-varying, or flag values. Read
   `process.env` in exactly one module and export typed values.
6. **CSS custom properties** — design tokens (colour, spacing, radius).
   Never hardcode a hex in a `.ts` constant; reference the token variable so
   theming keeps working.

Also:

- **Prefer `as const` objects over TS `enum`.** `enum` emits runtime code,
  has surprising numeric-member semantics, and is not erasable under
  type-stripping toolchains. `const X = { … } as const` plus
  `type X = (typeof X)[keyof typeof X]` gives the same safety and no runtime.
- **The single-writer rule: one constant, one owning module.** A second local
  copy of a mapping is a bug that has not fired yet — the copies disagree the
  first time one is edited. Everyone else imports from the owner.
- A constant keyed by a domain enum must be exhaustive (`Record<Verdict, …>`),
  so adding an enum member fails typecheck instead of rendering blank.

## 9. Utils vs helpers vs domain modules

The two words are used interchangeably almost everywhere, including inside
`react-best-practices`. Here they are three distinct things, separated by
what they are allowed to import:

| | Imports React/`next/*`? | Knows your domain types? | Side effects? | Lives in |
|---|---|---|---|---|
| **util** | No | No | No | `src/utils/<topic>.ts` |
| **helper** | No | Yes | No | colocated `helpers.ts`, graduates with its owner |
| **domain module / service** | **Never** | Yes | Allowed (async, I/O) | `src/lib/<domain>.ts` or feature `model/` |

- **util** — domain-agnostic and publishable to npm as-is: `clamp`,
  `groupBy`, `formatBytes`. If it names one of your types, it is not a util.
- **helper** — a pure function that knows your domain: `lineLabel(finding)`,
  `isBlocking(finding)`. It lives beside its only consumer and rides along
  when that consumer is promoted.
- **domain module / service** — a business operation: `computeRunCost(run)`,
  the API client, a DAL function. May be async. **Never imports React or
  `next/*`** — that ban is exactly what lets a Server Component and a client
  hook both call it.

Two hard rules:

- **Never create a `utils.ts` dumping ground.** Name files by topic
  (`date.ts`, `array.ts`, `cost.ts`), never by the fact that they contain
  functions. A file named `utils.ts` has no membership criterion, so nothing
  is ever wrong to add and nothing is ever removed.
- **A function that needs a React import is a hook, not a helper.** Name it
  `useX` and place it with the tree in §2.

## 10. Isolating business logic from the UI

Four layers, each importing only downward:

```
4. presentational components   JSX + props. No domain branching.
3. view-model hooks            useX(): wires layers 1-2 into props for layer 4.
2. data access                 server: DAL modules with `import 'server-only'`,
                               returning DTOs, not rows.
                               client: query/mutation hooks over one API client.
1. domain                      pure TS. No React, no next/*, no fetch.
```

Rules:

- **No domain `if`-chains inside JSX.** A ternary choosing a colour is fine;
  a ternary deciding whether a finding blocks a merge is domain logic in the
  view. Extract it to layer 1 and test it without rendering anything.
- **Components receive *derived* props.** Pass `isBlocking`, not `finding`
  plus the rules for reading it. The derivation happens once, in a hook or a
  domain function, not in every component that needs the answer.
- **The `'use client'` boundary sits at the leaves.** Interactivity is a leaf
  property; marking a page root client-side drags its whole subtree along.
- **The domain layer imports neither React nor `next/*`** — that is precisely
  why it is importable from both a Server Component and a client hook. Keep
  the ban even when one import would be convenient.
- **Server data access is its own module.** Put `import 'server-only'` at the
  top, return DTOs shaped for the view rather than raw rows, and keep
  database clients and secret env vars out of every file above it. Next.js
  names the Data Access Layer its recommended model for new projects; the
  auditable form of the rule is: *database packages and secret env vars are
  imported in exactly one directory.*

## 11. Boundaries and imports

- **Always the `@/` alias for anything outside the current folder; never
  `../../../..`.** Deep relatives encode the location of both files in a
  string, so either one moving breaks it silently, and they make a module
  un-greppable by consumer. One `../` to a sibling is fine.
- **Barrel policy.** One `index.ts` per module folder, re-exporting that
  folder's public API only. No global `src/components/index.ts`, and no
  re-export chains (`index.ts` → `index.ts` → file): they defeat
  tree-shaking, invite import cycles, and give every symbol several legal
  paths.
- **Unidirectional flow: `shared → features → app`.** Nothing in `src/lib`,
  `src/utils`, or `src/components/ui` may import from `features/` or `app/`.
  This is the one rule worth enforcing in ESLint — see `enforcement.md`.
- **Never hand-duplicate an API contract.** Import the shared/generated
  types; a copied type is a silent lie the moment the API changes.

## 12. See also

- Before/after refactors for the rules above: [examples.md](examples.md)
- ESLint + dependency-cruiser config, audit checklist, migration path:
  [enforcement.md](enforcement.md)

## Appendix — applying this to dev-digest's `client/`

Verified facts about this repo; the universal rules map onto them like this.
Every count below **excludes `src/vendor/**`** — that tree is do-not-touch, so
it is no evidence of how code here is written (it holds 70 of the 269 files).

**Tiers.** Tier 1 is `src/app/<route>/_components/<PascalName>/`. Tier 3 is
`src/components/<kebab-name>/`. **There is no `src/features/`** — Tier 2's
job is currently done by `src/components/` plus `src/lib/`, which works at
the current size. Introduce `src/features/` only when one product area owns
5+ shared components *and* its own hooks and domain modules; until then a new
top-level folder is ceremony.

Three more Tier 3 folders from §5 also don't exist here, and two should stay
that way:

- **`src/components/ui/` — do NOT create it.** UI primitives live in
  `src/vendor/ui`, imported as `@devdigest/ui`. That tree is
  **do-not-touch**, so a new primitive is a change request against the
  vendored design system, never a new folder beside it. §7's "UI primitive"
  row reads `@devdigest/ui` in this repo.
- **`src/config/`** — env is read in exactly one place already
  (`NEXT_PUBLIC_API_BASE` in `src/lib/api.ts`), which satisfies §8 rung 5.
- **`src/types/`** — contracts come from `@devdigest/shared`;
  `src/lib/types.ts` is the thin re-export facade. Never hand-copy a contract.

**Component file set.** `<Name>.tsx · index.ts · styles.ts · constants.ts ·
helpers.ts · <Name>.test.tsx` (the last four as needed). Full compliance is a
minority today. Of the **45** component folders (38 route-local
`<Name>/<Name>.tsx` plus 8 kebab dirs directly under `src/components/`,
overlapping only at `showcase/`), **22 have no *sibling* `styles.ts`** — but
that raw number overstates the gap: **14** of them reuse a shared styles module
(10 import a parent's `styles.ts`, 4 the shared `cs` in
`diff-viewer/comments.ts`) and **3** render no styling of their own, leaving
only **~5** that style inline with neither a sibling nor a shared module.
`RunHistory/` is the lone folder missing `index.ts`, and **13 of the 45**
folders have a co-located `<Name>.test.tsx`. Write new components to the full
set; don't cite the gaps as precedent. The `index.ts`
form is near-evenly split across 45 barrels — 22 use
`export { X } from "./X";`, 17 add `X as default`, 3 are one-offs. Either
named form is fine; prefer the plain one. The remaining 3 (`app-shell`,
`page-shell`, `showcase`) use `export *`, which §11's barrel policy rules
out — don't copy them.

**Utils vs helpers here.** There is **no `utils` anywhere** in `client/src`
(zero hits). The three-way rule collapses to two working buckets:
`helpers.ts` (component-local, pure, mostly untested) and
`src/lib/<domain>.ts` (app-wide and tested — `cost.ts`, `findings.ts`,
`tokens.ts`, `github-urls.ts`). A genuinely domain-agnostic util has nowhere
to go yet; put it in a topic-named `src/lib/<topic>.ts` rather than inventing
`src/utils/` for one function.

**Constants.** 18 `constants.ts` files, zero `constants/` directories, no
global constants module — always siblings. They are maps from a domain enum
to visual/i18n metadata (`{ c, bg, icon, labelKey }`) holding CSS-var
strings, never hex. Cross-cutting design tokens live in
`src/vendor/ui/primitives/tokens.ts` and as CSS vars in
`src/vendor/ui/styles.css`. `labelKey` values resolve into the `next-intl`
namespace files at `messages/en/<ns>.json` (merged in `src/i18n/request.ts`,
read via `useTranslations("<ns>")`) — one namespace per feature.

**Styling.** Inline React `CSSProperties` via a sibling `styles.ts` exporting
a single `s` object: static entries use `satisfies CSSProperties`,
state-dependent entries are functions returning `CSSProperties`. **Sharing `s`
within one component family is sanctioned**: sub-components of a single parent
may import that parent's `styles.ts` (`from "../styles"` / `"../../styles"` — as
in `RunTraceDrawer/`, `pulls/`, and `diff-viewer/`), and a family may keep one
shared styles module beside its members (e.g. `diff-viewer/comments.ts`
exporting `cs`). Such sub-components need no sibling `styles.ts` of their own.
The sharing stays *within* one family — unrelated sibling folders never import
each other's `s`. This is
**not** a Tailwind-utility codebase (351 `style={` vs 33 `className=`), and
every `className` literal is `mono`, `tnum`, or `mono tnum`; Tailwind v4 is
present only for preflight and the `@theme` token layer.
`react-best-practices`' "no inline style objects" rule does not apply here.

**The one documented escape hatch**: a React style object cannot express a
pseudo-selector, so `RunHistory/styles.ts` additionally exports a class name
(`GO_TO_REVIEW_CLASS = "dd-run-goto"`) and a `css` string, injected by the
component as `<style>{css}</style>` to get a real `:hover` rule. Follow that
shape when you need `:hover`/`:focus`/media queries — a named class plus a
`css` export beside `s`, not `onMouseEnter` state.

**Business logic.** `src/lib/hooks/*` (`core`, `agents`, `reviews`, `trace`,
`repo-intel` — every file starts `"use client"`) over TanStack Query, plus
pure domain modules in `src/lib/*.ts`. One API client: `src/lib/api.ts`
(`api.get/post/put/patch/del`, errors normalized to `ApiError`). Global state
is three React contexts in `src/lib/` (theme, toast, repo-context) — no
Redux, Zustand, or Jotai. Types come from `@devdigest/shared` (vendored Zod
contracts); `src/lib/types.ts` is a thin re-export facade.

**Server/client split.** Only three server components exist
(`app/layout.tsx`, `agents/page.tsx`, `settings/[section]/page.tsx`) and none
of them fetch; 64 of 199 non-vendor files carry `"use client"`. The de-facto
architecture is "server shell, client everything". Treat that as the current
state, not the target to imitate blindly — new work that can be a server
component should be one.

**Known inconsistency to legislate against.** `@/`-alias imports (36) and
deep relatives (66 `../../../..` occurrences) coexist, sometimes in one file:
`src/app/repos/[repoId]/pulls/[number]/page.tsx:11-12` imports `AppShell`
through five `../` and `RepoNotFound` through `@/components/…`. New and
touched lines use `@/`.

## Don't / Do

| Don't | Do |
|---|---|
| Create `components/`, `hooks/`, `utils/` up front and file by kind | Start route-local; graduate on a real second consumer |
| Extract on the second similar block | Wait for a third consumer or a diverging bug — prefer duplication over the wrong abstraction |
| Leave a one-consumer module in a shared folder | Demote it back into its only consumer |
| Name a file `utils.ts` | Name it for its topic: `date.ts`, `cost.ts`, `array.ts` |
| Copy a colour/label map into a second component | One owning `constants.ts`; everyone imports it |
| Import `@/features/x/components/Y` | Import `@/features/x` — the `index.ts` is the API |
| Reach across with `../../../../lib/hooks` | Use `@/lib/hooks` |
| Put `'use client'` on the page root | Push it down to the interactive leaf |
| Branch on domain rules inside JSX | Derive in a pure function; pass the derived prop |
| Import React or `next/*` in a domain module | Keep it framework-free so server and client can both call it |
| Leave a re-export stub behind after moving a module | Move it and update the imports |
