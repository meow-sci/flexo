# Scope — GameData module blocks (mass, electrical, tanks, decoupler, docking port, control, light, sound)

> The per-Part / per-SubPart component data flexo attaches and round-trips inside the
> `<PartGameData>` / `<SubPartGameData>` documents. Each block maps to a KSA `*Template`
> class. Engine modules have their own file ([engines.md](engines.md)).

**Baseline:** re-vetted against KSA build **2026.7.9.5018** (decomp @ 5018 + shipped Core XML).
**Baseline status:** ✅ **CURRENT** — the electrical unit tokens (`J`/`W`), the `<DockingPort>`
child-element schema, and the `<Control>` command marker are all modeled (parse **and** emit,
current form only — no legacy fallback). As of 4892 (rev 4884), a tank's 4826-era
`<CombustionProcess>` propellant is GONE, replaced by the `<RoleAffinity>` consumer-role flags —
flexo models it as `Tank.roleAffinity` (see [What changed in 4892](#what-changed-in-4892)).
As of 4939, Core authors its tank data at PART level (passthrough-preserved, not editable) and
ships a new `FuelPort` module (passthrough-preserved) — see
[What changed in 4939](#what-changed-in-4939) and
[plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

---

## Flexo modules

| Path                           | Role                                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/types.ts`             | The TS structs: `Battery`/`Generator`/`SolarPanel`/`PowerConsumer`, `Decoupler`/`DockingPort`/`EvaDoor`, `Tank`/`TankShape`, `Light`/`LightType`, `PartGameData`/`SubPartGameData` containers + defaults (`createEmptyGameData`, `createTank`). |
| `src/ksa/partXmlParser.ts`     | Import side — `parseGameDataElement` reads a fixed allow-list. `readEnergyJoules`/`readPowerWatts`/`readImpulseNs` (over `sumUnitChild`) sum the unit-reference tokens; `tankFromElement`, `lightFromElement`, decoupler/docking parse.         |
| `src/ksa/partXmlSerializer.ts` | Export side — `serializeGameData` rebuilds `<PartGameData>`; `elWithAttr` emits unit attributes.                                                                                                                                                |
| `src/ksa/partCatalog.ts`       | `mergeGameData` carries the parsed modules into editable `CatalogPart`s.                                                                                                                                                                        |

## Game-side anchors (`decomp/KSA/`)

| Flexo type                 | C# template                                                                         | XML element                             | Attrs / children                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Defaults                                |
| -------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `Battery`                  | `BatteryTemplate.cs`                                                                | `<Battery>`                             | child `<MaximumCapacity>` = **`EnergyReference`**; attr `HasStatusLight`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 0                                       |
| `Generator`                | `GeneratorTemplate.cs`                                                              | `<Generator>`                           | child `<Produced>` = **`PowerReference`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 0                                       |
| `SolarPanel`               | `SolarPanelTemplate.cs`                                                             | `<SolarPanel>`                          | child `<Produced>` = **`PowerReference`** + `<Transform>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 0                                       |
| `PowerConsumer`            | `PowerConsumerTemplate.cs`                                                          | `<PowerConsumer>`                       | child `<Consumed>` = **`PowerReference`**; bool attrs `LightSwitch` (flight-toggleable light switch) + `LightIsActive` (initial on state; only read when `LightSwitch`). **flexo models ONE per part** (`PartGameData.powerConsumer`) — KSA has a single `Part.LightSwitch` slot (`Part.cs` `ResetModuleProperties` first-wins + `break`); multiple consumers just draw dead duplicate checkboxes. See `analysis/HOW_LIGHT_PARTS_WORK.md`.                                                                                                  | 0 / false / false                       |
| `Decoupler`                | `DecouplerTemplate.cs`                                                              | `<Decoupler>`                           | attrs `ConnectorId` (string), `Force` (float N)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **unchanged**                           |
| `DockingPort`              | `DockingPortTemplate.cs`                                                            | `<DockingPort>`                         | **CHANGED → child elements** `<ConnectorId Value>` (StringReference), `<LatchingKineticEnergy>` (EnergyReference), `<PushoffImpulse>` (ImpulseReference)                                                                                                                                                                                                                                                                                                                                                                                    | 50 J / 5000 Ns                          |
| `EvaDoor`                  | `EVADoorTemplate.cs`                                                                | `<EVADoor>`                             | attr `ConnectorId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | unchanged                               |
| `Tank`                     | `CylindricalTankTemplate.cs` / `SphericalTankTemplate.cs` (base `AsmbTankTemplate`) | `<CylindricalTank>` / `<SphericalTank>` | `<Material Id>`, `<Length M>`, `<OuterRadius M>`, `<WallThickness Mm>`, `<RoleAffinity>` (ConsumerRole flags text, default `Engine`)                                                                                                                                                                                                                                                                                                                                                                                                        | RoleAffinity replaced CombustionProcess |
| `customMass`               | `CustomMassTemplate.cs`                                                             | `<CustomMass>`                          | child `<Mass Kg>` (`MassReference`) modeled as the editable scalar; **all other children** (`<MassSpecificInertia>` (`InertiaTemplate`), `AsmbTransformTemplate` offsets) preserved verbatim in `customMassExtras` (`RawXmlNode[]`) and re-emitted inside `<CustomMass>`. A `Mass`-less CustomMass (Density/Material forms) and repeats beyond the first (`PartTemplate.InertMasses` is a list) go whole into `unknownChildren` passthrough. Carried through built-in Part import (`partCatalog` → `partImport` → `applyImportedGameData`). | Mass>0 required; Ixx/Iyy/Izz 1.0        |
| `Light`                    | `LightModule.TemplateData`                                                          | `<Light>` (under `<SubPartGameData>`)   | `<Type>`, `<Transform>`, `<Range Value>`, `<Intensity Value>`, `<Color R G B>`, `<InnerAngle Value>`, `<OuterAngle Value>`, `<RayTracing>`                                                                                                                                                                                                                                                                                                                                                                                                  | Range/Intensity 1, Inner π/8, Outer π/4 |
| `controllable` (`Control`) | `ControlTemplate.cs` (empty marker)                                                 | `<Control/>`                            | none (bare element) → `PartGameData.controllable: boolean`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | false                                   |
| _(NOT modeled)_ `Inertia`  | `InertiaTemplate.cs`                                                                | `<MassSpecificInertia>`                 | attrs `Ixx`/`Iyy`/`Izz`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 1.0                                     |

### Unit reference classes (the token→scale tables flexo must match)

| Unit class                                            | Quantity | Tokens (× scale to SI)                                                         |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `EnergyReference.cs` (**NEW**, was `JoulesReference`) | Joules   | `J`×1, `KJ`×1e3, `MJ`×1e6, `GJ`×1e9, `TJ`×1e12, `Ws`×1, `Wh`×3600, `KWh`×3.6e6 |
| `PowerReference.cs` (**NEW**)                         | Watts    | `W`×1, `KW`×1e3, `MW`×1e6, `GW`×1e9, `TW`×1e12                                 |
| `ImpulseReference.cs` (**NEW**)                       | N·s      | `Ns`×1, `KNs`×1e3, `MNs`×1e6                                                   |
| `MassReference`                                       | kg       | `Kg`, `Mg`(tonne), `G`, … (Battery `Kg` used)                                  |
| `DistanceReference`                                   | m        | `Ly Au Km M Cm Mm` (all default `NaN`)                                         |
| `PressureReference`                                   | Pa       | `Pa KPa MPa MBar Bar Atm` (engine `MaxPressure` = `Bar`)                       |

## The contract — what flexo bakes in

**Element names flexo parses AND emits** (must exist verbatim): `PartGameData`@`Id`/@`DisplayName`, `EditorTag`@`Value`, `CustomMass`>`Mass`@`Kg`, `Battery`>`MaximumCapacity`, `Generator`>`Produced`, `SolarPanel`>`Produced`+`Transform`, `PowerConsumer`>`Consumed`+@`LightSwitch`/@`LightIsActive` (bools, emitted only when true), `Connector`@`Id`>`Flags`, `Decoupler`@`ConnectorId`@`Force`, `DockingPort`(see below), `EVADoor`@`ConnectorId`, `SubPartGameData`@`Id`, `CylindricalTank`/`SphericalTank`, `Light`, plus all engine elements.

**Hard-coded unit tokens** (the `readEnergyJoules`/`readPowerWatts`/`readImpulseNs` readers + the `elWithAttr` emitters):

- Battery `MaximumCapacity` → flexo **writes `J`**; reads the full `EnergyReference` set (`J`/`KJ`/`MJ`/`GJ`/`TJ`/`Ws`/`Wh`/`KWh`). Model holds **Wh** (1 Wh = 3600 J).
- Generator/Solar/Consumer `Produced`/`Consumed` → flexo **writes `W`**; reads the `PowerReference` set (`W`/`KW`/`MW`/`GW`/`TW`).
- Tank `Length`/`OuterRadius` = **`M`**, `WallThickness` = **`Mm`**. CustomMass `Mass` = **`Kg`**.
- Decoupler `Force` = bare numeric attr (unchanged). DockingPort = child elements `<ConnectorId Value>` + `<LatchingKineticEnergy J>` (EnergyReference) + `<PushoffImpulse Ns>` (ImpulseReference).

**Enums / strings**: `TankShape` `'Cylindrical'|'Spherical'`; `ConnectorFlag` `'Internal'|'ToSurface'|'FromSurface'`; `LightType` `'Spot'|'Point'`.

**Round-trip safety:** see the ⭐ master invariant in [part-and-subpart-xml.md](part-and-subpart-xml.md#-master-invariant--flexo-rebuilds-a-fresh-dom-now-with-gamedata-passthrough). As of gap 6, unmodeled `<PartGameData>`/`<SubPartGameData>` **child elements + root attrs are preserved** verbatim (`RawXmlNode` passthrough) — e.g. `<Collider>`, the `SolidSphereMass`… mass family, `<IVASeat>`, `<SubstanceStorageVolume>`, a SubPart's `DisplayName`. (Unmodeled elements OUTSIDE these two containers are still dropped.)

## Known gotchas

- **Duplicate-`Id` `<SubPartGameData>` MERGE, not last-wins.** KSA registers each GameData block by `Id` and, on a repeat `Id`, applies the later block onto the first (`PartGameDataReference.OnDataLoad` → `PartTemplate.ApplyGameData`): list-valued modules (tanks/solar panels/lights/engine modules — `Components.AddRange`) **accumulate**, scalar fields overwrite only when the incoming value is non-null. Core's fuel-tank skins rely on this — e.g. `CoreFuelTankA_Subpart_Skin1WHalfHA` appears **twice** in `PartGameData.xml`: once carrying the `<Tank>`, and again (the "Quad Fuel Tank" variant) with only an unmodeled `<SubstanceStorageVolume>`. flexo's `subPartGameDataFromRoot` (`partXmlParser.ts`) merges duplicates by `Id` to match; a naive `Map.set` last-wins silently dropped the tank. Regression-covered by the vendored `PartGameData.xml` fixture (`partCatalog.test.ts`).
- **Battery Wh↔J** is an off-by-3600 trap if the unit token is misread.
- The **DockingPort parser + serializer** model only the current child-element form (`<ConnectorId Value>`, `<LatchingKineticEnergy J>`, `<PushoffImpulse Ns>`) — no legacy attribute fallback. Stale data is discarded by the boot-time project purge, never migrated.
- Connector `<Flags>` is emitted in **both** the Assets and GameData docs.
- Light `Scale` is never emitted (KSA ignores it).
- `Battery.cs`'s save-state `[XmlElement("Charge")]` (was `"Joules"`) is **save-game state, not authored template** — irrelevant to flexo.

## What changed in 5018

### Container `Id`s became load-bearing — MISSING-CAPABILITY, now modeled

Every `Components` entry carries an `Id` via `ModuleBase.TemplateDataBase.Id` (an
`[XmlAttribute]`), and its element name comes from `[XmlType(TypeName)]`. That `Id` was
inert to flexo until 5018 made it the address an engine's `<FeedsFrom Container="X">`
resolves against (`PartTemplate.AddResolvedFeed`, which logs _"feeds from unknown container
'…'"_ on a miss). `<Tank>` now carries `Tank.id` **on the wrapping element** (not on the
inner `<CylindricalTank>`/`<SphericalTank>` shape), plus the shape's `<LocationAsmb>`.

The full `Components` element-name list @ 5018: `AttachedInternal`, `Collider`, `FuelPort`,
`IVASeat`, `KeyframeAnimationModule`, `Light`, `MeshView`, `PartModelGlass`, `PartModel`,
`PartModelDynamic`, **`SolidGrainSegment`**, `Tank`.

### Part-level `<Tank>` is now MODELED — closes the 4939 gap

Core has authored its prefab tank data as Part-LEVEL `<Tank>` entries since 2026.7.6;
flexo relied on the GameData passthrough to preserve them. That stopped being enough once
the `Id` became addressable (and once a user needed to author one), so `PartGameData.tanks`
is a real modeled list with its own Tanks section in the Part Data dialog. `'Tank'` moved
into `KNOWN_PART_GAMEDATA_CHILDREN`, so it no longer appears in `unknownChildren`.

### `<SolidGrainSegment>` — a new container kind

The solid analogue of a `<Tank>`: a stackable propellant grain that is also a feedable
`Components` entry. Modeled at both levels; see [engines.md](engines.md#what-changed-in-5018)
for the inner `<Grain>` schema and [plumbing-and-feeds.md](plumbing-and-feeds.md) for how
it is addressed.

### `<ConsumerFeedWiring>` left the passthrough

It parsed "fine" as unmodeled XML, but the passthrough remapper only rewrites
`<ConnectorRef>`/`<Sibling>` — so an imported entry's `SubPartId` and its children's
`Connector=`/`SubPart=` silently kept the SOURCE part's ids. Modeled and remapped now.

### `HollowOpenSemiEllipsoidMass` — new inert-mass shape (rev 5002), passthrough-safe

`HollowOpenSemiEllipsoidMassTemplate` joins the `SolidSphereMass`/`SolidCylinderMass`/
`HollowOpenCylinderMass`/… family with `<Material Id>` + `<Length>` + `<Radius>` +
`<WallThickness>`. flexo has never modeled the inert-mass family — it rides the
`<PartGameData>`/`<SubPartGameData>` passthrough verbatim — so **no code change is needed**;
recorded here so the next reviewer doesn't re-derive it.

## What changed in 4980

**INTACT — no flexo change.** No `*Template.cs` module class and none of the unit reference
classes (`EnergyReference` / `PowerReference` / `ImpulseReference` / `MassReference`) appear in
the 4939→4980 diff, and the shipped GameData XML is content-identical in the 4980 mirror. The
only module-adjacent deltas are **vehicle-save** state, not authored template schema: `Control`
gained `VehicleName` + a `SaveData` (`[XmlType("ControlData")]`) for undock naming
(`ControlTemplate` untouched — still the empty `<Control/>` marker flexo models);
`EngineController.SaveData` gained `<FlowRule>`; `DockingPort`'s save records were reshaped
(`PreDockRootLocalId`/`<PreDockRootTransform>`). The 4939 OPEN items (part-level `<Tank>`
editing, `FuelPort` modeling) carry forward unchanged.

## What changed in 4939

- ✅ **Tank GameData moved to Part level (content shift; MISSING-CAPABILITY recorded).** Rev
  4934 relocated every Core tank out of `PartGameData.xml`'s `<SubPartGameData>` entries into
  Part-LEVEL `<Tank>` children of `<PartGameData>` in `CoreFuelTankAGameData.xml`, now with an
  optional `Id` attribute, an optional `<LocationAsmb X Y Z>`, and Core's first
  `<SphericalTank>` (which also authors a `<Length>`). The `Tank.TemplateData` /
  `AsmbTankTemplate` schema itself is otherwise unchanged (`<RoleAffinity>` fixes in Core data
  were content-only). flexo models tanks only on `<SubPartGameData>` — still-valid schema the
  game merges identically — so flexo-authored tanks are unaffected; imported Core prefab tanks
  now ride the gap-6 passthrough (preserved verbatim, NOT editable in the Part Data dialog).
  Modeling part-level tanks (+`LocationAsmb`/`Id`) is recorded in the gaps plan
  (`src/ksa/partXmlParser.ts` `KNOWN_PART_GAMEDATA_CHILDREN` / `parseGameDataElement`,
  `partXmlSerializer.ts` `serializeGameData`, `types.ts` `PartGameData`).
- ✅ **New `FuelPort` module (passthrough-safe).** Rev 4903: `FuelPort.cs` with
  `[XmlType("FuelPort")] TemplateData` — `[XmlAttribute("MaxLength")]` (meters) +
  `[XmlElement("AnchorAsmb")]` anchor point; registered in `ModuleList.CreateComponents`.
  Authored inside `<PartGameData>` (the new Fuel Port part) → survives flexo round-trips via
  gap-6 passthrough, opaque to the editor. Fuel LINES themselves are vehicle save-state
  (`FuelLinkList`), outside part-template scope. UI/modeling recorded as optional in the gaps
  plan.
- ✅ **`VolumeReference` XML schema unchanged.** The liters rework (rev 4934, new
  `CUBIC_METER_TO_LITER` et al. in `Constants.cs`) only changed `ToNearest` display formatting
  (cm³/m³/mm³ → µL/mL/L/kL/ML). The `[XmlAttribute]` tokens (`M3`/`Cm3`/`Mm3`) and scales are
  byte-identical — and flexo's tank model is geometric (Length/OuterRadius/WallThickness), so
  nothing to do.
- ✅ **Tank save-state additions are out of scope.** `PropellantUseDisabled` (rev 4938) sits on
  `Tank.SaveData`; `TankTransferMode`/transfer power (rev 4907) are runtime — none touch the
  authored template.

## What changed in 4892

- 🔴→✅ **Tank `<CombustionProcess>` → `<RoleAffinity>` (SCHEMA-DRIFT, fixed).** Decomp-confirmed:
  `AsmbTankTemplate.cs` swapped `[XmlElement("CombustionProcess")] SerializedReference
DefaultCombustionProcess` for `[XmlElement("RoleAffinity")] ConsumerRole RoleAffinity =
ConsumerRole.Engine` (`ConsumerRole` is a `[Flags]` byte enum `None|Engine|Thruster`; the
  XmlSerializer text form is space-separated, e.g. `Thruster` / `Engine Thruster`). Rev 4884:
  "Replaced pre-configured prop tank combustion processes with an _affinity_… tanks will try and
  fill themselves with the most sensible propellant mixture." Shipped XML: the three RCS
  `<SphericalTank>`s (plus the kitten backpack tank) now say `<RoleAffinity>Thruster</RoleAffinity>`;
  main fuel tanks omit it (default `Engine`). **flexo:** `Tank.combustionProcessId` →
  `Tank.roleAffinity: TankRoleAffinity` (`'None'|'Engine'|'Thruster'|'Engine Thruster'`), parsed
  by `readRoleAffinity` (token-normalizing), emitted only at non-default, codec key `ra`.
  Regression: `partXmlParser.test.ts` "tank `<RoleAffinity>`".
- ✅ **`PartTemplate.Tank` removed (NONE for flexo).** Rev 4884 "Removed dead PartTemplate.Tank
  field": `<CylindricalTank>`/`<SphericalTank>` can no longer sit directly under `<Part>` /
  `<PartGameData>` (the `PartGameDataReference.Tank` application was deleted too). flexo never
  modeled part-level tanks — its `Tank` lives only under the `<SubPartGameData>` `<Tank>` module
  wrapper, which is exactly the surviving `Tank.TemplateData` component path.
- ✅ **Battery/Generator/SolarPanel/PowerConsumer/Decoupler/DockingPort/Control/Light: NO drift.**
  None of their template classes appear in the 4826→4892 diff. `PowerManager.cs` changed
  runtime-only (resource-group integration). The new vehicle-level fuel-link system
  (`FuelLinkData` in vehicle saves) never touches Part/SubPart templates — not a flexo surface.

## What changed in 4826

- **Tanks gained a `<CombustionProcess>` propellant declaration.** Decomp-confirmed: `AsmbTankTemplate.cs` (the **base** of both `CylindricalTankTemplate` and `SphericalTankTemplate`) gained `[XmlElement("CombustionProcess")] public SerializedReference DefaultCombustionProcess = new SerializedReference();` — so any tank shape may carry it (a `SubstanceLibrary` combustion-process reference; `SerializedReference` → `<CombustionProcess Id/>`). In the shipped 4826 XML it appears on three hypergolic service-module `<SphericalTank>`s in `PartGameData.xml` (`CoreServiceModule…` RCS tanks) as `<CombustionProcess Id="MMH_NTO_1.6" />`. `<Tank>` is a **modeled** `<SubPartGameData>` child (rebuilt from a typed model, not passthrough), so flexo silently dropped the new child on export. **Fixed:** `Tank.combustionProcessId` — read in `tankFromElement` (covers **both** shapes, matching the base-class field), emitted in `buildTankElement` after `<WallThickness>`, persisted as codec `cp`. flexo doesn't edit it yet — preserved verbatim. Regression: `partXmlParser.test.ts` "tank `<CombustionProcess>`".
- **Solar-cell data tweak (not a schema change):** `CoreElectricalAGameData.xml` `CoreElectricalA_Subpart_SolarPanelB_CellA` `<Produced W>` went 50 → 100. flexo reads the value generically; only the vendored fixture + its assertion were refreshed.

## What changed in 4750 (detail in the fix plan)

- ✅ **Electrical unit refactor (was BREAKING — FIXED).** `JoulesReference`→`EnergyReference`/`PowerReference`; `BatteryJouleData` removed. Core data now uses `<MaximumCapacity J="…"/>` and `<Produced W="…"/>`/`<Consumed W="…"/>`. Flexo now writes `J`/`W` and reads the full `EnergyReference`/`PowerReference` token sets. Battery still round-trips Wh↔J (×3600).
- ✅ **DockingPort schema (was BREAKING — FIXED).** Attribute-form → child-element form, renamed fields, new units **and quantities**: `LatchingImpulse`(N·s)→`LatchingKineticEnergy`(J, default 50); `PushoffForce`(N)→`PushoffImpulse`(N·s, default 5000). Flexo now emits and parses the current child-element form only (`<ConnectorId Value>` + `<LatchingKineticEnergy J>` + `<PushoffImpulse Ns>`). Model fields renamed `latchingKineticEnergyJ`/`pushoffImpulseNs`. No legacy fallback — stale projects are purged at boot, not migrated.
- ✅ **`<Control/>` (was MISSING-CAPABILITY — FIXED).** New empty command marker on command pods; flexo now models it as `PartGameData.controllable` (parse = presence of a `<Control>` child; emit = a bare `<Control/>`), carried through catalog/import/persist so a re-exported capsule stays controllable. **Semantics (verified 4750):** `Control` is _purely_ a controllability flag — `Vehicle.IsControllable` is true if any `Control` module exists anywhere in the tree (`ControlTemplate.cs` is an empty marker). It carries **no transform and no orientation**: the vehicle's attitude/"up" reference frame is the **root part**, not the `Control`-bearing part. See [connectors-coordinates-iva.md → Vehicle reference orientation](connectors-coordinates-iva.md#the-contract--what-flexo-bakes-in) and [analysis/HOW_UP_WORKS.md](../analysis/HOW_UP_WORKS.md).
- ✅ **Tank / CustomMass / Inertia / Decoupler / Stages→"Resource Groups": NO schema drift.** Tank+mass templates byte-identical; Decoupler runtime-only; the "Stages→Resource Groups" rename is in-game ImGui label strings only (flexo has no Staging type — only two stale doc comments in `types.ts`/`easingFit.ts`).
