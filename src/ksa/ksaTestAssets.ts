import { existsSync } from 'node:fs'
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
