/**
 * IndexedDB store for custom-asset BINARIES — the source images, encoded .ktx2
 * textures, and generated .glb meshes that back the {@link CustomTexture}/
 * {@link CustomMesh} descriptors in the project document. These are far too large
 * to ride inside the project snapshot, so only the lightweight descriptors persist
 * there (in `flexo-projects`); the bytes persist here.
 *
 * A deliberately tiny promise-wrapped key→Blob store (no dependency). Keys are
 * **project-namespaced**: `pa:<projectId>:<kind>:<assetId>` (design:
 * `plans/flexo_v2/design/design-projects-export.md` §1.5 — the single owner of the
 * scheme, D7). The prefix is what makes the three lifecycle operations one range
 * query each: {@link listProjectBlobs}, {@link deleteProjectAssets} (project delete
 * finally reclaims its bytes — the v1 orphan leak) and {@link copyProjectAssets}
 * (Duplicate; asset ids are unchanged because the namespace makes them
 * collision-free, so no descriptor needs rewriting).
 */

const DB_NAME = 'flexo-assets';
const DB_VERSION = 1;
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function toBlob(data: Blob | Uint8Array, type: string): Blob {
  if (data instanceof Blob) return data;
  // Copy into a fresh ArrayBuffer so we never persist a view over a larger buffer.
  return new Blob([data.slice()], { type });
}

/** Stores bytes under `key`. Existing value is replaced. */
export function putAsset(
  key: string,
  data: Blob | Uint8Array,
  type = 'application/octet-stream',
): Promise<void> {
  return tx('readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.put(toBlob(data, type), key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Retrieves the Blob stored under `key`, or undefined if absent. */
export function getAsset(key: string): Promise<Blob | undefined> {
  return tx('readonly').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result as Blob | undefined);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Deletes the value under `key` (no-op if absent). */
export function deleteAsset(key: string): Promise<void> {
  return tx('readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

/** The blob-key prefix for one project. `':'` + 1 is `';'`, which bounds the range. */
function projectPrefix(projectId: string): string {
  return `pa:${projectId}:`;
}

function projectRange(projectId: string): IDBKeyRange {
  return IDBKeyRange.bound(projectPrefix(projectId), `pa:${projectId};`, false, true);
}

/**
 * Key helpers so callers never hand-format the namespaced keys.
 *
 * This is the ONLY place in the tree where a blob-key literal appears, which is what made the
 * v2 project-namespacing a one-module change (audited by plan task P8.26 — the greps to
 * re-run are `tex-src:`, `tex-ktx2:`, `import-glb:`, `emissive-paint:` and `mesh-glb:` over
 * `src/`). Every caller — thumbnails, glow paint, replace-image, the manager's size readouts,
 * import review, the exporter — must route through `assetKeys.*` or a `customAssetStore`
 * helper, and nothing outside this module may open the database.
 *
 * `projectId` is the OWNING project's id (`$currentProjectId` for anything the editor is
 * working on); the asset id stays exactly what the descriptor carries.
 */
export const assetKeys = {
  textureSource: (projectId: string, id: string) => `${projectPrefix(projectId)}tex-src:${id}`,
  textureKtx2: (projectId: string, id: string) => `${projectPrefix(projectId)}tex-ktx2:${id}`,
  meshGlb: (projectId: string, id: string) => `${projectPrefix(projectId)}mesh-glb:${id}`,
  /**
   * The normalized geometry GLB for one import batch (one dropped glTF file), holding one
   * named mesh per imported SubPart. This is the ONLY copy of imported geometry — unlike a
   * primitive (regenerable from its PrimitiveSpec) or a kitten submesh (re-baked from the
   * shipped gltf) it cannot be reconstructed — and it is far too big for the project
   * snapshot, which is precisely the split this store exists for.
   */
  importGlb: (projectId: string, id: string) => `${projectPrefix(projectId)}import-glb:${id}`,
  /** The painted RGBA glow bitmap (PNG) for a mesh's 'painted' emissive shape. */
  emissivePaint: (projectId: string, id: string) =>
    `${projectPrefix(projectId)}emissive-paint:${id}`,
};

/**
 * The five blob tiers, in the order the archive lists them. The literal strings are the
 * middle segment of every key {@link assetKeys} builds — this array and {@link assetKeyFor}
 * keep the archive's `assets/<kind>/<id>` layout spelled from the SAME source as the keys,
 * so a new tier cannot ship half-namespaced.
 */
export const ASSET_KINDS = [
  'tex-src',
  'tex-ktx2',
  'mesh-glb',
  'import-glb',
  'emissive-paint',
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

/** Builds a key from a runtime-chosen kind (the archive import/export path). */
export function assetKeyFor(projectId: string, kind: AssetKind, id: string): string {
  return `${projectPrefix(projectId)}${kind}:${id}`;
}

/** Splits a namespaced key back into its parts, or `null` when it is not one. */
export function parseAssetKey(
  key: string,
): { projectId: string; kind: AssetKind; id: string } | null {
  if (!key.startsWith('pa:')) return null;
  const rest = key.slice(3);
  const projectEnd = rest.indexOf(':');
  if (projectEnd < 0) return null;
  const projectId = rest.slice(0, projectEnd);
  const tail = rest.slice(projectEnd + 1);
  const kindEnd = tail.indexOf(':');
  if (kindEnd < 0) return null;
  const kind = tail.slice(0, kindEnd) as AssetKind;
  if (!ASSET_KINDS.includes(kind)) return null;
  return { projectId, kind, id: tail.slice(kindEnd + 1) };
}

/** Every key stored under this project's prefix. */
export function listProjectBlobs(projectId: string): Promise<string[]> {
  return tx('readonly').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.getAllKeys(projectRange(projectId));
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Deletes every blob belonging to a project — one range sweep (project delete). */
export function deleteProjectAssets(projectId: string): Promise<void> {
  return tx('readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.delete(projectRange(projectId));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

/**
 * Copies every blob from one project's namespace into another's, asset ids unchanged
 * (Duplicate). The namespace is what makes the ids collision-free, so the copied descriptors
 * need no rewrite.
 */
export async function copyProjectAssets(fromId: string, toId: string): Promise<void> {
  const keys = await listProjectBlobs(fromId);
  const fromPrefix = projectPrefix(fromId);
  const toPrefix = projectPrefix(toId);
  for (const key of keys) {
    const blob = await getAsset(key);
    if (blob) await putAsset(toPrefix + key.slice(fromPrefix.length), blob);
  }
}

/**
 * Boot purge: deletes every key that is NOT under a `pa:<id>:` prefix — i.e. every v1
 * un-namespaced blob. Per the constitution these are discarded, never adopted (there is no
 * v1 project left to own them once {@link purgeV1ProjectKeys} has run). Returns how many
 * went, so the caller can tell the user.
 */
export async function purgeUnprefixedAssetKeys(): Promise<number> {
  const keys = await tx('readonly').then(
    (store) =>
      new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
  const stale = keys.filter((key) => typeof key !== 'string' || !key.startsWith('pa:'));
  for (const key of stale) await deleteAsset(key as string);
  return stale.length;
}
