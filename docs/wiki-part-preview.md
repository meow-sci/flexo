# Wiki Part Preview (the `partpreview` mini app)

A tiny standalone 3D viewer that renders **one built-in KSA Part**, chosen by a query
param, and is meant to be embedded by an external wiki in an `<iframe>` — down to
~200×200. It ships alongside the main editor at
`https://meow.science.fail/flexo/apps/partpreview/`.

Source: `apps/partpreview/`. Design + rationale: `plans/WIKI_PART_PREVIEW_PLAN.md`.

It is the first member of an `apps/<name>/` → `dist/apps/<name>/` family; the pattern
is reusable (see [Adding another mini app](#adding-another-mini-app)).

## Why a separate build, not a second entry in the main config

Adding a second HTML input to the main app's `rollupOptions.input` would make Rollup
reshape the **main** app's chunk graph — shared modules get hoisted into common chunks,
so the editor's output changes just because a mini app exists. The requirement was a
*standalone* SPA and an unchanged main app, so `apps/partpreview/` is its own Vite root
with its own `vite.config.ts`, its own `index.html`, and its own bundle:

- `base: '/flexo/apps/partpreview/'`
- `build.outDir: dist/apps/partpreview` (`emptyOutDir: true` — explicit, because the
  outDir is outside the mini root; it only empties that subfolder, never `dist/`)
- built by `pnpm build` **after** the main app:
  `tsc -b && vite build && vite build apps/partpreview`

The main build's default `emptyOutDir` wipes `dist/` (including a stale `dist/apps/`)
first, then the mini build fills its subfolder.

The cost is that three.js and React are bundled twice, once per app. That is what
"standalone" means here, and the mini bundle is served once and cached. What is **not**
duplicated is the heavyweight data — see [Sharing the main app's
assets](#sharing-the-main-apps-assets).

It imports shared code straight out of `../../src/…` (same TypeScript, oxlint, oxfmt and
React Compiler toolchain as the main app): the catalog loaders and stores,
`PartPreviewViewport` and its whole `SubPartObject`/`MaterialFactory`/cache stack,
`loadProgressStore`, and the `src/ui/kit` primitives + design tokens.

### Running it locally

```sh
pnpm dev:partpreview     # dev server; serves ksa/, hdr/, basis/ and manifest.json itself
pnpm build               # main app, then the mini app into dist/apps/partpreview/
pnpm thumbs:partpreview  # optional: render the static thumbnails INTO that build
pnpm preview             # serves all of dist/ at /flexo/
```

Then open `http://localhost:4173/flexo/apps/partpreview/?part_id=<id>` — **with the trailing
slash** (see [Embed a part](#2-embed-a-part) for why; without it you get the main editor).

Building only the mini app (`vite build apps/partpreview`) is safe for the main app — it never
empties `dist/` — but it *does* empty `dist/apps/partpreview/`, discarding any captured
[thumbnails](#part-thumbnails) and the manifest patch that names them; and the page will 404 on
meshes and textures unless a main-app build has already produced `dist/ksa/`, `dist/hdr/` and
`dist/basis/`. There is deliberately no `vite preview
apps/partpreview`: it would serve only `dist/apps/partpreview/`, which carries no asset copy.

---

## The wiki-facing contract

This is the part an external consumer reads. Two URLs, three query params.

### 1. Enumerate what can be embedded

```
GET https://meow.science.fail/flexo/apps/partpreview/manifest.json
```

```json
{
  "part_ids": ["CoreCommandA_Prefab_MediumCapsuleVariantA", "…"],
  "skybox_ids": ["room", "kloofendal", "…"],
  "ksa_build": "2026.7.10.5056",
  "thumbs": {
    "CoreCommandA_Prefab_MediumCapsuleVariantA": [
      "https://meow.science.fail/flexo/apps/partpreview/assets/thumbs/CoreCommandA_Prefab_MediumCapsuleVariantA_01.png",
      "… 10 URLs in angle order …"
    ]
  },
  "partgifs": {
    "CoreCommandA_Prefab_MediumCapsuleVariantA": "https://meow.science.fail/flexo/apps/partpreview/assets/gifs/CoreCommandA_Prefab_MediumCapsuleVariantA.gif"
  }
}
```

| Key           | Meaning                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `part_ids`    | Every `part_id` the viewer accepts, `localeCompare`-sorted and deduplicated (143 at build `2026.7.10.5056`). Produced by the app's own parser — see [The manifest](#the-manifest).        |
| `skybox_ids`  | Every `skybox_id` the viewer understands — all **nine** environment presets, `'room'` included. `'room'` is the procedural studio (no sky), i.e. the default; it is listed so a wiki can round-trip whatever value it read back into a URL. |
| `ksa_build`   | The KSA build the catalog data was parsed from (the `build` field of the private asset tree's `version.json`), or `null` if unavailable. This is the **cache-busting handle**: when it changes, the game data changed, so re-fetch the manifest and invalidate any cached embed/thumbnail. |
| `thumbs`      | **Optional.** Part id → the 10 full URLs of its pre-rendered turntable PNGs, in angle order (index 0 = the default view). Keys are `localeCompare`-sorted; a part with no renderable geometry has **no entry**, so always test for the key. Absent entirely from a plain build — see [Part thumbnails](#part-thumbnails). |
| `partgifs`    | **Optional.** Part id → the full URL of that part's animated turntable GIF (one string, not an array): the same 10 frames played as a looping animation (4 s by default). Same key set as `thumbs` on a complete run, same optionality — always test for the key. |

### 2. Embed a part

```html
<iframe src="https://meow.science.fail/flexo/apps/partpreview/?part_id=<id>[&skybox_id=<id>][&connectors=1][&measure=1]"></iframe>
```

| Param        | Required | Effect                                                                                       |
| ------------ | -------- | -------------------------------------------------------------------------------------------- |
| `part_id`    | yes      | The Part to render. Must be one of `manifest.json`'s `part_ids`.                              |
| `skybox_id`  | no       | Light the part with that HDR environment. The sky itself stays **hidden** — the part renders over the solid charcoal background until a viewer turns **Show sky background** on in the Lighting dialog. |
| `connectors` | no       | `1` or `true` shows the connector marker cubes (editor affordances; off by default).           |
| `measure`    | no       | `1` or `true` shows the part's extents — a wireframe box plus a `x × y × z m` readout (off by default). |

**Keep the trailing slash** on `…/partpreview/`. It is a directory, so `…/partpreview?part_id=x`
is not a file path: a static host either 404s it or — as Vite's `preview` server and any
SPA-fallback host do — rewrites it to the site's root `index.html`, which silently serves the
**main flexo editor** instead of this app. The symptom is the full editor loading in the
iframe, with no error to explain it.

Every other look-and-feel value is fixed to flexo's `DEFAULT_LIGHTING` (exposure 0.85,
`neutral` tone mapping, environment intensity 1, no background blur, **no visible sky**) so
a wiki render matches the in-app part preview.

### 3. How it degrades

| Situation                                | Result                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skybox_id` unknown, absent, or `room`   | **No HDR at all**: the procedural studio environment (zero download) lights the part, over the solid charcoal background. Never an error.                  |
| `part_id` unknown                        | Inline centered message `Unknown part id "…"`. **No WebGL context is created** — an unknown id costs nothing.                                              |
| `part_id` absent                         | Inline usage hint: `Missing "part_id"` + `?part_id=<id>&skybox_id=<id>`.                                                                                  |

### 4. Host prerequisites (outside this repo)

These are properties of whatever serves `meow.science.fail`, not of this codebase:

- **Framing must be allowed.** The response for
  `/flexo/apps/partpreview/` must not carry an `X-Frame-Options: DENY/SAMEORIGIN` or a
  `Content-Security-Policy: frame-ancestors` that excludes the wiki's origin. Nothing in
  this repo emits those headers, but a CDN or host default can.
- **CORS, only if the wiki fetches the manifest from the browser.** If the wiki reads
  `manifest.json` server-side or at wiki-build time, nothing is needed. If it fetches it
  from page JS on another origin, the host must send
  `Access-Control-Allow-Origin` for that file.
- **CORS again, if the iframe is sandboxed without `allow-same-origin`** — see below.

GitHub Pages, the actual host, satisfies both: it returns
`access-control-allow-origin: *` on every response (verified against
`https://meow.science.fail/flexo/`).

### 5. Sandboxing

The iframe may be sandboxed, **including without `allow-same-origin`**. The app never
requires storage: it reads no persistent store, and `@nanostores/persistent` (pulled in
transitively) wraps its `localStorage` access in a try/catch and falls back to an
in-memory engine when the browser throws on an opaque origin. Verified end-to-end at
200×200 and 800×400 against the production build with `sandbox="allow-scripts"`, from a
cross-origin host page: `localStorage` genuinely throws `SecurityError` inside the frame,
the part still renders, and the only console output is a benign 404 for the
non-existent `CoreIVAPropAGameData.xml` (an optional GameData sibling the catalog loader
treats as absent — the main app does the same).

What *is* required:

- `allow-scripts` — it is a JS app.
- WebGL must not be blocked (no `Permissions-Policy` or browser flag disabling it).
- **The host must send `Access-Control-Allow-Origin` for the app's own `assets/*.js`
  and `assets/*.css`.** This is a browser rule, not a flexo one: dropping
  `allow-same-origin` gives the framed document an **opaque origin**, and an
  `<script type="module">` is always fetched in CORS mode, so even the app's own
  same-host bundle becomes a cross-origin request sent with `Origin: null`. Without the
  header the frame renders blank with
  *"has been blocked by CORS policy"*. GitHub Pages sends it; **`vite preview` does
  not**, so when reproducing this locally either add `allow-same-origin` or serve
  `dist/` from a static server that sets `Access-Control-Allow-Origin: *`.

`allow-same-origin` itself is not needed and can be safely omitted.

### 6. A caution about `skybox_id`

The eight HDR skyboxes are 4k equirectangular `.hdr` files of **17–27 MB each**. That is
a heavy price for a 200×200 thumbnail, and it is paid on every uncached embed. The
default (no `skybox_id`) downloads **none of it** — the studio environment is generated
procedurally in the browser. Use `skybox_id` for large "hero" embeds, not for grids of
small thumbnails.

---

## Controls

Identical to flexo's own viewports — this is stock `OrbitControls`, no gesture was taken
over:

| Action | Input                                          |
| ------ | ---------------------------------------------- |
| Orbit  | left-drag                                      |
| Pan    | right-drag, or two-finger drag on touch        |
| Zoom   | mouse wheel, pinch, or the **+** / **−** buttons |

A floating bar sits in the bottom-right corner: `[−] [+] [⚙]`. The +/− buttons exist for
visitors with no wheel; they scale the camera's distance to the orbit target by 1.25×,
clamped around the framed distance, and count as user interaction (so a late iframe
resize will not re-frame away the zoom just chosen).

The cog opens a compact settings menu (deliberately flat — a submenu has nowhere to go in
a 200×200 iframe, and a react-aria `Menu` owns pointer/keyboard for its items, so a
`Select` or a `Slider` cannot live inside the collection):

| Item              | What it does                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Show → Connectors** | Toggles the connector marker cubes (the `?connectors=1` state).                                                      |
| **Show → Measurements** | Toggles the whole part's extents (the `?measure=1` state).                                                         |
| **Lighting…**     | The modal below — everything about how the part is lit.                                                                  |
| **Reset settings** | Restores what **this embed asked for** (`?skybox_id` / `?connectors` / `?measure`), not `DEFAULT_LIGHTING`.              |

The **Lighting** modal:

| Control                | What it does                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Environment**        | A dropdown over all nine presets. Changes the IBL only — it never touches the sky toggle, so switching between skies while one is shown keeps showing it. |
| **Show sky background** | Draws the environment as the visible background instead of the charcoal fill. **Off by default**, whatever `?skybox_id` says; disabled for **Studio**, which is procedural and has no sky. |
| **Tone mapping**, **Exposure**, **Reflections**, **Sky blur** | Same ranges/steps as the editor's View menu.                              |

All of it writes to plain in-memory atoms in `apps/partpreview/src/settings.ts` that live
and die with the page. The mini app is served from the **same origin** as the editor, so
it must never touch the persistent `$lighting` / `$connectorSettings` stores — that would
leak a user's editor settings into a wiki render, or clobber them on write.

Framing on load: the part's bounding sphere spans **90%** of the viewport's *limiting*
dimension (`fillFraction: 0.9`, aspect-aware), so nothing is cropped on the other axis.

### The orientation triad

A labelled **X / Y / Z** arrow triad sits in the top-left corner and spins with the camera,
so a viewer can always tell which way the part faces. It is `src/three/AxisGizmo.ts`,
enabled by the viewport's `axisGizmo` option (off elsewhere — the in-app Part browser popup
shows none).

It is **not** in the scene: it owns a private scene + orthographic camera and is drawn in a
second pass after the main render (`autoClear` off, depth cleared, a corner
`setViewport`), so it can never influence framing, bounds or the environment. Its
materials are unlit and `toneMapped: false`, which is what makes the rendered arrows come
out at exactly the hex in `src/three/axisColors.ts` — the single source of truth shared
with the HTML readout below, so a red arrow in one always names the same axis as the red
arrow in the other.

three's own `three/addons/helpers/ViewHelper.js` does the same trick, but hardcodes a
**128px** square — over half the width of a 200×200 embed — and carries a click-to-snap
animation path this has no use for. Here the square is `20%` of the smaller viewport side,
clamped to 44–84px, and it hides itself outright if it would not fit.

**Measurements** is one toggle and nothing else. It measures the **whole part** — there is
no selection here to measure a subset of — as a world-axis-aligned box computed
**per-vertex** (`computeSelectionBounds(objects, 'world', precise)`, i.e. the editor's
_Accurate_ path, hardcoded: transforming each mesh's cached AABB instead would over-report a
rotated SubPart). Connector markers are excluded whether or not they are shown; they are
editor affordances, not part geometry. The box is a plain cyan wireframe drawn on top of the
part (the same `SELECTION_COLOR` as the editor's selection-bounds box) and it never
influences framing. There are deliberately **no** precision, orientation (world/oriented) or
unit options: the mini app is always accurate, always world-aligned, and always meters
(KSA-native).

The dimensions read out as one line of **HTML** centered along the bottom edge — the
editor's three floating per-axis labels are unreadable at 200×200. Real DOM, not canvas, so
the text can be selected; and it is a react-aria `Button` (ghost — no background until
hover/focus) whose whole job is to **copy `x × y × z m` to the clipboard**, confirmed by a
✓ for 1.2s. Each number is prefixed by a small arrow in its axis color
(`AXIS_COLOR_CSS`), pointing the way that axis projects on screen in the default framing:
→ X, ↑ Y, ↙ Z. A clipboard write can be refused (an iframe without
`allow="clipboard-write"`, or an insecure context) — that is caught and simply shows no ✓;
nothing else changes.

While the catalog XML and then the meshes/textures download, a thin aggregate progress bar
hugs the bottom edge (indeterminate for the catalog phase, which reports no byte totals;
"x of y MB" once real downloads are tracked).

---

## Sharing the main app's assets

The mini app fetches the KSA catalog tree (`ksa/`), the HDR environments (`hdr/`) and the
KTX2 transcoder (`basis/`) from the **main** app's copy. `dist/apps/partpreview/` contains
only `index.html`, `assets/` and `manifest.json` — deliberately **no** `ksa/`, `hdr/` or
`basis/` copy.

The mechanism is one module:

```ts
// src/assetBase.ts
export function assetBase(): string {
  return import.meta.env.VITE_ASSET_BASE || import.meta.env.BASE_URL
}
```

Three call sites use it instead of `import.meta.env.BASE_URL` directly —
`src/ksa/catalog.ts` (`toUrl`, i.e. every catalog/mesh/texture URL),
`src/three/textureSupport.ts` (the KTX2 transcoder path) and
`src/three/SceneEnvironment.ts` (the HDR path). `VITE_ASSET_BASE` is never set for the
main app, so there `assetBase() ≡ BASE_URL` and behavior is unchanged.

**It must be called inside a function body**, never evaluated at module scope: the
`catalog.ts → partCatalog.ts → partXmlParser.ts` chain is imported from **Node** by the
manifest plugin, where `import.meta.env` does not exist.

Dev vs build for the mini app:

|                    | dev (`pnpm dev:partpreview`)                                          | build (`vite build apps/partpreview`)                             |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `VITE_ASSET_BASE`  | `'/flexo/apps/partpreview/'` (its own base — it serves everything itself) | `'/flexo/'` (the main app's copy)                                  |
| `ksa/`             | `ksaAssets()` plugin included → served from `KSA_ASSETS_DIR` at `${base}ksa/` | plugin **omitted**, so nothing is duplicated into the mini outDir |
| `hdr/`, `basis/`   | `publicDir` pointed at the repo's `public/` → served under the mini base | `publicDir: false` — nothing copied                                |
| `manifest.json`    | served on demand by the `previewManifest` plugin's dev middleware        | written by its `writeBundle`                                       |

One supporting detail: Vite looks for `.env` files in `envDir`, not `root`. The mini
config sets `envDir` to the repo root so the shared root `.env` (which defines
`KSA_ASSETS_DIR`) is found from `apps/partpreview/`, and both `ksaAssets` and
`previewManifest` resolve it via `loadEnv(config.mode, config.envDir, '')`.

See [asset-pipeline.md](./asset-pipeline.md) for the `KSA_ASSETS_DIR` tree itself.

---

## The manifest

`vite/previewManifest.ts` writes `dist/apps/partpreview/manifest.json` in `writeBundle`
(a plain write rather than `this.emitFile`, so the file lands *after* `emptyOutDir` has
run) and serves the same bytes from dev middleware.

The part list is **not** re-derived with a bespoke rule. The plugin reads the same
`ASSET_FILES` the browser fetches out of `KSA_ASSETS_DIR`, parses them with
`@xmldom/xmldom` (DOM-core compatible for the APIs the parser uses), and feeds each
`Document` through the app's **own** `parsePartsFile` from `src/ksa/partCatalog.ts`. So
"a part exists" has exactly one definition — `<Part Id>` present and at least one
renderable placement — and the manifest can never advertise a part the viewer rejects, or
hide one it accepts. GameData siblings are irrelevant here: they merge data into existing
entries but never add parts.

Two robustness details: a BOM before the `<?xml?>` declaration is stripped (the browser's
fetch drops it; `@xmldom` rejects it), and ids are de-duplicated defensively even though
Core repeats none.

`skybox_ids` comes from `ENVIRONMENT_PRESETS` in `src/state/environmentPresets.ts` — a
deliberately dependency-free module (no nanostores, no `import.meta.env`, no browser
globals) extracted so Node can import it; `lightingStore.ts` re-exports it, so no existing
call site changed.

If `KSA_ASSETS_DIR` is unset or missing, the plugin warns loudly and emits nothing, so the
open-source CI without the private asset repo still builds. A missing or malformed
`version.json` degrades `ksa_build` to `null` and never fails the build.

**The anti-drift guard** is `vite/previewManifest.test.ts` (gated on `KSA_ASSETS_DIR`,
like the other real-asset tests). Besides checking the shape, the id count, known Core
prefab ids and the `ksa_build` format, it re-parses the same bytes with the **browser**
`DOMParser` (vitest runs under happy-dom) and asserts an identical id list. That is a
genuinely independent, non-xmldom parse: if the two DOM implementations ever disagreed
about `<Part Id>` or renderable placements, the manifest would silently diverge from what
the viewer accepts.

---

## Part thumbnails

Alongside the live embed, the build can produce **static PNG turntables**: 10 angles per
part, 36° apart, at `dist/apps/partpreview/assets/thumbs/<part_id>_NN.png` (`NN` = `01`…`10`),
plus **one animated GIF per part** at `assets/gifs/<part_id>.gif` — the same 10 frames as a
looping animation, 4 seconds per revolution by default. They exist so a wiki can show a grid of parts without booting 143 WebGL
contexts.

```sh
pnpm build                # always first — the capture renders dist/, not src/
pnpm thumbs:partpreview   # ~42 s for all 143 parts on a laptop (GIFs included)
pnpm thumbs:partpreview:check # fast PNG-only validation of one representative part
```

Requires **ffmpeg** on `PATH` for the GIFs (`brew install ffmpeg`,
`sudo apt-get install -y ffmpeg`); the script checks for it up front and `--no-gif` opts out.

| | |
| --- | --- |
| **Angle 01** | The embed's default view — same camera direction (`DEFAULT_VIEW_DIR`), same aspect-aware fill — so a thumbnail and the iframe that replaces it agree. Two knobs move it, and only for the capture: `--view-dir x,y,z` puts the camera somewhere else (the remaining angles follow), `--rotate x,y,z` turns the part itself. |
| **Angles 02–NN** | The **camera** orbited about world Y through the framed target, in `THUMB_STEP_DEG` steps, so the half-way frame is the back view. Object transforms are never touched, so the world-fixed key light sweeps across the part over the sequence (that reads as shape; the dominant studio IBL is soft). |
| **Look** | The mini app's default and nothing else: `DEFAULT_LIGHTING`, the procedural studio environment, opaque charcoal background, **no** connectors, **no** axis triad, **no** measurement box, no UI. |
| **Size** | `DEFAULT_THUMB_SIZE` square (currently 400×400) by default; `--width`/`--height` change the output size. Capture runs at `THUMB_PIXEL_RATIO` 2, producing an internal 800×800 WebGL frame that is downsampled with high-quality browser filtering before the 400×400 PNG is encoded. The live renderer uses the same capped 2× device pixel ratio. Headless Chromium otherwise runs at device scale 1; the old capture therefore used one-quarter as many samples and looked pixelated at the same output size. Those constants live in `apps/partpreview/src/thumbsSpec.ts`; the deploy workflow runs the script with no flags. GIFs consume the already-downsampled PNGs, so their dimensions and file budget remain unchanged. |
| **The GIF** | The same frames, in the same order, at `THUMB_COUNT / --gif-seconds` fps (10 ÷ 4 s = 2.5 fps by default), looping forever. ffmpeg muxes it with a two-pass palette (`palettegen stats_mode=full` → `paletteuse dither=bayer`): one global palette over all frames, so colors don't crawl as the part spins, and an ordered dither that keeps a dark render from banding without shimmering. ~120 kB each, ~17 MB for the set. |

### How it works

`scripts/capture-part-thumbs.ts` (a **vanilla Node 24** script — no Bun, no transpiler; see
[scripts/README.md](../scripts/README.md)) serves the repo's `dist/` at
`http://127.0.0.1:<port>/flexo/` exactly as production does, then drives **one** headless
Chromium page through the whole run: `apps/partpreview/capture.html` — a second Vite input,
a bare host div and no React — boots the catalogs once, builds one `PartPreviewViewport`,
and exposes `window.__flexoCapture.capturePart(id)`, which loads the part and returns 10 PNG
data URLs. One page, one WebGL context, one catalog parse, and the module-level
geometry/material/texture caches make repeated SubParts free; per angle the cost is a single
render plus `canvas.toDataURL`.

The renderer is deliberately the app's **own** viewport code, so a thumbnail cannot drift
from what the live embed shows. The names, the URL shape, the angle count and the
`window.__flexoCapture` contract all come from one dependency-free module,
`apps/partpreview/src/thumbsSpec.ts`, imported by the page, the Node driver and its unit
test alike.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--width`, `--height` | `DEFAULT_THUMB_SIZE` (400) | Final PNG dimensions. WebGL renders each axis at `THUMB_PIXEL_RATIO` (2) before a high-quality downsample, and the first PNG's IHDR is verified against the requested 400×400 default. |
| `--view-dir x,y,z` | `DEFAULT_VIEW_DIR` | World-space camera direction for angle 01, unnormalized — `y` is the elevation, the `x`/`z` ratio picks the starting side, and the distance still comes from the part's own framing. The turntable spins it about world Y, so a direction with no horizontal component (`0,1,0`) is rejected rather than silently rendering identical frames. Handy for auditing an orientation: `--parts <id> --no-gif --view-dir 1,0.25,1`. |
| `--rotate x,y,z` | `DEFAULT_PART_ROTATION_DEG` (`0,0,90`) | Rotates the **part** (XYZ Euler, degrees) before the camera frames it — the only way to change which way it FACES. The default stands parts modeled along +X nose-up. `--view-dir` cannot do this: the turntable orbits about world Y, so a part lying on its side reads that way from every angle. |
| `--site-origin` | `https://meow.science.fail` | Origin the manifest URLs are built from. |
| `--parts a,b,c` | all `part_ids` | Capture a subset (debugging). Unknown ids are a hard error. `pnpm thumbs:partpreview:check` applies this filter to `CoreCouplingA_Prefab_DockingPort1WA` and adds `--no-gif` for a quick visual-quality pass. Without `--no-gif`, GIFs are still (re-)made for every part with a complete frame set on disk — it costs ~1.3 s and keeps every GIF consistent with its frames. |
| `--skip-existing` | off | Skip parts whose 10 PNGs already exist, and parts whose GIF already exists — resumes a partial run. |
| `--gif-seconds <s>` | `4` | Length of one full GIF loop, i.e. one revolution. The frame rate follows (`10 / s`). |
| `--no-gif` | off | Skip GIF synthesis entirely; ffmpeg is then not needed. A previous run's `partgifs` entries are kept. |
| `--verbose` | off | Forward every page console message, not just errors. |

One 404 is normal and is now reported as a note rather than an error: the catalog fetches a
`<Base>GameData.xml` sibling for every asset file, and `CoreIVAPropAAssets.xml` has none.
Chromium's console line for it carries no URL, so the driver drops that message and reports
404s from the network layer instead — absent GameData siblings as an expected-note, anything
else as a `WARNING` naming the path.

A part that loads but has **no renderable geometry** is reported and skipped without failing
the run: `KittenBackPackPart`'s only placement instances `<SubPart Id="KittenBackPackSubPart"/>`,
which carries no mesh, so the live embed renders it just as empty. Any other failure fails
the run (exit 1) — every other `part_id` is renderable by construction, so a failure is a
real bug, and CI must not publish a manifest with holes in it.

### Lifecycle — mind the order

`vite build apps/partpreview` runs with `emptyOutDir`, which **wipes the thumbnails, the GIFs
and the patched manifest**. The order is always `pnpm build` → `pnpm thumbs:partpreview`,
never the reverse, and never a mini-app rebuild afterwards. Consumers must therefore treat
`thumbs` and `partgifs` as optional: a plain build emits a manifest without either.
`ksa_build` remains the cache-busting handle for both, exactly as for embeds.

Production gets them because `.github/workflows/deploy.yml` installs Playwright's Chromium
**and ffmpeg** (neither is on the runner image) and runs the capture **between** the build
and the Pages upload — `dist/` only ever exists inside that job.

Design + rejected alternatives (per-part navigation, headless-gl, a build plugin):
`plans/PART_PREVIEW_THUMBS.md`.

---

## Adding another mini app

The `apps/` → `dist/apps/` pattern is the reusable groundwork. To add `apps/<name>/`:

1. Create `apps/<name>/` with an `index.html`, a `vite.config.ts` (copy
   `apps/partpreview/vite.config.ts`: `base: '/flexo/apps/<name>/'`, `envDir` at the repo
   root, `publicDir` only in `serve`, `build.outDir` under `dist/apps/<name>` with
   `emptyOutDir: true`), a `tsconfig.json` extending `../../tsconfig.app.json` with its own
   `tsBuildInfoFile`, and `src/`.
2. Add one line to the root `package.json` `build` script:
   `… && vite build apps/<name>`, plus a `dev:<name>` script if useful.
3. Add `{ "path": "./apps/<name>" }` to the root `tsconfig.json` `references` so
   `pnpm typecheck` covers it.

oxlint and oxfmt pick up `apps/` automatically (their ignore patterns only exclude `dist`
and `public`), and `tsconfig.node.json` already includes `apps/*/vite.config.ts`. A mini
app's `app.css` must `@import '../../../src/index.css'` and declare `@source` for
`src/ui/kit` and its own `src`, because Tailwind v4 resolves sources relative to the CSS
file.

---

## Limits / out of scope

- **Built-in Parts only.** No custom or user-authored parts, no kittens, no animations, no
  IVA modes — the viewer resolves `part_id` against the Core Part catalog and nothing else.
- **Thumbnails are a build-adjacent extra, not a service.** `pnpm thumbs:partpreview`
  pre-renders PNGs into `dist/` after a build (see [Part thumbnails](#part-thumbnails));
  there is no on-demand image endpoint, no transparent-background variant, and nothing is
  rendered server-side at request time.
- **No deep links back into flexo.** The preview does not offer "open this part in the
  editor", and the editor does not link out to it.
- **No wiki-side code.** Enumerating the manifest, laying out the iframes and caching on
  `ksa_build` are the wiki's job.
- The HDR environments are shared with the editor at full 4k; no downsized variants are
  emitted for small embeds.
