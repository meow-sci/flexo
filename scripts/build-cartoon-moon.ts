#!/usr/bin/env bun
/**
 * build-cartoon-moon — turn a handful of PNGs into a ready-to-install KSA mod that
 * scatters those images as "cartoon character" ground clutter on a new moon ("Looney").
 *
 * All input PNGs are packed into ONE shared atlas, emitted into ksa-mods/cartoon-moon/:
 *   Textures/Clutter/Atlas_Diffuse.ktx2    (sRGB; all faces tiled)
 *   Textures/Clutter/Atlas_Opacity.ktx2    (linear silhouette in R, cut where < 0.5; cards only)
 *   Meshes/Clutter/<name>Card.glb          (one card per face, UV-mapped to its atlas tile)
 * then regenerates assets/cartoon_moon.xml — the Luna-clone body with a SINGLE <Ecotype> whose
 * <GroundClutter> has one <ClutterObject> per face sharing the atlas material. (One ecotype is
 * mandatory: KSA's placement RNG is seeded by cell position only, so separate ecotypes place at
 * identical spots and z-fight. The GPU mixes the faces via a random per-instance objectId.) That
 * body file is the ONLY thing the game loads. Finally it ensures mod.toml + the scenario exist.
 *
 * The KTX2 files are written by flexo's OWN encoder (src/ktx/encodeKtx2) — the format is
 * exactly what KSA's loader expects (validated in-game for custom part textures). Only the
 * browser image-decode is reimplemented here for Bun (upng-js instead of canvas).
 *
 * Usage:
 *   cd scripts && bun install            # once, to get upng-js
 *   bun build-cartoon-moon.ts ../faces/cat.png ../faces/dog.png ../faces/frog.png
 *   bun build-cartoon-moon.ts ../faces   # or point at a directory of PNGs
 *
 * Options:
 *   --out <dir>           output mod dir (default: <repo>/ksa-mods/cartoon-moon)
 *   --astronomicals <f>   source Astronomicals.xml to clone Luna from
 *                         (default: <repo>/thirdparty/ksa/Content/Core/Astronomicals.xml;
 *                          point at YOUR installed game's copy to stay version-correct)
 *   --names a,b,c         override the per-character names (default: from filenames)
 *   --brightness <f>      multiply diffuse RGB (default 1.0). KSA decodes clutter diffuse
 *                         ~x2 then luminosity-normalises — try 0.5 if it looks blown out.
 *   --max-size <px>       cap the longest texture edge (default 1024)
 *   --shape <s>           card shape: quad (default) | cross | cylinder
 *   --cross               alias for --shape cross (2-quad cross billboard, visible all around)
 *   --cylinder            alias for --shape cylinder — a SOLID 3D peg (flat bottom, rounded
 *                         top) with the face wrapped on the front; no cutout, real 3D shading
 *   --fill <hex>          background colour the face is composited over for --cylinder
 *                         (default cdcdcd light grey); fills the non-face surface
 *   --bg <hex>            for PNGs with no transparency, key out this background colour
 *                         (e.g. --bg ffffff) to make the silhouette / isolate the face
 *   --zstd                Zstd-supercompress the KTX2 levels (matches KSA atlases; off by
 *                         default to keep the run dependency-light)
 *   --separation <m>      clutter ObjectSeparation metres (default 40)
 *   --range <m>           clutter GenerationRange metres (default 3000)
 *   --min-scale <m>       min card size (default 6)
 *   --max-scale <m>       max card size (default 12)
 */

import { encodeImageToKtx2 } from '../src/ktx/encodeKtx2'
import { buildMipChain, type ImageLevel } from '../src/ktx/decodeImage'
import UPNG from 'upng-js'
import { rm } from 'node:fs/promises'

// ----------------------------------------------------------------------------- args

type Shape = 'quad' | 'cross' | 'cylinder'

interface Args {
  inputs: string[]
  out: string
  astronomicals: string
  names?: string[]
  brightness: number
  maxSize: number
  shape: Shape
  bg?: [number, number, number]
  fill: [number, number, number]
  zstd: boolean
  separation: number
  range: number
  minScale: number
  maxScale: number
}

const REPO = new URL('..', import.meta.url).pathname // scripts/ -> repo root

function parseArgs(argv: string[]): Args {
  const inputs: string[] = []
  const o: Partial<Args> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case '--out': o.out = next(); break
      case '--astronomicals': o.astronomicals = next(); break
      case '--names': o.names = next().split(',').map((s) => s.trim()).filter(Boolean); break
      case '--brightness': o.brightness = Number(next()); break
      case '--max-size': o.maxSize = Number(next()); break
      case '--cross': o.shape = 'cross'; break
      case '--cylinder': o.shape = 'cylinder'; break
      case '--shape': o.shape = next() as Shape; break
      case '--bg': o.bg = hexToRgb(next()); break
      case '--fill': o.fill = hexToRgb(next()); break
      case '--zstd': o.zstd = true; break
      case '--separation': o.separation = Number(next()); break
      case '--range': o.range = Number(next()); break
      case '--min-scale': o.minScale = Number(next()); break
      case '--max-scale': o.maxScale = Number(next()); break
      default:
        if (a.startsWith('--')) throw new Error(`unknown option: ${a}`)
        inputs.push(a)
    }
  }
  return {
    inputs,
    out: o.out ?? `${REPO}ksa-mods/cartoon-moon`,
    astronomicals: o.astronomicals ?? `${REPO}thirdparty/ksa/Content/Core/Astronomicals.xml`,
    names: o.names,
    brightness: o.brightness ?? 1.0,
    maxSize: o.maxSize ?? 1024,
    shape: o.shape ?? 'quad',
    bg: o.bg,
    fill: o.fill ?? [205, 205, 205],
    zstd: o.zstd ?? false,
    separation: o.separation ?? 40,
    range: o.range ?? 3000,
    minScale: o.minScale ?? 6,
    maxScale: o.maxScale ?? 12,
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  if (h.length !== 6) throw new Error(`expected a 6-digit hex colour, got "${hex}"`)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Expand directory args to their *.png children; keep file args as-is. */
async function resolveInputs(inputs: string[]): Promise<string[]> {
  const out: string[] = []
  for (const p of inputs) {
    const stat = await Bun.file(p).stat().catch(() => null)
    if (stat?.isDirectory?.()) {
      for await (const f of new Bun.Glob('*.png').scan({ cwd: p, absolute: true })) out.push(f)
    } else {
      out.push(p)
    }
  }
  return out.sort()
}

// ------------------------------------------------------------------------- image ops

interface Decoded { width: number; height: number; rgba: Uint8Array }

function decodePng(buf: ArrayBuffer): Decoded {
  const img = UPNG.decode(buf)
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0])
  return { width: img.width, height: img.height, rgba }
}

/** Area resample to arbitrary dims, alpha-weighting RGB (premultiplied) to avoid dark fringes. */
function resizeArea(src: Decoded, dw: number, dh: number): Decoded {
  if (dw === src.width && dh === src.height) return src
  const out = new Uint8Array(dw * dh * 4)
  const sxStep = src.width / dw, syStep = src.height / dh
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y * syStep), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * syStep))
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x * sxStep), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * sxStep))
      let r = 0, g = 0, b = 0, aw = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1; sy++)
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * src.width + sx) * 4, sa = src.rgba[i + 3]
          r += src.rgba[i] * sa; g += src.rgba[i + 1] * sa; b += src.rgba[i + 2] * sa; aw += sa; a += sa; n++
        }
      const o = (y * dw + x) * 4
      out[o] = aw ? Math.round(r / aw) : 0; out[o + 1] = aw ? Math.round(g / aw) : 0; out[o + 2] = aw ? Math.round(b / aw) : 0
      out[o + 3] = Math.round(a / n)
    }
  }
  return { width: dw, height: dh, rgba: out }
}

/** Downscale so the longest edge is <= maxSize (no-op if already small). */
function fitToMaxSize(src: Decoded, maxSize: number): Decoded {
  const scale = Math.min(1, maxSize / Math.max(src.width, src.height))
  if (scale >= 1) return src
  return resizeArea(src, Math.max(1, Math.round(src.width * scale)), Math.max(1, Math.round(src.height * scale)))
}

interface UvRect { u0: number; v0: number; u1: number; v1: number }
const remapUv = (u: number, v: number, r: UvRect): [number, number] => [r.u0 + u * (r.u1 - r.u0), r.v0 + v * (r.v1 - r.v0)]

/**
 * Pack N images into a square-tiled RGBA atlas (cols=ceil(√N)). Each face is aspect-fit and
 * centred in its tile at `contentScale`, leaving a transparent margin that doubles as a mip
 * gutter (so faces don't bleed into each other). Returns the atlas + each tile's full-tile UV
 * rect. One shared atlas lets a SINGLE ecotype carry many faces — the only way KSA scatters
 * them mixed without z-fighting (separate ecotypes place identically; see groundClutterXml).
 */
function buildAtlas(imgs: Decoded[], tile: number, contentScale = 0.9): { atlas: Decoded; rects: UvRect[] } {
  const n = imgs.length
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols)
  const W = cols * tile, H = rows * tile
  const rgba = new Uint8Array(W * H * 4) // zero = transparent
  const content = Math.max(1, Math.floor(tile * contentScale))
  const rects: UvRect[] = []
  for (let i = 0; i < n; i++) {
    const col = i % cols, row = Math.floor(i / cols)
    const s = Math.min(content / imgs[i].width, content / imgs[i].height)
    const fit = resizeArea(imgs[i], Math.max(1, Math.round(imgs[i].width * s)), Math.max(1, Math.round(imgs[i].height * s)))
    const ox = col * tile + ((tile - fit.width) >> 1), oy = row * tile + ((tile - fit.height) >> 1)
    for (let y = 0; y < fit.height; y++)
      for (let x = 0; x < fit.width; x++) {
        const si = (y * fit.width + x) * 4, di = ((oy + y) * W + (ox + x)) * 4
        rgba[di] = fit.rgba[si]; rgba[di + 1] = fit.rgba[si + 1]; rgba[di + 2] = fit.rgba[si + 2]; rgba[di + 3] = fit.rgba[si + 3]
      }
    rects.push({ u0: col * tile / W, v0: row * tile / H, u1: (col + 1) * tile / W, v1: (row + 1) * tile / H })
  }
  return { atlas: { width: W, height: H, rgba }, rects }
}

/** If the image is fully opaque and a --bg colour is given, key it out into the alpha. */
function applyBackgroundKey(img: Decoded, bg?: [number, number, number]): Decoded {
  if (!bg) return img
  const opaque = img.rgba.every((v, i) => i % 4 !== 3 || v === 255)
  if (!opaque) return img // already has alpha; respect it
  const [br, bg_, bb] = bg
  const out = new Uint8Array(img.rgba)
  for (let i = 0; i < out.length; i += 4) {
    const d = Math.abs(out[i] - br) + Math.abs(out[i + 1] - bg_) + Math.abs(out[i + 2] - bb)
    if (d < 30) out[i + 3] = 0 // near the key colour -> transparent
  }
  return { ...img, rgba: out }
}

/**
 * Bleed opaque RGB outward into (nearly) transparent texels so the alpha cutout has no
 * dark/garbage fringe at the silhouette edge. A few cheap dilation passes is plenty.
 */
function bleedRgb(img: Decoded, passes = 4): Decoded {
  const { width: w, height: h } = img
  const rgba = new Uint8Array(img.rgba)
  const solid = new Uint8Array(w * h) // 1 where alpha is meaningfully opaque
  for (let p = 0; p < w * h; p++) solid[p] = rgba[p * 4 + 3] >= 16 ? 1 : 0
  for (let pass = 0; pass < passes; pass++) {
    const newlySolid: number[] = []
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        if (solid[p]) continue
        let r = 0, g = 0, b = 0, n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            const q = ny * w + nx
            if (!solid[q]) continue
            r += rgba[q * 4]; g += rgba[q * 4 + 1]; b += rgba[q * 4 + 2]; n++
          }
        if (n > 0) {
          rgba[p * 4] = (r / n) | 0; rgba[p * 4 + 1] = (g / n) | 0; rgba[p * 4 + 2] = (b / n) | 0
          newlySolid.push(p)
        }
      }
    for (const p of newlySolid) solid[p] = 1
    if (newlySolid.length === 0) break
  }
  return { width: w, height: h, rgba }
}

/**
 * Composite the image over an opaque background colour (alpha-blend, then force alpha=255).
 * Used for the solid cylinder, which has no opacity cutout — so transparent areas of the source
 * must become real pixels (the fill) instead of holes/garbage.
 */
function flattenOverBg(img: Decoded, fill: [number, number, number]): Decoded {
  const out = new Uint8Array(img.rgba.length)
  for (let i = 0; i < out.length; i += 4) {
    const a = img.rgba[i + 3] / 255
    out[i] = clamp8(img.rgba[i] * a + fill[0] * (1 - a))
    out[i + 1] = clamp8(img.rgba[i + 1] * a + fill[1] * (1 - a))
    out[i + 2] = clamp8(img.rgba[i + 2] * a + fill[2] * (1 - a))
    out[i + 3] = 255
  }
  return { width: img.width, height: img.height, rgba: out }
}

/** Diffuse base level: RGB (optionally brightened), opaque alpha. */
function diffuseLevel(img: Decoded, brightness: number): ImageLevel {
  const out = new Uint8Array(img.width * img.height * 4)
  for (let i = 0; i < out.length; i += 4) {
    out[i] = clamp8(img.rgba[i] * brightness)
    out[i + 1] = clamp8(img.rgba[i + 1] * brightness)
    out[i + 2] = clamp8(img.rgba[i + 2] * brightness)
    out[i + 3] = 255
  }
  return { width: img.width, height: img.height, rgba: out }
}

/** Opacity base level: source alpha replicated into RGB (shader samples .r), opaque alpha. */
function opacityLevel(img: Decoded): ImageLevel {
  const out = new Uint8Array(img.width * img.height * 4)
  for (let i = 0; i < out.length; i += 4) {
    const a = img.rgba[i + 3]
    out[i] = a; out[i + 1] = a; out[i + 2] = a; out[i + 3] = 255
  }
  return { width: img.width, height: img.height, rgba: out }
}

const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

// --------------------------------------------------------------------------- GLB card

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const COMP_FLOAT = 5126
const COMP_USHORT = 5123
const TARGET_ARRAY = 34962
const TARGET_ELEMENT = 34963

/**
 * A clutter "card": a unit square quad (base at y=0 so it stands on the ground). The face is
 * aspect-fit inside its atlas tile, so the card is square and the opacity cutout trims it to the
 * face shape. UVs map the card to `rect` (its tile in the shared atlas). `cross` adds a second
 * perpendicular quad so it reads from any angle. Geometry-only (POSITION/NORMAL/TEXCOORD_0).
 */
function buildCardGlb(rect: UvRect, cross: boolean, meshName: string): Uint8Array {
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const idx: number[] = []

  const quad = (verts: [number, number, number][], normal: [number, number, number]) => {
    const base = pos.length / 3
    const localUv: [number, number][] = [[0, 1], [1, 1], [1, 0], [0, 0]]
    for (let k = 0; k < 4; k++) {
      pos.push(...verts[k]); nrm.push(...normal); uv.push(...remapUv(localUv[k][0], localUv[k][1], rect))
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  // Unit square in the XY plane, facing +Z.
  quad([[-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0]], [0, 0, 1])
  if (cross) {
    // Perpendicular square in the ZY plane, facing +X.
    quad([[0, 0, -0.5], [0, 0, 0.5], [0, 1, 0.5], [0, 1, -0.5]], [1, 0, 0])
  }

  return packGlb(new Float32Array(pos), new Float32Array(nrm), new Float32Array(uv), new Uint16Array(idx), meshName)
}

const normalize3 = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

/**
 * A 3D clutter "peg": flat bottom disc → cylindrical wall → hemispherical dome → apex, standing
 * on y=0 (total height 1, radius 0.32). The face wraps the front 180° and is mirrored on the back
 * via a triangle-wave U; V runs bottom(0)→apex(1). Real outward normals give genuine 3D shading,
 * so the material is solid (no opacity cutout). Geometry-only POSITION/NORMAL/TEXCOORD_0.
 */
function buildCylinderGlb(rect: UvRect, meshName: string): Uint8Array {
  const R = 0.32, BODY = 0.68, TOTAL = 1.0 // BODY + R (dome is a hemisphere of radius R)
  const RADIAL = 24, DOME = 6
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = []
  const add = (x: number, y: number, z: number, n: [number, number, number], u: number, v: number) => {
    const i = pos.length / 3; pos.push(x, y, z); nrm.push(n[0], n[1], n[2]); const [ru, rv] = remapUv(u, v, rect); uv.push(ru, rv); return i
  }
  // Front faces -Z. Whole face across the front 180°, mirrored across the back 180° (continuous).
  const uOf = (theta: number) => {
    let t = theta
    while (t < -Math.PI) t += 2 * Math.PI
    while (t >= Math.PI) t -= 2 * Math.PI
    if (t >= -Math.PI / 2 && t <= Math.PI / 2) return 0.5 + t / Math.PI
    return t > 0 ? 0.5 + (Math.PI - t) / Math.PI : 0.5 - (Math.PI + t) / Math.PI
  }
  const px = (theta: number, r: number): [number, number] => [r * Math.sin(theta), -r * Math.cos(theta)]
  const ring = (y: number, r: number, nfn: (x: number, z: number, y: number) => [number, number, number]) => {
    const ids: number[] = []
    for (let s = 0; s < RADIAL; s++) { const th = s / RADIAL * 2 * Math.PI; const [x, z] = px(th, r); ids.push(add(x, y, z, nfn(x, z, y), uOf(th), y / TOTAL)) }
    return ids
  }
  // outward CCW stitch between a lower and upper ring
  const stitch = (lower: number[], upper: number[]) => {
    for (let s = 0; s < RADIAL; s++) {
      const a = lower[s], b = lower[(s + 1) % RADIAL], c = upper[(s + 1) % RADIAL], d = upper[s]
      idx.push(a, c, b, a, d, c)
    }
  }

  // flat bottom disc (normal -Y)
  const bc = add(0, 0, 0, [0, -1, 0], 0.5, 0)
  const bottom = ring(0, R, () => [0, -1, 0])
  for (let s = 0; s < RADIAL; s++) idx.push(bc, bottom[s], bottom[(s + 1) % RADIAL])

  // cylindrical wall (radial normals)
  const wallBottom = ring(0, R, (x, z) => normalize3(x, 0, z))
  const wallTop = ring(BODY, R, (x, z) => normalize3(x, 0, z))
  stitch(wallBottom, wallTop)

  // hemispherical dome (normals point away from the dome centre at y=BODY); wallTop is its base
  let prev = wallTop
  for (let r = 1; r < DOME; r++) {
    const phi = r / DOME * (Math.PI / 2)
    const upper = ring(BODY + R * Math.sin(phi), R * Math.cos(phi), (x, z, y) => normalize3(x, y - BODY, z))
    stitch(prev, upper); prev = upper
  }
  const apex = add(0, TOTAL, 0, [0, 1, 0], 0.5, 1)
  for (let s = 0; s < RADIAL; s++) idx.push(prev[s], apex, prev[(s + 1) % RADIAL])

  return packGlb(new Float32Array(pos), new Float32Array(nrm), new Float32Array(uv), new Uint16Array(idx), meshName)
}

/**
 * `meshName` MUST be unique per character: KSA's clutter loader (MeshAtlasFileReference.DoLoad)
 * registers every GLB mesh globally under its glTF MESH name with first-wins dedupe, so a shared
 * name (the old constant "card") made every character resolve to the first-loaded card's geometry
 * (and thus its atlas tile). Names starting with "_" are skipped by the loader entirely.
 */
function packGlb(pos: Float32Array, nrm: Float32Array, uvs: Float32Array, idx: Uint16Array, meshName: string): Uint8Array {
  const align4 = (n: number) => (n + 3) & ~3
  const posBytes = pos.byteLength
  const nrmBytes = nrm.byteLength
  const uvBytes = uvs.byteLength
  const idxBytes = idx.byteLength
  const posOff = 0
  const nrmOff = posOff + posBytes
  const uvOff = nrmOff + nrmBytes
  const idxOff = uvOff + uvBytes
  const binLen = align4(idxOff + idxBytes)

  const bin = new Uint8Array(binLen)
  bin.set(new Uint8Array(pos.buffer, pos.byteOffset, posBytes), posOff)
  bin.set(new Uint8Array(nrm.buffer, nrm.byteOffset, nrmBytes), nrmOff)
  bin.set(new Uint8Array(uvs.buffer, uvs.byteOffset, uvBytes), uvOff)
  bin.set(new Uint8Array(idx.buffer, idx.byteOffset, idxBytes), idxOff)

  let min = [Infinity, Infinity, Infinity]
  let max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3)
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], pos[i + c]); max[c] = Math.max(max[c], pos[i + c])
    }

  const json = {
    asset: { version: '2.0', generator: 'flexo build-cartoon-moon' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: meshName }],
    meshes: [{ name: meshName, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: COMP_FLOAT, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: COMP_FLOAT, count: nrm.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: COMP_FLOAT, count: uvs.length / 2, type: 'VEC2' },
      { bufferView: 3, componentType: COMP_USHORT, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: posOff, byteLength: posBytes, target: TARGET_ARRAY },
      { buffer: 0, byteOffset: nrmOff, byteLength: nrmBytes, target: TARGET_ARRAY },
      { buffer: 0, byteOffset: uvOff, byteLength: uvBytes, target: TARGET_ARRAY },
      { buffer: 0, byteOffset: idxOff, byteLength: idxBytes, target: TARGET_ELEMENT },
    ],
    buffers: [{ byteLength: binLen }],
  }

  let jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.length + jsonPad)
    padded.set(jsonBytes); padded.fill(0x20, jsonBytes.length)
    jsonBytes = padded
  }

  const total = 12 + 8 + jsonBytes.length + 8 + bin.length
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, GLB_MAGIC, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonBytes.length, true)
  dv.setUint32(16, JSON_CHUNK, true)
  out.set(jsonBytes, 20)
  const binChunkStart = 20 + jsonBytes.length
  dv.setUint32(binChunkStart, bin.length, true)
  dv.setUint32(binChunkStart + 4, BIN_CHUNK, true)
  out.set(bin, binChunkStart + 8)
  return out
}

// ----------------------------------------------------------------------------- XML gen

interface Character { name: string }

// KSA's ClutterEcotypeRenderData hardcodes 5 LODs per ClutterObject (it reads Lods[0..4]
// unconditionally), so every card ships exactly 5 LODs. They all point at the same low-poly
// card mesh (stock grass does the same — it reuses one mesh across LODs); the descending
// screen-size thresholds just cull the card past ~8px. Shared synthetic Normal/AoRoughMetal
// maps are required too: the renderer calls NormalReference.Get()/PBRMap.Get() unconditionally.
const LOD_SCREEN_SIZES = [128, 64, 32, 16, 8]
export const FLAT_NORMAL_KTX2 = 'Textures/Clutter/ClutterFlatNormal.ktx2'
export const NEUTRAL_ORM_KTX2 = 'Textures/Clutter/ClutterNeutralAoRoughMetal.ktx2'
export const ATLAS_DIFFUSE_KTX2 = 'Textures/Clutter/Atlas_Diffuse.ktx2'
export const ATLAS_OPACITY_KTX2 = 'Textures/Clutter/Atlas_Opacity.ktx2'
// Ecotype material Id. Material ids live in KSA's GLOBAL first-wins ModLibrary namespace —
// Core already claims EarthGrassClutterMaterial, Trunk, Leaves, Tree0Cards, Tree1Cards — so this
// must stay project-unique or the mod would silently pick up someone else's material.
export const CLUTTER_MATERIAL_ID = 'CartoonMoonCrowdMaterial'

/**
 * 5 LODs (KSA reads Lods[0..4]); `mesh` is the card GLB stem. Each LOD needs, after its <Mesh>,
 * one <Material Id/> ID-reference PER glTF material of the GLB (concrete material definitions on
 * a LOD throw at load) — our card GLBs have no glTF materials array, which KSA counts as 1, so
 * exactly one reference to the ecotype material. The loader registers the GLB's mesh globally
 * under its glTF mesh name (`<mesh>Card`), so <Mesh Id> uses that same name.
 */
function lodsXml(mesh: string): string {
  return LOD_SCREEN_SIZES.map((px) =>
`                        <LOD MinScreenSize="${px}">
                            <Mesh Id="${mesh}Card" Path="Meshes/Clutter/${mesh}Card.glb" />
                            <Material Id="${CLUTTER_MATERIAL_ID}" />
                        </LOD>`).join('\n')
}

function clutterObjectXml(id: string, mesh: string): string {
  return `                <ClutterObject Name="${id}">
                    <LODs>
${lodsXml(mesh)}
                    </LODs>
                </ClutterObject>`
}

/**
 * ONE ecotype, one ClutterObject per character + a spare, all sharing a single atlas material.
 *
 * This is the only way to scatter several DIFFERENT images mixed across the surface: KSA's
 * placement RNG is seeded by cell position only (Generate.comp), so separate ecotypes would all
 * place at identical positions and z-fight. Within one ecotype the GPU assigns each instance a
 * random objectId → a different card → its tile in the shared atlas (exactly how stock Luna's one
 * rock ecotype mixes 7 rock meshes). The spare object works around an engine off-by-one
 * (objectId = floor(rand*(N-1)) never selects the last object) so every real character shows.
 */
export function groundClutterXml(chars: Character[], a: Args): string {
  const cylinder = a.shape === 'cylinder'
  const objects = chars.map((c) => clutterObjectXml(c.name, c.name))
  objects.push(clutterObjectXml(`${chars[0].name}_spare`, chars[0].name)) // never-shown; reuses char 0's mesh
  const material = cylinder
    ? `                    <UseTerrainMask Value="false" />
                    <DoubleSided Value="false" />
                    <CastShadows Value="true" />
                    <ReceiveShadows Value="true" />
                    <BiasNormalsUp Value="false" />`
    : `                    <Opacity Id="ClutterAtlasOpacity" Path="${ATLAS_OPACITY_KTX2}" Category="Terrain"/>
                    <UseTerrainMask Value="false" />
                    <DoubleSided Value="true" />
                    <CastShadows Value="true" />
                    <ReceiveShadows Value="true" />
                    <BiasNormalsUp Value="true" />`
  return `        <GroundClutter>
            <!-- GENERATED by scripts/build-cartoon-moon.ts. One ecotype; each character is a
                 ClutterObject sharing the atlas material, mixed across the surface by the GPU. -->
            <Ecotype Name="CartoonCrowd">
                <Placement Biomes="Surface,Craters,Maria">
                    <ObjectSeparation M="${a.separation}" />
                    <GenerationRange M="${a.range}" />
                    <MinScale X="${a.minScale}"  Y="${a.minScale}"  Z="${a.minScale}"  />
                    <MaxScale X="${a.maxScale}" Y="${a.maxScale}" Z="${a.maxScale}" />
                    <Orientation Mode="SurfaceNormal" />
                    <MinRotation Degrees="0" />
                    <MaxRotation Degrees="360" />
                    <DistributionTexture Id="TestDistribution" />
                    <DistributionTextureTiling Value="250" />
                    <UseObjectTypeTexture Value="false" />
                </Placement>
${objects.join('\n')}
                <Material Id="${CLUTTER_MATERIAL_ID}">
                    <Diffuse Id="ClutterAtlasDiffuse" Path="${ATLAS_DIFFUSE_KTX2}" Category="Terrain"/>
                    <Normal Id="ClutterFlatNormal" Path="${FLAT_NORMAL_KTX2}" Category="Terrain"/>
                    <AoRoughMetal Id="ClutterNeutralAoRoughMetal" Path="${NEUTRAL_ORM_KTX2}" Category="Terrain"/>
${material}
                </Material>
            </Ecotype>
        </GroundClutter>`
}

/**
 * Clone the stock Luna <PlanetaryBody> into a new "Looney" body: rename it, nudge its orbit,
 * and swap in our cartoon <GroundClutter>. Every Luna terrain/biome texture Id is kept and
 * collides with core (which loads first), so KSA auto-resolves them to core's already-loaded
 * textures — full surface reuse, zero texture copying.
 */
export function buildBodyXml(astroXml: string, groundClutter: string): string {
  const SMA = '4.400000000000000E+05' // ~15% past Luna so the moons don't overlap
  const lines = astroXml.split(/\r?\n/)
  const body: string[] = []
  let inBody = false, inClutter = false, smaDone = false
  for (const line of lines) {
    if (!inBody && /^\s{4}<PlanetaryBody Id="Luna"/.test(line)) {
      body.push(line.replace('Id="Luna"', 'Id="Looney"')); inBody = true; continue
    }
    if (!inBody) continue
    if (inClutter) { if (/^\s{8}<\/GroundClutter>/.test(line)) inClutter = false; continue }
    if (/^\s{8}<GroundClutter>/.test(line)) { body.push(groundClutter); inClutter = true; continue }
    if (!smaDone && /<SemiMajorAxis/.test(line)) {
      body.push(line.replace(/Km="[^"]*"/, `Km="${SMA}"`)); smaDone = true; continue
    }
    body.push(line)
    if (/^\s{4}<\/PlanetaryBody>/.test(line)) { inBody = false }
  }
  if (body.length === 0) throw new Error('buildBodyXml: could not find a <PlanetaryBody Id="Luna"> in the source Astronomicals.xml')
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- GENERATED by scripts/build-cartoon-moon.ts from a stock Luna body. Edit characters',
    '     via the script inputs and re-run; do not hand-edit the terrain. Surface textures are',
    '     reused from core Luna by Id. -->',
    '<Assets>',
    ...body,
    '</Assets>',
    '',
  ].join('\n')
}

const MOD_TOML = `name = "Cartoon Moon"

# Asset bundles (<Assets> root). Registers the new "Looney" body + its cartoon clutter.
assets = ["assets/cartoon_moon.xml"]

# System scenarios (<System> root). Adds a selectable "Sol — Cartoon Moon" star system that
# includes every stock body plus Looney, so the new moon actually loads into the universe.
systems = ["systems/cartoon_sol.xml"]
`

export const SCENARIO_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
    Playable star-system scenario (parsed as KSA SystemInfo). A body loads only if the SELECTED
    scenario lists it via <LoadFromLibrary>; scenarios are NOT merged, so this lists the full
    stock set plus Looney. Reconcile the list against YOUR game's stock scenario
    (Content/core/systems/*.xml) — versions add/rename bodies.
-->
<System Id="CartoonSol">
    <!-- DisplayName takes a Value attribute (it's a StringReference), NOT text content. -->
    <DisplayName Value="Sol — Cartoon Moon" />

    <!-- Every body except the root star needs a Parent so the scenario can build the hierarchy. -->
    <LoadFromLibrary Id="Sol" />
    <LoadFromLibrary Id="Mercury" Parent="Sol" />
    <LoadFromLibrary Id="Venus" Parent="Sol" />
    <LoadFromLibrary Id="Earth" Parent="Sol" />
    <LoadFromLibrary Id="Luna" Parent="Earth" />
    <LoadFromLibrary Id="Mars" Parent="Sol" />
    <LoadFromLibrary Id="Phobos" Parent="Mars" />
    <LoadFromLibrary Id="Deimos" Parent="Mars" />
    <LoadFromLibrary Id="Jupiter" Parent="Sol" />
    <LoadFromLibrary Id="Saturn" Parent="Sol" />
    <LoadFromLibrary Id="Uranus" Parent="Sol" />

    <LoadFromLibrary Id="Looney" Parent="Earth" />
</System>
`

const README_MD = `# Cartoon Moon — KSA ground-clutter mod (GENERATED)

This folder is **generated** by \`scripts/build-cartoon-moon.ts\` and is git-ignored — don't hand-edit
it; re-run the script. It adds **"Looney"**, a Luna clone that reuses Luna's surface textures and
replaces only its ground clutter with your images, surfaced via a selectable **"Sol — Cartoon Moon"**
star system. Pure data + assets, no game code.

## Regenerate

\`\`\`bash
cd scripts && bun install            # once
bun build-cartoon-moon.ts ../ksa-mods/faces            # flat cutout cards (default)
bun build-cartoon-moon.ts ../ksa-mods/faces --cross    # 2-quad cross billboards
bun build-cartoon-moon.ts ../ksa-mods/faces --cylinder # SOLID 3D pegs (face wrapped on a rounded-top cylinder)
\`\`\`

Inputs are PNGs (transparent background = the cutout silhouette / isolated face). Handy flags:
\`--brightness 0.5\` (KSA ~×2-decodes diffuse), \`--fill <hex>\` (cylinder background), \`--bg <hex>\`
(key out a solid background), \`--min-scale/--max-scale\`, \`--separation\`, \`--range\`, \`--zstd\`.
Run with \`--astronomicals <your game's Content/core/Astronomicals.xml>\` to match your install.

## Install + test

1. Copy this folder into the game's mods dir (\`<KSA user dir>/mods/cartoon-moon/\`); launch once so
   KSA adds it to \`manifest.toml\`; ensure it's enabled.
2. Reconcile \`systems/cartoon_sol.xml\`'s \`<LoadFromLibrary>\` list with your game's stock scenario.
3. Launch, pick **"Sol — Cartoon Moon"**, fly to **Looney** (just past Luna), descend.

## KSA requirements the generator bakes in (each crashed during bring-up)

- **Exactly 5 \`<LOD>\`s per \`<ClutterObject>\`** (the renderer reads \`Lods[0..4]\` unconditionally).
- **Every \`<LOD>\` needs \`<Material Id/>\` references after its \`<Mesh>\`** (build 2026.7.5.4892+):
  one per glTF material of the GLB (a GLB with no materials array counts as 1); concrete material
  definitions on a LOD, or a count mismatch, **throw at data load**.
- **Ecotype \`<Material>\` entries need a unique \`Id\`** — material ids are a global first-wins
  namespace (Core claims \`EarthGrassClutterMaterial\`, \`Trunk\`, \`Leaves\`, \`Tree0Cards\`,
  \`Tree1Cards\`), hence the project-unique \`CartoonMoonCrowdMaterial\`.
- **Unique glTF mesh name per GLB** — KSA registers clutter meshes globally by GLB mesh name,
  first-wins, so shared names collapse every character onto the first-loaded mesh. The generator
  names each mesh \`<name>Card\` and the \`<Mesh Id>\` matches it.
- **\`<Normal>\` + \`<AoRoughMetal>\` are mandatory** (dereferenced without a null check) — shared
  synthetic \`ClutterFlatNormal.ktx2\` + \`ClutterNeutralAoRoughMetal.ktx2\` are written for this.
- **Scenario syntax:** \`<DisplayName Value="…"/>\` and a \`Parent="…"\` on every \`<LoadFromLibrary>\`
  except the root star.
`

// --------------------------------------------------------------------------------- main

/** Filename -> a safe XML/identifier name, e.g. "cat face.png" -> "CatFace". */
function nameFromPath(p: string): string {
  const stem = p.split('/').pop()!.replace(/\.[^.]+$/, '')
  const cleaned = stem.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  return cleaned || 'Char'
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2))
  const files = await resolveInputs(args.inputs)
  if (files.length === 0) {
    console.error('No input PNGs. Usage: bun build-cartoon-moon.ts <png...|dir> [options]')
    process.exit(1)
  }

  const astroXml = await Bun.file(args.astronomicals).text().catch(() => {
    throw new Error(`could not read Astronomicals.xml at ${args.astronomicals}`)
  })

  // Clear previously-generated clutter assets so stale per-character files don't linger when the
  // set of faces changes (this folder is generated — see README).
  await rm(`${args.out}/Textures/Clutter`, { recursive: true, force: true })
  await rm(`${args.out}/Meshes/Clutter`, { recursive: true, force: true })

  // Shared 1×1 PBR maps every clutter material needs (the renderer dereferences Normal + PBR
  // unconditionally). Flat tangent-space normal (128,128,255) and matte non-metal AoRoughMetal
  // (AO=255, rough≈230, metal=0); both linear. All ecotypes reference these by the same Id.
  const solid = (r: number, g: number, b: number) =>
    encodeImageToKtx2({ width: 1, height: 1, levels: [{ width: 1, height: 1, rgba: new Uint8Array([r, g, b, 255]) }] }, { srgb: false, zstd: args.zstd })
  await Bun.write(`${args.out}/${FLAT_NORMAL_KTX2}`, await solid(128, 128, 255))
  await Bun.write(`${args.out}/${NEUTRAL_ORM_KTX2}`, await solid(255, 230, 0))

  // Decode every face, then pack into ONE shared atlas. A single ecotype with one ClutterObject
  // per atlas tile is the only way KSA mixes different images across the surface (separate
  // ecotypes place identically and z-fight — that was the "same image flickering" bug).
  const usedNames = new Set<string>()
  const chars: Character[] = []
  const faces: Decoded[] = []
  for (let i = 0; i < files.length; i++) {
    let name = args.names?.[i] ?? nameFromPath(files[i])
    while (usedNames.has(name)) name += '_'
    usedNames.add(name)
    let img = decodePng(await Bun.file(files[i]).arrayBuffer())
    img = applyBackgroundKey(fitToMaxSize(img, args.maxSize), args.bg)
    faces.push(img)
    chars.push({ name })
  }

  const cylinder = args.shape === 'cylinder'
  const tile = Math.min(512, Math.floor(2048 / Math.ceil(Math.sqrt(faces.length))))
  const { atlas, rects } = buildAtlas(faces, tile)

  // One atlas diffuse (+ opacity for cutout cards). Cylinder is solid → composite over the fill
  // colour (no holes) and no opacity map; flat cards keep the alpha as the cutout silhouette.
  const diffuseSrc = cylinder ? flattenOverBg(atlas, args.fill) : bleedRgb(atlas)
  const diffuse = await encodeImageToKtx2(buildMipChainOf(diffuseLevel(diffuseSrc, args.brightness)), { srgb: true, zstd: args.zstd })
  await Bun.write(`${args.out}/${ATLAS_DIFFUSE_KTX2}`, diffuse)
  let opacityKb = '—'
  if (!cylinder) {
    const opacity = await encodeImageToKtx2(buildMipChainOf(opacityLevel(atlas)), { srgb: false, zstd: args.zstd })
    await Bun.write(`${args.out}/${ATLAS_OPACITY_KTX2}`, opacity)
    opacityKb = kb(opacity)
  }

  // One card mesh per character, UV-mapped to its atlas tile. The glTF mesh name must be unique
  // per character (KSA registers clutter meshes globally by GLB mesh name, first-wins) and match
  // the <Mesh Id> in the XML — both use the `<name>Card` convention.
  for (let i = 0; i < chars.length; i++) {
    const meshName = `${chars[i].name}Card`
    const glb = cylinder ? buildCylinderGlb(rects[i], meshName) : buildCardGlb(rects[i], args.shape === 'cross', meshName)
    await Bun.write(`${args.out}/Meshes/Clutter/${meshName}.glb`, glb)
  }

  console.log(`  ${chars.length} face(s) -> ${atlas.width}x${atlas.height} atlas  diffuse ${kb(diffuse)}  opacity ${opacityKb}  (${args.shape})`)

  // The clutter is embedded directly into the body — KSA has no standalone clutter asset, so
  // assets/cartoon_moon.xml is the single file the game loads.
  const groundClutter = groundClutterXml(chars, args)
  await Bun.write(`${args.out}/assets/cartoon_moon.xml`, buildBodyXml(astroXml, groundClutter))

  // Write mod.toml + scenario only if absent, so user edits are preserved.
  if (!(await Bun.file(`${args.out}/mod.toml`).exists())) await Bun.write(`${args.out}/mod.toml`, MOD_TOML)
  if (!(await Bun.file(`${args.out}/systems/cartoon_sol.xml`).exists())) await Bun.write(`${args.out}/systems/cartoon_sol.xml`, SCENARIO_XML)
  // README is generated docs (the folder is git-ignored + regenerated), so always refresh it.
  await Bun.write(`${args.out}/README.md`, README_MD)

  console.log(`\nWrote mod for ${chars.length} character(s) -> ${args.out}`)
  console.log('Next: copy that folder into your KSA mods dir, launch, pick "Sol — Cartoon Moon", fly to Looney.')
}

function buildMipChainOf(base: ImageLevel) {
  return { width: base.width, height: base.height, levels: buildMipChain(base) }
}

const kb = (u: Uint8Array) => `${(u.byteLength / 1024).toFixed(1)}KB`

if (import.meta.main) {
  main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1) })
}
