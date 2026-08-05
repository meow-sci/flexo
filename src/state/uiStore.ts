import { atom } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';

/**
 * Persistent UI/layout state (nanostores → localStorage). These are end-user
 * presentation preferences that should survive reloads, kept out of the editor
 * document state. React reads via `useStore`.
 *
 * **Sunset notice.** Everything left in this module is v1 state with a named v2
 * successor; nothing new belongs here. The docked shell's sidebar width/collapse moved
 * to `src/state/layoutStore.ts` (`flexo:layout`) — the v1 keys `flexo:inspectorVisible`
 * and `flexo:inspectorWidth` are simply ABANDONED, never migrated (constitution;
 * design-system-services.md §9). Reset Everything (`localStorage.clear()`) still wipes
 * them.
 */

/**
 * Which body the inspector shows: the Assets list, the full-sidebar Animation
 * editor, or the full-sidebar Engine designer. Ephemeral (not persisted) — like
 * selection, it resets to 'assets' on reload. The Assets toolbar's "Anim"/"Engine"
 * buttons switch in; each editor's toolbar "Close" switches back. In a full-sidebar
 * mode the Assets list is hidden and reachable only via the Mesh Picker dialog.
 *
 * Replaced by `modeStore.$mode` in the mode-machine phase (foundation §2, §17 step 4).
 */
export type InspectorMode = 'assets' | 'anim' | 'engine';
export const $inspectorMode = atom<InspectorMode>('assets');

export function setInspectorMode(mode: InspectorMode): void {
  $inspectorMode.set(mode);
}

/** Top-left viewport position (px) of the floating selection inspector. */
export interface FloatPosition {
  x: number;
  y: number;
}

/**
 * Position of the floating selected-asset inspector window (the transform/details
 * panel that hovers over the 3D workspace). `null` = the default anchor: bottom-left,
 * 0.25rem off both edges. Once the user drags the window it stores explicit top-left
 * px. Persisted at app level and cleared by the global data reset (localStorage.clear).
 *
 * Replaced by `layoutStore.$layout.float` in the FloatingWindow phase (§17 step 5).
 */
export const $inspectorFloatPos = persistentJSON<FloatPosition | null>(
  'flexo:inspectorFloatPos',
  null,
);

export function setInspectorFloatPos(pos: FloatPosition | null): void {
  $inspectorFloatPos.set(pos);
}

/**
 * Position of the floating animation-preview toolbar (the draggable scrubber that hovers
 * over the workspace while the Animation editor is open). `null` = the default anchor:
 * top-center, just below the main toolbar. Stores explicit top-left px once dragged.
 * Persisted at app level and cleared by the global data reset (localStorage.clear).
 *
 * Replaced by `layoutStore.$layout.float` in the FloatingWindow phase (§17 step 5).
 */
export const $animPreviewFloatPos = persistentJSON<FloatPosition | null>(
  'flexo:animPreviewFloatPos',
  null,
);

export function setAnimPreviewFloatPos(pos: FloatPosition | null): void {
  $animPreviewFloatPos.set(pos);
}
