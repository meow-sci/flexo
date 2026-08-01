import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { KittenKind, KittenMeshSource } from '../ksa/types';
import {
  HIDDEN_BODY_MATERIALS,
  KITTEN_ATTACHMENTS,
  KITTEN_BODY_GLTF_URL,
  kittenPartSubMeshes,
  type KittenMaterialSpec,
  type KittenPartSubMesh,
} from '../ksa/kittenAssets';
import { toUrl } from '../ksa/catalog';
import { isBcnSupported } from './textureSupport';
import { loadTexture } from './TextureCache';
import { makeFlatMaterial } from './MaterialFactory';
import { applyKsaShaderPatches } from './normalMapPatch';
import { withProgress } from './trackedLoad';

/**
 * Shared kitten-mesh primitives — the gltf loader, CPU bind-pose baking, the
 * per-instance KSA material builder, and the attachment-socket correction — used
 * by BOTH {@link KittenObject} (the editor-only visual aide) and the part-ify
 * pipeline ({@link bakeKittenSubMeshes} → custom SubParts). Keeping these here lets
 * the two share one gltf cache and one bake path.
 */

/**
 * The kitten gltfs reference an embedded "DefaultORM.png" that does not ship with
 * the decompiled assets (and the dev server's SPA fallback would serve index.html
 * for it, breaking the image decode). Redirect any such request to the real, served
 * EmptyAoRoughMetallic.png so GLTFLoader's parse never errors — the meshes that
 * actually matter get their real KSA textures via {@link buildKittenMaterial}.
 */
const PLACEHOLDER_ORM_URL = toUrl('Textures/Characters/EmptyAoRoughMetallic.png');

function makeKittenManager(): THREE.LoadingManager {
  const m = new THREE.LoadingManager();
  m.setURLModifier((url) => (url.endsWith('DefaultORM.png') ? PLACEHOLDER_ORM_URL : url));
  return m;
}

const gltfLoader = new GLTFLoader(makeKittenManager());
const gltfCache = new Map<string, Promise<GLTF>>();

/** Loads (and caches) a kitten gltf with the DefaultORM redirect + load progress. */
export function loadKittenGltf(url: string): Promise<GLTF> {
  let pending = gltfCache.get(url);
  if (!pending) {
    pending = withProgress(url, (onProgress) => gltfLoader.loadAsync(url, onProgress));
    gltfCache.set(url, pending);
  }
  return pending;
}

const D = Math.PI / 180;

/**
 * Local-space orientation correction applied to each attachment before its socket
 * bone's world matrix (post-multiplied: `bone · ATTACHMENT_CORRECTION`). This is
 * KSA's `RotZ(-90)·RotX(-90)` socket correction, reordered to `RotX(-90)·RotZ(-90)`
 * for the glTF-imported, column-major three.js frame (calibrated against the head:
 * it centers the helmet/visor on the head with the visor facing forward, and seats
 * the MMU on the back). If the helmet/backpack ever look mis-oriented, this is the knob.
 */
export const ATTACHMENT_CORRECTION = new THREE.Matrix4()
  .makeRotationX(-90 * D)
  .multiply(new THREE.Matrix4().makeRotationZ(-90 * D));

/**
 * Bakes a mesh's CURRENT posed geometry into a fresh static BufferGeometry, in the
 * world space of its gltf root (kept at identity during baking). For a SkinnedMesh
 * this evaluates the bind pose on the CPU via {@link THREE.SkinnedMesh.getVertexPosition}
 * so the result needs NO runtime GPU skinning — the kitten is a no-animation aide,
 * and baking makes it render identically on every GPU (a 242-bone skeleton that fails
 * to skin would otherwise collapse every mesh to the origin).
 *
 * The gltf's AUTHORED (smooth) normals are preserved and transformed by the mesh's
 * normal matrix — NOT recomputed (the meshes are vertex-split at UV/normal seams, so
 * recomputing yields faceted shading). In the bind pose, CPU skinning is identity, so
 * the world normal is simply `normalMatrix(matrixWorld)·normal`. UVs/index are carried
 * over so the KSA (derivative-tangent) normal maps still work.
 */
export function bakeGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const src = mesh.geometry;
  const posAttr = src.attributes.position as THREE.BufferAttribute;
  const normAttr = src.attributes.normal as THREE.BufferAttribute | undefined;
  const n = posAttr.count;
  const pos = new Float32Array(n * 3);
  const nrm = normAttr ? new Float32Array(n * 3) : null;
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const skinned =
    (mesh as THREE.SkinnedMesh).isSkinnedMesh &&
    typeof (mesh as THREE.SkinnedMesh).getVertexPosition === 'function';
  if (skinned) (mesh as THREE.SkinnedMesh).skeleton.update();
  for (let i = 0; i < n; i++) {
    if (skinned) (mesh as THREE.SkinnedMesh).getVertexPosition(i, v);
    else v.fromBufferAttribute(posAttr, i);
    v.applyMatrix4(mesh.matrixWorld); // → gltf-root space
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
    if (nrm && normAttr) {
      v.fromBufferAttribute(normAttr, i).applyMatrix3(nm).normalize();
      nrm[i * 3] = v.x;
      nrm[i * 3 + 1] = v.y;
      nrm[i * 3 + 2] = v.z;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (src.attributes.uv)
    geo.setAttribute('uv', (src.attributes.uv as THREE.BufferAttribute).clone());
  if (src.index) geo.setIndex(src.index.clone());
  if (nrm) geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  else geo.computeVertexNormals(); // fallback for meshes with no authored normals
  return geo;
}

/**
 * Builds a per-instance PBR material from a KSA texture spec (mirrors KSA's vessel
 * shader). When the spec has no ORM map (eyes/head/labels — KSA uses a constant empty
 * ORM there), the surface is plainly non-metallic. Per-instance (not cached) so the
 * selection-highlight emissive never bleeds.
 */
export async function buildKittenMaterial(
  spec: KittenMaterialSpec,
): Promise<THREE.MeshStandardMaterial> {
  // Flat-color spec (e.g. eye whites): no textures to load.
  if (!spec.diffuseUrl) {
    return new THREE.MeshStandardMaterial({
      color: spec.color ?? 0xffffff,
      metalness: 0,
      roughness: 0.85,
    });
  }
  // Kitten Characters/ atlases are still raw BCn (kept BC7 for verbatim mod
  // bundle-export); without BPTC/RGTC they can't upload, so fall back to flat.
  if (!isBcnSupported()) return makeFlatMaterial();
  const [map, orm, normal] = await Promise.all([
    loadTexture(spec.diffuseUrl, 'srgb'),
    spec.aoRoughMetalUrl ? loadTexture(spec.aoRoughMetalUrl, 'linear') : null,
    spec.normalUrl ? loadTexture(spec.normalUrl, 'linear') : null,
  ]);
  const mat = new THREE.MeshStandardMaterial({ map });
  if (orm) {
    mat.aoMap = orm;
    mat.roughnessMap = orm;
    mat.metalnessMap = orm;
    mat.aoMap.channel = 0; // KSA uses TEXCOORD_0 for all maps
    mat.metalness = 1; // read straight from the map
    mat.roughness = 1;
  } else {
    mat.metalness = 0;
    mat.roughness = 0.85;
  }
  if (normal) {
    mat.normalMap = normal;
    mat.normalMapType = THREE.TangentSpaceNormalMap;
    mat.normalScale.set(1, 1);
  }
  if (spec.transparent) {
    mat.transparent = true;
    mat.depthWrite = false;
    if (spec.tint) {
      const t = spec.tint;
      if (spec.simulateGlass) {
        // Mirror KSA's glass shader (MeshGlassIndirect.frag): glassColor = mix(tint, 0.1, 0.9),
        // opacity hard-coded ~0.75 — a muted/dark preview that matches in-game.
        mat.color.setRGB(glassMuted(t.r), glassMuted(t.g), glassMuted(t.b), THREE.SRGBColorSpace);
        mat.opacity = 0.75;
      } else {
        mat.color.setRGB(t.r / 255, t.g / 255, t.b / 255, THREE.SRGBColorSpace);
        mat.opacity = spec.opacity ?? 0.45;
      }
    } else {
      mat.opacity = spec.opacity ?? 0.45;
    }
  }
  // 'glassGlow' editor approximation: an emissive-uniform glow shown through the translucent shell.
  // (Opaque glow uses the emissive-MAP path via buildGlowingFaceMaterial instead — see customAssetStore.)
  if (spec.glowColor) {
    const g = spec.glowColor;
    mat.emissive.setRGB(g.r / 255, g.g / 255, g.b / 255, THREE.SRGBColorSpace);
    mat.emissiveIntensity = (spec.glowStrength ?? 0.6) * 1.25;
  }
  applyKsaShaderPatches(mat, { normal: !!normal, emissive: false });
  return mat;
}

/** KSA's in-game glass color per channel: mix(tint, 0.1, 0.9) = tint*0.1 + 0.09 (0..1 sRGB approx). */
function glassMuted(c255: number): number {
  return (c255 / 255) * 0.1 + 0.1 * 0.9;
}

/** All meshes under `root`, in traversal order. */
export function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return meshes;
}

/** The first material name of a (possibly multi-material) mesh, or null. */
export function materialName(material: THREE.Material | THREE.Material[]): string | null {
  if (Array.isArray(material)) return material[0]?.name ?? null;
  return material?.name ?? null;
}

// ── part-ify baking ──────────────────────────────────────────────────────────

/** One baked, merged-by-material part-ify submesh. The geometry is body-root space. */
export interface KittenSubMesh {
  specKey: string;
  label: string;
  source: KittenMeshSource;
  /** Baked + merged static geometry (cached, shared by reference — do NOT dispose). */
  geometry: THREE.BufferGeometry;
}

const subMeshCache = new Map<KittenKind, Promise<KittenSubMesh[]>>();

/**
 * Bakes (or returns the cached) part-ify submeshes for a kitten: each
 * {@link KittenPartSubMesh} group's gltf meshes baked to body-root space and merged
 * into one static geometry. Body meshes bake directly; attachments are placed at
 * their socket bone's bind-pose transform (`bone.matrixWorld · ATTACHMENT_CORRECTION`)
 * exactly like {@link KittenObject}. Cached per kind for the app lifetime — the
 * geometry is immutable, so render + atlas + export all share one bake.
 */
export function bakeKittenSubMeshes(kind: KittenKind): Promise<KittenSubMesh[]> {
  let pending = subMeshCache.get(kind);
  if (!pending) {
    pending = bakeUncached(kind);
    subMeshCache.set(kind, pending);
  }
  return pending;
}

async function bakeUncached(kind: KittenKind): Promise<KittenSubMesh[]> {
  const descriptors = kittenPartSubMeshes(kind);
  const byMaterial = new Map<string, KittenPartSubMesh>();
  for (const d of descriptors) for (const name of d.materialNames) byMaterial.set(name, d);

  const groups = new Map<string, THREE.BufferGeometry[]>();
  const add = (specKey: string, geo: THREE.BufferGeometry) => {
    const arr = groups.get(specKey);
    if (arr) arr.push(geo);
    else groups.set(specKey, [geo]);
  };

  // Body: bake each (skinned) mesh in body-root space.
  const bodyGltf = await loadKittenGltf(KITTEN_BODY_GLTF_URL);
  const body = cloneSkeleton(bodyGltf.scene);
  body.updateMatrixWorld(true); // pose the bind-pose skeleton before baking
  for (const mesh of collectMeshes(body)) {
    const name = materialName(mesh.material) ?? '';
    if (HIDDEN_BODY_MATERIALS.has(name)) continue;
    const d = byMaterial.get(name);
    if (d) add(d.specKey, bakeGeometry(mesh));
  }

  // Attachments: bake each at its socket bone's bind-pose world transform.
  for (const att of KITTEN_ATTACHMENTS) {
    const bone = body.getObjectByName(att.socketBone);
    if (!bone) {
      console.warn(`kittenBake: socket bone '${att.socketBone}' not found for ${att.name}`);
      continue;
    }
    const node = cloneSkeleton((await loadKittenGltf(att.gltfUrl)).scene);
    node.updateMatrixWorld(true);
    const M = bone.matrixWorld.clone().multiply(ATTACHMENT_CORRECTION);
    for (const mesh of collectMeshes(node)) {
      const d = byMaterial.get(materialName(mesh.material) ?? '');
      if (!d) continue;
      const geo = bakeGeometry(mesh); // attachment-local space
      geo.applyMatrix4(M); // → body-root space
      add(d.specKey, geo);
    }
  }

  // One merged geometry per descriptor (in descriptor order), dropping empties.
  const result: KittenSubMesh[] = [];
  for (const d of descriptors) {
    const geos = groups.get(d.specKey);
    if (!geos || geos.length === 0) continue;
    let merged: THREE.BufferGeometry | null;
    if (geos.length === 1) {
      merged = geos[0];
    } else {
      merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose(); // sources are copied into `merged`
    }
    if (!merged) {
      console.warn(`kittenBake: failed to merge geometry for '${d.specKey}'`);
      continue;
    }
    result.push({ specKey: d.specKey, label: d.label, source: d.source, geometry: merged });
  }
  return result;
}
