# Static objects (ICRP)

ICRP reads and writes the KSA build 5801 static-object contract. The game-side
sources are `StaticObjectTemplate.cs`, `StaticSubObjectTemplate.cs`,
`StaticSubObjectInstance.cs`, `PartModelModule.cs`, `ColliderModule.cs`,
`PbrMaterialReference.cs`, and `ContentPrePass.cs`; representative data is in
`CoreLaunchPad{A,B,C}Assets.xml` and `CoreLaunchPadAGameData.xml`.

A `StaticSubObject` defines `PartModels/PartModel Key` and optionally
`Colliders/Collider Key/Colliders` with keyed shapes. Model mesh and material and
convex-hull mesh use `Ref`. A `StaticObject` places pieces through
`SubObjects/SubObject Key Ref`, with optional `Transform`, and may also own
colliders, `GroundOffset`, `SurfaceHeight`, and `FootprintRadius`. Ref names a
`StaticSubObject`, not a vessel `SubPart` or another `StaticObject`.

Game data is a same-tag `<StaticObject Id="…" Modify="Patch">`; appending to
stock arrays requires `SubObjects` or `Colliders` with `Modify="Extend"`.
New models can refer to globally registered Core meshes and materials. Custom
textures are top-level `Texture Id Path Category` rows; PBR slots use `Ref`.
Mesh atlases also require an `Id`. `staticCatalog.ts` consumes flattened Core
content and the shared GLB mesh index; `staticXmlSerializer.ts` emits this
schema, and `modPlan.ts` builds the stock-pad patch or new objects.

Position is in metres and Euler rotation in radians. Scale changes visuals but
not physics shapes; ICRP bakes scaled collider variants. The assembly basis is
+X up, +Y east, +Z north. Terrain models use planet-ground sampling, alpha
materials use the alpha texture's red channel, and otherwise models are opaque.
Static objects receive shadows; the historic limitation that they do not cast
sun shadows remains an in-game verification concern. GroundOffset lifts the
frame; SurfaceHeight and FootprintRadius contribute to spawn height and clutter
exclusion. Recheck `StaticObject.cs`, `ConstraintSim.cs`, and `Vehicle.cs` on a
game update. Current 5801 XML has not been exercised in the game by this change.
