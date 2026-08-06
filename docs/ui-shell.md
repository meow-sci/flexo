# UI Shell

The chrome around the 3D workspace: the docked layout, the five-mode machine, the command
registry that drives every menu and key, the status bar, the two floating windows, and the
phone adaptation. This is the flexo-internal reference; the binding design contract is
`plans/flexo_v2/design/foundation.md`, cited by section below.

The one idea worth carrying into every other section: **the shell is not the document.**
Mode, layout, status messages, notifications and window positions never enter `$part`, never
create an undo step, and a mode switch never touches the document, the selection, the camera,
the layer view state or the active layer.

## 1. Layout

`src/app.tsx` is the whole skeleton (foundation §1):

```
column( MenuBar, row( LeftSidebar, ViewportHost, RightSidebar ), TimelineDock?, StatusBar )
```

inside a single `fixed inset-0 flex flex-col`. Everything is a real flex sibling, so the
canvas cell gets exactly the remaining space and **the orbit center is the visible center** —
v1's click-through right panel is what made it not so. Two DOM stamps are contracts rather
than styling: `data-workspace-band` (the middle row; floating windows clamp to it) and
`data-viewport-cell` (the canvas cell).

### 1.1 Region rules

| Region | Size | Resize | Collapse | Persistence |
| --- | --- | --- | --- | --- |
| Menubar | content height (`text-xs` + 2 × `--bar-py` + 1px border ≈ 22px) | — | never | — |
| Status bar | the same recipe | — | never | — |
| Left sidebar | default **300px**, clamp **220–480** | drag the inner (right) edge | header chevron → width 0 + a `--rail-reopen-w` reopen tab; Window ▸ Left Sidebar; `⌥[` | `flexo:layout` → `left {width, collapsed}` |
| Right sidebar | default **340px**, clamp **260–640** | drag the inner (left) edge | same, on the right edge; `⌥]` | `right {width, collapsed}` |
| Timeline dock | default **220px**, clamp **120px–50vh** (`maxTimelineHeight()`) | drag the top edge | transport ⌄ → a 32px transport-only strip | `timeline {height, collapsed, hidden}` |
| Viewport host | the flex remainder; ≥ 240 × 180 guaranteed by the clamps | — | — | — |

Two independent timeline flags, deliberately: `hidden` is **Window ▸ Timeline** (unmount),
`collapsed` is the transport's ⌄ (stay mounted, 32px). Sidebar widths are per SIDE, not per
mode, so switching modes never moves the canvas edge. Resizing is one kit primitive,
`ResizeHandle` (pointer capture, orientation, min/max, `onChange`) — the four bespoke v1 drag
implementations are gone; `VerticalSplit` survives for in-dialog splits only. The canvas
resizes live off `Viewport`'s `ResizeObserver`.

### 1.2 Density tokens

Declared in `src/index.css` `@theme`:

| Token | Value | Used by |
| --- | --- | --- |
| `--bar-py` | `0.125rem` | menubar + status bar vertical padding |
| `--density-row-py` | `0.25rem` | sidebar list rows, menu items |
| `--density-panel-p` | `0.5rem` | sidebar section padding |
| `--density-gap` | `0.375rem` | control gaps in dense panels |
| `--rail-reopen-w` | `20px` | collapsed-sidebar reopen tabs |

Control sizes carry the rest: **`xs`** (`h-6`, `px-1.5`, `text-xs`) is the chrome tier — bars,
sidebars, status segments — and **`sm`** (`h-7`) stays the dialog and phone tier, where touch
targets matter. `xs` was added as a new tier rather than by restyling the existing `sm` call
sites. Type scale: `text-xs` everywhere in chrome, `text-sm` in dialog bodies, mono +
`tabular-nums` for ids and numbers. Axis colors are X = red / Y = green / Z = blue in the
gizmo, the status chips and the fields alike (`ui/status/axisColors.ts`).

### 1.3 The z-index ladder

`src/ui/kit/zIndex.ts` is the ONLY place a stacking value is written. **No literal z-index may
appear in feature code** — `src/ui/kit/zIndexLiterals.test.ts` enforces it.

```ts
export const z = {
  canvasOverlay: 10, // in-viewport: drop zone, marquee div, FPS panel, CSS2D host
  dock: 20,          // sidebar/timeline internals: resize handles, sticky headers
  float: 30,         // FloatingWindows (above both sidebars; intra-tier order from floatOrder)
  overlay: 50,       // kit Modal overlays
} as const;
```

Popovers, menus and tooltips are react-aria portals and sit above everything by portal order.
The status bar has no z-index at all: it is in flow. v1's `z-100` toast stacking layer is
gone, because there are no toasts.

## 2. Modes

### 2.1 The five

`src/state/modeStore.ts` — and its only import is `nanostores`. It knows about no feature
store; features register into it. That is what keeps the dependency pointing one way.

```ts
export type Mode = 'build' | 'animation' | 'data' | 'engine' | 'surface';
export type Tool = 'measure' | 'seat-view' | 'exhaust' | 'marquee' | 'member-paint' | 'pivot-pick';
```

`$mode` is **ephemeral and boots to `'build'`** on every reload: a mode is a task posture, not
a preference. `MODES` (id + label, in display order) is the one dataset the menubar switcher,
the status chip, the phone tab bar, the palette and the hotkey validator all render from.

| Mode | Right sidebar (primary) | Left sidebar (focus editor) |
| --- | --- | --- |
| **Build** | `outliner/OutlinerPanel` — layers, entities, Aids | `build/BuildFocusEditor` — per-kind inspector / multi-select / aid editor |
| **Animation** | `animation/AnimationSidebar` — clips, joint tree, easing, solar tracking | `animation/AnimationFocusEditor` — clip / joint / keyframe cards |
| **Data** | `data/DataNavigator` — scope list + validation strip | `data/DataScopeForm` — the scope's GameData sections |
| **Engine** | `engine/EngineNavigator` — scope, module tree, performance, issues, exhaust | `engine/ModuleEditor` — one module's fields |
| **Surface** | `surface/SurfaceSidebar` — mesh picker **and** the material/glow/UV editor (LOCKED) | `surface/SurfaceLeftPanel` — the selected-face card |

The rule a user learns once: **right = what exists, left = what you are focused on.** Surface
mode is the one sanctioned exception, and it is a locked design decision.

### 2.2 `setMode` is the single choreography point

No component ever sets other stores on a mode switch. `setMode(next, payload?)` runs, in order:

1. no-op if already in `next`;
2. the outgoing mode's **exit** hooks;
3. cancel the armed tool, unless its `ToolDef` says `survivesModeSwitch` and the new mode still
   allows it;
4. set `$mode`;
5. the incoming mode's **enter** hooks, with `payload`.

Hooks are registered by the area stores themselves — `registerModeHooks(mode, {onEnter, onExit})`
from `dataModeStore` / `engineStore` / `surfaceModeStore` / `animationStore` / the chain
module's `openChainPalette.ts`. Every hook runs inside try/catch, so a broken area hook can
never strand the UI between modes, and a re-entrant `setMode` from inside a hook is refused
with a console error rather than corrupting the sequence. `resetModeForProjectLoad()` is the
project-switch path: back to Build, tool slot cleared.

**What a switch changes, and only this:** the right sidebar body, the left sidebar ruleset,
the viewport affordance flags `EditorScene` reads off `$mode`, the hotkey scope set, the
timeline dock's mount, and the mode-specific status segments.

**What survives:** the selection (it is the cross-mode context — attach-to-joint,
define-engine-on-placement, data auto-targeting all depend on it), and each mode's own
sub-state, clamped against `$part`, so re-entering a mode puts you back where you were.

### 2.3 Transient tools

`$activeTool` is a **single slot**: arming one cancels the previous. A tool declares its rules
once via `registerTool(id, {allowedModes?, survivesModeSwitch?, onCancel?})` in the store that
owns its state. The six tenants, their owners and their status segments are tabulated in
[editor-state.md](./editor-state.md#the-transient-tools--one-slot-six-tenants).

A tool owns exactly three obligations: a status-bar segment, an Escape-ladder rung, and a
cancel-on-mode-switch hook. Tool parameter UI, when a tool needs it, renders at the **top of
the left sidebar** — never floating.

The **chain session** is deliberately NOT in the slot. It is a parallel, non-modal session
(measuring mid-chain is legitimate), Build-mode only, hosted in a floating window. See
[action-chains.md](./action-chains.md).

### 2.4 Cross-mode jumps

Navigation between features prefers a mode jump over a stacked overlay: the Outliner row
menu's "SubPart Data →" and "Edit Surface →", Add ▸ Define Engine…, Data mode's "Open in
Engine mode", the Asset Manager's "Edit surface →". A jump **closes** the dialog it came from
and carries a focus payload that the target mode's enter hook consumes — a jump, not a stack.

## 3. Commands and menus

Commands are data, and they are the ONLY way a feature exposes an action to the shell.

`src/state/commandStore.ts` holds the registry. A `Command` is a plain object:

```ts
interface Command {
  id: CommandId;                    // 'edit.undo', or a provider id 'layer:activate:<layerId>'
  title: string;
  menuPath?: string;                // palette subtitle + fuzzy-match text, e.g. 'View ▸ Camera Snap'
  keywords?: string;
  enabled?: () => boolean;          // store selector, evaluated on menu open / palette render
  disabledReason?: string;
  checked?: () => boolean;          // ✓ / ◉ state
  keepOpen?: boolean;               // palette ⌘↩ eligibility
  run: (params?: unknown) => void;
}
```

`registerCommand` **throws** on a duplicate id. Registration is a module-scope side effect of
importing `src/ui/commands/`, which `app.tsx` does once, before anything renders — the
menubar, the palette, the phone MenuSheet and the hotkey registry all resolve against it.
The modules are grouped by menu: `fileCommands` · `editCommands` · `addCommands` ·
`selectCommands` · `viewCommands` · `toolsCommands` · `windowCommands` · `helpCommands` ·
`modeCommands`, plus three palette-only groups with no menu home (`dataCommands`,
`surfaceCommands`, `animationCommands`).

**Dynamic providers** contribute factory-generated commands re-evaluated on menu open and
palette query. Ten are registered in `src/ui/commands/providers.ts`: `history`,
`layers.select`, `layers.activate`, `seats`, `customMeshInstances`, `projects`, `modsFolder`,
`data.scopeTemplate`, `surface.pickMesh`, `animation.openClip`.

`src/ui/menu/menuSpec.ts` is the ordered menu tree — **eight menus** (File, Edit, Add, Select,
View, Tools, Window, Help) built from five entry kinds (`command`, `checkbox`, `radio`,
`submenu`, `provider`, `separator`). Entries reference commands **by id only**; the title,
`enabled`, `checked` and the shortcut chip are all resolved at open time. One spec renders
three surfaces: the desktop menubar (`ui/shell/MenuBar.tsx` over the kit `MenuBar`), the
narrow-desktop and phone drill-down (`ui/menu/MenuDrillDown.tsx`), and the ⌘K palette
(`ui/palette/CommandPalette.tsx`). `src/ui/menu/menuSpec.test.ts` guards the tree against the
authoritative label list.

**Shortcut chips come from `chordsFor(commandId)`** (`ui/commands/chords.ts`) — one lookup
into the hotkey registry, falling back to `[['Escape']]` for an Escape-ladder rung. Menus, the
palette and the status bar's chord tooltips all call it, so a label can never drift from a
binding.

**Dialogs are opened by commands**, which write `dialogStore.$openDialog = {id, params}`;
`shell/DialogRoot.tsx` mounts the one dialog that id names. Twenty `DialogId`s exist, exactly
one may be open, and **stacking is banned** — a dialog that needs a second step uses the kit
`DialogViewStack` (a pushable `list → detail → confirm` stack with a back chevron; Escape pops
a view before dismissing) or an inline destructive strip on the row. That is what retired
v1's controlled/uncontrolled dual dialog APIs.

The menubar's right cluster carries the project chip (→ Projects…), the compact ↶ ↷ pair
(disabled off `$canUndo` / `$canRedo`, tooltip = the step label) and the ⌘K button. The mode
switcher is centered. Below ~900px the eight menus collapse into a single `☰` trigger
rendering the same spec.

For the design-time reference tree — every item, its shortcut and its enable rule — see
`plans/flexo_v2/design/FINAL_DESIGN_INDEX.md`.

## 4. Status bar and notifications

`src/ui/status/StatusBar.tsx` is one in-flow row, menubar height, `xs` controls. Segments hide
when empty; the three alignment groups never shift.

| Group | Segment | Component |
| --- | --- | --- |
| left | Mode chip (click → mini mode menu) | local to `StatusBar.tsx` |
| left | Active-layer chip — Build and Animation only | local to `StatusBar.tsx` |
| left | Data scope | `DataSegment.tsx` |
| left | Engine scope / blockers | `EngineSegment.tsx` |
| left | Surface mesh + face | `SurfaceSegment.tsx` |
| left | Armed tool: name, live instruction, inline controls | `ToolSegment.tsx` |
| left | Posed-placement lock (Animation) | `PosedLockSegment.tsx` |
| left | Selection readout: counts by kind + live bounds | `SelectionReadout.tsx` |
| center | Message channel (+ inline `[Undo]` / confirm strip) | `MessageChannel.tsx` |
| center | Aggregated download/export/import progress | `ProgressSegment.tsx` |
| right | Advisories (light-preview cap, mods-folder re-grant) | `AdvisoryChips.tsx` |
| right | Modifier hints — desktop only | `ModifierHints.tsx` |
| right | Rotate / nudge chips | `TransformChips.tsx` |
| right | Snap chip | `SnapChip.tsx` |
| right | FPS readout | `FpsSegment.tsx` |
| right | 🔔 bell + unread badge | `NotificationBell.tsx` |

Three `init*` wirings run at module scope in `app.tsx`, not in an effect, because the bar must
be truthful from the first paint and the subscriptions outlive every component:
`initToolStatusWiring()`, `initAdvisoryWiring()`, `initModifierHintProviders()`. All are
idempotent.

### 4.1 `toast()` is a facade

`src/ui/toast.ts` keeps its exact v1 imperative signature — `toast({title, description?,
variant?})` — so `EditorScene`, boot code and the nudge/rotate controls call it unmodified.
It routes:

| `variant` | Status channel | Notification center |
| --- | --- | --- |
| `default` | info, 4s | never enters |
| `success` | success, 4s | entry, **pre-read** |
| `warning` | warning, 8s | entry, unread |
| `danger` | danger, 10s | entry, unread + **sticky** |

One severity → duration table (`STATUS_DURATION` in `statusStore.ts`); a per-call `timeout` is
ignored with a dev warning. The status slot holds **one** message and a new one **overwrites**
— it never queues. There is a fifth tier with no `toast()` spelling: `notify({severity:
'rich', …})` writes a notification entry ONLY, with an expandable React body, for things like
the import report and the export summary.

### 4.2 The notification center

`notificationStore.ts` is a **session-only ring of 100** — notifications are news, not data, so
a reload starts empty and nothing about them is persisted. Overflow drops the oldest, sticky
entries included. Per-severity lifecycle defaults: `success` arrives read and non-sticky,
`warning` unread and non-sticky, `danger` and `rich` unread and sticky. `clearRead()` removes
read AND non-sticky entries only, so a failure cannot be swept away by a Clear.

A row is severity icon · title · a multi-line, never-truncated, copyable body · relative time ·
optional action buttons, which are `{label, commandId}` pairs — so a notification's actions go
through the same registry as everything else. Four commands exist only as notification actions
and appear in no menu: `project.retryAutosave`, `project.takeOver`, `app.reload`,
`app.resetEverything`.

## 5. Floating windows

The default answer for any new surface is **dock it**. A surface floats only if it must
overlay the viewport mid-gesture while both sidebars are occupied by mode content. Exactly
**two** ship.

`src/ui/kit/FloatingWindow.tsx` is the primitive:

- **Mount inside `[data-workspace-band]`.** Positions are band-absolute pixels, so a window
  clamps to the workspace by construction.
- **Chrome**: a 20px title strip carrying grip dots, the title and an optional close. The
  strip is the only drag handle; the body never drags.
- **Bounds**: never above the menubar's bottom edge, never below the status bar's top edge;
  ≥ 120px horizontally and the 28px strip always stay on screen (`floatClamp.ts`). Windows may
  overlap the timeline dock. Re-clamped on window and sidebar resize.
- **z-order**: all windows sit at `z.float` — above both sidebars, below dialogs and popovers.
  One stack (`layoutStore.floatOrder`, last = top); pointer-down raises.
- **Keyboard**: the strip is focusable; arrows move 8px, ⇧+arrows 32px.
- **Persistence**: only `{x, y}`, into `flexo:layout` → `float[id]`. Width and collapse are
  session-only. Window ▸ Reset Window Layout and Reset Everything clear them.
- Renders `null` on phone — each tenant declares its own phone variant.

| Window id | Contents | Default anchor | Phone |
| --- | --- | --- | --- |
| `toolbar` | Move / Rotate / Scale off `$effectiveToolMode`, the **W/L** gizmo-space toggle, the snap magnet + step popover. Visible whenever a gizmo target exists; hidden by Window ▸ Tool Bar (`floatHidden`) | top-center, 8px below the menubar | `ToolBarStrip` — a pinned strip above the condensed status bar |
| `chain` | The action-chain session, verbatim: search, command list, step cards, footer counts, `⌘↩` apply. Resizable 300–420px; `onClose` cancels the session (with the discard confirm at ≥1 step) | top-left, 8px in | a 50% non-blocking sheet, session intact across dismiss |

Selection ACTIONS — duplicate, chain, delete, change layer — are deliberately NOT on the Tool
bar. They are left-sidebar and Edit-menu material; the Tool bar holds gizmo *parameters* only.

## 6. Hotkeys

`src/ui/hotkeys/registry.ts` holds every binding in ONE table, `ALL_BINDINGS`. There are no
off-registry bindings: a pure-key behavior with no menu home carries a documented synthetic id
(prefixes `transform.`, `mirror.`, `anim.`, `timeline.`, plus `esc.ladder`, `chain.apply`,
`outliner.search`, `glowPaint.undo`, `glowPaint.redo`) so Help and the conflict validator still
see it.

```ts
type Scope = 'global' | 'viewport' | `mode:${Mode}` | `tool:${Tool}` | `surface:${SurfaceId}`;
```

A binding is enabled iff its scope string is in `hotkeyStore.$activeScopes`. The eight
`SurfaceId`s are `chain`, `palette`, `timeline`, `outliner`, `data-navigator`, `engine-tree`,
`members`, `glow-paint`.

- **global** — live unless typing. Overlay dialogs do NOT suppress global bindings; they DO
  suppress viewport scope. The `isTypingInField()` activeElement guard is preserved verbatim
  from v1 (the react-aria virtual-focus fix inside it is load-bearing), and it is applied
  through react-hotkeys-hook's `ignoreEventWhen` rather than `enabled`, because the library
  calls `preventDefault` before consulting `enabled`.
- **viewport** — live when no dialog is open, you are not typing, AND focus is not inside an
  interactive react-aria collection. This is the answer to "what happened to WASDQERF": the
  single-letter spatial keys stopped being document-global and became viewport-scoped,
  otherwise unchanged, in every mode.
- **mode:X / tool:X** — additive while that mode is active / that tool is armed.
- **surface:X** — active while that surface has focus. Formerly-local behaviors (the chain
  window's `⌘↩`, the timeline keys, the Outliner's `⌘F`) register here so Help stops drifting.
- **List-surface edit mirrors**: `surface:outliner`, `surface:data-navigator`,
  `surface:engine-tree` and `surface:members` each register mirror bindings for
  `⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I`, delegating to the identical edit/select commands. The collection-focus
  exclusion above exists only to keep BARE keys from fighting row navigation; the modifier
  chords were global in v1 and must keep working after range-selecting rows. A list's own `⌘A`
  keeps precedence.

**Precedence: surface > tool > mode > viewport > global** (`scopeRank` in `hotkeys/keys.ts`).
The conflict map is built once at module init by grouping bindings on normalized keys; at
event time a binding fires only if no higher-ranked binding on the same key is currently
active. `validateRegistry` enumerates every reachable scope set at dev time and in
`hotkeyRegistry.test.ts`.

### 6.1 The Escape ladder

Escape is **one** binding (`esc.ladder`, global, `preventDefault: false`,
`enableOnFormTags: true`) running an ordered ladder in `hotkeys/escLadder.ts`. Each rung fires
only if the previous did not; dispatch bails early on `event.defaultPrevented` (rung 1) and on
an open dialog (rung 2).

| Rung | What | Owner |
| --- | --- | --- |
| 1 | revert a dirty numeric field | the field itself |
| 2 | close the open menu, popover or dialog view/dialog | react-aria |
| 3 | close the command palette | `palette.close` |
| 4 | cancel the gizmo drag in flight | `gizmo.cancelDrag` — no `preventDefault` |
| 5 | cancel the armed tool (or the pivot tool) | `tool.cancel` — generic over `$activeTool` |
| 6 | cancel the action chain (confirm at ≥1 step) | `chain.cancel` — no `preventDefault`, works while typing |
| 7 | animation unwind: columns → pin → park → rest ⚓ → active joint | `anim.unwind` |
| 8 | leave IVA seat view | `seat.exit` — **never** `preventDefault`ed (v1 contract) |
| 9 | nothing | — |

Escape never clears the selection, and never leaves a mode. Rung 5 is fully generic: it runs
whichever `onCancel` the armed tool registered, so adding a tool needs no new rung.
`registerEscRung` throws on a duplicate rung number.

### 6.2 Help

`ui/hotkeys/HelpDialog.tsx` (`?`, Help ▸ Keyboard Shortcuts…) is **generated from the
registry**, grouped by scope in a fixed order built from `MODES` / `TOOLS` / `SURFACE_IDS` —
so no scope can exist without a Help title, and empty groups are simply dropped. Five
hand-authored sections follow: pointer & modifiers, numeric fields, the Escape ladder, the
command palette, the Outliner. Help never reads live scope state; it is documentation, not a
readout.

The rebind diff from v1 is two keys, and Help says so prominently for 30 days after a user's
first v2 Help open (`flexo:rebindNoticeSeen`, module-private to the dialog), then folds it
into a disclosure: **`F`** was the rotate-step key and is now Frame Selection (rotate step
moved to `[` / `]`), and **`⌘K`** was the action chain and is now the command palette (the
chain moved to `⇧⌘K`).

## 7. Phone (< 640px)

`useIsPhone()` matches `(max-width: 639px)` — Tailwind's `sm` boundary. Phone is a feature
set, not a fallback: every surface has a variant, built from shared primitives with no
bespoke forks.

| Primitive | File | Spec |
| --- | --- | --- |
| PhoneTopBar | `shell/phone/PhoneTopBar.tsx` | one slim row: `☰` · mode name · project chip · ↶ ↷ |
| MenuSheet | `shell/phone/MenuSheet.tsx` | `☰` opens the SAME `MENU_SPEC` as a drill-down sheet — zero parallel menu wiring, so no feature loses its phone path |
| ModeTabBar | `shell/phone/ModeTabBar.tsx` (pure) + `PhoneModeTabs.tsx` (wired) | bottom fixed bar, five tabs; tap switches, **re-tap the active tab opens its Panel sheet** |
| Sheet | `kit/Sheet.tsx` | the one bottom-sheet primitive: detents `50` / `92` (dvh), drag grabber, down-only drag-dismiss |
| Panel sheet | `shell/phone/PanelSheet.tsx` | hosts the right-sidebar body (`ModeSidebar`) at detent 92 |
| Inspector sheet | `shell/phone/InspectorSheet.tsx` | hosts the left-sidebar body (`ModeFocusEditor`), opened from a viewport-corner FAB |
| Timeline | `animation/PhoneTimelineSheet.tsx` | fullscreen sheet, opened from the docked transport chip |
| CondensedStatusBar | `shell/phone/CondensedStatusBar.tsx` | mode/tool chip · active-layer chip · message channel · 🔔. Modifier-hint and rotate/nudge segments are desktop-only — they are keyboard features |

`shell/phone/phoneSheets.ts` hoists the three sheet slots (`$panelSheetOpen`,
`$inspectorSheetOpen`, `$timelineSheetOpen`) so at most one can be open: each opener zeroes
the other two. Dialog mapping: size S stays a centered card, M and L become covers; stacked
views become pushed sheet views; popovers become sheets; the ⌘K palette becomes a fullscreen
sheet — which is the phone's only route to a command with no menu home.

The phone frame, top to bottom: PhoneTopBar · viewport (with the selection FAB) ·
`ToolBarStrip` · the Animation paint/transport chip · CondensedStatusBar · ModeTabBar.

## 8. Shell stores at a glance

| Store | Owns | Persisted |
| --- | --- | --- |
| `state/modeStore.ts` | `$mode`, `$activeTool`, `$marqueeRect`, `MODES`/`TOOLS`, `setMode`, `registerModeHooks`, `registerTool`, `armTool`/`disarmTool`, `resetModeForProjectLoad` | no |
| `state/layoutStore.ts` | `$layout` + `LAYOUT_DEFAULTS`, `SIDEBAR_CLAMPS`, `TIMELINE_MIN_HEIGHT`, `maxTimelineHeight()`, `sanitizeLayout`, the sidebar/timeline/float mutators, `resetLayout` | `flexo:layout` |
| `state/statusStore.ts` | `$statusMessage`, `$lastStatusMessage`, `$toolStatus`, `$statusConfirm`, `$fpsReport`, `$advisories`, `$progress`; `status()`, `setToolStatus()`, `trackJob()`, `undoStatusAction()` | no |
| `state/notificationStore.ts` | `$notifications`, `$unreadCount`, `$notificationCenterOpen`, `$notificationFocusId`; `notify()`, `dismiss()`, `markAllRead()`, `clearRead()` | no (session ring of 100) |
| `state/modifierStore.ts` | `$heldModifiers`, `$hoverContext`, `$modifierHints`; `initModifierListeners()`, `registerModifierHints()` | no |
| `state/commandStore.ts` | the command + provider registries, `runCommand`, `$paletteOpen`, `$paletteRecents` | `flexo:paletteRecents` |
| `state/dialogStore.ts` | `$openDialog` over 20 `DialogId`s; `openDialog` / `closeDialog` / `isDialogOpen` | no |
| `state/hotkeyStore.ts` | `$focusedSurface`, `$dialogOpen`, `$activeScopes`, `SURFACE_IDS` | no |
| `state/snapStore.ts` | `$snapEnabled`, `$snapTranslateStep`, `$snapRotateStep`; `applySnapToGizmo(invert)` | three flat keys |
| `state/projectIndexStore.ts` | the reactive project metadata index, current-project pointer, Web-Locks write lock, autosave health | IndexedDB + `flexo:currentProjectId` |

`toast()` and `notify()` stay imperative module functions callable outside React — boot code
and `EditorScene` depend on that. Every key above is inventoried in
[state-persistence.md](./state-persistence.md).

## 9. Rules for adding to the shell

These are the conventions the constitution ([AGENTS.md](../AGENTS.md), "UI design") enforces:

1. **Commands, not ad-hoc buttons.** A user-facing action registers in the command registry;
   the menubar, palette, phone sheet and hotkeys render from it.
2. **Dialogs open via `dialogStore.$openDialog`** and mount once in `DialogRoot`. No
   controlled/uncontrolled dual API, no trigger owning open state, no modal in a modal.
3. **No literal z-indexes** — use `src/ui/kit/zIndex.ts`.
4. **Transient feedback goes through `toast()`** into the status bar and notification center.
   Never render a bespoke floating surface; the default answer for any new surface is to dock
   it.
5. **Hotkeys register in the scoped registry**, never as raw `window` listeners, so Help and
   the conflict validator stay complete.
