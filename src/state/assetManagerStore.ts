import { persistentJSON } from '@nanostores/persistent';

/**
 * **Asset Manager view preferences** (design:
 * `plans/flexo_v2/design/design-surface-assets.md` §2.1; foundation §10.3, S30).
 *
 * Which category rail row is active, whether the right pane draws cards or rows, and the
 * sort order — the three choices a user re-makes on every open unless they are remembered.
 * They are VIEW state, so they persist to localStorage (repository default per
 * docs/state-persistence.md) and never enter the document or undo history.
 *
 * The search query is deliberately NOT here: it is per-session, and a manager that reopened
 * pre-filtered to a forgotten query would read as an empty library.
 *
 * **Layering (constitution)**: zero react imports.
 */

export type AssetManagerView = 'grid' | 'list';
export type AssetManagerSort = 'name' | 'kind' | 'recent' | 'usage';
/** Rail rows. `unused` is a FILTER over textures + materials, not a kind (§2.5). */
export type AssetCategory = 'all' | 'textures' | 'materials' | 'meshes' | 'imports' | 'unused';

export interface AssetManagerPrefs {
  view: AssetManagerView;
  sort: AssetManagerSort;
  category: AssetCategory;
}

export const $assetManagerPrefs = persistentJSON<AssetManagerPrefs>('flexo:assetManager', {
  view: 'grid',
  sort: 'name',
  category: 'all',
});

/** Patch-merges the prefs (the whole object is one localStorage entry). */
export function setAssetManagerPrefs(patch: Partial<AssetManagerPrefs>): void {
  $assetManagerPrefs.set({ ...$assetManagerPrefs.get(), ...patch });
}
