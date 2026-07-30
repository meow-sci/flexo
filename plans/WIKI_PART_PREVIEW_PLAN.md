# Wiki Part Preview — Plan

A new family of **mini apps** built into `dist/apps/<name>/`, each a self-contained SPA that
shares the main app's static assets. The first is **`dist/apps/partpreview`**: a tiny 3D viewer
that renders one built-in KSA Part (chosen by `?part_id=`) with orbit/zoom/pan, optional HDR
skybox (`?skybox_id=`), floating zoom buttons, and a download progress bar — designed to be
embedded by an external wiki in small iframes (~200×200) and enumerated via a build-produced
`manifest.json` listing every supported `part_ids` / `skybox_ids`.

**Hard constraints** (from the request):

- The main Flexo app at `dist/` root MUST remain unchanged in behavior and stay the repo's focus.
- The mini app is a completely separate standalone Vite build — no shared chunks, no MPA entry
  added to the main build.
- It MUST reuse the same static assets (models, textures, HDRs, transcoder) — no duplication.
- MUSTs: `part_id` query param drives the model; skybox only when `skybox_id` names an existing
  preset; download progress bar; react-aria widgets matching the current look-and-feel (sized
  down); default framing = part fills 90% of the viewport; build emits
  `{ "part_ids": [...], "skybox_ids": [...] }` JSON.

---

## 1. Current architecture facts this plan builds on

| Fact | Where |
|---|---|
| Single Vite entry, `base: '/flexo/'`, plugins: tailwind v4, react, React Compiler via `@rolldown/plugin-babel`, `ksaAssets()` | `vite.config.ts` |
| KSA assets (catalog XML + GLB/KTX2) served at `${base}ksa/` in dev, copied to `dist/ksa/` on build, sourced from `KSA_ASSETS_DIR` (root `.env` → `flexo-private-assets/assets`) | `vite/ksaAssets.ts` |
| `public/` → `dist/` verbatim: `hdr/` (8 equirect 4k HDRs, 17–27 MB each), `basis/` (KTX2 transcoder), `draco/`, favicon | `public/` |
| Part catalog parsed **at runtime** from game XML: `ASSET_FILES` (16 files) → `parsePartsFile(doc, file, out)` → `CatalogPart[]`; GameData merged after; **all parse fns take a `Document`** (fetch is separate) | `src/ksa/catalog.ts`, `src/ksa/partCatalog.ts` |
| Asset URLs built from module-level `KSA_BASE = \`${import.meta.env.BASE_URL}ksa/\`` | `src/ksa/catalog.ts:89` |
| Whole-part 3D preview: own Scene/Camera/WebGLRenderer/OrbitControls/`SceneEnvironment`/`RenderLoop`; `setPart(part, index)` assembles `SubPartObject`s + `ConnectorObject`s; `frame()` fits camera to bounding sphere (`distance = r / sin(fov/2) × 1.3`, vertical fov only) | `src/three/PartPreviewViewport.ts` |
| Geometry/material/texture/HDR caches are module-level singletons shared by all viewports; KTX2 transcoder path = `${BASE_URL}basis/` | `src/three/MeshAtlasCache.ts`, `MaterialFactory.ts`, `TextureCache.ts`, `envCache.ts`, `textureSupport.ts:27` |
| Environment presets (`'room'` procedural + 8 HDR ids) + `LightingSettings`; `$lighting` is `persistentJSON` | `src/state/lightingStore.ts` |
| `SceneEnvironment.apply(settings)` — tonemapping, PMREM env, HDR background vs solid charcoal; HDR fetched from `${BASE_URL}hdr/` | `src/three/SceneEnvironment.ts:56` |
| Download progress: `$loadProgress` + `trackDownload` (nanostores, framework-free); `withProgress` adapts three loaders; UI uses raw react-aria `ProgressBar` | `src/state/loadProgressStore.ts`, `src/three/trackedLoad.ts`, `src/ui/LoadProgress.tsx` |
| `@nanostores/persistent` wraps `typeof localStorage` in try/catch → safe fallback to in-memory engine in sandboxed iframes (verified in `node_modules/@nanostores/persistent/index.js`) | — |
| TS: project refs `tsconfig.app.json` (src, DOM lib) + `tsconfig.node.json` (vite configs, **no DOM lib**); `build` = `tsc -b && vite build` | `tsconfig*.json`, `package.json` |
| `@xmldom/xmldom` is already a dependency | `package.json` |

---

## 2. Key design decisions

### 2.1 Separate Vite build, not an MPA entry

A second HTML input in the main config (`rollupOptions.input`) would reshape the main app's
chunk graph (shared modules split into common chunks) — violating both "core webapp MUST remain
the same" and "completely separate standalone SPA". Instead:

- Mini app lives at **`apps/partpreview/`** (repo top level): own `index.html`, own
  `vite.config.ts`, own `tsconfig.json`, source under `apps/partpreview/src/`.
- `base: '/flexo/apps/partpreview/'`, `build.outDir: ../../dist/apps/partpreview`
  (`emptyOutDir: true` — explicit because outDir is outside the mini root; it only empties that
  subfolder, never `dist/` itself).
- Build order: main app first (produces `dist/`, wiping the previous `dist/apps/`), then the
  mini app writes into `dist/apps/partpreview/`.
- Cost: three.js etc. is bundled twice (once per app). Accepted — that's what "standalone" means,
  and the mini bundle is served once and cached.

It imports shared code directly from `../../src/…` (same TS/oxlint/oxfmt/React-Compiler
toolchain; relative imports, no path alias needed unless it gets unwieldy).

### 2.2 Asset addressing: `assetBase()` with a `VITE_ASSET_BASE` override

The heavyweight assets must be fetched from the **main** app's paths (`/flexo/ksa/`,
`/flexo/hdr/`, `/flexo/basis/`), but three call sites hardcode `import.meta.env.BASE_URL`,
which for the mini app is `/flexo/apps/partpreview/`. Introduce one tiny module:

```ts
// src/assetBase.ts
/** Base URL for the shared static assets (ksa/, hdr/, basis/). Defaults to the app's own
 *  BASE_URL; a mini app built under a nested base sets VITE_ASSET_BASE to the parent flexo
 *  base so every app shares one copy of the heavyweight assets. */
export function assetBase(): string {
  return import.meta.env.VITE_ASSET_BASE || import.meta.env.BASE_URL
}
```

Call sites switched to `assetBase()` (all inside function bodies — see 2.6 for why that matters):

- `src/ksa/catalog.ts` — delete module-level `KSA_BASE`; `toUrl()` computes it inline.
- `src/three/textureSupport.ts:27` — KTX2 transcoder path.
- `src/three/SceneEnvironment.ts:56` — HDR path.

`loadModelFile.ts` (draco) and `projectShareLink.ts` stay on `BASE_URL` — importer/share are
main-app-only. Main app behavior is identical: `VITE_ASSET_BASE` is never set there, so
`assetBase()` ≡ `BASE_URL`. Declare `VITE_ASSET_BASE?: string` in `src/vite-env.d.ts`.

**Dev/prod matrix for the mini app** (why this needs no other changes):

| | dev (`vite apps/partpreview`) | build |
|---|---|---|
| `VITE_ASSET_BASE` | unset → `assetBase()` = `/flexo/apps/partpreview/` | `define`d to `'/flexo/'` |
| `/…/ksa/*` | `ksaAssets()` plugin included → serves at `${base}ksa/` from `KSA_ASSETS_DIR` | fetched from `/flexo/ksa/` (main build's copy); plugin **omitted** so nothing is duplicated into the mini outDir |
| `hdr/`, `basis/` | `publicDir: '../../public'` → served at the mini base | fetched from `/flexo/hdr|basis/`; `publicDir: false` so nothing is copied |

One small plugin fix required: `ksaAssets` resolves `KSA_ASSETS_DIR` via
`loadEnv(config.mode, config.root, '')`, and the mini app's root is `apps/partpreview/` — the
repo-root `.env` would not be found. Change to `loadEnv(config.mode, config.envDir ?? config.root, '')`
(identical for the main app, where `envDir` defaults to root) and set
`envDir: resolve(import.meta.dirname, '../..')` in the mini config.

### 2.3 Skybox & lighting semantics

- `skybox_id` present **and** matches an HDR preset id → that preset as IBL environment **and
  visible background** (`showEnvironmentBackground: true`).
- Absent or unknown → **no skybox**: procedural `'room'` studio environment (zero download,
  matches the neutral look of the part popup) with the solid charcoal background.
- Other settings fixed to `DEFAULT_LIGHTING` values (`exposure 0.85`, `neutral` tonemapping,
  intensity 1, blur 0).

The mini app must NOT subscribe to the persistent `$lighting` store (a user's saved editor
lighting must not leak into wiki renders, and wiki embeds shouldn't depend on storage at all).
See 2.4.

- `skybox_ids` in the manifest = the 8 HDR presets (`kloofendal` … `blue_lagoon_night`).
  `'room'` is excluded: it has no sky to show, and it's already the implicit no-skybox default.

To keep preset data importable from Node (manifest plugin) and pure, extract
`EnvironmentPreset`, `EnvironmentPresetInfo`, and `ENVIRONMENT_PRESETS` from
`src/state/lightingStore.ts` into a new dependency-free `src/state/environmentPresets.ts`;
`lightingStore.ts` re-exports them so no other call site changes.

### 2.4 Reuse `PartPreviewViewport` via a small options object

The popup viewport already does 95% of the job. Add an optional second constructor argument
(defaults preserve today's behavior exactly — the main `PartPreview.tsx` call site does not change):

```ts
export interface PartPreviewViewportOptions {
  /** Store driving environment/tonemapping/background. Default: the global $lighting. */
  lighting?: ReadableAtom<LightingSettings>
  /** Render connector markers (default true, matching the Part browser popup). */
  showConnectors?: boolean
  /** When set, frame() fills this fraction of the LIMITING viewport dimension using
   *  aspect-aware fov (min of vertical/horizontal half-angles). Default: today's
   *  vertical-only `r / sin(fov/2) × 1.3` math, bit-for-bit. */
  fillFraction?: number
  /** Re-run frame() on resize until the user first interacts (orbit/zoom). Default false.
   *  Needed because iframes commonly lay out at 0×0 first and get sized late. */
  reframeOnResize?: boolean
}
```

Plus one public method for the floating buttons:

```ts
/** Multiply the camera's distance to the orbit target by `factor` (clamped). */
zoomBy(factor: number): void
```

(OrbitControls has no public dolly API; scale `camera.position − controls.target`, clamp to a
sane range derived from the framed distance, `controls.update()`, `loop.invalidate()`.)

**90% framing interpretation**: the part's bounding sphere's projected diameter spans 90% of the
viewport's *limiting* dimension — i.e. the part's biggest visible extent fills 90% of the window
without cropping on the other axis. `hHalf = atan(tan(vFov/2) × aspect)`;
`distance = r / (0.9 × sin(min(vHalf, hHalf)))`. For the square iframes this is exactly "90% of
the viewport"; for non-square ones nothing gets clipped.

**Connectors default OFF in the mini app** (`showConnectors: false`): connector gizmo cubes are
editor affordances and read as noise in wiki product shots. Cheap to expose later as a
`?connectors=1` param since the code path exists (📌 review decision, see §8).

Note on storage safety: `@nanostores/persistent` degrades gracefully when `localStorage` throws
(sandboxed iframes), so merely *importing* modules that create persistent stores is safe. The
mini app passes its own plain `atom<LightingSettings>` and never reads `$lighting` /
`$connectorSettings` values.

### 2.5 Mini app structure

```
apps/partpreview/
  index.html            title "flexo part preview"; same viewport/no-pinch-zoom meta as main
  vite.config.ts        see §2.2 matrix; plugins: tailwindcss, react, babel(reactCompilerPreset),
                        ksaAssets (dev only), previewManifest (§2.6)
  tsconfig.json         extends ../../tsconfig.app.json; own tsBuildInfoFile; include: ["src"]
                        (imports pull ../../src modules into the program automatically)
  src/
    main.tsx            createRoot(<App/>), imports app.css
    app.css             @import '../../../src/index.css' (design tokens + reset);
                        @source directives for ../../../src/ui/kit + local src so Tailwind v4
                        sees kit classes outside the mini root
    App.tsx             reads URLSearchParams once (part_id, skybox_id);
                        kicks ensureCatalogLoaded() + ensurePartCatalogLoaded();
                        states: catalog-loading → indeterminate bar; missing/unknown part_id →
                        compact error message; ready → PreviewCanvas + overlays
    lighting.ts         buildLighting(skyboxId: string | null): ReadableAtom<LightingSettings>
                        (validates skyboxId against ENVIRONMENT_PRESETS, file !== null)
    PreviewCanvas.tsx   mounts PartPreviewViewport(host, { lighting, showConnectors: false,
                        fillFraction: 0.9, reframeOnResize: true }); setPart(part, $catalogIndex);
                        exposes the viewport to ZoomControls
    ZoomControls.tsx    two kit `Button`s (iconOnly, size 'sm', lucide Plus/Minus), absolutely
                        positioned bottom-right, calling viewport.zoomBy(1/1.25 | 1.25)
    DownloadProgress.tsx subscribes $loadProgress; ONE compact aggregate react-aria
                        <ProgressBar> (thin bar + "x of y MB"), bottom overlay; isIndeterminate
                        when totals are unknown or during catalog XML fetch
```

Reused from `src/` unchanged: catalog + partCatalog loaders and stores
(`ensureCatalogLoaded`, `ensurePartCatalogLoaded`, `$catalogIndex`, `$partCatalogIndex`),
`PartPreviewViewport` (+ its whole SubPartObject/MaterialFactory/caches stack),
`SceneEnvironment`, `loadProgressStore`/`trackedLoad`, `src/ui/kit` (Button, styles), design
tokens from `src/index.css`.

Sizing: everything compact by construction — `text-xs`, `size:'sm'` buttons (28px), thin (~3px)
progress bar, ~8px margins. No toolbar, no menus, nothing else. Usable at 200×200 by design.
Orbit = left-drag, pan = right-drag / two-finger drag, zoom = wheel / pinch — stock
OrbitControls, identical to flexo's viewports, plus the +/− buttons for mouse-wheel-less users.

Unknown/missing `part_id` renders a centered muted message (`Unknown part id "X"` / usage hint)
— no 3D context is created.

### 2.6 Build-time manifest: `dist/apps/partpreview/manifest.json`

Exact required shape (keys verbatim):

```json
{ "part_ids": ["…"], "skybox_ids": ["kloofendal", "…"] }
```

New Vite plugin `vite/previewManifest.ts` (sibling of `ksaAssets.ts`, typechecked by
`tsconfig.node.json`), registered only in the mini app's config:

- `configResolved`: resolve `KSA_ASSETS_DIR` via `loadEnv(config.mode, config.envDir ?? config.root, '')`
  (same pattern as `ksaAssets` after the §2.2 fix).
- `writeBundle`: for each of the 16 `ASSET_FILES` (imported from `src/ksa/catalog.ts`), read the
  file from `KSA_ASSETS_DIR`, parse with `@xmldom/xmldom`'s `DOMParser` (already a dependency),
  and feed the `Document` (cast — xmldom is DOM-core compatible for the APIs used) through the
  **real** `parsePartsFile` from `src/ksa/partCatalog.ts`. This reuses the exact selection
  semantics of the app (`<Part Id>` present + ≥1 renderable placement → catalog entry), so the
  manifest can never drift from what the viewer accepts. GameData files are irrelevant here —
  they merge data into existing entries but never add parts.
- `part_ids` = collected ids, `localeCompare`-sorted (same as `loadCorePartCatalog`);
  `skybox_ids` = `ENVIRONMENT_PRESETS.filter(p => p.file).map(p => p.id)` from the extracted pure
  module (§2.3).
- Write `manifest.json` into the bundle (`this.emitFile` at `generateBundle`, or a plain write in
  `writeBundle` — pick whichever plays nicer with `emptyOutDir`).
- `KSA_ASSETS_DIR` unset/missing → loud warn and skip, matching `ksaAssets`' behavior so the
  open-source CI (no private assets) still builds.

**Why this works from Node**: after §2.2 removes the module-level
`import.meta.env.BASE_URL` evaluation from `catalog.ts`, nothing in the
`catalog.ts → partCatalog.ts → partXmlParser.ts` import chain touches `import.meta.env` or
browser globals at module scope; the parse functions take `Document` arguments. Two supporting
tweaks:

- Add `"DOM"` to `tsconfig.node.json`'s `lib` (the plugin references the `Document` type;
  no runtime impact) and `apps/*/vite.config.ts` to its `include`.
- Audit the parse chain for `instanceof Element`-style checks that would fail on xmldom objects;
  if any exist, switch to `nodeType` checks (behavior-neutral in the browser).

A vitest (node environment, gated on `KSA_ASSETS_DIR` like the existing real-asset tests)
runs the plugin's core function against the real asset tree and asserts a plausible id count and
a few known ids (e.g. from `CoreStructuralAAssets.xml`) — this is the guard against
xmldom/browser DOM divergence.

### 2.7 Build wiring

`package.json` scripts:

```json
"dev:partpreview": "vite apps/partpreview",
"build": "tsc -b && vite build && vite build apps/partpreview",
"preview": "vite preview"
```

- `vite [root]` / `vite build [root]` auto-discovers `apps/partpreview/vite.config.ts`.
- Main build runs first (its default `emptyOutDir` wipes `dist/` including stale `apps/`), mini
  build then fills `dist/apps/partpreview/`.
- `vite preview` already serves the whole `dist/` at `/flexo/` — nested
  `/flexo/apps/partpreview/index.html` is plain static file serving, so end-to-end prod testing
  works out of the box.
- Root `tsconfig.json` gains a reference to `./apps/partpreview`; `pnpm typecheck` (`tsc -b`)
  covers it. oxlint/oxfmt pick up `apps/` automatically (`ignorePatterns` only excludes
  `dist`/`public`).

Future mini apps repeat the pattern: `apps/<name>/` + one line in the build script.

---

## 3. Wiki-facing contract (document in docs/wiki-part-preview.md)

- Enumerate: `GET https://meow.science.fail/flexo/apps/partpreview/manifest.json`
- Embed: `<iframe src="https://meow.science.fail/flexo/apps/partpreview/?part_id=<id>[&skybox_id=<id>]">`
- Unknown `skybox_id` degrades to no-skybox; unknown `part_id` shows an inline error.
- Host prerequisites (outside this repo, note in doc): the wiki must be allowed to frame the
  page (no `X-Frame-Options`/`frame-ancestors` denial for the wiki origin), and if the wiki
  fetches `manifest.json` from **browser** JS (rather than server-side/at wiki build time), the
  host must send `Access-Control-Allow-Origin` for it.
- iframe `sandbox` works, including without `allow-same-origin` (storage degrades gracefully;
  the app never requires it) — but `allow-scripts` is required, and WebGL must not be blocked.

---

## 4. Implementation phases

### Phase 0 — shared-code refactors (main app: zero behavior change)
1. `src/assetBase.ts` + switch `catalog.ts` / `textureSupport.ts` / `SceneEnvironment.ts` to it;
   `vite-env.d.ts` declaration. (Also unblocks Node import of the catalog parse chain.)
2. Extract `src/state/environmentPresets.ts`; `lightingStore.ts` re-exports.
3. `PartPreviewViewport` options (`lighting`, `showConnectors`, `fillFraction`,
   `reframeOnResize`) + `zoomBy()`; defaults preserve current behavior; `PartPreview.tsx`
   untouched.
4. `ksaAssets.ts`: `config.envDir ?? config.root` for `loadEnv`.
5. Gate: `pnpm typecheck`, `pnpm lint`, `pnpm test`, manual smoke of the Add→Part popup
   (framing, lighting, connectors identical).

### Phase 1 — mini app scaffold
1. `apps/partpreview/` (index.html, vite.config.ts per §2.2/§2.5, tsconfig.json, app.css, empty App).
2. Root tsconfig reference; `tsconfig.node.json` lib/include tweaks; package.json scripts.
3. Gate: `pnpm dev:partpreview` serves a styled shell; `/flexo/apps/partpreview/ksa/PartAssets.xml`
   resolves in dev; `pnpm build` leaves `dist/` main output byte-identical except `dist/apps/`.

### Phase 2 — viewer features
1. Query-param parsing, catalog bootstrap, part resolution, error states.
2. `PreviewCanvas` with the §2.4 options; skybox lighting atom; 90% framing; reframe-on-resize.
3. `ZoomControls` (+/− kit Buttons → `zoomBy`), `DownloadProgress` (aggregate react-aria bar).
4. Gate: Playwright (project-local, per repo convention) at 200×200 and 800×400:
   part-only, part+skybox, unknown part, unknown skybox; wheel-less zoom via buttons.

### Phase 3 — manifest
1. `vite/previewManifest.ts` (§2.6) + xmldom-compat audit of the parse chain.
2. Vitest against real assets (KSA_ASSETS_DIR-gated) validating ids; build emits
   `dist/apps/partpreview/manifest.json` with the exact required keys.

### Phase 4 — docs & polish
1. `docs/wiki-part-preview.md` (§3 contract + how to add future mini apps); touch
   `docs/architecture.md` + `docs/asset-pipeline.md` (VITE_ASSET_BASE, second consumer).
2. Full gate: `pnpm typecheck` / `lint` / `fmt:check` / `test` / `build`, then `pnpm preview`
   end-to-end iframe test against the built `dist/`.

---

## 5. Risks & mitigations

- **xmldom vs browser DOM divergence** in the parse chain → real-asset vitest (§2.6) + audit.
- **Main-app regression from Phase 0** → all refactors are default-preserving; the popup smoke
  test and existing vitest suite gate the phase. (Hashes of main bundles will change because
  shared src files changed; behavior must not.)
- **4k HDRs (17–27 MB) are heavy for 200×200 iframes** → default (no skybox) downloads none;
  documented. Optional later: emit downsized 1k HDR variants for the mini app (deliberately out
  of scope — "reuse the same static assets" wins for now).
- **Tailwind v4 source detection across roots** → explicit `@source` directives in `app.css`.
- **Vite `define` vs `import.meta.env` replacement** → `VITE_ASSET_BASE` is only ever read as a
  plain `import.meta.env.VITE_ASSET_BASE` property (no optional chaining), inside function
  bodies, so static replacement works in both apps and Node never evaluates it.

## 6. Explicitly out of scope

- Any change to the main app's UX or build output beyond the default-preserving refactors above.
- Custom/user parts, kittens, animations, IVA modes in the preview (built-in Parts only).
- Screenshot/thumbnail generation, deep links to flexo, wiki-side code.
- Additional mini apps (the `apps/` + `dist/apps/` pattern is the reusable groundwork).

## 7. Acceptance checklist (mirrors the request)

- [ ] Main flexo app builds/behaves exactly as before; mini app is a separate Vite build.
- [ ] `dist/apps/partpreview/` is a standalone SPA; future apps slot in as `dist/apps/<n>/`.
- [ ] `?part_id=` auto-loads that part; orbit/zoom/pan like flexo; floating +/− zoom buttons.
- [ ] Progress bar for downloads; react-aria widgets, current look-and-feel, sized for ~200×200.
- [ ] Default framing: part fills 90% of the viewport's limiting dimension.
- [ ] `?skybox_id=` uses the skybox when it exists, otherwise no skybox.
- [ ] Build emits `manifest.json` with exact keys `part_ids` + `skybox_ids`.
- [ ] Models/textures/HDRs/transcoder all fetched from the main app's existing static paths.

## 8. 📌 Open questions (defaults chosen, flag if you disagree)

1. **Connector markers** in the wiki preview: default **hidden** (popup shows them; wiki shots
   read cleaner without). Add `?connectors=1` now, later, or never?
2. **Manifest filename/location**: `dist/apps/partpreview/manifest.json` — OK, or prefer a
   different name (e.g. `parts.json`) / an additional copy at `dist/apps/manifest.json` when
   more mini apps exist?
3. **Extra manifest fields**: keep the exact two-key shape, or also include the KSA build id
   (from the private tree's `version.json`) so the wiki can cache-bust per game update?
4. **`skybox_ids` excludes `'room'`** (studio = the implicit no-skybox default). Agreed?
