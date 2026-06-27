# Scope — Engines (thrust/Isp physics, combustion, engine designer)

> flexo's most math-heavy KSA port. `src/ksa/enginePhysics.ts` is copied **verbatim** from
> KSA's decompiled De Laval / combustor math, so any formula/constant/default/unit drift is
> **BREAKING** for the live thrust/Isp readout. Read alongside [docs/engines.md](../docs/engines.md)
> and [analysis/KSA_ENGINE_DETAILS.md](../analysis/KSA_ENGINE_DETAILS.md).

**Baseline:** verified against KSA build **2026.6.9.4750**.
**Baseline status:** ✅ **INTACT** — every physics/schema class flexo ports is byte-identical
OLD→NEW. The only delta is the new optional `<Diameter>` (catalog size filter, no physics
impact) covered in [part-and-subpart-xml.md](part-and-subpart-xml.md).

---

## Flexo modules

| Path                                                          | Role                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/enginePhysics.ts`                                    | The verbatim port. `predictPerformance()` + LUT lookup, Mach solve, separation clamp, thrust. Pure numeric.                         |
| `src/ksa/combustionCatalog.ts`                                | Loads/parses `Combustion.xml` → gas LUTs (`pressure=exp(lnPressure)`, `R=Ru/molarMass`); custom-propellant ⇄ catalog conversion.    |
| `src/state/engineStore.ts`                                    | Ephemeral Engine Designer state (active template/instance, exhaust gizmo). Not in undo/`$part`.                                     |
| `src/state/combustionStore.ts`                                | Loaded catalog + Core ∪ project custom processes (`$allCombustionIndex`).                                                           |
| `src/ui/EnginePanel.tsx`                                      | Full-sidebar designer; `PerformanceReadout` calls `predictPerformance`.                                                             |
| `src/ui/EngineSections.tsx`                                   | Modal section editors (combustor / nozzle / controllers / gimbals / custom propellants).                                            |
| `src/ui/EngineToolbar.tsx`, `src/three/NozzleHandleObject.ts` | Engine-mode toolbar; 3D exhaust-location handle.                                                                                    |
| `src/ksa/types.ts`                                            | Engine type defs (`Combustor`, `DeLavalNozzle`, `Rocket`, `RocketController`, `Gimbal`, `SubPartIdRef`, `CustomCombustionProcess`). |

## Game-side anchors (`decomp/KSA/`) — the ported math

| flexo fn (`enginePhysics.ts`)                                                | KSA source                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `criticalPressureRatio`                                                      | `GasProperties.GetCriticalPressureRatio`                      |
| `characteristicVelocity`                                                     | `GasProperties.ComputeCharacteristicVelocity`                 |
| `isochoric/isothermal/isentropic`                                            | `GasProperties.*Process*`                                     |
| `solveMachFromAreaRatio` (Newton, m₀=2, 20 iters, tol 1e-4, m≥1)             | `RocketDesign.SolveMachNumberFromAreaRatio`                   |
| `areaRatioFromMach` / `…FromPressure`                                        | `RocketDesign.ComputeAreaRatioFrom*`                          |
| `exhaustVelocity`, `inverseNozzlePressureRatioFromMach`                      | `DeLavalNozzleConfig.Compute*`                                |
| `combustorConditions`                                                        | `CombustorConfig.ComputeConditions`                           |
| `nozzlePerformance` (separation threshold `P_amb·(2/3)·(P_stag/P_amb)^−0.2`) | `DeLavalNozzleConfig.ComputePerformance`                      |
| `rocketPerformance` (`total = ṁ · max(Vₑ + pressure/ṁ, 0)`)                  | `NozzlePerformance.GetRocketPerformance`, `RocketPerformance` |
| `lutLookup` (binary-search lnP, lerp, end-clamp)                             | `CombustionTable.Lookup`                                      |
| `predictPerformance` (SL=101325 / vac=0 eval)                                | `EngineDesigner.cs` (the canonical reference impl)            |

Schema/defaults classes: `CombustorTemplate.cs`, `DeLavalNozzleTemplate.cs`, `RocketTemplate.cs`,
`RocketControllerTemplate.cs`, `GimbalReference.cs`, `CombustionProcessTemplate.cs`,
`CombustionCondition.cs`, `ReactantReference.cs`, `ThrusterMapFlags.cs`, `SubPartIdReference.cs`.
Assets: `Content/Core/Combustion.xml` (propellant LUTs), `Content/Core/CorePropulsionAGameData.xml`.

## The contract — what flexo bakes in

**Constants** (all verified unchanged):

- `G0 = 9.80665` ↔ `RocketNozzleState.cs`, `PartTemplate.cs` (`9.80665f`).
- `UNIVERSAL_GAS_CONSTANT = 8.31446261815324` ↔ `R = Ru/molarMass`.
- `SEA_LEVEL_PRESSURE = 101325`; vacuum eval = `0` Pa.

**Schema element/attribute names flexo emits & parses** (`types.ts` + serializer):

- `<Combustor>`: `Id`, `<Combustion Id>`, `<MaxPressure Bar>`, `<ThermalEfficiency Value>`, `<MinimumThrottle Value>`, `<MinimumPulseTime Seconds>`.
- `<DeLavalNozzle>`: `Id`, `<ExitDiameter M|Cm>`, `<FxExitDiameter>`, `<AreaRatio Value>`, `<FlowEfficiency Value>`, `<ExpansionEfficiency Value>`, `<ExhaustLocation X Y Z>`, `<ExhaustDirection X Y Z>`, `<FxExhaustLocation>`, `<FxExhaustDirection>`, `<VolumetricExhaust Id>`, `<ExhaustLight Value>`, `<SoundEvent SoundId Action>`.
- `<Rocket>`: `Id`, `<Core Id [SubPartId]>`, `<Nozzle Id [SubPartId]>`.
- `<RocketEngineController>` / `<RocketThrusterController>`: `Id`, `<RocketReference Id [SubPartId]>`, `<ControlMap CSV>`.
- `<Gimbal>` (under `<SubPart Id>`): `<MaxAngleY Degrees>`, `<MaxAngleZ Degrees>`, `<ConstrainToCircle Value>`.
- `<CombustionProcess>`: `Id`, `<Name Value>`, `<Reactant Id MassShare>`, `<CombustionCondition>`→`<LnPressure Value>`/`<Temperature K>`/`<Gamma Value>`/`<MolarMass GPerMol>`.

**Numeric defaults**: Combustor `maxPressurePa 5e6`, `thermalEfficiency 1`, `minimumThrottle 1`; Nozzle `exitDiameterM 1`, `flow/expansionEfficiency 1`, `exhaustDirection (−1,0,0)`, `exhaustLight true`, `AreaRatio` NaN-in-KSA (flexo defaults + validates); Gimbal `constrainToCircle true`.

**Enum**: `ThrusterMapFlags` = `None, RollRight/Left, PitchUp/Down, YawRight/Left, TranslateForward/Backward/Right/Left/Down/Up`. Flexo treats `<ControlMap CSV>` as **verbatim string passthrough** (no enum validation).

**File convention**: `Combustion.xml` served under `/ksa/`, referenced by `<Combustion Id>` (not path). May be absent in the OSS build → `$hasCombustionData=false`, live readout disabled, authoring/export still work.

## Known gotchas

- `MinimumThrottle` default **1.0** ⇒ on/off (EngineDesigner doesn't emit it).
- `AreaRatio` default **NaN** ⇒ must be supplied.
- `FxExitDiameter` is plume-visual only, ≠ `ExitDiameter`.
- `ExhaustDirection` is the direction exhaust _leaves_; thrust acts along `−ExhaustDirection`.
- A `<Gimbal>` with both max angles 0 is a silent no-op.
- A `<Part>` with no matching `<PartGameData>` → invisible in picker (the SRB trap).
- KSA computes in `float`, flexo in `double` → sub-0.1% match.
- **Electric/ion/cold-gas engines and true SRBs are impossible data-only** (no game code path).

## What changed in 4750

- ✅ **rev 4696 thrust-from-template** added `RocketControllerData.ComputeFromRocketTemplates` + `PartTemplate.DrawThrustTooltip` (SL 101325f / vac 0f). This is a **new convenience wrapper that reuses the unchanged runtime math and reproduces flexo's `predictPerformance` step-for-step** — it corroborates the port. _NONE._
- ✅ `RocketCore`/`RocketNozzle`/`EngineDesigner`/`ThrusterMapFlagsReference` diffs = new runtime FX-edge state (`DeactivatedThisFrame`) + logging-codegen + decompiler artifacts. Isp line `EffectiveExhaustVelocity/9.80665` unchanged. _COSMETIC._
- ✅ `Combustion.xml` + `CorePropulsionBGameData.xml` unchanged.
- 🟡 Only `<Diameter M="1"/>` added to 5 engine `<PartGameData>` blocks — editor-only VAB size filter; flexo drops it (covered in the part-size gap). Optional: sum per-chamber thrust to match KSA's new part-aggregate tooltip.

> Housekeeping note surfaced during this review: `src/ui/EngineSections.tsx` contains a stray NUL byte (~offset 3447) flagged by `grep` as binary. Harmless to build; worth a cleanup pass.
