import { describe, it, expect, beforeEach } from 'vitest'
import {
  $canUndo,
  $nudgeAxis,
  $nudgeStep,
  $part,
  cycleNudgeAxis,
  decrementNudgeStep,
  incrementNudgeStep,
  newPart,
  setNudgeAxis,
  setSelectedPlacements,
  undo,
} from '../state/editorStore'
import { setLayerLocked } from '../state/layerStore'
import { DEFAULT_LAYER_ID } from '../ksa/types'
import { nudgeDelta, nudgeSelectionBy } from './nudgeSelection'

beforeEach(() => {
  newPart()
  setNudgeAxis('y')
  $nudgeStep.set(0.1)
  setLayerLocked(DEFAULT_LAYER_ID, false)
})

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

describe('nudgeDelta', () => {
  it('offsets only the chosen axis, by ±step (↑ = +1, ↓ = -1)', () => {
    expect(nudgeDelta('y', 1, 0.1)).toEqual({ x: 0, y: 0.1, z: 0 })
    expect(nudgeDelta('y', -1, 0.1)).toEqual({ x: 0, y: -0.1, z: 0 })
    expect(nudgeDelta('x', 1, 0.5)).toEqual({ x: 0.5, y: 0, z: 0 })
    expect(nudgeDelta('z', -1, 0.2)).toEqual({ x: 0, y: 0, z: -0.2 })
  })
})

describe('nudgeSelectionBy', () => {
  it('moves the selection along the active axis and records one undo step', () => {
    seedPlacements([{ x: 0, y: 0, z: 0 }])
    setNudgeAxis('z')
    nudgeSelectionBy(1)
    expect($part.get().placements[0].position).toEqual({ x: 0, y: 0, z: 0.1 })
    expect($canUndo.get()).toBe(true)
    undo()
    expect($part.get().placements[0].position).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('↓ moves in the negative direction', () => {
    seedPlacements([{ x: 0, y: 0, z: 0 }])
    setNudgeAxis('y')
    nudgeSelectionBy(-1)
    expect($part.get().placements[0].position).toEqual({ x: 0, y: -0.1, z: 0 })
  })

  it('moves every entity of a multi-selection by the same offset', () => {
    seedPlacements([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ])
    nudgeSelectionBy(1) // axis 'y' → +Y
    const [a, b] = $part.get().placements
    expect(a.position.y).toBeCloseTo(0.1, 5)
    expect(b.position.y).toBeCloseTo(1.1, 5)
  })

  it('uses the current step', () => {
    seedPlacements([{ x: 0, y: 0, z: 0 }])
    $nudgeStep.set(0.5)
    setNudgeAxis('z')
    nudgeSelectionBy(1)
    expect($part.get().placements[0].position.z).toBeCloseTo(0.5, 5)
  })

  it('applies the multiplier for a coarse nudge (step × 5)', () => {
    seedPlacements([{ x: 0, y: 0, z: 0 }])
    setNudgeAxis('y')
    nudgeSelectionBy(-1, 5) // Shift+↓
    expect($part.get().placements[0].position.y).toBeCloseTo(-0.5, 5)
  })

  it('is a no-op on a locked layer', () => {
    setLayerLocked(DEFAULT_LAYER_ID, true)
    seedPlacements([{ x: 0, y: 0, z: 0 }])
    nudgeSelectionBy(1)
    expect($canUndo.get()).toBe(false)
    expect($part.get().placements[0].position).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('nudge axis / step store actions', () => {
  it('cycles the axis forward x → y → z → x and backward', () => {
    setNudgeAxis('x')
    cycleNudgeAxis(1)
    expect($nudgeAxis.get()).toBe('y')
    cycleNudgeAxis(1)
    expect($nudgeAxis.get()).toBe('z')
    cycleNudgeAxis(1)
    expect($nudgeAxis.get()).toBe('x')
    // Backward wraps the other way.
    cycleNudgeAxis(-1)
    expect($nudgeAxis.get()).toBe('z')
    cycleNudgeAxis(-1)
    expect($nudgeAxis.get()).toBe('y')
  })

  it('increments by a decade-sized step (0.1 → 0.2 … 0.9 → 1 → 2)', () => {
    expect($nudgeStep.get()).toBe(0.1)
    incrementNudgeStep()
    expect($nudgeStep.get()).toBeCloseTo(0.2, 9)
    $nudgeStep.set(0.9)
    incrementNudgeStep()
    expect($nudgeStep.get()).toBeCloseTo(1, 9)
    incrementNudgeStep()
    expect($nudgeStep.get()).toBeCloseTo(2, 9)
  })

  it('refines the increment to 1/10 below a decade boundary, symmetrically', () => {
    // Going down from the decade floor switches to the finer increment.
    expect($nudgeStep.get()).toBe(0.1)
    decrementNudgeStep()
    expect($nudgeStep.get()).toBeCloseTo(0.09, 9) // 0.1 − 0.01
    decrementNudgeStep()
    expect($nudgeStep.get()).toBeCloseTo(0.08, 9)
    // Going back up returns to the boundary, then resumes the coarse increment.
    $nudgeStep.set(0.09)
    incrementNudgeStep()
    expect($nudgeStep.get()).toBeCloseTo(0.1, 9) // 0.09 + 0.01
    incrementNudgeStep()
    expect($nudgeStep.get()).toBeCloseTo(0.2, 9) // 0.1 + 0.1
    // One more decade down.
    $nudgeStep.set(0.01)
    decrementNudgeStep()
    expect($nudgeStep.get()).toBeCloseTo(0.009, 9)
  })

  it('clamps the step at the 0.001 m floor', () => {
    $nudgeStep.set(0.001)
    decrementNudgeStep()
    expect($nudgeStep.get()).toBe(0.001)
  })
})
