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

// happy-dom has no working 2D canvas, so the real decodeImage (createImageBitmap → canvas
// readback) can't run. Stub the DECODE only; the mip builder and the KTX2 encoder underneath
// it stay real, so the texture-creation path is exercised end to end.
vi.mock('../ktx/decodeImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ktx/decodeImage')>()
  const base = { width: 2, height: 2, rgba: new Uint8Array(16).fill(200) }
  return {
    ...actual,
    decodeImage: async () => ({ width: 2, height: 2, levels: actual.buildMipChain(base) }),
  }
})

// Loading a .ktx2 needs a WebGLRenderer to pick a transcode target (textureSupport), which
// there is no headless equivalent of. The material WIRING (which url lands in which slot) is
// what these tests assert, so hand back plain textures.
vi.mock('../three/TextureCache', async () => {
  const THREE = await import('three')
  return {
    loadTexture: async () => new THREE.Texture(),
    loadWrappedTexture: async () => new THREE.Texture(),
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
  customMeshRenderCache,
  importModelAsMeshes,
  makeKittenMeshPart,
  removeCustomMaterial,
  setMeshMaterial,
  updateCustomMaterial,
} from './customAssetStore'
import { analyzeImport, DEFAULT_IMPORT_OPTIONS } from '../ksa/importPlan'
import { normalizeImport, type NormalizedImport } from '../ksa/importNormalize'
import type { ImportMaterialPlan, ImportMaterialSpec } from '../ksa/importMaterials'
import { assetKeys, getAsset } from './assetDb'

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

/**
 * The material half of an import, as {@link planImportMaterials} would produce it: three
 * textures (one per KSA slot that can carry an image) and one material both SubParts share.
 * Built here as plain data — the translation itself is covered by importMaterials.test.ts.
 */
function materialPlanFor(normalized: NormalizedImport, glow = false): ImportMaterialPlan {
  const material: ImportMaterialSpec = {
    key: 'mat:0',
    name: 'Metal',
    baseColorTextureKey: 'tex:base',
    ormTextureKey: 'tex:orm',
    normalTextureKey: 'tex:normal',
    normalStrength: 0.5,
    metalness: 1,
    roughness: 0.3,
  }
  if (glow) {
    material.glowPng = new Uint8Array([1, 2, 3])
    material.glowColor = { r: 255, g: 64, b: 0 }
    material.glowStrength = 0.4
  }
  return {
    textures: [
      {
        key: 'tex:base',
        name: 'hull_basecolor',
        channel: 'baseColor',
        bytes: new Uint8Array([1]),
        mime: 'image/png',
      },
      {
        key: 'tex:orm',
        name: 'hull_orm',
        channel: 'orm',
        bytes: new Uint8Array([2]),
        mime: 'image/png',
      },
      {
        key: 'tex:normal',
        name: 'hull_normal',
        channel: 'normal',
        bytes: new Uint8Array([3]),
        mime: 'image/png',
      },
    ],
    materials: [material],
    materialKeyByGroup: new Map(normalized.meshes.map((m) => [m.materialGroupKey, 'mat:0'])),
    warnings: [],
  }
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

  it('renders an imported mesh through the REAL material path, not the flat placeholder', async () => {
    const normalized = await synthesizeImport()
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized))

    const subPartId = $part.get().customMeshes[0]!.subPartId
    const cached = customMeshRenderCache.get(subPartId)!
    expect(cached.materials).toHaveLength(1) // one material per mesh — a KSA <PartModel>
    const mat = cached.materials[0]!
    expect(mat.map).toBeTruthy()
    expect(mat.normalMap).toBeTruthy()
    expect(mat.normalScale.x).toBe(0.5)
    // A packed ORM drives all three of three's separate maps, exactly like the export.
    expect(mat.aoMap).toBe(mat.roughnessMap)
    expect(mat.aoMap).toBe(mat.metalnessMap)
    // diffuseUrl makes the shared-material cache bust like the primitive path does.
    expect($customCatalog.get()[0]!.diffuseUrl).toBeTruthy()
  })

  it('composites an imported glow into the diffuse + mask, like a painted primitive', async () => {
    const normalized = await synthesizeImport()
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized, true))
    const subPartId = $part.get().customMeshes[0]!.subPartId
    const mat = customMeshRenderCache.get(subPartId)!.materials[0]!
    // KSA adds WHITE × mask × 1.25 after lighting, so the colour must be in the diffuse and
    // the emissive UNIFORM must stay black (free for the selection highlight).
    expect(mat.emissiveMap).toBeTruthy()
    expect(mat.emissive.getHex()).toBe(0x000000)
  })

  it('creates the imported textures + material as ORDINARY flexo assets and assigns them', async () => {
    const normalized = await synthesizeImport()
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized))

    const p = $part.get()
    // One CustomTexture per slot, each with the channel the translation authored it for.
    expect(p.customTextures.map((t) => t.channel)).toEqual(['baseColor', 'orm', 'normal'])
    expect(p.customTextures.every((t) => t.id.startsWith('tex_'))).toBe(true)

    // ONE material shared by both SubParts (they came from one glTF material).
    expect(p.customMaterials).toHaveLength(1)
    const mat = p.customMaterials[0]!
    expect(mat.baseColor).toEqual({ kind: 'map', textureId: p.customTextures[0]!.id })
    expect(mat.ormPacked).toEqual({ textureId: p.customTextures[1]!.id })
    expect(mat.normal).toEqual({ textureId: p.customTextures[2]!.id, strength: 0.5 })
    // The scalars are what KSA gets when no packed ORM image exists.
    expect(mat.metalness).toEqual({ kind: 'value', value: 1 })
    expect(mat.roughness).toEqual({ kind: 'value', value: 0.3 })
    expect(p.customMeshes.every((m) => m.materialId === mat.id)).toBe(true)
  })

  it('stores an emissive material through the existing painted-glow shape', async () => {
    const normalized = await synthesizeImport()
    await importModelAsMeshes(normalized, 'pod.glb', materialPlanFor(normalized, true))

    for (const m of $part.get().customMeshes) {
      // Reusing 'painted' means glowBitmapFor / compositeGlow / the exporter all work unchanged.
      expect(m.emissive).toEqual({
        shape: 'painted',
        color: { r: 255, g: 64, b: 0 },
        strength: 0.4,
      })
      expect(await getAsset(assetKeys.emissivePaint(m.id))).toBeInstanceOf(Blob)
    }
  })

  it('imports with no material plan at all (geometry only)', async () => {
    const normalized = await synthesizeImport()
    await importModelAsMeshes(normalized, 'pod.glb')
    const p = $part.get()
    expect(p.customTextures).toHaveLength(0)
    expect(p.customMaterials).toHaveLength(0)
    expect(p.customMeshes.every((m) => m.materialId === undefined)).toBe(true)
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
