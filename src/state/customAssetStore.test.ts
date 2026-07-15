import { describe, it, expect, beforeEach, vi } from 'vitest'

// Avoid loading the real kitten gltfs (GLTFLoader/fetch/KTX2) — return tiny baked
// geometry for every submesh specKey and a stub material.
vi.mock('../three/kittenBake', () => ({
  bakeKittenSubMeshes: vi.fn(async () => {
    const THREE = await import('three')
    return ['suit', 'head', 'eye', 'helmet', 'visor', 'pack', 'packLabels'].map((specKey) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
      )
      return {
        specKey,
        label: specKey,
        source: { kind: 'hunter', specKey, diffuse: 'd' },
        geometry: g,
      }
    })
  }),
  buildKittenMaterial: vi.fn(async () => {
    const THREE = await import('three')
    return new THREE.MeshStandardMaterial()
  }),
}))

import { $part, newPart, undo } from './editorStore'
import {
  addCustomMaterial,
  makeKittenMeshPart,
  removeCustomMaterial,
  setMeshMaterial,
  updateCustomMaterial,
} from './customAssetStore'

beforeEach(() => {
  newPart()
})

describe('custom materials', () => {
  it('add / update / remove are each one undo step', async () => {
    const mat = await addCustomMaterial('Red Metal', {
      baseColor: { kind: 'color', color: { r: 255, g: 0, b: 0 } },
      metalness: { kind: 'value', value: 1 },
      roughness: { kind: 'value', value: 0.15 },
    })
    expect($part.get().customMaterials).toHaveLength(1)
    expect(mat.id).toMatch(/^mat_/)
    expect(mat.metalness).toEqual({ kind: 'value', value: 1 })

    await updateCustomMaterial(mat.id, { roughness: { kind: 'value', value: 0.4 } })
    expect($part.get().customMaterials[0].roughness).toEqual({ kind: 'value', value: 0.4 })

    undo() // revert the update
    expect($part.get().customMaterials[0].roughness).toEqual({ kind: 'value', value: 0.15 })
    undo() // revert the add
    expect($part.get().customMaterials).toHaveLength(0)
  })

  it('removeCustomMaterial unassigns it from meshes', async () => {
    const mat = await addCustomMaterial('M')
    // A minimal primitive mesh referencing the material (bypasses addCustomMesh's
    // atlas rebuild — the assignment model is what's under test).
    $part.set({
      ...$part.get(),
      customMeshes: [
        {
          id: 'mesh_1',
          name: 'Box',
          subPartId: 'flexo_Box_1',
          primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
          faceTextures: {},
          materialId: mat.id,
        },
      ],
    })
    await removeCustomMaterial(mat.id)
    const p = $part.get()
    expect(p.customMaterials).toHaveLength(0)
    expect(p.customMeshes[0].materialId).toBeUndefined()
  })

  it('setMeshMaterial assigns and clears', async () => {
    const mat = await addCustomMaterial('M')
    $part.set({
      ...$part.get(),
      customMeshes: [
        {
          id: 'mesh_1',
          name: 'Box',
          subPartId: 'flexo_Box_1',
          primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
          faceTextures: {},
        },
      ],
    })
    await setMeshMaterial('mesh_1', mat.id)
    expect($part.get().customMeshes[0].materialId).toBe(mat.id)
    await setMeshMaterial('mesh_1', undefined)
    expect($part.get().customMeshes[0].materialId).toBeUndefined()
  })
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
    expect(
      p.placements.every((pl) => pl.position.x === 0 && pl.position.y === 0 && pl.position.z === 0),
    ).toBe(true)
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
