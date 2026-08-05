# IVA seats

The **interior camera vantage points** of a Part — where the player's eye goes when they
switch to KSA's IVA (interior view) camera, which way it looks, and which way is up. This
doc is the flexo-internal view; the game contract (schema, camera math, the two view clamps,
gotchas) lives in
[scope/connectors-coordinates-iva.md](../scope/connectors-coordinates-iva.md).

> **A vehicle offers the IVA camera mode iff at least one part in it carries at least one
> `<IVASeat>`.** There is no "IVA support" flag, no interior-space registration, no
> `<Control/>` requirement — the element *is* the switch. Everything else about IVA (the
> fixed camera, the free-look limits, the seat cycling) is engine behaviour driven off three
> vectors.

## Document model

`EditingPart.ivaSeats: IvaSeat[]` — a flat top-level list pinned to the built-in **IVA
Seats** layer, following the connector/collider pattern rather than burying numbers in
`gameData`. That buys selection, the transform gizmo, multi-select, copy/paste, the Assets
list, layer visibility/lock/opacity and undo with almost no new machinery.

```ts
interface IvaSeat extends Transform {
  id: string        // "_seat1"; editor-only, NEVER emitted
  layerId: string   // always IVA_SEAT_LAYER_ID
}
```

`Transform` is reused with a deliberate reinterpretation:

- **`position` → `<Position>`** — the **eye point** in the Part's assembly frame, meters.
  Direct, no conversion: the same space a placement, connector or collider lives in.
- **`rotation` → not emitted.** KSA stores orientation as two vectors, `<ForwardAxis>` +
  `<UpAxis>`; flexo stores the equivalent rotation so a seat rides the ordinary gizmo, and
  converts at the XML boundary.
- **`scale` → unused.** KSA has no seat size. `assignIvaSeat` pins it to `(1,1,1)`, so a
  scale-mode gizmo drag is a no-op and the inspector hides the third numeric group entirely.
  The marker's on-screen size is a global view setting, like the connector cube.

### rotation ⇄ (`ForwardAxis`, `UpAxis`)

`src/ksa/ivaSeatAxes.ts` is the single place that knows the mapping — pure, hand-rolled
quaternion/matrix math with **no three.js import**, following the `colliderFit.ts`
precedent.

The seat's local axes are chosen to equal KSA's own schema defaults:

| Local axis | Constant              | Value      | KSA field default        |
| ---------- | --------------------- | ---------- | ------------------------ |
| forward    | `SEAT_LOCAL_FORWARD`  | `(1,0,0)`  | `ForwardAxisAsmb` `+X`   |
| up         | `SEAT_LOCAL_UP`       | `(0,0,-1)` | `UpAxisAsmb` `−Z`        |

So **identity rotation emits `ForwardAxis X="1"` + `UpAxis Z="-1"` — byte-identical to
Core's own authoring**, and Core's two shipped seats are a fixed point of the conversion
(they round-trip to `rotation = (0,0,0)` and back). "Facing = local +X" also matches what
flexo already draws for a connector.

`seatAxesFromRotation(rotation)` builds KSA's quaternion via `ksaQuatFromEulerXyz` (a
verbatim port of `QuaternionEx.CreateFromXyzRadians`) and rotates the two local axes; both
come out **unit length** by construction, which is why flexo can never emit the non-unit
`<UpAxis>` that silently narrows the game's pitch clamp.

`seatRotationFromAxes(forward, up)` is the inverse. It orthonormalises exactly the way
`Camera.LookAtRotation` does, then reads the Euler triple off the basis with three.js's
`'ZYX'` extraction — the **same** `EULER_ORDER` calibration `src/three/coords.ts` uses. It
returns `null` for a degenerate pair (either vector ~zero, or the two parallel), which is
precisely where KSA would build a NaN camera rotation. `ivaSeatAxes.test.ts` cross-checks
the module against `applyPlacement` so the calibration knob stays singular — see
[coordinates.md](coordinates.md).

A non-perpendicular authored `<UpAxis>` round-trips to its orthogonalised equivalent:
textually different, **semantically identical** (the game derives the same camera frame
either way).

### Seat order is authored data

`IVAController.OnSwitchOn` opens on `span[0]` and **C** walks the rest in the order the
elements appear in the XML. So the array order in `EditingPart.ivaSeats` is the in-game
cycle order and **index 0 is the seat IVA opens on** — it is game data, not a list-sorting
convenience. Everything preserves it: the serializer emits in array order, the parser and
catalog merge preserves document order (re-numbering `_seatN` over the merged list), the
codec key `iv` is an ordered array, and `moveIvaSeat(index, delta)` is the user's reorder
control (discrete → one undo step, and the selection follows the seat through the splice).

## XML round-trip

`<IVASeat>` is schema-legal in **four** places (geometry `<Part>`, geometry `<SubPart>`,
`<PartGameData>`, `<SubPartGameData>`). flexo models the two **Part-level** ones — KSA
merges `Components` additively, so they are exactly equivalent — and **normalises everything
into the GameData document**, the same decision colliders made. `'IVASeat'` is in
`KNOWN_PART_GAMEDATA_CHILDREN` only, so a **SubPart-level** seat keeps riding the GameData
passthrough verbatim: round-tripped, just not editable (see *Deliberate limits*).

```xml
<PartGameData Id="...">
    …
    <IVASeat>
        <Position X="-0.45" Y="0.42" Z="-0.35"/>   <!-- eye point, Part assembly frame -->
        <ForwardAxis X="1" Y="0" Z="0"/>           <!-- always all three axes -->
        <UpAxis X="0" Y="0" Z="-1"/>
    </IVASeat>
</PartGameData>
```

Two rules that are not negotiable:

- **Every axis of every element is always emitted.** An absent *element* takes the C# field
  default (`(1,0,0)` / `(0,0,-1)`), but a *present* element defaults each missing
  **attribute** to `0` — so an "omit at default" style would turn `<ForwardAxis X="1"/>` into
  `<ForwardAxis/>`, a zero look direction that NaNs the in-game camera. `buildIvaSeatElement`
  uses `buildVec3Attrs` (shared with the collider frame vectors), never the omit-at-default
  `buildEngineVec3` style, and `ivaSeatsFromElement` branches on element presence on the way
  in. See [xml-io.md](xml-io.md#iva-seats).
- **No `Id` attribute is ever emitted.** Core authors none, nothing references a seat by id,
  and `TemplateDataBase.Id` shares the namespace `<FeedsFrom Container="…">` resolves
  against. Seat ids are regenerated on every import/paste and never leave the editor, so
  nothing needs an `idRemap` entry for them — order is a seat's only in-game identity, and
  order is preserved.

A seat whose authored `<ForwardAxis>`/`<UpAxis>` pair is degenerate is **dropped on import
with a console warning** rather than imported: round-tripping it would only preserve a
broken seat.

`CatalogPart.ivaSeats` gathers both Part-level sources (`parsePartsFile` for the geometry
`<Part>`, `mergeGameData` for the `<PartGameData>` block) and `partImport` carries them into
the document with fresh ids on the IVA Seats layer.

## 3D authoring

`src/three/IvaSeatObject.ts` renders each seat as a small marker, all of it sized off
`$ivaSeatSettings.markerSize` (default **0.12 m**, mirroring the connector cube's 0.125):

| Piece                | Geometry                                   | Reads as                              |
| -------------------- | ------------------------------------------ | ------------------------------------- |
| **Eye sphere**       | sphere at the local origin                 | the vantage point, and the click target |
| **Forward cone**     | cone along local **+X**, flush to the body | the look direction (`<ForwardAxis>`)  |
| **Up stick**         | thin cylinder along local **−Z**, contrasting colour | the roll reference (`<UpAxis>`) |
| **Index badge**      | `CSS2DObject` above the marker             | the 1-based **cycle order**           |
| **Gaze cone** (opt.) | translucent 45° half-angle cone, 1 m       | indicative facing only                |

The up stick is not decoration: without it a seat rolled 90° looks identical to an unrolled
one. The forward cone is built exactly like `ConnectorObject`'s facing arrow so the two
markers read consistently. The gaze cone (`$ivaSeatSettings.showGazeCone`, default **off**)
is deliberately *not* the real limit — the game clamps to a 90° **hemisphere**, which is a
half-space with no readable shape; the exact limits are enforced in the seat view below.

The badge is a `CSS2DObject` on the marker's own group, so it inherits the marker's
visibility, and its offset lives in `CSS2DObject.center` rather than a CSS transform (which
`CSS2DRenderer` overwrites every frame) or a 3D offset (which would swing as the seat is
rolled). `dispose()` unparents it so the element does not stay orphaned in the overlay.

Markers never scale with the document (`setSeat` pins scale to 1); `EditorScene` **rebuilds**
every marker when `$ivaSeatSettings` changes, exactly as it does for connectors.
`reconcileIvaSeats` adds/removes/updates by id and re-calls `setIndex` with the document
index on every pass — that is what renumbers the badges after a reorder.

### Selection and the inspector

Seats are the **fifth** `SelectableKind`, with the same machinery as the other four:
click-select, multi-select across kinds, nudge/rotate/duplicate/delete hotkeys, copy/paste,
the Outliner, and layer visibility/lock/opacity. See
[editor-state.md](editor-state.md) for the store atoms and each mutator's undo enrolment.

`SeatInspector` (`src/ui/build/SeatInspector.tsx`) is where the game contract becomes visible:

- **`Seat N of M`** with ▲/▼ reorder buttons, and an **"IVA opens on this seat"** chip on
  index 0.
- **"Sit in this seat"** → the seat view (below). Allowed even on a locked layer: it moves
  the camera, never the document.
- **"Add kitten at this seat"** → `addKittenAtSeat`, an editor-only body at the seat position
  with the seat's **yaw only** (a kitten stands upright; tilting it to follow a pitched seat
  would put a crew member on their back). The UI says plainly that a kitten's origin is its
  **feet, not its eye point**, so expect to nudge it.
- **Axes (exported)** — a read-only `Forward (…) · Up (…)` readout of
  `seatAxesFromRotation`, through the same `formatG6` the exporter writes, so what you see is
  what ships.
- **Aim** — six axis presets (`+X (nose)`, `−X (tail)`, ±Y, ±Z) plus **"Aim at selection"**.
  A preset **keeps the current up axis** where the new forward leaves it usable, so re-aiming
  never silently rolls the camera; it falls back to a perpendicular default only when the two
  would be parallel. A `null` (degenerate) rotation is simply never written.
- Inline notes: the 90° hemisphere limit, and a warning when the part has no interior
  geometry at all.

"Aim at selection" needs the world-space centroid of the selected placements, which only
exists in the three.js scene — and `src/state` / `src/ui` are deliberately three-free. So the
inspector publishes an intent (`$ivaSeatAimRequest` in `src/state/ivaSeatStore.ts`) that
`EditorScene` consumes, derives the rotation from through `seatRotationFromAxes`, and writes
back with `aimIvaSeat` (which owns the single undo step). Same pattern as
`$colliderFitRequest`.

The Outliner gives the IVA Seats layer its own section: the row **name** is the ordinal
(`Seat 3`), the **sub** line is the derived forward axis (`→ 1, 0, 0`) with `· default`
appended on index 0, and the row menu adds a **Sit in this seat** item. Search matches the
seat id, the row name and `default`.

## Seat view — "sit in this seat"

**KSA's vehicle editor has no IVA preview at all.** The only in-game check is launch →
`Shift+C` twice → `C` to cycle. So this mode is what makes seat authoring possible instead of
guesswork.

State is ephemeral and lives in `src/state/ivaStore.ts` — never persisted, never in undo:

- `$seatView: string | null` — the seat being previewed, keyed by **id, not index**, so
  reordering seats mid-preview (the ▲/▼ buttons stay live) cannot silently move the camera
  into a different seat. A vanished id makes `EditorScene` exit cleanly rather than read a
  stale pose.
- `$seatLook: Vec3 | null` — the **current unit look direction**, not a yaw/pitch accumulator.
  `null` means "not yet resolved" and reads as the seat's forward axis.

  ⚠️ **The state has to be the direction, and this is not a style choice.** KSA's state is the
  camera's own look: `IVAController.OnFrame` applies the mouse delta to the *previously clamped*
  direction and clamps once, so it converges. An implementation that keeps a raw yaw/pitch
  accumulator and re-composes the direction from the seat axes every update feeds `clampSeatLook`
  a fresh far-out direction each time — and a single pass **under-corrects**, so the fixed point
  is never reached. That version measured `dot(look, forward) = −0.23` (≈13° behind the 90°
  hemisphere the game enforces) and `|dot(look, up)| = 0.902`, i.e. it showed the author views the
  game forbids. Feeding the clamped result back in is what makes the preview trustworthy.

`Viewport.enterSeatView(pose)` snapshots the orbit camera, disables `OrbitControls` **and
skips `controls.update()`** (which re-aims at `controls.target` unconditionally, ignoring
`enabled`), and installs pointer handlers that call `nudgeSeatLook`. That applies the delta to
the stored direction — pitch about the camera's right, then yaw about its up, both axes read
*before* the delta, matching `qYaw · qPitch · LocalRotation` in `IVAController.OnFrame:69-78` —
runs `clampSeatLook` **once**, and stores the result. `applySeatCamera` then just points the
camera down the stored direction and sets `camera.position` / `camera.up` / `lookAt`, with a
degenerate-`cross(look, up)` guard that leaves the orientation untouched rather than letting
three.js's 1e-4 epsilon nudge invent an arbitrary roll. `exitSeatView` restores the
camera exactly and removes the handlers; `dispose()` calls it too, so a leaked handler can
never outlive the canvas. While seated, `EditorScene` suppresses the transform gizmo,
click-selection, and **the seat markers themselves** (you are inside the one you sat in).

`src/ksa/ivaLook.ts` is a verbatim port of `IVAController.OnFrame:80-108` — two clamps:

1. **Forward hemisphere** — never more than 90° from `<ForwardAxis>` (compared against the
   **normalized** forward axis).
2. **Up-pole exclusion** — never closer than `acos(0.9) ≈ 25.84°` to `<UpAxis>`, compared
   against the **raw, un-normalized** up axis.

Two behaviours are faithful to the C# and worth knowing before "fixing" them:

- **`clampSeatLook` is not idempotent for a non-unit up axis.** With `|up| = 2` the exclusion
  cone widens to `acos(0.45) ≈ 63°` and `safeAcos` saturates, so a single application
  under-corrects. The game converges only because `OnFrame` re-runs the clamp every frame;
  flexo applies it once per update, exactly like one game frame, and never iterates to a
  fixed point.
- **Clamp 1 is not re-checked after clamp 2**, even though clamp 2 can push the look back out
  of the forward hemisphere. The C# does not re-test, so neither does this.

(flexo always *emits* unit axes, so the non-unit case is only reachable from hand-authored
game XML.)

The status bar's **tool segment** (`src/ui/status/ToolSegment.tsx`) gives prev/next (wrapping,
mirroring `C`), the honesty tooltip, an **Exit** button and `Escape`. Leaving by `Escape` is
**rung 8 of the app's one Escape ladder** (`src/ui/hotkeys/escLadder.ts`; foundation §11.4) —
the last flexo rung, so every other cancel takes the key first. Its v1 contract is preserved
verbatim as the rung's own declaration: `preventDefault: false`, and gated on `$seatView`, so
it never shadows a dialog/popover dismiss.

### What the preview does and does not simulate

| Faithful                                        | Not simulated                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Eye position (the Part assembly frame directly) | KSA's 3-sample mouse smoothing and `LookSensitivity`                          |
| Both view clamps, verbatim                      | The `<Internal>` render gate — flexo draws **every** SubPart, interior or not  |
| 50° vertical FOV (already flexo's camera)       | Alt-to-release-cursor, and everything else about in-game input                 |

So the preview shows **more** than the game's IVA view does: you also see the hull from
inside. That is more informative while authoring, and the bar's info tooltip says so, but it
means the preview cannot tell you whether your interior is actually visible in game — that is
what the `<Internal>` flag and the validation warnings below are for.

## Interior geometry and the `<Internal>` flag

A seat puts the camera somewhere; what you *see* is decided by KSA's render gate
(`PartModel.cs:387`): a model draws unless it is `<Internal>` and the camera is not in IVA.
Read that carefully — **IVA shows both** the interior models and everything else. So
`<Internal>` means *"interior-only"*, not *"the interior layer"*.

**You are inside your own exterior hull, and KSA culls back faces unconditionally**, so from
a seat the hull is simply not there — you look straight out at space. **An IVA part needs
real interior geometry**: custom meshes, or placed `CoreIVASpaceA_*` / `CoreIVAPropA_*`
SubParts, marked interior-only.

flexo models `<Internal>` as plain user data:

- **`EditingPart.internalFlags: Record<string, boolean>`**, keyed by **SubPart template id**.
  Absent ⇒ inherit the template's own value.
- **`resolveInternal(part, templateId, entry)`** (`src/ksa/modExport.ts`) is the single
  resolution rule: explicit user flag → the catalogued built-in's own `<Internal>` → `false`.
- **It is per TEMPLATE, never per placement.** KSA puts the flag on the template's
  `<PartModel>`, so "this chair is interior but that identical chair is not" is not
  representable. `setPlacementsInternal(indices, internal)` therefore writes one value per
  **distinct** template behind the selection (one undo step), and the UI says so.
- **Glass can never be interior-only.** `<PartModelGlass>` has no `<Internal>` field — there
  is exactly one `[XmlElement("Internal")]` in the whole decomp, on `PartModelModule`. The
  toggle is **disabled** for glass-exporting meshes with a tooltip, and `setPlacementsInternal`
  skips them as a backstop (`isGlassTemplate`).

The user-facing control is **Interior (IVA only) ▸ On / Off** in the SubPart row menu and the
multi-select toolbar; a template resolving to interior gets a `· interior` badge on its
Outliner row and in the SubPart browser. See
[importing-models.md](importing-models.md#interior-props-and-the-internal-flag) for the
behaviour change this replaced, and
[custom-assets.md](custom-assets.md) for marking a custom mesh interior.

### Hide interior (view toggle)

`$hideInterior` (**View ▸ Visibility ▸ Hide interior**, persisted as `flexo:hideInterior`,
default **off**) hides every mesh whose resolved `<Internal>` is true, so the workspace shows
the part exactly as the game renders it *outside* IVA. It is a pure view preference — flexo
renders interior meshes normally the rest of the time, which is what you want while authoring
one. It **composes** with layer visibility rather than fighting it: a mesh draws iff its layer
is visible AND the toggle does not hide it, and `applyLayerView` stays the only writer of
`group.visible`.

## Validation

`src/ksa/ivaSeatValidation.ts` grades every problem the way `colliderValidation` does, and
the Export dialog renders them alongside the engine and collider issues. Like those, it is
**advisory** — `ExportDialog` *displays* the issues; **nothing gates the export**.

| Severity  | Code                         | Rule                                                       |
| --------- | ---------------------------- | ---------------------------------------------------------- |
| **block** | `iva-seat-non-finite`        | a seat's position or derived axes are NaN/∞ (NaN camera)   |
| warn      | `iva-seat-duplicate`         | two seats at the identical position **and** orientation — legal, but `C` appears to do nothing |
| warn      | `iva-seat-no-interior`       | seats, but no interior geometry to look at                 |
| warn      | `iva-interior-no-seat`       | interior geometry, but no seat — invisible in **every** camera mode |
| warn      | `iva-interior-on-glass`      | an interior flag on a template that exports as glass (backstop) |
| warn      | `iva-seat-outside-colliders` | the eye point is outside every part-level collider         |
| warn      | `iva-seat-count`             | more than 8 seats — every extra one is another `C` press   |
| warn      | `iva-seat-at-origin`         | a seat still at the default `(0,0,0)`                      |

Only the non-finite rule blocks. The duplicate rule is a **warn** on purpose: it loads fine
in game.

The collider check is **part-level only** — a SubPart-owned collider lives in its template's
local frame and exists once per placement, so testing a Part-frame eye point against those
coordinates raw would compare two different spaces and fire on perfectly good seats. A part
whose hull is entirely SubPart-owned simply gets no check.

There is deliberately **no non-unit-axis or parallel-axis rule**: `rotation` is the source of
truth, the parser drops a degenerate authored pair on import, and `seatAxesFromRotation`
derives a unit, orthogonal pair by construction. The only way a bad pair survives to export
is a non-finite `rotation` — which is the rule that *is* there.

## Layer

Seats live on the built-in, undeletable **IVA Seats** layer (`IVA_SEAT_LAYER_ID = 'ivaSeats'`),
between Colliders and Kittens. Like the other built-in layers it can be hidden, locked and
cleared but not deleted or renamed, and it is never serialized to KSA XML. See
[layers.md](layers.md).

## Persistence

- Seats persist as the ordered codec key **`iv`** and the per-template flags as **`ifl`**;
  both landed in **`PROJECT_EXPORT_VERSION = 7`** (one bump for both halves). Older payloads
  are **rejected, never converted**. A seat's `layerId` is restored from `IVA_SEAT_LAYER_ID`
  on decode and never serialized; its unused `scale` is omitted by the shared transform
  encoder. See [projects.md](projects.md#the-compact-project-codec).
- `$ivaSeatSettings` (`flexo:ivaSeatSettings` — marker size, gaze cone) and `$hideInterior`
  (`flexo:hideInterior`) are persisted **view** settings, outside the document and outside
  undo. See [state-persistence.md](state-persistence.md).
- Everything about the seat *view* (`$seatView`, `$seatLook`) and the aim intent
  (`$ivaSeatAimRequest`) is ephemeral: never persisted, never in undo.

## Deliberate limits

- **Part-level seats only.** `<IVASeat>` is schema-legal on a `<SubPart>`/`<SubPartGameData>`
  too, and such a seat would even follow joint animation — but Core authors none, and it would
  double the frame math (per-placement visuals + write-back inversion). A SubPart-level seat
  on an imported part round-trips **verbatim** through the passthrough; it just isn't editable.
- **No `AttachedInternal` authoring.** Core puts its seats in a separate interior Part and
  references it; flexo authors seats on its own Part, so the seat frame **is** the part frame
  with no offset to compose. An imported `<AttachedInternal>` is preserved verbatim, but flexo
  will not follow the reference to import another Part's seats.
- **The seat `Id` is not round-tripped.** flexo emits none and regenerates `_seatN` in
  document order. Order is the only identity a seat has in-game, and order is preserved.
- **A non-perpendicular authored `<UpAxis>` is re-orthogonalised** — textually lossy,
  semantically lossless.
- **The preview is not the game view** (see the table above).
- **`<Internal>` is per-template, never per-placement** — KSA cannot represent otherwise.
- **Glass can never be interior-only** — `<PartModelGlass>` has no such field. The toggle is
  disabled rather than silently ignored.
- **No crew, no seat geometry, no ergonomics.** A seat is a camera vantage point; KSA has no
  crew model in a part. The kitten aide is an eyeball-it reference, not a measurement.
- **No in-game seat labels.** KSA shows only a generic "IVA Camera" alert on entry; there is
  no per-seat name in the schema, so there is nothing to author.

## Status

All phases of [plans/IVA_PLAN.md](../plans/IVA_PLAN.md) are implemented: `<Internal>` as user
data (deleting the old automatic interior-prop rewrite), the seat contract + round-trip, 3D
authoring, the seat-view preview, and the polish pass (index labels, the Hide-interior
toggle, the kitten-at-seat aide).

**Not yet verified in-game:** anything exported here. The acceptance test is a small
pressurised can — interior geometry marked interior-only plus one seat at eye height looking
at a window — exported as a mod, launched, `Shift+C` twice to reach IVA, `C` to cycle:
confirm the mode is offered at all, the eye lands where flexo showed it, the look limits match
the preview, and a second seat cycles.
