/**
 * The `.flexo.tar.gz` container primitive — a hand-rolled USTAR writer/reader plus the two
 * native gzip stream helpers (design: `plans/flexo_v2/design/design-projects-export.md` §4.1,
 * decision D8: *"Hand-rolled USTAR (~150 LoC) + native `CompressionStream('gzip')`. No new
 * dependency"*).
 *
 * **Pure**: zero react / three / nanostores imports and no I/O beyond the two Web Streams
 * primitives, so every case here is unit-testable (Node 24 — vitest's runtime — ships global
 * `CompressionStream`, so the tests round-trip the real thing).
 *
 * **Deliberate limits.** Entry names are capped at the 100-byte USTAR `name` field: an archive
 * flexo writes only ever holds short generated paths (`manifest.json`, `project.json`,
 * `assets/tex-src/t_ab12`), so the pax/GNU long-name extensions would be dead weight. A longer
 * name is a programming error and throws rather than silently truncating. Only regular files
 * are emitted, and only regular files are read back (any other typeflag is skipped) — flexo
 * archives have no directories, links or devices.
 *
 * **Undo enrollment: NONE. Persistence: NONE.** This module is a byte-format codec.
 */

export interface TarEntry {
  name: string;
  bytes: Uint8Array;
}

const BLOCK = 512;
/** USTAR's `name` field is 100 bytes; there is no pax fallback here by design. */
const MAX_NAME_BYTES = 100;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Writes `text` at `offset`, NUL-padding to `length`. Throws when it does not fit. */
function writeField(header: Uint8Array, offset: number, length: number, text: string): void {
  const bytes = encoder.encode(text);
  if (bytes.length > length) {
    throw new Error(`tarArchive: field at ${offset} does not fit in ${length} bytes`);
  }
  header.set(bytes, offset);
}

/** An octal field: `width - 1` zero-padded digits followed by a NUL (the USTAR convention). */
function writeOctal(header: Uint8Array, offset: number, width: number, value: number): void {
  writeField(header, offset, width, value.toString(8).padStart(width - 1, '0'));
}

function readString(bytes: Uint8Array, offset: number, length: number): string {
  const slice = bytes.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return decoder.decode(end === -1 ? slice : slice.subarray(0, end));
}

function readOctal(bytes: Uint8Array, offset: number, length: number): number {
  const text = readString(bytes, offset, length).trim();
  if (!text) return 0;
  const value = Number.parseInt(text, 8);
  return Number.isFinite(value) ? value : 0;
}

/**
 * The header checksum: the unsigned sum of all 512 header bytes with the checksum field
 * itself read as eight spaces. Computed over the finished header, then written back into it.
 */
function checksum(header: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i];
  return sum;
}

function buildHeader(entry: TarEntry, mtimeSeconds: number): Uint8Array {
  const nameBytes = encoder.encode(entry.name);
  if (nameBytes.length > MAX_NAME_BYTES) {
    throw new Error(
      `tarArchive: entry name longer than ${MAX_NAME_BYTES} bytes (no pax support): ${entry.name}`,
    );
  }
  const header = new Uint8Array(BLOCK);
  header.set(nameBytes, 0);
  writeField(header, 100, 8, '0000644'); // mode
  writeField(header, 108, 8, '0000000'); // uid
  writeField(header, 116, 8, '0000000'); // gid
  writeOctal(header, 124, 12, entry.bytes.length); // size
  writeOctal(header, 136, 12, mtimeSeconds); // mtime
  header[156] = 0x30; // typeflag '0' — regular file
  writeField(header, 257, 6, 'ustar\0');
  header.set(encoder.encode('00'), 263); // version — NOT NUL-terminated
  // Checksum last: six octal digits, a NUL, then a space (the interoperable spelling).
  const sum = checksum(header);
  writeField(header, 148, 7, `${sum.toString(8).padStart(6, '0')}\0`);
  header[155] = 0x20;
  return header;
}

/**
 * Packs entries into a USTAR tar. **Entry order is preserved verbatim** — `manifest.json`
 * MUST be first, and that is the caller's job (§4.1).
 */
export function tarPack(entries: readonly TarEntry[]): Uint8Array {
  const mtimeSeconds = Math.floor(Date.now() / 1000);
  let total = 0;
  for (const entry of entries) total += BLOCK + Math.ceil(entry.bytes.length / BLOCK) * BLOCK;
  total += BLOCK * 2; // the two zero blocks that end every tar

  const out = new Uint8Array(total);
  let offset = 0;
  for (const entry of entries) {
    out.set(buildHeader(entry, mtimeSeconds), offset);
    offset += BLOCK;
    out.set(entry.bytes, offset);
    offset += Math.ceil(entry.bytes.length / BLOCK) * BLOCK;
  }
  return out;
}

/**
 * Unpacks a USTAR tar. Throws `Error('not a tar archive')` when the first header block lacks
 * the `ustar` magic at offset 257 — the one structural check, so a mis-typed file fails fast
 * instead of yielding garbage entries. Stops at the first zero block (end of archive) and
 * skips every non-regular-file typeflag.
 */
export function tarUnpack(bytes: Uint8Array): TarEntry[] {
  if (bytes.length < BLOCK || readString(bytes, 257, 5) !== 'ustar') {
    throw new Error('not a tar archive');
  }
  const entries: TarEntry[] = [];
  let offset = 0;
  while (offset + BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK);
    // A NUL name means the trailer: the archive ends here.
    if (header[0] === 0) break;
    const name = readString(bytes, offset, 100);
    const size = readOctal(bytes, offset + 124, 12);
    const typeflag = header[156];
    offset += BLOCK;
    // '0' and '\0' both mean "regular file"; anything else (dir, link, pax) is skipped.
    if (typeflag === 0x30 || typeflag === 0) {
      entries.push({ name, bytes: bytes.slice(offset, offset + size) });
    }
    offset += Math.ceil(size / BLOCK) * BLOCK;
  }
  return entries;
}

/** True when this runtime has the native gzip streams (feature-detected once). */
export function gzipSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function pipeThrough(
  bytes: Uint8Array,
  transform: ReadableWritablePair,
): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new CompressionStream('gzip'));
}

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new DecompressionStream('gzip'));
}
