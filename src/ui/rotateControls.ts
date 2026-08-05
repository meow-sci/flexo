import {
  $rotateStep,
  cycleRotateAxes,
  decreaseRotateStep,
  increaseRotateStep,
  rotatePairAxis,
  ROTATE_PAIRS,
} from '../state/editorStore';
import { toast } from './toast';

/**
 * UI-layer wrappers around the pure rotate-axis / rotate-step store actions that flash the
 * new posture so changes triggered by keyboard (`R`, `[`/`]`) are visible. Mirrors
 * {@link ../ui/nudgeControls} so feedback is identical wherever the change originates, and
 * keeps editorStore free of UI dependencies. The flash is transient (status-bar message
 * channel only — never the notification center; design-system-services §2.2).
 */

/** Cycles the rotate-axis mapping (R) and toasts the new per-pair assignment. */
export function changeRotateAxes(): void {
  cycleRotateAxes(1);
  const summary = ROTATE_PAIRS.map(
    (pair) => `${pair.toUpperCase().split('').join('/')}→${rotatePairAxis(pair).toUpperCase()}`,
  ).join(' · ');
  toast({ title: `Rotate axes: ${summary}` });
}

/** Increases the rotate step and toasts the new angle (`]` hotkey). */
export function raiseRotateStep(): void {
  increaseRotateStep();
  toast({ title: `Rotation step: ${$rotateStep.get()}°` });
}

/** Decreases the rotate step and toasts the new angle (`[` hotkey). */
export function lowerRotateStep(): void {
  decreaseRotateStep();
  toast({ title: `Rotation step: ${$rotateStep.get()}°` });
}
