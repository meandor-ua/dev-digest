/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/**
 * Total character budget for the project-context docs of one agent run. Each
 * doc is already capped at read time (project-docs MAX_DOC_BYTES), but several
 * skills × many docs would otherwise add megabytes to every agent's prompt.
 * Docs are taken in skill order then doc order; whatever doesn't fit is logged.
 */
export const CONTEXT_DOCS_MAX_CHARS = 120_000;
