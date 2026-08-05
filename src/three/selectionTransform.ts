import type { Transform, Vec3 } from '../ksa/types';
import {
  $colliderEditContext,
  $lightEditContext,
  $part,
  pushUndo,
  selectedTransformRefs,
  updateSelectedTransforms,
  type EntityKind,
  type PlacementTransform,
  type SelectedTransformRef,
} from '../state/editorStore';
import { isLayerLocked } from '../state/layerStore';
import { centroidOf } from './bulkTransform';
import { colliderLocalFromWorld, colliderWorld, lightLocalFromWorld, lightWorld } from './coords';

/**
 * The shared **owner-frame lift** plus the selection-wide transform pass built on it.
 *
 * A SubPart-owned collider or light stores its transform in its OWNER's frame, and is drawn
 * once per placement of that template. Every world-space edit therefore has to (1) lift the
 * stored transform into Part space through the instance the user is working through, (2) do
 * its math there, and (3) push the result back down through the matching inverse.
 *
 * v1 did that for the gizmo only (`EditorScene.worldTransformRefs`) — keyboard nudge/rotate
 * and the numeric bulk panel used the raw owner-local refs, so "nudge +1 m on X" moved an
 * owned light along the OWNER's X (scaled by owner scale), silently differently from
 * dragging the same selection with the gizmo (census: selection-transform.md pain 4).
 * {@link liftedSelectionRefs} / {@link writeBackLifted} are that one lift, exported so the
 * gizmo, the keyboard tools and the multi-select panel all share it and cannot drift apart.
 *
 * The two rules are NOT interchangeable (coords.ts documents the contrast): a collider
 * ignores the owner's scale entirely; a light applies it to the position offset only.
 */

/**
 * The placement an owned entity is currently edited through — the instance last clicked,
 * from the same context atoms the gizmo's attach rule reads ({@link $colliderEditContext} /
 * {@link $lightEditContext}, default 0, clamped). `null` for a part-level entity, or one
 * whose owner template is not placed: those already live in Part space.
 */
function ownerFrameOf(kind: EntityKind, id: string): Transform | null {
  const part = $part.get();
  if (kind === 'collider') {
    const collider = part.colliders.find((c) => c.id === id);
    if (!collider?.ownerTemplateId) return null;
    const owners = part.placements.filter((p) => p.subPartTemplateId === collider.ownerTemplateId);
    return owners[contextIndex($colliderEditContext.get()[id], owners.length)] ?? null;
  }
  if (kind === 'light') {
    const light = part.lights.find((l) => l.id === id);
    if (!light?.ownerTemplateId) return null;
    const owners = part.placements.filter((p) => p.subPartTemplateId === light.ownerTemplateId);
    return owners[contextIndex($lightEditContext.get()[id], owners.length)] ?? null;
  }
  return null;
}

function contextIndex(stored: number | undefined, count: number): number {
  return Math.max(0, Math.min(stored ?? 0, count - 1));
}

/**
 * {@link selectedTransformRefs} with every SubPart-owned collider/light lifted into PART
 * space. Other kinds pass through untouched (their stored transform already is part-space).
 */
export function liftedSelectionRefs(): SelectedTransformRef[] {
  return selectedTransformRefs().map((ref) => {
    if (ref.kind === 'collider') {
      const frame = ownerFrameOf('collider', ref.id);
      return frame ? { ...ref, transform: colliderWorld(ref.transform, frame) } : ref;
    }
    if (ref.kind === 'light')
      // lightWorld takes the null frame itself: a part-level (or unplaced-owner) light's
      // local transform already IS its part-frame pose.
      return { ...ref, transform: lightWorld(ref.transform, ownerFrameOf('light', ref.id)) };
    return ref;
  });
}

/**
 * Writes part-space transforms back, pushing SubPart-owned colliders/lights down through
 * the inverse of the SAME lift {@link liftedSelectionRefs} took them up with. Does NOT push
 * undo — the caller pushes once at interaction start (gizmo drag / keypress / Apply).
 */
export function writeBackLifted(
  updates: readonly { kind: EntityKind; id: string; transform: PlacementTransform }[],
): void {
  updateSelectedTransforms(
    updates.map((u) => {
      if (u.kind === 'collider') {
        const frame = ownerFrameOf('collider', u.id);
        return frame ? { ...u, transform: colliderLocalFromWorld(u.transform, frame) } : u;
      }
      if (u.kind === 'light')
        return { ...u, transform: lightLocalFromWorld(u.transform, ownerFrameOf('light', u.id)) };
      return u;
    }),
  );
}

/**
 * Applies `transform` to every selected entity (SubParts, connectors, AND kittens)
 * as a single undo step, then writes them all back in one store update. Shared by
 * the rotate (WASD) and nudge (arrow-key) hotkeys so both get identical unified
 * selection semantics:
 *
 *   - Selection can span kinds → one transform pass over the whole selection.
 *   - `transform` receives each entity's current transform and the shared selection
 *     centroid (e.g. rotation pivots about it; translation ignores it).
 *   - Both are in **Part space** — owned colliders/lights are lifted on the way in and
 *     pushed back down on the way out, so a keyboard nudge moves exactly as far, in
 *     exactly the direction, a gizmo drag would (the pain-4 fix).
 *   - No-op when nothing is selected, or when any selected entity is on a locked
 *     layer (mirrors the inspector, which disables transforms while locked).
 *
 * `label` is the undo description; the detail (entity name / count) is derived here.
 */
export function applySelectionTransform(
  label: string,
  transform: (current: PlacementTransform, centroid: Vec3) => PlacementTransform,
): void {
  const refs = liftedSelectionRefs();
  if (refs.length === 0 || refs.some((r) => isLayerLocked(r.layerId))) return;

  const centroid = centroidOf(refs.map((r) => r.transform.position));
  pushUndo(label, refs.length === 1 ? refs[0].name : `${refs.length} items`);
  writeBackLifted(
    refs.map((r) => ({
      kind: r.kind,
      id: r.id,
      transform: transform(r.transform, centroid),
    })),
  );
}
