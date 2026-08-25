/**
 * Build-time ICRP library thumbnail generator (`pnpm thumbs:icrp`) —
 * INCREMENTAL: each thumb records a hash of its actual inputs (the entry's
 * catalog signature + the CONTENT of every asset file it renders — GLB atlas
 * and textures, resolved from the `/ksa/` URLs into `KSA_ASSETS_DIR`), and a
 * rerun only re-renders entries whose inputs changed or whose PNG is missing.
 * Unchanged entries are skipped outright, orphans (entries gone from the
 * catalog) are pruned, so the cost is paid once per asset update.
 *
 * Output under `public/thumbs-icrp/` (gitignored — licensed-asset renders):
 *   <id>.png       one 96 px thumb per library entry
 *   manifest.json  id → runtime catalog signature (what the app checks)
 *   inputs.json    id → input-content hash (what THIS script checks)
 *
 * The runtime prefers these static files, falls back to its IndexedDB cache,
 * and live-renders as the last resort — this step is an optimization, never a
 * requirement.
 *
 * RUNTIME: vanilla Node 24+ with the project-local playwright devDependency.
 * SMOKE_BASE reuses a running dev server; otherwise one is spawned.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const REPO_ROOT = join(import.meta.dirname, '..')
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:5173/flexo/apps/icrp/'
const OUT_DIR = join(REPO_ROOT, 'public', 'thumbs-icrp')
const SERVER_TIMEOUT_MS = 90_000
const RENDER_TIMEOUT_MS = 300_000
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** KSA_ASSETS_DIR the way Vite resolves it: the shell env, then .env files. */
function ksaAssetsDir(): string {
  if (process.env.KSA_ASSETS_DIR) return process.env.KSA_ASSETS_DIR
  for (const file of ['.env.local', '.env']) {
    const p = join(REPO_ROOT, file)
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf-8').match(/^KSA_ASSETS_DIR=(.+)$/m)
    if (m) return m[1].trim()
  }
  return ''
}

/** `…/ksa/<relpath>` URL → content hash of the file it serves (memoized). */
const fileHashes = new Map<string, string>()
function hashAssetUrl(url: string, assetsDir: string): string {
  const cached = fileHashes.get(url)
  if (cached) return cached
  let hash = `unresolved:${url}`
  const marker = '/ksa/'
  const at = url.indexOf(marker)
  if (at >= 0 && assetsDir) {
    const relPath = decodeURIComponent(url.slice(at + marker.length))
    const filePath = join(assetsDir, relPath)
    try {
      hash = createHash('sha1').update(readFileSync(filePath)).digest('hex')
    } catch {
      hash = `missing:${relPath}`
    }
  }
  fileHashes.set(url, hash)
  return hash
}

function readJson(path: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>
  } catch {
    return {}
  }
}

type W = {
  __icrp: {
    thumbInputs: () => { id: string; sig: string; urls: string[] }[]
    thumbRender: (ids: string[]) => number
    thumbs: () => Record<string, string>
  }
}

const assetsDir = ksaAssetsDir()
if (!assetsDir) console.warn('KSA_ASSETS_DIR not found — input hashes fall back to URL identity')

let server: ChildProcess | null = null
if (!process.env.SMOKE_BASE) {
  server = spawn('pnpm', ['dev:icrp'], { stdio: 'ignore', detached: true })
}
let failed = false
try {
  await waitForServer(BASE)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  await page.goto(BASE)
  await page.locator('button[aria-label^="Add "]').first().waitFor({ timeout: 60_000 })

  const inputs = await page.evaluate(() => (window as unknown as W).__icrp.thumbInputs())
  const manifest = readJson(join(OUT_DIR, 'manifest.json'))
  const priorInputs = readJson(join(OUT_DIR, 'inputs.json'))

  // Input hash = catalog signature + the content of every referenced asset file.
  const wanted = inputs.map((e) => ({
    ...e,
    hash: createHash('sha1')
      .update(e.sig)
      .update(e.urls.map((u) => hashAssetUrl(u, assetsDir)).join('|'))
      .digest('hex'),
  }))
  // Stale = inputs changed, or a previously GOOD thumb lost its PNG/sig. An
  // entry that failed last time with the SAME inputs is remembered (it has an
  // inputs.json row but no manifest row) and NOT retried — a known-bad piece
  // must never make every rerun wait out the render timeout.
  const stale = wanted.filter((e) => {
    if (priorInputs[e.id] !== e.hash) return true
    const wasGood = manifest[e.id] !== undefined
    return wasGood && (manifest[e.id] !== e.sig || !existsSync(join(OUT_DIR, `${e.id}.png`)))
  })
  const liveIds = new Set(wanted.map((e) => e.id))
  const orphans = Object.keys(priorInputs).filter((id) => !liveIds.has(id))

  console.log(
    `${wanted.length} entries — ${wanted.length - stale.length} unchanged · ${stale.length} to render · ${orphans.length} orphaned`,
  )

  let written = 0
  if (stale.length > 0) {
    const staleIds = stale.map((e) => e.id)
    await page.evaluate((ids) => (window as unknown as W).__icrp.thumbRender(ids), staleIds)
    const deadline = Date.now() + RENDER_TIMEOUT_MS
    // Fresh renders come back as data: URLs (a manifest/IDB hit never does).
    // Stop early when the queue stalls — a piece that will never render (bad
    // mesh reference) must not hold the rerun for the full timeout.
    const STALL_MS = 20_000
    let fresh: string[] = []
    let lastProgressAt = Date.now()
    while (Date.now() < deadline) {
      const thumbs = await page.evaluate(() => (window as unknown as W).__icrp.thumbs())
      const now = staleIds.filter((id) => thumbs[id]?.startsWith('data:image/png;base64,'))
      if (now.length > fresh.length) lastProgressAt = Date.now()
      fresh = now
      if (fresh.length >= staleIds.length) break
      if (Date.now() - lastProgressAt > STALL_MS) {
        console.log(`render queue stalled ${STALL_MS / 1000}s — giving up on the rest`)
        break
      }
      await delay(1000)
    }
    const thumbs = await page.evaluate(() => (window as unknown as W).__icrp.thumbs())
    mkdirSync(OUT_DIR, { recursive: true })
    for (const e of stale) {
      const url = thumbs[e.id]
      if (!url?.startsWith('data:image/png;base64,')) continue
      writeFileSync(join(OUT_DIR, `${e.id}.png`), Buffer.from(url.slice(22), 'base64'))
      written++
    }
  }
  await browser.close()

  // Merge manifests over what actually exists on disk, then prune orphans.
  mkdirSync(OUT_DIR, { recursive: true })
  const nextManifest: Record<string, string> = {}
  const nextInputs: Record<string, string> = {}
  const failedIds: string[] = []
  for (const e of wanted) {
    // inputs.json records EVERY entry (failures included, so an unchanged
    // failure is skipped next run); manifest.json only what's on disk.
    nextInputs[e.id] = e.hash
    if (existsSync(join(OUT_DIR, `${e.id}.png`))) nextManifest[e.id] = e.sig
    else failedIds.push(e.id)
  }
  for (const file of readdirSync(OUT_DIR)) {
    if (!file.endsWith('.png')) continue
    if (!liveIds.has(file.slice(0, -4))) rmSync(join(OUT_DIR, file))
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(nextManifest, null, 1))
  writeFileSync(join(OUT_DIR, 'inputs.json'), JSON.stringify(nextInputs, null, 1))

  console.log(
    `rendered ${written} · total on disk ${Object.keys(nextManifest).length}/${wanted.length}`,
  )
  if (failedIds.length > 0) {
    console.log(
      `no thumb (skipped until their inputs change; they live-render in the app):\n  ${failedIds.join('\n  ')}`,
    )
  }
} catch (err) {
  failed = true
  console.error(String(err))
} finally {
  if (server?.pid) process.kill(-server.pid, 'SIGTERM')
}
if (failed) process.exit(1)

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + SERVER_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await delay(500)
  }
  throw new Error(`dev server did not answer at ${url} within ${SERVER_TIMEOUT_MS}ms`)
}
