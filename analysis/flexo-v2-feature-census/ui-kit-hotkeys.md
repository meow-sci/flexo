# Area analysis: UI kit primitives, styling/density/theming, toasts, hotkey system, help

Repo: `/Users/asherwin/repos/meow-sci/flexo` · analyzed 2026-08-04 against `main` @ fcd5e07.
All paths below are repo-relative unless absolute.

---

## 1. Feature inventory

### 1.1 The component kit (`src/ui/kit/`)

The kit is a **centralized react-aria-components + Tailwind wrapper layer**. The stated rule
(`src/ui/kit/index.ts:1-2`): *import UI primitives from the kit, never from
`react-aria-components` directly, so styling stays in one place.* Unstyled trigger/collection
pieces are re-exported verbatim from react-aria (`index.ts:49-51`): `DialogTrigger`,
`MenuTrigger`, `SubmenuTrigger`, `Heading`, `Header`.

Every primitive, its API and variants:

| Primitive | File | API / variants | Notes |
|---|---|---|---|
| `Button` (+ exported `button` tv) | `kit/Button.tsx:5-45` | `variant`: primary / secondary (default) / ghost / danger / danger-ghost; `size`: sm (h-7, px-2.5, text-xs) / md (h-9, default) / lg (h-11); `iconOnly` (square, w=h) | tv `extend: focusRing`; all react-aria ButtonProps pass through (`onPress`, `isDisabled`, …) |
| `ToggleButton`, `ToggleButtonGroup` | `kit/ToggleButton.tsx` | sizes sm (h-6) / md (h-8); selected = solid accent fill | Group = segmented control: bordered sunken tray, `p-0.5 gap-0.5` (`:43-53`) |
| `Checkbox` | `kit/Checkbox.tsx` | react-aria CheckboxProps; renders 16px box + Check/Minus icon; supports indeterminate | label optional (children) |
| `Switch` | `kit/Switch.tsx` | h-5 w-9 track, accent when on | |
| `TextField` | `kit/TextField.tsx:10-65` | `label` / `description` / `errorMessage` (stacked when present, bare inline field when not), `size` from `inputStyles`, `inputMode`, `inputClassName`, `inputRef`, `onFocus/onBlur/onKeyDown` passthrough | `onChange` yields the **raw string** — load-bearing for the numeric-draft convention (§1.5) |
| `SearchField` | `kit/SearchField.tsx` | sizes sm/md; leading Search icon, clear button hidden until non-empty (`group-data-[empty]:hidden`) | native webkit cancel button suppressed |
| `Field` pieces | `kit/Field.tsx` | `inputStyles` tv (sm h-7 px-2 text-xs / md h-9 px-2.5 text-sm — the shared input surface), `fieldGroup` tv (input+stepper container), `Label` (text-xs fg-muted), `Description`, `FieldError`, `FieldGroup`, `SectionTitle` (uppercase tracking-wide panel heading) | |
| `Select` | `kit/Select.tsx:49-104` | `items` + render-fn children (react-aria collection API), `size` sm/md, `label`, `triggerClassName`/`popoverClassName`, **`searchable`** + `searchPlaceholder` | searchable = react-aria `Autocomplete` wrapping the ListBox with **virtual focus** (search input keeps DOM focus, arrows move listbox focus). This virtual focus is why `GlobalHotkeys.isTypingInField` exists (§1.3). Popover width = `--trigger-width` |
| `ListBox` / `ListBoxItem` | `kit/ListBox.tsx:23-48` | item = px-2 py-1.5 text-sm; selected shows trailing accent Check | |
| `GridList` / `GridListItem` | `kit/ListBox.tsx:50-77` | selection = accent **inset ring** + bg-white/8; keyboard focus = thinner ring | Multi-select list rows (Assets list, Mesh Picker). Same styling exported as function `gridRowClass` in `styles.ts:40-51` for call sites composing extras |
| `Slider` | `kit/Slider.tsx` | single-thumb styled track; react-aria SliderProps | |
| `Tag`/`TagGroup`/`TagList` | `kit/Tag.tsx` | removable tags (X button when `allowsRemoving`) | used by e.g. `EditorTagsField` |
| `Chip` | `kit/Tag.tsx:55-65` | static count/status pill (non-interactive span) | |
| `DisclosureSection` | `kit/Disclosure.tsx:19-63` | `title`, `badge` (trailing count), `defaultExpanded` | collapsible bordered card; header chevron rotates via `group-data-[expanded]` |
| `Toolbar` / `ToolbarSeparator` / `ToolbarButton` | `kit/Toolbar.tsx` | react-aria Toolbar ⇒ **arrow-key roving focus** across children; surface = `rounded-xl border bg-panel/95 p-1 shadow-popover backdrop-blur-md`; supports `orientation=vertical`. `ToolbarButton` = `Button variant=ghost size=sm` | the floating-bar chrome all top bars use |
| `Tooltip` | `kit/Tooltip.tsx` | `content`, `delay` (default 500ms), wraps one focusable child | max-w-xs, opacity transition |
| `Popover` / `PopoverDialog` | `kit/Popover.tsx` | offset default 6; scale/opacity enter/exit | `PopoverDialog` = focus-managed Dialog for arbitrary popover content |
| `Menu`/`MenuItem`/`MenuSection`/`MenuHeader`/`MenuSeparator` | `kit/Menu.tsx` | `MenuItem` `variant`: default / danger; auto textValue from string children; check column when `selectionMode !== 'none'`; submenu chevron | |
| `Modal` / `Dialog` / `DialogHeader` | `kit/Modal.tsx:14-88` | **variants**: `center` (max-w-md card — confirm/small forms), `sheet` (bottom sheet, max-h-88vh — phone), `fullscreen` (max-w-5xl card in padded overlay — big browsers/editors), `cover` (edge-to-edge — phone fullscreen). Overlay: `fixed inset-0 z-50 bg-overlay/60 backdrop-blur-sm`. `DialogHeader` = title + X close row | Controlled via `isOpen`/`onOpenChange`; children are a `Dialog` |
| `ConfirmDialog` | `kit/ConfirmDialog.tsx` | `title`, `text`, optional `children`, `confirmLabel`/`cancelLabel`, `confirmVariant`, `onConfirm`; `role="alertdialog"`, dismissable | the app-wide destructive-action confirm |
| Toast (`toast`, `toastQueue`, `GlobalToastRegion`) | `kit/Toast.tsx` | see §1.4 | |
| `useIsPhone` | `kit/useIsPhone.ts` | `useSyncExternalStore` on `(max-width: 639px)` (Tailwind `sm`) | THE responsive switch: phone ⇒ bottom sheets/FAB/overflow menus; desktop ⇒ floating panels |

### 1.2 Styling system, theme, density

- **Tailwind CSS v4** with tokens declared in `src/index.css` via `@theme` (`:9-40`), plus
  `@plugin 'tailwindcss-react-aria-components'` (`:2`) which provides state selectors like
  `pressed:`, `selected:`, `disabled:`, `data-[entering]:` used throughout the kit.
- **Variants** via `tailwind-variants` (`tv()`); class merging via `cn` = clsx +
  tailwind-merge wrapped to always return string (`kit/styles.ts:6-8`, react-aria render
  props require `string`). `composeTw` merges a fixed class string with react-aria's
  render-prop className (`styles.ts:28-33`).
- **No inline styles for look** — inline `style` only for dynamic px (panel width
  `RightPanel.tsx:80`, float positions, slider fill %, gizmo axis colors
  `TransformHud.tsx:20-24`).
- **Palette** (`src/index.css:9-40`), semantic names only, **dark theme only**
  (`color-scheme: dark`, `:root` at `:42-44`; there is no light theme or theme switcher):
  - Surfaces back→front: `canvas #0b0c0e` (behind viewport) → `panel #161719` (toolbars,
    inspector) → `panel-raised #1f2125` (popovers/menus/dialogs) → `panel-sunken #0e0f11`
    (inputs, lists, code) → `overlay #000` (scrim w/ opacity).
  - Borders `#2a2d32` / strong `#3a3e45`; text `fg #e8eaed` / `fg-muted #9aa0a8` /
    `fg-subtle #61666e`.
  - Accent = **radioactive green `#2cfa1f`** (+hover `#54fb4a`, press `#1fd615`,
    `accent-fg #052008` near-black-green for text on accent).
  - `danger #ef4444`, `warning #f5c542` (+ their `-fg`), elevation `--shadow-popover`.
  - Hover/press fills are frequently raw `bg-white/[0.04..0.13]` alpha washes rather than
    tokens (Button secondary/ghost, list rows, menu items) — a convention, not a token.
- **Shared style constants** (`kit/styles.ts`): `focusRing` (accent 2px outline, keyboard
  focus only — extended by every interactive primitive), `gridRowClass`, callout boxes
  `warningBox` (amber) / `dangerBox` (red) / `noteBox` (neutral advisory — deliberately
  toneless, used for export pre-flight "info" severity), `monoTextarea` (h-96) /
  `monoTextareaFill` (flex-fill) for XML/JSON payloads.
- **Floating-bar chrome** is duplicated as a local constant in non-kit files:
  `'rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md'`
  appears in `FloatingEditorPanel.tsx:5-6` and `chain/ChainPalette.tsx:15-16` (p-3), and
  near-identical strings in `ManageTexturesPanel.tsx:148`, `FloatingPreviewToolbar.tsx:90`
  (px-2 py-1.5), kit `Toolbar` (p-1).
- **Current density baseline** (v2 wants denser — slim bars ≈0.125rem vertical padding):
  - Buttons: sm **h-7** (1.75rem), md h-9, lg h-11; ToggleButton sm h-6 / md h-8.
  - Inputs: sm **h-7** px-2 text-xs, md h-9 (`Field.tsx:16-25`).
  - Toolbar surface p-1 + sm ghost buttons ⇒ floating bars are ≈ 2.25rem tall overall.
  - Menu/list items px-2 **py-1.5** text-sm; GridList rows py-1.5 (py-1 in `gridRowClass`).
  - `DialogHeader` px-4 py-2.5; ConfirmDialog body p-4 gap-4.
  - TransformHud pill is h-7; SliderRow/Vec3Field rows are the densest existing UI
    (text-xs labels w-12/w-3, sm inputs).

### 1.3 Hotkey system

- Library: **react-hotkeys-hook** (project skill `.claude/skills/hotkeys` documents usage).
- **Central registry** `src/ui/hotkeys/registry.ts` — the single source of truth. Each
  `HotkeyBinding` = `{ id, label, keys (react-hotkeys-hook string), chords (display tokens
  for <kbd> chips), options?, run(event) }`, grouped into `HOTKEY_GROUPS` (titles: "Rotate
  selection", "Nudge", "Editing", "General"). The registry drives BOTH the live bindings AND
  the help overlay, so docs can't drift from behavior (`registry.ts:12-17`). Full binding
  table in §6.
- **Mount**: `GlobalHotkeys` (`hotkeys/GlobalHotkeys.tsx`) rendered once in `app.tsx:58`.
  One child component per binding so `useHotkeys` hook order is stable. Shared defaults:
  `preventDefault: true`, `ignoreEventWhen: isTypingInField`. `isTypingInField`
  (`GlobalHotkeys.tsx:34-40`) checks `document.activeElement` (INPUT/TEXTAREA/SELECT/
  contentEditable) instead of relying on react-hotkeys-hook's event-target check, because
  react-aria **virtual focus** (searchable Select's Autocomplete) re-dispatches synthetic
  key events on a `<div role="listbox">` and would otherwise let WASD/Delete fire while
  typing a search query. This is a subtle, load-bearing fix.
- **No scope/context system.** All registry bindings are global; per-mode behavior is done
  by gating inside `run` (e.g. `exit-seat-view` checks `$seatView.get() !== null`,
  `registry.ts:206-216`) or by react-hotkeys-hook `enabled:` on the few **local** bindings.
  Conflict handling is purely by convention/comments (e.g. the Escape binding sets
  `preventDefault: false` so it never shadows dialog/popover dismissal,
  `registry.ts:207-215`).
- **Local (off-registry) key handling** — these do NOT appear in the help dialog:
  - `chain/ChainPalette.tsx:70-76`: `mod+enter` = apply chain (enabled only with a session,
    `enableOnFormTags: true`), `escape` = cancel (no preventDefault, deliberately layered
    under numberDraft's dirty-Escape swallow).
  - `AnimationPanel.tsx:82-90`: window keydown Escape "unwind" — keyframe → joint →
    animation selection, ignored while typing.
  - `LayersPanel.tsx:431`: Enter commit / Escape cancel inline layer rename.
  - `useNumberDraft` per-field Enter/Escape/ArrowUp/ArrowDown (§1.5).
  - Viewport: **⌘/Ctrl/Shift+click = additive selection**
    (`three/SelectionManager.ts:73`); Shift+click = range selection in multi-select lists
    via `src/ui/rangeSelect.ts` (own implementation because react-aria's anchor is lost on
    controlled selections — `rangeSelect.ts:5-18`; grow-only semantics documented at
    `:33-51`).
  - Modifier scaling inside numeric fields: arrows step, **Shift ⇒ ×10, Alt ⇒ ×0.1**
    (`numberDraft.ts:111`).
- There is currently **no Alt-drag-duplicate** or any other pointer-modifier duplicate
  gesture (duplicate is a button/menu action only) — relevant to the v2 "[⌥] Duplicate
  part" status-bar hint idea: the hint infrastructure (Kbd + keyLabel) exists, the gesture
  does not.

### 1.4 Toast system (end-to-end)

- Implementation: react-aria **UNSTABLE_ToastQueue** singleton (`kit/Toast.tsx:19`,
  `maxVisibleToasts: 4`). `toast(message, {timeout})` is an **imperative, module-level
  function** — callable from non-React code (three-layer `EditorScene.ts:1427`, boot code
  `main.tsx:72,76`, plain-TS control wrappers `nudgeControls.ts` / `rotateControls.ts`).
  Default timeout **4000ms**; every call site overrides ad-hoc (1500 / 1800 / 2000 / 2500 /
  10000).
- `ToastMessage = { title, description?, variant?: default|success|danger|warning }`.
  Variant maps to border color only. Title AND description are single-line **truncated**
  (`Toast.tsx:48-55`) — long errors get cut off. Manual X dismiss per toast.
- Region: `GlobalToastRegion` mounted in `main.tsx:83` (beside `<App/>`, inside
  StrictMode), `fixed bottom-4 right-4 z-[100]`, newest stacking.
- **Complete call-site pattern census** (~44 sites; grep `toast(`):
  1. **Hotkey/action feedback (should become v2 status-bar flashes)** — undo/redo labels
     (`hotkeys/registry.ts:47,51`, `Toolbar.tsx:45,55`, `MobileTopBar.tsx:65,75`,
     `HistoryButton.tsx:89` — same string built in FOUR places), copy/paste counts
     (`registry.ts:56,60`), nudge axis/step (`nudgeControls.ts:28,34,40`), rotate axes/step
     (`rotateControls.ts:26,32,38`), "Scaled everything X×Y×Z"
     (`ScaleEverythingDialog.tsx:48`).
  2. **Success confirmations** — Part/SubPart added (`PartBrowser.tsx:105,112`,
     `SubPartBrowser.tsx:70,76`), mesh created (`CreateMeshDialog.tsx:82`), texture added
     (`CustomTextureDialog.tsx:82`), material saved/created (`MaterialDialog.tsx:128,131`),
     project imported (`ProjectTransferDialogs.tsx:123`), shared project opened
     (`main.tsx:76`), export results (`ExportButton.tsx:296,304,334`), chain applied
     (`chain/ChainPalette.tsx:63`).
  3. **Errors (danger)** — model read/import failures (`ImportModelDialog.tsx:141,289`),
     import/export failures (`ProjectTransferDialogs.tsx:119`, `ExportButton.tsx:311`),
     share-link decode failure (`main.tsx:72`), texture/material failures
     (`CustomTextureDialog.tsx:40,86`, `MaterialDialog.tsx:137`, `CreateMeshDialog.tsx:86`).
  4. **Warnings** — boot purge of incompatible saved projects (10s, `app.tsx:45-52`),
     chain seeds vanished (`ChainPalette.tsx:60`), "Nothing to aim at" from the three layer
     (`EditorScene.ts:1427-1432` — proof the toast entry point must stay callable outside
     React).

### 1.5 Numeric input convention (MANDATORY project-wide)

- Core: `useNumberDraft` (`src/ui/numberDraft.ts:72-156`) + **`inputMode="url"`** on every
  numeric field. The `url` mode is deliberate and commented at both wrappers
  (`NumberField.tsx:45`, `PreciseNumberInput.tsx:32`): it is the only mobile keyboard
  showing a minus key (`numeric`/`decimal` don't). Auto-memory confirms this is an absolute
  rule: ad-hoc `Number(v)` controlled TextFields are regressions.
- Editing model (all behaviors are user-depended-on invariants):
  - Rendered as **text** inputs, never `type=number` (number inputs sanitize their DOM
    value; in-progress `-`, `.`, `0.`, `1e-` would be erased by the controlled re-render —
    `numberDraft.ts:3-11`).
  - While focused, a raw string draft; keystrokes failing `isPartialNumber` are dropped
    without rewriting the draft (`:21-26`, exponent needs mantissa).
  - Every keystroke that parses **in-range commits live** (gizmos/3D follow along);
    out-of-range keystrokes are *skipped, not clamped* (`:122-127`) — clamp happens once at
    finalize.
  - Blur/Enter finalize: clamp+commit, or restore pre-edit if unparseable. The
    `draft === null` guard in `finalize` (`:84-94`) is load-bearing: after Enter, a
    selection change can re-bind the still-focused field to a different entity, and blur
    must not stomp it with the stale pre-edit value.
  - Escape reverts — but **only when dirty** (then `preventDefault` + `stopPropagation`),
    so untouched fields still let Escape close the surrounding popover/dialog (`:139-146`).
  - ArrowUp/Down nudge by `step` (Shift ×10, Alt ×0.1); `trimFloatNoise` =
    `toPrecision(12)` kills 0.1+0.2 dust (`:42-44`).
  - `onInteractionStart` fires once on focus so a typing session collapses to **one undo
    step** — this is the contract between fields and editorStore undo.
  - Unit-tested (`src/ui/numberDraft.test.ts`).
- Wrappers:
  - `NumberField` (`NumberField.tsx`) — one-char label slot (`w-3`) + `ariaLabel`; display
    via `fmt` (round ~5 decimals, drop trailing zeros, `format.ts:7-10`).
  - `PreciseNumberInput` (`PreciseNumberInput.tsx`) — same but preserves exact typed value
    (no display rounding); requires `aria-label`.
  - `Vec3Field` (`Vec3Field.tsx`) — X/Y/Z row of PreciseNumberInputs, per-axis commit,
    per-axis `disabled` (axis-locked measurement endpoints), shared min/max/step.
  - `SliderRow` (`SliderRow.tsx`) — labeled slider + right-aligned mono readout;
    `onInteractionStart` on pointer-down (one undo per drag).
  - `ColorAlphaField` (`ColorAlphaField.tsx`) — native `<input type=color>` (no alpha in
    the native picker, hence) + separate 0–1 opacity slider + % readout.
  - `format.ts` also exports `RAD2DEG`/`DEG2RAD` used by inspector panels.
- Direct `useNumberDraft` consumers beyond the two wrappers: `LayersPanel.tsx`,
  `ImportModelDialog.tsx`, `CreateMeshDialog.tsx`, `ManageTexturesPanel.tsx`,
  `chain/ChainPalette.tsx` (spread onto kit `TextField` per the hook's doc:
  `<TextField inputMode="decimal" …>` comment at `numberDraft.ts:70` is stale — real call
  sites use `url`).

### 1.6 Help / shortcut display

- `HelpDialog` (`hotkeys/HelpDialog.tsx`) — renders `HOTKEY_GROUPS` as a 2-column grid of
  bordered tables (label + chord chips), footer note "Shortcuts are disabled while typing
  in a text field. Press ? any time…". Modal `fullscreen` on desktop, `cover` on phones.
- Open paths: **`?` hotkey** (toggle; `useKey: true, ignoreModifiers: true` so it matches
  the produced character across layouts — `registry.ts:195-200`), **Settings menu →
  "shortcuts"** (`SettingsButton.tsx:226`), **mobile overflow menu**
  (`MobileTopBar.tsx:95`). State = `$helpOpen` atom in `src/state/helpStore.ts`
  (ephemeral, store-not-prop so disconnected surfaces can open it).
- `Kbd` (`hotkeys/Kbd.tsx`) — the single keycap chip (mono text-xs, bordered, min-w
  1.5rem). Reused outside help: `TransformHud.tsx:161` (rotate/nudge tooltip hint rows via
  local `HintRow`) and `SeatViewBar.tsx:89` (`Esc` chip inside the Exit button). This is
  the seed of v2's status-bar modifier hints.
- `keyDisplay.ts` — `IS_APPLE` (navigator.platform/userAgent) + `keyLabel`: `mod` → ⌘/Ctrl,
  `shift` → ⇧/Shift, everything else verbatim. Registry chords stay platform-neutral;
  glyphs resolve at render.
- Also help-adjacent: `AboutDialog.tsx` (first-run intro; `flexo:aboutSeen`), Tooltip-based
  micro-help (e.g. `SeatViewBar` info popover, TransformHud hint tooltips).

### 1.7 Drag / resize primitives (what exists vs. must be built)

- `VerticalSplit` / `HorizontalSplit` (`src/ui/VerticalSplit.tsx`) — pointer-drag divider
  between two panes; percentage in **local state, resets on remount** (Add Part / Add
  SubPart browser modals rely on the 50/45% snap-back — `:4-10`); min/max pct clamps;
   wider invisible hit area (`:69-72`); `role="separator"` + aria-orientation. Used only by
  `BrowserShell.tsx:57-59` (list/preview/details layout in the part & subpart browsers,
  nested splits on desktop).
- Right sidebar resize — bespoke in `RightPanel.tsx:17-37`: left-edge `w-2` invisible
  handle, pointer drag → `setInspectorWidth` clamped 240–640 px, **persisted**
  (`uiStore.ts:25-40`, `flexo:inspectorWidth`, `flexo:inspectorVisible`).
- Draggable floating windows — two more bespoke pointer-drag implementations:
  `FloatingInspector.tsx` (header drag; persisted `$inspectorFloatPos`; on-screen clamping
  margin) and `FloatingPreviewToolbar.tsx` (grip drag; persisted `$animPreviewFloatPos`;
  desktop only — phone gets a pinned in-flow bar because "touch-dragging a hover bar is
  fiddly", `:20-24`). Both clamp the stored position back into a shrunk viewport.
- **There is no generic draggable-window or resizable-panel primitive** — four independent
  pointer-drag implementations (Split, RightPanel handle, FloatingInspector,
  FloatingPreviewToolbar) share no code. v2's resizable left+right sidebars and draggable
  floating bars must be built as a real primitive; the four existing implementations are
  the migration checklist.

---

## 2. UI surface map (surfaces this area renders or whose chrome it defines)

Mount root is `app.tsx` inside `div.fixed.inset-0`; overlays portal via react-aria.

| Surface | Kind | Mount / position | z | Notes |
|---|---|---|---|---|
| `GlobalToastRegion` | toast stack | `main.tsx:83`; `fixed bottom-4 right-4` | **z-[100]** | Highest thing in the app; floats above modals. Overlaps ImportReportCard's corner (below) |
| Kit `Modal` overlay | dialog scrim | react-aria portal; `fixed inset-0` | **z-50** | All ~28 modal-using files (list: §2.1) share this. Backdrop blur + 60% black |
| `Popover` / `Menu` / `Tooltip` | popovers | react-aria portal, anchored | react-aria stacking (portal order) | offset 6; no explicit z — relies on portal-last-wins; works because they portal above the app root |
| `ImportReportCard` | floating card | `absolute bottom-3 right-3` | z-40 | non-modal, sits directly under the toast region — simultaneous toasts cover it |
| `ChainPalette` | floating non-modal palette | `absolute left-3 top-16 w-[340px]` desktop; bottom-sheet-ish on phone | z-30 | ⌘K; deliberately non-modal so viewport stays live (`ChainPalette.tsx:18-28`) |
| `FloatingInspector` | draggable window | `absolute` at stored pos, default bottom-left | z-30 | desktop only |
| `FloatingPreviewToolbar` | draggable bar | `absolute` at stored pos, default top-center | z-30 | anim scrubber; phone variant pinned in top stack |
| `SeatViewBar` | HUD bar | `absolute inset-x-0 bottom-14`, centered | z-30 | shows `Esc` Kbd |
| `TransformHud` | HUD pill | `absolute inset-x-0 bottom-2`, centered | (none) | rotate/nudge status bubble; hidden on phone; tooltips carry Kbd hint tables |
| `RightPanel` | sidebar | `absolute right-0 top/bottom-0`, width from store | (panel z-10 handle) | desktop inspector; collapsible |
| `FloatingEditorPanel` (Measurement/Container editors) | floating card | `absolute left-3 top-1/2 -translate-y-1/2`; phone: `inset-x-2 bottom-20` | z-10 | shared chrome + lock/close header |
| `ManageTexturesPanel` | floating panel | `absolute left-3 top-1/2` w-64 | z-10 | same left-center slot as FloatingEditorPanel ⇒ can overlap it |
| `HelpDialog` | modal | kit Modal fullscreen/cover | z-50 | driven by `$helpOpen` |
| `MeasurementInfo` | HUD | bottom-left | — | bbox dimensions readout |
| `WorkspaceLoadProgress` | HUD/overlay | bottom-center / `absolute inset-0` z-10 while blocking | z-10 | |
| `ViewportDropZone` highlight | inline overlay | `absolute inset-3` z-10 | z-10 | drag-over affordance |
| Toolbars (Editor/Selection/MultiSelect) | floating bars | top-center stack (`app.tsx:78-95`) | — | kit `Toolbar` chrome; phone = full-width `MobileTopBar` |

**Known overlap/stacking issues** (see §4): bottom-center is contested (TransformHud z-none,
SeatViewBar z-30 bottom-14, LoadProgress bottom-center); bottom-right contested (toasts
z-100 over ImportReportCard z-40); left-center contested (FloatingEditorPanel ×2 +
ManageTexturesPanel + ChainPalette all left-anchored). The z ladder (10/30/40/50/100) is
ad-hoc with no central scale file.

### 2.1 Modal users (all consume kit Modal/Dialog — every one must survive v2)
`HistoryButton, GlowPaintDialog, MeasureButton, BuildIdMismatchDialog, MeshPickerModal,
CustomAssetsModal, ImportModelDialog, ExportButton, ProjectTransferDialogs, AssetsList,
ProjectButton, AssetsToolbar, MobileInspector, CreateMeshDialog, ViewButton,
ScaleEverythingDialog, AnimToolbar, AboutDialog, ManageTexturesPanel, SettingsButton,
ShareProjectDialog, BrowserShell, MobileTopBar, PartDataButton, ManageTanksModal,
MaterialDialog, HelpDialog, CustomTextureDialog` — modal-in-modal exists (e.g.
`CustomAssetsModal.tsx:431` opens `MaterialDialog` above the already-fullscreen assets
modal).

---

## 3. State & data flow

- **Persisted (localStorage via `@nanostores/persistent` `persistentJSON`)** —
  `src/state/uiStore.ts`: `flexo:inspectorVisible` (bool), `flexo:inspectorWidth`
  (240–640 clamp), `flexo:inspectorFloatPos` (`{x,y}|null`, null = default anchor),
  `flexo:animPreviewFloatPos` (same). Cleared by the global data reset
  (`localStorage.clear` — `nukeAndReload.ts`). Also `flexo:aboutSeen` (AboutDialog).
- **Ephemeral stores**: `$helpOpen` (`helpStore.ts` — atom, store-not-prop so `?` hotkey /
  Settings / mobile menu can all open it), `$inspectorMode` (`uiStore.ts:17-22` —
  assets/anim/engine, resets on reload like selection), `toastQueue` (module singleton),
  hotkey-adjacent editor atoms `$nudgeAxis/$nudgeStep/$rotateStep/$rotateAxisOffset`
  (editorStore — another area, but this area's HUD/toasts/hotkeys read them).
- **Split percentages** are React local state (reset on remount by design).
- **Undo/redo participation**: none of this area's own state is undoable. The contract this
  area *provides* is `onInteractionStart` (numberDraft focus / SliderRow+ColorAlphaField
  pointer-down) so editorStore can push exactly one undo step per typing/drag session; and
  the undo/redo hotkeys + toasts surfacing `undo()/redo()`'s returned description string.
- **Cross-store subscriptions**: registry `run` handlers read stores imperatively
  (`$seatView.get()`, `$chainEval.get()`) — bindings stay mounted, gating is data-driven.
  `nudgeControls`/`rotateControls` are the UI-layer toast wrappers deliberately kept out of
  editorStore so the store stays free of UI deps (`nudgeControls.ts:10-16`).
- **Non-React producers**: `toast()` is called from `three/EditorScene.ts` and boot code in
  `main.tsx` — any v2 notification system must keep an imperative, non-hook entry point.

---

## 4. Pain points (file:line evidence)

1. **No hotkey scoping/modes.** Registry bindings are always-on globals; per-context gating
   is hand-rolled inside `run` (`registry.ts:206-216`) or via local `useHotkeys
   enabled:` flags (`ChainPalette.tsx:70-76`). A v2 mode-based layout (subpart-placement /
   animation / data modes) has nowhere to hang per-mode bindings today, and unmodified
   single letters (W/A/S/D/Q/E/R/F) will collide with future surfaces.
2. **Help drifts for local bindings.** The registry's "no drift" guarantee
   (`registry.ts:12-17`) only covers registry bindings — ⌘Enter (chain apply), the
   Escape-unwind in `AnimationPanel.tsx:82-90`, list Shift/⌘-click semantics
   (`rangeSelect.ts`, `SelectionManager.ts:73`) and numeric-field arrows/Shift/Alt scaling
   appear nowhere in HelpDialog.
3. **Toasts doing status-bar work.** High-frequency transient feedback (nudge axis/step on
   every ←/→ press — `nudgeControls.ts:28`; rotate axes summary on every R —
   `rotateControls.ts:26`) spams the bottom-right queue (max 4 visible) and can evict real
   notifications (an export error can be pushed around by "Nudge axis: Y" ×4). Exactly the
   category v2's status bar should absorb; the success/error/warning categories belong in a
   notification center. Truncated single-line description (`Toast.tsx:48-55`) also loses
   long error text with no way to expand or copy.
4. **Undo/redo toast string built in four places**: `hotkeys/registry.ts:45-52`,
   `Toolbar.tsx:45,55`, `MobileTopBar.tsx:65,75`, `HistoryButton.tsx:89`.
5. **Four unrelated pointer-drag implementations** (`VerticalSplit.tsx:30-47`,
   `RightPanel.tsx:17-37`, `FloatingInspector.tsx:31-67`, `FloatingPreviewToolbar.tsx:34-78`)
   — no shared drag/resize primitive, each re-doing clamping/persist/global-listener
   cleanup. v2's sidebars + floating bars need one real primitive.
6. **Ad-hoc z-index ladder** — 10 / 30 / 40 / 50 / 100 scattered as literals (see table
   §2); popovers rely on portal ordering with no explicit layer. Toast region (z-100,
   bottom-right) covers `ImportReportCard` (z-40, bottom-right). Bottom-center is triple-
   booked (TransformHud / SeatViewBar / LoadProgress). Left-center is quadruple-booked
   (Measurement editor, Container editor, ManageTexturesPanel at the same `left-3 top-1/2`
   slot — `FloatingEditorPanel.tsx:33`, `ManageTexturesPanel.tsx:148` — plus ChainPalette
   at `left-3 top-16`).
7. **Floating-card chrome string duplicated** ≥4× instead of being a kit export
   (`FloatingEditorPanel.tsx:5`, `ChainPalette.tsx:15`, `ManageTexturesPanel.tsx:148`,
   `FloatingPreviewToolbar.tsx:90`).
8. **Modal-in-modal**: `CustomAssetsModal` (fullscreen) stacks `MaterialDialog`
   (`CustomAssetsModal.tsx:431`); several browsers do similar. Works via react-aria but is
   heavy — v2's overlay/asset-management redesign should flatten these.
9. **Stale doc-comment**: `numberDraft.ts:70` says spread with `inputMode="decimal"`;
   actual mandatory convention is `inputMode="url"` (`NumberField.tsx:45-46`,
   `PreciseNumberInput.tsx:32-33`). Fix the comment in v2, keep `url`.
10. **Dark-only theme, alpha-wash hovers**: hover/press states hardcode `bg-white/[0.0x]`
    (Button, Menu, list rows) — if v2 ever themes, these break silently; also `noteBox` vs
    `warningBox` severity semantics live only in comments (`styles.ts:61-66`).
11. **Buttons default `cursor-default`** (`Button.tsx:7`) — desktop-app convention chosen
    deliberately; keep or change consciously in v2, but be consistent.
12. **Toast timeouts ad-hoc per call site** (1500/1800/2000/2500/4000/10000) with no
    severity→duration policy.

---

## 5. Invariants & constraints (MUST survive)

- **Numeric editing model — the whole of §1.5.** Non-negotiable per project memory: every
  numeric field uses `useNumberDraft` + `inputMode="url"`; text inputs, never
  `type=number`; live in-range commit; skip-don't-clamp during typing; Enter/blur
  finalize; dirty-only Escape swallow; the `draft===null` stale-commit guard
  (`numberDraft.ts:84-94`); Shift×10/Alt×0.1 arrow scaling; `onInteractionStart` ⇒ exactly
  one undo step per session. `numberDraft.test.ts` must keep passing.
- **`?` binding via `useKey`/`ignoreModifiers`** (`registry.ts:195-200`) — layout-agnostic;
  naive `shift+/` breaks non-US layouts.
- **Escape layering order** (bottom to top): numberDraft dirty-revert →
  popover/menu/dialog dismiss (react-aria) → chain-palette cancel → animation unwind →
  seat-view exit (store-gated, `preventDefault:false` — `registry.ts:207-215`). Any v2
  hotkey system must preserve that Escape is never globally preventDefault'ed.
- **`isTypingInField` uses `document.activeElement`** (`GlobalHotkeys.tsx:34-40`) — the
  react-aria virtual-focus leak is real; event-target-based suppression is insufficient.
- **`toast()` stays imperatively callable outside React** (three layer + boot use it).
- **Registry = single source for bindings AND their help listing** — whatever replaces
  HelpDialog must keep deriving from the same data as the live bindings.
- **`mod` platform abstraction** (`keyDisplay.ts`) — chords stored platform-neutral,
  glyph resolution at render (⌘/Ctrl, ⇧/Shift).
- **Persisted keys** `flexo:inspectorVisible/Width/FloatPos`, `flexo:animPreviewFloatPos`,
  `flexo:aboutSeen` — either honored or intentionally superseded (project constitution:
  no migration code; stale persisted UI state may simply be dropped, per the boot-purge
  pattern).
- **Viewport selection modifiers** ⌘/Ctrl/Shift+click additive (`SelectionManager.ts:73`);
  list Shift+click grow-only range semantics (`rangeSelect.ts:33-51` — deliberate,
  documented, tested in `rangeSelect.test.ts`).
- **kit import discipline** — react-aria imported only via `src/ui/kit` (plus the verbatim
  re-exports); React Compiler active ⇒ no manual memoization in any of this code.
- **useIsPhone breakpoint (<640px)** gates every desktop/phone layout fork; phone variants
  (sheets, overflow menu, pinned bars) are features, not fallbacks.
- **`fmt` display rounding (~5 decimals) vs `PreciseNumberInput` exactness** distinction —
  precise fields exist because display rounding on transform values loses user intent.

---

## 6. Hotkeys (complete registry + local bindings)

Registry (`src/ui/hotkeys/registry.ts`, defaults `preventDefault:true`, suppressed while
typing in a field):

| Group | Keys | Action | Notes |
|---|---|---|---|
| Rotate | `W`/`S` | rotate selection, pair ws (∓) | `rotateSelectionAroundPair` |
| Rotate | `A`/`D` | rotate, pair ad | |
| Rotate | `Q`/`E` | rotate, pair qe | |
| Rotate | `R` | cycle rotation axes | toasts new mapping |
| Rotate | `F` / `⇧F` | rotate step larger / smaller | toasts step |
| Nudge | `↑`/`↓` | nudge along active axis | |
| Nudge | `⇧↑`/`⇧↓` | nudge ×FAST_NUDGE_MULTIPLIER | |
| Nudge | `←`/`→` | cycle nudge axis back/forward | toasts axis |
| Nudge | `⇧←`/`⇧→` | nudge step smaller/larger | toasts step |
| Editing | `Delete`/`Backspace` | delete selection | |
| Editing | `mod+C` / `mod+V` | copy / paste-in-place | toasts count |
| Editing | `mod+K` | toggle action-chain palette | suppresses browser ⌘K |
| Editing | `mod+Z` | undo | toasts description |
| Editing | `mod+Y` / `mod+⇧Z` | redo | |
| General | `?` | toggle help | `useKey`, `ignoreModifiers` |
| General | `Escape` | exit IVA seat view | `preventDefault:false`, gated on `$seatView` |

Off-registry (not in help): `mod+Enter` apply chain + `Escape` cancel chain
(`ChainPalette.tsx:70-76`); `Escape` unwind keyframe→joint→animation
(`AnimationPanel.tsx:82-90`); `Enter`/`Escape` in layer rename (`LayersPanel.tsx:431`);
per-field `Enter/Escape/↑/↓ (+Shift/Alt scaling)` (numberDraft); pointer modifiers:
⌘/Ctrl/Shift-click additive viewport select, Shift-click list range select,
⌘/Ctrl-click list toggle (react-aria default).

---

## 7. Cross-area dependencies

- **Everyone → kit**: every UI area consumes kit primitives + style constants; BrowserShell
  (part/subpart browsers area) consumes VerticalSplit; inspector areas consume
  NumberField/PreciseNumberInput/Vec3Field/SliderRow/ColorAlphaField/format.
- **Hotkeys → editor/three areas**: registry imports `editorStore`
  (undo/redo/copy/paste/remove), `three/rotateSelection`, `three/nudgeSelection`,
  `ivaStore` ($seatView/exitSeatView), `chain/openChainPalette`, `helpStore`.
- **Three layer → this area**: `EditorScene.ts` calls `toast()`; gizmo/axis colors are
  mirrored by TransformHud's `AXIS_COLOR` (`TransformHud.tsx:20-24` — must stay in sync
  with gizmo handle colors).
- **Boot (`main.tsx`) → toast** for share-link results; **app.tsx → toast** for the
  schema-purge notice (projectStore contract).
- **Undo system ← onInteractionStart** contract from every input primitive.
- **TransformHud ↔ nudge/rotate controls ↔ registry**: the same store actions are reachable
  by click (HUD), key (registry), and both funnel feedback through
  `nudgeControls`/`rotateControls` so it is identical (`nudgeControls.ts:10-16`).
- `keyLabel`/`Kbd` consumed by TransformHud and SeatViewBar (outside `hotkeys/`).

---

## 8. Open questions for v2

1. **Hotkey scoping model**: introduce first-class scopes (global / per-mode / per-surface)
   in the registry — via react-hotkeys-hook `scopes`, or keep store-gated `run` guards?
   Must local bindings (chain palette, animation unwind) join the registry so help stays
   complete, and how do mode-scoped entries render in help?
2. **Single-letter transform keys** (W/S/A/D/Q/E/R/F): keep as global unmodified keys in
   all modes, or restrict to a placement/transform mode in the mode-based layout? (Users
   already depend on them; restricting changes muscle memory.)
3. **Status bar vs notification center split**: which existing toast categories map where?
   Proposal implicit in the census (§1.4): category 1 → transient status-bar flashes;
   2–4 → notification center with severity retention; but "Part Added" (success, frequent)
   is arguable either way. Also: does the imperative `toast()` API survive as the single
   entry point with a routing layer behind it?
4. **Density retune**: v2 wants ~0.125rem vertical padding bars — new `xs` size variants on
   Button/input tv's, or a global density rescale of sm? Existing h-7/h-9 sizes are used
   everywhere; a third size risks inconsistency, a rescale risks touch targets on tablet.
5. **Draggable/resizable primitive**: build one kit primitive (drag handle + clamp +
   persist key) replacing the four bespoke implementations — pointer-events based like
   today, or adopt react-aria's `useMove`? Should floating-bar positions stay
   localStorage-persisted per bar (current) or become part of a v2 layout store?
6. **z-index scale**: centralize as tokens (e.g. hud < floating < overlay < toast) — and
   should toasts really outrank modals (currently z-100 > z-50)? A status-bar model may
   remove the question for transient toasts but not for notification popups.
7. **Theming**: stay dark-only (current `color-scheme: dark`, alpha-wash hovers) or
   tokenize the white-alpha washes now to keep a future light theme possible cheaply?
8. **Modifier-hint HUD** ("[⌥] Duplicate part" in the status bar): Kbd/keyLabel are ready,
   but there is no live-modifier tracking (keydown/keyup listener for held Alt/Shift/⌘)
   anywhere yet — needs a new small store; and the Alt-duplicate gesture itself does not
   exist today (decide whether v2 adds the gesture or only hints existing ones).
9. **Help surface**: keep a dedicated shortcuts dialog, or fold into a broader v2 help/
   onboarding surface (AboutDialog + per-feature tooltips exist separately today)?
10. **`ConfirmDialog` vs richer patterns**: v2's project/asset-management overlays will need
    multi-step flows; decide whether ConfirmDialog stays the only blessed confirm or a
    task-dialog primitive is added (avoiding today's modal-in-modal stacks).
