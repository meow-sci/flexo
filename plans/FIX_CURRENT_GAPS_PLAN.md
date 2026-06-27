# Plan — Fix flexo gaps from KSA update 4680 → 4750

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review of KSA build
`2026.6.8.4680` → `2026.6.9.4750`. Each gap links to the scope doc that defines the contract.
**Why these matter:** flexo is a model-faithful re-emitter — it reads a fixed allow-list and
rebuilds a fresh XML document, so a changed unit token silently round-trips to `0` and an added
element silently vanishes. None of these throw; all are silent correctness/round-trip failures.

> Before starting, re-read [scope/part-and-subpart-xml.md](../scope/part-and-subpart-xml.md#-master-invariant--flexo-does-not-preserve-unknown-xml)
> (the no-passthrough invariant) and [scope/gamedata-modules.md](../scope/gamedata-modules.md).
> Follow the mandatory workflow in [AGENTS.md](../AGENTS.md) (fmt → lint → fmt:check → tests) and
> update the matching `scope/*.md` baseline status as each gap closes.

## Priority summary

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| 1 | Electrical unit refactor (`Joules`/`Watts` → `J`/`W`) | 🔴 BREAKING | `partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts` | [gamedata-modules](../scope/gamedata-modules.md) |
| 2 | DockingPort schema (attrs → child elements, impulse→energy) | 🔴 BREAKING | `partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts`, UI | [gamedata-modules](../scope/gamedata-modules.md) |
| 3 | `<Diameter>` part-size element dropped | 🟡 MISSING | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `partCatalog.ts` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |
| 4 | `<Control>` command marker dropped | 🟡 MISSING | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `partCatalog.ts` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |
| 5 | Editor-tag list stale + face-snap docs | 📝 DRIFT/docs | `types.ts`, `docs/ksa-part-connector-notes.md` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |
| 6 | Unknown-element passthrough (architectural) | 🧱 OPTIONAL | `partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |

Do **1 and 2 first** (data is wrong in-game today). 3–5 are round-trip fidelity. 6 is a
strategic hardening that would prevent the *next* update's "added element" from being a regression.

---

## Gap 1 — Electrical unit refactor (BREAKING)

**Game change.** `JoulesReference` → `EnergyReference` (energy) + `PowerReference` (power);
`BatteryJouleData` removed. Authored Core data now uses `<MaximumCapacity J="…"/>` and
`<Produced W="…"/>` / `<Consumed W="…"/>`. New token tables (× to SI):
- Energy (`EnergyReference.cs`): `J`×1, `KJ`×1e3, `MJ`×1e6, `GJ`×1e9, `TJ`×1e12, `Ws`×1, `Wh`×3600, `KWh`×3.6e6.
- Power (`PowerReference.cs`): `W`×1, `KW`×1e3, `MW`×1e6, `GW`×1e9, `TW`×1e12.

**Current flexo (wrong both ways).**
- `src/ksa/partXmlParser.ts` `readJoulesValue` (~L188) reads only `Joules` + `Watts` + `KWh×3.6e6` → returns `0` for new Core data → battery/generator/solar/consumer all import as 0.
- `src/ksa/partXmlSerializer.ts` emits `MaximumCapacity Joules=` (~L127), `Produced Watts=` (~L132, ~L226), `Consumed Watts=` (~L138) → the new `EnergyReference`/`PowerReference` ignore these attrs → 0 capacity/output in-game.
- The comment at `partXmlParser.ts` ~L186 ("the game does NOT recognize a bare `W` — only `Watts`") is now exactly backwards.

**Fix.**
1. Split `readJoulesValue` into two unit-aware readers (keep legacy tokens as fallback so old flexo projects + the OLD build still parse):
   - `readEnergyJoules(parent, childTag)` → sum of `J + Ws + Wh×3600 + KWh×3.6e6 + KJ×1e3 + MJ×1e6 + GJ×1e9 + TJ×1e12` **+ legacy `Joules`×1**.
   - `readPowerWatts(parent, childTag)` → `W + KW×1e3 + MW×1e6 + GW×1e9 + TW×1e12` **+ legacy `Watts`×1**.
   - Battery (`MaximumCapacity`) uses energy → `/3600` to Wh; Generator/Solar/Consumer (`Produced`/`Consumed`) use power.
2. Emit new tokens (match Core's authoring):
   - Battery: `<MaximumCapacity J="capacityWh*3600"/>`.
   - Generator/Solar/Consumer: `<Produced W="…"/>` / `<Consumed W="…"/>`.
3. Replace the inverted comment; update the `Battery`/`Generator`/`SolarPanel`/`PowerConsumer`
   doc-comments in `types.ts` (they say `Joules`/`Watts`).

**Tests.** Extend `src/ksa/partXmlParser.test.ts` + `partXmlSerializer.test.ts` with NEW-build
fixtures (`<MaximumCapacity J=…>`, `<Produced W=…>`) **and** a legacy fixture
(`<MaximumCapacity Joules=…>`) to prove the fallback. Round-trip a Core electrical part.

---

## Gap 2 — DockingPort schema (BREAKING)

**Game change.** `<DockingPort>` moved from attributes to child elements, with renamed fields and
**new physical quantities** (`DockingPortTemplate.cs`):
```xml
<!-- OLD --> <DockingPort ConnectorId="_c2" LatchingImpulse="6000" PushoffForce="7000"/>
<!-- NEW --> <DockingPort>
               <ConnectorId Value="_c2" />
               <LatchingKineticEnergy J="50" />   <!-- was LatchingImpulse (N·s); now energy (J), default 50 -->
               <PushoffImpulse Ns="7000" />       <!-- was PushoffForce (N);  now impulse (N·s), default 5000 -->
             </DockingPort>
```

**Current flexo (wrong both ways).**
- `types.ts` `DockingPort` = `{ connectorId, latchingImpulse, pushoffForce }`.
- `partXmlSerializer.ts` (~L160-166) emits the dead attribute form → `ConnectorId` unset (now a child) → KSA `IsValid()` false → **docking port silently dropped in-game**.
- `partXmlParser.ts` (~L289-299) reads `dp.getAttribute('ConnectorId')` + `readNum(dp,'LatchingImpulse'|'PushoffForce')` (with a `Force` fallback) → all null on a NEW file → `connectorId=''`, `0`/`0`.

**Fix.** The field rename ripples wider than parse/emit — these are all the touch-points:
1. `src/ksa/types.ts` (~L281-286): rename `DockingPort` fields to `latchingKineticEnergyJ` (default 50) + `pushoffImpulseNs` (default 5000); update the doc-comment.
2. `src/ksa/partXmlSerializer.ts` (~L160-166): emit child elements `<ConnectorId Value=…/>`, `<LatchingKineticEnergy J=…/>`, `<PushoffImpulse Ns=…/>`.
3. `src/ksa/partXmlParser.ts` (~L289-299): read the child elements (reuse the energy reader from Gap 1 for `<LatchingKineticEnergy>`; read `Ns` for `<PushoffImpulse>`), with a **legacy fallback** to the old attributes (`ConnectorId` attr; `LatchingImpulse`/`PushoffForce`/`Force` attrs) so old XML still loads. (The impulse→energy quantity change makes the legacy numeric fallback approximate — acceptable for old in-flexo projects.)
4. `src/state/editorStore.ts` (~L1943-1964): rename `DEFAULT_LATCHING_IMPULSE`/`DEFAULT_PUSHOFF_FORCE` (now 50 J / 5000 Ns) and the `setDockingPortLatchingImpulse`/`setDockingPortPushoffForce` actions/params.
5. `src/ui/GameDataSections.tsx` (~L597,606): rename the bound fields + relabel units (J / N·s).
6. `src/state/projectCodec.ts`: this persists `gameData` (incl. docking port) to localStorage — **renaming fields breaks existing saved projects**. Either (a) add a codec migration that maps old `latchingImpulse`/`pushoffForce` → the new fields, or (b) keep reading the old keys on decode. Don't skip this — silently dropping the values on every saved project is the failure mode.
7. Update the test fixtures that hardcode the old field names: `state/projectCodec.test.ts`, `state/editorStore.test.ts`.

**Tests.** `partXmlParser.test.ts` + `partXmlSerializer.test.ts`: NEW element-form fixture + a
legacy attribute-form fixture; round-trip `CoreCouplingA_Prefab_DockingPort1WA`'s GameData. Add a
`projectCodec.test.ts` case for the old→new field migration.

---

## Gap 3 — `<Diameter>` part-size element (MISSING-CAPABILITY)

**Game change.** `PartTemplate.cs` added `[XmlElement("Diameter")] DistanceReference? Diameter`.
Core now emits `<Diameter M="…"/>` as a child of `<PartGameData>` on nearly every part (command,
fuel tanks, structural, coupling, fairing, propulsion + the monolithic `PartGameData.xml`). It's
the VAB part-picker **size-class filter** (`DiameterFilterlist` editor tags). No physics effect.

**Current flexo.** No `Diameter` awareness → dropped on round-trip; flexo-authored parts won't
appear under a diameter-filtered catalog view.

**Fix.**
1. `types.ts`: add `diameterM: number | null` to `PartGameData` (+ `null` in `createEmptyGameData`).
2. `partCatalog.ts`: add `diameterM` to its `PartGameData` interface + carry it in `mergeGameData`.
3. `partXmlParser.ts` `parseGameDataElement`: read `<Diameter>` via the existing distance helper
   (the parser already reads `M`/`Cm` distances elsewhere). Core authors `M="0.5"` etc.
4. `partXmlSerializer.ts` `serializeGameData`: when `diameterM != null`, emit `<Diameter M=…/>`
   (plain `M`, matching Core — not flexo's Cm-under-1m style) after `<EditorTag>`.
5. (Optional) surface a "Part diameter (catalog size class)" numeric field in Part Data → Identity.

**Tests.** Round-trip a Core part that carries `<Diameter M=…>` and assert it survives.

---

## Gap 4 — `<Control>` command marker (MISSING-CAPABILITY)

**Game change.** New `Control`/`ControlTemplate` module (empty marker). Core adds a bare
`<Control/>` to the capsule's `<PartGameData>` (`CoreCommandAGameData.xml`); it marks a part as
command-capable (`Vehicle.IsControllable`). `ControlTemplate.cs` has no fields.

**Current flexo.** Dropped on round-trip → a re-exported command pod is no longer controllable.

**Fix.**
1. `types.ts`: add `controllable: boolean` to `PartGameData` (default `false`).
2. `partXmlParser.ts`: `game.controllable = directChildren(gd, 'Control').length > 0`.
3. `partXmlSerializer.ts`: emit a bare `<Control/>` when `controllable`.
4. `partCatalog.ts`: carry `controllable` through `mergeGameData`.
5. (Optional) a "Command / Controllable" toggle in Part Data.

**Tests.** Round-trip a `<Control/>`-bearing part; assert the element survives.

---

## Gap 5 — Editor-tag list + face-snapping docs (SCHEMA-DRIFT / docs)

**Game change.** Editor tags are now a data-driven registry: `CoreEditorTagsGameData.xml` defines
16 `<EditorTagDef>` rows (`EditorTagDefinition.cs`), with `NotaCategory` + face-snap booleans;
the built-in `EditorTag` statics (`NoFaceSnapping`/`Tanks`/`Coupling`/`Structural`) were removed
from the game and are now registered from data. Face-snapping (`VehicleEditor.cs`) reads those
booleans and snaps off the part's **+Z** bounding face.

**Current flexo.** `KNOWN_EDITOR_TAGS` (`types.ts` ~L159) is a hardcoded suggestion list with
obsolete `Tanks` (now `Fuel Tanks`) and missing `Landing`/`NoFaceSnapping`/`All`. No data-loss
(tags are freeform passthrough) — stale autocomplete only.

**Fix.**
1. Regenerate `KNOWN_EDITOR_TAGS` to the registry set/order: `Capsules, Engines, RCS, Fuel Tanks,
   Electrical, Coupling, Structural, Landing, Interstage, Passage, Cargo, Lights, Radial,
   NoFaceSnapping, All, Hidden`. Drop `Tanks`.
2. *(Better, optional)* parse `CoreEditorTagsGameData.xml` at catalog-load time (it's a new sibling
   under `/ksa/`) to drive suggestions live, and use `NotaCategory` to group "categories" vs
   "functional" tags in `EditorTagsField.tsx`.
3. Docs: update `docs/ksa-part-connector-notes.md` to note that face-snapping is now data-driven
   via `EditorTagDefinition` (FaceSnap[Target]Blacklist/Whitelist, DiameterFilterlist) and that
   `NoFaceSnapping`/`Coupling`/`Structural`/`Tanks` are no longer hardcoded game-side; the
   connector "+X facing" arrow is cosmetic (the game snaps off the part's +Z face). The
   `<Connector>/<Flags>` schema itself is unchanged → export remains correct.

---

## Gap 6 — Unknown-element passthrough (OPTIONAL, architectural)

**Problem.** flexo's "read allow-list → rebuild fresh DOM" design means **every** future game
element is a silent round-trip loss until explicitly modeled (today: `<Collider>`, and pre-fix
`<Diameter>`/`<Control>`). Gaps 3–4 are the symptom; this is the cure.

**Fix (stretch).** Capture unmodeled children/attributes on `PartGameData` / `SubPartGameData`
(store cloned `Element`s keyed by parent) in `parseGameDataElement`, and re-append them in
`serializeGameData`. This degrades future additions to harmless pass-through. Decide on ordering/
dedupe semantics so re-emitted unknowns don't collide with modeled ones. Larger change; sequence
after 1–5.

---

## Verified SAFE — do not touch (regression-protect, don't "fix")

The scope review confirmed these are **unchanged** in 4750; changing them would be wrong:
- **Engines** ([engines.md](../scope/engines.md)): `enginePhysics.ts` math/constants/schema are byte-identical to the game; the new thrust-from-template helper corroborates the port. Only the (separate) `<Diameter>` applies.
- **Animation** ([animation.md](../scope/animation.md)): `KeyframeAnimationData.cs` byte-identical; ServiceModule B/C/D are new content the importer already handles. (Pre-existing latent gap: CubicSpline accessor decode — out of scope here.)
- **Kittens** ([kittens.md](../scope/kittens.md)): `CharacterAssets.xml` md5-identical; the eye/glass shader merge confirms the cornea-hide + visor-tint assumptions. Optional doc-comment nit only.
- **Custom assets / mod export** ([custom-assets-and-mod-export.md](../scope/custom-assets-and-mod-export.md)): all schema classes byte-identical; thumbnail null-deref still present (keep synthetic Normal/ORM); mod loader + `mod.toml` unchanged; glow math unchanged. Watch-item: keep an eye on `ENABLE_EMISSIVE` gating, but no action now.
- **Coordinates / IVA-NotIVA / ground clutter**: `QuaternionEx`/`Double3Ex` unchanged (`EULER_ORDER='ZYX'` holds); `PartModel` IVA gate + schema unchanged; the 7 clutter schema classes unchanged.
- **Tank / CustomMass / Inertia / Decoupler**: schema byte-identical (diffs are logging/runtime).

## Suggested sequencing
1. Gap 1 (electrical) + Gap 2 (docking port) together — same two files, both BREAKING, shared
   unit-reader work. Land with new + legacy fixtures.
2. Gap 3 (`<Diameter>`) + Gap 4 (`<Control>`) together — both add a `PartGameData` field + a
   parse/emit pair + a `mergeGameData` carry.
3. Gap 5 (tag list + docs) — small, independent.
4. Gap 6 (passthrough) — optional hardening; do last.

After each: `pnpm test` (the `src/ksa/*.test.ts` encode the contract), `pnpm fmt` / `pnpm lint` /
`pnpm fmt:check`, and update the relevant `scope/*.md` baseline status from 🔴/🟡 to ✅.
