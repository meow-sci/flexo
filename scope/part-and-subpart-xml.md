# Scope — Part / SubPart XML structure, catalog, editor tags

> Integration surface for how flexo **reads** the game's `<Part>`/`<SubPart>` catalog and
> **emits** KSA-compliant `<Part>` + `<PartGameData>` XML. This is the backbone every
> other feature hangs off. Read alongside [docs/xml-io.md](../docs/xml-io.md) and
> [docs/subpart-catalog.md](../docs/subpart-catalog.md) (the flexo-internal view).

**Baseline:** KSA build **2026.8.22.5348** — the document structure is unmoved, but `PartTemplate`
swapped `<Decoupler>` (now a `Components` module, same wire form) for `<PrimarySequenceModule>`
(gap **T3**) and `PartModelModule` gained `<Terrain>` (gap **T2**) — see
[What changed in 5348](#what-changed-in-5348). At 5261 it gained `<Grab>` (gap **S2**, see
[What changed in 5261](#what-changed-in-5261)).
Previously KSA build **2026.8.5.5168** — re-verified ✅ intact by the `5117 → 5168` review.
`PartTemplate`/`SubPartTemplate`/`EditorTagDefinition` are byte-identical apart from two **added**
`[XmlElement]`s on the `InertMasses` polymorphic list (`SolidOgiveMass` / `HollowOpenOgiveMass`,
rev 5166), which flexo already carries through the GameData passthrough. The structure itself has
not moved since the `5018 → 5056` review, which is why the sections below are written against
5056; 5117 and 5168 each only re-synced the vendored fixtures. See
[What changed in 5168](#what-changed-in-5168).
**Baseline status:** ✅ **CURRENT** — `<Diameter>` part-size + `<Control>` command marker modeled
(and as of 4826 `<Diameter>` is **repeatable** — the extras round-trip via `extraDiametersM`, see
[What changed in 4826](#what-changed-in-4826)); `KNOWN_EDITOR_TAGS` refreshed from the registry
(4939 added `Booster`); and unmodeled `<PartGameData>`/`<SubPartGameData>` child elements +
root attrs round-trip via gap-6 passthrough (`<Aligned>`, `<SymmetryGroup>`,
`<AttachedInternal>` et al.). The 4939 geometry-template `<Collider>` gap is **CLOSED**:
`<Collider>` is now MODELED at all four authoring sites and no longer rides the passthrough —
see [colliders.md](colliders.md). `<IVASeat>` has likewise moved out of the passthrough and is
**MODELED at the two Part-level sites** (geometry `<Part>` + `<PartGameData>`), normalised into
`<PartGameData>` on export; the SubPart-level pair stays on the passthrough — see
[connectors-coordinates-iva.md](connectors-coordinates-iva.md).

---

## Flexo modules

| Path                           | Role                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/types.ts`             | Domain model — `SubPartPlacement`, `Connector`/`ConnectorFlag`, `Transform`/`EulerXYZ`, `PartGameData`/`SubPartGameData`, `EditingPart`, and the hardcoded `KNOWN_EDITOR_TAGS` suggestion list.       |
| `src/ksa/partXmlParser.ts`     | Reads a `<Part>` (placements + connectors) and `<PartGameData>` (`parseGameDataElement`) back into the typed model. Inverse of the serializer.                                                        |
| `src/ksa/partXmlSerializer.ts` | Emits `<Part>` (`serializePartsXml`) + `<PartGameData>` (`serializeGameDataXml`) from `EditingPart` by building a **fresh** DOM. Both take **N parts** — see [Multi-part export](#multi-part-export). |
| `src/ksa/catalog.ts`           | SubPart-template catalog loader: hardcoded `ASSET_FILES`; parses `<SubPart><PartModel>`/`<PartModelDynamic>` + `<MeshAtlas>`/`<PbrMaterial>`.                                                         |
| `src/ksa/partCatalog.ts`       | Whole-`<Part>` catalog loader + `*GameData.xml` sibling merge (`GAMEDATA_FILES`, `mergeGameData`); unions editor tags + connector flags + module data per Part.                                       |
| `src/state/partImport.ts`      | `importBuiltInPart`: drops a catalog Part (placements/connectors/editorTags/gameData/animations) into the editor.                                                                                     |
| `src/ui/EditorTagsField.tsx`   | Editor-tag combobox; suggests `KNOWN_EDITOR_TAGS`, allows freeform.                                                                                                                                   |
| `src/ui/PartBrowser.tsx`       | "Add Part" browser; searches catalog by `id` + `editorTags`.                                                                                                                                          |
| `src/ui/PartDataDialog.tsx`    | Part Data dialog host (Identity → Part Id + `EditorTagsField`).                                                                                                                                       |

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
- Placement: `<SubPart Id InstanceOf>` + `<Transform>` with `<Position>/<Rotation>/<Scale>` each carrying `X`/`Y`/`Z`. Defaults position 0, rotation 0, scale 1; an element is omitted when every axis prints as its default under G6 (not just within `EPSILON = 1e-9` — the decision follows the formatted value).
- **`Vector3Reference` defaults a MISSING attribute to 0 for all of Position/Rotation/Scale** (`X = Y = Z = 0.0` field initialisers; `XmlSerializer` leaves absent attributes there). `TransformReference.ScaleValue` substitutes `double3.One` only when the whole `<Scale>` element is absent. So `<Position>`/`<Rotation>` may omit a zero axis losslessly, but **`<Scale>` must always carry X, Y, Z** — `<Scale X="2"/>` loads as (2, 0, 0), `CreateScale` goes singular and the SubPart/Connector renders blank. flexo's `buildScaleElement` emits all three axes (fixed 2026-08-23; earlier exports with non-uniform scale must be re-exported); the importer keeps the lenient 1 for a missing axis but logs a warning. All 465 `<Scale>` in shipped Content carry X, Y and Z.
- Rotation is **Euler XYZ radians** (KSA "XYZ" ⇒ three.js `'ZYX'` — see [connectors-coordinates-iva.md](connectors-coordinates-iva.md)).
- `<Connector Id>` carries `<Transform>` + a comma-space `<Flags>` body; connector faces local **+X**. Flag enum is exactly `Internal | ToSurface | FromSurface`; unknown flags dropped.
- `<PartGameData>` children flexo reads: `DisplayName` attr; `<EditorTag Value>`; `<Diameter M>`; `<CustomMass><Mass Kg>` (other CustomMass children — inertia/offsets — preserved verbatim as `customMassExtras`); `<Control/>`; `<Connector Id><Flags>`; `<Decoupler>`; `<DockingPort>`; `<EVADoor>`; power modules; engine modules; `<KeyframeAnimationModule>`. (See [gamedata-modules.md](gamedata-modules.md) for module detail.)

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

**As of 2026-06-27 (gap 6), `<PartGameData>` and `<SubPartGameData>` ARE passthrough-safe:** their unmodeled direct **child elements** and unmodeled **root attributes** are captured verbatim on import (`captureUnknownChildren`/`captureUnknownAttrs` → `RawXmlNode` JSON trees on `unknownChildren`/`unknownAttrs`) and re-emitted on export (`buildRawNode`, appended last). This recovers the `SolidSphereMass`… mass family, `<AttachedInternal>`, `<SubstanceStorageVolume>`, and a SubPart's `DisplayName` — all previously dropped. (`<Collider>` was recovered this way too until it became MODELED — see [colliders.md](colliders.md); so was `<IVASeat>`, now MODELED at PART level and still passthrough at SubPart level — see [connectors-coordinates-iva.md](connectors-coordinates-iva.md).)

Consequences / what's STILL drop-on-round-trip (passthrough is scoped to GameData containers):

- The geometry `<Part>` (placements/connectors), `<SubPart>` **templates** (mesh/material/atlas), and **top-level** `<Assets>` children other than `<PartGameData>`/`<SubPartGameData>`/`<FixedReaction>` are NOT passthrough — a new unmodeled element there still vanishes.
- Within `<PartGameData>`, a `<SubPart>` child is "modeled" (gimbal overlay), so a `<SubPart>` carrying only non-gimbal unmodeled data isn't preserved. Mixed text+element content isn't preserved (game-data XML has none).
- So each game update must still re-check this scope for added schema **outside** the GameData child/attr surface; inside it, additions now round-trip harmlessly until explicitly modeled.

## Multi-part export

One flexo project holds **N parts** and exports all of them into the same three files
(`plans/MULTI_PART_PLAN.md` Phase 3). `<Base>Part.xml` carries N `<Part>` siblings;
`<Base>GameData.xml` carries N `<PartGameData>` plus each part's `<SubPartGameData>` blocks
plus the deduped `<FixedReaction>`s; `<Base>Assets.xml` carries each part's `<MeshAtlas>` /
`<PbrMaterial>` / `<SubPart>` entries (see
[custom-assets-and-mod-export.md](custom-assets-and-mod-export.md)). `<Base>` is
`sanitizeBaseName(projectName)`.

**Legality — an Assets file is a flat polymorphic list.** `decomp/KSA/AssetBundle.cs` declares
`[XmlRoot("Assets")]` over a single `public List<SerializedId> Assets`, with `[XmlElement(…)]`
entries for `Part`, `SubPart`, `PartGameData`, `SubPartGameData`, `MeshAtlas`, `PbrMaterial`,
`FixedReaction`, … — so **multiple siblings of every element kind in one file are first-class**,
in any order. Core itself ships multi-`<Part>` files and the monolithic `PartGameData.xml`, and
flexo's own catalog parser already iterates them (`src/ksa/partCatalog.ts`).

**Emitters.** `serializePartsXml(entries)` and `serializeGameDataXml(entries, base)`
(`partXmlSerializer.ts`) each take an `Array<{ part, remap }>` and build ONE `<Assets>` document
in entry order. `buildMultiModContent` (`src/ksa/modExport.ts`) is the single call site both the
export buttons and the Inspect XML preview go through.

**Export-variant ids carry a per-part namespace token.** A built-in SubPart export variant (the
redeclaration described in
[custom-assets-and-mod-export.md](custom-assets-and-mod-export.md) contract #19) is now
`flexo_<base>_<ns>_<templateId>`, where `ns = partExportNs(part.partId)` =
`sanitizeBaseName(partId)`. The `ns` segment exists because **KSA registers
`<SubPartGameData Id="T">` ONCE GLOBALLY per template id** — `PartGameDataReference.OnDataLoad`
(which `SubPartGameDataReference` inherits verbatim) tries `ModLibrary.Register(this)` and, on
the duplicate, MERGES itself into the already-registered one via `ApplyGameData`; the `Part`
ctor's `ModuleList.CreateModules` (`decomp/KSA/Part.cs:1220`) then instantiates every module
the merged template holds at EVERY placement of `T` (the rationale comment lives at
`src/state/editorStore.ts:834-852`, key sentence at `:839-840`; it is the same fact behind the
multi-light-import fix). Without the token, two parts placing the same built-in template would
mint the SAME variant id and part A's `<Light>`/tank/`<Collider>` would attach to part B's
SubPart too. A duplicate `ns` among included parts is an export **blocker**
(`collectProjectExportIssues`), and `buildMultiModContent` throws if one reaches it anyway.

**`<FixedReaction>` is deduped first-wins, and its position in the document is irrelevant.**
`serializeGameDataXml` hoists every part's custom propellants to the **END** of the file and
emits each `Id` **once** across all parts (first entry wins). Position does not matter because
reaction references resolve AFTER all mod data has loaded: `CombustorTemplate.Create(Part)`
calls `SubstanceLibrary.GetReactionOrThrow(Reaction.Hash, Reaction.Id)`
(`decomp/KSA/CombustorTemplate.cs:65-67`), and `SubstanceLibrary.LoadAll()` runs in the
`Loading.Task("Substances")` block (`decomp/KSA/Program.cs:956-960`) — so a
`<Combustor><Reaction Id>` may legally precede the `<FixedReaction>` it names. Registration is
itself first-wins (`SerializedCollection.Register` → `ConcurrentDictionary.TryAdd`,
`decomp/KSA/SerializedCollection.cs:20-34` — a second declaration under a live id is silently
ignored), which is why flexo's own cross-part dedupe is first-wins too. Two parts declaring one
id with **divergent** payloads is a preflight blocker (`collectProjectExportIssues`), so
first-wins is never lossy. (A `Category="Solid"` reaction missing its burn-rate law is still
skipped with a warning — see [engines.md](engines.md).)

**Global uniqueness obligations** (each row names its guarantor):

| Registered id                                                    | Guarantor                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `<Part Id>` / `<PartGameData Id>`                                | preflight blocker on duplicate `partId`                                                                        |
| Export-variant `<SubPart Id>` = `flexo_<base>_<ns>_<templateId>` | per-part `ns` token, preflight-unique                                                                          |
| Custom-mesh `<SubPart Id>` / GLB mesh names / `_VM` names        | project-unique `subPartId` (plan invariant I4; `clonePartWithFreshAssets`, `src/state/partClone.ts`)           |
| `<PartModel Id>` = `<subPartId>_Model` / `<variantId>_Model`     | follows the two rows above                                                                                     |
| `<PbrMaterial Id>`                                               | mat-id- or bundleToken-suffixed (`modExport.ts`) — per-part unique already; asserted across parts by `claimId` |
| `<FixedReaction Id>`                                             | cross-part dedupe of identical payloads; divergent duplicates are a preflight blocker                          |
| `<KeyframeAnimationModule Id>` / GLB paths                       | anim-id suffix in `animToken` (`src/ksa/animationNaming.ts`) — random per clip                                 |
| Texture file names                                               | texture-id / bundleToken suffixes (`modExport.ts`) — unique under I4                                           |

`assetsXmlSerializer.claimId` is the tripwire under the `<SubPart>`/`<PbrMaterial>` rows: it
**throws** on a duplicate id inside one exported mod rather than let KSA's silent first-wins
registration ship the wrong mesh.

## Known gotchas

- Connector `<Flags>` live on `<PartGameData>`, **not** on the geometry `<Part>` — without the GameData merge, `ToSurface`/etc. are lost.
- A `<Part>` with no matching `<PartGameData>` has no tags/modules → invisible in the part picker.
- `DockingPort` parses only the current child-element form (`<ConnectorId Value>`, `<LatchingKineticEnergy J>`, `<PushoffImpulse Ns>`) — no legacy fallback; see [gamedata-modules.md](gamedata-modules.md).

## What changed in 5348

**`PartTemplate`'s element list moved by exactly two entries** (rev 5329):

```diff
-[XmlElement("Decoupler")]           public DecouplerTemplate? Decoupler;
+[XmlElement("PrimarySequenceModule")] public SubPartIdReference? PrimarySequenceModule;
```

- **`<Decoupler>` is not gone** — it became a `Components` module carrying
  `[XmlType(TypeName = "Decoupler")]` with the same `ConnectorId` + `Force` attributes, so the wire
  form is unchanged at both authoring sites. See
  [gamedata-modules.md](gamedata-modules.md#what-changed-in-5348) for the two behavioural
  consequences (it is repeatable now, and `ApplyGameData` appends rather than overrides).
- **`<PrimarySequenceModule Id>` is new.** Sequencing moved from parts down to modules
  (`ISequenced`), so a part with several sequenceable modules names its primary one. Core authors
  it under `<PartGameData>` — `<PrimarySequenceModule Id="LESMotor"/>` on both LES prefabs in
  `CorePropulsionAGameData.xml` — where flexo's `RawXmlNode` passthrough round-trips it verbatim.
  It is dropped on a geometry `<Part>` and opaque to the editor: **gap T3**, the exact twin of
  `<Grab>`/gap **S2**.

**`PartModelModule.TemplateData` gained `[XmlElement("Terrain")] bool Terrain = false`** (rev 5336,
"Glb nodes can now be marked as `_Terrain` and will have the terrain material applied"). `<PartModel>`
is a MODELED element, so no passthrough covers it and an authored `<Terrain>` on a part would be
dropped: **gap T2**. Only static objects author it today (`CoreLaunchPadCAssets.xml`), and it does
not disturb the `<Internal>` uniqueness claim — `PartModelModule.cs`'s is still the only
`[XmlElement("Internal")]` in the tree.

**Static objects are a new top-level `<Assets>` family, out of scope.** `AssetBundle` gained
`<StaticObject>` / `<StaticSubObject>` / `<StaticObjectGameData>` (rev 5328's launch-pad scenery)
and `<ClutterObjectGameData>` (rev 5304). flexo never re-emits a whole Core `<Assets>` file, so
there is nothing to silently drop on the part path; the clutter half is tracked in
[ground-clutter.md](ground-clutter.md).

**Editor part scaling is runtime, not schema.** Rev 5329's `IRescale` / `ScaleFactors` rescale a
live part uniformly (0.5×–2×; `ScaleFactors(double3)` takes the **largest** axis) and
`Part.ScaleTotal` changed from an additive quaternion-transformed composition to a plain
component-wise product. No XML moved, and **rendering still uses the non-uniform
`CreateScale(Scale)`**, so flexo's authored SubPart transforms are unaffected. Worth knowing: KSA's
own GLB importer (`KSA.GlbImport/PartAssetBundler`) now warns on a non-uniform `_connector` or mesh
node scale — "the simulation scales uniformly and will size this from the largest axis".

Content-side, Core added a parachute bay and launch-escape tower, a second small SRB-C segment,
`<Grab Id>` handrail anchors, and renamed the MMU's eight `<Rocket>`/`<RocketReference>` ids to
`…Rocket` so they stop colliding with the thruster-controller ids — the same duplicate-id hygiene
push that produced `<Light Id>`. Both vendored fixtures that moved (`PartGameData.xml`,
`CoreIVASpaceAGameData.xml`) were re-synced.

---

## What changed in 5261

**Verdict: MISSING-CAPABILITY (gap S2, 📋 OPEN) + one COSMETIC test-anchor move.**

### `<Grab>` — kitten handhold anchors (rev 5203)

Rev 5203 ("Kittens can now grab onto ladders and capsules") added `GrabTemplate.cs`:

```csharp
public class GrabTemplate {
    [XmlAttribute("Id")]     public string Id = string.Empty;
    [XmlAttribute("Hidden")] public bool Hidden;
    [XmlElement("Position")] public Vector3Reference? _positionRaw;   // default (0,0,0)
    [XmlElement("Normal")]   public Vector3Reference? _normalRaw;     // default (0,0,1), normalized
}
```

and declared it on **both** templates — `[XmlElement("Grab")] public List<GrabTemplate> Grabs` on
`PartTemplate` (the geometry `<Part>`) and on the GameData template, merged by
`PartTemplate.ApplyGameData` via `Grabs.AddRange(gameData.Grabs)` exactly like `Batteries`,
`Diameters` and `SymmetryGroups`.

Core authors them **only under `<PartGameData>`**:

- `CoreCommandAGameData.xml` — five `<Grab Id="spine1".."spine5">` handholds along the capsule.
- `CoreUtilityAGameData.xml` — the ladder's `rung1..rung3` plus `end_bottom` / `end_top`, both
  `Hidden="true"` (park anchors rather than grabbable rungs).

**flexo impact.** Because Core authors them on `<PartGameData>`, flexo's `RawXmlNode` passthrough
captures and re-emits them verbatim — **nothing is lost on a round-trip today**, and they show up
in `src/ui/data/PassthroughViewer.tsx`. Two reasons it is still an open gap: they are opaque to the
editor (no gizmo, no inspector, no validation that a `<Position>` actually sits on the mesh), and a
`<Grab>` authored on the **geometry `<Part>`** — schema-legal, just not something Core does — is
outside the passthrough surface and **would be dropped**. Modeling it is a small, well-bounded
addition (id + hidden flag + position + normal, i.e. a point-with-direction, the same shape the
connector and IVA-seat editors already handle).

### Core stopped authoring `<ShadowCaster>` (COSMETIC)

Rev 5200 re-imported the command, fairing, landing and utility parts through the game's own
GLB→XML tool. That re-import dropped Core's only two `<ShadowCaster>false</ShadowCaster>`
elements (the `CoreCommandA` medium-capsule windows), so **no Core template authors the element
anywhere** at 5261. The schema is untouched — `PartModelModule` is byte-identical and still
declares `[XmlElement("ShadowCaster")] public bool ShadowCaster = true` — so flexo keeps parsing
and emitting it unchanged. Only the real-data anchor in `src/ksa/catalog.test.ts` moved: it now
asserts that no Core template authors one, and will flip back if a future re-import re-authors it.
The inline-XML suite in the same file remains the capture coverage.

`CoreEditorTagsGameData.xml` is unchanged, so the static `EDITOR_TAG_DEFS` / `KNOWN_EDITOR_TAGS`
snapshot in `src/ksa/types.ts` needs no refresh. Five of the six vendored `__fixtures__` files were
re-synced — values only, including rev 5238/5239's flipped-connector fixes
(`<Rotation X= Z=>` → `<Rotation Z=>`) and rev 5190's removal of the placeholder landing-leg and
solar-panel colliders.

## What changed in 5168

**Verdict: ✅ INTACT** (one catalog gap, now closed). `PartTemplate.cs`, `SubPartTemplate.cs` and
`EditorTagDefinition.cs` carry no schema movement beyond two **added** `[XmlElement]`s on
`PartTemplate.InertMasses` (rev 5166): `<SolidOgiveMass>` (`SolidOgiveMassTemplate`) and
`<HollowOpenOgiveMass>` (`HollowOpenOgiveMassTemplate`), the "tangent ogive mass type" of the
CoreFairingA import. Two sibling classes appeared alongside them — `AsmbRevolvedMassTemplate`
(masses of revolution may now be a **sector** rather than a full circle, hence the `<Sweep>`
elements new in `CoreFairingAGameData.xml`) and `HollowOpenOgiveMassTemplate`. flexo models only
`<CustomMass>` out of this whole family; every other mass element rides the `<PartGameData>` /
`<SubPartGameData>` `RawXmlNode` passthrough (`src/ksa/types.ts` documents the family by name), so
the new ones round-trip untouched. **No parser change required.**

`CoreEditorTagsGameData.xml` is unchanged, so the static `EDITOR_TAG_DEFS` / `KNOWN_EDITOR_TAGS`
snapshot in `src/ksa/types.ts` still matches the registry.

**The one real gap (MISSING-CAPABILITY, fixed in this review):** rev 5161 imported a brand-new Core
part file — `CoreUtilityAAssets.xml` / `CoreUtilityAGameData.xml` (`CoreUtilityA_Prefab_LadderA`
plus 11 `<SubPart>` templates, "not yet functional as ladders"), and added both to Core's
`mod.toml`. flexo's part/SubPart catalog reads a **hand-maintained** list, `ASSET_FILES` in
`src/ksa/catalog.ts`, which did not include it — so the new parts were silently absent from the
Part and SubPart browsers with nothing failing. `CoreUtilityAAssets.xml` is now listed, and
`src/ksa/catalog.test.ts` grew a drift guard that enumerates `Core*Assets.xml` in the live private
tree and fails on any file `ASSET_FILES` omits, so the next such import cannot go missing quietly.

**Fixtures:** only `PartGameData.xml` moved, and only in **values** — no schema. Two edits: the RCS
retune of rev 5119 (`<MaxPressure>` 7→21 bar, `<ExitDiameter>` 0.02→0.03 m, `<ExpansionEfficiency>`
0.13→0.5, `<MinimumPulseTime>` 0.008→0 s across the MMU thrusters) and a **part-frame convention
change** on `KittenBackPackSubPart`: the origin moved from the jetpack to the kitten's **feet**, so
every `<LocationAsmb>`, `<ExhaustLocation>` and `<FxExhaustLocation>` shifted by `Z -= 0.431`, and
the capsule collider became a sphere. Re-synced via `cd scripts && bun run sync-fixtures`.

---

## What changed in 5117

**Nothing in this area — re-verified INTACT.** `PartTemplate.cs` and `Part.cs` changed only in
runtime plumbing: a new `Part.ResolveRuntimeId(instanceName, template)` helper plus
`PartInstance.RuntimeId` (`Id` when non-empty, else the resolved template `Id`, else `InstanceOf`),
which `PartTemplate.ResolveConsumerFeeds` / `AddResolvedFeed` now match `<FeedsFrom SubPart=>`
against instead of the raw `PartInstance.Id`. That is a **relaxation** — an id-less `<SubPart>`
placement is now addressable by its template id — and flexo always emits explicit placement ids,
so both parse and emit are unaffected. The rest of `Part.cs` is the `MatrixAsmb2VehicleAsmb`
cache (rev 5112, sentinel `Identity` → `NaN`), pure performance. `SubPartTemplate.cs` is
byte-identical.

**Editor tags: still in sync.** `EditorTag.cs` gained three statics (`Booster`, `Coupling`,
`Cargo`) — the C# side catching up to `CoreEditorTagsGameData.xml`, which is **unchanged** at 5117. flexo's `EDITOR_TAG_DEFS` snapshot (`src/ksa/types.ts`) already lists all 17 registry
entries in registry order with matching `NotaCategory` flags; re-diffed entry-for-entry against
the 5117 file. No refresh needed.

**Fixtures re-synced.** All six vendored files under `src/ksa/__fixtures__/` were re-synced from
the 5117 mirror (`cd scripts && bun run sync-fixtures`). The real content deltas were
`PartGameData.xml` (`<EVADoor SeatId>` — gap **Q1**), `CoreIVASpaceAGameData.xml`
(`<IVASeat Id>` — gap **Q2**), `CoreElectricalAGameData.xml` (placeholder `<Collider>` blocks
deleted) and `CoreFuelTankAGameData.xml` (tank oversizing re-tuned + explanatory comments).
The full `src/ksa` suite passes against them.

## What changed in 5056

**Structure unchanged; content regenerated at lower precision.** No new `[XmlElement]` /
`[XmlAttribute]` on `PartTemplate` or `SubPartTemplate` (`SubPartTemplate.cs` and
`EditorTagDefinition.cs` are byte-identical), and `CoreEditorTagsGameData.xml` did not change, so
the static `EDITOR_TAG_DEFS` / `KNOWN_EDITOR_TAGS` snapshot still stands.

Three things did move:

1. **`PartTemplate.EditorTags` gained `[XmlIgnore]`.** This is the RESOLVED runtime list; the
   wire-facing field is still `[XmlElement("EditorTag")] List<StringReference> EditorTagsStrings`.
   The `<EditorTag Value="…"/>` element flexo parses and emits is unchanged — the attribute just
   stops the runtime list being serialized back out.
2. **`Part.Connector` gained `ShouldSerializeFlags()` / `ShouldSerializeCapabilities()`**, and
   `Tank.SaveData` gained `[DefaultValue(false)]` on `Manual` / `PropellantUseDisabled`. All
   WRITE-side suppression — the `<Flags>` / `<Capabilities>` wire format flexo depends on is
   untouched (and the whitespace-separated `[Flags]` body rule from 5018 still holds).
3. **Core was regenerated through the in-repo `GlbToXmlUtility`** (rev 5025 moved the tool into
   `decomp/KSA.GlbImport/`; rev 5026 re-imported CoreCouplingA, CoreElectricalA, CoreFairingA,
   CoreFuelTankA, CoreLandingA, CorePropulsionA/B/C and CoreServiceModuleA). The tool writes **4
   significant figures** where the old external one wrote 5–6, so every regenerated geometry
   value shifted in its last digit — e.g. the solar cell's `<Box>` collider went
   `0.79467 → 0.7947`, `0.59602 → 0.596`, `0.02531 → 0.0253`. This is a CONTENT change: the
   vendored `src/ksa/__fixtures__` were re-synced and the two collider assertions in
   `catalog.test.ts` / `partCatalog.test.ts` updated to the new values.

rev 5026 also split the fuel port into its own `Content/Core/CoreFuelPortGameData.xml` (added to
`mod.toml`), whose comment states the intent: keeping it out of an autogenerated `*Assets.xml` so
the GLB import cannot wipe it. `<FuelPort MaxLength="100"/>` is still an unmodeled
`<PartGameData>` child and therefore passthrough-safe — carried-forward gap **G**.

rev 5053 added low-profile decoupler game data, made all interstages and service bays decouplers,
gave service-bay parts real `<Tank>`s, set their connectors internal with symmetry, and "fixed a
couple of XML entries that were misnamed and thus not being parsed" — all content, all in element
forms flexo already models.

## What changed in 5018

**The document structure is unchanged** — no new top-level `<Assets>` child that flexo
places, no `<Part>`/`<SubPart>` attribute change, and the editor-tag registry
(`CoreEditorTagsGameData.xml`) is byte-identical, so `EDITOR_TAG_DEFS` stands. What changed
is the CONTENT of modeled GameData elements; see
[plumbing-and-feeds.md](plumbing-and-feeds.md), [engines.md](engines.md#what-changed-in-5018)
and [gamedata-modules.md](gamedata-modules.md#what-changed-in-5018).

Two structural notes for future reviews:

- **The allow-list grew**: `KNOWN_PART_GAMEDATA_CHILDREN` gained `Tank`,
  `ConsumerFeedWiring`, `SolidMotor`, `SolidMotorNozzle`, `SolidGrainSegment`;
  `KNOWN_SUBPART_GAMEDATA_CHILDREN` gained the three solid ones. (Post-5018, the light
  management feature also added `Light` to `KNOWN_PART_GAMEDATA_CHILDREN` — part-level
  `<Light>`s are now modeled, see [gamedata-modules.md](gamedata-modules.md).) Anything
  that moves INTO the allow-list stops appearing in `unknownChildren` — which is the
  point, but it also means it stops being protected by the passthrough, so its schema
  must now be tracked.
- **`Components` entries all carry an `Id`** (`ModuleBase.TemplateDataBase.Id`), and as of
  5018 that id is load-bearing for feed resolution. Full element list in
  [gamedata-modules.md](gamedata-modules.md#what-changed-in-5018).

Two new top-level asset elements appeared in Core but need no flexo entry in `ASSET_FILES`:
`Content/Core/GrainGeometries.xml` (`<GrainGeometry>`) and
`Content/Core/PlumeTrailAssets.xml` (`<PlumeTrailTemplate>`) — neither declares a
`<SubPart>` or a `<Part>`, so the catalog has nothing to read from them; flexo references
their ids by name only.

## What changed in 4980

**INTACT — no flexo change, no schema or content drift.** `PartTemplate.cs`,
`SubPartTemplate.cs`, `Part.cs`'s template surface, and `EditorTagDefinition.cs` are all absent
from the 4939→4980 decomp diff (the `Part.cs` hunks are runtime `ConnectAndMerge`/flow-rule
work — see [connectors-coordinates-iva.md](connectors-coordinates-iva.md#what-changed-in-4980)
and [engines.md](engines.md#what-changed-in-4980)). No editor-tag registry change. The shipped
part catalog is **content-identical**: the 8 `Core*Assets.xml`/`CoreIVASpaceAGameData.xml`
files that differ in the 4980 private-mirror sync differ **only in CRLF line endings** (mirror
sync artifact — `diff --strip-trailing-cr` is empty), no new asset packs, and none of the 5
vendored `__fixtures__` files are affected (drift test unaffected). `PartTree.Serialize()` was
reshaped into `PartTreeData` (root + sequence environments + fuel links) — **vehicle-save**
format, outside flexo's part-template scope. The 4939 geometry-`<Collider>` gap carried
forward unchanged at 5018 (still only the 4 CoreElectricalA sites) and has since been CLOSED
by modeling `<Collider>` — see [colliders.md](colliders.md).

## What changed in 4939

- ✅ **First geometry-template `<Collider>` children (gap E — now CLOSED).** Rev 4918's
  CoreElectricalA update authored `<Collider>` directly on 2 geometry `<Part>` prefabs
  (`CoreElectricalA_Prefab_BayFuelcellSmall`, `CoreElectricalA_Prefab_InlineBatteryBankB` —
  `<Cylinder>`) and 2 `<SubPart>` templates (`CoreElectricalA_Subpart_SolarPanel[A|B]_CellA` —
  `<Box>`). The gap-6 passthrough covers only `<PartGameData>`/`<SubPartGameData>`; geometry
  templates are rebuilt from the typed model, so importing one of those 2 prefabs and
  re-exporting DROPPED the collider. **Resolved by modeling `<Collider>` outright** rather
  than by raw `<Part>`-child passthrough: `collidersFromElement` reads all four authoring
  sites into `EditingPart.colliders`, and `serializeGameDataXml` normalises them back into the
  GameData document (legal because `PartTemplate.ApplyGameData` merges `Components`
  additively). `<Collider>` moved OUT of the passthrough into both
  `KNOWN_*_GAMEDATA_CHILDREN` sets. See [colliders.md](colliders.md).
- ✅ **New `<SymmetryGroup>` element (schema + GameData content).** `PartTemplate` gained
  `[XmlElement("SymmetryGroup")] List<Part.SymmetryGroupRef>` (`SymmetryGroupRef` =
  `[XmlElement("ConnectorRef")]` with `Id` attrs); `PartTemplate.ExpandSymmetryGroups()`
  expands it into pairwise connector `SymmetrySiblings` — i.e. it's GameData-side sugar for
  the 4826 `<Sibling>` system. Rev 4929 moved Core's sibling defs out of the auto-generated
  `CoreStructuralAAssets.xml` into `CoreStructuralAGameData.xml` as `<SymmetryGroup>` — shipped
  Assets XML now has **zero** `<Sibling>` elements, but `[XmlElement("Sibling")]` on
  `Part.Connector.TemplateBase` is unchanged, so flexo's `siblingIds` parse/emit
  (`partXmlParser.ts` / `partXmlSerializer.ts`) stays valid. `<SymmetryGroup>` inside
  `<PartGameData>` rides the gap-6 passthrough, with its `<ConnectorRef>` ids remapped onto the
  regenerated connector ids on import/paste (`remapRawConnectorRefs` — verbatim re-emit left
  them stale after connector renumbering).
- ✅ **New editor tag `Booster`** (`<EditorTagDef Id="Booster" RootPartWhitelist="true"
FaceSnapTargetWhitelist="true"/>`, first in registry order). `EDITOR_TAG_DEFS` snapshot in
  `src/ksa/types.ts` refreshed; registry-order test updated.
- ✅ **Two new Core asset packs** — `CoreFuelTankB[Assets|GameData].xml` (bay parts, not yet
  configured as tanks) and `CorePropulsionC[Assets|GameData].xml` (larger SRBs under the new
  `Booster` tag; engine GameData not yet configured). Added to `ASSET_FILES` in
  `src/ksa/catalog.ts` (GameData siblings are derived). Rev 4915 also REMOVED the old
  service-module prefabs (`CoreServiceModuleA_Prefab_MediumServiceModule[A|B]`) — no flexo
  references existed.
- ✅ **Tank GameData relocated to Part level.** Rev 4934 moved all Core tank definitions out of
  `PartGameData.xml`'s `<SubPartGameData>` entries into Part-LEVEL `<Tank>` children of
  `<PartGameData>` entries in `CoreFuelTankAGameData.xml` (now with optional `Id` attr,
  `<LocationAsmb>`, and the first `<SphericalTank>` usage). flexo models tanks only on
  `<SubPartGameData>` (still-valid schema); part-level `<Tank>` rides the passthrough —
  preserved verbatim but NOT editable (recorded MISSING-CAPABILITY in the gaps plan). Vendored
  fixtures re-synced; the vendored-fixture tank test now asserts the passthrough shape.

## What changed in 4892

- ✅ **`PartTemplate.cs` / `SubPartTemplate.cs` geometry schema: NO drift.** The only
  `PartTemplate` change is the removal of the dead part-level `Tank` field (never modeled by
  flexo — see [gamedata-modules.md](gamedata-modules.md#what-changed-in-4892)) plus tooltip
  refactors (`DrawCombustionProcessTooltip` → `DrawReactionTooltip` + a new consumer-role
  tooltip). `EditorTagDefinition.cs` and `CoreEditorTagsGameData.xml` unchanged — the
  `EDITOR_TAG_DEFS` snapshot stays valid.
- 🟡 **Modeled-child schema drift inside GameData — combustor + tank** (the engines and
  gamedata-modules areas own the fixes): `<Combustor><Combustion Id>` → `<Reaction Id>` +
  `<MixtureRatio>`, tank `<CombustionProcess>` → `<RoleAffinity>`, and top-level custom
  propellants `<CombustionProcess>` → `<FixedReaction>`.
- ✅ **Content churn absorbed by the fixture re-sync:** `PartGameData.xml` lost its UTF-8 BOM,
  gained the `KittenBackPackPart` `<PartGameData>` (a lone `<Collider>` — since MODELED; then via the gap-6
  passthrough), and LOST the LR91 Dev engine (`CorePropulsionA_Prefab_EngineA1_Dev` `<PartGameData>`
  - `<Part>` + its subpart). Vendored fixtures re-synced @ 4892 (`bun scripts/sync-test-fixtures.ts`);
    the drift test in `partCatalog.test.ts` is green again.
- ✅ **Duplicate-Id SubPartGameData merge, `<Diameter>` repeatable, `<Control>` marker: intact**
  (re-verified against the 4892 fixture round-trip tests).

## What changed in 4826

- **`<Diameter>` became repeatable.** Decomp-confirmed: `PartTemplate.cs` `[XmlElement("Diameter")] DistanceReference? Diameter` (4750, single) → `[XmlElement("Diameter")] List<DistanceReference> Diameters` (4826). Element name unchanged (`<Diameter>`); `ApplyGameData` now `AddRange`s them. Adapter prefabs list every size class they bridge (e.g. `CoreFairingA_Prefab_InterstageBridge3W2WA` → `<Diameter M="3"/><Diameter M="2"/>`; `CoreStructuralA` low-profile engine plates likewise). flexo modeled one value (`PartGameData.diameterM`) and dropped the rest on round-trip. **Fixed:** the first `<Diameter>` stays the editable `diameterM`; the remainder are preserved verbatim in `PartGameData.extraDiametersM` (parse `partXmlParser.ts`, emit `partXmlSerializer.ts`, carried through catalog/import/persist). No multi-value UI — the extras ride along with the primary. Regression: `partXmlParser.test.ts` "multi-size adapter".
- **`<Aligned>` is now a modeled game field too** (decomp: `PartTemplate.Aligned` = `List<Part.AlignedConnectors.AlignedConnectorsRef>`), but a `<PartGameData>` child flexo doesn't model → still round-trips verbatim via the gap-6 passthrough. Its geometry twin `<Sibling>` (connector child) is covered via `Connector.siblingIds`; both are the new part-symmetry system — see [connectors-coordinates-iva.md](connectors-coordinates-iva.md#what-changed-in-4826).
- **Not a schema change:** `CoreFuelTankAAssets.xml` switched its 33 fuel-tank meshes from `<PartModel>` to `<PartModelDynamic>` (thermal-FX / `TFI_Heat` heat-glow). `catalog.ts` already reads either tag (`firstChildByTag(sub, 'PartModel') ?? firstChildByTag(sub, 'PartModelDynamic')`), and built-in meshes/materials are referenced by id, so nothing to change.

## What changed in 4750 (summary; detail in the fix plan)

- **NEW `<Diameter M>`** on most `<PartGameData>` (command, fuel tanks, structural, coupling, fairing, propulsion, + monolithic `PartGameData.xml`) — ✅ **now modeled** as `PartGameData.diameterM` (read via `readDistanceM`, emitted as plain `<Diameter M>`). _FIXED 2026-06-27._
- **NEW `<Control/>`** marker on command pods — ✅ **now modeled** as `PartGameData.controllable` (bare `<Control/>` round-trips). _FIXED 2026-06-27._
- **Editor-tag registry** (`CoreEditorTagsGameData.xml`) supersedes `KNOWN_EDITOR_TAGS` — ✅ **refreshed**: `KNOWN_EDITOR_TAGS` now derives from a typed `EDITOR_TAG_DEFS` snapshot (16 rows, registry order, `NotaCategory` flags); obsolete `Tanks` dropped, `Fuel Tanks`/`Landing`/`NoFaceSnapping`/`All` added; `EditorTagsField` groups Categories vs Functional. _FIXED 2026-06-27._
- **Unmodeled GameData elements dropped on round-trip** — ✅ **fixed** by gap-6 passthrough (see the master-invariant section). _FIXED 2026-06-27._
- **Geometry-template `<Collider>` dropped on round-trip** (gap E) — ✅ **fixed** by modeling `<Collider>` at all four authoring sites and normalising it into the GameData document ([colliders.md](colliders.md)).
- `Part.cs`/`PartTree.cs`/`EnumCollections.cs` otherwise = bugfix + logging-codegen noise; no Part/SubPart structural change.
