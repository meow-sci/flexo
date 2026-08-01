# Layers

Editor-only grouping of the things a Part is made of — SubParts, connectors and
colliders — modeled on a graphics program's layers but tailored to Part building.
Layers organize the workspace; they have **no representation in KSA XML** and are
never exported.

## Model: what is document state vs. view state

This split mirrors the rest of the editor (see [editor-state.md](./editor-state.md)).

| Concern | Where it lives | Undo? | Persisted? |
|---|---|---|---|
| Layer **definitions** (`layers: Layer[]`, order) | `$part` document | ✅ | with the document |
| Layer **membership** (`layerId` on each placement/connector/collider) | `$part` document | ✅ | with the document |
| **Active** layer (where new items land) | `$activeLayerId` atom | ❌ | ❌ (ephemeral, like selection) |
| **Visibility / lock** (per layer) | `$layerView` (`layerStore.ts`) | ❌ | ✅ localStorage `flexo:layerView` |

Visibility/lock are presentation preferences, so they are persisted but kept out
of undo history — toggling the eye never creates an undo step. This matches the
grid/inspector view-pref pattern in [state-persistence.md](./state-persistence.md).

`Layer = { id, name }` (`src/ksa/types.ts`). Array order in `part.layers` is the
display order.

### Ordinary layers vs. pinned kinds

**SubParts, connectors and colliders are ordinary layer citizens** (`LayerableKind`):
they land on the active layer, mix freely on any layer, and can be moved between layers
one at a time or in bulk. They are the things that ship inside the Part, so they belong
in the same logical groupings the user builds the Part out of ("Engine bay", "Landing
gear") — a layer can be hidden, faded, locked or swept with all of its geometry AND its
attach nodes AND its collision volume at once.

Three kinds are **pinned** to their own built-in layer (`ENTITY_ONLY_LAYER_IDS`) —
nothing else may be moved onto those layers and they can never be moved off:

- **IVA Seats** (`IVA_SEAT_LAYER_ID = 'ivaSeats'`) — every `IvaSeat` (see
  [iva-seats.md](iva-seats.md)). Array order within `part.ivaSeats` is the in-game
  cycle order, so this layer's rows are ordinals, not names.
- **Lights** (`LIGHT_LAYER_ID = 'lights'`) — every `PartLight` (see [lights.md](lights.md));
  markers, not geometry, and one template light can render as N markers.
- **Kittens** (`KITTEN_LAYER_ID = 'kittens'`) — editor-only visual aides that are never
  serialized to export at all.

The **built-in** layers, all seeded by `createEmptyPart()` and never deletable
(`BUILT_IN_LAYER_IDS`), are those three plus:

- **Default** (`DEFAULT_LAYER_ID = 'default'`) — the starting active layer.

## Membership rules

- New **SubParts** (`addSubPart`), **connectors** (`addConnector`) and **colliders**
  (`addCollider`) all land in the **active layer** (`$activeLayerId`, clamped to an
  existing layer; falls back to Default). **IVA seats**, **lights** and **kittens**
  always land on their own pinned layer.
- `addPart` puts an imported Part's SubParts, connectors AND colliders on ONE layer
  (its `targetLayerId`, else the active layer), so one import is one logical group.
- `duplicateSelected` / `duplicatePlacement` keep each copy in its source's layer;
  `pasteClipboard` does too, falling back to the active layer when the clipboard
  outlived the layer it was copied from.
- The KSA XML parser assigns everything `DEFAULT_LAYER_ID` (XML has no layers);
  importing via `addPart` then re-homes it.
- Project import (`mergeProjectImport`) mirrors each source layer as a NEW layer and
  routes placements, connectors and colliders through that same mapping.
- The serializers ignore `layerId` entirely — export is unaffected.

## Transforms: what a group scale does to each kind

Layer membership means a connector or collider can be swept into a bulk selection, so
the group-scale rules are kind-aware (`scalesWithGroup` / `groupScaledTransform` in
`src/three/bulkTransform.ts`, mirrored by `scaleEverything`):

- **SubParts / kittens** — position and own scale both multiply (the mesh grows).
- **Colliders** — same: `scale` IS the collider's size in meters, tied to the geometry
  it wraps, re-normalized onto the shape's degrees of freedom on write.
- **Connectors** — position moves with the group, `scale` is **never** touched. A
  connector's `<Scale>` is KSA's attach-node size CLASS (compared across parts in
  `Part.Connector` to resolve nested/internal connections), not the size of anything
  drawn; re-grading it on a resize would silently change how the Part connects.
- **IVA seats / lights** — position and rotation only; their write paths pin `scale`
  to (1,1,1) because KSA has no size for either.

## Actions — `src/state/editorStore.ts`

All layer **document** mutations are discrete (self-record undo via `pushUndo()`):

- `createLayer(name)` → appends a layer, makes it active, returns its id.
- `renameLayer(id, name)` → committed once (on blur/Enter), not per keystroke.
- `deleteLayer(id, { mode, targetLayerId })` → `'delete-items'` removes the layer's
  placements/connectors/colliders; `'move-items'` reassigns them (to Default if the
  target is invalid or pinned). Built-in layers (Default, IVA Seats, Lights, Kittens)
  are protected. Active layer falls back to Default if it was deleted.
- `clearLayer(id)` → empties a layer without deleting it (how the undeletable Kittens
  layer's trash button works).
- `reorderLayers(orderedIds)` → reorders (must be a permutation of existing ids).
- `moveEntityToLayer(kind, index, layerId)` → moves ONE row (`'subpart' | 'connector' |
  'collider'`); the Assets-list row menu's "Change Layer".
- `moveSelectionToLayer(layerId)` → moves every selected SubPart, connector and
  collider in one undo step; pinned kinds in the selection stay where they are.
  Both refuse the `ENTITY_ONLY_LAYER_IDS` layers.

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
- Each row: name (double-click → inline rename), a count chip (every kind on the
  layer), eye (visibility), opacity, lock, "list in Assets", "select all in layer",
  and delete — disabled for the built-in Default/IVA Seats/Lights layers, and
  repurposed as "delete all items" for the undeletable Kittens layer. Row controls
  stop pointer-down propagation so they don't change the active layer.
- Delete opens a confirm `Dialog` offering **move items** (to a `Select`ed layer)
  or **delete items**.

## UI — the Assets list

`src/ui/AssetsList.tsx` renders one section per layer (subject to each layer's
"listed" toggle) holding everything on it, grouped by kind for readability:
SubParts, then connectors, then colliders, then the pinned kinds. Selection is one
`GridList` spanning sections, so a selection freely mixes kinds and layers.
`selectLayerEntities(id)` sweeps every kind on a layer at once.

## Tests

`src/state/editorStore.test.ts` covers create/rename/reorder/delete (both modes),
clear, built-in protection, active-layer assignment + fallback on undo, the
`moveEntityToLayer` / `moveSelectionToLayer` guards, and that connectors/colliders
follow the active (or import) layer. `src/three/bulkTransform.test.ts` covers the
kind-aware group scale. Parser/serializer fixtures carry `layerId`/`layers`;
serialization output is unchanged (no layer data in XML).
