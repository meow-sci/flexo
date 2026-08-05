import {
  $nudgeAxis,
  $nudgeStep,
  cycleNudgeAxis,
  decrementNudgeStep,
  incrementNudgeStep,
} from '../state/editorStore';
import { toast } from './toast';

/**
 * UI-layer wrappers around the pure nudge-axis / nudge-step store actions that flash the
 * new posture so changes triggered by keyboard (←/→, ⇧←/⇧→) are visible. Used by both
 * the hotkey registry and the status bar's nudge chip so the feedback is identical wherever
 * the change originates. Kept out of editorStore, which stays free of UI dependencies.
 *
 * The flash lands in the status bar's message channel (`toast()` default variant →
 * transient, never the notification center — design-system-services §2.2: high-frequency
 * posture feedback must never enter the center). Spamming the arrow keys therefore
 * overwrites ONE slot instead of stacking four cards over the viewport.
 */

/** Formats the step for display; values are pre-rounded to ≤3 decimals upstream. */
export function formatNudgeStep(step: number): string {
  return String(step);
}

/** Cycles the nudge axis (1 = forward, -1 = backward) and toasts the new axis. */
export function changeNudgeAxis(direction: 1 | -1): void {
  cycleNudgeAxis(direction);
  toast({ title: `Nudge axis: ${$nudgeAxis.get().toUpperCase()}` });
}

/** Increases the nudge step and toasts the new distance (`⇧→`). */
export function raiseNudgeStep(): void {
  incrementNudgeStep();
  toast({ title: `Nudge step: ${formatNudgeStep($nudgeStep.get())} m` });
}

/** Decreases the nudge step and toasts the new distance (`⇧←`). */
export function lowerNudgeStep(): void {
  decrementNudgeStep();
  toast({ title: `Nudge step: ${formatNudgeStep($nudgeStep.get())} m` });
}
