import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'

// In-memory stand-in for the IndexedDB blob store (happy-dom has no indexedDB). Mirrors
// assetKeys so the import path's putAsset(assetKeys.importGlb(...)) is exercised for real.
vi.mock('./assetDb', () => {
  const store = new Map<string, Blob>()
  return {
    assetKeys: {
      textureSource: (id: string) => `tex-src:${id}`,
      textureKtx2: (id: string) => `tex-ktx2:${id}`,
      meshGlb: (id: string) => `mesh-glb:${id}`,
      importGlb: (id: string) => `import-glb:${id}`,
      emissivePaint: (id: string) => `emissive-paint:${id}`,
    },
    getAsset: async (key: string) => store.get(key),
    putAsset: async (key: string, data: Blob | Uint8Array, type = '') => {
      store.set(key, data instanceof Blob ? data : new Blob([data.slice()], { type }))
    },
    deleteAsset: async (key: string) => {
      store.delete(key)
    },
    __assetStore: store,
  }
})

// The imported-geometry cache resolves meshes by parsing a blob: URL through GLTFLoader,
// which happy-dom can't fetch. Stub the registry with the same contract (register → URL,
// name → geometry) so the store's catalog/render-cache wiring is what's under test.
vi.mock('../three/importedMeshCache', () => {
  const urls = new Map<string, string>()
  return {
    registerImportAtlas: (importId: string) => {
      const url = `blob:import/${importId}`
      urls.set(importId, url)
      return url
    },
    importAtlasUrl: (importId: string) => urls.get(importId) ?? null,
    ensureImportAtlas: async (importId: string) => urls.get(importId) ?? null,
    getImportedGeometry: async (importId: string) => {
      if (!urls.has(importId)) return null
      const g = new THREE.BufferGeometry()
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
      )
      return g
    },
    getImportedRawGeometry: async () => null,
    clearImportAtlases: () => urls.clear(),
  }
})

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
import { $customCatalog } from './catalogStore'
import {
  addCustomMaterial,
  importModelAsMeshes,
  makeKittenMeshPart,
  removeCustomMaterial,
  setMeshMaterial,
  updateCustomMaterial,
} from './customAssetStore'
import { analyzeImport, DEFAULT_IMPORT_OPTIONS } from '../ksa/importPlan'
import { normalizeImport, type NormalizedImport } from '../ksa/importNormalize'

beforeEach(() => {
  newPart()
})

/**
 * A synthetic two-object model: "Hull" placed twice (both nodes share one geometry+material,
 * so it must become ONE SubPart with TWO placements) plus a single "Nozzle". Run through the
 * real analyze + normalize passes so the descriptors under test are the real shapes.
 */
async function synthesizeImport(): Promise<NormalizedImport> {
  const material = new THREE.MeshStandardMaterial()
  material.name = 'Metal'
  const hull = new THREE.BoxGeometry(1, 1, 1)
  const scene = new THREE.Group()
  for (const x of [0, 2]) {
    const mesh = new THREE.Mesh(hull, material)
    mesh.name = 'Hull'
    mesh.position.set(x, 0, 0)
    scene.add(mesh)
  }
  const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material)
  nozzle.name = 'Nozzle'
  scene.add(nozzle)

  const plan = analyzeImport({ scene, fileName: 'pod.glb' }, DEFAULT_IMPORT_OPTIONS)
  return normalizeImport(plan, DEFAULT_IMPORT_OPTIONS)
}

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

describe('importModelAsMeshes', () => {
  it('creates a file-named layer, one mesh per group and one placement per instance', async () => {
    const normalized = await synthesizeImport()
    await importModelAsMeshes(normalized, 'pod.glb')

    const p = $part.get()
    const layer = p.layers.find((l) => l.name === 'pod')
    expect(layer).toBeTruthy()

    // Hull (2 nodes, shared geometry+material) → 1 SubPart, 2 placements; Nozzle → 1 + 1.
    expect(p.customMeshes).toHaveLength(2)
    expect(p.placements).toHaveLength(3)
    expect(p.customMeshes.map((m) => m.name)).toEqual(['Hull', 'Nozzle'])
    expect(p.customMeshes.every((m) => !m.primitive && !m.kitten)).toBe(true)
    for (const m of p.customMeshes) {
      expect(m.imported?.importId).toBe(normalized.importId)
      expect(m.imported?.meshName).toBe(m.subPartId)
      expect(m.imported?.sourceFile).toBe('pod.glb')
      expect(m.imported?.triangles).toBeGreaterThan(0)
    }

    const hull = p.customMeshes[0]
    expect(p.placements.filter((pl) => pl.subPartTemplateId === hull.subPartId)).toHaveLength(2)
    expect(p.placements.every((pl) => pl.layerId === layer!.id)).toBe(true)
    expect(new Set(p.placements.map((pl) => pl.instanceId)).size).toBe(3)
    // The second Hull node's placement keeps its x offset (only scale is baked by default).
    expect(p.placements[1].position.x).toBeCloseTo(2)
  })

  it('publishes one $customCatalog entry per imported mesh, atlased to its own import GLB', async () => {
    const normalized = await synthesizeImport()
    await importModelAsMeshes(normalized, 'pod.glb')

    const entries = $customCatalog.get()
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.id)).toEqual($part.get().customMeshes.map((m) => m.subPartId))
    for (const e of entries) {
      expect(e.sourceFile).toBe('(imported)')
      expect(e.atlasUrl).toBe(`blob:import/${normalized.importId}`)
      expect(e.meshNodeName).toBe(e.id)
    }
  })

  it('keeps instance ids unique when the same model is imported twice', async () => {
    await importModelAsMeshes(await synthesizeImport(), 'pod.glb')
    await importModelAsMeshes(await synthesizeImport(), 'pod.glb')
    const ids = $part.get().placements.map((pl) => pl.instanceId)
    expect(ids).toHaveLength(6)
    expect(new Set(ids).size).toBe(6)
    expect(ids).toContain('hull_1')
    expect(ids).toContain('hull_3')
  })
})
