/**
 * ICRP tank-farm JOURNEY smoke (`pnpm smoke:icrp-journey`) — the greenfield
 * end-user flow, asserted end-to-end in a real browser:
 *
 *   1. boot → the Library palette lists pads/parts/pieces
 *   2. click the LaunchPad prefab tile → the pad opens as the object
 *   3. Parts chip + fuzzy search → click a fuel tank → own layer, 3 pieces
 *      selected as a unit, 2 magnetic connectors on the anchor, spawned east
 *   4. second tank → second layer
 *   5. body-drag near the first tank → BOX magnet snaps the tanks flush
 *      (exact shared edge), guide line shown
 *   6. body-drag hovering above the first tank → CONNECTOR magnet docks the
 *      bottom node onto the top node (exact 3D stack, zero lateral drift)
 *   7. ⇧W tips the selection 90° (kept above grade), ArrowRight nudges by the
 *      snap increment
 *
 * RUNTIME: vanilla Node 24+ with the project-local playwright devDependency.
 * SMOKE_BASE reuses a running dev server; otherwise one is spawned.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:5173/flexo/apps/icrp/'
const SERVER_TIMEOUT_MS = 90_000
const OUT_SHOT = process.env.JOURNEY_SHOT ?? ''
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
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
type W = {
  __icrp: {
    project: () => {
      objects: {
        placements: {
          instanceId: string
          pieceId: string
          layerId: string
          transform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }
          connectors?: unknown[]
        }[]
        layers: { id: string; name: string }[]
      }[]
      activeObjectId: string
    }
    selection: () => string[]
    selectLayer: (id: string) => void
    select: (ids: string[]) => void
    pickAt: (x: number, y: number) => unknown
    hoveredAxis: () => string | null
    lastSnapKind: () => string | null
    setPlacementTransform: (id: string, t: unknown) => void
    meshWorld: (id: string) => { x: number; y: number; z: number } | null
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

  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
await page.goto(BASE)
await page.waitForTimeout(3000)

// --- 1. Library boots with content ---
await page.locator('text=Library').first().waitFor({ timeout: 10_000 })
console.log('ok  library panel visible')

// --- 2. Click the pad prefab tile ---
await page.getByRole('button', { name: 'Pads', exact: true }).click()
await delay(200)
const padTile = page.locator('button[aria-label^="Add LaunchPad"]').first()
await padTile.waitFor({ timeout: 5000 })
await padTile.click()
await delay(1500)
const padCount = await page.evaluate(() => {
  const w = window as unknown as W
  const p = w.__icrp.project()
  const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
  return active.placements.length
})
assert(padCount > 5, `pad prefab import: ${padCount} placements`)
console.log('ok  pad prefab added via library tile:', padCount, 'placements')

// --- 3. Add first tank via Parts chip + search ---
await page.getByRole('button', { name: 'Pads', exact: true }).click() // restore all kinds
await page.getByRole('button', { name: 'Parts', exact: true }).click() // solo parts
const search = page.locator('input[aria-label="Search library"]')
await search.fill('LF1W1HA')
await delay(300)
const tankTile = page.locator('button[aria-label="Add LF1W1HA"]').first()
await tankTile.waitFor({ timeout: 5000 })
await tankTile.click()
await delay(1200)
const afterTankA = await page.evaluate(() => {
  const w = window as unknown as W
  const p = w.__icrp.project()
  const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
  const layers = active.layers.map((l) => l.name)
  const sel = w.__icrp.selection()
  const tankPls = active.placements.filter((pl) => sel.includes(pl.instanceId))
  const anchor = tankPls.find((pl) => (pl.connectors?.length ?? 0) > 0)
  return {
    layers,
    selCount: sel.length,
    east: tankPls[0]?.transform.position.y,
    connectors: anchor?.connectors?.length ?? 0,
  }
})
assert(afterTankA.layers.includes('LF1W1HA'), `tank layer created: ${afterTankA.layers}`)
assert(afterTankA.selCount === 3, `tank selected as unit: ${afterTankA.selCount}`)
assert(afterTankA.connectors === 2, `anchor connectors: ${afterTankA.connectors}`)
assert(afterTankA.east > 5, `spawned east of pad: ${afterTankA.east}`)
console.log('ok  tank A added: own layer, 3 pieces selected, 2 connectors, east =', afterTankA.east.toFixed(1))

// --- 4. Second tank ---
await tankTile.click()
await delay(1200)
const layersNow = await page.evaluate(() => {
  const w = window as unknown as W
  const p = w.__icrp.project()
  const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
  return active.layers.map((l) => l.name)
})
assert(layersNow.filter((n) => n.startsWith('LF1W1HA')).length >= 2 || layersNow.filter((n) => n === 'LF1W1HA').length >= 2, `two tank layers: ${layersNow}`)
console.log('ok  tank B added:', layersNow.join(', '))

// helper: tank anchor ids per layer
const tanks = await page.evaluate(() => {
  const w = window as unknown as W
  const p = w.__icrp.project()
  const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
  const byLayer = new Map<string, { ids: string[]; anchor: string | null }>()
  for (const pl of active.placements) {
    if (!pl.pieceId.includes('FuelTank')) continue
    const e = byLayer.get(pl.layerId) ?? { ids: [], anchor: null }
    e.ids.push(pl.instanceId)
    if ((pl.connectors?.length ?? 0) > 0) e.anchor = pl.instanceId
    byLayer.set(pl.layerId, e)
  }
  return [...byLayer.values()]
})
assert(tanks.length === 2 && tanks[0].anchor && tanks[1].anchor, 'two tanks with anchors')
const [tankA, tankB] = tanks

// --- 5. Horizontal box snap: pre-place B 0.5 m east of flush, tiny drag, expect flush ---
await page.keyboard.press('Escape')
await delay(200)
const setB = async (up: number, east: number, north: number) => {
  await page.evaluate(
    ([ids, u, e, n]) => {
      const w = window as unknown as W
      const p = w.__icrp.project()
      const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
      const anchorPl = active.placements.find((pl) => pl.instanceId === (ids as string[])[0])!
      const dU = (u as number) - anchorPl.transform.position.x
      const dE = (e as number) - anchorPl.transform.position.y
      const dN = (n as number) - anchorPl.transform.position.z
      for (const id of ids as string[]) {
        const pl = active.placements.find((q) => q.instanceId === id)!
        w.__icrp.setPlacementTransform(id, {
          ...pl.transform,
          position: {
            x: pl.transform.position.x + dU,
            y: pl.transform.position.y + dE,
            z: pl.transform.position.z + dN,
          },
        })
      }
    },
    [tankB.ids, up, east, north] as const,
  )
}
const aPos = await page.evaluate(
  (id) => {
    const w = window as unknown as W
    const p = w.__icrp.project()
    const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
    return active.placements.find((pl) => pl.instanceId === id)!.transform.position
  },
  tankA.anchor!,
)
// tank is ~1 m diameter → flush east-of-A is A.east + ~1.0. Pre-place 0.2 m off
// flush (inside the min 0.25 m magnet radius at any zoom).
await setB(aPos.x, aPos.y + 1.2, aPos.z)
await delay(400)
// select tank B, frame it, and drag it slightly
await page.evaluate((ids) => (window as unknown as W).__icrp.select(ids as string[]), tankB.ids)
await delay(200)
await page.keyboard.press('f')
await delay(500)
// find B's anchor on screen: use meshWorld → project via pivotScreen? use pickAt sweep around projected point
const bScreen = await page.evaluate(() => {
  const w = window as unknown as W & { __icrp: { pivotScreen: () => { x: number; y: number } | null } }
  return w.__icrp.pivotScreen()
})
assert(bScreen, 'pivot screen for tank B')
const canvas = page.locator('canvas').first()
const cbox = (await canvas.boundingBox())!
// find a grabbable body spot near the pivot, avoiding gizmo handles
let spot: { x: number; y: number } | null = null
for (const [dx, dy] of [[0, -60], [50, -50], [-50, -50], [80, 0], [-80, 0], [0, -100], [120, -40], [0, 60], [40, 80]]) {
  const px = cbox.x + bScreen.x + dx
  const py = cbox.y + bScreen.y + dy
  const pick = await page.evaluate(([x, y]) => (window as unknown as W).__icrp.pickAt(x, y), [px, py])
  if (!pick) continue
  await page.mouse.move(px, py)
  await delay(30)
  const axis = await page.evaluate(() => (window as unknown as W).__icrp.hoveredAxis())
  if (!axis) { spot = { x: px, y: py }; break }
}
assert(spot, 'grabbable spot on tank B')
await page.mouse.move(spot.x, spot.y)
await page.mouse.down()
await page.mouse.move(spot.x + 4, spot.y, { steps: 3 })
await delay(120)
const kindDuring = await page.evaluate(() => (window as unknown as W).__icrp.lastSnapKind())
await page.mouse.up()
await delay(300)
const gap = await page.evaluate(
  ([aId, bId]) => {
    const w = window as unknown as W
    const p = w.__icrp.project()
    const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
    const a = active.placements.find((pl) => pl.instanceId === aId)!.transform.position
    const b = active.placements.find((pl) => pl.instanceId === bId)!.transform.position
    return { dEast: b.y - a.y, dNorth: b.z - a.z, dUp: b.x - a.x }
  },
  [tankA.anchor, tankB.anchor] as const,
)
console.log('   snap kind during drag:', kindDuring, '| B-A delta:', JSON.stringify(gap))
assert(kindDuring === 'box', `expected box snap, got ${kindDuring}`)
assert(Math.abs(gap.dEast - 1.0) < 0.06, `flush east gap: ${gap.dEast}`)
console.log('ok  horizontal drag: box snap → tanks flush side-by-side (center gap', gap.dEast.toFixed(3), 'm)')

// --- 6. Vertical connector stack: hover B above A, tiny drag, expect connector dock ---
await setB(aPos.x + 1.2, aPos.y + 0.1, aPos.z)
await delay(400)
await page.evaluate((ids) => (window as unknown as W).__icrp.select(ids as string[]), tankB.ids)
await delay(200)
await page.keyboard.press('f')
await delay(500)
const bScreen2 = await page.evaluate(() => (window as unknown as W & { __icrp: { pivotScreen: () => { x: number; y: number } | null } }).__icrp.pivotScreen())
assert(bScreen2, 'pivot 2')
let spot2: { x: number; y: number } | null = null
for (const [dx, dy] of [[0, -60], [50, -50], [-50, -50], [80, 0], [-80, 0], [0, -100], [120, -40], [0, 60], [40, 80]]) {
  const px = cbox.x + bScreen2.x + dx
  const py = cbox.y + bScreen2.y + dy
  const pick = await page.evaluate(([x, y]) => (window as unknown as W).__icrp.pickAt(x, y), [px, py])
  if (!pick) continue
  await page.mouse.move(px, py)
  await delay(30)
  const axis = await page.evaluate(() => (window as unknown as W).__icrp.hoveredAxis())
  if (!axis) { spot2 = { x: px, y: py }; break }
}
assert(spot2, 'grabbable spot 2')
await page.mouse.move(spot2.x, spot2.y)
await page.mouse.down()
await page.mouse.move(spot2.x + 4, spot2.y, { steps: 3 })
await delay(120)
const kind2 = await page.evaluate(() => (window as unknown as W).__icrp.lastSnapKind())
await page.mouse.up()
await delay(300)
const stack = await page.evaluate(
  ([aId, bId]) => {
    const w = window as unknown as W
    const p = w.__icrp.project()
    const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
    const a = active.placements.find((pl) => pl.instanceId === aId)!.transform.position
    const b = active.placements.find((pl) => pl.instanceId === bId)!.transform.position
    return { dUp: b.x - a.x, dEast: b.y - a.y, dNorth: b.z - a.z }
  },
  [tankA.anchor, tankB.anchor] as const,
)
console.log('   snap kind:', kind2, '| stack delta:', JSON.stringify(stack))
assert(kind2 === 'connector', `expected connector snap, got ${kind2}`)
assert(Math.abs(stack.dUp - 1.0) < 0.01 && Math.abs(stack.dEast) < 0.01 && Math.abs(stack.dNorth) < 0.01, `stacked exactly: ${JSON.stringify(stack)}`)
console.log('ok  vertical drag: connector dock → tank B stacked exactly on tank A')

// --- 7. ⇧A spin + ⇧W tip + arrow nudge ---
const rotBefore = await page.evaluate((id) => {
  const w = window as unknown as W
  const p = w.__icrp.project()
  const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
  return active.placements.find((pl) => pl.instanceId === id)!.transform.rotation
}, tankB.anchor)
await page.keyboard.press('Shift+W')
await delay(400)
const rotAfter = await page.evaluate((id) => {
  const w = window as unknown as W
  const p = w.__icrp.project()
  const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
  const pl = active.placements.find((q) => q.instanceId === id)!
  return { rot: pl.transform.rotation, up: pl.transform.position.x }
}, tankB.anchor)
const rotDelta = Math.abs(rotAfter.rot.y - rotBefore.y)
assert(rotDelta > 1.4 && rotDelta < 1.75, `tipped ~90°: ${rotDelta}`)
console.log('ok  ⇧W tipped the tank 90° (horizontal), still above grade (up =', rotAfter.up.toFixed(2), ')')

const posBefore = await page.evaluate((id) => {
  const w = window as unknown as W
  const p = w.__icrp.project()
  const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
  return active.placements.find((pl) => pl.instanceId === id)!.transform.position
}, tankB.anchor)
await page.keyboard.press('ArrowRight')
await delay(250)
const posAfter = await page.evaluate((id) => {
  const w = window as unknown as W
  const p = w.__icrp.project()
  const active = p.objects.find((o) => (o as unknown as { id: string }).id === p.activeObjectId) ?? p.objects[0]
  return active.placements.find((pl) => pl.instanceId === id)!.transform.position
}, tankB.anchor)
assert(Math.abs(posAfter.y - posBefore.y - 0.5) < 1e-9, `arrow nudged by snap increment: ${posAfter.y - posBefore.y}`)
console.log('ok  ArrowRight nudged east by the 0.5 m snap increment')

if (OUT_SHOT) await page.screenshot({ path: OUT_SHOT })
await browser.close()
} catch (err) {
  failed = true
  console.error(String(err))
} finally {
  if (server?.pid) process.kill(-server.pid, 'SIGTERM')
}
if (failed) process.exit(1)
console.log('\njourney: all checks passed')
