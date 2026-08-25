/**
 * Catalog thumbnails for the Library palette (always PNG — webp encodes are an
 * order of magnitude slower). THREE sources, cheapest wins:
 *
 *  1. **Pre-generated** — `thumbs-icrp/manifest.json` + PNGs under the app's public
 *     root, produced at build time by `scripts/generate-icrp-thumbs.ts`
 *     (`pnpm thumbs:icrp`). Zero runtime GPU work; the manifest carries each
 *     entry's content signature so a stale pre-render is skipped, not shown.
 *  2. **IndexedDB cache** — the dev-server answer: the first session renders
 *     live and persists; every later session gets instant thumbs with no build
 *     step. Keyed by the same content signature.
 *  3. **Live render** — flexo's assetThumbs discipline: ONE shared 96 px
 *     renderer, idle-callback queue (with a timeout so a busy viewport can't
 *     starve it), one thumb per tick, resources prefetched in parallel at
 *     request time. Successful renders feed the IndexedDB cache.
 *
 * Geometry/materials come from the SHARED caches (never disposed here); only
 * the per-thumb material clones are.
 */
import * as THREE from 'three';
import { atom } from 'nanostores';
import { getSubPartGeometry } from '../../../../src/three/MeshAtlasCache';
import { applyPlacement } from '../../../../src/three/coords';
import { applyStaticBasis } from './basis';
import { getStaticMaterial, reapplyPatches } from './materials';
import type { PreviewEntry } from './CatalogPreviewViewport';

/** Reactive `entry id → URL` (data: or a pre-generated static path). */
export const $catalogThumbs = atom<Record<string, string>>({});

const THUMB_SIZE = 96;

// --- Source 1: pre-generated manifest (build-time PNGs) ---------------------

/** id → content signature of the pre-rendered PNG. null until probed. */
let manifest: Record<string, string> | null = null;
const manifestReady: Promise<void> = (async () => {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}thumbs-icrp/manifest.json`);
    if (res.ok) manifest = (await res.json()) as Record<string, string>;
  } catch {
    // dev server without pre-generated thumbs — expected
  }
})();

// --- Source 2: IndexedDB session-to-session cache ---------------------------

const IDB_NAME = 'icrp-thumbs';
const IDB_STORE = 'thumbs';

function openThumbDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      // storage unavailable (e.g. LAN-HTTP phone contexts) — render live
      resolve(null);
    }
  });
}
const dbPromise = openThumbDb();

async function idbGet(id: string): Promise<{ sig: string; url: string } | null> {
  const db = await dbPromise;
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve((req.result as { sig: string; url: string }) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(id: string, sig: string, url: string): Promise<void> {
  const db = await dbPromise;
  if (!db) return;
  try {
    db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put({ sig, url }, id);
  } catch {
    // cache write is best-effort
  }
}

interface Job {
  id: string;
  entries: PreviewEntry[];
  sig: string;
}

const queue: Job[] = [];
const requested = new Set<string>();
let renderer: THREE.WebGLRenderer | null = null;
let scheduled = false;

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  const runner = () => {
    scheduled = false;
    void drainOne();
  };
  if ('requestIdleCallback' in window) {
    // The timeout guarantees progress even while the viewport keeps the main
    // thread warm — without it a busy first paint starves the whole queue.
    (
      window as {
        requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void;
      }
    ).requestIdleCallback(runner, { timeout: 150 });
  } else {
    setTimeout(runner, 50);
  }
}

/** The signature the caches key on — re-exported for the generator script. */
export function catalogThumbSignature(entries: readonly PreviewEntry[]): string {
  return entries
    .map(
      (e) =>
        `${e.piece.atlasUrl}#${e.piece.meshNodeName}#${e.piece.diffuseUrl ?? ''}#${
          e.piece.materialId ?? ''
        }`,
    )
    .join('|');
}

/**
 * Queues a thumbnail render (no-op if already rendered, cached, or queued).
 * `force` (the build-time generator) skips the pre-generated/IndexedDB
 * sources so every thumb is a FRESH data-URL render.
 */
export function requestCatalogThumb(id: string, entries: PreviewEntry[], force = false): void {
  if (entries.length === 0) return;
  const sig = catalogThumbSignature(entries);
  if (force) {
    // Fresh render even if the palette already resolved this id from the
    // manifest or IndexedDB (the generator must never re-save a stale source).
    if (queue.some((j) => j.id === id)) return;
    requested.add(id);
    queue.push({ id, entries, sig });
    for (const entry of entries) {
      void getSubPartGeometry(entry.piece.atlasUrl, entry.piece.meshNodeName).catch(() => {});
      void getStaticMaterial(entry.piece).catch(() => {});
    }
    schedule();
    return;
  }
  if (requested.has(id)) return;
  requested.add(id);
  void (async () => {
    // 1. Pre-generated PNG with a matching signature → static URL, no GPU.
    await manifestReady;
    if (manifest?.[id] === sig) {
      $catalogThumbs.set({
        ...$catalogThumbs.get(),
        [id]: `${import.meta.env.BASE_URL}thumbs-icrp/${id}.png`,
      });
      return;
    }
    // 2. IndexedDB hit from an earlier session.
    const cached = await idbGet(id);
    if (cached && cached.sig === sig) {
      $catalogThumbs.set({ ...$catalogThumbs.get(), [id]: cached.url });
      return;
    }
    // 3. Live render. Warm the shared caches in parallel NOW — the drain
    // renders one thumb per idle tick, and it should never be the network's
    // turn when it runs.
    queue.push({ id, entries, sig });
    for (const entry of entries) {
      void getSubPartGeometry(entry.piece.atlasUrl, entry.piece.meshNodeName).catch(() => {});
      void getStaticMaterial(entry.piece).catch(() => {});
    }
    schedule();
  })();
}

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(THUMB_SIZE, THUMB_SIZE);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}

async function drainOne(): Promise<void> {
  const job = queue.shift();
  if (!job) return;
  try {
    const url = await renderThumb(job.entries);
    if (url) {
      $catalogThumbs.set({ ...$catalogThumbs.get(), [job.id]: url });
      void idbPut(job.id, job.sig, url);
    }
  } catch {
    // A failed thumb keeps its glyph placeholder; never retry-loop.
  }
  if (queue.length > 0) schedule();
}

async function renderThumb(entries: PreviewEntry[]): Promise<string | null> {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  applyStaticBasis(root);
  scene.add(root);
  // Flat, bright studio lights — thumbs must read at 60 px, not match the viewport.
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.position.set(200, 300, 150);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x3a3d33, 1.6));

  const clones: THREE.Material[] = [];
  const meshes = await Promise.all(
    entries.map(async (entry) => {
      try {
        const [geometry, shared] = await Promise.all([
          getSubPartGeometry(entry.piece.atlasUrl, entry.piece.meshNodeName),
          getStaticMaterial(entry.piece),
        ]);
        const material = shared.clone();
        reapplyPatches(material);
        clones.push(material);
        const mesh = new THREE.Mesh(geometry, material);
        if (material.transparent) mesh.renderOrder = 1;
        applyPlacement(mesh, entry.transform);
        return mesh;
      } catch {
        return null;
      }
    }),
  );
  for (const mesh of meshes) {
    if (mesh) root.add(mesh);
  }
  if (root.children.length === 0) return null;

  const box = new THREE.Box3().expandByObject(root);
  if (box.isEmpty()) return null;
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const radius = Math.max(sphere.radius, 0.001);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 2000);
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15;
  const dir = new THREE.Vector3(1, 0.55, 1).normalize();
  camera.position.copy(sphere.center).addScaledVector(dir, distance);
  camera.near = Math.max(distance / 100, 0.001);
  camera.far = distance * 100;
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();

  const r = getRenderer();
  r.render(scene, camera);
  const url = r.domElement.toDataURL('image/png');
  for (const m of clones) m.dispose();
  return url;
}
