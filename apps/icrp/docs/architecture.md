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

## Shell (flexo-style)

Top **menu bar** (File / Add / Edit / Arrange / View — kit `MenuBar`; menus re-evaluate
enabled/checked per open) + the tool row. **Left sidebar = details** (selection transform in
**U/E/N** vocabulary — Up is a first-class field; align/distribute; arrays; object metres).
**Right sidebar = layers / objects / launch sites.** The catalog lives behind **Add ▸
Piece / part…** (`A`): one searched dialog over prefabs, static pieces, stock parts (layer
target select) and vessel pieces.

**Vertical control**: the translate gizmo ALWAYS shows the vertical arrow (it is the
elevation handle — ground lock only constrains rotation to about-up); newly added pieces
and imported parts **auto-drop to the ground** once their meshes load (the group is lifted
as one, so an imported part keeps its shape); **keep-grounded** (Arrange menu, default on)
re-drops a scaled piece whose bottom sat on the ground before the scale gesture — inside
the same undo step — while below-grade pieces (terrain skirts) are left alone.

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

## Export

`ksa/modPlan.ts` (pure) plans `mod.toml` + `<Mod>Assets.xml` + `<Mod>GameData.xml`
(+ `systems/` once sites exist), byte-faithful to KSA's own GlbToXmlUtility output
(golden tests against the vendored Core fixtures). Preflight: unknown pieces, zero
colliders (vessels fall through), scaled placements with colliders (KSA never scales
colliders), missing FootprintRadius, duplicate ids. Zip download; new mods must be
ENABLED in the game's Settings → Mods.
