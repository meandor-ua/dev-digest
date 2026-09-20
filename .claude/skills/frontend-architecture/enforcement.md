# Enforcement — frontend-architecture

A rule nobody can check is a suggestion. Everything in `SKILL.md` was written
to be decidable from a path and an import list; this file turns the important
ones into lint config, an audit you can score, and a migration order that
never requires a big-bang rewrite.

---

## ESLint (flat config)

**Install first:** `pnpm add -D eslint-plugin-import` (or
`eslint-plugin-import-x`). It is *not* a transitive guarantee — `dev-digest`'s
`client/` has only `eslint` + `eslint-config-next`, so the `import/*` rules
below cannot load there until it is added. The `no-restricted-imports` rules
are core ESLint and need no plugin.

Drop this block into the flat-config array, after the framework presets.

```js
// eslint.config.mjs
import importPlugin from 'eslint-plugin-import';

export default [
  // … framework + typescript presets first …
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
    },
    rules: {
      // Unidirectional flow: shared -> features -> app.
      'import/no-restricted-paths': ['error', {
        zones: [
          // Tier 3 may not reach up into Tier 2 or the route tree.
          { target: './src/lib',           from: ['./src/features', './src/app'] },
          { target: './src/utils',         from: ['./src/features', './src/app'] },
          { target: './src/components/ui', from: ['./src/features', './src/app', './src/lib'] },
          { target: './src/config',        from: ['./src/features', './src/app'] },
          // Tier 2 may not reach up into the route tree.
          { target: './src/features',      from: './src/app' },
          // Features never import features. NOTE: `except` is resolved
          // relative to `from`, so a globbed target with `except: ['./']`
          // exempts the whole tree and silently matches nothing. There is no
          // working one-liner — enumerate one zone per feature:
          { target: './src/features/pr-review', from: './src/features', except: ['./pr-review'] },
          { target: './src/features/repo-import', from: './src/features', except: ['./repo-import'] },
          // …one line per feature. If that list gets tedious, drop it and use
          // the dependency-cruiser `no-cross-feature` rule below, which
          // expresses this properly with a backreference.
        ],
      }],

      // Deep relatives and barrel-bypassing imports.
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['../../*', '../../../*', '../../../../*'],
            message: 'Use the @/ alias instead of deep relative imports.',
          },
          {
            group: ['@/features/*/*'],
            message: "Import the feature's index.ts (@/features/<name>), not its internals.",
          },
          {
            group: ['@/components/ui/*/*'],
            message: 'Import the component folder, not files inside it.',
          },
        ],
      }],

      // Import hygiene that keeps the graph readable.
      'import/no-cycle': ['error', { maxDepth: 3 }],
      'import/no-self-import': 'error',
      'import/no-useless-path-segments': ['error', { noUselessIndex: true }],
    },
  },

  // Domain modules stay framework-free, so both a Server Component and a
  // client hook can import them.
  {
    files: ['src/lib/**/*.ts', 'src/features/*/model/**/*.ts', 'src/utils/**/*.ts'],
    ignores: ['src/lib/hooks/**', 'src/lib/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'react', message: 'Domain modules must not import React — move this to a hook.' },
          { name: 'next/navigation', message: 'Domain modules must not import next/*.' },
          { name: 'next/router', message: 'Domain modules must not import next/*.' },
        ],
      }],
    },
  },

  // UI primitives carry no domain knowledge.
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/features/*', '@/lib/*', '@devdigest/shared*'],
            message: 'UI primitives must not know domain types or app modules.' },
        ],
      }],
    },
  },
];
```

Notes:

- `no-restricted-imports` **does not merge** across flat-config blocks — a
  later block replaces the earlier setting for the files it matches. If a file
  is matched by two blocks above, restate the patterns you still want.
- Adopt the rules as `'warn'` first (see the migration path), then flip to
  `'error'` once the tree is clean, so CI stays green while you move files.
- `dev-digest`'s `client/` already has `@/*` → `./src/*` in
  `tsconfig.json`, so the alias half needs no setup — only the rules.
- **Smoke-test scope (v1.0.0), stated honestly:** only the
  `no-restricted-imports` half was executed against `client/`. It parses under
  the existing flat config and reports 79 errors, all of them known
  deep-relative imports — the rule working, not a config fault. The
  `import/*` half was **not** exercised, because `eslint-plugin-import` is not
  installed there; treat those rules as unverified until you add it.
- Two of those 79 hits import `messages/en/*.json`, which lives *outside*
  `src/` and so has no `@/` path. Add a second alias
  (`@messages/*` → `./messages/*`) or exempt that path before flipping the
  deep-relative rule to `'error'`.

## dependency-cruiser (stricter alternative)

ESLint sees one file at a time; `dependency-cruiser` sees the graph, so it can
express "orphaned module" and folder-to-folder reachability properly.

```js
// .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    {
      name: 'no-upward-imports',
      severity: 'error',
      comment: 'shared -> features -> app is one-directional.',
      from: { path: '^src/(lib|utils|components/ui|config)' },
      to:   { path: '^src/(features|app)' },
    },
    {
      name: 'no-cross-feature',
      severity: 'error',
      comment: 'Features never import other features.',
      from: { path: '^src/features/([^/]+)/.+' },
      to:   { path: '^src/features/(?!$1)([^/]+)/.+' },
    },
    {
      name: 'feature-public-api-only',
      severity: 'error',
      comment: 'Enter a feature through its index.ts.',
      from: { pathNot: '^src/features/([^/]+)/' },
      to:   { path: '^src/features/([^/]+)/.+', pathNot: '^src/features/([^/]+)/index\\.ts$' },
    },
    {
      name: 'domain-is-framework-free',
      severity: 'error',
      from: { path: '^src/(lib|utils)/(?!hooks/).+\\.ts$' },
      to:   { path: '^(react|next)(/|$)', dependencyTypes: ['npm'] },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'An unimported module is either dead or misfiled.',
      from: { orphan: true, pathNot: '\\.(config|d)\\.[cm]?[jt]sx?$|^src/app/' },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: './tsconfig.json' },
  },
};
```

Run: `npx depcruise src --config .dependency-cruiser.cjs`.

---

## Audit checklist

Score an existing codebase out of 20 — one point each, pass/fail, no partial
credit. Under 12 means structure work should precede feature work.

**Placement (1-6)**

1. No top-level folder groups by file *kind* only (`hooks/`, `types/`, and
   `utils/` holding unrelated domains).
2. Every route-local component lives under a private `_components/` (or
   equivalent) in its own segment, not in a global folder.
3. Every shared module has ≥2 distinct consuming directories
   (`grep -rn "<name>" src app | cut -d/ -f1-3 | sort -u`).
4. No file named `utils.ts`, `helpers.ts`, or `misc.ts` at the top level.
5. `page.tsx` files contain no domain branching — composition and params only.
6. Component folders follow one file-set convention consistently.

**Constants and types (7-10)**

7. No literal duplicated across two modules that must agree (colours, labels,
   thresholds, query keys).
8. Every enum-keyed constant map is exhaustive (`Record<Enum, …>`).
9. `process.env` is read in exactly one module.
10. No hand-copied API contract types; they come from the shared package.

**Layering (11-15)**

11. No file in `src/lib` / `src/utils` imports React or `next/*` (hooks and
    providers excluded, and named as such).
12. No component calls `fetch` directly; data access goes through one client
    or one DAL.
13. Database packages and secret env vars are imported in exactly one
    directory.
14. `'use client'` sits on leaves, not on route roots that don't need it.
15. No JSX ternary encodes a business rule.

**Imports (16-20)**

16. Zero imports reaching up three or more levels
    (`grep -rn 'from "\.\./\.\./\.\./' src | wc -l`). Use this one metric
    everywhere — counting four-level `../../../..` instead gives a different,
    smaller number and the two get compared by mistake.
17. Zero cross-feature imports.
18. Zero imports reaching past a feature's `index.ts`.
19. No import cycles (`depcruise --validate` clean).
20. No global barrel file re-exporting unrelated modules.

---

## Migration path (strangler, in this order)

Never reorganize a whole tree in one PR: the diff is unreviewable and every
in-flight branch conflicts.

**Step 1 — make the right import expressible.** Add the `@/` alias to
`tsconfig.json`, then add the `no-restricted-imports` deep-relative pattern as
`'warn'`. Codemod the existing offenders in one mechanical, import-only
commit (`grep -rl 'from "\.\./\.\./'` + a sed pass, then typecheck). No file
moves in this step — reviewers should see only import lines change.

**Step 2 — declare the boundaries as warnings.** Add
`import/no-restricted-paths` and the framework-free-domain block at `'warn'`.
Count the warnings and record the number; it is the backlog, and it should
only ever go down. Add a CI step that fails if the count *increases*.

**Step 3 — apply the promotion/demotion test, file by file.** As you touch
each module for other reasons, run the §6 test from `SKILL.md`: count distinct
consuming directories, then move it up or down. Do moves as
`git mv` + import updates in their own commit so the rename is detected and
the history survives. Opportunistic, not a project.

**Step 4 — flip to `'error'`.** Once the warning count hits zero for a rule,
promote that rule to `'error'` individually. Rules graduate one at a time;
waiting for all of them means none of them ever land.

If a module genuinely must break a boundary, write the
`eslint-disable-next-line` with a comment naming the reason — an explicit,
greppable exception is worth more than a rule weakened for everybody.
