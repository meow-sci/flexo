# Layers

Editor-only grouping of SubParts and connectors, modeled on a graphics
program's layers but tailored to Part building. Layers organize the workspace —
they have **no representation in KSA XML** and are never exported.

## Model: what is document state vs. view state

This split mirrors the rest of the editor (see [editor-state.md](./editor-state.md)).

| Concern | Where it lives | Undo? | Persisted? |
|---|---|---|---|
| Layer **definitions** (`layers: Layer[]`, order) | `$part` document | ✅ | with the document |
| Layer **membership** (`layerId` on each placement/connector) | `$part` document | ✅ | with the document |
| **Active** layer (where new items land) | `$activeLayerId` atom | ❌ | ❌ (ephemeral, like selection) |
| **Visibility / lock** (per layer) | `$layerView` (`layerStore.ts`) | ❌ | ✅ localStorage `flexo:layerView` |

Visibility/lock are presentation preferences, so they are persisted but kept out
of undo history — toggling the eye never creates an undo step. This matches the
grid/inspector view-pref pattern in [state-persistence.md](./state-persistence.md).

`Layer = { id, name }` (`src/ksa/types.ts`). Array order in `part.layers` is the
display order. There are five **built-in** layers, all seeded by `createEmptyPart()`
and never deletable (`BUILT_IN_LAYER_IDS`):

- **Default** (`DEFAULT_LAYER_ID = 'default'`) — the starting active layer for SubParts.
- **Connectors** (`CONNECTOR_LAYER_ID = 'connectors'`) — every connector lives here,
  so connectors can be hidden/locked/managed separately from SubPart meshes.
- **Colliders** (`COLLIDER_LAYER_ID = 'colliders'`) — every `PartCollider` lives
  here, so the collision volume can be hidden/locked separately from the meshes it wraps
  (see [colliders.md](colliders.md)).
- **IVA Seats** (`IVA_SEAT_LAYER_ID = 'ivaSeats'`) — every `IvaSeat` lives here, so the
  interior camera vantage points can be hidden/locked separately from the meshes around
  them (see [iva-seats.md](iva-seats.md)). Array order within `part.ivaSeats` is the
  in-game cycle order, so this layer's rows are ordinals, not names.
- **Kittens** (`KITTEN_LAYER_ID = 'kittens'`) — editor-only kitten visual aides, never
  serialized to export.

## Membership rules

- New **SubParts** (`addSubPart`) and imported Part SubParts (`addPart`) land in the
  **active layer** (`$activeLayerId`, clamped to an existing layer; falls back to Default).
- New **connectors** (`addConnector`) and imported connectors always go to the built-in
  **Connectors** layer, regardless of the active layer. **Colliders**, **IVA seats** and
  **kittens** likewise always land on their own built-in layer.
- `duplicateSelected` keeps each copy in its source's layer (so connector copies stay
  in the Connectors layer).
- The KSA XML parser assigns SubParts `DEFAULT_LAYER_ID` and connectors `CONNECTOR_LAYER_ID`
  (XML has no layers); importing via `addPart` then reassigns SubParts to the active layer.
- The serializers ignore `layerId` entirely — export is unaffected.

## Actions — `src/state/editorStore.ts`

All layer **document** mutations are discrete (self-record undo via `pushUndo()`):

- `createLayer(name)` → appends a layer, makes it active, returns its id.
- `renameLayer(id, name)` → committed once (on blur/Enter), not per keystroke.
- `deleteLayer(id, { mode, targetLayerId })` → `'delete-items'` removes the layer's
  entities; `'move-items'` reassigns them (to Default if the target is invalid).
  Built-in layers (Default, Connectors, Colliders, IVA Seats, Kittens) are protected. Active
  layer falls back to Default if it was deleted.
- `reorderLayers(orderedIds)` → reorders (must be a permutation of existing ids).

Ephemeral / selection helpers (no undo):

- `setActiveLayer(id)` — pick the layer new items go to.
- `selectLayerEntities(id)` — see the scoped-selection note below.
- `deselectLayer(id)` — drops a layer's entities from the current selection (used
  when locking).

`$activeLayerId` is clamped to a live layer on undo/redo (`clampActiveLayer`) and
reset to Default by `newPart()`.

## View state — `src/state/layerStore.ts`

`$layerView: Record<layerId, { visible, locked }>` (persistent). Missing entries
default to `{ visible: true, locked: false }`, so new layers need no write until
toggled; stale entries for deleted layers are harmless.

- `toggleLayerVisible(id)`
- `setLayerLocked(id, locked)` / `toggleLayerLocked(id)` — locking also prunes that
  layer's entities from the current selection (one-way import `layerStore →
  editorStore`, no cycle).

## 3D behavior — `src/three/EditorScene.ts`

- **Visibility:** `applyLayerVisibility()` sets each entity's `group.visible` from
  its layer's state, on reconcile and after async builds. A hidden layer renders
  nothing — and because three's raycaster skips `visible === false` objects, hidden
  entities are also non-clickable.
- **Lock:** the click-select callback rejects hits whose layer is locked, so locked
  entities can't be selected by clicking. Combined with `deselectLayer` on lock and
  the disabled "select all" button, a locked layer can't be transformed.

## UI — sidebar Layers popover

A small toolbar above the inspector surface (`src/ui/RightPanel.tsx`) holds the
**Layers** button (`LayersButton.tsx`), which opens a popover with `LayersPanel.tsx`:

- A name input + Add button creates a layer (becomes active).
- A **react-aria `ListBox`** (single selection = the active layer) with
  drag-and-drop reorder (`useDragAndDrop` → `reorderLayers`).
- Each row: name (double-click → inline rename), a count chip (SubParts +
  connectors), eye (visibility), lock, "select all in layer", and delete (disabled
  for the built-in Default/Connectors layers). Row controls stop pointer-down
  propagation so they don't change the active layer.
- Delete opens a confirm `Dialog` offering **move items** (to a `Select`ed layer)
  or **delete items**.

### Scoped-selection limitation

SubPart and connector selection are mutually exclusive, and connectors are
single-select (see [editor-state.md](./editor-state.md)). So `selectLayerEntities`
selects all of a layer's SubParts (multi); only when the layer has no SubParts does
it select its first connector. Full simultaneous SubPart+connector multi-select is
a future selection-model change.

## Tests

`src/state/editorStore.test.ts` covers create/rename/reorder/delete (both modes),
default-layer protection, active-layer assignment + fallback on undo, and
`selectLayerEntities`' SubPart-preference. Parser/serializer fixtures carry
`layerId`/`layers`; serialization output is unchanged (no layer data in XML).
