/* Unsaved-changes guard shared between an editor and the navigation around it
   (e.g. the Skills page's side list). The editor reports its dirty flag; any
   in-app navigation asks before discarding, and a tab close/reload gets the
   browser's native "leave site?" prompt. */
"use client";

import React from "react";

const DirtyRef = React.createContext<React.MutableRefObject<boolean> | null>(null);

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const dirty = React.useRef(false);
  return <DirtyRef.Provider value={dirty}>{children}</DirtyRef.Provider>;
}

/** Called by the editor that owns the draft. */
export function useReportUnsaved(dirty: boolean) {
  const ref = React.useContext(DirtyRef);
  React.useEffect(() => {
    if (!ref) return;
    ref.current = dirty;
    return () => {
      ref.current = false;
    };
  }, [dirty, ref]);

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/**
 * Returns a check to run before an in-app navigation: true when it's safe to
 * leave (nothing unsaved, or the user confirmed discarding). Outside a
 * provider there is never anything unsaved.
 */
export function useConfirmDiscard(): (message: string) => boolean {
  const ref = React.useContext(DirtyRef);
  return React.useCallback((message: string) => !ref?.current || window.confirm(message), [ref]);
}
