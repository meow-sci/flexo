import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildMeshAtlasGlb } from './exportGlb'

/** The subset of glTF an accessor declaration exposes that KSA's loader actually reads. */
interface GlbAccessor {
  bufferView?: number
  componentType: number
  count: number
  type: string
  min?: number[]
  max?: number[]
}

interface GlbPrimitive {
  attributes: Record<string, number>
  indices?: number
  material?: number
  mode?: number
}

/** Parses a binary GLB's JSON chunk back into an object. */
function parseGlbJson(glb: Uint8Array): {
  meshes?: { name?: string; primitives?: GlbPrimitive[] }[]
  nodes?: { name?: string; mesh?: number }[]
  accessors?: GlbAccessor[]
  bufferViews?: { byteStride?: number; byteLength?: number; target?: number }[]
} {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  expect(dv.getUint32(0, true)).toBe(0x46546c67) // glTF magic
  const jsonLen = dv.getUint32(12, true)
  expect(dv.getUint32(16, true)).toBe(0x4e4f534a) // JSON chunk
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)))
}

describe('buildMeshAtlasGlb', () => {
  it('names the glTF MESH (not just the node) so KSA can resolve it', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const glb = await buildMeshAtlasGlb([{ name: 'flexo_Panel_abc123', geometry }])
    const json = parseGlbJson(glb)
    // KSA reads meshes[i].name — this is the regression we guard.
    expect(json.meshes?.[0]?.name).toBe('flexo_Panel_abc123')
    // flexo's own importer reads the node name — keep it too.
    expect(json.nodes?.[0]?.name).toBe('flexo_Panel_abc123')
  })

  it('names every mesh in a multi-node atlas', async () => {
    const glb = await buildMeshAtlasGlb([
      { name: 'flexo_A', geometry: new THREE.BoxGeometry(1, 1, 1) },
      { name: 'flexo_B', geometry: new THREE.SphereGeometry(0.5, 8, 6) },
    ])
    const json = parseGlbJson(glb)
    const meshNames = (json.meshes ?? []).map((m) => m.name).sort()
    // Each render mesh is paired with a _VM view (picking) mesh.
    expect(meshNames).toEqual(['flexo_A', 'flexo_A_VM', 'flexo_B', 'flexo_B_VM'])
  })

  it('emits a paired _VM view mesh so the in-game editor can pick the part', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const glb = await buildMeshAtlasGlb([{ name: 'flexo_Panel_abc123', geometry }])
    const json = parseGlbJson(glb)
    const meshNames = (json.meshes ?? []).map((m) => m.name).sort()
    expect(meshNames).toEqual(['flexo_Panel_abc123', 'flexo_Panel_abc123_VM'])
  })

  it('produces a structurally valid GLB (4-byte aligned JSON chunk)', async () => {
    const glb = await buildMeshAtlasGlb([
      { name: 'flexo_X', geometry: new THREE.PlaneGeometry(1, 1) },
    ])
    const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    expect(dv.getUint32(8, true)).toBe(glb.length) // total length matches
    const jsonLen = dv.getUint32(12, true)
    expect(jsonLen % 4).toBe(0) // JSON chunk padded to 4 bytes
  })
})

/**
 * Guards the glTF invariants KSA's mesh loader REQUIRES. Every one of these, when violated,
 * fails SILENTLY or throws deep inside mod load with no useful message, so they are locked in
 * here rather than discovered in-game. Evidence lines are from the 2026.7.9.5018 decomp under
 * ksa-game-assemblies/current/decomp/.
 */
describe('KSA glTF loader requirements', () => {
  /** Every primitive across every mesh in the atlas, flattened. */
  function primitivesOf(json: ReturnType<typeof parseGlbJson>): GlbPrimitive[] {
    const prims = (json.meshes ?? []).flatMap((m) => m.primitives ?? [])
    expect(prims.length).toBeGreaterThan(0)
    return prims
  }

  /** glTF element size in bytes — what GltfUtils.GetGltfBufferWithStride compares against. */
  const FLOAT_ELEMENT_SIZE: Record<string, number> = { VEC3: 12, VEC2: 8 }

  it('emits an indices accessor for every primitive, indexed input or not', async () => {
    // GltfUtils.cs:484-488 only builds an index buffer `if (prim.Indices.HasValue)`; without
    // one the draw has IndexCount = 0 (invisible, no error) and MeshReference.cs:90-96 reads an
    // empty span for picking. toNonIndexed() is exactly what MikkTSpace tangents produce.
    const glb = await buildMeshAtlasGlb([
      { name: 'flexo_Indexed', geometry: new THREE.BoxGeometry(1, 1, 1) },
      { name: 'flexo_NonIndexed', geometry: new THREE.BoxGeometry(1, 1, 1).toNonIndexed() },
    ])
    const json = parseGlbJson(glb)
    // 2 render meshes + 2 _VM view meshes, each a single primitive.
    expect(primitivesOf(json)).toHaveLength(4)
    for (const prim of primitivesOf(json)) {
      expect(typeof prim.indices).toBe('number')
    }
  })

  it('emits an index accessor component type KSA can convert', async () => {
    // GltfUtils.AddIntsToBuffer (:540-566) converts only ushort/uint/ubyte into the uint index
    // buffer and throws "Unsupported conversion" otherwise.
    const glb = await buildMeshAtlasGlb([
      { name: 'flexo_Indexed', geometry: new THREE.SphereGeometry(0.5, 8, 6) },
      { name: 'flexo_NonIndexed', geometry: new THREE.BoxGeometry(1, 1, 1).toNonIndexed() },
    ])
    const json = parseGlbJson(glb)
    for (const prim of primitivesOf(json)) {
      const accessor = json.accessors?.[prim.indices!]
      expect(accessor?.type).toBe('SCALAR')
      // 5123 = UNSIGNED_SHORT, 5125 = UNSIGNED_INT.
      expect([5123, 5125]).toContain(accessor?.componentType)
    }
  })

  it('emits float32 vertex accessors with the exact element size KSA expects', async () => {
    // GltfUtils.GetGltfBufferWithStride (:386-404) throws "Unexpected accessor stride" unless
    // the element size is exactly 12 (POSITION), 12 (NORMAL), 8 (TEXCOORD_0) bytes — i.e.
    // float32 VEC3/VEC3/VEC2. Quantized (KHR_mesh_quantization) accessors are a hard load error.
    const glb = await buildMeshAtlasGlb([
      { name: 'flexo_A', geometry: new THREE.BoxGeometry(1, 1, 1) },
      { name: 'flexo_B', geometry: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).toNonIndexed() },
    ])
    const json = parseGlbJson(glb)
    for (const prim of primitivesOf(json)) {
      expect(Object.keys(prim.attributes).sort()).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0'])
      for (const [name, index] of Object.entries(prim.attributes)) {
        const accessor = json.accessors?.[index]
        expect(accessor?.componentType).toBe(5126) // FLOAT
        expect(accessor?.type).toBe(name === 'TEXCOORD_0' ? 'VEC2' : 'VEC3')
      }
    }
  })

  it('never interleaves vertex data (bufferView byteStride == element size)', async () => {
    // Same GetGltfBufferWithStride check (:386-404): a bufferView whose byteStride differs from
    // the accessor element size throws "Accessor's buffer view has unexpected stride". An absent
    // byteStride is tight-packed by definition and is fine.
    const glb = await buildMeshAtlasGlb([
      { name: 'flexo_A', geometry: new THREE.PlaneGeometry(1, 1) },
      { name: 'flexo_B', geometry: new THREE.SphereGeometry(0.5, 8, 6).toNonIndexed() },
    ])
    const json = parseGlbJson(glb)
    for (const prim of primitivesOf(json)) {
      for (const index of Object.values(prim.attributes)) {
        const accessor = json.accessors![index]!
        const view = json.bufferViews![accessor.bufferView!]!
        const elementSize = FLOAT_ELEMENT_SIZE[accessor.type]
        expect(elementSize).toBeDefined()
        if (view.byteStride !== undefined) expect(view.byteStride).toBe(elementSize)
      }
    }
  })

  it('writes min/max on every POSITION accessor', async () => {
    // GltfUtils.AddPositionExtremes (:568-584) reads accessor.Min/Max verbatim to derive the
    // mesh bounding sphere used for culling; a missing extreme is a null-deref at load.
    const glb = await buildMeshAtlasGlb([
      { name: 'flexo_A', geometry: new THREE.BoxGeometry(1, 2, 3) },
      { name: 'flexo_B', geometry: new THREE.BoxGeometry(1, 1, 1).toNonIndexed() },
    ])
    const json = parseGlbJson(glb)
    for (const prim of primitivesOf(json)) {
      const accessor = json.accessors?.[prim.attributes.POSITION!]
      expect(accessor?.min).toHaveLength(3)
      expect(accessor?.max).toHaveLength(3)
    }
  })

  it('exposes only the attributes KSA imports, stripping TANGENT and friends', async () => {
    // MeshReference.cs:83 loads meshes with `VertexImportFlags.Normals | UVs` only, so TANGENT /
    // COLOR_0 / TEXCOORD_1 / JOINTS_0 / WEIGHTS_0 are never read — pure file bloat in the mod.
    // TANGENT specifically arrives for free: the editor's MeshAtlasCache runs MikkTSpace for
    // normal-map preview, and that geometry must not leak into the export unchanged.
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const count = geometry.getAttribute('position').count
    geometry.setAttribute('tangent', new THREE.BufferAttribute(new Float32Array(count * 4), 4))
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geometry.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(count * 2), 2))
    const glb = await buildMeshAtlasGlb([{ name: 'flexo_Tangential', geometry }])
    const json = parseGlbJson(glb)
    for (const prim of primitivesOf(json)) {
      expect(Object.keys(prim.attributes).sort()).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0'])
      for (const dead of ['TANGENT', 'COLOR_0', 'TEXCOORD_1', 'JOINTS_0', 'WEIGHTS_0']) {
        expect(prim.attributes).not.toHaveProperty(dead)
      }
    }
    // The caller's geometry is owned by the editor's render cache — stripping must not mutate it.
    expect(geometry.getAttribute('tangent')).toBeDefined()
    expect(geometry.getIndex()).not.toBeNull()
  })

  it('does not mutate a caller geometry that lacks an index', async () => {
    // Same ownership rule for the index rebuild: the editor keeps rendering the de-indexed,
    // tangent-bearing geometry after an export.
    const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
    await buildMeshAtlasGlb([{ name: 'flexo_NonIndexed', geometry }])
    expect(geometry.getIndex()).toBeNull()
  })
})

/**
 * View-mesh decimation. KSA's editor hover is a CPU triangle loop over the _VM mesh
 * (`Part.RayCastEgoSubPart` → `Ray.RaycastWatertight`, decomp/KSA/Part.cs:1854-1887), fed by a
 * de-indexed `double3` copy built at load (decomp/KSA/MeshReference.cs:87-95), and it reads
 * `MeshAttribute.Normal` at the hit vertex — so the simplified copy must stay INDEXED and keep
 * its attributes. An imported model is the only geometry big enough for this to matter.
 */
describe('view-mesh decimation (viewMeshBudget)', () => {
  /** The render + _VM primitives of a single-node atlas, by name. */
  function pairOf(json: ReturnType<typeof parseGlbJson>, name: string) {
    const byName = new Map((json.meshes ?? []).map((m) => [m.name, m.primitives?.[0]]))
    return { render: byName.get(name)!, view: byName.get(`${name}_VM`)! }
  }

  it('ships a smaller, still-indexed _VM for a high-poly node', async () => {
    // ~8k triangles: comfortably over the budget, small enough to keep the test quick.
    const geometry = new THREE.SphereGeometry(1, 96, 48)
    const glb = await buildMeshAtlasGlb([{ name: 'flexo_Heavy', geometry }], {
      viewMeshBudget: 200,
    })
    const json = parseGlbJson(glb)
    const { render, view } = pairOf(json, 'flexo_Heavy')
    expect(view).toBeDefined() // the <MeshView> target still exists, still named <id>_VM
    const renderIndices = json.accessors![render.indices!]!
    const viewIndices = json.accessors![view.indices!]!
    expect(typeof view.indices).toBe('number') // still indexed — KSA draws/picks nothing without it
    expect(viewIndices.count).toBeLessThan(renderIndices.count)
    expect(viewIndices.count % 3).toBe(0)
    // The raycast reads NORMAL at the hit vertex, so the attribute set must survive intact.
    expect(Object.keys(view.attributes).sort()).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0'])
    // The RENDER mesh is never touched — decimation is a picking-only trade.
    expect(renderIndices.count).toBe(geometry.getIndex()!.count)
  })

  it('leaves a node under the budget (and every render mesh) alone', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1) // 12 triangles
    const glb = await buildMeshAtlasGlb([{ name: 'flexo_Light', geometry }], {
      viewMeshBudget: 2000,
    })
    const json = parseGlbJson(glb)
    const { render, view } = pairOf(json, 'flexo_Light')
    expect(json.accessors![view.indices!]!.count).toBe(json.accessors![render.indices!]!.count)
  })

  it('is off by default (no budget ⇒ full-resolution view meshes)', async () => {
    const geometry = new THREE.SphereGeometry(1, 96, 48)
    const glb = await buildMeshAtlasGlb([{ name: 'flexo_Heavy', geometry }])
    const json = parseGlbJson(glb)
    const { render, view } = pairOf(json, 'flexo_Heavy')
    expect(json.accessors![view.indices!]!.count).toBe(json.accessors![render.indices!]!.count)
  })
})
