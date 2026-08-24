/**
 * Project persistence (plans/ICRP_PLAN.md P3.03, v1): one IndexedDB database
 * (`icrp-projects`) holding the current project snapshot, autosaved on a
 * debounce and hydrated before first render.
 *
 * Constitution: version + purge, never migrate — a snapshot whose
 * `schemaVersion` differs from the running app is DISCARDED (fresh project),
 * with a console notice. Undo history is session-only in v1.
 */
import { ICRP_PROJECT_SCHEMA_VERSION, type IcrpProjectDoc } from './docStore';

const DB_NAME = 'icrp-projects';
const STORE = 'projects';
const CURRENT_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('icrp projectDb: open failed'));
  });
}

export async function saveProjectSnapshot(project: IcrpProjectDoc): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(project, CURRENT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('icrp projectDb: write failed'));
  });
  db.close();
}

export async function loadProjectSnapshot(): Promise<IcrpProjectDoc | null> {
  const db = await openDb();
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(CURRENT_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('icrp projectDb: read failed'));
  });
  db.close();
  if (!value || typeof value !== 'object') return null;
  const project = value as IcrpProjectDoc;
  if (project.schemaVersion !== ICRP_PROJECT_SCHEMA_VERSION) {
    // Purge, never migrate (constitution).
    console.warn(
      `icrp: discarding saved project (schema v${String(project.schemaVersion)} ≠ ` +
        `v${ICRP_PROJECT_SCHEMA_VERSION}).`,
    );
    return null;
  }
  if (!Array.isArray(project.objects) || project.objects.length === 0) return null;
  // Additive fields default-fill (constitution: no migrations, no schema bump).
  project.sites = Array.isArray(project.sites) ? project.sites : [];
  return project;
}
