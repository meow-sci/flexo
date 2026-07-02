import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Test-only access to the licensed KSA "Core" asset tree — the same `KSA_ASSETS_DIR`
 * the {@link import('../../vite/ksaAssets').ksaAssets} plugin serves (the
 * flexo-private-assets repo's `assets/`), injected into tests via vite.config's
 * `test.env`. flexo is open source while the binaries stay private, so real-asset
 * tests gate on {@link hasKsaAssets} and skip cleanly when the private repo is absent.
 */
export const KSA_ASSETS_DIR = process.env.KSA_ASSETS_DIR ?? ''

/** True when the private asset tree is available (real-asset tests run only then). */
export const hasKsaAssets = KSA_ASSETS_DIR !== '' && existsSync(KSA_ASSETS_DIR)

/** Resolves a Core-relative asset path (e.g. `Animations/X_Anim.glb`) under {@link KSA_ASSETS_DIR}. */
export const ksaAsset = (relPath: string): string => join(KSA_ASSETS_DIR, relPath)

/**
 * Directory of vendored, byte-identical copies of a curated subset of Core asset XML,
 * committed to the repo (`src/ksa/__fixtures__/`) so import/parse tests run WITHOUT the
 * private tree above. These MUST stay in sync with the live assets: the "vendored
 * fixtures stay in sync" test in `partCatalog.test.ts` enforces byte-equality whenever
 * {@link hasKsaAssets}, and `bun scripts/sync-test-fixtures.ts` re-copies them. See
 * `src/ksa/__fixtures__/README.md`.
 */
export const VENDORED_ASSETS_DIR = join(import.meta.dirname, '__fixtures__')

/** Resolves a vendored fixture path by file name (e.g. `PartGameData.xml`). Always present. */
export const vendoredAsset = (name: string): string => join(VENDORED_ASSETS_DIR, name)

/**
 * Reads a vendored fixture as UTF-8 text, stripping a leading BOM. KSA ships some files
 * BOM-prefixed (e.g. `PartGameData.xml`); the browser's `fetch` drops it, but `@xmldom`
 * rejects a BOM that precedes the `<?xml?>` declaration.
 */
export const readVendoredAsset = (name: string): string =>
  readFileSync(vendoredAsset(name), 'utf-8').replace(/^\uFEFF/, '')
