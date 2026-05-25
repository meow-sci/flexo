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

`addSubPart(templateId)`, `removeSelected()`, `duplicateSelected()`,
`selectPlacement(index)`, `updatePlacementTransform(index, {position,rotation,scale})`,
`setPartId(id)`, `setToolMode(mode)`, `setSnap(snap)`, `newPart()`, `pushUndo()`,
`undo()`, `redo()`.

Conventions:
- Instance ids: `lastDotSegment(templateId).toLowerCase() + "_" + (count+1)`
  (e.g. `Core.Screw.A` → `a_1`, `a_2`).
- Mutating actions clone `$part` (`structuredClone`), edit, then `$part.set(next)`.
- `pushUndo()` snapshots before a change and clears the redo stack. **Interactive
  edits push undo once at the start** (gizmo drag start; inspector field focus), and
  `updatePlacementTransform` itself does **not** push — so a drag or a typing session
  is one undo step.

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
selection clamping, and undo/redo (incl. that `updatePlacementTransform` adds no undo
step).
