# Enforcement — onion-architecture

A rule nobody can check is a suggestion. Every law in `SKILL.md` was written to
be decidable from a path and an import list; this file turns the load-bearing
ones into config, an audit you can score, and a migration order that never
requires a big-bang rewrite.

**Note:** this is the enforcement *design*. Wiring it into `pnpm lint` / CI is a
separate PR (plan Phase 4) — do not add it while authoring the skill.

---

## Tool: dependency-cruiser (already present)

`server/` already depends on `dependency-cruiser` (`^17.4.3`, `package.json:25`)
— the same engine `adapters/depgraph` uses — so no install is needed. It reasons
about paths and import edges, which is exactly what the layer laws are. Prefer it
here over `eslint-plugin-boundaries` (which would need adding).

Create `server/.dependency-cruiser.cjs`:

```js
// .dependency-cruiser.cjs — layer boundaries for the onion (R1–R3, R6)
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-drizzle-outside-infra',                       // R2
      comment: 'drizzle-orm / db/schema may only be imported by repositories, ' +
               'adapters, db/, platform infra, and the composition root.',
      severity: 'error',
      from: {
        pathNot:
          'src/(modules/[^/]+/repository|adapters/|db/|platform/(jobs|container)|app\\.ts)',
      },
      to: { path: '(^|/)drizzle-orm|src/db/(schema|client|rows)' },
    },
    {
      name: 'no-fastify-outside-presentation',                // R3
      comment: 'fastify / req / reply live in routes.ts, presenters, and the root.',
      severity: 'error',
      from: { pathNot: 'src/(modules/[^/]+/(routes|presenters)|platform/|app\\.ts)' },
      to: { path: '^fastify$|fastify-type-provider-zod' },
    },
    {
      name: 'domain-imports-inward-only',                     // R4
      comment: 'domain/ imports only domain + type-only shared contracts.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/domain/' },
      to: {
        pathNot: 'src/modules/[^/]+/domain/|src/vendor/shared',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'service-not-repository',                          // R2/R6
      comment: 'A service must depend on a port, never import repository.ts.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/service\\.ts$' },
      to: { path: 'src/modules/[^/]+/repository' },
    },
    {
      name: 'no-cross-module-internals',                       // §5 facade rule
      comment: 'Reach another module only through a container-registered facade. ' +
               'NB: the `$1` backreference resolves the `from` capture group — ' +
               '`\\1` does NOT interpolate here and would flag same-module imports.',
      severity: 'warn',
      from: { path: 'src/modules/([^/]+)/' },
      to: {
        path: 'src/modules/[^/]+/(service|repository)',
        pathNot: 'src/modules/$1/',
      },
    },
    {
      name: 'no-seed-outside-cli',                            // V4
      comment: 'db/seed.ts is a CLI entrypoint (`tsx src/db/seed.ts`), not a ' +
               'library. An adapter importing it couples runtime code to seed data.',
      severity: 'error',
      from: { pathNot: 'src/db/seed\\.ts$' },
      to: { path: 'src/db/seed\\.ts$' },
    },
    {
      name: 'no-mocks-in-prod',                               // R10 / V9
      comment: 'adapters/mocks.js is test-only; do not re-export it from prod.',
      severity: 'error',
      from: { pathNot: '\\.(test|it\\.test)\\.ts$' },
      to: { path: 'src/adapters/mocks\\.ts$' },
    },
  ],
  options: {
    tsConfig: { fileName: './tsconfig.json' },
    tsPreCompilationDeps: true,                               // needed to see `import type`
    doNotFollow: { path: 'node_modules' },
  },
};
```

Run it:

```sh
pnpm exec depcruise src --config .dependency-cruiser.cjs
```

Add to `package.json` scripts once the baseline is green:
`"lint:boundaries": "depcruise src --config .dependency-cruiser.cjs"`, then call
it from `lint`.

### Verified baseline (v1.0.0)

This config was **executed against the live tree** while writing v1.0.0. It
cruises 151 modules / 468 dependencies and reports **24 errors, 0 warnings**,
every one of which maps to a documented V-item — no false positives:

| Rule | Hits | V-item |
|---|---|---|
| `no-drizzle-outside-infra` | 18 | V1 (`workspace`, `settings`, `feature-models`, `pulls`, `polling`), V2 (`reviews/service`→`db/rows`, `run-executor`, `diff-loader`), V3 (`repos/helpers`), V4 (`_shared/pr-files`) |
| `service-not-repository` | 4 | V5 (`reviews`, `repos`, `repo-intel`, `agents`) |
| `no-mocks-in-prod` | 1 | V9 (`adapters/index.ts`) |
| `no-seed-outside-cli` | 1 | V4 (`adapters/auth/local.ts`) |
| `no-fastify-outside-presentation` | 0 | R3 is already clean — ratchet it to `error` first |
| `domain-imports-inward-only` | 0 | no `domain/` folder exists yet (V10) |
| `no-cross-module-internals` | 0 | no module deep-imports another's internals today |

**Known gap (accepted):** `no-drizzle-outside-infra` exempts `src/adapters/**`
wholesale, because genuine infra adapters may touch the DB. That means V4's
`adapters/auth/local.ts` DB access is *not* caught by that rule — it is caught
by `no-seed-outside-cli` instead. If you want the stricter reading, narrow the
exemption to the adapters that legitimately persist.

**Two traps this config was corrected for — do not reintroduce them:**

- A backreference to a `from` capture group in a `to` path is **`$1`, not
  `\1`**. The `\1` form does not interpolate, so
  `no-cross-module-internals` silently matched *same-module* imports and
  produced 22 false positives.
- `tsPreCompilationDeps: true` is **required**. Without it, `import type`
  edges are invisible and rules R4/R5 (which are mostly type-only imports)
  report nothing and look green.

---

## Alternative: eslint-plugin-boundaries + core `no-restricted-imports`

If you prefer ESLint (needs `pnpm add -D eslint-plugin-boundaries`), tag each
layer as an element and forbid the disallowed edges. `no-restricted-imports` is
core ESLint and needs no plugin — it alone catches R2/R3 by path.

```js
// eslint.config.js (flat) — add after the existing config objects
import boundaries from 'eslint-plugin-boundaries';

export default [
  // … existing server config …
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain',        pattern: 'src/modules/*/domain/**' },
        { type: 'application',   pattern: ['src/modules/*/service.ts', 'src/modules/*/ports.ts'] },
        { type: 'infrastructure', pattern: ['src/modules/*/repository*.ts', 'src/adapters/**'] },
        { type: 'presentation',  pattern: ['src/modules/*/routes.ts', 'src/modules/*/presenters.ts'] },
        { type: 'composition',   pattern: ['src/app.ts', 'src/platform/container.ts'] },
      ],
    },
    rules: {
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          { from: 'domain',         allow: ['domain'] },
          { from: 'application',    allow: ['domain', 'application'] },
          { from: 'infrastructure', allow: ['domain', 'application', 'infrastructure'] },
          { from: 'presentation',   allow: ['domain', 'application', 'presentation'] },
          { from: 'composition',    allow: ['domain', 'application', 'infrastructure', 'presentation'] },
        ],
      }],
      // R2/R3 as a fast path, independent of element tagging:
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['drizzle-orm', '**/db/schema*', '**/db/client*', '**/db/rows*'],
            message: 'Drizzle/db is Infrastructure-only (R2). Use a port.' },
          { group: ['fastify', 'fastify-type-provider-zod'],
            message: 'Fastify is Presentation-only (R3).' },
        ],
      }],
    },
  },
];
```

Scope the `no-restricted-imports` override with `files` so it does **not** apply
to `repository*.ts`, `adapters/**`, `routes.ts`, `presenters.ts`, or the
composition root — those are the layers legitimately allowed those imports.

---

## Audit checklist (score the tree)

One point each; a healthy module scores 10/10.

1. `routes.ts` handlers are ≤ ~5 lines; no `and`/`eq`/`desc` from `drizzle-orm`.
2. No `import * as t from '.../db/schema.js'` outside `repository*.ts` / adapters
   / `db/` / composition root.
3. No `db/rows.ts` alias or `$inferSelect` type in a service or route signature.
4. Every repository method returns a domain/application type, not a row.
5. `helpers.ts` imports no schema/drizzle (pure).
6. Services take a narrow deps object, not `Container`; no `new Repository(...)`
   inside a service.
7. No raw `db.transaction(...)` outside a `repository*.ts`.
8. Every external system reaches inner layers through a port (no concrete adapter
   import in `service.ts` / `domain/`).
9. No `Schema.parse(req.body)` in a handler; validation is schema-first.
10. `adapters/mocks.js` is imported only from `*.test.ts` / `*.it.test.ts`.

Map failures to the V-list in `SKILL.md`'s appendix so each finding has a name.

---

## Incremental migration (strangler, never big-bang)

1. **Baseline in warn mode.** Land the dependency-cruiser config with every rule
   at `severity: 'warn'` (or an `exclude` allow-list of today's V1–V10 files).
   Green build, full visibility. The report should list exactly the baseline
   V-list and nothing else — if it lists more, the config is too broad.
2. **Ratchet one rule to `error` at a time**, cheapest first: `no-mocks-in-prod`
   (V9) and `no-fastify-outside-presentation` (R3) usually pass already.
3. **Migrate one module per PR, tests first**, in risk/benefit order:
   `workspace` → `polling` → `settings` → `pulls` (V1); then rows → domain types
   in `repos`, `reviews` (V2/V3); then constructor ports for `RepoService` /
   `RepoIntelService` (V5); then astgrep/extract ports (V6); then
   `replacePrFiles` → repository + `UnitOfWork` and `auth/local` off `db/seed`
   (V4). Drop each file from the allow-list as its rule goes green.
4. **Never restructure `db/schema/*` or an applied migration** to satisfy a rule
   (do-not-touch). Add a new domain file instead.
5. Keep the `server/README.md` "Request & DI flow" Mermaid diagram in step with
   each structural change, or add an explicit supersede note.

Skill authoring (Phases 1–3) does **not** include this migration — it lands as
its own PRs once the owner asks.
