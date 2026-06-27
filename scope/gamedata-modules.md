# Scope — GameData module blocks (mass, electrical, tanks, decoupler, docking port, control, light, sound)

> The per-Part / per-SubPart component data flexo attaches and round-trips inside the
> `<PartGameData>` / `<SubPartGameData>` documents. Each block maps to a KSA `*Template`
> class. Engine modules have their own file ([engines.md](engines.md)).

**Baseline:** verified against KSA build **2026.6.9.4750**.
**Baseline status:** 🔴 **BREAKING** — the electrical unit tokens and the `<DockingPort>` schema
both changed this build; flexo's parse **and** emit are wrong for both. Plus **MISSING** `<Control>`.
See [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

---

## Flexo modules

| Path | Role |
|---|---|
| `src/ksa/types.ts` | The TS structs: `Battery`/`Generator`/`SolarPanel`/`PowerConsumer`, `Decoupler`/`DockingPort`/`EvaDoor`, `Tank`/`TankShape`, `Light`/`LightType`, `PartGameData`/`SubPartGameData` containers + defaults (`createEmptyGameData`, `createTank`). |
| `src/ksa/partXmlParser.ts` | Import side — `parseGameDataElement` reads a fixed allow-list. `readJoulesValue` sums the electrical unit attrs; `tankFromElement`, `lightFromElement`, decoupler/docking parse. |
| `src/ksa/partXmlSerializer.ts` | Export side — `serializeGameData` rebuilds `<PartGameData>`; `elWithAttr` emits unit attributes. |
| `src/ksa/partCatalog.ts` | `mergeGameData` carries the parsed modules into editable `CatalogPart`s. |

## Game-side anchors (`decomp/KSA/`)

| Flexo type | C# template | XML element | Attrs / children | Defaults |
|---|---|---|---|---|
| `Battery` | `BatteryTemplate.cs` | `<Battery>` | child `<MaximumCapacity>` = **`EnergyReference`**; attr `HasStatusLight` | 0 |
| `Generator` | `GeneratorTemplate.cs` | `<Generator>` | child `<Produced>` = **`PowerReference`** | 0 |
| `SolarPanel` | `SolarPanelTemplate.cs` | `<SolarPanel>` | child `<Produced>` = **`PowerReference`** + `<Transform>` | 0 |
| `PowerConsumer` | `PowerConsumerTemplate.cs` | `<PowerConsumer>` | child `<Consumed>` = **`PowerReference`**; attr `LightSwitch` | 0 |
| `Decoupler` | `DecouplerTemplate.cs` | `<Decoupler>` | attrs `ConnectorId` (string), `Force` (float N) | **unchanged** |
| `DockingPort` | `DockingPortTemplate.cs` | `<DockingPort>` | **CHANGED → child elements** `<ConnectorId Value>` (StringReference), `<LatchingKineticEnergy>` (EnergyReference), `<PushoffImpulse>` (ImpulseReference) | 50 J / 5000 Ns |
| `EvaDoor` | `EVADoorTemplate.cs` | `<EVADoor>` | attr `ConnectorId` | unchanged |
| `Tank` | `CylindricalTankTemplate.cs` / `SphericalTankTemplate.cs` (base `AsmbTankTemplate`) | `<CylindricalTank>` / `<SphericalTank>` | `<Material Id>`, `<Length M>`, `<OuterRadius M>`, `<WallThickness Mm>` | unchanged |
| `customMass` | `CustomMassTemplate.cs` | `<CustomMass>` | child `<Mass Kg>` (`MassReference`), `<MassSpecificInertia>` (`InertiaTemplate`) | Mass>0 required; Ixx/Iyy/Izz 1.0 |
| `Light` | `LightModule.TemplateData` | `<Light>` (under `<SubPartGameData>`) | `<Type>`, `<Transform>`, `<Range Value>`, `<Intensity Value>`, `<Color R G B>`, `<InnerAngle Value>`, `<OuterAngle Value>`, `<RayTracing>` | Range/Intensity 1, Inner π/8, Outer π/4 |
| *(NOT modeled)* `Control` | `ControlTemplate.cs` (empty marker) | `<Control/>` | none | — |
| *(NOT modeled)* `Inertia` | `InertiaTemplate.cs` | `<MassSpecificInertia>` | attrs `Ixx`/`Iyy`/`Izz` | 1.0 |

### Unit reference classes (the token→scale tables flexo must match)

| Unit class | Quantity | Tokens (× scale to SI) |
|---|---|---|
| `EnergyReference.cs` (**NEW**, was `JoulesReference`) | Joules | `J`×1, `KJ`×1e3, `MJ`×1e6, `GJ`×1e9, `TJ`×1e12, `Ws`×1, `Wh`×3600, `KWh`×3.6e6 |
| `PowerReference.cs` (**NEW**) | Watts | `W`×1, `KW`×1e3, `MW`×1e6, `GW`×1e9, `TW`×1e12 |
| `ImpulseReference.cs` (**NEW**) | N·s | `Ns`×1, `KNs`×1e3, `MNs`×1e6 |
| `MassReference` | kg | `Kg`, `Mg`(tonne), `G`, … (Battery `Kg` used) |
| `DistanceReference` | m | `Ly Au Km M Cm Mm` (all default `NaN`) |
| `PressureReference` | Pa | `Pa KPa MPa MBar Bar Atm` (engine `MaxPressure` = `Bar`) |

## The contract — what flexo bakes in

**Element names flexo parses AND emits** (must exist verbatim): `PartGameData`@`Id`/@`DisplayName`, `EditorTag`@`Value`, `CustomMass`>`Mass`@`Kg`, `Battery`>`MaximumCapacity`, `Generator`>`Produced`, `SolarPanel`>`Produced`+`Transform`, `PowerConsumer`>`Consumed`, `Connector`@`Id`>`Flags`, `Decoupler`@`ConnectorId`@`Force`, `DockingPort`(see below), `EVADoor`@`ConnectorId`, `SubPartGameData`@`Id`, `CylindricalTank`/`SphericalTank`, `Light`, plus all engine elements.

**Hard-coded unit tokens** (`readJoulesValue` + the `elWithAttr` emitters):
- Battery `MaximumCapacity` attr → flexo reads/writes **`Joules`** (and reads `Watts`, `KWh`×3.6e6). Model holds **Wh** (1 Wh = 3600 J).
- Generator/Solar/Consumer `Produced`/`Consumed` attr → flexo reads/writes **`Watts`**.
- Tank `Length`/`OuterRadius` = **`M`**, `WallThickness` = **`Mm`**. CustomMass `Mass` = **`Kg`**.
- Decoupler `Force`, Docking `LatchingImpulse`/`PushoffForce` = bare numeric attributes (no unit token) — **this is the old form**.

**Enums / strings**: `TankShape` `'Cylindrical'|'Spherical'`; `ConnectorFlag` `'Internal'|'ToSurface'|'FromSurface'`; `LightType` `'Spot'|'Point'`.

**Round-trip safety:** see the ⭐ master invariant in [part-and-subpart-xml.md](part-and-subpart-xml.md#-master-invariant--flexo-does-not-preserve-unknown-xml). Unmodeled blocks are **dropped**.

## Known gotchas
- **Battery Wh↔J** is an off-by-3600 trap if the unit token is misread.
- The **DockingPort legacy `Force` fallback** in the parser was built for *old* files; against 4750 it now silently produces `0/0`.
- Connector `<Flags>` is emitted in **both** the Assets and GameData docs.
- Light `Scale` is never emitted (KSA ignores it).
- `Battery.cs`'s save-state `[XmlElement("Charge")]` (was `"Joules"`) is **save-game state, not authored template** — irrelevant to flexo.

## What changed in 4750 (detail in the fix plan)
- 🔴 **Electrical unit refactor (BREAKING).** `JoulesReference`→`EnergyReference`/`PowerReference`; `BatteryJouleData` removed. Core data now uses `<MaximumCapacity J="…"/>` and `<Produced W="…"/>`/`<Consumed W="…"/>`. Flexo reads `Joules`/`Watts` (→ 0 on import) and writes `Joules`/`Watts` (→ ignored by game, 0 capacity/output). The `partXmlParser.ts` comment "the game does NOT recognize a bare `W` — only `Watts`" is now exactly backwards.
- 🔴 **DockingPort schema (BREAKING).** Attribute-form → child-element form, renamed fields, new units **and quantities**: `LatchingImpulse`(N·s)→`LatchingKineticEnergy`(J); `PushoffForce`(N)→`PushoffImpulse`(N·s). Flexo emits the dead attribute form (→ `IsValid()` false → docking port dropped in-game) and parses the dead attributes (→ empty/0 on import).
- 🟡 **`<Control/>` (MISSING-CAPABILITY).** New empty marker on command pods; flexo drops it → re-exported capsule is no longer controllable.
- ✅ **Tank / CustomMass / Inertia / Decoupler / Stages→"Resource Groups": NO schema drift.** Tank+mass templates byte-identical; Decoupler runtime-only; the "Stages→Resource Groups" rename is in-game ImGui label strings only (flexo has no Staging type — only two stale doc comments in `types.ts`/`easingFit.ts`).
