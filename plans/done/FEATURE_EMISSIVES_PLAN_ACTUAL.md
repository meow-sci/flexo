# Feature: Translucent‑tinted + emissive kitten visor (and kitten‑submesh glow)

> **Deliverable / Step 0:** This is **Part 2** of the emissive work. Append it as a new
> top‑level section to `plans/FEATURE_EMISSIVES_PLAN.md` (keep that file's existing Part 1
> intact — it is the foundation this builds on). Implement Part 1's shared primitives first;
> this part reuses them.

## Context

`plans/FEATURE_EMISSIVES_PLAN.md` ("Part 1") adds emissive **glow** to custom *primitive*
meshes (color baked into the diffuse, white mask in `<Emissive>`, editor == export). The user
now wants the **kitten visor** (a part‑ified kitten submesh, already rendered as translucent
glass) to be able to (a) be a **translucent color of their choosing**, and (b) **glow**
(emissive). They accept that translucent+glow can't both apply to one surface if KSA can't do
it, but want an **opaque emissive visor** as the alternative — and chose to **support both**
an opaque‑glow visor *and* a layered glass+glow trick, to extend glow to **all kitten
submeshes**, and to expose a **"simulate in‑game glass"** preview toggle.

This part closes the gap: it brings tint + emissive to the **kitten material path** (a separate
path from Part 1's primitive path) and the **kitten export path**, and adds the glass‑specific
tint + layering.

## Verified KSA reality (the "why" — quote these in code comments)

- **`<PartModelGlass>` → `Shaders/Mesh/MeshGlassIndirect.frag`** (the shader flexo's visor
  already exports through): opacity is **hard‑coded `0.75`** (line 78, "TODO TEMP"); color is
  `glassColor = mix(albedo, vec3(0.1), 0.9)` (line 81) — i.e. the **diffuse contributes only
  ~10%** over a dark base; and **emissive is never sampled** (`emissiveTextureIndex` exists in
  `PerDrawData` line 27 but `main()` never reads it). `ModelGlass.frag` (the in‑game character
  visor) is identical and also ignores its `emissive` sample.
  ⇒ **A glass surface cannot glow, and its tint is muted/dark.**
- **`<PartModel>` → `MeshIndirect.frag`**: *does* sample emissive (`vec3(sampledEmissive) *
  EMISSIVE_MULTIPLIER` added after lighting; `EMISSIVE_MULTIPLIER = 1.25`, `Common/Lighting.glsl`).
  ⇒ **A glowing visor must be opaque** (Part 1's machinery).
- **No CPU KTX2→RGBA decoder exists** in flexo (`src/ktx/decodeImage.ts` handles only
  browser‑decodable images; KSA `.ktx2` load only via the GPU `KTX2Loader`,
  `src/three/textureSupport.ts`). ⇒ We **cannot composite a tint/glow into the visor's detailed
  `.ktx2`**. Instead generate a **solid‑color diffuse** (`makeSolid1x1Ktx2`, `modExport.ts:165`) —
  faithful anyway, since glass mutes diffuse detail to ~10%.
- **KSA's own window = separate glass + opaque SubParts at one transform**
  (`CoreIVASpaceAAssets.xml`: `…WindowGlass` `<PartModelGlass>` and `…RayBlocker`/`…MediumCapsuleA`
  `<PartModel>` are distinct SubParts, each `InstanceOf`'d in the part tree). ⇒ **layered
  glass+glow = two SubParts at the same transform**, the KSA‑faithful pattern.

## How the visor flows today (anchors)

- **Data:** `KittenMeshSource.transparent` (`types.ts:392`, set only on `VISOR_SRC`,
  `kittenAssets.ts:98`); carried on `CustomMesh.kitten` by `makeKittenMeshPart`
  (`customAssetStore.ts:362`). *(Note: the `types.ts:391` comment "ignored on export" is **stale** —
  fix it; export uses it.)*
- **Editor:** part‑ified meshes render via `buildKittenCatalogEntry` →
  `buildKittenMaterial(kittenSpecFromSource(kitten))` (`customAssetStore.ts:153`,
  `kittenBake.ts:128`), which sets `transparent/opacity 0.45/depthWrite=false` (lines 160‑164) and
  hard‑codes `emissive:false` (line 165). Material goes in `customMeshRenderCache`; `SubPartObject`
  renders it. **This is a different path from Part 1's `buildTextured`/`buildGlowingFaceMaterial`.**
- **Export:** `planKittenSubPart` (`modExport.ts:198`) → `glass: src.transparent`
  (line 221) → `AssetsSubPartPlan.glass` → serializer emits `<PartModelGlass>`
  (`assetsXmlSerializer.ts:132`).

## Data model — `src/ksa/types.ts`

```ts
/** Translucent‑glass tint for a glass‑capable (visor) mesh. */
export interface GlassConfig {
  tint: { r: number; g: number; b: number }   // 0..255, baked into a solid sRGB glass diffuse
  opacity?: number                              // EDITOR preview only (default 0.45); in‑game is engine‑fixed ~0.75
}

/** Surface mode for a glass‑capable (transparent) mesh. Undefined ⇒ 'glass' (back‑compat). */
export type VisorSurface = 'glass' | 'glow' | 'glassGlow'

export interface CustomMesh {
  /* …existing… */
  emissive?: EmissiveConfig   // (Part 1) opaque glow — now also wired through the kitten paths
  glass?: GlassConfig         // glass tint; used when surface ∈ {glass, glassGlow}
  surface?: VisorSurface      // only meaningful when kitten?.transparent (the visor)
}
```

- **Glass‑capable iff `m.kitten?.transparent`** (the visor). For any other mesh (primitives,
  opaque kitten submeshes), `glass`/`surface` are ignored and glow is driven by `emissive` alone.
- **`surface` is the source of truth** for the visor (not field presence):
  `glass` ⇒ translucent, no glow · `glow` ⇒ opaque + emissive (no glass shell) · `glassGlow` ⇒
  layered (glass shell + inset emissive layer). The UI writes the matching `{glass?, emissive?}`.
- **Back‑compat:** old projects have `surface===undefined` ⇒ treated as `'glass'` with no tint ⇒
  exact current behavior (real visor diffuse, `<PartModelGlass>`). No migration. Persist/undo are
  automatic (plain JSON on `CustomMesh`).

## Editor preview + "simulate in‑game glass" toggle

- **New atom `$simulateGlass`** (default `false`) in `src/state/settingsStore.ts`; a checkbox in
  the panel. Subscribe → `refreshCatalog()` on change. Include its value in the rebuild trigger.
- **Thread mesh‑level config into the kitten material build.** Change `buildKittenCatalogEntry`
  (`customAssetStore.ts:153`) to build the spec from `m.kitten` **plus**
  `{ glass: m.glass, emissive: m.emissive, surface: m.surface, simulateGlass: $simulateGlass.get() }`.
  Extend `KittenMaterialSpec` (`kittenAssets.ts:28`) + `kittenSpecFromSource` accordingly.
- **Extend `buildKittenMaterial`** (`kittenBake.ts:128`):
  - **Tint:** glass tint set → `mat.color.setRGB(r/255,g/255,b/255)` (three multiplies map×color).
    When `simulateGlass`, bake the in‑game look instead: `color = mix(tint, 0.1, 0.9)` and
    `opacity = 0.75` (mirror the shader's `glassColor`/hard opacity) so editor ≈ game; otherwise
    vivid `tint` + `opacity = glass.opacity ?? 0.45`.
  - **Glow:** for `surface ∈ {glow, glassGlow}` (or any non‑glass mesh with `emissive`), set
    `mat.emissive` = glow color, `mat.emissiveIntensity = strength * 1.25`, optional
    `mat.emissiveMap` = painted‑mask `DataTexture`, and `applyKsaShaderPatches(mat,{…,emissive:true})`
    (currently hard‑coded `false` at line 165 — make conditional). *Kitten editor glow uses a
    **colored emissive uniform** (no CPU KTX2 composite) — a deliberate, documented preview≈export
    divergence: export bakes the color into the diffuse with a white mask per Part 1; both read as a
    colored glow.*
  - **Opacity by surface:** `glow` ⇒ opaque (no `transparent`); `glass` ⇒ transparent (today);
    `glassGlow` ⇒ transparent **and** emissive on one material (the glow shows through — the
    editor approximation of the real two‑SubPart layering).
- **Selection highlight:** part‑ified meshes use `SubPartObject` (not `KittenObject`), which
  snapshots `baseEmissives` from the material and restores after deselect. Verify the snapshot
  captures the glow color/intensity so the highlight restores to the glow, not to black.
- **Rebuild trigger:** add `glass`/`surface`/`emissive` to `meshSignature` (`customAssetStore.ts:142`)
  so undo/redo rebuilds; `$simulateGlass` change refreshes separately.

## Export — `src/ksa/modExport.ts` (+ `src/ktx`)

1. **Generalize the solid‑texture helper.** Replace `makeSolid1x1Ktx2(r,g,b)` (line 165, hard‑coded
   `{srgb:false}`) with `makeSolidKtx2(r,g,b,{srgb})` (lift into `src/ktx/` so Part 1's glow‑only
   path shares it). Existing callers stay linear (`srgb:false`); the **tint diffuse uses
   `srgb:true`** — the glass shader does `gammaToLinear(diffuse)` (`MeshGlassIndirect.frag:68`), so
   the stored solid must be sRGB to yield the chosen linear color.
2. **`planKittenSubPart` gains the mesh‑level config** (`glass`/`surface`/`emissive`):
   - **`glass` / `glassGlow` shell:** if `glass.tint` set → `diffusePath` = a generated
     `makeSolidKtx2(tint, {srgb:true})` bundled as `Textures/<bundleToken>_<subPartId>_Diffuse.ktx2`;
     keep normal/ORM as today; `glass: true`. **No tint** ⇒ current behavior (reference/bundle the
     real visor diffuse), `glass: true`.
   - **`glow` (opaque) surface:** delegate to Part 1's **glow‑only** compositing (kitten has no
     decodable base diffuse → synthetic colored diffuse + white mask): `diffusePath` = composited
     glow‑color diffuse, `emissivePath` = mask, `glass: false`.
3. **Layered expansion — `expandGlassGlow(part): EditingPart`** (call once at the top of
   `buildModZip`/`writeModToFolder`, pass the augmented part to **both** `buildModContent`→
   `serializePart` and `buildCustomBundle` so atlas, subparts, and part tree agree). For each
   **placed** mesh `m` with `surface==='glassGlow'`:
   - append a synthetic `CustomMesh` `{ subPartId: m.subPartId+'_Glow', kitten: m.kitten,
     surface:'glow', emissive: m.emissive, __inset:true, faceTextures:{} }`;
   - for each placement of `m.subPartId`, append a **parallel placement** (cloned transform) with
     `subPartTemplateId = m.subPartId+'_Glow'` (serializePart iterates `part.placements`,
     `partXmlSerializer.ts:61` → two `<SubPart InstanceOf>` at one transform).
   - In `buildCustomBundle`'s node builder (`modExport.ts:290`), when `m.__inset`, **inset** the
     cloned baked geometry (`insetGeometry(geo, ~0.99)` — scale verts toward centroid) so it sits
     just inside the 75%‑opaque glass and shows through (avoids z‑fighting). `buildMeshAtlasGlb`
     auto‑adds the `_Glow_VM` view mesh; serializer emits its `<PartModel>` (opaque) + `<Emissive>`.
4. **`<Emissive>` serialization** is Part 1's change (`emissivePath` on `AssetsSubPartPlan`, emitted
   after `<AoRoughMetal>` in `assetsXmlSerializer.ts`). No new glass serializer change — `glass`
   already drives `<PartModelGlass>` (line 132).

## UI — `src/ui/ManageTexturesPanel.tsx` (+ `customAssetStore` actions)

Extend Part 1's **Glow** section:
- **Glass‑capable mesh (visor):** a **Surface** `Select`: `Glass (translucent)` · `Glow (opaque)`
  · `Glass + Glow (layered)` → sets `surface` and the matching config:
  - *Glass* → **Tint** via `ColorAlphaField.tsx` (color + editor opacity) → `glass={tint,opacity}`,
    clear `emissive`.
  - *Glow* → Part 1's glow controls (color + strength; painted optional) → `emissive`, clear `glass`.
  - *Glass + Glow* → both controls.
  - A **"Simulate in‑game glass"** checkbox (binds `$simulateGlass`) with a caption: KSA renders
    glass darker/subtler (only ~10% of your color) — vivid here, muted in‑game.
- **Non‑glass kitten submeshes (helmet/suit/…) and primitives:** just Part 1's **Glow** section —
  glow is now available on **all kitten submeshes** (scope decision).
- New actions: `setMeshGlass(meshId, GlassConfig|undefined)`, `setMeshSurface(meshId, VisorSurface)`
  (clear the now‑unused sibling config), reuse Part 1's `setMeshGlow`. All `mutate()` +
  `refreshCatalog()`. Slider/color commit on `onChangeEnd` (re‑encode/rebuild is heavier than a tick).

## Files

**New:** `insetGeometry` helper (in `modExport.ts` or `src/three/`); `$simulateGlass`
(`settingsStore.ts`). **(Part 1 new:** `src/ktx/glowComposite.ts` — host `makeSolidKtx2` here.)
**Changed:** `types.ts` (GlassConfig/VisorSurface/CustomMesh + fix stale comment) ·
`kittenAssets.ts` (spec fields) · `kittenBake.ts` (tint + conditional emissive + simulate +
surface opacity) · `customAssetStore.ts` (catalog threading, actions, signature, `$simulateGlass`
sub) · `modExport.ts` (`makeSolidKtx2`, `planKittenSubPart` tint/glow, `expandGlassGlow`, inset) ·
`ManageTexturesPanel.tsx` (Surface selector + tint + checkbox) · docs (`custom-assets.md`,
`texturing.md`, AGENTS.md). **No change:** `assetsXmlSerializer.ts` glass path, `SubPartObject.ts`,
`partXmlSerializer.ts` (the expansion feeds it normal placements).

## Tests

- `makeSolidKtx2` — solid **sRGB** tint diffuse vs linear ORM/normal bytes.
- `assetsXmlSerializer` — a plan with a glass subpart + its `_Glow` sibling emits `<PartModelGlass>`
  **and** `<PartModel>`+`<Emissive>` (two SubParts, unique `_Model` ids).
- `modExport`:
  - glass‑tinted visor → solid `*_Diffuse.ktx2` + `<PartModelGlass>`, **no** `<Emissive>`.
  - opaque‑glow visor → `<PartModel>` (`glass:false`) + `*_Emissive.ktx2`, never `<PartModelGlass>`.
  - `glassGlow` → `expandGlassGlow` yields 2 placements + 2 subparts (glass + inset `_Glow`); atlas
    has both nodes; `_Glow` is opaque+emissive, original is glass. (Untextured `whole`‑glow path
    avoids `createImageBitmap`.)
- `customAssetStore` — `setMeshSurface('glow')` clears `glass`; `undo()` reverts; `$simulateGlass`
  toggle triggers a rebuild.

## Verification

1. `pnpm typecheck && pnpm lint && pnpm test`.
2. `pnpm dev` (base `/flexo/`), project‑local Playwright: part‑ify a kitten →
   - Visor Surface=**Glass** + red tint → translucent red; toggle **Simulate in‑game glass** →
     darker/subtler. Surface=**Glow** + amber → opaque glowing. Surface=**Glass+Glow** → translucent
     shell with glow through it. Add **Glow** to a *helmet* submesh → it glows. Undo/redo + reload
     (hydrate) persist.
3. Export (zip + folder), inspect XML/binaries: glass visor = `<PartModelGlass>` + solid tint
   `*_Diffuse.ktx2`; glow visor = `<PartModel>` + `<Emissive>`; layered = **two SubParts**
   (`visor` + `visor_Glow`) at the **same transform**, `_Glow` opaque+emissive **inset**.
4. **In‑game acceptance** (the real test, like the 2026‑05‑30 custom‑assets validation): drop
   `flexo-parts/` into KSA → confirm (a) tinted translucent visor, (b) opaque glowing visor,
   (c) layered glow‑through‑glass. Validates the glass‑shader reading (no emissive on glass; tint
   muted) and the layering trick.

## Risks / limitations

- **In‑game glass tint is subtle/dark** (KSA hard‑codes glass mostly dark) — documented; the
  "simulate" checkbox sets expectations.
- **Tinted glass loses the visor's texture detail** (solid diffuse) — acceptable (glass mutes detail
  anyway); untinted glass keeps the real diffuse.
- **Kitten editor glow uses a colored emissive uniform**, not the diffuse‑composite — minor
  preview≈export divergence; both read as a colored glow.
- **Layered visor doubles the visor** (extra SubPart/material/atlas node + inset overdraw); the inset
  factor (~0.99) is the single knob for z‑fighting/dimming.
- **Painted glow on kittens** composites over a solid base (no kitten texture under the paint) until a
  future CPU KTX2 decode lands; **`whole` glow is the primary kitten path**.
- **Selection highlight** on a glowing/colored‑emissive kitten mesh overrides then restores the glow —
  verify `SubPartObject.baseEmissives` captures it.

## Implementation order

1. *(Prereq)* Part 1 emissive primitives. 2. `types.ts`. 3. `makeSolidKtx2` (generalize, into
`src/ktx`). 4. `kittenBake`/`kittenAssets` material (tint + emissive + simulate + surface). 5.
`customAssetStore` (catalog threading, actions, signature, `$simulateGlass`). 6. `modExport`
(`planKittenSubPart` tint/glow, `expandGlassGlow`, inset). 7. `ManageTexturesPanel` UI. 8. tests.
9. docs/AGENTS (emissive → shipped: whole+painted+kitten‑submesh glow; visor glass tint; the
KSA glass‑can't‑glow limitation + the layered workaround).
