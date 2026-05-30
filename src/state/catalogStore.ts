import { atom, computed } from 'nanostores'
import { indexCatalog, loadCoreCatalog, type CatalogSubPart } from '../ksa/catalog'

/** The loaded Core SubPart catalog (empty until {@link ensureCatalogLoaded}). */
export const $catalog = atom<CatalogSubPart[]>([])
export const $catalogLoading = atom<boolean>(true)

/**
 * User-created custom SubPart templates (blob-URL backed GLB + KTX2), maintained
 * by src/state/customAssetStore.ts. Kept separate from the Core {@link $catalog}
 * so loading Core never clobbers custom entries and vice-versa; both feed the
 * merged {@link $catalogIndex} the scene resolves placements against.
 */
export const $customCatalog = atom<CatalogSubPart[]>([])

/** id -> entry index over BOTH the Core catalog and custom templates. */
export const $catalogIndex = computed([$catalog, $customCatalog], (core, custom) =>
  indexCatalog([...core, ...custom]),
)

let started = false

/** Loads the catalog once (idempotent). Safe to call from multiple mounts. */
export async function ensureCatalogLoaded(): Promise<void> {
  if (started) return
  started = true
  try {
    const entries = await loadCoreCatalog()
    $catalog.set(entries)
  } catch (err) {
    console.error('flexo: catalog load failed', err)
  } finally {
    $catalogLoading.set(false)
  }
}
