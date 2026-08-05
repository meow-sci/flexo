# flexo v2 area design — Project management, persistence/archive model, Export to KSA, sharing

Status: area design, plugs into `foundation.md` (LAW). Primary census inputs:
`analysis/project-management.md`, `analysis/export-integration.md`, `analysis/custom-assets.md`
(binary tiers), `analysis/shell-layout.md`, `analysis/chains-misc.md` (settings/misc).
All LOCKED decisions honored; deviations/extensions called out in §13.

Decision summary (the load-bearing calls, argued in-line below):

| # | Question | Decision |
|---|---|---|
| D1 | Project identity | Stable random ids (`p_<base36×12>`); name is pure display metadata, auto-suffixed for uniqueness, never a storage key. Rename-clobber is structurally impossible |
| D2 | Snapshot storage | IndexedDB `flexo-projects` (stores: `meta` / `snapshots` / `history` / `thumbs`); localStorage keeps only `flexo:currentProjectId` |
| D3 | Boot | Hydration stays pre-render and single-paint, but becomes **awaited async** (IDB read before `ReactDOM.render`); boot ORDER unchanged |
| D4 | Undo history persistence | KEPT (undo survives reload — v1 user-visible feature) but split out of the snapshot into its own `history` record: capped at existing `MAX_UNDO`, written on a slower 1500 ms debounce. Snapshot autosave writes stay small |
| D5 | Multi-tab | Web Locks per-project write lock + BroadcastChannel index sync. Second tab on the same project = read-only with an explicit **Take over** action (lock steal). No silent last-writer-wins ever again |
| D6 | v1 data at boot | `flexo:project:*` + `flexo:currentProject` keys are **purged with a named notice** (names read from the keys themselves — zero parsing, zero migration). DECISIONS #3/#4 |
| D7 | Asset namespacing | assetDb blob keys gain a project prefix `pa:<projectId>:<kind>:<assetId>`; project delete range-sweeps its blobs (kills the v1 orphan leak); duplicate copies blobs. Contract handed to the surface/assets area |
| D8 | Archive | `.flexo.tar.gz` = `manifest.json` + `project.json` (wire codec, exact-version) + `thumbnail.webp` + `assets/<kind>/<id>`. Hand-rolled USTAR (~150 LoC) + native `CompressionStream('gzip')`. No new dependency |
| D9 | Archive import | One dialog, destination radio: **Merge into current project** (default; additive, ONE undo step, full id remap incl. binary adoption + hash dedup) or **Open as new project** (faithful, fresh project id) |
| D10 | Share links | Asset-less projects only (kitten meshes still fine). With binary assets the dialog stays enabled, explains, and offers "Export archive instead". Pipeline/boot behavior byte-identical to v1 |
| D11 | Export to KSA | Stays an overlay dialog (`⌘E`), two modes **Deliver mod / Inspect XML**; Assets XML built **lazily on tab focus** with an explicit stale→Rebuild affordance (kills the eager-KTX2-encode hole). Blockers never gate the write; the button relabels "Export anyway (N blockers)" |
| D12 | Mod folder home | File ▸ Mods Folder ▸ (status + Choose/Re-grant/Forget) is the management home; the export dialog keeps its inline grant row; Forget gets a real confirm |
| D13 | Wiki preview app | Stays deliberately **unlinked** from the editor; no copy-embed affordance (it renders built-in parts only — a link from a user project would lie). CI/manifest contract untouched |
| D14 | Build mismatch | Demoted to a sticky notification with [Reload] [Reset everything…] (S26). The schema purge remains the real guard |
| D15 | Thumbnails | Offscreen deterministic capture (frame-all, ¾ view, 384×216 WebP) via a one-shot intent atom; captured on switch-away / tab-hide / 60 s-while-dirty / create+import |

---

## 1. Storage model

### 1.1 Identity

```ts
type ProjectId = string;              // "p_" + 12 random base36 chars, minted once at create
```

- `$currentProjectId: atom<ProjectId>` replaces name-as-pointer. localStorage
  `flexo:currentProjectId` = `{id}` (only project key left in localStorage).
- Display **names are metadata**. Create/rename/duplicate/import run
  `uniqueProjectName(base)` against the index and auto-suffix ("Rover" → "Rover 2") so
  names stay unique for humans and filenames — but nothing breaks if two rows ever
  matched; storage never keys on name. Renaming NEVER touches another project (fixes the
  v1 silent clobber, `projectStore.ts:415-422`).

### 1.2 IndexedDB layout — DB `flexo-projects`, version 1

| Object store | Key | Value | Written by |
|---|---|---|---|
| `meta` | projectId | `ProjectMeta` (below) | every snapshot save; metadata edits |
| `snapshots` | projectId | `ProjectSnapshot` v2-shape (document + layerView + activeLayerId + camera + measurements + containers + savedAt; **no history**) | autosave (300 ms debounce, unchanged) |
| `history` | projectId | `{undo: HistoryEntry[], redo: HistoryEntry[]}` capped at existing `MAX_UNDO` | autosave sibling, **1500 ms debounce** |
| `thumbs` | projectId | `Blob` (image/webp 384×216) | thumbnail capture (§1.6) |

```ts
interface ProjectMeta {
  id: ProjectId;
  name: string;
  description: string;              // NEW — plain text, ~500 chars soft cap
  partId: string;
  createdAt: number;                // NEW
  savedAt: number;
  schemaVersion: number;           // PROJECT_SCHEMA_VERSION at write time
  counts: {                         // derived from the part at save time
    subParts: number; connectors: number; colliders: number; seats: number;
    lights: number; kittens: number; animations: number; layers: number;
    customTextures: number; customMaterials: number; customMeshes: number;
  };
  bytes: { snapshot: number; history: number; assets: number };  // sizes for the manager
  hasThumb: boolean;
}
```

- `PROJECT_SCHEMA_VERSION` remains the compatibility contract (constitution): boot scans
  `meta`; any row whose `schemaVersion` mismatches, or whose snapshot fails to parse, is
  **deleted with its snapshot/history/thumb/asset-prefix** and named in a boot `warning`
  notification. Additive fields default-fill via `normalizePart` (document AND every kept
  history entry) exactly as today. No conversion code, ever.
- `listProjects()`-style full-snapshot parsing is dead: the manager reads `meta` only.
  The `setTick` hack dies with it (reactive `$projectIndex`, §11).

### 1.3 Autosave & failure surfacing

- Subscription set unchanged (`$part`, `$activeLayerId`, `$layerView`, `$projectName`→
  now meta name, `$cameraState`, `$measurements`, `$containers`, history atoms).
  `suspended` flag during snapshot application unchanged. No Save button anywhere;
  `⌘S` = registered no-op → status flash "Autosaved ✓" (foundation).
- Two debounced writers: snapshot+meta at **300 ms**, history at **1500 ms** (history is
  the bulk; a reload inside the 1.5 s window loses at most the last undo *entries*, never
  document state).
- **Write failure is loud now** (fixes the silent `console.warn`): a failed IDB put sets
  `$autosaveHealth = 'failing'` →
  - status-bar message (danger, persistent while failing): `Autosave failing — storage may be full`
  - one `danger` notification (persistent, unread) with body: quota estimate readout +
    actions **[Open Projects…]** (delete something) **[Retry now]**.
  - recovery flips `$autosaveHealth = 'ok'` and posts a `transient` "Autosave recovered ✓".
- Quota UI: the Project Manager footer shows `navigator.storage.estimate()` as
  `Storage: 312 MB used of ~4.2 GB` + a one-time **"Keep storage persistent"** button
  (`navigator.storage.persist()`; hidden once granted).

### 1.4 Multi-tab (D5)

- **BroadcastChannel `flexo:projects`**: messages `{type:'index-changed'}` (any
  create/rename/describe/save/delete/duplicate) → all tabs reload `meta` into
  `$projectIndex`; the manager list is live across tabs.
- **Web Locks**: opening a project requests
  `navigator.locks.request('flexo:project:<id>', {mode:'exclusive', ifAvailable:true}, holder)`.
  - Got it → this tab owns autosave for the project (normal).
  - Didn't → `$projectLock = 'readonly'`: autosave suspended, status bar shows a
    persistent amber chip `Read-only — open in another tab`, and a sticky `warning`
    notification: *"This project is open in another tab. Changes here are NOT saved."*
    with action **[Take over]** → re-request with `{steal: true}`.
  - The robbed tab's holder promise rejects → it flips itself to `readonly`, posts its
    own sticky warning *"Another tab took over autosave. Reload to pick up its changes."*
    with **[Reload]**.
- No Web Locks API (ancient browsers): degrade to v1 behavior + a one-time `warning`
  notification documenting the single-tab constraint. No bespoke fallback protocol.
- Optional deep-open: boot honors `?project=<id>` (open that project; param stripped via
  `replaceState` like `?load=`). Manager row ⋮ gains **Open in new tab** using it.

### 1.5 Per-project asset namespacing (D7 — contract for the surface/assets area)

**This section is the SINGLE OWNER of the key scheme and blob lifecycle** (purge, delete
sweep, duplicate copy). design-surface-assets §7.3 adopts it by reference and contributes
the `listProjectBlobs(projectId)` enumeration API — it defines no key literal of its own.

- `assetDb` keys become `pa:<projectId>:<kind>:<assetId>` with kinds unchanged
  (`tex-src`, `tex-ktx2`, `import-glb`, `emissive-paint`, `mesh-glb`). API change:
  every read/write takes `projectId` (customAssetStore passes `$currentProjectId`).
- Boot: keys without a recognized `pa:<id>:` prefix are **purged** (constitution: purge,
  never convert) with the standard boot warning notification.
- `deleteProjectAssets(projectId)` = one `IDBKeyRange.bound` prefix sweep — project
  delete finally reclaims blobs (v1 leak, pain point #11).
- `copyProjectAssets(fromId, toId)` — used by Duplicate; asset ids are unchanged
  (namespace makes them collision-free), so descriptors need no rewrite.
- Hydration order preserved: `initCustomAssets()` still runs strictly after project
  hydration and re-hydrates on `$currentProjectId` change (replaces the v1
  `$projectName` subscription). `ensureCurrentKtx2` cache-invalidation unchanged.

### 1.6 Thumbnails (D15)

- Capture is scene work → sanctioned **one-shot intent atom**:
  `$thumbnailRequest: atom<{nonce:number} | null>` consumed by EditorScene; it renders
  the current document to an offscreen 384×216 target — **deterministic framing**:
  frame-all of listed+visible layers, azimuth 45° / elevation 30°, current environment —
  encodes WebP (q 0.8) via `canvas.toBlob`, writes `thumbs[projectId]`, sets
  `meta.hasThumb`. On-demand render loop: this is a single invalidate+render, not a
  continuous mode.
- Cadence: (a) project switch-away (before applying the next snapshot), (b)
  `visibilitychange → hidden` while dirty, (c) at most every 60 s while dirty, (d) once
  right after create/import completes. Empty document → skip capture; UI shows a
  placeholder glyph (⬚) instead.

### 1.7 Boot sequence v2 (order preserved; sync → awaited)

```
main.tsx:
 1. registerEditorAidStores()                          (unchanged, first)
 2. purgeV1ProjectKeys()          — delete flexo:project:* + flexo:currentProject;
                                    collect names FROM THE KEYS (no parsing);
                                    queue one warning notification: "Projects from a
                                    previous flexo version were removed (incompatible
                                    format): A, B, C" (D6). Runs once; no-op after.
 3. await hydrateProjectOnBoot()  — open flexo-projects; read flexo:currentProjectId;
                                    load snapshot+history (fallback: newest savedAt;
                                    fallback: create fresh "Untitled"); schema-purge scan
                                    (§1.2) with named notice; acquire the Web Lock;
                                    honor ?project=<id>.
 4. initCustomAssets()            — strictly after hydrate (unchanged invariant)
 5. initAnimationStore()
 6. share-param branch            — ?load= detection; suppress About first-use + skip
                                    build check WITHOUT consuming either flag (unchanged)
 7. checkBuildId()                — now posts the sticky NOTIFICATION (§9.1), no modal
 8. void initModFolder()          — async, unchanged
 9. render <App/>
```

Single-paint property retained: nothing renders until the awaited hydrate resolves
(IDB read of one snapshot ≈ few ms); the HTML background shows meanwhile — no flash of
wrong project. Async share decode still lands post-paint (unchanged).

### 1.8 Per-interaction undo/persistence rules (this area)

| Interaction | Undo? | Persistence effect |
|---|---|---|
| Rename / Edit description / thumbnail | never (metadata, not document) | meta write + broadcast |
| New / Open / Duplicate / Delete project | never; Open **replaces** history stacks wholesale (v1 semantics) | full record writes; delete sweeps snapshot+history+thumb+assets |
| Archive import → merge | **ONE step** ("import project", `mergeProjectImport` semantics verbatim) | autosave picks it up |
| Archive import → new project | never (arrives as a fresh saved project) | new records |
| Share-link open | never (new project) | new records |
| Export (archive / KSA / share) | read-only over the document | none |
| Mode/dialog/layout state | never | per foundation |

---

## 2. Project Manager — overlay dialog `projects` (L; File → Projects… `⌘O`; project chip click)

### 2.1 Desktop layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ Projects                                    [🔍 fuzzy search…]  [Sort: Saved ▾] │
│ [＋ New Project] [⤓ Import…]                                    [⊞ grid|☰ list] │
├────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────── CURRENT ───┐ │
│ │ [thumb  ] Rover-7                                    savedAt 2 min ago     │ │
│ │ [384×216] part id: rover_1 · 34 SubParts · 6 conn · 2 anim · 5 layers      │ │
│ │           "Crew rover with deployable dish" ✎        created 2026-07-02    │ │
│ │           1.8 MB (+12 MB assets)     [Rename] [Export archive…] [Share…] ⋮ │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐        │
│ │ [thumb]       │ │ [thumb]       │ │ [⬚ no thumb]  │ │ [thumb]       │        │
│ │ Lander Mk2    │ │ Station Hub   │ │ Untitled 3    │ │ Dish Test     │        │
│ │ 12 SP · 1 anim│ │ 87 SP · 12 cn │ │ empty         │ │ 4 SP          │        │
│ │ saved 3d ago  │ │ saved 2w ago  │ │ saved 1mo ago │ │ saved 2mo ago │        │
│ │ [Open]      ⋮ │ │ [Open]      ⋮ │ │ [Open]      ⋮ │ │ [Open]      ⋮ │        │
│ └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘        │
├────────────────────────────────────────────────────────────────────────────────┤
│ All changes autosave — there is no Save button.                                │
│ Storage: 312 MB used of ~4.2 GB  [Keep storage persistent]           [Close]   │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Current project** pinned as a wide card on top with a `CURRENT` chip; inline rename
  (click name → TextField, Enter/Esc) and inline description edit (✎ → multiline
  TextField, commit on blur/Enter, Esc reverts). "All changes autosave" stated in the
  footer (§10.2 mandate).
- **Grid/list toggle** (persisted `flexo:projectManagerView = {view, sort}`); list view =
  one row per project with the same fields in columns
  (thumb 64×36 · name+description · counts · created · saved · size · actions).
- **Search**: fuzzy (subsequence) over name + description + partId. Empty result state:
  "No projects match “xyz”". 
- **Sort** menu (radio): Last saved (default) · Created · Name A–Z · Size.
- Counts line renders non-zero counts only (`34 SubParts · 6 connectors · 2 animations ·
  5 layers`); hover tooltip shows the full `ProjectMeta.counts` table.

### 2.2 Row/card actions

| Action | Gesture | Behavior |
|---|---|---|
| **Open** | button / double-click card / Enter | `openProject(id)` — flush pending autosave of current, capture its thumbnail, apply snapshot (suspend autosave, clamp active layer, clear selection, `closeChain()`, restore camera, replace history — v1 semantics verbatim), acquire lock, mode→Build, dialog closes. Disabled ("Open") → shows `CURRENT` chip instead for the current project |
| **Rename** | ⋮ / inline on current | in-place TextField; commit runs `uniqueProjectName` auto-suffix — collision NEVER clobbers, never blocks (status flash notes the suffix: `Renamed to "Rover 2" (name taken)`) |
| **Edit description** | ⋮ / inline ✎ | multiline inline editor, 500-char soft cap counter |
| **Duplicate** | ⋮ | new id, name `"<name> copy"` (unique-ified), copies snapshot + thumb + `copyProjectAssets`; **history NOT copied** (fresh stacks — a duplicate is a new artifact). Does not switch to it; status flash `Duplicated → "Rover-7 copy"` with **[Open]** action |
| **Save As…** | ⋮ (current project only) | Duplicate + Open in one step (the classic save-as affordance) |
| **Export archive…** | ⋮ / button | opens `export-archive` dialog **for that row's project** (§4.2) — works for ANY project, not just current (v1 gap #12 closed) |
| **Share…** | ⋮ | opens `share-link` dialog scoped to that project (asset-less rule §5) |
| **Open in new tab** | ⋮ | `window.open('<base>?project=<id>')` (§1.4) |
| **Delete** | ⋮ / trash | **inline destructive strip** on the row (foundation §10.1): `Delete "Station Hub"? This permanently removes the project and its 12 MB of assets. Undo cannot restore it. [Delete] [Cancel]`. Deleting the current project: strip adds "You'll be switched to your most recent project." → switches to newest remaining, or creates fresh "Untitled" (v1 semantics). No modal-in-modal ever |

All destructive copy follows the confirm policy (§14.3 foundation): project delete is
not-undoable → always confirm, irreversibility stated.

### 2.3 Empty / edge states

- Fresh install: current "Untitled" card + hint row: *"Projects live in your browser and
  autosave as you work. Import an archive or start building — Add ▸ SubPart…"*.
- A row whose lock is held elsewhere shows a small `● open in another tab` badge.
- Storage failing (`$autosaveHealth`): red banner pinned above the grid — *"Autosave is
  failing — free space by deleting a project, or export archives as backups."*

### 2.4 Phone (cover per S22)

Fullscreen sheet. Current card on top (thumb left, two-line meta), then a single-column
list. Search pinned; Sort in a sheet. Row tap = Open; row ⋮ = action sheet with the same
actions (Delete uses the same inline strip pattern inside the sheet). Footer storage line
kept. Inline rename/describe work identically (sheet keyboards).

---

## 3. Small project dialogs

- **Rename Project…** (S, File menu): single TextField seeded with current name; Enter
  commits (auto-suffix rule as above); Esc/Cancel closes. Exists for menu/palette parity;
  the manager's inline rename is the primary path.
- **New Project** (File): instant command — `createProject(uniqueProjectName('Untitled'))`
  = fresh empty document/history/layerView/camera, new id, saved immediately, switch.
  Status flash `New project "Untitled 4"`.
- **Duplicate / Save As** — commands routed through the manager actions (§2.2), also in
  the ⌘K palette (`Duplicate current project`, `Save project as…`).

---

## 4. The `.flexo.tar.gz` archive (LOCKED #3)

### 4.1 Format (D8)

```
<Name>.flexo.tar.gz            (gzip over a USTAR tar)
├── manifest.json              — MUST be the first tar entry
├── project.json               — the wire envelope (projectCodec, PROJECT_EXPORT_VERSION)
├── thumbnail.webp             — optional
└── assets/
    ├── tex-src/<assetId>      — original upload bytes (mime in manifest)
    ├── tex-ktx2/<assetId>     — encoded ktx2 (verbatim; avoids re-encode on import)
    ├── import-glb/<importId>  — the ONLY copy of imported geometry
    ├── emissive-paint/<meshId>
    └── mesh-glb/<id>          — if/when present in assetDb
```

```jsonc
// manifest.json
{
  "format": "flexo-project-archive",
  "archiveVersion": 1,                  // container layout version (exact-match)
  "exportVersion": 8,                   // PROJECT_EXPORT_VERSION of project.json (exact-match)
  "name": "Rover-7", "description": "…",
  "savedAt": 1754300000000, "appBuildId": "abc123",
  "counts": { …ProjectMeta.counts… },
  "assets": [
    { "kind": "tex-src", "id": "t_ab12", "path": "assets/tex-src/t_ab12",
      "bytes": 152330, "mime": "image/png", "sha256": "…" }
  ]
}
```

- **Versioning per the no-migration constitution**: import requires exact
  `archiveVersion` AND exact `exportVersion`. Mismatch → hard error view, copy:
  *"This archive uses format v9; this flexo reads v8. flexo never converts formats —
  re-export it from a matching flexo version."* Additive manifest fields never bump;
  a layout break bumps `archiveVersion`; the wire rules for `exportVersion` are the
  existing codec contract (unchanged).
- `project.json` is the **same envelope the codec already produces** — one serializer,
  no archive-only dialect. Non-kitten custom-mesh descriptors ARE allowed on this wire
  **only when the container provides their binaries**: `parseProjectImport` gains a
  `{binaryAssets: AssetTable | null}` argument — `null` (bare JSON / paste / share link)
  keeps the v1 drop-smuggled-meshes rule verbatim; an archive's asset table lifts it.
- **Implementation** (D8): `src/state/tarArchive.ts` — minimal USTAR writer/reader
  (512-byte blocks, name ≤ 100 chars — our paths are short ids, no pax needed), pure
  functions, no react/three imports. Gzip via native
  `CompressionStream('gzip')` / `DecompressionStream` streamed into a Blob.
  Feature-detect once; absent (no modern target lacks it) → Export Archive shows an
  unsupported-browser error box. No new package.

### 4.2 Export flow — dialog `export-archive` (S→M, DialogViewStack)

Entry: File → Export Project Archive… (current project) · Project Manager row action
(any project) · palette.

```
View 1 — Summary                       View 2 — Progress (undismissable)
┌─ Export archive ───────────┐        ┌─ Exporting… ───────────────┐
│ Rover-7                    │        │ ▓▓▓▓▓▓░░░ Packing assets   │
│ 34 SubParts · 2 animations │        │ 7 / 12 files · 9.1 MB      │
│ 12 assets · ≈ 11.6 MB      │        │            [Cancel]        │
│ File name [Rover-7]        │  ───►  └────────────────────────────┘
│  → Rover-7.flexo.tar.gz    │        Done → status flash "Archive
│        [Cancel] [Export]   │        exported ✓" + success notif.
└────────────────────────────┘
```

- Source: the STORED snapshot + namespaced blobs (never editor state), so any row
  exports without loading; exporting the current project calls `flushAutosave()` first.
- Phases surfaced in the dialog AND mirrored in the status-bar progress segment:
  `Collecting assets → Packing → Compressing`. Cancel aborts cleanly (no partial file).
- Delivery: `showSaveFilePicker` when available (suggested name
  `<sanitized name>.flexo.tar.gz`), else Blob + `<a download>`. Errors (blob read fail,
  quota) → danger box in the dialog + `danger` notification.
- Asset-less projects export fine (empty `assets/`, tiny archive).

### 4.3 Import flow — dialog `import-project` (M, DialogViewStack; File → Import Project…)

```
View 1 — Pick                              View 2 — Review
┌─ Import project ────────────────┐       ┌─ Import "Rover-7" ──────────────────┐
│ ┌─────────────────────────────┐ │       │ Archive OK · format v1 · wire v8    │
│ │  Drop a .flexo.tar.gz or    │ │       │ 34 SubParts · 6 connectors · 2 anim │
│ │  .flexo.json here           │ │       │ 5 layers · 12 assets (11.6 MB)      │
│ │        [Choose file…]       │ │  ───► │ Destination                         │
│ └─────────────────────────────┘ │       │ (•) Merge into current project      │
│ …or paste exported JSON:        │       │     adds everything as one undo step│
│ [ paste area               ]    │       │ ( ) Open as new project             │
│                    [Continue]   │       │     becomes "Rover-7 2" (name taken)│
└─────────────────────────────────┘       │ ⚠ 2 warnings ▸ (disclosure)         │
                                          │            [Back] [Import]          │
View 3 — Importing (undismissable):       └─────────────────────────────────────┘
progress bar `Copying assets… 7/12` → done → dialog closes,
status flash + success notification, mode → Build, imported layers revealed.
```

**Merge (default — foundation's additive contract, verbatim semantics + extensions):**
- ONE undo step; every `mergeProjectImport` rule from the census survives byte-for-byte:
  fresh collision-free ids per entity kind, all cross-reference rewrites (animation
  members/solar, couplings, rocket/controller/gimbal refs, consumer feeds + wiring,
  connector siblingIds, raw-XML `<ConnectorRef>`s), source layers — including Default —
  mirrored as new layers, seats appended preserving `iv` order, Part-Id adoption only
  into placeholder, light scale pinned (1,1,1), internalFlags only for imported
  templates, materials/reactions deduped by id.
- **NEW — binary asset adoption**: custom textures/meshes/materials with binaries get
  fresh asset ids (old→new maps rewrite material channel refs, face textures,
  `CustomMesh` descriptors, `subPartId`s and their placements/GameData/animation refs
  through the existing idRemap machinery); blobs are copied out of the tar into the
  destination project's namespace under the new ids.
- **Dedup** (textures only): manifest `sha256` compared against destination textures of
  the same kind (candidate filter: same byte length; destination hash computed lazily at
  import and cached in the descriptor additively). Match → reuse the existing texture id;
  no blob copied. Meshes/imports never dedup (identity is load-bearing).
- Name collisions: layers keep their names (they're new layers — v1 rule); nothing else
  is name-keyed.

**New project:** faithful `envelopeToPart` reconstruction (NO remap, `ensureBuiltInLayers`
backfill — v1 share-link semantics), blobs adopted verbatim under the new project's
namespace (ids unchanged), fresh project id, name unique-ified, saved, **switched to**.

**Errors** (all shown in-dialog, never half-applied):
- not a tar/gzip → *"Not a flexo archive."*
- version mismatch → D8 copy above.
- manifest references a missing asset entry → *"Archive is incomplete (missing
  assets/tex-src/t_ab12). Nothing was imported."*
- paste parse failure → v1 danger message, dialog stays open.

**Phone**: cover; drop zone becomes the file picker (mobile file inputs accept .tar.gz);
paste area kept; identical review/progress views.

---

## 5. Share links (asset-less; D10)

Dialog `share-link` (M) — File → Share Link… or a Project Manager row.

- **No binary assets** (kitten meshes still count as data-only — unchanged gate logic,
  now scoped to sharing only): flow is v1 verbatim — [Generate link] (async Zstd 19) →
  link `<pre>` + char count + [Copy link] [Regenerate]; warning above 8000 chars:
  *"Some browsers truncate URLs this long — consider an archive instead."*
- **With binary assets** the item stays ENABLED (foundation Law: explain, don't gray):
  the dialog body swaps to:
  > **This project has binary assets (3 textures, 1 imported model).**
  > A share link is a URL — it can't carry files. Export an archive instead; the
  > recipient imports it via File ▸ Import Project….
  > `[Export archive instead…]` (jumps to `export-archive` for this project) `[Close]`
- Boot consumption unchanged and byte-compatible: `?load=` decode → NEW project (fresh
  id, unique name), param stripped via `replaceState`, suppresses first-use About and
  skips build check WITHOUT consuming either flag, decode failure never touches the
  hydrated project, success/danger surfaced (now via status flash + notification).
- Non-current-project share: encodes from the stored snapshot (flush if current).

---

## 6. Export to KSA — dialog `export-ksa` (L; File → Export to KSA… `⌘E`)

One dialog, two modes via ToggleButtonGroup (preserved): **Deliver mod** (default) ·
**Inspect XML**. All content built by the untouched single-source builders
(`expandGlassGlow` → `buildModContent` / `buildCustomBundle`) — preview and shipped
bytes can never diverge (invariant).

### 6.1 Deliver mod

```
┌─ Export to KSA ────────────────────────────────────────────────┐
│ [ Deliver mod ] [ Inspect XML ]                                │
├────────────────────────────────────────────────────────────────┤
│ PRE-FLIGHT                                                     │
│ 🟥 2 blockers — KSA would refuse to load this mod          ▸   │
│    · Combustor #1: no reaction selected      [→ Engine mode]   │
│    · Duplicate instance id "tank_2"          [→ Build mode]    │
│ 🟨 1 warning — loads, but misbehaves                        ▸  │
│ ℹ 1 note                                                    ▸  │
├────────────────────────────────────────────────────────────────┤
│ MODS FOLDER                                                    │
│ ✓ "mods" — ready                                   [Change…]   │
│   (4 states verbatim: unsupported / none "Choose mods          │
│    folder…" / ready / needs-permission "Re-grant")             │
│ Writes flexo-parts/: Rover-7Part.xml · Rover-7GameData.xml ·   │
│ Rover-7Assets.xml · Meshes/ Textures/ Animations/              │
│ Existing XML is never overwritten; mod.toml accumulates.       │
├────────────────────────────────────────────────────────────────┤
│ EXPORT SETTINGS (read-only chips, deep-link Settings ⌘,)       │
│ [Kitten textures: bundle ⧉] [_VM decimation: on ⧉]             │
├────────────────────────────────────────────────────────────────┤
│         [Download mod zip]   [Export anyway (2 blockers)]      │
└────────────────────────────────────────────────────────────────┘
```

- **Validation** (block/warn/info): same four validators + basic trio, now normalized
  into one issue model `{severity, area, message, jumpTarget?}` so styling/copy can't
  diverge (pain point #9). Boxes are disclosures (collapsed to the count line when >3
  issues) so warnings can no longer push the export buttons below the fold (pain #1).
  Each issue row gets a **jump link** using the cross-mode jump convention (§2.5
  foundation): closes the dialog, switches mode, focuses the offending scope.
- **Non-blocking policy retained** (foundation-pinned): blockers never disable the
  buttons; the primary button relabels **"Export anyway (N blockers)"** (else
  "Export to mods folder"). Zip button always available (zero-permission fallback).
- **Folder grant row**: 4 states verbatim; `getWritableModFolder` may still prompt
  inline on the button press (user gesture); Re-grant button for `needs-permission`.
  `unsupported` (e.g. iOS) → warning box + zip promoted to primary.
- **Write semantics untouched**: non-overwrite `-N` suffixing for XML, binaries
  overwrite, `mod.toml` rebuilt from the folder listing.
- **Progress + result**: busy state on the button + status-bar progress segment; success
  = status flash `Rover-7Part.xml + GameData → mods/flexo-parts ✓` AND a `rich`
  notification "Export complete" whose body lists written files + the pre-flight
  summary at export time (foundation §5.1). Failures = `danger` notification with the
  thrown message.
- Export never throws halfway: unresolvable geometry warns + drops that SubPart, rest
  ships (invariant).

### 6.2 Inspect XML (the lazy-rebuild fix, D11)

```
│ [ Deliver mod ] [ Inspect XML ]                                │
│ tabs: [ Part ] [ GameData ] [ Assets ]                         │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ <Part Id="rover_1">…            (read-only mono textarea)  │ │
│ └────────────────────────────────────────────────────────────┘ │
│ [Copy] [Download .xml]                (kit CopyDownloadBar)    │
│ Assets tab only:  ⟳ built 12 s ago · [Project changed — Rebuild]│
```

- **Per-tab lazy builds keyed by an input stamp** `(partRef, projectName, catalog,
  kittenTexExport, decimateViewMeshes)`, encapsulated in one hook/store
  (`exportPreviewStore`, §11) instead of the v1 inline stamp-compare:
  - Part / GameData: built on first focus of their tab, memoized by stamp (cheap sync).
  - **Assets: built ONLY on first focus of the Assets tab** (async; "Building Assets
    XML…" placeholder). While the dialog is open, further document changes DO NOT
    rebuild — the tab shows a stale chip `Project changed — [Rebuild]`; refocusing the
    tab after leaving it also auto-rebuilds once. The eager
    full-KTX2-encode-per-keystroke hole is closed; cancellation actually aborts the
    encode chain (builder takes an AbortSignal).
  - No custom assets/variants → explanatory placeholder (v1 copy kept).
- Pre-flight strip renders collapsed (counts only) at the top of this mode too.

### 6.3 Phone

Cover dialog; mode toggle pinned top; pre-flight collapsed by default; grant row —
`unsupported` on iOS makes **Download mod zip** the single primary button; XML tabs
render with horizontally-scrollable mono blocks + CopyDownloadBar. Settings chips
deep-link into the Settings sheet.

---

## 7. Mods-folder management (D12)

- **File ▸ Mods Folder ▸** (foundation tree, this area owns the spec):
  - status row (disabled info item): `✓ "mods" — ready` / `⚠ "mods" — needs re-grant` /
    `Not set` / `Folder access unsupported in this browser`.
  - `Choose Folder…` (native `showDirectoryPicker`, id `flexo-mods`, readwrite).
  - `Re-grant Access` — only in `needs-permission` (user-gesture requirement satisfied
    by the menu click).
  - `Forget Folder…` — only when set; **confirm** (S): *"Forget access to “mods”? flexo
    keeps no copy of the grant; you'll re-pick the folder next export."* → wraps the
    existing `forgetModFolder()` (finally gets UI outside the nuke path).
- Grant persistence unchanged: IndexedDB `flexo-fs/handles/modsDir`; passive
  `queryPermission` on boot; global (per-machine), deliberately not per-project.
- The export dialog's inline grant row (§6.1) and this menu edit the same store — no
  duplicate state.
- Reset Everything keeps the "Reset folder access grants" opt-in switch (`flexo-fs`
  survives by default) — on ALL platforms (fixes the phone inconsistency).

---

## 8. Wiki preview mini-app (D13)

Unchanged and deliberately unlinked: no editor entry point, no copy-embed affordance
(the app renders built-in catalog parts only — an embed link from a user project would
imply user parts render there; they don't). `manifest.json` shape, query params,
sandbox guarantees, thumbnail CI ordering, `assetBase.ts` Node-callable indirection —
all untouched invariants. Any future revisit is out of v2 scope by decision, not
omission.

---

## 9. Misc surfaces

### 9.1 Build-mismatch demotion (D14, S26)

`checkBuildId()` unchanged (prod-only, share-launch skip, writes current id). On
mismatch: **sticky notification** (unread, persistent):
> **flexo was updated** — a new build was deployed since your last visit. Your projects
> are unaffected (incompatible ones are removed automatically with a notice).
> `[Reload]` `[Reset everything…]`

No modal, nothing blocks boot. `[Reset everything…]` opens the single Reset confirm
(§9.2). The schema-version purge notice remains a separate boot `warning` notification.

### 9.2 Reset Everything — ONE command

Home: Settings → Advanced (danger zone) + the mismatch notification action. Inline
confirm view (DialogViewStack, not modal-in-modal): consequences list ("all projects,
assets, settings, notifications — this browser only"), Switch **Reset folder access
grants (if any)** (default off), confirm button `Reset everything 🔥`.
`nukeAndReload` semantics unchanged: localStorage + sessionStorage cleared, every
IndexedDB deleted **except `flexo-fs`** unless opted in (the new `flexo-projects` DB is
covered by enumeration), tolerate missing `indexedDB.databases()`, reload in `finally`.
Reset re-triggers first-run About (aboutSeen wiped).

### 9.3 About / first-run

Foundation §10.5 kept verbatim: Help → About flexo…; auto-open on true first run;
suppressed (not consumed) on share-link launches; legally load-bearing MIT +
RocketWerkz/Dean Hall attribution text retained; center desktop / cover phone. The v1
About-vs-purge-toast race disappears structurally: the purge notice is a bell
notification, not a toast under the About cover.

### 9.4 Settings dialog IA (consolidation; foundation §10.7 elaborated for this area's tabs)

- **Import & Export** tab (this area owns):
  - *Model import* group: Up axis (Y/Z) · Max texture size (1024/2048/4096) ·
    Bake scale into geometry (switch) · **Decimate view meshes** (switch, caption:
    "also affects export — full-res `_VM` picking meshes are slow in-game").
  - *Kitten mesh textures (export)* group: Source select
    `Bundle copies into mod` (recommended) / `Reference game install`; reference mode
    reveals the mono **Content/Core path** TextField + the install-tied caveat caption
    (`.NET Path.Combine` rooted-path behavior — caption text kept).
  - The export dialog's chips (§6.1) deep-link here (`Settings…` opened with
    `{tab:'import-export'}` param via dialogStore).
- **Advanced** tab: build id readout (mono) · storage usage readout (same numbers as the
  manager footer) · **Reset Everything 🔥** (§9.2).
- General/Viewport/Scene tabs per foundation (other areas own their fields).
- Every field here is a persisted preference (`@nanostores/persistent`), zero undo
  participation; numeric fields (none currently in these two tabs — Content/Core is free
  text) would use `useNumberDraft` + `inputMode="url"` per constitution.

---

## 10. Commands, menus, hotkeys (additions this area registers)

| commandId | Menu path | Keys | Notes |
|---|---|---|---|
| `project.new` | File → New Project | — | instant |
| `project.manager` | File → Projects… | `⌘O` | dialog `projects` |
| `project.rename` | File → Rename Project… | — | dialog S |
| `project.import` | File → Import Project… | — | dialog `import-project` |
| `project.exportArchive` | File → Export Project Archive… | — | dialog `export-archive` (param: projectId, default current) |
| `project.shareLink` | File → Share Link… | — | dialog `share-link` |
| `export.ksa` | File → Export to KSA… | `⌘E` | dialog `export-ksa` |
| `modsFolder.choose` / `.regrant` / `.forget` | File → Mods Folder ▸ | — | §7; enabled predicates off `$modFolder.status` |
| `project.saveFlash` | — | `⌘S` | no-op → "Autosaved ✓" status flash |
| dynamic provider | palette: "Open project: <name>" per index row | — | re-evaluates on query |

All dialog commands write `dialogStore.$openDialog = {id, params}` (no
controlled/uncontrolled dual APIs — the v1 ProjectButton/ExportButton/MobileTopBar
plumbing dies here). Enabled predicates: `project.shareLink` always enabled (explains
inside, D10); `export.ksa` always enabled (pre-flight explains).

---

## 11. Store sketches (`src/state/`, zero react/three imports)

```ts
// projectIndexStore.ts  (LOCKED #3; replaces listProjects + setTick)
$projectIndex   = atom<ProjectMeta[]>([])        // sorted by savedAt desc at load
$currentProjectId = atom<ProjectId>              // mirrors flexo:currentProjectId
$projectLock    = atom<'owner' | 'readonly' | 'unsupported'>
$autosaveHealth = atom<'ok' | 'failing'>
$storageEstimate = atom<{usage:number, quota:number} | null>
// actions (all broadcast 'index-changed' after IDB commit):
createProject(name?) · openProject(id) · renameProject(id, name)
setProjectDescription(id, text) · duplicateProject(id): ProjectId
deleteProject(id)            // sweeps meta+snapshot+history+thumb + deleteProjectAssets
takeOverLock() · flushAutosave()
loadThumb(id): Promise<Blob|null>                 // lazy, LRU-cached for the manager

// projectStore.ts (rewritten persistence core; public contract preserved)
hydrateProjectOnBoot(): Promise<void>             // §1.7 step 3 (awaited)
applyProjectSnapshot(snap)                        // v1 semantics verbatim (suspend, clamp,
                                                  // clearSelection, closeChain, camera restore)
startAutosave()                                   // 300ms snapshot+meta / 1500ms history
requestThumbnail()                                // sets $thumbnailRequest nonce
loadSharedProject(env)                            // fresh id + unique name (v1 + D1)

// projectArchive.ts (pure)
buildProjectArchive(id, {signal, onProgress}): Promise<Blob>
parseProjectArchive(file, {signal}): Promise<{manifest, envelope, assets: AssetTable}>
importArchive({mode:'merge'|'new', parsed, onProgress}): Promise<void>
// merge → editorStore.importProjectData(env, {binaryAssets}) — ONE undo step

// tarArchive.ts (pure): tarPack(entries) / tarUnpack(bytes) + gzip stream helpers

// exportPreviewStore.ts (Export dialog §6.2)
$exportPreview = map<{ tab:'part'|'gamedata'|'assets',
  part?: {stamp, xml}, gamedata?: {stamp, xml},
  assets?: {stamp, xml|null, building:boolean, stale:boolean} }>
buildTab(tab, {signal})                            // stamp-memoized; assets async+abortable
```

`modFolderStore`, `settingsStore` ($kittenTextureExport, $modelImportSettings),
`buildCheck` ($buildMismatch → notification), `aboutStore` — kept, re-surfaced as above.
assetDb API change per §1.5 (coordinated contract with the surface/assets area).

---

## 12. Phone parity summary (every surface in this area)

| Surface | Phone rendering |
|---|---|
| Project Manager | cover sheet, single-column list, row ⋮ action sheet, inline confirm strips (§2.4) |
| Rename / Export archive / Share / Import dialogs | S → centered card; M → cover with pushed views (S22) |
| Archive export/import progress | in-dialog bar + CondensedStatusBar message chip |
| Export to KSA | cover; iOS `unsupported` grant state promotes zip (§6.3) |
| Mods Folder menu | inside the ☰ MenuSheet drill-down (same MenuSpec) |
| Build-mismatch / purge / autosave-failure notices | notification sheet via 🔔 in CondensedStatusBar |
| Settings (Import & Export, Advanced incl. Reset w/ FS switch) | cover, same tabs — FS-grant switch present (fixes v1 phone gap) |
| About first-run | cover (unchanged) |

---

## 13. Foundation alignment notes / declared extensions

1. **Boot hydrate is now awaited-async** (IDB is async; forced by LOCKED #3). Boot ORDER
   and the initCustomAssets-after-hydrate invariant are preserved; the single-paint
   property is preserved by awaiting before render. This refines, not deviates from,
   foundation §13's "hydrate sequence unchanged".
2. **Import Project destination radio**: foundation's File-menu annotation pins the
   additive one-undo-step merge; that remains the DEFAULT. The added "Open as new
   project" option is an extension explicitly delegated to this area
   ("additive-vs-new-project decision") and reuses the already-blessed share-link
   reconstruction path. No foundation behavior is removed.
3. Everything else (menu tree, dialog ids/sizes, status/notification routing, S22/S26,
   §10.6 invariants) is implemented as written.

---

## 14. FEATURE PARITY TABLE (RULE ZERO — every v1 feature in this area → v2 home)

### Project management (analysis/project-management.md)

| v1 feature | v2 home |
|---|---|
| Current-project name display (toolbar, 14ch) | menubar project chip (20ch) + status posture; chip click → Projects… |
| Rename via popover text field | Manager inline rename + File → Rename Project… (auto-suffix; clobber impossible — D1) |
| New Project (uniqueProjectName) | File → New Project + Manager button (§3) |
| Load Project modal (list, counts, savedAt, current marker, Load) | Project Manager (§2) — richer metadata, fuzzy search, sort, grid/list |
| Delete project + nested ConfirmDialog | Manager inline destructive strip (no modal-in-modal); current-delete switch semantics kept (§2.2) |
| Autosave (300 ms debounce, suspended flag, no Save button) | kept verbatim on IDB; ⌘S reassurance flash; history split to 1500 ms (§1.3, D4) |
| Silent autosave write failure | **surfaced**: status danger + persistent notification + quota UI (§1.3) |
| Boot restore (pointer → newest → fresh), single paint | awaited hydrate, same fallback ladder, single paint (§1.7) |
| Boot schema purge + named notice toast | IDB meta scan purge + `warning` notification naming projects (§1.2) |
| normalizePart default-fill (doc + every history entry); crash-on-load backstop delete | kept verbatim (§1.2) |
| Undo survives reload (history in snapshot) | kept — separate capped `history` record (D4) |
| Camera persisted per-project & restored | kept (snapshot field; doc drift fixed in docs by implementation) |
| Selection/tool/snap/seat-view not persisted | unchanged |
| Export Project Data JSON (copy/download) | superseded by **Export Project Archive…** (LOCKED #3 explicitly replaces the JSON snippet); paste/JSON remains accepted on IMPORT |
| hasCustomAssets gate on export | **removed** for archives (LOCKED #3); retained for share links only (D10) |
| Import Project (paste, additive, one undo step, full remap list) | Import Project… dialog — paste kept + file picker + drag-drop; merge semantics verbatim + binary adoption (§4.3) |
| Share Project (Zstd URL, 8000-char warn, regenerate/copy) | Share Link… (§5) — pipeline byte-identical; with-assets explain state |
| Share-link boot (new project, param strip, suppress About + build check, decode-failure safety) | unchanged (§5); opens with fresh project id |
| Build-id mismatch modal | sticky notification [Reload][Reset everything…] (§9.1, S26) |
| Reset Everything ×3 entry points; phone missing FS switch | ONE command: Settings → Advanced + mismatch notification; FS switch on all platforms (§9.2) |
| `nukeAndReload` preserves `flexo-fs`; tolerates old Firefox | unchanged (§9.2) |
| `flexo:project:*` name-keyed storage, `listProjects` full-parse, setTick hack | replaced by id-keyed IDB + reactive `$projectIndex` (§1.2, §11); v1 keys purged with notice (D6) |
| Multi-tab silent clobber | Web Locks + Take over + read-only state (D5) |
| Deleted projects leak IndexedDB blobs | per-project namespace sweep on delete (D7) |
| No duplicate/save-as/sort/search | Duplicate, Save As, sort, fuzzy search, description, thumbnail, open-in-new-tab (§2) |

### Export & integration (analysis/export-integration.md)

| v1 feature | v2 home |
|---|---|
| Export dialog, XML/Mod ToggleButtonGroup | Export to KSA… `⌘E`, Deliver mod / Inspect XML (§6) |
| Pre-flight: basic trio + 4 validators, block/warn/info boxes | unified issue model, collapsible severity boxes + jump links (§6.1) |
| Non-blocking blockers | retained; "Export anyway (N blockers)" relabel (D11) |
| XML tabs Part/GameData/Assets, copy button | tabs + CopyDownloadBar (+ Download .xml) (§6.2) |
| Assets XML async build w/ stamp-compare (eager, per-change) | **lazy on tab focus** + stale chip + abortable rebuild via exportPreviewStore (§6.2) |
| Single-source preview==shipped-bytes property | untouched (same builders) |
| Export to mods folder (`getWritableModFolder` gesture prompt) | unchanged; busy state + progress segment (§6.1) |
| Download mod zip (zero-permission fallback) | unchanged; primary on unsupported browsers |
| FolderGrant 4-state row | export dialog row + File ▸ Mods Folder ▸ (§7) |
| forgetModFolder (UI-less outside nuke) | File ▸ Mods Folder ▸ Forget Folder… with confirm (§7) |
| Non-overwrite XML `-N` suffix, binaries overwrite, mod.toml rebuilt from disk | unchanged invariants (§6.1) |
| Export success/failure toasts | status flash + rich "Export complete" notification / danger notification (§6.1) |
| Kitten texture export mode + Content/Core path (buried in Settings) | Settings → Import & Export + read-only chip w/ deep-link in the export dialog (§9.4, §6.1) |
| `decimateViewMeshes` invisible at export | same treatment: Settings caption "affects export" + export-dialog chip |
| Partial-failure tolerance (drop bad SubPart, ship rest) | unchanged |
| Built-in part import incl. animation GLB decode / rest anchor | untouched (Add/catalog + animation areas) |
| PartPreviewViewport shared instance behavior | untouched |
| Wiki preview app + manifest + thumbs CI + assetBase | untouched, deliberately unlinked (D13) |
| Preview scrubber (rest-anchor honesty) | animation area (timeline transport) — noted, not owned here |
| Three hand-rolled copy/download implementations | one kit `CopyDownloadBar` (foundation §10.1) |
| Mobile controlled-dialog plumbing (MobileTopBar) | dialogStore commands + MenuSheet (§10) |

### Custom-asset persistence touchpoints (analysis/custom-assets.md §1.23–1.24 + storage)

| v1 feature | v2 home |
|---|---|
| assetDb blob tiers (`tex-src`/`tex-ktx2`/`import-glb`/`emissive-paint`/`mesh-glb`) | kept, project-prefixed keys (D7); archive `assets/<kind>/<id>` mirrors them (§4.1) |
| initCustomAssets strictly after hydrate; `$projectName`-keyed rehydrate | order kept; keyed on `$currentProjectId` (§1.5) |
| `ensureCurrentKtx2` re-encode (cache invalidation, not migration) | unchanged |
| Undo restores descriptors, never bytes (confirm-dialog contract) | unchanged (asset-manager area owns the dialogs; archives don't change the rule) |
| hasCustomAssets kitten-mesh exception (data-only, sharable) | preserved in the share-link gate (§5) |

### Misc (analysis/chains-misc.md — this area's slice)

| v1 feature | v2 home |
|---|---|
| Settings modal sections (FPS, connector, seats, highlight, kitten export) | Settings tabs per foundation §10.7; kitten export → Import & Export (§9.4) |
| Burger menu (Settings/About/Shortcuts/Reset tier mix) | Edit → Settings… ⌘, · Help → About/Shortcuts · Settings → Advanced → Reset (S12) |
| About dialog (first-run auto-open, share suppression, legal text) | kept (§9.3) |
| First-run About vs purge-toast race | resolved structurally (notification center) (§9.3) |
| `flexo_build_id` write + prod-only + dev/share skip | unchanged (§9.1) |
| Boot purge notice one-shot drain | notification entry (§1.7 step 2 + §1.2) |
