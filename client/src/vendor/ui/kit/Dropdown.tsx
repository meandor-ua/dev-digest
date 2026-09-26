import React from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons";
import { type DropdownItemDef } from "./types";

function DropdownItem({ it, onClose }: { it: DropdownItemDef; onClose: () => void }) {
  const [h, setH] = React.useState(false);
  const I = it.icon ? Icon[it.icon] : null;
  return (
    <button
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => {
        it.onClick?.();
        onClose();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        borderRadius: 6,
        border: "none",
        background: h ? "var(--bg-hover)" : "transparent",
        color: it.muted ? "var(--text-secondary)" : "var(--text-primary)",
        fontSize: 14,
        fontWeight: 500,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      {I && <I size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
      <span style={{ flex: 1 }}>{it.label}</span>
      {it.hint && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{it.hint}</span>}
      {it.onRemove && (
        <span
          role="button"
          aria-label={it.removeLabel ?? "Remove"}
          title={it.removeLabel ?? "Remove"}
          onClick={(e) => {
            e.stopPropagation();
            it.onRemove!();
            onClose();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 3,
            borderRadius: 5,
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          <Icon.Trash size={13} />
        </span>
      )}
    </button>
  );
}

/** Gap between trigger and menu, and the minimum clearance kept from the viewport edge. */
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;
/** Below this much room under the trigger, open upward if there is more room above. */
const MIN_COMFORTABLE_HEIGHT = 160;

export interface PortalPos {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
}

/**
 * Where a portaled (`position: fixed`) menu goes: below the trigger, or above
 * it when there's clearly more room there, with its height capped so the whole
 * menu stays inside the viewport. It must fit: reaching an item that hangs
 * off-screen means scrolling the page, and any scroll outside the menu closes a
 * portaled menu, so the item could never be clicked.
 */
export function portalPosition(
  r: Pick<DOMRect, "top" | "bottom" | "left" | "right">,
  viewportHeight: number,
  align: "left" | "right",
  width: number,
  maxHeight: number,
): PortalPos {
  const left = align === "right" ? r.right - width : r.left;
  const below = viewportHeight - r.bottom - MENU_GAP - VIEWPORT_MARGIN;
  const above = r.top - MENU_GAP - VIEWPORT_MARGIN;
  if (below >= Math.min(maxHeight, MIN_COMFORTABLE_HEIGHT) || below >= above) {
    return { top: r.bottom + MENU_GAP, left, maxHeight: Math.max(0, Math.min(maxHeight, below)) };
  }
  return {
    bottom: viewportHeight - r.top + MENU_GAP,
    left,
    maxHeight: Math.max(0, Math.min(maxHeight, above)),
  };
}

export function Dropdown({
  trigger,
  items,
  align = "left",
  width = 230,
  portal = false,
  maxHeight = 320,
}: {
  trigger: React.ReactNode;
  items: DropdownItemDef[];
  align?: "left" | "right";
  width?: number;
  /** Render the menu into `document.body` instead of in place. Needed when an
   *  ancestor clips overflow (e.g. the PR list's `overflow: hidden` table
   *  card), which would otherwise cut off the menu on the bottom rows.
   *  Theme-safe: the CSS variables live on `<html>`, which a body portal
   *  still inherits. */
  portal?: boolean;
  /** Cap on the menu's height; a longer item list scrolls inside the menu
   *  instead of growing the page (which would force a scroll to reach it). */
  maxHeight?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<PortalPos | null>(null);

  // Click-outside must check BOTH the trigger AND the menu: once the menu is
  // portaled it is no longer a DOM descendant of `ref`, so a `mousedown` on a
  // menu item would close the menu before that item's own `click` ever fired
  // (documented in client/insights/INSIGHTS.md; same dual-ref shape as
  // SeverityFindingsPopover's trigger/panel refs).
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // A portaled menu is `position: fixed` at a rect measured ONCE on open, so it
  // would visually detach from its trigger as soon as anything scrolls (the PR
  // list renders one of these per row). Closing is the honest minimum: cheaper
  // and less jumpy than live repositioning, and `mousedown` alone never sees a
  // scroll. Capture phase so scrolling in ANY ancestor counts, not just window.
  // Only portaled menus: an in-place menu scrolls along with its trigger. And
  // never on a scroll INSIDE the menu itself — that's the user reaching a
  // lower item of a long list.
  React.useEffect(() => {
    if (!open || !portal) return;
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, portal]);

  // A portaled menu is positioned from the trigger's viewport rect, since it no
  // longer has the trigger as its offset parent. `next` is computed outside the
  // updater: StrictMode double-invokes updaters, so measuring/`setPos` in there
  // would run twice per click.
  const toggle = () => {
    const next = !open;
    if (next && portal && ref.current) {
      setPos(portalPosition(ref.current.getBoundingClientRect(), window.innerHeight, align, width, maxHeight));
    }
    setOpen(next);
  };

  const menu = (
    <div
      ref={menuRef}
      /* No `role="menu"`/`role="menuitem"` here: none of the keyboard contract
         those roles promise (arrow-key navigation, focus move on open, Escape
         to close, aria-haspopup/expanded on the trigger) is implemented, and
         announcing "menu" for a widget that doesn't behave like one is worse
         than the plain button semantics. Tests/flows locate this by testid. */
      data-testid="dropdown-menu"
      style={
        portal
          ? {
              position: "fixed",
              ...(pos?.bottom !== undefined ? { bottom: pos.bottom } : { top: pos?.top ?? 0 }),
              left: pos?.left ?? 0,
              width,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              boxShadow: "var(--shadow-modal)",
              padding: 6,
              maxHeight: pos?.maxHeight ?? maxHeight,
              overflowY: "auto",
              zIndex: 40,
              animation: "ddpop .12s ease",
            }
          : {
              position: "absolute",
              top: "calc(100% + 6px)",
              [align]: 0,
              width,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              boxShadow: "var(--shadow-modal)",
              padding: 6,
              maxHeight,
              overflowY: "auto",
              zIndex: 40,
              animation: "ddpop .12s ease",
            }
      }
    >
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
        ) : (
          <DropdownItem key={i} it={it} onClose={() => setOpen(false)} />
        )
      )}
    </div>
  );

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <div onClick={toggle}>{trigger}</div>
      {open && (portal ? createPortal(menu, document.body) : menu)}
    </div>
  );
}
