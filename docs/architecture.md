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
  app.tsx     Composes the viewport canvas + floating panels.
  main.tsx    React root: <App /> + GlobalToastRegion + BuildIdMismatchDialog.
```

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
                 │  $part, $selectedIndex, $toolMode, $snap  (atoms)       │
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

## Key invariants

- Transforms convert between store and three.js **only** through
  `src/three/coords.ts` (see [coordinates.md](./coordinates.md)).
- Numbers serialized to XML go through `formatG6` (see [xml-io.md](./xml-io.md)).
- Rotation is radians internally/in export; the inspector UI shows degrees.
- Shared resources (mesh geometry, textures, per-material-id materials) are cached
  and never disposed per-instance; only per-instance material clones are disposed.

## Build & tooling

- Package manager: **pnpm**. Scripts: `pnpm dev`, `pnpm build`, `pnpm typecheck`,
  `pnpm lint`, `pnpm fmt`, `pnpm test`. (The standalone `scripts/` mini-workspace
  runs on Bun instead — see `scripts/CLAUDE.md`.)
- **React Compiler** runs in the Vite build (babel-plugin-react-compiler via
  `@rolldown/plugin-babel`) and auto-memoizes every component/hook — the codebase
  contains no manual `useMemo`/`useCallback`/`React.memo`. Rules-of-React are
  enforced at lint time (oxlint + eslint-plugin-react-hooks JS plugin).
- Lint: **oxlint** (`.oxlintrc.json`); format: **oxfmt** — the only linter/formatter.
- XML uses built-in DOM (`@xmldom/xmldom` for node/test, browser `DOMParser` at
  runtime) — no third-party XML lib.
- Tests: vitest (`happy-dom` env). See each doc for what's covered.

## Feature docs
- [3D workspace](./3d-workspace.md)
- [SubPart catalog & asset loading](./subpart-catalog.md)
- [Editor state](./editor-state.md)
- [Layers](./layers.md)
- [Coordinate system & transforms](./coordinates.md)
- [Part XML serialize/parse](./xml-io.md)
- [Texturing](./texturing.md)
- [Asset pipeline & production build](./asset-pipeline.md)
