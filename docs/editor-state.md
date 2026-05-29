# Editor State

Framework-agnostic editor state using **nanostores**. No React or three.js imports —
the 3D scene subscribes with vanilla `subscribe()`, React reads via
`useStore()` (`@nanostores/react`). Mirrors space-tape's `PartEditorController`.

## Stores — `src/state/editorStore.ts`

| Atom | Type | Meaning |
|---|---|---|
| `$part` | `EditingPart` | The whole part: `partId`, `editorTags`, `gameData` (display name, mass, tanks, power, coupling — the popup-only metadata with no 3D form), `layers[]`, `placements[]`, `connectors[]` (each placement/connector carries a `layerId`; connector `flags` is a `ConnectorFlag[]`). Treated as **immutable** — every mutation replaces it with a fresh object (so subscribers fire). |
| `$selectedIndices` / `$selectedIndex` | `number[]` / `number` | SubPart selection (multi); `$selectedIndex` is the primary (last) one or `-1`. |
| `$selectedConnectorIndex` | `number` | Selected connector, or `-1`. Mutually exclusive with SubPart selection. |
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

**GameData actions** (`part.gameData`, used by the Part Data dialog): `setDisplayName`,
`setCustomMassEnabled` / `setCustomMass`, tanks `addTank` / `removeTank` /
`setTankShape` / `updateTank`, power `add*`/`remove*`/`set*` for batteries / generators
/ power-consumers, and coupling `set{Decoupler,DockingPort,EvaDoor}Enabled` /
`set*Connector` / `set{Decoupler,DockingPort}Force`. List add/remove, checkboxes and
Select picks are **discrete**; free-text/number field edits are **streaming**.

Conventions:
- Instance ids: `lastDotSegment(templateId).toLowerCase() + "_" + (count+1)`
  (e.g. `Core.Screw.A` → `a_1`, `a_2`).
- Mutating actions clone `$part` (`structuredClone`), edit, then `$part.set(next)`.

### Undo/redo invariant (must maintain)

History snapshots **`$part` only** (the serialized document: `partId`, `editorTags`,
`gameData`, `layers`, `placements`, `connectors`, incl. each entity's `layerId`). Selection,
`$toolMode`, `$snap` and `$activeLayerId` are ephemeral UI and are intentionally
excluded; selection + active layer are *clamped* (not restored) after undo/redo.
Per-layer visibility/lock is also excluded (it's persisted view state in
`layerStore.ts`). Every action that mutates `$part` MUST enroll in undo via exactly
one of two patterns:

1. **Discrete** (one gesture = one change): the action calls `pushUndo()` itself.
   `addSubPart`, `addPart`, `addConnector`, `removeSelected`, `duplicateSelected`,
   `setConnectorFlags`, `setEditorTags`, the GameData list/toggle/Select actions
   (`addTank`/`removeTank`/`setTankShape`, power add/remove, coupling enable +
   `set*Connector`, `setCustomMassEnabled`), and the layer mutators `createLayer`,
   `renameLayer`, `deleteLayer`, `reorderLayers` (see [layers.md](./layers.md)).
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

## UI panels (`src/ui/`)
- `SubPartBrowser.tsx` — filterable catalog list; click adds via `addSubPart`.
- `PlacementList.tsx` — placed instances; select/duplicate/delete.
- `TransformInspector.tsx` — numeric position/rotation/scale (two-way bound); for a
  selected connector, the three flag checkboxes (Internal/ToSurface/FromSurface).
- `Toolbar.tsx` — tool mode (Segmented), snap (NumberField), undo/redo.
- `PartDataButton.tsx` — the **Part Data** dialog (Part id, editor tags, and the
  `gameData` sections; see [xml-io.md](./xml-io.md)). `ExportButton.tsx` exports.
- `LayersButton.tsx` / `LayersPanel.tsx` — sidebar Layers popover (see [layers.md](./layers.md)).

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
