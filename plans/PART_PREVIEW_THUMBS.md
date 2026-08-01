# Part Preview Thumbnails — Plan

A build-adjacent process that captures **PNG thumbnails of every built-in KSA Part from 10
angles** (36° steps around the Y axis) into `dist/apps/partpreview/assets/thumbs/`, named
`<part_id>_NN.png` (`NN` = zero-padded `01`…`10`), and augments the partpreview
`manifest.json` with a top-level `thumbs` field mapping each part id to the full HTTP URLs
of its thumbnails.

**Hard constraints** (from the request):

- **Efficient**: every part × 10 angles in one run, without paying per-part startup costs.
- Output: `dist/apps/partpreview/assets/thumbs/<part_id>_NN.png`, `NN` ∈ `01`…`10`.
- Viewport size configurable by options; **default 250×250**.
- The part fills **90%** of the viewport; **only the part** is visible — no axis triad, no
  connector markers, no overlays/UI.
- Same **default environment/lighting** as the partpreview mini app (procedural studio
  IBL, `DEFAULT_LIGHTING` exposure/tonemapping, charcoal background, no sky).
- `manifest.json` gains a top-level `"thumbs"` field: keys = part ids, values = **full
  HTTP file paths** built from knowledge of the site URL.
- A **separate package.json script** — NOT run by `pnpm build`.

---

## 1. Current architecture facts this plan builds on

| Fact | Where |
|---|---|
| The partpreview mini app is its own Vite root (`base: '/flexo/apps/partpreview/'`, outDir `dist/apps/partpreview`, `emptyOutDir: true`), sharing the main app's `ksa/`/`hdr/`/`basis/` via `VITE_ASSET_BASE: '/flexo/'` | `apps/partpreview/vite.config.ts` |
| `PartPreviewViewport` already supports embedder options: `lighting` store override, `showConnectors`, `fillFraction` (aspect-aware 90% framing), `axisGizmo` (default **off**), `reframeOnResize` | `src/three/PartPreviewViewport.ts` |
| Default framing: camera on direction `(1, 0.6, 1).normalize()` at `framedDistance` from the bounding-sphere center; `frame()` stores `framedDistance` and sets `controls.target` to the center | `src/three/PartPreviewViewport.ts` (`frame()`) |
| The mini app's default look = `DEFAULT_LIGHTING` + `environment: 'room'` (procedural studio, zero download) + `showEnvironmentBackground: false` (solid charcoal `0x16171d`), via the session-only `$previewLighting` atom (never the persistent `$lighting`) | `apps/partpreview/src/settings.ts` |
| `setPart(part, index)` awaits geometry + shared material (textures included) for every placement before resolving; load failures are caught and `console.warn`ed, leaving zero objects | `src/three/PartPreviewViewport.ts`, `src/three/SubPartObject.ts` |
| `SceneEnvironment.apply()` is async (PMREM room gen / HDR fetch); the viewport fires it from the lighting subscription without exposing completion | `src/three/SceneEnvironment.ts`, viewport constructor |
| Geometry/material/texture caches are module-level singletons — many `setPart` calls in one page reuse everything already downloaded/decoded | `src/three/MeshAtlasCache.ts`, `MaterialFactory.ts`, `TextureCache.ts` |
| `manifest.json` (`part_ids`, `skybox_ids`, `ksa_build`) is written by the `previewManifest` plugin in `writeBundle`; `part_ids` is the exact set of renderable parts (produced by the app's own parser — the anti-drift guarantee) | `vite/previewManifest.ts`, `docs/wiki-part-preview.md` |
| `scripts/` is the repo's home for standalone build/asset utilities; convention: reuse app code from `src/` (and now `apps/`) via relative imports; module resolution walks up to the root `node_modules`. Historically a Bun mini-workspace — this plan's driver departs from that (§2.2) | `scripts/CLAUDE.md` |
| `playwright` `1.62.0` is already a **root** devDependency (project-local Playwright is the established verification tool) | `package.json` |
| Production `dist/` is built **in CI** on **Node 24** (`deploy.yml`: setup-node 24 → pnpm install → `pnpm run build` → upload Pages artifact); anything not produced there never reaches `meow.science.fail` | `.github/workflows/deploy.yml` |
| The site origin `https://meow.science.fail` appears only in docs/gadget snippets — no code constant exists yet | `docs/wiki-part-preview.md` |

---

## 2. Key design decisions

### 2.1 Capture in a real headless browser, one page for the whole run

The renderer stack (WebGL2, KTX2/basis transcode worker, zstd wasm, the KSA shader
patches) only exists in a browser. Reimplementing it under Node/Bun (headless-gl et al.)
would fork the render path and lie about what the app actually shows. So: **headless
Chromium via the project-local Playwright**, rendering with the app's own code.

Efficiency comes from the shape of the run, not raw speed:

- **One navigation, one WebGL context, one catalog load** for all parts. A dedicated
  `capture.html` entry boots the catalogs once, creates one `PartPreviewViewport`, and
  loops `setPart` over every id. The module-level geometry/material/texture caches do the
  rest — per-part cost is its own atlas/texture fetch (served from localhost, OS-cached)
  plus 10 tiny renders.
- Per-angle cost is one synchronous 250×250 render + `canvas.toDataURL('image/png')`.
  No `page.screenshot` (which round-trips the compositor and includes DOM), no reload,
  no waiting on rAF.
- Ballpark: ~143 parts × (~100 ms load + 10 × ~20–50 ms SwiftShader renders) ≈ **1–3
  minutes** locally, single-threaded.

**Rejected alternatives:**

- *Navigate the existing app per part* (`?part_id=…` × 143 × screenshot): pays page boot,
  WebGL init and catalog parse per part; also captures the app's overlays (zoom buttons,
  gizmo) which would then need hiding hacks.
- *Node + headless-gl / puppeteer-free rendering*: a second renderer implementation to
  keep honest forever. No.
- *A Vite plugin on build*: explicitly excluded by the request (must not run on every
  `pnpm build`), and a browser capture inside a Vite build step is the wrong lifecycle.

### 2.2 Driver = vanilla Node 24 script in `scripts/`, serving the built `dist/`

`scripts/` is the repo's home for standalone build utilities, but this driver deliberately
does **NOT** use Bun: it is plain TypeScript executed directly by **Node 24+**
(`node scripts/capture-part-thumbs.ts`) via Node's built-in type stripping — **no
transpiler, no special flags** (type stripping is unflagged since Node 23.6; CI already
runs Node 24), **no Bun APIs** — Node built-ins only (`node:http`, `node:fs/promises`,
`node:util` `parseArgs`, `node:path`). Two authoring rules follow, enforced by tsconfig
(§3):

- **Erasable syntax only** (`erasableSyntaxOnly: true`): no enums, no namespaces, no
  parameter properties, no `import x = require()` — the types must simply strip away.
- **Node ESM resolution**: relative imports carry explicit `.ts` extensions (with
  `allowImportingTsExtensions` + `noEmit` in the tsconfig), and everything the driver
  imports transitively must follow the same rules — `thumbsSpec.ts` is dependency-free
  precisely so that chain ends immediately.

The driver `scripts/capture-part-thumbs.ts`:

1. Verifies prerequisites: `dist/apps/partpreview/capture.html`, `dist/apps/partpreview/manifest.json`,
   `dist/ksa/`, `dist/basis/` all exist — else exit with *"run `pnpm build` first"*.
2. Serves the repo `dist/` at `http://127.0.0.1:<random port>/flexo/` with a small
   `node:http` static handler (exactly how production maps `dist/` under `/flexo/`):
   resolve path under `dist/`, stream with `fs.createReadStream`, and an explicit
   mime map — `text/javascript` for the module bundle and `application/wasm` for the
   basis/zstd wasm are the two that genuinely matter, plus `text/html`, `text/css`,
   `application/json`, `application/xml`, and an octet-stream fallback (`.glb`, `.ktx2`,
   `.hdr` are fetched as bytes and don't care). `vite preview` is not reused: the driver
   would have to manage a child process and its SPA-fallback rewrite is a documented
   foot-gun here.
3. Reads `manifest.json` → `part_ids` is **the** list of parts to capture (the manifest is
   already the anti-drift source of truth for "every built-in part"; no re-parsing).
4. Launches headless Chromium (`import { chromium } from 'playwright'` — resolves from the
   root `node_modules` via Node's standard walk-up; `playwright` is deliberately NOT added
   to `scripts/package.json` so the version is pinned in exactly one place and the shared
   `ms-playwright` browser cache is reused).
5. Opens `capture.html?w=<W>&h=<H>` once, waits for readiness, then per part id calls the
   page's capture API, decodes the returned data URLs, and writes the PNGs
   (`fs/promises` `writeFile`, one `mkdir -p` up front).
6. Rewrites `manifest.json` with the `thumbs` field (§2.5).
7. Prints a summary (captured/skipped/failed, elapsed); exits non-zero if any part failed.

Headless-WebGL notes: GH runners and most headless runs use SwiftShader; newer Chromium
needs `--enable-unsafe-swiftshader` in launch args for software WebGL. The capture page
fails fast with a clear message if WebGL context creation fails, and the driver forwards
`console`/`pageerror` output for diagnosability.

### 2.3 Turntable = camera orbit around world Y, anchored to the default framing

Thumb `01` is **exactly the app's default view** (camera on `(1, 0.6, 1).normalize()`,
90% fill), so a wiki thumbnail matches what the live embed shows on load. Thumb `NN`
rotates the **camera** about the world Y axis through the framed target by
`(NN − 1) × 36°`, keeping the framed elevation and distance.

Rotating the camera (not the part) reuses `frame()`'s math unchanged and never touches
object transforms. Consequence: the world-fixed directional light sweeps across the part
over the sequence — angles are lit differently, which reads as shape, and the dominant
room IBL is soft. (A fixed-lighting turntable — rotating the part under a static camera —
is noted in §10 as a variant, not chosen.)

### 2.4 "Only the part", same default look

The capture viewport is constructed with:

- `lighting: $previewLighting` (imported from `apps/partpreview/src/settings.ts`; with no
  query params it is precisely the app default: `DEFAULT_LIGHTING` + `'room'` + hidden
  sky) — same atom, zero duplication, and still never the persistent editor stores;
- `showConnectors: false`, `axisGizmo: false`, `fillFraction: 0.9`,
  `reframeOnResize: false` (the host div has its exact final size before construction);
- no React, no overlays: `capture.html` is a bare page with a fixed-size host `<div>`.

Background stays the app's opaque charcoal (`0x16171d`) — "same as the sub app" — so the
PNGs are opaque. Transparency is out of scope (§10).

Pixel exactness: Playwright's default `deviceScaleFactor` is 1 and the viewport clamps
`setPixelRatio(min(dpr, 2))`, so the canvas backing store is exactly W×H. The driver
verifies the first PNG's IHDR width/height against the requested size and aborts loudly on
mismatch.

### 2.5 Manifest: optional `thumbs` field, patched after build

```jsonc
{
  "part_ids": ["…"],
  "skybox_ids": ["…"],
  "ksa_build": "2026.7.9.5018",
  "thumbs": {
    "CoreCommandA_Prefab_MediumCapsuleVariantA": [
      "https://meow.science.fail/flexo/apps/partpreview/assets/thumbs/CoreCommandA_Prefab_MediumCapsuleVariantA_01.png",
      "…_02.png",
      "…(10 entries, angle order)"
    ]
  }
}
```

- Values are **arrays of 10 full URLs in angle order** (index 0 = `_01` = default view) —
  self-describing for a wiki, which can just take `[0]` for a single thumbnail.
- Keys sorted with `localeCompare`, matching `part_ids`. Only parts with a complete
  10-file set get an entry.
- URL = `<siteOrigin>` + `/flexo/apps/partpreview/` + `assets/thumbs/<file>`; site origin
  defaults to `https://meow.science.fail`, overridable via `--site-origin`.
- The **script** patches the built `manifest.json` (read → add `thumbs` → write back in
  the plugin's format, 2-space pretty + trailing newline). The `previewManifest` plugin is
  unchanged apart from the `PreviewManifest` type gaining `thumbs?: Record<string,
  string[]>` — the build never writes it.
- **Lifecycle caveat (document loudly):** `vite build apps/partpreview` runs
  `emptyOutDir`, wiping both the thumbs and the patched manifest. Order is always
  `pnpm build` → `pnpm thumbs:partpreview`. Consumers must treat `thumbs` as **optional**
  (absent on a plain build). `ksa_build` remains the cache-busting handle for thumbnails
  exactly as for embeds.

### 2.6 One shared spec module — names/URLs/angles defined once

`apps/partpreview/src/thumbsSpec.ts` — dependency-free (no three, no vite, no
`import.meta.env`), **erasable-syntax-only** so plain Node can strip it, importable by the
browser capture page, the Node driver, and vitest:

```ts
export const THUMB_COUNT = 10
export const THUMB_STEP_DEG = 36 // 360 / THUMB_COUNT
export const DEFAULT_THUMB_SIZE = 250
export const DEFAULT_SITE_ORIGIN = 'https://meow.science.fail'
/** Must match `base` in apps/partpreview/vite.config.ts. */
export const PARTPREVIEW_BASE = '/flexo/apps/partpreview/'

/** `<part_id>_NN.png`, NN = 01-based zero-padded angle index. */
export function thumbFileName(partId: string, angleIndex: number): string
/** Full production URL for one thumb: origin + PARTPREVIEW_BASE + assets/thumbs/<file>. */
export function thumbUrl(siteOrigin: string, partId: string, angleIndex: number): string
/** The manifest `thumbs` value for one part: all 10 URLs in angle order. */
export function thumbUrls(siteOrigin: string, partId: string): string[]
```

---

## 3. New / changed files

| File | Change |
|---|---|
| `apps/partpreview/capture.html` | **New** second Vite input: bare page, fixed-size host div, loads `src/capture.ts`. No React root, no CSS import beyond a few inline rules (margin 0, host `width/height` from `?w=&h=`). |
| `apps/partpreview/src/capture.ts` | **New** capture page logic: boot catalogs, build viewport, expose `window.__flexoCapture` (§4). |
| `apps/partpreview/src/thumbsSpec.ts` | **New** shared constants + pure name/URL helpers (§2.6). |
| `apps/partpreview/vite.config.ts` | Add `build.rollupOptions.input: { index: …/index.html, capture: …/capture.html }`. Reshaping the **mini** app's own chunk graph is fine — the standalone constraint only protects the main app. `capture.html` ships in `dist/` (tiny, inert, harmless if visited). |
| `src/three/PartPreviewViewport.ts` | Additive capture support (§5): extract `FRAME_DIR` const; add `setViewAzimuth()`, `renderToDataURL()`, `envApplied()`, `hasContent()`. No default behavior changes. |
| `vite/previewManifest.ts` | `PreviewManifest` gains optional `thumbs?: Record<string, string[]>` (type only; plugin still never emits it). |
| `scripts/capture-part-thumbs.ts` | **New** vanilla-Node driver (§6): Node built-ins only, erasable-syntax TS, `.ts`-extension relative imports. |
| `scripts/tsconfig.json` | Add `erasableSyntaxOnly: true`, `allowImportingTsExtensions: true`, `noEmit: true` so tsc/IDE enforce exactly what Node's type stripping accepts. |
| `scripts/package.json` | Ensure `"type": "module"` (Node decides ESM-vs-CJS for `.ts` from the nearest package.json, same as `.js`). No new dependencies. |
| `package.json` (root) | New script — `"thumbs:partpreview": "node scripts/capture-part-thumbs.ts"`. Plain `node`, no flags. Deliberately not referenced by `build`. |
| `.github/workflows/deploy.yml` | New steps between Build and Upload (§8) — without them thumbs never reach production, since `dist/` is built in CI. |
| `docs/wiki-part-preview.md` | Document `thumbs` in the manifest contract table (optional field), the capture script, and delete the "No screenshot or thumbnail generation" bullet from Limits. |
| `scripts/README.md` / `scripts/CLAUDE.md` | One entry for the new script, plus amend the "Bun-only" guidance: this script (and new scripts going forward) runs under **vanilla Node 24+** — Bun remains only for the existing unmigrated scripts. |
| `apps/partpreview/src/thumbsSpec.test.ts` | **New** vitest: file name padding, URL composition, count/step invariants (`THUMB_COUNT × THUMB_STEP_DEG === 360`). |

---

## 4. The capture page (`capture.ts`)

```ts
import { ensureCatalogLoaded, $catalogIndex } from '../../../src/state/catalogStore'
import { ensurePartCatalogLoaded, $partCatalogIndex } from '../../../src/state/partCatalogStore'
import { PartPreviewViewport } from '../../../src/three/PartPreviewViewport'
import { $previewLighting } from './settings' // no query params ⇒ exact app-default lighting
import { THUMB_COUNT, THUMB_STEP_DEG } from './thumbsSpec'

// Host div sized from ?w=&h= (defaults 250) BEFORE the viewport is constructed,
// so the first frame() already sees the final aspect. Fail fast (visible message +
// thrown error) if a WebGL2 context cannot be created.

const api = {
  ready: false, // driver polls page.waitForFunction(() => __flexoCapture.ready)
  /** Loads the part, then renders THUMB_COUNT angles; returns PNG data URLs in order. */
  async capturePart(partId: string): Promise<string[]> {
    const part = $partCatalogIndex.get().get(partId)
    if (!part) throw new Error(`unknown part_id ${partId}`)
    await viewport.setPart(part, $catalogIndex.get())
    // setPart swallows load errors by design (app behavior) — detect them here:
    if (!viewport.hasContent()) throw new Error(`part ${partId} loaded zero objects`)
    const urls: string[] = []
    for (let i = 0; i < THUMB_COUNT; i++) {
      viewport.setViewAzimuth((i * THUMB_STEP_DEG * Math.PI) / 180)
      urls.push(viewport.renderToDataURL())
    }
    return urls
  },
}
// boot: await both ensure*Loaded(), construct viewport (showConnectors:false,
// axisGizmo:false, fillFraction:0.9, lighting:$previewLighting), await
// viewport.envApplied(), then api.ready = true
window.__flexoCapture = api
```

Debuggable standalone: `pnpm dev:partpreview` serves
`…/capture.html?w=250&h=250`, and `__flexoCapture.capturePart(id)` can be exercised from
devtools.

---

## 5. `PartPreviewViewport` additions (all additive)

```ts
/** frame()'s viewing direction — extracted from the inline (1, 0.6, 1) in frame(). */
const FRAME_DIR = new THREE.Vector3(1, 0.6, 1).normalize()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

/** Reposition the camera on the framed sphere: FRAME_DIR rotated about world Y by
 *  `offsetRad`, at framedDistance from the current target. Keeps elevation/distance,
 *  so offset 0 reproduces frame()'s pose exactly. */
setViewAzimuth(offsetRad: number): void {
  const dir = FRAME_DIR.clone().applyAxisAngle(WORLD_UP, offsetRad)
  this.camera.position.copy(this.controls.target).addScaledVector(dir, this.framedDistance)
  this.controls.update()
  this.loop.invalidate()
}

/** Render synchronously and read the canvas back in the same task (the drawing
 *  buffer is only guaranteed until the task yields — preserveDrawingBuffer stays off). */
renderToDataURL(): string {
  this.renderFrame()
  return this.renderer.domElement.toDataURL('image/png')
}

/** Resolves when the most recent SceneEnvironment.apply has settled. */
envApplied(): Promise<void>
// impl: the lighting subscription assigns `this.envPromise = this.sceneEnv.apply(s)
// .then(() => this.loop.invalidate())` instead of void-ing it; envApplied() returns it.

/** True when the last setPart produced at least one SubPartObject. */
hasContent(): boolean { return this.objects.length > 0 }
```

No constructor/option changes; the in-app Part browser and the live embed are untouched.

---

## 6. The driver (`scripts/capture-part-thumbs.ts`)

Runs as `node scripts/capture-part-thumbs.ts` — Node 24+ strips the types natively; no
transpiler, no flags. CLI (parsed with `node:util` `parseArgs`):

| Flag | Default | Meaning |
|---|---|---|
| `--width`, `--height` | `250` | Canvas size in px (passed to the page as `?w=&h=`). |
| `--site-origin` | `https://meow.science.fail` | Origin used to build the manifest `thumbs` URLs. |
| `--parts a,b,c` | all of `manifest.part_ids` | Capture only these ids (debugging). Manifest is still patched only with complete sets present on disk. |
| `--skip-existing` | off | Skip a part when all 10 PNGs already exist (resume after a partial/failed run — useless after a rebuild, which wipes `dist/apps/partpreview/`). |

Flow (per §2.2): verify dist → `node:http` static server for `/flexo/` → read manifest →
launch Chromium (`headless: true`, `args: ['--enable-unsafe-swiftshader']`) → open
`capture.html?w&h` → `waitForFunction(ready)` → sequential per-part
`page.evaluate((id) => window.__flexoCapture.capturePart(id), id)` with a per-part timeout
(e.g. 30 s) → decode base64 → `writeFile` each `thumbs/<id>_NN.png` (one `mkdir` up front) →
IHDR size check on the very first PNG → after the loop, patch `manifest.json` with
`thumbs` built via `thumbUrls()` for every part with a complete set → close browser +
server → summary.

Error policy: a failed part is logged and **excluded** from `thumbs`; the run continues;
exit code 1 if any failures (CI then fails rather than silently publishing holes —
`part_ids` are all renderable by construction, so any failure is a real bug). Progress is
logged every ~10 parts with elapsed time.

---

## 7. Build & deploy integration

- Local: `pnpm build` then `pnpm thumbs:partpreview`. Running only
  `vite build apps/partpreview` afterwards also wipes thumbs — the script's prerequisite
  check plus docs cover this.
- CI (`deploy.yml`), between **Build** and **Upload Pages artifact** — required for
  production, since `dist/` only exists in CI:

```yaml
- name: Install Playwright Chromium
  run: pnpm exec playwright install --with-deps chromium

- name: Capture part thumbnails
  run: pnpm thumbs:partpreview
```

  No new runtime setup: the workflow's existing Node 24 runs the driver directly.

  Optional: cache `~/.cache/ms-playwright` keyed on the Playwright version to skip the
  browser download. Expect the step to add a few minutes (software WebGL on a runner).

---

## 8. Verification

1. `pnpm build`, then `pnpm thumbs:partpreview --parts CoreCommandA_Prefab_MediumCapsuleVariantA`:
   exactly 10 PNGs appear, `_01`…`_10`, each 250×250; `_01` visually matches the live
   embed's default view (`pnpm preview` → compare); `_06` is the ~back view (180°).
2. Full run: file count = `10 × part_ids.length`; manifest `thumbs` key set equals
   `part_ids`; spot-check a URL resolves under `pnpm preview` when origin-rewritten to
   `http://localhost:4173`.
3. `--width 512 --height 512` produces 512×512 PNGs (IHDR check also guards this).
4. Re-run with `--skip-existing`: near-instant, identical manifest.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test` (thumbsSpec unit test; existing
   `previewManifest.test.ts` still green — the emitted build manifest is unchanged).
6. After CI wiring: one production deploy, then fetch
   `https://meow.science.fail/flexo/apps/partpreview/manifest.json` and a couple of thumb
   URLs.

## 9. Efficiency summary (why this meets "EFFICIENTLY")

One browser, one page, one WebGL context, one catalog parse for the entire run; module-
level caches make repeat SubParts free; per-angle work is one 250×250 render + PNG encode;
assets come from a localhost static server. No per-part navigation, no screenshots through
the compositor, no rebuilds.

## 10. Out of scope / future options

- **Transparent-background thumbs** (`--transparent`): needs `alpha: true` renderer +
  background `null`; diverges from the app's look by design, so it's a separate decision.
- **Fixed-lighting turntable** (rotate the part, not the camera) if the sweeping key
  light ever bothers: wrap loaded objects in a rotating parent group instead.
- **Parallel capture** (`--jobs N`: N pages in one context, partitioned id ranges) if the
  single-threaded run ever gets too slow — SwiftShader is CPU-bound, so ~2–3× is
  realistic.
- **Thumbs cache surviving rebuilds** (capture into a repo-side cache dir keyed on
  `ksa_build`, plugin copies it into `dist/` on build): only worth it if CI capture time
  becomes a problem.
- Wiki-side consumption (gallery layout, `ksa_build`-keyed cache busting) stays the
  wiki's job, as with embeds.
