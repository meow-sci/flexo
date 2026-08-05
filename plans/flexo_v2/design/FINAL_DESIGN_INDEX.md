# flexo v2 — FINAL DESIGN INDEX (post-critique, authoritative)

Status: **finalized**. The corpus below is the complete, internally consistent v2 design:
one binding foundation spec plus six area designs, audited by an adversarial
completeness/coherence pass (critique.md — verdict `minor-fixes`) and amended in place by
the finalizer (see "Finalization changelog" in critique.md for every finding → edit).
flexo v2 is a ground-up UI redesign of the browser 3D part editor for KSA around five
task modes — **Build** (default) / **Animation** / **Data** / **Engine** / **Surface** —
inside a fully docked shell (slim menubar, resizable/collapsible left focus-editor and
right mode-primary sidebars, bottom-docked Animation timeline, slim status bar that
absorbs toasts/HUDs/progress plus a bell notification center), with exactly two floating
windows (Tool bar, Chain palette), a single command registry driving the menubar / ⌘K
palette / hotkeys / Help from one dataset, a rich Project Manager over id-keyed IndexedDB
storage with `.flexo.tar.gz` archives that carry binary assets, and full phone (<640px)
parity via a bottom mode-tab-bar + sheet system. Every v1 feature has a named v2 home
(RULE ZERO), all LOCKED decisions in DECISIONS.md are honored verbatim, and the
constitution rules (numeric drafts, undo enrollment, layering, no-migration, imperative
toast, chain non-modality, dark-only, on-demand rendering) are restated as binding in
each doc.

Reading order for implementers: `foundation.md` first (LAW — shell contract, §17 build
order), then the area doc for whatever you're building; `design-system-services.md` is
the cross-cutting service layer every area plugs into.

---

## Per-document table of contents

### foundation.md — THE FOUNDATION SPEC (binding LAW)
| § | Contents |
|---|---|
| 0 | Ground rules: terminology (Entity/Asset/Aid/Tool/Surface), the four IA laws, synthesis decision log S1–S30 |
| 1 | Docked layout skeleton, region rules, density/typography tokens, z-index ladder |
| 2 | The mode machine: five modes, switcher, what a switch changes, entry/exit invariants (incl. the Data scope ladder + sanctioned reactions preload), cross-mode jumps, transient-tool table (measure / seat-view / exhaust / marquee / member-paint / pivot-pick) + chain session |
| 3 | Menubar — complete tree (File / Edit / Add / Select / View / Tools / Window / Help) |
| 4 | Command registry & MenuSpec mechanics |
| 5 | Status bar segments; toast → status/notification routing; notification center |
| 6 | Floating surfaces policy: FloatingWindow primitive, the two tenants, v1 death list |
| 7 | Left sidebar framework ("focus editor") per mode |
| 8 | Right sidebar framework ("mode primary") per mode |
| 9 | Timeline dock overview |
| 10 | Overlay dialog framework: conventions, Project Manager, Asset Manager, Import Review, Help, Export to KSA, Settings (incl. Scene-tab look-dev guarantee), small dialogs, project import/export, catalog browsers, SubPartSetGrid hosting (docked Members view for Animation; M dialog for future callers) |
| 11 | Hotkey architecture: scoped registry, full binding table, list-surface edit mirrors, palette, Esc ladder, Help |
| 12 | Phone adaptation framework (primitives + frame) |
| 13 | Shell state architecture (stores, persistence, undo rules) |
| 14 | Interaction conventions (selection, drags, confirm policy, density, rendering) |
| 15 | Desktop wireframes (all five modes) |
| 16 | RULE ZERO ledger — every v1 feature → v2 home |
| 17 | Implementability notes (six-step build order; area extension points) |

### design-build-mode.md — Build mode + shared selection/left-sidebar experience
| § | Contents |
|---|---|
| 0–1 | What Build is; stable-id selection model, viewport click rules, list selection (+ edit-chord mirrors), marquee box select |
| 2 | The Outliner: layer header rows, layers data model (color, per-project view state, pinned built-ins), entity rows, fuzzy search (⌘F registered), Aids section |
| 3 | Left focus editor: per-kind inspectors (SubPart/connector/collider/seat/light/kitten), multi-select panel, aid editors, tool parameter cards |
| 4 | Gizmo & Tool bar (W/L gizmo-space toggle, snap UI) |
| 5 | Viewport: ⌥-drag duplicate, nudge/rotate, camera (F/snaps/reset), View menu + Display Filters, drop-to-import |
| 6 | The Add experience: Add menu, SubPart/Part browsers (preview-first gestures, facets, cap indicator) |
| 7 | Duplicate-with-offset, clipboard (+lights, +Cut), delete policy |
| 8 | Transient tools in Build (measure, seat view, box select) |
| 9 | Chain sessions (floating window, guards, ops, one-undo apply) |
| 10–15 | Status bar instantiation; phone variants (incl. tool-chip cancel); store sketches; undo/persistence table; declared foundation extensions; parity table |

### design-animation-mode.md — Animation mode end-to-end
| § | Contents |
|---|---|
| 0–2 | Pain ledger; vocabulary (clip/column/pin/park/anchor); shell integration + mode choreography |
| 3–4 | Data model (per-channel easing schema) ; animationStore v2 atoms/actions |
| 5 | Timeline dock: dopesheet, column model, pointer table, exact-easing-split insert, transport, rest-anchor exposure, keyframe clipboard, canvas perf, zoom |
| 6 | Right navigator: Clips / Joint tree / Easing overview / Solar tracking |
| 7 | **Members view** (docked SubPartSetGrid): layout, layer sections, member painting, ineligibility, tints, touch equivalents |
| 8 | Left focus editor: clip card, joint card (members/pivot/pose/working-pivot/easing), keyframe card |
| 9 | Viewport: PoseGizmo (rings/free-drag/axis-lock), pickable joint markers, explicit pivot tool anchored at restAnchorTime, motion trajectories, posed-lock feedback |
| 10 | Playback state machine (rest/park/pin, spring/latch scrub) |
| 11 | Diagnostics (computeClipIssues), export contract, KSA import (per-channel fit, CubicSpline flag) |
| 12–18 | Hotkeys (mode + timeline scopes); status/menu contributions; phone; undo matrix; deviations (D1 now foundation-blessed); parity; implementation notes |

### design-data-engine-modes.md — Data mode & Engine mode
| § | Contents |
|---|---|
| 0 | Headline decisions D1–D17 (left-form navigation, passthrough viewer, hidden fields exposed, validation surfacing, module tree, per-rocket perf, solid curve, propellants home, wiring home, connector caps, dual-route deaths, SRB guidance, units, plumes, 5091 parity, EVA SeatId) |
| A | Data mode: navigator (capable vs disabled-style rows), scope forms (every Part/template field), structural scope chips (+touch flashes), passthrough viewer, validation strip, phone, hotkeys (+ data-navigator mirrors), undo table |
| B | Engine mode: entry/exit, navigator (scope select, define-new, module tree, issues, exhaust), module editors (combustor/nozzle/solid trio/rocket/controller/wiring/gimbal/propellant), reaction picker, performance card, exhaust tool, phone, stores, hotkeys (X, ,/.), undo table |
| C | Cross-cutting: dual-routes death ledger, deviations (none), invariant checklist |
| 6 | Parity tables (data / engine / lights-data) |

### design-surface-assets.md — Surface mode & Asset Manager
| § | Contents |
|---|---|
| 0 | Decisions D1–D12 (creation entries, glow-paint upgrades, byte policy, settings homes, per-project namespacing adoption, kitten meshes listed, built-in surface card, jump-not-stack, MaterialDialog hosts, unplaced-mesh chip, 0.01-scale trap, template-scoped face highlight) |
| 1 | Surface mode: sub-state, entry points, right-sidebar picker + full surface editor (identity/material/faces/glow/visor/imported), left face card + built-in card, viewport face pick/highlight, GlowPaintDialog (stroke undo), hotkeys, undo table |
| 2 | Asset Manager: two-pane layout, thumbnails (shared offscreen renderer), per-item details, empty states, where-used graph, orphan review, phone |
| 3 | Import pipeline: Drop/Review/Importing views, structural sticky-vs-per-import split, report → notification, kitten part-ify |
| 4–5 | Live preview == export contract; deletion & byte policy (one warning string) |
| 6–9 | v1 surface death list; store sketches (assetDb scheme adopted by reference from projects §1.5; `listProjectBlobs` API); interaction quick-ref; parity table |

### design-projects-export.md — Projects, persistence, archive, Export to KSA, sharing
| § | Contents |
|---|---|
| 0 | Decisions D1–D15 (stable ids, IDB layout, awaited boot, history persistence, Web-Locks multi-tab, v1 purge, `pa:` asset namespacing — single owner, USTAR archive, import destinations, share-link rule, lazy Assets XML, mods-folder home, wiki app, mismatch demotion, thumbnails) |
| 1 | Storage model: identity, IDB stores + ProjectMeta, autosave + loud failure, multi-tab, asset namespacing contract (§1.5 — owns the key scheme), thumbnails, boot sequence v2, undo/persistence rules |
| 2–3 | Project Manager overlay (cards, actions, inline delete strips, phone); small dialogs |
| 4 | `.flexo.tar.gz` archive: format, export flow, import flow (Merge default / Open-as-new) |
| 5 | Share links (asset-less; explain + archive offer) |
| 6 | Export to KSA: pre-flight jump links, non-blocking policy, grant row, lazy Inspect-XML tabs, phone |
| 7–9 | Mods-folder menu; wiki app untouched; mismatch notification / Reset Everything / About / Settings IA |
| 10–14 | Commands table; store sketches; phone parity; foundation alignment; parity tables |

### design-system-services.md — Status bar, notifications, palette, hotkeys, help, windows, kit
| § | Contents |
|---|---|
| 0 | Service inventory & ownership |
| 1 | Status bar final spec: geometry, 11 segments (selection-following rotate/nudge chips), statusStore, modifier hints/held-key store, absorbed-surface deltas, advisories |
| 2 | Notifications: routing table, toast() facade + full call-site classification, center popup, absorptions |
| 3 | Command palette: surface, data source, fuzzy matcher, recents, chain integration |
| 4 | Hotkey system v2: registry shape, scope activation, typing guard, complete binding table (with owners/migrations, list mirrors, dialog gating), conflict detection (+ dialog assertion), Esc-ladder implementation |
| 5 | Help & onboarding (generated shortcuts dialog, About, cheat-cards) |
| 6 | FloatingWindow primitive: API, clamping, z/stacking, persistence, tenants |
| 7 | Kit & density: tokens, xs tier, zIndex.ts, usePointerDrag/ResizeHandle, DialogViewStack/InlineConfirmStrip/CopyDownloadBar, wash tokens, ColorField, GridList notes |
| 8 | Phone: CondensedStatusBar (mode/tool chip with tool-cancel tap + active-layer chip), touch steppers, other mappings |
| 9–11 | Stores & boot; parity table; implementation sequencing |

---

## Consolidated v1 → v2 feature parity assertion (RULE ZERO)

**Assertion: every v1 feature has a named v2 home; no feature was cut.** The 12 analysis
reports under `../analysis/` are the feature census of record. Each design doc carries an
exhaustive per-area parity table mapping every census line to its v2 home:

| Census area | Parity table |
|---|---|
| Shell/menus/dialogs/toasts/hotkeys/mobile shell | foundation.md §16 (master ledger) + design-system-services.md §10 |
| Catalog/placement/layers, selection/transform, viewport/scene, chains | design-build-mode.md §15 |
| Animation (clips/joints/keyframes/pose/easing/preview/import/export) | design-animation-mode.md §17 |
| Part/SubPart GameData, engines, lights-data | design-data-engine-modes.md §6.1–6.3 |
| Custom assets (textures/materials/meshes/imports/glow/kitten) | design-surface-assets.md §9 |
| Project management, export/integration, persistence touchpoints | design-projects-export.md §14 |

The adversarial critique walked all 12 census inventories against these tables and found
**zero cut features** (critique.md §1 "Parity confirmations"). The three partial-parity
regressions it did find are now fixed in place: list-focus edit chords (mirror bindings),
the phone active-layer chip (CondensedStatusBar), and posture-chip feedback for
nudge/rotate outside Build/Animation (selection-following chips). Deliberate
behavior-not-capability changes are individually logged where they occur (e.g. browser
preview-first commit gestures — foundation §10.10; clip rows no longer close on re-click
— animation D3; duplicate lands offset — LOCKED #7). All LOCKED decisions and
constitution rules hold corpus-wide.

---

## Consolidated hotkey table (post-fixes — AUTHORITATIVE)

Precedence: `surface > tool > mode > viewport > global`. Global is suppressed only while
typing; overlay dialogs suppress viewport scope but not global; viewport scope requires
no dialog, not typing, and focus outside interactive collections — with **modifier-chord
edit mirrors** registered at the selection-carrying list surfaces (foundation §11.1).

| Scope | Keys | Action |
|---|---|---|
| global | `1 2 3 4 5` | switch mode — gated `when: !dialogOpen` |
| global | `⌘K` | command palette |
| global | `⇧⌘K` | Begin Action Chain (switches to Build; discard-confirm on conflict) |
| global | `⌘Z` / `⇧⌘Z` / `⌘Y` | undo / redo (label flash from the command) |
| global | `⌘O` / `⇧⌘A` / `⌘E` / `⌘,` | Projects… / Asset Manager… / Export to KSA… / Settings… |
| global | `⌘S` | no-op → "Autosaved ✓" flash |
| global | `?` | Keyboard Shortcuts (useKey, layout-agnostic) |
| global | `⌥[` / `⌥]` | toggle left / right sidebar |
| global | `Esc` | the 9-rung ladder (foundation §11.4) |
| viewport | `W/S` `A/D` `Q/E` | rotate selection about cycling world-axis pairs |
| viewport | `R` | cycle rotate-axis mapping |
| viewport | `[` / `]` | rotate step smaller / larger |
| viewport | `↑↓` `⇧↑↓` `←→` `⇧←→` | nudge / ×5 / cycle nudge axis / cycle step |
| viewport | `F` | Frame Selection (frame-all fallback) |
| viewport | `T` / `⇧T` | cycle gizmo tool Move→Rotate→Scale |
| viewport | `B` | arm box-select (marquee, one-shot) |
| viewport | `M` | arm measure point-to-point (viewport-scoped — C5 fix) |
| viewport | `⌘A` / `⌥⌘A` / `⇧⌘I` | select all / deselect / invert |
| viewport | `⌘C ⌘X ⌘V ⌘D` `⌫` | copy / cut / paste-in-place / duplicate-with-offset / delete |
| mode:animation | `Space` · `,` `.` · `K` · `Esc` | play/pause · prev/next keyframe · insert key at playhead · unwind (rung 7) |
| mode:engine | `X` | toggle exhaust-placement tool |
| tool:exhaust | `,` / `.` · `Esc` | cycle exhaust target · disarm (rung 5) |
| tool:seat-view | `Esc` | exit seat view (rung 8; never preventDefault) |
| surface:timeline | `←→` `⇧←→` · `⌘A ⌥⌘A` · `⌘C ⌘X ⌘V ⌫` · `=` `-` · `F` `⇧F` · `Esc` | frame-step / snap-to-key · column select · keyframe clipboard · zoom · fit clip/selection · clear column selection |
| surface:chain | `⌘↩` / `Esc` | apply / cancel (confirm ≥1 step; rung 6) |
| surface:palette | `↑↓ ↩ ⌘↩ Esc` | navigate / run / run-keep-open / close (rung 3) |
| surface:outliner | `⌘F` · `Enter/Esc` (rename) · edit mirrors | expand search · commit/cancel inline rename · see below |
| surface:outliner · data-navigator · engine-tree · members | `⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I` | mirrors of the viewport edit/select commands (list-focus parity; each list's own ⌘A keeps row select-all precedence) |
| surface:glow-paint | `⌘Z` / `⇧⌘Z` | per-stroke paint undo / redo |
| field-local (static Help) | arrows, `⇧`×10 / `⌥`×0.1, `Enter`, `Esc` | numberDraft numeric-field keys |
| pointer modifiers (static Help) | `⇧-drag` marquee add · `⌥⇧-drag` subtract · `⌥-drag` duplicate · `⌃` hold = snap invert / timeline key-snap · `X/Y/Z` taps = pose-drag axis lock · `⇧`-click grow-only range · `⌘`-click toggle | gesture modifiers |

Registry invariants: no off-registry bindings; dev-time + unit-test conflict detection
over every reachable scope set; **no bare-letter/digit binding enabled while a dialog is
open**; chords render from the registry by commandId (menu/palette/Help can never drift).
v1→v2 rebind diff (documented in Help): `F` rotate-step → Frame Selection (step →
`[`/`]`); `⌘K` chain → palette (chain → `⇧⌘K`).

---

## Consolidated menubar tree (post-fixes — AUTHORITATIVE)

`[File] [Edit] [Add] [Select] [View] [Tools] [Window] [Help] ··center·· [⬚Build|▶|☰|🚀|◧] ··right·· [project chip ▾] [↶] [↷] [⌘K]`

```
File
  New Project
  Projects…                     ⌘O    → Project Manager
  Rename Project…                     → dialog (auto-suffix, never clobbers)
  ─────
  Import Project…                     → picker/paste; destination radio:
                                        (•) Merge into current (additive, ONE undo step)
                                        ( ) Open as new project
  Export Project Archive…             → .flexo.tar.gz (project.json + binaries)
  Share Link…                         → asset-less flow; with assets: explain + offer archive
  ─────
  Export to KSA…                ⌘E    → export dialog (Deliver mod / Inspect XML)
  Mods Folder ▸                        status row · Choose Folder… · Re-grant Access · Forget Folder… (confirm)

Edit
  Undo <label> ⌘Z · Redo <label> ⇧⌘Z/⌘Y · History ▸ (jump list)
  ─────
  Cut ⌘X · Copy ⌘C · Paste ⌘V · Duplicate ⌘D (with offset) · Delete ⌫
  ─────
  Begin Action Chain…          ⇧⌘K
  Scale Everything…
  ─────
  Settings…                     ⌘,

Add   (entity items auto-switch to Build; land on active layer at origin; select + reveal)
  SubPart… · Built-in Part…
  ─────
  Connector · Collider ▸ (Box/Sphere/Cylinder/Capsule · Fit to Selection ▸) · IVA Seat ·
  Light ▸ (Spot/Point) · Kitten ▸ (Hunter/Polaris/Banjo)
  ─────
  Primitive Mesh… · Import Model… · Custom Mesh Instances ▸ (dynamic) ·
  Upload Texture… · New Material…
  ─────
  Make Kitten Mesh ▸ (Hunter/Polaris/Banjo)
  ─────
  Define Engine…                      → Engine mode, new-engine picker

Select
  All ⌘A · Deselect ⌥⌘A · Invert ⇧⌘I · All in Active Layer · By Layer ▸ (dynamic)
  ─────
  Box Select                     B

View  (view state only; numerics live in Settings; menu radios and Settings edit the same stores)
  Frame Selection F · Reset Camera · Camera Snap ▸ (6 directions, selection-centroid orbit)
  ─────
  Grids ▸ (✓Floor/XY/YZ · Grid Settings…) · Hide Interior ✓ · Environment ▸ (9 presets) ·
  Show Sky Background ✓ · Scene Lighting… (deep-link) · Light Coverage ▸ (Selected/All/Off) ·
  Live Light Preview ✓
  ─────
  Display Filters ▸ (✓ per entity kind — Build area addition)
  Motion Trails ▸ (◉ Selected/All/Off — Animation area addition; disabled outside Animation)
  ─────
  Measurement Overlays ▸ (✓BBox · ◉World/Oriented · ✓Per-mesh Dims · ✓Distance) · Units ▸ (m/cm/mm)
  ─────
  FPS Counter ✓

Tools
  Measure Point-to-Point M · Add Reference Line · Add Reference Container ▸ (Box/Cylinder/Sphere)
  ─────
  Collider Coverage Check · Sit in Seat ▸ (dynamic · Exit Seat View)
  (reserved: Calculators…)

Window
  Left Sidebar ⌥[ ✓ · Right Sidebar ⌥] ✓ · Timeline ✓ (Animation only) · Tool Bar ✓ ·
  Reset Window Layout
  ─────
  Asset Manager… ⇧⌘A · Notifications…

Help
  Search Commands… ⌘K · Keyboard Shortcuts… ?
  ─────
  About flexo… · flexo on GitHub
```

Reset Everything 🔥 lives only in Settings → Advanced (+ the build-mismatch notification
action). No burger menu, no Save item (autosave-only; ⌘S flashes "Autosaved ✓"). Below
~900px width the eight menus collapse into one `☰ Menu` drill-down rendering the same
MenuSpec — the identical tree serves the phone MenuSheet and feeds the ⌘K palette.
