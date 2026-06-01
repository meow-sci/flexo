import { describe, it, expect } from 'vitest'
import type { PlacementTransform } from '../state/editorStore'
import { centroidOf, scaledAroundOriginTransform, scaledInPlaceTransform } from './bulkTransform'

/** A placement at `position` with unit scale and the given (optional) own scale. */
function place(
  position: { x: number; y: number; z: number },
  scale = { x: 1, y: 1, z: 1 },
): PlacementTransform {
  return { position, rotation: { x: 0.3, y: -0.7, z: 1.1 }, scale }
}

describe('scaledAroundOriginTransform (smart bulk scale)', () => {
  const items = [
    place({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }),
    place({ x: 4, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }),
    place({ x: 2, y: 6, z: -3 }, { x: 0.5, y: 0.5, z: 0.5 }),
  ]
  const origin = centroidOf(items.map((t) => t.position))
  const f = { x: 0.25, y: 0.25, z: 0.25 }
  const scaled = items.map((t) => scaledAroundOriginTransform(t, f, origin))

  it('multiplies each item own scale by the factor', () => {
    for (let i = 0; i < items.length; i++) {
      expect(scaled[i].scale.x).toBeCloseTo(items[i].scale.x * 0.25)
      expect(scaled[i].scale.y).toBeCloseTo(items[i].scale.y * 0.25)
      expect(scaled[i].scale.z).toBeCloseTo(items[i].scale.z * 0.25)
    }
  })

  it('scales every pairwise gap by the same factor (arrangement preserved)', () => {
    const gap = (a: PlacementTransform, b: PlacementTransform) => ({
      x: b.position.x - a.position.x,
      y: b.position.y - a.position.y,
      z: b.position.z - a.position.z,
    })
    const before = gap(items[0], items[2])
    const after = gap(scaled[0], scaled[2])
    expect(after.x).toBeCloseTo(before.x * 0.25)
    expect(after.y).toBeCloseTo(before.y * 0.25)
    expect(after.z).toBeCloseTo(before.z * 0.25)
  })

  it('leaves the selection centroid invariant', () => {
    const c2 = centroidOf(scaled.map((t) => t.position))
    expect(c2.x).toBeCloseTo(origin.x)
    expect(c2.y).toBeCloseTo(origin.y)
    expect(c2.z).toBeCloseTo(origin.z)
  })

  it('leaves rotation untouched', () => {
    expect(scaled[0].rotation).toEqual(items[0].rotation)
  })

  it('matches in-place scale when the item sits at the origin', () => {
    const atOrigin = place({ x: origin.x, y: origin.y, z: origin.z }, { x: 3, y: 3, z: 3 })
    const smart = scaledAroundOriginTransform(atOrigin, f, origin)
    const inPlace = scaledInPlaceTransform(atOrigin, f)
    expect(smart.position).toEqual(inPlace.position)
    expect(smart.scale).toEqual(inPlace.scale)
  })

  it('supports non-uniform factors per axis on the offset', () => {
    const t = place({ x: 10, y: 0, z: 0 })
    const out = scaledAroundOriginTransform(t, { x: 0.5, y: 1, z: 1 }, { x: 0, y: 0, z: 0 })
    expect(out.position.x).toBeCloseTo(5)
    expect(out.position.y).toBeCloseTo(0)
  })
})
