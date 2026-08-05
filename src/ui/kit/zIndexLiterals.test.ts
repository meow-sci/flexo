import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guards the single z-index ladder (`src/ui/kit/zIndex.ts`, foundation §1.3): no UI or
 * three.js source may hard-code a Tailwind stacking class. The design blesses this
 * grep-based check because oxlint has no custom-rule facility
 * (design-system-services.md §7.3).
 *
 * The allowlist is the v1 debt still standing. It is **shrink only** — a file leaves it
 * when its surface dies (foundation §6.3 death list) and the second assertion below
 * fails if a listed file has already been cleaned, so dead entries get pruned.
 */

const SRC_DIR = join(import.meta.dirname, '..', '..');
const ROOTS = ['ui', 'three'];

/** Matches `z-10`, `z-30`, `z-40`, `z-50`, `z-[100]`, … but not `z-index` or `z-0`/`z-1`. */
const OFFENDER = /\bz-(?:\[|\d{2,3}\b)/;

/** The ladder itself and this guard are the two files allowed to talk about z tiers. */
const EXEMPT_FILES = new Set(['zIndex.ts', 'zIndexLiterals.test.ts']);

// SHRINK ONLY — files leave this list as their surfaces die (foundation §6.3 death
// list); never add a file.
const ALLOWLIST = [
  // FloatingEditorPanel.tsx + FloatingInspector.tsx left with P5B.16/P5B.17 — the aid editors
  // and the selected-asset inspector now live in the docked left sidebar's focus slot.
  'src/ui/FloatingPreviewToolbar.tsx',
  'src/ui/LoadProgress.tsx',
  'src/ui/ManageTexturesPanel.tsx',
  'src/ui/ViewportDropZone.tsx',
  // ChainPalette.tsx left with P5B.28 — the chain session now lives in a `FloatingWindow`,
  // which takes its stacking from the `z` ladder.
];

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry.name) && !EXEMPT_FILES.has(entry.name)) out.push(path);
  }
  return out;
}

/** Every offending file, as a repo-relative posix path (`src/ui/…`). */
function offenders(): string[] {
  const files = ROOTS.flatMap((root) => walk(join(SRC_DIR, root), []));
  return files
    .filter((path) => OFFENDER.test(readFileSync(path, 'utf-8')))
    .map((path) => `src/${relative(SRC_DIR, path).split(sep).join('/')}`)
    .sort();
}

describe('z-index literal ban', () => {
  it('no file outside the allowlist hard-codes a z-* class', () => {
    const extra = offenders().filter((path) => !ALLOWLIST.includes(path));
    expect(extra).toEqual([]);
  });

  it('every allowlist entry still offends (the list shrinks, never grows)', () => {
    const found = offenders();
    const stale = ALLOWLIST.filter((path) => !found.includes(path));
    expect(stale).toEqual([]);
  });
});
