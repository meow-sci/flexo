# Plan — Fix flexo gaps from KSA updates (running)

> **Latest review: `2026.7.8.4980` → `2026.7.9.5018` (see below). BREAKING — and unlike the
> last three updates it was NOT a patch list: KSA changed the SHAPE of how a Part declares
> propellant flow, and flexo's model had no equivalent concept. Every BREAKING / DATA-LOSS /
> MISSING-CAPABILITY / SCHEMA-DRIFT gap is ✅ DONE (implemented across
> [UPGRADE_PLAN_2026-07-24.md](UPGRADE_PLAN_2026-07-24.md) phases 0–7), including the
> long-open part-level `<Tank>` gap. Still 📋 OPEN: geometry-template `<Collider>`
> passthrough, `FuelPort` authoring, the clutter LOD retune (+ its new optional
> `<LOD CastShadows>`), and a solid-motor thrust-curve preview. In-game verification of the
> 5018 output is PENDING.** The earlier `4939 → 4980`, `4892 → 4939`, `4826 → 4892`,
> `4750 → 4826` and `4680 → 4750` reviews follow as history.

---

# 5018 review — `2026.7.8.4980` → `2026.7.9.5018`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — full decomp + shipped
Core XML + private-mirror diff over revs 4981–5016, recorded in
[UPGRADE_PLAN_2026-07-24.md](UPGRADE_PLAN_2026-07-24.md) (which holds the full change register
G1–G13 with game-side anchors, the target model, and the phase-by-phase implementation).

Three load-bearing revs: **4992** (solid rocket motors + connector Capabilities + explicit
engine feed sources), **5002** (solid modules on every booster part,
`HollowOpenSemiEllipsoidMass`, feeding from sub-parts), **5007** (decoupler joints became a
per-connector Capability).

**Why this one was dangerous:** `<Connector>`, `<Combustor>` and `<Tank>` are MODELED
elements, so they never rode the `<PartGameData>` passthrough — every addition was silent
data-loss, and every symptom was a log line rather than a load error. A flexo-exported engine
declared no feed points (dead in-game); a round-tripped Core fuel tank, decoupler or SRB
segment lost its `BulkFluid` / `DecouplerJoint` / `SolidMotorCase`.

## Priority summary (5018)

| # | Gap | Severity | Status | Scope doc |
|---|---|---|---|---|
| F1 | `<Capabilities>` silently dropped from every `<Connector>` (both documents) | BREAKING + DATA-LOSS | ✅ **DONE** — modeled as `Connector.capabilities`, emitted in both docs via one shared helper, merged by id on catalog import, authored in the inspector | [plumbing-and-feeds](../scope/plumbing-and-feeds.md), [connectors](../scope/connectors-coordinates-iva.md#what-changed-in-5018) |
| F2 | `<FeedsFrom>` dropped on `<Combustor>` ⇒ every exported engine reaches no propellant | BREAKING | ✅ **DONE** — `Combustor.feeds`, `createCombustor` defaults to `Parent` | [engines](../scope/engines.md#what-changed-in-5018) |
| F3 | `<Plumbing>` dropped ⇒ RCS thrusters demand `BulkFluid` and get nothing | BREAKING | ✅ **DONE** — `Combustor.plumbing`, `Service` authored from the Engine panel | [engines](../scope/engines.md#what-changed-in-5018) |
| F4 | `<ConsumerFeedWiring>` survived passthrough but its `SubPartId` + child refs went stale on import | BREAKING on import | ✅ **DONE** — modeled + remapped (`src/ksa/idRemap.ts`) | [plumbing-and-feeds](../scope/plumbing-and-feeds.md) |
| F5 | Same stale-reference problem for `<SolidMotor>`/`<SolidGrainSegment>` | BREAKING on import | ✅ **DONE** — modeled + remapped | [plumbing-and-feeds](../scope/plumbing-and-feeds.md) |
| F6 | No solid-motor authoring (`<SolidMotor>`/`<SolidMotorNozzle>`/`<SolidGrainSegment>`) | MISSING-CAPABILITY | ✅ **DONE** — full round-trip + a "Solid motor (SRB)" authoring section | [engines](../scope/engines.md#what-changed-in-5018) |
| F7 | Tanks had no `Id`, so no `<FeedsFrom Container>` could address a flexo tank | MISSING-CAPABILITY | ✅ **DONE** — `Tank.id` on the wrapping element + `<LocationAsmb>` | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-5018) |
| F8 | Part-level `<Tank>` not modeled (carried over as gap **F** from the 4939 review) | MISSING-CAPABILITY | ✅ **DONE** — `PartGameData.tanks` + a Part Data Tanks section | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-5018) |
| F9 | `PLUME_TRAIL_IDS = ['DefaultEngine']` — a dangling id after the template moved/renamed | SCHEMA-DRIFT | ✅ **DONE** — `['DefaultPlumeTrail']` | [engines](../scope/engines.md#what-changed-in-5018) |
| F10 | A `Category="Solid"` custom reaction without burn-rate data CRASHES the mod load | BREAKING (crash-class) | ✅ **DONE** — four fields modeled + round-tripped, seeded on clone, and an unexportable one is SKIPPED with a warning | [engines](../scope/engines.md#what-changed-in-5018) |
| F11 | Multi-token `[Flags]` separator wrong in BOTH directions (pre-existing latent bug) | BREAKING | ✅ **DONE** — emit whitespace, accept either | [connectors](../scope/connectors-coordinates-iva.md#what-changed-in-5018), [docs/xml-io](../docs/xml-io.md) |
| F12 | Vendored fixtures stale (`CoreFuelTankAGameData.xml`, `PartGameData.xml`) | BREAKING (CI) | ✅ **DONE** — re-synced; drift test green | — |
| F13 | `HollowOpenSemiEllipsoidMass` undocumented (passthrough-safe, no code change) | COSMETIC | ✅ **DONE** — recorded | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-5018) |
| F14 | Clutter `<LOD CastShadows>` unused by the cartoon-moon scaffold | COSMETIC (optional) | 📋 **OPEN** — folded into the clutter LOD retune (gap **H**); default `true` preserves today's behavior | [ground-clutter](../scope/ground-clutter.md#what-changed-in-5018) |

**Verified-intact (no action):** ported engine physics — the 13 classes behind
`enginePhysics.ts` are byte-identical, and the constants `9.80665` / `8.31446261815324` /
`101325` are unchanged; the editor-tag registry (`CoreEditorTagsGameData.xml` byte-identical);
animation, kittens and coordinates (no `KeyframeAnimation*`, `Character*`, `QuaternionEx` or
`Double3Ex` change); mod/asset loading (`AssetBundle.cs` gained exactly one line registering
`<GrainGeometry>`; `ThumbnailRenderResources.cs` absent from the diff ⇒ the synthetic
Normal + AoRoughMetal requirement still holds). Runtime-only renames
(`RocketNozzleState.Throttle`→`ThrustFraction`, `ActiveNozzle.ResourceManager`→`Core`,
`RocketCore.ResourceManager` moving down to `Combustor`, …) have no flexo surface.

**Still OPEN across reviews:** geometry-template `<Collider>` passthrough (**E**), `FuelPort`
authoring (**G**), cartoon-moon clutter LOD retune (**H**, now including F14), and — new —
a **solid-motor thrust-curve preview**, which needs a real port of
`SolidMotor.TrySampleThrustCurve` + `GrainGeometryTable` + `SolidGrainSegment.ComputeBurningAreaAtDepth`
(~200 lines) and was deliberately deferred.

**⚠ In-game verification PENDING.** Automated tests cannot prove KSA accepts the output; the
manual checklist is [UPGRADE_PLAN_2026-07-24.md](UPGRADE_PLAN_2026-07-24.md) Phase 8.

---

# 4980 review — `2026.7.6.4939` → `2026.7.8.4980`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — full `git diff 2423a02
cdb7391` inside `ksa-game-assemblies` + `diff -rq` of the 4939/4980 private-mirror `assets/`
trees + per-area contract re-verification (see each scope doc's "What changed in 4980").
`version.json` @ 4980 covers revs 4940–4978: HUD layouts, burn-UI gauge rework, navball
markers, screenshot capture, terrain texture streaming, cascaded-shadow spec constants, and
vehicle-runtime work (docking frame fixes, undock naming, fuel-flow-rule persistence,
event-driven sequence Δv) — none of it crosses flexo's part-template surface.

## Priority summary (4980)

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| A | Core retagged height-affecting celestial textures `Category="Terrain"` → `"TerrainHeight"` (new `TextureCategory` member, rev 4947 — exempts them from the terrain max-size downmip so rendered and collided terrain align); the cartoon-moon Luna-clone block carried the old tags | ✅ **DONE** (was COSMETIC — mod still loads; height textures could be downmipped → render/collision misalignment) | `ksa-mods/cartoon-moon/assets/cartoon_moon.xml` retagged (5 lines: Luna_Normal, Luna_Height, Luna_Biome_ID, Luna_Biome_Control, LunaTestDecalHeight); `build-cartoon-moon.ts` needs no change (clones the Luna block verbatim from Core) | [ground-clutter](../scope/ground-clutter.md#what-changed-in-4980) |

**Verified-intact (no action):** part/subpart templates + editor tags (no `*Template.cs` /
`EditorTagDefinition.cs` in the diff; shipped part XML content-identical — the 8 mirror-file
diffs are CRLF-only sync artifacts; fixtures untouched, drift test green); ported engine
physics + `Reactions.xml` (byte-identical; `SequencePerformanceList` Δv rework and the
`FlowRule` default flip `NearestToFurtherestSameStage`→`FurtherestToNearestSameStage` are
flight-runtime/save-side — flexo has no `FlowRule` surface); animation (no `KeyframeAnimation*`
diff; mirror GLBs byte-identical); kittens (`CharacterRenderResources` hunk = CSM spec constant
only); custom-assets/mod-export (`ThumbnailRenderResources` absent from diff ⇒ synthetic maps
still required; `ENABLE_EMISSIVE` still defined; `ModLibrary` log-noise only;
`TextureCategory.TerrainHeight` additive — parts stay `Vessel`); connectors/coords/IVA +
reference orientation (`QuaternionEx`/`Double3Ex` untouched; `ConnectAndMerge` rewrite keeps
the 180°-Z mate contract; root-identity pin consolidated into `PartTree.NormalizeRootRotation()`
— up-follows-root holds under the new multi-vehicle editor; `ControlTemplate` still an empty
marker — `ControlData.VehicleName`, `FlightComputerData.RCSMode`, RollMode default
`Up`→`Decoupled`, and docking `PreDockRootTransform` are vehicle-save state); ground-clutter
schema (all 7 `*Reference.cs` untouched; shadow-culling/draw-command-ownership changes are
GPU-side). New systems (HUD `LayoutSaves`, `ScreenshotCapture`, `BurnCanvasHost`,
`NavballMarkers`, `CelestialTextureStreamer`, `PartTreeData` vehicle-save shape,
`CollisionAvoidancePair`) are runtime/UI/save surfaces — **no new scope rows needed**.

---

# 4939 review — `2026.7.5.4892` → `2026.7.6.4939`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — full `git diff 7cf5c0a
2423a02` inside `ksa-game-assemblies` + shipped-Core-XML element-path diff + per-area contract
re-verification (see each scope doc's "What changed in 4939"). The update is mostly rendering
(screenspace particles, volumetric plume trails, clutter culling) and vehicle runtime (fuel
lines/ports, tank transfer, sequences); the part-template contract deltas are below. All fixes
follow the no-migration rule.

## Priority summary (4939)

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| A | `<PlumeTrail Id>` on `RocketNozzleTemplate` (Core sets `DefaultEngine` on every main engine; inside flexo's modeled nozzle surface ⇒ silently dropped on import→export) | ✅ **DONE** (was SCHEMA-DRIFT / silent data-loss) | `types.ts` (`plumeTrailId`, `PLUME_TRAIL_IDS`), `partXmlParser.ts`, `partXmlSerializer.ts`, `projectCodec.ts` (`pt`), `EngineSections.tsx` + parser/serializer/codec/catalog tests | [engines](../scope/engines.md#what-changed-in-4939) |
| B | New `Booster` editor tag (registry snapshot stale) | ✅ **DONE** (was SCHEMA-DRIFT) | `types.ts` `EDITOR_TAG_DEFS` + registry-order test | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-4939) |
| C | New asset packs CoreFuelTankB (bays) + CorePropulsionC (large SRBs) not in the catalog file list | ✅ **DONE** (was MISSING-CAPABILITY — parts invisible) | `catalog.ts` `ASSET_FILES` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-4939) |
| D | Vendored fixtures stale after the rev-4934 tank relocation (drift test fails vs the 4939 mirror) | ✅ **DONE** | `src/ksa/__fixtures__/` re-synced (`bun run sync-fixtures`); `partCatalog.test.ts` tank test re-targeted to the Part-level passthrough shape | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-4939) |
| E | Geometry-template `<Collider>` (2 CoreElectricalA `<Part>` prefabs + 2 `<SubPart>` cells) — geometry templates are NOT passthrough; import→export drops the collider (part loses collision in-game) | 📋 **OPEN — SCHEMA-DRIFT** (narrow: bites only when importing those parts) | capture unknown `<Part>` children in `parsePartsFile` (`partCatalog.ts:83`) → thread through `partImport.ts` / `addPart` (`editorStore.ts:640`) → new `EditingPart` field (`types.ts:1390`, triggers the sanctioned boot purge) → re-emit in `serializePart` (`partXmlSerializer.ts:68`) + `projectCodec.ts`/`projectTransfer.ts`; same capture on re-emitted `<SubPart>` templates (NotIVA path) | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-4939) |
| F | Part-LEVEL `<Tank>` (rev 4934: all Core tank data now on `<PartGameData>`, with optional `Id`, `<LocationAsmb>`, first `<SphericalTank>`) — preserved via passthrough but NOT editable; imported Core fuel tanks show no tank UI | 📋 **OPEN — MISSING-CAPABILITY** | add `Tank` to `KNOWN_PART_GAMEDATA_CHILDREN` + parse into a part-level `tanks` list (`partXmlParser.ts:324` `parseGameDataElement`), emit in `serializeGameData` (`partXmlSerializer.ts:96`), `PartGameData.tanks` (`types.ts:616`, boot purge), Part Data dialog UI; model `locationAsmb`/`id` on `Tank` at the same time. Do TOGETHER with gap E so users eat ONE purge | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-4939) |
| G | New `FuelPort` GameData module (`MaxLength` attr + `<AnchorAsmb>`) — passthrough-preserved, opaque to the editor | 📋 **OPEN — MISSING-CAPABILITY (optional)** | model + UI if fuel-port authoring is wanted: `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, Part Data dialog | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-4939) |
| H | Cartoon-moon clutter `<LOD MinScreenSize>` values tuned for the pre-4901 (buggy) LOD selection; Core retuned ~4× | 📋 **OPEN — COSMETIC (advisory)** | retune `scripts/build-cartoon-moon.ts` LOD sizes against the fixed selection during the pending in-game check | [ground-clutter](../scope/ground-clutter.md#what-changed-in-4939) |

**Verified-intact (no action):** ported engine physics + `Reactions.xml` (byte-identical);
animation loader/schema; kittens; custom-assets/mod-export gotchas (`ThumbnailRenderResources`
null-deref unguarded, `ENABLE_EMISSIVE` defined, KTX2/`mod.toml`/`AssetBundle` contract);
connectors/coords/IVA + reference orientation (root still identity-pinned; `<Flags>`/`<Sibling>`
schema unchanged — `<SymmetryGroup>` is GameData sugar, passthrough-safe); ground-clutter schema
(all 7 `*Reference.cs` untouched); `VolumeReference` XML attrs (liters rework is display-only);
`Tank.SaveData.PropellantUseDisabled` + transfer modes (save-state, out of scope); removed
`CoreServiceModuleA_Prefab_MediumServiceModule[A|B]` (no flexo references); `FakeSubstances.xml`/
`FakeCombustion.xml` dropped from Core `mod.toml` (never referenced).

---

# 4892 review — `2026.7.3.4826` → `2026.7.5.4892`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — full `git diff 1265373
7cf5c0a` inside `ksa-game-assemblies` (the on-disk `_prev` tree was stale at 4750; the 4826
baseline came from git history) + shipped-Core-XML diff + per-area contract re-verification.
Headline change: rev 4884 ("!THIS BREAKS SAVED GAMES AND SAVED VEHICLES!") — **combustion
processes refactored into Reactions** (no hardcoded O/F ratio; ThermoToolkit-generated data;
prop-tank affinity). All fixes below follow the no-migration rule (model the new form only;
stale persisted projects are purged at boot by `snapshotMatchesModel`).

## Priority summary (4892)

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| A | Combustion → Reactions refactor (Combustion.xml deleted; `<Combustor><Combustion Id>` → `<Reaction Id>` + required `<MixtureRatio>`; custom propellants `<CombustionProcess>` no longer mapped by `AssetBundle`) | ✅ **DONE** (was BREAKING) | `reactionCatalog.ts` (new, replaces `combustionCatalog.ts`), `enginePhysics.ts`, `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `reactionStore.ts` (replaces `combustionStore.ts`), `editorStore.ts`, `EnginePanel.tsx`, `EngineSections.tsx`, `projectCodec.ts`, `projectTransfer.ts` | [engines](../scope/engines.md#what-changed-in-4892--the-reactions-refactor-rev-48844885) |
| B | Tank `<CombustionProcess>` → `<RoleAffinity>` (ConsumerRole flags) | ✅ **DONE** (was SCHEMA-DRIFT) | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `projectCodec.ts` | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-4892) |
| C | Ground clutter: LOD `<Material Id>` refs REQUIRED (load-time throw), ecotype materials need unique Ids | ✅ **DONE** (was BREAKING for the scaffold) | `scripts/build-cartoon-moon.ts`, `ksa-mods/cartoon-moon/` (regenerated; also fixed the latent shared-`card` GLB mesh-name first-wins collision) | [ground-clutter](../scope/ground-clutter.md#what-changed-in-4892) |
| D | `EngineALargeUpperStage` volumetric exhaust removed (LR91 Dev deleted) | ✅ **DONE** (was COSMETIC — stale dropdown option) | `types.ts` `VOLUMETRIC_EXHAUST_IDS` | [engines](../scope/engines.md#what-changed-in-4892--the-reactions-refactor-rev-48844885) |

### Gap A — Reactions refactor (BREAKING)

- **Contract:** `CombustorTemplate.Combustion: SerializedReference` → `Reaction: ReactionReference`
  (`<Reaction Id>` + optional-but-required-for-mixtures `<MixtureRatio>` text child;
  `ResolveReaction` throws on a ratio-less MixtureReaction and on ThermalReactions).
  `CombustionProcess`/`CombustionTable` class family deleted; `Reactions.xml` ships 6
  `<MixtureReaction>` (2-D O/F×lnP LUTs + `<DefaultMixtureRatio>`), 4 combustor-drivable
  `<FixedReaction>` (incl. `Category="Solid"` APCP/DoubleBase), 6 `<ThermalReaction>` (unusable —
  no thermal core template exists). `AssetBundle` maps the three new element names and no longer
  maps `<CombustionProcess>` — an old-style flexo export would be silently dropped.
- **Fix (DONE):** see [engines.md "What changed in 4892"](../scope/engines.md#what-changed-in-4892--the-reactions-refactor-rev-48844885)
  for the full flexo-side change list (catalog rewrite, `sliceLutAtMixtureRatio` port,
  `Combustor.reactionId`+`mixtureRatio`, custom propellants as `<FixedReaction>`, O/F UI,
  `KNOWN_REACTIONS` snapshot, SRB→APCP, fixtures + mirror re-sync). Regression: `reactionCatalog.test.ts`,
  `enginePhysics.test.ts` (slice port + re-pinned Hydrolox parity ≈ 445.4 s / 932.6 kN),
  `partXmlParser/Serializer.test.ts`, `partCatalog.test.ts` (4892 fixtures).

### Gap B — Tank `<RoleAffinity>` (SCHEMA-DRIFT)

- **Contract:** `AsmbTankTemplate.DefaultCombustionProcess` → `RoleAffinity: ConsumerRole`
  ([Flags] `None|Engine|Thruster`, default `Engine`, XmlSerializer space-separated text).
- **Fix (DONE):** `Tank.roleAffinity: TankRoleAffinity`, token-normalizing parse, emit only at
  non-default, codec key `ra`. Regression: `partXmlParser.test.ts` "tank `<RoleAffinity>`".

### Gap C — Ground-clutter multi-material schema (BREAKING for the scaffold)

- **Contract:** `GroundClutterLodReference.OnDataLoad` now **throws** on a LOD without
  `<Material Id>` references, on concrete LOD materials, and on ref-count ≠ GLB material count;
  `ClutterEcotypeReference.MaterialReferences` is a list and each ecotype `<Material>` needs a
  unique global Id (first-wins namespace now contains Core's `EarthGrassClutterMaterial`,
  `Trunk`, `Leaves`, `Tree0Cards`, `Tree1Cards`).
- **Fix (DONE):** `build-cartoon-moon.ts` emits one `<Material Id="CartoonMoonCrowdMaterial"/>`
  per LOD + the Id'd ecotype material; unique per-character GLB mesh names (`<name>Card`) fix the
  latent first-wins mesh collapse; scaffold regenerated. In-game re-verification pending (next
  KSA session).

### Gap D — Removed volumetric exhaust id (COSMETIC)

- `<VolumetricExhaustTemplate Id="EngineALargeUpperStage">` deleted with the LR91 Dev engine;
  dropped from `VOLUMETRIC_EXHAUST_IDS` so the nozzle FX dropdown no longer offers a dangling id.

### Not gaps (4892, re-verified intact)

- **Animation** (keyframe loader/schema byte-identical; rev-4875 refactor is kitten-skeletal only),
  **kittens** (render resources unchanged), **custom assets / mod export** (thumbnail null-deref,
  `ENABLE_EMISSIVE`, mesh-name contract, mod.toml all stand; `MeshReference.PrimitiveMaterialIds`
  is clutter-only), **connectors/coords/IVA/reference-orientation** (all anchors byte-identical;
  the rev-4876 "ASMB axes gizmo" is a display-only camera nav-ball; fuel links are vehicle-save
  state, not a part surface).
- **Persisted projects:** model shape changed (reaction/tank fields) → old snapshots are
  intentionally discarded by the boot purge, per the constitution.

---

# 4826 review — `2026.6.9.4750` → `2026.7.3.4826`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — full **decomp diff**
(`ksa-game-assemblies` @ 4826 vs `ksa-game-assemblies_prev` @ 4750) **+** shipped-Core-XML diff.
(An early pass mistook a stale checkout for "no 4826 decomp"; every finding below is verified against
the actual 4826 C#.) **One feature cluster** landed between 4751–4826 (undocumented in `version.json`,
recovered from the diffs): the game's new **part-symmetry** system (multi-mount adapter prefabs) +
hypergolic **service-module tanks** — three round-trip-fidelity gaps in flexo's Part-editor surface
(all silent data-loss; flexo rebuilds a fresh DOM from its typed model; none throw), plus one
**ground-clutter scaffold** watch-item. Each Part-editor fix is **faithful preservation** per the
no-migration rule — model the new form, no legacy fallback. The engine physics, animation, kitten,
custom-asset, and coordinate contracts were re-checked against the 4826 decomp and are **intact**
(see [FULL_SCOPE "Not gaps"](../scope/FULL_SCOPE.md#open-gaps-from-4826--plansfix_current_gaps_planmd)).

## Priority summary (4826)

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| A | `<Diameter>` now repeatable — extras dropped | ✅ **DONE** | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `partCatalog.ts`, `editorStore.ts`, `partImport.ts`, `projectCodec.ts` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-4826) |
| B | Tank `<CombustionProcess>` propellant dropped | ✅ **DONE** | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `projectCodec.ts` | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-4826) |
| C | Connector `<Sibling>` grouping dropped (`<Aligned>` already safe) | ✅ **DONE** | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `projectCodec.ts`, `editorStore.ts`, `projectTransfer.ts` | [connectors-coordinates-iva](../scope/connectors-coordinates-iva.md#what-changed-in-4826) |
| D | Ground-clutter LOD mesh → atlas (scaffold, not core) | 🟡 **WATCH** | none (hand-authored `ksa-mods/cartoon-moon/` XML + `scripts/build-cartoon-moon.ts`) | [ground-clutter](../scope/ground-clutter.md#what-changed-in-4826) |

### Gap A — `<Diameter>` repeatable (SCHEMA-DRIFT / round-trip-lossy)

- **Contract:** 4750 `PartTemplate.cs` = single `[XmlElement("Diameter")] DistanceReference? Diameter`. 4826 XML ships **multiple** `<Diameter M/>` per adapter part (e.g. `CoreFairingA_Prefab_InterstageBridge3W2WA` → `3` + `2`; `CoreStructuralA` engine plates). flexo read `directChildren(gd,'Diameter')[0]` and emitted one → the rest silently dropped.
- **Fix (DONE):** first `<Diameter>` → editable `PartGameData.diameterM`; the rest → `PartGameData.extraDiametersM: number[]`, parsed (`partXmlParser.ts:312`) and re-emitted after the primary (`partXmlSerializer.ts:119`). Threaded through `CatalogPart` + the local catalog `PartGameData`, `ImportedGameData` (import merge takes extras with the primary), `setDiameterEnabled(false)` clears them, and codec `xdm`. No multi-value UI (extras ride the primary). Test: `partXmlParser.test.ts` "multi-size adapter".

### Gap B — Tank `<CombustionProcess>` (MISSING-CAPABILITY / round-trip-lossy)

- **Contract (decomp-confirmed):** `AsmbTankTemplate.cs` (base of both tank shapes) gained `[XmlElement("CombustionProcess")] SerializedReference DefaultCombustionProcess` — so any tank may declare it. In shipped 4826 XML it's on 3 service-module `<SphericalTank>`s in `PartGameData.xml` as `<CombustionProcess Id="MMH_NTO_1.6" />`. `<Tank>` is a **modeled** `<SubPartGameData>` child (rebuilt from a typed model, below the passthrough surface), so the nested child was dropped on export.
- **Fix (DONE):** `Tank.combustionProcessId: string | null`, parsed in `tankFromElement` (covers **both** shapes, matching the base-class field), emitted in `buildTankElement` after `<WallThickness>`, persisted as codec `cp`. Not editable yet — preserved verbatim. Test: `partXmlParser.test.ts` "tank `<CombustionProcess>`".

### Gap C — Connector `<Sibling>` + GameData `<Aligned>` (SCHEMA-DRIFT / round-trip-lossy)

- **Contract (decomp-confirmed):** the game's new **part-symmetry** system. `Connector.TemplateBase.SymmetrySiblings` = `[XmlElement("Sibling")] List<ConnectorReference>` → `<Sibling Id/>` (child of the geometry `<Part>`'s `<Connector>`). `PartTemplate.Aligned` = `[XmlElement("Aligned")] List<AlignedConnectorsRef>`; `AlignedConnectorsRef` = `[XmlElement("ConnectorRef")] List<ConnectorReference>` → `<Aligned><ConnectorRef Id/></Aligned>` (child of `<PartGameData>`). The runtime `PartSymmetryInstance`/`SymmetryLayerInstance` are vehicle-assembly/save state, out of flexo scope.
- **`<Aligned>` — INTACT (no code):** not in `KNOWN_PART_GAMEDATA_CHILDREN`, so the gap-6 `RawXmlNode` passthrough already round-trips it. Locked by a regression test.
- **`<Sibling>` — Fix (DONE):** flexo re-emits geometry connectors (`serializePart`→`buildConnectorElement`) with no passthrough on connector children, so it was dropped. Now `Connector.siblingIds: string[]` (parse `connectorsFromPartElement`, emit `buildConnectorElement`, codec `sb`). On import (`addPart`) and project-paste (`projectTransfer`) the ids are **remapped through the regenerated-connector id map**, dropping refs outside the imported set so they never dangle; intra-part duplicate/stamp carry them as-is (same id space). Test: `partXmlParser.test.ts` "`<Sibling>` attach-node grouping".

### Gap D — Ground-clutter LOD mesh → atlas (WATCH — scaffold only)

- **Contract (decomp-confirmed):** `GroundClutterLodReference.MeshFileReference` changed type `MeshFileReference` → `MeshAtlasFileReference`; its single `Mesh` field became `Meshes` (a list — `MeshAtlasFileReference.DoLoad` loads every GLB mesh node, skipping `_`-prefixed, keyed by node name). The `[XmlElement("Mesh")]` name + `Id`/`Path` attrs (from the shared `FileReference` base) are unchanged.
- **Impact:** `ksa-mods/cartoon-moon/`'s `<LOD><Mesh Id Path/></LOD>` still **parses**, but per-LOD semantics shifted from one mesh to a whole atlas. **No flexo core-editor code involved** (clutter is hand-authored mod XML + `scripts/build-cartoon-moon.ts`). **Action:** re-verify the cartoon-moon mod loads + renders in 4826; tweak GLB mesh-node names / mod XML only if it regresses in-game (can't be checked from the decomp).

### Verified NOT gaps (4826, decomp-checked)

- **Engines:** `RocketControllerData.cs` changed only `GetAllRocketTemplates` (`List` → `Span`/`ArrayPool`, perf); thrust/Isp math + `DeLavalNozzleConfig`/`CombustorConfig`/`CombustionTable`/`Combustion.xml` byte-identical.
- **Animation:** `KeyframeAnimationModule.cs` only added `ApplyToMirroredParts` (symmetry mirroring, runtime); schema + GLB loader contract unchanged.
- **Power units:** `PowerReference.cs` only added a `ToNearest` display formatter; tokens/scales unchanged.
- **Custom-assets:** `PbrMaterialReference.cs` unchanged (null-deref gotcha holds); `MeshReference`/`MeshAtlasFileReference` gained multi-primitive **runtime** fields (no `[XmlElement]`) — watch the GLB node→SubPart mapping, but single-primitive exports are unaffected.
- **Kittens:** `CharacterRenderResources.cs` internal-only; `CharacterAssets.xml`/`Characters/` untouched (editor-only aide regardless).
- `CoreFuelTankAAssets.xml` `<PartModel>`→`<PartModelDynamic>` (33×) + `TFI_Heat` KTX2 + `<ThinFilm>` — thermal FX; `catalog.ts:156` reads either tag; meshes referenced by id.
- `CoreElectricalAGameData.xml` solar cell `<Produced W>` 50→100 — pure data (fixture + assertion refreshed).
- `CoreIVASpaceAGameData.xml` — line-ending normalization only.

### Follow-through (4826)

- Vendored fixtures re-synced (`scripts/sync-fixtures`): `CoreElectricalAGameData.xml`, `CoreFuelTankAAssets.xml`, `PartGameData.xml`. Drift test green.
- Scope docs re-baselined to `2026.7.3.4826` (decomp @ 4826); `FULL_SCOPE.md` map + open-gaps updated; every "intact" area re-checked against the real 4826 C#.
- 373 tests pass; typecheck/lint/fmt green.
- **Open follow-up:** (1) re-verify the `ksa-mods/cartoon-moon/` scaffold in-game (Gap D). (2) No editor UI for the three new Part fields (`extraDiametersM`/`combustionProcessId`/`siblingIds`) — deliberate (niche prefab data); revisit if users need to author multi-diameter adapters, assign tank propellants, or edit symmetry groups.

---

# 4750 review — Fix flexo gaps from KSA update 4680 → 4750 (history)

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review of KSA build
`2026.6.8.4680` → `2026.6.9.4750`. Each gap links to the scope doc that defines the contract.
**Why these matter:** flexo is a model-faithful re-emitter — it reads a fixed allow-list and
rebuilds a fresh XML document, so a changed unit token silently round-trips to `0` and an added
element silently vanishes. None of these throw; all are silent correctness/round-trip failures.

> Before starting, re-read [scope/part-and-subpart-xml.md](../scope/part-and-subpart-xml.md#-master-invariant--flexo-rebuilds-a-fresh-dom-now-with-gamedata-passthrough)
> (the no-passthrough invariant) and [scope/gamedata-modules.md](../scope/gamedata-modules.md).
> Follow the mandatory workflow in [AGENTS.md](../AGENTS.md) (fmt → lint → fmt:check → tests) and
> update the matching `scope/*.md` baseline status as each gap closes.

## Priority summary

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| 1 | Electrical unit refactor (`Joules`/`Watts` → `J`/`W`) | ✅ **DONE** (uncommitted) | `partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts` | [gamedata-modules](../scope/gamedata-modules.md) |
| 2 | DockingPort schema (attrs → child elements, impulse→energy) | ✅ **DONE** (uncommitted) | `partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts`, UI | [gamedata-modules](../scope/gamedata-modules.md) |
| 3 | `<Diameter>` part-size element dropped | ✅ **DONE** (uncommitted) | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `partCatalog.ts` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |
| 4 | `<Control>` command marker dropped | ✅ **DONE** (uncommitted) | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `partCatalog.ts` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |
| 5 | Editor-tag list stale + face-snap docs | ✅ **DONE** (uncommitted) | `types.ts`, `EditorTagsField.tsx`, `docs/ksa-part-connector-notes.md` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |
| 6 | Unknown-element passthrough (architectural) | ✅ **DONE** (uncommitted) | `partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts`, `partCatalog.ts`, codec/transfer | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |

**All gaps (1–6) are now implemented** (✅, uncommitted — full details under each section below;
346 tests pass). Gap 6 (unmodeled-XML passthrough) closes the round-trip data-loss for good: the
"model-faithful re-emitter drops what it doesn't model" invariant no longer applies to
`<PartGameData>`/`<SubPartGameData>` child elements + root attributes (they're captured + re-emitted
verbatim). The only remaining items are intentionally out of scope (see each section's notes).

---

## Gap 1 — Electrical unit refactor (BREAKING)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** `partXmlParser.ts` now reads via
> `readEnergyJoules`/`readPowerWatts` (token tables `ENERGY_TOKENS`/`POWER_TOKENS`) over a shared
> `sumUnitChild`; `partXmlSerializer.ts` emits `<MaximumCapacity J>` and `<Produced/Consumed W>`;
> `types.ts` doc-comments updated. Parser + serializer + catalog tests refreshed to the new tokens.
> (Model field names were unchanged.) **Current form only — the plan's legacy `Joules`/`Watts`
> fallback below was intentionally dropped:** flexo models only the current game; stale data is
> purged at boot, never migrated.

**Game change.** `JoulesReference` → `EnergyReference` (energy) + `PowerReference` (power);
`BatteryJouleData` removed. Authored Core data now uses `<MaximumCapacity J="…"/>` and
`<Produced W="…"/>` / `<Consumed W="…"/>`. New token tables (× to SI):
- Energy (`EnergyReference.cs`): `J`×1, `KJ`×1e3, `MJ`×1e6, `GJ`×1e9, `TJ`×1e12, `Ws`×1, `Wh`×3600, `KWh`×3.6e6.
- Power (`PowerReference.cs`): `W`×1, `KW`×1e3, `MW`×1e6, `GW`×1e9, `TW`×1e12.

**Current flexo (wrong both ways).**
- `src/ksa/partXmlParser.ts` `readJoulesValue` (~L188) reads only `Joules` + `Watts` + `KWh×3.6e6` → returns `0` for new Core data → battery/generator/solar/consumer all import as 0.
- `src/ksa/partXmlSerializer.ts` emits `MaximumCapacity Joules=` (~L127), `Produced Watts=` (~L132, ~L226), `Consumed Watts=` (~L138) → the new `EnergyReference`/`PowerReference` ignore these attrs → 0 capacity/output in-game.
- The comment at `partXmlParser.ts` ~L186 ("the game does NOT recognize a bare `W` — only `Watts`") is now exactly backwards.

**Fix.**
1. Split `readJoulesValue` into two unit-aware readers (keep legacy tokens as fallback so old flexo projects + the OLD build still parse):
   - `readEnergyJoules(parent, childTag)` → sum of `J + Ws + Wh×3600 + KWh×3.6e6 + KJ×1e3 + MJ×1e6 + GJ×1e9 + TJ×1e12` **+ legacy `Joules`×1**.
   - `readPowerWatts(parent, childTag)` → `W + KW×1e3 + MW×1e6 + GW×1e9 + TW×1e12` **+ legacy `Watts`×1**.
   - Battery (`MaximumCapacity`) uses energy → `/3600` to Wh; Generator/Solar/Consumer (`Produced`/`Consumed`) use power.
2. Emit new tokens (match Core's authoring):
   - Battery: `<MaximumCapacity J="capacityWh*3600"/>`.
   - Generator/Solar/Consumer: `<Produced W="…"/>` / `<Consumed W="…"/>`.
3. Replace the inverted comment; update the `Battery`/`Generator`/`SolarPanel`/`PowerConsumer`
   doc-comments in `types.ts` (they say `Joules`/`Watts`).

**Tests.** Extend `src/ksa/partXmlParser.test.ts` + `partXmlSerializer.test.ts` with NEW-build
fixtures (`<MaximumCapacity J=…>`, `<Produced W=…>`) **and** a legacy fixture
(`<MaximumCapacity Joules=…>`) to prove the fallback. Round-trip a Core electrical part.

---

## Gap 2 — DockingPort schema (BREAKING)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** Model fields renamed
> `latchingImpulse`/`pushoffForce` → `latchingKineticEnergyJ`/`pushoffImpulseNs` (defaults 50 J /
> 5000 Ns) across `types.ts`, `partXmlParser.ts` (child-element form + `readImpulseNs`),
> `partXmlSerializer.ts` (emits `<ConnectorId Value>` + `<LatchingKineticEnergy J>` +
> `<PushoffImpulse Ns>`), `editorStore.ts` (renamed `DEFAULT_*` consts +
> `setDockingPortLatchingKineticEnergy`/`setDockingPortPushoffImpulse` actions),
> `GameDataSections.tsx` (relabelled fields), `projectCodec.ts` (`ke`/`pi` wire keys), and
> `projectTransfer.ts`. **Current form only — the plan's pre-4750 attribute fallback and the
> `li`/`po` codec migration were intentionally dropped** (flexo models only the current game; stale
> projects are purged at boot, not migrated). In the same pass the entire `projectStore.ts`
> migration system (`migratePart`/`migrateSnapshot`, `capacityKWh`→Wh, string-flags→array) was
> removed; boot-time validation (`snapshotMatchesModel`, now also checking top-level part keys)
> purges any non-current snapshot.

**Game change.** `<DockingPort>` moved from attributes to child elements, with renamed fields and
**new physical quantities** (`DockingPortTemplate.cs`):
```xml
<!-- OLD --> <DockingPort ConnectorId="_c2" LatchingImpulse="6000" PushoffForce="7000"/>
<!-- NEW --> <DockingPort>
               <ConnectorId Value="_c2" />
               <LatchingKineticEnergy J="50" />   <!-- was LatchingImpulse (N·s); now energy (J), default 50 -->
               <PushoffImpulse Ns="7000" />       <!-- was PushoffForce (N);  now impulse (N·s), default 5000 -->
             </DockingPort>
```

**Current flexo (wrong both ways).**
- `types.ts` `DockingPort` = `{ connectorId, latchingImpulse, pushoffForce }`.
- `partXmlSerializer.ts` (~L160-166) emits the dead attribute form → `ConnectorId` unset (now a child) → KSA `IsValid()` false → **docking port silently dropped in-game**.
- `partXmlParser.ts` (~L289-299) reads `dp.getAttribute('ConnectorId')` + `readNum(dp,'LatchingImpulse'|'PushoffForce')` (with a `Force` fallback) → all null on a NEW file → `connectorId=''`, `0`/`0`.

**Fix.** The field rename ripples wider than parse/emit — these are all the touch-points:
1. `src/ksa/types.ts` (~L281-286): rename `DockingPort` fields to `latchingKineticEnergyJ` (default 50) + `pushoffImpulseNs` (default 5000); update the doc-comment.
2. `src/ksa/partXmlSerializer.ts` (~L160-166): emit child elements `<ConnectorId Value=…/>`, `<LatchingKineticEnergy J=…/>`, `<PushoffImpulse Ns=…/>`.
3. `src/ksa/partXmlParser.ts` (~L289-299): read the child elements (reuse the energy reader from Gap 1 for `<LatchingKineticEnergy>`; read `Ns` for `<PushoffImpulse>`), with a **legacy fallback** to the old attributes (`ConnectorId` attr; `LatchingImpulse`/`PushoffForce`/`Force` attrs) so old XML still loads. (The impulse→energy quantity change makes the legacy numeric fallback approximate — acceptable for old in-flexo projects.)
4. `src/state/editorStore.ts` (~L1943-1964): rename `DEFAULT_LATCHING_IMPULSE`/`DEFAULT_PUSHOFF_FORCE` (now 50 J / 5000 Ns) and the `setDockingPortLatchingImpulse`/`setDockingPortPushoffForce` actions/params.
5. `src/ui/GameDataSections.tsx` (~L597,606): rename the bound fields + relabel units (J / N·s).
6. `src/state/projectCodec.ts`: this persists `gameData` (incl. docking port) to localStorage — **renaming fields breaks existing saved projects**. Either (a) add a codec migration that maps old `latchingImpulse`/`pushoffForce` → the new fields, or (b) keep reading the old keys on decode. Don't skip this — silently dropping the values on every saved project is the failure mode.
7. Update the test fixtures that hardcode the old field names: `state/projectCodec.test.ts`, `state/editorStore.test.ts`.

**Tests.** `partXmlParser.test.ts` + `partXmlSerializer.test.ts`: NEW element-form fixture + a
legacy attribute-form fixture; round-trip `CoreCouplingA_Prefab_DockingPort1WA`'s GameData. Add a
`projectCodec.test.ts` case for the old→new field migration.

---

## Gap 3 — `<Diameter>` part-size element (MISSING-CAPABILITY)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** `PartGameData.diameterM: number | null`
> added (`types.ts` + `createEmptyGameData`); `parseGameDataElement` reads `<Diameter>` via the
> existing `readDistanceM` helper (so `M`/`Cm`/etc. all parse, null when absent);
> `serializeGameData` emits `<Diameter M=…/>` in plain meters (matching Core, not flexo's
> Cm-under-1m style) right after `<EditorTag>`. Carried through `partCatalog.ts`
> (`CatalogPart` + local `PartGameData` + `parseGameDataFile` + `mergeGameData`), into the editor
> via `ImportedGameData`/`applyImportedGameData` + `importBuiltInPart`, and persisted by
> `projectCodec` (`dm` key) + `projectTransfer` merge. UI: a "Diameter size class" toggle + numeric
> field in Part Data → Identity (`SizeControlFields`, `setDiameterEnabled`/`setDiameter`, default
> 1 m). Round-trip + catalog + codec + store tests added.

**Game change.** `PartTemplate.cs` added `[XmlElement("Diameter")] DistanceReference? Diameter`.
Core now emits `<Diameter M="…"/>` as a child of `<PartGameData>` on nearly every part (command,
fuel tanks, structural, coupling, fairing, propulsion + the monolithic `PartGameData.xml`). It's
the VAB part-picker **size-class filter** (`DiameterFilterlist` editor tags). No physics effect.

**Current flexo.** No `Diameter` awareness → dropped on round-trip; flexo-authored parts won't
appear under a diameter-filtered catalog view.

**Fix.**
1. `types.ts`: add `diameterM: number | null` to `PartGameData` (+ `null` in `createEmptyGameData`).
2. `partCatalog.ts`: add `diameterM` to its `PartGameData` interface + carry it in `mergeGameData`.
3. `partXmlParser.ts` `parseGameDataElement`: read `<Diameter>` via the existing distance helper
   (the parser already reads `M`/`Cm` distances elsewhere). Core authors `M="0.5"` etc.
4. `partXmlSerializer.ts` `serializeGameData`: when `diameterM != null`, emit `<Diameter M=…/>`
   (plain `M`, matching Core — not flexo's Cm-under-1m style) after `<EditorTag>`.
5. (Optional) surface a "Part diameter (catalog size class)" numeric field in Part Data → Identity.

**Tests.** Round-trip a Core part that carries `<Diameter M=…>` and assert it survives.

---

## Gap 4 — `<Control>` command marker (MISSING-CAPABILITY)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** `PartGameData.controllable: boolean`
> added (default `false`); `parseGameDataElement` sets it from `directChildren(gd, 'Control').length
> > 0`; `serializeGameData` emits a bare `<Control/>` (no attrs/children) after `<CustomMass>` when
> true. Carried through `partCatalog.ts` (OR-merged across PartGameData entries), into the editor via
> `ImportedGameData`/`applyImportedGameData` + `importBuiltInPart`, and persisted by `projectCodec`
> (`co` key) + `projectTransfer` merge. UI: a "Command capable (controllable)" switch in Part Data →
> Identity (`SizeControlFields`, `setControllable`). Round-trip + catalog + codec + store tests added.

**Game change.** New `Control`/`ControlTemplate` module (empty marker). Core adds a bare
`<Control/>` to the capsule's `<PartGameData>` (`CoreCommandAGameData.xml`); it marks a part as
command-capable (`Vehicle.IsControllable`). `ControlTemplate.cs` has no fields.

**Current flexo.** Dropped on round-trip → a re-exported command pod is no longer controllable.

**Fix.**
1. `types.ts`: add `controllable: boolean` to `PartGameData` (default `false`).
2. `partXmlParser.ts`: `game.controllable = directChildren(gd, 'Control').length > 0`.
3. `partXmlSerializer.ts`: emit a bare `<Control/>` when `controllable`.
4. `partCatalog.ts`: carry `controllable` through `mergeGameData`.
5. (Optional) a "Command / Controllable" toggle in Part Data.

**Tests.** Round-trip a `<Control/>`-bearing part; assert the element survives.

---

## Gap 5 — Editor-tag list + face-snapping docs (SCHEMA-DRIFT / docs)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** `KNOWN_EDITOR_TAGS` (`types.ts`) regenerated
> to the exact registry set/order via a new typed `EDITOR_TAG_DEFS` (16 rows, each carrying the
> `NotaCategory` flag) — obsolete `Tanks` dropped, `Fuel Tanks`/`Landing`/`NoFaceSnapping`/`All`
> added. `EditorTagsField.tsx` now groups suggestions into **Categories** vs **Functional** using
> `notaCategory`. Docs: `docs/ksa-part-connector-notes.md` gained a "Face-snapping & editor tags"
> section (data-driven registry, +Z face-snap vs cosmetic +X connector arrow, `DiameterFilterlist`).
> **Decision — static registry, not live parse:** the plan's option-2 live parse of
> `CoreEditorTagsGameData.xml` was intentionally NOT taken — that file isn't synced into the served
> `/ksa/` assets, and the registry only drives freeform autocomplete (no correctness need). A static
> typed snapshot delivers the same suggestion + NotaCategory-grouping behavior with no network/asset
> dependency; modder tags simply aren't auto-suggested (still typeable). Tests in
> `partXmlParser.test.ts` assert the registry order + functional-tag set.

**Game change.** Editor tags are now a data-driven registry: `CoreEditorTagsGameData.xml` defines
16 `<EditorTagDef>` rows (`EditorTagDefinition.cs`), with `NotaCategory` + face-snap booleans;
the built-in `EditorTag` statics (`NoFaceSnapping`/`Tanks`/`Coupling`/`Structural`) were removed
from the game and are now registered from data. Face-snapping (`VehicleEditor.cs`) reads those
booleans and snaps off the part's **+Z** bounding face.

**Current flexo.** `KNOWN_EDITOR_TAGS` (`types.ts` ~L159) is a hardcoded suggestion list with
obsolete `Tanks` (now `Fuel Tanks`) and missing `Landing`/`NoFaceSnapping`/`All`. No data-loss
(tags are freeform passthrough) — stale autocomplete only.

**Fix.**
1. Regenerate `KNOWN_EDITOR_TAGS` to the registry set/order: `Capsules, Engines, RCS, Fuel Tanks,
   Electrical, Coupling, Structural, Landing, Interstage, Passage, Cargo, Lights, Radial,
   NoFaceSnapping, All, Hidden`. Drop `Tanks`.
2. *(Better, optional)* parse `CoreEditorTagsGameData.xml` at catalog-load time (it's a new sibling
   under `/ksa/`) to drive suggestions live, and use `NotaCategory` to group "categories" vs
   "functional" tags in `EditorTagsField.tsx`.
3. Docs: update `docs/ksa-part-connector-notes.md` to note that face-snapping is now data-driven
   via `EditorTagDefinition` (FaceSnap[Target]Blacklist/Whitelist, DiameterFilterlist) and that
   `NoFaceSnapping`/`Coupling`/`Structural`/`Tanks` are no longer hardcoded game-side; the
   connector "+X facing" arrow is cosmetic (the game snaps off the part's +Z face). The
   `<Connector>/<Flags>` schema itself is unchanged → export remains correct.

---

## Gap 6 — Unknown-element passthrough (OPTIONAL, architectural)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** Unmodeled `<PartGameData>` /
> `<SubPartGameData>` **child elements** AND **root attributes** are now captured verbatim on import
> and re-emitted on export. Model: `RawXmlNode` (a JSON tree `{ tag, attrs, children, text? }`) +
> `unknownAttrs: Record<string,string>` / `unknownChildren: RawXmlNode[]` on `PartGameData` and
> `SubPartGameData` (`types.ts`). Parser (`partXmlParser.ts`): `captureUnknownChildren` /
> `captureUnknownAttrs` diff each container's direct children/attrs against the modeled allow-list
> (`KNOWN_PART_GAMEDATA_CHILDREN`/`…_ATTRS`, `KNOWN_SUBPART_GAMEDATA_*`). Serializer
> (`partXmlSerializer.ts`): `buildRawNode` rebuilds them, appended LAST (order-independent to the
> game). Carried through `partCatalog.ts` (catalog + `mergeGameData`), import
> (`ImportedGameData`/`applyImportedGameData`/`importBuiltInPart`), persistence (`projectCodec` `ua`/`uc`
> keys with tolerant `decRawNodes`/`decRawAttrs`, `projectTransfer` merge). This recovers
> real Core data flexo silently dropped: `<Collider>` (every fuel tank), the `SolidSphereMass`/
> `SolidCylinderMass`… mass family, `<IVASeat>`, `<SubstanceStorageVolume>`, and a SubPart's
> `DisplayName` attribute. Round-trip + catalog + codec tests added.
>
> **Design notes / deliberate scope:** captured as a structured JSON tree (NOT a raw XML string) so
> it (a) persists losslessly through the JSON codec and (b) is implementation-agnostic across the
> browser `DOMParser` and the `@xmldom` parser the tests inject (a string serializer would mismatch
> across the two DOM impls). Merge semantics are **fill-if-empty** (a part's leftover XML is treated
> as a unit — first non-empty source wins — never appended/deduped, which would risk duplicate
> `<Collider>`s). Known limitation: a `<SubPart>` child of `<PartGameData>` is "modeled" (gimbal
> overlay), so a `<SubPart>` carrying ONLY non-gimbal unmodeled data is not passed through; mixed
> text+element content isn't preserved (game-data XML has none). This does NOT conflict with the
> no-migration policy ([[no-data-migration]] is about not converting OLD formats; passthrough
> preserves CURRENT unknown game XML on round-trip).

**Problem.** flexo's "read allow-list → rebuild fresh DOM" design means **every** future game
element is a silent round-trip loss until explicitly modeled (today: `<Collider>`, and pre-fix
`<Diameter>`/`<Control>`). Gaps 3–4 are the symptom; this is the cure.

**Fix (stretch).** Capture unmodeled children/attributes on `PartGameData` / `SubPartGameData`
(store cloned `Element`s keyed by parent) in `parseGameDataElement`, and re-append them in
`serializeGameData`. This degrades future additions to harmless pass-through. Decide on ordering/
dedupe semantics so re-emitted unknowns don't collide with modeled ones. Larger change; sequence
after 1–5.

---

## Verified SAFE — do not touch (regression-protect, don't "fix")

The scope review confirmed these are **unchanged** in 4750; changing them would be wrong:
- **Engines** ([engines.md](../scope/engines.md)): `enginePhysics.ts` math/constants/schema are byte-identical to the game; the new thrust-from-template helper corroborates the port. Only the (separate) `<Diameter>` applies.
- **Animation** ([animation.md](../scope/animation.md)): `KeyframeAnimationData.cs` byte-identical; ServiceModule B/C/D are new content the importer already handles. (Pre-existing latent gap: CubicSpline accessor decode — out of scope here.)
- **Kittens** ([kittens.md](../scope/kittens.md)): `CharacterAssets.xml` md5-identical; the eye/glass shader merge confirms the cornea-hide + visor-tint assumptions. Optional doc-comment nit only.
- **Custom assets / mod export** ([custom-assets-and-mod-export.md](../scope/custom-assets-and-mod-export.md)): all schema classes byte-identical; thumbnail null-deref still present (keep synthetic Normal/ORM); mod loader + `mod.toml` unchanged; glow math unchanged. Watch-item: keep an eye on `ENABLE_EMISSIVE` gating, but no action now.
- **Coordinates / IVA-NotIVA / ground clutter**: `QuaternionEx`/`Double3Ex` unchanged (`EULER_ORDER='ZYX'` holds); `PartModel` IVA gate + schema unchanged; the 7 clutter schema classes unchanged.
- **Tank / CustomMass / Inertia / Decoupler**: schema byte-identical (diffs are logging/runtime).

## Suggested sequencing
1. Gap 1 (electrical) + Gap 2 (docking port) together — same two files, both BREAKING, shared
   unit-reader work. Land with new + legacy fixtures.
2. Gap 3 (`<Diameter>`) + Gap 4 (`<Control>`) together — both add a `PartGameData` field + a
   parse/emit pair + a `mergeGameData` carry.
3. Gap 5 (tag list + docs) — small, independent.
4. Gap 6 (passthrough) — optional hardening; do last.

After each: `pnpm test` (the `src/ksa/*.test.ts` encode the contract), `pnpm fmt` / `pnpm lint` /
`pnpm fmt:check`, and update the relevant `scope/*.md` baseline status from 🔴/🟡 to ✅.
