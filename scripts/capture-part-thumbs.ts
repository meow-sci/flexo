/**
 * Captures WebP turntable thumbnails of every built-in KSA Part out of the BUILT
 * part-preview mini app, and patches its `manifest.json` with their URLs.
 *
 *   pnpm build            # must run first — this script renders dist/, never src/
 *   pnpm thumbs:partpreview
 *   pnpm thumbs:partpreview:check # one representative part, static frames only
 *
 * Output: `dist/apps/partpreview/assets/thumbs/<part_id>_NN.webp`, NN = 01..18, plus
 * one animated turntable per part at `assets/turntables/<part_id>.webp` muxed by **img2webp**
 * (see ../apps/partpreview/src/thumbsSpec.ts, the shared naming/URL contract).
 *
 * HOW: one headless Chromium runs up to four persistent `capture.html` pages in
 * parallel, each with its own WebGL context and catalog. Each page pulls parts from
 * a shared queue and renders its 18 angles sequentially. The
 * renderer is the app's own `PartPreviewViewport`, so a thumbnail cannot disagree
 * with what the live embed shows. Design + rationale: plans/PART_PREVIEW_THUMBS.md.
 *
 * RUNTIME: vanilla **Node 24+** — `node scripts/capture-part-thumbs.ts`, no
 * transpiler and no flags (type stripping is unflagged since Node 23.6). Hence
 * erasable-syntax-only TypeScript (no enums/namespaces/parameter properties), Node
 * built-ins only, and `.ts` extensions on relative imports. NOT a Bun script — the
 * older scripts here are, this one deliberately is not.
 *
 * REQUIRES `img2webp` on PATH for the turntables (`brew install webp`,
 * `apt-get install webp`); `--no-turntable` runs the static capture without it.
 *
 * FLAGS
 *   --width, --height <px>   WebP size (internally rendered at 2x; default square)
 *   --view-dir x,y,z         camera direction for angle 0 (default 1,0.8,1)
 *   --rotate x,y,z           rotate the PART itself, XYZ Euler degrees (default 0,0,90)
 *   --site-origin <origin>   origin for the manifest URLs (default meow.science.fail)
 *   --parts a,b,c            capture only these part ids (debugging)
 *   --jobs <count>           parallel capture/encoding workers (default min(vCPUs, 4))
 *   --part-timeout <s>       per-part render budget, in seconds (default 300)
 *   --skip-existing          skip a part whose 18 static WebPs are already on disk
 *   --turntable-seconds <s>  one full turntable loop, in seconds (default 4)
 *   --no-turntable           skip animated WebP synthesis (no img2webp needed)
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
  DEFAULT_TURNTABLE_SECONDS,
  DEFAULT_SITE_ORIGIN,
  DEFAULT_THUMB_SIZE,
  DEFAULT_PART_ROTATION_DEG,
  DEFAULT_VIEW_DIR,
  EMPTY_PART_ERROR,
  ROTATION_PARAM,
  type RotationDeg,
  THUMB_COUNT,
  THUMB_PIXEL_RATIO,
  THUMBS_DIR,
  TURNTABLES_DIR,
  VIEW_DIR_PARAM,
  type ViewDir,
  formatVec3,
  turntableFileName,
  turntableUrl,
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
const TURNTABLES_OUT = join(APP_DIST, ...TURNTABLES_DIR.split('/'))

/** Production serves `dist/` at this path; the capture server mirrors it exactly. */
const SERVE_BASE = '/flexo/'

/**
 * Per-part budget for load + 18 renders, in seconds. Deliberately generous: CI has
 * no GPU, so every pixel is drawn by SwiftShader on the runner's four shared vCPUs,
 * and the heaviest parts (the tall CoreServiceModuleA height sets) need minutes of
 * wall clock there while three sibling workers fight for the same cores. Override
 * with `--part-timeout`; the point of the budget is to catch a HANG, not to police
 * a slow host.
 */
const DEFAULT_PART_TIMEOUT_SECONDS = 300

/** Progress line cadence, in parts. */
const PROGRESS_EVERY = 10

const DATA_URL_PREFIX = 'data:image/webp;base64,'

/** Budget for one img2webp mux. */
const TURNTABLE_TIMEOUT_MS = 30_000

/** img2webp's 0..100 lossy quality scale; high fidelity without PNG-like weight. */
const TURNTABLE_WEBP_QUALITY = 92

/** Use every vCPU on the 4-core Pages runner by default without oversubscribing larger hosts. */
const DEFAULT_JOBS = Math.max(1, Math.min(4, availableParallelism()))

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
    jobs: { type: 'string' },
    'part-timeout': { type: 'string' },
    'skip-existing': { type: 'boolean' },
    'turntable-seconds': { type: 'string' },
    // Declared explicitly: this Node's parseArgs has no `--no-x` negation.
    'no-turntable': { type: 'boolean' },
    verbose: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(
    [
      'Usage: node scripts/capture-part-thumbs.ts [options]   (run `pnpm build` first)',
      '',
      `  --width <px>            WebP width, rendered internally at 2x  (default ${DEFAULT_THUMB_SIZE})`,
      `  --height <px>           WebP height, rendered internally at 2x (default ${DEFAULT_THUMB_SIZE})`,
      `  --view-dir x,y,z        camera direction for angle 0 (default ${formatVec3(DEFAULT_VIEW_DIR)})`,
      `  --rotate x,y,z          rotate the part, XYZ Euler degrees (default ${formatVec3(DEFAULT_PART_ROTATION_DEG)})`,
      `  --site-origin <origin>  manifest URL origin (default ${DEFAULT_SITE_ORIGIN})`,
      '  --parts a,b,c           capture only these part ids',
      `  --jobs <count>          parallel capture/encoding workers (default ${DEFAULT_JOBS})`,
      `  --part-timeout <s>      per-part render budget, in seconds (default ${DEFAULT_PART_TIMEOUT_SECONDS})`,
      '  --skip-existing         skip parts whose static and animated WebPs exist',
      `  --turntable-seconds <s> length of one turntable loop (default ${DEFAULT_TURNTABLE_SECONDS})`,
      '  --no-turntable          skip animated WebP synthesis (no img2webp needed)',
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
const jobs = intFlag('jobs', values.jobs, DEFAULT_JOBS)
const partTimeoutMs = Math.round(
  secondsFlag('part-timeout', values['part-timeout'], DEFAULT_PART_TIMEOUT_SECONDS) * 1000,
)
const skipExisting = values['skip-existing'] === true
const turntableSeconds = secondsFlag(
  'turntable-seconds',
  values['turntable-seconds'],
  DEFAULT_TURNTABLE_SECONDS,
)
const makeTurntables = values['no-turntable'] !== true
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
  '.webp': 'image/webp',
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

/** True when all THUMB_COUNT static WebPs for `partId` are already on disk. */
async function hasCompleteSet(partId: string): Promise<boolean> {
  for (let i = 0; i < THUMB_COUNT; i++) {
    if (!(await exists(join(THUMBS_OUT, thumbFileName(partId, i))))) return false
  }
  return true
}

// --- Animated WebP synthesis (img2webp) ---------------------------------------

/** Verified BEFORE the capture starts — finding out after a full render is too late. */
async function requireImg2Webp(): Promise<void> {
  try {
    await execFileAsync('img2webp', ['-version'])
  } catch {
    die(
      'img2webp not found on PATH — install WebP tools (macOS: `brew install webp`, ' +
        'Debian/Ubuntu: `sudo apt-get install -y webp`) or pass --no-turntable',
    )
  }
}

/** Muxes one part's static WebP frames into an infinite-looping animated WebP. */
async function synthesizeTurntable(partId: string): Promise<void> {
  const frameDurationMs = Math.max(1, Math.round((turntableSeconds * 1000) / THUMB_COUNT))
  const args = ['-loop', '0', '-sharp_yuv']
  for (let i = 0; i < THUMB_COUNT; i++) {
    args.push(
      '-d',
      String(frameDurationMs),
      '-lossy',
      '-q',
      String(TURNTABLE_WEBP_QUALITY),
      '-m',
      '6',
      join(THUMBS_OUT, thumbFileName(partId, i)),
    )
  }
  const output = join(TURNTABLES_OUT, turntableFileName(partId))
  args.push('-o', output)
  await withTimeout(execFileAsync('img2webp', args), TURNTABLE_TIMEOUT_MS)
  const info = webpInfo(await readFile(output))
  const expectedDurationMs = frameDurationMs * THUMB_COUNT
  if (
    !info.animated ||
    info.width !== width ||
    info.height !== height ||
    info.frameCount !== THUMB_COUNT ||
    info.loopCount !== 0 ||
    info.durationMs !== expectedDurationMs
  ) {
    throw new Error(
      `invalid animated WebP: ${info.width}x${info.height}, ${info.frameCount} frames, ` +
        `${info.durationMs}ms, loop ${info.loopCount ?? 'missing'}`,
    )
  }
}

/**
 * Animates every part that has a complete frame set, a few independent processes at a time.
 * Runs off disk so filtered and resumed captures stay consistent with prior complete frames.
 */
async function synthesizeTurntables(
  partIds: string[],
): Promise<{ made: number; failed: string[] }> {
  await mkdir(TURNTABLES_OUT, { recursive: true })
  const queue = [...partIds]
  const failed: string[] = []
  let made = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const partId = queue.shift()
      if (partId === undefined) return
      if (skipExisting && (await exists(join(TURNTABLES_OUT, turntableFileName(partId))))) continue
      try {
        await synthesizeTurntable(partId)
        made++
      } catch (err) {
        failed.push(partId)
        console.error(
          `  TURNTABLE FAILED ${partId}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(jobs, partIds.length) }, worker))
  return { made, failed }
}

/** Decodes a `data:image/webp;base64,…` payload, rejecting browser format fallback. */
function decodeDataUrl(url: string, label: string): Buffer {
  if (!url.startsWith(DATA_URL_PREFIX)) {
    throw new Error(`${label}: expected a WebP data URL, got '${url.slice(0, 32)}…'`)
  }
  return Buffer.from(url.slice(DATA_URL_PREFIX.length), 'base64')
}

interface WebpInfo {
  width: number
  height: number
  animated: boolean
  frameCount: number
  loopCount: number | null
  durationMs: number
}

function readUInt24LE(bytes: Buffer, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
}

/** Reads dimensions and animation metadata directly from a RIFF/WebP container. */
function webpInfo(webp: Buffer): WebpInfo {
  if (
    webp.length < 20 ||
    webp.toString('latin1', 0, 4) !== 'RIFF' ||
    webp.toString('latin1', 8, 12) !== 'WEBP'
  ) {
    throw new Error('not a WebP RIFF container')
  }

  let width = 0
  let height = 0
  let animated = false
  let frameCount = 0
  let loopCount: number | null = null
  let durationMs = 0

  for (let offset = 12; offset + 8 <= webp.length; ) {
    const type = webp.toString('latin1', offset, offset + 4)
    const size = webp.readUInt32LE(offset + 4)
    const data = offset + 8
    if (data + size > webp.length) throw new Error(`truncated WebP ${type} chunk`)

    if (type === 'VP8X' && size >= 10) {
      animated = (webp[data]! & 0x02) !== 0
      width = readUInt24LE(webp, data + 4) + 1
      height = readUInt24LE(webp, data + 7) + 1
    } else if (type === 'VP8 ' && size >= 10 && width === 0) {
      width = webp.readUInt16LE(data + 6) & 0x3fff
      height = webp.readUInt16LE(data + 8) & 0x3fff
    } else if (type === 'VP8L' && size >= 5 && width === 0) {
      if (webp[data] !== 0x2f) throw new Error('invalid WebP lossless signature')
      width = 1 + webp[data + 1]! + ((webp[data + 2]! & 0x3f) << 8)
      height = 1 + (webp[data + 2]! >> 6) + (webp[data + 3]! << 2) +
        ((webp[data + 4]! & 0x0f) << 10)
    } else if (type === 'ANIM' && size >= 6) {
      loopCount = webp.readUInt16LE(data + 4)
    } else if (type === 'ANMF' && size >= 16) {
      frameCount++
      durationMs += readUInt24LE(webp, data + 12)
    }

    offset = data + size + (size & 1)
  }

  if (width < 1 || height < 1) throw new Error('WebP has no readable dimensions')
  return { width, height, animated, frameCount, loopCount, durationMs }
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
  turntables?: Record<string, string>
  partgifs?: unknown
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
  if (makeTurntables) await requireImg2Webp()

  const manifest = JSON.parse(await readFile(MANIFEST, 'utf-8')) as Manifest
  if (!Array.isArray(manifest.part_ids) || manifest.part_ids.length === 0) {
    die('manifest.json has no part_ids (was KSA_ASSETS_DIR set for the build?)')
  }

  // The manifest IS the definition of "every built-in part" (it comes from the
  // app's own parser), so the capture list is never re-derived from the XML.
  let targets = manifest.part_ids
  if (values.parts) {
    const requested = [...new Set(values.parts.split(',').map((s) => s.trim()).filter(Boolean))]
    const known = new Set(manifest.part_ids)
    const unknown = requested.filter((id) => !known.has(id))
    if (unknown.length > 0) die(`unknown part id(s): ${unknown.join(', ')}`)
    targets = requested
  }

  await mkdir(THUMBS_OUT, { recursive: true })

  const startedAt = performance.now()

  let captured = 0
  let skipped = 0
  // Unique 404 paths seen by the page. Collected rather than printed inline: the
  // catalog fetches every `<Base>GameData.xml` sibling speculatively and treats a
  // miss as expected (src/ksa/partCatalog.ts loadGameData), so Chromium logs a
  // contentless "Failed to load resource" for a file that is absent BY DESIGN.
  const notFound = new Set<string>()
  const empty: string[] = []
  const failed: string[] = []

  // --skip-existing is resolved BEFORE anything boots. On a warm CI cache every
  // part is already on disk, and launching Chromium to parse the catalog once per
  // worker only to skip all 165 parts costs a minute of runner time for nothing.
  const pending: string[] = []
  for (const partId of targets) {
    if (skipExisting && (await hasCompleteSet(partId))) skipped++
    else pending.push(partId)
  }

  if (pending.length === 0) {
    console.log(`nothing to capture: ${skipped} part(s) already rendered on disk`)
  } else {
    const { origin, close } = await serveDist()
    const browser = await chromium.launch({
      headless: true,
      // Software WebGL: newer Chromium refuses SwiftShader for WebGL without this.
      args: ['--enable-unsafe-swiftshader'],
    })

    try {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: THUMB_PIXEL_RATIO,
      })
      const url =
        `${origin}${SERVE_BASE}apps/partpreview/capture.html?w=${width}&h=${height}` +
        `&${VIEW_DIR_PARAM}=${encodeURIComponent(formatVec3(viewDir))}` +
        `&${ROTATION_PARAM}=${encodeURIComponent(formatVec3(partRotation))}`
      const workerCount = Math.min(jobs, pending.length)
      /**
       * One persistent capture page: its own WebGL context and its own catalog parse,
       * so building another one is expensive. Factored out because the straggler
       * retry below needs a FRESH page — a page whose `capturePart` timed out is
       * still rendering that part, and a second call would interleave with it.
       */
      const newCapturePage = async (workerIndex: number) => {
        // Each persistent page owns one WebGL context and processes one part at a time.
        const page = await context.newPage()
        const workerLabel = `worker ${workerIndex + 1}`
        page.on('pageerror', (err) => console.error(`  [${workerLabel} page error] ${err.message}`))
        page.on('response', (res) => {
          if (res.status() !== 404) return
          const path = new URL(res.url()).pathname
          notFound.add(path)
          if (verbose) console.error(`  [${workerLabel} 404] ${path}`)
        })
        page.on('console', (msg: ConsoleMessage) => {
          // The response handler reports resource failures with a useful URL.
          if (!verbose && msg.text().startsWith('Failed to load resource')) return
          if (verbose || msg.type() === 'error') {
            console.error(`  [${workerLabel} ${msg.type()}] ${msg.text()}`)
          }
        })

        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(
          () => window.__flexoCapture?.ready === true || window.__flexoCapture?.error != null,
          undefined,
          { timeout: 120_000 },
        )
        const bootError = await page.evaluate(() => window.__flexoCapture?.error ?? null)
        if (bootError) throw new FatalError(`${workerLabel} failed to boot: ${bootError}`)

        const backing = await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('#host canvas')
          return {
            devicePixelRatio: window.devicePixelRatio,
            width: canvas?.width ?? 0,
            height: canvas?.height ?? 0,
          }
        })
        const backingWidth = width * THUMB_PIXEL_RATIO
        const backingHeight = height * THUMB_PIXEL_RATIO
        if (
          backing.devicePixelRatio !== THUMB_PIXEL_RATIO ||
          backing.width !== backingWidth ||
          backing.height !== backingHeight
        ) {
          throw new FatalError(
            `${workerLabel} backing buffer is ${backing.width}x${backing.height} at ` +
              `${backing.devicePixelRatio}x, expected ${backingWidth}x${backingHeight} at ` +
              `${THUMB_PIXEL_RATIO}x`,
          )
        }

        const pageCount = await page.evaluate(() => window.__flexoCapture?.count ?? 0)
        if (pageCount !== THUMB_COUNT) {
          throw new FatalError(
            `built capture page renders ${pageCount} angles, this script expects ${THUMB_COUNT} — ` +
              'dist/ is stale, rebuild it (`pnpm build`, or ' +
              '`pnpm exec vite build apps/partpreview` for the mini app alone) and re-run',
          )
        }
        return page
      }
      const pages = await Promise.all(
        Array.from({ length: workerCount }, (_, workerIndex) => newCapturePage(workerIndex)),
      )

      console.log(
        `capturing ${pending.length} part(s)` +
          (skipped > 0 ? ` (${skipped} already on disk)` : '') +
          ` x ${THUMB_COUNT} angles at ${width}x${height}, ` +
          `supersampled from ${width * THUMB_PIXEL_RATIO}x${height * THUMB_PIXEL_RATIO}, ` +
          `${workerCount} worker(s), view dir ${formatVec3(viewDir)}, ` +
          `part rotation ${formatVec3(partRotation)}° …`,
      )

      let queue: string[] = []
      let processed = 0
      let passTotal = 0
      const captureWorker = async (page: (typeof pages)[number]): Promise<void> => {
        let sizeChecked = false
        for (;;) {
          const partId = queue.shift()
          if (partId === undefined) return
          try {
            const urls = await withTimeout(
              page.evaluate((id: string) => window.__flexoCapture!.capturePart(id), partId),
              partTimeoutMs,
            )
            if (urls.length !== THUMB_COUNT) {
              throw new Error(`expected ${THUMB_COUNT} images, got ${urls.length}`)
            }
            for (const [angle, dataUrl] of urls.entries()) {
              const webp = decodeDataUrl(dataUrl, `${partId}_${angle + 1}`)
              if (!sizeChecked) {
                const info = webpInfo(webp)
                if (info.width !== width || info.height !== height || info.animated) {
                  throw new FatalError(
                    `captured static WebP is ${info.width}x${info.height}, ` +
                      `expected ${width}x${height} ` +
                      '(format, device pixel ratio or host sizing is off)',
                  )
                }
                sizeChecked = true
              }
              await writeFile(join(THUMBS_OUT, thumbFileName(partId, angle)), webp)
            }
            captured++
          } catch (err) {
            if (err instanceof FatalError) throw err
            const message = err instanceof Error ? err.message : String(err)
            // A mesh-less part is data, not a bug: no thumbs, no failure.
            if (message.includes(EMPTY_PART_ERROR)) {
              empty.push(partId)
              console.log(`  no geometry, no thumbs: ${partId}`)
            } else {
              failed.push(partId)
              console.error(`  FAILED ${partId}: ${message}`)
            }
          } finally {
            processed++
            if (processed % PROGRESS_EVERY === 0 || processed === passTotal) {
              console.log(`  ${processed}/${passTotal} (${formatElapsed(startedAt)})`)
            }
          }
        }
      }

      /** Drain `ids` through `workerPages`, resetting the shared queue + progress. */
      const runPass = async (ids: string[], workerPages: typeof pages): Promise<void> => {
        queue = [...ids]
        processed = 0
        passTotal = ids.length
        await Promise.all(workerPages.map(captureWorker))
      }

      await runPass(pending, pages)

      // A part that blows its budget on CI usually did so because four SwiftShader
      // workers were fighting over four vCPUs — and a timed-out `capturePart` keeps
      // rendering inside its page, stealing cores from everyone else, so a straggler
      // tends to take its neighbours down with it. Give them one more run alone,
      // uncontended, on a fresh page before failing the build over them.
      if (failed.length > 0 && workerCount > 1) {
        const stragglers = [...failed]
        failed.length = 0
        console.log(
          `retrying ${stragglers.length} failed part(s) alone on a fresh page: ` +
            `${stragglers.join(', ')} …`,
        )
        // The first-pass pages are done; close them so the retry has the host to itself.
        await Promise.all(pages.map((page) => page.close()))
        const retryPage = await newCapturePage(0)
        try {
          await runPass(stragglers, [retryPage])
        } finally {
          await retryPage.close()
        }
      }
    } finally {
      await browser.close()
      await close()
    }
  }

  // 2. Everything below runs off what is actually ON DISK, so a --parts run (or a
  //    resumed one) keeps whatever an earlier run produced and drops nothing that
  //    still exists.
  const complete: string[] = []
  for (const partId of [...manifest.part_ids].sort((a, b) => a.localeCompare(b))) {
    if (await hasCompleteSet(partId)) complete.push(partId)
  }

  // 3. One animated WebP turntable per part, muxed by img2webp.
  let turntablesMade = 0
  const turntableFailures: string[] = []
  if (makeTurntables) {
    const turntableStart = performance.now()
    const turntableWorkerCount = Math.min(jobs, complete.length)
    console.log(
      `synthesizing ${complete.length} animated WebP turntable(s), ` +
        `${turntableSeconds}s per loop, ${turntableWorkerCount} worker(s) …`,
    )
    const result = await synthesizeTurntables(complete)
    turntablesMade = result.made
    turntableFailures.push(...result.failed)
    console.log(`  ${turntablesMade} turntable(s) in ${formatElapsed(turntableStart)}`)
  }

  // 4. Patch the manifest from files that actually exist. Drop the superseded
  //    format-named GIF field rather than leaving stale metadata after a partial rerun.
  const thumbs: Record<string, string[]> = {}
  const turntables: Record<string, string> = {}
  for (const partId of complete) {
    thumbs[partId] = thumbUrls(siteOrigin, partId)
    if (await exists(join(TURNTABLES_OUT, turntableFileName(partId)))) {
      turntables[partId] = turntableUrl(siteOrigin, partId)
    }
  }
  manifest.thumbs = thumbs
  manifest.turntables = turntables
  delete manifest.partgifs
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
      `${Object.keys(thumbs).length} thumbs, ${Object.keys(turntables).length} turntables ` +
      `(of ${manifest.part_ids.length} parts)`,
  )
  if (failed.length > 0) console.error(`failed part ids: ${failed.join(', ')}`)
  if (turntableFailures.length > 0) {
    console.error(`failed turntable ids: ${turntableFailures.join(', ')}`)
  }
  if (failed.length > 0 || turntableFailures.length > 0) process.exitCode = 1
}

try {
  await main()
} catch (err) {
  die(err instanceof Error ? err.message : String(err))
}
