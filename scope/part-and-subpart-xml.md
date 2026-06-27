# Scope — Part / SubPart XML structure, catalog, editor tags

> Integration surface for how flexo **reads** the game's `<Part>`/`<SubPart>` catalog and
> **emits** KSA-compliant `<Part>` + `<PartGameData>` XML. This is the backbone every
> other feature hangs off. Read alongside [docs/xml-io.md](../docs/xml-io.md) and
> [docs/subpart-catalog.md](../docs/subpart-catalog.md) (the flexo-internal view).

**Baseline:** verified against KSA build **2026.6.9.4750**.
**Baseline status:** ⚠️ **GAPS** — new `<Diameter>` part-size element is dropped; `KNOWN_EDITOR_TAGS`
is stale; new `<Control>` marker is dropped. See [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

---

## Flexo modules

| Path | Role |
|---|---|
| `src/ksa/types.ts` | Domain model — `SubPartPlacement`, `Connector`/`ConnectorFlag`, `Transform`/`EulerXYZ`, `PartGameData`/`SubPartGameData`, `EditingPart`, and the hardcoded `KNOWN_EDITOR_TAGS` suggestion list. |
| `src/ksa/partXmlParser.ts` | Reads a `<Part>` (placements + connectors) and `<PartGameData>` (`parseGameDataElement`) back into the typed model. Inverse of the serializer. |
| `src/ksa/partXmlSerializer.ts` | Emits `<Part>` (`serializePart`) + `<PartGameData>` (`serializeGameData`) from `EditingPart` by building a **fresh** DOM. |
| `src/ksa/catalog.ts` | SubPart-template catalog loader: hardcoded `ASSET_FILES`; parses `<SubPart><PartModel>`/`<PartModelDynamic>` + `<MeshAtlas>`/`<PbrMaterial>`. |
| `src/ksa/partCatalog.ts` | Whole-`<Part>` catalog loader + `*GameData.xml` sibling merge (`GAMEDATA_FILES`, `mergeGameData`); unions editor tags + connector flags + module data per Part. |
| `src/state/partImport.ts` | `importBuiltInPart`: drops a catalog Part (placements/connectors/editorTags/gameData/animations) into the editor. |
| `src/ui/EditorTagsField.tsx` | Editor-tag combobox; suggests `KNOWN_EDITOR_TAGS`, allows freeform. |
| `src/ui/PartBrowser.tsx` | "Add Part" browser; searches catalog by `id` + `editorTags`. |
| `src/ui/PartDataButton.tsx` | Part Data dialog host (Identity → Part Id + `EditorTagsField`). |

## Game-side anchors (NEW snapshot: `ksa-game-assemblies/current/`)

| Concept | decomp C# | Asset XML (element / attrs) |
|---|---|---|
| Part / SubPart template | `decomp/KSA/PartTemplate.cs`, `decomp/KSA/PartTree.cs`, `decomp/KSA/Part.cs` | `Core*Assets.xml`: `<Part Id>`, `<SubPart Id InstanceOf>`, `<Transform><Position/Rotation/Scale X Y Z>`, `<Connector Id>` |
| Part GameData | `decomp/KSA/PartTemplate.cs` (`LoadFromGameData`/`ApplyGameData`) | `Core*GameData.xml` + monolithic `PartGameData.xml`: `<PartGameData Id DisplayName>`, `<EditorTag Value>`, `<CustomMass>`, `<Connector Id><Flags>`, … |
| **Part size (NEW 4750)** | `decomp/KSA/PartTemplate.cs` `[XmlElement("Diameter")] DistanceReference? Diameter` | `<Diameter M="…"/>` — child of `<PartGameData>` (size-class filter in VAB) |
| **Control marker (NEW 4750)** | `decomp/KSA/PartTemplate.cs` `[XmlElement("Control")] ControlTemplate? Control` | `<Control/>` — bare child of `<PartGameData>` (command-capable) |
| Per-part editor tag | `decomp/KSA/EditorTag.cs` (record struct, hash-matched) | `<EditorTag Value="…">` |
| **Editor-tag registry (NEW 4750)** | `decomp/KSA/EditorTagDefinition.cs` | `Content/Core/CoreEditorTagsGameData.xml`: `<EditorTagDef Id FaceSnapBlacklist RootPartWhitelist FaceSnapTargetWhitelist FaceSnapTargetBlacklist DiameterFilterlist NotaCategory>` |

## The contract — what flexo bakes in (breaks if the game changes it)

**Document shape**
- Root element `<Assets>`. Geometry `<Part Id>` and metadata `<PartGameData Id>` are matched by **exact `Id`**.
- A `<SubPart>` is a **placement** iff it has `InstanceOf`; one without is skipped. A `<SubPart>` is a **template** iff it has `<PartModel>`/`<PartModelDynamic>`.
- Placement: `<SubPart Id InstanceOf>` + `<Transform>` with `<Position>/<Rotation>/<Scale>` each carrying `X`/`Y`/`Z`. Defaults position 0, rotation 0, scale 1; element/axis omitted at default within `EPSILON = 1e-9`.
- Rotation is **Euler XYZ radians** (KSA "XYZ" ⇒ three.js `'ZYX'` — see [connectors-coordinates-iva.md](connectors-coordinates-iva.md)).
- `<Connector Id>` carries `<Transform>` + a comma-space `<Flags>` body; connector faces local **+X**. Flag enum is exactly `Internal | ToSurface | FromSurface`; unknown flags dropped.
- `<PartGameData>` children flexo reads: `DisplayName` attr; `<EditorTag Value>`; `<CustomMass><Mass Kg>`; `<Connector Id><Flags>`; `<Decoupler>`; `<DockingPort>`; `<EVADoor>`; power modules; engine modules; `<KeyframeAnimationModule>`. (See [gamedata-modules.md](gamedata-modules.md) for module detail.)

**Catalog / file-path conventions**
- `ASSET_FILES` is a hardcoded list (`catalog.ts`). Any **renamed/removed** Core asset file silently drops its SubParts/Parts.
- `GAMEDATA_FILES` = `ASSET_FILES` with `Assets.xml`→`GameData.xml`; **`PartAssets.xml`→`PartGameData.xml`**, so flexo does read the monolithic `PartGameData.xml`. A missing/renamed GameData sibling silently loses all of that file's tags/flags/modules.
- SubPart mesh: `<PartModel><Mesh Id="X">` where **X is a glTF node name** inside the file's default `<MeshAtlas Path>` (or a named `<MeshAtlas Id>`). `<Material Id>` → `<PbrMaterial Id>`. `<Internal>true</Internal>` ⇒ IVA prop.

**Editor tags**
- `KNOWN_EDITOR_TAGS` (`types.ts`) is a hardcoded suggestion list; freeform tags allowed. Per-part tags serialize as `<EditorTag Value="…">`. Flexo treats tags as a **flat freeform string list** — no category-vs-functional distinction, no `NotaCategory` awareness, no registry.
- The game's canonical registry now lives in `CoreEditorTagsGameData.xml` (16 `<EditorTagDef>` rows). Order there = order of category buttons. Modders can add `<EditorTagDef>` in their own XML.

**Numbers** — `formatG6` (.NET `G6`) for all emitted numbers.

### ⭐ Master invariant — flexo does **not** preserve unknown XML
The parser reads only a **fixed allow-list** of elements/attributes into typed objects; the serializer **rebuilds a brand-new `<Assets>` document** and appends only what it knows how to emit. **There is no raw-XML passthrough.** Therefore **every unmodeled element/attribute is silently dropped on import → export.** Flexo is a *model-faithful re-emitter*, not a *byte-faithful editor*.

Consequences:
- Every schema element the game adds is a **data-loss event** the next time a user imports a Core part and re-exports — until flexo explicitly models it in **both** parser and serializer.
- Already true today for `<Collider>` (present in `CoreFuelTankAGameData.xml`, silently discarded).
- This is why each game update must re-check this scope: a new `<Foo>` won't crash flexo, it'll just quietly disappear.

## Known gotchas
- Connector `<Flags>` live on `<PartGameData>`, **not** on the geometry `<Part>` — without the GameData merge, `ToSurface`/etc. are lost.
- A `<Part>` with no matching `<PartGameData>` has no tags/modules → invisible in the part picker.
- `DockingPort` has a legacy single-`Force` fallback in the parser (now actively misleading — see [gamedata-modules.md](gamedata-modules.md)).

## What changed in 4750 (summary; detail in the fix plan)
- **NEW `<Diameter M>`** on most `<PartGameData>` (command, fuel tanks, structural, coupling, fairing, propulsion, + monolithic `PartGameData.xml`) — flexo drops it. *MISSING-CAPABILITY.*
- **NEW `<Control/>`** marker on command pods — flexo drops it. *MISSING-CAPABILITY.*
- **Editor-tag registry** (`CoreEditorTagsGameData.xml`) supersedes `KNOWN_EDITOR_TAGS`. Flexo's list has obsolete `Tanks` (now `Fuel Tanks`) and lacks `Landing`/`NoFaceSnapping`/`All`. `Interstage` is now `NotaCategory`. No data-loss (tags are freeform), stale suggestions only. *SCHEMA-DRIFT (cosmetic).*
- `Part.cs`/`PartTree.cs`/`EnumCollections.cs` otherwise = bugfix + logging-codegen noise; no Part/SubPart structural change.
