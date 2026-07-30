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
  "ksa_build": "2026.7.10.5056"
}
```

| Key           | Meaning                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `part_ids`    | Every `part_id` the viewer accepts, `localeCompare`-sorted and deduplicated (143 at build `2026.7.10.5056`). Produced by the app's own parser — see [The manifest](#the-manifest).        |
| `skybox_ids`  | Every `skybox_id` the viewer understands — all **nine** environment presets, `'room'` included. `'room'` is the procedural studio (no sky), i.e. the default; it is listed so a wiki can round-trip whatever value it read back into a URL. |
| `ksa_build`   | The KSA build the catalog data was parsed from (the `build` field of the private asset tree's `version.json`), or `null` if unavailable. This is the **cache-busting handle**: when it changes, the game data changed, so re-fetch the manifest and invalidate any cached embed/thumbnail. |

### 2. Embed a part

```html
<iframe src="https://meow.science.fail/flexo/apps/partpreview/?part_id=<id>[&skybox_id=<id>][&connectors=1]"></iframe>
```

| Param        | Required | Effect                                                                                       |
| ------------ | -------- | -------------------------------------------------------------------------------------------- |
| `part_id`    | yes      | The Part to render. Must be one of `manifest.json`'s `part_ids`.                              |
| `skybox_id`  | no       | Use that HDR environment as the IBL **and** the visible background.                           |
| `connectors` | no       | `1` or `true` shows the connector marker cubes (editor affordances; off by default).           |

Every other look-and-feel value is fixed to flexo's `DEFAULT_LIGHTING` (exposure 0.85,
`neutral` tone mapping, environment intensity 1, no background blur) so a wiki render
matches the in-app part preview.

### 3. How it degrades

| Situation                                | Result                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skybox_id` unknown, absent, or `room`   | **No skybox**: the procedural studio environment (zero download) lights the part, over the solid charcoal background. Never an error.                     |
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
a 200×200 iframe):

| Item              | What it does                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Environment**   | Single-select over all nine presets. Picking a sky also turns its background on; picking **Studio** clears it.            |
| **Show → Connectors** | Toggles the connector marker cubes (the `?connectors=1` state).                                                      |
| **Show → Sky background** | Toggles the sky as a visible background. Disabled for **Studio**, which has no sky.                              |
| **Lighting…**     | A modal with tone mapping, exposure, reflections (environment intensity) and sky blur — same ranges/steps as the editor's View menu. |
| **Reset settings** | Restores what **this embed asked for** (`?skybox_id` / `?connectors`), not `DEFAULT_LIGHTING`.                           |

All of it writes to plain in-memory atoms in `apps/partpreview/src/settings.ts` that live
and die with the page. The mini app is served from the **same origin** as the editor, so
it must never touch the persistent `$lighting` / `$connectorSettings` stores — that would
leak a user's editor settings into a wiki render, or clobber them on write.

Framing on load: the part's bounding sphere spans **90%** of the viewport's *limiting*
dimension (`fillFraction: 0.9`, aspect-aware), so nothing is cropped on the other axis.

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
- **No screenshot or thumbnail generation.** The mini app renders live in the visitor's
  browser; it produces no images server-side.
- **No deep links back into flexo.** The preview does not offer "open this part in the
  editor", and the editor does not link out to it.
- **No wiki-side code.** Enumerating the manifest, laying out the iframes and caching on
  `ksa_build` are the wiki's job.
- The HDR environments are shared with the editor at full 4k; no downsized variants are
  emitted for small embeds.
