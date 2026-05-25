import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { loadEnv, type Plugin } from 'vite'

/**
 * Serves the KSA "Core" mod assets (catalog XML + GLB/GLTF meshes and KTX2/DDS
 * textures) under the `/ksa/` URL prefix, sourced entirely from the directory
 * named by the `KSA_ASSETS_DIR` env var.
 *
 * That directory is produced by `scripts/copy-ksa-assets-to-private-repo.ts`,
 * which already prunes the upstream asset tree down to just the Part/SubPart
 * catalog XML and the binaries those reference. The licensed binaries live in a
 * separate private repo (they must stay out of this open-source repo) and are
 * pulled in at build time. So the plugin no longer needs to know anything about
 * the catalog — it just serves/copies the contents of `KSA_ASSETS_DIR` verbatim.
 *
 * - dev (`configureServer`): streams files on demand from `KSA_ASSETS_DIR`.
 * - build (`writeBundle`): copies the whole `KSA_ASSETS_DIR` tree into `dist/ksa/`.
 *
 * See docs/asset-pipeline.md.
 */

const MIME: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.xml': 'application/xml',
  '.ktx2': 'image/ktx2',
  '.dds': 'image/vnd-ms.dds',
  '.png': 'image/png',
  '.json': 'application/json',
}

export function ksaAssets(): Plugin {
  let root = process.cwd()
  let assetsDir = ''
  // URL prefix the app fetches from, including Vite's `base` (e.g. "/flexo/ksa/").
  let urlPrefix = '/ksa/'
  return {
    name: 'flexo-ksa-assets',
    configResolved(config) {
      root = config.root
      urlPrefix = `${config.base}ksa/`
      // loadEnv with an empty prefix reads unprefixed vars from .env* files and
      // the shell (Vite only exposes VITE_-prefixed vars to import.meta.env).
      const dir = loadEnv(config.mode, config.root, '').KSA_ASSETS_DIR
      if (dir) assetsDir = resolve(config.root, dir)
    },
    // Emit the assets the app fetches at /ksa/* into dist/ksa/ for production.
    writeBundle(options) {
      if (!assetsDir || !existsSync(assetsDir)) {
        this.warn(
          `KSA_ASSETS_DIR is unset or missing (${assetsDir || 'unset'}); no /ksa assets emitted`,
        )
        return
      }
      const outDir = options.dir ?? join(root, 'dist')
      cpSync(assetsDir, join(outDir, 'ksa'), { recursive: true })
    },
    configureServer(server) {
      if (!assetsDir || !existsSync(assetsDir)) {
        server.config.logger.warn(
          `[ksaAssets] KSA_ASSETS_DIR is unset or missing (${assetsDir || 'unset'}); /ksa requests will 404`,
        )
      }
      const baseDir = assetsDir
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith(urlPrefix) || !baseDir) return next()
        // Strip query string and decode, then prevent path traversal.
        const rel = decodeURIComponent(req.url.slice(urlPrefix.length).split('?')[0])
        const abs = normalize(join(baseDir, rel))
        if (abs !== baseDir && !abs.startsWith(baseDir + sep)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }
        try {
          const st = statSync(abs)
          if (!st.isFile()) return next()
          res.setHeader('Content-Type', MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream')
          res.setHeader('Content-Length', st.size)
          createReadStream(abs).pipe(res)
        } catch {
          next()
        }
      })
    },
  }
}
