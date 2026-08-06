import { describe, it, expect } from 'vitest';
import { gunzip, gzip, gzipSupported, tarPack, tarUnpack, type TarEntry } from './tarArchive';

function entry(name: string, text: string): TarEntry {
  return { name, bytes: new TextEncoder().encode(text) };
}

describe('tarPack / tarUnpack', () => {
  it('round-trips names and bytes in order', () => {
    const entries = [
      entry('manifest.json', '{"format":"flexo-project-archive"}'),
      entry('project.json', '{"v":8}'),
      entry('assets/tex-src/t_ab12', 'not really an image'),
    ];
    const unpacked = tarUnpack(tarPack(entries));
    expect(unpacked.map((e) => e.name)).toEqual([
      'manifest.json',
      'project.json',
      'assets/tex-src/t_ab12',
    ]);
    expect(unpacked.map((e) => new TextDecoder().decode(e.bytes))).toEqual([
      '{"format":"flexo-project-archive"}',
      '{"v":8}',
      'not really an image',
    ]);
  });

  it('round-trips both padding edges: a 1-byte and an exactly-512-byte body', () => {
    const one = new Uint8Array([42]);
    const full = new Uint8Array(512).fill(7);
    const unpacked = tarUnpack(
      tarPack([
        { name: 'one', bytes: one },
        { name: 'full', bytes: full },
      ]),
    );
    expect(unpacked[0].bytes).toEqual(one);
    expect(unpacked[1].bytes).toEqual(full);
    // Every entry is header + padded body, and the archive ends with two zero blocks.
    expect(tarPack([{ name: 'full', bytes: full }]).length).toBe(512 + 512 + 1024);
  });

  it('round-trips an empty body and an empty archive', () => {
    const unpacked = tarUnpack(tarPack([{ name: 'empty', bytes: new Uint8Array(0) }]));
    expect(unpacked).toEqual([{ name: 'empty', bytes: new Uint8Array(0) }]);
    expect(() => tarUnpack(tarPack([]))).toThrow('not a tar archive');
  });

  it('rejects input without the ustar magic', () => {
    expect(() => tarUnpack(new Uint8Array(1024))).toThrow('not a tar archive');
    expect(() => tarUnpack(new TextEncoder().encode('this is a JSON file, not a tar'))).toThrow(
      'not a tar archive',
    );
    // Truncating mid-body is tolerated (the reader stops), but a corrupted header is not.
    const packed = tarPack([entry('a', 'hello')]);
    packed[257] = 0x58; // clobber the magic
    expect(() => tarUnpack(packed)).toThrow('not a tar archive');
  });

  it('throws when an entry name exceeds the 100-byte USTAR field', () => {
    expect(() => tarPack([entry('x'.repeat(101), 'body')])).toThrow(/longer than 100 bytes/);
    expect(() => tarPack([entry('x'.repeat(100), 'body')])).not.toThrow();
  });
});

describe('gzip / gunzip', () => {
  it('is supported by this runtime', () => {
    expect(gzipSupported()).toBe(true);
  });

  it('round-trips 1 MB of random bytes', async () => {
    const bytes = new Uint8Array(1024 * 1024);
    // crypto.getRandomValues caps at 65536 bytes per call.
    for (let i = 0; i < bytes.length; i += 65536) {
      crypto.getRandomValues(bytes.subarray(i, Math.min(i + 65536, bytes.length)));
    }
    expect(await gunzip(await gzip(bytes))).toEqual(bytes);
  });

  it('round-trips a gzipped tar through the full container pipeline', async () => {
    const entries = [
      entry('manifest.json', '{"archiveVersion":1}'),
      entry('project.json', 'x'.repeat(5000)),
    ];
    const packed = tarPack(entries);
    const compressed = await gzip(packed);
    expect(compressed.length).toBeLessThan(packed.length); // the repetitive body compresses
    expect(tarUnpack(await gunzip(compressed))).toEqual(entries);
  });
});
