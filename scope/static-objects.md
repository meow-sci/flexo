# Static objects (`apps/icrp` — launch pads / surface complexes)

The KSA **static-object** contract ICRP builds on (introduced 2026.8.22.5348, revs
5328–5336). Consumer: `apps/icrp/` (the ICRP mini app), NOT the flexo vessel editor.
Full evidence with decomp citations: [analysis/icrp/KSA_STATIC_OBJECTS.md](../analysis/icrp/KSA_STATIC_OBJECTS.md)
and [analysis/icrp/STATIC_ASSET_INVENTORY.md](../analysis/icrp/STATIC_ASSET_INVENTORY.md);
plan: [plans/ICRP_PLAN.md](../plans/ICRP_PLAN.md) §0.3 (facts F1–F14).

**Baseline:** re-verified against KSA build **2026.9.7.5402** — schema classes byte-identical, one
renderer-side shader split; see [What changed in 5402](#what-changed-in-5402).

## Contract facts ICRP bakes in

1. **Schema** (`AssetBundle.cs:32-34`): `<StaticObject>` = `StaticObjectTemplate`
   (`<SubObject>`\* + `<PartModel>`\* + `<Collider>`\* + `GroundOffset`/`SurfaceHeight`/
   `FootprintRadius` DistanceReferences, all-NaN = unset); `<StaticSubObject>` =
   `<PartModel>`\* + `<Collider>`\* only; `<StaticObjectGameData>` merges via
   `ApplyGameData` (**lists append, distances override only when set**,
   `StaticObjectTemplate.cs:73-90`). Parser/serializer:
   `apps/icrp/src/ksa/staticCatalog.ts`, `staticXmlSerializer.ts`.
2. **`InstanceOf` resolves ONLY to `<StaticSubObject>`** (`ModLibrary.Get<StaticSubObjectTemplate>`,
   `ModLibrary.cs:1284`) — never a Part/SubPart/StaticObject. Two levels, no nesting.
3. **Transform** = the vessel `TransformReference` (Position metres, Rotation XYZ radians
   via `CreateFromXyzRadians` ⇒ three `'ZYX'`, `S·R·T`). **`Scale` applies to visuals but
   NOT colliders** (`StaticObject.cs:195-196, 234`). `<Scale>` must always carry X/Y/Z
   (Vector3Reference missing-attr = 0) — inherited from flexo's serializer.
4. **Assembly frame: +X = up (surface normal), +Y = east, +Z = north**
   (`LocationReference.cs:148-177`, `ConstraintSim.cs:519-527`). The ONE mapping to three
   lives in `apps/icrp/src/three/basis.ts`. Vessel parts stack along +X, so vessel meshes
   stand upright unmodified.
5. **`<PartModel>`/`<Collider>` are the vessel classes.** Static-only: `<Terrain>true</Terrain>`
   (`PartModelModule.cs:43-44`) and `<PbrMaterial><Alpha>` (`PbrMaterialReference.cs:24-25`),
   both consumed only by `StaticObjectModel.Bucket` (`:260`) — this closes flexo gaps
   **T1**/**T2** for the static surface. Ignored for statics: RayTracing, ShadowCaster,
   Internal, animation, lights, Emissive/ThinFilm (uploaded, never sampled), `<MeshView>`.
6. **Render buckets** (`StaticObjectModel.cs:16-21,260`): Terrain → planet-ground sampling
   (material textures ignored); Alpha → real blend (`alpha = alphaTex.r`, depth-test-no-write,
   NOT a cutout); else opaque. ICRP mirrors: `apps/icrp/src/three/materials.ts` (incl. the
   `.r`-not-`.g` alphaMap patch). Instancing unit = PartModel **Id** (duplicate ids collide
   first-wins).
7. **The three metres** — only consumers: `GroundOffset` lifts the whole frame
   (`LocationReference.cs:175`); `SurfaceHeight` only feeds spawn height
   (`Vehicle.GetLaunchPadHeightAtDirCcf:3935-3959`: `GroundOffset+SurfaceHeight` within
   `FootprintRadius`); `FootprintRadius` also drives clutter exclusion `+50 m` for at most
   **4** launch-pad landmarks per body (`GroundClutterPlacementData.cs:126-155`).
8. **Physics** (`StaticObject.cs:175-201`, `ConstraintSim.cs:479-537`): one kinematic
   compound per static; per vehicle only the **nearest** launch-pad landmark within
   **300 m**; zero colliders ⇒ vessels fall through (ICRP preflight I4).
9. **Bundler conventions** (`KSA.GlbImport/StaticObjectAssetBundler.cs`, `GlbColliders.cs`,
   `GlbTransforms.cs`) — ICRP's export mirrors them byte-for-byte (golden tests): banner
   comment, element order, `<Collider Id="Collider1">`, `M=`-only distances, empty
   GroundOffset/SurfaceHeight/FootprintRadius on the asset, values in GameData.
10. **Mesh/material registries are global by id, first-wins**
    (`MeshAtlasFileReference.cs:25-49`), so a mod `<StaticSubObject>` may reference any
    Core mesh/material by id with **no binaries** — ICRP's vessel-derived pieces
    (`apps/icrp/src/ksa/modPlan.ts`) and the export-variant discipline both rest on this.
    ⏳ pending in-game verification (**[V1]** in `apps/icrp/VERIFICATION.md`) —
    2026-08-25 partial: a vessel truss piece as a static RENDERS in game (mesh + material
    resolve, scale applies), see facts 11–12 for the look/shadow caveats.
11. **Statics never CAST sun shadows** (engine limitation, verified in the 2026.8.22.5348
    decomp): `StaticObjectModel.cs` has NO shadow-draw path — only `PartModel.cs` /
    `PartModelDynamic.cs` (vessel renderers) feed `PartModelShadowCull` /
    `BuildShadowDraws`, and `PartModelModule.Template.ShadowCaster` is a vessel-only
    switch. Statics DO **receive** shadows (`StaticObject.frag` samples the terrain
    shadow map, the vessel CSM, cloud shadows and celestial shadow). Core pads are flat
    enough that this is invisible; a tall static (scaled truss) makes it obvious. No XML
    can change it.
12. **Metal-heavy vessel pieces read DARK as statics**: `StaticObject.frag` is full PBR —
    a fully-metallic surface (trusses: PBR blue channel ≈ 1) has no diffuse response, so
    its color is mostly environment/ambient reflection. In daylight the static ambient
    path leaves such pieces near-black with a navy sky tint (user-verified screenshot,
    2026-08-25); the same shading dynamics made ICRP's own thumbnails render metal black
    until the RoomEnvironment IBL was added (`catalogThumbs.ts` v2). Whether KSA renders
    the SAME piece brighter on a vessel in the same scene is an open in-game A/B ([V1b]).
    Practical guidance: prefer low-metal pieces for statics, or expect dark steel.

## Break-surface (re-check on a game update)

`D/KSA/`: `StaticObjectTemplate.cs`, `StaticSubObjectTemplate.cs`, `StaticSubObjectInstance.cs`,
`StaticObjectGameDataReference.cs`, `StaticObject.cs`, `StaticObjectModel.cs`,
`StaticObjectRenderer.cs`, `PartModelModule.cs`, `PbrMaterialReference.cs`,
`TransformReference.cs`, `DistanceReference.cs`, `LocationReference.cs`,
`Vehicle.cs` (`GetLaunchPadHeightAtDirCcf`), `ConstraintSim.cs` (`BeginStaticObjectPass` / `ResolveLaunchPads`, was `UpdateStaticObjectCollider` before 5402),
`GroundClutterPlacementData.cs`, `MeshAtlasFileReference.cs`, `ModLibrary.cs` (static
registries + `AttachGameData`). `D/KSA.GlbImport/`: `StaticObjectAssetBundler.cs`,
`GlbColliders.cs`, `GlbTransforms.cs`, `PartInputSet.cs`, `ToolXml.cs`.
`C/Core/`: `CoreLaunchPad{A,B,C}Assets.xml`, `CoreLaunchPadAGameData.xml` (vendored
byte-identical in `src/ksa/__fixtures__/`, drift-tested), `Shaders/Mesh/StaticObject.{vert,frag}`,
`DefaultAssets.xml` (the static-object shader rows, since 5402 including `StaticObjectPrePassIndirectFrag`).

## What changed in 5402

**Nothing in the contract.** `StaticObjectTemplate`, `StaticSubObjectTemplate`,
`StaticSubObjectInstance`, `StaticObjectGameDataReference`, `KSA.GlbImport/StaticObjectAssetBundler`
and `PbrMaterialReference` are byte-identical; `StaticObject` / `StaticObjectModel` /
`LocationReference` changed only by the `Viewport` → `IViewport` refactor. Two renderer-side notes:
`StaticObjectRenderer` now loads a dedicated pre-pass shader,
`ModLibrary.Get<ShaderReference>("StaticObjectPrePassIndirectFrag")` → `DefaultAssets.xml`'s new
`<Shader Id="StaticObjectPrePassIndirectFrag" Path="Shaders/Mesh/StaticObjectNormalIndirect.frag"/>`
(was the shared `PrePassIndirectFrag`); and `ConstraintSim` replaced `UpdateStaticObjectCollider`'s
nearest-pad-within-300 m search with `BeginStaticObjectPass` / `ResolveLaunchPads`, a per-celestial
`LaunchPadPose` list (position + `LandmarkReference.GetAxesCcf` up/east/north) covering **every**
launch-pad landmark with a collision shape — see
[launch-sites.md](launch-sites.md#what-changed-in-5402). The four vendored `CoreLaunchPad*` fixtures
are byte-identical to 5402.
