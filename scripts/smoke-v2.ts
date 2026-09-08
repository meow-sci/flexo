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
 *   9. EngineA3 — a real built-in import shows its combustor and calculated performance
 *  10. RCS — a real built-in import exposes its template controller and editable control map
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
    console.log(`        ${err instanceof Error ? err.message : String(err)}`)
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

  await step('built-in EngineA3 — imported combustor and live performance appear in Engine mode', async () => {
    await page.getByRole('button', { name: 'Add', exact: true }).first().click()
    await page.getByRole('menuitem', { name: 'Built-in Part…' }).click()
    await page.getByRole('searchbox', { name: 'Search Parts' }).fill('CorePropulsionA_Prefab_EngineA3')
    await page.getByRole('grid', { name: 'Parts' }).getByRole('row').filter({ hasText: 'CorePropulsionA_Prefab_EngineA3' }).click()
    await page.getByRole('button', { name: 'Add & Close' }).click()
    await page.getByRole('grid', { name: 'Parts' }).waitFor({ state: 'hidden' })
    await page.keyboard.press('Digit4')
    await modeChip(page, 'Engine').waitFor({ timeout: 10_000 })
    await page.locator('[data-surface="engine-tree"]').getByText('ThrustChamber', { exact: true }).first().waitFor({ timeout: 10_000 })
    await page.getByText('932.6 kN vac · Isp 445.4 s', { exact: true }).first().waitFor({ timeout: 15_000 })
    await page.keyboard.press('Digit1')
    await modeChip(page, 'Build').waitFor({ timeout: 10_000 })
  })

  await step('built-in RCS — template controller and manual control map are editable', async () => {
    await runFromPalette(page, 'New Part')
    await page.getByRole('button', { name: 'Add', exact: true }).first().click()
    await page.getByRole('menuitem', { name: 'Built-in Part…' }).click()
    await page.getByRole('searchbox', { name: 'Search Parts' }).fill('CorePropulsionB_Prefab_RCSALargeA')
    await page.getByRole('grid', { name: 'Parts' }).getByRole('row').filter({ hasText: 'CorePropulsionB_Prefab_RCSALargeA' }).click()
    await page.getByRole('button', { name: 'Add & Close' }).click()
    await page.getByRole('grid', { name: 'Parts' }).waitFor({ state: 'hidden' })
    await page.keyboard.press('Digit4')
    await modeChip(page, 'Engine').waitFor({ timeout: 10_000 })
    const tree = page.locator('[data-surface="engine-tree"]')
    const expand = tree.getByRole('button', { name: 'Expand Controllers', exact: true })
    if (await expand.count()) await expand.click()
    const controller = tree.getByRole('row').filter({ has: page.getByText('RD-4', { exact: true }) })
    await controller.waitFor({ timeout: 10_000 })
    await controller.getByText('[Template]', { exact: true }).waitFor()
    await controller.click()
    const id = page.getByRole('textbox', { name: 'Controller id', exact: true })
    await id.waitFor({ timeout: 10_000 })
    assert(await id.inputValue() === 'RD-4', 'the template controller did not open')
    const manual = page.getByRole('checkbox', { name: 'Manual control map', exact: true })
    assert(!(await manual.isChecked()), 'stock RCS should use automatic geometry mapping')
    await page.getByText('Manual control map', { exact: true }).click()
    assert(await manual.isChecked(), 'manual mapping toggle did not enable')
    const csv = page.getByRole('textbox', { name: 'Control map CSV', exact: true })
    await csv.waitFor()
    assert(await csv.inputValue() === '', 'manual mapping must start with no selected directions')
    await page.getByText('Pitch up', { exact: true }).click()
    await page.getByText('Translate forward', { exact: true }).click()
    assert(await csv.inputValue() === 'PitchUp,TranslateForward', 'direction edits did not update the controller map')
    await page.getByText('Pitch up', { exact: true }).click()
    assert(await csv.inputValue() === 'TranslateForward', 'clearing a direction removed another mapping')
    await tree.getByRole('row', { name: 'Nozzle', exact: true }).click()
    await page.getByText('Override FX placement (plume ≠ thrust)', { exact: true }).click()
    await page.getByText('Override FX location', { exact: true }).click()
    assert(!(await page.getByRole('switch', { name: 'Override FX location', exact: true }).isChecked()), 'FX location override did not clear independently')
    assert(await page.getByRole('switch', { name: 'Override FX direction', exact: true }).isChecked(), 'clearing FX location also cleared FX direction')
    await page.getByText('FX location (m)', { exact: true }).waitFor({ state: 'hidden' })
    await page.getByText('FX direction (any length — visual only)', { exact: true }).waitFor()
    await page.getByText('Override FX placement (plume ≠ thrust)', { exact: true }).click()
    await controller.click()
    assert(await csv.inputValue() === 'TranslateForward', 'the map edit did not survive changing focused modules')
    await page.getByText('Manual control map', { exact: true }).click()
    assert(!(await manual.isChecked()), 'manual mapping toggle did not restore automatic mapping')
    await csv.waitFor({ state: 'hidden' })
    await page.locator('[data-viewport-cell] canvas').first().click({ position: { x: 20, y: 20 } })
    await page.keyboard.press('Digit1')
    await modeChip(page, 'Build').waitFor({ timeout: 10_000 })
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
