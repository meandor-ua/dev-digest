# Deprecation Policy

A published route, its Zod request schema, or its response shape can be
retired, but only through a deprecation window — never by silently removing
or repurposing a field a client may already depend on.

## The rule

Before an existing field, route, or status code is removed:

1. Mark the field `@deprecated` in its Zod schema comment and keep serving it
   for at least one release alongside its replacement.
2. Add a `Deprecation` response header (or an equivalent documented signal)
   so callers can detect the transition programmatically.
3. Only delete the deprecated field/route once the deprecation window has
   passed AND the PR description says so explicitly — never as a silent
   side-effect of an unrelated change.

A PR that removes a field/route without a prior deprecation step is a
breaking change, not a cleanup — flag it as CRITICAL.

## Good example

```ts
// v1 kept alive during the deprecation window; v2 adds the replacement field.
const PullRequestDto = z.object({
  id: z.string(),
  /** @deprecated use `author` (object) instead — removed after 2026-11-01 */
  author_login: z.string(),
  author: z.object({ login: z.string(), id: z.string() }),
});
```

```ts
reply.header('Deprecation', 'true');
reply.header('Sunset', 'Sat, 1 Nov 2026 00:00:00 GMT');
```

## Bad example

```ts
// author_login silently disappears — any client still reading it now gets
// `undefined` with no warning, no header, and no changelog entry.
const PullRequestDto = z.object({
  id: z.string(),
  author: z.object({ login: z.string(), id: z.string() }),
});
```
