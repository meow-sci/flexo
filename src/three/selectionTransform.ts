import type { Vec3 } from '../ksa/types'
import {
  $part,
  $selectedConnectorIndices,
  $selectedIndices,
  pushUndo,
  updateConnectorTransforms,
  updatePlacementTransforms,
  type PlacementTransform,
} from '../state/editorStore'
import { isLayerLocked } from '../state/layerStore'
import { centroidOf } from './bulkTransform'

/**
 * Applies `transform` to every selected entity (SubParts or connectors) as a single
 * undo step, then writes them back in one store update. Shared by the rotate (WASD)
 * and nudge (arrow-key) hotkeys so both get identical selection semantics:
 *
 *   - SubPart and connector selection are mutually exclusive → exactly one branch.
 *   - `transform` receives each entity's current transform and the selection
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
  const part = $part.get()
  const subIndices = $selectedIndices.get()
  const conIndices = $selectedConnectorIndices.get()

  if (subIndices.length > 0) {
    const items = subIndices
      .map((index) => ({ index, placement: part.placements[index] }))
      .filter((it) => it.placement != null)
    if (items.length === 0 || items.some((it) => isLayerLocked(it.placement.layerId))) return

    const centroid = centroidOf(items.map((it) => it.placement.position))
    pushUndo(label, items.length === 1 ? items[0].placement.instanceId : `${items.length} parts`)
    updatePlacementTransforms(
      items.map((it) => ({ index: it.index, transform: transform(it.placement, centroid) })),
    )
    return
  }

  if (conIndices.length > 0) {
    const items = conIndices
      .map((index) => ({ index, connector: part.connectors[index] }))
      .filter((it) => it.connector != null)
    if (items.length === 0 || items.some((it) => isLayerLocked(it.connector.layerId))) return

    const centroid = centroidOf(items.map((it) => it.connector.position))
    pushUndo(label, items.length === 1 ? items[0].connector.id : `${items.length} connectors`)
    updateConnectorTransforms(
      items.map((it) => ({ index: it.index, transform: transform(it.connector, centroid) })),
    )
  }
}
