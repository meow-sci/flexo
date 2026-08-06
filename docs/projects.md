# Projects

The editor is **project-based**: the whole workspace is a project, autosaved to IndexedDB and
restored on the next page load. Switching projects swaps the entire workspace. Implemented
across three modules — `src/state/projectDb.ts` (the database), `src/state/projectIndexStore.ts`
(the reactive index, the current-project pointer, the multi-tab lock, autosave health) and
`src/state/projectStore.ts` (snapshots, autosave, boot, the lifecycle actions). The UI is the
menubar's **project chip** plus the **File** menu, which open the root-hosted dialogs in
`src/ui/projects/` (the Project Manager, Rename, Export Archive, Import and Share Link).

## Identity: a project is an id, not a name

A project is minted with a **`ProjectId`** — `p_` plus 12 base36 characters — and keeps it for
life. The display **name is pure metadata**: it is never a storage key, so renaming a project
to a name another project already uses cannot overwrite that project. `renameProject` instead
auto-suffixes ("Rover" → "Rover 2") and returns the name it actually applied.

## What a project captures

A `ProjectSnapshotV2` bundles everything needed to fully restore a workspace:

- `part` — the full `EditingPart` document: `partId`, `editorTags`, `layers`, `placements`,
  `connectors`, `colliders`, `ivaSeats`, `lights`, `kittens`, custom assets, animations,
  `gameData` (each entity's `layerId` included).
- `layerView` — per-layer visibility/lock/listed/opacity/collapsed (the `$layerView` view state
  from `layerStore`). The snapshot is now its **only** persistence: the old global
  `flexo:layerView` key is gone, so these flags are per project.
- `activeLayerId` — where new items land (clamped to a live layer on load).
- `camera` — the orbit camera pose (`$cameraState`), restored on load via `setCameraRestore`.
  (Older revisions of this doc claimed the camera was excluded; it is captured.)
- `measurements` and `containers` — the editor aids.
- `savedAt` — epoch millis.

The **undo/redo history** is captured too, but in its own record rather than inside the
snapshot, so undo still survives a reload while the frequent snapshot write stays small.

Selection, tool mode, snap and the seat view are intentionally **not** captured (fresh slate on
load). Custom-asset *binaries* are not in the snapshot either — only their descriptors are; the
bytes live in the separate `flexo-assets` database (see below).

## Storage — the `flexo-projects` database

`projectDb.ts` owns an IndexedDB database `flexo-projects` (version 1) with four object stores,
all keyed by the `ProjectId`, so one project's records are addressable without reading any of
the others:

| Store       | Value                                             | Written by         |
| ----------- | ------------------------------------------------- | ------------------ |
| `meta`      | `ProjectMeta` — the whole project list             | every snapshot save |
| `snapshots` | `ProjectSnapshotV2` — document + view state        | autosave, 300 ms   |
| `history`   | `{ undo, redo }` — the undo/redo stacks            | autosave, 1500 ms  |
| `thumbs`    | a `Blob` (`image/webp`, 384×216)                   | thumbnail capture  |

`ProjectMeta` is what the project list renders without ever opening a snapshot: `id`, `name`,
`description`, `partId`, `createdAt`, `savedAt`, `schemaVersion`, a `counts` breakdown
(SubParts, connectors, colliders, seats, lights, kittens, animations, layers, custom
textures/materials/meshes — derived by the pure `deriveCounts`), a `bytes`
`{ snapshot, history, assets }` triple computed by the writer at save time, and `hasThumb`.
`projectDb` is a dumb store: it stamps and derives nothing else, and imports no React or three.

`deleteProjectRecords(id)` removes all four records in **one** transaction, so a crash
mid-delete can never orphan a snapshot from its meta row.

The **only** project key left in localStorage is `flexo:currentProjectId`, a raw id string
naming the project this tab has open.

## The reactive index

`projectIndexStore` exposes `$projectIndex` (every `ProjectMeta`, sorted `savedAt` descending),
`$currentProjectId`, `$projectName`, `$projectLock`, `$autosaveHealth` and `$storageEstimate`.
Every mutation calls `reloadIndex()`, so the UI re-renders from a store instead of re-parsing
storage when a dialog opens. Thumbnails are read through `loadThumb(id)` behind a 24-entry LRU
so a scrolling list does not re-read the same blobs.

## Multi-tab: a write lock plus a broadcast

Two tabs on one project used to overwrite each other silently. Now:

- **Web Locks** — opening a project takes an exclusive lock named `flexo:project:<id>`. A tab
  that cannot get it goes `readonly`: autosave is suspended and a sticky warning notification
  offers **Take over**, which steals the lock. The tab that *loses* a lock this way gets its own
  sticky warning with a **Reload** action. Where the Web Locks API is missing the lock state is
  `unsupported` — the tab writes anyway (v1 behavior) after one notification explaining the
  single-tab constraint.
- **BroadcastChannel `flexo:projects`** — any tab that changes a project row posts
  `index-changed`, and every other tab reloads its index. So a project created, renamed or
  deleted in one tab appears correctly in another without a refresh.

## Autosave

`startAutosave()` subscribes to every store that contributes to a project — `$part`, `$canUndo`,
`$canRedo`, `$activeLayerId`, `$layerView`, `$projectName`, `$cameraState`, `$measurements`,
`$containers` — and runs **two** debounced writers:

| Writer               | Debounce | Writes                    |
| -------------------- | -------- | ------------------------- |
| snapshot + meta row  | 300 ms   | `snapshots` + `meta`      |
| undo/redo history    | 1500 ms  | `history`                 |

`$part` plus the can-undo/redo flags together cover every document and history change (every
`pushUndo`/`undo`/`redo` touches them); the debounce collapses a gizmo drag's many per-frame
`$part` writes into one save. History gets the slower timer because it is the bulk of the bytes
and a reload inside its window loses at most the last undo *entries*, never document state. A
`suspended` flag keeps the cascade of store writes during a *load* from triggering a redundant
save. `flushAutosave()` cancels both timers and writes everything now (project switch, or the
**Retry now** notification action). There is no Save button anywhere, by design.

**A failed write is loud.** v1 stopped at a `console.warn`, so editing quietly stopped being
saved. Now `$autosaveHealth` flips to `failing` and flexo raises the loudest feedback it has: a
danger status message plus **one** sticky danger notification (deduped, so a failing quota
cannot spam the ring) carrying the storage estimate, the error text, and the actions **Open
Projects…** and **Retry now**. A later successful write flips health back and posts
"Autosave recovered ✓".

## Thumbnails

Only the 3D scene can draw the document, so `projectStore` publishes an intent —
`$thumbnailRequest`, via `requestThumbnail()` — and `EditorScene` answers it. The scene renders
**one** offscreen 384×216 frame into a `WebGLRenderTarget`: a frame-all of the drawn entities
(hidden layers excluded) viewed from azimuth 45° / elevation 30°, with every editor aid (grids,
gizmo, measurement and container layers, chain preview) hidden for the draw. The result is
encoded as WebP at quality 0.8 and handed back to `storeThumbnail(id, blob)`, which writes the
`thumbs` record and flags `hasThumb`. An empty document captures nothing.

The visible canvas is untouched and the on-demand render loop is **not** flipped continuous:
capture happens only on tab-hide while dirty, at most once a minute while dirty, and explicitly
after create and before a project switch.

## Custom-asset binaries are namespaced per project

Asset blobs live in the separate `flexo-assets` database under **project-namespaced** keys:
`pa:<projectId>:<kind>:<assetId>`. That prefix is what makes the three lifecycle operations one
range query each — `listProjectBlobs`, `copyProjectAssets` (Duplicate) and
`deleteProjectAssets` (Delete, which finally reclaims the bytes v1 leaked). `initCustomAssets`
re-hydrates on `$currentProjectId` rather than the project name, so two projects sharing a
display name can no longer skip the re-hydrate. See
[custom-assets.md](./custom-assets.md).

## Boot restore (no double refresh)

`main.tsx` runs boot as one async IIFE, because IndexedDB is async: `purgeV1Storage()` →
`await hydrateProjectOnBoot()` → `initCustomAssets()` → `initAnimationStore()` → the
modifier/hotkey/snap wiring → the share-link branch → `checkBuildId()` → `initModFolder()` →
`createRoot().render()`. Nothing paints until hydration resolves, which is what preserves v1's
single-paint property — the step order is otherwise unchanged.

`hydrateProjectOnBoot()` purges incompatible projects (below), then walks a **fallback ladder**
to decide what to open:

1. `?project=<id>` in the URL (stripped from the address bar like `?load=`),
2. the `flexo:currentProjectId` pointer,
3. the newest `savedAt` row,
4. a fresh "Untitled".

It then takes the project's write lock and starts autosave. If IndexedDB cannot be opened at all
(private mode, blocked storage), editing still works: flexo posts a danger notification saying
nothing will be saved this session, marks autosave failing, and boots an empty part.

### The three boot purges

All three are surfaced through the **notification center** — never a toast, so the names survive
being looked away from.

1. **v1 localStorage** (`purgeV1Storage`, run before hydration). Every localStorage
   `flexo:project:*` entry and the `flexo:currentProject` pointer are deleted, and the project
   names are listed in one warning notification. The names are read **from the keys**, with zero
   parsing — a corrupt entry is reported exactly as well as an intact one, and no v1 value is
   ever interpreted. v1 project data is deliberately not carried over; there is no adoption path
   and none may be added. The same pass silently removes five other abandoned v1 keys, which
   carry no user work and so raise no notice: the four shell-layout keys the single
   `flexo:layout` replaced (`flexo:inspectorVisible`, `flexo:inspectorWidth`,
   `flexo:inspectorFloatPos`, `flexo:animPreviewFloatPos`) and `flexo:layerView`, the former
   global per-layer view state that now rides only the project snapshot. Removal, never
   migration — their values are never read.
2. **Incompatible projects** (`purgeIncompatibleProjects`, inside hydration). A `meta` row whose
   `schemaVersion !== PROJECT_SCHEMA_VERSION`, or whose snapshot is missing, unreadable, or not
   a document with layers, is deleted along with its snapshot, history, thumbnail **and its
   asset blobs**, and named in one warning notification.
3. **Un-namespaced asset blobs** (`purgeUnprefixedAssetKeys`, run once by `initCustomAssets`).
   Any `flexo-assets` key without a `pa:` prefix belonged to a v1 project that no longer exists,
   so it is deleted and the count reported in a warning notification.

## Schema version & preservation

Saved projects are the user's own work, so they survive app updates whenever compatibility
allows. `PROJECT_SCHEMA_VERSION` (currently **3**, in `projectStore.ts`) is stamped into every
project's meta row and is the entire compatibility contract: a stored project is kept iff its
snapshot loads **and** its stamped `schemaVersion` equals this number. The constant did **not**
change in the storage rework — the *document* model is untouched; what moved is the container
(name-keyed localStorage entries → id-keyed IndexedDB records), and v1 data is removed by the
key purge rather than by a version check. It moved to **3** for per-channel keyframe easing:
`AnimationKeyframe.easings` values changed shape from a single `EasingConfig` to a
`JointSegmentEasing` (`{position?, rotation?, scale?}`), and a v2 snapshot's single whole-pose
easing has no channel keys — it would default-fill to all-linear and silently load the WRONG
motion, which `normalizePart` cannot reach inside keyframes to prevent.

A kept snapshot is run through `normalizePart`, a template-driven normalizer that fills fields
the snapshot is **missing** from the live constructors, at four sites: the `EditingPart` top
level (`createEmptyPart()`), `gameData` (`createEmptyGameData()`), each `subPartGameData[]`
entry (`createSubPartGameData`), and each `customMeshes[].emissive` (`createGlow()`) — for the
document *and* every undo/redo history entry. Values already present are never overwritten.
This is default-filling of additive fields, **not** migration; the templates come from the live
constructors, so there is no per-field upkeep. `loadProjectRecords`' try/catch discard stays as
the backstop for anything deeper than the normalizer reaches — a project that would crash boot
is removed (records and blobs) rather than allowed to.

So: an **additive** change (a new field with a safe constructor default) needs no version bump —
old projects keep loading, and if the field sits deeper than an existing normalizer site, extend
the normalizer. A **breaking** change (removed/renamed/retyped field, changed meaning/units) MUST
bump `PROJECT_SCHEMA_VERSION`, which *is* the purge switch. The full rule lives in the project
constitution in [AGENTS.md](../AGENTS.md).

## Actions (projectStore exports)

`hydrateProjectOnBoot()`, `purgeV1Storage()`, `startAutosave()`, `flushAutosave()`,
`createProject(name?)`, `openProject(id)`, `duplicateProject(id)`, `deleteProject(id)`,
`loadSharedProject(env)`, `loadProjectAsNew(env, opts)`, `requestThumbnail()` /
`storeThumbnail(id, blob)` / the `$thumbnailRequest` atom, `PROJECT_SCHEMA_VERSION`, plus
re-exports of `$projectName` and
`DEFAULT_PROJECT_NAME`. Names and metadata are `projectIndexStore`'s side:
`uniqueProjectName(base?, exceptId?)`, `renameProject(id, name)`, `setProjectDescription`,
`loadThumb`, `takeOverLock`. **None of these is an undo step** — project lifecycle is storage,
not a document mutation.

- **Create** mints an id, uniquifies the name, clears document/history/layer view/aids, resets
  the camera, writes every record immediately, takes the lock and requests a thumbnail.
- **Open** thumbnails and flushes the outgoing project first, then replaces the undo stacks
  wholesale with the incoming project's.
- **Duplicate** copies the snapshot, the thumbnail and the asset blobs under a new id (asset ids
  are unchanged — the namespace makes them collision-free, so no descriptor is rewritten).
  History is **not** copied, and the copy is not switched to.
- **Delete** removes the four records and the asset blobs. Deleting the current project switches
  to the most-recent remaining one, or starts a fresh default when none are left.
- **Load shared** (a `?load=` share link) opens the decoded project as a **new** saved project
  with a fresh id; the user's existing projects are untouched.

## The `.flexo.tar.gz` project archive

An archive is how a whole project leaves the browser — document **and** binaries. It replaced
v1's "Export Project Data" JSON snippet, which could not carry a single texture byte and
disabled itself whenever a project had one.

`src/state/tarArchive.ts` is the container primitive: a pure, hand-rolled USTAR packer/unpacker
plus native gzip/gunzip helpers (`CompressionStream`), with no new dependency. Entry names are
capped at USTAR's 100-byte `name` field and a longer one throws rather than truncating; only
regular files are written or read. `src/state/projectArchive.ts` builds and reads the archive on
top of it.

### Layout

```
<Name>.flexo.tar.gz            gzip over a USTAR tar
├── manifest.json              MUST be the first entry
├── project.json               the wire envelope (projectCodec — the SAME one every other
│                              transfer path produces; there is no archive-only dialect)
├── thumbnail.webp             optional
└── assets/<kind>/<assetId>    one entry per blob; kinds are assetDb's own
                               (tex-src · tex-ktx2 · mesh-glb · import-glb · emissive-paint)
```

```jsonc
// manifest.json
{
  "format": "flexo-project-archive",
  "archiveVersion": 1,        // container LAYOUT version (exact-match)
  "exportVersion": 11,        // PROJECT_EXPORT_VERSION of project.json (exact-match)
  "name": "Rover-7", "description": "…",
  "savedAt": 1754300000000, "appBuildId": "abc123",
  "counts": { …ProjectMeta.counts… },
  "assets": [
    { "kind": "tex-src", "id": "t_ab12", "path": "assets/tex-src/t_ab12",
      "bytes": 152330, "mime": "image/png", "sha256": "…" }
  ]
}
```

### Versioning — two numbers, both exact-match

Import requires an exact `archiveVersion` **and** an exact `exportVersion`; flexo never converts
formats (the no-migration rule in [AGENTS.md](../AGENTS.md)). A mismatch is a hard error naming
both numbers. The two are independent: an additive manifest field bumps **neither**, a container
layout break bumps `ARCHIVE_VERSION`, and the wire rules for `exportVersion` stay the codec's own
contract. `PROJECT_EXPORT_VERSION` did **not** move for archives — see the codec section below.

### Export (`buildProjectArchive`)

Reads the **stored** snapshot and the project's namespaced blobs, never live editor state, which
is what lets the Project Manager export any row without opening it (the current project flushes
its autosave first). It hashes every blob (SHA-256), writes the manifest first, and reports
`collect → pack → compress` progress; an `AbortSignal` cancels it with no partial file. A
project with no binaries exports fine — an empty `assets/` and a tiny archive.

### Import (`parseProjectArchive` + `importArchive`)

Parsing is total at the container level and exact at the two version gates, and every failure is
a message the dialog renders verbatim ("Not a flexo archive.", the version copy, "Archive is
incomplete (missing …). Nothing was imported."). Nothing touches the workspace until it succeeds.

Then one of two destinations:

- **Merge into the current project** (the default) — additive, with fresh collision-free ids and
  every cross-reference rewritten, as **ONE undo step**. Binary assets are adopted into this
  project's namespace under fresh ids before the document mutation, so undoing removes
  descriptors and never bytes (the unchanged asset contract).
- **Open as new project** — a faithful reconstruction (no remapping) as a fresh saved project,
  switched to, with the blobs adopted verbatim under the new namespace. Not an undo step: it
  arrives as a project, not as an edit.

**Texture dedup** (merge only): an incoming texture is compared against destination textures of
the same channel with the same source byte length, by SHA-256. A match reuses the existing
texture id and copies no blob; the hash learned on the way is cached on the descriptor
(`CustomTexture.sha256`, an additive optional field — no version moves for it). **Meshes and
imports never dedup** — identity is load-bearing, two identical boxes are two SubParts — and an
import BATCH gets one fresh `importId` shared by every mesh that came from that file, so its one
copy of geometry stays one copy. The `meshName` inside that GLB is never rewritten: it is the
key the geometry resolves by.

### What may travel, and why

The wire carries descriptors; `assetDb` carries bytes. So whether a descriptor may ride is the
**container's** call, not the payload's:

| Descriptor | Needs from the container |
| --- | --- |
| kitten submesh | nothing — it re-bakes from the shipped kitten gltf |
| primitive mesh | nothing — it is rebuilt from its own `PrimitiveSpec` (no `mesh-glb` blob is ever written; the tier is reserved) |
| imported glTF mesh | its `import-glb` batch blob — the only copy in existence |
| uploaded texture | its `tex-src` pixels (`tex-ktx2` is a re-encodable cache) |

`buildProjectExport(parts, name, {includeBinaryBacked: true})` is the archive's opt-in; without
it the wire stays exactly what v1 produced (kitten meshes only, no textures). On the way back
in, `parseProjectImport(text, {binaryAssets})` keeps precisely the descriptors the table backs
and **drops the rest along with everything that referenced them** — the placements of a dropped
mesh, and the material channels and face textures of a dropped texture. A pasted JSON snippet or
a share link passes `binaryAssets: null`, which is v1's drop-smuggled-meshes rule.

## The compact project codec

`src/state/projectCodec.ts` is the wire format for the project export/import JSON and the share
link. It encodes `EditingPart` into short keys (`p` placements, `c` connectors, `cl` colliders,
`iv` IVA seats, `ifl` the per-SubPart-template `<Internal>` flags, `k` kittens, `a` animations,
`m` custom meshes, …), omitting anything empty or at its default. (The stored snapshot is plain
structured-cloneable data in IndexedDB and does not go through the codec.)

`PROJECT_EXPORT_VERSION` is currently **11** (`<Light>` layer id: `CLight.ly` — optional,
absent meaning the old pinned Lights layer — became a **required** `CLight.l` naming ANY
ordinary layer, now that lights are ordinary layer citizens like connectors and colliders; a
v9 payload's lights would decode onto a layer id that no longer carries that meaning). The
bump before that was v9, per-channel keyframe easing: `CKeyframe.es` values changed shape from
one `CEasing` to `{p?, r?, s?}`, plus the additive `CAnimation.cs` CubicSpline-approximated
import flag. Import accepts **exactly** the current version — older payloads are
rejected, never converted — and that mechanic is unchanged. What changed is the **bump
policy**: an additive, backwards-compatible change **MUST NOT** bump it, because decode is
total and tolerant (missing fields fall back to defaults, so an older same-version payload
still imports cleanly). Only a **breaking** change bumps it, and adds its own `// vN: what
broke` line to the constant's changelog comment. Historically the version was bumped for
additive work too (v3 custom materials, v6 colliders); that stops — the archive work added
`tex` (custom-texture descriptors), `prm` (a primitive's spec) and `ft` (per-face textures)
**without** bumping, because an older v8 payload simply lacks them and their absence decodes to
exactly what that payload meant. A document-model break
bumps this **and** `PROJECT_SCHEMA_VERSION`; a wire-format-only change (codec key renames)
bumps only this one. See the constitution in [AGENTS.md](../AGENTS.md).

Two encoding rules worth knowing, both about seats: the **array order of `iv` is
load-bearing** (it is KSA's in-game seat cycle order — see [iva-seats.md](./iva-seats.md)), and
a seat's `layerId` is restored from `IVA_SEAT_LAYER_ID` on decode rather than serialized, with
its unused `scale` omitted by the shared transform encoder. `ifl` is decoded defensively —
only `string → boolean` entries survive, bad data is dropped.

## Share links (asset-less; the one surviving `hasCustomAssets` gate)

`src/state/projectShareLink.ts` is unchanged and byte-compatible with v1: compact JSON → Zstd 19
→ URL-safe Base64 → `?load=<payload>`, decoded at boot into a **new** project with a fresh id
(the param is stripped with `replaceState`, first-run About is suppressed but not consumed, and
the build check is skipped entirely so the stored `flexo_build_id` stays untouched).

The archive removed the `hasCustomAssets` export gate; **share links keep it**, because that gate
was never policy — a URL cannot carry a texture's bytes. The item is never greyed out: with
binary assets the dialog explains what is in the way and offers **Export archive instead…**,
which opens the archive dialog already scoped to that project. Kitten meshes still share fine.
A link over 8000 characters gets the truncation warning.

## UI — the project chip, the File menu, and `src/ui/projects/`

The current project name lives in the menubar's right cluster as the **project chip**
(`src/ui/shell/MenuBar.tsx`; the phone shows it in `PhoneTopBar`). Tapping it runs the
`file.projects` command — the same thing **File ▸ Projects…**, `⌘O` and the ⌘K palette run.

Every dialog is mounted once by `src/ui/shell/DialogRoot.tsx` and named by `dialogStore`'s
`$openDialog` id; none is owned by a trigger button:

- **`'projects'`** — the **Project Manager** (L cover, `⌘O`, `ProjectManagerDialog.tsx`).
  Grid or list of every project with thumbnail, description, counts, created/saved times and
  size; fuzzy search over name + description + part id; sort by last saved / created / name /
  size (both persisted in `flexo:projectManagerView`). The current project is pinned as a wide
  card with a `CURRENT` chip and inline rename + description editing. Row actions: Open,
  Duplicate, Save As… (current only), Export archive…, Share…, Open in new tab, Delete. Deletion
  confirms with an **inline strip on the row** — never a nested dialog — stating that undo cannot
  restore it and how many bytes of assets go with it. A row locked by another tab shows the
  `● open in another tab` badge; a failing autosave pins a red banner above the grid; the footer
  states "All changes autosave — there is no Save button", the storage estimate and the one-time
  **Keep storage persistent** button.
- **`'rename-project'`** — one field, auto-suffixing (menu/palette parity with the inline rename).
- **`'export-archive'`** — Summary → Progress on one `DialogViewStack`; takes a `projectId` param
  so ANY row exports. Delivery is `showSaveFilePicker` where available, else a download anchor.
- **`'import-project'`** — Pick (drop / choose / paste) → Review (destination radio) → Importing.
- **`'share-link'`** — the link generator, or the explain state above.

**File ▸ New Project** creates and switches. Autosave means there is no Save action and no Save
item in the menu (⌘S exists only so the reflex gets an "Autosaved ✓" answer). Four commands are
notification-action targets that appear in no menu: `project.retryAutosave`, `project.takeOver`,
`app.reload` and `app.resetEverything`.

## Build mismatch and Reset Everything

A new deployment is no longer a boot modal. `checkBuildId()` is unchanged (prod-only, skipped on
share launches, writes the current id) and `initBuildMismatchNotice()` turns `$buildMismatch`
into ONE sticky notification — *"flexo was updated"* — with **[Reload]** and
**[Reset everything…]**. Nothing blocks boot; the schema-version purge remains the real guard and
keeps its own boot notice.

**Reset Everything** has exactly one home: Settings ▸ Advanced, as a pushed confirm view (never a
modal over a modal) listing the consequences and carrying the **Reset folder access grants**
switch — default off, present on every platform including phones. `nukeAndReload` is unchanged:
localStorage + sessionStorage cleared, every IndexedDB deleted except `flexo-fs` unless opted in,
reload in `finally`.

## Tests

`src/state/projectStore.test.ts` covers the save→load round-trip (document, active layer, layer
view, and history), that history is stored in its own record and capped at `MAX_UNDO`, the two
debounce timings, stale-active-layer clamping, index ordering with derived counts, create,
auto-suffixing rename, delete-current fallback, blob sweeping on delete, duplicate (snapshot +
blobs, no history, no switch), `openProject` replacing the undo stacks, the v1 key purge and the
schema/corruption purge with their notices, the boot fallback ladder, `normalizePart`
default-filling (document and history entries, never overwriting a present value), and the
autosave-failure/recovery health flip. `src/state/projectDb.test.ts` covers `newProjectId` and
`deriveCounts`; `src/state/tarArchive.test.ts` round-trips the USTAR + gzip codec.

`src/state/projectArchive.test.ts` round-trips a real archive over in-memory IndexedDB mocks:
the envelope, every asset byte and its hash, the manifest being the first entry, an asset-less
project, the thumbnail, both exact-version errors and the missing-asset error verbatim, an abort
mid-collect, and `planAssetAdoption`'s dedup (byte-identical texture reuses the incumbent; meshes
never dedup; one fresh `importId` per batch). `src/state/projectTransfer.test.ts` covers the
container split — what travels with and without a backing table, the fresh ids and rewritten
references on adoption, the dedup path and a double merge — and
`src/state/editorStore.test.ts` asserts an archive merge is exactly ONE undo step.
