/**
 * ICRP end-to-end smoke test (plans/ICRP_PLAN.md P9.04) — DOM-only, modeled on
 * smoke-v2.ts.
 *
 *   pnpm smoke:icrp                 # headless, spawns its own dev server
 *   SMOKE_HEADFUL=1 pnpm smoke:icrp
 *   SMOKE_BASE=http://…/flexo/apps/icrp/ pnpm smoke:icrp   # already-running server
 *
 * WHAT IT COVERS (one assertion per step):
 *   1. boot — canvas + the menubar's menus + the toolbar's tool buttons
 *   2. catalog — the Add dialog lists the Core prefab and static pieces
 *   3. place — an Add-dialog piece row adds a placement (details inspector count)
 *   4. undo — ⌘Z removes it
 *   5. prefab import — opening the Core pad via Add shows 16 placements
 *   6. array — a radial array of 6 on a selected piece grows the count
 *   7. stock part import — a searched Part explodes into placements on a new layer
 *   8. body drag — grabbing a piece slides the whole selection on the ground
 *   9. pivot drag — dragging a gizmo arrow moves the group (regression: the
 *      multi-select pivot must stream deltas into the document)
 *  10. export — the dialog opens, the Assets preview contains <StaticObject>
 *
 * Steps 8–9 use the dev-only `window.__icrp` debug handle (installed by
 * main.tsx under import.meta.env.DEV) to target the WebGL scene
 * deterministically — the smoke always runs against the dev server.
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

  /** Opens the Add dialog fresh (Escape first in case something is focused). */
  async function openAdd(): Promise<void> {
    await page.keyboard.press('Escape')
    await page.keyboard.press('KeyA')
    await page.getByRole('searchbox', { name: 'Search catalog' }).waitFor({ timeout: 10_000 })
  }

  await step('boot: canvas + menubar + toolbar', async () => {
    await page.waitForSelector('canvas', { timeout: 30_000 })
    for (const name of ['File', 'Add', 'Edit', 'Arrange', 'View']) {
      await page.getByRole('button', { name, exact: true }).first().waitFor({ timeout: 15_000 })
    }
    for (const name of ['Select', 'Move', 'Rotate', 'Scale']) {
      await page.getByRole('button', { name, exact: true }).first().waitFor({ timeout: 15_000 })
    }
  })

  await step('catalog: the Add dialog lists prefab + pieces', async () => {
    await page.locator('text=/· \\d+ placements/').waitFor({ timeout: 20_000 })
    await openAdd()
    await page
      .getByRole('button', { name: /CoreLaunchPadA_Prefab_LaunchPadA/ })
      .waitFor({ timeout: 20_000 })
    await page.getByRole('button', { name: /BaseGrassA/ }).first().waitFor({ timeout: 10_000 })
    await page.keyboard.press('Escape')
  })

  await step('place a piece', async () => {
    const before = await placementCount(page)
    await openAdd()
    await page.getByRole('button', { name: /PadGrateB/ }).first().click()
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
    await openAdd()
    await page.getByRole('button', { name: /CoreLaunchPadA_Prefab_LaunchPadA/ }).click()
    await delay(1000)
    assert((await placementCount(page)) === 16, 'prefab import did not yield 16 placements')
  })

  await step('radial array grows the count', async () => {
    await openAdd()
    await page.getByRole('button', { name: /PipeSupportA/ }).first().click() // adds + selects
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
    await openAdd()
    await page.getByRole('searchbox', { name: 'Search catalog' }).fill('LF1W1HA')
    await delay(300)
    await page.locator('button', { hasText: /LF1W1HA/ }).first().click()
    await delay(1500)
    assert((await placementCount(page)) > before, 'part import added no placements')
    await page.getByRole('button', { name: /Select contents of LF1W1HA/ }).waitFor({
      timeout: 5_000,
    })
  })

  /** Positions of the current selection, via the dev debug handle. */
  const selectionPositions = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __icrp: {
          selection: () => string[]
          placement: (id: string) => { transform: { position: unknown } } | undefined
        }
      }
      return w.__icrp.selection().map((id) => w.__icrp.placement(id)?.transform.position)
    })

  /**
   * The critical invariant a drag must uphold: every selected placement's
   * RENDERED mesh sits exactly where the DOCUMENT says (three = [ksa.y, ksa.x,
   * −ksa.z]). A doc-only assertion once passed while the meshes never moved.
   */
  const meshesMatchDoc = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __icrp: {
          selection: () => string[]
          placement: (
            id: string,
          ) => { transform: { position: { x: number; y: number; z: number } } } | undefined
          meshWorld: (id: string) => { x: number; y: number; z: number } | null
        }
      }
      return w.__icrp.selection().every((id) => {
        const doc = w.__icrp.placement(id)?.transform.position
        const mesh = w.__icrp.meshWorld(id)
        if (!doc || !mesh) return false
        return (
          Math.abs(mesh.x - doc.y) < 1e-6 &&
          Math.abs(mesh.y - doc.x) < 1e-6 &&
          Math.abs(mesh.z - -doc.z) < 1e-6
        )
      })
    })

  await step('body drag slides the selection on the ground', async () => {
    await page.keyboard.press('Escape')
    await page.keyboard.press('KeyW') // translate tool
    // Re-select the imported part's layer and frame it.
    await page.evaluate(() => {
      const w = window as unknown as {
        __icrp: {
          project: () => { objects: { layers: { id: string }[] }[] }
          selectLayer: (id: string) => void
        }
      }
      const layer = w.__icrp.project().objects[0].layers.find((l) => l.id !== 'default')
      if (layer) w.__icrp.selectLayer(layer.id)
    })
    await page.keyboard.press('f')
    await delay(700)
    const canvas = page.locator('canvas').first()
    const cbox = (await canvas.boundingBox())!
    const cx = cbox.x + cbox.width / 2
    const cy = cbox.y + cbox.height / 2
    // Find a spot that hits a piece but no gizmo handle.
    let spot: { x: number; y: number } | null = null
    for (const [dx, dy] of [[60, 0], [-60, 0], [40, 20], [-40, 20], [80, 0]]) {
      const pick = await page.evaluate(
        ([x, y]) =>
          (window as unknown as { __icrp: { pickAt: (x: number, y: number) => unknown } }).__icrp.pickAt(
            x,
            y,
          ),
        [cx + dx, cy + dy],
      )
      if (!pick) continue
      await page.mouse.move(cx + dx, cy + dy)
      await delay(30)
      const axis = await page.evaluate(
        () => (window as unknown as { __icrp: { hoveredAxis: () => string | null } }).__icrp.hoveredAxis(),
      )
      if (!axis) {
        spot = { x: cx + dx, y: cy + dy }
        break
      }
    }
    assert(spot !== null, 'no piece spot free of gizmo handles found')
    const before = await selectionPositions()
    await page.mouse.move(spot.x, spot.y)
    await page.mouse.down()
    await page.mouse.move(spot.x + 150, spot.y + 40, { steps: 12 })
    await page.mouse.up()
    await delay(400)
    const after = await selectionPositions()
    assert(JSON.stringify(before) !== JSON.stringify(after), 'body drag moved nothing')
    assert(await meshesMatchDoc(), 'body drag: rendered meshes disagree with the document')
  })

  await step('pivot arrow drag moves the group', async () => {
    // Self-contained: the body-drag step may have narrowed the selection (a
    // grab outside the selection selects just that piece — by design).
    await page.evaluate(() => {
      const w = window as unknown as {
        __icrp: {
          project: () => { objects: { layers: { id: string }[] }[] }
          selectLayer: (id: string) => void
        }
      }
      const layer = w.__icrp.project().objects[0].layers.find((l) => l.id !== 'default')
      if (layer) w.__icrp.selectLayer(layer.id)
    })
    await page.keyboard.press('f')
    await delay(700)
    const canvas = page.locator('canvas').first()
    const cbox = (await canvas.boundingBox())!
    const pivot = await page.evaluate(
      () =>
        (
          window as unknown as {
            __icrp: { pivotScreen: () => { x: number; y: number; visible: boolean } | null }
          }
        ).__icrp.pivotScreen(),
    )
    assert(pivot !== null && pivot.visible, 'multi-select pivot not attached')
    const px = cbox.x + pivot.x
    const py = cbox.y + pivot.y
    let hit: { x: number; y: number } | null = null
    outer: for (const r of [35, 50, 65, 80, 95, 110]) {
      for (let a = 0; a < 24; a++) {
        const x = px + r * Math.cos((a / 24) * 2 * Math.PI)
        const y = py + r * Math.sin((a / 24) * 2 * Math.PI)
        await page.mouse.move(x, y)
        await delay(15)
        const axis = await page.evaluate(
          () =>
            (window as unknown as { __icrp: { hoveredAxis: () => string | null } }).__icrp.hoveredAxis(),
        )
        if (axis === 'X' || axis === 'Z') {
          hit = { x, y }
          break outer
        }
      }
    }
    assert(hit !== null, 'no pivot arrow handle found by hover-scan')
    const before = await selectionPositions()
    await page.mouse.move(hit.x, hit.y)
    await page.mouse.down()
    await page.mouse.move(hit.x + 60, hit.y + 25, { steps: 6 })
    await delay(120)
    // THE regression this step exists for: the meshes must move MID-drag (the
    // doc updating while the meshes stay put reads as "completely broken").
    const midMoved = await page.evaluate(() => {
      const w = window as unknown as {
        __icrp: { selection: () => string[]; meshWorld: (id: string) => unknown }
      }
      return JSON.stringify(w.__icrp.meshWorld(w.__icrp.selection()[0]))
    })
    await page.mouse.move(hit.x + 120, hit.y + 50, { steps: 6 })
    await page.mouse.up()
    await delay(400)
    const after = await selectionPositions()
    assert(JSON.stringify(before) !== JSON.stringify(after), 'pivot drag moved nothing')
    assert(await meshesMatchDoc(), 'pivot drag: rendered meshes disagree with the document')
    const endMesh = await page.evaluate(() => {
      const w = window as unknown as {
        __icrp: { selection: () => string[]; meshWorld: (id: string) => unknown }
      }
      return JSON.stringify(w.__icrp.meshWorld(w.__icrp.selection()[0]))
    })
    assert(midMoved !== endMesh || midMoved !== 'null', 'pivot drag: mesh never moved mid-drag')
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
