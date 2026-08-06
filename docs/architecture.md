# Architecture

How flexo is structured and how data flows. Flexo is a browser SPA (React 19 +
React Compiler + Vite + TypeScript + three.js + react-aria-components) for
composing KSA Parts from SubParts.

## Layering

```
src/
  ksa/        Pure domain logic. Types, XML serialize/parse, the SubPart catalog
              loader, number formatting. Unit-tested with vitest.
  state/      Editor state as nanostores atoms + plain action functions.
  three/      All three.js: viewport, scene sync, gizmos, selection, materials,
              textures, coordinate mapping.
  ui/         React panels built on react-aria-components, with the shared
              primitives in ui/kit/ (tailwind-variants styling). Read/write the
              store via @nanostores/react.
  app.tsx     The docked shell: column(MenuBar | PhoneTopBar, row(LeftSidebar,
              ViewportHost, RightSidebar), TimelineDock?, StatusBar |
              ToolBarStrip + phone chips + CondensedStatusBar + PhoneModeTabs),
              plus the single DialogRoot and the ⌘K CommandPalette. Exactly TWO
              floating windows mount inside the workspace band — the gizmo
              ToolBarWindow and the ChainWindow (foundation.md §6.2).
  main.tsx    Boot, then the React root. Boot is an async IIFE because project
              hydration is awaited (IndexedDB); nothing paints before it resolves.
```

**`state/` — the shell services** (all ephemeral unless noted; none of them ever
touches `$part`, so none of them can create an undo step):

| Store | Owns |
|---|---|
| `modeStore.ts` | `$mode` (five modes), the single `$activeTool` slot, `setMode` choreography |
| `layoutStore.ts` | `$layout` — sidebar widths/collapse, timeline dock, float positions (persisted, `flexo:layout`) |
| `statusStore.ts` | the status bar's message slot, tool segment, advisories, progress, FPS report |
| `notificationStore.ts` | the session-only notification ring (100 entries) behind the bell |
| `modifierStore.ts` | held modifiers, hover context, the computed modifier hints |
| `commandStore.ts` | the command registry + dynamic providers + the palette (persisted recents) |
| `dialogStore.ts` | `$openDialog` — which of the 20 dialog ids is open |
| `hotkeyStore.ts` | `$focusedSurface` / `$dialogOpen` / `$activeScopes` for the scoped registry |
| `snapStore.ts` | snap enable + the two steps (persisted as three flat keys) |
| `projectIndexStore.ts` | the reactive project metadata index, current-project pointer, write lock |

Mode sub-state lives beside them in `dataModeStore` / `engineStore` / `surfaceModeStore` /
`animationStore`, each registering its own enter/exit hooks with `modeStore` — the mode
machine imports no feature store, so the dependency only ever points one way.

**`ui/` subdirectories**: `kit/` (the primitive kit incl. `FloatingWindow`, `MenuBar`,
`Sheet`, `DialogViewStack`, `zIndex.ts`), `shell/` (+ `shell/phone/`), `commands/`, `menu/`,
`palette/`, `status/`, `hotkeys/`, `outliner/`, `build/`, `data/` (+ `data/sections/`),
`engine/`, `surface/`, `animation/`, `assets/`, `chain/`, `projects/`, `settings/`.

**Dependency rule:** `state/` and `ksa/` must never import `react` or `react-dom`
— the editor core stays reusable and headlessly testable; `three/` and `ui/` are
the two consumer layers. `three` (the math/geometry library) is likewise off-limits
there, with one deliberate carve-out: the animation modules (`state/animationStore`,
`ksa/animationImport`, `ksa/animationRig`, `ksa/easingFit`) use three's
Matrix4/Quaternion/Vector3 for pose math, and the custom-asset bridge
(`state/customAssetStore`, `ksa/exportGlb`, `ksa/modExport`) uses BufferGeometry +
GLTFExporter to build export binaries. Those modules stay renderer-free (no scene,
no WebGL) so they remain unit-testable; don't extend the carve-out beyond them.

## Single source of truth & data flow

The nanostores `$part` atom (`src/state/editorStore.ts`) owns the `EditingPart`.
Both the 3D scene and the React UI read and write **through the store** — they never
hold divergent copies.

```
                 ┌─────────────── src/state/editorStore.ts ───────────────┐
                 │  $part, $selection, $toolMode, $snap  (atoms)           │
                 │  addSubPart / updatePlacementTransform / undo … (fns)   │
                 └───────────▲───────────────────────────────▲────────────┘
                             │ useStore() / actions           │ subscribe() / actions
                 ┌───────────┴───────────┐         ┌──────────┴───────────────┐
                 │  React UI (src/ui/)    │         │  three.js (src/three/)   │
                 │  react-aria panels     │         │  EditorScene reconciler  │
                 └────────────────────────┘         └──────────────────────────┘
```

- **React → store:** panels call action functions (`addSubPart(id)`,
  `updatePlacementTransform(...)`) and read via `useStore($atom)`.
- **three.js → store:** `EditorScene` subscribes with vanilla `$part.subscribe(...)`
  (no React). Gizmo drags / click-selection call the same action functions.
- **store → both:** any `$part.set(next)` notifies the scene (reconcile) and every
  subscribed React component. Gizmo drags and numeric-field edits funnel through the
  same `updatePlacementTransform`, so the 3D view and inspector stay live-synced.

`EditorScene` (`src/three/EditorScene.ts`) is the **only** place that mutates scene
objects from state — it diffs `$part.placements` against a `Map<instanceId,
SubPartObject>` and adds/removes/updates accordingly (async geometry/material loads
are guarded against placements removed mid-load).

## Modes, commands and keys

Three shell services sit between the UI and the stores, and each is a single dataset:

- **The mode machine** (`state/modeStore.ts`) — one `$mode` atom over five modes
  (Build / Animation / Data / Engine / Surface), one `$activeTool` slot, and `setMode` as the
  ONLY place mode-switch choreography runs. It is view state: never persisted, never an undo
  step, and it never touches the document. It replaced v1's hidden `$inspectorMode`. See
  [editor-state.md](./editor-state.md#the-mode-machine--srcstatemodestorets).
- **The command registry** (`state/commandStore.ts`, commands defined in `ui/commands/`) —
  every menubar item, palette row and keyboard binding dispatches one command id. Menus are
  data (`ui/menu/menuSpec.ts`) and dialogs are ids (`state/dialogStore.ts`).
- **The scoped hotkey registry** (`ui/hotkeys/registry.ts`) — every binding declares a scope
  (`global`, `viewport`, `mode:*`, `tool:*`, `surface:*`) and is enabled iff that scope is in
  `hotkeyStore.$activeScopes`, with precedence `surface > tool > mode > viewport > global`.
  **There are no off-registry bindings**: a pure-key behavior with no menu home carries a
  synthetic id so Help and the conflict validator still see it. `validateRegistry` enumerates
  every reachable scope set at dev time and in `hotkeyRegistry.test.ts`. Escape is ONE binding
  running an ordered ladder (`ui/hotkeys/escLadder.ts`), and the Help dialog is generated from
  the registry — a rebind moves the menu chip, the palette chip and the Help row together.

## Key invariants

- **Boot paints once.** `main.tsx` awaits `hydrateProjectOnBoot()` (IndexedDB is async) before
  `createRoot().render()`, and `initCustomAssets()` runs strictly after it so blob hydration
  reads the resolved `$currentProjectId`. Nothing may render ahead of that await — see
  [projects.md](./projects.md).
- **The chrome is not the document.** Mode, layout, status messages, notifications and
  floating-window state are view state: they never enter `$part`, never create an undo step,
  and a mode switch never touches the document, the selection, the camera or the active layer.
  The corollary is the rule for new features — if a change belongs in undo, it belongs in
  `$part`; if it does not, it must not be written there to get persistence.
- **The render loop is on-demand and must stay that way.** No chrome may force continuous
  rendering; the FPS counter's opt-in is the only continuous mode, and it says so. Anything
  that can change a pixel invalidates instead — see
  [3d-workspace.md](./3d-workspace.md#rendering-is-on-demand).
- Transforms convert between store and three.js **only** through
  `src/three/coords.ts` (see [coordinates.md](./coordinates.md)).
- Numbers serialized to XML go through `formatG6` (see [xml-io.md](./xml-io.md)).
- Rotation is radians internally/in export; the inspector UI shows degrees.
- Shared resources (mesh geometry, textures, per-material-id materials) are cached
  and never disposed per-instance; only per-instance material clones are disposed.
- **Every literal id reference in the document is remapped on import/paste.** Ids that
  cross-reference within `$part` — a coupling's `connectorId`, a rocket's
  `SubPartId`, a `<ConnectorRef>` inside preserved raw XML, and (since KSA 2026.7.9) every
  `<FeedsFrom>` / `<ConsumerFeedWiring>` target — are plain strings, while import and paste
  REGENERATE both `_connectorN` and placement `instanceId`s. Any new id-bearing field must
  be rewritten in the same pass or it silently points at nothing (or, worse, at whatever
  now holds that id). The feed remappers live in `src/ksa/idRemap.ts`, shared by
  `editorStore.applyImportedGameData` and `projectTransfer.mergeGameData`; unmapped ids are
  left as-is, matching `remapRawConnectorRefs`.

### Plumbing topology is document state

KSA 2026.7.9 made propellant flow explicit authored data (connector `<Capabilities>`,
consumer `<FeedsFrom>`, part `<ConsumerFeedWiring>`, addressable `<Tank Id>` containers).
It is ordinary `$part` document state throughout: modeled in `src/ksa/types.ts`,
undo-tracked like every other mutation, remapped on import/paste as above, encoded by the
project codec (the `cp`/`fd`/`pl`/`tk`/`cfw` tokens added at wire version 4; the codec is at
`PROJECT_EXPORT_VERSION` 10 today), and validated by the pure `src/ksa/engineValidation.ts`
whose findings the Engine panel and the Export dialog both render. The pickable-options
derivations (`src/state/feedTargets.ts`) are pure functions over `EditingPart` kept OUT of
the component modules so React Fast Refresh survives. See
[engines.md](./engines.md#plumbing--where-the-propellant-actually-comes-from-ksa-202679)
and [scope/plumbing-and-feeds.md](../scope/plumbing-and-feeds.md).

## Build & tooling

- Package manager: **pnpm**. Scripts: `pnpm dev`, `pnpm build`, `pnpm typecheck`,
  `pnpm lint`, `pnpm fmt`, `pnpm test`. (The standalone `scripts/` mini-workspace
  runs on Bun instead — see `scripts/CLAUDE.md`.)
- **Two builds, not one.** `pnpm build` is `tsc -b && vite build && vite build
  apps/partpreview`: the editor SPA (single entry, `base: '/flexo/'`, output `dist/`)
  followed by each **mini app** under `apps/<name>/` — its own Vite root, config and
  bundle, built into `dist/apps/<name>/`. They are separate builds precisely so the
  editor's chunk graph is untouched (a second `rollupOptions.input` would hoist shared
  modules into common chunks). Mini apps import shared code straight from `src/` and
  fetch the heavyweight static assets from the main app's copy via `assetBase()` /
  `VITE_ASSET_BASE` rather than duplicating them. Today's only mini app is
  `apps/partpreview/` — see [wiki part preview](./wiki-part-preview.md).
- **React Compiler** runs in the Vite build (babel-plugin-react-compiler via
  `@rolldown/plugin-babel`) and auto-memoizes every component/hook — the codebase
  contains no manual `useMemo`/`useCallback`/`React.memo`. Rules-of-React are
  enforced at lint time (oxlint + eslint-plugin-react-hooks JS plugin).
- Lint: **oxlint** (`.oxlintrc.json`); format: **oxfmt** — the only linter/formatter.
- XML uses built-in DOM (`@xmldom/xmldom` for node/test, browser `DOMParser` at
  runtime) — no third-party XML lib.
- Tests: vitest (`happy-dom` env). See each doc for what's covered.

## Feature docs

**The shell and the editor core**

- [UI shell](./ui-shell.md) — layout, modes, commands, status bar, floating windows, hotkeys, phone
- [Editor state](./editor-state.md) — stores, actions, the undo/redo invariant
- [3D workspace](./3d-workspace.md) — viewport, reconciliation, selection, gizmos, rendering
- [Layers](./layers.md) — document vs view state, the Outliner
- [State persistence](./state-persistence.md) — every localStorage key and what belongs there
- [Projects](./projects.md) — IndexedDB projects, autosave, archives, share links

**Authoring surfaces**

- [Animation editor](./animation-editor.md) — clips, joints, the dopesheet, per-channel easing
- [Engines](./engines.md) — Engine mode, the ported physics, plumbing, solid motors
- [Action chains](./action-chains.md) — the ⇧⌘K chain window
- [Colliders](./colliders.md) · [IVA seats](./iva-seats.md) · [Lights](./lights.md)
- [Custom assets](./custom-assets.md) · [Importing models](./importing-models.md)

**The KSA contract**

- [Coordinate system & transforms](./coordinates.md)
- [Part XML serialize/parse](./xml-io.md)
- [SubPart catalog & asset loading](./subpart-catalog.md)
- [Texturing](./texturing.md)
- [KSA Part connector notes](./ksa-part-connector-notes.md)

**Build & delivery**

- [Asset pipeline & production build](./asset-pipeline.md)
- [Wiki part preview mini app](./wiki-part-preview.md)
