import { atom } from 'nanostores'

/**
 * Viewport "View" settings (nanostores): per-axis reference grids and one-shot
 * camera-snap commands. Like {@link editorStore}, this has no React/three.js
 * imports — the three.js layer subscribes ({@link $grids}, {@link $cameraSnap})
 * and React reads via `useStore`.
 */

export type Axis = 'x' | 'y' | 'z'
export type CameraDir = 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom'

export interface GridConfig {
  enabled: boolean
  /** Cell size in meters. */
  spacing: number
}

export type GridsState = Record<Axis, GridConfig>

/**
 * Reference grids keyed by the axis they're normal to: `x` → YZ plane, `y` → XZ
 * plane (the default "floor"), `z` → XY plane. Y starts on to match the editor's
 * original ground grid.
 */
export const $grids = atom<GridsState>({
  x: { enabled: false, spacing: 1 },
  y: { enabled: true, spacing: 1 },
  z: { enabled: false, spacing: 1 },
})

export function setGrid(axis: Axis, config: Partial<GridConfig>): void {
  const current = $grids.get()
  $grids.set({ ...current, [axis]: { ...current[axis], ...config } })
}

/**
 * One-shot camera-snap command. The `nonce` makes every request a distinct value
 * so the three.js subscriber fires even when the same direction is chosen twice.
 */
export const $cameraSnap = atom<{ dir: CameraDir; nonce: number } | null>(null)

let snapNonce = 0
export function snapCamera(dir: CameraDir): void {
  $cameraSnap.set({ dir, nonce: ++snapNonce })
}
