# Scope — Part / SubPart XML structure, catalog, editor tags

> Integration surface for how flexo **reads** the game's `<Part>`/`<SubPart>` catalog and
> **emits** KSA-compliant `<Part>` + `<PartGameData>` XML. This is the backbone every
> other feature hangs off. Read alongside [docs/xml-io.md](../docs/xml-io.md) and
> [docs/subpart-catalog.md](../docs/subpart-catalog.md) (the flexo-internal view).

**Baseline:** verified against KSA build **2026.6.9.4750**.
**Baseline status:** ✅ **CURRENT** — `<Diameter>` part-size + `<Control>` command marker modeled;
`KNOWN_EDITOR_TAGS` refreshed from the registry (with `NotaCategory` grouping); and unmodeled
`<PartGameData>`/`<SubPartGameData>` child elements + root attrs now round-trip via gap-6
passthrough (`<Collider>` et al. no longer dropped). See
[plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

---

## Flexo modules

| Path                           | Role                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/types.ts`             | Domain model — `SubPartPlacement`, `Connector`/`ConnectorFlag`, `Transform`/`EulerXYZ`, `PartGameData`/`SubPartGameData`, `EditingPart`, and the hardcoded `KNOWN_EDITOR_TAGS` suggestion list. |
| `src/ksa/partXmlParser.ts`     | Reads a `<Part>` (placements + connectors) and `<PartGameData>` (`parseGameDataElement`) back into the typed model. Inverse of the serializer.                                                  |
| `src/ksa/partXmlSerializer.ts` | Emits `<Part>` (`serializePart`) + `<PartGameData>` (`serializeGameData`) from `EditingPart` by building a **fresh** DOM.                                                                       |
| `src/ksa/catalog.ts`           | SubPart-template catalog loader: hardcoded `ASSET_FILES`; parses `<SubPart><PartModel>`/`<PartModelDynamic>` + `<MeshAtlas>`/`<PbrMaterial>`.                                                   |
| `src/ksa/partCatalog.ts`       | Whole-`<Part>` catalog loader + `*GameData.xml` sibling merge (`GAMEDATA_FILES`, `mergeGameData`); unions editor tags + connector flags + module data per Part.                                 |
| `src/state/partImport.ts`      | `importBuiltInPart`: drops a catalog Part (placements/connectors/editorTags/gameData/animations) into the editor.                                                                               |
| `src/ui/EditorTagsField.tsx`   | Editor-tag combobox; suggests `KNOWN_EDITOR_TAGS`, allows freeform.                                                                                                                             |
| `src/ui/PartBrowser.tsx`       | "Add Part" browser; searches catalog by `id` + `editorTags`.                                                                                                                                    |
| `src/ui/PartDataButton.tsx`    | Part Data dialog host (Identity → Part Id + `EditorTagsField`).                                                                                                                                 |

## Game-side anchors (NEW snapshot: `ksa-game-assemblies/current/`)

| Concept                                | decomp C#                                                                           | Asset XML (element / attrs)                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Part / SubPart template                | `decomp/KSA/PartTemplate.cs`, `decomp/KSA/PartTree.cs`, `decomp/KSA/Part.cs`        | `Core*Assets.xml`: `<Part Id>`, `<SubPart Id InstanceOf>`, `<Transform><Position/Rotation/Scale X Y Z>`, `<Connector Id>`                                                          |
| Part GameData                          | `decomp/KSA/PartTemplate.cs` (`LoadFromGameData`/`ApplyGameData`)                   | `Core*GameData.xml` + monolithic `PartGameData.xml`: `<PartGameData Id DisplayName>`, `<EditorTag Value>`, `<CustomMass>`, `<Connector Id><Flags>`, …                              |
| **Part size (NEW 4750, modeled)**      | `decomp/KSA/PartTemplate.cs` `[XmlElement("Diameter")] DistanceReference? Diameter` | `<Diameter M="…"/>` — child of `<PartGameData>` (size-class filter in VAB). flexo: `PartGameData.diameterM`.                                                                       |
| **Control marker (NEW 4750, modeled)** | `decomp/KSA/PartTemplate.cs` `[XmlElement("Control")] ControlTemplate? Control`     | `<Control/>` — bare child of `<PartGameData>` (command-capable). flexo: `PartGameData.controllable`.                                                                               |
| Per-part editor tag                    | `decomp/KSA/EditorTag.cs` (record struct, hash-matched)                             | `<EditorTag Value="…">`                                                                                                                                                            |
| **Editor-tag registry (NEW 4750)**     | `decomp/KSA/EditorTagDefinition.cs`                                                 | `Content/Core/CoreEditorTagsGameData.xml`: `<EditorTagDef Id FaceSnapBlacklist RootPartWhitelist FaceSnapTargetWhitelist FaceSnapTargetBlacklist DiameterFilterlist NotaCategory>` |

## The contract — what flexo bakes in (breaks if the game changes it)

**Document shape**

- Root element `<Assets>`. Geometry `<Part Id>` and metadata `<PartGameData Id>` are matched by **exact `Id`**.
- A `<SubPart>` is a **placement** iff it has `InstanceOf`; one without is skipped. A `<SubPart>` is a **template** iff it has `<PartModel>`/`<PartModelDynamic>`.
- Placement: `<SubPart Id InstanceOf>` + `<Transform>` with `<Position>/<Rotation>/<Scale>` each carrying `X`/`Y`/`Z`. Defaults position 0, rotation 0, scale 1; element/axis omitted at default within `EPSILON = 1e-9`.
- Rotation is **Euler XYZ radians** (KSA "XYZ" ⇒ three.js `'ZYX'` — see [connectors-coordinates-iva.md](connectors-coordinates-iva.md)).
- `<Connector Id>` carries `<Transform>` + a comma-space `<Flags>` body; connector faces local **+X**. Flag enum is exactly `Internal | ToSurface | FromSurface`; unknown flags dropped.
- `<PartGameData>` children flexo reads: `DisplayName` attr; `<EditorTag Value>`; `<Diameter M>`; `<CustomMass><Mass Kg>`; `<Control/>`; `<Connector Id><Flags>`; `<Decoupler>`; `<DockingPort>`; `<EVADoor>`; power modules; engine modules; `<KeyframeAnimationModule>`. (See [gamedata-modules.md](gamedata-modules.md) for module detail.)

**Catalog / file-path conventions**

- `ASSET_FILES` is a hardcoded list (`catalog.ts`). Any **renamed/removed** Core asset file silently drops its SubParts/Parts.
- `GAMEDATA_FILES` = `ASSET_FILES` with `Assets.xml`→`GameData.xml`; **`PartAssets.xml`→`PartGameData.xml`**, so flexo does read the monolithic `PartGameData.xml`. A missing/renamed GameData sibling silently loses all of that file's tags/flags/modules.
- SubPart mesh: `<PartModel><Mesh Id="X">` where **X is a glTF node name** inside the file's default `<MeshAtlas Path>` (or a named `<MeshAtlas Id>`). `<Material Id>` → `<PbrMaterial Id>`. `<Internal>true</Internal>` ⇒ IVA prop.

**Editor tags**

- `KNOWN_EDITOR_TAGS` (`types.ts`) is a hardcoded suggestion list; freeform tags allowed. Per-part tags serialize as `<EditorTag Value="…">`. flexo treats tags as a **flat freeform string list** (any string round-trips). As of 4750 the list is generated from a typed `EDITOR_TAG_DEFS` snapshot of the registry — including each tag's `NotaCategory` flag, which `EditorTagsField.tsx` uses to group autocomplete into **Categories** vs **Functional**.
- The game's canonical registry lives in `CoreEditorTagsGameData.xml` (16 `<EditorTagDef>` rows). Order there = order of category buttons. Modders can add `<EditorTagDef>` in their own XML — flexo's snapshot is static (no live parse), so modder tags aren't auto-suggested (still typeable). See [docs/ksa-part-connector-notes.md](../docs/ksa-part-connector-notes.md) for the face-snap model.

**Numbers** — `formatG6` (.NET `G6`) for all emitted numbers.

### ⭐ Master invariant — flexo rebuilds a fresh DOM (now WITH GameData passthrough)

The parser reads a **fixed allow-list** into typed objects; the serializer **rebuilds a brand-new `<Assets>` document** and appends only what it knows how to emit. flexo is a _model-faithful re-emitter_, not a _byte-faithful editor_.

**As of 2026-06-27 (gap 6), `<PartGameData>` and `<SubPartGameData>` ARE passthrough-safe:** their unmodeled direct **child elements** and unmodeled **root attributes** are captured verbatim on import (`captureUnknownChildren`/`captureUnknownAttrs` → `RawXmlNode` JSON trees on `unknownChildren`/`unknownAttrs`) and re-emitted on export (`buildRawNode`, appended last). This recovers `<Collider>`, the `SolidSphereMass`… mass family, `<IVASeat>`, `<SubstanceStorageVolume>`, and a SubPart's `DisplayName` — all previously dropped.

Consequences / what's STILL drop-on-round-trip (passthrough is scoped to GameData containers):

- The geometry `<Part>` (placements/connectors), `<SubPart>` **templates** (mesh/material/atlas), and **top-level** `<Assets>` children other than `<PartGameData>`/`<SubPartGameData>`/`<CombustionProcess>` are NOT passthrough — a new unmodeled element there still vanishes.
- Within `<PartGameData>`, a `<SubPart>` child is "modeled" (gimbal overlay), so a `<SubPart>` carrying only non-gimbal unmodeled data isn't preserved. Mixed text+element content isn't preserved (game-data XML has none).
- So each game update must still re-check this scope for added schema **outside** the GameData child/attr surface; inside it, additions now round-trip harmlessly until explicitly modeled.

## Known gotchas

- Connector `<Flags>` live on `<PartGameData>`, **not** on the geometry `<Part>` — without the GameData merge, `ToSurface`/etc. are lost.
- A `<Part>` with no matching `<PartGameData>` has no tags/modules → invisible in the part picker.
- `DockingPort` parses only the current child-element form (`<ConnectorId Value>`, `<LatchingKineticEnergy J>`, `<PushoffImpulse Ns>`) — no legacy fallback; see [gamedata-modules.md](gamedata-modules.md).

## What changed in 4750 (summary; detail in the fix plan)

- **NEW `<Diameter M>`** on most `<PartGameData>` (command, fuel tanks, structural, coupling, fairing, propulsion, + monolithic `PartGameData.xml`) — ✅ **now modeled** as `PartGameData.diameterM` (read via `readDistanceM`, emitted as plain `<Diameter M>`). _FIXED 2026-06-27._
- **NEW `<Control/>`** marker on command pods — ✅ **now modeled** as `PartGameData.controllable` (bare `<Control/>` round-trips). _FIXED 2026-06-27._
- **Editor-tag registry** (`CoreEditorTagsGameData.xml`) supersedes `KNOWN_EDITOR_TAGS` — ✅ **refreshed**: `KNOWN_EDITOR_TAGS` now derives from a typed `EDITOR_TAG_DEFS` snapshot (16 rows, registry order, `NotaCategory` flags); obsolete `Tanks` dropped, `Fuel Tanks`/`Landing`/`NoFaceSnapping`/`All` added; `EditorTagsField` groups Categories vs Functional. _FIXED 2026-06-27._
- **Unmodeled GameData elements dropped on round-trip** (e.g. `<Collider>`) — ✅ **fixed** by gap-6 passthrough (see the master-invariant section). _FIXED 2026-06-27._
- `Part.cs`/`PartTree.cs`/`EnumCollections.cs` otherwise = bugfix + logging-codegen noise; no Part/SubPart structural change.
