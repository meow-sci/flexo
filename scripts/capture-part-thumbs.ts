/**
 * Captures PNG turntable thumbnails of every built-in KSA Part out of the BUILT
 * part-preview mini app, and patches its `manifest.json` with their URLs.
 *
 *   pnpm build            # must run first — this script renders dist/, never src/
 *   pnpm thumbs:partpreview
 *
 * Output: `dist/apps/partpreview/assets/thumbs/<part_id>_NN.png`, NN = 01..10, plus
 * one animated turntable per part at `assets/gifs/<part_id>.gif` muxed by **ffmpeg**
 * (see ../apps/partpreview/src/thumbsSpec.ts, the shared naming/URL contract).
 *
 * HOW: one headless Chromium, one page (`capture.html`), one WebGL context and one
 * catalog parse for the WHOLE run; per part it is an asset fetch off a localhost
 * static server plus ten small renders read back with `canvas.toDataURL`. The
 * renderer is the app's own `PartPreviewViewport`, so a thumbnail cannot disagree
 * with what the live embed shows. Design + rationale: plans/PART_PREVIEW_THUMBS.md.
 *
 * RUNTIME: vanilla **Node 24+** — `node scripts/capture-part-thumbs.ts`, no
 * transpiler and no flags (type stripping is unflagged since Node 23.6). Hence
 * erasable-syntax-only TypeScript (no enums/namespaces/parameter properties), Node
 * built-ins only, and `.ts` extensions on relative imports. NOT a Bun script — the
 * older scripts here are, this one deliberately is not.
 *
 * REQUIRES `ffmpeg` on PATH for the GIFs (`brew install ffmpeg`,
 * `apt-get install ffmpeg`); `--no-gif` runs the PNG capture without it.
 *
 * FLAGS
 *   --width, --height <px>   canvas size (default DEFAULT_THUMB_SIZE, square)
 *   --view-dir x,y,z         camera direction for angle 0 (default 1,0.6,1)
 *   --rotate x,y,z           rotate the PART itself, XYZ Euler degrees (default 0,0,0)
 *   --site-origin <origin>   origin for the manifest URLs (default meow.science.fail)
 *   --parts a,b,c            capture only these part ids (debugging)
 *   --skip-existing          skip a part whose 10 PNGs are already on disk
 *   --gif-seconds <s>        one full GIF loop, in seconds (default 2)
 *   --no-gif                 skip GIF synthesis entirely (no ffmpeg needed)
 *   --verbose                forward every page console message, not just errors
 */
import { execFile } from 'node:child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { chromium, type ConsoleMessage } from 'playwright'
import {
  type CaptureApi,
  DEFAULT_GIF_SECONDS,
  DEFAULT_SITE_ORIGIN,
  DEFAULT_THUMB_SIZE,
  DEFAULT_PART_ROTATION_DEG,
  DEFAULT_VIEW_DIR,
  EMPTY_PART_ERROR,
  GIFS_DIR,
  ROTATION_PARAM,
  type RotationDeg,
  THUMB_COUNT,
  THUMBS_DIR,
  VIEW_DIR_PARAM,
  type ViewDir,
  formatVec3,
  gifFileName,
  gifUrl,
  parseRotationDeg,
  parseViewDir,
  thumbFileName,
  thumbUrls,
} from '../apps/partpreview/src/thumbsSpec.ts'

declare global {
  interface Window {
    __flexoCapture?: CaptureApi
  }
}

const REPO_ROOT = resolve(import.meta.dirname, '..')
const DIST = join(REPO_ROOT, 'dist')
const APP_DIST = join(DIST, 'apps', 'partpreview')
const MANIFEST = join(APP_DIST, 'manifest.json')
const THUMBS_OUT = join(APP_DIST, ...THUMBS_DIR.split('/'))
const GIFS_OUT = join(APP_DIST, ...GIFS_DIR.split('/'))

/** Production serves `dist/` at this path; the capture server mirrors it exactly. */
const SERVE_BASE = '/flexo/'

/** Per-part budget for load + 10 renders. Generous: software WebGL is slow. */
const PART_TIMEOUT_MS = 60_000

/** Progress line cadence, in parts. */
const PROGRESS_EVERY = 10

const DATA_URL_PREFIX = 'data:image/png;base64,'

/** Budget for one ffmpeg mux; a 250x250 10-frame GIF takes ~50 ms. */
const FFMPEG_TIMEOUT_MS = 30_000

/** Concurrent ffmpeg processes. Each is tiny and short — this just keeps it snappy. */
const FFMPEG_JOBS = Math.max(1, Math.min(4, availableParallelism()))

const execFileAsync = promisify(execFile)

// --- CLI ---------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    width: { type: 'string' },
    height: { type: 'string' },
    'view-dir': { type: 'string' },
    rotate: { type: 'string' },
    'site-origin': { type: 'string' },
    parts: { type: 'string' },
    'skip-existing': { type: 'boolean' },
    'gif-seconds': { type: 'string' },
    // Declared explicitly: this Node's parseArgs has no `--no-x` negation.
    'no-gif': { type: 'boolean' },
    verbose: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(
    [
      'Usage: node scripts/capture-part-thumbs.ts [options]   (run `pnpm build` first)',
      '',
      `  --width <px>            capture width  (default ${DEFAULT_THUMB_SIZE})`,
      `  --height <px>           capture height (default ${DEFAULT_THUMB_SIZE})`,
      `  --view-dir x,y,z        camera direction for angle 0 (default ${formatVec3(DEFAULT_VIEW_DIR)})`,
      `  --rotate x,y,z          rotate the part, XYZ Euler degrees (default ${formatVec3(DEFAULT_PART_ROTATION_DEG)})`,
      `  --site-origin <origin>  manifest URL origin (default ${DEFAULT_SITE_ORIGIN})`,
      '  --parts a,b,c           capture only these part ids',
      '  --skip-existing         skip parts whose PNGs (and GIF) already exist',
      `  --gif-seconds <s>       length of one GIF loop (default ${DEFAULT_GIF_SECONDS})`,
      '  --no-gif                skip GIF synthesis (no ffmpeg needed)',
      '  --verbose               forward all page console output',
    ].join('\n'),
  )
  process.exit(0)
}

/** A positive-integer flag, or a hard error — a bogus size must not silently pass. */
function intFlag(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) die(`--${name} must be a positive integer, got '${raw}'`)
  return n
}

/**
 * An `x,y,z` camera-direction flag. Rejected loudly rather than silently reset:
 * a typo'd direction would otherwise render the whole catalog from the default
 * angle and look like the flag did nothing.
 */
function viewDirFlag(raw: string | undefined): ViewDir {
  if (raw === undefined) return DEFAULT_VIEW_DIR
  const dir = parseViewDir(raw)
  if (!dir) {
    die(
      `--view-dir must be three finite numbers 'x,y,z' with a non-zero horizontal ` +
        `component (the turntable spins about world Y), got '${raw}'`,
    )
  }
  return dir
}

/** An `x,y,z` degrees flag. Any three finite numbers orient the part legally. */
function rotationFlag(raw: string | undefined): RotationDeg {
  if (raw === undefined) return DEFAULT_PART_ROTATION_DEG
  const rot = parseRotationDeg(raw)
  if (!rot) die(`--rotate must be three finite numbers 'x,y,z' in degrees, got '${raw}'`)
  return rot
}

/** A positive (possibly fractional) seconds flag. */
function secondsFlag(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) die(`--${name} must be a positive number, got '${raw}'`)
  return n
}

const width = intFlag('width', values.width, DEFAULT_THUMB_SIZE)
const height = intFlag('height', values.height, DEFAULT_THUMB_SIZE)
const viewDir = viewDirFlag(values['view-dir'])
const partRotation = rotationFlag(values.rotate)
const siteOrigin = values['site-origin'] ?? DEFAULT_SITE_ORIGIN
const skipExisting = values['skip-existing'] === true
const gifSeconds = secondsFlag('gif-seconds', values['gif-seconds'], DEFAULT_GIF_SECONDS)
const makeGifs = values['no-gif'] !== true
const verbose = values.verbose === true

function die(message: string): never {
  console.error(`capture-part-thumbs: ${message}`)
  process.exit(1)
}

/**
 * A fatal condition raised once the browser is up: thrown rather than exited, so
 * the `finally` that closes Chromium and the static server still runs (a
 * `process.exit` would skip it and could orphan the browser on CI). The per-part
 * handler re-throws these instead of counting them as one part's failure.
 */
class FatalError extends Error {}

// --- Static server (dist/ under /flexo/, exactly like production) --------------

const MIME: Record<string, string> = {
  // The two that genuinely matter: a module script served as anything else is
  // refused outright, and streaming wasm compilation needs the wasm type.
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  // .glb / .ktx2 / .hdr are fetched as bytes and don't care.
}

function serveDist(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const rawPath = (req.url ?? '/').split('?')[0] ?? '/'
    let pathname: string
    try {
      pathname = decodeURIComponent(rawPath)
    } catch {
      res.writeHead(400).end('bad path')
      return
    }
    if (!pathname.startsWith(SERVE_BASE)) {
      res.writeHead(404).end('not found')
      return
    }
    // No SPA fallback on purpose: a 404 must read as a 404 here, not as the main
    // editor's index.html (the documented `vite preview` foot-gun).
    const file = resolve(DIST, pathname.slice(SERVE_BASE.length))
    if (file !== DIST && !file.startsWith(DIST + sep)) {
      res.writeHead(403).end('forbidden')
      return
    }
    const stream = createReadStream(file)
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(404)
      res.end('not found')
    })
    stream.on('open', () => {
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
    })
    stream.pipe(res)
  })

  return new Promise((resolveServer) => {
    // Port 0 = whatever is free; 127.0.0.1 keeps it off the network.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolveServer({
        origin: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done) => {
            server.close(() => done())
          }),
      })
    })
  })
}

// --- Helpers -------------------------------------------------------------------

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** True when all THUMB_COUNT PNGs for `partId` are already on disk. */
async function hasCompleteSet(partId: string): Promise<boolean> {
  for (let i = 0; i < THUMB_COUNT; i++) {
    if (!(await exists(join(THUMBS_OUT, thumbFileName(partId, i))))) return false
  }
  return true
}

// --- GIF synthesis (ffmpeg) ----------------------------------------------------

/** Verified BEFORE the capture starts — finding out after 40 s of rendering is rude. */
async function requireFfmpeg(): Promise<void> {
  try {
    await execFileAsync('ffmpeg', ['-version'])
  } catch {
    die(
      'ffmpeg not found on PATH — install it (macOS: `brew install ffmpeg`, ' +
        'Debian/Ubuntu: `sudo apt-get install -y ffmpeg`) or pass --no-gif',
    )
  }
}

/**
 * Muxes one part's PNG frames into a looping GIF of `gifSeconds` total.
 *
 * Two-pass palette (`palettegen` → `paletteuse`) because a 256-color GIF of a dark,
 * subtly shaded render is otherwise banded to death. `stats_mode=full` derives ONE
 * palette from every frame, so colors don't crawl as the turntable spins, and the
 * ordered `bayer` dither keeps inter-frame noise (and file size) down where a
 * diffusion dither would shimmer.
 */
async function synthesizeGif(partId: string): Promise<void> {
  const fps = (THUMB_COUNT / gifSeconds).toFixed(6)
  await withTimeout(
    execFileAsync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      fps,
      '-start_number',
      '1',
      // thumbFileName's zero-padded `_NN` suffix IS this pattern; part ids are
      // [A-Za-z0-9_] so nothing here needs escaping.
      '-i',
      join(THUMBS_OUT, `${partId}_%02d.png`),
      '-filter_complex',
      '[0:v]split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
      // 0 = loop forever.
      '-loop',
      '0',
      join(GIFS_OUT, gifFileName(partId)),
    ]),
    FFMPEG_TIMEOUT_MS,
  )
}

/**
 * GIFs every part that has a complete frame set, FFMPEG_JOBS at a time.
 *
 * Runs off what is on disk rather than off this run's captures, so `--parts` and
 * `--skip-existing` runs still leave every part's GIF consistent with its frames.
 */
async function synthesizeGifs(partIds: string[]): Promise<{ made: number; failed: string[] }> {
  await mkdir(GIFS_OUT, { recursive: true })
  const queue = [...partIds]
  const failed: string[] = []
  let made = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const partId = queue.shift()
      if (partId === undefined) return
      if (skipExisting && (await exists(join(GIFS_OUT, gifFileName(partId))))) continue
      try {
        await synthesizeGif(partId)
        made++
      } catch (err) {
        failed.push(partId)
        console.error(`  GIF FAILED ${partId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  await Promise.all(Array.from({ length: FFMPEG_JOBS }, worker))
  return { made, failed }
}

/** Decodes a `data:image/png;base64,…` payload, rejecting anything else. */
function decodeDataUrl(url: string, label: string): Buffer {
  if (!url.startsWith(DATA_URL_PREFIX)) {
    throw new Error(`${label}: expected a PNG data URL, got '${url.slice(0, 32)}…'`)
  }
  return Buffer.from(url.slice(DATA_URL_PREFIX.length), 'base64')
}

/**
 * Reads a PNG's IHDR dimensions (8-byte signature, then a length + 'IHDR' chunk
 * whose first two uint32s are width and height).
 */
function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error('not a PNG (no IHDR chunk)')
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

/**
 * `promise`, but rejected if it takes longer than `ms`.
 *
 * The timer is ALWAYS cleared: `Promise.race` never cancels its loser, and a
 * still-pending `setTimeout` keeps Node's event loop alive — leaving one per part
 * made the process sit idle for a full timeout after the last capture instead of
 * exiting. `.unref()` would hide it; clearing it is the actual fix.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function formatElapsed(startedAt: number): string {
  return `${((performance.now() - startedAt) / 1000).toFixed(1)}s`
}

// --- Main ----------------------------------------------------------------------

interface Manifest {
  part_ids: string[]
  thumbs?: Record<string, string[]>
  partgifs?: Record<string, string>
  [key: string]: unknown
}

async function main(): Promise<void> {
  // 1. Prerequisites. Everything here is produced by `pnpm build`.
  for (const required of [
    join(APP_DIST, 'capture.html'),
    MANIFEST,
    join(DIST, 'ksa'),
    join(DIST, 'basis'),
  ]) {
    if (!(await exists(required))) {
      die(`missing ${required.replace(REPO_ROOT + sep, '')} — run \`pnpm build\` first`)
    }
  }
  // Checked up front, not after 40 s of rendering.
  if (makeGifs) await requireFfmpeg()

  const manifest = JSON.parse(await readFile(MANIFEST, 'utf-8')) as Manifest
  if (!Array.isArray(manifest.part_ids) || manifest.part_ids.length === 0) {
    die('manifest.json has no part_ids (was KSA_ASSETS_DIR set for the build?)')
  }

  // The manifest IS the definition of "every built-in part" (it comes from the
  // app's own parser), so the capture list is never re-derived from the XML.
  let targets = manifest.part_ids
  if (values.parts) {
    const requested = values.parts.split(',').map((s) => s.trim()).filter(Boolean)
    const known = new Set(manifest.part_ids)
    const unknown = requested.filter((id) => !known.has(id))
    if (unknown.length > 0) die(`unknown part id(s): ${unknown.join(', ')}`)
    targets = requested
  }

  await mkdir(THUMBS_OUT, { recursive: true })

  const startedAt = performance.now()
  const { origin, close } = await serveDist()
  const browser = await chromium.launch({
    headless: true,
    // Software WebGL: newer Chromium refuses SwiftShader for WebGL without this.
    args: ['--enable-unsafe-swiftshader'],
  })

  let captured = 0
  let skipped = 0
  // Unique 404 paths seen by the page. Collected rather than printed inline: the
  // catalog fetches every `<Base>GameData.xml` sibling speculatively and treats a
  // miss as expected (src/ksa/partCatalog.ts loadGameData), so Chromium logs a
  // contentless "Failed to load resource" for a file that is absent BY DESIGN.
  const notFound = new Set<string>()
  const empty: string[] = []
  const failed: string[] = []
  let sizeChecked = false

  try {
    // deviceScaleFactor 1 (Playwright's default) + the viewport's
    // min(dpr, 2) pixel ratio ⇒ the canvas backing store is exactly width x height.
    const page = await browser.newPage({ viewport: { width, height } })
    page.on('pageerror', (err) => console.error(`  [page error] ${err.message}`))
    page.on('response', (res) => {
      if (res.status() !== 404) return
      const path = new URL(res.url()).pathname
      notFound.add(path)
      if (verbose) console.error(`  [404] ${path}`)
    })
    page.on('console', (msg: ConsoleMessage) => {
      // The resource-404 console line carries no URL — the `response` handler
      // above reports the same failure with one, so this would be pure noise.
      if (!verbose && msg.text().startsWith('Failed to load resource')) return
      if (verbose || msg.type() === 'error') console.error(`  [page ${msg.type()}] ${msg.text()}`)
    })

    const url =
      `${origin}${SERVE_BASE}apps/partpreview/capture.html?w=${width}&h=${height}` +
      `&${VIEW_DIR_PARAM}=${encodeURIComponent(formatVec3(viewDir))}` +
      `&${ROTATION_PARAM}=${encodeURIComponent(formatVec3(partRotation))}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => window.__flexoCapture?.ready === true || window.__flexoCapture?.error != null,
      undefined,
      { timeout: 120_000 },
    )
    const bootError = await page.evaluate(() => window.__flexoCapture?.error ?? null)
    if (bootError) throw new FatalError(`capture page failed to boot: ${bootError}`)

    // Guards against a stale dist/ built before a thumbsSpec change.
    const pageCount = await page.evaluate(() => window.__flexoCapture?.count ?? 0)
    if (pageCount !== THUMB_COUNT) {
      throw new FatalError(
        `built capture page renders ${pageCount} angles, this script expects ${THUMB_COUNT} — ` +
          'dist/ is stale, rebuild it (`pnpm build`, or `pnpm exec vite build apps/partpreview` ' +
          'for the mini app alone) and re-run',
      )
    }

    console.log(
      `capturing ${targets.length} part(s) x ${THUMB_COUNT} angles at ${width}x${height}, ` +
        `view dir ${formatVec3(viewDir)}, part rotation ${formatVec3(partRotation)}° …`,
    )

    for (const [i, partId] of targets.entries()) {
      if (skipExisting && (await hasCompleteSet(partId))) {
        skipped++
        continue
      }
      try {
        const urls = await withTimeout(
          page.evaluate((id: string) => window.__flexoCapture!.capturePart(id), partId),
          PART_TIMEOUT_MS,
        )
        if (urls.length !== THUMB_COUNT) {
          throw new Error(`expected ${THUMB_COUNT} images, got ${urls.length}`)
        }
        for (const [angle, dataUrl] of urls.entries()) {
          const png = decodeDataUrl(dataUrl, `${partId}_${angle + 1}`)
          if (!sizeChecked) {
            const size = pngSize(png)
            if (size.width !== width || size.height !== height) {
              throw new FatalError(
                `captured PNG is ${size.width}x${size.height}, expected ${width}x${height} ` +
                  '(device pixel ratio or host sizing is off)',
              )
            }
            sizeChecked = true
          }
          await writeFile(join(THUMBS_OUT, thumbFileName(partId, angle)), png)
        }
        captured++
      } catch (err) {
        if (err instanceof FatalError) throw err
        const message = err instanceof Error ? err.message : String(err)
        // A mesh-less part is data, not a bug: no thumbs, no failure. Anything
        // else is a genuine problem and fails the run (and therefore CI).
        if (message.includes(EMPTY_PART_ERROR)) {
          empty.push(partId)
          console.log(`  no geometry, no thumbs: ${partId}`)
        } else {
          failed.push(partId)
          console.error(`  FAILED ${partId}: ${message}`)
        }
      }
      if ((i + 1) % PROGRESS_EVERY === 0) {
        console.log(`  ${i + 1}/${targets.length} (${formatElapsed(startedAt)})`)
      }
    }
  } finally {
    await browser.close()
    await close()
  }

  // 2. Everything below runs off what is actually ON DISK, so a --parts run (or a
  //    resumed one) keeps whatever an earlier run produced and drops nothing that
  //    still exists.
  const complete: string[] = []
  for (const partId of [...manifest.part_ids].sort((a, b) => a.localeCompare(b))) {
    if (await hasCompleteSet(partId)) complete.push(partId)
  }

  // 3. One animated turntable per part, muxed by ffmpeg.
  let gifsMade = 0
  const gifFailures: string[] = []
  if (makeGifs) {
    const gifStart = performance.now()
    console.log(`synthesizing ${complete.length} GIF(s), ${gifSeconds}s per loop …`)
    const result = await synthesizeGifs(complete)
    gifsMade = result.made
    gifFailures.push(...result.failed)
    console.log(`  ${gifsMade} GIF(s) in ${formatElapsed(gifStart)}`)
  }

  // 4. Patch the manifest: `thumbs` for every complete frame set, `partgifs` for
  //    every GIF that exists (so --no-gif keeps whatever a previous run made).
  const thumbs: Record<string, string[]> = {}
  const partgifs: Record<string, string> = {}
  for (const partId of complete) {
    thumbs[partId] = thumbUrls(siteOrigin, partId)
    if (await exists(join(GIFS_OUT, gifFileName(partId)))) {
      partgifs[partId] = gifUrl(siteOrigin, partId)
    }
  }
  manifest.thumbs = thumbs
  manifest.partgifs = partgifs
  // Same format the previewManifest plugin writes: 2-space pretty + trailing newline.
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)

  // 5. Absent files. An optional GameData sibling is normal; anything else is worth
  //    seeing, though it is not fatal on its own — a part that fails to render is.
  if (notFound.size > 0) {
    const optional: string[] = []
    const unexpected: string[] = []
    for (const path of notFound) {
      ;(path.endsWith('GameData.xml') ? optional : unexpected).push(path)
    }
    if (optional.length > 0) {
      console.log(
        `note: ${optional.length} optional GameData sibling(s) absent, as expected: ` +
          optional.join(', '),
      )
    }
    if (unexpected.length > 0) {
      console.error(`WARNING: ${unexpected.length} request(s) 404'd: ${unexpected.join(', ')}`)
    }
  }

  console.log(
    `done in ${formatElapsed(startedAt)}: ${captured} captured, ${skipped} skipped, ` +
      `${empty.length} without geometry, ${failed.length} failed; manifest: ` +
      `${Object.keys(thumbs).length} thumbs, ${Object.keys(partgifs).length} partgifs ` +
      `(of ${manifest.part_ids.length} parts)`,
  )
  if (failed.length > 0) console.error(`failed part ids: ${failed.join(', ')}`)
  if (gifFailures.length > 0) console.error(`failed GIF ids: ${gifFailures.join(', ')}`)
  if (failed.length > 0 || gifFailures.length > 0) process.exitCode = 1
}

try {
  await main()
} catch (err) {
  die(err instanceof Error ? err.message : String(err))
}
