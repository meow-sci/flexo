/**
 * Pure-JS SHA-256 — the fallback for `crypto.subtle`, which is **undefined outside a secure
 * context** (see `state/ids.ts` for the same story about `crypto.randomUUID`). A phone opening
 * the dev server over a plain-HTTP LAN URL — `http://<dev-host>:5173/flexo/` — is exactly that
 * case, and there `crypto.subtle.digest` threw and took project-archive export/import with it.
 *
 * This is deliberately the REAL algorithm rather than a cheaper dedup hash like
 * `ksa/importMaterials.hashBytes`: the digest is a wire-format field
 * (`ArchiveAssetManifestEntry.sha256`, persisted per texture as `sh` in `projectCodec`) that an
 * archive written on one device compares against hashes computed on another. Substituting a
 * different function would silently break cross-device import dedup and make the manifest lie
 * about what `sha256` means.
 *
 * FIPS 180-4 §6.2, the textbook single-shot form. Everything is `>>> 0`-normalized because JS
 * bitwise ops yield SIGNED 32-bit ints and the additions must wrap as unsigned.
 */

/** First 32 bits of the fractional parts of the cube roots of the first 64 primes. */
// prettier-ignore
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** First 32 bits of the fractional parts of the square roots of the first 8 primes. */
// prettier-ignore
const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

const HEX = '0123456789abcdef';

/** The 32-byte digest of `bytes`. */
export function sha256(bytes: Uint8Array): Uint8Array {
  // Pad to a whole number of 64-byte blocks: a 0x80 byte, zeros, then the 64-bit big-endian
  // bit length in the last 8 bytes.
  const bitLen = bytes.length * 8;
  const blocks = Math.ceil((bytes.length + 9) / 64);
  const buf = new Uint8Array(blocks * 64);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  // `bitLen` is a double, so split rather than use BigInt: exact for any length JS can hold.
  view.setUint32(buf.length - 8, Math.floor(bitLen / 0x1_0000_0000));
  view.setUint32(buf.length - 4, bitLen >>> 0);

  const h = H0.slice();
  const w = new Uint32Array(64);
  for (let block = 0; block < blocks; block++) {
    const off = block * 64;
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15]!;
      const y = w[t - 2]!;
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }

    let a = h[0]!;
    let b = h[1]!;
    let c = h[2]!;
    let d = h[3]!;
    let e = h[4]!;
    let f = h[5]!;
    let g = h[6]!;
    let hh = h[7]!;
    for (let t = 0; t < 64; t++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]!);
  return out;
}

/** Lowercase hex of {@link sha256}. */
export function sha256HexSync(bytes: Uint8Array): string {
  let out = '';
  for (const byte of sha256(bytes)) out += HEX[byte >> 4] + HEX[byte & 15];
  return out;
}
