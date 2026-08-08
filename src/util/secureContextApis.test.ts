import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **Regression guard for the secure-context API class.**
 *
 * `crypto.randomUUID` and `crypto.subtle` exist ONLY in a secure context (HTTPS or localhost).
 * A phone opening the dev server over a plain-HTTP LAN URL — `http://<dev-host>:5173/flexo/`,
 * which `vite.config.ts`'s `server.host: '0.0.0.0'` exists to enable — is not one, so calling
 * either throws there.
 *
 * This has bitten repeatedly and always silently: `partImport`'s direct `crypto.randomUUID()`
 * ran inside `addPart`'s animation callback and took the ENTIRE import of any animated built-in
 * Part down with it, and `projectArchive`'s `crypto.subtle.digest` killed archive export for
 * exactly those projects that owned custom assets. Both looked like "the feature just doesn't
 * work on my phone" with nothing on screen to explain it.
 *
 * So: route new code through `state/ids.randomId()` and `util/sha256`, and add a file here only
 * with a reason. Fails loudly rather than at 3am on someone's phone.
 */

const ROOTS = ['src', 'apps'];

/**
 * Call shapes only — `randomUUID(` with its paren, `subtle.` with its member access. The house
 * doc convention is to NAME these APIs in prose precisely to warn against them ("`randomId`
 * rather than `crypto.randomUUID`"), so a bare-mention match would flag every warning as a
 * violation. Comment lines are skipped too, for the block-comment form of the same prose.
 */
const FORBIDDEN = /\bcrypto\s*\.\s*(?:randomUUID\s*\(|subtle\s*\.)/;

function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
}

/** Files allowed to CALL these APIs, each because it is the thing that guards them. */
const ALLOWED = new Map<string, string>([
  ['src/state/ids.ts', 'the randomUUID → getRandomValues → Math.random fallback itself'],
  ['src/state/projectArchive.ts', 'guarded: falls back to util/sha256 when subtle is absent'],
  ['src/util/sha256.test.ts', 'cross-checks the fallback against the platform digest'],
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      sourceFiles(path, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe('secure-context-only web APIs', () => {
  it('are never called directly outside the modules that guard them', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        if (ALLOWED.has(file)) continue;
        const text = readFileSync(file, 'utf8');
        for (const [i, line] of text.split('\n').entries()) {
          if (!isCommentLine(line) && FORBIDDEN.test(line)) {
            offenders.push(`${file}:${i + 1}  ${line.trim()}`);
          }
        }
      }
    }
    expect(
      offenders,
      'crypto.randomUUID / crypto.subtle are undefined outside a secure context (a phone on a ' +
        'plain-http:// LAN URL). Use state/ids.randomId() or util/sha256 instead.',
    ).toEqual([]);
  });

  it('keeps its allowlist honest — every entry still names one of them', () => {
    for (const [file, why] of ALLOWED) {
      expect(FORBIDDEN.test(readFileSync(file, 'utf8')), `${file} (${why})`).toBe(true);
    }
  });
});
