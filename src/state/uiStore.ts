import { atom } from 'nanostores'
import { persistentJSON } from '@nanostores/persistent'

/**
 * Persistent UI/layout state (nanostores → localStorage). These are end-user
 * presentation preferences that should survive reloads, kept out of the editor
 * document state. React reads via `useStore`.
 */

/**
 * Which body the inspector shows: the Assets list, or the full-sidebar Animation
 * editor. Ephemeral (not persisted) — like selection, it resets to 'assets' on
 * reload. The Assets toolbar's "Anim" button switches to 'anim'; the anim toolbar's
 * "Close" switches back. In 'anim' mode the Assets list is hidden and reachable only
 * via the Mesh Picker dialog.
 */
export type InspectorMode = 'assets' | 'anim'
export const $inspectorMode = atom<InspectorMode>('assets')

export function setInspectorMode(mode: InspectorMode): void {
  $inspectorMode.set(mode)
}

/** Whether the right-side inspector panel is shown (vs. collapsed to an icon). */
export const $inspectorVisible = persistentJSON<boolean>('flexo:inspectorVisible', true)

/** Width of the inspector panel in pixels (set by the left-edge drag handle). */
export const $inspectorWidth = persistentJSON<number>('flexo:inspectorWidth', 288)

export const INSPECTOR_MIN_WIDTH = 240
export const INSPECTOR_MAX_WIDTH = 640

export function setInspectorVisible(visible: boolean): void {
  $inspectorVisible.set(visible)
}

export function setInspectorWidth(width: number): void {
  const clamped = Math.max(INSPECTOR_MIN_WIDTH, Math.min(INSPECTOR_MAX_WIDTH, width))
  $inspectorWidth.set(clamped)
}

/** Top-left viewport position (px) of the floating selection inspector. */
export interface FloatPosition {
  x: number
  y: number
}

/**
 * Position of the floating selected-asset inspector window (the transform/details
 * panel that hovers over the 3D workspace). `null` = the default anchor: bottom-left,
 * 0.25rem off both edges. Once the user drags the window it stores explicit top-left
 * px. Persisted at app level and cleared by the global data reset (localStorage.clear).
 */
export const $inspectorFloatPos = persistentJSON<FloatPosition | null>('flexo:inspectorFloatPos', null)

export function setInspectorFloatPos(pos: FloatPosition | null): void {
  $inspectorFloatPos.set(pos)
}

/**
 * Position of the floating animation-preview toolbar (the draggable scrubber that hovers
 * over the workspace while the Animation editor is open). `null` = the default anchor:
 * top-center, just below the main toolbar. Stores explicit top-left px once dragged.
 * Persisted at app level and cleared by the global data reset (localStorage.clear).
 */
export const $animPreviewFloatPos = persistentJSON<FloatPosition | null>('flexo:animPreviewFloatPos', null)

export function setAnimPreviewFloatPos(pos: FloatPosition | null): void {
  $animPreviewFloatPos.set(pos)
}
