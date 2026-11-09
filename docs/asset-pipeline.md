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
downloads the _main_ app's copy of these assets. `dist/apps/partpreview/` therefore
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

That directory holds a self-contained asset tree (catalog XML at the root,
`Meshes/`, `Textures/`, etc.) — exactly the layout the app fetches under `/ksa/`.

### Producing `KSA_ASSETS_DIR`

The private repository's Node 24+ entrypoint is `update-from-ksa-build.ts`.
Run it there with the game installation directory (containing `KSA.dll`,
`Content/Core/`, and `Content/Versions/`):

```sh
node update-from-ksa-build.ts /path/to/ksa-game
```

The updater discovers part, subpart, static-object, reaction, and grain XML;
includes GameData-named patch files and the physical-material libraries; follows
binary `Path` attributes; and copies characters, celestial XML, and terrain decals.
It records the highest game revision in `assets/version.json`. Texture paths now
live on top-level `<Texture Id Path Category>` rows; `<PbrMaterial>` slots use
`Ref`, so all referenced definitions must be available to the catalog resolver.

The updater stages the snapshot and runs its locked `uv` environment to convert
2D BC1/BC4/BC5/BC7 atlases to UASTC, regenerating mipmaps. `Textures/Characters/`
retains the game's formats for kitten exports. Cubemaps, arrays, and volumes stay
in their original dimensional formats. It replaces the output only after a
successful copy and conversion. Node and uv are required; the private repository
provides its own Python dependencies and supported KTX binaries.

Standalone inspection in the private repository uses:

```sh
uv run --locked python tools/reencode-textures-uastc.py assets/Textures --dry-run
```

The 5801 mirror already contains the new foil and cloth atlases in UASTC. No
additional conversion is needed for those files. Collision atlases identified by
`<MeshAtlas HostOnly="true">` are copied too, but are excluded from visual mesh
lookup.

The current mirror is about **2.3 GB**, compared with 213 MB in the supplied 5638
mirror. Its broad XML discovery also matches the nested static-object references
in `Astronomicals.xml`, which pulls in planet and cloud payloads. Production selection in `vite/assetSelection.ts` retains all root XML and the
Part/static Path dependencies, plus Character sidecars, animations and tiny ICRP
decals. It omits the unused planetary/cloud binaries without changing the private
mirror. Development continues to stream requested files on demand. See the
[5801 asset audit](../plans/KSA_5801_RENDER_RESEARCH.md) for the measured inventory.

## Dev + Build: `vite/ksaAssets.ts` plugin

The `ksaAssets()` plugin resolves `KSA_ASSETS_DIR` in `configResolved` (via Vite's
`loadEnv(mode, root, '')`, since unprefixed env vars are not on `process.env`), then:

- **dev (`configureServer`)** — installs middleware that serves `GET /ksa/*` by
  streaming files from `KSA_ASSETS_DIR`, with a path-traversal guard and per-extension
  `Content-Type`. `/ksa/mesh-index.json` is generated from the referenced GLB mesh
  names in the current resolved catalog.
- **build (`writeBundle`)** — copies the resources selected by `assetSelection.ts`
  into `dist/ksa/`, then generates `mesh-index.json` from the XML and GLB mesh names.
  Part/static binary references, character aides and animation files remain available;
  the planet/cloud payloads used only by the native game are omitted.

`vite/meshIndex.ts` reads only the GLB JSON chunks to map mesh names to their
owning atlas. It excludes HostOnly collision atlases, catches ambiguous referenced
mesh names, and writes the same index into the build. Model references use glTF
mesh names rather than atlas IDs or assumptions about the source XML file.
The runtime catalog and preview manifest share the resolved content corpus;
see [catalog loading](subpart-catalog.md).

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

- **Size:** every file in the mirror is included in the production artifact; the
  browser fetches the geometry and maps it needs on demand. Check the artifact size
  after changing the private snapshot. UASTC conversion does not remove unrelated
  planet payloads.
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
