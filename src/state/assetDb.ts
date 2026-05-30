/**
 * IndexedDB store for custom-asset BINARIES — the source images, encoded .ktx2
 * textures, and generated .glb meshes that back the {@link CustomTexture}/
 * {@link CustomMesh} descriptors in the project document. These are far too large
 * for localStorage (where ProjectSnapshot lives), so only the lightweight
 * descriptors persist there; the bytes persist here, keyed by asset id.
 *
 * A deliberately tiny promise-wrapped key→Blob store (no dependency). Keys are
 * namespaced strings, e.g. `tex-src:<id>`, `tex-ktx2:<id>`, `mesh-glb:<id>`.
 */

const DB_NAME = 'flexo-assets'
const DB_VERSION = 1
const STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE))
}

function toBlob(data: Blob | Uint8Array, type: string): Blob {
  if (data instanceof Blob) return data
  // Copy into a fresh ArrayBuffer so we never persist a view over a larger buffer.
  return new Blob([data.slice()], { type })
}

/** Stores bytes under `key`. Existing value is replaced. */
export function putAsset(key: string, data: Blob | Uint8Array, type = 'application/octet-stream'): Promise<void> {
  return tx('readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.put(toBlob(data, type), key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      }),
  )
}

/** Retrieves the Blob stored under `key`, or undefined if absent. */
export function getAsset(key: string): Promise<Blob | undefined> {
  return tx('readonly').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.get(key)
        req.onsuccess = () => resolve(req.result as Blob | undefined)
        req.onerror = () => reject(req.error)
      }),
  )
}

/** Deletes the value under `key` (no-op if absent). */
export function deleteAsset(key: string): Promise<void> {
  return tx('readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      }),
  )
}

/** Key helpers so callers never hand-format the namespaced keys. */
export const assetKeys = {
  textureSource: (id: string) => `tex-src:${id}`,
  textureKtx2: (id: string) => `tex-ktx2:${id}`,
  meshGlb: (id: string) => `mesh-glb:${id}`,
}
