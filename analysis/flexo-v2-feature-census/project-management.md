# Area analysis: Project management, persistence & sharing

Repo: `/Users/asherwin/repos/meow-sci/flexo`. All paths below are repo-relative unless noted.
Verified against code (docs cross-checked; drift flagged where found).

---

## 1. Feature inventory

### 1.1 Current-project display + rename
- **What**: The toolbar shows the current project's name (truncated at 14ch). Inside the popover, a text input renames the project on blur or Enter.
- **UI path**: Top floating toolbar → leftmost "Project" button (FolderOpen icon + name) → popover → "Project Name" text field. Same button appears leftmost in the phone top bar (`src/ui/MobileTopBar.tsx:52`).
- **Files**: `src/ui/ProjectButton.tsx:37-125` (button + popover), `ProjectNameInput` at `ProjectButton.tsx:128-148`; store action `renameCurrentProject` at `src/state/projectStore.ts:415-422`.
- **Data model**: `$projectName` atom (`projectStore.ts:84`); rename re-keys localStorage — removes `flexo:project:<old>`, writes `flexo:project:<new>` + updates the `flexo:currentProject` pointer.
- **Interaction details**: the input is remounted via `key={name}` when the project changes to re-seed its draft (`ProjectButton.tsx:57`). Enter commits and blurs. Blank / unchanged name is a no-op. **Renaming to an existing project's name silently overwrites that project** — `renameCurrentProject` never checks `projectExists` (`projectStore.ts:415-422`).
- **Hotkeys**: none.

### 1.2 New project
- **What**: Starts a fresh empty project (empty document, empty history, cleared per-layer view state, reset camera), saved immediately and made current.
- **UI path**: Project popover → "New Project" button.
- **Files**: `ProjectButton.tsx:69-78`; `createProject` at `projectStore.ts:370-382`; name collision avoided via `uniqueProjectName()` (`projectStore.ts:335-341`) which yields "Untitled", "Untitled 2", ….
- **Data model**: full workspace reset via `newPart()` (editorStore), `$layerView.set({})`, `resetCamera()`.

### 1.3 Load / switch project (project list)
- **What**: A modal listing every saved project, most-recently-saved first, each row showing name, "(current)" marker, SubPart count, and saved-at timestamp, with Load and Delete buttons.
- **UI path**: Project popover → "Load Project..." → center modal "Load Project".
- **Files**: `LoadProjectDialog` at `ProjectButton.tsx:155-239`; `listProjects()` at `projectStore.ts:312-327`; `loadProject()` at `projectStore.ts:347-364`; `applyProjectSnapshot()` at `projectStore.ts:274-297`.
- **Data model / metadata that exists today** (`ProjectSummary`, `projectStore.ts:108-113`): `name`, `savedAt` (epoch ms), `partId`, `subPartCount` (= `part.placements.length`). **That is ALL the per-project metadata that exists.** There is no description, no thumbnail, no created-at, no last-opened, no counts for connectors/animations/layers/kittens (all derivable from the snapshot, which `listProjects` already fully parses). A rich v2 project manager needs to add these; description/thumbnail would be new snapshot fields (additive → no schema bump needed per the constitution, see §5).
- **Interaction details**: `listProjects()` is only called while the dialog is open (`ProjectButton.tsx:166`); a `setTick` state hack forces re-render after delete because localStorage isn't reactive (`ProjectButton.tsx:164`). Load applies the snapshot (suspending autosave), clamps active layer, clears selection, closes any open action-chain session, restores the saved camera. Loading the current project is disabled ("Loaded").

### 1.4 Delete project (with confirm)
- **What**: Permanently removes a saved project. Deleting the *current* project switches to the most-recent remaining one, or creates a fresh "Untitled" if none remain.
- **UI path**: Load Project modal → per-row trash button → nested `ConfirmDialog` ("Delete project “X”?").
- **Files**: `ProjectButton.tsx:209-236`; `deleteProject()` at `projectStore.ts:428-434`.
- **Notable**: deleting a project does **not** clean up that project's custom-asset binaries in the `flexo-assets` IndexedDB (blobs are only deleted by in-session asset removal in `customAssetStore.ts`) — orphaned blobs accumulate.

### 1.5 Autosave (no explicit Save)
- **What**: The whole workspace autosaves continuously; there is deliberately no Save button anywhere.
- **Files**: `startAutosave()` at `projectStore.ts:460-472`; debounce 300 ms (`projectStore.ts:446`); `saveCurrentProject()` at `projectStore.ts:300-309`.
- **Data model**: subscribes to `$part`, `$canUndo`, `$canRedo`, `$activeLayerId`, `$layerView`, `$projectName`, `$cameraState`, `$measurements`, `$containers`. A `suspended` flag prevents save storms during project load. localStorage write failures (quota / private mode) are caught and only `console.warn`ed (`projectStore.ts:305-308`) — **silent data-loss risk**.

### 1.6 Boot restore + boot purge notice
- **What**: On page load, before React renders, the current project (pointer key), else the most recent, else a fresh default is loaded synchronously — one paint, no flash. First, `sanitizeProjectStorage()` purges any `flexo:project:*` entry that is corrupt or stamped with a different `PROJECT_SCHEMA_VERSION` (currently **2**). Purged project names surface as a 10 s warning toast on first mount.
- **Files**: `hydrateProjectOnBoot()` at `projectStore.ts:480-493` called from `src/main.tsx:38`; purge at `projectStore.ts:241-266`; notice drain `consumeRemovedProjectsNotice()` at `projectStore.ts:226-230`, consumed by `src/app.tsx:42-53` (toast).
- **Notable**: kept same-version snapshots are default-filled by `normalizePart`/`normalizeSnapshot` (`projectStore.ts:178-216`) — live-constructor templates fill missing additive fields in the document AND every undo/redo history entry. `loadProject` has a try/catch backstop that deletes a project that still crashes on load (`projectStore.ts:353-360`).

### 1.7 Export project data (JSON)
- **What**: Serializes the project to compact data-only JSON (codec short keys, defaults dropped, floats rounded to 6 decimals) shown in a read-only textarea, with "Copy to clipboard" and "Download .json" (`<name>.flexo.json`).
- **UI path**: Project popover → "Project Data" section → "Export..." → fullscreen modal.
- **Files**: `ExportProjectDialog` at `src/ui/ProjectTransferDialogs.tsx:24-100`; `buildProjectExport` at `src/state/projectTransfer.ts:165-190`; codec `src/state/projectCodec.ts` (`PROJECT_EXPORT_VERSION = 8`, `projectCodec.ts:90`).
- **Gate**: disabled with a warning box when `hasCustomAssets(part)` is true (`projectTransfer.ts:155-157`) — any uploaded texture, primitive mesh, or imported glTF model (binary-backed in IndexedDB, can't ride in JSON). Kitten part-meshes are the one data-only `CustomMesh` kind that DOES export (`projectTransfer.ts:140-142`). Bundling binaries is a known "Phase 2 TODO".
- **What's carried** (`ProjectExportData`, `projectTransfer.ts:68-98`): editorTags, gameData, subPartGameData, layers, placements, connectors, colliders, ivaSeats (order load-bearing), lights, internalFlags, kittens, animations, kitten customMeshes, customMaterials, customReactions. NOT carried: undo history, camera, layer view state, measurements, containers, project name is metadata only.

### 1.8 Import project data (additive paste)
- **What**: Paste exported JSON into a textarea → additively merges into the current workspace as ONE undo step ("import project"). Success toast counts meshes/connectors/animations/layers; failure toast with a parse error.
- **UI path**: Project popover → "Project Data" → "Import..." → fullscreen modal → paste → "Import".
- **Files**: `ImportProjectDialog` at `ProjectTransferDialogs.tsx:102-166`; parse boundary `parseProjectImport`/`parseProjectObject` (`projectTransfer.ts:202-235`, exact-version match only); merge engine `mergeProjectImport` (`projectTransfer.ts:288-569`); store wrapper `importProjectData` at `src/state/editorStore.ts:954-973` (pushUndo, sets first new layer active).
- **Id-remapping semantics (must survive verbatim)**:
  - Placements get fresh `instanceId`s (`<base>_<n>` against the growing list); connectors fresh `_connectorN`; colliders `_colliderN`; seats `_seatN`; lights `_lightN`; kittens `kitten_N`; animations fresh `anim_<hash>` ids; kitten custom meshes fresh mesh + subPartId (`flexo_<kind>_<spec>_<rand>`).
  - Every cross-reference is rewritten through old→new maps: animation joint members + solar tracking, GameData couplings (decoupler/dockingPort/evaDoor connector refs), rocket/controller/gimbal SubPart refs, consumer feed points and `consumerFeedWiring`, connector `siblingIds` (danglers dropped), raw-XML `<ConnectorRef>`s inside unmodeled passthrough children (`remapRawConnectorRefs`).
  - Layer mapping: every source layer holding content — **including the source's Default** — becomes a NEW destination layer keeping its name (lazily created), so imports never merge into the user's Default; kittens/seats/lights pin to their built-in layers.
  - Part Id adoption only when destination still has the placeholder id; `internalFlags` only applied for templates the paste actually brings; light `scale` pinned to (1,1,1); customMaterials/customReactions deduped by id; smuggled non-kitten meshes in a hand-edited payload are dropped.

### 1.9 Share project (stateless share link)
- **What**: Generates a single URL encoding the entire project: compact JSON → Zstd level 19 → URL-safe Base64 → `?load=<payload>`. Copy button, Regenerate, character count, and a warning when > 8000 chars ("some browsers truncate URLs"). No server, no account.
- **UI path**: Project popover → "Project Data" → "Share Project..." → fullscreen modal → "Generate link".
- **Files**: `src/ui/ShareProjectDialog.tsx`; pipeline `src/state/projectShareLink.ts` (`SHARE_PARAM = 'load'`, `SHARE_ZSTD_LEVEL = 19`); same `hasCustomAssets` gate as export (`ShareProjectDialog.tsx:25,77-82`).

### 1.10 Open a share link
- **What**: Visiting `<origin><base>?load=<payload>` decodes the payload (async — Zstd WASM) and opens it as a **NEW saved project** (name made unique against local projects, e.g. "Rover 2"); the user's existing projects are untouched; camera/selection/history reset. The `?load=` param is stripped via `history.replaceState` so reload doesn't re-import. Success/danger toast.
- **Files**: boot flow `src/main.tsx:47-79`; `readShareParam`/`decodeSharePayload`/`clearShareParam` (`projectShareLink.ts:43-84`); `loadSharedProject` at `projectStore.ts:390-409`; faithful (no-remap) reconstruction `envelopeToPart` at `projectTransfer.ts:244-267` incl. `ensureBuiltInLayers`.
- **Interaction details**: a share-link launch **suppresses** both the build-id mismatch check (leaves `flexo_build_id` untouched so the prompt still fires on the next ordinary visit) and the first-use About auto-open (`main.tsx:49-58`, `suppressAboutFirstUse` in `src/state/aboutStore.ts`). The link lands a beat after first paint (WASM decompress) — hydrated project shows briefly.

### 1.11 Build-id mismatch dialog ("New version available")
- **What**: Prod-only. `checkBuildId()` compares embedded `VITE_BUILD_ID` against localStorage `flexo_build_id`; on mismatch a non-dismissable center modal offers "No thanks, I know what I'm doing" (dismiss) vs "Reset everything" → nested ConfirmDialog with a "Reset folder access grants" switch → `nukeAndReload`.
- **Files**: `src/buildCheck.ts`; `src/ui/BuildIdMismatchDialog.tsx` (mounted globally in `src/main.tsx:82-88` next to the toast region); `src/ui/nukeAndReload.ts`.
- **Notable**: fires on **every** deploy even when `PROJECT_SCHEMA_VERSION` didn't change — it predates the schema-version gate, which now handles真 incompatibility precisely; the dialog is scarier than reality. Skipped entirely in dev and on share-link launches.

### 1.12 Reset Everything (nuke)
- **What**: Clears localStorage + sessionStorage and deletes all IndexedDB databases **except** `flexo-fs` (the mod-folder File System Access grant — a machine capability, preserved by default; opt-in switch deletes it too), then reloads.
- **UI paths**: (a) Settings popover → "Reset Everything 🔥" → confirm w/ FS-grant switch (`src/ui/SettingsButton.tsx:211-261`); (b) Build-mismatch dialog → "Reset everything" (same confirm); (c) phone overflow menu → "Reset Everything 🔥" → confirm **without** the FS-grant switch (`MobileTopBar.tsx:96-133` — inconsistent with desktop).
- **Files**: `src/ui/nukeAndReload.ts` (`FS_GRANT_DBS = {'flexo-fs'}`; tolerates missing `indexedDB.databases()` on old Firefox).

### 1.13 What a project contains (the persisted document)
`ProjectSnapshot` (`projectStore.ts:87-105`): `version`, `name`, `part` (full `EditingPart`: partId, editorTags, layers, placements, connectors, colliders, ivaSeats, lights, internalFlags, kittens, customTextures, customMaterials, customMeshes, animations, customReactions, gameData, subPartGameData), `layerView` (per-layer visibility/lock), `activeLayerId`, `history` (full undo/redo stacks — **undo survives reload**; entries carry part + containers + measurements + description/detail, `editorStore.ts:453-537`), `savedAt`, `camera` (CameraState — **restored on load**), `measurements`, `containers`. NOT captured: selection, tool mode, snap, seat view, chain session.
> Doc drift: the module header comment (`projectStore.ts:32`) and `docs/projects.md:10-11,23` still claim the camera is excluded/ephemeral — the code captures & restores it (`projectStore.ts:99-100,160,288-293`).

---

## 2. UI surface map

| Surface | Kind | Mount / positioning | Notes |
|---|---|---|---|
| Project button + popover | toolbar-menu (react-aria Popover, portal) | leftmost in `EditorToolbar` (floating top bar, `app.tsx:78`) and `MobileTopBar` | `placement="bottom start"`, w-64; contains rename field + 5 action buttons |
| Load Project dialog | modal (`variant="center"`, portal overlay `z-50`) | rendered as sibling of the popover in `ProjectButton` | list max-h-60vh scroll; per-row Load/Delete |
| Delete-project ConfirmDialog | modal-in-modal | nested **inside** the Load Project `<Modal>` (`ProjectButton.tsx:225-236`) | stacked react-aria overlays, both `z-50` |
| Share Project dialog | modal (`variant="fullscreen"`, max-w-2xl) | sibling in `ProjectButton` | generate/copy/regenerate states; blocked-state warning box |
| Export Project Data dialog | modal (`fullscreen`, max-w-2xl) | sibling in `ProjectButton` | read-only mono textarea + copy/download |
| Import Project Data dialog | modal (`fullscreen`, max-w-2xl) | sibling in `ProjectButton` | paste textarea only — no file picker |
| Build-id mismatch dialog | modal (`center`, non-dismissable, role=alertdialog) | mounted globally in `main.tsx` root render | + nested ConfirmDialog w/ Switch |
| Reset-everything ConfirmDialogs | modal | Settings popover (desktop), overflow menu (phone) | duplicate implementations, phone lacks FS switch |
| Purge-notice toast | toast (GlobalToastRegion) | `app.tsx:42-53` | 10 s warning listing purged project names |
| Share-link result toasts | toast | `main.tsx:71-77` | success ("Opened shared project") / danger |

All modals are react-aria `ModalOverlay` — `fixed inset-0 z-50`, backdrop blur (`src/ui/kit/Modal.tsx:14-25`). No known clipping issues; the modal-in-modal stacking works but is architecturally awkward (see §4).

---

## 3. State & data flow

### Stores
- `$projectName` (atom, live) — `projectStore.ts:84`.
- The project itself is NOT a store: it's a hand-rolled localStorage layer bundling `$part` + `$layerView` + `$activeLayerId` + history + `$cameraState` + `$measurements` + `$containers` under a named key.
- `$buildMismatch` (atom) — `buildCheck.ts`.

### Persistence layers (complete key map)
| Layer | Keys | Contents |
|---|---|---|
| localStorage (project) | `flexo:project:<name>` (one per project), `flexo:currentProject` (`{name}` pointer) | schema-versioned `ProjectSnapshot` incl. full undo history |
| localStorage (app) | `flexo_build_id` | last-seen build id |
| localStorage (`@nanostores/persistent`, all survive project switches, none per-project) | `flexo:connectorSettings`, `flexo:ivaSeatSettings`, `flexo:lightSettings`, `flexo:selectionHighlight`, `flexo:kittenTextureExport`, `flexo:modelImport`, `flexo:simulateGlass`, `flexo:showFpsCounter`, `flexo:measure`, `flexo:nudgeAxis`, `flexo:nudgeStep`, `flexo:rotateStep`, `flexo:rotateAxisOffset`, `flexo:bulkScaleMode`, `flexo:aboutSeen`, `flexo:chainDefaults`, `flexo:lighting`, `flexo:inspectorVisible`, `flexo:inspectorWidth`, `flexo:inspectorFloatPos`, `flexo:animPreviewFloatPos`, `flexo:containers` (settings), `flexo:grids`, `flexo:hideInterior`, `flexo:layerView`, `flexo:colliderSettings` | preferences/UI state |
| IndexedDB `flexo-assets` | `tex-src:<id>`, `tex-ktx2:<id>`, `mesh-glb:<id>`, `import-glb:<id>`, `emissive-paint:<id>` | custom-asset binaries (`src/state/assetDb.ts`) — descriptors live in the project, bytes here |
| IndexedDB `flexo-fs` | dir handle | mod-folder FS grant (`modFolderStore.ts`), preserved by nuke by default |
| URL | `?load=<payload>` | stateless share link (consumed + stripped at boot) |

Quirk: `$layerView` is **dual-persisted** — it's a `persistentJSON` global key (`layerStore.ts:39`) AND a per-project snapshot field; project load overwrites the global key's value, so the global key just mirrors the last-loaded project.

### Undo/redo participation
- Project switch/create/load-shared **replaces** the history stacks wholesale (`importHistory`); it is not itself undoable.
- Additive import IS one undo step (`editorStore.ts:968`).
- History is persisted inside every snapshot (capped `MAX_UNDO`), so undo survives reload — a deliberate, user-visible behavior.

### Boot order (main.tsx, load-bearing)
`registerEditorAidStores` → `hydrateProjectOnBoot()` (sync, pre-render) → `initCustomAssets()` (MUST be after hydrate — `customAssetStore.ts:1859-1861`) → `initAnimationStore()` → share-param branch (suppress about/build-check) → `initModFolder()` (async) → render; async share decode lands post-paint.

---

## 4. Pain points

1. **Thin project metadata**: only name/savedAt/partId/subPartCount exist (`projectStore.ts:108-113`); no description, thumbnail, created-at, or richer counts. The requested project-manager dialog needs additive snapshot fields (safe: no version bump needed) and/or derivation at list time.
2. **`listProjects()` fully parses every snapshot** — including the embedded undo history (often the bulk of the JSON) — just to derive 4 summary fields (`projectStore.ts:312-327`), synchronously on dialog open. Fine at 5 projects, bad at 50 large ones.
3. **Name IS the identity**: storage is keyed by display name. Rename-to-existing silently clobbers another project (`projectStore.ts:415-422` — no `projectExists` check); odd characters live in keys; two tabs on the same project overwrite each other's autosaves with no conflict detection.
4. **Undo history inside the snapshot** multiplies snapshot size (each history entry deep-copies the whole part + containers + measurements) → localStorage quota pressure; a failed save is only a `console.warn` (`projectStore.ts:305-308`) — the user is never told autosave is failing.
5. **Modal-in-modal**: delete confirm nested inside the Load Project modal (`ProjectButton.tsx:225-236`); build-mismatch dialog nests its confirm too. Works, but v2's overlay system should make this a first-class pattern or flatten it.
6. **localStorage non-reactivity hacks**: `setTick` re-render hack after delete (`ProjectButton.tsx:163-164`); the project list can go stale if another tab writes.
7. **ProjectButton does too much**: one component owns the popover, rename, and open-state for four sibling dialogs (`ProjectButton.tsx:39-43`) — five booleans of dialog choreography in a toolbar button.
8. **Import is paste-only**: Export offers a `.json` download but Import has no file-picker/drag-drop — users must open the file elsewhere and paste (`ProjectTransferDialogs.tsx:150-156`).
9. **Custom-asset gate blocks export/share entirely** (`projectTransfer.ts:155-157`) with a wall-of-text warning; bundling binaries is an acknowledged Phase 2 TODO. Users with one uploaded texture lose all transfer features.
10. **Build-mismatch dialog is disproportionate**: triggers on every prod deploy (build id, not schema), offers only "nuke everything" or dismiss — while the schema-version purge already handles real incompatibility surgically. Duplicated reset flows in 3 places, and the phone one drops the FS-grant option (`MobileTopBar.tsx:127-133` vs `SettingsButton.tsx:251-261`).
11. **Deleted projects leak IndexedDB binaries** (`deleteProject` only touches localStorage; blob GC never runs across projects).
12. **No duplicate/save-as**, no project sort/search/multi-select in the list, no "open in new tab".
13. **Doc drift**: camera-exclusion claims in `projectStore.ts:32` header and `docs/projects.md` contradict the implemented camera capture/restore; `docs/state-persistence.md` shows key styles (`flexo_toolMode`) that don't match the real `flexo:` convention.
14. **Share-link fragility**: URL-length warning only at >8000 chars post-generation; no preflight estimate; decode lands after first paint so the local project flashes first.

---

## 5. Invariants & constraints (MUST survive)

1. **No-migration constitution** (`AGENTS.md:79-87`): persisted project data is preserved by **versioning + default-filling, never conversion**. No `migrateX`, no read-old-key fallbacks, ever.
2. **`PROJECT_SCHEMA_VERSION` (= 2, `projectStore.ts:80`)** is the localStorage compatibility contract: boot purge removes ONLY corrupt or version-mismatched snapshots; additive fields MUST NOT bump it (bump = purge switch, with a `// vN:` changelog line); kept snapshots pass through `normalizePart` (document AND every history entry).
3. **`PROJECT_EXPORT_VERSION` (= 8, `projectCodec.ts:90`)** — exact-match import; decode total/tolerant (missing → default); additive changes MUST NOT bump; a document-model break bumps BOTH constants; wire-only break bumps only this.
4. **Purges are user-visible** — boot toast via `consumeRemovedProjectsNotice()` (one-shot drain semantics).
5. **Storage convention**: `flexo:project:<name>` + `flexo:currentProject` pointer; `sanitizeProjectStorage` iterates localStorage high→low (removeItem reindexes).
6. **Synchronous pre-render hydration** (single paint), and `initCustomAssets()` strictly after it.
7. **Autosave semantics**: debounced (300 ms), suspended during snapshot application, covers exactly the stores listed in §3; no explicit Save action exists by design.
8. **Undo survives reload** (history in snapshot); selection/tool/snap/seat-view deliberately NOT persisted; camera IS persisted per-project.
9. **Additive-import contract** (§1.8 list): fresh collision-free ids for every entity kind; all cross-reference rewrites (incl. raw-XML ConnectorRefs and consumer-feed wiring); source layers — including Default — mirrored as new layers; seats appended preserving order (index 0 = IVA default seat; **`iv` array order is load-bearing** in the codec); Part-Id adoption only into placeholder; light scale pinned (1,1,1); internalFlags applied only for imported templates; materials/reactions deduped by id; non-kitten meshes on the wire are dropped.
10. **`hasCustomAssets` gate** on export AND share — an imported-mesh descriptor on the wire would create an invisible unfixable placement on the receiving browser (`projectTransfer.ts:146-157`).
11. **Share-link pipeline**: compact codec → Zstd 19 → base64url → `?load=`; opened as a NEW uniquely-named project (never clobbers); param stripped with replaceState; share-launch suppresses build-check AND first-use About without consuming either flag.
12. **`nukeAndReload` preserves `flexo-fs`** unless the user opts in; must tolerate browsers without `indexedDB.databases()`.
13. **Codec precision**: floats rounded to 6 decimals (`PRECISION`, `projectCodec.ts:115`) — below KSA tolerance; default-dropping (identity transforms, default tank material `Aluminum.2014(s)`, pinned layerIds) must round-trip losslessly.
14. **Numeric inputs** project-wide: `useNumberDraft` + `inputMode="url"` (no numeric fields in this area today — rename is a plain TextField — but any v2 metadata forms with numbers must comply).
15. `envelopeToPart` must keep NO-remap semantics + `ensureBuiltInLayers` backfill.

---

## 6. Hotkeys

**None registered by this area.** `src/ui/hotkeys/registry.ts` has no project shortcuts (no Ctrl+S — autosave; no Ctrl+O/N). Adjacent-but-owned-elsewhere: `mod+z` / `mod+y` / `mod+shift+z` (undo/redo — operate on the history this area persists), `mod+c`/`mod+v` (entity clipboard, unrelated to project import). v2 opportunity: project manager shortcut, Ctrl+S as reassurance no-op or "export".

## 7. Cross-area dependencies

- **editorStore** (core editing): `$part`, `newPart`, `exportHistory`/`importHistory` (`editorStore.ts:475-537`), `importProjectData` (`editorStore.ts:954`), `clearSelection`, `$activeLayerId`, `$canUndo/$canRedo`.
- **layerStore** `$layerView`; **viewStore** `$cameraState`/`resetCamera`/`setCameraRestore` (three-layer `EditorScene` consumes the restore signal); **measurementStore** / **containerStore** (snapshot fields + editor-aid undo registration in `main.tsx:22-35`); **chainStore** `closeChain()` on project load (`projectStore.ts:287`).
- **customAssetStore**: `hasCustomAssets` gate; `initCustomAssets` boot-order dependency; asset binaries in `assetDb` referenced by project descriptors (id-keyed contract).
- **ksa/types + ksa/partXmlParser + ksa/idRemap**: constructors used by `normalizePart` and the codec; `remapRawConnectorRefs`, `remapConsumerFeeds`, `remapConsumerFeedWiring` — game-contract logic reused by import merge.
- **aboutStore** (share-link suppresses first-use intro); **buildCheck** (skipped on share launch); **modFolderStore** (`flexo-fs` nuke exemption); **kit** (Modal/Popover/ConfirmDialog/toast); **ktx/zstd** WASM (share compression); **util/base64url**.
- Consumed BY: `main.tsx` boot; `app.tsx` purge toast; Toolbar/MobileTopBar mount points; every feature whose data lives in `EditingPart` is implicitly persisted/exported by this area — **any new document field must be triaged additive-vs-breaking against BOTH version constants** (`scope/`-adjacent obligation).

## 8. Open questions for v2

1. **Project identity**: keep name-as-key (rename = re-key, collisions clobber) vs introduce stable project ids with name as display metadata? Ids fix rename-clobber + enable descriptions/thumbnails cleanly, but change the storage convention (breaking → schema bump → purge, or a new key namespace alongside the old gate).
2. **Metadata for the rich project manager**: store description/thumbnail/counts IN the snapshot (additive fields, single source, but `listProjects` still parses everything) vs a separate lightweight index entry per project (fast lists, risk of drift from the snapshot)?
3. **Move project snapshots to IndexedDB?** Kills quota pressure from embedded history and enables blobs (thumbnails), but forfeits the synchronous pre-render hydration (single-paint boot) — needs an async boot design or a small sync pointer + skeleton.
4. **Keep undo history in the autosave snapshot** (undo survives reload; big writes every 300 ms) vs persist history separately/less often vs drop persistence of history entirely?
5. **Build-mismatch UX**: retire the every-deploy nuke prompt in favor of the schema-version purge + notice (it's now redundant), or keep as a status-bar notification in the new bottom bar?
6. **Custom-asset export gate**: v2 project manager could ship the planned Phase-2 binary bundling (zip/file export incl. IndexedDB blobs) — or keep JSON-only with the gate?
7. **Where do Share/Export/Import live** in a menubar world — File menu vs a project-manager overlay's per-project row actions (share/export ANY project, not just the current one — currently impossible)?
8. **Multi-tab story**: adopt a tab lock / BroadcastChannel sync for autosave clobbering, or document single-tab as a constraint?
9. **Orphaned-blob GC**: should project delete sweep `flexo-assets` for blobs referenced only by that project (requires cross-project reference counting), or is a manual "clean unused assets" tool in the asset manager enough?
