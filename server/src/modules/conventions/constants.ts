/**
 * Conventions Extractor budgets and thresholds. Tuned to keep a scan to a
 * single cheap structured call while still giving the model enough surface
 * to ground a citation in.
 */

/** Config files read directly from the clone (repo-intel's index deliberately excludes them). */
export const CONFIG_WISHLIST = [
  'package.json',
  'tsconfig.json',
  '.eslintrc.json',
  '.eslintrc.js',
  'eslint.config.js',
  'eslint.config.mjs',
  '.prettierrc',
  '.prettierrc.json',
  '.editorconfig',
  'biome.json',
  'CONTRIBUTING.md',
  'CLAUDE.md',
  'AGENTS.md',
];

/** Highest-ranked source files added to the config wishlist for sampling. */
export const RANKED_SAMPLE_COUNT = 12;

/** Per-file truncation before it enters the model's context. */
export const MAX_FILE_LINES = 220;
export const MAX_FILE_CHARS = 12_000;
/** Whole-sample truncation across every file, applied after per-file limits. */
export const MAX_SAMPLE_CHARS = 90_000;

/** A candidate whose evidence snippet is shorter than this (non-space chars) is dropped. */
export const MIN_SNIPPET_CHARS = 8;

/** A multi-line snippet is verified and stored for at most this many consecutive non-blank lines. */
export const MAX_SNIPPET_LINES = 15;

/** Max candidates the model may propose in one scan. */
export const CANDIDATE_CAP = 12;

export const CONVENTIONS_SCHEMA_NAME = 'ConventionExtraction';
export const CONVENTIONS_TEMPERATURE = 0.1;

/** Each scan is a paid LLM call over a large sample — cap it like the other LLM-backed routes. */
export const EXTRACT_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
