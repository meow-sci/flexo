import { persistentJSON } from '@nanostores/persistent';
import { setSnap } from './editorStore';

/**
 * Gizmo **snapping** — the user-facing half of a feature v1 had fully plumbed and never
 * exposed (census: `analysis/flexo-v2-feature-census/selection-transform.md` pain 1;
 * design: `plans/flexo_v2/design/design-build-mode.md` §4.1; LOCKED #7).
 *
 * The v1 plumbing is untouched and is what actually snaps: `$snap` →
 * `EditorScene`'s subscription → `TransformGizmo.setSnap` →
 * `TransformControls.setTranslationSnap/setRotationSnap`. This store is the single
 * SOURCE those settings are computed from, so the Tool bar magnet, the status-bar snap
 * chip and the ⌃ hold-invert can never disagree — they all call the functions below and
 * nothing else writes `$snap`.
 *
 * **Scale snap stays off, always** (parity): `TransformGizmo.setSnap` passes `null` to
 * `setScaleSnap` unconditionally, and no step here would mean anything for a collider
 * whose "scale" is a size in metres.
 *
 * **Persistence**: three flat `flexo:*` keys, matching the existing `flexo:nudgeStep`
 * style. (The design sketch names one `flexo:snap` object; three flat keys are the same
 * state and the same defensive-read story — an absent key is its default — so the plan
 * pins the flat form.) **Undo enrollment: NONE** — snap is view/tool state, never
 * document state (design §13).
 *
 * Layering: no react, no three (AGENTS.md).
 */

/** Is snapping on? The Tool bar magnet and the status chip both mirror this. */
export const $snapEnabled = persistentJSON<boolean>('flexo:snapEnabled', false);
/** Translate snap increment, in metres. */
export const $snapTranslateStep = persistentJSON<number>('flexo:snapTranslateStep', 0.1);
/** Rotate snap increment, in degrees. */
export const $snapRotateStep = persistentJSON<number>('flexo:snapRotateStep', 15);

/** Smallest translate step (1 mm) — a zero step would disable snapping by accident. */
const MIN_TRANSLATE_STEP = 0.001;
const MIN_ROTATE_STEP = 1;
const MAX_ROTATE_STEP = 180;

/**
 * Pushes the effective settings into the gizmo's `$snap` plumbing.
 *
 * `invert` is the ⌃ key held DURING a gizmo drag (foundation §14.2, LOCKED #7): the
 * effective state is `enabled XOR invert`, so ⌃ turns snapping on while it is off and
 * frees the drag while it is on. Everything else calls this with `false`.
 */
export function applySnapToGizmo(invert: boolean): void {
  const on = $snapEnabled.get() !== invert;
  setSnap(on ? { translate: $snapTranslateStep.get(), rotateDeg: $snapRotateStep.get() } : {});
}

export function toggleSnap(): void {
  $snapEnabled.set(!$snapEnabled.get());
  applySnapToGizmo(false);
}

export function setSnapTranslateStep(meters: number): void {
  $snapTranslateStep.set(Math.max(MIN_TRANSLATE_STEP, meters));
  applySnapToGizmo(false);
}

export function setSnapRotateStep(degrees: number): void {
  $snapRotateStep.set(Math.min(MAX_ROTATE_STEP, Math.max(MIN_ROTATE_STEP, degrees)));
  applySnapToGizmo(false);
}
