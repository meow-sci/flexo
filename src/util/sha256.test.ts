import { describe, expect, it } from 'vitest';
import { sha256HexSync } from './sha256';

/**
 * The fallback digest is a WIRE FORMAT (`ArchiveAssetManifestEntry.sha256`), so these tests
 * pin it to published FIPS 180-4 vectors and then cross-check it against the platform
 * `crypto.subtle` — an archive hashed on a plain-HTTP phone has to dedup against one hashed
 * on an HTTPS desktop, and only byte-identical output makes that true.
 */

const enc = new TextEncoder();

describe('sha256HexSync', () => {
  it('matches the published FIPS 180-4 vectors', () => {
    expect(sha256HexSync(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256HexSync(enc.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    // 56 bytes — the boundary case that forces a SECOND padding block.
    expect(
      sha256HexSync(enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256HexSync(enc.encode('a'.repeat(1_000_000)))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('handles every length across the 64-byte block boundary', async () => {
    // 0..130 covers empty, one short block, the 55/56 padding boundary, an exact block,
    // and two-block inputs — where an off-by-one in the padding would show up.
    for (let n = 0; n <= 130; n++) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (i * 7 + 13) & 0xff;
      const expected = await subtleHex(bytes);
      expect(sha256HexSync(bytes), `length ${n}`).toBe(expected);
    }
  });

  it('agrees with crypto.subtle on high-byte data', async () => {
    const bytes = new Uint8Array(5000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 131 + 251) & 0xff;
    expect(sha256HexSync(bytes)).toBe(await subtleHex(bytes));
  });
});

async function subtleHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
