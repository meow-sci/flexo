# Plan — flexo upgrade for KSA `2026.7.9.5018` (the plumbing-topology reckoning)

> **Status:** ✅ **PHASES 0–7 COMPLETE** (2026-07-24). Authored from a full
> `2026.7.8.4980 → 2026.7.9.5018` review (decomp + shipped Core XML + private mirror), then
> implemented phase by phase. Every gap in §2 except the explicitly-deferred ones is closed;
> `scope/` and `docs/` are re-baselined to 5018.
> **📋 PHASE 8 (in-game verification) IS OUTSTANDING** — automated tests cannot prove KSA
> accepts the output. Run the checklist at the bottom of this file and record the result here.
> **Deliberately deferred:** T5.5 (solid thrust-curve preview — a real ~200-line port of
> `SolidMotor.TrySampleThrustCurve` + `GrainGeometryTable`) and T7.3's optional clutter
> `<LOD CastShadows>` (F14, folded into the still-open clutter LOD retune).
>
> **Supersedes** the "4980 = clean bill" entry at the top of
> [FIX_CURRENT_GAPS_PLAN.md](FIX_CURRENT_GAPS_PLAN.md) as the current work item.
> This is **not** a patch list. KSA changed the *shape* of how a Part declares propellant flow;
> flexo's model has no equivalent concept and must grow one.

---

## 0. Read this first (mandatory context for the implementing agent)

### 0.1 Build ids

| Role                       | Build            | Where                                                                                                                  |
| -------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **PREVIOUS** (last vetted) | `2026.7.8.4980`  | `ksa-game-assemblies_prev/current` + `flexo-private-assets_prev/assets`                                                |
| **CURRENT** (target)       | `2026.7.9.5018`  | `ksa-game-assemblies/current` + `flexo-private-assets/assets` (**already synced to 5018** — no mirror re-copy needed)  |

Revision range: **4981 → 5018**. The load-bearing commits are **rev 4992** (solid rocket motors +
connector Capabilities + explicit engine feed sources), **rev 5002** (solid modules on all booster
parts, `HollowOpenSemiEllipsoidMass`, feeding from sub-parts) and **rev 5007** (decoupler joints
became a per-connector Capability).

### 0.2 Non-negotiable project rules (from `AGENTS.md`)

1. **NO MIGRATION CODE.** Never write "read the old form too", never version-gate, never add a
   `migrateX`. When a schema moves, **replace** the old handling. Stale localStorage projects are
   **discarded** by the boot purge (`sanitizeProjectStorage` → `snapshotMatchesModel` in
   `src/state/projectStore.ts`), never converted.
2. **React Compiler rules.** No `useMemo` / `useCallback` / `React.memo` in new code. No
   `new Date()` / `Math.random()` in a render body. Hooks at top level only.
3. **Formatting/linting:** `pnpm run fmt` (oxfmt) and `pnpm run lint` (oxlint). Never Prettier/ESLint.
4. **Run pnpm scripts bare** — no pipes, no compound shell (`pnpm test`, not `pnpm test | tail`).
5. **`scope/*.md` MUST be updated in the same change** as any game-contract change (Phase 7).

### 0.3 The gate you must pass after every phase

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm run fmt:check
```

**Baseline before you start (verified 2026-07-24):** `Test Files 1 failed | 31 passed (32)`,
`Tests 3 failed | 402 passed (405)`. The 3 failures are the vendored-fixture drift test only
(`src/ksa/partCatalog.test.ts` → "vendored fixtures stay byte-identical…"). **Phase 0 fixes
them.** After Phase 0 the suite must be fully green, and must stay green.

### 0.4 Vocabulary used in this document

| Term                | Meaning                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **consumer**        | A `RocketCore` — i.e. a `<Combustor>` or (new) a `<SolidMotor>`. The thing that burns propellant.                |
| **container**       | A `Components` entry that stores propellant: a `<Tank>` or (new) a `<SolidGrainSegment>`. Addressed by its `Id`. |
| **feed point**      | One `<FeedsFrom>` element — where a consumer draws from: a container, a connector, or "my parent part".          |
| **capability**      | A `<Capabilities>` token on a `<Connector>` — what is allowed to flow across that connector.                     |
| **geometry doc**    | The `<Assets><Part>` XML that `serializePart` emits.                                                             |
| **GameData doc**    | The `<Assets><PartGameData>` + `<SubPartGameData>` XML that `serializeGameData` emits.                           |

---

## 1. What changed in the game

### 1.1 The directional change (read this before touching code)

Before 5018, propellant flow was **implicit**: a `Combustor` owned a `ResourceManager` that
searched the whole vehicle for tanks holding its reactants, ranked by a `FlowRule`. Authoring an
engine meant authoring a `<Combustor>` and nothing else.

As of 5018 flow is **explicitly authored plumbing topology**, in three layers:

1. **Connectors gained capabilities** — `Part.Connector.TemplateBase.Capabilities`
   (`ConnectorCapabilityFlags`, `[XmlElement("Capabilities")]`). A connection only carries a
   resource if **both** endpoints declare the capability
   (`Part.Connection.HasCapabilities` → `ConnectorCapabilityExtensions.Intersect`).
   **The default (no `<Capabilities>` authored) is `Electricity | ServiceFluid` — NOT BulkFluid.**
   So a main-engine propellant path is dead unless every connector along it declares `BulkFluid`.

2. **Consumers declare their feed points** — `RocketCoreTemplate.FeedsFrom`
   (`List<FeedsFromReference>`, `[XmlElement("FeedsFrom")]`). `RocketCoreTemplate.OnDataLoad`
   logs `Error: "Rocket core <Id> declares no FeedsFrom feed points; it will reach no propellant"`
   when the list is empty. **A flexo-exported engine today has an empty list ⇒ it is dead in-game.**

3. **Parts wire their sub-parts' consumers** — `PartTemplate.ConsumerFeedWiring`
   (`List<ConsumerFeedWiring>`, `[XmlElement("ConsumerFeedWiring")]`). A reusable SubPart thrust
   chamber says `<FeedsFrom Parent="true"/>`; the Part that places it says
   `<ConsumerFeedWiring Id="ThrustChamber" SubPartId="…"><FeedsFrom Connector="_connector2"/></ConsumerFeedWiring>`.
   Resolution lives in `PartTemplate.ResolveConsumerFeedPoints` / `ResolveConsumerFeeds` /
   `AddResolvedFeed` (`decomp/KSA/PartTemplate.cs`).

Plus a fourth, new-content layer: **solid rocket motors** (`SolidMotorTemplate`,
`SolidMotorNozzleTemplate`, `SolidGrainSegment.TemplateData`, `GrainGeometryTemplate`,
`BurnRateTemplate`), where the "tank" is a stackable `<SolidGrainSegment>` container and stacking
happens across `SolidMotorCase` connectors.

### 1.2 Change register (game-side evidence)

| #   | Change                                                                                                                                                                                                     | Game-side anchor                                                                                                                       | XML                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| G1  | **`<Capabilities>` on every `<Connector>`.** Enum `ConnectorCapabilityFlags : byte { None=0, BulkFluid=1, SolidMotorCase=2, NoElectricity=4, NoServiceFluid=8, DecouplerJoint=0x10 }`. Merged with `\|=` across geometry + GameData (`PartTemplate.ApplyGameData`). Converted at runtime by `ConnectorCapabilityExtensions.ToCapability()` (which *inverts* the two `No…` flags). | `decomp/KSA/Part.cs` ≈181; `ConnectorCapability.cs`, `ConnectorCapabilityFlags.cs`, `ConnectorCapabilityExtensions.cs` (all new)       | `<Connector Id="x"><Capabilities>BulkFluid</Capabilities><Flags>Internal</Flags></Connector>`                          |
| G2  | **Decoupler joints moved onto the connector.** rev 5007 replaced `_decouplerConnections` with the `DecouplerJoint` capability, authored on every Core decoupler connector.                                  | `version.json` rev 5007; `CoreFairingAGameData.xml`, `CoreStructuralAGameData.xml`                                                     | `<Connector Id="_connector1"><Capabilities>DecouplerJoint</Capabilities></Connector>` next to `<Decoupler ConnectorId="_connector1" …/>` |
| G3  | **`<FeedsFrom>` on every rocket core.** `FeedsFromReference` attrs: `Container`, `SubPart`, `Connector`, `Parent` (bool). Validity: **exactly one** of `Container` / `Connector` / `Parent`; `SubPart` only legal alongside `Container`. | `decomp/KSA/RocketCoreTemplate.cs`, `FeedsFromReference.cs` (new)                                                                       | `<Combustor Id="ThrustChamber"><FeedsFrom Parent="true"/>…`, `<FeedsFrom Connector="_connector2"/>`, `<FeedsFrom SubPart="…SegmentA1" Container="Grain"/>` |
| G4  | **`<Plumbing>` on `<Combustor>`.** `PlumbingClass : byte { Bulk=0, Service=1 }` → `Bulk⇒BulkFluid`, `Service⇒ServiceFluid`. Every Core RCS combustor now declares `Service`.                                | `decomp/KSA/CombustorTemplate.cs` ≈15; `PlumbingClass.cs` (new)                                                                        | `<Combustor Id="Chamber"><FeedsFrom Parent="true"/><Plumbing>Service</Plumbing>…`                                      |
| G5  | **`<ConsumerFeedWiring>` on `<PartGameData>`.** `class ConsumerFeedWiring : SubPartIdReference` ⇒ `Id` attr (the consumer's template id) + `SubPartId` attr (the placement instance id; empty ⇒ root part) + `<FeedsFrom>` children. A wiring entry may NOT itself use `Parent="true"`. | `decomp/KSA/ConsumerFeedWiring.cs` (new); `PartTemplate.cs` ≈38                                                                        | `<ConsumerFeedWiring Id="ThrustChamber" SubPartId="CorePropulsionA_Subpart_EngineAMedBoostAssembly1"><FeedsFrom Connector="_connector2"/></ConsumerFeedWiring>` |
| G6  | **Container `Id`s became load-bearing.** `<FeedsFrom Container="X">` resolves against `PartTemplate.Components[].Id` (`ModuleBase.TemplateDataBase.Id`, an `[XmlAttribute]`). `<Tank>` and `<SolidGrainSegment>` are `Components`. | `decomp/KSA/PartTemplate.cs` `AddResolvedFeed`; `ModuleBase.cs` ≈8; `XmlHelper.cs` ≈32 (element name = `[XmlType(TypeName)]`)          | `<Tank Id="PropellantTank">…</Tank>` (`Content/Core/PartGameData.xml`)                                                 |
| G7  | **Solid rocket motors.** New `<SolidMotor>` (a `RocketCoreTemplate`), `<SolidMotorNozzle>` (a `RocketNozzleTemplate`), `<SolidGrainSegment>` (a `Components` container). `<Rocket>` now throws if it mixes solid and liquid parts, and a solid rocket needs ≥1 nozzle. `RocketThrusterControllerTemplate` throws if driven by a `SolidMotor`. | `SolidMotorTemplate.cs`, `SolidMotorNozzleTemplate.cs`, `SolidGrainSegment.cs`, `SolidMotor.cs`, `SolidMotorStack.cs` (all new); `RocketTemplate.cs` ≈20 | see §1.3                                                                                                               |
| G8  | **Grain geometry library.** New top-level `<GrainGeometry>` asset element + `Content/Core/GrainGeometries.xml` with ids `Progressive`, `Neutral`, `Regressive`, `BoostSustain`, `BoostSustainBoost`. Registered in `AssetBundle` and in `mod.toml` (after `Reactions.xml`). | `GrainGeometryTemplate.cs`, `GrainGeometryLibrary.cs`, `DepthCondition.cs` (new); `AssetBundle.cs` ≈59                                 | `<GrainGeometry Id="Neutral"><Name Value/><Shape Value/><Description Value/><DepthCondition>…`                        |
| G9  | **Solid reactions now REQUIRE burn-rate data.** `FixedReactionTemplate` gained `<BurnRate CoefficientMPerS Exponent/>`, `<MinimumBurnPressure>`, `<MaxStablePressure>`, `<ExhaustCondensedFraction>`. For `Category="Solid"` all four are **mandatory** and `Create()` **THROWS** without them. | `decomp/KSA/FixedReactionTemplate.cs` ≈39–110                                                                                          | `Content/Core/Reactions.xml` — `APCP`, `DoubleBase`                                                                    |
| G10 | **PlumeTrail template renamed + moved.** `<PlumeTrailTemplate Id="DefaultEngine"/>` (previously inline in `CorePropulsionAGameData.xml`) was **deleted**. New `Content/Core/PlumeTrailAssets.xml` declares `<PlumeTrailTemplate Id="DefaultPlumeTrail"><EndRadius M="80"/></PlumeTrailTemplate>`. Core removed `<PlumeTrail>` from **every liquid nozzle**; only `SolidMotorNozzle`s carry it. | `PlumeTrailTemplate.cs` (+`EndRadius`); `Content/Core/PlumeTrailAssets.xml` (new); `mod.toml`                                          | `<PlumeTrail Id="DefaultPlumeTrail"/>`                                                                                 |
| G11 | **New inert-mass shape** `HollowOpenSemiEllipsoidMass` (`<Length>`, `<Radius>`, `<WallThickness>`).                                                                                                          | `HollowOpenSemiEllipsoidMassTemplate.cs` (new); `PartTemplate.cs` ≈54                                                                  | `<HollowOpenSemiEllipsoidMass><Material Id/><Length M/><Radius M/><WallThickness Mm/></HollowOpenSemiEllipsoidMass>`  |
| G12 | **Ground clutter LOD gained `CastShadows`** (`[XmlAttribute]`, default `true`).                                                                                                                              | `GroundClutterLodReference.cs` ≈18                                                                                                     | `<LOD CastShadows="false" …>`                                                                                          |
| G13 | **Surface-attach preference.** `Part.UnambiguousSurfaceMount()` + `Connection.ConnectSurfaceMount` — a surface mount now prefers the part's single unconnected `ToSurface` connector.                        | `decomp/KSA/Part.cs` ≈1259, ≈1795                                                                                                      | — (editor behaviour; docs only)                                                                                        |

### 1.3 Reference XML for solid motors (copy these shapes exactly)

`<SubPartGameData>` — a nozzle assembly and a grain segment:

```xml
<SubPartGameData Id="CorePropulsionA_Subpart_SRBSizeANozzleA">
  <HollowOpenCylinderMass>…</HollowOpenCylinderMass>
  <SolidMotorNozzle Id="Nozzle">
    <ExitDiameter M="0.15"/>
    <FxExitDiameter M="0.074098"/>
    <FlowEfficiency Value="0.95"/>
    <ExpansionEfficiency Value="0.98"/>
    <ExhaustLocation X="-0.052842" Y="0" Z="0"/>
    <ExhaustDirection X="-1" Y="0" Z="0"/>
    <VolumetricExhaust Id="EngineALarge"/>
    <SoundEvent Action="On" SoundId="DefaultEngineSoundBehavior"/>
  </SolidMotorNozzle>
</SubPartGameData>

<SubPartGameData Id="CorePropulsionA_Subpart_SRBSizeASmallSegmentA">
  <SolidGrainSegment Id="Grain">
    <Grain>
      <Material Id="Steel.300(s)"/>
      <OuterRadius M="0.125"/>
      <WallThickness Mm="3"/>
      <Length M="0.125"/>
    </Grain>
  </SolidGrainSegment>
</SubPartGameData>
```

`<PartGameData>` — a booster (note: **no `<AreaRatio>` on a `SolidMotorNozzle`**; KSA sizes the
throat as `exitArea / 12`):

```xml
<PartGameData Id="CorePropulsionC_Prefab_SRBDThrustAssemblyA" DisplayName="SRB Size D Thrust Assembly">
  <EditorTag Value="Booster" />
  <Diameter M="1"/>
  <RocketEngineController Id="SRBDMotor">
    <RocketReference Id="Motor"/>
  </RocketEngineController>
  <Rocket Id="Motor">
    <Core Id="MotorCore"/>
    <Nozzle Id="Nozzle" SubPartId="CorePropulsionC_Subpart_SRBSizeDThrustAssemblyA1"/>
  </Rocket>
  <SolidGrainSegment Id="Grain">
    <Grain>
      <Material Id="Steel.300(s)"/>
      <OuterRadius M="1"/>
      <WallThickness Mm="8"/>
      <Length M="0.65227"/>
    </Grain>
  </SolidGrainSegment>
  <SolidMotor Id="MotorCore">
    <Reaction Id="APCP"/>
    <ThermalEfficiency Value="0.95"/>
    <DefaultPressure Bar="70"/>
    <Grain Id="Neutral"/>
    <FeedsFrom Container="Grain"/>
    <FeedsFrom Connector="_connector25"/>
  </SolidMotor>
  <SubPart Id="CorePropulsionC_Subpart_SRBSizeDThrustAssemblyA1">
    <Gimbal><MaxAngleY Degrees="6"/><MaxAngleZ Degrees="6"/><ConstrainToCircle Value="false"/></Gimbal>
  </SubPart>
  <Connector Id="_connector25"><Capabilities>SolidMotorCase</Capabilities></Connector>
  <Collider Id="Collider1">…</Collider>
</PartGameData>
```

### 1.4 Verified INTACT — do not touch

- **Ported engine physics.** `DeLavalNozzleConfig.cs`, `CombustorConfig.cs`, `GasProperties.cs`,
  `NozzlePerformance.cs`, `RocketDesign.cs`, `RocketControllerData.cs`, `EngineDesigner.cs`,
  `DeLavalNozzleTemplate.cs`, `RocketNozzleTemplate.cs`, `MixtureReaction.cs`, `Reaction.cs`,
  `ReactionTemplate.cs`, `FixedReactionTable.cs` are **byte-identical** 4980 → 5018.
  ⇒ `src/ksa/enginePhysics.ts` needs **zero** changes. The constants `9.80665`,
  `8.31446261815324`, `101325` are unchanged.
- **Runtime-only renames** (flexo has no surface for these — ignore them):
  `RocketNozzleState.Throttle`→`ThrustFraction`, `PlumeData.ActualExhaustVelocity`→
  `ApparentExhaustVelocity`, `ActiveNozzle.ResourceManager`→`Core`,
  `Mole.ProduceLiquid`→`ProduceStored`, `ModuleBase.OnPartCreated`→`OnFullPartCreated`,
  `RocketCore.ResourceManager` moved down to `Combustor`.
- **Editor tag registry** — `Content/Core/CoreEditorTagsGameData.xml` is byte-identical.
  `EDITOR_TAG_DEFS` in `types.ts` stays as-is.
- **Animation, kittens, coordinates** — no `KeyframeAnimation*`, `Character*`, `QuaternionEx`,
  or `Double3Ex` change.
- **Mod/asset loader** — `Mod.cs` / `ModLibrary.cs` / `FileReference.cs` / `ShaderReference.cs`
  diffs are log-line-number noise only. `AssetBundle.cs` gained exactly one line
  (`<GrainGeometry>`). `ThumbnailRenderResources.cs` is absent from the diff ⇒ the synthetic
  Normal + AoRoughMetal requirement still holds.
- **Private asset mirror** is already at 5018. Do **not** re-run the copy script. The 7
  `*Assets.xml` mirror diffs vs `_prev` are CRLF-only sync artifacts.
- **`ASSET_FILES`** in `src/ksa/catalog.ts` needs no new entry — `PlumeTrailAssets.xml` and
  `GrainGeometries.xml` declare no `<SubPart>`.

---

## 2. Gap register — what breaks in flexo

Severity keys: **BREAKING** = flexo now produces wrong/dead XML · **DATA-LOSS** = silently dropped
on import→export · **MISSING-CAPABILITY** = can't author a thing the game now needs ·
**SCHEMA-DRIFT** = names/values moved.

| #    | Gap                                                                                                                                                                                                                                                                                        | Severity                       | flexo touch-points                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| F1   | **`<Capabilities>` silently dropped.** `<Connector>` is a *modeled* element in both docs, so it does **not** ride the `RawXmlNode` passthrough. Importing a Core decoupler / fuel tank / SRB segment and re-exporting strips `DecouplerJoint` / `BulkFluid` / `SolidMotorCase`.                | **BREAKING + DATA-LOSS**       | `types.ts` `Connector`; `partXmlParser.ts` `connectorsFromPartElement` ≈116, `parseGameDataElement` ≈383; `partXmlSerializer.ts` `buildConnectorElement` ≈587 + GameData connector loop ≈167; `partCatalog.ts`; `editorStore.ts` `addPart` ≈716; `projectCodec.ts` `encConnector`/`decConnector` ≈178; `projectTransfer.ts` ≈319; `TransformInspector.tsx` `ConnectorHeader` ≈321 |
| F2   | **`<FeedsFrom>` silently dropped on `<Combustor>`.** Every flexo-exported engine now logs `"declares no FeedsFrom feed points; it will reach no propellant"` and produces zero thrust.                                                                                                       | **BREAKING**                   | `types.ts` `Combustor`; `partXmlParser.ts` `combustorFromElement` ≈784; `partXmlSerializer.ts` `buildCombustorElement` ≈379; `projectCodec.ts` `CCombustor` ≈471; `EngineSections.tsx` `CombustorFields` ≈186 |
| F3   | **`<Plumbing>` silently dropped.** An RCS thruster exported by flexo defaults to `Bulk` ⇒ demands `BulkFluid` across connectors that only carry `ServiceFluid` ⇒ no propellant.                                                                                                             | **BREAKING**                   | same as F2                                                                                                                   |
| F4   | **`<ConsumerFeedWiring>` survives passthrough but its references go stale.** It is *not* in `KNOWN_PART_GAMEDATA_CHILDREN`, so it is captured verbatim — but `remapRawConnectorRefs` only rewrites `<ConnectorRef>` / `<Sibling>`. Its `SubPartId` (a placement instance id) and its children's `Connector=` / `SubPart=` / `Container=` attrs are never remapped, so an imported Part's wiring points at ids that no longer exist. | **BREAKING on import**         | `partXmlParser.ts` `KNOWN_PART_GAMEDATA_CHILDREN` ≈582, `remapRawConnectorRefs` ≈653; `editorStore.ts` `applyImportedGameData` ≈567 |
| F5   | **Same stale-reference problem for `<SolidMotor>` / `<SolidGrainSegment>`.** Passthrough-preserved, but `<SolidMotor><FeedsFrom SubPart="…"/>` names a placement instance id that `addPart` regenerates. Worse, `<Rocket>` **is** modeled, so a re-exported SRB gets a live `<Rocket>` pointing at a `<SolidMotor>` whose feed points are broken. | **BREAKING on import**         | as F4, plus `partCatalog.ts`                                                                                                 |
| F6   | **No solid-motor authoring.** `<SolidMotor>`, `<SolidMotorNozzle>`, `<SolidGrainSegment>` cannot be created or edited in flexo.                                                                                                                                                             | **MISSING-CAPABILITY**         | `types.ts`, parser, serializer, codec, `EngineSections.tsx`, `PartDataButton.tsx`                                            |
| F7   | **Tanks have no `Id`.** `buildTankElement` emits `<CylindricalTank>` with no `Id` on the wrapping `<Tank>`, so no `<FeedsFrom Container=…>` can ever address a flexo tank.                                                                                                                  | **MISSING-CAPABILITY**         | `types.ts` `Tank` ≈233 + `createTank` ≈732; parser `tankFromElement` ≈265; serializer ≈239/≈290; `projectCodec.ts` `CTank` ≈376 |
| F8   | **Part-level `<Tank>` not modeled** (carried over as OPEN gap **F** from the 4939 review). Now load-bearing: Core authors all its tank data at Part level and `<FeedsFrom Container=>` must address it.                                                                                      | **MISSING-CAPABILITY**         | `types.ts` `PartGameData`; parser/serializer/codec/UI                                                                        |
| F9   | **`PLUME_TRAIL_IDS = ['DefaultEngine']` is a dangling id.** That template no longer exists in Core.                                                                                                                                                                                         | **SCHEMA-DRIFT**               | `types.ts` ≈456                                                                                                              |
| F10  | **A flexo custom reaction with `Category="Solid"` now CRASHES the mod load.** `FixedReactionTemplate.Create()` throws `"Solid reaction X must specify a BurnRate"` (and again for `MinimumBurnPressure`, `MaxStablePressure`, `ExhaustCondensedFraction`). `createCustomReaction` + the category picker let users pick `Solid`. | **BREAKING (crash-class)**     | `types.ts` `CustomReaction` ≈915; `partXmlParser.ts` `customReactionsFromRoot` ≈446; `partXmlSerializer.ts` `buildFixedReactionElement` ≈509; `EngineSections.tsx` `CustomPropellantCard` ≈888 |
| F11  | **Multi-token `<Flags>` separator is wrong in BOTH directions** (pre-existing latent bug, promoted to BREAKING now that `<Capabilities>` doubles the exposure). .NET's `XmlSerializationReader.ToEnum` splits a `[Flags]` enum body on **whitespace** and **throws** on an unknown constant. flexo emits `"Internal, ToSurface"` ⇒ token `"Internal,"` ⇒ **KSA load exception**. flexo's parser splits on `,` only ⇒ it cannot read a KSA-authored `"Internal ToSurface"`. | **BREAKING**                   | `partXmlSerializer.ts` `flagsString` ≈52; `partXmlParser.ts` `parseConnectorFlags` ≈102                                     |
| F12  | **Vendored fixtures stale** — `CoreFuelTankAGameData.xml` and `PartGameData.xml` changed. 3 tests failing right now.                                                                                                                                                                        | **BREAKING (CI)**              | `src/ksa/__fixtures__/`                                                                                                      |
| F13  | **`HollowOpenSemiEllipsoidMass` unknown to the docs.** Passthrough-safe (flexo never modeled the mass family), so no code change — documentation only.                                                                                                                                       | **COSMETIC**                   | `scope/gamedata-modules.md`                                                                                                  |
| F14  | **Clutter `<LOD CastShadows>` not used by the cartoon-moon scaffold.**                                                                                                                                                                                                                       | **COSMETIC (optional)**        | `scripts/build-cartoon-moon.ts`                                                                                              |

Still-open, unrelated gaps carried forward from 4939 (do **not** attempt here):
**E** geometry-template `<Collider>` passthrough · **G** `FuelPort` authoring · **H** clutter LOD retune.

---

## 3. Target model (design — implement exactly this)

All new/changed types live in `src/ksa/types.ts`. Field names below are normative.

```ts
// ── Connector capabilities ───────────────────────────────────────────────────
export type ConnectorCapability =
  | 'BulkFluid'
  | 'SolidMotorCase'
  | 'NoElectricity'
  | 'NoServiceFluid'
  | 'DecouplerJoint'

export const CONNECTOR_CAPABILITIES: readonly ConnectorCapability[] = [
  'BulkFluid', 'SolidMotorCase', 'NoElectricity', 'NoServiceFluid', 'DecouplerJoint',
]

export interface Connector extends Transform {
  id: string
  flags: ConnectorFlag[]
  capabilities: ConnectorCapability[]   // NEW
  siblingIds: string[]
  layerId: string
}

// ── Feed points ──────────────────────────────────────────────────────────────
export type FeedSource =
  | { kind: 'container'; containerId: string; subPartInstanceId: string | null }
  | { kind: 'connector'; connectorId: string }
  | { kind: 'parent' }

export type PlumbingClass = 'Bulk' | 'Service'

export interface ConsumerFeedWiring {
  /** `<ConsumerFeedWiring Id>` — the consumer's TEMPLATE id (e.g. "ThrustChamber"). */
  consumerId: string
  /** `<ConsumerFeedWiring SubPartId>` — placement instanceId; null ⇒ the root part. */
  subPartInstanceId: string | null
  /** `<FeedsFrom>` children. MUST NOT contain `{ kind: 'parent' }` (KSA errors). */
  feeds: FeedSource[]
}

// ── Combustor gains feeds + plumbing ─────────────────────────────────────────
export interface Combustor {
  /* …all existing fields unchanged… */
  feeds: FeedSource[]        // NEW — <FeedsFrom>
  plumbing: PlumbingClass    // NEW — <Plumbing>; 'Bulk' is the schema default
}

// ── Tanks gain an id + a placement offset ────────────────────────────────────
export interface Tank {
  /** `<Tank Id>` — addressable by `<FeedsFrom Container=…>`. '' ⇒ emit no Id. */
  id: string                 // NEW
  /** `<LocationAsmb X Y Z>` inside the shape element (AsmbTransformTemplate). */
  locationAsmb: Vec3         // NEW
  /* …shape / wallMaterialId / lengthM / outerRadiusM / wallThicknessMm / roleAffinity… */
}

// ── Solid rocket motors ──────────────────────────────────────────────────────
export interface SolidMotor {
  id: string                   // <SolidMotor Id>
  reactionId: string           // <Reaction Id> — MUST be a Solid FixedReaction
  thermalEfficiency: number    // <ThermalEfficiency Value>, default 1
  defaultPressurePa: number    // <DefaultPressure>, default 7_000_000, emitted as Bar
  grainGeometryId: string      // <Grain Id>; '' ⇒ omit (library default)
  feeds: FeedSource[]          // <FeedsFrom>
}

export interface SolidMotorNozzle {
  id: string
  exitDiameterM: number        // default 1
  fxExitDiameterM: number | null
  flowEfficiency: number       // default 1
  expansionEfficiency: number  // default 1
  exhaustLocation: Vec3        // default (0,0,0)
  exhaustDirection: Vec3       // default (-1,0,0)
  fxExhaustLocation: Vec3 | null
  fxExhaustDirection: Vec3 | null
  volumetricExhaustId: string | null
  plumeTrailId: string | null
  exhaustLight: boolean        // default true
  sound: RocketSoundEvent | null
  // NOTE: deliberately NO areaRatio — KSA derives throat = exitArea / 12.
}

export interface SolidGrainSegment {
  id: string                   // <SolidGrainSegment Id> — a feedable container id
  wallMaterialId: string       // <Grain><Material Id>
  outerRadiusM: number         // <Grain><OuterRadius M>
  wallThicknessMm: number      // <Grain><WallThickness Mm>
  lengthM: number              // <Grain><Length M>
  locationAsmb: Vec3           // <Grain><LocationAsmb X Y Z>
}

/** Core's shipped `<GrainGeometry>` ids (static snapshot of GrainGeometries.xml @ 5018). */
export const GRAIN_GEOMETRY_IDS: readonly string[] = [
  'BoostSustain', 'BoostSustainBoost', 'Neutral', 'Progressive', 'Regressive',
]

// ── Reactions ────────────────────────────────────────────────────────────────
export const PLUME_TRAIL_IDS: readonly string[] = ['DefaultPlumeTrail']   // was ['DefaultEngine']

export interface BurnRateLaw {
  /** `<BurnRate CoefficientMPerS>` — must be > 0. */
  coefficientMPerS: number
  /** `<BurnRate Exponent>` — must be >= 0 and < 0.95. */
  exponent: number
}

export interface CustomReaction {
  /* …existing id / name / category / reactants / lut… */
  /** REQUIRED when category === 'Solid'; null otherwise. */
  burnRate: BurnRateLaw | null                  // NEW
  minimumBurnPressurePa: number | null          // NEW — required for Solid, must be > 0
  maxStablePressurePa: number | null            // NEW — required for Solid, must be > minimumBurnPressurePa
  exhaustCondensedFraction: number | null       // NEW — required for Solid, [0, 1)
}

// ── PartGameData / SubPartGameData additions ─────────────────────────────────
export interface PartGameData {
  /* …existing… */
  tanks: Tank[]                              // NEW (F8) — part-level <Tank>
  consumerFeedWiring: ConsumerFeedWiring[]   // NEW (F4)
  solidMotors: SolidMotor[]                  // NEW
  solidNozzles: SolidMotorNozzle[]           // NEW
  solidGrainSegments: SolidGrainSegment[]    // NEW
}

export interface SubPartGameData {
  /* …existing… */
  solidMotors: SolidMotor[]                  // NEW
  solidNozzles: SolidMotorNozzle[]           // NEW
  solidGrainSegments: SolidGrainSegment[]    // NEW
}
```

### 3.1 Defaults (normative)

| Factory                       | New field values                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `createTank()`                | `id: ''`, `locationAsmb: { x: 0, y: 0, z: 0 }`                                                                       |
| `createCombustor(id)`         | `feeds: [{ kind: 'parent' }]`, `plumbing: 'Bulk'`                                                                    |
| `createEmptyGameData()`       | `tanks: []`, `consumerFeedWiring: []`, `solidMotors: []`, `solidNozzles: []`, `solidGrainSegments: []`               |
| `createSubPartGameData(id)`   | `solidMotors: []`, `solidNozzles: []`, `solidGrainSegments: []`                                                      |
| `createCustomReaction(id, n)` | `burnRate: null`, `minimumBurnPressurePa: null`, `maxStablePressurePa: null`, `exhaustCondensedFraction: null`       |
| **new** `createSolidMotor(id)`        | `reactionId: 'APCP'`, `thermalEfficiency: 0.95`, `defaultPressurePa: 7_000_000`, `grainGeometryId: 'Neutral'`, `feeds: []` |
| **new** `createSolidMotorNozzle(id)`  | `exitDiameterM: 1`, `fxExitDiameterM: null`, `flowEfficiency: 0.95`, `expansionEfficiency: 0.98`, `exhaustLocation: {0,0,0}`, `exhaustDirection: {-1,0,0}`, `fxExhaustLocation: null`, `fxExhaustDirection: null`, `volumetricExhaustId: null`, `plumeTrailId: 'DefaultPlumeTrail'`, `exhaustLight: true`, `sound: null` |
| **new** `createSolidGrainSegment(id)` | `wallMaterialId: 'Steel.300(s)'`, `outerRadiusM: 0.5`, `wallThicknessMm: 6`, `lengthM: 1`, `locationAsmb: {0,0,0}`  |

### 3.2 One purge, not five

Adding keys to `PartGameData` / `SubPartGameData` / `EditingPart` makes
`snapshotMatchesModel` reject every stored project, which is the sanctioned no-migration
behaviour. **Therefore every `types.ts` change in this plan lands in ONE commit (Phase 1)** so
users eat exactly one purge. Do not spread model additions across phases.

---

## Phase 0 — Re-baseline the test fixtures

**Goal:** get the suite green before touching any source. No `src/` changes.

### T0.1 — Re-sync the vendored fixtures

```sh
cd scripts
bun run sync-fixtures
```

(`scripts/` is a **Bun-only** workspace — do not use pnpm there.)

Expected: `src/ksa/__fixtures__/CoreFuelTankAGameData.xml` and
`src/ksa/__fixtures__/PartGameData.xml` are rewritten. The other three fixture files are already
byte-identical and must not change.

### T0.2 — Re-point the fixture-derived assertions

`src/ksa/partCatalog.test.ts` asserts against fixture content. After T0.1 the fixtures contain
new elements. Run `pnpm test` and fix **only** assertions that now mismatch, by updating the
expected values to the 5018 content. Specifically expect these to need attention:

- Any assertion over `CoreFuelTankA_Prefab_LF1W1HA`'s connectors — those connectors now carry
  `<Capabilities>BulkFluid</Capabilities>`. In Phase 0 the parser still ignores it, so the parse
  result is unchanged; if a test compares raw XML strings, update the expected string.
- Any assertion over `PartGameData.xml`'s MMU RCS combustors — they now carry `<FeedsFrom>` and
  `<Plumbing>`, and the `<Tank>` gained `Id="PropellantTank"`.

### T0.3 — Gate

`pnpm test` must report **0 failures**. Commit as `chore(fixtures): re-sync vendored KSA fixtures to 2026.7.9.5018`.

---

## Phase 1 — Model expansion (the single purge)

**Goal:** land every `types.ts` change from §3 plus every construction site that must compile.
**No parsing, no serializing, no UI yet.** After this phase the app builds and runs; imported
parts simply carry empty new fields.

### T1.1 — `src/ksa/types.ts`: connector capabilities

1. Directly under the existing `CONNECTOR_FLAGS` export (≈line 57) add the
   `ConnectorCapability` type + `CONNECTOR_CAPABILITIES` const from §3, with a doc comment citing
   `decomp/KSA/ConnectorCapabilityFlags.cs` and stating: *"empty ⇒ KSA's default
   `Electricity | ServiceFluid`; `NoElectricity` / `NoServiceFluid` are inverted at load by
   `ConnectorCapabilityExtensions.ToCapability()`."*
2. Add `capabilities: ConnectorCapability[]` to `interface Connector` (≈line 60), documented as
   *"`<Capabilities>` — merged with `|=` across the geometry `<Part>` and `<PartGameData>`."*

### T1.2 — `src/ksa/types.ts`: feed sources, plumbing, consumer wiring

Add the `FeedSource`, `PlumbingClass` and `ConsumerFeedWiring` declarations from §3, placed
immediately **above** the `ENGINES` block comment (≈line 379). Doc comments must cite
`decomp/KSA/FeedsFromReference.cs`, `PlumbingClass.cs`, `ConsumerFeedWiring.cs` and record the
validity rule (*exactly one of Container / Connector / Parent; `SubPart` only with `Container`*).

Add a helper right after `FeedSource`:

```ts
/** True when a feed source names a target KSA can resolve (drop invalid ones on export). */
export function isFeedSourceValid(f: FeedSource): boolean {
  if (f.kind === 'container') return f.containerId.trim().length > 0
  if (f.kind === 'connector') return f.connectorId.trim().length > 0
  return true
}
```

### T1.3 — `src/ksa/types.ts`: `Combustor` gains `feeds` + `plumbing`

Add both fields to `interface Combustor` (≈line 495) and set them in `createCombustor` (≈line 817)
per §3.1.

### T1.4 — `src/ksa/types.ts`: `Tank` gains `id` + `locationAsmb`

Add both to `interface Tank` (≈line 233) and `createTank()` (≈line 732) per §3.1. Document `id`
as *"addressable by `<FeedsFrom Container=…>` since 5018; KSA resolves it against
`PartTemplate.Components[].Id`."*

### T1.5 — `src/ksa/types.ts`: solid-motor types

Add `SolidMotor`, `SolidMotorNozzle`, `SolidGrainSegment`, `GRAIN_GEOMETRY_IDS` and the three
factories from §3/§3.1, placed after the `Gimbal` interface (≈line 600). Document that
`SolidMotorNozzle` has **no** `AreaRatio` (KSA sizes throat = exitArea/12, see
`SolidMotorNozzleTemplate.Create`).

### T1.6 — `src/ksa/types.ts`: reaction burn-rate fields

Add `BurnRateLaw` and the four new `CustomReaction` fields from §3; default them to `null` in
`createCustomReaction`. Add above `CustomReaction`:

```ts
/**
 * KSA REQUIRES burn-rate data on a `Category="Solid"` FixedReaction — `FixedReactionTemplate.Create()`
 * THROWS (mod fails to load) when `<BurnRate>`, `<MinimumBurnPressure>`, `<MaxStablePressure>` or
 * `<ExhaustCondensedFraction>` is missing. Reference values from Core's `Reactions.xml` @ 5018:
 *   APCP       — a=0.0045 m/s, n=0.35, min 15 bar, max 150 bar, condensed 0.33696528908145584
 *   DoubleBase — a=0.0024 m/s, n=0.65, min 30 bar, max 100 bar, condensed 0
 */
export function isCustomReactionExportable(r: CustomReaction): boolean {
  if (r.category !== 'Solid') return true
  return (
    r.burnRate != null &&
    r.burnRate.coefficientMPerS > 0 &&
    r.burnRate.exponent >= 0 &&
    r.burnRate.exponent < 0.95 &&
    r.minimumBurnPressurePa != null &&
    r.minimumBurnPressurePa > 0 &&
    r.maxStablePressurePa != null &&
    r.maxStablePressurePa > r.minimumBurnPressurePa &&
    r.exhaustCondensedFraction != null &&
    r.exhaustCondensedFraction >= 0 &&
    r.exhaustCondensedFraction < 1
  )
}
```

### T1.7 — `src/ksa/types.ts`: `PLUME_TRAIL_IDS`

Replace `['DefaultEngine']` with `['DefaultPlumeTrail']` (≈line 461) and update the doc comment:
*"Core 5018 moved the template to `PlumeTrailAssets.xml` and now assigns it only to solid-motor
nozzles; liquid nozzles carry none."*

### T1.8 — `src/ksa/types.ts`: `PartGameData` / `SubPartGameData` lists

1. Add the five new `PartGameData` arrays and three new `SubPartGameData` arrays from §3.
2. Initialise them in `createEmptyGameData()` (≈line 776) and `createSubPartGameData()` (≈line 802).
3. Extend `isSubPartGameDataEmpty()` (≈line 718) with:
   `spd.solidMotors.length === 0 && spd.solidNozzles.length === 0 && spd.solidGrainSegments.length === 0 &&`

### T1.9 — Make every construction site compile

Run `pnpm typecheck` and fix each error by supplying the new fields. The known sites are:

| File                              | What to add                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/ksa/partXmlParser.ts`        | `connectorsFromPartElement` → `capabilities: []` (real parsing lands in Phase 2)                                          |
| `src/ksa/partXmlSerializer.ts`    | nothing yet (it only reads fields)                                                                                        |
| `src/state/editorStore.ts`        | connector creation in `addConnector` / `addPart` / paste paths (≈716, ≈979, ≈1081) → `capabilities: [...src.capabilities]` or `capabilities: []` for fresh connectors; `ImportedGameData` interface + `applyImportedGameData` for the new `PartGameData` lists |
| `src/state/projectCodec.ts`       | `decConnector` → `capabilities: []`; `decTank` → `id: ''`, `locationAsmb: {0,0,0}`; `decCombustor` → `feeds: []`, `plumbing: 'Bulk'`; `decGameData` / `decSubPartGameData` → the new arrays. Real encoding lands in Phase 3 |
| `src/state/projectTransfer.ts`    | connector clone ≈319 → `capabilities: [...(src.capabilities ?? [])]`; game-data merge → new arrays                        |
| `src/ksa/partCatalog.ts`          | `CatalogPart` + `PartGameData` (the catalog-local one) + `parsePartsFile` + `parseGameDataFile` + `mergeGameData` → new fields, defaulted empty |
| `src/ksa/*.test.ts`               | Any inline object literal typed as `Connector` / `Tank` / `Combustor` / `PartGameData` / `SubPartGameData`               |

**Rule for this task:** where a field's real value is not yet available, use the §3.1 default.
Do **not** invent parsing here.

### T1.10 — Gate

`pnpm test && pnpm typecheck && pnpm lint && pnpm run fmt:check`, all green.
Commit as `feat(model): expand Part model for KSA 5018 plumbing topology + solid motors`.

---

## Phase 2 — XML parse + serialize

**Goal:** perfect round-trip of the new schema. Import a Core SRB / decoupler / RCS pod, export,
and the emitted XML is semantically identical to Core's.

### T2.1 — Fix the `[Flags]` enum separator (F11) — **do this first**

`src/ksa/partXmlParser.ts` ≈102:

```ts
export function parseConnectorFlags(raw: string | null | undefined): ConnectorFlag[] {
  if (!raw) return []
  return raw
    .split(/[\s,]+/)                       // .NET ToEnum splits on whitespace; tolerate commas too
    .map((s) => s.trim() as ConnectorFlag)
    .filter((f) => CONNECTOR_FLAG_SET.has(f))
}
```

`src/ksa/partXmlSerializer.ts` ≈52:

```ts
/**
 * Space-joined flag list (e.g. "Internal ToSurface"), or null when empty.
 * MUST be spaces, not commas: .NET's `XmlSerializationReader.ToEnum` splits a [Flags] enum body
 * on whitespace and THROWS `CreateUnknownConstantException` on any unrecognised token, so a
 * comma-joined body ("Internal, ToSurface") fails KSA's mod load outright.
 */
function flagsString(flags: readonly ConnectorFlag[]): string | null {
  return flags.length > 0 ? flags.join(' ') : null
}
```

Add a regression test in `src/ksa/partXmlSerializer.test.ts`:
*"multi-flag connectors emit a space-separated `<Flags>` body"* — build a connector with
`flags: ['Internal', 'ToSurface']`, serialize both documents, assert both contain
`<Flags>Internal ToSurface</Flags>` and neither contains a comma inside `<Flags>`.

Add a matching parser test: `parseConnectorFlags('Internal ToSurface')` →
`['Internal', 'ToSurface']`.

### T2.2 — Parse + emit `<Capabilities>` (F1)

**Parser** — `src/ksa/partXmlParser.ts`:

1. Add next to `CONNECTOR_FLAG_SET` (≈96):

```ts
const CONNECTOR_CAPABILITY_SET = new Set<ConnectorCapability>(CONNECTOR_CAPABILITIES)

/**
 * Parses a whitespace-separated `<Capabilities>` body (KSA's `ConnectorCapabilityFlags`) into the
 * recognized tokens, preserving order and dropping unknowns. Empty ⇒ KSA's implicit
 * `Electricity | ServiceFluid` default.
 */
export function parseConnectorCapabilities(
  raw: string | null | undefined,
): ConnectorCapability[] {
  if (!raw) return []
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim() as ConnectorCapability)
    .filter((c) => CONNECTOR_CAPABILITY_SET.has(c))
}
```

2. In `connectorsFromPartElement` (≈116) set
   `capabilities: parseConnectorCapabilities(directChildren(conn, 'Capabilities')[0]?.textContent)`.
3. In `ParsedGameData` (≈142) add
   `connectorCapabilities: Map<string, ConnectorCapability[]>` alongside `connectorFlags`.
4. In `parseGameDataElement` (≈383) populate it in the same `<Connector>` loop:

```ts
const connectorFlags = new Map<string, ConnectorFlag[]>()
const connectorCapabilities = new Map<string, ConnectorCapability[]>()
for (const conn of directChildren(gd, 'Connector')) {
  const connId = conn.getAttribute('Id')
  if (!connId) continue
  const flags = parseConnectorFlags(directChildren(conn, 'Flags')[0]?.textContent)
  if (flags.length > 0) connectorFlags.set(connId, flags)
  const caps = parseConnectorCapabilities(directChildren(conn, 'Capabilities')[0]?.textContent)
  if (caps.length > 0) connectorCapabilities.set(connId, caps)
}
```

Return it from `parseGameDataElement` and initialise it to an empty `Map` in `gameDataFromAssets`.

**Serializer** — `src/ksa/partXmlSerializer.ts`. Extract one shared helper and call it from BOTH
connector emitters so the two documents never drift:

```ts
/** Appends `<Flags>`/`<Capabilities>` to a `<Connector>` element (shared by both documents). */
function appendConnectorTokens(doc: XmlDocument, el: XmlElement, connector: Connector): void {
  const flags = flagsString(connector.flags)
  if (flags) {
    const flagsEl = doc.createElement('Flags')
    flagsEl.appendChild(doc.createTextNode(flags))
    el.appendChild(flagsEl)
  }
  // <Capabilities> — KSA ORs the geometry and GameData values, so emitting in both is idempotent.
  if (connector.capabilities.length > 0) {
    const capsEl = doc.createElement('Capabilities')
    capsEl.appendChild(doc.createTextNode(connector.capabilities.join(' ')))
    el.appendChild(capsEl)
  }
}
```

Call it in `buildConnectorElement` (≈587, after the `<Transform>`, before the `<Sibling>` loop)
and in the GameData connector loop (≈167), replacing the inline `<Flags>` blocks.

### T2.3 — Parse + emit `<FeedsFrom>` and `<Plumbing>` (F2, F3)

Add to `src/ksa/partXmlParser.ts` (near the other engine helpers, ≈776):

```ts
/**
 * Parses one `<FeedsFrom>` element (KSA `FeedsFromReference`). Exactly one of
 * Container / Connector / Parent must be set; `SubPart` is only meaningful with `Container`.
 * Returns null for a malformed element (KSA logs an error for the same shape).
 */
function feedFromElement(el: Element): FeedSource | null {
  const container = el.getAttribute('Container')?.trim() ?? ''
  const connector = el.getAttribute('Connector')?.trim() ?? ''
  const parent = (el.getAttribute('Parent') ?? '').trim().toLowerCase() === 'true'
  const set = (container ? 1 : 0) + (connector ? 1 : 0) + (parent ? 1 : 0)
  if (set !== 1) return null
  if (container) {
    const subPart = el.getAttribute('SubPart')?.trim() ?? ''
    return { kind: 'container', containerId: container, subPartInstanceId: subPart || null }
  }
  if (connector) return { kind: 'connector', connectorId: connector }
  return { kind: 'parent' }
}

/** All `<FeedsFrom>` children of an element, malformed entries dropped. */
function feedsFromElement(el: Element): FeedSource[] {
  return directChildren(el, 'FeedsFrom')
    .map(feedFromElement)
    .filter((f): f is FeedSource => f != null)
}
```

In `combustorFromElement` (≈784) add:

```ts
feeds: feedsFromElement(el),
plumbing: directChildren(el, 'Plumbing')[0]?.textContent?.trim() === 'Service' ? 'Service' : 'Bulk',
```

Add to `src/ksa/partXmlSerializer.ts` (near the other engine builders):

```ts
/** `<FeedsFrom Container|SubPart|Connector|Parent/>` — one element per feed point. */
function buildFeedElements(doc: XmlDocument, feeds: readonly FeedSource[]): XmlElement[] {
  const out: XmlElement[] = []
  for (const f of feeds) {
    if (!isFeedSourceValid(f)) continue
    const el = doc.createElement('FeedsFrom')
    if (f.kind === 'container') {
      // KSA reads SubPart BEFORE Container; attribute order is irrelevant to XmlSerializer.
      if (f.subPartInstanceId) el.setAttribute('SubPart', f.subPartInstanceId)
      el.setAttribute('Container', f.containerId)
    } else if (f.kind === 'connector') {
      el.setAttribute('Connector', f.connectorId)
    } else {
      el.setAttribute('Parent', 'true')
    }
    out.push(el)
  }
  return out
}
```

In `buildCombustorElement` (≈379), emit the feeds **first** (matching Core's authoring order:
`<FeedsFrom>` then `<Plumbing>` then `<Reaction>`), and `<Plumbing>` only when `Service`:

```ts
const el = doc.createElement('Combustor')
el.setAttribute('Id', c.id)
for (const f of buildFeedElements(doc, c.feeds)) el.appendChild(f)
if (c.plumbing === 'Service') {
  const plumbing = doc.createElement('Plumbing')
  plumbing.appendChild(doc.createTextNode('Service'))
  el.appendChild(plumbing)
}
// …existing <Reaction> / <MaxPressure> / … unchanged…
```

### T2.4 — Parse + emit `<ConsumerFeedWiring>` (F4)

1. `src/ksa/partXmlParser.ts`: add `'ConsumerFeedWiring'` to `KNOWN_PART_GAMEDATA_CHILDREN`
   (≈582) — it stops being passthrough.
2. In `parseGameDataElement`, after the engine-module parse:

```ts
for (const w of directChildren(gd, 'ConsumerFeedWiring')) {
  game.consumerFeedWiring.push({
    consumerId: w.getAttribute('Id') ?? '',
    subPartInstanceId: w.getAttribute('SubPartId') || null,
    // KSA errors on a Parent="true" inside a wiring entry — drop it here.
    feeds: feedsFromElement(w).filter((f) => f.kind !== 'parent'),
  })
}
```

3. `src/ksa/partXmlSerializer.ts`: in `serializeGameData`, after the gimbal loop and **before**
   the `unknownChildren` loop:

```ts
for (const w of game.consumerFeedWiring) {
  if (!w.consumerId.trim()) continue
  const feeds = buildFeedElements(doc, w.feeds)
  if (feeds.length === 0) continue // KSA errors on a wiring entry that wires no feed points
  const el = doc.createElement('ConsumerFeedWiring')
  el.setAttribute('Id', w.consumerId)
  if (w.subPartInstanceId) el.setAttribute('SubPartId', w.subPartInstanceId)
  for (const f of feeds) el.appendChild(f)
  gd.appendChild(el)
}
```

### T2.5 — Tank `Id` + `LocationAsmb` (F7)

1. Parser `tankFromElement` (≈265): the `Id` lives on the **wrapping** `<Tank>`, not the shape
   element. Change the signature to `tankFromElement(wrapper: Element, shapeEl: Element, shape: TankShape)`
   and set `id: wrapper.getAttribute('Id') ?? ''` plus
   `locationAsmb: readVec3Attrs(directChildren(shapeEl, 'LocationAsmb')[0], { x: 0, y: 0, z: 0 })`.
   Update both call sites in `subPartGameDataFromRoot` (≈496).
2. Serializer: `buildTankElement` gains the `<LocationAsmb>` emit (omit when all-zero, using the
   existing `buildEngineVec3` helper); the `Id` is set on the wrapper at the call site (≈240):

```ts
const tankWrapper = doc.createElement('Tank')
if (tank.id.trim()) tankWrapper.setAttribute('Id', tank.id)
tankWrapper.appendChild(buildTankElement(doc, tank))
```

### T2.6 — Part-level `<Tank>` (F8)

1. Parser: add `'Tank'` to `KNOWN_PART_GAMEDATA_CHILDREN`, and in `parseGameDataElement` parse
   `directChildren(gd, 'Tank')` into `game.tanks` with the **same** wrapper/shape logic as T2.5.
   Factor the tank-list parse into one helper used by both `parseGameDataElement` and
   `subPartGameDataFromRoot`:

```ts
/** Parses every `<Tank>` child of a `<PartGameData>`/`<SubPartGameData>` element. */
function tanksFromElement(parent: Element): Tank[] {
  const out: Tank[] = []
  for (const tankEl of directChildren(parent, 'Tank')) {
    const cylEl = directChildren(tankEl, 'CylindricalTank')[0]
    const sphEl = directChildren(tankEl, 'SphericalTank')[0]
    if (cylEl) out.push(tankFromElement(tankEl, cylEl, 'Cylindrical'))
    else if (sphEl) out.push(tankFromElement(tankEl, sphEl, 'Spherical'))
  }
  return out
}
```

2. Serializer: emit `game.tanks` in `serializeGameData`, immediately after the `<Control/>` block
   (Core's ordering), using the same wrapper code as T2.5.

### T2.7 — Solid-motor parse + emit (F6, round-trip half)

Add parsers mirroring the combustor/nozzle ones:

```ts
/** Parses one `<SolidMotor>` element. Defaults mirror SolidMotorTemplate.cs. */
function solidMotorFromElement(el: Element): SolidMotor {
  return {
    id: el.getAttribute('Id') ?? '',
    reactionId: directChildren(el, 'Reaction')[0]?.getAttribute('Id') ?? '',
    thermalEfficiency: readNum(directChildren(el, 'ThermalEfficiency')[0], 'Value') ?? 1,
    defaultPressurePa: readPressurePa(directChildren(el, 'DefaultPressure')[0]) ?? 7_000_000,
    grainGeometryId: directChildren(el, 'Grain')[0]?.getAttribute('Id') ?? '',
    feeds: feedsFromElement(el),
  }
}

/** Parses one `<SolidMotorNozzle>` element (same schema as DeLaval minus `<AreaRatio>`). */
function solidNozzleFromElement(el: Element): SolidMotorNozzle { /* mirror nozzleFromElement, no areaRatio */ }

/** Parses one `<SolidGrainSegment Id><Grain>…</Grain></SolidGrainSegment>` element. */
function solidGrainSegmentFromElement(el: Element): SolidGrainSegment {
  const g = directChildren(el, 'Grain')[0]
  return {
    id: el.getAttribute('Id') ?? '',
    wallMaterialId: g ? (directChildren(g, 'Material')[0]?.getAttribute('Id') ?? '') : '',
    outerRadiusM: (g && readDistanceM(directChildren(g, 'OuterRadius')[0])) || 0,
    wallThicknessMm: g
      ? ((readDistanceM(directChildren(g, 'WallThickness')[0]) ?? 0) * 1000)
      : 0,
    lengthM: (g && readDistanceM(directChildren(g, 'Length')[0])) || 0,
    locationAsmb: g
      ? readVec3Attrs(directChildren(g, 'LocationAsmb')[0], { x: 0, y: 0, z: 0 })
      : { x: 0, y: 0, z: 0 },
  }
}
```

Wire all three into `parseEngineModules` (≈880) so they are picked up on **both**
`<PartGameData>` and `<SubPartGameData>`; widen its `target` parameter type accordingly. Add
`'SolidMotor'`, `'SolidMotorNozzle'`, `'SolidGrainSegment'` to **both**
`KNOWN_PART_GAMEDATA_CHILDREN` and `KNOWN_SUBPART_GAMEDATA_CHILDREN`. Extend
`mergeSubPartGameDataInto` (≈522) to concat the three new lists.

Serializer builders (emit in this order inside each document: rockets → combustors → solid motors
→ DeLaval nozzles → solid nozzles → grain segments):

```ts
/** `<SolidMotor Id><FeedsFrom/>…<Reaction Id/><ThermalEfficiency/><DefaultPressure Bar/><Grain Id/></SolidMotor>` */
function buildSolidMotorElement(doc: XmlDocument, m: SolidMotor): XmlElement {
  const el = doc.createElement('SolidMotor')
  el.setAttribute('Id', m.id)
  el.appendChild(elWithAttr(doc, 'Reaction', 'Id', m.reactionId))
  if (Math.abs(m.thermalEfficiency - 1) > EPSILON) {
    el.appendChild(elWithAttr(doc, 'ThermalEfficiency', 'Value', formatG6(m.thermalEfficiency)))
  }
  el.appendChild(elWithAttr(doc, 'DefaultPressure', 'Bar', formatG6(m.defaultPressurePa / 1e5)))
  if (m.grainGeometryId.trim()) el.appendChild(elWithAttr(doc, 'Grain', 'Id', m.grainGeometryId))
  for (const f of buildFeedElements(doc, m.feeds)) el.appendChild(f)
  return el
}
```

`buildSolidNozzleElement` = `buildNozzleElement` **without** the `<AreaRatio>` line, element name
`SolidMotorNozzle`. `buildSolidGrainSegmentElement` emits
`<SolidGrainSegment Id><Grain><Material Id/><OuterRadius M/><WallThickness Mm/><Length M/>[<LocationAsmb/>]</Grain></SolidGrainSegment>`
(omit `<Material>` when blank; omit `<LocationAsmb>` at zero).

### T2.8 — Custom-reaction burn-rate round-trip (F10)

Parser `customReactionsFromRoot` (≈446) — read the four new elements:

```ts
const br = directChildren(proc, 'BurnRate')[0]
const burnRate = br
  ? {
      coefficientMPerS: readNum(br, 'CoefficientMPerS') ?? 0,
      exponent: readNum(br, 'Exponent') ?? 0,
    }
  : null
const minimumBurnPressurePa = readPressurePa(directChildren(proc, 'MinimumBurnPressure')[0])
const maxStablePressurePa = readPressurePa(directChildren(proc, 'MaxStablePressure')[0])
const exhaustCondensedFraction = readNum(
  directChildren(proc, 'ExhaustCondensedFraction')[0], 'Value',
)
```

Serializer `buildFixedReactionElement` (≈509) — emit each only when non-null, positioned after
`<Reactant>` and before `<PressureCondition>` (Core's order):

```xml
<BurnRate CoefficientMPerS="0.0045" Exponent="0.35" />
<MinimumBurnPressure Bar="15" />
<MaxStablePressure Bar="150" />
<ExhaustCondensedFraction Value="0.336965" />
```

**Export guard:** in `serializeGameData`'s custom-reaction loop (≈228), skip any reaction where
`!isCustomReactionExportable(reaction)` and `console.warn` the id + reason. This prevents flexo
from emitting XML that hard-fails KSA's mod load.

### T2.9 — Tests

Add to `src/ksa/partXmlParser.test.ts` and `src/ksa/partXmlSerializer.test.ts`:

1. `<Capabilities>` round-trips on a geometry connector and on a GameData connector, single and
   multi-token (`"BulkFluid SolidMotorCase"`).
2. Unknown capability tokens are dropped.
3. `<FeedsFrom Parent="true"/>` / `Connector=` / `Container=` / `SubPart=`+`Container=`
   round-trip; a `<FeedsFrom>` with two of them is dropped.
4. `<Plumbing>Service</Plumbing>` round-trips; `Bulk` is omitted from the output.
5. `<ConsumerFeedWiring Id SubPartId>` round-trips; a `Parent="true"` child is dropped; a wiring
   entry with no valid feeds is not emitted.
6. `<Tank Id="X">` round-trips at BOTH Part and SubPart level.
7. A full SRB round-trip: parse the `CorePropulsionC_Prefab_SRBDThrustAssemblyA` XML from §1.3,
   re-serialize, and assert every element/attribute above is present.
8. A `Category="Solid"` custom reaction without burn-rate data is **not** emitted (warn path).
9. `flagsString` never emits a comma.

### T2.10 — Gate + commit

`feat(xml): model KSA 5018 connector capabilities, feed points and solid motors`

---

## Phase 3 — Catalog, import/paste remapping, project codec

**Goal:** importing a built-in Part (or pasting a project) produces feed/capability data whose
references point at the regenerated ids.

### T3.1 — `src/ksa/partCatalog.ts`

1. `CatalogPart` and the catalog-local `PartGameData` interface: add `tanks`, `consumerFeedWiring`,
   `solidMotors`, `solidNozzles`, `solidGrainSegments`.
2. `parseGameDataFile` (≈183): push each new list from `parsed.gameData`, and apply
   `parsed.connectorCapabilities` into a new `entry.connectorCapabilities` map alongside
   `connectorFlags`.
3. `mergeGameData` (≈267): inside the `for (const conn of part.connectors)` loop add
   `const caps = gd.connectorCapabilities.get(conn.id); if (caps) conn.capabilities = caps`.
   Then copy the five new lists onto `part` the same way `rockets`/`combustors` are copied.

### T3.2 — `src/state/editorStore.ts` — reference remapping (the bug-prone bit)

1. `ImportedGameData` (≈520): add the five new lists.
2. Add a feed remapper next to `remapSubPartRef` (≈540):

```ts
/**
 * Remaps a feed point onto the freshly-generated ids: a container feed's `subPartInstanceId`
 * through `idMap`, a connector feed's `connectorId` through `connectorIdMap`. Unmapped ids are
 * left as-is (the same policy `remapRawConnectorRefs` uses — a partial import can't be pruned safely).
 */
function remapFeed(
  f: FeedSource,
  connectorIdMap: ReadonlyMap<string, string>,
  idMap: ReadonlyMap<string, string>,
): FeedSource {
  if (f.kind === 'connector') {
    return { kind: 'connector', connectorId: connectorIdMap.get(f.connectorId) ?? f.connectorId }
  }
  if (f.kind === 'container') {
    return {
      kind: 'container',
      containerId: f.containerId,
      subPartInstanceId: f.subPartInstanceId
        ? (idMap.get(f.subPartInstanceId) ?? f.subPartInstanceId)
        : null,
    }
  }
  return f
}
```

3. In `applyImportedGameData` (≈567) append the new lists **with remapping**:

```ts
game.consumerFeedWiring.push(
  ...src.consumerFeedWiring.map((w) => ({
    consumerId: w.consumerId,
    subPartInstanceId: w.subPartInstanceId
      ? (idMap.get(w.subPartInstanceId) ?? w.subPartInstanceId)
      : null,
    feeds: w.feeds.map((f) => remapFeed(f, connectorIdMap, idMap)),
  })),
)
game.combustors.push(
  ...src.combustors.map((c) => ({ ...c, feeds: c.feeds.map((f) => remapFeed(f, connectorIdMap, idMap)) })),
)
game.solidMotors.push(
  ...src.solidMotors.map((m) => ({ ...m, feeds: m.feeds.map((f) => remapFeed(f, connectorIdMap, idMap)) })),
)
game.solidNozzles.push(...src.solidNozzles)
game.solidGrainSegments.push(...src.solidGrainSegments)
game.tanks.push(...src.tanks)
```

   ⚠️ The existing line `game.combustors.push(...src.combustors)` (≈628) must be **replaced** by
   the remapping version above, not duplicated.

4. In the `for (const spd of src.subPartGameData)` loop (≈610) also remap the SubPart-level
   combustors' and solid motors' feeds — a SubPart-level consumer normally uses
   `{ kind: 'parent' }`, which needs no remap, but a `container`/`connector` feed does:

```ts
target.subPartGameData.push({
  ...spd,
  rockets: spd.rockets.map((r) => remapRocket(r, idMap)),
  combustors: spd.combustors.map((c) => ({
    ...c, feeds: c.feeds.map((f) => remapFeed(f, connectorIdMap, idMap)),
  })),
  solidMotors: spd.solidMotors.map((m) => ({
    ...m, feeds: m.feeds.map((f) => remapFeed(f, connectorIdMap, idMap)),
  })),
})
```

5. In `addPart` (≈716) carry the capabilities through:
   `capabilities: [...src.capabilities],`

6. Add an editor action next to `setConnectorFlags` (≈839):

```ts
export function setConnectorCapabilities(
  index: number,
  capabilities: readonly ConnectorCapability[],
): void { /* mirror setConnectorFlags exactly, incl. pushUndo */ }
```

### T3.3 — `src/state/projectTransfer.ts`

Mirror T3.2 for the paste path: connector clone (≈319) copies `capabilities`; the game-data merge
copies the five new lists with the same `remapFeed` treatment (export the helper from
`editorStore.ts` or duplicate it locally — prefer exporting it from `editorStore.ts` and importing).

### T3.4 — `src/state/projectCodec.ts`

Compact-key assignments (keep them short and collision-free within their interface):

| Interface           | New key | Field                                                      |
| ------------------- | ------- | ---------------------------------------------------------- |
| `CConnector`        | `cp`    | `capabilities` (omit when empty)                           |
| `CTank`             | `id`    | `id` (omit when `''`)                                      |
| `CTank`             | `lo`    | `locationAsmb` (omit at `0,0,0`; reuse `Triple`)           |
| `CCombustor`        | `fd`    | `feeds` (omit when empty)                                  |
| `CCombustor`        | `pl`    | `1` when `plumbing === 'Service'` (omit for `Bulk`)        |
| `CGameData`         | `tk`    | part-level `tanks` (omit when empty)                       |
| `CGameData`         | `cfw`   | `consumerFeedWiring` (omit when empty)                     |
| `CGameData`         | `sm`    | `solidMotors`                                              |
| `CGameData`         | `sn`    | `solidNozzles`                                             |
| `CGameData`         | `sg`    | `solidGrainSegments`                                       |
| `CSubPartGameData`  | `sm` / `sn` / `sg` | same three lists                                |

Add a compact feed codec:

```ts
/** Feed point: 'p' parent · ['c', connectorId] · ['t', containerId, subPartInstanceId?] */
type CFeed = 'p' | ['c', string] | ['t', string, string?]

function encFeed(f: FeedSource): CFeed { … }
function decFeed(c: CFeed): FeedSource | null { … }   // returns null for garbage; caller filters
```

Update `encConnector`/`decConnector`, `encTank`/`decTank`, `encCombustor`/`decCombustor`,
`encGameData`/`decGameData`, `encSubPartGameData`/`decSubPartGameData`.

**Bump `PROJECT_EXPORT_VERSION` from `3` to `4`** (≈line 56). Per the no-migration rule, a v3
envelope is rejected outright — do NOT add a v3 reader.

### T3.5 — Tests

- `src/state/projectCodec.test.ts`: round-trip a part with connector capabilities, a
  `Service` combustor with all three feed kinds, a part-level tank with an id, one solid motor +
  grain segment. Assert the version marker is `4`.
- `src/state/editorStore.test.ts`: import a fixture Part whose combustor feeds from
  `_connector1` and whose `<ConsumerFeedWiring SubPartId="X">` names a placement; assert both
  references land on the **regenerated** ids, not the originals.
- `src/state/projectTransfer.test.ts`: same assertion for the paste path.

### T3.6 — Gate + commit

`feat(import): remap KSA 5018 feed + capability references on Part import and paste`

---

## Phase 4 — UI: authoring plumbing

**Goal:** a user can build a working engine part in flexo without hand-editing XML.
React Compiler rules apply (see §0.2).

### T4.1 — Connector capabilities in the inspector

`src/ui/TransformInspector.tsx` → `ConnectorHeader` (≈321). Below the existing `Flags` switch row
add a `Capabilities` row built the same way, from `CONNECTOR_CAPABILITIES`, calling the new
`setConnectorCapabilities`. Add a one-line hint under the row:

> "Empty = electricity + service fluid only. Add **BulkFluid** for main-engine propellant,
> **SolidMotorCase** to stack SRB segments, **DecouplerJoint** on a decoupler's connector."

Also update `src/ui/AssetsList.tsx` (≈116/123): include capabilities in the search `match(...)`
and in the connector row's `sub` line (e.g. `"ToSurface · BulkFluid"`, or `'no flags'` when both
lists are empty).

### T4.2 — A `Feeds` editor component

New file `src/ui/FeedsField.tsx`, exporting:

```tsx
export function FeedsField(props: {
  label: string
  feeds: FeedSource[]
  /** Connector ids selectable for a 'connector' feed. */
  connectorIds: readonly string[]
  /** Container ids selectable for a 'container' feed, as { id, label, subPartInstanceId }. */
  containers: readonly { id: string; label: string; subPartInstanceId: string | null }[]
  /** Hide the "Parent" option (ConsumerFeedWiring may not defer to Parent). */
  allowParent: boolean
  onChange: (next: FeedSource[]) => void
}): React.ReactElement
```

Rendering: one `ItemCard` per feed (reuse `ItemCard` from `GameDataSections.tsx`) with a kind
`Select` (`Parent` / `Connector` / `Container`), then the kind-specific `Select`. An "Add feed"
`Button` appends `{ kind: 'parent' }` when `allowParent`, else the first available connector.

Show an inline warning when `feeds.length === 0`:
> "No feed points — KSA will log *'declares no FeedsFrom feed points; it will reach no propellant'* and this engine will produce no thrust."

### T4.3 — Wire feeds + plumbing into `CombustorFields`

`src/ui/EngineSections.tsx` → `CombustorFields` (≈186). Add at the **top** of the card, above the
reaction picker:

1. A `Plumbing` `Select` (`Bulk (main engine)` / `Service (RCS)`), defaulting to `Bulk`, with the
   hint *"Service draws through connectors that carry ServiceFluid — the default. Bulk needs
   `BulkFluid` on every connector in the path."*
2. `<FeedsField label="Feeds from" … allowParent />`. `connectorIds` = `part.connectors.map(c => c.id)`.
   `containers` = every `Tank` id (part-level and per-SubPart) plus every `SolidGrainSegment` id,
   labelled `"<id> (<subPart or 'part'>)"`.

Add the matching editor actions in `editorStore.ts`
(`setCombustorFeeds`, `setCombustorPlumbing`, and the SubPart-level equivalents) following the
existing `setCombustor*` action shape exactly (each does its own `pushUndo`).

### T4.4 — Part-level Tanks section (F8)

`src/ui/GameDataSections.tsx`: generalise the existing `TanksSection` so it drives either
`part.gameData.tanks` (part level) or a `SubPartGameData.tanks`. Add an **Id** `TextField` as the
first field of every tank card, with the hint *"Feed id — reference it from an engine's
`Feeds from → Container`."* Add a new `<DisclosureSection title="Tanks">` to
`src/ui/PartDataButton.tsx` between "Mass" and "Power".

### T4.5 — Consumer feed wiring section

New exported component in `src/ui/EngineSections.tsx`:

```tsx
export function ConsumerFeedWiringSection({ part }: { part: EditingPart }): React.ReactElement
```

- Lists `part.gameData.consumerFeedWiring`, one `ItemCard` each: a consumer `Select` (every
  combustor/solid-motor id found on the part **and** on every placed SubPart's GameData, labelled
  with its owning SubPart), then `<FeedsField allowParent={false} …>`.
- An **"Auto-wire unwired consumers"** `Button`: for every SubPart-level consumer whose `feeds`
  contains `{ kind: 'parent' }` and which has no matching wiring entry, append
  `{ consumerId, subPartInstanceId, feeds: [] }` in one undo step. This is the one-click fix for
  the most common authoring mistake.
- Mount it under the existing `Engine` `DisclosureSection` in `PartDataButton.tsx` (≈100), after
  `Controllers` and before `Gimbals`, titled **"Feed wiring"**.

### T4.6 — Solid-reaction fields in the custom-propellant editor

`src/ui/EngineSections.tsx` → `CustomPropellantCard` (≈888). When `category === 'Solid'`, reveal
four required fields: burn-rate coefficient (m/s), burn-rate exponent, minimum burn pressure
(bar), max stable pressure (bar), exhaust condensed fraction (0–1). Show a red inline error when
`!isCustomReactionExportable(reaction)` reading:

> "KSA refuses to load a solid reaction without a burn-rate law and pressure limits — this
> propellant will be omitted from the export."

Also seed these fields when the user clones `APCP` / `DoubleBase` (the "Clone a shipped/known
propellant" control, ≈843) using the reference values in the T1.6 doc comment.

### T4.7 — Gate + commit

`feat(ui): author connector capabilities, engine feed points and part-level tanks`

---

## Phase 5 — Solid rocket motor authoring

**Goal:** build an SRB in flexo end-to-end. Depends on Phases 1–4.

### T5.1 — Editor actions

In `src/state/editorStore.ts`, mirroring the existing `addPartRocket` / `addPartCombustor` /
`addPartNozzle` (≈2114–2180):

- `addPartSolidMotor()`, `addPartSolidNozzle()`, `addPartSolidGrainSegment()`
- `addSubPartSolidNozzle(templateId)`, `addSubPartSolidGrainSegment(templateId)`
- matching `update…` / `remove…` actions for each field of the three new types

Follow the existing naming and `pushUndo` conventions exactly.

### T5.2 — UI

`src/ui/EngineSections.tsx`:

- `SolidMotorFields` — reaction `Select` restricted to `KNOWN_REACTIONS.filter(r => r.category === 'Solid')`
  plus any custom `Solid` reaction; `Grain profile` `Select` from `GRAIN_GEOMETRY_IDS`;
  thermal efficiency; default chamber pressure (bar); `<FeedsField allowParent />`.
- `SolidNozzleFields` — copy `NozzleFields` and **delete the Area ratio field**; add the hint
  *"KSA sizes the throat automatically (exit area ÷ 12) — solid nozzles have no AreaRatio."*
- `SolidGrainSegmentFields` — material id, outer radius (m), wall thickness (mm), length (m),
  location offset (`Vec3Field`). Show the derived grain volume/mass read-only if trivial to
  compute (`π·(r−t)²·L` × material density is **not** available client-side — omit rather than guess).
- Extend `SubPartEngineSection` (≈411) with the solid lists.
- Add a `<DisclosureSection title="Solid motor (SRB)">` inside the `Engine` section of
  `PartDataButton.tsx`.

### T5.3 — Authoring guardrails (validation only, no auto-fix)

Add to a new `src/ksa/engineValidation.ts` and surface in the Engine panel:

| Check                                                                                                              | Message                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| A `<Rocket>` whose `core` id resolves to a `SolidMotor` but any `nozzle` id resolves to a `DeLavalNozzle` (or vice versa) | "KSA throws: *Rocket X mixes solid and liquid components*."                                       |
| A `<Rocket>` with a solid core and zero nozzles                                                                    | "KSA throws: *Solid motor rocket X needs at least one nozzle*."                                    |
| A `RocketThrusterController` driving a rocket whose core is a `SolidMotor`                                          | "KSA throws: *Solid motor X cannot be driven by thruster controller Y*."                          |
| A `SolidMotor` whose `reactionId` is not a `Solid`-category reaction                                                | "KSA throws: *Solid motor X requires a solid reaction*."                                           |
| A `SolidMotor` whose `defaultPressurePa` is outside its reaction's `[min, max]` stable range                       | "KSA throws: *default pressure … is outside …'s stable range*."                                    |
| A feed `{ kind: 'container' }` whose `containerId` matches no `Tank`/`SolidGrainSegment` on the named scope         | "KSA logs *feeds from unknown container '…'* — this engine will get nothing from it."             |
| A feed `{ kind: 'connector' }` whose `connectorId` matches no connector                                            | "KSA logs *feeds from unknown connector '…'*."                                                     |
| A `{ kind: 'parent' }` feed on a SubPart-level consumer with no matching `ConsumerFeedWiring`                       | "KSA logs *feeds from its parent part, but … has no ConsumerFeedWiring wiring for it*."           |
| A connector used by a `Bulk` combustor feed that lacks the `BulkFluid` capability                                  | "Add **BulkFluid** to connector `…` or the engine gets no propellant."                             |
| A `SolidMotor` feeding from a connector that lacks `SolidMotorCase`                                                 | "Add **SolidMotorCase** to connector `…` so grain segments can stack onto it."                     |

Each check must cite the game-side class it mirrors in a code comment
(`SolidMotorTemplate.Create`, `RocketTemplate.Create`, `PartTemplate.AddResolvedFeed`, …).

### T5.4 — Gate + commit

`feat(engines): author KSA solid rocket motors, grain segments and solid nozzles`

### T5.5 — OPTIONAL sub-phase (defer unless asked): thrust-curve preview

Porting `SolidMotor.TrySampleThrustCurve` needs `GrainGeometryTable` (a 3-column LUT parsed from
`GrainGeometries.xml`), `BurnRateLaw.Evaluate`, and `SolidGrainSegment.ComputeBurningAreaAtDepth`.
That is a real port of ~200 lines of `decomp/KSA/SolidMotor.cs` + `GrainGeometryTable.cs` +
`SolidGrainSegment.cs`. **Do not start it as part of this plan** — file it as a follow-up.

---

## Phase 6 — Export validation pass

**Goal:** flexo never writes a mod that KSA refuses to load or that silently produces no thrust.

### T6.1 — Extend the export pre-flight

`src/ui/ExportButton.tsx` already gates export on some conditions. Add a blocking-vs-warning
summary driven by `src/ksa/engineValidation.ts` (T5.3):

- **BLOCK** (KSA would throw at load): the five "KSA throws" rows in T5.3, and any
  `Category="Solid"` custom reaction failing `isCustomReactionExportable`.
- **WARN** (loads, but the part misbehaves): the "KSA logs" rows and the capability hints.

### T6.2 — Tests

`src/ksa/engineValidation.test.ts` — one test per row of the T5.3 table, asserting the check
fires and does not fire on a well-formed part.

### T6.3 — Gate + commit

`feat(export): block KSA-invalid engine data and warn on unresolvable feed paths`

---

## Phase 7 — Re-baseline `scope/` and `docs/` (NON-NEGOTIABLE)

### T7.1 — `scope/FULL_SCOPE.md`

1. Baseline table → `2026.7.9.5018`; previous baseline → `2026.7.8.4980`.
2. Add a **"5018 review method"** paragraph at the top of the review-method block, summarising
   §1.1 (the plumbing-topology shift), the `diff -rq` method used, and naming the three
   load-bearing revs (4992, 5002, 5007).
3. Integration-map table: refresh every status column to the 5018 verdict. Connectors and Engines
   move to 🔴→✅; add a **new row**:

   | Area | Detail doc | Primary game anchors | 5018 status |
   | --- | --- | --- | --- |
   | Plumbing topology (connector capabilities, consumer feed points, containers) | `scope/plumbing-and-feeds.md` | `ConnectorCapability*.cs`, `FeedsFromReference.cs`, `ConsumerFeedWiring.cs`, `RocketCoreTemplate.cs`, `PartTemplate.ResolveConsumerFeedPoints` | 🔴→✅ modeled |

4. Cross-cutting invariant section: note that `<Connector>` and `<Combustor>` are **modeled**
   elements, so added schema on them is silent data-loss — this update is the canonical example.

### T7.2 — New `scope/plumbing-and-feeds.md`

Follow the shape of the existing scope docs: Baseline / Flexo modules / Game-side anchors /
The contract — what flexo bakes in / What changed in 5018. Content = §1.1 + §1.2 rows G1–G6 of
this plan, with the exact enum values, defaults, and the `ToCapability()` inversion rule.

### T7.3 — Update the existing scope docs

| Doc                                | Edits                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scope/connectors-coordinates-iva.md` | Baseline → 5018. Add `<Capabilities>` to the connector schema row and to "The contract". Add a **What changed in 5018** section (G1, G2, G13, and the F11 whitespace-separator rule). |
| `scope/engines.md`                 | Baseline → 5018. Add `<FeedsFrom>`, `<Plumbing>`, `<SolidMotor>`, `<SolidMotorNozzle>`, `<GrainGeometry>`, the solid-reaction burn-rate requirement, and the `DefaultEngine`→`DefaultPlumeTrail` rename. Record that the ported physics files are byte-identical. |
| `scope/gamedata-modules.md`        | Baseline → 5018. Add `<SolidGrainSegment>` and the container-`Id` contract; note `HollowOpenSemiEllipsoidMass` (G11) in the inert-mass family; record part-level `<Tank>` as now modeled.  |
| `scope/part-and-subpart-xml.md`    | Baseline → 5018. Record the full `Components` element-name list (`AttachedInternal`, `Collider`, `FuelPort`, `IVASeat`, `KeyframeAnimationModule`, `Light`, `MeshView`, `PartModelGlass`, `PartModel`, `PartModelDynamic`, `SolidGrainSegment`, `Tank`) and that each carries an `Id` attribute via `ModuleBase.TemplateDataBase`; note the editor-tag registry is unchanged. |
| `scope/ground-clutter.md`          | Baseline → 5018. Record `<LOD CastShadows>` (G12).                                                                                                                                        |
| `scope/animation.md`, `scope/kittens.md`, `scope/custom-assets-and-mod-export.md` | Baseline → 5018, status **INTACT**, with a one-line "What changed in 5018: nothing in this area" note citing the evidence in §1.4.                     |
| `scope/GAME_UPDATE_CHECKLIST.md`   | Add a step: *"check for added schema on the MODELED elements `<Connector>`, `<Combustor>`, `<DeLavalNozzle>`, `<Rocket>`, `<Tank>` — these do NOT ride the GameData passthrough."*         |

### T7.4 — `docs/`

| Doc                                  | Edits                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `docs/engines.md`                    | New "Plumbing" chapter: capabilities → feed points → wiring, with the §1.3 worked example and the flexo UI path for each step.  |
| `docs/ksa-part-connector-notes.md`   | New "Capabilities" chapter (independent of Flags); note G13 (`UnambiguousSurfaceMount`) changes which connector a surface mount picks. |
| `docs/xml-io.md`                     | Record the whitespace `[Flags]` separator rule (F11) as a hard requirement.                                                     |
| `docs/architecture.md`               | One paragraph: the new plumbing model is document state on `PartGameData`, undo-tracked, remapped on import like other id refs. |

### T7.5 — `plans/FIX_CURRENT_GAPS_PLAN.md`

Prepend a `# 5018 review` section with the §2 gap table, each row marked ✅ DONE (linking here) or
📋 OPEN. Move gap **F** (part-level `<Tank>`) to ✅ DONE (closed by T2.6/T4.4). Leave gaps
**E** (geometry `<Collider>`), **G** (`FuelPort`), **H** (clutter LOD retune) OPEN. Update the
document's top banner so it no longer claims "4980 = zero src changes required".

### T7.6 — Gate + commit

`docs(scope): re-baseline flexo↔KSA scope catalog to 2026.7.9.5018`

---

## Phase 8 — In-game verification (manual, by the user)

Automated tests cannot prove KSA accepts the output. After Phase 7:

1. Build a minimal test Part in flexo: one SubPart, one connector with `BulkFluid`, one
   part-level `<Tank Id="Fuel">`, one combustor feeding `Container="Fuel"`, one nozzle, one
   rocket, one engine controller.
2. Export the mod, drop `flexo-parts/` into KSA's mod folder.
3. Check the KSA log for: `declares no FeedsFrom feed points`, `feeds from unknown container`,
   `feeds from unknown connector`, `has no ConsumerFeedWiring wiring for it`, and any
   `ToEnum` / `CreateUnknownConstantException` on `<Flags>` / `<Capabilities>`. **Zero of these
   must appear.**
4. Launch and throttle up — confirm thrust is non-zero and the propellant drains.
5. Repeat with a two-flag connector (`Internal ToSurface`) to prove the F11 fix.
6. Repeat with an SRB: thrust assembly + one grain segment, both connectors `SolidMotorCase`.

Record the result at the top of this file and in `scope/FULL_SCOPE.md`.

---

## Appendix A — Sequencing summary

| Phase | Deliverable                                       | Blocks                | Purge? |
| ----- | ------------------------------------------------- | --------------------- | ------ |
| 0     | Green test suite                                  | everything            | no     |
| 1     | `types.ts` model + compiling construction sites   | 2, 3, 4, 5            | **yes — the only one** |
| 2     | Parse + serialize (round-trip fidelity)           | 3, 4, 5, 6            | no     |
| 3     | Catalog, import/paste remap, codec (v4)           | 4, 5                  | no (v3 envelopes rejected) |
| 4     | Plumbing authoring UI                             | 5, 6                  | no     |
| 5     | Solid-motor authoring                             | 6                     | no     |
| 6     | Export validation                                 | —                     | no     |
| 7     | `scope/` + `docs/` re-baseline                    | —                     | no     |
| 8     | In-game verification (manual)                     | —                     | no     |

**Minimum viable stop-the-bleeding set, if the whole plan can't land at once:**
Phase 0 + T1.1–T1.3 + T1.7 + T2.1–T2.4 + T3.1–T3.2. That removes every **BREAKING** gap except
solid-motor authoring (F6) and part-level tank editing (F8).

## Appendix B — Quick evidence index

| Claim                                    | File                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Capability enum + default                | `decomp/KSA/ConnectorCapabilityFlags.cs`, `ConnectorCapabilityExtensions.Intersect`        |
| Capability merge across documents        | `decomp/KSA/PartTemplate.cs` `ApplyGameData` (`Capabilities \|= …`)                        |
| "no FeedsFrom ⇒ no propellant" error     | `decomp/KSA/RocketCoreTemplate.cs` `OnDataLoad`                                            |
| FeedsFrom validity rule                  | `decomp/KSA/FeedsFromReference.cs` `IsValid` / `OnDataLoad`                                |
| Wiring resolution                        | `decomp/KSA/PartTemplate.cs` `ResolveConsumerFeedPoints` / `ResolveConsumerFeeds` / `AddResolvedFeed` |
| Container ids come from `Components`     | `decomp/KSA/ModuleBase.cs` `TemplateDataBase.Id`; `XmlHelper.cs` static ctor               |
| Plumbing class mapping                   | `decomp/KSA/ConnectorCapabilityExtensions.ToCapability(PlumbingClass)`                     |
| Solid reaction hard requirements         | `decomp/KSA/FixedReactionTemplate.cs` `Create()`                                           |
| Solid rocket assembly rules              | `decomp/KSA/RocketTemplate.cs`, `RocketThrusterControllerTemplate.cs`, `SolidMotorTemplate.cs` |
| Solid nozzle throat sizing               | `decomp/KSA/SolidMotorNozzleTemplate.cs` `Create` (`ThroatArea = exitArea / 12`)           |
| PlumeTrail rename                        | `Content/Core/PlumeTrailAssets.xml`, `Content/Core/mod.toml`, `CorePropulsionAGameData.xml` diff |
| `[Flags]` whitespace separator           | .NET `XmlSerializationReader.ToEnum` (`value.Split(null)` + `CreateUnknownConstantException`) |
| Ported physics unchanged                 | `diff -q` over the 13 files listed in §1.4                                                 |
