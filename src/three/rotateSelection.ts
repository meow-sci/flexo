import type { EulerXYZ } from '../ksa/types'
import { quatFromEulerDeg, rotatedAroundOriginTransform } from './bulkTransform'
import { applySelectionTransform } from './selectionTransform'

/**
 * Rotates the current selection by `deg` (world-axis Euler degrees) about the
 * selection's centroid, recorded as a single undo step. Mirrors the numeric
 * "Rotate by" inspector (same {@link rotatedAroundOriginTransform} math) so the
 * WASD hotkeys and the inspector stay consistent. See {@link applySelectionTransform}
 * for the shared selection / lock / undo semantics.
 */
export function rotateSelectionBy(deg: EulerXYZ): void {
  const deltaQuat = quatFromEulerDeg(deg)
  applySelectionTransform('rotate', (current, centroid) =>
    rotatedAroundOriginTransform(current, deltaQuat, centroid),
  )
}
