declare module 'upng-js' {
  interface UPNGImage {
    width: number
    height: number
    depth: number
    ctype: number
    frames: unknown[]
    tabs: Record<string, unknown>
    data: Uint8Array
  }
  const UPNG: {
    /** Decode a PNG to a UPNG image (handles palette/grayscale/16-bit/alpha). */
    decode(buffer: ArrayBuffer | Uint8Array): UPNGImage
    /** Convert to 8-bit RGBA, one ArrayBuffer per frame (frame 0 for stills). */
    toRGBA8(img: UPNGImage): ArrayBuffer[]
    /** Encode RGBA frames to a PNG ArrayBuffer (cnum=0 → lossless). */
    encode(imgs: ArrayBuffer[], w: number, h: number, cnum?: number, dels?: number[]): ArrayBuffer
  }
  export default UPNG
}
