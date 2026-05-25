import { atom } from 'nanostores'

/**
 * MOD FOLDER GRANT — a single, **global** (project-independent) handle to the
 * user's `Documents/Kitten Space Agency/mods` folder, granted via the File System
 * Access API and persisted across reloads in IndexedDB.
 *
 * The browser lets us store a {@link FileSystemDirectoryHandle} in IndexedDB (it's
 * structured-cloneable) so the grant survives a page reload. The *permission* it
 * carries, however, can lapse (browser restart, revocation, policy) — so on boot
 * we re-query permission without prompting and surface a status the UI can show.
 * Re-acquiring write permission requires a user gesture, hence the explicit
 * "re-grant" action ({@link requestModFolderPermission}).
 *
 * This store is deliberately separate from projectStore: the folder grant is a
 * machine/browser-level capability, not part of any saved project.
 */

const DB_NAME = 'flexo-fs'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'modsDir'

export type ModFolderStatus =
  | 'unsupported' // browser lacks the File System Access API
  | 'none' // no folder chosen yet
  | 'ready' // handle stored and write permission granted
  | 'needs-permission' // handle stored but permission must be re-granted

export interface ModFolderState {
  status: ModFolderStatus
  /** The granted directory's name (for display), when one is stored. */
  name: string | null
}

export const $modFolder = atom<ModFolderState>({
  status: isSupported() ? 'none' : 'unsupported',
  name: null,
})

function isSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

// --- IndexedDB key/value (single store, single key) -------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(key: string): Promise<FileSystemDirectoryHandle | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(key)
        req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined)
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => db.close()
      }),
  )
}

function idbSet(key: string, value: FileSystemDirectoryHandle): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(value, key)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }),
  )
}

function idbDelete(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(key)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }),
  )
}

// --- Permission helpers -----------------------------------------------------

async function queryWritable(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle.queryPermission) return true
  return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
}

async function requestWritable(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle.requestPermission) return true
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

// --- Public API -------------------------------------------------------------

/**
 * Reads any stored handle on boot and reflects its current permission as status.
 * Never prompts (queryPermission is passive) — re-granting needs a user gesture.
 */
export async function initModFolder(): Promise<void> {
  if (!isSupported()) return
  let handle: FileSystemDirectoryHandle | undefined
  try {
    handle = await idbGet(HANDLE_KEY)
  } catch {
    handle = undefined
  }
  if (!handle) {
    $modFolder.set({ status: 'none', name: null })
    return
  }
  const granted = await queryWritable(handle)
  $modFolder.set({ status: granted ? 'ready' : 'needs-permission', name: handle.name })
}

/**
 * Prompts the user to choose their mods folder (a user gesture). Stores the
 * granted handle in IndexedDB. Returns the handle, or null if cancelled.
 */
export async function pickModFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null
  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker({ id: 'flexo-mods', mode: 'readwrite' })
  } catch {
    // User dismissed the picker.
    return null
  }
  await idbSet(HANDLE_KEY, handle)
  $modFolder.set({ status: 'ready', name: handle.name })
  return handle
}

/**
 * Re-requests write permission on the stored handle (a user gesture). Updates
 * status to 'ready' or 'needs-permission'. Returns the handle when granted.
 */
export async function requestModFolderPermission(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet(HANDLE_KEY).catch(() => undefined)
  if (!handle) {
    $modFolder.set({ status: 'none', name: null })
    return null
  }
  const granted = await requestWritable(handle)
  $modFolder.set({ status: granted ? 'ready' : 'needs-permission', name: handle.name })
  return granted ? handle : null
}

/**
 * Returns the stored handle with confirmed write permission, requesting it if
 * needed (call from a user gesture). Returns null when unavailable; updates status.
 */
export async function getWritableModFolder(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet(HANDLE_KEY).catch(() => undefined)
  if (!handle) {
    $modFolder.set({ status: 'none', name: null })
    return null
  }
  let granted = await queryWritable(handle)
  if (!granted) granted = await requestWritable(handle)
  $modFolder.set({ status: granted ? 'ready' : 'needs-permission', name: handle.name })
  return granted ? handle : null
}

/** Forgets the stored folder grant entirely. */
export async function forgetModFolder(): Promise<void> {
  await idbDelete(HANDLE_KEY).catch(() => {})
  $modFolder.set({ status: 'none', name: null })
}
