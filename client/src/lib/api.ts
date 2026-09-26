/* api.ts — typed fetch client for the F1 Fastify engine (localhost:3001).
   All hooks build on `apiFetch`. Errors are normalized to ApiError so the
   error-UX taxonomy (toast/inline/full-screen) can branch on status. */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiFetchInit extends RequestInit {
  /** Aborts the request after this many ms, surfacing a clear timeout error
   *  instead of leaving the caller (and any loading UI) waiting indefinitely
   *  on a slow upstream call (e.g. a long LLM completion). */
  timeoutMs?: number;
}

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  const timeoutController = timeoutMs ? new AbortController() : undefined;
  const handle = timeoutController
    ? setTimeout(() => timeoutController.abort(), timeoutMs)
    : undefined;
  // Honour BOTH a caller's signal and the timeout — neither replaces the other.
  if (timeoutController && rest.signal) {
    const caller = rest.signal;
    if (caller.aborted) timeoutController.abort();
    else caller.addEventListener("abort", () => timeoutController.abort(), { once: true });
  }
  const timedOut = () => !!timeoutController?.signal.aborted && !rest.signal?.aborted;
  const timeoutError = (e: unknown) =>
    // Code-keyed: the global toast (providers.tsx) shows translated copy for it.
    new ApiError("The request took too long and was cancelled.", 0, "timeout", e);

  // The timeout covers the whole exchange — a slow body stream included —
  // so it's cleared only once the response has been fully read.
  try {
    return await readResponse<T>(path, rest, timeoutController?.signal, timedOut, timeoutError);
  } finally {
    clearTimeout(handle);
  }
}

async function readResponse<T>(
  path: string,
  rest: RequestInit,
  timeoutSignal: AbortSignal | undefined,
  timedOut: () => boolean,
  timeoutError: (e: unknown) => ApiError,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: timeoutSignal ?? rest.signal,
      headers: {
        // Only declare a JSON body when one is actually sent — otherwise a
        // body-less POST/PUT (e.g. tour generate, refresh, reindex) trips
        // Fastify's "Body cannot be empty when content-type is application/json".
        ...(rest.body != null ? { "content-type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
    });
  } catch (e) {
    if (timedOut()) throw timeoutError(e);
    // A caller's own abort isn't an outage — let it through as-is.
    if (rest.signal?.aborted) throw e;
    // network failure / API down → full-screen error candidate
    throw new ApiError(
      `Cannot reach the DevDigest engine at ${API_BASE}. Is the API running?`,
      0,
      "network_error",
      e
    );
  }

  if (!res.ok) {
    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message ?? message;
        details = body.error.details;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code, details);
  }

  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch (e) {
    if (timedOut()) throw timeoutError(e);
    throw e;
  }
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown, opts?: { timeoutMs?: number }) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: opts?.timeoutMs,
    }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
