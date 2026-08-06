# MULTI-PART PLAN — multiple Parts in one project workspace

**Status**: ready for implementation · **Authored**: 2026-08-06 · **Baseline**: `feature/v2` @ `6068b0a` (v2 complete, no known bugs)

**~66 tasks across 6 phases.** Every code citation (`path:line`) was verified against the
working tree at authoring time; if a file has drifted, re-locate the symbol by name before
editing — the symbol names are the durable reference, line numbers are a convenience.

---

## 0. Overview

### 0.1 The feature

A flexo project currently edits exactly **one** Part. This plan makes a project hold
**N Parts** (N ≥ 1), while every editing surface stays **one-part-at-a-time**:

- A **part switcher dropdown** in the menubar (next to the project chip) picks the
  **active part**. A **New Part** button creates one. Per-part row controls: rename,
  duplicate, delete, reorder, **hide/show**, **opacity**, **workspace offset**, and an
  **include-in-export** toggle.
- All existing panels, modes, tools, selection, undo — everything — operate on the active
  part only, exactly as today. Switching parts swaps what the existing stores hold.
- **Inactive parts render in the same 3D viewport as non-interactive "ghosts"** (real
  meshes + real materials), each with its own visibility, opacity factor, and a
  workspace-only XYZ offset — visual aides for scale/fit while building the active part.
- **Export to KSA emits every included part into the SAME three XML files**
  (`<Base>Part.xml` / `<Base>GameData.xml` / `<Base>Assets.xml`): one `<Part>` +
  `<PartGameData>` (+ its `<SubPartGameData>` variants, `<FixedReaction>`s, custom
  `<SubPart>`s and one `<MeshAtlas>`) **per part**, as siblings under the shared
  `<Assets>` roots. One mod, N parts.

### 0.2 Locked decisions (user-confirmed 2026-08-06 — do not re-litigate)

| # | Decision | Ruling |
|---|---|---|
| D1 | Custom asset scope | **Per-part.** `customTextures` / `customMaterials` / `customMeshes` / `customReactions` stay fields of `EditingPart`. No shared project library. Cross-part reuse = duplicate the part (P2) — never a shared reference. |
| D2 | Existing saved projects | **Purge + clean schema.** Bump `PROJECT_SCHEMA_VERSION` 3 → **4** and `PROJECT_EXPORT_VERSION` 10 → **11**. The snapshot becomes a symmetric `parts[]` shape. All v3 projects, archives and share links are discarded by the existing boot purge with the standard notice. **No migration code of any kind** (constitution). |
| D3 | Ghost layout | **Per-part workspace offset.** Each part carries a workspace-only XYZ offset (meters). The **active part always edits at the origin**; the offset applies only when the part renders as a ghost. Never exported, never undo-tracked. |
| D4 | Export scope | **Per-part include toggle.** Each part carries `includeInExport` (default `true`). Excluded parts are invisible to export preflight, XML, and bundles. Exporting with zero included parts is a preflight blocker. |
| D5 | Isolation | Parts are **fully isolated**: no cross-part selection, animation, coupling, wiring, or references of any kind. The one deliberate cross-part conduit is the **clipboard** (copy in part A, switch, paste into part B — payload is already id-stripped). |
| D6 | Part identity | Each part gets a **stable editor id** (`pt_…`, never exported) and a **display name** ("Part 1", renamable, never exported). The KSA export id remains `EditingPart.partId`, edited in Data ▸ Identity as today. Display name ≠ partId ≠ `gameData.displayName` — three distinct fields with three distinct jobs. |

### 0.3 Verified game-contract facts this plan builds on

Verified in the decomp at `ksa-game-assemblies/current/decomp` (2026-08-06):

1. **An Assets XML file is a flat polymorphic list.** `KSA/AssetBundle.cs` —
   `[XmlRoot("Assets")]` over `public List<SerializedId> Assets` with `[XmlElement]`
   entries for `Part`, `SubPart`, `PartGameData`, `SubPartGameData`, `MeshAtlas`,
   `PbrMaterial`, `FixedReaction`, … **Multiple siblings of every element kind in one
   file are first-class.** (Core itself ships multi-`<Part>` files and a shared
   `PartGameData.xml` — flexo's own catalog parser iterates them:
   `src/ksa/partCatalog.ts:128-183`, `:259`.)
2. **Mesh names register globally, first-wins.** `KSA/MeshAtlasFileReference.cs`
   `DoLoad()` registers each non-`_`-prefixed GLB mesh **by name** via
   `ModLibrary.Register` (returns false on duplicate → the existing mesh is reused).
   Multiple `<MeshAtlas>` elements per file are fine; **mesh names, `<SubPart>` ids,
   `<PartModel>` ids, `<PbrMaterial>` ids and `<FixedReaction>` ids must stay unique
   across ALL parts in the mod** — the uniqueness obligations in §3 exist because of
   this registry.
3. KSA registers `<SubPartGameData Id="T">` **once globally per template id** (the
   root cause of the fixed multi-light-import bug — rationale comment at
   `src/state/editorStore.ts:824-841`, the key sentence at :829-830, documenting
   `templatesAlreadyOwning` at :843). Multi-part export avoids cross-part
   `SubPartGameData` collisions **structurally**, by namespacing export variants per
   part (§3 / P3.03) so no two parts ever attach data to the same SubPart id.

### 0.4 Architecture — the active-part swap

The runtime keeps today's single-part editing surface **unchanged** and adds a thin
part registry around it:

```
                    ┌──────────────── src/state/partsStore.ts (NEW) ────────────────┐
                    │ $partEntries: PartMetaEntry[]   (ALL parts: id/name/view/flags)│
                    │ $activePartId: string                                          │
                    │ inactiveDocs:      Map<partId, InactivePartDoc>  (module-priv) │
                    │ inactiveHistories: Map<partId, HistorySnapshot>  (module-priv) │
                    │ $inactiveRevision: number      (bumped on any inactive change) │
                    │ switchPart / createPart / deletePart / renamePart / …          │
                    └───────────────┬────────────────────────────────────────────────┘
                                    │ park / hydrate on switch
   ┌────────────────────────────────▼─────────────────────────────────┐
   │  THE ACTIVE PART — the entire existing editing surface, UNTOUCHED │
   │  $part ($ editorStore:115) · $selection · $layerView ·            │
   │  $activeLayerId · undo/redo stacks · every mode sub-store         │
   │  (all of them already re-clamp themselves on $part.set —          │
   │   project open proves the whole cascade works)                    │
   └────────────────────────────────┬─────────────────────────────────┘
                                    │ $part.set(...)
              ┌─────────────────────┴──────────────┐
              │ EditorScene reconcile (active part) │   GhostPartsLayer (NEW, P5)
              │ root "flexo-part" — pickable        │   scene sibling — never pickable
              └─────────────────────────────────────┘
```

- `InactivePartDoc = { part: EditingPart; layerView: Record<string, LayerViewState>; activeLayerId: string }`
  — an inactive part parks its document **plus its per-part view state** (layers are
  per-part, so `$layerView`/`$activeLayerId` swap with the part).
- `switchPart(id)` is a **mini project-open**: park the active doc + history into the
  maps, hydrate the target into `$part` / `$layerView` / `$activeLayerId` /
  `importHistory`, `clearSelection()`, `closeChain()`. **Mode, tool (except seat-view,
  see P6.02), camera, and every app-pref survive.** Every mode sub-store self-clamps on
  the `$part.set` (data scope: `src/state/dataModeStore.ts:114-121`; animation:
  `src/state/animationStore.ts:1544-1598`; surface: `surfaceModeStore.ts:199`; engine:
  derived computeds).
- Save / export never race the swap: all swap writes are synchronous, and autosave's
  debounced timers (`SAVE_DEBOUNCE_MS = 300`, `src/state/projectStore.ts:377`) fire
  after the swap completes, reading a consistent final state.

### 0.5 Invariants (cite these in code comments where load-bearing)

- **I1 — The active-part surface is sacred.** No existing store changes shape. No
  consumer of `$part`, `$selection`, `$layerView`, `$activeLayerId`, or any mode store
  learns about parts. Only `partsStore`, persistence, export, the scene's ghost layer,
  and the switcher UI are part-aware.
- **I2 — Single writer for inactive docs.** Only `partsStore` mutates
  `inactiveDocs` / `inactiveHistories`. Everything else reads via `snapshotParts()` /
  `getInactiveDoc()`.
- **I3 — Ids are per-part namespaces.** Entity ids (`_connector1`, `_light1`,
  instance ids, layer ids…) are unique only **within** one part — two parts may both
  contain `_light1`. Nothing may ever build a cross-part map keyed by bare entity id.
  Anything project-wide keys by `(partEntryId, entityId)`.
- **I4 — Asset ids are project-unique.** Blob keys are `pa:<projectId>:<kind>:<assetId>`
  (`src/state/assetDb.ts:110-125`) with **no part segment** — so `CustomTexture.id`,
  `CustomMesh.id`, `importId`, and custom-mesh `subPartId` must be unique across ALL
  parts of a project. Fresh creation already guarantees this (random suffixes); the two
  operations that could violate it — duplicate-part and import-as-new-part — MUST remint
  ids + copy blobs (P2.04/P2.06). Deleting a part sweeps exactly its own assets' blobs.
- **I5 — Ghosts live outside `root`.** The ghost group is a sibling of
  `EditorScene.root` on `viewport.scene`, so it is automatically excluded from picking
  (`SelectionManager` raycasts `root.children` — `src/three/SelectionManager.ts:93`),
  marquee, frame-all (`allEntityGroups()` — `src/three/EditorScene.ts:1888-1898`), and
  thumbnails (capture hides non-light scene siblings — `EditorScene.ts:1835-1840`).
  Every ghost node gets `raycast = () => {}` anyway (belt and braces, and it keeps
  `pickWorldPoint`'s scene-level picks honest).
- **I6 — The part registry is never undoable.** Part create / delete / duplicate /
  rename / reorder / visibility / opacity / offset / include-in-export are lifecycle +
  view state (like project ops and `$layerView`), NOT document mutations: no
  `pushUndo`, ever. Deleting a part destroys its undo history — hence the inline
  confirm. The constitution's undo invariant applies (only) to `$part` mutators, which
  are untouched.
- **I7 — Export is a pure function of `(partsForExport(), projectName, catalog,
  settings)`.** The XML/content builders take explicit part lists; only the existing
  blob/settings reads inside `buildCustomBundle` remain impure (unchanged scope:
  `src/ksa/modExport.ts:373,398,762-764,926,938,958`).
- **I8 — Single-part parity.** A project with one part must behave exactly like today
  in every surface (only additions: the chip shows "Part 1", export XML variant ids
  gain the part namespace token — accepted churn, see P3.03). The P6 checklist walks
  this.
- **I9 — On-demand rendering stays inviolable.** The ghost layer subscribes through
  `EditorScene.sub()` (`src/three/EditorScene.ts:865-872`) and never forces the loop
  continuous.

### 0.6 Vocabulary (use these names verbatim in code)

- **part entry** — one project part: meta (`PartMetaEntry`) + document (`EditingPart`).
- **active part** — the entry whose document is hydrated into `$part`.
- **inactive part / ghost** — parked entries; "ghost" is the scene rendering of one.
- **park / hydrate** — moving the live stores into `inactiveDocs` / out of them.
- **part namespace token (`ns`)** — `sanitizeBaseName(part.partId)`; the per-part token
  in export variant ids. Preflight-guaranteed unique among included parts (P3.02).
- **`SavedPartEntry`** — the persisted form (meta + doc + per-part view state).

### 0.7 Protocol for coding agents

1. **Read before you write.** `AGENTS.md` (constitution — React rules, undo invariant,
   no-migration, fmt/lint workflow) in full; then per phase: the docs listed in the
   phase header. Do not start a task whose cited files you have not opened.
2. **One task at a time, in order.** The repo must compile at every task boundary
   (`pnpm typecheck`) and all tests pass at every phase boundary. Respect **Depends**.
3. **Mandatory end-of-task workflow**: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` →
   `pnpm typecheck` → `pnpm test`. "Verify" blocks list only checks beyond this.
4. **No migration code, ever.** D2 is a purge. If you find yourself reading an old
   field "just in case", stop — that is the forbidden pattern.
5. **Numeric inputs** use `useNumberDraft`-based components with `inputMode="url"`
   (`src/ui/numberDraft.ts:72-156`, wrappers `src/ui/NumberField.tsx:14`,
   `src/ui/PreciseNumberInput.tsx:12`). Never raw `type=number`, never ad-hoc
   `Number(v)` controlled fields.
6. **Layering**: `src/state/` and `src/ksa/` never import react. UI uses `src/ui/kit/`
   primitives (GridList over ListBox). No `useMemo`/`useCallback`/`React.memo`.
7. **Shell rules** (`docs/ui-shell.md:457-471`): every action is a command; dialogs via
   `dialogStore` + `DialogRoot`; z-index tokens only; feedback via `toast()`; hotkeys
   in the scoped registry only.
8. **Docs and scope sync in the same phase** — P3 touches the game contract, so its
   `scope/*.md` tasks are mandatory, not optional (constitution: NON-NEGOTIABLE).
9. **Tests are named per task.** Extend the named file; follow the house pattern
   (heavy `vi.mock` of browser edges, then real store actions —
   `src/state/editorStore.test.ts:1-58` is the reference).

### 0.8 Phase map

| Phase | Delivers | Depends |
|---|---|---|
| **P1** | Part registry (`partsStore`), snapshot schema v4 + purge, per-part undo parking, `switchPart` + CRUD, autosave/meta/counts, tests | — |
| **P2** | Wire format v11 (codec/envelope/archive/share), the clone-a-part primitive (asset remint), duplicate-part, import-as-new-parts | P1 |
| **P3** | Multi-part Export to KSA: merged XML, per-part variant namespace, cross-part preflight, merged bundles, preview + dialog, `scope/` sync | P1 (P2 independent) |
| **P4** | Shell UI: PartChip + dropdown manager, commands/menu/palette/hotkeys, rename dialog, delete confirm, phone reachability | P1, P2 (duplicate), P3 (export toggle surfaced) |
| **P5** | Ghost rendering: `GhostPartsLayer`, per-part offset/opacity/visibility, custom-mesh ghost path, hydrate-all-parts assets | P1 (P4 for the toggles to be reachable) |
| **P6** | Cross-cutting sweeps, docs refresh, smoke step, single-part parity audit | all |

---

## Phase 1 — Part registry, schema v4, switch choreography

**Read first**: `docs/projects.md`, `docs/editor-state.md`, `docs/state-persistence.md`,
`docs/layers.md`. Key code: `src/state/editorStore.ts` (`$part` :115, history :471-695,
`newPart` :4420), `src/state/projectStore.ts` (serialize :159, apply :242, create :673,
autosave :402, purge :558, boot :621), `src/state/projectDb.ts`, `src/state/layerStore.ts`.

**Compile-unit note**: P1.02–P1.04 change one persisted-schema surface and land as one
compile unit — run the full gate after P1.04, not between them.

---

### P1.01 — `partsStore`: types, atoms, id/name helpers

**Files**: NEW `src/state/partsStore.ts`.

**Do**:

1. Create the module with this exact public surface (shapes verbatim):

```ts
import { atom, computed } from 'nanostores';
import type { EditingPart, Vec3 } from '../ksa/types.ts';
import type { LayerViewState } from './layerStore.ts';
import type { ProjectCounts } from './projectDb.ts';

/** Meta for every part in the project, ordered. Never contains the document. */
export interface PartMetaEntry {
  id: string;               // stable editor id 'pt_…' — never exported, never shown
  name: string;             // display name, e.g. "Part 1" — never exported
  visible: boolean;         // ghost visibility when inactive (default true)
  opacity: number;          // ghost opacity 0..1 (default 1)
  offset: Vec3;             // workspace-only ghost offset in meters (default 0,0,0)
  includeInExport: boolean; // default true (D4)
  counts: ProjectCounts;    // refreshed on park/create/load — dropdown chips read this
}

/** What an inactive part parks. Layers are per-part, so view state travels with it. */
export interface InactivePartDoc {
  part: EditingPart;
  layerView: Record<string, LayerViewState>;
  activeLayerId: string;
}

export const $partEntries = atom<readonly PartMetaEntry[]>([]);
export const $activePartId = atom<string>('');
/** Bumped whenever inactiveDocs contents change (switch/create/delete/hydrate). */
export const $inactiveRevision = atom(0);
export const $activePartMeta = computed([$partEntries, $activePartId],
  (entries, id) => entries.find(e => e.id === id) ?? null);

const inactiveDocs = new Map<string, InactivePartDoc>();      // I2: single writer = this module
const inactiveHistories = new Map<string, HistorySnapshot>(); // parked undo/redo per part

export function newPartEntryId(): string { /* 'pt_' + 10 base36 chars via crypto.getRandomValues — copy the pattern of newProjectId (src/state/projectDb.ts:48-54) */ }
export function uniquePartName(base = 'Part', exceptId?: string): string { /* "Part 1", "Part 2", … scanning $partEntries names (mirror uniqueProjectName, src/state/projectIndexStore.ts:241-257) */ }
export function getInactiveDoc(id: string): InactivePartDoc | null { /* map read; null for the active id */ }
```

2. Also export (implemented in P1.05/P1.06; declare stubs now ONLY if you land tasks
   separately — otherwise add them in their tasks): `switchPart`, `createPart`,
   `deletePart`, `renamePart`, `movePart`, `setPartVisible`, `setPartOpacity`,
   `setPartOffset`, `setPartIncludeInExport`, `initPartsForNewProject`, `hydrateParts`,
   `parkHistories`, `snapshotParts`, `inactiveHistoriesRecord`, `partsForExport`.
3. `HistorySnapshot` is imported from `./editorStore.ts` (`src/state/editorStore.ts:595-610`).
   `partsStore` imports FROM `editorStore`/`layerStore`/`chainStore`; nothing in those
   modules may import `partsStore` (no cycles — verify with `pnpm typecheck`).
4. Top-of-file comment: state invariants I1/I2/I3/I6 from the plan §0.5, cited as
   `plans/MULTI_PART_PLAN.md §0.5`.

**Verify**: module compiles; no react import; `pnpm lint` clean.

---

### P1.02 — Persisted schema v4 (`projectDb.ts`)

**Depends**: P1.01. **Files**: `src/state/projectDb.ts`, `src/state/projectStore.ts` (version constant only).

**Do**:

1. In `src/state/projectDb.ts`, DELETE `ProjectSnapshotV2` (:91-102) and add:

```ts
export interface SavedPartEntry {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  offset: Vec3;
  includeInExport: boolean;
  part: EditingPart;
  layerView: Record<string, LayerViewState>;
  activeLayerId: string;
}

export interface ProjectSnapshot {
  version: number;              // PROJECT_SCHEMA_VERSION
  parts: SavedPartEntry[];      // ordered, length ≥ 1
  activePartId: string;         // must name one of parts[i].id
  savedAt: number;
  camera?: CameraState;
  measurements?: LineMeasurement[];
  containers?: ReferenceContainer[];
}
```

   Note what moved: `part`/`layerView`/`activeLayerId` went from snapshot-level into
   each `SavedPartEntry` (layers are per-part). `camera`/`measurements`/`containers`
   stay project-level (they are workspace aids in the shared world frame — the
   established precedent, `src/state/projectDb.ts:100-101`).
2. Reshape `ProjectHistoryRecord` (:109-112) to
   `export interface ProjectHistoryRecord { byPart: Record<string, PersistedPartHistory> }`
   where `PersistedPartHistory` is exactly the previous `{ undo, redo }` payload shape
   (same entry typing as before — one stack pair per part id).
3. `ProjectMeta` (:57-71): DELETE `partId: string`; ADD
   `parts: Array<{ id: string; name: string; partId: string }>` (tiny — meta rows load
   in bulk for the index). `counts` stays one `ProjectCounts` but now means the
   **aggregate across parts**.
4. Add `export function sumCounts(parts: readonly EditingPart[]): ProjectCounts`
   beside `deriveCounts` (:212-226) — `deriveCounts` stays per-part; `sumCounts` maps +
   field-wise adds.
5. In `src/state/projectStore.ts:128`: `PROJECT_SCHEMA_VERSION = 4`, and append the
   changelog line to the comment block (:122-127):
   `// v4: multi-part — snapshot is parts: SavedPartEntry[] + activePartId; layerView/activeLayerId moved per-part; history keyed byPart (plans/MULTI_PART_PLAN.md)`.

**Verify** (after P1.04): typecheck green.

---

### P1.03 — Serialize / normalize / apply / lifecycle in `projectStore.ts`

**Depends**: P1.02. **Files**: `src/state/projectStore.ts`, `src/state/partsStore.ts`,
`src/ui/projects/ProjectManagerDialog.tsx` (mechanical meta-field touches).

**Do** — rework each site in place:

1. **`snapshotParts()` in partsStore** (the composition primitive):

```ts
/** SavedPartEntry[] in $partEntries order. Active part composes from the LIVE stores;
 *  inactive parts from inactiveDocs. Pure read — mutates nothing. */
export function snapshotParts(): SavedPartEntry[] {
  const activeId = $activePartId.get();
  return $partEntries.get().map(meta => {
    const doc = meta.id === activeId
      ? { part: $part.get(), layerView: $layerView.get(), activeLayerId: $activeLayerId.get() }
      : inactiveDocs.get(meta.id)!;
    const { counts: _counts, ...persisted } = meta;   // counts are derived, not persisted
    return { ...persisted, ...doc };
  });
}
```

   (`SavedPartEntry` deliberately has no `counts` — recomputed on load.)
2. **`serializeCurrentSnapshot()`** (`projectStore.ts:159-170`) → returns
   `{ version: PROJECT_SCHEMA_VERSION, parts: snapshotParts(), activePartId: $activePartId.get(), savedAt: Date.now(), camera, measurements, containers }`.
3. **Normalizers** (`projectStore.ts:184-234`):
   - Keep `normalizePart` (per-`EditingPart` template fill) untouched.
   - Add `normalizeSavedPart(e: SavedPartEntry): SavedPartEntry` — default-fill the meta
     fields (`name` → `'Part'`, `visible` → `true`, `opacity` → clamp 0..1 default 1,
     `offset` → `{x:0,y:0,z:0}` with finite-number guard, `includeInExport` → `true`,
     `id` → `newPartEntryId()` if empty), `part: normalizePart(e.part)`,
     `layerView` → object-or-`{}`, `activeLayerId` → string-or-`DEFAULT_LAYER_ID`.
   - `normalizeSnapshot` → normalize every entry, then clamp `activePartId` to an
     existing entry id (fallback `parts[0].id`).
   - `normalizeHistory` → `{ byPart: Record }`: per part id, the existing per-stack
     normalization (`projectStore.ts:224-234` logic applied per entry); drop keys that
     name no part in the snapshot? **No** — normalizeHistory has no snapshot access;
     stale keys are harmless (never hydrated) and die on next write.
4. **`applyProjectSnapshot(snap, history)`** (:242-268):

```ts
suspended = true;   // hydrateParts/initPartsForNewProject calls MUST sit inside this window — $partEntries is an autosave trigger (P1.04(6))
const active = snap.parts.find(p => p.id === snap.activePartId) ?? snap.parts[0];
hydrateParts(snap.parts, active.id);                       // partsStore: REPLACES both module maps (clear inactiveDocs + inactiveHistories first), fills $partEntries (+counts via deriveCounts), parks every non-active entry's doc, bumps $inactiveRevision, sets $activePartId
parkHistories(omit(history.byPart, active.id));            // partsStore: replaces inactiveHistories
importHistory(history.byPart[active.id] ?? { undo: [], redo: [] });
$part.set(active.part);
$activeLayerId.set(active.part.layers.some(l => l.id === active.activeLayerId) ? active.activeLayerId : DEFAULT_LAYER_ID);
$layerView.set(active.layerView);
/* …$measurements/$containers/camera/clearSelection/closeChain/resetModeForProjectLoad exactly as today (:250-266)… */
suspended = false;
```

5. **`createProject`** (:673-696): after `newPart()` add
   `initPartsForNewProject()` — partsStore resets to one entry
   `{ id: newPartEntryId(), name: 'Part 1', visible: true, opacity: 1, offset: {x:0,y:0,z:0}, includeInExport: true, counts: deriveCounts(createEmptyPart()) }`,
   `$activePartId` set, both maps cleared, revision bumped.
6. **`loadProjectAsNew`** (:798-833): the envelope is still single-part until P2 —
   build ONE `SavedPartEntry` from `envelopeToPart(env)` (name `'Part 1'`, defaults)
   and hydrate through the same path as (4). Mark with
   `// P2 (MULTI_PART_PLAN) replaces this with the multi-part envelope`.
7. **IDB-unavailable boot branch** (:626-638): after `newPart()` add
   `initPartsForNewProject()`.
8. **`buildMeta`** (:281-303): `parts: snap.parts.map(p => ({ id: p.id, name: p.name, partId: p.part.partId }))`;
   `counts: sumCounts(snap.parts.map(p => p.part))`.
9. **`deriveCounts` callers + Manager**: `src/ui/projects/ProjectManagerDialog.tsx:142`
   fuzzy filter `p.partId` → `...p.parts.flatMap(x => [x.name, x.partId])`; the search
   placeholder string mentioning "part id" (`ProjectManagerDialog.tsx:162`) stays
   valid; `CurrentCard`'s partId chip (:310-313) shows the first included part's
   `partId` when one part exists, else the literal `N parts`; anywhere else
   `meta.partId` is read (grep `\.partId` under `src/ui/projects/` and
   `src/state/projectIndexStore.ts`) update mechanically. Add a "N parts" line to the
   card/row bodies only if trivially slot-able here; otherwise defer to P6.05.
10. **Boot-purge probe** (`purgeIncompatibleProjects`, `projectStore.ts:563-572`):
   the content probe currently requires `snap.part && Array.isArray(snap.part.layers)`
   (:569) — v4 snapshots have no `snap.part`, so WITHOUT this change every freshly
   saved v4 project purges itself on reload. Rewrite the probe to
   `Array.isArray(snap.parts) && snap.parts.length >= 1 && snap.parts.every(p => p?.part && Array.isArray(p.part.layers)) && typeof snap.activePartId === 'string'`.
   (P1.09 adds the tests; the CODE change is here.)

**Verify** (after P1.04): full gate; then `pnpm test src/state/projectStore.test.ts`
fails only in the ways P1.09 fixes (schema-shaped assertions).

---

### P1.04 — History: per-part parking + persistence

**Depends**: P1.03. **Files**: `src/state/projectStore.ts`, `src/state/partsStore.ts`.

**Do**:

1. partsStore keeps `inactiveHistories: Map<string, HistorySnapshot>` (P1.01). Add:
   - `parkHistories(byPart: Record<string, HistorySnapshot>)` — replace map contents.
   - `inactiveHistoriesRecord(): Record<string, HistorySnapshot>` — plain copy out.
2. **`writeHistory()`** (`projectStore.ts:318-324`) → persists
   `{ byPart: { ...inactiveHistoriesRecord(), [$activePartId.get()]: exportHistory() } }`.
   (`exportHistory` — `src/state/editorStore.ts:617-634` — unchanged.)
3. History bytes accounting (`lastHistoryBytes`, ~:308-324): measure the whole
   `byPart` record — no per-part split needed.
4. `MAX_UNDO = 50` (`editorStore.ts:471`) is **per part** by construction (each part
   has its own stacks). State this in a one-line comment at the constant.
5. **Autosave wiring (BLOCKER-grade — do not skip)**: `startAutosave()`
   (`projectStore.ts:402-415`) additionally subscribes **`$partEntries`** — rename /
   reorder / visibility / opacity / offset / include-in-export / delete-inactive /
   add-imported all flow through it and would otherwise never persist (worst case:
   `deletePart(inactive)` sweeps blobs immediately, then a reload restores the part
   from the stale snapshot with its binaries gone). Part switches are already covered
   by the `$part` subscription. `$activePartId` gets its own subscribe too (a switch
   with zero document edits must still persist the new active pointer). Update the
   autosave doc comment above `startAutosave` accordingly. The registry-reset calls
   (`initPartsForNewProject` / `hydrateParts`) run inside the existing
   `suspended = true` windows (P1.03(4)/(5)).
6. **Known aid-history wormhole (accepted — document, don't fix)**: `HistoryEntry`
   snapshots the project-level aids alongside the part
   (`editorStore.ts:422-429,541-545`; `$measurements`/`$containers` are the only
   non-`$part` undo participants). With per-part stacks, undoing in part A restores
   the aids as they were when A's entry was pushed — which can be older than aid
   edits made while part B was active. This interleaving is rare (aid edits are
   infrequent) and self-healing (redo/further edits win); fixing it would mean
   rebasing parked stacks or evicting aids from undo — both worse. Add a comment at
   the `HistoryEntry` declaration citing this plan section, and list it in
   Appendix B.

**Verify**: full gate (this closes the P1.02–P1.04 compile unit). App boots, creates a
fresh project, autosaves, reloads — single part, everything behaves as before.

---

### P1.05 — `switchPart()` choreography

**Depends**: P1.04. **Files**: `src/state/partsStore.ts`.

**Do**: implement exactly this sequence (a mini `applyProjectSnapshot` — compare
`src/state/projectStore.ts:242-268` — minus project-level state):

```ts
/** Park the live active-part stores into the registry. Shared by switch/create/delete. */
function parkActive(): void {
  const activeId = $activePartId.get();
  inactiveDocs.set(activeId, {
    part: $part.get(),
    layerView: $layerView.get(),
    activeLayerId: $activeLayerId.get(),
  });
  inactiveHistories.set(activeId, exportHistory());
  refreshCounts(activeId, $part.get());            // deriveCounts → $partEntries entry
}

export function switchPart(id: string): boolean {
  if (id === $activePartId.get()) return false;
  if (!$partEntries.get().some(e => e.id === id)) return false;
  parkActive();
  const doc = inactiveDocs.get(id)!;   inactiveDocs.delete(id);
  const hist = inactiveHistories.get(id) ?? { undo: [], redo: [] };
  inactiveHistories.delete(id);
  $activePartId.set(id);
  importHistory(hist);                              // editorStore.ts:642
  $part.set(doc.part);                              // ← the cascade: scene reconcile + every mode-store clamp
  $activeLayerId.set(doc.part.layers.some(l => l.id === doc.activeLayerId) ? doc.activeLayerId : DEFAULT_LAYER_ID);
  $layerView.set(doc.layerView);
  clearSelection();                                 // editorStore.ts:2103
  closeChain();                                     // chainStore — same contract as project load (projectStore.ts:253)
  bumpInactiveRevision();
  return true;
}
```

Deliberate NON-actions (each gets a comment): no `pushUndo` (I6); no
`resetModeForProjectLoad()` — the mode survives a part switch by design (mode
sub-stores self-clamp: `dataModeStore.ts:114-121`, `animationStore.ts:1544-1598`,
`surfaceModeStore.ts:199`, engine computeds); no camera touch; no autosave suspension —
every write above is synchronous, so the 300 ms/1500 ms debounced writers
(`projectStore.ts:377-378`) observe only the final state.

**Verify**: unit path in P1.09. Manual (via devtools until P4):
`window.__editorScene` exists; run `createPart()` / `switchPart()` from the console
import — scene swaps, undo isolated per part, mode preserved.

---

### P1.06 — Part CRUD + view setters (minus duplicate)

**Depends**: P1.05. **Files**: `src/state/partsStore.ts`.

**Do**:

1. `createPart(name?): string` — `parkActive()`; push a fresh
   `PartMetaEntry` (`uniquePartName('Part')`, defaults as P1.03(5),
   `counts: deriveCounts(createEmptyPart())`); `$activePartId.set(newId)`;
   `importHistory({undo:[],redo:[]})`; `$part.set(createEmptyPart())`
   (`src/ksa/types.ts:2314`); `$activeLayerId.set(DEFAULT_LAYER_ID)`;
   `$layerView.set({})`; `clearSelection()`; `closeChain()`; bump revision.
   **No user feedback here** — partsStore never imports `src/ui`; the P4.01 command
   layer owns every toast.
2. `deletePart(id): boolean` —
   - refuse (`return false`) when `$partEntries.get().length <= 1` (UI disables; the
     guard is authoritative).
   - if `id === $activePartId.get()`: pick the fallback entry (next index, else
     previous) and `switchPart(fallback)` FIRST — this parks the doomed part.
   - capture `const doomed = inactiveDocs.get(id)!` **before** removal, then remove the
     meta entry, `inactiveDocs.delete(id)`, `inactiveHistories.delete(id)`, bump
     revision.
   - blob sweep WITHOUT an import cycle: partsStore may not import
     `customAssetStore` (which imports partsStore for `snapshotParts` — P1.07).
     Mirror the `registerEditorAidStores` slot pattern (`editorStore.ts:398-419`):
     partsStore exports `registerPartAssetSweeper(fn: (doc: EditingPart) => Promise<void>)`
     holding one module-private slot; `deletePart` calls
     `void assetSweeper?.(doomed.part)` fire-and-forget. `customAssetStore` registers
     `sweepPartAssets` at its init (P1.07(4)).
3. `renamePart(id, rawName): string` — trim; empty → keep current; else
   `uniquePartName(trimmed, id)`-style dedupe (append " 2", " 3"); update entry;
   return applied name (mirror `renameProject`, `src/state/projectIndexStore.ts:264-274`).
4. `movePart(id, dir: -1 | 1): void` — swap within `$partEntries` (dropdown order;
   NOT export order semantics beyond file ordering — parts serialize in entry order).
5. `setPartVisible(id, v)`, `setPartOpacity(id, v /* clamp 0..1 */)`,
   `setPartOffset(id, offset /* per-axis Number.isFinite guard, else keep */)`,
   `setPartIncludeInExport(id, v)` — pure `$partEntries` updates. These are **view
   state** (I6): never undo, persisted only via the snapshot.
6. `partsForExport(): Array<{ entryId: string; name: string; part: EditingPart }>` —
   `snapshotParts().filter(p => p.includeInExport)` mapped; used by P3.

**Verify**: P1.09 tests.

---

### P1.07 — Custom-asset hydration covers ALL parts; per-part blob sweep

**Depends**: P1.05. **Files**: `src/state/customAssetStore.ts`, `src/state/assetDb.ts`.

**Why**: blob URLs and import atlases are hydrated per project for the ACTIVE document
only (`hydrateCustomAssets`, `customAssetStore.ts:2229-2258`, subscribed to
`$currentProjectId` at :2288). After a part switch the incoming part's textures /
imported GLBs would have no object URLs → surface mode and the scene break. Ghosts
(P5) need the same. Fix it at the root: hydrate the whole project.

**Do**:

1. In `hydrateCustomAssets()` (:2229-2258; the single-part read is `$part.get()` at
   :2236): iterate `snapshotParts().map(p => p.part)` instead when (re)building
   `textureKtx2Urls` (:124) / `textureSrcUrls` (:126) / `emissivePaintUrls`
   (:128) and when re-registering import atlases
   (`registerImportAtlas` — `src/three/importedMeshCache.ts:46-52`). The union of all
   parts' `customTextures` / `customMeshes` / import batches is hydrated.
2. The `$part.subscribe` at :2298 (mesh-signature → `refreshCatalog()` rebuild) stays
   ACTIVE-part-only — `$customCatalog` / `customMeshRenderCache` remain the active
   part's render set (I1). Add a comment saying so.
3. Revocation audit — precise scope: the project-switch revocation (:2230-2234 +
   `clearImportAtlases()`) already iterates the URL maps themselves, which after (1)
   hold the all-parts union — verify, don't restructure. The ACTIVE-part-scoped
   deleters (`removeCustomTexture` :1126, `removeUnusedAssets` :1161) are asset
   operations on the active part and stay active-part-scoped — that is CORRECT under
   D1/I4 (each part owns its assets); add a one-line comment at each saying so. Do
   NOT re-point them at `snapshotParts()`.
4. NEW `export async function sweepPartAssets(doc: EditingPart): Promise<void>` in
   `customAssetStore.ts`, and register it into partsStore's sweeper slot
   (`registerPartAssetSweeper(sweepPartAssets)`) from `initCustomAssets()` — the
   cycle-free wiring defined in P1.06(2). The sweep: collect this doc's blob keys —
   `assetKeys.textureSource/textureKtx2` per `doc.customTextures[].id`,
   `assetKeys.meshGlb` per custom mesh id, `assetKeys.importGlb` per distinct
   `imported.importId`, `assetKeys.emissivePaint` per mesh id with a painted emissive
   (`EmissiveConfig{shape:'painted'}` — `src/ksa/types.ts:1896-1913`) — delete them via
   an `assetDb` bulk-delete helper (add `export async function deleteAssetKeys(keys: string[])`
   beside `deleteProjectAssets`, `src/state/assetDb.ts:178`), revoke+drop any live
   object URLs for those ids, AND call `releaseImportAtlas(importId)`
   (`src/three/importedMeshCache.ts:161-172`) for each swept import batch. Safe under
   I4 (ids are project-unique).

**Verify**: extend `src/state/customAssetStore.test.ts` — two-part fixture (use
partsStore to park one part with a texture): hydration produces URLs for BOTH parts'
textures; `sweepPartAssets(partA)` deletes exactly partA's keys (partB's survive).

---

### P1.08 — EditorScene reconcile: template-change guard

**Depends**: P1.05. **Files**: `src/three/EditorScene.ts`, `src/three/SubPartObject.ts`.

**Why**: `reconcile()` reuses an existing `SubPartObject` for a surviving `instanceId`
and only calls `setPlacement` (`src/three/EditorScene.ts:879-938`, reuse at :895).
Under I3, part A and part B can BOTH have `trussbara_1` — with different templates. A
switch would silently keep A's mesh under B's id. (The same latent hazard exists across
`openProject` today.)

**Do**:

1. `SubPartObject` records its template: add `readonly templateId: string` set in
   `create()` from `placement.subPartTemplateId` (`src/three/SubPartObject.ts:55-92`).
2. In `reconcile()`'s reuse branch (the `existing.setPlacement(placement); continue;`
   at :892-897): if `existing.templateId !== placement.subPartTemplateId` →
   `root.remove(obj)`, `obj.dispose()`, delete from `this.objects`, and fall through
   to the create path (mirror the removal loop :883-889). ALSO extend the **async
   completion guard** (:900-905, currently existence-only) to discard when
   `latest.subPartTemplateId !== placement.subPartTemplateId` — mirror the kitten
   kind re-check at :1133-1136.
3. Audit the other four reconcilers for kind-defining prop changes across same-id
   swaps — `reconcileConnectors` (:1236), `reconcileColliders` (:1295, shape),
   `reconcileIvaSeats` (:1261), `reconcileLights` (:1368, type/owner), kittens (:1113,
   kind). For each: if the existing update path already rebuilds on that prop change,
   add a one-line comment confirming it; if not, apply the same dispose-and-recreate
   guard keyed on the defining prop (`collider.shape`, `light.type` + owner count,
   `kitten.kind`).

**Verify**: manual — two parts, same first-placed template name in both but different
catalog templates (e.g. add TrussBarA in part A; in part B add a different SubPart
first so `<template>_1` ids collide across parts), switch back and forth: meshes always
match the outliner. P6.10 smoke covers it too.

---

### P1.09 — Phase 1 tests

**Depends**: P1.01–P1.08. **Files**: NEW `src/state/partsStore.test.ts`,
`src/state/projectStore.test.ts`, `src/state/editorStore.test.ts` (one addition).

**Do** — follow the mock pattern of `src/state/projectStore.test.ts:26-87` (in-memory
projectDb/assetDb maps):

1. `partsStore.test.ts` — NEW suites:
   - **init**: `initPartsForNewProject()` → one entry "Part 1", active, empty maps.
   - **create**: `createPart()` parks the old active (doc + history retrievable),
     switches, fresh empty `$part`, fresh history (`$canUndo === false`), unique names
     "Part 2", "Part 3".
   - **switch round-trip**: place a subpart in A (via `addSubPart`), set a layer
     opacity in `$layerView`, switch to B, assert `$part` empty + `$layerView` empty +
     `$activeLayerId === DEFAULT_LAYER_ID`; switch back, assert doc/layerView/
     activeLayerId restored exactly; `$inactiveRevision` bumped each switch.
   - **undo isolation**: mutation in A (`$canUndo` true) → switch to B (`$canUndo`
     false) → mutate B, undo in B (B's mutation reverts) → switch to A → `$canUndo`
     true and `undo()` reverts A's mutation.
   - **delete**: refuses when single; deleting active falls back to the neighbor;
     deleting inactive keeps active; doomed part's history gone after re-create of the
     same name.
   - **rename/reorder/view setters**: dedupe " 2" suffix; `movePart` order; opacity
     clamps to [0,1]; offset rejects non-finite; `includeInExport` flips;
     `partsForExport()` filters.
   - **selection/chain cleared**: seed `$selection` + a `$chainSession`, switch,
     assert both cleared.
2. `projectStore.test.ts` — update the schema-shaped assertions and add:
   - round-trip: two parts with distinct layer views + active = second → reload →
     registry, active doc, per-part layerView/activeLayerId, history byPart all
     restored.
   - purge: a stored row with `schemaVersion: 3` (old shape) is purged with the
     notice; a v4 row with `parts: []` or a non-array fails the P1.03(10) probe; a
     valid v4 row survives a reload (the self-purge regression guard).
   - autosave triggers: `setPartOpacity` alone schedules a snapshot write within the
     300 ms debounce; `deletePart(inactive)` alone schedules one; a bare `switchPart`
     persists the new `activePartId` (P1.04(5)).
   - meta: `parts` array (id/name/partId) + aggregated `counts` (`sumCounts`).
   - `duplicateProject` still copies every part (whole-project blob copy is untouched
     — `copyProjectAssets`, `src/state/assetDb.ts:194`).
3. `editorStore.test.ts` — one new `it`: "part switch parks and restores history
   stacks losslessly" (drive `exportHistory` shape equality through a switch cycle).

**Verify**: `pnpm test` fully green. This closes Phase 1.

---

## Phase 2 — Wire format v11, clone-a-part, duplicate, import modes

**Read first**: `docs/projects.md` (§archives/share), `src/state/projectTransfer.ts`
header comment (:52-54 — purity layering), `src/state/projectCodec.ts` changelog
(:75-109), `src/state/projectArchive.ts` (adoption :353-473, importArchive :500-541).

**Compile-unit note**: P2.01–P2.03 reshape one wire surface; run the full gate after
P2.03. Three untouched callers sit on the old shapes until P2.06
(`projectArchive.ts` :189/:521-540, `editorStore.importProjectData` :1131,
`ImportProjectDialog.tsx`) — P2.03(5) makes the mechanical signature-only touches so
the gate passes; their multi-part behavior lands in P2.06.

---

### P2.01 — Transfer envelope: parts[]

**Depends**: P1. **Files**: `src/state/projectTransfer.ts`.

**Do**:

1. Reshape the envelope (`projectTransfer.ts:122-129`):

```ts
export interface PartTransferEntry {
  name: string;              // display name at export time
  sourcePartId: string;      // part.partId (advisory — same role as today's field)
  includeInExport: boolean;
  visible: boolean;
  opacity: number;
  offset: Vec3;
  data: ProjectExportData;   // UNCHANGED per-part shape (:81-115)
}
export interface ProjectExportEnvelope {
  format: typeof PROJECT_EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  projectName: string;
  activePartIndex: number;   // index into parts[] that was active
  parts: PartTransferEntry[];
}
```

   Registry entry ids (`pt_…`) deliberately do NOT travel — they are project-internal;
   import mints fresh ones.
2. `buildProjectExport` (:230-261) → signature
   `buildProjectExport(parts: Array<{ name: string; visible: boolean; opacity: number; offset: Vec3; includeInExport: boolean; part: EditingPart }>, projectName: string, opts?)`
   — per entry, run the existing single-part body (structuredClone + the
   `includeBinaryBacked` gate at :255-256) producing one `PartTransferEntry`. Stays
   pure (no store imports — the module's law, :52-54).
3. `dropUnbackedAssets` (:359-420) and `stripDeadTextureRefs` (:423-444) run **per
   entry** when `binaryAssets` is null.
4. `hasCustomAssets` (:208-210) → takes the parts array, `some()` over entries.
5. `envelopeToPart` (:453-481) → `envelopeToParts(env): Array<{ name; visible; opacity; offset; includeInExport; part: EditingPart }>`
   (existing body mapped per entry).
6. `mergeProjectImport` (:501-875) keeps its `(current: EditingPart, env-entry-data …)`
   single-part signature — it is the **merge-into-one-part** primitive and is NOT
   multi-part aware. Adjust only its input plumbing: callers now hand it ONE
   `PartTransferEntry`'s data (+ the envelope's `projectName`/`sourcePartId` where it
   reads those — :513-515).

---

### P2.02 — Codec v11

**Depends**: P2.01. **Files**: `src/state/projectCodec.ts`.

**Do**:

1. Extract the existing per-part key set of `CompactProject` (:1478-1499 — everything
   except `f`/`v`/`n`; note today's shape ALSO carries a top-level `pid`, which moves
   into the per-part entry; this explicit list is authoritative) into
   `interface CompactPartBody { tg? g? sg? l? p? c? cl? iv? li? ifl? k? a? m? tex? mat? cr? }`,
   and extract matching `encodePartBody(data: ProjectExportData): CompactPartBody` /
   `decodePartBody(raw): ProjectExportData` from `encodeProject`/`decodeProject`
   (:1502-1560) — pure refactor of existing code.
2. New wire shape:

```ts
interface CompactPartEntry extends CompactPartBody {
  nm?: string;                                        // name
  pid?: string;                                       // sourcePartId
  ie?: 0 | 1;                                         // includeInExport (absent = 1)
  vw?: [vis: 0 | 1, opacity: number, ox: number, oy: number, oz: number]; // view (absent = defaults)
}
export interface CompactProject {
  f: typeof PROJECT_EXPORT_FORMAT;
  v: number;
  n?: string;                                         // project name
  ap?: number;                                        // activePartIndex (absent = 0)
  pts: CompactPartEntry[];
}
```

3. `encodeProject`/`decodeProject` loop `pts`; decode stays **total/tolerant** (missing
   fields → defaults; malformed entry → skipped with the module's established
   tolerance style).
4. `PROJECT_EXPORT_VERSION = 11` (:110) + changelog line:
   `// v11: multi-part — pts: CompactPartEntry[] (nm/pid/ie/vw + per-part body); ap = active index; top-level pid/tg/g/… keys removed (plans/MULTI_PART_PLAN.md)`.
   Import accepts **exactly** 11. The gates: `parseProjectObject` at
   `projectTransfer.ts:313-320` (its message currently names only the payload's
   version — update it to name BOTH numbers, matching the archive style) and
   `projectArchive.ts:284-289` (already names both; the container-version gate at
   :278-283 is separate and unchanged).

---

### P2.03 — Import/load paths on v11

**Depends**: P2.02. **Files**: `src/state/projectStore.ts`,
`src/state/projectShareLink.ts`, `src/ui/projects/ShareLinkDialog.tsx`,
`src/state/partsStore.ts`.

**Do**:

1. **`loadProjectAsNew`** (`projectStore.ts:798-833`): replace the P1.03(6) single-part
   adapter — map `envelopeToParts(env)` to `SavedPartEntry[]` (fresh `newPartEntryId()`
   per entry, `layerView: {}`, `activeLayerId: DEFAULT_LAYER_ID`), active =
   `env.activePartIndex` clamped, then the same hydrate path as `applyProjectSnapshot`.
   `opts.adoptAssets` timing (blob copy BEFORE the docs land — comment at :798-833)
   is preserved.
2. **Share link build** (`projectShareLink.ts:35-40` producers): build from
   `snapshotParts()` mapped to `buildProjectExport` entries (all parts travel,
   including excluded-from-export ones — the share is a project transfer, not a KSA
   export; note this in a comment).
3. **`ShareLinkDialog.tsx:128`**: `hasCustomAssets` call site now passes the parts
   array; behavior (explainer + "Export archive instead…") unchanged.
4. partsStore gains `addImportedParts(entries: Array<{ name; visible; opacity; offset; includeInExport; doc: InactivePartDoc }>): string[]`
   — appends meta entries (names uniquified, fresh ids, counts derived), parks docs
   into `inactiveDocs`, bumps revision, returns new ids. **No switch** here (the caller
   decides).
5. **Compile-unit closers** (mechanical only — behavior lands in P2.06):
   `projectArchive.ts` (:189 envelope build, :521-540 import chain),
   `editorStore.importProjectData` (:1131 — now takes one `PartTransferEntry`'s
   data), and `ImportProjectDialog.tsx` get signature-level updates so
   `pnpm typecheck` passes; the archive import temporarily supports only `'new'` +
   single-entry merge until P2.06 replaces the mode logic.

**Verify** (closes P2.01–P2.03 unit): full gate; share-link round-trip by hand in the
browser (2-part project → copy link → open in a new tab → both parts present, active
index honored).

---

### P2.04 — `clonePartWithFreshAssets` (the safety-critical primitive)

**Depends**: P1.07. **Files**: NEW `src/state/partClone.ts`, `src/state/assetDb.ts`
(reuse helpers), NEW `src/state/partClone.test.ts` (in P2.07).

**Why**: I4 — asset ids and custom-mesh `subPartId`s must be unique across ALL parts of
a project (shared `pa:<projectId>:…` blob namespace + KSA's global mesh/SubPart id
registry, §0.3). A naive `structuredClone` of a part would alias blobs (delete-in-one
kills the other's binaries) and collide SubPart ids at export.

**Do**: implement

```ts
export async function clonePartWithFreshAssets(source: EditingPart, projectId: ProjectId): Promise<EditingPart>
```

as `structuredClone(source)` followed by **exactly five id-family remaps** and their
blob copies. Build each remap as `Map<oldId, newId>` first, then apply in one walk.

| Family | New id | Every reference site to rewrite |
|---|---|---|
| **Texture id** (`CustomTexture.id`) | `tex_` + fresh short id (mint like `customAssetStore`'s existing texture creation — grep `'tex_'`) | `part.customTextures[].id`; `faceTextures[*].textureId` on every `CustomMesh` (`src/ksa/types.ts:1763`); all six `CustomMaterial` channel texture-id slots (enumerate via `materialTextureIds`, `types.ts:1744-1759` — rewrite each corresponding field) |
| **Material id** (`CustomMaterial.id`) | `mat_` + fresh short id | `part.customMaterials[].id`; `CustomMesh.materialId` (`types.ts:1990`) |
| **Mesh id** (`CustomMesh.id`) | `mesh_` + fresh short id | `part.customMeshes[].id` (blob key + emissive-paint key only — nothing else references it) |
| **Custom-mesh template id** (`CustomMesh.subPartId`) | re-mint via the SAME generators used at authoring: `flexo_<sanitized-name>_<shortId>` (custom — `customAssetStore.ts:1294`), kitten variant (`:1322`), imported (`importNormalize.ts:239,299-302` pattern) | `CustomMesh.subPartId`; `SubPartPlacement.subPartTemplateId` (custom placements only); the `subPartTemplateId` field of each `SubPartGameData` entry (member declared `types.ts:1274`; the array to walk is `EditingPart.subPartGameData`, `:2233`); `internalFlags` keys (`:2243`); `PartCollider.ownerTemplateId` (`:173`) and `PartLight.ownerTemplateId` (`:248`) when they name a custom mesh. **This list is COMPLETE** — do NOT touch `ConsumerFeedWiring.consumerId` or `SubPartIdRef.id`: both carry MODULE template ids ("ThrustChamber"-class, `types.ts:696`, `:870-876`), never custom-mesh template ids, and their `subPartInstanceId` companions are placement instance ids that stay untouched under I3. ⚠️ `imported.meshName` is deliberately NOT touched — it keys geometry lookup inside the copied GLB by its ORIGINAL name (`types.ts:1831` documents `meshName == subPartId`, an equality that holds only for original imports; a clone breaks it on purpose) |
| **Import batch id** (`ImportedMeshSource.importId`) | `imp_` + fresh short id | every `CustomMesh.imported.importId` in the same batch (`ImportedMeshSource` `types.ts:1828`, `importId` `:1830`) |

Deliberately NOT remapped (I3 — per-part namespaces): `instanceId`s, connector ids,
collider/light/seat/kitten/layer ids, animation ids, tank/container ids, `partId`
(caller's concern), `customReactions[].id` (identical clones dedupe at export — P3.05;
divergent edits surface as a preflight blocker with a clear message).

**Blob copies** (via `getAsset`/`putAsset` on `flexo-assets`, keys from `assetKeys` —
`src/state/assetDb.ts:110-125`): for each mapped id that has a stored blob —
`tex-src` + `tex-ktx2` per texture, `import-glb` per import batch, `emissive-paint` per
**mesh id** with a painted emissive (`EmissiveConfig{shape:'painted'}`,
`types.ts:1896-1919`). Copy old→new key; skip silently when the source blob is absent
(matches the container-gate tolerance). Then `hydrateCustomAssets()` is NOT called here
— the caller (P2.05/P2.06) triggers it once after registering the part.

**Verify**: P2.07 tests — this task is test-heavy by design.

---

### P2.05 — `duplicatePart`

**Depends**: P2.04. **Files**: `src/state/partsStore.ts`.

**Do**: `export async function duplicatePart(id: string): Promise<string | null>` —

1. Resolve the source doc: `id === $activePartId.get()` → compose from live stores
   (same read as `parkActive`, without mutating); else `inactiveDocs.get(id)`.
2. `const cloned = await clonePartWithFreshAssets(doc.part, $currentProjectId.get())`.
3. `partId` nicety: if `cloned.partId !== DEFAULT_PART_ID` (`src/ksa/types.ts:354`) →
   `cloned.partId = cloned.partId + '_copy'` (duplicate part ids are a P3 preflight
   blocker; this keeps the common case green).
4. New meta entry after the source's index: name = `uniquePartName('<source name> copy')`
   pattern (dedupe with " 2" suffixes), view + `includeInExport` copied, counts derived.
5. Park it: `inactiveDocs.set(newId, { part: cloned, layerView: structuredClone(source layerView), activeLayerId: source activeLayerId })`;
   no history entry (a copy starts with empty undo).
6. `hydrateCustomAssets()` (pick up the new blobs/URLs), bump revision, then
   `switchPart(newId)` (feedback: you land in the copy).
7. Returns the new id; the P4 command layer toasts.

---

### P2.06 — Archive + import modes

**Depends**: P2.03, P2.04. **Files**: `src/state/projectArchive.ts`,
`src/ui/projects/ImportProjectDialog.tsx`.

**Do**:

1. **`buildProjectArchive`** (:151-224): reads `snapshot.parts` (stored snapshot,
   never live — keep the :144-149 contract); envelope via the new
   `buildProjectExport`; blob collection unchanged (flat `listProjectBlobs` — valid
   under I4); manifest (:82-92): `counts` = `sumCounts`, ADD
   `parts: Array<{ name: string; partId: string }>` for the import preview UI.
2. **`importArchive`** (:500-541) — three modes now:
   - `'new'` → `loadProjectAsNew` (multi-part, P2.03) + `copyBlobsVerbatim` (:476-480)
     unchanged.
   - `'add-parts'` (replaces `'merge'` as the default second option): per envelope
     entry — run the adoption plan against **an empty destination part** (all-fresh
     ids; reuse `planAssetAdoption`/`copyAdoptedBlobs` :353-473 with
     `destination = createEmptyPart()`; note `copyAdoptedBlobs` already carries
     emissive-paint blobs old-mesh-id → new-mesh-id at :450-452), apply
     `mergeProjectImport` into that empty part (same call chain as today's merge,
     minus the store write), collect `InactivePartDoc`s — each with
     `layerView: {}` and `activeLayerId: DEFAULT_LAYER_ID` (the merge's mirrored
     layers make the empty view correct) — then ONE `addImportedParts(entries)` +
     `hydrateCustomAssets()` + `switchPart(firstNewId)`.
   - `'merge-into-active'` (the old paste-into-part behavior): allowed **only when**
     `env.parts.length === 1`; the existing `importProjectData` path
     (`editorStore.ts:1131-1153`, single undo step) with adoption against the ACTIVE
     part — unchanged semantics.
3. **`ImportProjectDialog.tsx`**: mode choice becomes three radio rows — "New project" /
   "Add as new part(s)" / "Merge into active part" (disabled with reason "source has
   N parts" when N > 1). Show the manifest's part list (name + partId) in the preview
   area. Keep the pasted-JSON path (`:148-156`) — it parses the v11 envelope with
   `binaryAssets: null`.

---

### P2.07 — Phase 2 tests

**Depends**: P2.01–P2.06. **Files**: `src/state/projectCodec.test.ts`,
`src/state/projectTransfer.test.ts`, `src/state/projectArchive.test.ts`,
NEW `src/state/partClone.test.ts`, `src/state/partsStore.test.ts`.

**Do**:

1. `projectCodec.test.ts`: v11 encode/decode round-trip of a 2-part project (distinct
   bodies, view tuple, `ie: 0` on one, `ap: 1`); tolerant decode (missing `vw`/`ie` →
   defaults); a v10-shaped payload is rejected by the version gate with both numbers
   in the message.
2. `projectTransfer.test.ts`: `buildProjectExport` with 2 entries structuredClones per
   entry; `dropUnbackedAssets` drops per-entry independently (unbacked import in part
   A doesn't strip part B); `envelopeToParts` order + view fields; `hasCustomAssets`
   over the array.
3. `partClone.test.ts` (NEW; mock `./assetDb` like `editorStore.test.ts:1-58`): build a
   maximal source part — texture (with src+ktx2 blobs), material referencing it, a
   primitive custom mesh with `faceTextures` + painted emissive (blob), an imported
   batch of two meshes (one `import-glb` blob), a kitten mesh, a placement of each,
   `subPartGameData` for the custom template + `internalFlags` + a template-owned
   light + collider on the custom template, plus `consumerFeedWiring` and a rocket
   `SubPartIdRef` referencing MODULE template ids. Assert after clone: (a) zero id
   overlap with the source across all five families; (b) every reference site from
   the P2.04 table resolves to the NEW ids; (c) blob store contains copies under the
   new keys and originals untouched; (d) emissive-paint blob followed the mesh-id
   remap; (e) `imported.meshName` values are byte-identical to the source's
   (deliberately NOT reminted); (f) instance/connector/layer/animation ids UNCHANGED;
   (g) `consumerFeedWiring.consumerId` / `SubPartIdRef.id` / all
   `subPartInstanceId`s UNCHANGED; (h) reaction ids unchanged.
4. `partsStore.test.ts`: `duplicatePart` — lands after source, name " copy", switches,
   empty history, `partId` suffixed only when non-default.
5. `projectArchive.test.ts`: multi-part archive round-trip (every part, every blob,
   manifest parts list + summed counts); `'add-parts'` into a project — entries
   appended, fresh ids, blobs copied, active switched to first new; `'merge-into-active'`
   refused for a 2-part source.

**Verify**: `pnpm test` green. Phase 2 closes.

---

## Phase 3 — Export to KSA: N parts, same three files

**Read first**: `docs/xml-io.md`, `docs/custom-assets.md`,
`scope/part-and-subpart-xml.md` (⭐ master invariant), `scope/custom-assets-and-mod-export.md`,
`src/ksa/modExport.ts` header (:58-74). **This phase touches the game contract — the
`scope/` tasks (P3.11) are constitutionally mandatory in the same phase.**

Target output (unchanged file names, richer contents):

```
flexo-parts/
├── mod.toml
├── <Base>Part.xml        ← N × <Part Id=…> siblings (one per included part)
├── <Base>GameData.xml    ← N × <PartGameData> + each part's <SubPartGameData> variants
│                            + deduped <FixedReaction>s, all siblings under <Assets>
├── <Base>Assets.xml      ← N × <MeshAtlas> + each part's <PbrMaterial>/<SubPart> entries
├── Meshes/<Base>_<meshId>_MeshAtlas.glb          (one PER PART with custom meshes)
├── Textures/…            (id-/token-namespaced — already collision-free per I4)
└── Animations/…          (anim-id-suffixed — already collision-free)
```

Legality basis: §0.3 (AssetBundle = flat `List<SerializedId>`; global first-wins
registries). `<Base>` stays `sanitizeBaseName(projectName)` (`modExport.ts:82-85`).

**Compile-unit note**: P3.03–P3.04 land together (the serializers + their `modExport`
call sites), and P3.07–P3.09 land together (bundle/zip/folder signatures + preview
store + dialog) — run the full gate after P3.04 and after P3.09, not between.

**Global uniqueness obligations** (each row names its guarantor):

| Registered id | Guarantor |
|---|---|
| `<Part Id>` / `<PartGameData Id>` | preflight blocker on duplicate `partId` (P3.02) |
| Export-variant `<SubPart Id>` = `flexo_<base>_<ns>_<templateId>` | per-part `ns` token, preflight-unique (P3.02/P3.04) |
| Custom-mesh `<SubPart Id>` / GLB mesh names / `_VM` names | I4 (project-unique `subPartId`, enforced by P2.04) |
| `<PartModel Id>` = `<subPartId>_Model` / `<variantId>_Model` | follows the two rows above |
| `<PbrMaterial Id>` | mat-id- or bundleToken-suffixed (`modExport.ts:545-547,618,657,1086,1114`) — per-part unique already; asserted across parts (P3.06) |
| `<FixedReaction Id>` | cross-part dedupe of identical payloads; divergent duplicates are a preflight blocker (P3.02/P3.05) |
| `<KeyframeAnimationModule Id>` / GLB paths | anim-id suffix in `animToken` (`src/ksa/animationNaming.ts:19-32`) — random per clip, no change needed |
| Texture file names | texture-id / bundleToken suffixes (`modExport.ts:928-931`) — unique under I4 |

---

### P3.01 — The gathering seam: `NamedExportPart`

**Depends**: P1.06. **Files**: `src/ksa/modExport.ts`, `src/state/partsStore.ts`.

**Do**:

1. In `modExport.ts` add:

```ts
export interface NamedExportPart {
  entryId: string;      // registry id (labels/telemetry only — never serialized)
  name: string;         // display name (issue prefixes, dialog chips)
  ns: string;           // part namespace token — sanitizeBaseName(part.partId)
  part: EditingPart;
}
export function partExportNs(partId: string): string { return sanitizeBaseName(partId); }
```

2. In `partsStore.ts`, `partsForExport()` (P1.06) stays the raw source; add a thin
   mapper in the UI/preview layer (NOT in `src/ksa` — it must stay store-free):
   `toNamedExportParts(entries) => NamedExportPart[]` living in
   `src/state/exportPreviewStore.ts` and exported for the dialog.

---

### P3.02 — Cross-part preflight

**Depends**: P3.01. **Files**: `src/ksa/exportIssues.ts`.

**Do**:

1. Extend `ExportIssue` with optional `partEntryId?: string; partName?: string`.
2. Keep `collectExportIssues(part, reactions, catalog)` (:87) as the per-part pass.
3. Add pure `collectProjectExportIssues(parts: NamedExportPart[], coreReactions: ReactionData[], catalog): ExportIssue[]`:
   - `parts.length === 0` → blocker `"No parts are included in the export."`
   - per part: run the per-part pass, stamping `partEntryId`/`partName` onto each
     issue. **Reaction set is PER PART** — the injected reaction index wins over the
     part's own `customReactions` inside `engineValidation.ts:85-113`, so passing one
     shared `$allReactionIndex` (which merges the ACTIVE part's customs,
     `reactionStore.ts:31-35`) would validate part B's combustors against part A's
     payloads. For each part build
     `indexReactionCatalog([...core minus that part's custom ids, ...part.customReactions.map(customToReactionData)])`
     and pass THAT to `collectExportIssues`.
   - duplicate `partId` among included parts → blocker naming both part names.
   - duplicate `ns` (`partExportNs`) where the raw `partId`s differ → blocker:
     `"Part Ids '<a>' and '<b>' collide after sanitization ('<ns>')."`
   - duplicate custom-mesh `subPartId` across parts → blocker (should be impossible
     under I4; this is the tripwire if old data sneaks in).
   - same `customReactions[].id` in two parts with non-identical payloads
     (compare via `JSON.stringify` of a key-sorted clone — write a tiny local
     `stableEqual`) → blocker naming the id + both parts; identical payloads are fine
     (deduped at serialize, P3.05).
4. All still pure — the module keeps its "no stores, no react, no three" law
   (`exportIssues.ts` header).

---

### P3.03 — Serializers take part lists

**Depends**: P3.01. **Files**: `src/ksa/partXmlSerializer.ts`.

**Do**:

1. Replace `serializePart(part, remap)` (:108-126) with
   `serializePartsXml(entries: Array<{ part: EditingPart; remap: Map<string, string> }>): string`
   — one `<Assets>` doc; per entry, append the `<Part>` element exactly as the current
   body builds it (placements :114-116, connectors :118-120). Entry order = file order.
2. Replace `serializeGameData(part, base, remap)` (:136-382) with
   `serializeGameDataXml(entries: Array<{ part; remap }>, base: string): string` — one
   `<Assets>` doc; per entry, append `<PartGameData>` (:143-299), then that part's
   `<SubPartGameData>` elements (:326-378). `<FixedReaction>`s are hoisted — see
   P3.05. `base` still feeds animation module ids (`buildAnimationModuleElement`
   :973-1002) unchanged.
3. Every helper below the two entry points stays untouched. Update the two call sites
   (`modExport.ts:140,142` — P3.04) and the tests (P3.12). Single-entry calls must
   produce today's documents byte-for-byte (minus P3.04's variant-id change) — the
   existing serializer tests, re-pointed at `[{part, remap}]`, prove it.

---

### P3.04 — `buildMultiModContent`

**Depends**: P3.02, P3.03. **Files**: `src/ksa/modExport.ts`.

**Do**:

1. `buildExportVariantMap(part, catalog, base)` (:261-309) gains an `ns` argument;
   the variant id at :299 becomes `` `flexo_${base}_${ns}_${templateId}` ``. (Accepted
   churn vs today's `flexo_${base}_${templateId}` — variant ids are internal to the
   exported mod; vehicles reference Parts, not variant SubParts. Note it in the scope
   doc, P3.11.)
2. Replace `buildModContent` (:128-145) with:

```ts
export interface MultiPartPlanEntry {
  entryId: string; name: string; ns: string;
  part: EditingPart;                       // AFTER expandGlassGlow
  variants: Map<string, ExportVariant>;
  remap: Map<string, string>;              // variantRemap(variants)
  insetIds: Set<string>;                   // from expandGlassGlow
}
export interface MultiModContent {
  base: string;
  partFile: string;  partXml: string;
  gameDataFile: string;  gameDataXml: string;
  perPart: MultiPartPlanEntry[];
}
export function buildMultiModContent(parts: NamedExportPart[], projectName: string, catalog): MultiModContent
```

   Body: `base = sanitizeBaseName(projectName)`; assert `ns` uniqueness (throw — the
   preflight gate makes this unreachable); per part: `expandGlassGlow` (:704-737) →
   variant map (with `ns`) → collect the plan entry; then
   `partXml = serializePartsXml(perPart.map(({part, remap}) => ({part, remap})))` and
   `gameDataXml = serializeGameDataXml(…, base)`. File names: `${base}Part.xml` /
   `${base}GameData.xml` — unchanged.
3. `expandGlassGlow` moves INSIDE `buildMultiModContent` (per part). Its current
   direct callers — `buildModZip` (`modExport.ts:1163`), `writeModToFolder` (:1261),
   and `exportPreviewStore.ts:126,145` — delete their calls when they adopt the new
   content builder (P3.07/P3.08). The dialog itself never called it (only a header
   comment at `ExportKsaDialog.tsx:67` mentions it) — there is nothing to remove
   there.

---

### P3.05 — `<FixedReaction>` cross-part dedupe

**Depends**: P3.03. **Files**: `src/ksa/partXmlSerializer.ts`.

**Do**: in `serializeGameDataXml`, hoist reaction emission out of the per-part section
(:305-318): after all `<PartGameData>`/`<SubPartGameData>` appends, walk every entry's
`part.customReactions`, skip non-exportable (`isCustomReactionExportable`,
`src/ksa/types.ts:1571`) with the existing warn, and emit each **id once** (a `Set` of
emitted ids — identical duplicates skip silently; divergent duplicates were blocked by
P3.02, so a plain first-wins here is safe and deterministic by entry order). Keep the
per-reaction builder (:913-965) untouched.

---

### P3.06 — Assets XML: one `<MeshAtlas>` per part

**Depends**: P3.01. **Files**: `src/ksa/assetsXmlSerializer.ts`.

**Do**: change `serializeAssets(plan: AssetsPlan)` (:147-276) to
`serializeAssets(plans: AssetsPlan[]): string` — one `<Assets>` doc; per plan, in
order: `<MeshAtlas Path>` (when `meshAtlasPath`, :153-157), `<PbrMaterial>`s
(:161-178), custom `<SubPart>`s (:180-213), variant reference `<SubPart>`s (:230-273).
Add a dev assertion that `<PbrMaterial>`/`<SubPart>` ids are unique across ALL plans
(throw with the offending id — unreachable under I4 + ns rules; tripwire only).
`AssetsPlan` itself is unchanged (per-part).

---

### P3.07 — `buildMultiCustomBundle`

**Depends**: P3.04, P3.06. **Files**: `src/ksa/modExport.ts`.

**Do**:

1. Refactor `buildCustomBundle` (:796-1147): extract everything up to (not including)
   the final `serializeAssets` call (:1139-1144) into
   `buildPartBundlePlan(entry: MultiPartPlanEntry, base, kittenTex, opts): Promise<{ plan: AssetsPlan | null; binaries: Array<{path, data}> }>`
   — same body: animation GLBs (:813-818), mesh atlas (:856-912; the token
   `${base}_${meshes[0].id-suffix}` :846-851 is already per-part unique under I4),
   textures/materials (:914-1134). No behavior change for one part.
2. `export async function buildMultiCustomBundle(content: MultiModContent, kittenTex, opts): Promise<CustomBundle>` —
   loop `content.perPart` sequentially (abort-checked via the existing
   `abortIfRequested` idiom); merge binaries with a **path-dedupe map**: a repeated
   path (possible only for kitten verbatim `.ktx2` copies fetched from the same source
   — `modExport.ts:623-632`) must be byte-identical (compare lengths + subarray
   equality; throw a descriptive error otherwise); collect plans; if any plan is
   non-null → `assetsXml = serializeAssets(plans)`, `assetsFile = `${base}Assets.xml``
   (:1138). Return the same `CustomBundle` shape (:767-773).
3. `buildModZip` (:1155-1197) and `writeModToFolder` (:1253-1297) change signature to
   `(parts: NamedExportPart[], projectName, kittenTex, catalog)` and internally run
   `buildMultiModContent` + `buildMultiCustomBundle` (mirroring today's dialog-side
   sequencing). `WriteResult` (:1237-1243) shape unchanged. Non-overwrite `-N`
   suffixing + mod.toml rebuild-from-disk (:1272-1294) untouched.

---

### P3.08 — Export preview store

**Depends**: P3.07. **Files**: `src/state/exportPreviewStore.ts`.

**Do**:

1. `readInputs()` (:81-89) → `{ parts: toNamedExportParts(partsForExport()), projectName, catalog, kittenTex, decimate }`
   plus the staleness key additions below.
2. Staleness (`currentStamp` :110; `markStaleIfChanged` :209-216): the parts array is
   rebuilt per read, so stamp equality must use stable tokens —
   `[$part identity, $partEntries identity, $activePartId value, $inactiveRevision value, projectName, catalog identity, kittenTex identity, decimate]`.
   `watchExportInputs()` (:223-234) additionally listens `$partEntries`,
   `$activePartId`, `$inactiveRevision` (from `partsStore`).
3. `buildXmlTabs` (:125-130) → `buildMultiModContent`; `buildAssets` (:132-179) →
   `buildMultiCustomBundle`. Tab set stays exactly three (`part`/`gamedata`/`assets`)
   with the same file names (:189-202 router untouched).

---

### P3.09 — Export dialog

**Depends**: P3.08. **Files**: `src/ui/ExportKsaDialog.tsx`.

**Do**:

1. Component-scope reads (:290-295): replace `$part` with the named-parts mapper
   (via `useStore` on `$partEntries`/`$activePartId`/`$inactiveRevision` so the dialog
   re-renders on registry changes) — build `parts: NamedExportPart[]` once per render.
   This covers **`PreFlight` too** (`ExportKsaDialog.tsx:186-191` — it reads `$part` +
   `$allReactionIndex` and computes `draftClips(part)` for the active part only):
   preflight now calls `collectProjectExportIssues(parts, coreReactions, catalog)`
   with `coreReactions` from **`$reactionCatalog` (core only — NOT
   `$allReactionIndex`)**, per P3.02(3); and `draftClips` runs per included part,
   rendered in the same per-part grouping as issues (an inactive part's draft clips
   must not silently vanish from the summary).
2. `writeToFolder` (:304-346) / `downloadZip` (:348-373): drop the local
   `expandGlassGlow` call (now inside content, P3.04); call the new
   `writeModToFolder(dir, parts, projectName, kittenTex, catalog)` /
   `buildModZip(parts, …)`.
3. Header area: an "Exporting N of M parts" line with a chip per included part
   (`Chip` — `src/ui/kit/Tag.tsx:55`); when any part is excluded, a muted
   "(<k> excluded — toggle in the part list)" suffix. No toggles here — the include
   flag is edited in the part dropdown (P4.03).
4. Issues list: group by `partName` (section sub-headers) using the stamped fields
   from P3.02; cross-part issues (no `partName`) render first under "Project".
5. Success notification (:324-334) and folder-semantics copy (:383-393) unchanged
   (same file triple).

---

### P3.10 — *(reserved — folded into P3.09; keep numbering stable)*

---

### P3.11 — scope/ + docs sync (mandatory)

**Depends**: P3.04–P3.09. **Files**: `scope/part-and-subpart-xml.md`,
`scope/custom-assets-and-mod-export.md`, `scope/FULL_SCOPE.md`, `docs/xml-io.md`.

**Do**:

1. `scope/part-and-subpart-xml.md` — new section **"Multi-part export"**: cite
   `KSA/AssetBundle.cs` (`[XmlRoot("Assets")]` over `List<SerializedId>` — sibling
   multiplicity for `Part`/`PartGameData`/`SubPartGameData`/`MeshAtlas`/`FixedReaction`
   is first-class); the per-part variant-id rule `flexo_<base>_<ns>_<templateId>` and
   WHY (KSA registers `SubPartGameData` once globally per id — cite the
   `editorStore.ts:824-841` rationale comment); the FixedReaction first-wins dedupe; the
   uniqueness-obligations table from this phase's header.
2. `scope/custom-assets-and-mod-export.md` — document: one `<MeshAtlas>` **per part**,
   multiple per file (cite `KSA/MeshAtlasFileReference.cs` `DoLoad` —
   `ModLibrary.Register` by GLB mesh name, first-wins), and that flexo therefore keeps
   mesh names / SubPart ids / PartModel ids / PbrMaterial ids project-unique (plan I4).
   Add a **"pending in-game verification"** line for the two-atlas load (P6.10 runs
   it; flip the line when done).
3. `scope/FULL_SCOPE.md` — update the mod-export row for multi-part.
4. `docs/xml-io.md` — the two multi serializer entry points + the FixedReaction
   dedupe + variant ns.

---

### P3.12 — Phase 3 tests

**Depends**: P3.02–P3.09. **Files**: `src/ksa/partXmlSerializer.test.ts`,
`src/ksa/assetsXmlSerializer.test.ts`, `src/ksa/modExport.test.ts`,
`src/ksa/exportIssues.test.ts`, `src/state/exportPreviewStore.test.ts`.

**Do**:

1. `partXmlSerializer.test.ts`: re-point existing suites at single-entry arrays
   (byte parity); NEW — two entries → two `<Part>` siblings in entry order; two
   `<PartGameData>` siblings; each part's `<SubPartGameData>` attaches to ITS remapped
   variant ids; identical `<FixedReaction>` in both parts emitted once; per-part
   connector id spaces may collide (`_connector1` in both `<Part>`s) and serialize
   fine.
2. `assetsXmlSerializer.test.ts`: two plans → two `<MeshAtlas>` + merged materials/
   subparts; duplicate SubPart id across plans throws.
3. `modExport.test.ts`: update variant-id assertions to the `ns` form; NEW — two parts
   sharing built-in template T with different `internalFlags` produce two distinct
   variants (`flexo_<base>_<nsA>_T`, `flexo_<base>_<nsB>_T`) each carrying its own
   `<Internal>`; `buildModZip` with 2 parts → asserts as SUBSET checks: `mod.toml` +
   the 3 XML entries present, one atlas GLB per custom-mesh-bearing part, each part's
   animation GLBs — plus whatever texture binaries the parts imply (a custom-mesh
   part always also emits at least the synthetic flat-normal/ORM `.ktx2`s; do NOT
   assert an exact entry count); kitten verbatim texture path collision dedupes
   (byte-equal) — construct via the mocked `fetchKtx2`.
4. `exportIssues.test.ts`: each new blocker from P3.02 (zero parts, dup partId, ns
   sanitize collision, reaction conflict) + `partName` stamping.
5. `exportPreviewStore.test.ts`: stamp goes stale on `switchPart`, on
   `setPartIncludeInExport`, and on a mutation in the active part; not stale on a
   pure opacity change… (opacity is registry meta and DOES dirty `$partEntries` —
   assert stale; add a code comment in the store acknowledging the minor
   over-invalidation and why it's fine: preview rebuilds are lazy + memoized).

**Verify**: full gate. Manual: 2-part project → ⌘E → Inspect tabs show both parts in
all three files; download zip; unzip and eyeball the XML tree against this phase's
header diagram. Phase 3 closes.

---

## Phase 4 — Shell UI: the part switcher

**Read first**: `docs/ui-shell.md` (commands/dialog/hotkey laws :457-471, confirm
ladder :214-218), `src/ui/shell/MenuBar.tsx`, `src/ui/outliner/LayerHeaderRow.tsx`
(the row-control idiom this phase copies), `src/ui/projects/RenameProjectDialog.tsx`.

Every action here is a **command** first; the chip/popover are just surfaces.

---

### P4.01 — Part commands + palette provider

**Depends**: P2.05 (duplicate), P1.06. **Files**: NEW `src/ui/commands/partCommands.ts`,
`src/ui/commands/index.ts`, `src/ui/commands/providers.ts`.

**Do**:

1. `partCommands.ts` — register (pattern: `src/ui/commands/fileCommands.ts:22-85`):

| id | title | menuPath | enabled | run |
|---|---|---|---|---|
| `part.new` | New Part | File ▸ New Part | always | `const id = createPart(); toast({ title: `New part: ${nameOf(id)}` })` |
| `part.duplicate` | Duplicate Part | File ▸ Duplicate Part | always | `void duplicatePart($activePartId.get()).then(id => id && toast({ title: `Duplicated: ${nameOf(id)}` }))` |
| `part.rename` | Rename Part… | File ▸ Rename Part… | always | `openDialog({ id: 'part-rename' })` (targets the active part) |
| `part.delete` | Delete Part… | File ▸ Delete Part… | `$partEntries.get().length > 1` | `openDialog({ id: 'part-delete-confirm' })` |
| `part.next` / `part.prev` | Next Part / Previous Part | File ▸ Switch Part ▸ (chords shown) | `length > 1` | cycle `$partEntries` order from `$activePartId`, `switchPart`, then `toast({ title: `Editing: ${name}` })` |

2. Provider (pattern: `projectCommands()`, `src/ui/commands/providers.ts:50-63`):
   `registerCommandProvider('parts', partSwitchCommands)` — one row per entry when
   `$partEntries.get().length > 1` (empty array otherwise): id `part:switch:<entryId>`,
   title `Switch to part: <name>`, `checked: () => entryId === $activePartId.get()`,
   run = `switchPart` + the Editing toast.
3. Wire into `src/ui/commands/index.ts:25-43` (static list + provider import).
4. partsStore stays toast-free (P1.06(1)) — all feedback lives here.

---

### P4.02 — Dialogs: rename + delete confirm

**Depends**: P4.01. **Files**: `src/state/dialogStore.ts`, `src/ui/shell/DialogRoot.tsx`,
NEW `src/ui/projects/RenamePartDialog.tsx`.

**Do**:

1. `dialogStore.ts` `DialogId` union (:31-51): add `'part-rename'` and
   `'part-delete-confirm'`; follow the add-a-dialog checklist at
   `DialogRoot.tsx:40-53`.
2. `RenamePartDialog` — copy `RenameProjectDialog.tsx:21-70` verbatim in structure
   (center Modal + `DialogHeader` + one `TextField` + Cancel/Rename): initial value
   `$activePartMeta`'s name; commit via `renamePart(activeId, value)`.
3. Delete confirm — mount a kit `ConfirmDialog` (`src/ui/kit/ConfirmDialog.tsx:25-78`)
   under `DialogRoot` for `'part-delete-confirm'` (this is a sanctioned top-level
   confirm, same class as `chain-discard-confirm` — `DialogRoot.tsx:144-168`):
   title `Delete part "<name>"?`, text
   `Its contents, undo history and custom assets are removed. This cannot be undone.`,
   `confirmVariant="danger"`, onConfirm → `deletePart(activeId)` + toast.
   (The in-popover row delete uses the inline strip instead — P4.04(6); two entry
   points, one action.)

---

### P4.03 — Menu spec

**Depends**: P4.01. **Files**: `src/ui/menu/menuSpec.ts`, `src/ui/menu/menuSpec.test.ts`.

**Do**: in the File menu (:348-357 tree; entries around :71-78), insert a new
separator-delimited section between the project group and the export group:

```
── separator ──
New Part                (command part.new)
Switch Part ▸           (submenu: provider 'parts'; hides itself when the provider is empty — follow the Custom Mesh Instances provider-submenu idiom, menuSpec.ts:124-183)
Rename Part…            (command part.rename)
Duplicate Part          (command part.duplicate)
Delete Part…            (command part.delete)
── separator ──
```

Update the label assertions in `menuSpec.test.ts` (`menuSpec.ts:14-16` names the file).

---

### P4.04 — `PartSwitcher`: menubar chip + popover manager

**Depends**: P4.01, P4.02. **Files**: NEW `src/ui/shell/PartSwitcher.tsx`,
`src/ui/shell/MenuBar.tsx`.

This is the user's "top-level dropdown". Build it as ONE file exporting `<PartSwitcher />`.

**Do**:

1. **Chip** — visually a sibling of `ProjectChip` (`MenuBar.tsx:120-135`): kit `Button`
   `size="xs" variant="ghost" className="min-w-0 gap-1 px-1.5"`, lucide `Package`
   icon (13px), `<span className="max-w-[16ch] truncate">{activeName}</span>`,
   `ChevronDown` (12px). Mount it in the right cluster BEFORE `ProjectChip`
   (`MenuBar.tsx:97`): `[PartChip ▾][ProjectChip ▾][↶][↷][⌘K]`. Render an empty chip
   when `$activePartMeta` is `null` (possible pre-hydration only — boot is awaited
   before first paint, but the null branch must exist).
2. **Popover** — kit `DialogTrigger` + `Popover` + `PopoverDialog`
   (`src/ui/kit/Popover.tsx:11,28`), width `w-80`, dense rows. NOT a `Menu` — rows
   carry interactive controls (the react-aria collection restriction is why:
   `LayerHeaderRow.tsx:639-642`).
   ⚠️ **Nested-overlay spike FIRST**: no in-repo surface nests a
   `DialogTrigger`+`Popover` or `MenuTrigger` inside another `PopoverDialog` (the
   cited `LayerHeaderRow` idiom lives in a sidebar GridList; the collapsed menubar
   deliberately flattened to a drill-down instead — `MenuDrillDown.tsx:15-17`).
   Before building the rows, spike the shape with react-aria-components 1.20: open
   the inner opacity popover / row ⋮ menu, interact, confirm the OUTER popover stays
   open and Esc closes only the inner. If it misbehaves, do not fight react-aria —
   fall back to **inline expansion rows** (the `InlineConfirmStrip`/`DeleteLayerStrip`
   pattern: the row expands in place to show the opacity/offset fields or the action
   strip) and note the substitution in the PR.
3. **Row** (one per `$partEntries` entry, in order) — copy the `LayerHeaderRow`
   control idiom (`src/ui/outliner/LayerHeaderRow.tsx:206-401`), left → right:
   - **activate dot** ◉/○ button (`:216-235` pattern) — `switchPart(id)` + Editing
     toast + **close the popover** (selection is a terminal action; every other
     control keeps it open);
   - **name** — span, double-click → inline `RenameInput` (copy `:570-593`: Enter/blur
     commit via `renamePart`, Esc abandon, `stopPropagation`);
   - **count chip** — `Chip` with `counts.subParts` and a `title` breakdown from
     `PartMetaEntry.counts` (`:265-267` pattern);
   - **eye** — `toggleVisible` → `setPartVisible` (`EyeIcon`/`EyeOffIcon`,
     `src/ui/layerIcons.tsx:16,19`). For the ACTIVE row the eye/opacity/offset
     controls stay enabled but get `Tooltip` content "Applies when another part is
     active" (ghost settings persist; the active part itself always renders fully);
   - **opacity** — `BlendIcon` button → nested `Popover` with the exact
     `OpacityFields` composition (`useNumberDraft` `TextField` 0–100 +
     `Slider`, `LayerHeaderRow.tsx:502-561`) writing `setPartOpacity(id, v/100)`;
   - **offset** — crosshair icon button → nested `Popover` with three
     `PreciseNumberInput`s (X/Y/Z, meters, step 0.1) bound to `setPartOffset`
     (numeric-input law §0.7(5)); show a filled-dot badge when offset ≠ 0;
   - **⋮ menu** — `MenuTrigger` + `Menu` (`EntityRow.tsx:109-124` idiom): Rename…
     (inline rename trigger), Duplicate, Move Up / Move Down (`movePart`), a checkbox
     item **Include in export** (`setPartIncludeInExport`), separator, Delete…
     (danger) — Delete… swaps the row for an `InlineConfirmStrip`
     (`kit/InlineConfirmStrip.tsx:13-79`; the `DeleteLayerStrip` composition
     `LayerHeaderRow.tsx:403-428` is the template) whose confirm runs
     `deletePart(id)`; the menu item is disabled when only one part exists;
   - when `includeInExport === false`: a muted "excluded" `Chip` on the row.
4. **Footer** — full-width `＋ New Part` `Button size="xs" variant="secondary"` →
   `runCommand('part.new')`.
5. All state via `useStore($partEntries)` / `useStore($activePartId)`; zero local
   copies of registry data.
6. **A11y**: the popover content is a `Dialog` — focus lands on the active row's
   activate button; every icon button has an `aria-label` + `Tooltip`.

---

### P4.05 — Hotkeys

**Depends**: P4.01. **Files**: `src/ui/hotkeys/registry.ts`,
`src/ui/hotkeys/validateRegistry.ts`.

**Do**:

1. New source group "Parts" in `HOTKEY_GROUPS` (`registry.ts:131+`). Note: the group
   title is source organization only — the Help dialog buckets `ALL_BINDINGS` by
   **scope** (`HelpDialog.tsx:85-108`), so these `global`-scope bindings will render
   under "Everywhere"; give each binding a clear label ("Switch to part 1", …) since
   the label is what Help shows:
   - `⌥1` … `⌥9` — "Switch to part 1…9": scope `global`,
     `when: () => !$dialogOpen.get() && $partEntries.get().length > 1`, run =
     activate `$partEntries.get()[i]` via `switchPart` + Editing toast. Ids
     `part.activate1`…`part.activate9` — **documented synthetics** (they are not
     palette commands; the `parts` provider covers palette switching).
   - `⌥.` — `part.next`, `⌥,` — `part.prev` (real command ids; same scope + `when`).
   - Modifier note: the registry already binds `⌥[`/`⌥]` successfully
     (`registry.ts` global section), so ⌥+digit/⌥+punctuation matching is established;
     mirror whatever key-string convention those entries use.
2. `validateRegistry.ts`: extend `isSyntheticId` (:70-77) with
   `id.startsWith('part.activate')`. Rule 4 (bare-key `when` gates, :145-155) does not
   apply — all new keys are modified — but keep the `when` gates anyway (they prevent
   dead chords in single-part projects and inside dialogs).
3. Collision audit (inventory: `registry.ts` global scope): `⌥1-9`, `⌥.`, `⌥,` are
   unbound today; `1`-`5` bare (modes), `⌥[`/`⌥]` (sidebars), `[`/`]` (viewport
   rotate-step) remain untouched. `hotkeyRegistry.test.ts` (validator run) must stay
   green.

---

### P4.06 — Phone reachability (accepted-minimal)

**Depends**: P4.03. **Files**: `src/ui/shell/phone/PhoneTopBar.tsx` (one line), none else.

**Do**: the ☰ drill-down and the palette render from `MENU_SPEC`/commands
automatically, so part switching is already reachable on phone after P4.03. The only
addition: in `PhoneTopBar.tsx:35-83`, when `$partEntries.get().length > 1`, prefix the
project chip label with the active part name (`<part> — <project>`, both truncated;
keep the chip's existing `max-w`). The desktop popover manager is NOT ported to phone
in this plan — record that as a known-minimal in `docs/multi-part.md` (P6.08).

---

### P4.07 — Phase 4 tests

**Depends**: P4.01–P4.05. **Files**: `src/ui/menu/menuSpec.test.ts`,
`src/ui/hotkeys/hotkeyRegistry.test.ts` (existing validator run),
`src/state/commandStore.test.ts` or a NEW `src/ui/commands/partCommands.test.ts`.

**Do**:

1. `menuSpec.test.ts` — label list includes the five new File entries.
2. Validator test — passes with the new bindings (it enumerates reachable scope sets;
   a failure here means P4.05(2) was skipped).
3. `partCommands.test.ts` — register commands (import the module), then: `part.delete`
   disabled at one part, enabled at two; `part.next` cycles and wraps; provider
   `parts` returns [] at one part, N rows with `checked` on the active at two;
   `part:switch:<id>` run switches (assert `$activePartId`).

**Verify**: full gate + manual sweep — create/switch/rename/duplicate/delete/reorder
parts from: the chip popover, the File menu, the palette (provider rows + statics),
and `⌥1`/`⌥2`/`⌥.`. Undo history isolation observable via the ↶ tooltip across
switches. Phase 4 closes.

---

## Phase 5 — Ghost rendering of inactive parts

**Read first**: `docs/3d-workspace.md`, `docs/layers.md`; code:
`src/three/EditorScene.ts` (`sub()` :865-872, reconcile :879-938, dispose :3143-3210,
thumbnail sibling-hiding :1835-1840), `src/three/ChainPreviewLayer.ts` (the existing
ghost precedent — clone + no-op raycast + scene-sibling mounting),
`src/three/SubPartObject.ts`, `src/three/KittenObject.ts`,
`src/three/layerOpacity.ts` (:15-44 — THE opacity primitive),
`src/three/PartPreviewViewport.ts:186-241` (token-guarded whole-part build precedent).

Ghost contract (document verbatim in `docs/multi-part.md`):

- A ghost renders an inactive part's **subpart placements** (built-in + custom meshes)
  and **kittens** with real geometry and real materials. It deliberately EXCLUDES
  editor furniture: connectors, colliders, IVA seats, light markers, joint markers,
  aids. It respects the part's **own** stored `layerView` (hidden layers stay hidden;
  per-layer opacity multiplies in) and ignores the global interior/kind-visibility
  toggles.
- Ghosts are never pickable, never selectable, never framed, never thumbnailed (I5).
- Per-part controls: `visible`, `opacity` (multiplies every material via the
  `layerOpacity` primitives), `offset` (group position; the active part always sits at
  the origin — D3).
- Ghosts rebuild only when the inactive set changes (`$inactiveRevision`); view
  changes are cheap in-place updates. On-demand rendering invariant I9 holds.

---

### P5.01 — Extract the per-mesh render builder from `customAssetStore`

**Depends**: P1.07. **Files**: `src/state/customAssetStore.ts`.

**Why**: `customMeshRenderCache` (:152) is built for the ACTIVE part only (rebuilt by
the `$part.subscribe` at :2298). Ghosts need render data for OTHER parts' custom
meshes without touching that cache.

**Do**:

1. Locate the cache-fill routine inside the catalog rebuild (the code that turns one
   `CustomMesh` descriptor into `{ geometry, materials }` — geometry via
   `buildPrimitiveGeometry`/`applyFaceUvTransforms` (`src/three/primitives.ts`),
   `getImportedGeometry` (`src/three/importedMeshCache.ts`), or the kitten bake
   (`src/three/kittenBake.ts`); materials via the `MaterialFactory` custom paths).
   Extract it as:

```ts
export interface MeshRenderData {
  geometry: THREE.BufferGeometry;
  geometryOwned: boolean;      // true → caller disposes (primitives); false → shared cache (imported, kitten)
  materials: THREE.Material[]; // always caller-owned clones/creations → caller disposes
}
export async function buildMeshRenderData(
  mesh: CustomMesh,
  owner: Pick<EditingPart, 'customMaterials' | 'customTextures'>,
): Promise<MeshRenderData | null>
```

   Texture URLs come from the module's existing URL maps (keyed by project-unique
   texture id and hydrated for ALL parts since P1.07 — no resolver parameter needed),
   but **materials must resolve against the OWNING part**: the current code goes
   through `meshMaterial(part, m)` → `part.customMaterials.find(x => x.id === m.materialId)`
   (`customAssetStore.ts:526`), and an extraction that silently kept reading the
   active `$part` would resolve a ghost part's `materialId` against the ACTIVE part's
   materials — a guaranteed miss under I4, producing default-gray ghosts. The
   active-part cache fill calls it with `$part.get()` (pure refactor: identical
   output); the ghost builder passes `doc.part` (P5.03).
2. Determine `geometryOwned` per source branch while extracting: primitives build
   fresh geometry (owned); imported and kitten-baked geometries come from
   never-disposed shared caches (`importedMeshCache.ts` registry, `kittenBake.ts`
   caches) — not owned. Record each in a one-line comment.
3. Null result (missing blob/URL) is tolerated — ghost simply skips that mesh
   (matches export's partial-failure stance, `modExport.ts` zero-geometry skip).

**Verify**: `customAssetStore.test.ts` — `buildMeshRenderData` on a primitive mesh
returns owned geometry + materials; on an imported mesh (mocked cache) returns
non-owned geometry; active-part rendering unchanged (existing tests green).

---

### P5.02 — Pure ghost planning helper

**Depends**: P1.06. **Files**: NEW `src/three/ghostPlan.ts`, NEW
`src/three/ghostPlan.test.ts`.

**Do**: a renderer-free module (types only from `ksa/types` + `layerStore`) so the
inclusion rules are unit-testable:

```ts
export interface GhostItemPlan {
  kind: 'placement' | 'kitten';
  placement?: SubPartPlacement;
  kitten?: KittenInstance;
  layerFactor: number;          // that layer's opacity (default 1)
}
/** Which entities of an inactive part render as ghost, honoring the part's OWN layerView. */
export function planGhostItems(doc: InactivePartDoc): GhostItemPlan[]
```

Rules: placements + kittens only; skip when
`doc.layerView[entity.layerId]?.visible === false`; `layerFactor =
doc.layerView[entity.layerId]?.opacity ?? 1`; kittens live on `KITTEN_LAYER_ID`
(`src/ksa/types.ts:364`) — same check applies.

**Tests**: hidden layer excludes its placements; layer opacity flows through; kittens
included/excludable via the kittens layer; connectors/colliders/seats/lights never
appear (construct a doc containing all kinds).

---

### P5.03 — `GhostPartsLayer`

**Depends**: P5.01, P5.02. **Files**: NEW `src/three/GhostPartsLayer.ts`.

**Do**:

```ts
export class GhostPartsLayer {
  readonly group = new THREE.Group();          // name 'ghost-parts' — scene SIBLING of EditorScene.root (I5)
  private builds = new Map<string, GhostBuild>();  // partEntryId → build
  private buildTokens = new Map<string, number>(); // async guard (PartPreviewViewport idiom)
  constructor(scene: THREE.Scene, private catalogIndex: () => Map<string, CatalogSubPart>, private invalidate: () => void)
  refresh(): void      // diff inactive set → build/dispose per part
  applyView(): void    // cheap: visible / opacity / offset from $partEntries
  dispose(): void
}
interface GhostBuild {
  group: THREE.Group;                          // name `ghost-part:<entryId>`
  doc: InactivePartDoc;                        // identity key — parkActive() creates a fresh object per park, so `===` detects change
  items: Array<{ setOpacity: (f: number) => void; dispose: () => void }>;
}
```

1. **`refresh()`**: current inactive ids = `$partEntries` minus `$activePartId`. For
   each: `getInactiveDoc(id)` — if a build exists with the SAME doc reference, keep
   it; else dispose + rebuild. Dispose builds whose part vanished. End with
   `applyView()` + `invalidate()`.
2. **Building one part** (async, token-guarded per part id): for each
   `planGhostItems(doc)` item —
   - built-in placement → `SubPartObject.create(catalogIndex().get(templateId), placement)`
     (`src/three/SubPartObject.ts:55-92`); missing template → skip;
   - custom placement (template resolves to `doc.part.customMeshes` by `subPartId`) →
     `buildMeshRenderData(mesh, doc.part)` → `new THREE.Mesh(geometry, materials)` (respect
     geometry groups for multi-material), `applyPlacement` (`src/three/coords.ts:28-34`);
   - kitten → `KittenObject.create(kitten.kind, kitten)` (`src/three/KittenObject.ts:66-107`).
   After each subtree lands: **ghostify** — `node.traverse(o => { o.raycast = NOOP; delete o.userData.selectable; })`
   (the `ChainPreviewLayer.ts:113-118` sweep, minus the material swap — ghosts keep
   real materials). Push an item wrapper: for `SubPartObject`/`KittenObject`,
   `setOpacity = f => obj.setLayerOpacity(f)` and `dispose = () => obj.dispose()`;
   for bespoke custom meshes, capture bases via `captureOpacityBase` and apply via
   `applyMaterialOpacity` (`src/three/layerOpacity.ts:22-44`), dispose owned
   geometry + materials only.
   On async completion: re-check the token AND that the part is still inactive
   (discard + dispose otherwise — the `reconcile` guard idiom,
   `EditorScene.ts:898-924`), then `invalidate()`.
3. **`applyView()`**: per build, from the matching `$partEntries` entry —
   `group.visible = entry.visible`; `group.position.set(offset.x, offset.y, offset.z)`;
   per item `setOpacity(entry.opacity * item.layerFactor)`.
4. **`dispose()`**: dispose every build, remove `group` from the scene.
5. Module-scope `const NOOP: THREE.Object3D['raycast'] = () => {}`.

---

### P5.04 — EditorScene integration

**Depends**: P5.03. **Files**: `src/three/EditorScene.ts`.

**Do**:

1. Construct beside the other layers (near `ChainPreviewLayer`, ctor region :585):
   `this.ghostParts = new GhostPartsLayer(viewport.scene, () => this.index, () => this.viewport.invalidate())`.
2. Subscriptions through `sub()` (I9): `sub($inactiveRevision, () => this.ghostParts.refresh())`,
   `sub($partEntries, () => this.ghostParts.applyView())`. (No `$part` subscription —
   the active part never renders as ghost; the revision bump on switch covers the
   role swap.)
3. `dispose()` walkthrough (:3143-3210): add `this.ghostParts.dispose()` beside
   `chainPreview.dispose()` (:3188).
4. Confirm-and-comment (no code): thumbnails exclude ghosts because
   `captureThumbnail` hides non-light scene siblings of `root` (:1835-1840) — add
   `ghost-parts` to that comment's example list; marquee/pick/frame exclusion comes
   free from root-scoped traversal (`SelectionManager.ts:93`,
   `EditorScene.ts:2685,3001,3118,1888-1898`) — cite I5 at the group creation.

**Verify**: manual — see P5.06.

---

### P5.05 — Transparency + perf audit

**Depends**: P5.04. **Files**: `src/three/GhostPartsLayer.ts` (comments/tweaks only).

**Do**: verify and document (comments in the layer file):

1. Faded materials get `transparent = true, depthWrite = false` from
   `applyMaterialOpacity` (`layerOpacity.ts:37-43`) — same sorting caveats as layer
   fade today; opacity 1 renders fully opaque (no perf cliff for the default).
2. Draw calls: one mesh + one material clone per ghost placement — identical cost
   model to active placements (`SubPartObject` per-instance clones,
   `SubPartObject.ts:68-83`); geometry/textures come from the shared never-disposed
   caches so a ghost adds no GPU uploads for already-seen templates.
3. No per-frame work: ghosts are static; only `invalidate()` on change (I9).
4. Kitten ghosts require BCn support like active kittens (`textureSupport.ts:56-58`)
   — the existing flat-material fallback path applies unchanged.

---

### P5.06 — Docs + manual checklist

**Depends**: P5.04. **Files**: `docs/3d-workspace.md`.

**Do**: add a "Ghost parts" section to `docs/3d-workspace.md` (scene-tree sketch gains
the `ghost-parts` sibling; the ghost contract from this phase's header; the I5
exclusion list with the code cites). Then run this manual checklist (record results in
the PR description):

- [ ] 2 parts; part B visible as ghost while editing A; opacity 50% fades all of B;
      offset (0, 2, 0) lifts B; toggling B's eye hides it instantly.
- [ ] Clicking a ghost hits nothing (grid/ground behavior identical to empty space);
      marquee over both parts selects only active entities; `F` frames active only.
- [ ] Switch A↔B: roles swap in one frame; no stale meshes (P1.08 guard); ghost of
      the OLD active appears with its stored layer visibility respected.
- [ ] Ghost renders: built-in subparts, a primitive custom mesh (textured), an
      imported GLB mesh, a kitten; connectors/colliders/seat/light markers absent.
- [ ] Hidden layer inside the ghost part stays hidden; that layer's 50% opacity
      multiplies with the part opacity.
- [ ] Project thumbnail (Projects dialog) shows ONLY the active part.
- [ ] Delete the ghost part → group disappears, no console errors; memory: switching
      10× leaks no materials (devtools heap diff roughly stable).

Phase 5 closes.

---

## Phase 6 — Cross-cutting sweeps, docs, smoke, release gate

**Read first**: the P6 tasks are individually small; read each task's cited file
before touching it.

---

### P6.01 — Part-aware labels in navigators

**Files**: `src/state/engineStore.ts`, `src/ui/data/DataNavigator.tsx` (+ its model).

**Do**: two copy-only substitutions, both gated on `$partEntries.length > 1`
(single-part projects keep today's labels — parity I8):

1. Engine navigator: `engineEntryLabel` builds the part-scope label at
   `engineStore.ts:71` from `name = part.gameData.displayName.trim() || part.partId.trim()`
   (:70) — when the project has > 1 part, use the registry display name
   (`$activePartMeta`) as the final fallback chain:
   `displayName || partId || <registry name>`, and append ` — <registry name>` to the
   part-scope label so the navigator says WHICH part's modules it lists. (The phrase
   "the document" appears only in the JSDoc at :65-66 — leave it.)
2. Data navigator: the pinned root row label renders at `DataNavigator.tsx:328`
   (`` `Part — ${row.label}` ``) from `dataNavigatorModel.ts:167`
   (`displayName || partId || '(unnamed part)'`) — substitute the registry display
   name as the last fallback and append it when it differs from the shown value.

### P6.02 — Seat-view clamp on part switch

**Files**: `src/state/ivaStore.ts`, `src/state/ivaStore.test.ts`.

**Do**: seat view survives mode switches by design (`ivaStore.ts:77`) but must end
when its seat stops existing — which now happens on every part switch. Check whether a
`$part`-driven clamp exists (grep `$seatView` writers); if the only exits are
Esc/Exit/`removeIvaSeat`/project load, add in `ivaStore`: a `$part.subscribe` that
calls the existing exit routine when `$seatView.get()` names a seat absent from
`part.ivaSeats`. Test: enter seat view, `switchPart` to a part without that seat id →
tool disarmed, camera restored; ALSO the sneaky case — part B has a DIFFERENT seat
under the same `_seat1` id (I3): decide-and-encode "same id in the new part still
exits" by comparing against a captured `(partEntryId, seatId)` pair at entry — store
the entry-time part id in `ivaStore` alongside the seat id.

### P6.03 — Cross-part clipboard paste

**Files**: `src/state/editorStore.ts`, `src/state/editorStore.test.ts`.

**Do**: D5 blesses copy-in-A → paste-in-B. The paste mutator is `pasteClipboard`
(`editorStore.ts:1890`, one `pushUndo('paste')` at :1902); it ALREADY re-homes via
`pasteLayerId` (`editorStore.ts:1816-1818`): source `layerId` kept when the
destination part has that layer id, else `currentLayerId(part)` (active layer,
pinned-layer-clamped :533-538). **The bug multi-part introduces is the id-COLLISION
case**: layer ids are sequential (`layer1`, `layer2`… — `nextLayerId`,
`editorStore.ts:4017-4023`), so part B routinely owns an UNRELATED layer with the
same id as A's source layer, and `pasteLayerId` silently keeps it — exactly the
"cross-part map keyed by bare entity id" I3 forbids.

Fix: `copySelected` stamps the clipboard with the source part —
`PartClipboard` (`editorStore.ts:307-319`) gains `sourcePartEntryId: string`
(recorded from `$activePartId`). `pasteClipboard` compares it to the CURRENT
`$activePartId`: same part → today's semantics exactly; different part → ALWAYS
re-home non-pinned entities to `$activeLayerId` (never trust an id match; pinned
kinds keep their built-in layers — `ENTITY_ONLY_LAYER_IDS`, `src/ksa/types.ts:409`).
Do NOT auto-create mirror layers (that is import's behavior —
`projectTransfer.ts:620-629` — not paste's).

Tests (`editorStore.test.ts`): (a) cross-part paste where B owns a same-id different
layer → lands on B's active layer; (b) same-part paste onto an existing layer keeps
it (regression); (c) one undo step either way.

### P6.04 — Asset Manager + Surface mode labeling

**Files**: `src/ui/assets/AssetManagerDialog.tsx`.

**Do**: assets are per-part (D1) and the manager reads `$part` — correct behavior
already; make it legible: dialog title `Assets — <active part name>` when the project
has > 1 part. One-line change + a body-copy note in the empty state ("This part has no
custom assets yet.").

### P6.05 — Project Manager surfaces

**Files**: `src/ui/projects/ProjectManagerDialog.tsx`,
`src/ui/projects/ExportArchiveDialog.tsx`.

**Do**: card/row bodies gain a muted `N parts` line when `meta.parts.length > 1`
(counts line real estate — `ProjectCardBody` :539 / `ProjectRowBody` :573); verify the
P1.03(9) fuzzy-search change covers part names + partIds; `ExportArchiveDialog`'s
summary reads the **ProjectMeta row**, not a manifest
(`ExportArchiveDialog.tsx:165-175` iterates `meta.counts`) — add a part-count line
from the new `meta.parts.length` (P1.02(3)).

### P6.06 — Intent-atom + ephemeral-store no-op audit

**Files**: audit only; fix sites as found.

**Do**: for each un-namespaced intent/ephemeral atom that carries active-part entity
ids — `$revealEntity` (`editorStore.ts:2115`), `$dataFlash` (`dataModeStore.ts:193`),
`$moduleFlash` (`engineStore.ts:574`), `$colliderFitRequest` (`colliderStore.ts:38`),
`$coverageRequest`/`$coverageReport` (:86,:98), `$ivaSeatAimRequest`
(`ivaSeatStore.ts:35`), `$surfaceRevealRequest` (`surfaceModeStore.ts:96`),
`$colliderEditContext`/`$lightEditContext` (`editorStore.ts:351,2737`),
`$chainSession` (closed on switch — done), `$editKeyframeId`/animation set (clamped —
done), `$dataScope` (clamped — done), `$surfaceMeshId` (clamped — done) — confirm by
reading each consumer that a stale id after `switchPart` is a harmless no-op (id
lookup misses → nothing happens). Where a consumer would throw or act on the WRONG
entity because part B reuses the id (I3 hazard — the two `EditContext` records are the
likely offenders), clear that atom in `switchPart` (add to the P1.05 sequence with a
comment). Deliverable: a checklist comment block in `partsStore.ts` above `switchPart`
enumerating every atom and its verdict (`clamped-by-self` / `no-op-on-miss` /
`cleared-here`).

### P6.07 — Docs refresh + constitution pointers

**Files**: NEW `docs/multi-part.md`; `docs/projects.md`, `docs/editor-state.md`,
`docs/architecture.md`, `docs/ui-shell.md`, `docs/layers.md`, `docs/custom-assets.md`,
`AGENTS.md`.

**Do**:

1. `docs/multi-part.md` — the feature doc: the registry model (§0.4 diagram), the
   switch choreography and what survives it, per-part undo, the ghost contract (P5
   header), the export mapping (P3 header diagram + uniqueness table), per-part
   assets + I4, the switcher UI + hotkeys, phone-minimal note, accepted limitations
   (Appendix B).
2. Updates: `projects.md` (snapshot v4 shape, history `byPart`, purge note),
   `editor-state.md` (partsStore section + "undo stacks are per part" in the
   undo-invariant block), `architecture.md` (store table row + the §0.4 diagram
   condensed + invariant I1), `ui-shell.md` (menubar right-cluster now
   `[Part ▾][Project ▾][↶][↷][⌘K]`; File-menu tree; hotkey table adds the Parts
   group; dialog id list +2), `layers.md` (layers are per-part; `$layerView` swaps on
   part switch), `custom-assets.md` (per-part descriptors, project-unique ids — I4,
   clone remint table pointer).
3. `AGENTS.md`: documentation list gains `docs/multi-part.md`; the undo-invariant
   paragraph gains one sentence: "Part registry operations (create/switch/delete/
   duplicate/rename/reorder/view flags) are lifecycle state and are deliberately NOT
   undo steps (see docs/multi-part.md)."

### P6.08 — Smoke script step

**Files**: `scripts/smoke-v2.ts`.

**Do**: append a step (pattern of the export step :161-168; update the header list
:16): open ⌘K → type "New Part" → Enter → assert the menubar part chip text becomes
"Part 2" → press `⌥1` → assert chip "Part 1" → ⌘K "Switch to part: Part 2" → Enter →
assert chip "Part 2". Keep it DOM-only like the rest of the script.

### P6.09 — Release gate: parity + in-game verification

**Do**: run Appendix A end-to-end and record results in the PR. The in-game item
(A.3) is the gate for flipping the "pending in-game verification" line in
`scope/custom-assets-and-mod-export.md` (P3.11(2)). Full suite + `pnpm smoke` green;
`pnpm build` green.

---

## Appendix A — Release checklist

**A.1 Single-part parity (I8)** — with a fresh 1-part project, walk: place/transform/
duplicate subparts · layers (create/hide/opacity/lock/reorder/delete) · connectors +
couplings · colliders (+fit/coverage) · IVA seats (+sit) · lights (+preview) ·
kittens · custom texture→material→mesh→surface/glow · model import · animation
(clip/joints/pose/scrub/export-anchor) · engine designer + plumbing + validation ·
data mode forms + passthrough · chains · measure/containers · undo across all of it ·
autosave/reload · archive export/import · share link · Export to KSA (folder + zip;
Inspect tabs) — everything behaves as v2 shipped, and the only visible additions are
the part chip and the File▸Part entries.

**A.2 Multi-part walk** — the P4.07 manual sweep + the P5.06 checklist + P3.12
manual + a 3-part project exercising: per-part undo isolation; per-part layers/
layerView; duplicate-part (custom assets independent — delete a texture in the copy,
original unaffected: I4 proof); delete part sweeps its blobs
(devtools → IndexedDB `flexo-assets`); import archive as new parts; excluded part
absent from export; reload restores active part + ghost settings + per-part history.

**A.3 In-game (KSA)** — export a 2-part mod where BOTH parts carry custom meshes
(distinct textures) and one shares a built-in template with per-part `<Internal>`
variants; load KSA: mod loads with no errors; both parts appear in the VAB and place
correctly; both custom meshes render with correct textures (two `<MeshAtlas>` in one
Assets.xml — §0.3(2)); the shared-template variants behave per part. Then flip the
scope pending line (P3.11(2)).

## Appendix B — Accepted limitations (state them in docs/multi-part.md)

1. Ghosts exclude connectors/colliders/seats/light markers/aids (editor furniture).
2. Measure/pivot picks cannot snap to ghost surfaces (root-scoped picking — I5).
3. Phone gets menu/palette part switching only, not the popover manager (P4.06).
4. Export variant ids change form once (`flexo_<base>_<ns>_<template>`); re-exports
   into an existing mod folder produce `-2` suffixed XML by the standing non-overwrite
   rule — delete stale files manually, as today.
5. Overlapping translucent ghosts sort with three.js's default transparency caveats
   (same class as layer fade today).
6. Registry meta edits (opacity/offset) mark the export preview stale
   (over-invalidation; rebuilds are lazy+memoized).
7. `⌥1`–`⌥9` covers the first nine parts; beyond that use the dropdown/palette.
8. Aid-undo wormhole across parts (P1.04(6)): undoing in one part can restore
   measurements/containers to that part's snapshot age, stepping on aid edits made
   while another part was active. Rare interleaving; redo/further edits recover.

## Appendix C — Task index

| Task | One-liner |
|---|---|
| P1.01 | `partsStore` module: types, atoms, helpers |
| P1.02 | Schema v4: `SavedPartEntry` / `ProjectSnapshot` / history `byPart` / meta / version bump |
| P1.03 | Serialize / normalize / apply / lifecycle on v4 |
| P1.04 | History parking + persistence |
| P1.05 | `switchPart` choreography |
| P1.06 | Part CRUD + view setters |
| P1.07 | Asset hydration across all parts + per-part blob sweep |
| P1.08 | Scene reconcile template-change guard |
| P1.09 | Phase 1 tests |
| P2.01 | Envelope `parts[]` |
| P2.02 | Codec v11 |
| P2.03 | Import/load paths on v11 |
| P2.04 | `clonePartWithFreshAssets` (five-family remint table) |
| P2.05 | `duplicatePart` |
| P2.06 | Archive + import modes (`new` / `add-parts` / `merge-into-active`) |
| P2.07 | Phase 2 tests |
| P3.01 | `NamedExportPart` + `ns` seam |
| P3.02 | Cross-part preflight blockers |
| P3.03 | Multi serializers (`serializePartsXml` / `serializeGameDataXml`) |
| P3.04 | `buildMultiModContent` + ns'd variants |
| P3.05 | `<FixedReaction>` dedupe |
| P3.06 | Assets XML: N plans, N `<MeshAtlas>` |
| P3.07 | `buildMultiCustomBundle` + zip/folder writers |
| P3.08 | Preview store stamps |
| P3.09 | Export dialog |
| P3.11 | scope/ + docs sync (mandatory) |
| P3.12 | Phase 3 tests |
| P4.01 | Part commands + palette provider |
| P4.02 | Rename + delete-confirm dialogs |
| P4.03 | File-menu section |
| P4.04 | `PartSwitcher` chip + popover manager |
| P4.05 | Hotkeys `⌥1-9` / `⌥.` / `⌥,` |
| P4.06 | Phone-minimal reachability |
| P4.07 | Phase 4 tests |
| P5.01 | `buildMeshRenderData` extraction |
| P5.02 | `planGhostItems` (pure) + tests |
| P5.03 | `GhostPartsLayer` |
| P5.04 | EditorScene integration |
| P5.05 | Transparency/perf audit |
| P5.06 | Ghost docs + manual checklist |
| P6.01 | Navigator labels |
| P6.02 | Seat-view clamp |
| P6.03 | Cross-part paste layer re-home |
| P6.04 | Asset Manager labels |
| P6.05 | Project Manager surfaces |
| P6.06 | Intent-atom audit (+ `switchPart` clear list) |
| P6.07 | Docs refresh + AGENTS pointers |
| P6.08 | Smoke step |
| P6.09 | Release gate + in-game verify |






