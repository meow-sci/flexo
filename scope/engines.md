# Scope — Engines (thrust/Isp physics, combustion, engine designer)

> flexo's most math-heavy KSA port. `src/ksa/enginePhysics.ts` is copied **verbatim** from
> KSA's decompiled De Laval / combustor math, so any formula/constant/default/unit drift is
> **BREAKING** for the live thrust/Isp readout. Read alongside [docs/engines.md](../docs/engines.md)
> and [analysis/KSA_ENGINE_DETAILS.md](../analysis/KSA_ENGINE_DETAILS.md).

**Baseline:** re-vetted against KSA build **2026.7.5.4892** (decomp @ 4892 + shipped Core XML).
**Baseline status:** ✅ **CURRENT — flexo re-modeled** after the rev-4884 Reactions refactor
(the largest engine-contract break since flexo began): `Combustion.xml`/`<CombustionProcess>`
are GONE, replaced by `Reactions.xml` + a `Reaction` class family, and `<Combustor>` now
references `<Reaction Id>` (+ required `<MixtureRatio>` for mixtures). See
"What changed in 4892" below. The nozzle/combustor MATH is untouched — only the LUT source
moved — so `enginePhysics.ts` needed one new port (`sliceLutAtMixtureRatio`), not a re-port.

---

## Flexo modules

| Path                                                          | Role                                                                                                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/enginePhysics.ts`                                    | The verbatim port. `predictPerformance()` + LUT lookup + mixture SliceAt, Mach solve, separation clamp, thrust. Pure numeric.                 |
| `src/ksa/reactionCatalog.ts`                                  | Loads/parses `Reactions.xml` → Fixed (1-D) / Mixture (2-D O/F×lnP) gas LUTs; custom-reaction ⇄ catalog conversion.                            |
| `src/state/engineStore.ts`                                    | Ephemeral Engine Designer state (active template/instance, exhaust gizmo). Not in undo/`$part`.                                               |
| `src/state/reactionStore.ts`                                  | Loaded catalog + Core ∪ project custom reactions (`$allReactionIndex`).                                                                       |
| `src/ui/EnginePanel.tsx`                                      | Full-sidebar designer; `PerformanceReadout` calls `predictPerformance`.                                                                       |
| `src/ui/EngineSections.tsx`                                   | Modal section editors (combustor / nozzle / controllers / gimbals / custom propellants).                                                      |
| `src/ui/EngineToolbar.tsx`, `src/three/NozzleHandleObject.ts` | Engine-mode toolbar; 3D exhaust-location handle.                                                                                              |
| `src/ksa/types.ts`                                            | Engine type defs (`Combustor`, `DeLavalNozzle`, `Rocket`, `RocketController`, `Gimbal`, `SubPartIdRef`, `CustomReaction`, `KNOWN_REACTIONS`). |

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
- `<DeLavalNozzle>`: `Id`, `<ExitDiameter M|Cm>`, `<FxExitDiameter>`, `<AreaRatio Value>`, `<FlowEfficiency Value>`, `<ExpansionEfficiency Value>`, `<ExhaustLocation X Y Z>`, `<ExhaustDirection X Y Z>`, `<FxExhaustLocation>`, `<FxExhaustDirection>`, `<VolumetricExhaust Id>`, `<ExhaustLight Value>`, `<SoundEvent SoundId Action>`.
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
- Persisted projects: model shape changed → stale snapshots are **discarded** by the boot purge
  (`snapshotMatchesModel`), per the constitution.
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
