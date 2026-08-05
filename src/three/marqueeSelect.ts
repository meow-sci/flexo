import type { EntityKind, SelectionRef } from '../state/editorStore';

/**
 * The marquee's hit rule as pure math (design: design-build-mode.md §1.4). Data in, refs
 * out — no three.js, no react, no store reads — so the whole selection semantic is unit
 * testable without a renderer. `EditorScene` owns the only messy part: projecting each
 * entity's visuals to screen-space boxes.
 */

/** One selectable visual's screen-space axis-aligned bounding box, in canvas pixels. */
export interface ScreenAabb {
  kind: EntityKind;
  id: string;
  /**
   * Which visual of a multi-instance entity this box belongs to (SubPart-owned colliders
   * and lights are drawn once per placement of their owner template). Undefined for the
   * single-visual kinds.
   */
  instanceIndex?: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The drag rectangle, as the two corners it was dragged between (either order). */
export interface MarqueeRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface NormalizedRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Corner-order-independent bounds — a drag up-and-left is the same rectangle. */
export function normalizeRect(r: MarqueeRect): NormalizedRect {
  return {
    minX: Math.min(r.x0, r.x1),
    minY: Math.min(r.y0, r.y1),
    maxX: Math.max(r.x0, r.x1),
    maxY: Math.max(r.y0, r.y1),
  };
}

/** Do two boxes overlap? Edge contact counts — a rect grazing a box selects it. */
export function rectsIntersect(a: NormalizedRect, b: NormalizedRect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** One entity caught by the marquee. */
export interface MarqueeHit {
  ref: SelectionRef;
  /**
   * The first hit visual's index, for the context capture a SubPart-owned collider/light
   * needs (which placement's frame the gizmo writes back through). Undefined when the
   * matching box carried no `instanceIndex`.
   */
  firstInstance?: number;
}

/**
 * Every entity whose screen AABB intersects the rectangle, in first-appearance order.
 *
 * Multi-instance entities test **per instance**, but selecting any instance selects the
 * one document entity ONCE; the FIRST hit instance in `boxes` order is reported so the
 * caller can record the edit context (design §1.4).
 *
 * Eligibility (hidden / locked layers, hidden kinds, aids) is the CALLER's job — it decides
 * which boxes exist at all, which keeps this function a pure geometric test.
 */
export function marqueeHits(rect: MarqueeRect, boxes: readonly ScreenAabb[]): MarqueeHit[] {
  const bounds = normalizeRect(rect);
  const out: MarqueeHit[] = [];
  const seen = new Set<string>();
  for (const box of boxes) {
    if (!rectsIntersect(bounds, box)) continue;
    const key = `${box.kind}:${box.id}`;
    if (seen.has(key)) continue; // another instance of this entity already matched
    seen.add(key);
    const hit: MarqueeHit = { ref: { kind: box.kind, id: box.id } };
    if (box.instanceIndex !== undefined) hit.firstInstance = box.instanceIndex;
    out.push(hit);
  }
  return out;
}
