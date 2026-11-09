# KSA 5801 variants and expanded model catalogs

Source-verified findings for the Flexo update from build **2026.10.10.5554** to **2026.11.10.5801**. The 5554 assembly/content baseline is assembly-repository commit `935a32b`; the separately supplied previous snapshot is 5707 and must not stand in for that baseline. Current sources are `../ksa-game-assemblies/current/{decomp/KSA,Content/Core}`; current browser binaries/XML are `../flexo-private-assets/assets`. Reference trees were read only. No game runtime validation was performed.

## Outcome and implementation contract

KSA has explicit cosmetic **Part families**, containing separately identified complete Part templates. The current stock XML declares **50 families, 128 member references, and 78 alternate choices**. A/B/C/D suffixes are ordinary IDs, not a lookup rule. Families may replace a skin, remove a cover, add cloth or foil, or substantially change the visible subpart arrangement while inheriting the same gameplay definition.

Use a fully resolved concrete `CatalogPart` per member and add this catalog metadata:

```ts
interface CatalogPart {
  // Existing id and resolved payload remain the concrete selected member.
  variantIds: string[];         // Ordered explicit, resolved family refs; [] standalone.
  variantHeadId: string | null; // First valid member; null standalone.
  variantIndex: number;         // Concrete member's index; 0 standalone.
}
```

Resolve inheritance and patches **before** deriving this metadata. Retain a family only when at least two valid members remain and the concrete member occurs in the list, matching `PartTemplate.OnDataLoad`. Browser view state holds a concrete selected part ID. Import snapshots that member's complete resolved payload into the authored Part; no extra persisted `EditingPart.selectedVariant` is needed. The selected geometry and inherited gameplay are already document state. A later variant import must be an explicit document replacement/import operation, not a stock-linked reactive mutation of a user's edited Part.

Keep all concrete IDs in the catalog and preview manifest. Group the Part browser visually by `variantHeadId`; present the ordered choices within each family and preview/import the selected concrete member. Searching a member's exact ID must find and select that member. `?part_id=<memberId>` remains exact in the preview mini app. Do not strip trailing letters or manufacture new template IDs.

Flexo's existing `ExportVariant` / `buildExportVariantMap` is a **different concept**: a private, per-export SubPart alias to isolate template data and rendering overrides from globally shared Core templates. It does not make a KSA cosmetic Part family and must never automatically populate `<Variants>`.

## Game identity, inheritance, validation, selection, and saves

### Authored identity

`PartTemplate.cs:43` declares `[XmlArray("Variants")] [XmlArrayItem("Part")] List<DataReference<PartTemplate>> VariantRefs`. Its runtime `Variants` list is `[XmlIgnore]`. XML uses:

```xml
<Part Id="CoreStructuralA_Prefab_PanelAA">
  <SubParts>
    <SubPart Key="CoreStructuralA_Subpart_PanelAA"
             Ref="CoreStructuralA_Subpart_PanelAA" />
  </SubParts>
  <Variants>
    <Part Ref="CoreStructuralA_Prefab_PanelAA" />
    <Part Ref="CoreStructuralA_Prefab_PanelAB" />
    <Part Ref="CoreStructuralA_Prefab_PanelAC" />
    <Part Ref="CoreStructuralA_Prefab_PanelAD" />
  </Variants>
  <!-- Connectors and collision hull are authored here. -->
</Part>
<Part Id="CoreStructuralA_Prefab_PanelAC"
      Parent="CoreStructuralA_Prefab_PanelAA">
  <SubParts>
    <SubPart Key="CoreStructuralA_Subpart_PanelFrameAC"
             Ref="CoreStructuralA_Subpart_PanelFrameAC" />
    <SubPart Key="CoreSurfacesA_Subpart_PanelAC"
             Ref="CoreSurfacesA_Subpart_PanelAC">
      <Transform><Position Z="-0.0382" /></Transform>
    </SubPart>
  </SubParts>
</Part>
```

Source: `Content/Core/CoreStructuralAAssets.xml:2148–2213`. The head's final definition, including later `Modify="Patch"` gameplay rows, is inherited via `Parent`; the child's unmarked `<SubParts>` replaces the parent's entire array. The current stock has **78 Parent-bearing rows**, all Part alternate members. This is content inheritance, not a runtime suffix convention.

`ContentLoader.cs:298` invokes `VariantFamilyCheck.Run` after content prepass resolution and before deserialization. `VariantFamilyCheck.cs` compares all Part attributes except `Id` and all child elements except `<SubParts>` with deep XML equality. For a member that introduces a different SubPart Ref, its Components may contain only `PartModel`, `PartModelDynamic`, `PartModelGlass`, or `MeshView`; an introduced gameplay Component causes drift. Drift produces `VariantDrift`, removes that member's references from family rows, and removes the member's own `<Variants>` array. This does not rename the member or merge it into the head. Precise limitation: the unique-subpart check enumerates **Components**, not every possible nonrender field on a SubPart; do not claim it proves all alternate SubPart data identical.

`PartTemplate.OnDataLoad` resolves VariantRefs in order and clears a group when fewer than two refs resolve or it does not contain `this`. `VariantIndex` is the index of this exact template. `VariantHead` selects the first member without `LoadFailed` (or first member if every one failed), and `IsHiddenVariant` hides other members from the main game part grid. `CycleVariant(direction)` wraps the ordered list and skips failed members. IDs are compared case-insensitively by the content/key system; preserve the authored spelling in UI and exports.

### Runtime selection

`VehicleEditor.PartWindow` keeps an in-memory `Dictionary<PartTemplate, PartTemplate> _rememberedVariant` keyed by the family head (`VehicleEditor.cs:92–150`). It displays the selected member's thumbnail and `index/count` decoration, remembers that choice for future placements, and cycles a family with arrows/input. The dictionary is browser/editor convenience state, not part-template schema or a separate vehicle save field.

Placed variant changes are queued with `RequestVariantSwap`; `ApplyPendingVariantSwap` checks the part/history state. `SwapPlacedVariant` selects `part.Template.CycleVariant(direction)`, retargets symmetric parts by the same variant index, applies a snapshot, and creates one `EditorHistoryAction.SwapVariant` history step (`VehicleEditor.cs:8528–8581`). Grabbed roots use `PartVariantSwap.RetargetRoot`: serialize tree, replace `data.Root.InstanceOf` with target ID, clear serialized root subparts, deserialize under the new template, and restore editor IDs/transforms/staging (`PartVariantSwap.cs`). This is reconstruction under a concrete template, not mutation of a material selector.

### Serialized selection

`Part.GetReferenceWithChildren` writes `partInstance.InstanceOf = Template.Id` (`Part.cs:2391`); each serialized SubPart likewise carries its concrete template ID. `PartInstance` has `InstanceOf`, transforms, children, subpart refs, connector/symmetry/module save data; it has **no VariantIndex/SelectedVariant field**. `PartInstance.GetTemplate` looks up that concrete ID. Therefore a vehicle selected as `...PanelAC` saves `InstanceOf="...PanelAC"`, not a head plus a letter/index. A Flexo authored Part export should write its chosen composition and authored ID, as before.

## Family inventory and meaningful differences

| Source file | Families | Members | Alternate choices | What changes |
| --- | ---: | ---: | ---: | --- |
| `CoreCommandBAssets.xml` | 1 | 2 | 1 | Small lander with/without cloth covering |
| `CoreCouplingAAssets.xml` | 5 | 10 | 5 | Decoupler cover/structure composition |
| `CoreFuelTankAAssets.xml` | 9 | 29 | 20 | Tank skin/structural arrangements; shared endcaps |
| `CorePropulsionBAssets.xml` | 15 | 30 | 15 | RCS covers removed while retaining thrusters and shared gameplay |
| `CoreStructuralAAssets.xml` | 18 | 53 | 35 | Eight four-way panel families plus ten strut/truss families |
| `CoreUtilityAAssets.xml` | 2 | 4 | 2 | Small/medium radial parachute covers |
| **Total** | **50** | **128** | **78** | |

Group sizes: **34 pairs, 4 triples, 12 quadruples**. Baseline 5554 has no `<Variants>` arrays.

Examples that rule out suffix-based treatment:

- `CoreStructuralA_Prefab_PanelAA/AB/AC/AD` is one explicit family, while `PanelBA/BB/BC/BD` is another. The first letter identifies panel geometry; the second participates in a particular authored family. `AC` uses a structural frame plus a cloth mesh in another pack. `AD` uses a foil SubPart in another pack. They are not one mesh with four materials.
- `CoreFuelTankA_Prefab_LF1W1HA/HB/HC` share connectors and inherited final gameplay. A/B reference alternate skin meshes while sharing two `EndcapLF1WA` placements. C references `Skin1W1HC`, itself a distinct SubPart. Never infer equal geometry from equal family gameplay.
- `CorePropulsionB_Prefab_RCSMediumTwoHornV1B` inherits A but replaces its SubParts with the same base and two thrusters, omitting `RCSSetACoverLowProfileB`. Thruster Key/Ref/transform identity remains essential for inherited feed wiring.
- `CoreStructuralA_Prefab_StrutCubeNodeHalfWHalfHA/HB/HC` changes from six panel faces to an open braced truss to six foil patches, retaining shared endcaps and inherited connectors/collider. A cosmetic family can have very different mesh count/topology.
- `CoreCommandB_Prefab_SmallLanderB` adds `CoreSurfacesA_Subpart_SmallLanderClothA` to the common lander structure/windows/tanks/hatch/endcaps. Its habitat, tanks, radiation shield, seat, lights, control, battery, mass, grabs, connectors and collider come from the final patched A parent.
- `CoreLifeSupportA_Prefab_SupplyLockerA` and `...SupplyLockerB` are **separate Parts with no Variants relationship**, despite their suffixes. They compose different quantities/arrangements of existing tank-bay meshes and have independent gameplay.
- `CoreCommandA_Prefab_MediumCapsuleVariantA` contains the word Variant in its historical ID but declares no family. Its name does not create a picker.

### Sharing is reference identity, not suffix identity

Among current authored renderable SubPart definitions there are **570 templates with 570 authored render models** before applying later patches: 471 PartModel, 98 PartModelDynamic, one PartModelGlass. These counts describe base rows, not the complete flattened rendering payload; patches can change a component type/content and must be resolved first.

Exactly five repeated mesh/material binding groups occur in those base rows:

| Shared mesh/material | Distinct templates | Consequence |
| --- | --- | --- |
| `ParachutePackedA` / `CoreUtilityA_Material` | packed A, standalone parachute A | Same visible mesh, intentionally separate gameplay owners |
| `ParachutePackedB` / `CoreUtilityA_Material` | packed B, standalone parachute B | Same visible mesh, intentionally separate gameplay owners |
| `CoreFuelTankB_Subpart_FuelLineConnector` / `CoreFuelTankB_Material` | fuel-line connector, FuelConnectorA | Same geometry/material, differing model kind (PartModel vs Dynamic) |
| `CoreFuelTankB_Subpart_FuelLineSocket` / `CoreFuelTankB_Material` | fuel-line socket, FuelPortA | Same geometry/material, differing model kind |
| `CorePropulsionA_Subpart_EngineALargeVacAssembly` / `CorePropulsionA_Material` | large vacuum assembly, AntimatterRamAssembly, FusionTorchAssembly | Shared visible geometry does not imply shared engine gameplay |

Full prefixes are preserved in source XML. These duplicate references are valid catalog entries, not aliases to deduplicate out of document identity. Cache geometry by actual mesh binding; retain separate template/gameplay records. No stock SubPart has an explicit cosmetic SubPart-family list; `SubPartTemplate` inherits PartTemplate in C#, but the 50 stock family arrays are on Parts.

### A concrete SubPart appearance picker

The user's request to choose variants for individual SubParts needs an editor convenience relationship: the stock game does not supply a SubPart family registry. Use the label **Related appearances** and preserve each concrete SubPart ID. A defensible initial list is bounded to templates with the same ID stem after removing exactly one final capital letter **and** verified identical POSITION/index accessor bytes and matching referenced material. Do not group every planar mesh merely because its geometry matches. Do not strip multiple letters or group by equal bounding boxes. UV and normal data can differ intentionally.

A read-only GLB inspection of the current private assets found these **10 matching groups / 21 concrete templates**. Each group's full primitive POSITION and index buffers match byte-for-byte; all matching nodes and their ancestor chains have identity transforms. Material Ref also matches within each group:

| Exact SubPart stem | Verified choices |
| --- | --- |
| `CoreUtilityA_Subpart_ParachuteBayRadialCoverB` | A, B |
| `CorePropulsionB_Subpart_RCSSetACoverSmall` | A, B |
| `CoreIVAPropA_Subpart_WrittenNote` | B, C, D |
| `CoreIVAPropA_Subpart_Photo` | B, F |
| `CorePropulsionA_Subpart_SRBSizeASmallSegment` | A, B |
| `CorePropulsionA_Subpart_SRBSizeBMediumSegment` | A, B |
| `CorePropulsionA_Subpart_SRBSizeBSmallSegment` | A, B |
| `CoreCouplingA_Subpart_Decoupler2WSkin` | A, B |
| `CoreCouplingA_Subpart_Decoupler3WSkin` | A, B |
| `CoreCouplingA_Subpart_DecouplerHalfWSkin` | A, B |

Use explicit verified metadata or deterministic validation against private source data to build these UI groups; retain all concrete IDs as individually searchable entries. The bytes above prove equal geometric shape, not equal gameplay. Selecting a choice **before Add** must preview and seed data from that concrete template. Do not retarget an existing authored placement by preserving the previous template's copied gameplay under the new ID; that requires a deliberate replacement operation with complete template-data/ref ownership handling. A later richer relationship can be derived from corresponding placement Keys in explicitly authored Part families, but the verified list above is sufficient for an initial appearance chooser without speculative naming rules.

Recommended catalog-only fields are `appearanceGroupId?: string` and `appearanceIds?: string[]`, entirely separate from Part `variantIds`. A dialog's selected ID remains the concrete catalog ID; neither convenience field belongs in KSA XML or the persisted authored Part schema.

## Expanded content and catalog omissions

Across top-level XML definitions, ignoring Patch rows as additional identities, baseline/current counts are **180 → 258 Parts** and **469 → 575 SubParts**. The net Part increase hides **144 added IDs and 66 removed IDs**; SubParts add 106 IDs and remove none. These identity counts include TestContent's 2 nonrender test Parts and 4 nonrender test SubParts. Current 575 SubParts also includes nonrender `KittenBackPackSubPart`; there are 570 base renderable templates. Current-game-only behavior applies: do not migrate old game IDs.

Flexo's current 17-entry `ASSET_FILES` fails to request the following active Part/SubPart catalogs. All are already present in the private asset tree:

| Missing file | Renderable SubParts | Whole Parts | Required binaries / resolution |
| --- | ---: | ---: | --- |
| `CoreCommandBAssets.xml` + GameData | 5 | 2 | CommandB mesh atlas, collision atlas, Diffuse/Normal/PBR/Emissive textures; lander also depends on PassageA, StructuralB and SurfacesA |
| `CoreCommandCAssets.xml` + GameData | 0 | 3 | CommandC collision atlas; prefab geometry comes from ElectricalA and SurfacesB |
| `CoreLifeSupportAAssets.xml` + GameData | 0 | 2 | Reuses FuelTankB geometry/material; entirely cross-pack compositions |
| `CoreStructuralBAssets.xml` | 5 | 0 | StructuralB atlas and Diffuse/Normal/PBR textures; five structural endcaps |
| `CoreSurfacesAAssets.xml` | 13 | 0 | SurfacesA atlas and Diffuse/Normal/PBR textures; lander/truss cloth and panel C surfaces |
| `CoreSurfacesBAssets.xml` | 16 | 0 | SurfacesB atlas and Diffuse/Normal/PBR textures; truss/patch foil and panel D surfaces |
| `CoreFuelPortGameData.xml` | 2 | 1 | No local atlas/material; resolves FuelTankB fuel-line connector/socket globally |
| **Total functional omission** | **41** | **8** | |

The old list covers **529 of the 570 base renderable templates**, before accounting for its incompatible old XML shape. The 41 omissions are real missing entries even after the schema parser is updated. A Parts loader that discovers only files with local mesh templates would also miss CommandC and LifeSupportA.

The remaining active `TestContent.xml` has two Part and four SubPart definitions, all marked `Test="true"`, with no render models. Exclude it from normal asset/browser UI; do not report it as missing user-facing geometry. The Core launch-pad A/B/C packs are StaticObject/StaticSubObject catalogs and already have the separate ICRP `STATIC_ASSET_FILES` path; keep that scope distinct from Part families.

Current `CoreStructuralAAssets.xml` expands from 50 base SubParts/15 Parts in the supplied 5707 previous assets to 105/75 in 5801. `CorePassageAAssets.xml` expands from 15 to 22 SubParts and loses its four standalone historical prefabs; its meshes now compose the new lander/capsule content. RCS gains 15 alternate Parts. The supplied previous snapshot is useful for these recent deltas; the 5554 baseline remains authoritative for the whole update.

### Private pipeline versus runtime list

The current private entrypoint is **`update-from-ksa-build.ts`**, not the `copy-assets.ts` still named in Flexo's asset-pipeline documentation. It discovers all XML with Part/SubPart or related static/reaction/grain data, copies siblings, scans `Path` attributes for `.glb/.gltf/.ktx2/.dds`, and re-encodes textures. An XML Path scan across every current top-level Part/SubPart catalog found **zero missing binary references in the private output**. The new binaries therefore do not need another copy pass.

Private output contains 36 files under Meshes (28,008,932 bytes) and 236 files under Textures including character/decal textures (2,445,177,586 bytes); these are inventory observations, not bundle optimization targets. `vite/ksaAssets.ts` mirrors the private tree wholesale on build. The defect is the public runtime/preview hardcoded file lists and file-local resource assumptions, rather than absent private model packs.

The resource resolver must collect global Texture/PbrMaterial/MeshAtlas/MeshFile registrations across the complete chosen source-file set before resolving templates. A named MeshAtlas Id identifies the atlas asset; a model's Mesh Ref identifies an atlas mesh by imported mesh name. They are not interchangeable. CoreFuelPortGameData and cross-pack family compositions are concrete regression cases.

## Concrete Flexo change surfaces

| Path | Required behavior |
| --- | --- |
| `src/ksa/catalog.ts` and shared resolved-content loader | Include seven missing functional catalogs; preserve manifest ordering; global mesh/material/texture lookup; use flattened templates. Retain separate identity for templates sharing render bindings. |
| `src/ksa/partCatalog.ts` | Consume flattened Parts and inherited final gameplay; attach ordered variantIds/head/index. Avoid separately additive old GameData merging after content has already been flattened. |
| `src/ui/build/PartBrowserDialog.tsx`, its browser model helpers | Group explicit families; selected concrete member drives preview/import. Exact member search reaches the correct selected choice. Use concrete ID as thumbnail cache key. |
| `src/ui/build/SubPartBrowserDialog.tsx`, `src/three/SubPartPreviewViewport.ts` | Offer verified Related appearances groups with a concrete selected ID; preview/add copies that choice's geometry and gameplay. Keep every concrete ID searchable. |
| `src/state/partImport.ts` | Import the selected member's fully resolved snapshot, including inherited connectors/colliders/modules and its own replacement placements. No new saved selection field is required. |
| `src/three/SubPartObject.ts`, `PartPreviewViewport.ts`, shared catalog render consumers | Follow selected member's placements and per-template render binding; preserve cross-pack cloth/foil resources. Renderer-specific multi-primitive/material concerns belong to rendering research. |
| `apps/partpreview/src/`, `vite/previewManifest.ts`, `scripts/capture-part-thumbs.ts` | Keep every concrete member ID addressable; preview exact ID; produce/cache a different thumbnail per member; generate manifest from the same resolved catalog as runtime. |
| `apps/icrp/src/three/partImport.ts`, its Part browser consumers | Reuse concrete resolved member payload; avoid divergence from the main Part catalog. Existing launch-pad static catalog stays separate. |
| `src/ksa/modExport.ts`, `assetsXmlSerializer.ts`, XML serializers | Preserve selected authored composition; keep Flexo SubPart override alias remapping distinct from game families. An unchanged stock SubPart placement still references its concrete Core ID. |
| `docs/subpart-catalog.md`, `docs/asset-pipeline.md`, `docs/wiki-part-preview.md`, `scope/part-and-subpart-xml.md`, `scope/custom-assets-and-mod-export.md` | Record new explicit family semantics, global registry resolution, actual private updater entrypoint, exact-member preview behavior, and independent override-alias meaning. |

If authoring new KSA variant families is explicitly added later, it requires multiple authored Part documents with unique IDs, explicit ordered family refs copied consistently across members, and a verified equal gameplay definition outside SubParts. A family picker for stock import does **not** authorize inventing a persisted authoring feature or emitting stock family references for edited Parts. Exporting one edited stock member under a new Part ID should not inherit a stock `<Variants>` list naming other Core Parts.

## Focused validation cases

1. Resolve and import all four PanelA members. Verify the same inherited connectors/hull/gameplay but different placement sets, with cloth and foil from the correct other pack.
2. Import SmallLanderB. Verify its cloth renders and its inherited seat, habitat, lights, tanks and hatch references match the final A definition.
3. Import RCSMediumTwoHornV1B. Verify the cover is absent while thruster placement keys/feed targets remain coherent.
4. Import LF1W1HC. Verify its inherited tank data is present despite no separate member GameData row and shared endcap geometry is reused.
5. Load both SupplyLockerA/B independently; no family UI appears. Historical MediumCapsuleVariantA likewise has no family picker.
6. Load FuelPortA from the standalone GameData-named catalog and resolve both render templates through FuelTankB atlas/material registrations.
7. Assert every member of each stock family is an addressable catalog/preview-manifest entry, all 41 formerly omitted renderable templates exist, and no Test=true geometry is offered.
8. Verify export of an edited concrete stock import uses its authored composition and private override IDs only where needed; never emits a `<Variants>` list as a side effect of the existing ExportVariant map.

Static source reading establishes schema/selection/save behavior and resource availability. Visual appearance, GPU behavior and in-game functionality still require runtime checks after implementation.
