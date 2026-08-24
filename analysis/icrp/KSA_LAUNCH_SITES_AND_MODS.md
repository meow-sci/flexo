# KSA launch sites — schema, spawn, terrain decals, and what a mod can do (build 2026.8.22.5348)

Paths: `D` = `/Users/asherwin/repos/meow-sci/ksa-game-assemblies/current/decomp/KSA`,
`C` = `/Users/asherwin/repos/meow-sci/ksa-linux/Content`, `F` = `/Users/asherwin/repos/meow-sci/flexo`.

## 0. Verdict

| Want                                                                                                                                                                | Possible?                                     | Mechanism                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a `<Landmark>` to Core's Earth from a mod                                                                                                                       | **NO**                                        | Locations live only inside a `CelestialTemplate`; a second `<AtmosphericBody Id="Earth">` is silently dropped by first-wins `TemplateLookup.Register` (`D/SerializedCollection.cs:20-35`, `D/AssetBundle.cs:86-92`). No top-level/patch element exists.                                                                                                                                                        |
| Change `StaticObject=` of an existing landmark                                                                                                                      | **NO**                                        | same reason.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Add a terrain `<Modifier Type="Decal">` to Earth                                                                                                                    | **NO**                                        | modifiers live in `Earth/<Terrain>/<ProceduralModifiers>` (`D/ProceduralModifiersReference.cs:17-18`), same body-level first-wins.                                                                                                                                                                                                                                                                             |
| Register new `<StaticObject>`/`<StaticSubObject>` assets                                                                                                            | **YES**                                       | plain `<Assets>` children (`D/AssetBundle.cs:32-34`), first-wins by Id. But nothing references them unless a Landmark names them.                                                                                                                                                                                                                                                                              |
| **Extend the stock pad prefab** (`CoreLaunchPadA_Prefab_LaunchPadA`) with new sub-objects / colliders and override `GroundOffset`/`SurfaceHeight`/`FootprintRadius` | **YES — the only true partial-override hook** | `<StaticObjectGameData Id="CoreLaunchPadA_Prefab_LaunchPadA">` → `StaticObjectTemplate.ApplyGameData` **AddRange**s SubObjects/Models/Colliders (`D/StaticObjectTemplate.cs:73-90`), applied post-load in `ModLibrary.AttachGameData` (`D/ModLibrary.cs:1862-1874`). All 5 stock sites share that prefab, so the addition appears at all 5.                                                                    |
| Replace Earth wholesale (with landmarks/decals of your choosing)                                                                                                    | **YES, two routes**                           | (a) mod's own `systems=` scenario with an **inline** `<AtmosphericBody Id="Earth">` (system-local lookup, `D/SystemTemplate.cs:43-48`); (b) drag the mod **above Core** in Settings → Mods (`D/GameSettings.cs:2161-2192`, no Core guard) so the mod's Earth wins first-wins. Both need a full copy of Core's Earth block; textures can be reused by `Id` (first-wins reuse — `F/scope/ground-clutter.md:53`). |
| Add a brand-new celestial body with its own launch pads                                                                                                             | **YES**                                       | cartoon-moon pattern: `<PlanetaryBody Id="X">` in Assets + own `<System>` scenario listing it (`F/ksa-mods/cartoon-moon/`).                                                                                                                                                                                                                                                                                    |
| Rotate/heading a pad or complex                                                                                                                                     | **NO per-site rotation**                      | `LocationReference` has only Latitude/Longitude/StaticObject (`D/LocationReference.cs:15-22`); frame is derived from lat/lon: local X=up, Y=east, Z=north (`GetAxesCcf`, `:148-154`). Bake rotation into `<SubObject><Transform><Rotation>`.                                                                                                                                                                   |

## 1. `<Landmark>` and the other LocationReference subclasses

`D/LocationReference.cs`:

```
abstract class LocationReference : SerializedId            // :11
  [XmlAttribute] Id                                           (SerializedId.cs:12-13)
  [XmlElement("Latitude")]  RadianReference Latitude          :15-16   (attrs Degrees= | Radians=, RadianReference.cs:10-13)
  [XmlElement("Longitude")] RadianReference Longitude         :18-19
  [XmlAttribute("StaticObject")] string StaticObjectId = ""   :21-22
  virtual bool ShowGroundMarker => false                      :38
  ForwardCcf = normalize(cos lat cos lon, cos lat sin lon, sin lat)   :45-50  (+Z = north pole, +X = lon 0, +Y = lon 90°E)
```

Subclasses (element name = XML tag, `D/CelestialTemplate.cs:37-41`):

- `<City>` `CityReference` (Class "City"), `<Crater>`, `<Mountain>` — no extra fields.
- `<Landmark>` `LandmarkReference` (`D/LandmarkReference.cs`): `[XmlAttribute] bool IsLaunchPad = false` (:9-10); `ShowGroundMarker => IsLaunchPad` (:14).
- `PoiReference` ("Point of Interest") is **not** a CelestialTemplate child; it is only the `<Location>` element of a Decal modifier (`D/DecalModifierReference.cs:11-16`).

They are parsed into `CelestialTemplate.Locations` (`D/CelestialTemplate.cs:37-41`) and registered into a per-body `SerializedCollection<LocationReference> _locationLookup` (:35, :66-67, first-wins by Id). Lookup: `Celestial.GetLocation(id)` → `BodyTemplate.GetLocation` (`D/Celestial.cs:1844-1847`, `CelestialTemplate.cs:45-48`). Nested `Bodies` are `[XmlIgnore]` (`D/AstronomicalTemplate.cs:70-71`) — bodies are never nested in XML.

### IsLaunchPad semantics (everything it gates)

- Static-object rendering: `UpdateStaticObjectRenderData` returns unless `ShowGroundMarker` (`LocationReference.cs:156-161`), so a Landmark with `StaticObject=` but `IsLaunchPad="false"` resolves but never draws.
- Physics collider for the static object: `ConstraintSim.UpdateStaticObjectCollider` picks the **nearest** `IsLaunchPad` landmark whose static object has a collision shape within sqrt(90000)=300 m (`D/ConstraintSim.cs:481-509`).
- Spawn altitude bump: `Vehicle.GetLaunchPadHeightAtDirCcf` adds `GroundOffset + SurfaceHeight` when the spawn point is within `FootprintRadius` of an `IsLaunchPad` landmark (`D/Vehicle.cs:3935-3956`).
- Ground-clutter exclusion: first **4** IsLaunchPad landmarks with `FootprintRadius > 0` get a clutter-free zone of radius `FootprintRadius + 50 m` (`D/GroundClutterPlacementData.cs:126-155`; `CLUTTER_CLEARANCE_METERS = 50`, `LocationReference.cs:31`).
- Impact FX suppression when the hit static is the pad (`ConstraintSim.cs:1013`, `Celestial.cs:314`).

### How the launch-site list is built — NOT filtered on IsLaunchPad

- `VehicleLaunchMenu.SetLocations` (`D/VehicleLaunchMenu.cs:310-326`): every `location is LandmarkReference` of the selected celestial becomes a synthetic `SituationTemplate{Id=LocationId=location.Id, CelestialId}` wrapped in `LocationObject` (`D/LocationObject.cs`, display "At <LocationId> On <CelestialId>"). Identical code in `VehicleEditor.SetLocations` (`D/VehicleEditor.cs:6919-6934`) and `ConfigOnStartPopup.SetLocations` (`D/ConfigOnStartPopup.cs:296-312`).
- "Launch Body" combo lists every `Celestial` in the current system with `BodyTemplate.Locations.Count > 0`, home body preselected (`VehicleLaunchMenu.cs:51-69`). Default site `StartingLocation = "CCSFS LC-39A"` (:11).
- Consequence: Venus's `<Landmark Id="Venera7">` etc. (`C/Core/Astronomicals.xml:492-516`, no IsLaunchPad) are offered as launch locations too; Cities/Mountains are not.

### Spawn (`Vehicle.GetInitialKinematicStateForLocation`, `D/Vehicle.cs:3898-3933`)

- `dir = celestial.GetDirCcfFromLatLon(lat, lon)` (`D/Celestial.cs:669-677`, same formula as ForwardCcf).
- Orientation: `upCce = cross(cross(spinAxis, dir), dir)`; `Body2Cce = ComputeBody2Cce(dir, upCce)` (`Vehicle.cs:3002-3006`) → body **X = local up (radial)**, **Y = east**, **Z = north**. Fixed; there is no heading parameter anywhere.
- Altitude: `r = MeanRadius + max(terrain height at the 4 bottom bbox corners) + (centerMass.X − boundsMin.X) + GetLaunchPadHeightAtDirCcf` (:3914-3923). Terrain height comes from `Celestial.GetTerrainHeightFromDirCcf` (`Celestial.cs:791-882`), which lerps the height cubemap between `<Height><Minimum>/<Maximum>` and then evaluates the terrain modifiers on CPU (including decals) — so the pad sits on the decal-flattened height.
- Velocity = ω × r (co-rotating), `Landed = true` situation (:1706-1712 in `GetSituationState`).
- Static object frame = same convention: `matrixAsmb2Ego` rows = (up, east, north, pos + up·GroundOffset) (`LocationReference.cs:171-177`); collider pose identical (`ConstraintSim.cs:512-522`). A flexo-placed complex therefore faces: local +X up, +Y east, +Z north; the only way to rotate it is `<SubObject><Transform><Rotation X Y Z>` (XYZ **radians**, `D/TransformReference.cs:8-14,35`; see `C/Core/CoreLaunchPadAAssets.xml:1120-1190` for real values) or the mesh itself.

### StaticObject schema (`D/StaticObjectTemplate.cs`, `StaticSubObjectTemplate.cs`, `StaticSubObjectInstance.cs`)

```
<StaticObject Id>
  <SubObject Id InstanceOf="<StaticSubObject Id>"><Transform><Position X Y Z/><Rotation X Y Z/><Scale/></Transform></SubObject>*   (:9-10)
  <PartModel Id><Mesh Id/><Material Id/></PartModel>*        (:12-13, PartModelModule.Template — same as parts)
  <Collider Id>…</Collider>*                                  (:15-16, ColliderModule.Template)
  <GroundOffset M|Km/> <SurfaceHeight M/> <FootprintRadius M/>   (:18-25, NaN→0 :39-42)
<StaticSubObject Id> <PartModel/>* <Collider/>* </StaticSubObject>
<StaticObjectGameData Id="<existing StaticObject Id>"> same children; lists APPEND, distances override when set (:73-90)
```

Resolution: `StaticObject.ResolveAll` (`D/StaticObject.cs:47-66`) after `AttachGameData`; missing sub-object → error + skip (:121-137); unknown `StaticObject=` id on a landmark → `Location '…' references unknown static object` error (`LocationReference.cs:122-146`). Shipped values: `GroundOffset 0.2 m, SurfaceHeight 1.5537 m, FootprintRadius 108.3 m` (`C/Core/CoreLaunchPadAGameData.xml`). Static-object meshes come from a `<MeshAtlas Path=…glb>` + `<PbrMaterial>` (`CoreLaunchPadBAssets.xml`); GLB nodes named `_Terrain` get the terrain material (version.json:681).

## 2. Terrain Decal modifier

Container: `AstronomicalTemplate.<Terrain>` (`D/AstronomicalTemplate.cs:50`) → `TerrainReference.<ProceduralModifiers>` (`D/TerrainReference.cs:11-12`) → `ProceduralModifiersReference` holds `<GradientScale>` + `[XmlAnyElement("Modifier")]` raw elements dispatched on `Type=` (`D/ProceduralModifiersReference.cs:11-18, 25-60`; `"Decal"` → `DecalModifierReference` :43-44). Sorted by `<Order>` (`TerrainReference.cs:49-50`).

Base `ModifierReference` (`D/ModifierReference.cs:29-51`): attrs `Type`, `Name`, `Biomes` (comma list of biome aliases → mask, :167-183; empty = all); elements `<Seed>`, `<Frequency>`, `<Amplitude Value>` (default 500), `<AmplitudeHeightCurve>`, `<Order Value>`.

`DecalModifierReference` (`D/DecalModifierReference.cs:11-37`):

| element                                           | default                       | meaning                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Location Id><Latitude/><Longitude/></Location>` | 0,0                           | PoiReference; **the `Id` is never looked up** — the decal is tied to a launch site only by sharing coordinates. Core's ids even differ from the landmark ids (`LaunchSite_CCSFS-LC-39A` / Location `CCSFS-LC-39A` vs Landmark `CCSFS LC-39A`, `C/Core/Astronomicals.xml:734-740` vs `:1869`). |
| `<Rotation Degrees>`                              | 0                             | decal in-plane rotation; frame = `axisAngle(Z, rot + π/2 − longitude) * FromTo(forward, Z)` (:58-71)                                                                                                                                                                                          |
| `<Radius Value>`                                  | 100                           | half-size of the square decal footprint, **metres** (:193-201; heightmap uv = local.xy/Radius)                                                                                                                                                                                                |
| `<AltitudeOffset Km>`                             | 0                             | target absolute terrain height for the flattened area — see units below                                                                                                                                                                                                                       |
| `<SmoothFactor Value>`                            | 0.5                           | edge feather ("Feather" in the editor UI :114); 1−smoothstep(1−s,1,dist)                                                                                                                                                                                                                      |
| `<Additive Value>`                                | false                         | true: add `(heightmap−0.5)*Amplitude`; false: **lerp existing height → AltitudeOffset** by feather, then add the same term (:211-224)                                                                                                                                                         |
| `<NoCurvature Value>`                             | false                         | compensates planet curvature so the pad is planar (:217-223)                                                                                                                                                                                                                                  |
| `<HeightMap Id Path Category>`                    | EmptyBlack + error (:165-169) | texture; Core uses `Textures/Planets/_Decals/circle.dds` with `Amplitude 0` so only the flatten term acts                                                                                                                                                                                     |

Core sites (`Astronomicals.xml:733-824`): Radius 275/400/300/250/300, Rotation 0, SmoothFactor 0.69, Order 9999, `Biomes="Grass,Beach"`, AltitudeOffset 16.97 / 225 / 17.27 / 29.11 / 16.02.

**AltitudeOffset units:** the code reads `.Km` (:91, :216) but the terrain height buffer is in **metres**: `CelestialRenderData.SurfaceMinHeight = HeightReference.Minimum.InMeters()` (`D/CelestialRenderData.cs:170`), `SurfaceRadius = MeanRadius` (m) (:168), shader `baseHeight = maxHeight*s + minHeight*(1−s)` (`C/Core/Shaders/Planet/TerrainMesh/PrepareModifiers.comp:165`) and `existingHeight = mix(existingHeight, modAltitudeOffset, feather)` (`…/ProceduralModifiersLibrary/Modifiers.glsl:521-531`). So `Km="16.97"` means **16.97 m above the datum** — it is simply the surveyed/eyeballed local terrain height of each pad (Canaveral ≈17 m, Vandenberg SLC-4 ≈225 m, Kourou ≈29 m…), chosen so the pad neither floats nor floods. `Radius Value` is likewise metres. Only the `Location` lat/lon is real-world.

## 3. Situations

`SituationTemplate` (`D/SituationTemplate.cs`): `[XmlAttribute] InstanceOf`, `<Orbit>` or `<CelestialId>` + `<LocationId>`. `<Situation Id>` is an `<Assets>` child (`AssetBundle.cs:67`). `Vehicle.GetSituationState` resolves `LocationId` (or `InstanceOf` as a location id fallback) via `celestial.GetLocation` and spawns exactly as §1 (`D/Vehicle.cs:1668-1712`). `C/Core/Situations.xml` only defines the 5 starting-vehicle **orbits**; the launch menu/editor/start popup synthesize `SituationTemplate`s per Landmark at runtime, so **a new launch site needs no `<Situation>`**. A `<Situation>` is only useful to pre-place a `<LoadVehicleFromLibrary>` vehicle via `<SituationRef InstanceOf>` (`C/Core/EarthSystem.xml:39-70`, `D/VehicleTemplate.cs:12-13`).

## 4. Mod merging — exact mechanics

Loading (`D/ModLibrary.cs`): `PrepareManifest` (:232-323) reads `<Documents>/manifest.toml` (copied from `Content/manifest.toml` on first run), marks Core entries, scans `Content/*/mod.toml` and `<Documents>/mods/*/mod.toml` (`AddMods` :326-369; new dirs appended **disabled**, `D/ModEntry.cs:40-47`). `PrepareAll` (:371-445) instantiates enabled mods **in manifest order**; `PreloadAssetBundles` (:447-460, `Preload=true`: only celestial/vehicle/situation templates) then `LoadAll` (:476-520) call `Mod.LoadAssetBundles`/`LoadSystems` per mod in that order.

Registration is `SerializedCollection.Register` = `ConcurrentDictionary.TryAdd` → **first-wins, silent** (`D/SerializedCollection.cs:20-35`). Astronomicals: `AssetBundle.OnDataLoad` registers each `AstronomicalTemplate` into `ModLibrary.TemplateLookup` only if the **selected** scenario's `<LoadFromLibrary>` names it (`D/AssetBundle.cs:86-92`, `SystemInfo.Requires` `D/SystemInfo.cs:85-100`); the return value is ignored, no duplicate warning. Scenarios resolve `<LoadFromLibrary Id>` through `ModLibrary.Get<AstronomicalTemplate>` → `TemplateLookup` (`D/AstronomicalReference.cs:18-26`, `ModLibrary.cs:820-828`).

Therefore, with Core first in the manifest: a mod `<AtmosphericBody Id="Earth">` is **parsed, its OnDataLoad runs (textures get registered!), then it is dropped**; nothing merges. There is no body-patch element: `Locations`/`Terrain` exist only on `CelestialTemplate`/`AstronomicalTemplate`, and `AssetBundle` (`AssetBundle.cs:12-73`) has no `<Landmark>`/`<Modifier>` child.

What does merge:

- `<StaticObjectGameData Id>` onto an existing `<StaticObject>` (`AttachGameData` `ModLibrary.cs:1862-1874`, lists append, order-independent). Duplicate GameData ids also merge onto each other (`D/StaticObjectGameDataReference.cs:13-20`). Same pattern as `<PartGameData>`.
- Textures/materials/meshes: first-wins by Id, so a mod may reference Core textures by `Id` alone (`F/scope/ground-clutter.md:53`; cartoon-moon reuses Luna's).

Full-replacement routes:

1. **Own scenario with inline body**: `SystemTemplate` accepts inline `<AtmosphericBody>` (`D/SystemTemplate.cs:21-28`, Titan/Neptune are inline in `C/Core/SolSystem.xml:790,1230`); inline bodies register into the system-local `_bodyLookup` (:43-48) and never touch `TemplateLookup`, so no collision with Core's Earth. The mod's `systems=[…]` file is listed in the system picker (`Mod.PrepareSystems` `D/Mod.cs:417-441`). Cost: copy Core's whole Earth block (`Astronomicals.xml:522-1889`, ~1.4k lines) and maintain it across game updates; texture refs by Id.
2. **Reorder above Core**: Settings → Mods tab drag-reorders any entry and toggles `enabled`, Core included (`D/GameSettings.cs:2161-2192`; `ModEntry.Core` is only used to detect orphans, `ModLibrary.cs:293-297`). Then the mod's `<AtmosphericBody Id="Earth">` wins in every scenario. Fragile (user action + a user-visible manifest change) but works.

Path sandboxing: `FileReference.ModPath = Mod.GetPath(LocalPath)` = `Path.Combine(DirectoryPath, LocalPath)` (`D/FileReference.cs:24`, `D/Mod.cs:389-392`) — relative to the mod dir; `Category` is a texture size cap (`F/scope/custom-assets-and-mod-export.md:72`). `HeightMap Path` for decals is subject to the same rule; Core's `Textures/Planets/_Decals/circle.dds` can be reused by `Id="Circle"` only after Core registered it.

## 5. mod.toml / manifest.toml

`manifest.toml` (`D/ModManifest.cs`, `ModEntry.cs`): `[[mods]] id = "<folder>" enabled = true|false`, order = load order. Shipped: only Core (`C/manifest.toml`).

`mod.toml` (`D/Mod.cs:26-76`, Tomlet): `name`, `textureSizeCaps[]`, `supportedShadowMaps[]`, `supportedThumbnailSizes[]`, `supportedCloudQuality/OceanSim/Exhaust/KittenFur/ShadowSlots[]`, `simulationSpeeds[]`, `planetMeshes[]` (`<PlanetMeshCollection>` files), `planetRandomHeightmapCollections[]`, `systems[]` (`<System>` scenario files, parsed twice: as `SystemInfo` for the picker and `SystemTemplate` on load), `assets[]` (**`<Assets>` bundle files — any filename; no directory scan, no `*Assets.xml`/`*GameData.xml` convention; Core lists 60 files incl. `Astronomicals.xml`, `Situations.xml`, `CoreLaunchPad{A,B,C}Assets.xml`, `CoreLaunchPadAGameData.xml`**, `C/Core/mod.toml:20-80`), `starBinaries[]`, `fonts[]`, `[console] onLoad/onBoot`. Mod id = folder name. Mods live in `Content/<id>/` or `<Documents>/mods/<id>/` (`ModLibrary.cs:176,391-412`).

`C/Sample/` contains only `star_import_manifest.toml` (no mod.toml) — not a mod template. `C/Versions/` holds 154 changelog files up to `v2026.8.X.5348.json`; relevant history: static objects + first pad (version.json:597-600), decals per site + NoCurvature + `_Terrain` node handling (:667-682).

## 6. Recommendation for the planning doc

- Ship a launch-complex mod as `<StaticSubObject>`s + a `<StaticObjectGameData Id="CoreLaunchPadA_Prefab_LaunchPadA">` that appends them (optionally overriding `FootprintRadius`/`SurfaceHeight`). Works today, no Core edit, appears at all 5 stock pads (no per-site targeting — accept or document).
- Author geometry in the pad frame: +X up, +Y east, +Z north, metres, rotations XYZ radians. Keep colliders within ~300 m of the landmark (collider pick radius) and structures within `FootprintRadius` if the vessel should spawn on them.
- For per-site / new-site complexes, offer the "own scenario with inline Earth" export (heavy) and flag the "move above Core" route as an advanced manual step; neither is a merge.
- Do not expose per-site rotation or terrain-decal authoring for stock Earth — the game has no hook for either.
