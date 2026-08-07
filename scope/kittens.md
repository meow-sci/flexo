# Scope — Kittens (Character rendering)

> flexo renders the 3 default KSA EVA "kittens" (Hunter/Polaris/Banjo) as **editor-only**
> scale/placement aides (never exported) — a faithful three.js re-implementation of KSA's
> Character rendering. The contract is a long list of asset/material/bone names + render quirks.

**Baseline:** re-verified against KSA build **2026.8.5.5168** (decomp @ 5168 + shipped Core XML).
**Baseline status:** ✅ **INTACT** — `CharacterAssets.xml` is byte-identical (md5 match),
`KittenRenderable.cs` is identical, and the eye/glass shader merge (rev 4745) is a verbatim
refactor that **confirms** flexo's cornea-hide + glass-tint assumptions. No code change needed.

---

## Flexo modules

| Path                        | Role                                                                                                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/kittenAssets.ts`   | Hard-coded descriptors mirroring `CharacterAssets.xml`: body gltf URL, per-kitten head/eye textures, `kittenBodyMaterials()`, `HIDDEN_BODY_MATERIALS` (cornea hide), `KITTEN_ATTACHMENTS` (helmet/visor/MMU + socket bones), `kittenPartSubMeshes()` (part-ify export). |
| `src/three/KittenObject.ts` | Editor-only aide: clones the skinned body, **bakes the bind pose** to static meshes, skips `HIDDEN_BODY_MATERIALS`, places attachments at `bone.matrixWorld · ATTACHMENT_CORRECTION`. `DoubleSide`.                                                                     |
| `src/three/kittenBake.ts`   | Shared primitives: `loadKittenGltf` (with `DefaultORM.png` redirect), `bakeGeometry` (CPU bind-pose bake), `buildKittenMaterial` (KSA PBR + glass-tint/glow), `ATTACHMENT_CORRECTION`.                                                                                  |

## Game-side anchors

| Concern                              | Source (NEW)                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Character asset manifest             | `Content/Core/CharacterAssets.xml` — gltf sources, textures, sockets, indices, per-kitten mapping. **Unchanged.**                |
| Render setup                         | `decomp/KSA/CharacterRenderResources.cs` — `FurRenderer`/`GlassRenderer`/`EyeRenderer`. **Changed (shader merge).**              |
| Per-frame render                     | `decomp/KSA/KittenRenderable.cs` — body-root transform, socket-correction matrices, eye look-at, sclera override. **Identical.** |
| Visor wiring                         | `decomp/KSA/CharacterAvatar.cs` — `helmet.VisorMesh = StaticMeshRenderable(GlassRenderer,…)`.                                    |
| Kitten visor/cornea shader (in-game) | `Content/Core/Shaders/Mesh/ModelTranslucent.frag` (**NEW**; merges removed `ModelGlass.frag`+`ModelEye.frag`).                   |
| Export-path glass shader             | `Content/Core/Shaders/Mesh/MeshGlassIndirect.frag` — used by exported `<PartModelGlass>`. **Identical.**                         |

## The contract — what flexo bakes in

**`CharacterAssets.xml` element/attribute names** (all present & unchanged): `<GltfFile Id><Source Path>`; `<PbrMaterial Id><Diffuse Path><Normal Path|Id><AoRoughMetal Path>` (sentinel `<Normal Id="EmptyNormal"/>` + `EmptyAoRoughMetallic.png`); `<CharacterCore><BodySource Id="KittenGlb"/><LeftEyeBoneIndex Name="EyeJoint_L"/><RightEyeBoneIndex Name="EyeJoint_R"/><MaxBoneCount Value="256"/><ScleraMeshIndices Value="6/7"/>`; `<CharacterFur><FurMeshIndex Value="5"/>`; `<CharacterAttachment><Source Id><Socket Name><Materials><AttachmentType>`; `<Character Id><Personality>…`.

**gltf material → role** (body `Characters/Kitten/KSA_Cat.gltf`):

- `model:Kitty_Suit` = suit · `model:KittyHead_mt` = face · `model:M_CHA_Kitten_Head` = fur shell (visible furry head+ears, index 5 — give it the head texture) · `model:KittyEye_mt` = iris (full per-kitten eye texture incl. whites) · `model:Eyes_KittySklera_mt` = clear cornea dome (indices 6,7).
- Flexo keys all material overrides off these **exact names**.

**Per-kitten head/eye diffuse:**

| flexo kind | KSA Character | head                        | eye                        |
| ---------- | ------------- | --------------------------- | -------------------------- |
| `hunter`   | HunterKitten  | `KittenHead_Bengal_A.ktx2`  | `Kitten_Eye_Green2_A.ktx2` |
| `banjo`    | BanjoKitten   | `KittenHead_Siamese_A.ktx2` | `Kitten_Eye_Blue_A.ktx2`   |
| `polaris`  | PolarisKitten | `KittenHead_Tuxedo_A.ktx2`  | `Kitten_Eye_Yellow_A.ktx2` |

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

## What changed in 5168

**Verdict: ✅ INTACT** (one additive asset element, not read by flexo).
`CharacterRenderResources.cs` is byte-identical, and `CharacterAssets.xml` changed by exactly one
line — `<CharacterGroundAnimations>` gained `<AnimRun Id="KittenAnimRunGlb"/>` alongside the
existing `<AnimIdle>` / `<AnimWalk>` (rev 5128's Kitten Animation Controller; note `AnimWalk` and
`AnimRun` currently point at the **same** clip). flexo's `kittenAssets.ts` does not read
`<CharacterGroundAnimations>` at all — it resolves the fur/suit/head/eye materials and the
`Head_M` / `Chest_M` socket bones — so the editor aide is unaffected. The material names and the
embedded-`DefaultORM.png` redirect are unchanged.

The rest of the 5128–5144 kitten work (`KittenLocomotion`, `LocomotionState`/`Mode`/`Command`/
`Facts`, `CharacterControlInputs`, `KittenTuningWindow`) is **new runtime locomotion code** with no
asset-schema or bone-hierarchy component, so it does not reach `KittenObject.ts` or the
`kittenBake.ts` export path. `KittenRenderable.cs` / `AnimatedRenderable.cs` did change, but only
to drive that locomotion state machine.

One data note for anyone comparing kitten geometry: `PartGameData.xml`'s `KittenBackPackSubPart`
moved its part-frame origin to the kitten's **feet** (everything shifted `Z -= 0.431`, and the
collider capsule became a sphere). That is the MMU **part**, not the character mesh, so it does not
touch flexo's kitten rendering — but it is why the vendored fixture moved.

---

## What changed in 5117

**Nothing in this area — re-verified INTACT.** `CharacterAssets.xml` is unchanged (absent from the
`Content` diff), as are `KittenRenderable.cs`, `AnimatedRenderable.cs` and
`CharacterRenderResources.cs`. `ModelTranslucent.frag` and `Fur.frag` each changed by **exactly
one line** — `sunlight *= GetCloudShadow(inWorldPos);` (rev 5100, cloud shadows on vessels and
kittens) — which touches neither the material names, the socket bones, the `ATTACHMENT_CORRECTION`
derivation nor the embedded-`DefaultORM.png` redirect. 5117's large kitten feature set
(`KittenRoster`, name generator, KIA flag, crew assignment) is **save-game and UI only**: it adds
`UniverseData` / `VehicleData` / `IVASeat.SaveData` XML, none of which is part-template data flexo
reads or writes.

## What changed in 5056

**Nothing in this area — re-verified INTACT.** `Content/Core/CharacterAssets.xml` is
byte-identical (md5 `de6607434ddb3c13eeb9a92ad836b9bb` on both snapshots), and
`KittenRenderable.cs`, `AnimatedRenderable.cs` and `CharacterRenderResources.cs` are unchanged.
The only kitten-adjacent diff is `KittenEva.cs`, which gained a `Program.IsModalOpen()` guard in
`UpdateHighlight` (in-game cursor highlighting) plus decompiler `base.` qualifiers — no asset
path, gltf material name, socket bone or `DefaultORM` redirect moved.

## What changed in 5018

**Nothing in this area.** No `Character*` class and no `Characters/` or
`Textures/Characters/` asset changed between 4980 and 5018; `CharacterAssets.xml` is
unchanged. The update is the plumbing-topology + solid-rocket-motor work — see
[plumbing-and-feeds.md](plumbing-and-feeds.md). Re-verified **INTACT**.

## What changed in 4980

**INTACT — no flexo change.** `CharacterRenderResources.cs`'s only 4939→4980 hunk sets the new
cascaded-shadow-filter specialization constant (ID 10) on the fur/glass/eye pipelines —
shadow-quality plumbing, no material/shader-name or contract change. `CharacterAssets.xml`,
`KittenRenderable.cs`, `AnimatedRenderable.cs`, `ModelTranslucent.frag`, and the private
mirror's `Characters/` binaries are all unchanged.

## What changed in 4939

**INTACT — no flexo change.** Zero hits in the 4892→4939 diff: `CharacterAssets.xml`,
`KittenRenderable.cs`, `AnimatedRenderable.cs`, `CharacterRenderResources.cs`, and
`ModelTranslucent.frag` are all unchanged.

## What changed in 4892

**INTACT — no flexo change.** `CharacterAssets.xml`, the Characters gltf/textures,
`KittenRenderable.cs`, `CharacterRenderResources.cs`, and `ModelTranslucent.frag` are all
byte-identical 4826→4892; material names, socket bones, `ATTACHMENT_CORRECTION`, and the
`DefaultORM` redirect stand. The `AnimatedRenderable`/`Cat*Anim` diffs are a runtime
pose-composition refactor (blink/expression/ear mixing moved to a pre-`UpdateLocalTransforms`
TRS pass via the new `IAnimProcessor.UpdateLocalPose`; skinning stays `invBind × world`) —
invisible to flexo's static bind-pose bake. Rev 4869 gave EVA kittens a spawn-clearance push
and `KittenBackPackPart` a 0.35 m sphere `<Collider>` (new root-level `<PartGameData>` in
`PartGameData.xml` — survives flexo round-trip via the unmodeled-child passthrough; the backpack
tank also picked up `<RoleAffinity>Thruster`, owned by gamedata-modules).

## What changed in 4826

**Intact.** `CharacterAssets.xml` + `Characters/` are untouched. `CharacterRenderResources.cs` has a
small internal change (rendering-resource wiring, no schema/material-name change) — and kittens are an
**editor-only aide (never exported)**, so even a real change would only affect the in-editor preview.
The gltf material names + socket bones flexo depends on are unchanged.

## What changed in 4750

- ✅ **Eye/glass shader merge (rev 4745).** `ModelGlass.frag`+`ModelEye.frag` → `ModelTranslucent.frag`, gated by `#ifdef EYE`. The glass `#else` branch is byte-identical to old `ModelGlass.frag` (opacity 0.75, `mix(albedo,0.1,0.9)`); the cornea `#ifdef EYE` branch is identical to old `ModelEye.frag` except a trivial eye-edge alpha tweak. **Cornea-hide + visor `simulateGlass` remain correct.** _COSMETIC._
- ✅ `CharacterRenderResources.cs` change = the shader-name swap + a `CreateEyeCompileOptions()` macro (`EYE`). `KittenRenderable.cs`, `AnimatedRenderable.cs`, `CharacterAssets.xml` (md5 match), and all kitten gltf/texture names = **unchanged**.
- ✅ `KittenEva.cs` added `IsControllable => true` — gameplay only; flexo never instantiates it.
- 📝 Optional doc nit: three comments (`kittenBake.ts`, `types.ts`, `settingsStore.ts`) attribute the in-game visor-tint values to `MeshGlassIndirect.frag`; the authoritative in-game source is now `ModelTranslucent.frag` `#else` (via `GlassRenderer`). Values identical, so reference-precision only.
- 👀 Watch-item (other cluster): `PartModelGlass.cs` is wiring up `ENABLE_EMISSIVE` plumbing; if a future build makes the glass fragment actually consume emissive, flexo could export truly emissive glass (currently the `glassGlow` two-SubPart workaround is required) — see [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md).
