# Editor State

Framework-agnostic editor state using **nanostores**. No React or three.js imports —
the 3D scene subscribes with vanilla `subscribe()`, React reads via
`useStore()` (`@nanostores/react`). Mirrors space-tape's `PartEditorController`.

## Stores — `src/state/editorStore.ts`

| Atom | Type | Meaning |
|---|---|---|
| `$part` | `EditingPart` | The whole part: `partId`, `editorTags`, `placements[]`. Treated as **immutable** — every mutation replaces it with a fresh object (so subscribers fire). |
| `$selectedIndex` | `number` | Index into `placements`, or `-1`. |
| `$toolMode` | `'translate'\|'rotate'\|'scale'` | Drives the 3D gizmo. |
| `$snap` | `{ translate?, rotateDeg? }` | Grid / rotation snap (0/undefined = off). |
| `$canUndo` / `$canRedo` | `boolean` | For toolbar button enablement. |

Undo/redo stacks are module-private arrays (depth 50), not atoms.

## Actions (plain exported functions)

`addSubPart(templateId)`, `addPart(placements, connectors, tags)`, `addConnector()`,
`setConnectorFlags(index, flags)`, `removeSelected()`, `duplicateSelected()`,
`selectPlacement(index)`, `updatePlacementTransform(index, {position,rotation,scale})`,
`updateSelectedTransform(t)`, `setPartId(id)`, `setEditorTags(tags)`,
`setToolMode(mode)`, `setSnap(snap)`, `newPart()`, `pushUndo()`, `undo()`, `redo()`.

Conventions:
- Instance ids: `lastDotSegment(templateId).toLowerCase() + "_" + (count+1)`
  (e.g. `Core.Screw.A` → `a_1`, `a_2`).
- Mutating actions clone `$part` (`structuredClone`), edit, then `$part.set(next)`.

### Undo/redo invariant (must maintain)

History snapshots **`$part` only** (the serialized document). Selection, `$toolMode`
and `$snap` are ephemeral UI and are intentionally excluded; selection is *clamped*
(not restored) after undo/redo. Every action that mutates `$part` MUST enroll in
undo via exactly one of two patterns:

1. **Discrete** (one gesture = one change): the action calls `pushUndo()` itself.
   `addSubPart`, `addPart`, `addConnector`, `removeSelected`, `duplicateSelected`,
   `setConnectorFlags`, `setEditorTags`.
2. **Streaming** (rapid updates that collapse to one step — a gizmo drag or a typing
   session): the action does **not** push; the caller pushes once at interaction
   start (gizmo drag-start; field focus). `updatePlacementTransform(s)`,
   `updateConnectorTransform`, `updateSelectedTransform`, and `setPartId` (focus-pushed
   by `PartDataButton`).

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
- `TransformInspector.tsx` — numeric position/rotation/scale (two-way bound).
- `Toolbar.tsx` — tool mode (Segmented), snap (NumberField), undo/redo.
- `PartHeader.tsx` — Part id field + Export XML dialog (see [xml-io.md](./xml-io.md)).

## Persistence

UI settings and user preferences that should survive page refresh use **localStorage persistence** via `@nanostores/persistent`. See [state-persistence.md](./state-persistence.md) for patterns on what to persist (panel visibility, tool modes, view settings) and what not to (transient selections, undo/redo stacks).

## Tests
`src/state/editorStore.test.ts` covers instance-id generation, add/remove/duplicate,
selection clamping, and undo/redo — including that discrete mutations self-record
(`setEditorTags`, `setConnectorFlags`), that streaming mutations add no step on their
own (`updatePlacementTransform`; `setPartId` reverts only when the caller pushed at
interaction start).
