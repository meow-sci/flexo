# FLEXO V2 REFACTOR PLAN

**Status**: ready for implementation · **Finalized**: 2026-08-05 · **Supersedes**: the v1 UI shell (not the business features — RULE ZERO below)

**281 tasks** across 14 phases (P0-1: 21 · P2-3: 32 · P4: 15 · P5A: 18 · P5B: 30 ·
P6-7: 41 · P8: 27 · P9-10: 29 · P11: 48 · P12: 20). Every task was authored against the
finalized design corpus and the live codebase, then adversarially audited twice —
a coverage audit (every design element → a named task, cross-phase seam checks) and an
implementability audit (every code citation verified against the repo, snippet/idiom
review, compile-green ordering) — with all findings applied. The audit trail lives in
`plans/flexo_v2/audits/`.

flexo v2 is a ground-up redesign of the editor's UI shell around five task **modes** —
**Build** (default) / **Animation** / **Data** / **Engine** / **Surface** — inside a fully
**docked** layout: a slim traditional menubar, resizable/collapsible left (focus editor)
and right (mode primary) sidebars, a bottom-docked Animation timeline, and a slim status
bar that absorbs toasts/HUDs/progress and hosts a bell notification center. Exactly two
floating windows survive (gizmo Tool bar, Chain palette), both on one draggable
`FloatingWindow` primitive. A single command registry drives the menubar, the ⌘K command
palette, hotkeys, and the Help dialog from one dataset. Projects move to an id-keyed
IndexedDB store with a rich Project Manager overlay and `.flexo.tar.gz` archives that
carry binary assets. Phone (<640px) keeps FULL parity via a bottom mode-tab-bar + sheet
system.

## 0.1 RULE ZERO

**Every v1 feature ships in v2. Cutting a feature is never an available implementation
move.** The feature census of record is `analysis/flexo-v2-feature-census/*.md` (12
exhaustive area inventories of the v1 app). The design corpus maps every census line to a
v2 home; Phase 12 executes a final parity audit against the census. If a task seems to
require dropping behavior, STOP and flag it — do not improvise.

## 0.2 The design corpus (normative)

The plan implements the finalized design in `plans/flexo_v2/design/`:

| Doc | Role |
|---|---|
| `foundation.md` | **LAW** — shell contract: layout, mode machine, menubar tree, status bar, floating policy, hotkey architecture, phone framework, shell stores, wireframes, RULE ZERO ledger (§16), build order (§17) |
| `design-build-mode.md` | Build mode, selection model, Outliner, focus editors, browsers, chain |
| `design-animation-mode.md` | Animation mode: timeline, members, pose tooling, playback, per-channel easing |
| `design-data-engine-modes.md` | Data + Engine modes |
| `design-surface-assets.md` | Surface mode + Asset Manager + import pipeline |
| `design-projects-export.md` | Projects/persistence/archive, Export to KSA, sharing, Settings IA |
| `design-system-services.md` | Status bar, notifications, palette, hotkeys, FloatingWindow, kit/density |
| `FINAL_DESIGN_INDEX.md` | **Authoritative** consolidated hotkey table + menubar tree + parity assertion |
| `DECISIONS.md` | User-locked decisions — never contradict |
| `critique.md` | Adversarial audit + finalization changelog (context for why sections read as they do) |

Tasks cite these as `(design: <file> §X.Y)`. When a task and a design doc disagree, the
design doc wins unless the task carries an explicit **DEVIATION** note.

## 0.3 How to implement this plan (protocol for coding agents)

1. **Read before you write.** Per phase: `AGENTS.md` (constitution — React rules, undo
   invariant, no-migration, fmt/lint workflow), the phase's **Design sources**, and the
   cited census files. Do not start a task whose cited design section you have not read.
2. **One task at a time, in order.** Tasks are ordered so the repo compiles at every task
   boundary and the app runs at every phase boundary. Respect **Depends on**.
3. **Verify like the task says.** Every task ends with **Verify**; every phase ends with
   the mandatory workflow: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck`
   → `pnpm test`. All green before moving on.
4. **Undo enrollment is not optional.** Any mutation of `$part` document state enrolls in
   undo per `docs/editor-state.md` (discrete `pushUndo()` inside the mutator, or streaming
   with one push at interaction start). Each task states its pattern; add/extend the
   `editorStore.test.ts`-style test the task names.
5. **Numeric inputs**: every numeric field uses `useNumberDraft`-based components
   (`PreciseNumberInput`/`NumberField`/`Vec3Field`) with `inputMode="url"`. Never raw
   `type=number`, never ad-hoc `Number(v)` controlled fields.
6. **Layering**: `src/state/` and `src/ksa/` never import react (three only in the
   documented carve-outs). UI uses `src/ui/kit/` primitives (GridList over ListBox). No
   `useMemo`/`useCallback`/`React.memo` — React Compiler owns memoization.
7. **No migration code, ever.** Persisted-data changes follow the constitution:
   version + default-fill or purge-with-notice. v1 project data is deliberately NOT
   carried over (user decision — see Phase 9).
8. **Persist by default** via `@nanostores/persistent` for UI/view/settings state; view
   state is never undo-tracked; document state is never in localStorage UI keys.
9. **Docs stay true.** Where a phase changes behavior described in `docs/*.md`, the phase
   contains the doc task — do it in the same phase, not "later". Game-contract touches
   (rare in this plan; flagged per task) sync `scope/*.md` in the same change.
10. **On-demand rendering is inviolable**: new chrome must not force the render loop
    continuous; anything changing pixels invalidates via the established subscription
    helpers (`EditorScene.sub()` pattern).

## 0.4 Phase map

| Phase | Delivers | Depends on |
|---|---|---|
| **P0** | Kit groundwork: density tokens + `xs` tier, z-index ladder, `usePointerDrag`/`ResizeHandle`, `FloatingWindow`, `DialogViewStack`, `InlineConfirmStrip`, `CopyDownloadBar`, `ColorField` | — |
| **P1** | Docked shell skeleton: `layoutStore`, MenuBar/StatusBar/Sidebar frames, canvas as flex sibling (orbit center fixed), v1 guts rehosted, overlay machinery deleted, phone frame primitives | P0 |
| **P2** | Command registry + MenuSpec menubar (all 8 menus) + `dialogStore` + ⌘K palette; Toolbar/MobileTopBar replaced | P1 |
| **P3** | Status bar segments + `statusStore`/`notificationStore`/`modifierStore` + `toast()` routing + notification center; TransformHud/MeasurementInfo/SeatViewBar/LoadProgress absorbed | P2 |
| **P4** | `modeStore` (five modes) + `setMode` choreography + `$activeTool` + scoped hotkey registry v2 + Esc ladder + Help regen + camera commands (F/snaps/reset) | P3 |
| **P5A** | Build I: stable-id `SelectionRef[]` selection model, marquee, Outliner (replaces AssetsList + Layers popover), layers v2 | P4 |
| **P5B** | Build II: left focus editors (TransformInspector dissolved), Tool bar float + snap UI + W/L, alt-drag duplicate, ⌘D offset, clipboard v2, browsers, Add menu, measure/seat/exhaust tools, chain window, phone | P5A |
| **P6** | Data mode (navigator + scope forms + passthrough viewer + validation strip); Part/SubPart Data modals die | P5B |
| **P7** | Engine mode (navigator + module editors + in-mode issues + per-rocket perf + solid curve + wiring); EngineSections dissolved | P6 |
| **P8** | Surface mode + Asset Manager + import pipeline; custom-asset modals die | P7 |
| **P9** | Projects v2: id-keyed IndexedDB + `pa:` asset namespacing + Project Manager + `.flexo.tar.gz` + share links + Settings IA + build-mismatch demotion | P8 |
| **P10** | Export to KSA v2 + Mods Folder menu | P9 |
| **P11** | Animation mode (A data model / B timeline / C members+navigator / D pose tooling / E playback+diagnostics+IO+phone) | P10 |
| **P12** | Death sweep, docs refresh, scope sync audit, final RULE ZERO parity audit, Playwright smoke, release gate | P11 |

Phases must land in order. Within P5–P11 the *modes* are sequenced easiest→hardest per
`foundation.md §17`; the app remains fully usable between phases (old surfaces keep
working until their replacement task deletes them).

## 0.5 Verification gates

- **Task gate**: the task's own **Verify** block.
- **Phase gate**: fmt → lint → fmt:check → typecheck → test, plus the phase's manual
  checklist (each phase header lists it).
- **Release gate (P12)**: full suite + Playwright smoke (project-local install, dev base
  `/flexo/`) + the census-driven parity checklist executed item by item.


---

## flexo v2 — Implementation plan, Phases 0–1

Part of the flexo v2 UI refactor plan. Design corpus: `plans/flexo_v2/design/` (foundation.md is LAW).
Census of record: `analysis/flexo-v2-feature-census/`. Constitution: `AGENTS.md`.

Conventions used below:
- (design: `<file>` §X) cites `plans/flexo_v2/design/<file>`.
- (census: `<file>` §X) cites `analysis/flexo-v2-feature-census/<file>`.
- (code: `src/...:<line>` `<symbol>`) cites the current working tree @ `main` fcd5e07 — all
  citations verified against source.
- Mandatory end-of-task workflow for EVERY task: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check`
  → `pnpm typecheck` → `pnpm test` (AGENTS.md formatting/linting sections). "Verify" blocks
  list only the checks beyond this baseline.
- Neither phase touches the KSA game contract (XML/GLB/coords) — **no `scope/*.md` sync is
  required in Phase 0 or Phase 1** (editor-only chrome). Docs sync tasks are called out where
  a `docs/*.md` statement changes.

---

## Phase 0 — Kit groundwork: tokens, primitives, shared components

**Design sources**: foundation.md §1.2 (density/typography tokens), §1.3 (z ladder), §6
(floating surfaces), §13 (layoutStore shape), §14.4; design-system-services.md §6
(FloatingWindow), §7 (kit & density: §7.1 tokens, §7.2 xs tier, §7.3 zIndex, §7.4
usePointerDrag/ResizeHandle, §7.5 dialog patterns, §7.6 wash tokenization, §7.7 ColorField,
§7.9 misc debts), §11 (sequencing hooks).
**Census sources**: ui-kit-hotkeys.md §1.1–1.2 (kit inventory, density baseline), §1.7 (the
four hand-rolled drags), §4 pains 5/6/7/9/10/12; shell-layout.md §2 (z ladder in the wild).

**Entry state**: v1 shell exactly as censused — `src/app.tsx` mounts everything absolutely
over a full-bleed canvas; kit has sm/md sizes only; four independent pointer-drag
implementations; z literals scattered; no layout store.

**Exit state**: App looks and behaves **identically** to entry (the only user-visible change
is the hover/press wash normalization of task P0.05 — same hover language everywhere).
New, so-far-unused (or internally-adopted-only) machinery exists and is tested: density +
wash tokens, `xs` control tier, `zIndex.ts`, `panelChrome`, kit `Kbd`/`keyLabel`,
`usePointerDrag`, `ResizeHandle`, rewritten `VerticalSplit` internals, `layoutStore`,
`FloatingWindow`, `DialogViewStack`, `InlineConfirmStrip`, `CopyDownloadBar`, `ColorField`.
App remains fully runnable; all existing tests pass.

**Phase verification**:
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` all green.
2. `pnpm dev`, open the app: no visual/behavioral regression vs entry (spot-check: toolbar,
   right inspector resize/collapse, chain palette open (`⌘K`), measurement editor,
   Add ▸ SubPart browser split-drag, a menu, a dialog, toasts).
3. New test files pass: `layoutStore.test.ts`, `usePointerDrag.test.ts`,
   `floatClamp.test.ts`, `zIndexLiterals.test.ts`.
4. No `docs/*.md` describes kit internals or tokens → no doc sync. No game contract touched
   → no scope/ sync.

### Task ordering note

P0.01 → P0.02 → P0.03/P0.04/P0.05 (independent) → P0.06 → P0.07/P0.08 → P0.09 → P0.10 →
P0.11/P0.12/P0.13/P0.14 (independent). Every task boundary compiles and runs.

**One deliberate allocation choice** (flagged, not a design deviation): `layoutStore` is
created here in P0 (task P0.09) rather than in Phase 1, because `FloatingWindow` (P0.10,
assigned to this phase) persists through `layoutStore.float/floatOrder/floatHidden`
(design: design-system-services.md §6.4; foundation §13 S23). Phase 1 *wires the shell* to
the already-existing store.

---

#### P0.01 — Add density + wash tokens to the theme

**Goal**: Land the foundation §1.2 density scale and §7.1 wash tokens as CSS custom
properties so every later phase styles from tokens, not magic values.
**Files**:
- Modify `src/index.css`
**Depends on**: none.
**Spec**:
In the existing `@theme` block (code: `src/index.css:9-40` `@theme`), append:

```css
  /* Density scale (foundation §1.2 / system-services §7.1) */
  --bar-py: 0.125rem;          /* menubar + status bar vertical padding */
  --density-row-py: 0.25rem;   /* sidebar list rows, menu items */
  --density-panel-p: 0.5rem;   /* sidebar section padding */
  --density-gap: 0.375rem;     /* control gaps in dense panels */
  --rail-reopen-w: 20px;       /* collapsed-sidebar reopen tabs */

  /* Hover/press wash tokens (system-services §7.6) — replace raw bg-white/[0.0x] washes */
  --color-wash-hover: rgb(255 255 255 / 0.06);
  --color-wash-press: rgb(255 255 255 / 0.10);
  --color-wash-selected: rgb(255 255 255 / 0.08);
```

Notes for the implementer:
- The wash tokens use the Tailwind v4 `--color-*` namespace **deliberately** so the
  utilities `bg-wash-hover` / `bg-wash-press` / `bg-wash-selected` are generated. The design
  doc names them `--wash-*` (design: design-system-services.md §7.1); `--color-wash-*` is the
  mechanical Tailwind-v4 encoding of the same three tokens. Do not also add `--wash-*`.
- The density vars are not in a utility namespace; they are consumed via Tailwind v4
  var-shorthand at call sites, e.g. `py-(--bar-py)`, `p-(--density-panel-p)`,
  `gap-(--density-gap)`, `w-(--rail-reopen-w)`. No consumer changes in this task.
- Dark-only theme stays (constitution; census: ui-kit-hotkeys.md §1.2). Do NOT add a light
  theme or touch `color-scheme`.
**Verify**:
- `pnpm dev`: app renders unchanged (tokens are unused so far).
- In devtools, `getComputedStyle(document.documentElement).getPropertyValue('--bar-py')`
  returns `0.125rem`; a scratch element with class `bg-wash-hover` gets
  `rgb(255 255 255 / 0.06)`.

---

#### P0.02 — z-index token ladder + literal ban

**Goal**: One source of truth for stacking tiers; a test that keeps new z literals out of
feature code while the legacy files burn down.
**Files**:
- Create `src/ui/kit/zIndex.ts`
- Create `src/ui/kit/zIndexLiterals.test.ts`
- Modify `src/ui/kit/index.ts` (export `z`)
**Depends on**: none.
**Spec**:
`src/ui/kit/zIndex.ts` — exactly the ladder from (design: design-system-services.md §7.3;
foundation §1.3):

```ts
/**
 * The app's ONLY z-index scale (foundation §1.3). Feature code must never use a
 * literal z-index / Tailwind z-* class — take a tier from here.
 * popovers/menus/tooltips are react-aria portals: above everything, portal order.
 */
export const z = {
  canvasOverlay: 10, // in-viewport: drop zone, marquee div, FPS panel, CSS2D host
  dock: 20,          // sidebar/timeline internals: resize handles, sticky headers
  float: 30,         // FloatingWindows (above sidebars; intra-tier order from floatOrder)
  overlay: 50,       // kit Modal overlays
} as const;
```

`zIndexLiterals.test.ts` — a vitest that enforces the ban with a shrink-only allowlist
(the oxlint-custom-rule alternative in §7.3 is NOT available; the design explicitly blesses
a grep-based check):
- Using `node:fs`/`node:path`, walk `src/ui/**/*.{ts,tsx}` and `src/three/**/*.{ts,tsx}`.
- Regex offenders: `/\bz-(?:\[|\d{2,3}\b)/` inside each file's text (catches `z-10`, `z-30`,
  `z-40`, `z-50`, `z-[100]` etc.).
- Assert the set of offending file paths is a subset of `ALLOWLIST` — initialize the list
  from the grep result at implementation time (currently at minimum:
  `src/ui/kit/Modal.tsx` (z-50 overlay, code: `src/ui/kit/Modal.tsx:15` `overlay` tv),
  `src/ui/kit/Toast.tsx` (z-[100]), `src/ui/RightPanel.tsx`, `src/ui/FloatingInspector.tsx`,
  `src/ui/FloatingPreviewToolbar.tsx`, `src/ui/SeatViewBar.tsx` (code:
  `src/ui/SeatViewBar.tsx:41`), `src/ui/ImportReportCard.tsx` (code:
  `src/ui/ImportReportCard.tsx:33`), `src/ui/LoadProgress.tsx` (code:
  `src/ui/LoadProgress.tsx:87`), `src/ui/ViewportDropZone.tsx` (code:
  `src/ui/ViewportDropZone.tsx:53`), `src/ui/ManageTexturesPanel.tsx`,
  `src/ui/FloatingEditorPanel.tsx`, `src/ui/chain/ChainPalette.tsx`,
  `src/three/Viewport.ts`).
- Comment on the list: `// SHRINK ONLY — files leave this list as their surfaces die
  (foundation §6.3 death list); never add a file.`
- Also assert the reverse: every ALLOWLIST entry still offends (so dead entries get pruned).
The kit Modal's own `z-50` may either stay allowlisted or be converted to
`style={{ zIndex: z.overlay }}`; converting is preferred (one fewer legacy entry) and is
behavior-identical.
**Verify**:
- `pnpm test` — `zIndexLiterals.test.ts` passes.
- Temporarily add `z-40` to any non-allowlisted component → test fails; revert.

---

#### P0.03 — `xs` size tier on kit primitives (additive)

**Goal**: New `xs` control tier for bars + sidebars per design-system-services §7.2 — strictly
additive; every existing `sm`/`md` call site renders byte-identical.
**Files**:
- Modify `src/ui/kit/Button.tsx`
- Modify `src/ui/kit/ToggleButton.tsx`
- Modify `src/ui/kit/Field.tsx`
- Modify `src/ui/kit/SearchField.tsx`
- Modify `src/ui/kit/Select.tsx`
- Modify `src/ui/kit/ListBox.tsx`
**Depends on**: none.
**Spec** (specs verbatim from design: design-system-services.md §7.2; foundation §1.2):
1. **Button** (code: `src/ui/kit/Button.tsx:5-32` `button` tv): add to `size`:
   `xs: 'h-6 gap-1 px-1.5 text-xs rounded-sm'` and a compound variant
   `{ iconOnly: true, size: 'xs', class: 'w-6' }`. When an xs button carries icon+label,
   call sites may add `px-2` via className (the tv's `px-1.5` is the default). Do not touch
   sm/md/lg.
2. **ToggleButton** (code: `src/ui/kit/ToggleButton.tsx:11-25` `toggle` tv): add
   `xs: 'h-5 px-1.5 text-xs'` to `size`. **ToggleButtonGroup** (code:
   `src/ui/kit/ToggleButton.tsx:43-53` `ToggleButtonGroup`): add a `size?: 'md' | 'xs'` prop;
   `xs` renders the tray as `p-px gap-px` (default stays `p-0.5 gap-0.5`).
3. **inputStyles** (code: `src/ui/kit/Field.tsx:16-25` `inputStyles` tv): add
   `xs: 'h-6 px-1.5 text-xs'` to `size`. This automatically extends `TextField` (which
   forwards `size` to `inputStyles`) — verify `TextFieldKitProps` picks up the new union
   member via `VariantProps`.
4. **SearchField** (code: `src/ui/kit/SearchField.tsx:17-40` `SearchField`): sizes flow from
   `inputStyles`; adjust the leading icon to `size === 'xs' ? 12 : size === 'sm' ? 14 : 16`
   and use `pl-6 pr-6` padding for xs (current `pl-7 pr-7` stays for sm/md — make the
   padding conditional on size).
5. **Select** (code: `src/ui/kit/Select.tsx:18-28` `trigger` tv): add
   `xs: 'h-6 px-1.5 text-xs'` to the trigger's `size` variants.
6. **GridListItem** (code: `src/ui/kit/ListBox.tsx:50-77` `GridList`/`GridListItem`; row
   padding `py-1.5` comes from `itemClass` at `src/ui/kit/ListBox.tsx:16`): add a
   `density?: 'default' | 'dense'` prop to `GridListItem` where `dense` swaps `py-1.5` →
   `py-1`. `gridRowClass` (code: `src/ui/kit/styles.ts:40-51` `gridRowClass`) is already
   `py-1` — leave it unchanged.
7. `Checkbox`/`Switch`: unchanged (already compact — §7.2).
8. **Deferred, do NOT do here**: `MenuItem` density (`--density-row-py`) and the
   MenuSeparator spacing fix land with the MenuBar kit work in the menubar phase
   (design: design-system-services.md §7.9).
**Verify**:
- `pnpm typecheck` (VariantProps unions include `'xs'`).
- `pnpm dev`: zero visual change anywhere (no call site passes `xs` yet).
- Scratch-render one `<Button size="xs">` in any panel, confirm h-6/text-xs, then remove.

---

#### P0.04 — panelChrome export, kit Kbd/keyLabel, numberDraft comment fix

**Goal**: Close the small kit debts of design-system-services §7.9 that later phases build on.
**Files**:
- Modify `src/ui/kit/styles.ts` (add `panelChrome`)
- Create `src/ui/kit/Kbd.tsx` (moved from `src/ui/hotkeys/Kbd.tsx`)
- Create `src/ui/kit/keyDisplay.ts` (moved from `src/ui/hotkeys/keyDisplay.ts`)
- Delete `src/ui/hotkeys/Kbd.tsx`, `src/ui/hotkeys/keyDisplay.ts`
- Modify `src/ui/kit/index.ts` (export `panelChrome`, `Kbd`, `keyLabel`, `IS_APPLE`)
- Modify all importers of the moved files
- Modify `src/ui/numberDraft.ts` (stale comment)
- Modify `src/ui/FloatingEditorPanel.tsx`, `src/ui/chain/ChainPalette.tsx`,
  `src/ui/ManageTexturesPanel.tsx`, `src/ui/FloatingPreviewToolbar.tsx` (adopt `panelChrome`)
**Depends on**: none.
**Spec**:
1. `panelChrome` in `styles.ts` — the ONE floating-card chrome string, **without padding**
   (padding varies per site; census: ui-kit-hotkeys.md §1.2 lists p-3 / px-2 py-1.5 / p-1
   variants):
   ```ts
   /** The one floating-card chrome (foundation §1.2). Add padding at the call site. */
   export const panelChrome =
     'rounded-xl border border-border bg-panel/95 text-fg shadow-popover backdrop-blur-md';
   ```
   Adopt it at the four duplication sites, preserving each site's padding exactly:
   - (code: `src/ui/FloatingEditorPanel.tsx:5-6` `CHROME`) → `` `${panelChrome} p-3` ``
     (delete the local const).
   - (code: `src/ui/chain/ChainPalette.tsx:14-15` `CHROME`) → same.
   - (code: `src/ui/ManageTexturesPanel.tsx:148` inline string in the desktop card) → swap
     the `rounded-xl border … backdrop-blur-md` fragment for `panelChrome`, keep
     `p-3` and the layout/max-h classes.
   - (code: `src/ui/FloatingPreviewToolbar.tsx:42` phone bar and `:90` desktop bar) → swap
     the chrome fragment, keep `px-2 py-1.5` and layout classes.
   - Do NOT touch kit `Toolbar` (code: `src/ui/kit/Toolbar.tsx:11-21` `Toolbar`) — it keeps
     its own p-1 surface; the design's §6.1 chrome unification applies to floating cards.
2. Move `Kbd` and `keyDisplay` into the kit **unchanged** (design: design-system-services
   §4.3 "Kbd + keyLabel move into src/ui/kit — kit-tier now"). Verified importers to update
   (grep confirms these are ALL of them):
   - `src/ui/TransformHud.tsx:16` (`Kbd`), `src/ui/SeatViewBar.tsx:4` (`Kbd`),
   - `src/ui/hotkeys/HelpDialog.tsx:6` (`Kbd`) — also imports `keyLabel`; update both,
   - `src/ui/chain/ChainPalette.tsx:10` (`keyLabel`),
   - anything else `grep -rn "hotkeys/Kbd\|hotkeys/keyDisplay" src/` reveals at
     implementation time. Import via `../kit` (or `./kit` relative) — the barrel exports.
3. Fix the stale doc-comment (code: `src/ui/numberDraft.ts:70` — reads
   `` `<TextField inputMode="decimal" …>` ``): change `decimal` → `url`. Behavior untouched
   (the `url` mandate is constitutional; census: ui-kit-hotkeys.md §1.5, pain 9).
**Verify**:
- `pnpm typecheck` + `pnpm dev`: TransformHud tooltips, SeatViewBar Esc chip, Help dialog
  chips, chain palette footer all render identically.
- `grep -rn "hotkeys/keyDisplay\|hotkeys/Kbd" src/` returns nothing.

---

#### P0.05 — Wash tokenization of kit hover/press styles

**Goal**: Replace the raw `bg-white/[0.04..0.13]` hover/press washes with the three tokens —
one edit point, consistent hover language (design: design-system-services.md §7.6).
**Files**:
- Modify `src/ui/kit/Button.tsx`, `src/ui/kit/ToggleButton.tsx`, `src/ui/kit/ListBox.tsx`,
  `src/ui/kit/Menu.tsx`, `src/ui/kit/Tag.tsx`, `src/ui/kit/styles.ts`
**Depends on**: P0.01.
**Spec**:
Mechanical mapping table (apply exactly; verified current values in parentheses):

| Site | Current | New |
|---|---|---|
| Button secondary (code: `src/ui/kit/Button.tsx:12`) | `hover:bg-white/[0.09] pressed:bg-white/[0.13]` | `hover:bg-wash-hover pressed:bg-wash-press` |
| Button ghost (code: `src/ui/kit/Button.tsx:13`) | `hover:bg-white/[0.08] pressed:bg-white/[0.04]` | `hover:bg-wash-hover pressed:bg-wash-press` |
| ToggleButton unselected (code: `src/ui/kit/ToggleButton.tsx:20`) | `hover:bg-white/[0.06]` | `hover:bg-wash-hover` |
| ListBox itemClass (code: `src/ui/kit/ListBox.tsx:16`) | `hover:bg-white/[0.06] focus-visible:bg-white/[0.08] selected:bg-white/[0.06]` | `hover:bg-wash-hover focus-visible:bg-wash-selected selected:bg-wash-selected` |
| GridListItem selected (code: `src/ui/kit/ListBox.tsx:68`) | `bg-white/[0.08]` selected / `hover:bg-white/[0.06]` | `bg-wash-selected` / `hover:bg-wash-hover` |
| MenuItem default (code: `src/ui/kit/Menu.tsx:20`) | `hover:bg-white/[0.06] focus:bg-white/[0.08]` | `hover:bg-wash-hover focus:bg-wash-selected` |
| gridRowClass (code: `src/ui/kit/styles.ts:48`) | `bg-white/[0.08]` selected / `hover:bg-white/[0.06]` | `bg-wash-selected` / `hover:bg-wash-hover` |

- **Leave resting fills alone** (they are surfaces, not washes): Button secondary base
  `bg-white/[0.04]` (code: `src/ui/kit/Button.tsx:12`), Tag base `bg-white/[0.04]` (code:
  `src/ui/kit/Tag.tsx:32`), Chip `bg-white/[0.07]` (code: `src/ui/kit/Tag.tsx:60`).
- Known, accepted micro-deltas (the "one consistent hover language" the design asks for):
  secondary hover 0.09→0.06, secondary press 0.13→0.10, ghost press 0.04→0.10,
  focus fill 0.08 stays (wash-selected = 0.08).
- Promote the `noteBox`/`warningBox`/`dangerBox` severity semantics from prose comments to
  explicit doc-comments if not already clear (code: `src/ui/kit/styles.ts:53-68` — the
  comments are largely there; ensure each states when to use it — §7.6).
- Do NOT restyle any non-kit component; ad-hoc `bg-white/*` outside `src/ui/kit/` migrates
  when its surface is rebuilt in later phases.
**Verify**:
- `pnpm dev`: hover a secondary button, a menu item, a list row — washes present, slightly
  normalized, nothing broken. `grep -n "bg-white/\[0" src/ui/kit/` shows only the three
  resting fills listed above.

---

#### P0.06 — `usePointerDrag`: the one pointer-drag hook

**Goal**: THE shared drag primitive (design: design-system-services.md §7.4) that every later
drag consumer (sidebars, timeline, FloatingWindow, chain reorder, splits) builds on.
**Files**:
- Create `src/ui/kit/usePointerDrag.ts`
- Create `src/ui/kit/usePointerDrag.test.ts`
- Modify `src/ui/kit/index.ts` (export)
**Depends on**: none.
**Spec**:

```ts
// src/ui/kit/usePointerDrag.ts
export interface PointerDragOptions {
  /** Return false to refuse the drag (e.g. locked). Called on primary-button pointerdown. */
  onStart?(e: React.PointerEvent<Element>): void | false;
  /** rAF-batched deltas from the drag ORIGIN (not the previous frame). */
  onMove(dx: number, dy: number, e: PointerEvent): void;
  onEnd?(e: PointerEvent): void;
  /** Applied to document.documentElement.style.cursor for the drag's duration. */
  cursor?: string;
}
export function usePointerDrag(opts: PointerDragOptions): {
  /** Spread onto the drag handle element. The element should carry `touch-none`. */
  onPointerDown(e: React.PointerEvent<Element>): void;
  dragging: boolean;
};
```

Behavior contract (formalizes the common core of the four hand-rolled implementations —
census: ui-kit-hotkeys.md §1.7, pain 5; code patterns:
`src/ui/RightPanel.tsx:17-32` `ResizeHandle.onPointerDown`,
`src/ui/FloatingInspector.tsx:37-65` `onHeaderPointerDown`,
`src/ui/FloatingPreviewToolbar.tsx:48-76` `onGripPointerDown`,
`src/ui/VerticalSplit.tsx:30-47` `Split.onPointerDown`):
- Ignore non-primary buttons (`e.button !== 0` → return) and refuse when `onStart` returns
  `false`. Call `e.preventDefault()` on accepted drags (matches all four current impls).
- `setPointerCapture(e.pointerId)` on `e.currentTarget`; listen for
  `pointermove`/`pointerup`/`pointercancel` on `window` (capture flow identical to current).
- **rAF batching**: store the latest move event; schedule ONE `requestAnimationFrame` that
  calls `onMove(latest.clientX - startX, latest.clientY - startY, latest)`. Cancel the
  pending frame on end/unmount.
- Cursor: on start, if `cursor` is set, save + set `document.documentElement.style.cursor`;
  restore on end AND on unmount.
- Cleanup-safe: keep the active teardown in a ref and run it from a `useEffect(() => () =>
  teardownRef.current?.(), [])` so an unmount mid-drag removes listeners, cancels rAF and
  restores the cursor (the current impls leak listeners on unmount mid-drag — do better).
- `dragging` is React state (true between accepted pointerdown and end).
- Rules of React: no manual memoization (React Compiler — constitution); listeners are
  attached inside event handlers, never during render.
`usePointerDrag.test.ts` — follow the established hook-test pattern of
(code: `src/ui/numberDraft.test.ts:1-10` — `createRoot` + `act` from `react`/`react-dom/client`
under happy-dom). Stub `requestAnimationFrame` to run callbacks synchronously
(`vi.stubGlobal`). Cases:
1. pointerdown(button 0) + two pointermoves + pointerup → `onMove` called with cumulative
   deltas from origin, `onEnd` called once.
2. `onStart` returning false → no `onMove`/`onEnd` on subsequent move/up.
3. button 2 pointerdown ignored.
4. cursor set on start and restored after up (assert `document.documentElement.style.cursor`).
**Verify**: new test file passes; hook exported from the kit barrel; nothing consumes it yet.

---

#### P0.07 — `ResizeHandle` kit component

**Goal**: The one edge-strip resize primitive (design: foundation §1.1 "ONE kit primitive
ResizeHandle"; design-system-services §7.4), extracted from the RightPanel pattern with a
keyboard a11y upgrade.
**Files**:
- Create `src/ui/kit/ResizeHandle.tsx`
- Modify `src/ui/kit/index.ts` (export)
**Depends on**: P0.02, P0.06.
**Spec**:

```tsx
// src/ui/kit/ResizeHandle.tsx
export interface ResizeHandleProps {
  /** 'vertical' = a vertical strip that resizes a WIDTH; 'horizontal' resizes a HEIGHT. */
  orientation: 'vertical' | 'horizontal';
  value: number;               // current px
  min: number;
  max: number;
  /** true when dragging toward positive x/y should SHRINK value (right sidebar, timeline top edge). */
  invert?: boolean;
  onChange(px: number): void;  // clamped by the handle before calling
  hitSize?: number;            // px, default 8 (invisible hit strip)
  visualSize?: number;         // px, default 2 (visible line)
  ariaLabel: string;
}
```

- Built on `usePointerDrag`: capture `value` at `onStart`; `onMove` computes
  `start + (invert ? -d : d)` where `d = dx` (vertical) / `dy` (horizontal); clamp to
  `[min, max]`; call `onChange`. `cursor: 'col-resize' | 'row-resize'`.
- Visuals mirror the current RightPanel handle (code: `src/ui/RightPanel.tsx:34-41`
  `ResizeHandle` return): a `hitSize`-wide/tall strip (inline style px) with a centered
  `visualSize` line, `bg-transparent` → `group-hover:bg-border-strong` transition; the strip
  carries `touch-none` and `style={{ zIndex: z.dock }}` (import `z` from `./zIndex`).
- A11y (the upgrade over v1 — §7.4): `role="separator"`,
  `aria-orientation={orientation}`, `aria-valuenow/{min,max}` (rounded), `tabIndex={0}`,
  keyboard: ←/→ (vertical) or ↑/↓ (horizontal) adjust ±8px (respect `invert`), clamped,
  `preventDefault` on handled keys. Focus ring via the kit `focusRing` classes
  (code: `src/ui/kit/styles.ts:14-22` `focusRing`).
- Positioning (absolute on an edge) is the CONSUMER's job — the component renders the strip
  only; consumers wrap it in `absolute -left-1 inset-y-0` etc. (Phase 1 does this.)
**Verify**: `pnpm typecheck`; component exported; no consumer yet (Phase 1 adopts).
Optionally scratch-mount next to the old RightPanel handle to compare behavior, then remove.

---

#### P0.08 — Rewrite `VerticalSplit`/`HorizontalSplit` internals on `usePointerDrag`

**Goal**: Retire the first of the four bespoke drag implementations without changing any
observable behavior (design: design-system-services §7.4 — "rewritten internally on
usePointerDrag, keeping their local-state %-and-reset-on-remount behavior … that reset is
relied upon").
**Files**:
- Modify `src/ui/VerticalSplit.tsx`
**Depends on**: P0.06.
**Spec**:
- Replace `Split.onPointerDown` (code: `src/ui/VerticalSplit.tsx:30-47` `Split`) with
  `usePointerDrag`: capture the container `getBoundingClientRect()` in `onStart`; in
  `onMove`, recompute pct from the ORIGINAL pointerdown position + deltas
  (`((startClientY + dy) - rect.top) / rect.height * 100` for vertical), clamp
  `[minPct, maxPct]`, `setSplitPct`. Set `cursor` to the matching resize cursor.
- MUST preserve exactly: percentage in **local `useState`, resets to `initialSplit` on
  remount** (the Add SubPart / Add Part browsers rely on the snap-back — code:
  `src/ui/VerticalSplit.tsx:4-10` header comment; census: shell-layout.md §5 "Browsers reset
  on open"); the 15–85 default clamps; `role="separator"` + `aria-orientation` +
  wider invisible hit area (code: `src/ui/VerticalSplit.tsx:69-72`); the public props of
  `VerticalSplit`/`HorizontalSplit` unchanged.
- Add `touch-none` to the divider element (usePointerDrag contract).
**Verify**:
- `pnpm dev` → Add ▸ SubPart…: drag both dividers; close and reopen the browser → splits
  snapped back to defaults. Same for Add ▸ Built-in Part….

---

#### P0.09 — `layoutStore` (state + tests)

**Goal**: The single persisted layout store of foundation §13 (S23: one key, incl. float
positions + z-stack order), created ahead of its Phase-1 shell consumers because
FloatingWindow (P0.10) persists through it.
**Files**:
- Create `src/state/layoutStore.ts`
- Create `src/state/layoutStore.test.ts`
**Depends on**: none.
**Spec**:
`src/state/layoutStore.ts` — **zero react/three imports** (state layering — constitution;
design: foundation §13 "all src/state/, zero react/three imports"):

```ts
import { persistentJSON } from '@nanostores/persistent';

export interface SidebarLayout { width: number; collapsed: boolean }
export interface FloatPos { x: number; y: number }
export interface LayoutState {
  left: SidebarLayout;                    // clamp 220–480, default 300 (foundation §1.1)
  right: SidebarLayout;                   // clamp 260–640, default 340
  timeline: { height: number; collapsed: boolean }; // clamp 120–50vh, default 220
  float: Record<string, FloatPos | null>; // null = default anchor (§6.4)
  floatOrder: string[];                   // last = top (§6.3)
  floatHidden: string[];                  // Window ▸ Tool Bar toggle backing (§6.4)
}

export const LAYOUT_DEFAULTS: LayoutState = {
  left: { width: 300, collapsed: false },
  right: { width: 340, collapsed: false },
  timeline: { height: 220, collapsed: false },
  float: {},
  floatOrder: [],
  floatHidden: [],
};
export const SIDEBAR_CLAMPS = {
  left: { min: 220, max: 480 },
  right: { min: 260, max: 640 },
} as const;
export const TIMELINE_MIN_HEIGHT = 120;

export const $layout = persistentJSON<LayoutState>('flexo:layout', LAYOUT_DEFAULTS);
```

- **Defensive read** (foundation §13: "defensive `{...DEFAULTS, ...stored}` read"; same
  gotcha as code: `src/state/settingsStore.ts:117`): implement
  `sanitizeLayout(raw: unknown): LayoutState` — per-slice validation (each slice must be an
  object of the right shape with finite numbers/booleans; arrays must be string arrays);
  any invalid slice falls back to its DEFAULT slice; widths are clamped into their ranges.
  At module scope, once: `$layout.set(sanitizeLayout($layout.get()))`. **No migration of the
  v1 keys ever** — `flexo:inspectorVisible/inspectorWidth/inspectorFloatPos/
  animPreviewFloatPos` are simply abandoned (constitution; design-system-services §9).
- Mutators (all operate on `sanitizeLayout($layout.get())` and write the full object):
  - `setSidebarWidth(side: 'left' | 'right', px: number)` — clamp per `SIDEBAR_CLAMPS`.
  - `setSidebarCollapsed(side, collapsed: boolean)` / `toggleSidebar(side)`.
  - `setTimelineHeight(px: number)` — clamp `[TIMELINE_MIN_HEIGHT, maxTimelineHeight()]`
    where `maxTimelineHeight()` = `typeof window !== 'undefined' ?
    Math.round(window.innerHeight / 2) : 600` (50vh — foundation §1.1).
  - `toggleTimeline()`.
  - `setFloatPos(id: string, pos: FloatPos | null)`.
  - `raiseFloat(id: string)` — move (or append) `id` to the END of `floatOrder`.
  - `setFloatHidden(id: string, hidden: boolean)`.
  - `resetLayout()` — `$layout.set(LAYOUT_DEFAULTS)` (Window ▸ Reset Window Layout binds to
    this in the menubar phase; `nukeAndReload`'s `localStorage.clear()` already wipes the
    key — no change needed there).
- **Undo enrollment: NONE.** Layout is view state; mutations never push undo (foundation
  §13 "mode/layout/status … never create undo steps"). State this in the module doc-comment.
`layoutStore.test.ts` (plain store test, same style as code:
`src/state/settingsStore.test.ts`):
1. defaults: fresh store yields `LAYOUT_DEFAULTS`.
2. `setSidebarWidth('left', 100)` → 220; `('left', 9999)` → 480; `('right', 100)` → 260.
3. `toggleSidebar('right')` flips `collapsed` only, width untouched.
4. `sanitizeLayout` drops garbage: string input → defaults; `{left: {width: 'x'}}` → default
   left slice, other valid slices preserved.
5. `raiseFloat`: append when absent; move-to-end when present; others keep order.
6. `resetLayout` restores defaults after arbitrary mutation.
7. persistence: after a mutator, `localStorage.getItem('flexo:layout')` parses to the state
   (happy-dom provides localStorage).
**Verify**: `pnpm test` — layoutStore.test.ts green. Nothing consumes the store yet.

---

#### P0.10 — `FloatingWindow` kit primitive (+ pure clamp module)

**Goal**: The window-manager primitive of design-system-services §6 — chrome, strip-drag,
band clamping, z-stacking, persistence, keyboard moves, phone no-op. Primitive only; the
`toolbar`/`chain` tenants arrive in the FloatingWindow phase (foundation §17 step 5).
**Files**:
- Create `src/ui/kit/floatClamp.ts`
- Create `src/ui/kit/floatClamp.test.ts`
- Create `src/ui/kit/FloatingWindow.tsx`
- Modify `src/ui/kit/index.ts` (export `FloatingWindow`)
**Depends on**: P0.01, P0.02, P0.06, P0.07, P0.09.
**Spec**:
1. **`floatClamp.ts`** — pure geometry (unit-testable, no DOM):
   ```ts
   export interface Rect { left: number; top: number; width: number; height: number }
   /** Clamp rule of system-services §6.2: ≥120px of strip horizontally on screen
    *  (x ∈ [120 - w, vw - 120]) and the 28px strip never leaves the band vertically
    *  (y ∈ [bandTop, bandBottom - 28]). Positions are band-absolute px. */
   export function clampFloatPos(
     pos: { x: number; y: number }, size: { w: number; h: number },
     band: Rect, viewportWidth: number,
   ): { x: number; y: number };
   /** Resolve a default anchor against the VIEWPORT CELL rect (§6.2), band-absolute result. */
   export interface FloatAnchor { h: 'left' | 'center' | 'right'; v: 'top' | 'bottom'; dx: number; dy: number }
   export function resolveAnchor(anchor: FloatAnchor, size: {w:number;h:number}, cell: Rect, band: Rect): { x: number; y: number };
   ```
   `floatClamp.test.ts`: clamp inside band unchanged; x below `120 - w` clamps up; x above
   `vw - 120` clamps down; y above bandTop clamps; y below `bandBottom - 28` clamps;
   anchors: top-center/top-left resolve to expected px for a known cell/band.
2. **`FloatingWindow.tsx`** — API verbatim from (design: design-system-services.md §6.1):
   ```tsx
   <FloatingWindow
     id="toolbar"                 // key into layoutStore.float / floatOrder / floatHidden
     title="Tools"
     titleHidden?                 // strip shows grip + controls only (tool bar case)
     defaultAnchor={{ h: 'center', v: 'top', dx: 0, dy: 8 }}
     minSize={{ w: 120, h: 28 }}
     resizable={{ minW: 300, maxW: 420 }}  // optional right-edge ResizeHandle
     collapsible                            // optional strip chevron rolls body up
     onClose={...}                          // optional ✕ in the strip
   >{body}</FloatingWindow>
   ```
   - **Phone**: `if (useIsPhone()) return null;` — tenants mount their own phone variants
     (§6.5; foundation §12). Call the hook unconditionally at the top (Rules of Hooks).
   - **Chrome**: outer div = `panelChrome` + a **20px title strip** (grip dots `⠿` via
     lucide `GripHorizontal` like code: `src/ui/FloatingInspector.tsx:87`, title
     (`sr-only` when `titleHidden`), optional collapse chevron, optional ✕). Body below;
     `collapsible` collapsed state renders the strip only.
   - **Drag = strip only** (the body never drags — §6.1): `usePointerDrag` on the strip;
     `onStart` captures current position; `onMove` writes
     `setFloatPos(id, clampFloatPos(...))` — live during drag; the single `flexo:layout`
     write-through is cheap, rAF batching comes from the hook (§6.4). No extra throttle.
   - **Geometry sources**: band = `document.querySelector('[data-workspace-band]')`
     bounding rect; viewport cell = `[data-viewport-cell]` rect (Phase 1 stamps both; until
     then the primitive is unmounted). Fallback when missing: band = full window. Positions
     are stored **band-absolute px**; render with `position:absolute; left/top` inside the
     band (the component must be mounted INSIDE the `[data-workspace-band]` element — the
     tenant phase does this; document it in the component header).
   - **Position resolution**: `layoutStore.$layout.float[id]` — `{x,y}` → clamp against the
     current band and render; `null`/absent → `resolveAnchor(defaultAnchor, …)` (§6.4).
   - **Re-clamp on band resize**: a `ResizeObserver` on the band element re-runs the clamp
     of a stored position (bump a local state nonce). Timeline mount/unmount does NOT
     re-clamp — band = middle row + timeline rows and overlap is allowed (§6.2); observing
     the band element only (not the timeline) gives this for free.
   - **z & stacking** (§6.3): container `style={{ zIndex: z.float }}`; intra-tier order =
     index in `floatOrder` (append `zIndex: z.float + max(0, floatOrder.indexOf(id))` —
     the tier gap to `z.overlay` (50) allows 19 windows; assert `floatOrder.length < 19` in
     dev). Any `onPointerDownCapture` on the window → `raiseFloat(id)`.
   - **Hidden**: `floatHidden.includes(id)` → render null.
   - **Keyboard** (§6.1): strip `tabIndex={0}`, stamps `data-surface={id}` (hotkey scoping
     consumes this in the hotkeys phase); ArrowKeys move 8px, ⇧+Arrow 32px, clamped,
     `preventDefault` on handled keys.
   - **Resizable**: when `resizable` is set, render a right-edge `ResizeHandle`
     (orientation vertical, min/max from the prop) driving a width kept in
     component state — width is NOT persisted (only `{x,y}` is — §6.4/foundation §13).
   - **Undo enrollment: NONE** (layout is view state; foundation §13).
**Verify**:
- `floatClamp.test.ts` green; `pnpm typecheck`.
- Scratch-mount `<FloatingWindow id="scratch" title="Scratch" defaultAnchor={{h:'left',v:'top',dx:8,dy:8}} minSize={{w:120,h:28}}>hi</FloatingWindow>`
  temporarily inside the app root wrapped in a `<div data-workspace-band data-viewport-cell
  className="absolute inset-0">`: drag it, drag past every edge (clamps), arrow-key it,
  reload (position persists via `flexo:layout`), then REMOVE the scratch mount before
  finishing the task.

---

#### P0.11 — `DialogViewStack` kit primitive

**Goal**: The modal-in-modal killer (design: foundation §10.1; design-system-services §7.5):
a dialog-owned pushable view stack with a back chevron and Esc-pops-view-first semantics.
Primitive only — adopters (Asset Manager, Settings, Import Review) arrive in their phases.
**Files**:
- Create `src/ui/kit/DialogViewStack.tsx`
- Modify `src/ui/kit/Modal.tsx` (DialogHeader gains optional back chevron)
- Modify `src/ui/kit/index.ts` (exports)
**Depends on**: none.
**Spec**:
1. **DialogHeader** (code: `src/ui/kit/Modal.tsx:73-88` `DialogHeader`): add an optional
   `onBack?: () => void` prop; when present, render a `‹` back icon-button (lucide
   `ChevronLeft`, same styling recipe as the existing ✕ button) BEFORE the Heading, and the
   title renders as `‹ Back · Title` semantics (aria-label "Back"). Existing call sites
   (no `onBack`) render unchanged.
2. **DialogViewStack**:
   ```tsx
   export interface DialogView { id: string; title: React.ReactNode; element: React.ReactNode }
   export function useDialogViewStack(root: DialogView): {
     views: DialogView[];            // depth ≥ 1; last = top
     top: DialogView;
     push(view: DialogView): void;
     pop(): void;                    // no-op at depth 1
     reset(): void;                  // back to [root]
   };
   export function DialogViewStack(props: {
     stack: ReturnType<typeof useDialogViewStack>;
     onClose(): void;                // dialog dismiss
   }): JSX.Element;
   ```
   - Renders `DialogHeader` with `title={stack.top.title}`, `onClose`, and
     `onBack={depth > 1 ? stack.pop : undefined}`, then the top view's element. Only the
     top view is mounted (push/pop is navigation, not tabs).
   - **Esc semantics** (Esc-ladder rung 2 — foundation §11.4; design-system-services §4.6):
     an `onKeyDown` (capture) on the stack's wrapper: if `e.key === 'Escape'` and depth > 1
     → `preventDefault(); stopPropagation(); stack.pop()`. At depth 1 do nothing — react-aria
     dismisses the dialog as today. The numeric-field dirty-revert still wins below this:
     `useNumberDraft` stops propagation only when dirty (code: `src/ui/numberDraft.ts:139-146`
     escape handling), so a dirty field's Esc never reaches the stack. Do not add any global
     listener.
   - Phone: nothing special here — views push as sheet pages automatically because the same
     component renders inside a `sheet`/`cover` Modal (foundation §10.1/S22).
   - No undo interaction (pure UI state, local to the dialog).
**Verify**: `pnpm typecheck`. Scratch test in a throwaway dialog: push a second view →
header shows back chevron; Esc pops to view 1; Esc again dismisses; remove scratch.

---

#### P0.12 — `InlineConfirmStrip` kit component

**Goal**: Row-level destructive confirm rendered in place (design: design-system-services
§7.5) — the second leg of killing modal-in-modal. Primitive only.
**Files**:
- Create `src/ui/kit/InlineConfirmStrip.tsx`
- Modify `src/ui/kit/index.ts` (export)
**Depends on**: P0.03.
**Spec**:

```tsx
export function InlineConfirmStrip(props: {
  label: React.ReactNode;            // e.g. 'Delete "Hull"?' — irreversibility wording is the caller's job
  confirmLabel: string;              // "Delete"
  confirmVariant?: 'danger' | 'primary'; // default 'danger'
  onConfirm(): void;
  onCancel(): void;
  /** Auto-cancel after this long unanswered (design §7.5: 8s). */
  timeoutMs?: number;                // default 8000
  size?: 'xs' | 'sm';                // default 'sm'; sidebars pass 'xs'
}): JSX.Element;
```

- Renders one row: label (truncating, `text-xs`) + `[confirmLabel]` Button
  (variant per prop) + `[Cancel]` ghost Button, both at `size`.
- `useEffect` timer calls `onCancel` after `timeoutMs`; cleared on unmount and on answer.
- The CALLER swaps its row content for the strip (the strip does not overlay/portal).
- Focus: autofocus the Cancel button (safe default for destructive confirms).
- Confirm-policy context for future adopters (foundation §14.3): used for project delete,
  asset delete (bytes-unrecoverable wording preserved by callers), layer delete choice —
  all in later phases.
**Verify**: `pnpm typecheck`; scratch-render in a list row, confirm the 8s auto-cancel,
remove scratch.

---

#### P0.13 — `CopyDownloadBar` kit component

**Goal**: One copy-with-✓ + download pair replacing the three hand-rolled clipboard/download
clusters when their dialogs are rebuilt (design: foundation §10.1; design-system-services
§7.5). Primitive only.
**Files**:
- Create `src/ui/kit/CopyDownloadBar.tsx`
- Modify `src/ui/kit/index.ts` (export)
**Depends on**: P0.03.
**Spec**:

```tsx
export function CopyDownloadBar(props: {
  /** Lazily produce the payload (export XML tabs build lazily — foundation §10.6). */
  getText(): string | Promise<string>;
  filename: string;                  // download name, e.g. "part.xml"
  mime?: string;                     // default 'text/plain'
  copyLabel?: string;                // default 'Copy'
  downloadLabel?: string;            // default 'Download'
  size?: 'xs' | 'sm';                // default 'sm'
}): JSX.Element;
```

- Copy: `await navigator.clipboard.writeText(await getText())`; on success swap the button
  label/icon to a ✓ (lucide `Check`) for 1500ms (local state + cleared timeout). On failure
  call `toast('Copy failed', { variant: 'danger' })` (kit-internal import of `toast` from
  `./Toast` is fine — same layer).
- Download: build `new Blob([text], { type: mime })`, object URL, temp `<a download>` click,
  `URL.revokeObjectURL` after.
- Two secondary Buttons in a `flex gap-(--density-gap)` row.
- Adopters (later phases; listed so the implementer wires nothing now): Export XML tabs,
  Share Link dialog, project archive export (design-system-services §7.5).
**Verify**: `pnpm typecheck`; scratch-mount, copy + download a string, remove scratch.

---

#### P0.14 — `ColorField` kit component (react-aria ColorPicker)

**Goal**: Close the native-`<input type=color>` gap with an alpha-capable kit picker
(design: design-system-services §7.7). Primitive only — adopters (Settings highlight rows,
light color, measurement/container colors, layer opacity swatch, glow/material colors)
migrate in their own phases; `ColorAlphaField` is NOT rewritten here (P0 is additive).
**Files**:
- Create `src/ui/kit/ColorField.tsx`
- Modify `src/ui/kit/index.ts` (export)
**Depends on**: P0.03.
**Spec**:

```tsx
export function ColorField(props: {
  label?: React.ReactNode;
  value: string;                       // hex, '#rrggbb' or '#rrggbbaa' when alpha
  alpha?: boolean;                     // adds the alpha ColorSlider
  onChange(hex: string): void;         // live-commit while dragging
  /** Undo contract: fired ONCE when the popover opens (one undo step per picking
   *  session — mirrors SliderRow's pointer-down convention). */
  onInteractionStart?(): void;
  size?: 'xs' | 'sm';                  // swatch 16px at xs
  'aria-label'?: string;
}): JSX.Element;
```

- Build on `react-aria-components` `ColorPicker`, `ColorSwatch`, `ColorArea`, `ColorSlider`,
  `ColorField` (hex field), `parseColor` — imported INSIDE this kit file only (the kit is
  the sanctioned react-aria wrapper layer — census: ui-kit-hotkeys.md §1.1; constitution).
  Composition: swatch Button trigger → kit `Popover` containing ColorArea
  (saturation/brightness) + hue ColorSlider + optional alpha ColorSlider + hex ColorField.
- **Numeric-field rules do NOT apply to the hex field** — hex is not numeric; use react-aria
  ColorField semantics (design §7.7 states this explicitly). No `useNumberDraft` here.
- Undo: call `onInteractionStart` in the popover's onOpenChange(true) exactly once per open.
  Every drag/keystroke live-commits via `onChange`. (Callers pass their editorStore
  streaming-start hook — same contract as code: `src/ui/SliderRow.tsx` pointer-down.)
- Styling: swatch is a bordered square (`size-4` at xs, `size-5` at sm) showing the color
  over a checkerboard when `alpha`; popover uses `panelChrome`-consistent kit Popover.
**Verify**: `pnpm typecheck`; scratch-mount with alpha, drag sliders (live onChange fires,
onInteractionStart once per open), type a hex, remove scratch.

---

## Phase 1 — Docked shell skeleton

**Design sources**: foundation.md §1 (layout skeleton, region rules, canvas-overlays), §1.1
(sidebar clamps/collapse), §12 (phone primitives), §13 (layoutStore wiring), §17 step 1
(build order: "Docked skeleton first, guts untouched"); design-system-services.md §9
(store/boot summary); DECISIONS.md #2 (docked layout), #4 (compile-green rollout).
**Census sources**: shell-layout.md §0–§2 (current shell + surface map), §4 pains 2/4/10,
§5 invariants (viewport focus, on-demand loop, phone end-to-end); ui-kit-hotkeys.md §1.7.

**Entry state**: Phase 0 complete — primitives + `layoutStore` exist unused; the shell is
still the v1 absolute-overlay stack (code: `src/app.tsx:56-147` `App`).

**Exit state**: App runs with the REAL docked frame: slim placeholder menubar row on top, a
middle workspace band with docked left sidebar (placeholder body) / canvas cell / docked
right sidebar (hosting the v1 `InspectorContent` unchanged), placeholder status bar on the
bottom. The canvas is a flex cell → **orbit center == visible center by construction**;
sidebar resize/collapse persists via `flexo:layout` and resizes the canvas live. The
`pointer-events-none` RightPanel shell, its bespoke drag, and the toolbar's `right-[19rem]`
reservation are DELETED. All v1 floating chrome (old toolbar, selection toolbars,
FloatingInspector, chain palette, seat bar, HUDs, aid editors) still works, re-parented into
the canvas cell. Phone still fully functional on the v1 surfaces, now in a flex frame; the
`Sheet` and `ModeTabBar` phone primitives exist for later phases.

**What Phase 1 deliberately does NOT touch** (spec'd interim wiring — later phases own it):
- **Old `EditorToolbar` stays mounted**, floating top-center INSIDE the canvas cell — the
  new MenuBar row above it is a placeholder shell. The real MenuSpec menubar replaces the
  toolbar in the commands/menubar phase (foundation §17 step 2).
- **StatusBar is an empty shell** — segments land with statusStore (foundation §17 step 3).
  The toast region, TransformHud, MeasurementInfo, SeatViewBar, LoadProgress all keep
  working as floating chrome until then.
- `$inspectorMode`, `FloatingInspector`, `FloatingPreviewToolbar`, `ChainPalette`,
  `MeasurementEditor`/`ContainerEditor`, `ManageTexturesPanel` — untouched (modeStore
  phase / FloatingWindow phase / mode rehost phases).
- **No `⌥[` / `⌥]` sidebar hotkeys yet** — they land with the hotkey-registry phase
  (design: FINAL_DESIGN_INDEX.md hotkey table, "global ⌥[/⌥] toggle left/right sidebar");
  P1 collapse is chevron/reopen-tab only. No Window menu yet (menubar phase); layout reset
  is reachable only via `resetLayout()` in code until then.
- **Timeline dock**: not built (Animation phase). `layoutStore.timeline` sits unused.
- Phone keeps `MobileTopBar` + `MobileInspector` FAB verbatim; `ModeTabBar`/`Sheet` are
  built but NOT mounted (modeStore + phone-shell phases mount them).

**Phase verification**:
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test`.
2. Desktop manual sweep: orbit an object — the orbit center sits at the visible center of
   the canvas cell with the right sidebar open (the v1 off-center bug is gone). Resize the
   right sidebar edge (canvas re-renders live, no letterboxing — the ResizeObserver path,
   code: `src/three/Viewport.ts:129`), collapse/reopen both sidebars, reload → widths +
   collapsed states persist. Click the viewport then press arrow keys → nudge works
   (focus-steal invariant, code: `src/three/ViewportCanvas.tsx:31-38`).
3. Every v1 surface still reachable: toolbar menus, Add ▸ SubPart browser, selection +
   multi-select toolbars, FloatingInspector drag, chain palette (`⌘K`), seat view + Esc,
   measurement/container editors, ManageTextures, import drop onto the canvas ONLY (drop on
   a sidebar does nothing), toasts, FPS counter, help (`?`).
4. Phone (devtools < 640px): top bar in-flow, FAB + sheet inspector, seat bar, scrubber —
   all functional; iOS zoom-lock meta untouched (`index.html`).
5. `zIndexLiterals.test.ts` allowlist updated (RightPanel.tsx entry removed).

### Task ordering note

P1.01 → P1.02 (the big cut-over; includes the RightPanel deletion so the tree never has two
right sidebars) → P1.03 → P1.04 → P1.05/P1.06 (independent) → P1.07. Each boundary compiles;
the app is briefly "new frame + all legacy chrome" from P1.02 onward, which is exactly the
§17 step-1 posture.

---

#### P1.01 — Shell frame components: MenuBar shell, StatusBar shell, Sidebar frame

**Goal**: Build the three docked-frame components (placeholder contents where the design's
real tenants arrive later) against `layoutStore` and the P0 primitives.
**Files**:
- Create `src/ui/shell/MenuBar.tsx`
- Create `src/ui/status/StatusBar.tsx`
- Create `src/ui/shell/Sidebar.tsx`
**Depends on**: P0.01, P0.02, P0.03, P0.07, P0.09.
**Spec**:
1. **`MenuBar`** — the fixed slim top row (foundation §1: content height = `text-xs` line +
   2×`--bar-py` + 1px border ≈ 22px):
   ```tsx
   /** Placeholder shell — the real MenuSpec menubar (foundation §3) lands in the
    *  commands/menubar phase and replaces EditorToolbar. Until then the old toolbar
    *  keeps floating inside the viewport cell. */
   export function MenuBar() {
     return (
       <div className="flex flex-none items-center border-b border-border bg-panel px-2 py-(--bar-py) text-xs text-fg-muted select-none">
         <span className="font-semibold text-fg">flexo</span>
       </div>
     );
   }
   ```
2. **`StatusBar`** — identical recipe, bottom (foundation §5 real segments land in the
   statusStore phase; create at the FINAL path `src/ui/status/StatusBar.tsx` so phase 3
   fills it in place — design: design-system-services §1.0 names this path):
   ```tsx
   /** Placeholder shell — segments (mode chip, layer chip, tool segment, message
    *  channel, …) land with statusStore (foundation §5, §17 step 3). */
   export function StatusBar() {
     return <div className="flex flex-none items-center border-t border-border bg-panel px-2 py-(--bar-py) text-xs text-fg-muted select-none" />;
   }
   ```
3. **`Sidebar`** — the docked frame both sides share (foundation §1.1 region rules):
   ```tsx
   export function Sidebar({ side, children }: { side: 'left' | 'right'; children: React.ReactNode })
   ```
   - Reads `useStore($layout)` (from `src/state/layoutStore.ts`), slice `[side]`.
   - **Collapsed** → render a `flex-none` reopen tab: width `w-(--rail-reopen-w)` (20px),
     full height, containing a centered `xs` iconOnly ghost Button (lucide
     `PanelLeftOpen`/`PanelRightOpen`, aria-label `Show left sidebar` / `Show right
     sidebar`) that calls `setSidebarCollapsed(side, false)`. The tab hugs the viewport's
     edge automatically (it IS the flex sibling — foundation §1.1 "width 0 + a 20px reopen
     tab hugging the viewport's left edge").
   - **Expanded** → `flex-none relative flex flex-col border-border bg-panel` with
     `border-r` (left) / `border-l` (right) and inline `style={{ width }}`. Contents:
     - a slim header row (`flex items-center justify-end px-1 py-(--bar-py)`) holding an
       `xs` iconOnly ghost collapse chevron (lucide `PanelLeftClose`/`PanelRightClose`,
       aria-label `Hide … sidebar`) → `setSidebarCollapsed(side, true)`;
     - `<div className="min-h-0 flex-1 overflow-y-auto">{children}</div>`;
     - the **inner-edge resize strip**: absolutely positioned wrapper
       (`absolute inset-y-0 -right-1` for the LEFT sidebar, `-left-1` for the RIGHT — the
       inner edge faces the viewport) containing the kit `ResizeHandle`
       (`orientation="vertical"`, `hitSize={8}`, `visualSize={2}`,
       `min/max` from `SIDEBAR_CLAMPS[side]`, `invert={side === 'right'}` — dragging the
       right sidebar's handle left must WIDEN it, matching the old behavior at code:
       `src/ui/RightPanel.tsx:24` `startWidth - (ev.clientX - startX)`,
       `value={width}`, `onChange={(px) => setSidebarWidth(side, px)}`,
       `ariaLabel={\`Resize ${side} sidebar\`}`).
   - Collapse/resize is instant — **no transition classes** (foundation §1.1 "no animation
     > 120ms"; omit transitions entirely).
   - Widths are per SIDE, not per mode (foundation §1.1) — nothing mode-aware here, ever.
   - **Undo enrollment: NONE** (layout view state — foundation §13).
   - NOTE in the component doc-comment: `⌥[`/`⌥]` toggles + Window-menu items register in
     the hotkey/menubar phases against `setSidebarCollapsed` — no key handling here.
**Verify**: `pnpm typecheck`; components unused until P1.02 (tree-shaken, no runtime
change). oxlint clean (no unused-var complaints — they're exported).

---

#### P1.02 — Desktop docked frame cut-over in app.tsx (+ RightPanel deletion)

**Goal**: Replace the absolute-overlay shell with the real flex frame (foundation §1 DOM:
`column( MenuBar, row( LeftSidebar, ViewportHost, RightSidebar ), StatusBar )`), rehost the
v1 right-panel guts, delete the pointer-events-none machinery and the `right-[19rem]`
reservation, and re-parent all legacy floating chrome into the canvas cell.
**Files**:
- Modify `src/app.tsx`
- Delete `src/ui/RightPanel.tsx`
- Modify `src/ui/kit/Toast.tsx` (region offset — one class)
- Modify `src/ui/kit/zIndexLiterals.test.ts` (allowlist shrink)
**Depends on**: P1.01.
**Spec**:
Rewrite the desktop branch of `App` (code: `src/app.tsx:31-148` `App`) to:

```tsx
return (
  <div className="fixed inset-0 flex flex-col bg-canvas text-fg">
    <GlobalHotkeys />
    <HelpDialog />
    <AboutDialog />

    {!isPhone && <MenuBar />}
    {isPhone && <MobileTopBar />}   {/* in-flow now — see P1.04 for the phone details */}

    {/* The workspace band (foundation §6.2): everything between the two bars.
        FloatingWindow tenants (later phase) mount inside this element. */}
    <div data-workspace-band className="relative flex min-h-0 flex-1">
      {!isPhone && (
        <Sidebar side="left">
          {/* Interim placeholder — the focus editor (foundation §7) arrives with the
              Build-mode rehost phase. */}
          <div className="p-(--density-panel-p) text-xs text-fg-subtle">
            Nothing selected
          </div>
        </Sidebar>
      )}

      {/* The canvas cell. Canvas fills it exactly ⇒ orbit center == visible center.
          Min size per foundation §1.1. */}
      <div data-viewport-cell className="relative min-w-[240px] min-h-[180px] flex-1">
        <ViewportDropZone>
          <ViewportCanvas />
        </ViewportDropZone>

        {/* ── Legacy floating chrome, re-parented: absolute anchors now resolve
              against the CELL, so everything clamps to the workspace by construction.
              Each surface keeps self-gating exactly as before. ── */}
        {!isPhone && (
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <EditorToolbar />
          </div>
        )}
        <div className={`absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 ${isPhone ? 'top-2' : 'top-16'}`}>
          {isPhone && <FloatingPreviewToolbar />}
          <SelectionToolbar />
          <MultiSelectToolbar />
        </div>
        {isPhone ? <MobileInspector /> : <FloatingInspector />}
        {!isPhone && <FloatingPreviewToolbar />}
        <SeatViewBar />
        <MeasurementEditor />
        <ContainerEditor />
        <ManageTexturesPanel />
        <ImportReportCard />
        <MeasurementInfo />
        <WorkspaceLoadProgress />
        <TransformHud />
        <ChainPalette />
      </div>

      {!isPhone && (
        <Sidebar side="right">
          <InspectorContent />
        </Sidebar>
      )}
    </div>

    {!isPhone && <StatusBar />}

    {/* Overlay dialogs — portal to body; mount position is irrelevant. */}
    <GlowPaintDialog />
    <ImportModelDialog />
  </div>
);
```

Precise instructions & rationale:
1. **DELETIONS** (design: foundation §1 "Deleted:", DECISIONS #2; census: shell-layout.md
   pain 4):
   - The toolbar wrapper `absolute left-3 top-3 right-[19rem] lg:right-auto lg:left-1/2
     lg:-translate-x-1/2` (code: `src/app.tsx:78`) — replaced by the simple centered
     wrapper above. The reservation existed only because the right panel floated over the
     toolbar; the cell now excludes the sidebar, so plain centering is correct at every
     width (the toolbar's own `flex-wrap`, code: `src/ui/Toolbar.tsx:24`, still handles
     narrow cells). Give the wrapper `z-10` so the toolbar's popovers' trigger row sits
     above the canvas overlays tier — actually use `style={{ zIndex: z.canvasOverlay }}`
     from the kit ladder; do NOT introduce a new Tailwind z literal (P0.02 test).
   - `src/ui/RightPanel.tsx` — DELETE the file (its bespoke `ResizeHandle`, the
     `pointer-events-none` shell + per-child opt-ins, code: `src/ui/RightPanel.tsx:16-43`
     and `:72-90`, all die). `InspectorContent` (code: `src/ui/InspectorContent.tsx:23`
     `InspectorContent`) moves into `<Sidebar side="right">` UNCHANGED — this is a
     mount-point change only (foundation §17 step 1 "AssetsList into the Build sidebar is a
     mount-point change"). The collapse toggle is now the Sidebar chevron; the old
     PanelRight toggle button disappears with RightPanel.
2. **ViewportCanvas / three layer: NO changes.** `ViewportCanvas`'s host is
   `absolute inset-0` (code: `src/three/ViewportCanvas.tsx:31-38`) inside the (now
   `relative`) cell; `ViewportDropZone`'s root is `absolute inset-0` (code:
   `src/ui/ViewportDropZone.tsx:27`) — both fill the cell as-is. `Viewport`'s existing
   ResizeObserver (code: `src/three/Viewport.ts:129`) handles every sidebar resize —
   **no three-layer change beyond re-parenting** (foundation §1 "no three-layer change").
   The `tabIndex={-1}` + focus-on-pointerdown stays untouched (load-bearing — census:
   shell-layout.md §1.18).
3. **Re-parenting semantics** (the "interim wiring", exact):
   - Edge-anchored chrome (SeatViewBar `inset-x-0 bottom-14`, TransformHud `inset-x-0
     bottom-2`, MeasurementInfo `bottom-3 left-3`, WorkspaceLoadProgress `bottom-4
     left-1/2`, MeasurementEditor/ContainerEditor/ManageTexturesPanel `left-3 top-1/2`,
     ChainPalette `left-3 top-16`, ImportReportCard `bottom-3 right-3`) — components are
     NOT edited; their `absolute` anchors simply re-resolve against the cell, which keeps
     them clear of the sidebars and the status bar automatically. This is strictly better
     than v1 (they used to sit under/over the right panel).
   - Draggable windows (`FloatingInspector`, `FloatingPreviewToolbar`) — NOT edited. Their
     stored positions were window-viewport px and are now interpreted cell-relative; a
     previously-saved position may render shifted by the sidebar/menubar offset ONCE. Both
     clamp into view on render (code: `src/ui/FloatingInspector.tsx:70-75`,
     `src/ui/FloatingPreviewToolbar.tsx:81-86`), both die in the FloatingWindow phase, and
     stale persisted UI state may be dropped without migration (constitution). Accept the
     drift; do not write conversion code.
   - `GlowPaintDialog`, `ImportModelDialog` and every other kit Modal portal to
     `document.body` — mount them after StatusBar as plain siblings (position irrelevant).
4. **Toast region overlap**: the region is `fixed bottom-4 right-4 z-[100]` (census:
   ui-kit-hotkeys.md §1.4; code: `src/ui/kit/Toast.tsx`, mounted at
   `src/main.tsx:83`) and would now cover the status bar's corner. Change ONLY the offset
   class to `bottom-8` in `src/ui/kit/Toast.tsx`. The region itself is deleted in the
   statusStore phase (foundation §17 step 3) — do nothing else to it.
5. **Boot code (`src/main.tsx`)**: untouched.
6. Update `zIndexLiterals.test.ts` ALLOWLIST: remove `src/ui/RightPanel.tsx`.
**Verify**:
- Phase-verification items 2–3 (orbit-center, live canvas resize, persistence, focus-steal,
  full v1 surface sweep).
- `grep -rn "right-\[19rem\]\|pointer-events-none" src/app.tsx src/ui/RightPanel.tsx` —
  no matches (file gone).
- Drop a `.glb` on a sidebar: nothing happens; on the canvas: import dialog opens
  (drop zone wraps the cell only — foundation §1.1).

---

#### P1.03 — Retire the RightPanel layout atoms from uiStore

**Goal**: Remove the now-orphaned `$inspectorVisible`/`$inspectorWidth` persisted atoms —
`flexo:layout` is their successor; v1 keys are abandoned, never migrated.
**Files**:
- Modify `src/state/uiStore.ts`
**Depends on**: P1.02.
**Spec**:
- Delete `$inspectorVisible`, `$inspectorWidth`, `setInspectorVisible`, `setInspectorWidth`,
  `INSPECTOR_MIN_WIDTH`, `INSPECTOR_MAX_WIDTH` (code: `src/state/uiStore.ts:25-40`).
  P1.02 removed their only consumer (`RightPanel`); confirm with
  `grep -rn "inspectorVisible\|inspectorWidth\|INSPECTOR_M" src/` → only uiStore itself.
- KEEP `$inspectorMode` (mode-machine phase replaces it), `$inspectorFloatPos`,
  `$animPreviewFloatPos` + setters (FloatingWindow phase replaces them). Add a one-line
  comment on each survivor naming its replacement phase.
- **No migration code** (constitution; design-system-services §9: "v1 keys …
  are abandoned — defensive reads drop unknown shapes"). Stale `flexo:inspectorVisible` /
  `flexo:inspectorWidth` localStorage entries are simply never read again; Reset Everything
  (`localStorage.clear()`, code: `src/ui/nukeAndReload.ts`) still wipes them.
**Verify**: `pnpm typecheck` (any missed consumer fails the build); `pnpm test`.

---

#### P1.04 — Phone flex frame (v1 surfaces intact)

**Goal**: Give the phone the same real-flex skeleton (top bar in-flow, canvas cell) without
changing any phone feature — the ModeTabBar/CondensedStatusBar/sheet shell arrives in later
phases (foundation §12).
**Files**:
- Modify `src/app.tsx` (phone branch — largely done structurally in P1.02; this task
  finishes and verifies the phone specifics)
**Depends on**: P1.02.
**Spec**:
- `MobileTopBar` renders **in-flow** as the first flex child (was `absolute inset-x-0
  top-0`, code: `src/app.tsx:70`). The component itself needs no edit — its Toolbar already
  styles full-width `rounded-none border-x-0 border-t-0` (census: shell-layout.md §1.2);
  only the wrapper div in app.tsx is removed.
- The phone top-center stack (scrubber + selection toolbars) moves into the cell at
  `top-2` (it was `top-14` only to clear the absolutely-positioned top bar, code:
  `src/app.tsx:88-95`; the bar is now above the cell in flow).
- `MobileInspector` (FAB `absolute bottom-3 right-3`, code:
  `src/ui/MobileInspector.tsx:30-44`) mounts inside the cell — the FAB now hugs the CELL's
  corner (identical visually; no status bar on phone in P1). Its bottom-sheet Modal portals
  to body — untouched.
- Phone renders **no** MenuBar/StatusBar/Sidebar components (all `!isPhone`-gated in
  P1.02's tree). `useIsPhone` (code: `src/ui/kit/useIsPhone.ts`) remains THE switch.
- `index.html` viewport meta (zoom lock) untouched (census: shell-layout.md §0, §5).
**Verify**: devtools iPhone viewport: top bar sits in flow (no overlap with the selection
stack), FAB opens the inspector sheet with transform card, seat view bar shows in the cell,
chain palette bottom sheet position unchanged, `.glb` drop on canvas works, pinch/zoom still
locked on a real device if available.

---

#### P1.05 — `Sheet` phone primitive (kit)

**Goal**: The one bottom-sheet primitive of foundation §12 (detents 50%/92%, drag grabber,
drag-dismiss) that the later phone Panel/Inspector/Timeline sheets are built from. Built now,
mounted later.
**Files**:
- Create `src/ui/kit/Sheet.tsx`
- Modify `src/ui/kit/index.ts` (export)
**Depends on**: P0.06.
**Spec**:

```tsx
export function Sheet(props: {
  isOpen: boolean;
  onOpenChange(open: boolean): void;
  /** Detents per foundation §12: '50' = half sheet, '92' = tall sheet. */
  detent?: '50' | '92';           // default '50'
  children: React.ReactNode;      // a kit <Dialog> body, same as Modal
  ariaLabel?: string;
}): JSX.Element;
```

- Implement as a thin sibling of the kit `Modal` sheet variant (code:
  `src/ui/kit/Modal.tsx:14-42` `overlay`/`modal` tvs — reuse the `sheet` overlay recipe):
  react-aria `ModalOverlay` (`items-end`) + `AriaModal` with height `h-[50dvh]` /
  `h-[92dvh]` per detent, `rounded-t-2xl border-t`, entering/exiting translate-y like the
  existing sheet variant.
- **Grabber**: a centered drag handle strip at the top (`mx-auto my-1.5 h-1 w-10
  rounded-full bg-border-strong`, wrapped in a `touch-none` hit area ~`h-6 w-full`).
- **Drag-dismiss** via `usePointerDrag` on the grabber hit area: `onMove` translates the
  sheet by `max(0, dy)` (inline transform); `onEnd` with `dy > 80` → `onOpenChange(false)`,
  else spring back (clear the transform). Down-only; never intercepts body scroll.
- Non-modal sheets (chain window's 50% non-blocking sheet — foundation §12) are a LATER
  variant added in the FloatingWindow/chain phase; do not build it now. Note this in the
  header comment.
- Not mounted anywhere in P1 (the Panel/Inspector sheets adopt it in the phone-shell phase;
  `MobileInspector` keeps its kit Modal until then).
**Verify**: `pnpm typecheck`; scratch-mount at phone width, open, drag the grabber down to
dismiss, both detents; remove scratch.

---

#### P1.06 — `ModeTabBar` phone shell component

**Goal**: The bottom mode tab bar shell of foundation §12 — presentational component built
now so the modeStore phase can mount it; renders nothing anywhere yet.
**Files**:
- Create `src/ui/shell/phone/ModeTabBar.tsx`
**Depends on**: P0.01, P0.03.
**Spec**:

```tsx
export interface ModeTabSpec {
  id: string;                   // mode id ('build' | 'animation' | …) — plain string here;
                                // the modeStore phase supplies the Mode union
  label: string;                // 'Build'
  icon: React.ReactNode;        // lucide icon element
  attention?: boolean;          // small attention dot (foundation §2.2)
}
export function ModeTabBar(props: {
  tabs: ModeTabSpec[];
  activeId: string;
  onSelect(id: string): void;
  /** Re-tap of the ACTIVE tab (foundation §12: opens that mode's Panel sheet). */
  onReselect(id: string): void;
}): JSX.Element;
```

- One fixed-height row: `flex border-t border-border bg-panel
  pb-[env(safe-area-inset-bottom)]` (safe-area padded — foundation §12); each tab a
  react-aria Button (via kit `Button` variant ghost, or a plain styled AriaButton) with
  icon above an 11px label, `flex-1`, active tab tinted `text-accent` with the optional
  attention dot (`absolute size-1.5 rounded-full bg-warning`).
- Tap: `id === activeId ? onReselect(id) : onSelect(id)`.
- Pure presentation — NO store imports (the modeStore phase wires `$mode`/sheet opening).
- Not mounted in P1. Add a header comment naming the mounting phase.
**Verify**: `pnpm typecheck`; scratch-mount with 5 dummy tabs at phone width, tap + re-tap
callbacks fire; remove scratch.

---

#### P1.07 — Docs sync: shell layout + persistence keys

**Goal**: Keep `docs/` truthful about the new shell skeleton and the layout persistence
change (AGENTS.md mandates doc sync with behavior changes).
**Files**:
- Modify `docs/state-persistence.md`
- Modify `docs/architecture.md` (only if stale statements found)
- Modify any other `docs/*.md` a grep turns up
**Depends on**: P1.02, P1.03.
**Spec**:
- `docs/state-persistence.md`: in the "What to Persist / UI panel visibility" area (code:
  `docs/state-persistence.md:44-48`), add a short subsection: shell layout (sidebar
  widths/collapse, floating-window positions/z-order) persists as ONE key `flexo:layout`
  via `@nanostores/persistent` (`src/state/layoutStore.ts`), with a defensive
  sanitize-on-boot read; the former `flexo:inspectorVisible` / `flexo:inspectorWidth` keys
  are retired and intentionally NOT migrated (schema changes purge, never convert —
  constitution). Mention `flexo:inspectorFloatPos`/`flexo:animPreviewFloatPos` still exist
  until the FloatingWindow phase.
- `grep -rn "inspector\|RightPanel\|toolbar" docs/*.md` — fix any sentence describing the
  old absolute-overlay shell (e.g. references to the inspector "floating over" the
  viewport) to describe the docked frame. Verified at plan time: `docs/architecture.md` and
  `docs/editor-state.md` contain no RightPanel/shell-layout claims, so expect only small or
  zero edits; do not write new doc chapters — the v2 shell gets its own docs at the end of
  the refactor.
- No `scope/*.md` changes (editor-only chrome; game contract untouched — state this in the
  commit message).
**Verify**: `pnpm fmt` (oxfmt formats Markdown too — AGENTS.md); read the diff for accuracy.


---

## flexo v2 — Implementation plan, Phases 2–3

Part of the flexo v2 UI refactor plan. Design corpus: `plans/flexo_v2/design/` (foundation.md is LAW).
Census of record: `analysis/flexo-v2-feature-census/`. Constitution: `AGENTS.md`.

Conventions:
- (design: `<file>` §X) cites `plans/flexo_v2/design/<file>`; (census: `<file>` §X) cites
  `analysis/flexo-v2-feature-census/<file>`; (code: `src/...:<line>` `<symbol>`) cites the
  working tree @ `fcd5e07` — every citation below was verified against source. Phase 0/1
  touch a few of these files (Kbd import moves, app.tsx rewrite), so line numbers may have
  drifted by a few lines at implementation time — the cited SYMBOL is the anchor; re-grep it.
- Mandatory end-of-task workflow for EVERY task: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check`
  → `pnpm typecheck` → `pnpm test`. "Verify" blocks list only checks beyond that baseline.
- **Neither phase touches the KSA game contract** (XML/GLB/coords/decomp semantics) — no
  `scope/*.md` sync is required in Phase 2 or 3 (editor-only chrome; the corpus's only
  game-contract-touching refactor item, per-channel easing export/import, is Phase 11's).
  `docs/*.md` sync tasks are included (P2.16, P3.16).
- **Undo blanket statement**: nothing created in these phases enrolls in undo. Commands are
  thin dispatchers to EXISTING editorStore mutators which already own their discrete
  `pushUndo` (code: `src/state/editorStore.ts:298-324` invariant block). commandStore /
  dialogStore / statusStore / notificationStore / modifierStore state, layout, palette
  recents, menu/dialog open state, status messages and notifications are never undoable
  (design: foundation §13 "mode/layout/status/notifications/windows never create undo
  steps"). Every task below that touches a mutator restates its enrollment inline.
- **Numeric inputs**: Phases 2–3 create no new numeric fields; the numeric editors they
  RELOCATE (View-popover numerics → SettingsModal, P2.07) move verbatim and already use
  `useNumberDraft`-based `PreciseNumberInput` with `inputMode="url"` — do not rewrite them.

### Cross-phase knitting notes (read before starting)

These phases sit between P0/P1 (docked skeleton, kit primitives, `layoutStore`, kit
`Kbd`/`keyLabel`, `Sheet`, placeholder `MenuBar`/`StatusBar`) and P4 (modeStore + scoped
hotkey registry v2). Interim wiring decisions, all spec'd precisely in the tasks:

1. **Mode switcher before modeStore** (assignment-mandated): the menubar mode chips and the
   status-bar mode chip render in P2/P3 but map onto the v1 `$inspectorMode`
   ('assets'/'anim'/'engine' — code: `src/state/uiStore.ts:18` `$inspectorMode`). The exact
   adapter is task P2.03. Data and Surface chips render **disabled** until their modes exist.
   P4 deletes the adapter and re-points `mode.*` commands at `modeStore.setMode`.
2. **Hotkeys before registry v2**: P2 edits the v1 flat registry (`src/ui/hotkeys/
   registry.ts`) — rebinding ⌘K → palette / ⇧⌘K → chain and adding the global ⌘-chords —
   and renames binding ids to the v2 command ids so menu shortcut chips, the palette and
   HelpDialog all read ONE source (task P2.12). Scope narrowing (viewport/mode/tool/surface),
   `1–5`, `⌥[`/`⌥]`, `T`, `B`, `M`, `F`, `[`/`]`, ⌘A-family land in P4 — commands for those
   are registered now but their menu items render without chips or disabled (stub table in
   P2.09).
3. **Seams with already-written sibling phases** (do NOT modify their files):
   - P5B expects from P2: "MenuBar rendered from MenuSpec + commandStore (commands, dynamic
     providers, dialogStore.$openDialog)" and completes the Add/View command semantics
     (S27 auto-switch, select+reveal-for-every-kind, Frame/Reset/snap-to-centroid camera).
     P5B.22's "Delete AddButton.tsx" step will already be done here (P2.11) — its remaining
     work (semantics completion, `customMeshInstances` provider upgrade) still applies.
   - P5B.01 creates `snapStore` — therefore **status-bar segment 9 (snap chip) is NOT built
     in P3**; P3 leaves a documented gap (P3.04) and P5B adds the chip.
   - P8 expects dialog ids `'upload-texture'`, `'material'`, `'glow-paint'`-era wiring and
     "the v1 CustomAssetsModal or a disabled stub" behind Asset Manager (P2.08 provides
     `'custom-assets'` → the v1 modal). P8 later refines the import-report rich payload;
     P3.14 performs the initial ImportReportCard absorption (see that task's seam note).
   - P9/P10 expect: dialog id `'projects'` (used by notification actions), dialog id
     `'settings'` "created by the system-services phase", `trackJob` in
     `src/state/statusStore.ts`, `notify()` available, and the v1 Export dialog reachable
     via its Phase-2 dialog id (`'export-ksa'`). BuildIdMismatchDialog is NOT touched here —
     its demotion to a sticky notification is P9's (S26); P3 only ships the center + routing.
4. **`toast()` signature**: the design sketch (design: design-system-services.md §2.2) writes
   `toast(title: string, opts)`, but the BINDING requirement in the same section is that the
   v1 call sites (EditorScene, boot, nudge/rotateControls) keep compiling with their calls
   unmodified. The real v1 signature is `toast(message: ToastMessage, options?: {timeout?})`
   with `ToastMessage = {title, description?, variant?}` (code: `src/ui/kit/Toast.tsx:12-24`
   `ToastMessage`/`toast`). The facade (P3.06) therefore keeps the OBJECT signature; only the
   import path changes (sanctioned: §2.5 "mechanical codemod"). Not a deviation — the
   design's own invariant outranks its illustrative sketch.

---

## Phase 2 — Command registry, menubar, dialog store, ⌘K palette

**Design sources**: foundation.md §3 (menubar tree — but FINAL_DESIGN_INDEX.md's
"Consolidated menubar tree" is AUTHORITATIVE where they differ), §4 (command registry &
MenuSpec mechanics), §10.1 (dialog conventions, dialogStore), §11.3 (palette), §17 step 2
(build order); design-system-services.md §3 (palette: surface, data source, fuzzyMatch,
recents, chain integration), §7.9 (MenuItem density + MenuSeparator fix — deferred here
from P0); FINAL_DESIGN_INDEX.md (authoritative menubar tree + hotkey table); DECISIONS.md
#4 (compile-green).
**Census sources**: shell-layout.md §1.1–1.2 (every toolbar feature), §1.17, §2 (dialog
inventory), §4 pains 5/6/8/9/12; ui-kit-hotkeys.md §1.3 (registry), §1.6 (help), §6;
selection-transform.md §1.12 (undo/history UI), §1.13 (Scale Everything); chains-misc.md
(chain guards).

**Entry state**: Phase 1 complete. Docked frame runs; `src/ui/shell/MenuBar.tsx` is a
placeholder strip; the v1 `EditorToolbar` still floats top-center inside the canvas cell and
`MobileTopBar` runs the phone; every dialog is owned by its trigger button
(controlled/uncontrolled dual APIs); `⌘K` still toggles the chain palette; kit has
`Kbd`/`keyLabel` (P0.04), `Sheet` (P1.05), `xs` tier (P0.03).

**Exit state**: App runs with the real MenuSpec menubar (eight menus, centered interim mode
switcher, right cluster: project chip · ↶ ↷ · ⌘K), all dialogs mounted once at root behind
`dialogStore` ids, the ⌘K command palette (fuzzy, recents, chords, dynamic providers), and
the phone running PhoneTopBar + MenuSheet from the same MenuSpec. DELETED:
`src/ui/Toolbar.tsx`, `MobileTopBar.tsx`, `AddButton.tsx`, `ViewButton.tsx`,
`MeasureButton.tsx`, `SettingsButton.tsx` (file — `SettingsModal` moves out first),
`HistoryButton.tsx`, `ProjectButton.tsx`, `src/state/helpStore.ts`. Old surfaces that
survive to later phases still work: FloatingInspector, SelectionToolbar, chain palette
(now ⇧⌘K), seat bar, HUDs, toasts (P3 absorbs), AssetsList sidebar.

**Phase verification**:
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` all green
   (new: `commandStore.test.ts`, `dialogStore.test.ts`, `menuSpec.test.ts`,
   `fuzzyMatch.test.ts`, `editorStore.test.ts` additions).
2. Desktop sweep: every File/Edit/Add/Select/View/Tools/Window/Help item either performs its
   v1 behavior or is visibly disabled per the stub table (P2.09). Open every dialog from its
   menu item AND from ⌘K. Undo/redo buttons + ⌘Z/⇧⌘Z with label flash. ⌘K opens the
   palette; ⇧⌘K opens/discard-confirms the chain. `?` still opens Help and Help lists the
   NEW chords (registry-driven). Mode switcher: Build/Animation/Engine swap the right
   sidebar exactly like the v1 AssetsToolbar buttons did; Data/Surface disabled.
3. Phone sweep (<640px): PhoneTopBar (☰ · mode · project chip · ↶ ↷); ☰ MenuSheet reaches
   every menu item through drill-down; dialogs open at their phone variants.
4. Narrow desktop (~800px wide): the eight menus collapse into one ☰ Menu trigger.
5. RULE ZERO spot-check against census shell-layout.md §1.1: each of the 13 toolbar
   clusters' features has a live home (table in P2.09 maps them).

### Task ordering

P2.01 → P2.02 → P2.03/P2.04 (parallel) → P2.05 → P2.06 → P2.07 → P2.08 → P2.09 → P2.12 →
P2.13 → P2.10 → P2.11 → P2.14 → P2.15 → P2.16. Every boundary compiles; the old toolbar
keeps working until P2.11 because P2.05–P2.08 leave one-line trigger buttons behind.

---

#### P2.01 — commandStore: the command registry + dynamic providers

**Goal**: The single dataset behind menubar, MenuSheet, palette, hotkey chips and Help
(design: foundation §4; Law 4 "menus are data").
**Files**:
- Create `src/state/commandStore.ts`
- Create `src/state/commandStore.test.ts`
**Depends on**: none.
**Spec**:
`src/state/commandStore.ts` — **zero react/three imports** (constitution layering; the
store holds plain objects and atoms; command *definitions* live in `src/ui/commands/` and
register into it, so UI-layer imports stay in the UI layer):

```ts
import { atom } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';

export interface Command {
  id: string;                        // e.g. 'edit.undo', 'layer:activate:<layerId>'
  title: string;                     // menu/palette label; may be re-computed by dynamic providers
  menuPath?: string;                 // palette subtitle, e.g. 'File' or 'View ▸ Camera Snap'
  keywords?: string;                 // extra fuzzy-match terms (design: system-services §3.3)
  enabled?: () => boolean;           // store selector, evaluated on menu open / palette render
  checked?: () => boolean;           // ✓ / ◉ state for View-menu-style items
  keepOpen?: boolean;                // palette ⌘↩ run-and-keep-open eligibility (§3.4)
  run: (params?: unknown) => void;
}

const commands = new Map<string, Command>();
export function registerCommand(cmd: Command): void;      // throws on duplicate id (dev)
export function registerCommands(cmds: Command[]): void;
export function getCommand(id: string): Command | undefined;
export function allCommands(): Command[];                 // static commands only

/** Dynamic providers — factory-generated commands re-evaluated on menu open / palette
 *  keystroke (design: foundation §4 "Dynamic providers"). Provider ids used in Phase 2:
 *  'history', 'layers.select', 'layers.activate', 'seats', 'customMeshInstances',
 *  'projects', 'aids.measurements', 'aids.containers' (interim, P2.09). */
export function registerCommandProvider(id: string, fn: () => Command[]): void;
export function providerCommands(id: string): Command[];  // [] for unknown id
export function allDynamicCommands(): Command[];          // concat of every provider

/** Runs a command if it exists and is enabled; records palette recents when asked.
 *  Disabled/unknown → no-op returning false (palette renders the no-op flash). */
export function runCommand(id: string, params?: unknown): boolean;

export const $paletteOpen = atom(false);
export function openPalette(): void; export function closePalette(): void;
export const $paletteRecents = persistentJSON<string[]>('flexo:paletteRecents', []);
export function recordRecent(id: string): void;  // MRU, dedupe, cap 8 (design §3.4)
```

- `runCommand` checks `enabled?.() !== false` before `run` — commands are the ONLY way
  features expose actions to the shell (design: foundation §4).
- No undo participation, no persistence beyond `flexo:paletteRecents`.
`commandStore.test.ts` (plain store test, style of code:
`src/state/settingsStore.test.ts`): duplicate-id registration throws; `runCommand` skips a
command whose `enabled` returns false and returns false; provider commands re-evaluate
(register a provider off a mutable array, mutate, assert `providerCommands` reflects it);
`recordRecent` is MRU-deduped and caps at 8; `runCommand` on unknown id returns false.
**Verify**: `pnpm test` — commandStore.test.ts green. Nothing consumes it yet.

---

#### P2.02 — dialogStore + DialogRoot host

**Goal**: One `$openDialog = {id, params}` atom + a single root mount point for every
overlay dialog — retiring per-button open state and the controlled/uncontrolled dual API
(design: foundation §10.1, §4 "Dialog-opening commands"; census: shell-layout.md pain 6).
**Files**:
- Create `src/state/dialogStore.ts`
- Create `src/state/dialogStore.test.ts`
- Create `src/ui/shell/DialogRoot.tsx`
- Modify `src/app.tsx` (mount `<DialogRoot />` once, after StatusBar, both desktop & phone)
**Depends on**: none.
**Spec**:

```ts
// src/state/dialogStore.ts — no react imports
import { atom } from 'nanostores';
export interface OpenDialog { id: DialogId; params?: unknown }
export type DialogId =
  | 'projects' | 'rename-project' | 'share-link' | 'export-project' | 'import-project'
  | 'export-ksa' | 'part-data' | 'settings' | 'scale-everything'
  | 'custom-assets' | 'subpart-browser' | 'part-browser'
  | 'create-mesh' | 'upload-texture' | 'material'
  | 'help' | 'about'
  | 'chain-discard-confirm';       // P2.13
export const $openDialog = atom<OpenDialog | null>(null);
export function openDialog(d: OpenDialog): void;
export function closeDialog(): void;               // sets null
export function isDialogOpen(id?: DialogId): boolean;
```

- Exactly ONE dialog open at a time (stacking is banned — foundation §10.1; nested flows
  use `DialogViewStack`/`InlineConfirmStrip` in later phases). `openDialog` overwrites.
- Dialog ids NOT in this union yet (deliberate): `'import-model'` and `'glow-paint'` keep
  their v1 atoms (`$importModelRequest`, `$glowPaintMeshId` — code:
  `src/state/customAssetStore.ts:179`, `:154`) until P8 rehosts them (phase-08 does this);
  `ManageTanksModal`/`MeshPickerModal` stay AssetsList/AnimToolbar-local until P6/P11.
- `DialogRoot.tsx`: reads `useStore($openDialog)` and renders the matching root-hosted
  dialog component (populated by P2.05–P2.08; starts as an empty switch). Every dialog it
  hosts receives `isOpen={open?.id === '<id>'}` + `onOpenChange={(v) => { if (!v) closeDialog(); }}`
  so react-aria dismissal (Esc/backdrop) keeps working unchanged (Esc-ladder rung 2 stays
  react-aria's — design: system-services §4.6).
- `$dialogViewStack` from foundation §13 is NOT created here — `DialogViewStack` (P0.11)
  keeps its stack local to each adopting dialog; no adopters exist until P8/P9.
`dialogStore.test.ts`: open/overwrite/close transitions; `isDialogOpen('x')` truth table.
**Verify**: `pnpm test`; app renders unchanged (DialogRoot renders null).

---

#### P2.03 — Interim mode adapter over `$inspectorMode`

**Goal**: One module that P2's mode switcher, P3's status mode chip, and the `mode.*`
commands all share, so the interim `$inspectorMode` mapping lives in exactly one place and
P4 deletes exactly one file.
**Files**:
- Create `src/ui/commands/interimMode.ts`
**Depends on**: none.
**Spec**:

```ts
// src/ui/commands/interimMode.ts
// INTERIM (Phase 2–3 only): v2 modes mapped onto the v1 $inspectorMode until modeStore
// lands in Phase 4 (foundation §2; phase plan P4). P4 DELETES this file and re-points
// mode.* commands at modeStore.setMode.
import { computed } from 'nanostores';
import { $inspectorMode, setInspectorMode } from '../../state/uiStore';
import { exitEngineMode, enterEngineMode } from '../../state/engineStore';

export type InterimMode = 'build' | 'animation' | 'data' | 'engine' | 'surface';
export const INTERIM_MODES: { id: InterimMode; label: string; available: boolean }[] = [
  { id: 'build', label: 'Build', available: true },
  { id: 'animation', label: 'Animation', available: true },
  { id: 'data', label: 'Data', available: false },      // arrives P6 (mode machine P4)
  { id: 'engine', label: 'Engine', available: true },
  { id: 'surface', label: 'Surface', available: false }, // arrives P8
];
export const $interimMode = computed($inspectorMode, (m): InterimMode =>
  m === 'anim' ? 'animation' : m === 'engine' ? 'engine' : 'build');
export function setInterimMode(mode: InterimMode): void {
  if (mode === 'engine') { enterEngineMode(); return; }          // preserves active entry
  // Leaving engine must go through exitEngineMode so the exhaust gizmo is disarmed
  // (v1 invariant — code: src/state/engineStore.ts:296-299 exitEngineMode).
  if ($inspectorMode.get() === 'engine') exitEngineMode();
  setInspectorMode(mode === 'animation' ? 'anim' : 'assets');
}
```

- Mapping evidence: `$inspectorMode: 'assets' | 'anim' | 'engine'` (code:
  `src/state/uiStore.ts:18` `$inspectorMode`); `enterEngineMode`/`exitEngineMode` (code:
  `src/state/engineStore.ts:290-299`); the v1 sidebar buttons that do the same swaps
  (code: `src/ui/AssetsToolbar.tsx:46-55` `setInspectorMode` calls).
- Not undoable; ephemeral (v1 parity — `$inspectorMode` resets on reload).
**Verify**: `pnpm typecheck`. No consumer yet.

---

#### P2.04 — editorStore selection helpers for the Select menu

**Goal**: `selectAllEntities()` and `invertSelection()` — the only two Select-menu actions
with no v1 backing (design: foundation §3 Select; FINAL_DESIGN_INDEX Select menu). Layer
guards match the design ("every entity on listed + unlocked layers").
**Files**:
- Modify `src/state/editorStore.ts`
- Modify `src/state/editorStore.test.ts`
**Depends on**: none.
**Spec**:
- Add next to `selectLayerEntities` (code: `src/state/editorStore.ts:3927`
  `selectLayerEntities` — mirror its per-kind index-collection pattern):

```ts
/** Selects every entity on listed + unlocked layers (Select ▸ All — foundation §3).
 *  Selection is view state: NO undo enrollment (see the invariant block above). */
export function selectAllEntities(): void
/** Inverts the selection within the selectable population of selectAllEntities. */
export function invertSelection(): void
```

- Population per kind: `placements`/`connectors`/`kittens`/`colliders`/`ivaSeats`/`lights`
  of `$part`, filtered by `isLayerListed(layerId) && !isLayerLocked(layerId)` (code:
  `src/state/layerStore.ts:52-61` `isLayerLocked`/`isLayerListed`; entity → layer id
  resolution identical to `selectLayerEntities`). Commit via `setSelection(sub, con, kit,
  col, seat, light)` (code: `src/state/editorStore.ts:2044` `setSelection`).
- `invertSelection`: population minus currently-selected indices per kind (read the six
  `$selected*Indices` atoms — code: `src/state/editorStore.ts:119-182`).
- **Note for P5A**: the stable-id selection rework (build design §1) will rebase these on
  `SelectionRef[]`; keep them thin.
- Tests (extend `editorStore.test.ts`, its existing fixture style): selectAll picks up all
  kinds; a locked layer's placements are excluded; a non-listed layer's excluded; invert of
  empty selection == selectAll result; invert of selectAll == empty; no undo step pushed
  (assert `$canUndo` unchanged across calls).
**Verify**: `pnpm test` — new cases green.

---

#### P2.05 — Help & About onto dialogStore; delete helpStore

**Goal**: `$helpOpen`/`$aboutOpen` become dialog ids `'help'`/`'about'` (design: foundation
§13 dialogStore row; system-services §5.2; P12 death rows 37–38 assign this to P2).
**Files**:
- Modify `src/ui/hotkeys/HelpDialog.tsx`, `src/ui/AboutDialog.tsx`
- Modify `src/state/aboutStore.ts`
- Delete `src/state/helpStore.ts`
- Modify `src/ui/hotkeys/registry.ts` (the `?` binding's run)
- Modify `src/app.tsx` (HelpDialog/AboutDialog now render inside DialogRoot — remove the
  direct mounts)
**Depends on**: P2.02.
**Spec**:
- `HelpDialog` drops `$helpOpen` (code: `src/state/helpStore.ts:9`) and reads
  `$openDialog?.id === 'help'`; close → `closeDialog()`. The `?` binding (code:
  `src/ui/hotkeys/registry.ts:192-199` `help`, `useKey: true, ignoreModifiers: true` —
  PRESERVE those options verbatim, census: ui-kit-hotkeys.md §5) now toggles:
  `isDialogOpen('help') ? closeDialog() : openDialog({id:'help'})`.
- `aboutStore.ts`: DELETE `$aboutOpen`/`openAbout`/`closeAbout` (code:
  `src/state/aboutStore.ts:10-24`); KEEP `$aboutSeen` (`flexo:aboutSeen`, code: `:18`),
  `suppressAboutFirstUse` (:38) and `showAboutOnFirstUse` (:50) — first-run auto-open +
  share-link suppression are load-bearing (design: system-services §5.2 "kept verbatim").
  `showAboutOnFirstUse` now calls `openDialog({id:'about'})`. aboutStore importing
  dialogStore is state→state (fine).
- Register both in DialogRoot's switch. AboutDialog content untouched (the RocketWerkz /
  Dean Hall attribution text is legally load-bearing — design: foundation §3 Help).
**Verify**: `?` toggles Help; Help → close → `?` again; About auto-opens on a fresh profile
(devtools: clear `flexo:aboutSeen`, reload) and NOT on a `?load=` share-link URL;
`grep -rn "helpStore\|\$helpOpen\|aboutOpen" src/` → no hits outside aboutStore internals.

---

#### P2.06 — Project dialogs: extract from ProjectButton, add Rename dialog

**Goal**: The five project overlays become root dialogs (`'projects'`, `'share-link'`,
`'export-project'`, `'import-project'`, `'rename-project'`); ProjectButton shrinks to a
trigger that P2.11 deletes (design: foundation §3 File; P12 row 7 "P2/P9"; census:
shell-layout.md §1.1 item 1).
**Files**:
- Create `src/ui/projects/ProjectDialogs.tsx`
- Modify `src/ui/ProjectButton.tsx`, `src/ui/ProjectTransferDialogs.tsx`,
  `src/ui/ShareProjectDialog.tsx`, `src/ui/shell/DialogRoot.tsx`
**Depends on**: P2.02.
**Spec**:
1. Move `LoadProjectDialog` (currently a private component — code:
   `src/ui/ProjectButton.tsx:155` `LoadProjectDialog`, incl. its `setTick` refresh hack at
   `:163-164`, per-project delete + nested ConfirmDialog at `:225-234`) into
   `src/ui/projects/ProjectDialogs.tsx` UNCHANGED in behavior, hosted as dialog id
   `'projects'`. Keep the `setTick` hack — the reactive project index replaces it in P9
   (LOCKED #3); do not improve it here.
2. New `RenameProjectDialog` (S/center) in the same file, id `'rename-project'`: one kit
   `TextField` seeded with `$projectName` (code: `src/state/projectStore.ts:84`), Enter /
   "Rename" button → `renameCurrentProject(draft)` (code: `src/state/projectStore.ts:415`)
   then `closeDialog()`. **INTERIM**: v1 rename semantics verbatim (including the silent
   same-name overwrite the design flags); the collision auto-suffix fix is P9's (design:
   foundation §3 File "fixes v1 silent overwrite" — P9 owns projects storage). Not a
   numeric field; plain TextField.
3. `ShareProjectDialog` / `ExportProjectDialog` / `ImportProjectDialog` (code:
   `src/ui/ProjectButton.tsx:119-122` mounts; components in `ShareProjectDialog.tsx` /
   `ProjectTransferDialogs.tsx`) re-hosted under ids `'share-link'`, `'export-project'`,
   `'import-project'` — guts untouched (additive JSON import stays ONE undo step via
   `importProjectData`, its existing enrollment; export gate + share `hasCustomAssets`
   disable stay — LOCKED #3's archive replaces them in P9).
4. `ProjectButton.tsx` interim: popover body's Load/Share/Export/Import buttons and the
   New Project row now call `openDialog(...)` / `createProject(uniqueProjectName())`
   (code: `src/state/projectStore.ts:370`/`:335`); the inline rename input stays for now.
   The whole file dies in P2.11.
**Verify**: from the (still-present) toolbar Project popover: Load lists projects,
delete-with-confirm works and the list refreshes; Share/Export/Import open; Rename via the
new dialog renames (check the project chip after P2.11). One dialog at a time (opening
Projects closes an open About, etc.).

---

#### P2.07 — Export / Part Data / Settings / Scale Everything onto dialogStore; View numerics move into Settings

**Goal**: The remaining toolbar-owned dialogs become root dialogs, and the v1 View
popover's NUMERIC content moves into `SettingsModal` so ViewButton can die in P2.11 with
zero feature loss (design: S16 — "toggles/radios in View menu; numerics/sliders in
Settings"; P12 row 4 assigns ViewButton's death to P2, home "View menu + Settings →
Viewport/Scene").
**Files**:
- Modify `src/ui/ExportButton.tsx` (trigger only) + Create `src/ui/ExportDialog.tsx`
  (the extracted dialog — its OWN file, so P2.11 can delete the trigger file whole and
  P10.07 has a concrete delete target)
- Modify `src/ui/PartDataButton.tsx` (trigger only) + Create `src/ui/PartDataDialog.tsx`
  (same split; P6.18 deletes this file)
- Create `src/ui/SettingsDialog.tsx` (moved `SettingsModal` + new sections)
- Modify `src/ui/SettingsButton.tsx` (imports from the new file; trigger only)
- Modify `src/ui/ScaleEverythingDialog.tsx` (host under id; keep exported component)
- Modify `src/ui/ViewButton.tsx` (numeric/slider rows removed — they now live in Settings)
- Modify `src/ui/MobileTopBar.tsx` (menu actions → `openDialog`; drop the controlled mounts)
- Modify `src/ui/shell/DialogRoot.tsx`
**Depends on**: P2.02.
**Spec**:
1. **ExportButton** (code: `src/ui/ExportButton.tsx:74-112` — dual API `isControlled` at
   `:83-85`, trigger at `:112`): extract the Modal + its entire body into an exported
   `ExportDialog({isOpen, onOpenChange})` in the NEW file `src/ui/ExportDialog.tsx`;
   DialogRoot hosts it as `'export-ksa'`. Delete the dual-API plumbing; the leftover
   `ExportButton` renders only
   `<ToolbarButton onPress={() => openDialog({id:'export-ksa'})}>Export</ToolbarButton>`
   (the trigger file dies whole in P2.11; the dialog file dies in P10.07).
   All export behavior (pre-flight boxes, tabs, mods-folder writes, zip fallback, toasts at
   code: `src/ui/ExportButton.tsx:296-340`) is untouched — P10 owns the export redesign.
2. **PartDataButton** (code: `src/ui/PartDataButton.tsx:37-69`, dual API `:43-45`): same
   split → `PartDataDialog` in the NEW file `src/ui/PartDataDialog.tsx`, id `'part-data'`.
   Dies in P6 (P6.18 deletes the dialog file; P2.11 deletes the trigger); do not
   restructure.
3. **SettingsModal** (code: `src/ui/SettingsButton.tsx:42` `SettingsModal`) moves to
   `src/ui/SettingsDialog.tsx`, hosted as `'settings'`. Accept-and-ignore a
   `params?: {tab?: string}` (P9 builds the real tabs and honors deep-links — phase-09-10
   requires the id to exist and accept params). Extend it with:
   - **"Viewport" additions**: the per-axis grid spacing `PreciseNumberInput` rows from the
     View popover's Grids section (code: `src/ui/ViewButton.tsx:85` `Grids` section) —
     moved VERBATIM (numberDraft + `inputMode="url"` already; grid spacing edits are view
     state, no undo).
   - **New "Scene" section**: the View popover's Lighting numerics/selects — tone map
     select, exposure slider, reflections slider, sky-blur slider (code:
     `src/ui/ViewButton.tsx:190` `Lighting` section; store writes `setLighting`, code:
     `src/state/lightingStore.ts:55`) and the light-viz exposure mode/value + absolute
     input from the Visibility section (code: `src/ui/ViewButton.tsx:111` `Visibility`) —
     moved VERBATIM. The environment PRESET radio, sky-background/hide-interior/coverage/
     live-preview toggles stay OUT (they become View-menu items, P2.09).
   - **New "Danger zone" section** (S12: Reset lives ONLY in Settings → Advanced): a
     danger Button "Reset Everything 🔥" → the existing ConfirmDialog + "Reset folder
     access grants" Switch → `nukeAndReload({resetFsGrants})` (port from code:
     `src/ui/SettingsButton.tsx:208-258` `SettingsButton`, which is where the confirm +
     switch currently live). Include the FS-grants switch on ALL platforms — this fixes the
     v1 phone inconsistency (MobileTopBar's confirm called `nukeAndReload()` without the
     switch — code: `src/ui/MobileTopBar.tsx:126-134`). ConfirmDialog stays blessed here
     (top-level confirm — design: system-services §7.5); P9 restyles into the Advanced tab.
4. **ScaleEverythingDialog** (code: `src/ui/ScaleEverythingDialog.tsx:12`, props
   `isOpen/onOpenChange`): host as `'scale-everything'`; guts untouched (one undo step via
   `scaleEverything` — its existing discrete enrollment; code:
   `src/state/editorStore.ts:2349`).
5. **MobileTopBar**: its ☰ menu `onAction` handlers (code: `src/ui/MobileTopBar.tsx:87-98`)
   switch to `openDialog({id:…})`; delete the eight controlled mounts (`:119-125`) and the
   local ConfirmDialog (Reset now lives in Settings). View/Measure items keep working until
   P2.11 (their components still render as sheets via their own trigger states — leave
   `ViewButton`/`MeasureButton` sheet variants reachable from the ☰ menu by keeping local
   open state for JUST those two; P2.11 deletes those files and the phone loses the popover
   toggles until P2.15's MenuSheet — an accepted transient, see P2.11 item 3).
**Verify**: Export/Part Data/Settings/Scale open from toolbar + phone menu via dialogStore;
Settings shows grid spacing + scene sliders + reset (desktop AND phone, switch present);
sliders live-commit exactly as they did in the popover; `grep -n "isControlled" src/ui/`
returns only `ViewButton.tsx`/`MeasureButton.tsx`/`HistoryButton.tsx` (they die in P2.11).

---

#### P2.08 — Asset dialogs & catalog browsers onto dialogStore

**Goal**: The Add-menu dialogs and both catalog browsers get root ids so the Add MenuSpec
(P2.09) can open them; CustomAssetsModal becomes the interim Asset Manager (design:
foundation §17 step 2 "dialogs keep their components and gain dialogStore ids"; phase-08
expects `'upload-texture'`/`'material'`/`'custom-assets'`).
**Files**:
- Modify `src/ui/AddButton.tsx` (open via dialogStore; local dialog mounts removed)
- Modify `src/ui/SubPartBrowser.tsx` / `src/ui/PartBrowser.tsx` (no API change — hosted)
- Modify `src/ui/AssetsToolbar.tsx` ("Custom (N)" → `openDialog({id:'custom-assets'})`)
- Modify `src/ui/CustomAssetsModal.tsx` (host props passthrough only)
- Modify `src/ui/shell/DialogRoot.tsx`
**Depends on**: P2.02.
**Spec**:
- DialogRoot hosts: `SubPartPopup` → `'subpart-browser'`; `PartPopup` → `'part-browser'`
  (code: `src/ui/AddButton.tsx:172-173` current mounts; browser fresh-session-on-open
  semantics live inside `BrowserPopup` body-unmount — code: `src/ui/BrowserShell.tsx:6` —
  and are preserved by construction since DialogRoot unmounts on close);
  `CreateMeshDialog` → `'create-mesh'`, `CustomTextureDialog` → `'upload-texture'`,
  `MaterialDialog` → `'material'` (code: `src/ui/AddButton.tsx:174-176` current
  conditional mounts — these three take `onClose`; adapt: render when open with
  `onClose={closeDialog}`); `CustomAssetsModal` → `'custom-assets'` (code:
  `src/ui/AssetsToolbar.tsx:61` current mount, `isOpen/onOpenChange` props).
- `AddButton.tsx` menu `onAction` (code: `src/ui/AddButton.tsx:61-74`): dialog-opening keys
  now call `openDialog`; the five `useState`s die. Instant actions (`addConnector`,
  `addIvaSeat`, `addLight`+select+reveal, `addKitten`, `addSubPart`, `requestColliderFit`,
  `makeKittenMeshPart`, `openImportModel`, `enterEngineMode`) unchanged — P2.09 lifts them
  into commands; AddButton itself dies in P2.11.
- CustomAssetsModal's internal MaterialDialog stack (code:
  `src/ui/CustomAssetsModal.tsx:431`) is left AS-IS (modal-in-modal killed by P8's
  DialogViewStack adoption — design: system-services §7.5 names it an adopter).
**Verify**: Add ▸ SubPart/Part browsers open, browse, add-and-stay, close → reopen resets
search/splits (fresh session). Add ▸ Upload texture/Create material/Create mesh open.
Assets sidebar "Custom (N)" opens the modal. `pnpm test`.

---

#### P2.09 — Command modules + the MenuSpec dataset (all eight menus)

**Goal**: Every command and the complete menu tree as data — the heart of the phase
(design: foundation §3 + §4; FINAL_DESIGN_INDEX menubar tree AUTHORITATIVE; census:
shell-layout.md §1.1 is the parity checklist).
**Files**:
- Create `src/ui/commands/fileCommands.ts`, `editCommands.ts`, `addCommands.ts`,
  `selectCommands.ts`, `viewCommands.ts`, `toolsCommands.ts`, `windowCommands.ts`,
  `helpCommands.ts`, `modeCommands.ts`, `providers.ts`, `index.ts`
- Create `src/ui/menu/menuSpec.ts`
- Create `src/ui/menu/menuSpec.test.ts`
**Depends on**: P2.01–P2.08.
**Spec**:

`src/ui/commands/index.ts` runs every `registerCommands`/`registerCommandProvider` call at
module scope; imported once by `src/app.tsx` (side-effect import). Command modules are UI
layer — they may import stores AND ui helpers (chain guards, dialogs).

**MenuSpec** (`src/ui/menu/menuSpec.ts`):

```ts
export type MenuEntry =
  | { kind: 'command'; commandId: string; dynamicTitle?: () => string } // e.g. Undo <label>
  | { kind: 'checkbox' | 'radio'; commandId: string }                   // renders ✓/◉ off checked()
  | { kind: 'submenu'; id: string; label: string; entries: MenuEntry[] }
  | { kind: 'provider'; providerId: string }   // dynamic rows, re-evaluated on open
  | { kind: 'separator' };
export interface TopMenu { id: string; label: string; entries: MenuEntry[] }
export const MENU_SPEC: TopMenu[]; // File Edit Add Select View Tools Window Help — exactly
```

Transcribe the tree from FINAL_DESIGN_INDEX.md "Consolidated menubar tree" EXACTLY —
labels, order, separators, submenus. The complete command table (id → title → wiring →
state). Items marked **[stub]** register with `enabled: () => false` and a tooltip reason
(disabled items stay visible — design: foundation §3 preamble); items marked **[interim]**
have v1 semantics now and a named later phase for the final semantics:

| Menu | Command id | Wiring (verified current code) |
|---|---|---|
| File | `file.new` | `createProject(uniqueProjectName())` (code: `src/state/projectStore.ts:370`/`:335`) |
| File | `file.projects` ⌘O | `openDialog({id:'projects'})` |
| File | `file.renameProject` | `openDialog({id:'rename-project'})` |
| File | `file.importProject` | `openDialog({id:'import-project'})` **[interim** — P9 adds the destination radio + archive support**]** |
| File | `file.exportProject` | `openDialog({id:'export-project'})` — label **"Export Project…"** for now; P9 turns it into "Export Project Archive…" (.tar.gz, LOCKED #3) under the same id |
| File | `file.shareLink` | `openDialog({id:'share-link'})` |
| File | `file.exportKsa` ⌘E | `openDialog({id:'export-ksa'})` |
| File ▸ Mods Folder | (disabled info row) | dynamic title from `$modFolder` (code: `src/state/modFolderStore.ts:35`): `✓ "<name>"` (ready) / `needs re-grant` / `not set` / `unsupported`; `enabled: () => false` |
| File ▸ Mods Folder | `modsFolder.choose` | `void pickModFolder()` (code: `src/state/modFolderStore.ts:136`); hidden when status `unsupported` |
| File ▸ Mods Folder | `modsFolder.regrant` | `void requestModFolderPermission()` (:154); shown ONLY when status `needs-permission` |
| File ▸ Mods Folder | `modsFolder.forget` | ConfirmDialog then `void forgetModFolder()` (:182); shown ONLY when a folder is set. P10 refines this submenu — keep it thin |
| Edit | `edit.undo` ⌘Z | `const d = undo(); if (d) toast({title:\`Undo: ${d}\`})` — THE single flash site (kills the 4-site duplication, design §4.4); `enabled: () => $canUndo.get()`; menu `dynamicTitle` = `Undo ${$undoDescription.get()}` (code: `src/state/editorStore.ts:238` `$undoDescription`) |
| Edit | `edit.redo` ⇧⌘Z/⌘Y | same with `redo()`/`$redoDescription` (:240) |
| Edit ▸ History | provider `history` | rows from `$historyList` (code: `src/state/editorStore.ts:296`): redo rows above a disabled "→ current" row, undo rows below (v1 popover order — code: `src/ui/HistoryButton.tsx:22` `HistoryContent`); command per row `history:jump:<stepsFromCurrent>` → `jumpToHistory(steps)` (:544) + label flash |
| Edit | `edit.cut` ⌘X | **[interim]** `copySelected(); removeSelected()` composite (code: `src/state/editorStore.ts:1626`/`:1361`; both own their undo — cut = 1 copy + 1 'delete' step until P5B ships the real one-step `cutSelected`); `enabled`: has selection AND `$selectedLightIndices.get().length === 0` (lights aren't copyable yet — census: selection-transform.md §1.11; refusing beats silently destroying) |
| Edit | `edit.copy` ⌘C | `copySelected()` + count flash (string from code: `src/ui/hotkeys/registry.ts:53-56` `runCopy`); dis: no selection |
| Edit | `edit.paste` ⌘V | `pasteClipboard()` + count flash; `enabled: () => $hasClipboard.get()` (code: `src/state/editorStore.ts:204`) |
| Edit | `edit.duplicate` ⌘D | **[interim]** `duplicateSelected()` (code: `src/state/editorStore.ts:1477` — v1 in-place copies; the offset-by-nudge-step semantics are P5B's LOCKED #7); dis: no selection |
| Edit | `edit.delete` ⌫ | `removeSelected()` (v1 no-confirm parity; the §14.3 confirm policy lands P5B); dis: no selection |
| Edit | `chain.begin` ⇧⌘K | `beginActionChain()` (P2.13); keywords `"array grid radial ring repeat"` (design: system-services §3.3/§3.5); dis: no SubPart selected (`$selectedIndices.get().length === 0`) |
| Edit | `edit.scaleEverything` | `openDialog({id:'scale-everything'})` |
| Edit | `edit.settings` ⌘, | `openDialog({id:'settings'})` |
| Add | `add.subpart` | `openDialog({id:'subpart-browser'})` |
| Add | `add.builtinPart` | `openDialog({id:'part-browser'})` |
| Add | `add.connector` | interim-Build guard (below) + `addConnector()` |
| Add ▸ Collider | `add.collider:<shape>` | per `COLLIDER_SHAPES` → `addCollider(shape)`; `add.colliderFit:<shape>` → `requestColliderFit(shape)` dis: no selection (intent atom — code: `src/ui/AddButton.tsx:110-119`, `src/state/colliderStore.ts:41`) |
| Add | `add.ivaSeat` | `addIvaSeat()` |
| Add ▸ Light | `add.light:Spot/Point` | `addLight(null,{type})` + `selectLight(last)` + `revealEntity('light', id)` — port verbatim (code: `src/ui/AddButton.tsx:130-140`) |
| Add ▸ Kitten | `add.kitten:<kind>` | `addKitten(kind)` |
| Add | `add.primitiveMesh` | `openDialog({id:'create-mesh'})` |
| Add | `add.importModel` | `openImportModel()` (code: `src/state/customAssetStore.ts:181` — P8 migrates to a dialog id) |
| Add ▸ Custom Mesh Instances | provider `customMeshInstances` | rows from `$part.get().customMeshes` filtered `meshKind(m) !== 'kitten'` (code: `src/ui/AddButton.tsx:45`); row command `add.customMesh:<subPartId>` → `addSubPart(subPartId)`; submenu HIDDEN when empty (capability-dependent items may hide — foundation §3) |
| Add | `add.uploadTexture` / `add.newMaterial` | `openDialog({id:'upload-texture'/'material'})` |
| Add ▸ Make Kitten Mesh | `add.kittenMesh:<kind>` | `void makeKittenMeshPart(kind).catch(…)` (code: `src/ui/AddButton.tsx:156-161`) |
| Add | `add.defineEngine` | `setInterimMode('engine')` — v1 `enterEngineMode()` semantics (code: `src/ui/AddButton.tsx:70`); P4 re-points to the mode-jump payload |
| Select | `select.all` ⌘A* | `selectAllEntities()` (P2.04) |
| Select | `select.none` ⌥⌘A* | `clearSelection()` (code: `src/state/editorStore.ts:2013`) |
| Select | `select.invert` ⇧⌘I* | `invertSelection()` (P2.04) |
| Select | `select.activeLayer` | `selectLayerEntities($activeLayerId.get())` (code: `src/state/editorStore.ts:3927`/`:210`) |
| Select ▸ By Layer | provider `layers.select` | rows from `$layerSummaries` (code: `src/state/selectors.ts:174`); `layer:select:<id>` → `selectLayerEntities(id)` |
| Select | `tool.marquee` B | **[stub]** — marquee is P5A; tooltip "Box select arrives with the Build-mode rework" |
| View | `view.frameSelection` F / `view.resetCamera` | **[stub]** — camera commands land P4 (phase map); tooltip "arrives with the mode machine" |
| View ▸ Camera Snap | `view.cameraSnap:<dir>` | `snapCamera(dir)` for the 6 dirs (code: `src/state/viewStore.ts:61`) **[interim** — orbits the ORIGIN as v1; selection-centroid snap is P4/P5B**]** |
| View ▸ Grids | `view.grid:y/z/x` ✓ | `setGrid(axis, {enabled: !$grids.get()[axis].enabled})` (code: `src/state/viewStore.ts:27-33`); labels **Floor (XZ)** = axis `y`, **XY** = axis `z`, **YZ** = axis `x` (plane ↔ normal); `checked` reads `$grids` |
| View ▸ Grids | `view.gridSettings` | `openDialog({id:'settings'})` (spacing now lives there — P2.07) |
| View | `view.hideInterior` ✓ | `setHideInterior(!$hideInterior.get())` (code: `src/state/viewStore.ts:48-50`) |
| View ▸ Environment | `view.environment:<preset>` ◉ | `setLighting({...})` per `ENVIRONMENT_PRESETS` (code: `src/state/lightingStore.ts:12`/`:55`) — port the exact field writes from the v1 Environment select in `src/ui/ViewButton.tsx` §Lighting (`:190`); `checked` compares `$lighting` |
| View | `view.skyBackground` ✓ | port the v1 "Show sky background" switch write + its disabled-for-Studio predicate from ViewButton §Lighting |
| View | `view.sceneLighting` | `openDialog({id:'settings'})` (deep-link params `{tab:'scene'}` — accepted-and-ignored until P9) |
| View ▸ Light Coverage | `view.lightCoverage:<sel/all/off>` ◉ | port the v1 "Light coverage" select writes from ViewButton §Visibility (`:111`) via `setLightSettings` (code: `src/state/settingsStore.ts:125-130` `lightSettings` merge-read gotcha — read through the merge helper, never raw) |
| View | `view.livePreview` ✓ | port the v1 "Preview lighting" switch write; the over-cap warning becomes a status advisory in P3.13 |
| View ▸ Measurement Overlays | `view.bbox` ✓ · `view.boundsMode:<world/oriented>` ◉ · `view.perMesh` ✓ · `view.meshDistance` ✓ | `setMeasurementSettings({showSelectionBounds/boundsMode/showPerMesh/showMeshDistance})` (verified fields — code: `src/ui/MeasureButton.tsx:68-105`) |
| View ▸ Units | `view.unit:<m/cm/mm>` ◉ | `setMeasurementSettings({unit})` |
| View | `view.fpsCounter` ✓ | `setShowFpsCounter(!$showFpsCounter.get())` (code: `src/state/settingsStore.ts:292`) |
| View | `view.displayFilters` / `view.motionTrails` | **[stub]** — Build (P5B) / Animation (P11) area additions per FINAL_DESIGN_INDEX; visible-disabled |
| Tools | `tool.measure` M* | **[interim]** `setMeasureTool($measureTool.get() === 'point' ? 'none' : 'point')` (code: `src/state/measurementStore.ts:136`/`:78` — v1 toggle; the `$activeTool` slot + status guidance land P4/P5B) |
| Tools | `tools.addRefLine` | port the v1 Measure-popover "Add reference line" press handler verbatim (code: `src/ui/MeasureButton.tsx:109-118` — `addReferenceLine()` at `src/state/measurementStore.ts:149` + whatever activation it performs) |
| Tools ▸ Add Reference Container | `tools.addContainer:<rect/cylinder/sphere>` | port the v1 container add handlers (`addContainer(shape)`, code: `src/state/containerStore.ts:102` + activation as in MeasureButton) — menu labels Box/Cylinder/Sphere |
| Tools | `tools.coverageCheck` | `requestCoverageCheck()` (code: `src/state/colliderStore.ts:89`); dis: `$part.get().colliders.length === 0` |
| Tools ▸ Sit in Seat | provider `seats` | rows "Seat 1"…N from `$part.get().ivaSeats`; `seat:sit:<id>` → `enterSeatView(id); selectIvaSeat(index)` (v1 pairing — code: `src/ui/SeatViewBar.tsx:32-38` `go` and `src/ui/AssetsList.tsx:705`); plus trailing `seat.exit` "Exit Seat View" dis: `$seatView.get() === null` → `exitSeatView()` (code: `src/state/ivaStore.ts:58-67`) |
| Tools | providers `aids.measurements` / `aids.containers` | **[INTERIM, not in the authoritative tree]**: submenus "Measurements ▸" / "Containers ▸" listing each aid (name/ordinal) → `setActiveMeasurement(id)` / `setActiveContainer(id)` (opens the still-alive floating editors), plus the warn-precision ✓ toggle ported from the Measure popover (`$containerSettings`, code: `src/state/containerStore.ts:70`). This keeps the aid LISTS reachable after MeasureButton dies (RULE ZERO) until the Outliner Aids section (P5A) replaces them — P5A deletes these two providers. Mark both with `// INTERIM until P5A` comments |
| Window | `window.toggleLeft` ⌥[* / `window.toggleRight` ⌥]* ✓ | `toggleSidebar('left'/'right')` (P0.09 layoutStore); `checked` = !collapsed |
| Window | `window.timeline` | **[stub]** (Animation dock — P11) |
| Window | `window.toolbar` | **[stub]** (Tool bar float — P5B; will drive `layoutStore.floatHidden`) |
| Window | `window.resetLayout` | `resetLayout()` (P0.09) |
| Window | `window.assetManager` ⇧⌘A | `openDialog({id:'custom-assets'})` **[interim** — the real Asset Manager replaces the guts in P8 under the same command**]** |
| Window | `window.notifications` | **[stub]** — P3.05 wires it to the notification center |
| Help | `palette.open` ⌘K | `openPalette()` |
| Help | `help.shortcuts` ? | `openDialog({id:'help'})` |
| Help | `help.about` | `openDialog({id:'about'})` |
| Help | `help.github` | `window.open(<GitHub URL>, '_blank')` — reuse the exact URL from `src/ui/AboutDialog.tsx` (verify at implementation) |
| (modes) | `mode.build/animation/data/engine/surface` | `setInterimMode(id)` (P2.03); data/surface `enabled: () => false`; keys `1–5` are P4's |
| (no menu) | `noop.autosaveFlash` ⌘S | `toast({title: 'Autosaved ✓'})` — DCC reassurance (design: foundation §3 File footnote); binding added in P2.12 |

`*` = final chord is P4's scoped-registry work; the command exists now, the chord chip
appears only if P2.12 binds it (⌘-chords yes; bare letters NO — see P2.12).

**CANONICALITY (binding for all later phases)**: the command ids in this table and the
module layout `src/ui/commands/*.ts` are CANONICAL. In particular: Deselect is
`select.none` (NOT `select.deselect`), Select-in-active-layer is `select.activeLayer`
(NOT `select.allInActiveLayer`), Export to KSA is `file.exportKsa` (NOT `export.ksa`),
Asset Manager is `window.assetManager` (NOT `assets.openManager`). Later phases RE-POINT
a command's `run`/`enabled`/`checked` (P2.01's `registerCommand` throws on duplicate id)
and never create a parallel `src/commands/` tree.

**Interim-Build guard (S27 precursor)**: every `add.*` ENTITY command (connector, collider,
seat, light, kitten, custom-mesh instance — not the dialogs) first runs
`if ($interimMode.get() !== 'build') setInterimMode('build')` so the result is visible in
the sidebar that can show it. P4 replaces this with the real S27 auto-switch.

**Dynamic provider registrations** (`providers.ts`): `history`, `layers.select`,
`layers.activate` (palette-only rows "Activate layer: X" → `setActiveLayer(id)`, code:
`src/state/editorStore.ts:3918`), `seats`, `customMeshInstances`, `projects` (palette-only
"Open project: X" → `loadProject(name)` from `listProjects()`, code:
`src/state/projectStore.ts:312-347`), `aids.measurements`, `aids.containers`. Providers
must be cheap (called on menu open / palette keystroke — design: foundation §4).

`menuSpec.test.ts`: (1) every `commandId`/`providerId` referenced by `MENU_SPEC` resolves
in commandStore after importing `src/ui/commands/index.ts`; (2) command ids are unique;
(3) the eight top-level menus are exactly `File Edit Add Select View Tools Window Help` in
order; (4) transcription guard — assert the LABEL LIST of each menu equals an inline
expected array (hand-copied from FINAL_DESIGN_INDEX + the documented interim/stub items,
so drift from the authoritative tree fails a test); (5) every `[stub]` command's `enabled()`
returns false.
**Verify**: `pnpm test`; app unchanged (spec not rendered yet).

---

#### P2.12 — v1 hotkey registry: rebinds + new global chords + command delegation

**Goal**: ⌘K → palette (LOCKED), ⇧⌘K → chain, new ⌘-chords; every binding's `run`
delegates to commandStore so labels/flashes are built once; HelpDialog stays truthful
automatically (census: ui-kit-hotkeys.md §1.3 — `HOTKEY_GROUPS` drives Help).
**Files**:
- Modify `src/ui/hotkeys/registry.ts`
- Create `src/ui/commands/chords.ts`
**Depends on**: P2.09.
**Spec**:
1. Rename binding ids to their command ids and delegate: `undo`→`edit.undo`,
   `redo`→`edit.redo`, `copy`→`edit.copy`, `paste`→`edit.paste`, `delete`→`edit.delete`,
   `action-chain`→`chain.begin`, `help`→`help.shortcuts`, `exit-seat-view`→`seat.exit`
   (code: `src/ui/hotkeys/registry.ts:68-209` — the binding list). Each `run` becomes
   `runCommand('<id>')`; DELETE the local `runUndo/runRedo/runCopy/runPaste` wrappers
   (code: `src/ui/hotkeys/registry.ts:45-60`) — their flash strings moved into the
   commands (P2.09). Keep every `options` object EXACTLY (`?` useKey/ignoreModifiers;
   seat-Esc `preventDefault: false` — the Esc-ladder rung-8 contract).
2. `chain.begin` binding: `keys: 'mod+shift+k'` (was `mod+k` — code:
   `src/ui/hotkeys/registry.ts:162-167` `action-chain`), chords `['mod','shift','K']`.
3. NEW bindings (all in a new "Dialogs & app" group so Help groups them sensibly):
   `palette.open` `mod+k` · `file.projects` `mod+o` · `file.exportKsa` `mod+e` ·
   `edit.settings` `mod+comma` · `window.assetManager` `mod+shift+a` ·
   `edit.duplicate` `mod+d` · `edit.cut` `mod+x` · `noop.autosaveFlash` `mod+s`.
   All with the shared defaults (preventDefault + typing guard — `isTypingInField` stays
   VERBATIM, code: `src/ui/hotkeys/GlobalHotkeys.tsx:34-41`). ⌘O/⌘S/⌘D/⌘E must
   preventDefault (browser defaults) — the shared default already does.
   **Do NOT add** bare-letter/digit keys (`1–5`, `T`, `B`, `M`, `F`, `[`,`]`, ⌘A-family,
   `⌥[`/`⌥]`): those are scope-sensitive and land with the scoped registry (P4; design:
   system-services §4.4 — the C5 "never fire behind a dialog" fix needs scopes).
4. `src/ui/commands/chords.ts`: `chordsFor(commandId): string[][] | null` — scans
   `HOTKEY_GROUPS` for `binding.id === commandId`, returns its `chords` (normalized to
   `string[][]`; the registry's `chords` field today is a display-token array — adapt
   as found). Menu chips, palette rows and (later) status Kbd hints all use this one
   lookup (Law 4). P4 swaps its implementation for registry v2's; keep the signature.
**Verify**: ⌘K opens the palette once P2.14 lands (until then it opens nothing — runCommand
on `palette.open` sets `$paletteOpen`, harmless); ⇧⌘K toggles/starts a chain over a SubPart
selection with the v1 guard toasts (code: `src/ui/chain/openChainPalette.ts`); ⌘Z/⇧⌘Z flash
labels; `?` Help shows the NEW chord list including ⌘K "Search commands" and ⇧⌘K chain
(registry-driven regeneration — no Help edits needed); typing in any text field suppresses
all of them; ⌘S flashes "Autosaved ✓" as a toast.

---

#### P2.13 — `beginActionChain()` with the discard-confirm

**Goal**: The chain command's v2 semantics: never silently cancel a session with steps
(design: system-services §3.5; kills chains-misc "⌘K silently cancels a 12-step session").
**Files**:
- Modify `src/ui/chain/openChainPalette.ts`
- Modify `src/ui/shell/DialogRoot.tsx` (host the confirm)
- Modify `src/state/dialogStore.ts` (id already reserved)
**Depends on**: P2.02, P2.09.
**Spec**:
- Add `beginActionChain()` to `openChainPalette.ts` alongside the kept-for-now
  `toggleChainPalette` (still used by SelectionToolbar's Chain button until P5B):
  1. If `$chainSession.get()` is null → run the existing guard+open body (SubPart seeds
     only → warning toast "Select SubParts to chain"; locked layer → "Selection is on a
     locked layer"; then `openChain(seedIds)` — reuse the existing code verbatim, code:
     `src/ui/chain/openChainPalette.ts` `toggleChainPalette` — refactor the guarded-open
     into a shared private `tryOpenChain()`).
  2. If a session exists with `session.ops.length === 0` → `closeChain()` then
     `tryOpenChain()` (silent replace — design §3.5).
  3. If `session.ops.length >= 1` → `openDialog({id:'chain-discard-confirm',
     params:{steps: session.ops.length}})`.
  (Session shape: `$chainSession` at code: `src/state/chainStore.ts:119`; read the
  `ChainSession` interface there for the ops field name — the op mutators
  `addChainOp/removeChainOp` at `:367-405` confirm ops live on the session.)
- DialogRoot hosts a `ConfirmDialog` (kit) for `'chain-discard-confirm'`: title
  `Discard chain (${steps} steps)?`, confirmLabel "Discard", danger; onConfirm →
  `closeChain(); tryOpenChain(); closeDialog()`. ConfirmDialog is blessed here (top-level
  confirm — design: system-services §7.5). The chain session itself is never undoable
  (unchanged); Apply's one-undo-step contract untouched.
- Note: mode-switch `conflictsWithChain` prompting (design §3.5) needs modeStore — P4 adds
  it; nothing to do here.
**Verify**: with a 2-step session open, ⇧⌘K → confirm appears; Cancel keeps the session
intact (steps + search text preserved — non-modality); Discard opens a fresh session over
the current selection. With an empty session, ⇧⌘K silently re-seeds. Esc inside the chain
window still cancels per v1 (its own hotkey, untouched — code:
`src/ui/chain/ChainPalette.tsx:68-75`).

---

#### P2.10 — kit `MenuBar` wrapper + menu density (deferred §7.9 items)

**Goal**: The horizontal menubar primitive (hover-slide across open menus) and the
menu-density/separator kit debts that were explicitly deferred out of P0 (design:
foundation §3 "Built from react-aria MenuTrigger/Menu via a new kit MenuBar wrapper";
design-system-services §7.2 MenuItem row, §7.9 separator fix).
**Files**:
- Create `src/ui/kit/MenuBar.tsx`
- Modify `src/ui/kit/Menu.tsx`
- Modify `src/ui/kit/index.ts` (exports)
**Depends on**: P0.03 (xs tier).
**Spec**:
1. `MenuBar` kit component: renders a row of `MenuTrigger`s from a prop
   `menus: {id, label, renderMenu(): ReactNode}[]`.
   - Triggers are `xs`-tier ghost buttons (`h-6 px-2 text-xs`, `--bar-py` row padding),
     `cursor-default`.
   - **Hover-slide**: local state `openId: string | null`; each MenuTrigger is controlled
     (`isOpen={openId === id}`, `onOpenChange`); trigger `onHoverStart` sets `openId` to
     itself **only when some menu is already open** (classic menubar behavior). Click
     toggles. Closing via react-aria (Esc/outside click/selection) clears `openId`.
   - Menus re-render their items on each open (enabled/checked predicates re-evaluate —
     design: foundation §4). Achieve this by constructing menu children inside
     `renderMenu()` invoked per open, not cached elements.
2. `MenuItem` density: add a `density?: 'default' | 'dense'` variant to the `menuItem` tv
   (code: `src/ui/kit/Menu.tsx:16-25` `menuItem` — current `px-2 py-1.5 text-sm`); `dense`
   = `py-(--density-row-py) text-xs`. Menubar menus pass dense; existing call sites
   unchanged (additive, like P0.03).
3. `MenuSeparator` spacing fix under dense lists (the FEATURE_TODOS "separators render
   weird" item — design: system-services §7.9): give the kit `MenuSeparator` explicit
   `my-1 h-px bg-border` styling verified against a dense menu.
4. Also export a `MenuShortcut` chip helper: right-aligned `Kbd` row rendered from
   `chordsFor(commandId)` tokens via `keyLabel` (kit `Kbd`/`keyLabel` — P0.04).
**Verify**: `pnpm typecheck`; scratch-mount a two-menu MenuBar: click opens, hovering the
second trigger slides the open menu across, Esc closes, separators/density correct;
remove scratch.

---

#### P2.11 — Menubar cut-over: render MenuSpec, delete the v1 toolbar cluster

**Goal**: The real menubar replaces `EditorToolbar`; the trigger-button era ends (design:
foundation §3 layout line; §17 step 2; census: shell-layout.md §1.1 — every cluster must
re-home).
**Files**:
- Modify `src/ui/shell/MenuBar.tsx` (placeholder → real)
- Create `src/ui/menu/MenuSpecMenu.tsx` (MenuEntry[] → kit Menu children renderer)
- Create `src/ui/shell/ModeSwitcher.tsx`
- Modify `src/app.tsx` (remove the EditorToolbar float wrapper)
- Delete `src/ui/Toolbar.tsx`, `src/ui/AddButton.tsx`, `src/ui/ViewButton.tsx`,
  `src/ui/MeasureButton.tsx`, `src/ui/HistoryButton.tsx`, `src/ui/SettingsButton.tsx`,
  `src/ui/ProjectButton.tsx`
- Delete `src/ui/ExportButton.tsx`/`src/ui/PartDataButton.tsx` (trigger files only —
  their dialogs moved to `src/ui/ExportDialog.tsx`/`src/ui/PartDataDialog.tsx` in P2.07,
  which SURVIVE here; nothing imports the triggers after Toolbar dies — verify then delete)
- Modify `src/ui/kit/zIndexLiterals.test.ts` (allowlist shrink if any deleted file listed)
**Depends on**: P2.09, P2.10, P2.12, P2.13.
**Spec**:
1. **`MenuSpecMenu`**: recursive renderer MenuEntry[] → kit `Menu` children:
   - `command` → `MenuItem` (dense) with `dynamicTitle?.() ?? command.title`, trailing
     `MenuShortcut` from `chordsFor`, `isDisabled` off `enabled?.()`, `onAction →
     runCommand(id)`. Disabled items VISIBLE with tooltip reasons where the command
     carries one (stub table).
   - `checkbox`/`radio` → MenuItem with leading ✓/◉ glyph column driven by `checked?.()`
     (kit Menu already has a check column pattern — code: `src/ui/kit/Menu.tsx` selection
     check; use the simple glyph approach, selectionMode stays 'none').
   - `submenu` → `SubmenuTrigger` + nested Menu (pattern: code:
     `src/ui/AddButton.tsx:99-121` collider submenu).
   - `provider` → `providerCommands(id)` mapped to MenuItems at render time (menus are
     constructed per open — P2.10).
2. **`MenuBar.tsx`** (final layout — design: foundation §3):
   `[8 menus] ··center·· [ModeSwitcher] ··right·· [project chip ▾] [↶] [↷] [⌘K]`.
   - Left: kit `MenuBar` fed from `MENU_SPEC` via MenuSpecMenu.
   - Center: `ModeSwitcher` — segmented `xs` ToggleButtonGroup over `INTERIM_MODES`
     (P2.03): icons + labels (labels drop below ~1100px via a matchMedia hook or CSS),
     `isSelected` from `$interimMode`, select → `runCommand('mode.<id>')`; Data/Surface
     disabled with tooltip "Arrives with the Data/Surface mode". Attention dots: skip
     (engine/animation dot data arrives with their phases).
   - Right cluster: project chip (`$projectName` truncated 20ch, click →
     `runCommand('file.projects')`), compact ↶ ↷ `xs` iconOnly buttons (disabled off
     `$canUndo/$canRedo` — code: `src/state/editorStore.ts:234-236`; tooltip =
     `$undoDescription`/`$redoDescription`; run `edit.undo`/`edit.redo`), and a `⌘K` icon
     button → `openPalette()`. NOTHING else (no burger — S12).
   - **<900px collapse**: when `matchMedia('(max-width: 899px)')` matches (and not phone),
     replace the eight triggers with one `☰ Menu` trigger opening the MenuSheet drill-down
     (component from P2.15 — build MenuSheet first if implementing strictly in order;
     alternatively land this bullet in P2.15 — either way it exists by phase end).
3. **Deletions**: remove the EditorToolbar float wrapper from app.tsx (per P1.02 it wraps
   `<EditorToolbar />` inside the canvas cell); delete the seven files. Check each for
   stragglers first: `grep -rn "EditorToolbar\|AddButton\|ViewButton\|MeasureButton\|HistoryButton\|SettingsButton\|ProjectButton\|PartDataButton\|ExportButton" src/` —
   expected remaining importers to fix: `MobileTopBar.tsx` (dies P2.15 — keep it compiling
   by pointing its remaining items at `runCommand`/`openDialog`), `SettingsDialog.tsx`
   (moved content — must not import the dead file), DialogRoot (imports the extracted
   dialog components, not the buttons). **Accepted transient**: between this task and
   P2.15, phones lose the View/Measure popover TOGGLES (their sheet-variant components die
   here); the Settings numerics stay reachable (P2.07) and every toggle returns via the
   MenuSheet in P2.15 — do not rebuild interim phone toggles.
4. The undo/redo toast strings now exist ONLY in `edit.undo`/`edit.redo` (the four v1
   sites die with Toolbar.tsx + MobileTopBar.tsx + HistoryButton.tsx + the registry
   wrappers — design §4.4).
**Verify**: phase-verification sweep items 2 and 5. Specifically: Add ▸ every entry lands
its entity/dialog; View toggles flip live (grids, hide interior, environment, FPS);
Tools ▸ Sit in Seat lists seats and enters seat view; Edit ▸ History jumps multi-step with
flash; project chip opens Projects; Scale Everything opens from Edit. No console errors on
menu-open spam. `grep -rn "from './Toolbar'\|ProjectButton\|AddButton" src/` → only
MobileTopBar remnants (P2.15).

---

#### P2.14 — ⌘K Command Palette + fuzzyMatch

**Goal**: The LOCKED palette on the same registry (design: system-services §3 whole
section; foundation §11.3).
**Files**:
- Create `src/ui/fuzzyMatch.ts`
- Create `src/ui/fuzzyMatch.test.ts`
- Create `src/ui/palette/CommandPalette.tsx`
- Modify `src/app.tsx` (mount once, desktop + phone)
**Depends on**: P2.01, P2.09, P2.12.
**Spec**:
1. **`fuzzyMatch.ts`** (design §3.3, verbatim scoring): subsequence matcher
   `fuzzyMatch(query, target): {score, ranges: [number, number][]} | null`. Scoring: +3
   word-boundary hit, +2 consecutive run, +1 otherwise; ×1.5 prefix bonus; normalize by
   target length; case-insensitive; empty query → null (callers handle empty state).
   This util later upgrades every sidebar/browser search (foundation §8) — keep it
   dependency-free. **This module is the ONE fuzzy matcher**: P5A.11 EXTENDS this same
   file with boolean adapters (`fuzzyFind`/`fuzzyAny`) for list filtering — keep the
   scored `fuzzyMatch` signature stable and do not rename the file. Tests: word-boundary
   beats scattered; prefix beats infix; consecutive beats gaps; `ranges` cover the matched
   chars; non-subsequence → null; ties break alphabetically at the CALLER (sort contract
   documented).
2. **`CommandPalette`**: overlay dialog, S variant anchored top-third (`max-w-lg`, top
   ~15vh — extend the kit Modal with a `palette` placement or wrap `center` with an outer
   alignment div; do NOT add a z literal — kit Modal already owns `z.overlay`); phone:
   fullscreen sheet (kit `cover`). Open state `$paletteOpen`; also opened by Help menu and
   the menubar ⌘K icon (both already run `palette.open`).
   - Search input pinned top (autofocus). **Input keeps DOM focus; the list uses virtual
     focus** — ↑/↓ move a `selectedIndex` (wraps), typing always edits the field. Do not
     use a react-aria Autocomplete/listbox with real focus (that's the virtual-focus trap
     the typing guard exists for — census: ui-kit-hotkeys.md §1.3; keep it a plain
     controlled list with `aria-activedescendant`).
   - Rows: title with matched chars highlighted (`ranges`), subtitle `menuPath` or
     provider group, trailing chord chips via `chordsFor(commandId)`. Disabled commands
     grayed; running one = no-op flash (brief row shake or subtitle "— unavailable";
     cheap reasons appended when the command supplies one later — no reason API yet).
   - Data: `allCommands() ∪ allDynamicCommands()`, matched against
     `title + ' ' + (menuPath ?? '') + ' ' + (keywords ?? '')`, sorted by score desc then
     title. Providers re-evaluated per keystroke (they're cheap — P2.09).
   - **Empty query** (design §3.4): "Recent" section — `$paletteRecents` ids resolved
     against the registry (unresolvable dynamic ids silently skipped) — then the five
     `mode.*` commands. Nothing else.
   - **Enter** = `runCommand` + `recordRecent` + close. **⌘Enter** = run + keep open,
     ONLY for commands with `keepOpen` (set it on the `add.*` entity commands and
     `layer:activate:*` in P2.09 — supports add-several). Esc closes (ladder rung 3;
     plain `onKeyDown` Escape → `closePalette()` + preventDefault — above react-aria's
     dismiss since the input has focus). Recents recorded on successful run only.
   - Phone: run-and-close only (no ⌘Enter).
   - Non-goals restated in the file header: no free-text math, no document-entity search.
3. Chain integration is free: `chain.begin` is a registered command with keywords
   (P2.09) and the discard-confirm lives in the command (P2.13) — verify it surfaces for
   the query "array".
**Verify**: `fuzzyMatch.test.ts` green. Manual: ⌘K → type "exp" → Export to KSA… with ⌘E
chip and File subtitle; Enter runs it (dialog opens, palette closed); ⌘K → empty state
shows recents (after a few runs) + 5 modes; "Activate layer" rows appear per layer and
⌘Enter keeps the palette open; disabled commands (e.g. `edit.paste` with empty clipboard)
render grayed and don't run; Esc closes; phone: fullscreen sheet.

---

#### P2.15 — Phone shell: PhoneTopBar + MenuSheet; delete MobileTopBar

**Goal**: The phone runs from the same MenuSpec — zero parallel menu wiring (design:
foundation §12 PhoneTopBar/MenuSheet rows; census: shell-layout.md §1.2).
**Files**:
- Create `src/ui/shell/phone/PhoneTopBar.tsx`
- Create `src/ui/shell/phone/MenuSheet.tsx`
- Modify `src/ui/shell/MenuBar.tsx` (the <900px ☰ collapse reuses MenuSheet content)
- Modify `src/app.tsx` (phone branch mounts PhoneTopBar)
- Delete `src/ui/MobileTopBar.tsx`
**Depends on**: P2.11, P2.14 (palette exists for parity), P1.05 (`Sheet`).
**Spec**:
1. **`MenuSheet`**: a 92-detent kit `Sheet` hosting a drill-down list rendered from
   `MENU_SPEC`: level 0 = the eight menu labels; tapping pushes that menu's entries
   (`command` rows with chord chips + disabled styling, `checkbox`/`radio` rows with
   glyphs, `submenu` pushes deeper, `provider` rows resolved on push); header shows
   `‹ Back · <label>` when depth > 0 (local `useState` stack — this is sheet-page
   navigation, not DialogViewStack). Row tap = `runCommand(id)` + close the sheet
   (except `checkbox`/`radio` rows: run and KEEP the sheet open, re-evaluating checked —
   matches menu-toggle ergonomics). All rows `sm` size (touch targets — design §1.2).
2. **`PhoneTopBar`**: one slim row, in-flow first flex child (P1.04 slot):
   `☰` (opens MenuSheet) · interim mode name (`$interimMode` label) · project chip
   (truncated; tap → `runCommand('file.projects')`) · ↶ ↷ (`edit.undo`/`edit.redo`,
   disabled states + flash identical to desktop).
3. Delete `MobileTopBar.tsx`; its ☰ items are all reachable in MenuSheet (Part Data →
   the `part-data` dialog stays reachable via... **NOTE**: Part Data has no menubar item
   in the v2 tree (Data mode replaces it, P6). INTERIM: add a `[interim]` MenuSpec entry
   `Part Data…` (`data.partData` → `openDialog({id:'part-data'})`) at the bottom of the
   **Edit** menu? NO — do not invent tree placement. Instead register `data.partData` as a
   PALETTE-ONLY command (no menuPath, title "Part Data…", keywords "gamedata tanks mass")
   AND keep the v1 sidebar entry points (AssetsList row "SubPart Data", AssetsToolbar) —
   Part Data's primary v1 entry was the toolbar button; parity demands a discoverable
   home: put the palette-only command AND note it in P2.16's docs update. P6 gives it the
   real home (Data mode). Same for nothing else — audit MobileTopBar's ☰ list (code:
   `src/ui/MobileTopBar.tsx:100-113`): Part Data (palette-only, above), Export ✓ File
   menu, View ✓ View menu + Settings, Measure ✓ Tools/View menus, Scale ✓ Edit, History ✓
   Edit ▸ History, Settings ✓ Edit, Shortcuts ✓ Help, About ✓ Help, Reset ✓ Settings
   danger zone.
4. The <900px desktop collapse (P2.11 item 2) renders the SAME drill-down content in a
   popover from the single ☰ trigger (share the level-stack component between Sheet and
   Popover hosts).
**Verify**: phone sweep (phase verification item 3): every ☰ item reachable ≤2 taps +
back navigation; View toggles re-render checked state in place; undo/redo flash; Part
Data reachable from ⌘K palette on desktop and MenuSheet-less phone? — palette IS on phone
(fullscreen sheet; verify "Part Data" finds it). `grep -rn "MobileTopBar" src/` → none.

---

#### P2.16 — Phase 2 docs sync

**Goal**: Docs stop describing the dead toolbar and the old ⌘K binding (AGENTS.md doc-sync
mandate).
**Files**:
- Modify `docs/action-chains.md`
- Modify `docs/projects.md`
- Modify `docs/state-persistence.md`
- Modify any other `docs/*.md` a grep turns up
**Depends on**: P2.11, P2.15.
**Spec**:
- `docs/action-chains.md`: the gesture table row "`mod+K`, or the Chain button…" (code:
  `docs/action-chains.md:179`) → `⇧⌘K` (`chain.begin` command; also Edit ▸ Begin Action
  Chain… and the ⌘K **palette** entry), plus one sentence on the new discard-confirm
  (session with ≥1 step is never silently cancelled; empty session re-seeds silently).
  ⌘K now opens the command palette. Keep the Escape-interplay paragraph (unchanged
  behavior).
- `docs/projects.md`: replace mentions of `ProjectButton`/toolbar popover (grep
  `ProjectButton\|toolbar`) with the menubar project chip + File menu + `'projects'`
  dialog; note rename is a small dialog with v1 semantics (P9 upgrades).
- `docs/state-persistence.md`: add `flexo:paletteRecents` to the preference-key list.
- Sweep: `grep -rn "Toolbar\|View popover\|Measure popover\|SettingsButton\|MobileTopBar\|HistoryButton\|mod+K" docs/*.md`
  and fix each stale sentence (describe menubar/commands/palette). Do NOT write new
  chapters — the v2 shell gets consolidated docs in P12.
**Verify**: `pnpm fmt`; re-run the grep — remaining hits are intentional (e.g. historical
notes) and listed in the commit message.

---

## Phase 3 — Status bar + notification center

**Design sources**: foundation.md §5 (segments, routing table, center), §1.2/§1.3 (tokens,
z — toast layer deletion), §13 (statusStore/notificationStore/modifierStore rows);
design-system-services.md §1 (status bar final spec: §1.0–1.8), §2 (notifications:
§2.1–2.5), §9 (store/boot summary); FINAL_DESIGN_INDEX (parity assertion).
**Census sources**: ui-kit-hotkeys.md §1.4 (toast system + the ~44-site census), §4 pains
3/4/6/12; selection-transform.md §1.10 (TransformHud), §1.14 (MeasurementInfo);
viewport-scene-view.md §1.9 (SeatViewBar), §1.13 (WorkspaceLoadProgress, FPS);
shell-layout.md §1.14, §2 (surface map).

**Entry state**: Phase 2 complete. `src/ui/status/StatusBar.tsx` is the empty P1 shell;
toasts still render via `GlobalToastRegion` (bottom-right, z-100); TransformHud /
MeasurementInfo / SeatViewBar / WorkspaceLoadProgress / ImportReportCard float in the
canvas cell; `$inspectorMode` still drives the interim mode adapter (P2.03).

**Exit state**: The status bar is real: mode chip · layer chip · tool segment · selection
readout · message channel · progress · advisories · modifier hints · rotate/nudge chips ·
FPS · bell — all `xs`/`text-xs` in one 22px row. `toast()` is a facade routing into
statusStore/notificationStore per the severity table; the notification center popover
works (unread badge, sticky rows, actions, rich bodies). DELETED: `src/ui/kit/Toast.tsx`
(+ region mount + z-100 layer), `TransformHud.tsx`, `MeasurementInfo.tsx`,
`SeatViewBar.tsx`, `WorkspaceLoadProgress` (PreviewLoadProgress KEPT),
`ImportReportCard.tsx`. NOT touched: `BuildIdMismatchDialog` (P9 demotes it — S26),
snap chip (P5B, needs snapStore), CondensedStatusBar gets an interim phone version.
App fully runnable; all transient feedback lands in the message channel.

**Phase verification**:
1. Full workflow green (incl. new `statusStore.test.ts`, `notificationStore.test.ts`,
   `modifierStore.test.ts`, `toast.test.ts`).
2. Desktop sweep: press → the message channel flashes "Nudge axis: Y" style transients
   (overwriting, never stacking); export success flashes + lands pre-read in the center;
   force an export failure (revoke mods-folder permission) → red status + sticky unread
   entry with full untruncated error text, copyable; bell badge counts; opening the center
   zeroes it; rotate/nudge chips cycle on click with the v1 chord tooltips; selection
   readout shows counts + W×H×D and click toggles world/oriented; seat view runs entirely
   from the tool segment (◀ ▶ ordinal ⓘ Exit·Esc); measure/exhaust/chain show tool-segment
   状态; progress bar appears during an HDR environment switch and the popover lists files.
3. Phone sweep: CondensedStatusBar strip shows mode/layer/message/bell; message tap opens
   the notification sheet.
4. On-demand render loop untouched: with FPS counter OFF, the scene renders only on
   invalidation (spot-check via devtools performance — no continuous rAF).
5. `grep -rn "z-\[100\]\|GlobalToastRegion\|TransformHud\|MeasurementInfo\|SeatViewBar\|WorkspaceLoadProgress\|ImportReportCard" src/` → zero hits.

### Task ordering

P3.01 → P3.02 → P3.03 (stores, parallel-safe) → P3.04 → P3.05 → P3.06 → P3.07 → P3.08 →
P3.09 → P3.10 → P3.11 → P3.12 → P3.13 → P3.14 → P3.15 → P3.16. The toast region survives
until P3.06 so no boundary loses feedback.

---

#### P3.01 — statusStore

**Goal**: The status-bar data model + imperative primitives (design: design-system-services
§1.3 verbatim; foundation §13 row).
**Files**:
- Create `src/state/statusStore.ts`
- Create `src/state/statusStore.test.ts`
**Depends on**: none.
**Spec**:
`src/state/statusStore.ts` — no react/three imports; imperative fns callable anywhere:

```ts
import { atom, computed } from 'nanostores';
import { $loadProgress } from './loadProgressStore';

export type Severity = 'info' | 'success' | 'warning' | 'danger';
export interface StatusAction { label: string; run(): void; disabled?: () => boolean }
export interface StatusMessage {
  text: string; severity: Severity; expiresAt: number;
  action?: StatusAction; notificationId?: string;
}
export interface ToolStatus {                          // design §1.2 segment 3
  toolId: 'measure' | 'seat-view' | 'exhaust' | 'marquee' | 'chain';
  icon: string;                                       // lucide icon name, resolved UI-side
  text: string;
  kbdHints?: string[][];
  focusSurface?: string;
}
export const STATUS_DURATION: Record<Severity, number> =
  { info: 4000, success: 4000, warning: 8000, danger: 10000 };   // §2.2 — ONE table

export const $statusMessage = atom<StatusMessage | null>(null);
export const $toolStatus = atom<ToolStatus | null>(null);
export const $fpsReport = atom<number | null>(null);
export interface Advisory { id: string; text: string; severity: 'warning'; priority: number; commandId?: string }
export const $advisories = atom<Advisory[]>([]);
export function setAdvisory(a: Advisory): void; export function clearAdvisory(id: string): void;

export function status(text: string, opts?: { severity?: Severity; action?: StatusAction; notificationId?: string }): void;
export function clearStatus(): void;
export function setToolStatus(model: ToolStatus | null): void;

// Aggregated progress: downloads ($loadProgress — code: src/state/loadProgressStore.ts:37)
// PLUS non-download jobs (archive/zip builds later — P9 consumes this):
export interface JobHandle { setProgress(done: number, total?: number): void; end(): void }
export function trackJob(label: string): JobHandle;
interface Job { id: string; label: string; loaded: number; total: number | null }
const $jobs = atom<Job[]>([]);   // module-internal — written only by trackJob handles
export interface ProgressState { active: boolean; percent: number | null; jobs: Job[] }
export const $progress = computed([$loadProgress, $jobs], aggregate);
```

- `status()` OVERWRITES unconditionally (single slot, not a queue — design §1.2 #5), arms
  ONE `setTimeout` owned by the module (cleared/re-armed on overwrite); on expiry sets
  null. `expiresAt = Date.now() + STATUS_DURATION[severity]`.
- Inline-action staleness (design §1.2 #5): `status()` does NOT know about undo; the
  CALLER builds the action. Provide a helper `undoStatusAction(): StatusAction` that
  captures the current undo depth (`$historyList.get().filter(i => i.stepsFromCurrent < 0)
  .length` — code: `src/state/editorStore.ts:296` `$historyList`) and returns
  `{label:'Undo', run: () => { undo(); }, disabled: () => depthNow() !== captured}`.
  (Adopted by the §14.3 no-confirm delete flash in P5B; exported and tested now.)
- Progress aggregate: bytes-weighted mean of determinate items; any indeterminate job with
  no determinate siblings → `percent: null` (barber-pole). Min-display 500ms is UI-side
  (P3.10) — the store is raw.
- All ephemeral; zero persistence; zero undo.
`statusStore.test.ts` (vi.useFakeTimers): overwrite replaces text + re-arms expiry (old
timer never clears the new message); expiry nulls; per-severity durations from the table;
`trackJob` lifecycle (appears in `$progress.jobs`, `end()` removes, aggregate percent math
for 2 determinate jobs); `undoStatusAction().disabled()` flips after a `pushUndo`.
**Verify**: `pnpm test`. No consumer yet.

---

#### P3.02 — notificationStore

**Goal**: Session ring buffer + read/sticky lifecycle + `notify()` (design:
design-system-services §2.4 verbatim; §2.3 semantics).
**Files**:
- Create `src/state/notificationStore.ts`
- Create `src/state/notificationStore.test.ts`
**Depends on**: none.
**Spec**:

```ts
// src/state/notificationStore.ts — no react imports; session-only (never persisted)
export interface NotificationEntry {
  id: string; severity: 'success' | 'warning' | 'danger' | 'rich';
  title: string; body?: string;
  rich?: { kind: string; payload: unknown };          // UI-side registry renders (P3.05)
  actions?: { label: string; commandId: string; params?: unknown }[];
  createdAt: number; read: boolean; sticky: boolean;
}
export type NotificationInput = Omit<NotificationEntry, 'id' | 'createdAt' | 'read' | 'sticky'>
  & { read?: boolean; sticky?: boolean };
export const $notifications = atom<NotificationEntry[]>([]);   // newest first, ring 100
export const $unreadCount = computed($notifications, ns => ns.filter(n => !n.read).length);
export function notify(input: NotificationInput): string;      // returns id
export function dismiss(id: string): void;
export function markAllRead(): void;
export function clearRead(): void;    // removes read AND non-sticky only (design §2.3)
```

- Defaults: `success` → `read: true, sticky: false` (pre-read, no badge bump — §2.2);
  `warning` → unread, non-sticky; `danger`/`rich` → unread + sticky. Explicit
  `read`/`sticky` in the input override.
- Ring: unshift; length > 100 → drop oldest (sticky included — it's a ring, notifications
  are news not data; design §2.3 "session-only ring buffer of 100").
- Actions resolve through commandStore at RENDER time (P3.05) — the store holds ids only
  (keeps `src/state/` react-free and actions re-evaluating enabled predicates).
`notificationStore.test.ts`: severity defaults table; unread count; markAllRead zeroes;
clearRead keeps sticky + unread; ring caps at 100; dismiss removes by id; notify returns
the id it stored.
**Verify**: `pnpm test`.

---

#### P3.03 — modifierStore (held keys + hover context + hint pipeline)

**Goal**: Live modifier tracking with the full edge-case spec, and the hint-provider
registry (design: design-system-services §1.4 — implement every listed edge case).
**Files**:
- Create `src/state/modifierStore.ts`
- Create `src/state/modifierStore.test.ts`
**Depends on**: none.
**Spec**:

```ts
// src/state/modifierStore.ts — no react imports
export interface HeldModifiers { alt: boolean; shift: boolean; ctrl: boolean; meta: boolean }
export const $heldModifiers = atom<HeldModifiers>({ alt:false, shift:false, ctrl:false, meta:false });
export type HoverContext = 'none' | 'viewport' | 'viewport-entity' | 'gizmo'
  | 'timeline-track' | 'timeline-key' | 'outliner-row' | 'list';
export const $hoverContext = atom<HoverContext>('none');
export function setHoverContext(ctx: HoverContext): void;

export interface ModifierHint { mod: keyof HeldModifiers; label: string; priority: number }
export interface HintContext { hover: HoverContext; hasSelection: boolean; dialogOpen: boolean }
export function registerModifierHints(id: string, fn: (ctx: HintContext) => ModifierHint[]): void;
export const $modifierHints = computed(
  [$hoverContext, $hasSelection, $openDialog], computeHints);  // sorted by priority, max handled UI-side
export function initModifierListeners(): void;  // idempotent (StrictMode-safe flag)
```

Listener contract — implement EXACTLY (design §1.4 "the edge cases, spec'd"):
- `window` capture-phase passive listeners: `keydown`, `keyup`, `pointerdown`,
  `pointermove` (rAF-throttled), `pointerup`, `wheel`. Every handler reads ONLY the
  event's modifier flags (`altKey/shiftKey/ctrlKey/metaKey` — never key identity) and
  writes the atom **only when a flag actually changed** (diff-before-set — zero React
  churn while typing/mousing).
- Mouse events are the macOS ⌘-keyup-suppression correction channel (comment this).
- `window 'blur'` + `document 'visibilitychange'`→hidden: reset all four to false. On
  focus, do NOT guess — wait for the next flagged event (hints under-show, never lie).
- Never `preventDefault` bare Alt at this layer (Windows browser menu-focus a11y).
- `initModifierListeners()` guarded by a module flag; called from `src/main.tsx` boot
  (add the call in P3.04's wiring — boot order additions per design §9).
- `$modifierHints` depends on `$hasSelection` (code: `src/state/selectors.ts:51`) and
  `$openDialog` (dialog open → `[]` — design §1.4 "No hints while a dialog is open").
  KNOWN LIMIT (comment it in code): providers registered AFTER the computed's first read
  won't surface until a dependency next changes — harmless in practice (hover context
  flips constantly), but if it ever bites, add a module `$hintProvidersNonce` atom bumped
  by `registerModifierHints` to the computed's deps; do not silently work around it.
  Note the held-state accent-brightening is a RENDER concern ($heldModifiers read by the
  segment, P3.12) — hints list itself doesn't depend on held state.
`modifierStore.test.ts` (happy-dom): dispatch `keydown` with `shiftKey: true` → atom
updates once (subscribe-count assertion for diff-before-set); `blur` resets; a registered
provider's hints appear/disappear as `$hoverContext` flips; dialog-open zeroes hints.
**Verify**: `pnpm test`.

---

#### P3.04 — StatusBar core: container, StatusChip, axisColors, mode + layer chips, message channel

**Goal**: The real status-bar frame with alignment groups and the three always-on left
segments + the center message channel (design: design-system-services §1.0–1.2 segments
1/2/5; foundation §5).
**Files**:
- Modify `src/ui/status/StatusBar.tsx` (P1 placeholder → real)
- Create `src/ui/status/StatusChip.tsx`
- Create `src/ui/status/axisColors.ts`
- Create `src/ui/status/MessageChannel.tsx`
- Modify `src/main.tsx` (call `initModifierListeners()` at boot)
**Depends on**: P3.01, P3.03, P2.03 (interim mode adapter).
**Spec**:
- **Container** (design §1.0): one row, `flex flex-none items-center border-t border-border
  bg-panel px-2 py-(--bar-py) text-xs select-none`; three groups — left `flex-none`,
  center `flex-1 min-w-0`, right `flex-none` — groups never shift when a sibling segment
  unmounts. Dividers: 1px `bg-border` verticals with `--density-gap` margins. Numbers
  `font-mono tabular-nums`. No z-index (in-flow — the toast z-100 layer is dying in P3.06).
- **`StatusChip`**: `inline-flex h-full items-center gap-1 px-1.5 text-xs cursor-default`
  + hover `bg-wash-hover` when interactive (P0.01 tokens). Interactive chips are kit `xs`
  ghost Buttons inside; passive ones plain spans.
- **`axisColors.ts`**: a RE-EXPORT, not a copy —
  `export { AXIS_COLOR_CSS as AXIS_COLOR, type AxisKey } from '../../three/axisColors';`
  The single source of truth is the EXISTING `src/three/axisColors.ts` `AXIS_COLOR_CSS`
  (`x:'#ff5468', y:'#7fd94b', z:'#4d9dff'` — its header explicitly forbids a second
  numeric copy; deliberately dependency-free, both layers may import it). Do NOT copy
  TransformHud's private map (code: `src/ui/TransformHud.tsx:20-24` `AXIS_COLOR` —
  `#ff0000/#00ff00/#0000ff` is stale v1 drift; its "matching the gizmo" comment is wrong).
  Status chips therefore render the true gizmo hues — an intended visible correction, not
  a regression. Design §1.0 names this file; the re-export satisfies it.
- **Mode chip** (segment 1): `$interimMode` icon + label; click → mini kit Menu of the
  five `mode.*` commands (checkmark on current via `checked`; Data/Surface disabled).
  Tooltip "Editing mode — 1–5 to switch" (keys land P4 — keep the tooltip, it documents
  the target UX; add "(soon)" ONLY if you must be pedantic — prefer the design text).
- **Layer chip** (segment 2): shown when `$interimMode` ∈ {build, animation}. `Layer:
  <name> ▾` truncated 14ch, from `$activeLayer` (code: `src/state/selectors.ts:200`).
  Click → kit Menu of `$layerSummaries` rows (name + count Chip + lock icon when locked;
  locked layers selectable — v1 semantics, active layer only targets adds) →
  `setActiveLayer(id)` (code: `src/state/editorStore.ts:3918`; NOT undoable — view state).
  Fixes the v1 "active layer visible nowhere" gap (design §1.2 #2).
- **MessageChannel** (segment 5, center): renders `$statusMessage`: 2px leading severity
  dot (info `bg-fg-muted`, success `bg-accent`, warning `bg-warning`, danger `bg-danger`),
  truncating text (`truncate`), optional action as an `xs` ghost Button (disabled off
  `action.disabled?.()`), 120ms opacity fade on expiry (CSS transition keyed on message
  presence). Click on the text (not the action) → opens the notification center when
  `notificationId` is set (P3.05 provides the open hook; until then no-op).
- **Empty state** (design §1.7): mode chip + layer chip + (bell from P3.05) are permanent —
  the bar never fully empties.
- Segments 3/4/6/6b/7/8/9/10/11 arrive in P3.05–P3.13; leave ordered mount slots with
  comments. **Snap chip (segment 9) is NOT built in this phase** — it needs `snapStore`
  (P5B.01); leave a `{/* segment 9: snap chip — P5B (snapStore) */}` marker.
**Verify**: `pnpm dev`: bar shows `⬚ Build │ Layer: Default ▾ │ ····` ; mode menu switches
the right sidebar (interim adapter); layer menu changes the add-target layer (add a
connector → lands on the picked layer); no layout shift when the message channel
fills/empties (imperatively `status('test')` from devtools console via a temporary window
hook or unit-drive it — remove any scratch hook).

---

#### P3.05 — Notification center + bell + rich-body registry

**Goal**: The persistent-until-read tier: bell with unread badge, the popover, action
buttons through commandStore, rich bodies (design: design-system-services §2.3; foundation
§5.2).
**Files**:
- Create `src/ui/status/NotificationBell.tsx`
- Create `src/ui/status/NotificationCenter.tsx`
- Create `src/ui/status/notificationBodies.tsx`
- Modify `src/ui/status/StatusBar.tsx` (mount bell, segment 11)
- Modify `src/ui/commands/windowCommands.ts` (wire `window.notifications`)
- Modify `src/ui/status/MessageChannel.tsx` (click-through to the center)
**Depends on**: P3.02, P3.04, P2.09.
**Spec**:
- **Bell** (segment 11): `🔔` (lucide `Bell`) `xs` icon button + unread badge from
  `$unreadCount` (caps at `9+`, hidden at 0); single 300ms scale pulse when a `rich` or
  `danger` entry arrives (subscribe, compare ids). Click → the popover. The Window ▸
  Notifications… stub command (P2.09) now opens the same popover: give the bell a
  store-driven open state (`atom<boolean>` in the component module or a tiny
  `$notificationCenterOpen` atom in notificationStore — pick the atom; the command and
  MessageChannel click both set it).
- **NotificationCenter**: kit Popover anchored to the bell (`w-96 max-h-[70vh]` scroll,
  desktop) / 92-detent Sheet (phone, `useIsPhone`). Content per the design §2.3 wireframe:
  - Header row: "Notifications" + "Clear all" (→ `clearRead()`).
  - Rows newest-first with an "unread above" divider at the first read entry: severity
    icon · title · **multi-line body, never truncated, `select-text` copyable** (mono for
    error/path-looking bodies: apply `font-mono` when the body contains `/` or `Error` —
    or simpler: always `whitespace-pre-wrap text-xs`; fixes v1 truncation, census
    ui-kit-hotkeys §1.4) · relative time (`2m`, `31m` — small helper) · action buttons ·
    hover-revealed ✕ (`dismiss(id)`).
  - **Actions**: `{label, commandId, params}` → `xs` secondary Buttons; `isDisabled` from
    the command's `enabled?.()` at render; press → `runCommand(commandId, params)` +
    close the popover.
  - **Rich bodies**: `notificationBodies.tsx` exports
    `const notificationBodies: Record<string, React.FC<{payload: unknown}>>` — UI-side
    registry (keeps state react-free — design §2.3). Rows with `rich` render
    `notificationBodies[rich.kind]` inline (unknown kind → body text fallback). Register
    kind `'import-report'` in P3.14.
  - Opening marks all read (`markAllRead()` on open-change true).
  - Empty state: bell icon + "No notifications — export results, warnings and reports
    land here."
- MessageChannel click-through: clicking a message with `notificationId` opens the center
  (scroll-to + expand of that entry: give rows `data-notification-id` and scroll into
  view on open when an id was requested).
**Verify**: unit-drive `notify()` from a test button (scratch, remove): danger entry →
badge 1 + pulse; open → badge 0, full multi-line body selectable; Clear all removes read
non-sticky only; ✕ removes sticky ones; Window ▸ Notifications… opens it; phone: sheet.

---

#### P3.06 — The `toast()` facade cut-over (delete the region + kit/Toast.tsx)

**Goal**: Every existing `toast()` call routes through statusStore/notificationStore; the
z-100 toast layer dies (design: foundation §5.1; design-system-services §2.2 routing table
+ §2.5 GlobalToastRegion absorption; knitting note 4 for the signature ruling).
**Files**:
- Create `src/ui/toast.ts`
- Create `src/ui/toast.test.ts`
- Delete `src/ui/kit/Toast.tsx`
- Modify `src/ui/kit/index.ts` (remove toast exports)
- Modify `src/main.tsx` (remove `<GlobalToastRegion />`; keep boot toasts — path change)
- Modify ALL toast importers (mechanical codemod — the verified complete list:
  `src/main.tsx`, `src/app.tsx`, `src/three/EditorScene.ts`, `src/ui/nudgeControls.ts`,
  `src/ui/rotateControls.ts`, `src/ui/ScaleEverythingDialog.tsx`,
  `src/ui/ProjectTransferDialogs.tsx`, `src/ui/ImportModelDialog.tsx`,
  `src/ui/ExportDialog.tsx` (the P2.07 extraction), `src/ui/CreateMeshDialog.tsx`,
  `src/ui/CustomTextureDialog.tsx`, `src/ui/MaterialDialog.tsx`, `src/ui/PartBrowser.tsx`,
  `src/ui/SubPartBrowser.tsx`, `src/ui/chain/ChainPalette.tsx`,
  `src/ui/chain/openChainPalette.ts`, `src/ui/hotkeys/registry.ts` (via commands after
  P2 — verify), `src/ui/commands/*.ts` (P2's flash sites) — re-grep `toast(` at
  implementation time; census counted ~44 sites, census: ui-kit-hotkeys.md §1.4)
- Modify `src/state/projectStore.ts` (autosave failure surfacing)
- Modify `src/three/EditorScene.ts` (one variant tweak)
- Modify `src/ui/kit/zIndexLiterals.test.ts` (allowlist: remove Toast.tsx)
**Depends on**: P3.04, P3.05.
**Spec**:
1. **`src/ui/toast.ts`** — module function, no react:

```ts
import { status, STATUS_DURATION } from '../state/statusStore';
import { notify } from '../state/notificationStore';
export interface ToastMessage {              // EXACT v1 shape (code: src/ui/kit/Toast.tsx:12-16)
  title: string; description?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}
export function toast(message: ToastMessage, options?: { timeout?: number }): void {
  if (import.meta.env.DEV && options?.timeout !== undefined)
    console.warn('flexo: toast timeout is ignored — one severity→duration table (see statusStore)');
  const text = message.description ? `${message.title} — ${message.description}` : message.title;
  switch (message.variant ?? 'default') {
    case 'default': status(text, { severity: 'info' }); break;
    case 'success': { const id = notify({ severity:'success', title: message.title, body: message.description }); status(text, { severity:'success', notificationId: id }); break; }
    case 'warning': { const id = notify({ severity:'warning', title: message.title, body: message.description }); status(text, { severity:'warning', notificationId: id }); break; }
    case 'danger':  { const id = notify({ severity:'danger',  title: message.title, body: message.description }); status(text, { severity:'danger',  notificationId: id }); break; }
  }
}
export { notify } from '../state/notificationStore';   // the rich/no-status path
```

   Routing = the §2.2 table exactly: default → status only (never enters the center);
   success → status + PRE-READ entry; warning → status(8s) + unread; danger →
   status(10s) + sticky unread. `timeout` ignored (dev warning kills ad-hoc timeouts —
   census pain 12).
2. **Codemod**: change every `import { … toast … } from './kit'` (and `'../ui/kit'`,
   `'../kit'`) to import `toast` from the new path (`src/ui/toast`); other kit imports on
   the same line stay on the kit. Call EXPRESSIONS unchanged everywhere except the two
   sanctioned edits below (the facade keeps the v1 signature — knitting note 4).
3. **Sanctioned call-site edits** (design §2.2, explicit):
   - `src/three/EditorScene.ts` "Nothing to aim at" (code: `src/three/EditorScene.ts:1427-1432`):
     change `variant: 'warning'` → delete the variant (default/transient) — immediate
     action feedback, warning-worded text kept.
   - `src/state/projectStore.ts` autosave catch (code: `src/state/projectStore.ts:305-307`
     `saveCurrentProject` catch → `console.warn('flexo: failed to persist project')`):
     ADD (keep the console.warn) a direct state-level call — projectStore must NOT import
     from `src/ui/`, so call `status(...)` + `notify(...)` directly from
     `../state/statusStore`/`notificationStore` (state→state import, sanctioned — the
     same pattern phase-08 uses for customAssetStore):
     `notify({severity:'danger', title:'Autosave failed', body: 'Your latest changes were not saved — storage full? ' + String(err)})`
     + matching `status(…, {severity:'danger', notificationId})`. This surfaces the v1
     silent failure (design §2.2 errors row, "newly surfaced").
4. Delete `src/ui/kit/Toast.tsx` (queue + region + z-100 — design §7.3 "the v1 z-100
   layer is deleted"); remove `<GlobalToastRegion />` from `src/main.tsx` (code:
   `src/main.tsx:80-86` render block); remove the kit barrel exports. The `ToastMessage`
   type now lives in `src/ui/toast.ts`. **On foundation §17 step 3's "delete the toast
   region last"**: "last" means last WITHIN step 3 — after every call site routes through
   the facade (items 1–3 above), which is exactly this task's ordering. P12.03 re-verifies
   the region is gone at release; it does not re-schedule the deletion.
5. Boot purge toast (code: `src/app.tsx` `consumeRemovedProjectsNotice` effect — variant
   `warning`, wording preserved) now routes automatically: 8s amber status + unread
   center entry. No call-site change (the `{ timeout: 10000 }` arg logs the dev warning —
   remove the arg while you're there; same for the browsers'/registry's explicit
   timeouts if trivially reachable, but do NOT chase all 44 sites to strip timeouts:
   the warning is the migration tool).
`toast.test.ts`: each variant's routing (status severity + center entry presence +
read/sticky flags per table); default never enters the center; description concatenation;
timeout warning fires in dev (spy console.warn).
**Verify**: phase-verification item 2's transient checks; `grep -rn "kit/Toast\|GlobalToastRegion\|toastQueue" src/` → none;
`grep -rn "z-\[100\]" src/` → none; nudge arrows spam only the single message slot.

---

#### P3.07 — Selection readout segment (absorbs MeasurementInfo)

**Goal**: Segment 4: counts by kind + live W×H×D + interactive world/oriented badge;
delete MeasurementInfo (design: design-system-services §1.2 #4 + §1.5 delta row; census:
selection-transform.md §1.14).
**Files**:
- Create `src/ui/status/SelectionReadout.tsx`
- Modify `src/ui/status/StatusBar.tsx`
- Delete `src/ui/MeasurementInfo.tsx`
- Modify `src/app.tsx` (unmount)
**Depends on**: P3.04.
**Spec**:
- Shown when selection non-empty AND `$selectionBounds` ≠ null (code:
  `src/state/measurementStore.ts:87` `$selectionBounds` — written by MeasurementLayer,
  ALWAYS computed regardless of the bbox overlay toggle; the readout does NOT obey
  `showSelectionBounds` — design §1.2 #4 explicit ruling).
- Counts by kind from the six `$selected*Indices` atoms (code:
  `src/state/editorStore.ts:119-182`): singular/plural kind names (`3 SubParts · 1
  Light`); >2 kinds → `5 items`. Dims `W×H×D` from `bounds.size` formatted with
  `formatLength(v, unit)` (code: `src/measure/format.ts:14`; unit from
  `$measurementSettings.unit`). Diagonal (v1 readout row — code:
  `src/ui/MeasurementInfo.tsx:17` diagonal calc) moves to the segment TOOLTIP (design
  §1.5 delta). Trailing badge `⬚ world` / `◇ oriented` from `bounds.mode`.
- Click (badge or dims) toggles `setMeasurementSettings({boundsMode: other})` (code:
  `src/state/measurementStore.ts:132`; persisted `flexo:measure`, same store the View ▸
  Measurement Overlays radio writes — NOT undoable, view state). This interactivity is
  NEW (v1 badge passive — design §1.5).
- Overflow: dims drop before counts (wrap the dims span in `hidden min-[...]:inline` or
  measure — simplest: `truncate` on the dims with counts `flex-none`).
- Delete `MeasurementInfo.tsx` + its app.tsx mount.
**Verify**: select 2 SubParts + a light → `2 SubParts · 1 Light │ …×…×… m ⬚`; click →
oriented badge + the 3D box mode changes (same store); View ▸ Measurement Overlays radio
and the badge stay in sync; tooltip shows the diagonal; deselect → segment unmounts, bar
doesn't shift.

---

#### P3.08 — Rotate/nudge chips (absorbs TransformHud)

**Goal**: Segment 8: two chips with click-cycle + the verbatim v1 chord-table tooltips;
delete TransformHud (design: design-system-services §1.2 #8 + §1.5; census:
selection-transform.md §1.10).
**Files**:
- Create `src/ui/status/TransformChips.tsx`
- Modify `src/ui/status/StatusBar.tsx`
- Delete `src/ui/TransformHud.tsx`
- Modify `src/app.tsx` (unmount)
**Depends on**: P3.04, P3.06.
**Spec**:
- **Rotate chip** `[↻ <pairs> 45°]`: port TransformHud's left cluster CONTENT to chip
  scale — the three pair labels with axis-tinted arrows (AxisArrow using
  `src/ui/status/axisColors.ts` + the `AXIS_ICON` map — move it into TransformChips from
  code: `src/ui/TransformHud.tsx:31-41`) + `rotateStep°`. Click →
  `changeRotateAxes()` (code: `src/ui/rotateControls.ts` `changeRotateAxes` — unchanged;
  its toast now lands in the message channel as a transient via the facade). Tooltip =
  the v1 `RotateHint` rows VERBATIM including the CURRENT `F`/`⇧F` step chords (code:
  `src/ui/TransformHud.tsx:112-127` `RotateHint` — port the `HintRow` helper too).
  **Do NOT pre-write the `[`/`]` rebind** — the rebind lands in P4 and **P5B.09 updates
  these tooltip strings** (truth-first tooltips; design §1.2 #8's "note the rebind"
  applies from then on). P5B.09 also adds the sibling `SnapChip` (segment 9) next to this
  component — leave this file cleanly extensible; do not pre-build anything snap-related.
- **Nudge chip** `[⇅ Y · 0.1 m]`: axis arrow + letter (tinted) + `formatNudgeStep(step) m`.
  Click → `changeNudgeAxis(1)` (code: `src/ui/nudgeControls.ts`). Tooltip = v1
  `NudgeHint` verbatim (code: `src/ui/TransformHud.tsx:130-151`).
- Reads `$nudgeAxis/$nudgeStep/$rotateStep/$rotateAxisOffset` (persisted, unchanged —
  code: `src/state/editorStore.ts:217-226`).
- **Visibility rule** (design §1.2 #8, the F3 fix): desktop only; shown when
  `$interimMode` ∈ {build, animation} **OR a transformable selection exists**
  (`$hasSelection` — the keys are live in engine mode too, and a keypress must never
  mutate with zero posture feedback). Interim note: with only 3 modes mapped, this means
  the chips hide in Engine mode with nothing selected — matching the design's rule.
- Delete `TransformHud.tsx` + mount. `Kbd`/`keyLabel` come from the kit (P0.04).
**Verify**: chips render in Build with nothing selected; press `R` → chip pairs re-tint
AND the message channel flashes "Rotate axes: …"; click-cycle matches `R`/`→` exactly;
tooltips list W/S A/D Q/E · R · F/⇧F and arrows/⇧-arrows tables; switch to Engine with
empty selection → chips hide; select a SubPart in Engine → chips show.

---

#### P3.09 — Tool segment + interim tool-status wiring (absorbs SeatViewBar)

**Goal**: Segment 3 driven by `$toolStatus`, with interim writers for the four v1
tool-ish sessions; SeatViewBar's controls move in and the bar dies (design:
design-system-services §1.2 #3 — per-tool contents verbatim; census:
viewport-scene-view.md §1.9).
**Files**:
- Create `src/ui/status/ToolSegment.tsx`
- Create `src/ui/status/toolStatusWiring.ts`
- Modify `src/ui/status/StatusBar.tsx`
- Delete `src/ui/SeatViewBar.tsx`
- Modify `src/app.tsx` (unmount SeatViewBar; import the wiring module once)
**Depends on**: P3.04, P3.06.
**Spec**:
1. **`toolStatusWiring.ts`** — a module of store subscriptions writing
   `setToolStatus`/`null` (interim: the owning-store-hooks pattern of design §1.2 #3
   arrives with `$activeTool` in P4; this module is the P3 stand-in and P4 refactors it):
   - `$seatView` (code: `src/state/ivaStore.ts:41`) non-null → `{toolId:'seat-view',
     icon:'Eye', text: 'Seat <i> / <N>'}`. The SEGMENT renders the interactive parts
     (below) — the model carries the ordinal only.
   - `$measureTool === 'point'` (code: `src/state/measurementStore.ts:78`) →
     `{toolId:'measure', icon:'Ruler', text:'Measure — click two points', kbdHints:[['Esc']]}`.
     (Static text; the first/second-point live instruction needs the pending-pick state
     the three layer doesn't expose yet — P5B.25 refines per its own spec. INTERIM noted.)
   - `$isExhaustPlacing` (code: `src/state/engineStore.ts:269`) →
     `{toolId:'exhaust', icon:'Flame', text: 'Exhaust: <nozzle label>'}` from
     `$activeNozzleRef`/`$activeNozzleTarget` (code: `src/state/engineStore.ts:119`/`:259` —
     render the same label the v1 engine sidebar shows; port its formatting).
   - Chain mirror: `$chainSession` non-null → the segment ALSO renders a chain chip
     (design: chain is NOT in the tool slot): `⛓ <N instances> · +M new` from `$chainEval`
     (code: `src/three/chainEval.ts` `$chainEval`, consumed exactly as the palette footer
     does — code: `src/ui/chain/ChainPalette.tsx:33` `evalState`; red error text state
     ported). Click → focus/raise the chain palette (until the FloatingWindow tenancy in
     P5B, clicking just no-ops beyond a `revealEntity`-style nudge — leave a TODO(P5B)).
   - Priority when both a tool and chain exist: tool first, chain as the compact second
     chip (`⛓ 12·+8`) — design §1.2 #3.
2. **`ToolSegment.tsx`**: renders `$toolStatus` (icon via a lucide name→component map +
   text + Kbd hints) plus per-tool inline controls:
   - **seat-view**: ◀ ▶ `xs` icon buttons cycling seats with WRAP in document order and
     re-select (port `go(delta)` verbatim from code: `src/ui/SeatViewBar.tsx:32-38` —
     `enterSeatView(next.id); selectIvaSeat(nextIndex)`); ordinal label; ⓘ tooltip with
     the honesty text VERBATIM (code: `src/ui/SeatViewBar.tsx:66-85` — "flexo draws every
     SubPart, interior or not…" both paragraphs); `Exit` button + `Esc` Kbd →
     `exitSeatView()`. The Esc registry binding is untouched (rung 8, `preventDefault:
     false` — code: `src/ui/hotkeys/registry.ts:203-209`).
   - **measure/exhaust**: text + Esc hint only (interim).
3. Delete `SeatViewBar.tsx` + its mount. Both desktop AND phone rendered the bar — phone
   seat controls move to P3.15's CondensedStatusBar tool chip (tap = Exit) + the
   Tools ▸ Sit in Seat menu; note this in the CondensedStatusBar task.
**Verify**: sit in a seat (Tools menu or seat inspector) → segment shows `Seat 1 / 2 ·
◀ ▶ · ⓘ · Exit Esc`; cycling wraps + re-selects; Esc exits; measure toggle (Tools ▸
Measure) shows the segment while armed and the tool still works in-viewport; engine
exhaust placement shows its chip; open a chain (⇧⌘K) → `⛓ N instances` mirrors the
palette footer live while nudging a seed.

---

#### P3.10 — Progress segment + popover (absorbs WorkspaceLoadProgress)

**Goal**: Segment 6: compact aggregated bar + per-file popover + `trackJob` surface;
delete WorkspaceLoadProgress, keep PreviewLoadProgress, drop the hide-while-browser-open
swap (design: design-system-services §1.2 #6 + §1.5 delta; census: shell-layout.md §1.14).
**Files**:
- Create `src/ui/status/ProgressSegment.tsx`
- Modify `src/ui/status/StatusBar.tsx`
- Modify `src/ui/LoadProgress.tsx` (delete `WorkspaceLoadProgress` ONLY — code:
  `src/ui/LoadProgress.tsx:69`; `PreviewLoadProgress` at `:83` and the shared
  `Panel`/`FileBar` stay for the catalog browsers)
- Modify `src/app.tsx` (unmount)
- Modify `src/ui/kit/zIndexLiterals.test.ts` (allowlist: remove LoadProgress.tsx if its
  offending line was the deleted component's; keep if PreviewLoadProgress's `z-10`
  remains — it does (`:87`), so the entry STAYS; note it)
**Depends on**: P3.04.
**Spec**:
- Segment renders off `statusStore.$progress` (P3.01): fixed 96px bar + `62%` (or
  indeterminate barber-pole via `animate-pulse` on a 40% bar — reuse the FileBar visual
  language) + `N files` Chip when >1 job. Min-display 500ms: keep rendering for 500ms
  after `active` goes false (local timer) — no flicker on cache hits.
- **The `$browserPopupCount` HIDE-SWAP IS DELETED** (v1 hid the workspace surface while a
  browser was open — code: `src/ui/LoadProgress.tsx:72`): the segment always renders when
  active; the browsers keep their own PreviewLoadProgress pane overlay; both may show
  (design §1.2 #6 explicit). `$browserPopupCount` itself stays (the browsers still use it
  for their overlay — do not touch loadProgressStore).
- Click → kit Popover anchored above (`w-80`): one row per job — label (truncate middle),
  per-job bar (reuse/duplicate the FileBar recipe at chip scale), bytes readout (`mb()`
  helper — port from code: `src/ui/LoadProgress.tsx:43-45`). Rows vanish on completion;
  popover auto-closes when empty.
**Verify**: switch View ▸ Environment to an un-cached preset → segment shows a live bar +
popover lists the HDR; open Add ▸ SubPart with slow network (devtools throttle) → browser
pane overlay AND status segment both show; segment lingers ~500ms after completion.

---

#### P3.11 — FPS segment + `$fpsReport` writer

**Goal**: Segment 10: numeric readout fed by the render loop at 2Hz; stats.js graph stays
in-viewport; the continuous-loop flip untouched (design: design-system-services §1.2 #10;
census: viewport-scene-view.md §1.13).
**Files**:
- Create `src/ui/status/FpsSegment.tsx`
- Modify `src/three/Viewport.ts`
- Modify `src/ui/status/StatusBar.tsx`
**Depends on**: P3.04.
**Spec**:
- `Viewport.ts`: where the stats panel is mounted/updated (code:
  `src/three/Viewport.ts:149-175` stats mount; `stats.update()` in the render loop —
  locate it), accumulate frame count + elapsed and write
  `$fpsReport.set(Math.round(fps))` at most every 500ms while stats are on; on stats
  unmount write `null`. three→state import of `statusStore` follows the sanctioned
  scene→UI report-atom pattern (`$selectionBounds`, `$lightPreviewCount` precedent —
  foundation §13 rules).
- Segment: `62` mono 4ch fixed, only when `$showFpsCounter` (code:
  `src/state/settingsStore.ts:292`). The in-viewport stats.js graph panel stays (canvas
  overlay); the continuous-render flip is UNCHANGED and remains the only continuous mode
  (constitution §14.5).
**Verify**: View ▸ FPS Counter on → both the in-viewport graph and the status number
appear, number updates ~2Hz; off → both gone AND the loop returns to on-demand
(performance tab: no rAF churn at idle).

---

#### P3.12 — Modifier-hints segment + shipped providers

**Goal**: Segment 7: up to 3 live hints, held-modifier brightening (design:
design-system-services §1.4 render rules; only providers whose gestures EXIST ship now).
**Files**:
- Create `src/ui/status/ModifierHints.tsx`
- Create `src/ui/status/modifierHintProviders.ts`
- Modify `src/ui/status/StatusBar.tsx`
- Modify `src/app.tsx` (hover-context stamping on the canvas cell + right sidebar)
**Depends on**: P3.03, P3.04.
**Spec**:
- Providers registered now (gestures verified in v1):
  - `'viewport-select'`: hover ∈ {viewport, viewport-entity} && hasSelection →
    `[{mod:'shift', label:'Add to selection', priority: 20}, {mod:'meta', label:'Toggle in selection', priority: 30}]`
    (⌘/⌃/⇧-click additive select — census: ui-kit-hotkeys.md §1.3 pointer modifiers;
    code: `src/three/SelectionManager.ts` additive click).
  - `'list'`: hover === 'list' → `[{mod:'shift', label:'Range select', priority:10},
    {mod:'meta', label:'Toggle', priority:20}]` (grow-only `useShiftRangeSelect` — census
    §1.3).
  - Providers for ⌥-drag duplicate, marquee ⇧-drag, ⌃ snap invert, timeline snapping are
    REGISTERED BY THEIR PHASES (P5A/P5B/P11) when the gestures exist — leave a comment
    block listing them (design §1.4 "Shipped providers" is the end-state roster).
- Hover stamping: `setHoverContext('viewport')` / `'none'` via `onPointerEnter/Leave` on
  the canvas cell wrapper (app.tsx `data-viewport-cell` div); `'list'` on the right
  Sidebar body wrapper. `'viewport-entity'` needs a hover raycast the scene doesn't
  report yet — SKIP (the viewport provider fires on plain `'viewport'` too); P5A's hover
  reporting can upgrade it. Interim noted.
- Render: up to **3** hints ascending priority: `Kbd(⇧) Add to selection · …`; a hint
  whose modifier is currently held (from `$heldModifiers`) renders accent-bright, others
  `text-fg-muted`. Glyphs via kit `keyLabel` (`meta` → ⌘/Ctrl). Desktop only; hidden
  below ~860px viewport width along with segment 8 (design §1.1 overflow rule —
  matchMedia).
**Verify**: hover the viewport with a selection → two hints; hold ⇧ → that hint
brightens; hover the right sidebar list → range/toggle hints; open any dialog → hints
vanish; ⌘-tab away and back → no stuck-bright hints (blur reset).

---

#### P3.13 — Advisory chips (segment 6b)

**Goal**: Condition-tier feedback: the two shipped advisories (design:
design-system-services §1.8 — the slot is NOT a dumping ground; exactly these two).
**Files**:
- Create `src/ui/status/AdvisoryChips.tsx`
- Create `src/ui/status/advisoryWiring.ts`
- Modify `src/ui/status/StatusBar.tsx`
- Modify `src/app.tsx` (import wiring once)
**Depends on**: P3.04, P2.09.
**Spec**:
- `advisoryWiring.ts` subscriptions:
  - **Light preview cap**: `lightSettings().livePreview && count.total > MAX_PREVIEW_LIGHTS`
    (from `$lightPreviewCount` — code: `src/state/settingsStore.ts:155`; the
    enabled-vs-total shape documented at `:137`; `MAX_PREVIEW_LIGHTS` exported nearby —
    grep it) → `setAdvisory({id:'light-cap', text:'💡 <enabled>/<total>', severity:'warning',
    priority:10, commandId:'view.sceneLighting'})` (click deep-links Settings — the v1
    over-cap warning lived in the View popover; census: shell-layout.md §1.1 item 7).
  - **Mods folder re-grant**: `$modFolder.get().status === 'needs-permission'` (code:
    `src/state/modFolderStore.ts:23-27`) → `{id:'mods-regrant', text:'📁 re-grant',
    commandId:'modsFolder.regrant', priority:20}`.
- `AdvisoryChips.tsx`: max 2 chips (priority-ordered; extras collapse into the first
  chip's tooltip), amber tint, click → `runCommand(commandId)`.
**Verify**: enable Live Light Preview with >cap lights (add many point lights) → chip
appears, click opens Settings; simulate needs-permission (grant then revoke via browser
site settings, reload) → re-grant chip appears and click triggers the permission prompt.

---

#### P3.14 — ImportReportCard → notification-center rich entry

**Goal**: The import report becomes a sticky rich entry with the card's body verbatim; the
floating card dies (design: design-system-services §2.5; foundation §6.3 death list;
census: shell-layout.md §1.12).
**Files**:
- Create the `'import-report'` body in `src/ui/status/notificationBodies.tsx`
- Modify `src/state/customAssetStore.ts` (post `notify()` when a report lands)
- Delete `src/ui/ImportReportCard.tsx`
- Modify `src/app.tsx` (unmount)
- Modify `src/ui/kit/zIndexLiterals.test.ts` (allowlist: remove ImportReportCard.tsx)
**Depends on**: P3.05.
**Spec**:
- Where `$importReport` is SET (code: `src/state/customAssetStore.ts:217` `$importReport`;
  find its setter in the import-completion path), also call
  `notify({severity:'rich', title: 'Import report — <filename>', rich: {kind:'import-report',
  payload: report}})` (state→state import of notificationStore — sanctioned). Keep
  `$importReport`/`dismissImportReport` (code: `:219`) — other consumers may read it; the
  CARD is what dies.
- `notificationBodies['import-report']`: port the ImportReportCard BODY content verbatim
  (mesh/material/texture counts, warnings disclosure, **the removed-SubParts list by
  name** — the card's header comment explains why this must never truncate; census:
  shell-layout.md §1.12 "deliberately NOT a toast"). Sticky-until-dismissed; a new import
  posts a NEW entry (history of last imports — design §2.5 "strictly better").
- **Seam note**: P8's import-pipeline rework re-specs this rich payload (richer report,
  replace-mode summary) and P12's death table lists ImportReportCard under P8 — deleting
  it here EARLY satisfies the same grep; P8's task becomes "verify + extend the P3 rich
  entry" rather than a fresh migration. Do not skip the deletion.
**Verify**: import a `.glb` (drag onto canvas) → bell pulses, rich entry shows counts +
warnings + removed-SubParts on a replace-import; entry survives Clear-all; ✕ dismisses;
`grep -rn "ImportReportCard" src/` → none.

---

#### P3.15 — Phone: interim CondensedStatusBar

**Goal**: Phone parity for the surfaces this phase deleted (toasts, seat bar): the
condensed strip with the segments that exist so far (design: design-system-services §8.1;
foundation §12 — completed by later phases; interim scope stated).
**Files**:
- Create `src/ui/shell/phone/CondensedStatusBar.tsx`
- Modify `src/app.tsx` (phone branch: mount as the last flex child)
**Depends on**: P3.04–P3.09.
**Spec**:
- One strip above the bottom edge (ModeTabBar arrives P4 and will sit below it):
  `[mode/tool chip] [Layer: <name>] [message channel] [🔔badge]`.
  - **Mode/tool chip**: mode icon+name from `$interimMode`; while a "tool" is active
    (P3.09's interim set: seat-view / measure / exhaust) the tool icon+name replaces it
    and **tap = cancel/exit the tool** (seat → `exitSeatView()`; measure →
    `setMeasureTool('none')`; exhaust → `setEngineExhaustGizmo(false)`) — this is the
    phone's Esc and replaces the deleted SeatViewBar's phone Exit (design §8.1; the F4
    one-shot-cancel completion is P5B's). No tool → tap opens the mini mode menu (same
    five commands).
  - **Layer chip**: Build/Animation only, truncated 10ch, tap → layer picker rendered as
    a Sheet (same rows as P3.04's menu).
  - **Message channel**: same overwrite semantics; tap → the notification Sheet (P3.05's
    phone variant). Progress renders as a 2px accent underline bar across the strip when
    `$progress.active` (no dedicated segment — design §8.1).
  - **Bell** + badge → notification Sheet.
  - Dropped on phone (keyboard-only, by design): modifier hints, rotate/nudge chips, FPS
    readout. The Inspector-sheet touch steppers (design §8.2) belong to the selection
    area phase (P5B) — note, don't build.
  - Selection-count chip + snap chip: arrive with their features (P5B); leave slots.
**Verify**: phone viewport: sit in a seat → chip shows the seat tool, tap exits; toasts
land in the strip; tap → notification sheet opens; layer tap → picker sheet sets the
add-target; progress underline during an environment load.

---

#### P3.16 — Phase 3 docs sync + z-allowlist audit

**Goal**: Docs reflect the status-bar reality; the z-literal allowlist shrinks (AGENTS.md
doc-sync mandate).
**Files**:
- Modify `docs/iva-seats.md`
- Modify `docs/custom-assets.md`
- Modify `docs/projects.md`
- Modify `docs/action-chains.md`
- Modify `docs/state-persistence.md`
- Modify `src/ui/kit/zIndexLiterals.test.ts` (final audit for the phase)
**Depends on**: P3.06–P3.15.
**Spec**:
- `docs/iva-seats.md`: "The floating `SeatViewBar`…" (code: `docs/iva-seats.md:253`) →
  the status-bar tool segment (same controls: prev/next wrap mirroring `C`, ordinal,
  honesty tooltip, Exit + Esc rung).
- `docs/custom-assets.md`: the import-report paragraph (code:
  `docs/custom-assets.md:372-373` — "A one-line toast could not carry that") → the
  report is now a sticky rich notification-center entry (same never-truncate rationale).
- `docs/projects.md`: boot purge notice (code: `docs/projects.md:76` "boot toast") → an
  8s status flash + unread warning entry in the notification center; also note autosave
  failures now surface as a danger notification (previously silent console.warn).
- `docs/action-chains.md`: chain toasts (`:186-208` wording) → status-channel flashes;
  the footer mirror chip in the status bar.
- `docs/state-persistence.md`: note the toast system is gone — transient feedback is
  ephemeral statusStore state; notification center is session-only (never persisted;
  ring 100). No new persisted keys in P3.
- Allowlist audit: entries removed across P3 tasks — `src/ui/kit/Toast.tsx`,
  `src/ui/SeatViewBar.tsx`, `src/ui/ImportReportCard.tsx`; `src/ui/LoadProgress.tsx`
  STAYS (PreviewLoadProgress `z-10`). Run the test to confirm the reverse-assertion
  (dead entries pruned) passes.
**Verify**: `pnpm fmt`; `pnpm test`; re-read diffs for accuracy;
`grep -rn "toast" docs/*.md` — remaining hits describe the new routing or are
historical/rationale text.


---

## flexo v2 — Implementation plan, Phase 4

Part of the flexo v2 UI refactor plan. Design corpus: `plans/flexo_v2/design/` (foundation.md
is LAW). Census of record: `analysis/flexo-v2-feature-census/`. Constitution: `AGENTS.md`.

Conventions:
- (design: `<file>` §X) cites `plans/flexo_v2/design/<file>`.
- (census: `<file>` §X) cites `analysis/flexo-v2-feature-census/<file>`.
- (code: `src/...:<line>` `<symbol>`) cites the current working tree — every citation below
  was verified against source at plan-writing time. Line numbers drift as earlier phases
  land; the **symbol is the anchor** — re-locate by symbol, not line.
- Mandatory end-of-task workflow for EVERY task: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check`
  → `pnpm typecheck` → `pnpm test`. "Verify" blocks list only checks beyond that baseline.
- **No game-contract surface is touched in this phase** (editor-only chrome: modes, hotkeys,
  camera, help). **No `scope/*.md` sync required.** `docs/*.md` sync is task P4.15.
- **Undo**: nothing this phase adds is ever undoable — mode switches, tool arming, hotkey
  scope state, camera moves, help/palette state are all view/session state (design:
  foundation.md §2.3 "Mode switches are never undo steps", §13 Rules). Tasks that BIND keys
  to document mutations delegate to existing editorStore mutators that already carry their
  own undo enrollment (discrete `pushUndo` inside the mutator); no new enrollment is
  introduced here. No numeric input fields are created in this phase.

### Seam notes (read first)

This phase knits into Phases 2/3, whose plan files were authored in parallel. The design
corpus is the shared contract for their outputs. Where this phase references them, the
canonical names are:

| From | Expected artifact (canonical name per design) |
|---|---|
| P2 | `src/state/commandStore.ts` — command registry `{id, title, menuPath?, keys?, scope, enabled?(), checked?(), run(params?)}` + dynamic providers + `$paletteOpen` (design: foundation.md §4, §13) |
| P2 | `src/state/dialogStore.ts` — `$openDialog: {id, params} \| null`, dialogs mounted once at root (design: foundation.md §4, §13) |
| P2 | MenuSpec-driven `MenuBar` with a **center slot** for the mode switcher, `CommandPalette` (⌘K), MenuSheet (design: foundation.md §3; system-services §3) |
| P3 | `src/state/statusStore.ts` — `status()`, `setToolStatus()`, `$statusMessage` + the `toast()` facade at `src/ui/toast.ts` (design: design-system-services.md §1.3, §2.2) |
| P3 | `src/state/modifierStore.ts` — `$heldModifiers`, `$isDragging` if P3 created it (design: design-system-services.md §1.4) |
| P0/P1 | `src/state/layoutStore.ts` — `toggleSidebar(side)` (phase-00-01.md P0.09); kit `Kbd`/`keyLabel` moved into `src/ui/kit/` (P0.04); `ModeTabBar`/`Sheet` phone primitives, built but NOT mounted (P1.05/P1.06) |

**If an actual export name from an earlier phase differs from the design name, follow the
earlier phase's real export** — do not create a duplicate. Every "attach binding to command
X" task below means: look the command id up in `commandStore`'s registered set first; create
the command only if P2 genuinely did not (each task says what its `run` must do).

Later phases explicitly build on this phase's names (see `phase-05b.md` entry state):
`src/state/modeStore.ts` (`$mode`, `$activeTool`, `setMode`, enter/exit + tool hook
registries), the scoped registry in `src/ui/hotkeys/registry.ts`, and the Esc-ladder rung
registry. Do not rename these.

---

## Phase 4 — Mode machine + hotkey system v2

**Design sources**: foundation.md §2 (the mode machine: five modes, switcher, what a switch
changes, entry/exit invariants, transient tools), §11 (hotkey architecture: scoped registry,
full binding table, palette, Esc ladder, Help), §4 (command registry mechanics), §13 (shell
state architecture); design-system-services.md §4 (hotkey system v2 implementation contract:
registry shape, scope activation, typing guard, binding table with owners/migrations,
conflict detection, Esc-ladder implementation), §5.1 (Help regenerated); design-build-mode.md
§5.2–§5.4 (nudge/rotate rebinds, camera commands F/snaps/reset, View menu);
design-data-engine-modes.md §B10 (engine hotkeys X · ,/. · Esc); FINAL_DESIGN_INDEX.md
(**AUTHORITATIVE** consolidated hotkey table + rebind diff); DECISIONS.md #1 (five modes),
#4 (compile-green rollout), #7 (palette, camera F/snap/reset).

**Census sources**: ui-kit-hotkeys.md §1.3 (registry architecture, `isTypingInField`
virtual-focus guard, off-registry local bindings), §1.6 (HelpDialog/Kbd/keyDisplay), §4
pains 1/2 (no scoping; help drift), §5 (invariants: `?` via useKey, Escape layering order,
`mod` abstraction), §6 (complete v1 binding table); shell-layout.md §3 (`$inspectorMode` is
the hidden mode machine; consumer map), §5 pain 5, §7 ("engineStore both reads and SETS that
atom; animationStore computes `$isPoseEditing` FROM `$inspectorMode`").

**Entry state** (end of Phase 3): docked shell (menubar from MenuSpec/commandStore, status
bar with segments + statusStore/notificationStore/modifierStore, toast routed, dialogStore
+ ⌘K palette live). The right sidebar still hosts v1 `InspectorContent` switched by
`$inspectorMode: 'assets' | 'anim' | 'engine'` (code: `src/state/uiStore.ts:17-21`
`$inspectorMode`). Hotkeys are still the v1 flat global registry (code:
`src/ui/hotkeys/registry.ts:63` `HOTKEY_GROUPS`) with the three off-registry Escape paths
(chain palette, animation unwind, seat view) intact. No mode switcher UI, no camera
commands, no `F`-frame.

**Exit state**: App fully runnable. The five-mode machine is live: menubar segmented
switcher + status-bar mode chip + phone ModeTabBar, digits `1–5`, `setMode` as the single
choreography point; `$inspectorMode` is deleted; Data and Surface modes show interim
placeholder sidebars (replaced in P6/P8 — every v1 surface they will absorb is still
reachable via the menubar). `$activeTool` slot exists (wired to tools in P5B). The scoped
hotkey registry v2 runs every binding through scope sets with dev-time + unit-tested
conflict detection; the authoritative-table bindings that have existing behavior are all
live, including the rebinds (`F` = Frame Selection, `[`/`]` = rotate step, `⌘K` = palette,
`⇧⌘K` = chain); deferred bindings are ledgered to their owning phases. The 9-rung Esc
ladder is one ordered dispatcher; the three hand-tuned Escape paths are gone. Frame
Selection / selection-centroid camera snaps / Reset Camera work from key, View menu, and
palette. The Help dialog regenerates from the registry with scope grouping + static
sections; menubar chords render from the registry by commandId.

**Phase verification** (after the last task):
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` all green.
2. New/updated tests pass: `modeStore.test.ts`, `hotkeyStore.test.ts`,
   `hotkeyRegistry.test.ts`, `escLadder.test.ts`, `cameraFraming.test.ts`, updated
   `animationStore.test.ts`.
3. Manual (`pnpm dev`, desktop): digits 1–5 + menubar switcher + status chip switch modes;
   selection/camera/undo survive every switch; Animation exit stops playback and unpins the
   edited keyframe; Engine exit kills exhaust handles; `F` frames the selection (frame-all
   with none), camera snaps orbit the selection centroid; `[`/`]` change rotate step, `T`
   cycles the gizmo tool, `W/S/A/D/Q/E` still rotate (and are DEAD while a dialog is open
   or while typing); `⌘K` opens the palette, `⇧⌘K` the chain; Esc walks the ladder (dirty
   number field reverts first; open menu closes; palette closes; measure disarms; chain
   cancels; animation keyframe unpins; seat view exits — in that order); `?` opens the new
   Help with scope groups and the rebind diff box.
4. Manual (phone width < 640px): ModeTabBar switches modes; re-tap of the active tab opens
   the mode's Panel sheet; the condensed status bar shows the mode chip.
5. `grep -rn "inspectorMode" src/` → zero hits. `grep -rn "helpStore" src/` → zero hits.

### Task ordering

P4.01 → P4.02 → P4.03 → P4.04 (mode machine, compile-green at each boundary) →
P4.05 → P4.06 (registry core) → P4.07 (Esc ladder) → P4.08 (binding waves) →
P4.09 (camera) → P4.10 (mirrors + ledger) → P4.11 (Help) → P4.12 (chips) →
P4.13 (conflict suite) → P4.14 (phone) → P4.15 (docs).

---

#### P4.01 — `modeStore`: `$mode`, `$activeTool`, `setMode` choreography point, hook registries

**Goal**: Land the mode machine's state core — one atom for the mode, one slot for the
transient tool, and the ONLY place that runs mode-switch choreography.
**Files**:
- Create `src/state/modeStore.ts`
- Create `src/state/modeStore.test.ts`
- Modify `src/state/projectStore.ts` (project-load reset)
**Depends on**: none.
**Spec**:

`src/state/modeStore.ts` — `src/state/` layering: NO react, NO three imports (AGENTS.md
constitution; design: foundation.md §13). Shape (design: foundation.md §2.1, §2.3, §2.6,
§13 modeStore row; design-system-services.md §4.2):

```ts
import { atom } from 'nanostores';

export type Mode = 'build' | 'animation' | 'data' | 'engine' | 'surface';
export type Tool = 'measure' | 'seat-view' | 'exhaust' | 'marquee' | 'member-paint' | 'pivot-pick';

/** Ephemeral — boots to 'build' (foundation S9). Never persisted, never undoable. */
export const $mode = atom<Mode>('build');

/**
 * Single-slot transient pointer tool (foundation §2.6 / S10). Arming one cancels the
 * previous. The chain session is deliberately NOT in this slot (parallel session).
 * Created here; the tools themselves route through it in P5B (measure/seat-view/exhaust)
 * and P5A/P11 (marquee/member-paint/pivot-pick).
 */
export const $activeTool = atom<Tool | null>(null);

export interface ModeHooks {
  /** Runs after $mode is set to this mode. `payload` = cross-mode jump context (§2.5). */
  onEnter?: (payload?: unknown) => void;
  /** Runs before $mode leaves this mode. */
  onExit?: () => void;
}
const modeHooks = new Map<Mode, ModeHooks[]>();
export function registerModeHooks(mode: Mode, hooks: ModeHooks): void { /* push */ }

export interface ToolDef {
  /** Modes this tool may be armed in; undefined = all. */
  allowedModes?: Mode[];
  /** Seat view survives mode switches (foundation §2.6 row 2); everything else cancels. */
  survivesModeSwitch?: boolean;
  /** Tears the tool's feature-store state down. MUST be idempotent. */
  onCancel?: () => void;
}
const toolDefs = new Map<Tool, ToolDef>();
export function registerTool(tool: Tool, def: ToolDef): void { toolDefs.set(tool, def); }

/** Arms `tool`, cancelling whatever occupied the slot (single-slot invariant). */
export function armTool(tool: Tool): void {
  const prev = $activeTool.get();
  if (prev === tool) return;
  if (prev) toolDefs.get(prev)?.onCancel?.();
  $activeTool.set(tool);
}
/** Disarms; no-op when `tool` given and a different tool is armed. */
export function disarmTool(tool?: Tool): void {
  const cur = $activeTool.get();
  if (!cur || (tool && cur !== tool)) return;
  toolDefs.get(cur)?.onCancel?.();
  $activeTool.set(null);
}

/**
 * THE single choreography point (foundation §2.3): no component ever sets other stores
 * on a mode switch. Order: (1) no-op if same mode; (2) run exit hooks of the outgoing
 * mode; (3) cancel the armed tool unless its def says survivesModeSwitch; (4) set $mode;
 * (5) run enter hooks of the incoming mode with `payload`.
 * NEVER touches: document, $part, undo history, selection, camera, layer view state,
 * active layer (§2.3 "Never touched"). Never an undo step.
 */
export function setMode(next: Mode, payload?: unknown): void { /* as above; reentrancy-guard */ }

/** Project load/switch: mode → build (hooks run), tool slot cleared (foundation §2.4). */
export function resetModeForProjectLoad(): void {
  disarmTool();
  if ($mode.get() !== 'build') setMode('build');
}
```

Implementation notes:
- Hook errors must not break the switch: wrap each hook call in try/catch with
  `console.error` (a broken area hook must never strand the UI between modes).
- Reentrancy guard: a hook calling `setMode` during a switch throws in DEV (choreography
  must stay single-entry); in prod, queue via microtask is NOT needed — just guard + warn.
- The per-mode SUB-STATE itself stays in the owning feature stores
  (`$activeAnimationId`/`$activeJointId`, `$activeEngineEntry`, the future `$dataScope`,
  picked surface mesh) exactly as foundation §13 "Kept as-is" lists them; survival across
  switches is therefore automatic (they are only cleared by their own stores' rules).
  **DEVIATION (minor, logged)**: foundation §13's modeStore row mentions "per-mode
  sub-state re-exports clamped vs `$part`" — re-exporting feature-store atoms from
  modeStore would create `modeStore ↔ animationStore/engineStore` import cycles (those
  stores must import `modeStore` for `$mode` and hook registration, see P4.02). Sub-state
  stays in its owning store; modeStore orchestrates only via hooks. Semantics identical.
- In `src/state/projectStore.ts`, inside `applyProjectSnapshot` (code:
  `src/state/projectStore.ts:274` `applyProjectSnapshot`), directly after the existing
  `closeChain()` call (code: `src/state/projectStore.ts:287`), add
  `resetModeForProjectLoad();` (foundation §2.4 "Project load/switch: mode resets to
  Build, `$activeTool` cleared, chain session closed"). Dialog closing on project switch
  is dialogStore's contract from P2 — do not duplicate it here.

`src/state/modeStore.test.ts` (vitest, plain store test — pattern: code:
`src/state/editorStore.test.ts` top-of-file setup style):
1. boots to `'build'`.
2. `setMode('animation')` runs build exit hooks then animation enter hooks, in that order
   (record calls with a spy array).
3. `setMode` to the SAME mode runs no hooks.
4. `armTool('measure')` then `armTool('marquee')` → measure's `onCancel` ran, slot is
   `'marquee'` (single-slot invariant).
5. `disarmTool('measure')` while `'marquee'` armed → no-op; `disarmTool()` → cancels.
6. mode switch cancels a non-surviving tool but keeps one registered with
   `survivesModeSwitch: true`.
7. `resetModeForProjectLoad()` from `'engine'` with a tool armed → mode `'build'`, tool
   null, engine exit hook ran.
8. a throwing exit hook does not prevent the mode from switching.
**Verify**: `pnpm test modeStore` green; `pnpm typecheck` green. No react/three imports in
`src/state/modeStore.ts` (`grep -n "from 'react'\|from 'three'" src/state/modeStore.ts` → none).

---

#### P4.02 — State-layer re-point: `animationStore`/`engineStore` onto `$mode` + enter/exit hooks

**Goal**: Replace every `src/state/` read/write of `$inspectorMode` with `$mode`, and encode
the foundation §2.4 entry/exit invariants as registered hooks.
**Files**:
- Modify `src/state/animationStore.ts`
- Modify `src/state/engineStore.ts`
- Modify `src/state/animationStore.test.ts`
**Depends on**: P4.01.
**Spec**:

Mechanical mapping everywhere: `'anim'` → `'animation'`, `'engine'` → `'engine'`,
`'assets'` → `'build'` (census: shell-layout.md §3, §7 — the consumer map).

`animationStore.ts`:
- Replace the `$inspectorMode` import (code: `src/state/animationStore.ts:17`) with
  `import { $mode, registerModeHooks } from './modeStore'`.
- `$isPoseEditing` (code: `src/state/animationStore.ts:68` `$isPoseEditing`): deps become
  `[$mode, $activeAnimationId, $activeJointId, $editKeyframeId]`, predicate
  `mode === 'animation' && …` — same semantics, new atom (design: foundation.md §2.3
  item 3).
- Register the Animation exit hook (design: foundation.md §2.4 "Leaving Animation") at
  module scope (one-directional import, no cycle):

```ts
registerModeHooks('animation', {
  onExit: () => {
    $editKeyframeId.set(null);      // end posing
    stopAnimationPreview();          // stop playback + spring back to modeled rest pose
                                     // (code: src/state/animationStore.ts:107 stopAnimationPreview)
    // $activeAnimationId / $activeJointId deliberately SURVIVE for return (§2.4).
  },
});
```

  Pose-gizmo detach / pivot-marker hide / trajectories need no explicit hook: they are
  derived in the three layer from `$isPoseEditing`/`$mode` (P4.03 re-points EditorScene),
  which flip when `$mode` leaves `'animation'`. Timeline unmount is P11's dock (mounted
  `mode === 'animation'` only).
- "Entering Animation: preview gating on; last-active clip restored" (§2.4) is automatic —
  the surviving atoms + the EditorScene `$mode` subscription re-derive everything; no
  enter hook needed in this phase (P11 adds the reveal-joints-for-selection behavior).

`engineStore.ts`:
- Replace `import { $inspectorMode, setInspectorMode } from './uiStore'` (code:
  `src/state/engineStore.ts:18`) with `import { $mode, setMode, registerModeHooks } from './modeStore'`.
- `$isExhaustPlacing` (code: `src/state/engineStore.ts:269` `$isExhaustPlacing`): deps
  `[$mode, $engineExhaustGizmo, $activeNozzleTarget]`, predicate `mode === 'engine' && …`.
- `enterEngineMode` (code: `src/state/engineStore.ts:290`): body becomes
  `if (entry !== undefined) setActiveEngine(entry); setMode('engine');`.
- `exitEngineMode` (code: `src/state/engineStore.ts:296`): becomes just
  `setMode('build');` — the gizmo teardown moves into the registered exit hook so it runs
  on EVERY route out of Engine mode (digit key, menubar, status chip), not only the
  toolbar button (design: foundation.md §2.4 "Leaving Engine: disarm exhaust placement,
  dispose nozzle handles — hidden-but-pickable steals clicks, census invariant"):

```ts
registerModeHooks('engine', {
  onExit: () => { $engineExhaustGizmo.set(false); },  // handle disposal follows via the
                                                      // EditorScene $mode subscription
  // Active engine entry retained (§2.4) — do NOT clear $activeEngineEntry.
});
```

- Also register the sanctioned Data enter effect here? **No** — put it in
  `src/state/modeStore.ts`'s wiring? **No.** Register it from `src/state/reactionStore.ts`
  is wrong too (it must not import modeStore just for this — keep reactionStore
  dependency-free). Do it in `engineStore.ts`? No. **Correct home**: a three-line module
  side effect in `src/state/modeStore.ts` would invert layering. Simplest cycle-free home:
  register it in `src/main.tsx` boot wiring next to `registerEditorAidStores` (code:
  `src/main.tsx:21` `registerEditorAidStores`):

```ts
// main.tsx — sanctioned Data entry effect (foundation §2.4: read-only catalog preload,
// side-effect-free w.r.t. the document)
registerModeHooks('data', { onEnter: () => { void ensureReactionsLoaded(); } });
```

  (code: `src/state/reactionStore.ts:48` `ensureReactionsLoaded` — already idempotent;
  EnginePanel keeps its own on-mount call, code: `src/ui/EnginePanel.tsx:70`.)

`animationStore.test.ts`: replace `setInspectorMode('anim'/'assets')` (code:
`src/state/animationStore.test.ts:39,273`) with `setMode('animation')` /
`setMode('build')` from modeStore. Add two cases:
- "leaving animation mode unpins the edited keyframe and stops playback but keeps the
  active animation/joint ids" (set up ids + `$editKeyframeId`, `setMode('build')`, assert
  `$editKeyframeId === null`, `$animPlaying === false`, `$animScrubbing === false`,
  `$activeAnimationId`/`$activeJointId` unchanged).
- "leaving engine mode turns the exhaust gizmo off but keeps the active engine entry"
  (belongs here or a new `engineStore` describe block — put it where engineStore's
  existing tests live if any; otherwise add `src/state/engineStore.test.ts` with just this
  case).
**Verify**: `pnpm test animationStore` green (updated cases). `pnpm typecheck` green —
NOTE: at this task boundary `uiStore.$inspectorMode` still exists (UI still consumes it);
that is fine, the two stores coexist until P4.03 deletes it. App still runs (`pnpm dev`):
the v1 sidebar buttons still switch `$inspectorMode`, but pose gizmo/exhaust handles now
key off `$mode` — confirm the Anim/Engine buttons appear broken-in-3D **only if** P4.03 is
skipped; proceed immediately to P4.03 (these two tasks ship as one PR/commit pair; P4.02
alone typechecks but 3D gating is split-brained until P4.03).

---

#### P4.03 — UI + three-layer re-point; delete `$inspectorMode`; `ModeSidebar` with placeholders

**Goal**: Finish the mechanical re-point: every remaining `$inspectorMode` consumer reads
`$mode`; the right sidebar becomes a five-way mode switch; `$inspectorMode` is deleted.
**Files**:
- Modify `src/three/EditorScene.ts`
- Create `src/ui/ModeSidebar.tsx` (replaces `src/ui/InspectorContent.tsx` — delete it)
- Modify `src/ui/FloatingPreviewToolbar.tsx`
- Modify `src/ui/AssetsToolbar.tsx`, `src/ui/AnimToolbar.tsx`, `src/ui/EngineToolbar.tsx`,
  `src/ui/AddButton.tsx`
- Modify `src/state/uiStore.ts` (delete `$inspectorMode`/`setInspectorMode`/`InspectorMode`)
- **Delete `src/ui/commands/interimMode.ts`** (P2.03's interim adapter — P2.03 promises
  exactly this deletion; it imports `$inspectorMode`, so leaving it breaks the compile)
- Modify `src/ui/commands/modeCommands.ts`, `src/ui/commands/addCommands.ts`,
  `src/ui/shell/ModeSwitcher.tsx`, `src/ui/shell/phone/PhoneTopBar.tsx`, and the P3
  status-bar mode chip / CondensedStatusBar (every `interimMode.ts` importer — grep
  `interimMode\|setInterimMode\|\$interimMode\|INTERIM_MODES`)
- Modify whatever P1/P3 component mounts `InspectorContent` (the right-sidebar host and the
  phone inspector sheet — locate with `grep -rn "InspectorContent" src/`)
**Depends on**: P4.02.
**Spec**:

`EditorScene.ts` — full consumer list (census: shell-layout.md §7; verified by grep):
- Import `$mode` from `state/modeStore` instead of `$inspectorMode` from `state/uiStore`
  (code: `src/three/EditorScene.ts:120`).
- `this.sub($inspectorMode, onPreviewChange)` → `this.sub($mode, onPreviewChange)` (code:
  `src/three/EditorScene.ts:552`); same for the engine subscription (code:
  `src/three/EditorScene.ts:564`). The `sub()` helper + on-demand invalidation pattern is
  untouched (design: foundation.md §2.3 item 3 — "EditorScene re-points its existing
  `$inspectorMode` subscriptions at `$mode` — same semantics, new atom").
- Gate rewrites, `'anim'` → `'animation'` / `'engine'` → `'engine'`:
  - `if ($inspectorMode.get() !== 'anim') return false;` (code:
    `src/three/EditorScene.ts:777`)
  - `const animId = $inspectorMode.get() === 'anim' ? …` (code:
    `src/three/EditorScene.ts:827`)
  - the pose-gizmo gate (code: `src/three/EditorScene.ts:1732`)
  - the pivot-marker gate (code: `src/three/EditorScene.ts:1819`)
  - the two exhaust-target gates (code: `src/three/EditorScene.ts:1881,1886`)
- Do NOT touch anything else in this file in this task (camera work is P4.09).

`src/ui/ModeSidebar.tsx` — replaces `InspectorContent` (code:
`src/ui/InspectorContent.tsx:24` — its three-way `useStore($inspectorMode)` switch):

```tsx
export function ModeSidebar({ showTransform = false }: { showTransform?: boolean }) {
  const mode = useStore($mode);
  switch (mode) {
    case 'animation': return /* AnimToolbar + AnimationPanel — verbatim from InspectorContent */;
    case 'engine':    return /* EngineToolbar + EnginePanel — verbatim */;
    case 'data':      return <ModePlaceholder mode="data" />;
    case 'surface':   return <ModePlaceholder mode="surface" />;
    default:          return /* AssetsToolbar + AssetsList (+ TransformInspector when showTransform) — verbatim */;
  }
}
```

`ModePlaceholder` (local to the file, INTERIM — deleted by P6/P8 which are the modes'
real right sidebars): a `panelChrome` card with the mode name and one line — Data: "Data
mode arrives in a later phase — Part Data and SubPart Data remain available from the
menubar."; Surface: "Surface mode arrives in a later phase — Manage Textures remains
available where it is today." Mark it `// INTERIM (P4): replaced by DataNavigator (P6) /
SurfacePanel (P8)`. RULE ZERO holds: nothing is removed — the v1 Part Data / SubPart Data /
Manage Textures surfaces stay reachable exactly as P2 left them.

Call-site re-points (verbatim semantics, new function):
- `AssetsToolbar` "Engine"/"Anim" buttons (code: `src/ui/AssetsToolbar.tsx:46,55`
  `setInspectorMode('engine')/('anim')`) → `setMode('engine')` / `setMode('animation')`.
- `AnimToolbar` Close (code: `src/ui/AnimToolbar.tsx:37` `setInspectorMode('assets')`) →
  `setMode('build')`.
- `EngineToolbar` Close already calls `exitEngineMode` (code:
  `src/ui/EngineToolbar.tsx:34`) — no change (P4.02 re-implemented it).
- `AddButton` Define Engine (code: `src/ui/AddButton.tsx:70` `enterEngineMode()`) — no
  change (P4.02 re-implemented it). (If P2 already replaced AddButton with the Add menu,
  the Add-menu command calls `enterEngineMode()` — same function, no change either way.)
- `FloatingPreviewToolbar` (code: `src/ui/FloatingPreviewToolbar.tsx:31`
  `useStore($inspectorMode)`) → `useStore($mode)`, visible when `mode === 'animation'`.

**Delete `src/ui/commands/interimMode.ts` and re-point every importer in the SAME task**
(this is the retirement P2.03 promised — a literal implementer who skips it ships a
broken boot):
- The five `mode.*` commands (P2.09 registered them running `setInterimMode(id)`):
  change each command's `run` to `setMode('<mode>')` and `checked` to
  `() => $mode.get() === '<mode>'` — **RE-POINT the existing registrations in
  `src/ui/commands/modeCommands.ts`; do NOT call `registerCommand` again** (P2.01's
  registry throws on duplicate ids). P4.04 finishes the UI side (enable Data/Surface).
- The interim-Build guard in the `add.*` entity commands (P2.09:
  `if ($interimMode.get() !== 'build') setInterimMode('build')`): becomes
  `if ($mode.get() !== 'build') setMode('build')` — this IS the real S27 auto-switch;
  P5B.22 only verifies/extends it.
- `add.defineEngine` (`setInterimMode('engine')`): becomes `enterEngineMode()` (P4.02's
  re-implementation — preserves the active-entry semantics).
- `src/ui/shell/ModeSwitcher.tsx` (P2.11), the P3 status-bar mode chip, PhoneTopBar's
  mode label, CondensedStatusBar: read `$mode` (and P4.04's `MODES` list) instead of
  `$interimMode`/`INTERIM_MODES`.

`uiStore.ts`: delete `InspectorMode`, `$inspectorMode`, `setInspectorMode` (code:
`src/state/uiStore.ts:17-21`). Then `pnpm typecheck` MUST report zero remaining consumers
— chase any stragglers (P1–P3 may have added readers; re-point them all to `$mode` with
the same 3→5 mapping).
**Verify**: `grep -rn "inspectorMode" src/` → zero hits; `grep -rn "interimMode" src/` →
zero hits. `pnpm dev`: sidebar switches
between Build (assets), Animation, Engine bodies; Data/Surface show placeholders; pose
gizmo appears only in Animation with a pinned keyframe; exhaust handles only in Engine;
selection + camera survive switching through all five modes and back.

---

#### P4.04 — Mode switcher UI: menubar segmented control, mode commands, status chip

**Goal**: Make the mode visible and switchable from the menubar center, the status bar, and
the palette (keys land in P4.08).
**Files**:
- Modify `src/ui/shell/ModeSwitcher.tsx` (P2.11 created it over `$interimMode`; P4.03
  mechanically re-pointed it — this task upgrades it; do NOT create a second file)
- Modify `src/ui/commands/modeCommands.ts` (P2.09 created it; P4.03 re-pointed the runs)
- Modify the P1/P2 `MenuBar` component (ModeSwitcher already sits in the center slot —
  verify)
- Modify the P3 status-bar mode chip (read `$mode`, menu of the five commands)
**Depends on**: P4.03.
**Spec**:
- Commands (design: foundation.md §2.2, §4; system-services §3.2 "Go to X mode"): the
  five commands `mode.build` / `mode.animation` / `mode.data` / `mode.engine` /
  `mode.surface` ALREADY EXIST (P2.09) and P4.03 re-pointed their `run`/`checked` at
  `setMode`/`$mode` — **do not re-register** (duplicate-id throw). This task: drop the
  `enabled: () => false` from `mode.data`/`mode.surface` (the modes exist now, showing
  interim placeholders), confirm titles "Go to Build mode" etc., and set the scope field
  `'global'` if the Command shape gained one. These ids are the join key for the digit
  bindings (P4.08), the switcher, the status chip and the palette — one dataset
  (foundation Law 4).
- `ModeSwitcher` (upgrade the P2.11 interim component in place): kit `ToggleButtonGroup`
  (code: `src/ui/kit/ToggleButton.tsx`
  `ToggleButtonGroup`) in `xs` size, one `ToggleButton` per mode with lucide icon + label:
  `[⬚ Build] [▶ Animation] [☰ Data] [🚀 Engine] [◧ Surface]` (icon choice: `Box`, `Play`,
  `Table` /`List`, `Rocket`, `Layers` — pick the closest lucide equivalents, exactness not
  design-bound). Selection driven by `useStore($mode)`; press runs the command via
  commandStore (NOT `setMode` directly — commands are the only action path, foundation §4).
  Labels drop to icon-only below ~1100px viewport width (design: foundation.md §2.2) — use
  a container query or `window.matchMedia('(max-width: 1100px)')` via
  `useSyncExternalStore` mirroring the `useIsPhone` pattern (code:
  `src/ui/kit/useIsPhone.ts`).
  Attention dots (Engine blockers / Animation drafts) are DEFERRED to P7/P11 — the
  `ModeTabSpec.attention` plumbing exists (phase-00-01.md P1.06); leave a TODO naming
  those phases.
- Mount in the MenuBar center slot (phase-00-01.md P1.01 built the three-region menubar
  frame; P2 filled the menus — the center region is reserved for exactly this, design:
  foundation.md §3 layout line).
- Status-bar mode chip (design: system-services §1.2 segment 1): the P3 chip renders
  `$mode` icon + name; click opens a kit `Menu` listing the five mode commands with a
  check on the current one. If P3 shipped it as a placeholder, wire it now; tooltip
  "Editing mode — 1–5 to switch".
**Verify**: `pnpm dev`: switcher highlights the active mode, clicking switches, status chip
mirrors and its menu switches; palette (⌘K) lists "Go to Data mode" and runs it; narrow
window (<1100px) drops labels to icons. Nothing here pushes undo (switch modes with a
dirty-ish document, ⌘Z still undoes the last document edit, not the mode change).

---

#### P4.05 — `hotkeyStore`: focused surface + active scope set

**Goal**: The data layer the scoped registry gates on: which surface has focus, which
scopes are active.
**Files**:
- Create `src/state/hotkeyStore.ts`
- Create `src/state/hotkeyStore.test.ts`
- Modify `src/ui/chain/ChainPalette.tsx` + the P2 `CommandPalette` (stamp `data-surface`)
**Depends on**: P4.01 (needs `$mode`/`$activeTool`); P2's dialogStore/commandStore.
**Spec** (design: design-system-services.md §4.2, verbatim contract):

```ts
// src/state/hotkeyStore.ts — no react imports
import { atom, computed } from 'nanostores';
import { $mode, $activeTool } from './modeStore';
import { $chainSession } from './chainStore';      // (code: src/state/chainStore.ts:119)
import { $openDialog } from './dialogStore';        // P2
import { $paletteOpen } from './commandStore';      // P2

export type SurfaceId =
  | 'chain' | 'palette' | 'timeline' | 'outliner'
  | 'data-navigator' | 'engine-tree' | 'members' | 'glow-paint';

/** Maintained by a window 'focusin' listener resolving e.target.closest('[data-surface]'). */
export const $focusedSurface = atom<SurfaceId | null>(null);

export const $dialogOpen = computed([$openDialog, $paletteOpen],
  (d, p) => d !== null || p);

export const $activeScopes = computed(
  [$mode, $activeTool, $chainSession, $focusedSurface, $dialogOpen],
  (mode, tool, chain, surface, dialogOpen): ReadonlySet<string> => {
    const s = new Set<string>(['global']);
    if (!dialogOpen) s.add('viewport');       // dialogs suppress viewport, not global (v1 parity)
    s.add(`mode:${mode}`);
    if (tool) s.add(`tool:${tool}`);
    if (surface) s.add(`surface:${surface}`);
    if (chain) s.add('surface:chain');        // chain scope active while the SESSION exists,
                                              // not only while the window has focus (§4.2)
    return s;
  });

export function initHotkeyStore(): void { /* idempotent: registers the focusin listener once
  (guard flag — StrictMode-safe, same pattern as the toastQueue singleton) */ }
```

- The focusin listener: `document.addEventListener('focusin', …)` reading
  `(e.target as HTMLElement).closest?.('[data-surface]')?.getAttribute('data-surface')`,
  writing `$focusedSurface` (null when no ancestor carries the attribute). Also listen for
  `focusout` → if `document.activeElement` no longer sits inside a `[data-surface]`,
  set null (defer via microtask so focus moves within one surface don't flap).
- Call `initHotkeyStore()` from `src/main.tsx` boot wiring (beside
  `registerEditorAidStores`, code: `src/main.tsx:21`).
- Stamp surfaces that exist today: `data-surface="chain"` on the ChainPalette root card
  (code: `src/ui/chain/ChainPalette.tsx` root div — the `absolute left-3 top-16` card;
  P5B re-stamps when it moves into `FloatingWindow`, which already stamps per
  phase-00-01.md P0.10) and `data-surface="palette"` on the P2 CommandPalette dialog body.
  Timeline/outliner/etc. stamp in their owning phases.

`hotkeyStore.test.ts` (happy-dom or store-only where possible):
1. base scope set = `{global, viewport, mode:build}`.
2. `$openDialog` set → viewport drops out, global stays.
3. `$paletteOpen` → same.
4. mode/tool changes add `mode:animation` / `tool:measure`.
5. `$chainSession` non-null → `surface:chain` present without any focus.
6. focusin resolution: dispatch a focusin on an element under `<div data-surface="chain">`
   → `$focusedSurface === 'chain'` (happy-dom DOM test).
**Verify**: `pnpm test hotkeyStore` green.

---

#### P4.06 — Registry v2: scoped bindings, `GlobalHotkeys` v2, `chordsFor`, dev-time validation

**Goal**: Rebuild `src/ui/hotkeys/registry.ts` on the v2 binding contract and re-mount every
existing v1 binding through scope gating — behavior-identical at this task's boundary
(rebinds happen in P4.08).
**Files**:
- Rewrite `src/ui/hotkeys/registry.ts`
- Rewrite `src/ui/hotkeys/GlobalHotkeys.tsx`
- Create `src/ui/hotkeys/validateRegistry.ts`
**Depends on**: P4.05.
**Spec**:

Binding shape (design: design-system-services.md §4.1 — the implementation contract; keep
the v1 `chords: string[][]` display-token convention, code:
`src/ui/hotkeys/registry.ts:22-37` `HotkeyBinding`):

```ts
export type Scope = 'global' | 'viewport' | `mode:${Mode}` | `tool:${Tool}` | `surface:${SurfaceId}`;

export interface HotkeyBinding {
  id: string;                 // == commandId (menubar/palette/help join on this)
  label: string;              // help row text (kept from v1)
  keys: Keys;                 // react-hotkeys-hook syntax; 'mod+' for ⌘/Ctrl
  chords: string[][];         // display tokens; keyLabel resolves ⌘/Ctrl at render
  scope: Scope;
  when?: () => boolean;       // cheap store-predicate gate
  overrides?: string[];       // commandIds this binding intentionally shadows
  escRung?: number;           // Esc-ladder position (P4.07) — for Help + assertions
  options?: Options;          // preventDefault:false, useKey, enableOnFormTags…
  run: (e: KeyboardEvent) => void;
}
```

- **No off-registry bindings in v2** (design: §4.1): pure-key behaviors keep/get synthetic
  command ids — keep the existing v1 ids (`rotate-ws`, `nudge-move`, …) but rename to the
  design's dotted convention where the design names them: `transform.rotate.ws/ad/qe`,
  `transform.rotate.cycleAxes`, `transform.rotateStep.down/up`, `transform.nudge.*`,
  `edit.copy/paste/delete`, `edit.undo/redo`, `help.shortcuts`, `seat.exit`,
  `chain.begin` (design: §4.4 table commandId column). Where P2 already registered the
  command (edit.undo etc. for the Edit menu), the binding's `run` delegates to that
  command's `run` — one implementation (foundation §4: the undo/redo COMMAND owns its
  status flash; if P2/P3 already collapsed the 4-site undo-toast duplication, the binding
  simply calls the command; if the v1 `runUndo` wrapper is still in the registry, code:
  `src/ui/hotkeys/registry.ts:45-52`, delete it in favor of the command).
- **Scope assignment in this task** (behavior-preserving wave; the AUTHORITATIVE table's
  scope-narrowing, FINAL_DESIGN_INDEX hotkey table): rotate WSADQE/R (v1 code:
  `src/ui/hotkeys/registry.ts:63-102`) → `viewport`; nudge arrows → `viewport`; delete/
  copy/paste → `viewport`; undo/redo/⌘K-family/? → `global`; exit-seat-view Esc → replaced
  by the ladder in P4.07 (keep it functioning through this task: give it
  `scope: 'global'`, `when: () => $seatView.get() !== null`, `options: {preventDefault:false}`
  — v1 verbatim, code: `src/ui/hotkeys/registry.ts:202-216`).
  The v1 `F/⇧F` rotate-step binding (code: `src/ui/hotkeys/registry.ts:96-101`
  `rotate-step`) keeps working in THIS task and is rebound in P4.08.
- **`GlobalHotkeys` v2** (rewrite, keeping the load-bearing pieces verbatim):
  - One `BindingMount` child per binding, stable order (v1 pattern, code:
    `src/ui/hotkeys/GlobalHotkeys.tsx:14-22`). Bindings stay MOUNTED; gating is
    data-driven via `useHotkeys`' `enabled` option (design: §4.2).
  - `enabled` for a binding = `scopeActive(binding.scope) && (binding.when?.() ?? true)
    && precedenceClear(binding)` — evaluated per event (pass a function; react-hotkeys-hook
    5.3.3 supports `enabled` as a callback; if its signature disagrees, fall back to
    `ignoreEventWhen`, which definitely receives the event).
  - `isTypingInField` preserved **VERBATIM** — the `document.activeElement` check covering
    react-aria virtual focus (code: `src/ui/hotkeys/GlobalHotkeys.tsx:34-40`; census:
    ui-kit-hotkeys.md §1.3 — subtle, load-bearing; design §4.3). Applied as the shared
    `ignoreEventWhen` default exactly as v1, overridable per binding via
    `options.enableOnFormTags`.
  - NEW viewport-scope guard `isInteractiveCollectionFocus()` (design: §4.2): true when
    `document.activeElement?.closest('[role="grid"],[role="gridcell"],[role="row"],
    [role="listbox"],[role="option"],[role="menu"],[role="menubar"],[role="menuitem"],
    [role="tree"],[role="treeitem"],[role="tab"],[role="tablist"]')` is non-null.
    Viewport-scope bindings gate on
    `$activeScopes.get().has('viewport') && !isInteractiveCollectionFocus()` — this is
    what keeps bare letters (WASDQER, T/B/F/M, arrows) from fighting react-aria row
    navigation while a list has focus (foundation §11.1 "List-surface edit mirrors"
    rationale).
  - **Precedence** surface > tool > mode > viewport > global (design: §4.2): at module
    init, group bindings by normalized key-string; for each group sorted by precedence
    rank, a lower-precedence binding's `enabled` gains `&& !higherActive()` where
    `higherActive()` checks whether any higher-precedence binding in the group is
    currently scope-active + `when`-true. Normalization helper `normalizeKeys(keys)`:
    lowercase, split `,`-alternatives, sort modifier tokens (`mod+shift+z` ≡
    `shift+mod+z`), expand arrays — export it for the validator + tests.
- **`chordsFor(commandId: string): string[][]`** — exported lookup over the registry (the
  one path menus/palette/help share, design §4.7). Returns `[]` for unbound commands.
- **`validateRegistry()`** in `validateRegistry.ts`, invoked at module init under
  `import.meta.env.DEV` (design: §4.5): asserts (throwing with a readable message)
  (a) within every reachable active-scope combination, no two enabled bindings share a
  normalized key-string unless one lists the other in `overrides`; (b) every `keys`
  parses under `normalizeKeys`; (c) every binding id that is NOT a synthetic
  `transform.*`/`noop.*` id exists in commandStore's registry; (d) `escRung` values are
  unique; (e) **no bare-letter/digit binding can be enabled while a dialog is open** —
  i.e. every binding whose normalized keys contain a modifier-less letter/digit is either
  `viewport`/`mode:*`/`tool:*`/`surface:*`-scoped (all suppressed or surface-gated when
  `$dialogOpen`) or carries a `when` that returns false under `$dialogOpen` (the digits).
  The same function is exercised by the unit suite in P4.13.
**Verify**: `pnpm dev`: every v1 shortcut behaves exactly as before this task, PLUS:
WASD/arrows/Delete are now dead while any dialog is open (scope-narrowed to viewport —
this is the intended §11.2 change, "C5 fix" family) and dead while a GridList/menu has
focus; ⌘Z still works with a dialog open (global). Help dialog still renders (it reads the
registry — if the v1 `HOTKEY_GROUPS` grouping was deleted, keep a temporary flat export
for HelpDialog until P4.11 replaces it; note the TODO). `pnpm typecheck` green.

---

#### P4.07 — The Esc ladder: one ordered dispatcher, three hand-tuned paths deleted

**Goal**: Replace the v1 Escape layering-by-convention (registry seat-view binding, chain
palette local hook, AnimationPanel raw window listener) with the single 9-rung dispatcher.
**Files**:
- Create `src/ui/hotkeys/escLadder.ts`
- Create `src/ui/hotkeys/escLadder.test.ts`
- Modify `src/ui/hotkeys/registry.ts` (register the dispatcher + rung bindings; delete the
  v1 `exit-seat-view` binding)
- Modify `src/ui/chain/ChainPalette.tsx` (delete both local `useHotkeys`; add `⌘↩` as a
  `surface:chain` registry binding)
- Modify `src/ui/AnimationPanel.tsx` (delete the raw window keydown listener)
- Modify `src/three/EditorScene.ts` + `src/state/viewStore.ts` (gizmo-drag flag + cancel
  intent for rung 4)
**Depends on**: P4.06.
**Spec** (design: foundation.md §11.4 — the nine rungs, top wins, each fires only if the
previous didn't; design-system-services.md §4.6 — ownership + preventDefault table):

`escLadder.ts`:

```ts
export interface EscRung {
  rung: number;                    // 3..8 — flexo-owned rungs only (see table below)
  id: string;                      // commandId for Help ("What Esc does, in order")
  label: string;
  when: () => boolean;             // applicability (store predicate)
  run: () => void;
  preventDefault: boolean;         // per-rung contract (rungs 6 and 8: false — v1 contracts)
  enableWhileTyping?: boolean;     // rung 6 (chain): true — v1 enableOnFormTags parity
}
export function registerEscRung(r: EscRung): void;   // sorted insert; DEV: duplicate-rung throw
export function dispatchEsc(e: KeyboardEvent): void;
```

`dispatchEsc` — the single ordered dispatcher:
1. `if (e.defaultPrevented) return;` — rung 1 (numberDraft dirty revert: preventDefault +
   stopPropagation when dirty, code: `src/ui/numberDraft.ts` Escape handling — untouched,
   field-local) and rung 2 (react-aria menu/popover/dialog dismiss + `DialogViewStack`
   view-pop — react-aria preventDefaults the Escapes it consumes) have already won.
2. `if ($openDialog.get() !== null) return;` — an open overlay dialog owns Esc
   (react-aria dismiss / DialogViewStack pop); flexo rungs must not fire underneath it.
   (The palette is NOT `$openDialog` — it is rung 3 via `$paletteOpen`.)
3. `if ($gizmoDragging.get()) { requestGizmoCancel(); return; }` — rung 4 (below).
4. Walk registered rungs ascending; skip a rung when
   (`!r.enableWhileTyping && isTypingInField()`) or `!r.when()`; on the first hit: if
   `r.preventDefault` then `e.preventDefault()`; `r.run()`; return.
5. Fall-through = rung 9: **nothing** — Escape never clears the selection and is never
   globally preventDefault'ed (design: foundation.md §11.4 rung 9; census:
   ui-kit-hotkeys.md §5 invariant).

The dispatcher mounts as ONE registry binding: id `esc.ladder`, keys `'escape'`,
scope `'global'`, `options: { preventDefault: false, enableOnFormTags: true }` (the
per-rung `enableWhileTyping` re-applies the typing guard — chain-cancel must fire from
inside its own text fields, v1 parity, code: `src/ui/chain/ChainPalette.tsx:75`
`enableOnFormTags: true`).

Rung registrations in this task (each cites its v1 source-of-truth):

| Rung | id | when | run | preventDefault |
|---|---|---|---|---|
| 3 | `palette.close` | `$paletteOpen.get()` | close palette (commandStore) | yes |
| 4 | (dispatcher-inline, above) | `$gizmoDragging` | `requestGizmoCancel()` | no (handled in scene) |
| 5 | `tool.cancel` | `$measureTool.get() !== 'none' \|\| $isExhaustPlacing.get()` | measure: `setMeasureTool('none')` (code: `src/state/measurementStore.ts:136` — EditorScene's existing `$measureTool` subscription cancels the pending pick + cursor, code: `src/three/EditorScene.ts:478-484`); exhaust: `setEngineExhaustGizmo(false)` (code: `src/state/engineStore.ts:319`) | yes |
| 6 | `chain.cancel` | `$chainSession.get() !== null` | `closeChain()` (code: `src/state/chainStore.ts:362`) — **P4 keeps v1 silent-cancel; the ≥1-step discard-confirm (LOCKED) ships with the chain FloatingWindow in P5B.28** (`enableWhileTyping: true`) | **no** (v1 contract) |
| 7 | `anim.unwind` | `$mode.get() === 'animation' && ($editKeyframeId.get() \|\| $activeJointId.get())` | keyframe → `$editKeyframeId.set(null)`; else joint → `$activeJointId.set(null)` — **deliberate design change from v1's 3-step unwind: the clip no longer closes via Esc ("the mode itself never exits via Esc", foundation §11.4 rung 7); v1 source being replaced: the raw window listener** (code: `src/ui/AnimationPanel.tsx:83-95` the `useEffect` keydown) | yes |
| 8 | `seat.exit` | `$seatView.get() !== null` (code: `src/state/ivaStore.ts:41`) | `exitSeatView()` (code: `src/state/ivaStore.ts:64`) | **no** (v1 contract — code: `src/ui/hotkeys/registry.ts:207-215` comment preserved) |

Rung 5's `when`/`run` are re-pointed to `$activeTool` by P5B (which also adds marquee);
leave a `// P5B re-points this to $activeTool` comment.

Rung 4 plumbing (the `$gizmoDragging`/`requestGizmoCancel` referenced above): add to
`src/state/viewStore.ts` (scene↔UI intent atoms live here already — the `$cameraSnap`
nonce pattern, code: `src/state/viewStore.ts:58`):

```ts
/** True while a TransformControls drag is in flight (written by EditorScene). */
export const $gizmoDragging = atom<boolean>(false);
/** One-shot cancel-drag intent (nonce pattern like $cameraSnap). */
export const $gizmoCancel = atom<{ nonce: number } | null>(null);
export function requestGizmoCancel(): void { /* bump nonce */ }
```

EditorScene: write `$gizmoDragging.set(dragging)` inside the existing `onDraggingChanged`
callback (code: `src/three/EditorScene.ts:455-462` `onDraggingChanged` — it already flips
`suppressPickDrag` there); subscribe `this.sub($gizmoCancel, (cmd) => { if (cmd && this
drag in flight) this.gizmo.reset(); })` — `TransformControls.reset()` restores the
drag-start object state, which is exactly rung 4's "gizmo drag cancel" (foundation §11.4
rung 4 calls it TransformControls built-in; `reset()` IS that built-in, it just needs the
Esc trigger routed to it). The undo step pushed at drag start (code:
`src/three/EditorScene.ts:440-448` the `pushUndo` in the drag-start callback) then
describes a no-op change — acceptable and v1-consistent (undoing it restores the same
state); do NOT try to pop the undo stack. SEAM: if P3's `modifierStore` already shipped a
`$isDragging` atom fed by the same callback (design: design-system-services.md §1.4 hint
deps), reuse it instead of adding `$gizmoDragging` — one flag, two names is forbidden.

Deletions:
- `registry.ts`: the v1 `exit-seat-view` binding (code:
  `src/ui/hotkeys/registry.ts:202-216`) — absorbed as rung 8.
- `ChainPalette.tsx`: BOTH local `useHotkeys` calls (code:
  `src/ui/chain/ChainPalette.tsx:68-75`). `Esc` is rung 6. `⌘↩` Apply becomes a registry
  binding: id `chain.apply`, keys `'mod+enter'`, scope `'surface:chain'` (active whenever
  the session exists — hotkeyStore §4.2), `options: { enableOnFormTags: true,
  preventDefault: true }` (v1 options verbatim). Its `run` needs the apply closure —
  export the apply logic from the component file into a plain function
  `applyChainSession()` (move the existing `apply` body, code:
  `src/ui/chain/ChainPalette.tsx` `apply` — it only reads stores, no render values, as
  its own comment notes) and have both the footer button and the binding call it.
- `AnimationPanel.tsx`: the Escape `useEffect` (code: `src/ui/AnimationPanel.tsx:83-95`)
  — absorbed as rung 7. Keep `closeAnimation()` (still used by the Close button).

`escLadder.test.ts` (happy-dom; drive `dispatchEsc` with synthetic KeyboardEvents +
store setup):
1. defaultPrevented event → no rung runs.
2. `$openDialog` set + seat view active → nothing runs (dialog owns Esc).
3. palette open + chain session open → palette closes, chain untouched (order).
4. measure armed + chain open → measure disarms, chain survives (rung 5 before 6).
5. chain open while typing in a field → chain cancels (`enableWhileTyping`).
6. animation mode, keyframe pinned + joint active → first Esc unpins keyframe only,
   second clears joint, third does nothing (mode survives).
7. seat view only → `exitSeatView` runs and the event is NOT defaultPrevented.
8. nothing applicable → event untouched, selection atoms untouched.
**Verify**: `pnpm test escLadder` green. Manual: the entire ladder walk from the phase
checklist item 3; regression — Esc in a dirty numeric field reverts the field and does NOT
cancel an open chain session (numberDraft stopPropagation still wins, census:
ui-kit-hotkeys.md §5).

---

#### P4.08 — Binding-table migration wave: rebinds + new global/viewport/mode keys

**Goal**: Land every remaining binding from the AUTHORITATIVE table that has existing
behavior to bind (FINAL_DESIGN_INDEX.md hotkey table; design-system-services §4.4 owners
column).
**Files**:
- Modify `src/ui/hotkeys/registry.ts`
- Modify `src/ui/commands/*` (create the few commands listed below if P2 did not)
- Modify `src/ui/rotateControls.ts` (no behavior change — only if labels mention F/⇧F)
**Depends on**: P4.07; P4.04 (mode commands).
**Spec** — each row: scope · keys · commandId · exact `run` target:

**Rebinds** (the documented v1→v2 diff — Help shows it in P4.11):
1. `viewport` `[` / `]` → `transform.rotateStep.down/up`: replace the v1 `rotate-step`
   binding's keys `['f','shift+f']` (code: `src/ui/hotkeys/registry.ts:96-101`) with
   `'['` → `lowerRotateStep()` (smaller) and `']'` → `raiseRotateStep()` (larger)
   (code: `src/ui/rotateControls.ts:36` `lowerRotateStep`, `:30` `raiseRotateStep`;
   design: foundation S6 — "bracket pair reads
   as smaller/larger"). Two separate bindings (one key each) so Help chips are clean.
2. `viewport` `F` → `view.frameSelection` — registered in P4.09 with the command (listed
   here for the diff's completeness).
3. `global` `⌘K` → `palette.open` and `global` `⇧⌘K` → `chain.begin` (LOCKED): P2 owns
   the palette command; ENSURE the v1 `action-chain` binding (code:
   `src/ui/hotkeys/registry.ts:162-168` keys `'mod+k'`) is now keys `'mod+shift+k'`, id
   `chain.begin`, run `toggleChainPalette()` (code:
   `src/ui/chain/openChainPalette.ts:24`) — P5B upgrades its guards/confirm; and that
   `'mod+k'` maps to the palette command. If P2 already performed this swap, verify and
   move on.

**New global bindings**:
4. `1 2 3 4 5` → `mode.build/animation/data/engine/surface` (P4.04 commands), one binding
   per digit, `when: () => !$dialogOpen.get()` — a mode must never switch invisibly
   behind an overlay dialog (design §4.4 row 1, the C5 fix; the validator's bare-digit
   assertion depends on exactly this `when`).
5. `⌘S` → `noop.autosaveFlash`: `run` = `toast('Autosaved ✓')` via the P3 facade
   (transient tier — design: foundation.md §3 File-menu note; system-services §2.2
   table row 1). `preventDefault: true` (suppress the browser save dialog). Register the
   command too (palette-findable, title "Autosave status").
6. `⌥[` / `⌥]` → `window.toggleLeft/Right`: `toggleSidebar('left'/'right')` from
   layoutStore (phase-00-01.md P0.09 API). keys `'alt+['` / `'alt+]'` — bracket keys with
   Alt are layout-sensitive on some keyboards; add `options: { useKey: true }` if plain
   `alt+[` fails on macOS during manual testing (note in code).
7. `⌘O` / `⇧⌘A` / `⌘E` / `⌘,` → the P2 dialog-opening commands (Projects… / Asset
   Manager… / Export to KSA… / Settings…). Look up P2's actual command ids; bind, don't
   re-implement. (Until P8/P9 these open the interim dialogs P2 mapped — binding is
   still correct.) `preventDefault: true` on all four (⌘O/⌘S-class browser defaults).
8. `?` → `help.shortcuts` — keep the v1 binding VERBATIM including
   `options: { useKey: true, ignoreModifiers: true }` (code:
   `src/ui/hotkeys/registry.ts:191-201`; census invariant §5 — layout-agnostic).

**New viewport bindings**:
9. `T` / `⇧T` → `tool.cycleGizmo`: cycle `$toolMode` (code:
   `src/state/editorStore.ts:211` `$toolMode`) through
   `translate → rotate → scale → translate` (T forward, ⇧T backward). Feedback: status
   transient `Tool: Rotate` via `toast()`. Display truth under exhaust clamping is owned
   by `$effectiveToolMode` (code: `src/state/engineStore.ts:284`) — cycling still writes
   `$toolMode` (same as the v1 toolbar buttons; the clamp is a read-side computed).
   Register a `tool.cycleGizmo` command (palette: "Cycle gizmo tool").
10. `M` → `tool.measure`: toggle — `$measureTool.get() === 'none' ?
    setMeasureTool('point') : setMeasureTool('none')` (code:
    `src/state/measurementStore.ts:78,136`; `'point'` is the point-to-point tool, type
    `MeasureTool`, code: `src/state/measurementStore.ts:21`). Viewport-scoped for
    symmetry with `B` — a tool must never arm invisibly behind a dialog (design §4.4
    row M, C5 fix). P5B re-routes arming through `$activeTool` (phase-05b F-section);
    the binding's target function stays `setMeasureTool` either way.
11. `⌘A` / `⌥⌘A` / `⇧⌘I` → `select.all` / `select.none` / `select.invert`. These
    commands power the P2 Select menu and are ALREADY IMPLEMENTED — P2.04 shipped
    `selectAllEntities()`/`invertSelection()` in editorStore and P2.09 registered the
    commands (canonical ids incl. `select.none` for Deselect). **Just BIND the keys to
    the existing commands.** P5A.03 later re-bases them on `selectionOps.ts` and deletes
    the P2.04 helpers — do not fork a third implementation. Only if P2 genuinely stubbed
    them, implement over the v1 index stores:

```ts
// select.all — every entity on listed + unlocked layers (foundation §3 Select menu)
const part = $part.get();
const ok = (layerId: string) => isLayerListed(layerId) && !isLayerLocked(layerId);
setSelectedPlacements(part.placements.flatMap((p, i) => ok(p.layerId) ? [i] : []));
setSelectedConnectors(part.connectors.flatMap((c, i) => ok(c.layerId) ? [i] : []));
// …same for setSelectedColliders / setSelectedIvaSeats / setSelectedLights /
// setSelectedKittens (code: src/state/editorStore.ts:1868-1995 the six setters;
// layer guards: src/state/layerStore.ts:52,57 isLayerLocked/isLayerListed)
```

    `select.none` = `clearSelection()` (code: `src/state/editorStore.ts:2013`).
    `select.invert` = per kind, indices not currently selected, same layer guard.
    Selection changes are NOT undo steps (v1 invariant — selection setters don't push).
    NOTE (design §11.1 exception): react-aria lists keep their own row-⌘A precedence
    automatically — viewport scope is inactive while a collection has focus
    (`isInteractiveCollectionFocus`, P4.06).
12. `⌘C ⌘X ⌘V ⌘D ⌫` → `edit.copy/cut/paste/duplicate/delete`, viewport scope (the v1
    copy/paste/delete bindings were scope-narrowed in P4.06; add the two NEW ones):
    - `edit.cut` (`⌘X`): trivial composite `copySelected(); removeSelected();` (code:
      `src/state/editorStore.ts:1626` `copySelected`, `:1361` `removeSelected` — the
      remove pushes the single undo step; copy does not push. One undo step total,
      design: foundation §3 Edit menu "Cut — copy + delete (new trivial composite)").
      Status flash `Cut N items` via the copy count.
    - `edit.duplicate` (`⌘D`): `duplicateSelected()` (code:
      `src/state/editorStore.ts:1477` — pushes its own undo step). `preventDefault: true`
      (browser bookmark). The LOCKED offset-on-nudge-axis semantics upgrade lands in
      P5B (phase-05b owns duplicate-with-offset); binding target unchanged then.
13. `mode:engine` `X` → `engine.toggleExhaust`:
    `setEngineExhaustGizmo(!$engineExhaustGizmo.get())` (code:
    `src/state/engineStore.ts:43,319`; design: design-data-engine-modes.md §B10 — new,
    v1 had none). `tool:exhaust` `,`/`.` target cycling is DEFERRED to P7 (needs
    `$activeTool==='exhaust'` wiring from P5B.27 — ledgered in P4.10).

Every binding above also appears (or its command already appears) in commandStore so the
palette and menus can run it; chips render via `chordsFor` (P4.12).
**Verify**: manual sweep of every key above (desktop): digits dead while the Projects
dialog is open; `[`/`]` flash the step; `F` does nothing YET (P4.09); `T` cycles and the
Tool display follows; `M` arms/disarms measure and Esc disarms it; `⌘A` selects everything
on listed+unlocked layers, `⇧⌘I` inverts, `⌥⌘A` clears; `⌘X` cuts as one undo step; `⌘D`
duplicates; `X` toggles exhaust only in Engine mode; `⌘S` flashes "Autosaved ✓"; `⌥[`/`⌥]`
collapse the sidebars. `pnpm test` green (the P4.13 suite will lock this table in).

---

#### P4.09 — Camera commands: Frame Selection (`F`), selection-centroid snaps, Reset Camera

**Goal**: The LOCKED #7 camera features as mode-agnostic viewport commands: frame the
selection with orbit re-centering, snap views orbiting the selection centroid, explicit
reset.
**Files**:
- Modify `src/state/viewStore.ts` (frame intent atom)
- Modify `src/three/Viewport.ts` (`snapCamera` target param; new `frameBounds`)
- Create `src/three/cameraFraming.ts` + `src/three/cameraFraming.test.ts` (pure fit math)
- Modify `src/three/EditorScene.ts` (intent subscription + centroid supply)
- Create/extend `src/ui/commands/viewCommands.ts` (three commands + F binding)
- Modify the P2 View-menu MenuSpec (point Frame Selection / Reset Camera / Camera Snap ▸
  at these commands, if P2 stubbed them)
**Depends on**: P4.06 (registry), P4.08 (binding conventions).
**Spec** (design: design-build-mode.md §5.3 — the three-row command table, LOCKED #7;
foundation.md §3 View menu):

- `viewStore.ts` — follow the existing one-shot nonce pattern (code:
  `src/state/viewStore.ts:58` `$cameraSnap`, `:78` `$cameraRestore`):

```ts
/** One-shot frame-selection command (nonce pattern like $cameraSnap). */
export const $cameraFrame = atom<{ nonce: number } | null>(null);
let frameNonce = 0;
export function frameCamera(): void { $cameraFrame.set({ nonce: ++frameNonce }); }
```

  `resetCamera()` already exists and does exactly the design's Reset (default pose,
  origin target, up reset — code: `src/state/viewStore.ts:91`); reuse.
- `src/three/cameraFraming.ts` — pure, unit-testable:

```ts
import type { ComputedBounds } from '../measure/bounds';
/** Distance that fits a bounds sphere in a perspective frustum, with margin. */
export function frameDistance(size: {x:number;y:number;z:number}, fovDeg: number, aspect: number): number {
  const radius = 0.5 * Math.hypot(size.x, size.y, size.z);
  if (radius < 1e-6) return 5;                       // empty/point selection → default distance
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect); // horizontal must fit too
  return (radius / Math.sin(Math.min(vHalf, hHalf))) * 1.1;  // 10% margin
}
export function boundsCenter(b: Pick<ComputedBounds, 'min' | 'max'>): {x:number;y:number;z:number} { /* (min+max)/2 */ }
```

- `Viewport.ts`:
  - `snapCamera(dir, target?: THREE.Vector3)` (code: `src/three/Viewport.ts:184`
    `snapCamera`): replace the hard `target.set(0, 0, 0)` with
    `target.copy(targetOverride ?? ORIGIN)`. Everything else (distance preservation,
    top/bottom up-vector fix, `$cameraState` write) stays byte-identical (design §5.3:
    "preserves distance; top/bottom up-vector fix preserved").
  - New `frameBounds(center: THREE.Vector3, size: THREE.Vector3)`: keep the CURRENT view
    direction (`camera.position - controls.target`, normalized; fall back to the default
    (3,2,4) direction when degenerate), set `controls.target = center`, distance from
    `frameDistance(size, camera.fov, aspect)`, `camera.position = center + dir·dist`,
    `lookAt`, `controls.update()`, write `$cameraState.set(this.readCameraState())` (same
    tail as `snapCamera`).
- `EditorScene.ts` — next to the existing camera subscriptions (code:
  `src/three/EditorScene.ts:633-637` the `$cameraSnap`/`$cameraRestore` subs):
  - `this.sub($cameraFrame, (cmd) => { if (cmd) this.frameSelection(); })`.
  - `private frameSelection()`: `objects = this.selectedObjects().map(o => o.group)`
    (code: `src/three/EditorScene.ts:1516` `selectedObjects`); if empty →
    `objects = [...this.objects.values()].map(o => o.group)` (frame-all fallback,
    design §5.3); compute `computeSelectionBounds(objects, 'world')` (code:
    `src/measure/bounds.ts:47`); null/empty → `this.viewport.frameBounds(ORIGIN,
    ZERO_SIZE)` (which yields the default-distance origin view); else
    `frameBounds(center, size)`.
  - Selection-centroid snaps: change the `$cameraSnap` subscription to
    `this.viewport.snapCamera(cmd.dir, this.selectionCentroid() ?? undefined)` where
    `selectionCentroid()` returns the world bounds center of `selectedObjects()` or null
    when nothing is selected (design §5.3: "orbit target = selection centroid when a
    selection exists, else origin"; LOCKED #7).
  - All of this renders through the existing on-demand invalidation (`sub()` redraws —
    constitution: no continuous loop).
- Commands + bindings (`viewCommands.ts`):
  - `view.frameSelection` — title "Frame Selection", run `frameCamera()`; registry
    binding scope `viewport`, keys `'f'` (THE rebind — v1 `F` was rotate-step, now on
    `[`/`]` per P4.08). Menu home: View → Frame Selection (P2 MenuSpec re-point).
  - `view.resetCamera` — run `resetCamera()`; View menu + palette (no key).
  - `view.cameraSnap.front/back/left/right/top/bottom` — run `snapCamera(dir)` (code:
    `src/state/viewStore.ts:61`); View → Camera Snap ▸ submenu + palette (no keys).
    (If P2's View menu already registered snap commands around the v1 `ViewButton`
    behavior, re-point their `run` — the snap now orbits the selection centroid via the
    EditorScene change with zero command-side difference.)
- `cameraFraming.test.ts`: (1) `frameDistance` fits a unit cube at fov 50/aspect 16:9
  (distance > radius, < 10); (2) degenerate size → 5; (3) wide-aspect vs tall-aspect uses
  the tighter axis (distance(aspect 0.5) > distance(aspect 2) for a cube... assert the
  monotonic relation by comparing both to the square case); (4) `boundsCenter` midpoint.
**Verify**: `pnpm test cameraFraming` green. Manual: select one SubPart off-origin → `F`
fills the view with it and orbit now pivots around it; clear selection → `F` frames the
whole part; empty part → origin default view; View ▸ Camera Snap ▸ Top with a selection
orbits above the SELECTION, without one above origin; View ▸ Reset Camera restores the
boot pose; camera state still persists per project (save/reload keeps the framed pose —
the `$cameraState` write path is shared).

---

#### P4.10 — List-surface edit-mirror helper + the deferred-bindings ledger

**Goal**: Ship the mechanism later phases use to register list-focus edit mirrors, and
pin every authoritative-table binding that CANNOT land in P4 to its owning phase — in
code, where the conflict validator sees the plan.
**Files**:
- Create `src/ui/hotkeys/listSurfaceMirrors.ts`
- Modify `src/ui/hotkeys/registry.ts` (DEFERRED ledger comment block)
**Depends on**: P4.08.
**Spec**:
- `registerListSurfaceEditMirrors(surface: SurfaceId)` (design: foundation.md §11.1
  "List-surface edit mirrors"; design-system-services §4.4 last row): returns/registers
  six bindings at scope `surface:<surface>` — keys `⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I`, ids
  `mirror.<surface>.copy` etc., each delegating to the SAME command `run` as the viewport
  binding (`edit.copy/cut/paste/duplicate/delete`, `select.invert`) so behavior can never
  fork. `options: {}` default (typing guard applies — a rename field inside the list must
  not lose ⌘C to the mirror... it doesn't: these are modifier chords, react-hotkeys-hook
  fires them, but `isTypingInField` suppresses — EXACTLY the v1 behavior where these were
  globals suppressed while typing; census ui-kit-hotkeys.md §1.3). Deliberately NO `⌘A`
  mirror — each list's own react-aria row select-all keeps precedence (foundation §11.2
  table, exception line). Not called by anything in P4; unit-covered via P4.13 (the
  validator must accept a registry with mirrors registered for a test surface).
- DEFERRED ledger — a single comment block in `registry.ts`, and the same table in this
  plan (implementers of later phases: delete rows as you land them):

| Binding (AUTHORITATIVE table row) | Owning phase |
|---|---|
| `viewport B` arm box-select (marquee) | P5A (tool + gesture) |
| measure/seat-view/exhaust arming through `$activeTool` + tool defs + status segments | P5B (F-section tasks) |
| chain discard-confirm on Esc/mode-switch/⇧⌘K re-invoke (LOCKED) | P5B.28 |
| `surface:outliner` `⌘F` + rename Enter/Esc + edit mirrors (v1 rename source: code: `src/ui/LayersPanel.tsx:428-432` `onKeyDown`) | P5A (Outliner) |
| `surface:data-navigator` mirrors | P6 |
| `surface:engine-tree` mirrors · `tool:exhaust` `,`/`.` cycle + Esc-rung re-point | P7 |
| `surface:glow-paint` `⌘Z`/`⇧⌘Z` per-stroke paint undo | P8 |
| `mode:animation` `Space` · `,` `.` · `K` (transport / prev-next key / insert at playhead) | P11 (timeline) |
| `surface:timeline` `←→ ⇧←→ ⌘A ⌥⌘A ⌘C ⌘X ⌘V ⌫ = - F ⇧F Esc` + `members` mirrors | P11 |
| ModeSwitcher/ModeTabBar attention dots | P7 (engine blockers) / P11 (draft clips) |

**Verify**: `pnpm typecheck`; the ledger block exists verbatim in `registry.ts`; calling
`registerListSurfaceEditMirrors('outliner')` in a scratch test registers six bindings that
pass `validateRegistry()` (then remove the scratch — P4.13 keeps a permanent variant).

---

#### P4.11 — Help dialog v2: regenerated from the registry, scope-grouped + static sections

**Goal**: Replace the v1 flat HOTKEY_GROUPS help with the registry-generated, complete
Help; fold `$helpOpen` into dialogStore.
**Files**:
- Rewrite `src/ui/hotkeys/HelpDialog.tsx`
- Create `src/ui/hotkeys/helpStatics.tsx` (the four hand-authored sections)
- Verify `src/state/helpStore.ts` is already deleted (P2.05 did it — grep only, no work)
**Depends on**: P4.08 (final binding set), P4.07 (rung metadata).
**Spec** (design: design-system-services.md §5.1; foundation.md §11.5):
- Content = registry render, grouped by scope with human titles: **Everywhere** (global) ·
  **In the viewport** · **Build mode** … per `mode:*` · **While measuring / Seat view /
  Box select** (`tool:*`) · **Chain window / Timeline / Command palette / Outliner**
  (`surface:*`). Groups render even when their scope is inactive (documentation) and even
  when currently empty EXCEPT fully-empty groups are skipped (deferred surfaces appear as
  their phases land — no placeholder rows). Row = binding `label` + chord chips via kit
  `Kbd`/`keyLabel` (P0.04 moved them to `src/ui/kit/`; v1 source code:
  `src/ui/hotkeys/Kbd.tsx`, `src/ui/hotkeys/keyDisplay.ts:17` `keyLabel` — import from
  kit). Multi-chord alternatives keep the v1 "or" rendering (code:
  `src/ui/hotkeys/HelpDialog.tsx:14` `HelpDialog` — the existing table styling is a fine
  base; restyle dense per §1.2 tokens).
- Static sections from `helpStatics.tsx` (hand-authored data arrays, versioned next to
  the registry so review catches drift — design §5.1):
  1. **Pointer & modifiers**: additive click (⌘/⌃/⇧), list ⇧-range grow-only, ⌘-toggle,
     ⌥-drag duplicate (P5B), marquee ⇧-drag / ⌥⇧ subtract / B (P5A), ⌃ temporary snap
     invert (P5B), timeline double-click-insert (P11) — include the future gestures NOW
     with a "(soon)" chip IF the implementer prefers honesty over completeness… **No**:
     include ONLY shipped gestures at P4 (additive click, ⇧-range, ⌘-toggle) and extend
     the array in the gesture-owning phases (each already has a Help-static line item in
     its plan; leave a `// EXTEND in P5A/P5B/P11` comment). Names never lie.
  2. **Numeric fields**: arrows step, ⇧×10 / ⌥×0.1, Enter commit, Esc revert-when-dirty,
     live-commit-while-typing (census: ui-kit-hotkeys.md §1.5 — field-local by design).
  3. **What Esc does** — render the rung table from the P4.07 registry
     (`registeredRungs()` ordered; plus the two externally-owned rungs 1/2 and rung 9 as
     static rows).
  4. **Command palette** (closes the FINAL_DESIGN_INDEX `surface:palette` row without
     registering fake bindings — these keys are component-local virtual-focus handling in
     P2.14 by design): `↑`/`↓` move the highlighted row · `↩` run · `⌘↩` run and keep
     open (add-several) · `Esc` close. Static rows, chips via kit `Kbd`. The same
     helpStatics array gains the Outliner rename rows in P5A.14 — leave an
     `// EXTEND in P5A.14 (outliner rename)` comment.
- Footer: v1 note "Shortcuts are disabled while typing…" (preserve text) + the **rebind
  diff box**: "`F` now frames the selection (rotate step moved to `[` `]`); `⌘K` now
  opens the command palette (chain moved to `⇧⌘K`)". Persist
  `flexo:rebindNoticeSeen = <first-seen epoch ms>` via `persistentJSON`; render the box
  prominently for 30 days after first seen, then inside a collapsed `DisclosureSection`
  (design §5.1). No migration concerns — a fresh key.
- Open paths: `?` binding (`help.shortcuts`), Help menu item — both via
  `dialogStore.$openDialog = { id: 'help' }` (**`'help'` is P2.02's DialogId union
  member — there is no `'shortcuts'` id; P2.05 already wired both paths, verify only**).
  `src/state/helpStore.ts` was DELETED in P2.05 — `grep -rn "helpStore" src/` must
  already be zero; if not, that is a P2 straggler to chase, not new work. The dialog
  mounts once at root per the P2 dialog framework, size L (`fullscreen` desktop /
  `cover` phone — v1 mapping kept).
**Verify**: `pnpm dev`: `?` opens Help; every P4-live binding appears exactly once, under
the right group; chain window keys listed under "Chain window"; Esc section lists rungs in
ladder order; numeric-field table present; rebind box present. `grep -rn "helpStore" src/`
→ zero hits. `?` still works on a non-US layout simulation (the `useKey` option — spot
check by switching macOS input source if available; otherwise trust the preserved option).

---

#### P4.12 — Menubar + palette chord chips render from `chordsFor`

**Goal**: One lookup path for every shortcut chip — menu labels can never drift from
bindings (Law 4, made mechanical).
**Files**:
- Modify the P2 MenuSpec item renderer (menubar + MenuSheet)
- Modify the P2 `CommandPalette` row renderer
**Depends on**: P4.06 (`chordsFor`), P4.08 (bindings final).
**Spec** (design: design-system-services.md §4.7; foundation.md §4): wherever P2 rendered
shortcut chips (it had only the v1 registry or hardcoded chords to draw from), replace the
source with `chordsFor(commandId)` resolved at menu open / per palette keystroke; chips
via kit `Kbd` + `keyLabel`. Commands with no binding render no chip. Delete any P2-era
chord tables/hardcoded chord props (grep the MenuSpec for literal `chords`/`⌘` strings).
**Verify**: menubar shows `⌘E` on Export to KSA…, `F` on View ▸ Frame Selection, `⇧⌘K` on
Begin Action Chain…, `1..5` on nothing (mode items are switcher/status/palette surfaces —
digits show in palette rows "Go to Build mode `1`"); temporarily change one binding's keys
in the registry → menu chip + palette chip + Help row all change together (then revert).

---

#### P4.13 — Conflict-detection unit suite: `hotkeyRegistry.test.ts`

**Goal**: The §4.5 contract as a permanent test — no duplicate keys in any reachable scope
set, no bare keys behind dialogs, registry/commandStore coherence.
**Files**:
- Create `src/ui/hotkeys/hotkeyRegistry.test.ts`
**Depends on**: P4.06–P4.10.
**Spec** (design: design-system-services.md §4.5, item by item):
1. **Scope-set enumeration**: build every reachable active-scope combination —
   `global ∪ {viewport?} ∪ mode:<each of 5> ∪ tool:<each of 6 | none> ∪
   surface:<each of 8 | none>` (dialog-open variants drop `viewport`). For each set,
   collect bindings whose scope ∈ set, treat `when`-gated bindings as enabled (worst
   case), and assert no two share a `normalizeKeys` entry unless one names the other in
   `overrides`.
2. **Dialog assertion**: with `$openDialog` simulated set, assert NO enabled binding has a
   modifier-less letter/digit key — mode digits must be `when`-gated (call each digit
   binding's `when` under a mocked open dialog and assert false), tool letters must be
   viewport/mode/tool/surface-scoped (design: "guards the C5 class of regressions
   permanently").
3. **Parse + chords coherence**: every `keys` normalizes without throwing; every binding's
   `chords` tokens correspond to its keys via a chord-from-keys generator (write the
   generator in the test or import the registry's; explicit-override escape hatch = a
   binding may set `chordsExplicit: true`… only add that field if a real mismatch exists
   — the `?` binding will need it: keys `?`, chord `[?]` matches; arrows use symbol
   tokens `↑↓←→` — map in the generator).
4. **Command existence**: every binding id resolves in commandStore OR matches the
   synthetic allowlist prefixes (`transform.`, `noop.`, `esc.`, `mirror.`, `seat.`,
   `palette.`, `chain.apply`).
5. **Esc rungs**: unique, ascending-registered, and rungs 6/8 have
   `preventDefault === false` (the two v1 contracts).
6. **Mirror helper**: `registerListSurfaceEditMirrors('outliner')` into a scratch
   registry copy → validation still passes; mirror ids delegate to existing commands.
7. **Rebind diff lock-in**: assert `chordsFor('view.frameSelection')` = `[['F']]`,
   `chordsFor('transform.rotateStep.down')` = `[['[']]`, `chordsFor('palette.open')` =
   `[['mod','K']]`, `chordsFor('chain.begin')` = `[['mod','shift','K']]` — the LOCKED
   rebinds can't silently regress.
**Verify**: `pnpm test hotkeyRegistry` green; intentionally add a colliding `viewport 'f'`
binding locally → suite fails with a readable message; revert.

---

#### P4.14 — Phone: ModeTabBar mounted, Panel sheet re-tap, condensed chip re-point

**Goal**: Phone parity for the mode machine (LOCKED #6): bottom mode tabs, re-tap opens
the mode's Panel sheet.
**Files**:
- Modify the P1 phone frame component (mount `ModeTabBar`)
- Create `src/ui/phone/PanelSheet.tsx` (thin `Sheet` host for `ModeSidebar`)
- Modify the P3 `CondensedStatusBar` mode/tool chip (read `$mode`)
**Depends on**: P4.03, P4.04.
**Spec** (design: foundation.md §12 ModeTabBar + frame; phase-00-01.md P1.06 — the
primitive is pure presentation, unmounted, awaiting exactly this task):
- Mount `ModeTabBar` as the last flex child of the phone frame (below the condensed
  status strip), `tabs` = the five modes (same icons/labels as P4.04's switcher; icon
  above 11px label — the primitive handles rendering), `activeId={useStore($mode)}`,
  `onSelect={(id) => runCommand('mode.' + id)}` (the same commands — one dataset),
  `onReselect={() => setPanelSheetOpen(true)}`.
- `PanelSheet`: P1 `Sheet` primitive (detents 50/92%) hosting `<ModeSidebar />` — the
  identical desktop panel component at `sm` density (foundation §12 Sheet row). Local
  ephemeral open atom or component state; closes on drag-dismiss. This is the interim
  Panel sheet — mode phases (P5A+) replace `ModeSidebar`'s per-mode bodies, and the sheet
  inherits them for free.
- `CondensedStatusBar` mode chip: `useStore($mode)` icon + name (if P3 built it against a
  placeholder or `$inspectorMode`, re-point). The tool-cancel-on-tap behavior is P5B's
  (tools arrive in the slot there).
**Verify**: phone width in devtools: five tabs render safe-area-padded; tapping switches
mode (viewport + placeholder sidebars respond); re-tapping the active tab opens the sheet
with that mode's panel; Animation tab shows the v1 AnimationPanel in the sheet; dismissing
keeps the mode. Desktop unaffected (`useIsPhone` fork).

---

#### P4.15 — Docs sync: modes, hotkeys, camera, Esc order

**Goal**: `docs/*.md` stays true to shipped behavior (AGENTS.md doc-sync mandate).
**Files**:
- Modify `docs/action-chains.md`
- Modify `docs/3d-workspace.md`
- Modify `docs/iva-seats.md`
- Modify `docs/editor-state.md`
- Modify `docs/architecture.md`
- (grep-driven) any other `docs/*.md` naming a rebound key or `$inspectorMode`
**Depends on**: all previous P4 tasks.
**Spec**:
- Run `grep -rn "⌘K\|Cmd+K\|mod+k\|inspectorMode\|Escape\|Esc \|shortcut\|hotkey" docs/`
  and fix every stale statement. Known required edits (verified these files mention the
  affected behaviors — census + grep):
  - `docs/action-chains.md`: the palette opens on **⇧⌘K** (was ⌘K; ⌘K = command palette);
    non-modality unchanged; Esc-cancel now documented as ladder rung 6 (silent when the
    P5B confirm hasn't landed — update again in P5B).
  - `docs/3d-workspace.md`: rotate-step keys are `[`/`]` (was F/⇧F); `F` = Frame
    Selection with frame-all fallback; camera snaps orbit the selection centroid; Reset
    Camera command; `T`/⇧`T` gizmo cycle; WASDQER/arrows are viewport-scoped (dead in
    dialogs/lists); modes 1–5.
  - `docs/iva-seats.md`: seat-view Esc is rung 8 of the documented ladder (behavior
    unchanged: never preventDefault, store-gated).
  - `docs/editor-state.md`: add `modeStore` (`$mode` ephemeral boots-build, `$activeTool`
    slot, setMode choreography, hook registries — never undoable); note `$inspectorMode`
    is gone and `$isPoseEditing`/`$isExhaustPlacing` now derive from `$mode`.
  - `docs/architecture.md`: the mode machine + scoped hotkey registry + Esc ladder in the
    store/UI-layer overview (only where it makes stale claims — do not write an essay).
- No `scope/*.md` changes: zero game-contract surfaces touched this phase (hotkeys,
  camera, chrome only — the exceptions the plan preamble flags, e.g. per-channel easing
  IO, live in P11).
**Verify**: the grep above returns no stale claims; `pnpm fmt:check` clean on the docs if
the formatter covers markdown (oxfmt does — run `pnpm fmt` first as always).

---

### Phase 4 exit — repeat the phase verification block, then proceed to P5A

The app must be fully usable end-to-end: build a small part, animate it, define an engine,
export XML — all v1 capability reachable (menubar/dialogs from P2, panels via the five
modes), with the new keys live and the old muscle-memory diff documented in Help. P5A
(selection model + Outliner) builds directly on `$mode`, `$activeTool`,
`registerListSurfaceEditMirrors`, and the `select.*`/`edit.*` commands this phase pinned.


---

## Phase 5A — Build mode I: stable-id selection model, Outliner, layers v2

## Phase 5A — Build mode I
**Design sources**: `plans/flexo_v2/design/design-build-mode.md` §0–§2, §12–§13 (store sketches + undo/persistence table), §14–§15 (extensions + parity table); `plans/flexo_v2/design/foundation.md` §2.6 (`$activeTool`), §3 (Select menu), §8.1 (Outliner), §13 (store architecture), §14.1 (selection conventions), §14.3 (confirm policy); `plans/flexo_v2/design/FINAL_DESIGN_INDEX.md` (authoritative hotkey table: viewport `B`/`⌘A`/`⌥⌘A`/`⇧⌘I`, `surface:outliner` rows); `plans/flexo_v2/design/DECISIONS.md` #7 (marquee), standing constraints.
**Census sources**: `analysis/flexo-v2-feature-census/selection-transform.md` (§1.1–§1.3 selection model + pains 8/12/14), `analysis/flexo-v2-feature-census/catalog-placement-layers.md` (§1.6–§1.9 layers full inventory, pains 2/8–13, open Q5/Q6/Q10).

**Entry state**: Phases 0–4 are complete. The docked shell runs: `layoutStore` + docked frame (P1), `commandStore` + MenuSpec menubar + `dialogStore` + ⌘K palette (P2), `statusStore`/`notificationStore`/`modifierStore` behind the `toast()` facade (P3), `modeStore` (`$mode`, single `$activeTool` slot incl. the `'marquee'` union member per foundation §2.6, enter/exit hooks) + the scoped hotkey registry v2 + Esc ladder + camera commands (P4). The Build right sidebar still hosts the v1 guts: P4.03's `ModeSidebar` (which replaced `InspectorContent`) renders `AssetsToolbar` + `AssetsList` in its Build branch (v1 anchor code: src/ui/InspectorContent.tsx:48-60), with `LayersButton`/`LayersPanel` popover; `TransformInspector` still floats (`FloatingInspector`); `SelectionToolbar`/`MultiSelectToolbar` still mounted (5B deletes them). Selection is the v1 six-per-kind **index**-array model (code: src/state/editorStore.ts:119-184). `$layerView` is the global `flexo:layerView` persistent key (code: src/state/layerStore.ts:39). No marquee exists.

**Exit state**: App fully runnable. ONE stable-id selection atom `$selection: atom<SelectionRef[]>` drives everything; the six index atoms, all per-kind setters, and `setSelection` are **gone** (grep-clean); post-undo selection is remapped by id (index-aliasing bug dead); every consumer enumerated below is migrated. Marquee box select works (`B` one-shot, `⇧-drag` additive, `⌥⇧-drag` subtractive, DOM overlay rect, live count chip, status tool segment, Esc cancel). The Build right sidebar is the **Outliner** (`OutlinerPanel`): layer header rows with active-dot/chevron/color/eye/opacity/lock/listed/grip/⋮, entity rows grouped by kind with per-kind ⋮ menus and drag-to-layer, Aids section, fuzzy ⌘F search, `revealEntity` scroll+flash. `AssetsList`/`AssetsToolbar`/`LayersButton`/`LayersPanel` are deleted. Layers carry a persisted optional `color`; `$layerView` gains `collapsed` (still on the global key — flipped per-project by P9.07). Select menu commands (All/Deselect/Invert/All in Active Layer/By Layer ▸/Box Select) work from menubar, palette, and viewport-scope hotkeys. `TransformInspector`/`SelectionToolbar`/`MultiSelectToolbar`/`ChainPalette` still exist (5B's demolition targets) and keep working on the new selection model via the reshaped selectors.

**Phase verification** (end of phase):
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` all clean (AGENTS.md mandatory workflow; run each script BARE, no pipes).
2. `grep -rn "selectedIndices\|selectedConnectorIndices\|selectedKittenIndices\|selectedColliderIndices\|selectedIvaSeatIndices\|selectedLightIndices\|selectPlacement\|setSelectedPlacements\|togglePlacement\|setSelectedConnectors\|setSelectedColliders\|setSelectedIvaSeats\|setSelectedLights\|setSelectedKittens\|toggleEntity\b" src/` → no hits. `grep -rn "AssetsList\|AssetsToolbar\|LayersButton\|LayersPanel" src/` → no hits.
3. Manual smoke (desktop): click-select each entity kind in 3D (additive ⇧/⌘-click toggles, empty click clears); make 3 placements, select the 3rd, delete the 1st from its row menu, ⌘Z → the 3rd is STILL selected (aliasing fix); marquee: `B` then drag replaces, ⇧-drag adds, ⌥⇧-drag subtracts, Esc mid-drag cancels, hidden/locked-layer entities never included; Outliner: create/rename/recolor/reorder/hide/dim/lock/unlist/delete layers (delete = inline strip with move-vs-delete), ⇧-click grow-only range across layers, ⌘A row select-all, right-click row menu opens AT the cursor, drag entity rows onto a layer header moves the movable selection, search fuzzy-filters with highlight and auto-expand, ⌘F focuses search, Aids section lists measurements + containers and activating one opens its editor; Select ▸ each item works.
4. Manual smoke (phone <640px): the Build panel sheet shows the same Outliner; rows selectable; layer controls tappable. (Full touch pass is P5B.29.)
5. Game contract: `git diff --stat src/ksa/partXmlSerializer.ts src/ksa/partXmlParser.ts src/ksa/assetsXmlSerializer.ts src/ksa/modExport.ts` → empty. Export XML for a project with colored layers before/after this phase → byte-identical (layers, color included, are never serialized — design §2.3.1, constitution). `scope/` needs **no** sync: this phase is editor-only chrome; the only `src/ksa/types.ts` change (`Layer.color`) is an editor-side struct KSA never sees.

---

### Phase-wide invariants (apply to every task below)

- **Undo**: selection, marquee, layer view state (eye/opacity/lock/listed/collapsed), active layer NEVER create undo steps. Document mutations (layer create/rename/color/reorder/delete/clear/duplicate, move-to-layer, Interior toggle, entity duplicate/delete) are **discrete** — `pushUndo(label, detail)` inside the mutator (code: src/state/editorStore.ts:298-324 invariant block). No streaming mutations are introduced in this phase except none — the Outliner has no draggable numeric fields (the opacity slider writes VIEW state, not `$part`).
- **Numeric inputs**: the only numeric field in this phase is the layer-opacity popover — it MUST be `useNumberDraft` + `inputMode="url"` (reuse the v1 implementation verbatim — code: src/ui/LayersPanel.tsx:375-410 `OpacityFields`).
- **Layering**: everything in `src/state/` imports no react/three. New UI-side pure logic (`outlinerTree.ts`, `fuzzyMatch.ts`, `marqueeSelect.ts`) is react-free and unit-tested.
- **No manual memoization** (React Compiler). No literal z-indexes (use `z.canvasOverlay` from P0.02).
- **No migration code**: the `Layer.color` / `collapsed` additions are backwards-compatible optional fields per AGENTS.md persisted-data rule 1 — NO `PROJECT_SCHEMA_VERSION` / `PROJECT_EXPORT_VERSION` bump, no old-key reads.

---

## A. The stable-id selection model (stores first)

#### P5A.01 — `$selection: SelectionRef[]` replaces the six index atoms inside editorStore
**Goal**: One ordered stable-id selection atom + actions; id-based post-undo remap; every editorStore-internal selection read/write converted; existing exported setter signatures kept as thin shims so no other file changes in this task.
**Files**:
- modify `src/state/editorStore.ts`
- modify `src/state/editorStore.test.ts`
**Depends on**: none.
**Spec**: (design: design-build-mode.md §1.1; census: selection-transform.md §1.2, pains 8 + 14).

1. **Types + atom** — replace the six atoms (code: src/state/editorStore.ts:119-184 `$selectedIndices` … `$selectedLightIndex`) with:

```ts
/** An entity kind that can be selected. (Renamed from SelectableKind — design §1.1.) */
export type EntityKind = 'subpart' | 'connector' | 'collider' | 'ivaSeat' | 'light' | 'kitten';
/** @deprecated transitional alias, deleted in P5A.17. */
export type SelectableKind = EntityKind;

/** A stable reference to a selected entity. id = instanceId / connector id / collider id / seat id / light id / kitten id. */
export interface SelectionRef { kind: EntityKind; id: string }

/** THE selection. Ordered — last element is the primary. Ephemeral, never undoable, survives mode switches. */
export const $selection = atom<readonly SelectionRef[]>([]);
```

2. **Id resolution helpers** (module-scope, exported — the id field per kind):

```ts
const refKey = (r: SelectionRef) => `${r.kind}:${r.id}`;

/** The document entity a ref points at, or null when it no longer exists. */
export function entityIndexOf(part: EditingPart, kind: EntityKind, id: string): number {
  switch (kind) {
    case 'subpart':   return part.placements.findIndex((p) => p.instanceId === id);
    case 'connector': return part.connectors.findIndex((c) => c.id === id);
    case 'collider':  return part.colliders.findIndex((c) => c.id === id);
    case 'ivaSeat':   return part.ivaSeats.findIndex((s) => s.id === id);
    case 'light':     return part.lights.findIndex((l) => l.id === id);
    case 'kitten':    return part.kittens.findIndex((k) => k.id === id);
  }
}
export function entityIdAt(part: EditingPart, kind: EntityKind, index: number): string | null {
  switch (kind) {
    case 'subpart':   return part.placements[index]?.instanceId ?? null;
    case 'connector': return part.connectors[index]?.id ?? null;
    case 'collider':  return part.colliders[index]?.id ?? null;
    case 'ivaSeat':   return part.ivaSeats[index]?.id ?? null;
    case 'light':     return part.lights[index]?.id ?? null;
    case 'kitten':    return part.kittens[index]?.id ?? null;
  }
}
/** The layerId of the entity a ref points at ('' when dead). */
export function refLayerId(part: EditingPart, ref: SelectionRef): string
```

3. **Actions** (design §1.1 names, exactly):

```ts
/** Replace (or additively extend) the selection. Dedupes by kind+id, drops refs whose entity doesn't exist. */
export function select(refs: readonly SelectionRef[], opts?: { additive?: boolean }): void
/** Add/remove ONE ref, leaving the rest intact (additive viewport click). Appended refs become primary (last). */
export function toggleRef(ref: SelectionRef): void
export function clearSelection(): void            // keep the existing name; body becomes $selection.set([])
export function selectLayerEntities(layerId: string): void  // rewrite of code:src/state/editorStore.ts:3927 —
  // one pass over placements/connectors/colliders/ivaSeats/lights/kittens building refs for that layer,
  // in the fixed kind order (subpart, connector, collider, ivaSeat, kitten, light — matches
  // selectedTransformRefs order, code:src/state/editorStore.ts:2117-2160); replaces the selection.
export function deselectLayer(layerId: string): void        // rewrite of code:src/state/editorStore.ts:3946 —
  // ONE filter: $selection.set($selection.get().filter((r) => refLayerId(part, r) !== layerId)).
  // The six-kind hand-expansion and its "MUST cover every kind" comment (3941-3945) die here.
```

`select` dedupe rule: build the result preserving first-occurrence order of already-present refs; `additive: true` appends only refs not already present. Dead-id refs are silently dropped at set time (validate against `$part.get()`).

4. **Clamp → id filter** — rewrite `clampSelection` (code: src/state/editorStore.ts:357-382): drop every ref whose `entityIndexOf(part, kind, id) < 0`. Keep every call site (undo/redo restore at :427/:447 area, mutators). Delete the index-shift remapping in `removePlacement` (code: src/state/editorStore.ts:1463-1474) — id refs survive splices; just call `clampSelection()` after the splice. Delete the seat-selection index remap in `moveIvaSeat` (code: src/state/editorStore.ts:1201-1220 — `$selectedIvaSeatIndices` remapping): seat ids are stable across reorder, so NO selection fix-up is needed anymore.

5. **Rewrite every internal selection consumer** in editorStore.ts (enumerated; grep `$selected` inside the file to confirm you got all):
   - `addSubPart` (:561), `addConnector` (:976), `addCollider` (:1002), `addIvaSeat` (:1129), `addKitten` (:1224), `addKittenAtSeat` (:1265), `addLight` (:2712): end with `select([{kind, id: <new entity id>}])`.
   - `addPart` (:824, select-imported block ~:914-943): build refs for every imported entity, skipping kinds whose layer is hidden/locked exactly as today, then one `select(refs)`.
   - `removeSelected` (:1361): iterate `$selection` grouped by kind; keep the description/detail ladder verbatim; splice descending by resolved index; after a SINGLE-entity delete, select the next entity of the same kind — resolve the *next* entity's **id** (document order after the removed index) BEFORE splicing, then `select([{kind, id}])` after; else `clearSelection()`.
   - `duplicateSelected` (:1477): read the selection as refs, resolve entities by id, duplicate exactly as today (fresh ids, layer rules, seats append at END, lights keep owner); end with `select(<refs of the copies>)`.
   - `copySelected` (:1626) / `pasteClipboard` (:1656): read from / select-to refs; behavior identical (lights still excluded from the clipboard — P5B.02 adds them, do NOT add here).
   - `duplicatePlacement` (:1750): unchanged logic; final select by the copy's instanceId.
   - `applyActionChain` (:1814): seeds already resolve by instanceId; final selection = refs of seed+clone instanceIds.
   - `selectedTransformRefs` (:2117) and `updateSelectedTransforms` (:2250): see P5A.02 (done there to keep this task's diff reviewable — in THIS task leave them reading the legacy computed views below).
   - `moveSelectionToLayer` (:3819) and `setPlacementsInternal` (:3896): `moveSelectionToLayer` iterates `$selection` refs of movable kinds (subpart/connector/collider), one undo step `'move to layer'`, pinned kinds silently skipped (verbatim behavior). `setPlacementsInternal` keeps its `indices` signature (callers resolve).
6. **Legacy compatibility views + shims** — so `selectors.ts`, `EditorScene`, `AssetsList`, `MultiSelectToolbar`, `MobileInspector`, `openChainPalette`, `animationStore`, `customAssetStore`, tests all keep compiling UNTOUCHED in this task. Add, each tagged `/** @deprecated legacy index view — DELETE in P5A.17 */`:

```ts
const indicesOf = (kind: EntityKind) =>
  computed([$selection, $part], (sel, part) =>
    sel.filter((r) => r.kind === kind)
       .map((r) => entityIndexOf(part, r.kind, r.id))
       .filter((i) => i >= 0));
export const $selectedIndices = indicesOf('subpart');
export const $selectedConnectorIndices = indicesOf('connector');
// … $selectedKittenIndices / $selectedColliderIndices / $selectedIvaSeatIndices / $selectedLightIndices
// and the six `…Index` singles (last-or-−1), same names/shapes as today (code: editorStore.ts:125-183).
```

   Setter shims (same exported names/signatures as code: src/state/editorStore.ts:1858-2081, bodies one-liners): `selectPlacement(i)` → `select(refFromIndex('subpart', i))`; `setSelectedPlacements`, `togglePlacement`, `selectConnector`, `setSelectedConnectors`, `selectKitten`, `setSelectedKittens`, `selectCollider`, `setSelectedColliders`, `selectIvaSeat`, `setSelectedIvaSeats`, `selectLight`, `setSelectedLights` — each resolves indices→refs via `entityIdAt` (dropping invalid) and calls `select`/`toggleRef`. `setSelection(sub, con, kit, col, seat, light)` (:2044) → builds refs in the fixed kind order and replaces. `toggleEntity(kind, index)` (:2065) → `toggleRef` after id resolution. All tagged `@deprecated … DELETE in P5A.17`.
7. `$revealEntity`/`revealEntity` (:2091-2096): unchanged — already `{kind, id}`.
8. **Tests** (`editorStore.test.ts`) — new `describe('stable-id selection')`:
   - **Aliasing regression (census pain 14)**: three placements p0/p1/p2 → `select([ref(p2)])` → `removePlacement(0)` → selection still resolves to p2 → `undo()` → selection STILL p2 (v1 clamped indices and could silently point at p1).
   - `toggleRef` appends (primary = last) and removes; `select(additive)` never duplicates a ref.
   - `deselectLayer` prunes ALL kinds in one call (port the existing regression at code: src/state/layerStore.test.ts:75-104 — keep that file passing too).
   - `moveIvaSeat` keeps the selected seat selected across reorder WITHOUT remap code.
   - Delete-single selects the next entity of the same kind (existing behavior test — adjust to assert by id).
   - Update existing selection tests that asserted index behavior (e.g. `setSelectedLights([1,0,1,-2])` dedupe at :921) to assert through the shims — they should still pass unmodified where behavior is identical; where a test asserted index-clamping semantics, rewrite it to assert id-preservation and note why.
**Verify**: `pnpm typecheck`; `pnpm test` — editorStore.test.ts + layerStore.test.ts + animationStore.test.ts + nudgeSelection.test.ts + rotateSelection.test.ts all green with NO changes outside editorStore.test.ts; `pnpm lint`. Manual: app boots, click-selection + gizmo + duplicate/delete/copy/paste all behave as before.

#### P5A.02 — Reshape `selectors.ts` + id-carrying `SelectedTransformRef` + by-id transform write-back
**Goal**: Derived views per design §1.1 read `$selection`; the transform-ref pipeline (gizmo/nudge/bulk) carries stable ids; `updateSelectedTransforms` routes by ref kind+id, killing the kitten-vs-light index-order trap.
**Files**:
- modify `src/state/selectors.ts`
- modify `src/state/editorStore.ts`
- modify `src/state/editorStore.test.ts`
**Depends on**: P5A.01.
**Spec**: (design: design-build-mode.md §1.1 "Derived compatibility views"; census: selection-transform.md §1.2, invariant §5 "updateSelectedTransforms … order trap" at code: src/state/editorStore.ts:2250-2314).

1. **selectors.ts** — rewrite the input deps from the six index atoms (code: src/state/selectors.ts:51-116) to `[$selection]` / `[$part, $selection]`:
   - `$hasSelection` = `sel.length > 0`; `$hasMultiSelection` = `sel.length > 1`; `$selectionCount` = `sel.length` (same exported names).
   - NEW `$selectionByKind = computed($selection, …): Record<EntityKind, readonly SelectionRef[]>` (all six keys always present) and helper `primaryOf(kind: EntityKind): SelectionRef | null` (last ref of that kind) — these realize the design's `$selectedByKind(kind)` / `$primaryOf(kind)`.
   - `$selectedPlacement` / `$selectedPlacements` (code: selectors.ts:28-48): same output shapes (`SubPartPlacement | null`, `{index, placement}[]`), computed from `$selection`'s subpart refs resolved against `$part` — consumers (`AnimationPanel`) untouched.
   - `$selectedEntity` (code: selectors.ts:124-155): new rule — non-null iff `$selection.length === 1` (the old per-kind mutual-exclusion assumption is gone); same discriminated union INCLUDING the existing `index` field (still consumed by `TransformInspector` until 5B) plus a new `id` field on every branch. **Deliberately NO kitten branch yet** (v1 parity — the v1 union has none, selectors.ts:124-129; P5B.13's `KittenInspector` adds it; leave a `// TODO(P5B.13)` comment).
   - `$selectedRefs` unchanged name, now `computed([$part, $selection], () => selectedTransformRefs())`.
   - `$layerSummaries` / `$activeLayer`: untouched.
2. **editorStore.ts**:
   - `SelectedTransformRef` (code: :2099-2105) gains `id: string` and KEEPS `index: number` transitionally (`// index: transitional — EditorScene colliderGizmoFrame/lightGizmoFrame + TransformInspector still index it; remove when 5B dissolves TransformInspector`). Design's final shape is `{kind, id, transform, layerId, name}` — the interim `index` is recomputed fresh on every call so it is always valid at read time.
   - `selectedTransformRefs()` (:2117-2160): iterate `$selection` **grouped into the fixed kind order** (subparts, connectors, colliders, ivaSeats, kittens, lights — preserve exactly; bulk-math consumers rely on stable ordering), resolving each ref via `entityIndexOf`.
   - `updateSelectedTransforms(refs …)` (:2250-2314): for each incoming ref, resolve the live index by `entityIndexOf(part, ref.kind, ref.id)` (skip dead) and switch on `ref.kind` explicitly — six explicit cases. This deletes the documented light-before-kitten fallback ordering trap (:2266-2269 comment). Keep ALL normalization verbatim: `normalizeColliderSize` per shape, IVA-seat and light scale pinned to (1,1,1) (census invariants §5).
   - `updateSelectedTransform` (:2387): route through the primary ref (last element) instead of per-kind index probing.
3. **Tests**: extend `editorStore.test.ts` — `updateSelectedTransforms` addressed by id updates the right entity when a kitten and a light are both selected (the old order-trap scenario); collider size renormalization and seat/light scale pinning still enforced (existing tests keep passing).
**Verify**: `pnpm typecheck`; `pnpm test`; manual: single-select each kind → TransformInspector still shows the right panel; 2+ selection → BulkTransformPanel applies Move-by correctly; gizmo drag on a multi-selection still streams.

#### P5A.03 — `selectionOps.ts`: selectAll / invertSelection (layer-eligibility rules); DELETE the P2.04 editorStore helpers
**Goal**: The Select-menu store actions that need BOTH editorStore and layerStore (circular-import-free home); the interim P2.04 implementations die in the same task so exactly ONE implementation exists.
**Files**:
- create `src/state/selectionOps.ts`
- create `src/state/selectionOps.test.ts`
- modify `src/state/editorStore.ts` (DELETE `selectAllEntities`/`invertSelection` — P2.04's interim helpers)
- modify `src/ui/commands/selectCommands.ts` (re-point the `select.all`/`select.invert` commands' `run` at the new module — same task, or the deleted helpers break the compile)
- modify `src/state/editorStore.test.ts` (remove/relocate P2.04's cases — their behavior assertions move into `selectionOps.test.ts` below)
**Depends on**: P5A.01.
**Spec**: `layerStore` already imports from `editorStore` (code: src/state/layerStore.ts:2 `deselectLayer`), so `selectAll` cannot live in editorStore without a cycle. P2.04 shipped interim `selectAllEntities()`/`invertSelection()` INSIDE editorStore (listed+unlocked rule, no hidden-layer exclusion) — this task DELETES them and re-points the two commands, so the hidden-layer-excluding implementation below is the only one (two divergent select-alls must never coexist). New module (no react/three):

```ts
// src/state/selectionOps.ts
import { $part, $selection, select, clearSelection, type SelectionRef } from './editorStore';
import { isLayerListed, isLayerLocked, isLayerVisible } from './layerStore';

/** Layers whose entities are selectable in bulk: listed AND visible AND unlocked. */
function eligibleLayer(id: string): boolean {
  return isLayerListed(id) && isLayerVisible(id) && !isLayerLocked(id);
}
/** Every entity on eligible layers, fixed kind order. */
function allEligibleRefs(): SelectionRef[] { /* iterate the six $part arrays, filter by eligibleLayer(layerId) */ }

export function selectAll(): void { select(allEligibleRefs()); }
export function invertSelection(): void {
  const cur = new Set($selection.get().map((r) => `${r.kind}:${r.id}`));
  select(allEligibleRefs().filter((r) => !cur.has(`${r.kind}:${r.id}`)));
}
export function deselectAll(): void { clearSelection(); }
```

(design: design-build-mode.md §1.1 — `selectAll()` "(listed + unlocked layers only)", `invertSelection()` "new — Select menu"; foundation §3 Select tree.) NOTE: the design's shorthand says "listed + unlocked"; this task ALSO excludes **hidden** layers, matching the v1 select-all rule the Outliner/list uses (`if (s.locked || s.hidden) continue` — code: src/ui/AssetsList.tsx:350-351) and the 3D "hidden ⇒ unselectable" invariant (census: catalog-placement-layers.md §5). This is a parity clarification, not a deviation — hidden-layer entities are unselectable everywhere else. (It is also a deliberate behavior refinement over the P2.04 interim helpers, which lacked the hidden exclusion — the P4.08 `⌘A`/`⇧⌘I` bindings pick the new rule up for free because they delegate to the commands.)
**Verify**: `pnpm test` — `selectionOps.test.ts` cases: selectAll sweeps all six kinds on the Default layer; entities on a hidden, locked, or unlisted layer are excluded (use `toggleLayerVisible`/`setLayerLocked`/`toggleLayerListed` from layerStore); invertSelection of a half-selection yields the complement; invert twice = original set (order aside); no undo entries created (`$canUndo` unchanged). `grep -rn "selectAllEntities\|invertSelection" src/state/editorStore.ts` → 0 hits; `pnpm typecheck` (command re-point compiles); manual: Select ▸ All and `⌘A` still work.

#### P5A.04 — Migrate EditorScene to `$selection`
**Goal**: The 3D layer reads/writes stable refs directly: one selection subscription, ref-based click callbacks, ref-based gizmo attach/lock checks.
**Files**:
- modify `src/three/EditorScene.ts`
**Depends on**: P5A.02.
**Spec**: (design: design-build-mode.md §1.2 — viewport click rules "parity, verbatim"; census: selection-transform.md §1.1).
1. **Click callbacks** (code: src/three/EditorScene.ts:299-414): `SelectionManager` already reports `{kind, id, instanceIndex}` (code: src/three/SelectionManager.ts:7-17). For each kind branch KEEP the locked-layer and hidden-layer guards verbatim (three.js raycasts invisible objects — the explicit `isLayerVisible` check is load-bearing, EditorScene.ts:317-412) and the context captures (`colliderInstance.set` at :355, `setLightEditContext` at :388), then replace the index resolution + `selectX(index)`/`toggleEntity(kind, index)` calls with:

```ts
if (additive) toggleRef({ kind, id: selected.id });
else select([{ kind, id: selected.id }]);
revealEntity(kind, selected.id);   // now unconditional-on-selection like today (added→reveal, EditorScene.ts:326-330)
```

   The `part.<array>.findIndex` lookups per branch die. Empty-click clears only when non-additive (:304-307, keep). Nozzle priority path untouched (:311-315). Measurement/container mutual exclusion untouched (:316, :489-502).
2. **Subscriptions** (:565-570): replace the six `this.sub($selected*Indices, …)` lines with ONE `this.sub($selection, () => this.updateSelection());` (keep the separate `$lightEditContext` sub at :573).
3. **`selectedObjects()`** (:1516-1557): iterate `$selection.get()`; the object maps are ALREADY id-keyed (`objects` by instanceId :174, `connectorObjects`/`colliderObjects`/`seatObjects`/`kittenObjects`/`lightObjects` by entity id :175-203) — resolve `this.objects.get(ref.id)` etc. directly; keep the all-instances rule for colliders (:1531-1533) and the context-instance-only rule for lights (:1548-1554) verbatim.
4. **`updateSelection()`** (:1598-1706): `multi` = `$selection.get().length > 1`; `anyLocked` = one pass `$selection.get().some((r) => isLayerLocked(refLayerId(part, r)))`; the single-collider / single-light attach branches key off `$selectionByKind` or filter `$selection` by kind — resolve the entity by id. `previewLocked` / `selectedIsAnimated` and any other `$selected*Indices.get()` read in the file: `grep -n 'selected.*Indices' src/three/EditorScene.ts` and convert every hit to `$selection`-based resolution (there must be zero index-atom reads left in this file).
5. `worldTransformRefs()` (:1570-1582): unchanged — refs now carry `id` + transitional `index`; `colliderGizmoFrame(ref.index)` / `lightGizmoFrame(ref.index)` keep working.
**Verify**: `pnpm typecheck`; `pnpm lint`; manual: click/⇧-click/⌘-click each kind incl. an owned collider instance (gizmo attaches to the clicked instance) and an owned light (context note in inspector follows the clicked instance); locked layer → click ignored; hidden layer → click falls through; multi-select gizmo pivot at centroid; drag streams one undo step; nozzle handles still win during exhaust placement (enter Engine mode via the v1 path).

#### P5A.05 — Migrate the remaining index-based consumers
**Goal**: Every consumer outside editorStore/selectors/EditorScene reads `$selection`/derived views and selects by ref; no caller of the deprecated shims remains except `AssetsList` (deleted in P5A.17).
**Files**:
- modify `src/ui/MultiSelectToolbar.tsx`
- modify `src/ui/MobileInspector.tsx`
- modify `src/ui/chain/openChainPalette.ts`
- modify `src/state/animationStore.ts`
- modify `src/state/customAssetStore.ts`
- modify `src/ui/commands/addCommands.ts` (holds AddButton's ported light-add call site — P2.11 deleted `AddButton.tsx`)
- modify `src/ui/status/ToolSegment.tsx` (holds SeatViewBar's ported `go(delta)` — P3.09 deleted `SeatViewBar.tsx`)
- modify `src/ui/GameDataSections.tsx`
- modify `src/state/layerStore.test.ts`, `src/state/animationStore.test.ts`, `src/three/nudgeSelection.test.ts`, `src/three/rotateSelection.test.ts`
**Depends on**: P5A.02.
**Spec**: the complete consumer census. The list below was verified by grep on the **v1** working tree; P2/P3 relocated two call sites into new files (noted per bullet). **Re-run the grep at implementation time** (`grep -rn "selectLight(\|selectIvaSeat(\|setSelection(\|selectPlacement" src/`) and migrate every hit — the migration per site is unchanged even if a host file moved again:
- **MultiSelectToolbar** (code: src/ui/MultiSelectToolbar.tsx:16-18, 35-37, 88): per-kind counts → `useStore($selectionByKind)`; the Interior menu's `indices` (:88 `useStore($selectedIndices)`) → resolve subpart refs to indices via `entityIndexOf` before calling `setPlacementsInternal` (it keeps its index signature).
- **MobileInspector** (code: src/ui/MobileInspector.tsx:9-26): count badge → `useStore($selectionCount)` (it already exists — simpler than the three-store sum).
- **openChainPalette** (code: src/ui/chain/openChainPalette.ts:2, 31): seeds = `$selection.get().filter(r => r.kind === 'subpart')` resolved to placements — **selection order preserved** (chain seeds are frozen in selection order at open, design: design-build-mode.md §9.1; the ordered `$selection` makes this exact where v1's per-kind array already was).
- **animationStore** `selectionCentroidPose` (code: src/state/animationStore.ts:272-275): map subpart refs → placements.
- **customAssetStore** (code: src/state/customAssetStore.ts:1021, 1248, 1413, 1639-1640): each `setSelection(newPlacementIndices, [], [])` → `select(refs)` where refs are built from the just-created placements' instanceIds (each call site has the placement objects in scope); `setSelection([], [], [])` → `clearSelection()`.
- **`add.light` command** in `src/ui/commands/addCommands.ts` (P2.09 ported AddButton's handler verbatim — v1 source: src/ui/AddButton.tsx:134 `selectLight(lights.length - 1)`; the file itself died in P2.11): DELETE the `selectLight` call — `addLight` now selects internally (P5A.01 item 5); keep the `revealEntity` call.
- **Seat cycling in `src/ui/status/ToolSegment.tsx`** (P3.09 ported SeatViewBar's `go(delta)` verbatim — v1 source: src/ui/SeatViewBar.tsx:37 `selectIvaSeat(nextIndex)`; the bar died in P3.09): replace with `select([{kind:'ivaSeat', id: part.ivaSeats[nextIndex].id}])`.
- **GameDataSections** (code: src/ui/GameDataSections.tsx:309 `selectLight(index)` — the "Select in 3D" button): `select([{kind:'light', id: light.id}])` (the light object is in scope).
- **Tests**: replace setter-shim calls with `select`/refs using a local helper per file, e.g.:

```ts
const ref = (kind: EntityKind, id: string): SelectionRef => ({ kind, id });
const subRef = (i: number) => ref('subpart', $part.get().placements[i].instanceId);
```

  (`layerStore.test.ts` :24-27 imports `setSelectedColliders/IvaSeats/Lights`; `nudgeSelection.test.ts` / `rotateSelection.test.ts` / `animationStore.test.ts` use `selectPlacement`/`setSelection` — migrate all. `editorStore.test.ts` was migrated in P5A.01/02.)
**Verify**: `pnpm typecheck`; `pnpm test`; `grep -rn "selectPlacement\|setSelection(\|toggleEntity\|setSelectedColliders\|setSelectedIvaSeats\|setSelectedLights\|selectConnector(\|selectCollider(\|selectIvaSeat(\|selectLight(\|selectKitten(" src/ --include="*.ts" --include="*.tsx" | grep -v editorStore.ts | grep -v AssetsList` → no hits. Manual: chain palette opens over a SubPart selection; "Select in 3D" in the light GameData section works; seat-view prev/next re-selects seats.

#### P5A.06 — Select menu commands re-based, Box Select command, provider verify
**Goal**: Every Select-menu command runs the v2 implementations; `select.boxSelect` + its `B` binding are NEW; everything else is a re-point/verify of what P2.09/P2.04/P4.08 already registered.
**Files**:
- modify `src/ui/commands/selectCommands.ts` (P2.09 created it — the CANONICAL command-module path; NEVER create a parallel `src/commands/` tree)
- modify `src/ui/hotkeys/registry.ts` (ONE new binding: viewport `B` → `select.boxSelect`; P4.10's deferred-bindings ledger row — delete the row as you land it)
- modify the MenuSpec Select-menu wiring only if a Box Select item is missing (P2.09 declared `tool.marquee` as the Select-menu stub — replace that stub entry's command id with `select.boxSelect`, keeping the menu label from FINAL_DESIGN_INDEX)
**Depends on**: P5A.03. (Box Select's tool arming is completed by P5A.08 — register the command here with `run` = arm-marquee, delegating to the P5A.08 action; if implementing this task first, stub the run with the modeStore `$activeTool` set.)
**Spec**: (design: foundation §3 Select tree; FINAL_DESIGN_INDEX hotkey table rows `viewport ⌘A/⌥⌘A/⇧⌘I`, `viewport B`; design-build-mode.md §12 commandStore providers row). **Canonical ids are P2.09's** — do not mint new ones, do not re-register (P2.01's registry throws on duplicates):
- `select.all` / `select.invert`: already re-pointed at `selectionOps.selectAll()`/`invertSelection()` by P5A.03 — verify.
- `select.none` (Deselect — NOT `select.deselect`): stays `clearSelection()` — verify.
- `select.activeLayer` (NOT `select.allInActiveLayer`): stays `selectLayerEntities($activeLayerId.get())` — verify it resolves through the P5A.01 rewrite.
- **NEW `select.boxSelect`** → arm the marquee tool (`$activeTool = 'marquee'`, P5A.08); registry binding keys `'b'`, scope `viewport` (a tool must never arm behind a dialog — same C5 rationale as `M`). Replace the P2.09 `tool.marquee` stub (visible-disabled) with this live command.
- Keys `⌘A`/`⌥⌘A`/`⇧⌘I`: ALREADY BOUND at viewport scope by P4.08 item 11, delegating to the commands — nothing to add; they pick up the re-based implementations for free (lists keep their own ⌘A; foundation §11 precedence).
- **Providers**: `layers.select` ("By Layer ▸" rows → `selectLayerEntities(layerId)`) and `layers.activate` (palette-only "Activate layer: X" → `setActiveLayer(layerId)`) were REGISTERED IN P2.09 — verify they still resolve (they call editorStore functions P5A.01 rewrote in place); do not re-register.
- Disabled predicates (add if P2.09 lacks them): All/Invert disabled when the document has zero entities; Deselect disabled when `!$hasSelection.get()`.
**Verify**: `pnpm typecheck`; `pnpm test` (P4.13 conflict suite passes — no double-binding of ⌘A at one scope, `B` collides with nothing). Manual: each Select item works from the menubar AND ⌘K palette; `⌘A` in the viewport selects everything eligible while `⌘A` with the Outliner focused (after P5A.13) still does row select-all; `⇧⌘I` inverts; `B` arms the marquee (full gesture after P5A.08).

---

## B. Marquee box select (LOCKED #7)

#### P5A.07 — Pure marquee hit-test module
**Goal**: A unit-tested, react/three-free rectangle-selection core the scene task consumes.
**Files**:
- create `src/three/marqueeSelect.ts`
- create `src/three/marqueeSelect.test.ts`
**Depends on**: none.
**Spec**: (design: design-build-mode.md §1.4 hit rule). Pure data in, refs out:

```ts
// src/three/marqueeSelect.ts — pure math, no three imports needed beyond types-free structs
export interface ScreenAabb { kind: EntityKind; id: string; instanceIndex?: number;
  minX: number; minY: number; maxX: number; maxY: number }
export interface MarqueeRect { x0: number; y0: number; x1: number; y1: number }

export function normalizeRect(r: MarqueeRect): { minX; minY; maxX; maxY }
export function rectsIntersect(a, b): boolean   // inclusive edge touch counts
/**
 * Entities whose screen AABB intersects the rect. Multi-instance entities (SubPart-owned
 * colliders/lights) test per instance; ANY instance hit selects the entity once, and the
 * FIRST hit instance's index is reported for context capture (design §1.4).
 */
export function marqueeHits(rect: MarqueeRect, boxes: readonly ScreenAabb[]):
  { ref: SelectionRef; firstInstance?: number }[]
```

Dedup rule: first instance in `boxes` order wins for `firstInstance`. `EntityKind`/`SelectionRef` import from `../state/editorStore` (state → three direction is the existing allowed direction for types; if lint complains, re-declare the two types locally).
**Verify**: `pnpm test` — cases: inverted-corner rects normalize; touch-at-edge intersects; disjoint misses; two instances of one collider id yield ONE hit with `firstInstance` = the earlier box's index; empty boxes → empty.

#### P5A.08 — Marquee tool: gestures, overlay, status segment, Esc, one-shot B
**Goal**: Working box select — `B`-armed one-shot replace, `⇧-drag` additive, `⌥⇧-drag` subtractive — with the DOM rect overlay, live count chip, orbit suppression, and cancel paths.
**Files**:
- modify `src/state/modeStore.ts` (marquee sub-state atom)
- modify `src/three/EditorScene.ts` (gesture + hit computation)
- create `src/ui/MarqueeOverlay.tsx`
- modify the ViewportHost component from P1 (mount the overlay)
- modify `src/ui/commands/selectCommands.ts` (finish `select.boxSelect`)
**Depends on**: P5A.04, P5A.07, P5A.06.
**Spec**: (design: design-build-mode.md §1.4; foundation §2.6 tool table row "Box select", §14.1; DECISIONS #7).
1. **State** (design §12 marquee row): in modeStore — `export const $marqueeRect = atom<{ x0: number; y0: number; x1: number; y1: number; count: number } | null>(null);` (ephemeral; never persisted; never undo). Arming: `$activeTool.set('marquee')` via the P5A.06 command; the P4 Esc-ladder rung already clears `$activeTool` (verify the rung ordering matches foundation §11.4 rung 5 — tool disarm).
2. **Gesture (EditorScene)** — add pointer handlers on the canvas element alongside `SelectionManager` (code: src/three/SelectionManager.ts:49-50 registers pointerdown/up on the same element):
   - On `pointerdown` (primary button): marquee starts iff (a) `$activeTool.get() === 'marquee'` (mode: **replace**), or (b) `e.shiftKey` AND a raycast at the pointer hits NO selectable (design: "⇧-drag **starting on empty canvas**"; reuse the SelectionManager raycast approach) — mode **additive**, or `e.altKey` also held → **subtractive**. Otherwise do nothing (plain drag stays orbit; ⇧-click on an entity stays the additive click).
   - Starting: `controls.enabled = false` (orbit off), `selectionManager.setSuppressed(true)` (no click-select on release), snapshot the **screen AABBs once** (camera is frozen while orbit is off): for every entity visual — `objects` / `connectorObjects` / `colliderObjects[]` / `seatObjects` / `lightObjects[]` / `kittenObjects` maps (code: src/three/EditorScene.ts:174-203) — skip entities on hidden or locked layers (same guards as click), skip aids (measurement/container/grid/gizmo objects are not in those maps — nothing extra to do), project each visual's `Box3.setFromObject(group)` 8 corners through the camera to canvas px and take the 2D min/max → `ScreenAabb[]`. Add a seam for 5B: filter through an overridable predicate `isKindDisplayed(kind: EntityKind): boolean` defaulting to `true` — P5B (Display Filters, `$kindVisibility`) plugs in here (`// TODO(P5B): compose $kindVisibility`).
   - On `pointermove`: update `$marqueeRect` with the live rect + `marqueeHits(...).length`.
   - On `pointerup`: if the rect is <4px in both axes, treat as a click — restore state and let nothing happen beyond what the suppressed SelectionManager skipped (an armed-B micro-drag disarms; a ⇧ micro-drag on empty space is a no-op, matching today's ⇧-click-on-empty). Else compute hits; **replace** → `select(refs)`; **additive** → `select(refs, {additive: true})`; **subtractive** → remove the hit refs from `$selection` (filter + set via a new editorStore action `deselectRefs(refs)` — add it in this task, trivial filter, no undo). For each hit owned collider/light, record the context instance (`colliderInstance.set(id, firstInstance)` / `setLightEditContext(id, firstInstance)`) — design §1.4. Then restore orbit + picking, `$marqueeRect.set(null)`, and if the tool was armed, disarm (`$activeTool.set(null)` — one-shot).
   - **Esc mid-drag**: window keydown listener active only during the gesture → cancel (restore orbit/picking, clear rect, disarm if armed, swallow the event so the ladder doesn't double-fire).
   - Marquee NEVER creates undo steps.
3. **Overlay** (`MarqueeOverlay.tsx`): reads `$marqueeRect`; absolutely-positioned div inside ViewportHost at `z.canvasOverlay` (P0.02 ladder; foundation §1 canvas-overlays list already names "the new marquee rectangle div"): 1px accent border, 8% accent fill, plus the count chip (`+12`) following the drag corner (design §1.4 "live count chip follows the cursor"; render it at the rect's moving corner). `pointer-events-none`. The DOM overlay keeps the on-demand render loop untouched (design §1.4 "the rect is DOM").
4. **Status**: while armed-not-dragging, tool segment `Box select — drag to select` (foundation §2.6 table); while dragging, `Box select — release to select · Esc cancels` (design §1.4) — write via P3's `$toolStatus` model. Modifier-hint provider (P3 `modifierStore`): hovering empty canvas with a selection → `⇧ Drag box-select` (design §10 modifier hints row).
**Verify**: `pnpm typecheck`; `pnpm test` (marqueeSelect tests from P5A.07 still green). Manual: `B` → next drag replace-selects and disarms; Select ▸ Box Select does the same; ⇧-drag on empty canvas adds to an existing selection; ⌥⇧-drag removes; ⇧-drag starting ON an entity does NOT marquee (click semantics preserved); hidden-layer and locked-layer entities never selected; an owned light caught by marquee gets its context set to the first hit instance; Esc mid-drag cancels and restores orbit; orbit works normally when nothing armed; undo history untouched by any marquee.

---

## C. Layers v2 data model

#### P5A.09 — `Layer.color` (document), `setLayerColor`, `duplicateLayer`
**Goal**: The persisted 12-swatch layer color + the two new layer mutations, schema-additive with NO version bump.
**Files**:
- modify `src/ksa/types.ts`
- modify `src/state/projectCodec.ts`
- modify `src/state/editorStore.ts`
- create `src/ui/outliner/layerColors.ts`
- modify `src/state/editorStore.test.ts`, `src/state/projectCodec.test.ts` (or the codec's existing test file — locate by `ls src/state/*codec*`)
**Depends on**: none (parallel-safe with section A).
**Spec**: (design: design-build-mode.md §2.3.1; census: catalog-placement-layers.md §1.9 gap 1, open Q6).
1. **types.ts** — extend `Layer` (code: src/ksa/types.ts:293-298):

```ts
export type LayerColor =
  | 'slate' | 'red' | 'orange' | 'amber' | 'lime' | 'green'
  | 'teal' | 'cyan' | 'blue' | 'violet' | 'fuchsia' | 'rose';
export interface Layer {
  id: string;
  name: string;
  /** Editor-only swatch shown in the Outliner. NEVER applied to 3D materials, NEVER serialized to KSA XML. */
  color?: LayerColor;
}
```

2. **projectCodec.ts** — `CLayer` (code: src/state/projectCodec.ts:319) gains `c?: string`; encode: include `c` only when set (:1388 `encLayers` site); decode (:1416): `color` only when the string is one of the 12 names (validate against a `LAYER_COLORS` name set; unknown → omit — decode stays total/tolerant).
3. **Version rule** (AGENTS.md "Persisted project data" rule 1 — backwards-compatible): optional field, absent = no color, no default-fill needed (`undefined` IS the default; nothing to add to `createEmptyPart`/`normalizePart` because a missing optional needs no fill). **MUST NOT bump `PROJECT_SCHEMA_VERSION` (code: src/state/projectStore.ts:80) or `PROJECT_EXPORT_VERSION`.** State this in the commit message.
4. **editorStore.ts** — two new discrete mutations beside the layer block (:3669-3780):

```ts
/** Sets or clears a layer's color swatch. Undo step 'layer color'. */
export function setLayerColor(id: string, color: LayerColor | undefined): void
  // pushUndo('layer color', layer.name); map part.layers, spread-replace the one layer.
/** Duplicates a layer AND its movable entities (SubParts/connectors/colliders). One undo step 'duplicate layer'. */
export function duplicateLayer(id: string): string | null
```

   `duplicateLayer` (design §2.2 ⋮-menu row "Duplicate Layer (new: copies layer + its movable entities, one undo step)"): refuse built-ins (`BUILT_IN_LAYER_IDS`, code: src/ksa/types.ts:352); new layer `{id: nextLayerId(part), name: `${source.name} copy`, color: source.color}` inserted **directly after** the source; clone every placement/connector/collider whose `layerId === id` with fresh ids using the SAME generators `duplicateSelected` uses (code: src/state/editorStore.ts:1477-1588 — instanceId `<base>_<n>`, `nextConnectorId`, `nextColliderId`); pinned kinds are never on ordinary layers so nothing else moves; new layer becomes active (`$activeLayerId.set`), copies become the selection (`select(refs)`). Returns the new layer id. (Placement details — insert-after + name suffix + select-copies — are plan-specified; the design fixes only "copies layer + movable entities, one undo step".)
5. **`layerColors.ts`** (UI-side): `export const LAYER_COLOR_HEX: Record<LayerColor, string>` mapping the 12 names to hex values (use the Tailwind 400-series hues of the same names, e.g. `slate: '#94a3b8'`, `red: '#f87171'`, … — pick each color's `-400` hex) + `export const LAYER_COLORS: readonly LayerColor[]` in the design's order.
6. **KSA export invariance**: layers are already never serialized (census: catalog-placement-layers.md §5 first invariant); color adds nothing to any serializer — do not touch `src/ksa/partXmlSerializer.ts`/`modExport.ts`.
**Verify**: `pnpm test` — new cases: `setLayerColor` is undoable (one step, ⌘Z restores the old color) and encodes/decodes through the codec (`encode→decode` round-trip preserves `color`, a payload WITHOUT `c` decodes to `color: undefined`, an unknown `c: 'plaid'` is dropped); `duplicateLayer` creates the layer after the source, clones only movable kinds with fresh ids, is ONE undo step, refuses `default`. Manual: export-to-KSA XML of a colored-layer project is byte-identical to the same project uncolored (run the v1 export path twice and diff).

#### P5A.10 — `LayerViewState.collapsed` (+ the P9.07 persistence seam)
**Goal**: The Outliner chevron's per-layer collapsed flag in layer view state; global `flexo:layerView` key retained for now.
**Files**:
- modify `src/state/layerStore.ts`
- modify `src/state/layerStore.test.ts`
**Depends on**: none.
**Spec**: (design: design-build-mode.md §2.3.3 — `$layerView` gains `collapsed`; per-PROJECT persistence is the NEW project store's job). Add to `LayerViewState` (code: src/state/layerStore.ts:18-29): `collapsed: boolean` with `DEFAULT_LAYER_STATE.collapsed = false` (:31-36 — sparse defaults fill on read via `layerViewState`, :42-44). Add:

```ts
export function isLayerCollapsed(id: string): boolean
export function toggleLayerCollapsed(id: string): void   // setLayerView(id, { collapsed: ! })
export function expandLayer(id: string): void            // used by revealEntity + search auto-expand
```

**Persistence — INTERIM**: keep `persistentJSON('flexo:layerView', …)` (:39) exactly as-is. The per-project flip is **P9.07** in `phase-09-10.md` ("Per-project layer view state: drop the global `flexo:layerView` key") — that task changes this atom to a plain `atom({})` and relies on the project snapshot, which ALREADY carries `layerView` (code: src/state/projectStore.ts:92, 156, 281, autosave-subscribed :467), so `collapsed` rides the snapshot from day one with zero extra work. Add a comment on the atom: `// NOTE: global key is transitional — P9.07 makes the project snapshot the only persistence.` Layer view state stays NEVER undo-tracked (view-pref invariant, census: catalog-placement-layers.md §5).
**Verify**: `pnpm test` — layerStore.test.ts: collapsed defaults false, toggles, `expandLayer` idempotent, toggling collapsed creates no undo step; existing visible/lock/listed/opacity tests untouched.

---

## D. The Outliner

#### P5A.11 — Fuzzy matcher: EXTEND the P2.14 module with boolean adapters
**Goal**: One shared fuzzy module: the palette's scored matcher (P2.14) gains the boolean/ranges adapters the Outliner (and 5B's browsers, P6/P7 navigators) filter lists with.
**Files**:
- modify `src/ui/fuzzyMatch.ts` (CREATED BY P2.14 — do not re-create; do not rename)
- modify `src/ui/fuzzyMatch.test.ts` (extend P2.14's suite; keep its scoring cases green)
**Depends on**: none (P2.14 landed phases ago).
**Spec**: (design: design-build-mode.md §2.5 "fuzzy subsequence match (upgrade over v1 substring)"; foundation §8 "Search fields are fuzzy (subsequence match)"). P2.14 shipped the SCORED matcher `fuzzyMatch(query, target): {score, ranges} | null` with **empty query → null** (the palette's empty state depends on that). List filtering wants boolean semantics with **empty query → matches everything** — add ADAPTERS over the same core rather than a second matcher (one subsequence algorithm, one file):

```ts
export interface FuzzyResult { matched: boolean; ranges: [start: number, end: number][] }
/** Boolean adapter for list filtering: empty query matches everything (ranges: []);
 *  otherwise matched ⟺ fuzzyMatch(query, text) !== null, with its ranges. */
export function fuzzyFind(query: string, text: string): FuzzyResult
/** Convenience: does `query` fuzzy-find ANY of the given strings? (empty query → true) */
export function fuzzyAny(query: string, ...texts: string[]): boolean
```

Keep `fuzzyMatch`'s scored signature and semantics UNTOUCHED (palette + menuSpec tests depend on it). Contiguous-run range merging lives in the core; the adapters only translate call forms. NOTE for later phases: the Outliner (P5A.12/13), `P5B.23/24` browsers, and the P6/P7 navigators import `fuzzyFind`/`fuzzyAny` from this same module — do not rename the file or the exports.
**Verify**: `pnpm test` — P2.14's scoring cases still green PLUS new adapter cases: `fuzzyFind('tnk','tank_2')` matched with ranges merged where adjacent; `fuzzyFind('tank','tank')` one contiguous range; `fuzzyFind('xz','tank')` → `{matched:false}`; `fuzzyFind('','anything')` matched with `ranges: []` while `fuzzyMatch('','anything')` stays null; case-insensitive (`'TNK'` vs `'tank'`); `fuzzyAny('tn','x','tank')` → true.

#### P5A.12 — Pure Outliner tree builder
**Goal**: The section/row model of the Outliner as a tested pure function, decoupled from react.
**Files**:
- create `src/ui/outliner/outlinerTree.ts`
- create `src/ui/outliner/outlinerTree.test.ts`
**Depends on**: P5A.10, P5A.11.
**Spec**: (design: design-build-mode.md §2.1, §2.4; census: catalog-placement-layers.md §1.8 — port the row-building rules of code: src/ui/AssetsList.tsx:163-293, which this supersedes). Signature:

```ts
export interface OutlinerRow { key: string /* `${kind}:${id}` */; kind: EntityKind; id: string;
  name: string; sub: string; badges: { interior?: boolean; lightType?: 'spot'|'point'; colliderShape?: string };
  hidden: boolean; matchRanges: [number, number][] }
export interface OutlinerKindGroup { kind: EntityKind; label: string /* "SUBPARTS" */; rows: OutlinerRow[] }
export interface OutlinerLayerSection { layer: Layer; pinned: boolean; view: LayerViewState;
  total: number; shown: number; groups: OutlinerKindGroup[] }
export function buildOutlinerTree(part: EditingPart, layerView: Record<string, LayerViewState>,
  query: string, catalogIndex: /* same map AssetsList passes to resolveInternal */): OutlinerLayerSection[]
```

Rules (each cited to its source):
- **Layer order**: ordinary layers in `part.layers` document order first, then the pinned entity-only layers (`ENTITY_ONLY_LAYER_IDS`, code: src/ksa/types.ts:372) in document order — a DISPLAY partition only, `part.layers` itself keeps its seeded order `[default, ivaSeats, lights, kittens, …user]` (code: src/ksa/types.ts:2192). (design §2.3.4 "They sort after ordinary layers"; "Default" is an ordinary-but-undeletable layer and stays in the first partition.)
- **Row names** (design §2.4): SubPart = instanceId (mono); connector/collider/light = id; seat = `Seat ${i+1}` (ordinal IS the name); kitten = the kind word capitalized ("Hunter"). `sub` strings: port verbatim from AssetsList's builders (interior suffix :169-181, connector flags/capabilities join :186-201, collider `shape · owner` :203-218, seat forward-axis aim + default chip :223-241, light `type · via owner` :242-261, kitten kind :262-276) — including the `resolveInternal` interior resolution (code: src/ui/AssetsList.tsx:169-173).
- **Search** (design §2.5): fuzzy via `fuzzyFind`/`fuzzyAny` (the shared module, P5A.11 adapters — empty query matches everything) over name, id, template id, kind word ("connector"), flags ("interior", "locked" when the layer is locked), seat ordinal string, light type; when `query` non-empty: non-matching rows dropped, `shown` counts reflect it (`3/12` chip), and matching is recorded as `matchRanges` on the NAME field (highlighting is name-only — sub-string field matches still include the row but with empty ranges).
- **Kind groups**: rows grouped under kind subheaders in the fixed order SubParts, Connectors, Colliders (ordinary layers) / the single pinned kind (pinned layers); a group with 0 rows is omitted (design §2.1 "kind subheader (only when >0)").
- **Unlisted layers**: still RETURNED (with `view.listed === false`) — the panel renders them as header-only ghost rows (design §2.2 ≡ row: "unlisted layers collapse to a header-only ghost row at 40% opacity — NOT removed"). This fixes the v1 vanish (census pain: layer disappears from the list).
- Hidden flag per row mirrors the layer (`!view.visible`).
**Verify**: `pnpm test` — cases: partition order (user layer before IVA Seats section); kind grouping + omission of empty groups; fuzzy query filters rows and sets `shown`; unlisted layer still present; seat ordinal naming; interior badge from a template override.

#### P5A.13 — `OutlinerPanel` shell: list, selection semantics, search, reveal, empty states, ⌘F + edit mirrors
**Goal**: The Outliner panel exists and is fully selectable/searchable (layer-row CONTROLS arrive in P5A.14, entity ⋮ menus in P5A.15, Aids in P5A.16) — mounted alongside the still-live AssetsList behind nothing: it replaces AssetsList's mount only in P5A.17.
**Files**:
- create `src/ui/outliner/OutlinerPanel.tsx`
- create `src/ui/outliner/LayerHeaderRow.tsx` (minimal: name + count + chevron for now)
- create `src/ui/outliner/EntityRow.tsx` (minimal: icon + name + badges)
**Depends on**: P5A.05, P5A.12.
**Spec**: (design: design-build-mode.md §1.3, §2.1, §2.5, §2.7; foundation §8.1).
- **Structure**: header row `OUTLINER` + search toggle 🔍; pinned `SearchField` (expandable — always-rendered is acceptable on desktop width; the 🔍 button focuses it); ONE react-aria `GridList selectionMode="multiple" selectionBehavior="replace"` over the `buildOutlinerTree` sections (`GridListSection` per layer, `GridListHeader` = `LayerHeaderRow`, kind subheaders as non-selectable rows or section headers, `EntityRow` items) — same composite-key pattern as AssetsList (code: src/ui/AssetsList.tsx:421-481) but keys are ALREADY `kind:id` = `SelectionRef`, so `onSelectionChange` needs **no index maps**: parse each key `k` at its first `:` into `{kind, id}` and call `setSelectionRefsFromKeys` → `select(refs)`; `'all'` (⌘A) → refs of every enabled row (skip locked + hidden — port code: src/ui/AssetsList.tsx:348-362).
- **Selection gestures** (design §1.3): controlled `selectedKeys` derived from `$selection` (`refKey`); `disabledKeys` = locked-layer rows; hidden-layer rows selectable-blocked-but-menu-alive (port the guard, code: src/ui/AssetsList.tsx:364-372); ⇧-range via `useShiftRangeSelect` **verbatim** (code: src/ui/rangeSelect.ts:109-140 — orderedKeys = flattened visible rows, isSelectable excludes disabled+hidden; the grow-only/nearest-anchor/holes semantics come free); ⌘/⌃-click toggle and ⌘A are react-aria native. Dense rows: `--density-row-py`, `xs` controls, `gridRowClass` selected tint.
- **Search behavior** (design §2.5): while filtering, layers auto-expand (ignore `collapsed` when query non-empty — do NOT mutate the stored flags), non-matching rows hidden, name matches highlighted via `matchRanges` (wrap in `<mark>`-styled spans), count chips show `shown/total`. Esc in the field clears it (field-local, `numberDraft`-style stopPropagation not needed — SearchField's built-in clear); second Esc returns focus to the viewport (call the P1 viewport focus helper — the host keeps `tabIndex={-1}` focus-on-pointerdown; expose/reuse its `.focus()`).
- **Hotkeys**: register `outliner.search` at scope `surface:outliner` bound `⌘F` → expand+focus the field (FINAL_DESIGN_INDEX `surface:outliner` row; use P4's surface-scope mechanism — the panel root carries whatever data-attribute/provider P4 established for surface scopes). Register the **edit mirrors** at `surface:outliner` for the commands that exist today: `⌘C` copy, `⌘V` paste, `⌫` delete, `⇧⌘I` invert — each delegating to the SAME command ids as the viewport bindings (FINAL_DESIGN_INDEX: "mirrors of the viewport edit/select commands; each list's own ⌘A keeps row select-all precedence" — react-aria's GridList ⌘A wins by virtue of firing on the focused element first; do not register ⌘A at this scope). Leave `// TODO(P5B.19): mirror ⌘D duplicate + ⌘X cut here when those commands land`.
- **Reveal** (design §2.4): subscribe `$revealEntity` (code: src/state/editorStore.ts:2091) in an effect exactly like AssetsList's (code: src/ui/AssetsList.tsx:400-407): `expandLayer(<entity's layerId>)` first, then scroll via the `data-asset-key` DOM query (the behavior contract is the scroll — keeping the query hack is explicitly allowed), plus a ~800ms accent flash class on the row. Null the atom after consuming.
- **Empty states** (design §2.7): no entities at all → "Nothing placed yet" + `[Add SubPart…] [Import Model…] [Open Projects…]` buttons running the P2 commands (look up the actual command ids P2 registered for Add ▸ SubPart…, Add ▸ Import Model…, File ▸ Projects…); search with 0 hits → `No matches for "xyz" · [Clear]`.
- Do NOT mount it anywhere yet (P5A.17 swaps the mounts) — but add a temporary Ladle/story or judge by tests; if the project has no story infra (it does not), mount it temporarily gated behind nothing and verify via P5A.17. Keep this task compile-green by exporting the component unused (`oxlint` allows exported-unused).
**Verify**: `pnpm typecheck`; `pnpm lint`; `pnpm test` (tree/selection logic already covered by P5A.12 + rangeSelect.test.ts). Full behavioral verification lands with P5A.17's mount — that task's checklist re-runs these gestures.

#### P5A.14 — LayerHeaderRow: full controls, ＋ Layer row, delete/clear strips
**Goal**: Every §2.2 layer-row control working: active dot, chevron, color popover, inline rename, count chip, eye, opacity popover, lock, listed ghost, drag-reorder, ⋮ menu, ＋ Layer, inline-strip delete/clear.
**Files**:
- modify `src/ui/outliner/LayerHeaderRow.tsx`
- modify `src/ui/outliner/OutlinerPanel.tsx`
**Depends on**: P5A.09, P5A.10, P5A.13.
**Spec**: implement the §2.2 control table left→right (design: design-build-mode.md §2.2 — the table IS the spec; undo column binds):
- **Active radio dot ◉/○** → `setActiveLayer(id)` (code: src/state/editorStore.ts:3918); no undo. Whole-row single click also sets active (name column click target); row click must NOT fight entity selection — the layer header is a `GridListHeader`, not a selectable row.
- **Chevron ▾/▸** → `toggleLayerCollapsed(id)` (P5A.10); collapsed layers render header-only (entity rows omitted from the GridList items — do the filtering in OutlinerPanel from `isLayerCollapsed`, EXCEPT while searching, P5A.13 rule).
- **Color dot ●** → popover with the 12 `LAYER_COLORS` swatches + "none" → `setLayerColor(id, color|undefined)` (P5A.09; undo `'layer color'`). Dot shows `LAYER_COLOR_HEX[color]` or a neutral outline when unset. Entity rows of a colored layer get a 2px left-edge tint (EntityRow reads the section's layer color) — editor-only, never touches 3D materials (design §2.3.1).
- **Name**: double-click → inline rename — port `RenameInput` from code: src/ui/LayersPanel.tsx:412-441 (Enter/blur commit `renameLayer` (code: src/state/editorStore.ts:3683, undo inside), Esc cancels). The handlers stay component-local BY DESIGN; for Help completeness (FINAL_DESIGN_INDEX `surface:outliner` rename rows), extend `src/ui/hotkeys/helpStatics.tsx` (P4.11 — it carries an `// EXTEND in P5A.14` marker) with an "Outliner" static group: `↩` commit rename · `Esc` cancel rename · double-click row name to rename. Static display rows only — register no bindings.
- **Count chip**: `total` (or `shown/total` while searching) with the per-kind breakdown tooltip from `$layerSummaries` (code: src/state/selectors.ts:174-197).
- **👁 eye** → `toggleLayerVisible`; **◐ opacity swatch** → popover porting `OpacityFields` VERBATIM (code: src/ui/LayersPanel.tsx:375-410 — `useNumberDraft` 0–100 + `inputMode="url"` + slider + the keyDown stopPropagation guard); swatch tints accent when <100%; **🔒 lock** → `toggleLayerLocked` (prunes selection via `deselectLayer`, code: src/state/layerStore.ts:99-102); **≡ listed** → `toggleLayerListed` — unlisted layers render as the 40%-opacity header-only ghost row (P5A.12 keeps them in the tree). All four: view state, NO undo.
- **⠿ drag grip**: layer drag-reorder via react-aria `useDragAndDrop` + `Button slot="drag"` — port the pattern + `computeReorder` from code: src/ui/LayersPanel.tsx:64-76, 240-246 → `reorderLayers(orderedIds)` (code: src/state/editorStore.ts:3760, permutation-validated, undo inside). Reordering is over the ORDINARY partition only; pinned rows are not drag targets or sources (design §2.3.4).
- **⋮ menu**: Rename · Set Color ▸ (12 swatches + none) · Select All in Layer (→ `selectLayerEntities`; disabled when empty or locked, parity code: src/ui/LayersPanel.tsx:320) · Duplicate Layer (→ `duplicateLayer`, P5A.09; disabled for built-ins) · Clear Layer… · Delete Layer… · Move Layer Up / Move Layer Down (swap within the ordinary partition via `reorderLayers`; disabled at the ends and for pinned).
- **Delete Layer flow** (design §2.2 bullet): NO modal — expand an `InlineConfirmStrip` (kit, P0.12) under the header row: `Delete "Wings" (4 items): (•) Move items to [Default ▾]  ( ) Delete items · [Delete] [Cancel]` → `deleteLayer(id, {mode, targetLayerId})` (code: src/state/editorStore.ts:3707 — built-ins already refused; move-target Select lists ordinary layers minus self). Built-in rows: Delete item disabled with tooltip; **Kittens** layer shows **Clear Layer…** instead (same strip, delete-items only) → `clearLayer` (code: src/state/editorStore.ts:3740). Confirm policy: whole-container ⇒ always the strip (foundation §14.3). Active layer falls back + selection filtered — already handled inside `deleteLayer`.
- **＋ Layer row** pinned at the bottom of the layer list (above Aids): click → inline name field (blank → "Layer N") → `createLayer(name)` (code: src/state/editorStore.ts:3669 — appends, becomes active, undo `'add layer'`); scroll the new header into view.
**Verify**: `pnpm typecheck`; `pnpm test`. Manual (after P5A.17 mount; run then): every control in the table row-by-row; delete a 4-entity layer via strip both modes; ⌘Z restores each document mutation (color, rename, reorder, delete, clear, duplicate) individually; eye/lock/listed/opacity/collapse create NO undo steps; Kittens layer offers Clear not Delete; drag-reorder persists order.

#### P5A.15 — EntityRow: per-kind ⋮ menus, context-menu-at-cursor, drag-to-layer, hidden-layer flash, Interior relocation
**Goal**: Entity rows complete — badges, the §2.4 menu table per kind, right-click at the cursor, entity-drag-to-layer, and the hidden-layer duplicate flash fix.
**Files**:
- modify `src/ui/outliner/EntityRow.tsx`
- modify `src/ui/outliner/OutlinerPanel.tsx`
**Depends on**: P5A.13.
**Spec**: (design: design-build-mode.md §2.4; census: catalog-placement-layers.md §1.8 row menus + pains 12/13/15).
- **Row anatomy** `[kind icon] [name] [badges…] [⋮]`: lucide icons per kind (reuse the ones AssetsList/kit already use where present); badges: `interior` Chip on `<Internal>` SubPart templates with the v1 tooltip (port from code: src/ui/AssetsList.tsx:169-181 + SubPartBrowser's chip title), light type glyph, collider shape glyph. States: locked rows disabled-but-visible; hidden rows 40% opacity, unselectable, menu alive (P5A.13 wiring); selected accent ring.
- **⋮ menus per kind** — implement the design §2.4 table EXACTLY:
  | Kind | Items |
  |---|---|
  | SubPart | Duplicate · SubPart Data → · Edit Surface → (custom meshes only) · Interior (IVA only) ▸ On/Off · Change Layer ▸ · Delete… |
  | Connector | Duplicate · Change Layer ▸ · Delete… |
  | Collider | Duplicate · Fit to Selection · Change Layer ▸ · Delete… |
  | IVA Seat | Duplicate · Sit in This Seat · Add Kitten at Seat · Move Up / Move Down · Delete… |
  | Light | Duplicate · Delete… |
  | Kitten | Duplicate · Delete… |
  Wiring, with v1 sources: **Duplicate** = select-this-row-then-`duplicateSelected()` for non-subpart kinds (port code: src/ui/AssetsList.tsx:711-718) and `duplicatePlacement(index)` for SubParts (code: src/state/editorStore.ts:1750; resolve index by id) — copies land in-place in 5A; the nudge-offset upgrade is **P5B.02/19** (do not implement here). **SubPart Data →** / **Edit Surface →**: cross-mode jump commands — Data mode with template scope and Surface mode with mesh picked land in P6/P8; until then run the v1 equivalents so nothing regresses: SubPart Data → open `ManageTanksModal` for the row's template (port code: src/ui/AssetsList.tsx:586, 623-628); Edit Surface → `setManagingMeshId(customMesh.id)` (code: src/ui/AssetsList.tsx:580-584, custom meshes only, keep the imported-vs-primitive label rule out — the item label is fixed "Edit Surface →"). Tag both `// TODO(P6)/(P8): replace with mode-jump command`. **Interior (IVA only) ▸** — RELOCATED per-template toggle: port the whole selection-aware, glass-gated implementation from code: src/ui/AssetsList.tsx:549-614 (`internalTargets` selection expansion, `isGlassTemplate` disable "n/a for glass" with the KSA tooltip, the per-template MenuHeader blast-radius line, `setPlacementsInternal`). **Change Layer ▸**: port `ChangeLayerItem` (code: src/ui/AssetsList.tsx:499-527 — ordinary layers only, own layer disabled) → `moveEntityToLayer` (code: src/state/editorStore.ts:3791). **Fit to Selection** (collider): `requestColliderFit(shape)`-style intent — call the existing colliderStore intent the same way `AddButton` does (code: src/ui/AddButton.tsx:99-121 references; use the collider's own shape). **Sit in This Seat**: select + `enterSeatView(seat.id)` (port code: src/ui/AssetsList.tsx:699-710). **Add Kitten at Seat**: `addKittenAtSeat(seatIndex)` (code: src/state/editorStore.ts:1265). **Move Up/Down** (seat): `moveIvaSeat(index, ±1)` (code: src/state/editorStore.ts:1189 — order IS the exported IVA cycle). **Delete…**: select-row-then-`removeSelected()` under the §14.3 confirm policy — ≤5 entities ⇒ NO confirm dialog, status flash `Deleted <name> [Undo]` (10s inline action via the P3 status API); this replaces the v1 per-row ConfirmDialog (code: src/ui/AssetsList.tsx:729-740) — a single row is always ≤5 so row deletes are now confirm-free (the >5 strip case only arises from multi-select surfaces, 5B).
- **Right-click at cursor** (design §1.3): replace the v1 synthetic-button-click hack (code: src/ui/AssetsList.tsx:459-464) with real positioning: on `onContextMenu` set panel-local state `{rowKey, x, y}`, render ONE controlled `Popover` whose `triggerRef` points at an absolutely-positioned 0×0 anchor div at those coordinates (inside the panel, `position: fixed; left:x; top:y`), containing the same per-kind `Menu`. Dismiss on action/blur/Esc. ⇧-right-click does not range-select (rangeSelect already ignores non-primary buttons, code: src/ui/rangeSelect.ts:117-118).
- **Drag entity rows → layer header** (design §2.4): react-aria `useDragAndDrop` on the GridList — dragging any selected entity row onto an ORDINARY layer header = `moveSelectionToLayer(headerLayerId)` (code: src/state/editorStore.ts:3819 — one undo step, movable kinds move, pinned stay); if pinned kinds were in the selection, status flash `Seats stay on IVA Seats` (etc.); pinned headers are not drop targets (render the not-allowed cursor via the DnD API's drop-refusal).
- **Hidden-layer duplicate flash** (design §2.4 fix, census pain 12): when a row action Duplicate targets a hidden layer, after performing it flash `Duplicated into hidden layer "X"` with inline `[Show layer]` action → `revealLayer(id)` (code: src/state/layerStore.ts:90-92). Use the P3 status-action mechanism; if P3's API only supports the Undo action, add a generic `action?: {label, run}` to the status message model (coordinate with the P3 shape — extend, don't fork).
**Verify**: `pnpm typecheck`; `pnpm test`. Manual (post-P5A.17): every menu item per kind; right-click opens at the cursor; seat Move Up/Down reorders and the ordinal names shift while the selected seat STAYS selected (id model); Interior toggle disables for glass with tooltip; drag two subparts + a seat onto "Wings" → subparts move, seat flash; duplicate a row on a hidden layer → flash with working [Show layer]; single-row delete = no dialog, status [Undo] restores.

#### P5A.16 — Aids section
**Goal**: The collapsed AIDS section at the Outliner bottom: measurements + reference containers lists, add buttons, warn-precision toggle.
**Files**:
- create `src/ui/outliner/AidsSection.tsx`
- modify `src/ui/outliner/OutlinerPanel.tsx`
**Depends on**: P5A.13.
**Spec**: (design: design-build-mode.md §2.6; foundation S28). A collapsed-by-default `Disclosure`/SidebarSection `▸ AIDS (N)` (N = measurements + containers count) below the layer list:
- **MEASUREMENTS** subsection with `[＋ line] [＋ p2p]` header buttons: `＋ line` → `addReferenceLine()` (code: src/state/measurementStore.ts:149 — 1m X line at origin) then `setActiveMeasurement(id)` (editor focuses); `＋ p2p` arms the measure tool the same way the current UI does (`setMeasureTool('point')` — code: src/state/measurementStore.ts:136; P5B.25 re-homes arming under `$activeTool`, leave `// TODO(P5B.25)`). Rows: port `MeasurementList` guts (code: src/ui/MeasurementList.tsx — color dot · formatted length · `pt`/`ref` source tag · lock toggle · delete), re-styled to `xs` density; row click = `setActiveMeasurement(id)` → its editor takes over (v1: the floating editor panel opens on active — UNCHANGED in 5A; the left-focus-slot rehost is P5B.16).
- **REFERENCE CONTAINERS** subsection with `[＋ ▾]` menu (Box / Cylinder / Sphere) → `addContainer(shape)` + `setActiveContainer(id)` (code: src/state/containerStore.ts:102, 141); rows: port `ContainerList` guts (code: src/ui/ContainerList.tsx — shape icon+label · warn ⚠ badge when exceeded if the store exposes it, else omit · lock · delete).
- **Warn check** radio `(•) Fast (bbox) ( ) Accurate (vertex)` → `setContainerSettings({warnPrecision})` (code: src/state/containerStore.ts:58-71, 149).
- Aid mutations stay undoable via the existing `registerEditorAidStores` wiring (code: src/state/editorStore.ts:263 — untouched; design §2.6 "unchanged wiring"). Bounding-box/units display prefs do NOT appear here (they are View-menu material — design §2.6 last bullet).
- Do not delete `MeasurementList.tsx`/`ContainerList.tsx`/`MeasureButton.tsx` yet — `MeasureButton` still mounts them until **P5B.25** removes it (listed there).
**Verify**: `pnpm typecheck`. Manual (post-P5A.17): add a reference line from the section → editor opens, line at origin; add a p2p measurement via ＋ p2p + two viewport clicks; add a Box container; lock/delete rows; toggle warn precision; ⌘Z undoes aid add/delete (existing aid-undo tests still green: `pnpm test`).

#### P5A.17 — Mount cut-over + death sweep (AssetsList, AssetsToolbar, LayersButton, LayersPanel, legacy selection shims)
**Goal**: The Outliner becomes the Build right sidebar (desktop + phone); the four superseded components and the deprecated selection compatibility layer are deleted.
**Files**:
- modify `src/ui/ModeSidebar.tsx` (P4.03 replaced `InspectorContent` with this five-way host — its Build branch renders `AssetsToolbar` + `AssetsList`; swap THERE; if the tree differs, find the current mount of `AssetsList` by grep and swap wherever it is)
- delete `src/ui/AssetsList.tsx`, `src/ui/AssetsToolbar.tsx`, `src/ui/LayersButton.tsx`, `src/ui/LayersPanel.tsx`
- modify `src/state/editorStore.ts` (delete the deprecated shims + index views)
- modify `src/ui/outliner/OutlinerPanel.tsx` (interim Custom-assets entry)
**Depends on**: P5A.14, P5A.15, P5A.16.
**Spec**:
1. **Swap the mount**: wherever the Build/assets branch currently renders `AssetsToolbar` + `AssetsList` (post-P4 home: `src/ui/ModeSidebar.tsx`'s `'build'` case — P4.03 moved it there from InspectorContent, v1 anchor code: src/ui/InspectorContent.tsx:48-60; grep `<AssetsList` to confirm), render `<OutlinerPanel />` instead. This single swap covers desktop sidebar AND the phone sheet (both render through the same content component — census: shell mounts InspectorContent in RightPanel and MobileInspector). The `showTransform` phone path keeps rendering `TransformInspector` below (dies in P5B.17).
2. **AssetsToolbar's other tenants**: its Engine/Anim buttons are redundant since P4's mode switcher (`setInspectorMode` calls — code: src/ui/AssetsToolbar.tsx:46, 55 — P4 already re-pointed or deleted these; if the buttons still exist they die with the file). Its **Custom (N)** button (code: src/ui/AssetsToolbar.tsx:33-41) is the ONLY remaining entry to `CustomAssetsModal` until P8's Asset Manager — preserve reachability: IF no menubar command currently opens `CustomAssetsModal` (check P2's Window/Add menu wiring by grep `CustomAssetsModal`), add a small `Assets…` button in the Outliner header (right of 🔍) opening it, tagged `// TODO(P8.24): delete with CustomAssetsModal`. If a command already exists, skip the button.
3. **Delete the four files**; fix every import (grep each name — known importers: `InspectorContent.tsx` only, plus `AssetsToolbar`→`LayersButton`→`LayersPanel` chain and `CustomAssetsModal` import moving to OutlinerPanel per item 2).
4. **Delete the deprecated selection layer** in editorStore.ts (tagged in P5A.01): the six `$selected*Indices` + six `…Index` computeds, `selectPlacement`, `setSelectedPlacements`, `togglePlacement`, `selectConnector`, `setSelectedConnectors`, `selectKitten`, `setSelectedKittens`, `selectCollider`, `setSelectedColliders`, `selectIvaSeat`, `setSelectedIvaSeats`, `selectLight`, `setSelectedLights`, `setSelection`, `toggleEntity`, and the `SelectableKind` alias (update the remaining `SelectableKind` type references — `$revealEntity`, `SelectedTransformRef` — to `EntityKind`). Any straggler consumer the grep finds (there must be none after P5A.04/05 + item 3) gets migrated, not shimmed.
5. `docs/`-visible strings: the Outliner header says "OUTLINER"; remove the "Assets" wording from aria-labels you port.
**Verify**: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test`. Greps of the phase gate (§2 above) now pass. Manual — the FULL Outliner checklist: select/range/⌘A/right-click/drag-to-layer/search/reveal (click an entity in 3D → its row scrolls + flashes, layer auto-expands); every layer control; aids; empty state on a fresh project (New Project); phone sheet shows the Outliner; TransformInspector/SelectionToolbar/MultiSelectToolbar still function on the new model (they are 5B's to remove).

---

## E. Docs

#### P5A.18 — Docs sync: selection model + Outliner/layers
**Goal**: `docs/` tells the truth about the id-based selection model and the Outliner/layers v2 (AGENTS.md doc-sync mandate — same phase, not "later").
**Files**:
- modify `docs/editor-state.md`
- modify `docs/layers.md`
**Depends on**: P5A.17.
**Spec**:
- `docs/editor-state.md`: replace the six-index-store selection section with `$selection: SelectionRef[]` (ordered, last = primary), the action set (`select`/`toggleRef`/`clearSelection`/`selectLayerEntities`/`deselectLayer`/`invertSelection`/`selectAll`/`deselectRefs`), the id-filter clamp ("post-undo selection is remapped by id — never index-clamped"), `$selectionByKind`/`primaryOf` derived views, and `SelectedTransformRef` carrying `id` (+ transitional `index`, noting its 5B removal). Fix the stale `$selectedConnectorIndex`-is-singular wording the census flagged (census: selection-transform.md pain 13). Keep the undo-enrollment invariant text untouched.
- `docs/layers.md`: add `Layer.color` (12 named swatches, editor-only, never exported, schema-additive — no version bump), `LayerViewState.collapsed`, the Outliner as the layers UI (replacing the Layers popover — update every "Layers button/popover" UI path), the unlisted-⇒-ghost-row behavior change, `duplicateLayer` + `setLayerColor` mutations with their undo labels, and the display partition rule (ordinary layers first, pinned after). Note the interim persistence state verbatim: "layer view state is persisted globally (`flexo:layerView`) AND in the project snapshot; the global key is removed by the projects rework (P9)."
- **scope/**: explicitly none — this phase changes no game-contract surface (assert in the commit message; `Layer.color` never reaches any serializer).
**Verify**: `pnpm fmt:check` (docs are prettier-exempt but oxcfmt may cover md — run the repo workflow as usual); read both docs against the shipped behavior; phase gate checklist complete.

---

### Task order & compile-green boundaries

`P5A.01 → P5A.02 → {P5A.03, P5A.04, P5A.05} → P5A.06 → P5A.07 → P5A.08` (selection + marquee), with `{P5A.09, P5A.10, P5A.11}` free-floating (no deps) and `P5A.12 → P5A.13 → {P5A.14, P5A.15, P5A.16} → P5A.17 → P5A.18` (Outliner). Every task boundary compiles and keeps the app runnable: P5A.01's compatibility views/shims are the load-bearing trick — AssetsList and friends run UNCHANGED on the new atom until their replacement lands, and the shims are deleted only after the last consumer dies (P5A.17).


---

## Phase 5B — Build mode II: left focus editors, Tool bar float, gizmo/snap, viewport gestures, browsers, transient tools, chain

## Phase 5B — Build mode II
**Design sources**: `plans/flexo_v2/design/design-build-mode.md` §3–§11, §12 (store sketches), §14–§15; `plans/flexo_v2/design/foundation.md` §2.6, §3, §5, §6, §7, §10.10, §11, §14, §17; `plans/flexo_v2/design/FINAL_DESIGN_INDEX.md` (authoritative hotkey table + menubar tree); `plans/flexo_v2/design/DECISIONS.md` #4, #6, #7.
**Census sources**: `analysis/flexo-v2-feature-census/selection-transform.md`, `catalog-placement-layers.md`, `chains-misc.md`, `viewport-scene-view.md`.

**Entry state** (what prior phases must have landed — foundation §17 steps 1–5 plus "Build mode I"):
- The docked shell: `MenuBar` rendered from MenuSpec + `commandStore` (commands, dynamic providers, `dialogStore.$openDialog`), `StatusBar` + `statusStore` (`$statusMessage`, `$toolStatus` tool-segment model, message channel, `toast()` facade routing) + `notificationStore`, `layoutStore` (`$layout.float/floatOrder/floatHidden`, persisted `flexo:layout`), `modeStore` (`$mode`, the single `$activeTool` slot, enter/exit hook registry), `modifierStore` (`$heldModifiers`, hint providers), the scoped hotkey registry (global/viewport/mode/tool/surface scopes with the §11.2 table's shell-owned bindings: mode digits, ⌘K, ⌘Z family, Esc ladder skeleton, viewport nudge/rotate keys, `[`/`]`, `T`/`⇧T`), and the kit `FloatingWindow` primitive (foundation §6.1).
- Build mode I: stable-id selection (`$selection: atom<SelectionRef[]>` + `selectors.ts` derived views `$selectedRefs`/`$selectedEntity`/`$hasMultiSelection` reshaped per design-build-mode §1.1), the `OutlinerPanel` right sidebar (layer rows, entity rows, Aids section, fuzzy search + the fuzzy-subsequence matcher utility), marquee box select (`B` tool in the `$activeTool` slot), `revealEntity(kind, id)` by id.
- Still alive from v1 (this phase's demolition targets): `TransformInspector.tsx` (hosted in `FloatingInspector.tsx`), `SelectionToolbar.tsx`, `MultiSelectToolbar.tsx`, `MeasurementEditor.tsx`/`ContainerEditor.tsx` on `FloatingEditorPanel.tsx`, `ChainPalette.tsx` (fixed-position shell).
- **ERRATA — already deleted/absorbed by earlier phases (do NOT re-delete or re-create; the tasks below name their residual scope)**:
  - `AddButton.tsx`, `ViewButton.tsx`, `MeasureButton.tsx` → deleted in **P2.11**; their features live in the P2.09 MenuSpec commands (Add/View/Tools menus, interim aid providers).
  - `TransformHud.tsx` → deleted in **P3.08**; its chips live in `src/ui/status/TransformChips.tsx` (rotate + nudge, click-cycle, verbatim tooltips).
  - `SeatViewBar.tsx` → deleted in **P3.09**; the seat controls live in `src/ui/status/ToolSegment.tsx` + `toolStatusWiring.ts` (◀▶ wrap, ordinal, honesty ⓘ, Exit·Esc).
  - `LayersButton.tsx`/`LayersPanel.tsx`, `AssetsList.tsx`/`AssetsToolbar.tsx` → deleted in **P5A.17** (Outliner).
  - `InspectorContent.tsx` → replaced by `src/ui/ModeSidebar.tsx` in **P4.03**.
  - Camera commands (`view.frameSelection`/`view.resetCamera`/`view.cameraSnap.*`, `F`, `$cameraFrame`, `Viewport.frameBounds`, snap target param) → shipped in **P4.09**.
- If any single assumption above does not hold (e.g. a component was already deleted, or a menu item was already wired), do the minimal equivalent: skip the delete / keep the existing wiring — never re-create a v1 surface, never create a second implementation of a shipped feature.

**Exit state**: App fully runnable. Build mode is feature-complete per design-build-mode.md: left sidebar hosts the per-kind focus editors, multi-select panel, and aid editor cards (exactly ONE focus slot); the floating Tool bar window carries Move/Rotate/Scale + W/L gizmo space + snap UI; ⌥-drag duplicate, ⌘D duplicate-with-offset, clipboard with lights + Cut all work; nudge/rotate feedback lives in status chips; the Add menu is complete and both catalog browsers use preview-first gestures with facets; measure/seat-view/exhaust run through `$activeTool` with status segments; the chain session lives in a draggable, resizable, non-modal `FloatingWindow` on ⇧⌘K with drag-reorder and discard-confirm; View menu carries the Build items + Display Filters; every phone variant works. All v1 surfaces in the DELETE list are gone.

**Phase verification** (end of phase):
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` all clean (AGENTS.md mandatory workflow; run each script BARE, no pipes).
2. `grep -rn "SelectionToolbar\|MultiSelectToolbar\|FloatingInspector\|TransformInspector\|TransformHud\|SeatViewBar\|FloatingEditorPanel\|LayersButton\|LayersPanel\|AddButton\|ViewButton\|MeasureButton" src/` returns no hits (files deleted, no dangling imports).
3. Manual smoke (desktop): select one of each entity kind → correct focus card each time; 2+ selection → multi panel; activate a measurement → its card takes the focus slot; drag the Tool bar, toggle W/L, enable snap and ⌃-invert mid-drag; ⌥-drag a SubPart (one undo step, ⌘Z removes copies); ⌘D offsets by the nudge chip's step; ⌘C/⌘V a light; measure with `M` (status segment guides, Esc cancels); sit in a seat (status segment, Esc exits); ⇧⌘K chain with 2 steps → drag-reorder → Esc → discard-confirm; Add menu every entry; both browsers preview-first.
4. Manual smoke (phone, <640px viewport): Inspector sheet with touch nudge/rotate cluster; Tool bar strip; chain 50% sheet with live viewport above; browser tap=preview / [Add] commits; tool-chip tap cancels an armed tool.
5. `scope/` untouched — this phase is editor-only chrome, zero game-contract change (assert: no diffs under `src/ksa/serialize*`, `src/ksa/parse*`, export output byte-identical).

---

## A. Stores & pure logic (state layer first — `src/state/` imports no react/three)

#### P5B.01 — Create snapStore and give the dormant `$snap` plumbing a real backing
**Goal**: New persisted `snapStore` that computes and writes the existing `$snap` atom, so the Tool bar UI and the ⌃ temporary invert have a single source (LOCKED #7).
**Files**:
- create `src/state/snapStore.ts`
- create `src/state/snapStore.test.ts`
**Depends on**: none.
**Spec**: The v1 plumbing is fully live but UI-less (census: selection-transform.md §1.4 pain 1): `$snap: atom<SnapSettings>` (code: `src/state/editorStore.ts:212` `$snap`; shape `{translate?, rotateDeg?}` at `editorStore.ts:95` `SnapSettings`), `setSnap` (code: `src/state/editorStore.ts:3985` `setSnap`), consumed by `TransformGizmo.setSnap` → `controls.setTranslationSnap/RotationSnap` (code: `src/three/TransformGizmo.ts:52-58` `setSnap`). Do NOT touch that plumbing — write through it (design: design-build-mode.md §4.1, foundation §13 snapStore row).

```ts
// src/state/snapStore.ts — no react, no three
import { persistentJSON } from '@nanostores/persistent';
import { setSnap } from './editorStore';

export const $snapEnabled = persistentJSON<boolean>('flexo:snapEnabled', false);
export const $snapTranslateStep = persistentJSON<number>('flexo:snapTranslateStep', 0.1); // m
export const $snapRotateStep = persistentJSON<number>('flexo:snapRotateStep', 15); // °

/** effective = enabled XOR invert (⌃ held during a drag = temporary opposite). */
export function applySnapToGizmo(invert: boolean): void {
  const on = $snapEnabled.get() !== invert;
  setSnap(on ? { translate: $snapTranslateStep.get(), rotateDeg: $snapRotateStep.get() } : {});
}
export function toggleSnap(): void { $snapEnabled.set(!$snapEnabled.get()); applySnapToGizmo(false); }
export function setSnapTranslateStep(v: number): void { $snapTranslateStep.set(Math.max(0.001, v)); applySnapToGizmo(false); }
export function setSnapRotateStep(v: number): void { $snapRotateStep.set(Math.min(180, Math.max(1, v))); applySnapToGizmo(false); }
```
Persistence keys are `flexo:*` per convention (design §12 says persisted `flexo:snap`; three flat keys are equivalent and match the existing `flexo:nudgeStep` style — use the flat keys above). Snap state is view/tool state: **never undoable** (design §13 quick table). Scale snap stays off — never pass a scale snap (parity; census §1.4).
**Verify**: `pnpm typecheck`; `pnpm test` — `snapStore.test.ts` cases: `toggleSnap` flips `$snap` between `{}` and `{translate:0.1, rotateDeg:15}`; `applySnapToGizmo(true)` with `$snapEnabled=false` yields non-empty `$snap` (invert enables); step setters clamp (translate ≥0.001, rotate 1–180) and re-apply; disabled + invert=false yields `{}`.

#### P5B.02 — editorStore: `$gizmoSpace`, clipboard v2 (lights + Cut), duplicate-with-offset
**Goal**: Land the three Build-owned editorStore deltas: persisted gizmo space, lights in the clipboard + `cutSelected`, and `duplicateSelected` offset by the nudge step/axis.
**Files**:
- modify `src/state/editorStore.ts`
- modify `src/state/editorStore.test.ts`
**Depends on**: none.
**Spec**:
1. **`$gizmoSpace`** (design: design-build-mode.md §4.2): `export type GizmoSpace = 'world' | 'local'; export const $gizmoSpace = persistentJSON<GizmoSpace>('flexo:gizmoSpace', 'world');` plus `export function toggleGizmoSpace(): void`. Never undoable. Place next to `$toolMode` (code: `src/state/editorStore.ts:211` `$toolMode`).
2. **Clipboard lights** (design §7.2; census: selection-transform.md pain 5 — `PartClipboard` has no lights field, code: `src/state/editorStore.ts:195-202` `PartClipboard`/`$clipboard`): add `lights: PartLight[]` to `PartClipboard`; `copySelected` (code: `src/state/editorStore.ts:1626` `copySelected`) snapshots selected lights exactly like the other five kinds; `pasteClipboard` (code: `src/state/editorStore.ts:1656` `pasteClipboard`) pastes them in place with fresh ids via the existing light id generator, **keeps `ownerTemplateId`**, re-pins to the built-in Lights layer, scale stays pinned (1,1,1). Pasted seats still append at the END of cycle order (unchanged). Paste remains ONE undo step `'paste'`; pasted set becomes the selection.
3. **`cutSelected()`** (design §7.2): new export = snapshot via the same clipboard-building code as `copySelected`, then delete via the same removal code as `removeSelected` (code: `src/state/editorStore.ts:1361` `removeSelected`) — but push exactly ONE undo step labeled `'cut'` (with `removeSelected`'s description-detail ladder detail). Do not call `copySelected()+removeSelected()` naively if that would push two undo steps — factor the delete body into an internal helper that takes the label.
4. **Duplicate offset** (design §7.1, LOCKED #7): `duplicateSelected` (code: `src/state/editorStore.ts:1477` `duplicateSelected`) gains an options arg `{ offset?: boolean }` (default `true`). When offsetting, every copy's position gets `+ $nudgeStep.get()` on the `$nudgeAxis.get()` axis (code: `src/state/editorStore.ts:217-219` `$nudgeAxis`/`$nudgeStep`) — applied to all six kinds' copies. Everything else verbatim: one undo step `'duplicate'`, fresh ids per kind, source layer kept / pinned kinds re-pinned, seats append at END, lights keep owner template, copies become the selection. ⌥-drag (P5B.18) calls `duplicateSelected({ offset: false })` — the drag itself provides the offset. `duplicatePlacement` (code: `src/state/editorStore.ts:1750` `duplicatePlacement`) gets the same offset.
**Verify**: `pnpm typecheck`; `pnpm test` — extend `editorStore.test.ts` (follow the existing `describe('editorStore')` style, code: `src/state/editorStore.test.ts:292`): new cases — copy+paste a part-level AND a template-owned light (ids regenerate, owner kept, layer pinned); `cutSelected` leaves ONE undo step and undo restores everything; `duplicateSelected()` offsets copies by nudge step on nudge axis; `duplicateSelected({offset:false})` lands in place; `$gizmoSpace` default `'world'`.

#### P5B.03 — Owner-frame lift for keyboard nudge/rotate + shared lift helper (census pain 4 fix, part 1)
**Goal**: Keyboard nudge/rotate (and later the multi panel, P5B.15) operate in part space for SubPart-owned colliders/lights — matching the gizmo exactly.
**Files**:
- modify `src/state/editorStore.ts` (add `$colliderEditContext`)
- modify `src/three/selectionTransform.ts`
- modify `src/three/EditorScene.ts`
- create `src/three/selectionTransform.test.ts`
**Depends on**: none.
**Spec**: Today the gizmo lifts owned collider/light transforms to part space via `worldTransformRefs` (code: `src/three/EditorScene.ts:1570` `worldTransformRefs`, using `colliderWorld`/`lightWorld` from `src/three/coords.ts:94/184`) but keyboard nudge/rotate go through raw owner-local refs (code: `src/three/selectionTransform.ts:25-41` `applySelectionTransform` → `selectedTransformRefs()`; census: selection-transform.md pain 4). Fix per design-build-mode.md §5.2 + §3.8.4:
1. The collider context instance today is an EditorScene-private map (code: `src/three/EditorScene.ts:190` `colliderInstance`); the light context is already a store atom (code: `src/state/editorStore.ts:2686` `setLightEditContext`). Promote the collider context to the same pattern: add `$colliderEditContext: atom<{colliderId: string; instanceIndex: number} | null>` + setter in editorStore (ephemeral, never undoable, cleared with selection changes exactly as `$lightEditContext` is). `EditorScene` writes it where it writes its private map (code: `src/three/EditorScene.ts:355`) and reads it instead of (or in addition to) the map — one atom means gizmo, fields and keyboard can never disagree (design §1.2 "keyed by id now").
2. Add to `src/three/selectionTransform.ts` an exported `liftedSelectionRefs(): SelectedTransformRef[]` that maps `selectedTransformRefs()`: for a SubPart-owned collider, lift through `colliderWorld(transform, contextPlacementTransform)`; for an owned light, `lightWorld(...)`; others pass through. And `writeBackLifted(refs, transforms)` applying the matching inverses (`colliderLocalFromWorld` / `lightLocalFromWorld`, code: `src/three/coords.ts:123/233`) before `updateSelectedTransforms`. Mirror the exact per-kind rules EditorScene uses in `applyBulkFromPivot` (code: `src/three/EditorScene.ts:1985-2032`) — the light rule applies owner scale to the position offset only; they are NOT interchangeable (census: viewport-scene-view.md §5 invariants).
3. `applySelectionTransform` uses `liftedSelectionRefs()` for both the centroid and the transform pass, writing back through the inverse. Locked-layer whole-selection no-op and one-undo-per-press semantics unchanged.
**Verify**: `pnpm typecheck`; `pnpm test` — `selectionTransform.test.ts` cases: a SubPart-owned collider on a placement rotated 90° about Y, nudged +1 m on world X, ends at the same world position a gizmo drag would produce (compare against `colliderWorld` round-trip); same for an owned light under a scaled owner (scale applies to position offset only); part-level entities unchanged; locked layer ⇒ no-op, no undo push.

#### P5B.04 — viewStore: `$kindVisibility` (+ verify the P4.09 camera state)
**Goal**: State for View ▸ Display Filters; camera intent state ALREADY EXISTS (P4.09) — verify, add nothing.
**Files**:
- modify `src/state/viewStore.ts`
- create `src/state/viewStore.test.ts` (or extend if it exists)
**Depends on**: none.
**Spec** (design: design-build-mode.md §5.3, §5.4, §12 viewStore row):
1. `export const $kindVisibility = persistentJSON<Record<'connector'|'collider'|'ivaSeat'|'light'|'kitten'|'aid', boolean>>('flexo:kindVisibility', {connector:true, collider:true, ivaSeat:true, light:true, kitten:true, aid:true});` + `toggleKindVisible(kind)`. Per-browser view pref, never undoable. (`aid` = Measurement Aids menu entry.) Read defensively `{...DEFAULTS, ...stored}` — no migration ever.
2. **Camera intent — VERIFICATION ONLY (P4.09 shipped the whole LOCKED #7 feature)**: `$cameraFrame` + `frameCamera()` (nonce atom), `src/three/cameraFraming.ts`, `Viewport.frameBounds(center, size)`, `snapCamera(dir, target?)`, and the `view.frameSelection`/`view.resetCamera`/`view.cameraSnap.*` commands + `F` binding all exist. Assert by grep (`grep -n "cameraFrame\|frameCamera" src/state/viewStore.ts` → hits). **Do NOT create `$frameRequest` or any second frame-intent atom** — one intent, one name.
3. `resetCamera()` (code: `src/state/viewStore.ts` `resetCamera`) is already registered as the `view.resetCamera` command (P4.09) — nothing to do.
**Verify**: `pnpm typecheck`; `pnpm test` — cases: `$kindVisibility` defaults all-true; toggle round-trips; defensive read drops unknown keys. P4.09's `cameraFraming.test.ts` still green (untouched).

#### P5B.05 — chainStore: `moveChainOpTo` for drag-reorder
**Goal**: Index-targeted reorder action backing the chain window's drag-reorder.
**Files**:
- modify `src/state/chainStore.ts`
- modify `src/state/chainStore.test.ts`
**Depends on**: none.
**Spec** (design: design-build-mode.md §12 chainStore row): alongside `moveChainOp(id, dir)` (code: `src/state/chainStore.ts:405` `moveChainOp`), add `export function moveChainOpTo(id: string, index: number): void` — splice the op out and re-insert at the clamped index; no-op when the id is unknown or the index unchanged. Session edits are ephemeral, never undoable (invariant: chains-misc.md §5 "session never in undo").
**Verify**: `pnpm test` — `chainStore.test.ts` cases: move first→last, middle→0, out-of-range clamps, unknown id no-op, other ops' order preserved.

---

## B. Gizmo space, snap wiring, Tool bar, status chips

#### P5B.06 — Gizmo local/world space in TransformGizmo + EditorScene
**Goal**: `$gizmoSpace` drives `TransformControls.setSpace` for single targets and the multi-select pivot orientation.
**Files**:
- modify `src/three/TransformGizmo.ts`
- modify `src/three/EditorScene.ts`
**Depends on**: P5B.02.
**Spec** (design: design-build-mode.md §4.2 — a DECISION, follow exactly):
1. `TransformGizmo` gains `setSpace(space: 'world' | 'local')` forwarding to `this.controls.setSpace(space)` (three.js native).
2. `EditorScene` subscribes `$gizmoSpace` through its `sub()` helper (invalidates the on-demand loop — census viewport-scene-view.md §0) and calls `setSpace`.
3. **Multi-select**: the pivot group today is identity-oriented at the centroid (code: `src/three/EditorScene.ts:1590` `repositionPivot`). With `local`, set the pivot group's quaternion to the **primary (last-selected) entity's world orientation** before attach and on `repositionPivot`; with `world`, identity (today's behavior). Bulk math is untouched — `applyBulkFromPivot` (code: `src/three/EditorScene.ts:1985` `applyBulkFromPivot`) already applies the pivot's delta, so rotation happens about the primary's axes through the centroid.
4. Single owned collider/light: local = the entity's own axes through the owner frame (TransformControls handles this since the gizmo attaches to the instance visual — verify no extra work needed; if the attach target is a proxy, orient it).
5. Keyboard rotate/nudge stay **world-axis always** — do NOT thread `$gizmoSpace` into `selectionTransform.ts` (design §4.2 explicitly).
**Verify**: `pnpm typecheck`; manual: single box rotated 45°, toggle W/L → handles re-align; 3-entity selection in local → rotate ring turns about the primary's axes; W/S keys still rotate about world X either way.

#### P5B.07 — Snap wiring: boot apply + ⌃ temporary invert during drag
**Goal**: snapStore feeds the gizmo at all times; holding ⌃ mid-drag inverts snap temporarily.
**Files**:
- modify `src/three/EditorScene.ts`
- modify `src/main.tsx` (boot: `applySnapToGizmo(false)` once after stores init)
**Depends on**: P5B.01.
**Spec** (design: design-build-mode.md §4.1/§4.3; foundation §14.2 "⌃ held during a gizmo drag = temporary snap invert"): EditorScene already pipes `$snap` → `gizmo.setSnap` (code: `src/three/EditorScene.ts:631` subscription; cite in comment). Add: while a gizmo drag is live (inside the existing `onDraggingChanged`/per-frame path, code: `src/three/EditorScene.ts:417-462`), subscribe `modifierStore.$heldModifiers` and call `applySnapToGizmo(held.ctrl)`; on drag end call `applySnapToGizmo(false)`. Never during typing (drag-scoped only). No undo interaction — snap changes are never undoable.
**Verify**: `pnpm typecheck`; manual: snap off → drag is free; hold ⌃ mid-drag → 0.1 m stepping appears; release ⌃ → free again; snap on → ⌃ frees it.

#### P5B.08 — The Tool bar floating window
**Goal**: `FloatingWindow` id `toolbar`: Move/Rotate/Scale, W/L, snap magnet + step popover — the SelectionToolbar's replacement (minus actions, per Law 1).
**Files**:
- create `src/ui/build/ToolBarWindow.tsx`
- modify the app shell mount (`src/app.tsx` or the shell root established by earlier phases)
- modify the Window-menu MenuSpec (add/verify `Tool Bar ✓` toggling `layoutStore.floatHidden`)
**Depends on**: P5B.01, P5B.02, P5B.06.
**Spec** (design: design-build-mode.md §4.1; foundation §6.2 toolbar row):
- ToggleButtonGroup bound to `$toolMode` via `setToolMode` (code: `src/state/editorStore.ts:3981` `setToolMode`) but **displaying `$effectiveToolMode`** (code: `src/state/engineStore.ts:275-288` `$effectiveToolMode` — exhaust clamps Scale→Move truthfully); Scale button disabled while exhaust placing (`$isExhaustPlacing`, same file). This mirrors the v1 SelectionToolbar mode group (code: `src/ui/SelectionToolbar.tsx:61` Scale-disabled) — port that logic, then the old bar dies in P5B.17.
- **W/L segmented** toggle bound to `$gizmoSpace`/`toggleGizmoSpace` + palette command "Toggle gizmo space".
- **⧉ snap magnet** ToggleButton bound to `$snapEnabled`/`toggleSnap` + **▾ chevron Popover**: `Translate step [0.1] m` and `Rotate step [15] °` — both `PreciseNumberInput` (`useNumberDraft` + `inputMode="url"`, mandatory) writing `setSnapTranslateStep`/`setSnapRotateStep`; caption "Hold ⌃ while dragging for the temporary opposite".
- Host in `FloatingWindow` (windowId `'toolbar'`, default anchor top-center of the viewport 8px below the menubar, draggable by grip, clamped to the workspace band, position persisted `layoutStore.float.toolbar`). Visible whenever a gizmo target exists: `$hasSelection || $isPoseEditing || $isExhaustPlacing` (code: `src/state/animationStore.ts:67` `$isPoseEditing`) AND not hidden via `layoutStore.floatHidden` (Window ▸ Tool Bar).
- NO selection actions (Duplicate/Chain/Delete) — deliberately absent (Law 1; design §4.1 last bullet).
- Hotkeys `T`/`⇧T` cycle the tool (registered in the viewport scope by the shell phase — verify the command they run is `setToolMode` cycling; wire if missing).
**Verify**: `pnpm typecheck`; `pnpm lint`; manual: bar appears on selection, drags and persists position, W/L + magnet + steps work, Scale disabled during exhaust placement, Window ▸ Tool Bar hides it.

#### P5B.09 — Status chips: NEW SnapChip (segment 9) + `[`/`]` tooltip truth in the existing TransformChips
**Goal**: The snap chip fills the documented P3 gap, and the P3.08 rotate/nudge chips' tooltips tell the post-P4 truth. **RESIDUAL-SCOPE TASK** — P3.08 already built `src/ui/status/TransformChips.tsx` (rotate + nudge chips, click-cycle, verbatim v1 tooltips) and deleted `TransformHud.tsx`; do NOT create `RotateNudgeChips.tsx`, do NOT re-delete anything.
**Files**:
- create `src/ui/status/SnapChip.tsx`
- modify `src/ui/status/StatusBar.tsx` (fill the `{/* segment 9: snap chip — P5B (snapStore) */}` marker P3.04 left)
- modify `src/ui/status/TransformChips.tsx` (tooltip strings only)
- modify `src/ui/nudgeControls.ts`, `src/ui/rotateControls.ts` (stale doc comments only)
**Depends on**: P5B.01, (P3.08 landed).
**Spec** (design: design-build-mode.md §5.2 feedback bullet + §10 rows 7–9; foundation §5 segments 8–9):
- **Snap chip** (NEW, segment 9): mirrors `$snapEnabled` (`[Snap ⧉]`, accent-tinted when on); click = `toggleSnap()`; tooltip notes the steps + the ⌃ hold-invert ("Hold ⌃ while dragging for the temporary opposite"). Desktop-only, like segments 7–8.
- **TransformChips tooltip update** (the P3.08 marker "P5B.09 updates these tooltip strings"): the RotateHint rows still name `F`/`⇧F` for the step — replace with `[` (smaller) / `]` (larger) per the P4.08 rebind; everything else verbatim. Also confirm the chips read the true gizmo hues via `src/ui/status/axisColors.ts` (the P3.04 re-export of `src/three/axisColors.ts` `AXIS_COLOR_CSS`) — never re-introduce a numeric color copy.
- **Feedback**: `nudgeControls.ts`/`rotateControls.ts` toast wrappers keep calling `toast(...)` — the facade routes transients to the status message channel already (foundation §5.1; do NOT rewrite call sites). Fix the stale "M / Shift+M" doc comments while touching these files (census pain 13).
- Chips are desktop-only (hidden on phone — the touch cluster in P5B.29 covers the actions). No undo participation anywhere here (prefs persisted `flexo:*`, unchanged).
**Verify**: `pnpm typecheck`; manual: press `←/→` → nudge chip axis changes live + transient status flash; `[`/`]` changes the rotate chip AND its tooltip now names `[`/`]`; snap chip toggles + matches the Tool bar magnet (same store); `grep -rn "TransformHud\|RotateNudgeChips" src/` → 0.

---

## C. Left focus editor (split TransformInspector, then delete it)

Directory note: put all new Build focus-editor components in `src/ui/build/` (create it) unless Phase 5A already established a different mode-UI directory convention — then follow that.

#### P5B.10 — Focus editor framework: dispatch, header ⋮, tool parameter slot, empty state
**Goal**: One left-sidebar component that renders (tool parameter card?) → (focus card) → (empty cheat-card) as a pure function of `(mode, focus)`.
**Files**:
- create `src/ui/build/BuildFocusEditor.tsx`
- create `src/ui/build/FocusCardHeader.tsx`
- modify the left-sidebar mount for Build mode (shell's sidebar host)
**Depends on**: none (renders the still-alive `TransformInspector` as its interim body until P5B.11–16 swap cards in — keeps every intermediate commit compiling).
**Spec** (design: foundation §7 + design-build-mode.md §3 intro, §3.10, §3.11):
- Dispatch order: (1) tool parameter card while `$activeTool` has parameters — coverage report (`$coverageReport`, code: `src/state/colliderStore.ts:89-105` `requestCoverageCheck`/`clearCoverageReport`) and the measure live readout (P5B.25); (2) aid editor card when a measurement/container is active (`$activeMeasurementId` / `$activeContainerId`); (3) `MultiSelectPanel` when `$hasMultiSelection`; (4) per-kind inspector for exactly-one `$selectedEntity`; (5) empty state.
- `FocusCardHeader`: kind glyph + title (entity name / "N items" / aid label) + ⋮ overflow Menu carrying the focus object's commands (Duplicate / Copy / Change Layer ▸ / Delete… per kind — run the same registered commands as the Outliner row menus; do not duplicate logic).
- Empty state cheat-card (design §3.11): "Build — place and arrange entities." + hotkey list (F frame · T tool · B box-select · M measure · ⌘D duplicate · 1–5 modes) + `[Add SubPart…]` `[Import Model…]` buttons (run the Add commands); first run adds `[Open Projects…]`.
- All fields inside cards follow: `useNumberDraft` + `inputMode="url"`; `onInteractionStart` pushes ONE undo per typing session; `isDisabled` when the entity's layer is locked (subscribe `$layerView` for re-render, as v1 did — code: `src/ui/TransformInspector.tsx:107-240` `TransformInspector` top-level dispatch, the pattern being replaced).
**Verify**: `pnpm typecheck`; app runs with the interim body; empty state shows with nothing selected.

#### P5B.11 — Shared transform groups + SubPartInspector + ConnectorInspector
**Goal**: First per-kind split: the generic Position/Rotation/third-group machinery as a shared component, plus the SubPart and Connector cards, guts unchanged.
**Files**:
- create `src/ui/build/TransformGroups.tsx`
- create `src/ui/build/SubPartInspector.tsx`
- create `src/ui/build/ConnectorInspector.tsx`
- modify `src/ui/build/BuildFocusEditor.tsx` (route these two kinds to the new cards)
**Depends on**: P5B.10.
**Spec** (design: design-build-mode.md §3.1–§3.3; census: selection-transform.md §1.7 — **EVERY field survives**):
- `TransformGroups`: POSITION (m) X/Y/Z `PreciseNumberInput` (undo `'move'` pushed once on focus via `onInteractionStart`); ROTATION (°) with the RAD2DEG/DEG2RAD boundary (undo `'rotate'`); third group per kind prop: SubPart/kitten SCALE (×); connector SCALE with caption "Attach-node size class — group scale never changes this" (constitution: connector `<Scale>` is a size CLASS); collider SIZE (m) via `colliderSizeLabels` (code: `src/ui/TransformInspector.tsx:54` import + `:189` usage — port); seat: omit. Move the commit path verbatim from the v1 generic groups (code: `src/ui/TransformInspector.tsx:159-237`, `updateSelectedTransform` routing).
- `SubPartInspector` (design §3.2): transform groups; **Instance ID** mono TextField — live commit per keystroke via `setSubPartInstanceId` (code: `src/state/editorStore.ts:2432` `setSubPartInstanceId`), trims, ignores empty, undo `'edit instance ID'` on focus (port `SubPartHeader`, code: `src/ui/TransformInspector.tsx:251` `SubPartHeader`); read-only template id caption; **Interior (IVA)** per-TEMPLATE Switch with caption "applies to all N placements of this template", disabled "n/a for glass" via `isGlassTemplate` (code: `src/state/editorStore.ts:3871` `isGlassTemplate`; write via `setPlacementsInternal`, `:3896`); **jump row** `[SubPart Data →]` (Data-mode jump command with template-scope payload, foundation §2.5/§4) · `[Edit Surface →]` (custom meshes only; Surface-mode jump).
- `ConnectorInspector` (design §3.3): port `ConnectorHeader` verbatim (code: `src/ui/TransformInspector.tsx:440` `ConnectorHeader`): FLAGS switches (all `CONNECTOR_FLAGS`, re-emitted in canonical order), CAPABILITIES switches, BulkFluid/SolidMotorCase/DecouplerJoint hint text verbatim; add caption "Connectors cannot animate with joints" (KSA limitation, AGENTS.md).
**Verify**: `pnpm typecheck`; `pnpm test` (no regressions); manual: every SubPart/connector field from census §1.7 present and editing live; typing session = one undo step; locked layer disables all.

#### P5B.12 — ColliderInspector (+ coverage as focus section AND tool parameter card)
**Goal**: Collider card with shape/owner/fit/coverage, guts unchanged.
**Files**:
- create `src/ui/build/ColliderInspector.tsx`
- create `src/ui/build/CoveragePanel.tsx`
- modify `src/ui/build/BuildFocusEditor.tsx`
**Depends on**: P5B.10, P5B.11.
**Spec** (design: design-build-mode.md §3.4): port `ColliderHeader` + `CoveragePanel` verbatim (code: `src/ui/TransformInspector.tsx:523` `ColliderHeader`, `:630` `CoveragePanel`): Shape select (`COLLIDER_SHAPES`); Owner select with old→world→new frame conversion via `colliderWorld`/`colliderLocalFromWorld` so the shape doesn't jump; the three status lines ("Owner template is not placed — dead data" / "Applies to all N placements · follows joint animation" / non-unit-owner-scale warning) verbatim; `[Fit to Selection]` → `requestColliderFit` intent (code: `src/state/colliderStore.ts:41` `requestColliderFit`); COVERAGE `[Check]`/`[Clear]` → `requestCoverageCheck`/`clearCoverageReport` + report rows (% covered, count outside, bloat ratio, "gaps marked red in the viewport") + "Sample every vertex (slower, accurate)" precision Switch (`$colliderSettings.precision`, persisted). Add the caption linking "Fit options in Settings" (margin/orient knobs get their UI in Settings → Viewport per foundation §10.7 — built by **P9.17b**, NOT in this card; do not add fields here). The same report renders as a **tool parameter card** when Tools ▸ Collider Coverage Check runs selection-free (P5B.10 slot). Undo: shape/owner edits are discrete document mutations (push internally, as v1 does); fit result = one undo step (scene-side, unchanged).
**Verify**: `pnpm typecheck`; manual: owner re-home doesn't visually jump the collider; coverage check draws red dots and reports; precision toggle persists.

#### P5B.13 — SeatInspector + KittenInspector
**Goal**: IVA seat card (reorder/sit/kitten/axes/aim) and the minimal kitten card.
**Files**:
- create `src/ui/build/SeatInspector.tsx`
- create `src/ui/build/KittenInspector.tsx`
- modify `src/ui/build/BuildFocusEditor.tsx`
**Depends on**: P5B.10, P5B.11.
**Spec** (design: design-build-mode.md §3.5, §3.7): port `IvaSeatHeader` verbatim (code: `src/ui/TransformInspector.tsx:1009` `IvaSeatHeader`): "Seat i of N" header; ▲▼ reorder via `moveIvaSeat` (code: `src/state/editorStore.ts:1189` `moveIvaSeat` — order IS the exported IVA cycle; discrete undo); "IVA opens on this seat" chip on index 0; `[Sit in This Seat]` → the seat-view tool (P5B.26; allowed on locked layers — camera-only); `[Add Kitten at Seat]` → `addKittenAtSeat` (code: `src/state/editorStore.ts:1265`); read-only **Axes (exported)** Forward/Up via the exporter's G6 formatter; six Aim presets with the near-parallel NaN guard preserved (`PARALLEL_DOT`, code: `src/ui/TransformInspector.tsx:1026-1035` area — port constant + math); `[Aim at Selection]` → the `requestIvaSeatAim` intent (`src/state/ivaSeatStore.ts`); the no-`<Internal>`-geometry warning now with an inline `[Toggle Hide Interior]` link flipping `$hideInterior` (design §3.5.6 — the census discoverability fix, viewport-scene-view.md pain 12). `KittenInspector`: POSITION/ROTATION/SCALE groups + caption "Editor-only aide — never exported. Convert with Add ▸ Make Kitten Mesh."
**Verify**: `pnpm typecheck`; manual: reorder swaps badges in-viewport; aim presets never NaN near-parallel; the interior link toggles the View state (no undo step).

#### P5B.14 — LightInspector
**Goal**: The full dual-frame light editor as its own card (replaces all generic groups for lights).
**Files**:
- create `src/ui/build/LightInspector.tsx`
- modify `src/ui/build/BuildFocusEditor.tsx`
**Depends on**: P5B.10.
**Spec** (design: design-build-mode.md §3.6 — 11 fields in order; census: selection-transform.md §1.7 LightHeader): port `LightHeader` verbatim (code: `src/ui/TransformInspector.tsx:727` `LightHeader`): owner status line + multi-instance context note; Owner select (`setLightOwner`, code: `src/state/editorStore.ts:2773`); type select Spot/Point; Position (owner frame) when a placed owner gives a distinct frame; Aim rotation (owner frame, Spot); Position (part frame) converted through `$lightEditContext` (code: `src/state/editorStore.ts:2686` `setLightEditContext` — the SAME atom the gizmo uses; keep it); Aim (part frame, unit vector) committing via `lightAimRotation` (code: `src/three/coords.ts:375` `lightAimRotation` — minimal ΔQ, no roll, degenerate vectors rejected); Range/Intensity `PreciseNumberInput`s; **Color** — use the kit ColorField if the system-services phase landed it; if it has not landed yet, keep the v1 native `<input type=color>` (undo pushed on open/pointerdown as today) and leave a `// TODO(kit ColorField — foundation §10.7 note)` — do NOT build a bespoke picker; Spot Inner/Outer Angle (°, half-cone, 0–90); `LightFalloffCurve` sparkline (code: `src/ui/LightFalloffCurve.tsx` — reuse as-is; same exposure as the 3D shells, agree-by-construction); Ray tracing (IVA only) Switch. Caption row: "Coverage & preview → View menu · marker size → Settings → Viewport" (the marker-size field is built by **P9.17b**; the caption is forward-looking until then). Every numeric = `useNumberDraft` path; every discrete edit undo-enrolled exactly as v1 (streaming push on focus for typed fields).
**Verify**: `pnpm typecheck`; manual: click a second instance's marker → part-frame fields re-derive through that instance and match the gizmo; aim vector edit never rolls the light.

#### P5B.15 — MultiSelectPanel with the owner-frame lift fix (census pain 4 fix, part 2) + VectorApply on useNumberDraft
**Goal**: The 2+ selection panel: Move/Rotate/Scale-by appliers that match the gizmo frame-for-frame, plus the actions row.
**Files**:
- create `src/ui/build/MultiSelectPanel.tsx`
- create `src/ui/build/VectorApply.tsx`
- modify `src/ui/build/BuildFocusEditor.tsx`
**Depends on**: P5B.03, P5B.10.
**Spec** (design: design-build-mode.md §3.8; census: selection-transform.md §1.7 BulkTransformPanel + pains 4, 11):
- Header "N items" + per-kind breakdown caption + ⋮.
- **VectorApply rebuilt on `useNumberDraft`** (kills the third hand-rolled numeric path — v1 code: `src/ui/TransformInspector.tsx:384` `VectorApply` used local `useState` + `isPartialNumber`): three `useNumberDraft` fields + `[Apply]`; drafts reset to 0/0/0 (1s for scale) after Apply; `inputMode="url"`.
- Three groups — Move by (m) / Rotate by (°) around centroid / Scale by (×) with "Scale positions too (smart)" Switch (`$bulkScaleMode`, code: `src/state/editorStore.ts:234`; `scalesWithGroup` connector rule rides along in `bulkTransform.ts` unchanged). **THE FIX**: iterate `liftedSelectionRefs()` (P5B.03) — not raw `$selectedRefs` — and write back through `writeBackLifted`, so "Move by 1 m X" on an owned light equals the gizmo drag exactly (design §3.8.4). Each Apply = ONE undo step (`'move'`/`'rotate'`/`'scale'`, detail "N items") pushed by the apply action (discrete).
- **Actions row** (port from `MultiSelectToolbar`, code: `src/ui/MultiSelectToolbar.tsx` — Change Layer via `moveSelectionToLayer`, Interior via `setPlacementsInternal` with the glass-disabled + N-template blast-radius header verbatim): `Change Layer ▸` (ordinary layers only; pinned kinds silently stay; one undo step) · `Interior (IVA) ▸ On/Off` · `Duplicate` (`duplicateSelected()`, offset) · `Chain…` (opens the chain session, P5B.28) · `Delete All (N)…` — confirm via the foundation **inline destructive strip** (§14.3: >5 or whole-container ⇒ confirm; kit InlineConfirmStrip from the shell phase, else a local inline strip — never a modal-from-panel).
- All fields/actions disabled when ANY selected layer is locked (whole-selection no-op invariant).
**Verify**: `pnpm typecheck`; `pnpm test`; manual: selection containing an owned light — "Move by 1 X" lands where the gizmo would put it; Apply resets drafts; Delete All confirms inline.

#### P5B.16 — Aid editor cards take the focus slot; kill the left-center float
**Goal**: `MeasurementEditorCard` + `ContainerEditorCard` render in the ONE focus slot; `FloatingEditorPanel` and the floating editors die.
**Files**:
- create `src/ui/build/MeasurementEditorCard.tsx`
- create `src/ui/build/ContainerEditorCard.tsx`
- modify `src/ui/build/BuildFocusEditor.tsx`
- delete `src/ui/MeasurementEditor.tsx`, `src/ui/ContainerEditor.tsx`, `src/ui/FloatingEditorPanel.tsx` (+ their mounts)
**Depends on**: P5B.10.
**Spec** (design: design-build-mode.md §3.9; foundation §6.3 death list rows): rehost the guts of `MeasurementEditor.tsx` / `ContainerEditor.tsx` **unchanged** into the two cards:
- Measurement: `[A|B]` endpoint toggle (drives the dedicated endpoint translate gizmo in `MeasurementLayer` — wiring untouched, code: `src/three/MeasurementLayer.ts` `updateEndpointGizmo` per census viewport-scene-view.md §1.5) · A/B Vec3 fields (per-axis disable under axis lock) · Length (re-projects B) · Axis lock Free/X/Y/Z · Color+opacity (`ColorAlphaField`) · Width slider 1–10 · Lock (read-only display when locked) · Delete. Discrete edits undoable ('move endpoint'/'line length'/'line style' — via `registerEditorAidStores` wiring, unchanged); endpoint gizmo pushes once at drag start.
- Container: Gizmo mode Move/Rotate/Scale segmented (`$containerGizmoMode`, code: `src/state/containerStore.ts:145` `setContainerGizmoMode`; independent of the Tool bar; scale re-normalizes via `normalizeSize`, `:89`) · shape Size fields · Segments · Center Vec3 · Rotation (°) Euler↔quaternion · line color/opacity/width · Warn toggle + color + opacity · Lock · Delete.
- Focus-slot rules: activating an aid takes the slot; selecting a mesh deactivates it (`setActiveMeasurement(null)` mutual exclusion preserved, code: `src/state/measurementStore.ts:140` `setActiveMeasurement`); Esc never clears (design §3.9 last line).
**Verify**: `pnpm typecheck`; manual: click an aid row in the Outliner → card appears in the left sidebar (nothing floats left-center anymore); click a mesh → selection card returns; measurement undo works.

#### P5B.17 — DELETE: TransformInspector, FloatingInspector, SelectionToolbar, MultiSelectToolbar
**Goal**: The v1 inspector + floating toolbars are gone; every consumer routed to the new homes.
**Files**:
- delete `src/ui/TransformInspector.tsx`, `src/ui/FloatingInspector.tsx`, `src/ui/SelectionToolbar.tsx`, `src/ui/MultiSelectToolbar.tsx`
- modify `src/app.tsx` (remove mounts), `src/ui/ModeSidebar.tsx` (P4.03's host — InspectorContent is gone) / `src/ui/MobileInspector.tsx` (drop the `showTransform` TransformInspector inline mount — phone gets the new cards in P5B.29), `src/state/uiStore.ts` (remove `$inspectorFloatPos` if now unused)
**Depends on**: P5B.08 (tool switcher home), P5B.11–P5B.16 (every field rehomed).
**Spec**: Foundation §6.3 death list: SelectionToolbar → Tool bar window + left panel + Edit menu; MultiSelectToolbar → MultiSelectPanel; FloatingInspector → focus editor. Before deleting, grep each symbol for consumers; anything still importing (e.g. `MobileInspector`) must be re-pointed at `BuildFocusEditor` content or stubbed pending P5B.29 — the repo must compile at this task's end. Do not leave orphaned persisted keys writing (`$inspectorFloatPos`): delete the atom; the stale `flexo:` localStorage key is simply abandoned (no migration — constitution).
**Verify**: `pnpm typecheck`; `pnpm lint`; `grep -rn "TransformInspector\|FloatingInspector\|SelectionToolbar\|MultiSelectToolbar" src/` → 0 hits; app runs, all Build editing still reachable.

---

## D. Viewport gestures, edit commands, camera, View menu, Add menu

#### P5B.18 — ⌥-drag duplicate (one undo step per gesture) + modifier hints
**Goal**: Holding ⌥ at gizmo drag start duplicates first and drags the copies; the whole gesture is ONE `'duplicate'` undo step.
**Files**:
- modify `src/three/EditorScene.ts`
- modify the modifier-hint provider registration (modifierStore hint providers from the shell phase)
**Depends on**: P5B.02.
**Spec** (design: design-build-mode.md §5.1; foundation §14.2; census: selection-transform.md §1.1 "NOT present ... no alt-drag-duplicate"): in the gizmo `onDragStart` handler (code: `src/three/EditorScene.ts:417` `onDragStart` — where the single undo push lives today): if `modifierStore.$heldModifiers.get().alt` and the target is the selection (NOT pose/exhaust proxies), call `duplicateSelected({ offset: false })` FIRST (it pushes the one `'duplicate'` undo step and selects the copies), re-attach the gizmo to the new selection (`updateSelection` path), and **skip the normal `'move'/'rotate'/'scale'` push** — the duplicate step covers the gesture, so ⌘Z removes the copies entirely (DCC convention, design §5.1). Streaming per-frame writes proceed as normal. Works for all six duplicateable kinds. Register a hint provider: hovering a gizmo handle with a selection ⇒ `⌥ Duplicate drag · ⌃ Snap` (design §10 modifier-hints row).
**Verify**: `pnpm typecheck`; manual: ⌥-drag a 3-entity selection → copies move, originals stay; ⌘Z once → copies gone, originals untouched; history shows exactly one `'duplicate'` step; plain drag still pushes `'move'`.

#### P5B.19 — Edit commands: ⌘D duplicate-with-offset, ⌘X cut, delete confirm policy
**Goal**: The Edit-menu/viewport edit chords run the v2 semantics with the one confirm policy.
**Files**:
- modify `src/ui/commands/editCommands.ts` (P2.09's Edit commands module — the canonical path)
- modify the hotkey registrations if the shell phase left ⌘D/⌘X unbound (P2.12 bound both; P4.08 scope-narrowed them — expect verify-only)
**Depends on**: P5B.02.
**Spec** (design: design-build-mode.md §7.1–§7.3; foundation §3 Edit tree, §11.2, §14.3):
- `Duplicate ⌘D` → `duplicateSelected()` (offset by nudge step/axis — the status chips make the offset predictable); `Cut ⌘X` → `cutSelected()`; `Copy ⌘C`/`Paste ⌘V` now flow through the lights-inclusive clipboard (P5B.02). Status flashes: `Pasted N items`, `Cut N items` (transient tier via `toast()`).
- `Delete ⌫` → one policy (design §7.3): ≤5 entities ⇒ no confirm, `removeSelected()` + status flash `Deleted N items [Undo]` (10 s inline action running the undo command); >5 ⇒ inline confirm strip stating counts before `removeSelected()`. This heals the v1 hotkey-vs-toolbar inconsistency in BOTH directions (census: selection-transform.md pain 10).
- All five are viewport-scoped bindings with the `surface:outliner` (etc.) mirrors already registered by the shell phase (foundation §11.1 list-surface edit mirrors) — verify the mirrors delegate to these same command ids.
- Undo enrollment: duplicate/cut/paste/delete each push exactly one step internally (discrete) — no extra pushes in the command layer.
**Verify**: `pnpm typecheck`; manual: ⌘D lands copies one nudge-step up (default Y·0.1); ⌘X + ⌘V round-trips a light; deleting 6 items asks, 3 items flashes with working [Undo]; same chords work with Outliner rows focused.

#### P5B.20 — Camera commands: VERIFY the P4.09 delivery (no new code)
**Goal**: Assert the three LOCKED #7 camera features shipped in **P4.09** still behave with the 5A/5B selection + display-filter changes in place. **VERIFICATION-ONLY TASK — write no new atoms, functions, commands, or bindings** (P4.09 owns: `$cameraFrame`/`frameCamera()`, `src/three/cameraFraming.ts`, `Viewport.frameBounds(center, size)`, `snapCamera(dir, target?)`, `EditorScene.frameSelection()` + `selectionCentroid()`, commands `view.frameSelection`/`view.resetCamera`/`view.cameraSnap.*`, the `F` viewport binding).
**Files**: none created/deleted; touch `src/three/EditorScene.ts` ONLY if a check below fails (fix the P4.09 code in place — never a parallel path; specifically no `$frameRequest`).
**Depends on**: P5B.04 (kind filters exist to test against).
**Spec** (design: design-build-mode.md §5.3; foundation §3 View tree): run the checks and fix in place if broken:
1. `F` with an off-origin selection frames it and orbit re-centers on it; `F` with nothing selected frames the whole part; empty part → origin default view. (P5A's `$selection` migration re-pointed `selectedObjects()` — the frame path must resolve refs, not indices.)
2. View ▸ Camera Snap ▸ Top with a selection orbits the SELECTION centroid, without one the origin; distance + top/bottom up-vector fix preserved.
3. View ▸ Reset Camera restores the boot pose; camera state still persists per project.
4. A kind hidden via Display Filters (P5B.21) still counts toward frame bounds only if its group is visible — frame uses the visible groups; confirm no crash framing a selection whose kind was just filtered off.
**Verify**: `pnpm test cameraFraming` (P4.09 suite, untouched) green; the four manual checks above; `grep -rn "frameRequest" src/` → 0.

#### P5B.21 — View menu: Display Filters (NEW) + verify the P2.09-wired Build items
**Goal**: Per-kind Display Filters work end-to-end; the rest of the View menu is verified live. **RESIDUAL-SCOPE TASK** — `ViewButton.tsx` died in **P2.11** and P2.09 already WIRED the View items (grids, hide-interior, environment, sky, light coverage, live preview, measurement overlays, units, FPS) against their stores; the camera items went live in **P4.09**; the popover numerics moved to Settings in **P2.07**. Do not re-wire or re-delete any of that.
**Files**:
- modify the View MenuSpec + `src/ui/commands/viewCommands.ts` (ONLY the new Display Filters entries + un-stubbing `view.displayFilters` from P2.09's stub table)
- modify `src/three/EditorScene.ts` (`applyLayerView` composition + pick guard + marquee exclusion)
- modify `src/ui/outliner/OutlinerPanel.tsx` kind subheaders (crossed-eye glyph)
**Depends on**: P5B.04, P5B.20.
**Spec** (design: design-build-mode.md §5.4; foundation §3 View tree — names verbatim from FINAL_DESIGN_INDEX menubar tree):
- **Verify (no new wiring expected)**: Frame Selection · Reset Camera · Camera Snap ▸ (P4.09/P5B.20) · Grids ▸ + `Grid Settings…` deep-link · Hide Interior ✓ · Environment ▸ · Show Sky Background ✓ · Scene Lighting… (deep-link Settings `{tab:'scene'}`) · Light Coverage ▸ · Live Light Preview ✓ · Measurement Overlays ▸ · Units ▸ · FPS Counter ✓ — all P2.09 rows; walk each once. Fix in place only where a P2.09 interim marker says this phase completes it.
- **Display Filters ▸** (area addition, design §5.4): `✓ Connectors · ✓ Colliders · ✓ IVA Seats · ✓ Lights · ✓ Kittens · ✓ Measurement Aids` toggling `$kindVisibility`. In `EditorScene.applyLayerView` (code: `src/three/EditorScene.ts:912` `applyLayerView` — the SINGLE writer of `group.visible`, inviolable) compose `visible = layerVisible && kindVisible(kind)`; hidden kinds are unpickable (extend the existing explicit visible pick guards — three.js raycasts invisible objects, code comment at `EditorScene.ts:323`) and marquee-excluded (feed the same predicate to the marquee hit test from 5A). Outliner: when a kind is filtered off, its kind subheader gets a small crossed-eye glyph (rows untouched).
- ViewButton is ALREADY GONE (P2.11) and its exposure select (Auto/Absolute + vizExposure) and tonemap/exposure/reflections/blur sliders ALREADY live in the Settings dialog's sections (P2.07; the full §10.7 tab IA is P9.17/P9.17b) — verify reachability, hand off nothing.
**Verify**: `pnpm typecheck`; manual: every View item toggles its store (spot-check grids, hide interior, environment, coverage, units, FPS); Display Filters ▸ Connectors off → connectors vanish, unclickable, marquee skips them, Outliner subheader shows the glyph; `grep -rn "ViewButton" src/` → 0 (already true since P2.11).

#### P5B.22 — Add menu: S27 choreography completion + provider verify
**Goal**: The v2 add choreography (status flashes, Define Engine payload) is complete. **RESIDUAL-SCOPE TASK** — `AddButton.tsx` died in **P2.11**; P2.09 already built the FULL Add tree (every item + the `customMeshInstances` provider + dialog ids) and **P4.03 already made the S27 auto-switch real** (the interim-Build guard's `setInterimMode` became `setMode('build')`). Do not re-wire the tree.
**Files**:
- modify `src/ui/commands/addCommands.ts` (choreography completion only)
**Depends on**: none (browsers P5B.23/24 open via the P2.08 dialog ids).
**Spec** (design: design-build-mode.md §6.1/§6.4; foundation §3 Add tree; census: catalog-placement-layers.md §1.1):
- **Verify against the FINAL_DESIGN_INDEX Add tree** (P2.09's transcription-guard test already locks labels/order): every item present and wired to its store call; `Custom Mesh Instances ▸` provider lists non-kitten custom meshes (hidden when none) and rows run `addSubPart(subPartId)`.
- **Complete the choreography for every instant entity item** (design §6.1 table row 1) — the residual work: after the store action, `revealEntity` in the Outliner (P2.09 wired select+reveal only for lights — extend to every entity kind; the store actions since P5A.01 select internally) and a status flash `Connector added` etc. (transient tier via `toast()`). Auto-switch-to-Build is already live (P4.03) — verify from Data/Engine mode. One undo step per item named after the kind (the store actions already push — do not double-push).
- `Define Engine…`: upgrade from plain `enterEngineMode()` (P4.03 wiring) to the mode-switch command carrying the new-engine-picker payload (`setMode('engine', {defineNew: true})` — consumed by P7; until P7 lands the payload is accepted-and-ignored by the interim engine host, acceptable mid-flight).
- No drag-from-browser placement (explicit non-goal, design §6.1).
**Verify**: `pnpm typecheck`; manual: walk EVERY row of the FINAL_DESIGN_INDEX Add tree — each lands/opens correctly with a flash + Outliner reveal; adding a connector from Data mode switches to Build first and reveals the row; `grep -rn "AddButton" src/` → 0 (already true since P2.11).

---

## E. Catalog browsers

#### P5B.23 — SubPart browser redesign (preview-first, fuzzy, facets, cap indicator)
**Goal**: `SubPartBrowserDialog` per the pinned cover layout with the two-gesture fix.
**Files**:
- modify `src/ui/SubPartBrowser.tsx` → rename/rework as `src/ui/build/SubPartBrowserDialog.tsx`
- register dialog id `subpart-browser` in dialogStore's mount table
**Depends on**: P5B.22.
**Spec** (design: design-build-mode.md §6.2; foundation §10.10; census: catalog-placement-layers.md §1.2):
- **Commit gestures — the fix** (foundation §10.10, a logged deliberate behavior change): single click / arrow keys = **preview only** (GridList selection drives the preview pane — remove the desktop `onAction={addAndClose}`, code: `src/ui/SubPartBrowser.tsx:95-98`); **double-click / Enter / [Add]** = add-and-stay (`addSubPart(templateId)`, code: `src/state/editorStore.ts:561` — origin, identity, unit scale, active layer, `<lastSegmentLower>_<n>` id, selected); **[Add & Close]** secondary button commits and closes. Each add flashes `SubPart added` (message channel, overwrite semantics — flashes stack fine while the dialog stays open).
- **Search**: fuzzy subsequence over template id (reuse the 5A matcher), `MAX_RESULTS = 200` kept (code: `src/ui/SubPartBrowser.tsx:22` `MAX_RESULTS`) but with a visible **cap indicator row** "200 of 431 shown — refine search" (fixes silent truncation, census pain 6).
- **Facets**: `Source` Select — All / one entry per distinct `sourceFile` (field verified on `CatalogSubPart`, code: `src/ksa/catalog.ts:66` `sourceFile`); `Interior` Select — All / Interior only / Exclude interior (via `CatalogSubPart.internal`, code: `src/ksa/catalog.ts:38`). `interior` row Chip + tooltip preserved verbatim (code: `src/ui/SubPartBrowser.tsx:105-114`).
- **Shell unchanged**: `BrowserPopup` cover Modal + draggable splits resetting 50/50 per open, fresh session per open (code: `src/ui/BrowserShell.tsx:9` `BrowserPopup`); preview = `SubPartPreviewViewport` + `PreviewLoadProgress` + the `$browserPopupCount` progress-suppression contract (code: `src/state/loadProgressStore.ts:100-106` `openBrowserPopup`/`closeBrowserPopup`); details pane fields verbatim (id/source XML/atlas URL/node/material id/texture URLs). Search autofocus desktop-only.
- Browser session state is ephemeral; adds are discrete undo steps inside `addSubPart` (unchanged).
**Verify**: `pnpm typecheck`; manual: click rows freely without committing; Enter adds and stays; Add & Close exits; facets AND-compose with search; cap row appears with a broad query; phone behavior deferred to P5B.29.

#### P5B.24 — Built-in Part browser redesign (tag chips + preview-first)
**Goal**: `PartBrowserDialog` with the same gesture model plus the tag-chip facet.
**Files**:
- modify `src/ui/PartBrowser.tsx` → `src/ui/build/PartBrowserDialog.tsx`
- register dialog id `part-browser`
**Depends on**: P5B.23 (shares the gesture + cap-indicator patterns — extract shared bits into `src/ui/build/browserCommon.tsx` if that avoids duplication).
**Spec** (design: design-build-mode.md §6.3; census: catalog-placement-layers.md §1.3):
- Same preview-first gestures + cap indicator. **Search** fuzzy over id AND `editorTags` (field verified: `src/ksa/partCatalog.ts:57` `editorTags`; v1 substring at `src/ui/PartBrowser.tsx:80`). **Tag chip row** under the search field: every distinct `<EditorTag>` as a toggle chip; active chips AND-filter (the browsable facet, census pain 6/11).
- Row right edge keeps the placement count; **Destination layer** Select verbatim: `New Layer` default ("New Layer N" via `nextNewLayerName`, code: `src/ui/PartBrowser.tsx:32`) / `Current Layer` / ordinary layers (pinned filtered).
- **Commit**: `importBuiltInPart(part, resolveLayerId())` — the WHOLE pipeline verbatim (code: `src/state/partImport.ts` `importBuiltInPart`: anim GLB decode + easing fit + `restKeyframeId` deploy anchoring + GLB-faithful rest poses; id regeneration + full reference remapping; ImportedGameData carried whole; ONE undo step `'import'`; all geometry on ONE layer) then `revealLayer` (code: `src/state/layerStore.ts:90` `revealLayer` — import never lands invisible) + select-all-imported skipping hidden/locked-layer kinds. Status flash `Part added`.
- Details pane verbatim (counts/source/tags/per-template ×count + non-previewable warning); phone keeps `CompactPartSummary`.
**Verify**: `pnpm typecheck`; `pnpm test` (partImport tests untouched and green); manual: tag chips filter; import creates one revealed layer with everything selected; double-import into Current Layer stacks correctly.

---

## F. Transient tools ($activeTool tenants) + status segments

#### P5B.25 — Measure tool formalized: `$activeTool` slot, live status text, Esc rung re-point
**Goal**: Measure point-to-point runs in the `$activeTool` slot with full status-bar guidance. **RESIDUAL-SCOPE TASK** — `MeasureButton.tsx` died in **P2.11** (its list/settings dispersed: overlays/units → View menu (P2.09), aid adds → Tools menu (P2.09), aid lists → Outliner Aids (P5A.16), interim `aids.*` providers deleted by P5A); the `M` binding exists since **P4.08** (v1-toggle semantics); P3.09's `toolStatusWiring` shows an interim static measure segment. This task formalizes the tool — it deletes nothing.
**Files**:
- modify `src/state/modeStore.ts` (tool def `measure`: cancel-on-mode-switch hook)
- modify `src/state/measurementStore.ts` (arm/disarm routed through `$activeTool`; `$measureTool` becomes derived or is replaced — keep `setMeasureTool` callable, code: `src/state/measurementStore.ts:136` `setMeasureTool` — the P4.08 `M` binding and P5A.16 `＋ p2p` keep calling it)
- modify `src/three/EditorScene.ts` (suppression reads `$activeTool === 'measure'` instead of the ad-hoc flag; picking flow otherwise verbatim; expose the pending-pick state the live status text needs)
- modify `src/ui/hotkeys/escLadder.ts` rung 5 + `src/ui/status/toolStatusWiring.ts` (re-point at `$activeTool`; the P4.07 rung carries a `// P5B re-points this to $activeTool` comment; P3.09's static "click two points" text becomes the live two-step text below)
- verify Tools MenuSpec (Measure Point-to-Point `M` (t) · Add Reference Line · Add Reference Container ▸ Box/Cylinder/Sphere · Collider Coverage Check · Sit in Seat ▸ — all wired in P2.09; complete any `[interim]` markers)
**Depends on**: P5B.10 (tool parameter card slot), P5B.21 (View ▸ Measurement Overlays/Units verified).
**Spec** (design: design-build-mode.md §8.1; foundation §2.6 table row 1; census: viewport-scene-view.md §1.5 + pain 6):
- Arming (from `M` viewport binding / Tools menu / Aids `＋p2p` / palette): sets `$activeTool = 'measure'` (single slot — arming cancels the previous tool); crosshair cursor, picking suppressed, gizmo untouched — the EXACT v1 suppression semantics (code: `src/three/EditorScene.ts:478-484` measure suppression per census), just driven by the slot.
- Picking verbatim: first click raycasts part meshes snapping to the **nearest face vertex** (code: `src/three/EditorScene.ts:2207` `nearestFaceVertex` area), empty space → Y=0 ground plane; >4px drag = orbit; second click completes → measurement activates (its card takes the focus slot, P5B.16) → tool disarms. Undo: `'add measurement'` pushed on completion (via measurementStore, unchanged).
- Status tool segment (`statusStore.$toolStatus`): `Measure — click first point · Esc cancels` → `…second point`. Tool parameter card: `A placed at (x,y,z) — click point B` (design §3.10).
- Esc = ladder rung 5: cancel pending point → disarm. Mode switch cancels (incl. half-placed pick) via the tool def hook.
- MeasureButton contents already dispersed (P2.09/P2.11/P5A.16) — VERIFY each home: settings switches in View ▸ Measurement Overlays + Units; Tools ▸ Add Reference Line (calls `addReferenceLine()`, code: `src/state/measurementStore.ts:149`, then focuses its editor card); Tools ▸ Add Reference Container ▸; aid lists in the Outliner Aids section (the `＋ line`/`＋ p2p`/`＋ ▾` buttons call these same commands).
**Verify**: `pnpm typecheck`; manual: `M` arms with the live two-step status text; Esc after one point cancels the point then disarms; completing a measure opens its card; switching to Data mid-pick cancels; arming measure cancels an armed marquee (single slot); `grep -rn "MeasureButton" src/` → 0 (already true since P2.11).

#### P5B.26 — Seat view formalized: the `seat-view` tool slot
**Goal**: Seat view becomes a formal `$activeTool` tenant that survives mode switches. **RESIDUAL-SCOPE TASK** — `SeatViewBar.tsx` died in **P3.09** and the status tool segment (`Seat i / N · ◀▶ · ⓘ · Exit Esc`, wrap + re-select, honesty tooltip) already lives in `src/ui/status/ToolSegment.tsx`/`toolStatusWiring.ts`; the Tools ▸ Sit in Seat ▸ `seats` provider + `seat.exit` were wired in **P2.09**. This task formalizes the slot — it deletes and re-creates nothing.
**Files**:
- modify `src/state/modeStore.ts` (tool def `seat-view`: `survivesModeSwitch: true`; `onCancel` = the ivaStore seat teardown — must be idempotent and must NOT call back into `disarmTool`, or arming another tool recurses; factor `exitSeatView` into teardown + disarm so both paths share the teardown)
- modify `src/state/ivaStore.ts` (`enterSeatView`/`exitSeatView`, code: `src/state/ivaStore.ts:58/64`, set/clear `$activeTool = 'seat-view'` via `armTool`/`disarmTool`)
- modify `src/ui/status/toolStatusWiring.ts` (the seat entry keys off `$activeTool === 'seat-view'` instead of raw `$seatView` — segment rendering itself unchanged)
- verify Tools MenuSpec (`Sit in Seat ▸` provider rows + `Exit Seat View` disabled-when-not-seated — P2.09)
**Depends on**: none (parallel to P5B.25).
**Spec** (design: design-build-mode.md §8.2; foundation §2.6 row 2): everything inside the seat-view camera implementation is UNTOUCHED — the direction-is-the-state look loop, KSA 50° FOV, clamps, orbit snapshot/restore, marker hiding, live re-pose on document edits (census: viewport-scene-view.md §1.9 invariants; code: `src/three/Viewport.ts:289-346` look handling, `src/three/EditorScene.ts:737-755` `applySeatView` — do not refactor). Slot semantics: arming ANOTHER tool (measure/marquee/exhaust) while seated cancels seat view via `onCancel` (single-slot invariant); mode switches do NOT (survives — camera-only, mode-orthogonal). Exits: Esc (rung 8, **never preventDefault** — unchanged contract), status-segment Exit button, seat deleted, project switch. Entry points: SeatInspector `[Sit]` (P5B.13), Tools ▸ Sit in Seat ▸, Outliner seat row menu — all route through `enterSeatView` so the slot arms uniformly.
**Verify**: `pnpm typecheck`; manual: sit → status segment shows with working ◀▶/Exit (unchanged from P3.09); Esc exits without eating a dialog's Esc; switch modes while seated → still seated; press `M` while seated → seat view exits, measure arms; `grep -rn "SeatViewBar" src/` → 0 (already true since P3.09).

#### P5B.27 — Exhaust placement joins the `$activeTool` slot
**Goal**: Exhaust placement is the third formal tool tenant: single-slot exclusion, status segment, auto-off outside Engine.
**Files**:
- modify `src/state/engineStore.ts` (arming exhaust sets `$activeTool='exhaust'`; keep `$isExhaustPlacing`/`$engineExhaustGizmo`/`$effectiveToolMode` as derived/compatible views, code: `src/state/engineStore.ts:258-288`)
- modify `src/state/modeStore.ts` (tool def `exhaust`: allowed only in Engine mode, auto-off on leaving Engine, Esc rung 5 disarm, status segment `Exhaust: <nozzle> · <channel>`)
**Depends on**: P5B.25 (slot conventions established).
**Spec** (design: foundation §2.6 row 3; design-build-mode.md §8.3 notes it is Engine-designed — do ONLY the slot formalization here, no Engine-mode UI): arming/disarming flows through the single slot so arming measure cancels exhaust and vice versa (formalizes the v1 OR of suppression flags, census: viewport-scene-view.md pain 10). `$effectiveToolMode`'s Scale→Move clamp must keep working unmodified (the Tool bar reads it, P5B.08). Do not change any exhaust gizmo math or the Engine sidebar toggle wiring beyond routing through the slot.
**Verify**: `pnpm typecheck`; `pnpm test` (`engineStore.test.ts` green); manual: arm exhaust in Engine, press `M` → exhaust disarms, measure arms; leave Engine → exhaust off.

---

## G. Chain window

#### P5B.28 — Chain session rehosted into a draggable, resizable, NON-modal FloatingWindow on ⇧⌘K
**Goal**: `ChainWindow` (windowId `chain`) replaces the fixed-position ChainPalette shell — guts verbatim, plus drag/resize/drag-reorder/discard-confirm and the ⇧⌘K rebind.
**Files**:
- create `src/ui/chain/ChainWindow.tsx` (rehosts the guts of `ChainPalette.tsx`)
- modify `src/ui/chain/ChainPalette.tsx` → delete after rehost (keep `ChainStepCard.tsx`, `chainCommands.ts`, `openChainPalette.ts` — modify the latter)
- modify `src/ui/chain/openChainPalette.ts` (discard-confirm; toasts → status flashes)
- modify the Edit MenuSpec (`Begin Action Chain… ⇧⌘K`), the global hotkey registration (⇧⌘K), the multi panel `Chain…` (P5B.15), the palette command "Begin Action Chain"
- modify `src/state/modeStore.ts` (mode-switch prompt hook when ≥1 step)
**Depends on**: P5B.05, P5B.15.
**Spec** (design: design-build-mode.md §9 — follow the §9.2 wireframe; foundation §2.6 chain paragraph, §6.2 chain row; census: chains-misc.md — NON-MODALITY IS LOAD-BEARING):
- **Host**: `FloatingWindow` id `chain`, default anchor top-left of the viewport 8px in, draggable by strip, **resizable width 300–420px**, `z.float` above sidebars, position persisted `layoutStore.float.chain`. Title strip: `⠿ Action Chain — N seeds`, ✕ = Cancel.
- **Entry** (§9.1): `⇧⌘K` global binding + Edit menu + multi panel + palette. From a non-Build mode: `setMode('build')` first, then open. **P2.13 already shipped `beginActionChain()` with the discard-confirm** (`tryOpenChain` guards + the `'chain-discard-confirm'` ConfirmDialog: ≥1 step confirms, empty session silently re-seeds) — EXTEND that function, do not re-implement: add the `setMode('build')` prelude and update the seed extraction to read the 5A `$selection` refs. Guards VERBATIM (code: `src/ui/chain/openChainPalette.ts:24` `toggleChainPalette` — seeds = selected SubPart placements' instanceIds frozen in selection order; no SubParts ⇒ status warning `Select SubParts to chain`; locked-layer seed ⇒ `Selection is on a locked layer`). The v1 ⌘K silent-cancel trap is already dead (census chains-misc.md pain 7 — fixed in P2.13); this task carries the confirm into the window's Esc/✕/mode-switch paths.
- **Guts verbatim** (rehost, don't rewrite): autofocus search filtering the 6-op command list (label+keywords; re-focus after picking — the wrapper-div ref trick, code: `src/ui/chain/ChainPalette.tsx`); step cards stateless through `updateChainOp` (code: `src/state/chainStore.ts:380` — clamps + persists `flexo:chainDefaults`); the full §9.2 field census per op (already implemented in `ChainStepCard.tsx` — verify against the design list, no field drops); clamps/caps verbatim (±10000 m, ±360°, scale 0.01–100, counts ≤500, radial ≤360, total ≤2000, count=TOTAL, ghost preview cap 500 never limits Apply); footer states; ghost preview untouched (`src/three/ChainPreviewLayer.ts`).
- **NEW drag-reorder**: step cards get a ⠿ grip; drag reorders via `moveChainOpTo` (P5B.05); the ▲▼ chevrons STAY (keyboard/phone path, code: `src/ui/chain/ChainStepCard.tsx:53-63` `moveChainOp` buttons).
- **Apply/Cancel**: `⌘↩` Apply and `Esc` Cancel become **`surface:chain` registry bindings** (foundation §11.2) with the exact v1 options — `enableOnFormTags` for ⌘↩; Esc **without preventDefault** so `useNumberDraft` dirty-revert wins first (code: `src/ui/chain/ChainPalette.tsx:68-75` current `useHotkeys` — port options verbatim, register through the registry). Apply = `applyActionChain` (code: `src/state/editorStore.ts:1814` — ONE undo step `'action chain'`, seeds resolved first, collision-skipping ids, seeds+clones selected); success flash `Applied chain · +N SubParts`. Cancel with ≥1 step ⇒ discard-confirm (LOCKED); empty ⇒ silent. Session never touches `$part`, never in undo.
- **Status mirror**: tool segment shows `Chain · 12 instances · +10 new` while a session is open (click focuses the window). Mode switch with ≥1 step ⇒ discard-confirm (modeStore hook); project load closes the session (existing `projectStore` → `closeChain()` wiring, keep).
- **Non-modality check**: orbit, gizmo drags, W/S rotate, arrow nudge, undo, and the measure tool all stay live while the window is open — do not add any focus trap or overlay.
**Verify**: `pnpm typecheck`; `pnpm test` (`chainStore.test.ts`, `editorStore.test.ts` applyActionChain suites green); manual: ⇧⌘K over 2 SubParts → build Radial(6)+Translate → nudge a seed with arrows → ghosts re-flow live → drag-reorder steps → ⌘↩ applies as ONE undo step; Esc with steps confirms; ⇧⌘K from Data mode switches to Build first; `grep -rn "ChainPalette" src/` → only historical references removed.

---

## H. Phone variants

#### P5B.29 — Build phone variants: Inspector sheet + touch nudge cluster, Outliner sheet, Tool bar strip, chain sheet, browser gestures, tool-chip cancel
**Goal**: Full phone parity (LOCKED #6) for everything this phase built, strictly from the foundation §12 primitives.
**Files**:
- modify the phone Inspector sheet host (`src/ui/MobileInspector.tsx` or its shell-phase successor) to render `BuildFocusEditor` content at `sm` density
- create `src/ui/build/TouchNudgeCluster.tsx`
- modify the Panel-sheet host (Outliner at `sm` density — verify 5A landed it; wire if not)
- modify `src/ui/build/ToolBarWindow.tsx` (phone rendering: pinned strip above the CondensedStatusBar)
- modify `src/ui/chain/ChainWindow.tsx` (phone rendering: 50% NON-blocking sheet)
- modify `src/ui/build/SubPartBrowserDialog.tsx` / `PartBrowserDialog.tsx` (phone commit rules)
- modify the CondensedStatusBar tool chip (cancel-tap wiring for measure/marquee)
**Depends on**: P5B.08–P5B.28.
**Spec** (design: design-build-mode.md §11 items 1–10; foundation §12 primitives — no bespoke phone forks):
1. **Inspector sheet**: identical per-kind cards; the transform card appends the **touch nudge/rotate cluster** (closes the census touch gap — selection-transform.md pain 15): `Nudge [X|Y|Z] [−] [+] · step [−][+]` and `Rotate [X|Y|Z] [↺] [↻] · step [−][+]` calling the SAME store actions as the keyboard (`nudgeSelectionBy` code: `src/three/nudgeSelection.ts:26`; `rotateSelectionBy`/`rotateSelectionAroundPair` code: `src/three/rotateSelection.ts:13/26`; axis/step setters from nudge/rotateControls) — same undo semantics: one step per tap (via `applySelectionTransform`).
2. **Outliner** → Panel sheet on re-tap of the Build tab; entity-drag-to-layer replaced by the row ⋮ Change Layer menu (touch drag unreliable — design §11.1).
3. **Tool bar** → pinned strip above the CondensedStatusBar: Move/Rotate/Scale + W/L + snap toggle (steps via the ▾ popover-as-sheet).
4. **Chain** → 50% **non-blocking** sheet: viewport + gizmo stay live above it; session intact across dismiss/reopen; reorder via chevrons only; Apply/Cancel buttons (no ⌘↩).
5. **Browsers** → cover dialogs, list stacked over preview 45/55 (BrowserShell already does this); tap = preview only, **[Add]** sole commit (+[Add & Close]); search not autofocused (existing `isPhone` gate, code: `src/ui/SubPartBrowser.tsx:95-98` — the phone path was already preview-first; keep it).
6. **Tool cancel** (phones have no Esc): tapping the CondensedStatusBar tool chip cancels the armed tool (measure discards pending point; marquee disarms) and restores orbit — wire the tap to the same disarm commands (system-services §8.1 contract).
7. Modifier-hint + rotate/nudge chips stay desktop-only; seat view shows `Seat 2/4 ◀ ▶ ✕` in the condensed strip; aid editors + multi panel render inside the Inspector sheet (focus-slot rules identical).
**Verify**: `pnpm typecheck`; manual at <640px (per memory: verify with project-local Playwright if scripted, dev base path `/flexo/`): every numbered behavior above; a chain sheet open + gizmo drag above it re-flows ghosts.

---

## I. Docs & closeout

#### P5B.30 — Documentation sync + scope assertion
**Goal**: Every `docs/*.md` describing behavior this phase changed is updated (AGENTS.md doc-sync mandate); scope/ untouched and asserted.
**Files**:
- modify `docs/editor-state.md` (— `$snap` is now UI-driven via snapStore (was "documented as if it worked", census selection-transform.md pain 13); `$gizmoSpace`; clipboard `lights` field + `cutSelected`; duplicate-with-offset; the stale singular `$selectedConnectorIndex` prose if 5A didn't already fix it)
- modify `docs/action-chains.md` (⇧⌘K rebind, FloatingWindow host, drag-reorder, discard-confirm — the "deliberate v1 exclusions" list at its end shrinks: draggable palette + drag-reorder are now shipped)
- modify `docs/3d-workspace.md` (Tool bar window, W/L gizmo space, snap + ⌃ invert, ⌥-drag duplicate, F/Reset Camera/selection-centroid snaps, Display Filters, measure `M` + Esc, seat-view status segment)
- modify `docs/layers.md` (Display Filters composition in `applyLayerView`; only if its visibility-writer section needs the note)
- modify `plans/FEATURE_TODOS.md` (check off: move/rotate/scale tool-switch hotkeys; movement snaps — both shipped this phase)
**Depends on**: all previous tasks.
**Spec**: Keep each doc's existing structure; update the specific sections named above; do not rewrite whole docs. **Scope note**: this phase changes NO game contract — no serializer/parser/export changes, layers/aids/chains/clipboard remain editor-only, export output byte-identical (design-build-mode.md §15 constitution checks). Therefore `scope/*.md` requires NO update — state this explicitly in the PR description rather than silently skipping (AGENTS.md requires the scope check, not necessarily a diff).
**Verify**: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` (full phase gate); read each modified doc section against the running app; confirm `git diff --stat scope/` is empty.


---

## Phase 6 — Data mode & Phase 7 — Engine mode

> Both phases implement `plans/flexo_v2/design/design-data-engine-modes.md` in full
> (decisions D1–D17, Parts A/B/C, §6 parity tables). Read that document before starting
> either phase — tasks cite it as (design: §X) without repeating the file name. Foundation
> citations are (foundation: §X). Census citations name the file. Code citations were
> verified against the working tree at plan-writing time; if a cited line drifted, anchor
> on the named symbol.

---

## Phase 6 — Data mode

**Design sources**: design-data-engine-modes.md Part A (§A1–A10), §0 decisions D1–D4, D10–D11, D14, D17, Part C (§C1 ledger rows 1–4, §C3 invariants), §6.1/§6.3 parity tables; foundation.md §2.1–§2.5 (mode machine, Data scope ladder), §7.3, §8.3, §11.1–§11.2 (list-surface mirrors), §12 (phone), §13 (store rules), §15.3 (wireframe); FINAL_DESIGN_INDEX.md (hotkey rows for `surface:data-navigator`, mode digit `3`); DECISIONS.md #1, #6.
**Census sources**: `analysis/flexo-v2-feature-census/part-data-gamedata.md` (primary — every GameData section/field + §5 invariants), `viewport-scene-view.md` §1.8 (lights-data slice), `engines.md` §1.9/§1.12 (wiring + modal-hosted engine editors), `shell-layout.md`.

**Entry state** (P0–P5B landed):
- The docked shell is complete: `modeStore` (`$mode` incl. `'data'`, `setMode(mode, payload?)` choreography point + enter/exit hook registry, single `$activeTool` slot), `commandStore`/MenuSpec menubar, `dialogStore`, `statusStore` (`$statusMessage`, `$toolStatus`, mode/status segments), `notificationStore`, scoped hotkey registry (`global`/`viewport`/`mode:*`/`tool:*`/`surface:*`), kit primitives from P0 (`xs` tier, `zIndex.ts`, `panelChrome`, `DialogViewStack`, `InlineConfirmStrip`, `CopyDownloadBar`, `ColorField`), the fuzzy-subsequence matcher from P5A, `GridList`/`GridListItem` (code: `src/ui/kit/ListBox.tsx:50` `GridList`).
- Build mode is feature-complete: Outliner right sidebar, left focus editors (`SubPartInspector` carries the `[SubPart Data →]` jump emitting `setMode('data', {scope:{kind:'template', templateId}})` — P5B.13), connector inspector owns Capabilities editing (D10 home).
- Mode digit `3` switches to Data (P4 global binding). Data mode's sidebars are still **interim hosts**: whatever P4 mounted (likely an empty-state placeholder, with the v1 Part Data modal (`PartDataDialog.tsx`, the P2.07 extraction) + `ManageTanksModal` still reachable through interim commands/row menus so RULE ZERO held between phases).
- Still alive from v1 (this phase's demolition targets): `src/ui/PartDataDialog.tsx` (P2.07 extracted the Part Data modal guts there; the `PartDataButton.tsx` trigger died in P2.11), `src/ui/ManageTanksModal.tsx`, `src/ui/GameDataSections.tsx` (monolith). `src/ui/EngineSections.tsx`, `src/ui/EnginePanel.tsx`, `src/ui/EngineToolbar.tsx` survive until Phase 7 — Data mode temporarily hosts their section components (deliberate; see P6.14/P6.15).
- If any single assumption does not hold (a component already deleted, a jump already wired), do the minimal equivalent — never re-create a v1 surface.

**Exit state**: App fully runnable. Data mode is the canonical GameData surface: right sidebar = `DataNavigator` (Part root, template rows with content badges, capable-empty "＋ add data", non-capable disabled-style group, fuzzy search, validation strip), left sidebar = `DataScopeForm` hosting EVERY census section/field for both scopes (incl. D3 hidden-field exposure and the D2 passthrough viewer), structural scope chips replace prose banners, status bar shows the Data issue chip, "Select in 3D" works with the viewport co-visible. `PartDataDialog`, `ManageTanksModal`, and `GameDataSections.tsx` are DELETED (`Field`/`ItemCard` live in kit). Engine hardware sections inside Data mode still render the v1 `EngineSections` components (swapped for the new shared editors in P7.19). Phone parity per §A8. D17 (EVA Door SeatId) shipped with its scope/docs sync.

**Undo / persistence contract for the whole phase** (design: §A10 — every task below states its row):

| Interaction | Undo | Persistence |
|---|---|---|
| Any field edit (text/number/color) | streaming: ONE push at interaction start (`onInteractionStart`/`onFocus`) | `$part` → autosave |
| Add/remove tank/light/solar/power item, coupling toggle, wiring entry, gimbal, "＋ add data" | discrete: one labeled push inside the action | autosave |
| Auto-wire unwired consumers | one push (`'auto-wire consumers'`) | autosave |
| Scope/section selection, search, section collapse | none (ephemeral) | not persisted (resets on reload — deliberate) |
| "Delete all data…" (template) | confirm (whole-container, foundation §14.3) + ONE push | autosave |
| Passthrough viewer | n/a (read-only) | — |

**Phase verification** (end of phase):
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` (run each script BARE, no pipes — AGENTS.md).
2. `grep -rn "PartDataDialog\|PartDataButton\|ManageTanksModal\|GameDataSections" src/` → 0 hits (files deleted, imports repointed, stale comments fixed).
3. Manual smoke (desktop): `3` enters Data restoring the last scope; select a SubPart then enter Data → its template scoped; navigator Part root expands to 8 section rows that jump-scroll the left form; a template row's "＋ add data → Add light" creates the light in one undo step and scopes to it; "Select in 3D" on a light selects+reveals it while the form stays open; non-capable connector row tooltip offers "[Select in Build →]"; blank the Part Id → validation strip shows a blocker, clicking it scopes+jumps+flashes; Passthrough shows an imported Core part's preserved XML and "Copy XML" works; ⌘C/⌘V still work while the navigator has focus.
4. Manual smoke (phone <640px): re-tap Data tab → Panel sheet (navigator); tap a scope row → Inspector sheet with `‹ Scopes` back; section chip strip jumps; "Select in 3D" closes the sheet with a status flash; CondensedStatusBar issue chip opens the findings sheet.
5. Game contract: ONLY the D17 task touches `src/ksa/` serialize/parse paths; its scope/docs sync landed in the same task. Assert every other task left export output byte-identical (re-run `src/ksa/partXmlSerializer.test.ts` etc. untouched and green).

---

### A. State layer (`src/state/` — no react imports)

#### P6.01 — Create `dataModeStore` (scope, section jumps, search)
**Goal**: The Data mode sub-state store: clamped scope, section-jump nonce, navigator search.
**Files**:
- create `src/state/dataModeStore.ts`
- create `src/state/dataModeStore.test.ts`
**Depends on**: none.
**Spec** (design: §B9 `dataModeStore` sketch, §A2 entry ladder):
```ts
// src/state/dataModeStore.ts — zero react/three imports (layering constitution)
import { atom, computed } from 'nanostores';
import { $part } from './editorStore';

export type DataScope = { kind: 'part' } | { kind: 'template'; templateId: string };
export type DataSectionId =
  | 'identity' | 'mass' | 'tanks' | 'power' | 'coupling' | 'wiring' | 'advanced' | 'passthrough'  // part scope ('tanks' + 'passthrough' render at BOTH scopes)
  | 'lights' | 'solar' | 'engine';                                                                 // template-scope extras (template layout: tanks · lights · solar · engine · passthrough)
export const $dataScopeRaw = atom<DataScope>({ kind: 'part' });
/** Clamped view: a scope naming a template with zero placements falls back to Part. */
export const $dataScope = computed([$dataScopeRaw, $part], (scope, part) =>
  scope.kind === 'template' &&
  !part.placements.some((p) => p.subPartTemplateId === scope.templateId)
    ? ({ kind: 'part' } as DataScope)
    : scope,
);
export const $dataSectionJump = atom<{ sectionId: DataSectionId; cardKey?: string; nonce: number } | null>(null);
export const $dataSearch = atom<string>('');

export function setDataScope(scope: DataScope): void { $dataScopeRaw.set(scope); }
export function jumpToSection(sectionId: DataSectionId, cardKey?: string): void {
  $dataSectionJump.set({ sectionId, cardKey, nonce: ($dataSectionJump.get()?.nonce ?? 0) + 1 });
}
```
- All three atoms are **ephemeral designer state**: never persisted, never undoable (design §A10; foundation §13 rules). `$dataScope` survives mode switches for the return path (foundation §2.4) — do NOT reset it on exit.
- `addTemplateData(templateId, kind: 'tank'|'light'|'solar')` is NOT a store function here — the "＋ add data" menu calls the existing editorStore actions directly (`addTank({subPartTemplateId})` lazily creates the `SubPartGameData` via `getOrCreateSubPartData` and pushes ONE `'add tank'` undo step — code: `src/state/editorStore.ts:2589` `addTank`, `:2535` `getOrCreateSubPartData`; `addLight(templateId)` code: `:2712`; `addSubPartSolarPanel` code: `:2624`), then `setDataScope` + `jumpToSection`. The `'engine'` menu item is a mode jump (P6.07). Confirm each action creates the spd lazily; if one doesn't, extend it in editorStore (discrete, one push) — do not add a second undo push in the UI.
**Verify**: `pnpm typecheck`; `pnpm test` — `dataModeStore.test.ts` cases: default scope is part; template scope with a matching placement passes through; deleting the last placement of the scoped template (simulate via `$part` update) clamps the computed to part while `$dataScopeRaw` is untouched; `jumpToSection` bumps the nonce monotonically and carries `cardKey`.

#### P6.02 — Findings pipeline: issue source metadata + `$gameDataFindings`
**Goal**: One findings store powering the validation strip, status chip, and click-through (D4), with per-issue targets.
**Files**:
- modify `src/ksa/engineValidation.ts` (add optional `source` metadata to `EngineIssue`)
- modify `src/ksa/engineValidation.test.ts`
- create `src/state/gameDataFindings.ts`
- create `src/state/gameDataFindings.test.ts`
- modify `src/state/dataModeStore.ts` (re-export the computed)
**Depends on**: P6.01.
**Spec** (design: §A7, D4):
1. Extend `EngineIssue` (code: `src/ksa/engineValidation.ts:39` `EngineIssue` — currently `{severity, code, message}`) with an OPTIONAL editor-targeting field: `source?: { templateId: string | null; module?: 'combustor'|'nozzle'|'solidMotor'|'solidNozzle'|'grain'|'rocket'|'controller'|'wiring'|'gimbal'|'propellant'; index?: number }`. Populate it at each emission site inside `validateEngines` (code: `:193` `validateEngines`) — `templateId: null` = part-level. **Codes and message strings are UNCHANGED** (census: engines.md §5 — the block/warn wording and KSA log fidelity are invariants; tests match on `code`). This is editor metadata, not a game-contract change.
2. `src/state/gameDataFindings.ts` — pure function + computed:
```ts
export interface GameDataFinding {
  severity: 'block' | 'warn';
  code: string;
  message: string;
  target: { scope: DataScope; sectionId: DataSectionId; cardKey?: string };
}
export function computeGameDataFindings(part: EditingPart, reactions: Map<string, ReactionData>): GameDataFinding[]
export const $gameDataFindings = computed([$part, $allReactionIndex], computeGameDataFindings);
```
   Contents = `validateEngines(part, reactions)` mapped through `source` → target (`templateId === null` → part scope; wiring/controller/gimbal codes → `sectionId:'wiring'`; part-level solid/gas-gen modules → `'advanced'`; template modules → template scope `'engine'`), PLUS two basic checks of this store's own (design §A7): blank Part Id (`block`, code `part-id-blank`, target Identity) and duplicate tank feed ids within one scope (`warn`, code `tank-feed-id-duplicate`, target Tanks, `cardKey` = the tank index). `$allReactionIndex` code: `src/state/reactionStore.ts:38`.
3. No react imports; `dataModeStore` re-exports `$gameDataFindings` for the UI.
**Verify**: `pnpm test` — `engineValidation.test.ts` still green with codes/messages unchanged, plus new asserts that a template-combustor issue carries `source.templateId`; `gameDataFindings.test.ts` cases: blank part id → block targeting `{part, identity}`; duplicate feed id on a template's tanks → warn targeting that template's tanks with cardKey; a `consumer-not-wired` issue targets `{part, wiring}`.

#### P6.03 — editorStore: `setExtraDiameters` (D3) + delete-all-template-data composite
**Goal**: The two genuinely new document mutations Data mode needs.
**Files**:
- modify `src/state/editorStore.ts`
- modify `src/state/editorStore.test.ts`
**Depends on**: none.
**Spec**:
1. `export function setExtraDiameters(diametersM: readonly number[]): void` — **streaming** setter over `gameData.extraDiametersM` (field verified: `src/ksa/types.ts:1161` `extraDiametersM`; previously round-trip-only, census: part-data-gamedata.md §1.1 Identity row). No internal `pushUndo` — the list editor pushes once on interaction start, and its add/remove buttons push their own discrete step (`'add size class'` / `'remove size class'`) before calling it (follow the `PowerList` add/remove convention, code: `src/ui/GameDataSections.tsx:427` `PowerList`). Serializer already emits repeated `<Diameter>` — NO `src/ksa/` change (design D3: "plain modeled scalars already round-tripped").
2. `export function removeAllTemplateData(subPartTemplateId: string): void` — ONE discrete push `'delete SubPart data'`: removes the template's `SubPartGameData` entry, its template-owned lights (`light.ownerTemplateId === subPartTemplateId`), and its solar panels. Backs the scope-header ⋮ "Delete all data…" (design §A4 header; confirm per foundation §14.3 whole-container rule — the CONFIRM lives in the UI, the ACTION is one push).
3. D3's per-tank Advanced fields need NO new action — `updateTank(owner, index, patch)` already accepts `roleAffinity`/`locationAsmb` (code: `src/state/editorStore.ts:2613` `updateTank`; `src/ksa/types.ts:475/480` `Tank.roleAffinity`/`locationAsmb`). Note this in the task commit message so nobody adds a redundant `updateTankAdvanced` (the design's store sketch names one; it is subsumed — NOT a deviation, the sketch is non-normative on action names).
**Verify**: `pnpm test` — `editorStore.test.ts` new cases: `setExtraDiameters` round-trips and does not push undo itself; `removeAllTemplateData` is ONE undo step and undo restores spd+lights+solar; `updateTank` patch of `roleAffinity` and `locationAsmb` round-trips.

#### P6.04 — D17: model `<EVADoor SeatId>` + `<IVASeat Id>` (game contract; severable)
**Goal**: Close scope gaps Q1/Q2 — the EVA-door↔seat link survives import/export and becomes authorable.
**Files**:
- modify `src/ksa/types.ts` (`EvaDoor.seatId`, `IvaSeat.ksaId`)
- modify `src/ksa/partXmlParser.ts`, `src/ksa/partXmlSerializer.ts`
- modify `src/ksa/partXmlParser.test.ts`, `src/ksa/partXmlSerializer.test.ts` (or the co-located round-trip suites)
- modify `src/state/projectCodec.ts`
- modify `scope/connectors-coordinates-iva.md`, `plans/FIX_CURRENT_GAPS_PLAN.md`, `docs/iva-seats.md`
**Depends on**: none (severable — if deferred, ALSO skip the Seat select in P6.13 and leave the scope docs stating the gap; flag the deferral in the phase PR).
**Spec** (design: D17; the authoritative fix shape is written in scope: `scope/connectors-coordinates-iva.md:328-336` — "model both: add `seatId` to `EvaDoor` and a user-authored `ksaId` to `IvaSeat`, emitting the latter only when set"):
1. `EvaDoor` (code: `src/ksa/types.ts:574` `EvaDoor`) gains `seatId: string | null` (null = omit attribute — KSA default `""`). `IvaSeat` gains `ksaId: string | null` (null = omit `Id`). Update the factory defaults (`createDefault*` sites near `types.ts:1322`).
2. Parser: `evaDoorFromGameData` reads `SeatId` (code: `src/ksa/partXmlParser.ts:674-675`); the IVA-seat reader keeps its regenerated internal `_seatN` ids but ALSO captures the authored `Id` attr into `ksaId`. **No allow-list change** — `EVADoor` is already modeled (code: `partXmlParser.ts:918`), and `IVASeat`'s deliberate absence from `KNOWN_SUBPART_GAMEDATA_CHILDREN` stays untouched (do-not-fix comment; census invariant 1).
3. Serializer: emit `SeatId` only when non-null/non-empty (code: `src/ksa/partXmlSerializer.ts:257-259` EVADoor emit); emit `<IVASeat Id>` only when `ksaId` set. Remember `<IVASeat Id>` shares the feed-container id namespace (scope: `connectors-coordinates-iva.md:292`) — no validation change required here, but note it in the docs.
4. Codec: extend the `ed` field (code: `src/state/projectCodec.ts:372` `ed?: { c: string }`) to `{ c: string; s?: string }` and add the seat `ksaId` to the seat encoding. **No migration**: old persisted projects simply lack the field (defaults fill); the schema-version bump policy applies only if the codec version gate requires it — follow `projectCodec`'s existing versioning convention (AGENTS.md: version + default-fill or purge, never convert).
5. Scope/docs sync (AGENTS mandate, same task): rewrite the Q1/Q2 gap paragraphs as CLOSED with the new field names; check the FIX_CURRENT_GAPS_PLAN entry off; document the seat-select UI in `docs/iva-seats.md`.
**Verify**: `pnpm test` — round-trip tests: import a GameData doc with `<EVADoor ConnectorId="c1" SeatId="pilot"/>` and `<IVASeat Id="pilot">` → export reproduces both verbatim; absent attrs stay absent (no `SeatId=""`, no `Id=""`). `pnpm typecheck`. Grep scope file for "Q2" → gap marked closed.

---

### B. Mode wiring & viewport affordances

#### P6.05 — Data-mode enter choreography + viewport affordances
**Goal**: The §A2 entry ladder, jump-payload consumption, reactions preload, and the Data-mode viewport behaviors.
**Files**:
- modify `src/state/modeStore.ts` (data-mode enter hook)
- modify `src/state/dataModeStore.ts` (`$dataHighlight` intent atom)
- modify `src/three/EditorScene.ts`
**Depends on**: P6.01.
**Spec** (design: §A2; foundation §2.4 Data entry ladder — follow it verbatim):
1. Register the Data enter hook at the `setMode` choreography point: (1) a jump payload `{scope}` always wins → `setDataScope(payload.scope)` (+ optional `jumpToSection` payload); (2) else keep the surviving `$dataScope` (the computed already clamps); (3) else if the selection contains a SubPart → that template's scope; (4) else Part scope. Then fire `void ensureReactionsLoaded()` (code: `src/state/reactionStore.ts:48` — the SANCTIONED entry effect; this begins retiring the per-component `useEffect` loads, finished in P7). Exit: no effects (design §A2 exit row).
2. **Scope highlight tint**: add `export const $dataHighlight = computed([$mode, $dataScope, $part], …)` yielding the instanceIds of the scoped template's placements while `$mode==='data'`, plus a nonce'd one-shot `$dataFlash = atom<{instanceIds: string[]; nonce: number} | null>` for hover/eye-button flashes (~600 ms; §A5 touch rule). `EditorScene` subscribes through its `sub()` helper (on-demand loop invalidation — census: viewport-scene-view.md §0) and tints/flashes using the existing selection-highlight material path — a tint, not a selection.
3. **Select-in-3D both directions** (design §A2): while in Data mode, clicking a SubPart placement in the viewport ALSO calls `setDataScope({kind:'template', templateId})` (selection behavior itself unchanged); clicking a non-capable entity selects it normally and posts the status message `"Connectors have no SubPart data — edited in Build mode"` (adjust the noun per kind) through the message channel.
4. Undo: none of this touches `$part`; nothing here is undoable. Mode switches are never undo steps (foundation §2.3).
**Verify**: `pnpm typecheck`; manual: enter Data with a SubPart selected → its template scoped + placements tinted; click another placement in 3D → scope retargets; click a connector → status message; leave and re-enter Data → same scope restored; `pnpm test` (`dataModeStore.test.ts` extended: highlight computed empty outside data mode).

---

### C. Kit prep

#### P6.06 — Move `Field`/`ItemCard` into kit
**Goal**: Kill the utility-in-feature-file debt (design §C1) before the monolith dissolves.
**Files**:
- modify `src/ui/kit/Field.tsx` (add the two components) + `src/ui/kit/index.ts`
- modify `src/ui/GameDataSections.tsx` (re-export from kit, delete local defs)
- modify `src/ui/EngineSections.tsx`, `src/ui/TransformInspector.tsx` if still present (import from kit)
**Depends on**: none.
**Spec**: Move `Field` (label+children column, code: `src/ui/GameDataSections.tsx:78` `Field`) and `ItemCard` (removable card, code: `:88` `ItemCard`) VERBATIM into `src/ui/kit/Field.tsx` (no name collision — kit currently exports `Label/Description/FieldGroup/SectionTitle`, code: `src/ui/kit/Field.tsx:33-62`). Bring the small label-style constant they use. Repoint every importer (`EngineSections.tsx` imports `{ Field, ItemCard } from './GameDataSections'` — its line 6). Leave temporary `export { Field, ItemCard } from './kit'` shims in `GameDataSections.tsx` only if a same-task compile requires it; remove them in P6.18. No behavior change.
**Verify**: `pnpm typecheck`; `pnpm lint`; app renders Part Data modal unchanged (still alive at this point).

---

### D. Right sidebar — the Data Navigator

#### P6.07 — `DataNavigator` component
**Goal**: The §A3 navigator: pinned Part root with section child rows, template rows with badges, "＋ add data", non-capable disabled-style group, fuzzy search, empty state.
**Files**:
- create `src/ui/data/DataNavigator.tsx`
- create `src/ui/data/dataNavigatorModel.ts` (pure row-model builder) + `src/ui/data/dataNavigatorModel.test.ts`
**Depends on**: P6.01, P6.02.
**Spec** (design: §A3 — follow the wireframe and row spec exactly):
- **Row model** (pure, testable): build from `$part` — Part root (badges per section: tanks / power = batteries+generators+solar+consumer / coupling = modules present / wiring = controllers+wiring entries+gimbals / advanced = part-level solid+gas-gen module count / passthrough = `unknownChildren.length + (unknownAttrs?1:0) + customMassExtras.length`; count recipes as in the v1 Part Data modal (v1 code: `src/ui/PartDataButton.tsx:49-65` — the guts now live in `src/ui/PartDataDialog.tsx` per P2.07; anchor on the symbol)); one row per SubPart **template** with ≥1 placement (glass templates INCLUDED — census: part-data-gamedata.md §1.2 "every SubPart template qualifies"); content badges ⛁ tanks / 💡 lights (template-owned) / ☀ solar / 🚀 engine-module count; capable-but-empty rows flagged; non-capable group = one row per connector, collider, IVA seat, part-level light (`ownerTemplateId === null`), kitten instance.
- **GridList** single-selection = the scope, `xs` density. Part root pinned first, never filtered. Chevron expands **section child rows** (part: the 8 sections; template: Tanks/Lights/Solar/Engine/Passthrough); clicking a child row = `setDataScope` + `jumpToSection(sectionId)`. Issue dots ⚠ from `$gameDataFindings` (row-level when any finding targets the scope; section-level on child rows).
- **Capable-empty**: trailing "＋ add data" button → kit Menu: `Add tank · Add light · Add solar panel · Add engine (thrust chamber) →`. First three: existing editorStore action (ONE undo step, P6.01 note) then scope+jump with the section expanded. The engine item: `setMode('engine', {defineNew: true, templateId})` (design §A3/D12 — consumed by P7.05; until P7 lands it may no-op into engine mode's interim host; acceptable mid-flight).
- **Non-capable rows**: `◌` prefix, reduced opacity but NOT focus-skipped (tooltips must be reachable); kit Tooltip with the explainer + a `[Select in Build →]` button → `setMode('build')` + select+reveal that entity (use the 5A id-based selection + `revealEntity`). Group collapsible: header "not data-capable (N)".
- **Search**: fuzzy subsequence (5A matcher) over template ids + section names; Part root + validation strip exempt; non-capable rows filter like the rest. Hovering a template row highlights its placements via `$dataFlash` (P6.05).
- **Empty state** (zero placements): Part root + "Place SubParts in Build mode to give them tanks, lights, solar panels or engines. [Go to Build]".
- Undo: navigator interactions are ephemeral except "＋ add data" (discrete, inside the store action).
**Verify**: `pnpm test` — `dataNavigatorModel.test.ts` cases: badge counts for a part with 2 tanks/3 power items/1 decoupler; glass template listed as capable; template with data vs empty flagged correctly; non-capable inventory lists every entity kind; passthrough count includes `customMassExtras`. Manual: all §A3 wireframe behaviors.

#### P6.08 — Validation strip + status-bar Data segment + shared `FindingsList`
**Goal**: D4's three surfaces wired to `$gameDataFindings` with click-through.
**Files**:
- create `src/ui/data/FindingsList.tsx` (shared with Engine mode in P7)
- modify `src/ui/data/DataNavigator.tsx` (pinned strip)
- modify the StatusBar mode-segment renderer (wherever P3/P4 put per-mode segments)
- modify `src/ui/EngineIssuesPanel.tsx` → its guts become `FindingsList` (keep the file exporting a thin wrapper until P7 deletes the last v1 consumer)
**Depends on**: P6.02, P6.07.
**Spec** (design: §A7, D4):
- `FindingsList`: renders the grouped list with the EXACT v1 wording — danger group "KSA would refuse to load (N)", warning group "Loads, but misbehaves (N)" (code: `src/ui/EngineIssuesPanel.tsx:15-49` — port the markup, parameterize `onSelect(finding)`). Renders nothing when clean (strip host adds its own chrome).
- **Strip**: pinned at the navigator's bottom, `⚠ 1 block · 2 warnings ▾` (hidden when clean); expands to `FindingsList`; clicking a finding: `setDataScope(target.scope)` + `jumpToSection(target.sectionId, target.cardKey)` (the form flashes the card — P6.09).
- **Status bar** (Data segment): `scope: Part · ⚠ 1 block →` — chip clicks through to the FIRST blocker (same select handler). Absent when clean. Segment mounts only while `$mode==='data'` (mode-specific segment rule, foundation §5).
- Inline per-field warnings throughout the forms are PRESERVED in place (the strip aggregates, never replaces — design §A7 last bullet).
**Verify**: `pnpm typecheck`; manual: blank Part Id → strip + status chip appear; click chip → Identity section expanded, Part Id field flashed; fix it → both disappear.

---

### E. Left sidebar — scope forms

#### P6.09 — `DataScopeForm` shell: header, scope chips, section chip strip, jump/flash plumbing
**Goal**: The §A4 form host with the §A5 structural scope-chip system.
**Files**:
- create `src/ui/data/DataScopeForm.tsx`
- create `src/ui/data/ScopeChip.tsx`
- create `src/ui/data/useSectionJump.ts`
**Depends on**: P6.01, P6.05.
**Spec** (design: §A4 header block, §A5):
- **Header** (sticky): scope title (`Part — <displayName || partId>` / `Template — <id>`), scope chip, overflow ⋮ (Part: Copy Part Id (via `CopyDownloadBar`'s copy affordance or a plain command), "Open in Engine mode →"; Template: "Select placements in 3D" (select all placements + reveal), "Delete all data…" → `InlineConfirmStrip`/ConfirmDialog per foundation §14.3 then `removeAllTemplateData` (P6.03)).
- **Section chip strip** (sticky, horizontally scrollable): one chip per section mirroring the navigator child rows; click = same `jumpToSection` intent.
- **`useSectionJump(sectionId)`**: subscribes `$dataSectionJump`; on a matching nonce → expand the section, `scrollIntoView`, and flash (a ~1s CSS class; also flash the `cardKey` card when present). Section expand/collapse state is component-local (ephemeral; resets on reload — design §A10).
- **`ScopeChip`** (§A5, one system): variants `[Part]` · `[Template ×N]` (hover → `$dataFlash` all placements; click → select them) · `[Instance: <id> ▾]` (the chip IS an instance Select; hover/focus flashes that placement; distinct card border tint). Phone: hover-flash becomes on-selection flash + a "Show →" eye button (design §A5 touch equivalent) — the eye button renders on phone only (`useIsPhone`).
- Body layout: collapsible sections (reuse the dense `SidebarSection`/restyled `DisclosureSection` the shell phases established — code today: `src/ui/kit/Disclosure.tsx:19` `DisclosureSection`), sticky headers, `xs` density. Default-expanded = sections with content + Identity; empty sections collapsed with a "＋" affordance in the header.
- All numerics in every section task below: `PreciseNumberInput`/`Vec3Field` (`useNumberDraft` + `inputMode="url"` — code: `src/ui/PreciseNumberInput.tsx`, constitution). Streaming undo via `onInteractionStart`; TextFields push on focus (v1 pattern: code `src/ui/PartDataButton.tsx:87` — now in `PartDataDialog.tsx`; `onFocus={() => pushUndo('edit part ID', …)}`).
**Verify**: `pnpm typecheck`; manual: chips scroll+expand+flash; template chip hover flashes placements; instance chip picker (exercised in P6.14 gimbals) selects and flashes.

#### P6.10 — Part scope: Identity + Mass sections
**Goal**: Every Identity/Mass field incl. the D3 "Additional size classes" list and the D2 preserved-inertia chip.
**Files**:
- create `src/ui/data/sections/IdentitySection.tsx`
- create `src/ui/data/sections/MassSection.tsx`
**Depends on**: P6.03, P6.06, P6.09.
**Spec** (design: §A4.1; census: part-data-gamedata.md §1.1 Identity/Mass tables — port guts from `GameDataSections.tsx`, do not redesign fields):
- **Identity** (defaultExpanded): Part Id mono TextField → `setPartId` (streaming, push on focus); Display Name → `setDisplayName` + helper "blank ⇒ Part Id used in-game" (port `IdentityFields`, code: `src/ui/GameDataSections.tsx:112`); Editor Tags → `EditorTagsField` UNCHANGED (chips + "Add tag…" popover, free-form entry, Categories/Functional grouping, popover stays open across adds — code: `src/ui/EditorTagsField.tsx:28`; census §1.3 invariant 9); Size class Switch + PreciseNumberInput (m) → `setDiameterEnabled`/`setDiameter` + helper "VAB filter only, no physics" (port `SizeControlFields`, code: `:135`); **Additional size classes** (D3, NEW): editable number list over `gameData.extraDiametersM` — per row a PreciseNumberInput (m) + remove button, "+ Size class" append; edits stream through `setExtraDiameters` (P6.03), add/remove push discrete steps; helper "extra `<Diameter>` entries — adapters match several racks"; Command capable Switch → `setControllable`.
- **Mass** (defaultExpanded): Custom mass Switch + Mass (kg) → `setCustomMassEnabled`/`setCustomMass` (port `MassSection`, code: `:162`); **preserved-inertia chip** (D2): when `gameData.customMassExtras.length > 0`, a read-only chip "carries N preserved elements (`<MassSpecificInertia>`…) → view in Passthrough" that fires `jumpToSection('passthrough')` (field: `src/ksa/types.ts:1146` `customMassExtras`).
**Verify**: `pnpm typecheck`; manual: type a partial number (".06") in a size-class row — no stomp; a full typing session = one undo step; chip appears on an imported Core part with custom mass extras and jumps to Passthrough.

#### P6.11 — Tanks section — "Tanks (feed containers)" (both scopes)
**Goal**: The shared tanks card set with the binding vocabulary fix and the D3 Advanced disclosure.
**Files**:
- create `src/ui/data/sections/TanksSection.tsx`
**Depends on**: P6.03, P6.06, P6.09.
**Spec** (design: §A4.1 Tanks, §A4.2, §A1 vocabulary; census §1.1 Tanks — port guts from `GameDataSections.tsx:186` `TanksSection`):
- Section title is **exactly** "Tanks (feed containers)" (foundation §0.1 — kills the reference-container naming trap; reference containers live ONLY under Build's Aids, other phase).
- Props `{ owner: TankOwner }` (part = `{subPartTemplateId: null}`-style owner per the existing `TankOwner` union — match `addTank`'s signature). Per-tank `ItemCard`: Feed id (mono TextField; streaming), Shape Select (Cylindrical/Spherical) → `setTankShape` (discrete), Wall material id TextField, Length m (cylindrical only), Outer radius m, Wall thickness mm — all `PreciseNumberInput` → `updateTank` patches (streaming). "+ Tank" → `addTank(owner)`; card Remove → `removeTank` (discrete). Part-scope helper: "Part-level tanks are the only feed targets addressable without a `SubPart=` scope." Template-scope helper: "Feeds address these per placement — `TankB #1 · fuel_main` and `TankB #2 · fuel_main` are two different feed targets." (§A4.2).
- **Advanced disclosure per tank** (D3, NEW): Role affinity Select over the KSA `TankRoleAffinity` enum + "(default)" sentinel, and Location offset (assembly frame) `Vec3Field` (m) — both `updateTank` patches (`roleAffinity`, `locationAsmb`; verified round-trip fields, P6.03 note). Collapsed by default.
- Key cards by feed id where non-blank, index fallback (design §6.1 last row — the index-key state-bleed fix; census pain 8).
**Verify**: `pnpm typecheck`; manual: add/edit/remove at both scopes; Advanced fields persist through export/import of a part authored with `RoleAffinity` (round-trip test already exists in serializer suite — extend if it lacks a UI-visible field).

#### P6.12 — Power section (D14 degrees)
**Goal**: Batteries/generators/solar/consumer with the standardized degree display.
**Files**:
- create `src/ui/data/sections/PowerSection.tsx`
**Depends on**: P6.06, P6.09.
**Spec** (design: §A4.1 Power, D14; census §1.1 Power — port `PowerSection`/`PowerList`/`SolarPanelsSection`/`PowerConsumerSection`, code: `src/ui/GameDataSections.tsx:427-624`):
- Batteries (Wh) / Generators (W): number lists, add/remove/edit (`addBattery`/`setBatteryCapacity`/… code: `src/state/editorStore.ts:3024-3055`; add/remove discrete, edits streaming).
- Solar panels: Produced (W) + Orientation `Vec3Field` **displayed in degrees** (D14 — stored radians UNCHANGED, convert `°⇄rad` at the field boundary exactly like the lights aim-rotation fields do; census pain 10 names the v1 radians inconsistency this fixes). Actions `addSolarPanel`/`setSolarPanelOutput`/`setSolarPanelRotation` (code: `:3060-3081`) — the rotation setter keeps receiving radians.
- Power consumer: at most ONE (add button disabled with tooltip when present — single `Part.LightSwitch` slot); Consumed (W), "Light switch" Switch, "Starts on" Switch (disabled unless light switch). Preserve BOTH contextual hints verbatim: the "switch controls nothing" warning (computed against placements + customMeshes glow, port the predicate from `PowerConsumerSection`, code: `:483-540`) and the "lights always on" hint.
**Verify**: `pnpm typecheck`; manual: a solar orientation shown `90` exports as `1.5708` rad (check XML tab in export); hints appear/disappear as lights are added.

#### P6.13 — Coupling section (+ Show→ eye, D17 Seat select)
**Goal**: Decoupler / Docking Port / EVA Door with connector-picker invariants and the new affordances.
**Files**:
- create `src/ui/data/sections/CouplingSection.tsx`
**Depends on**: P6.04 (Seat select only), P6.06, P6.09.
**Spec** (design: §A4.1 Coupling, D17; census §1.1 Coupling — port `CouplingSection` + `ConnectorSelect`, code: `src/ui/GameDataSections.tsx:629-738`):
- Three Switch-created modules (Switch toggles are discrete via `setDecouplerEnabled`/`setDockingPortEnabled`/`setEvaDoorEnabled`, code: `src/state/editorStore.ts:3122-3180`): Decoupler (Connector + Force N), Docking Port (Connector + Latching kinetic energy J + Pushoff impulse N·s), EVA Door (Connector + Seat select).
- `ConnectorSelect` semantics preserved VERBATIM (census invariant 4): a stale/deleted connector id stays selectable and labeled; empty hint "Add a connector in the workspace first." NEW: a "Show →" eye button beside each select → `$dataFlash` of that connector (flash-highlight in the viewport; P6.05 atom — extend it to accept connector ids or add a parallel field).
- **Seat select** (D17): options = IVA seats in DOCUMENT ORDER labeled "Seat 1"…"Seat N" (+ current `ksaId` in a mono caption when set) + "(default)" sentinel = `seatId: null`. Picking Seat k: if the seat lacks a `ksaId`, first assign one (`seat_<k>` uniquified against the feed-container id namespace — tanks/grain feed ids; scope: `connectors-coordinates-iva.md:292`) via a discrete editorStore action added in P6.04's model task (`setEvaDoorSeat(seatIndex | null)` — ONE push `'set EVA door seat'` covering both the seat `ksaId` assignment and `evaDoor.seatId`). A stale `seatId` matching no seat stays selectable "— not found" (same stale-ref philosophy).
**Verify**: `pnpm typecheck`; `pnpm test` (editorStore case: `setEvaDoorSeat` is one undo step and authors both fields); manual: eye button flashes the connector in 3D; "(default)" clears `SeatId` from the export.

#### P6.14 — Part scope: Wiring + Advanced sections (interim v1 guts) + Capabilities summary (D10)
**Goal**: Wiring/Advanced land as Data sections hosting the v1 engine components, plus the read-only connector-capabilities mirror.
**Files**:
- create `src/ui/data/sections/WiringSection.tsx`
- create `src/ui/data/sections/AdvancedSection.tsx`
- create `src/ui/data/CapabilitiesSummaryCard.tsx`
**Depends on**: P6.06, P6.09.
**Spec** (design: §A4.1 Wiring/Advanced, D9, D10, D11):
- **Wiring** (header carries "Open in Engine mode →" → `setMode('engine', {engineScope: {kind:'part'}})`): render the EXISTING v1 components — `RocketControllersSection`, `ConsumerFeedWiringSection` (incl. auto-wire + KSA log-text warning), `GimbalsSection` (code: `src/ui/EngineSections.tsx:1069/1187/1339`). **P7.18 swaps these for the shared `ControllerEditor`/`FeedWiringEditor`/`GimbalEditor` — add a `// TODO(P7.18)` marker.** Below them, `CapabilitiesSummaryCard` (D10): READ-ONLY — one row per connector, capability chips (`BulkFluid` `SolidMotorCase` `¬Electricity` `¬ServiceFluid` `DecouplerJoint`; "default: Electricity + ServiceFluid" when the list is empty — semantics: `src/ksa/types.ts:59-104` per census §1.4), and a per-row "Edit in Build →" jump (`setMode('build')` + select the connector). NO editing here — the Build connector inspector stays the single editor (D10).
- **Advanced** (collapsed by default): the v1 `PartSolidMotorSection` + `PartGasGeneratorSection` (code: `src/ui/EngineSections.tsx:1278/1408`) + the D11 cross-link banner "This hardware is also editable in Engine mode →" (jump as above). Same `// TODO(P7.18)` marker.
- The v1 `EngineIssuesPanel` placement inside a section is RETIRED — findings surface via P6.08 (design §A4.1 "Engine issues — NOT a section").
- Undo: unchanged v1 semantics inside the hosted components (discrete adds/removes push internally; `autoWireUnwiredConsumers` is one `'auto-wire consumers'` push, code: `src/state/editorStore.ts:3493`).
**Verify**: `pnpm typecheck`; manual: every v1 Part-Data Engine-section capability reachable in Data mode (controllers, wiring + auto-wire, gimbals, solid motor, gas generator); capabilities card mirrors a connector edited in Build live.

#### P6.15 — Template scope sections: Lights, Solar, Engine (interim), + add-data empty state
**Goal**: The full template-scope form (§A4.2) with viewport-co-visible light editing.
**Files**:
- create `src/ui/data/sections/LightsSection.tsx`
- create `src/ui/data/sections/TemplateEngineSection.tsx`
- modify `src/ui/data/DataScopeForm.tsx` (template layout: Tanks · Lights · Solar · Engine · Passthrough; empty state)
**Depends on**: P6.09–P6.12.
**Spec** (design: §A4.2; census: part-data-gamedata.md §1.2, viewport-scene-view.md §1.8 / §6.3 parity):
- **Lights**: port `LightsSection` guts (code: `src/ui/GameDataSections.tsx:285-422`) — rows filtered to `light.ownerTemplateId === templateId`, **mutator indices stay indices into `part.lights`** (documented invariant at `:287-289`). Fields: Type (Spot/Point) → `setLightType`; Position (m) `Vec3Field`; Aim rotation (°) (Spot only; stored radians); Range (m); Intensity; Color via kit `ColorField` (replaces the v1 native `<input type=color>`); Inner/Outer half-cone (° — label "half-angle", D14); Ray tracing (IVA only) Switch → `setLightRayTracing`; "Select in 3D" → `select([{kind: 'light', id: light.id}])` + `revealEntity('light', light.id)` (the per-kind `selectLight` setter was DELETED in P5A.17 — use the stable-id `select` action; the light object is in scope) — now genuinely useful with the viewport co-visible (the modal-covers-viewport bug is structurally dead — design §6.3). "+ Light" → `addLight(templateId)` (discrete). Part-level lights deliberately ABSENT (Build-owned; the navigator's non-capable rows explain + jump).
- **Solar**: reuse `PowerSection`'s solar sub-component wired to the `addSubPartSolarPanel` family (code: `src/state/editorStore.ts:2624-2662`), degrees per D14.
- **Engine (thrust chamber)** (header "Open in Engine mode →" with `{engineScope: {kind:'sub', templateId}}` payload): render the v1 `SubPartEngineSection` (code: `src/ui/EngineSections.tsx:850`) + D11 cross-link banner. `// TODO(P7.18)` swap marker. Shared-by-N banner inside nozzle cards comes with it.
- **Empty state** (template scoped, zero data anywhere): the "＋ add data" menu rendered as buttons (design §A4.2 last line).
**Verify**: `pnpm typecheck`; manual: add a light to a template, "Select in 3D" reveals it live with the form still open; template with no data shows the button set; every SubPart-Data-modal capability is reachable (walk census §1.2's section list).

#### P6.16 — `PassthroughViewer` (D2)
**Goal**: The read-only preserved-XML tree at both scopes.
**Files**:
- create `src/ui/data/PassthroughViewer.tsx`
**Depends on**: P6.06, P6.09.
**Spec** (design: §A6, D2):
- Props: `{ unknownAttrs, unknownChildren, customMassExtras? }` (part scope passes all three; template scope passes its spd's `unknownAttrs`/`unknownChildren`). Shape: `RawXmlNode` (code: `src/ksa/types.ts:1117`).
- Tree rows, indent = depth: `<TagName attr="v">` in mono, leaf text inline, chevron collapse. `unknownAttrs` render on a synthetic root row; `customMassExtras` grouped under a label "inside `<CustomMass>`".
- Footer: kit `CopyDownloadBar` "Copy XML" — serialize by building elements with `document.implementation.createDocument` + `XMLSerializer` (built-in DOMParser/XMLSerializer per project convention; do NOT export the serializer's private `buildRawNode` — code: `src/ksa/partXmlSerializer.ts:505` stays private; a ~10-line local `rawNodeToXmlString` is fine and keeps `ksa/` untouched).
- Explainer text: "flexo preserves XML it doesn't model and re-exports it verbatim. Read-only by design." Empty state: "No preserved XML — everything on this part is modeled."
- **Strictly read-only** — no mutation surface of any kind (D2 rationale). Import remap + allow-lists untouched (census invariant 1: `src/ksa/partXmlParser.ts:905-956` allow-lists, `:994` `remapRawConnectorRefs`).
**Verify**: `pnpm typecheck`; manual: import a Core part carrying unmodeled GameData XML → tree renders it; Copy XML produces well-formed XML matching the export's passthrough block; empty part shows the empty state.

#### P6.17 — Mount Data mode + hotkey mirrors + commands
**Goal**: Data mode's sidebars become the real thing; hotkeys and palette entries land.
**Files**:
- modify the mode-body host (wherever P4 mounts per-mode right/left content) to render `DataNavigator` / `DataScopeForm` for `$mode==='data'`
- modify the hotkey registry (register `surface:data-navigator` mirrors)
- modify `src/ui/commands/*` (data commands + dynamic provider — P2.09's canonical command-module tree; never create `src/commands/`)
**Depends on**: P6.07–P6.16.
**Spec** (design: §A9; foundation §11.1–§11.2; FINAL_DESIGN_INDEX hotkey table row "surface:outliner · data-navigator · engine-tree · members"):
- Right = `DataNavigator`, left = `DataScopeForm` (with the P4 interim placeholder deleted).
- The navigator registers the **list-focus edit-chord mirrors** at scope `surface:data-navigator`: `⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I` delegating to the SAME edit/select commands acting on the entity selection (mirror pattern established for `surface:outliner` in 5A — copy its registration shape). The list's own ⌘A keeps react-aria row select-all precedence. NO new bare-key mode bindings (design §A9: digits/letters stay free; GridList arrows navigate for free).
- Commands: `data.scopePart` ("Edit part data"), dynamic provider `data.scopeTemplate(templateId)` ("Edit data: TankB" — one per data-capable template), `data.jumpSection(sectionId)` (unbound; used by chips/rows). Palette + menus pick these up from the registry automatically.
**Verify**: `pnpm typecheck`; manual: focus the navigator, range-select nothing, press ⌘C with a viewport selection → copy still fires; ⌘K → "Edit data: <template>" scopes correctly; Help dialog lists the data-navigator mirror scope.

#### P6.18 — The modals die (dual-routes ledger §C1 rows 1–4)
**Goal**: Delete `PartDataDialog` (the P2.07 extraction of the v1 PartDataButton modal), `ManageTanksModal`, `GameDataSections.tsx`; retarget every entry point.
**Files**:
- delete `src/ui/PartDataDialog.tsx` (the trigger `PartDataButton.tsx` already died in P2.11), `src/ui/ManageTanksModal.tsx`, `src/ui/GameDataSections.tsx`
- modify any surviving mounts/commands (interim dialog ids from P2, Outliner/inspector row menus)
- modify `src/state/editorStore.ts` + `src/state/editorStore.test.ts` (stale `PartDataButton` comment references only — no behavior)
**Depends on**: P6.10–P6.17 (every field must already have its Data-mode home — RULE ZERO).
**Spec** (design: §C1 rows: `PartDataButton` → DELETED; `ManageTanksModal` → DELETED; toolbar/MobileTopBar items → mode switcher `3` (already gone with P2/P5 if those phases deleted the hosts); AssetsList row "SubPart Data" → the Outliner/inspector **jump** which P5A/P5B already wired):
1. Before deleting, sweep the remaining sections of `GameDataSections.tsx` for anything not yet ported (checklist: `IdentityFields`, `SizeControlFields`, `MassSection`, `TanksSection`, `LightsSection`, `PowerList`, `PowerConsumerSection`, `SolarPanelsSection`, `PowerSection`, `ConnectorSelect`, `CouplingSection` — each must have a P6.10–P6.15 successor). If anything is missed, STOP and port it first (RULE ZERO).
2. Delete the three files; remove the interim commands/dialog ids that opened the modals; fix stale comment references (`grep -rn "PartDataDialog\|PartDataButton\|ManageTanksModal\|GameDataSections" src/`).
3. The Build-mode jumps stay jumps: `[SubPart Data →]` in the SubPart inspector and the Outliner row menu land in Data mode template scope (verify the P5B payload is consumed by P6.05's hook).
**Verify**: `pnpm typecheck`; `pnpm test`; `grep -rn "PartDataDialog\|PartDataButton\|ManageTanksModal\|GameDataSections" src/` → 0; manual: the census §1.1/§1.2 feature walk — every field editable somewhere in Data mode.

#### P6.19 — Data mode phone variant
**Goal**: Full §A8 phone parity from the foundation §12 primitives.
**Files**:
- modify the Panel-sheet host (Data tab re-tap → `DataNavigator` at `sm` density)
- modify the Inspector-sheet host (`DataScopeForm` with `‹ Scopes` back header)
- modify `src/ui/data/DataNavigator.tsx` / `DataScopeForm.tsx` (sheet-mode affordances)
- modify the CondensedStatusBar (Data issue chip → findings sheet)
**Depends on**: P6.17.
**Spec** (design: §A8; foundation §12 — no bespoke phone forks):
- Panel sheet = navigator verbatim at `sm`; validation strip pinned above the sheet grabber. Tapping a scope row closes the Panel sheet and opens the Inspector sheet (`DataScopeForm`) whose header gains `‹ Scopes` (re-opens the Panel sheet) + the scope chip. Section chip strip works as on desktop.
- Non-capable rows: tap = show tooltip content inline (tooltip-as-row-expansion or a small sheet) with the jump button. "＋ add data" menu → sheet menu.
- Selection FAB shows the scope name in Data mode; CondensedStatusBar shows `⚠ N` (tap → `FindingsList` as a sheet; tapping a finding closes it and jumps).
- "Select in 3D" and the D10/coupling "Show →" eye CLOSE the sheet so the highlight is visible, with a status flash (`light_2 selected`) — phone-only behavior (§A8, §A5 touch equivalent).
**Verify**: manual at <640px (project-local Playwright if scripted; dev base `/flexo/`): every §A8 bullet; `pnpm typecheck`.

#### P6.20 — Docs sync + scope assertion
**Goal**: Same-phase doc truth (AGENTS.md mandate); P12 does the final sweep but must not find lies.
**Files**:
- modify `docs/editor-state.md` (new stores `dataModeStore`/`gameDataFindings`; `setExtraDiameters`, `removeAllTemplateData`, `setEvaDoorSeat`; the Part/SubPart Data modals' death)
- modify `docs/lights.md` (SubPart-owned light *data* editing → Data mode template scope; "Select in 3D" now live)
- modify `docs/xml-io.md` (passthrough now has a read-only viewer; capture/re-emit/remap semantics UNCHANGED — say so explicitly)
- modify `docs/engines.md` (only the two sentences that point at "Part Data dialog" for wiring/issues — repoint at Data mode; the full authoring-UX rewrite is P7.22/P12)
**Depends on**: P6.18.
**Spec**: Update the named sections in place; do not restructure the docs. **Scope note**: apart from P6.04 (D17 — which carried its own `scope/connectors-coordinates-iva.md` sync), this phase changes NO game contract: parser/serializer byte-identical behavior, passthrough machinery untouched. State this explicitly in the PR description (AGENTS requires the scope *check*, not necessarily a diff).
**Verify**: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test`; read each modified doc section against the running app.

---

## Phase 7 — Engine mode

**Design sources**: design-data-engine-modes.md Part B (§B1–B11), §0 decisions D5–D9, D12–D16, Part C (§C1 rows 5–9, §C3), §6.2 parity table; foundation.md §2.2 (attention dot), §2.4 (engine exit invariants), §2.6 (exhaust tool row), §6.2 (Tool bar clamp), §7.4, §8.4, §11 (scopes), §12, §15.4 (wireframe); FINAL_DESIGN_INDEX.md hotkey rows `mode:engine X` / `tool:exhaust , . Esc` / `surface:engine-tree` mirrors, menubar "Define Engine…"; DECISIONS.md #1 (self-sufficient, absorbs ConsumerFeedWiring).
**Census sources**: `analysis/flexo-v2-feature-census/engines.md` (primary — the 1806-line EngineSections census, §5 invariants), `part-data-gamedata.md` §1.4 (plumbing), `viewport-scene-view.md` (handle/scene invariants).

**Entry state**: P6 complete. Data mode canonical; its Wiring/Advanced/Engine sections host the v1 `EngineSections` components (P6.14/P6.15 TODO markers). Engine mode (`4`) still shows the interim rehosted `EnginePanel` + `EngineToolbar` (foundation §17 step 1 rehosting) — exhaust placement already runs through `$activeTool='exhaust'` (P5B.27), the Tool bar shows the Scale→Move clamp via `$effectiveToolMode` (code: `src/state/engineStore.ts:284`). `src/ui/EngineSections.tsx` (1806 lines), `EnginePanel.tsx`, `EngineToolbar.tsx`, `EngineIssuesPanel.tsx` (wrapper around P6.08's `FindingsList`) alive. `enterEngineMode`/`exitEngineMode` (code: `src/state/engineStore.ts:290/296`) still exist wired to the interim host.

**Exit state**: App fully runnable. Engine mode is the self-sufficient designer (LOCKED #1): right = `EngineNavigator` (scope select, define-new per-template picker with instance sub-pick, module tree with issue dots, always-visible ISSUES, per-rocket Performance + solid thrust-curve preview, Exhaust section), left = `ModuleEditor` (one module at a time, all §B4 editors), ConsumerFeedWiring INSIDE the mode, custom propellants a tree group, reaction picker searchable, exhaust tool with `X` toggle + `,`/`.` cycling. Data mode's engine sections render the SAME shared editors with cross-link banners (D11 complete). `EnginePanel`/`EngineToolbar`/`EngineSections`/`EngineIssuesPanel` DELETED. D15 (plume entries), D16 (5091 warnings), D7 (thrust curve, severable) shipped with scope/docs sync. Engine phone variant per §B8.

**Undo / persistence contract** (design: §B11 — tasks state their rows):

| Interaction | Undo | Persistence |
|---|---|---|
| Define engine (any of 4 kinds) | ONE composite push (`'define liquid engine'` / `'define RCS thruster'` / `'define solid motor'` / `'define SRB'`) | autosave |
| Add/remove/duplicate module, add propellant, add wiring entry, add gimbal | discrete push each | autosave |
| Field edits (all editors) | streaming: push at interaction start | autosave |
| Reaction pick (incl. O/F reset side effect) | ONE discrete push (`'set propellant'`) | autosave |
| Normalize direction / FX override toggle / auto-wire | discrete push each | autosave |
| Exhaust gizmo drag | one push at drag start (`'exhaust'`/`'plume FX'`); streaming | autosave |
| Scope select, module focus, rocket readout select, exhaust target/arming, tree collapse | none (ephemeral designer state) | not persisted |
| Remove propellant / module | foundation §14.3 (≤5-entity undoable → no confirm, status `[Undo]`) | autosave |

**Phase verification**:
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test`.
2. `grep -rn "EnginePanel\|EngineToolbar\|EngineSections\|EngineIssuesPanel\|enterEngineMode\|exitEngineMode" src/` → 0.
3. Manual smoke (desktop): `4` restores the last engine; Define new ▸ Liquid on a twice-placed template → instance sub-pick, ONE undo step, scope activated, first module focused; module tree walk — every §B4 editor renders and edits; ISSUES shows "✓ no issues" when clean and jumps+flashes when not; Performance aggregates per rocket with a per-pair disclosure; `X` arms exhaust, `,`/`.` cycle targets (chip flashes), Scale button disabled with the clamp shown, Esc disarms; leave Engine → handles disposed (click where one was — nothing steals the pick); custom propellant clone → appears in the reaction picker instantly; Data mode Wiring/Engine sections show the SAME editors + cross-link banners.
4. Manual smoke (phone): Panel sheet navigator; module row → Inspector sheet with `‹ Modules`; exhaust chip re-targeting sheet; performance headline sticky in the Panel sheet footer; LUT rows as 2×2 cards.
5. Game contract: `enginePhysics.ts` untouched (`git diff --stat src/ksa/enginePhysics.ts` → empty); serializer/parser diffs ONLY from D15/D16/D7 tasks, each with its scope/engines.md sync landed; export output otherwise byte-identical.

---

### A. State & pure logic

#### P7.01 — engineStore v2: `$activeModule`, `$rocketReadoutSel`, `$engineFindings`, label helper
**Goal**: The evolved ephemeral designer store per the §B9 sketch; `enterEngineMode`/`exitEngineMode` retired.
**Files**:
- modify `src/state/engineStore.ts`
- modify `src/state/engineStore.test.ts`
**Depends on**: none.
**Spec** (design: §B9 — follow the sketch exactly; census: engines.md §3 ephemeral-state invariants):
```ts
export type EngineModuleGroup =
  | 'combustor' | 'nozzle' | 'solidMotor' | 'grain' | 'solidNozzle'
  | 'rocket' | 'controller' | 'wiring' | 'gimbal' | 'propellant';
export const $activeModule = atom<{ group: EngineModuleGroup; scope: 'sub' | 'part'; index: number } | null>(null);
export const $activeModuleClamped = computed([$activeModule, $activeEngineEntry, $part], …); // out-of-range/stale → null
export const $rocketReadoutSel = atom<string /* rocket id */ | '\0firstPair'>('\0firstPair');
export const $engineFindings = computed([$part, $allReactionIndex], (p, r) => validateEngines(p, r));
export function focusModule(ref: typeof $activeModule.value): void
export function activateEngine(entry: EngineEntry | null): void  // = setActiveEngine + $activeModule reset
export function cycleExhaustTarget(delta: 1 | -1): void          // walks $resolvedNozzleTargets order, wraps, sets $activeNozzleRef
```
- Keep VERBATIM: `$activeEngineEntry`, `$activeNozzleRef`, `$resolvedNozzleTargets` (defensive re-resolution each read, code: `src/state/engineStore.ts:179` — census invariant "stale refs degrade, never edit the wrong nozzle"), `$activeNozzleTarget`, `$effectiveToolMode`. `$isExhaustPlacing` becomes purely `computed(modeStore.$activeTool === 'exhaust')` if P5B.27 left any legacy flag; `$engineExhaustGizmo` becomes a derived compatibility view or is inlined away (EditorScene consumers repointed in P7.10).
- **Single label helper**: `export function engineEntryLabel(entry, part): string` (+ short form) replacing the duplicated `shortLabel`/`entryLabel` pairs (code: `src/ui/EnginePanel.tsx:42` `shortLabel`, `src/ui/EngineToolbar.tsx:7` — census pain 7). Attention-dot count = **scope count with validation blockers** feeds foundation §2.2 (wired in P7.05).
- Delete `enterEngineMode`/`exitEngineMode` exports (code: `:290/:296`) — `modeStore.setMode('engine', payload)` is the single choreography point (P7.05). Update the callers in the same task if any remain (grep).
- All of this is ephemeral: never serialized, never undoable (§B11 last rows).
**Verify**: `pnpm test` — `engineStore.test.ts` extended: `$activeModuleClamped` nulls on out-of-range index and on scope mismatch after the module list shrinks; `cycleExhaustTarget` wraps both directions and no-ops with zero targets; `activateEngine` resets `$activeModule`; label helper covers subpart + part-level + long template ids.

#### P7.02 — editorStore: `addRcsEngine`, `addSolidEngine`, `duplicateEngineModule`, `updateReactionPlumes`
**Goal**: The four new document mutations (D12, D13, D15, tree-row Duplicate).
**Files**:
- modify `src/state/editorStore.ts`
- modify `src/state/editorStore.test.ts`
**Depends on**: none.
**Spec** (design: §B3.1 define-new, §B3.2 ⋮ Duplicate, D15; census: engines.md §1.2):
1. **`addRcsEngine(subPartTemplateId | null, instanceId)`** — the RCS split of `addEngine` (code: `src/state/editorStore.ts:3553` `addEngine` — note it ALREADY takes `kind: RocketControllerKind`): ONE push `'define RCS thruster'`; same composite but `kind:'thruster'` (RCS controller + "RCS" tag — existing behavior at `:3576-3577`) AND the combustor authored Service-plumbed (`plumbing:'Service'` — design D12 "Service-plumbed pulsed combustor"; `createCombustor` defaults Bulk, code: `src/ksa/types.ts:1356`). Accept `null` template = part-level target (push onto `gameData.combustors/nozzles/rockets` — the MMU pattern; design §B3.1 "Part-level target offered for RCS").
2. **`addSolidEngine(subPartTemplateId, instanceId)`** — NEW one-step composite (D12): ONE push `'define solid motor'` creating on the spd: `createSolidMotor(id)` (APCP + `'Neutral'` grain — code: `src/ksa/types.ts:1060`), one `createSolidGrainSegment`-equivalent grain segment (mirror the defaults used by `addSubPartSolidGrainSegment`, code: `src/state/editorStore.ts:3419`), one `createSolidMotorNozzle(id)` (code: `types.ts:1072`), an all-solid `createRocket(rocketId, motorId, [nozId])`, a part-level engine controller on the picked instance, + the "Engines" tag. Reuse `addEngine`'s id-uniquing helpers (`allEngineModuleIds`/`uniqueModuleId`).
3. **`addSrbEngine`** unchanged (parity, D12 "legacy") — but update its stale doc comment ("KSA still has no solid-motor hardware" is false since 5018; reword to "the legacy pre-5018 approximation — see addSolidEngine").
4. **`duplicateEngineModule(ref: {group, scope, index})`** — ONE push `'duplicate module'`: structuredClone the module, re-id via `uniqueModuleId`, append to the same list. Cover: combustor, nozzle, solidMotor, grain, solidNozzle, rocket, controller, propellant (wiring/gimbal rows are keyed to consumers/instances — the tree ⋮ omits Duplicate for those two groups; note it).
5. **`updateReactionPlumes(ref: nozzle locator, plumes: ReactionPlume[])`** — DISCRETE (one push `'edit plume entries'`) setter for the full `<ReactionPlume>` list (D15). Nozzle fields type: `src/ksa/types.ts:757` `ReactionPlume`, list at `:890/:1016`. (The fast-path default-entry selects keep going through the streaming `updateNozzle` patch + `withDefaultReactionPlume`, code: `types.ts:781` — unchanged.)
**Verify**: `pnpm test` — cases: each composite is ONE undo step and undo removes everything it created; `addRcsEngine` authors `plumbing:'Service'` + RCS tag; `addSolidEngine` yields an all-solid rocket that passes `validateEngines` with APCP in the index; `duplicateEngineModule` re-ids uniquely; `updateReactionPlumes` one push.

#### P7.03 — D16: 5091 warning parity in `validateEngines`
**Goal**: Adopt KSA rev-5091's five wiring warnings (gap Q4). Game-contract-adjacent: scope sync in-task.
**Files**:
- modify `src/ksa/engineValidation.ts`
- modify `src/ksa/engineValidation.test.ts`
- modify `scope/engines.md`
**Depends on**: P6.02 (source metadata exists).
**Spec** (design: D16; the authoritative check list is scope: `scope/engines.md:178-196` — mirror it, `warn` severity, with `source` metadata):
- New codes (kebab-case, stable): `controller-no-rockets` (controller with empty rocket refs — "references no Rockets; it will drive nothing"), `rocket-no-nozzles` (core bound, zero nozzle refs), `nozzle-not-referenced` (a nozzle no `<Rocket>` names), `core-not-referenced` (a combustor/solid motor no rocket names as Core, or whose rocket has no controller — "cannot be activated"), `wiring-feed-unresolvable` (a wiring feed point resolving to nothing — distinct from the existing `feed-unknown-*` which cover consumer feeds; check the existing codes at census engines.md §1.11 first and DO NOT duplicate an existing check under a new code).
- Message texts paraphrase KSA's log lines per the scope table (keep flexo's established message voice). UI needs ZERO changes — findings flow through P6.02/P6.08 and P7.08 pipelines (D16: "UI needs zero changes").
- Scope sync: mark gap **Q4** closed in `scope/engines.md` (the "MISSING-CAPABILITY (low, optional)" block becomes a "mirrored in flexo" note naming the five codes).
**Verify**: `pnpm test` — one fixture per new code (e.g. controller with `rocketRefs: []` → `controller-no-rockets` warn) + a clean full engine yields none of the five; existing code expectations untouched.

#### P7.04 — D7: solid thrust-curve port (`solidMotorPhysics.ts`) + solids data files (severable)
**Goal**: The KSA-math port behind `SolidThrustCurveCard`: grain-geometry LUTs + `TrySampleThrustCurve`.
**Files**:
- copy `GrainGeometries.xml` + `SolidPropellants.xml` into `flexo-private-assets/assets/` (from `ksa-game-assemblies/current/Content/Core/` — both verified present there)
- create `src/ksa/grainGeometryCatalog.ts` (+ fetch via `fetchXmlFile`, code: `src/ksa/catalog.ts:115`)
- create `src/ksa/solidMotorPhysics.ts`
- create `src/ksa/solidMotorPhysics.test.ts`
- create `src/state/solidCurveStore.ts` (lazy load-once, `$grainCatalog`, mirroring `reactionStore`'s pattern)
- modify `scope/engines.md`, `docs/engines.md`
**Depends on**: none (SEVERABLE — design D7: until this lands, P7.09's card renders the "preview unavailable — engine still exports correctly" hint. If deferred, still ship P7.09 with the hint path and list the deferral in the phase PR).
**Spec** (this is a **KSA-math port — game contract**; scope/engines.md sync REQUIRED in-task):
1. **Catalog**: parse `GrainGeometries.xml` (`<GrainGeometry Id>` → `<DepthCondition><Depth/><Perimeter/><PortArea/>` triplets — file format verified) into `{id, depth[], perimeter[], portArea[]}`; parse `SolidPropellants.xml` for `<StorageDensity KgPerM3>` per solid substance id (verified attr). Both OPTIONAL at runtime (OSS build): absent files → empty catalog → preview degrades (same tolerance contract as `Reactions.xml`, code: `src/ksa/reactionCatalog.ts:256` `loadReactionCatalog`).
2. **Port** into `solidMotorPhysics.ts`, verbatim-port discipline (identical constants/iteration counts/clamps — census invariant; reuse the EXPORTED building blocks of `enginePhysics.ts`, do not modify that file: `lutLookup`, `combustorConditions`, `nozzlePerformance`, `characteristicVelocity` — code: `src/ksa/enginePhysics.ts:137/364/409/243`):
   - `GrainGeometryTable.Lookup`/`MaxDepth`/`InitialPortArea` (decomp: `ksa-game-assemblies/current/decomp/KSA/GrainGeometryTable.cs` — segment-lerp via the same `findSegment` logic `enginePhysics.ts` already ports; re-implement locally, `findSegment` is module-private there).
   - `ComputeBurningAreaAtDepth` / `ComputeGrainMassAtDepth` (decomp: `KSA/SolidGrainSegment.cs:230-256` — note depth normalizes by `CasingInnerRadius = outerRadius − wallThickness`, and burning area = `perimeter · r · length`).
   - `BurnRateLaw.Evaluate` = `a · (p·1e−6)^n` (decomp: `KSA/BurnRateLaw.cs:11-15`; flexo already carries `burnRate` on `FixedReactionData`, code: `src/ksa/reactionCatalog.ts:68`).
   - `SolveConditionsForArea` (decomp: `KSA/SolidMotor.cs:481-516` — 8-iteration fixed-point on pressure, LUT-clamped, warm-start, convergence `|Δp| ≤ 1e-4·p`).
   - Solid nozzle throat: `throatArea = exitArea / 12` (`SolidMotorNozzleTemplate` sizing — scope: `scope/engines.md:321-322`), and the two-phase efficiency `clamp(1 − condensedFraction·(0.076 + 0.046·ln(areaRatio)), 0.5, 1)` (decomp: `KSA/SolidMotorNozzle.cs:32-36`) folded into the nozzle efficiency exactly where KSA applies it.
   - `sampleThrustCurve(input): {times: Float32Array; thrustN: Float32Array; peakThrustN; burnSeconds; ignitionThrustN; vacuumIspS} | null` — the `TrySampleThrustCurve` port (decomp: `KSA/SolidMotor.cs:299-395`): 256 depth steps to max depth, burning-area sum over segments, per-step `SolveConditionsForArea` with warm start, break below `MinimumBurnPressure` (half after ignition), time base `Σ Δdepth / max(burnRate(p), 1e-6)`, final resample to the caller's sample count by linear interp. Return `null` exactly where KSA returns false.
3. **Degradation rules** (explicit, implementer-visible): `null` when — no grain catalog / unknown grain id; no solid reaction LUT or burn-rate fields; **unknown propellant density** (custom propellants have no `<StorageDensity>` — render the card's "preview unavailable" hint with the reason "no density data for custom propellants"). This is delegated-latitude degradation, consistent with the catalog-absent contract; do NOT invent densities.
4. **Scope/docs sync**: `scope/engines.md` — the "No thrust-curve preview … documented gap" line becomes a description of the port (files consumed, verbatim-port statement, the exit/12 + two-phase facts cited); `docs/engines.md` gains a "Solid thrust-curve preview" subsection. Note the two new served files in whatever doc lists `/ksa/`-served assets.
**Verify**: `pnpm test` — `solidMotorPhysics.test.ts` cases: grain LUT lookup interpolates and clamps at MaxDepth; an APCP motor with one Neutral segment yields a curve with `burnSeconds > 0`, `peakThrustN ≥ ignitionThrustN·0.9`, monotonic non-decreasing time base; `Progressive` grain peaks later than `Regressive` (shape sanity); each degradation input → `null`. `pnpm typecheck`. Manual (private-assets dev setup): curve renders for a solid engine.

---

### B. Mode choreography

#### P7.05 — Engine-mode enter/exit choreography + Define-Engine payload + attention dot
**Goal**: `setMode('engine', payload)` is the single entry/exit point (§B2); the mode dot shows blockers.
**Files**:
- modify `src/state/modeStore.ts` (engine hooks)
- modify the `Define Engine…` command (Add menu — payload `{defineNew: true, templateId?}`)
- modify the mode-switcher segment (attention dot from `$engineFindings` blockers; foundation §2.2)
- modify `src/three/EditorScene.ts` (dispose-on-exit consumes the mode/affordance flags, not the dead store functions)
**Depends on**: P7.01.
**Spec** (design: §B2 table — implement every row):
- **Enter**: restore `$activeEngineEntry` if still valid (clamped read); else selection's template is an engine scope → activate it; else exactly one engine scope exists → activate it; else empty state. Fire `void ensureReactionsLoaded()` (moves the load to mode entry — design §B5, fixing census pain 11; the per-component `useEffect`s die with EngineSections in P7.20). Payloads: `{defineNew: true, templateId?}` → navigator opens the define-new menu (seeded with the template when given — P7.06 consumes via a nonce'd atom `$defineNewRequest`); `{engineScope}` → `activateEngine` + (from Data's Wiring/Advanced) scroll the tree to the matching part-level group.
- **Exit**: disarm the exhaust tool (the P5B.27 tool def already does auto-off), **dispose nozzle handles** (hidden-but-pickable steals clicks — census invariant; EditorScene's existing mode-gated reconciliation, code: `src/three/EditorScene.ts:1875-1887` area, re-pointed at `$mode`), RETAIN `$activeEngineEntry`/`$activeNozzleRef`/`$activeModule` for return. No Close button, no Esc-exits-mode (§B2 last line).
- Attention dot: the Engine segment shows a dot when `$engineFindings` has any `block` (foundation §2.2; replaces the v1 "Engine (N)" AssetsToolbar count — ledger §C1).
**Verify**: `pnpm typecheck`; manual: Add ▸ Define Engine… from Build enters Engine with the menu open; enter with a selected engine-template → that scope; leave with a blocker present → menubar dot; return → same module focused; handles gone in Build (clicking their location selects geometry, not a phantom handle).

---

### C. Right sidebar — the Engine Navigator

#### P7.06 — `EngineNavigator` shell: scope select + define-new menu + target picker (D12/D13)
**Goal**: The §B3 header block and the four-kind creation flow with per-template rows.
**Files**:
- create `src/ui/engine/EngineNavigator.tsx`
- create `src/ui/engine/DefineEngineMenu.tsx`
**Depends on**: P7.01, P7.02, P7.05.
**Spec** (design: §B3.1 — follow the menu copy verbatim; census: engines.md §1.2):
- **Scope select**: options from `$engineEntries` (code: `src/state/engineStore.ts:137`) — template entries + "Part-level (RCS / gas generator)" when `gameData` carries hardware (sentinel `'\0part'` PRESERVED — census invariant: sentinels + current-value-stays-selectable). Labels via P7.01's helper + module-count caption.
- **Define new engine ▸** (`＋▾` menu; also the empty state's primary action): four items with inline one-line descriptions exactly as designed —
  `Liquid rocket — combustor + De Laval nozzle + rocket + controller` · `RCS thruster — Service-plumbed pulsed combustor + nozzle + RCS controller` · `Solid motor — real <SolidMotor> + grain segment + solid nozzle + rocket + controller` · separator · `SRB preset (legacy) — approximate: fixed-thrust liquid fake with sealed tank; no burn curve, can shut down. Prefer "Solid motor".`
- Each item opens the **target picker sub-view** (D13 — a pushed view inside the navigator header area, not a dialog): GridList of templates NOT yet engines, rows `template id ×N`; when N>1 an instance select "controller drives: [#1 ▾]" defaulting to the first placement (fixes v1's per-placement duplication, census pain 12); "Part-level" target offered for RCS only. Confirm = the matching composite (`addEngine` / `addRcsEngine` / `addSolidEngine` / `addSrbEngine` — ONE undo step each, P7.02), adds the tag, `activateEngine`, focuses the first created module in the left editor.
- Empty states: no placements → "Place a SubPart in Build mode first [Go to Build]"; placements but no engines → explainer + the define-new menu inline. Consume `$defineNewRequest` (P7.05) to auto-open, seeded.
**Verify**: `pnpm typecheck`; manual: all four kinds create working scopes (solid passes validation with APCP); a ×3 template shows the instance sub-pick; ⌘Z after each removes everything.

#### P7.07 — Module tree + `surface:engine-tree` mirrors
**Goal**: The §B3.2 tree: fixed groups, captions, issue dots, ⋮ menus, ＋ buttons, unwired synthetic rows.
**Files**:
- create `src/ui/engine/ModuleTree.tsx`
- create `src/ui/engine/moduleTreeModel.ts` + `src/ui/engine/moduleTreeModel.test.ts`
- modify the hotkey registry (`surface:engine-tree` mirrors)
**Depends on**: P7.01, P7.02.
**Spec** (design: §B3.2, §B10 last paragraph):
- GridList tree, groups in FIXED order: Combustors · Nozzles · Solid motor (motor / grain segments / solid nozzle sub-rows) · Rockets · Controllers · Feed wiring · Gimbals · Custom propellants. SubPart scope shows spd lists; part-level scope shows `gameData` lists. Controllers/Feed wiring/Gimbals/Custom propellants are ALWAYS part-level regardless of scope — group header carries the `[Part]` `ScopeChip` (reuse P6.09's chip component).
- Row captions (pure model, testable): combustor → reaction display name; nozzle → `⌀<exit> m`; rocket → `core: <id>`; controller → type; wiring → `<consumer> ← <first feed>`; gimbal → instance label; propellant → category. ⚠ dot when a `$engineFindings` issue's `source` targets it (P6.02 metadata).
- Selecting a row → `focusModule`. ⋮ menu: **Duplicate** (`duplicateEngineModule`; hidden for wiring/gimbal — P7.02 note), **Remove…** (foundation §14.3: ≤5-entity undoable → no confirm + status `[Undo]` flash; route through the existing remove actions), nozzles additionally **"Show exhaust handle"** (activate its first resolved target chip).
- Group `＋` adds a default module (existing add actions — discrete) and focuses it; Nozzles' `＋▾` offers De Laval / solid nozzle when the scope has a solid motor; Controllers' `＋▾` Engine / RCS; Custom propellants' `＋▾` = Clone shipped… / Blank (wired fully in P7.18). Feed wiring group: synthetic `⚠ unwired: <consumer>` row per `unwiredConsumersOf(part)` (code: `src/state/feedTargets.ts:108`) clicking through to the wiring editor; group-header **Auto-wire** action when any exist (`autoWireUnwiredConsumers` — one push).
- Empty groups collapsed with `⓪`. Register `surface:engine-tree` edit-chord mirrors (`⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I` → entity-selection commands; same pattern as P6.17).
**Verify**: `pnpm test` — `moduleTreeModel.test.ts`: group order fixed; captions per group; part-level groups present under a subpart scope with `[Part]` chip flag; unwired synthetic rows appear/disappear. Manual: tree walk on an MMU-like part (part-level RCS) and a solid motor.

#### P7.08 — ISSUES section + Engine status segment
**Goal**: Always-visible validation (§B3.3) reusing P6.08's `FindingsList`.
**Files**:
- create `src/ui/engine/IssuesSection.tsx`
- modify the StatusBar Engine segment
**Depends on**: P7.01, P7.07, P6.08.
**Spec** (design: §B3.3, D4): Always MOUNTED — shows `✓ no issues` when clean (continuous confidence; fixes census pain 3). Content = `FindingsList` over `$engineFindings` (block/warn wording preserved; D16 warnings flow through automatically). Clicking a finding: `focusModule` on the issue's `source` (map via the same group/scope/index), tree row revealed, left editor focused, and — when the finding is field-addressable (codes: mixture-ratio missing, `nozzle-direction-not-unit`, `solid-motor-pressure-out-of-range`) — flash the field via a nonce'd `$moduleFlash = atom<{key: string; nonce: number} | null>` in engineStore consumed by the editors (P7.12–P7.15 render the flash class on matching field keys). Status-bar Engine segment mirrors counts (`⚠ 0 block · 1 warn`), click → first issue.
**Verify**: `pnpm typecheck`; manual: clean engine shows ✓; delete a rocket's nozzle ref → warn appears (D16), click → RocketEditor focused; unset a mixture ratio → click flashes the O/F field.

#### P7.09 — `PerformanceCard` (D6) + `SolidThrustCurveCard` (D7)
**Goal**: Per-rocket aggregated live readout + the solid curve preview.
**Files**:
- create `src/ui/engine/PerformanceCard.tsx`
- create `src/ui/engine/performanceAggregation.ts` + `src/ui/engine/performanceAggregation.test.ts`
- create `src/ui/engine/SolidThrustCurveCard.tsx`
**Depends on**: P7.01; P7.04 (curve — severable: hint path without it).
**Spec** (design: §B6, D6, D7; census: engines.md §1.3 — `predictPerformance` is UNTOUCHED, verbatim-port invariant):
- **Rocket select** bound to `$rocketReadoutSel`: each `<Rocket>` in the active scope + "First pair" legacy fallback (auto-chosen and the select HIDDEN when the scope has no rockets — v1 behavior preserved as the fallback).
- **Aggregation** (pure, presentation-level): for the selected rocket, resolve its core + each nozzle ref against the scope (per-placement fan-out NOT needed here — thrust per nozzle × its placement count for SubPart-scope nozzles, matching one-nozzle-=-N-thrusters); per pair run `predictPerformance` (code: `src/ksa/enginePhysics.ts:538`); aggregate Σ thrust (vac/SL), Σ mass flow, `Isp = ΣF / (G0 · Σṁ)` (G0 code: `enginePhysics.ts:23`). Per-pair breakdown rows in a disclosure when >1 pair. "First pair" = exactly the v1 first-combustor+first-nozzle readout (code: `src/ui/EnginePanel.tsx:371` `PerformanceReadout` — port the metric rows and BOTH degradation states verbatim: catalog absent → "engine still exports correctly" hint; mixture without O/F → "set the combustor's O/F mixture ratio to preview").
- Metrics (mono, `tabular-nums`): Thrust vac/SL (kN) · Isp vac/SL (s) · Mass flow (kg/s) · Throat diameter (cm) · conditional `⚠ Flow separation (SL) N%` with hover hint · Optimum expansion (kPa) with hover hint — port the `Metric` row component (code: `EnginePanel.tsx:355`).
- Headline (first two numbers) renders in the navigator's Performance strip; the full card expands beneath (§B3 wireframe).
- **SolidThrustCurveCard** (D7): shown when the scope has a solid motor — canvas sparkline (no keyframes; a ~40-line `<canvas>` polyline of `sampleThrustCurve`'s output), peak thrust + burn time readouts. All degradation paths → the "preview unavailable — engine still exports correctly" hint pattern (incl. when P7.04 is deferred entirely — gate on the module's presence).
- Mixture LUT slicing untouched (`sliceLutAtMixtureRatio`, code: `enginePhysics.ts:214`).
**Verify**: `pnpm test` — `performanceAggregation.test.ts`: single-pair rocket == v1 first-pair numbers (assert against a `predictPerformance` fixture — Hydrolox@5.5 ≈ 445.4 s Isp_vac, the existing `enginePhysics.test.ts` anchor); two identical chambers → 2× thrust, same Isp; SubPart nozzle placed ×3 → 3× thrust. Manual: select rockets, watch numbers; solid scope shows the curve (or hint).

#### P7.10 — Exhaust section, hotkeys `X` `,` `.`, handle/gizmo re-wiring
**Goal**: The §B3.4/§B7 exhaust surface on the formalized tool slot, with target cycling.
**Files**:
- create `src/ui/engine/ExhaustSection.tsx`
- modify `src/state/modeStore.ts` / hotkey registry (`mode:engine` `X`; `tool:exhaust` `,`/`.`)
- modify `src/three/EditorScene.ts` (gizmo attach gates on `$activeTool==='exhaust'`; handles gate on mode+active engine)
- modify `src/state/engineStore.ts` (retire `$engineExhaustGizmo` if still real)
**Depends on**: P7.01, P7.05.
**Spec** (design: §B3.4, §B7, §B10; FINAL_DESIGN_INDEX rows `mode:engine X` / `tool:exhaust , . Esc`; census: engines.md §1.6 — ALL semantics verbatim):
- **Section**: "Place exhaust in 3D" toggle → arm/disarm `$activeTool='exhaust'` (hidden when the open engine has no nozzles). Chip list = `ToggleButtonGroup`, height-capped + scrollable (MMU's 56 nozzles), one chip per resolved target (`$resolvedNozzleTargets` — nozzle × flavor × placement × channel), labels `NozzleId #N` + `· FX`, exactly one active, mirrors handles 1:1 (deliberately NOT a Select — spatial identity). Shared-nozzle explainer line when the active target's template is multi-placed ("editing through #2; all N handles move together"). Clicking a chip or a 3D handle re-targets WITHOUT changing the mesh selection (v1 semantics, `SelectionManager` `kind:'nozzle'` route — code: `src/three/EditorScene.ts:308-313`).
- **Hotkeys**: `mode:engine` `X` toggles the tool; `tool:exhaust` `,`/`.` → `cycleExhaustTarget(∓1)` (wraps; flash the newly-active chip); Esc = ladder rung 5 disarm (already wired via the tool def). The `,`/`.` collision with `mode:animation` transport is nominal only — different scopes (§B10 note).
- **Handles & gizmo** (verbatim invariants — census engines.md §5): handles render whenever an engine is active in Engine mode (mode furniture, not armed-only), pickable always, disposed on exit; amber physics / cyan FX (KSA debug colors), depth-test off, renderOrder 10, inactive dim-fade (`NozzleHandleObject` UNCHANGED, code: `src/three/NozzleHandleObject.ts`). Gizmo attaches to `engineProxy` only while the TOOL is armed (this is the one behavior change from v1's `$engineExhaustGizmo` toggle — same UX, new flag; code: `src/three/EditorScene.ts:1631-1643` attach site, `:425-428` drag-start undo `'exhaust'`/`'plume FX'`, `:1944+` write-back: physics direction normalized every write, FX re-aimed keeping authored magnitude, NEVER normalized). Move=location (owner full matrix) / Rotate=direction (rotation only — two frames, `coords.ts` `exhaust*` helpers) / Scale clamps to Move via `$effectiveToolMode` (Tool bar already displays it truthfully — P5B.08).
- **Status segment**: `Exhaust: Nozzle1 #2 · FX · ,/. cycle · Esc done`; segment click focuses the Exhaust section. Stale-ref defense untouched (targets re-resolved each read).
- Nozzle editor's "Place this nozzle's exhaust in 3D" button (P7.13) arms the tool targeted at that nozzle.
**Verify**: `pnpm typecheck`; `pnpm test` (`engineStore.test.ts` cycle cases green); manual: X arms; , / . walk chips and handles; drag Move then Rotate on an FX handle — magnitude preserved; ⌘Z once per drag; leaving Engine disarms + disposes.

---

### D. Left sidebar — module editors (`src/ui/engine/*`)

#### P7.11 — `ModuleEditor` dispatcher + engine summary card
**Goal**: The left host: one module's editor at a time; overview when none focused.
**Files**:
- create `src/ui/engine/ModuleEditor.tsx`
**Depends on**: P7.01, P7.07.
**Spec** (design: §B4 header + §B4.1): Header = module label + `ScopeChip` (`[Template ×N]` / `[Part]` / `[Instance: … ▾]`) + ⋮ (Duplicate / Remove… / copy id — same rules as the tree row menu). Dispatch on `$activeModuleClamped` → the editors of P7.12–P7.18. **No module** → summary card: scope title, module counts by group, first blocker with jump, the solid-vs-SRB-preset guidance blurb (D12), quick actions "+ Combustor" / "+ Nozzle" / "Place exhaust in 3D". Left sidebar rules per foundation §7.4.
**Verify**: `pnpm typecheck`; manual: tree row focus swaps the editor; removing the focused module falls back to the summary (clamped read, no crash).

#### P7.12 — `ReactionPicker` (§B5)
**Goal**: The searchable grouped reaction picker with the O/F-reset contract.
**Files**:
- create `src/ui/engine/ReactionPicker.tsx`
**Depends on**: none (uses reactionStore as-is).
**Spec** (design: §B5 — every bullet):
- react-aria ComboBox-style searchable listbox (fuzzy, 5A matcher). Groups: **Project propellants** first (custom), then catalog by Category (Bipropellant, Hypergolic, Monopropellant, Solid). Row = display name + category chip + "O/F 5.5 default" caption for mixtures. Props filter: combustors EXCLUDE Solid; solid motors show ONLY Solid (custom solids included — parity with the v1 filtered selects, code: `src/ui/EngineSections.tsx:135` `ReactionSelect`, `:671` `SolidMotorFields`).
- Current-but-unknown id stays selectable and labeled (invariant). Catalog absent → static `KNOWN_REACTIONS` fallback + hint row "full catalog unavailable — authoring and export unaffected" (code: `src/ksa/engineValidation.ts:16` import site shows `KNOWN_REACTIONS` lives in `types.ts`).
- **Picking resets O/F to the reaction's default** — callers use the existing `setCombustorReaction`/`setPartCombustorReaction` (code: `src/state/editorStore.ts:2930/3255`) which implement the reset; the pick is ONE discrete push `'set propellant'` (§B11 row — verify those actions push; if they are streaming today, wrap with a discrete push in the action, not the UI). The mixture-ratio field flashes on reset (`$moduleFlash`).
**Verify**: `pnpm typecheck`; manual: search "hydro" finds Hydrolox; custom propellant appears at top instantly after authoring; picking a mixture resets + flashes O/F; unknown imported id still listed.

#### P7.13 — `CombustorEditor`, `NozzleEditor`, `SolidNozzleEditor` (+ D15 plume entries)
**Goal**: The two biggest editors, field-for-field per §B4.2/§B4.3/§B4.6.
**Files**:
- create `src/ui/engine/CombustorEditor.tsx`
- create `src/ui/engine/NozzleEditor.tsx` (exports `SolidNozzleEditor` variant)
- modify `scope/engines.md` (D15 closes gap P1 — in-task sync)
**Depends on**: P7.02 (updateReactionPlumes), P7.12.
**Spec** (port guts from `EngineSections.tsx` — `CombustorFields` code: `:236`, `NozzleFields`/`RocketNozzleFields` code: `:350/:411`, `SolidNozzleFields` code: `:384`, `DirectionLengthWarning` code: `:639`; both scopes via a `scope` prop selecting the sub vs part action family):
- **Combustor** (§B4.2): Plumbing Select (Bulk/Service + connector-capability microcopy) · `FeedsField` (`allowParent`; ALL its invariants ride along — stale "— not found", empty-list danger note with KSA's exact log text, placement-qualified container labels; code: `src/ui/FeedsField.tsx:28`; ADD the §A5 hover-highlight: option hover → `$dataFlash` of the placement) · Propellant via `ReactionPicker` · Mixture ratio (mixture reactions only; `PreciseNumberInput` bounded by `mixtureRatioBounds` (code: `src/ksa/reactionCatalog.ts:379`), **micro-slider underneath** spanning the bounds with a tick at the default ratio (§B5 — the slider streams through the same setter, one push at drag start), missing-ratio inline warning "KSA refuses to load the engine without one") · Chamber pressure (bar; stored Pa, `PA_PER_BAR` conversion) · Thermal efficiency (%) · Minimum throttle (%; helper "100 = on/off only"; clamp 1–100) · Min pulse time (s; 0 = none — RCS).
- **Nozzle** (§B4.3): Exit ⌀ (m) · **Area ratio honest-NaN** (min 1; unset/NaN renders an EMPTY field + inline "required — KSA refuses NaN" warning instead of v1's misleading `0` — `useNumberDraft` supports empty-not-zero) · Flow/Expansion efficiency (%) · shared-by-N banner (template scope, N>1) · Exhaust location Vec3 (m) · Exhaust direction Vec3 (unit; default −X; physics explainer verbatim) + `DirectionLengthWarning` ("engine pushes N.NN× rated thrust") with one-click **Normalize** (discrete push; typed/imported values never auto-rewritten — invariant) · **Override FX placement** Switch (ON seeds FX pair from physics pair, OFF nulls both — ONE authoring decision, discrete push) → sunken sub-panel: FX location, FX direction ("any length — visual only"), "cyan handle in the viewport" hint · FX exit ⌀ (m; 0 = match exit) · Exhaust plume + Plume trail Selects (fast path — edit the Default `<ReactionPlume>` via `withDefaultReactionPlume`, unchanged) · **Plume entries disclosure (D15)**: the FULL `reactionPlumes` list — per row: Default Switch ⟷ Reaction select (a row is either Default or reaction-keyed; `ReactionPlumeReference` semantics: first reaction-match, else first Default — scope: `scope/engines.md:213-236`), plume Select (`VOLUMETRIC_EXHAUST_IDS`), trail Select (`PLUME_TRAIL_IDS`), remove; "+ Entry". All list mutations through `updateReactionPlumes` (ONE discrete push each — P7.02) · Engine sound Switch · Exhaust light Switch · "Place this nozzle's exhaust in 3D" button (arms the tool at this nozzle — P7.10).
- **SolidNozzleEditor**: the same body with the area-ratio slot swapped for the note "KSA sizes the throat as exit area ÷ 12 — solid nozzles have no area ratio" (all other fields incl. FX/plume/sound/light identical — the v1 shared-body discipline, census §1.5).
- Field keys registered for `$moduleFlash` (P7.08): `mixtureRatio`, `exhaustDirection`, `defaultPressure`.
- **Scope sync**: `scope/engines.md` gap **P1** ("reaction-keyed entries round-trip but are not authorable") → closed; name the editor and the `updateReactionPlumes` action.
**Verify**: `pnpm typecheck`; manual: every census §1.4/§1.5 field present and editing; NaN area ratio shows empty+warning and exports as required-missing (validation blocker fires); a reaction-keyed plume entry authored here round-trips through export→import; Normalize is one undo step.

#### P7.14 — `SolidMotorEditor` + `GrainSegmentEditor`
**Goal**: The solid trio's remaining editors (§B4.4/§B4.5).
**Files**:
- create `src/ui/engine/SolidMotorEditor.tsx`
- create `src/ui/engine/GrainSegmentEditor.tsx`
**Depends on**: P7.12.
**Spec** (port from `SolidMotorFields`/`SolidGrainSegmentFields`, code: `src/ui/EngineSections.tsx:671/:768`; both scopes via the sub/part action families `updateSubPartSolidMotor`/`updatePartSolidMotor` etc., code: `src/state/editorStore.ts:3290-3443`):
- **SolidMotorEditor**: Solid propellant via `ReactionPicker` (Solid-only mode) · Grain profile Select (`GRAIN_GEOMETRY_IDS` + "(library default)", code: `src/ksa/types.ts:1051`) · Default chamber pressure (bar; the `(minBurn, maxStable]` range warning stays inline — validation echoes via `$moduleFlash` key `defaultPressure`) · Thermal efficiency (%) · Feeds from `FeedsField` (targets = grain segments + `SolidMotorCase` connectors — existing `feedTargetsOf` behavior).
- **GrainSegmentEditor**: Feed id (mono) · Casing material id · Outer radius (m) · Wall thickness (mm) · Length (m) · Location offset (assembly frame) Vec3. All `PreciseNumberInput`, streaming.
**Verify**: `pnpm typecheck`; manual: author a full solid motor from the tree; the thrust-curve card (P7.09) updates live as grain length changes (when P7.04 landed).

#### P7.15 — `RocketEditor`, `ControllerEditor`, `GimbalEditor`
**Goal**: Bindings + wiring-adjacent editors (§B4.7/§B4.9).
**Files**:
- create `src/ui/engine/RocketEditor.tsx`
- create `src/ui/engine/ControllerEditor.tsx`
- create `src/ui/engine/GimbalEditor.tsx`
**Depends on**: P7.07.
**Spec** (port from `RocketFields`/`RocketControllersSection`/`GimbalsSection`+`GimbalCard`, code: `src/ui/EngineSections.tsx:967/:1069/:1339-1405`):
- **RocketEditor**: Rocket id (mono) · Core select over the mixed solid+liquid id pool (mixing caught by VALIDATION, not the picker — invariant) · Nozzle refs list: per row nozzle-id select + (part scope) instance select with `'\0root'` "(root part)" sentinel; add/remove rows (discrete). Inline finding echo when this rocket carries `rocket-mixes-solid-and-liquid` / `solid-rocket-needs-nozzle`.
- **ControllerEditor** (part-level): id (mono) · Type Select (Engine = throttle+staging / Thruster = RCS pulsed) · Rockets-driven list (rocket select over ALL rockets part-wide, `allRocketIds` port, + "on instance" select with root sentinel) · add/remove refs. `ControlMap` stays verbatim passthrough (no UI — invariant).
- **GimbalEditor** (part-level): per-instance card where the `[Instance: … ▾]` `ScopeChip` IS the picker (§A5); Max angle Y (°, 0–90) · Max angle Z (°) · Constrain-to-circle Switch; "Add gimbal to instance" select over placements without one (`setGimbal` upsert kept, code: `src/state/editorStore.ts:3526`).
**Verify**: `pnpm typecheck`; manual: gimbal instance chip hover flashes the placement; adding a nozzle ref on a part-scope rocket offers instances; controller type flips Engine/RCS.

#### P7.16 — `FeedWiringEditor` (LOCKED #1) + capabilities summary reuse
**Goal**: ConsumerFeedWiring lives INSIDE Engine mode; one implementation, two mode entrances (D9).
**Files**:
- create `src/ui/engine/FeedWiringEditor.tsx`
**Depends on**: P7.07, P6.14 (CapabilitiesSummaryCard exists).
**Spec** (design: §B4.8; port `ConsumerFeedWiringSection`, code: `src/ui/EngineSections.tsx:1187-1271`; census: engines.md §1.9): Per entry: Consumer Select over `consumerOptionsOf(part)` (composite key; missing consumers stay selectable "— not found") · `FeedsField` with `allowParent={false}` (KSA forbids Parent-deferring wiring — invariant). Warning line counting unwired parent-deferring consumers with KSA's EXACT log text + "Auto-wire unwired consumers" button (`autoWireUnwiredConsumers` — one push). "+ Wiring entry" → `addConsumerFeedWiring` (discrete). Below: the read-only `CapabilitiesSummaryCard` (P6.14 component reused verbatim) with per-connector "Edit in Build →" jumps (D10). This editor is what the Data-mode Wiring section will host too (P7.19) — export it accordingly (props: none beyond optional flash keys; reads `$part` itself like the v1 section did).
**Verify**: `pnpm typecheck`; manual: complete an engine's plumbing without leaving Engine mode (LOCKED #1 acceptance); auto-wire creates blank entries as one undo step.

#### P7.17 — `PropellantEditor` + LUT grid + creation paths (D8)
**Goal**: Custom propellants as a first-class module group, full card + LUT editor.
**Files**:
- create `src/ui/engine/PropellantEditor.tsx`
- create `src/ui/engine/PropellantLutGrid.tsx`
- modify `src/ui/engine/ModuleTree.tsx` (`＋▾` Clone shipped… / Blank wiring)
**Depends on**: P7.07, P7.12.
**Spec** (design: §B4.10, D8; port `CustomPropellantCard`/`SolidPropellantFields`/`CustomPropellantLut` + `uniquePropellantId`, code: `src/ui/EngineSections.tsx:1558/:1657/:1729/:1472`):
- Card: Name · Category Select (Bipropellant/Hypergolic/Monopropellant/Solid/Thermal) · Reactants list (substance phase id + mass share; add/remove discrete, edits streaming) · Solid burn-rate fields when Category=Solid: coefficient a, exponent n (0 ≤ n < 0.95), min burn pressure (bar), max stable pressure (bar), condensed fraction [0,1) — with the HARD danger banner "will be omitted from the export" via `isCustomReactionExportable` (the serializer really skips it — invariant).
- **LUT grid**: 4 columns (ln P · T K · γ · g/mol), per-row remove, "+ Row" clones the last at lnP+0.5 (sensible defaults otherwise), copy explainer "CEA-style pre-solved thermodynamics — flexo does not solve chemistry". All numerics `PreciseNumberInput` streaming; row add/remove discrete. The design's D1 width note applies: the 4-column grid is the widest form (~460px) — if the left sidebar renders it under 380px show the one-time "widen sidebar" hint (design D1).
- **Creation** (tree group `＋▾`): "Clone a shipped propellant ▸" (select over `$allReactions`; cloning a mixture bakes it at its default O/F via `reactionDataToCustom` — KSA-combustor behavior, code: `src/ksa/reactionCatalog.ts:343`; id via `uniquePropellantId`) / "Blank propellant". Both → `addCustomReaction` (discrete) + focus. Authored propellants merge into `$allReactions` instantly (code: `src/state/reactionStore.ts:31`) — appear in every picker + drive the readout (unchanged).
- Mutations: `updateCustomReaction` (streaming) / `removeCustomReaction` (discrete; §14.3 no-confirm + `[Undo]` flash).
**Verify**: `pnpm typecheck`; manual: clone Hydrolox → Fixed LUT baked at 5.5; incomplete solid shows the omit banner AND `solid-reaction-incomplete` fires in ISSUES; new propellant selectable in a combustor immediately.

#### P7.18 — Data-mode swap to the shared editors (D11 complete)
**Goal**: Data's Wiring/Advanced/template-Engine sections render the SAME components as Engine mode.
**Files**:
- modify `src/ui/data/sections/WiringSection.tsx` (v1 sections → `ControllerEditor` list + `FeedWiringEditor` + `GimbalEditor`)
- modify `src/ui/data/sections/AdvancedSection.tsx` (v1 solid/gas-gen → `SolidMotorEditor`/`GrainSegmentEditor`/`SolidNozzleEditor`/`CombustorEditor`/`NozzleEditor`/`RocketEditor` at part scope, rendered as card lists)
- modify `src/ui/data/sections/TemplateEngineSection.tsx` (v1 `SubPartEngineSection` → the module card list: all of this template's combustors/nozzles/solid trio/rockets in order)
**Depends on**: P7.13–P7.17.
**Spec** (design: D11, §A4.1 Wiring/Advanced, §A4.2 Engine): Replace every `// TODO(P7.18)` marker from P6.14/P6.15. Data renders the IDENTICAL editor components as a card list (all modules of the scope, in order) — never a divergent capability set (D11: "the two views can never diverge"). Each section keeps its D11 cross-link banner ("Also editable in Engine mode →" jump with the matching `engineScope` payload) and Engine mode's editors get the reverse banner where the design places it (module editors carry the scope chip; the cross-link lives on the DATA side plus the Data→Engine header links — do not add banner noise inside Engine mode itself beyond §B4's header). Shared-by-N banner and instance chips come along for free.
**Verify**: `pnpm typecheck`; manual: edit a combustor field in Data → switch to Engine → same value focused module; the capability sets are identical by construction (grep: no `EngineSections` imports remain under `src/ui/data/`).

#### P7.19 — Delete `EnginePanel` / `EngineToolbar` / `EngineSections` / `EngineIssuesPanel`
**Goal**: The 1806-line monolith and its hosts die (ledger §C1).
**Files**:
- delete `src/ui/EngineSections.tsx`, `src/ui/EnginePanel.tsx`, `src/ui/EngineToolbar.tsx`, `src/ui/EngineIssuesPanel.tsx`
- modify the mode-body host (Engine right = `EngineNavigator`, left = `ModuleEditor`; interim rehost removed)
**Depends on**: P7.06–P7.18 (every component ported first — RULE ZERO).
**Spec** (design: §C1 rows 5–9): Pre-delete sweep of `EngineSections.tsx` exports against their successors (checklist: `ReactionSelect`→ReactionPicker · `IdSelect`/`InstanceSelect`→ inlined in Rocket/Controller editors · `CombustorFields`→CombustorEditor · `NozzleFields`/`SolidNozzleFields`/`RocketNozzleFields`→NozzleEditor · `DirectionLengthWarning`→ inside NozzleEditor · `SolidMotorFields`/`SolidGrainSegmentFields`→P7.14 · `SubPartEngineSection`→P7.18 template card list · `RocketFields`→RocketEditor · `RocketControllersSection`→ControllerEditor · `ConsumerFeedWiringSection`→FeedWiringEditor · `PartSolidMotorSection`/`PartGasGeneratorSection`→P7.18 Advanced · `GimbalsSection`/`GimbalCard`→GimbalEditor · `CustomPropellantsSection`/`CustomPropellantCard`/`SolidPropellantFields`/`CustomPropellantLut`/`uniquePropellantId`→P7.17). Anything missed: STOP, port, then delete. Remove the last `EngineIssuesPanel` wrapper (export pre-flight uses `FindingsList` or its own copy — check `src/ui/ExportButton.tsx` or its P9/P10 successor and repoint if it imports the wrapper). Delete the per-component `ensureReactionsLoaded` `useEffect`s with the files (mode-entry load from P7.05/P6.05 is now the only trigger — design §B5).
**Verify**: `pnpm typecheck`; `pnpm test`; `grep -rn "EnginePanel\|EngineToolbar\|EngineSections\|EngineIssuesPanel" src/` → 0; full desktop smoke item 3 of the phase checklist.

#### P7.20 — Engine mode phone variant
**Goal**: §B8 in full from the foundation §12 primitives.
**Files**:
- modify the Panel-sheet host (Engine tab re-tap → `EngineNavigator` at `sm`)
- modify the Inspector-sheet host (`ModuleEditor` with `‹ Modules` back)
- modify `src/ui/engine/ExhaustSection.tsx` (50% re-targeting sheet), `PerformanceCard.tsx` (sticky headline footer), `PropellantLutGrid.tsx` (2×2 stacked cards)
- modify the CondensedStatusBar (exhaust tool chip)
**Depends on**: P7.19.
**Spec** (design: §B8 — every bullet): Panel sheet = navigator verbatim (define-new target picker as drill-down sheet views); module row tap closes Panel, opens Inspector (`‹ Modules`); arming exhaust from the sheet dismisses it, CondensedStatusBar shows `Exhaust: Nozzle1 #2` (tap → the chip list as a 50% sheet for re-targeting; handles + gizmo touch-draggable as in Build; Tool bar strip shows the Scale→Move clamp — P5B wiring); Performance headline = the Panel sheet's sticky footer (thrust · Isp visible while scrolling modules); LUT rows render as stacked 2×2 field cards on phone (`useIsPhone` inside `PropellantLutGrid`).
**Verify**: manual at <640px (Playwright script optional; base `/flexo/`): each §B8 bullet; `pnpm typecheck`.

#### P7.21 — Docs sync (engines) + scope closeout
**Goal**: Same-phase truth for everything P7 changed.
**Files**:
- modify `docs/engines.md` (authoring UX → Engine mode: navigator/module editors/define-new four kinds/X , . hotkeys/in-mode ISSUES/per-rocket performance/plume-entry authoring/wiring absorbed; the SRB-preset copy updated per P7.02.3)
- modify `docs/editor-state.md` (engineStore v2 atoms/actions; enterEngineMode/exitEngineMode removal; new editorStore actions)
- verify `scope/engines.md` already carries the P7.03 (Q4), P7.13 (P1), P7.04 (thrust curve) syncs — cross-read once; fix anything missed
- modify `scope/GAME_UPDATE_CHECKLIST.md` if it enumerates the engine UI surfaces by name (repoint at `src/ui/engine/*`)
**Depends on**: P7.19 (P7.20 may land in parallel).
**Spec**: Update in place, keep structure. The P12 death-sweep and full doc refresh will re-audit — leave nothing false. PR description: enumerate the three game-contract-touching deltas (D15/D16/D7) and their scope syncs; everything else editor-only chrome with byte-identical export.
**Verify**: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test`; read `docs/engines.md` against the running app; `git diff --stat src/ksa/enginePhysics.ts` → empty.

— end of phases 6–7 —


---

## Phase 8 — Surface mode + Asset Manager + import pipeline

## Phase 8 — Surface mode + Asset Manager + import pipeline

**Design sources**: design-surface-assets.md (ALL — D1–D12, §1–§9; the area's binding
spec), foundation.md §2.4/§2.5 (mode entry/exit + jumps), §3 (Add tree), §5.1–§5.2
(notification routing), §8.5 (Surface right sidebar — LOCKED), §7.5 (Surface left card),
§10.1 (DialogViewStack, no modal-in-modal), §10.3 (Asset Manager), §10.4 (Import Review),
§10.7 (Settings homes), §11.1–§11.2 (hotkey scopes incl. `surface:glow-paint`), §14.3
(confirm policy), §15.5 (Surface wireframe); FINAL_DESIGN_INDEX.md (hotkey rows for `5`,
`⇧⌘A`, `surface:glow-paint`); design-projects-export.md §1.5 (namespacing contract —
adopted BY REFERENCE, lands in P9); design-system-services.md §2.4 (`notify()`).

**Census sources**: analysis/flexo-v2-feature-census/custom-assets.md (primary — §1
feature inventory 1.1–1.24, §4 pains, **§5 constraints restated below as guardrails**,
§7 cross-area deps), catalog-placement-layers.md, export-integration.md, shell-layout.md.

**Entry state**: P0–P7 landed. The shell exists: kit primitives incl. `DialogViewStack`
and `InlineConfirmStrip` (P0), docked layout + `layoutStore` (P1), command registry +
MenuSpec menubar + `dialogStore` + ⌘K palette (P2 — existing dialogs open via dialog ids;
the `⇧⌘A` global chord and Window ▸ Asset Manager… menu row exist as commands, currently
pointing at the v1 CustomAssetsModal or a disabled stub), status bar + `statusStore`/
`notificationStore` + `toast()`/`notify()` routing (P3), `modeStore` with all five modes +
scoped hotkey registry v2 (P4 — Surface mode is selectable but its sidebars show
placeholder/rehosted v1 content), Build mode complete (P5A/P5B: Outliner, left focus
editors, Add menu per foundation §3), Data (P6) and Engine (P7) complete. The v1
custom-asset surfaces still function as rehosted: `ManageTexturesPanel` (floating,
`$managingMeshId`), `GlowPaintDialog` (`$glowPaintMeshId`), `CustomAssetsModal`,
`ImportModelDialog` (`$importModelRequest`), `ImportReportCard` (`$importReport`),
`CustomTextureDialog`, `CreateMeshDialog`, `MaterialDialog`, `ViewportDropZone` — all
mounted at app root (code: src/app.tsx:63,121-132).

**Exit state**: Surface mode is fully functional per §15.5 (picker + full surface editor
right; face card + built-in card left; template-scoped face highlight in the viewport);
the Asset Manager overlay (⇧⌘A) replaces CustomAssetsModal; the Import Review dialog (L,
`import-review`) replaces ImportModelDialog's hosting with the D11 structural split; the
import report is a notification-center rich entry; ManageTexturesPanel, CustomAssetsModal,
ImportReportCard and their driver atoms are deleted; `decimateViewMeshes` + kitten texture
mode live in Settings → Import & Export; phone variants work. App runnable at every task
boundary; v1 surfaces keep working until their replacement task deletes them (P8.24).

**Cross-phase seams (explicit)**:
- **P9 — per-project asset namespacing (D5, §7.3)**: the `pa:<projectId>:<kind>:<assetId>`
  key scheme, boot purge, project-delete range sweep, duplicate-copies-blobs, and
  `listProjectBlobs(projectId)` are OWNED by design-projects-export.md §1.5 and land in
  **Phase 9**. Phase 8's obligation is purely structural: every new surface written in
  this phase reads/writes blobs ONLY through `customAssetStore` helpers and `assetKeys`
  (code: src/state/assetDb.ts:83 `assetKeys`) — never a literal key string — so P9 can
  swap the scheme inside `assetKeys` in one module. P8.26 audits this.
- **P10 — export surfaces**: the D10 export pre-flight info row ("N custom meshes have no
  placements…") and the D4 read-only Export-dialog chips (kitten texture mode, `_VM`
  decimation) are the export area's tasks (P10, foundation §10.6). Phase 8 supplies the
  `$unplacedCustomMeshes` selector (P8.02) and the Settings single-home (P8.23) they
  consume.
- **`hasCustomAssets` gate removal** (§7.3, parity row 1.23) belongs to P9's archive work.
  Phase 8 does not touch `projectTransfer.hasCustomAssets` (code:
  src/state/projectTransfer.ts:155).

**Binding guardrails — census §5 constraints restated (implementation MUST NOT alter)**
(census: custom-assets.md §5; design: design-surface-assets.md §4, §9 last row):
1. One SubPart = one mesh = one glTF primitive = one material; multi-material models split
   at import; merge only when single-material (`canMerge`, code: src/ksa/importPlan.ts:192).
2. GLB `meshes[i].name` == SubPart id (`nameMeshesFromNodes`, code:
   src/ksa/exportGlb.ts:230); `subPartId` == GLB node name == Assets.xml id; decoupled
   from display name; survives rename and replace-import.
3. KTX2 tags are UNORM + linear even for sRGB content; `ensureCurrentKtx2` legacy
   re-encode kept (code: src/state/customAssetStore.ts:1815).
4. Normal maps: OpenGL/glTF convention in, X-flip at encode, strength baked into RG.
5. ORM packing R=AO/G=rough/B=metal; packed ORM overrides separate channels identically
   in preview and export.
6. Emissive is WHITE-only; glow color bakes into diffuse via the shared
   `compositeGlow` (code: src/ktx/glowComposite.ts:127); coverage and strength stay
   independent sliders; >0.6 washout warning verbatim; "Add Matching Light" is the only
   colored-light path.
7. Glass: `<PartModelGlass>` fixed shader; glassGlow layered export kitten-only; imported
   render-as-glass keeps its deliberate opaque editor preview.
8. `_VM` view meshes keep indices AND normals; export uses RAW indexed geometry via
   `getImportedRawGeometry` (code: src/three/importedMeshCache.ts:112) — never the
   tangented editor cache.
9. One-undo-step batching for import/part-ify/replace: binaries written BEFORE the single
   `mutate()`; undo restores descriptors, never bytes.
10. Reference-counted GC only on remove/replace (`planOrphanedAssets`, code:
    src/state/customAssetStore.ts:1310); unassigned assets are never auto-collected.
11. Replace-import match key `(sourceNode, sourceMaterial)`; matched SubParts keep
    `id`+`subPartId`+arranged placements.
12. `meshKind()` discrimination — every consumer switches on it, never `primitive!`
    (code: src/ksa/types.ts:1958 `meshKind`).
13. Sticky vs per-import split: scale/prefix/double-sided/bake-transforms/merge NEVER
    persist; up-axis/texture-cap/bakeScale/decimateViewMeshes persist (code:
    src/state/settingsStore.ts:246 `ModelImportSettings` — the doc comment is the rationale).
14. ALL numeric fields: `useNumberDraft` + `inputMode="url"` (code: src/ui/numberDraft.ts).
15. Preview == export single code path (§4): only extend `glowComposite`/`glowRamp`,
    `prepareChannelImage`/`encodeKtx2`, `applyFaceUvTransforms`, `buildMeshAtlasGlb` — no
    new preview math anywhere in this phase.

**Game-contract note (scope/ sync)**: this phase changes editor chrome only — exported
XML/GLB bytes are identical before and after (guardrail 15). No `scope/*.md` contract
change is required; P8.27 verifies this and fixes stale UI-surface names in
`scope/custom-assets-and-mod-export.md` prose if any.

**Phase verification**:
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` all green.
2. Manual: press `5` → Surface mode; pick each mesh kind (primitive/imported/kitten);
   rename a mesh, resize a box (placements survive), assign a material, edit a face UV
   (live preview while typing, one undo step on commit), paint glow (⌘Z undoes a stroke,
   Apply = one document undo step), toggle visor surface; ⇧⌘A → Asset Manager: every
   category lists with thumbnails and per-kind counts, where-used chips navigate, Unused
   filter works, delete confirms carry the byte warning; drop a .glb on the viewport →
   Review (per-import options reset, `≠1` badge), import → rich notification names
   removed SubParts (replace mode); Make Kitten Mesh switches to Build with the flash.
3. Death check: `grep -rn "CustomAssetsModal\|ManageTexturesPanel\|ImportReportCard\|\$managingMeshId\|\$glowPaintMeshId\|\$importReport\b" src/` → no hits.
4. Phone (<640px): Surface tab, manager cover, import cover, glow paint sheet all usable.

---

#### P8.01 — Surface sub-state in modeStore + entry/exit choreography
**Goal**: Add `$surfaceMeshId`/`$surfaceFace` mode sub-state with `$part` clamping, the
Surface entry/exit choreography in `setMode`, and the derived `faceHighlight` view flag.
**Files**:
- modify `src/state/modeStore.ts` (created in P4)
- modify/create `src/state/modeStore.test.ts`
**Depends on**: none.
**Spec**: (design: design-surface-assets.md §1.1; foundation §2.4)
```ts
// modeStore — surface sub-state (ephemeral; NO react/three imports — state layering)
export const $surfaceMeshId = atom<string | null>(null); // CustomMesh.id
export const $surfaceFace = atom<string | null>(null);   // face key or null
export const $faceHighlight = computed(
  [$mode, $surfaceMeshId, $surfaceFace, $part],
  (mode, meshId, faceKey, part): { meshId: string; faceKey: string | null } | null => {
    if (mode !== 'surface' || !meshId) return null;
    if (!part.customMeshes.some((m) => m.id === meshId)) return null;
    return { meshId, faceKey };
  },
);
export function pickSurfaceMesh(id: string | null): void; // sets mesh; face → first valid key
export function pickSurfaceFace(key: string | null): void;
```
- **Clamping**: a `$part` subscription nulls `$surfaceMeshId` when the mesh no longer
  exists (undo past creation, remove-import); `$surfaceFace` re-validates against
  `PRIMITIVE_FACE_KEYS[kind]` (code: src/three/primitives.ts:96) and falls back to the
  first key; non-primitives (imported/kitten) → `null`; sphere/plane → `'all'`.
- **Entry** (`setMode('surface')`, extend the P4 choreography switch): if the current
  selection contains a custom-mesh placement, auto-pick its template (resolve placement
  `subPartTemplateId` → `customMeshes.find(m => m.subPartId === templateId)`); else
  restore the surviving `$surfaceMeshId`; else leave null (picker empty state). Accept an
  optional jump payload `{surfaceMeshId, surfaceFace?}` following the same jump-payload
  mechanism P6 built for Data scope (foundation §2.4 "cross-mode jump payload always wins").
- **Exit**: `$faceHighlight` goes null via the computed; close the glow-paint dialog via
  its normal cancel semantics if open (call the dialogStore close for id `'glow-paint'` —
  the dialog's own dirty-confirm hook handles unsaved strokes, P8.12); `$surfaceMeshId`
  survives for return.
- Never undo-tracked; never persisted (design §1.8 last row).
**Verify**: `pnpm typecheck`; new tests in modeStore.test.ts: "surface pick clamps when
mesh removed", "face falls back to first key on kind change", "entry auto-picks from
selected custom placement", "exit preserves picked mesh"; `pnpm test`.

#### P8.02 — customAssetStore: `$assetUsage`, `$unplacedCustomMeshes`, `renameCustomTexture`, `replaceTextureImage`, streaming-glow mutator
**Goal**: Land the store-level additions every Phase-8 surface reads: the reverse-reference
graph, the unplaced-template selector, texture rename, texture byte replacement, and a
streaming variant for glow sliders.
**Files**:
- modify `src/state/customAssetStore.ts`
- modify `src/state/customAssetStore.test.ts`
**Depends on**: none.
**Spec**: (design: design-surface-assets.md §2.4, §7.1, D10; census: custom-assets.md
pains #6/#12/#14)
- `$assetUsage` computed from `$part` (shape verbatim from design §2.4):
```ts
export const $assetUsage = computed([$part], (part) => ({
  texture: Map<string, { faces: { meshId: string; faceKey: string }[]; materials: { matId: string; slot: string }[] }>,
  material: Map<string, { meshes: string[] }>,
  mesh: Map<string, { placements: number; layers: string[] }>,
}));
```
  Build it from the same graph `planOrphanedAssets` walks (code:
  src/state/customAssetStore.ts:1310) — face refs from `CustomMesh.faceTextures`, material
  channel refs from the material's map slots (reuse/extract the texture-id enumeration the
  GC uses), placements from `part.placements` matched on `subPartId`, layers from the
  placements' layer ids. Pure; no react imports (layering).
- `$unplacedCustomMeshes = computed([$part], part => CustomMesh[])` — meshes whose
  `subPartId` appears in zero placements (mirrors the export skip at code:
  src/ksa/modExport.ts:807-808 `placed`/filter). Feeds picker/manager ⚠ chips (D10);
  **P10.01** adds the export pre-flight `info` row over the same zero-placement rule
  (its pure `exportIssues.ts` re-derives it from `part` — keep the two predicates
  identical).
- `renameCustomTexture(id, name)` — `mutate('rename texture', name, …)` patching the
  descriptor's `name` only. **Undo: discrete** (one step). (Pattern: `mutate`, code:
  src/state/customAssetStore.ts:241.)
- `replaceTextureImage(id, file)` — async; decode + `prepareChannelImage` +
  `encodeImageToKtx2` under the texture's EXISTING channel and id, overwrite both blobs
  via `putAsset(assetKeys.textureSource(id))` / `assetKeys.textureKtx2(id)`, refresh the
  two URL maps + `publishTextureUrls()` (code: src/state/customAssetStore.ts:127), then
  one `mutate('replace texture image', …)` patching `width/height` in the descriptor.
  Follow `createTextureAsset` (code: src/state/customAssetStore.ts:759) for the encode
  sequence and `setTextureChannel` (code: :802) for the re-encode-in-place pattern.
  **Undo: discrete for the descriptor; bytes overwritten — NOT restored by undo** (D3;
  callers must always confirm, P8.19).
- Streaming glow support: add
  `setMeshGlowStreaming(meshId, patch: Partial<EmissiveConfig>, first: boolean)` — when
  `first`, behaves exactly like `setMeshGlow`'s mutate (pushUndo once); otherwise applies
  the patch to `$part` WITHOUT a new undo step (extract an internal
  `mutateMaybeUndo(desc, detail, pushStep, fn)` from `mutate`, code: :241). Same for the
  visor tint if implemented via `setMeshGlass` — add the matching
  `setMeshGlassStreaming`. This implements the design's "streaming — one push at
  interaction start" row (design §1.8) without letting UI components touch `$part` directly.
**Verify**: `pnpm typecheck`; customAssetStore.test.ts new cases: "$assetUsage counts
faces+materials+placements", "$unplacedCustomMeshes lists zero-placement templates only",
"renameCustomTexture is one undo step and keeps subPart references intact",
"replaceTextureImage keeps id+channel and updates dimensions",
"setMeshGlowStreaming(first=true) pushes exactly one undo entry across a drag"; `pnpm test`.

#### P8.03 — Shared offscreen thumbnail renderer (`three/assetThumbs.ts`)
**Goal**: One WebGL context that renders material preview-spheres and mesh turntable
stills for every card/select swatch — never one context per row.
**Files**:
- create `src/three/assetThumbs.ts`
- create `src/three/assetThumbs.test.ts`
**Depends on**: none.
**Spec**: (design: design-surface-assets.md §2.1 "Thumbnails"; census: custom-assets.md
pain #4 + the MaterialPreview-per-dialog cost)
- Module owns ONE `THREE.WebGLRenderer` (offscreen canvas, ~96×96 output), one
  RoomEnvironment PMREM (copy the setup from `MaterialPreview`, code:
  src/ui/MaterialDialog.tsx:437 `MaterialPreview`, and `SubPartPreviewViewport`, code:
  src/three/SubPartPreviewViewport.ts:23). API:
```ts
export type ThumbKind = 'material' | 'mesh';
export function thumbSignature(kind: ThumbKind, id: string, part: EditingPart): string; // pure
export function requestThumb(kind: ThumbKind, id: string, sig: string): void;           // enqueue
export const $thumbUrls = atom<Record<string, string>>({});                             // sig → blob URL
```
- `thumbSignature` is a PURE function (unit-testable, no three imports in its own
  helper — put it in the same file but free of renderer state): material = stable JSON of
  the resolved channel set (colors/factors/texture ids/normal strength); mesh = the
  per-mesh slice of what `meshSignature` hashes (code: src/state/customAssetStore.ts:301)
  — kind + params/import ref + materialId + faceTextures + emissive/glass/surface.
- Render queue drains on `requestIdleCallback` (fallback `setTimeout 50ms`), one thumb
  per tick; cache `Map<sig, blobUrl>` session-only; re-request with a new sig renders a
  new entry and revokes the old URL. Material thumb = preview sphere with the material's
  resolved channels (reuse the resolver path the render cache uses — do NOT reimplement
  channel semantics, guardrail 15); mesh thumb = the mesh's geometry+materials from
  `customMeshRenderCache` (code: src/state/customAssetStore.ts:138) on a fixed 3/4
  turntable angle. Missing cache entry → skip (caller shows the kind-glyph placeholder).
- Texture thumbnails do NOT go through this module — they are plain `<img>` from
  `$customTextureUrls` (code: src/state/customAssetStore.ts:117).
- On-demand only: rendering happens in the idle queue, never in a rAF loop (foundation
  §14.5).
**Verify**: `pnpm typecheck`; assetThumbs.test.ts: "thumbSignature changes when a material
channel changes and is stable otherwise", "mesh signature changes on primitive resize /
face texture change" (pure-function tests; no WebGL in vitest); `pnpm test`. Manual (after
P8.14): scroll a 20-asset grid — exactly one WebGL context (devtools).

#### P8.04 — Viewport face highlight + click-to-pick (template-scoped, D12)
**Goal**: The selected face tints on every placement of the picked mesh; clicking a
custom-mesh placement in Surface mode picks its template and the face under the cursor.
**Files**:
- modify `src/three/SubPartObject.ts`
- modify `src/three/EditorScene.ts`
**Depends on**: P8.01.
**Spec**: (design: design-surface-assets.md §1.5, D12; foundation §2.3 item 3)
- `SubPartObject.setFaceHighlight(groupIndex: number | null, whole: boolean)`: tint via
  the same per-instance-cloned-material emissive mechanism as `setSelected` (code:
  src/three/SubPartObject.ts:103 `setSelected` — materials are already per-instance
  clones, :62). `whole` tints all materials (sphere/plane `'all'`, imported/kitten);
  otherwise only `materials[groupIndex]`. Use the accent highlight color family from
  `highlightSettings` (code: src/three/highlightSettings.ts) — pick a distinct tint from
  selection so both can show at once; restore base emissives on clear (the
  `baseEmissives` array already exists, code: src/three/SubPartObject.ts:41).
- Face key → group index: `PRIMITIVE_FACE_KEYS[kind].indexOf(faceKey)` — the array order
  IS the three.js group materialIndex order (documented at code:
  src/three/primitives.ts:88-101).
- `EditorScene`: subscribe `this.sub($faceHighlight, …)` (pattern: code:
  src/three/EditorScene.ts:478) — on change, walk the placement objects of the picked
  mesh's `subPartId` and apply/clear `setFaceHighlight`; invalidate on-demand render
  (foundation §14.5 — no continuous loop).
- **Click-to-pick** (Surface mode only, gate on `$mode`): after the normal selection
  raycast resolves a custom-mesh placement hit (locked/hidden guards unchanged), also
  `pickSurfaceMesh(mesh.id)`; for primitives resolve the hit triangle's geometry group →
  face key → `pickSurfaceFace(key)` (raycast intersection `face.materialIndex` maps
  through `PRIMITIVE_FACE_KEYS`). Built-in entity click = normal selection only.
  Empty-click clears selection but NOT `$surfaceMeshId`/`$surfaceFace` (mode sub-state,
  not selection — design §1.5).
- Register the Surface status-bar contribution via the P3/P4 mode-segment mechanism:
  context chip `mesh: <name> · face <label>` (click → focus/scroll the picker to the mesh
  — expose a tiny `$surfaceRevealRequest` atom or callback the sidebar consumes), and the
  modifier-hint provider while hovering a custom placement: `⌥ Duplicate drag · click
  Pick face` (design §1.5).
**Verify**: `pnpm typecheck`; manual: place a box twice, enter Surface, select face `+X`
→ both placements tint that face; click a cylinder placement's side → picks mesh + `side`;
undo past mesh creation → highlight clears without errors (P8.01 clamp). `pnpm test`
(existing three tests stay green).

#### P8.05 — SurfaceSidebar shell + mesh picker
**Goal**: Mount the Surface right sidebar (mode primary): slim header + pinned mesh
picker with search, kind chips, instance counts, ⚠ unplaced chip, ＋ add-instance, and the
creation empty state.
**Files**:
- create `src/ui/surface/SurfaceSidebar.tsx`
- create `src/ui/surface/MeshPicker.tsx`
- modify the P4 mode→right-sidebar registry (wherever P4 mapped modes to sidebar
  components) to mount `SurfaceSidebar` for `'surface'`
**Depends on**: P8.01, P8.02.
**Spec**: (design: design-surface-assets.md §1.3 "Meshes"; foundation §8.5 item 1, §15.5)
- Header: `◧ Surface` + action button "Asset Manager… ⇧⌘A" → runs command
  `window.assetManager` (P2.09's CANONICAL id, ⇧⌘A bound in P2.12; P8.14 re-points it at
  the new dialog — until then it opens the v1 CustomAssetsModal as P2 wired it).
- Picker rows from `$part.customMeshes` — ALL kinds incl. kitten (D6). Row: kind chip
  `prim`/`import`/`kitten` (use `meshKind`, code: src/ksa/types.ts:1958), placed count
  `×N` from `$assetUsage.mesh` (P8.02), ⚠ chip + tooltip "No placements — won't export"
  when in `$unplacedCustomMeshes` (D10), `＋` button → `addSubPart(mesh.subPartId)`
  (code: src/state/editorStore.ts:561 — active layer, origin, selects + reveals; discrete
  undo inside addSubPart, "add subpart") WITHOUT leaving Surface mode, then status flash
  `Instance added to layer <name>` via `toast()`.
- Row click → `pickSurfaceMesh(id)` + scroll editor body to top. Picked row gets the
  accent style. Fuzzy search over `name` + `subPartId` (reuse the fuzzy helper the
  Outliner/palette use from P2/P5). Honor `$surfaceRevealRequest` from P8.04 (scroll +
  flash the row).
- `＋ New Mesh ▾` menu: Primitive… (`assets.newPrimitiveMesh` → dialog `'create-mesh'`) /
  Import Model… (`assets.importModel`) / Make Kitten Mesh ▸ Hunter/Polaris/Banjo
  (`assets.makeKittenMesh.<kind>`). Empty state (zero custom meshes): icon + "No custom
  meshes yet — build one:" + the three creation buttons (D1 verbatim).
- Editor body below the picker renders section placeholders until P8.06–P8.10 fill them;
  ship it with just Identity's header stub so this task compiles standalone. Dense
  `SidebarSection` styling per the shell conventions (`xs` controls, sticky headers).
**Verify**: `pnpm typecheck`; manual: `5` → picker lists all three kinds with counts,
search filters, ＋ adds an instance on the active layer and flashes, 0-instance template
shows ⚠ and stays listed (pain #15 fixed), empty state buttons open the right dialogs.

#### P8.06 — Identity section (rename + post-creation primitive params)
**Goal**: Close the census 1.9 UI gap: rename any custom mesh and edit primitive
dimensions after creation, placements surviving.
**Files**:
- create `src/ui/surface/IdentitySection.tsx`
- modify `src/ui/surface/SurfaceSidebar.tsx` (mount)
**Depends on**: P8.05.
**Spec**: (design: design-surface-assets.md §1.3 "Identity"; census: custom-assets.md
§1.9, pain #5)
- `Name` TextField → on blur/Enter commit `updateCustomMesh(id, {name})` (code:
  src/state/customAssetStore.ts:1673). **Undo: discrete** — one step "rename mesh".
  Display-name only; `subPartId` never changes (guardrail 2).
- `SubPart id` read-only mono row, copy-on-click (writes clipboard + status flash),
  caption per design ("== GLB node name == Assets.xml id").
- Kind caption: `Primitive · Box` / `Imported glTF` / `Kitten · <kind>` (labels via
  `PRIMITIVE_LABELS`, code: src/three/primitives.ts:79).
- Primitive params (primitives only) — per-kind field sets exactly as CreateMeshDialog's
  (code: src/ui/CreateMeshDialog.tsx:127,197 `ParamNumberField`): box Width/Height/Depth
  (m); cylinder Radius/Height (m) + Radial segments; sphere Radius (m) + Segments; plane
  Width/Height (m). Every field **`useNumberDraft` + `inputMode="url"`** via the
  `PreciseNumberInput` kit component (P0) — never `Number(v)`. Commit →
  `updateCustomMesh(id, {primitive})`. **Undo: discrete** — one step "resize mesh"; the
  atlas rebuild is automatic via the mesh-signature diff (code:
  src/state/customAssetStore.ts:301 `meshSignature`) — do NOT add manual rebuild calls.
**Verify**: `pnpm typecheck`; customAssetStore.test.ts already covers `updateCustomMesh`
patches — add "primitive patch keeps placements + subPartId". Manual: resize a placed
box → both placements update, undo restores size; type `.06` and `-` mid-edit (draft
tolerance), Esc reverts the field.

#### P8.07 — MaterialDialog rehost (dialog id `material`) + Material section
**Goal**: MaterialDialog becomes a root-mounted overlay dialog opened via dialogStore
(D9 host #1), its texture selects gain thumbnail swatches, and the Surface sidebar gets
the Material assign section.
**Files**:
- modify `src/ui/MaterialDialog.tsx` (export `MaterialForm` guts + dialogStore host)
- create `src/ui/surface/MaterialSection.tsx`
- modify `src/ui/surface/SurfaceSidebar.tsx` (mount)
**Depends on**: P8.05.
**Spec**: (design: design-surface-assets.md §1.3 "Material", D9; census: custom-assets.md
§1.4/§1.6)
- Refactor `MaterialDialog.tsx`: extract the form guts (name, base-color mode
  color/image, metal/rough sliders + 9 `MATERIAL_PRESETS` (code:
  src/ui/MaterialDialog.tsx:394), Advanced maps disclosure — normal map + strength 0–2,
  packed ORM with its "overrides AO/rough/metal maps" caption, AO/rough/metal selects
  filtered by declared channel, live `MaterialPreview` sphere) into an exported
  `MaterialForm({materialId?, onSaved})`. Guts UNCHANGED (parity row 1.4) except: every
  texture `Select` item gains a 24px `<img>` swatch from `$customTextureUrls` (pain #4).
  Replace `MaterialPreview`'s private renderer with a live-preview call into
  `three/assetThumbs`? **No** — keep the dialog's own live preview renderer (it must
  update per keystroke; the shared queue is for cards). DEVIATION: none — design only
  mandates the shared renderer for manager cards (§2.1).
- New host: dialog id `'material'`, params `{materialId?: string; assignToMeshId?: string}`;
  `$openDialog = {id:'material', params}` opens it as a normal overlay (S/M). On create
  with `assignToMeshId`, auto-assign via `setMeshMaterial` (v1 behavior kept — census
  §1.4 path 3). Save = `addCustomMaterial`/`updateCustomMaterial` (code:
  src/state/customAssetStore.ts:883/:895). **Undo: discrete** (one step per save, as
  today). Keep the v1 prop-driven mounts working until P8.24 deletes their hosts.
- `MaterialSection`: assign `Select` listing `customMaterials` + "(none)" →
  `setMeshMaterial(id, matId|null)` (code: :920; **discrete undo**); `✎ Edit` / `＋ New`
  open dialog `'material'` with `assignToMeshId: mesh.id`. First-face-texture-wins
  warning when >1 distinct face texture — wording verbatim from v1 (code:
  src/ui/ManageTexturesPanel.tsx:343-347).
**Verify**: `pnpm typecheck`; manual: create material from Surface sidebar → auto-assigns;
edit → live sphere updates; swatches visible in map selects; warning appears with two
different face textures. `pnpm test`.

#### P8.08 — Faces section (chip row)
**Goal**: Face-key chips on the picked primitive drive `$surfaceFace` (editor lives in
the left card).
**Files**:
- create `src/ui/surface/FacesSection.tsx`
- modify `src/ui/surface/SurfaceSidebar.tsx` (mount)
**Depends on**: P8.05.
**Spec**: (design: design-surface-assets.md §1.3 "Faces")
- Render only for primitives with >1 face key (hidden for sphere/plane and for
  imported/kitten — they have no face config). Chips from `PRIMITIVE_FACE_KEYS[kind]`,
  tooltip labels from `FACE_LABELS` (code: src/three/primitives.ts:96,104). Click =
  `pickSurfaceFace(key)`; clicking the active chip deselects (null). Dot marker on chips
  whose key exists in `mesh.faceTextures`. Caption: "(edits in the left Face card)".
- No document mutation here — sub-state only, never undo (design §1.8).
**Verify**: `pnpm typecheck`; manual: chips mirror viewport face highlight (P8.04) both
directions; sphere shows no section.

#### P8.09 — Glow section (modes, ramp, sliders, Add Matching Light)
**Goal**: Rehost the full v1 glow inventory into the Surface sidebar with the designed
undo split.
**Files**:
- create `src/ui/surface/GlowSection.tsx` (move/adapt `GlowSettings`, `GlowRampEditor`,
  `AddMatchingLightButton`, `GlowModeControls` from `src/ui/ManageTexturesPanel.tsx`
  — guts verbatim, host restyled)
- modify `src/ui/surface/SurfaceSidebar.tsx` (mount)
**Depends on**: P8.05, P8.02.
**Spec**: (design: design-surface-assets.md §1.3 "Glow"; census: custom-assets.md §1.11;
guardrail 6)
- Rehost from ManageTexturesPanel (code: src/ui/ManageTexturesPanel.tsx:407 `GlowSection`,
  :448 `GlowSettings`, :609 `GlowRampEditor`, :515 `AddMatchingLightButton`, :566
  `GlowModeControls`) — keep ALL semantics: Mode Off/Whole/Painted via `setMeshGlow`
  (code: src/state/customAssetStore.ts:1703; Off deletes `emissive`); color swatch → kit
  color popover (ignored-when-ramp caption); Coverage 0–1; Emissive 0–1 with the washout
  warning above `GLOW_WASHOUT_STRENGTH = 0.6` — wording verbatim (code:
  src/ui/ManageTexturesPanel.tsx:74,:499); ramp bar with draggable stops (≥2 enforced,
  click-bar-adds-stop, per-stop popover color + `at` numeric + delete), `GLOW_RAMP_PRESETS`
  menu (code: src/ktx/glowRamp.ts:175 — list retained verbatim), "Import from image…"
  (`glowRampFromImage` middle row, code: src/ktx/glowRamp.ts:101).
- **Undo enrollment** (design §1.8): mode change / ramp edits / color pick = **discrete**
  (each a `setMeshGlow` step). Coverage/Emissive **sliders = streaming**: on slider
  `onChange` first-event of an interaction call `setMeshGlowStreaming(patch, true)` then
  `(…, false)` for the rest; interaction boundary = react-aria Slider onChangeEnd resets
  the "first" latch (P8.02 mutator).
- Per-stop `at` numeric field: `useNumberDraft` + `inputMode="url"` (0–1 clamp).
- `[Edit paint…]` (Painted mode only) → `$openDialog = {id:'glow-paint',
  params:{meshId}}` (P8.12).
- `[Add Matching Light]` → `addLight(null, {…seed from glow color, point type})` exactly
  as v1's `AddMatchingLightButton` (code: src/ui/ManageTexturesPanel.tsx:515; store code:
  src/state/editorStore.ts:2712 `addLight` — **discrete undo** inside addLight), select
  it, status flash `Light added — edit in Build mode [Go →]` with the jump action
  (`setMode('build')`). Section help tooltip states both facts: KSA emissive is
  white-only; this is the only colored-light path.
- Preview==export: all changes flow through the signature-diff rebuild →
  `compositeGlow` (code: src/ktx/glowComposite.ts:127) — add NO preview math (guardrail 15).
**Verify**: `pnpm typecheck`; customAssetStore.test.ts: "streaming glow drag = one undo
step" (from P8.02) stays green; manual: drag Emissive past 0.6 → warning; whole-mesh glow
updates viewport live; Add Matching Light creates a selected point light with the glow
color and one undo step.

#### P8.10 — Visor Surface + Imported sections
**Goal**: Glass-capable kitten controls and imported-mesh provenance/actions in the
sidebar.
**Files**:
- create `src/ui/surface/VisorSection.tsx`, `src/ui/surface/ImportedSection.tsx`
  (adapt `VisorSurfaceControls`, `TintField`, `ImportedSection`/`ProvenanceRow` from
  `src/ui/ManageTexturesPanel.tsx:533,:424,:371,:395`)
- modify `src/ui/surface/SurfaceSidebar.tsx` (mount)
**Depends on**: P8.05, P8.09.
**Spec**: (design: design-surface-assets.md §1.3 "Visor Surface"/"Imported"; census:
custom-assets.md §1.13/§1.14; guardrail 7)
- **Visor** (only when `mesh.kitten?.transparent`): Surface select Glass / Glow (opaque)
  / Glass + Glow → `setMeshSurface` (code: src/state/customAssetStore.ts:1750,
  **discrete undo**); Tint = `ColorAlphaField` (code: src/ui/ColorAlphaField.tsx) →
  `setMeshGlass` (code: :1712) — tint+opacity default 0.45, caption "in-game opacity is
  engine-fixed ≈0.75"; tint drag = **streaming** via `setMeshGlassStreaming` (P8.02).
  `Simulate in-game glass` Switch → global `$simulateGlass` (code:
  src/state/settingsStore.ts:281) labeled "(global)" — preview preference, **never
  undo**; mirrored in Settings → Scene (**P9.17b builds that mirror row** — no work here).
  Glow controls reuse P8.09's section (glassGlow shows both — v1 logic, code:
  src/ui/ManageTexturesPanel.tsx:557).
- **Imported** (imported only): provenance line `sourceFile · node sourceNode · mat
  sourceMaterial · N tri · N vtx` from `ImportedMeshSource` (code:
  src/ksa/types.ts:1764); `Render as glass` Switch → `setMeshTransparent` (code:
  src/state/customAssetStore.ts:1732, **discrete undo**) with the deliberate-opaque
  one-liner kept verbatim (census §1.14); batch actions `[Replace…]` →
  `openImportModel([], importId)` (replace mode — jump per D8; after P8.20 this routes to
  the new dialog) and `[Remove import…]` → the byte-deletion confirm (P8.19 wording) →
  `removeImport` (code: :1390).
**Verify**: `pnpm typecheck`; manual: part-ify a hunter kitten, pick the visor → visor
section shows; switch Glass+Glow → both glow and tint editable; simulate-glass toggles
globally and is NOT an undo step; imported mesh shows provenance and both batch actions.

#### P8.11 — Left sidebar: Face card + Built-in surface card + empty state
**Goal**: The Surface left focus editor: face texture/wrap/UV editing with
live-draft-preview-commit-discrete, the read-only built-in surface card (D7), and the
mode cheat-card empty state.
**Files**:
- create `src/ui/surface/SurfaceFaceCard.tsx`, `src/ui/surface/BuiltInSurfaceCard.tsx`,
  `src/ui/surface/SurfaceLeftPanel.tsx`
- modify `src/state/modeStore.ts` (add `$faceDraft` scene-report atom)
- modify `src/three/EditorScene.ts` (consume `$faceDraft`)
- modify the P5B left-sidebar ruleset registry (mount `SurfaceLeftPanel` for `'surface'`)
**Depends on**: P8.01, P8.04, P8.05.
**Spec**: (design: design-surface-assets.md §1.4; foundation §7.5; census:
custom-assets.md §1.10)
- Stack top→bottom: Face card (when `$surfaceFace` ≠ null on a primitive) → standard
  Build selection inspector (mount the P5B focus card component whenever a placement is
  selected; its ⋮ gains "Open in Build mode →" = `setMode('build')`) → Built-in surface
  card (when the selection is a built-in SubPart) → empty-state cheat card when none
  apply.
- **Face card**: Texture Select filtered to `channel === 'baseColor'` + "(none)" with
  thumbnail swatches ($customTextureUrls); Wrap Select Repeat/Mirror/Clamp (labels as v1,
  code: src/ui/ManageTexturesPanel.tsx:66-71); UV scale X/Y + offset X/Y —
  `PreciseNumberInput` (`useNumberDraft` + `inputMode="url"`; v1 pattern code:
  src/ui/ManageTexturesPanel.tsx:720 `UvNumberField`). **Preview vs commit** (design
  §1.4, binding): as the user TYPES, publish `$faceDraft = {meshId, faceKey, cfg}` —
  EditorScene applies the draft UV transform to the picked mesh's render materials
  view-only (through `applyFaceUvTransforms` math on a cloned geometry or a
  texture-matrix equivalent — reuse the transform function, guardrail 15) and
  invalidates; the DOCUMENT commit fires on field commit (Enter/blur) via
  `updateMeshFaceConfig` (code: src/state/customAssetStore.ts:1686) = **one discrete
  undo step**; commit or Esc clears `$faceDraft`. Texture/wrap Selects commit
  immediately (**discrete**).
- `Copy to all faces` writes the current face's config to every key —
  ONE `mutate` step (extend `updateMeshFaceConfig` or add
  `copyFaceConfigToAll(meshId, faceKey)` in customAssetStore; **discrete undo**).
  `Clear face` removes the entry (**discrete**).
- **Built-in surface card** (D7): read-only — template id, `materialId`, thumbnails from
  `CatalogSubPart.diffuseUrl/normalUrl/aoRoughMetalUrl/emissiveUrl` (code:
  src/ksa/catalog.ts:16 `CatalogSubPart`), source XML file if present; ⓘ line verbatim
  from design §1.4 (explains why + names the two authoring paths). No editor.
- **Empty state**: cheat card text + hotkeys (`5`, `⇧⌘A`, `F`) + `[Pick a mesh →]`
  (focuses picker search via `$surfaceRevealRequest`) / `[New Primitive Mesh…]` /
  `[Import Model…]`.
**Verify**: `pnpm typecheck`; customAssetStore.test.ts: "copyFaceConfigToAll is one undo
step covering all keys". Manual: type in UV scale → viewport updates live per keystroke,
ONE undo step after Enter; Esc mid-edit reverts field and preview; select a Core SubPart
→ built-in card with thumbs; empty state buttons work.

#### P8.12 — GlowPaintDialog upgrade (stroke undo, underlay, live preview, dialog id)
**Goal**: Per-stroke ⌘Z inside the paint dialog (surface-scoped), composited-diffuse
underlay, live 3D preview on stroke end, dialogStore hosting, dirty-discard confirm.
**Files**:
- modify `src/ui/GlowPaintDialog.tsx`
- modify `src/ui/hotkeys/registry.ts` (scope `surface:glow-paint` bindings)
- modify `src/state/customAssetStore.ts` (delete `$glowPaintMeshId`/`setGlowPaintMeshId`
  after re-pointing)
**Depends on**: P8.09.
**Spec**: (design: design-surface-assets.md §1.6, D2; foundation §11.1
`surface:` scopes, §14.3 "discard dirty glow paint"; census: custom-assets.md §1.12)
- Host: dialog id `'glow-paint'`, params `{meshId}`; replace the `$glowPaintMeshId`
  driver (code: src/state/customAssetStore.ts:154) — update the P8.09 opener and delete
  the atom + setter in this task (grep confirms ManageTexturesPanel is the only other
  caller; leave its call site compiling by switching it to the dialogStore open until
  P8.24 deletes the panel).
- Painting guts verbatim (pointer capture, 8-step radial falloff, paint-through-ramp,
  brush 4–128/intensity/eraser/Clear — code: src/ui/GlowPaintDialog.tsx:26 `SIZE`,
  :72 `stampAt`, :118 pointer handlers).
- **Per-stroke undo** (D2): in-dialog stack of canvas snapshots, push one `ImageData` (or
  dataURL) per pointer-down, cap 32 (drop oldest); redo stack cleared on new stroke.
  Register in the hotkey registry at scope `surface:glow-paint`: `⌘Z` stroke-undo, `⇧⌘Z`
  stroke-redo — active while the dialog is open so it wins over global undo (precedence
  surface > global, foundation §11.1; FINAL_DESIGN_INDEX row `surface:glow-paint`).
  `Clear` is itself stroke-undoable (snapshot before wipe). This stack is DIALOG-LOCAL —
  document undo is untouched until Apply.
- **Underlay**: beneath the paint canvas draw the mesh's composited diffuse at 50%
  opacity over a checkerboard — derive it from the same resolver the render cache uses
  (base color/texture + `compositeGlow` output; guardrail 15). Simplest compliant source:
  the mesh's current diffuse from `customMeshRenderCache` materials' map, drawn scaled to
  512².
- **Live 3D preview on stroke end** (pointer-up): run the working bitmap through the
  existing composite path and update the picked mesh's editor material view-only (a
  preview hook in customAssetStore that feeds the render cache WITHOUT `mutate`; revert
  on Cancel).
- `Apply` → `setMeshGlowPainted` (code: src/state/customAssetStore.ts:1769 — PNG blob
  written via `assetKeys.emissivePaint(meshId)` BEFORE the single mutate; **one discrete
  undo step**; guardrail 9). `Cancel`/Esc with unsaved strokes → discard confirm
  (§14.3 tier-3 named case "discard dirty glow paint") — wire the dialog's
  close-interceptor so P8.01's mode-exit close path gets the same confirm. Imported glTF
  emissive bitmaps keep loading into this dialog (stored as 'painted' — code:
  src/state/customAssetStore.ts:1104-1132; retouchable, v1 behavior).
- Phone: S → center (S22), canvas scales to fit width, sliders `sm` (design §1.6).
**Verify**: `pnpm typecheck`; `pnpm test` (glowComposite tests untouched). Manual: paint
3 strokes, ⌘Z ×2 removes two strokes (document undo NOT consumed — check Edit menu), Apply
= exactly one document undo step; Cancel-with-strokes prompts; stroke-end updates the 3D
mesh; Esc ladder pops the dialog only after the confirm.

#### P8.13 — Surface commands, entry points, and hotkey registrations
**Goal**: Every road into Surface mode + the palette/menu command set (§1.7) exists.
**Files**:
- modify the P2 command registry + MenuSpec modules
- modify the P5 Build left-sidebar SubPart inspector + Outliner row-menu modules
- modify `src/ui/hotkeys/registry.ts` (if command registration lives there)
**Depends on**: P8.01–P8.12.
**Spec**: (design: design-surface-assets.md §1.2, §1.7; foundation §2.5)
- Commands registered: `surface.pickMesh` (dynamic palette provider "Edit surface:
  <mesh>" over `customMeshes`), `assets.uploadTexture`, `assets.newMaterial`,
  `assets.newPrimitiveMesh`, `assets.importModel`, `assets.makeKittenMesh.<kind>`,
  `surface.editGlowPaint` (enabled-predicate: picked mesh glow mode = painted).
  The Asset Manager command is NOT new: `window.assetManager` (P2.09, ⇧⌘A per
  FINAL_DESIGN_INDEX:166) already exists — P8.14 re-points its `run`; do NOT register an
  `assets.openManager` duplicate (P2.01's registry throws on duplicate ids).
- Entry points (all jump, not stack — §2.5): Build left-sidebar SubPart inspector button
  **"Edit Surface →"** (custom meshes only — resolve the selected placement's template
  against `customMeshes`); Build Outliner entity-row ⋮ item "Edit Surface →" (custom-mesh
  rows only) — ONE label everywhere (death-list row: the v1 "Manage Textures"/"Manage
  Material" split dies, design §6). Both run
  `setMode('surface', {surfaceMeshId, surfaceFace: firstKey})`.
- No new raw keys: mode `5` and `⇧⌘A` are already bound (P4/P2); `surface:glow-paint`
  scope landed in P8.12.
**Verify**: `pnpm typecheck`; manual: ⌘K → "Edit surface: Hull Box" jumps with mesh
picked; Outliner ⋮ on a custom row shows "Edit Surface →" (absent on built-in rows);
Build inspector button jumps; `5` in a dialog does nothing (P4 gate).

#### P8.14 — Asset Manager dialog shell (`asset-manager`, L) + prefs store
**Goal**: The two-pane manager overlay: category rail with per-kind counts, search,
Grid/List, sort, persisted view prefs, ＋ New menu — content cards land in P8.15.
**Files**:
- create `src/state/assetManagerStore.ts`
- create `src/ui/assets/AssetManagerDialog.tsx`
- modify the P2 dialog registry (`src/state/dialogStore.ts`: ADD `'asset-manager'` to the
  `DialogId` union) + `src/ui/commands/windowCommands.ts` (re-point the EXISTING
  `window.assetManager` command's `run` at `openDialog({id:'asset-manager'})` — keep the
  command id; the ⇧⌘A binding and Window-menu MenuSpec entry follow automatically)
**Depends on**: P8.02.
**Spec**: (design: design-surface-assets.md §2.1; foundation §10.3, S30)
- `assetManagerStore` (no react imports):
```ts
export const $assetManagerPrefs = persistentJSON('flexo:assetManager', {
  view: 'grid' as 'grid' | 'list',
  sort: 'name' as 'name' | 'kind' | 'recent' | 'usage',
  category: 'all' as 'all' | 'textures' | 'materials' | 'meshes' | 'imports' | 'unused',
});
```
  (@nanostores/persistent — view state, never undo.)
- Dialog: L size, `DialogViewStack` root view = the browser. Left rail: All / Textures /
  Materials / Meshes / Imported models with count badges computed per kind from `$part`
  (kills the conflated "Custom (N)", pain #13 — v1 count at code:
  src/ui/AssetsToolbar.tsx:21), plus `⚠ Unused (N)` row (count from `$assetUsage` zero-use
  entries; filter content lands P8.18). Rail footer `＋ New ▾`: Upload Texture… / New
  Material… / New Primitive Mesh… / Import Model… / Make Kitten Mesh ▸ — the first three
  open as **pushed views** in THIS dialog's stack (P8.16); Import Model and part-ify
  **jump** (close manager → open `import-review` / run part-ify; D8/S27).
- Right pane: fuzzy search (name + subPartId + channel + provenance), `⊞ Grid|☰ List`
  toggle, Sort select — all writing `$assetManagerPrefs`.
- Imported-models category groups by batch: header card (sourceFile, SubPart/texture/
  material counts, GLB size via `getAsset(assetKeys.importGlb(id))`.size — read through
  assetDb only, seam rule) with `Replace…`/`Remove import…` (wired P8.17) above its mesh
  cards. Batch grouping logic: reuse/port `groupImports` (code:
  src/ui/CustomAssetsModal.tsx:59).
**Verify**: `pnpm typecheck`; manual: ⇧⌘A opens; counts are per-kind and correct; prefs
survive reload (localStorage `flexo:assetManager`); ＋ New menu present; Esc closes
(ladder rung 2).

#### P8.15 — Manager cards: thumbnails, usage chips, empty states
**Goal**: Grid/List content for all categories with shared-renderer thumbnails,
where-used chips, unplaced ⚠ chips, and per-category creation empty states.
**Files**:
- create `src/ui/assets/AssetCards.tsx` (card + list-row components)
- modify `src/ui/assets/AssetManagerDialog.tsx`
**Depends on**: P8.03, P8.14.
**Spec**: (design: design-surface-assets.md §2.1, §2.3, D1, D6, D10)
- Grid card = thumbnail + name + kind/channel chip + usage chips; List row = 24px thumb +
  name + chips + inline actions. Thumbs: textures `<img>` from `$customTextureUrls`;
  materials/meshes via `requestThumb`/`$thumbUrls` (P8.03); pending/missing → kind glyph.
- Usage chips from `$assetUsage` (P8.02): texture "→N faces · N mat", material
  "→N meshes", mesh "×N placed"; mesh cards with zero placements show the ⚠ "not
  exported" chip (D10). Kitten meshes listed with a `kitten` chip (D6).
- Selection: single; List view shows a right-side detail strip; Grid opens detail as a
  pushed view on double-click/Enter (P8.17). Sort orders: name (locale), kind, recently
  added (array order — descriptors append), usage (chip counts desc).
- Empty states per category (D1, §2.3 wording verbatim) with inline creation buttons
  wired to the same commands/views as the ＋ New menu.
**Verify**: `pnpm typecheck`; manual: 20-asset project scrolls smoothly with one WebGL
context; chips show correct counts; each empty category shows its creation buttons (no
"go to the Add menu" text anywhere — the v1 self-admission at code:
src/ui/CustomAssetsModal.tsx:186 must have no analogue).

#### P8.16 — Creation forms as pushed views (Upload Texture / Create Mesh / Material)
**Goal**: The three creation dialogs open both as root S dialogs (Add menu) AND as pushed
views inside the manager — same guts, two mounts, zero stacked modals.
**Files**:
- modify `src/ui/CustomTextureDialog.tsx` (extract `UploadTextureForm`)
- modify `src/ui/CreateMeshDialog.tsx` (extract `CreateMeshForm`)
- modify `src/ui/assets/AssetManagerDialog.tsx` (push views; MaterialForm from P8.07)
**Depends on**: P8.07, P8.14.
**Spec**: (design: design-surface-assets.md D1, D9, §6 death-list row
"CustomTextureDialog / CreateMeshDialog — kept (S dialogs); openable from Add menu AND as
Manager pushed views"; census: custom-assets.md §1.1, §1.7)
- Extract form guts keeping EVERY v1 behavior: window-paste listener while the upload
  form is visible (code: src/ui/CustomTextureDialog.tsx:68 — scope the listener to
  form-mounted, works in both hosts), drag-drop, name-from-filename, channel select +
  normal-convention hint, `.gltf` sidecar multi-pick note applies to import not here;
  CreateMesh per-kind params via `ParamNumberField` (`useNumberDraft` + `inputMode="url"`,
  code: src/ui/CreateMeshDialog.tsx:197), optional material/texture seed, and its
  place-instance-and-select-on-confirm (`addCustomMesh`, code:
  src/state/customAssetStore.ts:944 — **discrete undo**, one step).
- Manager mounts them as `DialogViewStack` pushed views (`‹ Back · Upload Texture` etc.);
  on success pop back to the list (new row visible). Root dialog ids `'upload-texture'`
  and `'create-mesh'` keep working for Add ▸ entries (re-point to the extracted forms if
  P2 wrapped the old components).
- Creating a mesh from inside the manager does NOT close the manager (add-and-stay); the
  instance-placement select/reveal still happens (visible on close).
**Verify**: `pnpm typecheck`; manual: paste an image with the manager's upload view open
→ captured; create a box from the manager → appears in Meshes + placed in scene; Add ▸
Upload Texture… still opens the S dialog; no modal-over-modal anywhere.

#### P8.17 — Per-item detail views + where-used navigation + import batch actions
**Goal**: Pushed detail views for texture/material/mesh, the import-batch actions, and
chip navigation per §2.4.
**Files**:
- create `src/ui/assets/TextureDetail.tsx`, `src/ui/assets/MaterialDetail.tsx`,
  `src/ui/assets/MeshDetail.tsx`
- modify `src/ui/assets/AssetManagerDialog.tsx`
**Depends on**: P8.15, P8.16, P8.02.
**Spec**: (design: design-surface-assets.md §2.2, §2.4, D8, D9)
- **Texture**: large checkerboard preview (1:1/fit toggle) from `$customTextureUrls`;
  Name TextField → `renameCustomTexture` (P8.02, **discrete undo**); Channel Select →
  `setTextureChannel` (code: src/state/customAssetStore.ts:802 — silent re-encode kept;
  normal-channel pick shows the OpenGL/glTF hint verbatim from v1); dimensions readout;
  **Replace image…** file pick/paste → always-confirm ("Replaces the stored image bytes.
  Undo cannot restore the old image.") → `replaceTextureImage` (P8.02); Where-used list;
  Delete (P8.19 flow).
- **Material**: `MaterialForm` as the pushed view body (D9 host #2 — never a stacked
  modal); `Duplicate` (copy descriptor with " copy" suffix via `addCustomMaterial`,
  **discrete undo**); Where-used (meshes); Delete with the "N meshes revert to the
  neutral look" count wording (v1, code: src/ui/CustomAssetsModal.tsx:261).
- **Mesh** (all three kinds): thumb, Name rename (`updateCustomMesh`), kind + params
  summary, instance count, `[Add instance]` (same as picker ＋), `[Edit surface →]`
  (closes dialog + `setMode('surface', {surfaceMeshId})` — jump per §2.5), primitives:
  the SAME dimension editors as P8.06 (share the component), Where-used placements
  ("×3 on layers Hull, Wings") + `Select placements` (setSelection to those placements,
  close dialog, reveal), Delete ("Deletes the mesh and its N placements" →
  `removeCustomMesh`, code: src/state/customAssetStore.ts:1794). Kitten meshes: rename /
  add instance / edit surface / delete; params read-only "baked from <kind> kitten" (D6).
- **Import batch header**: `Replace…` → close manager, `openImportModel([], importId)`
  (D8 jump); `Remove import…` → confirm listing the FULL `planImportRemoval` inventory
  (code: src/state/customAssetStore.ts:1347 — SubParts, placements, orphaned
  materials/textures, empty batch layer) + byte warning → `removeImport` (code: :1390).
- **Chip navigation** (§2.4): face ref chip → close + jump to Surface with mesh+face
  picked; material ref → push that material's view; placement ref → Select placements
  behavior. Delete confirms read counts from `$assetUsage` (no ad-hoc recomputation —
  pain #12).
- Row/card ⋮ menus carry the same actions as the detail views.
**Verify**: `pnpm typecheck`; manual: rename texture ×1 undo step; channel change
re-encodes (viewport updates); replace-image confirm appears and old bytes gone after;
where-used chip on a texture jumps to Surface with the right face; batch removal confirm
names every SubPart; Esc pops detail → list → closes.

#### P8.18 — Orphan review ("Unused" filter) + Delete all unused
**Goal**: The ⚠ Unused rail filter with its banner and bulk delete.
**Files**:
- modify `src/ui/assets/AssetManagerDialog.tsx`
**Depends on**: P8.17.
**Spec**: (design: design-surface-assets.md §2.5, D10)
- Filter = assets with zero usage in `$assetUsage`: textures with no face AND no material
  channel refs; materials assigned to no mesh. Zero-placement MESHES are NOT orphans —
  they show the "not exported" chip instead (D10; never listed under Unused).
- Banner: "Unused assets are never deleted automatically." + `[Delete all unused…]` →
  tier-3 confirm (pushed confirm view) listing EVERY item by name + the byte warning
  (P8.19 string) → delete each via `removeCustomTexture`/`removeCustomMaterial` in ONE
  batch (wrap in a single `mutate` — add `removeUnusedAssets(ids)` to customAssetStore so
  it is **one discrete undo step** for descriptors; blob deletes immediate as always).
- Automatic GC stays EXACTLY reference-count-on-remove/replace (guardrail 10) — this UI
  adds review, not collection.
**Verify**: customAssetStore.test.ts: "removeUnusedAssets deletes only zero-use assets in
one undo step"; manual: upload an unused texture → appears under Unused; assign it → gone
from filter; bulk delete confirm names items.

#### P8.19 — Deletion & byte policy: one warning string + confirm matrix
**Goal**: Standardize the byte warning across ALL byte-backed deletions (D3 — v1 stated
it for imports only, pain #10) and wire the §5.1 confirm matrix.
**Files**:
- create `src/ui/assets/bytePolicy.ts`
- modify `src/ui/assets/TextureDetail.tsx`, `AssetManagerDialog.tsx`, `MeshDetail.tsx`,
  `src/ui/surface/ImportedSection.tsx`
**Depends on**: P8.17, P8.18.
**Spec**: (design: design-surface-assets.md §5.1–§5.2, D3; foundation §14.3)
```ts
// src/ui/assets/bytePolicy.ts — the ONE string (design §5.2, verbatim)
export const BYTE_DELETE_WARNING =
  'This deletes the stored file bytes from this browser. Undo restores the entry, not ' +
  'the bytes — anything using it will render untextured until re-uploaded.';
export const IMPORT_REMOVAL_APPENDIX =
  'Imported geometry has no other copy and cannot be recreated.';
```
- Apply the §5.1 matrix exactly: delete texture / replace texture image / remove import /
  delete-all-unused = ALWAYS confirm + warning (tier 3); delete material = >0 uses →
  `InlineConfirmStrip` with count, else no confirm + status `[Undo]` flash; delete mesh =
  ≤5 placements no confirm + `[Undo]` flash, >5 → confirm with counts. Counts from
  `$assetUsage`. Confirms inside the manager are pushed views or inline strips — never a
  stacked `ConfirmDialog` (§10.1); Surface-sidebar-initiated removals (Imported section)
  may use the top-level `ConfirmDialog` (blessed for top-level, §10.1).
- Undo enrollment: descriptor removal steps are the existing discrete mutators; this task
  adds NO new mutation semantics — only confirm chrome + wording.
**Verify**: `pnpm lint` (no duplicated warning literals — grep shows the string defined
once); manual: delete a used material → inline strip with count; delete a 2-placement
mesh → no confirm, status flash offers Undo; every byte-backed confirm shows the standard
sentence; import removal appends the appendix line.

#### P8.20 — Import Review dialog restructure (Drop → Review → Importing, D11)
**Goal**: Rehost the import flow as dialog `'import-review'` with `DialogViewStack` views
and the sticky-vs-per-import STRUCTURAL split that kills the leftover-0.01-scale trap.
**Files**:
- create `src/ui/assets/ImportReviewDialog.tsx` (guts moved from
  `src/ui/ImportModelDialog.tsx`)
- delete `src/ui/ImportModelDialog.tsx`
- modify `src/state/customAssetStore.ts` (`openImportModel` opens the dialog id; keep
  `$importModelRequest` as the payload/remount carrier — design §7.1 "kept")
- modify `src/app.tsx` (mount swap)
**Depends on**: P8.14 (D8 jump targets), P8.19.
**Spec**: (design: design-surface-assets.md §3.1–§3.3, D11; foundation §10.4; census:
custom-assets.md §1.15, §1.17)
- One dialog, params `{files?, replaceImportId?}` carried by `$importModelRequest`
  (code: src/state/customAssetStore.ts:168-179); `openImportModel` (call sites: code:
  src/ui/ViewportDropZone.tsx:48, AddButton/menu command, manager P8.17, Surface
  Imported P8.10) sets the atom AND `$openDialog = {id:'import-review'}`. Viewport drop
  still goes straight to Review (files provided).
- **Drop view**: drop zone + picker (`.glb`, or `.gltf`+`.bin`+images multi-pick) +
  Blender recipe disclosure — verbatim rehost (code: v1 drop step). Replace mode banner:
  "Replacing import: <file> — matched by node + material name".
- **Review view**: left column = `ModelPreviewViewport` (code:
  src/three/ModelPreviewViewport.ts:30) live for scale/up-axis, the 9-stat grid, warnings
  disclosure ("What KSA can't represent (N)", grouped with remedies — content verbatim
  from importEstimates), replace-mode match summary with **removed SubParts named**
  (`matchImportedMeshes`, code: src/state/customAssetStore.ts:1468). Right column = TWO
  labeled groups (D11, structural): **"This import only"** — Name prefix (default from
  filename), Scale (`PreciseNumberInput`, >0 enforced — v1 draft field code:
  src/ui/ImportModelDialog.tsx:153 — plus `SCALE_PRESETS` buttons, code:
  src/ksa/importEstimates.ts:287) with an amber `≠1` badge whenever ≠1, Bake transforms /
  Make double-sided / Merge (enabled only when `canMerge`) / replace-only "Update
  materials from file" (default on) — ALL reset on every dialog open (component state,
  never persisted — guardrail 13); **"Saved preferences 📌"** — Up axis, Max texture
  1024/2048/4096 (re-runs material translation on change, v1 behavior), Bake scale,
  Decimate view meshes with caption "affects export — Settings →" deep-linking Settings
  (P8.23) — reading/writing `$modelImportSettings` (code:
  src/state/settingsStore.ts:266). Visually separated with the pin glyph.
- Confirm button: `Import N SubParts` / `Replace (N kept, N new, N removed)`.
- **Importing view**: phase text + indeterminate bar; **undismissable** — back chevron,
  Esc and ✕ disabled while committing (verbatim v1 contract). Commit semantics UNTOUCHED:
  `importModelAsMeshes` (code: src/state/customAssetStore.ts:1198 — binaries first, ONE
  mutate = **one discrete undo step**, layer named after file + activated + revealed,
  placements selected) / `replaceImport` (code: :1535). Do not modify these functions.
**Verify**: `pnpm typecheck`; `pnpm test` (importPlan/importMaterials/estimates suites +
customAssetStore import describes stay green, code: src/state/customAssetStore.test.ts:313,
:576). Manual: reopen dialog after a 0.01-scale import → scale is 1 again with no badge;
set 0.01 → amber `≠1`; sticky group persists across opens; Esc during Importing does
nothing; replace confirm wording matches.

#### P8.21 — Import report → notification center rich entry; delete ImportReportCard
**Goal**: Completion posts a `rich` notification (removed SubParts named, sticky) and the
corner card dies.
**Files**:
- modify `src/state/customAssetStore.ts` (replace the two `$importReport.set` sites,
  code: :1249, :1659; delete `$importReport`/`dismissImportReport`/`ImportReport` exports
  — keep the report-shape interface if `notify` payload reuses it)
- delete `src/ui/ImportReportCard.tsx`
- modify `src/app.tsx` (unmount)
**Depends on**: P8.20.
**Spec**: (design: design-surface-assets.md §3.4; foundation §5.1 `rich` row, §6.3 death
list; design-system-services.md §2.4 `notify()`)
- On completion call `notify({kind:'rich', …})` with: mode icon + filename title; counts
  row (kept/added/placements/textures/materials/removed); **removed SubParts named**
  (hard requirement); non-blocking warnings in a disclosure; actions
  `[Open Asset Manager]` (open dialog `'asset-manager'`) and `[Edit surfaces →]`
  (`setMode('surface')` with the first imported mesh picked). Sticky until dismissed;
  entries ACCUMULATE (the v1 replaced-by-next-import behavior is dropped — design §3.4);
  the status flash shows the one-line summary (the `notify` facade's rich path is
  center-only, so also emit a `toast` transient one-liner). Import failure →
  `danger` notification (persistent) — route the existing failure paths.
- Layering: `customAssetStore` may import `notificationStore` (state→state, no react).
  The rich BODY is data (strings/counts/arrays) rendered by the notification center's
  rich-entry renderer — do not put JSX in the store.
**Verify**: `pnpm typecheck`; grep: no `$importReport` references remain; manual: import
→ bell pulses, entry lists counts + actions, persists across a second import (two
entries); replace with removals names them; failure shows red persistent entry.

#### P8.22 — Kitten part-ify flow (S27 switch + flash + entries)
**Goal**: Make Kitten Mesh works from Add menu, Manager ＋ New, and the picker empty
state, auto-switching to Build with the jump-back flash.
**Files**:
- modify the P2 command module for `assets.makeKittenMesh.<kind>`
- modify `src/ui/assets/AssetManagerDialog.tsx`, `src/ui/surface/MeshPicker.tsx` (wire)
**Depends on**: P8.13, P8.14.
**Spec**: (design: design-surface-assets.md §3.5; foundation S27; census:
custom-assets.md §1.20)
- Command runs `makeKittenMeshPart(kind)` (code: src/state/customAssetStore.ts:986 —
  **one discrete undo step**, "<Kitten> Mesh" layer created + activated + revealed,
  placements selected; semantics untouched) then `setMode('build')` (S27:
  entity-creating command → result visible in the mode that edits it), then status flash
  `Kitten meshes added ✓ — [Edit surfaces →]` whose action jumps to Surface with the
  VISOR submesh picked (find the created mesh with `kitten.transparent`).
- Kitten meshes now appear in picker (P8.05) and Manager (P8.15) per D6, and stay
  EXCLUDED from Add ▸ Custom Mesh Instances ▸ (foundation §3 Add tree — verify the P5B
  menu still filters `meshKind(m) === 'kitten'` as v1 did, code: src/ui/AddButton.tsx:45
  pattern). Geometry stays session-baked, never persisted; textures stay Content/Core
  references (guardrails; census §1.20/§1.21).
**Verify**: manual: run from all three entry points; one undo removes the whole batch;
flash action lands on the visor in Surface mode.

#### P8.23 — D4: Settings → Import & Export single home for decimate + kitten texture mode
**Goal**: One editable home (Law 1) for the four sticky import prefs and the kitten
texture export mode, inside the CURRENT settings dialog.
**Files**:
- modify `src/ui/SettingsButton.tsx` (the v1 Settings dialog — restructure/retitle the
  relevant sections into an "Import & Export" section)
**Depends on**: P8.20.
**Spec**: (design: design-surface-assets.md D4, §6 last row; foundation §10.7 "Import &
Export"; census: custom-assets.md pains #8/#9, §1.21)
- Group under one "Import & Export" section heading: up axis, max texture size, bake
  scale, **decimate view meshes labeled "Decimate view meshes (affects export)"** — all
  bound to `$modelImportSettings` (code: src/state/settingsStore.ts:266) — plus the
  existing "Kitten mesh textures (export)" controls moved in (mode select + Content/Core
  path TextField, code: src/ui/SettingsButton.tsx:128-159 — guts verbatim,
  `$kittenTextureExport` code: src/state/settingsStore.ts:218).
- Import Review's sticky group (P8.20) keeps its deep-link "Settings →" opening this
  dialog/section. The Export-dialog read-only chips are **P10's task** (seam note above)
  — do not add them here. P9's Settings IA rebuild will carry this section forward
  (foundation §10.7 already names it) — structure it as its own component so P9 can
  re-mount it.
- All persisted via the existing settingsStore atoms (@nanostores/persistent-equivalent
  `persistentJSON`); never undo.
**Verify**: manual: change decimate in Settings → Import Review shows it changed (same
store) and vice versa; kitten section gone from its old spot; export output honors the
setting (spot-check `viewMeshBudget`, code: src/ksa/modExport.ts:761).

#### P8.24 — Death sweep: CustomAssetsModal, ManageTexturesPanel, driver atoms, label unification
**Goal**: Delete every replaced v1 surface and its plumbing (design §6 death list).
**Files**:
- delete `src/ui/CustomAssetsModal.tsx`, `src/ui/ManageTexturesPanel.tsx`,
  `src/ui/AssetsToolbar.tsx` (if it survived P5A)
- modify `src/app.tsx` (unmount ManageTexturesPanel)
- modify `src/state/customAssetStore.ts` (delete `$managingMeshId`/`setManagingMeshId`,
  code: :147-152)
- modify any surviving reference sites (grep-driven; the P2 `window.assetManager`
  command already targets `'asset-manager'` since P8.14)
- modify `src/state/dialogStore.ts` (REMOVE `'custom-assets'` from the `DialogId` union —
  its only tenant dies here; typecheck flushes any straggler opener)
**Depends on**: P8.05–P8.19 (every feature has its v2 home first).
**Spec**: (design: design-surface-assets.md §6; foundation §6.3)
- Before deleting, run the parity check against design §6's table: every v1 row must
  already have its v2 home functional (CustomAssetsModal → Asset Manager;
  ManageTexturesPanel → Surface sidebar + face card; AssetsList ⋮ labels → the single
  "Edit Surface →" (done P8.13); ImportReportCard → done P8.21; MaterialDialog stacking →
  done P8.07/P8.17; CustomTextureDialog/CreateMeshDialog dual-host → done P8.16; Settings
  kitten section → done P8.23).
- `$glowPaintMeshId` already died in P8.12; `$importReport` in P8.21. Delete
  `dismissImportReport` remnants if any.
- ViewportDropZone stays (foundation §6.3 — canvas overlay survivor).
**Verify**: `pnpm typecheck`; `grep -rn "CustomAssetsModal\|ManageTexturesPanel\|AssetsToolbar\|managingMeshId\|glowPaintMeshId\|importReport" src/` → only
allowed hits are none (or the ImportReport interface if P8.21 kept it under notification
naming); full manual pass of phase checklist item 2.

#### P8.25 — Phone variants (Surface mode, Asset Manager, Import Review, Glow Paint)
**Goal**: Full phone parity for every Phase-8 surface (LOCKED #6).
**Files**:
- modify `src/ui/surface/SurfaceSidebar.tsx`, `SurfaceLeftPanel.tsx`,
  `src/ui/assets/AssetManagerDialog.tsx`, `ImportReviewDialog.tsx`,
  `src/ui/GlowPaintDialog.tsx` (responsive branches via `useIsPhone`, code:
  src/ui/kit/useIsPhone.ts)
**Depends on**: P8.24.
**Spec**: (design: design-surface-assets.md §1.2 phone row, §1.6 phone, §2.6, §3.2 phone;
foundation §12, S22)
- Surface mode: ModeTabBar ◧ tab switches mode; re-tap opens the Panel sheet hosting
  `SurfaceSidebar` content; the left face card rides the phone Inspector sheet (the P5B
  phone focus mechanism). Verify the P4 phone-shell mode plumbing needs only content
  registration, not new frame code.
- Asset Manager: L → cover; rail → horizontal chip row under search; 2-col grid; detail
  views push as sheet views with back header; ＋ New = footer FAB-row. Actions identical;
  thumbnail renderer unchanged.
- Import Review: cover; preview 40vh on top, stats strip, the two option groups as
  accordions ("This import only" open by default); same reset rules.
- Glow Paint: S → center; canvas fits width; touch painting via the same pointer events;
  `sm` sliders.
**Verify**: manual at <640px (devtools): complete a full flow — import a glb, edit its
surface, paint glow, manage assets, delete a texture — every step reachable; no
horizontal scroll; `pnpm typecheck`.

#### P8.26 — Namespacing seam audit (P9 `pa:` adoption by reference)
**Goal**: Prove Phase-8 code is swap-ready for P9's key-scheme change.
**Files**: none created — audit + fixes in any offender found.
**Depends on**: P8.24.
**Spec**: (design: design-surface-assets.md §7.3; design-projects-export.md §1.5)
- `grep -rn "tex-src:\|tex-ktx2:\|import-glb:\|emissive-paint:\|mesh-glb:" src/` —
  literal key strings may exist ONLY inside `src/state/assetDb.ts` (`assetKeys`, code:
  src/state/assetDb.ts:83). Every new Phase-8 call site (thumbnails, glow paint, replace
  image, manager size readouts, import review) must route through `assetKeys.*` /
  customAssetStore helpers. Fix any violation.
- Confirm no Phase-8 module opens IndexedDB directly (only `assetDb.ts` touches the DB).
- Leave a signpost comment on `assetKeys`: "P9 prefixes these with `pa:<projectId>:` —
  see design-projects-export.md §1.5; `listProjectBlobs` lands there."
**Verify**: the greps return only assetDb.ts hits; `pnpm lint`.

#### P8.27 — Docs sync + parity audit (§9)
**Goal**: Docs describe the v2 surfaces; the design §9 parity table passes row by row;
scope/ confirmed contract-unchanged.
**Files**:
- modify `docs/custom-assets.md`, `docs/texturing.md`, `docs/importing-models.md`
- modify `docs/asset-pipeline.md`, `docs/editor-state.md` (only where they name dead
  surfaces — check)
- modify `scope/custom-assets-and-mod-export.md` (prose references only, if any name
  CustomAssetsModal/ManageTexturesPanel/ImportReportCard)
**Depends on**: P8.24, P8.25.
**Spec**: (AGENTS.md doc-sync mandate; design: design-surface-assets.md §9)
- Update every UI path in the three primary docs: creation entries (Add menu + Asset
  Manager, D1), surface editing (Surface mode, `5`), management (⇧⌘A), import flow
  (Import Review views, D11 split), report (notification center), byte-deletion wording
  (D3 — now stated for all kinds), Settings → Import & Export home (D4), glow-paint
  stroke undo (⌘Z scope), post-creation rename/resize (census 1.9 gap closed).
- **Scope check**: assert exported bytes unchanged (guardrail 15) — no contract edits in
  scope/*.md; fix stale UI-surface names in prose only. State in the commit message that
  this phase is editor-chrome only.
- **Parity audit**: walk design-surface-assets.md §9 (every row 1.1–1.24 + the
  constraint row) and check each v2 home exists and behaves; record the checklist result
  in the PR/commit description. Rows deferred by design to other phases — export
  pre-flight info row (owned by **P10.01**, area `'asset'`) + Export chips (P10.03/04),
  `hasCustomAssets` gate removal + `listProjectBlobs` (P9) — are marked "seam: deferred
  per plan (owner named)" not "missing".
**Verify**: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test`
(the full phase gate); docs contain no dead component names
(`grep -rn "CustomAssetsModal\|ManageTexturesPanel\|ImportReportCard\|Custom (N)" docs/ scope/` → no hits).


---

## flexo v2 — Phase 9 & Phase 10

Plan file for the projects/persistence/export tracks. Design sources are binding; every
code cite below was verified against the working tree at `main` (fcd5e07).

Conventions used in every task:
- "design: projects" = `plans/flexo_v2/design/design-projects-export.md`; "foundation" =
  `plans/flexo_v2/design/foundation.md`; "census: pm" = `analysis/flexo-v2-feature-census/project-management.md`;
  "census: export" = `analysis/flexo-v2-feature-census/export-integration.md`.
- Mandatory per-task workflow after code changes: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check`
  → `pnpm typecheck` → `pnpm test` (AGENTS.md:167-169; run scripts BARE, no pipes).
- `src/state/` and `src/ksa/` modules import NO react and NO three (layering constitution;
  exceptions only where already carved out). No manual memoization anywhere (React Compiler).
- No migration code ever: v1 data is purged with a notice, never converted (AGENTS.md
  constitution; DECISIONS #3).

---

## Phase 9 — Projects v2: id-keyed IndexedDB storage, Project Manager, .flexo.tar.gz archives, share links, Settings IA

**Design sources**: design-projects-export.md §1–§5, §9, §10, §11, §12, §13, §14 (decisions
D1–D10, D14, D15); foundation §3 (File menu), §5.1, §10.1, §10.2, §10.7, §10.8, §10.9, §13,
§17 step 6 ("Project Manager / tar.gz archive … land as independent dialog tracks");
design-surface-assets.md §7.3 (adopts §1.5 by reference, contributes `listProjectBlobs`);
DECISIONS #3, #4; FINAL_DESIGN_INDEX.md (File-menu tree + `⌘O`/`⌘S` rows).
**Census sources**: project-management.md (all), export-integration.md §1.3–§1.5,
custom-assets census (blob tiers, via the projects design's §parity table).

**Entry state**: Phases 1–8 complete — docked shell, `commandStore`/MenuSpec menubar +
palette, `dialogStore` (dialogs mounted once at root, opened via `{id, params}`),
`statusStore`/`notificationStore` behind the `toast()` facade (`notify()` available),
kit primitives `DialogViewStack`, `InlineConfirmStrip`, `CopyDownloadBar`, `Sheet`,
`GridList` in `src/ui/kit/`, all five modes rehosted, Asset Manager landed. Project
persistence is still v1: name-keyed localStorage snapshots via
`src/state/projectStore.ts` (hydrate at `main.tsx:38`), `flexo-assets` IDB blobs with
un-namespaced keys (`src/state/assetDb.ts:83 assetKeys`), ProjectButton-descended dialogs
(Load/Rename/Export JSON/Import JSON/Share) reachable through dialogStore ids wrapping the
v1 guts, `BuildIdMismatchDialog` still mounted, `hasCustomAssets` still gating export+share.
**Exit state**: app runnable. Projects live in IndexedDB `flexo-projects` keyed by stable
ids; boot is awaited-async single-paint; v1 `flexo:project:*` keys purge with a named
notification (no adoption); Project Manager overlay (⌘O) with cards/search/sort/
descriptions/counts/thumbnails/row actions; `.flexo.tar.gz` archive export/import for ANY
project (hasCustomAssets gate REMOVED for archives, kept for share links); share links
byte-compatible with v1; Settings dialog has the Import & Export and Advanced tabs with the
single Reset Everything command; build mismatch is a sticky notification; multi-tab is
Web-Locks-safe. Old project UI files deleted.

**Phase verification** (end of phase):
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` all clean.
2. `pnpm dev`, then in the browser: boot with v1 `flexo:project:*` keys present shows the
   purge notification naming them and localStorage retains ONLY `flexo:currentProjectId`
   (+ `@nanostores/persistent` preference keys + `flexo_build_id`); reload restores the
   same project in one paint; undo survives reload.
3. ⌘O opens the Project Manager; create/rename/describe/duplicate/delete/open all work;
   deleting a project shrinks IDB (check DevTools → IndexedDB: `flexo-projects` rows and
   `flexo-assets` `pa:<id>:` keys gone).
4. Export archive of a project WITH custom textures + an imported model; Import it back
   both as Merge (one undo step — one ⌘Z removes everything) and as Open-as-new (switched
   to, assets visible). Share Link on the same project shows the explain state and jumps
   to Export archive.
5. Two tabs on one project: second tab shows the read-only chip + Take over works.
6. Phone width (<640px): manager is a cover sheet, row ⋮ action sheet works, Reset
   Everything confirm shows the FS-grant switch.

---

#### P9.01 — Create the pure USTAR tar + gzip module `tarArchive.ts`
**Goal**: land the dependency-free archive container primitive everything in §4 builds on.
**Files**:
- create `src/state/tarArchive.ts`
- create `src/state/tarArchive.test.ts`
**Depends on**: none.
**Spec**: (design: projects §4.1 "Implementation (D8)"). Pure functions, zero react/three
imports, no new package (D8: "Hand-rolled USTAR (~150 LoC) + native
`CompressionStream('gzip')`. No new dependency").
```ts
// src/state/tarArchive.ts
export interface TarEntry { name: string; bytes: Uint8Array }

/** Packs entries into a USTAR tar (512-byte blocks, two zero-blocks trailer).
 *  Entry order is preserved verbatim (manifest.json MUST be first — caller's job). */
export function tarPack(entries: TarEntry[]): Uint8Array;

/** Unpacks a USTAR tar. Throws Error('not a tar archive') when the first header
 *  block lacks the "ustar" magic at offset 257. Skips non-file typeflags. */
export function tarUnpack(bytes: Uint8Array): TarEntry[];

/** True when CompressionStream/DecompressionStream exist (feature-detect once). */
export function gzipSupported(): boolean;

export async function gzip(bytes: Uint8Array): Promise<Uint8Array>;   // CompressionStream('gzip')
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array>; // DecompressionStream('gzip')
```
USTAR header per entry: name (≤100 bytes ASCII — throw on longer; our paths are short ids
like `assets/tex-src/t_ab12`, no pax support by design), mode `0000644`, uid/gid 0,
size (octal, 11 digits + space), mtime, checksum (sum of header bytes with the checksum
field treated as 8 spaces), typeflag `'0'`, magic `ustar\0` + version `00`. Pad each file
body to a 512 multiple; append two 512-byte zero blocks. `gzip`/`gunzip` pipe a
`Blob([bytes]).stream()` through the compression stream and collect via
`new Response(stream).arrayBuffer()`. Node 24 (vitest) has global CompressionStream, so
tests run the real thing.
**Verify**: `pnpm test` — `tarArchive.test.ts` cases: (1) pack→unpack round-trips names +
bytes in order; (2) a 1-byte and a 512-byte body both round-trip (padding edge); (3)
non-multiple-of-512 total rejected by `tarUnpack` only when magic missing — corrupt input
throws 'not a tar archive'; (4) name > 100 bytes throws on pack; (5) `gzip`→`gunzip`
round-trip of 1 MB of random bytes; (6) unpack of `gzip(tarPack(...))` after `gunzip`
equals input. Then fmt/lint/fmt:check/typecheck.

#### P9.02 — Create `projectDb.ts`: the `flexo-projects` IndexedDB layer + ProjectMeta
**Goal**: one thin promise-wrapped module owning the DB `flexo-projects` (stores `meta` /
`snapshots` / `history` / `thumbs`) and the `ProjectMeta`/`ProjectId` types.
**Files**:
- create `src/state/projectDb.ts`
- create `src/state/projectDb.test.ts`
**Depends on**: none.
**Spec**: (design: projects §1.1, §1.2). Model the open/tx plumbing on the existing tiny
wrapper (code: src/state/assetDb.ts:18 `openDb`, :32 `tx`). DB name `flexo-projects`,
version 1, four object stores keyed by `projectId` (out-of-line keys like assetDb).
```ts
export type ProjectId = string; // "p_" + 12 random base36 chars
export function newProjectId(): ProjectId; // crypto.getRandomValues-driven

export interface ProjectMeta { /* EXACTLY the shape in design: projects §1.2 —
  id, name, description, partId, createdAt, savedAt, schemaVersion,
  counts:{subParts,connectors,colliders,seats,lights,kittens,animations,layers,
          customTextures,customMaterials,customMeshes},
  bytes:{snapshot,history,assets}, hasThumb */ }

// snapshot v2 value shape (NO history field — D4):
export interface ProjectSnapshotV2 {
  version: number; part: EditingPart; layerView: Record<string, LayerViewState>;
  activeLayerId: string; savedAt: number; camera?: CameraState;
  measurements?: LineMeasurement[]; containers?: ReferenceContainer[];
}
export interface ProjectHistoryRecord { undo: HistoryEntry[]; redo: HistoryEntry[] }

export function putMeta(m: ProjectMeta): Promise<void>;
export function getMeta(id: ProjectId): Promise<ProjectMeta | undefined>;
export function listMeta(): Promise<ProjectMeta[]>;               // getAll on 'meta'
export function putSnapshot(id, snap): Promise<void>;  export function getSnapshot(id): Promise<ProjectSnapshotV2 | undefined>;
export function putHistory(id, h): Promise<void>;      export function getHistory(id): Promise<ProjectHistoryRecord | undefined>;
export function putThumb(id, blob: Blob): Promise<void>; export function getThumb(id): Promise<Blob | undefined>;
export function deleteProjectRecords(id): Promise<void>; // meta+snapshot+history+thumb in one tx
/** Pure: derives ProjectMeta.counts from an EditingPart at save time. */
export function deriveCounts(part: EditingPart): ProjectMeta['counts'];
```
`deriveCounts` reads `part.placements.length`, `connectors`, `colliders`, `ivaSeats`,
`lights`, `kittens`, `animations`, `layers`, `customTextures`, `customMaterials`,
`customMeshes` lengths (all fields exist on `EditingPart`, code: src/ksa/types.ts
`createEmptyPart` — confirm field names by reading it before writing). Snapshot/history
values are stored as structured-cloneable plain objects (no Blobs except `thumbs`).
`bytes.snapshot`/`bytes.history` are computed by the WRITER (projectStore) as
`JSON.stringify(value).length` at write time — projectDb just stores what it's given.
No react/three imports.
**Verify**: `pnpm test` — `projectDb.test.ts` covers the PURE parts only (happy-dom has no
indexedDB — pattern precedent: src/state/customAssetStore.test.ts:6 `vi.mock('./assetDb')`):
`newProjectId` matches `/^p_[0-9a-z]{12}$/` and 1000 draws are unique; `deriveCounts` on a
`createEmptyPart()` is all zeros and counts a populated part correctly. typecheck/lint/fmt.

#### P9.03 — Create `projectIndexStore.ts`: reactive index, current-id pointer, locks, health
**Goal**: the LOCKED-#3 reactive metadata store replacing `listProjects()` + the setTick hack.
**Files**:
- create `src/state/projectIndexStore.ts`
- create `src/state/projectIndexStore.test.ts`
**Depends on**: P9.02.
**Spec**: (design: projects §11 `projectIndexStore.ts` sketch — implement it verbatim;
§1.1, §1.3, §1.4; foundation §13 table row `projectIndexStore`).
```ts
export const $projectIndex = atom<ProjectMeta[]>([]);        // sorted savedAt desc
export const $currentProjectId = atom<ProjectId>('');        // mirrors localStorage 'flexo:currentProjectId'
export const $projectLock = atom<'owner' | 'readonly' | 'unsupported'>('unsupported');
export const $autosaveHealth = atom<'ok' | 'failing'>('ok');
export const $storageEstimate = atom<{ usage: number; quota: number } | null>(null);
```
- localStorage key: `flexo:currentProjectId`, raw string id (design §1.1 — the ONLY
  project key left in localStorage). Write helper `setCurrentProjectId(id)` updates atom +
  localStorage.
- `reloadIndex(): Promise<void>` — `listMeta()` → sort savedAt desc → `$projectIndex.set`.
- BroadcastChannel `'flexo:projects'`: module-level channel; `broadcastIndexChanged()`
  posts `{type:'index-changed'}`; `onmessage` → `void reloadIndex()` (design §1.4).
  Guard `typeof BroadcastChannel !== 'undefined'`.
- Web Locks (design §1.4, D5): `acquireProjectLock(id)` calls
  `navigator.locks.request('flexo:project:'+id, {mode:'exclusive', ifAvailable:true}, holder)`
  where `holder` returns a promise resolved only by `releaseProjectLock()` (store the
  resolver). Got it → `$projectLock.set('owner')`. Not got → `'readonly'` + post the sticky
  warning notification (§1.4 copy: *"This project is open in another tab. Changes here are
  NOT saved."*, action **Take over**). `takeOverLock()` re-requests with `{steal: true}`;
  the robbed tab's holder promise REJECTS → its catch flips itself to `'readonly'` and
  posts its own sticky warning (*"Another tab took over autosave. Reload to pick up its
  changes."* action **Reload** → `location.reload()`). No `navigator.locks` → `'unsupported'`
  + one-time `warning` notification documenting the single-tab constraint (no bespoke
  fallback protocol).
- `refreshStorageEstimate()` — `navigator.storage.estimate()` → `$storageEstimate`.
- Mutating actions (`createProject`, `openProject`, `renameProject`,
  `setProjectDescription`, `duplicateProject`, `deleteProject`, `flushAutosave`,
  `loadThumb` with a small Map LRU ≤24) are DECLARED here per the design sketch but the
  ones that touch live editor stores delegate to `projectStore` (P9.04) to keep this module
  document-agnostic; wire them in P9.04. Rename/describe here: read meta, write
  `uniqueProjectName`-suffixed name / description, `putMeta`, `reloadIndex`, broadcast.
  Move `uniqueProjectName` logic here, now checked against `$projectIndex` names (design
  §1.1; v1 code: src/state/projectStore.ts:335 `uniqueProjectName`).
- **Undo enrollment: NONE.** Every action in this store is metadata or project lifecycle —
  never a document mutation, never an undo step (design: projects §1.8 table).
- No react imports. All notifications via the imperative `notify()`/`toast()` facade.
**Verify**: `pnpm test` — tests (mock `./projectDb` with an in-memory Map like
customAssetStore.test.ts does for assetDb; stub `BroadcastChannel`/`navigator.locks` on
`globalThis`): `uniqueProjectName` suffixes against the index ("Rover"→"Rover 2");
`renameProject` never touches another row (create two, rename one to the other's name →
auto-suffix, both rows still present — the v1 clobber regression test, census: pm §1.1);
lock-unsupported path sets `'unsupported'`. Manual: none yet (store unwired).

#### P9.04 — Rewrite `projectStore.ts` on IndexedDB (awaited hydrate, split autosave, loud failure)
**Goal**: replace the localStorage persistence core with the §1 storage model, public
contract preserved.
**Files**:
- modify `src/state/projectStore.ts` (rewrite; keep exports listed below)
- modify `src/state/projectStore.test.ts` (port to the new model)
**Depends on**: P9.02, P9.03.
**Spec**: (design: projects §1.2, §1.3, §1.7, §1.8, §11 `projectStore.ts` sketch;
DECISIONS #3; D4, D6). Current code anchors to preserve/rework:
- KEEP semantics verbatim: `applyProjectSnapshot` (code: projectStore.ts:274 — suspend
  autosave, `importHistory`, set `$part`, clamp `$activeLayerId` to a live layer else
  `DEFAULT_LAYER_ID`, set `$layerView`/`$measurements`/`$containers`, `clearSelection()`,
  `closeChain()`, `$cameraState.set` + `setCameraRestore`); `normalizePart` (:178) and
  `normalizeSnapshot` (:201 — default-fill the document AND every history entry);
  `PROJECT_SCHEMA_VERSION` (:80) stays THE compatibility contract with its doc comment and
  `// vN:` changelog convention. **This storage redesign does NOT bump it** — v1 data is
  removed by the D6 key purge, not by a version check (the constant gates the new IDB rows
  going forward).
- `$projectName` atom stays exported (UI + export filename consumers; code:
  customAssetStore.ts:44 imports it today) but becomes a mirror of the current meta's name.
- NEW shape: snapshots carry NO history (P9.02 `ProjectSnapshotV2`); history is its own
  record capped at existing `MAX_UNDO` (code: src/state/editorStore.ts:325 `MAX_UNDO = 50`;
  `exportHistory`/`importHistory` at :475/:500 unchanged).
- **Autosave** (design §1.3): same subscription set as v1 `startAutosave` (code:
  projectStore.ts:460-472) — `$part, $canUndo, $canRedo, $activeLayerId, $layerView,
  $projectName, $cameraState, $measurements, $containers` — but TWO debounced writers:
  snapshot+meta at **300 ms** (existing `SAVE_DEBOUNCE_MS`, :446), history at **1500 ms**
  (`HISTORY_DEBOUNCE_MS = 1500`). `suspended` flag semantics unchanged. Writers no-op when
  `$projectLock.get() !== 'owner'`. Meta written on every snapshot save with
  `deriveCounts`, `bytes` sizes, `savedAt`, `schemaVersion: PROJECT_SCHEMA_VERSION`.
  After each committed write: `broadcastIndexChanged()` + `reloadIndex()`.
- **Loud failure** (design §1.3; replaces the silent `console.warn` at :305-308): a failed
  IDB put → `$autosaveHealth.set('failing')`, persistent danger status message
  `Autosave failing — storage may be full` + ONE `danger` notification (dedupe: don't
  re-post while failing) with quota readout (`$storageEstimate`) and actions
  **[Open Projects…]** (`dialogStore.$openDialog = {id:'projects'}`) **[Retry now]**
  (`flushAutosave()`). A later successful write → `'ok'` + transient
  `Autosave recovered ✓`.
- `flushAutosave(): Promise<void>` — cancel timers, write snapshot+meta+history now.
- **`purgeV1ProjectKeys()`** (D6 — NO adoption): iterate localStorage high→low (removeItem
  reindexes — same loop shape as code: projectStore.ts:245), delete every
  `flexo:project:*` key + `flexo:currentProject`; collect display names FROM THE KEYS
  (`key.slice('flexo:project:'.length)`) — zero parsing; if any removed, queue ONE
  `warning` notification: `Projects from a previous flexo version were removed
  (incompatible format): A, B, C`. Runs every boot; no-op when no keys.
  Delete `sanitizeProjectStorage`/`consumeRemovedProjectsNotice`/`listProjects`/
  `projectExists`/`readSnapshot*`/`projectKey` (v1-only, code: :115-341) and the v1
  `renameCurrentProject` (:415)/`deleteProject` (:428).
- **`hydrateProjectOnBoot(): Promise<void>`** (design §1.7 step 3): open DB; **schema-purge
  scan** — for each `listMeta()` row where `schemaVersion !== PROJECT_SCHEMA_VERSION` OR
  its snapshot is missing/fails `normalizeSnapshot`+`applyProjectSnapshot` dry checks:
  `deleteProjectRecords(id)` + `deleteProjectAssets(id)` (P9.06) and name it in one boot
  `warning` notification (kept rows pass through `normalizePart` on load exactly as today,
  doc + every kept history entry). Then resolve the project to open: `?project=<id>` URL
  param (strip via `history.replaceState` like `?load=`) → `flexo:currentProjectId`
  pointer → newest `savedAt` → `createProject('Untitled')` (fallback ladder preserved,
  census: pm §1.6). Load snapshot + history record, `applyProjectSnapshot`, set
  `$currentProjectId`/`$projectName`, `acquireProjectLock(id)`, `startAutosave()`,
  `reloadIndex()`.
- **Lifecycle actions** (wired into projectIndexStore's declared API):
  `createProject(name?)` — fresh id via `newProjectId()`, `uniqueProjectName('Untitled')`,
  `newPart()` + `$layerView.set({})` + `resetCamera()` under `suspended` (v1 semantics,
  code: :370-382), immediate full write, switch, acquire lock, status flash
  `New project "<name>"`. `openProject(id)` — `flushAutosave()` + `requestThumbnail()`
  (P9.08) for the OUTGOING project, release its lock, load records, apply, acquire lock,
  `modeStore.setMode('build')` (foundation §2.4 "Project load/switch"), dialogs closed via
  dialogStore. Open **replaces** history stacks wholesale (v1 semantics — design §1.8).
  `duplicateProject(id)` — new id, name `"<name> copy"` unique-ified, copy snapshot + thumb
  + `copyProjectAssets(id, newId)` (P9.06); **history NOT copied**; does NOT switch; status
  flash with an **[Open]** action (design §2.2). `deleteProject(id)` —
  `deleteProjectRecords` + `deleteProjectAssets`; if current: switch to newest remaining
  else `createProject` (v1 semantics, code: :428-434). `renameProject`/`setProjectDescription`
  per P9.03.
- `loadSharedProject(env)` — v1 guts (code: :390-409 — `envelopeToPart`, reset stores,
  `resetCamera`) but lands as a NEW project with a **fresh project id** + unique name
  (design §5, D1), full write, switch.
- **Undo enrollment: NONE of the above are undo steps**; `openProject` replaces the stacks
  (design §1.8 table). Autosave never pushes undo.
**Verify**: `pnpm test` — port `projectStore.test.ts` (current cases at :37-354) to the IDB
model via `vi.mock('./projectDb')` in-memory backend (+ mock `./assetDb`-derived
`deleteProjectAssets` from P9.06 if landed; else stub): keep every existing behavioral case
(round-trip, active-layer clamp, most-recent ordering, create/delete semantics, schema
purge + named notice, normalize doc+history, never-overwrite-present-values) and ADD:
history stored separately and capped at MAX_UNDO; snapshot write at 300 ms vs history at
1500 ms (vi.useFakeTimers); failed put flips `$autosaveHealth` and recovery flips back;
`purgeV1ProjectKeys` removes keys and reports names without parsing values; rename-collision
auto-suffix. `pnpm typecheck` will list every remaining v1-API consumer — fix ONLY compile
errors here (UI rework comes later in the phase); temporary shims are allowed only inside
the files that die later this phase (mark `// P9 temp`).

#### P9.05 — Boot sequence v2 in `main.tsx` (awaited hydrate, order preserved)
**Goal**: make boot follow design §1.7 exactly, keeping the single-paint property.
**Files**:
- modify `src/main.tsx`
- modify `src/app.tsx` (remove the purge-toast effect)
**Depends on**: P9.04.
**Spec**: (design: projects §1.7, §13.1; census: pm §3 boot order). Wrap boot in an async
IIFE; current line anchors: registerEditorAidStores (main.tsx:21), hydrate call (:38),
initCustomAssets (:42), initAnimationStore (:45), share branch (:48-59), initModFolder
(:62), share decode (:67-78), render (:80).
```
1. registerEditorAidStores(...)          — unchanged, first
2. purgeV1ProjectKeys()                  — NEW (P9.04)
3. await hydrateProjectOnBoot()          — NOW AWAITED before render
4. initCustomAssets()                    — strictly after hydrate (unchanged invariant,
                                           code: customAssetStore.ts:1866)
5. initAnimationStore()
6. share-param branch                    — readShareParam(); if present suppressAboutFirstUse()
                                           and SKIP checkBuildId — both flags NOT consumed
                                           (unchanged, main.tsx:50-59)
7. checkBuildId()                        — unchanged call; notification demotion is P9.18
8. void initModFolder()
9. createRoot(...).render(<App/>)        — inside the IIFE, after the await
```
Async share decode still lands post-paint (unchanged block, now routing results through
`toast()` variants — success/danger — which the facade turns into status+notification).
Boot-queued notifications (purge notice, schema purge, lock warnings) post via `notify()`
directly — remove the `consumeRemovedProjectsNotice` toast effect in `src/app.tsx:43-53`.
`?project=<id>` handling lives inside `hydrateProjectOnBoot` (P9.04). Nothing renders until
hydrate resolves — the HTML background shows meanwhile (design §1.7 closing note).
**Verify**: `pnpm typecheck`; `pnpm dev` manual: reload restores the current project with
no flash of a wrong project; seed a fake `flexo:project:Old Rover` key → boot notification
names "Old Rover" and the key is gone; `?project=<otherId>` opens that project and the
param is stripped; share link `?load=` still opens as a new project and suppresses About.

#### P9.06 — Per-project asset namespacing in `assetDb` + `customAssetStore` (seam flip)
**Goal**: land the `pa:<projectId>:<kind>:<assetId>` key scheme, single-owner blob
lifecycle, and the `$currentProjectId`-keyed rehydrate.
**Files**:
- modify `src/state/assetDb.ts`
- modify `src/state/customAssetStore.ts`
- modify `src/state/customAssetStore.test.ts` (mock shape)
**Depends on**: P9.04 (needs `$currentProjectId` live at call time).
**Spec**: (design: projects §1.5 — THE single owner of the key scheme; design-surface-assets
§7.3 adopts it by reference and contributes `listProjectBlobs`; D7). **Coordination note**:
if the Phase 8 plan already routed assetDb access through a projectId-taking seam, this task
flips that seam's implementation to the real scheme; if not, apply the API change directly
at the call sites below — either way the END state is identical:
- `assetKeys` helpers (code: src/state/assetDb.ts:83) become
  `(projectId: string, id: string) => 'pa:' + projectId + ':' + kind + ':' + id` with kinds
  unchanged: `tex-src`, `tex-ktx2`, `mesh-glb`, `import-glb`, `emissive-paint`.
  `putAsset`/`getAsset`/`deleteAsset` signatures unchanged (they take the full key).
- NEW in assetDb:
  ```ts
  /** All keys under this project's prefix. */
  export function listProjectBlobs(projectId: string): Promise<string[]>;  // getAllKeys(IDBKeyRange.bound(`pa:${id}:`, `pa:${id};`))  — ';' = ':'+1
  export function deleteProjectAssets(projectId: string): Promise<void>;   // one range delete over the same bound
  export function copyProjectAssets(fromId: string, toId: string): Promise<void>; // read range, re-put with prefix swapped; asset ids unchanged
  /** Boot purge: delete every key WITHOUT a recognized `pa:<id>:` prefix; returns count. */
  export function purgeUnprefixedAssetKeys(): Promise<number>;
  ```
- `customAssetStore.ts`: every `assetKeys.*(id)` call gains
  `$currentProjectId.get()` as the first arg (verified call sites: :385, :411, :769-770,
  :803, :807, :856-857, :1112, :1131, :1203, :1418-1419, :1426, :1429, :1548, :1644 — grep
  `assetKeys.` for the full list at edit time). Import `$currentProjectId` from
  projectIndexStore; DROP the `$projectName` import (:44).
- `initCustomAssets` (code: customAssetStore.ts:1866): re-hydrate subscription moves from
  `$projectName.subscribe` (:1868) to `$currentProjectId.subscribe` (design §1.5 —
  "replaces the v1 `$projectName` subscription"); on first run also
  `void purgeUnprefixedAssetKeys()` and, when count > 0, post the standard boot `warning`
  notification ("Stored asset binaries from a previous flexo version were removed"). Boot
  order invariant unchanged: still called strictly after hydrate. `ensureCurrentKtx2`
  cache-invalidation untouched.
- Duplicate/delete wiring: P9.04's `duplicateProject` calls `copyProjectAssets` (descriptor
  asset ids unchanged — the namespace makes them collision-free, design §1.5);
  `deleteProject` + the boot schema purge call `deleteProjectAssets` (kills the v1 orphan
  leak, census: pm pain #11).
- **Undo enrollment: none** (blob lifecycle is not document state; the existing
  "undo restores descriptors, never bytes" contract is unchanged — design §parity).
**Verify**: update the `vi.mock('./assetDb', ...)` stub in customAssetStore.test.ts:6 to the
new signatures; add assetDb-level tests in a new `src/state/assetDb.test.ts` ONLY for pure
key/prefix helpers (range-bound string math: prefix `pa:x:` < every `pa:x:<k>` < `pa:x;`).
`pnpm test`, `pnpm typecheck`. Manual: upload a texture, duplicate the project → both
projects render it independently; delete the duplicate → DevTools shows its `pa:` keys gone.

#### P9.07 — Per-project layer view state: drop the global `flexo:layerView` key
**Goal**: end the v1 dual-persistence quirk — layer view lives ONLY in the project snapshot.
**Files**:
- modify `src/state/layerStore.ts`
**Depends on**: P9.04.
**Spec**: (census: pm §3 "Quirk: `$layerView` is dual-persisted"; design: projects §1.2
snapshot field list). Change `$layerView` from `persistentJSON('flexo:layerView', {})`
(code: src/state/layerStore.ts:39) to a plain `atom<Record<string, LayerViewState>>({})`.
The snapshot remains the only persistence (autosave subscribes to it, P9.04). Do NOT write
any code that reads the old key — abandoned persistent keys are simply ignored (foundation
§13 "v1 layout keys are simply abandoned"). **Cross-ref**: if the Phase 5A (Build
mode/Outliner) plan file already performed this flip, verify and skip. **Undo enrollment:
none** — layer view is view state, persisted-not-undoable (constitution).
**Verify**: `pnpm test` (layerStore.test.ts still passes — adjust any test that relied on
persistence); manual: toggle a layer eye, switch projects and back → per-project state
restored from the snapshot; reload → restored.

#### P9.08 — Thumbnail capture pipeline (`$thumbnailRequest` intent atom + EditorScene consumer)
**Goal**: deterministic 384×216 WebP project thumbnails on the D15 cadence.
**Files**:
- modify `src/state/projectStore.ts` (atom + `requestThumbnail()` + cadence wiring)
- modify `src/three/EditorScene.ts` (one-shot consumer)
**Depends on**: P9.04.
**Spec**: (design: projects §1.6, D15). In projectStore:
`export const $thumbnailRequest = atom<{nonce: number} | null>(null)` and
`requestThumbnail()` sets a fresh nonce — the sanctioned one-shot intent-atom pattern
(precedent: `$colliderFitRequest` / camera-snap nonce, foundation §13 "intent atoms …
untouched patterns"; find the existing subscription style in EditorScene by grepping
`Request` there and mirror it). EditorScene consumer: on nonce change, render the current
document ONCE to an offscreen 384×216 render target — deterministic framing: frame-all of
listed+visible layers, azimuth 45°, elevation 30°, current environment — `canvas.toBlob`
WebP q0.8 → `putThumb(projectId)` → update meta `hasThumb: true` + broadcast. This is a
single invalidate+render on the on-demand loop — it must NOT flip the loop continuous
(constitution §14.5). Empty document (no listed visible entities) → skip capture.
Cadence wiring (projectStore): (a) `openProject` switch-away calls `requestThumbnail()` +
awaits a microtask before applying the next snapshot; (b) `visibilitychange → hidden` while
dirty-since-last-capture; (c) a 60 s interval that fires only while dirty; (d) once right
after create/import completes. Track "dirty" as a boolean set by the autosave scheduler,
cleared on capture. **Undo enrollment: none** (metadata).
**Verify**: `pnpm typecheck`; manual: build something, switch projects → manager shows the
thumbnail; empty project shows the ⬚ placeholder glyph; leave the tab (hide) → thumb
updates. Confirm FPS counter off ⇒ no continuous rendering after capture (loop idles).

#### P9.09 — Project Manager overlay: layout, search, sort, cards, footer
**Goal**: the L dialog `projects` per design §2 (desktop grid/list + current card + footer).
**Files**:
- create `src/ui/ProjectManagerDialog.tsx`
- create `src/ui/projectFuzzy.ts` (tiny fuzzy-subsequence matcher IF Phases 1–8 did not
  already land a shared one in `src/ui/kit` — grep `fuzzy` first and reuse)
**Depends on**: P9.03, P9.04, P9.08.
**Spec**: (design: projects §2.1, §2.3; foundation §10.2; census: pm §1.3 for what it
replaces). Dialog id `'projects'`, size L, registered in the root dialog mount; opened only
via `dialogStore.$openDialog = {id:'projects'}`. Content from `useStore($projectIndex)` —
NO direct IDB reads except lazy `loadThumb(id)` per visible card (render placeholder ⬚
until resolved / when `hasThumb` false).
- Header: title, fuzzy search field (subsequence over name + description + partId), Sort
  menu (radio: Last saved default · Created · Name A–Z · Size), `＋ New Project`,
  `⤓ Import…` (opens dialog `import-project`), grid/list ToggleButton pair.
- View + sort persisted: `persistentJSON('flexo:projectManagerView', {view:'grid', sort:'saved'})`
  (design §2.1).
- **Current card** pinned wide on top with `CURRENT` chip: thumb, inline rename (click name
  → TextField, Enter commits via `renameProject` — auto-suffix status flash
  `Renamed to "Rover 2" (name taken)` when suffixed; Esc reverts), inline description ✎
  (multiline TextField, 500-char soft-cap counter, commit blur/Enter, Esc reverts),
  counts line rendering NON-ZERO counts only with a full-counts tooltip, created/saved
  relative timestamps, `bytes` line `1.8 MB (+12 MB assets)`, actions
  [Rename] [Export archive…] [Share…] ⋮.
- Other projects: grid cards (thumb, name, short counts, saved-ago, [Open], ⋮) or list rows
  (thumb 64×36 · name+description · counts · created · saved · size · actions).
- Rows whose lock is held elsewhere show the `● open in another tab` badge (derive: a row
  is lock-held if it's not `$currentProjectId` and a `navigator.locks.query()` snapshot
  lists `flexo:project:<id>` held — refresh on open; skip when locks unsupported).
- Empty state (fresh install) hint row; search empty state `No projects match "xyz"`;
  `$autosaveHealth === 'failing'` → red banner pinned above the grid (§2.3 copy).
- Footer: `All changes autosave — there is no Save button.` + storage line from
  `$storageEstimate` (`Storage: 312 MB used of ~4.2 GB`) + one-time
  **Keep storage persistent** button (`navigator.storage.persist()`; hidden once
  `navigator.storage.persisted()` resolves true) + [Close].
**Verify**: `pnpm typecheck`/`lint`; manual checklist: ⌘O opens (after P9.11); search
filters; sort orders; rename collision auto-suffixes with the flash; description counter;
grid/list toggle survives reload.

#### P9.10 — Project Manager row actions (open/duplicate/save-as/delete/export/share/new-tab)
**Goal**: complete the §2.2 action table with the inline destructive strip.
**Files**:
- modify `src/ui/ProjectManagerDialog.tsx`
**Depends on**: P9.09.
**Spec**: (design: projects §2.2 table — implement each row verbatim; foundation §10.1
inline destructive strip; §14.3 confirm policy).
- **Open**: button / card double-click / Enter → `openProject(id)`; dialog closes; current
  project shows the `CURRENT` chip instead of Open.
- **Duplicate** ⋮ → `duplicateProject(id)`; status flash `Duplicated → "Rover-7 copy"` with
  **[Open]** action; does not switch.
- **Save As…** ⋮ (current project only) → duplicate + open in one step.
- **Export archive…** ⋮/button → `dialogStore.$openDialog = {id:'export-archive',
  params:{projectId: id}}` — works for ANY row (v1 gap #12 closed).
- **Share…** ⋮ → `{id:'share-link', params:{projectId: id}}`.
- **Open in new tab** ⋮ → `window.open(import.meta.env.BASE_URL + '?project=' + id)`
  (design §1.4; base path is `/flexo/`).
- **Delete** ⋮/trash → kit `InlineConfirmStrip` ON THE ROW (never a nested modal):
  `Delete "Station Hub"? This permanently removes the project and its 12 MB of assets.
  Undo cannot restore it. [Delete] [Cancel]` (asset MB from `meta.bytes.assets`; omit the
  clause when 0). Deleting the CURRENT project appends "You'll be switched to your most
  recent project." → `deleteProject(id)` handles the switch/create fallback (P9.04).
- **Undo enrollment: none of these are undo steps** (design §1.8); delete is
  not-undoable → always confirmed with irreversibility stated (foundation §14.3).
**Verify**: manual per action; delete current project switches correctly; delete last
project creates fresh "Untitled"; no modal-in-modal anywhere (foundation §10.1).
`pnpm lint`/`typecheck`.

#### P9.11 — Project commands, File-menu wiring, Rename dialog, ⌘S flash, palette provider
**Goal**: register every §10 command and retire the v1 project UI components.
**Files**:
- create `src/ui/RenameProjectDialog.tsx` (S)
- modify the Phase-2 commands module for the File menu (grep `commands/` — e.g.
  `src/ui/commands/fileCommands.ts`; follow that phase's actual filename)
- delete `src/ui/ProjectButton.tsx`
- modify any remaining mount (grep `ProjectButton` — v1 mounts were Toolbar.tsx:25 and
  MobileTopBar.tsx:52; those files may already be gone/replaced by Phase 2)
**Depends on**: P9.09, P9.10.
**Spec**: (design: projects §3, §10 table; foundation §3 File menu, §4). Register:
| commandId | menu | keys | run |
|---|---|---|---|
| `project.new` | File → New Project | — | `createProject()` instant; flash `New project "Untitled 4"` |
| `project.manager` | File → Projects… | `⌘O` | open dialog `projects` |
| `project.rename` | File → Rename Project… | — | open dialog `rename-project` |
| `project.import` | File → Import Project… | — | open dialog `import-project` (P9.15) |
| `project.exportArchive` | File → Export Project Archive… | — | open `export-archive` `{projectId: $currentProjectId}` |
| `project.shareLink` | File → Share Link… | — | open `share-link` `{projectId: $currentProjectId}` — ALWAYS enabled (D10) |
| `project.saveFlash` | — | `⌘S` | no-op → status flash `Autosaved ✓` (foundation §3 File note) |
Dynamic palette provider: one `Open project: <name>` command per `$projectIndex` row →
`openProject(id)` (re-evaluates on query — foundation §4 dynamic providers).
`RenameProjectDialog`: single TextField seeded with the current name; Enter commits
(`renameProject($currentProjectId.get(), value)` — auto-suffix rule), Esc/Cancel closes
(design §3). Delete `ProjectButton.tsx` (census: pm §1.1 popover, LoadProjectDialog at
:155-239 — all superseded) and every wrapper an earlier phase created around it.
**Undo enrollment: none.**
**Verify**: `pnpm typecheck` (no dangling imports); ⌘O / ⌘S / File-menu items work on
desktop AND in the phone MenuSheet (same MenuSpec); palette lists "Open project: X";
Help dialog shows ⌘O/⌘S chips (registry-driven).

#### P9.12 — `projectArchive.ts`: build/parse `.flexo.tar.gz` + exact-version manifest
**Goal**: the pure archive assembly/parsing layer per §4.1.
**Files**:
- create `src/state/projectArchive.ts`
- create `src/state/projectArchive.test.ts`
**Depends on**: P9.01, P9.02, P9.04, P9.06.
**Spec**: (design: projects §4.1, §11 sketch; DECISIONS #3). Layout: `manifest.json`
(MUST be first tar entry) + `project.json` + optional `thumbnail.webp` +
`assets/<kind>/<id>`. Manifest EXACTLY the §4.1 shape:
`{format:'flexo-project-archive', archiveVersion: 1, exportVersion: PROJECT_EXPORT_VERSION,
name, description, savedAt, appBuildId: import.meta.env.VITE_BUILD_ID ?? 'dev', counts,
assets: [{kind, id, path, bytes, mime, sha256}]}`.
Export `const ARCHIVE_VERSION = 1` with a doc comment mirroring the constitution rule:
additive manifest fields never bump; a layout break bumps `archiveVersion`; wire rules for
`exportVersion` are the existing codec contract (code: src/state/projectCodec.ts:90
`PROJECT_EXPORT_VERSION = 8` — **do not touch the codec**; the archive embeds the very same
envelope `serializeProjectJson(buildProjectExport(part, name))` produces, code:
src/state/projectTransfer.ts:165/:193 — one serializer, no archive-only dialect).
```ts
export interface ArchiveAssetEntry { kind: AssetKind; id: string; bytes: Uint8Array; mime: string; sha256: string }
export type AssetTable = ArchiveAssetEntry[];
export async function buildProjectArchive(id: ProjectId, opts: {signal?: AbortSignal; onProgress?: (phase: 'collect'|'pack'|'compress', done: number, total: number) => void}): Promise<Blob>;
export async function parseProjectArchive(file: Blob, opts?: {signal?: AbortSignal}): Promise<
  | { ok: true; manifest: ArchiveManifest; envelope: ProjectExportEnvelope; assets: AssetTable; thumbnail: Blob | null }
  | { ok: false; error: string }>;
```
`buildProjectArchive` reads the STORED snapshot (never live editor state — caller flushes
for the current project), `listProjectBlobs(id)` → per-blob tar entries under
`assets/<kind>/<assetId>` (strip the `pa:<id>:` prefix; kind/id from the key), sha256 via
`crypto.subtle.digest`, builds the part→envelope via `buildProjectExport` **with archive
context**: when the archive carries binaries, non-kitten `customMeshes` descriptors ARE
included on the wire (design §4.1 — the gate lifts only because the container provides the
bytes; add an options bag `buildProjectExport(part, name, {includeBinaryBacked: true})`
that skips the kitten-only filter; default `false` keeps v1 behavior byte-identical —
verify against projectTransfer.ts:165-190 before editing). Asset-less projects produce an
empty `assets/` and export fine. Check `signal.aborted` between per-asset steps; abort ⇒
reject with `DOMException('AbortError')`, no partial Blob escapes.
`parseProjectArchive` errors (exact copy, design §4.3): not gzip/tar → `Not a flexo
archive.`; `manifest.archiveVersion !== 1 || manifest.exportVersion !==
PROJECT_EXPORT_VERSION` → `This archive uses format v9; this flexo reads v8. flexo never
converts formats — re-export it from a matching flexo version.` (numbers interpolated);
manifest references a path missing from the tar → `Archive is incomplete (missing
assets/tex-src/t_ab12). Nothing was imported.` Envelope parsed via the existing exact-match
boundary (`parseProjectObject`, code: projectTransfer.ts:216). No migration paths of any
kind. No react/three imports; `gzipSupported()` false is surfaced by the DIALOG (P9.14),
not here.
**Verify**: `pnpm test` — cases (mock projectDb + assetDb in-memory): round-trip
build→parse recovers envelope + all asset bytes + sha256s; manifest is the FIRST entry;
version-mismatch and missing-asset error copies exact; abort mid-collect rejects with
AbortError; asset-less project round-trips with empty table.

#### P9.13 — Import with binaries: `parseProjectImport({binaryAssets})`, merge adoption + dedup
**Goal**: extend the wire boundary and merge engine so archives can carry binary-backed
assets, preserving every v1 merge rule byte-for-byte.
**Files**:
- modify `src/state/projectTransfer.ts`
- modify `src/state/editorStore.ts` (`importProjectData` signature)
- create/extend `src/state/projectTransfer.test.ts` cases
- modify `src/state/projectArchive.ts` (add `importArchive`)
**Depends on**: P9.12.
**Spec**: (design: projects §4.1 last bullet, §4.3 Merge/New/Dedup blocks; census: pm §1.8
invariants list — ALL survive verbatim).
- `parseProjectImport(text, opts?: {binaryAssets: AssetTable | null})` (code:
  projectTransfer.ts:202): `null`/absent keeps the v1 drop-smuggled-non-kitten-meshes rule
  VERBATIM (bare JSON / paste / share link); a non-null table lifts it for exactly the
  meshes whose binaries the table contains.
- `mergeProjectImport(current, env, opts?: {binaryAssets?: AssetTable | null})` (code:
  projectTransfer.ts:288): keep every existing rule (fresh collision-free ids per entity
  kind; all cross-reference rewrites — animation members/solar, couplings,
  rocket/controller/gimbal refs, consumer feeds + wiring, connector siblingIds, raw-XML
  `<ConnectorRef>`s; source layers incl. Default mirrored as NEW layers; seats appended
  preserving `iv` order; Part-Id adoption only into placeholder; light scale pinned
  (1,1,1); internalFlags only for imported templates; materials/reactions deduped by id).
  NEW: binary-backed textures/meshes get FRESH asset ids; return the old→new asset id maps
  in `MergeResult` so material channel refs, face textures, `CustomMesh` descriptors,
  `subPartId`s and their placements/GameData/animation refs are rewritten through the
  existing idRemap machinery (extend the current remap plumbing in the same style — read
  the function fully before editing).
  **Texture dedup**: for each incoming texture, candidate destination textures of the same
  kind with equal byte length; compare manifest `sha256` against the destination's hash —
  computed lazily at import and cached on the descriptor as an ADDITIVE optional field
  (`sha256?: string`; additive ⇒ NO `PROJECT_SCHEMA_VERSION` bump — constitution). Match →
  reuse the existing texture id, copy no blob. Meshes/imports NEVER dedup (identity is
  load-bearing).
- `editorStore.importProjectData(env, opts?)` (code: editorStore.ts:954): passes opts
  through; **UNDO: exactly ONE `pushUndo('import project', detail)`** exactly as today
  (:968) — the merge including adopted binary descriptors is one step. Blob copying is
  async and happens BEFORE the synchronous document mutation:
  `importArchive({mode, parsed, onProgress})` in projectArchive.ts first writes each
  adopted blob under `pa:<currentProjectId>:<kind>:<newId>` (new ids pre-minted and fed to
  `mergeProjectImport` via opts), then calls `importProjectData`. Undoing later removes
  descriptors only, never bytes (unchanged contract).
- `mode:'new'`: faithful `envelopeToPart` reconstruction — NO remap,
  `ensureBuiltInLayers` backfill (code: projectTransfer.ts:244/:270 — v1 share-link
  semantics verbatim), blobs adopted VERBATIM under the new project's namespace (ids
  unchanged), fresh project id, unique name, saved, **switched to**. **Undo: none** — it
  arrives as a fresh saved project (design §1.8).
**Verify**: `pnpm test` — extend projectTransfer.test.ts (36 existing cases must keep
passing): with `binaryAssets` a primitive+imported mesh survive the wire and get fresh ids
with placements/GameData rewritten; without it they're dropped (v1 rule); texture dedup
reuses the id on byte-identical sha256 and does NOT dedup meshes; editorStore.test.ts
(115 existing cases green) + new case: archive merge is one undo step (single ⌘Z restores
the pre-import part).

#### P9.14 — `export-archive` dialog (Summary → Progress views, any project)
**Goal**: the §4.2 export flow with clean cancel and both delivery paths.
**Files**:
- create `src/ui/ExportArchiveDialog.tsx`
**Depends on**: P9.12, P9.11.
**Spec**: (design: projects §4.2). Dialog id `export-archive`, size S→M using kit
`DialogViewStack`; param `{projectId}` (defaults handled by the command). View 1 Summary:
project name, counts line, `12 assets · ≈ 11.6 MB` (from meta.bytes), file-name TextField
seeded `sanitize(name)` with live ` → <name>.flexo.tar.gz` caption. View 2 Progress
(undismissable while running): phase label from `onProgress`
(`Collecting assets → Packing → Compressing`), `7 / 12 files · 9.1 MB`, [Cancel] aborts the
AbortController — no partial file. Mirror progress into the status-bar progress segment via
the statusStore job API (grep `trackJob` in `src/state/statusStore.ts` from the
system-services phase and use it). Source is the STORED snapshot — current project calls
`flushAutosave()` first (design §4.2). Delivery: `showSaveFilePicker` when available
(suggested name `<sanitized>.flexo.tar.gz`), else Blob + `<a download>`. Errors → danger
box in-dialog + `danger` notification. Done → close, status flash `Archive exported ✓` +
success notification. `gzipSupported()` false → unsupported-browser error box replaces the
dialog body (design §4.1). Phone: S→center / M→cover per foundation S22. **Undo: none —
export is read-only over the document.**
**Verify**: manual: export current project and a NON-current row (without opening it);
cancel mid-pack leaves no download; exported file opens in P9.15. `pnpm lint`/`typecheck`.

#### P9.15 — `import-project` dialog (Pick → Review → Importing, destination radio)
**Goal**: the §4.3 import flow — file/drop/paste in, Merge or Open-as-new out.
**Files**:
- create `src/ui/ImportProjectDialog.tsx`
- delete `src/ui/ProjectTransferDialogs.tsx`
**Depends on**: P9.13, P9.11.
**Spec**: (design: projects §4.3; foundation §10.9; census: pm §1.8). Dialog id
`import-project`, size M, DialogViewStack, 3 views:
1. **Pick**: drop zone accepting `.flexo.tar.gz` (and `.tar.gz`) + `.flexo.json`/`.json`,
   [Choose file…] input, AND the paste textarea (kept — census pain #8: v1 was paste-only;
   both inputs remain accepted). [Continue] parses: file → `parseProjectArchive`; paste/
   `.json` → `parseProjectImport(text, {binaryAssets: null})`.
2. **Review**: `Archive OK · format v1 · wire v8` line, counts + `12 assets (11.6 MB)`,
   destination radio — `(•) Merge into current project — adds everything as one undo step`
   (DEFAULT; foundation File-menu annotation) / `( ) Open as new project — becomes
   "Rover-7 2" (name taken)` (live-computed unique name); warnings disclosure when the
   parse produced warnings. [Back] [Import].
3. **Importing** (undismissable): progress `Copying assets… 7/12` → close, status flash +
   success notification, `modeStore.setMode('build')`, imported layers revealed (merge
   path: first new layer becomes active — existing `importProjectData` behavior,
   code: editorStore.ts:971).
Errors render in-dialog and NEVER half-apply (§4.3 error list; paste parse failure keeps
the v1 danger message with the dialog open — census: export §1.4). Delete
`ProjectTransferDialogs.tsx` (both v1 dialogs superseded; export-JSON is REPLACED by the
archive per LOCKED #3 — parity table row "Export Project Data JSON … superseded").
Phone: cover; drop zone becomes the file picker; paste kept. **Undo: merge = the ONE step
inside `importProjectData`; new-project = none** (state this in the dialog copy as above).
**Verify**: manual matrix: tar.gz merge / tar.gz new / pasted JSON merge / `.flexo.json`
file merge / corrupt file / version-mismatch archive (hand-edit a manifest in a test
fixture) — each shows its exact error copy; one ⌘Z fully reverts a merge.
`pnpm typecheck`; `pnpm test` still green.

#### P9.16 — `share-link` dialog (asset-less rule, explain-and-offer-archive) + boot intact
**Goal**: v1-byte-identical share pipeline behind the new dialog; D10 explain state.
**Files**:
- create `src/ui/ShareLinkDialog.tsx`
- delete `src/ui/ShareProjectDialog.tsx`
**Depends on**: P9.12 (jump target), P9.11.
**Spec**: (design: projects §5, D10; census: pm §1.9/§1.10; census: export §1.5). Dialog id
`share-link`, M; param `{projectId}`. Pipeline UNTOUCHED: `buildShareLink`/
`encodeSharePayload` (code: src/state/projectShareLink.ts:35, Zstd level 19 :32, param
`load` :25) — for a non-current project, encode from the STORED snapshot's part + meta name
(flush first when current; design §5 last bullet).
- No binary assets (`hasCustomAssets(part) === false` — kitten meshes still data-only,
  code: projectTransfer.ts:155): v1 flow verbatim — [Generate link] async → `<pre>` link +
  char count + [Copy link] (kit `CopyDownloadBar` copy affordance) + [Regenerate]; >8000
  chars warning: `Some browsers truncate URLs this long — consider an archive instead.`
- With binary assets: item stays ENABLED (foundation Law — explain, don't gray); body swaps
  to the D10 explanation block (exact copy in design §5) with
  **[Export archive instead…]** → `dialogStore.$openDialog = {id:'export-archive',
  params:{projectId}}` and [Close].
- Boot consumption: already preserved by P9.05 — assert unchanged behaviors in this task's
  verify (decode → NEW project fresh id + unique name via `loadSharedProject`; param
  stripped `replaceState`; suppresses first-use About and skips build check WITHOUT
  consuming either flag — code: main.tsx:50-59, aboutStore.ts:38; decode failure never
  touches the hydrated project).
**Undo: none.**
**Verify**: manual: asset-less project link round-trips through a fresh tab into a new
project; project with a texture shows the explain state and the jump opens export-archive
pre-scoped; regenerate/copy work; >8000-char warning appears on a big project.
`pnpm typecheck`.

#### P9.17 — Settings dialog IA: Import & Export + Advanced tabs, ONE Reset Everything
**Goal**: consolidate the scattered settings per §9.4 and make Reset a single command.
**Files**:
- modify the Phase-shell Settings dialog component (grep `SettingsDialog` /
  `dialogStore` id `settings`; created by the system-services phase)
- delete `src/ui/SettingsButton.tsx` (and its embedded Reset confirm at :211-261)
- modify `src/ui/MobileTopBar.tsx` ONLY if it still exists (v1 reset path :96-133) —
  otherwise it died in Phase 2; grep first
**Depends on**: P9.04 (storage readouts), P9.11.
**Spec**: (design: projects §9.2, §9.4; foundation §10.7, S12; census: export §1.6, §1.7).
This task builds the TAB FRAME (five tabs: General · Viewport · Scene · Import & Export ·
Advanced) plus the two tabs this area owns (Import & Export, Advanced). The
General/Viewport/Scene tab CONTENT — organizing the P2.07 sections into them and adding
the five §10.7 fields no earlier phase built — is **P9.17b** (immediately below); do not
add those fields here. The Scene-tab look-dev anchoring (M dialog anchors right-of-center
leaving ≥50% canvas visible while Scene is active; Scene sliders live-commit) is a
dialog-FRAME behavior — implement the anchoring in this task's tab frame; P9.17b fills the
tab.
- **Import & Export** tab (this area owns): *Model import* group — Up axis (Y/Z), Max
  texture size (1024/2048/4096), Bake scale (switch), **Decimate view meshes** (switch,
  caption `also affects export — full-res _VM picking meshes are slow in-game`) — all
  writing `$modelImportSettings` (code: src/state/settingsStore.ts:266). *Kitten mesh
  textures (export)* group — Source select `Bundle copies into mod` (recommended) /
  `Reference game install`; reference reveals the mono **Content/Core path** TextField
  (free text, NOT numeric) + the install-tied caveat caption kept verbatim from v1
  (census: export §1.6) — writing `$kittenTextureExport` (code: settingsStore.ts:218).
- **Advanced** tab: build id readout (mono, `import.meta.env.VITE_BUILD_ID`), storage
  usage readout (same `$storageEstimate` numbers as the manager footer), **Reset
  Everything 🔥** → inline confirm VIEW via DialogViewStack (never modal-in-modal):
  consequences list ("all projects, assets, settings, notifications — this browser only"),
  Switch **Reset folder access grants (if any)** default OFF — present on ALL platforms
  (fixes the v1 phone gap, census: pm §1.12) → `nukeAndReload({resetFsGrants})`
  (code: src/ui/nukeAndReload.ts — semantics unchanged: preserves `flexo-fs` by default,
  tolerates missing `indexedDB.databases()`, reload in `finally`; the new `flexo-projects`
  DB is covered by enumeration). Reset re-triggers first-run About (`flexo:aboutSeen`
  wiped with localStorage).
- Deep-link support: the Settings dialog must accept `dialogStore` params `{tab:
  'general' | 'viewport' | 'scene' | 'import-export' | 'advanced'}` (consumed by P10.04
  chips and View-menu deep-links; P2.07 accepted-and-ignored `params.tab` — honor it now).
- All fields persisted `@nanostores/persistent` (already are), **zero undo participation**;
  no numeric inputs exist in the two owned tabs — if any numeric field is ever added it
  MUST use `useNumberDraft` + `inputMode="url"` (constitution).
**Verify**: manual: ⌘, → tabs present; Import & Export edits round-trip to the stores
(check an export in P10 picks them up); Reset confirm shows the FS switch on phone width;
Reset wipes projects but keeps the mods-folder grant unless opted in. `pnpm typecheck`;
grep confirms `SettingsButton` gone.

#### P9.17b — Settings §10.7 completion: General / Viewport / Scene tab content + the five unbuilt fields
**Goal**: every foundation §10.7 field has its ONE Settings home — the P2.07 flat sections
move into the General/Viewport/Scene tabs, and the five designed fields no earlier phase
built (confirm threshold, ColorField highlight rows, light marker size, collider fit
margin + orient, `$simulateGlass` mirror) land.
**Files**:
- modify the Settings dialog component (`src/ui/SettingsDialog.tsx` — P2.07's file, now
  tabbed by P9.17)
- modify `src/state/settingsStore.ts` (ONE new persisted key: `$confirmThreshold`)
- modify the delete-confirm predicates that hardcode 5 (grep `<= 5\|> 5` in
  `src/ui/commands/editCommands.ts`, `src/ui/build/MultiSelectPanel.tsx`,
  `src/ui/outliner/EntityRow.tsx` — the P5A.15/P5B.15/P5B.19 confirm policy sites)
- modify `src/state/settingsStore.test.ts` (or create the case file the store's tests use)
**Depends on**: P9.17 (tab frame), P0.14 (kit `ColorField`).
**Spec**: (design: foundation §10.7 — the tab table IS the spec; §14.3 confirm policy;
system-services §7.7 ColorField row). Move, don't rebuild: every control below that P2.07
already relocated moves VERBATIM into its tab (numeric fields stay
`PreciseNumberInput`/`useNumberDraft` + `inputMode="url"`; all fields persisted
`@nanostores/persistent`; ZERO undo participation — view prefs only).
- **General**: selection-highlight colors/strengths — REBUILD the v1 SettingsModal rows on
  kit `ColorField` (P0.14; alpha enabled), writing `$selectionHighlight` (code:
  `src/state/settingsStore.ts:189` `$selectionHighlight`, persisted
  `flexo:selectionHighlight`) — this absorbs the v1 native-input TODO (system-services
  §7.7); **confirm-policy threshold** (NEW field + NEW store key):
  `export const $confirmThreshold = persistentJSON<number>('flexo:confirmThreshold', 5)`
  in settingsStore + a PreciseNumberInput (integer ≥1, clamp; caption "Deletes of up to
  this many entities skip the confirm and offer status-bar Undo") — re-point every
  §14.3 small/large predicate that hardcodes 5 to read it; **FPS counter** Switch
  (mirrors View ▸ FPS Counter — same `$showFpsCounter` store, code:
  `src/state/settingsStore.ts:292`).
- **Viewport**: per-axis grid spacing rows (moved by P2.07 — re-home); connector size
  (v1 SettingsModal row → `$connectorSettings.size`, code:
  `src/state/settingsStore.ts:22`); seat marker size + gaze cone
  (`$ivaSeatSettings.markerSize`/`.showGazeCone`, code: `:48-50`); **light marker size**
  (UI gap closed — the store field exists with no v1 UI: `$lightSettings.markerSize`,
  code: `src/state/settingsStore.ts:104`; PreciseNumberInput, m; P5B.14's caption
  "marker size → Settings → Viewport" now lands somewhere true); **collider fit margin +
  orient-to-selection** (UI gap closed — `$colliderSettings.margin` fractional
  inset/outset + `.orientToSelection` Switch, code: `src/state/colliderStore.ts:56/61`;
  P5B.12's "Fit options in Settings" caption now lands).
- **Scene**: the P2.07 "Scene" section content moves in whole (tone map select, exposure/
  reflections/sky-blur sliders, light-viz exposure mode/value) + **environment preset**
  radio (mirrors View ▸ Environment — same `$lighting` store writes) + **`$simulateGlass`
  mirror** Switch (code: `src/state/settingsStore.ts:281` `$simulateGlass`, persisted
  `flexo:simulateGlass`; caption "Kitten visor preview — simulate in-game glass"; the
  same store P8.10's Surface section toggles — a mirror, not a second source). Sliders
  live-commit against the visible canvas (the P9.17 anchoring makes this a real look-dev
  surface).
- Deep-links: `{tab:'general'|'viewport'|'scene'}` now resolve to real tabs (P2.09's
  `view.gridSettings`/`view.sceneLighting` menu items land on Viewport/Scene).
**Verify**: `pnpm typecheck`; `pnpm test` — new store case: `$confirmThreshold` defaults
5, clamps to ≥1, persists; manual: every §10.7 row findable in exactly one tab (walk the
five-tab table row by row); highlight ColorField round-trips alpha; deleting
`$confirmThreshold`+1 entities asks, threshold-or-fewer flashes with [Undo]; light marker
size slider resizes markers live; fit margin changes the next Fit to Selection result;
Scene tab open → canvas ≥50% visible and exposure slider live-commits;
`grep -rn "type=\\"color\\"\|type='color'" src/ui/SettingsDialog.tsx` → 0.

#### P9.18 — Build-mismatch demotion + purge/About notification routing; delete the modal
**Goal**: S26/D14 — no boot modal; sticky notification with [Reload] [Reset everything…].
**Files**:
- modify `src/buildCheck.ts` (or a small subscriber module if buildCheck must stay
  UI-free — put the subscription in the notification bootstrap, not in a component)
- delete `src/ui/BuildIdMismatchDialog.tsx`
- modify `src/main.tsx` (remove the `<BuildIdMismatchDialog />` mount, main.tsx:84)
**Depends on**: P9.05, P9.17.
**Spec**: (design: projects §9.1, §9.3; foundation §5.1 table last row, S26).
`checkBuildId()` logic unchanged (prod-only, share-launch skip, writes current id — code:
src/buildCheck.ts:15, `$buildMismatch` :6). Subscribe `$buildMismatch` → post ONE sticky
notification (unread, persistent):
> **flexo was updated** — a new build was deployed since your last visit. Your projects
> are unaffected (incompatible ones are removed automatically with a notice).
with actions `[Reload]` (`location.reload()`) and `[Reset everything…]` → open the Settings
dialog at `{tab:'advanced'}` pushed to its Reset confirm view (single Reset command —
P9.17). Nothing blocks boot. The schema-purge notice stays a SEPARATE boot `warning`
notification (P9.04). About/first-run: assert §9.3 kept verbatim — auto-open on true first
run, suppressed-not-consumed on share launches, MIT + RocketWerkz/Dean Hall attribution
text retained (the About dialog itself was rehosted in an earlier phase; verify only). The
v1 About-vs-purge-toast race is structurally gone (purge is a bell notification).
**Verify**: `pnpm typecheck`; grep `BuildIdMismatchDialog` → no hits; manual (dev:
temporarily force `$buildMismatch.set(true)`) → bell shows the sticky entry, Reload works,
Reset opens the Advanced confirm.

#### P9.19 — Phase 9 docs sync
**Goal**: make the docs describe the shipped storage/UX truth (AGENTS.md doc-sync mandate).
**Files**:
- modify `docs/projects.md` (rewrite)
- modify `docs/state-persistence.md`
- modify `docs/custom-assets.md`
- modify `docs/architecture.md` (boot-order section, if present — grep `hydrate`)
**Depends on**: P9.01–P9.18.
**Spec**: `docs/projects.md`: id-keyed `flexo-projects` IDB layout (§1.2 table), boot
sequence v2, autosave split + loud failure, multi-tab locks, Manager, archive format +
exact-version rule, share links (asset-less rule), thumbnails. FIX the v1 doc drift while
rewriting: camera IS persisted per-project (census: pm §1.13 flags docs/projects.md:10-11,23
claiming otherwise). `docs/state-persistence.md`: new key map — localStorage
`flexo:currentProjectId` + persistent preference keys (incl. new
`flexo:projectManagerView`), IDB `flexo-projects` / `flexo-assets` (`pa:` scheme) /
`flexo-fs`; fix the stale `flexo_toolMode` key-style examples (census: pm pain #13).
`docs/custom-assets.md`: blob keys now `pa:<projectId>:<kind>:<assetId>`; delete-sweep +
duplicate-copy lifecycle. **scope/ sync: NONE required this phase** — storage, manager,
archive and share are editor-only chrome; the KSA game contract (XML/GLB/codec) is
untouched (`PROJECT_EXPORT_VERSION` unchanged; archive wraps the existing envelope).
State that conclusion in the PR description rather than editing scope files.
**Verify**: `pnpm fmt` (oxfmt formats Markdown too — AGENTS.md:148); proofread each doc
against the implemented behavior; `pnpm fmt:check`.

---

## Phase 10 — Export to KSA v2 + Mods Folder

**Design sources**: design-projects-export.md §6, §7, §8, §9.4 (chips deep-link), §10
(commands `export.ksa` — flexo's CANONICAL id is P2.09's `file.exportKsa`; the design's name maps onto it — and `modsFolder.*`), §11 (`exportPreviewStore` sketch), §12 phone rows,
§14 export parity table (decisions D11, D12, D13); foundation §10.6 (binding invariants),
§2.5 (cross-mode jumps), §5.1 (notification routing), S22.
**Census sources**: export-integration.md §1.1 (a–e), §1.2, §1.6, §1.7, §1.10, §4 pains
1/2/3/4/5/6/9/10/12, §5 invariants (all).

**Entry state**: Phase 9 complete (Settings Import & Export tab exists with deep-link
params; dialogStore/commands/notifications live; archive dialogs shipped). The v1 export
guts (pre-flight + XmlPanel + ModPanel + FolderGrant — 415 lines in the v1
`ExportButton.tsx`) live UNCHANGED in `src/ui/ExportDialog.tsx` (P2.07 extracted them;
P2.11 deleted the trigger file), hosted by DialogRoot under dialog id `'export-ksa'` and
opened by `file.exportKsa` (⌘E, P2.12); the eager Assets-XML rebuild-per-change effect
(v1 `ExportButton.tsx:209-226` — same code, new file; anchor on the effect) still burns
KTX2 encodes.
**Exit state**: app runnable. `export-ksa` dialog (⌘E) with Deliver mod / Inspect XML
modes, unified issue model with jump links, lazy per-tab XML builds with stale-chip
Rebuild, abortable Assets build, settings chips deep-linking Settings, mods-folder grant
row + File ▸ Mods Folder ▸ menu with status/choose/re-grant/forget(confirm), zip fallback,
phone variant. `ExportButton.tsx` deleted. Wiki mini-app untouched. Game-contract builders
untouched except an optional AbortSignal parameter.

**Phase verification**:
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` clean.
2. `pnpm dev`: ⌘E opens the dialog; with a broken engine the blocker row's jump link
   switches to Engine mode focused on the module; the export button reads
   `Export anyway (N blockers)` and still writes.
3. Inspect XML: typing in the document with the dialog open on the Part tab triggers NO
   KTX2 work (watch DevTools performance/console); Assets builds only on first Assets-tab
   focus; further edits show `Project changed — [Rebuild]`.
4. Export to mods folder writes `flexo-parts/` with `-N` suffixing on XML re-export,
   binaries overwritten, mod.toml accumulated; zip downloads without any grant.
5. File ▸ Mods Folder ▸ shows the live status row; Forget confirms and empties the grant.
6. `pnpm build` still builds the wiki app; `git diff --stat apps/partpreview vite/` is empty.

---

#### P10.01 — Unified pre-flight issue model `exportIssues.ts`
**Goal**: one `{severity, area, message, jumpTarget?}` model over the basic trio + four
validators so styling/copy can't diverge (pain #9).
**Files**:
- create `src/ksa/exportIssues.ts`
- create `src/ksa/exportIssues.test.ts`
**Depends on**: none.
**Spec**: (design: projects §6.1 "Validation"; census: export §1.1.a). Pure module.
```ts
export type IssueSeverity = 'block' | 'warn' | 'info';
export interface ExportIssue {
  severity: IssueSeverity;
  area: 'part' | 'engine' | 'collider' | 'seat' | 'light' | 'asset';
  message: string;
  /** Cross-mode jump payload (foundation §2.5): consumed by modeStore.setMode. */
  jumpTarget?: { mode: Mode; focus?: unknown };
}
export function collectExportIssues(part: EditingPart, reactionIndex, catalog): ExportIssue[];
```
Fold in: the basic trio currently inlined in the dialog — empty Part Id / duplicate
instance ids / zero SubParts (code: src/ui/ExportButton.tsx:45 `validate`) — as `block`
(dup ids, since KSA refuses) / `warn` per current copy; then concat the four shared
validators mapped 1:1 into the model: `validateEngines(part, reactionIndex)`
(src/ksa/engineValidation.ts), `validateColliders(part)` (src/ksa/colliderValidation.ts),
`validateIvaSeats(part, catalog)` (src/ksa/ivaSeatValidation.ts), `validateLights(part)`
(src/ksa/lightValidation.ts) — read each validator's result shape before mapping; DO NOT
modify the validators (shared with EngineIssuesPanel, census: export §1.1.a). jumpTargets:
engine issues → `{mode:'engine', focus:{engineEntry|module}}`; duplicate-id/part issues →
`{mode:'build'}` or `{mode:'data'}` per issue kind; collider/seat/light → `{mode:'build',
focus:{entityId}}` where the validator output identifies an entity, else omit.
**Unplaced custom meshes (surface design D10 — the hand-off P8.27 defers here)**: append
one `info` issue, area `'asset'`, when any custom mesh has zero placements:
`"N custom mesh(es) have no placements and will not ship: <names>"` with
`jumpTarget: {mode:'surface'}`. Derive it from `part` inside this pure module (a mesh
whose `subPartId` appears in no `part.placements` — the SAME zero-placement rule as
customAssetStore's `$unplacedCustomMeshes` (P8.02) and the export skip at code:
`src/ksa/modExport.ts:807-808`; keep the predicates identical — this module cannot import
the store's computed, so restate the rule, not a new one). Info never blocks.
**Undo: none (pure read).**
**Verify**: `pnpm test` — cases: empty part yields the zero-SubParts issue; duplicate
instance ids yield a block; a validator block/warn/info maps severity + message verbatim;
jumpTarget present where the source identifies a scope; a part with one placed and one
unplaced custom mesh yields exactly one `info`/`'asset'` issue naming the unplaced mesh
(and none when all meshes are placed).

#### P10.02 — `exportPreviewStore.ts` + abortable `buildCustomBundle`
**Goal**: encapsulate the stamp-memoized lazy per-tab XML builds; kill the eager
KTX2-on-keystroke hole (D11; pains #2, #10).
**Files**:
- create `src/state/exportPreviewStore.ts`
- create `src/state/exportPreviewStore.test.ts`
- modify `src/ksa/modExport.ts` (optional AbortSignal on `buildCustomBundle`)
**Depends on**: none.
**Spec**: (design: projects §6.2, §11 sketch). Store (no react imports):
```ts
export const $exportPreview = map<{
  tab: 'part' | 'gamedata' | 'assets';
  part?:    { stamp: string; xml: string };
  gamedata?:{ stamp: string; xml: string };
  assets?:  { stamp: string; xml: string | null; building: boolean; stale: boolean };
}>({ tab: 'part' });
export function currentStamp(): string;      // hash of (partRef, projectName, catalog ref,
                                             //  $kittenTextureExport, decimateViewMeshes)
export function buildTab(tab, opts?: {signal?: AbortSignal}): void | Promise<void>;
export function markStaleIfChanged(): void;  // subscribed while the dialog is open
export function resetPreview(): void;        // dialog close
```
Semantics (design §6.2, verbatim): Part/GameData build on FIRST focus of their tab,
memoized by stamp (cheap sync — same single-source path as v1:
`expandGlassGlow(part)` → `buildModContent(expandedPart, projectName, catalog)`, code:
src/ksa/modExport.ts:703/:127; preview and shipped bytes can never diverge — census: export
§5 invariant 1). Assets builds ONLY on first focus of the Assets tab (async
`buildCustomBundle(ep, base, kittenTex, variants, insetIds, {signal})` → `serializeAssets`;
"Building Assets XML…" while `building`). While the dialog is open, further document
changes DO NOT rebuild — `markStaleIfChanged` compares `currentStamp()` and flips
`stale: true` (UI renders `Project changed — [Rebuild]`); refocusing the Assets tab after
leaving it auto-rebuilds once. A new build ABORTS the in-flight one via its
AbortController.
`buildCustomBundle` change (code: modExport.ts:789): append an optional trailing
`opts?: { signal?: AbortSignal }` parameter; between per-asset async steps (each texture
encode / GLB fetch / kitten bake — insert at the natural loop boundaries, read the function
first) check `opts?.signal?.aborted` and throw `new DOMException('Aborted','AbortError')`.
**Output bytes are UNCHANGED** — this is control-flow only; the KSA game contract is
untouched. No-custom-assets → the store records `xml: null` and the UI shows the v1
explanatory placeholder copy (kept verbatim from ExportButton.tsx's XmlPanel).
**Undo: none (read-only).**
**Verify**: `pnpm test` — exportPreviewStore.test.ts (mock `../ksa/modExport` builders):
part tab builds once per stamp (builder called once for two `buildTab('part')` calls, twice
after a stamp change); assets does NOT rebuild on stamp change while focused (stale flag
instead); refocus rebuilds once; abort of a slow mocked build discards its result. Existing
modExport tests (assetsXmlSerializer.test.ts etc.) still green — no byte changes.

#### P10.03 — `export-ksa` dialog: Deliver mod mode (pre-flight, grant row, chips, actions)
**Goal**: the §6.1 dialog replacing ModPanel, non-blocking policy intact.
**Files**:
- create `src/ui/ExportKsaDialog.tsx`
- modify `src/ui/commands/fileCommands.ts` (re-point the EXISTING `file.exportKsa` command — P2.09's canonical id, ⌘E bound in P2.12; do NOT register an `export.ksa` duplicate)
**Depends on**: P10.01, P10.02, P9.17 (settings deep-link).
**Spec**: (design: projects §6.1 — implement the wireframe; foundation §10.6 binding
invariants; census: export §1.1.c/d). Dialog id `export-ksa`, size L; mode
ToggleButtonGroup `[Deliver mod][Inspect XML]` (Deliver default).
- **Pre-flight**: `collectExportIssues` grouped by severity into disclosure boxes
  (🟥 "N blockers — KSA would refuse to load this mod" / 🟨 "N warnings — loads, but
  misbehaves" / ℹ "N notes"), collapsed to the count line when a box has >3 issues (pain
  #1 — warnings can no longer push the buttons below the fold). Each row with a
  `jumpTarget` renders a jump link (`→ Engine mode` etc.): closes the dialog,
  `modeStore.setMode(target.mode, focusPayload)` — a jump, not a stack (foundation §2.5).
- **Mods folder section**: the 4-state grant row VERBATIM from v1 semantics (census:
  export §1.1.c; states from `$modFolder.status`, code: src/state/modFolderStore.ts:23):
  `unsupported` → warning box + zip promoted to primary; `none` → `Choose mods folder…` →
  `pickModFolder()` (:136); `ready` → `✓ "<name>" — ready` + [Change…]; `needs-permission`
  → warning + [Re-grant] → `requestModFolderPermission()` (:154 — user gesture from the
  click). Info lines: `Writes flexo-parts/: <base>Part.xml · <base>GameData.xml ·
  <base>Assets.xml · Meshes/ Textures/ Animations/` + `Existing XML is never overwritten;
  mod.toml accumulates.`
- **Export settings chips** (read-only, deep-link): `[Kitten textures: bundle ⧉]`
  `[_VM decimation: on ⧉]` from `$kittenTextureExport`/`$modelImportSettings`; click →
  `dialogStore.$openDialog = {id:'settings', params:{tab:'import-export'}}` (design §9.4).
- **Actions**: `[Download mod zip]` (always enabled; `buildModZip`, code:
  src/ksa/modExport.ts:1137 — zero-permission fallback unchanged) and the primary
  `[Export to mods folder]`, relabeled **`Export anyway (N blockers)`** when blockers
  exist — **blockers NEVER disable either button** (D11; foundation §10.6). Primary runs
  `getWritableModFolder()` (:169 — may prompt inline, user gesture) →
  `writeModToFolder(dir, part, projectName, kittenTex, catalog)` (:1235). Busy state on
  the button + status-bar progress segment. Success → status flash
  `<Part>.xml + GameData → mods/flexo-parts ✓` AND a `rich` "Export complete" notification
  listing written files + the pre-flight summary at export time (foundation §5.1 rich
  row). Failure → `danger` notification with the thrown message. Write semantics are the
  builders' own and untouched: `-N` non-overwrite suffixing, binaries overwrite, mod.toml
  rebuilt from disk, drop-bad-SubPart-ship-rest (census: export §5).
Command `file.exportKsa` (File → Export to KSA…, `⌘E`, always enabled — pre-flight explains; the id, menu item and binding exist since P2 — this task re-points the run at the rebuilt dialog);
repoint/replace any Phase-2 binding at the old dialog id.
**Undo: none — export is read-only over `$part`** (census: export §3).
**Verify**: manual: phase-verification items 2 and 4; both buttons enabled with blockers;
chips deep-link into Settings on the right tab. `pnpm typecheck`/`lint`.

#### P10.04 — `export-ksa` dialog: Inspect XML mode (lazy tabs, stale chip, CopyDownloadBar)
**Goal**: the §6.2 preview mode on `exportPreviewStore`.
**Files**:
- modify `src/ui/ExportKsaDialog.tsx`
**Depends on**: P10.02, P10.03.
**Spec**: (design: projects §6.2; census: export §1.1.b). Tabs `[Part][GameData][Assets]`;
read-only mono textarea (horizontally scrollable). Tab focus → `buildTab(tab)`. Assets tab:
"Building Assets XML…" placeholder while building; `⟳ built 12 s ago` caption; stale chip
`Project changed — [Rebuild]` (manual rebuild aborts + restarts); no-assets placeholder
copy kept from v1. Footer: kit `CopyDownloadBar` — Copy + `Download .xml`
(`<base><Tab>.xml`) — replacing the v1 hand-rolled copy button (pain #6; foundation §10.1).
Pre-flight strip renders COLLAPSED (counts only) at the top of this mode too. Wire the
dialog's open/close lifecycle: subscribe `markStaleIfChanged` to the same inputs the stamp
covers while open; `resetPreview()` on close; close also aborts any in-flight assets build.
**Verify**: phase-verification item 3 (no eager KTX2); Copy/Download produce the same bytes
`writeModToFolder` ships for Part/GameData (spot-check by diffing a downloaded Part.xml
against the folder-written one — the single-source invariant). `pnpm typecheck`.

#### P10.05 — File ▸ Mods Folder ▸ menu (status row, choose / re-grant / forget-with-confirm)
**Goal**: give grant management its D12 home outside the export dialog.
**Files**:
- modify the File-menu commands/MenuSpec module
- create `src/ui/ForgetModFolderConfirm.tsx` ONLY if the kit `ConfirmDialog` can't be
  driven from a command (prefer `ConfirmDialog` — this is a top-level confirm, blessed by
  foundation §10.1)
**Depends on**: P10.03 (shared store, no duplicate state).
**Spec**: (design: projects §7; foundation §3 File menu). Submenu `File ▸ Mods Folder ▸`:
- Status row: DISABLED info item rendering from `$modFolder`: `✓ "mods" — ready` /
  `⚠ "mods" — needs re-grant` / `Not set` / `Folder access unsupported in this browser`.
- `modsFolder.choose` — `Choose Folder…` → `pickModFolder()` (native picker, id
  `flexo-mods`, readwrite — existing behavior, code: modFolderStore.ts:136).
- `modsFolder.regrant` — `Re-grant Access`, enabled predicate
  `$modFolder.status === 'needs-permission'` (menu click = the required user gesture).
- `modsFolder.forget` — `Forget Folder…`, enabled only when a folder is set; CONFIRM (S):
  *"Forget access to "mods"? flexo keeps no copy of the grant; you'll re-pick the folder
  next export."* → `forgetModFolder()` (code: modFolderStore.ts:182 — finally gets UI
  outside the nuke path, pain #4).
Grant persistence unchanged (`flexo-fs/handles/modsDir`, passive `queryPermission` boot —
:116 `initModFolder`); the export dialog's inline row and this menu edit the SAME store.
Phone: the submenu rides the MenuSheet drill-down automatically (same MenuSpec).
**Undo: none.**
**Verify**: manual: status row live-updates after choosing/forgetting; Forget confirm copy
exact; re-grant appears only in `needs-permission` (simulate by revoking the permission in
browser site settings). `pnpm typecheck`.

#### P10.06 — Phone variant for `export-ksa`
**Goal**: full phone parity per §6.3 (LOCKED #6).
**Files**:
- modify `src/ui/ExportKsaDialog.tsx`
**Depends on**: P10.03, P10.04.
**Spec**: (design: projects §6.3, §12 row "Export to KSA"). L dialog → cover on phone
(foundation S22 mapping is automatic if the dialog uses the kit size system — verify).
Phone-specific: mode toggle pinned top; pre-flight boxes collapsed by default;
`unsupported` grant state (iOS) → **Download mod zip** becomes the single primary button;
XML tabs render horizontally-scrollable mono blocks + CopyDownloadBar; settings chips
deep-link into the Settings sheet. Use `useIsPhone` (src/ui/kit/useIsPhone.ts) only where
layout genuinely forks.
**Verify**: manual at <640px (responsive mode): all of the above; no horizontal page
scroll; zip-primary state when File System Access is absent (Safari responsive mode or
stub `window.showDirectoryPicker` to undefined in DevTools).

#### P10.07 — Delete `ExportDialog.tsx` (the v1 export guts) + dead wiring
**Goal**: remove the v1 export dialog component and every remnant of its v1 plumbing.
**Files**:
- delete `src/ui/ExportDialog.tsx` (the file P2.07 extracted the v1 ExportButton dialog
  guts into — `grep -rn "ExportDialog" src/` to confirm the name/path before deleting;
  the `ExportButton.tsx` trigger file already died in P2.11)
- modify any residual importer (grep `ExportDialog\|ExportButton` — expected: only
  DialogRoot's `'export-ksa'` mount, which P10.03/P10.04 re-pointed at the new component)
**Depends on**: P10.03, P10.04, P10.05, P10.06.
**Spec**: The old component carried: `validate()` (superseded by P10.01), XmlPanel + the
eager assets effect (superseded by P10.02/P10.04), ModPanel (P10.03), FolderGrant
(P10.03/P10.05). Confirm each capability's new home before deleting (census: export §1.1
inventory as the checklist). Also grep for any leftover `isOpen`/`onOpenChange`
controlled-mode plumbing from the v1 dual API (v1 `ExportButton.tsx:70-85` — P2.07 should
have deleted it; sweep now) — all gone.
**Verify**: `pnpm typecheck` (no dangling imports); `pnpm test`;
`grep -rn "ExportDialog\|ExportButton" src/` → zero hits (the new component is
`ExportKsaDialog.tsx` — P10.03 — so the old names grep clean); full manual export smoke
(folder + zip) once more.

#### P10.08 — Wiki preview app untouched — assertion task
**Goal**: prove D13: the mini-app, its contract, and the editor's non-linkage are unchanged.
**Files**: none (verification-only).
**Depends on**: P10.07.
**Spec**: (design: projects §8; census: export §1.10, §5). Assert, with evidence in the PR:
1. `git diff --stat main -- apps/partpreview vite/previewManifest.ts scripts/capture-part-thumbs.ts src/assetBase.ts` is EMPTY across Phases 9–10.
2. No editor entry point links to the app: grep `partpreview` under `src/` → only build
   config, never UI.
3. `pnpm build` succeeds end-to-end (main app then `vite build apps/partpreview` —
   package.json:9) and `dist/apps/partpreview/` is produced.
4. `src/assetBase.ts` still Node-callable + function-scoped (unmodified).
No copy-embed affordance was added anywhere (D13 — a link from a user project would lie).
**Verify**: the four checks above; paste the diff-stat output into the PR.

#### P10.09 — Phase 10 docs + scope sync check
**Goal**: docs reflect the new export UX; record the scope conclusion.
**Files**:
- modify `docs/xml-io.md` (export dialog flow section, if it describes UI — grep "Export")
- modify `docs/custom-assets.md` (export-dialog references: lazy Assets preview, chips)
- modify `docs/state-persistence.md` (no new keys this phase — verify only)
- verify `scope/custom-assets-and-mod-export.md` (no edit expected)
**Depends on**: P10.01–P10.07.
**Spec**: Document: the two-mode export dialog, unified pre-flight + jump links,
non-blocking "Export anyway" policy, lazy Assets XML + stale/Rebuild, mods-folder menu
lifecycle incl. Forget, settings chips deep-link. **scope/ sync**: the game contract is
byte-identical — builders/serializers unchanged except `buildCustomBundle`'s optional
AbortSignal (control flow only, no output change); per AGENTS.md the scope files track the
flexo↔KSA break-surface, so NO scope edit is required — but re-read
`scope/custom-assets-and-mod-export.md`'s export-pipeline section and confirm nothing it
asserts (single-source preview, `-N` suffixing, mod.toml rebuild, variant rules) was
disturbed; note the confirmation in the PR. (The one v2 refactor area that DOES touch the
game contract — per-channel easing export/import — belongs to the Animation phase, not
here.)
**Verify**: `pnpm fmt` → `pnpm fmt:check`; docs proofread against the running app.

---

### Cross-phase notes for the integrator

- **P9.06 ↔ Phase 8**: §1.5 is the single owner of the `pa:` key scheme; if the Phase 8
  file staged a seam (projectId-taking asset API), P9.06 flips it — reconcile task wording
  at merge time, END state per §1.5 either way.
- **P9.07 ↔ Phase 5A**: the layer-view global-key drop may already be done by the Build
  phase; P9.07 then degrades to a verification.
- **Undo audit for these phases**: the ONLY undo step introduced is archive
  merge-import's single `pushUndo('import project', …)` (P9.13). Everything else in
  Phases 9–10 is metadata, view state, or read-only export — none of it enrolls in undo
  (design: projects §1.8; census: export §3).
- **No migration audit**: the only v1-data touchpoints are `purgeV1ProjectKeys` (P9.04)
  and `purgeUnprefixedAssetKeys` (P9.06) — both delete-with-notice, zero conversion.


---

## flexo v2 — Implementation plan, Phase 11 (Animation mode)

Part of the flexo v2 UI refactor plan. Design corpus: `plans/flexo_v2/design/` (foundation.md is
LAW). Census of record: `analysis/flexo-v2-feature-census/animation.md`. Constitution: `AGENTS.md`.

Conventions:
- (design: `<file>` §X) cites `plans/flexo_v2/design/<file>`. Bare §-references cite
  `design-animation-mode.md` — the primary design source for this whole phase; mine it fully
  before starting any sub-phase.
- (census: `<file>` §X) cites `analysis/flexo-v2-feature-census/<file>`.
- (code: `src/...:<line>` `<symbol>`) cites the current working tree — all citations verified
  against source at plan-writing time. Earlier phases (P1–P10) will have moved some of these
  (noted where known); re-grep the cited SYMBOL if a line number has drifted.
- Mandatory end-of-task workflow for EVERY task: `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` →
  `pnpm typecheck` → `pnpm test`. "Verify" blocks list only checks beyond this baseline.

Phase 11 is split into five sub-phases that land in order, each leaving the repo compiling and
the app runnable (LOCKED #4):

| Sub-phase | Delivers |
|---|---|
| **11A** | Document model: per-channel easing (`JointSegmentEasing`), exact bézier insert-split, codec + schema bump, per-channel sampler/baker/import-fitter, CubicSpline detection, `animationStore` v2 atoms + actions + playback state machine, `computeClipIssues`, scope/animation.md sync |
| **11B** | Timeline dock: TransportBar (single playback home — both v1 scrubbers die), DopeSheetCanvas dopesheet, TrackHeaderColumn, pointer table, keyframe clipboard, zoom/fit, rest-anchor exposure, `surface:timeline` + `mode:animation` hotkey scopes |
| **11C** | Members view (docked `SubPartSetGrid`) + member painting + membership tints; right navigator (Clips / Joint tree / Easing overview / Solar); left focus editors (clip/joint/keyframe cards); AnimationPanel / AnimToolbar / MeshPickerModal / EasingEditor die |
| **11D** | Pose tooling: `PoseGizmo` (rings, free-drag, axis locks), pickable joint markers, explicit Edit Pivot tool anchored on `restAnchorTime`, working pivots, motion trajectories, posed-lock feedback |
| **11E** | Diagnostics surfacing (mode dot, export pre-flight), KSA import report block, project-transfer check, palette commands, phone parity (timeline sheet, panel/members/inspector sheets, touch pose tooling), doc touch-ups, sub-phase-spanning parity sweep |

## Phase-wide guardrails (restated from census: animation.md §5 — every task below is bound by these)

These are the **KSA game contract + editor invariants that MUST survive** the refactor verbatim.
A task that would break one of these is mis-implemented — stop and re-read the design.

1. **KSA GLB contract (scope/animation.md — untouchable)**: animation channels target JOINT
   nodes only; every mover is a NON-animated GLB leaf named exactly its SubPart instance id,
   statically offset `W_J(rest)⁻¹·placement` under its joint; exactly one parentless Part root
   node at **identity TRS** (load-bearing since KSA 5056); KSA reads only `animations[0]`;
   **LINEAR samplers only** on export — eased segments are densified to LINEAR at `BAKE_FPS = 30`
   (code: `src/ksa/animationRig.ts:68` `BAKE_FPS`); consecutive quaternions hemisphere-matched
   across the dense stream; scale channel emitted only when it varies; the hand-rolled GLB
   writer stays (code: `src/ksa/exportAnimationGlb.ts:30` `buildAnimationGlb` — three's
   GLTFExporter would prune the required empty leaf nodes).
2. **XML contract**: one `<KeyframeAnimationModule Id>` + `<KeyframeAnimation Path Id>` per
   exportable clip; `ShowDeployRetract` ⇔ `mode === 'deployRetract'`; `<SolarTracking
   DegreesPerSecond SubPart>` + `<ExcludeSubPart>` passthrough; deterministic naming via
   `animModuleId`/`animGlbPath` (code: `src/ksa/animationNaming.ts:25/30`); export gate
   `isAnimationExportable` kept verbatim (code: `src/ksa/animationNaming.ts:40`).
3. **`restKeyframeId` semantics** (code: `src/ksa/types.ts:2089`, `src/ksa/animationRig.ts:200`
   `restAnchorTime`): flexo-internal only, NEVER serialized to KSA; absent ⇒ earliest keyframe;
   imported KSA deploy clips are modeled DEPLOYED = the LAST keyframe; preview + export anchor
   on it (`W_J(t)·W_J(rest)⁻¹·placement`). v2 *exposes* it (⚓ badges, re-anchor) — it never
   changes meaning.
4. **Connectors/kittens can never be joint members** (KSA limitation verified in decomp 4939;
   constitution; census: animation.md §1.4). Every attach surface (buttons, Members view, paint,
   paste) filters to SubPart placements and *explains* skips (§7.5).
5. **Coordinates**: KSA "XYZ" Euler ≡ three.js `'ZYX'`; ALL matrix math through
   `src/three/coords.ts` `matrixFromTransform`/`transformFromMatrix`. Never hand-roll.
6. **Linear easing stored ABSENT** — exports stay byte-identical for linear clips and the data
   stays clean (code: `src/state/animationStore.ts:449` `applyEasing`). The per-channel model
   keeps this per channel (§3: sparse linear-absent storage).
7. **Undo invariant**: discrete mutations push undo internally; streaming mutations rely on ONE
   caller push at interaction start (gizmo drag-start / field focus / curve editStart). Ephemeral
   animation atoms are never undo-tracked and are clamped after undo/redo/project swap
   (code: `src/state/animationStore.ts:607` `initAnimationStore`).
8. **Numeric inputs**: every numeric field is `useNumberDraft`-based with `inputMode="url"`
   (code: `src/ui/NumberField.tsx:30,46`; also `PreciseNumberInput`, `Vec3Field`). No exceptions.
9. **Layering**: `src/state/` + `src/ksa/` never import react (three.js allowed in the existing
   animation carve-outs — `docs/architecture.md` line 26). `DopeSheetCanvas` is UI-layer;
   `computeClipIssues` is pure in `src/ksa/`.
10. **On-demand rendering**: nothing added by this phase may force the render loop continuous.
    Scene invalidation only via `EditorScene.sub()` / direct store subscription + `invalidate()`
    (docs/3d-workspace.md; census: animation.md §5 perf). **High-frequency playhead state must
    never subscribe wide React trees** — the `PreviewProgressLabel` FPS regression is documented
    at (code: `src/ui/AnimationPanel.tsx:223-229`); v2's rule: canvas-drawn tracks + leaf-only
    transport subscriptions (§5.8).
11. **No migration code, ever.** The per-channel schema change bumps versions and relies on the
    boot purge / import rejection (AGENTS.md "persisted project data"; LOCKED #3).

## Entry assumptions (seams owed by P1–P10 — verify each at phase start)

- `modeStore` with `$mode: Mode` (`'animation'` is mode 2) and the single `$activeTool` slot
  incl. `'member-paint' | 'pivot-pick'` union members (design: foundation §2.6 D2) exists since
  P4. All v1 `$inspectorMode === 'anim'` gates (EditorScene, animationStore `$isPoseEditing`)
  were mechanically re-pointed at `$mode === 'animation'` in P4. If the union members are
  missing, add them in P11C.03/P11D.04 (they are Animation-area contributions).
- The scoped hotkey registry (global/viewport/`mode:X`/`tool:X`/`surface:X`, Esc ladder) exists
  since P4; `mode:engine` `X` (P7) is the precedent for a mode scope entry.
- `statusStore` (`$statusMessage`, `$toolStatus` tool segment), `notificationStore` (`notify()`,
  rich entries), `modifierStore` (hint providers), `commandStore`/MenuSpec, `dialogStore`,
  `snapStore` (`$snapEnabled/$snapTranslateStep/$snapRotateStep`) exist since P2–P5.
- `layoutStore.$layout.timeline: { height: number; collapsed: boolean }` exists unused since
  P0.09 (`setTimelineHeight`, `toggleTimeline`); `ResizeHandle`, `FloatingWindow`, `Sheet`/phone
  primitives (PhoneTopBar, ModeTabBar, CondensedStatusBar) exist since P0/P1.
- Selection is stable-id `SelectionRef[]` since P5A with derived views keeping the names
  `$selectedPlacements`/`$selectedRefs`/`$selectedEntity`/`$hasMultiSelection`
  (code today: `src/state/selectors.ts:41` `$selectedPlacements`). Animation attach flows and
  centroid seeding use these derived views — never raw index atoms.
- The floating **Tool bar** window renders Move/Rotate/Scale from `$effectiveToolMode` and is
  visible when `$hasSelection || $isPoseEditing || $isExhaustPlacing` (P5B.08).
- The Build Outliner's **fuzzy subsequence matcher** utility exists since P5A (foundation §8) —
  reuse it for every fuzzy search in this phase; do not write a second matcher.
- v1 animation surfaces still alive at phase entry (rehosted, guts unchanged):
  `AnimationPanel` + `AnimToolbar` as the Animation-mode right-sidebar content,
  `MeshPickerModal`, `PreviewScrubber` (inline), `FloatingPreviewToolbar` (floating/phone),
  `EasingEditor`. **P11 owes their deletion** (phase-12 deletion audit rows 32–34).

If any assumption fails, adapt the task mechanically (same store/action names) and note it in
the commit message — do NOT redesign.

---

## Phase 11A — Animation data model: per-channel easing + animationStore v2

**Design sources**: design-animation-mode.md §3 (data model — the one schema change), §4 (store
design), §5.4 (exact easing split), §10 (playback state machine), §11.1 (computeClipIssues),
§11.3 (import deltas), §15 (undo matrix), §18 (implementation notes / test list); DECISIONS #8
(per-channel easing approved); foundation §13 (store rules).
**Census sources**: animation.md §1.5 (addKeyframe easing deletion — pain 18), §1.8 (easing
model), §1.9 (preview atoms), §1.11 (rest anchor), §1.12 (import fit), §3 (state map), §4 pains
14/17/18/19, §5 (constraints block — restated above as phase guardrails).

**Entry state**: v1 animation DATA MODEL as censused — with one shell-phase delta already
in place: **P4.02 re-pointed animationStore onto `$mode`** (`$isPoseEditing` derives from
`$mode === 'animation'`, the mode-exit hook unpins `$editKeyframeId` and calls
`stopAnimationPreview()`, and `animationStore.test.ts` drives modes via `setMode`) — keep
those names/semantics; everything below builds on them. Otherwise: `$animPreviewU` 0→1
drives the preview; single whole-pose easing per joint-segment; `addKeyframe` deletes the
preceding segment's easing; projectCodec `CKeyframe.es` maps jointId → one `CEasing`.

**Exit state**: App runnable and visually UNCHANGED (the v1 animation UI still runs on top of
the upgraded store — uniform-easing behavior is preserved through the new per-channel model).
Document model carries `JointSegmentEasing` per joint per segment; sampling/baking/fitting are
per-channel; inserting a keyframe is motion-neutral (exact split); `PROJECT_EXPORT_VERSION` = 9
and `PROJECT_SCHEMA_VERSION` bumped; new animationStore v2 atoms/actions exist alongside the
still-working v1 atoms; `computeClipIssues` + `$clipIssues` live; scope/animation.md updated.
All new modules unit-tested.

**Phase verification**:
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test` all green.
2. `pnpm dev`: Animation editor behaves exactly as v1 (create clip, joints, attach, pose, easing
   preset + curve drag, preview scrub/play, import a built-in part with a deploy clip — it sits
   deployed at rest and folds while scrubbing).
3. NEW: insert a keyframe mid-eased-segment → the motion is visibly unchanged (v1 dropped the
   easing).
4. Export XML/GLB of a linear clip is **byte-identical** to a pre-phase export of the same
   project (storage discipline held).
5. New/updated test files pass: `easing.test.ts`, `animationRig.test.ts`, `easingFit.test.ts`,
   `animationStore.test.ts`, `projectCodec.test.ts`, `clipIssues.test.ts`,
   `animationImport.test.ts`.
6. scope/animation.md easing + gotcha text matches the shipped code (P12.16 audits this later).

### Task ordering

P11A.01 → P11A.02 → P11A.03 → P11A.04 → P11A.05 → {P11A.06, P11A.07} → P11A.08 → P11A.09 →
P11A.10 → P11A.11 → P11A.12. Every boundary compiles; the running app never regresses.

---

#### P11A.01 — `JointSegmentEasing` types + channel helpers (additive, unused)

**Goal**: Land the per-channel easing vocabulary and pure helpers without touching the document
shape yet.
**Files**:
- Modify `src/ksa/types.ts`
- Modify `src/ksa/easing.ts`
- Modify `src/ksa/easing.test.ts`
**Depends on**: none.
**Spec**:
In `types.ts`, directly above `AnimationKeyframe` (code: `src/ksa/types.ts:2031`), add exactly
the design's types (design: design-animation-mode.md §3):

```ts
/** One interpolation channel of a joint pose. */
export type EasingChannel = 'position' | 'rotation' | 'scale';

/** Per-joint easing over the OUTGOING segment. Absent channel = linear.
 *  Uniform authoring writes the same config to all three channels; the UI
 *  renders "Uniform" when the three are structurally equal. */
export interface JointSegmentEasing {
  position?: EasingConfig;
  rotation?: EasingConfig;
  scale?: EasingConfig;
}
```

Do NOT change `AnimationKeyframe.easings` yet (that is P11A.02).

In `easing.ts` (below `isLinearEasing`, code: `src/ksa/easing.ts:49`), add channel helpers —
all pure, no new imports beyond the types:

```ts
export const EASING_CHANNELS: readonly EasingChannel[] = ['position', 'rotation', 'scale'];

/** True when every channel is absent or resolves to linear. */
export function isLinearSegmentEasing(e: JointSegmentEasing | undefined | null): boolean {
  if (!e) return true;
  return EASING_CHANNELS.every((ch) => isLinearEasing(e[ch]));
}

/** Drops linear channels; undefined when all-absent (storage discipline, design §3). */
export function normalizeSegmentEasing(
  e: JointSegmentEasing | undefined,
): JointSegmentEasing | undefined {
  if (!e) return undefined;
  const out: JointSegmentEasing = {};
  for (const ch of EASING_CHANNELS) if (!isLinearEasing(e[ch])) out[ch] = e[ch];
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The same config on all three channels (linear ⇒ undefined) — the Uniform authoring path. */
export function uniformSegmentEasing(cfg: EasingConfig): JointSegmentEasing | undefined {
  if (isLinearEasing(cfg)) return undefined;
  return { position: cfg, rotation: cfg, scale: cfg };
}

/**
 * 'mixed' when the channels differ; otherwise the shared config (undefined = uniform linear).
 * Structural equality = identical resolved control points (presets equal their tuples).
 */
export function segmentEasingUniform(
  e: JointSegmentEasing | undefined,
): EasingConfig | 'mixed' | undefined {
  if (!e) return undefined;
  const pts = EASING_CHANNELS.map((ch) => controlPointsOf(e[ch]));
  const same = pts.every((p) => p.every((v, i) => v === pts[0][i]));
  if (!same) return 'mixed';
  return e.position ?? e.rotation ?? e.scale; // all equal; undefined only if all absent
}
```

Layering note: helpers live in `easing.ts` (types.ts stays import-free of easing.ts — the
existing direction, code: `src/ksa/easing.ts:1` imports from `./types`).
**Verify**:
- `pnpm typecheck` green (types exported, unused).
- New cases in `easing.test.ts`: `isLinearSegmentEasing` (absent / all-linear / one eased);
  `normalizeSegmentEasing` drops linear channels and returns undefined for all-absent;
  `uniformSegmentEasing('linear' preset)` → undefined; `segmentEasingUniform` returns the config
  for three structurally-equal channels (preset `easeInOut` on all three), `'mixed'` when
  rotation differs, `undefined` for `undefined` input.

---

#### P11A.02 — Flip `AnimationKeyframe.easings` to per-channel (all consumers, one task)

**Goal**: The one document-schema change (design §3): `easings?: Record<string,
JointSegmentEasing>` — with every consumer updated in the same commit so behavior is UNCHANGED
(uniform reads/writes through the helpers).
**Files**:
- Modify `src/ksa/types.ts` (`AnimationKeyframe.easings`, code: `src/ksa/types.ts:2045`)
- Modify `src/ksa/animationRig.ts` (sampler + baker gates)
- Modify `src/ksa/easingFit.ts` (fit output writes)
- Modify `src/state/animationStore.ts` (`applyEasing`, `setJointSegmentEasing`,
  `setSegmentEasingAllJoints`, `addKeyframe`'s easing deletion)
- Modify `src/state/projectCodec.ts` (compile-fix only — full re-encoding is P11A.05)
- Modify `src/ui/AnimationPanel.tsx` (easing read, code: `src/ui/AnimationPanel.tsx:602`)
- Modify tests: `src/ksa/animationRig.test.ts`, `src/ksa/easingFit.test.ts`,
  `src/state/animationStore.test.ts`, `src/state/projectCodec.test.ts`
**Depends on**: P11A.01.
**Spec**:
1. `types.ts:2045`: change the field type to `Record<string, JointSegmentEasing>` and update the
   doc comment ("Optional per-channel easing for each joint over the OUTGOING segment …";
   keep the per-joint sub-window rationale sentence).
2. `animationRig.ts` — **temporary uniform bridge** (per-channel sampling proper is P11A.03,
   kept separate so this task is a pure mechanical flip):
   - `sampleJointPartsLocal` (code: `src/ksa/animationRig.ts:100`; the single `evalEasing`
     call at `:122`): land the three-alpha form NOW — compute
     `const seg = a.easings?.[jointId];` and use `evalEasing(seg?.position, linear)` for the
     position lerp, `evalEasing(seg?.rotation, linear)` for the quaternion slerp, and
     `evalEasing(seg?.scale, linear)` for the scale lerp (design §3 "three alphas instead of
     one"). This degenerates to exactly v1 behavior for uniform data — the only data that
     exists after step 4 — making P11A.03 a pure baker/test task. Never invent a cross-channel
     precedence/fallback.
   - `jointSampleTimes` (code: `src/ksa/animationRig.ts:159`): gate becomes
     `!isLinearSegmentEasing(a.easings?.[joint.id])` ("eased = ANY channel non-linear",
     design §3).
3. `easingFit.ts` fit output (code: `src/ksa/easingFit.ts:590`): wrap the produced
   `cubicBezier` in a uniform segment —
   `(kf.easings ??= {})[f.jointId] = { position: cfg, rotation: cfg, scale: cfg }` where `cfg`
   is the existing object literal. (Per-channel fitting proper is P11A.06.)
4. `animationStore.ts`:
   - `applyEasing` (code: `src/state/animationStore.ts:449`) — signature unchanged
     (`cfg: EasingConfig`), body writes `uniformSegmentEasing(cfg)` via `normalizeSegmentEasing`
     (delete the entry when undefined, delete the map when empty — same discipline).
   - `setJointSegmentEasing` / `setSegmentEasingAllJoints` (code: `:467/:480`) — unchanged
     signatures, now uniform-writing (the v1 UI keeps working identically).
   - `addKeyframe` easing deletion (code: `:392-397` `if (prev?.easings) delete prev.easings;`)
     — keep the deletion for now (exact split replaces it in P11A.04) but it now deletes the
     per-channel map; add `// TODO(P11A.04): exact split`.
5. `projectCodec.ts` `encKeyframe`/`decKeyframe` (code: `src/state/projectCodec.ts:1205/1217`):
   minimal compile fix — encode `segmentEasingUniform(e)`'s config when it is uniform, and
   decode into a uniform segment (`{position:cfg, rotation:cfg, scale:cfg}`). Add
   `// TODO(P11A.05): per-channel wire form + version bump`. (Until P11A.05 lands, a
   channel-divergent segment would lossy-encode — impossible: no authoring path writes divergent
   channels until P11A.10/11C. Note this in the commit message.)
6. `AnimationPanel.tsx:602`: `const easing = segmentEasingUniform(kf.easings?.[joint.id]);`
   and treat `'mixed'` as custom — `const value = easing === 'mixed' ? undefined : easing;`
   (unreachable state pre-11C, compile-correct).
7. Tests: update every existing easing-touching case to construct/assert per-channel maps via
   the helpers (e.g. `animationStore.test.ts:283-323` "segment easing" describe block asserts
   `kf.easings![jointId].position` etc.; `animationRig.test.ts` eased-bake cases;
   `easingFit.test.ts` round-trips; `projectCodec.test.ts` animation round-trip).
**Verify**:
- Full suite green; **no behavior change**: `pnpm dev`, author an eased segment via the v1
  EasingEditor, scrub — identical motion; export GLB of an eased clip and diff against a
  pre-task export (byte-identical — the uniform bridge samples exactly like v1).
- `animationRig.test.ts` case (add): a uniform `easeInOut` segment bakes to the SAME dense
  sample values as the identical v1 fixture (regression pin for the bridge).

---

#### P11A.03 — Per-channel sampling + baker "eased = any channel" tests

**Goal**: Lock the per-channel sampler semantics (three alphas) and the export-baker rule with
tests — the sampler code itself landed in P11A.02 step 2.
**Files**:
- Modify `src/ksa/animationRig.ts` (doc comments only, if code already correct)
- Modify `src/ksa/animationRig.test.ts`
**Depends on**: P11A.02.
**Spec** (design §3 "Sampling"): assert, with new tests:
1. **Three alphas**: a segment with `position: easeIn`, `rotation: linear (absent)`,
   `scale: easeOut` — at mid-segment t: position matches `lerp(easeIn(0.5))`, rotation matches
   plain `slerp(0.5)`, scale matches `lerp(easeOut(0.5))` (compute expected via
   `evalEasing`/`evalBezierPoints` from `easing.ts`, not copied constants).
2. **At exact keyframe times the pose is verbatim** (unchanged invariant — keeps un-eased
   baking byte-identical; code comment at `src/ksa/animationRig.ts:96-98`).
3. **Baker densification rule**: a joint whose segment has ONLY `scale` eased still densifies
   that segment to ~`BAKE_FPS` samples (`jointSampleTimes` via `isLinearSegmentEasing`); an
   all-linear joint keeps sparse keyframe endpoints exactly (existing test extends).
4. **Hemisphere/scale-when-varying/identity-root untouched**: no code change; add one
   regression test that `buildAnimationRig` still emits the Part root at identity TRS and omits
   the scale channel for a non-scaling joint (guardrail 1).
Update the file-head doc comment of `animationRig.ts` to describe per-channel warping.
**Verify**: new tests pass; `pnpm test src/ksa/animationRig.test.ts`.

---

#### P11A.04 — Exact De Casteljau easing split on keyframe insert (fixes pain 18)

**Goal**: Inserting a keyframe is ALWAYS motion-neutral: the incoming segment's easing is
subdivided exactly per joint per channel instead of deleted.
**Files**:
- Modify `src/ksa/easingFit.ts` (export the split helper)
- Modify `src/state/animationStore.ts` (`addKeyframe`)
- Modify `src/ksa/easingFit.test.ts`, `src/state/animationStore.test.ts`
**Depends on**: P11A.03.
**Spec**:
The De Casteljau subdivision **already exists**: `subdivideEasing(full, s0, s1)` (code:
`src/ksa/easingFit.ts:477` — splits the cubic at x-parameters via `paramForX`, renormalizes to
the unit square; module-private `isLinear` at `:500`). Reuse it — do not re-derive the math.

1. In `easingFit.ts`, export:

```ts
/**
 * Splits one channel's easing exactly at time-fraction `s` ∈ (0,1) of its segment
 * (De Casteljau; design-animation-mode.md §5.4). Returns null halves for linear results.
 * Exactness argument (design §5.4, verbatim): position/scale lerp is affine, and quaternion
 * slerp along one geodesic satisfies slerp(q0, slerp(q0,q1,ys), y′) = slerp(q0, q1, y′·ys),
 * so re-easing each half against the on-curve midpoint pose reproduces the original
 * composed motion identically.
 */
export function splitEasingConfigAt(
  cfg: EasingConfig,
  s: number,
): { left: EasingConfig | null; right: EasingConfig | null } {
  const pts = controlPointsOf(cfg);
  const toCfg = (p: BezierPoints): EasingConfig | null =>
    isLinear(p) ? null : { kind: 'cubicBezier', x1: p[0], y1: p[1], x2: p[2], y2: p[3] };
  return { left: toCfg(subdivideEasing(pts, 0, s)), right: toCfg(subdivideEasing(pts, s, 1)) };
}
```

(`controlPointsOf` imported from `./easing` — already imported? `easingFit.ts:3` imports
`evalBezierPoints, type BezierPoints`; extend that import.)

2. In `animationStore.addKeyframe` (code: `src/state/animationStore.ts:381-400`), replace the
   `if (prev?.easings) delete prev.easings;` block with the exact split. The on-curve pose seed
   ALREADY samples with the original easing before the mutation (`sampleJointLocal(a, j.id, t)`
   at `:388` runs before the push) — keep that ordering; then:

```ts
const idx = a.keyframes.findIndex((k) => k.id === id);
const prev = idx > 0 ? a.keyframes[idx - 1] : null;
const next = idx < a.keyframes.length - 1 ? a.keyframes[idx + 1] : null;
if (prev?.easings && next) {
  const s = (t - prev.timeSec) / (next.timeSec - prev.timeSec);
  const inserted = a.keyframes[idx];
  for (const [jointId, seg] of Object.entries(prev.easings)) {
    const leftSeg: JointSegmentEasing = {};
    const rightSeg: JointSegmentEasing = {};
    for (const ch of EASING_CHANNELS) {
      const cfg = seg[ch];
      if (!cfg || isLinearEasing(cfg)) continue;
      const { left, right } = splitEasingConfigAt(cfg, s);
      if (left) leftSeg[ch] = left;
      if (right) rightSeg[ch] = right;
    }
    if (Object.keys(leftSeg).length > 0) prev.easings[jointId] = leftSeg;
    else delete prev.easings[jointId];
    if (Object.keys(rightSeg).length > 0) (inserted.easings ??= {})[jointId] = rightSeg;
  }
  if (Object.keys(prev.easings).length === 0) delete prev.easings;
}
```

   Also per design §5.4: if a column already exists within **1 ms** of the requested time,
   `addKeyframe` is a NO-OP that returns the existing column's id (the caller selects + pins it
   and flashes the status message — UI side lands in 11B). Add that guard before the mutation:
   `const hit = findAnim($part.get(), animId)?.keyframes.find((k) => Math.abs(k.timeSec - t) < 0.001); if (hit) return hit.id;`
   (no undo step for a no-op).
3. Split halves that happen to equal a preset stay stored as `cubicBezier` — preset DISPLAY
   resolution is the UI's job (`matchingPreset`, code: `src/ui/EasingEditor.tsx:46`); do not
   snap storage to presets.
**Verify**:
- `easingFit.test.ts` new cases for `splitEasingConfigAt`: splitting `linear` returns
  `{left:null, right:null}`; splitting `easeInOut` at 0.5 yields two curves whose composition
  reproduces the full curve — for 64 sample x values, compare
  `evalEasing(full, x)` against the piecewise reconstruction
  `x < s ? y(s)·evalEasing(left, x/s) … ` (assert max abs error < 1e-4).
- `animationStore.test.ts`: REPLACE the v1 case "clears the preceding segment easing when a
  keyframe splits it" (code: `src/state/animationStore.test.ts:315`) with **"inserting a
  keyframe preserves the motion exactly"**: author a 2-keyframe clip, one joint, uniform
  `easeInOut` + a position+rotation delta; densely sample `sampleJointLocal` at 97 times → t
  matrix list; `addKeyframe` at 0.37·duration; re-sample; assert per-element matrix deltas
  < 1e-5 (pos) / quaternion angle < 0.01°. Also: overshoot custom curve (`y2 = 1.4`) case with
  the same assertion; the 1 ms no-op guard returns the existing id and pushes no undo step
  (history length unchanged).

---

#### P11A.05 — Project codec: per-channel wire form + schema/version bumps + CubicSpline flag field

**Goal**: Persist the new model per the constitution: per-channel sparse encoding, BREAKING bump
of both version constants, plus the additive `cubicSplineApprox` clip flag.
**Files**:
- Modify `src/ksa/types.ts` (add `cubicSplineApprox?: true` to `PartAnimation`)
- Modify `src/state/projectCodec.ts`
- Modify `src/state/projectStore.ts` (or wherever `PROJECT_SCHEMA_VERSION` lives after P9)
- Modify `src/state/projectCodec.test.ts`, `src/state/projectStore.test.ts` (constant refs)
**Depends on**: P11A.02.
**Spec**:
1. `types.ts` `PartAnimation` (code: `src/ksa/types.ts:2067`): add

```ts
  /**
   * Set by the KSA importer when the source GLB used CUBICSPLINE samplers — flexo decoded
   * only the keyframe VALUES, so the in-between motion is approximated (design §11.3).
   * Flexo-internal diagnostic; never serialized to KSA. Absent = exact decode.
   */
  cubicSplineApprox?: true;
```

2. `projectCodec.ts` (design §3: "`CAnimation` gains per-channel sparse encoding
   (`e: {p?, r?, s?}` per joint)"):
   - New wire type + revised `CKeyframe` (code: `src/state/projectCodec.ts:1198`):

```ts
/** Per-channel easing: p=position, r=rotation, s=scale; absent channel = linear. */
type CSegEasing = { p?: CEasing; r?: CEasing; s?: CEasing };
interface CKeyframe {
  id: string;
  t: number;
  ps: Record<string, CTransform>;
  es?: Record<string, CSegEasing>; // easings keyed by jointId (per-channel since v9)
}
```

   - `encKeyframe`: for each joint's `JointSegmentEasing`, emit only present channels
     (`p: encEasing(seg.position)` …); skip joints whose segment normalizes to empty; drop `es`
     when empty (byte discipline).
   - `decKeyframe`: reverse; run results through `normalizeSegmentEasing`; tolerate garbage
     (decode is total — unknown keys ignored, code doc: `src/state/projectCodec.ts:107-109`).
   - `CAnimation` (code: `:1231`) gains `cs?: 1` ⇔ `cubicSplineApprox`; enc/dec in
     `encAnimation`/`decAnimation` (`:1242/:1262`).
   - **Version bump**: `PROJECT_EXPORT_VERSION` 8 → 9 (code: `:90`) and append the changelog
     line above it following the existing `// vN:` convention:
     `// v9: per-channel keyframe easing — CKeyframe.es values change shape from CEasing to`
     `// {p?,r?,s?} (BREAKING), plus additive CAnimation.cs (CubicSpline-approximated import flag).`
3. `PROJECT_SCHEMA_VERSION` (code today: `src/state/projectStore.ts:80` = 2; P9 preserves the
   constant as THE compatibility contract): bump by one. Decision rule (AGENTS.md "persisted
   project data"): an existing token (`es` values) changes shape ⇒ BREAKING ⇒ bump. The P9 boot
   schema-purge scan discards stale snapshots with the standard notice; **write no conversion
   code** (guardrail 11).
4. Byte discipline test: a clip with only linear easings encodes with NO `es` key at all —
   identical wire bytes to a v8 encoding of the same clip except the version stamp.
**Verify**:
- `projectCodec.test.ts`: round-trip a clip with (a) uniform preset easing, (b) divergent
  channels (`position: easeIn`, `scale: cubicBezier`), (c) `cubicSplineApprox: true`, (d) all
  linear (asserts `es` absent). Encode → decode → deep-equal (after normalize).
- `projectStore.test.ts` stale-version cases still pass with the bumped constant (they derive
  from `PROJECT_SCHEMA_VERSION`, code: `src/state/projectStore.test.ts:158,301`).
- Manual: create a project pre-bump (dev build from the previous commit), reload on the new
  build → purge notice appears, app boots clean (no crash, no conversion).

---

#### P11A.06 — Per-channel import fitter (`easingFit`) + fit report data

**Goal**: The KSA reverse-fitter fits each channel independently (LOCKED #8) with the same
tolerances, keeping the dense-fallback; it also reports per-joint fit stats for the import
report (11E).
**Files**:
- Modify `src/ksa/easingFit.ts`
- Modify `src/ksa/easingFit.test.ts`
**Depends on**: P11A.05.
**Spec** (design §3 "Import fitter", §11.3 item 1):
1. Keep the existing pipeline intact: dominant-channel scalarization (`scalarTrajectory`, code:
   `src/ksa/easingFit.ts:87`), hold-trimming, `buildSegments` window splitting (`:193`), global
   keyframe assembly (`fitAnimationEasing`, `:541`). The CHANGE: after segment boundaries are
   fixed, fit **each channel separately** per segment instead of one shared bézier:
   - For each eased joint and each global segment inside its window, compute three scalar
     progress trajectories: position = projection on the segment's net-displacement direction
     (existing math), rotation = angle-from-segment-start (existing), scale = projection of
     `scale - scale0` on its net direction. A channel with no motion in the segment
     (net < its CONST epsilon) stays ABSENT (linear).
   - Fit each moving channel with `fitOneSegment`-style renormalized `fitBezier` (`:153/:434`).
   - **Gating stays whole-pose but per-channel-resolved**: reconstruct the pose using the three
     per-channel easings (extend `reconstructEased`/`easedResidual` (`:222/:253`) to accept a
     per-channel easing triple) and gate on the SAME tolerances — `POS_TOL` 4 mm (`:26`),
     `ROT_TOL_DEG` 2.5° (`:32`), `SCALE_TOL` (`:33`). A joint that fails keeps dense keys
     losslessly (existing `'dense'` fallback — unchanged).
   - Uniform-motion clips (single dominant channel — the common KSA case) MUST produce output
     within tolerance of the v1 fitter (regression pin below).
2. Write per-channel results through `normalizeSegmentEasing` (absent-linear discipline).
3. Add the stats wrapper (for 11E's import report; existing signature untouched):

```ts
export interface AnimationFitReport {
  jointStats: {
    jointId: string;
    kind: 'const' | 'eased' | 'dense';
    /** Channels that got a non-linear fit (eased joints only). */
    easedChannels: EasingChannel[];
  }[];
  keyframesIn: number;
  keyframesOut: number;
}
export function fitAnimationEasingDetailed(anim: PartAnimation): {
  anim: PartAnimation;
  report: AnimationFitReport;
};
// fitAnimationEasing(anim) becomes a thin wrapper returning .anim
```

**Verify**:
- `easingFit.test.ts`: (a) existing round-trip cases still pass within tolerance (the census
  notes the suite pins per-joint angular error ~2.8°, scope/animation.md line 126 — keep those
  bounds); (b) NEW: a synthetic dense clip whose position eases `easeIn` while rotation eases
  `easeOut` (bake with the P11A.03 sampler at 30 fps) reverse-fits to per-channel easings whose
  re-bake matches the dense source within POS_TOL/ROT_TOL_DEG; (c) a there-and-back wobble
  still falls back dense; (d) `fitAnimationEasingDetailed` reports kinds + eased channels
  correctly.

---

#### P11A.07 — CubicSpline detection in the GLB decoder + import plumb

**Goal**: CUBICSPLINE-sampled KSA clips no longer silently mis-decode — decode the keyframe
VALUES (middle element of each tangent triplet), flag the clip, and carry the flag through
import (design §11.3 item 2; closes scope/animation.md gotcha #3's "silent corruption").
**Files**:
- Modify `src/ksa/animationImport.ts`
- Modify `src/state/partImport.ts`
- Modify `src/ksa/animationImport.test.ts`
**Depends on**: P11A.05.
**Spec**:
1. `animationImport.ts` channel building (code: `src/ksa/animationImport.ts:219-230`): when
   `s.interpolation === 'CUBICSPLINE'`, glTF stores output rows as [inTangent, value,
   outTangent] triplets (3× input count). Build the channel from `rows.filter((_, i) => i % 3
   === 1)` (the values), `step: false`, and set a local `sawCubicSpline = true`.
2. `ImportedAnimation` (code: `:148`) gains `cubicSplineApprox: boolean`; set it in the return
   (`:350`).
3. `remapImportedAnimation` (code: `:376`): spread `...(imported.cubicSplineApprox ?
   { cubicSplineApprox: true as const } : {})` into the returned `PartAnimation`.
4. `partImport.importBuiltInPart` needs no change beyond the flag riding through `fitted`
   (`fitAnimationEasing` copies via `{ ...anim, keyframes }`, code: `src/ksa/easingFit.ts:601`
   — verify the spread preserves it; the P11A.06 rewrite must keep that spread).
**Verify**:
- `animationImport.test.ts`: build a minimal in-memory GLB (the suite already synthesizes GLBs
  — follow its fixture pattern) with one CUBICSPLINE rotation sampler; assert the decoded joint
  poses equal the value rows (not the tangents) and `cubicSplineApprox === true`; a LINEAR GLB
  decodes with the flag false/absent.

---

#### P11A.08 — animationStore v2: ephemeral atoms, persisted prefs, clamping

**Goal**: Land the §4.1/§4.2 state surface (playhead in seconds, park/pin, timeline selection,
clipboard, working pivot, members view, timeline view, tree collapse) alongside the still-live
v1 atoms.
**Files**:
- Modify `src/state/animationStore.ts`
- Modify `src/state/animationStore.test.ts`
**Depends on**: P11A.04.
**Spec** (design §4.1, §4.2 — exact names):

```ts
// ── v2 ephemeral atoms (never persisted, never undo) ─────────────────────────
export const $playheadSec = atom<number>(0);          // replaces $animPreviewU (11B re-points)
export const $playheadParked = atom<boolean>(false);  // §10.1 PARK state
export const $timelineSelection = atom<string[]>([]); // selected column (keyframe) ids
export const $animClipboard = atom<{
  columns: { dt: number; poses: Record<string, Transform>; easings?: Record<string, JointSegmentEasing> }[];
} | null>(null);
export const $workingPivot = atom<{
  kind: 'centroid' | 'subpart' | 'point';
  position: Vec3;
  sourceInstanceId?: string;
} | null>(null);
export const $pivotEditing = atom<boolean>(false);    // explicit Pivot tool armed (§9.4)
export const $membersView = atom<{ open: boolean; targetJointId: string | null }>({
  open: false, targetJointId: null,
});
export const $timelineView = atom<{ startSec: number; pxPerSec: number }>({
  startSec: 0, pxPerSec: 200,
});
export const $jointTreeCollapsed = atom<Record<string, boolean>>({});
/** Normalized playhead for rig sampling (0 when no clip / zero duration). */
export const $playheadU = computed([$playheadSec, $activeAnimation], (sec, anim) =>
  anim && anim.durationSec > 0 ? Math.min(1, Math.max(0, sec / anim.durationSec)) : 0,
);

// ── persisted UI prefs (§4.2) ────────────────────────────────────────────────
export const $animTransport = persistentJSON<{
  loop: boolean; speed: 0.25 | 0.5 | 1 | 2; latched: boolean;
}>('flexo:animTransport', { loop: false, speed: 1, latched: false });
export const $animTrails = persistentJSON<'selected' | 'all' | 'off'>('flexo:animTrails', 'selected');
export const $animDurationMode = persistentJSON<'rescale' | 'keepTimes'>('flexo:animDurationMode', 'rescale');
```

(`persistentJSON` from `@nanostores/persistent` — the existing pattern, code:
`src/state/uiStore.ts:2`. `flexo:animDurationMode` per design §8.2's "tiny persisted pref".)

- `$isPoseEditing` (code: `src/state/animationStore.ts:67`) — keep, already re-pointed at
  `$mode` by P4; it remains `mode ∧ clip ∧ joint ∧ pin`.
- Extend `initAnimationStore` (code: `:607`) clamping (design §4.3 last ¶): after the existing
  id clamps also (a) filter `$timelineSelection` to existing keyframe ids; (b) null
  `$membersView.targetJointId` when the joint is gone (keep `open`); (c) clear `$workingPivot`
  when its `sourceInstanceId` no longer resolves to a placement; (d) clamp `$playheadSec` to
  `[0, activeAnim.durationSec]` (and to 0 / un-park when the clip is gone).
- Do NOT delete `$animPreviewU`/`$animScrubbing` yet (v1 UI still drives them; 11B swaps).
**Verify**:
- `animationStore.test.ts` new describe "v2 atoms clamping": build clip + joints + keyframes,
  set all new atoms, undo the keyframe add → `$timelineSelection` drops the dead id,
  `$playheadSec` clamps, `$workingPivot` with a dead sourceInstanceId clears, members target
  nulls. Persisted prefs restore defaults via `{...default}` merge (set garbage in
  localStorage → defensive read; @nanostores/persistent handles JSON parse failures — assert
  defaults win).

---

#### P11A.09 — Playback + park/pin/scrub state machine (REST / PARKED / PINNED)

**Goal**: The §10 reconciled preview state machine as pure store actions — spring drag default,
latch park, pin survives scrubs (kills pain 7), loop/speed/pause-in-place/frame-step.
**Files**:
- Modify `src/state/animationStore.ts`
- Modify `src/state/animationStore.test.ts`
**Depends on**: P11A.08.
**Spec** (design §10.1–§10.3; §4.3 rows `selectKeyframeForEditing`, `parkPlayhead`,
`returnToRest`, playback + transport setters):

```ts
/** Pin a column: park the playhead at its time and attach the pose gizmo (§10.1 PINNED). */
export function selectKeyframeForEditing(animId: string, keyframeId: string): void {
  const anim = $part.get().animations.find((a) => a.id === animId);
  const k = anim?.keyframes.find((x) => x.id === keyframeId);
  if (!anim || !k) return;
  $editKeyframeId.set(keyframeId);
  $playheadSec.set(k.timeSec);
  $playheadParked.set(true);
  // NO auto tool pick — v1's $toolMode write (animationStore.ts:83) is removed; the anchor
  // special-case is replaced by pivot ROUTING at write-back (§9.4, lands P11D.04).
}

export function parkPlayhead(sec: number): void { /* clamp to [0,dur]; park; CLEAR pin (§10.3 click rule) */ }

export function returnToRest(): void {
  cancelPlayback();
  $editKeyframeId.set(null);
  $playheadParked.set(false);
  $animScrubbing.set(false);
  const anim = $activeAnimation.get();
  $playheadSec.set(anim ? restAnchorTime(anim) : 0);
}

// Scrub session (drag on ruler/track): spring/latch/pin reconciliation (§10.3)
let scrubOrigin: { sec: number; parked: boolean; pinId: string | null } | null = null;
export function beginScrub(): void {
  cancelPlayback(); // grabbing the playhead takes over playback (kept v1 semantic)
  scrubOrigin = { sec: $playheadSec.get(), parked: $playheadParked.get(), pinId: $editKeyframeId.get() };
  $animScrubbing.set(true);
}
export function scrubTo(sec: number): void { /* clamp; $playheadSec.set(...) */ }
export function endScrub(): void {
  $animScrubbing.set(false);
  const o = scrubOrigin; scrubOrigin = null;
  if (!o) return;
  const anim = $activeAnimation.get();
  const pinKf = o.pinId ? anim?.keyframes.find((k) => k.id === o.pinId) : null;
  if (pinKf) { // pin wins over latch: re-pin exactly where editing was (§10.3)
    $editKeyframeId.set(pinKf.id); $playheadSec.set(pinKf.timeSec); $playheadParked.set(true); return;
  }
  if ($animTransport.get().latched) { $playheadParked.set(true); return; } // park at release
  if (o.parked) { $playheadSec.set(o.sec); $playheadParked.set(true); return; } // spring to park
  returnToRest(); // spring to modeled rest ⚓
}
```

Playback (replaces the v1 rAF loop, code: `src/state/animationStore.ts:121-141` — same
rAF-in-store pattern, guardrail 10):
- `playAnimationPreview()` (no arg — plays `$activeAnimation`): starts from `$playheadSec` when
  parked or pinned, else from 0; advances `$playheadSec` by `elapsed × speed`
  (`$animTransport.speed`); the pin is SUSPENDED during playback (`$editKeyframeId` left set,
  preview follows the playhead — see 11B EditorScene rule); `loop` wraps seamlessly
  (`t % duration`); non-loop end → `latched ? (park at last keyframe time)` :
  `stopAnimationPreview()`.
- `pausePreview()`: cancel rAF, `$animPlaying=false`, park in place; if a pin exists and
  `|pauseSec − pinTime| > 1e-6` clear the pin (§10.2 "pause-at-a-different-time clears the
  suspended pin").
- `stopAnimationPreview()`: cancel + `returnToRest()` (v1's snap-to-rest lives here).
- `cancelPlayback()` kept as-is (`:97`).
- Transport setters `setLoop(b)`, `setSpeed(s)`, `setLatched(b)` write `$animTransport`.
- Frame-step helper for the timeline scope: `stepPlayhead(frames: number)` — parks at
  `$playheadSec + frames/30` clamped (§12.2 `←/→` = 1/30 s bake frame); and
  `stepToKeyframe(dir: 1 | -1)` — parks + PINS the neighboring column (§5.5 item 6 `,`/`.`,
  no wrap).
- `openMembersView(jointId?)` / `closeMembersView()` — set `$membersView`; opening with no
  target defaults to `$activeJointId`.
**Verify** — `animationStore.test.ts` new describe "playback state machine" (pure atom tests,
no rAF needed except via fake timers for play):
- pin → beginScrub → scrubTo(x) → endScrub ⇒ re-pinned at the pin time (unlatched AND latched).
- parked (no pin) unlatched: endScrub springs back to the pre-drag park time.
- un-parked unlatched: endScrub returns to `restAnchorTime` (use a deploy-style clip with
  `restKeyframeId` at the LAST keyframe — asserts anchor-, not 0-, based spring).
- latched, no pin: endScrub parks at the release position.
- `parkPlayhead` clears the pin; `selectKeyframeForEditing` parks at the column time and no
  longer writes `$toolMode` (assert `$toolMode` unchanged — regression for the removed v1
  auto-pick, code: `src/state/animationStore.ts:83`).
- `pausePreview` at a non-pin time clears the pin; at the pin time keeps it.
- `stepToKeyframe` pins prev/next and does not wrap.

---

#### P11A.10 — Clip/joint/keyframe actions v2 (duration modes, duplicate, protections, clipboard, re-anchor, channel easing, pivot snaps)

**Goal**: Every §4.3 document action not yet present, with the exact undo enrollment of the §15
matrix.
**Files**:
- Modify `src/state/animationStore.ts`
- Modify `src/state/animationStore.test.ts`
**Depends on**: P11A.09.
**Spec** (design §4.3 table — implement each row precisely; undo column binding):

1. `duplicateAnimation(id)` — discrete `mutate('duplicate animation', name)`: deep clone with
   FRESH ids for the anim, every joint, every keyframe (use the store's `rid()`, code:
   `src/state/animationStore.ts:145`), remapping `poses`/`easings` keys and
   `restKeyframeId`/`parentJointId` through the old→new joint/keyframe maps;
   `memberInstanceIds` and `solarTracking` copied verbatim (same placements); name gains
   ` (copy)`. Opens the copy (`$activeAnimationId`).
2. `setAnimationDuration(animId, sec, mode: 'rescale' | 'keepTimes')` — STREAMING (caller
   pushes at focus). `'rescale'` = the existing proportional body (code: `:219-230`).
   `'keepTimes'`: `durationSec = max(sec, last keyframe time)` (clamp note surfaced by the UI,
   §8.2); keyframe times untouched.
3. `removeKeyframes(animId, ids: readonly string[]): { removed: number; skipped: number }` —
   discrete `mutate('remove keyframes', …)` (single undo step for the batch); REFUSES (counts
   as skipped) the t=0 column and the ANCHOR column (`restKeyframeId ?? earliest`) (§5.6
   protections). Clears removed ids from `$timelineSelection` and the pin. Keep the v1
   single-`removeKeyframe` as a wrapper or replace its call sites — one exported surface.
4. `moveKeyframes(animId, ids: readonly string[], dt: number)` — STREAMING; clamps every moved
   column to `(0, durationSec]`, keeps relative offsets by clamping `dt` to the tightest
   bound across the set; t=0 column immovable (drop it from the set, report via return value
   `{ blocked: boolean }` for the UI shake); continuous re-sort (`sortKeyframes`).
   `setKeyframeTime` (code: `:414`) stays for the numeric field.
5. Clipboard (§5.7): `copyKeyframes(ids)` — no undo; snapshot columns sorted by time,
   `dt` relative to the first, `structuredClone`d poses + easings.
   `pasteKeyframesAtPlayhead(): { pasted: number; clamped: boolean }` — ONE discrete
   `mutate('paste keys', …)`: first column at `$playheadSec`, others at `+dt` clamped to
   `(0, duration]`; a target within 1 ms of an existing column REPLACES that column's
   poses/easings (keeps its id); otherwise a new column is created with poses for known joints
   from the clipboard, on-curve seeds (P11A.04's sampler) for joints missing from it; clipboard
   joints that no longer exist are dropped. Works across clips (ids matched by jointId).
6. `setRestAnchor(animId, kfId)` — discrete `mutate('re-anchor rest', '@<t>s')`: set
   `restKeyframeId = kfId`, EXCEPT when kfId is the earliest keyframe → `delete
   anim.restKeyframeId` (matches the "ABSENT ⇒ earliest" convention, code:
   `src/ksa/types.ts:2082-2087`, and keeps linear exports byte-clean).
7. `setJointChannelEasing(animId, kfId, jointId, channel: EasingChannel | 'uniform', cfg)` —
   STREAMING: read the joint's `JointSegmentEasing`; `'uniform'` overwrites all three via
   `uniformSegmentEasing(cfg)`; a single channel sets/clears just that key; store through
   `normalizeSegmentEasing` (entry deleted when undefined, map deleted when empty).
   `setSegmentEasingAllJoints(animId, kfId, easing: JointSegmentEasing)` — DISCRETE, copies the
   full per-channel set to every joint (upgrade of code `:480`; keep a same-name wrapper for the
   uniform EasingConfig call until 11C rewires the UI).
8. Pivot snaps (§4.3): `setJointPivotToCentroid(jointId)` — discrete; pos-only
   `setJointPivot(animId, jointId, {position: centroid, …}, {orientation:false})` where
   centroid = mean of the CURRENT selected placements' positions (reuse
   `selectionCentroidPose`, code: `:270`). `setJointPivotPoint(jointId, worldPos: Vec3)` —
   discrete, pos-only rebase to the picked surface point (consumed by `pivot-pick`, P11D.04).
   Both call through `rebaseJointToWorld` via `setJointPivot` — NEVER reimplement the rebase
   (code: `:534` `rebaseJointToWorld`).
9. `attachToJoint` hardening (§4.3): reject non-SubPart ids — filter the input against
   `$part.placements` instance ids and return `{ attached: number; skipped: number }` for the
   status flash (guardrail 4). Undo label becomes `attach to <jointName>` with names.
10. `addJoint(animId, name?, parentJointId?)` — already supports parent (code: `:247`); no
    change; cited for the tree's "Add child joint".
**Verify** — `animationStore.test.ts` new cases:
- duplicateAnimation: fresh ids everywhere, restKeyframeId remapped, one undo step reverts.
- keepTimes duration: times untouched, clamp to last keyframe time.
- removeKeyframes refuses t=0 and anchor (deploy-style clip: anchor = last), removes the rest
  in ONE undo step.
- moveKeyframes: relative offsets kept under clamping; t=0 blocked.
- copy/paste: relative times land at playhead; collision replaces poses (same id); cross-clip
  paste with a missing joint drops it and seeds the others on-curve; ONE undo step.
- setRestAnchor to last kf sets `rk`; back to earliest deletes the field.
- setJointChannelEasing: single-channel write leaves the others absent; 'uniform' overwrites;
  linear clears; streaming (no undo push — history length unchanged mid-stream).
- attachToJoint skips a connector id with the right counts.

---

#### P11A.11 — `computeClipIssues` + `$clipIssues`

**Goal**: The pure per-clip diagnostics engine every surface consumes (clip chips, cards,
timeline hints, mode dot, export pre-flight).
**Files**:
- Create `src/ksa/clipIssues.ts`
- Create `src/ksa/clipIssues.test.ts`
- Modify `src/state/animationStore.ts` (`$clipIssues` computed)
**Depends on**: P11A.07 (flag), P11A.10.
**Spec** (design §11.1 — exact issue set):

```ts
import type { EditingPart, PartAnimation } from './types';
import { isAnimationExportable } from './animationNaming';

export interface ClipIssue {
  id: 'no-member-joint' | 'needs-second-keyframe' | 'zero-duration'
    | 'joint-without-members' | 'multi-clip-member' | 'solar-target-missing'
    | 'cubicspline-approx';
  severity: 'blocker' | 'warning';
  message: string;      // exact strings from design §11.1
  jointId?: string;     // joint-without-members
  instanceId?: string;  // multi-clip-member / solar-target-missing
}

/** Per-clip export diagnostics; keyed by animation id. Pure — UI-free (guardrail 9). */
export function computeClipIssues(part: EditingPart): Record<string, ClipIssue[]>;
```

- **Blockers** mirror `isAnimationExportable` (code: `src/ksa/animationNaming.ts:40`) EXACTLY —
  compute them from the same three predicates so gate and checklist can never drift (add a test
  asserting `blockers.length === 0 ⇔ isAnimationExportable(anim)` across a matrix of clips).
  Messages: `needs a joint with members` · `needs a 2nd keyframe` · `duration must be > 0`.
- **Warnings**: `joint "<name>" has no members` (per empty joint);
  `SubPart <id> is a member in N clips — KSA modules will fight over it` (member appears in ≥2
  clips' joints — the resolved open question 12: warn, never block);
  `solar tracking target missing / not a member` (dangling `subPartInstanceId` or one not in any
  joint's members — census: animation.md §8 Q12 + design §6.4 validation chip);
  `clip imported with CubicSpline sampling — approximated` when `cubicSplineApprox`.
- In `animationStore.ts`: `export const $clipIssues = computed([$part], computeClipIssues);`
  (design §4.1 last row).
**Verify**: `clipIssues.test.ts` matrix — empty clip (3 blockers), members+2kf+duration (clean),
empty joint warning, a SubPart in two clips (warning on BOTH clips), dangling solar target,
cubicSplineApprox flag; the gate-equivalence property test.

---

#### P11A.12 — scope/animation.md sync (game-contract doc, owed by THIS phase)

**Goal**: The scope doc reflects per-channel easing + CubicSpline detection (AGENTS.md makes
scope sync non-negotiable in the same change; P12.16 only audits).
**Files**:
- Modify `scope/animation.md`
**Depends on**: P11A.06, P11A.07.
**Spec**: Two surgical edits (the P12.16 audit text describes them — match it):
1. "Easing / curves" (code: `scope/animation.md:61-64`): state that flexo authoring is now
   **per-channel** (position/rotation/scale) cubic-bézier per joint-segment, still materialized
   by baking to dense LINEAR at 30 fps ("eased = any channel non-linear"), and recovered on
   import by **per-channel reverse-fitting** (same tolerances: pos 4 mm, rot 2.5°; per-joint
   dense fallback kept). The KSA-side contract sentence (`SampleType {Linear, Step,
   CubicSpline}`; flexo exports only LINEAR) is UNCHANGED — keep it verbatim.
2. "Known gotchas" item 3 (code: `scope/animation.md:77`): rewrite — CUBICSPLINE samplers are
   now DETECTED; flexo decodes the keyframe values (tangents dropped ⇒ in-between motion
   approximated) and flags the clip (`PartAnimation.cubicSplineApprox` → import report + clip
   diagnostics). Keep the game-side anchor citation (`KeyframeAnimationData.cs` `SampleType`).
Do not touch the baseline-version line or any other section.
**Verify**: read the diff against P12.16's expectations (phase-12.md task P12.16 items 1);
`pnpm fmt:check` (oxfmt formats Markdown).

---

## Phase 11B — Timeline dock (dopesheet + transport, LOCKED #5)

**Design sources**: design-animation-mode.md §5 (the full timeline spec — §5.1 layout, §5.2
column model, §5.3 pointer table, §5.4 insert, §5.5 TransportBar, §5.6 rest anchor, §5.7
clipboard, §5.8 rendering/perf, §5.9 zoom, §5.10 empty states), §10 (state machine consumed),
§12.1–§12.3 (hotkey scopes); foundation §9 (timeline dock overview), §11.1/§11.4 (scopes, Esc
ladder), §1.1 (region rules); DECISIONS #5.
**Census sources**: animation.md §1.5 (keyframe list), §1.9 (two scrubbers, spring semantics),
§1.15 (Escape listener), §4 pains 3/4/7/14/16/17, §6 (hotkeys: none existed).

**Entry state**: 11A store complete; v1 preview still driven by `$animPreviewU` through
`PreviewScrubber` (inline in AnimationPanel) + `FloatingPreviewToolbar`;
`layoutStore.$layout.timeline` unused; no timeline UI exists.

**Exit state**: App runnable. In Animation mode a full-width timeline dock sits between the
workspace band and the status bar: TransportBar (play/pause/stop/loop/speed/to-rest/step/time
field/＋Key/latch/trails/state chip/collapse) + TrackHeaderColumn + canvas dopesheet with
diamonds, playhead, drag-retime, multi-select, clipboard, zoom/fit, context menus, ⚓ badges +
re-anchor. Both v1 scrubbers and the AnimationPanel Escape listener are DELETED; the preview
runs on `$playheadSec`/park/pin. `surface:timeline` and `mode:animation` hotkey scopes are
registered. AnimationPanel (structural editing) still lives in the right sidebar until 11C.

**Phase verification**:
1. fmt → lint → fmt:check → typecheck → test green.
2. Manual: enter Animation mode with a deploy import — dock mounts, playhead sits at ⚓ (the
   deployed end), scene shows the modeled pose; scrub → folds; release (unlatched) → springs
   back re-pinning any pinned column; latch on → parks; Space plays (loop + speed work; pause
   parks in place); `,`/`.` pin-step columns; `K` inserts at playhead motion-neutrally;
   double-click track inserts; drag a diamond retimes (⌃ snaps to keys); ⇧-drag marquee selects
   columns; ⌘C/⌘V/⌫ clipboard; `=`/`-`/`F` zoom/fit; collapse ⌄ leaves the 32px strip; resize
   handle clamps 120px–50vh; Window ▸ Timeline hides/shows; the state chip always answers
   "why does the scene look like this".
3. Perf spot-check: play a clip with the notification/dev-tools performance panel — React
   commits during playback are confined to TransportBar leaves (no wide re-render;
   guardrail 10).
4. `grep -rn "PreviewScrubber\|FloatingPreviewToolbar\|animPreviewU" src apps` → no hits.

### Task ordering

P11B.01 → P11B.02 → P11B.03 → P11B.04 → P11B.05 → P11B.06 → P11B.07 → P11B.08 → P11B.09.
(01–03 swap the playback home regression-free; 04–08 build the dopesheet; 09 registers scopes.)

---

#### P11B.01 — TimelineDock shell: mount, resize, collapse, Window ▸ Timeline

**Goal**: The dock region exists as a real flex row in the shell (Animation mode only), with
height/collapse/hide state in `layoutStore`.
**Files**:
- Create `src/ui/animation/TimelineDock.tsx`
- Modify `src/state/layoutStore.ts` (additive `hidden` flag on `timeline`)
- Modify the shell layout component from P1 (grep `layoutStore` consumers for the row that
  renders the workspace band; add the timeline row between it and the StatusBar)
- Modify the Window-menu MenuSpec (P2 file): add `Timeline ✓ (Animation only)`
**Depends on**: 11A complete.
**Spec**:
- `TimelineDock` renders only when `$mode === 'animation'` (foundation §9; mount/unmount is the
  §2 enter/exit choreography — the dock unmounts on mode exit).
- Structure: a top `ResizeHandle` (drag = `setTimelineHeight`, invert flag set — dragging up
  grows, per the P0 ResizeHandle `invert` option), then `TransportBar` (32px, always visible),
  then the tracks area (hidden when `collapsed`). Height from `$layout.timeline.height`
  (default 220, clamp 120–50vh — the clamps already live in `setTimelineHeight`, P0.09).
- **Store extension (flagged, additive)**: `$layout.timeline` gains `hidden: boolean`
  (default false) + `setTimelineHidden(b)`. Reconciliation of the two controls (design §5.1 +
  FINAL_DESIGN_INDEX menu tree): **Window ▸ Timeline** toggles `hidden` (✓ = shown) — mirrors
  the Tool bar's `floatHidden` precedent; the **⌄ collapse** control toggles `collapsed`
  (32px transport-only strip). Defensive persisted read (`{...DEFAULTS, ...stored}`) makes the
  new key safe — no migration.
- Floating windows may overlap the dock (foundation §6.1) — no clamping changes needed
  (P0's FloatingWindow already clamps to the workspace band INCLUDING timeline rows,
  phase-00-01 P0.10 note).
- Empty-state bodies (design §5.10) render in the tracks area: no clip → "No animation clips —
  create one to start" + `[＋ Animation]` button (calls `addAnimation()`); the other two empty
  states land with the canvas (P11B.05) and Members view (11C) respectively.
- Register the `window.timeline` command in commandStore (`checked: () => !hidden`,
  `enabled: () => $mode === 'animation'`).
**Verify**:
- Manual: dock appears/disappears with mode 2/1; drag the top edge (clamps); ⌄ collapses to the
  strip; Window ▸ Timeline unmounts/remounts it; state survives reload (`flexo:layout`).
- `layoutStore.test.ts`: extend with `hidden` default + toggle case.

---

#### P11B.02 — TransportBar (the single playback home)

**Goal**: The §5.5 transport, complete, driving the 11A state machine — leaf-only subscriptions.
**Files**:
- Create `src/ui/animation/TransportBar.tsx`
**Depends on**: P11B.01.
**Spec** (design §5.5 — implement the 12 items left→right exactly; all `xs` controls):
1. **▶/⏸** — `$animPlaying ? pausePreview() : playAnimationPreview()`.
2. **⏹** — `stopAnimationPreview()`; rendered only while `$animPlaying || $playheadParked`.
3. **⟲ loop** ToggleButton ← `$animTransport.loop` (`setLoop`).
4. **Speed** Select `0.25× / 0.5× / 1× / 2×` (`setSpeed`).
5. **⏮⚓ to rest** — `returnToRest()`; tooltip "Show the modeled pose (rest anchor)".
6. **, / .** prev/next keyframe — `stepToKeyframe(-1|1)` (parks + pins; no wrap).
7. **Time readout** `t [1.240] / 3.00 s` — the current-time field is a `NumberField`
   (`useNumberDraft` + `inputMode="url"`, mono/tabular-nums styling; guardrail 8); commit =
   `parkPlayhead(v)`; the duration is a read-only label (edited in the clip card §8.2).
8. **＋Key (K)** Button — `addKeyframe(activeAnimId, $playheadSec.get())` then
   `selectKeyframeForEditing` + status flash "Keyframe added @<t>s" (or "already at… —
   selected" for the 1 ms no-op, P11A.04).
9. **🔓/🔒 latch** ToggleButton ← `$animTransport.latched` (`setLatched`).
10. **↝ trails ▾** MenuTrigger — radio Selected/All/Off ← `$animTrails` (mirrors View ▸ Motion
    Trails, wired for real in P11D.06 — the pref just sets now).
11. Right edge **⌄ collapse** — `toggleTimeline()` (layoutStore `collapsed`).
12. **State chip** (flex, between 7 and 8): `● pinned @1.20s` / `● pinned @⚓ (pivot)` /
    `parked @1.42s` / `rest ⚓` / `▶ 0.86s`; amber tint while the posed-lock condition holds
    (reads the P11D.07 status flag; until then compute `isPreviewPosed`-equivalent locally:
    posed = pinned/parked/playing/scrubbing at non-rest t). This chip REPLACES v1's
    `PreviewProgressLabel`.
**Perf discipline (guardrail 10)**: `$playheadSec` is subscribed ONLY inside two leaf
components (`TimeReadout`, `StateChip`) — never in `TransportBar` itself (the
PreviewProgressLabel lesson, code: `src/ui/AnimationPanel.tsx:223-229`). Everything else
subscribes the low-frequency atoms (`$animPlaying`, `$playheadParked`, `$animTransport`…).
Transport disabled (except ＋ Animation flows) when no clip is open (design §5.10).
**Verify**:
- Manual: every control behaves per §5.5 against the v1 AnimationPanel still mounted (both
  drive the same store — no dual-write conflicts because the old PreviewScrubber writes
  `$animPreviewU`, which the preview still reads until P11B.03; the transport writes
  `$playheadSec`. EXPECTED interim: transport buttons don't move the 3D preview until P11B.03 —
  the task boundary is compile-green and regression-free, not feature-complete).
- React DevTools: playback re-renders only TimeReadout + StateChip.

---

#### P11B.03 — Preview re-point to `$playheadSec` + delete both v1 scrubbers

**Goal**: The regression-free swap: EditorScene previews from the v2 state machine; the v1
scrub surfaces die (foundation §6.3 death list).
**Files**:
- Modify `src/three/EditorScene.ts`
- Modify `src/state/animationStore.ts` (delete `$animPreviewU`; keep `$animScrubbing`)
- Delete `src/ui/PreviewScrubber.tsx`, `src/ui/FloatingPreviewToolbar.tsx`
- Modify `src/ui/AnimationPanel.tsx` (remove PreviewProgressLabel + PreviewScrubber mounts,
  code: `src/ui/AnimationPanel.tsx:210-213`, `:223-244`)
- Modify `src/app.tsx` (remove both FloatingPreviewToolbar mounts, code: `src/app.tsx:92,107` —
  if P1 relocated them, grep `FloatingPreviewToolbar`)
- Modify `src/state/uiStore.ts` (delete `$animPreviewFloatPos` + `setAnimPreviewFloatPos`,
  code: `src/state/uiStore.ts:69-76` — abandoned key per no-migration; if P1 already moved it
  into layoutStore, delete the float entry there instead)
- Modify `src/state/animationStore.test.ts` (drop `$animPreviewU` refs, code:
  `src/state/animationStore.test.ts:14,37`)
**Depends on**: P11B.02.
**Spec**:
1. `EditorScene.applyAnimationPreview` (code: `src/three/EditorScene.ts:814-864`) — the v2
   gating rule (design §10.1):
   - Override active iff `pinned || parked || scrubbing || playing`
     (`$editKeyframeId` / `$playheadParked` / `$animScrubbing` / `$animPlaying`).
   - `t = $playheadSec.get()` ALWAYS (pin/park/step actions keep `$playheadSec` synced —
     P11A.09; this also makes the §10.2 "pin suspends during playback" rule automatic).
   - Everything else verbatim: revert-first loop, `previewOverrideMatrix`, posed
     colliders/lights maps (`positionColliders`/`positionLights`).
2. `isPreviewPosed` (code: `:776-780`): posed = override-active AND
   `|t − restAnchorTime(anim)| > 1e-6` (the §9.6 lock now keys on the ANCHOR, not u>0 — at the
   anchor the scene equals the modeled part, so placements stay editable; this also fixes the
   deploy-import case where u=0 is NOT the rest pose).
3. Subscriptions (code: `:546-552`): swap `$animPreviewU` → `$playheadSec`, add
   `$playheadParked` + `$animPlaying` (all via `this.sub()` — guardrail 10).
4. Delete `$animPreviewU` from the store; `$animScrubbing` STAYS (design §4.1). Delete
   `playAnimationPreview`'s old `animId` param form if 11A left a compat shim.
5. Delete the two component files + their mounts + the uiStore float pos. The AnimationPanel
   keeps everything else (joints/keyframes/pose/solar) working until 11C.
**Verify**:
- Manual checklist: transport now drives the 3D preview (play/pause/stop/loop/speed/to-rest);
  deploy import shows deployed at rest and folds under scrub; releasing an unlatched scrub over
  a pinned column re-pins (THE pain-7 fix: grab-scrub-release returns to editing); no floating
  scrubber anywhere; phone build shows no top-stack scrubber (its replacement chip lands in
  11E — interim phone playback path: the dock itself renders at phone widths; acceptable
  mid-phase state, note in commit).
- `grep -rn "animPreviewU\|PreviewScrubber\|FloatingPreviewToolbar\|animPreviewFloatPos" src apps`
  → zero hits.
- Tests green (undo/clamp suites updated).

---

#### P11B.04 — Dopesheet column model (pure module)

**Goal**: The §5.2 global-column model with per-joint ◆/◇ significance as a pure, tested module
the canvas consumes.
**Files**:
- Create `src/ui/animation/dopeSheetModel.ts`
- Create `src/ui/animation/dopeSheetModel.test.ts`
**Depends on**: P11B.03.
**Spec** (design §5.2):

```ts
export interface DopeColumn {
  kfId: string;
  timeSec: number;
  isAnchor: boolean;       // restKeyframeId ?? earliest (⚓ badge)
  isRest0: boolean;        // t=0 column (immovable/undeletable)
}
export interface DopeRow {
  jointId: string;
  name: string;
  depth: number;           // tree indent, mirrors parentJointId chains
  memberCount: number;     // ⚠ when 0
  collapsed: boolean;      // subtree collapsed (parent row aggregates)
  /** per column: does this joint's pose CHANGE at the column (◆) or hold (◇)? */
  marks: ('move' | 'hold')[];
  /** per segment [i → i+1]: easing summary for indicators (uniform preset name | 'custom' | 'per-channel' | null=linear). */
  segments: (string | null)[];
}
export function buildDopeSheetModel(
  anim: PartAnimation,
  collapsed: Record<string, boolean>,
): { columns: DopeColumn[]; rows: DopeRow[] };
```

- **◆ rule** (design §5.2, verbatim): solid at column k when the joint's pose differs from its
  pose at the PREVIOUS column (poses compared component-wise, ε = 1e-6), or — for the first
  column — when it differs from the SECOND column (first column with any outgoing motion).
  Everything else is ◇ (pass-through/hold).
- Rows in document order, depth from `parentJointId` chains (cycle-safe walk — reuse the
  visited-set pattern of `jointWorld`, code: `src/ksa/animationRig.ts:172-183`); a collapsed
  parent hides descendant rows and its own `marks` become the OR-aggregate of the subtree
  (hollow-stacked rendering is the canvas's concern; the model provides
  `aggregated: boolean`).
- Segment summary via `segmentEasingUniform` + `matchingPreset` logic: uniform preset → its
  name; uniform custom → `'custom'`; mixed channels → `'per-channel'`; linear → null.
  (Move `matchingPreset` from `EasingEditor.tsx:46` into `src/ksa/easing.ts` as an export in
  this task — the canvas and 11C's cards both need it; leave a re-export or update the
  EasingEditor import.)
**Verify**: `dopeSheetModel.test.ts` — the design §17 "column significance (◆/◇) rule" test:
2 joints, 4 columns where joint B holds through columns 1–2 → B marks are
`['hold'|'move'…]` per construction; anchor flag on a deploy-style clip marks the LAST column;
collapsed parent aggregates child moves; segment summaries for preset/custom/mixed/linear.

---

#### P11B.05 — DopeSheetCanvas: two-layer canvas rendering + TrackHeaderColumn

**Goal**: The §5.8-disciplined dopesheet surface: static keys layer + dynamic playhead layer,
ruler, summary row, joint rows, ⚓ badges, easing spans, hit-test index; the header column
mirrors the joint tree.
**Files**:
- Create `src/ui/animation/DopeSheetCanvas.tsx`
- Create `src/ui/animation/TrackHeaderColumn.tsx`
- Modify `src/ui/animation/TimelineDock.tsx` (compose: header | canvas)
**Depends on**: P11B.04.
**Spec**:
- **Two stacked `<canvas>` elements** (design §5.8) in a relative container sized by
  ResizeObserver × devicePixelRatio:
  - *Static layer* redraws imperatively on: `$part` animation-slice change (subscribe `$part`,
    bail early when the active anim's `joints/keyframes/restKeyframeId` are reference-equal —
    structuredClone publishing makes reference checks safe), `$timelineView`,
    `$timelineSelection`, `$activeJointId`, `$jointTreeCollapsed`, `$activeAnimationId`, size.
  - *Dynamic layer* subscribes `$playheadSec` (plus `$animScrubbing`) DIRECTLY in a
    `useEffect` and repaints ONLY the playhead line + time bubble. React state never touches
    per-frame values (guardrail 10).
- Draw (design §5.1 diagram): adaptive ruler (minor/major ticks from `pxPerSec`); sticky
  summary row `∑` (one diamond per column — hollow unless ANY joint moves there); one row per
  visible DopeRow (indent by depth; ◆ solid / ◇ hollow 45°-rotated squares ≥ 12×12 px hit
  size regardless of zoom; selection tint from `$timelineSelection`; active-joint row
  highlight); segment easing indicators (`══<name>══` label when it fits, dotted
  `∙∙per-chan∙∙` for `'per-channel'`); **⚓ badge** on every anchor-column diamond + summary
  (design §5.6) with the tooltip text from §5.6 (title attribute on a positioned hover region
  or the canvas-tooltip div — implementer's choice, text verbatim).
- Colors: resolve CSS custom properties once per draw from `getComputedStyle` (dark-only theme;
  accent/fg-muted/warning tokens — no hard-coded hex).
- Overlap clustering (design §5.3 note): diamonds closer than 12 px render one `◆N` pill;
  clicking it zooms into the cluster (write `$timelineView`).
- Build a **hit-test index** during draw: `{ x, y, kfId, jointRowIndex | 'summary' }[]` plus
  segment spans; expose via a ref for P11B.06.
- Accessibility fallback note (design §5.8): the canvas is never the only path — `,`/`.`
  stepping + the keyframe card list (11C) cover it; add an `aria-label` on the canvas region
  stating that.
- **TrackHeaderColumn** (design §5.1): resizable 100–280 px (default 140; local persisted pref
  `flexo:animTrackHeaderW` via `persistentJSON`); top cell = active clip name + `Select ▾`
  menu of clips (switch without the sidebar) + keyframe count; rows mirror the tree
  (shared `$jointTreeCollapsed` — carets collapse subtrees), name + member-count chip + ⚠
  badge (0 members, tooltip "No members — this joint won't export"); row click →
  `$activeJointId`; scroll-locked with the canvas rows (single scroll container); ruler +
  summary sticky.
**Verify**:
- Manual: diamonds match the model (author holds and moves; check ◆ vs ◇); collapse a parent —
  rows hide, parent aggregates; zoom shows cluster pills; anchor badge sits on the deploy
  import's LAST column; header resize + tree sync; playhead line tracks playback with no
  React commits in the tracks area (DevTools).
- `dopeSheetModel.test.ts` already covers the model; the canvas itself is verified manually +
  by the pointer tests of P11B.06.

---

#### P11B.06 — Dopesheet pointer interactions + context menus

**Goal**: The complete §5.3 pointer table (park/scrub/pin/multi-select/marquee/retime/insert/
segment focus/context menus) with correct undo enrollment and snapping.
**Files**:
- Modify `src/ui/animation/DopeSheetCanvas.tsx`
- Create `src/ui/animation/dopeSheetInteractions.ts` (pure gesture → action resolver, testable)
- Create `src/ui/animation/dopeSheetInteractions.test.ts`
**Depends on**: P11B.05.
**Spec** — implement design §5.3's table row by row (copy it into a code comment):

| Gesture | Result (store calls) |
|---|---|
| click ruler/empty track | `parkPlayhead(t)` (clears pin) |
| drag ruler/empty track (>4 px) | `beginScrub()` → `scrubTo(t)`… → `endScrub()` (spring/latch §10.3) |
| click diamond | `$timelineSelection = [kfId]` + `selectKeyframeForEditing` (+ joint-row click sets `$activeJointId`) |
| ⌘-click diamond | toggle in `$timelineSelection` (pin unchanged) |
| ⇧-click diamond | grow-only range from nearest selected column (`useShiftRangeSelect` SEMANTICS — reimplement the grow-only rule over column ids; the hook itself is list-DOM-bound, code: `src/ui/rangeSelect.ts:109`) |
| ⇧-drag empty track | marquee over diamonds → ADDITIVE column selection (plain drag stays scrub) |
| drag diamond | retime: `pushUndo('retime keyframe', …)` ONCE at drag start, then streaming `moveKeyframes(anim, ids, dt)` — ids = the selection when the diamond is in it, else just this column. Default snap: ruler minor-tick grid; **⌃ held: snap to other keyframes + playhead + clip start/end** (read `modifierStore.$heldModifiers.ctrl`); t=0 refuses with a shake animation + status note (the `{blocked}` return) |
| double-click empty track | `addKeyframe(anim, t)` + pin (§5.4) |
| double-click segment span | select left column + pin + focus the left Easing card for that joint/segment (11C provides the focus hook; until then set `$activeJointId` + pin — leave `// TODO(11C): focus easing card`) |
| click segment span | select left column + pin |
| right-click diamond/segment/track | context menu (below) |

- **Context menu** (kit Menu on a positioned virtual trigger; design §5.2 + §5.6): diamond →
  `Reset joint here to on-curve` (discrete `mutate('reset pose', …)` — recompute this joint's
  pose at the column from its neighboring segment: sample with the column EXCLUDED — implement
  as a new store action `resetJointPoseToCurve(animId, kfId, jointId)` in this task, discrete)
  · `Copy pose` / `Paste pose` (single-joint transfer, new store actions, discrete) ·
  `Re-anchor here` (`setRestAnchor`; status flash + [Undo] per §5.6) · `Delete keyframe`
  (column-level `removeKeyframes`). Segment adds: `Easing ▸ <10 presets> / Edit…`
  (`setJointChannelEasing(…, 'uniform', preset)` / focus card), `Copy easing`/`Paste easing`
  (JointSegmentEasing clipboard, module-local).
- Protections surfaced (design §5.6): deleting the anchor column → status
  "This keyframe is the rest anchor — re-anchor another keyframe first"; t=0 →
  "The first keyframe pins the clip start".
- Drag tooltip + status during retime: `@1.20s → 1.35s · all joints` (§5.2 honesty rule).
- Modifier-hint provider registration (design §13): timeline hover contributes
  `⌃ snap to keys · ⇧ marquee` via modifierStore's provider API.
- Pointer capture via `setPointerCapture` on the canvas; 4 px drag threshold shared with the
  scrub rule.
**Verify**:
- `dopeSheetInteractions.test.ts`-style unit tests for the resolver: click vs drag threshold,
  ⇧ grow-only range math, multi-drag dt clamping, ⌃ snap candidate set (keys + playhead +
  0/duration).
- `animationStore.test.ts`: `resetJointPoseToCurve` turns a ◆ into ◇ (pose equals on-curve
  sample; discrete undo); copy/paste pose between columns.
- Manual: every table row; retime is ONE undo step; Esc mid-drag cancels (rung 4 — pointer
  cancel restores the drag-start times via the undo entry: implement drag-cancel by
  re-applying the snapshot taken at drag start, NOT via undo()).

---

#### P11B.07 — Keyframe clipboard UI + delete confirm strip

**Goal**: §5.7 clipboard behaviors on the timeline surface, including the >5-columns confirm
strip.
**Files**:
- Modify `src/ui/animation/TimelineDock.tsx` (InlineConfirmStrip host row)
- Modify `src/ui/animation/DopeSheetCanvas.tsx` (wire ⌘C/⌘X/⌘V/⌫/⌘A handlers — bindings
  registered in P11B.09)
**Depends on**: P11B.06.
**Spec** (design §5.7):
- `⌘C` → `copyKeyframes($timelineSelection)`; `⌘X` = copy + `removeKeyframes` (protected
  columns skipped, status shows the skip count); `⌘V` → `pasteKeyframesAtPlayhead()` (status
  notes clamping); `⌘A`/`⌥⌘A` select all/none columns.
- `⌫`: ≤5 columns → delete immediately + status `Deleted N keyframes [Undo]`; >5 → the P0
  `InlineConfirmStrip` renders IN the dock (not a dialog): `Delete 8 keyframes? [Delete]
  [Cancel]` (confirm policy foundation §14.3).
- Clipboard survives clip switches within the session (`$animClipboard` is plain ephemeral —
  already true); cross-clip paste allowed.
**Verify**: manual — copy 3 columns, switch clip, paste at playhead (relative offsets kept,
missing joints seeded); cut skips t=0 with a status count; 6-column delete shows the strip;
`animationStore.test.ts` clipboard cases already cover the store (P11A.10).

---

#### P11B.08 — Timeline zoom / pan / fit + remaining empty states

**Goal**: §5.9 navigation + §5.10 hint states.
**Files**:
- Modify `src/ui/animation/DopeSheetCanvas.tsx`
**Depends on**: P11B.06.
**Spec**:
- `⌘wheel` (and pinch via ctrlKey-wheel — browsers report pinch as ctrl+wheel): zoom
  `pxPerSec` about the cursor time, clamp 20–2000 px/s. wheel-x / ⇧wheel / middle-drag: pan
  `startSec`, clamped to [−10% clip, +110%]. Write `$timelineView` (ephemeral).
- Fit helpers: `fitClip()` (whole duration + 5% margins) and `fitSelection()` — consumed by the
  `F`/`⇧F` bindings (P11B.09). Clip switch → auto-fit (subscribe `$activeAnimationId`).
- Empty states (design §5.10): single-keyframe clip → inline hint "Move the playhead, pose a
  joint, then press K — or double-click a track to add a keyframe."; joints-with-0-members →
  ⚠ header rows (P11B.05) + a hint row under the summary: "Joints need members to animate —
  open Members" (click → `openMembersView()`; renders as plain text-button until 11C mounts the
  view).
**Verify**: manual — zoom about cursor, pan clamps, `F` fits, clip switch refits; hints appear
in the right states.

---

#### P11B.09 — Hotkey scopes: `surface:timeline` + `mode:animation` + Esc rung 7 (window listener dies)

**Goal**: Register the authoritative binding set for the timeline surface and the animation
mode; delete the AnimationPanel raw window listener (pain 9).
**Files**:
- Modify the P4 hotkey registry file(s) (grep `mode:engine` for the pattern)
- Modify `src/ui/animation/TimelineDock.tsx` (focus contract)
- Modify `src/ui/AnimationPanel.tsx` (DELETE the Escape `useEffect`, code:
  `src/ui/AnimationPanel.tsx:82-94`)
**Depends on**: P11B.07, P11B.08.
**Spec** (FINAL_DESIGN_INDEX hotkey table — AUTHORITATIVE; design §12.1–§12.3):
- `mode:animation` scope (stacks on viewport): `Space` play/pause · `,`/`.` prev/next keyframe
  (park+pin) · `K` insert keyframe at playhead · `Esc` = **rung 7 unwind**: pin → unpin (stay
  parked) → parked → `returnToRest()` → clear `$activeJointId` (design §10.3/§12.3 — the area
  doc's 4-step ladder supersedes foundation §11.4's 2-step summary; the mode itself NEVER exits
  via Esc, and Esc never clears the placement selection). `⇧K` stays UNBOUND (reserved, §12.1).
- `surface:timeline` scope, active while the dock has focus (the dock claims focus on
  pointer-down like the viewport host; clicking the viewport returns focus — kept
  focus-stealing contract §12.2): `←`/`→` `stepPlayhead(∓1)` (1/30 s, parks) · `⇧←`/`⇧→` snap
  to prev/next keyframe (park, no pin — distinct from `,`/`.`) · `⌘A`/`⌥⌘A` columns
  select-all/none · `⌘C ⌘X ⌘V ⌫` clipboard · `=`/`-` zoom about playhead · `F`/`⇧F` fit
  clip/selection · `Esc` clear column selection, then blur to the ladder.
- Precedence: surface > mode > viewport (the registry's rule; timeline `F` beats viewport
  Frame Selection ONLY while the dock has focus — no conflict, §5.9).
- Registry conflict tests (P4's dev-time assertion) must stay green with the new scopes.
- Viewport-scope keys keep working in Animation mode (S8): W/S/A/D/Q/E + arrows act on the
  placement selection — inert while posing with an empty selection (unchanged, §12.1).
**Verify**:
- Help dialog now lists "Animation mode" and "Timeline" groups (auto-rendered from the
  registry, §12.4).
- Manual: Space toggles play; `,`/`.` pin-steps; `K` inserts; Esc unwinds pin→park→rest→joint
  and never exits the mode; with the dock focused, arrows step frames while viewport nudge
  arrows are overridden; clicking the viewport restores nudge arrows.
- `grep -n "addEventListener('keydown'" src/ui/AnimationPanel.tsx` → no hits.

---

## Phase 11C — Members view, right navigator, left focus editors

**Design sources**: design-animation-mode.md §6 (right navigator), §7 (Members view — the
flagship fix), §8 (left focus editors), §16 D1 (docked SubPartSetGrid — foundation-blessed),
D3 (clip re-click no longer closes); foundation §7.2 (Animation left ruleset), §8.2 (Animation
right sidebar), §10.11 (SubPartSetGrid two hosts), §11.1 (surface:members edit mirrors), §14.3
(confirm policy).
**Census sources**: animation.md §1.1–§1.4 (panel, list, joints, membership — the pain 1/2/11/12
fixes), §1.6 (PoseEditor — no scale, pain 13), §1.8 (EasingEditor semantics — carried verbatim),
§1.14 (solar), §2 (surface map — what dies), §4 pains 1/2/5(easing part)/11/12/13/19/20.

**Entry state**: 11B done — timeline is the playback home; AnimationPanel (structural editing) +
AnimToolbar still fill the Animation right sidebar; MeshPickerModal is the membership picker;
EasingEditor lives inside the panel's PoseEditor; the left sidebar is empty in Animation mode.

**Exit state**: App runnable. Right sidebar = the mode navigator (CLIPS / JOINTS tree / EASING
overview / SOLAR TRACKING) with the Members view takeover; member painting works in the
viewport with membership tints; left sidebar = clip/joint/keyframe focus cards (pose numerics
INCLUDING scale, per-channel easing editor with channel tabs, pivot + working-pivot controls —
tool wiring for pivots completes in 11D). `AnimationPanel`, `AnimToolbar`, `MeshPickerModal`,
`EasingEditor` are DELETED.

**Phase verification**:
1. fmt → lint → fmt:check → typecheck → test green.
2. Manual (the pain-2 kill test): rig a two-joint part in ONE Members session — open Members,
   target joint A, check 3 rows, Assign; switch target to joint B WITHOUT closing (checked set,
   search, filters intact), assign 2 more; paint-toggle one in the viewport; eyes un-hide a
   hidden layer; a connector row sits inert in "Not animatable" with the ⓘ explanation.
3. Parity walk of design §17 rows for census §1.2–§1.4/§1.6(numerics)/§1.8/§1.14 — every v1
   behavior reachable in the new homes.
4. `grep -rn "AnimationPanel\|AnimToolbar\|MeshPickerModal\|from './EasingEditor'\|from '../EasingEditor'" src apps`
   → zero hits.

### Task ordering

P11C.01 → P11C.02 → P11C.03 → P11C.04 (members track) → P11C.05 → P11C.06 → P11C.07 (navigator
track, independent of 03/04) → P11C.08 → P11C.09 → P11C.10 (left cards) → P11C.11 (host swap +
deletions) → P11C.12 (doc line). 05–07 may proceed in parallel with 02–04 after 01.

---

#### P11C.01 — `SubPartSetGrid` (shared multi-select surface)

**Goal**: The foundation §10.11 component: layer-sectioned, checkbox-model SubPart grid with
live viewport linkage hooks — host-agnostic (docked Members view now; M dialog for future
callers).
**Files**:
- Create `src/ui/SubPartSetGrid.tsx`
**Depends on**: 11B complete.
**Spec** (design §7.1–§7.3; foundation §10.11):
- Props (controlled — the host owns all state):

```ts
interface SubPartSetGridProps {
  checked: ReadonlySet<string>;                     // instance ids
  onCheckedChange(next: Set<string>): void;
  ownership: ReadonlyMap<string, { jointId: string; jointName: string }>; // current owners (active clip)
  targetJointId: string | null;                     // accent chip when owner === target
  conflictClips: ReadonlyMap<string, string>;       // instanceId → other clip name (⚠ chip)
  search: string;                                   // host-owned fuzzy query
  filter: 'all' | 'unassigned' | 'this' | 'other';
  onRowHover?(instanceId: string | null): void;     // viewport pulse (desktop)
  onRowFlash?(instanceId: string): void;            // touch equivalent (§7.3)
}
```

- **Body**: one section per layer CONTAINING SubParts, in layer display order, **including
  unlisted layers** (the picker must see everything — unlike the Outliner; design §7.3).
  Section header: collapse caret · layer name · row count · "N assigned" chip · **👁 eye**
  toggling the REAL layer visibility (`toggleLayerVisible`, code:
  `src/state/layerStore.ts:72` — view state, no undo) · `[□ all]` tri-state Checkbox checking
  every ENABLED row in the section.
- **Rows** (react-aria `GridList` per section — the MeshPickerModal precedent, code:
  `src/ui/MeshPickerModal.tsx:3,92`): checkbox · instance id (mono) · template caption ·
  ownership chip (`→ HingeL` accent when owner === target, neutral otherwise, `—` unassigned) ·
  amber `⚠ also in "<clip>"` chip from `conflictClips`.
- **Row states** honoring `$layerView` (design §7.3): locked layer → row disabled + tooltip
  "Layer is locked"; hidden layer → dimmed 40% but ASSIGNABLE.
- **Gestures**: click row = toggle checkbox; ⇧-click grow-only range (`useShiftRangeSelect`,
  code: `src/ui/rangeSelect.ts:109` — the GridList wiring pattern is in MeshPickerModal);
  ⌘-click = plain toggle; ⌘A checks all enabled visible rows (the grid's own handler — keeps
  precedence over viewport ⌘A while focused, foundation §11.1).
- **Search**: filter rows by the P5A fuzzy-subsequence matcher over instance id + template id +
  template caption + layer name. Empty result: "No SubParts match — clear filters?" [Clear]
  (calls a host callback).
- **Touch equivalents** (LOCKED #6, design §7.3): on toggle, call `onRowFlash` (host pulses the
  placement highlight ~600 ms); long-press (250 ms) on a row calls `onRowHover`-equivalent
  pulse WITHOUT toggling.
- SubParts only — connectors/kittens/etc. are NOT rows here (the host renders the
  "Not animatable" section, P11C.02) (guardrail 4).
**Verify**: component compiles standalone (mounted in P11C.02); grid behaviors verified there.
Unit-test the pure helpers you extract (section grouping, tri-state math) in
`SubPartSetGrid.test.ts` if extracted; otherwise cover via 11C.02's manual list.

---

#### P11C.02 — Members view (right-sidebar takeover)

**Goal**: The §7 docked, NON-modal membership editor replacing MeshPickerModal's job (deletion
itself in P11C.11).
**Files**:
- Create `src/ui/animation/MembersView.tsx`
- Modify the P4 hotkey registry (add `surface:members` edit-chord mirrors)
**Depends on**: P11C.01.
**Spec** (design §7.1–§7.2, §7.5):
- Renders when `$membersView.open` — 11C.08 swaps it in place of the navigator body. Header:
  `‹ Joints` back chevron + `✕`/`[Done]` (all → `closeMembersView()`); **Target joint**
  searchable Select rendering the tree indented — switching targets keeps view/search/filters/
  checked set INTACT (the one-session multi-joint rig requirement); `(＋ new joint)` creates a
  centroid-seeded joint (`addJoint`) and targets it. Fuzzy search field; filter chips (radio)
  All · Unassigned · This joint · Other joints; **🖌 Paint in 3D** toggle (arms
  `member-paint` — action lands P11C.03; render disabled with a tooltip until that task);
  live count `3/12 → HingeL`.
- Body = `SubPartSetGrid` with: `ownership` from the active clip's joints
  (`findOwningJoint`-style scan); `conflictClips` from OTHER clips' member sets (feed from
  `$clipIssues`'s multi-clip warnings or recompute — one source: derive from
  `computeClipIssues` output to avoid drift).
- Footer actions: `[Assign N → <target>]` → `attachToJoint(anim, target, checkedIds)` (discrete,
  exclusivity within the clip kept — code: `src/state/animationStore.ts:346`); `[Unassign N]` →
  detach each checked id from its owning joint (extend `detachFromJoint` with a batch wrapper
  `detachMembers(animId, ids)` — ONE discrete step); `[Done]`.
- **Ineligibility section** (design §7.5): collapsed bottom section "Not animatable (N)" listing
  the part's connectors, kittens, colliders, seats and lights inert (no checkbox) with the ⓘ
  header popover text VERBATIM from §7.5 (KSA-can-only-animate-SubParts + deployed-pose
  workaround + owned colliders/lights ride along).
- Opening with no joints → inline prompt "Create a joint first — [＋ Joint]".
- **Live viewport linkage**: `onRowHover` pulses the placement's highlight; checked rows keep a
  selection tint; wiring through the P11C.04 tint pass.
- **`surface:members` mirrors** (foundation §11.1): register `⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I` mirror
  bindings delegating to the viewport edit/select commands while the view has focus; the grid's
  own ⌘A keeps precedence.
- Entry points wired now: right header `[Members…]` + timeline ⚠ hint (P11B.08's button) +
  palette command "Edit joint members" (11E adds the rest).
**Verify**:
- Manual: the phase-gate pain-2 kill test (header checklist #2); mixed-selection attach shows
  the skip flash ("Attached 3 SubParts — 1 connector skipped (KSA can't animate connectors)" —
  from `attachToJoint`'s counts, P11A.10); hidden-layer row assignable after the eye un-hides;
  locked row refuses.
- `animationStore.test.ts`: `detachMembers` batch = one undo step.

---

#### P11C.03 — `member-paint` viewport tool

**Goal**: Click-in-viewport membership painting (design §7.4), in the `$activeTool` single slot
with full status guidance and per-click undo.
**Files**:
- Modify `src/state/modeStore.ts` (ensure `'member-paint'` in the Tool union — P4 may have
  stubbed it; design foundation §2.6)
- Modify `src/three/EditorScene.ts` (paint click routing + pick suppression)
- Modify `src/ui/animation/MembersView.tsx` (arm/disarm the toggle)
- Modify the statusStore tool-segment provider (paint segment)
**Depends on**: P11C.02.
**Spec**:
- Arming: `$activeTool = 'member-paint'` (single slot — arming cancels measure/etc.; the P5B
  measure tasks are the wiring precedent, phase-05b §F). Animation-only; cancel on mode switch
  (tool table row, foundation §2.6); Esc = rung 5 disarm; disarm also on toggle-off or Members
  view close.
- EditorScene: while armed, suppress normal selection + gizmo picking (same contract as
  measure — code: `src/three/EditorScene.ts:478-484` measure suppression pattern) and route
  SubPart clicks: resolve the picked `Selectable` (`kind === 'subpart'` only, code:
  `src/three/SelectionManager.ts:8`); locked layer → status refusal; hidden layers are not
  pickable anyway (raycast skips invisible, code: `src/three/EditorScene.ts:403` comment).
  Click semantics (design §7.4): unassigned → `attachToJoint(target)`; assigned-to-target →
  detach; assigned-to-other → REASSIGN to target (attachToJoint's exclusivity does this in one
  call — status: "panel_b_1: HingeR → HingeL"). **Each click = one discrete undo step** (labels
  with names — undo peels click-by-click, §15 matrix). Clicking connector/kitten/collider/seat/
  light or empty space: NO change; status flash explains (§7.5); no deselect surprise.
- Status segment: `Paint members → HingeL · click SubParts to toggle · Esc done`; brush cursor
  on the canvas while armed.
- Joint markers hidden while painting (§9.3 — flag consumed in P11D.03; set the store flag now).
- Painting works with the Members view open (rows flash via `onRowFlash`) and with it closed
  (phone flow, 11E).
**Verify**:
- `animationStore.test.ts` "paint reassignment exclusivity" (design §18 test list): paint-click
  an id owned by joint B onto target A ⇒ removed from B, appended to A, ONE undo step reverts
  to B.
- Manual: arm, click through assign/unassign/reassign/ineligible/empty; Esc disarms; switching
  to Build cancels; measure arming cancels paint.

---

#### P11C.04 — Membership tints (viewport overlay pass)

**Goal**: While the Members view is open or painting: target members = accent outline,
other-joint members = neutral outline, hovered row = pulse (design §7.6).
**Files**:
- Modify `src/three/EditorScene.ts`
**Depends on**: P11C.03.
**Spec**: a `membershipViz` pass gated on `$mode === 'animation' && ($membersView.open ||
$activeTool === 'member-paint')`: reuse the existing selection-highlight pipeline
(`SubPartObject.setSelected` / highlight settings — grep `setSelected` usages at
`src/three/EditorScene.ts:1605-1607`) with two tint classes; hovered pulse from the
MembersView's `onRowHover` (a small store atom `$memberHoverId` in animationStore, ephemeral).
Cleared when the view closes. **No continuous rendering** — invalidate on state change only via
`this.sub($membersView)` etc. (guardrail 10).
**Verify**: manual — open Members: target members outline accent, other-joint members neutral;
hover a row → pulse; close → cleared; FPS idle (no continuous loop — check the RenderLoop debug
counter stays still).

---

#### P11C.05 — CLIPS section (right navigator)

**Goal**: The §6.1 clips list with row menus, draft chips + checklist tooltips, and D3's
no-close-on-re-click behavior.
**Files**:
- Create `src/ui/animation/ClipsSection.tsx`
**Depends on**: 11B complete (independent of 02–04).
**Spec** (design §6.1):
- Rows: active radio dot (`$activeAnimationId`) · name (double-click = inline rename,
  Enter/Esc — follow the Outliner layer-rename pattern from P5A) · duration chip · mode chip
  (`actuate`/`deploy`) · **draft chip** when `$clipIssues[id]` has blockers — tooltip renders
  the ✓/✗ checklist from the issues · `⚓end` micro-chip when the anchor is not the earliest
  keyframe (tooltip explains modeled-deployed anchoring).
- Click row = open (`$activeAnimationId.set`; playhead → `restAnchorTime` via
  `returnToRest()`). **Re-click does NOT close** (D3 — v1's close-on-re-click, code:
  `src/ui/AnimationPanel.tsx:137-138`, is retired; ⏹/Esc own "stop preview").
- Row ⋮ menu: Rename · Duplicate clip (`duplicateAnimation`) · Re-anchor… ▸ (submenu listing
  keyframes with a radio on the current anchor → `setRestAnchor`) · Export status (disabled
  info row: "exports as `<animGlbPath(base, anim)>`" — code: `src/ksa/animationNaming.ts:30` —
  or "draft — N blockers") · Delete… (ConfirmDialog: `Delete clip "Deploy"? 2 joints,
  5 keyframes. [Delete] [Cancel]` — whole-container confirm, foundation §14.3;
  `removeAnimation`).
- Header `＋` creates + opens (`addAnimation` — already selects, code:
  `src/state/animationStore.ts:176`).
**Verify**: manual — rows reflect `$clipIssues` live (empty a joint → draft chip appears);
duplicate produces "(copy)" opened; re-anchor via the submenu badges the timeline column;
re-click does not close (regression vs v1 noted in commit as D3).

---

#### P11C.06 — JOINTS section — the real tree

**Goal**: §6.2's indented joint tree: collapse shared with the timeline, drag-reparent with the
cycle guard, row menus, inline attach.
**Files**:
- Create `src/ui/animation/JointTreeSection.tsx`
**Depends on**: P11C.05.
**Spec** (design §6.2):
- Rows indented by `parentJointId` chains (reuse `buildDopeSheetModel`'s row walk or extract a
  shared `jointTreeRows(anim)` helper into `dopeSheetModel.ts`); caret collapses subtrees —
  state = `$jointTreeCollapsed` (SHARED with TrackHeaderColumn; document order = timeline row
  order). Member-count chip; ⚠ when 0 members (tooltip verbatim §6.2).
- Click row = `$activeJointId` (timeline row highlight + left card focus follow automatically);
  the ACTIVE row shows `[Attach N sel]` when the viewport selection contains ≥1 SubPart
  (count = eligible SubParts from `$selectedPlacements`; skips flash via attach counts).
- **Drag-to-reparent**: grip (⠿ on hover) drag; drop ON a row = `setJointParent(dragged,
  target)` (cycle-guarded in the store, code: `src/state/animationStore.ts:314-340`); drop on
  the section header = root (`parentJointId: null`). While dragging, own-descendant targets
  render no-drop (compute the descendant set with `wouldCycle`'s walk) and a refused drop
  flashes "Can't parent a joint under its own descendant". Reorder among siblings by dropping
  BETWEEN rows — document-order splice of `anim.joints` (add a discrete store action
  `reorderJoint(animId, jointId, beforeJointId | null)` in this task; document order drives
  timeline rows). Implement drag with the P0 `usePointerDrag` primitive (HTML5 DnD is not
  needed).
- Inline rename: double-click name (`renameJoint`).
- Row ⋮ menu (all items, §6.2): Rename · Add child joint (`addJoint(anim, 'Joint', id)`) ·
  Re-parent ▸ (searchable list — the a11y/phone fallback; cycle-guarded options disabled) ·
  Select members (select the member placements in the viewport + reveal — via the P5A
  selection actions) · Attach selected (N) · Members… (`openMembersView(id)`) · Set pivot ▸
  (to selection / pos only / centroid / pick in 3D… — the first three call the P11A.10
  actions; "pick in 3D…" disabled until P11D.04 arms `pivot-pick`) · Detach all… (confirm when
  >5 members; `detachMembers`) · Delete joint… (confirm stating "children re-parent to
  <parent>, poses removed"; `removeJoint`).
- Header: `＋ joint` (centroid-seeded root; on non-empty selection, status hint
  "Joint added · [Attach 2 selected]" with the inline action) + `Members…`.
**Verify**:
- `animationStore.test.ts`: `reorderJoint` splices document order (discrete undo).
- Manual: build a 3-level chain; collapse in the sidebar collapses the timeline rows too;
  drag-reparent refuses a descendant drop; sibling reorder re-orders timeline rows; every ⋮
  item fires.

---

#### P11C.07 — EASING overview + SOLAR TRACKING sections

**Goal**: §6.3's three-channel segment overview and §6.4's solar editor with readable labels
(pain 12) + dangling-ref chip.
**Files**:
- Create `src/ui/animation/EasingOverviewSection.tsx`
- Create `src/ui/animation/SolarTrackingSection.tsx`
**Depends on**: P11C.06.
**Spec**:
- **Easing overview** (design §6.3): for the pinned column's outgoing segment × active joint:
  three rows (Position/Rotation/Scale) showing preset name (`matchingPreset`) / "custom curve" /
  "linear (—)"; ✎ per row focuses the left Easing card on that channel (set a small ephemeral
  atom `$easingFocusChannel` in animationStore consumed by P11C.09). "Uniform" chip via
  `segmentEasingUniform` (preset/linear name, else "mixed"). `[Apply to all joints]` →
  `setSegmentEasingAllJoints` (per-channel set). Empty states verbatim: no pin → "Select a
  keyframe to edit its outgoing easing"; final column → "Final keyframe — no outgoing segment".
- **Solar tracking** (design §6.4; census §1.14 semantics kept): section enabled only for
  Deploy/Retract clips — otherwise "Solar tracking requires Deploy/Retract mode" +
  [Switch mode] inline action (`setAnimationMode`). Fields: Switch "Sun tracking (solar
  panel)" (null ↔ spec with the v1 defaults, code: `src/ui/AnimationPanel.tsx:253-259`);
  "Rotates to track" searchable Select over the union of member ids rendered as
  `panel_a_1 · SolarPanelA · → HingeL` (instance id mono + template caption + owning-joint
  chip — resolve captions via the catalog the way MeshPickerModal rows do); "°/s" NumberField
  (streaming `setSolarTracking` whole-spec replace is v1-discrete — KEEP discrete, it's a
  Select/Switch surface; the °/s NumberField pushes undo on focus then streams a spec replace:
  add a streaming variant `streamSolarTracking` or accept discrete-per-commit — choose
  discrete-per-commit, matching v1, and note it); per-member "Stays fixed (doesn't track)"
  Switch list (exclude ids). Amber validation chip "target missing — re-pick" from
  `$clipIssues` (`solar-target-missing`).
**Verify**: manual — labels are readable for an imported deploy part (census pain 12 dead);
removing the tracked member surfaces the amber chip; final-column easing shows the empty state.

---

#### P11C.08 — AnimationSidebar assembly + Members takeover + host swap prep

**Goal**: One right-sidebar component composing header + sections, with the Members view
replacing the body when open; the mode's empty state.
**Files**:
- Create `src/ui/animation/AnimationSidebar.tsx`
**Depends on**: P11C.02, P11C.07.
**Spec** (design §6 intro): slim mode header `▶ Animation` + `[＋ Clip]` `[Members…]`; body =
the four `SidebarSection`s (the P5A dense DisclosureSection restyle — grep the Outliner's
section primitive) — replaced wholesale by `<MembersView/>` while `$membersView.open`. Empty
state (no clips): icon + "Animate parts by attaching SubParts to joints and posing them over a
timeline." + [＋ Animation] + [Import a built-in Part…] (opens the P5B Part browser dialog via
its command). NOT yet mounted — P11C.11 swaps hosts.
**Verify**: compiles; mounted in P11C.11.

---

#### P11C.09 — Left focus: `AnimClipCard` + `AnimJointCard` + `EasingCurveEditor`

**Goal**: The §8.2/§8.3 cards — the posing cockpit with scale numerics (pain 13), the
anchor-aware pivot swap, working-pivot controls, and the per-channel easing editor porting the
v1 curve widget verbatim.
**Files**:
- Create `src/ui/animation/EasingCurveEditor.tsx`
- Create `src/ui/animation/AnimClipCard.tsx`
- Create `src/ui/animation/AnimJointCard.tsx`
- Delete `src/ui/EasingEditor.tsx` (guts ported; update any residual import)
**Depends on**: P11C.07.
**Spec**:
**EasingCurveEditor** (design §8.3 EASING block; census §1.8 semantics VERBATIM): channel tabs
`[Uniform|Pos|Rot|Scale]` above the ported v1 widget (10-preset Select + 2-handle bézier SVG
with pointer-captured handle drags, x clamped [0,1], y free [−0.5,1.5], "Custom curve"
off-preset entry, `overflow: visible` handle overhang — port from `src/ui/EasingEditor.tsx`
wholesale; `matchingPreset` now imported from `src/ksa/easing.ts` per P11B.04). Uniform tab:
edits all three (`setJointChannelEasing(…, 'uniform', cfg)`); when channels differ it shows
"Mixed" + `[Make uniform]` (copies the position channel — pick position, note the choice —
to all three, discrete-by-commit). Channel tabs edit one channel. Streaming undo: ONE
`pushUndo('easing', …)` on `onEditStart` (curve drag start / preset change), then streaming —
the v1 contract (census §1.8). Hidden on the final column ("no outgoing segment").
`$easingFocusChannel` (P11C.07) selects the tab.
**AnimClipCard** (design §8.2): Name TextField (focus-draft commit, v1 pattern code:
`src/ui/AnimationPanel.tsx:172-183`); Mode Select ("Actuate (0→1 slider)" / "Deploy /
Retract") — switching away from Deploy with solar set shows the inline warning verbatim §8.2;
**Duration** NumberField (streaming `setAnimationDuration(id, v, $animDurationMode.get())`,
undo push on focus) + behavior radio ◉ Rescale keys / ○ Keep times (persisted
`$animDurationMode`; keepTimes input clamps with the note "min 2.00s — last keyframe");
**Rest anchor** row: chip `⚓ @2.00s (final keyframe)` + `[change ▾]` keyframe radio menu →
`setRestAnchor`; **EXPORT** checklist: live `$clipIssues` rows ✓/✗ — failing rows are LINKS
(✗ members → `openMembersView()`; ✗ keyframes → focus timeline; ✗ duration → focus the
Duration field) + the "exports as `<animGlbPath>`" line; **SOLAR TRACKING** summary row →
scrolls/focuses the right section.
**AnimJointCard** (design §8.3 — the workhorse; every group):
- Header: name TextField + Parent searchable Select ("Root (Part)" / "under X",
  cycle-guarded disabled options — v1 pattern, census §1.3).
- MEMBERS: rows `instanceId · templateCaption · layerName` + ✕ detach (discrete); row click
  selects that placement in the viewport (+ reveal); `[Attach N selected]` (eligible count);
  `[Choose members…]` → `openMembersView(jointId)`.
- PIVOT `(rest frame ⚓ @<t>s)`: `[⊕ Edit pivot]` toggle → `$pivotEditing` (visual arming in
  P11D.04 — the toggle sets the atom now, and the section label states the ANCHOR time
  explicitly); Set-to row: [selection] (exactly one placement selected → `setJointPivot`
  full-frame) · [pos only] (`{orientation:false}`) · [centroid] (`setJointPivotToCentroid`) ·
  [pick in 3D…] (disabled until P11D.04).
- POSE @t (when pinned): Position (m) / Rotation (°) / **Scale (×)** XYZ NumberFields —
  streaming `setJointPose`, ONE undo push per typing session (`onInteractionStart` →
  `pushUndo('pose', …)`); live-mirrors gizmo drags (values from the pinned keyframe's pose).
  Port the pos/rot math from v1 `PoseEditor` (code: `src/ui/AnimationPanel.tsx:581-680`,
  DEG2RAD/RAD2DEG handling) and ADD the scale triple (closes census gap 13).
  **Anchor swap** (design §8.3): when the pinned column IS the anchor, the card renders
  **PIVOT @rest** instead — "Pivot position (m)" / "Pivot orientation (°)" (scale hidden —
  pivots stay unit-scaled), routed through `moveJointPivot` (position deltas) /
  `reorientJointPivot` (orientation — compose the entered Euler into a Part-space frame via
  `matrixFromTransform` and rebase), with the inline note verbatim: "Rest anchor — the pose
  here equals the modeled placements; these fields move the pivot." (closes the v1
  uncompensated-numeric-edit trap).
- WORKING PIVOT (design §8.3/§9.4): state chip (`none` / `centroid` / `panel_a_1` /
  `point (1.2, 0.4, 0.0)`); buttons [Selection centroid] (set from `$selectedPlacements`
  centroid) · [Picked subpart ▾] (menu of member placements → position at that placement) ·
  [Pick point…] (disabled until P11D.04's `pivot-pick`) · [Clear]. All write `$workingPivot`
  (ephemeral, never undo — §15).
- EASING → next @t: the EasingCurveEditor + `[Apply to all joints]`.
**Verify**:
- Manual: pose a joint numerically incl. scale; pin the anchor column → the card swaps to
  pivot fields and a position edit does NOT change the rendered geometry at any t (drag the
  playhead to confirm — `moveJointPivot` invariant); easing tabs edit channels independently
  and the timeline segment indicator updates (`per-chan` dotted).
- `animationStore.test.ts` already covers the store paths; add a case: numeric pivot-orient at
  the anchor preserves rest geometry (`rebaseJointToWorld` — extend the existing pivot suite,
  code pattern: `src/state/animationStore.test.ts:189-268`).

---

#### P11C.10 — Left focus: `AnimKeyframeCard` + focus dispatch + cheat card

**Goal**: §8.4's keyframe card (single + multi), and the §8 focus resolution mounting the three
cards in the left sidebar for Animation mode.
**Files**:
- Create `src/ui/animation/AnimKeyframeCard.tsx`
- Create `src/ui/animation/AnimationFocusEditor.tsx`
- Modify the P5B left-sidebar dispatch (the mode-keyed focus ruleset host) to render
  `AnimationFocusEditor` when `$mode === 'animation'`
**Depends on**: P11C.09.
**Spec**:
**AnimKeyframeCard** (design §8.4): header `KEYFRAME @ [1.200] s` — time NumberField
(streaming `setKeyframeTime`, t=0 read-only with note) + ⚓ chip or `[Re-anchor here]`.
"Moves at this key" rows per joint: changed-channel chips (pos/rot/scale — diff the pose vs the
previous column with the P11B.04 ε) or "(hold)"; row click sets `$activeJointId` (jumps to the
Joint card pinned here); easing chips → Joint card easing focus. Footer: [Delete keyframe]
(protections respected) · [Copy] · [Paste pose set] (single-column §5.7 wires). Multi-column
variant when `$timelineSelection.length > 1`: header "N keyframes selected", times list, bulk
[Delete N…] [Copy].
**Focus dispatch** (design §8 table; foundation §7.2): tool parameter card first (paint /
pivot-pick status render as top cards — text-only status cards here; the STATUS BAR carries
the live instructions), then: no clip → mode cheat-card (one line + hotkeys Space/K/,/./Esc +
[＋ Animation]); clip only → AnimClipCard; joint active (± pin) → AnimJointCard; column
selected + no joint → AnimKeyframeCard. Header row with focus title + ⋮ overflow mirroring the
right-sidebar row menu of the focused object (design §8 intro).
**Verify**: manual — the dispatch walks correctly through all four states; keyframe card's
per-joint chips match the timeline's ◆/◇; multi-select shows the bulk variant; t=0 time field
read-only.

---

#### P11C.11 — Host swap: mount navigator + focus editor; DELETE AnimationPanel / AnimToolbar / MeshPickerModal

**Goal**: The v1 animation surfaces die; the v2 navigator + focus editor take their mount
points (foundation §17 step 6 order (c)/(f); phase-12 deletion rows 32/34).
**Files**:
- Modify the Animation-mode right-sidebar host (wherever P4/P5 rehosted AnimationPanel — grep
  `AnimationPanel`) → mount `AnimationSidebar`
- Delete `src/ui/AnimationPanel.tsx`, `src/ui/AnimToolbar.tsx`, `src/ui/MeshPickerModal.tsx`
- Modify any residual importer (grep each name; the census lists `InspectorContent`/
  `AssetsToolbar` as v1 hosts — P4/P5 likely already dissolved them)
**Depends on**: P11C.08, P11C.10.
**Spec**: pure swap + delete; NO store changes. Confirm before deleting that every AnimationPanel
capability has its v2 home live (walk design §17 rows for census §1.2–§1.5, §1.8, §1.14 —
this is the task's checklist, not optional). The Escape listener is already gone (P11B.09);
`closeAnimation`'s "re-click closes" behavior dies with the panel (D3, logged in P11C.05).
**Verify**:
- `grep -rn "AnimationPanel\|AnimToolbar\|MeshPickerModal" src apps` → zero hits.
- Full manual parity pass: create/rename/duplicate/delete clips; joints tree CRUD + reparent;
  membership via Members view + paint; keyframes via timeline; pose via numerics; easing via
  card; solar tracking — all reachable, nothing modal, viewport always visible.

---

#### P11C.12 — Doc touch-up: `docs/editor-state.md` Mesh Picker reference

**Goal**: Keep docs true in the phase that changes behavior (AGENTS.md doc-sync rule; the big
animation doc is P12.14's `docs/animation-editor.md`).
**Files**:
- Modify `docs/editor-state.md` (the list-selection paragraph naming the "anim-mode Mesh
  Picker", code: `docs/editor-state.md:182`)
**Depends on**: P11C.11.
**Spec**: replace the Mesh Picker mention with the Members view / `SubPartSetGrid` as the
GridList + `useShiftRangeSelect` example surface; one-sentence edit, no restructure.
**Verify**: `grep -n "Mesh Picker" docs/*.md` → no stale reference; fmt:check green.

---

## Phase 11D — Pose tooling: PoseGizmo, joint markers, pivot tool, working pivots, trajectories

**Design sources**: design-animation-mode.md §9 (all of it — §9.1 affordance flags, §9.2
PoseGizmo, §9.3 joint markers, §9.4 pivot editing, §9.5 trajectories, §9.6 posed-lock
feedback), §4.3 (pivot action rows), §16 D2 (`pivot-pick` tool); DECISIONS #8 (pose gizmo /
working pivots / trajectories approved); foundation §2.6 (tool table rows member-paint/
pivot-pick).
**Census sources**: animation.md §1.6–§1.7 (pose gizmo, poseProxy, pivot special-case — and
§4.6's three disagreeing t=0 sites), §1.10 (write-back protection), §4 pains 5/6/8; §5
(pivot semantics invariants).

**Entry state**: 11C done. Posing still runs through the SHARED `TransformControls` attached to
`poseProxy` (code: `src/three/EditorScene.ts:243,1619-1628,1839-1872`) with the v1 t=0 pivot
special-case; the pivot marker is the always-on AxesHelper at t=0 (code: `:249,1727-1743`);
no joint markers, no trajectories, silent posed-lock.

**Exit state**: App runnable. Posing uses the animation-specific `PoseGizmo` (rings sized to the
joint's member set, screen-space free-drag translate, per-gesture X/Y/Z axis locks, snap
integration); every joint renders a PICKABLE marker at its rest frame at `restAnchorTime`;
pivot editing is the explicit amber tool + anchor-column routing (t=0 inconsistency DEAD);
working pivots pose about throwaway anchors; motion trajectories render per the trails pref;
the posed placement-lock is fully legible. `TransformControls` remains for Build/Engine only.

**Phase verification**:
1. fmt → lint → fmt:check → typecheck → test green.
2. The pain-6 kill test (census §4.6): import a KSA deploy clip (anchor = LAST keyframe) —
   (a) the active joint's marker sits ON the modeled (deployed) geometry; (b) pinning the LAST
   column and dragging Move relocates the PIVOT (geometry unchanged at every t); (c) pinning
   t=0 pose-edits the stowed keyframe like any other (no silent rebase); (d) `[⊕ Edit pivot]`
   parks at the anchor and shows amber handles.
3. Pose-drag UX: rings wrap the member geometry; the free-drag disc translates in the camera
   plane; tapping `X` mid-drag locks joint-local X (guide line), second tap world X, third
   unlock; ⌃ inverts snap; Esc cancels the drag; numerics mirror live.
4. Trajectories: Selected/All/Off from both View ▸ Motion Trails and the transport ↝ menu;
   ticks at columns, ⚓ ringed; bead follows the playhead during playback with zero React
   commits; Off = no curves, no per-frame cost.
5. Posed lock: select an animated member while parked off-anchor → Tool bar disabled with the
   tooltip, status shows the persistent message with the clickable ⏮⚓ action, transport chip
   amber.

### Task ordering

P11D.01 → P11D.02 → P11D.03 → P11D.04 → P11D.05 → P11D.06.

---

#### P11D.01 — `PoseGizmo` core (rings / free-drag / stems / scale) + write-back

**Goal**: The LOCKED #8 animation-specific gizmo replacing TransformControls for posing —
attach, tools, snapping, undo, working-pivot rotation math.
**Files**:
- Create `src/three/PoseGizmo.ts`
- Modify `src/three/EditorScene.ts` (attach `PoseGizmo` in the pose branch of
  `updateSelection`, code: `src/three/EditorScene.ts:1619-1628`; keep the poseProxy Group as
  its target frame; TransformControls no longer attaches for posing)
**Depends on**: 11C complete.
**Spec** (design §9.2 — every bullet):
- A `THREE.Object3D` subtree + pointer controller (constructor takes the `Viewport`, mirroring
  `TransformGizmo`'s shape — code: `src/three/TransformGizmo.ts`; and the pickable-handle
  precedent `NozzleHandleObject`). Attached when `$isPoseEditing`, positioned at the joint's
  world frame at the pinned time — or at `$workingPivot.position` when set.
- Tool = `$effectiveToolMode` (the Tool bar window displays/edits it; `T`/`⇧T` cycles — kept):
  - **Rotate** (default posing tool): three orientation tori sized to the member set —
    ring radius = bounding-sphere radius of the member placements' meshes at the pinned time
    (compute from the SubPartObject groups' `Box3`; clamp 0.3–3 m world AND 24–160 px screen
    by rescaling against camera distance each frame the camera moves — piggyback the marker
    rescale hook, no continuous loop) — plus an outer camera-plane ring (screen-space rotate).
  - **Move**: central free-drag DISC translating in the camera plane (multi-axis in one
    gesture — LOCKED) + three axis stems for constrained moves.
  - **Scale**: three axis handles + center uniform handle. DISABLED at the anchor column
    (pivots stay unit-scaled — tooltip via the Tool bar, P11D.04 wires the pivot variant).
- **Write-back** (streaming): drag → new proxy world frame → `newLocal = parentWorld(t)⁻¹ ·
  proxyWorld` → `setJointPose` (port the math verbatim from `handlePoseGizmoChange`, code:
  `src/three/EditorScene.ts:1839-1872`, MINUS the t=0 special case — anchor routing arrives in
  P11D.04; until then anchor-column drags pose-edit, one task of interim behavior).
  **Working pivot** (design §9.2): when `$workingPivot` is set, a rotation drag computes
  `ΔW = T(p) · R · T(p)⁻¹ · W_joint` (p = working-pivot position, R = the drag rotation about
  it) and writes the RESULT back as the joint pose; translation ignores the working pivot
  (pivot-independent).
- **Snapping**: rotate snaps at `$snapRotateStep`, translate at `$snapTranslateStep` when
  `$snapEnabled`; held ⌃ = temporary opposite (read `modifierStore.$heldModifiers`) — LOCKED
  #7 conventions via snapStore (P5B).
- **Undo**: ONE `pushUndo` at drag start, label `'pose'` (pivot labels in P11D.04) — port the
  drag-start branch (code: `src/three/EditorScene.ts:417-424`). Esc mid-drag cancels (rung 4):
  snapshot the pose at drag start and restore it on cancel (do NOT call `undo()`).
- Orbit disabled during drag; picking suppressed (`suppressPickDrag` pattern, code:
  `:455-457`); numerics mirror live (the Joint card reads the store — automatic).
- Rendering: gizmo geometry invalidates via the existing `sub()` channels; no rAF of its own.
**Verify**:
- Manual: rings wrap a large vs small member set (clamps hold); free-drag disc moves in the
  camera plane; stems constrain; scale tool poses scale (parity — census §1.6 said gizmo-only
  scale existed); a working pivot set to a picked member makes rotation swing about it while
  the joint's real pivot is untouched (check the pivot marker after P11D.03).
- `pnpm test` (no store changes; scene math is covered by the §2 checklist + the anchor-routing
  tests of P11D.04).

---

#### P11D.02 — Per-gesture axis locking (X/Y/Z taps) + modifier hints

**Goal**: The LOCKED #8 axis-lock interaction: mid-drag X/Y/Z taps cycle joint-local → world →
unlocked, with a full-length guide line and live status hints.
**Files**:
- Modify `src/three/PoseGizmo.ts`
- Modify the modifierStore hint providers (pose-drag hint)
**Depends on**: P11D.01.
**Spec** (design §9.2 axis-locking bullet):
- While a PoseGizmo drag is active, a window keydown listener (attached at drag start, removed
  at drag end — pointer-capture-local, NOT the hotkey registry; design §12.1 note) handles
  `x`/`y`/`z`: first tap = lock the gesture to that JOINT-LOCAL axis; same-letter second tap =
  the WORLD axis; third = unlock. Locking projects the accumulated drag delta onto the locked
  axis (rotate: constrain to the axis's rotation plane; translate: project the translation).
- Guide: a full-length colored line through the gizmo origin along the locked axis
  (axis colors X red / Y green / Z blue — reuse `src/three/axisColors.ts`).
- Lock state RESETS at drag end.
- Status: the modifier-hint segment live-shows `X/Y/Z lock axis · ⌃ temp snap` during pose
  drags (register a hint provider keyed on an ephemeral `$poseDragActive` atom the gizmo sets;
  design §13).
- Help: add the axis-lock line to the static pointer-modifiers section (the registry's static
  Help data — foundation §11.5; FINAL_DESIGN_INDEX pointer-modifier row already lists it).
**Verify**: manual — rotate-drag, tap Y: motion constrained to local Y (guide line green);
tap Y again: world Y; again: free; release: next drag starts free; hints appear only during
the drag.

---

#### P11D.03 — `JointMarkerLayer` — 3D-pickable joints at the anchor frame

**Goal**: Every joint of the open clip gets a marker at its rest frame at `restAnchorTime`;
clicking one activates the joint (design §9.3); the v1 t=0 AxesHelper dies.
**Files**:
- Create `src/three/JointMarkerLayer.ts`
- Modify `src/three/EditorScene.ts` (host the layer; DELETE `pivotHelper` + `updatePivotHelper`,
  code: `src/three/EditorScene.ts:249,292-295,1727-1743`)
- Modify `src/three/SelectionManager.ts` (add `'joint'` to the `Selectable.kind` union, code:
  `src/three/SelectionManager.ts:8`)
**Depends on**: P11D.01.
**Spec**:
- Markers for EVERY joint of the active clip while `$mode === 'animation'`
  (affordance flag `jointMarkers`, design §9.1): inactive = small screen-space octahedron
  (~10 px, fg-muted; constant screen size via camera-distance rescale on camera change —
  the pattern the nozzle handles / seat markers use); active joint = tri-axis marker (0.4 u,
  axis-colored — an upgraded AxesHelper is fine) + name label (follow the MeasurementLayer's
  label technique for the hover/name text — grep how it draws measurement text; if it uses
  sprites, use a sprite; do not add a new CSS2D renderer dependency without checking).
- Positioned at `jointWorld(anim, jointId, restAnchorTime(anim))` — **the §4.6 fix**; the
  marker rides `$part`/clip changes via `sub()`.
- **Pickable**: `userData.selectable = { kind: 'joint', id: jointId }`; EditorScene's onSelect
  handles `'joint'` → `$activeJointId.set(id)` (no placement-selection change). Priority above
  subpart picks within ~12 px — give the marker meshes a slightly inflated raycast geometry
  (the nozzle-handle precedent for click priority, design §9.3).
- Hover: accent tint + name tooltip.
- Hidden while `member-paint` is armed (clicks belong to painting — flag from P11C.03).
- Non-pickable never applies now (v1's `pivotHelper.raycast = () => {}` is gone with it).
**Verify**: manual — all joints show markers on the DEPLOYED geometry for a deploy import;
click an inactive marker → joint activates (tree + timeline + left card follow); hover tints;
markers vanish while painting and outside Animation mode.
- `grep -n "pivotHelper" src/three/EditorScene.ts` → no hits.

---

#### P11D.04 — Explicit Edit Pivot tool + anchor-column routing + `pivot-pick` (kills the t=0 inconsistency)

**Goal**: Pivot editing becomes ONE explicit, always-anchored mechanism (design §9.4), replacing
v1's three mutually-disagreeing t=0 sites — (1) the gizmo's `kf.timeSec === 0` special case
(code: `src/three/EditorScene.ts:1854-1868` — now in PoseGizmo write-back), (2) the marker's
`jointWorld(…, 0)` (deleted in P11D.03), (3) `selectKeyframeForEditing`'s `restAnchorTime`
auto-tool-pick (removed in P11A.09) (census: animation.md §4.6).
**Files**:
- Modify `src/three/PoseGizmo.ts` (pivot mode variant + routing)
- Modify `src/three/EditorScene.ts` (pivot-pick click routing)
- Modify `src/state/animationStore.ts` (arm/disarm helpers for `$pivotEditing`; `pivot-pick`
  targets)
- Modify `src/state/modeStore.ts` (ensure `'pivot-pick'` in the Tool union)
- Modify `src/ui/animation/AnimJointCard.tsx` (enable `[⊕ Edit pivot]`, `[pick in 3D…]`,
  working-pivot `[Pick point…]`)
- Modify `src/ui/animation/JointTreeSection.tsx` (enable "Set pivot ▸ pick in 3D…")
- Modify the statusStore tool-segment provider (pivot segments)
**Depends on**: P11D.03.
**Spec**:
1. **`⊕ Edit pivot` toggle** (design §9.4): arming (a) parks + pins the playhead at
   `restAnchorTime` (`selectKeyframeForEditing` on the anchor column — the only frame where
   pivot edits are well-defined); (b) swaps PoseGizmo to **pivot mode** — amber handles;
   Move → `moveJointPivot` (streaming; live tooltip "moving the hinge, not the pose");
   Rotate → `reorientJointPivot` (streaming rebase); Scale ABSENT; (c) status segment:
   `Edit pivot — HingeL · drag to relocate the hinge · Esc done`. Exiting: toggle off / Esc
   rung 5; **joint switch keeps the tool armed** (deliberate — rigging several hinges); clip
   switch and mode exit disarm (§9.4).
2. **Anchor-column routing** (belt-and-braces, §9.4): even WITHOUT the tool, a PoseGizmo drag
   while the pinned column IS the anchor routes Move → `moveJointPivot`,
   Rotate → `reorientJointPivot` (there is no meaningful "pose" at the anchor); Scale disabled
   there (P11D.01). Undo labels `'move pivot'` / `'reorient pivot'` at drag start. The state
   chip reads `● pinned @⚓ (pivot)` (TransportBar case from P11B.02 — wire the condition now).
   Selecting t=0 on a deploy import simply pose-edits the stowed keyframe (v1's silent-rebase
   trap gone).
3. **`pivot-pick` tool** (design §4.3 `setJointPivotPoint`, §9.4 snap row + §8.3 working-pivot
   `[Pick point…]`): `$activeTool = 'pivot-pick'` with a TARGET discriminator in animationStore
   (`$pivotPickTarget: 'joint' | 'working' | null`): one viewport click on ANY mesh surface
   resolves the world-space hit point → `'joint'`: `setJointPivotPoint(activeJoint, hitPoint)`
   (discrete, pos-only); `'working'`: `$workingPivot = { kind:'point', position: hitPoint }`.
   Esc cancels (rung 5); status: `Pick pivot point — click a surface · Esc cancels`
   (foundation §2.6 row); Animation-only, cancel on mode switch; pick suppression like measure.
4. Working-pivot marker (design §2 diagram `◇`): a small distinct glyph at
   `$workingPivot.position` while set (JointMarkerLayer hosts it — `workingPivotMarker` flag);
   cleared on joint/clip change + mode exit (extend `initAnimationStore`-adjacent watchers:
   subscribe `$activeJointId`/`$activeAnimationId` in the store init to null it — design §4.1
   row).
5. Snap-to actions ([selection]/[pos only]/[centroid]/[pick]) remain one-shot discrete ops
   usable with or without the tool armed (§9.4).
**Verify**:
- `animationStore.test.ts`: extend the pivot suite — `setJointPivotPoint` rebases pos-only at
  the ANCHOR of a deploy-style clip (geometry at every sampled t unchanged — reuse the
  invariance assertions of the existing `moveJointPivot` tests, code:
  `src/state/animationStore.test.ts:190-215`); `$workingPivot` clears on joint switch.
- Manual: the phase-gate pain-6 kill test (header #2); pivot drags show amber handles and the
  "hinge, not pose" tooltip; `pivot-pick` on a mesh sets the pivot to the surface point
  pos-only; Esc unwinds tool-first (rung 5 before rung 7).

---

#### P11D.05 — Motion trajectories (`TrajectoryLayer`)

**Goal**: Read-only §9.5 trails: member-centroid path per animated joint, keyframe ticks,
anchor ring, playhead bead — Selected/All/Off, zero continuous-render cost.
**Files**:
- Create `src/three/TrajectoryLayer.ts`
- Modify `src/three/EditorScene.ts` (host)
- Modify the View-menu MenuSpec (View ▸ Motion Trails ▸ radio — disabled outside Animation)
- Modify `src/ui/animation/TransportBar.tsx` (the ↝ menu now drives a live layer)
**Depends on**: P11D.04.
**Spec** (design §9.5):
- Per animated joint (≥1 member, pose varies): a polyline of the **member-set centroid** path
  over [0, duration] — sample `previewOverrideMatrix`-composed member positions (or
  equivalently `W_J(t)·W_J(rest)⁻¹·placement` centroids) adaptively ~64 samples/segment
  (eased segments; linear segments need only endpoints + a few); plus a FAINTER joint-origin
  path when the origin itself translates (compare origin positions across columns).
- **Keyframe ticks**: small diamonds on the curve at column times; the ⚓ column's tick ringed.
- **Scrub bead**: a marker sliding along the curve at `$playheadSec` — subscribe the atom
  IMPERATIVELY in the layer (constructor takes the store; call `invalidate()` after moving the
  bead — no React, guardrail 10).
- Display mode ← `$animTrails`: `'selected'` = active joint full-opacity (default); `'all'` =
  active full, others 40%; `'off'` = layer empty. Homes: View ▸ Motion Trails ▸ radio
  (register the command triple; `enabled: () => $mode === 'animation'`) + the transport ↝
  mirror (both write `$animTrails` — S15 mirror-chip precedent).
- Strictly read-only (no draggable ticks — LOCKED wording); recompute ONLY on document change
  (`$part` anim slice), clip/joint switch, trails pref; playhead motion moves ONLY the bead.
**Verify**: manual — hinge deploy shows the swing ARC (centroid moves though the joint origin
doesn't); ticks sit at columns with the anchor ringed; All fades inactive joints; Off removes
everything; during playback only the bead moves (no geometry rebuilds — log/breakpoint the
rebuild path once); View menu radio and ↝ menu stay in sync.

---

#### P11D.06 — Posed-lock feedback (fixes pain 8)

**Goal**: The kept write-back protection becomes legible: persistent status message with a
click action, disabled Tool bar with tooltip, amber transport chip (design §9.6).
**Files**:
- Modify `src/three/EditorScene.ts` (publish the lock state)
- Modify the statusStore segment renderer + Tool bar window component (P5B)
- Modify `src/ui/animation/TransportBar.tsx` (amber chip binding — placeholder from P11B.02)
**Depends on**: P11D.04.
**Spec**:
- Keep the rule VERBATIM (code: `src/three/EditorScene.ts:1675-1681` `previewLocked`;
  `selectedIsAnimated` incl. SubPart-owned colliders/lights, code: `:783-812`); with 11B's
  anchor-aware `isPreviewPosed` (P11B.03 step 2). Publish it as an ephemeral animationStore
  atom `$posedPlacementLock` (EditorScene writes it from `updateSelection` — the scene→UI
  report pattern, foundation §13 rules).
- Status: while true, a PERSISTENT info-tinted message
  `Posed preview — placements locked · ⏮⚓ to rest to move parts` where the ⏮⚓ text is a
  click action running `returnToRest()` (statusStore's action affordance — the `[Undo]`
  pattern).
- Tool bar: Move/Rotate/Scale render disabled with tooltip "Locked while a posed preview is
  shown (this SubPart is animated)" when the lock holds AND the gizmo target is the placement
  selection (not while `$isPoseEditing` — the pose gizmo stays live).
- Transport state chip tints amber while locked (P11B.02 item 12).
**Verify**: manual — park mid-clip, select an animated member: no gizmo, disabled Tool bar with
tooltip, status message present; click ⏮⚓ in the message → rest restored, gizmo back; a
SubPart-owned light of an animated owner triggers the same lock (census §1.10 parity).

---

## Phase 11E — Diagnostics surfacing, import/export integration, palette, phone parity, closeout

**Design sources**: design-animation-mode.md §11 (diagnostics/export/import), §13 (status/menu
contributions), §14 (phone — every row), §17 (parity table — the closeout checklist), §18
(test list); foundation §2.2 (mode-switcher attention dot), §5.1 (rich notifications), §10.6
(export pre-flight, non-blocking policy), §12 (phone primitives); DECISIONS #6 (phone parity);
design-projects-export.md §6 (Export to KSA pre-flight — consumed, not redesigned).
**Census sources**: animation.md §1.12–§1.13 (import/export flows), §1.16 (project transfer),
§2 (phone rows of the surface map), §4 pain 20; shell-layout census only via the P1–P3 phone
primitives.

**Entry state**: 11A–11D done. Desktop Animation mode is feature-complete; diagnostics exist in
clip rows/cards/timeline; phone Animation mode is unusable-to-degraded (no transport chip, no
sheets wiring); the export dialog and import flow don't yet surface animation specifics.

**Exit state**: Phase 11 COMPLETE. Draft clips surface everywhere the design names (mode dot,
export pre-flight); KSA part imports post a rich Animations report; every phone surface from
design §14 works; palette commands registered; docs touched; the §17 parity table walked.

**Phase verification**:
1. fmt → lint → fmt:check → typecheck → test green.
2. Phone pass (device emulation <640 px, and LOCKED #6 means this is a gate, not a nicety):
   the §14 table row by row — transport chip, fullscreen Timeline sheet with touch gestures,
   Panel sheet navigator, Members pushed view + paint chip flow, Inspector sheet with steppers,
   touch pose gizmo + axis-lock segmented control, pivot flows, notifications.
3. Desktop: export a project with one draft + one exportable clip — pre-flight lists the draft
   with its blockers and the export proceeds (non-blocking); the mode switcher shows the
   attention dot until the draft is fixed.
4. Import a built-in KSA part with animations — the bell shows a rich Animations report
   (joints, keyframes kept vs dense, per-channel fit, anchor note).
5. The design §17 parity walk (P11E.09) recorded with zero FAILs.

### Task ordering

P11E.01 → P11E.02 → P11E.03 → P11E.04 (integration) → P11E.05 → P11E.06 → P11E.07 (phone) →
P11E.08 → P11E.09 (closeout). 05–07 depend only on 11D.

---

#### P11E.01 — Draft-clip surfacing: mode-switcher attention dot + Export-to-KSA pre-flight

**Goal**: The two remaining §11.1 surfaces outside Animation mode itself.
**Files**:
- Modify the mode-switcher component (P4; menubar center segment) — attention dot on the
  Animation segment
- Modify the Export-to-KSA dialog's pre-flight section (P10)
**Depends on**: 11D complete.
**Spec**:
- **Attention dot** (foundation §2.2; design §11.1): the `[▶]` mode segment renders a small
  dot when any clip has blockers — `computed` over `$clipIssues` (`Object.values(...).some(
  issues => issues.some(i => i.severity === 'blocker'))`). Tooltip: "N draft clips won't
  export". Follow whatever attention-dot affordance P4 built for other modes (Data validation
  uses the same concept); if none exists yet, this task creates the minimal dot style token.
- **Pre-flight** (design §11.1; foundation §10.6 non-blocking policy retained): the export
  dialog's pre-flight list gains an Animations block consuming the SAME `computeClipIssues`:
  wording "draft clips are skipped" + per-clip rows (name + blocker list); rows are jump links
  (click → close dialog → Animation mode → open the clip — the §2.5 jump convention). Exporter
  behavior UNCHANGED (drafts silently skipped — code: `src/ksa/partXmlSerializer.ts:176`,
  `src/ksa/modExport.ts:802` — the gate stays `isAnimationExportable`).
**Verify**: manual — the header-checklist #3 flow; unit: the dot computed (a one-line derived
atom) covered by `clipIssues.test.ts`'s existing matrix via a store-level assertion in
`animationStore.test.ts`.

---

#### P11E.02 — KSA import report: rich Animations notification

**Goal**: Part-browser imports post a notification-center rich entry describing what the
animation import did (design §11.3 item 3).
**Files**:
- Modify `src/state/partImport.ts`
- Modify `src/state/animationStore.test.ts` or a new `partImport.test.ts` case if the file has
  one (check; if partImport is untested, cover the report-builder as a pure helper)
**Depends on**: 11D complete.
**Spec**:
- Switch `importBuiltInPart`'s fit call (code: `src/state/partImport.ts:67`) to
  `fitAnimationEasingDetailed` (P11A.06) and collect per-clip:
  name · joint count · keyframes kept vs dense-fallback joints (`kind === 'dense'` list) ·
  per-channel fit summary (counts of eased channels) · "anchored at final keyframe (modeled
  deployed)" when `restAtLastKeyframe` · "CubicSpline sampling — imported approximately" when
  flagged.
- Post ONE `notify()` rich entry per import (severity `rich`, foundation §5.1 routing) titled
  `Imported <part>: N animation clips` with the block as its expandable body; skip when the
  part has no animation modules. Extract the report assembly as a pure helper
  `buildAnimationImportReport(decoded, fitted, reports): …` so it is unit-testable without
  fetch.
**Verify**: unit-test the helper (deploy clip → anchor note present; dense-fallback joint
listed); manual — import `ServiceModule` (or any animated built-in): bell pulses, the entry
lists clips with fit details.

---

#### P11E.03 — Project transfer: per-channel easings + flag ride verbatim (verification task)

**Goal**: Prove data-only project export/import (paste) carries the new model unchanged
(design §11.3 item 4 says "unchanged, now including per-channel easings verbatim" — verify,
don't rewrite).
**Files**:
- Modify `src/state/projectTransfer.test.ts`
**Depends on**: 11A (model), P11E.02.
**Spec**: `projectTransfer` clones animations with fresh ids and remaps member/solar refs
(code: `src/state/projectTransfer.ts:517-535`) — it moves whole `PartAnimation` objects, so
per-channel `easings` and `cubicSplineApprox` should ride along with NO code change. Add the
regression test: export a workspace whose clip has divergent per-channel easings + the flag →
import (additive paste) → the pasted clip's easings deep-equal (module keys remapped, easing
maps keyed by the NEW joint ids), flag preserved, members remapped, ONE undo step (the
existing suite's paste pattern). If the test exposes a dropped field, fix the clone site
minimally and note it.
**Verify**: the new test passes; no production diff expected (or a one-line fix, flagged).

---

#### P11E.04 — Palette commands + menu/status contribution audit

**Goal**: Every §13 command/menu/status contribution exists and routes through commandStore
(one dataset drives menubar/palette/hotkeys/Help).
**Files**:
- Modify the animation command registrations (wherever 11B/11C/11D registered theirs — one
  module preferred, e.g. `src/ui/animation/animationCommands.ts`; create it if registrations
  are scattered and re-home them)
**Depends on**: 11D complete.
**Spec** (design §13): ensure these palette commands exist (several landed with their features —
this task audits + fills gaps): "Go to Animation mode" (P4's mode command) · "Insert keyframe
at playhead" (= the `K` command id) · "Play/Pause preview" (= Space) · "Edit joint members"
(`openMembersView`) · "Edit joint pivot" (arm `$pivotEditing`) · "Re-anchor rest at selected
keyframe" (enabled when exactly one column selected) · "New animation clip" · dynamic provider
"Open clip: <name>" (per clip, switches `$activeAnimationId`). Menu audit: View ▸ Motion
Trails ▸ (P11D.05) · Window ▸ Timeline (P11B.01) — no other menubar additions (§13 "no new
top-level menus"). Status audit: mode chip `▶Anim` + active-layer chip in Animation (P4/P3
built the segments — confirm the layer chip shows in Animation per foundation §5 row 2), tool
segments (paint/pivot-pick/measure), posed-lock message, modifier-hint providers (timeline
hover + pose drag + member rows `⇧ range · ⌘ toggle`).
**Verify**: ⌘K lists every command above with working run(); Help renders the animation groups;
`pnpm test` (P4's registry conflict test stays green).

---

#### P11E.05 — Phone: transport chip + fullscreen Timeline sheet

**Goal**: The LOCKED phone timeline (design §14 row 1).
**Files**:
- Create `src/ui/animation/PhoneTransportChip.tsx`
- Create `src/ui/animation/PhoneTimelineSheet.tsx`
- Modify the phone frame host (P1's CondensedStatusBar stack) to dock the chip in Animation
  mode
- Modify `src/ui/animation/TimelineDock.tsx` (desktop-only guard — `useIsPhone`)
**Depends on**: 11D complete.
**Spec**:
- **Transport chip** docked above the condensed status bar in Animation mode:
  `[▶] Deploy ▓▓▓░ 1.2s [⤢]` — mini play/pause (store actions), clip name, progress bar (leaf
  subscription to `$playheadSec` — same perf rule), expand `⤢` → the sheet. Replaces v1's
  phone-pinned FloatingPreviewToolbar slot (deleted in P11B.03).
- **Timeline sheet**: fullscreen `Sheet` (P1 primitive) = TransportBar at `sm` density wrapped
  to 2 rows + the SAME `DopeSheetCanvas`. Touch gestures (design §14): tap track/ruler = park;
  tap diamond = pin; **long-press 250 ms + drag diamond = retime** (snap defaults ON);
  pinch = zoom; two-finger drag = pan; the ⇧-marquee replacement = a `[☑ select]` header
  toggle — while on, taps TOGGLE column membership; a selected-columns action row appears
  (Copy / Paste / Delete / Re-anchor). Close (grabber drag / ✕) returns to the viewport;
  playback continues (state is in the store — free).
- Desktop dock hidden on phone (`useIsPhone`, code: `src/ui/kit/useIsPhone.ts`); the sheet and
  dock share every component — no forked timeline logic (foundation §12 "no bespoke phone
  forks").
**Verify**: phone emulation — chip shows/plays/expands; all touch gestures per the table;
select-mode bulk delete shows the confirm strip; closing keeps playback running.

---

#### P11E.06 — Phone: Panel sheet navigator + Members pushed view + paint chip

**Goal**: Design §14 rows 2–3 — the right-sidebar content and Members/paint flows on phone.
**Files**:
- Modify the phone Panel-sheet host (P1) to serve `AnimationSidebar` in Animation mode
- Modify `src/ui/animation/MembersView.tsx` (pushed-view header variant `‹ Members`)
- Create `src/ui/animation/PhonePaintChip.tsx`
**Depends on**: P11E.05.
**Spec**:
- Re-tap the ▶ mode tab → Panel sheet hosting `AnimationSidebar` at `sm` density; joint
  drag-reparent falls back to the Re-parent ▸ menu (kept for exactly this — P11C.06 built it;
  suppress the drag grips on touch).
- Members view renders as a pushed view INSIDE the Panel sheet (back header `‹ Members`) —
  same component, `$membersView` unchanged.
- **Paint mode on phone**: arming 🖌 DISMISSES the sheet; a pinned chip `🖌 → HingeL · Done`
  docks above the condensed status bar (next to/replacing the transport chip slot while
  armed); tap meshes to toggle (P11C.03's routing is input-agnostic); `Done`/chip-tap reopens
  the sheet with the changed rows flashed (`onRowFlash`).
- Touch equivalents already in the grid (P11C.01): toggle-flash + long-press pulse.
**Verify**: phone — rig a joint end-to-end without a keyboard: tab re-tap → joints → Members →
check rows → assign; paint round-trip via the chip; re-parent via the menu.

---

#### P11E.07 — Phone: Inspector sheet, touch steppers, touch pose gizmo, axis-lock control, pivot flows

**Goal**: Design §14 rows 4–7 — the left-editor and 3D tooling on touch.
**Files**:
- Modify the phone Inspector-sheet host (P1) to serve `AnimationFocusEditor` (badge shows
  joint/keyframe context)
- Modify `src/ui/animation/AnimJointCard.tsx` + `AnimKeyframeCard.tsx` (steppers)
- Modify `src/three/PoseGizmo.ts` (touch hit scaling)
- Modify the Tool bar phone strip (P5B) — axis-lock segmented control
**Depends on**: P11E.06.
**Spec**:
- Inspector sheet hosts the focus editor; the FAB/chip badge shows the focus context (joint
  name / "kf @1.2s").
- **Touch steppers** on every pose/pivot numeric (the foundation §12 census-gap rule): reuse
  the stepper affordance P5B added to the transform card (grep its stepper component); the
  EasingCurveEditor's SVG handles get ≥32 px touch hit areas (invisible enlarged hit circles).
- **PoseGizmo on touch**: ring/handle hit targets scale ×1.6 (pointerType === 'touch'); the
  keyboard axis-lock is unavailable → a segmented control `[free|X|Y|Z]` appears in the Tool
  bar phone strip while a pose target exists; it sets a persistent-for-the-gesture lock
  (joint-LOCAL axis; the world-axis double-tap tier is desktop-only — note this as the §14
  sanctioned reduction, it is listed there verbatim).
- **Pivot tool / pivot-pick / working-pivot pick on phone**: armed from the Inspector sheet;
  the sheet auto-dismisses; the condensed status chip guides (tool chip = cancel tap — P3/P5B
  contract); tap completes; result flashes.
**Verify**: phone — pose numerically with steppers; drag a ring with touch (fat targets); lock
Y via the segmented control and drag; arm Edit pivot from the sheet → sheet dismisses → drag
the amber gizmo → chip cancel works; pivot-pick tap completes with a flash.

---

#### P11E.08 — Doc touch-ups owed by behavior changes

**Goal**: Keep the two existing docs that describe animation-adjacent behavior truthful
(the full `docs/animation-editor.md` is P12.14; `scope/animation.md` was P11A.12).
**Files**:
- Modify `docs/3d-workspace.md`
- Modify `docs/architecture.md` (only if its carve-out list names deleted files)
**Depends on**: P11E.07.
**Spec**:
- `docs/3d-workspace.md`: the store-subscription table row citing "animation preview" and the
  two body mentions (code: `docs/3d-workspace.md:45,132,184`) — update wording to
  `$playheadSec`/park/pin and `PoseGizmo` (the engine-proxy sentence at :184 compares to "the
  animation pose pivot" — keep the comparison but name the new gizmo). Do not restructure the
  doc.
- `docs/architecture.md:26-27`: the three-carve-out sentence lists the animation modules —
  still true (animationStore/animationImport/animationRig/easingFit keep three.js); extend the
  list with `clipIssues` ONLY if you gave it three imports (you should NOT have — it is
  pure/three-free; if so, no edit).
**Verify**: read both diffs against shipped code; `pnpm fmt:check`.

---

#### P11E.09 — Phase-11 closeout: design §17 parity walk + census pain ledger check

**Goal**: Execute the area's own RULE ZERO gate before P12's global audit: every row of
design-animation-mode.md §17 (v1 feature → v2 home) verified in the running app, and every §0
pain-ledger row confirmed retired.
**Files**: none (record the walk in the PR/commit message).
**Depends on**: P11E.01–P11E.08.
**Spec**: open design-animation-mode.md §17 and census animation.md §1 side by side; for each
of the ~35 parity rows, exercise the v2 home on desktop AND phone where the row has a phone
variant; for each of the 20 §0 pain rows, confirm the v2 answer behaves as designed. Known
logged behavior changes (cite them, do not "fix"): D3 clip re-click; auto-tool-pick removal
(anchor routing instead); `flexo:animPreviewFloatPos` abandoned; add-keyframe now
motion-neutral. Any genuine miss = STOP, file the fix task inside this phase before declaring
it done.
**Verify**: the recorded checklist (pass/fail per row) with zero FAILs; the five phase-gate
verification blocks of 11A–11E all green on the final tree.

---

## Phase 11 — deletion inventory (owed to the P12 death-sweep audit)

| Deleted | By task | Replacement |
|---|---|---|
| `src/ui/PreviewScrubber.tsx` | P11B.03 | TransportBar (§5.5) |
| `src/ui/FloatingPreviewToolbar.tsx` (+ `$animPreviewFloatPos`) | P11B.03 | TransportBar; phone transport chip (P11E.05) |
| `$animPreviewU` atom | P11B.03 | `$playheadSec` (+`$playheadU` computed) |
| AnimationPanel Escape window listener | P11B.09 | `mode:animation` Esc rung 7 |
| `src/ui/EasingEditor.tsx` | P11C.09 | `src/ui/animation/EasingCurveEditor.tsx` (guts ported + channel tabs) |
| `src/ui/AnimationPanel.tsx` | P11C.11 | AnimationSidebar + focus cards + timeline |
| `src/ui/AnimToolbar.tsx` | P11C.11 | mode header actions |
| `src/ui/MeshPickerModal.tsx` | P11C.11 | MembersView (`SubPartSetGrid`) |
| EditorScene `pivotHelper` + `updatePivotHelper` | P11D.03 | `JointMarkerLayer` (anchor-frame markers) |
| v1 auto tool pick in `selectKeyframeForEditing` | P11A.09 | anchor pivot-routing (P11D.04) |
| TransformControls-as-pose-gizmo attach path | P11D.01 | `PoseGizmo` (TransformControls stays for Build/Engine) |






---

## Phase 12 — v1 chrome death sweep, docs refresh, final parity + release audit

**Design sources**: foundation.md §6.3 (floating-surface death list), §16 (RULE ZERO ledger),
§17 (build order — step 3 "delete the toast region last"), §13 (shell stores / kept-as-is
list); design-build-mode.md §15 (parity table); design-animation-mode.md §17 (parity) + §3
(per-channel easing schema) + §11 (export/import contract); design-data-engine-modes.md §6
(parity tables) + D7/D11/D15/D16/D17; design-surface-assets.md §6 (v1 surface death list) +
§9 (parity); design-projects-export.md §14 (parity); design-system-services.md §2 (toast
facade), §5.2 (About), §10 (parity); FINAL_DESIGN_INDEX.md (authoritative hotkey table,
menubar tree, parity assertion); DECISIONS.md; AGENTS.md ("documentation", "repository
maintenance", "UI design" sections).

**Census sources**: ALL 12 files under `analysis/flexo-v2-feature-census/` —
`shell-layout.md`, `selection-transform.md`, `catalog-placement-layers.md`,
`viewport-scene-view.md`, `animation.md`, `engines.md`, `part-data-gamedata.md`,
`custom-assets.md`, `project-management.md`, `export-integration.md`, `chains-misc.md`,
`ui-kit-hotkeys.md`.

**Entry state**: Phases 0–11 are complete. The v2 shell is fully operational: docked
layout + layoutStore (P1), MenuSpec menubar + commandStore/dialogStore + palette (P2),
status bar + statusStore/notificationStore + toast routing (P3), modeStore + scoped
hotkeys (P4), Build mode (P5A/P5B), Data mode (P6), Engine mode (P7), Surface mode +
Asset Manager (P8), IndexedDB projects + Project Manager + archives (P9), Export to KSA v2
(P10), Animation mode + timeline dock (P11). Each of those phases was *supposed* to delete
the v1 surfaces it replaced; some deletions may have been missed or left partial
(re-exports, dead files, stale imports, orphaned kit pieces). `docs/*.md` still largely
describe the v1 UI. No Playwright smoke exists (the `playwright` package is already a
devDependency — package.json `"playwright": "1.62.1"`).

**Exit state**: Zero v1 chrome files or dead exports remain in the tree; every
`@nanostores/persistent` key in code is actually read; `docs/` describes the v2 app
accurately (including two NEW docs: `ui-shell.md`, `animation-editor.md`); `scope/` is in
sync with the only two game-contract-touching changes this refactor made; the RULE ZERO
parity audit has been executed item-by-item against all 12 census files with a written
result; a repeatable Playwright smoke script passes against the dev server; the About
dialog carries v2 version notes; the full quality gate is green. This is the release
phase — after it, v2 ships.

**Phase verification** (end-of-phase, in order, run each command BARE — no pipes):
1. `pnpm fmt` → `pnpm lint` → `pnpm fmt:check` → `pnpm typecheck` → `pnpm test`
2. `pnpm build` (both bundles must build — the partpreview mini-app shares assets)
3. `pnpm smoke` (the P12.18 Playwright script) exits 0
4. The P12.17 parity-audit checklist is fully executed and its result recorded
5. Manual: boot the app clean (empty localStorage + IndexedDB), confirm About first-run
   auto-open with the "What's new in v2" section, dismiss, place a SubPart, cycle all
   five modes, undo, reload — project restores.

---

#### P12.01 — Consolidated v1 death-sweep audit: verify every scheduled deletion landed, delete stragglers

**Goal**: Enumerate every v1 file/component/store slated for death across Phases 1–11,
prove each is gone and unreferenced (exact grep patterns, expected zero hits), and delete
any stragglers the earlier phases missed.

**Files**:
- Delete (only if still present — each SHOULD already be gone; the table names the phase
  that owed the deletion): see the master table below. All paths relative to repo root.
- Modify: any file still importing a dead symbol (fix by completing the owed migration,
  never by re-exporting a shim).

**Depends on**: none (first task of the phase).

**Spec**:
This is an audit-then-delete task. The master death table below is the union of
foundation.md §6.3 (floating-surface death list), §16 (RULE ZERO ledger),
design-surface-assets.md §6, design-data-engine-modes.md §6 + the D11 dual-route deaths,
design-build-mode.md §15, design-animation-mode.md §17, and design-projects-export.md §14
— cross-checked against the v1 working tree (every file below was verified to exist in
`src/` at plan time). For each row:

1. Check the file no longer exists (`ls <path>` fails).
2. Run the row's grep; expect **zero hits**. Grep over `src/ apps/` (the partpreview
   mini-app must not secretly import dead chrome).
3. If the file still exists or the grep hits: the owning phase left a straggler. Complete
   that phase's deletion now — remove the file, fix the importer by wiring it to the v2
   replacement named in the row (cite that row's design §). Do NOT leave a compatibility
   re-export.

Master death table (v1 file → v2 replacement → phase that owed the deletion → verification grep):

| # | v1 file (verified present in v1 tree) | v2 replacement (design cite) | Owed by | Grep (expect 0 hits in `src/ apps/`) |
|---|---|---|---|---|
| 1 | `src/ui/Toolbar.tsx` (`EditorToolbar`) | Menubar (foundation §3, §6.3) | P2 | `grep -rn "EditorToolbar\|ui/Toolbar'" src apps` — NOTE: `src/ui/kit/Toolbar.tsx` is a different file; see P12.02 |
| 2 | `src/ui/MobileTopBar.tsx` | PhoneTopBar + MenuSheet (foundation §12) | P2 | `grep -rn "MobileTopBar" src apps` |
| 3 | `src/ui/AddButton.tsx` | Add menu commands (foundation §3 Add; census: catalog-placement-layers.md §1.1) | P2 | `grep -rn "AddButton" src apps` |
| 4 | `src/ui/ViewButton.tsx` | View menu + Settings → Viewport/Scene (foundation §3 View, S16) | P2 | `grep -rn "ViewButton" src apps` |
| 5 | `src/ui/MeasureButton.tsx` | View ▸ Measurement Overlays / Units + Tools menu + Outliner Aids (foundation §16) | P2 | `grep -rn "MeasureButton" src apps` |
| 6 | `src/ui/SettingsButton.tsx` (burger) | Edit ▸ Settings… ⌘, + Help entries + Settings → Advanced Reset (S12) | P2 | `grep -rn "SettingsButton" src apps` |
| 7 | `src/ui/ProjectButton.tsx` | menubar project chip + File menu + Project Manager (foundation §10.2; projects design §2) | P2/P9 | `grep -rn "ProjectButton" src apps` |
| 8 | `src/ui/PartDataButton.tsx` (Part Data fullscreen modal) | Data mode Part scope (data-engine D11 — "the modals die") | P2.11 deleted the trigger file; P2.07 moved the modal guts to `src/ui/PartDataDialog.tsx`, which P6.18 deletes | `grep -rn "PartDataButton\|PartDataDialog" src apps` |
| 9 | `src/ui/HistoryButton.tsx` | Edit ▸ History ▸ jump list (S14) | P2 | `grep -rn "HistoryButton" src apps` |
| 10 | `src/ui/ExportButton.tsx` (button + inline dialog host) | Export to KSA dialog (`ExportKsaDialog.tsx`) opened via dialogStore, ⌘E (foundation §10.6; export area) | P2.11 deleted the trigger; P2.07 moved the guts to `src/ui/ExportDialog.tsx`, which P10.07 deletes | `grep -rn "ExportButton\|ui/ExportDialog" src apps` |
| 11 | `src/ui/LayersButton.tsx` + `src/ui/LayersPanel.tsx` | Outliner layer header rows (foundation §8.1, S17; build design §2.2) | P5A | `grep -rn "LayersButton\|LayersPanel" src apps` |
| 12 | `src/ui/AssetsList.tsx` + `src/ui/AssetsToolbar.tsx` | Outliner entity rows + search (foundation §8.1) | P5A | `grep -rn "AssetsList\|AssetsToolbar" src apps` |
| 13 | `src/ui/InspectorContent.tsx` (the `$inspectorMode` body switcher) | `ModeSidebar.tsx` mode-swapped right sidebar (foundation §8; modeStore §2.3) | P4 (P4.03 — the plan moved this earlier than the design's Build-phase row) | `grep -rn "InspectorContent" src apps` |
| 14 | `src/ui/RightPanel.tsx` (pointer-events-none shell) | docked RightSidebar flex sibling (foundation §1) | P1 | `grep -rn "RightPanel" src apps` |
| 15 | `src/ui/MobileInspector.tsx` (FAB + sheet) | phone Inspector sheet (foundation §12) | P1 | `grep -rn "MobileInspector" src apps` |
| 16 | `src/ui/FloatingInspector.tsx` | left sidebar focus editor (foundation §6.3, §7) | P5B | `grep -rn "FloatingInspector" src apps` |
| 17 | `src/ui/TransformInspector.tsx` (monolith) | per-kind inspector files (foundation §7.1; build design §3) | P5B | `grep -rn "TransformInspector" src apps` |
| 18 | `src/ui/SelectionToolbar.tsx` | Tool bar window + left-sidebar actions + Edit menu (foundation §6.3) | P5B | `grep -rn "SelectionToolbar" src apps` |
| 19 | `src/ui/MultiSelectToolbar.tsx` | left multi-select panel (foundation §7.1) | P5B | `grep -rn "MultiSelectToolbar" src apps` |
| 20 | `src/ui/TransformHud.tsx` | status-bar rotate/nudge chips (foundation §5 seg 8) | P3 | `grep -rn "TransformHud" src apps` |
| 21 | `src/ui/MeasurementInfo.tsx` | status-bar selection readout (foundation §5 seg 4) | P3 | `grep -rn "MeasurementInfo" src apps` |
| 22 | `src/ui/SeatViewBar.tsx` | status-bar tool segment (foundation §5 seg 3, S3) | P3 | `grep -rn "SeatViewBar" src apps` |
| 23 | `WorkspaceLoadProgress` (was `src/ui/LoadProgress.tsx:69`) | status-bar progress segment + popover (foundation §5 seg 6) — `PreviewLoadProgress` (same file, line 83) is KEPT for browser preview overlays (foundation §16) | P3 | `grep -rn "WorkspaceLoadProgress" src apps` |
| 24 | `src/ui/MeasurementEditor.tsx` + `src/ui/ContainerEditor.tsx` + `src/ui/FloatingEditorPanel.tsx` | left-sidebar aid editors (foundation §7.1, S28) | P5B | `grep -rn "MeasurementEditor\|ContainerEditor\|FloatingEditorPanel" src apps` |
| 25 | `src/ui/MeasurementList.tsx` + `src/ui/ContainerList.tsx` | Outliner Aids section (foundation §8.1; build design §2) | P5A | `grep -rn "MeasurementList\|ContainerList" src apps` |
| 26 | `src/ui/ManageTanksModal.tsx` ("SubPart Data" modal) | Data mode template scope (data-engine D11) | P6 | `grep -rn "ManageTanksModal" src apps` |
| 27 | `src/ui/GameDataSections.tsx` (monolith) | `src/ui/data/*` scope-form sections (data-engine design table at line ~699: DataNavigator, DataScopeForm, sections, PassthroughViewer) | P6 | `grep -rn "GameDataSections" src apps` |
| 28 | `src/ui/EnginePanel.tsx` + `src/ui/EngineToolbar.tsx` + `src/ui/EngineSections.tsx` | Engine mode navigator + `src/ui/engine/*` module editors (data-engine design §B + D5) | P7 | `grep -rn "EnginePanel\|EngineToolbar\|EngineSections" src apps` |
| 29 | `src/ui/CustomAssetsModal.tsx` | Asset Manager ⇧⌘A (foundation §10.3; surface design §2) | P8 | `grep -rn "CustomAssetsModal" src apps` |
| 30 | `src/ui/ManageTexturesPanel.tsx` (+ its `$managingMeshId` driver) | Surface mode right sidebar (foundation §8.5; surface design §6.3 — "`$managingMeshId` and the floating ManageTexturesPanel are deleted") | P8 | `grep -rn "ManageTexturesPanel\|managingMeshId" src apps` |
| 31 | `src/ui/ImportReportCard.tsx` | notification-center rich entry (foundation §5.1 `rich` tier, §6.3) | P3 (P3.14 deleted it EARLY — the design's death table says P8; P8.21 only verified/extended the rich entry. Follow the plan, not the design row) | `grep -rn "ImportReportCard" src apps` |
| 32 | `src/ui/AnimationPanel.tsx` + `src/ui/AnimToolbar.tsx` | Animation right navigator + left focus editor (animation design §6/§8) | P11 | `grep -rn "AnimationPanel\|AnimToolbar" src apps` |
| 33 | `src/ui/PreviewScrubber.tsx` + `src/ui/FloatingPreviewToolbar.tsx` | timeline dock transport — single home (foundation §6.3, §9; animation design §5) | P11 | `grep -rn "PreviewScrubber\|FloatingPreviewToolbar" src apps` |
| 34 | `src/ui/MeshPickerModal.tsx` | docked Members view `SubPartSetGrid` (foundation §10.11; animation design §7) | P11 | `grep -rn "MeshPickerModal" src apps` |
| 35 | `src/ui/BuildIdMismatchDialog.tsx` | sticky notification w/ [Reload] [Reset everything…] (S26; projects design §9.1) | P9 | `grep -rn "BuildIdMismatchDialog" src apps` |
| 36 | `src/state/uiStore.ts` — `$inspectorMode` (line 18), `$inspectorVisible` (25), `$inspectorWidth` (28), `$inspectorFloatPos` (54), `$animPreviewFloatPos` (69) | `$mode` in modeStore (foundation §13) + `flexo:layout` in layoutStore | P1 layout / P4 mode; file deleted with its last atom | `grep -rn "uiStore\|inspectorMode\|inspectorVisible\|inspectorWidth\|inspectorFloatPos\|animPreviewFloatPos" src apps` |
| 37 | `src/state/helpStore.ts` (`$helpOpen`, line 9) | `dialogStore.$openDialog = {id:'help'}` (foundation §13 dialogStore "replaces … `$helpOpen`, `$aboutOpen`") | P2 | `grep -rn "helpStore\|\\$helpOpen" src apps` |
| 38 | `$aboutOpen` in `src/state/aboutStore.ts` | `dialogStore` id `'about'` (system-services §5.2) — NOTE: `$aboutSeen` (`flexo:aboutSeen`, aboutStore.ts:18), `showAboutOnFirstUse` and `suppressAboutFirstUse` SURVIVE (first-run + share-link suppression preserved) | P2 | `grep -rn "aboutOpen\|openAbout\|closeAbout" src apps` |

Do not delete anything NOT on this table in this task; survivors are audited in P12.02.
If a row's replacement turns out never to have been built (not just not-deleted), STOP —
that is a missing earlier-phase feature, not a sweep item; flag it against the owning
phase rather than improvising here (RULE ZERO).

Undo enrollment: N/A — this task deletes dead UI files only; it must not touch the
document model or any store semantics.

**Verify**:
- Every grep in the table returns zero hits; every listed file is absent.
- `pnpm typecheck` and `pnpm lint` pass (deleting files surfaces any missed importer
  immediately).
- `pnpm test` passes (no test may still import a dead module; fix tests by retargeting
  the v2 replacement, keeping the covered behavior asserted).
- Manual: app boots, all five modes render, no blank panels.

---

#### P12.02 — Survivor audit: kept files are correctly scoped, no dead exports or orphans

**Goal**: Verify each deliberately-KEPT v1 file survives in exactly its sanctioned role,
and remove dead exports/orphans that the rehosts left behind.

**Files**:
- Audit (modify only if a dead export/import is found): `src/ui/BrowserShell.tsx`,
  `src/ui/VerticalSplit.tsx`, `src/ui/LoadProgress.tsx`, `src/ui/chain/*`,
  `src/state/viewStore.ts`, `src/state/aboutStore.ts`, `src/ui/kit/Toolbar.tsx`,
  `src/ui/kit/index.ts`, `src/ui/nukeAndReload.ts`, `src/ui/ViewportDropZone.tsx`.

**Depends on**: P12.01.

**Spec**:
1. **BrowserShell reuse decision (RESOLVED: KEPT).** Foundation §10.10 preserves the
   catalog browsers' split-pane layout, so `src/ui/BrowserShell.tsx` (`BrowserLayout`,
   `BrowserPopup`) survives as the browsers' shared shell. Verify its only importers are
   `src/ui/SubPartBrowser.tsx` and `src/ui/PartBrowser.tsx` (v1 state:
   PartBrowser.tsx:25 and SubPartBrowser.tsx:20 import `BrowserLayout, BrowserPopup`) —
   plus, if P8 chose to host the Asset Manager grid in it, that one additional importer.
   Any OTHER importer is a smell: fix it to use the proper v2 surface.
   `grep -rn "BrowserShell" src apps` and review each hit.
2. **VerticalSplit**: foundation §1.1 — "`VerticalSplit` survives for in-dialog splits
   only". Verify every importer of `src/ui/VerticalSplit.tsx` is dialog content (the two
   browsers / import review); no sidebar or shell chrome may use it (shell resizing is
   `ResizeHandle`). `grep -rn "VerticalSplit\|HorizontalSplit" src apps`.
3. **LoadProgress.tsx**: only `PreviewLoadProgress` remains exported (P12.01 row 23).
   If the file now exports nothing else, rename considerations are out of scope — just
   confirm no dead code paths (`$browserPopupCount` gating logic that referenced the
   deleted workspace overlay).
4. **Chain palette**: `src/ui/chain/ChainPalette.tsx`, `ChainStepCard.tsx`,
   `chainCommands.ts`, `openChainPalette.ts` are KEPT, upgraded to the `chain`
   FloatingWindow tenant (foundation §6.2). Verify ChainPalette is mounted ONLY through
   the FloatingWindow host, and that `openChainPalette` is invoked only via the
   `⇧⌘K` command / Edit menu / palette (commandStore), not by any dead toolbar button.
5. **viewStore remnants**: foundation §13 keeps `viewStore` as-is
   (`$grids` viewStore.ts:27, `$hideInterior` :48, `$cameraSnap` :58, `$cameraState` :72,
   `$cameraRestore` :78, `resetCamera` :91 — camera-per-project persistence unchanged).
   Verify no atom was orphaned by the View-menu migration: every export of
   `src/state/viewStore.ts` must have ≥1 importer. Remove any export with zero importers
   (dead after P2's View menu / P4's camera commands).
6. **aboutStore residue**: after P12.01 row 38, `src/state/aboutStore.ts` contains only
   the persisted `$aboutSeen` + first-run/suppression helpers. Verify no `$aboutOpen`
   atom remains.
7. **Kit orphan check**: for every file in `src/ui/kit/`, confirm ≥1 importer outside
   the kit. Known risk items: `src/ui/kit/Toolbar.tsx` (v1 consumers were the deleted
   floating toolbars — if its only remaining consumer set is empty, delete it and its
   `index.ts` re-export), `src/ui/kit/Toast.tsx` (handled separately in P12.03 — skip
   here). Do NOT delete kit primitives that P0 added (ResizeHandle, FloatingWindow,
   DialogViewStack, InlineConfirmStrip, CopyDownloadBar, zIndex.ts, panelChrome…).
8. **nukeAndReload / ViewportDropZone**: assert both still exist and are wired
   (foundation §3 "Reset Everything… `nukeAndReload` semantics unchanged"; §1
   "ViewportDropZone … stays (canvas overlay)"). These are keep-assertions, not deletions.
9. Produce (in the task's commit message / PR description, not a repo file) the final
   list of anything additionally deleted.

Undo enrollment: N/A (no document mutation).

**Verify**:
- `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.
- `grep -rn "from './kit'" src/ui | head` sanity: kit imports resolve.
- Manual: open SubPart browser and Part browser (Add menu) — split panes drag; open the
  chain window (⇧⌘K with a SubPart selected) — floats, drags, applies.

---

#### P12.03 — VERIFY the react-aria toast region is gone (deletion owned by P3.06)

**Goal**: Confirm `GlobalToastRegion` + the react-aria `ToastQueue` no longer exist —
**P3.06 performed this deletion** (foundation §17 step 3's "delete the toast region last"
means last within step 3, after the facade routing, which P3.06 honored). This task is
the release-time re-verification; it deletes stragglers ONLY if P3.06 somehow missed one.

**Files**:
- Modify: `src/ui/kit/Toast.tsx` — delete `GlobalToastRegion` (v1: Toast.tsx:39) and
  `toastQueue` (v1: Toast.tsx:19); keep the `toast()` facade + `ToastMessage` type if the
  P3 facade still lives here (it may have moved to `src/state/statusStore.ts` — in that
  case delete `src/ui/kit/Toast.tsx` entirely).
- Modify: `src/ui/kit/index.ts` — v1 line 45 re-exports
  `{ GlobalToastRegion, toast, toastQueue, type ToastMessage }`; prune to whatever
  survives.
- Modify: the root component (v1 `src/app.tsx`) if it still mounts `<GlobalToastRegion />`.

**Depends on**: P12.01.

**Spec**:
- Foundation §5.1: `toast(message, opts)` KEEPS its exact imperative signature
  (constitution — EditorScene, boot code, nudge/rotateControls call it unmodified) and is
  a facade into statusStore + notificationStore. By P12 there must be no code path that
  enqueues into a react-aria `ToastQueue`, and the v1 `z-[100]` toast stacking layer is
  deleted (foundation §1.3: "The toast stacking layer (v1 z-100) is **deleted**").
- Verify the facade still supports the routing table's variants
  (`transient`/`success`/`warning`/`danger`/`rich` — foundation §5.1) — do not change
  routing here, only delete the dead renderer.
- Greps, expect zero hits after: `grep -rn "GlobalToastRegion\|toastQueue\|ToastRegion" src apps`
  and `grep -rn "z-\[100\]" src`.

Undo enrollment: N/A.

**Verify**:
- `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.
- Existing statusStore/notificationStore unit tests (P3) still pass unchanged.
- Manual: trigger a transient toast (nudge a selection with arrow keys → status message
  flashes the axis/step), a warning (boot with a stale-schema project in localStorage →
  bell notification), and confirm nothing renders bottom-right.

---

#### P12.04 — Dead persisted-key cleanup: purge abandoned localStorage keys, assert every live key is read

**Goal**: Extend the boot cleanup to remove the four abandoned v1 layout keys, confirm
the P9 project-key purge covers `flexo:project:*`/`flexo:currentProject`, and assert the
persisted-key set in code is exactly the documented set.

**Files**:
- Modify: the v2 boot cleanup module (P9 placed the v1 project-storage purge; v1
  anchor: `src/state/projectStore.ts:233` "Boot-time cleanup: drop any
  `flexo:project:*` entry we can't honor", `PROJECT_KEY_PREFIX` at :57,
  `CURRENT_PROJECT_KEY` at :58).
- Create/extend: the store test covering the purge (pattern:
  `src/state/projectStore.test.ts`).

**Depends on**: P12.01 (uiStore must already be gone).

**Spec**:
- Foundation §13: "v1 layout keys are simply abandoned (defensive reads drop unknown
  shapes; Reset wipes)". Abandoned-but-present keys are still clutter that Reset-only
  cleanup never removes for upgrading users; the constitution's no-migration rule
  (AGENTS.md; memory `feedback_no_data_migration`) sanctions *discarding* stale data at
  boot — never converting it. So: add the four dead keys to the same boot-time cleanup
  that P9 built for v1 project storage, as plain `localStorage.removeItem` calls:
  ```ts
  // v1 layout keys — replaced by flexo:layout (foundation §13). Removal, not migration.
  const DEAD_V1_KEYS = [
    'flexo:inspectorVisible',
    'flexo:inspectorWidth',
    'flexo:inspectorFloatPos',
    'flexo:animPreviewFloatPos',
  ];
  for (const k of DEAD_V1_KEYS) localStorage.removeItem(k);
  ```
  NEVER read the old values first. No notice needed (layout prefs, not user data).
- Confirm P9's purge removes `flexo:currentProject` and every `flexo:project:*` entry
  after the IndexedDB move (LOCKED #3; projects design §1). If P9 missed it, add those
  removals to the same cleanup (again: remove, never import).
- **Live-key assertion**: enumerate every `persistentJSON`/`persistentAtom` key with
  `grep -rn "persistent" src/state src/ui --include="*.ts" --include="*.tsx"` and
  cross-check against the expected v2 set:
  - kept from v1: `flexo:grids`, `flexo:hideInterior`, `flexo:chainDefaults`,
    `flexo:aboutSeen`, `flexo:simulateGlass`, `flexo:showFpsCounter`,
    `flexo:selectionHighlight`, `flexo:rotateStep`, `flexo:rotateAxisOffset`,
    `flexo:nudgeStep`, `flexo:nudgeAxis`, `flexo:modelImport`, `flexo:measure`,
    `flexo:lightSettings`, `flexo:lighting`,
    `flexo:kittenTextureExport`, `flexo:ivaSeatSettings`, `flexo:connectorSettings`,
    `flexo:colliders`, `flexo:containers`, `flexo:bulkScaleMode`
    (editorStore.ts:234 in v1)
  - new in v2: `flexo:layout` (layoutStore P0.09), `flexo:paletteRecents` (P2.01),
    `flexo:rebindNoticeSeen` (P4.11), `flexo:snapEnabled` + `flexo:snapTranslateStep` +
    `flexo:snapRotateStep` (P5B.01 — three flat keys, a documented deviation from the
    design's single `flexo:snap`; there is NO `flexo:snap` key), `flexo:gizmoSpace`
    (P5B.02), `flexo:kindVisibility` (P5B.04), `flexo:assetManager` (P8.14),
    `flexo:projectManagerView` (P9.09), `flexo:currentProjectId` (P9.03/P9.04 — the
    current-project pointer; plain localStorage, so ALSO grep `localStorage.` writes,
    not just `persistent`), `flexo:confirmThreshold` (P9.17b), plus any keys the area
    phases added per their designs (list them from the grep; each must be named in a
    design doc or its phase task — anything unaccounted for is a bug).
  - gone: the four DEAD_V1_KEYS + `flexo:currentProject` + `flexo:project:*` +
    `flexo:layerView` (P9.07 dropped the global key — layer view state rides ONLY the
    project snapshot now; if the grep still finds a `flexo:layerView` persistentJSON,
    P9.07 was missed — fix there, and add the key to the boot removals here).
  Every key found by the grep must have at least one reader; a write-only key is dead —
  delete it.
- Undo enrollment: N/A — boot cleanup touches persisted view/layout state only, never
  the document, and must not create undo steps (foundation §13 rules).

**Verify**:
- New/extended vitest case (name it in the purge module's test file, e.g.
  `boot cleanup removes abandoned v1 layout keys`): seed the four dead keys +
  a `flexo:project:x` entry into a fake localStorage, run the cleanup, assert all gone
  and that no OTHER `flexo:*` key was touched.
- `pnpm test`, `pnpm typecheck` pass.
- Manual: seed `localStorage.setItem('flexo:inspectorWidth','450')` in devtools, reload,
  key is gone; app layout unaffected.

---

#### P12.05 — Docs refresh: `docs/architecture.md` + `docs/editor-state.md`

**Goal**: Make the two spine docs describe the v2 shell architecture and store set.

**Files**:
- Modify: `docs/architecture.md` (v1 sections: "Layering" :7, "Single source of truth &
  data flow" :33, "Key invariants" :64, "Build & tooling" :95, "Feature docs" :118).
- Modify: `docs/editor-state.md` (v1 sections: "Stores" :7, "Actions" :31, "Selectors"
  :142, "Two-way binding" :147, "List selection" :179, "UI panels (`src/ui/`)" :213,
  "Persistence" :232, "Tests" :240).

**Depends on**: P12.01–P12.03 (describe the post-sweep tree, not a moving target).

**Spec**:
- `architecture.md`:
  - Rewrite the app-shell description: docked flex layout (menubar / left sidebar /
    viewport / right sidebar / timeline dock / status bar — foundation §1), the five-mode
    machine (`modeStore`, foundation §2), commands-as-data (commandStore + MenuSpec →
    menubar, MenuSheet, ⌘K palette, hotkeys, Help — foundation §4), dialogs mounted once
    at root behind `dialogStore` (foundation §10.1).
  - Update the layering paragraph with the new `src/state/` shell stores (modeStore,
    layoutStore, statusStore, notificationStore, modifierStore, commandStore,
    dialogStore, snapStore, projectIndexStore — foundation §13 table) and the new UI
    subdirectories the phases introduced (e.g. `src/ui/engine/*`, `src/ui/data/*` per
    data-engine design; the shell/command modules per P1/P2). Enumerate from the actual
    tree — do not guess names; `ls src/state src/ui`.
  - Key invariants section: add "mode/layout/status/notifications/windows never create
    undo steps" (foundation §13) and "on-demand render loop — no chrome may force
    continuous rendering" (foundation §14.5); keep all existing invariants.
  - "Feature docs" list: add `ui-shell.md` + `animation-editor.md` (created in
    P12.13/P12.14 — write the links now, tasks run in the same phase).
- `editor-state.md`:
  - Stores list: reflect the v2 store table (foundation §13), including which are
    persisted and under which key; keep the undo/redo invariant section — its anchor
    `#undoredo-invariant-must-maintain` is linked from AGENTS.md, DO NOT rename the
    heading.
  - Replace the "UI panels (`src/ui/`)" section's v1 panel inventory with the v2 surface
    map: left focus editor / right mode primary / status bar / dialogs / two floating
    windows — one short paragraph each, deep-linking `ui-shell.md` for detail.
  - Selection: if P5A moved selection to stable ids (build design §1.1), document the
    `SelectionRef` model + clamping-becomes-filtering; else keep the index model text.
    Check `src/state/editorStore.ts` for which shipped.
- Docs-only task: no code, no undo, no numeric inputs.

**Verify**:
- `pnpm fmt:check` clean (oxfmt formats md? if not, skip — run `pnpm fmt` regardless;
  formatter is a no-op on files it doesn't cover).
- Proofread pass: every file path named in the two docs exists
  (`grep -oE 'src/[A-Za-z0-9/._-]+' docs/architecture.md docs/editor-state.md` and check
  each against the tree).
- Every store named in editor-state.md exists in `src/state/`.

---

#### P12.06 — Docs refresh: `docs/3d-workspace.md` + `docs/layers.md`

**Goal**: Update the viewport doc's gizmo/camera/selection chrome and rewrite the layers
doc's UI sections around the Outliner.

**Files**:
- Modify: `docs/3d-workspace.md` (v1 sections: "Components" :6, "Selection & gizmo" :75,
  "Layer visibility & lock" :236, "Lighting / look" :255).
- Modify: `docs/layers.md` (v1 sections: "UI — sidebar Layers popover" :134,
  "UI — the Assets list" :150; model sections :8–:124 are mostly still true).

**Depends on**: P12.01.

**Spec**:
- `3d-workspace.md`:
  - Components: canvas is now a flex-cell sibling (orbit center == visible center,
    foundation §1); canvas-overlays list (CSS2D labels, drop zone, stats.js, marquee div
    — foundation §1 "Canvas-overlays").
  - Gizmo: tool switching via the floating Tool bar window + `T`/⇧`T` (foundation §6.2,
    S5), snap UI (`$snapEnabled` + ⌃ temporary invert — LOCKED #7, build design §4),
    ⌥-drag duplicate (foundation §14.2), marquee box select (foundation §14.1,
    LOCKED #7), pose-gizmo precedence in Animation mode (unchanged semantics, new mode
    gate — animation design §9).
  - Camera: `F` Frame Selection with frame-all fallback (LOCKED; foundation §3 View),
    Reset Camera command, camera snaps orbit the selection centroid (foundation §3 View);
    camera-per-project persistence unchanged (`viewStore` — foundation §13).
  - Keep the on-demand rendering section verbatim-in-spirit; note FPS counter is now
    View → FPS Counter + status-bar readout (foundation §5 seg 10).
- `layers.md`:
  - Replace BOTH v1 UI sections with one "UI — the Outliner" section: layer header rows
    (active radio dot, inline rename, count chip, eye, opacity swatch popover, lock,
    listed, row ⋮ menu, drag-reorder, ＋ Layer row — foundation §8.1; build design §2.2),
    entity rows + drag-to-layer, the status-bar active-layer chip (foundation §5 seg 2),
    Select ▸ By Layer ▸.
  - Keep the document-state vs view-state model sections; update file references
    (LayersPanel/AssetsList → the Outliner component paths actually shipped by P5A —
    read them from the tree).
- Docs-only.

**Verify**: file-path proofread as in P12.05; every hotkey named matches
FINAL_DESIGN_INDEX.md's consolidated table.

---

#### P12.07 — Docs refresh: `docs/projects.md` full rewrite

**Goal**: Rewrite the projects doc for the v2 storage model (IndexedDB, id-keyed, Project
Manager, archives).

**Files**:
- Modify (full rewrite): `docs/projects.md` (v1 sections "Storage convention" :25,
  "Autosave" :35, "Boot restore" :44, "Schema version & preservation" :51, "Actions" :79,
  "The compact project codec" :92, "UI — `src/ui/ProjectButton.tsx`" :117, "Tests" :124).

**Depends on**: P12.01.

**Spec**: Rewrite from design-projects-export.md §1–§4 + foundation §10.2, describing
what P9 actually shipped (verify each claim against `src/state/`):
- Identity: stable project ids; id-keyed IndexedDB snapshots + reactive metadata index
  (`projectIndexStore` — foundation §13; kills the v1 `setTick` hack the census recorded
  at project-management.md §1.3).
- Autosave-only model + loud write-failure surfacing (danger notification — foundation
  §5.1 table); `⌘S` = "Autosaved ✓" flash.
- Boot sequence v2 (awaited boot, Web-Locks multi-tab if shipped — projects design D4/D5),
  share-link boot behaviors (skip build check, suppress About, param strip — unchanged).
- Schema-version preservation policy: keep the existing section's policy prose (it is
  constitution-adjacent), updated for the IDB store; the boot purge notice is now a
  warning notification.
- Project Manager UI (foundation §10.2): grid, counts, rename-never-clobbers
  (auto-suffix — fixes the v1 silent overwrite recorded in census
  project-management.md §1.1), duplicate, delete w/ inline confirm, descriptions,
  thumbnails.
- `.flexo.tar.gz` archive export/import + Merge-vs-Open-as-new (foundation §3 File;
  LOCKED #3 — the `hasCustomAssets` share gate is REMOVED), share links.
- Asset blob namespacing (`pa:` project-id prefix — surface design D5 / projects design
  §1.5) and what project delete/duplicate does to blobs.
- Update the codec section only where P9/P11 changed it (per-channel easing encoding
  `e: {p?, r?, s?}` — animation design §3).
- Docs-only.

**Verify**: every store/action named exists (`grep` each against `src/state/`); the doc
nowhere mentions localStorage project snapshots except in the historical purge note.

---

#### P12.08 — Docs refresh: `docs/state-persistence.md` keys table

**Goal**: Make the persistence doc's key inventory match the audited v2 key set.

**Files**:
- Modify: `docs/state-persistence.md` (v1 sections "Layout and Panel State" :66,
  "Projects (workspace persistence)" :132, "What to Persist" :40).

**Depends on**: P12.04 (the audited key list is the source of truth).

**Spec**:
- Replace the layout/panel section with `flexo:layout` (one key: sidebar widths/collapse,
  timeline height, float positions + z-order — foundation §13) and the three snap keys
  `flexo:snapEnabled`/`flexo:snapTranslateStep`/`flexo:snapRotateStep` (P5B.01's
  documented deviation — there is no single `flexo:snap` key).
- Add a complete key table: every key from the P12.04 live-key assertion, one row each
  (key → store file → what it holds → default). Mark the dead v1 keys in a short
  "removed in v2 (boot-cleaned)" list.
- Projects section: now a pointer to `docs/projects.md` (IndexedDB — localStorage no
  longer holds snapshots).
- Keep the "what NOT to persist" guidance; add: notifications are session-only news
  (foundation §5.2), `$mode` is deliberately ephemeral (S9).
- Docs-only.

**Verify**: diff the doc's key table against the P12.04 grep output — sets must be equal.

---

#### P12.09 — Docs refresh: `docs/custom-assets.md` + `docs/importing-models.md` UI paths

**Goal**: Repoint every UI path in the two asset docs at the v2 surfaces.

**Files**:
- Modify: `docs/custom-assets.md` (UI paths appear throughout "Modules" :78 and the
  emissive/visor section :580).
- Modify: `docs/importing-models.md` ("Managing imports" :369, "Module map" :207,
  dialog references throughout).

**Depends on**: P12.01.

**Spec**:
- `custom-assets.md`: "Custom (N)" modal / AssetsToolbar / ManageTexturesPanel paths →
  Asset Manager (Window ▸ Asset Manager… ⇧⌘A, foundation §10.3) and Surface mode
  (mesh picker + surface editor, foundation §8.5); texture upload / material creation →
  Add ▸ Upload Texture… / New Material… (foundation §3 Add); glow paint stays an overlay
  dialog opened from Surface mode (S29); kitten texture export mode → Settings → Import &
  Export (foundation §10.7). Pipeline/on-disk-format/export sections are UNCHANGED —
  touch only UI paths. Note the per-project `pa:` blob namespacing with a link to
  `docs/projects.md` (P12.07).
- `importing-models.md`: ImportModelDialog → the Import Review dialog (Add ▸ Import
  Model… or viewport drop — foundation §10.4); the import report → notification-center
  rich entry (foundation §5.1); sticky-vs-per-import options split (surface design §3);
  batch Replace…/Remove… → Asset Manager import-batch cards (foundation §10.3). Blender
  recipe / mapping / warnings / export sections UNCHANGED.
- Docs-only. The game contract (GLB post-processing, KTX2, mod layout) is untouched — no
  scope/ sync from this task.

**Verify**: `grep -n "AssetsToolbar\|CustomAssetsModal\|ManageTexturesPanel\|ImportModelDialog" docs/custom-assets.md docs/importing-models.md`
returns zero hits (v1 names purged); named menu paths match FINAL_DESIGN_INDEX.md's tree.

---

#### P12.10 — Docs refresh: `docs/engines.md` UI paths

**Goal**: Repoint the engines doc's "Authoring UX" at Engine mode.

**Files**:
- Modify: `docs/engines.md` ("Authoring UX" :89; scattered EnginePanel/EngineSections
  references).

**Depends on**: P12.01.

**Spec**:
- Rewrite "Authoring UX": Engine mode (`4`) — right navigator (engine scope select
  per-template, define-new menu incl. real Solid motor + legacy SRB preset with its
  explanation retained — data-engine D12/D13; module tree; performance readout with
  per-rocket aggregation — D6; validation section; exhaust chips) and left module editor
  (combustor/nozzle/solid trio/rocket/controller/feed wiring/gimbal/custom propellant —
  data-engine §B). Mention the Data-mode mirror of feed wiring + the cross-link banner
  (D9/D11), the exhaust-placement tool (`X`, status segment, Scale→Move clamp), and the
  SolidThrustCurveCard (D7 — state whether the port landed or the card shows the
  "preview unavailable" hint; check `src/ksa/` for the port before writing).
- Physics/model/XML sections ("The model", "Physics", "Plumbing", "Solid rocket motors",
  "XML I/O", "What's NOT possible") are UNCHANGED unless P7 landed D15 (ReactionPlume
  entries UI) or D16 (5091 warnings) — if so, update the matching bullets (the doc
  currently notes reaction-keyed `<ReactionPlume>` as "not yet authorable" — engines.md
  around the census-known gap P1).
- Docs-only here; the game-contract side of D7/D15/D16/D17 is audited in P12.16.

**Verify**: zero hits for `grep -n "EnginePanel\|EngineToolbar\|EngineSections\|inspectorMode" docs/engines.md`;
every module-editor component named exists under `src/ui/engine/`.

---

#### P12.11 — Docs refresh: `docs/iva-seats.md` + `docs/lights.md` + `docs/colliders.md` UI paths

**Goal**: Repoint the three entity docs' UI paths at the v2 left-sidebar inspectors,
Tools menu, and Settings.

**Files**:
- Modify: `docs/iva-seats.md` ("3D authoring" :128, "Seat view" :196).
- Modify: `docs/lights.md` ("Gizmo editing and the light inspector" :102, "Coverage
  visualization" :143, "Live lighting preview" :218, "Adding lights" :277).
- Modify: `docs/colliders.md` ("3D authoring" :100, "Fitting" :141, "Coverage check"
  :176).

**Depends on**: P12.01.

**Spec** (guts of all three inspectors are unchanged — foundation §16 "Collider
fit/coverage/owner re-homing; seat reorder/aim/sit; light dual-frame editor → Left-sidebar
per-kind inspectors (guts unchanged)"; only paths change):
- `iva-seats.md`: TransformInspector seat section → left-sidebar IVA Seat inspector
  (foundation §7.1); SeatViewBar → status-bar tool segment with ◀ ▶ Exit and the honesty
  tooltip retained (foundation §2.6 tool table); entry points: seat inspector "Sit",
  Tools ▸ Sit in Seat ▸, Outliner row menu; Esc rung 8 (never preventDefault —
  foundation §11.4); marker-size/gaze-cone prefs → Settings → Viewport (foundation §10.7).
- `lights.md`: light inspector → left sidebar (dual-frame editor + falloff curve kept);
  Add ▸ Light ▸ Spot/Point; coverage/exposure/live-preview toggles → View ▸ Light
  Coverage ▸ / Live Light Preview + Settings → Scene numerics (S16); over-cap warning →
  status bar (foundation §5); SubPart-owned light *data* editing → Data mode template
  scope with the now-usable "Select in 3D" (foundation §7.3).
- `colliders.md`: Add ▸ Collider ▸ (shapes + Fit to Selection ▸ — intent-atom mechanism
  unchanged, foundation §3 Add); collider inspector → left sidebar; Coverage Check →
  Tools ▸ Collider Coverage Check with the report as a left-sidebar tool parameter card
  (foundation §7 item 1); fit margin / orient-to-selection prefs → Settings → Viewport
  (UI gap closed — foundation §10.7).
- Docs-only. XML round-trip sections untouched.

**Verify**: zero hits for `grep -n "TransformInspector\|SeatViewBar\|View popover\|ViewButton" docs/iva-seats.md docs/lights.md docs/colliders.md`;
menu paths match FINAL_DESIGN_INDEX.md.

---

#### P12.12 — Docs refresh: `docs/action-chains.md` rebind + chain-window update

**Goal**: Update the chains doc for the ⇧⌘K rebind and the floating-window host.

**Files**:
- Modify: `docs/action-chains.md` ("Session lifecycle and keyboard" :171; the title-line
  "`mod+K` action-chain palette" framing at :13).

**Depends on**: P12.01.

**Spec**:
- Rebind: ⌘K is now the command palette; Begin Action Chain is `⇧⌘K` + Edit menu + a
  palette command (LOCKED; foundation S7, §3 Edit). From a non-Build mode it switches to
  Build first (foundation §2.6).
- Host: the palette is now the `chain` FloatingWindow (drag handle, resizable 300–420px,
  step drag-reorder, discard-confirm on cancel with ≥1 step — foundation §6.2); still
  NON-modal by constitution (live seed-nudge re-flow is load-bearing); phone = 50%
  non-blocking sheet.
- Esc is rung 6 of the documented ladder (foundation §11.4); `⌘↩` apply unchanged
  (`surface:chain` scope).
- Op semantics / caps / one-undo-step sections UNCHANGED — do not touch them.
- Also fix the AGENTS.md "documentation" index line for action-chains (v1 text at
  AGENTS.md:77 says "the `mod+K` action-chain palette") — but leave the full AGENTS.md
  index edit to P12.15; here just flag it in the commit message if P12.15 hasn't run.
- Docs-only.

**Verify**: `grep -n "mod+K\|⌘K" docs/action-chains.md` shows only the rebind note
(⇧⌘K as the chain key, ⌘K described as the palette).

---

#### P12.13 — NEW doc: `docs/ui-shell.md`

**Goal**: Author the missing shell doc — the one place that explains the v2 chrome.

**Files**:
- Create: `docs/ui-shell.md`.

**Depends on**: P12.05 (architecture.md links to it; write them in the same PR).

**Spec**: A flexo-internal (not design-corpus) doc, ~200–300 lines, written from the
SHIPPED code with foundation.md citations. Required sections:
1. **Layout** — the docked skeleton + region rules table (sizes, clamps, collapse,
   persistence — foundation §1/§1.1), the density tokens + `xs` tier (§1.2), the z-index
   ladder (`src/ui/kit/zIndex.ts` — §1.3).
2. **Modes** — the five modes, what a switch changes (the six-point list from §2.3), the
   entry/exit invariants (§2.4) and cross-mode jumps (§2.5), transient tools + the chain
   session exception (§2.6).
3. **Commands & menus** — Command/MenuSpec shapes, dynamic providers, dialog-opening
   commands via dialogStore (§4); the menubar tree lives in code — link
   FINAL_DESIGN_INDEX.md for the design-time reference.
4. **Status bar & notifications** — the segment table (§5), the toast()-facade routing
   table (§5.1), the notification center (§5.2).
5. **Floating windows** — FloatingWindow primitive contract (bounds/z/persistence — §6.1)
   and the two tenants (§6.2).
6. **Hotkeys** — scope model + precedence + the Esc ladder (§11.1/§11.4); the binding
   table is generated into Help from the registry — do not duplicate it here beyond the
   scope explanation and the v1→v2 rebind diff (F, ⌘K).
7. **Phone** — the primitive table + frame sketch (§12).
8. **Shell stores** — the §13 table, condensed, with actual file paths.
Every code path cited must exist in the tree (write from `ls`/`grep`, not from memory).
- Docs-only.

**Verify**: all cited paths exist; doc is linked from `docs/architecture.md` and from the
AGENTS.md index (P12.15).

---

#### P12.14 — NEW doc: `docs/animation-editor.md`

**Goal**: Author the animation-mode doc (the census flagged animation as the least
documented area; the design corpus mandates docs/ updates —
design-animation-mode.md line 1095 "scope/animation.md + docs/ to be updated by
implementation").

**Files**:
- Create: `docs/animation-editor.md`.

**Depends on**: P12.13 (cross-link).

**Spec**: Written from the shipped P11 code, citing design-animation-mode.md. Required
sections:
1. Mental model + vocabulary (clip/joint/keyframe/column/pin/park/rest anchor — animation
   design §1).
2. The mode surfaces: right navigator (Clips / Joints tree / Easing / Solar tracking —
   §6), left focus editor (clip card / joint card with members-pivot-pose-easing /
   keyframe card — §8), timeline dock (dopesheet, transport, ⚓ rest-anchor badge +
   re-anchor action, latch vs spring scrub — §5, foundation §9), Members view (docked
   `SubPartSetGrid`, member painting — §7).
3. Per-channel easing (LOCKED #8): the `JointSegmentEasing` schema (position/rotation/
   scale, absent = linear — §3), authoring UI, "Uniform" rendering rule.
4. Preview honesty: rest-anchor semantics (`restKeyframeId`/`restAnchorTime` — keep the
   existing memory-doc facts), spring-loaded scrub, pose pinning, gizmo write-back
   protection.
5. Export/import: the KSA contract summary with a LINK to `scope/animation.md` (do not
   duplicate the contract — scope/ is the source of truth), per-clip diagnostics
   (`computeClipIssues` blockers/warnings — §11.1), CubicSpline import flagging (§11.3).
6. Undo enrollment table for animation actions (from the animation design §16 matrix —
   discrete vs streaming), and the perf rule (`$animPreviewU` never subscribes wide trees;
   canvas-rendered track area — foundation §9).
7. Constraints: SubParts-only membership (connectors/kittens never joint members — KSA
   limitation, constitution), timeline hotkey scope table (`surface:timeline` — final
   index).
- Docs-only.

**Verify**: paths/symbols cited exist; linked from architecture.md + AGENTS.md index;
no contradiction with `scope/animation.md` (read both side-by-side as the final check).

---

#### P12.15 — `docs/xml-io.md` unchanged-assertion + AGENTS.md documentation index & UI-design section update

**Goal**: Assert the XML I/O contract doc needed no changes (and fix it if the assertion
fails), then bring AGENTS.md's doc index and UI-design guidance up to v2.

**Files**:
- Audit (modify only on assertion failure): `docs/xml-io.md`.
- Modify: `AGENTS.md` ("documentation" section :55–:77; "UI design" section :175).

**Depends on**: P12.05–P12.14 (index the final doc set).

**Spec**:
1. **xml-io assertion**: the refactor is editor chrome — serializer/parser/formatG6/
   transform-omission rules are untouched invariants (foundation §16 constitution checks:
   "coords.ts / formatG6 / KSA XML + GLB contracts untouched"). Verify:
   `git log --oneline -- src/ksa/partXmlSerializer.ts src/ksa/partXmlParser.ts src/ksa/formatG6.ts`
   across the v2 branch range shows only the sanctioned changes (per-channel easing
   types/codec from P11, and D15/D17 fields if P6/P7 shipped them). If ONLY sanctioned
   changes: update `docs/xml-io.md`'s "Editing UI" section (:141) UI paths (Part Data
   dialog → Data mode) and add one line for any D15/D17 field; otherwise STOP and flag —
   an unsanctioned game-contract edit slipped in.
2. **AGENTS.md documentation index**: update stale entry descriptions —
   `docs/projects.md` line (:66 currently says "autosaved to localStorage") → IndexedDB
   wording; `docs/action-chains.md` line (:77, "the `mod+K` action-chain palette") →
   "the action-chain floating window (⇧⌘K)"; `docs/layers.md` line if it names the
   popover. Add index lines + one-line descriptions for `docs/ui-shell.md` and
   `docs/animation-editor.md`.
3. **AGENTS.md "UI design" section** (:175): keep both existing rules (kit primitives,
   GridList over ListBox); add the v2 shell rules implementers must obey from now on:
   - commands, not ad-hoc buttons: user-facing actions register in the command registry
     (menubar/palette/hotkeys render from it — foundation §4);
   - dialogs open via `dialogStore.$openDialog`, mounted once at root (no
     controlled/uncontrolled dual APIs — foundation §10.1);
   - no literal z-indexes (use `src/ui/kit/zIndex.ts` — foundation §1.3);
   - transient feedback goes through the `toast()` facade → status bar/notification
     center; never render a bespoke floating surface (foundation §5.1, §6 policy:
     "Default answer for any surface: dock it");
   - hotkeys register in the scoped registry, never raw window listeners
     (foundation §11.1).
4. Do not touch any other AGENTS.md section (constitution text is owned by the user).

**Verify**: `pnpm test` (fixture/serializer tests unaffected); AGENTS.md links resolve
(`grep -oE 'docs/[a-z0-9-]+\.md' AGENTS.md` — every target exists); xml-io assertion
outcome recorded in the commit message.

---

#### P12.16 — scope/ sync audit (game-contract surface of the whole refactor)

**Goal**: Audit that the ONLY game-contract-touching changes of the refactor are
reflected in `scope/`, and assert no other contract drift shipped.

**Files**:
- Audit (modify only where the owed sync is missing): `scope/animation.md`,
  `scope/engines.md`, `scope/FULL_SCOPE.md`, `scope/gamedata-modules.md`.

**Depends on**: P12.01 (final code state).

**Spec**: AGENTS.md "repository maintenance" makes scope sync NON-NEGOTIABLE and owed
*by the phase that made the change* — this task is the backstop audit. The refactor's
sanctioned game-contract touchpoints, and what to verify for each:
1. **Animation per-channel easing (P11)** — the KSA contract itself is UNCHANGED
   (LINEAR-only samplers, eased segments densified at 30 fps — animation design §3
   restates scope/animation.md as "untouchable"). But `scope/animation.md`'s
   "Easing / curves" bullets describe the flexo-side abstraction and MUST now say:
   per-channel (position/rotation/scale) bézier authoring + per-channel reverse-fit on
   import (same tolerances: pos 4 mm, rot 2.5°; dense fallback kept). And "Known
   gotchas" item 3 (v1 text: CubicSpline clips "would be mis-decoded (silent corruption,
   not an error)") MUST be updated: CUBICSPLINE samplers are now DETECTED and flagged
   ("imported approximately"), feeding the import report + clip diagnostics (animation
   design §11.3). If P11 didn't make these edits, make them now, citing
   `KeyframeAnimationData.cs` `SampleType {Linear, Step, CubicSpline}` as the game-side
   anchor (already cited in the doc).
2. **Solid thrust-curve port (P7, D7 — severable)** — check whether the
   `SolidMotor.TrySampleThrustCurve` port landed (`grep -rn "TrySampleThrustCurve\|thrustCurve" src/ksa`).
   - If YES: `scope/FULL_SCOPE.md` (v1 lines :347-348 list "the solid-motor thrust-curve
     preview (a real port of `SolidMotor.TrySampleThrustCurve` + `GrainGeometryTable`,
     filed as a follow-up)" as 📋 OPEN) must mark that gap CLOSED, and
     `scope/engines.md` gains the ported-math row (game-side anchor: `SolidMotor.cs`
     `TrySampleThrustCurve`, `GrainGeometryTable`) per the AGENTS.md ported-math rule.
   - If NO (card renders the "preview unavailable" hint — the sanctioned severable
     state): verify the gap is still listed OPEN and `docs/engines.md` (P12.10) says so.
3. **D15 ReactionPlume entries / D16 5091 warnings / D17 EVA Door `SeatId` (P6/P7,
   severable)** — data-engine design line ~728: "scope/ + docs/ updated by implementation
   for D15/D16/D17". For each, grep the code
   (`grep -rn "ReactionPlume" src/ksa src/ui`, `grep -rn "SeatId" src/ksa`) to establish
   whether it shipped; if shipped, verify `scope/engines.md` (D15/D16) and the EVA-door
   entry in the gamedata scope doc (D17) were updated in those phases — the census/scope
   docs called reaction-keyed plumes "known gap P1 in scope/engines.md" and EVA `SeatId`
   a "5117 drift gap", so shipping them closes documented gaps that must be re-worded.
   If not shipped: verify the gaps remain accurately listed as OPEN.
4. **Everything else is editor-only — assert it.** Run
   `git diff <v2-merge-base> --stat -- src/ksa src/three/coords.ts src/ktx scripts/sync-test-fixtures.ts`
   (determine the merge-base from the v2 branch history). Every changed file must trace
   to items 1–3, to P11's rig/codec work (animationRig/easing/easingFit/exportAnimationGlb
   — flexo-side of item 1), or to pure re-hosting with no XML/GLB/naming semantics change.
   Anything else = unsanctioned contract drift → STOP and flag (do not "fix" silently).
5. Record the audit result (per-item shipped/not-shipped + scope rows touched) in the
   commit message.

**Verify**: `scope/animation.md` easing + gotcha text matches shipped code;
`scope/FULL_SCOPE.md` gap list matches reality for the thrust-curve/D15/D17 items;
the item-4 diff audit is clean; `pnpm test` still green (fixture drift tests).

---

#### P12.17 — Final RULE ZERO parity audit (execute the checklist below, census file by census file)

**Goal**: Walk all 12 census feature inventories against the shipped UI and record a
pass/fail per item — the release cannot ship with any FAIL.

**Files**: none created in the repo (record results in the PR description / commit
message). This is an execution task.

**Depends on**: P12.01–P12.03 (audit the final UI).

**Spec**: For each census file: open it, walk its **§1 Feature inventory line by line**,
and for each line find the v2 home using the area's parity table (the authoritative maps:
foundation §16 + system-services §10 for shell; build design §15; animation design §17;
data-engine design §6.1–6.3; surface design §9; projects design §14). Then execute the
spot-checks below IN THE RUNNING APP (dev server, desktop width AND a <640px phone
viewport for at least the shell/build items — phone parity is LOCKED #6). A behavior
present in v1 but absent in v2 with no logged behavior-change note
(FINAL_DESIGN_INDEX.md "Deliberate behavior-not-capability changes") is a FAIL.

Checklist (execute every box; ✅/❌ + note per box):

**1. shell-layout.md** (home map: foundation §16 + §6.3)
- [ ] Every §1.1 toolbar control reachable via menubar/status bar (walk the census
      list against the FINAL_DESIGN_INDEX menubar tree)
- [ ] Phone: ☰ MenuSheet reaches ALL eight menus (drill-down); ModeTabBar switches modes;
      re-tap opens the Panel sheet
- [ ] Sidebars resize (clamps: left 220–480, right 260–640) + collapse (⌥[ / ⌥]) +
      reopen tabs; widths persist across reload
- [ ] Orbit center == visible center with both sidebars open (the P1 fix — drag-orbit a
      part, it pivots about the visual center of the canvas cell)
- [ ] Tool bar + Chain windows drag, clamp to the workspace band, persist position,
      raise on pointer-down; Window ▸ Reset Window Layout restores defaults
- [ ] Status bar: mode chip · active-layer chip · tool segment · selection readout ·
      message channel · progress · modifier hints · rotate/nudge chips · snap chip ·
      FPS · bell — all render per foundation §5
- [ ] Seat view: enter from seat inspector, ◀ ▶ wrap in document order, honesty tooltip,
      Esc exits (rung 8), survives mode switch
- [ ] Notification center: warning/danger/rich entries persist, unread badge, Clear all;
      import report renders as a rich entry
- [ ] Boot purge notice arrives as a warning notification; build-mismatch as sticky
      notification with [Reload] [Reset everything…]

**2. selection-transform.md** (home map: build design §15)
- [ ] Click/⇧-⌘-click/empty-click viewport selection + locked/hidden-layer guards +
      nozzle-handle priority all behave per census §1.1
- [ ] ⇧-drag marquee adds, ⌥⇧-drag subtracts, `B` one-shot replaces; hidden/locked
      respected
- [ ] Gizmo: one undo push per drag; T/⇧T cycles tools; snap toggle + ⌃ temporary invert
- [ ] ⌥-drag duplicates then drags the copies (one 'duplicate' undo step)
- [ ] W/S A/D Q/E rotate, R cycles axes, [ / ] steps, arrows nudge — viewport-scoped
      (typing in a field never rotates)
- [ ] Multi-select panel: bulk Move/Rotate/Scale by + smart/in-place; owner-frame
      entities lifted to part space (foundation §7.1 fix)
- [ ] Undo/redo buttons + Edit ▸ History ▸ jump list (multi-step jump works both
      directions); undo labels flash in the status bar
- [ ] ⌘C/⌘X/⌘V/⌘D/⌫ work in the viewport AND after range-selecting Outliner rows
      (list mirror bindings); lights are copyable (census gap closed)
- [ ] Delete confirm policy: ≤5 no-confirm + status [Undo]; >5 confirm with counts

**3. catalog-placement-layers.md** (home map: build design §15)
- [ ] All 14 Add-menu entries + submenus land per census §1.1 (entity items auto-switch
      to Build, select + reveal; collider Fit intent works)
- [ ] SubPart browser: fuzzy search over id + tags, cap indicator, single-click preview /
      double-click-Enter-Add commits (logged gesture change), add-and-stay
- [ ] Part browser: destination-layer select, animations ride along, revealLayer after
      import
- [ ] Outliner: layer rows (rename/eye/opacity/lock/listed/active dot/count), drag
      reorder, delete w/ move-vs-delete, entity rows grouped by kind, ⇧-range grow-only,
      row ⋮ menus incl. SubPart Data → and Edit Surface → jumps, drag-entity-onto-layer
- [ ] Active layer visible in the status bar chip (Build/Animation), settable from it

**4. viewport-scene-view.md** (home map: build design §15 + foundation §16 View/Measure rows)
- [ ] Camera snaps (6) orbit the selection centroid when a selection exists; F frames
      selection w/ frame-all fallback; Reset Camera command exists; camera persists
      per-project
- [ ] View menu: grids (3 + settings deep-link), Hide Interior, environment presets (9),
      sky toggle, Scene Lighting deep-link, Light Coverage radio, Live Light Preview +
      status-bar cap warning, Measurement Overlays, Units, FPS Counter (continuous-loop
      flip preserved)
- [ ] Measure tool (M): two-click flow guided by the status segment, Esc cancels; ref
      lines + containers from Tools menu; Aids section lists them; aid editor takes the
      left focus slot; warn-precision toggle present
- [ ] Colliders: add/fit/coverage-check (dots + left report card), owner re-homing
- [ ] Seats: reorder, aim presets, aim-at-selection, add-kitten-at-seat, sit
- [ ] Lights: dual-frame editor + falloff curve; markers; template-shared edit semantics
- [ ] Kittens: add (3 kinds), Make Kitten Mesh flow intact

**5. animation.md** (home map: animation design §17)
- [ ] Mode 2: clips list (create/rename/delete/draft chips + blocker tooltips), joints
      tree (reparent drag, cycle-guarded), member attach/detach + Choose members… docked
      view + member painting
- [ ] Pose editing: numeric pos/rot/**scale** (scale gap closed), pose gizmo w/
      precedence, pivot set-to-selection/pos-only/move-pivot, pivot marker at
      restAnchorTime
- [ ] Timeline: scrub/latch spring behavior, K insert, retime drag + ⌃ snap, ⚓ badge +
      re-anchor, per-segment easing indicators, transport (Space, , . keys, loop, speed)
- [ ] Per-channel easing editor (position/rotation/scale; Uniform display; apply-to-all
      joints)
- [ ] KSA import: clips ride along on Part import; CubicSpline flagged; import report
      animations block
- [ ] Export: draft clips skipped w/ per-clip checklist; GLB naming/rig contract
      untouched (spot-check an exported Part in the game if feasible — else diff the GLB
      writer tests)

**6. engines.md** (home map: data-engine design §6.2)
- [ ] Mode 4: per-template engine scopes + part-level entry; define-new (Liquid / RCS /
      Solid motor / SRB preset w/ explanation); module tree focuses left editor
- [ ] Combustor editor: reaction picker (catalog ∪ custom, default-ratio reset), mixture
      bounds, pressure bar, efficiencies, min throttle/pulse, plumbing class, FeedsFrom
- [ ] Nozzle editor: exit ⌀, area ratio, direction + length warning + Normalize, FX
      override pair, plume/trail selects
- [ ] Solid motor trio + grain segments; controllers; gimbals; feed wiring + auto-wire
      (also mirrored in Data mode); custom propellants + LUT editor
- [ ] Performance readout (per-rocket select + first-pair fallback); validation section +
      status chip + click-through; exhaust placement (X toggle, amber/cyan handles,
      Scale→Move clamp, dispose-on-exit)

**7. part-data-gamedata.md** (home map: data-engine design §6.1)
- [ ] Mode 3: Part scope sections Identity (incl. editor tags, extra diameters) / Mass /
      Tanks (incl. roleAffinity + locationAsmb now exposed — D3) / Power (batteries,
      generators, solar w/ degree display, consumer) / Coupling (decoupler, docking port,
      EVA door + SeatId if D17 shipped) / Wiring / Advanced / Passthrough viewer
      (read-only RawXmlNode tree)
- [ ] Template scope: tanks / lights w/ live Select-in-3D / solar / thrust chamber /
      passthrough
- [ ] Scope chips ("Template — shared by N placements" / "Instance-scoped"); navigator
      capable-vs-disabled rows; validation strip + click-through
- [ ] SubPart Data → jump from Build lands scoped to the right template

**8. custom-assets.md** (home map: surface design §9)
- [ ] Mode 5: mesh picker (0-instance templates visible), surface editor (primitive
      dims, material assign/edit/new, faces → left face card + viewport highlight, glow
      modes + ramp + paint dialog + washout warning + Add Matching Light, visor modes +
      simulate-glass, imported provenance + render-as-glass + replace/remove)
- [ ] Asset Manager ⇧⌘A: four categories, thumbnails, where-used chips, rename /
      re-channel / replace / delete with bytes-unrecoverable warning verbatim
- [ ] Upload texture (drop + paste), create material, create mesh, import model 3-state
      flow + sticky-vs-per-import split + replace mode; report → notification
- [ ] Kitten part-ify + texture export mode in Settings → Import & Export

**9. project-management.md** (home map: projects design §14)
- [ ] Project Manager ⌘O: cards w/ counts/timestamps/size, open/rename (auto-suffix —
      silent-overwrite bug fixed)/describe/duplicate/delete (inline confirm)/export
      archive/share; current pinned; sort + fuzzy search
- [ ] Autosave loud-failure notification; ⌘S flash; boot restore; New Project
- [ ] Archive export/import round-trip WITH binary assets (create texture → export
      archive → import as new → texture present); share link asset-less flow + archive
      offer
- [ ] Import Project merge = additive, ONE undo step, ids remapped, layers mirrored

**10. export-integration.md** (home map: projects design §14 export rows)
- [ ] ⌘E dialog: XML/Mod toggle, pre-flight (non-blocking, "Export anyway"), lazy
      Assets tab build, grant row (4 states), Download zip, non-overwrite writes +
      mod.toml accumulation, settings chips deep-linking Settings
- [ ] File ▸ Mods Folder ▸ status/choose/re-grant/forget
- [ ] Wiki partpreview app untouched: `pnpm build` builds it; `?debug=dockingport`
      calibration still reachable

**11. chains-misc.md** (home map: build design §15 chain rows + foundation §16)
- [ ] ⇧⌘K chain window: 6 ops, ghosts + caps, live re-flow while nudging seeds, ⌘↩
      apply = one undo step, chainDefaults persist, discard-confirm ≥1 step, empty
      closes silently, locked-layer refusal toast, mode-switch prompt
- [ ] Settings dialog tabs match §10.7 inventory (incl. relocated connector size, seat
      marker, selection highlight w/ new ColorField, kitten texture export)
- [ ] Scale Everything (placements + keyframes, one undo step)
- [ ] About: first-run auto-open, share-link suppression, legal attribution text
      VERBATIM vs v1 (diff the strings)
- [ ] Reset Everything: single command, confirm + FS-grant switch on desktop AND phone,
      `flexo-fs` preserved by default
- [ ] History jump list; build-mismatch notification actions work

**12. ui-kit-hotkeys.md** (home map: system-services §10)
- [ ] Every binding in FINAL_DESIGN_INDEX's consolidated table fires in its scope;
      precedence surface > tool > mode > viewport > global; typing guard (focus a text
      field, press W — nothing rotates); no bare-letter fires behind an open dialog
- [ ] Esc ladder order: dirty numeric revert → popover/dialog-view → palette → gizmo
      drag → tool → chain confirm → anim unwind → seat view → nothing; Esc never clears
      selection
- [ ] Help dialog `?`: generated from the registry, includes chain/timeline/rename
      scopes + static numeric-field and pointer-modifier tables; menu chips match
      actual bindings (spot-check 5)
- [ ] ⌘K palette: fuzzy over all commands + dynamic providers (layers, seats, projects,
      meshes); disabled items grayed w/ reason; Enter runs
- [ ] numberDraft fields everywhere: type `.06` and `-` mid-edit, Esc reverts dirty,
      arrows step (⇧×10 ⌥×0.1) — sample one field per mode

Recording: paste the completed checklist (with ✅/❌ and notes) into the PR description.
ANY ❌ → file the fix task against the owning phase's area and fix before P12.20.

**Verify**: checklist fully executed and recorded; zero FAILs outstanding.

---

#### P12.18 — Playwright smoke script (project-local, dev base `/flexo/`)

**Goal**: A repeatable end-to-end smoke: boot → place SubPart → undo → mode cycle 1–5 →
timeline opens → export dialog opens → project manager opens.

**Files**:
- Create: `scripts/smoke-v2.ts` (NEW standalone script — per repo convention this is
  vanilla Node 24 type-stripped TS: erasable syntax only, `.ts`-extension imports, NO
  Bun, no transpiler).
- Modify: `package.json` — add `"smoke": "node scripts/smoke-v2.ts"`.

**Depends on**: P12.17 (UI is final).

**Spec**:
- Use the already-installed `playwright` library (devDependency `1.62.1` — do NOT add
  `@playwright/test`; this is a plain script, matching the repo's project-local-Playwright
  convention). First run may need `pnpm exec playwright install chromium`.
- The script must: spawn the dev server (`pnpm dev`) as a child process, poll
  `http://localhost:5173/flexo/` until it responds (the base path is `/flexo/` —
  vite.config.ts:11 `base: '/flexo/'`), run the checks, kill the server, exit 0/1 with a
  per-step pass/fail log. Skeleton:

```ts
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const BASE = 'http://localhost:5173/flexo/';
const server = spawn('pnpm', ['dev'], { stdio: 'ignore', detached: true });
// poll BASE with fetch until 200 (timeout 60s), then:
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// Suppress the About first-run auto-open (persisted flexo:aboutSeen — aboutStore):
await page.addInitScript(() => localStorage.setItem('flexo:aboutSeen', 'true'));
await page.goto(BASE);
```

  Steps (each an assertion; prefer role/name selectors from react-aria semantics —
  read the shipped components for exact accessible names before writing selectors):
  1. **Boot**: canvas element visible; menubar shows the eight menus (`File`…`Help`);
     status bar shows the Build mode chip.
  2. **Place SubPart**: open Add ▸ SubPart…, wait for the browser dialog, focus its
     search, pick the first result row, commit (Enter or the Add button per foundation
     §10.10), close; assert the Outliner shows 1 entity row (or the status message
     flashed "SubPart Added").
  3. **Undo**: `page.keyboard.press('ControlOrMeta+KeyZ')`; assert the entity row is
     gone.
  4. **Mode cycle**: press `1`–`5` in sequence; after each, assert the status-bar mode
     chip text (Build / Animation / Data / Engine / Surface). Press keys with the canvas
     focused (click the canvas first — viewport focus-stealing is load-bearing).
  5. **Timeline**: in Animation mode (`2`), assert the timeline dock element is present
     (transport row visible).
  6. **Export dialog**: `ControlOrMeta+KeyE`; assert a dialog titled per the shipped
     Export header ("Export to KSA…" — foundation §3 File) is visible; `Escape` closes.
  7. **Project manager**: `ControlOrMeta+KeyO`; assert the Projects dialog; `Escape`.
- Keep the script headless by default; honor `SMOKE_HEADFUL=1` for debugging.
- Do NOT screenshot-assert; DOM/text assertions only (stable under rendering noise).
- Undo enrollment/numeric rules: N/A (test script).

**Verify**:
- `pnpm smoke` exits 0 locally (run it BARE, no pipes).
- Sabotage check: temporarily rename a menu label locally, `pnpm smoke` fails, revert.
- `pnpm lint` + `pnpm fmt:check` pass on the new script (oxlint/oxfmt cover scripts/).

---

#### P12.19 — About dialog v2 version notes ("What's new")

**Goal**: Ship user-facing v2 release notes inside the About dialog, preserving the
legally load-bearing text verbatim.

**Files**:
- Modify: the shipped About dialog component (v1: `src/ui/AboutDialog.tsx`; now the
  dialogStore-mounted `about` dialog — system-services §5.2).

**Depends on**: P12.17 (notes must describe what actually shipped).

**Spec**:
- design-system-services §5.2 keeps About "as-is" (blurb, MIT, RocketWerkz/Dean Hall
  attribution — "legally load-bearing — text retained verbatim", first-run auto-open +
  share-link suppression unchanged). This task is a sanctioned plan-level ADDITION on
  top: insert one new `SectionTitle` section "What's new in flexo v2" ABOVE the license/
  attribution sections and BELOW the "What is Flexo?" blurb, without editing a character
  of the retained text.
- Content (short bullets, `text-sm text-fg-muted` like the surrounding sections):
  - Five task modes — Build / Animation / Data / Engine / Surface (keys `1`–`5`).
  - Docked shell: menubar, resizable sidebars, status bar (toasts/HUDs absorbed), bell
    notification center, bottom Animation timeline.
  - ⌘K command palette; **rebinds:** Action Chain is now `⇧⌘K`; `F` now frames the
    selection (rotate step moved to `[` / `]`) — mirror the Help dialog's rebind-diff
    wording (FINAL_DESIGN_INDEX registry invariants paragraph).
  - Projects: Project Manager (⌘O), `.flexo.tar.gz` archives that carry custom-asset
    binaries, per-project thumbnails. **v1 saved projects are not carried over**
    (clean-slate policy — state it plainly).
  - Full phone support (bottom mode tabs + sheets).
  - Close with "Press ? for all shortcuts".
- Because About auto-opens on true first run (and v2's storage reset makes every v1 user
  a "first-run" user again), this section IS the release-notes surface — no separate
  in-app changelog. Optionally append the same bullets to the repo `README.md` under a
  "v2" heading (repo-facing notes; keep it short).
- No document mutation → no undo concerns; no numeric inputs.

**Verify**:
- Manual: clear site data, boot → About auto-opens with the new section; legal text
  byte-identical to v1 (diff the JSX string literals against git history of
  `src/ui/AboutDialog.tsx`).
- `pnpm typecheck` `pnpm lint` `pnpm test` pass.

---

#### P12.20 — Release gate: full suite + build + smoke

**Goal**: Final green-across-the-board gate for the v2 release.

**Files**: none (execution task; fix-forward anything it catches, within this phase's
scope only — regressions belong to their owning area otherwise).

**Depends on**: ALL P12 tasks.

**Spec**: Run, in order, each command BARE (repo convention — no pipes, no `2>&1`):
1. `pnpm fmt`
2. `pnpm lint`
3. `pnpm fmt:check`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm build` (main app AND `apps/partpreview` — the build script covers both)
7. `pnpm smoke`
8. Confirm P12.17's checklist is recorded with zero FAILs and P12.16's audit note is in
   its commit.
9. Fresh-profile manual pass (new browser profile): boot → About (What's new) → place a
   SubPart → save happens (autosave) → reload → restored → export XML preview opens →
   phone-width devtools pass: MenuSheet, mode tabs, Panel/Inspector sheets open.

Any failure: fix if it is a P12-scope issue (docs, sweep, script); otherwise STOP and
route to the owning phase's area with a written defect note. The release ships only when
steps 1–9 are all green.

**Verify**: all nine steps green; this task's completion note lists the commit hash the
gate ran against.
