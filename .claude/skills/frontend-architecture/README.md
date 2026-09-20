# Frontend Architecture — skill

**Version 1.0.0**

A Claude Code Skill that answers one question mechanically: **where does this
file go?** It covers React + Next.js (App Router) directory structure, code
organization, and the placement discipline that removes duplication — for
agents and humans writing or reviewing frontend code in this repo, and
portable to any Next.js project.

It is deliberately narrow. Performance is out of scope entirely, and
in-component React rules, Next.js runtime semantics, and test placement are
delegated to the skills that already own them.

## The five questions

| Question | Short answer | Detail |
|---|---|---|
| What is the optimal directory structure? | Three tiers — route-local by default, feature when a second route needs it, shared when it is domain-agnostic | [SKILL.md §2-§6](SKILL.md) |
| How are components broken down and categorized? | Four categories defined by what each may import: UI primitive · shared composite · feature component · route shell | [SKILL.md §7](SKILL.md) |
| Where do constants live? | A six-rung ladder from inline literal to CSS token, with one owning module per constant | [SKILL.md §8](SKILL.md) |
| Utilities vs helpers? | util = domain-agnostic (`src/utils/`); helper = domain-aware and pure (colocated); domain module = business operation, never imports React (`src/lib/`) | [SKILL.md §9](SKILL.md) |
| Where is business logic isolated from the UI? | Four layers: domain → data access → view-model hooks → presentational components | [SKILL.md §10](SKILL.md) |

The rules themselves live in `SKILL.md` and are not restated here — a second
copy would be exactly the duplication the skill argues against.

## Files

| File | For | Contents |
|---|---|---|
| [SKILL.md](SKILL.md) | the agent | The rules: deferrals, the decision tree, the three tiers, graduation/demotion, component taxonomy, constants ladder, util/helper/domain split, UI-logic layering, import boundaries, a dev-digest `client/` appendix, and a Don't/Do table |
| [examples.md](examples.md) | both | Six before/after refactors, code-first |
| [enforcement.md](enforcement.md) | both | ESLint flat config + dependency-cruiser rules, a 20-point audit checklist, and a four-step strangler migration |
| README.md | humans | This file |

## How to invoke

- Automatically — the skill fires on placement questions ("where should this
  go?", "should this be shared?"), new component/hook/constant/util creation,
  splitting a large file, extracting duplication, structure reviews, and new
  Next.js app setup.
- Explicitly — `/frontend-architecture`, or "use the frontend-architecture
  skill".

The appendix in `SKILL.md` maps every universal rule onto this repo's actual
`client/` conventions (`_components/<PascalName>/`,
`src/components/<kebab-name>/`, sibling `constants.ts` and `styles.ts`, no
`src/features/`, no `utils/`), so the answers it gives here are concrete file
paths, not generic advice.

## Changelog

### 1.0.0 — initial release

- The tiered colocate-then-graduate stance, with promotion *and* demotion
  triggers.
- The "where does this file go?" decision tree covering every file kind.
- Four-category component taxonomy replacing atoms/molecules/organisms.
- Constants placement ladder and the single-writer rule.
- Three-way util / helper / domain-module definition, resolving the
  interchangeable use of "util" and "helper" in `react-best-practices`.
- Four-layer UI/business-logic separation, including the framework-free
  domain layer and the server-only Data Access Layer.
- Import boundary rules plus ESLint / dependency-cruiser enforcement, an
  audit checklist, and a migration path.
- Appendix of verified `dev-digest` `client/` conventions.

## References

Every link below was fetched and confirmed live while writing v1.0.0.

- **Next.js — Project structure and organization** ·
  <https://nextjs.org/docs/app/getting-started/project-structure> —
  the `_folder` privacy convention, `(group)` route groups, and the official
  "colocate inside `app/`" position that Tier 1 is built on.
- **Next.js — Data Security** ·
  <https://nextjs.org/docs/app/guides/data-security> —
  the Data Access Layer, DTOs, and `import 'server-only'` used in §10.
- **Next.js blog — How to Think About Security in Next.js** ·
  <https://nextjs.org/blog/security-nextjs-server-components-actions> —
  names the three data-handling models and calls the DAL "our recommended
  approach for new projects"; source of the auditable rule that database
  packages and env vars are imported in exactly one directory.
- **OWASP — Next.js Security Cheat Sheet** ·
  <https://cheatsheetseries.owasp.org/cheatsheets/Nextjs_Security_Cheat_Sheet.html>
  — independent confirmation that authorization belongs next to the data
  source rather than in routing or UI, which is why the DAL is a *placement*
  rule and not only a security one.
- **bulletproof-react — project structure** ·
  <https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md>
  — the feature-folder segments (`api/ components/ hooks/ model/`), the
  `index.ts` public API, and the "features never import features" rule.
- **Feature-Sliced Design — Next.js App Router guide** ·
  <https://feature-sliced.design/blog/nextjs-app-router-guide> — how a slice
  architecture coexists with `app/`; the parts this skill deliberately does
  not adopt.
- **Feature-Sliced Design — Usage with Next.js** ·
  <https://feature-sliced.design/docs/guides/tech/with-nextjs> — the `app`
  layer-name collision and the server/client public-API split inside a slice.
- **Kent C. Dodds — Colocation** · <https://kentcdodds.com/blog/colocation> —
  "place code as close to where it's relevant as possible"; the source of
  §1's default.
- **Kent C. Dodds — State Colocation will make your React app faster** ·
  <https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster>
  — why lifting things higher than necessary costs maintainability, not just
  renders.
- **Kent C. Dodds — AHA Programming** ·
  <https://kentcdodds.com/blog/aha-programming> — "prefer duplication over
  the wrong abstraction" (Sandi Metz), the basis of the extract-on-the-third
  rule.
- **Josh W. Comeau — Delightful React File/Directory Structure** ·
  <https://www.joshwcomeau.com/react/file-structure/> — the
  component-folder-as-unit idiom and the helpers/constants siblings.
- **Robin Wieruch — React Folder Structure Best Practices** ·
  <https://www.robinwieruch.de/react-folder-structure/> — the progression
  from flat files to feature folders, matching the tiered stance.
- **profy.dev — Screaming Architecture: evolution of a React folder
  structure** ·
  <https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25>
  — a walkthrough of how group-by-file-type degrades as a codebase grows;
  the failure mode §2's "never place by file kind alone" guards against.
- **Anthropic — Skill authoring best practices** ·
  <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
  — the SKILL.md length cap, one-level reference depth, and
  description-writing rules this skill follows.
