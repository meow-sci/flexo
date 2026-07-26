# Projects

The editor is **project-based**: the whole workspace is a named project, autosaved to
localStorage and restored on the next page load. Switching projects swaps the entire
workspace. Implemented in `src/state/projectStore.ts`; the UI is `src/ui/ProjectButton.tsx`
(top toolbar).

## What a project captures

A `ProjectSnapshot` bundles everything needed to fully restore a workspace — **except the
camera**, which is ephemeral and resets on load:

- `name` — the project's identity (and its localStorage key suffix).
- `part` — the full `EditingPart` document: `partId`, `editorTags`, `layers`,
  `placements`, `connectors`, `colliders`, `ivaSeats`, `internalFlags` (each entity's
  `layerId` included).
- `layerView` — per-layer visibility/lock (the `$layerView` view state from `layerStore`).
- `activeLayerId` — where new items land (clamped to a live layer on load).
- `history` — the undo/redo stacks, via `exportHistory()` / `importHistory()` on
  `editorStore`, so **undo survives a reload**.
- `savedAt` — epoch millis, used to order the load-project list (most recent first).

Selection, tool mode, and snap are intentionally **not** captured (fresh slate on load).

## Storage convention

| Key | Value |
|---|---|
| `flexo:project:<name>` | a JSON `ProjectSnapshot` — one entry per saved project |
| `flexo:currentProject` | `{ name }` — read on boot to pick which project to restore |

`listProjects()` enumerates the `flexo:project:` keys (reading each snapshot's own `name`,
not the key, so it's robust to odd characters).

## Autosave

`startAutosave()` subscribes to every store that contributes to a project — `$part`,
`$canUndo`, `$canRedo`, `$activeLayerId`, `$layerView`, `$projectName` — and writes a
**debounced** snapshot (300 ms) on any change. `$part` + the can-undo/redo flags together
cover all document + history changes (every `pushUndo`/`undo`/`redo` touches them); the
debounce collapses a gizmo drag's many per-frame `$part` writes into one save. A `suspended`
flag prevents the cascade of store writes during a *load* from triggering a redundant save.

## Boot restore (no double refresh)

`hydrateProjectOnBoot()` is called **synchronously in `main.tsx` before
`createRoot().render()`**. localStorage is synchronous, so it loads the current project
(or the most recent, or a fresh `Untitled`) into the stores before the first paint — the
workspace renders once, with the right data. Then it starts autosave.

## Actions (projectStore exports)

`saveCurrentProject()`, `loadProject(name)`, `createProject(name)`,
`renameCurrentProject(name)`, `deleteProject(name)`, `listProjects()`,
`projectExists(name)`, `uniqueProjectName(base?)`, `hydrateProjectOnBoot()`, and the
`$projectName` atom (current project's name; UI reads it via `useStore`).

- **Create** starts an empty document/history/layer-view under a new name, saves it, makes
  it current. The UI's "New Project" uses `uniqueProjectName('Untitled')` to avoid clobbering.
- **Rename** re-keys storage (removes the old `flexo:project:<old>` entry).
- **Delete** of the current project switches to the most-recent remaining project, or
  starts a fresh default when none are left.

## The compact project codec

`src/state/projectCodec.ts` is the single wire format for everything that serializes a
document — the localStorage snapshot and the project export/import JSON alike. It encodes
`EditingPart` into short keys (`p` placements, `c` connectors, `cl` colliders, `iv` IVA seats,
`ifl` the per-SubPart-template `<Internal>` flags, `k` kittens, `a` animations, `m` custom
meshes, …), omitting anything empty or at its default.

`PROJECT_EXPORT_VERSION` is currently **7**. That bump covered **both** halves of the IVA
work at once — `iv` and `ifl` — because they shipped together. Per the no-migration rule in
AGENTS.md, **older payloads are rejected on import, never converted**, and a stale
localStorage snapshot is discarded by the boot-time purge rather than upgraded.

Two encoding rules worth knowing, both about seats: the **array order of `iv` is
load-bearing** (it is KSA's in-game seat cycle order — see [iva-seats.md](./iva-seats.md)), and
a seat's `layerId` is restored from `IVA_SEAT_LAYER_ID` on decode rather than serialized, with
its unused `scale` omitted by the shared transform encoder. `ifl` is decoded defensively —
only `string → boolean` entries survive, bad data is dropped.

## UI — `src/ui/ProjectButton.tsx`

A top-toolbar "Project" popover showing the current project name (editable input that
renames on blur/Enter), a **New Project** button, and a **Load Project…** button that opens
a `Dialog` listing every saved project with load + delete (delete is `useDialog().confirm`).
Autosave means there's no explicit Save action.

## Tests

`src/state/projectStore.test.ts` covers the save→load round-trip (document, active layer,
layer view, and history), stale-active-layer clamping, list ordering/summaries, create,
rename re-keying, delete-current fallback, and unique-name generation.
