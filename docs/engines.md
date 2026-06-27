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
- **`CustomCombustionProcess`** (`<CombustionProcess>`) — an optional user-authored
  propellant (mixture + gas LUT).

**Where they live (matches KSA's two containers):**

| Module | flexo home |
|---|---|
| `Combustor` / `DeLavalNozzle` / `Rocket` (reusable thrust chamber, travels with a mesh) | `SubPartGameData` (next to tanks/lights) |
| `RocketController`, gas-generator `Rocket`/`Combustor`/`Nozzle`, `Gimbal` (per-variant) | `PartGameData` (`part.gameData`), referencing placement **instance ids** |
| `CustomCombustionProcess` | `part.customCombustionProcesses` (top-level) |

Two reference kinds the feature introduces — both remapped on import/paste: module→SubPart
**instance id** (`SubPartIdRef.subPartInstanceId` → `placement.instanceId`) and the
`Gimbal.subPartInstanceId`. See the remap in `editorStore.applyImportedGameData` /
`projectTransfer.mergeGameData`.

## Physics — `src/ksa/enginePhysics.ts`

A verbatim port of KSA's decompiled engine math (`RocketDesign.cs`, `DeLavalNozzleConfig.cs`,
`GasProperties.cs`, `NozzlePerformance.cs`, `CombustionTable.cs`), so flexo shows the SAME
sea-level/vacuum thrust + Isp the in-game `EngineDesigner` previews. Pure numeric (no
react/three/DOM) → runs identically in the browser and vitest. Thrust is real De Laval
physics: `F = ṁ·Vₑ + (Pₑ − P∞)·Aₑ`, `Isp = V_eff / 9.80665`, with choked mass flow,
area-ratio→Mach Newton solve, and over-expansion flow-separation clamping.

Headline API: `predictPerformance({ lut, maxPressurePa, exitDiameterM, areaRatio, …effs })`
→ `{ thrustSLN, thrustVacN, ispSL, ispVac, massFlowRate, throatDiameterM,
flowSeparationSeveritySL, optimumExpansionPa, … }`. Also `deriveAreaRatioForExhaustPressure`
(atmospheric design) and the building blocks (`lutLookup`, `solveMachFromAreaRatio`, …).

Reproduces a real KSA quirk faithfully: `CombustionTable.Lookup` clamps the **topmost**
pressure interval to the ceiling row instead of interpolating (immaterial for real
chamber pressures, far below the table top). Tests in `enginePhysics.test.ts` validate
closed-form identities + real-Hydrolox parity (≈443 s vacuum Isp).

## Combustion catalog — `src/ksa/combustionCatalog.ts` + `src/state/combustionStore.ts`

The propellant library (`Combustion.xml`, served under `/ksa/` alongside the part catalog)
provides the gas LUTs the physics reads. It is licensed Core data kept in the private
asset tree, so it may be **absent** in the open-source build — the editor still authors and
exports engines, just without the live thrust readout (`$hasCombustionData` is false). The
designer's dropdown + readout use `$allCombustionProcesses`/`$allCombustionIndex`, which
merge the Core catalog with the project's `customCombustionProcesses` (custom wins on id).

> `Combustion.xml` is Core game data; if the private-asset sync ever drops it, copy it back
> into `KSA_ASSETS_DIR` (it's referenced by `<Combustion Id>`, not by path, so path-based
> sync won't pull it automatically).

## Authoring UX

- **Sidebar designer** (`$inspectorMode === 'engine'`, `EnginePanel`/`EngineToolbar`):
  entered from the Add menu ("Define Engine…") or the Assets toolbar "Engine (N)" button.
  Pick/define an engine on a placed SubPart, watch the **live SL/vacuum thrust + Isp**,
  edit the chamber/nozzle/FX, place the exhaust with a **3D gizmo** ("Place exhaust in 3D"),
  wire the controller + gimbals, and author custom propellants.
- **Modal sections** (round-trip + no-3D editing): `EngineSections.tsx` renders the
  thrust-chamber editors in **SubPart Data** (`ManageTanksModal`) and the controllers +
  gimbals + gas-generator in **Part Data** (`PartDataButton`, "Engine" section).
- **3D exhaust handle**: `NozzleHandleObject` (cube + direction cone) marks the active
  nozzle's exhaust; the `TransformGizmo` attaches to a proxy at the exhaust world position
  (the pose-pivot precedent in `EditorScene`). A drag streams `updateNozzle` and pushes one
  undo step on drag-start.

## XML I/O

`serializeGameData` emits `<Rocket>`/`<Combustor>`/`<DeLavalNozzle>` per SubPartGameData,
the part-level controllers + gas-generator + `<SubPart Id><Gimbal>` overlays, and top-level
`<CombustionProcess>` for each custom propellant. Defaults are omitted (efficiencies 1,
`ExhaustDirection` −X, `ExhaustLight` true, `ConstrainToCircle` true, a 0/0 gimbal). Units:
`MaxPressure` as Bar, `ExitDiameter` as M (Cm under 1 m), gimbal angles as Degrees,
`MinimumPulseTime` as Seconds, everything else dimensionless `Value`. The parser
(`partXmlParser.ts`) is the inverse and converts back to SI; `partCatalog.ts` carries engine
data when importing a Core engine (e.g. LR91 Vac). Round-trip tests live in
`partXmlSerializer.test.ts` / `partXmlParser.test.ts`.

## What's NOT possible (data-only limits)

- **Electric/ion/cold-gas engines** — KSA's only thrust source is a combustor burning a
  combustion process (no power coupling). Not modelled; needs new game code.
- **True SRBs** — KSA has no solid-motor code. The designer's "SRB (approximate)" preset
  makes a non-throttleable engine + a sealed propellant tank, but thrust is flat (no
  burn-time curve), it stays shutdown-able, and propellant drains like a liquid. Surfaced
  with that warning in the UI.
- **Custom propellant chemistry** is clone-and-remix: the gas LUT is CEA-style pre-solved
  thermodynamics, so flexo copies a shipped process and lets you adjust the mixture / rows —
  it does not solve combustion from scratch.
