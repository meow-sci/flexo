import {
  $rotateStep,
  cycleRotateAxes,
  decreaseRotateStep,
  increaseRotateStep,
  rotatePairAxis,
  ROTATE_PAIRS,
} from '../state/editorStore'
import { toast } from './kit'

/**
 * UI-layer wrappers around the pure rotate-axis / rotate-step store actions that
 * add a brief (2s) toast so changes triggered by keyboard (R, F/⇧F) are visible.
 * Mirrors {@link ../ui/nudgeControls} so feedback is identical wherever the change
 * originates, and keeps editorStore free of UI/toast dependencies.
 */

const FEEDBACK_MS = 2000

/** Cycles the rotate-axis mapping (R) and toasts the new per-pair assignment. */
export function changeRotateAxes(): void {
  cycleRotateAxes(1)
  const summary = ROTATE_PAIRS.map(
    (pair) => `${pair.toUpperCase().split('').join('/')}→${rotatePairAxis(pair).toUpperCase()}`,
  ).join(' · ')
  toast({ title: `Rotate axes: ${summary}` }, { timeout: FEEDBACK_MS })
}

/** Increases the rotate step and toasts the new angle (F hotkey). */
export function raiseRotateStep(): void {
  increaseRotateStep()
  toast({ title: `Rotation step: ${$rotateStep.get()}°` }, { timeout: FEEDBACK_MS })
}

/** Decreases the rotate step and toasts the new angle (⇧F hotkey). */
export function lowerRotateStep(): void {
  decreaseRotateStep()
  toast({ title: `Rotation step: ${$rotateStep.get()}°` }, { timeout: FEEDBACK_MS })
}
