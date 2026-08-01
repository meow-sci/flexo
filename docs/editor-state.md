# Editor State

Framework-agnostic editor state using **nanostores**. No React or three.js imports —
the 3D scene subscribes with vanilla `subscribe()`, React reads via
`useStore()` (`@nanostores/react`). Mirrors space-tape's `PartEditorController`.

## Stores — `src/state/editorStore.ts`

| Atom | Type | Meaning |
|---|---|---|
| `$part` | `EditingPart` | The whole part: `partId`, `editorTags`, `gameData` (display name, mass, tanks, power, coupling — the popup-only metadata with no 3D form), `layers[]`, `placements[]`, `connectors[]`, `colliders[]` (each carries a `layerId` naming an ordinary layer; connector `flags` is a `ConnectorFlag[]`). Treated as **immutable** — every mutation replaces it with a fresh object (so subscribers fire). |
| `$selectedIndices` / `$selectedIndex` | `number[]` / `number` | SubPart selection (multi); `$selectedIndex` is the primary (last) one or `-1`. |
| `$selectedConnectorIndex` | `number` | Selected connector, or `-1`. Mutually exclusive with SubPart selection. |
| `$selectedColliderIndices` / `$selectedColliderIndex` | `number[]` / `number` | Collider selection — the **fourth** `SelectableKind`, alongside subpart/connector/kitten. Mutually exclusive under the single-kind setters, but `setSelection` / `toggleEntity` can span all five (the Assets list's cross-kind multi-select). |
| `$selectedIvaSeatIndices` / `$selectedIvaSeatIndex` | `number[]` / `number` | IVA seat selection — the **fifth** `SelectableKind` (`'ivaSeat'`), same shape as the collider pair: clamped when the document shrinks, cleared by every other kind's single-kind setter, and carried by `setSelection` / `toggleEntity` / `selectedTransformRefs`. See [iva-seats.md](./iva-seats.md). |
| `$selectedLightIndices` / `$selectedLightIndex` | `number[]` / `number` | Light selection — the **sixth** `SelectableKind` (`'light'`), same shape again. See [lights.md](./lights.md). |
| `$lightEditContext` | `Record<string, number>` | Per light id, **which placement of its owner template** was last clicked. Ephemeral (not persisted, not undone). One atom, so the gizmo's write-back frame and the inspector's part-frame fields can never disagree about which instance an edit converts through. |
| `$activeLayerId` | `string` | Layer new items land in. Ephemeral (not persisted, not undone); clamped to a live layer. See [layers.md](./layers.md). |
| `$toolMode` | `'translate'\|'rotate'\|'scale'` | Drives the 3D gizmo. |
| `$snap` | `{ translate?, rotateDeg? }` | Grid / rotation snap (0/undefined = off). |
| `$canUndo` / `$canRedo` | `boolean` | For toolbar button enablement. |

Per-layer **visibility/lock** is NOT in `$part` — it's persisted view state in
`src/state/layerStore.ts` (`$layerView`). See [layers.md](./layers.md).

Undo/redo stacks are module-private arrays (depth 50), not atoms. They're exposed
for project persistence only via `exportHistory()` / `importHistory(snapshot)` (so
undo survives a reload) — see [projects.md](./projects.md).

## Actions (plain exported functions)

`addSubPart(templateId)`, `addPart(placements, connectors, tags)`, `addConnector()`,
`setConnectorFlags(index, flags[])`, `removeSelected()`, `duplicateSelected()`,
`selectPlacement(index)`, `updatePlacementTransform(index, {position,rotation,scale})`,
`updateSelectedTransform(t)`, `setPartId(id)`, `setEditorTags(tags)`,
`setToolMode(mode)`, `setSnap(snap)`, `newPart()`, `pushUndo()`, `undo()`, `redo()`.

**Collider actions** (`part.colliders`; see [colliders.md](./colliders.md)) — all enrolled
in undo: `addCollider(shape, transform?, owner?)`, `setColliderShape(index, shape)`,
`setColliderOwner(index, owner, converted?)`, `removeCollider(index)` are **discrete**
(they `pushUndo()` themselves); `setColliderSize(index, size)` and
`updateColliderTransform(s)` are **streaming** (the caller pushes once at field focus /
gizmo drag start, exactly like the placement/connector transform writers). Every one of
them routes the size through `normalizeColliderSize`, because a collider's `scale` is its
size in meters, not a multiplier.

**IVA seat actions** (`part.ivaSeats`; see [iva-seats.md](./iva-seats.md)) — all enrolled in
undo. **Discrete** (they `pushUndo()` themselves): `addIvaSeat(transform?)` (lands last, i.e.
last in the cycle order, and selects itself), `removeIvaSeat(index)`,
`moveIvaSeat(index, delta)` (the **reorder** — that order is exported game data, and the
selection follows the seat through the splice), `aimIvaSeat(index, rotation)` (the inspector's
aim presets and "Aim at selection", both one gesture), and `addKittenAtSeat(seatIndex, kind?)`
(which mutates `part.kittens`, not the seat). **Streaming** (the caller pushes once at gizmo
drag start, exactly like the placement writers): `updateIvaSeatTransform(index, t)` and
`updateIvaSeatTransforms(updates)`. Both route through the private `assignIvaSeat`, which
copies position + rotation and **pins `scale` to (1,1,1)** — KSA has no seat size, so a
scale-mode drag is a deliberate no-op.

**Light actions** (`part.lights`; see [lights.md](./lights.md)) — all enrolled in undo.
**Discrete** (they `pushUndo()` themselves): `addLight(ownerTemplateId, seed?)` (appends a
`createPartLight` default under a freshly generated `_lightN` id; the id, owner and layer are
never seed-overridable), `removeLight(index)`,
`setLightType(index, type)`, `setLightRayTracing(index, on)`, and
`setLightOwner(index, ownerTemplateId, converted?)` (the re-home between `<PartGameData>` and a
template's `<SubPartGameData>`; the caller supplies the frame-converted transform so the store
stays three.js-free — the `setColliderOwner` precedent). **Streaming** (the caller pushes once
at field focus / gizmo drag start): `updateLight(index, patch)` (the `<Light>` scalars — range,
intensity, colour, cone angles), `setLightPosition(index, position)`,
`setLightRotation(index, rotation)`, and `updateLightTransform(index, t)`. The three transform
writers route through the private `assignLight`, which copies position + rotation and **pins
`scale` to (1,1,1)** — KSA ignores light scale, so a scale-mode drag is a deliberate no-op (the
IVA-seat rule).

**`setPlacementsInternal(indices, internal)`** is discrete (one undo entry) and writes
`part.internalFlags` for the **distinct** SubPart templates behind the given placements — KSA
puts `<Internal>` on the template's `<PartModel>`, so it is never per-placement. Glass-exporting
templates are skipped (`isGlassTemplate`, exported so the menus can *disable* the item rather
than silently drop the write).

**GameData actions** (`part.gameData`, used by the Part Data dialog): `setDisplayName`,
`setCustomMassEnabled` / `setCustomMass`, tanks `addTank` / `removeTank` /
`setTankShape` / `updateTank`, power `add*`/`remove*`/`set*` for batteries / generators
/ power-consumers, and coupling `set{Decoupler,DockingPort,EvaDoor}Enabled` /
`set*Connector` / `setDecouplerForce` / `setDockingPort{LatchingImpulse,PushoffForce}`.
List add/remove, checkboxes and
Select picks are **discrete**; free-text/number field edits are **streaming**.

Conventions:
- Instance ids: `lastDotSegment(templateId).toLowerCase() + "_" + (count+1)`
  (e.g. `Core.Screw.A` → `a_1`, `a_2`).
- Mutating actions clone `$part` (`structuredClone`), edit, then `$part.set(next)`.

### Undo/redo invariant (must maintain)

History snapshots **`$part` only** (the serialized document: `partId`, `editorTags`,
`gameData`, `layers`, `placements`, `connectors`, `colliders`, `ivaSeats`, `lights`,
`internalFlags`, incl. each entity's `layerId`). Selection, `$toolMode`, `$snap` and
`$activeLayerId` are ephemeral UI and are intentionally excluded; selection + active layer are
*clamped* (not restored) after undo/redo. So are the seat-view and seat-aim atoms (`$seatView`
/ `$seatLook` in `ivaStore.ts`, `$ivaSeatAimRequest` in `ivaSeatStore.ts`) and the light
editing context (`$lightEditContext`) — an aim request only enters history through the
`aimIvaSeat` it eventually causes.
Per-layer visibility/lock is also excluded (it's persisted view state in
`layerStore.ts`). Every action that mutates `$part` MUST enroll in undo via exactly
one of two patterns:

1. **Discrete** (one gesture = one change): the action calls `pushUndo()` itself.
   `addSubPart`, `addPart`, `addConnector`, `removeSelected`, `duplicateSelected`,
   `setConnectorFlags`, `setEditorTags`, the GameData list/toggle/Select actions
   (`addTank`/`removeTank`/`setTankShape`, power add/remove, coupling enable +
   `set*Connector`, `setCustomMassEnabled`), and the layer mutators `createLayer`,
   `renameLayer`, `deleteLayer`, `clearLayer`, `reorderLayers`, `moveEntityToLayer`,
   `moveSelectionToLayer` (see [layers.md](./layers.md)).
2. **Streaming** (rapid updates that collapse to one step — a gizmo drag or a typing
   session): the action does **not** push; the caller pushes once at interaction
   start (gizmo drag-start; field focus). `updatePlacementTransform(s)`,
   `updateConnectorTransform`, `updateSelectedTransform`, `setPartId`, and the GameData
   field setters (`setDisplayName`, `setCustomMass`, `updateTank`, power `set*`,
   `set*Force`) — all focus-pushed by their dialog field (`PartDataButton` /
   `GameDataSections` / `PreciseNumberInput`'s `onInteractionStart`).

`newPart()` clears both stacks (a new document has no history). Adding a `$part`
mutator that picks neither pattern silently bypasses undo — that's a bug. The invariant
is also documented at the top of the undo/redo section in `editorStore.ts`.

## Selectors — `src/state/selectors.ts`

`$selectedPlacement = computed([$part, $selectedIndex], …)` — the selected
`SubPartPlacement` or `null`. Used by the inspector and gizmo attach logic.

## Two-way binding (gizmo ↔ inspector)

Both edit the same store:
- Gizmo drag → `EditorScene` → `updatePlacementTransform(index, …)`.
- Inspector field → `src/ui/TransformInspector.tsx` → `updatePlacementTransform(index, …)`.

The inspector uses a focus-scoped `draft` string per field so free typing works while
focused, and the field reflects live store values (e.g. gizmo drags) when not focused.
Rotation is shown in **degrees**, stored/exported in **radians**.

### Numeric fields — `src/ui/numberDraft.ts`

Every numeric input in the app (`NumberField`, `PreciseNumberInput`, `Vec3Field`, the
layer-opacity percent box) shares `useNumberDraft`, and all of them are **text** inputs —
never `type="number"`. A number input sanitizes its own DOM value, so a half-typed `-`,
`.`, `0.` or `1e-` reads back as `''` and the controlled re-render erases what was just
typed; that is what made fractional/negative entry feel like a fight. The shared rules:

- keystrokes are kept verbatim in a draft string while focused; junk that can't become a
  number (`isPartialNumber`) is dropped without rewriting the draft
- each keystroke that parses to an **in-range** number commits live, so the viewport
  follows along; out-of-range keystrokes are skipped rather than clamped (clamping `0` on
  the way to `0.5` would fight the typist)
- blur/Enter finalize: clamp to `[min, max]` and commit — or restore the pre-edit value if
  what's left isn't a number at all (empty, `-`, `.`)
- Escape cancels the whole edit and is swallowed only while the edit is dirty, so a second
  Escape still closes the popover the field lives in
- ArrowUp/ArrowDown step by `step` (default 1; Shift ⇒ ×10, Alt ⇒ ×0.1)

Focus is still the streaming-undo boundary (`onInteractionStart`), so a typing session —
live commits, arrow steps and all — collapses into one undo step.

## List selection — `src/ui/rangeSelect.ts`

The app's multi-select lists — the **Assets list** (`AssetsList.tsx`, the sectioned
SubParts/connectors/colliders/seats/lights/kittens list) and the anim-mode **Mesh
Picker** (`MeshPickerModal.tsx`) — carry the usual desktop-list gestures: click
replaces, Cmd/Ctrl+click toggles one row, Cmd/Ctrl+A takes everything selectable,
Shift+arrows extend by a row, and **Shift+click extends across every row in between**.

Only the last one is ours. react-aria's `SelectionManager.extendSelection` reads the
range anchor off the `Selection` object it handed to `onSelectionChange` — and both
lists are **controlled** (the Assets list from the six per-kind selection stores, the
picker from local state), so what comes back down is a freshly built plain `Set` with
no `anchorKey`. react-aria then anchors on the clicked row itself and a Shift+click
degenerates into "add the one row you clicked", which is the bug behind issue #5.

`useShiftRangeSelect` takes the gesture over: `rowProps(key)` records a primary-button
Shift+click on pointer-down (before react-aria's own, anchorless extension runs), and
`resolveSelection` swaps react-aria's keys for the computed range at the top of
`onSelectionChange`. Every other gesture passes through untouched. The rule
(`shiftRangeSelection`, unit-tested in `rangeSelect.test.ts`):

- the range runs from the clicked row to the **nearest already-selected row**, inclusive,
  and is added to the current selection — so for the ordinary contiguous selection this
  is exactly the expected convention, in either direction
- it only ever **grows**: there is no persistent anchor to trim toward, because selection
  here also arrives from the 3D viewport and "select all in layer". A Shift+click inside
  the selection fills the closest gap instead of shrinking the range, and a
  Cmd/Ctrl-built non-contiguous selection keeps its other holes.
- rows that can't be selected are **skipped, not blocking**: in the Assets list a range
  spans past (and up to) rows on a hidden or locked layer without selecting them, the
  same rule click-selection and the 3D viewport already follow
- ranges are computed over the displayed row order with the layer sections flattened, so
  one range can span layers *and* entity kinds (`setSelection` takes all six at once)

## UI panels (`src/ui/`)
- `SubPartBrowser.tsx` — filterable catalog list; click adds via `addSubPart`.
- `AssetsList.tsx` — the placed-entity list (see above); select/duplicate/delete.
- `TransformInspector.tsx` — numeric position/rotation/scale (two-way bound); for a
  selected connector, the three flag checkboxes (Internal/ToSurface/FromSurface).
- `Toolbar.tsx` — tool mode (Segmented), snap (NumberField), undo/redo.
- `PartDataButton.tsx` — the **Part Data** dialog (Part id, editor tags, and the
  `gameData` sections; see [xml-io.md](./xml-io.md)). `ExportButton.tsx` exports.
- `LayersButton.tsx` / `LayersPanel.tsx` — sidebar Layers popover (see [layers.md](./layers.md)).
- `EnginePanel.tsx` / `EngineToolbar.tsx` — the full-sidebar **Engine Designer**
  (`$inspectorMode === 'engine'`, ephemeral atoms in `engineStore.ts`) with a live
  thrust/Isp readout; `EngineSections.tsx` holds the reusable combustor/nozzle/controller/
  gimbal/propellant editors (also rendered in the Part/SubPart Data modals). See
  [engines.md](./engines.md).

## Persistence

UI settings and user preferences that should survive page refresh use **localStorage persistence** via `@nanostores/persistent`. See [state-persistence.md](./state-persistence.md) for patterns on what to persist (panel visibility, tool modes, view settings) and what not to (transient selections).

The whole editing workspace is also persisted as a **project** (document + layer view
state + active layer + undo/redo history), autosaved to localStorage and restored on
boot. See [projects.md](./projects.md).

## Tests
`src/state/editorStore.test.ts` covers instance-id generation, add/remove/duplicate,
selection clamping, and undo/redo — including that discrete mutations self-record
(`setEditorTags`, `setConnectorFlags`), that streaming mutations add no step on their
own (`updatePlacementTransform`; `setPartId` reverts only when the caller pushed at
interaction start).

`src/ui/rangeSelect.test.ts` covers the Shift+click range rule (direction, gap filling,
ties, unselectable rows, rows filtered out by a search) plus the mounted-hook plumbing:
a Shift+click replaces react-aria's keys exactly once, and every other gesture — plain
click, Cmd/Ctrl+click, Cmd/Ctrl+A, Shift+secondary-button — passes straight through.
