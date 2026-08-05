# flexo v2 design corpus — completeness + coherence critique

Auditor: adversarial completeness/coherence pass over the 7 design docs vs the 12 analysis
reports, BRIEF.md, DECISIONS.md, and the AGENTS.md constitution rules restated in DECISIONS.

**Verdict: `minor-fixes`.** The corpus is unusually complete. RULE ZERO substantially holds:
I walked every feature inventory in all 12 analysis reports against the designs and found
**no outright cut feature**. Every LOCKED decision (1–8) is honored; the constitution rules
(numeric inputs, undo enrollment, layering, no-migration, toast() imperative, chain
non-modality, connectors-never-joint-members, dark-only, on-demand loop) are explicitly
restated and respected in every area doc. What remains is a set of partial-parity
regressions hiding inside deliberate changes (mostly hotkey scope narrowing), a handful of
cross-doc contradictions on shared contracts, and small phone/doc-sync gaps. Each finding
below carries severity, evidence, and a concrete fix.

Severity scale: **MAJOR** (breaks a v1 workflow or a locked/constitution rule if
implemented as written) · **MINOR** (cross-doc conflict or partial parity loss; cheap
amendment) · **LOW** (polish/doc-sync; fix opportunistically).

---

## 1. Feature-parity findings

### F1 — MAJOR(borderline)/MINOR: edit-command chords stop working when a list has focus

- **Evidence**: foundation §11.2 puts `⌘C ⌘X ⌘V ⌘D ⌫` (and `⌘A ⌥⌘A ⇧⌘I`) in the
  **viewport** scope; §11.1 defines viewport scope as active only when "focus is not
  inside an interactive react-aria collection/menu surface". design-system-services §4.4
  confirms: "⌘C/⌘V/⌫ scope-narrowed". In v1 these were **global** (suppressed only while
  typing — selection-transform.md §6, ui-kit-hotkeys.md §6), so the extremely common flow
  *"⇧-range-select 10 rows in the Assets list → press ⌫ (or ⌘C)"* worked. In v2 the
  Outliner is a GridList (an interactive collection); after clicking/range-selecting rows,
  focus sits in the list ⇒ viewport scope inactive ⇒ **Delete/Copy/Cut/Paste/Duplicate do
  nothing** (fall through to browser defaults). Same for the Data navigator, Engine module
  tree, and the SubPart Set Picker. The narrowing was motivated by arrow-key conflicts
  (nudge vs row navigation) — correct for letters and arrows, collateral damage for the
  edit chords.
- **Failure scenario**: user range-selects entities in the Outliner, presses ⌫ →
  nothing happens; presses ⌘C → browser copies nothing; concludes v2 is broken vs v1.
- **Fix**: register mirror bindings for `⌘C ⌘X ⌘V ⌘D ⌫` (and optionally `⇧⌘I`) at
  `surface:outliner` (the scope already exists for rename Enter/Esc — system-services
  §4.4) plus the other selection-carrying list surfaces, delegating to the identical
  commands; or redefine the viewport-scope predicate so that *modifier-chord* edit
  commands remain active with list focus while *bare-key* bindings (WASDQER, arrows,
  T/B/F/[/]) stay excluded. Document the choice in foundation §11.1. Note the Outliner's
  own ⌘A (react-aria selects all rows) must keep precedence over the viewport ⌘A.

### F2 — MINOR: no at-a-glance active layer on phone (v1 had it; two docs disagree — see C4)

- **Evidence**: v1 phone `MobileInspector` FAB displayed the **active layer name** +
  selection count (shell-layout.md §1.15). design-system-services §8.1 CondensedStatusBar
  spec lists only: mode/tool chip · message channel · selection chip · snap · bell — no
  layer chip. Every phone add lands on the active layer, so a phone user can no longer see
  where adds will land without opening the Outliner sheet. (Foundation's own phone frame
  sketch §12 *does* show `Layer:Hull` in the condensed bar — see contradiction C4.)
- **Fix**: add the active-layer chip to CondensedStatusBar in Build/Animation modes (tap →
  the same layer-picker menu as desktop), matching foundation's phone frame.

### F3 — LOW: nudge/rotate in Data/Engine/Surface modes now gives zero feedback

- **Evidence**: design-system-services §1.2 #8 hides the rotate/nudge chips in
  Data/Engine/Surface "the posture chips would be noise", while S8/foundation §11.2 keep
  WASDQER + arrows live in all modes. design-build-mode §5.2: nudge feedback is "no toasts
  — the status chips update live". Combined: an arrow press in Data mode moves the
  selection with **no visible feedback at all** (v1 always showed TransformHud). Undo
  covers it, but it is a silent-document-mutation regression.
- **Fix**: either (a) show the chips whenever a transformable selection exists, regardless
  of mode, or (b) when the chips are hidden, route each nudge/rotate press through the
  transient status channel (`Nudged Y +0.1 m`). (a) is simpler and truer to v1.

### F4 — LOW: armed one-shot marquee on phone has no cancel affordance

- **Evidence**: design-build-mode §11.6 — phone arms Box Select from MenuSheet/palette;
  "orbit suspended while armed"; desktop cancel is Esc (rung 5). Phones have no Esc, and
  no cancel control is specified; the user is stuck with orbit disabled until they drag a
  marquee.
- **Fix**: make the CondensedStatusBar tool chip (`⬚ Box select`) tap = cancel (it already
  exists per §8.1 "tool icon replaces it while a tool is armed"), and say so in
  design-build-mode §11.6. Same convention generalizes to measure on phone (currently
  cancellable only by completing or re-toggling from the menu).

### F5 — LOW: scene-lighting sliders move from a live popover to a centered modal

- **Evidence**: v1 View popover exposed exposure/reflections/sky-blur sliders over the
  live viewport (viewport-scene-view.md §1.2). Foundation S16 deliberately moves all
  numerics/sliders to Settings → Scene (modal M, centered), with View-menu radios for
  presets only. Tuning exposure now happens with a centered dialog covering the model you
  are trying to judge — a real ergonomic regression for a look-dev task, even though the
  IA ruling (Law 1) is sound.
- **Fix**: no IA change needed — specify that the Settings dialog is draggable or that the
  Scene tab renders side-anchored (or simply guarantee the M dialog leaves ≥50% of the
  canvas visible and the sliders live-commit, which foundation already implies via "menu
  radios and Settings edit the same stores"). One sentence in foundation §10.7 suffices.

### F6 — LOW: Outliner `⌘F` search-expand is an unregistered hotkey

- **Evidence**: design-build-mode §2.1 sketch annotation: "header: title + search toggle
  (⌘F while panel focused expands the field)". `⌘F` appears in no binding table
  (foundation §11.2, system-services §4.4), would shadow browser find, and Help would not
  list it — violating the "no off-registry bindings in v2" contract (system-services §4.1).
- **Fix**: register `surface:outliner ⌘F` in the tables, or drop the annotation.

### Parity confirmations (spot-audit record)

For the record, the following frequently-lost v1 features were explicitly verified to have
v2 homes: seat-view honesty tooltip + C-order cycling (status tool segment); `$snap`
plumbing → snap UI; collider fit margin/orient + light marker size Settings gaps closed;
`extraDiametersM`/`Tank.roleAffinity`/`locationAsmb` (D3); RawXmlNode passthrough viewer
(D2); reaction-keyed plumes (D15); ConsumerFeedWiring absorbed into Engine (LOCKED);
lights join clipboard; per-project `$layerView`; import-report removed-SubParts-named
(rich notification); `restKeyframeId` fully surfaced (⚓); spring-loaded scrub + latch;
kitten flows incl. texture-export mode; wiki app + `?debug=dockingport` untouched;
share-link boot suppressions; mod-folder 4-state + forget confirm; Reset-Everything
FS-grant switch on all platforms; About legal text; `useShiftRangeSelect` grow-only
semantics; browser fresh-session/cap-indicator/facets; `$browserPopupCount` handling;
chain guards/caps/defaults/one-undo/non-modality; `Vec3Field` axis-lock disables;
container `normalizeSize`; `ivaLook` direction-is-the-state loop ("do not refactor" kept).

---

## 2. Cross-design contradictions

### C1 — MINOR: SubPart Set Picker — foundation (M dialog) vs animation (docked Members view)

- **Evidence**: foundation §10.11 defines the picker as an **M overlay dialog** "Used by
  joint membership ('Choose members…')", and §7.2/§8.2 route joint membership to "§10.11".
  design-animation-mode D1 + §7 replaces that host for Animation with the **docked,
  non-modal right-sidebar Members view** (correctly — a kit Modal would kill member
  painting and live layer-eye interaction). The deviation is declared in the animation doc
  but the foundation ("LAW", "never cite the proposals… escalate, not improvise") still
  says the opposite in three places; a Build/Data implementer reading only foundation will
  build the dialog host for joint membership.
- **Fix**: amend foundation §10.11/§7.2/§8.2: the shared component is `SubPartSetGrid`;
  the Animation joint-membership caller renders it docked (Members view, per the animation
  design); the M-dialog host remains for future non-Animation callers only.

### C2 — MINOR: two different per-project assetDb key schemes for the same store

- **Evidence**: design-surface-assets §7.3: keys `p<projectId>:tex-src:<id>` etc.
  design-projects-export D7/§1.5: keys `pa:<projectId>:<kind>:<assetId>`, and it claims
  contract ownership ("Contract handed to the surface/assets area"). Both docs also
  specify the boot purge of unprefixed keys and the delete/duplicate sweeps — duplicated
  ownership of one mechanism with **incompatible literal formats** (a range-sweep
  implemented against the wrong prefix silently deletes nothing / everything).
- **Fix**: declare design-projects-export §1.5 the single owner (it holds the wider
  contract: sweep, duplicate-copy, archive enumeration); surface-assets §7.3 adopts the
  `pa:<projectId>:<kind>:<assetId>` scheme by reference and drops its own literal.
  `listProjectBlobs(projectId)` stays the API surface-assets provides.

### C3 — MINOR: Data-mode entry rules disagree (and Data gains an undeclared entry effect)

- **Evidence**: foundation §2.4: "**Entering Data** with a SubPart selected → that
  template's scope opens; else Part scope" — selection wins. design-data-engine A2:
  "restore last `$dataScope`, **else**: selection contains a SubPart → template scope;
  else Part" — last scope wins. With both a surviving scope and a selection the two docs
  produce different screens. Additionally B5 moves `ensureReactionsLoaded()` to mode entry
  "also fired on Data-mode entry", while foundation §2.4 states "Data / Build: **no other
  entry/exit effects**".
- **Fix**: pick one ladder and write it in both docs. Recommended: cross-mode jumps with a
  payload always win; plain entry restores `$dataScope`; when `$dataScope` is null/stale,
  fall back to selection-derived scope, then Part (i.e. adopt A2 and amend foundation
  §2.4). Also amend §2.4 to sanction the reactions preload as a Data-entry effect (it is
  side-effect-free w.r.t. the document).

### C4 — MINOR: CondensedStatusBar contents — foundation phone frame vs system-services spec

- **Evidence**: foundation §12 phone frame renders `Exported ✓ · Layer:Hull · 🔔2` in the
  condensed bar; design-system-services §8.1 (the implementable spec) omits any layer
  chip. One of the two is wrong; the v1-parity argument (F2) says the frame is right.
- **Fix**: add the Build/Animation active-layer chip to §8.1 (tap = layer picker), or —
  if rejected — fix the foundation sketch and answer F2 some other way.

### C5 — MINOR: single-letter global hotkeys are inconsistent and fire behind dialogs

- **Evidence**: foundation §11.1: "overlay dialogs do not suppress global bindings; they
  do suppress viewport scope". §11.2 makes `M` (arm measure) and `1–5` (mode switch)
  **global**, while `B` (arm marquee — the same category of tool as `M`) is viewport.
  Consequences: with the Project Manager open, pressing `3` switches the app to Data mode
  behind the dialog (timeline/sidebar churn invisible to the user); pressing `M` arms the
  measure tool invisibly — on dialog close the crosshair cursor + suppressed picking
  surprise the user. v1 never had single-letter *tool/mode* globals, so this is a new
  wart, and M-vs-B is an internal inconsistency.
- **Fix**: move `M` to viewport scope (symmetry with `B`), and gate `1–5` with
  `when: () => !dialogOpen` (or move them to viewport scope too — they are only
  meaningful over the workspace). Foundation §11.2 + system-services §4.4 both need the
  edit; the conflict-detection test (§4.5) should then assert no bare-letter binding is
  active while `$openDialog` is set.

### C6 — LOW: MaterialDialog hosting wording

- **Evidence**: foundation §8.5 (Surface right sidebar): "Edit… / New… → MaterialDialog
  **as stacked view**" — but in Surface mode there is no host dialog to stack views in.
  design-surface-assets D9 resolves it correctly: overlay dialog from the sidebar, pushed
  view inside the Asset Manager.
- **Fix**: reword foundation §8.5 to "→ MaterialDialog (overlay; pushed view when opened
  inside the Asset Manager — D9)".

### C7 — LOW: doc-sync bundle (foundation text lags declared area extensions)

All declared, none dangerous; foundation is "LAW" so its text should absorb them:
1. File → Import Project… (§3) lacks the projects-design **destination radio**
   (Merge / Open as new project — projects §4.3, declared extension #2).
2. Foundation §10.7 Scene tab field list omits the `$simulateGlass` mirror that
   design-surface-assets §1.3 places there.
3. Foundation §13 `layoutStore` shape omits `floatHidden` (added by system-services §6.4
   for the Window ▸ Tool Bar toggle).
4. Foundation §2.6 tool table enumerates four tools; animation D2 adds `member-paint` and
   `pivot-pick` to the union (declared) — fold into the table so the Esc-rung/status
   segment obligations are visible in one place.
- **Fix**: one editorial pass over foundation §3/§10.7/§13/§2.6.

### Ownership checks that came up clean

Explicitly verified as *not* gaps: measurements/reference containers (Build owns; Data
doc disclaims them and fixes the vocabulary); lights (Build inspector owns part-level
editing, Data template scope owns template lights — same split as v1, cross-links
specified); connector capabilities (single editor in Build, read-only mirrors — D10);
ConsumerFeedWiring (one component, two entrances — D9/D11); Add menu (foundation tree +
build per-item behavior); Settings IA (foundation §10.7 field list + projects §9.4 for
Import&Export/Advanced — shallow but sufficient); chain UI (build §9 + system-services
window tenancy, consistent); Import Review (surface-assets) vs Import Project (projects)
— two distinct dialogs, no overlap; export pre-flight consumes `computeClipIssues` +
validators (animation §11.1 ↔ projects §6.1, compatible).

---

## 3. Phone-parity findings

1. **Active-layer chip missing from CondensedStatusBar** — F2/C4 above (fix: add chip).
2. **No cancel affordance for armed one-shot tools (marquee, measure)** — F4 above
   (fix: tool chip tap = cancel).
3. **Hover-only affordances have no touch equivalent** — LOW: Members-view row hover
   pulses the placement (animation §7.3), Data scope-chips hover-highlight placements
   (data §A5), FeedsField options hover-highlight targets. On phone these carry real
   information (which placement is which) and silently vanish. Fix: specify tap-and-hold
   or on-selection flash as the touch substitute in each doc (one line each).

Otherwise phone parity is genuinely thorough — every surface I checked (timeline sheet
with long-press retime, Members paint chip, exhaust re-target sheet, LUT 2×2 cards,
Import Review accordions, project manager sheet, touch nudge/rotate steppers closing the
v1 TransformHud gap, iOS zip-primary export) has a concrete, non-hand-waved variant.

---

## 4. User-friendliness / BRIEF-alignment notes

- **BRIEF asks satisfied**: modifier hints (modifierStore + providers, with the exact
  "[⌥] Duplicate" example), slim 0.125rem bars (tokens), dense sidebars, overwriting
  status toasts + bell center, resizable/collapsible sidebars, floating bars minimized to
  exactly two with drag handles + workspace-band clamping + above-sidebars z, menus
  reorganized by kind, project manager overlay, dramatically richer animation UX
  (Members view + timeline + pose gizmo directly answer the brief's hardest complaint),
  Data mode disabled-style non-capable list verbatim.
- **Click-count deltas vs v1** (all acceptable, listing for the record): single-entity
  Duplicate moves from a 1-click floating button to ⌘D/⋮-menu/Edit-menu (compensated by
  ⌥-drag + offset-duplicate); History jump 1→2 clicks (compact ↶↷ retained); Part Data
  button → mode key `3` (same or better); layers popover → always-visible Outliner
  (better); SubPart browser click-to-add → double-click (deliberate accident-fix, phone
  already behaved this way).
- **F5** (lighting sliders in a modal) is the only flow I'd flag as a real ergonomic
  regression against v1; fix is one sentence.
- Esc-ladder, confirm policy, and the two-gesture browser commit are all *more* coherent
  than v1; no depth violations of the ≤2-clicks law found (every command reachable via
  menu→item or menu→submenu→item; palette indexes all).

---

## 5. Verdict

**minor-fixes.** No blockers, no major feature losses, no locked-decision or constitution
violations. Apply: F1 (edit-chord scopes — the one finding that would generate real user
bug reports), C1–C5 amendments, the phone chip/cancel fixes, and the C6/C7 editorial
pass. After those, the corpus is implementation-ready.

---

## Finalization changelog

Applied by the design finalizer (2026-08-04). Every finding below was resolved with a
surgical edit; none were rejected. "F"/"C" numbers reference the sections above.

### Feature-parity findings

- **F1 — list-focused edit chords** (⌘C/⌘X/⌘V/⌘D/⌫ dead with list focus): adopted the
  critic's mirror-binding fix. `foundation.md §11.1` gains a "List-surface edit mirrors"
  bullet (mirror `⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I` at `surface:outliner` / `surface:data-navigator` /
  `surface:engine-tree` / `surface:members`, delegating to the identical commands; bare
  keys stay excluded; list ⌘A keeps row select-all precedence); `foundation.md §11.2` and
  `design-system-services.md §4.4` gain the corresponding table rows;
  `design-build-mode.md §1.3` (Outliner), `design-data-engine-modes.md §A9` (Data
  navigator) + `§B10` (Engine tree), and `design-animation-mode.md §7.3` (Members view)
  each state their registration. Chose scope-mirrors over redefining the viewport-scope
  predicate: it keeps the arrow/bare-key exclusion untouched and the precedence story
  explicit.
- **F2 — phone active-layer chip**: added the Build/Animation `Layer: <name>` chip (tap =
  layer-picker sheet) to `design-system-services.md §8.1` and to the CondensedStatusBar
  primitive row in `foundation.md §12` (whose phone frame already drew it). v1
  MobileInspector-FAB parity restored.
- **F3 — silent nudge/rotate in Data/Engine/Surface**: adopted option (a): the rotate/
  nudge chips now render in those modes **whenever a transformable selection exists**
  (hidden only when the keys would be no-ops). Edited `design-system-services.md §1.1`
  (segment 8 shown-when), `§1.2 #8`, and the `§1.5` TransformHud delta row.
- **F4 — phone cancel for armed one-shot tools**: the CondensedStatusBar mode/tool chip
  tap now **cancels the armed tool** (marquee, measure; Exit for seat view, Done for
  paint) — spec'd in `design-system-services.md §8.1` and referenced from
  `design-build-mode.md §11.6/§11.7`; also stated in the `foundation.md §12` primitive row.
- **F5 — lighting sliders behind a centered modal**: one ergonomics guarantee added to
  `foundation.md §10.7` Scene tab: while the Scene tab is active the M dialog anchors
  right-of-center leaving ≥50% of the canvas visible, and all Scene sliders live-commit.
  No IA change (S16 stands).
- **F6 — unregistered Outliner ⌘F**: registered `surface:outliner ⌘F`
  (`outliner.expandSearch`) in `foundation.md §11.2` + `design-system-services.md §4.4`;
  `design-build-mode.md §2.5` now cites the registration (annotation kept).

### Cross-design contradictions

- **C1 — Set Picker hosting**: `foundation.md §10.11` rewritten to name `SubPartSetGrid`
  and bless TWO hosts — docked Members view for the Animation joint-membership caller
  (per animation D1/§7), M-dialog for future non-Animation callers only; `§7.2` and
  `§8.2` now route "Choose members…" to the docked Members view.
  `design-animation-mode.md §16 D1` gains a finalization note (no longer a deviation).
- **C2 — assetDb key scheme**: `design-projects-export.md §1.5` declared the SINGLE OWNER
  (scheme `pa:<projectId>:<kind>:<assetId>` + purge/sweep/duplicate mechanics; boot-purge
  bullet added there); `design-surface-assets.md §7.3` rewritten to adopt the scheme by
  reference, drop its own `p<projectId>:` literal and the duplicated mechanics, and keep
  only `listProjectBlobs(projectId)` as its contributed API.
- **C3 — Data-mode entry rules**: `foundation.md §2.4` now specifies the A2 ladder
  (jump payload → restored `$dataScope` → selection-derived template scope → Part) and
  sanctions `ensureReactionsLoaded()` as a Data-entry effect;
  `design-data-engine-modes.md §A2` Exit row updated to quote the amended rule.
- **C4 — CondensedStatusBar contents**: resolved with F2 (chip added to §8.1; foundation
  frame and spec now agree; snap chip alignment included).
- **C5 — single-letter hotkeys behind dialogs**: `M` moved to viewport scope (symmetry
  with `B`); `1–5` gated `when: () => !dialogOpen`. Edited `foundation.md §11.2` (both
  rows) + §11.1 (assertion sentence) and `design-system-services.md §4.4` (both rows) +
  `§4.5` (registry test now asserts no bare-letter/digit binding is enabled while
  `$openDialog` is set).
- **C6 — MaterialDialog "stacked view" wording**: `foundation.md §8.5` reworded to
  "overlay dialog here; pushed view only when opened inside the Asset Manager (surface
  design D9)".
- **C7 — doc-sync bundle**, all four folded into foundation: (1) File ▸ Import Project…
  now shows the Merge-vs-Open-as-new destination radio (§3); (2) §10.7 Scene tab lists
  the `$simulateGlass` mirror; (3) §13 `layoutStore` shape gains `floatHidden`
  (Window ▸ Tool Bar); (4) §2.6 tool union + table gain `member-paint` and `pivot-pick`
  (Animation-only rows with status segments and Esc behavior).

### Phone-parity findings

1. Active-layer chip — fixed (F2/C4 above).
2. One-shot tool cancel — fixed (F4 above).
3. Hover-only affordances: touch equivalents specified — Members-view rows flash on
   check-toggle + long-press pulses without toggling (`design-animation-mode.md §7.3`);
   Data scope-chips / instance pickers / FeedsField options flash on selection with a
   phone-only "Show →" eye for re-flashing (`design-data-engine-modes.md §A5`).

No finding was intentionally rejected. All fixes stay inside DECISIONS.md and the
foundation's IA laws; foundation amendments (C1, C3, C5, C7) are the deliberate
"escalate, not improvise" resolutions the areas had requested.
