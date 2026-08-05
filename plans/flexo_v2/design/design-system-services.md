# flexo v2 — SYSTEM SERVICES design (status bar, notifications, palette, hotkeys, help, window manager, kit/density)

Scope: the cross-cutting service layer every mode/area design plugs into. Designed strictly
within `design/foundation.md` (THE LAW); this document expands foundation §1.2/1.3 (tokens,
z), §4 (commands), §5 (status bar), §5.1/5.2 (toasts/notifications), §6 (floating windows),
§10.1 (dialog conventions), §11 (hotkeys, palette, Esc ladder, Help) into implementable
specs. Primary census inputs: `analysis/ui-kit-hotkeys.md`, `analysis/shell-layout.md`,
`analysis/chains-misc.md`, `analysis/selection-transform.md`, `analysis/viewport-scene-view.md`.

**Foundation deviations: NONE.** Everything here refines foundation; where a refinement
adds something foundation is silent on (advisory chips §1.8, palette recents §3.4, Esc-rung
metadata §4.6) it is additive and consistent with the four IA laws.

---

## 0. Service inventory & ownership

| Service | New stores | New kit/ui pieces | Replaces (v1) |
|---|---|---|---|
| Status bar | `statusStore`, `modifierStore` | `StatusBar`, `StatusChip`, `Kbd` (moved to kit) | TransformHud, MeasurementInfo, SeatViewBar, WorkspaceLoadProgress, toast spam |
| Notifications | `notificationStore` | `NotificationBell`, `NotificationCenter` | GlobalToastRegion (retained tier), ImportReportCard, boot purge toast, BuildIdMismatchDialog |
| toast() facade | (routes into the two above) | `toast.ts` facade (module fn) | `kit/Toast.tsx` queue + region (deleted) |
| Command palette | `commandStore.$paletteOpen`, `$paletteRecents` | `CommandPalette`, `fuzzyMatch.ts` | (new; absorbs ⌘K from chain) |
| Hotkeys v2 | `hotkeyStore` (`$activeScopes`, `$focusedSurface`) | `hotkeys/registry.ts` v2, `GlobalHotkeys` v2, `HelpDialog` v2 | v1 flat registry + 5 off-registry local binding sites |
| Window manager | `layoutStore.float/floatOrder` | `FloatingWindow`, `usePointerDrag`, `ResizeHandle` | FloatingInspector/FloatingPreviewToolbar drag code, RightPanel handle, VerticalSplit internals |
| Kit/density | — | `xs` size tier, `zIndex.ts`, `panelChrome`, `DialogViewStack`, `InlineConfirmStrip`, `ColorField`, `CopyDownloadBar`, wash tokens | ad-hoc z literals, 4 drag impls, duplicated chrome string, native `<input type=color>`, modal-in-modal |
| Help/onboarding | (dialogStore ids) | `HelpDialog` v2 (registry-generated), About kept | HelpDialog v1 |

None of this area's state is ever undoable. Persistence: `flexo:layout` (window positions,
sidebar geometry — foundation §13), `flexo:snap`, `flexo:paletteRecents`. Everything else
ephemeral/session. All stores in `src/state/`, zero react/three imports (constitution);
imperative entry points (`toast`, `notify`, `status`) are plain module functions.

---

## 1. Status bar — final spec

### 1.0 Geometry & container

- One row, full width, last flex child of the shell column (foundation §1). Height =
  `text-xs` line (1rem) + 2 × `--bar-py` (0.125rem) + 1px top border ≈ **22px**. Never
  collapses, never wraps; overflow policy per-segment (§1.1).
- Component `StatusBar` (`src/ui/status/StatusBar.tsx`). Interior controls are `xs`-tier
  chips (`StatusChip`: inline-flex h-full items-center gap-1 px-1.5 text-xs, hover wash,
  `cursor-default`); dividers are 1px `border-border` verticals with `--density-gap` margins.
- Three alignment groups in one flex row — **left** (posture), **center flex-1** (message +
  progress), **right** (hints/chips/bell). Groups never shift when a sibling segment
  hides: left and right groups are `flex-none`, the center absorbs all slack.
- Numbers render `font-mono tabular-nums`. Axis letters tinted with the gizmo colors
  (X `#ef4444`-family red, Y green, Z blue — same constants as the gizmo; exported from one
  place: `src/ui/status/axisColors.ts`, replacing TransformHud's private copy).

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⬚ Build │ Layer: Hull ▾ │ ▥ Measure — click first point · Esc │ 3 SubParts · 2.40×1.10×0.85 m ⬚
│   ····· SubPart added ✓ [Undo] ····· [▓▓▓░ 62%] ···  ⌥ Duplicate drag · ⇧ Add │ ↻Y 45° │ ⇅Y 0.1m │ ⧉ │ 62 │ 🔔3 │
└────────────────────────────────────────────────────────────────────────────────────────────┘
(one physical row; drawn wrapped here for legibility)
```

### 1.1 Segment table (left → right; a segment with no content unmounts entirely)

| # | Segment | Group | Shown when | Overflow behavior |
|---|---|---|---|---|
| 1 | Mode chip | left | always | fixed |
| 2 | Active layer chip | left | mode ∈ {build, animation} | name truncates 14ch |
| 3 | Tool segment | left | `$activeTool` ≠ null OR chain session open | instruction truncates first |
| 4 | Selection readout | left | selection non-empty AND `$selectionBounds` ≠ null | dims drop before counts |
| 5 | Message channel | center | message live | truncate w/ ellipsis; full text in center |
| 6 | Progress | center-right | any tracked job active | fixed 96px bar |
| 6b | Advisory chips | right | condition true (§1.8) | max 2 |
| 7 | Modifier hints | right | desktop AND ≥1 hint for current context | max 3 hints, priority-ordered |
| 8 | Rotate / nudge chips | right | desktop AND (mode ∈ {build, animation} OR a transformable selection exists) | fixed |
| 9 | Snap chip | right | desktop, always | fixed |
| 10 | FPS | right | View → FPS Counter on | fixed 4ch |
| 11 | Bell | right | always | fixed |

Below ~860px viewport width (narrow desktop, not phone): segments 7 and 8 hide (keyboard
features degrade gracefully); everything else stays. Phone: replaced wholesale by
`CondensedStatusBar` (§8.1).

### 1.2 Segment specs

**1 · Mode chip** — mode icon + name (`⬚ Build`). Click → mini react-aria Menu listing the
five mode commands (same commandIds as the menubar switcher; checkmark on current). Renders
from `$mode`. Tooltip: "Editing mode — 1–5 to switch".

**2 · Active layer chip** — `Layer: <name> ▾`, name truncated 14ch. Click → Menu of layers
(name + count chip + lock icon when locked; locked layers selectable as active — matches v1
semantics where active layer just targets adds). Selecting sets the active layer
(`layerStore.setActiveLayer`, not undoable — view state). Hidden in Data/Engine/Surface.
Fixes the v1 "active layer visible nowhere" gap.

**3 · Tool segment** — model comes from `statusStore.$toolStatus`, written by the owning
tool's store hooks (each transient tool + the chain session registers a status model on
arm, clears on disarm — foundation §2.6 says each tool owns a status segment). Shape:

```ts
interface ToolStatus {
  toolId: 'measure' | 'seat-view' | 'exhaust' | 'marquee' | 'chain';
  icon: IconName;
  text: string;                       // live instruction, e.g. "Measure — click first point"
  kbdHints?: ChordToken[][];          // e.g. [['Esc']] rendered as Kbd chips
  controls?: ToolControl[];           // inline interactive controls (see below)
  focusSurface?: SurfaceId;           // click on the segment focuses this surface
}
```

Per-tool contents (verbatim behaviors preserved):
- **Measure**: `▥ Measure — click first point · [Esc] cancels` → after first pick
  `…click second point`. No controls. (Fixes v1's invisible half-placed state —
  viewport-scene-view.md pain 6.)
- **Seat view**: `👁 Seat 2 / 4 · [◀][▶] · [Exit Esc]` — ◀/▶ are real xs icon buttons
  cycling seats (wraps document order, re-selects the seat, mirrors game C key — v1
  SeatViewBar behavior verbatim); ⓘ icon with the honesty tooltip ("flexo draws every
  SubPart, interior or not") kept verbatim; Exit button with `Esc` Kbd chip.
- **Exhaust**: `🔥 Exhaust: NozzleB · #2 · FX` — target chip mirrors the engine sidebar's
  active nozzle ref; click focuses the Engine right sidebar's exhaust section.
- **Marquee**: `⬚ Box select — drag to select · [Esc]`.
- **Chain (mirror)**: `⛓ Chain · 12 instances · +8 new` (or the engine error in red) —
  read-only mirror of the chain window footer; click raises/focuses the chain window.
  Rendered whenever `$chainSession` ≠ null even though chain is not in the tool slot; if a
  pointer tool is ALSO armed, the tool renders first and the chain mirror renders as a
  second compact chip (`⛓ 12·+8`) — both fit because instructions truncate first.

**4 · Selection readout** (absorbs MeasurementInfo) — `3 SubParts · 1 Light │ 2.40×1.10×0.85 m ⬚`.
- Counts by kind from the selection selectors (kinds with 0 omitted; >2 kinds collapses to
  `5 items`). Dimensions W×H×D from `$selectionBounds` (written by MeasurementLayer,
  unchanged) formatted in the measurement unit (`$measurementSettings.unit`); diagonal in
  the tooltip (v1 parity). Trailing badge = bounds mode: `⬚ world` / `◇ oriented`.
- Click the badge (or the whole dims area) toggles World/Oriented — writes
  `$measurementSettings.boundsMode` (persisted; same store the View ▸ Measurement Overlays
  radio edits). Not undoable (view state).
- Hidden when the "Show bounding box" overlay setting is off? **No** — readout stays (it is
  a readout, not the 3D overlay); only the 3D box obeys the toggle. `$selectionBounds` is
  computed regardless (v1 behavior: MeasurementLayer always writes it).

**5 · Message channel** (the toast landing strip) — renders `statusStore.$statusMessage`:

```ts
interface StatusMessage {
  text: string;
  severity: 'info' | 'success' | 'warning' | 'danger';
  expiresAt: number;                  // Date.now() + duration (severity table §2.2)
  action?: { label: string; run(): void };  // e.g. inline [Undo]
  notificationId?: string;            // set when a center entry mirrors this message
}
```

- New message **overwrites** the previous unconditionally (the brief's rule). Severity
  tints text + a 2px leading severity dot (info=fg-muted, success=accent, warning=amber,
  danger=red). Expiry via one `setTimeout` owned by the store (reset on overwrite); on
  expiry the segment fades (120ms) to empty.
- Inline action button (`[Undo]`) renders as an xs ghost button; used by the
  confirm-policy "no-confirm small deletes" flash (foundation §14.3) — `run` calls
  `undo()` and is disabled if further undo steps were pushed since (the store captures the
  undo-stack depth at flash time and compares).
- Click anywhere else on the message → opens the notification center (if the message has a
  `notificationId`, that entry is scrolled-to and expanded).
- The channel is a **single slot, not a queue** — deliberate. Anything that must not be
  lost goes to the center (routing §2.2 guarantees warning/danger always mirror there).

**6 · Progress** (absorbs WorkspaceLoadProgress) — compact 96px bar + `62%` (or an
indeterminate barber-pole when total bytes unknown) + count chip when >1 job (`3 files`).
- Data: `statusStore.$progress`, derived from `$loadProgress` (the existing `trackDownload`
  funnel for HDR/GLB/KTX2) **plus** a new `trackJob(label)` handle for non-download work
  (project archive export/import tar.gz build, mod zip build) so long operations share the
  surface. Aggregate = bytes-weighted mean; jobs without totals count as indeterminate.
- Click → popover (anchored above, `w-80`): one row per job — file/job name (truncated
  middle), per-file bar, bytes readout. Rows disappear on completion; popover auto-closes
  when empty.
- Min-display 500ms (no flicker for cache hits). While `$browserPopupCount > 0` the segment
  still renders (unlike v1's hide) but the catalog browsers keep their own
  `PreviewLoadProgress` pane overlay (foundation §5 #6: "browser dialogs keep their own
  preview-pane overlay") — the double-surface swap hack is deleted; both may show.

**6b · Advisory chips** — see §1.8.

**7 · Modifier hints** — see §1.4.

**8 · Rotate / nudge chips** (absorbs TransformHud) — two adjacent chips:
- `[↻ Y · 45°]` — rotate: circular-arrow icon, active pair-1 axis letter (axis-tinted),
  step in degrees. Click = cycle all pair axes (same action as `R`, via
  `rotateControls.cycleAxes()` — feedback now lands in the message channel as a transient).
  Tooltip = the full v1 `RotateHint` chord table verbatim (Kbd rows for W/S A/D Q/E with
  their CURRENT axis mapping, R cycle, `[`/`]` step — note the rebind from F/⇧F).
- `[⇅ Y · 0.1 m]` — nudge: axis letter tinted, step in meters. Click = cycle nudge axis
  (same as `→`). Tooltip = v1 `NudgeHint` table (arrows, ⇧-arrows fast ×5, ⇧←/→ step).
- Reads `$rotateStep/$rotateAxisOffset/$nudgeAxis/$nudgeStep` (persisted, unchanged).
  Always shown in Build/Animation. In Data/Engine/Surface the chips render **whenever a
  transformable selection exists** — the nudge/rotate keys stay live there via viewport
  scope (S8), and a keypress must never mutate the document with zero visible posture
  feedback (v1's TransformHud was always visible). They hide in those modes only when
  nothing transformable is selected (then the keys are no-ops anyway). Desktop only.

**9 · Snap chip** — `⧉` magnet icon, accent-filled when `$snapEnabled`. Click toggles.
Mirrors the Tool bar's snap state 1:1 (both write `snapStore`). Tooltip: current steps
("0.25 m · 15°") + "hold ⌃ while dragging = temporary opposite". Right-click / long-press →
the same step popover the Tool bar chevron opens (translate step m, rotate step °).

**10 · FPS** — `62` mono readout. Only when `$showFpsCounter` (View menu / Settings →
General). Source: `Viewport` writes `statusStore.$fpsReport` (ephemeral atom) throttled to
2Hz from the stats.js delta; the in-viewport stats.js graph panel stays (canvas overlay,
foundation §1). The continuous-render-loop flip is unchanged and remains the ONLY
continuous mode (constitution).

**11 · Bell** — `🔔` icon button + unread badge (count from `$unreadCount`; caps display at
`9+`; hidden at 0). Pulses (single 300ms scale tick) when a `rich` or `danger` entry
arrives. Click → notification center popover (§2.3). Also opened by Window → Notifications….

### 1.3 statusStore (data model)

```ts
// src/state/statusStore.ts — no react imports; imperative fns callable anywhere
export const $statusMessage = atom<StatusMessage | null>(null);
export const $toolStatus   = atom<ToolStatus | null>(null);
export const $progress     = computed($loadProgress, aggregateJobs); // + trackJob registry
export const $fpsReport    = atom<number | null>(null);
export const $advisories   = atom<Advisory[]>([]);                   // §1.8

export function status(text: string, opts?: {
  severity?: Severity; action?: StatusAction; notificationId?: string;
}): void;                       // overwrite + arm expiry timer (severity table)
export function clearStatus(): void;
export function setToolStatus(model: ToolStatus | null): void;
export function trackJob(label: string): { setProgress(done, total?): void; end(): void };
```

All ephemeral. `status()` is the low-level primitive; feature code normally goes through
the `toast()` facade (§2.2) so routing stays centralized.

### 1.4 Modifier hints & the held-modifier store

**modifierStore** (`src/state/modifierStore.ts`):

```ts
export const $heldModifiers = atom<{ alt: boolean; shift: boolean; ctrl: boolean; meta: boolean }>({...false});
export const $hoverContext  = atom<HoverContext>('none');
// 'none' | 'viewport' | 'viewport-entity' | 'gizmo' | 'timeline-track' | 'timeline-key'
// | 'outliner-row' | 'list' — coarse regions only, set by pointerenter/leave on hosts
export const $modifierHints = computed(
  [$mode, $activeTool, $hoverContext, $hasSelection, $isDragging], computeHints);
```

**Held-key tracking — the edge cases, spec'd:**
- Listeners on `window`, capture phase, passive: `keydown`, `keyup`, `pointerdown`,
  `pointermove` (throttled to animation frame), `pointerup`, `wheel`. Every handler reads
  the event's **modifier flags** (`e.altKey/shiftKey/ctrlKey/metaKey` — never key identity)
  and writes the atom **only if a flag actually changed** (diff-before-set; keeps
  React churn at zero during normal typing/mousing).
- Why mouse events too: on macOS, while **⌘ is held, keyup events for other keys are
  suppressed** and a ⌘-tab away loses the ⌘-keyup entirely; mouse-event flags re-sync
  truth on the next pointer move. This is the standard correction channel.
- **Window blur** (`window 'blur'`) and `document 'visibilitychange'` → hidden: reset all
  four to false (we cannot know what was released while unfocused). On `focus` we do NOT
  guess — flags stay false until the next event carrying flags arrives (worst case: one
  stale-false frame; hints under-show rather than lie).
- **Alt browser quirks**: never `preventDefault` the bare Alt keydown/keyup at this layer
  (Windows browsers use Alt for menu focus on keyUP; swallowing it globally breaks a11y).
  The ⌥-drag-duplicate gesture consumes Alt inside its own pointer handlers only.
- Right-modifier keys carry the same flags — no `location` handling needed.
- StrictMode-safe: listeners registered once at module init guarded by an idempotency flag
  (same pattern as toastQueue singleton).

**Hint computation** — hint providers are registered data, not components:

```ts
registerModifierHints('build-viewport', (ctx) => ctx.mode === 'build'
  && ctx.hover.startsWith('viewport') && ctx.hasSelection ? [
    { mod: 'alt',   label: 'Duplicate drag', priority: 10 },   // LOCKED gesture #7
    { mod: 'shift', label: 'Add to selection', priority: 20 },
    { mod: 'ctrl',  label: 'Snap ⧉ invert',  priority: 30 },
  ] : []);
```

Shipped providers: `build-viewport` (above; ⇧ hint becomes "Box select drag" when hovering
empty canvas — `viewport` vs `viewport-entity` context), `marquee` (⌥⇧ Subtract),
`gizmo-drag` (while `$isDragging`: ⌃ Snap invert only), `timeline` (⌃ Snap to keys while
dragging a diamond), `list` (⇧ Range · ⌘ Toggle — shown for outliner/list hover),
`animation-pose` (⇧ Axis lock, per the pose-gizmo area design's gesture set).
- Render: up to **3** hints by ascending priority: `Kbd(⌥) Duplicate drag · Kbd(⇧) Add…`.
  A hint whose modifier is currently held renders accent-bright (the "this is live"
  affordance); others fg-muted. `Kbd` glyphs resolve via `keyLabel` (⌥/Alt, ⌘/Ctrl).
- Desktop only (keyboard feature). No hints while a dialog is open ($openDialog gates the
  computed to []).

### 1.5 Segments absorbed — behavior deltas from v1 (explicit)

| v1 surface | Delta beyond relocation |
|---|---|
| TransformHud | click-cycle + chord tooltips identical; axis colors from shared `axisColors.ts`; in Data/Engine/Surface the chips follow the SELECTION, not the mode — hidden only when nothing transformable is selected (keys live ⇒ chips visible); phone story changes from "hidden, no touch path" to Inspector-sheet steppers (§8.2) |
| MeasurementInfo | click-to-toggle world/oriented is NEW (v1 badge was passive); diagonal moves to tooltip |
| SeatViewBar | identical controls; loses its own floating bar; Esc contract unchanged (rung 8, never preventDefault) |
| WorkspaceLoadProgress | gains job tracking beyond downloads; gains per-file popover; loses the hide-while-browser-open swap |
| toast region | see §2 |

### 1.6 Undo/persistence

Nothing in the status bar pushes undo. Persisted state it *edits*: `$measurementSettings.
boundsMode` (flexo:measure), `$snapEnabled/steps` (flexo:snap), nudge/rotate prefs
(existing flexo:* keys), active layer (project-scoped view state — unchanged from v1).

### 1.7 Empty state

With no project content, no selection, no tool: `⬚ Build │ Layer: Default ▾ │ ····· │ ⧉ │ 🔔`
— the bar never fully empties (mode + layer + snap + bell are permanent), which
anchors the layout and teaches the posture chips.

### 1.8 Advisory chips (condition-tier feedback)

Events go to the message channel/center; **conditions** (true until fixed) get a chip slot
between progress and hints. `$advisories` is written by owning stores; max 2 rendered
(priority-ordered), extras collapse into the first chip's tooltip.

| Advisory | Condition | Chip | Click |
|---|---|---|---|
| Light preview cap | `$lightSettings.livePreview && $lightPreviewCount > MAX_PREVIEW_LIGHTS` | `💡 8/12` amber | deep-link Settings → Scene (light preview section) |
| Mods folder needs re-grant | `$modFolder.status === 'needs-permission'` | `📁 re-grant` amber | runs File ▸ Mods Folder ▸ Re-grant Access command |

(Foundation §3 View menu already routes the light over-cap warning "to the status bar";
this is that slot, formalized. New advisories require design review — the slot is not a
dumping ground.)

---

## 2. Notifications — center, routing, and the toast() facade

### 2.1 What is a notification vs a transient status

Rule (Law 1 restated): **transient feedback → status channel; persistent-until-read
feedback → notification center**. A notification is anything a user could reasonably need
after looking away: results of long operations, warnings about data, all failures, and
rich reports. High-frequency posture feedback (axis cycles, step changes) must NEVER enter
the center.

### 2.2 Routing — the `toast()` facade and the full call-site classification

`toast(message, opts)` **keeps its exact v1 signature** (constitution: imperatively
callable outside React — EditorScene.ts, main.tsx boot, nudgeControls/rotateControls
compile unmodified). It becomes a pure router in `src/ui/toast.ts` (module function, no
react):

```ts
type ToastVariant = 'default' | 'success' | 'danger' | 'warning';
export function toast(title: string, opts?: {
  description?: string; variant?: ToastVariant; timeout?: number;  // timeout now IGNORED
}): void;
// default → status(info, 4s). success → status(success, 4s) + notify(pre-read).
// warning → status(warning, 8s) + notify(unread). danger → status(danger, 10s) + notify(unread, sticky).
export function notify(entry: NotificationInput): string;  // returns id — the rich/no-status path
```

`timeout` is ignored in favor of the single severity→duration table (foundation §5.1);
passing it logs a dev-only warning so ad-hoc timeouts die at migration time. One table:

| Severity | Status duration | Center entry | Read state |
|---|---|---|---|
| info (transient) | 4s | none | — |
| success | 4s | yes | pre-read (no badge bump) |
| warning | 8s | yes | unread |
| danger | 10s | yes | unread + sticky (survives Clear-all-read) |
| rich | none (bell pulses) | yes | unread + sticky until dismissed |

**Complete v1 call-site classification** (the ~44-site census from ui-kit-hotkeys §1.4;
every site keeps its call, the variant decides the route):

| Category (census) | Sites | v2 route |
|---|---|---|
| Hotkey/action feedback | nudge axis/step (nudgeControls), rotate axes/step (rotateControls), undo/redo labels (now emitted ONCE by the undo/redo commands — kills the 4-site duplication), copy/paste counts, "Scaled everything X×Y×Z", "SubPart Added"/"Part Added" (browser add-and-stay), mesh/texture/material created, chain "Applied chain · +N", paste/duplicate counts, ⌘S "Autosaved ✓" (new) | **transient** — status only. (Add/create confirmations are transient by decision: they are immediate, visible-in-scene results; the center is for things you might miss.) |
| Milestone successes | export written to mods folder / zip downloaded, project imported (ProjectTransferDialogs), shared project opened (boot), project archive exported | **success** — status + pre-read entry (auditable later, no badge nag) |
| Warnings | boot schema-purge notice (names removed projects — text preserved verbatim), chain seeds vanished, "Nothing to aim at" (EditorScene), share-link "assets present, use archive" advisories | **warning** (exception: "Nothing to aim at" is transient — it's immediate action feedback; keep variant 'warning' visual but route status-only via a `transientWarning` opt used at that one site… **no** — simpler: EditorScene changes the call to `variant:'default'` with warning-worded text. One-line migration, no API growth.) |
| Errors | model read/import failures, project import/export failures, share-link decode failure, texture/material/mesh creation failures, export failures, **autosave write failure (NEW — v1 silently console.warns; projectStore's catch now calls toast danger "Autosave failed — storage full?")** | **danger** — status + sticky unread entry with full text |
| Rich | Import report (must name every removed SubPart — persists until dismissed; the old ImportReportCard body), export pre-flight summary (optional link from the export success), build-id mismatch (§2.5) | **`notify()` direct** — center only, bell pulses |

### 2.3 Notification center popup

Popover anchored to the bell (desktop: `w-96`, max-h-[70vh], scroll; phone: bottom Sheet at
92% detent). Component `NotificationCenter`.

```
┌──────────────────────────────────────┐
│ Notifications              Clear all │
├──────────────────────────────────────┤
│ ⛔ Export failed                 2m │
│    NotAllowedError: write access …   │  ← full multi-line, never truncated,
│    denied for "mods".                │    text is user-selectable/copyable
│    [Re-grant access] [Open Export…]  │  ← action buttons (commands)
│  ────────────  unread above  ─────── │
│ 📦 Import report — dish.glb     10m │
│    12 meshes · 3 materials · 2 warn  │
│    ▸ 2 SubParts removed by replace   │  ← rich body, expandable disclosure
│ ✅ Exported part.xml            31m │
│ ⚠ Removed 1 incompatible project    │
│    "old-rover" (schema v1 → v3)   ✕ │  ← per-row dismiss
└──────────────────────────────────────┘
```

- Row = severity icon · title · body (multi-line, monospace for paths/errors — fixes v1's
  truncated single-line toasts losing error text) · relative timestamp · optional action
  buttons · hover-revealed ✕ dismiss.
- **Actions** are `{label, commandId, params?}` resolved through commandStore — enabled
  predicates re-evaluate on render, so a stale "Open Export…" on a deleted project simply
  disables. Shipped actions: `[Reload]`, `[Reset everything…]` (mismatch entry),
  `[Re-grant access]`, `[Open Export…]`, `[Show in Assets…]` (jump: closes popover, opens
  Asset Manager scrolled to the item), `[Undo]` (import-merge entry; disabled when stale).
- **Rich bodies**: the store holds data only (`rich: {kind: 'import-report', payload}`);
  a UI-side registry `notificationBodies: Record<kind, FC<payload>>` renders them (keeps
  `src/state/` react-free). Import report body = the v1 ImportReportCard content verbatim
  (mesh/material/texture counts, warnings disclosure, removed-SubParts list).
- Opening the popover marks everything read (badge → 0). "Clear all" removes read,
  non-sticky entries; sticky (danger/rich) rows keep their ✕-only lifecycle.
- **Persistence decision: session-only ring buffer of 100** (foundation-locked).
  Notifications are news, not data; anything that must survive reload is document/asset
  state and lives elsewhere. Reload after a failed export simply retries the export.
- Empty state: bell icon + "No notifications — export results, warnings and reports land
  here."

### 2.4 notificationStore

```ts
interface NotificationEntry {
  id: string; severity: 'success'|'warning'|'danger'|'rich';
  title: string; body?: string;
  rich?: { kind: string; payload: unknown };
  actions?: { label: string; commandId: string; params?: unknown }[];
  createdAt: number; read: boolean; sticky: boolean;
}
export const $notifications = atom<NotificationEntry[]>([]);   // ring 100, newest first
export const $unreadCount   = computed($notifications, ns => ns.filter(n => !n.read).length);
export function notify(input: NotificationInput): string;
export function dismiss(id: string): void;  markAllRead(): void;  clearRead(): void;
```

### 2.5 Absorptions (each one, spec'd)

- **ImportReportCard** → rich entry `import-report` (above). The card component is
  deleted; `$importReport` store field feeds `notify()` at import completion. "Persists
  until dismissed or next import" becomes "sticky until dismissed; a new import posts a
  new entry" (strictly better — history of the last N imports).
- **Boot purge toast** → `warning` entry + 8s status flash, posted from the same
  `consumeRemovedProjectsNotice()` site. Wording (project names list) preserved.
- **BuildIdMismatchDialog** → deleted (S26). Boot check posts a **sticky rich-severity
  notification**: title "flexo was updated", body one line, actions `[Reload]`
  `[Reset everything…]` (opens the standard reset confirm with the FS-grants switch). Bell
  pulses; a status flash "flexo was updated — see 🔔" shows once. Share-link launches skip
  the check entirely (v1 behavior preserved, including not touching `flexo_build_id`).
- **GlobalToastRegion** → deleted, with the v1 z-100 layer (§7.3). `kit/Toast.tsx` is
  removed; the `toast` import path changes to `src/ui/toast` (mechanical codemod).

---

## 3. Command palette (⌘K — LOCKED)

### 3.1 Surface

`CommandPalette` — overlay dialog, size S variant anchored top-third (max-w-lg, top 15vh),
scrim per z.overlay; phone = fullscreen sheet. Opened by `⌘K` (global scope), Help →
"Search Commands…", menubar right-cluster ⌘K icon, and `commandStore.$paletteOpen`.

```
┌────────────────────────────────────────────┐
│ 🔍 exp▏                                    │
├────────────────────────────────────────────┤
│ ▸ Export to KSA…            File      ⌘E  │  ← selected (arrow keys / hover)
│   Export Project Archive…   File          │
│   Expand All Sections       Data mode     │
│   Exhaust Placement         Engine mode   │
│   Open project: "Explorer-3"  Projects    │
│ ────────────────────────────────────────── │
│   ↩ run · ⌘↩ run & keep open · esc close  │
└────────────────────────────────────────────┘
```

Row = title (match chars highlighted) · subtitle = menu path or provider group · shortcut
chip(s) from the hotkey registry by commandId. Disabled commands render grayed with their
reason appended when the enabled-predicate supplies one cheaply ("— no selection");
running a disabled command is a no-op flash.

### 3.2 Data source

The command registry (foundation §4) is the ONLY source: all MenuSpec commands, mode
switches ("Go to Build mode"…), tool arming, Add entries, View toggles (checked state
rendered as a trailing ✓), plus **dynamic providers** re-evaluated per keystroke: seats
("Sit in Seat 2"), layers ("Activate layer: Hull", "Select all in: Wings"), custom-mesh
re-place items, projects ("Open project: X"), History jump rows ("Undo to: move ·
thruster_1"). Providers return factory commands with stable prefixed ids
(`layer:activate:<layerId>`).

Non-goals (foundation-locked): no free-text math, no document-entity search (Outliner owns
that), no fuzzy file contents.

### 3.3 Fuzzy match — one shared util

`src/ui/fuzzyMatch.ts`: subsequence matcher returning `{score, ranges} | null`. Scoring:
+3 word-boundary hit, +2 consecutive run, +1 otherwise; ×1.5 prefix bonus; normalized by
target length; ties break alphabetically. **This same util upgrades every sidebar/browser
search** (foundation §8 "fuzzy — an upgrade from substring") — one behavior everywhere,
one test file. Match against `title + ' ' + menuPath + ' ' + keywords` (registry gains an
optional `keywords` field; chain command carries "array grid radial ring" etc. from the v1
chainCommands keyword sets).

### 3.4 Recents & empty query

- Empty query shows: **Recent** (last 8 run command ids, persisted
  `flexo:paletteRecents`; dynamic ids that no longer resolve are silently skipped) →
  **Modes** (5) → nothing else (typing is the point). Recording happens on successful run
  only.
- Enter = run + close. **⌘Enter = run + keep open** for commands flagged `keepOpen`
  (Add-entity items, "Activate layer") — supports add-several workflows.
- Arrow keys move selection (wraps); typing always edits the search field (input keeps DOM
  focus; list uses virtual focus — the `isTypingInField` guard already handles this
  pattern, §4.3).

### 3.5 Chain-builder integration (LOCKED)

"Begin Action Chain…" is a first-class palette command (id `chain.begin`, keys ⇧⌘K,
keywords "array grid radial ring repeat"). Run semantics = the command's own (foundation
§2.6): switch to Build if needed, guards (SubPart seeds only, locked-layer refusal →
warning toast) unchanged, opens the `chain` FloatingWindow. **Discard-confirm**: if a chain
session with ≥1 step is already open, invoking `chain.begin` again (or any command whose
`conflictsWithChain` flag is set — currently only mode-switch commands per foundation
§2.6) raises the standard S-size ConfirmDialog "Discard chain (3 steps)?" before
proceeding; an empty session is replaced silently. ⌘K itself NEVER touches the chain —
the v1 "⌘K silently cancels a 12-step session" trap (chains-misc pain 7) is dead by
construction.

### 3.6 Store & phone

`commandStore.$paletteOpen: boolean`; `$paletteRecents` persisted. Esc = ladder rung 3.
Phone: fullscreen sheet, same registry, run-and-close only (⌘Enter is desktop).

---

## 4. Hotkey system v2

### 4.1 Registry shape (foundation §11.1, restated as the implementation contract)

```ts
// src/ui/hotkeys/registry.ts
interface HotkeyBinding {
  id: string;                 // == commandId (menubar/palette/help all join on this)
  keys: string;               // react-hotkeys-hook syntax; 'mod+' for ⌘/Ctrl
  chords: string[][];         // display tokens, platform-neutral; keyLabel resolves at render
  scope: Scope;               // 'global' | 'viewport' | `mode:${Mode}` | `tool:${Tool}` | `surface:${SurfaceId}`
  when?: () => boolean;       // cheap store-predicate gate (e.g. $seatView.get() !== null)
  overrides?: string[];       // commandIds this binding intentionally shadows (precedence doc)
  escRung?: number;           // Esc-ladder position, for Help + ordering assertion (§4.6)
  options?: Partial<HotkeyOptions>; // preventDefault:false, useKey, enableOnFormTags…
}
```

Bindings without a command (pure-key behaviors like WASDQERF rotate) register a synthetic
command (`transform.rotate.ws` etc.) so Help and conflict detection see everything —
**there are no off-registry bindings in v2**. numberDraft per-field keys remain
field-local by design and are documented via the static Help section (§5.1).

### 4.2 Scope activation

`src/state/hotkeyStore.ts`:

```ts
export const $focusedSurface = atom<SurfaceId | null>(null);
// maintained by a window focusin listener resolving e.target.closest('[data-surface]');
// FloatingWindow, TimelineDock, CommandPalette, sidebars stamp data-surface ids.
export const $activeScopes = computed(
  [$mode, $activeTool, $chainSession, $focusedSurface, $openDialog],
  (): Set<string> => {
    const s = new Set(['global']);
    if (!dialogOpen) s.add('viewport');           // dialogs suppress viewport, not global (v1 parity)
    s.add(`mode:${mode}`);
    if (tool) s.add(`tool:${tool}`);
    if (focusedSurface) s.add(`surface:${focusedSurface}`);
    if (chainSession) s.add('surface:chain');     // chain scope active while session exists
    return s;
  });
```

- The **viewport** scope condition (foundation): no overlay dialog open, not typing, focus
  not inside an interactive react-aria collection/menu (focus on viewport host / body /
  non-interactive chrome counts). Implementation: viewport-scope bindings gate on
  `$activeScopes.has('viewport') && !isTypingInField(e) && !isInteractiveCollectionFocus()`.
  The viewport keeps stealing focus on pointerdown (ViewportCanvas invariant), so this is
  the common state.
- `GlobalHotkeys` v2 mounts one child per binding (stable hook order, v1 pattern); each
  `useHotkeys` gets `enabled` from scope membership + `when`. Bindings stay mounted;
  gating is data-driven (v1 principle preserved).
- **Precedence** surface > tool > mode > viewport > global is enforced at dispatch: when
  two active bindings share keys, only the highest-precedence one has `enabled: true`
  (the registry precomputes, per key-string, the precedence chain; lower entries get an
  additional `&& !higherActive()` gate). Concretely this implements timeline-focused ←/→
  overriding nudge arrows (foundation §11.2) without preventDefault fights.

### 4.3 Typing guard — preserved VERBATIM

`isTypingInField` keeps the `document.activeElement` check (INPUT/TEXTAREA/SELECT/
contentEditable) — the react-aria **virtual focus** leak (searchable Select re-dispatching
synthetic key events on a listbox div) is real and event-target checks are insufficient
(ui-kit-hotkeys §1.3). The `?` binding keeps `useKey: true, ignoreModifiers: true`
(layout-agnostic; naive shift+/ breaks non-US layouts). `mod` platform abstraction via
`keyDisplay.ts` unchanged; `Kbd` + `keyLabel` move into `src/ui/kit/` (they're consumed by
status bar, help, palette, menus — kit-tier now).

### 4.4 Complete v2 binding table (= foundation §11.2, with owners and migration notes)

| Scope | Keys | commandId | Notes / migration |
|---|---|---|---|
| global | `1..5` | `mode.build`… | NEW; gated `when: () => !dialogOpen` — a mode must never switch invisibly behind the Project Manager etc. (C5 fix) |
| global | `⌘K` | `palette.open` | **rebound** from chain (LOCKED) |
| global | `⇧⌘K` | `chain.begin` | **rebound**; discard-confirm §3.5 |
| global | `⌘Z` / `⇧⌘Z` / `⌘Y` | `edit.undo/redo` | unchanged; label flash emitted by the command (kills 4-site string dup) |
| global | `⌘O` / `⇧⌘A` / `⌘E` / `⌘,` | projects / assets / export / settings | NEW dialog chords |
| global | `⌘S` | `noop.autosaveFlash` | NEW — "Autosaved ✓" transient |
| global | `?` | `help.shortcuts` | unchanged (useKey) |
| global | `⌥[` / `⌥]` | `window.toggleLeft/Right` | NEW |
| global | `Esc` | (the ladder, §4.6) | |
| viewport | `M` | `tool.measure` | NEW; **viewport-scoped** for symmetry with `B` — a tool must never arm invisibly behind a dialog (C5 fix). (v1 had no key; docs mentioning old M-nudge were stale — confirmed gone) |
| viewport | `W/S A/D Q/E` | `transform.rotate.*` | **scope narrowed** global→viewport; semantics identical (S8 answer to WASDQERF: kept in ALL modes, viewport-scoped) |
| viewport | `R` | `transform.rotate.cycleAxes` | unchanged |
| viewport | `[` / `]` | `transform.rotateStep.down/up` | **rebound** from `F`/`⇧F` (S6) |
| viewport | `↑↓ ⇧↑↓ ←→ ⇧←→` | `transform.nudge.*` | unchanged; scope narrowed |
| viewport | `F` | `view.frameSelection` | **rebound** (LOCKED); frame-all fallback |
| viewport | `T` / `⇧T` | `tool.cycleGizmo` | NEW (S5; the FEATURE_TODOS ask) |
| viewport | `B` | `tool.marquee` | NEW |
| viewport | `⌘A ⌥⌘A ⇧⌘I` | `select.all/none/invert` | NEW |
| viewport | `⌘C ⌘X ⌘V ⌘D ⌫` | `edit.copy/cut/paste/duplicate/delete` | ⌘C/⌘V/⌫ scope-narrowed; ⌘X ⌘D NEW; clipboard gains lights (census gap — owned by selection area, chorded here) |
| mode:animation | `Space` `,` `.` `K` | transport / prev-next key / insert key | NEW |
| tool:seat-view | `Esc` | `seat.exit` | rung 8; `preventDefault:false` contract unchanged |
| surface:timeline | `←→ ⇧←→` | playhead step / snap-to-key | overrides nudge arrows (declared via `overrides`) |
| surface:chain | `⌘↩` / `Esc` | `chain.apply/cancel` | migrated INTO the registry (was component-local); `enableOnFormTags` + no-preventDefault Esc preserved |
| surface:palette | `↑↓ ↩ ⌘↩ Esc` | palette nav | registered for Help completeness |
| surface:outliner | `⌘F` | `outliner.expandSearch` | NEW — expands/focuses the Outliner search field (build design §2.1/§2.5); scope-local so browser find is only shadowed while the panel has focus |
| surface:outliner · data-navigator · engine-tree · members | `⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I` | mirrors → `edit.copy/cut/paste/duplicate/delete`, `select.invert` | NEW — list-focus parity (foundation §11.1, F1 fix): range-select rows then ⌫/⌘C keeps working exactly as v1's globals; each list's own ⌘A (react-aria row select-all) keeps precedence over viewport ⌘A |

Formerly-local bindings now registered: chain apply/cancel (above), animation Esc-unwind
(`mode:animation`, rung 7 — replaces the raw window listener in AnimationPanel), layer
inline-rename Enter/Esc (`surface:outliner`, listed in Help under "Outliner"). numberDraft
field keys stay field-local (static Help section).

### 4.5 Conflict detection

`validateRegistry()` — dev-time (module init, `import.meta.env.DEV`) + a unit test
(`hotkeyRegistry.test.ts`) that enumerates every reachable active-scope combination
(global ∪ viewport ∪ each mode ∪ each tool ∪ each surface) and asserts **no two enabled
bindings share a normalized key-string** unless one names the other in `overrides`. Also
asserts: every `keys` parses, every commandId exists in the command registry, chords[]
matches keys (a chord-from-keys generator with an explicit-override escape hatch), and
escRung values are unique. This is the "registry rejects duplicate keys within one active
set at dev time" contract, made testable. The test additionally asserts that **no
bare-letter/digit binding is enabled while `$openDialog` is set** — mode digits are
`when`-gated and tool letters (`B`, `M`, `T`, `X`, `K`) are viewport/mode-scoped, so this
assertion guards the C5 class of regressions permanently.

### 4.6 Escape ladder — implementation notes

The ladder (foundation §11.4, nine rungs) is deliberately NOT one central dispatcher —
react-aria owns rung 2 and numberDraft owns rung 1 internally. v2 adds the missing
coordination: each flexo-owned rung registers with `escRung: n` metadata and the
discipline table below; a dev-time assertion orders them; Help renders the ladder as a
numbered list ("What Esc does, in order").

| Rung | Owner | preventDefault? |
|---|---|---|
| 1 numeric dirty revert | numberDraft (field-local) | only when dirty (+stopPropagation) |
| 2 popover/menu/dialog-view/dialog | react-aria + DialogViewStack | react-aria's own |
| 3 palette close | surface:palette | yes |
| 4 gizmo drag cancel | TransformControls built-in | n/a (mid-drag only) |
| 5 armed tool cancel | tool:* bindings | yes |
| 6 chain cancel (confirm ≥1 step) | surface:chain | **no** (v1 contract) |
| 7 animation unwind kf→joint | mode:animation | yes |
| 8 seat view exit | tool:seat-view | **no** (v1 contract) |
| 9 nothing | — | Esc never clears selection, never globally preventDefaulted |

### 4.7 Menubar shortcut display

MenuSpec items render their chip by `hotkeyRegistry.chordsFor(commandId)` at menu open —
one lookup path shared with palette rows and Help. A binding change is therefore a
one-file edit that updates menu, palette, and Help simultaneously (Law 4 "labels can never
drift from bindings" — now mechanical).

---

## 5. Help & onboarding

### 5.1 Keyboard Shortcuts dialog (`?`, Help menu) — regenerated

Size L dialog (cover on phone). Content generated from the registry, grouped by scope with
human titles: **Everywhere** (global) · **In the viewport** · **Build mode** … ·
**While measuring / Seat view / Box select** (tools) · **Chain window / Timeline /
Command palette** (surfaces) · **Outliner**. Each row: label (command title) + chord chips.
Mode/tool groups render even when inactive (it's documentation). Then three STATIC
sections (hand-authored, versioned next to the registry so review catches drift):
1. **Pointer & modifiers** — additive click (⌘/⌃/⇧), list ⇧-range grow-only, ⌘-toggle,
   marquee (⇧-drag / ⌥⇧ subtract / B), ⌥-drag duplicate, ⌃ temporary snap invert,
   double-click-to-insert (timeline), drag-reorder affordances.
2. **Numeric fields** — arrows step, ⇧×10 / ⌥×0.1, Enter commit, Esc revert-when-dirty,
   live-commit-while-typing.
3. **What Esc does** — the rung table (§4.6).
Footer keeps the v1 note ("Shortcuts are disabled while typing…") + the v1→v2 rebind diff
box (F, ⌘K — shown for the first 30 days after first v2 boot via a `flexo:rebindNoticeSeen`
flag, then folded into a collapsed disclosure).

### 5.2 About & first-run

AboutDialog kept as-is (S/center, cover on phone): blurb, MIT license, RocketWerkz/Dean
Hall attribution (**legally load-bearing — text retained verbatim**), GitHub link.
First-run auto-open + share-link suppression semantics unchanged (`flexo:aboutSeen`,
`suppressAboutFirstUse`). Opened via Help → About; `$aboutOpen` folds into
`dialogStore.$openDialog = {id:'about'}`.

### 5.3 Onboarding beyond About

No tour system (out of scope, not a v1 feature). Onboarding = the mode empty-state
cheat-cards (foundation §7 item 3 — each mode's left-sidebar empty state shows one
sentence + 4–6 hotkeys + primary actions; owned by area designs, rendered through a shared
`ModeCheatCard` kit component this area provides: icon, blurb, `Kbd` rows from the
registry by commandId, action buttons). Build's card doubles as first-run guidance.

---

## 6. FloatingWindow — the window-manager primitive

### 6.1 Component & API

```tsx
// src/ui/kit/FloatingWindow.tsx
<FloatingWindow
  id="toolbar"                 // key into layoutStore.float / floatOrder
  title="Tools"                // strip label (may be visually hidden for the tool bar)
  defaultAnchor={{ h: 'center', v: 'top', dx: 0, dy: 8 }}   // relative to viewport cell
  minSize={{ w: 120, h: 28 }}
  resizable={{ minW: 300, maxW: 420 }}   // optional; adds a right-edge ResizeHandle
  collapsible                            // optional; strip chevron rolls body up
  onClose={...}                          // optional ✕ in the strip
>{body}</FloatingWindow>
```

Chrome: `panelChrome` (kit export of the one floating-card class string — kills the 4-site
duplication) + a **20px title strip**: `⠿` grip dots · title · optional collapse chevron ·
optional ✕. **Drag = pointer capture on the strip only**; the body never drags (the chain
window's inputs stay draft-safe). The strip is focusable (`tabIndex=0`); arrow keys move
8px, ⇧-arrows 32px; the window stamps `data-surface="<id>"` for hotkey scoping.

### 6.2 Clamping (the brief's bounds, exactly)

Workspace band = rect from **menubar bottom edge** to **status bar top edge**; horizontal
bounds = **screen left/right edges** (not the viewport cell — windows may overlap
sidebars, they render above them). Windows MAY overlap the timeline dock. Clamp rule:
`x ∈ [minVisibleX - w + 120, vw - 120]`, `y ∈ [bandTop, bandBottom - 28]` — i.e. at least
120×28px of the strip always on-screen and the strip never leaves the band vertically.
Re-clamped on window resize (ResizeObserver on the band) and on band geometry change
(timeline mount/unmount does NOT re-clamp — overlap allowed). Default anchors resolve
against the **viewport cell** so they land clear of sidebars; stored positions are
band-absolute px.

### 6.3 z & stacking

All windows render at `z.float` (30) — **above both sidebars** (brief), below dialogs
(z.overlay 50) and react-aria portals. Stack order within the tier =
`layoutStore.floatOrder: windowId[]` (last = top); any pointerdown inside a window moves
its id to the end. Two windows can't collide by default (collision-free default anchors:
toolbar top-center, chain top-left) but users may stack them; the raise-on-click rule
resolves it.

### 6.4 Persistence & reset

`layoutStore.$layout.float[windowId] = {x, y} | null` (null = default anchor) inside the
single `flexo:layout` persisted key (S23). Position writes to the atom live during drag;
`persistentJSON` write-through is cheap (one key), no throttle needed beyond
per-pointermove rAF batching in `usePointerDrag`. Cleared by Window → Reset Window Layout
and Reset Everything. Visibility: the Tool bar has a `Window → Tool Bar ✓` toggle
(`layoutStore.$layout.floatHidden: windowId[]`); the chain window's visibility is its
session (`$chainSession`), not a layout flag.

### 6.5 Tenant roster

| Window | Body | Default anchor | Extras |
|---|---|---|---|
| `toolbar` — Tool bar | Move/Rotate/Scale ToggleButtonGroup on `$effectiveToolMode` (Scale disabled during exhaust — truthful display invariant) + snap magnet toggle + chevron popover (translate step, rotate step, "hold ⌃ = temporary opposite") | viewport top-center, 8px below menubar | visible whenever a gizmo target exists; strip title visually hidden (grip + controls only) to stay slim |
| `chain` — Chain palette | v1 ChainPalette guts verbatim (autofocus search, command list, step cards, footer counts/error, ⌘↩/Esc) | viewport top-left, 8px inset | NON-modal (constitution); resizable 300–420px; NEW step drag-reorder (row grips via `usePointerDrag`); discard-confirm on cancel with ≥1 step |
| (future) `calculators` | reserved (plans/CALCULATORS_PLAN.md) | — | primitive supports it; NOT in v2 scope |

Phone: each tenant declares its phone rendering — toolbar → pinned strip above
CondensedStatusBar; chain → 50% non-blocking sheet, session intact across dismiss/reopen
(foundation §12). FloatingWindow itself renders nothing on phone; the tenant's phone
variant mounts instead.

### 6.6 Everything else stays docked

The §6.3 foundation death list is binding: FloatingInspector, FloatingPreviewToolbar,
SeatViewBar, FloatingEditorPanel, ManageTexturesPanel, TransformHud, MeasurementInfo,
LoadProgress, ImportReportCard, toast region — all deleted as floating surfaces; their
features live in sidebars/status/notifications per this doc and the area designs. New
floating surfaces require a foundation escalation, not a new `<FloatingWindow>` call.

---

## 7. Kit & density work

### 7.1 Density tokens (src/index.css @theme — foundation §1.2, final)

```css
--bar-py:          0.125rem;  /* menubar + status bar vertical padding (brief mandate) */
--density-row-py:  0.25rem;   /* sidebar list rows, menu items */
--density-panel-p: 0.5rem;    /* sidebar section padding */
--density-gap:     0.375rem;  /* control gaps in dense panels */
--rail-reopen-w:   20px;      /* collapsed-sidebar reopen tabs */
--wash-hover:      rgb(255 255 255 / 0.06);   /* §7.6 */
--wash-press:      rgb(255 255 255 / 0.10);
--wash-selected:   rgb(255 255 255 / 0.08);
```

### 7.2 `xs` size tier — additive, NOT a rescale (decision)

Rationale: the census shows h-7/h-9 (`sm`/`md`) used everywhere in dialogs and phone
surfaces where touch targets matter; a global rescale risks every dialog. So: **new `xs`
variants**, used only in bars + sidebars; `sm` call sites untouched.

| Primitive | xs spec |
|---|---|
| `Button` | h-6, px-1.5 (px-2 with label+icon), text-xs, rounded-sm; iconOnly w-6 |
| `ToggleButton` | h-5; group tray p-px gap-px |
| `inputStyles` | h-6 px-1.5 text-xs |
| `SearchField` | h-6, icon 12px |
| `Select` trigger | h-6 |
| `Checkbox`/`Switch` | unchanged (already compact); label text-xs in dense contexts |
| `MenuItem` (menubar menus) | py uses `--density-row-py`, text-xs |
| GridList rows (sidebars) | py-1 (via `gridRowClass` dense variant) |

Sidebars and both bars use `xs` exclusively; dialogs and ALL phone surfaces stay `sm`
(touch). `SectionTitle` keeps the 11px uppercase style. Buttons keep `cursor-default`
everywhere (v1 deliberate desktop convention — kept, now enforced by the tv base).

### 7.3 z-index ladder — `src/ui/kit/zIndex.ts` (single source; NO literals in feature code)

```ts
export const z = {
  canvasOverlay: 10,  // in-viewport: drop zone, marquee div, FPS panel, CSS2D host
  dock:          20,  // sidebar/timeline internals: resize handles, sticky headers
  float:         30,  // FloatingWindows (above sidebars; intra-tier order from floatOrder)
  overlay:       50,  // kit Modal overlays
} as const;           // popovers/menus/tooltips: react-aria portals, above everything
```

The v1 z-100 toast layer is **deleted** (nothing outranks dialogs except portals —
resolves ui-kit-hotkeys pain 6 and the toasts-over-modals question). An oxlint rule (or
grep-based CI check) bans `z-[` and `z-1?[0-9]0` literals under `src/ui/` outside
`zIndex.ts`.

### 7.4 The shared drag/resize primitive — `usePointerDrag` + `ResizeHandle`

```ts
// src/ui/kit/usePointerDrag.ts — THE one pointer-drag hook
usePointerDrag({
  onStart?(e): void | false;        // false = don't start (e.g. locked)
  onMove(dx, dy, e): void;          // rAF-batched deltas from drag origin
  onEnd?(e): void;
  cursor?: string;                  // applied to documentElement during drag
});                                  // pointer capture, touch-action:none, cleanup-safe
```

```tsx
// src/ui/kit/ResizeHandle.tsx — orientation edge strip built on usePointerDrag
<ResizeHandle orientation="vertical" hitSize={8} visualSize={2}
  value={width} min={220} max={480} invert={false} onChange={setWidth} />
// role="separator", aria-orientation, keyboard: arrows ±8px (a11y upgrade over v1)
```

Consumers (replacing the four bespoke implementations — ui-kit-hotkeys pain 5):
left/right sidebar inner edges, timeline top edge, FloatingWindow strip (drag) + optional
right-edge resize, chain step-card reorder grips, `VerticalSplit`/`HorizontalSplit`
(rewritten internally on `usePointerDrag`, keeping their local-state %-and-reset-on-remount
behavior for the catalog browsers — that reset is relied upon). Gizmo/timeline-diamond
drags do NOT use this (three.js / canvas-internal).

### 7.5 Dialog patterns — killing modal-in-modal

- **`DialogViewStack`** (foundation §10.1): a dialog owns `views: {id, title, element}[]`
  push/pop; DialogHeader renders `‹ Back · Title` when depth >1; Esc pops top view first
  (after numberDraft dirty-revert), then dismisses. Phone: views push as sheet pages.
  Adopters: Asset Manager (material edit), Settings (reset confirm view), Import Review
  (wizard steps), Project Manager (nothing stacked — inline strips instead).
- **`InlineConfirmStrip`** (new kit): row-level destructive confirm rendered in place —
  `Delete "X"? [Delete] [Cancel]` replacing the row content for 8s or until answered.
  Adopters: project delete, asset delete (bytes-unrecoverable wording kept verbatim),
  layer delete choice entry.
- **`ConfirmDialog`** remains blessed ONLY for top-level confirms not already inside a
  dialog (Delete All (N), chain discard, Reset Everything). The v1 stacks
  (CustomAssetsModal→MaterialDialog, LoadProjectDialog→Confirm, mismatch→Confirm) all map
  to one of the two patterns above.
- **`CopyDownloadBar`** (kit): copy-with-✓-feedback + download button pair, replacing the
  three hand-rolled clipboard/download clusters (export XML tabs, share link, project
  export).

### 7.6 Dark-theme tokenization (no light theme — constitution)

Dark-only stays. The raw `bg-white/[0.04..0.13]` hover/press washes (Button
secondary/ghost, menu items, list rows) are replaced by the three wash tokens (§7.1) via
the tv bases — one edit point, consistent hover language, and `noteBox/warningBox/
dangerBox` severity semantics get doc-comments promoted into the styles file. No sweeping
restyle: token swap is mechanical.

### 7.7 Color picker — `ColorField` (closes the native-input gap)

New kit `ColorField` on react-aria ColorPicker: swatch button (xs: 16px square) → popover
with ColorArea + hue ColorSlider + optional **alpha ColorSlider** + hex field (numberDraft
rules don't apply — hex is not numeric; react-aria ColorField semantics). Undo contract:
`onInteractionStart` fires once when the popover opens (one undo step per picking session,
matching SliderRow's pointer-down convention); live commit while dragging.
Adopters (replacing every native `<input type=color>`): Settings selection-highlight rows
(mesh + kitten color/strength — the FEATURE_TODOS ask), light color, measurement color,
container line/warn colors, layer opacity swatch popover, glow/material color fields.
`ColorAlphaField` is rewritten as ColorField+alpha; its separate 0–1 opacity slider
variant remains for the two sites that want a labeled slider row.

### 7.8 GridList adoption notes

Constitution prefers GridList over ListBox for row collections. This area's own surfaces:
notification rows and palette results are NOT selection lists (custom rows; palette uses
virtual focus). Flagged adopters for area designs (noted here so the planner sees them
once): joint member list (per ANIMATION_UX_CLEANUP_TODOS), Outliner entity rows, Data
navigator, Engine module tree, SubPart Set Picker — all GridList with `gridRowClass`
dense variant + `useShiftRangeSelect` (grow-only semantics verbatim).

### 7.9 Misc kit debts closed

- `panelChrome` export (§6.1) — deletes 4 duplicated class strings.
- `numberDraft.ts:70` stale doc-comment fixed to `inputMode="url"` (behavior unchanged).
- `Kbd`/`keyLabel` promoted to kit (§4.3).
- Separator rendering fix (FEATURE_TODOS "separators render weird") lands with the MenuBar
  kit work — menubar menus get proper `MenuSeparator` spacing under `--density-row-py`.
- `fmt`/`PreciseNumberInput` display-precision distinction untouched.

---

## 8. Phone variants (LOCKED #6 — full parity)

### 8.1 CondensedStatusBar

One strip above the ModeTabBar: `[⬚·▥] [Layer:Hull] [message channel →tap opens 🔔 sheet] [③] [⧉] [🔔2]`
- Mode/tool chip (mode icon; tool icon replaces it while a tool is armed). Tap: no tool →
  mini mode menu; **tool armed → tap CANCELS/exits the tool** — this is the phone's Esc
  and the ONLY disarm path for armed one-shot tools (marquee, measure) which suspend
  orbit while armed (F4 fix). Seat view: tap = Exit; member paint: tap = Done (same
  outcome as the tool's Esc rung).
- **Active-layer chip** `Layer: <name>` (truncated 10ch; Build/Animation only — matches
  the desktop segment and foundation §12's phone frame; v1 MobileInspector-FAB parity).
  Tap → the same layer-picker menu as desktop, rendered as a sheet; picking sets the
  active layer.
- Message channel: same overwrite semantics, tap → notification Sheet. Progress renders as
  a 2px underline bar across the strip (no dedicated segment).
- Selection count chip (③) → opens the Inspector sheet (this chip IS the phone FAB's
  successor, per foundation §12 the FAB also exists in-viewport; both open the same sheet).
- Snap chip (tap toggles; long-press → step sheet). Bell + badge → notification Sheet.
- Dropped on phone (keyboard-only): modifier hints, rotate/nudge chips, FPS readout
  (stats.js overlay still available via View menu for debugging).

### 8.2 TransformHud parity fix (the v1 phone gap, answered)

v1 hid TransformHud on phones leaving NO touch path to nudge/rotate. v2: the Inspector
sheet's transform card gains a **touch stepper cluster** (this area owns the spec;
the selection area owns the card):
`Nudge: [axis X|Y|Z segmented] [step chip →cycles] [− ✥ +]` and
`Rotate: [axis pair chip →cycles] [step chip] [↺ 45° ↻]` — same store actions as the
hotkeys (`nudgeControls`/`rotateControls`), feedback lands in the condensed message
channel. Undo: each tap is a discrete step (the actions already push once per invocation).

### 8.3 Other phone mappings (this area's surfaces)

| Surface | Phone |
|---|---|
| Notification center | bottom Sheet (92%), same rows/actions |
| Command palette | fullscreen sheet, search pinned, Enter=run-close |
| Help dialog | cover; same generated content |
| Tool bar window | pinned strip above CondensedStatusBar (not draggable) |
| Chain window | 50% non-blocking sheet; session survives dismiss/reopen |
| Progress popover | rows inline in the notification sheet header area |
| Settings/About | per dialog mapping (S→center, M/L→cover) |
| Modifier hints / snap-hold | n/a (no keyboard); snap toggle still reachable (chip) |

---

## 9. Store & boot summary (this area)

| Store | Atoms | Persistence |
|---|---|---|
| `statusStore` | `$statusMessage $toolStatus $progress $fpsReport $advisories` + `status/clearStatus/setToolStatus/trackJob` | ephemeral |
| `notificationStore` | `$notifications $unreadCount` + `notify/dismiss/markAllRead/clearRead` | session-only ring 100 |
| `modifierStore` | `$heldModifiers $hoverContext $modifierHints` | ephemeral |
| `hotkeyStore` | `$focusedSurface $activeScopes` | ephemeral |
| `commandStore` | registry + providers + `$paletteOpen` + `$paletteRecents` | recents: `flexo:paletteRecents` |
| `snapStore` | `$snapEnabled $snapTranslateStep $snapRotateStep` (writes through to `$snap`) | `flexo:snap` |
| `layoutStore` (shared w/ shell) | `float floatOrder floatHidden` slices | `flexo:layout` |

Boot order additions: modifierStore listener init + hotkey `validateRegistry()` (dev) run
at module scope; `toast` facade requires no init (routes lazily). v1 keys
`flexo:inspectorFloatPos/animPreviewFloatPos/inspectorVisible/inspectorWidth` are
abandoned (defensive reads drop unknown shapes; no migration — constitution).

---

## 10. FEATURE PARITY TABLE — every v1 feature in this area → v2 home

| v1 feature (census ref) | v2 home |
|---|---|
| `toast()` imperative API, callable from EditorScene/boot/nudge/rotateControls | kept verbatim signature — facade routing to status+notifications (§2.2) |
| GlobalToastRegion (z-100, max 4, newest stacking) | deleted → status message channel (overwrite) + notification center (§1.2 #5, §2.3) |
| Toast variants default/success/danger/warning + border tint | severity routing table + status tints + center icons (§2.2) |
| Ad-hoc toast timeouts (1500–10000ms) | single severity→duration table; `timeout` param ignored w/ dev warning |
| Truncated toast title/description | center rows multi-line, never truncated, copyable (§2.3) |
| Undo/redo toast string built in 4 places | emitted once by the undo/redo commands (§4.4) |
| Nudge/rotate axis+step toasts | transient status flashes (§2.2) |
| Copy/paste count, "Scaled everything", add-confirmation toasts | transient status flashes |
| Export/import/share success + error toasts | success/danger routes w/ center entries + actions |
| Boot purge warning toast (10s, names projects) | warning route; wording preserved (§2.5) |
| "Nothing to aim at" (three-layer toast) | transient status (call-site variant tweak, §2.2) |
| Autosave failure (silent console.warn) | NEW danger notification (§2.2 errors row) |
| ImportReportCard (sticky, removed-SubParts list) | rich notification entry, body verbatim (§2.5) |
| BuildIdMismatchDialog (non-dismissable modal) | sticky notification `[Reload] [Reset everything…]` (S26, §2.5); share-link skip preserved |
| TransformHud (chips, click-cycle, chord tooltips, axis colors, desktop-only) | status rotate/nudge chips (§1.2 #8); axis colors → shared `axisColors.ts` |
| TransformHud absent on phone (no touch nudge/rotate) | FIXED: Inspector-sheet touch steppers (§8.2) |
| MeasurementInfo (bbox W/H/D + diagonal, unit, mode badge) | status selection readout; diagonal → tooltip; badge now interactive (§1.2 #4) |
| SeatViewBar (prev/next wrap, ordinal, honesty tooltip, Exit+Esc chip) | status tool segment, controls identical (§1.2 #3) |
| WorkspaceLoadProgress (per-file HDR/GLB/KTX2 bars) | status progress segment + per-file popover; + `trackJob` for archive/zip builds (§1.2 #6) |
| PreviewLoadProgress in catalog browsers ($browserPopupCount swap) | browsers keep their pane overlay; the hide-swap hack deleted (§1.2 #6) |
| FPS counter (stats.js overlay, continuous-loop flip, Settings switch) | View menu toggle + status numeric readout + in-viewport panel; loop semantics unchanged (§1.2 #10) |
| Hotkey registry (HOTKEY_GROUPS single source, drives Help) | scoped registry v2 — still single source for bindings, menus, palette, Help (§4) |
| All v1 registry bindings (W/S A/D Q/E, R, F/⇧F, arrows, ⌫, ⌘C/V/Z/Y/⇧Z, ⌘K, ?, Esc-seat) | migrated per table §4.4 (scope narrowing + 3 rebinds documented in Help) |
| `isTypingInField` activeElement guard (react-aria virtual focus fix) | preserved verbatim (§4.3) |
| `?` useKey/ignoreModifiers layout-agnostic binding | preserved (§4.3) |
| `mod` platform abstraction, `Kbd`, `keyLabel` | kept; promoted to kit (§4.3) |
| Off-registry: chain ⌘↩/Esc (enableOnFormTags, no-preventDefault Esc) | registered `surface:chain`, options preserved (§4.4) |
| Off-registry: animation Esc unwind (window listener) | registered `mode:animation` rung 7 (§4.4, §4.6) |
| Off-registry: layer rename Enter/Esc | registered `surface:outliner`; in Help |
| numberDraft field keys (arrows, ⇧×10/⌥×0.1, Enter/Esc, live commit, draft guards) | unchanged, field-local by design; static Help section (§5.1) |
| Escape layering (dirty-revert → dismiss → chain → unwind → seat; never global preventDefault) | Esc ladder w/ rung metadata + ordering assertion (§4.6) |
| HelpDialog (2-col groups, footer note, fullscreen/cover) | HelpDialog v2 — registry-generated by scope + 3 static sections + rebind diff (§5.1) |
| Help entry points (`?`, menu, mobile overflow) | `?` + Help menu + phone MenuSheet; `$helpOpen` → dialogStore |
| AboutDialog (first-run auto-open, share-link suppression, legal attribution) | kept verbatim (§5.2) |
| Reset Everything (3 entry points, FS-grant switch, flexo-fs preserved) | one command: Settings → Advanced + mismatch notification action (foundation §3); `nukeAndReload` unchanged |
| ⌘K = chain toggle (silent session cancel on re-press) | ⌘K = palette; chain = ⇧⌘K command w/ discard-confirm; silent-cancel trap removed (§3.5) |
| Chain palette non-modality, live seed re-flow, search/steps/footer, chainDefaults persistence | `chain` FloatingWindow, guts verbatim + drag/resize/reorder/discard-confirm (§6.5) |
| Chain palette fixed 340px, not draggable/resizable, no step drag-reorder (v1 exclusions) | resolved by FloatingWindow tenancy (§6.5) |
| VerticalSplit/HorizontalSplit (local-state %, reset-on-remount, 15–85 clamp) | kept for in-dialog splits; rebuilt on `usePointerDrag` (§7.4) |
| RightPanel resize handle (240–640 clamp, live persist) | `ResizeHandle` on the docked right sidebar (shell area) — primitive from §7.4 |
| FloatingInspector drag (persisted pos, clamp) | surface deleted (docked left sidebar); drag code → `usePointerDrag`/`FloatingWindow` |
| FloatingPreviewToolbar drag + phone pinned variant | surface deleted (timeline transport); primitive absorbed |
| Floating-card chrome string ×4 | `panelChrome` kit export (§7.9) |
| Ad-hoc z ladder 10/30/40/50/100 | `zIndex.ts` tokens; z-100 tier deleted; lint ban on literals (§7.3) |
| Modal-in-modal (CustomAssets→Material, Load→Confirm, mismatch→Confirm) | `DialogViewStack` + `InlineConfirmStrip`; ConfirmDialog top-level only (§7.5) |
| ConfirmDialog (alertdialog semantics) | kept, blessed scope narrowed (§7.5) |
| Native `<input type=color>` (Settings highlight rows, ColorAlphaField) | `ColorField` on react-aria ColorPicker w/ alpha (§7.7) |
| ColorAlphaField (color + 0–1 opacity slider + %) | rewritten on ColorField; slider-row variant kept (§7.7) |
| Density baseline (sm h-7 bars, py-1.5 rows) | additive `xs` tier + density tokens; sm untouched in dialogs/phone (§7.1–7.2) |
| Dark-only theme, alpha-wash hovers | dark-only stays; washes tokenized (§7.6) |
| Buttons `cursor-default` convention | kept, enforced in tv base (§7.2) |
| `useIsPhone` (<640px) breakpoint | unchanged; gates all phone variants (§8) |
| iOS zoom-lock meta, viewport focus-stealing | unchanged (shell area; noted for scope tracking) |
| stale `numberDraft.ts:70` comment ("decimal") | fixed to `url` (§7.9) |
| Kbd usage in SeatViewBar/TransformHud tooltips | Kbd chips in status tool segment + chip tooltips (§1.2) |
| `$snap` dormant plumbing (no UI) | snapStore + Tool bar toggle + status chip + ⌃ temporary invert (LOCKED #7; §1.2 #9) |
| Modifier-hint infrastructure gap (no held-key tracking) | modifierStore + hint providers (§1.4) |
| `$helpOpen`/`$aboutOpen` cross-surface open atoms | `dialogStore.$openDialog` ids (foundation §4) |
| Persisted keys flexo:inspectorVisible/Width/FloatPos/animPreviewFloatPos | superseded by `flexo:layout`; old keys abandoned, no migration (constitution) |
| SettingsModal ScaleEverything dual-mount + controlled/uncontrolled dual APIs | dialogStore command opening (foundation §4); single mount |
| Wiki part-preview mini-app, `?debug=dockingport` | untouched (foundation ledger) |

Constitution checks: `toast()` imperative ✓ · state layering (no react in `src/state/`) ✓ ·
on-demand render loop untouched (status bar subscribes atoms; FPS remains the only
continuous mode) ✓ · numeric fields via numberDraft ✓ · no migration code ✓ · dark-only ✓ ·
chain non-modal ✓ · React Compiler (no manual memoization anywhere in new components) ✓.

---

## 11. Implementation sequencing hooks (for the planner)

Maps onto foundation §17 steps 2–5: (a) `zIndex.ts` + tokens + `xs` tier + `panelChrome` +
`usePointerDrag`/`ResizeHandle` land with the docked skeleton (step 1–2 dependency);
(b) commandStore/MenuSpec (step 2) precedes the palette (same registry); (c) statusStore/
notificationStore land behind the `toast()` facade — v1 surfaces fold in one at a time,
GlobalToastRegion deleted last (step 3); (d) hotkey scopes land with modeStore (step 4);
(e) FloatingWindow lands with the Tool bar + chain migration (step 5); ColorField,
DialogViewStack, InlineConfirmStrip, CopyDownloadBar are independent tracks any step can
adopt. Every step leaves the repo compiling with both old and new surfaces coexisting
except where a surface is explicitly deleted in the same commit as its replacement.
