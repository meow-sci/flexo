# Scope — GameData module blocks (mass, electrical, tanks, decoupler, docking port, control, light, sound)

> The per-Part / per-SubPart component data flexo attaches and round-trips inside the
> `<PartGameData>` / `<SubPartGameData>` documents. Each block maps to a KSA `*Template`
> class. Engine modules have their own file ([engines.md](engines.md)).

**Baseline:** verified against KSA build **2026.6.9.4750**.
**Baseline status:** ✅ **CURRENT** — the electrical unit tokens (now `J`/`W`), the
`<DockingPort>` child-element schema, and the new `<Control>` command marker all changed/landed this
build; flexo's parse **and** emit are now fixed for all three (current form only — no legacy
fallback). See [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

---

## Flexo modules

| Path                           | Role                                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/types.ts`             | The TS structs: `Battery`/`Generator`/`SolarPanel`/`PowerConsumer`, `Decoupler`/`DockingPort`/`EvaDoor`, `Tank`/`TankShape`, `Light`/`LightType`, `PartGameData`/`SubPartGameData` containers + defaults (`createEmptyGameData`, `createTank`). |
| `src/ksa/partXmlParser.ts`     | Import side — `parseGameDataElement` reads a fixed allow-list. `readEnergyJoules`/`readPowerWatts`/`readImpulseNs` (over `sumUnitChild`) sum the unit-reference tokens; `tankFromElement`, `lightFromElement`, decoupler/docking parse.         |
| `src/ksa/partXmlSerializer.ts` | Export side — `serializeGameData` rebuilds `<PartGameData>`; `elWithAttr` emits unit attributes.                                                                                                                                                |
| `src/ksa/partCatalog.ts`       | `mergeGameData` carries the parsed modules into editable `CatalogPart`s.                                                                                                                                                                        |

## Game-side anchors (`decomp/KSA/`)

| Flexo type                 | C# template                                                                         | XML element                             | Attrs / children                                                                                                                                                        | Defaults                                |
| -------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `Battery`                  | `BatteryTemplate.cs`                                                                | `<Battery>`                             | child `<MaximumCapacity>` = **`EnergyReference`**; attr `HasStatusLight`                                                                                                | 0                                       |
| `Generator`                | `GeneratorTemplate.cs`                                                              | `<Generator>`                           | child `<Produced>` = **`PowerReference`**                                                                                                                               | 0                                       |
| `SolarPanel`               | `SolarPanelTemplate.cs`                                                             | `<SolarPanel>`                          | child `<Produced>` = **`PowerReference`** + `<Transform>`                                                                                                               | 0                                       |
| `PowerConsumer`            | `PowerConsumerTemplate.cs`                                                          | `<PowerConsumer>`                       | child `<Consumed>` = **`PowerReference`**; bool attrs `LightSwitch` (flight-toggleable light switch) + `LightIsActive` (initial on state; only read when `LightSwitch`) | 0 / false / false                       |
| `Decoupler`                | `DecouplerTemplate.cs`                                                              | `<Decoupler>`                           | attrs `ConnectorId` (string), `Force` (float N)                                                                                                                         | **unchanged**                           |
| `DockingPort`              | `DockingPortTemplate.cs`                                                            | `<DockingPort>`                         | **CHANGED → child elements** `<ConnectorId Value>` (StringReference), `<LatchingKineticEnergy>` (EnergyReference), `<PushoffImpulse>` (ImpulseReference)                | 50 J / 5000 Ns                          |
| `EvaDoor`                  | `EVADoorTemplate.cs`                                                                | `<EVADoor>`                             | attr `ConnectorId`                                                                                                                                                      | unchanged                               |
| `Tank`                     | `CylindricalTankTemplate.cs` / `SphericalTankTemplate.cs` (base `AsmbTankTemplate`) | `<CylindricalTank>` / `<SphericalTank>` | `<Material Id>`, `<Length M>`, `<OuterRadius M>`, `<WallThickness Mm>`                                                                                                  | unchanged                               |
| `customMass`               | `CustomMassTemplate.cs`                                                             | `<CustomMass>`                          | child `<Mass Kg>` (`MassReference`), `<MassSpecificInertia>` (`InertiaTemplate`)                                                                                        | Mass>0 required; Ixx/Iyy/Izz 1.0        |
| `Light`                    | `LightModule.TemplateData`                                                          | `<Light>` (under `<SubPartGameData>`)   | `<Type>`, `<Transform>`, `<Range Value>`, `<Intensity Value>`, `<Color R G B>`, `<InnerAngle Value>`, `<OuterAngle Value>`, `<RayTracing>`                              | Range/Intensity 1, Inner π/8, Outer π/4 |
| `controllable` (`Control`) | `ControlTemplate.cs` (empty marker)                                                 | `<Control/>`                            | none (bare element) → `PartGameData.controllable: boolean`                                                                                                              | false                                   |
| _(NOT modeled)_ `Inertia`  | `InertiaTemplate.cs`                                                                | `<MassSpecificInertia>`                 | attrs `Ixx`/`Iyy`/`Izz`                                                                                                                                                 | 1.0                                     |

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

- **Battery Wh↔J** is an off-by-3600 trap if the unit token is misread.
- The **DockingPort parser + serializer** model only the current child-element form (`<ConnectorId Value>`, `<LatchingKineticEnergy J>`, `<PushoffImpulse Ns>`) — no legacy attribute fallback. Stale data is discarded by the boot-time project purge, never migrated.
- Connector `<Flags>` is emitted in **both** the Assets and GameData docs.
- Light `Scale` is never emitted (KSA ignores it).
- `Battery.cs`'s save-state `[XmlElement("Charge")]` (was `"Joules"`) is **save-game state, not authored template** — irrelevant to flexo.

## What changed in 4750 (detail in the fix plan)

- ✅ **Electrical unit refactor (was BREAKING — FIXED).** `JoulesReference`→`EnergyReference`/`PowerReference`; `BatteryJouleData` removed. Core data now uses `<MaximumCapacity J="…"/>` and `<Produced W="…"/>`/`<Consumed W="…"/>`. Flexo now writes `J`/`W` and reads the full `EnergyReference`/`PowerReference` token sets. Battery still round-trips Wh↔J (×3600).
- ✅ **DockingPort schema (was BREAKING — FIXED).** Attribute-form → child-element form, renamed fields, new units **and quantities**: `LatchingImpulse`(N·s)→`LatchingKineticEnergy`(J, default 50); `PushoffForce`(N)→`PushoffImpulse`(N·s, default 5000). Flexo now emits and parses the current child-element form only (`<ConnectorId Value>` + `<LatchingKineticEnergy J>` + `<PushoffImpulse Ns>`). Model fields renamed `latchingKineticEnergyJ`/`pushoffImpulseNs`. No legacy fallback — stale projects are purged at boot, not migrated.
- ✅ **`<Control/>` (was MISSING-CAPABILITY — FIXED).** New empty command marker on command pods; flexo now models it as `PartGameData.controllable` (parse = presence of a `<Control>` child; emit = a bare `<Control/>`), carried through catalog/import/persist so a re-exported capsule stays controllable. **Semantics (verified 4750):** `Control` is _purely_ a controllability flag — `Vehicle.IsControllable` is true if any `Control` module exists anywhere in the tree (`ControlTemplate.cs` is an empty marker). It carries **no transform and no orientation**: the vehicle's attitude/"up" reference frame is the **root part**, not the `Control`-bearing part. See [connectors-coordinates-iva.md → Vehicle reference orientation](connectors-coordinates-iva.md#the-contract--what-flexo-bakes-in) and [analysis/HOW_UP_WORKS.md](../analysis/HOW_UP_WORKS.md).
- ✅ **Tank / CustomMass / Inertia / Decoupler / Stages→"Resource Groups": NO schema drift.** Tank+mass templates byte-identical; Decoupler runtime-only; the "Stages→Resource Groups" rename is in-game ImGui label strings only (flexo has no Staging type — only two stale doc comments in `types.ts`/`easingFit.ts`).
