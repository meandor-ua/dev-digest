/* providers.tsx — client provider stack: React Query + Theme + active Repo. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { ThemeProvider } from "./theme";
import { RepoProvider } from "./repo-context";
import { ToastProvider, notify } from "./toast";
import { ApiError } from "./api";

export function Providers({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  // Client-side failures carry a stable code; show translated copy for those.
  // Server errors keep the API's own message.
  const errorMessage = (e: unknown): string => {
    if (e instanceof ApiError && e.code === "timeout") return t("errors.timeout");
    if (e instanceof Error) return e.message;
    return t("errors.generic");
  };
  const [qc] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
        // Global error surfacing (errors anywhere → toast). Mutations always
        // toast (they are user actions). Queries only toast on network/5xx —
        // expected 4xx like a 404 "no tour yet" stay silent for inline empty states.
        queryCache: new QueryCache({
          onError: (err) => {
            const status = err instanceof ApiError ? err.status : 500;
            if (status === 0 || status >= 500) notify.error(errorMessage(err));
          },
        }),
        mutationCache: new MutationCache({
          onError: (err) => notify.error(errorMessage(err)),
        }),
      })
  );
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <RepoProvider>{children}</RepoProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
