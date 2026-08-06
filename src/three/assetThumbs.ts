import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { atom } from 'nanostores';
import type { CustomMaterial, CustomMesh, EditingPart } from '../ksa/types';
import { meshKind } from '../ksa/types';
import { $part } from '../state/editorStore';
import { buildMaterialPreview, customMeshRenderCache } from '../state/customAssetStore';

/**
 * **The shared offscreen thumbnail renderer** (design:
 * `plans/flexo_v2/design/design-surface-assets.md` §2.1 "Thumbnails").
 *
 * ONE `WebGLRenderer` and ONE PMREM environment for every material preview-sphere and mesh
 * turntable still in the app — the fix for v1's MaterialPreview-per-dialog cost (census pain
 * #4), where a 20-card grid would have meant 20 live WebGL contexts and a browser that
 * silently drops the oldest.
 *
 * **On-demand only** (foundation §14.5): the queue drains on `requestIdleCallback` (falling
 * back to a 50 ms timeout), one thumb per tick. There is no animation loop anywhere in here.
 *
 * **Texture thumbnails do NOT come from this module** — an uploaded texture already has a
 * source-image blob URL (`customAssetStore.$customTextureUrls`) and renders as a plain
 * `<img>`. Only the two kinds that need shading go through the GPU.
 *
 * Cache is SESSION-ONLY and keyed by a content {@link thumbSignature}: a new signature
 * renders a new entry and revokes the URL the old one held.
 */

export type ThumbKind = 'material' | 'mesh';

/** Output size in device-independent pixels. Cards render at 48–96 px; 96 covers 2× too. */
const THUMB_SIZE = 96;

/** Reactive `signature → blob: URL` map. A missing key = "not rendered yet" (show a glyph). */
export const $thumbUrls = atom<Record<string, string>>({});

/**
 * The CONTENT signature of one asset's appearance — pure, so it is unit-testable with no
 * WebGL and no renderer state.
 *
 * A material hashes its resolved channel set (base color/texture, the two scalars or their
 * maps, AO / packed-ORM / normal + strength); a mesh hashes the per-mesh slice of what
 * `customAssetStore.meshSignature` hashes (geometry source, material id, face grid, glow,
 * glass, visor surface) PLUS the assigned material's own signature — a mesh's look changes
 * when its material does.
 *
 * Unknown ids still return a stable string: the caller renders a placeholder and the queue
 * skips it, which is exactly what a mid-delete render should do.
 */
export function thumbSignature(kind: ThumbKind, id: string, part: EditingPart): string {
  if (kind === 'material') {
    const material = part.customMaterials.find((m) => m.id === id);
    return `mat|${id}|${material ? materialSignature(material) : 'missing'}`;
  }
  const mesh = part.customMeshes.find((m) => m.id === id);
  if (!mesh) return `mesh|${id}|missing`;
  const material = mesh.materialId
    ? part.customMaterials.find((m) => m.id === mesh.materialId)
    : undefined;
  return `mesh|${id}|${meshLookSignature(mesh)}|${material ? materialSignature(material) : 'none'}`;
}

function materialSignature(material: CustomMaterial): string {
  return JSON.stringify({
    b: material.baseColor,
    m: material.metalness,
    r: material.roughness,
    o: material.occlusion,
    p: material.ormPacked,
    n: material.normal,
  });
}

function meshLookSignature(mesh: CustomMesh): string {
  return JSON.stringify({
    k: meshKind(mesh),
    p: mesh.primitive,
    kt: mesh.kitten,
    i: mesh.imported ? { i: mesh.imported.importId, n: mesh.imported.meshName } : undefined,
    f: mesh.faceTextures,
    mt: mesh.materialId,
    e: mesh.emissive,
    g: mesh.glass,
    su: mesh.surface,
  });
}

// ── the render queue ─────────────────────────────────────────────────────────

interface Job {
  kind: ThumbKind;
  id: string;
  sig: string;
}

const queued = new Map<string, Job>();
const rendered = new Set<string>();
let draining = false;

/**
 * Enqueues a thumbnail render for `sig`. Cheap and idempotent: an already-rendered or
 * already-queued signature is a no-op, so a card may call this on every render.
 *
 * `part` is read lazily at drain time so a job queued during a burst of edits renders the
 * state the signature describes rather than a stale snapshot.
 */
export function requestThumb(kind: ThumbKind, id: string, sig: string): void {
  if (typeof window === 'undefined') return;
  if (rendered.has(sig) || queued.has(sig)) return;
  queued.set(sig, { kind, id, sig });
  scheduleDrain();
}

function scheduleDrain(): void {
  if (draining) return;
  draining = true;
  const run = () => {
    void drainOne().finally(() => {
      draining = false;
      if (queued.size > 0) scheduleDrain();
    });
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 50);
}

async function drainOne(): Promise<void> {
  const next = queued.values().next();
  if (next.done) return;
  const job = next.value;
  queued.delete(job.sig);
  if (rendered.has(job.sig)) return;
  try {
    const url = await renderThumb(job);
    if (!url) return;
    rendered.add(job.sig);
    publish(job.sig, url);
  } catch (err) {
    console.warn('flexo: thumbnail render failed', err);
  }
}

function publish(sig: string, url: string): void {
  const current = $thumbUrls.get();
  const previous = current[sig];
  if (previous) URL.revokeObjectURL(previous);
  $thumbUrls.set({ ...current, [sig]: url });
}

/**
 * Drops every cached thumbnail and revokes its URL — the project-switch reset. Signatures
 * are content-derived, so a stale entry would otherwise survive a project load intact.
 */
export function clearThumbCache(): void {
  for (const url of Object.values($thumbUrls.get())) URL.revokeObjectURL(url);
  rendered.clear();
  queued.clear();
  $thumbUrls.set({});
}

// ── the single renderer ──────────────────────────────────────────────────────

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  holder: THREE.Group;
  envTarget: THREE.WebGLRenderTarget;
}

let rig: Rig | null = null;

/**
 * Builds the single rig on first use. Lazy on purpose: importing this module must stay free
 * (unit tests exercise {@link thumbSignature} with no WebGL at all), and a project that
 * never opens a card never pays for a context.
 */
function ensureRig(): Rig | null {
  if (rig) return rig;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null; // no WebGL (headless / blocked) — callers fall back to kind glyphs
  }
  renderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.85;

  const scene = new THREE.Scene();
  // Same studio environment the viewport and MaterialDialog use, so a thumbnail reads like
  // the thing it is a thumbnail OF. PMREM is generated once and the generator disposed.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  pmrem.dispose();
  scene.environment = envTarget.texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const holder = new THREE.Group();
  scene.add(holder);

  rig = { renderer, scene, camera, holder, envTarget };
  return rig;
}

async function renderThumb(job: Job): Promise<string | null> {
  const built = job.kind === 'material' ? await buildMaterialThumb(job.id) : buildMeshThumb(job.id);
  if (!built) return null;
  const active = ensureRig();
  if (!active) {
    built.dispose();
    return null;
  }
  active.holder.clear();
  active.holder.add(built.object);
  frame(active, built.object);
  active.renderer.render(active.scene, active.camera);
  const blob = await new Promise<Blob | null>((resolve) =>
    active.renderer.domElement.toBlob(resolve, 'image/png'),
  );
  active.holder.clear();
  built.dispose();
  return blob ? URL.createObjectURL(blob) : null;
}

/** A built preview object plus how to free the parts this module owns. */
interface Built {
  object: THREE.Object3D;
  dispose: () => void;
}

/** The material preview sphere — one shared geometry, the material's own resolved channels. */
async function buildMaterialThumb(id: string): Promise<Built | null> {
  const material = $part.get().customMaterials.find((m) => m.id === id);
  if (!material) return null;
  const built = await buildMaterialPreview(material);
  const geometry = new THREE.SphereGeometry(0.5, 48, 24);
  const mesh = new THREE.Mesh(geometry, built);
  return {
    object: mesh,
    dispose: () => {
      geometry.dispose();
      built.dispose();
    },
  };
}

/**
 * The mesh turntable still: the mesh's OWN cached geometry + materials
 * ({@link customMeshRenderCache} — the exact pair `SubPartObject` renders), on a fixed 3/4
 * angle. Geometry and materials are shared cache entries, so nothing here disposes them; the
 * object is simply detached after the draw.
 */
function buildMeshThumb(id: string): Built | null {
  const subPartId = subPartIdCache.get(id);
  const entry = subPartId ? customMeshRenderCache.get(subPartId) : undefined;
  if (!entry) return null;
  const mesh = new THREE.Mesh(
    entry.geometry,
    entry.materials.length === 1 ? entry.materials[0] : entry.materials,
  );
  const group = new THREE.Group();
  group.add(mesh);
  group.rotation.set(-0.35, 0.7, 0);
  return { object: group, dispose: () => group.clear() };
}

/**
 * `CustomMesh.id → subPartId`, refreshed by the caller through {@link noteMeshSubPartId}.
 * The render cache is keyed by `subPartId` (that is what the scene resolves by) while every
 * UI surface addresses a mesh by its `id`, and this module must not reach into `$part` on the
 * render path — a thumbnail drawn from a document read after the signature was taken would
 * silently disagree with its own cache key.
 */
const subPartIdCache = new Map<string, string>();

/** Records a mesh's `id → subPartId` mapping. Called by {@link requestMeshThumb}. */
function noteMeshSubPartId(meshId: string, subPartId: string): void {
  subPartIdCache.set(meshId, subPartId);
}

/**
 * The mesh-thumb convenience wrapper every card uses: signature + enqueue in one call, with
 * the `id → subPartId` mapping recorded so the render path can find the cache entry.
 * Returns the signature, which is the key into {@link $thumbUrls}.
 */
export function requestMeshThumb(mesh: CustomMesh, part: EditingPart): string {
  const sig = thumbSignature('mesh', mesh.id, part);
  noteMeshSubPartId(mesh.id, mesh.subPartId);
  requestThumb('mesh', mesh.id, sig);
  return sig;
}

/** The material-thumb convenience wrapper. Returns the {@link $thumbUrls} key. */
export function requestMaterialThumb(materialId: string, part: EditingPart): string {
  const sig = thumbSignature('material', materialId, part);
  requestThumb('material', materialId, sig);
  return sig;
}

/** Frames `object` in the camera with a small margin, so every thumb fills its tile. */
function frame(active: Rig, object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    active.camera.position.set(0, 0, 2);
    active.camera.lookAt(0, 0, 0);
    active.camera.updateProjectionMatrix();
    return;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 0.5;
  const distance = (radius * 1.6) / Math.tan((active.camera.fov * Math.PI) / 360);
  active.camera.near = Math.max(distance - radius * 4, 0.001);
  active.camera.far = distance + radius * 8;
  active.camera.position.set(center.x, center.y + radius * 0.15, center.z + distance);
  active.camera.lookAt(center);
  active.camera.updateProjectionMatrix();
}
