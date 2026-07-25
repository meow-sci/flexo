import { describe, it, expect } from 'vitest'
import {
  colliderDimensionNames,
  colliderDimensions,
  colliderSizeFromDimensions,
  DEFAULT_COLLIDER_SIZE_M,
  MIN_COLLIDER_SIZE_M,
  normalizeColliderSize,
} from './colliderSize'
import type { ColliderShape } from './types'
import { COLLIDER_SHAPES } from './types'

describe('normalizeColliderSize', () => {
  it('leaves a box free on all three axes', () => {
    expect(normalizeColliderSize('Box', { x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('forces a sphere uniform at its largest axis', () => {
    expect(normalizeColliderSize('Sphere', { x: 1, y: 4, z: 2 })).toEqual({ x: 4, y: 4, z: 4 })
  })

  it('ties a cylinder’s X and Z to the larger of the two, leaving the axis free', () => {
    expect(normalizeColliderSize('Cylinder', { x: 1, y: 5, z: 3 })).toEqual({ x: 3, y: 5, z: 3 })
  })

  it('additionally clamps a capsule’s height to at least its diameter', () => {
    // A capsule shorter than its diameter IS a sphere and would emit a negative <LengthY>.
    expect(normalizeColliderSize('Capsule', { x: 2, y: 0.5, z: 1 })).toEqual({ x: 2, y: 2, z: 2 })
    expect(normalizeColliderSize('Capsule', { x: 2, y: 5, z: 1 })).toEqual({ x: 2, y: 5, z: 2 })
  })

  it('floors zero / negative / non-finite dimensions (Bepu would build a degenerate shape)', () => {
    expect(normalizeColliderSize('Box', { x: 0, y: -3, z: Number.NaN })).toEqual({
      x: MIN_COLLIDER_SIZE_M,
      y: MIN_COLLIDER_SIZE_M,
      z: MIN_COLLIDER_SIZE_M,
    })
  })
})

describe('colliderDimensions (size → XML)', () => {
  it('maps a box to full extents', () => {
    expect(colliderDimensions('Box', { x: 1.2, y: 0.8, z: 0.025 })).toEqual({
      lengthXM: 1.2,
      lengthYM: 0.8,
      lengthZM: 0.025,
      radiusM: null,
    })
  })

  it('maps a sphere to half its diameter', () => {
    expect(colliderDimensions('Sphere', { x: 1.78, y: 1.78, z: 1.78 })).toEqual({
      lengthXM: null,
      lengthYM: null,
      lengthZM: null,
      radiusM: 0.89,
    })
  })

  it('maps a cylinder to radius + FULL axial length', () => {
    expect(colliderDimensions('Cylinder', { x: 1, y: 2, z: 1 })).toEqual({
      lengthXM: null,
      lengthYM: 2,
      lengthZM: null,
      radiusM: 0.5,
    })
  })

  it('maps a capsule’s LengthY to the CYLINDRICAL SEGMENT only (caps add a radius each)', () => {
    // Outer height 3, diameter 1 ⇒ segment 2, radius 0.5 ⇒ tip-to-tip 2 + 2·0.5 = 3.
    expect(colliderDimensions('Capsule', { x: 1, y: 3, z: 1 })).toEqual({
      lengthXM: null,
      lengthYM: 2,
      lengthZM: null,
      radiusM: 0.5,
    })
  })

  it('normalizes before mapping, so a skewed drag can never emit an illegal shape', () => {
    const d = colliderDimensions('Cylinder', { x: 1, y: 2, z: 3 })
    expect(d.radiusM).toBe(1.5) // max(x, z) / 2
  })
})

describe('colliderSizeFromDimensions (XML → size)', () => {
  it('round-trips every shape', () => {
    const cases: [ColliderShape, { x: number; y: number; z: number }][] = [
      ['Box', { x: 1.18927, y: 0.79873, z: 0.02531 }],
      ['Sphere', { x: 1.78, y: 1.78, z: 1.78 }],
      ['Cylinder', { x: 1, y: 2.1922, z: 1 }],
      ['Capsule', { x: 0.8, y: 2.5, z: 0.8 }],
    ]
    for (const [shape, size] of cases) {
      const back = colliderSizeFromDimensions(shape, colliderDimensions(shape, size))
      expect(back.x).toBeCloseTo(size.x, 10)
      expect(back.y).toBeCloseTo(size.y, 10)
      expect(back.z).toBeCloseTo(size.z, 10)
    }
  })

  it('reads a capsule back as segment + 2·radius (tip-to-tip)', () => {
    expect(colliderSizeFromDimensions('Capsule', { lengthYM: 2, radiusM: 0.5 })).toEqual({
      x: 1,
      y: 3,
      z: 1,
    })
  })

  it('substitutes a visible default for a dimension the XML omits (KSA would read NaN)', () => {
    const size = colliderSizeFromDimensions('Sphere', { radiusM: null })
    expect(size).toEqual({
      x: DEFAULT_COLLIDER_SIZE_M,
      y: DEFAULT_COLLIDER_SIZE_M,
      z: DEFAULT_COLLIDER_SIZE_M,
    })
    expect(Number.isFinite(size.x)).toBe(true)
  })
})

describe('colliderDimensionNames', () => {
  it('names every element a shape must ALWAYS emit', () => {
    expect(colliderDimensionNames('Box')).toEqual(['LengthX', 'LengthY', 'LengthZ'])
    expect(colliderDimensionNames('Sphere')).toEqual(['Radius'])
    expect(colliderDimensionNames('Cylinder')).toEqual(['LengthY', 'Radius'])
    expect(colliderDimensionNames('Capsule')).toEqual(['LengthY', 'Radius'])
  })

  it('covers every shape (a new shape must not silently emit nothing)', () => {
    for (const shape of COLLIDER_SHAPES) {
      expect(colliderDimensionNames(shape).length).toBeGreaterThan(0)
    }
  })
})
