# Launch sites & system mods (`apps/icrp`)

How KSA defines **launch sites** and what a mod can (and cannot) do about them —
the contract behind ICRP's site management + self-contained system-mod export.
Full evidence: [analysis/icrp/KSA_LAUNCH_SITES_AND_MODS.md](../analysis/icrp/KSA_LAUNCH_SITES_AND_MODS.md)
and [analysis/icrp/PEBKAC_SYSTEM_MODS.md](../analysis/icrp/PEBKAC_SYSTEM_MODS.md);
plan: [plans/ICRP_PLAN.md](../plans/ICRP_PLAN.md) §0.3 (L1–L9) + §Phase 7.

## Contract facts

1. **A mod cannot patch a Core body** (L1): `<Landmark>`s and terrain `<Modifier>`s live
   only inside the body element (`CelestialTemplate.cs:37-41`,
   `ProceduralModifiersReference.cs:17-18`); a second `<AtmosphericBody Id="Earth">` is
   **silently dropped** first-wins (`AssetBundle.cs:86-92`, `SerializedCollection.cs:20-35`).
   No patch element exists. Hence ICRP ships a whole `<System>` (D2).
2. **Inline bodies in a mod's own `<System>` don't collide with Core** (`SystemTemplate.cs:21-27,
43-48` — system-local lookup; Core inlines Titan/Neptune itself). `<LoadFromLibrary Id Parent>`
   pulls Core bodies. A mod's `systems=[…]` files appear in the game's system picker
   (`Mod.cs:417-441`). Writer: `apps/icrp/src/ksa/systemXml.ts`.
3. **The one partial-override hook**: `<StaticObjectGameData Id="CoreLaunchPadA_Prefab_LaunchPadA">`
   appends sub-objects/colliders to the stock pad — at **all 5** stock Earth sites at once
   (they share the prefab, `Astronomicals.xml:1869-1888`). ICRP's "extend stock pad" mode.
4. **`<Landmark>` schema** (`LocationReference.cs:15-22`, `LandmarkReference.cs:9-10`):
   `Id`, `IsLaunchPad` (default false), `StaticObject` attr; `<Latitude|Longitude Degrees|Radians>`.
   **No heading/rotation** — orientation is fixed up/east/north from lat/lon; rotate the
   complex by rotating its placements about up.
5. **`IsLaunchPad="true"` gates everything**: static rendering (`ShowGroundMarker`),
   the pad collider, the spawn bump, clutter exclusion. But **the launch-site pickers do
   NOT filter on it** — every `LandmarkReference` on a body is offered
   (`VehicleLaunchMenu.cs:310-326`).
6. **Terrain decal** (`DecalModifierReference.cs`): `<Modifier Type="Decal" Name Biomes>` with
   Amplitude/Order/Radius (metres)/Rotation/`<Location>`(lat-lon; its Id is never looked up)/
   `AltitudeOffset`/`SmoothFactor`/`HeightMap`. **`AltitudeOffset Km=` is consumed as METRES**
   (`CelestialRenderData.cs:168-170`, `PrepareModifiers.comp:165`) — the site's local terrain
   height. Core's `circle.dds` height map is reusable by `Id="Circle"`. Builder:
   `apps/icrp/src/ksa/landmarkXml.ts`.
7. **Spawn** (`Vehicle.cs:3898-3959`): altitude = mean radius + max terrain height under the
   4 bottom bbox corners (CPU terrain evaluation **includes decals**) + half-height +
   `GroundOffset + SurfaceHeight`; body frame X=up/Y=east/Z=north; co-rotating, Landed.
8. **Texture references in an inline body clone**: an element with `Id` and **empty Path**
   is a pure registry reference (`FileReference.cs:42-49` — `_isReference` iff Path empty),
   resolved to Core's already-loaded asset. Earth's block has 3 anonymous (`Path`-only)
   textures which get `../Core/…` re-rooting (works from a `Content/<mod>/` install;
   ⏳ **[V5]** verifies both routes). Never apply path rewrites to ICRP's own asset XML.
9. **Mod loading** (`Mod.cs:26-76`, `ModManifest.cs`): `manifest.toml` order = load order,
   **new mods append disabled** (the export dialog says so); `mod.toml` lists `assets=[…]`
   and `systems=[…]` explicitly (no directory scan); paths are mod-dir-relative;
   `Category=` is a texture size cap. Emitter: `apps/icrp/src/ksa/modPlan.ts`.

## Break-surface (re-check on a game update)

`D/KSA/`: `LocationReference.cs`, `LandmarkReference.cs`, `CelestialTemplate.cs`,
`AstronomicalTemplate.cs`, `SystemTemplate.cs`, `SystemInfo.cs`, `AstronomicalReference.cs`,
`DecalModifierReference.cs`, `ModifierReference.cs`, `ProceduralModifiersReference.cs`,
`Mod.cs`, `ModManifest.cs`, `ModLibrary.cs`, `FileReference.cs`, `VehicleLaunchMenu.cs`,
`Vehicle.cs` (spawn), `Celestial.cs` (`GetTerrainHeightFromDirCcf`).
`C/Core/`: `Astronomicals.xml` (the Earth block **hash** — ICRP stamps it per body override
and re-clones on export; drift = re-export), `SolSystem.xml` (the stock LoadFromLibrary list),
`mod.toml`, `manifest.toml`, `Textures/Planets/_Decals/circle.dds`.
