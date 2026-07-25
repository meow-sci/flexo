import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { matrixFromTransform } from '../three/coords'
import type { LoadedModel } from '../three/loadModelFile'
import { analyzeImport, DEFAULT_IMPORT_OPTIONS, type ImportOptions } from './importPlan'
import { normalizeImport } from './importNormalize'
import type { Transform } from './types'

/** Scenes are built programmatically — no binary fixtures (see the note in importPlan.test.ts). */

function model(scene: THREE.Object3D, fileName = 'model.glb'): LoadedModel {
  const root = new THREE.Group()
  root.add(scene)
  return { scene: root, fileName }
}

function opts(overrides: Partial<ImportOptions> = {}): ImportOptions {
  return { ...DEFAULT_IMPORT_OPTIONS, ...overrides }
}

/** One CCW triangle with the full KSA attribute set — small enough to assert index order on. */
function triangle(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  )
  g.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  )
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2))
  g.setIndex([0, 1, 2])
  return g
}

function meshOf(geometry: THREE.BufferGeometry, name = 'Piece'): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial()
  material.name = 'Steel'
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  return mesh
}

function normalize(scene: THREE.Object3D, options = opts()) {
  return normalizeImport(analyzeImport(model(scene), options), options)
}

function indicesOf(geometry: THREE.BufferGeometry): number[] {
  return Array.from(geometry.getIndex()!.array)
}

/** The subset of a GLB's JSON chunk these tests inspect. */
function parseGlbJson(glb: Uint8Array): { meshes?: { name?: string }[] } {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  expect(dv.getUint32(0, true)).toBe(0x46546c67)
  const jsonLen = dv.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)))
}

describe('normalizeImport — geometry is KSA-legal', () => {
  it('emits indexed geometry carrying only POSITION / NORMAL / TEXCOORD_0', async () => {
    // MeshReference.cs:83 imports Normals|UVs only, and GltfUtils.cs:484-488 needs indices —
    // an unindexed primitive draws nothing and can't be picked, with no error message.
    const geometry = triangle()
    geometry.setAttribute('tangent', new THREE.BufferAttribute(new Float32Array(12), 4))
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3))
    geometry.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(6), 2))

    const result = await normalize(meshOf(geometry))

    const out = result.meshes[0]!.geometry
    expect(Object.keys(out.attributes).sort()).toEqual(['normal', 'position', 'uv'])
    expect(out.getIndex()).not.toBeNull()
    expect(result.meshes[0]!.triangles).toBe(1)
    expect(result.meshes[0]!.vertices).toBe(3)
  })

  it('rebuilds an index for non-indexed input', async () => {
    const geometry = triangle().toNonIndexed()
    const result = await normalize(meshOf(geometry))
    expect(indicesOf(result.meshes[0]!.geometry)).toEqual([0, 1, 2])
  })

  it('computes normals when the file has none', async () => {
    const geometry = triangle()
    geometry.deleteAttribute('normal')
    const result = await normalize(meshOf(geometry))
    expect(result.meshes[0]!.geometry.hasAttribute('normal')).toBe(true)
  })

  it('promotes uv1 → uv ONLY when uv is absent', async () => {
    // KSA samples all five PbrMaterial slots from UV0, so a UV1-only mesh is otherwise
    // untexturable; but a real UV0 must never be clobbered by the second set.
    const promoted = triangle()
    promoted.deleteAttribute('uv')
    promoted.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array([1, 1, 2, 2, 3, 3]), 2))
    const a = await normalize(meshOf(promoted))
    expect(Array.from(a.meshes[0]!.geometry.getAttribute('uv').array)).toEqual([1, 1, 2, 2, 3, 3])

    const kept = triangle()
    kept.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array([9, 9, 9, 9, 9, 9]), 2))
    const b = await normalize(meshOf(kept))
    expect(Array.from(b.meshes[0]!.geometry.getAttribute('uv').array)).toEqual([0, 0, 1, 0, 0, 1])
    expect(b.meshes[0]!.geometry.hasAttribute('uv1')).toBe(false)
  })

  it('never invents UVs for a mesh that has none', async () => {
    const geometry = triangle()
    geometry.deleteAttribute('uv')
    const result = await normalize(meshOf(geometry))
    expect(result.meshes[0]!.geometry.hasAttribute('uv')).toBe(false)
  })
})

describe('normalizeImport — placements', () => {
  /** Recomposes a KSA Transform and compares it to the expected matrix. */
  function expectMatrix(t: Transform, expected: THREE.Matrix4): void {
    const actual = matrixFromTransform(t)
    for (let i = 0; i < 16; i++) expect(actual.elements[i]!).toBeCloseTo(expected.elements[i]!, 6)
  }

  it('round-trips a node world transform through transformFromMatrix', async () => {
    const mesh = meshOf(triangle())
    mesh.position.set(1.25, -2, 0.5)
    mesh.rotation.set(0.3, -0.7, 1.1)
    mesh.scale.set(2, 3, 4)
    mesh.updateMatrixWorld(true)
    const world = mesh.matrixWorld.clone()

    // bakeScale off ⇒ the whole world matrix rides the placement.
    const result = await normalize(mesh, opts({ bakeScale: false }))

    expect(result.meshes[0]!.placements).toHaveLength(1)
    expectMatrix(result.meshes[0]!.placements[0]!, world)
  })

  it('bakes scale into the geometry and leaves rotation + translation on the placement', async () => {
    const mesh = meshOf(triangle())
    mesh.position.set(0, 1, 0)
    mesh.scale.set(2, 2, 2)

    const result = await normalize(mesh, opts({ bakeScale: true }))

    const placement = result.meshes[0]!.placements[0]!
    expect(placement.scale.x).toBeCloseTo(1, 6)
    expect(placement.position.y).toBeCloseTo(1, 6)
    // The triangle's 1 m edge is now 2 m in the geometry itself.
    const positions = result.meshes[0]!.geometry.getAttribute('position')
    expect(positions.getX(1)).toBeCloseTo(2, 6)
  })

  it('bakes the full world matrix and places at the origin when asked', async () => {
    const mesh = meshOf(triangle())
    mesh.position.set(5, 0, 0)
    mesh.rotation.set(0, 0.5, 0)

    const result = await normalize(mesh, opts({ bakeTransforms: true }))

    const placement = result.meshes[0]!.placements[0]!
    expect(placement.position.x).toBeCloseTo(0, 6)
    expect(placement.rotation.y).toBeCloseTo(0, 6)
    expect(result.meshes[0]!.geometry.getAttribute('position').getX(0)).toBeCloseTo(5, 6)
  })

  it('applies the scale and up-axis corrections to placements', async () => {
    const mesh = meshOf(triangle())
    mesh.position.set(0, 0, 3)

    const result = await normalize(mesh, opts({ scale: 2, upAxis: 'z' }))

    const placement = result.meshes[0]!.placements[0]!
    // +Z 3 m in a Z-up file, scaled ×2 ⇒ +Y 6 m in KSA's Y-up basis.
    expect(placement.position.x).toBeCloseTo(0, 6)
    expect(placement.position.y).toBeCloseTo(6, 6)
    expect(placement.position.z).toBeCloseTo(0, 6)
  })

  it('gives every instance of a shared mesh its own placement', async () => {
    const geometry = triangle()
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    for (const x of [-1, 0, 1]) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = 'Fin'
      mesh.position.set(x, 0, 0)
      root.add(mesh)
    }

    const result = await normalize(root)

    expect(result.meshes).toHaveLength(1)
    expect(result.meshes[0]!.placements.map((p) => p.position.x)).toEqual([-1, 0, 1])
  })
})

describe('normalizeImport — mirrored transforms', () => {
  it('bakes the mirror into the geometry, reverses winding, and keeps the placement positive', async () => {
    // A negative placement scale would reverse the winding in-game and back-face-cull the whole
    // piece (CullMode = BackBit, PartModelRenderer.cs:165) — invisible, with no error.
    const mesh = meshOf(triangle())
    mesh.scale.set(-1, 1, 1)

    const result = await normalize(mesh, opts({ bakeScale: false }))

    const out = result.meshes[0]!
    expect(indicesOf(out.geometry)).toEqual([2, 1, 0])
    expect(out.geometry.getAttribute('position').getX(1)).toBeCloseTo(-1, 6)
    for (const p of out.placements) {
      expect(p.scale.x).toBeGreaterThan(0)
      expect(p.scale.y).toBeGreaterThan(0)
      expect(p.scale.z).toBeGreaterThan(0)
    }
  })
})

describe('normalizeImport — double-siding', () => {
  it('doubles the triangles and gives the added ones reversed winding', async () => {
    const result = await normalize(meshOf(triangle()), opts({ doubleSided: true }))

    const out = result.meshes[0]!
    expect(out.triangles).toBe(2)
    expect(out.vertices).toBe(6)
    const index = indicesOf(out.geometry)
    expect(index.slice(0, 3)).toEqual([0, 1, 2])
    // The back copy's vertices are appended, so its indices are offset by 3 and reversed.
    expect(index.slice(3, 6)).toEqual([5, 4, 3])
    // ...and its normals face the other way.
    const normal = out.geometry.getAttribute('normal')
    expect(normal.getZ(0)).toBeCloseTo(1, 6)
    expect(normal.getZ(3)).toBeCloseTo(-1, 6)
  })
})

describe('normalizeImport — the atlas GLB', () => {
  it('holds exactly one mesh per normalized mesh, named subPartId, with NO _VM entries', async () => {
    // The import atlas is flexo's own geometry store, not something KSA loads: the `_VM` picking
    // meshes the game needs are generated from the same geometry at mod-export time.
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    geometry.clearGroups()
    geometry.addGroup(0, 18, 0)
    geometry.addGroup(18, 18, 1)
    const a = new THREE.MeshStandardMaterial()
    a.name = 'PaintedMetal'
    const b = new THREE.MeshStandardMaterial()
    b.name = 'Indicator'
    const mesh = new THREE.Mesh(geometry, [a, b])
    mesh.name = 'Hull'

    const result = await normalize(mesh)

    const names = (parseGlbJson(result.glb).meshes ?? []).map((m) => m.name)
    expect(names.sort()).toEqual(result.meshes.map((m) => m.subPartId).sort())
    expect(names.some((n) => n?.endsWith('_VM'))).toBe(false)
  })

  it('names SubParts flexo_<Sanitized>_<hash8> and applies the name prefix', async () => {
    // Mesh names register GLOBALLY in ModLibrary (MeshReference.cs:60-63), so the flexo_ prefix
    // is what keeps an imported mesh from colliding with Core content.
    const result = await normalize(meshOf(triangle(), 'Hull Plate'), opts({ namePrefix: 'RCS ' }))

    const out = result.meshes[0]!
    expect(out.name).toBe('RCS Hull Plate')
    expect(out.subPartId).toMatch(/^flexo_RCS_Hull_Plate_[0-9a-f]{8}$/)
    expect(result.importId).toMatch(/^imp_[0-9a-f]{8}$/)
  })

  it('carries provenance and the plan warnings through', async () => {
    const geometry = triangle()
    geometry.deleteAttribute('uv')
    const result = await normalize(meshOf(geometry, 'Bolt'), opts())

    expect(result.fileName).toBe('model.glb')
    expect(result.meshes[0]).toMatchObject({ sourceNode: 'Bolt', sourceMaterial: 'Steel' })
    expect(result.meshes[0]!.materialGroupKey).toBeTruthy()
    expect(result.warnings.map((w) => w.code)).toContain('noUv')
  })

  it('refuses a plan with no meshes rather than emitting an empty atlas', async () => {
    const plan = analyzeImport(model(new THREE.Group(), 'empty.glb'), opts())
    await expect(normalizeImport(plan, opts())).rejects.toThrow(/no meshes/)
  })
})
