/**
 * Minimal, dependency-free encoder for a 1×1 solid-color PNG.
 *
 * Used for the synthetic constant channels a custom PbrMaterial needs (a flat tangent-space
 * normal). We deliberately ship these as PNG rather than a hand-rolled KTX2: KSA's KTX decoder
 * mis-reads flexo's uncompressed-RGBA8+Zstd KTX2 textures (the cause of the "metallic" / "wavy
 * normal" regressions), whereas its PNG path is robust — KSA Core itself ships PNG constants
 * (e.g. Textures/Characters/EmptyAoRoughMetallic.png).
 *
 * The PNG is colour-type 2 (RGB, 8-bit) to mirror KSA's own EmptyAoRoughMetallic.png, with the
 * single scanline stored UNCOMPRESSED (a deflate "stored" block) so no compressor is needed —
 * the output is fully deterministic and synchronous.
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Encodes a 1×1 solid RGB PNG with the given 0–255 channels. */
export function makeSolidPng(r: number, g: number, b: number): Uint8Array {
  // IHDR: width=1, height=1, bitDepth=8, colorType=2 (RGB), compression=0, filter=0, interlace=0.
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, 1, false) // width
  new DataView(ihdr.buffer).setUint32(4, 1, false) // height
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: RGB

  // One scanline: a leading filter byte (0 = none) followed by the RGB triple.
  const raw = new Uint8Array([0, r & 0xff, g & 0xff, b & 0xff])

  return concat(
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  )
}

/** Wraps `data` in a PNG chunk: length (BE) + type + data + CRC32(type+data) (BE). */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const out = new Uint8Array(4 + typeBytes.length + data.length + 4)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length, false)
  out.set(typeBytes, 4)
  out.set(data, 4 + typeBytes.length)
  const crcInput = concat(typeBytes, data)
  dv.setUint32(out.length - 4, crc32(crcInput), false)
  return out
}

/** zlib stream wrapping `raw` in a single uncompressed ("stored") deflate block. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const len = raw.length
  const nlen = ~len & 0xffff
  const out = new Uint8Array(2 + 5 + len + 4)
  out[0] = 0x78 // zlib CMF (deflate, 32K window)
  out[1] = 0x01 // zlib FLG (no preset dict, fastest)
  out[2] = 0x01 // BFINAL=1, BTYPE=00 (stored)
  out[3] = len & 0xff
  out[4] = (len >> 8) & 0xff
  out[5] = nlen & 0xff
  out[6] = (nlen >> 8) & 0xff
  out.set(raw, 7)
  new DataView(out.buffer).setUint32(7 + len, adler32(raw), false)
  return out
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}
