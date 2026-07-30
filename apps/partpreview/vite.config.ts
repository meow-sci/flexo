/**
 * Standalone mini app: a single-Part 3D preview meant to be framed by the wiki.
 *
 * It is its own Vite app (own root, own bundle) but SHARES the main flexo app's
 * static assets — the KSA catalog tree (`ksa/`), the HDR environments (`hdr/`)
 * and the KTX2 transcoder (`basis/`) are downloaded from the main app's copy in
 * production rather than duplicated here. See plans/WIKI_PART_PREVIEW_PLAN.md
 * (§2.2 for the dev/prod asset matrix, §2.5 structure, §2.7 build wiring).
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { ksaAssets } from '../../vite/ksaAssets'

const repoRoot = resolve(import.meta.dirname, '../..')

export default defineConfig(({ command }) => ({
  // Nested under the main app so one origin serves both.
  base: '/flexo/apps/partpreview/',
  // Vite looks for .env files in `envDir`, not `root`: point it at the repo root
  // so the shared root .env (KSA_ASSETS_DIR) is found from apps/partpreview/.
  envDir: repoRoot,
  // dev: serve the repo's public/ (hdr/, basis/) under this app's base.
  // build: copy NOTHING — the main app already emitted them into dist/.
  publicDir: command === 'serve' ? resolve(repoRoot, 'public') : false,
  define: {
    // At build time the page fetches `ksa/`, `hdr/` and `basis/` from the MAIN
    // app's copy under /flexo/; in dev this app serves them itself under its own
    // base (ksaAssets below + publicDir above). See `assetBase()` in src/assetBase.ts.
    'import.meta.env.VITE_ASSET_BASE':
      command === 'build' ? JSON.stringify('/flexo/') : JSON.stringify('/flexo/apps/partpreview/'),
  },
  build: {
    outDir: resolve(repoRoot, 'dist/apps/partpreview'),
    // Explicit because outDir is outside this app's root: it only empties that
    // subfolder, never dist/ itself.
    emptyOutDir: true,
  },
  plugins: [
    tailwindcss(),
    react(),
    // React Compiler — same setup as the main app's vite.config.ts.
    babel({ presets: [reactCompilerPreset()] }),
    // Dev only: in a build the main app already emitted dist/ksa/, and including
    // the plugin here would duplicate the whole tree into this mini outDir.
    ...(command === 'serve' ? [ksaAssets()] : []),
  ],
  server: {
    host: '0.0.0.0',
  },
}))
