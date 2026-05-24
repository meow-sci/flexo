# Flexo — Textured SubPart Rendering Plan

Adds **textured rendering** to flexo's 3D workspace, replacing the flat grey
`MeshStandardMaterial` from the initial pass with the KSA part's real PBR
textures (diffuse / normal / AO-rough-metal / emissive). This plan is written to
be executed by a future coding-agent session with **no prior context** — every
fact below was verified against the KSA decompiled sources and the actual texture
files; every step lists concrete files, APIs, and acceptance criteria.

---

## 0. Orientation & decisions (read first)

### 0.1 What already exists (initial pass, see `plans/FLEXO_INITIAL_PLAN.md`)
- `src/ksa/catalog.ts` already resolves, per SubPart, the texture atlas URLs:
  `diffuseUrl`, `normalUrl`, `aoRoughMetalUrl`, `emissiveUrl` (all `/ksa/Textures/*.ktx2`)
  plus `materialId`. **Texturing consumes these — no catalog changes needed.**
- `src/three/MeshAtlasCache.ts` loads GLB geometry by node name. The geometry
  **has `TEXCOORD_0`** (verified) → three.js exposes it as `geometry.attributes.uv`.
  A single UV set indexes the shared atlas directly (no per-subpart UV transform).
- `src/three/SubPartObject.ts` builds a `THREE.Mesh` with a flat
  `MeshStandardMaterial({color:0xbfc4cc, metalness:0.6, roughness:0.5})`. **This is
  the main thing we replace.**
- `src/three/Viewport.ts` owns the `WebGLRenderer`, scene, camera, lights.
- `src/three/EditorScene.ts` constructs the `Viewport` and is the natural place to
  initialize the texture loader (it has the renderer).

### 0.2 Confirmed environment decisions
- **Target browser: Chrome/Chromium.** On the dev machine (Apple Silicon, arm64),
  Chrome's ANGLE backend exposes `EXT_texture_compression_bptc` (BC7) and
  `EXT_texture_compression_rgtc` (BC5/BC4), so the game's compressed `.ktx2`
  atlases can be uploaded directly. (Safari on Apple Silicon generally cannot — see
  the Appendix fallback if Safari support is ever required.)
- **Strategy: direct KTX2 load** via three.js `KTX2Loader`. No offline
  preprocessing. Include a **runtime capability probe** that, if BC7/BC5 are
  unavailable, logs a clear warning and **falls back to the existing flat
  material** (textures simply don't apply — the app still works).

### 0.3 The texture files (verified from headers)
All atlases are **2048×2048, 12 mip levels, KTX2 container, Zstd-supercompressed
(`supercompressionScheme = 2`)** with concrete BCn `vkFormat`s (NOT Basis
Universal):

| Map (XML element) | Example file | vkFormat | Meaning |
|---|---|---|---|
| `<Diffuse>` | `*_TextureAtlas_Diffuse.ktx2` | 145 = `BC7_UNORM` | base color (RGBA) |
| `<AoRoughMetal>` | `*_TextureAtlas_PBR.ktx2` | 145 = `BC7_UNORM` | packed AO/Rough/Metal |
| `<Normal>` | `*_TextureAtlas_Normal.ktx2` | 141 = `BC5_UNORM` | 2-channel tangent normal (RG) |
| `<Emissive>` | `*_TextureAtlas_Emissive.ktx2` | 139 = `BC4_UNORM` | single-channel (R) emissive mask |
| `<ThinFilm>`/`*_TFI.dds` | — | — | thin-film/heat glow — **out of scope** |

`KTX2Loader` (installed at `node_modules/three/examples/jsm/loaders/KTX2Loader.js`)
references `RGBA_BPTC_Format`, `RED_GREEN_RGTC2_Format`, `RED_RGTC1_Format`,
`KHR_SUPERCOMPRESSION_ZSTD`, and the `VK_FORMAT_BC7_UNORM_BLOCK` / `BC5` / `BC4`
enums — so it can parse and upload all four directly (given GPU support).

### 0.4 KSA shader facts to replicate (verified — file refs in `thirdparty/ksa`)
From `Content/Core/Shaders/Mesh/MeshIndirect.frag` + `Common/SharedFrag.glsl` +
`Common/Shared.glsl` + `Lighting.glsl` + `PostProcess/composite.frag`:

1. **AoRoughMetal packing (glTF convention):** `AO = .r`, `Roughness = .g`,
   `Metalness = .b` (`MeshIndirect.frag:81-85`). → three.js: assign the SAME
   texture to `aoMap` (reads R), `roughnessMap` (reads G), `metalnessMap` (reads B),
   with `material.roughness = 1`, `material.metalness = 1` (no down-scaling).
2. **Diffuse color space:** textures stored UNORM; the shader does gamma→linear =
   `pow(rgb, 2.2)` on diffuse only (`MeshIndirect.frag:80`). → three.js: diffuse
   `map.colorSpace = SRGBColorSpace`; normal/PBR/emissive = `NoColorSpace` (linear).
3. **Normal map:** BC5 RG, unpacked to [-1,1], **X is flipped**
   (`SharedFrag.glsl:29: normalMap.x = -normalMap.x`), Z reconstructed
   `sqrt(1 - x² - y²)` (`:31`), **+Y up (OpenGL convention)**, no precomputed
   tangents (derivative TBN). Normal "Power" field exists but is **not applied**
   in the vessel path → `normalScale = 1`. → three.js needs a custom normal decode
   (Phase 4) because BC5 has no blue channel for the standard path.
4. **Emissive:** single channel used as a mask; `light += gammaToLinear(vec3(e) *
   1.25)` where `EMISSIVE_MULTIPLIER = 1.25` (`Lighting.glsl:9`). Optional
   (index −1 → skipped). Broadcast `.r` to RGB (Phase 6).
5. **No per-instance tint / no baseColorFactor / no rough/metal multipliers** in the
   vessel path. F0 = 0.04 dielectric (three.js default). AO applied to ambient/IBL
   only (three.js does the same).
6. **Tonemapping** happens in a composite pass (ACES/Uncharted2/etc., exposure +
   gamma 2.2). Mesh shader outputs linear HDR. → three.js: `renderer.toneMapping =
   ACESFilmicToneMapping`, `renderer.outputColorSpace = SRGBColorSpace`, plus an
   **environment map for IBL** (Phase 5) so metals aren't black.

---

## Target module layout (new/changed files)

```
public/basis/                     # NEW: KTX2 transcoder worker assets (copied)
  basis_transcoder.js
  basis_transcoder.wasm
src/three/
  textureSupport.ts               # NEW: KTX2Loader singleton + capability probe
  TextureCache.ts                 # NEW: load+cache CompressedTextures, set colorSpace
  MaterialFactory.ts              # NEW: build textured MeshStandardMaterial from catalog
  normalMapPatch.ts               # NEW: onBeforeCompile patch for BC5 RG normals
  SubPartObject.ts                # CHANGED: use MaterialFactory (async), keep flat fallback
  EditorScene.ts                  # CHANGED: init textureSupport(renderer) + scene.environment
  Viewport.ts                     # CHANGED: toneMapping/outputColorSpace + env (or in EditorScene)
```

---

## Phase 1 — KTX2 loader setup + capability probe

**Goal:** A working, renderer-aware `KTX2Loader` singleton, plus a probe that tells
us whether BC7/BC5/BC4 can be uploaded (so we can fall back gracefully).

### Steps
1. **Copy transcoder assets** (offline, one-time; the worker is required even for
   non-Basis files because it also runs the Zstd decoder):
   ```bash
   mkdir -p public/basis
   cp node_modules/three/examples/jsm/libs/basis/basis_transcoder.js public/basis/
   cp node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm public/basis/
   ```
   Vite serves `public/` at the web root, so they resolve at `/basis/`. Commit them.
   (If preferred over committing binaries, add a `postinstall`/prebuild copy script —
   but committing is simplest and deterministic.)
2. `src/three/textureSupport.ts`:
   ```ts
   import * as THREE from 'three'
   import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'

   let loader: KTX2Loader | null = null
   let bcSupported = false

   /** Call once, after the WebGLRenderer exists. Idempotent. */
   export function initTextureSupport(renderer: THREE.WebGLRenderer): void {
     if (loader) return
     loader = new KTX2Loader()
       .setTranscoderPath('/basis/')
       .detectSupport(renderer)
     const gl = renderer.getContext()
     bcSupported =
       !!gl.getExtension('EXT_texture_compression_bptc') &&
       !!gl.getExtension('EXT_texture_compression_rgtc')
     if (!bcSupported) {
       console.warn(
         'flexo: BC7/BC5 texture compression unavailable in this browser/GPU — ' +
         'SubParts will render untextured. Use Chrome, or add an offline PNG ' +
         'conversion step (see plans/FLEXO_TEXTURING.md Appendix).',
       )
     }
   }

   export function getKtx2Loader(): KTX2Loader {
     if (!loader) throw new Error('textureSupport: call initTextureSupport(renderer) first')
     return loader
   }

   export function isTextureSupported(): boolean {
     return bcSupported
   }
   ```
3. In `src/three/EditorScene.ts` constructor, right after `this.viewport = new
   Viewport(host)`, call `initTextureSupport(this.viewport.renderer)` **before** any
   SubPart is built (the catalog/`$part` subscriptions fire during construction, so
   init must precede them — call it before `super`/subscription setup, i.e. as the
   first statement after the Viewport is created).

### Acceptance criteria
- App boots in Chrome with no errors; console shows no BC warning (i.e. BC7/BC5
  detected). In a browser without BC support, the warning fires and the app still
  runs (untextured).

---

## Phase 2 — TextureCache (load + cache, correct colorSpace)

**Goal:** Load each atlas once, cache by URL, and tag color space / flip / channel
correctly. Textures are shared across all SubParts of a category.

### Steps
1. `src/three/TextureCache.ts`:
   ```ts
   import * as THREE from 'three'
   import { getKtx2Loader } from './textureSupport'

   const cache = new Map<string, Promise<THREE.Texture>>()

   type TexKind = 'srgb' | 'linear'

   export function loadTexture(url: string, kind: TexKind): Promise<THREE.Texture> {
     const key = `${url}|${kind}`
     let pending = cache.get(key)
     if (!pending) {
       pending = getKtx2Loader()
         .loadAsync(url)
         .then((tex) => {
           tex.colorSpace = kind === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace
           // KSA samples Vulkan-style (top-left origin). Compressed textures can't
           // be CPU-flipped; KTX2Loader sets flipY=false. GLB UVs are authored to
           // match. If textures appear vertically mirrored at runtime, flip V in
           // geometry UVs instead (do NOT toggle flipY on a compressed texture).
           tex.anisotropy = 8
           tex.needsUpdate = true
           return tex
         })
       cache.set(key, pending)
     }
     return pending
   }
   ```
   Notes:
   - `srgb` only for the diffuse map; everything else is `linear`.
   - Mipmaps come from the file (12 levels); default min filter
     (`LinearMipmapLinearFilter`) uses them — good for distant parts.
   - Do **not** dispose these textures per-instance (shared/cached), mirroring the
     geometry-cache rule in `SubPartObject`.

### Acceptance criteria
- `loadTexture('/ksa/Textures/CoreStructuralA_TextureAtlas_Diffuse.ktx2','srgb')`
  resolves to a `CompressedTexture` (verify `tex.isCompressedTexture === true`,
  `tex.image.width === 2048`).

---

## Phase 3 — MaterialFactory + textured diffuse/AO/rough/metal

**Goal:** Build a textured `MeshStandardMaterial` from a catalog entry and use it in
`SubPartObject`. This is the visible payoff: diffuse color + correct roughness/metal
+ AO. (Normal map = Phase 4; it's additive detail.)

### Steps
1. `src/three/MaterialFactory.ts`:
   ```ts
   import * as THREE from 'three'
   import type { CatalogSubPart } from '../ksa/catalog'
   import { isTextureSupported } from './textureSupport'
   import { loadTexture } from './TextureCache'

   const FLAT = () =>
     new THREE.MeshStandardMaterial({ color: 0xbfc4cc, metalness: 0.6, roughness: 0.5 })

   // Cache one material per material-id (textures are per-category atlases).
   const materialCache = new Map<string, Promise<THREE.Material>>()

   export function buildMaterial(entry: CatalogSubPart): Promise<THREE.Material> {
     if (!isTextureSupported() || !entry.diffuseUrl) {
       return Promise.resolve(FLAT())
     }
     const key = entry.materialId ?? entry.diffuseUrl
     let pending = materialCache.get(key)
     if (!pending) {
       pending = buildTextured(entry).catch((err) => {
         console.warn(`MaterialFactory: textured material failed for ${key}`, err)
         return FLAT()
       })
       materialCache.set(key, pending)
     }
     return pending
   }

   async function buildTextured(entry: CatalogSubPart): Promise<THREE.Material> {
     const [map, pbr] = await Promise.all([
       loadTexture(entry.diffuseUrl!, 'srgb'),
       entry.aoRoughMetalUrl ? loadTexture(entry.aoRoughMetalUrl, 'linear') : null,
     ])
     const mat = new THREE.MeshStandardMaterial({
       map,
       metalness: 1, // KSA applies no metal/rough multiplier; read straight from map
       roughness: 1,
     })
     if (pbr) {
       mat.aoMap = pbr
       mat.roughnessMap = pbr
       mat.metalnessMap = pbr
       mat.aoMap.channel = 0 // KSA uses TEXCOORD_0 for everything (no uv2)
       mat.aoMapIntensity = 1
     }
     return mat
   }
   ```
   - **Channel reads are automatic:** three.js reads `roughnessMap.g`,
     `metalnessMap.b`, `aoMap.r` — exactly KSA's packing. The same texture object in
     all three slots is the standard glTF pattern.
   - **`aoMap.channel = 0`** is essential: three.js defaults `aoMap` to the 2nd UV
     set (uv1); our geometry only has uv (channel 0).
2. **Wire into `SubPartObject`** (`src/three/SubPartObject.ts`):
   - `create()` already loads geometry async. Also `await buildMaterial(catalog)`
     and use the returned material for the mesh instead of the hardcoded flat one.
   - Keep a reference for selection highlight. **Problem:** materials are now shared
     across instances (cached per material-id), but `setSelected()` mutates
     `material.emissive` — that would highlight ALL instances of the same category.
     **Fix:** clone the shared material per instance for the mesh
     (`const instanceMat = sharedMat.clone()`), OR (preferred) move the selection
     highlight off the material: render selection with a separate outline/edges
     overlay, or set `mesh.material = sharedMat` and implement highlight via
     `THREE.Mesh` `onBeforeRender` emissive override. Simplest correct approach:
     **clone the cached material per SubPartObject** (cheap; textures stay shared by
     reference) and keep the existing `setSelected` emissive logic. Update
     `SubPartObject.dispose()` to dispose the per-instance cloned material (textures
     are shared — never dispose them).
   - Preserve the existing flat-material fallback path when textures unsupported.
3. **Emissive shouldn't fight selection highlight:** selection currently sets
   `material.emissive` to a blue tint. With emissive maps (Phase 6) this could
   conflict; for Phase 3 there's no emissive map so it's fine. Revisit in Phase 6.

### Acceptance criteria (verify in Chrome)
- Add a `CoreStructuralA_*` SubPart: it renders with its real surface color and
  visibly varying roughness/metalness (not flat grey). Metals may look dark until
  Phase 5 (env map) — that's expected.
- Adding many SubParts of one category loads each atlas only once (network tab shows
  one fetch per atlas; `materialCache`/`TextureCache` hits thereafter).
- Selecting one instance highlights only that instance (per-instance material clone).

---

## Phase 4 — Normal mapping (BC5 RG → reconstructed, X-flipped)

**Goal:** Apply the BC5 normal atlas with KSA's exact decode (reconstruct Z, flip X,
+Y up). Requires a custom shader chunk because BC5 has no blue channel — the stock
three.js normal path would read z≈−1 and break lighting.

### Steps
1. `src/three/normalMapPatch.ts` — an `onBeforeCompile` that replaces the normal
   decode. **First read the installed chunk** to confirm the TBN variable name for
   this three version:
   `node_modules/three/src/renderers/shaders/ShaderChunk/normal_fragment_maps.glsl.js`
   and `normal_fragment_begin.glsl.js`. In r0.184 the tangentless path computes a
   `mat3 tbn` in `normal_fragment_begin`. The patch:
   ```ts
   import * as THREE from 'three'

   export function applyBc5NormalDecode(material: THREE.MeshStandardMaterial): void {
     material.onBeforeCompile = (shader) => {
       shader.fragmentShader = shader.fragmentShader.replace(
         '#include <normal_fragment_maps>',
         /* glsl */ `
           vec3 mapN = vec3( texture2D( normalMap, vNormalMapUv ).rg * 2.0 - 1.0, 0.0 );
           mapN.x = -mapN.x;                       // KSA flips X
           mapN.xy *= normalScale;                 // normalScale defaults to (1,1)
           mapN.z = sqrt( max( 0.0, 1.0 - dot( mapN.xy, mapN.xy ) ) );
           normal = normalize( tbn * mapN );       // tbn from normal_fragment_begin
         `,
       )
     }
     material.customProgramCacheKey = () => 'flexo-bc5-normal'
   }
   ```
   - Verify the variable is `tbn` (not `vTBN`/`tbn2`) in the installed chunk; adjust
     the last line to match. If `USE_TANGENT` is somehow defined, also handle the
     tangent branch — but our geometry has no tangents, so the derivative `tbn`
     branch applies.
   - `customProgramCacheKey` lets all patched materials share one compiled program.
2. In `MaterialFactory.buildTextured`, also load `entry.normalUrl` (`'linear'`),
   set `mat.normalMap = normalTex`, `mat.normalMapType = THREE.TangentSpaceNormalMap`,
   `mat.normalScale.set(1,1)`, and call `applyBc5NormalDecode(mat)`.
3. **Important ordering:** `onBeforeCompile` must be set before the material is first
   rendered. Since materials are built before the mesh is added to the scene, this is
   satisfied. If a material is cloned per-instance (Phase 3 fix), `onBeforeCompile`
   and `customProgramCacheKey` survive cloning (they're copied by reference) — verify;
   if not, re-apply after clone.

### Acceptance criteria (verify in Chrome)
- Surface detail (panel lines, bolts, bevels) appears via normals and reacts to the
  directional light as the camera/part rotates. Lighting must look **convex where
  the model is convex** (if it looks inverted/inside-out, the X-flip or Z-reconstruct
  is wrong — toggle the `mapN.x = -mapN.x` line to diagnose).
- No shader-compile errors in console.

---

## Phase 5 — Environment/IBL + tonemapping (so PBR reads correctly)

**Goal:** Metals and reflections need an environment to reflect; KSA uses IBL +
tonemapping. Without this, `metalness=1` surfaces render near-black.

### Steps
1. In `Viewport` (or `EditorScene` right after Viewport creation):
   ```ts
   import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
   // ...
   renderer.toneMapping = THREE.ACESFilmicToneMapping
   renderer.toneMappingExposure = 1.0       // tune to taste (KSA exposes + gammas)
   renderer.outputColorSpace = THREE.SRGBColorSpace // (three default; set explicitly)

   const pmrem = new THREE.PMREMGenerator(renderer)
   const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
   scene.environment = envRT.texture
   // keep scene.background as the dark color (do NOT set background to env)
   ```
   Dispose `pmrem` after generating, and dispose `envRT` in `Viewport.dispose()`.
2. Keep the existing `HemisphereLight` + `DirectionalLight` (the directional acts as
   the "sun"/key light for normal-map relief; the env provides ambient + reflections).
   You may lower hemisphere intensity once the env map is in (avoid double-counting
   ambient). Tune `toneMappingExposure` and light intensities so a known part looks
   close to in-game (compare against KSA screenshots if available).

### Acceptance criteria
- Metallic surfaces show reflections/highlights instead of black. Overall exposure
  looks natural (not blown out / not muddy). Roughness variation reads correctly
  (rough = matte, low-rough = sharp highlight).

---

## Phase 6 — Emissive (optional; BC4 single-channel)

**Goal:** Self-illuminated areas (rare; e.g. lights, indicators). BC4 stores one
channel in `.r`; KSA uses it as a mask × 1.25. three.js `emissiveMap` multiplies
`emissive` color by the texture RGB — with R-only data, naive use tints red.

### Steps
1. Only when `entry.emissiveUrl` exists: `mat.emissiveMap = loadTexture(url,'linear')`,
   `mat.emissive = new THREE.Color(0xffffff)`, `mat.emissiveIntensity = 1.25`.
2. Broadcast `.r` → RGB via `onBeforeCompile` (combine with the Phase 4 patch in the
   same callback so there's one `onBeforeCompile`):
   ```glsl
   // replace '#include <emissivemap_fragment>'
   vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
   totalEmissiveRadiance *= emissiveColor.rrr;
   ```
3. **Selection-highlight conflict:** the current `setSelected()` writes
   `material.emissive`. With an emissive map present, that tint also gets multiplied
   by the map (so non-emissive areas won't highlight). Switch the selection highlight
   to **not** rely on `emissive` when an emissive map exists — e.g. use a subtle
   outline (EdgesGeometry/LineSegments) or a rim via `material.emissiveIntensity`
   bump. Simplest: keep emissive-based highlight only for untextured/no-emissive-map
   materials; for emissive-map materials, add an outline overlay. (Outline overlay is
   also a nicer selection affordance generally — consider it for all selection.)

### Acceptance criteria
- A part with an emissive atlas (find one whose `*_Emissive.ktx2` exists, e.g.
  `CoreCommandA`/`CoreElectricalA`) shows glowing regions; non-emissive parts are
  unaffected. Selection still visibly highlights.

---

## Phase 7 — Verification, performance, and cleanup

1. **Visual verification in Chrome** (no automated WebGL test available): build a
   small multi-part assembly across several categories; confirm diffuse, normals,
   roughness/metal, and reflections all read correctly and selection/gizmo still work.
   Re-run the `?debug=dockingport` calibration — it should now be textured.
2. **Memory:** textures are large (BC7 2048² ≈ 5–8 MB GPU each ×3–4 maps ×N
   categories). They're cached per atlas and never disposed during a session — fine
   for a desktop tool. If many categories are loaded, consider an LRU later (out of
   scope).
3. **Disposal correctness:** per-instance cloned materials are disposed in
   `SubPartObject.dispose()`; shared textures and shared cached materials are NOT
   (owned by the caches for the app lifetime). The env render target is disposed in
   `Viewport.dispose()`.
4. **Graceful degradation:** with BC unsupported, everything still renders flat-grey
   (Phase 1 fallback) with one console warning — verify by temporarily forcing
   `bcSupported = false`.
5. **Typecheck/lint/build green:** `pnpm typecheck`, `pnpm lint`, `pnpm build`.

### Acceptance criteria
- Textured parts render correctly in Chrome; untextured fallback works; all checks
  green. Selection, gizmos, inspector, and export are unaffected.

---

## Cross-cutting notes & guardrails
- **No new runtime deps.** Everything uses `three` (KTX2Loader, RoomEnvironment,
  PMREMGenerator are all in `three/addons`). The only new files are the committed
  `public/basis/` transcoder assets.
- **Textures are shared; materials are per-instance clones.** Never dispose a shared
  texture or shared cached material from a SubPartObject.
- **Color space discipline:** diffuse = `SRGBColorSpace`; normal/PBR/emissive =
  `NoColorSpace`. Getting this wrong makes everything look washed-out or too dark.
- **Channel discipline:** AO=R, Rough=G, Metal=B; `aoMap.channel = 0`.
- **Normal decode lives in one place** (`normalMapPatch.ts`) — analogous to how
  `coords.ts` isolates the transform mapping. If normals look inverted, fix it there.
- **Keep the flat-material path** working as the universal fallback; texturing is an
  enhancement layered on top, never a hard dependency.

---

## Appendix — Safari / universal fallback (only if needed later)
If flexo must run where BC7/BC5 aren't available (Safari on Apple Silicon, some
mobile), pre-convert the atlases offline so no GPU compressed-texture support is
needed:
- **Option A (recommended): re-encode to UASTC Basis KTX2.** Install KTX-Software
  (`brew install ktx`), decode each BCn atlas to PNG, then `ktx create --encode uastc
  --format R8G8B8A8_UNORM ...`. `KTX2Loader` then transcodes at runtime to ASTC
  (Apple) or BC7 (desktop) automatically. Keeps mips + small files; one extra UV-set
  caveat aside, no app code changes (same `KTX2Loader` path).
- **Option B: decode to PNG.** Decode each atlas (BC7/BC5/BC4 + Zstd) to PNG once and
  serve PNGs; swap `loadTexture` to `THREE.TextureLoader`. Universal and simplest at
  runtime, but larger downloads and no compressed GPU residency. Requires a BCn+Zstd
  decoder in the offline script (e.g. `ktx-parse` + a Zstd decoder + a BCn decoder,
  or KTX-Software's `ktx extract`).
Either is a build-time asset step, not a runtime dependency. Wire it behind the same
`isTextureSupported()` check so the direct path stays primary on Chrome/desktop.
```
