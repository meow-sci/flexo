/**
 * Pure geometry for `FloatingWindow` (design-system-services.md §6.2) — no DOM, so the
 * clamp rule and the default-anchor resolution are unit-testable on their own.
 *
 * Coordinate convention: a stored float position is **band-absolute px** — an offset
 * from the workspace band's top-left, because the window renders `position: absolute`
 * inside the `[data-workspace-band]` element. The band spans the full window width
 * (foundation §1.1: it is the menubar-to-status-bar rows), so `band.left` is normally 0
 * and band-absolute x equals screen x.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Minimum window width that must stay on screen horizontally (§6.2). */
const MIN_VISIBLE_W = 120;
/** The title strip's height — the part that must never leave the band vertically (§6.2). */
const STRIP_H = 28;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Clamp rule of system-services §6.2: ≥120px of strip horizontally on screen
 * (x ∈ [120 - w, vw - 120]) and the 28px strip never leaves the band vertically
 * (y ∈ [bandTop, bandBottom - 28]). Positions are band-absolute px.
 */
export function clampFloatPos(
  pos: { x: number; y: number },
  size: { w: number; h: number },
  band: Rect,
  viewportWidth: number,
): { x: number; y: number } {
  return {
    x: clamp(pos.x, MIN_VISIBLE_W - size.w - band.left, viewportWidth - MIN_VISIBLE_W - band.left),
    y: clamp(pos.y, 0, Math.max(0, band.height - STRIP_H)),
  };
}

/** Where a window's default position hangs off the viewport cell (§6.2). */
export interface FloatAnchor {
  h: 'left' | 'center' | 'right';
  v: 'top' | 'bottom';
  /** Inset from the chosen horizontal edge (ignored for 'center', where it offsets). */
  dx: number;
  /** Inset from the chosen vertical edge. */
  dy: number;
}

/**
 * Resolve a default anchor against the VIEWPORT CELL rect (§6.2) so a window lands clear
 * of the sidebars, and return the equivalent band-absolute position.
 */
export function resolveAnchor(
  anchor: FloatAnchor,
  size: { w: number; h: number },
  cell: Rect,
  band: Rect,
): { x: number; y: number } {
  const x =
    anchor.h === 'left'
      ? cell.left + anchor.dx
      : anchor.h === 'right'
        ? cell.left + cell.width - size.w - anchor.dx
        : cell.left + (cell.width - size.w) / 2 + anchor.dx;
  const y = anchor.v === 'top' ? cell.top + anchor.dy : cell.top + cell.height - size.h - anchor.dy;
  return { x: x - band.left, y: y - band.top };
}
