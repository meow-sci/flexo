# scripts/ — standalone build/asset utilities

**Runtime rule: NEW scripts here are vanilla Node 24+, not Bun.** Node runs
TypeScript directly by *stripping* types (unflagged since 23.6), CI already has
Node 24, and the repo needs no second runtime. Bun survives only for the
**existing, unmigrated** scripts listed below — do not add to them.

A Node script here must therefore be:

- **erasable-syntax-only** — no enums, no namespaces, no parameter properties,
  no `import x = require()`; the types must simply strip away
  (`erasableSyntaxOnly` in `scripts/tsconfig.json` enforces it);
- **explicit `.ts` extensions** on relative imports (Node ESM resolution), and
  every module it imports transitively must obey the same two rules;
- **Node built-ins only** (`node:http`, `node:fs/promises`, `node:util`
  `parseArgs`, …) plus whatever resolves from the ROOT `node_modules` — new
  dependencies go in the root `package.json`, so a version is pinned once.

This directory is still its own package (`scripts/package.json`, `"type":
"module"`) with its own tsconfig; the flexo app at the repo root is pnpm + Vite
+ vitest, so never apply this file's guidance outside `scripts/`.

## Setup & running

```sh
# Node scripts — run from the REPO ROOT, no install step, no flags:
pnpm thumbs:partpreview                              # = node scripts/capture-part-thumbs.ts

# Bun scripts (legacy):
cd scripts
bun install                                          # once (upng-js + @types/bun)
bun build-cartoon-moon.ts ../faces                   # a dir of PNGs (or individual files)
bun copy-ksa-assets-to-private-repo.ts --target <dir>
```

## The scripts

### Node

- `capture-part-thumbs.ts` — renders 18-angle static WebP turntables of every built-in
  KSA Part out of the BUILT `dist/apps/partpreview/` (headless Chromium via the
  root `playwright`, driving the mini app's own `capture.html` + viewport),
  muxes each set into an animated WebP with **img2webp** (external binary, checked
  up front; `--no-turntable` opts out), and patches that app's `manifest.json` with
  the `thumbs` / `turntables` URLs. Must run AFTER `pnpm build`, and never before
  another `vite build apps/partpreview` (which empties the outDir). Flags are in
  the script header; feature docs:
  [`docs/wiki-part-preview.md`](../docs/wiki-part-preview.md#part-thumbnails).

### Bun (legacy — do not add more)

- `build-cartoon-moon.ts` — packs PNG "character faces" into one shared KTX2
  atlas + per-face GLB cards and regenerates `ksa-mods/cartoon-moon/`, a
  data-only KSA moon mod that scatters the faces as ground clutter. All flags
  (`--out`, `--shape`, `--brightness`, `--zstd`, …) are documented in the
  script's header comment; mod-level docs live in
  [`ksa-mods/cartoon-moon/README.md`](../ksa-mods/cartoon-moon/README.md).
- `copy-ksa-assets-to-private-repo.ts` — discovers the KSA Core Part/SubPart
  catalog plus every binary it references (and the kitten character dirs,
  copied verbatim) and writes them into the private assets repo used at CI
  build time. Context: [`docs/asset-pipeline.md`](../docs/asset-pipeline.md).
- `sync-test-fixtures.ts` — re-copies the vendored KSA asset fixtures in
  `src/ksa/__fixtures__/` (byte-identical Core XML committed so parser/catalog
  tests run without the private tree) from `$KSA_ASSETS_DIR`. Run after a KSA
  asset update that materially changes a vendored file. Context:
  [`src/ksa/__fixtures__/README.md`](../src/ksa/__fixtures__/README.md).

## Conventions

- **Reuse app code instead of reimplementing it.** `build-cartoon-moon.ts`
  imports `../src/ktx/encodeKtx2` so the on-disk KTX2 format has exactly one
  implementation. Keep shareable logic in `src/` and import it from here; only
  Bun-environment shims (e.g. upng-js for PNG decode where the browser would
  use canvas) belong in `scripts/`.
- Both runtimes execute TypeScript directly — no transpile step, ever.
- **Node scripts:** Node built-ins only (see the runtime rule above). Nothing
  Bun-specific — no `Bun.file`, no `Glob`, no `Bun.$`, no auto-loaded `.env`
  (read `process.env`, or parse the file yourself if a script ever needs it).
- **Bun scripts (legacy):** prefer Bun built-ins there — `Bun.file()`/`Bun.write()`
  over `node:fs` read/write, `Glob` from `bun` for file discovery,
  Bun.$\`cmd\` over child_process/execa, `bun:test` if tests are added. Bun
  auto-loads `.env` — don't add dotenv.
- TypeScript config is local (`scripts/tsconfig.json`) and intentionally
  independent of the app's tsconfig. It keeps the bun-init defaults
  (`types: ["bun"]`) plus `erasableSyntaxOnly`, which is what makes tsc and the
  IDE reject syntax Node's type stripping cannot handle.
