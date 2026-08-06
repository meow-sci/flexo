# Layers

Editor-only grouping of the things a Part is made of — SubParts, connectors and
colliders — modeled on a graphics program's layers but tailored to Part building.
Layers organize the workspace; they have **no representation in KSA XML** and are
never exported.

## Model: what is document state vs. view state

This split mirrors the rest of the editor (see [editor-state.md](./editor-state.md)).

| Concern | Where it lives | Undo? | Persisted? |
|---|---|---|---|
| Layer **definitions** (`layers: Layer[]`, order, **color**) | `$part` document | ✅ | with the document |
| Layer **membership** (`layerId` on each placement/connector/collider) | `$part` document | ✅ | with the document |
| **Active** layer (where new items land) | `$activeLayerId` atom | ❌ | ❌ (ephemeral, like selection) |
| **Visibility / opacity / lock / listed / collapsed** (per layer) | `$layerView` (`layerStore.ts`) | ❌ | ✅ in the project snapshot (see the persistence note below) |

The five view flags are presentation preferences, so they are persisted but kept out
of undo history — toggling the eye never creates an undo step. This matches the
grid/inspector view-pref pattern in [state-persistence.md](./state-persistence.md).

**Per project, not global.** `$layerView` is a plain atom, and the project snapshot
(`ProjectSnapshotV2.layerView`) is its ONE persistence — hiding a layer in one project no
longer affects another. The former global `flexo:layerView` localStorage key is gone — it
merely mirrored whichever project was saved last — and nothing reads or writes it any more
(see [projects.md](./projects.md)).

`Layer = { id, name, color? }` (`src/ksa/types.ts`). Array order in `part.layers` is the
document order.

### `Layer.color`

`color` is one of the twelve named swatches in `LAYER_COLORS` (slate, red, orange, amber,
lime, green, teal, cyan, blue, violet, fuchsia, rose) or absent. It is **editor chrome
only** — the Outliner draws it as the header's color dot and as a 2px left-edge tint on that
layer's entity rows, and it never reaches a 3D material (which would fight the selection
highlight and `applyLayerView`, the single visibility/opacity writer) and never reaches KSA
XML. How a name renders is `src/ui/outliner/layerColors.ts`; the document stores only the
name, so the palette can be restyled without touching a saved project.

Adding it was **schema-additive** under the AGENTS.md persisted-data rule: an old snapshot
that simply lacks the optional field loads unchanged, so neither `PROJECT_SCHEMA_VERSION`
nor `PROJECT_EXPORT_VERSION` was bumped and there is no migration code.

`LayerViewState.collapsed` is the same story on the view side: a new sparse field with a
`false` default, read only by the Outliner's chevron. The 3D scene never reads it, and
searching ignores it (a filtered Outliner always shows its matches).

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

| Mutation | Undo label |
|---|---|
| `createLayer` | `add layer` |
| `renameLayer` | `rename layer` |
| `setLayerColor` | `layer color` |
| `duplicateLayer` | `duplicate layer` |
| `deleteLayer` | `delete layer` |
| `clearLayer` | `clear layer` |
| `reorderLayers` | `reorder layers` |
| `moveEntityToLayer` / `moveSelectionToLayer` | `move to layer` |

- `createLayer(name)` → appends a layer, makes it active, returns its id.
- `renameLayer(id, name)` → committed once (on blur/Enter), not per keystroke.
- `setLayerColor(id, color | undefined)` → sets or clears the swatch; a no-change write is a
  no-op, so re-picking the current color never grows the history.
- `duplicateLayer(id)` → copies the layer AND everything movable on it (SubParts,
  connectors, colliders) in ONE undo step, inserts the copy after the source, makes it
  active and selects the clones. Refused for the built-ins: Default is the fallback every
  delete/move lands on, and the three entity-only layers are pinned, so a second copy of
  either could not hold what its name promises. Ids come from the same generators
  `duplicateSelected` uses, so the two can never mint colliding ids.
- `deleteLayer(id, { mode, targetLayerId })` → `'delete-items'` removes the layer's
  placements/connectors/colliders; `'move-items'` reassigns them (to Default if the
  target is invalid or pinned). Built-in layers (Default, IVA Seats, Lights, Kittens)
  are protected. Active layer falls back to Default if it was deleted.
- `clearLayer(id)` → empties a layer without deleting it (how the undeletable Kittens
  layer's **Clear Layer…** works).
- `reorderLayers(orderedIds)` → reorders (must be a permutation of existing ids).
- `moveEntityToLayer(kind, index, layerId)` → moves ONE row (`'subpart' | 'connector' |
  'collider'`); the Outliner row menu's "Change Layer ▸".
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

`$layerView: Record<layerId, { visible, locked, listed, opacity, collapsed }>` (a plain atom,
persisted with the project snapshot).
Entries are **sparse**: missing fields read their default from `DEFAULT_LAYER_STATE`
(`{ visible: true, locked: false, listed: true, opacity: 1, collapsed: false }`), so a new
layer needs no write until something is toggled and a newly added field needs no migration.
Stale entries for deleted layers are harmless.

- `toggleLayerVisible(id)` — hides the layer in 3D and dims its Outliner rows.
- `setLayerOpacity(id, 0..1)` — fades the layer's meshes so parts behind show through.
- `setLayerLocked(id, locked)` / `toggleLayerLocked(id)` — locking also prunes that
  layer's entities from the current selection (one-way import `layerStore →
  editorStore`, no cycle).
- `toggleLayerListed(id)` — whether the layer's entity rows are drawn in the Outliner.
  **Behavior change from v1**: an unlisted layer no longer vanishes from the list; it
  collapses to a 40%-opacity header-only **ghost row** that keeps its counts and its whole
  control set, so a layer can no longer be lost by unlisting it. 3D state is unaffected.
- `toggleLayerCollapsed(id)` / `expandLayer(id)` — the Outliner chevron. `expandLayer` is
  what `revealEntity` and the search auto-expand call so a match can never hide behind a
  collapsed header.
- `revealLayer(id)` — visible + listed, idempotent; used after an import and by the
  Outliner's `[Show layer]` status action.

## 3D behavior — `src/three/EditorScene.ts`

- **Visibility + opacity:** `applyLayerView()` sets each entity's `group.visible` and its
  opacity dimming from its layer's state, on reconcile and after async builds. A hidden
  layer renders nothing — and because three's raycaster skips `visible === false` objects,
  hidden entities are also non-clickable. It is the SINGLE writer of layer-driven material
  state, which is why layer *color* never touches a material.
- **Display Filters compose INTO the same writer.** **View ▸ Display Filters** hides whole
  entity KINDS (`viewStore.$kindVisibility`, persisted as `flexo:kindVisibility`) and is an
  orthogonal axis to layers: `applyLayerView` multiplies the layer's visibility by
  `isKindDisplayed(kind)`, so an entity shows only when BOTH agree. That predicate is shared
  with the click-select guards and the marquee's box projection, so a filtered-out kind is
  invisible, unclickable and unmarquee-able exactly as a hidden layer's contents are. Kind
  visibility is a per-browser view preference — never document state, never undone, never
  exported.
- **Lock:** the click-select callback rejects hits whose layer is locked, so locked
  entities can't be selected by clicking. Combined with `deselectLayer` on lock and the
  disabled "Select All in Layer" menu item, a locked layer can't be transformed.

## UI — the Outliner IS the layers UI

There is no Layers button and no Layers popover any more. Build mode's right sidebar is the
**Outliner** (`src/ui/outliner/OutlinerPanel.tsx`), one tree that replaced the v1 assets
list, the assets toolbar, the Layers popover and the opacity popover-inside-a-popover. It is
one react-aria `GridList` spanning every layer, so a multi-select — and a ⇧-range — crosses
layers and kinds; row keys ARE `kind:id`, i.e. `SelectionRef`s.

**Display partition**: ordinary layers first, the three pinned entity-only layers after.
This is a *view* rule computed by `buildOutlinerTree` — `part.layers` keeps its document
order, because reordering the document to match a cosmetic rule would be an undoable
mutation. A pinned layer draws no kind subheader (it can only ever hold one kind).

**Layer header row** (`LayerHeaderRow.tsx`), left→right: active radio dot (`setActiveLayer`;
the layer name is the same click target) · expand/collapse chevron · color dot opening the
12-swatch + "none" popover · name (double-click → inline rename, Enter commits, Escape
cancels) · count chip (`3/12` while searching; per-kind breakdown on hover) · eye · opacity
swatch (a 0–100 `useNumberDraft` field + slider, tinted accent below 100%) · lock · listed ·
drag grip · ⋮ menu. The ⋮ menu is Rename · Set Color ▸ · Select All in Layer · Duplicate
Layer · Clear/Delete Layer… · Move Layer Up / Move Layer Down.

**Deleting a layer is an inline strip, not a modal** (foundation §14.3 — a whole-container
destroy always confirms). It expands under the header row and offers *move items* (with a
destination picker) or *delete items*, both feeding `deleteLayer`. The Kittens layer, being
undeletable, offers **Clear Layer…** instead — the same strip, delete-items only. A `＋
Layer` row is pinned under the list; blank name ⇒ "Layer N", and the new header is scrolled
into view.

**Entity rows** (`EntityRow.tsx`) are grouped by kind under their layer with a per-kind ⋮
menu (right-click opens the same menu at the cursor). Locked-layer rows are disabled;
hidden-layer rows stay listed at 40% opacity and refuse selection but keep their menu.
Dragging entity rows onto an ordinary layer header runs `moveSelectionToLayer` for the whole
movable selection, with a status flash naming any pinned kinds that stayed behind.

**Reordering** happens over the ordinary partition only; pinned layers are neither drag
sources nor drop targets. Both Outliner drags use the platform's HTML5 drag events rather
than react-aria's `useDragAndDrop`, because a layer here is a `GridListSection` *header* —
deliberately not a selectable row — and react-aria's collection DnD can only move items.
`src/ui/outliner/layerReorder.ts` holds the pure index math (unit-tested).

**Layers outside the Outliner.** Two shell surfaces carry layer state so it is never invisible
(see [ui-shell.md](./ui-shell.md)): the status bar's **active-layer chip**
(`Layer: <name> ▾`, Build and Animation only — clicking it opens a picker that runs
`setActiveLayer`) and the **Select ▸ By Layer ▸** submenu, whose rows are minted by the
`layers.select` command provider and run `selectLayerEntities`. A sibling `layers.activate`
provider puts "Activate layer: <name>" in the ⌘K palette. All three read the same document
`part.layers` order, so a rename or reorder moves them together.

Below the layer list sits the collapsed **AIDS** section (`AidsSection.tsx`) — the collection
of editor-only aids (line measurements, reference containers) plus the containment
warn-precision toggle. Aids are not layer citizens: they have no `layerId` and are never
exported. Activating a row makes that aid active, which opens its editor.

## Tests

`src/state/editorStore.test.ts` covers create/rename/color/duplicate/reorder/delete (both
modes), clear, built-in protection, active-layer assignment + fallback on undo, the
`moveEntityToLayer` / `moveSelectionToLayer` guards, and that connectors/colliders
follow the active (or import) layer. `src/three/bulkTransform.test.ts` covers the
kind-aware group scale. `src/ui/outliner/outlinerTree.test.ts` covers the row model (the
display partition, kind grouping, `shown/total`, the search semantics) and
`src/ui/outliner/layerReorder.test.ts` the ordinary-partition reorder math.
Parser/serializer fixtures carry `layerId`/`layers`; serialization output is unchanged
(**no layer data in XML — `color` included**).
