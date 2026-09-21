---
name: client-i18n-and-tests
description: Repo-specific checklist for shipping a client feature in DevDigest's Next.js app — next-intl message files (merge, never overwrite; t.rich for markup; ICU plurals with #; a static missing-key test), accessible names for the vendored @devdigest/ui kit (FormField labels aren't bound, Toggle is role="switch"), and the vitest/RTL harness this repo needs (NextIntlClientProvider + ToastProvider wrapper, vi.hoisted mocks, vi.mock paths that match the component's import depth, jsdom File/recharts limits, mounted-form rebase tests). Use when adding or migrating UI strings under client/, creating a route's messages/en/<ns>.json, writing or fixing co-located *.test.tsx for client components, or when client tests fail with "Cannot access … before initialization", a mock that silently doesn't apply, MISSING_MESSAGE, or "Unable to find an element". Does not cover generic RTL query priority or async patterns (react-testing-library), file placement (frontend-architecture), or React design rules (react-best-practices).
---

# Client i18n + component tests — DevDigest

Everything here was paid for in real rework (see `client/INSIGHTS.md`,
2026-09-21). Follow it when you add UI to `client/`, then run the checks at
the end. Generic RTL guidance lives in `react-testing-library`; this skill is
only what is specific to this repo.

## 1. Messages (next-intl)

Messages are one JSON file per namespace, `client/messages/en/<ns>.json`,
merged by `client/src/i18n/request.ts` into `{ [ns]: … }`. English is the only
locale. Components call `useTranslations("<ns>")`.

- **Merge, never overwrite.** A route's namespace file may already hold keys
  from the course starter or another feature. Load it, add keys, write it
  back. Before finishing, diff against `HEAD` and confirm no key you didn't
  mean to drop is gone:
  `git diff client/messages/en/<ns>.json | grep '^-'`.
  An overwrite once dropped `preview.untrustedNotice` and `detail.loadError`
  while components still used them. The page only failed when opened.
- **Everything user-visible is a key.** That means headings, labels, hints,
  placeholders, button text, empty states, toasts (including `err.message || …`
  fallbacks), `confirm()` text, `aria-label`/`title`, breadcrumbs, and tab
  labels. Not keys: filenames (`skill.md`) and prompt literals such as
  `## Skills / rules`.
- **Markup goes through `t.rich`.** `t("k", { section: "<code>x</code>" })`
  renders the tags as literal text. Put the tag in the message and render it:
  `"… the <code>{section}</code> section"` +
  `t.rich("k", { section, code: (c) => <code>{c}</code> })`.
- **ICU plurals need `#` to print the number:**
  `"{count, plural, one {# version} other {# versions}} recorded"`.
  Without `#` the count silently disappears.
- **Dynamic keys come only from a closed set** declared in the feature's
  `constants.ts` (e.g. tab keys → `t(\`editor.tabs.${key}\`)`). Never build a
  key from server data.
- **Add a static missing-key test per namespace.** Copy
  `client/src/app/skills/i18n-keys.test.ts` next to the route. It scans every
  static `t("…")` under the route and asserts that each key resolves to a
  string. A missing key otherwise fails only at runtime, on the one screen
  that renders it.
- **Hunt leftovers** after a migration:
  `grep -rnE '"[A-Z][a-z]+( [a-z]+)+"|>[A-Z][a-z]+( [a-z]+)+<' src/app/<route> --include=*.tsx | grep -v 't("'`
  and `grep -rLE useTranslations $(find src/app/<route> -name '*.tsx' ! -name '*.test.tsx')`.

## 2. Accessible names for the vendored kit

`@devdigest/ui` (vendored, do not edit) has a few traps that make components
untestable by role and unusable by screen readers:

| Kit piece | Trap | Do this |
|---|---|---|
| `FormField` | its `<label>` is not bound to the child input | pass `aria-label={t(…)}` to the input. `TextInput` spreads extra props onto its `<input>` |
| raw `<textarea>` / `<select>` inside a `FormField` | same | `aria-label` on the element |
| `Toggle` | it is `role="switch"`, not a button | query `getByRole("switch")`. Inside a clickable card, wrap it in a `stopPropagation` span |
| `Checkbox` | `role="checkbox"` button | `getByRole("checkbox")` |
| `Dropdown` | items are plain buttons (no menu roles) | click the trigger, then `getByRole("button", { name })` on the item |

Prefer the kit's `Dropdown` / `SelectInput` / `MetricCard` / `Donut` /
`CircularScore` over hand-rolled `<select>`s, SVG gauges or raw recharts. For
chart colours use `CATEGORY_PALETTE` / `categoryDonutSegments` from
`client/src/lib/category-chart.ts`, not hex values: they are CSS variables, so
dark mode works.

## 3. Test harness

Co-located `<Name>.test.tsx`, vitest + jsdom. Template:

```tsx
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "<../ to client/>messages/en/<ns>.json";
import { ToastProvider } from "<../ to src/>lib/toast"; // only if the component calls useToast

// vi.mock is hoisted above every const. Anything the factory touches must come from vi.hoisted.
const { mutate, push } = vi.hoisted(() => ({ mutate: vi.fn(), push: vi.fn() }));

// Copy the component's own import string verbatim. One ../ too few does not
// error: the mock just doesn't apply and the real hook runs.
vi.mock("<exact path the component imports>/lib/hooks/<feature>", () => ({
  useThing: () => ({ data: FIXTURE, isLoading: false, isError: false }),
  useUpdateThing: () => ({ mutate, isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { Thing } from "./Thing"; // after the mocks

const wrap = (props: Props) => (
  <NextIntlClientProvider locale="en" messages={{ <ns>: messages }}>
    <ToastProvider><Thing {...props} /></ToastProvider>
  </NextIntlClientProvider>
);

afterEach(() => { cleanup(); vi.clearAllMocks(); });
```

- **Mock the `lib/hooks/<feature>` module**, not `fetch`. Then no
  `QueryClientProvider` is needed. To vary a hook per test, hoist a `vi.fn()`
  and call `mockReturnValue` inside the test.
- **Read the component before asserting.** Assert on text the component
  actually renders (import it from `messages` rather than retyping it) and on
  roles and accessible names. Never guess copy. Most failing tests in the
  Skills work asserted titles and captions that never existed.
- **jsdom gaps:**
  - `File` has no `arrayBuffer()`/`text()`. Type upload readers as
    `Pick<File, "name" | "size" | "arrayBuffer">` and pass plain objects.
  - recharts `ResponsiveContainer` renders 0×0, so assert on legend and label
    text, not SVG geometry.
  - `CompressionStream`/`DecompressionStream` do exist (Node globals), so you
    can build real deflated fixtures.
- **Components that stay mounted across tabs** (e.g. a Config form kept alive
  to keep unsaved edits) need a `rerender` test: re-render with a newer
  server object (restored body, toggled flag) and assert the form picks it up,
  keeps an unsaved edit to another field, and that Save sends only changed
  fields. See `…/SkillEditor/_components/ConfigTab/draft.ts` for the rebase
  helper.

## 4. Mutations

Every mutation invalidates every query its change affects (client `AGENTS.md`).
Global `staleTime` is 30s and there is no focus refetch, so a missed key means
stale UI. Grep `client/src/lib/hooks/*.ts` for the real keys. For example,
deleting a skill unlinks agents, which also changes `["agent-card-stats"]` and
`["agent-stats"]`. When an optimistic update builds items the cache doesn't
have yet, build them in the full contract shape (e.g. `AgentSkillItem`
includes `agent_id`), because type-guard filters hide missing fields.

## 5. Done means

```sh
cd client && pnpm typecheck && pnpm lint && pnpm test   # zero failures, nothing skipped
git diff messages/en/ | grep '^-'                         # no unintended key removals
```

Plus the leftover-literal greps from §1 print nothing for the route.
