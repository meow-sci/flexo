# scripts

Standalone build/asset utilities for flexo.

**New scripts run on vanilla Node 24+** (`node scripts/<file>.ts` — Node strips
the types itself; no transpiler, no flags, no install step). The
[Bun](https://bun.com)-powered ones below are the older, unmigrated set and need
their own install:

```bash
cd scripts
bun install
```

## capture-part-thumbs.ts (Node)

Renders 10-angle PNG turntables (36° apart, 250×250 by default) of every
built-in KSA Part out of the **built** part-preview mini app, muxes each set into
an animated GIF, and patches its `manifest.json` with the `thumbs` / `partgifs`
URLs:

```bash
pnpm build                # first — the capture renders dist/, not src/
pnpm thumbs:partpreview   # → assets/thumbs/<part_id>_NN.png + assets/gifs/<part_id>.gif
```

One headless Chromium page (Playwright, from the root `node_modules`) drives the
mini app's own `capture.html` + `PartPreviewViewport`, so a thumbnail always
matches the live embed; **ffmpeg** (on `PATH`; checked before any rendering
starts) turns each part's frames into a looping animation (4 s by default). Options
(`--width`/`--height`, `--site-origin`, `--parts`, `--skip-existing`,
`--gif-seconds`, `--no-gif`, `--verbose`) are documented in the script's header
comment and under `--help`. Deliberately **not** part of `pnpm build`, and a
later `vite build apps/partpreview` wipes its output. Context:
[docs/wiki-part-preview.md](../docs/wiki-part-preview.md#part-thumbnails).

## build-cartoon-moon.ts (Bun)

Turns a handful of PNGs into the ready-to-install `ksa-mods/cartoon-moon/` KSA
mod that scatters those images as "cartoon character" ground clutter on a new
moon. Point it at a directory of PNGs (or list files individually):

```bash
bun build-cartoon-moon.ts ../faces
```

All options (`--out`, `--shape quad|cross|cylinder`, `--brightness`, `--bg`,
`--zstd`, clutter density/scale, …) are documented in the script's header
comment. Mod details: [ksa-mods/cartoon-moon/README.md](../ksa-mods/cartoon-moon/README.md).

## copy-ksa-assets-to-private-repo.ts (Bun)

Discovers the KSA Core Part/SubPart catalog and copies it — plus every
GLB/KTX2/GLTF/DDS binary it references and the kitten character directories —
into a target directory laid out for the private assets repo (flexo is open
source; the licensed game binaries stay private and are pulled in at CI build
time):

```bash
bun copy-ksa-assets-to-private-repo.ts --target ../../flexo-ksa-assets
```

Context: [docs/asset-pipeline.md](../docs/asset-pipeline.md).

## sync-test-fixtures.ts (Bun)

Re-copies the vendored KSA asset fixtures in
[`src/ksa/__fixtures__/`](../src/ksa/__fixtures__/README.md) — byte-identical
copies of a curated subset of Core XML, committed so the parser/catalog unit
tests run without the private asset tree — from the live assets. Run it after
any KSA asset update that materially changes a vendored file's structure, then
update the affected parser/catalog code + tests:

```bash
bun run sync-fixtures                                  # uses $KSA_ASSETS_DIR / flexo/.env
bun sync-test-fixtures.ts --src ../flexo-private-assets/assets
```

The fixture set is whatever `*.xml` already lives in `src/ksa/__fixtures__/`
(add one by dropping the file in once). The **"vendored fixtures stay in sync"**
test in `src/ksa/partCatalog.test.ts` fails on any drift when the private tree
is present. Context: [src/ksa/__fixtures__/README.md](../src/ksa/__fixtures__/README.md).
