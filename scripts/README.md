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
