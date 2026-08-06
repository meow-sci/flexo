# State Persistence

Editor state that represents user preferences, UI settings, and other data that should survive page refresh uses **localStorage persistence** via `@nanostores/persistent`.

## Pattern

**`persistentJSON` is the only persistence helper this codebase uses.** It takes a key and a
default, JSON-encodes both ways, and otherwise behaves as an ordinary nanostores atom
(`subscribe()`, `useStore()`, `computed`, …). There is no `persistentAtom` / `persistentMap`
call anywhere in `src/`, and new code should not introduce one — one helper keeps the encode
rules and the key convention in one shape.

```ts
import { persistentJSON } from '@nanostores/persistent';

export const $snapEnabled = persistentJSON<boolean>('flexo:snapEnabled', false);

$snapEnabled.set(true);
$snapEnabled.subscribe((on) => {
  /* … */
});
```

**A stored value is replayed verbatim** — there is no shallow merge against the default. So an
object-valued key whose shape changed must either sanitize on read (`layoutStore`'s
`sanitizeLayout` validates each slice independently and falls back to that slice's default) or
be treated as a new key. Never write a migration: per the project constitution
([AGENTS.md](../AGENTS.md)) a persisted schema change is purged, never converted.

## What to Persist

Persist any state that represents **user-facing settings or UI state** that end-users would expect to survive a refresh:

- **UI panel visibility** — inspector open/closed, sidebar state, etc.
- **Tool settings** — active tool mode (translate/rotate/scale), snap settings, gizmo snap values
- **View preferences** — camera position, zoom level, grid visibility
- **Recent data** — last opened part, recent SubParts, filters/search state
- **Display options** — theme, layout preferences, debug flags

### Shell layout

The v2 docked shell (left sidebar / viewport / right sidebar, plus the Animation
timeline dock) persists as **one** key, `flexo:layout`, written via
`@nanostores/persistent`'s `persistentJSON` (`src/state/layoutStore.ts`): left/right
sidebar `{width, collapsed}`, the timeline dock `{height, collapsed, hidden}`, and
floating-window position/z-order/visibility (`float` / `floatOrder` / `floatHidden`,
which back the two windows v2 ships — the Tool bar and the Chain window). A defensive
sanitize-on-boot read (`sanitizeLayout`) validates each slice independently and falls
back to that slice's default on a shape mismatch, rather than discarding the whole
value.

The four v1 shell keys it replaced — `flexo:inspectorVisible`, `flexo:inspectorWidth`,
`flexo:inspectorFloatPos` and `flexo:animPreviewFloatPos` — are **retired and
intentionally NOT migrated**: per the project constitution ([AGENTS.md](../AGENTS.md)) a
persisted schema change is purged, never converted. `purgeV1Storage()` deletes all four at
boot so they cannot linger as clutter (see the removed-key list below).

### Command palette recents

`flexo:paletteRecents` (`$paletteRecents` in `src/state/commandStore.ts`, `persistentJSON`)
is the ⌘K palette's **Recent** section: the last 8 command ids that were run *from the
palette*, newest first, deduped. It is the command registry's ONLY persisted state —
registrations, `$paletteOpen` and every dialog/menu open state are ephemeral.

Menu and hotkey invocations deliberately do not record: `runCommand` never touches the
list, only the palette's own activation path calls `recordRecent`. A stored id that no
longer resolves (a dynamic `layer:activate:<layerId>` for a deleted layer) is not pruned on
write — it is simply skipped when the palette renders, which is the "no migration" rule
applied to a preference key.

### The Help rebind notice

`flexo:rebindNoticeSeen` (module-private in `src/ui/hotkeys/HelpDialog.tsx`,
`persistentJSON<number>`, default `0`) stores **when the user first opened the v2 Help**, as
epoch ms. Within 30 days of that stamp the "two keys moved" box (`F`, `⌘K`) renders
prominently at the top of the dialog; after that it folds into a collapsed disclosure. It is
dialog-local preference state, so it lives with the dialog rather than in `src/state/` —
nothing else reads it. A fresh key: no migration concern.

### Feedback: status messages and notifications (persisted: nothing)

The toast system is gone. Transient feedback is ephemeral `statusStore` state — one message
slot, one tool-status model, the progress aggregate, the FPS report and the advisory list —
all in memory and none of it persisted; a message simply expires. The notification center
(`notificationStore`) is a **session-only ring buffer of 100**: notifications are news, not
data, so a reload starts empty and anything that must survive a reload is document or asset
state living elsewhere. Modifier-hint state (`modifierStore`) is ephemeral for the same
reason.

The mode, the armed tool and every hotkey scope are ephemeral by design — a reload always
boots into Build, because a mode is a task posture, not a preference. The state the status
bar *edits* — bounds mode (`flexo:measure`), the nudge/rotate preferences,
`flexo:showFpsCounter`, the active layer — stays owned by the stores that already persist
it, so the bar has no storage of its own.

## What NOT to Persist

Do **not** persist:

- **Transient working state** — currently-selected placement, camera position (users expect a fresh slate / reset camera)
- **Large computed state** — expensive to serialize/deserialize
- **Data that comes from the server** — catalog, SubPart templates (load from source of truth)

## Implementation Notes

- **localStorage key naming**: `flexo:` + camelCase — e.g. `flexo:showFpsCounter`,
  `flexo:projectManagerView`. (Older docs showed `flexo_toolMode`-style underscores; the only
  underscore key left in the tree is `flexo_build_id`, which predates the convention.)
- **Defaults**: The second argument to `persistentAtom` is the default when localStorage is empty (first visit)
- **Encoding**: Use `JSON.stringify`/`JSON.parse` for most data; for complex types, add a custom encode/decode
- **Subscriptions**: Persist atoms work with all nanostores APIs (`subscribe()`, `useStore()`, computed, etc.)
- **Testing**: Clear localStorage in test setup if needed (`localStorage.clear()`)

## The complete key inventory

Every `persistentJSON` key in the tree, in one table. **36 keys**, all localStorage, all
`flexo:` + camelCase. Adding a key means adding a row here.

### Shell & layout

| Key | Store file | Holds | Default |
| --- | --- | --- | --- |
| `flexo:layout` | `state/layoutStore.ts` | `$layout` — sidebars, timeline dock, floating-window positions/order/hidden | `{left:{width:300,collapsed:false}, right:{width:340,collapsed:false}, timeline:{height:220,collapsed:false,hidden:false}, float:{}, floatOrder:[], floatHidden:[]}` |
| `flexo:paletteRecents` | `state/commandStore.ts` | `$paletteRecents` — last 8 command ids run *from* the ⌘K palette | `[]` |
| `flexo:rebindNoticeSeen` | `ui/hotkeys/HelpDialog.tsx` | module-private; epoch ms Help was first opened | `0` |
| `flexo:confirmThreshold` | `state/settingsStore.ts` | `$confirmThreshold` — the one confirm-before-destroy entity count | `5` |
| `flexo:aboutSeen` | `state/aboutStore.ts` | `$aboutSeen` — first-run About was shown | `false` |
| `flexo:projectManagerView` | `state/projectManagerStore.ts` | `$projectManagerView` — Project Manager view + sort | `{view:'grid', sort:'saved'}` |
| `flexo:assetManager` | `state/assetManagerStore.ts` | `$assetManagerPrefs` — Asset Manager view / sort / category | `{view:'grid', sort:'name', category:'all'}` |

### Gizmo, snap and transform steps

| Key | Store file | Holds | Default |
| --- | --- | --- | --- |
| `flexo:snapEnabled` | `state/snapStore.ts` | `$snapEnabled` — the magnet | `false` |
| `flexo:snapTranslateStep` | `state/snapStore.ts` | `$snapTranslateStep` (m) | `0.1` |
| `flexo:snapRotateStep` | `state/snapStore.ts` | `$snapRotateStep` (°) | `15` |
| `flexo:gizmoSpace` | `state/editorStore.ts` | `$gizmoSpace` — **W**orld or **L**ocal handle axes | `'world'` |
| `flexo:nudgeAxis` | `state/editorStore.ts` | `$nudgeAxis` | `'y'` |
| `flexo:nudgeStep` | `state/editorStore.ts` | `$nudgeStep` (m) | `0.1` |
| `flexo:rotateStep` | `state/editorStore.ts` | `$rotateStep` (°) | `45` |
| `flexo:rotateAxisOffset` | `state/editorStore.ts` | `$rotateAxisOffset` — the `R`-key cycle, 0/1/2 | `0` |
| `flexo:bulkScaleMode` | `state/editorStore.ts` | `$bulkScaleMode` — multi-select scale behavior | `'smart'` |
| `flexo:chainDefaults` | `state/chainStore.ts` | module-private; last-used parameters per chain op kind (typed `unknown`, read defensively) | `{}` |

> **Snap is three keys, not one.** The v2 design corpus (`plans/flexo_v2/design/foundation.md`
> §13) describes `snapStore` as a single `flexo:snap` key. The shipped implementation is the
> three flat keys above, and that is deliberate: each is an independent scalar with its own
> clamp, so a shape change to one cannot invalidate the other two. The design doc is the
> drifted party here; the code is correct. Noted rather than silently reconciled.

### View & scene

| Key | Store file | Holds | Default |
| --- | --- | --- | --- |
| `flexo:grids` | `state/viewStore.ts` | `$grids` — per-axis reference grid | `{x:{enabled:false,spacing:1}, y:{enabled:true,spacing:1}, z:{enabled:false,spacing:1}}` |
| `flexo:hideInterior` | `state/viewStore.ts` | `$hideInterior` — preview KSA's outside-IVA gate | `false` |
| `flexo:kindVisibility` | `state/viewStore.ts` | `$kindVisibility` — View ▸ Display Filters | all six kinds `true` |
| `flexo:lighting` | `state/lightingStore.ts` | `$lighting` — environment, tone map, exposure, sky | `{environment:'glasshouse_interior', environmentIntensity:1, showEnvironmentBackground:false, backgroundBlur:0, exposure:0.85, toneMapping:'neutral'}` |
| `flexo:simulateGlass` | `state/settingsStore.ts` | `$simulateGlass` — preview KSA's muted glass | `false` |
| `flexo:showFpsCounter` | `state/settingsStore.ts` | `$showFpsCounter` — the only continuous-render opt-in | `false` |
| `flexo:selectionHighlight` | `state/settingsStore.ts` | `$selectionHighlight` — highlight colors + alphas | `{meshColor:'#fcff66', meshAlpha:0.35, kittenColor:'#ff00f7', kittenAlpha:0.35}` |
| `flexo:measure` | `state/measurementStore.ts` | `$measurementSettings` — unit, bounds mode, overlay toggles | `{unit:'m', boundsMode:'world', showSelectionBounds:false, showPerMesh:false, showMeshDistance:false}` |

### Entity marker & aid preferences

| Key | Store file | Holds | Default |
| --- | --- | --- | --- |
| `flexo:connectorSettings` | `state/settingsStore.ts` | `$connectorSettings` — connector cube size (m) | `{size:0.125}` |
| `flexo:ivaSeatSettings` | `state/settingsStore.ts` | `$ivaSeatSettings` — seat marker size + gaze cone | `{markerSize:0.12, showGazeCone:false}` |
| `flexo:lightSettings` | `state/settingsStore.ts` | `$lightSettings` — marker size, coverage mode, viz exposure, live preview | `{markerSize:0.12, showVolumes:'selected', exposureMode:'auto', vizExposure:1, livePreview:false}` |
| `flexo:colliders` | `state/colliderStore.ts` | `$colliderSettings` — fit precision, margin, orient-to-selection | `{precision:'bbox', margin:0, orientToSelection:true}` |
| `flexo:containers` | `state/containerStore.ts` | `$containerSettings` — containment warn precision | `{warnPrecision:'bbox'}` |

### Animation

| Key | Store file | Holds | Default |
| --- | --- | --- | --- |
| `flexo:animTransport` | `state/animationStore.ts` | `$animTransport` — loop, speed, latch | `{loop:false, speed:1, latched:false}` |
| `flexo:animTrails` | `state/animationStore.ts` | `$animTrails` — motion-trail mode | `'selected'` |
| `flexo:animDurationMode` | `state/animationStore.ts` | `$animDurationMode` — rescale vs clamp on duration edit | `'rescale'` |
| `flexo:animTrackHeaderW` | `ui/animation/timelineActions.ts` | `$trackHeaderWidth` — dopesheet header column (px) | `140` |

### Import & export

| Key | Store file | Holds | Default |
| --- | --- | --- | --- |
| `flexo:modelImport` | `state/settingsStore.ts` | `$modelImportSettings` — the sticky half of the importer (see below) | `{maxTextureSize:2048, upAxis:'y', bakeScale:true, decimateViewMeshes:true}` |
| `flexo:kittenTextureExport` | `state/settingsStore.ts` | `$kittenTextureExport` — reference-vs-bundle mode + `Content/Core` path | `{mode:'reference', contentCorePath:'C:\\Program Files\\Kitten Space Agency\\Content\\Core'}` |

### Not `persistentJSON`

Two localStorage keys are written with the raw API on purpose, because neither is JSON:

| Key | File | Holds |
| --- | --- | --- |
| `flexo:currentProjectId` | `state/projectIndexStore.ts` | a bare `ProjectId` string — the project this tab has open. The store behind it (`$currentProjectId`) is an ordinary atom; the write is in a try/catch, so a blocked localStorage costs the reload pointer, not the project. |
| `flexo_build_id` | `buildCheck.ts` | the last-seen deployment id. The one underscore key left in the tree — it predates the `flexo:` convention. |

Three names that *look* like storage keys are not: `flexo:project:<id>` is a **Web Locks**
lock name, `flexo:projects` is a **BroadcastChannel** name, and `flexo-fs` /
`flexo-projects` / `flexo-assets` are **IndexedDB** databases.

### Removed in v2 (boot-cleaned)

`purgeV1Storage()` (`state/projectStore.ts`, the first step of boot) deletes these and never
reads their values — removal, never migration:

| Key | Was | Why it is gone |
| --- | --- | --- |
| `flexo:inspectorVisible` | v1 inspector open state | folded into `flexo:layout` |
| `flexo:inspectorWidth` | v1 inspector width | folded into `flexo:layout` |
| `flexo:inspectorFloatPos` | v1 floating inspector position | folded into `flexo:layout` → `float` |
| `flexo:animPreviewFloatPos` | v1 animation scrubber position | the scrubber became the timeline dock's transport |
| `flexo:layerView` | global per-layer visibility/lock | now per project, inside the project snapshot ([layers.md](./layers.md)) |
| `flexo:currentProject` | v1 `{name}` pointer | projects are id-keyed in IndexedDB ([projects.md](./projects.md)) |
| `flexo:project:<name>` | v1 per-project snapshots | same; the names are listed in one warning notification, the values are never parsed |

The five layout/view keys go silently — they hold preferences, not work. Only the project
keys raise a notice, because a user's projects disappearing must be said out loud.

## Sticky settings vs per-action state

A persisted setting should describe **how the user works**, not **what they are doing right
now**. The model importer is the worked example (`$modelImportSettings` in
`state/settingsStore.ts`, key `flexo:modelImport`):

| Persisted (sticky) | Dialog state (per-import) |
| --- | --- |
| `maxTextureSize` (1024/2048/4096, default 2048) — the VRAM budget | scale factor |
| `upAxis` (`'y'` \| `'z'`) — the DCC's export convention | name prefix |
| `bakeScale` — the default geometry bake | make double-sided |
| `decimateViewMeshes` — the exported `<MeshView>` budget | bake transforms to origin, merge |

The right-hand column is intentionally forgotten between imports: re-applying the last
model's fix-up to the next one produces a plausible-looking, wrong result (a leftover `×0.01`
scale is the worst of these). Persist a preference; never persist a correction.

### Worked examples — IVA seat view settings

Two persisted atoms landed with [IVA seats](./iva-seats.md), and they are a clean illustration
of the "persist a preference, never a correction" rule and of the document/view split:

| Atom               | Key                     | Default                              | Why it is view state, not document state                                                                                                                  |
| ------------------ | ----------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$ivaSeatSettings` | `flexo:ivaSeatSettings` | `{ markerSize: 0.12, showGazeCone: false }` | KSA has no seat size, so an `IvaSeat`'s `scale` is unused; how big the marker draws is a preference about *your screen*, exactly like the connector cube's size. |
| `$hideInterior`    | `flexo:hideInterior`    | `false`                              | "Show me the part the way the game does outside IVA" is a way of looking, not a property of the part. Flipping it must never create an undo step.          |

Both live outside `$part` and outside undo. The seat *view* itself (`$seatView`, `$seatLook`
in `ivaStore.ts`) is the counter-example on the other side: it is transient working state —
which seat you are sitting in right now — so it is **not** persisted at all, and a reload puts
you back at the orbit camera.

## Projects (workspace persistence)

Beyond individual preference atoms, the **entire editing workspace** is persisted as a
*project*: the `$part` document, per-layer view state, active layer, camera, editor aids, and
the undo/redo history. This is a separate, hand-rolled **IndexedDB** layer (not
`@nanostores/persistent`) because it bundles multiple stores under a switchable project id and
restores them before React renders. Project snapshots are **schema-versioned**
(`PROJECT_SCHEMA_VERSION`): they are preserved across backwards-compatible model changes by
default-filling the missing fields from the live constructors, and purged at boot (with a
user-visible notice) only on a version bump or corruption — never migrated. See
[projects.md](./projects.md) and the project constitution in [AGENTS.md](../AGENTS.md).

### Where project data actually lives

| Store | Key | Holds |
| --- | --- | --- |
| localStorage | `flexo:currentProjectId` | a raw `ProjectId` string — the **only** project key left in localStorage |
| IndexedDB | `flexo-projects` | the projects themselves: `meta` / `snapshots` / `history` / `thumbs`, all keyed by project id |
| IndexedDB | `flexo-assets` | custom-asset binaries under **project-namespaced** keys, `pa:<projectId>:<kind>:<assetId>` |
| IndexedDB | `flexo-fs` | the granted mods-folder directory handle (`modFolderStore`) |

The Export to KSA dialog adds **no** persisted key: `exportPreviewStore`'s per-tab XML memos are
session state that dies with the dialog (`resetPreview()` on close), and the mods-folder grant it
manages is the `flexo-fs` handle above — the one database `nukeAndReload` keeps unless the user
opts into clearing it.

Two localStorage preference keys belong to the project surfaces themselves — both in the
table above: **`flexo:projectManagerView`** is the Project Manager's view + sort, deliberately
NOT including the search query (that is per-session), and **`flexo:confirmThreshold`** is the
one confirm-before-destroy count, edited in Settings ▸ General and read by every delete entry
point. Everything else about projects is IndexedDB, and the v1 localStorage keys are listed
under "Removed in v2" above.

### Leaving the browser

A project's full state — document plus every asset binary — travels as a **`.flexo.tar.gz`
archive** (`manifest.json` + `project.json` + `assets/<kind>/<id>`), which is the only export
that carries bytes. A **share link** carries the document alone: a URL cannot hold a texture's
pixels, so the Share Link dialog stays reachable for every project but explains the limit and
offers **Export archive instead…** when the project has binary assets. Both are described in
[projects.md](./projects.md).

## Related

- [editor-state.md](./editor-state.md) — core nanostores atoms and actions
- [projects.md](./projects.md) — project-based workspace persistence (multi-project, autosave, boot restore)
- [@nanostores/persistent docs](https://github.com/nanostores/persistent)
