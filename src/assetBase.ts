/**
 * Base URL for the shared static assets (`ksa/`, `hdr/`, `basis/`).
 *
 * Defaults to the app's own `BASE_URL`. A mini app built under a nested base
 * (e.g. `apps/partpreview/`, see plans/WIKI_PART_PREVIEW_PLAN.md) sets
 * `VITE_ASSET_BASE` to the parent flexo base so every app shares ONE copy of the
 * heavyweight assets instead of duplicating them per build.
 *
 * MUST be called inside a function body, never evaluated at module scope: the
 * catalog parse chain is imported from Node by the previewManifest Vite plugin,
 * where `import.meta.env` does not exist.
 */
export function assetBase(): string {
  return import.meta.env.VITE_ASSET_BASE || import.meta.env.BASE_URL
}
