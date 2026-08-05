import { atom } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';

/**
 * Viewport "View" settings (nanostores): per-axis reference grids and one-shot
 * camera-snap commands. Like {@link editorStore}, this has no React/three.js
 * imports — the three.js layer subscribes ({@link $grids}, {@link $cameraSnap})
 * and React reads via `useStore`.
 */

export type Axis = 'x' | 'y' | 'z';
export type CameraDir = 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom';

export interface GridConfig {
  enabled: boolean;
  /** Cell size in meters. */
  spacing: number;
}

export type GridsState = Record<Axis, GridConfig>;

/**
 * Reference grids keyed by the axis they're normal to: `x` → YZ plane, `y` → XZ
 * plane (the default "floor"), `z` → XY plane. Y starts on to match the editor's
 * original ground grid.
 */
export const $grids = persistentJSON<GridsState>('flexo:grids', {
  x: { enabled: false, spacing: 1 },
  y: { enabled: true, spacing: 1 },
  z: { enabled: false, spacing: 1 },
});

export function setGrid(axis: Axis, config: Partial<GridConfig>): void {
  const current = $grids.get();
  $grids.set({ ...current, [axis]: { ...current[axis], ...config } });
}

/**
 * "Hide interior": when on, every mesh whose RESOLVED `<Internal>` is true is hidden, so
 * the workspace shows the part exactly as KSA renders it OUTSIDE IVA (`PartModel.cs`'s
 * `!Template.Internal || viewport.Mode == CameraMode.IVA` gate — see plans/IVA_PLAN.md §1.5).
 *
 * A pure VIEW preference, never document data: flexo renders interior meshes normally the
 * rest of the time, which is what you want while authoring one. Off by default; the scene
 * composes it with layer visibility (a mesh draws iff its layer is visible AND this does
 * not hide it) rather than fighting `applyLayerView` for `.visible`.
 */
export const $hideInterior = persistentJSON<boolean>('flexo:hideInterior', false);

export function setHideInterior(hide: boolean): void {
  $hideInterior.set(hide);
}

/**
 * One-shot camera-snap command. The `nonce` makes every request a distinct value
 * so the three.js subscriber fires even when the same direction is chosen twice.
 */
export const $cameraSnap = atom<{ dir: CameraDir; nonce: number } | null>(null);

let snapNonce = 0;
export function snapCamera(dir: CameraDir): void {
  $cameraSnap.set({ dir, nonce: ++snapNonce });
}

/**
 * True while a `TransformControls` drag is in flight. Written by `EditorScene` from the
 * gizmo's own `onDraggingChanged` callback; read by the Escape ladder's rung 4, which is the
 * only reason it needs to be visible outside the three layer.
 */
export const $gizmoDragging = atom<boolean>(false);

/**
 * One-shot "cancel the drag in flight" intent, mirroring {@link $cameraSnap}'s nonce
 * pattern. `EditorScene` answers it with `TransformControls.reset()`, which restores the
 * drag-start object state — that IS the built-in foundation §11.4 rung 4 names; it just
 * needs an Escape routed to it.
 */
export const $gizmoCancel = atom<{ nonce: number } | null>(null);
let gizmoCancelNonce = 0;

export function requestGizmoCancel(): void {
  $gizmoCancel.set({ nonce: ++gizmoCancelNonce });
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

/** Current camera state — written by the Viewport on controls 'end' (once per gesture). */
export const $cameraState = atom<CameraState | null>(null);

/**
 * One-shot camera-restore command, mirroring {@link $cameraSnap}.
 * Written by projectStore on project load; applied by EditorScene on subscribe.
 */
export const $cameraRestore = atom<{ state: CameraState; nonce: number } | null>(null);
let restoreNonce = 0;
export function setCameraRestore(state: CameraState): void {
  $cameraRestore.set({ state, nonce: ++restoreNonce });
}

const DEFAULT_CAMERA_STATE: CameraState = {
  position: [3, 2, 4],
  target: [0, 0, 0],
  up: [0, 1, 0],
};

/** Clears the saved camera state and restores the Viewport to its default position. */
export function resetCamera(): void {
  $cameraState.set(null);
  setCameraRestore(DEFAULT_CAMERA_STATE);
}
