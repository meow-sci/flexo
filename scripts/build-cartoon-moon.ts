#!/usr/bin/env bun
/**
 * build-cartoon-moon — turn a handful of PNGs into a ready-to-install KSA mod that
 * scatters those images as "cartoon character" ground clutter on a new moon ("Looney").
 *
 * For each input PNG it emits, into ksa-mods/cartoon-moon/:
 *   Textures/Clutter/<name>_Diffuse.ktx2   (sRGB colour)
 *   Textures/Clutter/<name>_Opacity.ktx2   (linear silhouette in R; the clutter shader
 *                                            cuts the card out where opacity.r < 0.5)
 *   Meshes/Clutter/<name>Card.glb           (a vertical quad / cross "card", matching aspect)
 * then regenerates assets/cartoon_moon.xml — the Luna-clone body with one <Ecotype> per
 * character embedded in its <GroundClutter>. That body file is the ONLY thing the game loads
 * (KSA has no standalone ground-clutter asset; clutter lives inside a celestial body). Finally
 * it ensures mod.toml + systems/cartoon_sol.xml exist.
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
 *   --cross               build a 2-quad cross card (visible from all sides) instead of 1 quad
 *   --bg <hex>            for PNGs with no transparency, key out this background colour
 *                         (e.g. --bg ffffff) to make the silhouette
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

// ----------------------------------------------------------------------------- args

interface Args {
  inputs: string[]
  out: string
  astronomicals: string
  names?: string[]
  brightness: number
  maxSize: number
  cross: boolean
  bg?: [number, number, number]
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
      case '--cross': o.cross = true; break
      case '--bg': o.bg = hexToRgb(next()); break
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
    cross: o.cross ?? false,
    bg: o.bg,
    zstd: o.zstd ?? false,
    separation: o.separation ?? 40,
    range: o.range ?? 3000,
    minScale: o.minScale ?? 6,
    maxScale: o.maxScale ?? 12,
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  if (h.length !== 6) throw new Error(`--bg expects a 6-digit hex colour, got "${hex}"`)
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

/** Box-average resize so the longest edge is <= maxSize (no-op if already small). */
function fitToMaxSize(src: Decoded, maxSize: number): Decoded {
  const scale = Math.min(1, maxSize / Math.max(src.width, src.height))
  if (scale >= 1) return src
  const dw = Math.max(1, Math.round(src.width * scale))
  const dh = Math.max(1, Math.round(src.height * scale))
  const out = new Uint8Array(dw * dh * 4)
  const sxStep = src.width / dw
  const syStep = src.height / dh
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y * syStep)
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * syStep))
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x * sxStep)
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * sxStep))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1; sy++)
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * src.width + sx) * 4
          r += src.rgba[i]; g += src.rgba[i + 1]; b += src.rgba[i + 2]; a += src.rgba[i + 3]; n++
        }
      const o = (y * dw + x) * 4
      out[o] = (r / n) | 0; out[o + 1] = (g / n) | 0; out[o + 2] = (b / n) | 0; out[o + 3] = (a / n) | 0
    }
  }
  return { width: dw, height: dh, rgba: out }
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
 * A clutter "card": a unit-tall quad (base at y=0 so it stands on the ground), width = aspect.
 * UVs map the whole image 0..1, upright. `cross` adds a second perpendicular quad so the
 * card reads from any viewing angle (like KSA's grass). Clutter loads mesh index 0 and applies
 * the XML material + opacity cutout, so this is geometry-only (POSITION/NORMAL/TEXCOORD_0).
 */
function buildCardGlb(aspect: number, cross: boolean): Uint8Array {
  const w = aspect
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const idx: number[] = []

  const quad = (verts: [number, number, number][], normal: [number, number, number]) => {
    const base = pos.length / 3
    const uvs: [number, number][] = [[0, 1], [1, 1], [1, 0], [0, 0]]
    for (let k = 0; k < 4; k++) {
      pos.push(...verts[k]); nrm.push(...normal); uv.push(...uvs[k])
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  // Quad in the XY plane, facing +Z.
  quad([[-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, 1, 0], [-w / 2, 1, 0]], [0, 0, 1])
  if (cross) {
    // Perpendicular quad in the ZY plane, facing +X.
    quad([[0, 0, -w / 2], [0, 0, w / 2], [0, 1, w / 2], [0, 1, -w / 2]], [1, 0, 0])
  }

  return packGlb(new Float32Array(pos), new Float32Array(nrm), new Float32Array(uv), new Uint16Array(idx))
}

function packGlb(pos: Float32Array, nrm: Float32Array, uvs: Float32Array, idx: Uint16Array): Uint8Array {
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
    nodes: [{ mesh: 0, name: 'card' }],
    meshes: [{ name: 'card', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, mode: 4 }] }],
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

function lodsXml(name: string): string {
  return LOD_SCREEN_SIZES.map((px, k) =>
`                        <LOD MinScreenSize="${px}">
                            <Mesh Id="${name}Card_LOD${k}" Path="Meshes/Clutter/${name}Card.glb" />
                        </LOD>`).join('\n')
}

function ecotypeXml(c: Character, a: Args): string {
  return `            <Ecotype Name="${c.name}">
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
                <ClutterObject Name="${c.name}Card">
                    <LODs>
${lodsXml(c.name)}
                    </LODs>
                </ClutterObject>
                <Material>
                    <Diffuse Id="${c.name}Diffuse" Path="Textures/Clutter/${c.name}_Diffuse.ktx2" Category="Terrain"/>
                    <Normal Id="ClutterFlatNormal" Path="${FLAT_NORMAL_KTX2}" Category="Terrain"/>
                    <AoRoughMetal Id="ClutterNeutralAoRoughMetal" Path="${NEUTRAL_ORM_KTX2}" Category="Terrain"/>
                    <Opacity Id="${c.name}Opacity" Path="Textures/Clutter/${c.name}_Opacity.ktx2" Category="Terrain"/>
                    <UseTerrainMask Value="false" />
                    <DoubleSided Value="true" />
                    <CastShadows Value="true" />
                    <ReceiveShadows Value="true" />
                    <BiasNormalsUp Value="true" />
                </Material>
            </Ecotype>`
}

export function groundClutterXml(chars: Character[], a: Args): string {
  return `        <GroundClutter>
            <!-- GENERATED by scripts/build-cartoon-moon.ts. One <Ecotype> per character; they
                 share placement so the engine mixes them across the surface. Surface textures
                 are reused from core Luna by Id (see the body); only the clutter is new. -->
${chars.map((c) => ecotypeXml(c, a)).join('\n\n')}
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

  // Shared 1×1 PBR maps every clutter material needs (the renderer dereferences Normal + PBR
  // unconditionally). Flat tangent-space normal (128,128,255) and matte non-metal AoRoughMetal
  // (AO=255, rough≈230, metal=0); both linear. All ecotypes reference these by the same Id.
  const solid = (r: number, g: number, b: number) =>
    encodeImageToKtx2({ width: 1, height: 1, levels: [{ width: 1, height: 1, rgba: new Uint8Array([r, g, b, 255]) }] }, { srgb: false, zstd: args.zstd })
  await Bun.write(`${args.out}/${FLAT_NORMAL_KTX2}`, await solid(128, 128, 255))
  await Bun.write(`${args.out}/${NEUTRAL_ORM_KTX2}`, await solid(255, 230, 0))

  const usedNames = new Set<string>()
  const chars: Character[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    let name = args.names?.[i] ?? nameFromPath(file)
    while (usedNames.has(name)) name += '_'
    usedNames.add(name)

    const buf = await Bun.file(file).arrayBuffer()
    let img = decodePng(buf)
    img = fitToMaxSize(img, args.maxSize)
    img = applyBackgroundKey(img, args.bg)
    img = bleedRgb(img)

    const aspect = img.width / img.height

    const diffuse = await encodeImageToKtx2(buildMipChainOf(diffuseLevel(img, args.brightness)), { srgb: true, zstd: args.zstd })
    const opacity = await encodeImageToKtx2(buildMipChainOf(opacityLevel(img)), { srgb: false, zstd: args.zstd })
    const glb = buildCardGlb(aspect, args.cross)

    await Bun.write(`${args.out}/Textures/Clutter/${name}_Diffuse.ktx2`, diffuse)
    await Bun.write(`${args.out}/Textures/Clutter/${name}_Opacity.ktx2`, opacity)
    await Bun.write(`${args.out}/Meshes/Clutter/${name}Card.glb`, glb)

    chars.push({ name })
    console.log(`  ${name}: ${img.width}x${img.height}  diffuse ${kb(diffuse)}  opacity ${kb(opacity)}  card ${kb(glb)}${args.cross ? ' (cross)' : ''}`)
  }

  // The clutter is embedded directly into the body — KSA has no standalone clutter asset, so
  // assets/cartoon_moon.xml is the single file the game loads.
  const groundClutter = groundClutterXml(chars, args)
  await Bun.write(`${args.out}/assets/cartoon_moon.xml`, buildBodyXml(astroXml, groundClutter))

  // Write mod.toml + scenario only if absent, so user edits are preserved.
  if (!(await Bun.file(`${args.out}/mod.toml`).exists())) await Bun.write(`${args.out}/mod.toml`, MOD_TOML)
  if (!(await Bun.file(`${args.out}/systems/cartoon_sol.xml`).exists())) await Bun.write(`${args.out}/systems/cartoon_sol.xml`, SCENARIO_XML)

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
