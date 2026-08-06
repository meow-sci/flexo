import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

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
 * GEOMETRY — CRITICAL (indices are mandatory, extra attributes are not read):
 * KSA's glTF reader only builds an index buffer `if (prim.Indices.HasValue)`
 * (decomp/RenderCore.Gltf/GltfUtils.cs:484-488). A primitive WITHOUT `indices` therefore
 * loads with an empty index buffer: it draws zero triangles and its CPU picking span is
 * empty (decomp/KSA/MeshReference.cs:90-96) — an invisible, unpickable part with NO error
 * message. THREE.GLTFExporter faithfully omits `indices` for a non-indexed BufferGeometry,
 * and three's MikkTSpace tangent generator DE-INDEXES geometry (see MeshAtlasCache, which
 * adds tangents for the editor's normal-map preview), so a geometry that took the editor's
 * path would silently export as a no-draw. toKsaGeometry() below therefore ALWAYS indexes.
 * It also strips every attribute KSA never imports — meshes load with
 * `VertexImportFlags.Normals | UVs` only (decomp/KSA/MeshReference.cs:83), so TANGENT /
 * COLOR_0 / TEXCOORD_1 / JOINTS_0 / WEIGHTS_0 are dead weight in the shipped mod. Neither
 * step may mutate the caller's geometry (the editor's render cache owns it and its tangents
 * must survive), so both operate on a clone.
 *
 * Authoring orientation is three.js-natural (Y-up); how the result sits inside KSA
 * is validated in-game (see plans/FLEXO_CUSTOM_ASSETS.md). If an axis fix is ever
 * needed, apply it HERE only (rotate the geometry before export) so the editor's
 * own re-import stays consistent.
 *
 * VIEW MESHES — every render mesh gets a paired "<id>_VM" node (same geometry). KSA's
 * vehicle editor only raycasts a SubPart that carries a MeshViewModule, which is wired
 * from a `<MeshView><Mesh Id="<id>_VM"/></MeshView>` element pointing at a mesh in this
 * atlas (see RayCastEgoSubPart → Modules.Get<MeshViewModule>()). Without a _VM mesh a
 * placed part renders but can't be hovered, selected, or right-clicked. Every built-in
 * Core SubPart ships a distinct _VM mesh, so we mirror that exactly. The XML side of
 * this contract lives in assetsXmlSerializer (it appends `_VM` to the SubPart id).
 *
 * VIEW-MESH COST — the view mesh is not free geometry, it is a CPU workload. On mod load
 * `MeshReference.Load` DE-INDEXES it into `PositionsCompare` (one `double3` — 24 bytes —
 * per INDEX, `decomp/KSA/MeshReference.cs:87-95`), and every hover in the vehicle editor
 * runs `Part.RayCastEgoSubPart` → `Ray.RaycastWatertight`, a plain `for (i += 3)` triangle
 * loop over that whole array (`decomp/KSA/Part.cs:1854-1887`, `decomp/KSA/Ray.cs:194-213`),
 * then reads `MeshAttribute.Normal` at the winning vertex. flexo's own primitives are tens
 * of triangles, but an IMPORTED model can be six figures — so {@link MeshAtlasOptions.viewMeshBudget}
 * decimates the _VM copy (index buffer only; the vertex arrays, and therefore the NORMAL
 * the raycast reads, are untouched).
 */

/** Suffix KSA's Core content uses for view (picking) meshes; see file header. */
export const VIEW_MESH_SUFFIX = '_VM';

export interface MeshAtlasNode {
  /** Node + mesh name == the SubPart Mesh Id, e.g. "MyMod_Subpart_Panel". */
  name: string;
  geometry: THREE.BufferGeometry;
}

/**
 * three.js attribute names that survive into the atlas, i.e. the ones KSA's mesh loader
 * actually imports (POSITION / NORMAL / TEXCOORD_0). See the GEOMETRY block in the header.
 */
const KSA_READ_ATTRIBUTES = new Set(['position', 'normal', 'uv']);

/**
 * Returns a NEW geometry that satisfies KSA's mesh loader: indexed, and carrying only the
 * attributes the game imports. Never mutates the input — callers pass geometry owned by the
 * editor's caches. See the GEOMETRY block in the file header for why each step is required.
 */
function toKsaGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geometry.clone();
  for (const name of Object.keys(out.attributes)) {
    if (!KSA_READ_ATTRIBUTES.has(name)) out.deleteAttribute(name);
  }
  if (!out.getIndex()) {
    // De-indexed input (MikkTSpace tangents, geometry.toNonIndexed(), some DCC exports):
    // rebuild the trivial 0..count-1 index so GLTFExporter emits an `indices` accessor.
    const count = out.getAttribute('position')?.count ?? 0;
    const index = count > 65536 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i++) index[i] = i;
    out.setIndex(new THREE.BufferAttribute(index, 1));
  }
  return out;
}

/**
 * Simplification error budget for a decimated view mesh, as a fraction of the mesh's extent
 * (meshopt's `target_error` is scale-relative). 5% keeps the picking hull on the silhouette
 * while letting the simplifier actually REACH the triangle budget — a stricter error makes it
 * stop early and ship a mesh that still costs the full per-hover raycast. Picking tolerance is
 * the only thing at stake: the _VM mesh is never rendered.
 */
const VIEW_MESH_TARGET_ERROR = 0.05;

/**
 * Decimates a view mesh IN PLACE to at most `budget` triangles, by replacing its index buffer
 * with a meshopt-simplified one over the SAME vertex arrays — so POSITION / NORMAL / TEXCOORD_0
 * survive verbatim and the mesh stays indexed (both KSA requirements: `MeshReference.Load`
 * reads `MeshAttribute.Normal` at the hit vertex, and a primitive with no `indices` draws and
 * picks nothing — `decomp/RenderCore.Gltf/GltfUtils.cs:484-488`).
 *
 * Best-effort by contract: an unexpected attribute layout, a missing wasm module or a
 * simplifier that can't beat the budget all fall back to the full-resolution copy with a
 * warning. A slow hover in-game is a nuisance; a failed export is not acceptable.
 */
async function decimateViewGeometry(geometry: THREE.BufferGeometry, budget: number): Promise<void> {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  if (!index || !position) return;
  const target = budget * 3;
  if (index.count <= target) return; // already within budget
  if (position.itemSize !== 3 || 'isInterleavedBufferAttribute' in position) {
    console.warn('flexo export: view mesh kept full-resolution (unexpected position layout)');
    return;
  }
  try {
    const { MeshoptSimplifier } = await import('three/addons/libs/meshopt_simplifier.module.js');
    await MeshoptSimplifier.ready;
    const positions =
      position.array instanceof Float32Array
        ? position.array
        : new Float32Array(position.array as ArrayLike<number>);
    // meshopt accepts 16/32-bit index arrays; normalize so a ubyte/ushort source can't trip it.
    const indices = new Uint32Array(index.array as ArrayLike<number>);
    const [simplified] = MeshoptSimplifier.simplify(
      indices,
      positions,
      3,
      target,
      VIEW_MESH_TARGET_ERROR,
    );
    if (simplified.length === 0 || simplified.length >= indices.length) return; // no win
    // Unused vertices stay in the buffers (meshopt returns indices into the ORIGINAL arrays).
    // That costs a few bytes in the shipped GLB; what it saves is the per-hover CPU loop and
    // the double3-per-index PositionsCompare allocation, which is the whole point.
    geometry.setIndex(
      new THREE.BufferAttribute(
        position.count > 65535 ? simplified : new Uint16Array(simplified),
        1,
      ),
    );
  } catch (err) {
    console.warn('flexo export: view mesh decimation unavailable — shipping full resolution', err);
  }
}

export interface MeshAtlasOptions {
  /**
   * Emit the paired `<id>_VM` picking mesh for every node (default true — the shipped mod
   * needs them, see VIEW MESHES in the file header).
   *
   * The model importer sets this FALSE: its atlas is an intermediate, editor-side store of
   * normalized geometry in IndexedDB, not something KSA ever loads. The `_VM` pairs are
   * generated from the same geometry at export time (and may be decimated there), so
   * carrying them in the import atlas would double its size for nothing.
   */
  viewMeshes?: boolean;
  /**
   * Max triangles in an emitted `<id>_VM` view mesh; anything above it is simplified down
   * (render meshes are never touched). Undefined ⇒ never decimate. See VIEW-MESH COST in the
   * file header for why this matters in-game; `buildMultiCustomBundle` sets the shipped default.
   */
  viewMeshBudget?: number;
}

export async function buildMeshAtlasGlb(
  nodes: MeshAtlasNode[],
  { viewMeshes = true, viewMeshBudget }: MeshAtlasOptions = {},
): Promise<Uint8Array> {
  if (nodes.length === 0) throw new Error('buildMeshAtlasGlb: no nodes to export');

  const scene = new THREE.Scene();
  // A single shared placeholder material — KSA ignores GLB materials and applies
  // the XML PbrMaterial, but GLTFExporter requires meshes to have one.
  const placeholder = new THREE.MeshStandardMaterial();
  const temporaries: THREE.BufferGeometry[] = [];
  for (const node of nodes) {
    const geometry = toKsaGeometry(node.geometry);
    temporaries.push(geometry);
    const mesh = new THREE.Mesh(geometry, placeholder);
    mesh.name = node.name; // → glTF node name (what flexo's MeshAtlasCache resolves)
    scene.add(mesh);
    // Paired view (picking) mesh so the in-game editor can hover/select the part.
    // Same shape — flexo primitives are low-poly, so a simplified picking mesh buys
    // nothing. The geometry must be a distinct instance (not the render geometry):
    // GLTFExporter dedupes meshes that share geometry+material into ONE glTF mesh, which
    // would collapse the render and view meshes and leave KSA only one registered name.
    // Referenced from <MeshView> in the Assets XML. See file header.
    if (viewMeshes) {
      const viewGeometry = toKsaGeometry(node.geometry);
      temporaries.push(viewGeometry);
      // Heavy (imported) geometry gets a decimated picking hull — see VIEW-MESH COST above.
      if (viewMeshBudget != null) await decimateViewGeometry(viewGeometry, viewMeshBudget);
      const viewMesh = new THREE.Mesh(viewGeometry, placeholder);
      viewMesh.name = node.name + VIEW_MESH_SUFFIX;
      scene.add(viewMesh);
    }
  }

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true, onlyVisible: false });
  placeholder.dispose();
  for (const g of temporaries) g.dispose();
  if (!(result instanceof ArrayBuffer)) {
    throw new Error('buildMeshAtlasGlb: expected binary GLB output');
  }
  return nameMeshesFromNodes(new Uint8Array(result));
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

/**
 * Rewrites a binary GLB so each glTF mesh carries the name of the node that
 * references it (GLTFExporter omits mesh names — see the file header). Parses the
 * JSON chunk, sets `meshes[i].name`, and re-packs both chunks with correct 4-byte
 * padding and updated lengths.
 */
function nameMeshesFromNodes(glb: Uint8Array): Uint8Array {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('nameMeshesFromNodes: not a GLB');
  const totalLength = dv.getUint32(8, true);

  // First chunk must be JSON.
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON)
    throw new Error('nameMeshesFromNodes: first chunk is not JSON');
  const jsonStart = 20;
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(jsonStart, jsonStart + jsonLen)));

  for (const node of json.nodes ?? []) {
    if (typeof node.mesh === 'number' && node.name && json.meshes?.[node.mesh]) {
      json.meshes[node.mesh].name = node.name;
    }
  }

  // The binary chunk (if any) follows the JSON chunk.
  const binChunkStart = jsonStart + jsonLen;
  const binChunk = binChunkStart < totalLength ? glb.subarray(binChunkStart) : new Uint8Array(0);

  // Re-encode JSON, pad to a 4-byte boundary with spaces (per the GLB spec).
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (jsonBytes.length % 4)) % 4;
  if (pad) {
    const padded = new Uint8Array(jsonBytes.length + pad);
    padded.set(jsonBytes);
    padded.fill(0x20, jsonBytes.length); // ASCII space
    jsonBytes = padded;
  }

  const out = new Uint8Array(12 + 8 + jsonBytes.length + binChunk.length);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, GLB_MAGIC, true);
  odv.setUint32(4, 2, true); // glTF version
  odv.setUint32(8, out.length, true); // total length
  odv.setUint32(12, jsonBytes.length, true); // JSON chunk length
  odv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.set(binChunk, 20 + jsonBytes.length);
  return out;
}
