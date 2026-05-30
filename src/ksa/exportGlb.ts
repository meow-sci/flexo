import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

/**
 * Exports custom primitive geometry as a single binary GLB "mesh atlas", mirroring
 * KSA's built-in atlases: geometry-only (POSITION/NORMAL/TEXCOORD_0), one named
 * mesh per SubPart, NO embedded textures (textures live in separate .ktx2 files
 * referenced by the PbrMaterial in the Assets XML).
 *
 * NAMING — CRITICAL (a wrong name caused an in-game NullReferenceException):
 * KSA's MeshAtlasFileReference.DoLoad() iterates the glTF `meshes[]` array and reads
 * `meshes[i].name` as the SubPart id (and skips names starting with '_'). In glTF the
 * *mesh* name and the *node* name are DISTINCT, and THREE.GLTFExporter writes ONLY the
 * node name (from Object3D.name) — it never emits `meshes[i].name` at all. So a freshly
 * exported GLB has null mesh names, and KSA throws `NullReferenceException` in DoLoad()
 * (`null.StartsWith('_')`), registers no MeshReference, then "MeshReference is null".
 *
 * Fix: post-process the GLB JSON chunk to copy each node's name onto the mesh it
 * references. We keep the node name too (flexo's own MeshAtlasCache resolves geometry
 * via getObjectByName), so both fields end up set to the SubPart id.
 *
 * Authoring orientation is three.js-natural (Y-up); how the result sits inside KSA
 * is validated in-game (see plans/FLEXO_CUSTOM_ASSETS.md). If an axis fix is ever
 * needed, apply it HERE only (rotate the geometry before export) so the editor's
 * own re-import stays consistent.
 */

export interface MeshAtlasNode {
  /** Node + mesh name == the SubPart Mesh Id, e.g. "MyMod_Subpart_Panel". */
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
    mesh.name = node.name // → glTF node name (what flexo's MeshAtlasCache resolves)
    scene.add(mesh)
  }

  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(scene, { binary: true, onlyVisible: false })
  placeholder.dispose()
  if (!(result instanceof ArrayBuffer)) {
    throw new Error('buildMeshAtlasGlb: expected binary GLB output')
  }
  return nameMeshesFromNodes(new Uint8Array(result))
}

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a

/**
 * Rewrites a binary GLB so each glTF mesh carries the name of the node that
 * references it (GLTFExporter omits mesh names — see the file header). Parses the
 * JSON chunk, sets `meshes[i].name`, and re-packs both chunks with correct 4-byte
 * padding and updated lengths.
 */
function nameMeshesFromNodes(glb: Uint8Array): Uint8Array {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('nameMeshesFromNodes: not a GLB')
  const totalLength = dv.getUint32(8, true)

  // First chunk must be JSON.
  const jsonLen = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== CHUNK_JSON) throw new Error('nameMeshesFromNodes: first chunk is not JSON')
  const jsonStart = 20
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(jsonStart, jsonStart + jsonLen)))

  for (const node of json.nodes ?? []) {
    if (typeof node.mesh === 'number' && node.name && json.meshes?.[node.mesh]) {
      json.meshes[node.mesh].name = node.name
    }
  }

  // The binary chunk (if any) follows the JSON chunk.
  const binChunkStart = jsonStart + jsonLen
  const binChunk = binChunkStart < totalLength ? glb.subarray(binChunkStart) : new Uint8Array(0)

  // Re-encode JSON, pad to a 4-byte boundary with spaces (per the GLB spec).
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const pad = (4 - (jsonBytes.length % 4)) % 4
  if (pad) {
    const padded = new Uint8Array(jsonBytes.length + pad)
    padded.set(jsonBytes)
    padded.fill(0x20, jsonBytes.length) // ASCII space
    jsonBytes = padded
  }

  const out = new Uint8Array(12 + 8 + jsonBytes.length + binChunk.length)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, GLB_MAGIC, true)
  odv.setUint32(4, 2, true) // glTF version
  odv.setUint32(8, out.length, true) // total length
  odv.setUint32(12, jsonBytes.length, true) // JSON chunk length
  odv.setUint32(16, CHUNK_JSON, true)
  out.set(jsonBytes, 20)
  out.set(binChunk, 20 + jsonBytes.length)
  return out
}
