import type { CSSProperties } from "react";

export const s = {
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
  } satisfies CSSProperties,
  pageTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
  } satisfies CSSProperties,
  pageSubtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 4,
  } satisfies CSSProperties,
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  acceptedCount: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  linkBtn: {
    background: "none",
    border: "none",
    color: "var(--accent)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
  } satisfies CSSProperties,
  cardsList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  loadingStack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
};
