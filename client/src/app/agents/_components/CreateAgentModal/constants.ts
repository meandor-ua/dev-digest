import type { Provider } from "@devdigest/shared";

/** Default provider/model for a new agent. */
export const DEFAULT_PROVIDER: Provider = "openai";
export const DEFAULT_MODEL = "gpt-4.1";

/** Selectable providers in the create form. */
export const PROVIDER_OPTIONS: readonly Provider[] = ["openai", "anthropic", "openrouter"];

/** Modal width (px). */
export const MODAL_WIDTH = 620;

/** Quick-start agent templates surfaced in the "Add Agent" dropdowns (list view + editor rail). */
export const TEMPLATES = ["Security", "Performance", "Mentor", "Conformance", "Architecture"] as const;
