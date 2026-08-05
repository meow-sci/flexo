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

## Schema version & preservation

Saved projects are the user's own work, so they survive app updates whenever compatibility
allows. `PROJECT_SCHEMA_VERSION` (currently **2**, in `projectStore.ts`) is stamped into every
snapshot and is the entire compatibility contract: `sanitizeProjectStorage()` runs first in
`hydrateProjectOnBoot()` and drops a `flexo:project:*` entry **only** when it is corrupt or its
stamped `version !== PROJECT_SCHEMA_VERSION`. Everything else is kept. (The old behavior — a
strict structural check that purged every saved project on any *additive* model change — is
gone.)

A kept snapshot is run through `normalizePart`, a template-driven normalizer that fills fields
the snapshot is **missing** from the live constructors, at four sites: the `EditingPart` top
level (`createEmptyPart()`), `gameData` (`createEmptyGameData()`), each `subPartGameData[]`
entry (`createSubPartGameData`), and each `customMeshes[].emissive` (`createGlow()`) — for the
document *and* every undo/redo history entry. Values already present are never overwritten.
This is default-filling of additive fields, **not** migration; the templates come from the live
constructors, so there is no per-field upkeep. `loadProject`'s try/catch discard stays as the
backstop for anything deeper than the normalizer reaches.

So: an **additive** change (a new field with a safe constructor default) needs no version bump
— old projects keep loading, and if the field sits deeper than an existing normalizer site,
extend the normalizer. A **breaking** change (removed/renamed/retyped field, changed
meaning/units) MUST bump `PROJECT_SCHEMA_VERSION`, which *is* the purge switch. The full rule
lives in the project constitution in [AGENTS.md](../AGENTS.md).

When a purge does happen, the removed project names are surfaced to the user in a boot toast
(the UI drains them via `consumeRemovedProjectsNotice()`) — not just a `console.warn`.

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

`PROJECT_EXPORT_VERSION` is currently **8** (lights normalized out of `SubPartGameData` into
first-class part entities). Import accepts **exactly** that version — older payloads are
rejected, never converted — and that mechanic is unchanged. What changed is the **bump
policy**: an additive, backwards-compatible change **MUST NOT** bump it, because decode is
total and tolerant (missing fields fall back to defaults, so an older same-version payload
still imports cleanly). Only a **breaking** change bumps it, and adds its own `// vN: what
broke` line to the constant's changelog comment. Historically the version was bumped for
additive work too (v3 custom materials, v6 colliders); that stops. A document-model break
bumps this **and** `PROJECT_SCHEMA_VERSION`; a wire-format-only change (codec key renames)
bumps only this one. See the constitution in [AGENTS.md](../AGENTS.md).

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
rename re-keying, delete-current fallback, and unique-name generation. It also covers the
schema-version contract: a snapshot missing additive fields is **kept** and default-filled by
`normalizePart` (document + history entries), while a corrupt or version-mismatched snapshot is
purged by `sanitizeProjectStorage()` and reported through `consumeRemovedProjectsNotice()`.
