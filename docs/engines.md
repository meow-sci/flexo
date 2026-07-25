# Engines (the Engine Designer)

flexo can author complete, fires-in-game KSA rocket engines on reused SubPart meshes —
choosing propellant, tuning thrust/Isp against real De Laval nozzle physics, wiring a
controller + gimbals, and placing the exhaust in 3D. Engines add **no geometry**: they
decorate existing/Core SubPart placements with GameData, so the scene already renders
them and the mod export ships their XML automatically.

The deep KSA reference is [`analysis/KSA_ENGINE_DETAILS.md`](../analysis/KSA_ENGINE_DETAILS.md);
the implementation map is [`plans/KSA_ENGINE_DESIGNER_PLAN.md`](../plans/KSA_ENGINE_DESIGNER_PLAN.md).

## The model — an engine is a graph of modules

An "engine" is a small graph of cooperating GameData modules (see `src/ksa/types.ts`):

- **`Combustor`** (`<Combustor>`) — the chamber: burns a combustion process → hot gas.
  Knobs: `combustionId`, `maxPressurePa`, `thermalEfficiency`, `minimumThrottle`
  (1.0 ⇒ on/off), `minimumPulseTimeS`.
- **`DeLavalNozzle`** (`<DeLavalNozzle>`) — expands the gas → thrust; owns the exhaust
  geometry + plume/light/sound FX. Knobs: `exitDiameterM`, `areaRatio` (required, no
  NaN), flow/expansion efficiencies, `exhaustLocation`/`exhaustDirection`,
  `volumetricExhaustId`, sound, light.
- **`Rocket`** (`<Rocket>`) — binds one `core` (combustor) + N `nozzles` into one firing
  unit. Refs are `SubPartIdRef` (`{ id, subPartInstanceId }`).
- **`RocketController`** (`<RocketEngineController>` / `<RocketThrusterController>`) — what
  makes the part fire; groups rockets, receives throttle/staging (or RCS pulses).
- **`Gimbal`** (`<SubPart Id><Gimbal>`) — thrust-vectors a placed SubPart's nozzles; 0/0 ⇒
  fixed.
- **`CustomReaction`** (`<FixedReaction>`) — an optional user-authored propellant
  (category + mixture + gas LUT). A combustor references any reaction via `<Reaction Id>`;
  Core's `<MixtureReaction>`s additionally require a `<MixtureRatio>` (O/F by mass).

**Where they live (matches KSA's two containers):**

| Module | flexo home |
|---|---|
| `Combustor` / `DeLavalNozzle` / `Rocket` (reusable thrust chamber, travels with a mesh) | `SubPartGameData` (next to tanks/lights) |
| `RocketController`, gas-generator `Rocket`/`Combustor`/`Nozzle`, `Gimbal` (per-variant) | `PartGameData` (`part.gameData`), referencing placement **instance ids** |
| `CustomReaction` | `part.customReactions` (top-level) |

Two reference kinds the feature introduces — both remapped on import/paste: module→SubPart
**instance id** (`SubPartIdRef.subPartInstanceId` → `placement.instanceId`) and the
`Gimbal.subPartInstanceId`. See the remap in `editorStore.applyImportedGameData` /
`projectTransfer.mergeGameData`.

## Physics — `src/ksa/enginePhysics.ts`

A verbatim port of KSA's decompiled engine math (`RocketDesign.cs`, `DeLavalNozzleConfig.cs`,
`GasProperties.cs`, `NozzlePerformance.cs`, `FixedReactionTable.cs`/`MixtureReactionTable.cs`), so flexo shows the SAME
sea-level/vacuum thrust + Isp the in-game `EngineDesigner` previews. Pure numeric (no
react/three/DOM) → runs identically in the browser and vitest. Thrust is real De Laval
physics: `F = ṁ·Vₑ + (Pₑ − P∞)·Aₑ`, `Isp = V_eff / 9.80665`, with choked mass flow,
area-ratio→Mach Newton solve, and over-expansion flow-separation clamping.

Headline API: `predictPerformance({ lut, maxPressurePa, exitDiameterM, areaRatio, …effs })`
→ `{ thrustSLN, thrustVacN, ispSL, ispVac, massFlowRate, throatDiameterM,
flowSeparationSeveritySL, optimumExpansionPa, … }`. Also `deriveAreaRatioForExhaustPressure`
(atmospheric design) and the building blocks (`lutLookup`, `solveMachFromAreaRatio`, …).

Reproduces a real KSA quirk faithfully: the LUT lookup clamps the **topmost** pressure
interval to the ceiling row instead of interpolating (immaterial for real chamber
pressures, far below the table top). Mixture reactions are baked to a 1-D slice at the
combustor's O/F ratio first (`sliceLutAtMixtureRatio`, the `MixtureReactionTable.SliceAt`
port — exactly what KSA's combustor does at load). Tests in `enginePhysics.test.ts`
validate closed-form identities + real-Hydrolox-at-5.5 parity (≈445 s vacuum Isp).

## Reaction catalog — `src/ksa/reactionCatalog.ts` + `src/state/reactionStore.ts`

The propellant library (`Reactions.xml`, served under `/ksa/` alongside the part catalog)
provides the gas LUTs the physics reads: `<FixedReaction>`s (1-D pressure LUT — monoprops,
solids) and `<MixtureReaction>`s (2-D O/F×pressure LUT + `<DefaultMixtureRatio>`;
`<ThermalReaction>`s are skipped — nothing can burn them yet). It is licensed Core data kept
in the private asset tree, so it may be **absent** in the open-source build — the editor
still authors and exports engines, just without the live thrust readout (`$hasReactionData`
is false; a static `KNOWN_REACTIONS` snapshot backs the propellant dropdown). The designer's
dropdown + readout use `$allReactions`/`$allReactionIndex`, which merge the Core catalog with
the project's `customReactions` (custom wins on id).

> `Reactions.xml` is Core game data referenced by `<Reaction Id>`, not by path;
> `copy-assets.ts` discovers it via its reaction-element tags. If a sync ever drops it, copy
> it back into `KSA_ASSETS_DIR`.

## Authoring UX

- **Sidebar designer** (`$inspectorMode === 'engine'`, `EnginePanel`/`EngineToolbar`):
  entered from the Add menu ("Define Engine…") or the Assets toolbar "Engine (N)" button.
  Pick/define an engine on a placed SubPart, watch the **live SL/vacuum thrust + Isp**,
  edit the chamber/nozzle/FX (picking a mixture reaction exposes an **O/F mixture-ratio**
  field, defaulted and bounded by the reaction's LUT rows — KSA refuses to load a
  ratio-less mixture combustor, and the UI warns), place the exhaust with a **3D gizmo**
  ("Place exhaust in 3D"), wire the controller + gimbals, and author custom propellants.
- **Modal sections** (round-trip + no-3D editing): `EngineSections.tsx` renders the
  thrust-chamber editors in **SubPart Data** (`ManageTanksModal`) and the controllers +
  gimbals + gas-generator in **Part Data** (`PartDataButton`, "Engine" section).
- **3D exhaust handle**: `NozzleHandleObject` (cube + direction cone) marks the active
  nozzle's exhaust; the `TransformGizmo` attaches to a proxy at the exhaust world position
  (the pose-pivot precedent in `EditorScene`). A drag streams `updateNozzle` and pushes one
  undo step on drag-start.

## Plumbing — where the propellant actually comes from (KSA 2026.7.9)

Before 5018 an engine just needed a combustor: KSA searched the whole vehicle for tanks
holding its reactants. Now the path is **explicitly authored**, and an engine that doesn't
declare it makes **zero thrust** with no error visible in-game. Three layers, all editable
in flexo. Game-contract detail: [scope/plumbing-and-feeds.md](../scope/plumbing-and-feeds.md).

### 1. Connector capabilities — what may cross a connector

Select a connector → the inspector's **Capabilities** row (independent of **Flags**, which
is about orientation). A connection carries a resource only when **both** ends declare it.

**An empty list is not "nothing"** — it means KSA's implicit `Electricity | ServiceFluid`.
Add `BulkFluid` for a main-engine propellant path, `SolidMotorCase` so SRB segments stack,
`DecouplerJoint` on a decoupler's connector (required since rev 5007); `NoElectricity` /
`NoServiceFluid` SUBTRACT from the default.

### 2. Feed points — where a consumer draws from

Every combustor and solid motor has a **Feeds from** list (`<FeedsFrom>`). Each entry is
exactly one of:

| Kind          | Means                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| **Parent**    | "whatever the Part that places me wires up" — resolved by layer 3. The default for a reusable thrust chamber. |
| **Connector** | Draw across that connector (needs the matching capability at both ends).                    |
| **Container** | Draw from a specific `<Tank Id>` / `<SolidGrainSegment Id>`, optionally scoped to a placement. |

A combustor also picks a **Plumbing** class: `Bulk` (main engine, needs `BulkFluid`) or
`Service` (RCS, rides the default). `Bulk` is the schema default, so **an RCS thruster must
be switched to Service** or it demands `BulkFluid` from service-only connectors.

### 3. Feed wiring — the Part's answer to "Parent"

**Part Data → Engine → Feed wiring**. One entry per SubPart-level consumer that defers to
its parent, naming the real connector or container. A wiring entry may not itself defer to
Parent. **"Auto-wire unwired consumers"** creates a blank entry for every consumer that
needs one — the one-click fix for the most common mistake; you still pick the feed points.

### Worked example — Core's medium boost engine

```xml
<!-- The reusable thrust chamber: "feed me from whoever places me". -->
<SubPartGameData Id="CorePropulsionA_Subpart_EngineAMedBoostAssembly">
  <Combustor Id="ThrustChamber"><FeedsFrom Parent="true"/>…</Combustor>
</SubPartGameData>

<!-- The prefab that places it answers with a real connector, and opens that connector
     to bulk fluid (without BulkFluid the path is dead). -->
<PartGameData Id="CorePropulsionA_Prefab_EngineAMedBoost">
  <SubPart Id="CorePropulsionA_Subpart_EngineAMedBoostAssembly1"/>
  <ConsumerFeedWiring Id="ThrustChamber" SubPartId="CorePropulsionA_Subpart_EngineAMedBoostAssembly1">
    <FeedsFrom Connector="_connector2"/>
  </ConsumerFeedWiring>
  <Connector Id="_connector2"><Capabilities>BulkFluid</Capabilities></Connector>
</PartGameData>
```

### Pre-flight validation

`src/ksa/engineValidation.ts` grades every problem by what KSA does with it — **blocking**
(KSA throws, the whole mod fails to load) vs **warning** (it loads, the part misbehaves).
Findings appear inline in the Engine panel and again in the Export dialog. Most plumbing
mistakes are warnings, because KSA only logs them.

## Solid rocket motors (SRBs) — real, since KSA 2026.7.9

A solid booster is the solid-family mirror of the liquid trio, authored under **Part Data →
Engine → Solid motor (SRB)** (and per-SubPart in SubPart Data):

- **`<SolidMotor>`** — the case. Picks a `Category="Solid"` reaction (APCP / DoubleBase /
  a custom one), a **grain profile** (`Neutral`, `Progressive`, `Regressive`,
  `BoostSustain`, `BoostSustainBoost` — the thrust curve over the burn), a default chamber
  pressure, and its feed points.
- **`<SolidGrainSegment>`** — the propellant, and the container a motor feeds from. Stacks
  in the VAB across connectors that declare `SolidMotorCase`.
- **`<SolidMotorNozzle>`** — like a De Laval nozzle but with **no area ratio**: KSA sizes
  the throat as `exitArea / 12`.

Rules KSA enforces by THROWING at load (all validated up front): a `<Rocket>` may bind only
solid or only liquid parts, a solid rocket needs ≥1 nozzle, an RCS thruster controller may
not drive a solid motor, the reaction must be solid, and the default pressure must sit
inside that reaction's stable range.

**Custom solid propellants need burn-rate data.** When a custom reaction's category is
`Solid`, four extra fields appear (burn-rate coefficient + exponent, minimum burn pressure,
max stable pressure, exhaust condensed fraction). They are **mandatory** — KSA refuses to
load a solid reaction without them, so flexo omits an incomplete one from the export and
says so. Cloning a shipped solid fills them in.

## XML I/O

`serializeGameData` emits `<Rocket>`/`<Combustor>`/`<DeLavalNozzle>` and the solid trio
`<SolidMotor>`/`<SolidMotorNozzle>`/`<SolidGrainSegment>` per SubPartGameData, the
part-level controllers + gas-generator + `<SubPart Id><Gimbal>` overlays +
`<ConsumerFeedWiring>`, and top-level `<FixedReaction>` for each custom propellant (a
solid one that KSA would refuse to load is skipped with a console warning). Defaults are omitted (efficiencies 1,
`ExhaustDirection` −X, `ExhaustLight` true, `ConstrainToCircle` true, a 0/0 gimbal). Units:
`MaxPressure` as Bar, `ExitDiameter` as M (Cm under 1 m), gimbal angles as Degrees,
`MinimumPulseTime` as Seconds, everything else dimensionless `Value`. The parser
(`partXmlParser.ts`) is the inverse and converts back to SI; `partCatalog.ts` carries engine
data when importing a Core engine (e.g. LR91 Vac). Round-trip tests live in
`partXmlSerializer.test.ts` / `partXmlParser.test.ts`.

## What's NOT possible (data-only limits)

- **Electric/ion/cold-gas engines** — KSA's only thrust source is a combustor burning a
  reaction (no power coupling). Not modelled; needs new game code.
- ~~**True SRBs**~~ — **now possible.** KSA 2026.7.9 added real solid-motor hardware
  (`<SolidMotor>` / `<SolidMotorNozzle>` / `<SolidGrainSegment>`), which flexo authors — see
  the SRB chapter above. The old "SRB (approximate)" liquid-tank preset is superseded by it.
  What flexo still does NOT do is **preview the thrust curve**: sampling it needs a port of
  `SolidMotor.TrySampleThrustCurve` + `GrainGeometryTable` + `ComputeBurningAreaAtDepth`
  (~200 lines), so the grain profile is authored by name and evaluated only in-game.
- **Thermal rockets** — `<ThermalReaction>`s ship in Reactions.xml but need a thermal core,
  which no part template provides; KSA's own designer refuses them. Not modelled.
- **Custom propellant chemistry** is clone-and-remix: the gas LUT is CEA-style pre-solved
  thermodynamics, so flexo copies a shipped reaction (a mixture is baked at its default O/F
  ratio) and lets you adjust the category / mixture / rows — it does not solve combustion
  from scratch.
