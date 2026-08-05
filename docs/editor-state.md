# Editor State

Framework-agnostic editor state using **nanostores**. No React or three.js imports —
the 3D scene subscribes with vanilla `subscribe()`, React reads via
`useStore()` (`@nanostores/react`). Mirrors space-tape's `PartEditorController`.

## Stores — `src/state/editorStore.ts`

| Atom | Type | Meaning |
|---|---|---|
| `$part` | `EditingPart` | The whole part: `partId`, `editorTags`, `gameData` (display name, mass, tanks, power, coupling — the popup-only metadata with no 3D form), `layers[]`, `placements[]`, `connectors[]`, `colliders[]` (each carries a `layerId` naming an ordinary layer; connector `flags` is a `ConnectorFlag[]`). Treated as **immutable** — every mutation replaces it with a fresh object (so subscribers fire). |
| `$selection` | `readonly SelectionRef[]` | **THE selection** — one ordered list of `{kind, id}` refs spanning every entity kind (`'subpart' \| 'connector' \| 'collider' \| 'ivaSeat' \| 'light' \| 'kitten'`). The LAST element is the primary. Ephemeral: never persisted, never undone, survives mode switches. See "The selection" below. |
| `$lightEditContext` | `Record<string, number>` | Per light id, **which placement of its owner template** was last clicked. |
| `$activeLayerId` | `string` | Layer new items land in. Ephemeral (not persisted, not undone); clamped to a live layer. See [layers.md](./layers.md). |
| `$chainSession` | `ChainSession \| null` | The open action-chain session (`src/state/chainStore.ts`): frozen seed `instanceId`s + the ordered step list. **Ephemeral by design** — never persisted, never undone; the document is untouched until Apply, which is what makes Cancel unconditionally safe. The only persisted piece is the module-private `flexo:chainDefaults` (last-used parameters per op kind). See [action-chains.md](./action-chains.md). |
| `$toolMode` | `'translate'\|'rotate'\|'scale'` | Drives the 3D gizmo. |
| `$snap` | `{ translate?, rotateDeg? }` | Grid / rotation snap (0/undefined = off). |
| `$canUndo` / `$canRedo` | `boolean` | Enablement for the menubar ↶ ↷ pair and the `edit.undo`/`edit.redo` commands. |

(`$lightEditContext` is ephemeral too — one atom, so the gizmo's write-back frame and the
inspector's part-frame fields can never disagree about which instance an edit converts
through.)

Per-layer **visibility/lock** is NOT in `$part` — it's persisted view state in
`src/state/layerStore.ts` (`$layerView`). See [layers.md](./layers.md).

## The selection — stable ids, never indices

`$selection` holds `SelectionRef = { kind: EntityKind; id: string }`, where `id` is the
entity's own stable id (`instanceId` for a SubPart, the entity id for everything else). It
replaced six per-kind **index** arrays, and the reason is a real bug those had: an index is
positional, so after an undo the old `clampSelection` could leave a surviving index pointing
at a **different** entity. An id either resolves or it does not, so "clamping" is now one
filter that drops dead refs and never re-points a live one.

**Actions** (all in `editorStore.ts`, none of them undoable):

| Action | Meaning |
|---|---|
| `select(refs, { additive? })` | Replace (or extend) the selection. Deduped by `kind:id`, first occurrence wins; refs whose entity does not exist are dropped. |
| `toggleRef(ref)` | Add/remove ONE ref, leaving the rest — the additive (⇧/⌘/⌃) viewport click. An appended ref becomes the primary. |
| `deselectRefs(refs)` | Drop several refs (the subtractive marquee). |
| `clearSelection()` | Empty it. |
| `selectLayerEntities(layerId)` / `deselectLayer(layerId)` | Every entity on a layer / everything on it, in one pass. |
| `selectAll()` / `invertSelection()` / `deselectAll()` | `src/state/selectionOps.ts` — the Select-menu ops. Their population is every entity on a **listed AND visible AND unlocked** layer. They live in their own module because they need both `editorStore` and `layerStore`, and `layerStore` already imports `editorStore`. |

**Resolution helpers**: `entityIndexOf(part, kind, id)` (→ `-1` when gone),
`entityIdAt(part, kind, index)`, `refLayerId(part, ref)`, and `KIND_ORDER` — the fixed kind
order (`subpart, connector, collider, ivaSeat, kitten, light`) every flattening uses, because
bulk-transform math pairs a snapshot with its write-back positionally.

**Derived views** live in `src/state/selectors.ts`: `$hasSelection`, `$hasMultiSelection`,
`$selectionCount`, `$selectionByKind` (all six keys always present), `primaryOf(kind)`,
`$selectedPlacement(s)`, `$selectedEntity` (non-null iff exactly one entity is selected), and
`$selectedRefs`.

**Transform write-back is by id.** `selectedTransformRefs()` returns
`{kind, id, index, transform, layerId, name}` per selected entity in `KIND_ORDER`, and
`updateSelectedTransforms([{kind, id, transform}])` resolves each id fresh and switches on the
kind exhaustively. (`index` is recomputed on every call and is transitional — only
`TransformInspector` and `EditorScene`'s collider/light owner-frame lookups still use it.)
The v1 version indexed the arrays and fell through to a kitten default, so a kind that missed
its branch silently moved the kitten sitting at the same index; that trap is gone.

> **Deprecated, and dying with their last consumer**: the six `$selected*Indices` /
> `$selected*Index` names still exist as derived index VIEWS, and the per-kind setters
> (`selectPlacement`, `setSelectedColliders`, `setSelection`, `toggleEntity`, …) as one-line
> shims over `select`/`toggleRef`, purely so the v1 assets list compiles unchanged. Do not
> write new code against them.

## The mode machine — `src/state/modeStore.ts`

The editor's posture is one atom. There is no `$inspectorMode` any more: the v1 three-way
sidebar atom (`'assets' | 'anim' | 'engine'`) is gone, and every consumer reads `$mode`.

| Export | Meaning |
|---|---|
| `$mode` | `'build' \| 'animation' \| 'data' \| 'engine' \| 'surface'`. **Ephemeral** — boots to `'build'` on every reload, never persisted, **never an undo step**. |
| `$activeTool` | The single transient-tool slot (`'measure' \| 'seat-view' \| 'exhaust' \| 'marquee' \| 'member-paint' \| 'pivot-pick'`, or `null`). Arming one cancels the previous. The chain session is deliberately NOT in this slot — it is a parallel, non-modal session. |
| `MODES` / `TOOLS` | The display-order datasets the menubar switcher, the status chip, the phone tab bar, the palette and the hotkey validator all render from. |
| `setMode(next, payload?)` | **THE** choreography point: exit hooks → cancel the armed tool (unless its `ToolDef` says `survivesModeSwitch`) → set `$mode` → enter hooks. It never touches the document, `$part`, undo history, the selection, the camera, layer view state or the active layer. |
| `registerModeHooks` / `registerTool` | How an area store declares its own entry/exit choreography and tool teardown. Hooks are wrapped in try/catch — a broken area hook can never strand the UI between modes. |
| `resetModeForProjectLoad()` | Project load/switch: mode → Build, tool slot cleared. Called from `applyProjectSnapshot`. |

Two derived flags moved with it: `$isPoseEditing` and `$isExhaustPlacing` now derive from
`$mode` (plus their own area state) instead of the deleted inspector atom.

Scope state for the keyboard lives beside it in `src/state/hotkeyStore.ts`
(`$focusedSurface`, `$dialogOpen`, `$activeScopes`) — a binding declares one scope string and
is enabled iff that string is in `$activeScopes`. See
[3d-workspace.md](./3d-workspace.md#viewport-keys) for the viewport bindings and the Escape
ladder.

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

**Action-chain actions** (see [action-chains.md](./action-chains.md)) live in two places. The
**session** is `src/state/chainStore.ts` — `openChain(seedIds)` / `closeChain()` /
`addChainOp(kind)` / `updateChainOp(id, patch)` / `removeChainOp(id)` / `moveChainOp(id, ±1)`,
plus `defaultOp` and `clampOp`. **None of them push undo**: the session is ephemeral UI state
(selection-tier), not document state, so the invariant below does not apply to them.
`updateChainOp` also writes the op's parameters to the persisted `flexo:chainDefaults` blob,
which `defaultOp` reads back defensively (unknown or malformed fields degrade to the hardcoded
defaults — no migration). The **commit** is `applyActionChain(entries, detail)` in
`editorStore.ts`, a discrete mutation that collapses seed moves *and* every clone into one undo
entry, and selects seeds + copies afterwards. The live evaluation between the two,
`$chainEval`, is a `computed([$part, $chainSession], …)` in **`src/three/chainEval.ts`** rather
than `src/state/` — it needs the three.js math engine (`chainMath.ts`), and it is what both the
palette footer and the ghost preview read.

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
   `applyActionChain` (a whole action chain — seed moves + every clone — is one step),
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
   `set*Force`) — all focus-pushed by their dialog field (`PartDataDialog` /
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
lists are **controlled** (the Assets list from the selection store, the
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
  one range can span layers *and* entity kinds (`$selection` is one cross-kind list)

## UI panels (`src/ui/`)
- `SubPartBrowser.tsx` — filterable catalog list; click adds via `addSubPart`.
- `AssetsList.tsx` — the placed-entity list (see above); select/duplicate/delete.
- `TransformInspector.tsx` — numeric position/rotation/scale (two-way bound); for a
  selected connector, the three flag checkboxes (Internal/ToSurface/FromSurface).
- `shell/MenuBar.tsx` — the docked menubar: the eight menus rendered from
  `ui/menu/menuSpec.ts`, the mode switcher, the project chip and the undo/redo pair.
  Every item runs a **command** (`state/commandStore.ts`, defined in `ui/commands/`);
  there is no v1 `Toolbar.tsx` any more.
- `shell/phone/PhoneTopBar.tsx` + `shell/phone/MenuSheet.tsx` — the phone's one-row bar
  and its `☰` drill-down over that same `MENU_SPEC` (`ui/menu/MenuDrillDown.tsx`, shared
  with the narrow-desktop `☰` collapse).
- `shell/DialogRoot.tsx` — the single mount point for every overlay dialog, keyed by
  `state/dialogStore.ts`'s `$openDialog` id. No dialog is owned by a trigger button.
- `PartDataDialog.tsx` — the **Part Data** dialog (Part id, editor tags, and the
  `gameData` sections; see [xml-io.md](./xml-io.md)), dialog id `'part-data'`, reached
  from the ⌘K palette (`data.partData`) until Data mode gives it a permanent home.
  `ExportDialog.tsx` exports (dialog id `'export-ksa'`, File ▸ Export to KSA… / ⌘E).
- `LayersButton.tsx` / `LayersPanel.tsx` — sidebar Layers popover (see [layers.md](./layers.md)).
- `chain/ChainPalette.tsx` / `chain/ChainStepCard.tsx` — the floating, **non-modal**
  action-chain palette (`⇧⌘K` / Edit ▸ Begin Action Chain… / the selection toolbar's
  Chain button; self-gates on
  `$chainSession`) and its per-step parameter cards. Applying is one undo step; see
  [action-chains.md](./action-chains.md).
- `ModeSidebar.tsx` — the right sidebar's body, one switch on `$mode` (it replaced v1's
  `InspectorContent`). Build renders the assets toolbar + list; Animation and Engine render
  their panels; Data and Surface show an interim placeholder naming where those surfaces
  still live.
- `EnginePanel.tsx` / `EngineToolbar.tsx` — the full-sidebar **Engine Designer**
  (`$mode === 'engine'`, ephemeral atoms in `engineStore.ts`) with a live
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
