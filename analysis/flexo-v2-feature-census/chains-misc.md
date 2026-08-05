# Area report — Action chains, command palette, settings menu, about/help, misc & known TODOs

Repo: `/Users/asherwin/repos/meow-sci/flexo` (all paths below relative to this root unless absolute).

## HEADLINE: Action chains are FULLY IMPLEMENTED and shipped

The stale claim ("planned, not implemented") comes from two out-of-date sources:

- `plans/ACTION_CHAINS_PLAN.md:1` — header still reads `> **Status**: planned, not implemented. Branch: feature/action-chains.` **This header is stale.**
- The auto-memory note `project_action_chains_plan.md` repeats it. **Also stale.**

Ground truth: the entire feature is on `main`, mounted unconditionally in `src/app.tsx:145`, wired to `mod+K` in the global hotkey registry (`src/ui/hotkeys/registry.ts:162-168`), reachable from the SelectionToolbar "Chain" button (`src/ui/SelectionToolbar.tsx:75-80`), fully documented in `docs/action-chains.md` (281 lines, accurate — verified line-by-line against the code), and covered by three test suites (`src/three/chainMath.test.ts`, `src/state/chainStore.test.ts` 323 lines, `src/state/editorStore.test.ts` `describe('applyActionChain')` at line 2581).

---

## 1. Feature inventory

### 1.1 Action-chain palette (the whole feature)

**What it does:** A floating, **non-modal** command palette that builds an ordered list of steps ("ops") over a frozen set of seed SubPart placements, previews the result live as translucent green ghosts in the viewport, and commits everything as **one undo step**. Use cases: 4 RCS blocks around a tank, 6×4 solar grid, 15-step helix.

**UI paths:**

- `mod+K` (⌘K / Ctrl+K) anywhere — toggles open/cancel (`src/ui/hotkeys/registry.ts:162-168`; preventDefault suppresses the browser's own ⌘K).
- SelectionToolbar → "Chain" button (Workflow icon) — shown whenever a selection exists (`src/ui/SelectionToolbar.tsx:75-80`).
- Both route through `toggleChainPalette()` (`src/ui/chain/openChainPalette.ts:24`) so guards can never disagree.

**Open guards** (`src/ui/chain/openChainPalette.ts:36-45`):

- Selection contains no SubPart placements → toast "Select SubParts to chain" (warning). Only SubPart placements can seed — connectors/colliders/lights/IVA seats/kittens deliberately cannot (v1 limit).
- Any seed on a locked layer → toast "Selection is on a locked layer" (checked at **open**, not at Apply — locking mid-session doesn't block commit; documented deliberate limit, `docs/action-chains.md:251`).
- Seeds = selected placements' `instanceId`s **frozen in selection order** at open; changing selection afterwards does not change the seeds.

**Implementing files:**

| File                                         | Role                                                                                                                                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/state/chainStore.ts` (417 lines)        | `$chainSession` atom (ephemeral), 6 op types, `clampOp`/`defaultOp`, add/update/remove/move actions, persisted `flexo:chainDefaults` last-used-params blob                                                                              |
| `src/three/chainMath.ts` (422 lines)         | `evalChain` — pure fold from (seed transforms, ops) → instance list; `MAX_ARRAY_COUNT = 500`, `MAX_CHAIN_INSTANCES = 2000` (line 89); composes `bulkTransform.ts` primitives (same module as gizmo + numeric transform panel)           |
| `src/three/chainEval.ts`                     | `$chainEval` computed([$part, $chainSession]) — resolves frozen seed ids against the CURRENT document on every recompute (live re-flow while nudging a seed)                                                                            |
| `src/three/ChainPreviewLayer.ts` (136 lines) | Ghost overlay; `PREVIEW_MAX_GHOSTS = 500`; singleton unlit green material (0x2cfa1f, opacity 0.35, never disposed); group on `viewport.scene` (outside export hierarchy, layer bookkeeping, pick set; every clone gets no-op `raycast`) |
| `src/ui/chain/ChainPalette.tsx` (205 lines)  | The floating card: search field, command list, step cards, footer (instance counts / error), Apply/Cancel                                                                                                                               |
| `src/ui/chain/ChainStepCard.tsx` (408 lines) | Per-step parameter form; stateless — writes straight through `updateChainOp`                                                                                                                                                            |
| `src/ui/chain/chainCommands.ts`              | Command catalog: label/description/keywords/lucide icon per op kind (search matches label + keywords, e.g. "circle"/"ring"/"polar" → Radial Array)                                                                                      |
| `src/ui/chain/openChainPalette.ts`           | `toggleChainPalette()` open guards                                                                                                                                                                                                      |
| `src/state/editorStore.ts:1770-1855`         | `ChainCommitEntry`, `nextChainInstanceId` (collision-skipping id generator), `applyActionChain` (the ONLY document write)                                                                                                               |

**The six op kinds** (`chainStore.ts:29-106`), two families:

- **Transform steps** (move the whole working set, like the multi-select "transform by" panel + a pivot choice):
  - **Translate** — `delta` Vec3 (m).
  - **Rotate** — `degreesDeg` EulerXYZ, `pivot` (centroid | Part origin | custom point), `center` Vec3.
  - **Scale** — `factor` Vec3, `mode` 'smart' (scales positions about pivot too) | 'inPlace' (grows each member in place; pivot row hidden), `pivot`, `center`.
- **Array steps** (REPLICATE the working set; arrays **compose** — [linear ×5 X][linear ×3 Y] = 15-cell grid):
  - **Linear Array** — `count`, `offset` per step, `stepRotateDeg` (iterated: copy k rotates about its own moved centroid → staircases/helixes; quaternion accumulates by multiplication, NOT `k·euler` — regression-test-pinned), `stepScale` (= stepScale^k, in place).
  - **Radial Array** — `count`, `axis` (default **'x'** — a KSA part's nose/long axis is local +X), `center`, `startAngleDeg`, `sweepDeg` (full 360 divides by count; partial sweep by count−1, endpoint-inclusive), `orient` ('rotate' with ring | 'keep' orientation), `radialOffset` (radius preserved from centroid's radial component; on-axis fallback +Y for X axis), `axialStep` (helix rise).
  - **Grid Array** — `plane` (xy|xz|yz), `countA`×`countB`, `spacingA/B`, `centered` (shifts grid so seed is in the middle).

**Semantics locked in** (mirror the memory + plan): `count` = TOTAL instances including the original (arrays clamp ≥ 2); radial default axis X; exactly one group is the seed group — at commit its members **overwrite** the original placements in place (seeds can and do move: transform step, radial startAngle, centered grid), all others append clones.

**Clamps** (`clampOp`, `chainStore.ts:250-321`; engine re-validates independently in `evalChain`): distances ±10000 m, angles ±360°, scale 0.01–100 (positive only — **mirror deliberately unreachable**: KSA back-face culls negative-scale placements), linear/grid counts ≤ 500, radial count ≤ 360, chain total ≤ 2000 instances (checked before an array expands).

**Apply** (`applyActionChain`, `editorStore.ts:1814`):

- Resolves every distinct seed FIRST; returns −1 (no mutation, no undo entry) if any is gone; palette then toasts "Chain not applied — seeds no longer exist".
- One `pushUndo('action chain', detail)` for the whole thing.
- Clones: same `subPartTemplateId` + `layerId`, fresh `instanceId` via `nextChainInstanceId` (`editorStore.ts:1793`) which **skips forward past taken ids** — a deliberate, documented deviation from `duplicateSelected` (which can collide after deletions; tolerated for 1 duplicate, unacceptable for 500).
- **No reference remapping** (same as Duplicate): clones carry no animations/joints/gimbals/feeds/couplings; template-keyed data (SubPart GameData, subpart-owned colliders/lights, internalFlags) follows automatically.
- Afterwards seeds + all new copies are selected → immediately chainable/transformable again.
- Toasts "Applied chain · +N SubParts" or "· N transformed".

**Interaction details / hotkeys while open** (`ChainPalette.tsx`):

- **Non-modal by design** (component comment lines 17-30): orbiting, gizmo drags, W/S-A/D-Q/E rotate, arrow nudge and undo all stay live; `$chainEval` re-evaluates against the current document so tweaking a seed while the array re-flows is the point.
- `mod+enter` = Apply (component-local `useHotkeys`, `enableOnFormTags: true`, preventDefault; handlers read stores fresh so memoised callbacks never go stale — no dep list).
- `escape` = Cancel — registered WITHOUT preventDefault so `useNumberDraft` can swallow the first Escape to revert a dirty field (app-wide convention: revert first, close second).
- Search field autofocus; choosing a command re-focuses the search input (type→Enter→type→Enter flow, via a wrapper-div ref because the kit SearchField owns its `<input>`).
- Command list = the palette's empty state (shows when 0 steps or while searching).
- Step cards: ChevronUp/Down reorder (`moveChainOp`), X remove; every field commits through `updateChainOp` which clamps AND persists the value as that kind's next default (`flexo:chainDefaults`) — an accidental Escape loses the step list, not the tuned numbers.
- Footer: `N instances · +M new`, `· preview capped at 500` when over cap, or the engine error in red; Apply disabled on error/0 instances.
- Seeds that vanish (deleted/undone) are dropped by `$chainEval`; footer shows "Seeds no longer exist"; palette does NOT auto-close. Loading a project closes the session (`projectStore.ts:287` → `closeChain()`).

**Ghost preview subtleties** (`ChainPreviewLayer.ts:80-136`):

- A seed is only ghosted when the chain MOVES it (any of 9 numbers differs > 1e-9) — makes pure-transform chains previewable.
- `Group.clone(true)` shares geometry with the mesh cache; ghost material assigned by reference; rebuild-wholesale on every `$chainEval` change is allocation-free.
- Hidden layer → hidden ghosts (clone copies `visible`); layer opacity fade does NOT carry (material replaced).
- Async-loading SubParts skipped; `SubPartObject.create` completion calls `refresh()`.
- Preview cap 500 does NOT limit Apply (a 30×30 grid previews 500, applies 900).

**Deliberate v1 exclusions** (`docs/action-chains.md:239-254`) — candidate v2 backlog: no Mirror step, placements-only seeds, no saved/named presets/macros, lock checked at open only, no viewport pivot picking (click-to-set center), palette not draggable, no drag-reorder of steps, no per-instance jitter, no expression inputs, no per-ghost labels.

### 1.2 Burger menu (desktop "Settings" button)

**UI path:** top Toolbar (floating, top-center desktop) → rightmost burger icon (`aria-label="Menu"`) → popover menu, `placement="bottom end"`, w-44 (`src/ui/SettingsButton.tsx:208-244`; mounted from `src/ui/Toolbar.tsx:64`).

Menu items (exact order):

1. **Scale Everything** → `ScaleEverythingDialog`
2. — separator —
3. **Settings** → `SettingsModal`
4. **Shortcuts** → `openHelp()` (`src/state/helpStore.ts`) — opens the hotkeys help overlay (`src/ui/hotkeys/HelpDialog.tsx`, owned by the ui-kit/hotkeys area)
5. **About** → `openAbout()` (`src/state/aboutStore.ts`)
6. — separator —
7. **Reset Everything 🔥** (danger variant) → ConfirmDialog → `nukeAndReload`

On phone the same items appear inside the single MobileTopBar overflow burger (`src/ui/MobileTopBar.tsx:80-116`), flattened together with Part Data / Export / View / Measure / History (per the FEATURE_TODOS "flatten the mobile menu" item, done).

### 1.3 Settings modal (every item)

`SettingsModal` (`src/ui/SettingsButton.tsx:42-164`) — centered dismissable Modal. Sections and controls, in order:

| Section                           | Control                                                                                        | Store (all localStorage-persisted via `persistentJSON`)                                         | Notes                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Viewport**                      | "FPS counter" Switch                                                                           | `$showFpsCounter` (`flexo:showFpsCounter`, settingsStore.ts:292)                                | `src/three/Viewport.ts` subscribes, mounts/unmounts stats.js panel                               |
| **Connectors**                    | "Connector size" PreciseNumberInput (m, min 0.01)                                              | `$connectorSettings.size` (`flexo:connectorSettings`, default 0.125)                            | Global gizmo-cube edge length; facing cone derives from it; three layer subscribes               |
| **IVA seats**                     | "Marker size" PreciseNumberInput (m, min 0.01)                                                 | `$ivaSeatSettings.markerSize` (`flexo:ivaSeatSettings`, default 0.12)                           | Eye-sphere diameter; cone/up-stick derive; KSA has no seat size so marker never scales with part |
|                                   | "Show gaze cone" Switch + explanatory caption                                                  | `$ivaSeatSettings.showGazeCone` (default false)                                                 | Caption warns cone is indicative only — game clamps to 90° hemisphere                            |
| **Selection highlight**           | "Meshes" row: native `<input type=color>` swatch + strength Slider (0–1, step .05) + % readout | `$selectionHighlight.meshColor/meshAlpha` (`flexo:selectionHighlight`, defaults #fcff66 / 0.35) | Emissive tint for selected SubPart meshes; `src/three/highlightSettings.ts` parses               |
|                                   | "Kittens" row: same pair                                                                       | `.kittenColor/.kittenAlpha` (defaults #ff00f7 / 0.35)                                           | Connectors keep fixed green, not configurable                                                    |
| **Kitten mesh textures (export)** | "Source" Select: "Reference game install" \| "Bundle copies into mod"                          | `$kittenTextureExport.mode` (`flexo:kittenTextureExport`, default 'reference')                  | Feeds Make-Kitten-Mesh mod export                                                                |
|                                   | (reference mode only) "Content/Core path" TextField (mono) + caption                           | `.contentCorePath` (default `C:\Program Files\Kitten Space Agency\Content\Core`)                | Builds absolute `<Diffuse Path>`; relies on .NET Path.Combine passing rooted paths through       |

**Settings NOT in the Settings modal but in `settingsStore.ts`** (owned/edited by other areas' UIs, listed for completeness):

- `$lightSettings` (`flexo:lightSettings`) — light marker size, coverage volumes selected/all/off, exposure mode auto/absolute, vizExposure, livePreview; edited from the View menu / lights UI. Note its **field-defaulting read helper** `lightSettings()` (settingsStore.ts:125) — the pattern for adding fields without migration.
- `$lightPreviewCount` — deliberately ephemeral plain atom (scene→UI report, not a preference).
- `$modelImportSettings` (`flexo:modelImport`) — maxTextureSize 1024/2048/4096, upAxis y/z, bakeScale, decimateViewMeshes; edited inside ImportModelDialog. Per-import choices (scale factor, prefix, double-sided, merge) are deliberately dialog state, NOT persisted (a leftover 0.01 scale silently corrupting the next import is the documented worst case).
- `$simulateGlass` (`flexo:simulateGlass`) — kitten-visor glass WYSIWYG toggle; edited in the material/texturing UI.

v2 note: the "Settings" surface is really scattered across the modal, the View menu, and inline dialogs — see Pain points.

### 1.4 Scale Everything

**UI path:** desktop burger menu → "Scale Everything"; mobile burger → "Scale Everything". `src/ui/ScaleEverythingDialog.tsx` → `scaleEverything({x,y,z})` in `src/state/editorStore.ts`.

- Multiplies the WHOLE workspace — every part, connector, kitten AND every animation keyframe — by per-axis factors around the origin, one undoable step. The animation-safe alternative to multi-select resize (which can't reach animation offsets).
- "Link axes (uniform)" Switch, default on: X drives all three; re-linking collapses Y/Z onto X. Per-axis PreciseNumberInput min 0.0001. Apply disabled at 1×1×1. Toast on apply. Local state resets to 1 on close.

### 1.5 About dialog (+ first-run behavior)

**UI paths:** burger menu → "About" (desktop + mobile); auto-opens on the very first app use.

- `src/ui/AboutDialog.tsx` (mounted once in `app.tsx:60`), `src/state/aboutStore.ts`.
- Content: "What is Flexo?" blurb + KSA store link + mods-folder install path; License (MIT, © 2026 Alex Sherwin); Asset attribution (redistribution license granted by Dean Hall / RocketWerkz — **legally load-bearing text**); Source section with custom GitHub SVG icon linking github.com/meow-sci/flexo.
- Desktop: centered auto-sized modal max-w-2xl max-h-[85vh]; phone: edge-to-edge `variant="cover"`.
- First-use: `showAboutOnFirstUse()` (`aboutStore.ts:50`) — opens once, marks `$aboutSeen` (`flexo:aboutSeen`, persisted) up-front for StrictMode idempotency. **Share-link launches suppress it** without marking seen (`suppressAboutFirstUse()` called from `src/main.tsx:56`) so the intro still greets the user on their next ordinary visit. Reset Everything wipes the flag → intro shows again.

### 1.6 Shortcuts/help entry (state only — overlay owned by hotkeys area)

`src/state/helpStore.ts` — `$helpOpen` atom + open/close/toggle. Opened from: global `?` hotkey (registry.ts:191-201, `useKey: true, ignoreModifiers: true` so layout-independent), desktop burger "Shortcuts", mobile burger "Shortcuts". The overlay itself (`src/ui/hotkeys/HelpDialog.tsx`) renders `HOTKEY_GROUPS` from the registry — single source of truth for bindings AND docs.

### 1.7 History (undo/redo jump list)

**UI path:** desktop top Toolbar → History icon button (left of the burger; disabled when no history) → popover `placement="bottom end"` w-56; mobile burger → "History" → bottom-sheet Modal (`variant="sheet"`). `src/ui/HistoryButton.tsx`; data from `$historyList` / `jumpToHistory(steps)` in `src/state/editorStore.ts`.

- Renders redo items above an accented "→ current" divider, undo items below; each row "Undo/Redo · description · detail"; clicking jumps N steps in one go and toasts. Controlled/uncontrolled dual-mode component (mobile passes isOpen/onOpenChange).

### 1.8 Build-ID mismatch check ("new version" flow)

`src/buildCheck.ts` + `src/ui/BuildIdMismatchDialog.tsx` (mounted in `src/main.tsx:84`, OUTSIDE `<App>` next to GlobalToastRegion).

- `checkBuildId()` runs at boot on prod only (skipped in dev): compares `VITE_BUILD_ID` (git commit hash via GitHub Action) with localStorage `flexo_build_id`, always writes the current one, sets `$buildMismatch` on change.
- Dialog: non-dismissable centered alertdialog "New version available" → "No thanks, I know what I'm doing" (dismiss) or "Reset everything" → nested ConfirmDialog with "Reset folder access grants (if any)" Switch → `nukeAndReload`.
- **Share-link launches skip the check entirely** (main.tsx:50-59) — deliberately leaves `flexo_build_id` untouched so the prompt still fires on the next ordinary visit.

### 1.9 Reset Everything ("nuke")

`src/ui/nukeAndReload.ts` — used by both the burger-menu reset and the build-mismatch dialog.

- `localStorage.clear()` + `sessionStorage.clear()` + enumerate & delete all IndexedDB databases **except `flexo-fs`** (the File System Access mod-folder grant — a machine-level capability preserved by default; deleted only when the "Reset folder access grants" switch is on), then `location.reload()` in a `finally`.
- Both entry points show a ConfirmDialog with the opt-in grants switch (state reset to false each time it opens).

### 1.10 Boot-time misc owned here (main.tsx / app.tsx glue)

- **Incompatible-project purge notice** (`app.tsx:42-53`): `consumeRemovedProjectsNotice()` → warning toast listing projects deleted by the boot-time schema purge (10 s timeout). The purge itself is projects-area; the notice surface is a toast.
- **Editor-aid undo wiring** (`main.tsx:21-34`): `registerEditorAidStores` bridges container/measurement stores into editorStore undo — a cross-store registration pattern v2 must keep (breaks undo of measurement/container edits if lost).
- **WorkspaceLoadProgress** (`src/ui/LoadProgress.tsx`, mounted app.tsx:138): bottom-center HUD panel, 1rem off the bottom, one progress bar per in-flight GLB/KTX2/HDR download from `$loadProgressStore` (`trackDownload` funnel; determinate when Content-Length known). Sibling `PreviewLoadProgress` overlays the Add-Part/SubPart preview panes. Likely also touched by viewport/shell agents; claimed here as an orphan-candidate so it cannot fall through.

---

## 2. UI surface map

| Surface                   | Kind                           | Mounts                                                | Positioning                                                                                                                  | Z / stacking     | Issues                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChainPalette              | floating non-modal card        | `app.tsx:145` (self-gates on `$chainSession`)         | desktop: `absolute left-3 top-16 w-[340px] max-h-[calc(100vh-8rem)]`; phone: bottom sheet `inset-x-2 bottom-20 max-h-[45vh]` | `z-30`           | Overlaps left-anchored FloatingEditorPanel cards (MeasurementEditor/ContainerEditor: `absolute left-3 top-1/2 z-10`, `FloatingEditorPanel.tsx:32-33`) — palette wins on z but can fully cover them; on phone both fight for the same bottom-sheet slot (`bottom-20`) |
| Chain ghost overlay       | 3D scene layer                 | `viewport.scene` (not `EditorScene.root`)             | n/a                                                                                                                          | renders in-scene | ghosts of hidden-layer seeds invisibly cloned (documented)                                                                                                                                                                                                           |
| Burger menu               | toolbar popover menu           | Toolbar (desktop) / MobileTopBar (phone)              | react-aria Popover portal, `bottom end`                                                                                      | portal top-layer | mixes a document action (Scale Everything) with app meta (Settings/About/Reset)                                                                                                                                                                                      |
| SettingsModal             | centered modal dialog          | rendered by both SettingsButton and MobileTopBar      | react-aria Modal portal, `variant="center"`                                                                                  | modal overlay    | single flat scroll; sections unrelated (viewport/connector/IVA/highlight/export)                                                                                                                                                                                     |
| ScaleEverythingDialog     | centered modal                 | same dual mounts                                      | Modal `variant="center"`                                                                                                     | modal overlay    | —                                                                                                                                                                                                                                                                    |
| AboutDialog               | centered modal / phone cover   | `app.tsx:60`                                          | Modal center vs `cover`                                                                                                      | modal overlay    | —                                                                                                                                                                                                                                                                    |
| HistoryButton popover     | popover (desktop)              | Toolbar                                               | Popover `bottom end` w-56, max-h-80 scroll                                                                                   | portal           | —                                                                                                                                                                                                                                                                    |
| History (mobile)          | bottom sheet modal             | MobileTopBar                                          | Modal `variant="sheet"`                                                                                                      | modal            | —                                                                                                                                                                                                                                                                    |
| Reset ConfirmDialog       | modal-over-menu                | SettingsButton / MobileTopBar / BuildIdMismatchDialog | kit ConfirmDialog                                                                                                            | modal            | modal-in-modal in build-mismatch flow (alertdialog → confirm)                                                                                                                                                                                                        |
| BuildIdMismatchDialog     | non-dismissable centered modal | `main.tsx:84` (outside App)                           | Modal center, `isDismissable={false}`                                                                                        | modal            | blocks everything at boot (intended)                                                                                                                                                                                                                                 |
| WorkspaceLoadProgress     | bottom-center HUD              | `app.tsx:138`                                         | fixed/absolute bottom-center                                                                                                 | below modals     | shares bottom-center band with TransformHud (`app.tsx:141`) and SeatViewBar (`app.tsx:111`)                                                                                                                                                                          |
| First-run About auto-open | modal                          | effect in AboutDialog                                 | —                                                                                                                            | —                | can race other boot toasts (purge notice)                                                                                                                                                                                                                            |

Stacking context note: everything modal goes through react-aria portals (top layer); the chain palette is NOT a portal — it's an absolutely-positioned div inside the app root at `z-30`, above the `z-10` floating editor panels and below portaled popovers/modals.

---

## 3. State & data flow

**Persisted (localStorage, all `flexo:*` keys, wiped by Reset Everything):**

- `flexo:chainDefaults` — module-private, last-used params per op kind; read DEFENSIVELY (`defaultOp` copies only keys existing on the hardcoded shape; `clampOp` sanitizes; corrupted blob degrades to hardcoded defaults — regression-tested). NOT a document format; NOT migrated (constitution).
- `flexo:connectorSettings`, `flexo:ivaSeatSettings`, `flexo:lightSettings`, `flexo:selectionHighlight`, `flexo:kittenTextureExport`, `flexo:modelImport`, `flexo:simulateGlass`, `flexo:showFpsCounter`, `flexo:aboutSeen`.
- `flexo_build_id` (note: underscore, not `flexo:` prefix — still caught by `localStorage.clear()`).

**Ephemeral:** `$chainSession` (never persisted, never in undo — Cancel is unconditionally safe), `$chainEval` (computed), `$aboutOpen`, `$helpOpen`, `$buildMismatch`, `$lightPreviewCount`, dialog open flags (React local state).

**Undo/redo:** chains participate exactly once — `applyActionChain` pushes ONE `pushUndo('action chain', detail)`. Chain session edits never push. `scaleEverything` = one undo step. Settings/About/History-jump don't push (History IS the undo UI: `$historyList` + `jumpToHistory`).

**Cross-store subscriptions:** `$chainEval = computed([$part, $chainSession])`; `EditorScene` calls `ChainPreviewLayer.refresh()` on `$chainEval` changes AND on SubPartObject build completion; three layer subscribes to `$connectorSettings`/`$ivaSeatSettings`/`$lightSettings`/`$selectionHighlight`/`$showFpsCounter`; `projectStore.applyProjectSnapshot` → `closeChain()` (projectStore.ts:287).

---

## 4. Pain points

1. **Stale plan headers mislead agents and humans.** `plans/ACTION_CHAINS_PLAN.md:1` claims "planned, not implemented" for a shipped feature. Several other plans carry per-phase status that only partially matches reality. Any v2 doc regime needs a single status convention.
2. **Left-edge floating-surface collisions.** ChainPalette (`left-3 top-16 z-30`) vs MeasurementEditor/ContainerEditor (`left-3 top-1/2 z-10` via FloatingEditorPanel) — simultaneous open is visually broken-ish; on phones all three become `bottom-20` sheets that stack over the inspector FAB. A mode-based v2 with a real left sidebar naturally absorbs the palette.
3. **"Settings" is scattered.** The Settings modal holds 5 unrelated sections; light-viz settings live in the View menu; import settings live inside ImportModelDialog; glass simulation lives in the texturing UI. Defensible per-feature, but there is no single "preferences" surface, and the modal is one flat unstructured scroll (`SettingsButton.tsx:58-160`).
4. **Burger menu mixes tiers.** A destructive document transform (Scale Everything), app preferences, help, about, and a data-nuke all share one 6-item menu. In a v2 menubar these belong to different top-level menus (Edit vs App/Help).
5. **SettingsModal + ScaleEverythingDialog are mounted twice** (SettingsButton for desktop, MobileTopBar for phone) with duplicated open-state plumbing and duplicated menu-item lists (`SettingsButton.tsx:222-242` vs `MobileTopBar.tsx:85-116`). The reset ConfirmDialog is also duplicated (3 sites incl. BuildIdMismatchDialog). Menu content should be data, rendered once.
6. **The chain palette is not draggable and not resizable**, fixed 340px, and its command list + step cards + footer share one 45vh/100vh-8rem scroll — a long chain buries the search box's command list (mitigated by hide-when-steps-exist, but discoverability of adding a _second_ step type via search-only is weak).
7. **`mod+K` is toggle-with-side-effects:** if the palette is open and the user hits ⌘K intending "command palette" muscle memory, it silently cancels the session (step list lost; only field values persist via chainDefaults). No confirm on discard of a multi-step chain.
8. **Chain button visibility is misleading:** SelectionToolbar shows "Chain" for ANY selection (connectors, kittens…) and lets the guard toast reject it (`SelectionToolbar.tsx:75-77` comment admits this). Fine as a toast, but reads as a bug to users.
9. **HistoryButton disabled-state quirk:** desktop button disables only when `historyList` is empty, but the list includes only ±N entries; long sessions rely on `$historyList` cap behavior in editorStore (fine today, worth re-checking in v2).
10. **First-run About vs boot toasts race** — both fire on first paint; on a small screen the About cover hides the "removed incompatible projects" toast until dismissed (10 s timeout may expire unseen).
11. **Native `<input type=color>`** in HighlightRow (`SettingsButton.tsx:184-190`) — inconsistent with the kit; FEATURE_TODOS already asks for react-aria ColorPicker with alpha.
12. **`nextChainInstanceId` vs `duplicateSelected` divergence** is intentional but means two id-generation behaviors coexist; the duplicate-path collision quirk remains unfixed by choice (`editorStore.ts:1780-1798`).

---

## 5. Invariants & constraints (MUST survive v2)

- **Chains are editor-only — no KSA game contract, no scope/ entry.** Chain output must remain indistinguishable from hand placement at export.
- **`count` = TOTAL including the original**; array counts clamp ≥ 2. Radial default axis 'x' (KSA nose axis). Full-circle angle step `sweep/count`, partial `sweep/(count−1)`.
- **Linear array iterated-delta semantics** + quaternion accumulation by multiplication (Euler angles don't scale; test-pinned). `k=0` short-circuits to exact identity (no re-canonicalized rotations committed for unmoved seeds).
- **Scale strictly positive** (0.01 floor) — mirror must stay unreachable (KSA back-face culls negative-scale placements).
- **Engine caps:** MAX_ARRAY_COUNT 500, MAX_CHAIN_INSTANCES 2000, PREVIEW_MAX_GHOSTS 500 (preview cap must NOT limit Apply).
- **One undo entry per applied chain; session never in undo; Cancel unconditionally safe; document untouched until Apply.**
- **Seeds frozen at open by instanceId, resolved live against `$part`** — the nudge-a-seed-and-watch-it-reflow behavior is the feature's soul; a modal v2 palette would destroy it. Non-modality (orbits, gizmo, rotate/nudge keys, undo all live while open) is load-bearing.
- **All chain math routed through `bulkTransform.ts`** so chains can never disagree with the gizmo/transform panel about Euler order ('ZYX') or smart-scale semantics.
- **`nextChainInstanceId` collision-skip** (app id convention `<lastDotSegmentLower>_<n>`); clones carry no references.
- **Numeric inputs:** every numeric field here uses `PreciseNumberInput`/`Vec3Field` (useNumberDraft + inputMode="url"); Escape-reverts-dirty-field-first convention; arrow-step units (0.1 m / 15° / ×0.1; Shift ×10, Alt ×0.1). Mandatory project-wide.
- **No data migration:** `flexo:chainDefaults` and every settings blob are read defensively (unknown/malformed fields → hardcoded defaults; `lightSettings()` field-defaulting pattern); never write conversion code.
- **`nukeAndReload` must preserve the `flexo-fs` IndexedDB grant by default** (opt-in switch to also wipe it).
- **Build check prod-only; share-link launches skip build check AND About auto-open without consuming either flag** (main.tsx:50-59).
- **About dialog attribution text** (RocketWerkz/Dean Hall asset redistribution license, MIT notice) is legally required content.
- **Kitten texture 'reference' mode** depends on .NET Path.Combine treating rooted paths as absolute — the contentCorePath setting and its caption must survive.
- **Reset intro behavior:** clearing storage re-triggers first-run About (aboutSeen is a `flexo:` key).
- **`registerEditorAidStores` wiring order** (before hydrateProjectOnBoot) for container/measurement undo.

---

## 6. Hotkeys registered by this area

| Key         | Scope                                                                             | Effect                                                             | Where                                |
| ----------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| `mod+K`     | global (registry, shared preventDefault)                                          | `toggleChainPalette()` — open over selection / cancel open session | `src/ui/hotkeys/registry.ts:160-168` |
| `mod+Enter` | ChainPalette-local, `enableOnFormTags`, preventDefault, enabled only with session | Apply chain                                                        | `ChainPalette.tsx:68-72`             |
| `Escape`    | ChainPalette-local, NO preventDefault, enabled only with session                  | Cancel session (after useNumberDraft's dirty-field revert)         | `ChainPalette.tsx:75`                |
| `?`         | global, `useKey:true, ignoreModifiers:true`                                       | `toggleHelp()` — shortcuts overlay                                 | `registry.ts:190-201`                |

(Undo/redo/copy/paste/delete, rotate W/S/A/D/Q/E + R + F/⇧F, nudge arrows, Escape-exit-seat-view are in the same registry but belong to selection/transform + hotkeys areas.)

---

## 7. Cross-area dependencies

**This area calls into others:**

- editorStore (selection/transform area): `$part`, `$selectedIndices`, `applyActionChain`, `pushUndo`, `setSelectedPlacements`, `$historyList`/`jumpToHistory`/`undo`/`redo`, `scaleEverything`.
- layerStore: `isLayerLocked` open guard.
- three/bulkTransform (viewport area): all chain math primitives; `coords.applyPlacement` for ghosts; Viewport/EditorScene own ChainPreviewLayer lifecycle + refresh triggers.
- ui-kit: Modal/Dialog/Menu/Popover/ConfirmDialog/Switch/Select/Slider/toast/GridList/SearchField; `keyLabel` from hotkeys/keyDisplay.
- helpStore ↔ hotkeys area's HelpDialog.

**Others call into this area:**

- SelectionToolbar renders the Chain button (`toggleChainPalette`).
- Toolbar + MobileTopBar mount SettingsButton/SettingsModal/ScaleEverythingDialog/HistoryButton and the About/Shortcuts/Reset menu items.
- projectStore closes chain sessions on project load; main.tsx boot sequence calls checkBuildId/suppressAboutFirstUse.
- three layer (Viewport, ConnectorObject, IvaSeatObject, LightObject, highlight shaders) subscribes to settingsStore atoms.
- ImportModelDialog / modExport / customAssetStore read `$modelImportSettings`, `$kittenTextureExport`, `$simulateGlass`.

---

## 8. Known backlog (open plans + TODOs the v2 design should absorb)

### From `plans/FEATURE_TODOS.md` (unchecked items, lines 137-155)

- Import built-in KSA animations (e.g. `CoreElectricalA_Prefab_SolarPanelB`) — does it map to flexo's animation model?
- Hotkeys for move/rotate/scale tool switching (must work in animation mode too).
- Mod export (zip + folder) should also include the project JSON.
- Can connectors join animation joints/poses? (Answered since: NO — true KSA limitation, verified in decomp; MeshPickerModal SubParts-only gate is correct. Treat as closed-won't-fix.)
- Stickers (probably needs a standalone code mod).
- Emissives "inanimate carbon rod" follow-up.
- Engine building with combustion type control (engines area largely landed; check with engines agent).
- react-aria ColorPicker (with alpha) for all color pickers.
- Separators render weird (ui-kit).
- Canvas flickers on window resize.
- Orient a part along a normal vector to a surface point (context-menu / mobile FAB idea; connectors too).
- prettyXml is janky (DOM-native rewrite, see "pebkac" reference).
- Part snapping; part overlap detection/warning; movement snaps; blueprint views.

### From `plans/ANIMATION_UX_CLEANUP_TODOS.md` (all 5 open; animation agent should co-own)

- Joint SubPart list → GridList with per-row trash button.
- "Attach selected" Select → Autocomplete (searchable, same styling).
- Click anywhere in a joint panel selects the joint.
- Draggable floating preview-slider toolbar while animation editing (default centered 0.5rem below top toolbar).
- Play button on the preview slider (real-speed once, reset to 0, honoring rest-pose snap).

### From `plans/FIX_CURRENT_GAPS_PLAN.md` (5117 review — current game-contract gaps, all OPEN)

- Q1: `<EVADoor SeatId>` attribute dropped on import→export (modeled child, passthrough doesn't cover it).
- Q2: `<IVASeat Id>` discarded/never emitted, now the EVADoor link target.
- Q3: clutter `<Collideable>` → `<CollisionType>` rename (docs-only).
- Q4: `validateEngines` parity with KSA's five new engine-wiring warnings (silent no-thrust failures).
- Older still-open scope items (per memory + scope/): geometry-template `<Collider>` passthrough, FuelPort UI, cartoon-moon LOD retune + `<LOD CastShadows>`, solid thrust-curve preview (T5.5, deliberately deferred ~200-line port).

### Whole plans not implemented

- **`plans/CALCULATORS_PLAN.md`** — NOT implemented (no Calculator code in src). Floating always-on-top Calculators window from the burger menu (mass-first: exact game formulas for tank/primitive/propellant mass from decomp; badged estimates for engines/batteries/solar/crew; one-click copy into Part Data fields; draggable like FloatingInspector, position persisted). Explicitly a review doc — catalog needs keep/cut decisions. **Directly relevant to v2 (a new top-level surface + burger-menu item).**
- **`plans/KSP_CRAFT_PLAN.md`** — planned, lives in sibling repo ksp2glb; not flexo v2 scope but referenced.
- `plans/PART_PREVIEW_THUMBS.md` + `plans/WIKI_PART_PREVIEW_PLAN.md` — build-adjacent mini-apps (dist/apps/partpreview + thumbnail capture); check with export/build agent whether landed; not main-app UI.
- `plans/CUSTOM_TEXTURES_PLAN.md` Phase 3 (ThinFilm heat-gated, PartModelDynamic-only) open; in-game A/B checks pending.
- `plans/IMPORT_MODELS.md` Phase 6 deferred (UASTC textures, verbatim atlas, glTF animation import); in-game verification pending.
- `plans/LIGHT_MANAGEMENT_PLAN.md` — phases 1–5 committed on `feature/light-management`; verify merge status.
- `plans/UPGRADE_PLAN_2026-07-24.md` Phase 8 (in-game verification) outstanding.
- `plans/FIX_EMISSIVES_BUG.md` — implemented but noted "uncommitted" at time of writing + a deliberately-unfixed export-accumulation papercut (§3).
- `plans/CLEANUP_LIGHTS_PLAN.md` — one-light-switch-per-Part model cleanup; status header has no DONE marker; the "unbounded PowerConsumer[] with per-consumer Light switch toggles" problem it describes is a real UX/contract debt — verify with part-data agent.

### Action-chain-specific v2 candidates (deliberate v1 exclusions, `docs/action-chains.md:239-254`)

Mirror via geometry (custom-mesh pipeline), non-placement seeds (connectors/colliders/lights/seats/kittens), named preset/macro library, Apply-time lock re-check, viewport pivot picking, draggable palette, drag-reorder steps, per-instance jitter, expression inputs, per-ghost labels.

---

## 9. Open questions for v2

1. **Where does the chain palette live in a mode-based UI?** Options: (a) keep as floating non-modal card (its live-document interplay REQUIRES non-modality); (b) a left-sidebar panel/mode ("Array/Chain mode") — solves the left-edge collisions and gives room for step reordering by drag; (c) a docked bottom panel. A modal is the one wrong answer.
2. **Should `mod+K` become a real global command palette** (actions: add part, open dialogs, run chain…) with "Action chain" as one command, vs staying chain-only? The name "command palette" and ⌘K muscle memory suggest yes; current binding would need a new home (⌘⇧K? "A"?) and a discard-confirm for open sessions.
3. **Single Preferences surface vs per-feature settings:** consolidate Settings modal + light-viz (View menu) + import settings + simulateGlass into one tabbed preferences dialog, or keep contextual placement? (Both defensible; current scatter is the worst of both.)
4. **Menubar mapping:** where do Scale Everything (Edit menu?), Reset Everything (App menu, danger zone?), History (Edit → History submenu vs status-bar widget?), About/Shortcuts (Help menu) land?
5. **Chain presets/macros:** absorb into v2 (named chains, maybe per-project persisted) or keep last-used-defaults only?
6. **Non-placement chain seeds:** worth the per-kind clone-rule surface (connector ids, pinned layers, owner frames) or keep placements-only?
7. **Build-mismatch UX:** keep the scary reset-or-dismiss modal, or move to a status-bar/toast notification tier in v2's notification system (the schema-version purge in projectStore already handles true incompatibility)?
8. **First-run experience:** keep auto-About, or replace with a proper onboarding/empty-state in the v2 shell (About then becomes pure Help-menu content)?
9. **Calculators plan:** in or out of v2 scope? If in, it's a floating always-on-top window that must layer above dialogs — a stacking tier v2's window manager must support explicitly.
10. **Orphan ownership to confirm with other agents:** WorkspaceLoadProgress/PreviewLoadProgress (this report vs shell/viewport), MeasureButton + measurement/container editors (assumed viewport/scene area — flagged because no other area names them explicitly), `docs/state-persistence.md` conventions doc.

## 10. Corrections to stale records

- Memory `project_action_chains_plan.md` and `plans/ACTION_CHAINS_PLAN.md` status header both say not implemented — **wrong; feature is shipped on main with docs and tests.** The plan's locked semantics (count=total, radial axis X, iterated linear delta, bulkTransform-composed engine) all match the shipped code exactly.
