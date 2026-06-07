import type { Vec3 } from '../ksa/types'
import {
  pushUndo,
  selectedTransformRefs,
  updateSelectedTransforms,
  type PlacementTransform,
} from '../state/editorStore'
import { isLayerLocked } from '../state/layerStore'
import { centroidOf } from './bulkTransform'

/**
 * Applies `transform` to every selected entity (SubParts, connectors, AND kittens)
 * as a single undo step, then writes them all back in one store update. Shared by
 * the rotate (WASD) and nudge (arrow-key) hotkeys so both get identical unified
 * selection semantics:
 *
 *   - Selection can span kinds → one transform pass over the whole selection.
 *   - `transform` receives each entity's current transform and the shared selection
 *     centroid (e.g. rotation pivots about it; translation ignores it).
 *   - No-op when nothing is selected, or when any selected entity is on a locked
 *     layer (mirrors the inspector, which disables transforms while locked).
 *
 * `label` is the undo description; the detail (entity name / count) is derived here.
 */
export function applySelectionTransform(
  label: string,
  transform: (current: PlacementTransform, centroid: Vec3) => PlacementTransform,
): void {
  const refs = selectedTransformRefs()
  if (refs.length === 0 || refs.some((r) => isLayerLocked(r.layerId))) return

  const centroid = centroidOf(refs.map((r) => r.transform.position))
  pushUndo(label, refs.length === 1 ? refs[0].name : `${refs.length} items`)
  updateSelectedTransforms(
    refs.map((r) => ({
      kind: r.kind,
      index: r.index,
      transform: transform(r.transform, centroid),
    })),
  )
}
