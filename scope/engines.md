# Scope — Engines (thrust/Isp physics, combustion, engine designer)

> flexo's most math-heavy KSA port. `src/ksa/enginePhysics.ts` is copied **verbatim** from
> KSA's decompiled De Laval / combustor math, so any formula/constant/default/unit drift is
> **BREAKING** for the live thrust/Isp readout. Read alongside [docs/engines.md](../docs/engines.md)
> and [analysis/KSA_ENGINE_DETAILS.md](../analysis/KSA_ENGINE_DETAILS.md).

**Baseline:** re-vetted against KSA build **2026.7.10.5056** (decomp @ 5056 + shipped Core XML).
**Baseline status:** ✅ **CURRENT** — but 5056 landed the first nozzle-schema BREAK since 4939:
`<VolumetricExhaust>`/`<PlumeTrail>` moved inside `<ReactionPlume>` (see
[What changed in 5056](#what-changed-in-5056)). Ported physics remains byte-identical.
4980 (like 4939) left every ported physics class and
`Reactions.xml` byte-identical; the 4939 schema addition (`<PlumeTrail Id>` on the nozzle) is
modeled (see [What changed in 4939](#what-changed-in-4939)). At 4939 the one
schema addition (`<PlumeTrail Id>` on the nozzle) is modeled (see
[What changed in 4939](#what-changed-in-4939)). Previously re-modeled at 4892 after the rev-4884
Reactions refactor
(the largest engine-contract break since flexo began): `Combustion.xml`/`<CombustionProcess>`
are GONE, replaced by `Reactions.xml` + a `Reaction` class family, and `<Combustor>` now
references `<Reaction Id>` (+ required `<MixtureRatio>` for mixtures). See
"What changed in 4892" below. The nozzle/combustor MATH is untouched — only the LUT source
moved — so `enginePhysics.ts` needed one new port (`sliceLutAtMixtureRatio`), not a re-port.

---

## Flexo modules

| Path                                                          | Role                                                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/ksa/enginePhysics.ts`                                    | The verbatim port. `predictPerformance()` + LUT lookup + mixture SliceAt, Mach solve, separation clamp, thrust. Pure numeric.                    |
| `src/ksa/reactionCatalog.ts`                                  | Loads/parses `Reactions.xml` → Fixed (1-D) / Mixture (2-D O/F×lnP) gas LUTs; custom-reaction ⇄ catalog conversion.                               |
| `src/state/engineStore.ts`                                    | Ephemeral Engine Designer state (engine SCOPE — SubPart template or part —, instance, targeted `NozzleRef`, exhaust gizmo). Not in undo/`$part`. |
| `src/state/reactionStore.ts`                                  | Loaded catalog + Core ∪ project custom reactions (`$allReactionIndex`).                                                                          |
| `src/ui/EnginePanel.tsx`                                      | Full-sidebar designer; `PerformanceReadout` calls `predictPerformance`.                                                                          |
| `src/ui/EngineSections.tsx`                                   | Modal section editors (combustor / nozzle / controllers / gimbals / custom propellants).                                                         |
| `src/ui/EngineToolbar.tsx`, `src/three/NozzleHandleObject.ts` | Engine-mode toolbar; the per-nozzle 3D exhaust handles (amber physics / cyan FX).                                                                |
| `src/three/coords.ts` (`exhaust*`)                            | Exhaust location/direction ⇄ owner assembly frame. **Location takes owner scale, direction does not** — see the frame gotcha below.              |
| `src/ksa/engineValidation.ts`                                 | Load-time rules KSA enforces, plus the non-unit-`ExhaustDirection` thrust-multiplier warning.                                                    |
| `src/ksa/types.ts`                                            | Engine type defs (`Combustor`, `DeLavalNozzle`, `Rocket`, `RocketController`, `Gimbal`, `SubPartIdRef`, `CustomReaction`, `KNOWN_REACTIONS`).    |

## Game-side anchors (`decomp/KSA/`) — the ported math

| flexo fn (`enginePhysics.ts`)                                                | KSA source                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `criticalPressureRatio`                                                      | `GasProperties.GetCriticalPressureRatio`                                             |
| `characteristicVelocity`                                                     | `GasProperties.ComputeCharacteristicVelocity`                                        |
| `isochoric/isothermal/isentropic`                                            | `GasProperties.*Process*`                                                            |
| `solveMachFromAreaRatio` (Newton, m₀=2, 20 iters, tol 1e-4, m≥1)             | `RocketDesign.SolveMachNumberFromAreaRatio`                                          |
| `areaRatioFromMach` / `…FromPressure`                                        | `RocketDesign.ComputeAreaRatioFrom*`                                                 |
| `exhaustVelocity`, `inverseNozzlePressureRatioFromMach`                      | `DeLavalNozzleConfig.Compute*`                                                       |
| `combustorConditions`                                                        | `CombustorConfig.ComputeConditions`                                                  |
| `nozzlePerformance` (separation threshold `P_amb·(2/3)·(P_stag/P_amb)^−0.2`) | `DeLavalNozzleConfig.ComputePerformance`                                             |
| `rocketPerformance` (`total = ṁ · max(Vₑ + pressure/ṁ, 0)`)                  | `NozzlePerformance.GetRocketPerformance`, `RocketPerformance`                        |
| `lutLookup` (binary-search lnP, lerp, end-clamp)                             | `FixedReactionTable.Lookup` (behavior-identical to the old `CombustionTable.Lookup`) |
| `sliceLutAtMixtureRatio` (ratio clamp + per-column row lerp)                 | `MixtureReaction.AtMixtureRatio` → `MixtureReactionTable.SliceAt`                    |
| `predictPerformance` (SL=101325 / vac=0 eval)                                | `EngineDesigner.cs` (the canonical reference impl)                                   |

Schema/defaults classes: `CombustorTemplate.cs`, `DeLavalNozzleTemplate.cs`, `RocketTemplate.cs`,
`RocketControllerTemplate.cs`, `GimbalReference.cs`, `ReactionTemplate.cs` (+ `FixedReactionTemplate` /
`MixtureReactionTemplate` / `ThermalReactionTemplate`), `PressureCondition.cs`, `MixtureRatioCondition.cs`,
`ReactionReference.cs`, `ReactionCategory.cs`, `ReactantReference.cs`, `ThrusterMapFlags.cs`,
`SubPartIdReference.cs`.
Assets: `Content/Core/Reactions.xml` (propellant LUTs; also `Volatiles.xml`/`SolidPropellants.xml`
substance phases flexo references only by phase-id string), `Content/Core/CorePropulsionAGameData.xml`.

## The contract — what flexo bakes in

**Constants** (all verified unchanged):

- `G0 = 9.80665` ↔ `RocketNozzleState.cs`, `PartTemplate.cs` (`9.80665f`).
- `UNIVERSAL_GAS_CONSTANT = 8.31446261815324` ↔ `R = Ru/molarMass`.
- `SEA_LEVEL_PRESSURE = 101325`; vacuum eval = `0` Pa.

**Schema element/attribute names flexo emits & parses** (`types.ts` + serializer):

- `<Combustor>`: `Id`, `<Reaction Id>` (with nested `<MixtureRatio>` text element — REQUIRED for
  MixtureReactions, `CombustorTemplate.ResolveReaction` throws without it; KSA clamps it into the
  LUT row range), `<MaxPressure Bar>`, `<ThermalEfficiency Value>`, `<MinimumThrottle Value>`,
  `<MinimumPulseTime Seconds>`.
- `<DeLavalNozzle>`: `Id`, `<ExitDiameter M|Cm>`, `<FxExitDiameter>`, `<AreaRatio Value>`, `<FlowEfficiency Value>`, `<ExpansionEfficiency Value>`, `<ExhaustLocation X Y Z>`, `<ExhaustDirection X Y Z>`, `<FxExhaustLocation>`, `<FxExhaustDirection>`, **`<ReactionPlume Reaction Default>` (repeatable; wraps `<VolumetricExhaust Id>` / `<PlumeTrail Id>` since 5056 — they are NO LONGER direct children)**, `<ExhaustLight Value>`, `<SoundEvent SoundId Action>`.
  **Both scopes, and a LIST at each**: `PartTemplate.RocketNozzles` (`decomp/KSA/PartTemplate.cs:45-47`)
  is legal under `<PartGameData>` and `<SubPartGameData>` alike, and `ApplyGameData` merges the
  SubPart's into the part's (`:245`). Stock uses both — main engines put one nozzle on the
  thrust-chamber SubPart; `PartGameData.xml`'s MMU backpack SubPart authors **56**. flexo's
  designer surfaces both scopes and every index (`$engineEntries` / `$resolvedNozzleTargets`).
- **A SubPart-owned nozzle is instantiated ONCE PER PLACEMENT of its template** — the same
  multi-instance rule as a SubPart-owned `<Collider>` or `<Light>`. KSA turns every
  `<SubPartRef>` into its own child `Part` carrying its own `RocketNozzle` module
  (`decomp/KSA/Part.cs:1144-1152` + `RocketNozzle.CreateComponents`), so
  `CorePropulsionB_Prefab_RCSALargeA`'s **four** thrusters are ONE `<DeLavalNozzle Id="Nozzle">`
  placed four times at four Z rotations. Every built-in RCS prefab is authored this way. ⇒ the
  editor must draw a handle per placement and write back through the clicked placement's frame
  (N views of one document entity — edits move all of them), and a "1 nozzle = 1 thruster"
  assumption is wrong for essentially all stock RCS.
- **The FX pair is an inherit-vs-override switch, not two more fields.**
  `RocketNozzleTemplate.OnDataLoad` copies `ExhaustLocation`/`ExhaustDirection` into whichever
  of `FxExhaustLocation`/`FxExhaustDirection` is ABSENT. So flexo must emit them **iff
  overridden** (`Vec3 | null` in `types.ts`); writing them at their inherited values would
  silently convert an inherit into a hard override and change nothing else. Stock actively
  desyncs them (thrust straight −Z, plume canted) — ~30 `FxExhaustLocation`, 24
  `FxExhaustDirection` across `Content/`.
- `<Rocket>`: `Id`, `<Core Id [SubPartId]>`, `<Nozzle Id [SubPartId]>`.
- `<RocketEngineController>` / `<RocketThrusterController>`: `Id`, `<RocketReference Id [SubPartId]>`, `<ControlMap CSV>`.
- `<Gimbal>` (under `<SubPart Id>`): `<MaxAngleY Degrees>`, `<MaxAngleZ Degrees>`, `<ConstrainToCircle Value>`.
- `<FixedReaction>` (custom propellants; also Core monoprops/solids): `Id`, `Category` attr
  (Bipropellant/Hypergolic/Monopropellant[default]/Solid/Thermal), `<Name Value>`,
  `<Reactant Id MassShare>`, `<PressureCondition>`→`<LnPressure Value>`/`<Temperature K>`/`<Gamma Value>`/`<MolarMass GPerMol>`.
- `<MixtureReaction>` (Core bipropellants; parse-only via the catalog, flexo never authors one):
  adds `<DefaultMixtureRatio>` (text) and wraps the pressure rows in `<MixtureRatioCondition Value>`
  rows (2-D LUT: O/F ratio × lnP, rectangular, exactly 2 reactants = fuel then oxidizer).
- `<ThermalReaction>`: skipped by flexo — needs a thermal core, and no `RocketCoreTemplate`
  subclass provides one yet (KSA's own designer refuses them: "Thermal reactions need a thermal core").

**Numeric defaults**: Combustor `maxPressurePa 5e6`, `thermalEfficiency 1`, `minimumThrottle 1`; Nozzle `exitDiameterM 1`, `flow/expansionEfficiency 1`, `exhaustDirection (−1,0,0)`, `exhaustLight true`, `AreaRatio` NaN-in-KSA (flexo defaults + validates); Gimbal `constrainToCircle true`.

**Enum**: `ThrusterMapFlags` = `None, RollRight/Left, PitchUp/Down, YawRight/Left, TranslateForward/Backward/Right/Left/Down/Up`. Flexo treats `<ControlMap CSV>` as **verbatim string passthrough** (no enum validation).

**File convention**: `Reactions.xml` served under `/ksa/`, referenced by `<Reaction Id>` (not path). May be absent in the OSS build → `$hasReactionData=false`, live readout disabled, authoring/export still work.

## Known gotchas

- `MinimumThrottle` default **1.0** ⇒ on/off (EngineDesigner doesn't emit it).
- `AreaRatio` default **NaN** ⇒ must be supplied.
- `FxExitDiameter` is plume-visual only, ≠ `ExitDiameter`.
- `ExhaustDirection` is the direction exhaust _leaves_; thrust acts along `−ExhaustDirection`.
- **Exhaust vectors are NOT normalized at load, and thrust is applied unnormalized.**
  `Vector3Reference` is bare `[XmlAttribute] X/Y/Z` doubles, and `VehicleUpdateState.cs:294`
  does `TotalThrust * ThrustDirectionVehicleAsmb` — so `|ExhaustDirection|` is a silent thrust
  multiplier. flexo keeps gizmo writes unit-length, leaves typed input verbatim (imports must
  round-trip), and warns (`nozzle-direction-not-unit`). The FX vectors are the opposite case:
  every FX consumer `NormalizeOrZero()`s first and stock ships non-unit ones (`0, 0.550, -1.000`),
  so flexo must NOT normalize them.
- **The two exhaust vectors use DIFFERENT owner frames** — the trap that
  `Vector3.transformDirection` walks straight into. `RocketNozzle.ResetState`
  (`decomp/KSA/RocketNozzle.cs:103-108`) transforms the LOCATION by
  `Parent.MatrixAsmb2VehicleAsmb` (= `Scale · Rotation · Translation`, `Part.cs:217`) but the
  DIRECTION by `Parent.Asmb2VehicleAsmb`, a bare **quaternion** (`Part.cs:644-656`). A
  non-uniform owner scale therefore skews the mesh but not the thrust axis. Also note
  `FxExhaustDirection` is transformed **un-negated** while `ThrustDirection` is negated.
- **There is no rotation/quaternion/Euler field on a nozzle, and no roll.** Orientation is a
  direction vector, full stop; roll about the exhaust axis is undefined by design
  (`Vehicle.SpawnThrusterSparks`, `Vehicle.cs:4828-4830`, builds an arbitrary orthonormal
  basis — the plume is axially symmetric). Nothing is derived from GLB bones/nodes.
- **A rotated `<SubPart><Transform>` carries the exhaust with the mesh** (same owner frame),
  which is why rotating a placement can never fix a _relative_ aim error — only
  `ExhaustDirection` can. Every stock bell is modelled down −X in its own subpart frame;
  canted engines either rotate the whole SubPart (verniers) or write a non-axial vector (RCS).
- KSA's in-game debug overlay (`Vehicle.cs:5030+`) draws a red/white arrow along
  `-ThrustDirection` and a **Cyan/Blue** one along `FxExhaustDirection` only when the FX
  location differs from the physics location. flexo's handle colours mirror this deliberately
  (amber physics / cyan FX) so the overlay reads against what was authored.
- A `<Gimbal>` with both max angles 0 is a silent no-op.
- A `<Part>` with no matching `<PartGameData>` → invisible in picker (the SRB trap).
- KSA computes in `float`, flexo in `double` → sub-0.1% match.
- A combustor referencing a **MixtureReaction without `<MixtureRatio>`** hard-fails at load
  (KSA throws). flexo's UI warns and the readout refuses; the serializer emits whatever is set.
- **Electric/ion/cold-gas engines remain impossible data-only** (no game code path). Solids
  moved closer: `FixedReaction Category="Solid"` (APCP, DoubleBase) exists and CAN drive a
  `<Combustor>` (flexo's SRB recipe now burns APCP) — but there is still no solid-motor
  hardware (no grain-regression thrust curve; the propellant reservoir is still a liquid-style
  tank), so a true SRB is still not reproducible.

## What changed in 5056 — `<ReactionPlume>` (BREAKING) and nothing else

**BREAKING — nozzle exhaust FX re-homed.** rev 5022 ("Allow nozzles to change their
volumetric exhaust style based on the configured reaction") deleted these two fields from
`decomp/KSA/RocketNozzleTemplate.cs`:

```csharp
[XmlElement] public VolumetricExhaustReference? VolumetricExhaust;   // GONE
[XmlElement] public PlumeTrailReference?        PlumeTrail;          // GONE
```

and replaced them with a repeatable list backed by the new `decomp/KSA/ReactionPlumeReference.cs`:

```csharp
[XmlElement("ReactionPlume")] public List<ReactionPlumeReference> ReactionPlumes = new();
// ReactionPlumeReference: [XmlAttribute("Reaction")] string Reaction  (hashed via KeyHash.Make)
//                         [XmlAttribute("Default")]  bool   Default
//                         [XmlElement] VolumetricExhaustReference? VolumetricExhaust
//                         [XmlElement] PlumeTrailReference?        PlumeTrail
```

Wire format, from `Content/Core/CorePropulsionCGameData.xml` (the SRB nozzle, the only shipped
multi-entry user):

```xml
<SolidMotorNozzle Id="Nozzle">
  <ReactionPlume Default="true"><PlumeTrail Id="DefaultPlumeTrail"/></ReactionPlume>
  <ReactionPlume Reaction="DoubleBase"><VolumetricExhaust Id="EngineALarge"/></ReactionPlume>
</SolidMotorNozzle>
```

**Resolution order** (`RocketNozzle.TryResolvePlume`, consumed by `ResetFxState` via
`EffectiveVolumetricExhaust` / `EffectivePlumeTrail`): scan `ReactionPlumes` in order; return
the FIRST entry whose `ReactionHash` equals the rocket core's currently-configured reaction;
otherwise return the FIRST `Default="true"` entry; otherwise no plume at all. So a nozzle that
must always show one plume needs exactly one `Default="true"` entry carrying no `Reaction`.

**Why this was BREAKING for flexo, not silently survivable:** `<DeLavalNozzle>` and
`<SolidMotorNozzle>` are MODELED elements, so their unmodeled children never ride the
`<PartGameData>`/`<SubPartGameData>` `RawXmlNode` passthrough. flexo read
`directChildren(el, 'VolumetricExhaust')` — which now matches nothing — and emitted the old
flat form, which KSA 5056 ignores. Every Core engine lost its plume on import, and every
exported engine lost it in-game.

**Fix (no migration, per the constitution):** `DeLavalNozzle.volumetricExhaustId` /
`.plumeTrailId` and `SolidMotorNozzle`'s pair were REPLACED by
`reactionPlumes: ReactionPlume[]` (`src/ksa/types.ts`). Parser:
`commonNozzleFields` in `src/ksa/partXmlParser.ts` now maps `directChildren(el, 'ReactionPlume')`.
Serializer: `src/ksa/partXmlSerializer.ts` emits one `<ReactionPlume>` per entry, omitting
`Reaction` on the unkeyed fallback and `Default` when false. Persistence:
`projectCodec.ts` swapped the `ve`/`pt` scalars for an `rp[]` array. The editor's two selects
(`src/ui/EngineSections.tsx`) drive the DEFAULT entry via the `defaultReactionPlume` /
`withDefaultReactionPlume` helpers, so reaction-keyed entries round-trip untouched but are not
yet authorable in the UI (**gap P1**).

**Everything else engine-side re-verified INTACT.** `DeLavalNozzleConfig.cs`,
`CombustorConfig.cs`, `GasProperties.cs`, `NozzlePerformance.cs`, `RocketDesign.cs`,
`RocketControllerData.cs`, `EngineDesigner.cs`, `RocketCore.cs`, `Combustor.cs`,
`FixedReaction.cs` and `MixtureReaction.cs` are all **byte-identical** to 5018 — the verbatim
port in `enginePhysics.ts` needed zero changes. `SolidMotorTemplate.Create` still THROWS when
`<DefaultPressure>` is outside `(MinimumBurnPressure, MaxStablePressure]`, so flexo's
`solid-motor-pressure-out-of-range` validation stays correct; the rename
`SolidMotor.DefaultChamberPressure` → `AuthoredChamberPressure` (with a new clamped
`DefaultChamberPressure` property) is runtime-only and below flexo's surface. The new
`[XmlAttribute("Reaction")]` on `SolidMotor.SaveData` and `[XmlAttribute("Grain")]` on
`SolidGrainSegment.SaveData` are **vehicle-save** fields (rev 5022/5023 let the editor swap
solid propellant and per-segment grain), not part-template schema — flexo does not author
vehicle saves.

---

## What changed in 5018 — explicit plumbing + solid rocket motors

The largest engine-contract change since the 4884 Reactions refactor, and unlike that one it
is **additive rather than a rename**: the ported math is untouched, but an engine that
doesn't declare its new plumbing produces no thrust. The topology itself is documented in
[plumbing-and-feeds.md](plumbing-and-feeds.md); this section covers the engine-side schema.

### Ported physics: byte-identical

`DeLavalNozzleConfig.cs`, `CombustorConfig.cs`, `GasProperties.cs`, `NozzlePerformance.cs`,
`RocketDesign.cs`, `RocketControllerData.cs`, `EngineDesigner.cs`, `DeLavalNozzleTemplate.cs`,
`RocketNozzleTemplate.cs`, `MixtureReaction.cs`, `Reaction.cs`, `ReactionTemplate.cs` and
`FixedReactionTable.cs` are all unchanged 4980 → 5018 ⇒ **`enginePhysics.ts` needed zero
changes**. The constants `9.80665`, `8.31446261815324`, `101325` are unchanged. The
runtime-only renames (`RocketNozzleState.Throttle`→`ThrustFraction`,
`PlumeData.ActualExhaustVelocity`→`ApparentExhaustVelocity`,
`ActiveNozzle.ResourceManager`→`Core`, `RocketCore.ResourceManager` moving down to
`Combustor`) have no flexo surface.

### `<FeedsFrom>` + `<Plumbing>` on `<Combustor>` — BREAKING, now modeled

`RocketCoreTemplate` gained `[XmlElement("FeedsFrom")] List<FeedsFromReference>`, and
`OnDataLoad` logs _"Rocket core X declares no FeedsFrom feed points; it will reach no
propellant"_ on an empty list — i.e. **every flexo-exported engine was dead in-game**.
`CombustorTemplate` gained `<Plumbing>` (`PlumbingClass { Bulk, Service }`); `Bulk` is the
default, so an RCS thruster that doesn't declare `Service` demands `BulkFluid` across
service-only connectors and gets nothing. Both are modeled on `Combustor` and authored in
the Engine panel. `createCombustor` now defaults to `feeds: [{ kind: 'parent' }]`.

### Solid rocket motors (revs 4992 / 5002) — new capability

| Element               | KSA class                                               | flexo type                                |
| --------------------- | ------------------------------------------------------- | ----------------------------------------- |
| `<SolidMotor>`        | `SolidMotorTemplate` (a `RocketCoreTemplate`)           | `SolidMotor`                              |
| `<SolidMotorNozzle>`  | `SolidMotorNozzleTemplate` (a `RocketNozzleTemplate`)   | `SolidMotorNozzle`                        |
| `<SolidGrainSegment>` | `SolidGrainSegment.TemplateData` (a `Components` entry) | `SolidGrainSegment`                       |
| `<GrainGeometry>`     | `GrainGeometryTemplate` + `GrainGeometryLibrary`        | `GRAIN_GEOMETRY_IDS` (static id snapshot) |

Load-time rules flexo validates (`src/ksa/engineValidation.ts`), each a **throw**:

- `RocketTemplate.Create` — a `<Rocket>` may bind ONLY solid or ONLY liquid parts, and a
  solid rocket needs ≥1 nozzle.
- `RocketThrusterControllerTemplate.Create` — a thruster (RCS) controller may not drive a
  solid motor.
- `SolidMotorTemplate.Create` — the reaction must be a `Category="Solid"` FixedReaction
  with a burn-rate law, and `<DefaultPressure>` must be **> `MinimumBurnPressure` and
  ≤ `MaxStablePressure`**.

**A `<SolidMotorNozzle>` has NO `<AreaRatio>`** — `SolidMotorNozzleTemplate.Create` sizes
the throat itself as `exitArea / 12`. flexo's `SolidMotorNozzle` deliberately omits the
field and the two nozzle builders/parsers share one body so they cannot drift.
`<SolidGrainSegment>`'s inner `<Grain>` is a `SolidGrainSegmentTemplate` (an
`AsmbVolumetricMassTemplate`): `<Material Id>` + `<OuterRadius M>` + `<WallThickness Mm>` +
`<Length M>` + the inherited `<LocationAsmb>`.

### Solid reactions REQUIRE burn-rate data — BREAKING (crash-class)

`FixedReactionTemplate` gained `<BurnRate CoefficientMPerS Exponent/>`,
`<MinimumBurnPressure>`, `<MaxStablePressure>` and `<ExhaustCondensedFraction>`. For
`Category="Solid"` **all four are mandatory and `Create()` THROWS without them**, failing
the entire mod load — and flexo's category picker has always offered `Solid`. All four
round-trip now; `reactionCatalog` parses them off the live `Reactions.xml` so cloning a
shipped solid seeds them; and `serializeGameData` **skips** (with a warning) any solid
reaction failing `isCustomReactionExportable`. Core's reference values @ 5018:

| Reaction     | a (m/s) | n    | min burn | max stable | condensed           |
| ------------ | ------- | ---- | -------- | ---------- | ------------------- |
| `APCP`       | 0.0045  | 0.35 | 15 bar   | 150 bar    | 0.33696528908145584 |
| `DoubleBase` | 0.0024  | 0.65 | 30 bar   | 100 bar    | 0                   |

### `DefaultEngine` → `DefaultPlumeTrail` — SCHEMA-DRIFT

The inline `<PlumeTrailTemplate Id="DefaultEngine"/>` in `CorePropulsionAGameData.xml` was
DELETED. `Content/Core/PlumeTrailAssets.xml` now declares
`<PlumeTrailTemplate Id="DefaultPlumeTrail"><EndRadius M="80"/></PlumeTrailTemplate>`, and
per rev 4996 ("Only use plume trails on SRBs") Core removed `<PlumeTrail>` from **every
liquid nozzle** — only `<SolidMotorNozzle>`s carry one. `PLUME_TRAIL_IDS` was a dangling
id; it is now `['DefaultPlumeTrail']`.

## What changed in 4980

**INTACT — no flexo change.** `DeLavalNozzleConfig.cs`, `CombustorConfig.cs`,
`GasProperties.cs`, `CombustionTable.cs`, `NozzlePerformance.cs`, `RocketDesign.cs`,
`RocketControllerData.cs`, `EngineDesigner.cs`, and `Reactions.xml` are all absent from the
4939→4980 diff. The engine-adjacent churn is flight-runtime/save only:

- **Fuel-flow-rule persistence + default flip** (revs 4957/4958/4965): the default engine flow
  rule changed `NearestToFurtherestSameStage` → `FurtherestToNearestSameStage`
  (`PartTree.RecreateResourceManagers`), `EngineController.SaveData` gained
  `[XmlElement] FlowRule?` and `RocketCore` a `PersistedFlowRule` — all **vehicle-save**
  schema/runtime; flexo has zero `FlowRule` references (flow rules are a flight concept, not
  part-template data).
- `SequencePerformanceList` (per-sequence Δv/TWR/Isp) was rewritten as an event-driven
  fuel-flow simulation — flexo never ported it; our designer readout uses
  `NozzlePerformance`-derived math only. `FuelLinkList.cs` was deleted (fuel links folded into
  the `PartTreeData` vehicle-save shape) — also outside flexo's surface.

## What changed in 4939

- ✅ **`<PlumeTrail Id>` on the nozzle (SCHEMA-DRIFT, modeled).** `RocketNozzleTemplate` gained
  `[XmlElement] PlumeTrailReference? PlumeTrail` (rev 4900's experimental volumetric plume
  trails; `PlumeTrailReference` = `[XmlAttribute("Id")]` into the new top-level
  `<PlumeTrailTemplate>` asset, id-resolved via `ModLibrary` so mods reference Core's
  `DefaultEngine` without redefining it). Core now authors `<PlumeTrail Id="DefaultEngine"/>`
  on every main engine's `<DeLavalNozzle>` (CorePropulsionA ×3; RCS/vernier none) — inside
  flexo's MODELED nozzle surface, so before this fix an imported engine silently dropped it on
  re-export. Modeled end-to-end: `DeLavalNozzle.plumeTrailId` + `PLUME_TRAIL_IDS`
  (`src/ksa/types.ts`), parse (`partXmlParser.ts` `nozzleFromElement`), emit after
  `<VolumetricExhaust>` (`partXmlSerializer.ts` `buildNozzleElement`), project codec (`pt`),
  nozzle UI select (`src/ui/EngineSections.tsx`). New nozzles default to none (game schema
  default; Core's RCS carries none).
- ✅ **Ported math intact.** `DeLavalNozzleConfig.cs`, `CombustorConfig.cs`, `GasProperties.cs`,
  `CombustionTable.cs`, `NozzlePerformance.cs`, `RocketDesign.cs`, `EngineDesigner.cs`, and
  `Reactions.xml` all absent from the 4892→4939 diff; `DeLavalNozzleTemplate.cs`'s only hunk is
  threading `PlumeTrail` into instance data; `Constants.cs` only ADDED liter conversions
  (9.80665 / 8.31446… / 101325 untouched).
- ℹ️ **Larger SRB parts shipped, still data-faked.** Rev 4909's CorePropulsionC pack ("Booster"
  tag) has **no engine GameData yet** ("not yet configured"); no new data path for true SRBs —
  the APCP `FixedReaction` fake remains the only route. Dev leftovers `FakeSubstances.xml` /
  `FakeCombustion.xml` refs were dropped from Core's `mod.toml` (files already absent at 4892;
  flexo never referenced them).

## What changed in 4892 — the Reactions refactor (rev 4884/4885)

**BREAKING (fixed in the same change).** KSA replaced the flat combustion-process library with a
reaction hierarchy; processes no longer hard-code an O/F ratio. Game-side evidence:

- **Deleted:** `Combustion.xml`, `Substances.xml`, `CombustionObject.cs`, `CombustionProcess.cs`,
  `CombustionProcessTemplate.cs`, `CombustionTable.cs`. `CombustionCondition.cs` → renamed
  `PressureCondition.cs` (same 4 fields). `AssetBundle.cs` no longer maps `<CombustionProcess>` at
  all — an old-style export would be **silently dropped**.
- **Added:** `Reactions.xml` (6 `<MixtureReaction>` + 4 combustor-drivable `<FixedReaction>` + 6
  `<ThermalReaction>`), `Volatiles.xml` + `SolidPropellants.xml` (rich `<Substance>` phase data,
  replacing `Substances.xml`), `Materials.xml` (structural materials), `Content/ThermoToolkit/`
  (the generator, shipped for modders). New classes: `ReactionTemplate` family, `ReactionReference`
  (`Id` attr + optional `MixtureRatio` element), `FixedReactionTable`/`MixtureReactionTable`
  (LUT + `SliceAt`), `ReactionCategory`.
- **`CombustorTemplate.Combustion: SerializedReference` → `Reaction: ReactionReference`** — the
  GameData element renamed `<Combustion Id>` → `<Reaction Id>`, now carrying the required
  `<MixtureRatio>` for mixtures. `CombustorConfig` holds the resolved `FixedReactionTable` LUT;
  `ComputeConditions` math unchanged. `RocketDesign`/`RocketControllerData`/`EngineDesigner` only
  swapped the LUT source (signature churn, zero math drift). `GasProperties.cs`,
  `DeLavalNozzleConfig.cs`, `NozzlePerformance.cs` byte-identical; constants (9.80665,
  8.31446261815324, 101325) intact. `FixedReactionTable.Lookup`/`FindSegment` is
  behavior-identical to the old `CombustionTable.Lookup` (verified against the 4826 source).
- **Removed content:** the LR91 Dev engine (`CorePropulsionA_Prefab_EngineA1_Dev` + its subpart +
  `<Part>` block) and its `<VolumetricExhaustTemplate Id="EngineALargeUpperStage">`; the
  Nepetalactone/Actinidine catnip propellants. Core ids are now `Hydrolox` @ 5.5, `MMH_NTO` @ 1.6
  (was `Hydrolox_5.5`, `MMH_NTO_1.6`).

**flexo changes made (per the no-migration rule — the old forms are gone, not aliased):**

- `combustionCatalog.ts` → **`reactionCatalog.ts`**: parses `Reactions.xml` (Fixed + Mixture;
  Thermal skipped), `resolveReactionLut()` mirrors `CombustorTemplate.ResolveReaction`.
- `enginePhysics.ts`: new `MixtureLut` + `sliceLutAtMixtureRatio()` (port of
  `MixtureReactionTable.SliceAt` + `AtMixtureRatio` ratio clamp). `lutLookup` unchanged.
- `types.ts`: `Combustor.combustionId` → `reactionId` + `mixtureRatio: number | null`;
  `CustomCombustionProcess` → `CustomReaction` (+ `category`); `DEFAULT_REACTION_ID='Hydrolox'` +
  `DEFAULT_MIXTURE_RATIO=5.5`; `KNOWN_REACTIONS` static snapshot (ids, kinds, categories, default +
  min/max O/F from the 4892 LUT rows); `EngineALargeUpperStage` dropped from
  `VOLUMETRIC_EXHAUST_IDS`.
- Parser/serializer: `<Reaction Id><MixtureRatio>` round-trip; custom propellants parse/emit as
  top-level `<FixedReaction>` with `<PressureCondition>` rows.
- `combustionStore.ts` → `reactionStore.ts`; Engine UI gained the O/F mixture-ratio field
  (bounds from the LUT rows, KSA-designer-style default-on-pick) + a "ratio required" warning;
  custom-propellant editor gained a Category select; cloning a mixture bakes it at its default
  ratio (what the game's combustor does). SRB recipe now burns `APCP`.
- Persisted projects: model shape changed → stale snapshots were **discarded** by the boot purge
  (then structural; today the purge is gated by `PROJECT_SCHEMA_VERSION` — see the constitution's
  schema-versioned preservation rule), per the constitution.
- Fixtures re-synced @ 4892 (`PartGameData.xml` also lost its UTF-8 BOM upstream); regression
  tests updated — the Hydrolox parity snapshot is now Isp_vac ≈ 445.4 s / 932.6 kN (the
  ThermoToolkit-regenerated LUT shifted the data slightly; the port itself is unchanged).
- Private mirror: `Reactions.xml` added to `flexo-private-assets/assets/` +
  `copy-assets.ts` discovery regex updated (`<CombustionProcess` → reaction tags).

## What changed in 4826

**Nothing flexo ports.** Decomp diff (4750 → 4826): `RocketControllerData.cs` changed only its
`GetAllRocketTemplates` traversal (`List<RocketTemplate>` → `Span`/`ArrayPool<RocketTemplate>` for
zero-alloc) — the thrust/Isp/mass-flow **math is byte-identical**. `DeLavalNozzleConfig.cs`,
`CombustorConfig.cs`, `GasProperties.cs`, `CombustionTable.cs`, `NozzlePerformance.cs`,
`RocketDesign.cs`, `EngineDesigner.cs`, and `Combustion.xml` are all unchanged. Zero math drift —
`enginePhysics.ts` stays correct. (Note: tanks can now declare a `<CombustionProcess>` propellant —
that's tank data, see [gamedata-modules.md](gamedata-modules.md#what-changed-in-4826), not engine physics.)

## What changed in 4750

- ✅ **rev 4696 thrust-from-template** added `RocketControllerData.ComputeFromRocketTemplates` + `PartTemplate.DrawThrustTooltip` (SL 101325f / vac 0f). This is a **new convenience wrapper that reuses the unchanged runtime math and reproduces flexo's `predictPerformance` step-for-step** — it corroborates the port. _NONE._
- ✅ `RocketCore`/`RocketNozzle`/`EngineDesigner`/`ThrusterMapFlagsReference` diffs = new runtime FX-edge state (`DeactivatedThisFrame`) + logging-codegen + decompiler artifacts. Isp line `EffectiveExhaustVelocity/9.80665` unchanged. _COSMETIC._
- ✅ `Combustion.xml` + `CorePropulsionBGameData.xml` unchanged.
- 🟡 Only `<Diameter M="1"/>` added to 5 engine `<PartGameData>` blocks — editor-only VAB size filter; flexo drops it (covered in the part-size gap). Optional: sum per-chamber thrust to match KSA's new part-aggregate tooltip.

> Housekeeping (resolved in the 4892 pass): the "stray NUL byte" in `src/ui/EngineSections.tsx`
> was actually two intentional `'\0root'`/`'\0none'` sentinel ids written as raw bytes; they are
> now spelled with `\0` escapes so the file greps as text while keeping the non-colliding sentinels.
