# Scope — Engines (thrust/Isp physics, combustion, engine designer)

> flexo's most math-heavy KSA port. `src/ksa/enginePhysics.ts` is copied **verbatim** from
> KSA's decompiled De Laval / combustor math, so any formula/constant/default/unit drift is
> **BREAKING** for the live thrust/Isp readout. Read alongside [docs/engines.md](../docs/engines.md)
> and [analysis/KSA_ENGINE_DETAILS.md](../analysis/KSA_ENGINE_DETAILS.md).

**Baseline:** re-vetted against KSA build **2026.8.22.5348** (decomp @ 5348 + shipped Core XML).
**Baseline status:** ✅ **CURRENT** — 5348 added `<Nozzle AreaRatioMultiplier>`
(`RocketNozzleReference`), which re-apportions a solid stack's throat through
`SolidMotorNozzle.ThroatSizingArea`; **modeled and re-ported in this review** (see
[What changed in 5348](#what-changed-in-5348)). 5261 landed the first ported-math BREAK since 5056,
in the solid-motor nozzle sizing; **re-ported then** (see
[What changed in 5261](#what-changed-in-5261)). Every _other_ verbatim-ported class remains
byte-identical
and no engine template field moved; the one new item, the optional validator-parity gap **Q4**, is
now **mirrored in flexo** (see [What changed in 5117](#what-changed-in-5117)).
Historically: 5056 landed the first nozzle-schema BREAK since 4939:
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

| Path                                             | Role                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/enginePhysics.ts`                       | The verbatim port. `predictPerformance()` + LUT lookup + mixture SliceAt, Mach solve, separation clamp, thrust. Pure numeric.                                                                                       |
| `src/ksa/reactionCatalog.ts`                     | Loads/parses `Reactions.xml` → Fixed (1-D) / Mixture (2-D O/F×lnP) gas LUTs; custom-reaction ⇄ catalog conversion.                                                                                                  |
| `src/state/engineStore.ts`                       | Ephemeral Engine Designer state (engine SCOPE — SubPart template or part —, focused module, targeted `NozzleRef`, exhaust tool). Not in undo/`$part`.                                                               |
| `src/state/reactionStore.ts`                     | Loaded catalog + Core ∪ project custom reactions (`$allReactionIndex`).                                                                                                                                             |
| `src/ksa/solidMotorPhysics.ts`                   | Verbatim port of the solid-motor grain regression: `TrySampleThrustCurve` + `ResizeNozzles` + the burn-rate law + two-phase efficiency.                                                                             |
| `src/ksa/grainGeometryCatalog.ts`                | Parses `GrainGeometries.xml` (burn-area-vs-depth profiles) + `SolidPropellants.xml` (`<StorageDensity KgPerM3>`).                                                                                                   |
| `src/state/solidCurveStore.ts`                   | Loaded grain profiles + solid densities (`$grainIndex`, `$hasSolidCurveData`), preloaded on Engine-mode entry.                                                                                                      |
| `src/ui/engine/EngineNavigator.tsx`              | Engine mode's right sidebar: scope select, define-new flow, module tree, `PerformanceCard` (calls `predictPerformance`), ISSUES, exhaust chips.                                                                     |
| `src/ui/engine/ModuleEditor.tsx` + `*Editor.tsx` | The per-module field editors (combustor / nozzle / solid trio / rocket / controller / gimbal / feed wiring / custom propellant). Scope-agnostic, so Data mode renders the SAME components via `ModuleCardList.tsx`. |
| `src/three/NozzleHandleObject.ts`                | The per-nozzle 3D exhaust handles (amber physics / cyan FX).                                                                                                                                                        |
| `src/three/coords.ts` (`exhaust*`)               | Exhaust location/direction ⇄ owner assembly frame. **Location takes owner scale, direction does not** — see the frame gotcha below.                                                                                 |
| `src/ksa/engineValidation.ts`                    | Load-time rules KSA enforces, plus the non-unit-`ExhaustDirection` thrust-multiplier warning.                                                                                                                       |
| `src/ksa/types.ts`                               | Engine type defs (`Combustor`, `DeLavalNozzle`, `Rocket`, `RocketController`, `Gimbal`, `SubPartIdRef`, `CustomReaction`, `KNOWN_REACTIONS`).                                                                       |

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

## What changed in 5348

**`<Nozzle AreaRatioMultiplier>` — a new attribute that changes solid-motor physics.**
Rev 5329 promoted `RocketTemplate.Nozzles` from `List<SubPartIdReference>` to
`List<RocketNozzleReference>` (new `decomp/KSA/RocketNozzleReference.cs`), a subclass adding one
field:

```csharp
[XmlAttribute] public double AreaRatioMultiplier = 1.0;   // OnDataLoad: <= 0 is reset to 1
```

It is not decoration. `SolidMotorNozzle` gained
`ThroatSizingArea => Config.ExitArea / AreaRatioMultiplier`, and **both** stack-wide solids
routines switched to it:

| `SolidMotor.cs`            | before 5348            | at 5348                          |
| -------------------------- | ---------------------- | -------------------------------- |
| `ResizeNozzles` total      | `Σ Config.ExitArea`    | `Σ ThroatSizingArea`             |
| `ResizeNozzles` per-throat | `ExitArea / ratio`     | `ThroatSizingArea / ratio`       |
| `ComputeTotalThroatArea`   | `ExitArea / totalExit` | `ThroatSizingArea / totalSizing` |

Because a solid motor solves ONE area ratio for the whole stack, the multiplier is a way to make
one nozzle claim less of the shared throat and therefore run at a larger expansion ratio than its
siblings. Core uses it that way on the launch-escape tower:

```xml
<Rocket Id="Motor">
  <Core Id="MotorCore"/>
  <Nozzle Id="Nozzle" SubPartId="CorePropulsionA_Subpart_SRBSizeBNozzleA5"/>
  <Nozzle Id="Nozzle" SubPartId="CorePropulsionA_Subpart_SRBSizeBNozzleA6" AreaRatioMultiplier="1.0025"/>
  <Nozzle Id="Nozzle" SubPartId="CorePropulsionA_Subpart_SRBSizeBNozzleA7"/>
</Rocket>
```

`RocketTemplate.CreateComponents` calls `SetAuthoredAreaRatioMultiplier` only for a
`SolidMotorNozzle` and logs an Error for a non-1 value on a De Laval nozzle. flexo models it as
`RocketNozzleRef.areaRatioMultiplier` (parsed, emitted only when ≠ 1, persisted in the compact
codec as `m`) and `solidMotorPhysics.ts` now carries `ResolvedNozzle.throatSizingAreaM2`. On a
one-nozzle motor the factor divides out exactly; it only apportions between siblings.

**`RocketControllerData.ComputeFromRocketTemplates` was DELETED — a citation move, not a break.**
Rev 5340 "deleted the parallel universe of code that computes part characteristics from XML
templates," instantiating a real `Part` and inspecting its game data instead. The surviving
instance-side `ComputeFromRockets` is byte-identical and the physics it performs is the same chain
(`ExitDiameter → area`, `area / AreaRatio → throat`, `ComputeConditions`, `ComputePerformance`), so
`enginePhysics.ts` needs no re-port. `PartTemplate`'s tooltip helpers went with it.

**A new NaN guard on the De Laval throat.** `DeLavalNozzleTemplate.Create` now routes through
`DeLavalNozzle.ComputeThroatArea(exitArea, areaRatio)` = `areaRatio > 0 ? exitArea / areaRatio :
exitArea`, so a NaN or zero `<AreaRatio>` degrades to ratio 1 rather than producing NaN thrust.
`<AreaRatio>` remains **required** in practice and `engineValidation.ts`'s finding stays correct —
ratio 1 is not a usable engine, it just no longer poisons the frame.

Everything else re-verified byte-identical: `DeLavalNozzleConfig`, `CombustorConfig`,
`GasProperties`, `NozzlePerformance`, `RocketDesign`, `EngineDesigner`, the whole reaction family
and `GrainGeometryTemplate`. `SolidMotorNozzleTemplate.Create` still seeds `ThroatArea = exitArea /
12`; `SolidMotorNozzle`/`DeLavalNozzle`/`RocketNozzle` otherwise gained only the `IRescale` path and
a save-data block (`<SolidMotorNozzleData AreaRatioMultiplier>` is a vehicle-save record, not part
XML). `Combustor`, `RocketCore`, `RocketControllerTemplate` and `GrainGeometryLibrary` changed by
decompiler shape only.

---

## What changed in 5261

**Verdict: BREAKING (✅ FIXED) on the solid-motor path; NONE elsewhere.**

### `SolidMotor.ResizeNozzles` — the area-ratio clamps swapped precedence (rev 5173)

The changelog line is _"Clarified which of the area ratio clamps win in the case where they cross
each other."_ It is a real semantic change to a **verbatim-ported** function.

Before 5261, the high bound came first and the low bound was clamped **into** it:

```csharp
float num3 = ComputeTotalThroatArea(num, MaxStablePressure, num2);
MaxAreaRatioBound = num2 / num3;
if (MaxAreaRatioBound < 1.2f) return "Stack too large for the nozzle";
...
MinAreaRatioBound = ((num7 < float.MaxValue) ? Math.Clamp(num2 / num7, 1.2f, MaxAreaRatioBound)
                                            : MaxAreaRatioBound);
```

At 5261 the order is inverted and the rejection is **deleted**:

```csharp
MinAreaRatioBound = ((num6 < float.MaxValue) ? MathF.Max(num2 / num6, 1.2f) : 1.2f);
float num7 = ComputeTotalThroatArea(num, MaxStablePressure, num2);
MaxAreaRatioBound = MathF.Max(num2 / num7, MinAreaRatioBound);
```

Three consequences:

1. **The low bound wins where they cross.** `MinAreaRatioBound` is now derived on its own and
   `MaxAreaRatioBound` is raised to meet it, rather than the reverse.
2. **The `1.2` fallback changed.** When neither the ignition nor the valley throat is finite, the
   low bound is a flat `1.2`; it used to fall back to `MaxAreaRatioBound`.
3. **`"Stack too large for the nozzle"` no longer exists.** A stack whose peak burning area demands
   a ratio below `1.2` now simply runs at the `1.2` floor.

Everything downstream (`num8` design throat, the `Math.Clamp(ManualAreaRatio ?? …)` selection, the
per-nozzle `ThroatArea = ExitArea / areaRatio` write-back, and
`PeakChamberPressure = MaxStablePressure * pow(peakThroat / (exit / ratio), 1/(1-n))`) is unchanged.

**flexo impact.** `resizeNozzles` in `src/ksa/solidMotorPhysics.ts` was a faithful port of the OLD
form, so it refused a thrust curve (`'stack-too-large'`) for motors the game now sizes happily —
an oversized-grain design showed "preview unavailable" in the editor and would have flown fine.
Re-ported to the 5261 ordering, and `'stack-too-large'` removed from the `ThrustCurveFailure` union
outright (no back-compat, per the no-migration rule). Covered by a new `solidMotorPhysics.test.ts`
case whose motor lands **exactly** on the `1.2` floor — the case the old code rejected.

### Solid propellant re-formulation (rev 5173, data only)

`Reactions.xml` re-formulated the double-base propellant "as a platonized variant to reduce its
burn rate": `<BurnRate CoefficientMPerS>` 0.0024 → 0.0047, `Exponent` 0.65 → 0.3, and
`<MinimumBurnPressure Bar>` 30 → 15. flexo reads these live from the private mirror
(`reactionStore` / `solidCurveStore`), so curves move but no code does.

### Re-verified intact

Every other ported class is **byte-identical**: `DeLavalNozzleConfig`, `CombustorConfig`,
`GasProperties`, `NozzlePerformance`, `RocketDesign`, `RocketNozzleTemplate`, the reaction family
(`ReactionTemplate` / `FixedReactionTable` / `MixtureReactionTable` / `ReactionPlumeReference`),
`RocketCoreTemplate`, `SolidTemplate`, `SolidGrainSegmentTemplate`, `GrainGeometry` /
`GrainGeometryTable` / `GrainGeometryLibrary`, and every solid mass template. `EngineDesigner`'s
37-line diff is entirely rev 5169's `ToNearest` display refactor.

Two runtime-only changes worth recording because they _look_ like contract movement and are not:
`RocketControllerData.ComputeFromCores` gained a `throttle` parameter and flipped its
`MinimumThrottle` aggregate from `Math.Max` (seeded 0) to `Math.Min` (seeded 1) — that is a
**vehicle-level** aggregation across cores which flexo does not port (flexo only parses/emits
`<MinimumThrottle Value>` per combustor). And `RocketNozzle` gained an abstract `ThroatArea` plus
`ThroatRadius`/`ThroatDensity`/`InletTemperature` on its FX state, feeding rev 5174's
raymarch-into-the-nozzle exhaust — visual only.

## What changed in 5168

**Verdict: ✅ CURRENT — every verbatim-ported class is byte-identical.** Re-confirmed with `cmp`
against the 5168 decomp: `DeLavalNozzleConfig`, `CombustorConfig`, `GasProperties`,
`NozzlePerformance`, `RocketDesign`, `RocketControllerData`, `EngineDesigner`, `RocketNozzleTemplate`,
plus the reaction family (`ReactionTemplate`, `FixedReactionTable`, `MixtureReactionTable`) and the
**entire solid-motor template + geometry set** (`SolidTemplate`, `SolidMotorTemplate`,
`SolidMotorNozzleTemplate`, `SolidGrainSegmentTemplate`, `GrainGeometry`, `GrainGeometryTemplate`,
`GrainGeometryTable`, `GrainGeometryLibrary`). So `enginePhysics.ts`, `solidMotorPhysics.ts`,
`grainGeometryCatalog.ts` and `reactionCatalog.ts` need **no re-port**, and the constants
`9.80665` / `8.31446261815324` / `101325` are untouched.

Three changelog items that _sound_ like engine-contract movement and are not:

- **rev 5124, "corrected the size of solid propellant grains built in to the nozzle segments for
  size D and size E SRBs"** — a pure **Core data** retune, not a schema or math change. It lands in
  `CorePropulsionCGameData.xml` as `<OuterRadius>` / `<Length>` / `<LocationAsmb>` value edits
  (2 each). flexo reads those values live from the mirror; nothing is baked in.
- **rev 5125, "added an AreaReference"** — a new unit-reference class used to print burning area in
  the editor (`SolidGrainSegment.DrawGrainInfo` now formats via `AreaReference.ToNearest`). It sits
  on **no** template, so it is not an authored surface. See
  [gamedata-modules.md](gamedata-modules.md#what-changed-in-5168).
- **rev 5125 solid-motor editor info** — `SolidMotor.TrySampleThrustCurve` changed signature from
  `Span<float> thrustNewtons` to a `ThrustCurveSamples` ref-struct carrying **three** parallel spans
  (`ThrustNewtons`, `IspSeconds`, `ChamberPressurePascals`). This is the game's own editor preview,
  which flexo does not port — but it is worth recording against the still-open _solid thrust-curve
  preview_ gap: if flexo ever builds that preview, KSA now shows Isp and chamber pressure alongside
  thrust, and `ThrustCurveSamples.IsValid` requires `Length >= 2` with all three spans equal-length.

Electric engines remain impossible data-only; nothing in 5168 opens a data path for them.

---

## What changed in 5117

**Ported physics byte-identical — re-verified INTACT. One optional new capability.**

Every verbatim-ported class is unchanged at 5117: `DeLavalNozzleConfig.cs`, `CombustorConfig.cs`,
`GasProperties.cs`, `CombustionTable.cs`, `NozzlePerformance.cs`, `RocketDesign.cs`,
`RocketControllerData.cs` and `EngineDesigner.cs` do not appear in the `5056 → 5117` decomp diff
at all, so `src/ksa/enginePhysics.ts` needs no re-port and the constants (`9.80665`,
`8.31446261815324`, `101325`) stand. `Reactions.xml` is unchanged. `RocketControllerTemplate.cs`,
`Rocket.cs`, `RocketCore.cs`, `RocketNozzle.cs` and `SolidMotor.cs` changed **only** by gaining
warning logs and UI fill-bars; no template field moved.

**Engine-wiring warnings — gap Q4 ✅ MIRRORED IN FLEXO.** Rev 5091 ("Added many warnings for part
modules which are not wired up correctly in the template XML") added five `Warning`-level checks.
All are silent-no-thrust failures — exactly the class of bug `validateEngines`
(`src/ksa/engineValidation.ts`) exists for — so flexo now emits all five at **`warn`** severity
(KSA loads the mod, then the part misbehaves), each carrying `EngineIssue.source` so the Engine /
Data findings surfaces can jump to the offending module:

| Game-side site (decomp @ 5117)                           | Warning                                                                                           | flexo code                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| `KSA/RocketControllerTemplate.cs:16-28` `OnDataLoad`     | controller with an empty `RocketReferences` list — "references no Rockets; it will drive nothing" | `controller-no-rockets`    |
| `KSA/Rocket.cs:21-42` `OnFullPartCreated`                | rocket with a core but `Nozzles.Length == 0` — "no nozzles; it will produce no thrust"            | `rocket-no-nozzles`        |
| `KSA/RocketNozzle.cs:106-121` `OnFullPartCreated`        | nozzle no `<Rocket>` names — "referenced by no Rocket … will produce no thrust"                   | `nozzle-not-referenced`    |
| `KSA/RocketCore.cs:24-59` `OnFullPartCreated`            | core no `<Rocket>` names as its `Core`, or whose rocket has no controller — "cannot be activated" | `core-not-referenced`      |
| `KSA/PartTemplate.cs:494-580` `AddResolvedFeed` (wiring) | a `<ConsumerFeedWiring>` feed point that resolves to nothing                                      | `wiring-feed-unresolvable` |

Two deliberate narrowings, so a new warning never duplicates an existing finding:

- `rocket-no-nozzles` fires only for a **liquid/unresolved** core — a SOLID core with no nozzle
  is already `solid-rocket-needs-nozzle` (a `block`: `RocketTemplate.Create` throws).
- `wiring-feed-unresolvable` covers the feed points inside a `<ConsumerFeedWiring>` entry.
  A CONSUMER's own `<FeedsFrom>` keeps its existing `feed-unknown-container` /
  `feed-unknown-connector` codes; `consumer-not-wired` still covers a `Parent="true"` consumer
  with no wiring entry at all (`PartTemplate.cs:468-483`).

Nozzle/core reference matching is by **id only**, where KSA matches a full `SubPartIdReference`
(id + scope): a scope mismatch is a different authoring mistake, and reporting "referenced by
nothing" for a nozzle that is plainly named would read as a false alarm.

**Substance data (informational).** `Volatiles.xml` / `SolidPropellants.xml` gained
`<Substance DefaultPhase="Gas|Liquid|Solid">` and a `<Color R G B>` child (`SubstanceTemplate.cs`

- new `SubstancePhaseName.cs`), which also changed the **display** names KSA builds
  (`"Gaseous X"` → `"X Vapor"`, and the default phase now renders bare). flexo consumes only
  substance-phase **ids** (`base.Id + "(g)"/"(l)"/"(s)"`, e.g. `H2(l)`), which are unchanged — no
  impact.

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
(`src/ui/engine/NozzleEditor.tsx`) drive the DEFAULT entry via the `defaultReactionPlume` /
`withDefaultReactionPlume` helpers — the fast path — and its **"Plume entries" disclosure**
authors the FULL list (per row: Default switch ⟷ reaction select, plume select, trail select,
remove; "+ Entry") through the discrete `updateReactionPlumes(locator, plumes)` action in
`src/state/editorStore.ts`. **Gap P1 ✅ CLOSED** — reaction-keyed entries are now authorable,
not merely round-tripped.

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

⚠️ **`exitArea / 12` is only the SEED.** `PartTree.ResolveSolidMotorStacks` calls
`SolidMotor.ResizeNozzles()` whenever a motor's grain stack resolves, and that RE-DERIVES the
area ratio from the peak burning area, clamped between bounds set by the reaction's
`(MinimumBurnPressure·1.02 … MaxStablePressure)` window and floored at
`SolidMotorNozzle.MINIMUM_AREA_RATIO = 1.2` — then writes `ThroatArea = ExitArea / ratio` onto
every nozzle. Anything that predicts solid performance must resize first; the authored XML
never carries the ratio the motor actually runs at.

### Solid thrust-curve preview — `src/ksa/solidMotorPhysics.ts` (ported, was a documented gap)

flexo now previews the burn. `src/ksa/solidMotorPhysics.ts` is a **verbatim port** on the same
terms as `enginePhysics.ts` (identical formulae, constants, iteration counts and clamps), from
the decomp at **2026.8.3.5117**:

| Game-side member (`decomp/KSA/`)                                   | flexo                                          |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| `GrainGeometryTable.Lookup` / `MaxDepth` / `InitialGrainArea`      | `grainLookup` + `grainGeometryCatalog.ts`      |
| `SolidGrainSegment.ComputeBurningAreaAtDepth` (`:230-256`)         | `burningAreaAtDepth`                           |
| `SolidGrainSegment.ComputeGrainMassAtDepth`                        | `grainMassAtDepth`                             |
| `BurnRateLaw.Evaluate` = `a·(p·1e−6)^n` (`BurnRateLaw.cs:11-15`)   | `evaluateBurnRate`                             |
| `SolidMotorNozzle.RefreshTwoPhaseEfficiency` (`:32-36`)            | `twoPhaseEfficiency`                           |
| `SolidMotor.SolveConditionsForArea` (`:481-516`)                   | `solveConditionsForArea`                       |
| `SolidMotor.ComputeTotalThroatArea` / `ResizeNozzles` (`:397-455`) | `resizeNozzles`                                |
| `SolidMotor.TrySampleThrustCurve` (`:299-395`)                     | `sampleThrustCurve`                            |
| `NozzlePerformance.GetTotalThrust` (`:43-46`)                      | `totalThrust` (momentum + pressure, unclamped) |

Two facts the port depends on, both verified in the decomp:

- **Two-phase efficiency**: `clamp(1 − condensedFraction·(0.076 + 0.046·ln(areaRatio)), 0.5, 1)`,
  applied to `ActualExhaustVelocity` AFTER `DeLavalNozzleConfig.ComputePerformance` — mass flow
  is untouched, so the chamber-pressure fixed point is unaffected.
- **Depth normalization**: a grain profile's three columns are dimensionless, divided by
  `CasingInnerRadius = OuterRadius − WallThickness`; burning area is `perimeter · r · length`.

**Two new served files** (both licensed Core data under `/ksa/`, both parsed by
`src/ksa/grainGeometryCatalog.ts`, both loaded by `src/state/solidCurveStore.ts` on Engine-mode
entry):

| File                   | Read for                                                                          |
| ---------------------- | --------------------------------------------------------------------------------- |
| `GrainGeometries.xml`  | `<GrainGeometry Id>` → `<DepthCondition><Depth/><Perimeter/><PortArea/>` triplets |
| `SolidPropellants.xml` | `<Substance Id><Solid><StorageDensity KgPerM3>` — the grain density               |

Both are OPTIONAL at runtime, the same tolerance contract `Reactions.xml` has: absent ⇒ empty
catalog ⇒ the card shows "preview unavailable — the engine still exports correctly". The
preview also returns nothing for a **custom propellant**, which has no `<StorageDensity>` to
read; flexo never invents a density.

**Deliberate scope limit**: in game a motor's grain stack also grows across `SolidMotorCase`
connectors into neighbouring PARTS (`PartTree.ResolveSolidMotorStack`). That is a
vehicle-assembly fact a single-part editor cannot know, so flexo's stack is exactly the grain
segments the motor's own `<FeedsFrom Container>` names.

### Solid reactions REQUIRE burn-rate data — BREAKING (crash-class)

`FixedReactionTemplate` gained `<BurnRate CoefficientMPerS Exponent/>`,
`<MinimumBurnPressure>`, `<MaxStablePressure>` and `<ExhaustCondensedFraction>`. For
`Category="Solid"` **all four are mandatory and `Create()` THROWS without them**, failing
the entire mod load — and flexo's category picker has always offered `Solid`. All four
round-trip now; `reactionCatalog` parses them off the live `Reactions.xml` so cloning a
shipped solid seeds them; and `serializeGameDataXml` **skips** (with a warning) any solid
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
  nozzle UI select (`src/ui/engine/NozzleEditor.tsx`). New nozzles default to none (game schema
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

> Housekeeping (resolved in the 4892 pass): the "stray NUL byte" in the v1 `EngineSections.tsx`
> (since split into `src/ui/engine/*`)
> was actually two intentional `'\0root'`/`'\0none'` sentinel ids written as raw bytes; they are
> now spelled with `\0` escapes so the file greps as text while keeping the non-colliding sentinels.
