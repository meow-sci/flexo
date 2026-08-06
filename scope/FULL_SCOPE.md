# flexo ↔ KSA integration scope

This folder is the **authoritative catalog of every point where flexo depends on the Kitten
Space Agency (KSA) game** — the exact game classes, asset-XML schemas, file conventions, math
constants, and renderer quirks flexo bakes in. Its purpose is single: **when KSA ships an
update, this is the checklist you diff against to find what breaks flexo.**

- For _how flexo works internally_, see [`docs/`](../docs). This folder is the opposite view:
  the **contract with the game**, i.e. the break-surface.
- To vet a new game build, follow [GAME_UPDATE_CHECKLIST.md](GAME_UPDATE_CHECKLIST.md).
- Open gaps from the last update are tracked in
  [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

> **Keep this current.** Per [AGENTS.md](../AGENTS.md), any change to a flexo↔game integration
> point (XML schema read/written, ported math, asset/mesh/material naming, mod-export format,
> coordinate mapping, renderer-quirk workaround) MUST update the relevant `scope/*.md` in the
> same change. A new integration ⇒ a new `scope/*.md` + a row in the map below.

---

## Baseline game version

|                      | Build            | Path                                                                                                                                                              |
| -------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verified against** | `2026.8.3.5117`  | `ksa-game-assemblies_prev/current` (decomp @ 5117) + `flexo-private-assets/assets` (Core XML @ 5117, re-encoded); also `ksa-game-assemblies` git commit `2369a41` |
| Previous baseline    | `2026.7.10.5056` | `ksa-game-assemblies` git commit `13595c1` (the mirror \_prev copies go stale over time — diff the decomp via git history)                                        |
| Baseline before that | `2026.7.9.5018`  | `ksa-game-assemblies` git commit `3106557` (diff decomp via git history)                                                                                          |

> ⚠️ **A NEWER, UNVETTED build sits in the working dir.** `ksa-game-assemblies/current` has
> advanced to **`2026.8.5.5168`** (2026-08-05, revs 5118–5166), which pushed 5117 down into
> `ksa-game-assemblies_prev/current` — the paths in the table above shifted accordingly. flexo's
> baseline is still **5117**: nothing in this catalog has been re-verified against 5168, and the
> v2 UI refactor deliberately did not re-baseline. `version.json` @ 5168 flags at least three
> areas that will need the [GAME_UPDATE_CHECKLIST.md](GAME_UPDATE_CHECKLIST.md) treatment —
> the ground-clutter asset-bundler rework (revs 5136–5138, 5157: KTX2-only clutter textures,
> id-referenced clutter objects, clutter colliders, new `Opacity`/`Thickness` BC4 textures),
> the solid-motor grain-size corrections + new `AreaReference` (revs 5124/5125), and the
> `CoreFairingA` / `CoreUtilityA` asset imports (revs 5161/5166). Run the checklist before
> claiming any 5168 verdict. Note: `EVADoorTemplate` **was** spot-checked at 5168 during the
> P12.16 audit and is unchanged (still `SeatId`-only).

Each snapshot holds `decomp/` (decompiled C#; schema lives in `[XmlType]`/`[XmlElement]`/
`[XmlAttribute]` + public fields), `Content/Core/` (the shipped game-data XML + GLSL shaders),
and `version.json` (a commit-by-commit changelog — the fastest first read on any update).

> **5117 review method.** Full `5056 → 5117` diff via `diff -rq` of the two provided asset
> trees (`ksa-game-assemblies_prev/current` @ 5056 vs `ksa-game-assemblies/current` @ 5117),
> plus a sweep of every changed `decomp/*.cs` for `[XmlElement]`/`[XmlAttribute]`/`[XmlType]`
> hunks — the only way an XML contract can move. `version.json` @ 5117 documents revs
> 5057–5116: a large release (crew/kitten roster, burn-planning UX, launch pads, vehicle
> destruction, plume-trail and atmosphere refactors) whose **entire XML schema delta is seven
> lines**, of which two touch flexo. **No BREAKING item.** Two **MISSING-CAPABILITY** gaps,
> both from the same feature (rev 5085, EVA-door ↔ seat linking): `<EVADoor SeatId>` is a new
> attribute flexo drops, and `<IVASeat Id>` — long schema-legal via `ModuleBase.TemplateDataBase`
> and deliberately never emitted by flexo — became **load-bearing** as the target of that link
> (`EVADoor.ResolveAlignedSeats` matches `IVASeat.TemplateId` against `EVADoor.SeatId`), with
> Core now authoring both ends. One **SCHEMA-DRIFT** (docs-only): rev 5099 replaced the clutter
> ecotype's `<Collideable Value>` with `<CollisionType Value="None|PrimitiveList|Mesh">`; the
> cartoon-moon scaffold emits neither, so no generator change is required.
>
> Explicitly **re-verified intact**: every ported engine-physics class is byte-identical
> (`DeLavalNozzleConfig` / `CombustorConfig` / `GasProperties` / `CombustionTable` /
> `NozzlePerformance` / `RocketDesign` / `EngineDesigner` all unchanged); the coordinate
> convention survived rev 5067's **deletion of `Double3Ex.Up/Down/Right/Left/Forward/Backward`**
> — the vectors moved to `Camera.ForwardView`/`RightView`/`UpView` with **identical values**
> (`-UnitZ` / `+UnitX` / `+UnitY`) and `QuaternionEx.GetAxis`'s fallback became the equally
> identical `double3.UnitY`, so `coords.ts`'s `EULER_ORDER` calibration is untouched;
> `QuaternionEx.CreateFromXyzRadians`, `KeyframeAnimationData`/`KeyframeAnimationModule`,
> `Control`/`ControlTemplate` (still empty markers — a `controlpoint`/`referencetransform`
> grep over the 5117 decomp finds only Vulkan tessellation and spline-editor hits),
> `FlightComputer.UpdateAttitudeTrackError` (still aims body **+X**), `PartModelModule`'s
> `[XmlElement("Internal")]` (still the only one in the tree), `Mod`/`ModLibrary`/`AssetBundle`/
> `PbrMaterialReference`, `CharacterAssets.xml` + `KittenRenderable`, and
> `ThumbnailRenderResources` (byte-identical — the un-guarded `Material.NormalReference`/
> `AoRoughMetalReference` deref survives, so flexo's synthetic Normal + ORM stay mandatory).
> `ModelTranslucent.frag`/`Fur.frag` changed by exactly one line each (a `GetCloudShadow`
> multiply), which does not touch the kitten material contract.
>
> Content-side: `CoreElectricalAGameData.xml` dropped placeholder `<Collider>` blocks and
> `CoreFuelTankA/B` re-tuned tank oversizing (values + comments, no schema); `CorePropulsionAAssets.xml`
> was re-imported with transforms applied to vertices; `Volatiles.xml`/`SolidPropellants.xml`
> gained `DefaultPhase=` + `<Color>` on `<Substance>` (flexo consumes only substance-phase **ids**
> like `H2(l)`, which are unchanged). All six vendored `src/ksa/__fixtures__/` files were
> re-synced from the 5117 mirror and the full `src/ksa` suite (614 tests) passes.

> **5056 review method.** Full `5018 → 5056` diff via **git history inside
> `ksa-game-assemblies`** (`git diff 3106557 13595c1`) + `diff -rq` of the two private-mirror
> `assets/` trees; `version.json` @ 5056 documents revs 5019–5055. One **BREAKING** schema
> move and a large amount of regenerated content. The break: **rev 5022** pulled
> `<VolumetricExhaust>` / `<PlumeTrail>` off `RocketNozzleTemplate` and re-homed both inside a
> repeatable `<ReactionPlume Reaction Default>` (new `ReactionPlumeReference.cs`) so a nozzle
> can switch exhaust style with the core's configured reaction. Because `<DeLavalNozzle>` /
> `<SolidMotorNozzle>` are **modeled** elements they never rode the GameData passthrough, so
> flexo both lost the plume on import and emitted XML the game now ignores. Fixed by replacing
> the two scalar fields with a `reactionPlumes: ReactionPlume[]` list (no back-compat, per the
> no-migration rule); the two existing editor selects now drive the unkeyed `Default="true"`
> entry and reaction-keyed entries round-trip untouched.
>
> The other load-bearing rev is **5034**, which fixed KSA's own `KeyframeAnimationData` GLB
> loader: it used to build an `Animation` only for ANIMATED nodes and walk parentage past
> non-animated intermediates, silently dropping their local transforms — the "landing leg
> animates incorrectly" bug. It now builds an `Animation` for EVERY glTF node and links each to
> its IMMEDIATE parent. **flexo needed no change**: `animationImport.decodeAnimationGlb` already
> treated a non-animated ancestor-of-a-member-leaf as a joint (`hasLeafDescendant`) and composed
> the full chain in `nodeWorld`, so flexo was already right and the game caught up. Verified
> concretely against the mirror: `CoreLandingA_Prefab_MediumLandingLegA_Anim.glb` carries a
> non-animated `CoreLandingLegA_RootJoint` with a non-identity rotation between the scene root
> and the animated chain. NEW live constraint the fix creates: the scene ROOT node's own TRS now
> contributes to `EvaluateWorldMatrix` (it was ignored before) — flexo emits an identity root in
> `animationRig.ts`, so this holds, but it is now load-bearing.
>
> Everything else re-verified **INTACT**: the byte-identical ported physics
> (`DeLavalNozzleConfig` / `CombustorConfig` / `GasProperties` / `NozzlePerformance` /
> `RocketDesign` / `EngineDesigner` / `RocketCore` / `Combustor` / `FixedReaction`), and
> `QuaternionEx` / `Double3Ex` / `Control` / `ControlTemplate` / `FlightComputer` / `IVASeat` /
> `IVAController` / `PbrMaterialReference` / `AssetBundle` / `ThumbnailRenderResources` /
> `PartModelRenderer` / kitten rendering / `EditorTagDefinition` / `SubPartTemplate` /
> `KeyframeAnimationModule` are all unchanged. `<Internal>` is still the only
> `[XmlElement("Internal")]` in the decomp and `ENABLE_EMISSIVE` is still defined. No
> `ControlPoint` / reference-transform appeared, so "up follows root" holds. `Part.Connector`
> and `Tank` gained only `ShouldSerialize*` write-side helpers — the `<Flags>` / `<Capabilities>`
> wire format is unchanged. Rev **5028** added `[DefaultValue]` to `PartModelModule.RayTracing`
> (`Disabled`) / `.ShadowCaster` (`true`) / `.Internal` (`false`) and the two
> `PartModelGlassModule` bools (both `false`); these are WRITE-side suppression only and confirm
> the defaults flexo already assumes. `PartTemplate.EditorTags` gained `[XmlIgnore]` — the wire
> element is still `<EditorTag>` via `EditorTagsStrings`.
>
> Content-side, rev **5025** moved the `GlbToXmlUtility` into the codebase (new `KSA.GlbImport`
> namespace: `AssetBundler.cs` / `ToolXml.cs` / `InputSet.cs`) and rev **5026** regenerated nine
> Core part files through it. It is the game's own reference implementation of what flexo's
> `assetsXmlSerializer.ts` / `exportGlb.ts` emit, and it independently confirms flexo's
> conventions (`_VM` view meshes, `<Stem>_Material`, `_ColPrim*` / `_connector` / `_pivot` /
> `_glass` / `_raytrace*` node prefixes, synthetic Normal + AoRoughMetal). It also writes **4
> significant figures** where the old external tool wrote 5–6, so every regenerated collider /
> transform value in Core shifted in the last digit — a content change, not a schema one.
> Rev **5026** additionally split the fuel port into its own `CoreFuelPortGameData.xml`;
> `<FuelPort MaxLength>` remains a `<PartGameData>` child (passthrough-safe) and an OPEN gap.
>
> **5018 review method.** Full `4980 → 5018` diff via **git history inside
> `ksa-game-assemblies`** + `diff -rq` of the two private-mirror `assets/` trees;
> `version.json` @ 5018 documents revs 4981–5016. Unlike the last three updates this one is
> **not a patch list — KSA changed the SHAPE of how a Part declares propellant flow**, and
> flexo's model had no equivalent concept. Three load-bearing revs: **4992** (solid rocket
> motors + connector Capabilities + explicit engine feed sources), **5002** (solid modules on
> every booster part, `HollowOpenSemiEllipsoidMass`, feeding from sub-parts) and **5007**
> (decoupler joints became a per-connector Capability). What used to be implicit — a combustor
> searching the whole vehicle for tanks — is now explicitly authored topology in three layers:
> connector `<Capabilities>`, consumer `<FeedsFrom>`, and Part `<ConsumerFeedWiring>`. Because
> `<Connector>`, `<Combustor>` and `<Tank>` are **modeled** elements they never rode the
> GameData passthrough, so every addition was silent data-loss: a flexo-exported engine
> declared no feed points (dead in-game) and a round-tripped fuel tank / decoupler / SRB
> segment lost its `BulkFluid` / `DecouplerJoint` / `SolidMotorCase`. New surface doc:
> [plumbing-and-feeds.md](plumbing-and-feeds.md). Also handled: solid-motor authoring
> (`<SolidMotor>`/`<SolidMotorNozzle>`/`<SolidGrainSegment>` + `GrainGeometries.xml`), the
> mandatory solid-reaction burn-rate data (`FixedReactionTemplate.Create` THROWS without it —
> a crash-class export bug), the `DefaultEngine` → `DefaultPlumeTrail` rename (Core now uses
> trails on SRBs only), and a **pre-existing latent bug** promoted to breaking: flexo emitted
> comma-joined `[Flags]` bodies, but .NET's `XmlSerializationReader.ToEnum` splits on
> WHITESPACE and throws on the resulting `"Internal,"` token. Ported physics
> (`enginePhysics.ts`) is byte-identical and needed zero changes; animation, kittens,
> coordinates, mod/asset loading all re-verified **INTACT**. Full detail:
> [plans/UPGRADE_PLAN_2026-07-24.md](../plans/UPGRADE_PLAN_2026-07-24.md).
>
> **4980 review method.** Full `4939 → 4980` diff via **git history inside `ksa-game-assemblies`**
> (`git diff 2423a02 cdb7391`) + `diff -rq` of the two private-mirror `assets/` trees;
> `version.json` @ 4980 documents revs 4940–4978. The update is HUD layouts, the burn-UI gauge
> rework, navball markers, screenshots, terrain **texture streaming**, cascaded-shadow
> specialization constants, and vehicle-runtime work (docking frame fixes, undock naming, fuel
> flow-rule persistence, sequence Δv rework) — almost entirely outside flexo's surface.
> **Zero part-template/GameData/engine/animation schema drift**: no `*Template.cs`, unit
> reference, ported-physics, or `KeyframeAnimation*` class changed; the shipped part XML is
> content-identical (8 mirror files differ only in CRLF line endings — sync artifact; fixtures
> unaffected). Contract mechanics that MOVED but held: root-identity pin consolidated into
> `PartTree.NormalizeRootRotation()`; `Part.Connector.ConnectAndMerge` rewritten (same 180°-Z
> mate contract). Save-side-only schema: `ControlData.VehicleName`, `FlightComputerData.RCSMode`
> (+ RollMode default `Up`→`Decoupled`), `EngineController.SaveData.FlowRule` (default flow rule
> flipped to `FurtherestToNearestSameStage`), docking `PreDockRootTransform`. One data-side
> delta handled: new **`TextureCategory.TerrainHeight`** — Core retagged height-affecting
> celestial textures, and the cartoon-moon scaffold's Luna block was retagged to match (see
> [ground-clutter.md](ground-clutter.md#what-changed-in-4980)). No new integration surfaces;
> the 4939 OPEN gaps (geometry `<Collider>`, part-level `<Tank>`, FuelPort, clutter LOD retune)
> carry forward. All areas re-verified **INTACT/CURRENT**.
>
> **4939 review method.** Full `4892 → 4939` diff via **git history inside `ksa-game-assemblies`**
> (`git diff 7cf5c0a 2423a02`); `version.json` @ 4939 documents the whole rev range 4893–4939.
> The bulk of the update is rendering (screenspace particles, volumetric plume trails, clutter
> culling) and vehicle-runtime work (fuel lines/ports, tank transfer, sequence UI) — outside
> flexo's part-template scope. Real contract deltas, all handled: **`<PlumeTrail Id>`** on
> `RocketNozzleTemplate` (new `[XmlElement]`; Core now sets `DefaultEngine` on every main
> engine — modeled in flexo, see [engines.md](engines.md#what-changed-in-4939)); new
> **`Booster` editor tag** (registry snapshot refreshed); new asset packs
> **CoreFuelTankB** (bays) / **CorePropulsionC** (large SRBs, GameData unconfigured) added to
> `ASSET_FILES`; **tank GameData relocated** from SubPart-level entries in `PartGameData.xml`
> to Part-LEVEL `<Tank>` entries in `CoreFuelTankAGameData.xml` (flexo doesn't model part-level
> tanks — passthrough preserves them; fixtures re-synced); `<SymmetryGroup>` GameData sugar for
> connector `<Sibling>` (passthrough-safe; `[XmlElement("Sibling")]` schema unchanged); first
> **geometry-template `<Collider>`** children on 2 CoreElectricalA prefabs + 2 solar-cell
> SubParts (NOT passthrough-covered — recorded gap, see
> [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)); new `FuelPort`
> GameData module (passthrough-safe, opaque to the editor). `VolumeReference` XML schema
> unchanged (display-only liters rework). Animation, kittens, custom-assets/mod-export,
> connectors/coords/IVA, clutter schema all re-verified **INTACT**.
>
> **4892 review method.** Full `4826 → 4892` diff via **git history inside `ksa-game-assemblies`**
> (`git diff 1265373 7cf5c0a`) — the `_prev` directory was stale (4750), so the last-vetted 4826
> tree came from the repo's own history. `version.json` @ 4892 documents revs 4861–4892 only
> (4827–4860 have no changelog; the file diff is authoritative). Headline: the **rev-4884
> Reactions refactor** (Combustion.xml → Reactions.xml, `<Combustor><Reaction Id>` +
> `<MixtureRatio>`, tank `<RoleAffinity>`) — BREAKING, re-modeled in flexo (see
> [engines.md](engines.md#what-changed-in-4892), [gamedata-modules.md](gamedata-modules.md#what-changed-in-4892))
> — plus the **ground-clutter multi-material schema** (LOD `<Material Id>` refs now REQUIRED —
> the cartoon-moon scaffold was regenerated, see [ground-clutter.md](ground-clutter.md#what-changed-in-4892)).
> Animation, kittens, custom-assets/mod-export, and connectors/coords/IVA re-verified **INTACT**.
> New vehicle-level systems (fuel links, sequence performance, resource groups) are save-state,
> not part-template surfaces — no new scope rows needed.
>
> **4826 review method.** Full `4750 → 4826` **decomp diff** (`ksa-game-assemblies` @ 4826 vs
> `ksa-game-assemblies_prev` @ 4750) + shipped-Core-XML diff. (An early pass mistook a stale
> checkout for "no 4826 decomp"; the decomp _is_ at 4826 and every finding below was re-verified
> against the actual C#.) The 4826 `version.json` only documents revs 4824→4826 (terrain-perf); the
> real 4751→4826 delta was recovered from the decomp + XML diffs, not the changelog. The new
> `<Sibling>`/`<Aligned>` are the game's new **part-symmetry** system (`Connector.SymmetrySiblings`
> = `[XmlElement("Sibling")] List<ConnectorReference>`; `PartTemplate.Aligned` = `List<AlignedConnectorsRef>`);
> the runtime `PartSymmetryInstance`/`SymmetryLayerInstance` classes are **vehicle-assembly / save
> state, outside flexo's part-template scope** — only the connector-level template hints reach flexo.

---

## The one cross-cutting invariant (read first)

**flexo rebuilds a fresh `<Assets>` document from a typed model — it is not a byte-faithful
editor.** Its parsers read a fixed allow-list into typed objects; its serializers emit only what
they know. **As of gap 6 (2026-06-27) `<PartGameData>`/`<SubPartGameData>` are passthrough-safe:**
their unmodeled child elements + root attributes are captured (`RawXmlNode`) and re-emitted verbatim
(so `<Collider>` et al. survive). Everywhere ELSE — the geometry `<Part>`, `<SubPart>` templates,
other top-level `<Assets>` children — an unmodeled element is still silently dropped on the next
import → export (it rarely _crashes_ flexo; it just disappears). Every update review must still
check for _added_ schema outside the GameData child/attr surface, not just _changed_ schema. Full
detail: [part-and-subpart-xml.md](part-and-subpart-xml.md#-master-invariant--flexo-rebuilds-a-fresh-dom-now-with-gamedata-passthrough).

> **The passthrough does not cover MODELED elements — and that is the sharp edge.**
> `<Connector>`, `<Combustor>`, `<DeLavalNozzle>`, `<Rocket>`, `<Tank>` and the rest of the
> allow-list are read field-by-field, so schema ADDED to one of them is dropped on the next
> import → export even though the surrounding document round-trips perfectly. **5018 is the
> canonical example**: `<Capabilities>` on a connector, `<FeedsFrom>`/`<Plumbing>` on a
> combustor, and `Id` on a `<Tank>` were all silently lost, turning an imported Core fuel
> tank or a flexo-authored engine into dead hardware in-game with no error anywhere. When
> vetting an update, diff the modeled elements' template classes specifically — the
> passthrough will not save you there (see
> [GAME_UPDATE_CHECKLIST.md](GAME_UPDATE_CHECKLIST.md)).

---

## Integration map (at a glance)

Status reflects the `5056 → 5117` review. 🔴 breaking · 🟡 missing/drift · 📝 docs · ✅ intact.
Rows whose contract did not move at 5117 keep their prior verdict and are marked "re-verified".

**5117 deltas to the table below:** _Connectors/coordinates/IVA_ and _GameData module blocks_
were 🟡 for `<EVADoor SeatId>` + a load-bearing `<IVASeat Id>` (gaps **Q1**/**Q2**) — **both are
now modeled**, so both rows are ✅ again; _Ground clutter_ → 🟡 (`<Collideable>` →
`<CollisionType>`, docs-only, gap **Q3**); every other row re-verified ✅ against 5117.

| Area                                                                                      | Detail doc                                                         | Primary game anchors                                                                                                                                                                                                                                                                                                         | 5018 status                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Part / SubPart XML structure, catalog, editor tags, part size                             | [part-and-subpart-xml.md](part-and-subpart-xml.md)                 | `PartTemplate.cs`, `Part.cs`, `EditorTagDefinition.cs`, `*Assets.xml`/`*GameData.xml`, `CoreEditorTagsGameData.xml`                                                                                                                                                                                                          | ✅ intact (structure unchanged; part-level `<Tank>` now MODELED, fixtures re-synced; gap **E** closed)                                                                                                              |
| GameData module blocks (mass, electrical, tanks, decoupler, docking port, control, light) | [gamedata-modules.md](gamedata-modules.md)                         | `BatteryTemplate.cs`, `DockingPortTemplate.cs`, `EnergyReference.cs`/`PowerReference.cs`/`ImpulseReference.cs`, `ControlTemplate.cs`                                                                                                                                                                                         | 🔴→✅ container `Id`s became load-bearing; `<SolidGrainSegment>` + part-level `<Tank>` modeled                                                                                                                      |
| Engines (thrust/Isp physics, reactions)                                                   | [engines.md](engines.md)                                           | `DeLavalNozzleConfig.cs`, `FixedReactionTable.cs`/`MixtureReactionTable.cs`, `ReactionTemplate.cs` family, `RocketControllerData.cs`, `EngineDesigner.cs`, `Reactions.xml`                                                                                                                                                   | 🔴→✅ `<FeedsFrom>`/`<Plumbing>`/solid motors modeled; ported physics byte-identical                                                                                                                                |
| **Nozzle exhaust placement** (multi-nozzle lists, FX override, frames, thrust magnitude)  | [engines.md](engines.md)                                           | `RocketNozzleTemplate.cs` (`OnDataLoad` FX fallback), `RocketNozzle.cs` (`ResetState` frames), `PartTemplate.cs:45-47,245` (`RocketNozzles` list, both scopes), `Part.cs:217,644-660` (`MatrixAsmb2VehicleAsmb` vs `Asmb2VehicleAsmb`), `VehicleUpdateState.cs:294`, `Vehicle.cs:4828,5030+` (roll-free plume, debug arrows) | 🔴→✅ **`<ReactionPlume>` at 5056** — `RocketNozzleTemplate` moved `<VolumetricExhaust>`/`<PlumeTrail>` into a repeatable `<ReactionPlume Reaction Default>`; flexo now models `reactionPlumes[]` (was two scalars) |
| Animation (keyframe import/export)                                                        | [animation.md](animation.md)                                       | `KeyframeAnimationData.cs`, `KeyframeAnimationModule.cs`, `Animations/*.glb`                                                                                                                                                                                                                                                 | ✅ intact @5056 — KSA's loader fix (rev 5034) moved the GAME to the semantics flexo already had; new live constraint: the scene ROOT node's TRS now applies                                                         |
| Kittens (Character rendering, editor-only)                                                | [kittens.md](kittens.md)                                           | `CharacterAssets.xml`, `KittenRenderable.cs`, `CharacterRenderResources.cs`, `ModelTranslucent.frag`                                                                                                                                                                                                                         | ✅ intact (re-verified @5056 — no `Character*`/`Characters/` change)                                                                                                                                                |
| Custom assets, textures, GLB **import + export**, mod export                              | [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md) | `ThumbnailRenderResources.cs`, `Mod.cs`/`ModLibrary.cs`/`AssetBundle.cs`, `PbrMaterialReference.cs`, `MeshAtlasFileReference.cs`, `mod.toml`, `RenderCore.Gltf/GltfUtils.cs`, `MeshReference.cs`, `PartModelModule.cs`, `PartModelRenderer.cs`, `Part.cs` (`RayCastEgoSubPart`)                                              | ✅ intact (`AssetBundle.cs` gained one line, `<GrainGeometry>`; thumbnail rule holds)                                                                                                                               |
| Connectors, coordinates, IVA (seats + the `<Internal>` render gate)                       | [connectors-coordinates-iva.md](connectors-coordinates-iva.md)     | `Part.Connector`, `QuaternionEx.cs`/`Double3Ex.cs`, `VehicleEditor.cs`, `PartModelModule.cs`, `PartModel.cs`, `IVASeat.cs`, `IVAController.cs`, `Camera.cs` (`LookAtRotation`), `DockingPortTemplate.cs`                                                                                                                     | 🔴→✅ `<Capabilities>` modeled (incl. `DecouplerJoint`); `[Flags]` separator fixed; `<IVASeat>` now MODELED and `<Internal>` is user data (was an automatic export rewrite)                                         |
| **Colliders** (part collision volumes)                                                    | [colliders.md](colliders.md)                                       | `ColliderModule.cs` + `Box\|Sphere\|Cylinder\|CapsuleColliderTemplate.cs`, `ColliderTemplate.cs`, `DistanceReference.cs`, `Vehicle.cs` (collider compound + zero-collider fallback), `ConstraintSim.cs` (docking by contact), `PartTemplate.ApplyGameData`                                                                   | ✅ modeled (closes the 4939 geometry-template gap **E**)                                                                                                                                                            |
| Ground clutter (data-only celestial mod)                                                  | [ground-clutter.md](ground-clutter.md)                             | `GroundClutterReference.cs` + 6 sibling schema classes                                                                                                                                                                                                                                                                       | 🟡 @5056 rev 5041 added `SlopeMaskStrength`/`Contrast`/`Bias` + `<AltitudeDensityCurve>` to `GroundClutterPlacementReference` — additive, defaults inert; scaffold not yet emitting them (gap **P3**)               |
| **Plumbing topology** (connector capabilities, consumer feed points, containers)          | [plumbing-and-feeds.md](plumbing-and-feeds.md)                     | `ConnectorCapability*.cs`, `FeedsFromReference.cs`, `ConsumerFeedWiring.cs`, `RocketCoreTemplate.cs`, `PartTemplate.ResolveConsumerFeedPoints`                                                                                                                                                                               | 🔴→✅ modeled (NEW surface at 5018)                                                                                                                                                                                 |
| **Light falloff/aim math** (editor coverage visualization — ported formulas + pose rules) | [gamedata-modules.md](gamedata-modules.md)                         | `Content/Core/Shaders/Lighting/LightPrePass.comp` + `LightData.glsl`, `KSA.Rendering.Lighting/Light.cs`, `LightModule.cs`                                                                                                                                                                                                    | ✅ ported @5018 (NEW surface — `src/ksa/lightFalloff.ts` + `src/three/coords.ts` `lightWorld`/`lightLocalFromWorld`/`lightWorldAim`)                                                                                |

> **The glTF contract is bidirectional and lives in one place.** flexo now both WRITES GLB
> (mesh atlases) and READS it (the Blender model importer,
> [docs/importing-models.md](../docs/importing-models.md)) — and the import path is shaped
> entirely by what the EXPORT path must be able to emit: KSA's accepted attribute set, the
> mandatory index buffer, the float32/tight accessor rule, node transforms being ignored,
> one material per `<PartModel>`, unconditional back-face culling, and the `<MeshView>` CPU
> budget. All of it is contracts **#10–#11 and #13–#17** in
> [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md), verified @5018 — there
> is no separate "import" scope doc to check.

> **The emissive contract is a hard engine limit, not a flexo gap.** `<Emissive>` is a
> single-channel mask added as `white × mask × 1.25` AFTER lighting, with no colour, tint or
> LUT field anywhere in `PbrMaterialReference` — so a glow is achromatic in shadow and colour
> can only come from a `<Light>`'s `<Color>` (or the hard-coded battery status light). The
> greyscale-map-keyed-to-a-1px-gradient technique the engine does implement is the
> **temperature** channel, on the `<PartModelDynamic>` shader variant that has emissive
> compiled out. Contracts **#12 and #18** in
> [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md); full source-cited
> derivation in [analysis/KSA_EMISSIVE_AND_LUT.md](../analysis/KSA_EMISSIVE_AND_LUT.md).
> **Re-check on a game update:** an `<EmissiveLut>`/tint slot appearing on
> `PbrMaterialReference`, or `ENABLE_EMISSIVE` reaching `BuildPipelineDynamic`, would let
> flexo ship the ramp instead of baking it.

### Open gaps from 5117 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

The `5056 → 5117` review found **no BREAKING item**. Four gaps from the review — **Q1, Q2 and Q4
are now FIXED**, Q3 remains 📋 OPEN — plus **Q5**, a flexo-side invention found while closing Q1
and fixed at the end of the v2 refactor:

- **Q1 — `<EVADoor SeatId>` was dropped (🟡 MISSING-CAPABILITY) — ✅ FIXED.** Rev 5085 added
  `[XmlAttribute("SeatId")]` to `EVADoorTemplate`; Core authors it
  (`Content/Core/PartGameData.xml` →
  `<EVADoor SeatId="CoreIVASpaceA_Prefab_MediumCapsuleA_SeatA" />`). Because the attribute sits
  on a **modeled** child it never rode the GameData passthrough, so importing then exporting a
  crew-door part silently unlinked the hatch from its seat. flexo's `EvaDoor` now carries
  `seatId: string | null`, parsed and emitted (omitted when unset).
- **Q2 — `<IVASeat Id>` was never emitted, but is the link target (🟡 MISSING-CAPABILITY) —
  ✅ FIXED.** Paired with Q1: `EVADoor.ResolveAlignedSeats` matches `IVASeat.TemplateId`
  (= `ModuleBase.TemplateDataBase.Id`) against `EVADoor.SeatId`, and Core now authors
  `<IVASeat Id="…_SeatA">`. `IvaSeat` gained a **user-authored** `ksaId` distinct from the
  regenerated `_seatN` editor id, emitted only when set — the serializer's old rationale
  ("nothing references a seat by id") was retired, while its still-true half survives: the id
  shares the namespace `<FeedsFrom Container=>` resolves against, so flexo never auto-fills it
  with an internal id.
- **Q4 — rev-5091 engine-wiring warnings were unmirrored (🟡 MISSING-CAPABILITY) — ✅ FIXED.**
  KSA added five `Warning`-level "wired up wrong" checks whose common symptom is an engine that
  loads and then makes no thrust. `validateEngines` now emits all five at `warn` severity —
  `controller-no-rockets`, `rocket-no-nozzles`, `nozzle-not-referenced`, `core-not-referenced`,
  `wiring-feed-unresolvable` — each with `EngineIssue.source` so the findings surfaces jump to
  the offending module. Game-side sites and the two deliberate narrowings are tabulated in
  [engines.md](engines.md#what-changed-in-5117).
- **Q5 — flexo emitted a `<EVADoor ConnectorId>` that is not in KSA's schema (🟡 FLEXO-SIDE
  INVENTION) — ✅ FIXED (flexo v2 P12.16).** Found while closing Q1 and deliberately deferred by
  Phase 6 (removing it changes exported bytes). Re-verified from the decompiled class at
  **5117 and 5168**: `EVADoorTemplate` declares exactly one `[XmlAttribute]`, `SeatId`, and the
  runtime `EVADoor` module (`EVADoor.CreateComponents`) copies only that — an EVA hatch is not
  connector-bound, unlike `DecouplerTemplate`/`DockingPortTemplate` which really do carry
  `ConnectorId`. Core authors `<EVADoor SeatId="…" />`
  (`Content/Core/PartGameData.xml:670,674`). `XmlSerializer` discarded the unknown attribute so
  it was inert in-game, but flexo was writing a nonexistent field into exported mod files and
  showing a meaningless connector picker for the hatch. `EvaDoor` is now `{ seatId }` only;
  parser, serializer, project codec, project merge and the Coupling section all follow.
  **This changes exported bytes** for any part with an EVA door (one attribute fewer) — the only
  export-byte change in the entire v2 refactor.
- **Q3 — clutter `<Collideable>` → `<CollisionType>` (📝 SCHEMA-DRIFT, docs-only).** Rev 5099
  replaced `ClutterEcotypeReference`'s `[XmlElement("Collideable")] BoolReference` with
  `[XmlElement("CollisionType")] ClutterCollisionTypeReference` (`Value="None|PrimitiveList|Mesh"`,
  new `ClutterCollisionTypeReference.cs`). `ksa-mods/cartoon-moon/` emits neither element and
  both defaults mean "no collision", so nothing is broken — but `scope/ground-clutter.md`
  documents the old name and must be corrected. Rev 5098 also made ecotype scale **16 discrete
  steps** between `MinScale`/`MaxScale` (runtime only, no schema) and rev 5099 made
  non-uniform scale an `IsValid` **error** for collideable ecotypes.

### Open gaps from 5056 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

The `5018 → 5056` review found **one BREAKING** item, now **✅ FIXED**: the
`<ReactionPlume>` re-homing of nozzle exhaust FX (rev 5022). Still **📋 OPEN** from 5056:

- **P1 — reaction-keyed plume authoring (MISSING-CAPABILITY) — ✅ FIXED (flexo v2 P7, decision
  D15).** flexo always round-tripped keyed `<ReactionPlume Reaction="…">` entries faithfully,
  but the editor's two selects only drove the unkeyed `Default="true"` entry, so a keyed entry
  could not be created or edited. Engine mode's Nozzle editor now carries a **"Plume entries"**
  disclosure over the FULL list (add / remove / re-key / per-entry exhaust + trail selects,
  `src/ui/engine/NozzleEditor.tsx`), each mutation one discrete undo step through
  `updateReactionPlumes` (`src/state/editorStore.ts`). The two headline selects remain the fast
  path onto the default entry. Core's SRB nozzle (`CorePropulsionCGameData.xml`) is still the
  only shipped user. See [engines.md](engines.md#what-changed-in-5056--reactionplume-breaking-and-nothing-else).
- **P2 — `KSA.GlbImport` is an unmapped integration surface (📝 docs).** Rev 5025 brought the
  game's own `GlbToXmlUtility` in-tree. It is the authoritative reference for what flexo's
  `assetsXmlSerializer.ts` / `exportGlb.ts` emit and deserves either a scope row of its own or
  a cross-reference from [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md).
- **P3 — clutter `SlopeMask*` + `<AltitudeDensityCurve>` (🟡 drift).** Rev 5041 added four
  `GroundClutterPlacementReference` fields; the `ksa-mods/cartoon-moon/` scaffold does not
  emit them. Defaults are inert (`SlopeMaskStrength` 0), so this is additive, not breaking.

Carried forward and still **📋 OPEN**: `FuelPort` authoring (**G**), the cartoon-moon clutter
LOD retune (**H**) and the optional clutter `<LOD CastShadows>` (**F14**). The solid-motor
thrust-curve preview is **✅ DONE** — `src/ksa/solidMotorPhysics.ts` ports
`SolidMotor.TrySampleThrustCurve` + `ResizeNozzles` + `GrainGeometryTable`; see
[engines.md](engines.md#solid-thrust-curve-preview--srcksasolidmotorphysicsts-ported-was-a-documented-gap).

### Open gaps from 5018 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

The 5018 review's gap register (F1–F14) is in
[plans/UPGRADE_PLAN_2026-07-24.md](../plans/UPGRADE_PLAN_2026-07-24.md) §2. All BREAKING,
DATA-LOSS, MISSING-CAPABILITY and SCHEMA-DRIFT rows are **✅ FIXED**; part-level `<Tank>`
(carried-forward gap **F** from 4939) is closed too, and the geometry-template `<Collider>`
gap (**E**) is now closed by MODELING `<Collider>` outright ([colliders.md](colliders.md)).
Still **📋 OPEN**: `FuelPort`
authoring (**G**), the cartoon-moon clutter LOD retune (**H**) and the optional clutter
`<LOD CastShadows>` (**F14**). The solid-motor thrust-curve preview is **✅ DONE**: the port of
`SolidMotor.TrySampleThrustCurve` + `ResizeNozzles` + `GrainGeometryTable` lives in
`src/ksa/solidMotorPhysics.ts` ([engines.md](engines.md)).
**In-game verification of the 5018 output is PENDING** (see the upgrade plan's Phase 8).

### Open gaps from 4892 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

All four 4892 gaps are **✅ FIXED** (per the no-migration rule; detail + game-side evidence in the
plan and the per-area docs): **(A)** the Reactions refactor — `Combustion.xml`/`<CombustionProcess>`
→ `Reactions.xml`/`<Reaction Id>`+`<MixtureRatio>`, flexo re-modeled end-to-end
([engines.md](engines.md#what-changed-in-4892--the-reactions-refactor-rev-48844885));
**(B)** tank `<CombustionProcess>` → `<RoleAffinity>`
([gamedata-modules.md](gamedata-modules.md#what-changed-in-4892)); **(C)** ground-clutter LOD
`<Material Id>` references now REQUIRED — cartoon-moon regenerated
([ground-clutter.md](ground-clutter.md#what-changed-in-4892), in-game re-check pending);
**(D)** `EngineALargeUpperStage` removed from `VOLUMETRIC_EXHAUST_IDS` (LR91 Dev deleted).
Old persisted projects/exports are intentionally discarded (boot purge + strict export-version
check), never converted.

### Gaps history: 4826 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

All three round-trip-fidelity gaps in flexo's **Part-editor** surface are **fixed** (faithful
preservation, per the no-migration rule), each confirmed against the 4826 decomp. They stem from one
game feature cluster: the new **part-symmetry** system (multi-mount adapter prefabs) + hypergolic
service-module tanks. A fourth item lands only on the separate **ground-clutter scaffold** (below).

1. ✅ **`<Diameter>` repeatable** _(DONE)_ — KSA 2026.7 made `<Diameter>` repeatable so adapter prefabs list every size they bridge (e.g. `<Diameter M="3"/><Diameter M="2"/>`). flexo modeled a single value and dropped the rest; now `PartGameData.diameterM` (editable primary) + `extraDiametersM[]` (preserved) round-trip all of them.
2. ✅ **Tank `<CombustionProcess>`** _(DONE)_ — new `<CombustionProcess Id/>` child of `<SphericalTank>` declares the propellant a hypergolic tank holds. flexo rebuilds tanks from a typed model, so it dropped the child; now `Tank.combustionProcessId` parses/emits it.
3. ✅ **Connector `<Sibling>` + GameData `<Aligned>`** _(DONE)_ — new attach-node symmetry grouping. Decomp: `Connector.TemplateBase.SymmetrySiblings` (`[XmlElement("Sibling")] List<ConnectorReference>` → `<Sibling Id/>`) + `PartTemplate.Aligned` (`AlignedConnectorsRef` → `<Aligned><ConnectorRef Id/></Aligned>`). `<Aligned>` (GameData) survives via the `RawXmlNode` passthrough, with its `<ConnectorRef>` ids now remapped through the regenerated connector ids on import/paste (`remapRawConnectorRefs` — verbatim re-emit left them stale after renumbering); `<Sibling>` (geometry `<Connector>` child) was dropped — now `Connector.siblingIds[]` preserves it (same remap).

4. 🟡 **Ground-clutter LOD mesh → atlas** _(WATCH — scaffold only, no flexo source)_ — `GroundClutterLodReference.MeshFileReference` changed type `MeshFileReference` → `MeshAtlasFileReference` and its single `Mesh` became a `Meshes` list (loads ALL meshes in the referenced GLB, skipping `_`-prefixed nodes). The `<Mesh Id=… Path=…/>` element + attrs are **unchanged** (both inherit `FileReference`), so `ksa-mods/cartoon-moon/` still _parses_, but its per-LOD single-card semantics shifted (mesh id now comes from the GLB node name, not `<Mesh Id>`). No flexo core-editor code involved; **re-verify the cartoon-moon mod in-game** before relying on it. Detail: [ground-clutter.md](ground-clutter.md#what-changed-in-4826).

**Not gaps (decomp-verified intact):** engines — `RocketControllerData.cs` changed only `GetAllRocketTemplates` (List→`Span`/`ArrayPool` perf); the thrust/Isp math + `DeLavalNozzleConfig`/`CombustorConfig`/`CombustionTable`/`Combustion.xml` are byte-identical. `PowerReference.cs` only added a `ToNearest` display formatter (tokens/scales unchanged). `Decoupler.cs` changed runtime deactivation (not schema). `KeyframeAnimationModule.cs` only added symmetry-mirroring (`ApplyToMirroredParts`), no schema change. `PbrMaterialReference.cs` unchanged (null-deref gotcha holds). `MeshReference`/`MeshAtlasFileReference` gained multi-primitive **runtime** fields (no `[XmlElement]`) — watch the custom-asset GLB node→SubPart mapping, but flexo's single-primitive exports are unaffected. Fuel-tank `<PartModel>`→`<PartModelDynamic>` + `TFI_Heat` + `<ThinFilm>` (thermal-FX; `catalog.ts:156` already reads either tag). Solar-cell `<Produced W>` 50→100 (data). `CoreIVASpaceAGameData.xml` diff (line-ending only). Runtime `PartSymmetryInstance`/`SymmetryLayerInstance` — vehicle-assembly/save state, out of flexo scope.

---

## Cross-cutting environmental notes

- **OSS / asset availability.** Licensed binaries (kitten characters, `Animations/*.glb`, some
  textures) plus `Reactions.xml` are not in every checkout — flexo serves them from
  its private asset mirror (`flexo-private-assets`, served at `/ksa/` by `vite/ksaAssets.ts`).
  After a game update, re-run `scripts/copy-ksa-assets-to-private-repo.ts` so the editor reads
  the new catalog. Some contracts (e.g. an animation clip's GLB node structure) can only be
  verified against that mirror, not the decomp snapshots.
- **Decompiler noise.** Across this build, many "diffs" are pure decompiler artifacts —
  `"x".AsSpan()`→`"x"`, `Log.Warning($"…")`→`LogString<Warning>` interpolation handlers,
  `Brutal.ShaderCompilerApi`→`Brutal.ShaderCApi`. Always read the actual hunk before treating a
  changed `.cs` as a real change.
