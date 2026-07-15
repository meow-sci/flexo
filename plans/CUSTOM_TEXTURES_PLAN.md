# Custom Textures → Custom Materials — Analysis & Implementation Plan

**Goal:** a flexo user can author *every* surface property KSA's part renderer supports — base
color, metalness, roughness, ambient occlusion, normal detail, glow — either by uploading images
per channel or by picking simple uniform values (a color picker, two sliders), and export it all
faithfully. Canonical acceptance test: **build a giant red metallic button from primitives**
(cylinder + dome, base color = pure red via color picker, metalness = 1, roughness ≈ 0.15) and
have it render in-game as shiny red metal.

**Companion docs:** `docs/custom-assets.md` (current pipeline reference — accurate),
`plans/done/FLEXO_CUSTOM_ASSETS.md` (v1 rationale), `plans/done/FEATURE_EMISSIVES_PLAN.md` (glow),
`scope/custom-assets-and-mod-export.md` (game contract).

**Evidence baseline:** KSA build 2026.7.3.4826 — decompiled C# at
`ksa-game-assemblies/current/decomp/`, runtime GLSL at
`ksa-game-assemblies/current/Content/Core/Shaders/`, shipped assets at
`flexo-private-assets/assets/`. Every claim below was verified against those sources on
2026-07-14; file paths are given so the next `upgrade-ksa` pass can re-verify.

---

## 1. How KSA renders a part surface (verified analysis)

### 1.1 The material schema: five texture slots, zero scalars

`decomp/KSA/PbrMaterialReference.cs` — the complete `<PbrMaterial>` schema:

| XML element | C# field | Type | Notes |
|---|---|---|---|
| `<Diffuse>` | `DiffuseReference` | `TextureReference` | base color (albedo) |
| `<Normal>` | `NormalReference` | `TexturePowerReference` | tangent-space normal; extra `Power` float attr (default 1.0) — **dead for parts**, see below |
| `<AoRoughMetal>` | `PBRMap` | `TextureReference` | packed AO/roughness/metalness |
| `<Emissive>` | `EmissiveMap` | `TextureReference` | single-channel glow mask |
| `<ThinFilm>` | `ThinFilmMap` | `TextureReference` | packed heat-effects mask (see §1.2) |

**There are no scalar or color parameters on `PbrMaterial`. None.** No tint, no metallic/roughness
factors, no emissive color, no opacity. Every uniform value must be expressed as a texture —
which flexo already does in-game-proven form with `makeSolidKtx2` (1×1 solid KTX2s: the synthetic
FlatNormal/NeutralORM, glass tints, glow solids).

The one scalar in the schema, `<Normal Power="…">` (`decomp/KSA/TexturePowerReference.cs`), is
consumed **only** by `PlanetRenderer.cs:720` for celestial terrain normals. No part-mesh shader or
`PartModel` code reads it — the per-draw GPU data (`PartModel.cs` `PerDrawData`, lines 312–323) is
five texture indices, nothing else. Normal *strength* for parts must be baked into the map's RG
values at encode time.

Slot references: each slot takes `Path=` (mod-relative, forward slashes) and optional `Id=`
(registers the texture for reuse), **or** a bare `Id=` referencing an already-registered texture —
Core does this with its global defaults (`<Normal Id="EmptyNormal"/>` in `CharacterAssets.xml`;
defaults registered in `Content/Core/DefaultAssets.xml:30-41`: `EmptyWhite`, `EmptyBlack`,
`EmptyNormal`, `DefaultNormalMap`, `DefaultPbrMap`, `DefaultAlbedo`). `Category` attr
(`Default|Terrain|Vessel`) only selects a max-texture-size bucket
(`TextureReference.Bind` → `GameSettings.GetMaxTextureSize(Category)`); keep `Vessel`.

Dedupe gotchas (`PbrMaterialReference.OnDataLoad`): a material with none of
Diffuse/Normal/AoRoughMetal set is treated as an *Id reference*; a duplicate Id fails
`ModLibrary.Register` and silently becomes a reference to the first — so **material Ids must be
project-unique and never collide with Core ids** (flexo's `flexo_…` prefix already guarantees
this).

### 1.2 What the mesh shader does with each channel

`Content/Core/Shaders/Mesh/MeshIndirect.frag` (the opaque part shader; feature defines
`ENABLE_EMISSIVE / ENABLE_THIN_FILM / ENABLE_TEMPERATURE / ENABLE_FROST` are compiled per
pipeline):

**Diffuse** — sampled and *manually* gamma-decoded in the shader:

```glsl
vec3 sampledColor = gammaToLinear(texture(... diffuseTextureIndex ..., inUv).xyz);
```

**AoRoughMetal** — channel order confirmed, the comment is in the shader itself:

```glsl
vec3 sampledPbr = texture(... pbrTextureIndex ..., inUv).xyz;
// Following GLTF spec
float rough = sampledPbr.g;
float metallic = sampledPbr.b;
float ao = sampledPbr.r;
```

So **R = occlusion, G = roughness, B = metalness** — exactly the glTF convention, and exactly how
flexo's `MaterialFactory.buildTextured` already wires built-in atlases. AO is multiplied by SSAO
and only attenuates ambient/IBL (`getPBRLightingAmbient(..., ao, ...)`); roughness/metalness go
straight into the BRDF with `F0 = mix(vec3(0.04), sampledColor, metallic)` — the standard
metallic-workflow model (same as three.js `MeshStandardMaterial`).

**Normal** — RG-only, X-flipped, Z reconstructed, and — the important discovery — **tangents are
derived per-pixel from screen-space derivatives**, not vertex data
(`Content/Core/Shaders/Common/SharedFrag.glsl:8-35`):

```glsl
mat3 cotangent_frame( vec3 N, vec3 p, vec2 uv ) {           // dFdx/dFdy based
vec3 getNormalFromMap_ShaderX(vec3 normalMap, vec3 N, vec3 V, vec2 uv) {
    normalMap.x = -normalMap.x;                             // X-flip convention
    normalMap.z = sqrt(1.0 - clamp(dot(normalMap.xy, normalMap.xy), 0.0, 1.0));
    mat3 TBN = cotangent_frame( N, -V, uv );
```

Consequence: **custom normal maps work on flexo's exported GLBs as-is** — no TANGENT vertex
attribute is needed (KSA's own GLBs ship none either). flexo's editor-side
`src/three/normalMapPatch.ts` already replicates this exact decode (RG, X-flip, Z-reconstruct) for
built-in atlases, so editor/in-game parity is a solved problem.

**Emissive** — single channel (`.x`), added as *white* light after lighting, with the mask value
itself gamma-decoded; `EMISSIVE_MULTIPLIER` is 1.25 (`Common/Lighting.glsl`):

```glsl
float sampledEmissive = texture(... emissiveTextureIndex ..., inUv).x;
if (sampledEmissive.x != 0.0) {
    if (addEmissiveColor) {                                  // runtime path (Lights)
        vec3 unpacked = unpackRGB(inEmissiveColor);          // per-INSTANCE packed color
        lightColor += gammaToLinear(unpacked * EMISSIVE_MULTIPLIER);
    } else {
        lightColor += gammaToLinear(vec3(sampledEmissive) * EMISSIVE_MULTIPLIER);
    }
}
```

Two notes: (a) glow *color* still lives in the diffuse (flexo's composite approach stays correct);
(b) the `addEmissiveColor` path is per-instance **runtime** state (`PartModel.cs`
`PerInstanceData.EmissiveColor` + state-flag bits 6/7) used by Light modules
(`PartModelDynamicModule.cs:102` ties dynamic emissive to the part's `LightSwitch` state) — not
authorable from material XML, but it means emissive masks on light-housing SubParts get tinted by
the light's color when lit. Emissive texture index is null-safe (`?? -1`), so the slot is truly
optional.

**ThinFilm** — a packed *heat-effects* mask, not general-purpose iridescence
(`MeshIndirect.frag:132-143`):

```glsl
// X = TFI Thickness    Y = Heat gradient    Z = Frost gradient
sampledHeatTFI = texture(... tfiTextureIndex ..., inUv).xyz;
sampledColor = getThinFilm(inUv, sampledHeatTFI.r, thinFilmInterferenceLut, ..., inTfiThickness);
```

- **R** modulates thin-film interference (rainbow tarnish) via the global
  `ThinFilmInterferenceWaveform.png` LUT, but the whole effect is multiplied by the runtime
  varying `inTfiThickness`, which is `FxTemperatureState.ThinFilmFraction` — starts at 0,
  accumulates only as the part *heats* (`FxTemperature.cs:108`), and is only plumbed through
  **`PartModelDynamic`** instance data (`PartModelDynamic.cs:317`,
  `PartModelDynamicModule.cs:118`). Plain `<PartModel>`'s `PerInstanceData` has **no** TfiThickness
  field → static parts never show iridescence at rest.
- **G** drives re-entry heat glow: `lightColor += pow(temperatureLut(G × temp × 1.75), 2)² × 2.25`
  when the part is hot (`ENABLE_TEMPERATURE`).
- **B** marks where frost accumulates when cold (`ENABLE_FROST`, triplanar frost overlay).

So ThinFilm = "where does this part tarnish / glow / frost under thermal load", requires
`PartModelDynamic` + the game's thermal sim, and is invisible on a bench part. That makes it an
*advanced, later* feature for flexo, not part of the core material editor.

Also present but purely runtime (not authorable): per-instance `Wetness` (rain), the selection
highlight, and `Internal`/`RayTracing`/`ShadowCaster` flags on the model element (already modeled
by flexo where needed).

### 1.3 Hard renderer requirements (why every channel must exist)

`PartModel.cs` `WriteInstancesToGpu` (lines 410–421):

```csharp
DiffuseTextureIndex = Template.Material.DiffuseReference.BindlessHandle,   // no null check
NormalTextureIndex  = Template.Material.NormalReference.BindlessHandle,    // no null check
PbrTextureIndex     = Template.Material.PBRMap.BindlessHandle,             // no null check
EmissiveTextureIndex = (Template.Material?.EmissiveMap?.BindlessHandle ?? (-1)),
TfiTextureIndex      = (Template.Material?.ThinFilmMap?.BindlessHandle ?? (-1))
```

**Diffuse + Normal + AoRoughMetal are hard-required on every placed part** (null-deref otherwise —
same for the thumbnail renderer flexo already guards against). Emissive and ThinFilm are optional
(`-1` sentinel). flexo's existing always-emit-three-channels invariant is exactly right and stays.
(A SubPart with *no* `<Material>` at all remains fine — flexo ships those today, in-game verified.)

### 1.4 Texture loading & the sRGB double-decode discovery

`decomp/Brutal.TextureApi.Ktx/Loader.cs` + `decomp/RenderCore/TextureAsset.cs` +
`decomp/KSA/TextureReference.cs`:

- KTX2 files load through **libktx**; Zstd supercompression is inflated transparently; only
  files that *need* transcoding (UASTC, vkFormat 0) are transcoded — to `Rgba32` by default, or
  per the `.toml` sidecar's `scblockformatfamily` (that's how the shipped `_TFI_Heat.ktx2` UASTC
  files work). **Otherwise the file's `vkFormat` is honored verbatim** and becomes the VkImage
  format.
- A `.toml` sidecar (`TextureManifest`) can set `max` size, `mipMaps`, and the transcode family.
  No part texture ships one; flexo doesn't need one.
- KSA Core's own atlases are BC7/BC5/BC4 tagged **UNORM with LINEAR transfer** even for diffuse —
  because, per §1.2, the shader does `gammaToLinear()` itself. The authoring convention is:
  **store sRGB-encoded bytes, tag the container linear/UNORM, let the shader decode once.**

**The bug this exposes in flexo today:** `src/ktx/encodeKtx2.ts` exports diffuse as
`VK_FORMAT_R8G8B8A8_SRGB` (43). The GPU then hardware-decodes sRGB→linear at sample time *and* the
shader applies `gammaToLinear` again — a **double gamma decode**. Fully saturated colors (pure
red, the existing glass tints) are unaffected (0 and 1 are fixed points), which is why in-game
validation passed, but any mid-tone — photos, decals, a picked color like #cc3344 — renders
noticeably too dark/contrasty in-game while looking correct in the editor. Fix in §3.4/Phase 0.
(Newer Core assets — LightPack BC1_SRGB/BC7_SRGB — appear to carry the same double-decode, so this
is an easy convention to get wrong; flexo should match the dominant UNORM+linear convention.)

### 1.5 Conventions in the shipped assets (survey highlights)

- Materials are declared inline in per-pack `*Assets.xml`; ~14 vessel `PbrMaterial`s serve all
  346 SubParts — **one shared material per pack**, SubParts reference it by Id. Sharing one
  `PbrMaterial` across many SubParts is the *normal* pattern, not an optimization hack.
- Suffix conventions: `<Pack>_TextureAtlas_{Diffuse,Normal,PBR,Emissive,TFI[_Heat]}`;
  characters use `_A/_N/_ORM`. All 14 packs ship Diffuse+Normal+PBR; 5 add Emissive; 3 add
  ThinFilm.
- Emissive masks ship *small* (128–512 px BC4 vs 2048 atlases) — precedent that uniform/low-res
  emissive data is fine.
- Original formats: BC7 (diffuse/ORM), BC5 (normal, RG-only — why the shader reconstructs Z),
  BC4 (emissive), all + Zstd. flexo's uncompressed RGBA8+Zstd remains accepted (in-game verified);
  the shader reading `.rg`/`.x` from RGBA8 works identically.
- Exactly one `PartModelGlass` exists in the whole catalog (IVA window); transparency is a render
  path, not a material property. Ground clutter uses a *different*, richer `<Material>` schema
  (Opacity/Thickness slots, DoubleSided…) — terrain-only, irrelevant to parts.

---

## 2. What flexo ships today, and the exact gaps

Current state (full detail in `docs/custom-assets.md`; verified against code):

- `CustomTexture` = **one sRGB diffuse image** (`src/ksa/types.ts:958-970`), encoded to KTX2 at
  upload, stored in IndexedDB (`tex-src:`/`tex-ktx2:`).
- `CustomMesh.faceTextures` assigns textures per face with UV scale/offset/wrap; **export emits
  one `PbrMaterial` per SubPart using the first textured face only** (secondary face textures
  silently dropped in-game — `getPrimaryTextureId`, `modExport.ts:512-529`).
- Every exported material carries synthetic 1×1 `FlatNormal` (128,128,255) +
  `NeutralORM` (**AO=255, Rough=128, Metal=0**) — `modExport.ts:534-541`. **Metal is hardwired to
  0. This is the single blocker for "red metallic button".**
- Emissive/glow is shipped and correct (whole-mesh or painted mask; color composited into diffuse,
  white mask exported, editor previews via the exact KSA math).
- Editor renders custom faces as `MeshStandardMaterial{ map, metalness: 0.1, roughness: 0.7 }`
  (`MaterialFactory.buildCustomFaceMaterial`) — **doesn't match its own export** (0 / ~0.5).
- The editor scene already has real IBL (`SceneEnvironment.ts`: PMREM RoomEnvironment / 8 HDR
  presets) — metalness previews will look right with zero extra work.

Gap table:

| KSA capability | flexo today | Plan |
|---|---|---|
| Diffuse image | ✅ upload | keep |
| Diffuse uniform color | internal only (`makeSolidKtx2` for tints/glow) | **expose as color picker** (Phase 1) |
| Metalness / roughness / AO | ❌ hardwired AO=1, R=0.5, M=0 | **sliders + optional maps** (Phase 1/2) |
| Normal map | ❌ flat synthetic only | upload + strength (Phase 2) |
| Emissive mask + color | ✅ shipped (whole/painted) | keep; integrate into material UI |
| ThinFilm heat effects | ❌ | advanced, Phase 3 (needs `PartModelDynamic`) |
| Shared material across SubParts | ❌ one per SubPart | emit shared `PbrMaterial` (Phase 1) |
| Color-accurate diffuse | ❌ double gamma decode in-game | **fix encode convention** (Phase 0) |
| Editor preview == export values | ❌ 0.1/0.7 vs 0/0.5 | align (Phase 0) |

---

## 3. Design — first-class `CustomMaterial`

### 3.1 Data model (`src/ksa/types.ts`)

A material is a named, reusable project asset; meshes reference it. Emissive/glow stays per-mesh
(shipped model, it composites into the diffuse per-mesh anyway). Per-face `faceTextures` stays as
the per-face *base-color image + UV* mechanism it already is; a face image overrides the
material's base color on that face.

```ts
/** How a scalar PBR channel is sourced. Grayscale maps read the matching ORM channel on export. */
export type ScalarChannel =
  | { kind: 'value'; value: number }        // 0..1 → solid pixel on export
  | { kind: 'map'; textureId: string }      // grayscale upload

export type BaseColorChannel =
  | { kind: 'color'; color: { r: number; g: number; b: number } }  // 0..255 sRGB
  | { kind: 'map'; textureId: string }

export interface NormalChannel {
  textureId: string
  /** Bump strength, baked into RG at encode (KSA's <Normal Power> is dead for parts). */
  strength: number // default 1
}

export interface CustomMaterial {
  id: string          // "mat_<8hex>"
  name: string        // user label; basis for exported material id
  baseColor: BaseColorChannel            // default { kind:'color', color: 190,196,204 }
  metalness: ScalarChannel               // default { kind:'value', value: 0 }
  roughness: ScalarChannel               // default { kind:'value', value: 0.5 }
  /** Occlusion: white (1.0) unless a map is supplied. Advanced. */
  occlusion?: { textureId: string }
  /** Power-user escape hatch: a pre-packed AO/Rough/Metal image. Overrides the three above. */
  ormPacked?: { textureId: string }
  normal?: NormalChannel                 // absent = flat
}

export type TextureChannel =
  | 'baseColor'      // sRGB content
  | 'normal'         // linear; RG meaningful; X-flip+strength applied at encode
  | 'orm'            // linear packed R=AO G=rough B=metal
  | 'roughness' | 'metalness' | 'occlusion'   // linear grayscale
  | 'emissiveMask'   // linear grayscale (painted glow already covers most uses)

export interface CustomTexture {
  id: string
  name: string
  width: number
  height: number
  /** Channel this image was encoded for. Absent ≡ 'baseColor' (the only pre-materials meaning). */
  channel?: TextureChannel
}

export interface CustomMesh {
  // ...existing fields...
  /** Material for the whole mesh. Absent = legacy untextured (flat gray, no PbrMaterial). */
  materialId?: string
}
```

`EditingPart` gains `customMaterials: CustomMaterial[]`.

**No-migration constitution:** all additions are optional-with-semantic-default — an old snapshot
decodes as "no materials, textures are base-color", which is *the same state a new project starts
in*, not a conversion shim. No `PROJECT_VERSION` bump needed. (If during implementation any field
can't default semantically, the constitutional answer is bump to 3 → boot purge, never convert.)
The stored `tex-ktx2:` blob is treated as a **derived cache of `tex-src:`** (see Phase 0/2
re-encode notes) — regenerating it from source on demand is cache invalidation, not data
migration.

### 3.2 Channel encode table (the contract for `src/ktx/`)

| Channel | Bytes | vkFormat / DFD | Mips | Transforms at encode |
|---|---|---|---|---|
| baseColor (image or solid) | sRGB-encoded RGBA | **`R8G8B8A8_UNORM` + LINEAR** (was SRGB — Phase 0 fix) | sRGB-space box (as today) | none |
| normal | linear RGB | `R8G8B8A8_UNORM` + LINEAR | **linear-space box** | `x' = 255-x` (X-flip); RG scaled about 128 by `strength`; B recomputed for editor sanity |
| orm / grayscale scalars | linear | `R8G8B8A8_UNORM` + LINEAR | linear-space box | grayscale→target channel packing happens at export |
| emissive mask | linear (R meaningful) | `R8G8B8A8_UNORM` + LINEAR | linear box | unchanged from today |
| uniform values | 1×1 solid | as above per kind | 1 level | `makeSolidKtx2` (proven) |

- `decodeImage.ts` gains a linear-mip option (its header already flags the sRGB-space box filter
  as wrong for data maps).
- `encodeKtx2.ts` stays the single format chokepoint; the only signature-level change is that
  "sRGB content" now maps to UNORM+linear *container* tags (bytes unchanged).
- Normal X-flip at encode + previewing through the existing KSA-replica shader patch means a
  standard OpenGL/glTF-convention upload looks identical in editor and game. (A "flip Y
  (DirectX-authored map)" toggle is a cheap Phase 2 nicety.)

### 3.3 Export resolution (per placed custom mesh)

Diffuse source precedence (unchanged in spirit, now with a color option):
**glow-composited diffuse** (if mesh has glow) → **primary face texture** (first textured face,
as today, with UI warning when faces diverge) → **material baseColor** (image, or 1×1 solid from
the color picker) → *no material at all* (mesh has neither material nor face textures — legacy
flat look, still just a `<MeshView>`).

Normal/ORM per material:

- `normal` → copy that texture's stored KTX2; absent → shared `FlatNormal` solid (as today).
- `ormPacked` → copy as-is.
- else if any of metalness/roughness/occlusion is a map → **canvas-pack** at export: size = max
  of supplied maps, R = occlusion map or 255, G = roughness map-or-value, B = metalness
  map-or-value, linear mips.
- else all uniform → `makeSolidKtx2(round(ao·255)=255, round(rough·255), round(metal·255))` —
  the red-button case is exactly `(255, 38, 255)`.

**Shared `PbrMaterial` emission (mirror Core):** emit one `<PbrMaterial>` per unique resolved
channel-set and let multiple SubParts reference it — glow-composited meshes keep a per-mesh
material (their diffuse is per-mesh), everything else dedupes naturally when meshes share a
`CustomMaterial` and face setup. `PartModel Id` stays per-SubPart (hard uniqueness requirement,
unchanged). Material id: `flexo_<SanitizedMatName>_<mat-8hex>_Material`; solid textures dedupe by
value into `Textures/<bundleToken>_<Channel>_<rrggbb>.ktx2`, image channels dedupe by texture id
as today (`<texname>_<texid>_<Channel>.ktx2`).

Serializer: `AssetsPlan` grows a first-class `materials[]` (id + per-channel paths); subParts
reference a `materialId`. The existing per-SubPart channel-override fields (kitten real maps)
become material entries too — one code path. `assetsXmlSerializer` output shape is already proven
for all four channels; this is a restructuring, not new XML.

### 3.4 Phase 0 color-fidelity fixes (independent, do first)

1. **Kill the double gamma decode:** every sRGB-content export (uploaded diffuse, solid tints,
   glow-composited diffuse, glow color solids) switches container tags
   `VK_FORMAT_R8G8B8A8_SRGB`→`_UNORM` + DFD transfer SRGB→LINEAR. **Bytes stay sRGB-encoded.**
   Editor preview is unaffected — `TextureCache.loadTexture` already forces `colorSpace`
   explicitly per call site (it never trusted the DFD; the re-encoded built-in atlases are
   linear-tagged too and render correctly).
   *Existing stored `tex-ktx2:` blobs are stale caches → on hydrate, sniff vkFormat and re-encode
   from `tex-src:` when it's 43 (cache regeneration, not migration).*
   **Gate: in-game A/B before landing** — export a swatch strip (black/25%/50%/75%/white +
   #cc3344) next to a Core part and compare; expected result is mid-tones brightening to match
   the source. One-line revert if Brutal surprises us.
2. **Align editor defaults with export:** `buildCustomFaceMaterial` metalness 0.1/roughness 0.7 →
   **0 / 0.5** (the NeutralORM values actually shipped).
3. *(Optional, cosmetic)* match the emissive response curve: the game does
   `gammaToLinear(mask × 1.25)`, the editor patch adds `mask × 1.25` linearly — mid-strength
   glows preview slightly hot. Add the sRGB-decode into the patch's emissive line.

### 3.5 Editor rendering (`src/three/MaterialFactory.ts`)

Extend `buildCustomFaceMaterial` → `buildCustomMaterial(entry)` mirroring the proven
`buildTextured` wiring:

- baseColor map → `map` (sRGB); baseColor color → `material.color` (no map).
- uniform metal/rough → `metalness`/`roughness` scalars; maps → `metalnessMap`/`roughnessMap`
  /`aoMap` (three reads B/G/R channels respectively — grayscale uploads have R=G=B so separate
  maps are channel-correct without packing; packed ORM binds one texture to all three, `aoMap.channel = 0`,
  scalars forced to 1 — exactly like built-ins).
- normal → `normalMap` + `applyKsaShaderPatches(mat, { normal: true, … })` (the existing KSA
  decode replica gives exact parity with §1.2, including the X-flip).
- Primitives ship no tangents; three.js falls back to derivative-based TBN — the same math family
  as KSA's `cotangent_frame`. If visible seams appear on a test box, bake MikkTSpace tangents the
  way `MeshAtlasCache.ts:71-75` already does for built-ins (editor-only; the export never needs
  them).
- Glow composite path unchanged (it layers on whatever base the material resolves to — extend
  `faceBaseImage` to fall back to the material's solid color).
- Cache key: extend the current blob-URL key to include material identity
  (`materialId:rev` or a content hash) so edits bust `MaterialFactory`'s cache the way texture
  replacement does today.

### 3.6 Presets (pure UX sugar — a preset just fills the uniform fields)

| Preset | metal | rough | Notes |
|---|---|---|---|
| Matte plastic | 0 | 0.85 | default-ish |
| Glossy plastic | 0 | 0.2 | |
| Painted metal | 0 | 0.4 | paint is a dielectric — Core parts read like this |
| Polished metal | 1 | 0.12 | **the button** |
| Brushed metal | 1 | 0.4 | |
| Cast metal | 1 | 0.75 | |
| Chrome / mirror | 1 | 0.04 | |
| Rubber | 0 | 0.95 | |

New-material default = AO 1 / rough 0.5 / metal 0 / base color the flat-gray `0xbfc4cc` — i.e.
exactly what flexo exports today, so "just picked a material, changed nothing" is not a behavior
change.

---

## 4. UX plan

Vocabulary shown to users: **Texture** = an uploaded image (now with a channel kind); **Material**
= how a surface looks (color/metal/rough/normal), reusable across meshes; **Glow / Surface** =
existing per-mesh sections, unchanged.

### 4.1 Surfaces

1. **Add menu (`AddButton.tsx`)** gains "Create material…". "Upload texture…" stays.
2. **`MaterialDialog.tsx` (new)** — create/edit a `CustomMaterial`:
   - Live preview viewport (sphere or the flexo box primitive, studio environment — reuse the
     `CreateMeshDialog` preview pattern; IBL already exists so metals read correctly).
   - Preset `Select` (fills sliders; switching never touches base color).
   - **Base color** row: swatch + color picker ⟷ "use image" toggle → texture `Select`
     (baseColor-channel textures only) + inline "Upload…" shortcut.
   - **Metalness** and **Roughness** rows: kit `Slider` (0–1) with a small "map" affordance to
     swap the slider for a grayscale-texture `Select` (advanced).
   - **Advanced `Disclosure`**: Normal map `Select` + strength `Slider` (0–2); AO map `Select`;
     Packed ORM `Select` (disables the three scalar rows when set, with an explanatory hint);
     "Flip Y (DirectX normal map)" checkbox (Phase 2).
   - Name `TextField`. Create/Save (store action `addCustomMaterial`/`updateCustomMaterial`,
     undo-enrolled via `mutate()`).
3. **`CustomTextureDialog.tsx`** — adds a "This image is…" `Select` (Base color ▾ / Normal map /
   Roughness / Metalness / AO / Packed ORM / Emissive mask), defaulting to Base color. The choice
   drives encode params (§3.2). A texture's channel is shown as a `Tag` badge everywhere and can
   be changed later from `CustomAssetsModal` (re-encodes from `tex-src:`).
4. **`CreateMeshDialog.tsx`** — the "Texture" `Select` becomes **"Material"** (lists
   `customMaterials` + "(none)"), plus a one-click **"New material from image…"** fast path that
   wraps an upload in a default material — the current two-click texture flow stays two clicks.
   (Face seeding: chosen material sets `materialId`; `faceTextures` stays empty unless the fast
   path uploaded an image, which seeds it exactly as today.)
5. **`ManageTexturesPanel.tsx`** (per-mesh) — new **Material** section at top: material `Select` +
   "Edit…" (opens MaterialDialog) + quick metal/rough readout. Existing Glow/Surface sections
   unchanged below it. The per-face section is retitled "Base color per face" and gains a warning
   `Tag` — *"exports use the first face's texture"* — whenever faces reference >1 distinct
   texture (pre-existing lossy behavior, now honest).
6. **`CustomAssetsModal.tsx`** — new **Materials** list (preview chip, name, metal/rough summary,
   usage count, Edit / Delete-with-confirm → clears `materialId` on meshes); Textures list gains
   channel badges and "Change channel…".

### 4.2 The red metallic button, end to end

1. Add → Create mesh… → Cylinder (r 1.5 m, h 0.4 m) → Material: *(new)* → MaterialDialog opens.
2. Preset "Polished metal", Base color → picker → pure red `#ff0000`, name "Red Metal" → Create.
3. Place it; editor shows a shiny red metallic cylinder (IBL reflections already work).
4. Export → mod emits:

```xml
<PbrMaterial Id="flexo_Red_Metal_ab12cd34_Material">
    <Diffuse Path="Textures/MyMod_BaseColor_ff0000.ktx2" Category="Vessel" />
    <Normal Path="Textures/MyMod_FlatNormal.ktx2" Category="Vessel" />
    <AoRoughMetal Path="Textures/MyMod_ORM_ff1eff.ktx2" Category="Vessel" />
</PbrMaterial>
```

   (solid 1×1s: diffuse sRGB-bytes red; ORM = AO 255 / rough ≈ 30 / metal 255) — in-game: a big
   shiny red metal button. Add a `whole` glow and it's a big *lit* red button.

---

## 5. Implementation phases

### Phase 0 — color fidelity groundwork (small; independently shippable)

Touch: `src/ktx/encodeKtx2.ts` (tag mapping), `src/ktx/glowComposite.ts` callers,
`src/state/customAssetStore.ts` (hydrate-time stale-cache re-encode), `src/ksa/modExport.ts`
(solids), `src/three/MaterialFactory.ts` (0/0.5 defaults), optionally
`src/three/normalMapPatch.ts` (emissive curve). Tests: encode container assertions updated.
**Gate: in-game swatch A/B** (§3.4). Also update `scope/custom-assets-and-mod-export.md` contract
item 4 (vkFormat convention) — this is a game-contract-facing change.

### Phase 1 — `CustomMaterial` core, uniform channels only (**delivers the button**)

- `types.ts` (CustomMaterial/ScalarChannel/BaseColorChannel; `CustomMesh.materialId`;
  `EditingPart.customMaterials`), `customAssetStore.ts` (CRUD actions, hydrate, catalog rebuild,
  `meshSignature` extension), `MaterialFactory.ts` (`buildCustomMaterial`, scalar wiring, cache
  key), `modExport.ts` (channel resolution §3.3, solid dedupe, shared-material emission),
  `assetsXmlSerializer.ts` (`materials[]` restructure), UI: `MaterialDialog.tsx` (color +
  sliders + presets + preview), `CreateMeshDialog`/`ManageTexturesPanel`/`CustomAssetsModal`/
  `AddButton` integration, `projectCodec.ts` (`CCustomMaterial` — uniform-only materials are pure
  descriptors and transfer/share cleanly; `hasCustomAssets` keeps gating only texture-backed
  assets).
- Tests: store CRUD/undo, export bundle (solids, sharing, naming), serializer shape, codec
  round-trip.

### Phase 2 — image channels

- Channel-aware upload (`CustomTextureDialog`, `TextureChannel` encode params, linear mips in
  `decodeImage.ts`, normal X-flip+strength encode in a new `src/ktx/channelEncode.ts`), channel
  badges + re-encode-on-change, normal preview parity (`applyKsaShaderPatches` on custom
  materials; tangent check on primitives), grayscale metal/rough/AO maps, packed-ORM passthrough,
  export-side canvas ORM packing.
- Tests: per-channel encode params, X-flip/strength math, ORM pack, export with mixed
  map/value channels.

### Phase 3 — advanced / opportunistic (each optional, in rough priority order)

1. **Heat effects (ThinFilm)**: per-mesh "Heat effects" config (paint or uniform R/G/B zone
   masks), export switches that SubPart to `<PartModelDynamic>` (schema: Mesh+Material only) +
   `<ThinFilm>` — **verify in-game first** that a static modded part gets `FxTemperature` state
   and behaves (bench test: does it frost on the pad / glow on re-entry?). Editor preview: a
   simple "simulate heat" toggle à la `$simulateGlass`.
2. **VRAM: real block compression** — preferred route is now **UASTC** (encoder exists as WASM,
   KSA's loader transcodes it natively — the shipped `_TFI_Heat` files prove the path) **plus a
   `.toml` sidecar** `scblockformatfamily` targeting BC7, since the no-toml default transcodes to
   uncompressed Rgba32 (no VRAM win). Editor loads UASTC via the existing KTX2Loader. This
   supersedes the old "find a BC7 WASM encoder" idea in `docs/custom-assets.md`.
3. Low-res emissive-mask export (KSA precedent: 128–512 px) — shrink painted masks on export.
4. Per-face materials exported faithfully (split SubPart per face-group; placement model impact —
   only if genuinely demanded).

---

## 6. Verification

- **Editor:** unit tests as listed; Playwright (project-local, base `/flexo/`): create material →
  metallic preview screenshot; assign to mesh; badge/warning states. `pnpm` scripts run bare.
- **Export artifact:** existing `modExport.test.ts` style — assert XML shape, KTX2 headers
  (vkFormat 23, transfer linear), solid dedupe, shared material referenced by two SubParts.
- **In-game (user-run, per phase):** Phase 0 swatch A/B; Phase 1 red button + a two-mesh shared
  material + button-with-glow; Phase 2 normal-map orientation asset (arrow/dome bump — confirms
  X-flip), grayscale rough map gradient bar; Phase 3 heat bench test.

## 7. Risks & open questions

- **Phase 0 A/B is a hard gate** — if Brutal special-cases vkFormat 43 somewhere unseen, revert is
  one mapping line. (Confidence high: Core's own convention + `Loader.cs` honoring vkFormat.)
- Shared `PbrMaterial` across custom SubParts — Core does it everywhere; still verify once with
  two primitives.
- Editor derivative-TBN vs MikkTSpace on low-poly primitives — cosmetic risk only; fallback ready.
- `FxTemperature`/`PartModelDynamic` semantics for modded static parts (Phase 3 gate).
- Glow + uniform-color base interplay: composite over solid base — covered by extending
  `faceBaseImage`; test mid-strength glow on colored metal.
- `updateCustomMesh` still has no UI caller — unrelated to this plan, but MaterialDialog's "Edit"
  pattern is the template if/when primitive reshaping gets UI.

## 8. Bookkeeping when implementing

Per the project constitution: update `scope/custom-assets-and-mod-export.md` (new channels, new
vkFormat convention, shared-material emission, ThinFilm when it lands) and
`docs/custom-assets.md` (the "v1 scope — deliberate limitations" and "Reaching full parity later"
sections largely dissolve into this feature); `scope/GAME_UPDATE_CHECKLIST.md` gains the shader
files (`MeshIndirect.frag`, `SharedFrag.glsl`) and `PbrMaterialReference.cs`/`PartModel.cs` as
watch-surfaces for future KSA upgrades.
