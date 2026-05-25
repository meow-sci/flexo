import * as THREE from 'three'
import type { Axis, GridsState } from '../state/viewStore'

/**
 * Origin-centered reference grids plus colored origin axes. Matches KSA's Y-up,
 * meters convention (1 grid cell = `spacing` meters). A {@link GridManager} owns
 * a Group and rebuilds the per-axis grids whenever the view config changes:
 * `x` → YZ plane, `y` → XZ plane (floor), `z` → XY plane.
 */

const SIZE = 10 // total extent of each grid, in meters
const CENTER_COLOR = 0x5a5b66
const GRID_COLOR = 0x2c2d36

/** Rotation (radians) that maps a default XZ-plane GridHelper onto each axis plane. */
const AXIS_ROTATION: Record<Axis, THREE.Euler> = {
  x: new THREE.Euler(0, 0, Math.PI / 2), // XZ → YZ (normal +X)
  y: new THREE.Euler(0, 0, 0), // XZ (normal +Y)
  z: new THREE.Euler(Math.PI / 2, 0, 0), // XZ → XY (normal +Z)
}

function makeGrid(axis: Axis, spacing: number): THREE.GridHelper {
  const divisions = Math.max(1, Math.round(SIZE / spacing))
  const grid = new THREE.GridHelper(SIZE, divisions, CENTER_COLOR, GRID_COLOR)
  const mat = grid.material as THREE.Material
  mat.transparent = true
  mat.opacity = 0.6
  grid.rotation.copy(AXIS_ROTATION[axis])
  return grid
}

export class GridManager {
  readonly group = new THREE.Group()
  private readonly grids = new THREE.Group()

  constructor() {
    this.group.name = 'flexo-grid'
    this.group.add(this.grids)
    // Origin axes: X=red, Y=green, Z=blue, 1m long. Always shown.
    this.group.add(new THREE.AxesHelper(1))
  }

  setConfig(state: GridsState): void {
    this.clearGrids()
    for (const axis of ['x', 'y', 'z'] as const) {
      const cfg = state[axis]
      if (cfg.enabled && cfg.spacing > 0) this.grids.add(makeGrid(axis, cfg.spacing))
    }
  }

  private clearGrids(): void {
    for (const child of this.grids.children) {
      const grid = child as THREE.GridHelper
      grid.geometry.dispose()
      ;(grid.material as THREE.Material).dispose()
    }
    this.grids.clear()
  }

  dispose(): void {
    this.clearGrids()
  }
}
