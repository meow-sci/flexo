/**
 * flexo v2 end-to-end smoke test (P12.18) — the release gate's "does the app actually
 * boot and work" check, deliberately small and deliberately DOM-only.
 *
 *   pnpm smoke                 # headless, spawns its own dev server
 *   SMOKE_HEADFUL=1 pnpm smoke # watch it drive
 *   SMOKE_BASE=http://…/flexo/ pnpm smoke   # drive an already-running server
 *
 * WHAT IT COVERS (one assertion per step, each logged pass/fail):
 *   1. boot — canvas, the eight menubar menus, the status bar's Build mode chip
 *   2. Add ▸ SubPart… — the browser dialog opens over the real KSA catalog and the
 *      first row commits, producing an Outliner entity row
 *   3. undo — ⌘Z removes it again
 *   4. mode cycle — keys 1..5 each move the status-bar mode chip
 *   5. timeline — Animation mode docks the timeline (its transport row)
 *   6. Export to KSA — ⌘E opens it, Escape closes it
 *   7. Projects — ⌘O opens it, Escape closes it
 *   8. parts — ⌘K "New Part" adds one, ⌥1 goes back to it, the palette switches forward
 *
 * WHY DOM-ONLY: screenshots are noise under a live WebGL canvas, so every assertion is
 * a role/name or text query against react-aria's semantics. Accessible names come from
 * the shipped components (`src/ui/shell/MenuBar.tsx`, `src/ui/status/StatusBar.tsx`,
 * `src/ui/build/SubPartBrowserDialog.tsx`, `src/ui/outliner/OutlinerPanel.tsx`,
 * `src/ui/animation/TimelineDock.tsx`, `src/ui/ExportKsaDialog.tsx`,
 * `src/ui/projects/ProjectManagerDialog.tsx`, `src/ui/shell/PartSwitcher.tsx`,
 * `src/ui/palette/CommandPalette.tsx`) — if one is renamed, this fails, which is
 * the point.
 *
 * RUNTIME: vanilla **Node 24+** — `node scripts/smoke-v2.ts`, no transpiler and no
 * flags (type stripping is unflagged since Node 23.6). Hence erasable-syntax-only
 * TypeScript, Node built-ins only, and `.ts` extensions on relative imports. NOT a Bun
 * script. Uses the project-local `playwright` devDependency (never a global install);
 * the browser binary itself may need `pnpm exec playwright install chromium` once.
 *
 * The dev server's base path is `/flexo/` (vite.config.ts `base`), and the About
 * overlay auto-opens modally on a true first run — an init script pre-sets
 * `flexo:aboutSeen` so the smoke never fights it (see `src/state/aboutStore.ts`).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, type Page } from 'playwright'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:5173/flexo/'
const HEADFUL = process.env.SMOKE_HEADFUL === '1'
const SERVER_TIMEOUT_MS = 90_000

let failures = 0

/** Runs one named step, logging `ok`/`FAIL` and swallowing the error so later steps run. */
async function step(name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body()
    console.log(`  ok    ${name}`)
  } catch (err) {
    failures++
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
  }
}

function assert(cond: boolean, message: string): asserts cond {
  if (!cond) throw new Error(message)
}

/** Polls the dev server until it answers, so the run never races the first Vite build. */
async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + SERVER_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not listening yet
    }
    await delay(500)
  }
  throw new Error(`dev server did not answer ${url} within ${SERVER_TIMEOUT_MS / 1000}s`)
}

/** The status bar's mode chip — `aria-label="Editing mode: <Mode>"` (StatusBar.tsx). */
function modeChip(page: Page, mode: string) {
  return page.getByRole('button', { name: `Editing mode: ${mode}` })
}

/** Rows inside the Outliner's entity GridList (`aria-label="Outliner"`). */
function outlinerRows(page: Page) {
  return page.getByRole('grid', { name: 'Outliner' }).getByRole('row')
}

/** The menubar's part chip — `aria-label="Part: <name>"` (PartSwitcher.tsx). */
function partChip(page: Page, name: string) {
  return page.getByRole('button', { name: `Part: ${name}` })
}

/**
 * Runs one command through the ⌘K palette: open it, type a query that ranks the command
 * first (the full title always does — the matcher is a subsequence match), press Enter.
 * The palette's input is `role="combobox"` / `aria-label="Search commands"`.
 */
async function runFromPalette(page: Page, query: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+KeyK')
  const search = page.getByRole('combobox', { name: 'Search commands' })
  await search.waitFor({ timeout: 15_000 })
  await search.fill(query)
  await search.press('Enter')
  await search.waitFor({ state: 'hidden', timeout: 10_000 })
}

async function run(page: Page): Promise<void> {
  await step('boot — canvas, eight menus, Build mode chip', async () => {
    await page.waitForSelector('canvas', { timeout: 30_000 })
    for (const menu of ['File', 'Edit', 'Add', 'Select', 'View', 'Tools', 'Window', 'Help']) {
      await page.getByRole('button', { name: menu, exact: true }).first().waitFor({ timeout: 15_000 })
    }
    await modeChip(page, 'Build').waitFor({ timeout: 15_000 })
  })

  await step('Add ▸ SubPart… — catalog browser opens', async () => {
    await page.getByRole('button', { name: 'Add', exact: true }).first().click()
    await page.getByRole('menuitem', { name: 'SubPart…' }).click()
    await page.getByText('Add SubPart', { exact: true }).first().waitFor({ timeout: 15_000 })
    // The catalog is fetched from the dev server's /ksa/ mount; give it room.
    await page
      .getByRole('grid', { name: 'SubParts' })
      .getByRole('row')
      .first()
      .waitFor({ timeout: 60_000 })
  })

  await step('place a SubPart — one Outliner entity row appears', async () => {
    const before = await outlinerRows(page).count()
    await page.getByRole('grid', { name: 'SubParts' }).getByRole('row').first().click()
    await page.getByRole('button', { name: 'Add & Close' }).click()
    await page.waitForFunction(
      (n) =>
        (document
          .querySelector('[role="grid"][aria-label="Outliner"]')
          ?.querySelectorAll('[role="row"]').length ?? 0) > n,
      before,
      { timeout: 20_000 },
    )
  })

  await step('undo — ⌘Z removes the placement again', async () => {
    const before = await outlinerRows(page).count()
    await page.locator('[data-viewport-cell] canvas').first().click({ position: { x: 20, y: 20 } })
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await page.waitForFunction(
      (n) =>
        (document
          .querySelector('[role="grid"][aria-label="Outliner"]')
          ?.querySelectorAll('[role="row"]').length ?? 0) < n,
      before,
      { timeout: 20_000 },
    )
  })

  await step('mode cycle — keys 1..5 drive the status-bar mode chip', async () => {
    const modes: [string, string][] = [
      ['Digit2', 'Animation'],
      ['Digit3', 'Data'],
      ['Digit4', 'Engine'],
      ['Digit5', 'Surface'],
      ['Digit1', 'Build'],
    ]
    for (const [key, label] of modes) {
      await page.keyboard.press(key)
      await modeChip(page, label).waitFor({ timeout: 10_000 })
    }
  })

  await step('Animation mode — the timeline dock is present', async () => {
    await page.keyboard.press('Digit2')
    await modeChip(page, 'Animation').waitFor({ timeout: 10_000 })
    const timeline = page.getByRole('region', { name: 'Timeline' })
    assert((await timeline.count()) > 0, 'no element with the Timeline accessible name')
    await timeline.first().waitFor({ state: 'visible', timeout: 10_000 })
    await page.keyboard.press('Digit1')
    await modeChip(page, 'Build').waitFor({ timeout: 10_000 })
  })

  await step('Export to KSA — ⌘E opens, Escape closes', async () => {
    await page.keyboard.press('ControlOrMeta+KeyE')
    const title = page.getByText('Export to KSA', { exact: true }).first()
    await title.waitFor({ timeout: 20_000 })
    await page.keyboard.press('Escape')
    await title.waitFor({ state: 'hidden', timeout: 10_000 })
  })

  await step('Projects — ⌘O opens, Escape closes', async () => {
    await page.keyboard.press('ControlOrMeta+KeyO')
    const list = page.getByRole('grid', { name: 'Projects' })
    await list.waitFor({ timeout: 20_000 })
    await page.keyboard.press('Escape')
    await list.waitFor({ state: 'hidden', timeout: 10_000 })
  })

  await step('parts — New Part, ⌥1 back to Part 1, palette switch to Part 2', async () => {
    await partChip(page, 'Part 1').waitFor({ timeout: 15_000 })
    await runFromPalette(page, 'New Part')
    await partChip(page, 'Part 2').waitFor({ timeout: 15_000 })
    // ⌥1 activates registry slot 1. Spelled by physical key: on macOS ⌥1 produces `¡`,
    // and the binding matches the code (`registry.ts`, group "Parts").
    await page.keyboard.press('Alt+Digit1')
    await partChip(page, 'Part 1').waitFor({ timeout: 15_000 })
    // The `parts` provider's row, which only exists once a project holds two parts.
    await runFromPalette(page, 'Switch to part: Part 2')
    await partChip(page, 'Part 2').waitFor({ timeout: 15_000 })
  })
}

async function main(): Promise<void> {
  let server: ChildProcess | null = null
  if (!process.env.SMOKE_BASE) {
    console.log('· starting dev server (pnpm dev)…')
    server = spawn('pnpm', ['dev'], { stdio: 'ignore', detached: true })
  }

  const browser = await chromium.launch({ headless: !HEADFUL })
  try {
    await waitForServer(BASE)
    console.log(`· driving ${BASE}`)
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    page.on('pageerror', (err) => console.log(`        [page error] ${err.message}`))
    // About auto-opens modally on a true first run and would block every later step.
    await page.addInitScript(() => localStorage.setItem('flexo:aboutSeen', 'true'))
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await run(page)
  } finally {
    await browser.close()
    // `detached` puts the dev server in its own process group; kill the group so Vite's
    // own children go with it.
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM')
      } catch {
        server.kill('SIGTERM')
      }
    }
  }

  if (failures > 0) {
    console.log(`\nsmoke FAILED — ${failures} step(s)`)
    process.exit(1)
  }
  console.log('\nsmoke passed')
}

await main()
