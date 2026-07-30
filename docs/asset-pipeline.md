# Asset Pipeline & Production Build

How the KSA model/texture/XML assets reach the app, in both `pnpm dev` and the
production build (`pnpm build`).

## How assets are addressed

All runtime code fetches game assets from the `/ksa/` URL prefix, e.g.:
- catalog XML: `/ksa/CoreStructuralAAssets.xml`
- meshes: `/ksa/Meshes/CoreStructuralA_MeshAtlas.glb`
- textures: `/ksa/Textures/CoreStructuralA_TextureAtlas_Diffuse.ktx2`

The KTX2 transcoder worker assets are addressed from `/basis/` and live in
`public/basis/` — Vite copies `public/` into `dist/` automatically, so those work in
the production build already. Only the `/ksa/` assets need the plugin below.

### `assetBase()` — one copy, two consumers

Those three prefixes (`ksa/`, `hdr/`, `basis/`) are **not** resolved against
`import.meta.env.BASE_URL` directly. They go through `assetBase()`
(`src/assetBase.ts`), which returns `import.meta.env.VITE_ASSET_BASE ||
import.meta.env.BASE_URL`. Call sites: `src/ksa/catalog.ts` (`toUrl`, i.e. every
catalog/mesh/texture URL), `src/three/textureSupport.ts` (KTX2 transcoder) and
`src/three/SceneEnvironment.ts` (HDR).

The main app never sets `VITE_ASSET_BASE`, so there `assetBase() ≡ BASE_URL` and nothing
changed. The **second consumer** is the `apps/partpreview/` mini app (see
[wiki-part-preview.md](./wiki-part-preview.md)), whose own base is
`/flexo/apps/partpreview/`: its build `define`s `VITE_ASSET_BASE` to `'/flexo/'` so it
downloads the *main* app's copy of these assets. `dist/apps/partpreview/` therefore
contains **no `ksa/`, `hdr/` or `basis/` copy at all** — its config omits the
`ksaAssets()` plugin on build and sets `publicDir: false`. In dev the mini app serves
them itself under its own base (plugin included, `publicDir` pointed at the repo's
`public/`), which is why `VITE_ASSET_BASE` is its own base there.

`assetBase()` must always be called **inside a function body**, never at module scope:
the `catalog.ts → partCatalog.ts → partXmlParser.ts` chain is imported from Node by the
`previewManifest` Vite plugin, where `import.meta.env` does not exist.

`loadModelFile.ts` (Draco) and `projectShareLink.ts` deliberately stay on `BASE_URL` —
the importer and share links are main-app-only.

## `public/draco/` — the Draco decoder for model import

`public/draco/` holds the committed Draco glTF decoder (`draco_decoder.js`,
`draco_decoder.wasm`, `draco_wasm_wrapper.js`), copied verbatim from
`node_modules/three/examples/jsm/libs/draco/gltf/`. The model importer
(`src/three/loadModelFile.ts`) points `DRACOLoader.setDecoderPath()` at
`${import.meta.env.BASE_URL}draco/`, so a Blender export saved with Draco compression
decodes in the browser. Committed rather than resolved from `node_modules` for exactly
the same reason as `public/basis/`: these are runtime-fetched worker/WASM assets, not
bundled modules, so they must exist as real files under the deployed base path.

**Re-copy them whenever `three` is upgraded** — the decoder and the `DRACOLoader` that
drives it ship as a matched pair, and a stale decoder fails at parse time with an opaque
error:

```
cp node_modules/three/examples/jsm/libs/draco/gltf/* public/draco/
```

(The meshopt decoder needs no such copy — `three/addons/libs/meshopt_decoder.module.js`
is a plain ES module and gets bundled.)

## Source of truth: `KSA_ASSETS_DIR`

The `/ksa/*` files are sourced from a directory named by the **`KSA_ASSETS_DIR`** env
var (set in `.env`, which is gitignored). This points at a **separate private repo**:
flexo is open source, but the licensed binary assets must stay out of it, so they live
elsewhere and are referenced only at dev/build time.

That directory holds a self-contained, pre-pruned asset tree (catalog XML at the root,
`Meshes/`, `Textures/`, etc.) — exactly the layout the app fetches under `/ksa/`.

### Producing `KSA_ASSETS_DIR`: the copy script

`scripts/copy-ksa-assets-to-private-repo.ts` (a Bun script) builds that tree from the
upstream `thirdparty/ksa/Content/Core` checkout. It does the selective pruning so the
Vite plugin doesn't have to:

1. Scans `Content/Core/**/*.xml` and keeps the ones that are a `<Assets>` catalog
   **and** contain `<Part>`/`<SubPart>` elements — dynamically discovering the part
   catalog (no hard-coded filename list).
2. Copies each catalog XML plus its `*GameData.xml` sibling (when present).
3. Parses every catalog + GameData XML for `Path="..."` references to `.glb`, `.gltf`,
   `.ktx2`, and `.dds` files and copies each one, preserving its `Meshes/…` /
   `Textures/…` layout. Referenced files missing on disk are warned + skipped.

This avoids the huge unrelated planet/cloud assets in `Content/Core/Meshes`+`Textures`
(a wholesale copy is multi-GB). Run it with:

```
bun run scripts/copy-ksa-assets-to-private-repo.ts --target <private-assets-dir>
```

## Dev + Build: `vite/ksaAssets.ts` plugin

The `ksaAssets()` plugin resolves `KSA_ASSETS_DIR` in `configResolved` (via Vite's
`loadEnv(mode, root, '')`, since unprefixed env vars are not on `process.env`), then:

- **dev (`configureServer`)** — installs middleware that serves `GET /ksa/*` by
  streaming files from `KSA_ASSETS_DIR`, with a path-traversal guard and per-extension
  `Content-Type`.
- **build (`writeBundle`)** — recursively copies the whole `KSA_ASSETS_DIR` tree into
  `dist/ksa/` (`cpSync`). No XML parsing or filename lists: the copy script already did
  the pruning, so the plugin just mirrors the directory verbatim.

If `KSA_ASSETS_DIR` is unset or the directory is missing, the plugin warns (dev:
`/ksa` requests 404; build: nothing emitted) rather than failing the build/tests.

## Base path / sub-path deploy

The app ships under **`/flexo/`** (`base: '/flexo/'` in `vite.config.ts`), e.g.
`https://meow.science.fail/flexo/`. The `/ksa/`, `/hdr/` and `/basis/` URL prefixes
respect the shared-asset base (`assetBase()` above, which for the main app is
`import.meta.env.BASE_URL`), so they resolve to `/flexo/ksa/…`, `/flexo/hdr/…` and
`/flexo/basis/…`:
- `src/ksa/catalog.ts` (`toUrl`, used by all catalog/mesh/texture URLs),
- `src/three/textureSupport.ts` (KTX2 transcoder path),
- `src/three/SceneEnvironment.ts` (HDR environments),
- `src/three/debugCalibration.ts` (uses `toUrl`).

The `ksaAssets()` dev middleware matches `${base}ksa/` (also base-aware).

Mini apps deploy **under** that base — `apps/partpreview/` is
`base: '/flexo/apps/partpreview/'` with output `dist/apps/partpreview/` — and point
`VITE_ASSET_BASE` back at `/flexo/` so a sub-path deploy still has exactly one copy of
the heavyweight assets.

## CI / deploy

`.github/workflows/deploy.yml` builds and deploys to **GitHub Pages** on every push
to `main`. The `build` job:
1. checks out flexo and the private assets repo (into `.tmp/flexo-private-assets`,
   via an SSH deploy key),
2. sets `KSA_ASSETS_DIR=$GITHUB_WORKSPACE/.tmp/flexo-private-assets/assets`,
3. runs `pnpm install --frozen-lockfile && pnpm run build`,
4. uploads `dist/` as the Pages artifact.

The `deploy` job publishes it. Because flexo is a project page under the org's
custom apex domain (`meow.science.fail`), it's served at `meow.science.fail/flexo/`
— the `/flexo/` path comes from the repo name + Vite `base`, so `dist/` is uploaded
as-is (no nesting). Requires a `FLEXO_PRIVATE_ASSETS_SSH_KEY` repo secret (the
private half of a read-only Deploy Key on `meow-sci/flexo-private-assets`).

## Other considerations
- **Size:** all category atlases ship up front. To shrink, split per-category and
  lazy-load, or convert textures offline (see `plans/FLEXO_TEXTURING.md` appendix).
- **Cache headers / CDN:** atlases are large and content-stable — serve with long
  cache lifetimes.

## Verifying a production build
```
pnpm build
# dist/ksa/ mirrors $KSA_ASSETS_DIR:
#   dist/ksa/CoreStructuralAAssets.xml                              (*Assets.xml)
#   dist/ksa/Meshes/CoreStructuralA_MeshAtlas.glb                  (.glb)
#   dist/ksa/Textures/CoreStructuralA_TextureAtlas_Diffuse.ktx2    (.ktx2)
#   dist/basis/basis_transcoder.wasm                  (copied by Vite from public/)
# the mini apps' own bundles — note there is NO ksa/, hdr/ or basis/ here:
#   dist/apps/partpreview/index.html
#   dist/apps/partpreview/assets/*.js|css
#   dist/apps/partpreview/manifest.json      (part_ids / skybox_ids / ksa_build)
pnpm preview   # serves ALL of dist/ at /flexo/; add a SubPart and confirm it renders
               # textured, then open /flexo/apps/partpreview/?part_id=<id>
```

## Current status
- ✅ Dev (`pnpm dev`): `/ksa/*` served from `KSA_ASSETS_DIR`; `/basis/*` from `public/`.
- ✅ Build (`pnpm build`): `/basis/*` from `public/`; `/ksa/*` emitted by the
  `writeBundle` hook (full `KSA_ASSETS_DIR` tree copied into `dist/ksa/`).
- ✅ Mini apps (`dist/apps/*`): no asset copy of their own — every `ksa/`, `hdr/` and
  `basis/` URL resolves to the main app's `/flexo/` copy via `VITE_ASSET_BASE`.
