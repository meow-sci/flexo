import { atom, computed } from 'nanostores';
import { indexPartCatalog, loadCorePartCatalog, type CatalogPart } from '../ksa/partCatalog';

/** The loaded Core Part catalog (empty until {@link ensurePartCatalogLoaded}). */
export const $partCatalog = atom<CatalogPart[]>([]);
export const $partCatalogLoading = atom<boolean>(true);

/** id -> entry index, recomputed when the catalog changes. */
export const $partCatalogIndex = computed($partCatalog, indexPartCatalog);

let started = false;

/** Loads the Part catalog once (idempotent). Safe to call from multiple mounts. */
export async function ensurePartCatalogLoaded(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const entries = await loadCorePartCatalog();
    $partCatalog.set(entries);
  } catch (err) {
    console.error('flexo: part catalog load failed', err);
  } finally {
    $partCatalogLoading.set(false);
  }
}
