# Feature: Emissive (glow) textures for custom meshes

> **Deliverable:** This document is the plan. Step 0 of implementation is to save this
> file verbatim to `plans/FEATURE_EMISSIVES_PLAN.md` (plan mode could only write to the
> harness plan path). Everything below is written as that doc.

## Context

flexo lets a user build a KSA Part from primitive meshes, texture them (diffuse only,
v1), and export a working KSA mod. The user wants to add **emissive ("glow")** support,
easy and practical for a non-artist, covering two cases in their words:

1. *"an emissive for the whole part like a mesh that just glows"* — a whole-mesh uniform glow.
2. *"emissives in just small areas like LED status lights on a part"* — localized glow spots.

Emissive is listed as a deferred v1 limitation in `docs/custom-assets.md` and AGENTS.md.
The render side already exists for **built-in** KSA parts (`MaterialFactory` +
`normalMapPatch`); this feature brings **user-authored** emissive to **custom meshes** and
the exporter, plus an **in-browser authoring tool**.

### Decisions locked with the user
- **Glow color = "Color + strength".** The user picks a glow color; we bake it into the
  surface base color so it reads as a colored glow in-game (high strength washes toward
  white — accepted, matches real KSA).
- **LED spots = an in-browser authoring tool** (a paint canvas), not just an image upload.
- **No editor bloom in v1.** Emissive renders bright (not bloomy) in the editor; correct
  in-game (KSA blooms in its own post pass). Optional future enhancement.

## How KSA renders emissive (verified against decompiled sources)

- **The glow is WHITE.** `Content/Core/Shaders/Mesh/MeshIndirect.frag`: after lighting,
  `vec3 emissive = gammaToLinear(vec3(sampledEmissive) * EMISSIVE_MULTIPLIER); lightColor += emissive;`
  The emissive texture is a **single-channel grayscale mask** (KSA: BC4, sampled `.x`) that
  controls **where**/**how much** it glows — never the color.
- **`EMISSIVE_MULTIPLIER = 1.25`** (global constant, `Common/Lighting.glsl`). There is **no
  per-material intensity or color** in the Assets XML. (Runtime-colored battery indicators
  exist but are hard-coded C# state, not authorable — out of scope.)
- **Implication — colored glow = colored *diffuse* under a partial-value mask.** Since the
  added light is white, the only way to get a red LED is a red **diffuse** at that texel
  plus a mask value < 1 so the red shows through (full white mask washes to white). "Strength"
  therefore must be **baked into the mask's gray value**, not a uniform.
- **XML shape** (per `CoreCommandAAssets.xml` etc., and confirmed by flexo's own
  `catalog.ts` parser): `<Emissive Path="Textures/..._Emissive.ktx2" Category="Vessel"/>`,
  same shape as `<Diffuse>/<Normal>/<AoRoughMetal>`. Files named `*_Emissive.ktx2` in `Textures/`.
- **Diffuse/Normal/PBR are still mandatory.** KSA's thumbnail renderer null-derefs Normal +
  PBR (already handled by flexo's synthetic flat-normal/neutral-ORM). `<Emissive>` itself is
  optional and safe to add. An emissive-only mesh still needs a diffuse, so we synthesize one.

## flexo's existing emissive render path (reuse verbatim)

`MaterialFactory.buildTextured()` (built-in parts) already does the KSA-faithful setup:
`mat.emissiveMap = <mask>`, `mat.emissive = white`, `mat.emissiveIntensity = 1.25`
(`EMISSIVE_MULTIPLIER`). `normalMapPatch.applyKsaShaderPatches(mat,{emissive:true})` replaces
`#include <emissivemap_fragment>` with `totalEmissiveRadiance *= emissiveColor.rrr` (broadcast
R so a mask isn't tinted red). `SubPartObject.create` clones each material per instance and
re-applies the patch from `!!m.emissiveMap`, snapshotting `emissive`/`emissiveIntensity` into
`baseEmissives` for the selection highlight. `CatalogSubPart.emissiveUrl` already exists and is
read by `buildTextured` — but only Core entries populate it today.

**The custom path does NOT use this yet:** `buildCustomFaceMaterial()` sets only `map`, and
`refreshCatalog()` never produces an emissive. That's the gap we close.

## Design — one unified "glow bitmap → composite" model

The cleanest model that satisfies color + strength + both use cases, and stays faithful to
KSA (editor == export), is to treat glow as a **glow bitmap** (RGBA: `rgb` = glow color,
`a` = glow intensity/mask), then **composite** it into the diffuse:

```
base diffuse (user texture, or neutral gray if none)   glow bitmap (color+intensity)
                         \                                   /
                          ▼  per-pixel  (src/ktx/glowComposite.ts)
        compositedDiffuse[i] = lerp(base[i], glow.rgb[i], glow.a[i])      → <Diffuse> / map (sRGB)
        emissiveMask[i]      = glow.a[i]   (broadcast to R)               → <Emissive> / emissiveMap (LINEAR)
```

The emissive uniform stays **white** at **1.25** (existing path); color lives in the diffuse —
exactly how KSA does it. Both the **editor preview** and the **exporter** call the same
`compositeGlow()` so what you tune is what ships.

Two glow shapes, both producing a glow bitmap:
- **`whole`** — solid glow bitmap from `color` + `strength` (a small solid RGBA). Use case 1.
- **`painted`** — an RGBA bitmap authored in the in-browser paint tool (multi-color spots,
  alpha = intensity). Use case 2. Stored in IndexedDB per mesh; re-editable.

Per-mesh (not per-face), because KSA export collapses each custom mesh to exactly one
`<PbrMaterial>`/`<Emissive>` — per-face emissive could be authored and previewed but would be
silently dropped at export. The mask shares the diffuse's UVs (TEXCOORD_0), so a painted spot
lands where the user painted it relative to the diffuse. (On a box, all faces share 0–1 UVs, so
a painted spot repeats per face — documented limitation; per-face LEDs = separate primitives.)

## Data model — `src/ksa/types.ts`

```ts
/** Whole-mesh uniform glow, or a painted glow bitmap (in IndexedDB). */
export type EmissiveShape = 'whole' | 'painted'

/**
 * Per-mesh emissive (glow). Absent on CustomMesh = no glow. KSA glow is WHITE×mask×1.25
 * added after lighting; color comes from compositing `color` into the diffuse by the mask,
 * and `strength`/alpha is the mask gray value (high = washes toward white).
 */
export interface EmissiveConfig {
  shape: EmissiveShape
  /** Glow color 0..255. Used by `whole`; also the painter's default brush color for `painted`. */
  color: { r: number; g: number; b: number }
  /** Glow intensity 0..1. `whole`: the uniform mask value. `painted`: default brush intensity. */
  strength: number
}

export interface CustomMesh {
  /* …existing… */
  /** Optional whole-mesh glow. `painted` shape stores its bitmap under assetKeys.emissivePaint(id). */
  emissive?: EmissiveConfig
}
```

Persistence + undo are automatic: `emissive` is plain JSON on `CustomMesh` →
serialized in `ProjectSnapshot`; all mutations go through `customAssetStore.mutate()` →
`pushUndo()`. Old projects have `emissive: undefined` (no migration needed). The painted
bitmap lives in IndexedDB like a texture (not per-stroke undone — same pattern as diffuse).

## New: `src/ktx/glowComposite.ts` (pure, shared by preview + export)

```ts
export interface GlowBitmap { width: number; height: number; rgba: Uint8Array } // a=intensity
/** Solid glow bitmap from color+strength (tiny, e.g. 4×4). */
export function solidGlowBitmap(color, strength): GlowBitmap
/** lerp(base, glow.rgb, glow.a) → diffuse; glow.a → mask. Resamples glow to base size. */
export function compositeGlow(base: ImageLevel, glow: GlowBitmap):
  { diffuse: ImageLevel; mask: ImageLevel }   // both width×height RGBA8
```

`base` = the decoded primary diffuse (`decodeImage` on the source image), or a neutral mid-gray
buffer when the mesh has no texture. Reuses `decodeImage.ts` types (`ImageLevel`) and
`buildMipChain` for encode.

## Editor rendering — `MaterialFactory.ts` + `customAssetStore.ts`

- **`MaterialFactory.ts`**: add `buildGlowingFaceMaterial(diffuseRGBA, maskRGBA, wrap)` that
  builds `THREE.DataTexture`s (diffuse `SRGBColorSpace`, mask `NoColorSpace`, both
  `flipY=false` to match the KTX2/GLB UV convention in `TextureCache.ts`), sets
  `map`, `emissiveMap`, `emissive=white`, `emissiveIntensity=1.25` — identical to
  `buildTextured`'s emissive block. (Do **not** set a colored emissive uniform; color is in
  the composited diffuse — keeps editor == export and leaves the `emissive` uniform free for
  the selection highlight, exactly like built-in parts.)
- **`customAssetStore.refreshCatalog()`**: for a mesh with `m.emissive`, build the glow bitmap
  (`solidGlowBitmap` for `whole`; decode the IndexedDB paint PNG for `painted`), decode each
  face's base diffuse (source image, or neutral), `compositeGlow()`, and push a
  `buildGlowingFaceMaterial(...)` per face instead of `buildCustomFaceMaterial(...)`. Also set
  `emissiveUrl` on the synthetic `CatalogSubPart` for fidelity (harmless; custom meshes render
  via the cache).
- **`SubPartObject.ts`**: **no change.** Because the material now has `emissiveMap`, the
  existing per-instance `applyKsaShaderPatches(m,{emissive:!!m.emissiveMap})` + `baseEmissives`
  snapshot already light it. Live preview flows through the existing `$customCatalog` →
  `$catalog` (computed) → `EditorScene.scheduleReconcile()` rebuild.

## In-browser authoring tool — `src/ui/GlowPaintDialog.tsx` (new)

A minimal paint canvas, modeled on `CustomTextureDialog.tsx` (Modal/Dialog + drop/paste) and
`CreateMeshDialog.tsx` patterns. Per mesh:

- **Canvas** (fixed working size, e.g. 512²) showing the mesh's **diffuse faded underneath**
  as an alignment guide (decoded source image, or neutral).
- **Brush**: color swatch (`ColorAlphaField.tsx` already exists) + size slider + intensity
  slider; pointer drag stamps soft circles (multi-color supported — paint red here, green
  there). **Eraser** = intensity 0. **Clear** button. Optional **Import image** to seed the
  canvas (folds the upload path in).
- **Simple in-canvas undo** (bounded snapshot stack) for strokes; the *document* records one
  undo entry when you **Apply** (sets `emissive.shape='painted'` + writes the bitmap).
- **Live 3D preview** on stroke end (pointer-up), debounced, by calling the same
  `setMeshGlowPainted` path → `refreshCatalog()` → scene reconcile.
- **Apply / Cancel.** On Apply: read canvas → RGBA PNG → `putAsset(assetKeys.emissivePaint(meshId), png)`,
  encode/refresh, `mutate()` the descriptor.

(`whole`-mesh glow needs no painter — it's just the color + strength controls in the panel.)

## "Glow" panel UI — `src/ui/ManageTexturesPanel.tsx`

Add a **Glow** section at the top of the per-mesh panel (it's per-mesh, above the per-face
Face controls), reusing kit `Select`/`Slider`/`Button`/`ColorAlphaField`:

```
Glow (emissive)
  Mode:  [ Off ▾ ]                 // Off | Whole mesh | Painted spots  → emissive=undefined | {shape:'whole'} | {shape:'painted'}
  Color: [ ■ ]   Strength: [===●==  60%]      // shown for Whole; Color is the painter default for Painted
  [ Edit glow… ]  (Painted)        // opens GlowPaintDialog; shows a small mask thumbnail
  caption: "Glow adds white light over the base color — pick a strong color + moderate strength
            for a colored glow; full strength washes toward white (like real KSA parts)."
```

Slider commits on `onChangeEnd` (re-encode/rebuild is heavier than a tick). Default strength
~0.6 so colored glow reads as colored, not white.

## State / orchestration — `src/state/customAssetStore.ts` + `assetDb.ts`

- **`assetDb.ts`**: add `emissivePaint: (meshId) => "emissive-paint:" + meshId` to `assetKeys`.
- New actions (mirroring `updateMeshFaceConfig`):
  - `setMeshGlow(meshId, cfg: EmissiveConfig | undefined)` — for Off / Whole / setting color &
    strength. `mutate()` + `refreshCatalog()`.
  - `setMeshGlowPainted(meshId, pngBlob, defaults)` — `putAsset(emissivePaint)`, set
    `emissive.shape='painted'`, refresh.
- Add a `emissivePaintUrls: Map<meshId,string>` (blob URL for the panel thumbnail), populated
  like `textureSrcUrls`.
- **`removeCustomMesh`**: also revoke the paint blob URL + `deleteAsset(assetKeys.emissivePaint(id))`.
- **`hydrateCustomAssets`**: for each `m.emissive?.shape==='painted'`, reload the paint PNG blob
  URL. `whole` is derived from `color`/`strength` (no IndexedDB).
- Solid (`whole`) masks are **never persisted** — regenerated from `color`/`strength`.

## Export — `assetsXmlSerializer.ts` + `modExport.ts`

- **`assetsXmlSerializer.ts`**: add `emissivePath: string | null` to `AssetsSubPartPlan`; in the
  per-material loop, after `<AoRoughMetal>`, emit `<Emissive Path Category="Vessel"/>` when set.
  Order: `<Diffuse> <Normal> <AoRoughMetal> <Emissive>` (mirrors Core).
- **`modExport.buildCustomBundle()`**: for each glowing mesh,
  1. build the glow bitmap (`solidGlowBitmap` or fetch+decode the paint PNG),
  2. decode the base diffuse (primary source image via `decodeImage`, or neutral mid-gray),
  3. `compositeGlow()` → composited diffuse + mask,
  4. `buildMipChain` + `encodeImageToKtx2(diffuse,{srgb:true})` and `(mask,{srgb:false})`,
  5. write `Textures/<bundle>_<subPartId>_Diffuse.ktx2` (the **composited** diffuse replaces the
     stored one for glowing meshes) + `Textures/<bundle>_<subPartId>_Emissive.ktx2`,
  6. set `materialId`, `diffusePath`, `emissivePath` on the plan.
  Glow-only meshes (no user texture) thus get a synthetic neutral/colored diffuse → a complete
  `<PbrMaterial>` (Diffuse+Normal+AoRoughMetal+Emissive). The existing shared synthetic
  Normal/ORM emit because `materialId` is now non-null. Lift `makeSolid1x1Ktx2` into
  `glowComposite.ts`/`src/ktx/` so export and preview share one solid generator.

## Files

**New**
- `src/ktx/glowComposite.ts` — `compositeGlow`, `solidGlowBitmap`, neutral-base helper.
- `src/ui/GlowPaintDialog.tsx` — the paint canvas.

**Changed**
- `src/ksa/types.ts` — `EmissiveShape`, `EmissiveConfig`, `CustomMesh.emissive`.
- `src/state/assetDb.ts` — `assetKeys.emissivePaint`.
- `src/state/customAssetStore.ts` — `setMeshGlow`/`setMeshGlowPainted`, paint-URL map, emissive
  in `refreshCatalog`, `hydrateCustomAssets`, `removeCustomMesh`.
- `src/three/MaterialFactory.ts` — `buildGlowingFaceMaterial`.
- `src/ksa/assetsXmlSerializer.ts` — `<Emissive>` + `emissivePath`.
- `src/ksa/modExport.ts` — composite + emissive binary + glow-only diffuse.
- `src/ui/ManageTexturesPanel.tsx` — Glow section.

**No change needed (verified):** `src/three/SubPartObject.ts`, `normalMapPatch.ts`,
`TextureCache.ts`, `catalogStore.ts`, `EditorScene.ts` — the existing emissive render +
catalog→scene reconcile paths carry it once the material has `emissiveMap`.

## Tests
- `src/ktx/glowComposite.test.ts` (new) — `compositeGlow` lerp math (mask=0 → base, mask=1 →
  color); `solidGlowBitmap`.
- `src/ksa/assetsXmlSerializer.test.ts` — `<Emissive>` emitted when `emissivePath` set, absent
  when null (update existing plan literals with `emissivePath`).
- `src/ksa/modExport.test.ts` — a placed `whole`-glow **untextured** mesh (no `createImageBitmap`
  needed) yields a `*_Emissive.ktx2` binary + a synthetic diffuse + `<Emissive>` in the XML.
- `src/state/customAssetStore.test.ts` (new, minimal) — `setMeshGlow` then `undo()` reverts
  `m.emissive` (enrollment in undo). Guard/skip the IndexedDB/createImageBitmap side effects;
  the `whole` path avoids both.

## Risks / limitations / gotchas
- **Linear mask, sRGB diffuse.** Mask encodes `{srgb:false}` (UNORM) so stored value == sampled
  value (matches KSA's UNORM BC4); composited diffuse encodes `{srgb:true}`. Mixing these up
  makes the glow subtly wrong — covered by the existing UNORM/SRGB encode tests + new ones.
- **DataTexture `flipY=false`** to match KTX2/GLB UVs. If the preview looks vertically flipped
  vs in-game, that's the single knob.
- **Selection highlight on glowing meshes** is muted to glowing texels only (the emissive patch
  multiplies by the mask). This is the *existing* behavior for built-in emissive parts; accept
  for v1.
- **No editor bloom** (user's choice): glow is bright, not bloomy, in the editor; KSA blooms
  in-game. Optional future: an `EffectComposer` + selective `UnrealBloomPass`.
- **Resolution for glowing meshes**: composited diffuse is emitted at the base diffuse's decoded
  size (≤2048) or the painter size for glow-only — a glowing textured mesh re-encodes its
  diffuse. Fine for v1; note in docs.
- **Per-mesh single mask** (box faces share UVs): per-face LEDs = separate primitives.
- **Mask stored as RGBA8** (R used) — 4× a true 1-channel mask, consistent with v1's
  uncompressed-RGBA8 decision; a future R8/BC4 swap is isolated to `encodeKtx2.ts`.
- **Multi-color on one mesh** works via the painter; multiple *whole*-mesh colors = multiple meshes.

## Verification
1. `pnpm typecheck && pnpm lint && pnpm test`.
2. `pnpm dev` (base path `/flexo/`), project-local Playwright:
   - Create an untextured box → Glow = Whole, color red, strength 0.6 → it glows red in-viewport.
   - Create a panel → Glow = Painted → paint a couple of dots (green/amber) → they appear as
     glowing spots aligned to the diffuse; undo/redo restores; reload (hydrate) persists.
3. Export (zip + mod folder): confirm `*_Emissive.ktx2` + composited `*_Diffuse.ktx2` under
   `Textures/`, `<Emissive Category="Vessel">` in the Assets XML, complete `<PbrMaterial>`.
4. **In-game acceptance** (the real test, like the 2026-05-30 custom-assets validation): drop
   `flexo-parts/` into KSA mods, confirm a whole-mesh glow and a painted spot actually glow.
   Resolves the one open question — whether KSA passes `emissive=true` render state for a static
   custom part in every view.

## Implementation order
1. `types.ts` → 2. `glowComposite.ts` (+test) → 3. `assetDb.ts` key → 4. `MaterialFactory`
`buildGlowingFaceMaterial` → 5. `customAssetStore` actions + `refreshCatalog`/hydrate/remove →
6. `assetsXmlSerializer` (+test) → 7. `modExport` composite/emissive (+test) → 8.
`ManageTexturesPanel` Glow section + `GlowPaintDialog` → 9. docs (`docs/custom-assets.md`,
`docs/texturing.md`, AGENTS.md custom-assets note: emissive moves from "deferred" to "shipped:
whole + painted, per-mesh, color baked into diffuse, white mask").

---

# Part 2 — Translucent‑tinted + emissive kitten visor (and kitten‑submesh glow)

Builds on Part 1's shared primitives (`EmissiveConfig`, `compositeGlow`, `solidGlowBitmap`,
`buildGlowingFaceMaterial`, `<Emissive>` serialization, `modExport` glow compositing). The visor
is a part‑ified kitten submesh (`CustomMesh.kitten`), rendered/exported through a **separate**
material path from primitives — this part wires tint + emissive through that path and adds the
glass‑specific tint + layering.

## Verified KSA reality (quote in code comments)

- **`<PartModelGlass>` → `Shaders/Mesh/MeshGlassIndirect.frag`** (the visor's export path):
  opacity hard‑coded `0.75` (line 78); `glassColor = mix(albedo, vec3(0.1), 0.9)` (line 81) — the
  diffuse contributes only ~10% over a dark base; **emissive is never sampled** (the
  `emissiveTextureIndex` field exists but `main()` never reads it). `ModelGlass.frag` (in‑game
  character visor) is identical. ⇒ **glass can't glow; its tint is muted/dark.**
- **`<PartModel>` → `MeshIndirect.frag`** samples emissive (white × `EMISSIVE_MULTIPLIER` 1.25,
  added after lighting). ⇒ **a glowing visor must be opaque.**
- **No CPU KTX2→RGBA decoder** in flexo (KSA `.ktx2` load only via the GPU `KTX2Loader`). ⇒
  can't composite into the visor's detailed `.ktx2`; generate a **solid‑color diffuse** instead
  (`makeSolidKtx2`) — faithful since glass mutes diffuse detail anyway, and consistent with Part 1's
  glow‑only synthetic‑diffuse path.
- **KSA's window = separate glass + opaque SubParts at one transform**
  (`CoreIVASpaceAAssets.xml`). ⇒ **layered glass+glow = two SubParts**, the faithful pattern.

## Data model — `src/ksa/types.ts`

```ts
export interface GlassConfig { tint: { r:number; g:number; b:number }; opacity?: number }
export type VisorSurface = 'glass' | 'glow' | 'glassGlow'   // glass‑capable (transparent) meshes only
export interface CustomMesh {
  /* …existing… */
  emissive?: EmissiveConfig   // (Part 1) opaque glow — now wired through the kitten paths too
  glass?: GlassConfig         // glass tint; used when surface ∈ {glass, glassGlow}
  surface?: VisorSurface      // only meaningful when kitten?.transparent (the visor); undefined ⇒ 'glass'
}
```
Glass‑capable iff `m.kitten?.transparent`. `surface` is the source of truth for the visor; the UI
writes the matching `{glass?, emissive?}`. Back‑compat: old visors (`surface` undefined) ⇒ 'glass',
untinted ⇒ exact current behavior. Fix the stale `types.ts` "ignored on export" comment on
`KittenMeshSource.transparent` (export DOES use it).

## Editor preview (refinement over the harness plan)

Kitten **glow** reuses Part 1's `buildGlowingFaceMaterial` (solid glow‑color diffuse + uniform white
mask, KSA emissive patch ON) rather than a colored emissive uniform — keeps **editor == export** and
avoids the `SubPartObject` patch‑reapply conflict (it toggles the emissive patch from `!!emissiveMap`).
A colored kitten glow therefore replaces the kitten texture with a solid glow color (= "the whole
mesh glows a color"; same as a primitive whole‑glow). Per‑mesh material by `surface`:
- non‑glass kitten + `emissive` → `buildGlowingFaceMaterial` (opaque solid glow).
- visor `glass` → `buildKittenMaterial` + `mat.color` tint, transparent. **`$simulateGlass`** on ⇒
  bake the in‑game look (`color = mix(tint,0.1,0.9)`, `opacity 0.75`); off ⇒ vivid tint + `opacity`.
- visor `glow` → `buildGlowingFaceMaterial` (opaque solid glow).
- visor `glassGlow` → editor approximation: `buildKittenMaterial` tint + transparent + emissive
  **uniform** glow (no map → `SubPartObject` keeps emissive patch off; glow shows through the shell).
  Export is the layered truth (two SubParts).

`$simulateGlass` = new atom in `settingsStore`; checkbox in the panel; change → `refreshCatalog()`.
Thread `{glass,emissive,surface,simulateGlass}` into `buildKittenCatalogEntry`; extend
`KittenMaterialSpec` + `kittenSpecFromSource`; make `buildKittenMaterial`'s `emissive` flag
conditional (it's hard‑coded `false` today). Add `glass`/`surface`/`emissive` to `meshSignature`.

## Export — `src/ksa/modExport.ts` (+ `src/ktx`)

1. Generalize `makeSolid1x1Ktx2(r,g,b)` → `makeSolidKtx2(r,g,b,{srgb})` (host in `src/ktx`; existing
   ORM/normal callers stay `srgb:false`; **tint diffuse uses `srgb:true`** — the glass shader does
   `gammaToLinear(diffuse)`).
2. `planKittenSubPart` takes the mesh‑level config:
   - **glass / glassGlow shell:** `glass.tint` set → `diffusePath` = `makeSolidKtx2(tint,{srgb})`
     bundled; keep normal/ORM; `glass:true`. No tint ⇒ current behavior (real visor diffuse).
   - **glow surface:** delegate to Part 1's glow‑only compositing (neutral/solid base): composited
     diffuse + mask, `glass:false`. (Painted glow on kittens composites over a neutral base.)
3. **`expandGlassGlow(part): EditingPart`** — call once at the top of `buildModZip`/`writeModToFolder`,
   pass the augmented part to **both** `buildModContent`→`serializePart` and `buildCustomBundle`. For
   each placed `surface==='glassGlow'` mesh `m`: append a synthetic `CustomMesh`
   `{subPartId:m.subPartId+'_Glow', kitten:m.kitten, surface:'glow', emissive:m.emissive, __inset:true,
   faceTextures:{}}` and a parallel placement (cloned transform) referencing `_Glow`. In the node
   builder, `__inset` ⇒ `insetGeometry(geo, ~0.99)` (scale toward centroid) so it sits inside the
   75%‑opaque glass and shows through. `buildMeshAtlasGlb` auto‑adds `_Glow_VM`.

## UI — `src/ui/ManageTexturesPanel.tsx` (+ `customAssetStore`)

Allow the panel to open for kitten meshes (today it bails on non‑primitives). Extend Part 1's Glow
section: glass‑capable mesh ⇒ a **Surface** Select (`Glass` · `Glow` · `Glass + Glow`) that writes
`surface` + the matching config (Glass → tint via `ColorAlphaField` + editor opacity; Glow → Part 1
glow controls; Glass+Glow → both) and a **"Simulate in‑game glass"** checkbox (`$simulateGlass`).
Non‑glass kitten submeshes + primitives ⇒ just the Glow section (glow now on **all** kitten
submeshes). New actions: `setMeshGlass`, `setMeshSurface` (clear the unused sibling), reuse
`setMeshGlow`; all `mutate()` + `refreshCatalog()`.

## Tests / verification / risks

As in the approved plan: unit tests for `makeSolidKtx2` (sRGB tint vs linear ORM), serializer
(glass + `_Glow` → `<PartModelGlass>` and `<PartModel>`+`<Emissive>`), `modExport`
(glass‑tinted → solid `*_Diffuse.ktx2` + `<PartModelGlass>` no `<Emissive>`; opaque‑glow → `<PartModel>`
+ `*_Emissive.ktx2`; `glassGlow` → `expandGlassGlow` yields 2 placements + 2 subparts, `_Glow` inset
opaque+emissive), `customAssetStore` (`setMeshSurface('glow')` clears glass; undo; `$simulateGlass`
rebuild). Browser: part‑ify a kitten → Glass+tint (toggle simulate), Glow, Glass+Glow, glow on a
helmet. Export zip/folder + in‑game acceptance. Risks: in‑game tint is subtle/dark (documented +
simulate toggle); tinted/glowing kitten loses texture detail (solid diffuse); layered visor doubles
the visor (inset ~0.99 is the z‑fight/dimming knob); painted‑glow on kittens composites over a
neutral base; selection highlight overrides then restores the glow (verify `baseEmissives`).
