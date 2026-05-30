import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

/**
 * Exports custom primitive geometry as a single binary GLB "mesh atlas", mirroring
 * KSA's built-in atlases: geometry-only (POSITION/NORMAL/TEXCOORD_0), one named
 * node per SubPart, NO embedded textures (textures live in separate .ktx2 files
 * referenced by the PbrMaterial in the Assets XML).
 *
 * The node name MUST equal the SubPart's <Mesh Id="...">, because MeshAtlasCache
 * resolves geometry via `gltf.scene.getObjectByName(name)`. GLTFExporter preserves
 * Object3D.name, so each mesh is named directly.
 *
 * Authoring orientation is three.js-natural (Y-up); how the result sits inside KSA
 * is validated in-game (see plans/FLEXO_CUSTOM_ASSETS.md). If an axis fix is ever
 * needed, apply it HERE only (rotate the geometry before export) so the editor's
 * own re-import stays consistent.
 */

export interface MeshAtlasNode {
  /** Node name == the SubPart Mesh Id, e.g. "MyMod_Subpart_Panel". */
  name: string
  geometry: THREE.BufferGeometry
}

export async function buildMeshAtlasGlb(nodes: MeshAtlasNode[]): Promise<Uint8Array> {
  if (nodes.length === 0) throw new Error('buildMeshAtlasGlb: no nodes to export')

  const scene = new THREE.Scene()
  // A single shared placeholder material — KSA ignores GLB materials and applies
  // the XML PbrMaterial, but GLTFExporter requires meshes to have one.
  const placeholder = new THREE.MeshStandardMaterial()
  for (const node of nodes) {
    const mesh = new THREE.Mesh(node.geometry, placeholder)
    mesh.name = node.name
    scene.add(mesh)
  }

  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(scene, { binary: true, onlyVisible: false })
  placeholder.dispose()
  if (!(result instanceof ArrayBuffer)) {
    throw new Error('buildMeshAtlasGlb: expected binary GLB output')
  }
  return new Uint8Array(result)
}
