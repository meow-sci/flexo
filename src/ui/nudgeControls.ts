import {
  $nudgeAxis,
  $nudgeStep,
  cycleNudgeAxis,
  decrementNudgeStep,
  incrementNudgeStep,
} from '../state/editorStore'
import { toast } from './kit'

/**
 * UI-layer wrappers around the pure nudge-axis / nudge-step store actions that add
 * a brief (2s) toast so changes triggered by keyboard (←/→, M/Shift+M) are visible.
 * Used by both the hotkey registry and the status bubble so the feedback is
 * identical wherever the change originates. Kept out of editorStore, which stays
 * free of UI/toast dependencies.
 */

const FEEDBACK_MS = 2000

/** Formats the step for display; values are pre-rounded to ≤3 decimals upstream. */
export function formatNudgeStep(step: number): string {
  return String(step)
}

/** Cycles the nudge axis (1 = forward, -1 = backward) and toasts the new axis. */
export function changeNudgeAxis(direction: 1 | -1): void {
  cycleNudgeAxis(direction)
  toast({ title: `Nudge axis: ${$nudgeAxis.get().toUpperCase()}` }, { timeout: FEEDBACK_MS })
}

/** Increases the nudge step and toasts the new distance (M hotkey). */
export function raiseNudgeStep(): void {
  incrementNudgeStep()
  toast({ title: `Nudge step: ${formatNudgeStep($nudgeStep.get())} m` }, { timeout: FEEDBACK_MS })
}

/** Decreases the nudge step and toasts the new distance (Shift+M hotkey). */
export function lowerNudgeStep(): void {
  decrementNudgeStep()
  toast({ title: `Nudge step: ${formatNudgeStep($nudgeStep.get())} m` }, { timeout: FEEDBACK_MS })
}
