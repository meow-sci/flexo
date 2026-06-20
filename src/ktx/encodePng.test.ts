import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import { makeSolidPng } from './encodePng'

describe('makeSolidPng', () => {
  it('emits a valid 1×1 RGB PNG whose pixel matches the requested color', () => {
    const png = makeSolidPng(128, 128, 255)

    // PNG signature.
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    // IHDR: 1×1, 8-bit, colour type 2 (RGB). IHDR data starts at byte 16 (8 sig + 4 len + 4 type).
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
    expect(dv.getUint32(16, false)).toBe(1) // width
    expect(dv.getUint32(20, false)).toBe(1) // height
    expect(png[24]).toBe(8) // bit depth
    expect(png[25]).toBe(2) // colour type RGB

    // Find the IDAT chunk, inflate it (this also validates the zlib stream + adler32), and check the
    // single scanline = filter(0) + RGB.
    const idat = findChunk(png, 'IDAT')
    const raw = new Uint8Array(inflateSync(Buffer.from(idat)))
    expect([...raw]).toEqual([0, 128, 128, 255])
  })
})

/** Returns the data bytes of the first chunk of the given type in a PNG. */
function findChunk(png: Uint8Array, type: string): Uint8Array {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let off = 8 // past signature
  while (off < png.length) {
    const len = dv.getUint32(off, false)
    const t = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7])
    if (t === type) return png.subarray(off + 8, off + 8 + len)
    off += 12 + len // len(4) + type(4) + data + crc(4)
  }
  throw new Error(`chunk ${type} not found`)
}
