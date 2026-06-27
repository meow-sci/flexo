# Scope — Kittens (Character rendering)

> flexo renders the 3 default KSA EVA "kittens" (Hunter/Polaris/Banjo) as **editor-only**
> scale/placement aides (never exported) — a faithful three.js re-implementation of KSA's
> Character rendering. The contract is a long list of asset/material/bone names + render quirks.

**Baseline:** verified against KSA build **2026.6.9.4750**.
**Baseline status:** ✅ **INTACT** — `CharacterAssets.xml` is byte-identical (md5 match),
`KittenRenderable.cs` is identical, and the eye/glass shader merge (rev 4745) is a verbatim
refactor that **confirms** flexo's cornea-hide + glass-tint assumptions. No code change needed.

---

## Flexo modules

| Path | Role |
|---|---|
| `src/ksa/kittenAssets.ts` | Hard-coded descriptors mirroring `CharacterAssets.xml`: body gltf URL, per-kitten head/eye textures, `kittenBodyMaterials()`, `HIDDEN_BODY_MATERIALS` (cornea hide), `KITTEN_ATTACHMENTS` (helmet/visor/MMU + socket bones), `kittenPartSubMeshes()` (part-ify export). |
| `src/three/KittenObject.ts` | Editor-only aide: clones the skinned body, **bakes the bind pose** to static meshes, skips `HIDDEN_BODY_MATERIALS`, places attachments at `bone.matrixWorld · ATTACHMENT_CORRECTION`. `DoubleSide`. |
| `src/three/kittenBake.ts` | Shared primitives: `loadKittenGltf` (with `DefaultORM.png` redirect), `bakeGeometry` (CPU bind-pose bake), `buildKittenMaterial` (KSA PBR + glass-tint/glow), `ATTACHMENT_CORRECTION`. |

## Game-side anchors

| Concern | Source (NEW) |
|---|---|
| Character asset manifest | `Content/Core/CharacterAssets.xml` — gltf sources, textures, sockets, indices, per-kitten mapping. **Unchanged.** |
| Render setup | `decomp/KSA/CharacterRenderResources.cs` — `FurRenderer`/`GlassRenderer`/`EyeRenderer`. **Changed (shader merge).** |
| Per-frame render | `decomp/KSA/KittenRenderable.cs` — body-root transform, socket-correction matrices, eye look-at, sclera override. **Identical.** |
| Visor wiring | `decomp/KSA/CharacterAvatar.cs` — `helmet.VisorMesh = StaticMeshRenderable(GlassRenderer,…)`. |
| Kitten visor/cornea shader (in-game) | `Content/Core/Shaders/Mesh/ModelTranslucent.frag` (**NEW**; merges removed `ModelGlass.frag`+`ModelEye.frag`). |
| Export-path glass shader | `Content/Core/Shaders/Mesh/MeshGlassIndirect.frag` — used by exported `<PartModelGlass>`. **Identical.** |

## The contract — what flexo bakes in

**`CharacterAssets.xml` element/attribute names** (all present & unchanged): `<GltfFile Id><Source Path>`; `<PbrMaterial Id><Diffuse Path><Normal Path|Id><AoRoughMetal Path>` (sentinel `<Normal Id="EmptyNormal"/>` + `EmptyAoRoughMetallic.png`); `<CharacterCore><BodySource Id="KittenGlb"/><LeftEyeBoneIndex Name="EyeJoint_L"/><RightEyeBoneIndex Name="EyeJoint_R"/><MaxBoneCount Value="256"/><ScleraMeshIndices Value="6/7"/>`; `<CharacterFur><FurMeshIndex Value="5"/>`; `<CharacterAttachment><Source Id><Socket Name><Materials><AttachmentType>`; `<Character Id><Personality>…`.

**gltf material → role** (body `Characters/Kitten/KSA_Cat.gltf`):
- `model:Kitty_Suit` = suit · `model:KittyHead_mt` = face · `model:M_CHA_Kitten_Head` = fur shell (visible furry head+ears, index 5 — give it the head texture) · `model:KittyEye_mt` = iris (full per-kitten eye texture incl. whites) · `model:Eyes_KittySklera_mt` = clear cornea dome (indices 6,7).
- Flexo keys all material overrides off these **exact names**.

**Per-kitten head/eye diffuse:**

| flexo kind | KSA Character | head | eye |
|---|---|---|---|
| `hunter` | HunterKitten | `KittenHead_Bengal_A.ktx2` | `Kitten_Eye_Green2_A.ktx2` |
| `banjo` | BanjoKitten | `KittenHead_Siamese_A.ktx2` | `Kitten_Eye_Blue_A.ktx2` |
| `polaris` | PolarisKitten | `KittenHead_Tuxedo_A.ktx2` | `Kitten_Eye_Yellow_A.ktx2` |

(All three share body suit `Kitten_EMU_A/N/ORM` + head normal `KittenHead_N`.)

**Other baked assumptions:**
- `HIDDEN_BODY_MATERIALS = {'model:Eyes_KittySklera_mt'}` — KSA renders the cornea with a refractive `EyeRenderer` shader (no opaque equivalent); flexo hides it so the iris shows.
- `DefaultORM.png` → `EmptyAoRoughMetallic.png` redirect (gltfs reference a non-shipped ORM).
- Socket bones `Head_M` (helmet+visor), `Chest_M` (MMU).
- `ATTACHMENT_CORRECTION = RotX(-90)·RotZ(-90)` (column-major three.js), post-multiplied `bone.matrixWorld · CORRECTION`. Derived from KSA's `KittenRenderable.cs` socket correction `RotZ(-π/2)·RotX(-π/2)·boneTransform` (row-major), reordered for the glTF-imported three.js frame. **This matrix is the single knob if attachments look mis-oriented.**
- Bind-pose **bake** (`SkinnedMesh.getVertexPosition` × `matrixWorld`; authored smooth normals via the normal matrix, never `computeVertexNormals()`); `DoubleSide` (mirrored-winding glove). Avoids the 242-bone "collapse to origin" failure.
- Eye look-at is bone-driven (`CatEyeAnim`); flexo bakes the forward-facing bind pose and does not animate.

## Known gotchas
1. **Skinning collapse** — an unbaked 242-bone skeleton collapses every mesh to a ~1cm blob at origin. Must bake.
2. **`DefaultORM.png` 200-OK trap** — dev-server SPA fallback serves `index.html` for the missing PNG; hence the redirect, and every body mesh must be re-textured (never keep embedded materials).
3. **Fur ears** — `M_CHA_Kitten_Head` must get the per-kitten head texture.
4. **Cornea occlusion** — rendered opaque, the sclera whites-out the eyes; must hide.
5. Don't `computeVertexNormals()` (faceted helmet dome from seam-split verts).
6. Attachment correction is required & order-sensitive.
7. `Characters/` atlases stay raw **BC7** (for verbatim mod bundle-export); without BPTC/RGTC they fall back to flat.

## What changed in 4750
- ✅ **Eye/glass shader merge (rev 4745).** `ModelGlass.frag`+`ModelEye.frag` → `ModelTranslucent.frag`, gated by `#ifdef EYE`. The glass `#else` branch is byte-identical to old `ModelGlass.frag` (opacity 0.75, `mix(albedo,0.1,0.9)`); the cornea `#ifdef EYE` branch is identical to old `ModelEye.frag` except a trivial eye-edge alpha tweak. **Cornea-hide + visor `simulateGlass` remain correct.** *COSMETIC.*
- ✅ `CharacterRenderResources.cs` change = the shader-name swap + a `CreateEyeCompileOptions()` macro (`EYE`). `KittenRenderable.cs`, `AnimatedRenderable.cs`, `CharacterAssets.xml` (md5 match), and all kitten gltf/texture names = **unchanged**.
- ✅ `KittenEva.cs` added `IsControllable => true` — gameplay only; flexo never instantiates it.
- 📝 Optional doc nit: three comments (`kittenBake.ts`, `types.ts`, `settingsStore.ts`) attribute the in-game visor-tint values to `MeshGlassIndirect.frag`; the authoritative in-game source is now `ModelTranslucent.frag` `#else` (via `GlassRenderer`). Values identical, so reference-precision only.
- 👀 Watch-item (other cluster): `PartModelGlass.cs` is wiring up `ENABLE_EMISSIVE` plumbing; if a future build makes the glass fragment actually consume emissive, flexo could export truly emissive glass (currently the `glassGlow` two-SubPart workaround is required) — see [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md).
