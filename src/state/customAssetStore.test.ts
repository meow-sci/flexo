import { describe, it, expect, beforeEach, vi } from 'vitest'

// Avoid loading the real kitten gltfs (GLTFLoader/fetch/KTX2) — return tiny baked
// geometry for every submesh specKey and a stub material.
vi.mock('../three/kittenBake', () => ({
  bakeKittenSubMeshes: vi.fn(async () => {
    const THREE = await import('three')
    return ['suit', 'head', 'eye', 'helmet', 'visor', 'pack', 'packLabels'].map((specKey) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
      return { specKey, label: specKey, source: { kind: 'hunter', specKey, diffuse: 'd' }, geometry: g }
    })
  }),
  buildKittenMaterial: vi.fn(async () => {
    const THREE = await import('three')
    return new THREE.MeshStandardMaterial()
  }),
}))

import { $part, newPart, undo } from './editorStore'
import { makeKittenMeshPart } from './customAssetStore'

beforeEach(() => {
  newPart()
})

describe('makeKittenMeshPart', () => {
  it('adds a "<Name> Mesh" layer + all submesh SubParts in ONE undo step', async () => {
    await makeKittenMeshPart('hunter')

    const p = $part.get()
    const layer = p.layers.find((l) => l.name === 'Hunter Mesh')
    expect(layer).toBeTruthy()
    // 7 submeshes: suit, head, eyes, helmet, visor, pack, pack labels.
    expect(p.customMeshes).toHaveLength(7)
    expect(p.placements).toHaveLength(7)
    expect(p.customMeshes.every((m) => m.kitten?.kind === 'hunter' && !m.primitive)).toBe(true)
    expect(p.placements.every((pl) => pl.layerId === layer!.id)).toBe(true)
    // Identity placements (geometry carries the body-root offset).
    expect(p.placements.every((pl) => pl.position.x === 0 && pl.position.y === 0 && pl.position.z === 0)).toBe(true)
    // Unique instance ids.
    expect(new Set(p.placements.map((pl) => pl.instanceId)).size).toBe(7)

    // A single undo reverts the whole part-ification.
    undo()
    const after = $part.get()
    expect(after.customMeshes).toHaveLength(0)
    expect(after.placements).toHaveLength(0)
    expect(after.layers.some((l) => l.name === 'Hunter Mesh')).toBe(false)
  })

  it('keeps instance ids unique across two part-ified kittens of the same kind', async () => {
    await makeKittenMeshPart('hunter')
    await makeKittenMeshPart('hunter')
    const ids = $part.get().placements.map((pl) => pl.instanceId)
    expect(new Set(ids).size).toBe(ids.length) // all unique
    expect(ids).toContain('hunter_suit_1')
    expect(ids).toContain('hunter_suit_2')
  })
})
