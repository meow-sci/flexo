# KSA Engine System — Deep Technical Analysis

**Purpose:** A complete, source-verified reference for how rocket engines work in KSA (Kitten Space Agency), what XML it takes to define a brand-new engine that reuses existing meshes, and where the gaps are for electric engines and SRBs. This is the factual substrate for the flexo "Engine Designer" feature (see `plans/KSA_ENGINE_DESIGNER_PLAN.md`).

**Sources (authoritative):**

- Decompiled C#: `/Users/asherwin/repos/meow-sci/ksa-game-assemblies/current/decomp/KSA/` (the real `[XmlType]`/`[XmlElement]` schema lives here, not in the asset XML)
- Game data XML: `/Users/asherwin/repos/meow-sci/ksa-game-assemblies/current/Content/Core/`

Every formula and default in this document was read directly from the decomp and cross-checked against shipped data. `File.cs:line` citations are to the decomp `KSA/` directory unless noted.

---

## 0. Executive summary (read this first)

1. **An "engine" is not one object.** It is a small graph of cooperating data modules layered onto a Part and its SubParts:
   - `<Combustor>` — the combustion chamber (burns propellant → hot gas).
   - `<DeLavalNozzle>` — expands the gas → thrust; also owns the plume/light/sound FX.
   - `<Rocket>` — binds **one** Combustor (`<Core>`) to **one-or-more** nozzles (`<Nozzle>`).
   - `<RocketEngineController>` (main engines) or `<RocketThrusterController>` (RCS) — groups one-or-more `<Rocket>`s, receives throttle/burn/pulse commands, is armed by staging.
   - `<Gimbal>` (optional, on a SubPart) — thrust-vectors the nozzles on that SubPart.
   - `<Combustion>` inside the combustor references a top-level **`<CombustionProcess>`** asset (the propellant chemistry) by `Id`.

2. **Thrust is real De Laval physics.** `F = ṁ·Vₑ + (P_exit − P_ambient)·A_exit`, with mass flow choked at the throat, isentropic expansion to an area-ratio-derived exit Mach, over-expansion / flow-separation handling, and altitude compensation. Isp is purely derived: `Isp = EffectiveExhaustVelocity / 9.80665`.

3. **Chemistry is a pre-baked lookup table.** A `<CombustionProcess>` lists reactants (with mass shares = mixture ratio) and a table of `(ln chamber-pressure → flame temperature, γ, molar mass)`. The thrust math reads γ, the specific gas constant `R = 8.31446261815324 / molarMass`, and the flame temperature from this LUT by interpolation. The reactant list is only used for _propellant draw from tanks_; the realism is entirely in the LUT (NASA-CEA-style, pre-solved).

4. **There is no electric / ion / cold-gas / monopropellant / nuclear thrust path.** The only gas source in the entire codebase is a `Combustor` burning a `CombustionProcess`. Even RCS is a tiny bipropellant combustor. (§9)

5. **SRBs exist only as inert meshes.** 16 SRB prefab Parts + ~32 SubPart meshes ship in `CorePropulsionAAssets.xml`, but they carry **no GameData** (no modules, no `EditorTag`, no mass) and there is **zero** solid-motor code anywhere. They are not even pickable. (§10)

6. **The game already contains an "Engine Designer".** `EngineDesigner.cs` is a developer ImGui tool (`RocketDesign.cs` physics + a clipboard XML emitter) that turns physical parameters into `<Combustor>`+`<DeLavalNozzle>` XML and previews sea-level/vacuum thrust & Isp. It is the canonical reference implementation for flexo's feature, and its math (`RocketDesign`) is portable. (§8)

7. **Defining a new engine that reuses existing art needs only data, no new geometry/code:** one `<Part>` prefab (instancing existing SubParts) + one matching `<PartGameData>` (tag + controller + gimbal limits + mass + collider) + the `<Combustor>`/`<DeLavalNozzle>`/`<Rocket>` modules (either on a reused SubPart's `<SubPartGameData>`, or authored fresh at the part level). (§11)

---

## 1. The object model: Template / Module / Config / State

Four tiers of type, and you must keep them straight:

| Tier                                 | Role                                                                                                     | Examples                                                                                                                                                                      | Lives in                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Template** (`: SerializedId`)      | Deserialized from XML. Holds unit-wrapped `*Reference` fields. `Create(part)` builds the runtime module. | `RocketTemplate`, `CombustorTemplate`(`:RocketCoreTemplate`), `DeLavalNozzleTemplate`(`:RocketNozzleTemplate`), `CombustionProcessTemplate`, `RocketEngineControllerTemplate` | `PartTemplate.Rockets` / `.RocketCores` / `.RocketNozzles` / `.RocketEngineControllers` lists |
| **Runtime module**                   | Built once per part instance. Immutable resolved physics (plain floats) + resolved cross-refs.           | `Rocket`, `Combustor`(`:RocketCore`), `DeLavalNozzle`(`:RocketNozzle`), `CombustionProcess`, `EngineController`                                                               | `part.Modules`                                                                                |
| **Config struct**                    | Plain float bundle that does the math.                                                                   | `CombustorConfig`, `DeLavalNozzleConfig`                                                                                                                                      | `Combustor.Config`, `DeLavalNozzle.Config`                                                    |
| **State / Conditions / Performance** | Mutable per-frame state + transient thermodynamic results.                                               | `RocketCoreState`, `RocketNozzleState`, `RocketCoreConditions`, `NozzleConditions`, `NozzlePerformance`, `RocketPerformance`, `GasProperties`, `GasConditions`                | parallel state arrays / return values                                                         |

Runtime reference chain:

```
Rocket
 ├─ Core    : RocketCore   (only concrete = Combustor)     → CombustorConfig → CombustionProcess → CombustionTable (LUT)
 └─ Nozzles : RocketNozzle[] (only concrete = DeLavalNozzle) → DeLavalNozzleConfig
```

`RocketCore` and `RocketNozzle` are **abstract**; `Combustor` and `DeLavalNozzle` are the only concrete subclasses currently registered (`PartTemplate.cs:30-34`). So in practice "Core" ≡ "Combustor" and "Nozzle" ≡ "DeLavalNozzle". Each Core/Nozzle may be referenced by exactly one Rocket (throws otherwise — `RocketTemplate.cs:30-40`).

---

## 2. The XML layering: SubPart / Part / Assets / GameData

### 2.1 There is one schema, split by convention

Both `*Assets.xml` and `*GameData.xml` use the root `<Assets>` and deserialize with the **same** `AssetBundle` class (`AssetBundle.cs:8`, `[XmlRoot("Assets")]`). The element→type map (`AssetBundle.cs:10-66`) accepts, intermixed:

| Element             | C# type                                              | Role                                            |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| `<MeshAtlas>`       | `MeshAtlasFileReference`                             | glb mesh atlas                                  |
| `<PbrMaterial>`     | `PbrMaterialReference`                               | material / texture set                          |
| `<SubPart>`         | `SubPartTemplate` (`PartTemplate`, `IsSubPart=true`) | a reusable mesh+material unit                   |
| `<Part>`            | `PartTemplate`                                       | a prefab: places SubPart instances + connectors |
| `<SubPartGameData>` | `SubPartGameDataReference`                           | gameplay modules overlaid on a `<SubPart>`      |
| `<PartGameData>`    | `PartGameDataReference`                              | gameplay modules overlaid on a `<Part>`         |

The split is _convention only_. "Assets" files hold visual/structural defs; "GameData" files hold gameplay overlays. They share **one Id namespace**.

### 2.2 The merge (join key = exact `Id` string)

After all bundles load, `ModLibrary.AttachGameData()` (`ModLibrary.cs:1516-1530`) finds, for each `<PartGameData Id=X>` / `<SubPartGameData Id=X>`, the `<Part>` / `<SubPart>` whose **`Id` is exactly `X`**, and calls `PartTemplate.ApplyGameData()` (`PartTemplate.cs:201-291`). The merge is mostly **additive** (`AddRange` for `EditorTags`, `RocketEngineControllers`, `Rockets`, `RocketCores`, `RocketNozzles`, `InertMasses`, `Components`…; `Connectors` merged by Id; `Tank`/`Decoupler`/`DockingPort` replace; `DisplayName` overrides).

**Consequence:** a `<Part>` with no matching `<PartGameData>` is a valid registered template but has **no `EditorTag` and no gameplay modules** — it will not appear as a pickable engine. This is exactly why the SRB prefabs are invisible (§10), and why `EngineA1` (asset only) is not a live engine while `EngineA2..A6` are.

### 2.3 SubPart-level vs Part-level modules — when to use which

|                         | **SubPartGameData** (overlay on a `<SubPart>` asset)                                                                                     | **PartGameData** (overlay on a `<Part>` prefab)                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                   | Travels with the **mesh** — every prefab that `InstanceOf`s it inherits it                                                               | Specific to **one engine variant**                                                                                                                                                                                            |
| Typical engine contents | A complete `<Rocket>`+`<Combustor>`+`<DeLavalNozzle>` ("a thrust-chamber assembly"); or a bare `<DeLavalNozzle>` for an auxiliary nozzle | `<EditorTag>`, `<RocketEngineController>`, per-instance `<Gimbal>` limits, `<SolidSphereMass>` (dry mass), `<Collider>`, and **extra** `<Rocket>/<Combustor>/<DeLavalNozzle>` not owned by one SubPart (e.g. a gas-generator) |
| Why                     | Reusable thrust chambers (MedBoost / LargeVac / CompactVac) are shared across `EngineA2..A6`, so their physics live once on the SubPart  | The controller, gimbal _limits_, mass, collider, and cycle hardware differ per variant                                                                                                                                        |

Rule of thumb: **reusable thrust chamber → SubPartGameData; per-variant controller/gimbal/mass/collider/gas-generator → PartGameData.**

### 2.4 SubPart instance ids (`SubPartId`)

In a `<Part>`, each `<SubPart Id="<instanceId>" InstanceOf="<subpartAssetId>">` places one instance. `InstanceOf` = the reusable asset id; `Id` = a **prefab-unique instance name** (the authoring tool appends a running integer, e.g. `…EngineAMedBoostAssembly1`). References resolve by **literal string match** of `SubPartId` against a placed instance's `Id` (`SubPartIdReference.cs:11-26`); empty `SubPartId` ⇒ the root part. The integer is only a per-prefab counter, not semantic, but the _identical_ string must appear in (a) the prefab `<SubPart Id=…>`, (b) every `<RocketReference>/<Nozzle SubPartId=…>`, and (c) the `<SubPart Id=…><Gimbal>` overlay in the PartGameData.

---

## 3. Complete XML schema — every engine element

Defaults below are from field initializers / `OnDataLoad` clamps in the `*Template.cs` classes.

### 3.1 `<Rocket>` → `RocketTemplate` (`RocketTemplate.cs`)

The wiring object: one core + N nozzles → one firing unit.

| XML                     | C# member    | Type                       | Default | Notes                                                           |
| ----------------------- | ------------ | -------------------------- | ------- | --------------------------------------------------------------- |
| `Id` (attr)             | `Id`         | string                     | `""`    | Targeted by a controller's `<RocketReference Id>`               |
| `<Core>`                | `RocketCore` | `SubPartIdReference`       | `new()` | reference to a `Combustor` by its `Id`                          |
| `<Nozzle>` (repeatable) | `Nozzles`    | `List<SubPartIdReference>` | empty   | each references a `DeLavalNozzle` by `Id`; ≥1 needed for thrust |

### 3.2 `<Core>` / `<Nozzle>` / `<RocketReference>` → `SubPartIdReference` (`SubPartIdReference.cs`)

| XML                | C#          | Type   | Default | Meaning                                                                          |
| ------------------ | ----------- | ------ | ------- | -------------------------------------------------------------------------------- |
| `Id` (attr)        | `Id`        | string | `""`    | the **template Id** of the target module (matched via `module.TemplateId == Id`) |
| `SubPartId` (attr) | `SubPartId` | string | `""`    | which placed SubPart instance to search; empty ⇒ the root part                   |

### 3.3 `<Combustor>` → `CombustorTemplate` (`CombustorTemplate.cs`)

The combustion chamber. Builds `Combustor` + `CombustorConfig`.

| XML                   | C# member           | Type                              | Default                             | Notes                                                                                                 |
| --------------------- | ------------------- | --------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Id` (attr)           | `Id`                | string                            | `""`                                | targeted by `<Core Id>`                                                                               |
| `<Combustion>`        | `Combustion`        | `SerializedReference` (`Id` attr) | `""`                                | **REQUIRED.** Id of a `<CombustionProcess>`; resolution throws if missing (`CombustorTemplate.cs:29`) |
| `<MaxPressure>`       | `MaxPressure`       | `PressureReference`               | **5 000 000 Pa (50 bar)** (line 16) | chamber pressure at full throttle. Throttle scales this **linearly**                                  |
| `<ThermalEfficiency>` | `ThermalEfficiency` | `DoubleReference` (`Value`)       | **1.0** (line 19)                   | isochoric scale of combustor exit P & T; <1 cuts both thrust and Isp                                  |
| `<MinimumThrottle>`   | `MinimumThrottle`   | `DoubleReference` (`Value`)       | **1.0** (line 22)                   | clamped to `[0.01, 1.0]`. **Default 1.0 ⇒ non-throttleable (on/off).** Set lower to allow throttling  |
| `<MinimumPulseTime>`  | `MinimumPulseTime`  | `TimeSpanReference` (`Seconds`…)  | **0.001 s** (line 25)               | min firing duration; floored at 0.001 s. Matters for RCS pulsing                                      |

Constants: `MINIMUM_PULSE_TIME = 0.001`, `MINIMUM_THROTTLE = 0.01`.

### 3.4 `<DeLavalNozzle>` → `DeLavalNozzleTemplate` (`DeLavalNozzleTemplate.cs`) + base `RocketNozzleTemplate` (`RocketNozzleTemplate.cs`)

Own fields:
| XML | C# member | Type | Default | Physics role |
|---|---|---|---|---|
| `Id` (attr) | `Id` | string | `""` | targeted by `<Nozzle Id>` |
| `<ExitDiameter>` | `ExitDiameter` | `DistanceReference` (`M`/`Cm`/`Mm`…) | **1.0 m** (line 11) | `ExitArea = π·(D/2)²` |
| `<FxExitDiameter>` | `FxExitDiameter` | `DistanceReference?` | null → `ExitDiameter` | **VISUAL ONLY** — sets plume radius `FxExitRadius = 0.5·FxExitDiameter`. **Zero effect on thrust.** |
| `<AreaRatio>` | `AreaRatio` | `DoubleReference` (`Value`) | **NaN** (line 17) | **EFFECTIVELY REQUIRED** — `ThroatArea = ExitArea / AreaRatio`. NaN ⇒ broken engine |
| `<FlowEfficiency>` | `FlowEfficiency` | `DoubleReference` (`Value`) | **1.0** (line 20) | isothermal inlet pressure drop; primarily cuts **thrust** |
| `<ExpansionEfficiency>` | `ExpansionEfficiency` | `DoubleReference` (`Value`) | **1.0** (line 23) | isentropic stagnation drop; primarily cuts **Isp** |

Inherited from `RocketNozzleTemplate` (geometry/placement + FX):
| XML | C# member | Type | Default | Notes |
|---|---|---|---|---|
| `<ExhaustLocation>` | `ExhaustLocation` | `Vector3Reference` (`X`/`Y`/`Z`) | `(0,0,0)` | **thrust application point** (assembly frame) |
| `<ExhaustDirection>` | `ExhaustDirection` | `Vector3Reference` | **`(-1,0,0)`** (−X) | direction exhaust leaves; thrust force is along `−ExhaustDirection` |
| `<FxExhaustLocation>` | `FxExhaustLocation` | `Vector3Reference?` | null → `ExhaustLocation` | FX plume origin only |
| `<FxExhaustDirection>` | `FxExhaustDirection` | `Vector3Reference?` | null → `ExhaustDirection` | FX plume axis only |
| `<VolumetricExhaust>` | `VolumetricExhaust` | `VolumetricExhaustReference?` (`Id` attr + optional `<Offset>`) | null | plume FX template reference (§7) |
| `<ExhaustLight>` | `ExhaustLight` | `BoolReference` (`Value`) | **true** | dynamic exhaust point light on/off |
| `<SoundEvent>` | `SoundEvent` | `RocketSoundEvent?` | null | engine audio (§6.6) |

### 3.5 `<RocketEngineController>` / `<RocketThrusterController>` → `RocketControllerTemplate` (`RocketControllerTemplate.cs`)

| XML                              | C# member          | Type                                                      | Notes                                                                     |
| -------------------------------- | ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Id` (attr)                      | `Id`               | string                                                    | controller / engine display id (e.g. `LR91-AJ-3`)                         |
| `<RocketReference>` (repeatable) | `RocketReferences` | `List<SubPartIdReference>`                                | each resolves to a `<Rocket>`; the controller collects each `rocket.Core` |
| `<ControlMap>` (thruster only)   | `ControlMap`       | `ThrusterMapFlagsReference?` (`CSV="PitchUp,YawRight,…"`) | RCS 6-DOF axis map; auto-computed from geometry if omitted                |

`EngineController` (main): variable throttle + burn-time; `IsActive=false` (armed by staging). `ThrusterController` (RCS): throttle fixed at 1.0, short pulses, `IsActive=true` (auto-active). Both drive the same Core/Nozzle/Rocket modules.

### 3.6 `<Gimbal>` → `GimbalReference` (`GimbalReference.cs`) — attaches to a `<SubPart>` instance

| XML                   | C# member           | Type                                                            | Default         | Meaning                                    |
| --------------------- | ------------------- | --------------------------------------------------------------- | --------------- | ------------------------------------------ |
| `Id` (attr, optional) | `Id`                | string                                                          | `""`            | optional, makes it referenceable           |
| `<Transform>`         | `Transform`         | `TransformReference` (`<Position>`/`<Rotation>`/`<Scale>` Vec3) | identity        | pivot pose                                 |
| `<MaxAngleY>`         | `MaxAngleY`         | `RadianReference?` (`Degrees=`/`Radians=`)                      | null → 0        | max deflection about local Y               |
| `<MaxAngleZ>`         | `MaxAngleZ`         | `RadianReference?`                                              | null → 0        | max deflection about local Z               |
| `<ConstrainToCircle>` | `ConstrainToCircle` | `BoolReference?`                                                | null → **true** | clamp combined Y/Z to a circle vs a square |

**No `MaxAngleX`** (gimbal is Y/Z only). The gimbal **only actuates if `MaxAngleY≠0 || MaxAngleZ≠0`** (`Gimbal.cs:22-25`) — a 0/0 gimbal is a silent no-op. It vectors **all `RocketNozzle`s on the same SubPart** (`GimbalController.cs:20-53`).

### 3.7 `<CombustionProcess>` → `CombustionProcessTemplate` (`CombustionProcessTemplate.cs`) — the propellant chemistry (top-level asset)

| XML                                  | C# member              | Type                        | Default            | Notes                                         |
| ------------------------------------ | ---------------------- | --------------------------- | ------------------ | --------------------------------------------- |
| `Id` (attr)                          | `Id`                   | string                      | `""`               | e.g. `Hydrolox_5.5`                           |
| `<Name>`                             | `Name`                 | `StringReference` (`Value`) | falls back to `Id` | display name                                  |
| `<Reactant>` (repeatable)            | `Reactants`            | `List<ReactantReference>`   | empty              | **≥1 required** (throws otherwise)            |
| `<CombustionCondition>` (repeatable) | `CombustionConditions` | `List<CombustionCondition>` | empty              | **≥1 required**; the pressure-indexed gas LUT |

`<Reactant>` → `ReactantReference` (`ReactantReference.cs`): `Id` (a substance **phase** id, e.g. `H2(l)`) + `MassShare` (double, default 1.0, must be >0; normalized to mass fractions summing to 1).

`<CombustionCondition>` → `CombustionCondition` (`CombustionCondition.cs`): `<LnPressure Value>` = ln(chamber pressure / Pa); `<Temperature K>` = flame temp; `<Gamma Value>` = γ; `<MolarMass GPerMol>` → `SpecificGasConstant = 8.31446261815324 / molarMass_kgPerMol`.

### 3.8 `<SoundEvent>` (inside a nozzle) → `RocketSoundEvent` (`RocketSoundEvent.cs`)

`SoundId` (string, required) + `Action` (`RocketSoundAction`: `On`/`Off`/`None`). E.g. `<SoundEvent Action="On" SoundId="DefaultEngineSoundBehavior" />`.

### 3.9 Unit-bearing `*Reference` value types (XML attribute → SI)

Each is a class with one `[XmlAttribute]` per unit; provided attrs are **summed** after SI conversion; unset = NaN/skipped. An implicit `operator double` returns the SI value.

| Reference                              | XML attrs → SI base                                                             | Used by                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `PressureReference`                    | `Pa`×1 · `KPa`×1e3 · `MPa`×1e6 · `MBar`×100 · `Bar`×1e5 · `Atm`×101325 → **Pa** | MaxPressure                                                   |
| `DistanceReference`                    | `Mm`×.001 · `Cm`×.01 · `M`×1 · `Km`×1e3 · `Au` · `Ly` → **m**                   | ExitDiameter, FxExitDiameter                                  |
| `TemperatureReference`                 | `K`×1 → **K**                                                                   | combustion Temperature                                        |
| `MolarMassReference`                   | `GPerMol`×.001 · `KgPerMol`×1 → **kg/mol**                                      | combustion MolarMass                                          |
| `RadianReference`                      | `Radians`×1 · `Degrees`×π/180 → **rad**                                         | gimbal MaxAngleY/Z                                            |
| `TimeSpanReference`                    | `Seconds` · `Minutes`×60 · `Hours`×3600 · … → **s**                             | MinimumPulseTime, plume Duration                              |
| `DoubleReference`                      | `Value` (raw, default NaN)                                                      | AreaRatio, efficiencies, throttle                             |
| `BoolReference`                        | `Value` (bool, default false)                                                   | ExhaustLight, ConstrainToCircle                               |
| `Vector3Reference`                     | `X`/`Y`/`Z` (raw, default 0)                                                    | ExhaustLocation/Direction                                     |
| `SerializedReference`                  | `Id` (string)                                                                   | `<Combustion Id>`                                             |
| `ForceReference` / `MassRateReference` | `N`/`KN`/`MN`; `KgPerSecond`…                                                   | **display-only** (thrust/ṁ readouts), not authored on engines |

So `<MaxPressure Bar="49"/>` ⇒ 4 900 000 Pa; `<ExitDiameter Cm="26.8"/>` ⇒ 0.268 m; `<MaxAngleY Degrees="70"/>` ⇒ 1.2217 rad.

---

## 4. Physics: how thrust and Isp are computed (verified verbatim)

Per nozzle, per physics frame. All equations below were read from `CombustorConfig.cs`, `DeLavalNozzleConfig.cs`, `GasProperties.cs`, `NozzlePerformance.cs`, `CombustionTable.cs`.

### 4.1 The full pipeline

```
# geometry (from template)
A_exit   = π·(ExitDiameter/2)²
A_throat = A_exit / AreaRatio

# 1. chamber pressure scales LINEARLY with throttle           (CombustorConfig.cs:15-24)
Pc = clamp(throttle, 0, 1) · MaxPressure                      # Pa

# 2. gas state from the combustion LUT, interpolated in ln(P) (CombustionTable.cs:15-66)
(γ, R, Tc) = CombustionGasLut.Lookup(Pc)                      # R = 8.314462618 / molarMass(kg/mol)

# 3. combustor exit = isochoric scale by ThermalEfficiency ηt (GasProperties.cs:46-53)
Exit.P = Pc · ηt ;   Exit.T = Tc · ηt

# 4. nozzle inlet = isothermal pressure drop by FlowEfficiency ηf (GasProperties.cs:56-63)
Inlet.P = Exit.P · ηf ;   Inlet.T = Exit.T

# 5. stagnation = isentropic by ExpansionEfficiency ηe        (GasProperties.cs:76-84)
Stag.P = Inlet.P · ηe ;   Stag.T = Inlet.T · ηe^((γ−1)/γ)

# 6. choked mass flow                                          (DeLavalNozzleConfig.cs:90-98)
c*   = sqrt(γ·R·Inlet.T) / ( γ · sqrt( (2/(γ+1))^((γ+1)/(γ−1)) ) )    # GasProperties.cs:28-35
ṁ    = Inlet.P · A_throat / c*

# 7. exit Mach from area ratio (Newton, 20 iters)             (RocketDesign.cs:168-185)
AR    = A_exit / A_throat
M     = SolveMachNumberFromAreaRatio(γ, AR)
pCoef = 1 / (1 + 0.5(γ−1)M²)^(γ/(γ−1))        # = P_exit / P_stagnation   (DeLavalNozzleConfig.cs:101-106)
Exhaust.P = Stag.P · pCoef ;  Exhaust.T = Stag.T · pCoef^((γ−1)/γ)
A_exhaust = A_exit

# 8. flow-separation (over-expansion) clamp                   (DeLavalNozzleConfig.cs:29-39)
sepThresh = P_amb · (2/3) · (Stag.P / P_amb)^(−0.2)
if Exhaust.P < sepThresh:
    pSep   = min(sepThresh, criticalPR·Stag.P)   # criticalPR = (2/(γ+1))^(γ/(γ−1))
    pCoef  = pSep / Stag.P ;  recompute Exhaust
    sepAR  = ComputeAreaRatioFromPressure(Exhaust.P, Stag.P, γ)
    FlowSeparationSeverity = clamp(1 − sepAR/AR, 0, 1)
    A_exhaust = sepAR · A_throat                 # effective (smaller) exit area

# 9. exit velocity                                            (DeLavalNozzleConfig.cs:109-118)
Vₑ = sqrt( (2γ/(γ−1)) · R · Stag.T · (1 − (Exhaust.P/Stag.P)^((γ−1)/γ)) )

# 10. thrust                                                  (NozzlePerformance.cs:30-68)
F_momentum = ṁ · Vₑ
F_pressure = (Exhaust.P − P_amb) · A_exhaust
F_total    = F_momentum + F_pressure                          # clamped ≥ 0 via:
V_eff      = max( Vₑ + max(F_pressure, −F_momentum)/ṁ , 0 )
F_total    = ṁ · V_eff
Isp        = V_eff / 9.80665                                  # g₀ = 9.80665
```

### 4.2 What each knob does

| Parameter               | Effect                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MaxPressure**         | Sea-level scale: chamber pressure = throttle × MaxPressure; mass flow ∝ pressure ⇒ thrust ≈ linear in it. Also picks the LUT row (γ, T).                                                                          |
| **AreaRatio**           | Sets exit Mach ⇒ exit/stagnation pressure ratio. Higher AR → more expansion → higher Vₑ/Isp but lower exit pressure (great in vacuum, prone to flow separation at sea level). **NaN default ⇒ must be supplied.** |
| **ExitDiameter**        | Physical exit area; with AreaRatio it sets ThroatArea (∝ ṁ ∝ absolute thrust) and the pressure-thrust area.                                                                                                       |
| **ThermalEfficiency**   | Isochoric exit scale (P&T ×ηt). <1 reduces both thrust and Isp.                                                                                                                                                   |
| **FlowEfficiency**      | Isothermal inlet drop (P ×ηf). Lowers ṁ ⇒ primarily reduces **thrust**.                                                                                                                                           |
| **ExpansionEfficiency** | Isentropic stagnation drop (P×ηe, T×ηe^((γ−1)/γ)). Primarily reduces **Isp**.                                                                                                                                     |
| **MinimumThrottle**     | Throttle floor while firing (default 1.0 = on/off).                                                                                                                                                               |
| **FxExitDiameter**      | Visual plume size only — no thrust effect.                                                                                                                                                                        |

### 4.3 Key constants

`g₀ = 9.80665`; universal gas constant `Ru = 8.31446261815324`; `MaxPressure` default 5 MPa; `MinimumThrottle` default 1.0 (clamp [0.01,1]); `AreaRatio` default NaN; `ExitDiameter` default 1.0 m; `Flow/ExpansionEfficiency` default 1.0; `ExhaustDirection` default (−1,0,0); `ExhaustLight` default true; `ConstrainToCircle` default true.

---

## 5. Combustion / propellant system

### 5.1 The LUT model

A `CombustionProcess` exposes to the thrust math, by interpolation on ln(pressure):

- `γ` (ratio of specific heats),
- `R = 8.31446261815324 / molarMass(kg/mol)` (specific gas constant),
- flame `Temperature`.
  Plus `c*` (characteristic velocity), computed on the fly from γ, R, T. **Product species are NOT enumerated** — only bulk equilibrium gas properties are stored (pre-solved, NASA-CEA style). The reactant list is used only for propellant draw (§5.4). All realism is encoded in the LUT rows, independent of the reactant names.

Interpolation (`CombustionTable.Lookup`): binary-search ln(P), linear-lerp γ/R/T between bracketing rows; clamp to row 0 below the lowest pressure and to the last row above the highest. `conditions.Pressure` is set to the exact query pressure.

### 5.2 Substance inventory — `Substances.xml` (10)

`<Substance Id>` → `SubstanceTemplate` with `<MolarMass>` and per-phase `<Solid>`/`<Liquid>`/`<Gas>` (each: `<StorageTemperature K>`, `<StorageDensity>`). Phases register as suffixed ids: `Id(s)`/`Id(l)`/`Id(g)`. Reactants reference the **phase** id.

| Id                             | Name          | MolarMass g/mol  | Phases      | Liquid T (K) | Liquid density (kg/m³) |
| ------------------------------ | ------------- | ---------------- | ----------- | ------------ | ---------------------- | ----------------------------- |
| `H2`                           | Hydrogen      | 2.01588          | Liquid, Gas | 20.27        | 70.85                  |
| `O2`                           | Oxygen        | 31.9988          | Liquid, Gas | 90.19        | 1141                   |
| `Kerosene`                     | Kerosene      | 167.31102        | Liquid      | 293.15       | 805.41                 |
| `N2H4`                         | Hydrazine     | 32.04516         | Liquid      | 293.15       | 1021                   |
| `CH6N2`                        | MMH           | 46.07174         | Liquid      | 293.15       | 875.7                  |
| `C2H8N2`                       | UDMH          | 60.09832         | Liquid      | 293.15       | 791                    |
| `N2O4`                         | NTO           | 92.011           | Liquid      | 293.15       | 1442.46                |
| `Aluminum.2014`                | Al alloy 2014 | 28.75            | **Solid**   | —            | 2800                   | _(tank wall, not propellant)_ |
| `Nepetalactone` / `Actinidine` | —             | 166.22 / 147.221 | Liquid      | 293.15       | 1066.3 / 944           | _(easter-egg "catnip")_       |

`N2H4` and `C2H8N2` are defined but **unused** by any combustion process (no monopropellant decomposition modeled).

### 5.3 Combustion process inventory — `Combustion.xml` (4)

| Id                          | Reactants (MassShare)                   | O/F mass ratio | LUT rows            | Notes                          |
| --------------------------- | --------------------------------------- | -------------- | ------------------- | ------------------------------ |
| `Hydrolox_5.5`              | `H2(l)`=1, `O2(l)`=5.5                  | 5.5:1          | 24 (lnP 9.51→21.01) | LH2/LOX                        |
| `Kerolox_2.4`               | `Kerosene(l)`=1, `O2(l)`=2.4            | 2.4:1          | 24                  | RP-1/LOX                       |
| `MMH_NTO_1.6`               | `CH6N2(l)`=1, `N2O4(l)`=1.6             | 1.6:1          | 24                  | hypergolic (also used for RCS) |
| `NepetalactoneActinidine_2` | `Nepetalactone(l)`=1, `Actinidine(l)`=2 | 2:1            | **1**               | easter egg (T=1e6 K, γ=1.8)    |

The mixture-ratio in the name is cosmetic; the real ratio is the `MassShare` values. Verbatim `Hydrolox_5.5` first row: `<LnPressure Value="9.512925464970229"/><Temperature K="2740.02"/><Gamma Value="1.2297"/><MolarMass GPerMol="11.882"/>` (`Combustion.xml:3-14`).

### 5.4 Fuel tanks & propellant draw

- A **tank prefab declares only geometry + wall material**, not a propellant. The `<Tank>` module (on a SubPart) holds `<CylindricalTank>` (`Material`, `Length`, `OuterRadius`, `WallThickness`, `DomeHeightFraction`=1/√2) or `<SphericalTank>`; `StorageVolume` is **computed** from geometry; dry mass comes from the wall material.
- Tank **contents** are `Mole`s, assigned either at runtime via `Tank.ConfigureFor(combustionMix)` (fills to mass fractions) or persisted in save data as `<TankData><Mole SubstancePhaseId Mass MassFraction>`.
- An engine draws via the Combustor's `ResourceManager`, which walks the **part-connection graph** for connected tanks containing all reactants, ordered by a `FlowRule` (default `FurtherestToNearestSameStage`). If **all** reactants aren't available, `IsPropellantAvailable=false` and throttle is forced to 0. Consumption = `ṁ·dt`, split across reactants by mass fraction. There is no explicit "fuel line" entity — connectivity is the part graph + stage + flow rule.

---

## 6. Engine control: staging, ignition, throttle, gimbal, restart

### 6.1 Command flow (main engines)

`ManualControlInputs.EngineThrottle/.EngineOn` (or FlightComputer auto-burn) → `FlightComputer.CommandEngineThrottles` (for each `EngineController` that is `IsActive && IsPropellantAvailable`) → `EngineControllerState.GetCoreCommand()` → `RocketCore.UpdateState(dt, command)` → throttle clamped to `[MinimumThrottle, 1]`, min-pulse enforced, propellant gate applied → `Conditions = ComputeConditions(throttle)` → nozzle thrust.

### 6.2 An engine fires only when ALL hold

`staged (IsActive) AND EngineOn AND propellant available AND throttle>0`. Staging arms the controller (`Stage.ContainsEngine` when a part has an `EngineController`; activating the stage calls `Part.ActivateInStage` → `IActivate.Activate`). The player ignites via `MainEngineStartup`/`MainIgnite` (`EngineOn=true`).

### 6.3 Throttle floor

`MinimumThrottle` (Combustor, default 1.0 = on/off) is clamped `[0.01,1]`. `EngineController.MinimumThrottle = Min` over its cores. Hard clamp in `RocketCore.UpdateState:40` — commanding 30% on a `MinimumThrottle=1.0` engine yields 100% or off.

### 6.4 Restart — **yes, freely**

There is no consumable igniter or restart count in this layer. `EngineOn` toggles freely; each off→on sets `ActivatedThisFrame` (FX edge) and the min-pulse timer. The only latch is `MinimumPulseTime` (default 1 ms). (Restart limits, if ever wanted, are not modeled here.)

### 6.5 `EngineFlags` is NOT a capability mask

`[Flags] EngineFlags { None=0, ThrottleUp=2, ThrottleDown=4 }` — purely the transient throttle-key input state. Capabilities come from data: throttleable ⇐ `MinimumThrottle<1`; gimbal ⇐ an actuating `<Gimbal>`; restart ⇐ implicit.

### 6.6 Sound

`<SoundEvent Action="On" SoundId="DefaultEngineSoundBehavior"/>` on the nozzle; played on the nozzle's `ActivatedThisFrame`/throttle state. `BoosterStop01..06` exist in `Sounds.xml` as shutdown SFX (reusable for SRB burnout, but not solid-motor logic).

### 6.7 RCS vs main engine

`<RocketThrusterController>`: throttle fixed 1.0, short pulses mapped to 6-DOF `ThrusterMapFlags` (`RollRight/PitchUp/YawRight/TranslateForward/…`, auto-computed from geometry unless `<ControlMap CSV>` is given), `IsActive=true` by default. In shipped data, RCS thruster physics live entirely on the **SubPart** (`RCSSetAThruster*` carry `<RocketThrusterController>`+`<Rocket>`+`<Combustor MMH_NTO_1.6 7bar>`+`<DeLavalNozzle AR 40>`), so any RCS block instancing that mesh becomes a working thruster.

---

## 7. Exhaust plume FX

### 7.1 Reference graph

`<VolumetricExhaust Id="EngineALarge"/>` on a nozzle = a `VolumetricExhaustReference` (just `Id` + an unused `<Offset>`) that resolves a `VolumetricExhaustTemplate` registered by Id from `Content/Core/ExhaustAssets.xml`. **8 ship:** `RCS, EngineALarge, EngineALargeUpperStage, EngineAMed, EngineACompact, EngineAVernier, EngineATurbine, MmuRcsVac`.

### 7.2 The template (pure art description)

Required children `LengthWeights`, `Absorption`, `Emission`, `Noise`; optional `Quality`, `StartupTransient`/`ShutdownTransient` (Hermite curves over a `Duration`), `PressureModifiers`/`ThrottleModifiers`.

- `LengthWeights`: `RadiusWeight` (0.2), `NozzlePressureWeight` (25), `JetExpansionWeight` (150), `ExitMachNumberWeight` (1) — drive plume length.
- `Absorption`: `Density` (0.075; **0 = clean emissive engine**, huge = opaque cold-gas/RCS), `ScatteringBrightness` (10), `ScatteringPhaseEccentricity` (0.2), `RefractionIntensity` (1, heat-haze), `FakeCleanBurnInAtmosphere` (false).
- `Emission`: `Brightness` (HDR, 10; ships 100–1 000 000), `ColorGradient` (4 RGB stops core→tip), `Flow.MachDiamonds` (`Color`, `LeadIn`, `LeadOut`, `MiddleRadius`, `IncidentShockHeight`, `IncidentShockCurve`).
- `Noise`: `DensityNoise`, `ShapeNoise`, `RadialShapeNoise` (Size/Intensity/Speed).
- `Quality`: `SampleCount`, `SelfShadowSampleCount`, `VolumetricVesselShadows` (attr).

### 7.3 Plume size is physics-driven (auto-scales)

At runtime, `RocketNozzle.UpdatePlumeData` computes the plume from nozzle performance at the **current ambient pressure** + `FxExitRadius`: length ∝ `RadiusWeight·FxExitRadius·(NozzlePressureWeight·ln(1+NPR)+JetExpansionWeight·ln(1+JER)+ExitMachWeight·M)`, blooming wider/longer as altitude rises. **`FxExitDiameter` is the master visual scale knob.** So a reused template automatically fits a new engine.

### 7.4 Minimum to attach a plume — reuse an existing Id

`<VolumetricExhaust Id="EngineALarge"/>` (or any of the 8). Zero new assets/code; it auto-scales. Pick by archetype: main bipropellant → `EngineALarge`/`EngineAMed`/`EngineACompact`; vacuum upper stage → `EngineALargeUpperStage`; turbopump/vernier → `EngineATurbine`/`EngineAVernier`; RCS → `RCS`; EVA → `MmuRcsVac`. Defining a _new_ template needs only the 4 required children; all textures (`ExhaustDensityNoise`, `ExhaustSurfaceNoise`, `ExhaustDiamond`, `ExhaustCellGradient`) and shaders are engine built-ins in `DefaultAssets.xml`.

### 7.5 ⚠️ Schema-drift warning (matters for any XML generator)

Shipped `ExhaustAssets.xml` contains element names absent from the current decompiled C# — `<ExpansionCurve>`/`<ConcavityCurve>` inside `PressureModifiers`/`ThrottleModifiers` and `<Brightness>` inside `<MachDiamonds>` are **silently ignored** by `XmlSerializer`. The authoritative field is `AngleCurve` (0 occurrences in data). Moreover, in this build only `PressureModifiers.AbsorptionDensityCurve` is actually applied — the other modifier curves are computed and discarded. **A generator should emit C# field names and rely on the physics-driven knobs + transients + `FxExitDiameter`, not the modifier curves.** Volumetric exhaust is the _only_ engine-plume system; `ParticleEmitter`s are a separate FX system not wired to engines in shipped data.

---

## 8. The in-game "Engine Designer" (`EngineDesigner.cs` + `RocketDesign.cs`)

**This is the canonical reference implementation for flexo's feature.** `EngineDesigner` is a static developer ImGui debug window (`Program.ShowEngineDesignDebug`), source-located in `RocketDesign.cs`. It does **not** run during flight and never throttles/ignites/stages anything — it is a physics calculator + clipboard XML emitter.

### 8.1 Inputs (sliders) and their defaults

- Combustion process (combo from `SubstanceLibrary.AllCombustionProcesses()`).
- `Atmospheric Nozzle?` checkbox (atmospheric vs vacuum design mode).
- Exit diameter (1–1000 cm, default 226), chamber pressure (1–500 bar, default 47).
- Atmospheric mode: exhaust pressure (1–10000 mbar, default 400) — the ambient pressure the nozzle is optimised for.
- Vacuum mode: area ratio (1.1–300, default 25).
- Thermal / Flow / Expansion efficiency (1–100%, default 95 each).

### 8.2 What it computes (`EngineDesigner.cs:117-142`)

1. UI units → SI.
2. `RocketDesign.ComputeAtmosphericEngineDesign(...)` (back-solves area ratio so exhaust pressure = target at optimal expansion) **or** `ComputeVacuumEngineDesign(...)` (uses area ratio directly). Both clamp efficiencies ≤ 1 and via `ConstrainCoefficient` so exit pressure stays above a floor.
3. Builds `RocketCoreConditions` at throttle 1, then `NozzlePerformance` at **sea level (101325 Pa)** and **vacuum (0 Pa)** using the **same runtime path** (`Nozzle.ComputePerformance(conditions, ambient).GetRocketPerformance()`).

### 8.3 What it shows

Thrust SL, Thrust Vac, Isp SL, Isp Vac (`= EffectiveExhaustVelocity / 9.80665`), flow-separation severity, optimum-expansion pressure/thrust/Isp, c\*, exit P/T, combustion products (chamber P/T, molar mass = `8.314.../R`, γ), mass flow, actual exhaust velocity, area ratio, throat diameter.

### 8.4 What it emits (the product)

`<Combustor>` (`Combustion` ref, `MaxPressure`, `ThermalEfficiency`) + `<DeLavalNozzle>` (`ExitDiameter`, `AreaRatio`, `FlowEfficiency`, `ExpansionEfficiency`) → "Copy XML to Clipboard". **Note it emits neither `MinimumThrottle` (so the copied combustor defaults to non-throttleable) nor the `<Rocket>`/`<RocketEngineController>`/`<Gimbal>`/exhaust-placement wiring** — those are authored by hand around it. This is precisely the manual gap flexo can close.

### 8.5 Portable design math (`RocketDesign.cs`)

All pure functions, directly portable to TypeScript:

- `ComputeVacuumEngineDesign` / `ComputeAtmosphericEngineDesign` — produce a `CombustorConfig` + `DeLavalNozzleConfig` from the designer inputs.
- `SolveMachNumberFromAreaRatio` (Newton, 20 iters, tol 1e-4) — also used by the runtime thrust path.
- `ComputeAreaRatioFromMachNumber`, `ComputeAreaRatioFromPressure`, `SolveExhaustPressureFromAreaRatio`, `ComputeExpansionFromPressure` (returns `{AreaRatio, ExhaustVelocity}`).
- `ConstrainCoefficient(coef, value, valueMin)` — raises an efficiency so the resulting pressure stays ≥ a floor.

Combined with the runtime math from §4, this lets a tool show **live, in-game-accurate sea-level & vacuum thrust + Isp** as the user drags sliders — provided it has the combustion LUT data (loaded from `Combustion.xml`).

---

## 9. Electric engines — verdict: NOT POSSIBLE today (data or code)

- The only `RocketCoreTemplate`/`RocketCore` subclass is `Combustor`. The only thing that produces gas conditions is `Combustor.ComputeConditions` → a `CombustionProcess` LUT. A `Rocket` must have a `Core`.
- Whole-decomp keyword sweep: **no** `Plasma/Resistojet/ColdGas/Monoprop*/Nuclear/Arcjet/Gridded/Electrolysis/Photon` propulsion classes; `Ion/Hall/Arc` only in localization; `Electric` only in colour names + editor category labels; `Solar` only in power generation/sun-tracking (not thrust).
- Combustors consume **zero electricity** (grep of all combustor/core/controller/combustion files for power/electric/charge/battery/energy/watt → 0). There is a `PowerManager`/battery/solar system for electrical consumers, but nothing links it to thrust.

**Implication:** there is no electric-engine schema to target. An "electric engine" could only be **faked** as a combustor with a single hand-authored "propellant" + a high-Isp LUT — but it would still draw a propellant mass from a tank and produce thrust the chemical way, with no electrical power coupling. A true electric engine (power-limited thrust, propellant-only mass flow, thrust = f(input power, propellant)) requires **new game code** (a new `RocketCore` subclass with a power-input term, plus a `PowerConsumer` link). This is out of reach for a data-only mod.

---

## 10. SRBs — what exists, what's missing

### 10.1 What exists

"SRB" appears in **exactly one file**: `CorePropulsionAAssets.xml`. It ships **visual meshes only**:

- ~32 base SubPart meshes (domes, casing segments, nozzle bells, hold-down trusses) across 3 diameter classes A/B/C — the anatomy of a segmented solid motor.
- 16 prefab `<Part>`s (`SRBA1–4`, `SRBB1–4`, `SRBC1–3`, plus modular `SRBCSegment*` blocks) that assemble those meshes.

Every SRB prefab body contains only `<SubPart>` mesh instances + a `<Connector>` — **no `<Rocket>`, `<Combustor>`, `<DeLavalNozzle>`, `<RocketEngineController>`, `<Gimbal>`, mass, collider, or `<EditorTag>`**, and **no matching `<PartGameData>` anywhere**. Since modules/tags attach only via `ApplyGameData`, the SRBs are inert and not even in the parts catalog.

### 10.2 What's missing — code

Whole-decomp sweep for `SRB|Grain|BurnRate|Regression|ThrustCurve|BurnProfile|SolidPropellant|Bates|Booster` → **zero** solid-motor hits. (`Solid*Mass*`/`Solid.cs` are mass-distribution geometry; the `<Solid>` substance phase + `Aluminum.2014` are structural; `BoosterStop*` is shutdown SFX.) There is **no** burn-rate law, grain regression, thrust-vs-time curve, solid-grain mass model, or ignite-once/no-shutdown semantics.

### 10.3 Faking an SRB today (data-only) and its limits

**Recipe:** define a single-reactant `<CombustionProcess>` (a "solid propellant" substance given a `<Liquid>` phase at its solid density, so tank storage/flow works) + author the missing `<PartGameData>` for an SRB prefab with `<RocketEngineController>` + `<Rocket>`/`<Combustor MinimumThrottle=1>`/`<DeLavalNozzle>` + an internal `<Tank>` preloaded with the propellant + mass/collider/tag.

| Gets RIGHT                                              | Gets WRONG                                                                                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-contained propellant that depletes & sheds mass    | **Flat thrust then abrupt cutoff** — no grain-regression thrust-vs-time curve (no progressive/neutral/regressive, no tail-off)                                                   |
| Fixed (non-throttleable) thrust via `MinimumThrottle=1` | Still **shutdown-able / re-ignitable** — `MinimumThrottle=1` blocks throttling but not on/off; no irreversibility flag                                                           |
| Real nozzle physics + altitude compensation             | Propellant stored/drained as a **liquid** (CoM behaves like a draining tank, not a regressing grain)                                                                             |
| Optional gimbal                                         | Chamber pressure is **throttle-driven**, not burn-area × burn-rate                                                                                                               |
| Burn time ≈ propellant_mass / ṁ; stage-jettison works   | No solid phenomena (burn-rate law `r=a·Pc^n`, temperature sensitivity, erosive burning, CATO, thrust termination); isolation is topological only (no "sealed/no-crossfeed" flag) |

### 10.4 Gap list

- **XML/data gaps (authorable now):** no SRB `<PartGameData>`; no solid-propellant substance; no single-reactant solid combustion process; no propellant load/tank on SRB parts; no tag/mass/collider.
- **Engine-code gaps (need new game code):** burn-rate model + grain geometry + burning-surface regression; thrust-vs-time / thrust-vs-burn-fraction curve evaluator; solid-grain mass model; intrinsic ignite-once / non-throttleable / no-shutdown property.

---

## 11. What it takes to define a complete new engine (reusing existing SubParts)

### 11.1 The smallest physically-functional engine

```xml
<!-- modules (on a SubPartGameData, or at part level) -->
<Rocket Id="Engine"><Core Id="Chamber"/><Nozzle Id="Nozzle"/></Rocket>
<Combustor Id="Chamber">
  <Combustion Id="Hydrolox_5.5"/>
  <MaxPressure Bar="49"/>
  <MinimumThrottle Value="0.1"/>   <!-- omit ⇒ on/off only -->
</Combustor>
<DeLavalNozzle Id="Nozzle">
  <ExitDiameter M="2.5"/>
  <AreaRatio Value="49"/>
  <ExhaustLocation X="-1.23" Y="0" Z="0"/>
  <ExhaustDirection X="-1" Y="0" Z="0"/>
  <VolumetricExhaust Id="EngineALarge"/>       <!-- reuse an existing plume -->
  <SoundEvent Action="On" SoundId="DefaultEngineSoundBehavior"/>
</DeLavalNozzle>
<!-- + a controller to make it fire -->
<RocketEngineController Id="MyEngine">
  <RocketReference Id="Engine" SubPartId="<chamber instance id>"/>
</RocketEngineController>
```

(plus the `<CombustionProcess Id="Hydrolox_5.5">` existing, propellant tanks connected, and staging to arm it).

### 11.2 New engine reusing existing art = two new entries

Reusing an existing thrust-chamber SubPart (e.g. `CorePropulsionA_Subpart_EngineAMedBoostAssembly`, which already carries `Rocket "Engine"`+`Combustor`+`DeLavalNozzle` via its `SubPartGameData`):

1. **One `<Part>` prefab** instancing the reused SubParts (with transforms + a `<Connector>`).
2. **One `<PartGameData>`** matching that Id: `<EditorTag Value="Engines"/>` + `<RocketEngineController>` with one `<RocketReference Id="Engine" SubPartId="<chamber instance>"/>` + `<SubPart Id="<chamber instance>"><Gimbal>…</Gimbal></SubPart>` + `<SolidSphereMass><Mass Kg=…><Radius M=…></SolidSphereMass>` + `<Collider>`.

No new meshes, materials, SubParts, or SubPartGameData needed (`MeshAtlas`/`PbrMaterial`/`SubPart` are referenced by existing Id). To give the engine **custom thrust/Isp** without new art, instance an existing chamber SubPart but author your **own** `<Rocket>`/`<Combustor>`/`<DeLavalNozzle>` at the part level with distinct Ids and point the controller at those (avoid the "referenced by >1 Rocket" exception by using a nozzle-only SubPart or unique ids).

### 11.3 What makes a Part an "engine"

Engine identity = `DisplayName` (attr) + `<EditorTag Value="Engines"/>` + a `<RocketEngineController>`. **There is no `Description`, `Cost`, `TechTree`, or manufacturer field anywhere in this build** (verified). Dry mass = `<SolidSphereMass><Mass Kg>` (or other `InertMass` geometry). `EditorTag` values include `All, Hidden, Engines, Capsules, Interstage, NoFaceSnapping, Tanks, Radial, Coupling, Structural` + runtime-registered `RCS`, `Lights`, etc.

---

## 12. Worked example — LR91 Sea (`CorePropulsionA_Prefab_EngineA2`)

A gas-generator engine, assembled across all three layers:

- **(a) Prefab geometry** (`CorePropulsionAAssets.xml:606-690`): places `EngineA1WBase1`, flexi-pipe nodes, 2× actuator shafts + housings, the main `EngineAMedBoostAssembly1` (with a `<Gimbal>` pivot), `EngineATurbopumpFrame2`, `EngineATurbopumpNozzle2`, + a `<Connector>`.
- **(b) Reusable SubPartGameData:** `EngineAMedBoostAssembly` carries `Rocket "Engine"` + `Combustor "ThrustChamber"` (Hydrolox, **150 bar**, MinThrottle 0.2) + `DeLavalNozzle "Nozzle"` (AR 21, exit 2.5 m, plume `EngineAMed`). `EngineATurbopumpNozzle` carries only a bare `DeLavalNozzle "TurbineExhaustNozzle"` (AR 4, low efficiencies).
- **(c) PartGameData** (`CorePropulsionAGameData.xml:99-151`): `DisplayName="LR91 Sea"`, `<EditorTag Value="Engines"/>`, a `RocketEngineController "LR91-AJ-3"` referencing **two** rockets — `Engine` (on `MedBoostAssembly1`) and a part-level `GasGenerator` (`Combustor "GasGeneratorChamber"` Hydrolox 49 bar on the root + `Nozzle "TurbineExhaustNozzle"` on `TurbopumpNozzle2`). Gimbals: main chamber ±5° (`ConstrainToCircle=false`), turbine exhaust Y 70°. `<SolidSphereMass><Mass Kg="1500"/>`, `<Collider>` (3 shapes).

This demonstrates the two-rocket pattern: a single `<Rocket>` can stitch a Core on the root part to a Nozzle on a SubPart, and one controller drives multiple rockets at the same throttle.

---

## 13. Appendix — citation index & gotchas

**Physics:** `CombustorConfig.cs:15-43`, `DeLavalNozzleConfig.cs:16-118`, `GasProperties.cs:12-84`, `NozzlePerformance.cs:30-68`, `CombustionTable.cs:15-71`, `RocketDesign.cs` (whole), `RocketNozzle.cs:108-189`, `VehicleUpdateState.cs:255-280`.
**Schema (templates):** `RocketTemplate.cs`, `CombustorTemplate.cs`, `DeLavalNozzleTemplate.cs`, `RocketNozzleTemplate.cs`, `CombustionProcessTemplate.cs`, `CombustionCondition.cs`, `ReactantReference.cs`, `RocketControllerTemplate.cs`, `RocketEngineControllerTemplate.cs`, `RocketThrusterControllerTemplate.cs`, `GimbalReference.cs`, `RocketSoundEvent.cs`, `SubPartIdReference.cs`, `PartTemplate.cs:12-83,201-291`, `AssetBundle.cs:8-66`, `ModLibrary.cs:1516-1530`.
**Control:** `EngineController.cs`, `ThrusterController.cs`, `RocketCore.cs:37-80`, `Rocket.cs:25-133`, `EngineFlags.cs`, `ThrusterMapFlags.cs`, `Gimbal.cs`, `GimbalController.cs`, `FlightComputer.cs:308-381`, `Stage.cs:15,55-57`, `Part.cs:1344-1351`.
**Designer tool:** `EngineDesigner.cs:11-254`.
**Exhaust:** `VolumetricExhaustTemplate.cs`, `VolumetricExhaustReference.cs`, `VolumetricExhaustInstance.cs`, `VolumetricExhaustRenderer.cs:769-1055`, `RocketNozzle.cs:76-189`; `Content/Core/ExhaustAssets.xml`, `DefaultAssets.xml`.
**Resources/tanks:** `ResourceManager.cs`, `Tank.cs`, `Mole.cs`, `SubstanceTemplate.cs`, `SubstanceLibrary.cs`; `Content/Core/Substances.xml`, `Combustion.xml`, `CoreFuelTankAGameData.xml`.
**Engine data:** `Content/Core/CorePropulsionAAssets.xml`, `CorePropulsionAGameData.xml`, `CorePropulsionBAssets.xml`, `CorePropulsionBGameData.xml`.

**Gotchas to remember:**

- `MinimumThrottle` defaults to **1.0** → engines are on/off unless you lower it. The in-game designer doesn't emit it, so copy-pasted XML is non-throttleable.
- `AreaRatio` default is **NaN** → must always be supplied.
- `FxExitDiameter` ≠ `ExitDiameter` — the former is visual plume scale only.
- `ExhaustDirection` is the direction exhaust _leaves_; thrust pushes the opposite way (`−ExhaustDirection`).
- A `<Gimbal>` with both max angles 0 is a silent no-op.
- A `<Part>` without a matching `<PartGameData>` has no tag/modules and is invisible in the picker (the SRB trap).
- ExhaustAssets schema drift: emit C# field names; don't rely on `PressureModifiers`/`ThrottleModifiers` curves (only `AbsorptionDensityCurve` is honored).
- Combustion realism is entirely in the `<CombustionCondition>` LUT; the reactant list only governs propellant draw.
