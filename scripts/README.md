# scripts

Standalone [Bun](https://bun.com)-powered build/asset utilities for flexo (the
app itself uses pnpm — Bun is only for this directory).

```bash
cd scripts
bun install
```

## build-cartoon-moon.ts

Turns a handful of PNGs into the ready-to-install `ksa-mods/cartoon-moon/` KSA
mod that scatters those images as "cartoon character" ground clutter on a new
moon. Point it at a directory of PNGs (or list files individually):

```bash
bun build-cartoon-moon.ts ../faces
```

All options (`--out`, `--shape quad|cross|cylinder`, `--brightness`, `--bg`,
`--zstd`, clutter density/scale, …) are documented in the script's header
comment. Mod details: [ksa-mods/cartoon-moon/README.md](../ksa-mods/cartoon-moon/README.md).

## copy-ksa-assets-to-private-repo.ts

Discovers the KSA Core Part/SubPart catalog and copies it — plus every
GLB/KTX2/GLTF/DDS binary it references and the kitten character directories —
into a target directory laid out for the private assets repo (flexo is open
source; the licensed game binaries stay private and are pulled in at CI build
time):

```bash
bun copy-ksa-assets-to-private-repo.ts --target ../../flexo-ksa-assets
```

Context: [docs/asset-pipeline.md](../docs/asset-pipeline.md).

## sync-test-fixtures.ts

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
