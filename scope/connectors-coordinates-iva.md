# Scope — Connectors, coordinate mapping, IVA

> How flexo places geometry in KSA's frame, models connectors, authors `<IVASeat>` interior-camera
> vantage points, and carries the `<Internal>` interior-only render flag.
> Read alongside [docs/coordinates.md](../docs/coordinates.md),
> [docs/iva-seats.md](../docs/iva-seats.md) (the flexo-internal view of seats + the
> `<Internal>` flag) and
> [docs/ksa-part-connector-notes.md](../docs/ksa-part-connector-notes.md).

**Baseline:** re-vetted against KSA build **2026.7.9.5018** (decomp @ 5018 + shipped Core XML).
**Baseline status:** ✅ **CURRENT** — the coordinate calibration, connector flag _schema_, and the
IVA render gate are all **intact**; the `<DockingPort>` GameData schema (BREAKING in 4750) is fixed.
As of 4826, connectors carry new attach-node grouping (`<Sibling>` geometry / `<Aligned>` GameData);
`<Sibling>` is now preserved via `Connector.siblingIds`, `<Aligned>` rides the gap-6 passthrough
with its `<ConnectorRef>` ids remapped through the regenerated connector ids on import/paste
(see [What changed in 4826](#what-changed-in-4826)). See
[plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

**Two flexo-side changes since the 5018 re-vet, both in this doc:**

- **`<IVASeat>` is now MODELED** at both Part-level authoring sites (it used to ride the gap-6
  `<PartGameData>` passthrough) — parse, serialize, catalog, built-in-part import, project
  codec/transfer, and export pre-flight validation. Contract below. Since first written, the
  editor half landed too: a 3D marker, the fifth selectable kind, an inspector with aim presets,
  and an in-editor **seat preview** that runs the game's own view clamps (`ivaLook.ts`).
- **The automatic interior-prop export rewrite is DELETED.** `<Internal>` is now
  per-SubPart-template user data that flexo mirrors from the game by default. Contract below.

---

## Flexo modules

| Path                                                | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/three/coords.ts`                               | **The single chokepoint** for KSA-Part-space ⇄ three.js. `applyPlacement`, `matrixFromTransform`, `transformFromMatrix`. The one calibration knob `EULER_ORDER = 'ZYX'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/three/coords.test.ts`                          | Locks the mapping by reproducing KSA's `QuaternionEx.CreateFromXyzRadians` and asserting `applyPlacement` matches to <1e-6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/three/debugCalibration.ts`                     | `?debug=dockingport`: loads `CoreCouplingAAssets.xml` part `CoreCouplingA_Prefab_DockingPort1WA` and renders its SubPart placements.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/three/ConnectorObject.ts`                      | Renders a connector as a cube + cone along **local +X** (the facing arrow).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/ksa/types.ts`                                  | `Connector` (`extends Transform`; `id`, `flags`, `layerId`); `ConnectorFlag = 'Internal'\|'ToSurface'\|'FromSurface'`; `Decoupler`/`DockingPort`/`EvaDoor`; `IvaSeat` (`extends Transform`) + `IVA_SEAT_LAYER_ID`/`createIvaSeatLayer`; `EditingPart.ivaSeats` / `EditingPart.internalFlags`.                                                                                                                                                                                                                                                                                                                                                                         |
| `src/ksa/partXmlParser.ts` / `partXmlSerializer.ts` | `parseConnectorFlags`/`connectorsFromPartElement`; `buildConnectorElement`/`flagsString`. Seats: `ivaSeatsFromElement` (+`'IVASeat'` in `KNOWN_PART_GAMEDATA_CHILDREN`) / `buildIvaSeatElement` + the shared `buildVec3Attrs`.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/ksa/ivaSeatAxes.ts`                            | **The one place** seat `rotation` ⇄ `<ForwardAxis>`/`<UpAxis>` converts. `SEAT_LOCAL_FORWARD` `(1,0,0)` / `SEAT_LOCAL_UP` `(0,0,−1)` (= KSA's own field defaults), `ksaQuatFromEulerXyz`, `seatAxesFromRotation`, `seatRotationFromAxes` (→ `null` on a degenerate pair). Pure, no three.js; `ivaSeatAxes.test.ts` locks it against `coords.ts`.                                                                                                                                                                                                                                                                                                                      |
| `src/ksa/partCatalog.ts`                            | `CatalogPart.ivaSeats` — merges the geometry `<Part><IVASeat>`s (`parsePartsFile`) with the `<PartGameData><IVASeat>`s (`mergeGameData`), then re-numbers `_seatN` across the merged list in document order.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/ksa/ivaLook.ts`                                | **Verbatim port of `IVAController.OnFrame:80-108`** — `clampSeatLook(look, forward, up)` + `IVA_UP_DOT_LIMIT = 0.9`, applying both view clamps exactly once (one game frame), including the raw-`up` asymmetry. Pure, no three.js. Drives the seat preview so what the author sees is what the game allows.                                                                                                                                                                                                                                                                                                                                                           |
| `src/ksa/ivaSeatValidation.ts`                      | Export pre-flight, same two severities as `colliderValidation.ts` and, like it, **ADVISORY** (`ExportButton` displays; nothing gates export). 8 rules; only `iva-seat-non-finite` is **block**. Warns: `iva-seat-duplicate` (identical position+orientation — loads fine, `C` just appears to do nothing), `iva-seat-no-interior`, `iva-interior-no-seat`, `iva-interior-on-glass`, `iva-seat-outside-colliders` (part-level colliders only), `iva-seat-count` (>8), `iva-seat-at-origin`. Deliberately has **no** non-unit/parallel-axis rule (unreachable — the parser drops those). Wired into `ExportButton.tsx` alongside `validateEngines`/`validateColliders`. |
| `src/three/IvaSeatObject.ts`                        | The seat marker: eye sphere + a cone along local **+X** (`<ForwardAxis>`) + a stick along local **−Z** (`<UpAxis>`, the only roll cue) + a CSS2D **cycle-order badge**, plus an optional 45° gaze cone that is INDICATIVE only (the real limit is a 90° hemisphere — a half-space with no drawable shape). Sized off `$ivaSeatSettings`, never off the document (`scale` is unused).                                                                                                                                                                                                                                                                                  |
| `src/state/ivaStore.ts` / `ivaSeatStore.ts`         | Ephemeral, never persisted, never in undo. `$seatView` (keyed by seat **id**, so a mid-preview reorder can't move the camera into another seat) + `$seatLook` + `enterSeatView`/`exitSeatView`/`nudgeSeatLook`; `$ivaSeatAimRequest` is the "Aim at selection" intent `EditorScene` consumes (the `$colliderFitRequest` pattern) before writing through `aimIvaSeat`.                                                                                                                                                                                                                                                                                                 |
| `src/three/Viewport.ts` / `EditorScene.ts`          | The seat-view camera mode: `enterSeatView(pose)` snapshots the orbit camera, disables `OrbitControls` **and skips `controls.update()`**, and per change composes look = seat axes + yaw/pitch → `clampSeatLook` (ONCE) → `lookAt`. No FOV change — flexo's camera is already KSA's **50°** (`Camera.cs:51`). `EditorScene` resolves the id to a pose, exits cleanly on a vanished seat, and suppresses the gizmo, click-selection and the seat markers while seated.                                                                                                                                                                                                  |
| `src/ksa/modExport.ts`                              | `resolveInternal` — the single `<Internal>` resolution rule (user flag > catalogued built-in value > `false`). `buildExportVariantMap` / `ExportVariant` / `variantRemap` — mints a built-in-SubPart export variant only when flexo actually changes something.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/ksa/assetsXmlSerializer.ts`                    | `ReferenceSubPartPlan` — reference-only `<SubPart>` wiring a fresh `<PartModel>` id to built-in `<Mesh>`/`<Material>`, carrying `<Internal>`/`<RayTracing>`/`<ShadowCaster>` forward. `internalElement` emits `<Internal>true</Internal>` (never on the `<PartModelGlass>` path).                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/state/editorStore.ts`                          | `setPlacementsInternal(indices, internal)` — one undo entry, writes `EditingPart.internalFlags` for the DISTINCT templates behind the selection; `isGlassTemplate` gates it. UI: `AssetsList.tsx` / `MultiSelectToolbar.tsx` "Interior (IVA only)", `SubPartBrowser.tsx` badge. Built-in-part import appends seats in order with fresh ids (`nextIvaSeatId`).                                                                                                                                                                                                                                                                                                         |
| `src/state/projectCodec.ts` / `projectTransfer.ts`  | Persistence: `iv` (seats — ORDER is load-bearing) + `ifl` (`internalFlags`), both at `PROJECT_EXPORT_VERSION = 7`; a seat's `layerId` is restored from `IVA_SEAT_LAYER_ID` on decode, never serialized. Additive paste appends seats with fresh ids.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Seat authoring UI                                   | `TransformInspector.IvaSeatHeader` (order + "IVA opens on this seat" badge, the **exported-axis readout** through `formatG6`, six aim presets that KEEP the current up axis where it stays non-parallel, "Aim at selection", "Sit in this seat", "Add kitten at this seat"); `AssetsList` IVA Seats section (rows are ORDINALS — a seat has no name — subtitled with the derived forward axis); **Add → IVA Seat**; `SeatViewBar` (prev/next wrap like `C`, Exit, `Escape` gated on `$seatView` so it never shadows a dialog dismiss).                                                                                                                                |
| Seat/interior VIEW settings                         | `settingsStore.$ivaSeatSettings` (`flexo:ivaSeatSettings` — markerSize `0.12`, showGazeCone `false`) and `viewStore.$hideInterior` (`flexo:hideInterior`, default off) — **View ▸ Visibility ▸ Hide interior** previews KSA's outside-IVA gate by hiding every mesh whose `resolveInternal` is true. Persisted view prefs, outside the document and outside undo; `applyLayerView` composes them with layer visibility and stays the ONLY writer of `group.visible`. `editorStore.addKittenAtSeat` places an editor-only kitten at a seat with its **yaw only** (origin = feet, not the eye point).                                                                   |

## Game-side anchors (`decomp/KSA/`)

| Concern                   | Class                                                                                                                                                                                                                                                                                                                                                                                                            | XML                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Connector schema          | `Part.cs` → `Part.Connector.TemplateBase` (`Id` attr, `<Transform>`, `<Flags>`); enum `Part.Connector.Flag {Internal=1, ToSurface=2, FromSurface=4}`                                                                                                                                                                                                                                                             | `<Connector Id><Transform/><Flags/></Connector>` on `<Part>`                                  |
| Face-snapping / placement | `VehicleEditor.cs`, `EditorTag.cs`, `EditorTagDefinition.cs`                                                                                                                                                                                                                                                                                                                                                     | `<EditorTag Value>`, `<EditorTagDef …>`                                                       |
| Decoupler                 | `DecouplerTemplate.cs`                                                                                                                                                                                                                                                                                                                                                                                           | `<Decoupler ConnectorId Force>`                                                               |
| Docking port              | `DockingPortTemplate.cs`, `DockingPort.cs`                                                                                                                                                                                                                                                                                                                                                                       | `<DockingPort>` — **CHANGED, see gamedata-modules.md**                                        |
| IVA render gate           | `PartModelModule.cs:35` (`<Internal>` bool — the ONLY `[XmlElement("Internal")]` in the decomp), `PartModel.cs:387` (the gate), `<RayTracing>` enum `{Disabled, Enabled, ShadowProxy}`, `<ShadowCaster>` bool                                                                                                                                                                                                    | `<PartModel><Internal>true</Internal><RayTracing>…</RayTracing></PartModel>`                  |
| IVA seats                 | `IVASeat.cs` (`IVASeatTemplate : TemplateDataBase`; three `Vector3Reference` fields + `CreateComponents`), `IVAController.cs` (fixed-position free-look camera, the two view clamps, seat cycling), `Camera.cs:190-196` (`LookAtRotation` — orthonormalises), `Input.cs:337-339` (`C` = `IVASwitchToNextSeat`, `Shift+C` = `CameraMode`), `AttachedInternal.cs` (Core's interior-prefab indirection flexo skips) | `<IVASeat><Position X Y Z/><ForwardAxis X Y Z/><UpAxis X Y Z/></IVASeat>` on `<PartGameData>` |
| Coordinate basis          | `Double3Ex.cs` (`Up=(0,1,0)`, `Right=(1,0,0)`, `Forward=(0,0,-1)`), `QuaternionEx.cs` (`CreateFromXyzRadians`)                                                                                                                                                                                                                                                                                                   | —                                                                                             |

## The contract — what flexo bakes in

**Connectors**

- `<Connector Id>` with nested `<Transform>` + optional `<Flags>` text (`", "`-joined subset of `Internal`/`ToSurface`/`FromSurface`; empty ⇒ omit ⇒ connect-to-anything). Matches enum `{Internal=1, ToSurface=2, FromSurface=4}`.
- Flag semantics (`docs/ksa-part-connector-notes.md`, still implemented in `VehicleEditor.cs`): `Internal` — two Internal connectors can't mate (with ConnectorTyping on); `ToSurface` — unidirectional, attaches _to_ a surface; `FromSurface` — others attach _from their surface_ to this (radial decoupler).
- Connector "facing" is visualized as **local +X** (a flexo editor convention; the game mates by the full `Transform`, and as of 4750 snaps off the part's **+Z** bounding face — not a connector axis).

**Coordinate transform + `?debug=dockingport`**

- KSA and three.js share basis: RH, Y-up, **−Z-forward**, meters → position & scale applied directly, no swap/flip (verified `Double3Ex.cs`).
- Rotation: KSA stores Euler "XYZ" radians but composes opposite to three.js `'XYZ'`; numerically **bit-for-bit three.js `'ZYX'`** (`EULER_ORDER='ZYX'`, reproduced from `QuaternionEx.CreateFromXyzRadians`).
- Calibration renders `CoreCouplingAAssets.xml` part `CoreCouplingA_Prefab_DockingPort1WA` (the **Assets** geometry file — _not_ the GameData file) → correct ⇒ radially-symmetric port.

**`<IVASeat>` — interior camera vantage points (MODELED)**

`IVASeatTemplate` (`decomp/KSA/IVASeat.cs`) is a `ModuleBase.TemplateDataBase` subclass like
`<Collider>`/`<Tank>`/`<Light>`, so it lives in `PartTemplate.Components` and is a legal direct
child of `<PartGameData>`. Its ENTIRE authored schema is three vectors:

```xml
<IVASeat>
    <Position X="-0.45" Y="0.42" Z="-0.35" />
    <ForwardAxis X="1" />
    <UpAxis Z="-1" />
</IVASeat>
```

- **Schema.** `<Position>` / `<ForwardAxis>` / `<UpAxis>`, each a `Vector3Reference` with `X`/`Y`/`Z`
  **double** attributes. `<Position>` is the eye point **in the owning Part's assembly frame**,
  meters — the identical space flexo already places SubParts, connectors and colliders in
  (`IVAController.cs:40-41` → `Part.PositionVehicleAsmbOffset`). `<IVASeat Id>` exists
  (`TemplateDataBase.Id`) but **flexo emits none**: Core authors none, nothing references a seat by
  id, and that id shares the namespace `<FeedsFrom Container="…">` resolves against
  (`PartTemplate.AddResolvedFeed`) — see [plumbing-and-feeds.md](plumbing-and-feeds.md).
- ⚠️ **Element-absent and attribute-absent are DIFFERENT defaults.** An entirely **absent element**
  takes the C# field initializer — `ForwardAxisAsmb = (1,0,0)`, `UpAxisAsmb = (0,0,-1)`
  (`IVASeat.cs:9-27`). A **present** element defaults each missing **attribute** to `0`, so a bare
  `<ForwardAxis/>` is a **zero look direction** that NaNs the camera. That trap is why flexo's
  serializer always writes all three axes of all three elements (`buildVec3Attrs`, never the
  "omit at default" `buildEngineVec3` style) and why the parser branches on element presence
  (`ivaSeatsFromElement`).
- **Orientation is stored as a rotation, converted at the XML boundary.** KSA has no rotation
  element; flexo keeps a normal `Transform.rotation` so a seat can ride the same gizmo as
  everything else, and `src/ksa/ivaSeatAxes.ts` converts both ways. Local **+X = forward, −Z = up**,
  chosen to equal KSA's own field defaults ⇒ **identity rotation emits `ForwardAxis X="1"` +
  `UpAxis Z="-1"`, byte-identical to Core**. `scale` is unused (KSA has no seat size) and never
  emitted. A degenerate authored pair (either vector ~zero, or the two parallel) is **DROPPED on
  import with a console warning** — `Camera.LookAtRotation` would build a NaN rotation from it, so
  round-tripping it would only preserve a broken seat.
- **The game orthonormalises, so `<UpAxis>` need not be perpendicular** — only non-parallel.
  `Camera.LookAtRotation` (`Camera.cs:190-196`) does `f = Normalize(forward)`,
  `r = Cross(f, up).Normalized()`, `u = Cross(r, f).Normalized()` and builds the view basis from
  rows `r, u, −f`. flexo re-orthogonalises identically, so a sloppy authored `<UpAxis>` round-trips
  **textually changed, semantically identical**.
- 🔒 **Two view clamps, applied EVERY frame** (`IVAController.cs:69-112`) — this is what makes
  `<ForwardAxis>` an authoring decision, not a cosmetic initial heading:
  1. **Forward hemisphere.** `num2 = clamp(dot(look, ForwardAxis.Normalized()), -1, 1)`; when
     `num2 < 0` the look is rotated back to exactly 90° off the forward axis. ⇒ **you can never look
     more than 90° away from `<ForwardAxis>`**; a seat cannot look behind itself. Two directions ⇒
     two seats.
  2. **Up-pole exclusion.** `value = dot(look, UpAxisAsmb…)` — the up axis is **NOT normalized
     here** — and `|value| > 0.9` pushes the look back to `acos(0.9) ≈ 25.84°` off the pole. ⇒ the
     pitch stops ~25.8° short of straight up/down, **measured against the RAW `<UpAxis>`**, so a
     non-unit `<UpAxis>` silently changes the usable pitch (see the gotchas). flexo always emits
     unit axes (`seatAxesFromRotation` normalises by construction).
- **Document order IS cycle order, and the FIRST seat is the one IVA opens on.**
  `IVAController.OnSwitchOn` sets `Seat = span[0]` over `vehicle.Parts.Modules.Get<IVASeat>()`, and
  `Module<T>.List.Add` appends. Seat order is therefore authored data, which is why flexo preserves
  document order everywhere (`EditingPart.ivaSeats`, codec key `iv`) and re-numbers `_seatN` over the
  merged list rather than sorting it.
- **`<IVASeat>` is the on/off switch for the whole camera mode.** A vehicle offers IVA **iff at least
  one part in it carries at least one seat**; with zero seats `OnSwitchOn` calls
  `NextCameraMode()` and the mode is silently skipped (`IVAController.cs:164-169`). The seat list is
  **vehicle-wide** — seats from several parts concatenate. **Shift+C** cycles camera modes
  `Orbit → Free → IVA → Orbit` (`Viewport.NextCameraMode`, `Input.cs:339`) and **C** cycles seats
  (`InputAction.IVASwitchToNextSeat`, `Input.cs:337`). No `<Control/>`, `<EVADoor>`, tank, collider
  or crew model is required — a bare part with one `<IVASeat>` is a valid IVA part.
- **Four schema-legal authoring sites, two of them modeled.** `XmlHelper.cs:33-44` registers every
  `TemplateDataBase` element name against `PartTemplate.Components`, and
  `PartGameDataReference.OnDataLoad` → `PartTemplate.ApplyGameData` ends with
  `Components.AddRange(gameData.Components)` (`PartTemplate.cs:312`) — an **additive merge, no
  dedupe** — so geometry `<Part><IVASeat>` and `<PartGameData><IVASeat>` are exactly equivalent.
  flexo **reads both and normalises everything into `<PartGameData>`** (the same decision colliders
  made). The SubPart-level pair (`<SubPart>` / `<SubPartGameData>`) is **deliberately left on the
  passthrough** — `'IVASeat'` is in `KNOWN_PART_GAMEDATA_CHILDREN` only, so a SubPart-level seat
  round-trips verbatim, just not editable.
- **flexo authors `<IVASeat>` on its own `<PartGameData>` and does NOT copy Core's
  `<AttachedInternal InstanceOf=…>` indirection.** Core's only shipped seats live in
  `Content/Core/CoreIVASpaceAGameData.xml:18-28` (two seats, the Gemini-style capsule interior,
  `<EditorTag Value="Hidden"/>`), and `CoreCommandAGameData.xml:11` attaches that interior to the
  capsule with `<AttachedInternal InstanceOf="CoreIVASpaceA_Prefab_MediumCapsuleA"/>`, which the
  vehicle editor instantiates as a real child Part (`AttachedInternal.cs`,
  `VehicleEditor.cs:5186-5210`). flexo edits exactly one Part, so the reuse that buys is not a flexo
  workflow — and authoring directly means the seat frame **is** the part frame, with no
  `AttachedInternal` `<Transform>` to compose. An imported part's `<AttachedInternal>` round-trips
  verbatim on the `<PartGameData>` passthrough; flexo does not follow the reference.

**The seat preview — flexo's stand-in for a preview the game does not have**

The KSA vehicle editor has **no IVA mode** (gotcha 10), so flexo ships one: "Sit in this seat"
puts the editor camera at the eye point and free-looks under the game's own clamps. What is
ported, and what is deliberately not:

- **Faithful:** the eye position (the Part assembly frame, applied directly), **both view
  clamps verbatim** (`ivaLook.ts` ← `IVAController.OnFrame:80-108`), and the **50° vertical
  FOV** (`Camera.cs:51` `_fovRadians = 0.87266463f`; `GameSettings.FieldOfView = 50`) — which
  flexo's editor camera already used, so nothing had to change.
- ⚠️ **`clampSeatLook` is applied ONCE per update, like one game frame — it is NOT iterated to
  a fixed point, and for a non-unit `<UpAxis>` it is not idempotent.** With `|up| = 2` the
  exclusion cone widens to `acos(0.45) ≈ 63°` and `safeAcos(value)` saturates, so a single
  application under-corrects; the game converges only because `OnFrame` re-runs it every
  frame. Faithful to the C#, and unreachable from flexo-authored data (flexo always emits unit
  axes) — only hand-authored game XML gets there.
- ⚠️ **Clamp 1 is not re-checked after clamp 2**, even though clamp 2 can push the look back
  out of the forward hemisphere. The C# does not re-test; neither does the port. Do not "fix"
  either of these — they are the contract.
- **Not simulated:** KSA's 3-sample mouse smoothing and `LookSensitivity` (cosmetic), the
  Alt-to-release-cursor behaviour, and — the one that matters — **the `<Internal>` render
  gate**. flexo draws every SubPart, interior or not, so the preview shows the hull from inside
  as well. That is more informative while authoring but is NOT the game view; the UI says so,
  and the `$hideInterior` view toggle is the separate control that previews the outside-IVA
  gate.

**`<Internal>` — interior-only geometry and export variants**

- KSA render gate — `PartModel.cs:387`:
  `Template.RayTracing != ShadowProxy && (!Template.Internal || viewport.Mode == IVA)`.
  Read it carefully — IVA shows **both** the Internal models and everything else; outside IVA the
  Internal ones drop out. So `<Internal>` means **"interior-only"**, not "the interior layer".
- ⚠️ **`<Internal>` exists ONLY on `<PartModel>`** — exactly one `[XmlElement("Internal")]` in the
  whole decomp, `PartModelModule.cs:35`. `<PartModelGlass>` (`PartModelGlassModule`) has only
  `<Mesh>`/`<Material>`/`<RayTracing>` (a **bool** there, not the enum)/`<ShadowCaster>`, and
  `<PartModelDynamic>` has none either ⇒ **KSA glass and dynamic models can never be interior-only.**
- **flexo models it as user data, per SubPart TEMPLATE.** `EditingPart.internalFlags` (keyed by
  SubPart template id, persisted as codec key `ifl`), resolved by
  `resolveInternal(part, templateId, entry)` = explicit user flag > the catalogued built-in's own
  `<Internal>` > `false`. It is per-template and never per-placement, because KSA puts the flag on
  the template's `<PartModel>`. The bulk toggle is "Interior (IVA only)" in the SubPart list /
  multi-select toolbar (`setPlacementsInternal`), disabled for glass-exporting meshes.
- **The automatic interior-prop rewrite is GONE.** flexo used to re-home **every** placed Internal
  built-in SubPart onto a suffixed variant that stripped `<Internal>` + `<RayTracing>` so the prop
  rendered everywhere — a decision the user never got to make, and exactly wrong for anyone building
  a real interior. A variant is now minted **only** when flexo actually changes something
  (`buildExportVariantMap`): the template carries **SubPart GameData** (a `<Light>`, tank, … or a
  SubPart-owned `<Collider>` — emitting either under the shared built-in id would MERGE onto the
  built-in template globally), **or** its wanted `<Internal>` **differs from the built-in's own**.
  An untouched interior prop now produces **no redeclaration at all** and keeps the built-in's own
  flags for free. The old interior-prop suffix is deleted — **one** naming rule,
  `flexo_<base>_<id>`, for every variant.
- **A variant inherits NOTHING but the `<Mesh>`/`<Material>` it names**, so `ReferenceSubPartPlan`
  carries `<Internal>`, `<RayTracing>` (raw token, verbatim) and `<ShadowCaster>` forward from the
  catalogued built-in, plus the built-in `<SubPart>`'s own geometry `<Collider>`s. Dropping
  `<RayTracing>` turned a `ShadowProxy` occluder into a **visible** mesh; dropping `<ShadowCaster>`
  made a built-in's explicit `false` (Core's medium-capsule windows) start casting shadows. Element
  order mirrors Core: `Internal, Mesh, Material, RayTracing, ShadowCaster`. `<ShadowCaster>` is
  **not** part of the minting gate — flexo never lets the user edit it, so it can only ever be
  carried along, never a reason to redeclare.
- 🔒 **The fresh `<PartModel Id>` rule is UNCHANGED and still load-bearing.** A variant's PartModel
  id is `<variantSubPartId>_Model`; reusing the built-in's `"<orig>_Model"` would collapse the
  variant back onto the original via KSA's PartModel dedup by `Template.Id`, dragging the built-in's
  own `<Internal>`/`<RayTracing>` back with it and silently undoing the redeclaration.
- **A custom (flexo-authored) mesh needs no variant** — `assetsXmlSerializer` declares it directly
  and emits `<Internal>true</Internal>` inside its own `<PartModel>` when `resolveInternal` says so
  (`AssetsSubPartPlan.internal`). Never on the glass path: `internal` is forced `false` for a glass
  SubPart, and a layered `glassGlow` visor counts as glass **whole**.

**Vehicle reference orientation (root part = the flight-computer "up")**

flexo edits parts, not vehicles, so it never computes this — but it is the contract behind "which way
is up" for any **control / root-eligible** part flexo emits. Verified 4750; full trace in
[analysis/HOW_UP_WORKS.md](../analysis/HOW_UP_WORKS.md).

- The flight computer aims the vehicle **Body-frame +X** (nose/forward) at every auto-point mode
  (`Up`=local zenith, `Forward`=surface velocity, `Prograde`, `RadialOut`, … —
  `FlightComputer.UpdateAttitudeTrackError` uses `double3.UnitX.Transform(...)`); **+Z** is the roll
  reference (`RollMode`). This is the **same +X-forward convention** flexo already draws for connector
  facing (above).
- **Body frame == Assembly (editor) frame** (`Vehicle.cs` `Asmb2Cce => Body2Cce`), and at launch the
  **root part is pinned to identity** in that frame — its editor orientation is folded into the
  vehicle's world attitude (`VehicleEditor.cs` ~`:845`). ⇒ **the root part's local axes ARE the
  vehicle reference axes; root-local +X = the ship's forward/up.**
- `<Control/>` does **NOT** set this. `Control`/`ControlTemplate` are empty markers (`Control.cs`);
  `Vehicle.IsControllable` = _any_ `Control` module present, anywhere in the tree. There is **no
  control-point / "control-from-here" / reference-transform** in 4750 — the orientation reference is
  always the root part, regardless of where the `Control` marker lives.
- **Root-eligibility contract** (`VehicleEditor.IsAllowedAsRootPart`): a part may be root iff it has
  (a) an editor tag flagged `RootPartWhitelist` (Core: `Capsules`, `Engines`, `Fuel Tanks`,
  `Coupling`, `Structural`, `Interstage`, `Cargo`), (b) **≥1 connector**, and (c) **no**
  `ToSurface`/`FromSurface` connector (stack nodes only).

**flexo implication:** none today (flexo does no vehicle assembly). If flexo ever generates a
control/reference part, author its **local +X toward the intended forward/up**, and give it a stack
connector + a root-whitelisted `<EditorTag>` so it can serve as the anchor. A _passive_
"attach-it-to-reorient-up" part is **impossible data-only** (no control point) — "up" only ever
follows the root part.

## Known gotchas

- `EULER_ORDER` is the single calibration knob — change it only in `coords.ts`; everything routes through it. Single-axis rotations look right under either order, masking a wrong order until a multi-axis part scrambles. `ivaSeatAxes.ts` is its **second** consumer (its own `ksaQuatFromEulerXyz` + `'ZYX'` extraction), cross-checked against `coords.ts` by `ivaSeatAxes.test.ts`.
- An export variant must use a **fresh PartModel Id** (reusing one silently collides via KSA's dedup by `Template.Id`).
- Connector `<Flags>` must be emitted in BOTH the Part and GameData documents.

**`<IVASeat>` gotchas** (author these into any future UI, docs and validator):

1. **`ForwardAxis` ∥ `UpAxis` ⇒ NaN camera.** `LookAtRotation` does `Cross(f, up).Normalized()`; a zero cross product normalises to NaN and poisons `Camera.LocalRotation`. flexo drops such a pair on import; the editor cannot construct one (`rotation` is the source of truth).
2. **A zero `ForwardAxis` or `UpAxis` ⇒ NaN camera** (same path, plus `Normalize(forward)`). Remember a **present but empty** `<ForwardAxis/>` is zero — see the element-vs-attribute default trap above.
3. **A non-unit `UpAxis` silently changes the pitch clamp.** The up-pole test `|dot(look, UpAxisAsmb)| > 0.9` uses the **raw, un-normalized** vector (`IVAController.cs:95-96`). With `|up| = 2` the clamp engages at `acos(0.45) ≈ 63°` (usable pitch shrinks to ±27°); with `|up| = 0.5` it never engages and the look can reach the pole, where `Cross(f, up)` degenerates → NaN. Core authors unit axes; flexo always emits unit axes.
4. **You can never look more than 90° off `ForwardAxis`.** A seat is a hemisphere, not a free-look sphere. Two directions ⇒ two seats.
5. **The first seat is the default seat and document order is cycle order** — seat order is authored data, not an implementation detail.
6. **The interior must be `<Internal>`**, or it renders in the exterior view too — and **glass cannot be** (`<PartModelGlass>` has no such field), so a window pane always renders in every camera mode.
7. **You are inside your own exterior hull, and KSA culls back faces unconditionally** (contract #15 in [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md)), so from a seat the hull is simply **not there** — an IVA part needs real interior geometry or the seat looks straight out at space.
8. **Interior geometry with no seat anywhere in the vehicle is invisible in EVERY camera mode** — `<Internal>` hides it outside IVA, and with no seat the IVA mode is never offered. This is the failure mode the deleted automatic rewrite used to mask.
9. **`<IVASeat Id>` shares the feed-container id namespace** (`PartTemplate.AddResolvedFeed` scans every `Components[].Id`). flexo emits no `Id`, matching Core byte-for-byte and dodging it entirely.
10. **There is no in-game editor IVA preview.** The KSA vehicle editor has no IVA mode; the only in-game check is launch → **Shift+C** twice → **C** to cycle. This is why flexo ships its own seat preview (above) — and why that preview's honest limits matter.

## What changed in 5018

Three deltas, two of them BREAKING and both now fixed. Full treatment of the capability
system lives in [plumbing-and-feeds.md](plumbing-and-feeds.md); this is the connector-side
summary.

### `<Capabilities>` — a new element on every `<Connector>` (rev 4992) — was DATA-LOSS

```xml
<Connector Id="_connector17"><Capabilities>BulkFluid</Capabilities></Connector>
```

`Part.Connector.TemplateBase.Capabilities` (`[XmlElement("Capabilities")]`,
`ConnectorCapabilityFlags : byte { None=0, BulkFluid=1, SolidMotorCase=2, NoElectricity=4,
NoServiceFluid=8, DecouplerJoint=0x10 }`) decides what may FLOW across the connector — a
completely independent axis from `<Flags>` (which is about how the editor ORIENTS the part
when connecting). A connection carries a resource only when both endpoints declare it
(`Part.Connection.HasCapabilities` → `ConnectorCapabilityExtensions.Intersect`).

`<Connector>` is a MODELED element in both documents, so it never rode the GameData
passthrough: before the fix, importing a Core fuel tank / decoupler / SRB segment and
re-exporting **silently stripped** its capabilities. Now modeled as
`Connector.capabilities`, parsed from and emitted into BOTH documents through one shared
helper (KSA merges them with `|=` in `PartTemplate.ApplyGameData`, so emitting both is
idempotent). **An empty list is not "nothing"** — it is KSA's implicit
`Electricity | ServiceFluid`, and the two `No…` tokens are INVERTED at load by
`ConnectorCapabilityExtensions.ToCapability()`.

### Decoupler joints moved onto the connector (rev 5007) — BREAKING

`_decouplerConnections` is gone; a decoupler's connector must now declare the
`DecouplerJoint` capability, and Core authors it on every decoupler connector alongside the
existing `<Decoupler ConnectorId=… Force=…/>`. A flexo-exported decoupler that carries only
the `<Decoupler>` element no longer forms a joint. Both halves round-trip now.

### The `[Flags]` separator was wrong in BOTH directions — BREAKING (pre-existing)

flexo emitted `<Flags>Internal, ToSurface</Flags>`. KSA deserializes with .NET's
`XmlSerializer`, whose `XmlSerializationReader.ToEnum` splits a `[Flags]` enum body with
`value.Split(null)` — **whitespace** — and throws `CreateUnknownConstantException` on any
unrecognized token, so the comma form yields `"Internal,"` and **fails the mod load
outright**. Symmetrically, flexo's parser split on `,` only and could not read a
KSA-authored `"Internal ToSurface"`. Core only ever authors single-token bodies, which is
why this stayed latent until `<Capabilities>` doubled the exposure. flexo now **emits**
whitespace-separated bodies in both documents and **accepts** either on the way in.

### Surface-attach preference (rev 5018) — behavioral, no schema

`Part.UnambiguousSurfaceMount()` + `Connection.ConnectSurfaceMount`: a surface mount now
prefers the part's single unconnected `ToSurface` connector. No XML change — but it does
mean which connector a surface mount picks is now decided by how many `ToSurface`
connectors are free, worth knowing when authoring multi-mount prefabs.

## What changed in 4980

**INTACT — no flexo change.** The contract anchors held through a noisy vehicle-runtime update:

- **`Part.Connector.ConnectAndMerge` rewritten** (rev 4950 "insidious frame errors" fix +
  rev 4944/4945 `recomputeDerivedData` plumbing). The mate contract is unchanged — connectors
  still join anti-parallel via the same 180° flip
  (`doubleQuat.CreateFromAxisAngle(double3.UnitZ, Math.PI)`); the rewrite re-derives the child
  tree's transform purely from the two connectors' `Asmb2VehicleAsmb` frames, fixing the case
  where the receiving part isn't at vehicle identity. flexo does its own three.js snap math and
  never ported this body — no drift on our side.
- **Root-identity pin consolidated, not removed.** The ~4 inline
  `Root.Asmb2ParentAsmb = doubleQuat.Identity` copies in `VehicleEditor.cs` moved to
  `PartTree.SetRootPose(...)` / `PartTree.NormalizeRootRotation()` (which pins to
  `doubleQuat.Identity`); `VehicleEditor` calls it at 3 sites. **Up-follows-root holds**, even
  with the new multi-vehicle editor ("Switch Vehicle" / "Make Vehicle Root", rev 4972).
- **`Control` is still an empty template marker.** `ControlTemplate.cs` is absent from the diff;
  the runtime `Control` module gained `VehicleName` + a nested `SaveData`
  (`[XmlType("ControlData")]`, `[XmlAttribute("VehicleName")]`, rev 4950 undock naming) —
  **vehicle-save state only**, never part XML. Grep for
  `controlpoint|control from here|referencetransform` still empty.
- **`FlightComputer.UpdateAttitudeTrackError` untouched** — still aims **Body +X**, rolls
  **+Z**. Runtime-only deltas: `RollMode` default `Up`→`Decoupled` (starts in "ANY", rev 4978)
  and a new `RCSMode` toggle (`FlightComputerData` gains `<RCSMode>` — save schema, not ours).
- **`DockingPort` save schema reshaped** (`OldVehicleName` attr → `PreDockRootLocalId` +
  `<PreDockRootTransform>`, `SerializePreDockRecords`) — vehicle-save only;
  `DockingPortTemplate.cs` untouched.
- `QuaternionEx.cs` / `Double3Ex.cs` / `PartModel.cs` / `PartModelModule.cs` absent from the
  diff; `<Internal>`/`<RayTracing>` IVA gate unchanged (shipped IVA XML byte-identical).

## What changed in 4939

**INTACT — no flexo change.** `QuaternionEx.cs`, `Double3Ex.cs`, `Control.cs`,
`ControlTemplate.cs`, `FlightComputer.cs`, and `DockingPortTemplate.cs` are absent from the
4892→4939 diff; `VehicleEditor.cs` still pins the root to identity
(`Root.Asmb2ParentAsmb = doubleQuat.Identity` — rev 4904 was a refactor plus fuel-line UI);
grep for `controlpoint|control from here|referencetransform` still empty, so the
reference-orientation contract (aim **Body +X**, roll **+Z**, up-follows-root) holds. Connector
schema: `[XmlElement("Flags")]` and `[XmlElement("Sibling")]` unchanged on
`Part.Connector.TemplateBase` — but rev 4929 moved Core's sibling CONTENT to GameData-level
`<SymmetryGroup>` (expanded into `SymmetrySiblings` at load, unknown connector ids skipped), so
shipped Assets XML now authors zero `<Sibling>` elements; flexo's `siblingIds` emit remains
valid schema. See
[part-and-subpart-xml.md](part-and-subpart-xml.md#what-changed-in-4939).

## What changed in 4892

**INTACT — no flexo change.** `QuaternionEx.cs`, `Double3Ex.cs`, `Control.cs`,
`ControlTemplate.cs`, `DockingPortTemplate.cs`, `DecouplerTemplate.cs`, `PartModel.cs` all
byte-identical; `Part.Connector` `Flag` enum + `<Flags>`/`<Sibling>` schema unchanged (the
runtime-only `Connector.Blocked` obstruction concept from 4826 was removed again);
`PartModelModule` template (`<Mesh>/<Material>/<RayTracing>/<ShadowCaster>/<Internal>`)
unchanged — only two new runtime selection-flag bits. Reference-orientation contract
re-verified: `VehicleEditor` still folds the root's editor rotation into the world attitude and
pins `Parts.Root.Asmb2ParentAsmb = Identity` at launch; `FlightComputer.UpdateAttitudeTrackError`
still aims **Body +X** / rolls **+Z**; no ControlPoint/reference-transform concept appeared
(grep-clean). Rev 4876's "axes gizmo ASMB frame" is a **display-only** camera nav-ball (its +X
handle = top view — the game itself confirming +X-up) plus a new ASMB/Local manipulation-gizmo
toggle. The new fuel-line system (`FuelLink*`, rev 4882) persists as `<FuelLink PartA PartB Flow
Enabled>` in **vehicle saves** (`VehicleSaveData`) with uint instance ids — nothing lands in
Part/SubPart templates or GameData, so it is NOT a flexo surface.

## What changed in 4826

- **New connector attach-node grouping = the game's new part-symmetry system.** KSA 2026.7 added `<Sibling>` (geometry connector) + `<Aligned>` (GameData) to the multi-mount adapter prefabs (engine plates, interstage bridges, radial fuel-tank clusters). Decomp-confirmed (4750 → 4826):
  - **`<Sibling Id="_connectorN"/>`** — decomp: `Part.Connector.TemplateBase.SymmetrySiblings` = `[XmlElement("Sibling")] List<ConnectorReference>` (`ConnectorReference` = `[XmlAttribute("Id")]`). A child of the geometry `<Part>`'s `<Connector>`, listing its symmetry group-mates. flexo parses connectors (`connectorsFromPartElement`) and re-emits them (`buildConnectorElement`) with **no passthrough on connector children**, so it dropped `<Sibling>` on round-trip. **Fixed:** `Connector.siblingIds[]` (parse/emit); on import + project-paste the ids are **remapped through the regenerated-connector id map** (dropping refs outside the imported set) so they never dangle; intra-part duplicate/stamp carry them as-is (same id space). Persisted as codec `sb`. Regression: `partXmlParser.test.ts` "`<Sibling>` attach-node grouping".
  - **`<Aligned><ConnectorRef Id/></Aligned>`** — decomp: `PartTemplate.Aligned` = `[XmlElement("Aligned")] List<Part.AlignedConnectors.AlignedConnectorsRef>` (`AlignedConnectorsRef` = `[XmlElement("ConnectorRef")] List<ConnectorReference>`). A modeled child of `<PartGameData>`, but **not** in flexo's `KNOWN_PART_GAMEDATA_CHILDREN`, so the gap-6 `RawXmlNode` passthrough captures + re-emits it. Verbatim re-emit alone was a bug: imports regenerate `_connectorN` ids, so the raw `<ConnectorRef>`s went stale (or collided with a pre-existing connector). **Fixed:** `remapRawConnectorRefs` (partXmlParser.ts) rewrites `ConnectorRef`/`Sibling` `Id`s inside preserved raw XML (any depth — also covers `<SymmetryGroup>`) through the regenerated-connector id map in both import paths (`applyImportedGameData` in editorStore.ts, `mergeGameData` in projectTransfer.ts); unmapped ids stay verbatim. Locked by `partXmlParser.test.ts` "`<Aligned>` connector groups verbatim" + "remapRawConnectorRefs…", `editorStore.test.ts` / `projectTransfer.test.ts` "rewrites `<ConnectorRef>`s…".
  - The runtime `PartSymmetryInstance`/`SymmetryLayerInstance`/`SymmetryData`/`Part.SymmetryLink` classes (Part.cs `SaveSymmetryLinks`/`RestoreSymmetryLinks`, `PartInstance.Symmetry`) are **vehicle-assembly / save-file state — outside flexo's part-template scope**; only the connector-level template hints above reach flexo.
- **Reference-orientation contract unchanged (decomp-verified 4826):** still no `ControlPoint` / "control-from-here" / reference-transform; `Control`/`ControlTemplate` are still empty markers; the vehicle's "up" still follows the root part. `Double3Ex.cs`/`QuaternionEx.cs`/`PartModel.cs`/`PartModelModule.cs` unchanged → `EULER_ORDER='ZYX'` + IVA gate still valid.

## What changed in 4750

- 🔴 **DockingPort GameData schema (BREAKING)** — attribute-form → child-element form, renamed fields, impulse→energy units. Detail + fix in [gamedata-modules.md](gamedata-modules.md). NB: this is **GameData** (`CoreCouplingAGameData.xml`); the coordinate calibration renders the **Assets** geometry file, which is byte-identical, so calibration is unaffected.
- 🟡 **Face-snapping rewrite (SCHEMA-DRIFT, docs only).** `VehicleEditor` face-snapping is now **data-driven** via `EditorTagDefinition` booleans (`FaceSnapBlacklist`/`RootPartWhitelist`/`FaceSnapTargetWhitelist`/`FaceSnapTargetBlacklist`/`DiameterFilterlist`/`NotaCategory`); the built-in `EditorTag` statics `NoFaceSnapping`/`Tanks`/`Coupling`/`Structural` were **removed** from `EditorTag.cs` (now data-driven via `RegisterTag`). Snapping now uses the moving part's **+Z** bounding face (rev 4687/4719/4739). **Connector flag schema + `<Connector>/<Flags>` are unchanged → export is safe.** flexo's `editorTags` is freeform passthrough → users can still apply these tags. Action: refresh `docs/ksa-part-connector-notes.md` to note the data-driven model; optionally surface known face-snap tags in the UI.
- ✅ `Double3Ex.cs` + `QuaternionEx.cs` + `CoreCouplingAAssets.xml` zero-diff → `EULER_ORDER='ZYX'` holds, calibration valid.
- ✅ `PartModel.cs` + `PartModelModule.cs` zero-diff → the `<Internal>` IVA render gate valid.
- ✅ `Part.cs` connector change = an in-game assembly-merge position-offset fix (flexo doesn't simulate merging). `Decoupler` schema unchanged (runtime-only diff).
