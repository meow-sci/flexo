import { persistentJSON } from '@nanostores/persistent'

/**
 * Persistent UI/layout state (nanostores → localStorage). These are end-user
 * presentation preferences that should survive reloads, kept out of the editor
 * document state. React reads via `useStore`.
 */

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
