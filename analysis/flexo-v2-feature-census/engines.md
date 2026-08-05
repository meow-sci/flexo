# Engine Designer (combustor / nozzle / reactions) — UI & Validation Analysis

Area owner files (all paths relative to `/Users/asherwin/repos/meow-sci/flexo` unless absolute):

| File                                        | Lines      | Role                                                                                                                                                 |
| ------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/EnginePanel.tsx`                    | 435        | Full-sidebar Engine Designer body (mode `'engine'`), performance readout, exhaust-chip placement UI                                                  |
| `src/ui/EngineSections.tsx`                 | 1806       | ALL field-level editors (combustor, nozzle, solid trio, rocket, controllers, gimbals, feed wiring, custom propellants) — biggest UI file in the repo |
| `src/ui/EngineToolbar.tsx`                  | 40         | Mode header bar (engine name + Close)                                                                                                                |
| `src/ui/EngineIssuesPanel.tsx`              | 49         | Inline validation-findings list (block/warn)                                                                                                         |
| `src/state/engineStore.ts`                  | 338        | Ephemeral designer state: active engine scope, nozzle refs, exhaust gizmo, tool-mode clamp                                                           |
| `src/state/reactionStore.ts`                | 59         | Reaction catalog load + Core∪custom merge                                                                                                            |
| `src/ksa/enginePhysics.ts`                  | 626        | Verbatim port of KSA De Laval / combustor math (`predictPerformance`)                                                                                |
| `src/ksa/engineValidation.ts`               | 379        | Pre-flight rules (block = KSA throws; warn = loads but misbehaves)                                                                                   |
| `src/ksa/reactionCatalog.ts`                | 383        | `Reactions.xml` parse, LUT resolution, custom⇄catalog conversion, `mixtureRatioBounds`                                                               |
| `src/three/NozzleHandleObject.ts`           | 109        | Pickable cube+cone exhaust marker (amber physics / cyan FX)                                                                                          |
| `src/three/EditorScene.ts` (engine parts)   | ~1620–1970 | Handle reconciliation, exhaust-gizmo proxy, drag write-back                                                                                          |
| `src/state/editorStore.ts` (engine actions) | ~2900–3650 | All document mutations (add/remove/update per scope+flavor), `addEngine`, `addSrbEngine`, auto-wire                                                  |

Docs consulted and verified against code: `docs/engines.md` (accurate, current), `scope/engines.md` (baseline 2026.8.3.5117, current), `plans/KSA_ENGINE_DESIGNER_PLAN.md`, `plans/ENGINE_EXHAUST_PLAN.md`.

---

## 1. Feature inventory

### 1.1 Engine mode (the proto-mode) — enter/exit flow

**This IS already a full mode.** `$inspectorMode: 'assets' | 'anim' | 'engine'` (`src/state/uiStore.ts:17-18`, ephemeral atom, resets to `'assets'` on reload). When `'engine'`, `InspectorContent` (`src/ui/InspectorContent.tsx:37-46`) replaces the whole right sidebar (AssetsToolbar + AssetsList) with `EngineToolbar` + `EnginePanel`. Mirrors the Animation editor's layout deliberately (list-on-top, toolbar with Close).

- **Entry paths (2):**
  1. Top Toolbar → **Add menu → "Define Engine…"** (`src/ui/AddButton.tsx:70,80`) → `enterEngineMode()` (`src/state/engineStore.ts:290-293`).
  2. Right sidebar Assets toolbar → **"Engine (N)"** button (`src/ui/AssetsToolbar.tsx:46-49`) → `setInspectorMode('engine')`. N counts engine _scopes_ (`$engineEntries.length`), so part-level-only RCS parts still count.
- **Exit path:** EngineToolbar "Close" button → `exitEngineMode()` (`engineStore.ts:296-299`) — turns off the exhaust gizmo, returns to `'assets'`. No hotkey, no Escape binding.
- **Mode survival:** `$activeEngineEntry`/`$activeNozzleRef` deliberately survive mode switches (the 3D scene gates on mode instead — `EditorScene.ts:1874-1887`), so reopening the designer restores the last-open engine.
- The 3D viewport, main toolbar, and floating inspectors stay live during engine mode; only the sidebar body swaps.

### 1.2 Engine selection & creation (EnginePanel header)

UI path: right sidebar in engine mode, top of `EnginePanel` (`src/ui/EnginePanel.tsx:79-158`).

- **"Engine" Select** — lists every engine scope from `$engineEntries` (`engineStore.ts:137-151`): one entry per SubPart template carrying any combustor/solid motor/nozzle/solid nozzle, plus a **"Part-level (RCS / gas generator)"** entry whenever `part.gameData` itself carries engine hardware (stock MMU RCS pattern). Sentinel key `'\0part'`.
- **"Define a new engine on a placed SubPart" Select** — lists placements whose template is not yet an engine; picking one calls `addEngine(templateId, instanceId)` (`editorStore.ts:3553-3581`): ONE undo step creating Combustor + DeLavalNozzle + Rocket on the SubPartGameData, a part-level RocketEngineController referencing that rocket on the picked instance, and the "Engines" editor tag. Then activates that engine.
- **"…or an SRB (approximate, fixed-thrust)" Select** — same candidates; `addSrbEngine` (`editorStore.ts:3593-3621`): combustor pinned `minimumThrottle=1`, `reactionId='APCP'`, plus a sealed internal Tank on the SubPart. Explanatory copy in-panel about why it's a fake (no burn curve, shutdown-able, liquid drain). NOTE: this is the legacy pre-5018 fake; real `<SolidMotor>` hardware now exists (see 1.8) — the panel offers both.
- Empty states: "Place a SubPart in the workspace first…" when no placements; hint text when no engine selected.

### 1.3 Live performance readout

`PerformanceReadout` (`EnginePanel.tsx:371-435`). Shown when the active scope has a first combustor + first De Laval nozzle (SubPart scope: `activeSpd.combustors[0]`/`nozzles[0]`; part scope: `g.combustors[0]`/`g.nozzles[0]` — **only the primary pair**, not per-rocket).

- Computes in-browser via `predictPerformance` (`src/ksa/enginePhysics.ts`) — a verbatim port of KSA's `EngineDesigner.cs` chain (FixedReactionTable → GasProperties → CombustorConfig → DeLavalNozzleConfig → NozzlePerformance → RocketDesign; sub-0.1% parity vs the game, tests assert Hydrolox@5.5 ≈ 445.4 s Isp_vac).
- Metrics rendered (`Metric` rows, `font-mono tabular-nums`): Thrust vacuum/sea-level (kN), Isp vacuum/SL (s), Mass flow (kg/s), Throat diameter (cm), conditional **"⚠ Flow separation (SL) N%"** (over-expansion warning with hover hint), Optimum expansion (kPa, hover hint).
- Degrades gracefully: no reaction catalog loaded (OSS build lacks `Reactions.xml`) → hint box "engine still exports correctly"; mixture reaction without O/F ratio → "set the combustor's O/F mixture ratio to preview" (mirrors `resolveReactionLut` returning null; `reactionCatalog.ts:282`).
- Mixture reactions are baked to a 1-D slice at the combustor's ratio first (`sliceLutAtMixtureRatio`, port of `MixtureReactionTable.SliceAt`).

### 1.4 Combustor editing

`CombustorFields` (`EngineSections.tsx:236-347`), reused at both scopes (SubPart via `SubPartEngineSection`, part via `PartGasGeneratorSection`). Data model: `Combustor` in `src/ksa/types.ts`; mutations `updateCombustor(tid,i,patch)` / `updatePartCombustor(i,patch)` etc. in editorStore. Fields:

- **Plumbing class** Select — Bulk (main engine) vs Service (RCS), with inline explainer of the connector-capability implication (`Bulk` needs `BulkFluid` on every connector in the path). `setCombustorPlumbing` / `setPartCombustorPlumbing`.
- **Feeds from** — `FeedsField` (`src/ui/FeedsField.tsx`) list editor of `<FeedsFrom>` entries; each entry is exactly one of Parent / Connector / Container (containers = tanks + grain segments resolved by `feedTargetsOf` in `src/state/feedTargets.ts`). `allowParent` true here.
- **Propellant (reaction)** Select — `ReactionSelect` (`EngineSections.tsx:135-170`): lists live catalog (`$allReactions` = Core ∪ project custom reactions, custom wins on id — `reactionStore.ts:31-35`) with nice names, falls back to static `KNOWN_REACTIONS` snapshot; keeps an unknown current id selectable. **Picking a reaction also resets the O/F ratio to the reaction's `<DefaultMixtureRatio>`** (null for fixed reactions) — mirrors KSA's designer (`defaultRatioFor`, `setCombustorReaction`).
- **Mixture ratio (O/F by mass)** — shown only for mixture reactions; `PreciseNumberInput` bounded by `mixtureRatioBounds(reaction)` (the LUT row range, `reactionCatalog.ts:379`); inline warning "KSA refuses to load the engine without one" when null.
- **Chamber pressure (bar)** — stored SI Pa, displayed bar (`PA_PER_BAR = 1e5`, `EngineSections.tsx:111`).
- **Thermal efficiency (%)**, **Minimum throttle (%, 100 = on/off only)** (clamped 0.01–1), **Min pulse time (s, 0 = none — for RCS)** (null when 0).

### 1.5 Nozzle editing (De Laval + solid, shared body)

`NozzleFields` → `RocketNozzleFields` (`EngineSections.tsx:350-625`); `SolidNozzleFields` reuses the same body with the throat slot swapped for a note ("KSA sizes the throat as exit area ÷ 12 — solid nozzles have no area ratio", `EngineSections.tsx:384-405`). Fields:

- **Exit diameter (m)**; **Area ratio (exit/throat)** (De Laval only; min 1; KSA default is NaN ⇒ required).
- **Flow efficiency (%)**, **Expansion efficiency (%)**.
- **Shared-by-N-placements note box** (`EngineSections.tsx:467-478`) when the owning template is placed >1×: explains that ONE `<DeLavalNozzle>` drives N real thrusters, vectors are per-placement-frame, and points to part-level authoring for independent thrusters.
- **Exhaust location (m)** Vec3Field; **Exhaust direction (unit; default −X)** Vec3Field with inline physics explainer ("direction gas LEAVES; thrust acts along −this…").
- **`DirectionLengthWarning`** (`EngineSections.tsx:639-664`) — when |dir| ≠ 1 (±`UNIT_EPSILON=1e-3`): warns "engine pushes N.NN× its rated thrust" (KSA applies thrust UNNORMALIZED, `VehicleUpdateState.cs:294`) with one-click **Normalize** button. Typed/imported values deliberately left verbatim (round-trip); only the gizmo always writes unit vectors.
- **"Override FX placement (plume ≠ thrust)" Switch** — the FX pair is ONE authoring decision: ON seeds `fxExhaustLocation/Direction` from the physics pair, OFF nulls both (KSA inherits). When on: **FX location (m)** + **FX direction (any length — visual only)** Vec3Fields in a sunken sub-panel, plus "Cyan handle in the 3D viewport" hint.
- **FX exit diameter (m, 0 = match exit — visual only)**.
- **Exhaust plume** Select (`VOLUMETRIC_EXHAUST_IDS`) and **Plume trail** Select (`PLUME_TRAIL_IDS`) — both edit only the DEFAULT `<ReactionPlume>` entry via `defaultReactionPlume`/`withDefaultReactionPlume`; reaction-keyed entries round-trip but are **not yet authorable in the UI** (known gap "P1" in scope/engines.md).
- **Engine sound** Switch (`sound: {action:'On', soundId: DEFAULT_ENGINE_SOUND_ID}` or null); **Exhaust light** Switch.

### 1.6 3D exhaust placement (the marquee 3D interaction)

- **Toggle:** "Place exhaust in 3D" Switch + chip list, `ExhaustPlacement` (`EnginePanel.tsx:288-352`). Hidden when the open engine has no nozzles.
- **Targets:** `$resolvedNozzleTargets` (`engineStore.ts:179-256`) fans out over four axes: nozzle list × flavor (delaval/solid) × **every placement of the owning template** × channel (physics + fx-when-overridden). Resolved defensively against `$part` on every read — stale refs degrade to the first target, never edit the wrong nozzle. Exactly one target `isActive`.
- **Chips:** `ToggleButtonGroup` of chips (not a Select — spatial identity mirrors the viewport handles 1:1), height-capped + scrollable (MMU authors 56 nozzles). Labels: `NozzleId #N` (#N when placed >1×) `· FX` for the plume channel. Shared-nozzle explainer text when the active target's template is multi-placed ("editing through instance X; the other handles move with it").
- **Handles:** `NozzleHandleObject` — cube at exhaust location + cone along direction; amber = physics, cyan = FX (matches KSA's own in-game debug overlay colors, `Vehicle.cs:3542`); depth-test OFF (points sit inside the bell); renderOrder 10; dim-and-fade for inactive. Clicking any handle re-targets the gizmo (SelectionManager `kind:'nozzle'` route, `EditorScene.ts:308-313`) and deliberately does NOT change the mesh selection.
- **Gizmo:** attaches to an empty proxy (`engineProxy`, `EditorScene.ts:1630-1643`) posed at the active target's world exhaust point/axis. **Move** = exhaust location (through owner's full matrix, scale included); **Rotate** = exhaust direction (through owner rotation only — the two vectors use DIFFERENT frames, `coords.ts` `exhaust*` helpers); roll does nothing (axially symmetric, matching game); **Scale degrades to Move** while placing via `$effectiveToolMode` (`engineStore.ts:284-287`) and SelectionToolbar disables the Scale button (`src/ui/SelectionToolbar.tsx:61`) — one source of truth so displayed tool never disagrees with drag behavior.
- **Write-back** (`EditorScene.ts:1944-1969`): physics direction normalized on every write; FX direction re-aimed but keeps its authored MAGNITUDE (stock ships non-unit FX vectors; consumers `NormalizeOrZero()` them). Streaming with one undo pushed at drag start ("exhaust" / "plume FX" labels, `EditorScene.ts:425-428`).
- SelectionToolbar (the floating translate/rotate/scale switcher over the viewport) is force-shown while exhaust-placing even with no viewport selection (`$isExhaustPlacing`, `SelectionToolbar.tsx:42`).

### 1.7 Rocket (binding) + controllers + gimbals ("Wiring")

- **RocketFields** (`EngineSections.tsx:967-1056`): `<Rocket>` id text field, Core (combustor) IdSelect, N nozzle refs (add/remove rows). At part level, each ref gains an **InstanceSelect** ("on instance" / "(root part)" — sentinel `'\0root'`) since part-scope rockets can bind SubPart-instance hardware (gas-generator case). Combustor/nozzle id pools mix solid + liquid families (a `<Rocket>` id may name either; mixing is a load error caught by validation).
- **RocketControllersSection** (`EngineSections.tsx:1069-1172`): part-level `<RocketEngineController>`/`<RocketThrusterController>` cards — controller id, Type select (engine = throttle+staging / thruster = RCS pulsed), N rocket refs each with instance scoping; "+ Engine controller" / "+ RCS controller" buttons.
- **GimbalsSection** (`EngineSections.tsx:1339-1405`): one card per placed-instance `<Gimbal>` (Max angle Y/Z °, 0–90; Constrain-to-circle switch); "Add gimbal to instance" Select over placements without one. `setGimbal` upserts (`editorStore.ts:3526-3536`).
- In the EnginePanel these live in a "Wiring (controllers + gimbals)" DisclosureSection (`EnginePanel.tsx:183-198`), always part-level regardless of engine scope.

### 1.8 Solid rocket motors (real SRBs, KSA ≥5018)

- **SolidMotorFields** (`EngineSections.tsx:671-761`): Solid propellant Select (only `Category="Solid"` reactions offered — Core APCP/DoubleBase + custom solids; liquid = hard load error), **Grain profile** Select (`GRAIN_GEOMETRY_IDS` — the thrust curve over the burn; "(library default)" option), Default chamber pressure (bar), Thermal efficiency, Feeds from (grain segments + `SolidMotorCase` connectors).
- **SolidGrainSegmentFields** (`EngineSections.tsx:768-837`): Feed id, Casing material id, Outer radius (m), Wall thickness (mm), Length (m), Location offset Vec3 (assembly frame).
- **SolidNozzleFields**: see 1.5 (no area ratio).
- Authored at THREE places: per-SubPart (`SubPartEngineSection`, `EngineSections.tsx:894-945`), part-level (`PartSolidMotorSection`, `EngineSections.tsx:1278-1337` — with schema-rules explainer copy), and via Part Data modal (see 2.3). No thrust-curve preview (needs a ~200-line port of `SolidMotor.TrySampleThrustCurve` — documented gap).

### 1.9 Consumer feed wiring (plumbing layer 3)

`ConsumerFeedWiringSection` (`EngineSections.tsx:1187-1271`) — Part Data modal only (NOT in EnginePanel!). Edits `<ConsumerFeedWiring>`: how the Part answers a placed SubPart's `<FeedsFrom Parent="true"/>`.

- Consumer Select over `consumerOptionsOf(part)` (id+instance composite key; a no-longer-present consumer stays selectable labeled "not found" so re-picking is explicit).
- FeedsField with `allowParent=false` (KSA forbids a wiring entry deferring to Parent).
- Inline warning counting unwired consumers ("KSA will log … they will reach no propellant") + **"Auto-wire unwired consumers"** one-click fix (`autoWireUnwiredConsumers`, `editorStore.ts:3493-3505` — creates blank entries; user still picks feed points).

### 1.10 Custom propellants (user-authored `<FixedReaction>`)

`CustomPropellantsSection` (`EngineSections.tsx:1494-1548`) — in the EnginePanel behind a "Custom propellants" disclosure (badge = count).

- **"Clone a shipped/known propellant"** Select — clone-and-remix workflow (cloning a mixture bakes it at its default O/F, exactly what KSA's combustor does; `reactionDataToCustom`). Unique-id generation `uniquePropellantId` (`EngineSections.tsx:1472-1483`).
- **"+ Blank propellant"** button.
- **CustomPropellantCard** (`EngineSections.tsx:1558-1649`): Name, Category Select (Bipropellant/Hypergolic/Monopropellant/Solid/Thermal), Reactants list (substance phase id + mass share, add/remove), gas-table LUT editor.
- **SolidPropellantFields** (`EngineSections.tsx:1657-1727`) — appear when Category=Solid: burn-rate coefficient a, exponent n (0≤n<0.95), minimum burn pressure (bar), max stable pressure (bar), exhaust condensed fraction [0,1). Hard **danger** banner when incomplete: "will be omitted from the export" (`isCustomReactionExportable`; the serializer really does skip it).
- **CustomPropellantLut** (`EngineSections.tsx:1729-1804`): raw 4-column grid (ln P, T·K, γ, g/mol) with add/remove rows; "+ Row" clones the last row at lnP+0.5, sensible defaults otherwise. This is CEA-style pre-solved thermodynamics — flexo does not solve chemistry, panel copy says so.
- Custom reactions merge into `$allReactions` instantly, so a just-authored propellant appears in every combustor dropdown and drives the live readout (`reactionStore.ts:31-40`).

### 1.11 Validation / issues surfacing

`validateEngines(part, reactionIndex)` (`src/ksa/engineValidation.ts:193-379`), pure + injected. Two severities keyed to what KSA does: **block** (KSA throws — mod fails to load) / **warn** (loads but misbehaves, usually silent no-thrust). Checks (stable kebab-case codes):

- `rocket-mixes-solid-and-liquid`, `solid-rocket-needs-nozzle` (RocketTemplate.Create throws)
- `solid-motor-on-thruster-controller` (RocketThrusterControllerTemplate.Create)
- `solid-motor-needs-solid-reaction`, `solid-motor-pressure-out-of-range` (SolidMotorTemplate.Create)
- `nozzle-direction-not-unit` (thrust-multiplier warning; zero-length = no thrust)
- `solid-reaction-incomplete` (FixedReactionTemplate.Create; export omits)
- `feed-unknown-container`, `feed-unknown-connector`, `feed-connector-missing-bulkfluid`, `feed-connector-missing-solidmotorcase`, `consumer-not-wired`, `consumer-no-feeds` (feed resolution — all KSA logs)

Surfaced at TWO places: **EngineIssuesPanel** inside Part Data modal → Engine section (`PartDataButton.tsx:132`; renders nothing when clean; "KSA would refuse to load (N)" in danger vs "Loads, but misbehaves (N)" in warning), and the **Export dialog** (`src/ui/ExportButton.tsx:100-150`) merged with collider/IVA/light validations into blocking/warn/info boxes. Plus the many INLINE per-field warnings described above (mixture-ratio missing, direction length, unwired consumers, solid-reaction-incomplete). **Notably the EnginePanel itself does NOT render EngineIssuesPanel** — issue list is only in Part Data + Export.

### 1.12 Modal-hosted engine editors (the non-mode entrances)

- **SubPart Data modal** (`src/ui/ManageTanksModal.tsx:56-57`): "Engine (thrust chamber)" DisclosureSection hosting the full `SubPartEngineSection` (combustors, nozzles, solid trio, rockets) for one template — created lazily via a synthetic empty `SubPartGameData` if none exists.
- **Part Data modal** (`src/ui/PartDataButton.tsx:118-140`): "Engine" DisclosureSection (badge = module count across 9 lists) hosting Controllers, Feed wiring, Gimbals, EngineIssuesPanel, and disclosures "Solid motor (SRB)" and "Gas generator (advanced, part-level rockets)".
  So most engine data is editable via TWO parallel routes (mode + modal), sharing the exact same section components.

### 1.13 Reaction catalog loading

`ensureReactionsLoaded()` (`reactionStore.ts:48-59`) — idempotent fetch of `Reactions.xml` served under `/ksa/` (private licensed Core data; may be absent in OSS build → `$hasReactionData=false`, readout disabled, authoring/export unaffected). Triggered on mount by `ReactionSelect`, `EnginePanel`, `CustomPropellantsSection`. Parsed by `parseReactionsFile` (`reactionCatalog.ts:193`): FixedReaction (1-D lnP LUT + solid burn-rate fields) and MixtureReaction (2-D O/F×lnP rectangular LUT + DefaultMixtureRatio); ThermalReactions skipped (nothing can burn them).

---

## 2. UI surface map

| Surface                       | Kind                            | Mounts                                                                                                                                                                   | Positioning                                | Notes                                                                                                     |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| EnginePanel                   | sidebar body (mode)             | `InspectorContent` when `$inspectorMode==='engine'` → desktop `RightPanel` (resizable 240–640 px right sidebar, persisted width) or phone bottom-sheet `MobileInspector` | in-flow flex column, `overflow-auto`       | Replaces the Assets list entirely; Assets unreachable while in mode except via other toolbars             |
| EngineToolbar                 | toolbar strip atop sidebar      | same                                                                                                                                                                     | in-flow                                    | Rocket icon + engine name + Close; mirrors AnimToolbar                                                    |
| Performance readout           | inline card                     | top of EnginePanel body                                                                                                                                                  | in-flow                                    | live physics; conditional hint states                                                                     |
| Exhaust chip list             | inline chip group               | EnginePanel                                                                                                                                                              | in-flow, `max-h-32 overflow-y-auto`        | mirrors viewport handles 1:1                                                                              |
| Nozzle handles                | 3D scene objects                | `EditorScene.root`                                                                                                                                                       | world-space, depthTest off, renderOrder 10 | only while mode==='engine' and an engine open; disposed on close (hidden-but-pickable would steal clicks) |
| Exhaust gizmo                 | 3D TransformGizmo on proxy      | EditorScene                                                                                                                                                              | world-space                                | shares the one global gizmo; Scale clamped to Move                                                        |
| SelectionToolbar              | floating bar over viewport      | `src/ui/SelectionToolbar.tsx`                                                                                                                                            | absolute over workspace                    | force-shown while exhaust-placing; Scale disabled                                                         |
| Part Data → Engine section    | fullscreen modal (phone: cover) | `PartDataButton` Modal                                                                                                                                                   | react-aria Modal portal                    | controllers/wiring/gimbals/solid/gas-gen + issues panel                                                   |
| SubPart Data → Engine section | fullscreen modal                | `ManageTanksModal`                                                                                                                                                       | portal                                     | thrust-chamber editors per template                                                                       |
| Export dialog issue boxes     | fullscreen modal (max-w-2xl)    | `ExportButton`                                                                                                                                                           | portal                                     | engine blocking/warn merged with other validators                                                         |
| EngineIssuesPanel             | inline list                     | inside Part Data modal                                                                                                                                                   | in-flow                                    | renders nothing when clean                                                                                |

Stacking/overlap notes: no engine-specific z-index conflicts found; the handles' depth-test-off + renderOrder-10 is intentional (exhaust points sit inside bells). The engine mode competes with the floating selection inspector (`FloatingInspector`) and SelectionToolbar for viewport-adjacent attention but doesn't collide geometrically.

---

## 3. State & data flow

- **Document state** (persisted, undoable): everything engine lives on `$part` (editorStore) — `subPartGameData[].combustors/nozzles/solidMotors/solidNozzles/solidGrainSegments/rockets`, `gameData.{combustors,nozzles,solidMotors,solidNozzles,solidGrainSegments,rockets,rocketControllers,gimbals,consumerFeedWiring}`, `part.customReactions`. Persisted via `projectCodec.ts` into projectStore (IndexedDB/localStorage per app-wide scheme), exported to KSA XML by `partXmlSerializer.ts`, parsed back by `partXmlParser.ts`.
- **Ephemeral designer state** (engineStore, NEVER serialized/undone): `$activeEngineEntry`, `$activeNozzleRef`, `$engineExhaustGizmo`. Sub-selection semantics identical to animationStore's ephemeral atoms.
- **Derived**: `$engineEntries`, `$activeEngineData`, `$resolvedNozzleTargets` (defensive resolution — indices revalidated each read), `$activeNozzleTarget`, `$isExhaustPlacing`, `$effectiveToolMode` (cross-store: `$toolMode` from editorStore + `$inspectorMode` from uiStore).
- **Reaction catalog**: `$reactionCatalog` (module-level `started` flag, fetch-once), `$allReactions`/`$allReactionIndex` = catalog ∪ `$part.customReactions` (cross-store computed).
- **Undo/redo**: two conventions — _discrete_ actions (`commitGameData`/explicit `pushUndo` inside, e.g. add/remove module, `addEngine` as one step) and _streaming_ actions (`update*` mutate without undo; callers push undo on interaction start: `PreciseNumberInput.onInteractionStart`, TextField `onFocus`, gizmo drag-start in `EditorScene.ts:425-428`).
- **UI prefs persisted** (localStorage via `@nanostores/persistent`): sidebar width/visibility (`flexo:inspectorWidth`, `flexo:inspectorVisible`). Inspector _mode_ is NOT persisted.
- **Cross-scene subscription** (`EditorScene.ts:552-564,627-630`): scene subscribes to `$activeEngineEntry`/`$activeNozzleRef`/`$engineExhaustGizmo`/`$inspectorMode` for handle reconciliation (NOT `$resolvedNozzleTargets` directly — it also derives from `$part`, which `reconcile()` already covers) and `$effectiveToolMode` for the gizmo mode.

---

## 4. Pain points

1. **EngineSections.tsx is a 1806-line grab-bag** — 20+ components spanning 5 distinct concerns (thrust chamber, rocket wiring, controllers/gimbals, plumbing wiring, custom propellants incl. a LUT table editor). Everything is `export`ed ad-hoc and cross-imported by 3 different hosts. Ripe for splitting along those concern lines.
2. **Dual editing routes with different capability sets.** The same combustor is editable in the Engine mode AND in the SubPart Data modal; controllers/gimbals in the mode AND Part Data modal — but **ConsumerFeedWiringSection exists ONLY in the Part Data modal** (`PartDataButton.tsx:126`) and **EngineIssuesPanel only in Part Data + Export** — so completing/verifying an engine's plumbing forces a trip out of engine mode into a fullscreen modal. The mode is _almost_ self-sufficient but not quite.
3. **Validation is invisible while authoring in the mode.** The engine designer — the place you'd most want "KSA would refuse to load this" — never renders `EngineIssuesPanel`; users discover blockers at export time. Inline per-field warnings partially compensate but don't cover cross-module rules (solid/liquid mixing, thruster-driving-solid, etc.).
4. **Deep disclosure nesting + card stacks** — EnginePanel → DisclosureSection → ItemCard → sub-lists (rocket nozzle refs, reactant rows, LUT rows) makes a multi-chamber engine a very long scroll; density is high, hierarchy is flat visually. Part Data's Engine section nests disclosures inside a disclosure inside a fullscreen modal (`PartDataButton.tsx:118-140`).
5. **Readout only covers the FIRST combustor+nozzle pair** (`EnginePanel.tsx:164-165,241-242`) — a multi-chamber or solid engine gets no numbers at all (solid preview is a documented gap, but a liquid nozzle #2 silently isn't previewed either; no per-rocket aggregation like KSA's part tooltip).
6. **The legacy "SRB (approximate)" preset coexists with real solid-motor hardware** with no guidance in the creation flow about which to pick (docs call the preset "superseded"). Two Selects with near-identical candidate lists stacked in the header.
7. **Duplicated `shortLabel`/`entryLabel` helpers** in EnginePanel.tsx:42-52 and EngineToolbar.tsx:7-15; duplicated engine-count logic in AssetsToolbar vs engineCount in PartDataButton (different semantics — scopes vs module count — easy to confuse).
8. **The reaction-keyed `<ReactionPlume>` entries are not authorable** (UI drives only the Default entry) — round-trips but invisible; a user can't see that an imported SRB nozzle has a per-reaction plume (gap P1, `scope/engines.md`).
9. **Mode entry via "Add → Define Engine…" doesn't add anything** — it just opens the mode; actual creation is a second step inside the panel. Mild discoverability mismatch with the menu's semantics.
10. **`$activeEngineEntry` can go stale** (points at a template whose last engine module was removed) — panel degrades to the hint text but the entry Select shows empty; harmless but scruffy.
11. **Missing KSA 5091 warning parity** (gap Q4, `scope/engines.md:178-192`): five new game-side "wired up wrong" warnings (controller with no rockets, rocket with no nozzles, orphan nozzle, orphan core, unresolvable feed point) not yet in `validateEngines`.
12. **New-engine candidate lists key on placements, not templates** — a template placed 4× appears 4× in the "Define a new engine" Select (one row per instanceId) even though picking any of them defines the SAME template engine (only the controller ref differs).

---

## 5. Invariants & constraints (MUST survive)

**Game contract (verified against decomp, see `scope/engines.md` — baseline 2026.8.3.5117):**

- `enginePhysics.ts` is a **verbatim port**; constants `G0=9.80665`, `Ru=8.31446261815324`, `SEA_LEVEL_PRESSURE=101325`; identical iteration counts/tolerances/clamps (incl. the top-interval clamp quirk of `FixedReactionTable.Lookup`). Any formula drift breaks readout parity.
- **Exhaust vectors:** physics direction applied UNNORMALIZED by KSA ⇒ gizmo writes unit vectors, typed/imported values stay verbatim + warned; FX direction must NEVER be normalized (stock ships non-unit values). Location transforms through owner's full matrix (scale), direction through rotation only — two different frames.
- **FX pair is inherit-vs-override**: emit `<FxExhaustLocation/Direction>` iff overridden (`null` = inherit); writing inherited values converts an inherit into a hard override.
- **One SubPart-owned nozzle = N in-game thrusters** (one per placement); the editor must draw a handle per placement and edits move all N. Independent thrusters require part-level nozzles.
- Mixture reactions REQUIRE `<MixtureRatio>` (KSA throws); picking a reaction resets the ratio to its default (KSA-designer behavior).
- Solid rules: `<Rocket>` all-solid or all-liquid; solid rocket ≥1 nozzle; thruster controller can't drive a solid; solid motor needs `Category="Solid"` reaction with pressure in `(minBurn, maxStable]`; `<SolidMotorNozzle>` has NO AreaRatio; solid custom reactions need all four burn-rate fields or are OMITTED from export.
- Plumbing: empty connector capabilities = implicit `Electricity|ServiceFluid`; Bulk plumbing needs `BulkFluid` both ends; `<ConsumerFeedWiring>` may not defer to Parent; `createCombustor` defaults `feeds:[{kind:'parent'}]`.
- `<ReactionPlume>` list semantics (5056): first reaction-match, else first `Default="true"`, else none.
- Serializer omits defaults (efficiencies 1, dir −X, ExhaustLight true, ConstrainToCircle true, 0/0 gimbal); units: MaxPressure Bar, ExitDiameter M/Cm, angles Degrees, MinimumPulseTime Seconds.
- `ControlMap` CSV is verbatim string passthrough (no enum validation).
- Sentinel ids `'\0root'` / `'\0none'` / `'\0part'` in Selects — any Select rework must preserve "current value stays selectable even when unknown" and the root/none options.
- Catalog may be ABSENT (OSS build): authoring + export must work without `Reactions.xml`; `KNOWN_REACTIONS` static fallback backs the dropdown.

**App conventions:**

- ALL numeric fields via `PreciseNumberInput` → `useNumberDraft` + `inputMode="url"` (mobile minus-key; empty≠0; ".06"/"-" typeable). Non-negotiable project-wide.
- Undo convention: discrete = one step per action; streaming = caller pushes undo at interaction start (`onInteractionStart`/`onFocus`/drag-start). Ephemeral designer state stays out of undo.
- Bar⇄Pa display conversion (stored SI).
- Handle colors amber/cyan match KSA's in-game debug overlay — a deliberate cross-tool color language.
- Defensive `NozzleRef` resolution (stale refs no-op / degrade) must survive any store refactor.
- No data migration ever: model current KSA build only; boot purge discards stale projects.

---

## 6. Hotkeys

**None.** The engine area registers zero hotkeys (verified: no engine references in `src/ui/hotkeys/registry.ts` / `GlobalHotkeys.tsx`). It _inherits_ global ones indirectly: the tool-mode keys and gizmo interactions flow through `$toolMode` (clamped by `$effectiveToolMode`), and global undo/redo applies to engine document edits. No Escape-to-exit-mode, no keyboard nozzle cycling. (v2 opportunity, but nothing to preserve.)

---

## 7. Cross-area dependencies

**Engine → others:**

- `editorStore` (`$part`, `pushUndo`, ~40 engine actions, `$toolMode`); `uiStore` (`$inspectorMode`); `feedTargets.ts` (`feedTargetsOf`, `consumerOptionsOf`, `unwiredConsumersOf` — shared with tanks/containers area); `GameDataSections` (`Field`, `ItemCard` primitives); `FeedsField` (shared with tank/plumbing UI); `coords.ts` `exhaust*` transforms; `TransformGizmo`/`SelectionManager` (shared gizmo + `kind:'nozzle'` selectable route).

**Others → engine:**

- `AddButton` (menu entry → `enterEngineMode`); `AssetsToolbar` (Engine (N) button, `$engineEntries` count); `SelectionToolbar` (`$effectiveToolMode`, `$isExhaustPlacing` — engine clamps the GLOBAL tool switcher); `EditorScene` (handles, proxy, drag write-back); `PartDataButton` + `ManageTanksModal` (host engine sections); `ExportButton` (`validateEngines` merged into export pre-flight); `partXmlSerializer`/`partXmlParser`/`projectCodec` (round-trip); `partCatalog.ts` (importing a Core engine part carries its engine data); import/paste id-remap (`SubPartIdRef.subPartInstanceId`, `Gimbal.subPartInstanceId` — `editorStore.applyImportedGameData` / `projectTransfer.mergeGameData`); connector capability editing (inspector Capabilities row) is the other half of the plumbing contract; tanks/grain segments are the feed targets.

---

## 8. Open questions for v2

1. **Where does plumbing wiring live?** ConsumerFeedWiring + connector capabilities are half the "engine works in-game" story but currently split between Part Data modal and connector inspector. Fold into engine mode (self-sufficient mode) vs keep as a part-level "data" concern?
2. **Keep or kill the dual modal/mode editing routes?** SubPart Data + Part Data modals duplicate the mode's editors. v2 could make the mode canonical and reduce modals to read-only/summary, or keep both for the "no-3D quick edit" path.
3. **Validation surfacing:** persistent issues panel inside engine mode (status-bar badge? right-rail list?) vs current export-time-only aggregate. Also whether to adopt the 5091 warning parity (gap Q4) as part of the refactor.
4. **Legacy "SRB (approximate)" preset:** retire (real solid hardware exists), keep as documented convenience, or rebuild creation as a single "New engine" wizard with type choice (liquid / RCS / solid / SRB-fake)?
5. **Per-rocket performance readout:** stay first-pair-only, or aggregate per Rocket/controller like KSA's part tooltip (sum chambers), and add the solid thrust-curve preview (needs the ~200-line grain-geometry port — separately tracked scope gap)?
6. **Reaction-keyed `<ReactionPlume>` authoring** (gap P1): expose the full list editor in v2 or keep default-entry-only?
7. **Engine-mode hotkeys:** none exist — should v2 add Escape-to-close, nozzle cycling, gizmo toggle? (Free design space, nothing to preserve.)
8. **New-engine picker granularity:** per-placement rows (current) vs per-template rows with an instance sub-pick — the current UI implies per-instance engines that don't exist.
9. **Custom propellant editor placement:** it's project-level data (top-level `<FixedReaction>` export) living inside the engine mode's disclosure — v2 asset-management overlay candidate?
