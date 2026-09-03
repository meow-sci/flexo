# Scope — Plumbing topology (connector capabilities, consumer feed points, containers)

> **New integration surface at KSA 2026.7.9.5018.** Before 5018 propellant flow was
> IMPLICIT — a `Combustor` owned a `ResourceManager` that searched the whole vehicle for
> tanks holding its reactants, ranked by a `FlowRule`. Authoring an engine meant authoring
> a `<Combustor>` and nothing else. As of 5018 flow is **explicitly authored topology**,
> and an engine that does not declare it produces **zero thrust**.
>
> This is the surface where "flexo emits valid-looking XML" and "the part actually works
> in-game" diverge: every failure here is a silent log line, not a load error. Read
> alongside [engines.md](engines.md), [connectors-coordinates-iva.md](connectors-coordinates-iva.md)
> and [gamedata-modules.md](gamedata-modules.md).

**Baseline:** re-verified against KSA build **2026.9.7.5402** (decomp @ 5402 + shipped Core XML);
surface introduced at **2026.7.9.5018**.
**Baseline status:** ✅ **CURRENT** — modeled end-to-end (parse, serialize, import/paste
remapping, project codec v4, authoring UI, export pre-flight) by the 5018 upgrade.

---

## The three layers

Propellant reaches a **consumer** (a `RocketCore` — a `<Combustor>` or a `<SolidMotor>`)
only when all three agree:

1. **Connectors declare what may cross them** — `<Capabilities>`
   (`Part.Connector.TemplateBase.Capabilities`, `ConnectorCapabilityFlags`). A connection
   carries a resource only when **both** endpoints declare it
   (`Part.Connection.HasCapabilities` → `ConnectorCapabilityExtensions.Intersect`).
2. **Consumers declare their feed points** — `<FeedsFrom>`
   (`RocketCoreTemplate.FeedsFrom`, `List<FeedsFromReference>`). An empty list logs
   _"Rocket core X declares no FeedsFrom feed points; it will reach no propellant"_.
3. **Parts wire their SubParts' consumers** — `<ConsumerFeedWiring>`
   (`PartTemplate.ConsumerFeedWiring`). A reusable thrust chamber says
   `<FeedsFrom Parent="true"/>`; the Part that places it answers with a real connector or
   container.

---

## Flexo modules

| Path                                  | Role                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/types.ts`                    | `ConnectorCapability` + `CONNECTOR_CAPABILITIES`, `FeedSource`, `PlumbingClass`, `ConsumerFeedWiring`, `isFeedSourceValid`.                 |
| `src/ksa/partXmlParser.ts`            | `parseConnectorCapabilities`, `feedFromElement`/`feedsFromElement`, `readPlumbing`, the `<ConsumerFeedWiring>` + part-level `<Tank>` parse. |
| `src/ksa/partXmlSerializer.ts`        | `appendConnectorTokens` (shared by BOTH documents), `buildFeedElements`, `buildConsumerFeedWiringElement`, `buildTankWrapperElement`.       |
| `src/ksa/idRemap.ts`                  | `remapFeed` / `remapConsumerFeeds` / `remapConsumerFeedWiring` — rewrites feed refs onto regenerated ids on import + paste.                 |
| `src/ksa/engineValidation.ts`         | Pre-flight: `block` (KSA throws at load) vs `warn` (loads, misbehaves).                                                                     |
| `src/ksa/partCatalog.ts`              | `connectorCapabilities` map merged onto the imported connectors by id.                                                                      |
| `src/state/feedTargets.ts`            | `feedTargetsOf` / `consumerOptionsOf` / `unwiredConsumersOf` — the pickable options + the auto-wire candidate set.                          |
| `src/state/editorStore.ts`            | `setConnectorCapabilities`, `setCombustorFeeds`/`Plumbing` (+ part-level), the `ConsumerFeedWiring` actions, `autoWireUnwiredConsumers`.    |
| `src/ui/FeedsField.tsx`               | The `<FeedsFrom>` list editor.                                                                                                              |
| `src/ui/engine/FeedWiringEditor.tsx`  | The `<ConsumerFeedWiring>` editor (Engine mode's Feed wiring group AND Data ▸ Part ▸ Wiring — one component, two entrances).                |
| `src/ui/engine/CombustorEditor.tsx`   | The plumbing class select + the combustor's `<FeedsFrom>` list.                                                                             |
| `src/ui/build/ConnectorInspector.tsx` | The connector Capabilities switch row.                                                                                                      |

## Game-side anchors (`decomp/KSA/`)

| Concept                              | KSA source                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Authored capability flags            | `ConnectorCapabilityFlags.cs` (`[Flags] byte`)                                                                   |
| Runtime capability set               | `ConnectorCapability.cs` (a DIFFERENT enum — see the inversion rule below)                                       |
| Flag → capability conversion + merge | `ConnectorCapabilityExtensions.ToCapability()`, `Intersect()`; `PartTemplate.ApplyGameData` (`Capabilities \|=`) |
| Feed point                           | `FeedsFromReference.cs` (`IsValid`, `OnDataLoad`)                                                                |
| Feed requirement + error             | `RocketCoreTemplate.cs` `OnDataLoad`                                                                             |
| Plumbing class                       | `PlumbingClass.cs`; `ConnectorCapabilityExtensions.ToCapability(PlumbingClass)`                                  |
| Wiring entry                         | `ConsumerFeedWiring.cs` (`: SubPartIdReference`)                                                                 |
| Resolution                           | `PartTemplate.cs` `ResolveConsumerFeedPoints` / `ResolveConsumerFeeds` / `AddResolvedFeed`                       |
| Container ids                        | `ModuleBase.cs` `TemplateDataBase.Id` (`[XmlAttribute]`); element name from `[XmlType(TypeName)]`                |

---

## The contract — what flexo bakes in

### 1. `<Capabilities>` — an empty list is NOT "nothing"

```xml
<Connector Id="_connector17"><Capabilities>BulkFluid</Capabilities></Connector>
```

`ConnectorCapabilityFlags : byte { None=0, BulkFluid=1, SolidMotorCase=2, NoElectricity=4,
NoServiceFluid=8, DecouplerJoint=0x10 }`.

**The inversion rule.** `ToCapability()` does not map the authored flags 1:1 — it starts
from nothing, ADDS `BulkFluid` / `SolidMotorCase` / `DecouplerJoint` when present, and adds
`Electricity` / `ServiceFluid` **unless** `NoElectricity` / `NoServiceFluid` are present.
So an unauthored connector is `Electricity | ServiceFluid`, and the two `No…` tokens
SUBTRACT from that default. flexo therefore models "empty" as a real, meaningful state and
never treats it as "no capabilities".

Consequences flexo's validation encodes:

- A **main-engine** propellant path is dead unless every connector along it declares
  `BulkFluid` (`Bulk` plumbing demands it at both ends).
- **SRB segments stack** only across `SolidMotorCase`.
- Since rev 5007 a **decoupler's connector must declare `DecouplerJoint`** — it replaced
  the old `_decouplerConnections` list, so `<Decoupler ConnectorId>` alone is no longer
  enough.

**Merged across documents.** `PartTemplate.ApplyGameData` does `Capabilities |= …`, so the
geometry `<Part>` and the `<PartGameData>` values are OR-ed. flexo emits the same list in
both (idempotent) via one shared helper, so the documents cannot drift.

### 2. `<FeedsFrom>` — exactly one target

```xml
<FeedsFrom Parent="true" />
<FeedsFrom Connector="_connector2" />
<FeedsFrom Container="Grain" />
<FeedsFrom SubPart="CorePropulsionA_Subpart_SRBSizeASmallSegmentA1" Container="Grain" />
```

`FeedsFromReference.IsValid` requires **exactly one** of `Container` / `Connector` /
`Parent`; `SubPart` is legal only alongside `Container` (it re-roots the container lookup
to a placed SubPart's own `Components`). flexo models this as a discriminated union
(`FeedSource`), so an invalid combination is unrepresentable in the editor; a malformed
element read from XML is DROPPED rather than round-tripped (KSA would only log it).

**Required.** `RocketCoreTemplate.OnDataLoad` logs an Error on an empty list. flexo's
`createCombustor` therefore defaults to `[{ kind: 'parent' }]`, not `[]`.

### 3. `<Plumbing>` — which network a combustor draws through

`PlumbingClass : byte { Bulk, Service }`, mapped by
`ConnectorCapabilityExtensions.ToCapability(PlumbingClass)`: `Bulk ⇒ BulkFluid`,
`Service ⇒ ServiceFluid`. `Bulk` is the schema default (0), so an RCS thruster MUST
declare `Service` — otherwise it demands `BulkFluid` across connectors that only carry
`ServiceFluid` and gets nothing. Every Core RCS combustor declares it. Solid motors have
no `<Plumbing>` (they feed from grain, not a fluid network).

### 4. `<ConsumerFeedWiring>` — the Part's answer to `Parent="true"`

```xml
<ConsumerFeedWiring Id="ThrustChamber" SubPartId="CorePropulsionA_Subpart_EngineAMedBoostAssembly1">
  <FeedsFrom Connector="_connector2" />
</ConsumerFeedWiring>
```

`Id` is the consumer's **template** id; `SubPartId` is the **placement instance** id (empty
⇒ the root part). `ResolveConsumerFeeds` prefers an instance-scoped entry and falls back to
an unscoped one for the same consumer id. Two rules flexo enforces at author time:

- A wiring entry may **not itself** use `Parent="true"` (_"cannot itself defer to Parent"_).
- An entry that wires zero feed points is an error (_"wires no feed points"_), as is one
  that names a consumer the part doesn't carry (_"wires no consumer this part carries"_) —
  flexo omits both from the export instead of emitting them.

### 5. Container ids became load-bearing

`<FeedsFrom Container="X">` resolves against `PartTemplate.Components[].Id` — i.e.
`ModuleBase.TemplateDataBase.Id`, an `[XmlAttribute]` every `Components` entry carries.
`<Tank>` and `<SolidGrainSegment>` are both `Components`, so **the `Id` on the wrapping
element is what an engine addresses**:

```xml
<Tank Id="PropellantTank"><SphericalTank>…</SphericalTank></Tank>
<SolidGrainSegment Id="Grain"><Grain>…</Grain></SolidGrainSegment>
```

A container with no `Id` is simply unaddressable — flexo's feed-target picker skips it and
the validator reports a container feed naming it as unresolvable.

### 6. Reference remapping (flexo-side, not a game rule)

Importing a built-in Part or pasting a project regenerates every `_connectorN` and every
placement `instanceId`. `<FeedsFrom Connector=>`, `<FeedsFrom SubPart=>` and
`<ConsumerFeedWiring SubPartId=>` all reference those by literal string, so `src/ksa/idRemap.ts`
rewrites them in the same pass. An unmapped id is left as-is (the same policy
`remapRawConnectorRefs` uses — a partial import can't be pruned safely). `containerId` is a
template-local `Components` id and is never regenerated, so it passes through untouched.

---

## Known gotchas

- **`<Connector>`, `<Combustor>` and `<Tank>` are MODELED elements** — they do NOT ride the
  `<PartGameData>` `RawXmlNode` passthrough. Any schema ADDED to them is silent data-loss
  on import → export. This surface is the canonical example: before the 5018 upgrade,
  importing a Core fuel tank and re-exporting stripped its `BulkFluid`.
- **`<ConsumerFeedWiring>` used to be passthrough**, which looked safe but wasn't: the
  passthrough remapper only rewrites `<ConnectorRef>`/`<Sibling>`, so the entry's
  `SubPartId` and its children's `Connector=`/`SubPart=` silently kept the SOURCE part's
  ids. It is modeled now.
- **Failure is silent.** Every rule in this doc except the solid-motor ones is an Error
  LOG, not a throw — the mod loads, the part appears in the VAB, and the engine simply
  makes no thrust. That is why `engineValidation.ts` exists and why the export dialog
  surfaces warnings, not just blocking errors.
- **`Parent` on a part-level consumer is legal** and needs no wiring (it defers to whatever
  places the _part_), so flexo's "unwired consumer" check only fires for SubPart-level ones.

---

## What changed in 5402

**Nothing.** `ConnectorCapability*`, `FeedsFromReference`, `ConsumerFeedWiring` and
`RocketCoreTemplate` are byte-identical; `PartTemplate.ResolveConsumerFeedPoints` /
`ResolveConsumerFeeds` / `AddResolvedFeed` moved only by source line numbers in their log calls.
The new `<Parachute>` is a `Components` module, so its `Id` (`DrogueChute` / `MainChute`) shares the
container id namespace `AddResolvedFeed` scans — one more reason not to name a tank like a chute.

---

## What changed in 5348

**Nothing on the plumbing contract.** `ConnectorCapability*`, `FeedsFromReference`,
`ConsumerFeedWiring` and `RocketCoreTemplate` are byte-identical; empty `<Capabilities>` still
defaults to `Electricity|ServiceFluid`, `[Flags]` bodies are still whitespace-separated, and
container `Id`s are still load-bearing. `PartTemplate.AddResolvedFeed`'s container check still
scans every `Components[].Id` — which is now shared with `<Light Id>` (see
[gamedata-modules.md](gamedata-modules.md#what-changed-in-5348)); flexo's auto-filled `_lightN` ids
cannot collide with a real container name in practice, but the namespace is worth remembering.

Rev 5326 reworked **vehicle power** onto `ElectricalCircuits` — the craft is partitioned once into
groups of parts joined by `Electricity`-carrying connections and every consumer draws from its
circuit's batteries. That is a runtime/perf change with no schema of its own; it does make the
`Electricity` capability on a connector more load-bearing than before.

---

## What changed in 5261

**Verdict: NONE.** `ConnectorCapability*`, `FeedsFromReference`, `ConsumerFeedWiring` and
`RocketCoreTemplate` are all **byte-identical** to 5168. `PartTemplate`'s feed resolution
(`ResolveConsumerFeedPoints` / `ResolveConsumerFeeds` / `AddResolvedFeed`) changed only in log line
numbers and one `Span` slice rewritten by the decompiler. The empty-`<Capabilities>` default
(`Electricity|ServiceFluid`), the whitespace-separated `[Flags]` bodies, the load-bearing container
`Id`s, and the rule that passthrough does **not** cover MODELED elements all hold.

Rev 5171 ("Fuel line hoses can now be bent and deformed in the editor by clicking on the fuel line
connection and adding or removing nodes") looks like a plumbing change and is **not** part of this
contract: it added `[XmlElement("Node")] List<FuelLinkNodeData> Nodes` to `FuelLinkData`, whose
siblings are `[XmlAttribute("PartA")] uint PartALocalId` / `PartB` — i.e. it is **vehicle save
data**, describing a hose routed between two placed parts in a specific vehicle, not anything a
part template declares. flexo authors parts, not vehicles, so there is nothing to model.

## What changed in 5168

**Verdict: ✅ NONE.** Every anchor in this doc is byte-identical at 5168:
`ConsumerFeedWiring.cs`, `FeedsFromReference.cs`, `RocketCoreTemplate.cs`, and the
`ConnectorCapability*` family. `PartTemplate.cs`'s `ResolveConsumerFeedPoints` /
`ResolveConsumerFeeds` / `AddResolvedFeed` differ only by log line-numbers (the two added
`[XmlElement]` mass types above shifted the file by two lines). The empty-`<Capabilities>` default
of `Electricity|ServiceFluid`, the "passthrough does NOT cover MODELED elements" rule, load-bearing
container `Id`s, whitespace-separated `[Flags]` bodies, and the capability token set including
`DecouplerJoint` all stand unchanged.

---

## What changed in 5117

**Nothing that changes flexo — re-verified INTACT, with one semantic relaxation worth recording.**
`ConnectorCapability*.cs`, `FeedsFromReference.cs`, `ConsumerFeedWiring.cs` and
`RocketCoreTemplate.cs` are unchanged. `PartTemplate.ResolveConsumerFeeds` /
`AddResolvedFeed` now resolve `<FeedsFrom SubPart="…">` against the new
`PartInstance.RuntimeId` — `Id` when non-empty, else `Part.ResolveRuntimeId("", template)` (the
template `Id`), else `InstanceOf` — instead of the raw `PartInstance.Id`. That **widens** what
resolves: a `<SubPart>` placement authored without an `Id` is now addressable by its template id.
flexo always emits an explicit placement `Id` (and `idRemap.ts` rewrites it), so nothing changes;
the note matters only if flexo ever starts omitting placement ids.

Rev 5091 also added a `RocketCore.BindFeedPoints` warning for a feed point that resolves to
nothing — see [engines.md](engines.md#what-changed-in-5117) gap **Q4**.

## What changed in 5056

**Nothing in this area — re-verified INTACT.** `PartTemplate.ResolveConsumerFeedPoints` /
`ResolveConsumerFeeds` / `AddResolvedFeed` differ only in log line numbers.
`ConnectorCapabilityFlags`, `FeedsFromReference` and `ConsumerFeedWiring` are unchanged, and
`Part.Connector`'s new `ShouldSerializeCapabilities()` is write-side only. rev 5052 restored RCS
propellant crossing decouplers and rev 5053 gave service bays real tanks attached to connectors —
both authored with the existing `<Capabilities>` / `<FeedsFrom>` / `<ConsumerFeedWiring>` schema.

## What changed in 5018

Everything in this document is new (revs 4992 / 5002 / 5007). Nothing here existed at
`2026.7.8.4980`. The flexo-side work is recorded in
[plans/UPGRADE_PLAN_2026-07-24.md](../plans/UPGRADE_PLAN_2026-07-24.md); the gap register it
closes is F1–F5, F7, F8 and F11.
