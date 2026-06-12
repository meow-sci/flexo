# scripts/ — Bun mini-workspace

Standalone build/asset utilities. This directory is its own Bun package
(`scripts/package.json`): install and run everything here with **Bun**, never
Node, ts-node, or pnpm. The flexo app at the repo root is the opposite —
pnpm + Vite + vitest — so never apply this file's Bun guidance outside
`scripts/`.

## Setup & running

```sh
cd scripts
bun install                                          # once (upng-js + @types/bun)
bun build-cartoon-moon.ts ../faces                   # a dir of PNGs (or individual files)
bun copy-ksa-assets-to-private-repo.ts --target <dir>
```

## The scripts

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

## Conventions

- **Reuse app code instead of reimplementing it.** `build-cartoon-moon.ts`
  imports `../src/ktx/encodeKtx2` so the on-disk KTX2 format has exactly one
  implementation. Keep shareable logic in `src/` and import it from here; only
  Bun-environment shims (e.g. upng-js for PNG decode where the browser would
  use canvas) belong in `scripts/`.
- `bun <file.ts>` runs TypeScript directly — no transpile step.
- Prefer Bun built-ins over Node equivalents here: `Bun.file()`/`Bun.write()`
  over `node:fs` read/write, `Glob` from `bun` for file discovery,
  Bun.$\`cmd\` over child_process/execa, `bun:test` if tests are added. Bun
  auto-loads `.env` — don't add dotenv.
- TypeScript config is local (`scripts/tsconfig.json`, bun-init defaults with
  `types: ["bun"]`) and intentionally independent of the app's tsconfig.
