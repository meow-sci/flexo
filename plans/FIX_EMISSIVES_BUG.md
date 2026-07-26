# Fix: an export variant is minted for CUSTOM SubParts, producing a material-less `<PartModel>` that crashes KSA at startup

**Status:** ✅ **IMPLEMENTED (uncommitted)** — Phases 1–4 landed; 893 tests pass, typecheck / lint /
fmt green. Phase 2's export-accumulation papercut (§3) is deliberately NOT fixed — it is a separate
issue, tracked below. **In-game re-verification pending:** delete the existing
`mods/flexo-parts_inanimate_carbon_rod` folder before re-exporting (the writer never overwrites, so
the broken XML would otherwise survive alongside the fixed one).

What changed:

- `modExport.buildExportVariantMap` skips custom meshes by document lookup
  (`part.customMeshes`), and refuses to redeclare a built-in that has no `<Material>` (warns,
  leaves the direct reference).
- `modExport` gives a texture/material/glow-less custom mesh the shared
  `<bundleToken>_NeutralMaterial` (`0xbfc4cc` diffuse — the editor's untextured colour) instead of
  `materialId: null`.
- `AssetsSubPartPlan.materialId` / `ReferenceSubPartPlan.materialId` / `ExportVariant.materialId`
  are non-nullable `string`; both `<Material>` guards in `assetsXmlSerializer` are gone, so the
  omission is no longer expressible.
- Tests: `custom-mesh SubParts never get an export variant` (light trigger, collider trigger, and a
  case where the custom entry *does* carry a materialId — pinning the rule, not just the crash) and
  the `every exported <PartModel> carries a <Material>` property.
- Docs/scope: contract #3 widened to "every `<PartModel>` must carry a `<Material>`", contract #19
  records the custom-mesh rule and why catalog membership was the wrong test,
  `docs/custom-assets.md` corrected.

**Reported as:** an emissive/glow bug. **It is not.** The glow path is correct — the exported
`<PbrMaterial>` has all four channels. The crash comes from a *second*, duplicate `<SubPart>` that
flexo should never have emitted.

**This bug predates the emissive work entirely.** It fires for *any* SubPart GameData on a custom
mesh; the "Add matching light" step is simply the first workflow that puts some there.

```
09:55:05  INFO Preparing Part Thumbnails...
System.NullReferenceException
   at KSA.Rendering.Thumbnails.ThumbnailRenderResources.AddDraw(float4x4, Template)
   at KSA.Rendering.ThumbnailCreator.CollectDraws(...)
   at KSA.Rendering.ThumbnailCreator.PreparePartThumbnails(...)
```

---

## 1. The evidence

From `mods/flexo-parts_inanimate_carbon_rod/inanimatecarbonrodAssets.xml`, flexo emitted **two**
SubParts for one custom mesh:

```xml
<!-- The real one — complete, correct, and NEVER PLACED. -->
<SubPart Id="flexo_rod_fb406012">
    <PartModel Id="flexo_rod_fb406012_Model">
        <Mesh Id="flexo_rod_fb406012"/>
        <Material Id="flexo_rod_fb406012_Material"/>   <!-- Diffuse+Normal+AoRoughMetal+Emissive ✅ -->
    </PartModel>
    <MeshView><Mesh Id="flexo_rod_fb406012_VM"/></MeshView>
</SubPart>

<!-- The export VARIANT — this is what the Part actually places. -->
<SubPart Id="flexo_inanimatecarbonrod_flexo_rod_fb406012">
    <PartModel Id="flexo_inanimatecarbonrod_flexo_rod_fb406012_Model">
        <Mesh Id="flexo_rod_fb406012"/>
                                                    <!-- ⛔ NO <Material> -->
    </PartModel>
    <MeshView><Mesh Id="flexo_rod_fb406012"/></MeshView>   <!-- ⛔ render mesh, not _VM -->
</SubPart>
```

`inanimatecarbonrodPart.xml` places the variant
(`InstanceOf="flexo_inanimatecarbonrod_flexo_rod_fb406012"`), and
`inanimatecarbonrodGameData.xml` hangs the two `<Light>`s off the variant id.

So the finished, fully-textured, glowing SubPart is **orphaned**, and the thing the game actually
loads has no material.

---

## 2. Why that crashes

`ThumbnailRenderResources.AddDraw` (`KSA.Rendering.Thumbnails/ThumbnailRenderResources.cs:125-142`)
dereferences the material with **no null guard on the material itself**:

```csharp
DiffuseTextureIndex  = inTemplate.Material.DiffuseReference.BindlessHandle,   // :138  ← NRE here
NormalTextureIndex   = inTemplate.Material.NormalReference.BindlessHandle,    // :139
PbrTextureIndex      = inTemplate.Material.PBRMap.BindlessHandle,             // :140
EmissiveTextureIndex = (inTemplate.Material?.EmissiveMap?.BindlessHandle ?? -1) // :141 ← the ONLY null-safe one
```

`PartModelModule.Template.Material` is `PbrMaterialReference?` resolved via `Material?.Get()`
(`KSA/PartModelModule.cs:26,50`), so an **absent** `<Material>` element leaves it null.

It must be an absent element rather than a dangling reference: every `ModLibrary.Get<T>` branch
**throws** `"<T> is null for '<id>'"` (`KSA/ModLibrary.cs:975-1050`), which would surface from
`PartModel.Get` → `template.Get()` inside the `ThumbnailPart` constructor and show `AddPart` in the
stack. It shows `AddDraw`.

`CollectDraws` runs over **every** non-SubPart template in `ModLibrary.AllParts` at startup, before
the main menu (`KSA.Rendering/ThumbnailCreator.cs:77-96,123-141`) — one bad `<PartModel>` anywhere
in the mods folder takes the whole game down.

**KSA treats this as an invariant:** a scan of every shipped `Content/Core/*Assets.xml` finds
**0** `<PartModel>` / `<PartModelDynamic>` / `<PartModelGlass>` elements without a `<Material>`.

---

## 3. Root cause — the variant guard tests the wrong thing

`src/ksa/modExport.ts:241-266`:

```ts
for (const p of part.placements) {
  const templateId = p.subPartTemplateId
  const entry = catalog.get(templateId)
  if (!entry) continue // custom mesh (not a built-in) — flexo declares it directly, no collision
  ...
  if (!internalDiffers && !hasSubPartGameData(part, templateId)) continue
  out.set(templateId, {
    meshId: entry.meshNodeName,
    materialId: entry.materialId ?? null,     // ← undefined for every custom mesh
    ...
  })
}
```

Three facts collide:

1. **The catalog handed in is the MERGED index.** `$catalogIndex` is
   `computed([$catalog, $customCatalog], (core, custom) => indexCatalog([...core, ...custom]))`
   (`src/state/catalogStore.ts:17-19`), and every export call site passes it
   (`ExportButton.tsx:78,171,272`). So `catalog.get(customSubPartId)` **hits**, and the
   `if (!entry) continue` guard — whose comment asserts exactly the opposite — never fires for a
   custom mesh.
2. **`hasSubPartGameData` is now true.** It returns true for any non-empty `subPartGameData` entry
   **or any SubPart-owned collider** (`modExport.ts:211-217`). Adding a `<Light>` flips it.
3. **Custom catalog entries carry no material id.** `buildPrimitiveCatalogEntry` returns
   `materialId: undefined` (`src/state/customAssetStore.ts:632-639`) — and so does
   `buildImportedCatalogEntry` — because a custom mesh's material lives in
   `customMeshRenderCache`, not the catalog. `entry.materialId ?? null` → **null** → the serializer's
   `if (sp.materialId)` guard (`assetsXmlSerializer.ts:223`) omits `<Material>`.

**The variant mechanism should never apply to a custom mesh at all.** It exists solely so that
SubPart GameData attached to a *shared built-in* template doesn't merge onto that template globally
(see the doc comment at `modExport.ts:206-210`). A custom mesh's SubPart id is already
project-unique and flexo declares the `<SubPart>` itself — there is nothing to collide with, so the
variant is pure harm: it strips the material, orphans the correct declaration, and points
`<MeshView>` at the full-resolution render mesh instead of the decimated `_VM` (contract #17).

### Trigger surface (wider than lights)

Anything that makes `hasSubPartGameData(part, customSubPartId)` true:

- a `<Light>` (the "Add matching light" button)
- a SubPart-owned `<Tank>`, `<SolarPanel>`, engine module, mass…
- **a SubPart-owned collider** (`part.colliders.some(c => c.ownerTemplateId === templateId)`)

…or `internalDiffers` — flipping the Internal flag on a custom mesh.

---

## 4. Immediate unblock (hand-edit, ~3 lines, no rebuild needed)

Delete the variant and point everything back at the real SubPart:

1. `inanimatecarbonrodAssets.xml` — **delete** the whole
   `<SubPart Id="flexo_inanimatecarbonrod_flexo_rod_fb406012">…</SubPart>` block.
2. `inanimatecarbonrodPart.xml` — `InstanceOf="flexo_inanimatecarbonrod_flexo_rod_fb406012"` →
   `InstanceOf="flexo_rod_fb406012"`.
3. `inanimatecarbonrodGameData.xml` — `<SubPartGameData Id="flexo_inanimatecarbonrod_flexo_rod_fb406012">`
   → `<SubPartGameData Id="flexo_rod_fb406012">`.

That is exactly what the fix will emit: the custom SubPart keeps its full four-channel material and
its `_VM` view mesh, and the two `<Light>`s merge onto it (correct — the id is project-unique, so
merging is the intended mechanism, not a hazard).

Until it's fixed in code, the workaround inside flexo is to **not attach SubPart GameData or a
SubPart-owned collider to a custom mesh** — keep colliders part-level and skip "Add matching light".

---

## 5. The fix

### Phase 1 — never mint a variant for a custom mesh (the actual bug)

`src/ksa/modExport.ts`, `buildExportVariantMap`: replace the catalog-membership guard with an
explicit custom-mesh test. `part` is already in scope.

```ts
// Custom meshes are declared directly by this export under a project-unique id, so there is
// nothing to merge onto and a variant is pure harm: the catalog carries no materialId for them
// (their material lives in customMeshRenderCache), which would emit a <PartModel> with no
// <Material> — a hard startup crash in ThumbnailRenderResources.AddDraw.
const customIds = new Set(part.customMeshes.map((m) => m.subPartId))
...
if (customIds.has(templateId)) continue
```

Keep the `if (!entry) continue` line as a genuine "unknown template" guard, but **fix its comment** —
it currently states a false invariant and is what hid this bug.

Note the interaction with `expandGlassGlow`: it appends synthetic `_Glow` meshes to
`part.customMeshes` before `buildModContent` runs (`modExport.ts:594-615`), so those are covered by
the same set.

### Phase 2 — make a material-less `<PartModel>` unrepresentable (backstop)

Even with Phase 1 the hole stays open for the next producer. Two more `materialId: null` paths exist:

| Path | Site | Notes |
|---|---|---|
| A placed custom mesh with no glow, no face texture and no material | `modExport.ts` ~`:959` (`if (!diffusePath) { … materialId: null … }`) | Reachable today: create a primitive, place it, export. The comment claims *"KSA renders its default look"* — **wrong, it crashes**. Fall back to the shared neutral solids (`tex.baseColorSolid` + `tex.flatNormal` + `tex.ormSolid(255,128,0)`), interned once as `${bundleToken}_NeutralMaterial`. Match `makeFlatMaterial()`'s `0xbfc4cc` so in-game equals the viewport. |
| A built-in export variant whose template has no `<Material>` | `ExportVariant.materialId: string \| null` | No such Core SubPart exists (scan above), but the type permits it. |

Then **make `AssetsSubPartPlan.materialId` and `ReferenceSubPartPlan.materialId` non-nullable
`string`** and delete the `if (sp.materialId)` guards in `assetsXmlSerializer.ts:186,223`. That turns
the entire bug class into a compile error — this is the load-bearing half.

### Phase 3 — tests

- `src/ksa/modExport.test.ts` — **the regression test for this bug**: a placed *custom* mesh that
  has SubPart GameData (a `<Light>`) exports exactly **one** `<SubPart>` for it, the Part places
  that id, and the `<SubPartGameData>` id matches it. Repeat for a SubPart-owned collider on a
  custom mesh (the other `hasSubPartGameData` trigger).
- `src/ksa/assetsXmlSerializer.test.ts` — a property over the whole serialized document: **every**
  `<PartModel>`/`<PartModelGlass>` has a `<Material>` child. This is the test that would have caught
  it regardless of producer.
- `src/ksa/modExport.test.ts` — a placed primitive with no glow/texture/material still emits
  `<Material>` (Phase 2).
- Guard that a *built-in* SubPart with GameData still DOES get its variant — Phase 1 must not
  regress the mechanism it's narrowing.

### Phase 4 — docs + scope (same change, per the scope mandate)

- `scope/custom-assets-and-mod-export.md` **#3** — widen from "every `<PbrMaterial>` must carry
  Diffuse + Normal + AoRoughMetal" to "**every `<PartModel>` must carry a `<Material>`**, and that
  material must carry all three", citing `ThumbnailRenderResources.cs:138-140` + the Core scan (0/N).
- `scope/custom-assets-and-mod-export.md` **#19** (export variants) — state that the mechanism is
  **built-in-only**, and why: a custom SubPart id is project-unique so there is nothing to merge onto,
  and custom catalog entries carry no `materialId`.
- `docs/custom-assets.md` + the `modExport.ts` comment — drop the "KSA renders its default look" claim.

---

## 6. Ruled out (so nobody re-checks)

- **The glow/emissive path.** The exported `<PbrMaterial Id="flexo_rod_fb406012_Material">` has all
  four channels and the correct `_Diffuse`/`_Emissive` KTX2s. It is simply never referenced.
- **coverage/strength and `GlowRamp`.** Pure pixel math inside `compositeGlow`; cannot change which
  XML elements are emitted.
- **`<Light>` itself.** Correctly formed (`Type`/`Transform`/`Range`/`Intensity`/`Color`,
  `LightModule.TemplateData`). It is only the *trigger* that flips `hasSubPartGameData`.
- **Stale/duplicate exports.** My earlier hypothesis — the user exported into a clean folder and the
  crash reproduces from a single generation of XML. (The non-overwrite accumulation behaviour in
  `writeModToFolder:1116-1138` is still a real papercut — re-exporting a project adds `-2`, `-3`
  copies that all get listed in mod.toml and resolve first-wins with no diagnostic — but it is **not**
  this bug. Track it separately.)
- **A dangling `<Mesh Id>`/`<Material Id>`.** Would throw with a distinctive
  `"MeshReference is null for 'X'"` from `ThumbnailPart`'s constructor, not from `AddDraw`.
