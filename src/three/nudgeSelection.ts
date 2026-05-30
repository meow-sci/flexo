import type { Vec3 } from '../ksa/types'
import { $nudgeAxis, $nudgeStep, type NudgeAxis } from '../state/editorStore'
import { translatedTransform } from './bulkTransform'
import { applySelectionTransform } from './selectionTransform'

/** Direction of a nudge along the active axis: +1 (↑) or -1 (↓). */
export type NudgeSign = 1 | -1

/** Multiplier applied to the step for a "coarse" nudge (Shift + ↑/↓). */
export const FAST_NUDGE_MULTIPLIER = 5

/** The world-space offset for one nudge of `step` metres along `axis` in `sign`. */
export function nudgeDelta(axis: NudgeAxis, sign: NudgeSign, step: number): Vec3 {
  const delta: Vec3 = { x: 0, y: 0, z: 0 }
  delta[axis] = sign * step
  return delta
}

/**
 * Nudges the current selection along the active axis (`$nudgeAxis`) by
 * `$nudgeStep × multiplier` metres: ↑ is +sign, ↓ is -sign; `multiplier` is
 * {@link FAST_NUDGE_MULTIPLIER} for the Shift+arrow coarse nudge, else 1. One undo
 * step. No-op when nothing is selected or the selection is on a locked layer (see
 * {@link applySelectionTransform}).
 */
export function nudgeSelectionBy(sign: NudgeSign, multiplier = 1): void {
  const delta = nudgeDelta($nudgeAxis.get(), sign, $nudgeStep.get() * multiplier)
  applySelectionTransform('nudge', (current) => translatedTransform(current, delta))
}
