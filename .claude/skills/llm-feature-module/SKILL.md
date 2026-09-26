---
name: llm-feature-module
description: Repo-specific recipe for a DevDigest server feature built around one structured LLM call (conventions, onboarding, intent, risk brief, conformance and the next one) — where the prompt, model choice, schema, untrusted-content wrapping, grounding gate, rate limit, client timeout and mock-LLM tests go, and the traps each has already cost this repo. Use when adding or changing a server module that calls container.llm(...).completeStructured, writing a server/src/prompts/*.md template, adding a FEATURE_MODELS entry, or reviewing such a module. Does not cover the reviewer pipeline itself (reviewer-core), generic Fastify/Zod/Drizzle mechanics (fastify-best-practices, zod, drizzle-orm-patterns) or layer placement (onion-architecture).
---

# LLM feature module

Several system features in `server/src/modules/` share the same shape:
gather context in code, make **one** structured LLM call, check the output
against reality in code, and persist it. The Conventions Extractor
(`server/src/modules/conventions/`) is the reference implementation. Every
rule below is either how that module does it or a bug a review caught in it.

## Pipeline: SAMPLE → PROPOSE → VERIFY

| Phase | Who | Rule |
|---|---|---|
| SAMPLE | code | Deterministic, budgeted input (`constants.ts`: per-item and whole-sample caps). No model call. |
| PROPOSE | one `completeStructured` call | The model proposes. Its output is a claim, not a fact. |
| VERIFY | code | Check every claim against the sampled source. Drop what can't be grounded and store the *source's* text, never the model's (`conventions/helpers.ts` `verifyCandidate`). |

Return the counters (`proposed`, `dropped_*`, `model`, `cost_usd`) with the
result, so the UI can show how much was thrown away.

## Where each piece lives

| Piece | Location |
|---|---|
| Instruction text | `server/src/prompts/<feature>.system.md`, loaded with `renderPrompt(name, vars)` (`platform/prompts.ts`, `{{var}}` placeholders). Budgets like `{{cap}}` come from `constants.ts`, never literals in the prompt. |
| Model choice | A `FeatureModelId` + `FEATURE_MODELS` entry in `vendor/shared/contracts/platform.ts` (**both** vendor copies), resolved per workspace with `resolveFeatureModel(container, workspaceId, '<id>')`, then `await container.llm(provider)`. Never hardcode a model in the module. |
| Output schema | Module-local Zod object in `service.ts`. Reuse enums that `@devdigest/shared` already exports (e.g. `ConventionCategory`); don't retype them. |
| Budgets, caps, temperature, rate limit | `constants.ts` |
| Grounding, rendering, DTO mapping | `helpers.ts` (pure, unit-tested) |

## The structured call

```ts
const result = await llm.completeStructured({
  model,
  schema: ExtractionSchema,          // z.object({ items: z.array(Item).max(CAP) })
  schemaName: FEATURE_SCHEMA_NAME,   // also the MockLLMProvider fixture key
  temperature: FEATURE_TEMPERATURE,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: wrapUntrusted('repo-sample', sampleText) },
  ],
});
// result.data, result.model, result.costUsd
```

- **Strict JSON-schema mode**: every field is required. A `.optional()` field
  that isn't also `.nullable()` is rejected or warned on (seen live via
  OpenRouter). Prefer a plain required field.
- **Field order is a prompt.** Put the observation fields (rule, evidence)
  before the judgement fields (category, confidence). Category-first schemas
  collapse to one category and flat confidence.
- Cap list length in the schema (`.max(CAP)`) *and* say it in the prompt.

## Untrusted content

Anything from a repo, PR, diff or user goes through
`wrapUntrusted(label, text)` (`platform/prompt.ts`, re-exported from
reviewer-core). Never hand-roll `` `<untrusted>${text}</untrusted>` ``: a file
containing `</untrusted>` then closes the delimiter, and whatever follows is
read as instructions. End the system prompt with the SECURITY clause that
`<untrusted>` blocks are data (see `prompts/conventions.system.md`). Don't
wrap *trusted* text such as vetted skill bodies. The prompt's
`INJECTION_GUARD` would make the model ignore them.

## Route

- The call is paid and slow, so it gets `config: { rateLimit: … }` like the
  reviews routes (`conventions/constants.ts` `EXTRACT_RATE_LIMIT`).
- An edit route whose fields are all optional needs
  `.refine(b => Object.values(b).some(v => v !== undefined))`. Otherwise
  `{}` (or a body of only stripped keys) reaches Drizzle's `.set({})`, which
  throws, and the client gets a 500.
- Model-grounded fields (evidence, line numbers) are **not** in the edit
  schema. Users edit the claim, never the proof.

## Client

- Slow calls: `api.post(path, body, { timeoutMs })` (`client/src/lib/api.ts`)
  plus a "can take up to a minute" pending hint. A 60–90 s structured call
  is normal on cheaper models, and with no bound the button just spins.
- Errors are toasted globally (`MutationCache.onError`). Don't add a local
  error toast that repeats `err.message`.
- A mutation fired from a mount effect must use `mutateAsync()` and local
  loading state. Under StrictMode, `mutate()`'s callbacks and `isPending`
  never settle there (`client/insights/skills-lab.md`).

## Tests

- **Unit** (`test/<feature>-helpers.test.ts`): the grounding gate. Cover an
  exact match, a wrong line number that gets corrected, an invented snippet
  that gets dropped, an ambiguous path, and a multi-line or truncated tail.
- **Integration** (`test/<feature>.it.test.ts`, testcontainers): build the
  app with the mock keyed by schema name, for the provider the feature
  **resolves to** (its `FEATURE_MODELS` default):

  ```ts
  buildApp({ config, db, overrides: {
    llm: { openai: new MockLLMProvider('openai', { structuredBySchema: { [SCHEMA_NAME]: fixture } }) },
    repoIntel: stubRepoIntel([...]),
  } });
  ```

  Put one invented candidate in the fixture so the drop path runs end to
  end. Assert on `mock.calls` for prompt properties, e.g. exactly one
  `</untrusted>` when a sampled file contains one. Assert that re-running the
  feature preserves user decisions.

## Staying in your lane

| Don't | Do |
|---|---|
| Hardcode a model/provider in the module | Add a `FEATURE_MODELS` entry and call `resolveFeatureModel` |
| Persist the model's quoted evidence | Re-find it in the source and store the source slice |
| Hand-roll `<untrusted>` tags | `wrapUntrusted(label, text)` |
| `.optional()` fields in the output schema | Required (or `.nullable()`) fields |
| Duplicate a shared Zod enum in the service | Import it from `@devdigest/shared` |
| Leave the LLM route unthrottled | `config: { rateLimit }` from `constants.ts` |
| Do file I/O at module top level in anything the API imports | Read lazily inside the function that needs it |
