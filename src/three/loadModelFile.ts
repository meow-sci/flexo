import * as THREE from 'three'
import { GLTFLoader, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

/**
 * File(s) → a three.js scene, the front door of the model importer.
 *
 * WHY glTF ONLY (plan §1.2): KSA itself speaks glTF — its mesh atlases are GLB and
 * `MeshAtlasFileReference` is a glTF loader (decomp/KSA/MeshAtlasFileReference.cs:24) — and
 * flexo already WRITES GLB (`src/ksa/exportGlb.ts`), so importing glTF makes the whole path
 * one format end to end. glTF's metallic-roughness material model also maps 1:1 onto KSA's
 * five `<PbrMaterial>` slots including the ORM channel packing (KSA's shader comment literally
 * says "Following GLTF spec"), and a `.glb` embeds geometry AND images so "import a model with
 * its textures" is a single drop. FBX/OBJ/USD each lose materials, need sidecars, or have only
 * best-effort browser loaders — they are deliberately out of scope.
 *
 * `.glb` is the primary path; `.gltf` + sidecars (`.bin`, images) is accepted as a multi-file
 * drop, resolved through a `filename → blob: URL` map installed on the LoadingManager — the
 * same URL-modifier trick `src/three/kittenBake.ts` uses for the kittens' missing DefaultORM.
 *
 * DECODERS: Draco and meshopt are wired because Blender/DCC exporters offer both and a
 * compressed file would otherwise fail with an opaque error. KTX2 is deliberately NOT wired:
 * `KTX2Loader` needs a WebGLRenderer to detect transcode targets, and a `KHR_texture_basisu`
 * source image can't be CPU-decoded back to pixels for flexo's own KTX2 re-encode anyway — the
 * material phase warns and asks for a PNG/JPEG re-export instead.
 */

// ── the glTF JSON slice the material pass reads ──────────────────────────────
//
// `GLTFParser.json` is typed `any` by three. These interfaces are the narrow, typed view of
// the parts flexo's material translation actually consumes (plan §3.4): the factors three
// folds into its own material (and therefore loses), the extensions KSA has no equivalent
// for, the sampler wrap modes it hard-wires, and the image → bytes indirection.

/** A `textureInfo`: which texture, which UV set, plus any per-reference extensions. */
export interface GltfTextureRef {
  index: number
  /** TEXCOORD_n. KSA reads UV0 only (decomp/KSA/MeshReference.cs:83), so ≠0 warns. */
  texCoord?: number
  extensions?: Record<string, unknown>
}

/** `material.normalTexture` — a texture ref plus the bump `scale`. */
export interface GltfNormalTextureRef extends GltfTextureRef {
  scale?: number
}

/** `material.occlusionTexture` — a texture ref plus the AO `strength`. */
export interface GltfOcclusionTextureRef extends GltfTextureRef {
  strength?: number
}

/** One `materials[i]` entry, metallic-roughness only (the model KSA's PbrMaterial mirrors). */
export interface GltfMaterialDef {
  name?: string
  pbrMetallicRoughness?: {
    /** Linear RGBA multiplier, default [1,1,1,1]. */
    baseColorFactor?: number[]
    baseColorTexture?: GltfTextureRef
    /** Default 1. */
    metallicFactor?: number
    /** Default 1. */
    roughnessFactor?: number
    metallicRoughnessTexture?: GltfTextureRef
  }
  normalTexture?: GltfNormalTextureRef
  occlusionTexture?: GltfOcclusionTextureRef
  /** Linear RGB, default [0,0,0]. */
  emissiveFactor?: number[]
  emissiveTexture?: GltfTextureRef
  alphaMode?: string
  doubleSided?: boolean
  extensions?: Record<string, unknown>
}

/** One `textures[i]` entry — the sampler + image indirection. */
export interface GltfTextureDef {
  source?: number
  sampler?: number
  extensions?: Record<string, unknown>
}

/** One `samplers[i]` entry. KSA's global sampler is Repeat on U/V/W, so these are advisory. */
export interface GltfSamplerDef {
  wrapS?: number
  wrapT?: number
}

/** One `images[i]` entry — either a GLB `bufferView` or a (possibly sidecar) `uri`. */
export interface GltfImageDef {
  name?: string
  uri?: string
  mimeType?: string
  bufferView?: number
}

/** The typed slice of the glTF JSON document flexo reads. */
export interface GltfJson {
  materials?: GltfMaterialDef[]
  textures?: GltfTextureDef[]
  samplers?: GltfSamplerDef[]
  images?: GltfImageDef[]
}

/** An image's ORIGINAL encoded bytes (PNG/JPEG as authored) — never a canvas re-encode. */
export interface GltfImageBytes {
  bytes: Uint8Array
  mime: string
}

/**
 * A narrow façade over `GLTFParser` — the source-level data three's scene graph does NOT
 * carry, which is exactly what the material pass needs (see `src/ksa/importMaterials.ts`).
 *
 * three folds every glTF factor into its own `MeshStandardMaterial` (and drops what it can't
 * express), so reading factors/extensions back off the three material would be lossy and
 * indirect. Reading the JSON is exact, and `parser.associations` — the Map three maintains
 * from its own objects back to glTF indices — is the sanctioned way to get from a group's
 * three material to its `materials[i]` entry.
 */
export interface ModelSource {
  /** The parsed glTF JSON document. */
  json: GltfJson
  /** `materials[i]` index for a three material (via `parser.associations`), or null. */
  materialIndex(material: THREE.Material): number | null
  /**
   * The ORIGINAL encoded bytes of `images[i]`.
   *
   * Original bytes matter: flexo stores the source blob under `tex-src:<id>` and RE-ENCODES
   * from it whenever a channel or normal strength changes (customAssetStore.setTextureChannel /
   * ensureCurrentKtx2). A canvas readback would silently become the new "source", so a later
   * channel change would re-encode a lossy copy. Returns null when the image is unreachable.
   */
  imageBytes(imageIndex: number): Promise<GltfImageBytes | null>
}

/** A parsed model, ready for `analyzeImport`. */
export interface LoadedModel {
  /** The glTF scene root. Node transforms are still on the graph — nothing is baked yet. */
  scene: THREE.Group
  /** The entry file's name, e.g. "rcs_pod.glb" — provenance + the default layer/name prefix. */
  fileName: string
  /**
   * The glTF-source façade. Always present for a file loaded by {@link loadModelFile};
   * optional so a programmatically built scene (unit tests, a future non-glTF source) is
   * still a valid model — the material pass then simply contributes nothing.
   */
  source?: ModelSource
}

/** Entry-file extensions we accept, in preference order. */
const ENTRY_EXTENSIONS = ['.glb', '.gltf'] as const

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Picks the single entry file out of a drop: the one `.glb`, else the one `.gltf`. Zero or
 * several is ambiguous — importing "some of" a drop would silently drop the user's geometry,
 * so it is an error with a message naming what we found.
 */
function pickEntryFile(files: File[]): File {
  if (files.length === 0) throw new Error('No files were provided.')
  for (const ext of ENTRY_EXTENSIONS) {
    const matches = files.filter((f) => extensionOf(f.name) === ext)
    if (matches.length === 1) return matches[0]!
    if (matches.length > 1) {
      const names = matches.map((f) => f.name).join(', ')
      throw new Error(`Drop one model at a time — found ${matches.length} ${ext} files: ${names}.`)
    }
  }
  const names = files.map((f) => f.name).join(', ')
  throw new Error(`No .glb or .gltf file found in: ${names}. flexo imports glTF 2.0 models only.`)
}

/** The last path segment of a URL/URI, without query or fragment. */
function lastSegment(uri: string): string {
  const clean = uri.split(/[?#]/, 1)[0] ?? uri
  const slash = clean.lastIndexOf('/')
  return slash < 0 ? clean : clean.slice(slash + 1)
}

/** `decodeURIComponent` that yields the input when it isn't valid percent-encoding. */
function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * Builds the sibling-file lookup for a `.gltf` drop. Keyed by the file's own name AND its
 * percent-decoded form, because glTF URIs are percent-encoded ("my%20image.png") while the
 * `File.name` from a drop is not — matching only one of the two loses textures whose name
 * contains a space.
 */
function buildSiblings(files: File[]): {
  byName: Map<string, File>
  urls: Map<string, string>
  created: string[]
} {
  const byName = new Map<string, File>()
  const urls = new Map<string, string>()
  const created: string[] = []
  for (const file of files) {
    const url = URL.createObjectURL(file)
    created.push(url)
    for (const key of [file.name, decodeSafe(file.name)]) {
      byName.set(key, file)
      urls.set(key, url)
    }
  }
  return { byName, urls, created }
}

/** MIME type from a file extension, for sidecar images whose glTF entry omits `mimeType`. */
function mimeFromName(name: string): string {
  const ext = extensionOf(name)
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'image/png'
}

/**
 * Reads one `images[i]`'s original encoded bytes. Three sources, in glTF's own order of
 * precedence: a GLB `bufferView`, a `data:` URI, or a sidecar file from the drop.
 *
 * A sidecar is read straight off the retained `File` rather than re-fetched through the
 * loader's blob URL: those URLs are revoked as soon as `parseAsync` resolves (see
 * {@link loadModelFile}), and `File.arrayBuffer()` yields the identical bytes with no
 * lifetime to manage.
 */
async function readImageBytes(
  parser: GLTFParser,
  json: GltfJson,
  siblings: Map<string, File>,
  index: number,
): Promise<GltfImageBytes | null> {
  const image = json.images?.[index]
  if (!image) return null
  if (image.bufferView !== undefined) {
    // `loadBufferView` already slices the view out of the GLB binary chunk.
    const view = (await parser.getDependency('bufferView', image.bufferView)) as ArrayBuffer
    return { bytes: new Uint8Array(view), mime: image.mimeType || 'image/png' }
  }
  if (!image.uri) return null
  if (image.uri.startsWith('data:')) {
    const res = await fetch(image.uri)
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { bytes, mime: image.mimeType || res.headers.get('content-type') || 'image/png' }
  }
  const segment = lastSegment(image.uri)
  const file = siblings.get(segment) ?? siblings.get(decodeSafe(segment))
  if (!file) return null
  const bytes = new Uint8Array(await file.arrayBuffer())
  return { bytes, mime: image.mimeType || file.type || mimeFromName(file.name) }
}

/** Builds the {@link ModelSource} façade, memoizing each image read (one image, N channels). */
function makeSource(parser: GLTFParser, siblings: Map<string, File>): ModelSource {
  const json = parser.json as GltfJson
  const images = new Map<number, Promise<GltfImageBytes | null>>()
  return {
    json,
    materialIndex: (material) => parser.associations.get(material)?.materials ?? null,
    imageBytes: (index) => {
      let pending = images.get(index)
      if (!pending) {
        pending = readImageBytes(parser, json, siblings, index).catch((err) => {
          console.warn(`flexo: glTF image ${index} could not be read`, err)
          return null
        })
        images.set(index, pending)
      }
      return pending
    },
  }
}

/**
 * Parks the file's animation clips on the scene root's standard `Object3D.animations`
 * field. GLTFLoader returns them beside the scene rather than on it, and `LoadedModel`
 * is deliberately just (scene, fileName) — but `analyzeImport` still has to warn that
 * glTF animations aren't imported, and this is three's own place to hang them.
 */
function withAnimations(gltf: {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
}): THREE.Group {
  gltf.scene.animations = gltf.animations
  return gltf.scene
}

function makeGltfLoader(manager?: THREE.LoadingManager): GLTFLoader {
  const loader = new GLTFLoader(manager)
  // Decoder assets are committed under public/draco/ (mirroring public/basis/) and are
  // BASE_URL-relative so they resolve under the app's /flexo/ sub-path deploy.
  const draco = new DRACOLoader(manager)
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
  loader.setDRACOLoader(draco)
  // EXT_meshopt_compression: the decoder is a pure-JS/WASM module with no renderer dependency.
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader
}

/**
 * Parses a dropped/picked model. Pass every file the user gave us: the entry file is chosen
 * automatically and the rest become resolvable siblings for a `.gltf`'s external `.bin` and
 * image URIs. Every blob URL created here is revoked before returning (or throwing) — the
 * loader has fully read them by then, since `parse()` resolves after all dependencies load.
 */
export async function loadModelFile(files: File[]): Promise<LoadedModel> {
  const entry = pickEntryFile(files)
  const bytes = await entry.arrayBuffer()

  if (extensionOf(entry.name) === '.glb') {
    // Self-contained: no sibling resolution, no manager needed.
    const loader = makeGltfLoader()
    const gltf = await loader.parseAsync(bytes, '')
    return {
      scene: withAnimations(gltf),
      fileName: entry.name,
      source: makeSource(gltf.parser, new Map()),
    }
  }

  const { byName, urls, created } = buildSiblings(files.filter((f) => f !== entry))
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    const segment = lastSegment(url)
    return urls.get(segment) ?? urls.get(decodeSafe(segment)) ?? url
  })
  try {
    const loader = makeGltfLoader(manager)
    // Empty resource path: relative URIs stay relative and are rewritten by the modifier above.
    const gltf = await loader.parseAsync(new TextDecoder().decode(bytes), '')
    // The blob URLs die with this function, but the File objects live on in `byName`, which is
    // what the source façade reads image bytes from — see readImageBytes.
    return {
      scene: withAnimations(gltf),
      fileName: entry.name,
      source: makeSource(gltf.parser, byName),
    }
  } finally {
    for (const url of created) URL.revokeObjectURL(url)
  }
}
