# flexo v2 plan — coverage & seam audit

Auditor pass over the ten phase files against the finalized design corpus
(foundation.md §16 ledger, six area parity/death tables, FINAL_DESIGN_INDEX hotkey table
+ menubar tree, DECISIONS.md). Files audited: phase-00-01, phase-02-03, phase-04,
phase-05a, phase-05b, phase-06-07, phase-08, phase-09-10, phase-11, phase-12
(plus preamble.md, read-only). Authorship context: batch 1 = 00-01 / 05b / 08 / 09-10 / 12;
batch 2 = 02-03 / 04 / 05a / 06-07 / 11. Most defects found are batch-1↔batch-2 seam
artifacts, exactly where the task predicted.

**Verdict: `minor-fixes`** — every design area, LOCKED decision, menubar item, death-list
surface, and phone variant has at least one owning task, and the flagged inter-phase seams
(P5A↔P9.07, P8↔P9.06 `pa:`, P2↔P4 interim mode, P4↔P11 timeline mount) all knit. What
needs fixing before implementation: **one ownership hole** (Settings §10.7
General/Viewport/Scene tab fields), **two duplicate implementations** (camera commands;
status chips/tool deletions re-scheduled by batch-1 5B after batch-2 P2/P3 already did
them), **one orphaned cross-phase hand-off** (surface-D10 export info row), and a handful
of command-id / file-path / stale-reference drifts. All are bounded plan edits, not
redesigns.

---

## 1. Coverage matrix (design element → implementing task)

### 1.1 foundation.md §16 RULE ZERO ledger (all ~40 rows walked)

Every ledger row has a named owning task. Non-obvious mappings:

| Ledger row | Task(s) |
|---|---|
| Project button cluster → chip/File/Manager | P2.06, P2.11, P9.09–P9.11 |
| Autosave/boot/purge notice/⌘S flash | P9.04, P9.05, P9.18, P2.09+P2.12 (`noop.autosaveFlash`) |
| Share link / archive / import project | P2.06 (interim), P9.12–P9.16 |
| Add menu all entries + collider fit intent | P2.09 (complete tree), P5B.22 (choreography/S27) |
| `.glb` drop unchanged | P1.02 (ViewportDropZone kept in canvas cell) |
| Part Data → Data mode / SubPart Data → template scope | P6.07–P6.18 (P6.18 deletes the modals) |
| Export dialog → Export to KSA v2 | P10.01–P10.07 |
| View popover → View menu + Settings | P2.07, P2.09, P5B.21 (but see F1) |
| Measure popover → Tools/View/Aids/aid editors | P2.09 (interim providers), P5A.16, P5B.16, P5B.25 |
| Undo/Redo/History | P2.09 (`edit.undo/redo`, `history` provider → `jumpToHistory`), P2.11 (↶↷ cluster, HistoryButton deleted) |
| Settings burger → menus | P2.05, P2.07, P2.11 (S12) |
| Layers popover → Outliner rows + layer chip | P5A.09–P5A.17, P3.04 |
| Assets list → Outliner entity rows | P5A.12–P5A.15, P5A.17 |
| Custom Assets modal → Asset Manager | P8.14–P8.19, P8.24 |
| ManageTexturesPanel/Material/GlowPaint/visor/simulate-glass | P8.05–P8.12, P8.24 (but see F1 for the Scene-tab mirror) |
| Import model + report | P8.20, P8.21 (+P3.14 interim rich entry) |
| Catalog browsers | P2.08 (dialog ids), P5B.23/24 (redesign) |
| Animation panel/MeshPicker/scrubbers/Esc unwind | P11B.03, P11B.09, P11C.11 |
| Engine mode + ConsumerFeedWiring | P7.01–P7.21 (P7.16 = LOCKED absorb) |
| Chain palette | P2.13 (discard-confirm), P5B.28 (FloatingWindow, ⇧⌘K) |
| Seat view | P3.09 (segment + SeatViewBar death), P5B.26 (tool slot) — see F4 |
| TransformHud | P3.08 — see F4 (P5B.09 re-does it) |
| MeasurementInfo / WorkspaceLoadProgress / toasts / FPS | P3.07 / P3.10 / P3.06 (+P12.03 hedged re-check) / P3.11 |
| Kitten flows | P2.09+P5B.22 (add), P5B.13 (at-seat), P8.22 (part-ify), P8.23/P9.17 (texture mode) |
| Collider fit/coverage/seat/light inspectors | P5B.12–P5B.14 (but Settings knobs — see F1) |
| Scale Everything / Editor tags / Passthrough viewer | P2.07 / P6.10 / P6.16 |
| Build-mismatch → notification; Reset ONE command | P9.18; P2.07+P9.17 |
| Hotkeys registry + Help + hidden bindings | P4.05–P4.13 |
| Mobile shell | P1.04–P1.06, P2.15, P3.15, P4.14 + per-area phone tasks |
| Wiki app / `?debug=dockingport` untouched | P10.08 (assertion task) |
| Numeric-field model unchanged | restated per-task corpus-wide |

### 1.2 Area parity / death tables

- **design-build-mode §15**: all rows land in P5A/P5B (+P2/P3/P4 for shell-owned rows).
  Death rows: EditorToolbar→P2.11, SelectionToolbar/MultiSelectToolbar/FloatingInspector/
  TransformInspector→P5B.17, FloatingEditorPanel+editors→P5B.16, LayersButton/LayersPanel/
  AssetsList/AssetsToolbar→P5A.17, ViewButton/AddButton/MeasureButton/HistoryButton/
  SettingsButton/ProjectButton→P2.11 (see F4: 5B re-schedules three of these).
- **design-animation-mode §17 + D1–D3**: all rows land in P11A–P11E; deletions
  (AnimationPanel/AnimToolbar/MeshPickerModal→P11C.11; PreviewScrubber/
  FloatingPreviewToolbar→P11B.03; window Esc listener→P11B.09) match phase-12's
  pre-written death rows 32–34 exactly. D1 (docked Members view) P11C.02; D2
  (member-paint/pivot-pick tools) P4.01 union + P11C.03/P11D.04; D3 logged in P11C.05.
- **design-data-engine-modes §6.1–6.3, D1–D17, §C1**: D1→P6.09, D2→P6.16, D3→P6.03/P6.10,
  D4→P6.02/P6.08+P7.08, D5→P7.06/P7.07/P7.11, D6→P7.09, D7→P7.04 (severable, honored),
  D8→P7.17, D9→P7.16+P6.14, D10→P6.14 (summary card; editor stays Build P5B.11),
  D11→P6.18+P7.18/P7.19, D12/D13→P7.06, D14→P6.12/P6.15/P7.13, D15→P7.13, D16→P7.03,
  D17→P6.04. §C1 deaths: PartDataButton/ManageTanksModal→P6.18;
  EnginePanel/EngineToolbar/EngineSections/EngineIssuesPanel→P7.19.
- **design-surface-assets §9, §6, D1–D12**: D1→P8.16, D2→P8.12, D3→P8.19, D4→P8.23,
  D5→P8.26+P9.06, D6→P8.05/P8.15, D7→P8.11, D8→P8.17, D9→P8.07, D10→P8.02 (+export row —
  see F3), D11→P8.20, D12→P8.04. §6 deaths: CustomAssetsModal/ManageTexturesPanel→P8.24,
  ImportReportCard→P8.21.
- **design-projects-export §14, D1–D15**: D1/D2→P9.02–P9.04, D3→P9.05, D4→P9.04,
  D5→P9.03, D6→P9.04/P9.18, D7→P9.06, D8→P9.01/P9.12, D9→P9.13/P9.15, D10→P9.16,
  D11→P10.02–P10.04, D12→P10.05, D13→P10.08, D14→P9.18, D15→P9.08.
- **design-system-services §10**: all rows land in P0/P2/P3/P4 (kit: P0.01–P0.14;
  status/notifications: P3.01–P3.16; palette: P2.14; hotkeys: P4.05–P4.13; windows:
  P0.10+P5B.08/P5B.28; phone: P2.15/P3.15/P4.14).

### 1.3 FINAL_DESIGN_INDEX hotkey table

Every row has an owner: global chords P2.12+P4.08; mode digits P4.08(4); Esc ladder
P4.07; viewport spatial/edit/select keys P4.06/P4.08; `F` P4.09; `B` P5A.08; `M`
P4.08→P5B.25; `T/⇧T` P4.08; `[`/`]` P4.08; `mode:animation` + `surface:timeline` P11B.09;
`mode:engine X` P4.08; `tool:exhaust ,/.` P7.10 (ledgered in P4.10); `surface:chain`
P4.07+P5B.28; `surface:outliner` ⌘F+mirrors P5A.13; data-navigator mirrors P6.17;
engine-tree mirrors P7.07; members mirrors P11C; `surface:glow-paint` ⌘Z P8.12/P8.13;
static Help sections P4.11. The two nits: palette-surface rows and outliner-rename
Enter/Esc are handled component-locally, not registered (F9/F10).

### 1.4 Menubar tree — every item wired

File: all 8 items+submenu → P2.09/P2.06/P2.07 (interim) → P9.11/P9.14–16 (final), Mods
Folder→P2.09→P10.05. Edit: all → P2.09/P2.13 → P5B.19/P5B.28. Add: all 14 → P2.09 →
P5B.22. Select: all → P2.09/P2.04 → P5A.06 (see F7 id drift). View: all → P2.09/P2.07 →
P5B.21 (camera P4.09); Display Filters→P5B.21; Motion Trails→P11B.02(10)/P11D.05/P11E.04.
Tools: all → P2.09 → P5B.25/P5B.26; "(reserved: Calculators…)" correctly not implemented
(reserved row — no task needed). Window: sidebars P2.09/P4.08; Timeline→P11B.01; Tool
Bar→P5B.08; Reset Window Layout→P0.09/P2.09; Asset Manager→P2.09→P8.14; Notifications→
P3.05. Help: palette P2.14; shortcuts P2.05/P4.11; About P2.05; GitHub P2.09
(`help.github`). **No menubar item is orphaned.**

### 1.5 DECISIONS.md — all 8 LOCKED + standing constraints

#1 five modes→P4; #2 docked→P0/P1; #3 projects clean-slate+archive→P9; #4 compile-green→
every phase declares entry/exit + per-task boundaries; #5 timeline→P11B; #6 phone
parity→P1.04–06, P2.15, P3.15, P4.14, P5B.29, P6.19, P7.20, P8.25, P9 (§2.4 phone +
P9 verify item 6), P10.06, P11E.05–07; #7 palette/marquee/⌥-drag/⌘D-offset/snap-UI/
camera→P2.14, P5A.07–08, P5B.18, P5B.02+19, P5B.01+07–09, P4.09; #8 pose gizmo/working
pivots/trajectories/per-channel easing→P11D.01–02, P11D.04, P11D.05, P11A.01–07.
Standing constraints (layering, numberDraft, undo enrollment, no-migration, toast
imperative, chain non-modal, dark-only, on-demand loop) are restated as binding blocks in
every phase file and per-task.

---

## 2. Findings

Severity: **[A]** must fix before implementation · **[B]** should fix (implementer would
stall or produce drift) · **[C]** cosmetic/document-only.

### F1 [A] Settings §10.7 General/Viewport/Scene tabs — ownership hole; five designed fields have NO task
foundation §10.7 specifies five tabs. P2.07 extends the interim **SettingsModal** with
*sections* (grid spacing, Scene numerics, danger zone) and explicitly leaves tab
structure to P9 ("accept-and-ignore `params.tab` — P9 builds the real tabs"). P9.17
builds ONLY Import & Export + Advanced and explicitly refuses the rest ("Tabs
General/Viewport/Scene stay owned by their areas … do not add fields to them here").
No area task claims them. Concretely unowned:
- the **tab structure** for General/Viewport/Scene (P9.17 only "asserts" the Scene
  look-dev anchoring with a conditional fallback);
- **General**: confirm-policy threshold (zero mentions corpus-wide); selection-highlight
  rows rebuilt on kit `ColorField` (P0.14 builds ColorField; no task swaps the Settings
  rows — system-services §7.7 row unimplemented);
- **Viewport**: light marker size (P5B.14 caption points at "Settings → Viewport" but no
  task adds the field); collider fit margin + orient-to-selection (P5B.12 explicitly says
  "do not add fields here … Settings → Viewport per foundation §10.7" — nobody does);
- **Scene**: `$simulateGlass` mirror row (P8.10: "mirrored in Settings → Scene (P9's
  Settings IA keeps it — no work here)"; P9.17 does not add it).
**Fix**: add one task (suggest P9.17b, or widen P9.17) that converts the P2.07 sections
into the five §10.7 tabs and adds the five missing fields + full deep-link tab params +
the Scene look-dev anchoring as a definite (not conditional) deliverable.

### F2 [A] Camera commands implemented twice with incompatible shapes (P4.09 vs P5B.04/P5B.20)
P4.09 (batch 2) fully implements Frame Selection / Reset / centroid snaps: `$cameraFrame`
nonce atom, pure `src/three/cameraFraming.ts`, `Viewport.frameBounds(center, size)`,
`snapCamera(dir, target?)`, commands + `F` binding + View-menu re-point + tests. P5B.04
item 2 (batch 1) creates a SECOND intent atom `$frameRequest {nonce, target:'selection'|'all'}`
and P5B.20 re-implements `Viewport.frameBounds(box)` + the snap target param + command
registration. P5A's entry state already assumes P4 owns camera ("camera commands (P4)").
A literal implementer executes both and ships two frame paths.
**Fix**: rewrite P5B.04 item 2–3 and P5B.20 as *verification-only* ("assert P4.09 landed;
no new atoms/functions"), or delete them and move P5B.20's verify list into P5B.30.

### F3 [A] Surface-D10 export pre-flight info row is an orphaned hand-off (P8 → P10 → nobody)
P8.02 builds `$unplacedCustomMeshes` "feeds picker/manager chips + **export pre-flight
info row (D10)**"; P8.27 explicitly defers the export row to P10 ("seam: deferred per
plan"); but P10.01's `exportIssues.ts` spec folds in only the basic trio + four
validators — no unplaced-mesh `info` row, and its `ExportIssue.area` union
(`part|engine|collider|seat|light`) has no member for it. P11E.01 (draft clips) proves
the extension pattern but doesn't cover meshes.
**Fix**: extend P10.01 (add area `'asset'`, an `info` issue "N custom meshes have no
placements and will not ship" from `$unplacedCustomMeshes`/the selector, jumpTarget
`{mode:'surface'}`) + a test case.

### F4 [B] Batch-1 P5B re-schedules deletions/absorptions batch-2 P2/P3 already performed
P2.11 deletes `AddButton`/`ViewButton`/`MeasureButton` (+Toolbar/HistoryButton/
SettingsButton/ProjectButton); P3.08 creates `src/ui/status/TransformChips.tsx` and
deletes TransformHud; P3.09 deletes SeatViewBar and builds the seat tool segment. P5B
(batch 1) lists all of these as *alive* entry-state demolition targets and re-does them:
P5B.09 creates `RotateNudgeChips.tsx` + deletes TransformHud again; P5B.21/22/25 delete
ViewButton/AddButton/MeasureButton again; P5B.26 deletes SeatViewBar + rebuilds its
segment. P5B's blanket hedge ("if an assumption doesn't hold, do the minimal
equivalent") prevents disaster, but the conflicting file names (TransformChips vs
RotateNudgeChips) and re-specified menus (P5B.21/22 re-wire items P2.09 already wired)
invite duplicate components.
**Fix**: annotate P5B.09/21/22/25/26 with their real residual scope — P5B.09: add
`SnapChip` + update the chord-table tooltips for the `[`/`]` rebind into the existing
`TransformChips` (do NOT create RotateNudgeChips); P5B.21: only Display Filters +
unstub/verify camera items; P5B.22: only the S27 choreography + `customMeshInstances`
provider verify; P5B.25/26: only the `$activeTool` tool-defs, measure two-step status
text, and arming re-route (segments/menus/deletes already exist).

### F5 [B] P5A.05's consumer census is stale against P2/P3 exits
P5A.05 (batch 2, but written from the v1 tree) lists `src/ui/AddButton.tsx` and
`src/ui/SeatViewBar.tsx` as index-selection consumers to modify — both files are deleted
by P2.11/P3.09 before P5A starts. Their ported call sites now live in
`src/ui/commands/addCommands.ts` (the `add.light` select+reveal, per P2.09) and
`src/ui/status/ToolSegment.tsx` (the seat `go(delta)` port, per P3.09).
**Fix**: re-point those two bullets (the migration itself is unchanged); add "re-grep at
implementation time" language like P3.06 has.

### F6 [B] `src/ui/fuzzyMatch.ts` created twice with incompatible APIs (P2.14 vs P5A.11)
P2.14 creates it as a *scored* matcher (`{score, ranges}|null`, word-boundary/prefix
bonuses) for the palette. P5A.11 creates the SAME path as an unscored
`{matched, ranges}` matcher (+`fuzzyAny`) and forbids renaming (P5B.23/24 import it).
Same file, two shapes — the second author will clobber or fork.
**Fix**: make P5A.11 "extend the P2.14 module": add `fuzzyAny` + a boolean-style wrapper
over the scored matcher (or export both call forms); keep P2.14's scoring for the
palette; update P5A.11's test list accordingly.

### F7 [B] Command-id / path drift across batches (same feature, different ids)
- `select.none` (P2.09, P4.08) vs `select.deselect` (P5A.06) — same Deselect item.
- P5A.06 also re-registers `select.all/invert` + the `By Layer`/`Activate layer`
  providers that P2.09 already registered (`layers.select`, `layers.activate`) and P2.04
  already backed — its real scope is *re-basing those commands on `selectionOps.ts`*.
- `window.assetManager` → `'custom-assets'` (P2.09) vs `assets.openManager` →
  `'asset-manager'` (P8.14). P8.24 re-points the id; the command name must stay
  `window.assetManager`.
- `file.exportKsa` (P2.09) vs `export.ksa` (phase-09-10 §10 commands table).
- P5A.06 creates `src/commands/selectCommands.ts`; P2.09 established
  `src/ui/commands/*` (P5A.06 does say "follow the P2 layout" — keep that clause, drop
  the literal path).
**Fix**: one-line edits declaring P2.09's ids/paths canonical; later tasks re-point
`run`, never re-register.

### F8 [B] P12.04's expected persisted-key list contradicts P9.07 and P5B.01
P12.04 lists `flexo:layerView` under "kept from v1" — P9.07 (same batch!) deletes that
key (snapshot-only persistence). It also predicts `flexo:snap` while P5B.01 ships three
flat keys (`flexo:snapEnabled/snapTranslateStep/snapRotateStep`), and omits the new
`flexo:gizmoSpace`, `flexo:kindVisibility`, `flexo:paletteRecents`, `flexo:assetManager`,
`flexo:rebindNoticeSeen`, `flexo:currentProjectId`. The task's grep-driven assertion
would surface the drift, but the inline "expected set" is the kind of literal table a
lesser agent trusts.
**Fix**: correct the inline list (drop layerView, replace snap with the three flat keys,
add the six new keys).

### F9 [C] `surface:palette` binding row never enters the registry
FINAL_DESIGN_INDEX lists `surface:palette ↑↓ ↩ ⌘↩ Esc`. P2.14 implements them as
component-local key handling (sound engineering — virtual focus), P4.05 stamps
`data-surface="palette"` but no bindings register, so Help's "Command palette" group
renders empty/skipped and the registry is not the single source for these chords.
**Fix**: either register no-op display bindings for Help (label-only, like the
numberDraft static section) or add a palette row to P4.11's static sections. One-liner.

### F10 [C] Outliner layer-rename Enter/Esc stay component-local
system-services §4.4 wants the formerly-local rename keys registered at
`surface:outliner` (Help completeness); P5A.14 ports `RenameInput` with local handlers
and P5A.13 registers only ⌘F + mirrors. Same fix options as F9.

### F11 [C] Dangling/stale references
- P3.09 refers to "P5B.31" (doesn't exist; the measure status-text refinement is P5B.25).
- P6.15 wires "Select in 3D" via `selectLight(index)` — deleted by P5A.17; must be
  `select([{kind:'light', id}])` (+`revealEntity`), which the same sentence half-uses.
- P2.03 promises "P4 DELETES this file" (`src/ui/commands/interimMode.ts`) but no P4 task
  lists it; P4.03's uiStore deletion breaks its compile so the straggler-chase catches
  it — still, add it to P4.03's delete list explicitly.
- P10's entry state describes a 415-line `ExportButton.tsx` still holding the dialog
  guts; P2.07/P2.11 moved the guts to an `ExportDialog` component and deleted the
  trigger. P10.07's delete target is "the file P2 left the ExportDialog in" — reword.
- P12.03 (delete toast region) is fully performed by P3.06; P12.03's own hedging ("may
  have moved… in that case delete entirely") already degrades it to a verify — fine, no
  edit strictly needed.
- P5B.23 "register dialog id `subpart-browser`" — P2.08 already registered it; the task
  replaces the component under the same id (covered by P5B's hedge; note only).

### F12 [C] foundation §10.11's second `SubPartSetGrid` host (M overlay dialog) is not built
P11C.01 builds the grid host-agnostic ("docked Members view now; M dialog for future
callers") and no phase mounts the dialog host — acceptable: the design gives it no
current caller ("future non-Animation callers only"), so there is no feature to lose.
Recorded here so nobody mistakes it for a cut.

---

## 3. Cross-phase seams (explicitly requested checks)

| Seam | Status |
|---|---|
| P5A layer-view flip ↔ P9.07 | **KNITS.** P5A.10 keeps the global key with a "transitional — P9.07" comment; P9.07 flips to snapshot-only and carries a "if 5A already flipped, verify and skip" guard. `collapsed` rides the snapshot from day one. |
| P8 asset-namespacing ↔ P9.06 `pa:` | **KNITS.** P8.26 audits that all Phase-8 access goes through `assetKeys` + leaves the P9 signpost; P9.06 owns the scheme (single owner honored, no second literal) and has the both-orders coordination note; `listProjectBlobs`/delete/copy land in P9.06 and P9.10/P9.12 consume them. |
| P2 interim `$inspectorMode` ↔ P4 modeStore | **KNITS** (one nit, F11): P2.03's single-adapter design gives P4 exactly one file to delete; P4.02/P4.03 do the mechanical re-point and delete `$inspectorMode`; P4.04 re-points `mode.*` commands. Add interimMode.ts to P4.03's delete list. |
| P4 camera commands vs P5B Tool bar | **CONFLICT** — F2 (camera duplicated). The Tool bar itself (P5B.08) knits fine with P4.08's `T`/`⇧T` and reads `$effectiveToolMode` as designed. |
| Timeline dock mount: P4 setMode vs P11 | **KNITS.** P4.02 explicitly defers ("Timeline unmount is P11's dock — mounted `mode==='animation'` only"); P11B.01 mounts by `$mode` and extends `$layout.timeline` additively (`hidden`), wiring Window ▸ Timeline over P2.09's stub. P0.09 pre-built the timeline layout row; P0.10's float clamp already includes timeline rows. |
| P11 ↔ P4 animationStore | **KNITS** with wording nit: P11A's entry line "store exactly as censused" is false post-P4.02 ($isPoseEditing deps, exit hooks, tests on `setMode`) — but P11 line 82 acknowledges the re-point, and P11A.09 keeps the `stopAnimationPreview` name P4.02's exit hook calls. No action beyond softening the entry sentence. |
| P11 deletions ↔ P12.01 death sweep | **KNITS** — P12.01 rows 32–34 pre-list AnimationPanel/AnimToolbar, PreviewScrubber/FloatingPreviewToolbar, MeshPickerModal; phase-11 ships a matching deletion inventory. |
| Dialog-id registry P2 ↔ P5B/P8/P9/P10 | KNITS via P2.02's central registry; id drifts are F7. |
| Findings pipeline P6.02/P6.08 ↔ P7.08 / P10.01 | KNITS (shared `FindingsList`; P7 reuses; export pre-flight gap is F3). |
| Attention dots P4.04 ↔ P7.05 / P11E.01 | KNITS (P4.04 leaves the TODO naming both phases; both land theirs). |

## 4. Entry/exit state chaining

P0→P1→P2→P3→P4→P5A→P5B→P6→P7→P8→P9→P10→11A→11B→11C→11D→11E→P12 all declare entry/exit
states, and each entry matches the previous exit **except**:
- **P5B entry** (batch 1) lists as alive nine surfaces that P2.11/P3.08/P3.09/P5A.17
  already deleted (F4). Its hedge clause makes this survivable; fix per F4.
- **P10 entry** describes ExportButton.tsx in its v1 form (F11, reword).
- **P11A entry** "exactly as censused" overstates (see seam table; wording only).
All phases end app-runnable with the mandatory fmt→lint→fmt:check→typecheck→test gate
stated (DECISIONS #4 honored); intra-phase task boundaries declare compile-green
hand-offs (e.g. P4.02/P4.03 pair, P5A.01 shims, P11B.02 interim dual-write note).

## 5. What was checked and found clean (no findings)

- No LOCKED decision unimplemented; no death-list surface without a deletion task; no
  menubar item unwired; no hotkey-table row without an owner (modulo F9/F10 display
  registration); no phone variant unplanned (every phase carries its LOCKED #6 tasks).
- Undo enrollment: every document-mutating task states discrete-vs-streaming; view/session
  state consistently declared never-undoable; numeric tasks state
  useNumberDraft+`inputMode="url"`; store tasks state the no-react/no-three layering;
  no-migration honored everywhere (P12.04's cleanup is deletion, not conversion).
- Game-contract touchpoints correctly isolated: P6.04 (D17), P7.03/P7.04/P7.13
  (D15/D16/D7), P11A (per-channel easing export/import + codec) all carry scope/docs
  sync tasks (P6.20, P7.21, P11A.12, P12.16); chrome-only phases assert scope-untouched.
- P12.17's census-by-census RULE ZERO walk + P12.01/P12.02 sweeps + P12.18 smoke +
  P12.20 gate form a real backstop for everything above.

## 6. Recommended plan edits (ordered)

1. Add the Settings §10.7 completion task (F1) — the only true coverage hole.
2. Neuter P5B.04(2–3)/P5B.20 into verification (F2).
3. Extend P10.01 with the unplaced-mesh info row (F3).
4. Annotate P5B.09/21/22/25/26 residual scope (F4) and P5A.05's two stale bullets (F5).
5. Reconcile fuzzyMatch (F6) and the command ids (F7).
6. Correct P12.04's key table (F8).
7. One-liners: F9–F11.

## Fix changelog

Applied 2026-08-05 by the plan fixer against both audit reports (coverage + implementability).
Every code fact cited in an edit was re-verified against the working tree
(`src/three/axisColors.ts` AXIS_COLOR_CSS hexes; `rotateControls.ts` raise=:30/lower=:36;
`settingsStore.ts` $connectorSettings:22 / $ivaSeatSettings:48 / lightSettings markerSize:104 /
$selectionHighlight:189 / $simulateGlass:281; `colliderStore.ts` margin:56 / orientToSelection:61;
foundation §10.7 + §14.3 re-read for the new Settings task). Task total is now **281**
(+1: P9.17b).

### Coverage findings
- **F1 [A] Settings §10.7 hole** → NEW task **P9.17b** in phase-09-10.md (General/Viewport/Scene
  tab content; ColorField highlight rows; NEW `flexo:confirmThreshold` store key + re-point of the
  hardcoded ≤5 confirm predicates; light marker size; collider fit margin + orient;
  `$simulateGlass` mirror; environment-preset mirror; full five-tab deep-links). P9.17 reworded to
  own the TAB FRAME + look-dev anchoring definitively and hand content to P9.17b. Pointer captions
  updated in P5B.12, P5B.14, P8.10 (they now name P9.17b).
- **F2 [A] camera duplicated** → P5B.04 items 2–3 rewritten as verification-of-P4.09 (explicit
  "do NOT create `$frameRequest`"); P5B.20 rewritten as a verification-only task (4 checks incl.
  post-5A ref resolution + display-filter interplay; fix-in-place-only rule).
- **F3 [A] orphaned export info row** → P10.01 extended: `ExportIssue.area` gains `'asset'`;
  unplaced-custom-mesh `info` issue (message, `jumpTarget {mode:'surface'}`, same zero-placement
  rule as P8.02/modExport:807-808, pure re-derivation noted) + test case. P8.02/P8.27 seam notes
  now name P10.01 as the owner.
- **F4 [B] P5B re-scheduling P2/P3 work** → phase-05b entry state gains an ERRATA block naming
  everything P2.11/P3.08/P3.09/P4.03/P4.09/P5A.17 already did; P5B.09 re-scoped (SnapChip +
  TransformChips `[`/`]` tooltip update; no RotateNudgeChips, no TransformHud re-delete); P5B.21
  re-scoped (Display Filters new; rest verify; no ViewButton delete); P5B.22 re-scoped (S27
  choreography completion + provider verify; no AddButton delete; notes P4.03 made the auto-switch
  real); P5B.25 re-scoped ($activeTool formalization + live status text + Esc-rung re-point; no
  MeasureButton delete); P5B.26 re-scoped (seat-view tool def + ivaStore arming + toolStatusWiring
  re-key; no SeatViewBar/segment re-build; onCancel recursion guard spec'd). P5B.17's host file
  corrected to ModeSidebar. P5B.28 now extends P2.13's `beginActionChain` instead of re-implementing
  the discard-confirm.
- **F5 [B] P5A.05 stale consumers** → the AddButton/SeatViewBar bullets re-pointed at
  `src/ui/commands/addCommands.ts` and `src/ui/status/ToolSegment.tsx` (Files list + per-bullet v1
  anchors kept); re-grep-at-implementation-time language added.
- **F6 [B] fuzzyMatch duplicated** → P5A.11 rewritten as "extend the P2.14 module": keeps the
  scored `fuzzyMatch` (empty→null) untouched, adds `fuzzyFind`/`fuzzyAny` boolean adapters
  (empty→match-all), merged test list; P2.14 gains the one-module cross-ref; P5A.12 names the
  adapters.
- **F7 [B] command-id/path drift** → CANONICALITY block added to P2.09 (`select.none`,
  `select.activeLayer`, `file.exportKsa`, `window.assetManager`, `src/ui/commands/*`); P5A.06
  rewritten as re-base/verify (correct ids, no re-registration, only `select.boxSelect`+`B` new);
  P5A.08/P5B.19/P6.17 paths normalized; P8.05/P8.13/P8.14 keep `window.assetManager` (no
  `assets.openManager`), P8.14 adds `'asset-manager'` to the DialogId union, P8.24 removes
  `'custom-assets'`; phase-09-10 §10 header + P10.03 use `file.exportKsa` (design's `export.ksa`
  name mapped explicitly).
- **F8 [B] P12.04 key table** → corrected: `flexo:layerView` moved to "gone" (with a P9.07
  missed-flip instruction), `flexo:snap` replaced by the three flat P5B.01 keys, added
  paletteRecents / rebindNoticeSeen / gizmoSpace / kindVisibility / assetManager /
  projectManagerView / currentProjectId (plain-localStorage caveat) / confirmThreshold. P12.08's
  doc-table instruction fixed to match.
- **F9 [C] palette rows not in Help** → P4.11 gains static section 4 "Command palette"
  (↑↓ ↩ ⌘↩ Esc as display-only rows; explicitly no fake bindings).
- **F10 [C] outliner rename keys** → P5A.14 extends P4.11's helpStatics with the Outliner rename
  rows (static, no bindings); P4.11 leaves the `// EXTEND in P5A.14` marker.
- **F11 [C] dangling refs** → P3.09 "P5B.31"→P5B.25; P6.15 "Select in 3D" now
  `select([{kind:'light', id}])` + reveal (selectLight is dead post-P5A.17); interimMode.ts
  deletion added to P4.03 (see impl F5); P10 entry state + P10.07 reworded around the
  P2.07 `ExportDialog.tsx` extraction (and P2.07/P2.11/P3.06/P6/P12.01 made consistent:
  ExportDialog.tsx + PartDataDialog.tsx are now explicit files with named deleters P10.07/P6.18);
  P12.03 recast as verify-only (see impl F11). P5B.23 dialog-id note: no edit needed (P2.08
  registered the id; the task replaces the component under it — already covered by the hedge).
- **F12 [C] SubPartSetGrid M-dialog host** → recorded by the auditor as acceptable (no current
  caller); NO EDIT — not a finding requiring plan change.

### Implementability findings
- **F1/F2** → same edits as coverage F6/F2 above.
- **F3/F4** → same edits as coverage F4 (P5B.09/P5B.26); P3.08 additionally gains the forward
  note that P5B.09 owns the tooltip-rebind update + SnapChip sibling.
- **F5 (boot throw)** → P4.03 now DELETES `src/ui/commands/interimMode.ts` and re-points every
  importer in-task (mode.* runs → setMode with explicit "RE-POINT, do not re-register"; add.*
  S27 guard → setMode('build'); defineEngine → enterEngineMode; ModeSwitcher/status chip/
  PhoneTopBar/CondensedStatusBar); P4.04 rewritten to modify-not-register (drop the
  Data/Surface disable, verify titles); P4.03's Verify adds the interimMode grep.
- **F6** → P4.04 Files: "Modify `src/ui/shell/ModeSwitcher.tsx`" (upgrade-in-place note added).
- **F7** → P5A.03 deletes P2.04's editorStore helpers + re-points the commands in the same task
  (Files/Spec/Verify updated; P4.08 item 11 clarified to bind-don't-reimplement with the P5A.03
  forward note).
- **F8** → P4.11 uses dialog id `'help'`; helpStore deletion demoted to verify-P2.05.
- **F9** → P3.04 axisColors.ts is now a re-export of `src/three/axisColors.ts` `AXIS_COLOR_CSS`
  (stale TransformHud hexes called out as v1 drift; visible-correction note added).
- **F10** → same as coverage F8.
- **F11** → P3.06 gains the §17-step-3 "last within step 3" reading note; P12.03 Goal recast as
  verification with P3.06 named the owner.
- **F12** → all `src/commands/` references normalized to `src/ui/commands/` (P5A.06, P5A.08,
  P5B.19, P6.17; sweep-grep confirms only intentional negations remain).
- **F13** → same as coverage F7 (asset-manager cluster).
- **C/P2.11 boundary** → accepted-transient sentence added to P2.11 item 3 AND P2.07 item 5
  (phone View/Measure toggles gap between P2.11 and P2.15).
- **F-ambiguities**: (1) P3.01 `$jobs` declared in the snippet; (2) P3.03 gains the
  provider-registration-after-first-read comment + nonce escape hatch; (3) P4.05 — no edit
  (auditor: harmless); (4) covered by the P5B errata block; (5) covered by F12; (6) P6.01 union
  comment fixed (passthrough/tanks at both scopes); (7) P12.01 rows 8/10/13/31 corrected to follow
  the PLAN's deletion owners (PartDataDialog/ExportDialog split, InspectorContent→P4.03,
  ImportReportCard→P3.14).
- **E cosmetic cites** → P4.08 rotateControls cite corrected (raise=:30, lower=:36); the ivaStore
  :58-67 range cite left as-is (actual :64 falls inside the cited range — auditor called it
  harmless).
- Also softened phase-11's P11A entry sentence ("exactly as censused") to name the P4.02 re-point
  deltas, per the coverage seam table's wording nit; fixed a phase-09-10 boot-sequence typo
  ("demotion is P9.17" → P9.18) discovered while editing.

### Rejected findings
None rejected. Two items required no edit by the auditors' own assessment (coverage F12;
impl F-ambiguity 3) and are logged above as no-ops.
