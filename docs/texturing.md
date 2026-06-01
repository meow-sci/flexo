# Texturing

Textured PBR rendering of SubParts using the game's real texture atlases. Full design
rationale (verified against the KSA decompiled shaders) is in
`plans/FLEXO_TEXTURING.md`; this doc describes the **implemented** system.

## The texture files

Per category, KSA ships 2048² KTX2 atlases, 12 mips, **Zstd-supercompressed**, in
concrete BCn formats (NOT Basis Universal):

| Map | File suffix | Format | Use |
|---|---|---|---|
| Diffuse | `_Diffuse.ktx2` | BC7 | base color (sRGB) |
| AoRoughMetal | `_PBR.ktx2` | BC7 | packed: **AO=R, Rough=G, Metal=B** |
| Normal | `_Normal.ktx2` | BC5 | tangent normal, 2-channel RG |
| Emissive | `_Emissive.ktx2` | BC4 | single-channel (R) mask |

## Pipeline (`src/three/`)

| File | Role |
|---|---|
| `textureSupport.ts` | Renderer-aware `KTX2Loader` singleton (`setTranscoderPath('/basis/')` + `detectSupport`); probes `EXT_texture_compression_bptc`/`rgtc`. If absent → `isTextureSupported()` is false and we fall back to the flat material (one console warning). |
| `TextureCache.ts` | `loadTexture(url, 'srgb'|'linear')` — loads once, caches, tags color space. Diffuse = `SRGBColorSpace`; normal/PBR/emissive = `NoColorSpace` (linear). |
| `MaterialFactory.ts` | `getSharedMaterial(entry)` builds a `MeshStandardMaterial` per material-id (cached); flat fallback otherwise. |
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

Targets **Chrome** (its ANGLE backend exposes BC7/BC5/BC4 even on Apple Silicon).
Safari on Apple Silicon generally can't upload these; there `isTextureSupported()`
is false and parts render flat-grey. The transcoder worker assets live in
`public/basis/` and are copied to `dist/` automatically by Vite. For a universal
(Safari) path, see the offline-conversion appendix in `plans/FLEXO_TEXTURING.md`.

## Caveats / not done
- This doc covers **built-in** KSA part textures. **User-authored** emissive (glow) and the kitten
  visor glass tint reuse this exact emissive render path — see [custom-assets.md](./custom-assets.md).
- Verify normal orientation visually; if relief looks inverted, toggle the
  `mapN.x = -mapN.x` line.
- ThinFilm (`*_TFI.dds`) heat-glow and detail textures are intentionally not
  implemented.
- Texture files only load in dev unless production bundling is set up — see
  [asset-pipeline.md](./asset-pipeline.md).
