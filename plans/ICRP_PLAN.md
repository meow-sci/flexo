# ICRP PLAN — "Inanimate Carbon Rod Placer": a KSA static-object (launch complex) layout editor

**Status**: v1 IMPLEMENTED on `feature/icrp` (2026-08-24 — see §0.10 for what shipped vs deferred) · **Authored**: 2026-08-23 · **KSA baseline**: `2026.8.22.5348` (the build that introduced static objects, r5328–r5336) · **flexo baseline**: `main` @ `45eabaf`

**Codename**: ICRP (Inanimate Carbon Rod Placer). Product name TBD; the code uses `icrp` everywhere (folder, store prefixes, mod ids, persisted keys).

Every code citation (`path:line`) was verified against the working trees at authoring time. Symbol names are the durable reference; line numbers are a convenience — re-locate by name if a file has drifted. Paths:

| Prefix | Absolute path | What |
|---|---|---|
| `D/` | `/Users/asherwin/repos/meow-sci/ksa-game-assemblies/current/decomp/` | complete ILSpy decomp of the KSA build (`KSA/`, `KSA.GlbImport/`, …) — **the schema authority** |
| `C/` | `/Users/asherwin/repos/meow-sci/ksa-linux/Content/` | complete game content (XML + binaries) of the same build |
| `F/` | `/Users/asherwin/repos/meow-sci/flexo/` | this repo (`src/` = flexo editor, `apps/` = mini apps) |
| `A/` | `/Users/asherwin/repos/meow-sci/flexo-private-assets/` | flexo's private binary asset subset (GLB/KTX2), mirrored to `/ksa/` in dev |
| `P/` | `/Users/asherwin/repos/meow-sci/pebkac/` | the solar-system builder (prior art for system mods, §7) |

**Research corpus (read these first — they are the detailed evidence behind every fact below):**

- [analysis/icrp/KSA_STATIC_OBJECTS.md](../analysis/icrp/KSA_STATIC_OBJECTS.md) — full static-object schema + runtime semantics (classes, transform math, frame, rendering buckets, physics, GLB→XML bundler conventions), with `D/` citations.
- [analysis/icrp/KSA_LAUNCH_SITES_AND_MODS.md](../analysis/icrp/KSA_LAUNCH_SITES_AND_MODS.md) — `<Landmark>` / launch-site schema, vessel spawn frame, terrain decals, the mod-merging verdict, `mod.toml`/`manifest.toml`.
- [analysis/icrp/STATIC_ASSET_INVENTORY.md](../analysis/icrp/STATIC_ASSET_INVENTORY.md) — every launch-pad file, GLB node/mesh tables, per-piece bounding boxes, KTX2 formats, shader summary, what `A/` is missing.
- [analysis/icrp/FLEXO_REUSE_MAP.md](../analysis/icrp/FLEXO_REUSE_MAP.md) — module-by-module reuse verdicts (AS-IS / CHANGES / REWRITE / NOT NEEDED) with `F/src` citations.
- [analysis/icrp/PEBKAC_SYSTEM_MODS.md](../analysis/icrp/PEBKAC_SYSTEM_MODS.md) — how pebkac ships a self-contained system mod and what §7 reuses from it.

---

## 0. Overview

### 0.1 What ICRP is

KSA build 5348 added **static objects**: rigid prefabs (`<StaticObject>`) composed of reusable pieces (`<StaticSubObject>`) that sit at a fixed latitude/longitude on a celestial body and are rendered, collided with, and used as launch pads. The only shipped example is the launch pad `CoreLaunchPadA_Prefab_LaunchPadA` (16 sub-object instances from 10 pieces across three asset files), referenced by all five stock Earth launch sites.

ICRP is a web editor, sibling to flexo, that:

1. **Lays out static objects** from a library of pieces — the Core launch-pad pieces, **any Core vessel SubPart mesh** (the mesh/material registries are global by Id, §0.3 F12), and user-imported GLBs — with placement tooling built for ground layouts (ground lock, stacking, anchor/vertex/grid snapping, arrays, reusable *assemblies*), and edits the per-object metres (`GroundOffset`, `SurfaceHeight`, `FootprintRadius`) and colliders.
2. **Manages launch sites**: which static object stands at which lat/lon on which body, with the terrain-flattening decal each site needs.
3. **Exports one self-contained KSA mod**: static-object Assets/GameData XML (+ custom GLB/KTX2 when needed) **and** a `<System>` scenario that redefines the bodies carrying new sites (whole-body copies with the added `<Landmark>`s and `<Modifier Type="Decal">`s), because the game offers no way to patch a Core body (§0.3 L1).

It is *not* a vessel editor. Everything vessel-specific in flexo (engines, tanks, connectors, IVA, animation, lights, kittens) is out of scope.

### 0.2 Locked decisions (user-confirmed 2026-08-23 — do not re-litigate)

| # | Decision | Ruling |
|---|---|---|
| D1 | Where ICRP lives | **`F/apps/icrp/`** in the flexo repo, following the `apps/partpreview` precedent: its own Vite root/bundle importing flexo's pure modules by relative path (`../../../src/...`), sharing the dev asset mirror, `public/basis|draco|hdr`, deploy workflow and private-assets checkout. Shell/document stores whose closed unions differ (`Mode`, `Tool`, `DialogId`, hotkey scopes, `EntityKind`) are **copied**, never imported. Keep `apps/icrp/SHARED_IMPORTS.md` listing every `src/` import — that list is the manifest for a later pnpm-workspace extraction (not now). |
| D2 | Launch-site delivery | **A self-contained system mod.** ICRP always exports a mod with `systems=[…]` whose `<System>` defines every body that carries an ICRP site *inline* (a full copy of the Core body block with ICRP's landmarks/decals injected; other bodies via `<LoadFromLibrary>`). Prior art and reusable code: `P/` (pebkac, §7). The "append to the stock pad via `<StaticObjectGameData>`" hook (§0.3 L3) is offered as a secondary *extend stock pad* export mode because it is free. |
| D3 | Constitution | ICRP inherits `F/AGENTS.md` wholesale: model **only** the current KSA build, **no migration/back-compat/fallback code** (schema-version purge + default-fill), `scope/` catalog updated in the same change as any game-contract code, vendored byte-identical fixtures, pnpm/oxlint/oxfmt/React Compiler, Node 24 type-stripping scripts, kit-only UI, commands-as-data, `useNumberDraft` numerics, undo enrollment per mutator. |
| D4 | Coordinates | The document stores **raw KSA numbers** (metres, XYZ radians, in the static-object assembly frame: **+X up, +Y east, +Z north**). The three.js scene applies the frame change **once, on the scene root** (§0.5). `F/src/three/coords.ts` is reused untouched (`EULER_ORDER = 'ZYX'`). |
| D5 | Data-only mods | ICRP never emits code, shaders or planet meshes. Textures/meshes are referenced by Core `Id` whenever they exist in Core (first-wins registry), and shipped only for user-imported assets. |
| D6 | Piece reuse | Three piece sources, one library: Core `<StaticSubObject>`s, Core vessel `<SubPart>`s (exported as new `<StaticSubObject>`s that reference the Core mesh/material by Id, plus the SubPart's own colliders), and custom GLBs. No nesting exists in KSA (§0.3 F3); ICRP-side *assemblies* are editor groups that **flatten** on export. |
| D7 | Project shape | One ICRP project = one mod: **N static objects + M sites on K bodies**. The "active object" swap pattern from `F/plans/MULTI_PART_PLAN.md` (partsStore park/hydrate) is the model for N objects. Fresh schema (`ICRP_PROJECT_SCHEMA_VERSION = 1`), fresh IndexedDB names (`icrp-*`), fresh `icrp:` persisted keys. |
| D8 | Scope of v1 | Everything in Phases 0–9. Mobile/phone layout, thumbnails-in-CI and the wiki preview are explicitly **later**. |

### 0.3 Verified game-contract facts this plan builds on

Verified in `D/` and `C/` on 2026-08-23. Each fact names the file to re-check on a game update (also listed in `scope/static-objects.md` / `scope/launch-sites.md`, P9).

**F — static-object format**

1. **Three XML elements, all `<Assets>` children** (`D/KSA/AssetBundle.cs:32-34`): `<StaticObject>` → `StaticObjectTemplate` (`D/KSA/StaticObjectTemplate.cs`), `<StaticSubObject>` → `StaticSubObjectTemplate`, `<StaticObjectGameData>` → `StaticObjectGameDataReference` (subclass of the template with `_isGameData = true`). Registered first-wins by Id into `ModLibrary.AllStaticObjects / AllStaticSubObjects / AllStaticObjectGameData` (`D/KSA/ModLibrary.cs:92-96, 682-692`).
2. **`<StaticObject Id>`** = `<SubObject>*` + `<PartModel>*` + `<Collider>*` + `<GroundOffset>` + `<SurfaceHeight>` + `<FootprintRadius>` (`StaticObjectTemplate.cs:9-25`). The three distances are `DistanceReference` (`M=`/`Km=`/… attributes, all-NaN = unset, NaN→0 when read, `:33-42`). **`<StaticSubObject Id>`** = `<PartModel>*` + `<Collider>*` only (`D/KSA/StaticSubObjectTemplate.cs:9-13`) — no transform, no children.
3. **`<SubObject Id InstanceOf><Transform>…</Transform></SubObject>`** (`D/KSA/StaticSubObjectInstance.cs:5-29`): `InstanceOf` resolves **only** through `ModLibrary.Get<StaticSubObjectTemplate>` (`ModLibrary.cs:1284-1291`); it cannot name a `<Part>`, `<SubPart>` or another `<StaticObject>`. **Hierarchy is exactly two levels.** `Id` is informational (unused at runtime). Missing references log an error and are skipped (`D/KSA/StaticObject.cs:117-137`). Cross-file references are fine (resolution is deferred to `StaticObject.ResolveAll`, `ModLibrary.cs:1881`).
4. **Transform** = shared `TransformReference` (`D/KSA/TransformReference.cs:8-15`): `<Position X Y Z>` raw metres, `<Rotation X Y Z>` **XYZ radians** via `QuaternionEx.CreateFromXyzRadians` (`D/KSA/QuaternionEx.cs:179-192`), `<Scale X Y Z>` default 1. Composition `S·R·T` (`StaticObject.cs:228-235`) — identical to vessel SubParts, so flexo's calibrated `EULER_ORDER = 'ZYX'` (`F/src/three/coords.ts:28`) applies verbatim. **Scale applies to visuals but NOT to colliders** (`StaticObject.cs:195-196, 234`).
5. **Assembly frame on the planet: +X = up (surface normal), +Y = east, +Z = north**, right-handed (`D/KSA/LocationReference.cs:148-154` `GetAxesCcf`, `:171-177` `matrixAsmb2Ego` rows `[up; east; north; origin]`; identical Bepu pose `D/KSA/ConstraintSim.cs:519-527`). Vessels on the pad use the same body frame (`D/KSA/Vehicle.cs:3002-3006, 3922`), and vessel parts stack along +X (Core tank connectors at `<Position X="±0.5">`, `F/src/ksa/__fixtures__/CoreFuelTankAAssets.xml:321-329`), so vessel meshes stand upright in the static frame with no correction. Shipped data confirms X-up: every pad piece is 0.04–1.8 m thick in X and 15–164 m wide in Y/Z (`STATIC_ASSET_INVENTORY.md` §3).
6. **`<PartModel>` and `<Collider>` are literally the vessel classes** (`PartModelModule.Template`, `ColliderModule.Template`). Static-only fields: `<PartModel><Terrain>true</Terrain>` (`D/KSA/PartModelModule.cs:43-44`) and `<PbrMaterial><Alpha Path Category>` (`D/KSA/PbrMaterialReference.cs:24-25`), both consumed only by `StaticObjectModel.Bucket` (`D/KSA/StaticObjectModel.cs:260`). **Ignored for statics**: `RayTracing`, `ShadowCaster`, `Internal`, animations, lights, `PartModelDynamic`; Emissive/ThinFilm handles upload but `Shaders/Mesh/StaticObject.frag` never samples them. `<MeshView>` is irrelevant (nothing raycasts statics; the bundler drops `_VM` nodes).
7. **Render buckets** (`StaticObjectModel.cs:16-21, 260`): `Terrain ? OpaqueTerrain : (Alpha ? Blended : Opaque)`. Blended = real alpha blend, depth-test-no-write, drawn after the vessel super-mesh (`D/KSA/StaticObjectRenderer.cs:188-189`), **not a cutout** — alpha = `alphaTex.r` (`C/Core/Shaders/Mesh/StaticObject.frag:360-362`). OpaqueTerrain ignores the material textures entirely and samples the planet's biome cubemaps biplanarly with the Hapke BRDF (`frag:142-246, 312-314`) — the piece is a "skirt" that borrows the ground look. SSAO is sampled then overridden `ao = 1.0` (`frag:330-332`). Instancing unit = **PartModel Id** (`StaticObjectModel.cs:262-274`, first-wins on duplicate ids across files).
8. **The three metres** — consumers (grep-verified, nothing else): `GroundOffset` lifts the whole frame (render + collider) along the surface normal at the landmark (`LocationReference.cs:175`, `ConstraintSim.cs:523`). `SurfaceHeight` is used **only** for vessel spawn: `Vehicle.GetLaunchPadHeightAtDirCcf` adds `GroundOffset + SurfaceHeight` when the spawn point is within `FootprintRadius` of a launch-pad landmark (`Vehicle.cs:3935-3959`). `FootprintRadius` also drives ground-clutter exclusion `FootprintRadius + 50 m` for **at most the first 4** launch-pad landmarks per body (`D/KSA/GroundClutterPlacementData.cs:126-155`). Core values: `0.2 / 1.5537 / 108.3` (`C/Core/CoreLaunchPadAGameData.xml`).
9. **Physics** (`StaticObject.cs:175-201`, `ConstraintSim.cs:479-537`): one kinematic Bepu `BigCompound` per static from all colliders (instance Position/Rotation only); per vehicle, the **nearest** launch-pad landmark within **300 m** whose static has a shape becomes one Bepu static. Collision with vessels is live and counts as ground; statics don't collide with each other or with clutter. Zero colliders ⇒ no shape ⇒ vessels fall through.
10. **GameData merge** (`StaticObjectTemplate.cs:73-90`, `ModLibrary.cs:1862-1874`): `ApplyGameData` **appends** `SubObject`/`PartModel`/`Collider` lists and **replaces the three distances only when set**; applied after all mods load, order-independent; GameData for an unknown object logs an error. Duplicate GameData ids stack onto each other (`D/KSA/StaticObjectGameDataReference.cs:13-20`). Core splits geometry (autogenerated `*Assets.xml`) from the three metres (`*GameData.xml`); ICRP mirrors that split.
11. **Only `<Landmark IsLaunchPad="true">` shows a static**: rendering (`LocationReference.cs:156-161` gated by `ShowGroundMarker` = `IsLaunchPad`, `D/KSA/LandmarkReference.cs:9-14`), collider (`ConstraintSim.cs:494`), spawn bump and clutter exclusion all require it. A `StaticObject=` on a City/Crater/Mountain or a non-launch-pad Landmark resolves but does nothing.
12. **Mesh and material registries are global, first-wins, by name** (`D/KSA/MeshAtlasFileReference.cs:25-49` registers every glTF mesh by its mesh name, `Interleaved = true`; materials by `<PbrMaterial Id>`). Therefore a mod `<StaticSubObject>` may reference **any Core mesh/material by Id without shipping binaries** — the same trick flexo uses for IVA→NotIVA variants (`F/docs/iva-seats.md`). `<Mesh Id>` must equal the glTF **mesh** name (bundler uses the node name; Core keeps them equal). The static renderer draws from the shared interleaved buffer every `<MeshAtlas>` feeds (`StaticObjectModel.cs:234, 297-303`), so vessel atlases qualify.
13. **GLB→XML bundler conventions** (`D/KSA.GlbImport/StaticObjectAssetBundler.cs`, `GlbColliders.cs`, `GlbTransforms.cs`, `PartInputSet.cs`), which ICRP's exporter reproduces so output is indistinguishable from Core's: stem = filename up to first `_`; `<Stem>_MeshAtlas.glb` → one `<StaticSubObject Id=node>` per node not starting `_` and not ending `_VM`, `<PartModel Id="<node>_Model"><Mesh Id=node/><Material Id="<Stem>_Material"/>`, `<Terrain>true</Terrain>` iff a direct child is named `_Terrain*`, `<Collider Id="Collider1">` from direct `_ColPrim_{Box,Sphere,Capsule,Cylinder,Hull}` children (size from node **scale**: Box = scale; Sphere r = 0.5·sx; Cylinder/Capsule `LengthY = sy`, r = 0.5·sx; ids `"{Type}Collider{n}"`). A glb whose name contains `_Prefab` → `<StaticObject Id=<filename>>` with `<SubObject Id=meshName InstanceOf=meshName minus trailing [.\d]+>` and TRS copied verbatim (zero components omitted, Scale omitted at 1). Output banner: `<!-- This file is autogenerated by GlbToXmlUtility from source assets. -->`.
14. **GLB format is identical to vessel atlases** (`STATIC_ASSET_INVENTORY.md` §2): POSITION/NORMAL/TEXCOORD_0 f32, u16 indices, no TANGENT/COLOR/materials/extensions, one node per mesh with the same name, `_ColPrim_*` unit-primitive children, new `_Terrain` marker child (Pad C only). `F/src/three/MeshAtlasCache.ts:31` `getSubPartGeometry(atlasUrl, nodeName)` loads them unchanged. Textures: 2048² BC7 (Diffuse/PBR), BC5 (Normal), and **BC4 single-channel `_Alpha`** (Pad B) — the first real user of scope gap T1; `A/tools/reencode-textures-uastc.py` already handles vkFormat 139/141/145.

**L — launch sites and mods**

1. **A mod cannot patch a Core body.** `<Landmark>`s and terrain `<Modifier>`s live only inside the body element (`D/KSA/CelestialTemplate.cs:37-41`, `D/KSA/ProceduralModifiersReference.cs:17-18`); a second `<AtmosphericBody Id="Earth">` from a mod is parsed (its textures even register) and then **silently dropped** by first-wins `TryAdd` (`D/KSA/AssetBundle.cs:86-92`, `D/KSA/SerializedCollection.cs:20-35`). No top-level `<Landmark>` element, no patch mechanism (`AssetBundle.cs:12-73`).
2. **Inline bodies in a mod's own `<System>` do not collide with Core**: `SystemTemplate` accepts `<AtmosphericBody>`/`<PlanetaryBody>`/… inline (`D/KSA/SystemTemplate.cs:21-27`) into a system-local lookup (`:43-48`); Core itself inlines Titan/Neptune (`C/Core/SolSystem.xml:790,1230`). `<LoadFromLibrary Id Parent>` (`:27`, `D/KSA/AstronomicalReference.cs:18-26`) pulls Core bodies by Id. A mod's `systems=[…]` files appear in the game's system picker (`D/KSA/Mod.cs:417-441`). **This is D2's mechanism**: copy Core's Earth block (`C/Core/Astronomicals.xml:522-1889`, ~1.4k lines) inline, inject landmarks + decals, `LoadFromLibrary` everything else.
3. **The one true partial-override hook**: `<StaticObjectGameData Id="CoreLaunchPadA_Prefab_LaunchPadA">` appends sub-objects/colliders to the stock pad and overrides its metres (F10) — the addition appears at **all 5** stock Earth sites (`C/Core/Astronomicals.xml:1869-1888`, all → the same prefab). No per-site targeting.
4. **`<Landmark>` schema** (`D/KSA/LocationReference.cs:15-22`, `LandmarkReference.cs:9-10`): attributes `Id`, `IsLaunchPad` (default false), `StaticObject` (id string, default empty); elements `<Latitude Degrees|Radians>`, `<Longitude Degrees|Radians>`. **No rotation/heading anywhere** — a static's orientation is fixed by lat/lon (up/east/north); rotate the complex by baking rotation into `<SubObject><Transform><Rotation>`. `ForwardCcf = (cos lat cos lon, cos lat sin lon, sin lat)` (`:45-50`).
5. **Launch-site pickers do NOT filter on `IsLaunchPad`**: every `LandmarkReference` on a body is offered (`D/KSA/VehicleLaunchMenu.cs:310-326`, `D/KSA/VehicleEditor.cs:6919-6934`, `D/KSA/ConfigOnStartPopup.cs:296-312`); the body combo lists any celestial with `Locations.Count > 0`. Cities/Craters/Mountains are not offered.
6. **Spawn** (`Vehicle.cs:3898-3933`): altitude = mean radius + max terrain height under the 4 bottom bbox corners (CPU terrain evaluation **includes decals**, `D/KSA/Celestial.cs:791-882`) + half-height + `GroundOffset + SurfaceHeight` (F8). Landed, co-rotating.
7. **Terrain decal** (`D/KSA/DecalModifierReference.cs:11-37`, base `D/KSA/ModifierReference.cs:29-51`): `<Modifier Type="Decal" Name Biomes>` with `<Amplitude Value>`, `<Order Value>`, `<Location Id><Latitude/><Longitude/></Location>` (a `PoiReference`; **the Id is never looked up** — Core's decal ids don't even match the landmark ids), `<Rotation Degrees>`, `<Radius Value>` (metres, half-size; Core uses 250–400), `<AltitudeOffset Km>`, `<SmoothFactor Value>` (feather, Core 0.69), `<Additive>`, `<NoCurvature>`, `<HeightMap Id Path Category="TerrainHeight">` (Core: `Textures/Planets/_Decals/circle.dds`, BC4 128², reusable by `Id="Circle"` once Core registered it). Non-additive mode lerps terrain to `AltitudeOffset`. **Units gotcha: the attribute is `Km=` but the value is consumed as metres** (`D/KSA/CelestialRenderData.cs:168-170`, `C/Core/Shaders/…/PrepareModifiers.comp:165`) — Core's `16.97` (Canaveral) and `225` (Vandenberg) are the local terrain heights in metres. ICRP must let the user enter the site's terrain height in metres and write it into `Km=` unchanged.
8. **Situations are not needed for a site** (`C/Core/Situations.xml` holds only starting-vehicle orbits; `D/KSA/SituationTemplate.cs`).
9. **Mod loading** (`D/KSA/Mod.cs:26-76,157-169`, `D/KSA/ModManifest.cs`, `D/KSA/ModLibrary.cs:176,391-412`): mods live in `Content/<id>/` or `<Documents>/mods/<id>/`; `manifest.toml` order = load order, new mods appended **disabled**; `mod.toml` `assets=[…]` lists `<Assets>` files explicitly (any filename, no directory scan), `systems=[…]` lists `<System>` files; all `Path=` are mod-dir-relative (`D/KSA/FileReference.cs:24`); `Category=` is a texture-size cap (`F/scope/custom-assets-and-mod-export.md`). Core's list: `C/Core/mod.toml:20-80` (includes the four `CoreLaunchPad*` files).

**A — assets**

1. `A/` (flexo-private-assets) has **none** of the static files: `A/copy-assets.ts:98` predicate `hasParts = /<(Part|SubPart)[\s>]/` doesn't match `<StaticSubObject`/`<StaticObject`. Widening it pulls 4 XML + 3 GLB + 10 KTX2 (P0.01). `ksa-game-assemblies/copy-ksa.ts` needs no change (XML + shaders are already in `D/../Content`, binaries stripped by design). `C/Core/Meshes/launchpad.glb` is an unreferenced placeholder cube — ignore.
2. Per-piece bounding boxes, the prefab's layer stack (BaseGrass −0.65 < GravelTrim −0.13 < Road −0.14 < Pad 0.69 < PadGrate 1.42 in X) and the 6-instance 12.2 m pipe-support ring are tabulated in `STATIC_ASSET_INVENTORY.md` §3 — the calibration fixture for P1/P4.
3. `C/Sample/` is not a mod template (only `star_import_manifest.toml`). There is no example static-object mod anywhere; Core's launch-pad files + the bundler decomp are the only reference implementation.

### 0.4 Same-as-flexo vs. different (the whole design in one table)

| Concern | flexo (vessel Part) | ICRP (static object) |
|---|---|---|
| Piece template | `<SubPart>` (PartModel+Collider+modules) | `<StaticSubObject>` (PartModel+Collider only) |
| Instance | `<SubPart Id InstanceOf><Transform>` inside `<Part>` | `<SubObject Id InstanceOf><Transform>` inside `<StaticObject>` |
| Data split | `<Part>` + `<PartGameData>` | `<StaticObject>` + `<StaticObjectGameData>` (F10) |
| Transform math | `S·R·T`, XYZ radians, `'ZYX'` in three | identical (F4) — reuse `coords.ts` |
| Frame | KSA ≡ three (Y-up) | **+X up / +Y east / +Z north** — one root basis (D4) |
| Piece library | Core SubParts by `<Mesh Id>` | Core statics **+ Core SubParts + custom** (D6, F12) |
| Extra material slot | none | `<Alpha>` (blend) — new material path |
| Extra model flag | none | `<Terrain>` — ground-look material |
| Colliders | Box/Cyl/Sphere/Capsule (+ConvexHull unmodeled) | same grammar; **hundreds per object** is normal (Core: 150) |
| Scale on colliders | not applied | not applied (F4) — same `colliderWorld` |
| Placement in world | vessel editor | `<Landmark IsLaunchPad StaticObject>` at lat/lon (L4) |
| Export unit | one mod, N Parts | one mod, N StaticObjects + `<System>` scenario (D2) |
| Nesting | none (SubPart flat) | none (F3) — assemblies flatten |
| Units concerns | metres | metres; 100–200 m objects, km-scale sites |

### 0.5 Architecture

```
apps/icrp/
  index.html  vite.config.ts  tsconfig.json  SHARED_IMPORTS.md
  src/
    main.tsx  app.tsx  index.css
    ksa/            pure domain (no react, no three except math carve-outs)
      types.ts                 StaticObjectDoc / PieceRef / Placement / Site / Body / Decal
      staticCatalog.ts         parse Core <StaticSubObject>/<StaticObject>/<StaticObjectGameData>
      pieceCatalog.ts          unify: core-static | core-subpart | custom  → PieceTemplate
      staticXmlSerializer.ts   <StaticSubObject>/<StaticObject>/<StaticObjectGameData>/<PbrMaterial>/<MeshAtlas>
      landmarkXml.ts           <Landmark> / <Modifier Type="Decal"> builders
      systemXml.ts             <System> scenario: inline body clone + LoadFromLibrary (pebkac reuse, §7)
      modPlan.ts               folder layout, mod.toml, preflight
      snapping/                pure geometry: anchors, candidates, resolve (unit-tested)
    state/          nanostores; copies of flexo's shell stores with ICRP unions
      docStore.ts   objectsStore.ts  sitesStore.ts  historyStore.ts  selectionStore.ts
      projectStore.ts projectDb.ts projectCodec.ts  assemblyLibrary.ts  customAssetStore.ts
      modeStore.ts dialogStore.ts hotkeyStore.ts (copied)  snapStore.ts (extended)
    three/          scene
      StaticScene.ts   (one-kind reconciler)  PieceObject.ts  ColliderLayer  FootprintLayer
      GroundPlane.ts   SnapOverlay.ts  GhostObjectsLayer.ts  siteGlobe/ (P7 map)
      basis.ts         KSA static frame → three root matrix (the ONE place)
    ui/             react on src/ui/kit
      shell/  library/  inspector/  sites/  export/  commands/  hotkeys/
```

**The frame change (D4), exactly once** — `apps/icrp/src/three/basis.ts`:

```ts
// KSA static frame: +X up, +Y east, +Z north (right-handed).  three: +Y up, +X east ⇒ north = −Z.
// Proper rotation (det = +1): e_x→(0,1,0), e_y→(1,0,0), e_z→(0,0,−1).
export const KSA_STATIC_TO_THREE = new THREE.Matrix4().set(
  0, 1, 0, 0,   // three.x = ksa.y (east)
  1, 0, 0, 0,   // three.y = ksa.x (up)
  0, 0, -1, 0,  // three.z = −ksa.z (north is −Z in three)
  0, 0, 0, 1,
);
```
The scene root gets `matrix = KSA_STATIC_TO_THREE`, `matrixAutoUpdate = false`. Every piece is a child placed with `applyPlacement` from `F/src/three/coords.ts:30` using raw document numbers. Gizmo read-back uses `readPlacementTransform` (`:36`) on the piece — its parent is the root, so the numbers come back in KSA frame automatically. Raycasts, snapping and ground math are done in **KSA frame** (convert hit points through `root.matrixWorld` inverse) so the pure `ksa/snapping/` code never sees three axes. The camera's "north" indicator points along three −Z.

**Document model** (pure TS, `apps/icrp/src/ksa/types.ts`):

```ts
type PieceSource =
  | { kind: 'core-static'; subObjectId: string }                      // Core <StaticSubObject>
  | { kind: 'core-subpart'; subPartId: string }                       // Core vessel <SubPart> (mesh+material by Id)
  | { kind: 'custom'; customMeshId: string; materialId: string };     // user GLB in this project
interface PieceTemplate { id: string; source: PieceSource; meshId: string; materialId: string;
  terrain: boolean; colliders: PartCollider[]; bbox: Box3Like /*KSA frame*/; anchors: Anchor[] /*editor-only*/ }
interface Placement { instanceId: string; pieceId: string; transform: Transform /*KSA raw*/;
  layerId: string; assemblyId?: string; locked?: boolean }
interface StaticObjectDoc { id: string /*export id*/; name: string; placements: Placement[];
  objectColliders: PartCollider[]; groundOffsetM: number|null; surfaceHeightM: number|null;
  footprintRadiusM: number|null; layers: Layer[]; assemblies: AssemblyInstance[] }
interface Site { id: string; landmarkId: string /*display, e.g. "Meow LC-1"*/; bodyId: string;
  latDeg: number; lonDeg: number; staticObjectId: string|null; decal: DecalSpec|null; isLaunchPad: true }
interface DecalSpec { radiusM: number; terrainHeightM: number /*→ AltitudeOffset Km= (L7)*/;
  smoothFactor: number; rotationDeg: number; biomes: string }
interface BodyOverride { bodyId: string /*Core id, e.g. Earth*/; sourceHash: string /*Core block hash for drift*/ }
interface IcrpProject { schemaVersion: 1; objects: StaticObjectDoc[]; sites: Site[];
  bodies: BodyOverride[]; exportMode: 'system-mod' | 'extend-stock-pad'; modName: string }
```

### 0.6 Vocabulary (use verbatim in code)

| Term | Meaning |
|---|---|
| **piece** | a `PieceTemplate` (= one `<StaticSubObject>` on export) |
| **placement** | one `<SubObject>` instance in an object |
| **object** | one `<StaticObject>` (+ its GameData) |
| **assembly** | an editor-only named group of placements with a local origin; instantiable, flattened on export |
| **anchor** | an editor-only snap point (position + facing in piece frame) |
| **site** | one `<Landmark IsLaunchPad="true">` (+ optional decal) on a body |
| **body override** | an inline copy of a Core body in the exported `<System>` |
| **ground** | the KSA plane X = 0 of the assembly frame (terrain sample at the landmark) |
| **up / east / north** | KSA +X / +Y / +Z |

### 0.7 Invariants (cite in code comments where load-bearing)

- **I1** The document never contains three.js axes; all numbers are KSA-frame metres/radians. Only `basis.ts` knows the frame change.
- **I2** Every exported `<Mesh Id>` equals the glTF mesh name; every `PartModel Id`, `StaticSubObject Id`, `StaticObject Id`, `PbrMaterial Id` is unique across the whole mod **and** must not collide with Core ids (first-wins) unless collision is the intent (extend-stock-pad mode targets a Core id on purpose).
- **I3** Colliders are exported with placement Position/Rotation only; a placement with non-unit scale and colliders is a preflight warning ("colliders will not scale", F4).
- **I4** An object with zero colliders is a preflight warning ("vessels will fall through", F9); `SurfaceHeight` must be within the top of the colliders' AABB ± tolerance or warn (spawn would float/clip).
- **I5** Every site must reference an object that exists in the project or in Core; a body may hold at most 4 sites that rely on clutter exclusion (F8) — warn beyond 4.
- **I6** Undo: discrete mutators call `pushUndo` themselves; streaming gestures push once at start (`F/docs/editor-state.md` §"two patterns").
- **I7** Persisted data is version-gated and default-filled, never migrated (D3).
- **I8** Export output must be byte-comparable to Core's shape: same element order, `formatG6` numbers, omit-at-identity transforms, `Collider1` container ids, bundler banner comment.

### 0.8 Protocol for coding agents

1. Read the corpus in the header, then `F/AGENTS.md`, `F/docs/architecture.md`, `F/docs/ui-shell.md`, `F/docs/editor-state.md`, `F/docs/wiki-part-preview.md` §"Adding another mini app".
2. Work phase by phase; each task lists files, the flexo source to harvest, and its test. Do not skip tests.
3. Any change to what ICRP reads/writes of KSA ⇒ update `scope/static-objects.md` / `scope/launch-sites.md` + `scope/FULL_SCOPE.md` row in the same commit (D3).
4. Run `pnpm fmt`, `pnpm lint`, `pnpm fmt:check`, `pnpm typecheck`, `pnpm test` (bare) before every commit; `pnpm build` must build both mini apps.
5. In-game verification tasks are marked **[V]**; they cannot be done by a coding agent — leave a note in `apps/icrp/VERIFICATION.md` with the exact mod to drop into `<Documents>/mods/` and what to look for.
6. Keep `apps/icrp/SHARED_IMPORTS.md` current (D1).

### 0.9a Implementation status (2026-08-24)

Shipped on `feature/icrp` (apps/icrp builds, 38 vitest tests + 7-step `pnpm smoke:icrp`
all green; browser-verified renders/exports):

| Phase | Status |
|---|---|
| P0 | ✅ assets synced (run locally against `ksa-linux/Content` — same build as Windows), fixtures + drift test, scaffold + build/deploy wiring |
| P1 | ✅ domain (catalog/serializer byte-golden vs Core, basis + calibration tests) |
| P2 | ✅ viewer (three buckets incl. Alpha `.r` patch + Terrain stand-in, selection, gizmo, ground/compass, ghosts of inactive objects) |
| P3 | ✅ state (whole-project snapshot undo, N objects + switcher, IndexedDB autosave + hydration; **archives/share-links deferred**) |
| P4 | ✅ ground ops (drop/rest), align/distribute, linear/radial/grid arrays, footprint/clutter/300 m/spawn overlays, gizmo grid+angle snap + ground lock; **anchors + drag-time snap markers + assemblies deferred** |
| P5 | ✅ vessel SubParts as pieces (id-reference export, F12); **custom GLB import deferred** (flexo pipeline modules identified in §P5.02) |
| P6 | ✅ metres inspector + auto-compute + preflight validation |
| P7 | ✅ sites (panel, corpus body picker, decal with metres-in-`Km=`), systemXml (subagent, live-tree goldens) — **discovery: the stock `SolSystem.xml` is NOT a pure LoadFromLibrary list; it inlines ~45 bodies with 21 Id'd `Path=`s, so the texture rules run over every inline body (105 id-refs + 3 `../Core/` rewrites live-counted)**; `HomeBody` rides the row attributes onto the inline element |
| P8 | ✅ zip export + preflight + previews + extend-stock-pad mode; **mods-folder direct write deferred** ([V] runbook in `apps/icrp/VERIFICATION.md`) |
| P9 | ✅ scope docs (static-objects/launch-sites + FULL_SCOPE rows + checklist step), app docs, smoke test; **menubar/⌘K palette/hotkey registry/phone layout deferred** (plain toolbar + ad-hoc hotkeys shipped) |

In-game checks [V1]–[V6] remain open (require a human with the game).

### 0.9 Phase map

| Phase | Deliverable | Depends on |
|---|---|---|
| P0 | Assets reachable, `apps/icrp` scaffold builds & deploys an empty shell | — |
| P1 | Domain: types, catalogs (Core statics + Core SubParts), XML serializer, frame basis, Core pad round-trip test | P0 |
| P2 | Viewer: Core pad renders correctly (all three buckets), selection, gizmo, camera, layers | P1 |
| P3 | Editor state: document store, undo, N objects, project persistence/archives/share | P2 |
| P4 | Placement & snapping: ground lock, stacking, anchors, grid/angle, arrays, assemblies, footprint overlays | P3 |
| P5 | Piece library UI + custom GLB import (bundler conventions) + collider editing | P3 |
| P6 | Object data: the three metres with auto-compute; validation | P3 |
| P7 | Sites & system mod: bodies, sites, decals, `<System>` export (pebkac reuse) | P1, P6 |
| P8 | Mod export: XML/GLB/KTX2/mod.toml, folder/zip, preflight, extend-stock-pad mode, **[V]** in-game runbook | P5, P6, P7 |
| P9 | Shell polish, hotkeys, palette, docs, scope catalog, smoke test, deploy | all |

---

## Phase 0 — Assets and scaffold

### P0.01 — Widen the private-asset copy to static objects
- `A/copy-assets.ts:98`: `const hasParts = /<(Part|SubPart|StaticObject|StaticSubObject|StaticObjectGameData)[\s>]/.test(text)`. Add `Textures/Planets/_Decals` to `COPY_DIRS` (the `circle.dds` decal height map is referenced from `Astronomicals.xml`, which the scan never reads; ICRP's site map wants it for the footprint disc — optional).
- The script is legacy Bun and runs on the Windows box against the game install; re-run it there, then `A/tools/reencode-textures-uastc.py` (handles BC4/BC5/BC7; verify the `_Alpha` output is a single-channel UASTC and loads in `KTX2Loader` as `RedFormat` — if the loader expands it to RGBA, note it and sample `.r`).
- Commit to `flexo-private-assets`; the deploy workflow's checkout picks it up.
- **Fallback while waiting**: `vite/ksaAssets.ts` mirrors `KSA_ASSETS_DIR`; pointing `.env` at `C/` directly works on a dev box that has the full install (that is what `/Users/asherwin/repos/meow-sci/ksa-linux/Content` is).

### P0.02 — Vendored fixtures + drift test
- Copy `C/Core/CoreLaunchPad{A,B,C}Assets.xml`, `CoreLaunchPadAGameData.xml` byte-identical into `F/src/ksa/__fixtures__/` (they are shared with flexo's fixture set; update `src/ksa/__fixtures__/README.md`). Extend the existing drift test to cover them.
- Extract `C/Core/Astronomicals.xml:1869-1888` (the five landmarks) and the five `LaunchSite_*` decal modifiers (`:734-818`) into `apps/icrp/src/ksa/__fixtures__/earth-launch-sites.xml` for parser tests (P7).

### P0.03 — `apps/icrp` scaffold
- Follow `F/docs/wiki-part-preview.md` §"Adding another mini app" and mirror `F/apps/partpreview/vite.config.ts` (`base: '/flexo/apps/icrp/'`, `envDir: repoRoot`, `define VITE_ASSET_BASE = '/flexo/'` on build, `outDir: dist/apps/icrp`, `ksaAssets()` only in dev, no duplicate asset tree).
- `F/package.json:9` `build` → `tsc -b && vite build && vite build apps/partpreview && vite build apps/icrp`; add `dev:icrp`. `F/tsconfig.json` project reference. `.oxlintrc.json`/`.oxfmtrc.json` need no change (they are repo-wide); add `apps/icrp/src` to the Tailwind `@source` list in ICRP's own `index.css` (copy `F/src/index.css` header; `source(none)` + explicit `@source` — auto-detection breaks on docs prose).
- Deploy: `.github/workflows/deploy.yml` already publishes `dist/`; confirm `dist/apps/icrp/` is included (it copies the whole `dist`).
- `apps/icrp/SHARED_IMPORTS.md` created (D1).
- Test: `pnpm build` produces `dist/apps/icrp/index.html`; `pnpm dev:icrp` serves `/flexo/apps/icrp/`.

### P0.04 — Copy the shell stores (D1)
Copy into `apps/icrp/src/state/` with ICRP unions: `F/src/state/modeStore.ts` (Modes: `layout | colliders | sites | export`; Tools: `select | move | rotate | scale | place | measure`), `dialogStore.ts` (own `DialogId`), `hotkeyStore.ts` (own scopes), `F/src/ui/hotkeys/registry.ts` (table rewritten in P9, machinery kept `:94-120, :1004-1044`). Import as-is: `commandStore`, `layoutStore`, `statusStore`, `notificationStore`, `modifierStore`, `snapStore` (extended in P4), `layerStore`, `ids`, `tarArchive`, `assetDb`, `projectIndexStore` (rename the `flexo:` keys to `icrp:` — the constants are parameters, verify at `projectIndexStore.ts`), `F/src/ui/kit/**`, `F/src/ui/toast.ts`, `F/src/ui/palette/CommandPalette.tsx`, `fuzzyMatch.ts`, `escLadder.ts`, `typingGuard.ts`, `keys.ts`, `numberDraft`/`NumberField`/`Vec3Field`.
- Test: the existing store tests run against the copies (copy the `*.test.ts` too, retarget imports).

---

## Phase 1 — Domain layer

### P1.01 — Types (`apps/icrp/src/ksa/types.ts`)
Harvest from `F/src/ksa/types.ts`: `Vec3`, `EulerXYZ`, `Transform`, `ColliderShape`/`PartCollider` (`:127-183`, "scale IS size in metres"), `Layer`, `RawXmlNode` (`:1235`). Add the §0.5 document types. Add `ConvexHull` to `ColliderShape` (`D/KSA/ConvexHullColliderTemplate.cs:17-40`: `<Mesh Id>` + `<Scale>`; centroid `ShapeOffsetCollider` is computed by the game).

### P1.02 — Core static catalog (`staticCatalog.ts`)
- Reuse `F/src/ksa/catalog.ts:116` `fetchXmlFile`, `:95` `toUrl`, and the file-discovery of `loadCoreCatalog` (`:257`). Parse every `<Assets>` file for `<MeshAtlas>`, `<PbrMaterial>` (add `alphaUrl`), `<StaticSubObject>` (PartModel: meshId/materialId/`terrain`; colliders via `F/src/ksa/partXmlParser.ts:202` `collidersFromElement`), `<StaticObject>` (placements via `placementsFromPartElement` `:95` retagged to `SubObject`, drop `layerId`; own colliders; the three distances via `readDistanceM` `:1087`), `<StaticObjectGameData>` (same shape; merge per F10 into a `CatalogStaticObject`).
- Build-time manifest like `F/vite/previewManifest.ts` is optional; runtime parse of ~4 files is fine.
- Test: fixtures → `CoreLaunchPadA_Prefab_LaunchPadA` has 16 placements, 10 distinct pieces, merged metres `0.2/1.5537/108.3`; `CoreLaunchPadC_Subpart_BaseGrassA.terrain === true`; `CoreLaunchPadB_Material.alphaUrl` set; `CoreLaunchPadA_Subpart_FootpathA.colliders.length === 49`.

### P1.03 — Vessel SubParts as pieces (`pieceCatalog.ts`)
- Import flexo's `parseAssetsFile` (`F/src/ksa/catalog.ts:160`) result (`CatalogSubPart`: meshId, materialId, atlas URL, colliders) and map each to a `PieceTemplate{source:'core-subpart'}`. Exclude SubParts whose PartModel has no `<Mesh>` (IVA-only etc.) and those with `Internal` true (cosmetic filter; the game ignores `Internal` for statics, F6).
- On export (P8) each used one becomes `<StaticSubObject Id="icrp_<mod>_<SubPartId>"><PartModel Id="icrp_<mod>_<SubPartId>_Model"><Mesh Id="<core mesh>"/><Material Id="<core material>"/></PartModel><Collider Id="Collider1">…SubPart's colliders…</Collider></StaticSubObject>` — no binaries (F12). **[V1]** verify in-game once (P8.09).
- Test: `CoreFuelTankA_Subpart_StructureMP1W1HA` maps with its Core cylinder collider (`F/src/ksa/__fixtures__/CoreFuelTankAGameData.xml:7-12`).

### P1.04 — XML serializer (`staticXmlSerializer.ts`)
Harvest from `F/src/ksa/partXmlSerializer.ts`: `prettyXml` (`:1168`), `buildTransformElement/buildVectorElement/buildRotationElement` (`:1125-1159`, omit-at-identity, EPSILON 1e-9), `buildColliderElement` + `buildVec3Attrs` (`:461-492`), `buildDistanceElement` (`:686`, always `M=`), RawXmlNode emitters (`:558-578`); `F/src/ksa/formatG6.ts`. From `F/src/ksa/assetsXmlSerializer.ts`: `claimId` (`:154`), `<MeshAtlas>`/`<PbrMaterial>` emission (add `<Alpha>`), **drop `<MeshView>`** (`:250-254, :307-311`).
Emit, in Core order: `<MeshAtlas>`, `<PbrMaterial>`s, `<StaticSubObject>`s, `<StaticObject>`s (SubObject list, then object colliders, then the three **empty** distance elements exactly like the bundler, F13), and a separate GameData document with `<StaticObjectGameData Id>` carrying only the set distances (F10 split). Banner comment from F13 on the Assets file.
- Test: round-trip the Core pad fixture: parse → serialize → parse equals; and a golden-string test that the serialized Core prefab's `<SubObject>` block equals `C/Core/CoreLaunchPadAAssets.xml:1120-1214` modulo whitespace (proves I8).

### P1.05 — Frame basis + calibration (`three/basis.ts`)
- The matrix in §0.5; `toKsa(pointThree)`/`toThree(pointKsa)` helpers; unit test that `KSA_STATIC_TO_THREE` is a proper rotation and maps (1,0,0)→(0,1,0), (0,1,0)→(1,0,0), (0,0,1)→(0,0,−1).
- Calibration test (replaces `F/src/three/debugCalibration.ts`): load the Core pad under the root basis; assert in three space the PadGrateA instance's world bbox top ≈ +1.57 (Y-up) and that `CrawlerRampA` (Rotation X=−π/2 at Z=32.69) extends toward three −Z (north). Rendering check in P2.

---

## Phase 2 — Viewer / workspace

### P2.01 — Scene skeleton (`StaticScene.ts`)
Harvest from `F/src/three/EditorScene.ts`: the one-kind `reconcile` algorithm (`:902-974`: wanted-set diff, template-identity guard, async landing re-check), the `sub()` invalidate-after-callback discipline (`:888`), `attachGizmo` (`:2309`) + drag-start `pushUndo` (`:505-534`), Escape = `controls.reset()` streaming restore (`:869`), marquee (`:2866`), `captureThumbnail` (`:1867`). Target ≈400 lines. Root node = basis (P1.05). AS-IS: `RenderLoop`, `SelectionManager`, `TransformGizmo`, `cameraFraming`, `marqueeSelect`, `layerOpacity`, `AxisGizmo`, `SceneEnvironment`, `envCache`, `highlightSettings`.

### P2.02 — Piece object (`PieceObject.ts`)
From `F/src/three/SubPartObject.ts` minus `customAssetStore` (custom pieces get geometry from ICRP's own store). Geometry via `MeshAtlasCache.getSubPartGeometry` for core-static and core-subpart (both are atlases); materials via `F/src/three/MaterialFactory.ts:206-262` shared half **plus**:
- **Alpha**: `alphaMap = alphaTex` (R channel), `transparent = true`, `depthWrite = false`, `alphaTest = 0` (F7 is a blend, not cutout). Draw order: after opaque (`renderOrder = 1`).
- **Terrain**: ignore atlas textures; `MeshStandardMaterial` with a flat ground colour (default Earth-grass `#5d6b3a`, user-tunable in view settings), roughness 1, metalness 0. Note in the inspector that the game samples the biome textures (F7).
- `normalMapPatch.ts` applies (RG derivative normals, same channel packing as `MeshIndirect.frag`; `StaticObject.frag:283-294` uses the same `getNormalFromMap_ShaderX`).
- Test: PadGrateA renders with the atlas; GravelTrimA is transparent at its edges; BaseGrassA is flat green.

### P2.03 — Camera, ground, lighting, scale
- `F/src/three/Viewport.ts` with seat-view removed (`:71-78, 259-384`); `near 0.05 / far 5000`; orbit target defaults to the object's footprint centre; frame-all on load. `Grid.ts` replaced by `GroundPlane.ts`: a KSA X=0 plane (three Y=0) with a 1 m/10 m/100 m grid that fades with distance, a **north arrow** (three −Z) and **east arrow** (+X) at the origin, and an optional flat disc of `FootprintRadius` (P4.08).
- Sun: a directional light with elevation/azimuth in view settings (statics are lit by the sun only, plus IBL from `SceneEnvironment`).
- Compass/`AxisGizmo` labelled **U/E/N** rather than X/Y/Z (the user thinks in KSA axes; the inspector shows KSA numbers).

### P2.04 — Selection, gizmo, layers, ghosts
- Selection is single-kind (`string[]` of placement ids); collapse flexo's six-way `switch(kind)` (`F/src/state/editorStore.ts:117-296`).
- Gizmo: `TransformGizmo` with the P4 constraints. Layers: `F/src/state/layerStore.ts` + `F/docs/layers.md` AS-IS.
- Ghosts: `F/src/three/GhostPartsLayer.ts` + `ghostPlan.ts` → `GhostObjectsLayer` for the *other* objects in the project (D7, offset + opacity, non-pickable).
- Colliders: `F/src/three/ColliderObject.ts`, `wireShapes.ts` AS-IS; render with `InstancedMesh` per shape type when count > 64 (Core pad has 150; per-node objects are too slow for marquee/hover).

---

## Phase 3 — Editor state and persistence

### P3.01 — Document store + undo
- `docStore.ts`: `$doc: StaticObjectDoc` for the active object; mutators (`addPlacement`, `movePlacements`, `setPlacementTransform`, `duplicate`, `remove`, `setLayer`, `setObjectMeters`, collider ops) each enrolled in undo (I6). History from `F/src/state/editorStore.ts:465-739` genericised as `HistoryEntry<StaticObjectDoc>` (`structuredClone`, `MAX_UNDO 50`, `exportHistory/importHistory`, `$historyList`).
- Test per mutator (flexo's `editorStore.test.ts` pattern).

### P3.02 — N objects per project (`objectsStore.ts`)
Port `F/src/state/partsStore.ts` (registry, park/hydrate, `switchPart` choreography, invariants I1–I3 there) renamed to objects; ghosts read parked docs. Object CRUD, rename, duplicate (fresh ids), `includeInExport`.

### P3.03 — Project persistence
`projectDb.ts` generic over the doc (`F/src/state/projectDb.ts:36-38` names → `icrp-projects`, `icrp-assets`, `icrp-fs`); `projectStore.ts` with injected serialize/normalize/apply (`F/src/state/projectStore.ts` two-debounce autosave `:457`, `$autosaveHealth`, boot ladder `hydrateProjectOnBoot :709`, `PROJECT_SCHEMA_VERSION` purge). `projectCodec.ts` rewritten for `IcrpProject` (`ICRP_PROJECT_EXPORT_VERSION = 1`, exact-match import). `projectArchive.ts` (`.icrp.tar.gz`, `manifest.json` first) and `projectShareLink.ts` (`?load=` zstd→base64) adapted. `assetDb.ts` AS-IS for custom GLB/KTX2 blobs.
- Test: save/load round-trip; purge on version mismatch; archive import of a project with a custom piece.

### P3.04 — Assembly library (`assemblyLibrary.ts`)
Project-independent IndexedDB store of named assemblies: `{ id, name, pieces: PieceRef[], placements (relative to assembly origin), anchors, thumbnail }`. Instantiating copies placements into the doc with a shared `assemblyId` (so "select assembly" works) — the document stays flat (D6). Export/import as JSON. Custom pieces referenced by an assembly are copied into the target project on instantiate.

---

## Phase 4 — Placement and snapping (the new work)

All snapping math is pure (`apps/icrp/src/ksa/snapping/`), operates in KSA frame, and is unit-tested against the Core pad's bounding-box table (`STATIC_ASSET_INVENTORY.md` §3). The scene only supplies candidate geometry and draws the overlay.

### P4.01 — Ground lock and elevation
- Default translate is constrained to the ground plane (KSA Y/Z; three X/Z axes of `TransformControls`); **Up (X)** is edited by a separate elevation handle and the inspector field. Toggle `G` (ground lock). Rotation defaults to **about up** with angle snap; `⌥` unlocks full 3-axis rotate (needed for ramps/pipes: Core uses X=±π/2 rotations).
- **Drop to ground** (`⌘↓`): sets the placement's up so its world AABB bottom = 0. **Rest on top** (`⌘⇧↓`): raycast down from the piece's footprint sample points onto other pieces (KSA −X direction), set up so the bottom rests on the highest hit. Uses `F/src/three/samplePoints.ts` for the sample set.

### P4.02 — Snap targets and resolution
`snapStore` extended: `{ grid: 0.1|0.5|1|5|10 m, angle: 5|15|45|90°, targets: { grid, anchors, vertices, bboxCorners, bboxFaces, centers }, tolerancePx }`. Resolve order per drag frame: anchor→anchor (with rotation alignment, P4.03) > bbox corner/face > vertex > center > grid. Show the winning candidate as a marker + ghost preview; `⌃` inverts snapping (flexo convention). Vertex candidates come from a per-piece decimated point cloud (≤ 2 k points, built once per template) — never from raw geometry per frame.

### P4.03 — Anchors
- Auto-anchors per piece: bbox face centres (6), bbox bottom corners (4), the origin; facing = outward face normal. Authored anchors: in the inspector, click a point on the piece (raycast in KSA frame) and name it, with a facing axis; stored on the template (custom pieces) or as a project-level override for Core pieces (editor-only; **never exported** — KSA has no such concept).
- Anchor-to-anchor snap aligns the moving piece so its anchor coincides and its facing is antiparallel to the target's (rotation about up only unless `⌥`).
- Test: two `RoadCircularA` halves? (no — use `FootpathStepA` to `FootpathA` end: assert resulting Position within 1 mm and Rotation about up in multiples of the angle snap).

### P4.04 — Align / distribute / mirror
Commands over the selection: align (min/centre/max on E, N, U), distribute evenly along E/N, mirror across the E or N axis through the selection centre (mirror = rotation π about up for symmetric pieces; for asymmetric pieces it is a warning — KSA has no negative scale for colliders, I3).

### P4.05 — Arrays (chains)
Port `F/ui/chain/*` + `F/src/state/chainStore.ts` + `chainMath.ts` (`F/docs/action-chains.md`): linear (count, delta), radial about **up** (count, radius, start angle — the Core pipe-support ring is 6 on r≈12.2 m with per-instance rotation, `STATIC_ASSET_INVENTORY.md` §3), grid (rows × cols). Non-modal window, seeds frozen at open, one undo step.

### P4.06 — Assemblies in the editor
Group selection → assembly (local origin = lowest-bbox-centre by default, editable); ungroup; save to library (P3.04); instantiate from library at the cursor with ground lock; assembly-level anchors (its bbox faces). Selection UI: click selects piece, double-click selects the whole assembly.

### P4.07 — Measurement
`F/src/three/MeasurementLayer.ts` + `measure/format.ts` in metres with km above 1 000 m.

### P4.08 — Footprint and site overlays (drawn from the object's metres, P6)
- `FootprintRadius` disc at ground; **clutter-exclusion ring** at `FootprintRadius + 50 m` (F8); **collider pick radius** ring at 300 m (F9) with the note that a vessel farther than this from the landmark gets no pad collision; `SurfaceHeight` as a translucent plane at up = `GroundOffset + SurfaceHeight` (where a vessel spawns, L6); origin marker at up = `GroundOffset` (the whole object is lifted by it).
- Test: overlay radii read from the store; snapshot test of the layer's object tree.

---

## Phase 5 — Piece library, custom pieces, colliders

### P5.01 — Library panel
Three tabs (Core statics / Vessel parts / Custom + Assemblies), fuzzy search, thumbnails from `F/src/three/SubPartPreviewViewport.ts` (AS-IS) via an idle queue (`F/src/three/assetThumbs.ts` pattern), size badge (bbox E×N×U), collider count, `Terrain`/`Alpha` badges. Drag onto the viewport → place with ground lock and snapping active from the first frame (`place` tool).

### P5.02 — Custom GLB import
Port the flexo Blender→GLB path: `F/src/ksa/importNormalize.ts`, `importMaterials`, `importPlan`, `F/src/three/loadModelFile.ts`, `F/src/three/primitives.ts` (box/cylinder/plane pieces — roads, slabs, walls), `F/src/ktx/encodeKtx2.ts` (UNORM + linear tag; never `_SRGB`), the three gotchas in `F/docs/custom-assets.md` (mesh names from nodes, mandatory Diffuse+Normal+AoRoughMetal with 1×1 solids, no TANGENT). Recognise the **bundler conventions** on import (F13): `_ColPrim_*` children → colliders, `_Terrain*` child → terrain flag, `_VM` ignored, and a `_Prefab` GLB → an object with placements (so a Blender-authored complex can be imported whole). Author frame: the GLB must be **X-up**; offer a one-click "Y-up → X-up" pre-rotation for Blender exports (applied to geometry, not to placements).
- Alpha slot: optional greyscale image → single-channel KTX2 (BC4-equivalent UASTC via `encodeKtx2` R8 path — add if missing) → `<Alpha Path>`.
- `customAssetStore` rewritten from `F/src/state/customAssetStore.ts` harvesting ~40% (blob keys `pa:<project>:<kind>:<id>` in `assetDb`).

### P5.03 — Collider editing
`F/src/ui/build/ColliderInspector.tsx` adapted: owner = the piece (exported inside its `<StaticSubObject>`) or the object (exported at `<StaticObject>` level, like Core's prefab-level `Collider1`). Reuse `colliderSize.ts`, `colliderFit.ts` (auto-fit box/cylinder to a piece), `measure/colliderCoverage.ts`, `colliderValidation.ts` with tank/docking rules removed and the >32 warning replaced by >512 (Core ships 150). Add `ConvexHull` (P1.01) — for custom pieces only (needs a mesh in our atlas); Core pieces already carry their colliders.

---

## Phase 6 — Object data (the three metres)

### P6.01 — Metres inspector
Fields `GroundOffset`, `SurfaceHeight`, `FootprintRadius` (all `useNumberDraft`, nullable = "unset → 0 in game"). **Auto-compute** buttons: `SurfaceHeight` = top of the colliders' AABB nearest the origin column (Core: PadGrateA top 1.57 ≈ 1.5537), `FootprintRadius` = max horizontal extent of all placements' bboxes (Core 108.3 vs BaseGrass half-diagonal ≈ 116 — Core chose the disc that covers the visible pad, so show both and let the user pick), `GroundOffset` default 0.2 (Core).

### P6.02 — Validation (feeds P8 preflight)
I3/I4/I5 checks, plus: placement outside 300 m of origin (no collision, F9), Terrain pieces below ground (fine — Core's BaseGrass is −0.31..−0.16) vs. non-terrain pieces entirely below ground (warn), duplicate piece ids across custom and Core (I2), an object with no placements.

---

## Phase 7 — Launch sites and the system mod

*This phase reuses pebkac; the exact modules and their citations are in [analysis/icrp/PEBKAC_SYSTEM_MODS.md](../analysis/icrp/PEBKAC_SYSTEM_MODS.md) — see §7.0 below (filled from that report).*

### P7.00 — pebkac reuse contract (what §7 copies, and what it deliberately does differently)

pebkac (`P/`, Astro 5 + React 19, `meow.science.fail/pebkac/`) turns a CSV of orbital elements into one `<System>` mod. Its Core snapshot is **v2026.3.3.3759** (`P/src/pages/index.astro:252`) — five builds stale, pre-dating launch pads — so ICRP takes its *patterns*, never its data. It has **no** landmark, decal or lat/lon code at all (`PEBKAC_SYSTEM_MODS.md` §2). Modules are framework-free browser-DOM code but not importable across repos (no `exports`, extension-less imports, Astro tsconfig) — **copy ~200 lines into `apps/icrp/src/ksa/system/`, restyled to flexo conventions.**

| Copy (as pattern) | From | ICRP change |
|---|---|---|
| Find a Core body by Id in ordered corpora (`SolSystem.xml`, `Astronomicals.xml`), first hit wins | `P/src/ts/builder/generateSystemXmlRedux.ts:23-64`, `P/src/state/builder-state.ts:19-30` | Corpora come from the `/ksa/` mirror at runtime, not `?raw` bundles; no `xpath` dep — `getElementsByTagName` + `Id` attribute match. |
| Clone the Core element and inline it inside `<System>`; `<LoadFromLibrary Id Parent>` for every untouched body; `<DisplayName Value=…>` | `generateSystemXmlRedux.ts:89-167` | Use the **`doc.importNode(el, true)` result** and mutate the clone — pebkac mutates the corpus element in place, which breaks repeated export. `LoadFromLibrary` list mirrors the *current* `C/Core/SolSystem.xml` body list at export time (bodies get added/renamed across builds). |
| Starting vehicles: `<LoadVehicleFromLibrary Id>` + `<SituationRef InstanceOf="{Id}StartingSituation">` | `generateSystemXmlRedux.ts:113-125` | Copy from Core's system verbatim. |
| Generic "upsert child element" helper | `P/src/ts/transform/transformSystemEntryToKsaXml.ts:105-125` | Drop its literal `"\n    "` text nodes; pretty-print at the end with flexo's `prettyXml`. |
| Serialize/prettify (`XMLSerializer` + utf-8 preamble) | `P/src/ts/xml/{prettifyDocument,serializeDocument,collapseXmlDeadspace}.ts` | Use flexo's `F/src/ksa/partXmlSerializer.ts:1168` `prettyXml` instead. |
| `mod.toml`/`README.txt`/`manifest.toml` templates, "mod id == folder name == zip root" | `P/src/ts/zip/ZipDownloadService.ts:24-109` | Extend `mod.toml` with `assets=[…]` (flexo's `serializeModToml` already does `assets`; add `systems`). flexo's zip/tar plumbing instead of jszip. |

**Texture/mesh references inside the cloned body — the one place pebkac's approach is wrong for ICRP.** pebkac re-roots every `Path=` with `../Core/` (`P/src/ts/xml/fixPathsToCore.ts:12-47`), which only resolves when the mod folder is a **sibling of `Content/Core/`**; an ICRP mod installed in `<Documents>/mods/<id>/` (L9) would `Path.Combine` to a non-existent `Documents/mods/Core/…`. Verified rule (`D/KSA/FileReference.cs:42-49`): an element with an `Id` and an **empty `Path`** is a *reference* (`_isReference = string.IsNullOrEmpty(LocalPath)`) resolved through the global registry (`Get()` → `ModLibrary.Get<…>(Id)`); Core registers all of Earth's Id'd textures first. Earth's block has 86 `Path=` elements, **83 with an `Id`** and **3 anonymous** (`<WindTexture Path="Textures/Earth_Ocean_Wind.png">`, `<ColorTexture Path="Textures/Earth_Ocean_Color_4096.ktx2">`, the cloud `<Texture Path="Textures/Clouds/Compressed/CirroStratusDetail.dds">`; an anonymous file element gets `Id = ModPath`, `FileReference.cs:42-44`, so it can never be shared by Id). Therefore `systemXml.ts`:
1. strips `Path=` from every element that has an `Id` (pure reference, no file, install-location independent — the cartoon-moon approach, `F/scripts/build-cartoon-moon.ts:580-585`);
2. for the anonymous three, writes `Path="../Core/<path>"` **and** the export dialog states the mod must be installed as `Content/<mod>/` (next to Core) — *or*, if the user picks "Documents/mods" as the target, writes the absolute install path the user supplied (absolute paths survive `Path.Combine`, `F/docs/custom-assets.md` sandbox note). **[V5]** verify both: (a) Id-only references load Earth textures from an inline body, (b) `../Core/` resolves from `Content/<mod>/`. If (a) fails, fall back to `../Core/` on everything and require the `Content/` install.
- `HomeBody`: Core marks the home body on the `LoadFromLibrary` line of `SolSystem.xml` (check `C/Core/SolSystem.xml:36-43` at implementation time); for an inline Earth, carry the same attribute on the inline element if `D/KSA/SystemTemplate.cs` / `SystemInfo.cs` read it there — **[V6]** confirm the game still spawns at Earth in the ICRP system; if not, keep Earth as `LoadFromLibrary` and inline *only* the bodies with new sites (Earth sites would then need the extend-stock-pad mode, L3).
- pebkac's `Texture`-prefixed-Id rewrite rule is **not** carried over (it was a path hack).
- Baseline discipline pebkac lacks: ICRP stamps the Core body hash (P7.01), and `upgrade-ksa` re-diffs the Earth block (P9.03).

### P7.01 — Body model and Core body source
- `bodiesStore`: the list of Core bodies with `Locations.Count > 0` semantics irrelevant — any body can host a site once we inline it. Source of the body block: the Core `Astronomicals.xml` served through the `/ksa/` mirror (P0.01 adds it to the copy or read it from `C/` in dev). Parse with `DOMParser`; keep the body element as a raw DOM subtree (RawXmlNode passthrough, `F/src/ksa/partXmlParser.ts:976-1042`) so **every** unmodeled child survives verbatim; ICRP only *adds* `<Landmark>`s and `<Modifier Type="Decal">`s.
- Store a hash of the Core body block per override (`BodyOverride.sourceHash`) and warn at export/boot when Core's block changed since the project last exported (game-update drift; the mod's Earth is now stale — re-export regenerates it from the current Core block, nothing to migrate).

### P7.02 — Sites store and inspector
`Site` CRUD; lat/lon fields in degrees (`useNumberDraft`, 6+ decimals), body picker, object picker (project objects + Core `CoreLaunchPadA_Prefab_LaunchPadA`), `IsLaunchPad` always true (L11), display id validation (unique per body; Core uses spaces and non-ASCII, e.g. `Māhia LC-1A`, fine). Warn beyond 4 launch-pad sites per body relying on clutter clearance (F8). A "heading" field does not exist (L4) — show the fixed east/north orientation and offer "rotate the object about up by θ" as the way to face a complex differently (it rewrites the object's placements, one undo step).

### P7.03 — Decal spec
Per site: `radiusM` (default = object `FootprintRadius` × 2.5, Core uses 250–400 for a 108 m pad), `terrainHeightM` (**user must enter the local terrain height in metres** — the game has no API we can call from the browser; the site inspector explains how to read it in-game: hover the location in the map/`Celestial.GetTerrainHeightFromDirCcf`; Core's five values are in the fixture as examples), `smoothFactor 0.69`, `rotationDeg 0`, `biomes "Grass,Beach"`, height map `Circle` by Core Id (L7). Emit exactly Core's element set in Core's order (`C/Core/Astronomicals.xml:752-768` as the golden example).

### P7.04 — Site map
A simple equirectangular map per body using the body's colour cubemap is *not* available cheaply (cubemaps are DDS in `Textures/Planets/`); v1 draws a 2-D lat/lon canvas with a coastline-free graticule, existing Core landmarks/cities (parsed from the body block) as labelled dots, and ICRP sites as draggable markers. Click on the map sets lat/lon. (A 3-D globe with the Core colour map is a P10+ idea.)

### P7.05 — `<System>` scenario writer (`systemXml.ts`)
- Output `systems/<mod>_system.xml`: `<System Id="<mod>_sol" …>` cloned from Core's `SolSystem.xml` header (GalacticPlane, etc. — pebkac's writer), then for each Core body: inline copy if it has ICRP sites or overrides, else `<LoadFromLibrary Id Parent>`. Inline Earth = Core block + `<Landmark Id IsLaunchPad="true" StaticObject="…"><Latitude Degrees/><Longitude Degrees/></Landmark>` per site appended after the existing landmarks, + decal modifiers appended into `<Terrain><ProceduralModifiers>` with `Order 9999` like Core's.
- Keep Core's five stock landmarks (the player still wants LC-39A); allow the user to **retarget** a stock site to an ICRP object (edit its `StaticObject=` in the copy) — that is legal inside our own inline Earth (L2) and is the answer to "which complex to use at a launch site".
- Vehicles/situations: `<LoadVehicleFromLibrary>` entries copied from Core's system so starting vehicles still appear (`D/KSA/SystemTemplate.cs:17`).
- Test: golden test — with zero sites the writer reproduces Core's `SolSystem.xml` body list as `LoadFromLibrary`s; with one Earth site the inline Earth block equals Core's block plus exactly the added elements (DOM diff).

---

## Phase 8 — Mod export

### P8.01 — Mod plan (`modPlan.ts`)
Layout:
```
<modName>/
  mod.toml                     name, assets=[ "<Mod>Assets.xml", "<Mod>GameData.xml" ], systems=[ "systems/<mod>_system.xml" ]
  <Mod>Assets.xml              MeshAtlas (custom only) + PbrMaterials (custom only) + StaticSubObjects (custom + vessel-derived) + StaticObjects
  <Mod>GameData.xml            StaticObjectGameData per object (the three metres)
  systems/<mod>_system.xml     P7.05
  Meshes/<Mod>_MeshAtlas.glb   custom pieces only (no _VM), nodes named = mesh names, _ColPrim/_Terrain children optional (cosmetic; XML is authoritative)
  Textures/*.ktx2              custom only
```
Pure half of `F/src/ksa/modExport.ts` AS-IS: `serializeModToml` (`:115` — extend with `systems=`), `sanitizeBaseName/uniqueFileName` (`:83-133`), `writeModToFolder` (`:1389`, sandboxed `FileSystemDirectoryHandle`, XML never overwritten), `buildModZip` (`:1300`), `buildMultiCustomBundle` (`:1261`), `F/src/state/modFolderStore.ts`, `F/src/util/zip.ts`, `F/src/ksa/exportGlb.ts` with `viewMeshes:false` and `nameMeshesFromNodes`.
- Id namespacing: `icrp_<mod>_<name>` for everything ICRP mints; Core-referenced mesh/material ids are copied verbatim (I2).

### P8.02 — Extend-stock-pad mode (D2 secondary)
`exportMode: 'extend-stock-pad'`: no `<System>`; the active object's placements/colliders are emitted as `<StaticObjectGameData Id="CoreLaunchPadA_Prefab_LaunchPadA">` (F10/L3) with the metres emitted only if the user ticked "override"; preflight explains it lands at all five stock sites and that GameData ids stack with other mods.

### P8.03 — Preflight
All I-invariants and P6.02 findings, plus: `systems=` present iff any site exists; each site's object exists; each inline body's source hash current; total texture size vs `Category="Vessel"` caps; mesh names unique across the mod and not colliding with Core mesh names unless intentionally referenced; `<Alpha>` only on materials that have it.

### P8.04 — Export dialog + preview
Port `F/src/state/exportPreviewStore.ts` + dialog: file tree, XML preview tabs, preflight list, "Write to mods folder" / "Download zip". Show the `manifest.toml` reminder: **new mods load disabled** (L9) — enable it in Settings → Mods.

### P8.05 — In-game verification runbook **[V]**
Create `apps/icrp/VERIFICATION.md` with the four checks and what to look for:
- **[V1]** vessel-derived piece (P1.03) renders and collides on the pad;
- **[V2]** an ICRP object at a new Earth site in the ICRP system: renders, vessel spawns on `SurfaceHeight`, clutter cleared, decal flattens;
- **[V3]** retargeted stock site (`LC-39A` → ICRP object) in the inline Earth;
- **[V4]** Alpha piece blends and Terrain piece takes the ground look;
- **[V5]** inline-Earth texture resolution: Id-only references + `../Core/` for the three anonymous paths, from both `Content/<mod>/` and `Documents/mods/<mod>/` (P7.00);
- **[V6]** the ICRP system still treats Earth as the home body and the launch-site picker lists the new sites (L5).
Record results in the file; the plan's F/L facts are decomp-verified but never yet exercised by a third-party mod.

---

## Phase 9 — Shell, docs, scope, CI

### P9.01 — Shell
Clone `F/src/app.tsx:79-197` skeleton, `F/src/ui/shell/Sidebar.tsx` AS-IS, `MenuBar/DialogRoot/ModeSwitcher` adapted; four modes (P0.04); status bar segments: selection count, snap state, active object, autosave health. Menu spec via `F/src/ui/menu/menuSpec.ts` helpers; every command registers in `commandStore` (palette `⌘K`). Hotkey table in the copied registry; `HelpDialog` generated from it. Escape ladder from `escLadder.ts`.

### P9.02 — Docs
`apps/icrp/docs/`: `architecture.md`, `coordinates.md` (the basis, with the U/E/N vocabulary), `snapping.md`, `assemblies.md`, `sites-and-system-mod.md`, `export.md`, `custom-pieces.md`. Link them from `F/AGENTS.md` "repository layout" (`apps/icrp/`) and from `F/README.md`.

### P9.03 — Scope catalog (D3)
`F/scope/static-objects.md` (F1–F14 with the break-surface files) and `F/scope/launch-sites.md` (L1–L9); rows in `F/scope/FULL_SCOPE.md`; extend `F/scope/GAME_UPDATE_CHECKLIST.md` with: re-diff `StaticObjectTemplate.cs`, `StaticSubObjectInstance.cs`, `LocationReference.cs`, `LandmarkReference.cs`, `DecalModifierReference.cs`, `StaticObjectAssetBundler.cs`, `StaticObject.frag`, `Astronomicals.xml` Earth block hash, `mod.toml` field list. Close gaps T1 (`<Alpha>`) and T2 (`<Terrain>`) in `F/plans/FIX_CURRENT_GAPS_PLAN.md` by pointing at ICRP's modelled implementation.

### P9.04 — Smoke test + CI
`scripts/smoke-icrp.ts` modelled on `F/scripts/smoke-v2.ts` (Node 24, project-local Playwright, accessible names): boot, load Core pad object, place a piece with snapping, undo, add a site, export preflight passes. `pnpm smoke:icrp`. Deploy unchanged.

---

## Appendix A — XML reference card (what ICRP writes)

```xml
<!-- <Mod>Assets.xml -->
<?xml version="1.0" encoding="utf-8"?>
<!-- This file is autogenerated by GlbToXmlUtility from source assets. -->
<Assets>
  <MeshAtlas Path="Meshes/<Mod>_MeshAtlas.glb" />                       <!-- custom pieces only -->
  <PbrMaterial Id="<Mod>_Material">
    <Diffuse Path="Textures/<Mod>_Diffuse.ktx2" Category="Vessel" />
    <Normal  Path="Textures/<Mod>_Normal.ktx2"  Category="Vessel" />
    <AoRoughMetal Path="Textures/<Mod>_PBR.ktx2" Category="Vessel" />
    <Alpha   Path="Textures/<Mod>_Alpha.ktx2"   Category="Vessel" />    <!-- optional; blend bucket -->
  </PbrMaterial>
  <StaticSubObject Id="icrp_<mod>_<piece>">
    <PartModel Id="icrp_<mod>_<piece>_Model">
      <Mesh Id="<glTF mesh name — custom, or a Core mesh id>" />
      <Material Id="<Mod>_Material | Core material id" />
      <Terrain>true</Terrain>                                           <!-- optional -->
    </PartModel>
    <Collider Id="Collider1">
      <Box Id="BoxCollider1"><LocationAsmb X Y Z/><Collider2Asmb X Y Z/><LengthX M/><LengthY M/><LengthZ M/></Box>
      <Cylinder Id="CylinderCollider1"><LocationAsmb/><Collider2Asmb/><LengthY M/><Radius M/></Cylinder>
      <!-- Sphere, Capsule, ConvexHull(<Mesh Id/><Scale/>) -->
    </Collider>
  </StaticSubObject>
  <StaticObject Id="icrp_<mod>_<object>">
    <SubObject Id="<piece>1" InstanceOf="icrp_<mod>_<piece>">
      <Transform><Position X Y Z /><Rotation X Y Z /><Scale X Y Z /></Transform>   <!-- omit identity parts -->
    </SubObject>
    <Collider Id="Collider1">…object-level colliders…</Collider>
    <GroundOffset /><SurfaceHeight /><FootprintRadius />
  </StaticObject>
</Assets>

<!-- <Mod>GameData.xml -->
<Assets>
  <StaticObjectGameData Id="icrp_<mod>_<object>">
    <GroundOffset M="0.2" /><SurfaceHeight M="1.55" /><FootprintRadius M="110" />
  </StaticObjectGameData>
</Assets>

<!-- systems/<mod>_system.xml (excerpt) -->
<System Id="<mod>_sol" …>
  <LoadFromLibrary Id="Sol" />
  <AtmosphericBody Id="Earth" Parent="Sol">      <!-- full Core block, plus: -->
    …
    <Landmark Id="Meow LC-1" IsLaunchPad="true" StaticObject="icrp_<mod>_<object>">
      <Latitude Degrees="28.5" /><Longitude Degrees="-80.6" />
    </Landmark>
    <Terrain><ProceduralModifiers>
      …
      <Modifier Type="Decal" Name="LaunchSite_Meow-LC-1" Biomes="Grass,Beach">
        <Amplitude Value="0" /><Order Value="9999" /><Radius Value="300" /><Rotation Degrees="0" />
        <Location Id="Meow-LC-1"><Latitude Degrees="28.5" /><Longitude Degrees="-80.6" /></Location>
        <AltitudeOffset Km="17.1" />          <!-- METRES despite the attribute name (L7) -->
        <SmoothFactor Value="0.69" />
        <HeightMap Id="Circle" Path="Textures/Planets/_Decals/circle.dds" Category="TerrainHeight" />
      </Modifier>
    </ProceduralModifiers></Terrain>
  </AtmosphericBody>
  <LoadFromLibrary Id="Luna" Parent="Earth" />
  …
</System>
```

## Appendix B — Break-surface file list (for `scope/` and game updates)

`D/KSA/`: `AssetBundle.cs`, `StaticObjectTemplate.cs`, `StaticSubObjectTemplate.cs`, `StaticSubObjectInstance.cs`, `StaticObjectGameDataReference.cs`, `StaticObject.cs`, `StaticObjectModel.cs`, `StaticObjectRenderer.cs`, `PartModelModule.cs`, `PbrMaterialReference.cs`, `ColliderModule.cs`, `ColliderTemplate.cs`, `ConvexHullColliderTemplate.cs`, `TransformReference.cs`, `QuaternionEx.cs`, `DistanceReference.cs`, `LocationReference.cs`, `LandmarkReference.cs`, `CelestialTemplate.cs`, `SystemTemplate.cs`, `AstronomicalReference.cs`, `DecalModifierReference.cs`, `ModifierReference.cs`, `ProceduralModifiersReference.cs`, `Vehicle.cs` (`GetLaunchPadHeightAtDirCcf`, `GetInitialKinematicStateForLocation`), `ConstraintSim.cs` (`UpdateStaticObjectCollider`), `GroundClutterPlacementData.cs`, `MeshAtlasFileReference.cs`, `ModLibrary.cs` (static registries, `AttachGameData`), `Mod.cs`, `ModManifest.cs`, `VehicleLaunchMenu.cs` (`SetLocations`). `D/KSA.GlbImport/`: `StaticObjectAssetBundler.cs`, `GlbColliders.cs`, `GlbTransforms.cs`, `PartInputSet.cs`, `ToolXml.cs`. `C/Core/`: `CoreLaunchPad{A,B,C}Assets.xml`, `CoreLaunchPadAGameData.xml`, `Astronomicals.xml` (Earth block + launch-site decals), `SolSystem.xml`, `mod.toml`, `DefaultAssets.xml:57-61`, `Shaders/Mesh/StaticObject.{vert,frag}`, `Meshes/CoreLaunchPad*_MeshAtlas.glb`, `Textures/CoreLaunchPad*_TextureAtlas_*.ktx2`, `Textures/Planets/_Decals/circle.dds`.

## Appendix C — Known limitations of the game (do not design around them)

- No per-site rotation; no nesting of static objects; `Scale` ignored by colliders; max 4 clutter-exclusion pads per body; one pad collider per vehicle (nearest within 300 m); statics never collide with each other or clutter; SSAO disabled for statics; Emissive/ThinFilm dead for statics; a mod cannot patch a Core body (hence D2); `<Alpha>` is blend-only (sorting artifacts are the game's); Terrain pieces ignore their own textures; `AltitudeOffset Km=` is metres.
