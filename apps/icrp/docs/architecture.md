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
along +X, so they stand upright in the static frame unmodified.

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
