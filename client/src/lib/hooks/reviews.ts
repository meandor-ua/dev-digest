/* hooks/reviews.ts — React Query + SSE hooks for the A2 reviewer.
   Run a review, stream RunEvents live, act on findings. */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "../api";
import { notify } from "../toast";
import type {
  FindingActionKind,
  PrReviewComment,
  ReviewRecord,
  ReviewRunResponse,
  RunEvent,
  RunSummary,
} from "@devdigest/shared";

// ---- Active (in-flight) runs — server-side source of truth ----
export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}

/** In-flight runs for a PR, from the server (agent_runs where status='running').
   Survives reloads/devices; polls while anything is running so it self-clears. */
export function usePrActiveRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-active-runs", prId],
    queryFn: () => api.get<ActiveRun[]>(`/pulls/${prId}/runs/active`),
    enabled: !!prId,
    // Always re-check on mount: runs can start outside this page (the PR
    // list's Run Review, another tab), and a cached [] would otherwise stop
    // polling from ever starting for up to the global 30s staleTime.
    staleTime: 0,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 4000 : false),
  });
}

/** Refresh everything a FINISHED run changes — its review + findings (Review
 *  runs section), the PR's derived status/score (detail header, PR list) and
 *  its run history — the moment a run leaves the server's active set.
 *
 *  Keyed off DATA (the polled active-run ids shrinking), deliberately NOT off
 *  RunStatus's SSE `onDone`: RunStatus only renders while this same active set
 *  is non-empty, so when the 4s poll empties it first, RunStatus unmounts
 *  before its stream reports "done" and the reviews were never refetched —
 *  the Timeline (which polls on its own) updated while Review runs stayed stale
 *  until a reload. The server persists the review BEFORE marking the run done
 *  (run-executor: insertReview → completeAgentRun), so a refetch here always
 *  sees it. */
export function useRefreshWhenRunsSettle(
  prId: string | null | undefined,
  activeRunIds: string[] | undefined,
) {
  const qc = useQueryClient();
  const prev = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!prId || !activeRunIds) return;
    const now = new Set(activeRunIds);
    const settled = [...prev.current].some((id) => !now.has(id));
    prev.current = now;
    if (!settled) return;
    qc.invalidateQueries({ queryKey: ["reviews", prId] });
    qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
    qc.invalidateQueries({ queryKey: ["pull", prId] });
    qc.invalidateQueries({ queryKey: ["pulls"] });
    qc.invalidateQueries({ queryKey: ["run-trace"] });
  }, [prId, activeRunIds, qc]);
}

/** Invalidate the PR-level data derived from a PR's reviews on the server — the
 *  list row's score / FINDINGS / COST (`["pulls"]`) and the detail header
 *  (`["pull", prId]`). Any mutation that adds or removes a review or run, or
 *  changes a finding's active state, must call this, otherwise the list keeps
 *  the old values for the global 30s staleTime or until a reload. */
function invalidatePrSummary(qc: ReturnType<typeof useQueryClient>, prId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: ["pull", prId] });
  qc.invalidateQueries({ queryKey: ["pulls"] });
}

// ---- Full run history for a PR (every agent_runs row, any status) ----
/** All runs for a PR — done, failed (with error), cancelled, running. Survives
   reload (DB-backed). Polls while anything is running so it self-updates. */
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-runs", prId],
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? 4000 : false,
  });
}

// ---- Persisted reviews + findings for a PR ----
export function usePrReviews(prId: string | null | undefined, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["reviews", prId],
    queryFn: () => api.get<ReviewRecord[]>(`/pulls/${prId}/reviews`),
    enabled: !!prId && (opts?.enabled ?? true),
  });
}

/** Delete one run from the PR's run history (+ its trace). */
export function useDeleteRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.del<{ ok: boolean }>(`/runs/${runId}`),
    // Deleting a run also deletes the review it produced (server-side), so drop
    // both the timeline and the Review Runs list from cache.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      invalidatePrSummary(qc, prId);
    },
  });
}

/** Request cancellation of an in-flight run (takes effect at the next step). */
export function useCancelRun() {
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
  });
}

/** Delete a whole review run (one agent's pass) + its findings. */
export function useDeleteReview(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.del<{ ok: boolean }>(`/reviews/${reviewId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      invalidatePrSummary(qc, prId);
    },
  });
}

// ---- Inline review comments on the "Files changed" tab (proxied to GitHub) --
/** Existing GitHub PR review comments, fetched live. */
export function usePrComments(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-comments", prId],
    queryFn: () => api.get<PrReviewComment[]>(`/pulls/${prId}/comments`),
    enabled: !!prId,
  });
}

export interface CreateCommentInput {
  path: string;
  line: number;
  side?: "LEFT" | "RIGHT";
  body: string;
  in_reply_to?: number;
}

/** Post one inline comment (or reply) to GitHub; refreshes the thread list. */
export function useCreatePrComment(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      api.post<PrReviewComment>(`/pulls/${prId}/comments`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-comments", prId] }),
  });
}

// ---- Run a review (all enabled agents or a specific agent) ----
export interface RunReviewInput {
  prId: string;
  agentId?: string;
  all?: boolean;
}

export function useRunReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentId, all }: RunReviewInput) =>
      api.post<ReviewRunResponse>(`/pulls/${prId}/review`, {
        ...(agentId ? { agentId } : {}),
        ...(all ? { all } : {}),
      }),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
    },
  });
}

// ---- Finding actions (accept/dismiss) ----
export function useFindingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      action,
      reply,
      prId: _prId,
    }: {
      findingId: string;
      action: FindingActionKind;
      reply?: string;
      prId?: string;
    }) =>
      api.post<{ finding: ReviewRecord["findings"][number]; memoryId?: string }>(
        `/findings/${findingId}/${action}`,
        reply ? { reply } : undefined,
      ),
    onSuccess: (_d, { prId }) => {
      if (!prId) return;
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      // Dismiss / undo changes the ACTIVE counts behind the list's FINDINGS badge.
      invalidatePrSummary(qc, prId);
    },
  });
}

// ---- Shared per-run SSE streams ----
// ONE EventSource per run, ref-counted across every useRunEvents caller. The
// Findings tab's live section and the Run Trace drawer watch the SAME runs.
// Separate streams per caller used up Chrome's 6-connections-per-host HTTP/1.1
// limit (the limit covers all tabs): the drawer's own stream then sat queued
// behind the others, its log stayed empty and the filter looked dead until a
// run finished and freed a slot.
interface RunStream {
  es: EventSource;
  /** Events tagged with a global arrival order, so a multi-run merge keeps
   *  interleaving them in the order they arrived. */
  events: { n: number; e: RunEvent }[];
  open: boolean;
  refs: number;
  subs: Set<() => void>;
  closeTimer: ReturnType<typeof setTimeout> | null;
}
const streams = new Map<string, RunStream>();
let arrival = 0;

function acquireRunStream(runId: string): RunStream {
  const existing = streams.get(runId);
  if (existing) {
    existing.refs += 1;
    if (existing.closeTimer) clearTimeout(existing.closeTimer);
    existing.closeTimer = null;
    return existing;
  }
  const es = new EventSource(`${API_BASE}/runs/${runId}/events`);
  const stream: RunStream = { es, events: [], open: true, refs: 1, subs: new Set(), closeTimer: null };
  const changed = () => stream.subs.forEach((f) => f());
  const onMsg = (ev: MessageEvent) => {
    try {
      const parsed = JSON.parse(ev.data) as RunEvent;
      stream.events.push({ n: ++arrival, e: parsed });
      // Runtime agent failures arrive as SSE `error` events (not as a
      // mutation/query error), so the global error toast never sees them —
      // surface them here (once per stream, not once per subscriber).
      if (parsed.kind === "error" && parsed.msg) notify.error(parsed.msg);
      changed();
    } catch {
      /* ignore non-JSON keepalive frames (and dataless native error events) */
    }
  };
  // The server tags events with kind as the SSE `event:` name AND emits them
  // as default messages too in some clients — listen broadly.
  es.onmessage = onMsg;
  for (const kind of ["info", "tool", "result", "error"]) {
    es.addEventListener(kind, onMsg as EventListener);
  }
  es.onerror = () => {
    es.close();
    stream.open = false;
    // A later subscriber gets a fresh stream (the server replays its buffer).
    if (streams.get(runId) === stream) streams.delete(runId);
    changed();
  };
  streams.set(runId, stream);
  return stream;
}

function releaseRunStream(runId: string, stream: RunStream) {
  stream.refs -= 1;
  if (stream.refs > 0) return;
  // Deferred so an immediate re-acquire (StrictMode's mount → unmount → mount,
  // or a component swap in the same commit) reuses the connection.
  stream.closeTimer = setTimeout(() => {
    if (stream.refs > 0) return;
    stream.es.close();
    stream.open = false;
    if (streams.get(runId) === stream) streams.delete(runId);
  }, 0);
}

/**
 * Subscribe to a run's SSE event stream. Returns the accumulated RunEvents and a
 * `running` flag (true until the stream closes). Live status for the
 * RunReviewDropdown / Live Log. Multiple runIds are subscribed in parallel;
 * callers watching the same run share one connection (see RunStream).
 */
export function useRunEvents(runIds: string[]) {
  const key = runIds.join(",");
  const [acquired, setAcquired] = React.useState<RunStream[]>([]);
  const [version, bump] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    const ids = key ? key.split(",") : [];
    const held = ids.map((id) => [id, acquireRunStream(id)] as const);
    const onChange = () => bump();
    for (const [, st] of held) st.subs.add(onChange);
    setAcquired(held.map(([, st]) => st));
    return () => {
      for (const [id, st] of held) {
        st.subs.delete(onChange);
        releaseRunStream(id, st);
      }
    };
  }, [key]);

  const events = React.useMemo(
    () =>
      acquired
        .flatMap((st) => st.events)
        .sort((a, b) => a.n - b.n)
        .map((x) => x.e),
    // `version` bumps on every event pushed into one of the held streams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acquired, version],
  );
  const running = acquired.some((st) => st.open);
  return { events, running };
}
