# Texturing

Textured PBR rendering of SubParts using the game's real texture atlases. Full design
rationale (verified against the KSA decompiled shaders) is in
`plans/FLEXO_TEXTURING.md`; this doc describes the **implemented** system.

## The texture files

Per category, KSA ships 2048² KTX2 atlases, 12 mips, **Zstd-supercompressed**. As
shipped they are *raw block-compressed* BCn (the map below), which is a desktop-GPU
format with **no fallback** — it only uploads where the browser exposes
`EXT_texture_compression_bptc`/`rgtc` (desktop Chrome), so it rendered untextured on
most Android GPUs and on Firefox/Safari.

| Map | File suffix | Shipped format | Use |
|---|---|---|---|
| Diffuse | `_Diffuse.ktx2` | BC7 | base color (sRGB) |
| AoRoughMetal | `_PBR.ktx2` | BC7 | packed: **AO=R, Rough=G, Metal=B** |
| Normal | `_Normal.ktx2` | BC5 | tangent normal, 2-channel RG |
| Emissive | `_Emissive.ktx2` | BC4 | single-channel (R) mask |

**The atlases flexo serves are re-encoded offline to UASTC (Basis Universal)** by
`flexo-private-assets/tools/reencode-textures-uastc.py` (preserving each map's exact
bytes + transfer function). `KTX2Loader` then transcodes UASTC at runtime to BC7
(desktop), ASTC / ETC2 (mobile), or uncompressed RGBA8 when a device supports no
compressed format — so SubParts render on **every** GPU/browser. The re-encode runs
in place over `assets/Textures/` and **skips `Characters/`** (kitten atlases stay raw
BC7 — flexo can bundle those verbatim into exported KSA mods, where the game needs
real BC7). Re-run it after each game-asset sync (it's idempotent). The decode/encode
needs the KTX-Software `ktx` v4 CLI + `pip install texture2ddecoder zstandard Pillow`.

## Pipeline (`src/three/`)

| File | Role |
|---|---|
| `textureSupport.ts` | Renderer-aware `KTX2Loader` singleton (`setTranscoderPath('/basis/')` + `detectSupport`). `isBcnSupported()` probes `EXT_texture_compression_bptc`/`rgtc` — it now **only** gates the raw-BC7 kitten (`Characters/`) atlases; UASTC SubPart atlases ignore it (they always transcode). |
| `TextureCache.ts` | `loadTexture(url, 'srgb'|'linear')` — loads once, caches, tags color space. Diffuse = `SRGBColorSpace`; normal/PBR/emissive = `NoColorSpace` (linear). |
| `MaterialFactory.ts` | `getSharedMaterial(entry)` builds a `MeshStandardMaterial` per material-id (cached); flat fallback only when the SubPart has no diffuse atlas. |
| `normalMapPatch.ts` | `onBeforeCompile` patch: BC5 normal decode + BC4 emissive broadcast. |

`textureSupport.initTextureSupport(renderer)` is called from `EditorScene`'s
constructor (right after the `Viewport`, before any SubPart build).

## Material mapping (replicates KSA's vessel shader)

- `map` = diffuse (sRGB).
- AoRoughMetal: the **same** texture assigned to `aoMap`, `roughnessMap`,
  `metalnessMap`. three.js reads `.g` for roughness, `.b` for metalness, `.r` for AO
  — exactly KSA's packing. `material.metalness = material.roughness = 1` (no
  down-scaling, like KSA). **`aoMap.channel = 0`** (KSA uses TEXCOORD_0 for all maps;
  three's aoMap defaults to a 2nd UV set which our geometry lacks).
- `normalMap` = BC5 texture, `TangentSpaceNormalMap`, `normalScale=(1,1)`.
- `emissiveMap` = BC4 texture, `emissive=white`, `emissiveIntensity=1.25`
  (KSA `EMISSIVE_MULTIPLIER`).

### Shader patch (`normalMapPatch.ts`)
BC5 has no blue channel, so the stock normal path breaks. The patch replaces
`#include <normal_fragment_maps>` to: read `.rg`, **flip X** (`mapN.x = -mapN.x`,
matching KSA), `mapN.xy *= normalScale`, reconstruct `z = sqrt(1 - x² - y²)`, then
`normal = normalize(tbn * mapN)` (`tbn` is three's derivative tangent frame). It also
replaces `#include <emissivemap_fragment>` to broadcast `.rrr` (BC4 is R-only).
`customProgramCacheKey` lets materials with the same flags share a compiled program.

## Per-instance material clones (important)

`getSharedMaterial` is cached per material-id, but the **selection highlight** mutates
`emissive`. So `SubPartObject.create` **clones** the shared material per instance
(textures stay shared by reference) and **re-applies** the shader patch on the clone —
`Material.clone()` does NOT copy `onBeforeCompile`/`customProgramCacheKey` (verified).
The highlight saves/restores the original `emissive` + `emissiveIntensity`.

## Lighting / tonemapping (`Viewport.ts`)

KSA outputs linear HDR and tonemaps in a composite pass. Flexo approximates with
`ACESFilmicToneMapping`, `outputColorSpace = SRGBColorSpace`, and a `RoomEnvironment`
PMREM environment (`scene.environment`) so metals reflect instead of rendering black.
Tune `renderer.toneMappingExposure`.

## Browser support

**Universal.** Because the SubPart atlases are UASTC, `KTX2Loader` transcodes them to
whatever the device supports — BC7 on desktop, ASTC/ETC2 on Android, and uncompressed
RGBA8 as a last resort — so SubParts render on Chrome, Firefox, Safari, and Android
Chrome/Firefox alike. The transcoder worker assets live in `public/basis/` and are
copied to `dist/` automatically by Vite.

The one exception is the **kitten `Characters/` atlases**, still raw BC7 so they can be
bundled verbatim into exported KSA mods. On a GPU without BPTC/RGTC (`isBcnSupported()`
false) kittens render flat-grey. Converting them too (keeping the BC7 original for
bundle-export) is a follow-up.

## Caveats / not done
- This doc covers **built-in** KSA part textures. **User-authored** emissive (glow) and the kitten
  visor glass tint reuse this exact emissive render path — see [custom-assets.md](./custom-assets.md).
- Verify normal orientation visually; if relief looks inverted, toggle the
  `mapN.x = -mapN.x` line.
- ThinFilm (`*_TFI.dds`) heat-glow and detail textures are intentionally not
  implemented.
- Texture files only load in dev unless production bundling is set up — see
  [asset-pipeline.md](./asset-pipeline.md).
