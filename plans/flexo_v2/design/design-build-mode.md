# flexo v2 — BUILD MODE design (+ shared selection & left-sidebar experience)

Status: area design, conforms to `design/foundation.md` (LAW). Feature census inputs:
`analysis/catalog-placement-layers.md`, `analysis/selection-transform.md`,
`analysis/viewport-scene-view.md`, `analysis/shell-layout.md`, `analysis/chains-misc.md`,
`analysis/ui-kit-hotkeys.md`. RULE ZERO ledger in §15.

Terminology per foundation §0.1 (Entity / Asset / Aid / Tool / chain session).
Everything here is Build mode (`$mode === 'build'`, the boot default) plus the pieces the
other modes inherit: the selection model, the left-sidebar focus editor framework, the Tool
bar window, and the viewport interaction conventions.

---

## 0. What Build mode is

Build is where you place and arrange **entities**: SubParts, connectors, colliders, IVA
seats, lights, kittens — plus the editor-only **Aids** (measurements, reference lines,
reference containers). Its right sidebar is the **Outliner** (layers + entities + aids in
one tree); its left sidebar is the **focus editor** (selection inspector / multi-select
panel / aid editor); its viewport carries the selection gizmo, marquee, ⌥-drag duplicate,
and `.glb` drop-import. No timeline dock; no mode-specific hotkey scope (Build adds nothing
beyond the `viewport` scope).

Entering Build (from any mode or at boot): nothing special happens — Build has no
enter/exit choreography (foundation §2.4). Selection, camera, active layer, layer view all
persist across mode switches. Add-entity commands issued from other modes auto-switch to
Build first (S27).

### 0.1 Desktop wireframe (elaborated from foundation §15.1)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ File Edit Add Select View Tools Window Help   [⬚Build][▶][☰][🚀][◧]        Rover-7 ▾  ↶ ↷  ⌘K │
├───────────────┬────────────────────────────────────────────────────┬───────────────────────────┤
│ ⬚ thruster_1 ⋮│      ┌────────────────────────────────┐            │ OUTLINER            🔍   │
│───────────────│      │ ⠿ ◇Move ◆Rotate ◇Scale │W/L│⧉▾│ ← Tool bar │ ◉ ▾ ● Hull      12 👁◐🔒≡⋮│
│ POSITION (m)  │      └────────────────────────────────┘  (floating)│     ⬚ thruster_1     ✓ ⋮ │
│  X [0.000]    │                                                    │     ⬚ tank_2           ⋮ │
│  Y [1.250]    │                                                    │     ⊙ connector_1      ⋮ │
│  Z [0.000]    │                                                    │     ▦ collider_1       ⋮ │
│ ROTATION (°)  │                 3D CANVAS                          │ ○ ▸ ○ Wings      4 👁 🔒⋮ │
│  X[0] Y[45]…  │        (flex cell; orbit center ==                 │ ○ ▸ IVA Seats    2       │
│ SCALE (×)     │         visible center; marquee,                   │ ○ ▸ Lights       1       │
│  X[1] Y[1]…   │         ⌥-drag dup, drop-to-import)                │ ○ ▸ Kittens      1       │
│───────────────│                                                    │ [＋ Layer]               │
│ Instance ID   │                                                    │──────────────────────────│
│ [thruster_1 ] │                                                    │ ▸ AIDS (2)               │
│ tmpl: Engine… │                                                    │                          │
│ INTERIOR  off │                                                    │                          │
│ [SubPart Data→│                                                    │                          │
│ [Edit Surface→│                                                    │                          │
├───────────────┴────────────────────────────────────────────────────┴───────────────────────────┤
│ ⬚Build│Layer: Hull ▾│ │1 SubPart · 2.4×1.1×0.9 m│ Duplicated ✓ [Undo] │⌥Dup ⇧Add│↻Y 45°│⇅Y 0.1m│⧉│🔔│
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Selection model (shared by all modes; owned by this design)

### 1.1 Decision: stable-id selection

The v1 six-per-kind **index**-array atoms are replaced by ONE atom of stable refs
(foundation §13 explicitly allows this as an area-level option):

```ts
// editorStore (reshaped)
type EntityKind = 'subpart' | 'connector' | 'collider' | 'ivaSeat' | 'light' | 'kitten';
type SelectionRef = { kind: EntityKind; id: string };   // id = instanceId / connector id / collider id / seat id / light id / kitten id
export const $selection = atom<SelectionRef[]>([]);      // ordered; last = primary
```

- **Why**: fixes census pain points — post-undo index aliasing (clamp can silently point at a
  different entity), the six-fold hand-expanded setter/clamp/deselect/duplicate/copy code,
  and the "adding a 7th kind touches ~10 sites" fragility. Every entity kind already has a
  unique id in the document.
- **Derived compatibility views** (`selectors.ts`): `$selectedByKind(kind)`,
  `$primaryOf(kind)`, `$hasSelection`, `$hasMultiSelection`, `$selectionCount`,
  `$selectedEntity` (discriminated union for exactly-one), `$selectedRefs`
  (flattened `{kind, id, transform, layerId, name}` in fixed kind order — same shape
  consumers see today, so gizmo/nudge/bulk code ports mechanically).
- **Clamping** becomes filtering: after undo/redo/delete, drop refs whose id no longer
  exists (`clampSelection`). No index remapping ever again. `deselectLayer(layerId)` is one
  filter over `$selection` (kills the "must cover every kind by hand" hazard).
- **Actions**: `select(refs, {additive?})`, `toggleRef(ref)`, `clearSelection()`,
  `selectLayerEntities(layerId)`, `invertSelection()` (new — Select menu),
  `selectAll()` (listed + unlocked layers only).
- Selection stays **ephemeral**, never undoable, survives mode switches (foundation §2.4).
- The `updateSelectedTransforms` kitten-vs-light index-order trap disappears with indices.

### 1.2 Viewport click selection (parity, verbatim)

All preserved exactly: pointerup with ≤4px movement = click; parent-chain
`userData.selectable` resolution; ⌘/⌃/⇧-click additive toggle; empty-click clears
(non-additive only); locked-layer and hidden-layer guards per kind (explicit visible check —
three.js raycasts invisible objects); nozzle-handle pick priority (Engine mode); clicking a
collider/light visual records the **instance context** (`colliderInstance` map /
`$lightEditContext` — keyed by id now, not index); every viewport selection publishes
`revealEntity(kind, id)` → Outliner scroll-into-view; clicking a mesh closes measurement /
container editing (mutual exclusion). Suppression while gizmo-drag / measure tool / seat
view — now formalized as `$activeTool` + drag flag (foundation §2.6), same OR semantics.

### 1.3 List selection (Outliner)

react-aria multiple-selection gestures + the custom grow-only ⇧-range
(`useShiftRangeSelect` semantics verbatim: nearest-anchor, inclusive, skips disabled rows,
never shrinks, holes preserved), ⌘/⌃-click toggle, ⌘A selects every enabled row. Row keys
are `kind:id` composite keys partitioned into `$selection` on change. Right-click a row
opens its ⋮ menu **at the cursor** (real context-menu positioning replaces the v1
synthetic-button-click hack). **Edit chords keep working with list focus** (v1 parity —
foundation §11.1): `⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I` are mirrored at `surface:outliner` and delegate
to the identical commands, so range-select-then-Delete/Copy behaves exactly as v1's
globals; the Outliner's own ⌘A (row select-all) keeps precedence over the viewport ⌘A.

### 1.4 Marquee box select (LOCKED #7 — new)

- **Gestures** (foundation §14.1): `⇧-drag` starting on empty canvas = **additive** marquee;
  `⌥⇧-drag` = **subtractive**; the `B` tool (Select ▸ Box Select, `B` key, palette) arms a
  **one-shot replace** marquee where the next plain drag selects. Plain drag stays orbit.
- **Hit rule**: an entity is included when the screen-space AABB of its selectable visuals
  intersects the marquee rectangle. Excluded: entities on hidden or locked layers, kinds
  hidden by Display Filters (§5.7), aids (never marquee-selected), and — for SubPart-owned
  colliders/lights — each *instance* tests independently but selecting any instance selects
  the entity (context set to the first hit instance).
- **Visual**: 1px accent-border rect with 8% accent fill, drawn as a DOM overlay div inside
  ViewportHost at `z.canvasOverlay` (no three-layer change; on-demand loop untouched — the
  rect is DOM).
- **During drag**: orbit disabled; live count chip follows the cursor (`+12`); status tool
  segment shows `Box select — release to select · Esc cancels`.
- **Esc** mid-drag cancels (Esc-ladder rung 5). Releasing a <4px marquee = treated as a
  click. Marquee never creates undo steps.
- Armed `B` tool disarms after one marquee or Esc.

---

## 2. Right sidebar — the Outliner (foundation S17)

One tree replaces v1's AssetsList + AssetsToolbar + Layers button/popover + opacity
popover-in-popover. Component: `OutlinerPanel` with `LayerHeaderRow`, `EntityRow`,
`AidsSection`. Dense `xs` controls, `--density-row-py` rows, sticky section headers.

### 2.1 Layout

```
┌ OUTLINER ────────────────────────────── 🔍 ┐   ← header: title + search toggle (⌘F while
│ [ 🔍 filter entities…                 ✕ ]  │      panel focused expands the field)
│ ◉ ▾ ● Hull            12  👁 ◐ 🔒 ≡  ⋮    │   ← LayerHeaderRow (active)
│      SUBPARTS (8)                          │   ← kind subheader (only when >0)
│      ⬚ thruster_1                 [int] ⋮  │   ← EntityRow (selected rows tinted)
│      ⬚ tank_2                          ⋮  │
│      CONNECTORS (3)                        │
│      ⊙ connector_1                     ⋮  │
│      COLLIDERS (1)                         │
│      ▦ collider_1                      ⋮  │
│ ○ ▸ ○ Wings            4  👁 ◐ 🔒 ≡  ⋮    │   ← collapsed ordinary layer
│ ○ ▸ IVA Seats          2  👁 ◐ 🔒     ⋮   │   ← pinned built-in layers (see 2.4)
│ ○ ▸ Lights             1  👁 ◐ 🔒     ⋮   │
│ ○ ▸ Kittens            1  👁 ◐ 🔒     ⋮   │
│ [＋ Layer]                                 │   ← create row pinned at list bottom
│────────────────────────────────────────────│
│ ▸ AIDS (2)                                 │   ← §2.6, collapsed by default
└────────────────────────────────────────────┘
```

### 2.2 Layer header rows — controls left→right

| Control | Behavior | Undo? |
|---|---|---|
| **Active radio dot** `◉/○` | click sets `$activeLayerId` (where new entities land). Active layer also settable from the status-bar chip and the palette ("Activate layer: X") | no (ephemeral, snapshotted per project) |
| **Chevron ▾/▸** | expand/collapse the layer's entity rows (view state, per project) | no |
| **Color dot ●** | click opens a 12-swatch + "none" popover → sets `layer.color` (§2.3) | **yes** — document mutation `'layer color'` |
| **Name** | single click = set active (same as dot; whole-row click target); **double-click = inline rename** (`RenameInput`: Enter/blur commits `renameLayer`, Esc cancels) | rename: yes |
| **Count chip** | total entities; tooltip = per-kind breakdown (from `$layerSummaries`) | — |
| **👁 eye** | toggle visible (`$layerView`) — hides in 3D + dims rows | no (view state) |
| **◐ opacity swatch** | popover: 0–100 `useNumberDraft` field (`inputMode="url"`) + slider; swatch tints accent when <100% | no |
| **🔒 lock** | toggle locked — prunes layer from selection, disables rows + gizmo | no |
| **≡ listed** | toggle listed-in-Outliner (unlisted layers collapse to header-only ghost row at 40% opacity — NOT removed, fixing v1's "layer vanishes from the list"; 3D state unaffected) | no |
| **⠿ drag grip** | drag-reorder layers (`reorderLayers`, permutation-validated) | yes |
| **⋮ menu** | Rename · Set Color ▸ · Select All in Layer · Duplicate Layer (new: copies layer + its movable entities, one undo step) · Clear Layer… · Delete Layer… · Move Layer Up/Down | per item |

- **Delete Layer flow**: replaces the modal-from-popover. `DialogViewStack` is not needed —
  use the foundation's **inline destructive strip** expanded under the header row:
  `Delete "Wings" (4 items): (•) Move items to [Default ▾]  ( ) Delete items · [Delete] [Cancel]`.
  Built-ins protected (item disabled with tooltip); Kittens layer's delete is relabeled
  **Clear Layer…** (same strip, delete-items only). Active layer falls back to Default;
  selection filtered. Confirm policy §14.3: whole-container ⇒ always the strip.
- **＋ Layer** row: click → inline name field (blank → "Layer N") → `createLayer`, becomes
  active, scrolls into view. Undo step `'add layer'`.

### 2.3 Layers data-model decisions

1. **Layer color: YES.** `Layer = { id, name, color?: LayerColor }` where `LayerColor` is
   one of 12 named swatches (slate/red/orange/amber/lime/green/teal/cyan/blue/violet/
   fuchsia/rose) or absent. Rendered as the header color dot and a 2px left-edge tint on
   the layer's entity rows. **Editor-only UI affordance — never applied to 3D materials**
   (keeps `applyLayerView` the single visibility/opacity writer and avoids fighting the
   selection highlight). Persisted in the document ⇒ project **schema change** — free under
   LOCKED #3 (clean-slate storage, no migration ever; the new schema version simply is the
   v2 baseline). Serializers continue to ignore all layer data at KSA export (byte-identical
   output invariant).
2. **Layer icons: NO.** Kind glyphs on entity rows already carry the semantics; a per-layer
   icon picker adds a dialog and a doc field for near-zero wayfinding value. Color covers
   the "scan for my layer" need. (Explicit decision, not an omission.)
3. **Layer view state becomes per-project.** v1's global `flexo:layerView` (keyed by
   colliding `layerN` ids across projects) is abandoned. `$layerView` (visible / locked /
   listed / opacity / **collapsed** — new field for the Outliner chevron) lives in the
   project snapshot (v1 already snapshotted it; the global mirror is what dies). Still
   sparse-with-defaults, still never undo-tracked, autosave-subscribed. Boot purge covers
   stale shapes; no migration.
4. **Pinned built-in layers stay layers** (census open Q10 resolved: keep the model users
   depend on). Default / IVA Seats / Lights / Kittens render as ordinary rows with their
   special rules intact: undeletable; entity-only (no drag onto them, not Change-Layer
   targets, their entities undraggable off); Kittens clearable; seats/lights/kittens always
   re-pinned on duplicate/paste. They sort after ordinary layers (v1 order preserved).

### 2.4 Entity rows

Grouped by kind under their layer (SubParts, Connectors, Colliders — ordinary layers;
Seats / Lights / Kittens under their pinned layers). Row anatomy:
`[kind icon] [name] [badges…] [⋮]`.

- **Names**: SubPart = instanceId (mono); connector/collider/light = id; seat = "Seat n"
  (ordinal IS the name — KSA seats are unnamed); kitten = kind ("Hunter").
- **Badges**: `interior` chip on `<Internal>` SubPart templates (tooltip preserved);
  `· hidden` / `· locked` inherited flags shown on the layer header, not per row;
  light rows show type glyph (spot/point); collider rows show shape glyph.
- **States**: locked-layer rows disabled (still visible); hidden-layer rows at 40% opacity,
  **un-selectable** (matches 3D) but keep their ⋮ menu; selected rows accent-ring
  (`gridRowClass`).
- **Fix (census pain 12)**: row actions on hidden layers that would produce invisible
  results (Duplicate) now flash `Duplicated into hidden layer "X"` in the status bar with an
  inline `[Show layer]` action — the action still works, it just can't be silent.
- **Selection gestures**: §1.3. Viewport `revealEntity` scrolls + flashes the row
  (implementation may keep the `data-asset-key` DOM query; behavior contract is the scroll).
- **Drag**: dragging a selected entity row onto an ordinary-layer header = Change Layer for
  the whole movable selection (SubParts/connectors/colliders; pinned kinds stay with a
  status flash "Seats stay on IVA Seats"). One undo step `'move to layer'`. Drop target
  highlights; pinned headers show a ⃠ cursor.
- **Per-kind ⋮ menus** (right-click anywhere on the row opens the same menu at cursor):

| Kind | Menu items |
|---|---|
| SubPart | Duplicate · SubPart Data → (Data-mode jump, template scope) · Edit Surface → (custom meshes only; Surface-mode jump) · Interior (IVA only) ▸ On/Off (per-TEMPLATE, "n/a for glass" disabled state preserved) · Change Layer ▸ · Delete… |
| Connector | Duplicate · Change Layer ▸ · Delete… |
| Collider | Duplicate · Fit to Selection · Change Layer ▸ · Delete… |
| IVA Seat | Duplicate · Sit in This Seat · Add Kitten at Seat · Move Up / Move Down (cycle order) · Delete… |
| Light | Duplicate · Delete… |
| Kitten | Duplicate · Delete… |

Delete… follows confirm policy §14.3 (≤5 & undoable ⇒ no confirm, status flash + [Undo]).
Duplicate = duplicate-with-offset (§7.1) selecting the copy.

### 2.5 Search

Pinned field, **fuzzy subsequence** match (upgrade over v1 substring) over: entity name/id,
template id, kind word ("connector"), flags ("interior", "locked"), seat ordinal, light
type. While filtering: layers auto-expand to show matches, non-matching rows hide, match
substrings highlight, layer counts show `3/12`. Esc clears the field (field-local), second
Esc returns focus to the viewport. `⌘F` while the panel has focus expands/focuses the
field — a **registered** binding at `surface:outliner` (foundation §11.2 /
system-services §4.4), listed in Help under "Outliner".

### 2.6 Aids section (foundation S28)

Collapsed `SidebarSection` at the Outliner's bottom — always discoverable, no menu toggle.

```
▾ AIDS (3)
   MEASUREMENTS                     [＋ line] [＋ p2p]
   ── ● 1.204 m  ref  🔒 ✕                    ← color dot · length · source tag (pt/ref) · lock · delete
   ── ● 0.350 m  pt      ✕
   REFERENCE CONTAINERS             [＋ ▾]     ← menu: Box / Cylinder / Sphere
   ▦ Box 2×2×3 m  ⚠ 🔒 ✕                     ← shape+dims · warn badge when exceeded · lock · delete
   Warn check: (•) Fast (bbox)  ( ) Accurate (vertex)
```

- Clicking an aid row = activate it → its editor takes the **left-sidebar focus slot**
  (§3.9) and its gizmo attaches. Selecting a mesh deactivates it (mutual exclusion
  preserved). `＋ line` = `addReferenceLine` (1m X line at origin, editor focused);
  `＋ p2p` arms the measure tool (same as `M`); container adds mirror Tools menu.
- Aid mutations (add/move/edit/delete) remain **undoable** via `registerEditorAidStores`
  (unchanged wiring). Bounding-box display toggles / units live in View ▸ Measurement
  Overlays / Units (foundation), not here — this section is the *collection*, the View menu
  is the *display prefs*.

### 2.7 Empty states

- No entities at all: mode empty state in the body — "Nothing placed yet" +
  `[Add SubPart…] [Import Model…] [Open Projects…]` buttons (doubles as first-run guidance,
  foundation §7).
- Search with 0 hits: "No matches for 'xyz' · [Clear]".
- Aids empty: one-liner "Measure with M, or add reference lines and containers here."

---

## 3. Left sidebar — the focus editor in Build

Framework per foundation §7: tool parameter card (top) → focus card → mode cheat-card empty
state. Header row = focus title + ⋮ overflow with the focus object's commands (Duplicate /
Copy / Change Layer ▸ / Delete…, per kind). All numeric fields `useNumberDraft` +
`inputMode="url"`; `onInteractionStart` pushes one undo step per typing session; every
field `isDisabled` when the entity's layer is locked. The v1 1134-line TransformInspector
splits into per-kind files with **guts unchanged**: `SubPartInspector`,
`ConnectorInspector`, `ColliderInspector`, `SeatInspector`, `LightInspector`,
`KittenInspector`, `MultiSelectPanel`, plus `MeasurementEditorCard` / `ContainerEditorCard`.

### 3.1 Shared transform groups (SubPart / connector / collider / seat / kitten)

- **POSITION (m)** — X/Y/Z `PreciseNumberInput` (undo label `'move'`, pushed once on focus).
- **ROTATION (°)** — X/Y/Z, displayed degrees ↔ stored radians (RAD2DEG boundary), undo
  `'rotate'`.
- Third group by kind: SubPart & kitten **SCALE (×)** X/Y/Z; connector **SCALE (size
  class)** X/Y/Z with caption "Attach-node size class — group scale never changes this";
  collider **SIZE (m)** with per-shape axis labels from `colliderSizeLabels` (cylinder X/Z
  = one Diameter field; capsule likewise; sphere one Radius) — only independently-editable
  axes get fields; seat: omitted (KSA seats have no size); light: replaced by the light
  panel (§3.6).

### 3.2 SubPart focus card

Header `⬚ thruster_1` + ⋮. Sections:
1. Transform groups (§3.1).
2. **Instance ID** — mono text field, live commit per keystroke, trims, ignores empty; undo
   `'edit instance ID'` on focus. Read-only **template id** caption below.
3. **Interior (IVA)** — per-TEMPLATE switch with caption "applies to all N placements of
   this template"; disabled "n/a for glass" for `<PartModelGlass>` templates. (New
   placement of an existing v1 feature — previously row-menu/multi-toolbar only.)
4. **Jump row**: `[SubPart Data →]` (Data mode, template scope) · `[Edit Surface →]`
   (custom meshes only; Surface mode with mesh picked).

### 3.3 Connector focus card

Header `⊙ connector_1` + ⋮. Transform groups; **FLAGS** — one Switch per
`CONNECTOR_FLAGS` entry, re-emitted in canonical order regardless of click order;
**CAPABILITIES** — one Switch per `CONNECTOR_CAPABILITIES`; inline hint text about
BulkFluid / SolidMotorCase / DecouplerJoint semantics (verbatim). Caption: "Connectors
cannot animate with joints" (KSA limitation, constitution).

### 3.4 Collider focus card

Header `▦ collider_1` + ⋮. Sections:
1. Transform groups (SIZE per shape).
2. **Shape** select (`COLLIDER_SHAPES`).
3. **Owner** select — `Part (assembly)` vs any placed SubPart template; changing owner
   converts the transform through old→world→new frames (no jump). Status lines preserved:
   "Owner template is not placed — dead data" / "Applies to all N placements · follows
   joint animation" / warning when owner has non-unit placement scale (KSA ignores it).
4. **[Fit to Selection]** button → `$colliderFitRequest` intent (scene has world geometry).
   Fit **margin** and **orient-to-selection** knobs get UI in Settings → Viewport
   (foundation §10.7 — gap closed there); a caption here links "Fit options in Settings".
5. **COVERAGE** panel: `[Check] [Clear]` → `$coverageRequest` / report — % of sampled
   points covered, count outside, bloat ratio, "gaps marked red in the viewport"
   (red-dot Points object, non-pickable); "Sample every vertex (slower, accurate)"
   precision switch (persisted `$colliderSettings.precision`). Also runnable selection-free
   from Tools ▸ Collider Coverage Check — then the report renders as the **tool parameter
   card** at the sidebar top.

### 3.5 IVA Seat focus card

Header `◉ Seat 2 of 4` + ⋮. Sections:
1. POSITION / ROTATION groups (no scale).
2. **Order**: ▲ ▼ reorder buttons (`moveIvaSeat` — order IS the exported IVA cycle /
   game `C`-key order); "IVA opens on this seat" chip on index 0.
3. **[Sit in This Seat]** — arms the seat-view tool (allowed on locked layers — camera
   only). **[Add Kitten at Seat]** — `addKittenAtSeat` (yaw-only facing; allowed on locked
   layers).
4. **Axes (exported)** — read-only Forward/Up vectors through the same G6 formatter the
   exporter uses.
5. **Aim** — six presets `+X (nose) −X +Y −Y +Z −Z` re-aiming while keeping the current up
   axis (near-parallel NaN guard preserved) + **[Aim at Selection]** →
   `$ivaSeatAimRequest` intent.
6. Warning when the part has no `<Internal>` geometry — now with an inline
   `[Toggle Hide Interior]` link (fixes the census discoverability nit).

### 3.6 Light focus card (replaces generic groups entirely)

Header `💡 Spot · light_1` + ⋮, owner status line ("via template · N instances" /
"part-level" / "dead data") and the multi-instance context note ("Editing through
`thruster_1_2` — one light per template; edits affect every instance"). Fields, in order:

1. **Owner** select (part-level ↔ template; world-pose-preserving re-home via
   `setLightOwner`).
2. **Light type** select — Spot / Point.
3. **Position (m, owner frame)** Vec3 (only when a placed owner gives a distinct frame).
4. **Aim rotation (°, owner frame)** Vec3 — Spot only.
5. **Position (m, part frame)** Vec3 — converted through the context instance
   (`$lightEditContext`, the SAME atom the gizmo uses — fields and gizmo can never
   disagree).
6. **Aim (part frame, unit vector)** Vec3 — Spot only; commits via `lightAimRotation`
   (minimal ΔQ, no roll; degenerate vectors rejected).
7. **Range (m)**, **Intensity** — `PreciseNumberInput`s.
8. **Color** — kit ColorPicker (react-aria; replaces the native `<input type=color>` per
   the foundation Settings note; undo pushed on open).
9. **Inner / Outer Angle (°, half-cone, 0–90)** — Spot only.
10. **Falloff curve** — `LightFalloffCurve` sparkline on the same exposure as the 3D
    coverage shells (agree-by-construction invariant).
11. **Ray tracing (IVA only)** switch.

Caption row links the light *display* prefs: "Coverage & preview → View menu · marker size
→ Settings → Viewport" (light marker size gains its missing UI in Settings, foundation).

### 3.7 Kitten focus card

Header `🐱 Hunter · kitten_1` + ⋮. POSITION / ROTATION / SCALE groups only + caption
"Editor-only aide — never exported. Convert with Add ▸ Make Kitten Mesh."

### 3.8 Multi-select panel (2+ entities, any kinds)

Header `N items` (per-kind breakdown caption: "3 SubParts · 1 Light") + ⋮.

1. **Move by (m)** — X/Y/Z + `[Apply]`.
2. **Rotate by (°) around centroid** — X/Y/Z + `[Apply]`.
3. **Scale by (×)** — X/Y/Z + `[Apply]` + "Scale positions too (smart)" Switch
   (`$bulkScaleMode` persisted; connectors relocate but never re-grade — `scalesWithGroup`
   kind rules verbatim; seats/lights scale-pinned).
4. **Foundation fix (census pain 4)**: the numeric appliers lift SubPart-owned
   colliders/lights to **part space** (`colliderWorld`/`lightWorld` through the context
   instance) before applying and write back through the inverse — numeric "Move by 1m X"
   now matches a gizmo drag exactly. Keyboard nudge/rotate get the same lift (§5.2).
5. `VectorApply` is rebuilt on `useNumberDraft` (kills the third hand-rolled numeric code
   path); drafts reset to 0/0/0 (or 1 for scale) after Apply; each Apply = one undo step
   (`'move'`/`'rotate'`/`'scale'` with "N items" detail).
6. **Actions row**: `Change Layer ▸` (ordinary layers only; movable kinds move, pinned
   silently stay — one undo step) · `Interior (IVA) ▸ On/Off` (per-template, glass-disabled
   states preserved, header explains the N-template blast radius) · `Duplicate` (§7.1) ·
   `Chain…` (opens the chain session, §9) · `Delete All (N)…` (confirm strip — policy
   §14.3).
7. All fields/actions disabled when ANY selected entity's layer is locked (whole-selection
   no-op invariant).

### 3.9 Aid editors (take the focus slot; exactly ONE focus slot ends the v1 left-center triple-booking)

**MeasurementEditorCard** (active line measurement):
Endpoint toggle `[A|B]` (drives the dedicated endpoint translate gizmo; axis-lock hides
non-locked handles) · **A (m)** Vec3 · **B (m)** Vec3 (per-axis disable under axis lock) ·
**Length (m)** (re-projects B along direction/axis) · **Axis lock** Free/X/Y/Z segmented ·
**Color + opacity** (ColorAlphaField) · **Width (px)** slider 1–10 · Lock toggle
(read-only display when locked) · Delete. All discrete edits undoable ('move endpoint',
'line length', 'line style'); endpoint gizmo pushes once at drag start.

**ContainerEditorCard** (active reference container):
**Gizmo mode** Move/Rotate/Scale segmented (`$containerGizmoMode`, independent of the main
Tool bar; scale re-normalizes via `normalizeSize` — cylinders stay circular, spheres
uniform) · shape-specific **Size** fields (Box W/H/D · Cylinder Radius/Height · Sphere
Radius) · **Segments** · **Center (m)** Vec3 · **Rotation (°)** Vec3 (Euler ↔ stored
quaternion) · **Line color / opacity / width** · **Warn** toggle + warn color + warn
opacity ("translucent red where meshes exceed") · Lock · Delete.

Selecting a mesh (or pressing Esc? — no: Esc does not clear selection; clicking elsewhere)
returns the focus slot to the selection.

### 3.10 Tool parameter cards

Rendered above the focus card while a tool with parameters is armed: coverage report
(§3.4), and the measure tool's live readout (`A placed at (x,y,z) — click point B`).

### 3.11 Empty state (nothing focused)

Build cheat-card: "Build — place and arrange entities." + hotkey list (F frame · T tool ·
B box-select · M measure · ⌘D duplicate · 1–5 modes) + `[Add SubPart…]` `[Import Model…]`
buttons. First run adds `[Open Projects…]`.

---

## 4. Gizmo & Tool bar

### 4.1 Tool bar floating window (foundation §6.2, extended)

```
┌──────────────────────────────────────┐
│ ⠿  ◇ Move  ◆ Rotate  ◇ Scale │ W/L │ ⧉ ▾ │
└──────────────────────────────────────┘
```

- **Move/Rotate/Scale** ToggleButtonGroup bound to `$toolMode`, displaying
  `$effectiveToolMode` (exhaust clamp Scale→Move renders truthfully; Scale disabled during
  exhaust placement). Hotkeys `T` / `⇧T` cycle forward/back (S5).
- **W/L** — **NEW: gizmo space toggle** (decision, §4.2).
- **⧉ snap magnet** toggle + **▾ chevron popover**: `Translate step [0.1] m` ·
  `Rotate step [15] °` (both `useNumberDraft`) · caption "Hold ⌃ while dragging for the
  temporary opposite". Backed by `snapStore` (`$snapEnabled`, `$snapTranslateStep`,
  `$snapRotateStep`, persisted `flexo:snap`) writing through the existing `$snap` plumbing
  — the dormant feature gets real UI (LOCKED #7). Scale snap stays off (parity).
- Visible whenever a gizmo target exists (selection, posing, exhaust). Draggable by grip,
  clamped to the workspace band, position persisted (`layoutStore.float.toolbar`),
  toggleable via Window ▸ Tool Bar. Selection *actions* deliberately absent (Law 1).
- Status-bar **snap chip** mirrors `$snapEnabled` (click toggles; tooltip notes the ⌃
  hold-invert).

### 4.2 Decision: local/world gizmo space — ADD the toggle

v1 is world-only with no indication. v2 adds `$gizmoSpace: 'world' | 'local'` (persisted
`flexo:gizmoSpace`, default `'world'`, never undoable):

- **Single entity**: maps to `TransformControls.setSpace` — local aligns handles to the
  entity's own axes (through the owner frame for owned colliders/lights).
- **Multi-select**: world = today's identity-oriented centroid pivot. Local = the pivot
  group adopts the **primary (last-selected) entity's world orientation**; bulk math is
  unchanged (it already applies the pivot's delta), so rotation happens about the primary's
  axes through the centroid.
- Keyboard rotate (W/S/A/D/Q/E) and nudge remain **world-axis** always (their axis chips
  say so; changing them would silently retune muscle memory for no ask).
- Toggle lives in the Tool bar (`W/L` segmented) + View is wrong for it (it changes edits,
  not display) — it is a tool parameter. Palette command "Toggle gizmo space".
- Rationale: TransformControls supports it natively; cost is one atom + pivot orientation;
  the census flagged the invisible world-only behavior as a wart. Listed in §14 as a
  foundation *extension* (Tool bar contents grow by one control).

### 4.3 Gizmo behavior (parity, restated as contract)

One TransformControls instance serving selection / pose proxy / exhaust proxy (attach
priority: pose > exhaust > selection). Drag start: exactly ONE undo push (labels
'move'/'rotate'/'scale' + name or "N items"; seat/light-only scale drags push none —
no-op). Streaming per-frame writes via `bulkTransform` math in one store update; centroid
pivot for 2+; owner-frame lifts for owned colliders/lights; orbit disabled + picking
suppressed during drag; release drops the snapshot and re-centers the pivot. Detached when:
any selected layer locked, posed-preview + animated selection, seat view. Esc mid-drag
cancels (rung 4). ⌃ during drag = temporary snap invert.

---

## 5. Viewport interactions & view features

### 5.1 ⌥-drag duplicate (LOCKED #7)

If ⌥ is held at **gizmo drag start**: `duplicateSelected()` runs first (one undo step
`'duplicate'`), the copies become the selection AND the drag target, then the drag proceeds
as normal streaming (its own undo step 'move' was NOT pushed — the duplicate step covers
the gesture: **one** undo step total labeled `'duplicate'`, so ⌘Z removes the copies
entirely; this matches DCC convention). The status modifier-hint segment advertises
`⌥ Duplicate drag` whenever hovering a gizmo handle with a selection. Works for every
entity kind duplicateable today (all six).

### 5.2 Keyboard nudge & rotate (parity + fixes)

- Nudge: `↑/↓` ±`$nudgeStep` along `$nudgeAxis`; `⇧↑/↓` ×5; `←/→` cycle axis; `⇧←/→`
  decade-aware step change (floor 0.001 m, 3 decimals). Rotate: `W/S A/D Q/E` pairs about
  world axes about the centroid; `R` cycles pair mapping; **`[` / `]`** rotate step
  ±15° (15–180) — relocated from F/⇧F (S6). All **viewport-scoped** now (S8), suppressed
  while typing; whole-selection no-op if any layer locked; one undo step per press
  (`'nudge'`/`'rotate'`).
- **Fix**: nudge/rotate lift owner-frame entities to part space like the gizmo (§3.8.4).
- Feedback: no toasts — the status **rotate/nudge chips** update live
  (`[↻ Y · 45°] [⇅ Y · 0.1 m]`, axis letters gizmo-tinted, click chips to cycle axis, rich
  chord-table tooltips preserved verbatim). Transient axis-change flashes go to the status
  message channel (`transient` tier).
- Prefs persisted: `flexo:nudgeAxis/nudgeStep/rotateStep/rotateAxisOffset` (unchanged).

### 5.3 Camera (LOCKED #7)

| Command | Binding | Behavior |
|---|---|---|
| **Frame Selection** | `F` (viewport) / View menu | Fits the selection bounds in view AND re-centers the orbit target on the selection centroid (orbit-around-selection). No selection ⇒ frame-all (whole part; empty part ⇒ origin at default distance) |
| **Camera Snap ▸** | View menu (6 directions) | Snaps view direction; orbit target = **selection centroid** when a selection exists, else origin; preserves distance; top/bottom up-vector fix preserved |
| **Reset Camera** | View menu / palette | Explicit `resetCamera()` — default pose, origin target, up reset (finally user-facing) |
| Orbit/pan/zoom | drag / wheel | OrbitControls + damping, unchanged; camera state saved per project on gesture end, restored on load (nonce atoms unchanged) |

### 5.4 View menu — Build-relevant content (per foundation §3, plus one area addition)

Foundation-pinned: Frame Selection · Reset Camera · Camera Snap ▸ · Grids ▸ (✓ Floor XZ /
XY / YZ + Grid Settings… deep-link; spacing numerics in Settings → Viewport) · Hide
Interior ✓ · Environment ▸ (9 presets; HDR progress → status bar) · Show Sky ✓ · Scene
Lighting… deep-link · Light Coverage ▸ Selected/All/Off · Live Light Preview ✓ (over-cap
warning → status bar via `$lightPreviewCount`) · Measurement Overlays ▸ (✓ Bounding Box ·
◉ World/Oriented · ✓ Per-mesh Dimensions · ✓ Distance Between Two) · Units ▸ m/cm/mm ·
FPS Counter ✓.

**Area addition — Display Filters ▸ (decision: YES, minimal).**
`View ▸ Display Filters ▸ ✓ Connectors · ✓ Colliders · ✓ IVA Seats · ✓ Lights · ✓ Kittens ·
✓ Measurement Aids` — per-kind view-only visibility, the DCC "display filters cluster" the
census asked about (viewport open Q7). Backed by `$kindVisibility` (persistentJSON
`flexo:kindVisibility`, all true by default, per-browser view pref, never undoable).
Composes inside `applyLayerView` (single-visibility-writer invariant holds); hidden kinds
are unpickable (explicit guard, same as hidden layers) and marquee-excluded; Outliner rows
of a hidden kind get a small crossed-eye glyph on their kind subheader (state visible, rows
untouched). Pinned-layer eyes already cover seats/lights/kittens per layer; the filter's
marginal value is connectors/colliders mixed into ordinary layers — hence checkbox parity
for all kinds costs nothing and reads uniformly. Rationale: pure View-menu material by Law
1; zero document impact.

### 5.5 Drop-to-import & misc (parity)

`.glb`/`.gltf` OS-file drop onto the canvas cell → dashed accent affordance → Import
Review dialog (custom-assets area owns the dialog; the drop zone + `openImportModel` wiring
is Build viewport furniture and survives verbatim). FPS counter, `?debug=dockingport`
calibration, viewport focus-on-pointerdown, on-demand render loop — all unchanged.

---

## 6. The Add experience

### 6.1 The split (what lives where)

| Surface | Role |
|---|---|
| **Add menu** (menubar §3) | Every *creation* entry point, one flat discoverable tree: entity placements (instant), catalog browsers (dialogs), asset-authoring dialogs, Make Kitten Mesh, Define Engine (mode jump). Entity items auto-switch to Build (S27), land on the **active layer at origin** (KSA defaults: connector faces +X, seat looks +X, kitten faces −Z), select the result, `revealEntity` in the Outliner, status flash `Connector added` |
| **Catalog browsers** | *Choosing from the KSA catalog*: SubPart browser, Built-in Part browser (§6.2/6.3) — cover dialogs |
| **Asset Manager** (⇧⌘A) | *Managing the library you already made*: textures/materials/meshes/import batches — never a placement surface (it links "Add instance" per mesh which places via `addSubPart`) |
| **Custom Mesh Instances ▸** | Quick re-place of an existing custom mesh without the browser (dynamic submenu, kitten meshes excluded, hidden when none) |
| **Viewport drop** | Model import fast path |
| **⌘K palette** | Indexes all of the above |

No drag-from-browser-to-viewport placement (explicit non-goal: everything lands at origin
and is placed with gizmo/nudge — parity; duplicate-with-offset and ⌥-drag cover the
"invisible stacking" complaint that motivated drop-placement asks).

### 6.2 SubPart browser (`SubPartBrowserDialog`, size L cover)

```
┌ Add SubPart ──────────────────────────────────────────────── ✕ ┐
│ [🔍 fuzzy id search…]  Source [All ▾]  Interior [All ▾]        │
│ ┌ list ──────────────┬───────── preview ─────────────────────┐ │
│ │ Engine.NozzleB     │                                       │ │
│ │ Engine.CombustorA  │        (orbitable 3D preview,         │ │
│ │ Tank.SphereTank int│         same lighting as editor)      │ │
│ │ …                  │═══════════ drag divider ══════════════│ │
│ │                    │ id · source XML · atlas URL · node ·  │ │
│ │ 200 of 431 shown — │ material id · Diffuse/Normal/ORM/     │ │
│ │ refine search      │ Emissive texture URLs                 │ │
│ └────────────────────┴───────────────────────────────────────┘ │
│                      [Add]  [Add & Close]                      │
└────────────────────────────────────────────────────────────────┘
```

- **Commit gestures — the two-gesture fix** (foundation §10.10): **single click / arrow
  keys = preview only** (selection drives the preview pane); **double-click / Enter /
  [Add] = add-and-stay** (multi-add is the primary flow); **[Add & Close]** is the
  secondary explicit exit-committing action. An accidental row click can no longer commit.
  Every add: `addSubPart(templateId)` → origin, identity, unit scale, active layer,
  `<lastSegmentLower>_<n>` id, selected, status flash `SubPart added` (add-and-stay keeps
  the dialog open so flashes stack in the message channel, overwrite semantics).
- **Search**: fuzzy subsequence over template **id**; results capped at 200 with a visible
  **cap indicator row** ("200 of 431 shown — refine search") — fixes the silent-truncation
  pain. **Source** filter Select (All / per Core `*Assets.xml` file — derived from
  `sourceFile`, giving the missing category axis for free). **Interior** filter (All /
  Interior only / Exclude interior). `interior` Chip on rows preserved (tooltip verbatim).
- **Layout**: list | (preview / details) with draggable splits resetting 50/50 per open;
  fresh session per open (search/selection/splits reset — relied-upon contract); phone
  §11.4. Preview = `SubPartPreviewViewport` (lighting-mirrored, orbit+zoom, on-demand,
  shared caches); `PreviewLoadProgress` overlay + `$browserPopupCount` workspace-progress
  suppression contract unchanged.
- Search field autofocus desktop-only (phone keyboard covers the preview).

### 6.3 Built-in Part browser (`PartBrowserDialog`, size L cover)

Same shell + gestures. Differences:
- **Search** fuzzy over id **and editorTags**; plus a **tag chip row** under the search
  field (every distinct `<EditorTag>` as a toggle chip; active chips AND-filter) — the
  browsable facet the census asked for.
- Row right-edge shows placement count.
- **Destination layer** Select in the header: `New Layer` (default; "New Layer N") /
  `Current Layer` / any ordinary layer (pinned filtered).
- **Details pane**: counts (SubParts / unique templates / connectors / animations), source
  file, editor tag chips, per-template ×count breakdown with non-previewable warning.
  Phone keeps the `CompactPartSummary` strip.
- **Commit**: `importBuiltInPart(part, layer)` — the whole import pipeline verbatim (anim
  GLB decode + easing fit + `restKeyframeId` deploy anchoring + GLB-faithful rest poses;
  id regeneration + full reference remapping; ImportedGameData carried whole; one undo
  step `'import'`; all geometry on ONE layer) then `revealLayer` (import never lands
  invisible) + select-all-imported (skipping hidden/locked-layer kinds). Status flash
  `Part added`.

### 6.4 Add menu — per-item behavior notes (beyond foundation §3's tree)

- **Collider ▸ Fit to Selection ▸ (shape)** stays an intent (`requestColliderFit`) — needs
  world geometry; disabled without a selection.
- **Light ▸ Spot/Point** adds part-level at origin + select + reveal (SubPart-owned lights
  are authored in Data mode, unchanged split).
- **Make Kitten Mesh ▸** creates the "`<Name>` Mesh" layer + submesh SubParts, one undo
  step, selects them, layer becomes active + revealed (verbatim).
- **Create mesh…** (`CreateMeshDialog`) on submit adds the mesh AND places it at origin
  (verbatim).
- Every instant item = one undo step named after the kind ('add connector', 'add seat', …).

---

## 7. Duplication, clipboard, delete

### 7.1 Duplicate — with offset (LOCKED #7)

`duplicateSelected()` (Edit ▸ Duplicate, **⌘D** — new hotkey, row menus, multi panel,
single-entity ⋮): all six kinds in one undo step `'duplicate'`; fresh ids per kind
(existing generators); copies keep source layer (pinned kinds re-pinned); duplicated seats
append at END of cycle order; duplicated lights keep owner template; copies become the
selection. **NEW**: copies land offset by **`$nudgeStep` along `$nudgeAxis`** (the user's
own current step/axis — visible in the status chips, so the offset is predictable and
adjustable; e.g. `⇅ Y · 0.1 m` ⇒ copies appear 0.1 m up). Never invisibly stacked. In-place
duplication remains available as ⌘C ⌘V (paste is in-place by design).

### 7.2 Clipboard — lights join (census gap fix)

`PartClipboard` gains a `lights` field; `copySelected` (⌘C) snapshots **all six kinds**
(placements, connectors, kittens, colliders, seats, lights); `pasteClipboard` (⌘V) pastes
in place, regenerates all ids, keeps source layer if alive else active layer, pinned kinds
re-pinned, pasted seats append at END, pasted lights keep owner template, one undo step
`'paste'`, pasted set becomes selection, status flash `Pasted N items`. **Cut** (⌘X) =
copy + delete composite (one undo step `'cut'`). Clipboard stays in-app + ephemeral
(decision: OS-clipboard/cross-project paste is covered by project export/import; not worth
a serialization format here).

### 7.3 Delete — one policy (§14.3)

`removeSelected()` (⌫/Delete, Edit ▸ Delete, ⋮ menus, multi panel): cross-kind one undo
step with the human description ladder preserved ('delete part(s)' / … / "2 parts, 1
connector"); descending splice → id-filtered selection; after single delete, select the
next entity of the same kind. Confirm policy: ≤5 entities ⇒ no confirm, status flash
`Deleted 3 items [Undo]` (10 s); >5 ⇒ confirm strip stating counts (heals the v1
hotkey-vs-toolbar inconsistency in both directions). Layer delete/clear per §2.2.

---

## 8. Transient tools in Build

Single slot `$activeTool` (foundation §2.6). Build hosts:

### 8.1 Measure point-to-point (`M`, Tools menu, Aids ＋p2p, palette)

Arming: crosshair cursor, picking suppressed, gizmo untouched. Status tool segment:
`Measure — click first point · Esc cancels` → `…second point`. First click raycasts part
meshes snapping to the **nearest face vertex**, empty space falls to the Y=0 ground plane;
second click completes → measurement activates (editor takes the left focus slot) → tool
disarms. Esc: cancel pending point → disarm (rung 5). Mode switch cancels (incl.
half-placed pick). >4px drag = orbit, not a pick. Undo: 'add measurement' on completion.
The v1 "no Esc, no hotkey, invisible state" pains are all closed by the status segment +
`M` + the Esc rung.

### 8.2 Seat view (seat inspector [Sit], Tools ▸ Sit in Seat ▸, Outliner row)

Camera-only tool, survives mode switches. Entering: camera snapshot; OrbitControls off;
eye-point camera at KSA 50° FOV; pointer free-look with the game's own clamps
(direction-is-the-state loop — do not refactor); gizmo + picking suppressed; all seat
markers hidden. Status tool segment (replaces SeatViewBar):
`Seat 2 / 4 · [◀][▶] · [Exit Esc]` — prev/next wrap document order (mirrors game C-key)
and re-select the seat; honesty tooltip ("flexo draws every SubPart, interior or not")
preserved on an ⓘ hover. Exits: Esc (rung 8, never preventDefault), Exit button, seat
deleted, project switch. Document edits re-pose/re-clamp live.

### 8.3 Box select — §1.4. (Exhaust placement is Engine-mode-only; designed there.)

---

## 9. Chain sessions (Build-only parallel session)

Per DECISIONS #7 + foundation §3.6/§6.2: **not** a tool-slot tenant — a parallel,
non-modal session co-existing with tools/orbit/gizmo/undo. The live
nudge-a-seed-and-watch-the-array-reflow loop is the feature's soul and is load-bearing.

### 9.1 Entry

- `⇧⌘K` (global) · Edit ▸ Begin Action Chain… · multi panel `Chain…` · palette command
  **"Begin Action Chain"** (the LOCKED "chain becomes a ⌘K command": the palette row runs
  the same command; ⌘K itself is the general palette).
- From a non-Build mode: switches to Build first, then opens.
- Guards verbatim: seeds = selected SubPart placements' instanceIds frozen **in selection
  order** at open; no SubParts ⇒ status warning `Select SubParts to chain`; any seed on a
  locked layer ⇒ `Selection is on a locked layer`. Connectors/colliders/lights/seats/
  kittens still can't seed (deliberate; parity).
- `⇧⌘K` while a session is open: **discard-confirm when ≥1 step** ("Discard 3 chain
  steps?"), silent close when empty — fixes the v1 ⌘K silent-cancel trap.

### 9.2 The chain window (`ChainWindow`, floating, windowId `chain`)

```
┌ ⠿ Action Chain — 2 seeds ───────────── ✕ ┐   ← drag strip (title shows seed count);
│ [🔍 add a step… (translate, radial…)  ]  │      ✕ = Cancel (confirm if ≥1 step)
│ ── steps ──────────────────────────────  │
│ ⠿ ⧉ Radial Array                  ✕     │   ← step card: grip (drag-reorder), icon,
│    Count [6]  Axis [X ▾]                 │      label, remove
│    Center X[0] Y[0] Z[0]                 │
│    Start angle [0]°  Sweep [360]°        │
│    Orient (•) Rotate with ring ( ) Keep  │
│    Radial offset [0] m  Axial step [0] m │
│ ⠿ → Translate                     ✕     │
│    Delta X[0] Y[0.5] Z[0]                │
│ ── footer ─────────────────────────────  │
│ 12 instances · +10 new                   │   ← or red engine error / "preview capped
│ [Apply ⌘↩]              [Cancel Esc]     │      at 500" / "Seeds no longer exist"
└──────────────────────────────────────────┘
```

- Default anchor top-left of the viewport (8px in); draggable; **resizable width
  300–420px**; always above sidebars (`z.float`); position persisted
  (`layoutStore.float.chain`).
- **Search field** (autofocus; re-focused after picking a command) filters the 6-op command
  list (label + keywords: "circle/ring/polar" → Radial…); command list shows when 0 steps
  or while searching (type→Enter→type→Enter flow preserved).
- **Step cards** — stateless, write through `updateChainOp` (clamps + persists the value
  as that kind's next default in `flexo:chainDefaults`). Full field census:
  - **Translate**: Delta X/Y/Z (m).
  - **Rotate**: Degrees X/Y/Z · Pivot (Centroid / Part origin / Custom point) · Center
    X/Y/Z (custom only).
  - **Scale**: Factor X/Y/Z · Mode Smart / In place (pivot row hidden in-place) · Pivot ·
    Center X/Y/Z.
  - **Linear Array**: Count · Offset per step X/Y/Z · Step rotate ° X/Y/Z (iterated,
    quaternion-accumulated) · Step scale X/Y/Z.
  - **Radial Array**: Count · Axis X/Y/Z (default **X**) · Center X/Y/Z · Start angle ° ·
    Sweep ° · Orient rotate-with-ring / keep · Radial offset (m) · Axial step (m).
  - **Grid Array**: Plane XY/XZ/YZ · Count A × Count B · Spacing A/B (m) · Centered
    switch.
- **NEW: drag-reorder** step cards by grip (replaces/augments the ▲▼ chevrons — chevrons
  stay for keyboard/phone).
- Clamps/caps verbatim: ±10000 m, ±360°, scale 0.01–100 (mirror unreachable — KSA
  back-face culls), counts ≤500, radial ≤360, total ≤2000; `count` = TOTAL including the
  original; ghosts capped at 500 (**preview cap never limits Apply**).
- **Footer**: `N instances · +M new` / cap note / engine error (red) / "Seeds no longer
  exist" (session stays open; seeds resolved live against `$part`). Mirrored in the status
  tool segment: `Chain · 12 instances · +10 new` (click focuses the window).
- **Apply** (`⌘↩`, surface-scoped, enableOnFormTags): `applyActionChain` — resolves all
  seeds first (any gone ⇒ no-op + warning), ONE undo step `'action chain'`, seed group
  overwrites originals in place, clones get collision-skipping ids
  (`nextChainInstanceId`), same layer, no reference remapping (parity with Duplicate),
  seeds+clones become the selection; success flash `Applied chain · +N SubParts`.
- **Cancel** (Esc — surface scope, no preventDefault so numberDraft dirty-revert wins
  first; Esc-ladder rung 6): confirm when ≥1 step (LOCKED), silent when empty. Cancel is
  unconditionally document-safe (session never touches `$part`, never in undo).
- Ghost preview: `ChainPreviewLayer` verbatim (green 0.35 unlit clones, seeds ghosted only
  when moved >1e-9, hidden-layer ghosts hidden, async builds refresh, allocation-free
  rebuild).
- Mode switch with ≥1 step ⇒ discard-confirm; project load closes the session.

---

## 10. Status bar in Build (instantiation of foundation §5)

| Segment | Build content |
|---|---|
| Mode chip | `⬚ Build` |
| Active layer chip | `Layer: Hull ▾` — click = layer picker menu (sets active; lists ordinary layers + pinned) — the census "active layer visible nowhere" fix |
| Tool segment | measure steps / seat view controls / marquee hint / `Chain · N instances · +M new` |
| Selection readout | `3 SubParts · 1 Light \| 2.40×1.10×0.85 m` from `$selectionBounds`; world/oriented badge, click toggles; unit per View ▸ Units |
| Message channel | transient flashes: added/duplicated/pasted/deleted counts (+[Undo] inline after deletes), nudge/rotate axis flashes, autosave ✓ |
| Modifier hints | context providers: hovering entity ⇒ `⇧ Add to selection`; hovering gizmo w/ selection ⇒ `⌥ Duplicate drag · ⌃ Snap`; empty canvas w/ selection ⇒ `⇧ Drag box-select` |
| Rotate/nudge chips | §5.2 |
| Snap chip | §4.1 |

---

## 11. Phone variants (< 640px, LOCKED #6 — full parity)

Built strictly from foundation §12 primitives; no bespoke forks.

1. **Outliner** → the **Panel sheet** (re-tap the Build tab): identical `OutlinerPanel` at
   `sm` density; layer-row controls get full touch targets; drag-reorder via grips
   (long-press lift); entity-drag-to-layer replaced by the row ⋮ Change Layer menu (drag
   between sheet rows is unreliable on touch — menu is the accessible path anyway).
2. **Focus editor** → the **Inspector sheet** (selection FAB/chip): same per-kind cards.
   The transform card appends a **touch nudge/rotate cluster** (closes the census
   touch gap): `Nudge [axis X|Y|Z] [−] [+] step 0.1m [−][+]` and
   `Rotate [X|Y|Z] [↺] [↻] step 45° [−][+]` — same store actions as the keyboard, same
   undo semantics (one step per tap).
3. **Browsers** → cover dialogs; list stacked over preview (45/55); tap = preview only,
   **[Add]** is the sole commit (already v1 phone behavior — now consistent with desktop's
   preview-first model); [Add & Close] present; search not autofocused.
4. **Tool bar** → pinned strip above the CondensedStatusBar: Move/Rotate/Scale + W/L +
   snap toggle (steps via the ▾ popover-as-sheet).
5. **Chain** → 50% **non-blocking** sheet (viewport + gizmo stay live above it — the
   non-modal invariant); session intact across dismiss/reopen; drag-reorder via chevrons;
   Apply/Cancel buttons (no ⌘↩ on touch).
6. **Marquee** → Select ▸ Box Select in the MenuSheet (or palette) arms the one-shot tool;
   next one-finger drag draws the rect (orbit suspended while armed); no ⇧-drag gesture on
   touch. **Cancel path** (phones have no Esc): tapping the CondensedStatusBar tool chip
   (`⬚`) cancels the armed tool and restores orbit (system-services §8.1 — F4 fix).
7. **Measure** → armed from MenuSheet Tools; two taps place points (vertex snap identical);
   tool state in the condensed status strip. Same cancel convention: tapping the tool chip
   (`▥`) discards any pending point and disarms.
8. **Seat view** → condensed status strip shows `Seat 2/4 ◀ ▶ ✕`.
9. **Aid editors / multi panel** → inside the Inspector sheet (focus-slot rules identical).
10. **Add menu** → the same MenuSpec via ☰ MenuSheet; entity adds flash in the condensed
    strip. Status modifier-hint and rotate/nudge chips are desktop-only (keyboard
    features) — their *actions* are covered by the touch cluster (2).

---

## 12. Store-level sketches (Build-owned deltas; foundation §13 stores assumed)

| Store | Change |
|---|---|
| `editorStore` | `$selection: atom<SelectionRef[]>` + actions (§1.1); per-kind derived views in `selectors.ts`; `$clipboard` gains `lights`; `duplicateSelected({offset: boolean})` applies nudge-axis offset; `cutSelected()`; `invertSelection()`; `selectAll()`; `$gizmoSpace` persisted atom; `$toolMode`/`$effectiveToolMode`/nudge/rotate atoms unchanged |
| `layerStore` | document `Layer.color?`; `$layerView` moves into the project snapshot (per-project; adds `collapsed`); actions unchanged + `setLayerColor(id, color)` (undoable, lives in editorStore since it mutates `$part`), `duplicateLayer(id)` |
| `snapStore` (new, foundation) | `$snapEnabled` / `$snapTranslateStep` / `$snapRotateStep` → writes through `$snap`; ⌃-held inversion computed at drag time from `modifierStore.$heldModifiers` |
| `viewStore` | `$kindVisibility` (persistentJSON, per-kind booleans); `frameSelection()` intent (nonce atom, like `$cameraSnap`, carrying `'selection' \| 'all'`); `resetCamera()` becomes a registered command |
| `modeStore` | Build contributes: no mode scope, no enter/exit hooks; tool defs for `measure` / `marquee`; chain prompt-on-mode-switch hook |
| `chainStore` | unchanged + `moveChainOpTo(index)` for drag-reorder; discard-confirm handled by the command layer |
| `marquee` | ephemeral `$marqueeRect {x0,y0,x1,y1} \| null` in modeStore tool sub-state; scene computes the hit set (screen-space AABB test) and calls `select(refs, {additive/subtractive})` on release |
| `commandStore` providers | layers ("Activate layer: X", By Layer ▸), custom mesh instances, seats (Sit in Seat ▸) |

Undo participation summary (unchanged invariants): document mutations only; discrete
mutations push internally; streaming (gizmo, typing, endpoint drags) push once at
interaction start; selection / active layer / layer view / kind filters / snap / gizmo
space / tool & chain sessions / camera never create undo steps; active layer + camera +
layer view + measurements + containers snapshot per project; view prefs per browser.

---

## 13. Interaction → undo/persistence quick table

| Interaction | Undo step | Persisted where |
|---|---|---|
| Add entity (menu/browser) | 1 ('add X' / 'import') | document |
| Gizmo drag / ⌥-drag dup | 1 ('move' etc. / 'duplicate') | document |
| Numeric field session | 1 (on focus) | document |
| Nudge/rotate keypress | 1 per press | document |
| Duplicate / paste / cut / delete / chain apply | 1 each | document |
| Layer create/rename/color/reorder/delete/move-to | 1 each | document |
| Layer eye/lock/listed/opacity/collapse, active layer | none | project snapshot |
| Snap, gizmo space, kind filters, nudge/rotate prefs, chain defaults | none | localStorage `flexo:*` |
| Selection, marquee, tools, chain session, browser sessions | none | ephemeral |
| Aid edits | 1 each (via registerEditorAidStores) | project snapshot |

---

## 14. Foundation extensions (declared per §17; no deviations)

1. **Tool bar gains the W/L gizmo-space toggle** (§4.2) — extends §6.2's pinned contents
   by one control. Rationale: tool parameter, belongs beside the tool switcher; TransformControls
   supports it natively; v1's invisible world-only behavior was a census wart.
2. **View ▸ Display Filters ▸** submenu (§5.4) — area MenuSpec addition (Law 1: view
   toggles → View menu).
3. **Browser facets** (Source/Interior filters, Part tag chips) and the **result-cap
   indicator** — interior additions to §10.10's pinned browser layout.
4. **Layer color** (+ per-project layer view, Outliner `collapsed` flag) — document/store
   shape owned by this area; schema-version note in §2.3.
5. Everything else designs strictly inside the foundation (regions, menus, status bar,
   Esc ladder, hotkey scopes, dialog conventions, phone primitives).

---

## 15. FEATURE PARITY TABLE — every v1 feature in this area → v2 home

Sources: catalog-placement-layers (CPL), selection-transform (ST), viewport-scene-view
(VS), shell-layout (SL), chains-misc (CM), ui-kit-hotkeys (UK).

| v1 feature (report §) | v2 home |
|---|---|
| Add menu: SubPart / Connector / Import built-in Part / Define Engine / Upload texture / Create material / Create mesh / Import model / Custom Meshes ▸ / Collider ▸ (origin + fit intent) / IVA Seat / Light ▸ / Kitten ▸ / Make Kitten Mesh ▸ (CPL 1.1) | Add menu §6.1/§6.4 (foundation §3) — every item, same store calls, +select+reveal+flash |
| Add kitten at seat (CPL 1.1) | Seat focus card §3.5 |
| Viewport .glb drop import + dashed overlay (CPL 1.1) | §5.5, canvas-cell drop zone verbatim |
| SubPart browser: cover shell, splits, fresh session, id search, MAX 200, interior chip, GridList keyboard preview, add-and-stay vs add-and-close, origin placement, preview viewport + lighting mirror, PreviewLoadProgress, $browserPopupCount, details pane fields (CPL 1.2) | §6.2 — commit gestures normalized (preview-first), cap indicator added, fuzzy search, Source/Interior facets |
| Part browser: id+tags search, placement counts, destination-layer Select (New/Current/existing, pinned filtered), revealLayer, importBuiltInPart pipeline (anim decode, rest anchor, id/ref remapping, one-layer rule, ImportedGameData, select-imported), details/CompactPartSummary (CPL 1.3) | §6.3 — pipeline verbatim; +tag chips |
| Model import → new layer per file, active+selected, import report (CPL 1.4) | Import Review dialog (custom-assets area, foundation §10.4); layer behaviors unchanged; report → notification center |
| duplicateSelected all-kinds semantics (ids, layers, seat END order, light owners) (CPL/ST 1.5/1.11) | §7.1 — + offset by nudge step (LOCKED) |
| Per-row Duplicate (CPL 1.5) | Outliner row ⋮ §2.4 (+hidden-layer flash fix) |
| Copy/paste (in-place, id regen, layer fallback, seat END, toast counts); lights gap (CPL/ST) | §7.2 — lights included; +Cut ⌘X |
| Action chains: entire feature (ops, clamps, caps, ghosts, guards, defaults persistence, one undo, live re-flow, non-modality) (CM 1.1) | §9 — floating window; ⇧⌘K; +drag/resize/reorder/discard-confirm; palette command |
| Layers data model (Layer {id,name}, membership, built-ins, entity-only pins) (CPL 1.6) | §2.3/§2.4 — +color field |
| createLayer/renameLayer/deleteLayer(move\|delete)/clearLayer/reorderLayers/moveEntityToLayer/moveSelectionToLayer (CPL 1.6) | Outliner rows + strips §2.2, drag §2.4, multi panel §3.8 |
| $activeLayerId (per-project snapshot, clamped) + selectLayerEntities + deselectLayer (CPL 1.6) | radio dot + status chip §2.2/§10; Select menu; id-filter §1.1 |
| $layerView visible/locked/listed/opacity + revealLayer + 3D enforcement (visibility writer, pick guards, gizmo refusal, opacity dimming mechanics) (CPL 1.6) | §2.2/§2.3 (per-project now) — 3D enforcement verbatim |
| Layers panel UI: create, single-active GridList, drag-reorder, count chips w/ tooltips, inline rename, eye, opacity popover (numberDraft+slider), lock, listed, select-all-in-layer, delete/clear dialogs (CPL 1.7) | LayerHeaderRow §2.2 — popover-stack killed; delete = inline strip |
| Assets list: per-layer sections, kind grouping, header flags, cross-kind multi-select, ⇧-range/⌘-click/⌘A, locked-disabled + hidden-40% rows, search, right-click menu, revealEntity scroll (CPL 1.8) | Outliner §2.4/§2.5 — fuzzy search, cursor-positioned context menu |
| Row menus: SubPart (Duplicate/Material/SubPart Data/Interior/Change Layer/Delete), connector/collider Change Layer, seat Sit (CPL 1.8) | §2.4 table (Material → "Edit Surface →" jump; SubPart Data → Data-mode jump) |
| MultiSelectToolbar: Change Layer / Interior / Delete All (N) (ST 1.6) | Multi panel actions row §3.8 |
| SelectionToolbar: M/R/S switcher, Duplicate, Chain, Delete (ST 1.5) | Tool bar window §4.1 + multi panel/⋮ menus + Edit menu |
| TransformInspector — every field, all six kinds + bulk (ST 1.7) | §3.1–§3.8, split per-kind, guts unchanged; bulk frame-lift fix |
| VectorApply drafts (ST 1.7) | rebuilt on useNumberDraft §3.8.5 |
| Keyboard nudge (axes/steps/fast/decade laws) + rotate (pairs/R/step) + persisted prefs (ST 1.8/1.9) | §5.2 — viewport scope; step keys → [/]; frame-lift fix |
| TransformHud pill + chord tooltips + axis colors (ST 1.10) | Status rotate/nudge chips §10 (foundation §5#8) |
| Delete flows + confirm inconsistency (ST 1.11) | §7.3 one policy |
| Snap plumbing ($snap, dormant) (ST 1.4) | Tool bar snap UI + chip + ⌃ invert §4.1 (LOCKED) |
| No local/world toggle (ST 1.4) | W/L toggle added §4.2 (decision) |
| Gizmo attach/undo/streaming/pivot/owner-frame/effectiveToolMode rules (ST 1.4) | §4.3 verbatim |
| Undo/redo/history, Scale Everything, MeasurementInfo readout (ST 1.12–1.14) | shell-owned (foundation: Edit menu/↶↷/History ▸; Edit ▸ Scale Everything…; status selection readout) |
| Camera orbit/pan/zoom, snaps, per-project camera, FPS counter, axis triad note (VS 1.1) | §5.3; snaps → selection centroid; +F, +Reset Camera; FPS = View toggle + status segment |
| View popover contents: grids (+spacing), hide interior, light coverage/exposure/preview, environment/tonemap/exposure/reflections/sky (VS 1.2) | View menu + Settings → Viewport/Scene (foundation §3/§10.7); cap warning → status |
| Measure: settings, p2p tool (vertex snap, ground fallback), MeasurementList, editor fields, containers (shapes, warn, editor fields), units, MeasurementLayer rendering, per-project persistence, undo wiring (VS 1.5/1.6) | Tools menu + Aids section §2.6 + aid editor cards §3.9 + View ▸ Overlays/Units + M tool §8.1 |
| Colliders: add/fit/visuals/inspector/coverage/settings (margin+orient UI gap) (VS 1.7) | §3.4 + Settings → Viewport (gaps closed) + Tools ▸ Coverage Check |
| Lights: add, visuals, marker size (UI gap), dual-frame inspector, falloff, context-instance rule (VS 1.8) | §3.6 + Settings → Viewport (marker size UI closed) + View menu viz |
| IVA seats: add, visuals+badges, inspector (reorder/aim/axes/sit/kitten), seat view + SeatViewBar + Esc (VS 1.9) | §3.5 + §8.2 (status segment) |
| Kittens: add, visuals, transformable (VS 1.10) | §3.7 + Add menu |
| Connector display + size setting (VS 1.11) | visuals unchanged; size → Settings → Viewport |
| Selection suppression OR-composition, mutual exclusions, on-demand loop, focus stealing (VS 0/1.4) | §1.2/§8 + foundation §2.6 — semantics preserved |
| Hotkeys: W/S/A/D/Q/E/R, arrows, F(step)→[/], Delete, ⌘C/V/Z/Y, ⌘K, ?, Esc seat (UK 6) | foundation §11.2 (rebind diff documented); all Build behaviors mapped above |
| No marquee / no ⌥-drag / no ⌘D / no select-all (ST gaps) | §1.4, §5.1, §7.1, Select menu — all added (LOCKED #7) |
| Hidden-layer duplicate invisibility, layer-view cross-project collision, MeshPicker layer-blindness (CPL pains 11–12, 10) | §2.4 flash fix; §2.3 per-project; SubPart Set Picker (foundation §10.11, animation area) |
| Mobile: FAB/sheet inspector, sheet variants, touch gaps (SL/ST) | §11 phone variants (touch nudge/rotate cluster added) |

Constitution checks: layers never serialized to KSA XML (color included — editor-only);
export byte-identical regardless of layers; coords.ts / formatG6 / bulkTransform Euler
lockstep untouched; connectors' `<Scale>` size-class rule enforced everywhere; kittens
never exported; chain non-modality preserved; toast() facade imperative; on-demand render
loop untouched (marquee is DOM); numeric fields 100% useNumberDraft + inputMode="url";
no migration code anywhere (schema bump + boot purge only).
