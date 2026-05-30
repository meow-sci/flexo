import { describe, it, expect, beforeEach } from 'vitest'
import {
  $part,
  $canUndo,
  $selectedIndices,
  addConnector,
  newPart,
  selectConnector,
  setSelectedConnectors,
  setSelectedPlacements,
  undo,
} from '../state/editorStore'
import { setLayerLocked } from '../state/layerStore'
import { CONNECTOR_LAYER_ID, DEFAULT_LAYER_ID } from '../ksa/types'
import { rotateSelectionBy } from './rotateSelection'

const HALF_PI = Math.PI / 2

beforeEach(() => {
  newPart()
  // Clear any persisted lock state from a previous test.
  setLayerLocked(DEFAULT_LAYER_ID, false)
  setLayerLocked(CONNECTOR_LAYER_ID, false)
})

/** Seeds the part with `n` placements at the given positions and selects them all. */
function seedPlacements(positions: { x: number; y: number; z: number }[]): void {
  const part = $part.get()
  $part.set({
    ...part,
    placements: positions.map((position, i) => ({
      instanceId: `p_${i}`,
      subPartTemplateId: 'Test.Block',
      position,
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: DEFAULT_LAYER_ID,
    })),
  })
  setSelectedPlacements(positions.map((_, i) => i))
}

describe('rotateSelectionBy', () => {
  it('rotates a single placement in place (orientation only) as one undo step', () => {
    seedPlacements([{ x: 1, y: 2, z: 3 }])
    rotateSelectionBy({ x: 0, y: 90, z: 0 })

    const p = $part.get().placements[0]
    // Single selection → centroid is its own position → position is unchanged.
    expect(p.position).toEqual({ x: 1, y: 2, z: 3 })
    expect(p.rotation.y).toBeCloseTo(HALF_PI, 5)
    expect($canUndo.get()).toBe(true)

    undo()
    expect($part.get().placements[0].rotation.y).toBeCloseTo(0, 5)
  })

  it('rotates a multi-selection about the shared centroid (moves positions)', () => {
    // Two points on the X axis; 90° about Y maps the +X axis to the -Z axis.
    seedPlacements([
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ])
    rotateSelectionBy({ x: 0, y: 90, z: 0 })

    const [a, b] = $part.get().placements
    // Centroid is the origin; +X rotates to -Z, -X to +Z.
    expect(a.position.x).toBeCloseTo(0, 5)
    expect(a.position.z).toBeCloseTo(1, 5)
    expect(b.position.x).toBeCloseTo(0, 5)
    expect(b.position.z).toBeCloseTo(-1, 5)
  })

  it('rotates a selected connector', () => {
    addConnector()
    selectConnector(0)
    rotateSelectionBy({ x: 90, y: 0, z: 0 })
    expect($part.get().connectors[0].rotation.x).toBeCloseTo(HALF_PI, 5)
  })

  it('is a no-op when nothing is selected', () => {
    seedPlacements([{ x: 1, y: 0, z: 0 }])
    setSelectedPlacements([])
    setSelectedConnectors([])
    rotateSelectionBy({ x: 0, y: 90, z: 0 })
    expect($canUndo.get()).toBe(false)
    expect($part.get().placements[0].rotation.y).toBeCloseTo(0, 5)
  })

  it('is a no-op when the selection sits on a locked layer', () => {
    // Lock first, THEN select: selecting doesn't check lock, so the selection
    // survives and exercises rotateSelectionBy's own locked-layer guard.
    setLayerLocked(DEFAULT_LAYER_ID, true)
    seedPlacements([{ x: 1, y: 0, z: 0 }])
    expect($selectedIndices.get()).toEqual([0])
    rotateSelectionBy({ x: 0, y: 90, z: 0 })
    expect($canUndo.get()).toBe(false)
    expect($part.get().placements[0].rotation.y).toBeCloseTo(0, 5)
  })
})
