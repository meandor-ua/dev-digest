/* hooks/trace.ts — A5 Run Trace. GET /runs/:id/trace returns the ENTIRE
   trace of one run as a single document (config + stats + prompt_assembly +
   tool_calls[] + raw_output + memory_pulled[] + full log). Registered by A2;
   A5 enriches the document it returns. Live events stream via useRunEvents
   (hooks/reviews.ts) — the drawer combines both. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { RunTrace } from "@devdigest/shared";

export function useRunTrace(runId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["run-trace", runId],
    queryFn: () => api.get<RunTrace>(`/runs/${runId}/trace`),
    enabled: !!runId && enabled,
    // The trace row can lag a just-finished run (404 until written): retry once,
    // then poll until it exists so the drawer never sticks on "no trace".
    retry: 1,
    refetchInterval: (q) => (q.state.data ? false : 2000),
  });
}
