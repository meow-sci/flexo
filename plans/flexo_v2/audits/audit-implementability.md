# Implementability audit — flexo v2 plan (all 10 phase files)

**Audited**: 2026-08-05, against the working tree at `/Users/asherwin/repos/meow-sci/flexo`
(branch `feature/v2`, HEAD fcd5e07). Method: (1) machine-extracted all 428 `(code: path:line)`
citations and verified file existence + line bounds; (2) verified all 105 symbol-anchored
citations land within ±20 lines of the named symbol; (3) hand-spot-checked ~240 further
un-symboled line citations across every phase file against the actual source; (4) verified
design/census doc citations resolve to real files; (5) checked snippets against real kit
APIs, nanostores idioms (`persistentJSON` confirmed as a real `@nanostores/persistent@1.3.5`
export), react-hotkeys-hook 5.3.3, coords.ts, and the React/undo/numeric/layering
constitutions; (6) cross-read the ten files for seam coherence.

**Headline**: citation fidelity is exceptional — every checked file/symbol/line citation in
all ten files resolves (including decomp `.cs` files and `Content/Core/*.xml` under
ksa-game-assemblies). Undo enrollment, numeric-input, layering, persistence, and
no-migration rules are stated correctly and consistently in essentially every mutating
task. The real defects are **cross-phase seam collisions**: the later-written phase files
(02-03, 04) pulled work forward that the earlier-written files (05a/05b, 08, 12) also
specify, producing duplicate files, duplicate atoms under different names, and one
guaranteed boot-time throw. All are fixable by editing a handful of task specs; no phase
needs a structural rewrite.

**Verdict: minor-fixes** — but the seam collisions (F1–F7) should be reconciled in the plan
text BEFORE implementation starts, or a literal-minded agent will create duplicate modules
and hit the P4 duplicate-command-registration throw.

---

## A. Cross-phase collisions (fix the plan text)

### F1 (HIGH) — `src/ui/fuzzyMatch.ts` created twice with incompatible APIs
- phase-02-03.md **P2.14** creates `src/ui/fuzzyMatch.ts` + `fuzzyMatch.test.ts`:
  `fuzzyMatch(query, target): {score, ranges}|null`, scored (+3 boundary/+2 run/+1, ×1.5
  prefix), **empty query → null**.
- phase-05a.md **P5A.11** creates the SAME two files: `fuzzyMatch(query, text):
  {matched, ranges}`, unscored greedy subsequence, **empty query → matches everything**,
  plus `fuzzyAny(...)`. P5A.11 never mentions P2.14; it even says "do not rename it" for
  P5B's benefit. P5B.23/24, P6.07, P7.12 all say "the 5A matcher".
- **Fix**: make P5A.11 "extend the P2.14 module" — keep P2.14's scored matcher for the
  palette, add `fuzzyAny`/a boolean adapter for list filtering (or agree one API that
  serves both: `matched` ⟺ `score !== null`). One file, one test file.

### F2 (HIGH) — Camera commands (LOCKED #7) implemented twice, different atom names
- phase-04.md **P4.09** ships the whole feature: `viewStore.$cameraFrame` + `frameCamera()`,
  `src/three/cameraFraming.ts` (+test), `Viewport.frameBounds(center,size)`,
  `Viewport.snapCamera(dir, target?)`, `EditorScene.frameSelection()`, commands
  `view.frameSelection`/`view.resetCamera`/`view.cameraSnap.*`, `F` binding.
- phase-05b.md **P5B.04 item 2** creates a parallel `viewStore.$frameRequest`
  (`{nonce, target:'selection'|'all'}`) and **P5B.20** re-implements `frameBounds(box)`,
  snap-target, and the Reset command. Same design section (design-build-mode §5.3), two
  different intent atoms.
- **Fix**: re-scope P5B.04 item 2/3 and P5B.20 to "verify P4.09 landed; no-op if so"
  (P5B.20's "binding exists from the shell phase" hedge is not enough — its Files/Spec
  still instruct creating `$frameRequest`). The preamble's phase map already assigns camera
  commands to P4.

### F3 (MEDIUM-HIGH) — Rotate/nudge status chips + TransformHud deletion done twice
- phase-02-03.md **P3.08** creates `src/ui/status/TransformChips.tsx` (rotate + nudge chips,
  click-cycle, verbatim tooltips) and **deletes `src/ui/TransformHud.tsx`**.
- phase-05b.md **P5B.09** creates `src/ui/status/RotateNudgeChips.tsx` + `SnapChip.tsx` and
  **deletes TransformHud again**.
- P3's knitting notes reconciled the snap chip ("segment 9 is NOT built in P3 … P5B adds the
  chip") but not the rotate/nudge chips.
- **Fix**: re-scope P5B.09 to "SnapChip only + extend P3.08's TransformChips tooltips with
  the `[`/`]` rebind text"; drop its TransformHud deletion and RotateNudgeChips file.

### F4 (MEDIUM-HIGH) — SeatViewBar deletion + seat tool segment done twice
- phase-02-03.md **P3.09** builds `ToolSegment` + `toolStatusWiring` (seat ordinal, ◀▶ wrap,
  honesty tooltip, Exit·Esc) and **deletes `src/ui/SeatViewBar.tsx`**.
- phase-05b.md **P5B.26** deletes SeatViewBar again and re-creates the segment renderer.
- **Fix**: re-scope P5B.26 to the `$activeTool='seat-view'` formalization (tool def,
  survives-mode-switch, ivaStore arm/disarm) + Tools ▸ Sit in Seat menu completion; the
  chrome move already happened in P3.09. (P5B's generic "if a component was already
  deleted, skip" clause at phase-05b.md:11 helps, but the task Files/Spec should not
  instruct re-creation.)

### F5 (HIGH — guaranteed boot throw) — P4 never retires P2's interim mode adapter
- phase-02-03.md **P2.03** creates `src/ui/commands/interimMode.ts` and states "P4 DELETES
  this file and re-points `mode.*` commands at modeStore.setMode". **P2.09** registers the
  five `mode.*` commands running `setInterimMode`.
- phase-04.md **never mentions `interimMode.ts`** (grep: 0 hits). Worse, **P4.04** says
  "register five commands `mode.build` …" — with P2.01's `registerCommand` spec'd to
  **throw on duplicate id**, following P4.04 literally throws at boot. Also, P4.03 deletes
  `$inspectorMode` while `interimMode.ts` still imports it (typecheck would catch it, but
  only via the generic "chase stragglers" instruction).
- **Fix**: add to P4.03/P4.04: "DELETE `src/ui/commands/interimMode.ts`; RE-POINT (do not
  re-register) the existing `mode.*` commands' `run`/`checked` at `setMode`/`$mode`" —
  or spec `registerCommand` replacement semantics.

### F6 (MEDIUM) — `ModeSwitcher` created at two different paths
- phase-02-03.md **P2.11** creates `src/ui/shell/ModeSwitcher.tsx` (interim, over
  `$interimMode`). phase-04.md **P4.04** says "Create `src/ui/ModeSwitcher.tsx`".
- **Fix**: P4.04 should say "Modify `src/ui/shell/ModeSwitcher.tsx`" (re-point at `$mode`,
  enable Data/Surface). P4's seam note ("follow the earlier phase's real export") exists
  but the Files list contradicts it.

### F7 (MEDIUM) — select-all / invert implemented three times, two eligibility rules
- **P2.04** adds `selectAllEntities()`/`invertSelection()` to editorStore (listed +
  unlocked). **P4.08 item 11** re-implements inline "if P2 stubbed them" (hedged, OK).
  **P5A.03** creates `src/state/selectionOps.ts` with `selectAll()`/`invertSelection()`
  (listed + **visible** + unlocked — a documented parity clarification).
- **Fix**: P5A.03 should explicitly DELETE P2.04's editorStore helpers and re-point the
  `select.all`/`select.invert` commands, else two divergent implementations coexist
  (P2.04's omits the hidden-layer exclusion). P5A.06 already re-wires the commands but
  never says to remove the old functions.

---

## B. Naming / id inconsistencies (small but will confuse literal agents)

### F8 (MEDIUM) — Help dialog id: `'help'` vs `'shortcuts'`; helpStore deleted twice
- P2.02's `DialogId` union + P2.05 + P2.09 use `'help'`. phase-04.md **P4.11** opens
  `{id: 'shortcuts'}` and re-deletes `src/state/helpStore.ts` (P2.05 already deleted it).
  **Fix**: P4.11 → use `'help'`; change "Delete helpStore" to "verify deleted (P2.05)".

### F9 (MEDIUM) — axisColors: plan creates a THIRD copy and mis-states "gizmo-matched"
- **P3.04** says move TransformHud's `AXIS_COLOR` (`#ff0000/#00ff00/#0000ff`,
  "gizmo-matched") into a new `src/ui/status/axisColors.ts`. Reality: the gizmo's single
  source of truth is the EXISTING `src/three/axisColors.ts` `AXIS_COLOR_CSS`
  (`#ff5468/#7fd94b/#4d9dff`), whose header explicitly forbids a second numeric copy;
  TransformHud's map + comment are stale v1 drift. No plan file mentions
  `src/three/axisColors.ts` except P5B.09 (ambiguously: "port from `src/three/axisColors.ts`
  / the v1 TransformHud mapping").
- **Fix**: P3.04 should have `src/ui/status/axisColors.ts` **re-export from
  `src/three/axisColors.ts`** (dependency-free by design, both sides may import it), not
  copy TransformHud's stale hexes. Drop the "gizmo-matched" claim.

### F10 (MEDIUM) — P12.04's persisted-key expectations contradict earlier phases
- Lists `flexo:layerView` under "kept from v1" — **P9.07 removes it** (plain atom;
  snapshot-only persistence). It belongs in the "gone" list.
- Lists `flexo:snap` under "new in v2" — **P5B.01 deliberately ships three flat keys**
  (`flexo:snapEnabled`, `flexo:snapTranslateStep`, `flexo:snapRotateStep`) with a
  documented deviation from the design's `flexo:snap`.
- The named-new-keys list omits `flexo:paletteRecents` (P2.01), `flexo:gizmoSpace`
  (P5B.02), `flexo:kindVisibility` (P5B.04), `flexo:rebindNoticeSeen` (P4.11),
  `flexo:assetManager` (P8.14) — partially hedged by "plus any keys the area phases
  added", but the two WRONG entries would fail P12.04's own assertion.
- **Fix**: correct the two wrong entries; ideally enumerate the full expected v2 set.

### F11 (LOW) — Toast-region deletion timing reads two ways
- foundation §17 step 3: "delete the toast region **last**". phase-02-03 **P3.06** deletes
  `src/ui/kit/Toast.tsx` inside P3 (after routing everything through the facade — "last
  within step 3"). phase-12 **P12.03** re-schedules the deletion for P12 ("schedules this
  deletion LAST") but is hedged into a verify-no-op ("…in that case delete Toast.tsx
  entirely" / it will already be gone). Not blocking; add one sentence to P3.06 noting the
  §17 reading, and recast P12.03's Goal as "verify the region is gone" so agents don't
  stall on the contradiction.

### F12 (LOW-MEDIUM) — command-module path drift `src/ui/commands/` vs `src/commands/`
- P2.09 creates `src/ui/commands/*`. P5A.06 ("create `src/commands/selectCommands.ts`",
  hedged), P5B.19 ("`src/commands/edit.ts` or wherever"), P6.17 ("modify `src/commands/*`",
  NOT hedged), P5A.08 ("modify `src/commands/selectCommands.ts`"). A literal agent may
  plant a second tree. **Fix**: normalize all references to `src/ui/commands/`.

### F13 (LOW) — Asset Manager command/dialog id drift
- P2.09: command `window.assetManager` (⇧⌘A) → dialog `'custom-assets'` "[interim — the
  real Asset Manager replaces the guts in P8 under the same command]". P8.14: dialog id
  `'asset-manager'`, command named `assets.openManager`; P8.13 registers surface commands.
  P4.08 item 7 binds ⇧⌘A to "P2's actual command id".
- **Fix**: P8.14 should explicitly say: keep command id `window.assetManager` (or rename it
  AND update the P4 binding + Window-menu MenuSpec in the same task); retire/replace the
  `'custom-assets'` dialog id in the union when CustomAssetsModal dies (P8.24).

---

## C. Compile-green / intra-phase ordering

- **P2.11 boundary (checked)**: deleting `ViewButton`/`MeasureButton` while `MobileTopBar`
  (alive until P2.15) references their sheet variants — P2.11 item 3 does instruct keeping
  MobileTopBar compiling by re-pointing at `runCommand`/`openDialog`, so the boundary
  compiles; note however phones lose the View-popover toggles between P2.11 and P2.15
  (Settings numerics remain reachable). Acceptable transient, worth one sentence in P2.11.
- **P4.02→P4.03**: explicitly flagged as a ship-together pair ("3D gating split-brained
  until P4.03") — good.
- **P5A.01 shim strategy** (legacy index views + setter shims deleted in P5A.17) is sound
  and the task order note covers every boundary.
- **P6/P7 interim hosting** (Data mode hosts v1 EngineSections until P7.18/P7.19) is
  coherent, with explicit `// TODO(P7.18)` markers on both sides.
- No other broken-import orderings found.

## D. Snippet / idiom conformance (checked, clean)

- **No manual memoization anywhere** in any snippet (grep-verified). Hooks discipline OK
  (P0.10 even calls out unconditional hook order).
- **persistentJSON** used everywhere persistence is specified; confirmed a real export of
  `@nanostores/persistent@1.3.5` (repo-wide idiom). No `persistentAtom` misuse.
- **Numeric fields**: every numeric-input task states `useNumberDraft` +
  `inputMode="url"` (P0.14 correctly exempts the hex ColorField; P5B.15 rebuilds
  VectorApply on useNumberDraft, killing the last hand-rolled path). No `type=number`, no
  ad-hoc `Number(v)` anywhere.
- **Layering**: every new `src/state/` module states "no react/three imports"; UI-side
  registries (notification rich bodies, command modules) correctly live in `src/ui/`.
- **Undo**: every document-mutating task states discrete-vs-streaming enrollment, matching
  docs/editor-state.md and the editorStore invariant block (`src/state/editorStore.ts:298`).
  View state (layout, mode, selection, layer view, snap, palette recents) consistently
  never-undo. P5B.18's ⌥-drag single-'duplicate'-step and P9.04's "openProject replaces
  stacks" are correctly reasoned.
- **No migration code** anywhere; P11A.05's schema-bump + purge and P12.04's
  remove-never-read cleanup follow the constitution exactly.
- **react-hotkeys-hook**: v5.3.3 confirmed in package.json; P4.06's `enabled`-as-callback
  with `ignoreEventWhen` fallback is a safe spec.
- **On-demand rendering**: every three-layer task routes through `EditorScene.sub()` /
  intent-nonce atoms; P8.03's idle-queue thumbnails and P3.11's FPS writer respect it.

## E. Citation accuracy (verified)

- 428/428 extracted citations: file exists, line within bounds. 105/105 symbol-anchored
  citations verified. ~240 additional hand-checked line citations across all ten files
  match the cited content **exactly** (including editorStore.ts 4000-line offsets,
  EngineSections.tsx 1806-line offsets, scope/*.md line cites, decomp `.cs` files, and
  `Content/Core/GrainGeometries.xml`/`SolidPropellants.xml` existence).
- Only cosmetic drift found: P4.08 cites `rotateControls.ts:30,36` for
  lower/raiseRotateStep with the line order swapped (30 = raise, 36 = lower); the prose
  mapping (`[` → smaller, `]` → larger) is correct. `src/state/ivaStore.ts:58-67` for
  `exitSeatView` (actual :64, inside the cited range). Both harmless.

## F. Minor ambiguities for lesser agents

1. **P3.01**: the `$progress` snippet references `$jobs` without declaring it — add one
   line (`const $jobs = atom<Job[]>([])` internal).
2. **P3.03**: `$modifierHints` is a `computed` over stores, but provider registration
   mutates a module map — hints registered after first read won't surface until a
   dependency changes. Harmless in practice (hover flips constantly); worth a comment or a
   registry-nonce atom.
3. **P4.05**: `if (chain) s.add('surface:chain')` can duplicate the focused-surface add —
   Set semantics make it harmless; fine.
4. **phase-05b entry state** lists as "still alive" several components that P2/P3 already
   deleted (ViewButton, MeasureButton, SeatViewBar, TransformHud, MobileTopBar-era bits).
   The line-11 escape clause ("skip the delete") covers correctness, but an errata block
   naming what P2–P4 already removed would save agents real confusion (ties into F2–F4).
5. **P5A.06/P5A.08** reference `src/commands/selectCommands.ts` in later "modify" lines
   after the hedged create — normalize with F12.
6. **P6.01** `DataSectionId` union puts `'passthrough'` in the part-scope comment row but
   template scope also has Passthrough (P6.15/P6.16 use it at both scopes) — the union is
   one flat type so code compiles; adjust the comment.
7. **P12.01/P12.17** (death sweep + parity audit) correctly re-derive their tables from
   the census; the ImportReportCard row is listed under P8 in the design's death table but
   P3.14 deleted it early — P3.14 documents the seam; ensure P12.01's table follows the
   plan (P3) not the design row, as P3.14 instructs.

## G. What is unambiguously good (no action)

- Phase 0/1 kit groundwork: additive-only discipline, byte-identical claims verified
  against real tv() variants and wash values (all seven wash-mapping rows match source).
- Phase 5A stable-id selection: the shim/compat-view strategy, complete consumer census
  (verified — all cited consumers exist at the cited lines), aliasing-regression test.
- Phase 6/7: the port-not-redesign discipline with per-symbol successor checklists
  (P6.18/P7.19 pre-delete sweeps) is exactly right for lesser agents; all 40+ cited
  EngineSections/GameDataSections symbols verified.
- Phase 9/10: projectStore rewrite preserves every v1 semantic with line-verified
  anchors; boot order and asset namespacing seams are explicit; undo statements correct.
- Phase 11: per-channel easing model, codec bump discipline, easingFit tolerances all
  match the real code (`POS_TOL 4e-3`, `ROT_TOL_DEG 2.5`, fitter internals verified);
  scope/animation.md sync is owned by P11A.12 — the one true game-contract touch is
  correctly flagged.
- Phase 12: release-gate structure, live-key assertion idea, Playwright placement match
  the constitution and memory rules (project-local, `/flexo/` base).

---

## Recommended pre-implementation fix list (ordered)

1. F5 — add interimMode.ts deletion + mode.* re-point to P4.03/P4.04 (boot throw).
2. F1 — merge the two fuzzyMatch specs into one module/API.
3. F2 — re-scope P5B.04/P5B.20 to verify-P4.09.
4. F3/F4 — re-scope P5B.09 (SnapChip only) and P5B.26 (tool-slot only).
5. F7 — P5A.03 deletes P2.04's editorStore select-all helpers.
6. F6/F8/F12/F13 — path/id normalization edits.
7. F9 — axisColors re-export instead of a third copy.
8. F10 — correct P12.04's key lists.
9. C/P2.11 + F11 + the F-section ambiguity notes — one-line clarifications.
