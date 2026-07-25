import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import type { GltfJson, LoadedModel } from '../three/loadModelFile'
import { analyzeImport, DEFAULT_IMPORT_OPTIONS, type ImportOptions } from './importPlan'

/**
 * Inputs are built PROGRAMMATICALLY with three (never a committed binary fixture): three's own
 * GLTFLoader produces exactly this shape — one `Mesh` per glTF primitive, materials resolved,
 * node transforms on the graph — so a synthetic scene exercises the same code paths.
 */

function model(scene: THREE.Object3D, fileName = 'model.glb'): LoadedModel {
  const root = new THREE.Group()
  root.add(scene)
  return { scene: root, fileName }
}

function opts(overrides: Partial<ImportOptions> = {}): ImportOptions {
  return { ...DEFAULT_IMPORT_OPTIONS, ...overrides }
}

function box(name: string, material = new THREE.MeshStandardMaterial()): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
  mesh.name = name
  return mesh
}

function codes(plan: { warnings: { code: string }[] }): string[] {
  return plan.warnings.map((w) => w.code)
}

describe('analyzeImport — (mesh × material) grouping', () => {
  it('splits one object with two materials into two groups', () => {
    // KSA renders one <Mesh> + one <Material> per <PartModel> and draws only primitive 0, so a
    // multi-material object cannot survive as a single SubPart.
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    geometry.clearGroups()
    geometry.addGroup(0, 18, 0)
    geometry.addGroup(18, 18, 1)
    const painted = new THREE.MeshStandardMaterial()
    painted.name = 'PaintedMetal'
    const glow = new THREE.MeshStandardMaterial()
    glow.name = 'Indicator'
    const mesh = new THREE.Mesh(geometry, [painted, glow])
    mesh.name = 'Hull'

    const plan = analyzeImport(model(mesh), opts())

    expect(plan.groups).toHaveLength(2)
    expect(plan.groups.map((g) => g.suggestedName)).toEqual([
      'Hull · PaintedMetal',
      'Hull · Indicator',
    ])
    expect(plan.groups.map((g) => g.triangles)).toEqual([6, 6])
    expect(plan.totals).toMatchObject({ subParts: 2, placements: 2, materials: 2 })
    expect(codes(plan)).toContain('multiMaterial')
  })

  it('collapses two nodes sharing one geometry+material into ONE group with TWO instances', () => {
    // The KSA pattern: 1 SubPart, N placements — instancing for free.
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial()
    material.name = 'Steel'
    const a = new THREE.Mesh(geometry, material)
    a.name = 'BoltA'
    a.position.set(1, 0, 0)
    const b = new THREE.Mesh(geometry, material)
    b.name = 'BoltB'
    b.position.set(-1, 0, 0)
    const root = new THREE.Group()
    root.add(a, b)

    const plan = analyzeImport(model(root), opts())

    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]!.instances.map((i) => i.nodeName)).toEqual(['BoltA', 'BoltB'])
    // A node that produced exactly one group keeps its plain name (no " · Material" suffix).
    expect(plan.groups[0]!.suggestedName).toBe('BoltA')
    expect(plan.totals).toMatchObject({ subParts: 1, placements: 2, triangles: 12, materials: 1 })
  })

  it('carries each node world matrix (relative to the scene root) on its instance', () => {
    const mesh = box('Pod')
    mesh.position.set(0.5, 1, -2)
    const parent = new THREE.Group()
    parent.position.set(0, 3, 0)
    parent.add(mesh)

    const plan = analyzeImport(model(parent), opts())

    const position = new THREE.Vector3().setFromMatrixPosition(plan.groups[0]!.instances[0]!.matrix)
    expect(position.toArray()).toEqual([0.5, 4, -2])
  })
})

describe('analyzeImport — scale + up-axis correction', () => {
  it('applies the uniform scale to bounds and placements', () => {
    const mesh = box('Cube')
    mesh.position.set(1, 0, 0)

    const plan = analyzeImport(model(mesh), opts({ scale: 2 }))

    expect(plan.bounds.size.toArray()).toEqual([2, 2, 2])
    const position = new THREE.Vector3().setFromMatrixPosition(plan.groups[0]!.instances[0]!.matrix)
    expect(position.toArray()).toEqual([2, 0, 0])
  })

  it("rotates a Z-up file by RotX(-90°) so it lands in KSA's Y-up basis", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 4), new THREE.MeshStandardMaterial())
    mesh.name = 'Tank'
    mesh.position.set(0, 0, 5)

    const plan = analyzeImport(model(mesh), opts({ upAxis: 'z' }))

    // The file's Z extent (4) becomes the Y extent; its Y extent (2) becomes Z.
    const size = plan.bounds.size
    expect(size.x).toBeCloseTo(1, 6)
    expect(size.y).toBeCloseTo(4, 6)
    expect(size.z).toBeCloseTo(2, 6)
    // ...and the node's +Z offset becomes +Y.
    const position = new THREE.Vector3().setFromMatrixPosition(plan.groups[0]!.instances[0]!.matrix)
    expect(position.x).toBeCloseTo(0, 6)
    expect(position.y).toBeCloseTo(5, 6)
    expect(position.z).toBeCloseTo(0, 6)
  })
})

describe('analyzeImport — warnings', () => {
  it('warns about a missing UV map', () => {
    const mesh = box('Bolt')
    mesh.geometry.deleteAttribute('uv')
    const plan = analyzeImport(model(mesh), opts())
    const warning = plan.warnings.find((w) => w.code === 'noUv')
    expect(warning?.subject).toBe('Bolt')
    expect(warning?.remedy).toMatch(/unwrap/i)
  })

  it('warns about missing normals (and does not offer a remedy — it is automatic)', () => {
    const mesh = box('Bolt')
    mesh.geometry.deleteAttribute('normal')
    const plan = analyzeImport(model(mesh), opts())
    const warning = plan.warnings.find((w) => w.code === 'noNormals')
    expect(warning).toBeDefined()
    expect(warning?.remedy).toBeUndefined()
  })

  it('warns about vertex colours, which KSA never reads', () => {
    const mesh = box('Painted')
    const count = mesh.geometry.getAttribute('position').count
    mesh.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    expect(codes(analyzeImport(model(mesh), opts()))).toContain('vertexColors')
  })

  it('warns about a second UV set', () => {
    const mesh = box('Panel')
    const count = mesh.geometry.getAttribute('position').count
    mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(count * 2), 2))
    expect(codes(analyzeImport(model(mesh), opts()))).toContain('uv1')
  })

  it('warns about a double-sided material, since KSA always culls back faces', () => {
    const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
    material.name = 'Sail'
    const plan = analyzeImport(model(box('Sail', material)), opts())
    const warning = plan.warnings.find((w) => w.code === 'doubleSided')
    expect(warning?.subject).toBe('Sail')
    expect(warning?.remedy).toMatch(/double-sided/i)
  })

  it('distinguishes alpha cutout from alpha blending', () => {
    const masked = new THREE.MeshStandardMaterial({ alphaTest: 0.5 })
    masked.name = 'Grate'
    expect(codes(analyzeImport(model(box('Grate', masked)), opts()))).toContain('alphaMask')

    const blended = new THREE.MeshStandardMaterial({ transparent: true })
    blended.name = 'Canopy'
    expect(codes(analyzeImport(model(box('Canopy', blended)), opts()))).toContain('alphaBlend')
  })

  it('warns about a mirrored (negative-scale) transform', () => {
    const mesh = box('MirrorArm')
    mesh.scale.set(-1, 1, 1)
    const plan = analyzeImport(model(mesh), opts())
    expect(plan.warnings.find((w) => w.code === 'mirrored')?.subject).toBe('MirrorArm')
  })

  it('warns when the file has no meshes at all', () => {
    const plan = analyzeImport(model(new THREE.Group(), 'empty.glb'), opts())
    expect(plan.groups).toHaveLength(0)
    expect(plan.warnings.find((w) => w.code === 'noMeshes')?.subject).toBe('empty.glb')
    expect(plan.bounds.size.toArray()).toEqual([0, 0, 0])
  })

  it('warns once per (code, subject), not once per instance', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    geometry.deleteAttribute('uv')
    const material = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = 'Bolt'
      root.add(mesh)
    }
    const plan = analyzeImport(model(root), opts())
    expect(plan.warnings.filter((w) => w.code === 'noUv')).toHaveLength(1)
  })

  it('warns that glTF animations are not imported', () => {
    const mesh = box('Arm')
    const root = new THREE.Group()
    root.add(mesh)
    root.animations = [new THREE.AnimationClip('Deploy', 1, [])]
    // `model()` re-parents into a fresh root, so analyze against this one directly.
    const plan = analyzeImport({ scene: root, fileName: 'arm.glb' }, opts())
    expect(codes(plan)).toContain('animations')
  })
})

describe('analyzeImport — glTF-source material warnings', () => {
  /**
   * These live only in the glTF JSON: three's MeshStandardMaterial folds factors in, drops the
   * extensions it can't express and turns wrap modes into its own enums, so a model that looks
   * right in Blender would go wrong in KSA with no explanation. A stub {@link ModelSource} is
   * the whole input — analyzeImport reads nothing else from it but the material index.
   */
  function withSource(mesh: THREE.Mesh, json: GltfJson): LoadedModel {
    const root = new THREE.Group()
    root.add(mesh)
    return {
      scene: root,
      fileName: 'model.glb',
      source: {
        json,
        materialIndex: () => 0,
        imageBytes: async () => null,
      },
    }
  }

  function analyze(json: GltfJson, name = 'Hull'): ReturnType<typeof analyzeImport> {
    const material = new THREE.MeshStandardMaterial()
    material.name = name
    return analyzeImport(withSource(box(name, material), json), opts())
  }

  it('records the glTF material index on the group', () => {
    const plan = analyze({ materials: [{}] })
    expect(plan.groups[0]!.materialIndex).toBe(0)
    // No source ⇒ no glTF identity (a programmatically built scene).
    expect(analyzeImport(model(box('Hull')), opts()).groups[0]!.materialIndex).toBeNull()
  })

  it('names each unsupported material extension', () => {
    const plan = analyze({
      materials: [{ extensions: { KHR_materials_clearcoat: {}, KHR_materials_ior: {} } }],
    })
    const warnings = plan.warnings.filter((w) => w.code === 'materialExtension')
    expect(warnings).toHaveLength(2)
    expect(warnings.map((w) => w.message).join(' ')).toMatch(/clearcoat/)
    expect(warnings.map((w) => w.message).join(' ')).toMatch(/KHR_materials_ior/)
  })

  it('warns about a KHR_texture_basisu source image (not re-encodable)', () => {
    const plan = analyze({
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
    })
    const warning = plan.warnings.find((w) => w.code === 'basisuImage')
    expect(warning?.subject).toBe('Hull:base colour')
    expect(warning?.remedy).toMatch(/PNG/i)
  })

  it('warns about a non-repeat sampler wrap mode (KSA hard-wires Repeat)', () => {
    const plan = analyze({
      materials: [{ normalTexture: { index: 0 } }],
      textures: [{ source: 0, sampler: 0 }],
      samplers: [{ wrapS: 33071, wrapT: 10497 }], // CLAMP_TO_EDGE / REPEAT
    })
    expect(plan.warnings.find((w) => w.code === 'samplerWrap')?.subject).toBe('Hull:normal')
    // The default (no sampler declared) is REPEAT and must stay silent.
    const plain = analyze({
      materials: [{ normalTexture: { index: 0 } }],
      textures: [{ source: 0 }],
    })
    expect(codes(plain)).not.toContain('samplerWrap')
  })

  it('warns about KHR_texture_transform and per-channel TEXCOORD_1', () => {
    const plan = analyze({
      materials: [
        {
          pbrMetallicRoughness: {
            baseColorTexture: {
              index: 0,
              extensions: { KHR_texture_transform: { scale: [2, 2] } },
            },
          },
          occlusionTexture: { index: 0, texCoord: 1 },
        },
      ],
      textures: [{ source: 0 }],
    })
    expect(plan.warnings.find((w) => w.code === 'textureTransform')?.subject).toBe(
      'Hull:base colour',
    )
    expect(plan.warnings.find((w) => w.code === 'textureUv1')?.subject).toBe('Hull:occlusion')
  })
})

describe('analyzeImport — skinned meshes', () => {
  it('bakes the bind pose to root space and places the result at the correction alone', () => {
    // KSA parts have no GPU skinning (MeshReference.cs:83 imports Normals|UVs only).
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const count = geometry.getAttribute('position').count
    const weights = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) weights[i * 4] = 1 // fully bound to bone 0
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(count * 4), 4))
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4))
    const bone = new THREE.Bone()
    const skeleton = new THREE.Skeleton([bone])
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial())
    mesh.name = 'Boom'
    mesh.add(bone)
    mesh.bind(skeleton)
    mesh.position.set(0, 2, 0)

    const plan = analyzeImport(model(mesh), opts())

    const group = plan.groups[0]!
    expect(group.skinnedRootBake).toBeDefined()
    expect(group.instances).toHaveLength(1)
    expect(group.instances[0]!.matrix.equals(new THREE.Matrix4())).toBe(true)
    // The node's +2 Y offset now lives in the baked vertices, not the placement.
    expect(plan.bounds.min.y).toBeCloseTo(1.5, 6)
    expect(codes(plan)).toContain('skinned')
  })
})
