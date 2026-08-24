/**
 * ICRP end-to-end smoke test (plans/ICRP_PLAN.md P9.04) — DOM-only, modeled on
 * smoke-v2.ts.
 *
 *   pnpm smoke:icrp                 # headless, spawns its own dev server
 *   SMOKE_HEADFUL=1 pnpm smoke:icrp
 *   SMOKE_BASE=http://…/flexo/apps/icrp/ pnpm smoke:icrp   # already-running server
 *
 * WHAT IT COVERS (one assertion per step):
 *   1. boot — canvas + the toolbar's tool buttons
 *   2. catalog — the Core prefab row and the 10 static pieces appear
 *   3. place — clicking a piece row adds a placement (object inspector count)
 *   4. undo — ⌘Z removes it
 *   5. prefab import — opening the Core pad shows 16 placements
 *   6. array — a radial array of 6 on a selected piece grows the count
 *   7. stock part import — a searched Part explodes into placements on a new layer
 *   8. export — the dialog opens, the Assets preview contains <StaticObject>
 *
 * RUNTIME: vanilla Node 24+ (`node scripts/smoke-icrp.ts`) with the project-local
 * playwright devDependency.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, type Page } from 'playwright'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:5173/flexo/apps/icrp/'
const HEADFUL = process.env.SMOKE_HEADFUL === '1'
const SERVER_TIMEOUT_MS = 90_000

let failures = 0

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

/**
 * The active object's placement count, read from the object inspector heading
 * ("<name> · N placements" — the '·' disambiguates from the library's prefab row,
 * whose text is "16 placements · open as object").
 */
async function placementCount(page: Page): Promise<number> {
  const text = await page.locator('text=/· \\d+ placements/').first().textContent()
  const m = /· (\d+) placements/.exec(text ?? '')
  assert(m !== null, `no placement count found in '${text ?? ''}'`)
  return Number(m[1])
}

async function run(page: Page): Promise<void> {
  await page.goto(BASE)

  await step('boot: canvas + toolbar', async () => {
    await page.waitForSelector('canvas', { timeout: 30_000 })
    for (const name of ['Select', 'Move', 'Rotate', 'Scale', 'Snap', 'Ground lock']) {
      await page.getByRole('button', { name, exact: true }).first().waitFor({ timeout: 15_000 })
    }
  })

  await step('catalog: prefab + pieces load', async () => {
    await page
      .getByRole('button', { name: /CoreLaunchPadA_Prefab_LaunchPadA/ })
      .waitFor({ timeout: 20_000 })
    await page.getByRole('button', { name: /BaseGrassA/ }).waitFor({ timeout: 10_000 })
  })

  await step('place a piece', async () => {
    const before = await placementCount(page)
    await page.getByRole('button', { name: /PadGrateB/ }).click()
    await delay(300)
    assert((await placementCount(page)) === before + 1, 'placement count did not grow')
  })

  await step('undo removes it', async () => {
    const before = await placementCount(page)
    await page.locator('canvas').first().click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await delay(300)
    assert((await placementCount(page)) === before - 1, 'undo did not remove the placement')
  })

  await step('import the Core pad prefab (16 placements)', async () => {
    await page.getByRole('button', { name: /CoreLaunchPadA_Prefab_LaunchPadA/ }).click()
    await delay(1000)
    assert((await placementCount(page)) === 16, 'prefab import did not yield 16 placements')
  })

  await step('radial array grows the count', async () => {
    await page.getByRole('button', { name: /PipeSupportA/ }).click() // adds + selects a seed
    await delay(300)
    const before = await placementCount(page)
    await page.getByRole('button', { name: 'radial', exact: true }).click()
    await page.getByRole('textbox', { name: 'Total count' }).fill('6')
    await page.getByRole('button', { name: 'Apply array' }).click()
    await delay(500)
    assert((await placementCount(page)) === before + 5, 'radial array did not add 5 copies')
  })

  await step('stock part import explodes onto a new layer', async () => {
    const before = await placementCount(page)
    await page.getByRole('searchbox', { name: 'Search stock parts' }).fill('LF1W1HA')
    await delay(300)
    await page.locator('button', { hasText: /LF1W1HA/ }).first().click()
    await delay(1500)
    assert((await placementCount(page)) > before, 'part import added no placements')
    await page.getByRole('button', { name: /Select contents of LF1W1HA/ }).waitFor({
      timeout: 5_000,
    })
  })

  await step('export dialog previews the Assets XML', async () => {
    await page.getByRole('button', { name: 'Export mod…' }).click()
    await page.getByRole('button', { name: /Assets\.xml/ }).click()
    const preview = await page.locator('pre').textContent()
    assert(
      (preview ?? '').includes('<StaticObject Id='),
      'Assets preview lacks a <StaticObject> element',
    )
    await page.keyboard.press('Escape')
  })
}

let server: ChildProcess | null = null
if (!process.env.SMOKE_BASE) {
  server = spawn('pnpm', ['dev:icrp'], { stdio: 'ignore', detached: true })
}

try {
  await waitForServer(BASE)
  const browser = await chromium.launch({ headless: !HEADFUL })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  console.log(`icrp smoke @ ${BASE}`)
  await run(page)
  await browser.close()
} finally {
  if (server?.pid) process.kill(-server.pid, 'SIGTERM')
}

if (failures > 0) {
  console.log(`\n${failures} step(s) FAILED`)
  process.exit(1)
}
console.log('\nall steps passed')
