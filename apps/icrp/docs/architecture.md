# ICRP architecture

ICRP ("Inanimate Carbon Rod Placer") is the KSA **static-object / launch-complex editor**
— a flexo mini app (`apps/icrp/`, own Vite root, base `/flexo/apps/icrp/`) that lays out
`<StaticObject>`s from `<StaticSubObject>` pieces and exports a self-contained KSA mod.
Plan: [plans/ICRP_PLAN.md](../../../plans/ICRP_PLAN.md). Game contract:
[scope/static-objects.md](../../../scope/static-objects.md),
[scope/launch-sites.md](../../../scope/launch-sites.md).

## Layering (flexo's rules, AGENTS.md)

| Layer        | Contents                                                                                                                                                                           | Imports                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/ksa/`   | pure domain: `types` (document model), `staticCatalog` (Core parse), `staticXmlSerializer`, `modPlan` (export planner), `landmarkXml`/`systemXml`/`siteTypes` (sites + system mod) | flexo `src/ksa` pure helpers; never react/three (three only in math carve-outs) |
| `src/state/` | nanostores: `docStore` (project/selection/undo), `catalogStore`, `toolStore`, `projectStore`+`projectDb` (autosave)                                                                | `ksa/`; never react                                                             |
| `src/three/` | `basis` (THE frame mapping), `StaticScene` (reconciler), `PieceObject`, `materials`, `IcrpViewport`, `IcrpGizmo`, `GroundPlane`, `FootprintLayer`, `arrays`                        | flexo `src/three` shared modules (see `../SHARED_IMPORTS.md`)                   |
| `src/ui/`    | React on flexo's `src/ui/kit`                                                                                                                                                      | everything above                                                                |

## The document

`IcrpProjectDoc` = `{ modName, objects: StaticObjectDoc[], activeObjectId }`. One object =
one exported `<StaticObject>` (+ `<StaticObjectGameData>` metres). Placements hold **raw
KSA-frame numbers** (metres, XYZ radians, +X up / +Y east / +Z north — invariant I1); only
`three/basis.ts` knows the three.js mapping (one proper rotation on the scene root, so
gizmo read-back returns KSA numbers for free).

**Undo**: whole-project `structuredClone` snapshots (MAX 50). Two patterns (flexo's
invariant): discrete mutators call `pushUndo` themselves; streaming gestures (gizmo drag,
numeric typing session) call `beginGesture` once (drag end / field blur calls `endGesture`).

**Persistence**: `icrp-projects` IndexedDB, 500 ms debounced whole-project snapshot,
hydrated before first render; schema-version mismatch = **purge, never migrate**.

## Pieces (plan D6)

One library, three origins: `core-static` (Core `<StaticSubObject>`s — referenced by id on
export, never re-declared), `core-subpart` (Core vessel `<SubPart>`s — export declares a
namespaced `<StaticSubObject>` referencing the Core mesh/material **by id**, no binaries;
fact F12, in-game check [V1]), and `custom` (user GLBs — future work). Vessel parts stack
along +X, so they stand upright in the static frame unmodified. Vessel pieces carry BOTH
collider sets: the geometry-template shapes and the template's `<SubPartGameData>` shapes
(harvested from the Part catalog — most vessel colliders live there). `<Internal>` interior
props are included (KSA ignores the flag for statics, F6) but hidden from the browse list
until searched.

## Stock parts & layers

A stock vessel `<Part>` imports **exploded** into its individual SubPart placements (exactly
how flexo renders a Part — separate meshes, never merged), targeted into a NEW layer named
after the part or any existing layer. Layers are editor-only grouping (never exported):
visibility (hidden = unrendered + unpickable), an active layer for new placements, select-
contents, move-selection-here. With the multi-select pivot gizmo (attach on >1 selection;
drags replay the pivot delta onto every selected placement) a layer behaves like a movable
primitive. PART-level colliders (the tanks' cylinders live under `<PartGameData><Collider>`)
are localized onto the first imported placement (`three/partImport.ts`) and export composes
them into the object-level `<Collider>` with the placement's CURRENT transform — collision
follows wherever the pieces are moved. Scale is never composed (F4/I3).

## Shell (flexo-style): workspace modes

Top **menu bar** (File / Add / Edit / Arrange / View — kit `MenuBar`; menus re-evaluate
enabled/checked per open), the centered **mode switcher**, the tool row and the view
toggles — every icon control carries a kit `Tooltip` and grows a text label on wide
screens (mode labels ≥1100px, tool/toggle labels ≥1400px; the switcher's chips use native
`title` spans because a `ToggleButtonGroup`'s children must stay ToggleButtons for
react-aria's roving focus).

Three **workspace modes** (`state/modeStore.ts`, keys `1`/`2`/`3` — flexo's answer to
one-window complexity; view state, never undo-enrolled) swap BOTH sidebars:

| Mode          | Left                                                    | Right                                          | Scene                                          |
| ------------- | ------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| **build**     | details (U/E/N transform, align, arrays, object metres) | layers **with piece outliner**, objects, sites | colliders visible only via `C`, never pickable |
| **colliders** | authoring (Add/Fit per shape) + collider inspector      | **collider outliner**, objects                 | collider wires FORCED visible and pickable     |
| **sites**     | object metres + how-sites-work explainer                | launch sites, objects                          | site overlays forced visible                   |

`setMode` is the single choreography point (leaving colliders clears the collider
selection so a hidden selection can't hold the gizmo). Collider PICKING is colliders-mode
only — in build mode the wires (when toggled) never steal clicks from pieces.

**Phone** (`useIsPhone`): the sidebars unmount and become overlay **drawers** toggled from
the top bar's far-right buttons (backdrop tap closes); the top bar itself scrolls
horizontally. Desktop is the primary target — phone is kept _usable_, not featureful.

**The Library palette** (`ui/LibraryPanel.tsx`, `state/libraryEntries.ts`) is the fast
add path: one click drops the entry just east of the current build (`spawnEast`),
grounded and selected with the Move tool armed. Parts land exploded on their OWN new
layer, which makes **double-click in the viewport = select the whole part** (it selects
the piece's layer). Thumbnails are 96 px PNGs from `three/catalogThumbs.ts` — three
sources, cheapest wins: build-time statics (`pnpm thumbs:icrp` →
`public/thumbs-icrp/` + signature manifest, gitignored — licensed-asset renders),
an IndexedDB session cache (the dev answer: first session renders live, later sessions
are instant), then a live one-per-idle-tick shared offscreen renderer. The Add dialog
(**Add ▸ Piece / part…**, `A`) stays for big-preview browsing with a layer-target
select.

**The Add browser** reuses flexo's catalog-browser shell (`BrowserPopup` cover modal +
draggable list | preview / details splits + preview-first gestures): kind CHIPS
(all-active → click solos; solo → click restores), fuzzy search, single click = select +
**3D preview** (`CatalogPreviewViewport` renders any entry — piece, prefab, or whole stock
part — upright under the KSA basis with the editor's materials) + details pane
(mesh/material/colliders/terrain/alpha for pieces; placements/metres for prefabs;
tags/importable-count/layer target for parts); commit = double-click, Enter, or
Add / Add & Close. NOTE: the kit Modal's default `center` variant clamps to `max-w-md` —
any dialog with wide content must pick `fullscreen`/`cover` (the Export dialog bug).

**Vertical control**: the translate gizmo ALWAYS shows the vertical arrow (it is the
elevation handle — ground lock only constrains rotation to about-up); newly added pieces
and imported parts **auto-drop to the ground** once their meshes load (the group is lifted
as one, so an imported part keeps its shape); **keep-grounded** (Arrange menu, default on)
re-drops a scaled piece whose bottom sat on the ground before the scale gesture — inside
the same undo step — while below-grade pieces (terrain skirts) are left alone.

**Layers**: visibility (eye), **lock** (padlock — rendered but unpickable/undraggable),
**isolate** (solo, second press restores), inline rename (double-click), select-contents,
move-selection-here, active layer for new placements. Each layer **expands (chevron) into
a piece outliner** — click a row to select that single placement, ⌘/Ctrl/Shift-click to
toggle it into the selection — so individual pieces are reachable without viewport
clicking while the layer-level controls keep whole-group select/move. The active layer
starts expanded.

**Magnetic snapping** (`three/snapEngine.ts` — the lego/tank-farm journey, `M` toggles,
default ON): while body-dragging, two mechanisms with connector priority. (1) **Connector
docking** — stock-part imports carry their `<Connector>`s (localized onto the anchor
placement like the part colliders; editor-only, never exported), and a dragged part's
connectors dock to OPPOSING connectors (facing dot < −0.5) on stationary placements; the
delta is full 3D, so dragging a tank over another tank's top node lifts it exactly onto
the stack (KSA vehicle-editor feel). (2) **Box alignment** — per ground axis
independently, the dragged group's AABB snaps flush-touching or center-aligned against
nearby stationary boxes (proximity-gated on the cross axis). The radius is screen-space
(~18 px at the grab point, clamped 0.25–4 m); the magnet OVERRIDES the grid increment
when it engages; feedback = a magenta docking dot / amber guide lines. Locked layers
still attract (the pad is usually locked); hidden layers don't.

**Keyboard**: ⇧A/⇧D spin the selection 90° about up, ⇧W/⇧S tip it over east, ⇧Q/⇧E over
north (⌥ = the fine rotate increment; the group re-grounds if tipping buried it) — the
builder WASDQE convention shifted off the tool keys. Arrows nudge east/north by the snap
increment (⇧ ×10, ⌥↑/⌥↓ = up/down), streaming one undo step per press-and-hold.
Duplicates land 2 m east so ⌘D reads as "a copy appeared".

**Moving things** (three ways, all streaming into the document with one undo step):
**grab-anywhere** — with the translate tool, pointer-dragging a piece BODY slides the whole
selection on the ground plane (grabbing an unselected piece selects and drags just it;
shift-click stays a selection gesture; snap applies; Escape cancels); the **gizmo** —
single selection attaches it to the piece, multi selection to a centroid PIVOT whose
translate/rotate/scale deltas replay onto every selected placement (group scale scales
positions about the pivot and visual scales together — colliders never scale, preflight
warns); and the **U/E/N fields** in the details panel. Dev builds hot-reload FULLY on
store/scene module changes (`main.tsx` HMR guard) — the live scene subscribes to store
instances at construction, and an HMR swap would silently split UI and scene state.

## Rendering

`StaticScene` reconciles placements → `PieceObject`s (atlas geometry via flexo's
`MeshAtlasCache`, materials via `three/materials.ts`): standard = KSA-patched PBR (BC5 RG
normals via TBN), `<Alpha>` = real blend sampling **`.r`** (three's stock alphaMap chunk
reads `.g` — patched), `<Terrain>` = flat ground-colour stand-in (the game samples planet
biome textures). On-demand render loop (flexo's `RenderLoop` contract).

## Colliders

Three homes, one visual language (ColliderVisLayer on flexo's ColliderObject — amber wire

- translucent pick fill, node scale IS the size in metres):
  **piece-template** colliders (dimmed, read-only — owned by the shared `<StaticSubObject>`
  declaration, drawn per placement with position/rotation only), **placement-owned** (full
  amber, editable — stored in the piece frame, follow the piece, export composes them
  object-level with the placement's CURRENT transform), and **object-level** (editable,
  object frame). Click a wire to select; all three gizmo tools work (scale = resize); the
  details panel edits position/rotation/size per shape (`colliderSizeLabels`); Add and
  **Fit** buttons author them — Fit wraps the selected pieces' sampled geometry with a
  Box/Cylinder/Sphere/Capsule (flexo's `fitCollider`) and attaches to the first selected
  piece (with nothing selected, Add creates an object-level collider). `C` toggles
  visibility anywhere; **Colliders mode** (`2`) forces the wires visible + pickable and
  swaps in the authoring/inspector panels (left) and the collider **outliner** (right:
  object-level, per-placement, and read-only built-in groups).

**Scaling just works** (no warnings): a scaled placement whose piece has template
colliders is re-pointed at an auto-minted VARIANT `<StaticSubObject>` with the scale baked
into the collider dims (deduped per piece+scale, mesh/material by global id — fact F12);
placement-owned colliders bake the scale before object-level composition
(`ksa/colliderScale.ts`; per-axis exact for identity-rotated colliders and uniform scales,
volume-preserving mean otherwise — documented approximation).

## The linkage (object → world)

An exported `<StaticObject>` appears in-game ONLY where a
`<Landmark IsLaunchPad StaticObject="…">` names it — that landmark is what a **launch
site** exports as, inside the mod's `<System>`. The export dialog shows every
site→body→object binding and warns when objects are bound nowhere. A site whose name
matches an EXISTING landmark on its body (the "Replace stock" chips list them with their
coordinates) RETARGETS that landmark in place — landmark ids are first-wins per body, so
appending a duplicate would be silently dropped by the game; retargeted stock sites keep
Core's terrain decal (ICRP's is skipped).

## Export

`ksa/modPlan.ts` (pure) plans `mod.toml` + `<Mod>Assets.xml` + `<Mod>GameData.xml`
(+ `systems/` once sites exist), byte-faithful to KSA's own GlbToXmlUtility output
(golden tests against the vendored Core fixtures). Preflight: unknown pieces, zero
colliders (vessels fall through), scaled placements with colliders (KSA never scales
colliders), missing FootprintRadius, duplicate ids. Zip download; new mods must be
ENABLED in the game's Settings → Mods.
