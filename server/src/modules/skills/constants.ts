/** Input limits shared by the route schemas and the URL importer. */
export const SKILL_NAME_MAX = 200;
export const SKILL_DESCRIPTION_MAX = 1000;
export const SKILL_BODY_MAX = 100_000;
export const SKILL_MESSAGE_MAX = 200;
/** Attached context docs per skill, and the max length of one repo-relative path. */
export const SKILL_CONTEXT_MAX_DOCS = 100;
export const SKILL_CONTEXT_PATH_MAX = 500;
/** Per-client cap on the two routes that fetch a remote URL (import + import/preview). */
export const REMOTE_IMPORT_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
