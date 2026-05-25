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
`https://meow.science.fail/flexo/`. The `/ksa/` and `/basis/` URL prefixes respect
`import.meta.env.BASE_URL`, so they resolve to `/flexo/ksa/…` and `/flexo/basis/…`:
- `src/ksa/catalog.ts` (`KSA_BASE`, used by all catalog/mesh/texture URLs),
- `src/three/textureSupport.ts` (KTX2 transcoder path),
- `src/three/debugCalibration.ts` (uses `toUrl`).

The `ksaAssets()` dev middleware matches `${base}ksa/` (also base-aware).

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
pnpm preview   # serves dist/; add a SubPart and confirm it renders textured
```

## Current status
- ✅ Dev (`pnpm dev`): `/ksa/*` served from `KSA_ASSETS_DIR`; `/basis/*` from `public/`.
- ✅ Build (`pnpm build`): `/basis/*` from `public/`; `/ksa/*` emitted by the
  `writeBundle` hook (full `KSA_ASSETS_DIR` tree copied into `dist/ksa/`).
