# flexo v2 — THE FOUNDATION SPEC (binding)

Status: **LAW.** This document is the single shell contract for all six area designs.
It synthesizes foundation proposals A ("DCC conventions"), B ("web-native pragmatist") and
C ("IA purist") into one binding spec. Everything an area design needs about the shell is
inlined here — never cite the proposals. Where this spec is silent, the four IA laws (§0.2)
decide; where an area wants to deviate, it must escalate, not improvise.

All LOCKED decisions (DECISIONS.md) are honored verbatim. RULE ZERO is enforced by the
ledger in §16: every v1 feature has a named v2 home. The 12 analysis reports remain the
feature census of record for area-level detail.

---

## 0. Ground rules

### 0.1 Terminology (one vocabulary — menus, panels, dialogs, docs use it identically)

- **Project** — a saved workspace. **Part** — the exported KSA part. **SubPart** — a placed mesh.
- **Entity** — anything placeable: SubPart, connector, collider, IVA seat, light, kitten.
- **Asset** — a library item: custom texture, material, mesh, imported model batch.
- **Aid** — editor-only helper: measurement, reference line, reference container, kitten.
  KSA `<Tank>` feed targets are always "tanks / feed containers"; the 3D volumes are always
  "reference containers" and live under Aids. This kills the "container" naming trap.
- **Mode** — one of Build / Animation / Data / Engine / Surface.
- **Tool** — a transient pointer-claiming session inside a mode: measure, seat view,
  exhaust placement, box select. (A **chain session** is a parallel session, not a tool — §3.6.)
- **Shell** — the docked chrome: menubar, sidebars, status bar, timeline dock.
- **Surface** — any focusable region: viewport, a sidebar, a floating window, a dialog, the timeline.
- Renames that are now canonical: "SubPart Data" replaces "Manage Tanks" everywhere;
  "Surface editor" replaces "Manage Textures"; "Settings" replaces the burger's mixed menu.

### 0.2 The four IA laws (govern anything this spec does not pin down)

1. **Home-by-kind.** A control's home is decided by WHAT KIND of thing it is:
   command → menubar item; persistent preference (numeric/slider/choice) → Settings dialog;
   view toggle/radio → View menu; editor for the focused object → left sidebar;
   collection/navigator for the mode → right sidebar; rich one-off workflow → overlay dialog;
   transient feedback / progress / modifier hints → status bar; persistent-until-read
   feedback → notification center; live in-gesture controls over the 3D scene → floating window.
2. **≤2 clicks from the menubar.** Every command, dialog, panel and tool is reachable in at
   most menu → item or menu → submenu → item. The ⌘K palette indexes the whole tree.
3. **Right = what exists; left = what you're focused on.** Identical pairing in all five
   modes; a user learns it once. (One LOCKED exception: Surface mode's primary editor is the
   right sidebar — see §8.5.)
4. **Names never lie** (§0.1) and **menus are data**: one MenuSpec/command tree renders the
   desktop menubar, the phone MenuSheet, and the palette; shortcut chips render from the
   hotkey registry by commandId, so labels can never drift from bindings.

### 0.3 Synthesis decisions log (every A/B/C conflict, resolved)

| # | Conflict | Ruling | Rationale (one line) |
|---|---|---|---|
| S1 | Docked tool rail + viewport header (A) vs no new strips (B, C) | **No tool rail, no viewport header.** Gizmo switcher is a floating Tool bar (§6.2); view settings go to View menu + Settings | The brief itself names the "gizmo quick switcher" as the floating bar that earns its place, and asks for less chrome, not two new strips |
| S2 | Chain palette docked in left sidebar (A) vs floating window (B, C) | **Floating window**, gains drag handle + resize + discard-confirm | Keeps the left-sidebar inspector usable simultaneously — numeric seed nudging + live chain re-flow together is the feature's soul |
| S3 | Seat-view bar floats (A) vs status-bar tool segment (B, C) | **Status-bar tool segment** | Three small controls don't justify a window; the status bar is the designated home for transient-tool state |
| S4 | Mode hotkeys ⌥1–5 (A) vs 1–5 (B, C) | **Plain `1`–`5`** | Majority + zero-modifier reachability; tool cycling gets `T` instead (S5) |
| S5 | Tool-switch keys 1/2/3 (A) vs none (B) vs n/a (C) | **`T` / ⇧`T` cycles Move→Rotate→Scale** | Satisfies the FEATURE_TODOS ask without stealing digits from modes |
| S6 | Rotate-step rebind `[`/`]` (A) vs `G` (B) vs `T` (C) | **`[` smaller / `]` larger** | Bracket pair reads as smaller/larger; frees T for tools |
| S7 | Chain rebind ⇧⌘K (A, B) vs ⌘J (C) | **⇧⌘K** | Majority; adjacent to the old ⌘K muscle memory |
| S8 | WASDQER/arrows scope: viewport-wide (A) vs excl. Animation (B) vs Build+Animation only (C) | **Viewport scope, all modes** (§11.1) | Least muscle-memory change; the typing/focus guard already prevents form conflicts in Data/Engine/Surface |
| S9 | `$mode` persisted (C) vs ephemeral (A, B) | **Ephemeral; boots to Build** | Predictable cold start in the default mode; a mode is a task posture, not a preference |
| S10 | Transient tools single slot (A, C) vs independent flags (B) | **Single slot `$activeTool`** for pointer tools; **chain is NOT in the slot** (§3.6) | Formalizes mutual exclusion; chain must co-exist with measuring/orbiting (v1 behavior, load-bearing) |
| S11 | Tools canceled on mode switch (C) vs some survive (A, B) | **Seat view survives; measure/exhaust/marquee cancel; chain prompts** (§3.6) | Seat view is camera-only and mode-orthogonal; half-done picks surviving a context change confuses |
| S12 | App/burger menu exists (B) vs pure menus (A, C) | **No app menu.** Settings under Edit (⌘,); About/Shortcuts under Help; Reset inside Settings → Advanced | Kills the v1 burger's tier-mixing; one home per kind |
| S13 | Select menu exists (A) vs Select items under Edit (B, C) | **Dedicated Select menu** | Marquee/invert/by-layer are new locked features; a real menu makes them discoverable |
| S14 | History dialog (B) vs Edit ▸ History submenu (A, C) | **Edit ▸ History ▸ submenu jump list** | Lighter; ≤2 clicks; matches desktop convention |
| S15 | Snap UI in viewport header (A) vs floating gizmo bar (B) vs status chip (C) | **Tool bar (primary) + status-bar snap chip (mirror)** | Snap belongs next to the transform tools; the chip keeps state visible |
| S16 | Scene/lighting sliders in header popovers (A) vs View menu + Settings tabs (B, C) | **Toggles/radios in View menu; numerics/sliders in Settings; menu deep-links** | Law 1; no viewport header exists (S1) |
| S17 | Build right sidebar: tabs Assets/Layers (B) vs separate sections (C) vs unified outliner (A) | **Unified Outliner** — layer header rows w/ inline controls, entity rows beneath (§8.1) | Kills tab juggling (a brief complaint) and the popover-stack layer workflow in one structure |
| S18 | Engine mode: full designer right + issues left (A/B) vs navigator right + module editor left (C) | **Navigator right / module editor left** | Law 3 consistency; splits the 1806-line monolith along its natural seam |
| S19 | Surface mode editor left (C) vs right (A, B, LOCKED) | **Right sidebar = mesh picker + surface editor** (LOCKED text); left = face-focus card | DECISIONS #1 explicitly puts the material/glow/UV editor in the right sidebar |
| S20 | Timeline dock inside center column (B) vs full-width row (A, C) | **Full-width row above the status bar** | DECISIONS #5 wording, plus dopesheet tracks need horizontal room |
| S21 | Timeline empty-track click inserts keyframe (C) vs moves playhead (A) | **Click = move playhead; double-click = insert; `K` = insert at playhead** | Single-click insert is too accident-prone on a scrub surface |
| S22 | Dialog size S on phone: sheet (A/B) vs center (C) | **S stays center; M/L → cover** | Small confirms work as centered cards on phones; sheets are for panel content |
| S23 | Float positions in own windowStore (B) vs inside layoutStore (A, C) | **Inside `layoutStore`** (one persisted key incl. float positions + z-stack order) | Fewer stores, one Reset surface |
| S24 | Undo/redo buttons in menubar right cluster (C) vs menus only (A, B) | **Keep compact ↶ ↷ in the right cluster** | Preserves v1's one-click undo at ~40px cost |
| S25 | Command palette menu home: Window (A) vs Help (C) | **Help → "Search Commands… ⌘K"** | macOS Help-search analogue; palette is a discovery surface |
| S26 | Build-mismatch modal kept (B ledger) vs → notification (A, C) | **Sticky notification with [Reload] [Reset everything…] actions** | The schema-version purge already guards true incompatibility; the modal is scarier than reality |
| S27 | Add-entity commands from non-Build modes | **Entity items auto-switch to Build first; asset dialogs don't switch** | The result of "Add Light" must be visible/selected in the mode that can edit it |
| S28 | Measurements/containers lists: Tools-menu-toggled left card (B) vs right-sidebar Aids section (C) | **Build Outliner gets a collapsed "Aids" section**; active aid's editor takes the left focus slot | Always discoverable without a menu toggle; focus model stays pure |
| S29 | Glow paint as transient tool (A) vs dialog (B, C) | **Stays an overlay dialog** (paint canvas), opened from Surface mode | It's a self-contained canvas workflow, not a viewport pointer tool |
| S30 | Asset Manager shortcut ⌘⇧O (A) vs ⇧⌘A (C) | **⇧⌘A** | Mnemonic (Assets); ⌘O stays Projects |

---

## 1. Layout skeleton (desktop ≥ 640px)

Docked flex layout (LOCKED #2). Real flex siblings; the canvas cell gets exactly the
remaining space → **orbit center == visible center**. Deleted: the `pointer-events-none`
RightPanel shell + per-child opt-ins, the toolbar's `right-[19rem]` reservation and `lg:`
recentering hack, all `absolute left-3 top-1/2` floating-slot positioning.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MENUBAR (fixed slim, ~22px)                                                  │
├───────────┬──────────────────────────────────────────────────┬───────────────┤
│ LEFT      │                                                  │ RIGHT         │
│ SIDEBAR   │              VIEWPORT (flex-1)                   │ SIDEBAR       │
│ (focus    │   [floating windows clamp inside the             │ (mode         │
│  editor)  │    workspace band = rows 2+3]                    │  primary)     │
├───────────┴──────────────────────────────────────────────────┴───────────────┤
│ TIMELINE DOCK (full-width; Animation mode only)                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ STATUS BAR (fixed slim, ~22px)                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

DOM: `column( MenuBar, row( LeftSidebar, ViewportHost, RightSidebar ), TimelineDock?, StatusBar )`
inside `fixed inset-0 flex flex-col bg-canvas text-fg`.

**Canvas-overlays** — the only things still absolutely positioned, *inside* ViewportHost
(they are viewport furniture, not app chrome): the CSS2D label layer (measurement labels,
seat ordinals), the ViewportDropZone dashed drop affordance (wraps the canvas cell only),
the stats.js FPS panel (imperative DOM; still flips the render loop continuous), and the
new marquee rectangle div. `Viewport`'s existing ResizeObserver handles all host resizes —
**no three-layer change** beyond re-parenting ViewportCanvas into the cell.

### 1.1 Region rules

| Region | Size | Resize | Collapse | Persistence |
|---|---|---|---|---|
| Menubar | content height: `text-xs` + 2 × `--bar-py` (0.125rem) + 1px border ≈ 22px | — | never | — |
| Status bar | identical recipe | — | never | — |
| Left sidebar | default **300px**, clamp 220–480 | drag inner (right) edge; 2px visual / 8px hit strip | chevron in its header → width 0 + a 20px reopen tab hugging the viewport's left edge; also Window menu / `⌥[` | `flexo:layout` → `left {width, collapsed}` |
| Right sidebar | default **340px**, clamp 260–640 | drag inner (left) edge | same, reopen tab on right edge; `⌥]` | `right {width, collapsed}` |
| Timeline dock | default **220px** tall, clamp 120px–50vh | drag top edge | collapse button in transport → 32px transport-only strip; Window → Timeline | `timeline {height, collapsed}` |
| ViewportHost | flex remainder; min 240×180 guaranteed by the clamps | — | — | — |

- Sidebar widths are **per side, not per mode** — switching modes never moves the canvas edge.
- Collapse/resize is instant (no animation > 120ms); the canvas resizes live (on-demand loop
  invalidates via the ResizeObserver).
- Resize implementation: ONE kit primitive `ResizeHandle` (pointer capture, orientation,
  min/max, onChange), extracted from the current RightPanel implementation. It replaces the
  four bespoke drag implementations (RightPanel handle, FloatingInspector drag,
  FloatingPreviewToolbar drag; `VerticalSplit` survives for in-dialog splits only).
- The viewport host keeps `tabIndex={-1}` + focus-on-pointerdown (load-bearing for arrow
  nudges). The `.glb` drop zone wraps only the canvas cell, as today.

### 1.2 Density & typography tokens (in `src/index.css @theme`)

| Token | Value | Used by |
|---|---|---|
| `--bar-py` | 0.125rem | menubar + status bar vertical padding (the brief's slim-bar mandate) |
| `--density-row-py` | 0.25rem | sidebar list rows, menu items |
| `--density-panel-p` | 0.5rem | sidebar section padding |
| `--density-gap` | 0.375rem | control gaps in dense panels |
| control size `xs` | h-6, px-1.5/px-2, text-xs | NEW size on Button / ToggleButton / inputStyles — bars + sidebars |
| control size `sm` | h-7 (unchanged) | dialogs and all phone surfaces (touch targets) |
| `--rail-reopen-w` | 20px | collapsed-sidebar reopen tabs |

- Sidebars: `xs` controls, `text-xs` labels, dense rows, separation via 1px borders + small
  padding. Dialogs stay `sm`/`md`. Dark-only theme stays (constitution); densify via tokens,
  no sweeping restyle of existing `sm` call sites (additive `xs` tier).
- Type scale: `text-xs` in all chrome; `text-sm` in dialog bodies; mono for ids/XML/numbers
  (`tabular-nums` in readouts); SectionTitle stays the 11px uppercase tracking-wide style.
- Axis colors X=red / Y=green / Z=blue everywhere (gizmo ↔ status chips ↔ fields).
- The duplicated floating-card chrome string becomes one kit export `panelChrome`.

### 1.3 z-index token ladder (single file `src/ui/kit/zIndex.ts`; NO literal z-indexes in feature code)

```
z.canvasOverlay = 10   // in-viewport: drop zone, marquee, FPS panel, CSS2D host
z.dock          = 20   // sidebar/timeline internals (resize handles, sticky headers)
z.float         = 30   // FloatingWindows (above BOTH sidebars — brief requirement);
                       //   stack order within the tier from layoutStore.floatOrder
z.overlay       = 50   // kit Modal overlays (dialogs)
popovers/menus/tooltips: react-aria portals — above everything, portal order
```

The toast stacking layer (v1 z-100) is **deleted**: transient feedback renders in-flow in
the status bar; notifications live in a popover. Nothing outranks dialogs except popovers.

---

## 2. The mode machine

### 2.1 The five modes (LOCKED #1)

`$mode: 'build' | 'animation' | 'data' | 'engine' | 'surface'` in the new `modeStore`.
**Ephemeral — boots to `build`** (S9). Mode-local sub-state survives switches (§2.4).

| Mode | Right sidebar (primary) | Left sidebar (focus editor) | Viewport specials | Timeline | Added hotkey scope |
|---|---|---|---|---|---|
| **Build** (default) | Outliner: layers + entities + Aids (§8.1) | selection inspector / multi-select panel / aid editor (§7.1) | gizmo, marquee, ⌥-drag duplicate, drop-to-import | — | — |
| **Animation** | Clips + Joint tree + Easing (§8.2) | selected joint/keyframe details, pose editor, pivot tools (§7.2) | pose gizmo, pivot marker, motion trajectories | **docked** | `mode:animation` |
| **Data** | Part root + SubPart-template navigator; data-capable normal, non-capable disabled-style (§8.3) | GameData forms for the selected scope (§7.3) | placements of the selected template highlighted; "Select in 3D" works live | — | `mode:data` |
| **Engine** | Engine select + module tree + performance + validation + exhaust chips (§8.4) | selected module's field editor (§7.4) | amber/cyan nozzle exhaust handles, exhaust gizmo (Scale→Move clamp) | — | `mode:engine` |
| **Surface** | Mesh picker + material/glow/UV editor (LOCKED; §8.5) | selected-face card + selection inspector (§7.5) | selected-face highlighting | — | `mode:surface` |

### 2.2 Mode switcher

A **segmented control centered in the menubar** row:
`[⬚ Build] [▶ Animation] [☰ Data] [🚀 Engine] [◧ Surface]`
- Hotkeys `1`–`5` (global scope, suppressed while typing). Palette lists "Go to X mode".
- Labels drop to icons below ~1100px viewport width.
- Each segment may show a small attention dot (Engine: validation blockers; Animation:
  draft clips) — data provided by the area stores.
- The status bar's first segment mirrors the active mode (§5), so posture is always visible.
- Phone: the same five entries are the bottom ModeTabBar (§12).

### 2.3 What switching a mode changes — and only this

All derived from `$mode`; enter/exit choreography lives in **`modeStore.setMode` — the
single choreography point** (no component ever sets other stores on switch):

1. Right sidebar body (full swap).
2. Left sidebar ruleset (what "focus" means in this mode).
3. Viewport affordance flags (pose gizmo/pivot marker/trajectories · nozzle handles ·
   face highlight · data-scope highlight); `EditorScene` re-points its existing
   `$inspectorMode` subscriptions at `$mode` — same semantics, new atom.
4. Hotkey scope set (§11).
5. Timeline dock mount (Animation only).
6. Mode-specific status-bar segments (active-layer chip is Build/Animation-only, etc.).

**Never touched**: the document, `$part`, undo history, the selection, camera, layer view
state, active layer. Mode switches are never undo steps.

### 2.4 Mode entry/exit invariants

- **Selection survives every mode switch.** It is the cross-mode context (attach-to-joint,
  define-engine-on-placement, data auto-targeting). Each mode filters what it *acts* on.
  Selection clamping rules (locked layers, undo) are unchanged.
- **Per-mode sub-state survives** (ephemeral, clamped against `$part`): active
  clip/joint/keyframe, active engine entry + nozzle ref, active data scope, picked surface
  mesh. Re-entering a mode restores where you were (mirrors today's engineStore behavior).
- **Leaving Animation**: end posing (`$editKeyframeId = null`), stop playback, end scrub
  (spring back to the modeled rest pose), detach pose gizmo, hide pivot marker +
  trajectories. `$activeAnimationId`/`$activeJointId` survive for return. Timeline unmounts.
- **Entering Animation**: preview gating on; last-active clip restored; no clips → right
  sidebar shows the create-clip empty state; selection containing joint members reveals
  their joints in the tree.
- **Leaving Engine**: disarm exhaust placement, dispose nozzle handles (hidden-but-pickable
  steals clicks — census invariant). Active engine entry retained.
- **Leaving Surface**: clear face highlight; GlowPaintDialog (if open) closes via its
  normal cancel semantics; picked mesh retained for return.
- **Entering Data** — scope ladder, first hit wins: (1) a cross-mode jump payload
  ("SubPart Data →") always wins; (2) else restore the surviving `$dataScope` (clamped
  against `$part`; stale template → next rung); (3) else selection contains a SubPart →
  that template's scope; (4) else Part scope. Data entry also fires
  `ensureReactionsLoaded()` — a sanctioned entry effect (read-only catalog preload,
  side-effect-free w.r.t. the document).
  **Entering Surface** with a custom-mesh placement selected → that mesh picked; else the
  picker's empty state ("Pick a mesh").
- **Build**: no other entry/exit effects. **Data**: no effects beyond the scope ladder +
  reactions preload above.
- **Project load/switch**: mode resets to Build, `$activeTool` cleared, chain session
  closed (existing projectStore contract), dialogs closed.

### 2.5 Cross-mode jumps ("jump with context" convention)

Cross-feature navigation prefers mode-jumps over stacked overlays: Outliner row menu
"SubPart Data →" switches to Data mode scoped to that template; "Edit Surface →" switches
to Surface mode with that mesh picked; Add ▸ Define Engine… switches to Engine mode
focusing the new-engine picker; Data mode's engine section header links "Open in Engine
mode"; Asset Manager's "Edit surface →" closes the dialog and jumps. A jump closes the
dialog it came from — a jump, not a stack.

### 2.6 Transient tools — layered ON TOP of modes, never modes

`$activeTool: null | 'measure' | 'seat-view' | 'exhaust' | 'marquee' | 'member-paint' |
'pivot-pick'` — a **single slot**; arming one cancels the previous (formalizes today's
ad-hoc OR of suppression flags; the per-tool gizmo-detach + pick-suppression semantics
are preserved exactly). `member-paint` and `pivot-pick` are Animation-mode contributions
(animation design D2/§7.4/§9.4) folded into this table so the Esc-rung / status-segment /
cancel-on-mode-switch obligations are visible in one place.

| Tool | Allowed modes | Armed from | On mode switch | Status-bar tool segment | Esc |
|---|---|---|---|---|---|
| Measure point-to-point | all | Tools menu / `M` / palette | **cancels** (incl. half-placed pick) | `Measure — click first point · Esc cancels` → `…second point` | cancel pick → disarm |
| Seat view | all | seat inspector "Sit" / Tools ▸ Sit in Seat ▸ / Outliner row | **survives** (camera-only, mode-orthogonal; exits only via Esc / Exit / seat deletion / project switch) | `Seat 2 / 4 · [◀][▶] · [Exit Esc]` (interactive; wraps document order, mirrors game C-key; honesty tooltip kept) | exit |
| Exhaust placement | Engine only | Engine sidebar toggle / handle click | auto-off on leaving Engine | `Exhaust: NozzleB #2 · FX` | disarm |
| Box select (marquee) | all | `B` / Select menu / ⇧-drag gesture (§14.1) | one-shot; n/a | `Box select — drag to select` | disarm |
| Member paint | Animation only | Members view 🖌 toggle / palette | auto-off on leaving Animation | `Paint members → <joint> · click SubParts to toggle · Esc done` | disarm |
| Pivot pick | Animation only | Joint card "pick in 3D…" / working-pivot "Pick point…" | auto-off on leaving Animation | `Pick pivot point — click a surface · Esc cancels` | disarm |

Tool parameter UI (when a tool needs one) renders at the **top of the left sidebar**,
never floating. Each tool owns: a status segment, an Esc-ladder rung (§11.4), and a
cancel-on-mode-switch hook.

**Chain session** (`$chainSession`) is deliberately **not** in the tool slot: it is a
parallel, non-modal session (LOCKED: live seed-nudge re-flow is load-bearing) hosted in a
floating window (§6.2). It co-exists with any tool (measuring mid-chain is legitimate).
Build mode only; switching modes with ≥1 step prompts the discard-confirm (LOCKED); an
empty session closes silently. `⇧⌘K` from another mode switches to Build first, then opens
(guards unchanged: SubPart seeds only, locked-layer refusal toast).

---

## 3. Menubar — complete tree

Layout:
`[File] [Edit] [Add] [Select] [View] [Tools] [Window] [Help] ··center·· [mode switcher] ··right·· [project chip ▾] [↶] [↷] [⌘K]`

- Built from react-aria MenuTrigger/Menu via a new kit `MenuBar` wrapper (horizontal bar,
  hover-slide-across-open-menus, `--bar-py` density, `xs` triggers).
- Right cluster: **project chip** (truncated 20ch; click → Projects… dialog), compact
  **undo/redo** icon buttons (disabled off `$canUndo/$canRedo`; tooltip = step label),
  **⌘K** palette icon. Nothing else — the menubar is otherwise pure menus. No burger menu.
- Below ~900px viewport width the eight menus collapse into a single `☰ Menu` trigger
  rendering the same MenuSpec as a drill-down (identical to the phone MenuSheet).
- **Menus are data** (Law 4): one MenuSpec tree (ids, labels, groups, `commandId`, enabled
  predicate, checked selector) renders the menubar, the MenuSheet, and feeds the palette.
  Enabled/checked predicates are store selectors evaluated on open. This retires every
  controlled/uncontrolled dual dialog API and the undo-toast-string-built-in-four-places
  problem. Disabled items stay **visible** (discoverability) with tooltip reasons where
  non-obvious; capability-dependent dynamic items (Custom Mesh Instances ▸, mods-folder
  rows) may hide/relabel.

Legend: `…`/`→D` opens a dialog · `→M` switches mode · `▸` submenu · `✓` checkbox ·
`◉` radio group · `(t)` arms a transient tool · plain = instant. Disabled rules in brackets.

### File
```
New Project                          !    create + switch (uniqueProjectName; autosave covers the old)
Projects…                     ⌘O    →D   Project Manager (§10.2)
Rename Project…                     →D   small dialog; collision → auto-suffix, never clobber (fixes v1 silent overwrite)
──────────────
Import Project…                     →D   file picker (.flexo.tar.gz / .flexo.json) + paste area;
                                          destination radio: (•) Merge into current project — ADDITIVE,
                                          ONE undo step (mergeProjectImport semantics verbatim; default)
                                          / ( ) Open as new project (projects design §4.3)
Export Project Archive…             →D   .tar.gz = project.json + all asset binaries (LOCKED #3;
                                          replaces the JSON snippet, hasCustomAssets gate REMOVED)
Share Link…                         →D   asset-less flow unchanged; with binary assets the dialog
                                          explains and offers "Export archive instead" (item stays enabled)
──────────────
Export to KSA…                ⌘E    →D   Export dialog (§10.6)
Mods Folder ▸                        ▸    status row (✓ "mods" / needs re-grant / not set / unsupported — disabled info row)
                                          · Choose Folder…  ! · Re-grant Access ! [only when needs-permission]
                                          · Forget Folder…  ! (confirm) [only when set]
```
No Save item — autosave-only stays. `⌘S` is a registered no-op flashing "Autosaved ✓"
in the status bar (DCC muscle-memory reassurance).

### Edit
```
Undo <step label>             ⌘Z    !    [dis: !$canUndo]
Redo <step label>       ⇧⌘Z / ⌘Y   !    [dis: !$canRedo]
History ▸                            ▸    jump list: redo rows above "→ current", undo rows below;
                                          click = multi-step jumpToHistory (replaces HistoryButton)
──────────────
Cut                           ⌘X    !    copy + delete (new trivial composite)   [dis: no selection]
Copy                          ⌘C    !    [dis: no selection] — lights join the clipboard (fixes census gap)
Paste                         ⌘V    !    [dis: clipboard empty] — paste in place, ids regenerated
Duplicate                     ⌘D    !    duplicate-with-offset: copies land offset by the nudge step on
                                          the active nudge axis (LOCKED: never invisibly stacked)
Delete                        ⌫     !    [dis: no selection] — confirm policy §14.3
──────────────
Begin Action Chain…          ⇧⌘K    !    switches to Build if needed; opens the chain window over the
                                          selection (guards + toasts unchanged)  [dis: no SubPart selected]
Scale Everything…                   →D   unchanged semantics (placements + keyframes, one undo step)
──────────────
Settings…                     ⌘,    →D   tabbed Settings dialog (§10.7)
```

### Add
Every entity item lands on the **active layer at origin** (KSA defaults preserved),
selects the result and reveals it in the Outliner; entity items auto-switch to Build mode
first (S27). Asset dialogs open in place.
```
SubPart…                             →D   SubPart browser (cover; §10.10)
Built-in Part…                       →D   Part browser (destination-layer select unchanged)
──────────────
Connector                            !
Collider ▸                           ▸    Box / Sphere / Cylinder / Capsule
                                          ── Fit to Selection ▸ same shapes [dis: no selection]
                                             (intent atom → scene, unchanged — fitting needs world geometry)
IVA Seat                             !
Light ▸                              ▸    Spot / Point  (+ select + reveal)
Kitten ▸                             ▸    Hunter / Polaris / Banjo
──────────────
Primitive Mesh…                      →D   CreateMeshDialog
Import Model…                        →D   Import Review at its drop step (viewport drag-drop unchanged)
Custom Mesh Instances ▸              ▸    dynamic re-place list (hidden when none; kitten meshes excluded)
Upload Texture…                      →D   CustomTextureDialog
New Material…                        →D   MaterialDialog
──────────────
Make Kitten Mesh ▸                   ▸    Hunter / Polaris / Banjo
──────────────
Define Engine…                       →M   switches to Engine mode, focuses the new-engine picker
```

### Select
```
All                           ⌘A    !    every entity on listed + unlocked layers (viewport scope)
Deselect                     ⌥⌘A    !
Invert                       ⇧⌘I    !
All in Active Layer                  !    selectLayerEntities(active)
By Layer ▸                           ▸    dynamic layer list
──────────────
Box Select                     B    (t)  arms the marquee tool
```

### View
Strictly "what you see", never the document. Numeric siblings of these toggles live in
Settings (Law 1); menu radios and Settings edit the same stores.
```
Frame Selection                F    !    LOCKED; frames selection + orbit re-centers on its centroid;
                                          falls back to frame-all when nothing selected
Reset Camera                         !    explicit command (LOCKED)
Camera Snap ▸                        ▸    Front / Back / Left / Right / Top / Bottom — snaps orbit the
                                          SELECTION CENTROID when a selection exists, else origin (LOCKED)
──────────────
Grids ▸                              ▸    ✓ Floor (XZ) · ✓ XY · ✓ YZ · ── · Grid Settings… (deep-links Settings → Viewport)
Hide Interior                  ✓          $hideInterior (previews KSA's outside-IVA gate)
Environment ▸                        ◉    9 presets (Studio … Blue Lagoon Night; HDR progress → status bar)
Show Sky Background            ✓          [dis: Studio environment]
Scene Lighting…                      !    deep-links Settings → Scene (tone map, exposure, reflections, sky blur)
Light Coverage ▸                     ◉    Selected / All / Off
Live Light Preview             ✓          over-cap warning renders in the status bar
──────────────
Measurement Overlays ▸               ▸    ✓ Bounding Box · ◉ World / Oriented · ✓ Per-mesh Dimensions ·
                                          ✓ Distance Between Two
Units ▸                              ◉    m / cm / mm
──────────────
FPS Counter                    ✓          status-bar readout + in-viewport stats.js; flips loop continuous (unchanged)
```

### Tools
```
Measure Point-to-Point         M    (t)  arms the tool; status bar guides the two clicks; Esc cancels
Add Reference Line                   !    adds + focuses its editor in the left sidebar
Add Reference Container ▸            ▸    Box / Cylinder / Sphere — adds + focuses editor
──────────────
Collider Coverage Check              !    [dis: no colliders] — runs check, dots in viewport, report → left sidebar
Sit in Seat ▸                        ▸    dynamic seat list ("Seat 1", …) (t) · ── · Exit Seat View [dis: not seated]
──────────────
(reserved: Calculators… — plans/CALCULATORS_PLAN.md; opens a FloatingWindow if adopted)
```

### Window
```
Left Sidebar                  ⌥[    ✓
Right Sidebar                 ⌥]    ✓
Timeline                             ✓    [enabled only in Animation mode]
Tool Bar                             ✓    the floating gizmo switcher (§6.2)
Reset Window Layout                  !    widths, collapse states, float positions, float order → defaults
──────────────
Asset Manager…               ⇧⌘A    →D   (§10.3)
Notifications…                       !    opens the notification center popup (same as the bell)
```

### Help
```
Search Commands…              ⌘K    !    the command palette
Keyboard Shortcuts…            ?    →D   generated from the scoped registry (§11.5)
──────────────
About flexo…                        →D   blurb / MIT / RocketWerkz attribution (legally load-bearing text
                                          retained); auto-opens on true first run; suppressed on share-link launches
flexo on GitHub                      !    external link
```

Reset Everything 🔥 lives ONLY in Settings → Advanced (S12) and as the action on the
build-mismatch notification. All three v1 reset entry points share one command (identical
ConfirmDialog + "Reset folder access grants" switch on every platform — fixes the phone
inconsistency). `nukeAndReload` semantics unchanged (preserves `flexo-fs` by default).

---

## 4. Command registry & MenuSpec mechanics

The machinery behind §3, binding for every area:

- **Command** = plain object registered at module scope:
  `{ id, title, menuPath?, keys?, scope, enabled?(): boolean, checked?(): boolean, run(params?) }`.
  Grouped `commands/*.ts` by menu. Commands are the ONLY way features expose actions to
  the shell; the menubar, MenuSheet, palette, hotkey registry (§11) and Help dialog all
  render from this one dataset.
- **MenuSpec** = the ordered menu tree (ids, labels, separators, submenus) referencing
  commands by id. Menu items look up their shortcut chip in the hotkey registry by
  commandId — labels can never drift from bindings.
- **Dynamic providers** contribute factory-generated commands: seat list (Sit in Seat ▸),
  custom mesh instances, layers (By Layer ▸, "Activate layer: X"), projects ("Open
  project: X"), History ▸ rows. Providers re-evaluate on menu open / palette query.
- **Enabled/checked** predicates are store selectors (`$canUndo`, `$hasSelection`,
  `$mode`, `$modFolder.status`, clipboard state…) evaluated on open — no per-button
  wiring. Items that would *explain* rather than merely disable (Share Link with assets)
  stay enabled and explain inside their dialog.
- **Dialog-opening commands** write `dialogStore.$openDialog = {id, params}`; dialogs are
  mounted once at root. This retires the controlled/uncontrolled dual API on
  PartDataButton/ExportButton/ViewButton/MeasureButton/HistoryButton and the
  MobileTopBar's parallel wiring, and ends the undo-toast label being built in four places
  (the undo/redo command owns its own status flash).
- **Mode-switching commands** (`Define Engine…`, entity Add items per S27) call
  `modeStore.setMode` and may carry a focus payload ("open new-engine picker", "scope to
  template X") consumed by the target mode's sub-state store.

---

## 5. Status bar

One row, menubar-height, `xs` controls, `text-xs`. Segments left → right (segments hide
when empty; alignment groups never shift):

```
[⬚ Build] [Layer: Hull ▾] │ [tool segment] │ [sel: 3 SubParts · 1 Light | 2.40×1.10×0.85 m]
···· flex: status message / [Undo] / progress ···· [⌥ Duplicate drag · ⇧ Add] [↻Y 45°][⇅Y 0.1m][Snap ⧉][62fps][🔔3]
```

| # | Segment | Contents & behavior | Absorbs |
|---|---|---|---|
| 1 | **Mode chip** | icon + mode name; click opens a mini mode menu (same 5 commands) | (new — fixes invisible-mode pain) |
| 2 | **Active layer chip** (Build + Animation only) | `Layer: <name> ▾`; click = layer picker menu (sets active layer) | fixes "active layer visible nowhere" |
| 3 | **Tool segment** | present only while `$activeTool` ≠ null OR a chain session is open; the tool's name, live instruction, and inline controls (seat ◀ ▶ Exit; measure step; exhaust target chip; `Chain · 12 instances · +8 new`). Clicking focuses the owning surface | SeatViewBar; invisible measure state; chain footer mirror |
| 4 | **Selection readout** | count by kind + live bounds `W×H×D` in the chosen unit (from `$selectionBounds`); world/oriented badge; click toggles World/Oriented | MeasurementInfo |
| 5 | **Message channel** (flex) | transient messages land here, **overwriting** the previous (brief). Severity tint; expiry per §5.1; inline `[Undo]` action after destructive ops; click → opens the notification center | toast spam |
| 6 | **Progress** | aggregated compact bar for active downloads/exports/imports (HDR/GLB/KTX2 via `trackDownload`); click → popover with per-file bars; sticky while running; browser dialogs keep their own preview-pane overlay | WorkspaceLoadProgress |
| 7 | **Modifier hints** | up to 3 live hints from hint providers, e.g. `⌥ Duplicate drag · ⇧ Add to selection · ⌃ Snap`; `Kbd`/`keyLabel` chips; desktop only | (new — brief requirement) |
| 8 | **Rotate / nudge chips** | `[↻ Y · 45°]` `[⇅ Y · 0.1 m]` — click cycles axis (same actions as `R`/`→`); rich chord-table tooltips preserved verbatim; axis letters gizmo-tinted; desktop only | TransformHud |
| 9 | **Snap chip** | mirrors the Tool bar's snap state; click toggles; hover tooltip notes "hold ⌃ while dragging = temporary opposite" | (exposes dormant `$snap` — LOCKED) |
| 10 | **FPS** | numeric readout when View → FPS Counter is on (loop continuous as today; stats.js graph stays in-viewport) | — |
| 11 | **Bell 🔔 + unread badge** | opens the notification center popup | ImportReportCard entry point, toast queue |

### 5.1 Toast → status/notification routing

`toast(message, opts)` **keeps its exact imperative signature** (constitution — EditorScene,
boot code, nudge/rotateControls keep working unmodified) and becomes a facade routing into
`statusStore` + `notificationStore`. Existing call sites migrate by variant, not rewrite.

| Category | Route | Duration | Examples |
|---|---|---|---|
| `transient` (default) | status message only; overwrite; never enters the center | 4s | nudge/rotate axis+step, undo/redo labels, copy/paste counts, "SubPart Added", autosave flash |
| `success` | status message + notification entry (pre-read) | 4s | export written, chain applied, project imported |
| `warning` | status message (amber) + notification entry (unread) | 8s | boot purge notice, chain seeds vanished, light-preview cap |
| `danger` | status message (red) + notification entry (unread, persistent) | 10s | import/export/share failures, **autosave write failure (newly surfaced — today a silent console.warn)** |
| `rich` (new) | notification entry ONLY (unread, expandable React body; bell pulses; sticky) | — | **Import report** (must name removed SubParts; persists until dismissed), export pre-flight summary |
| build-id mismatch | sticky notification with actions **[Reload] [Reset everything…]** | — | replaces the scary boot modal (S26); the schema-purge notice stays a boot `warning` |

One severity→duration table; no per-call-site timeouts.

### 5.2 Notification center popup

Popover anchored to the bell (`w-96`, max-h 70vh, scroll). Newest first, unread divider.
Row = severity icon · title · **multi-line description, never truncated, copyable** ·
relative time · optional action buttons (Reload, Show in Assets…, Open Export…) ·
per-row dismiss. Rich entries render their body inline (import report with its warnings
disclosure). Footer: "Clear all". Opening marks all read (badge resets). Session-scoped
ring buffer of 100 — notifications are news, not data (never persisted). Phone: bottom sheet.

---

## 6. Floating surfaces policy

Default answer for any surface: **dock it**. A surface floats only if it must overlay the
viewport mid-gesture while both sidebars are occupied by mode content. Exactly **two**
floating windows ship; the primitive supports future tenants (Calculators plan).

### 6.1 The window-manager primitive — `FloatingWindow` (kit) + layoutStore state

- **Chrome**: `panelChrome` + a 20px title strip (grip dots + title + optional close).
  Drag anywhere on the strip only (pointer capture); the body never drags.
- **Bounds** (brief, verbatim): clamped inside the **workspace band** — never above the
  menubar's bottom edge, never below the status bar's top edge; screen left/right edges
  are the horizontal bounds. Windows MAY overlap the timeline dock. Re-clamped on window
  resize and sidebar resize; ≥120×28px always kept on screen.
- **z-order**: all windows at `z.float` — **above both sidebars** (brief), below dialogs
  and popovers. One stack (`layoutStore.floatOrder`); pointer-down raises to top.
- **Persistence**: `flexo:layout` → `float[windowId] = {x, y} | null` (null = default
  anchor). Default anchors are collision-free by construction. Cleared by Window → Reset
  Window Layout and by Reset Everything.
- Optional per-window: `collapsible` (roll up to the handle bar), `resizable`.
- Keyboard: the strip is focusable; arrow keys move 8px.
- Phone: each window declares its phone rendering (§12).

### 6.2 The two survivors

| Window id | Contents | Default anchor | Notes |
|---|---|---|---|
| `toolbar` — **Tool bar** | Move / Rotate / Scale ToggleButtonGroup (reads `$effectiveToolMode` so exhaust clamping and pose auto-pick display truthfully; Scale disabled during exhaust placement) + **snap magnet toggle** + chevron popover (translate step m, rotate step °, "hold ⌃ = temporary opposite") | top-center of the viewport, 8px below the menubar | Visible whenever a gizmo target exists (selection, posing, exhaust). Selection ACTIONS (duplicate/chain/delete/change-layer) do NOT live here — Law 1 puts them in the left sidebar + Edit menu. Window → Tool Bar hides it. Phone: docks as a strip above the condensed status bar |
| `chain` — **Chain palette** | ChainPalette guts verbatim: autofocus search, command list, step cards, footer counts/error, `⌘↩` Apply / Esc Cancel | top-left of the viewport, 8px in | NON-modal by constitution. Gains: drag handle, resizable width 300–420px, **step drag-reorder**, discard-confirm on cancel with ≥1 step (LOCKED). Phone: 50% non-blocking sheet, session intact across dismiss/reopen |

### 6.3 Death list — every v1 floating surface → v2 destination

| v1 floating surface | v2 destination |
|---|---|
| EditorToolbar (top floating bar) | Menubar (§3) |
| MobileTopBar | Phone shell (§12) |
| SelectionToolbar | Tool bar window (tool switching) + left sidebar actions + Edit menu (actions) |
| MultiSelectToolbar | Left sidebar multi-select panel (§7.1) |
| FloatingInspector (TransformInspector host) | Left sidebar focus editor (§7) |
| FloatingPreviewToolbar (anim scrubber) | Timeline dock transport (§9) |
| SeatViewBar | Status bar tool segment |
| MeasurementEditor / ContainerEditor (FloatingEditorPanel) | Left sidebar aid editor (§7.1) |
| ManageTexturesPanel | Surface mode right sidebar (§8.5) |
| ChainPalette | KEPT — `chain` floating window (upgraded) |
| TransformHud | Status bar rotate/nudge chips |
| MeasurementInfo | Status bar selection readout |
| WorkspaceLoadProgress | Status bar progress segment + popover |
| ImportReportCard | Notification center rich entry |
| GlobalToastRegion | Status message channel + notification center |
| MobileInspector FAB + sheet | Phone Inspector sheet (§12) |
| FPS stats.js overlay | stays (canvas overlay) + status-bar numeric segment |
| ViewportDropZone overlay | stays (canvas overlay) |
| Boot purge toast / BuildIdMismatchDialog | Notification center entries (§5.1) |

---

## 7. Left sidebar framework — "the focus editor"

The left sidebar always answers: *what am I focused on, and what can I do to it?* Content
is a pure function of `(mode, focus)` where focus = selection ∪ mode sub-state ∪ active
aid ∪ armed tool. It is a vertical stack of dense cards, top→bottom priority:

1. **Tool parameter card** (when the armed tool has parameters) — e.g. coverage report.
2. **Focus card** (mode ruleset below).
3. **Empty state** when nothing applies: a mode cheat-card — one sentence of what the mode
   is, 4–6 hotkeys, and the mode's primary action button(s). Build's empty state doubles as
   first-run guidance (Add SubPart… / Import Model… / Open Projects…).

Header row (all modes): focus title (entity name / "N items" / joint name / module name) +
overflow ⋮ menu carrying the focus object's commands. Panels scroll independently; section
headers sticky. All numeric fields: `useNumberDraft` + `inputMode="url"` (constitution);
streaming-undo `onInteractionStart` convention unchanged; disabled state mirrors layer locks.

### 7.1 Build

| Focus | Panel |
|---|---|
| Single entity | Kind header + transform groups (Position m / Rotation ° / third group per kind), then per-kind sections — the TransformInspector inventory split into per-kind files, guts unchanged: **SubPart** (instance id, template caption, "SubPart Data →" and "Edit Surface →" jumps), **Connector** (capabilities + flags + hints), **Collider** (shape, owner re-homing, fit, coverage check + red-dot report), **IVA Seat** (ordinal + reorder, Sit, add-kitten-at-seat, aim presets, aim-at-selection, axes readout), **Light** (full dual-frame editor + falloff curve), **Kitten** (transform only) |
| Multi-select | "N items" + bulk transform (Move by / Rotate by / Scale by; smart/in-place switch) — **foundation fix: bulk numeric panel lifts owner-frame entities (SubPart-owned colliders/lights) to part space to match the gizmo** — + actions row: Change Layer ▸ · Interior (IVA) ▸ (per-template semantics, "n/a for glass" preserved) · Duplicate · Chain… · Delete All (N)… (confirm) |
| Active measurement / reference container | The aid's editor (endpoints, length, axis lock, color, A/B gizmo toggle, lock · shape fields, container gizmo-mode toggle, warn config). Aids take the focus slot; selecting a mesh returns focus to it — exactly ONE focus slot ends the v1 left-center triple-booking structurally |

### 7.2 Animation (LOCKED #5: left = selected joint/keyframe details)

| Focus | Panel |
|---|---|
| No clip | empty state: "Create or pick a clip on the right" |
| Clip only | clip settings (name, mode actuate/deploy, duration w/ rescale note, solar tracking) |
| Joint (+ keyframe) | joint details: name, parent, **membership list** (rows w/ remove; "Attach selected (N)"; "Choose members…" → the docked Members view — shared `SubPartSetGrid`, §10.11 / animation design §7), pivot tools (Set pivot to selection / pos-only; move-pivot semantics; pivot marker follows `restAnchorTime` — fixes the t=0 vs rest-anchor inconsistency), pose editor (position/rotation/**scale** numerics — closes the census gap), per-channel easing editor for the outgoing segment (LOCKED #8), temporary working-pivot picker (LOCKED #8) |
| Keyframe only (timeline click) | keyframe row details: time, per-joint pose summary, easing |

### 7.3 Data — GameData forms for the scope chosen in the right navigator

- **Part scope** sections: Identity (Part Id, display name, editor tags, diameter incl.
  extra diameters read-only, command-capable) · Mass · Tanks (feed containers) · Power
  (batteries/generators/solar/consumer) · Coupling (decoupler/docking port/EVA door) ·
  Wiring (controllers, ConsumerFeedWiring + auto-wire, gimbals) · Advanced (solid motor,
  gas generator) · Passthrough (read-only RawXmlNode tree viewer — preserved XML finally
  visible) · inline EngineIssuesPanel; "Open in Engine mode →" jump on engine sections.
- **SubPart-template scope** sections: Tanks · Lights ("Select in 3D" now actually usable —
  the viewport stays visible) · Solar Panels · Engine (thrust chamber) · Passthrough.
- Scope banner states the scoping rule structurally: "Template — shared by N placements" /
  "Instance-scoped" chips on wiring/gimbal cards.

### 7.4 Engine — the selected module's field editor
Combustor fields (reaction + mixture ratio, chamber pressure, thermal η, min throttle…),
nozzle fields (exit ⌀, direction + length warning + Normalize, FX override), solid-motor
trio, rocket bindings, controller card, feed-wiring entry with FeedsField, custom
propellant card + LUT editor. Selecting a module in the right tree focuses it here.

### 7.5 Surface — face-focus card
Selected face: texture select, wrap, UV scale/offset numerics (live viewport preview) +
the selection inspector below when a placement is selected. (The mesh-level editor is the
right sidebar — LOCKED, §8.5.)

---

## 8. Right sidebar framework — "the mode primary"

Structure: slim mode header (icon + title + header actions) above a scrolling body of
collapsible `SidebarSection`s (DisclosureSection restyled dense, sticky headers). At most
ONE level of tabs, used only where lists genuinely fight for space. Search fields are
fuzzy (subsequence match) — an upgrade from v1's substring-only. Every mode body defines
an empty state (icon + one-line instruction + primary action).

### 8.1 Build — the Outliner (unified; S17)

One tree, replacing AssetsList + Layers popover (+opacity popover):
- **Search** field pinned top (fuzzy, filters entities).
- **Layer header rows** with inline controls: active-layer radio dot · name (inline rename,
  Enter/Esc) · count chip · eye · opacity swatch popover · lock · listed · row ⋮ menu
  (rename / select-all-in-layer / clear / delete — delete offers move-vs-delete choice,
  confirm per §14.3). Drag-reorder layers. "＋ Layer" create row pinned bottom.
- **Entity rows** grouped by kind beneath their layer: multi-select with ⇧-range
  (grow-only `useShiftRangeSelect` semantics verbatim), ⌘-toggle, ⌘A; per-row ⋮ menus
  (Duplicate · SubPart Data → jump · Edit Surface → jump · Interior ▸ · Change Layer ▸ ·
  Sit in Seat · Delete…). Drag an entity row onto a layer header = Change Layer.
  `revealEntity` viewport→list scroll-sync retained.
- **Aids** section (collapsed by default): Measurements list · Reference Containers list
  (+ add buttons mirroring the Tools menu) · warn-precision toggle (Fast/Accurate).
  Selecting an aid focuses its editor (left sidebar).

### 8.2 Animation (LOCKED #5: clips + joint tree + easing)

1. **Clips**: list rows (name, duration, mode, draft chip with per-clip blocker tooltip —
   "needs members / 2nd keyframe / duration"), ＋ Animation, rename/delete.
2. **Joints**: a real **tree** (indented by parent, drag-to-reparent, cycle-guarded),
   member counts, per-joint attach/detach affordances, "Attach selected (N)",
   "Choose members…" → the docked Members view (shared `SubPartSetGrid` — §10.11).
3. **Easing**: per-channel easing overview for the selected segment (LOCKED #8).
4. **Solar Tracking** section (existing editor).

### 8.3 Data (LOCKED: list w/ data-capable vs non-capable disabled style)

- **Part (root)** row (badges = section counts), then every SubPart **template** row:
  capable rows normal with content badges (tanks/lights/solar/engine); capable-but-empty
  rows show a "＋ add data" affordance; non-capable entity kinds (connectors, colliders,
  seats, lights, kittens) grouped at the bottom, **disabled-style** with tooltip. Fuzzy search.
- Selecting a row scopes the left forms; the viewport highlights the template's placements.
- **Validation strip** pinned bottom: live block/warn counts with click-through to the
  offending section.

### 8.4 Engine (LOCKED: self-sufficient; absorbs ConsumerFeedWiring)

1. Engine scope select (per-template rows — fixes per-placement duplication) + "Define new
   engine ▸" (Liquid / RCS / Solid motor / SRB preset (legacy, documented)).
2. **Module tree**: Combustors · Nozzles · Solid motor · Rockets · Controllers · Gimbals ·
   **Feed wiring (absorbed)** · Custom propellants. Selecting focuses the left editor.
3. **Performance readout** (live thrust/Isp; per-rocket aggregation, first-pair fallback).
4. **Validation** section — always visible (`validateEngines` block/warn with jump-to-module).
5. **Exhaust** placement toggle + chip list (mirrors viewport handles 1:1; amber physics /
   cyan FX semantics unchanged).

### 8.5 Surface (LOCKED: right sidebar IS the material/glow/UV editor)

1. **Mesh picker** pinned top: all custom meshes (primitives, imported, kitten meshes) with
   kind chips + placed-instance counts (0-instance templates visible — fixes invisibility),
   fuzzy search, "Add instance".
2. For the picked mesh, the **surface editor**: name + primitive dimension editing (store
   support existed, UI gap closed) · Material section (assign select, Edit… / New… →
   MaterialDialog — overlay dialog here; pushed view only when opened inside the Asset
   Manager, surface design D9) · **Faces** selector (drives the left face card +
   viewport face highlight — LOCKED) · Glow (modes, ramp editor, "Edit paint…" →
   GlowPaintDialog, emissive slider + washout warning, Add Matching Light) · Visor Surface
   (kitten glass modes, simulate-glass switch) · Imported (provenance, render-as-glass,
   batch Replace… / Remove…).
3. Header button "Open Asset Manager…" (⇧⌘A) for cross-cutting library management.

---

## 9. Timeline dock (Animation mode; LOCKED #5)

Full-width row between the workspace band and the status bar (S20).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▶⏸ ⟲loop 1×▾ │ , . │ t 1.24 / 3.00 s │ ＋Key (K) │ latch 🔓          ⌄ collapse │
├──────────────┬───────────────────────────────────────────────────────────────┤
│ ▸ root       │ ◆────────◆──────────────◆────────────────────⚓               │
│   hinge_L    │ ◆───◆────────◆              ║ playhead                        │
│   hinge_R    │ ◆────────◆                  ║                                 │
└──────────────┴───────────────────────────────────────────────────────────────┘
```

- **Tracks**: one row per joint, ordered/indented to mirror the right-sidebar tree.
  Draggable keyframe **diamonds** (retime; ⌃ snaps to other keys), playhead scrub,
  click empty track/ruler = move playhead, **double-click track = insert keyframe at that
  time**, `K` = insert at playhead (on-curve pose seeding preserved). The rest-anchor
  keyframe is badged **⚓** with a "Re-anchor here" context action (finally exposes
  `restKeyframeId`). Per-segment easing indicators.
- **Transport**: play/pause (`Space`), loop toggle, speed 0.25/0.5/1/2, prev/next key
  `,` / `.`, time readout, ＋Key. **Spring-loaded scrub survives**: releasing an unlatched
  scrub snaps to the modeled rest pose (preview honesty invariant); the **latch** padlock
  holds the pose deliberately. Scrubbing no longer silently exits pose editing — the
  pinned keyframe re-pins on release.
- **Perf**: high-frequency `$animPreviewU` never subscribes wide React trees (the
  PreviewProgressLabel lesson) — the track area renders to canvas; transport subscribes
  leaf-only. On-demand render loop preserved (playback invalidates via the existing path).
- Collapse (⌄) → 32px transport-only strip. Phone: fullscreen sheet (§12).

---

## 10. Overlay dialog framework

### 10.1 Shared conventions

- Sizes: **S** = max-w-md center (confirms, renames, small forms) · **M** = max-w-2xl
  (settings, export, set picker) · **L** = cover ~95vw / max-w-6xl (browsers, managers,
  import review, help). Phone mapping: S → center, M/L → cover (S22).
- **No modal-in-modal.** Replacement pattern — new kit primitive **`DialogViewStack`**:
  a dialog owns a pushable view stack (`list → detail → confirm`) with a back chevron in
  the DialogHeader (`‹ Back · Title`); Esc pops the top view first, then dismisses
  (after the numberDraft dirty-revert). Row-level deletes may instead use an **inline
  destructive strip** on the row (`Delete "X"? [Delete] [Cancel]`). `ConfirmDialog`
  remains blessed ONLY for top-level confirms not already inside a dialog.
- Dialogs are mounted once at root and opened by **commands** writing
  `dialogStore.$openDialog = {id, params}` — killing every controlled/uncontrolled dual
  API and per-button open-state plumbing. Menus, palette, phone shell, and cross-mode
  jumps all open dialogs the same way.
- One shared kit `CopyDownloadBar` (copy-with-✓ + download) replaces the three hand-rolled
  clipboard/download implementations.
- Wizards (import review) are views in the same stack with explicit step state.

### 10.2 Project Manager (L) — File → Projects… ⌘O
Grid/list of all projects: thumbnail, name, description, part id, counts (SubParts /
connectors / animations / layers), created/saved timestamps, storage size — powered by the
new id-keyed metadata index + IndexedDB snapshots (LOCKED #3; the projects area owns the
storage design; the reactive index kills the `setTick` hack). Row actions: Open · Rename
(inline) · Edit description · Duplicate · Export archive… · Share… · Delete (inline
confirm strip). Sort + fuzzy search. Current project pinned with a "current" chip and
inline rename/describe. States "All changes autosave" — no Save button anywhere, ever.

### 10.3 Asset Manager (L) — Window → Asset Manager… ⇧⌘A
Two-pane: left category rail (Textures / Materials / Meshes / Imported models); right =
grid with thumbnails + **where-used chips** (navigation), per-item actions (rename,
re-channel, replace, delete with usage-aware inline confirm — the bytes-unrecoverable
warning retained verbatim). Import-batch cards host Replace… (opens Import Review in
replace mode) and Remove import…. Creation buttons per section mirror the Add menu.
Editing a material = stacked view. "Edit surface →" jumps to Surface mode (dialog closes).

### 10.4 Import Review (L)
The 3-state flow unchanged (Drop → Review → Importing as stacked views): preview
viewport, stats, warnings, sticky-vs-per-import options split ("persist a preference,
never a correction"), replace-mode match summary, undismissable while importing. The
import report goes to the notification center (rich entry).

### 10.5 Help / Shortcuts (L) — `?`
Generated from the scoped registry (§11.5). About (S) unchanged (first-run auto-open +
share-link suppression preserved; legal attribution text retained).

### 10.6 Export to KSA (M/L) — File → Export to KSA… ⌘E
Binding invariants (interior layout owned by the export area design): mode toggle
XML / Mod preserved; pre-flight severity boxes (block/warn/info) — **non-blocking policy
retained** ("Export anyway" wording when blockers exist); XML tabs Part / GameData /
Assets with the Assets bundle built **lazily on tab focus** (fixes the rebuild-per-render
perf hole); mods-folder grant row (4 grant states); Download zip fallback; non-overwrite
folder writes + mod.toml accumulation unchanged; export-relevant settings (kitten texture
mode + Content/Core path, `_VM` decimation) surfaced inline as read-only chips with
deep-links to Settings → Import & Export.

### 10.7 Settings (M) — Edit → Settings… ⌘,
Tabs (Law 1: every persistent preference has exactly one home):
- **General**: selection highlight colors/strengths (react-aria ColorPicker w/ alpha —
  absorbs the TODO), confirm-policy threshold, FPS counter.
- **Viewport**: grid spacing per axis, connector size, seat marker size + gaze cone,
  light marker size (UI gap closed), collider fit margin + orient-to-selection (UI gap
  closed).
- **Scene**: environment preset, tone map, exposure, reflections, sky blur, light-viz
  exposure mode/value, simulate in-game glass (`$simulateGlass` mirror — kitten visor
  preview, surface design §1.3) (View-menu toggles mirror these same stores).
  Look-dev ergonomics (replaces the v1 live View popover): while the Scene tab is
  active the M dialog anchors right-of-center leaving ≥50% of the canvas visible, and
  every Scene slider live-commits — exposure/reflection tuning happens against the
  live model, not behind a covering modal.
- **Import & Export**: model-import sticky prefs (up axis, texture cap, bake scale,
  decimate view meshes — labeled "affects export"), kitten texture export mode +
  Content/Core path.
- **Advanced** (danger zone): build id readout, **Reset Everything 🔥** (inline confirm
  view with the FS-grant switch; `flexo-fs` survives by default).

### 10.8 Small dialogs (S/M, unchanged guts)
Rename Project · Scale Everything · Create Mesh · Upload Texture · Create Material ·
Glow Paint (center; canvas painting; Clear/Cancel/Apply) · Share Link (with-assets state
explains + offers archive).

### 10.9 Import/Export Project dialogs (M)
Import Project… = file picker (.tar.gz / .json) + paste area (additive, one undo step,
id-remap semantics verbatim incl. layer mirroring and cross-reference rewrite).
Export Project Archive… = builds the tar.gz (project.json + binaries).

### 10.10 Catalog browsers (L) — SubPart / Built-in Part
Layout preserved (list | preview / details, draggable splits, fresh-session-on-open,
`$browserPopupCount` progress-surface swap, destination-layer select on the Part browser,
`revealLayer` after import). Commit gestures normalized: **single click = preview only;
double-click / Enter / Add button = add** (add-and-stay; "Add & Close" secondary) —
resolves the v1 two-gesture ambiguity. Fuzzy search over id + editor tags; result-cap
indicator ("200 of 431 — refine search").

### 10.11 SubPart Set Picker — the shared multi-select surface (brief's animation requirement)
The shared component is **`SubPartSetGrid`**, and it has TWO sanctioned hosts:
- **Animation joint membership ("Choose members…") renders it DOCKED** as the
  right-sidebar Members view — non-modal, viewport live (animation design D1/§7). A kit
  Modal would kill member painting and the live layer-eye interaction, so the dialog host
  is NOT used for this caller.
- The **M overlay dialog host** described below serves future non-Animation
  pick-a-set-of-SubParts callers only.
Layer-sectioned GridList honoring listed/hidden/locked with per-row disabled styling
(fixes MeshPickerModal's layer-blindness) · per-layer show/hide toggles inside the picker ·
fuzzy search · ownership chip per row ("→ Joint: HingeL") · select-layer / ⇧-range / ⌘A
gestures · live viewport highlight of hovered/checked rows. Sized M and positioned to the
side on wide screens so the viewport stays visible. SubParts only (connectors/kittens can
never be joint members — KSA limitation, constitution).

---

## 11. Hotkey architecture

### 11.1 Scoped registry

```ts
interface HotkeyBinding {
  id: string;                // == commandId used by MenuSpec + palette
  label: string;
  keys: string;              // react-hotkeys-hook string
  chords: string[];          // display tokens (platform-neutral; keyLabel resolves ⌘/Ctrl at render)
  scope: 'global' | 'viewport' | `mode:${Mode}` | `tool:${Tool}` | `surface:${SurfaceId}`;
  when?: () => boolean;      // store-predicate gate
  run(e: KeyboardEvent): void;
}
```

- **global** — active unless typing (`isTypingInField` activeElement guard preserved
  VERBATIM — the react-aria virtual-focus fix is load-bearing). As in v1, overlay dialogs
  do not suppress global bindings; they do suppress viewport scope.
- **viewport** — active when: no overlay dialog is open, not typing, AND focus is not
  inside an interactive react-aria collection/menu surface (focus on the viewport host,
  body, or non-interactive chrome counts). The viewport keeps stealing focus on
  pointerdown, so this is the common state. **This is the answer to "what happens to
  WASDQERF": the single-letter spatial keys stop being document-global and become
  viewport-scoped — otherwise unchanged, in every mode** (S8).
- **mode:X** — additive while mode X is active (stacks on viewport).
- **tool:X** — active while that transient tool is armed.
- **surface:X** — active while a surface has focus (chain window, timeline, palette).
  Formerly-local bindings (chain ⌘↩/Esc, timeline keys, layer-rename Enter/Esc) register
  through the registry with their scope so Help stops drifting; numberDraft per-field keys
  stay field-local by design and get a static Help section.
- **List-surface edit mirrors** — the collection-focus exclusion above only exists to
  keep BARE keys (WASDQER, arrows, T/B/F/M/[/]) from fighting row navigation; the
  modifier-chord edit commands were global in v1 and must keep working after
  range-selecting rows. The selection-carrying list surfaces (`surface:outliner`,
  `surface:data-navigator`, `surface:engine-tree`, `surface:members`) therefore register
  **mirror bindings for `⌘C ⌘X ⌘V ⌘D ⌫` and `⇧⌘I`** delegating to the identical edit/
  select commands (which act on the entity selection). Exception: a list's own `⌘A`
  (react-aria row select-all) keeps precedence over the viewport `⌘A` while that list
  has focus.
- Precedence on conflict: surface > tool > mode > viewport > global. The registry rejects
  duplicate keys within one active set at dev time, and additionally asserts that **no
  bare-letter/digit binding is enabled while an overlay dialog is open** (mode digits are
  `when`-gated, tool letters are viewport-scoped — see §11.2).

### 11.2 Full default binding table

| Scope | Keys | Action |
|---|---|---|
| global | `1 2 3 4 5` | switch mode (Build/Animation/Data/Engine/Surface) — gated `when: () => !dialogOpen` (never fires invisibly behind an overlay dialog) |
| global | `⌘K` | command palette (LOCKED rebind) |
| global | `⇧⌘K` | Begin Action Chain (switches to Build; discard-confirm on conflict) |
| global | `⌘Z` / `⇧⌘Z`, `⌘Y` | undo / redo (status flash shows step label) |
| global | `⌘O` / `⇧⌘A` / `⌘E` / `⌘,` | Projects… / Asset Manager… / Export to KSA… / Settings… |
| global | `⌘S` | no-op → "Autosaved ✓" status flash |
| global | `?` | Keyboard Shortcuts (useKey + ignoreModifiers — layout-agnostic, preserved) |
| global | `⌥[` / `⌥]` | toggle left / right sidebar |
| global | `Esc` | the ladder (§11.4) |
| viewport | `W/S` `A/D` `Q/E` | rotate selection about the three (cycling) axis pairs — semantics unchanged |
| viewport | `R` | cycle rotate-axis assignment (flash shows mapping) |
| viewport | `[` / `]` | rotate step smaller / larger (relocated from F/⇧F — S6) |
| viewport | `↑↓` `⇧↑↓` `←→` `⇧←→` | nudge / fast-nudge / cycle nudge axis / cycle nudge step — unchanged |
| viewport | `F` | **Frame Selection** (LOCKED rebind; frame-all fallback) |
| viewport | `T` / `⇧T` | cycle gizmo tool Move→Rotate→Scale (forward/back) — S5 |
| viewport | `B` | arm box-select (marquee) |
| viewport | `M` | arm measure point-to-point (viewport-scoped for symmetry with `B` — tools never arm invisibly behind dialogs; C5 fix, moved from global) |
| viewport | `⌘A` / `⌥⌘A` / `⇧⌘I` | select all / deselect / invert |
| viewport | `⌘C ⌘X ⌘V ⌘D` `⌫` | copy / cut / paste-in-place / duplicate-with-offset / delete |
| surface:outliner | `⌘F` | expand/focus the Outliner search field (build design §2.1/§2.5); scope-local, so browser find survives elsewhere |
| surface:outliner · data-navigator · engine-tree · members | `⌘C ⌘X ⌘V ⌘D` `⌫` `⇧⌘I` | mirror bindings → the same edit/select commands (list-focus parity — §11.1); list ⌘A keeps row select-all precedence |
| mode:animation | `Space` | play / pause preview |
| mode:animation | `,` / `.` | previous / next keyframe |
| mode:animation | `K` | insert keyframe at playhead |
| tool:seat-view | `Esc` (rung 8) | exit seat view (never preventDefault — unchanged contract) |
| surface:timeline (focused) | `←→` / `⇧←→` | step playhead by frame / snap to keyframes (overrides nudge arrows while the timeline has focus) |
| surface:chain | `⌘↩` / `Esc` | apply / cancel (enableOnFormTags; no-preventDefault Esc — unchanged) |

The complete rebind diff from v1 (documented in Help): `F` rotate-step → Frame Selection
(rotate step → `[`/`]`); `⌘K` chain → palette (chain → `⇧⌘K`). Everything else preserved.
New keys: modes 1–5, tools T/⇧T, B, M, ⌘A family, ⌘D, ⌘X, ⌥[/⌥], dialog chords,
animation transport, ⌘S flash, Outliner ⌘F, list-surface edit mirrors.

### 11.3 Command palette (⌘K — LOCKED)

Overlay (S, top-third placement; phone: fullscreen sheet). Fuzzy search over the command
registry: every menubar item (menu path as subtitle + shortcut chip), mode switches, tool
arming, Add entries, and dynamic providers (seats, custom meshes, layers — "Activate
layer: Hull", projects — "Open project: Rover"). The **action-chain builder is a command**
(LOCKED) with the discard-confirm on conflict. Enter runs; ⌘Enter runs-and-keeps-open
where meaningful. Disabled commands appear grayed with their reason where cheap.
Non-goals: no free-text math; no document-entity search (the Outliner owns that).

### 11.4 Escape ladder (single documented order; top wins; each rung fires only if the previous didn't)

1. Numeric-field dirty revert (field-local; preventDefault only when dirty — unchanged).
2. Open menu / popover dismiss; dialog top **view** pops (back), then dialog dismiss (react-aria).
3. Command palette close.
4. Gizmo drag cancel (TransformControls built-in; applies only mid-drag).
5. Armed transient tool cancel: measure pending-point → disarm; box select; exhaust off.
6. Chain session cancel — **confirm when ≥1 step** (LOCKED), silent when empty.
7. Animation unwind: edited keyframe → active joint (registered `mode:animation`;
   replaces the raw window listener; the mode itself never exits via Esc).
8. Seat view exit (store-gated; **never preventDefault** — unchanged invariant).
9. Nothing. Escape never clears the selection and is never globally preventDefault'ed.

### 11.5 Help dialog

Rendered from the registry grouped by scope ("Everywhere", "In the viewport",
"Animation mode", "While measuring", "Chain window", "Timeline") plus static sections for
pointer modifiers (additive click, ⇧-range grow-only, marquee, ⌥-drag duplicate, ⌃ snap
hold) and the numeric-field key table (arrows, Shift ×10 / Alt ×0.1, Enter/Esc) — Help is
finally complete. Menubar items render shortcut chips by commandId lookup: one source of
truth for binding, menu label, palette row, and help.

---

## 12. Phone (< 640px) adaptation framework — FULL parity (LOCKED #6)

Every v2 surface has a phone variant; phone UX is a feature set, not a fallback. Area
designs MUST build from these shared primitives — no bespoke phone forks:

| Primitive | Spec |
|---|---|
| **PhoneTopBar** | one slim row: `☰` (MenuSheet) · mode name · project chip (→ Projects…) · ↶ ↷ undo/redo |
| **MenuSheet** | `☰` renders the SAME MenuSpec tree as a drill-down sheet (list → submenu push, back header). Zero parallel menu wiring — the entire menubar is reachable; no feature loses its phone path |
| **ModeTabBar** | bottom fixed bar, 5 mode tabs (icon + label), safe-area padded; tap = switch mode; **re-tap the active tab = open its Panel sheet** |
| **Sheet** | the one bottom-sheet primitive (detents 50% / 92%, drag grabber, drag-dismiss): **Panel sheet** hosts the right-sidebar content; **Inspector sheet** hosts the left-sidebar content, opened via the selection count FAB/chip that appears whenever the left sidebar would have content. Both host the identical desktop panel components at `sm` density; nudge/rotate get touch steppers inside the Inspector sheet's transform card (closes the census touch gap) |
| **Timeline** | fullscreen sheet (LOCKED), opened from a transport chip that docks above the status strip in Animation mode (mini play + scrub when closed) |
| **CondensedStatusBar** | one strip above the tab bar: mode/tool chip (**while a one-shot tool is armed, tap = cancel it** — the phone's Esc) · **active-layer chip** `Layer: <name>` (Build/Animation only; tap = layer picker — v1 phone-FAB parity) · message channel (tap → notification sheet) · selection count chip · snap chip · 🔔. Modifier-hint and rotate/nudge segments are desktop-only (keyboard features) |
| **Dialog mapping** | S → center, M/L → cover; stacked views become pushed sheet views; popovers → sheets; palette → fullscreen sheet |
| **Floating windows** | Tool bar → pinned strip above the condensed status bar; Chain → 50% non-blocking sheet (session intact across dismiss/reopen — non-modality preserved) |

iOS zoom-lock viewport meta, `useIsPhone` (max-width 639px) breakpoint, and viewport
focus-stealing all survive unchanged.

### Phone frame

```
┌──────────────────────────────┐
│ ☰  Build      Rover-7  ↶ ↷   │  ← PhoneTopBar (☰ = full MenuSpec drill-down)
├──────────────────────────────┤
│                              │
│          VIEWPORT            │
│                              │
│                       ┌────┐ │
│                       │ ③  │ │  ← selection FAB → Inspector sheet
│                       └────┘ │
├──────────────────────────────┤
│ Exported ✓ · Layer:Hull · 🔔2│  ← CondensedStatusBar
├──────────────────────────────┤
│  ⬚     ▶     ☰     🚀    ◧   │  ← ModeTabBar (re-tap active = Panel sheet)
│ Build  Anim  Data  Eng  Surf │
└──────────────────────────────┘
Sheets: Panel (right content) · Inspector (left content) · Timeline (fullscreen, Anim)
· MenuSheet (☰) · Notifications · ⌘K palette (fullscreen)
```

---

## 13. Shell state architecture

New/changed stores — all `src/state/`, zero react/three imports (layering constitution):

| Store | Atoms (shapes) | Persistence | Replaces |
|---|---|---|---|
| `modeStore` | `$mode: Mode` (boots `'build'`) · `$activeTool: Tool \| null` · per-mode sub-state re-exports clamped vs `$part` · enter/exit hook registry (the setMode choreography point) | ephemeral | `$inspectorMode`; ad-hoc suppression orchestration (per-feature flags stay in their stores; EditorScene consumes `$mode`/`$activeTool`) |
| `layoutStore` | `$layout = { left:{width,collapsed}, right:{width,collapsed}, timeline:{height,collapsed}, float: Record<windowId,{x,y}\|null>, floatOrder: windowId[], floatHidden: windowId[] }` (`floatHidden` backs Window ▸ Tool Bar — system-services §6.4) | `flexo:layout` (one key, persistentJSON, defensive `{...DEFAULTS, ...stored}` read) | `$inspectorVisible/$inspectorWidth/$inspectorFloatPos/$animPreviewFloatPos` |
| `statusStore` | `$statusMessage {text, severity, expiresAt, actionId?}` · `$progress` (per-file map derived from `$loadProgress`) · `$toolStatus` (tool segment model) | ephemeral | toast queue (transient tier); TransformHud/MeasurementInfo/SeatViewBar/LoadProgress surfaces |
| `notificationStore` | `$notifications` (ring 100) · `$unreadCount` · imperative `notify()` | session-only | toast queue (retained tier), ImportReportCard state, purge notice, build-mismatch dialog |
| `modifierStore` | `$heldModifiers {alt,shift,ctrl,meta}` (window keydown/keyup + blur reset) · `$hoverContext` · `$modifierHints` (computed from registered hint providers × mode × tool) | ephemeral | (new) |
| `commandStore` | command registry `{id, title, menuPath, keys?, scope, enabled?(), checked?(), run()}` + dynamic providers · `$paletteOpen` | static + selectors | scattered menu wiring; controlled/uncontrolled dual APIs; undo-toast ×4 duplication |
| `dialogStore` | `$openDialog {id, params} \| null` · `$dialogViewStack` | ephemeral | per-component dialog booleans, `$helpOpen`, `$aboutOpen` |
| `snapStore` | `$snapEnabled` · `$snapTranslateStep` · `$snapRotateStep` (writes through to the existing `$snap` plumbing) | `flexo:snap` | dormant `$snap` gets UI (LOCKED) |
| `projectIndexStore` (LOCKED #3) | `$projectIndex` (reactive metadata rows: id, name, description, counts, timestamps, thumbnail ref) | IndexedDB-backed | `listProjects()` + setTick hack (storage design owned by the projects area) |

**Kept as-is**: editorStore (document/selection/undo/nudge/rotate atoms), layerStore,
viewStore (`$grids/$hideInterior/$cameraSnap/$cameraRestore/$cameraState` — camera-per-
project persistence unchanged), settingsStore, lightingStore, feature session stores
(chainStore, ivaStore, engineStore, animationStore, customAssetStore, measurementStore,
containerStore, catalogStore, reactionStore, modFolderStore), loadProgressStore.
`registerEditorAidStores` boot wiring order and hydrate sequence unchanged.

**Rules**: `toast()`/`notify()` stay imperative module functions callable outside React.
Scene→UI reports (`$selectionBounds`, `$lightPreviewCount`, coverage) and intent atoms
(`$colliderFitRequest`, `$cameraSnap` nonce, seat-aim) are untouched patterns. Undo
invariants unchanged: document mutations only; mode/layout/status/notifications/windows
never create undo steps; discrete-vs-streaming enrollment (`onInteractionStart`) untouched.
Persist-by-default via `@nanostores/persistent`; **no migration ever** — v1 layout keys are
simply abandoned (defensive reads drop unknown shapes; Reset wipes). Selection may move to
stable ids as an area-level implementation option — the shell treats selection as opaque.

---

## 14. Interaction conventions

### 14.1 Selection
- Viewport: click select · ⌘/⌃/⇧-click additive toggle · empty-click clears (non-additive) ·
  ≤4px gesture rule distinguishes orbit · locked/hidden-layer guards · nozzle-handle pick
  priority · reveal-in-list — all preserved verbatim.
- **NEW (LOCKED #7)**: **marquee** — ⇧-drag starting on empty canvas = additive box select;
  ⌥⇧-drag = subtractive; the `B` tool arms a one-shot replace-marquee. Respects hidden +
  locked layers (same guards as click). Plain drag remains orbit.
- Lists: react-aria gestures + grow-only ⇧-range (`useShiftRangeSelect` semantics verbatim).
- Selection survives mode switches; locked-layer members make transform ops whole-selection
  no-ops (unchanged).

### 14.2 Drag conventions
- Every draggable has a visible affordance: grip dots (floating windows), 2px/8px edge
  strips (sidebars, timeline), diamonds (keyframes), row grips (layers, chain steps).
- Gizmo drags: ONE undo push at drag start; streaming updates; orbit disabled during drag
  (unchanged).
- **⌥-drag duplicate (LOCKED #7)**: ⌥ held at gizmo/entity drag start duplicates the
  selection first (one undo step 'duplicate'); the copies become the drag target. The
  modifier hint advertises it.
- **⌃ held during a gizmo drag** = temporary snap invert (LOCKED #7).
- Panel resize / window drag: pointer capture, live persist.

### 14.3 Confirm-before-destroy policy (one rule, applied everywhere)
- Destructive + fully undoable + small (≤5 entities): **no confirm**; status flash with an
  inline `[Undo]` button (10s).
- Destructive + fully undoable + large (>5) OR whole-container (layer delete w/ move-vs-
  delete choice, Delete All (N), clip delete): confirm (inline strip or stacked view),
  stating counts.
- Destructive + NOT fully undoable (asset bytes, project delete, import-batch removal,
  Reset Everything, discard chain session with steps, discard dirty glow paint): always
  confirm, with the irreversibility stated explicitly (bytes-vs-descriptor wording kept).

### 14.4 Density / typography — §1.2 tokens. `xs` in chrome, `sm` in dialogs/phone;
mono + tabular-nums for numbers; axis colors everywhere; buttons keep `cursor-default`
(desktop-app convention) consistently.

### 14.5 Rendering — on-demand render loop is inviolable: no new chrome may force
continuous rendering (FPS counter opt-in remains the only continuous mode).

---

## 15. Desktop wireframes

### 15.1 Build (default)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ File Edit Add Select View Tools Window Help   [⬚Build][▶][☰][🚀][◧]      Rover-7 ▾  ↶ ↷  ⌘K │
├───────────────┬──────────────────────────────────────────────────────────┬───────────────────┤
│ thruster_1  ⋮ │        ┌──────────────────────┐                          │ OUTLINER  🔍      │
│───────────────│        │ ⠿ ◇Move ◆Rot ◇Scl ⧉▾ │ ← Tool bar (floating,   │ ▾ ● Hull 12 👁 ◐ 🔒│
│ POSITION (m)  │        └──────────────────────┘    draggable, clamped)   │    ⬚ thruster_1 ✓ │
│  X 0.000      │                                                          │    ⬚ tank_2     ⋮ │
│  Y 1.250      │                                                          │    ⊙ connector_1  │
│  Z 0.000      │                    3D CANVAS                             │ ▸ ○ Wings 4 👁 🔒  │
│ ROTATION (°)  │        (canvas exactly fills this cell;                  │ ▸ ○ IVA Seats 2   │
│  X 0 Y 45 Z 0 │         orbit center == visible center)                  │ ▸ ○ Lights 1      │
│ SCALE (×)     │                                                          │ ▸ ○ Kittens 1     │
│  X 1 Y 1 Z 1  │                                                          │ [＋ Layer…]       │
│───────────────│                                                          │───────────────────│
│ Instance id   │                                                          │ ▸ AIDS (2)        │
│ SubPart Data →│                                                          │                   │
│ Edit Surface →│                                                          │                   │
├───────────────┴──────────────────────────────────────────────────────────┴───────────────────┤
│ ⬚Build │Layer: Hull ▾│ │1 SubPart · 2.4×1.1×0.9 m│ SubPart added ✓ [Undo] │⌥Dup ⇧Add│↻Y 45°│⇅Y 0.1m│⧉│🔔2│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 15.2 Animation

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ File Edit Add Select View Tools Window Help   [⬚][▶Animation][☰][🚀][◧]  Rover-7 ▾  ↶ ↷  ⌘K │
├───────────────┬──────────────────────────────────────────────────────────┬───────────────────┤
│ JOINT: HingeL⋮│                                                          │ CLIPS          ＋ │
│───────────────│              (pose gizmo: rotate-about-pivot             │ ● Deploy 2.0s     │
│ MEMBERS (3)   │               rings, ⊕ pivot marker at rest              │ ○ Antenna (draft) │
│  panel_a    ✕ │               frame, ↝ trajectory curves)                │───────────────────│
│  panel_b    ✕ │                                                          │ JOINTS            │
│ [Attach 2 sel]│                    3D CANVAS                             │ ▾ Root            │
│ [Choose…]     │                                                          │   ● HingeL (3)    │
│ PIVOT         │        ┌──────────────────────┐                          │     └ TipL (1)    │
│ [Set to sel]  │        │ ⠿ ◇Move ◆Rot ◇Scl ⧉▾ │                          │   ○ HingeR (3)    │
│ [pos only]    │        └──────────────────────┘                          │───────────────────│
│ POSE @1.2s    │                                                          │ EASING (per-chan) │
│ pos… rot…     │                                                          │ [curve editor]    │
│ scale…        │                                                          │ SOLAR TRACKING ▸  │
├───────────────┴──────────────────────────────────────────────────────────┴───────────────────┤
│ ▶⏸ ⟲ 1×▾ │ , . │ t 1.24/2.00s │ ＋Key(K) │ latch 🔓                                    ⌄     │
│ HingeL   ◆────────◆──────────◆────────────────⚓            ║playhead                        │
│ TipL     ◆──────────────◆                                   ║                               │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▶Anim │Layer: Hull ▾│ │joint: HingeL · kf @1.2s│ Pose updated │Space ⏯ ,/. keys│⧉│🔔        │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 15.3 Data

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ File Edit Add Select View Tools Window Help   [⬚][▶][☰Data][🚀][◧]      Rover-7 ▾  ↶ ↷  ⌘K  │
├────────────────────┬────────────────────────────────────────────┬────────────────────────────┤
│ Part — "Rover"     │                                            │ DATA SCOPES    🔍          │
│────────────────────│                                            │ ▣ Part (Rover)  ⛁2 ⚡3     │
│ ▾ IDENTITY         │              3D CANVAS                     │ ── SubPart templates ──    │
│   Part Id [rover_1]│     (viewport visible — "Select in 3D"     │ ▣ TankB       ⛁2 ☀1       │
│   Name […] Tags[⬢+]│      pickers reveal live; selected         │ ▣ ThrusterA   🚀           │
│ ▾ MASS             │      template's placements highlighted)    │ ▣ NoseCone    ＋ add data  │
│ ▾ TANKS (2)        │                                            │ ── not data-capable ──     │
│ ▾ POWER (3)        │                                            │ ◌ connector_1   (dim)      │
│ ▾ COUPLING         │                                            │ ◌ Seat 1        (dim)      │
│ ▾ WIRING  [→Engine]│                                            │ ◌ kitten_1      (dim)      │
│ ▶ ADVANCED         │                                            │────────────────────────────│
│ ▶ PASSTHROUGH XML  │                                            │ ⚠ 1 block · 2 warn → jump  │
├────────────────────┴────────────────────────────────────────────┴────────────────────────────┤
│ ☰Data │ scope: Part │ 1 blocker: mixture ratio missing → │              │⧉│🔔 1              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 15.4 Engine

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ File Edit Add Select View Tools Window Help   [⬚][▶][☰][🚀Engine][◧]    Rover-7 ▾  ↶ ↷  ⌘K  │
├────────────────────┬────────────────────────────────────────────┬────────────────────────────┤
│ Combustor #1     ⋮ │                                            │ ENGINE [ThrusterA ▾]  ＋▸  │
│────────────────────│              ╭─────────╮                   │────────────────────────────│
│ Reaction [Hydrolox]│              │  MODEL  │                   │ MODULES                    │
│ O/F ratio  [5.5]   │              ╰──┼──────╯                   │ ● Combustor #1             │
│ Chamber P [110 bar]│                 ▲ amber physics            │ ○ Nozzle #1                │
│ Thermal η  [96 %]  │                 ▼ cyan FX handles          │ ○ Rocket main              │
│ Min throttle [40 %]│                                            │ ○ Controller eng           │
│ FEEDS FROM         │      ┌──────────────────────┐              │ ○ Feed wiring (2)          │
│  · Parent        ✕ │      │ ⠿ ◇Move ◆Rot  ⊘Scl ⧉│              │ ▶ Custom propellants       │
│  [+ feed]          │      └──────────────────────┘              │────────────────────────────│
│                    │       (Scale clamped → Move while          │ PERFORMANCE                │
│                    │        placing exhaust)                    │ 245 kN vac · Isp 445.4 s   │
│                    │                                            │────────────────────────────│
│                    │                                            │ ⚠ ISSUES  block 0 · warn 1 │
│                    │                                            │ EXHAUST ▦▦▦  [Place in 3D] │
├────────────────────┴────────────────────────────────────────────┴────────────────────────────┤
│ 🚀Engine │ Exhaust: Nozzle1 #2 · FX │ │            │⌃ temp snap│↻Y 45°│⇅Y 0.1m│⧉│🔔         │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 15.5 Surface

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ File Edit Add Select View Tools Window Help   [⬚][▶][☰][🚀][◧Surface]   Rover-7 ▾  ↶ ↷  ⌘K  │
├────────────────────┬────────────────────────────────────────────┬────────────────────────────┤
│ FACE: +X side      │              ╭─────────╮                   │ MESHES 🔍  [Asset Mgr… ⇧⌘A]│
│ Texture [plate ▾]  │              │  MODEL  │                   │ ▣ Hull Box  prim ×2        │
│ Wrap    [repeat ▾] │              │ ▩ face  │ ← selected face   │ ▣ Dish      import ×1      │
│ UV scale  [2][2]   │              ╰─────────╯    highlighted    │ ▣ visor     kitten         │
│ UV offset [0][0]   │                                            │ ── Hull Box ──             │
│────────────────────│                    3D CANVAS               │ Name [Hull Box] W H D      │
│ SELECTION          │                                            │ MATERIAL [Steel ▾] ✎ ＋    │
│ (transform card    │                                            │ FACES [+X*][−X][+Y][…]     │
│  as in Build)      │                                            │ GLOW mode[ramp ▾] [paint…] │
│                    │                                            │ ▶ VISOR SURFACE            │
│                    │                                            │ ▶ IMPORTED (provenance)    │
├────────────────────┴────────────────────────────────────────────┴────────────────────────────┤
│ ◧Surface │ mesh: Hull Box · face +X │ Texture applied │           │⧉│🔔                      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

(Phone frame: §12.)

---

## 16. RULE ZERO ledger — every v1 feature → its v2 home

| v1 feature / surface | v2 home |
|---|---|
| Project button: name display, rename, New, Load list (counts, savedAt, delete w/ confirm) | Menubar project chip + File menu + Project Manager (§10.2; reactive index replaces setTick) |
| Autosave-only model, boot restore, boot purge notice | unchanged; purge notice → warning notification; ⌘S flash |
| Share link (Zstd URL, boot flow, suppressions), Export/Import project JSON | File → Share Link… / Export Project Archive… (.tar.gz, LOCKED #3, gate removed) / Import Project… (additive, one undo step); share-link boot behaviors unchanged (skip build check, suppress About, param strip) |
| Add menu — all 14 entries + submenus + collider fit intent | Add menu (§3) — item-by-item |
| Viewport `.glb` drag-drop import | unchanged (canvas-cell drop zone) |
| Part Data dialog (Identity/Mass/Tanks/Power/Coupling/Engine + issues) | Data mode, Part scope (§7.3/§8.3) |
| SubPart Data dialog (ManageTanksModal: tanks/lights/solar/thrust chamber) | Data mode, template scope; jump from Build inspector/Outliner |
| Export dialog (XML/Mod, 3 tabs, pre-flight, folder grant, zip fallback, non-overwrite, mod.toml) | Export to KSA… ⌘E (§10.6); grant lifecycle also in File → Mods Folder ▸ |
| View popover (camera snaps, grids, hide-interior, light coverage/exposure/preview, environment/tonemap/exposure/reflections/sky) | View menu (toggles/radios) + Settings → Viewport/Scene (numerics) + status-bar cap warning |
| Measure popover (bounds display, orientation, per-mesh dims, distance, p2p tool, ref lines, containers, warn precision, units) | View → Measurement Overlays/Units + Tools menu + Outliner Aids section + left-sidebar aid editors + status readout |
| Undo/Redo buttons + History popover | Menubar ↶ ↷ + Edit → Undo/Redo/History ▸ |
| Settings burger (Scale Everything / Settings / Shortcuts / About / Reset) | Edit → Scale Everything… / Edit → Settings… ⌘, / Help → Shortcuts / Help → About / Settings → Advanced → Reset 🔥 |
| SettingsModal contents (FPS, connector size, seat marker + gaze cone, selection highlight, kitten texture export) | Settings tabs (§10.7) |
| Layers popover (9 per-row controls, reorder, create, delete flows, opacity popover) | Build Outliner layer rows (§8.1) + status-bar active-layer chip |
| Assets list (sections, search, multi-select, row menus, reveal, seat-view entry) | Build Outliner entity rows (§8.1) |
| Custom Assets modal ("Custom (N)") | Asset Manager ⇧⌘A (§10.3) |
| ManageTexturesPanel / MaterialDialog / GlowPaintDialog / visor surfaces / simulate-glass | Surface mode (§8.5) + dialogs kept |
| CustomTexture / CreateMesh dialogs | Add menu entries (dialogs kept) |
| Import model dialog (3-state, sticky prefs, replace mode) + ImportReportCard | Import Review (§10.4) + notification center rich entry |
| Catalog browsers (split panes, previews, fresh session, destination layer, add-and-stay, $browserPopupCount) | §10.10 (gesture normalization noted) |
| Animation panel (clips/joints/keyframes/pose/easing/solar), Mesh Picker, preview scrubber ×2, Esc unwind | Animation mode: right navigator + left editor + timeline dock; SubPart Set Picker (§10.11); transport (single home); Esc rung 7 |
| Engine mode (panel, toolbar, perf readout, exhaust placement, custom propellants, validation) + ConsumerFeedWiring | Engine mode (§7.4/§8.4) — self-sufficient per LOCKED |
| Chain palette (⌘K, 6 ops, ghosts, caps, one undo step, chainDefaults persistence, live re-flow) | `chain` floating window (§6.2), ⇧⌘K + Edit menu + palette command; + drag/resize/reorder/discard-confirm |
| Seat view (bar, prev/next mirroring game C-order, honesty note, Esc) | Status-bar tool segment + Tools ▸ Sit in Seat; Esc rung 8 |
| TransformHud (rotate/nudge chips, cycle actions, chord tooltips) | Status-bar chips (§5 #8) + same hotkeys |
| MeasurementInfo (bbox readout, unit, world/oriented badge) | Status-bar selection readout |
| WorkspaceLoadProgress / PreviewLoadProgress | Status-bar progress + popover / browser preview overlays (kept) |
| Toasts (~44 sites, imperative API) | `toast()` facade → status channel + notification center (§5.1) |
| FPS counter (continuous-loop flip, stats.js) | View toggle + status segment + in-viewport panel |
| Kitten flows (add, add-at-seat, Make Kitten Mesh, texture export mode) | Add menu · seat inspector · Surface mode · Settings → Import & Export |
| Collider fit/coverage/owner re-homing; seat reorder/aim/sit; light dual-frame editor | Left-sidebar per-kind inspectors (guts unchanged) + Tools menu |
| Scale Everything | Edit menu |
| Editor tags | Data mode Identity section |
| RawXmlNode passthrough | untouched invariant + NEW read-only viewer (Data → Passthrough) |
| Boot build-id mismatch dialog | sticky notification w/ [Reload] [Reset everything…] (S26) |
| About first-run auto-open (+ share-link suppression), legal attribution | kept (§10.5) |
| Reset Everything (3 entry points, FS-grant switch, flexo-fs preservation) | one command: Settings → Advanced + mismatch notification action (switch present on ALL platforms) |
| Hotkeys registry + HelpDialog single-source | scoped registry (§11) + Help (§11.5) |
| Hidden hotkey behaviors (chain ⌘↩/Esc, anim unwind, layer rename, numberDraft keys, list gestures) | registered scopes / static Help sections (§11.1, §11.5) |
| Mobile shell (top bar, overflow, FAB, sheets, iOS zoom lock) | §12 primitives |
| Wiki part-preview mini-app, `?debug=dockingport` calibration | untouched, deliberately unlinked |
| Numeric-field model (useNumberDraft, inputMode="url", all behaviors) | constitution §7.6/§14 — unchanged everywhere |

Constitution checks: state layering unchanged; on-demand render loop unchanged; dark-only;
chain non-modal; connectors/kittens never joint members; coords.ts / formatG6 / KSA XML +
GLB contracts untouched; scope/ + docs/ updated by implementation.

---

## 17. Implementability notes (build order — repo compiles and runs at every step, LOCKED #4)

1. **Docked skeleton first, guts untouched**: land MenuBar/StatusBar/Sidebar/ResizeHandle +
   `layoutStore` + docked canvas; old panels rehost as-is (AssetsList into the Build
   sidebar is a mount-point change). Off-center orbit is fixed here with zero three-layer
   work.
2. **commandStore + MenuSpec menubar** replace Toolbar/MobileTopBar; dialogs keep their
   components and gain dialogStore ids; palette lands on the same registry.
3. **statusStore/notificationStore** behind the `toast()` facade; delete the toast region
   last; TransformHud/MeasurementInfo/SeatViewBar/LoadProgress fold into segments.
4. **modeStore** replaces `$inspectorMode` (mechanical re-point + setMode choreography);
   hotkey scopes land with it.
5. **FloatingWindow** for Tool bar + Chain; delete the four bespoke drag implementations.
6. Mode-by-mode sidebar rehosts: Build (Outliner) → Data → Engine → Surface →
   Animation + timeline (hardest last). Project Manager / tar.gz archive / Asset Manager /
   Set Picker land as independent dialog tracks.

Area designs plug into fixed extension points — a mode contributes: (right-sidebar
component, left focus ruleset, viewport affordance flags, hotkey scope entries, status
segments, MenuSpec additions, phone sheet content). Nothing else about the shell is
negotiable per-area.
