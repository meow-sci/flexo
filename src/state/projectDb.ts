import type { EditingPart, Vec3 } from '../ksa/types';
import type { LayerViewState } from './layerStore';
import type { HistorySnapshot } from './editorStore';
import type { CameraState } from './viewStore';
import type { LineMeasurement } from './measurementStore';
import type { ReferenceContainer } from './containerStore';

/**
 * The `flexo-projects` IndexedDB layer — the storage substrate for v2 projects (design:
 * `plans/flexo_v2/design/design-projects-export.md` §1.1/§1.2, LOCKED #3).
 *
 * Four object stores, all keyed out-of-line by {@link ProjectId}, so one project's four
 * records are addressable without reading any of the others:
 *
 * | store       | value                                                  | written by         |
 * |-------------|--------------------------------------------------------|--------------------|
 * | `meta`      | {@link ProjectMeta} — the whole Project Manager list    | every snapshot save |
 * | `snapshots` | {@link ProjectSnapshot} — every part + view state       | autosave, 300 ms   |
 * | `history`   | {@link ProjectHistoryRecord} — the undo/redo stacks     | autosave, 1500 ms  |
 * | `thumbs`    | `Blob` (image/webp 384×216)                             | thumbnail capture  |
 *
 * The split is what makes the manager cheap: v1 parsed every snapshot (undo history included)
 * to derive four summary fields. Here the list is `getAll('meta')` and nothing else, and the
 * history — usually the bulk of the bytes — is written on its own slower debounce.
 *
 * **This module is a dumb store.** It stamps nothing, derives nothing (except the pure
 * {@link deriveCounts} / {@link newProjectId} helpers) and knows nothing about the live editor:
 * `bytes.snapshot` / `bytes.history` are computed by the WRITER (`projectStore`) at write time
 * and simply stored. No react / three imports; every value is structured-cloneable plain data
 * except the `thumbs` Blob.
 *
 * **Undo enrollment: NONE** — project storage is never a document mutation (design §1.8).
 */

const DB_NAME = 'flexo-projects';
const DB_VERSION = 1;

const STORES = ['meta', 'snapshots', 'history', 'thumbs'] as const;
type StoreName = (typeof STORES)[number];

export type ProjectId = string;

/**
 * Mints a project id: `p_` + 12 random base36 characters (~62 bits). Ids are minted ONCE at
 * create and never derived from the name — that is what makes rename-clobber structurally
 * impossible (design D1).
 */
export function newProjectId(): ProjectId {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = 'p_';
  for (const byte of bytes) out += (byte % 36).toString(36);
  return out;
}

/** The Project Manager's row model — everything the list renders, with no snapshot read. */
export interface ProjectMeta {
  id: ProjectId;
  name: string;
  /** Plain text, ~500-char soft cap (enforced UI-side). Empty when never written. */
  description: string;
  /** One tiny row per part (D6 ids/names + the KSA export id) — meta loads in bulk. */
  parts: Array<{ id: string; name: string; partId: string }>;
  createdAt: number;
  savedAt: number;
  /** `PROJECT_SCHEMA_VERSION` at write time — the boot purge gate (design §1.2). */
  schemaVersion: number;
  /** The AGGREGATE across every part ({@link sumCounts}), not one part's tally. */
  counts: ProjectCounts;
  /** Sizes for the manager's storage readouts; assets is the summed blob length. */
  bytes: { snapshot: number; history: number; assets: number };
  hasThumb: boolean;
}

export interface ProjectCounts {
  subParts: number;
  connectors: number;
  colliders: number;
  seats: number;
  lights: number;
  kittens: number;
  animations: number;
  layers: number;
  customTextures: number;
  customMaterials: number;
  customMeshes: number;
}

/**
 * One saved part: its registry meta, its document, and the per-part view state that travels
 * with it (layers are per-part, so `layerView`/`activeLayerId` live here rather than at
 * snapshot level). Deliberately carries no `counts` — those are derived on load.
 */
export interface SavedPartEntry {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  offset: Vec3;
  includeInExport: boolean;
  part: EditingPart;
  /** Per-layer visibility/lock/listed/opacity/collapsed, keyed by layer id. */
  layerView: Record<string, LayerViewState>;
  /** Layer new items land in (clamped to a live layer on load). */
  activeLayerId: string;
}

/**
 * The snapshot: everything needed to restore a workspace EXCEPT the undo/redo history, which
 * lives in its own record (D4 — so the 300 ms autosave write stays small).
 *
 * `camera`/`measurements`/`containers` stay project-level: they are workspace aids in the
 * shared world frame, not part documents (`plans/MULTI_PART_PLAN.md` §P1.02).
 */
export interface ProjectSnapshot {
  version: number;
  /** Ordered, length ≥ 1. */
  parts: SavedPartEntry[];
  /** Names one of `parts[i].id`. */
  activePartId: string;
  savedAt: number;
  camera?: CameraState;
  measurements?: LineMeasurement[];
  containers?: ReferenceContainer[];
}

/**
 * One part's undo/redo stacks, capped at `editorStore.MAX_UNDO` by `importHistory` on the way
 * back in. Structurally the {@link HistorySnapshot} `exportHistory()` produces — spelled out
 * here so the storage layer's value shapes read on their own.
 */
export interface PersistedPartHistory {
  undo: HistorySnapshot['undo'];
  redo: HistorySnapshot['redo'];
}

/** Every part's stacks, keyed by part entry id — undo is per part (§P1.04). */
export interface ProjectHistoryRecord {
  byPart: Record<string, PersistedPartHistory>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then((db) => db.transaction(store, mode).objectStore(store));
}

function request<T>(
  make: (store: IDBObjectStore) => IDBRequest,
): (store: IDBObjectStore) => Promise<T> {
  return (store) =>
    new Promise<T>((resolve, reject) => {
      const req = make(store);
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
}

// ── meta ─────────────────────────────────────────────────────────────────────

export function putMeta(meta: ProjectMeta): Promise<void> {
  return tx('meta', 'readwrite').then(request<void>((s) => s.put(meta, meta.id)));
}

export function getMeta(id: ProjectId): Promise<ProjectMeta | undefined> {
  return tx('meta', 'readonly').then(request<ProjectMeta | undefined>((s) => s.get(id)));
}

/** Every project's metadata, unordered (callers sort — the index store sorts savedAt desc). */
export function listMeta(): Promise<ProjectMeta[]> {
  return tx('meta', 'readonly').then(request<ProjectMeta[]>((s) => s.getAll()));
}

// ── snapshot / history / thumb ────────────────────────────────────────────────

export function putSnapshot(id: ProjectId, snap: ProjectSnapshot): Promise<void> {
  return tx('snapshots', 'readwrite').then(request<void>((s) => s.put(snap, id)));
}

export function getSnapshot(id: ProjectId): Promise<ProjectSnapshot | undefined> {
  return tx('snapshots', 'readonly').then(request<ProjectSnapshot | undefined>((s) => s.get(id)));
}

export function putHistory(id: ProjectId, history: ProjectHistoryRecord): Promise<void> {
  return tx('history', 'readwrite').then(request<void>((s) => s.put(history, id)));
}

export function getHistory(id: ProjectId): Promise<ProjectHistoryRecord | undefined> {
  return tx('history', 'readonly').then(
    request<ProjectHistoryRecord | undefined>((s) => s.get(id)),
  );
}

export function putThumb(id: ProjectId, blob: Blob): Promise<void> {
  return tx('thumbs', 'readwrite').then(request<void>((s) => s.put(blob, id)));
}

export function getThumb(id: ProjectId): Promise<Blob | undefined> {
  return tx('thumbs', 'readonly').then(request<Blob | undefined>((s) => s.get(id)));
}

/**
 * Deletes a project's four records in ONE transaction, so a crash mid-delete can never leave
 * a snapshot orphaned from its meta row. The project's asset blobs live in the OTHER database
 * and are swept separately by `assetDb.deleteProjectAssets` (design §1.5).
 */
export function deleteProjectRecords(id: ProjectId): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORES as unknown as string[], 'readwrite');
        for (const store of STORES) transaction.objectStore(store).delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

/**
 * Derives a project's {@link ProjectCounts} from its document. Pure — the writer calls it at
 * save time so the manager never has to open a snapshot to render a card.
 */
export function deriveCounts(part: EditingPart): ProjectCounts {
  return {
    subParts: part.placements.length,
    connectors: part.connectors.length,
    colliders: part.colliders.length,
    seats: part.ivaSeats.length,
    lights: part.lights.length,
    kittens: part.kittens.length,
    animations: part.animations.length,
    layers: part.layers.length,
    customTextures: part.customTextures.length,
    customMaterials: part.customMaterials.length,
    customMeshes: part.customMeshes.length,
  };
}

/**
 * The project-wide totals: {@link deriveCounts} per part, added field by field. A meta row's
 * `counts` is this aggregate — one project, N parts, one summary line.
 */
export function sumCounts(parts: readonly EditingPart[]): ProjectCounts {
  const total: ProjectCounts = {
    subParts: 0,
    connectors: 0,
    colliders: 0,
    seats: 0,
    lights: 0,
    kittens: 0,
    animations: 0,
    layers: 0,
    customTextures: 0,
    customMaterials: 0,
    customMeshes: 0,
  };
  for (const part of parts) {
    const counts = deriveCounts(part);
    for (const key of Object.keys(total) as (keyof ProjectCounts)[]) total[key] += counts[key];
  }
  return total;
}
