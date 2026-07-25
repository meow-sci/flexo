import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
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

/** A parsed model, ready for `analyzeImport`. */
export interface LoadedModel {
  /** The glTF scene root. Node transforms are still on the graph — nothing is baked yet. */
  scene: THREE.Group
  /** The entry file's name, e.g. "rcs_pod.glb" — provenance + the default layer/name prefix. */
  fileName: string
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
function buildSiblingUrls(files: File[]): { urls: Map<string, string>; created: string[] } {
  const urls = new Map<string, string>()
  const created: string[] = []
  for (const file of files) {
    const url = URL.createObjectURL(file)
    created.push(url)
    urls.set(file.name, url)
    urls.set(decodeSafe(file.name), url)
  }
  return { urls, created }
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
    return { scene: withAnimations(gltf), fileName: entry.name }
  }

  const siblings = files.filter((f) => f !== entry)
  const { urls, created } = buildSiblingUrls(siblings)
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    const segment = lastSegment(url)
    return urls.get(segment) ?? urls.get(decodeSafe(segment)) ?? url
  })
  try {
    const loader = makeGltfLoader(manager)
    // Empty resource path: relative URIs stay relative and are rewritten by the modifier above.
    const gltf = await loader.parseAsync(new TextDecoder().decode(bytes), '')
    return { scene: withAnimations(gltf), fileName: entry.name }
  } finally {
    for (const url of created) URL.revokeObjectURL(url)
  }
}
