# flexo v2 — DATA MODE & ENGINE MODE (end-to-end design)

Status: area design, built strictly on `design/foundation.md` (LAW). Feature census:
`analysis/part-data-gamedata.md`, `analysis/engines.md`, `analysis/viewport-scene-view.md`
(lights data), `analysis/shell-layout.md`. All LOCKED decisions honored; RULE ZERO parity
tables in §6.

---

## 0. Headline decisions (the ones the task delegated)

| # | Question | Decision |
|---|---|---|
| D1 | Data mode editing surface: left-sidebar sections vs right master-detail | **Left-sidebar section stack** (foundation §7.3 / Law 3), density resolved by **scope splitting + section-jump navigation**: the right navigator's scope rows expand to *section child rows* that jump-scroll-and-expand the matching left section. No fullscreen modal anywhere; the viewport is always visible. The left sidebar's 220–480px clamp is sufficient for every form (widest = the 4-column LUT grid at ~460px; a one-time "widen sidebar" hint shows if the LUT renders under 380px). |
| D2 | Passthrough (RawXmlNode) | **Read-only tree viewer** ("Passthrough XML" section at both scopes). Copyable, never editable — trust win without inviting hand-editing. `customMassExtras` and connector `<Sibling>`/`<Aligned>` raw refs surface here too. |
| D3 | Hidden modeled fields | **Expose all three**: `extraDiametersM` becomes an editable "Additional size classes" list under Identity; `Tank.roleAffinity` (select) and `Tank.locationAsmb` (Vec3) appear under a per-tank "Advanced" disclosure. Beyond-parity, low-risk (plain modeled scalars already round-tripped). |
| D4 | Validation surfacing | Three coordinated surfaces: (a) always-visible **validation strip** pinned at the bottom of each mode's right sidebar, (b) **status-bar issue chip** (mode-specific segment) `⚠ 1 block · 2 warn`, (c) **click-through**: clicking a finding sets scope/module, expands the section, scrolls to and flashes the offending card/field. One findings store per mode feeds all three. |
| D5 | Engine navigator vs 1806-line scroll | **Module tree (right) / single-module editor (left)** per S18. Exactly one module's fields are on screen at a time; the tree carries issue dots, counts, and add-buttons. `EngineSections.tsx` splits into `src/ui/engine/*` per module kind. |
| D6 | Per-rocket performance aggregation | **Yes.** Performance card gets a `Rocket:` select (each `<Rocket>` in the active scope + "First pair" legacy fallback when no rockets exist). Metrics aggregate over the rocket's bound chamber+nozzle pairs (Σ thrust, Σ mass flow; Isp = ΣF / (g0·Σṁ)). `predictPerformance` untouched (verbatim-port invariant); aggregation is presentation-level summation. |
| D7 | Solid thrust-curve preview | **In scope, severable.** A `SolidThrustCurveCard` (thrust-vs-time sparkline from the grain profile) renders under Performance when the scope has a solid motor. Requires the ~200-line `SolidMotor.TrySampleThrustCurve` port; until it lands the card renders the "preview unavailable — engine still exports correctly" hint pattern already used for the missing catalog. |
| D8 | Custom propellants home | **Engine mode is the sole home** (module tree group). They are `$part.customReactions` — undoable project-document data exported as top-level `<FixedReaction>` — not binary library assets; the Asset Manager stays textures/materials/meshes only. |
| D9 | ConsumerFeedWiring home | **Inside Engine mode** (LOCKED #1) as a module-tree group, AND mirrored in Data mode's Wiring section — both render the same `FeedWiringEditor` component, so there is one implementation with two mode entrances (see D11 for why this one duplication survives). |
| D10 | Connector capabilities | Stay editable ONLY in the Build connector inspector (one editor per field). Data mode (Wiring) and Engine mode (Feed wiring) show a read-only **Capabilities summary card** — each connector with its capability chips and an "Edit in Build →" jump that switches modes with the connector selected. Plumbing is co-visible without dual editors. |
| D11 | Dual-editing-routes resolution | **The modals die**: `PartDataButton` (Part Data fullscreen modal) and `ManageTanksModal` (SubPart Data modal) are deleted. Data mode is the canonical GameData surface; Engine mode is the canonical engine-hardware surface. The *only* deliberate remaining overlap: engine hardware sections reachable from both modes render the **identical editor components** with a cross-link banner ("Also editable in Engine mode →" / "…in Data mode →"), so the two views can never diverge in capability. From Build, selection/Outliner expose jumps only ("SubPart Data →", "Edit Engine →") — never editors. |
| D12 | SRB guidance | The "Define new engine ▸" menu offers **Liquid rocket / RCS thruster / Solid motor / SRB preset (legacy)** with one-line descriptions inline in the menu. "Solid motor" is a NEW one-step composite (`addSolidEngine`) creating real `<SolidMotor>` hardware; the legacy approximate preset is retained (parity) and explicitly labeled + explained. |
| D13 | New-engine picker granularity | **Per-template rows** (fixes v1's per-placement duplication). A multi-placed template gets an instance sub-pick for the controller reference (defaults to first placement). |
| D14 | Unit presentation | Standardized: **all angles display degrees** (solar-panel orientation converts at the field boundary — stored radians unchanged), pressures display bar (stored Pa), cone angles labeled "half-angle". A `°`/`bar` unit suffix renders inside every such field. |
| D15 | Reaction-keyed `<ReactionPlume>` (gap P1) | **Exposed, severable**: nozzle editor gains a "Plume entries" disclosure listing ALL `<ReactionPlume>` entries (Default flag / reaction select, plume select, trail select, add/remove). The existing default-entry quick selects stay as the fast path and edit the Default entry exactly as today. |
| D16 | 5091 warning parity (gap Q4) | Recommended companion: `validateEngines` adopts the five 5091 warnings (controller-no-rockets, rocket-no-nozzles, orphan nozzle, orphan core, unresolvable feed point). UI needs zero changes — they flow through the same findings pipeline. Severable. |
| D17 | EVA Door `SeatId` (5117 drift) | Coupling card gains a Seat select (document-order seat list, "(default)" sentinel). Closes a scope-doc drift gap; flagged as a game-contract change for scope/ + docs/ updates. Severable. |

---

# PART A — DATA MODE

## A1. Purpose & mental model

Data mode answers: *what does KSA know about this part beyond its geometry?* Two scope
kinds, structurally split:

- **Part scope** — `<PartGameData>`: identity, mass, part-level tanks, power, coupling,
  wiring, advanced engine hardware, passthrough.
- **Template scope** — one `<SubPartGameData>` per SubPart *template*: tanks, lights,
  solar panels, engine (thrust chamber), passthrough. Shared by every placement of the
  template — stated structurally, not in prose (§A5).

Vocabulary (foundation §0.1, binding): KSA `<Tank>` feed targets are **"tanks / feed
containers"**; the wireframe volumes are **"reference containers"** and live exclusively
under Build's Aids section — they never appear in Data mode. The Tanks section is titled
**"Tanks (feed containers)"** to cement it.

## A2. Entry / exit

| Path | Behavior |
|---|---|
| Mode switcher / `3` / palette "Go to Data mode" | Enter; restore last `$dataScope`, else: selection contains a SubPart → that template's scope; else Part scope (foundation §2.4). |
| Build SubPart inspector "SubPart Data →" / Outliner row ⋮ "SubPart Data →" | Jump with context: `setMode('data', {scope: {kind:'template', templateId}})`. |
| Palette dynamic provider | "Edit data: \<template\>" per data-capable template; "Edit part data" for Part scope. |
| Data → Engine links | Wiring/Advanced section headers + template Engine section header carry "Open in Engine mode →" (activates the matching engine scope). |
| Exit | Any mode switch. No exit effects (foundation §2.4: Data has no effects beyond the entry scope ladder + the sanctioned `ensureReactionsLoaded()` preload). `$dataScope` survives for return, clamped against `$part` (template deleted → falls back to Part scope). |

Viewport in Data mode: selection, gizmo, camera, marquee all work normally (selection is
cross-mode context). Extra affordances: placements of the scoped template get a highlight
tint; clicking a **SubPart** in the viewport also retargets `$dataScope` to its template
(Select-in-3D both directions); clicking a non-capable entity selects it normally and the
status message channel shows "Connectors have no SubPart data — edited in Build mode".

## A3. Right sidebar — the Data Navigator (`DataNavigator`)

```
┌────────────────────────────────┐
│ ☰ DATA          🔍 [search…]   │  ← mode header + fuzzy search (filters rows)
│────────────────────────────────│
│ ▾ ▣ Part — "Rover"    ⚠1      │  ← part root, pinned top; expand = section rows
│     Identity                   │
│     Mass                       │
│     Tanks (feed containers) ②  │  ← count badges; click = jump to left section
│     Power ③                    │
│     Coupling ①                 │
│     Wiring ⚠ ②                 │  ← issue dot when findings target the section
│     Advanced                   │
│     Passthrough ④              │
│ ── SubPart templates ─────────│
│ ▸ ▣ TankB ×2      ⛁2 ☀1       │  ← capable, has data: content badges
│ ▸ ▣ ThrusterA ×1  🚀 ⚠1       │
│   ▣ NoseCone ×3   ＋ add data  │  ← capable, empty: add-data affordance
│ ── not data-capable ──────────│
│   ◌ connector_1                │  ← disabled style + tooltip
│   ◌ collider_1                 │
│   ◌ Seat 1 · Seat 2            │
│   ◌ light_1 (part-level)       │
│   ◌ kitten_1                   │
│────────────────────────────────│
│ ⚠ 1 block · 2 warnings      ▾ │  ← validation strip, pinned bottom (§A7)
└────────────────────────────────┘
```

Row spec (GridList, single-selection = the scope; `xs` density):

- **Part root row** — pinned first, never filtered out. Chevron expands section child
  rows (the 8 Part-scope sections with count badges: tanks / power modules / coupling
  modules / wiring entries / advanced modules / passthrough node count). Selecting the
  row scopes the left panel to Part; clicking a section child row scopes to Part AND
  fires a section-jump (§A4 header). Issue dot ⚠ on the row and on offending sections.
- **Template rows** — one per SubPart template with ≥1 placement (built-in or custom
  mesh; glass templates included — they are data-capable). Label = template id, `×N`
  placement count, content badges (⛁ tanks, 💡 lights, ☀ solar, 🚀 engine — count in
  chip). Chevron expands to that scope's section child rows (Tanks / Lights / Solar /
  Engine / Passthrough). Hovering a row highlights its placements in the viewport.
- **Capable-but-empty rows** — normal style, no badges, trailing **"＋ add data"**
  button → menu: `Add tank · Add light · Add solar panel · Add engine (thrust chamber) →`.
  First three create the `SubPartGameData` entry + first item (one undo step:
  "add \<thing\>") and scope to it with the section expanded; the engine item jumps to
  Engine mode's define-new flow seeded with this template (D12).
- **Non-capable group** — one row per non-SubPart entity instance (connectors, colliders,
  IVA seats, part-level lights, kittens), `◌` prefix, disabled-style (reduced opacity,
  not focus-skipped — tooltips must be reachable). Tooltip explains + offers a jump:
  "Connectors are Build entities — capabilities & flags are edited on selection.
  \[Select in Build →\]". Rows are collapsible as a group ("not data-capable (7)").
  This is the BRIEF's required disabled-style list, verbatim.
- **Search** — fuzzy subsequence over template ids + section names; Part root and the
  validation strip never filter out; non-capable rows filter like the rest.
- **Empty state** (no placements at all): Part root + "Place SubParts in Build mode to
  give them tanks, lights, solar panels or engines. \[Go to Build\]".

## A4. Left sidebar — scope forms (`DataScopeForm`)

Header (sticky): scope title ("Part — \<display name or Part Id\>" / "Template —
\<id\>"), scope chip (§A5), overflow ⋮ (Part scope: Copy Part Id, Open in Engine mode →;
Template scope: Select placements in 3D, SubPart Data jump-back n/a, Delete all data…
(confirm; one undo step)). Below: **section chip strip** (sticky, horizontally scrollable)
mirroring the navigator's section rows — clicking a chip scrolls to + expands that
section (same jump intent as the navigator child rows).

Body: collapsible `SidebarSection`s, sticky headers, `xs` density. Default-expanded =
sections with content + Identity; empty sections collapsed with "＋" affordance in the
header. All numerics `PreciseNumberInput` (`useNumberDraft` + `inputMode="url"`);
streaming undo on interaction start; discrete actions self-push (unchanged conventions).

### A4.1 Part scope — sections & every field

**Identity** (defaultExpanded)
- Part Id — mono TextField → `setPartId` (streaming).
- Display Name — TextField → `setDisplayName`; helper "blank ⇒ Part Id used in-game".
- Editor Tags — `EditorTagsField` unchanged (chips + "Add tag…" popover; Categories vs
  Functional grouping; free-form entry preserved; popover stays open across adds).
- Size class (Diameter) — Switch + PreciseNumberInput (m) → `setDiameterEnabled` /
  `setDiameter`; helper "VAB filter only, no physics".
- **Additional size classes** (D3, new) — editable number list (add/remove/edit) over
  `extraDiametersM`; helper "extra `<Diameter>` entries — adapters match several racks".
- Command capable — Switch → `setControllable`.

**Mass** (defaultExpanded)
- Custom mass override — Switch + Mass (kg) → `setCustomMassEnabled` / `setCustomMass`.
- Preserved-inertia chip (D2): when `customMassExtras` non-empty, read-only chip
  "carries N preserved elements (`<MassSpecificInertia>`…) → view in Passthrough".

**Tanks (feed containers)** (badge = count)
- Per-tank `ItemCard`: Feed id (mono; cross-referenced by feed pickers), Shape select
  (Cylindrical/Spherical), Wall material id, Length m (cylindrical only), Outer radius m,
  Wall thickness mm; card "Remove"; "+ Tank". Helper: "Part-level tanks are the only feed
  targets addressable without a `SubPart=` scope."
- Per-tank **Advanced** disclosure (D3, new): Role affinity select (KSA enum +
  "(default)"), Location offset (assembly frame) Vec3 — `Tank.roleAffinity` /
  `Tank.locationAsmb`, previously round-trip-only.

**Power** (badge = batteries+generators+solar+consumer)
- Batteries — number list (Wh), add/remove/edit. Generators — number list (W).
- Solar panels — per panel: Produced (W), Orientation Vec3 **in degrees** (D14; stored
  radians, converted at the field boundary).
- Power consumer — at most one (single `Part.LightSwitch` slot, add button disabled with
  tooltip when present): Consumed (W), "Light switch" Switch, "Starts on" Switch
  (disabled unless light switch). Contextual hints preserved verbatim: "switch controls
  nothing" warning (no lights/glow exist) / "lights always on" hint.

**Coupling** (badge)
- Decoupler — Switch creates/deletes; Connector select + Force (N).
- Docking Port — Switch; Connector select + Latching kinetic energy (J) + Pushoff
  impulse (N·s).
- EVA Door — Switch; Connector select \[+ Seat select — D17, severable\].
- `ConnectorSelect` semantics preserved: stale/deleted connector id stays selectable and
  labeled; "Add a connector in the workspace first." empty hint; NEW: a "Show →" eye
  button beside the select flash-highlights the picked connector in the viewport.

**Wiring** (badge = controllers + wiring entries + gimbals) — header link "Open in
Engine mode →"
- Controllers — `ControllerEditor` cards (§B4.7 field list; identical component).
- Feed wiring — `FeedWiringEditor` (§B4.8; identical component, incl. auto-wire).
- Gimbals — `GimbalEditor` cards (§B4.9; identical component).
- **Connector capabilities summary** (D10) — read-only card: one row per connector,
  capability chips (`BulkFluid` `SolidMotorCase` `¬Electricity` `¬ServiceFluid`
  `DecouplerJoint`, "default: Electricity + ServiceFluid" when empty), "Edit in
  Build →" per row.

**Advanced** (collapsed by default; badge)
- Solid motor (SRB) — `SolidMotorEditor` + grain segments + solid nozzle (§B4.4–B4.6
  components at part scope).
- Gas generator (part-level rockets) — part-level Combustor/Nozzle/Rocket editors with
  `InstanceSelect`s (§B4 components with `part` scope prop).
- Cross-link banner (D11): "This hardware is also editable in Engine mode →".

**Passthrough XML** (badge = preserved node count; collapsed) — §A6.

**Engine issues** — NOT a section: findings render in the validation strip + status chip
(D4) and as inline ⚠ dots on section headers. (The v1 inline `EngineIssuesPanel`
placement inside a collapsed section is retired; the panel component survives inside the
validation strip popover.)

### A4.2 Template scope — sections & fields

Scope banner (structural, §A5): `Template — shared by ×N placements  [Select all in 3D]`.

**Tanks (feed containers)** — same `TanksSection` card set as Part scope (incl. D3
Advanced disclosure), wired to the template. Helper: "Feeds address these per placement —
`TankB #1 · fuel_main` and `TankB #2 · fuel_main` are two different feed targets."

**Lights** (badge) — per light whose `ownerTemplateId` matches: Type (Spot/Point),
Position (m) Vec3, Aim rotation (°) Vec3 (Spot only; stored radians), Range (m),
Intensity, Color swatch (`ColorField`), Inner/Outer half-cone (°, labeled half-angle),
Ray tracing (IVA only) Switch, **"Select in 3D"** — now genuinely useful: selects the
light instance + reveals it while the form stays open beside the visible viewport (the
v1 modal-covers-viewport bug is structurally dead). "+ Light" adds a template-owned
light. Mutator indices remain indices into `part.lights` (filtered-view mapping
preserved). Part-level lights deliberately absent (Build entities — D10-style single
home; the navigator's non-capable light rows explain + jump).

**Solar panels** — same fields as Part scope (degrees per D14), template-scoped actions.

**Engine (thrust chamber)** (badge) — header link "Open in Engine mode →". Hosts the
identical `CombustorEditor` / `NozzleEditor` / solid trio / `RocketEditor` components as
Engine mode, rendered as a card list (all modules of this template, in order) with the
cross-link banner (D11). Shared-by-N-placements banner on nozzle cards preserved.

**Passthrough XML** — §A6, scoped to this template's `SubPartGameData` unknowns.

Empty state (template scoped but zero data): the "＋ add data" menu rendered as buttons.

## A5. Scoping made structural (no more prose banners)

One chip system, rendered on scope headers and on every card whose scope differs from
its host section:

- `[Part]` — part-level data (one per part).
- `[Template ×N]` — shared by all N placements; the header chip doubles as a button:
  hover highlights all placements, click selects them.
- `[Instance: thruster_1 #2 ▾]` — instance-scoped cards (gimbals, controller rocket
  refs, wiring consumer instances): the chip IS the instance picker (select), and
  hover/focus highlights that one placement in the viewport. Distinct card border tint.
- Feed-target options in `FeedsField` render placement-qualified labels
  (`TankB #2 · fuel_main`) with viewport hover-highlight of the placement.

The three v1 scoping rules (template-shared data, instance-keyed gimbals/wiring,
placement-addressed feeds) thus each have a *visible, interactive* representation.

**Touch equivalent** (no hover — LOCKED #6): on phone the hover-highlights become
on-selection flashes — tapping a `[Template ×N]` chip flashes all its placements before
selecting them; choosing an option in the instance chip-picker or a `FeedsField` listbox
flashes that placement/target (~600 ms, sheet stays open long enough to see it — the
"Select in 3D" sheet-dismiss rule in §A8 covers the persistent case); feed rows and
instance chips additionally get a small "Show →" eye button on phone for re-flashing a
target without re-picking it.

## A6. Passthrough viewer (`PassthroughViewer`) — D2

Read-only, both scopes. Tree rows (indent = depth): `<TagName attr="v">` mono text,
leaf text inline, chevron collapse; footer `CopyDownloadBar` ("Copy XML") serializing
the RawXmlNodes via the existing serializer helpers. Sources shown, grouped:
`unknownChildren`, `unknownAttrs` (rendered on a synthetic root row),
`customMassExtras` (labeled "inside `<CustomMass>`"). Explainer: "flexo preserves XML it
doesn't model and re-exports it verbatim. Read-only by design." Empty state: "No
preserved XML — everything on this part is modeled." Import connector-ref remapping and
allow-lists untouched (invariant).

## A7. Validation surfacing — D4

- **Store**: `$gameDataFindings = computed([$part, $allReactionIndex])` →
  `validateEngines` findings + basic id checks (blank Part Id, duplicate tank feed ids
  within a scope), each finding carrying `{severity: 'block'|'warn', code, message,
  target: {scope, sectionId, cardKey?}}`.
- **Strip** (right sidebar, pinned bottom): `⚠ 1 block · 2 warnings ▾` — expands to the
  finding list (danger group "KSA would refuse to load", warning group "Loads, but
  misbehaves" — v1 wording preserved). Clicking a finding: sets `$dataScope` to the
  target, fires the section-jump, flashes the card. Hidden when clean.
- **Status bar** (mode segment): `scope: Part · ⚠ 1 block →` — the chip clicks through
  to the first blocker. Absent when clean.
- Inline per-field warnings (mixture-ratio missing, unwired consumers, empty feeds with
  KSA's exact log text, direction length) all preserved in place — the strip aggregates,
  it does not replace.

## A8. Data mode phone variant

- **Panel sheet** (re-tap Data tab): the Data Navigator verbatim at `sm` density;
  validation strip pinned above the sheet grabber.
- Tapping a scope row closes the Panel sheet and opens the **Inspector sheet** hosting
  `DataScopeForm`; sheet header gains `‹ Scopes` (back re-opens the Panel sheet) +
  scope chip. Section chip strip works as on desktop.
- Section child rows / "＋ add data" / non-capable tooltips (tap = show tooltip +
  jump button) all function in the sheets.
- Selection FAB shows the scope name in Data mode; CondensedStatusBar shows the issue
  chip (tap → validation list as a sheet).
- "Select in 3D" closes the sheet so the highlight is visible (phone-only behavior),
  with a status flash "light_2 selected".

## A9. Data mode hotkeys & commands

- No new mode-scope hotkeys (GridList arrows already navigate the navigator; keeping
  digits/letters free). `3` switches in (global).
- The navigator registers the **list-focus edit-chord mirrors** at
  `surface:data-navigator` (`⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I` → the same edit/select commands acting
  on the entity selection — foundation §11.1), so v1's global edit chords keep working
  while the list has focus.
- Commands: `data.scopePart`, `data.scopeTemplate(templateId)` (dynamic provider —
  "Edit data: TankB"), `data.jumpSection(sectionId)` (used by chips/rows, not bound).

## A10. Undo / persistence table (Data mode)

| Interaction | Undo | Persistence |
|---|---|---|
| Any field edit (text/number/color) | streaming: one push at interaction start | `$part` → autosave |
| Add/remove tank, light, solar, power item, coupling toggle, wiring entry, gimbal, "＋ add data" | discrete: one labeled push each | autosave |
| Auto-wire unwired consumers | one push ("auto-wire consumers") | autosave |
| Scope/section selection, search, section collapse | none (ephemeral) | not persisted |
| Section collapse state | none | per-mode ephemeral (resets on reload — deliberate) |
| "Delete all data…" (template) | confirm (whole-container, §14.3) + one push | autosave |
| Passthrough viewer | n/a (read-only) | — |

---

# PART B — ENGINE MODE

## B1. Purpose & mental model

Engine mode is the **self-sufficient engine designer** (LOCKED #1): everything from
chamber thermodynamics to plumbing wiring to custom propellants, with live performance
and continuous validation, without ever leaving the mode. Right = *what the engine is
made of* (navigator); left = *the one module you're editing*; viewport = exhaust
geometry (amber physics / cyan FX handles).

## B2. Entry / exit flows

| Path | Behavior |
|---|---|
| Mode switcher / `4` / palette | Enter; restore `$activeEngineEntry` if still valid; else if selection's template is an engine scope → activate it; else if exactly one engine exists → activate it; else empty state. |
| Add ▸ Define Engine… (menubar, →M per foundation) | Enter with focus payload `{defineNew: true}` → the "Define new engine ▸" menu opens, seeded with the selected placement's template when applicable. |
| Data mode links ("Open in Engine mode →") | Enter with `{engineScope}` payload: template sections → that template's engine scope; Part Wiring/Advanced → part-level scope, module tree scrolled to the matching group. |
| Build SubPart inspector "Edit Engine →" (shown when the template carries engine hardware) / Outliner row ⋮ "Edit Engine →" | Jump with `{engineScope: templateId}`. |
| Palette dynamic provider | "Engine: \<label\>" per engine scope. |
| Exit (any mode switch) | Foundation §2.4: disarm exhaust tool, **dispose** nozzle handles (hidden-but-pickable steals clicks — census invariant), retain `$activeEngineEntry`/`$activeNozzleRef`/`$activeModule` for return. |

There is no Close button and no Esc-exits-mode: modes are switched, not closed
(v1's EngineToolbar Close dies with the sidebar-swap model).

## B3. Right sidebar — the Engine Navigator (`EngineNavigator`)

```
┌────────────────────────────────┐
│ 🚀 ENGINE  [ThrusterA ▾] [＋▾] │  ← scope select + define-new menu
│────────────────────────────────│
│ MODULES                        │
│ ▾ Combustors ①            ＋   │
│   ● Combustor 1 — Hydrolox     │  ← ● = focused in left editor
│ ▾ Nozzles ②               ＋▾  │     (＋▾ = De Laval / add solid nozzle
│   ○ Nozzle 1  ⌀1.2 m  ⚠      │      when scope has a solid motor)
│   ○ Nozzle 2  ⌀0.3 m           │
│ ▸ Solid motor ⓪           ＋   │
│ ▾ Rockets ①               ＋   │
│   ○ main — core: Combustor 1   │
│ ▾ Controllers ①           ＋▾  │  ← ＋▾ = Engine / RCS controller
│   ○ eng_ctrl (engine)          │
│ ▾ Feed wiring ②           ＋   │  ← absorbed (LOCKED #1)
│   ○ Combustor 1 ← Parent-tank  │
│   ○ ⚠ unwired: rcs_thruster    │  ← synthetic row per unwired consumer
│ ▸ Gimbals ①               ＋▾  │
│ ▸ Custom propellants ①    ＋▾  │  ← ＋▾ = Clone shipped… / Blank
│────────────────────────────────│
│ PERFORMANCE   Rocket:[main ▾]  │
│ 245.0 kN vac · Isp 445.4 s     │  ← headline; full card in §B6
│ ▁▂▄▆▇▆▃ solid curve (if solid) │
│────────────────────────────────│
│ ⚠ ISSUES  0 block · 1 warn  ▾ │  ← always visible, even when clean ("✓ no issues")
│────────────────────────────────│
│ EXHAUST  [Place in 3D ⭘]       │
│ [Nozzle1 #1][Nozzle1 #2·FX]…   │  ← chip list mirrors handles 1:1
└────────────────────────────────┘
```

### B3.1 Scope select + define-new

- **Scope select**: every engine scope from `$engineEntries` — one per SubPart template
  carrying any combustor/solid motor/nozzle/solid nozzle + "Part-level (RCS / gas
  generator)" when `gameData` carries hardware (sentinel `'\0part'` preserved). Labels =
  template id (or "Part-level"), module-count caption.
- **Define new engine ▸** (`＋▾` menu, also the empty state's primary action, D12):
  ```
  Liquid rocket        — combustor + De Laval nozzle + rocket + controller
  RCS thruster         — Service-plumbed pulsed combustor + nozzle + RCS controller
  Solid motor          — real <SolidMotor> + grain segment + solid nozzle + rocket + controller
  ──────────────────
  SRB preset (legacy)  — approximate: fixed-thrust liquid fake with sealed tank;
                         no burn curve, can shut down. Prefer "Solid motor".
  ```
  Each item opens a **target picker sub-view** (per D13): GridList of templates not yet
  engines (`template id ×N`), with an instance select when N>1 ("controller drives:
  \[#1 ▾\]"); Part-level target offered for RCS. Confirm = ONE undo step
  (`addEngine` / new `addRcsEngine` split of it / new `addSolidEngine` / `addSrbEngine`),
  adds the "Engines" editor tag, activates the scope, focuses the first module in the
  left editor. `addSolidEngine` composite: SolidMotor (APCP, library grain profile) +
  one grain segment + solid nozzle + all-solid rocket + engine controller.
- Empty states: no placements → "Place a SubPart in Build mode first \[Go to Build\]";
  placements but no engines → explainer + the define-new menu inline.

### B3.2 Module tree

GridList tree, groups in fixed order: **Combustors · Nozzles · Solid motor (motor /
grain segments / solid nozzle) · Rockets · Controllers · Feed wiring · Gimbals · Custom
propellants**. Groups render for the active scope: SubPart scope shows its
`SubPartGameData` lists; Part-level scope shows `gameData` lists. Controllers, Feed
wiring, Gimbals, Custom propellants are **always part-level** regardless of scope
(structural chip `[Part]` on the group header — same chip system as §A5).

- Row = module label + caption (combustor: reaction name; nozzle: exit ⌀; rocket: core
  ref; controller: type; wiring: consumer ← first feed; gimbal: instance label;
  propellant: category) + ⚠ dot when findings target it.
- Selecting a row focuses the left editor (`$activeModule`). ⋮ row menu: Duplicate
  (module clone, one undo step — new convenience), Remove… (§14.3 policy), and for
  nozzles "Show exhaust handle" (activates its target chip).
- Group `＋` adds a default module (discrete undo push) and focuses it. Feed wiring's
  synthetic "⚠ unwired: X" rows click through to the wiring editor with the auto-wire
  button; the group header shows the one-click **Auto-wire** action when any exist.
- Empty groups render collapsed with `⓪`.

### B3.3 Validation section (D4) — `⚠ ISSUES`

Always mounted (shows `✓ no issues` when clean — continuous confidence while authoring,
fixing v1 pain #3). Same findings list component as Data mode's strip
(`validateEngines`, block/warn wording preserved; D16 adds the 5091 warnings). Clicking
a finding selects the offending module in the tree, focuses the left editor, flashes the
field when the finding is field-addressable (mixture-ratio, direction-length, pressure
range). Status-bar Engine segment mirrors counts.

### B3.4 Exhaust section

- **"Place exhaust in 3D"** toggle → arms/disarms `$activeTool = 'exhaust'`
  (foundation §2.6: single tool slot, Engine mode only, auto-off on mode exit).
  Hidden when the open engine has no nozzles.
- **Chip list** (`ToggleButtonGroup`, height-capped + scrollable — MMU's 56 nozzles):
  one chip per resolved target = nozzle × flavor × placement × channel; labels
  `NozzleId #N` + `· FX`; exactly one active; mirrors viewport handles 1:1 (spatial
  identity, deliberately not a Select). Shared-nozzle explainer line when the active
  target's template is multi-placed ("editing through #2; all N handles move together").
- Clicking a chip or a 3D handle re-targets the exhaust gizmo without changing the mesh
  selection (v1 semantics preserved).

## B4. Left sidebar — the Module Editor (`ModuleEditor`)

Header: module label + scope chip (`[Template ×N]` / `[Part]` / `[Instance: … ▾]`) +
⋮ (Duplicate / Remove… / copy id). Dispatches on `$activeModule`:

### B4.1 No module — Engine summary card (empty/overview state)
Scope title, module counts by group, first blocker (if any) with jump, the
solid-vs-SRB-preset guidance blurb, quick actions: "+ Combustor", "+ Nozzle",
"Place exhaust in 3D".

### B4.2 `CombustorEditor` (both scopes)
Plumbing class select (Bulk / Service + connector-capability explainer microcopy) ·
**Feeds from** `FeedsField` (`allowParent`; kind select Parent/Connector/Container;
stale targets stay selectable "— not found"; empty-list danger note with KSA's exact log
text; placement-qualified container labels + viewport hover-highlight per §A5) ·
**Propellant** via the Reaction picker (§B5) · Mixture ratio (O/F by mass) — mixture
reactions only, bounded by `mixtureRatioBounds`, missing-ratio inline warning ("KSA
refuses to load the engine without one") · Chamber pressure (bar; stored Pa) · Thermal
efficiency (%) · Minimum throttle (%; helper "100 = on/off only"; clamp 1–100) ·
Min pulse time (s; 0 = none — RCS).

### B4.3 `NozzleEditor` (De Laval; both scopes)
Exit diameter (m) · Area ratio (exit/throat; min 1; **NaN-required trap surfaced
honestly**: unset renders an empty field + inline "required — KSA refuses NaN" warning
instead of v1's misleading `0`) · Flow efficiency (%) · Expansion efficiency (%) ·
shared-by-N-placements banner (template scope, N>1) · Exhaust location (m) Vec3 ·
Exhaust direction Vec3 (unit; default −X; physics explainer "direction gas LEAVES;
thrust acts along −this") with `DirectionLengthWarning` ("engine pushes N.NN× rated
thrust") + one-click **Normalize** (typed/imported values never auto-rewritten) ·
**Override FX placement** Switch (ON seeds FX pair from physics pair, OFF nulls both —
one authoring decision preserved) → sunken sub-panel: FX location Vec3, FX direction
Vec3 ("any length — visual only"), "cyan handle in the viewport" hint · FX exit diameter
(m; 0 = match exit) · Exhaust plume select + Plume trail select (fast path editing the
Default `<ReactionPlume>` entry) · **Plume entries** disclosure (D15): full
`<ReactionPlume>` list — per row: Default switch / Reaction select, plume select, trail
select, remove; "+ Entry" · Engine sound Switch · Exhaust light Switch ·
**"Place this nozzle's exhaust in 3D"** button (arms the tool targeted at this nozzle).

### B4.4 `SolidMotorEditor`
Solid propellant select (Category="Solid" only — Core + custom solids) · Grain profile
select (`GRAIN_GEOMETRY_IDS` + "(library default)") · Default chamber pressure (bar) ·
Thermal efficiency (%) · Feeds from (`FeedsField`; targets = grain segments +
`SolidMotorCase` connectors).

### B4.5 `GrainSegmentEditor`
Feed id (mono) · Casing material id · Outer radius (m) · Wall thickness (mm) ·
Length (m) · Location offset (assembly frame) Vec3.

### B4.6 `SolidNozzleEditor`
NozzleEditor body with the area-ratio slot swapped for the note "KSA sizes the throat as
exit area ÷ 12 — solid nozzles have no area ratio" (all other fields incl. FX/plume/
sound/light identical).

### B4.7 `RocketEditor` (both scopes)
Rocket id (mono) · Core combustor select (id pool mixes solid + liquid families —
mixing is caught by validation, not the picker) · Nozzle refs list: per row nozzle-id
select + (part scope) instance select with "(root part)" sentinel `'\0root'`; add/remove
rows. Inline finding echo when this rocket has a mixes-solid-and-liquid /
solid-needs-nozzle block.

### B4.8 `FeedWiringEditor` (part-level; shared with Data mode per D9)
Per entry: Consumer select over `consumerOptionsOf(part)` (combustors + solid motors,
part-level and per-placement; missing consumers stay selectable "— not found") ·
`FeedsField` with `allowParent=false` (KSA forbids Parent-deferring wiring). Warning line
counting unwired parent-deferring consumers with KSA's exact log text + **"Auto-wire
unwired consumers"** button. Below: the read-only **Capabilities summary card** (D10)
with per-connector "Edit in Build →" jumps.

### B4.9 `ControllerEditor` / `GimbalEditor` (part-level)
Controller: id (mono) · Type select (Engine = throttle+staging / Thruster = RCS pulsed)
· Rockets-driven list (rocket select over ALL rockets part-wide + "on instance" select
with root sentinel) · add/remove refs. Gimbal: per-instance card (instance chip-picker
per §A5) — Max angle Y (°, 0–90), Max angle Z (°), Constrain-to-circle Switch;
"Add gimbal to instance" select over placements without one (upsert semantics kept).

### B4.10 `PropellantEditor` (custom propellants — D8)
Name · Category select (Bipropellant / Hypergolic / Monopropellant / Solid / Thermal) ·
Reactants list (substance phase id + mass share; add/remove) · Solid burn-rate fields
when Category=Solid: coefficient a, exponent n (0 ≤ n < 0.95), min burn pressure (bar),
max stable pressure (bar), condensed fraction \[0,1) — with the hard danger banner "will
be omitted from the export" via `isCustomReactionExportable` · **Gas table (LUT)**: the
4-column grid (ln P · T K · γ · g/mol) with per-row remove, "+ Row" (clones last at
lnP+0.5), copy explainer "CEA-style pre-solved thermodynamics — flexo does not solve
chemistry". Creation paths live in the tree group's `＋▾`: "Clone a shipped propellant ▸"
(select; mixture clones bake at default O/F — KSA-combustor behavior; `uniquePropellantId`)
/ "Blank propellant". Authored propellants merge into `$allReactions` instantly and
appear in every reaction picker + drive the readout (unchanged).

## B5. Reaction / mixture picker flow

`ReactionSelect` upgraded to a searchable picker (react-aria Select → ComboBox-style
listbox, fuzzy):

- Groups: **Project propellants** (custom, first) · then catalog by Category
  (Bipropellant, Hypergolic, Monopropellant, Solid — combustors exclude Solid; solid
  motors show ONLY Solid). Row = display name + category chip + "O/F 5.5 default"
  caption for mixtures.
- Current-but-unknown id stays selectable and labeled (invariant). Catalog absent (OSS
  build) → static `KNOWN_REACTIONS` fallback list + hint row "full catalog unavailable —
  authoring and export unaffected".
- **Picking a reaction resets O/F to its `<DefaultMixtureRatio>`** (KSA-designer
  behavior, preserved) — the mixture-ratio field flashes to advertise the reset.
- Mixture ratio field: PreciseNumberInput bounded by the LUT row range, with a
  micro-slider underneath spanning the bounds and a tick at the default ratio.
  Live-updates the Performance card.
- `ensureReactionsLoaded()` moves from per-component `useEffect`s to **mode entry**
  (`setMode('engine')` choreography — also fired on Data-mode entry for its engine
  sections), fixing v1 pain #11.

## B6. Performance readout & previews (D6, D7)

`PerformanceCard` (right sidebar):

- **Rocket select**: each `<Rocket>` in the active scope + "First pair" (legacy
  behavior; auto-chosen and select hidden when no rockets exist). Per-rocket:
  aggregate over its core+nozzle-ref pairs — Σ thrust (vac/SL), Σ mass flow,
  Isp = ΣF/(g0·Σṁ); per-pair breakdown rows in a disclosure when >1 pair.
- Metrics (mono, tabular-nums): Thrust vac / SL (kN) · Isp vac / SL (s) · Mass flow
  (kg/s) · Throat diameter (cm) · conditional "⚠ Flow separation (SL) N%" with hover
  hint · Optimum expansion (kPa) with hover hint.
- Degradation states preserved: no catalog → "engine still exports correctly" hint;
  mixture without O/F → "set the combustor's O/F mixture ratio to preview".
- **Solid preview** (D7): `SolidThrustCurveCard` under the metrics when the scope has a
  solid motor — thrust-vs-time curve (canvas sparkline, keyframe-free), peak thrust +
  burn time readouts, driven by the `TrySampleThrustCurve` port; renders the
  "preview unavailable" hint until the port lands (severable).
- `predictPerformance` / `sliceLutAtMixtureRatio` untouched (verbatim-port invariant).

## B7. Exhaust placement — transient tool + 3D handles

Per foundation §2.6 (`$activeTool = 'exhaust'`, Engine mode only):

- **Arming**: Exhaust section toggle · nozzle editor "Place this nozzle's exhaust" ·
  clicking any handle in the viewport · hotkey `X` (§B10). Arming another tool disarms
  it (single slot); leaving Engine mode disarms + disposes handles.
- **Handles**: `NozzleHandleObject` unchanged — cube at exhaust location + cone along
  direction; **amber = physics, cyan = FX** (KSA's own debug colors — cross-tool color
  language invariant); depth-test off, renderOrder 10; inactive handles dim-and-fade.
  One handle per (nozzle × placement × channel). Rendered whenever an engine is active
  in Engine mode (not only while armed — they are the mode's viewport furniture);
  pickable always; disposed on mode exit.
- **Gizmo**: attaches to the engine proxy at the active target. Move = exhaust location
  (owner full matrix, scale included); Rotate = direction (owner rotation only — two
  frames, `coords.ts exhaust*` helpers); roll inert; **Scale clamps to Move** via
  `$effectiveToolMode` — the floating Tool bar displays the clamp truthfully and
  disables Scale (foundation §6.2).
- **Write-back**: physics direction normalized on every gizmo write; FX direction
  re-aimed keeping authored magnitude (never normalized — stock ships non-unit FX).
  Streaming, one undo push at drag start ("exhaust" / "plume FX").
- **Status-bar tool segment**: `Exhaust: Nozzle1 #2 · FX · ,/. cycle · Esc done` —
  segment click focuses the Exhaust section. Esc rung 5 disarms.
- Stale-ref defense preserved: targets re-resolved against `$part` on every read;
  degradation to first target, never a wrong-nozzle edit.

## B8. Engine mode phone variant

- **Panel sheet** = the Engine Navigator verbatim (`sm` density): scope select,
  define-new menu (drill-down sheet views for the target picker), module tree,
  performance card, issues, exhaust chips.
- Tapping a module row closes the Panel sheet and opens the **Inspector sheet** =
  Module Editor with `‹ Modules` back header.
- **Exhaust placement on phone**: arming from the Panel sheet dismisses it; the
  CondensedStatusBar shows the tool chip (`Exhaust: Nozzle1 #2`); tapping the chip
  reopens the Exhaust chips as a 50% sheet for re-targeting; handles + gizmo are
  touch-draggable as in Build. The Tool bar strip (docked above the status bar, per
  foundation) shows the Scale→Move clamp.
- Performance card is the Panel sheet's sticky footer headline (thrust · Isp) so
  numbers stay visible while scrolling modules.
- LUT grid on phone: rows render as stacked 2×2 field cards instead of a 4-column row.

## B9. Engine stores (state sketch)

```ts
// src/state/engineStore.ts (evolved; zero react/three imports)
$activeEngineEntry: EngineEntryRef | null          // kept; survives mode switches, clamped vs $part
$activeModule: {                                    // NEW — module tree focus (left editor)
  group: 'combustor'|'nozzle'|'solidMotor'|'grain'|'solidNozzle'
       | 'rocket'|'controller'|'wiring'|'gimbal'|'propellant',
  scope: 'sub'|'part', index: number } | null      // clamped defensively vs $part each read
$activeNozzleRef, $resolvedNozzleTargets, $activeNozzleTarget  // kept verbatim (defensive resolution)
$rocketReadoutSel: string | '\0firstPair'          // NEW — Performance rocket select (ephemeral)
$isExhaustPlacing = computed(modeStore.$activeTool === 'exhaust')   // replaces the old flag
$effectiveToolMode = computed($toolMode, $isExhaustPlacing)         // kept semantics
$engineFindings = computed([$part, $allReactionIndex], validateEngines)  // feeds Issues + status chip
// actions: activateEngine(entry), focusModule(ref), cycleExhaustTarget(±1),
//          defineEngine(kind, templateId|part, instanceId?)  → composite undo steps
// enterEngineMode()/exitEngineMode() die; modeStore.setMode('engine', payload) is the
// single choreography point (loads reactions, restores/derives active entry, on exit
// disarms exhaust + disposes handles via the viewport affordance flag).
```

```ts
// src/state/dataModeStore.ts (NEW)
$dataScope: {kind:'part'} | {kind:'template', templateId: string}   // ephemeral, clamped
$dataSectionJump: {sectionId: string, nonce: number} | null          // consumed by DataScopeForm
$dataSearch: atom<string>                                            // navigator filter
$gameDataFindings = computed([$part, $allReactionIndex])             // §A7
// actions: setDataScope, jumpToSection, addTemplateData(templateId, kind)
```

Document mutations stay in `editorStore` (all ~80 existing actions unchanged; new:
`addRcsEngine`, `addSolidEngine`, `duplicateEngineModule`, `updateTankAdvanced`,
`setExtraDiameters`, `updateReactionPlumes`). `reactionStore` unchanged apart from
load-on-mode-entry. `feedTargets.ts` pure derivations unchanged.

## B10. Engine hotkeys (registered scopes; v1 had none — all new)

| Scope | Keys | Action |
|---|---|---|
| mode:engine | `X` | toggle exhaust placement tool |
| tool:exhaust | `,` / `.` | previous / next exhaust target (wraps; flashes the chip) |
| tool:exhaust | `Esc` (rung 5) | disarm (foundation ladder) |

(`,`/`.` collide with mode:animation's transport only nominally — different scopes,
never both active.) The module tree additionally registers the **list-focus edit-chord
mirrors** at `surface:engine-tree` (foundation §11.1) so the entity-selection edit chords
survive list focus, matching the Outliner and Data navigator.

## B11. Undo / persistence table (Engine mode)

| Interaction | Undo | Persistence |
|---|---|---|
| Define engine (any of the four kinds) | ONE composite push ("define liquid engine" …) | autosave |
| Add/remove/duplicate module, add propellant (clone/blank), add wiring entry, add gimbal | discrete push each | autosave |
| Field edits (all editors) | streaming: push at interaction start | autosave |
| Reaction pick (incl. O/F reset side effect) | one discrete push ("set propellant") | autosave |
| Normalize direction / FX override toggle / auto-wire | discrete push each | autosave |
| Exhaust gizmo drag | one push at drag start ("exhaust"/"plume FX"); streaming | autosave |
| Scope select, module focus, rocket readout select, exhaust target/arming, tree collapse | none (ephemeral designer state — never serialized/undone) | not persisted |
| Remove propellant / module | §14.3 policy (≤5-entity undoable → no confirm, status `[Undo]`) | autosave |

---

# PART C — CROSS-CUTTING

## C1. What dies, what survives (dual-routes ledger)

| v1 surface | Fate |
|---|---|
| `PartDataButton` fullscreen modal | **DELETED** → Data mode Part scope |
| `ManageTanksModal` ("SubPart Data") | **DELETED** → Data mode template scope |
| Toolbar "Part Data" button / MobileTopBar item | **DELETED** → mode switcher `3` (ledger: foundation §16) |
| AssetsList row ⋮ "SubPart Data" | becomes a **jump** ("SubPart Data →") in Outliner + Build inspector |
| AssetsToolbar "Engine (N)" button | **DELETED** → mode switcher `4`; attention dot on the Engine segment shows validation blockers (foundation §2.2) |
| `EngineToolbar` (Close) | **DELETED** — modes switch, never close |
| `EnginePanel` 1806-line host | **REPLACED** by Navigator + Module Editor; `EngineSections.tsx` splits into `src/ui/engine/*` (CombustorEditor, NozzleEditor, SolidMotorEditor, GrainSegmentEditor, SolidNozzleEditor, RocketEditor, ControllerEditor, GimbalEditor, FeedWiringEditor, PropellantEditor, ReactionPicker, PerformanceCard, SolidThrustCurveCard) + `src/ui/data/*` (DataNavigator, DataScopeForm, sections, PassthroughViewer); `Field`/`ItemCard` primitives move to `src/ui/kit/` (kills the utility-in-feature-file debt) |
| Engine sections rendered in 3 places | 2 mode entrances max (D11), same components, cross-link banners |
| `EngineIssuesPanel` (modal-buried) | component survives inside both modes' always-visible validation surfaces + export pre-flight (unchanged there) |

## C2. Foundation deviations

**None.** Everything here instantiates foundation §7.3/§7.4/§8.3/§8.4/§2.x. Additions
within delegated latitude: navigator section child-rows (§A3), the scope-chip system
(§A5), engine mode hotkeys (§B10 — foundation's mode-scope mechanism), Build inspector
"Edit Engine →" jump (foundation §2.5 convention), and the D3/D15/D16/D17 beyond-parity
field exposures (RULE ZERO forbids cuts, not additions; each is severable and flagged as
a game-contract/docs touchpoint where applicable).

## C3. Invariant checklist (binding on implementation, carried from census §5s)

RawXmlNode capture/re-emit/allow-lists/connector-ref remap + deliberate `IVASeat`
omission — untouched (viewer is read-only). Stale-reference preservation in every picker
("— not found"). KSA plumbing semantics verbatim (one-of feed source; wiring never
Parent; empty capabilities = Electricity|ServiceFluid; blank-id containers skipped;
per-placement addressing). Exact KSA log strings in empty-feed/unwired warnings.
`enginePhysics.ts` verbatim port + constants. Unnormalized physics direction applied by
KSA ⇒ warn+Normalize, never rewrite; FX never normalized; location vs direction frames.
FX pair inherit-vs-override. One nozzle = N thrusters. Mixture requires ratio; pick
resets to default. Solid rules (all-solid rockets, ≥1 nozzle, no thruster-controller,
pressure range, no area ratio, 4 burn-rate fields or export omits). Serializer default
omission + units. `ControlMap` verbatim passthrough. Sentinels `'\0root'/'\0none'/
'\0part'`. Catalog-absent operation. PreciseNumberInput everywhere. Discrete/streaming
undo. Bar⇄Pa. Amber/cyan handle colors. Defensive NozzleRef resolution. No migration.
`normalizeSize` & reference-container behaviors live on unchanged in Build/Aids (other
area). scope/ + docs/ updated by implementation for D15/D16/D17.

---

# §6. FEATURE PARITY TABLES (RULE ZERO)

## 6.1 Data area (from part-data-gamedata.md)

| v1 feature | v2 home |
|---|---|
| Part Data dialog entry (toolbar btn / mobile menu) | Mode switcher `3` · palette · jumps (§A2) |
| Identity: Part Id / Display Name / Editor Tags (chips+popover, free-form, grouping) / Diameter switch+value / Command capable | Data · Part · Identity (§A4.1) — EditorTagsField kept verbatim |
| `extraDiametersM` (round-trip only) | Identity "Additional size classes" — now editable (D3) |
| Mass switch + kg; `customMassExtras` re-nesting | Data · Part · Mass; preserved-elements chip → Passthrough viewer (D2) |
| Part-level Tanks (feed id, shape, wall material, length, radius, thickness, add/remove) | Data · Part · Tanks (feed containers) (§A4.1) |
| `Tank.roleAffinity` / `Tank.locationAsmb` (round-trip only) | per-tank Advanced disclosure — now editable (D3) |
| Power: batteries / generators / solar (produced + orientation) / single consumer (consumed, light switch, starts-on, both hints) | Data · Part · Power; orientation now displays degrees (D14) |
| Coupling: decoupler / docking port / EVA door; ConnectorSelect stale-preservation + empty hint | Data · Part · Coupling (+ Show→ highlight; D17 SeatId severable) |
| Controllers / ConsumerFeedWiring (+ auto-wire, unwired warning, KSA log text) / Gimbals in Part Data | Data · Part · Wiring (shared editors) AND Engine mode tree (D9) |
| EngineIssuesPanel (block/warn wording) | Validation strip + status chip + Engine ISSUES section (D4) |
| Part-level Solid motor / Gas generator sections | Data · Part · Advanced + Engine mode part-level scope |
| SubPart Data dialog: Tanks / Lights (full field set + Select in 3D) / Solar / Engine (thrust chamber) per template; lazy `createSubPartGameData` | Data · template scope (§A4.2); lazy creation via "＋ add data" and group ＋ buttons |
| Data-capability distinction (SubPart rows only) | Navigator capable vs non-capable disabled-style groups (§A3) — BRIEF requirement |
| Template-shared / instance / placement scoping (prose banners) | Structural scope-chip system (§A5) |
| FeedsField (one-of source, stale "— not found", empty-feed KSA log danger note, placement-keyed containers) | Kept verbatim, + placement labels & hover-highlight (§A5) |
| feedTargets.ts derivations | unchanged |
| Connector Capabilities editor (Build inspector) | unchanged home; read-only summary mirrors in both modes (D10) |
| RawXmlNode passthrough (capture/re-emit/remap; no viewer) | invariant untouched + NEW read-only Passthrough viewer (D2) |
| Reference containers (create/list/edit/warn/persist) | Build mode Aids section + left aid editor (foundation §7.1/§8.1 — other area); vocabulary fixed here by "Tanks (feed containers)" titling |
| Undo conventions (streaming/discrete), autosave, projectCodec fields (`g/sg/tg/cr/tk`) | unchanged (§A10) |
| Unit conventions (Pa↔bar, %, half-angles) | kept; presentation standardized (D14) |
| Index-keyed list rows (state-bleed pain) | v2 cards keyed by stable identity where available (feed id / instance id), index fallback — implementation note |
| No data-area hotkeys | none to preserve; navigator gets list-arrow navigation for free |

## 6.2 Engine area (from engines.md)

| v1 feature | v2 home |
|---|---|
| Engine proto-mode enter/exit (`Define Engine…`, "Engine (N)" button, Close) | Mode `4` + Add ▸ Define Engine… (→M) + jumps; Close deleted (§B2, C1) |
| Mode survival of `$activeEngineEntry`/`$activeNozzleRef` | kept (§B9; foundation §2.4) |
| Engine scope Select (incl. `'\0part'` part-level entry) | Navigator scope select (§B3.1) |
| Define new engine / SRB approximate Selects (per-placement lists) | Define-new menu: Liquid/RCS/Solid/SRB-legacy, per-template picker + instance sub-pick (D12, D13) |
| `addEngine` / `addSrbEngine` one-undo-step composites (+ "Engines" tag) | kept; joined by `addRcsEngine`/`addSolidEngine` composites |
| Live performance readout (first pair; all metrics; flow-separation & optimum-expansion hints; catalog-absent & no-ratio degradation; LUT slicing) | PerformanceCard with per-rocket aggregation + "First pair" fallback (D6); physics port untouched |
| CombustorFields (plumbing class + microcopy, feeds, reaction w/ O/F reset, ratio bounds+warning, pressure bar, thermal η, min throttle, min pulse) | CombustorEditor (§B4.2) + ReactionPicker (§B5) |
| NozzleFields (all 15 items incl. shared-N banner, DirectionLengthWarning + Normalize, FX override pairing, plume/trail default-entry selects, sound, light) | NozzleEditor (§B4.3); NaN area-ratio surfaced honestly |
| Reaction-keyed `<ReactionPlume>` round-trip (gap P1) | Plume entries list editor (D15, severable) |
| Exhaust placement: toggle, chip list (cap+scroll), shared-nozzle explainer, target fan-out & defensive resolution, amber/cyan handles (depth-off, renderOrder 10, dim-fade), gizmo frames, Scale→Move clamp + truthful toolbar, write-back normalization rules, undo labels, dispose-on-exit | §B7 — transient tool `exhaust` in the single slot; Tool bar shows clamp; all semantics verbatim |
| SelectionToolbar force-show while placing | Tool bar visibility rule "whenever a gizmo target exists" (foundation §6.2) covers it |
| RocketFields (id, core, nozzle refs + InstanceSelect/root sentinel) | RocketEditor (§B4.7) |
| RocketControllersSection (+ Engine/RCS add buttons) | ControllerEditor + tree group ＋▾ (§B4.9) |
| GimbalsSection (per-instance cards, add-to-instance, upsert) | GimbalEditor with instance chip-picker (§B4.9, §A5) |
| ConsumerFeedWiringSection (Part-Data-only!) | FeedWiringEditor INSIDE Engine mode + Data Wiring (LOCKED #1, D9) |
| Solid motor / grain segment / solid nozzle editors (3 authoring places; schema explainer copy) | SolidMotorEditor/GrainSegmentEditor/SolidNozzleEditor in both modes' engine surfaces (§B4.4–4.6) |
| Solid thrust-curve gap | SolidThrustCurveCard (D7, severable) |
| Custom propellants (clone-shipped w/ baked O/F, blank, card fields, solid burn-rate + omit banner, LUT editor, instant `$allReactions` merge, `uniquePropellantId`) | PropellantEditor + tree group (D8, §B4.10) |
| Validation: `validateEngines` codes, block/warn wording, Part-Data + Export surfacing | Export pre-flight unchanged + always-visible ISSUES in-mode + Data strip + status chips (D4); 5091 parity (D16, severable) |
| Reaction catalog loading (`ensureReactionsLoaded`, OSS-absent tolerance, `KNOWN_REACTIONS` fallback) | load moves to mode entry; tolerance + fallback kept (§B5) |
| Duplicated shortLabel/entryLabel + engine-count logics | single label helper in engineStore; count = scope count for the mode dot (attention dot spec, foundation §2.2) |
| `$activeEngineEntry` staleness degradation | kept (clamped reads; §B9) |
| No engine hotkeys | superseded by new mode/tool scope keys (§B10 — nothing to preserve) |
| Engine data in import/paste id-remap, projectCodec, serializer | untouched |

## 6.3 Lights-data slice (from viewport-scene-view.md §1.8)

| v1 feature | v2 home |
|---|---|
| SubPart-owned light authoring (SubPart Data dialog LightsSection, full KSA `<Light>` field set, filtered-index mutators) | Data · template · Lights (§A4.2) |
| "Select in 3D" (broken under modal) | works live — viewport co-visible (§A4.2) |
| Part-level lights: Add menu + Build inspector dual-frame editor, falloff curve, `$lightEditContext` | unchanged Build home; Data navigator dim rows explain + jump (D10 pattern) |
| Light coverage/preview/marker settings | View menu + Settings (foundation — other area) |

— end —
