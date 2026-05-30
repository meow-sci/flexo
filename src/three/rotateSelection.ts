import type { EulerXYZ } from '../ksa/types'
import { $rotateStep, rotatePairAxis, type RotatePair } from '../state/editorStore'
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

/**
 * Rotates the selection about the axis currently assigned to a key pair (W/S, A/D,
 * Q/E) by the live {@link $rotateStep} amount; `sign` picks the direction (the two
 * keys of the pair). The axis mapping is rotated by the R hotkey — see
 * {@link rotatePairAxis}. Thin wrapper over {@link rotateSelectionBy}.
 */
export function rotateSelectionAroundPair(pair: RotatePair, sign: 1 | -1): void {
  const axis = rotatePairAxis(pair)
  const amount = $rotateStep.get() * sign
  rotateSelectionBy({
    x: axis === 'x' ? amount : 0,
    y: axis === 'y' ? amount : 0,
    z: axis === 'z' ? amount : 0,
  })
}
