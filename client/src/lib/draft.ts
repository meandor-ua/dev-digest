/* Unsaved-form ("draft") helpers shared by the entity editors (skills, agents):
   a three-way rebase that keeps a kept-mounted form in step with the server
   without clobbering the user's edits, and a patch of only the changed fields. */
import React from "react";

type Fields<D> = readonly (keyof D)[];

export function sameDraft<D>(fields: Fields<D>, a: D, b: D): boolean {
  return fields.every((k) => a[k] === b[k]);
}

/**
 * Three-way merge after the server copy changed (a restore, a toggle elsewhere,
 * a save): take the server's value for every field the user hasn't touched
 * since `base`, keep the user's value for the ones they have.
 */
export function rebaseDraft<D>(fields: Fields<D>, draft: D, base: D, server: D): D {
  const next = { ...draft };
  for (const k of fields) {
    if (draft[k] === base[k]) next[k] = server[k];
  }
  return next;
}

/** Only the fields that differ from the server — a save never re-sends stale values. */
export function draftPatch<D>(fields: Fields<D>, draft: D, server: D): Partial<D> {
  const patch: Partial<D> = {};
  for (const k of fields) {
    if (draft[k] !== server[k]) patch[k] = draft[k];
  }
  return patch;
}

export interface DraftState<D> {
  draft: D;
  setDraft: React.Dispatch<React.SetStateAction<D>>;
  server: D;
  dirty: boolean;
  /** Drop unsaved edits — back to the saved copy. */
  reset: () => void;
}

/**
 * An editor's unsaved form state. Resets when `id` changes (a different
 * entity); rebases (see `rebaseDraft`) when the same entity changes on the
 * server. `server` must be a fresh projection of the entity's editable fields.
 */
export function useDraft<D>(id: string, server: D, fields: Fields<D>): DraftState<D> {
  const [draft, setDraft] = React.useState<D>(server);
  // The server copy the draft was last reconciled with.
  const [base, setBase] = React.useState<{ id: string; draft: D }>({ id, draft: server });
  if (base.id !== id) {
    setBase({ id, draft: server });
    setDraft(server);
  } else if (!sameDraft(fields, base.draft, server)) {
    setBase({ id, draft: server });
    setDraft((d) => rebaseDraft(fields, d, base.draft, server));
  }
  return { draft, setDraft, server, dirty: !sameDraft(fields, draft, server), reset: () => setDraft(server) };
}
