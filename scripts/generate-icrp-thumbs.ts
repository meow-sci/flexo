/**
 * Build-time ICRP library thumbnail generator (`pnpm thumbs:icrp`).
 *
 * Boots the ICRP dev server (or reuses SMOKE_BASE), forces a FRESH render of
 * every library entry's 96 px PNG thumb through the app's own pipeline
 * (`__icrp.thumbAll`), and writes `public/thumbs-icrp/<id>.png` plus
 * `manifest.json` (id → content signature). The runtime prefers these static
 * files, falls back to its IndexedDB cache, and live-renders as the last
 * resort — so this step is an optimization, never a requirement.
 *
 * The output is rendered from licensed KSA assets: `public/thumbs-icrp/` is
 * gitignored. Run this locally after an asset sync, and in CI (which checks
 * out flexo-private-assets) before the Pages build.
 *
 * RUNTIME: vanilla Node 24+ with the project-local playwright devDependency.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:5173/flexo/apps/icrp/'
const OUT_DIR = join(import.meta.dirname, '..', 'public', 'thumbs-icrp')
const SERVER_TIMEOUT_MS = 90_000
const RENDER_TIMEOUT_MS = 300_000
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

type W = {
  __icrp: {
    thumbAll: () => { id: string; sig: string }[]
    thumbs: () => Record<string, string>
  }
}

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
  // Wait for the catalog to be loaded (library tiles present).
  await page.locator('button[aria-label^="Add "]').first().waitFor({ timeout: 60_000 })
  const wanted = await page.evaluate(() => (window as unknown as W).__icrp.thumbAll())
  console.log(`rendering ${wanted.length} thumbs…`)
  const deadline = Date.now() + RENDER_TIMEOUT_MS
  let done = 0
  while (Date.now() < deadline) {
    done = await page.evaluate(() => Object.keys((window as unknown as W).__icrp.thumbs()).length)
    if (done >= wanted.length) break
    await delay(1000)
  }
  const thumbs = await page.evaluate(() => (window as unknown as W).__icrp.thumbs())
  await browser.close()

  mkdirSync(OUT_DIR, { recursive: true })
  const manifest: Record<string, string> = {}
  let written = 0
  for (const { id, sig } of wanted) {
    const url = thumbs[id]
    if (!url?.startsWith('data:image/png;base64,')) continue
    writeFileSync(join(OUT_DIR, `${id}.png`), Buffer.from(url.slice(22), 'base64'))
    manifest[id] = sig
    written++
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1))
  console.log(`wrote ${written}/${wanted.length} PNGs + manifest.json → ${OUT_DIR}`)
  if (written < wanted.length) {
    console.log(`(${wanted.length - written} entries failed or timed out — they will live-render)`)
  }
} catch (err) {
  failed = true
  console.error(String(err))
} finally {
  if (server?.pid) process.kill(-server.pid, 'SIGTERM')
}
if (failed) process.exit(1)
