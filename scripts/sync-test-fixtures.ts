#!/usr/bin/env bun
/**
 * sync-test-fixtures — re-copy the vendored KSA asset fixtures in
 * `src/ksa/__fixtures__/` from the live private asset tree, keeping them
 * byte-identical. Run this after any KSA asset update that materially changes a
 * vendored file's structure, then update the affected parser/catalog code + tests.
 *
 * The fixture set is whatever `*.xml` already lives in `src/ksa/__fixtures__/`, so
 * adding a fixture = drop the file in once, then this script keeps it synced.
 *
 * Source dir resolution (first hit wins):
 *   1. `--src <dir>`                     explicit override
 *   2. `$KSA_ASSETS_DIR`                 Bun auto-loads flexo/.env when run from repo root
 *   3. `KSA_ASSETS_DIR=` in `flexo/.env` so it also works run from ./scripts
 *
 * The point of vendoring is that unit tests run WITHOUT this private tree; this
 * script + the "vendored fixtures stay in sync" test in partCatalog.test.ts are the
 * two halves of keeping the committed copies honest.
 *
 *   cd scripts && bun run sync-fixtures
 *   bun scripts/sync-test-fixtures.ts --src ../flexo-private-assets/assets
 */
import { Glob } from 'bun'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dir, '..')
const fixturesDir = join(repoRoot, 'src', 'ksa', '__fixtures__')

/** Resolve the live KSA asset tree: --src arg, else $KSA_ASSETS_DIR, else flexo/.env. */
async function resolveSource(): Promise<string> {
  const argIdx = Bun.argv.indexOf('--src')
  if (argIdx !== -1 && Bun.argv[argIdx + 1]) return Bun.argv[argIdx + 1]
  if (process.env.KSA_ASSETS_DIR) return process.env.KSA_ASSETS_DIR
  const envFile = Bun.file(join(repoRoot, '.env'))
  if (await envFile.exists()) {
    const m = (await envFile.text()).match(/^\s*KSA_ASSETS_DIR\s*=\s*(.+?)\s*$/m)
    if (m) return m[1].replace(/^["']|["']$/g, '')
  }
  return ''
}

const src = await resolveSource()
if (!src || !existsSync(src)) {
  console.error(
    'sync-test-fixtures: could not resolve the live KSA asset dir.\n' +
      '  set KSA_ASSETS_DIR (in flexo/.env), or pass --src <the flexo-private-assets/assets tree>.',
  )
  process.exit(1)
}

const fixtures = [...new Glob('*.xml').scanSync(fixturesDir)].sort()
if (fixtures.length === 0) {
  console.error(`sync-test-fixtures: no *.xml fixtures found in ${fixturesDir}`)
  process.exit(1)
}

let missing = 0
for (const name of fixtures) {
  const from = join(src, name)
  if (!existsSync(from)) {
    console.error(`  MISSING in source (skipped): ${name} — not found under ${src}`)
    missing++
    continue
  }
  await Bun.write(join(fixturesDir, name), Bun.file(from))
  console.log(`  synced ${name}`)
}

console.log(`\n${fixtures.length - missing}/${fixtures.length} fixture(s) re-synced from ${src}`)
if (missing > 0) process.exit(1)
