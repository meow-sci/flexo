# Engine Wizards — Implementation Plan

Status: **IMPLEMENTED** (2026-08-12) — all three families ship; Phases W0–W7 complete.
Authored: 2026-08-11 · KSA baseline: 2026.8.19.5261 (game-contract surface unchanged by this
feature; see §1.6)

Deviations from the plan as written, all deliberate:

- `buildWizardPart` takes a fourth `layerId` argument instead of calling `currentLayerId(part)`
  internally — that helper reads the `$activeLayerId` nanostore, and the model must stay a pure
  function so the Review step's findings are computed on exactly the document Finish commits.
- `applyEngineWizard` takes the finished `EditingPart` rather than the whole
  `WizardBuildResult`, so `src/state` never imports from `src/ui`. It performs no post-set
  clamps: `addEngine` and its neighbours perform none either, and the wizard only adds
  entities, so no existing reference can go stale.
- The candidate is built in the dialog's `goTo()` navigation handler, not in the render body
  (it mints ids) and not in an effect (oxlint's `react-hooks-js/set-state-in-effect` forbids
  it). Findings stay derived per render so they stay correct if the reaction catalog finishes
  loading mid-review.
- `StepReview` receives its performance headline as a prop; computing it inside the file would
  mean exporting a helper beside a component, which breaks React Fast Refresh.
- Two repairs the plan did not anticipate, both found in browser acceptance and both covered by
  tests: `withGeometry` re-points a feed that named the wizard's own attach node when hosting
  leaves generated geometry, and `withSegmentCount` re-divides the casing when the SRB segment
  count changes.

User-facing documentation: [docs/engine-wizards.md](../docs/engine-wizards.md).

Three guided wizards — **Liquid rocket**, **Solid rocket booster (SRB)**, **RCS thruster** —
that walk the user through a short sequence of steps and produce a **fully defined, exportable
engine part**: geometry (generated primitives or an existing mesh template), the complete
module graph (combustor/nozzle/rocket/controller or solid trio), a resolving propellant feed,
gimbal, exhaust FX, dry mass, collider, and editor tags — everything the stock game engine
part XML definitions carry *within flexo's modeled surface*.

This document is written so that implementing agents need **zero architectural judgment**:
every type, default, formula, file path, and acceptance criterion is spelled out. When a task
says "mirror function X at file:line", the implementer must read that function before writing
code and copy its semantics exactly. Do not re-derive anything settled here.

---

## 0. Why, and what "done" looks like

Importing stock engines works today, and the manual path (ENGINE_TUTORIAL.md) works but takes
14 error-prone steps across 4 modes. The wizard compresses that into one dialog per engine
family. Definition of done:

1. `Add ▸ Engine Wizard…` (and an "Engine wizard…" item in the Engine navigator's ＋ menu)
   opens a stepped dialog.
2. Completing the Liquid wizard with all defaults on an **empty part** yields a part that:
   renders in the viewport, shows real thrust/Isp in the Performance card, shows
   **`Issues — no issues`**, and exports XML whose element inventory matches the tutorial's
   "What you built" tree (combustor + nozzle + rocket + controller + tank + wiring + gimbal
   in *both* documents + connector + plume + collider + CustomMass).
3. Same for SRB (SolidMotor + SolidGrainSegment(s) + SolidMotorNozzle + rocket + engine
   controller + `Booster` tag) and RCS (Service-plumbed pulsed combustor(s) + N nozzles +
   thruster controller + `RCS` tag; part-level or SubPart-level).
4. The whole commit is **exactly one undo step**. Undo returns the document to its
   pre-wizard state including generated meshes.
5. The Review step shows the live `validateEngines` result for the candidate part **before**
   commit; Finish is disabled while blockers exist.

---

## 1. Locked decisions

These were weighed during planning; do not re-litigate them.

- **D1 — One dialog, three families.** A single `'engine-wizard'` `DialogId` hosts all three
  wizards. `openDialog({id: 'engine-wizard', params: {family?: WizardFamily}})`; when
  `family` is absent the first screen is a family chooser. The existing quick
  "Define new engine" navigator flow (`DefineEngineMenu` / `$engineDefineFlow`) is
  **untouched** — the wizard is additive, not a replacement.
- **D2 — Pure model + dialog-local React state.** All wizard logic lives in a pure,
  unit-testable model module (`wizardModel.ts` — state types, step validation,
  `buildWizardPart`). The dialog holds the state in `useState` at its root (DialogRoot
  mounts only the open dialog, so state resets per open — the sanctioned pattern, see
  `src/ui/shell/DialogRoot.tsx` header comment). No new nanostore for wizard state.
- **D3 — Build the whole candidate part purely, commit it in one shot.**
  `buildWizardPart(currentPart, state, mint)` returns the complete next `EditingPart`.
  Commit = new `applyEngineWizard(result, detail)` in `editorStore.ts`: one `pushUndo`, one
  `$part.set`. Geometry creation is **inlined** into the built part — never call
  `addCustomMesh`/`addSubPart` from the wizard (each pushes its own undo step; the
  `addCustomMesh` doc comment even claims one step but it takes two — known gotcha).
- **D4 — Review = validateEngines on the candidate.** The Review step runs the real
  `validateEngines(candidatePart, $allReactionIndex)` (pure) and renders its findings.
  Blockers disable Finish; warnings do not.
- **D5 — Geometry sources.** Every wizard offers: **Generate primitive geometry**
  (axis-along-X Box primitives — Boxes only, per the tutorial's cylinder-axis trap:
  `THREE.CylinderGeometry`'s axis is Y and rotating the placement rotates the gimbal
  frame) or **Use an existing mesh template** (templates without engine hardware, via
  `defineTargetsOf`). RCS additionally offers **Part-level (no geometry)** — the stock MMU
  pattern.
- **D6 — No viewport interaction inside the wizard.** Everything is typed/derived. For
  generated geometry the exhaust location is computed exactly; for template geometry the
  Review step offers "Place exhaust in 3D after finishing" which arms the existing exhaust
  tool post-commit.
- **D7 — Numeric fields** use the `ParamNumberField` pattern from
  `src/ui/CreateMeshDialog.tsx` (kit `TextField` + `useNumberDraft` + `inputMode="url"`).
  Never `Number(v)` controlled fields, never `type="number"`.
- **D8 — Id minting is injected.** `buildWizardPart` takes `mint: () => string` (8-hex).
  Production passes a wrapper over `randomId()` (`src/state/ids.ts:12` — never
  `crypto.randomUUID`, undefined outside secure contexts, see mobile audit). Tests pass a
  deterministic counter.
- **D9 — Wizard state units are UI units** (bar, %, ms, degrees, m). `buildWizardPart`
  converts to document units (Pa = bar × 1e5 — reuse `PA_PER_BAR` from
  `src/ui/engine/editorKit.ts`; fractions = % ÷ 100; seconds = ms ÷ 1000).
- **D10 — Cancel with dirty state** uses `InlineConfirmStrip` in the dialog footer
  (stacking is banned and `ConfirmDialog` is blessed only for top-level confirms —
  `dialogStore.ts` header). "Dirty" = the user advanced past the first step or edited any
  field (track a single `dirty: boolean` set by every `setState` merge).
- **D11 — SRB = real `<SolidMotor>`.** The wizard's SRB family authors the solid trio.
  The legacy "SRB preset (fixed-thrust liquid fake)" stays only in the old quick-define
  menu; the wizard does not offer it.
- **D12 — v1 RCS is one controller + one rocket + N nozzles** (the stock
  `CorePropulsionB` block pattern; `controlMapFlags: null` ⇒ KSA auto-derives the control
  map from geometry). The MMU pattern (one controller/rocket/combustor *per control
  group* with explicit `ControlMap`) is a listed follow-up, not v1.

---

## 2. Codebase facts (verified 2026-08-11 — cite, don't re-derive)

### 2.1 Document model & mutation

| Thing | Where |
|---|---|
| Active part document | `$part: atom<EditingPart>` — `src/state/editorStore.ts:115` |
| `EditingPart` (partId, editorTags, gameData, subPartGameData, placements, connectors, colliders, customMeshes, …) | `src/ksa/types.ts:2247` |
| `PartGameData` engine lists: `rocketControllers, rockets, combustors, nozzles, tanks, solidMotors, solidNozzles, solidGrainSegments, consumerFeedWiring, gimbals`, plus `customMass: number \| null` (`:1212`) | `src/ksa/types.ts:1208` |
| `SubPartGameData` (`subPartTemplateId, tanks, combustors, nozzles, rockets, solidMotors, solidNozzles, solidGrainSegments`, …) | `src/ksa/types.ts:1293` |
| Module factories: `createCombustor` `:1431`, `createNozzle` `:1452`, `createRocket` `:1471`, `createRocketController` `:1480`, `createGimbal` `:1494`, `createSolidMotor` `:1134`, `createSolidMotorNozzle` `:1146`, `createSolidGrainSegment` `:1171`, `createTank` `:1333`, `createSubPartGameData` `:1414` | `src/ksa/types.ts` |
| Undo: `pushUndo(description, detail)` `:585`; snapshot-based, no transaction object. Batch idiom = one `pushUndo`, clone `$part`, mutate everything, one `$part.set` (model: `addSolidEngine` `:3906`) | `src/state/editorStore.ts` |
| Existing composites to imitate: `addEngine` `:3819`, `addRcsEngine` `:3865`, `addSolidEngine` `:3906` | `src/state/editorStore.ts` |
| Id minting for modules: `uniqueModuleId(base, taken)` `:3048`, `allEngineModuleIds(part)` `:3065` — **module-private today; task W1.4 exports them** | `src/state/editorStore.ts` |
| Connector creation semantics (id `_connectorN`, empty flags/caps, `currentLayerId`): `addConnector` `:1200` | `src/state/editorStore.ts` |
| Collider creation/sizing semantics: `addCollider` `:1226`, `setColliderSize` `:1294`; `PartCollider` `types.ts:160` (extends `Transform`; `subPartTemplateId: null` ⇒ part-level), `ColliderShape = 'Box'\|'Sphere'\|'Cylinder'\|'Capsule'` `types.ts:127` | `src/state/editorStore.ts`, `src/ksa/types.ts` |
| Custom meshes: `addCustomMesh` `src/state/customAssetStore.ts:1379` (mints `id = mesh_<8hex>`, `subPartId = flexo_<Sanitized>_<8hex>`, seeds `faceTextures` from `PRIMITIVE_FACE_KEYS[kind]`); `scheduleRebuild()` `:1073` is **private today; task W1.5 exports a wrapper**. A `$part` subscription near `:2477` already rebuilds on external part changes (this is what makes undo of wizard-created meshes work). | `src/state/customAssetStore.ts` |
| Placement instance-id minting (`<last dot-segment lowercased>_<count+1>`): `addSubPart` `:747` | `src/state/editorStore.ts` |
| Part registry: `createPart(name?)` `src/state/partsStore.ts:429` (switches active, non-undoable by invariant I6) | `src/state/partsStore.ts` |

### 2.2 Engine mode, validation, physics

| Thing | Where |
|---|---|
| Mode switch: `setMode('engine', payload)`; `EngineModePayload {defineNew?, templateId?, engineScope?, group?}` | `src/state/modeStore.ts`, `src/state/engineStore.ts:647` |
| Scope/focus: `activateEngine(entry)` `:548`, `focusModule(ref)` `:539`, `EngineEntry`, `EngineModuleRef` | `src/state/engineStore.ts` |
| Exhaust tool arming: `setActiveNozzleRef(ref)`, `setExhaustPlacing(true)`, `NozzleRef` | `src/state/engineStore.ts` (~`:402`) |
| Validation: `validateEngines(part, reactions?): EngineIssue[]` (pure; `severity: 'block'\|'warn'`, stable `code`) | `src/ksa/engineValidation.ts:263` |
| Reactions: `$allReactions`, `$allReactionIndex`, `ensureReactionsLoaded()`; `ReactionData` (`Fixed` w/ `minimumBurnPressurePa`/`maxStablePressurePa`/`burnRate`, `Mixture` w/ `defaultMixtureRatio`); `mixtureRatioBounds(reaction)`; fallback `KNOWN_REACTIONS` `types.ts:779` | `src/state/reactionStore.ts`, `src/ksa/reactionCatalog.ts` |
| Reaction picker (reuse as-is): `ReactionPicker({label, value, kind: 'combustor'\|'solid', onPick(reactionId, defaultMixtureRatio)})` | `src/ui/engine/ReactionPicker.tsx` |
| Liquid physics: `predictPerformance(input): EnginePerformance` (`thrustVacN, thrustSLN, ispVac, ispSL, massFlowRate, throatDiameterM, flowSeparationSeveritySL, …`), `resolveReactionLut(reaction, mixtureRatio)` | `src/ksa/enginePhysics.ts:538`, `src/ksa/reactionCatalog.ts:282` |
| Solid physics: `sampleThrustCurve`, grain catalog `$grainIndex`, densities `$solidDensities`, `ensureSolidCurveDataLoaded()` | `src/ksa/solidMotorPhysics.ts`, `src/state/solidCurveStore.ts` |
| Engine-free template targets: `defineTargetsOf(part, engineTemplateIds)`, and the engine-template set used by `EngineNavigator` (read how `$engineEntries` derives it in `engineStore.ts`) | `src/ui/engine/defineEngineModel.ts` |
| Collider fitting math (not needed for generated boxes — analytic — but available): `fitCollider(shape, points, frame?, margin?)` | `src/ksa/colliderFit.ts:86` |

### 2.3 UI kit & registration

| Thing | Where |
|---|---|
| Dialog registry: add id to `DialogId` (`src/state/dialogStore.ts:31` union) **and** a case in `src/ui/shell/DialogRoot.tsx` (its header comment is the checklist) | |
| Modal frame: `Modal({variant: 'fullscreen', className})` + `Dialog` + `DialogHeader({title, onClose})`; body `flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3`; pinned footer `shrink-0 border-t border-border p-3` (copy `ExportKsaDialog.tsx:519-560`) | `src/ui/kit/Modal.tsx` |
| Kit: `Button, ToggleButton(Group), TextField, Select, Checkbox, Switch, Field, SectionTitle, ItemCard, GridList, InlineConfirmStrip, DisclosureSection, noteBox/warningBox/dangerBox` — import from `src/ui/kit` barrel only. **No Tabs, no NumberField exist.** | `src/ui/kit/index.ts` |
| Numeric field pattern: `ParamNumberField` local component at the bottom of `src/ui/CreateMeshDialog.tsx`; `useNumberDraft` in `src/ui/numberDraft.ts` | |
| Command + menu: command in `src/ui/commands/addCommands.ts` (`Command {id, title, menuPath?, run}` via `registerCommand`), `command('<id>')` entry in `ADD_MENU` at `src/ui/menu/menuSpec.ts:139`, label added to `src/ui/menu/menuSpec.test.ts` | |
| Findings display: `FindingsList` (used by `IssuesSection`) — reuse if its props accept a static list; otherwise a local list with severity chips | `src/ui/data/FindingsList.tsx` |
| Toast: whatever `CreateMeshDialog` imports (`toast(...)`) | |
| Phone check: `useIsPhone()` from kit | |

### 2.4 FX / material constants

| Constant | Value | Where |
|---|---|---|
| `VOLUMETRIC_EXHAUST_IDS` | `EngineALarge, EngineAMed, EngineACompact, EngineAVernier, EngineATurbine, RCS, MmuRcsVac` | `src/ksa/types.ts:799` |
| `PLUME_TRAIL_IDS` | `['DefaultPlumeTrail']` | `src/ksa/types.ts:817` |
| `DEFAULT_ENGINE_SOUND_ID` | `'DefaultEngineSoundBehavior'` | `src/ksa/types.ts:872` |
| RCS sound id | `'DefaultRcsThruster'` — **no constant exists yet; task W1.3 adds `DEFAULT_RCS_SOUND_ID`** | (stock `Content/Core/Sounds.xml:321`) |
| Grain geometries | `GRAIN_GEOMETRY_IDS = BoostSustain, BoostSustainBoost, Neutral, Progressive, Regressive` | `src/ksa/types.ts:1125` |
| Wall materials (solid phase ids) | `Aluminum.2014(s)`, `Steel.300(s)`, plus `Aluminum.8090/.7075, Titanium.64, Steel.304L, Inconel.718, CarbonFiber, Fiberglass` (append `(s)`) | stock `Content/Core/Materials.xml` |
| Editor tags | `Engines` (liquid), `Booster` (SRB — stock SRBs use this, NOT `Engines`), `RCS` | stock `CoreEditorTagsGameData.xml` |
| `PA_PER_BAR` | `src/ui/engine/editorKit.ts` | |

### 2.5 KSA hard rules the wizard must bake in (decomp-verified)

1. **Thrust axis is local X.** Nozzle default `ExhaustDirection` is `(-1,0,0)`; the gimbal's
   authority vector is `float3(0, sin(MaxAngleY), sin(MaxAngleZ))` — thrust off local X makes
   one gimbal axis a useless roll. Generated geometry therefore uses unrotated Boxes laid
   along X; the wizard never rotates a placement.
2. **`AreaRatio` defaults to NaN in KSA** and silently poisons the engine — always author it
   (flexo's `createNozzle` default 25 covers this; never emit without it).
3. **`MinimumThrottle` 1.0 = on/off**, clamped [0.01, 1].
4. **A solid motor may never be driven by a `RocketThrusterController`** (throws at load) and
   is never throttleable; solid core ⇔ `SolidMotorNozzle` only; a solid rocket needs ≥ 1
   nozzle.
5. **SolidMotor `DefaultPressure`** must satisfy `> MinimumBurnPressure` and
   `≤ MaxStablePressure` of its (Solid-category, burn-rate-bearing, single-reactant Fixed)
   reaction, else load-time exception. APCP: 15–150 bar; DoubleBase: 15–100 bar.
6. **A `ConsumerFeedWiring` entry with zero valid feeds is omitted from export** (and warned);
   `{kind:'parent'}` is illegal inside wiring.
7. **Connector capabilities**: empty = `Electricity | ServiceFluid` (enough for RCS Service
   plumbing); Bulk-plumbed feeds through a connector need `BulkFluid`; SRB case segments via
   connector need `SolidMotorCase`.
8. **Gimbal** lives in both exported documents (geometry declaration + GameData angles);
   0°/0° is dropped/never built. flexo's serializer already handles both — the wizard only
   writes `part.gameData.gimbals`.
9. **MixtureRatio is required** for Mixture reactions (Kerolox/Hydrolox/Methalox/Ethalox/
   Ethanol_HTP/MMH_NTO) and must be omitted (null) for Fixed reactions.
10. **`MinimumPulseTime`** is clamped up to 0.001 s at load.

### 2.6 Scope catalog

The wizard authors only elements flexo already models and exports — **no new game-contract
surface**, so no `scope/` update is required (AGENTS.md rule checked). If during
implementation any *new* XML element/attribute gets modeled, stop and update
`scope/FULL_SCOPE.md` per the constitution.

---

## 3. Stock-derived presets (authoritative numbers)

These tables become `wizardPresets.ts` verbatim. Values were read from
`ksa-game-assemblies/current/Content/Core/CorePropulsion{A,B,C}GameData.xml` and
`decomp/KSA/EngineDesigner.cs`.

### 3.1 Field bounds (from KSA's own in-game Engine Designer)

| Field | Min | Max | Wizard default |
|---|---|---|---|
| Chamber pressure (bar) | 1 | 500 | per preset |
| Area ratio | 1.1 | 300 | per preset |
| Exit diameter (m) | 0.01 | 10 | per preset |
| Thermal/flow/expansion efficiency (%) | 1 | 100 | per preset |
| Min throttle (%) | 1 | 100 | per preset |
| Gimbal max angle (°) | 0 | 45 | 5 (liquid), 6 (SRB) |
| Min pulse time (ms) | 0 | 10000 | 5.4 (RCS) |

### 3.2 Liquid presets (`LIQUID_PRESETS`)

| key | label | pressureBar | areaRatio | exitDiameterM | minThrottlePct | thermalEffPct | flow/expansion | gimbal Y/Z ° | notes |
|---|---|---|---|---|---|---|---|---|---|
| `balanced` | Balanced (default) | 75 | 25 | 1.1 | 40 | 100 | 100/100 | 8/8 | the tutorial engine, ~525 kN vac |
| `sealevel` | Sea-level booster | 150 | 21 | 2.5 | 20 | 100 | 100/100 | 5/5 | LR91 Sea |
| `vacuum` | Vacuum stage | 49 | 49 | 2.5 | 10 | 100 | 100/100 | 2/2 | LR91 Vac |
| `lander` | Deep-throttle lander | 7 | 47 | 2.2 | 1 | 100 | 100/100 | 10/10 | VTR-10 |

Reaction default: `Hydrolox` (picker supplies each reaction's own default O/F: Kerolox 2.3,
Hydrolox 5.5, Methalox 3.6, Ethalox 1.6, Ethanol_HTP 4.5, MMH_NTO 1.65). Presets set the
numbers above but never the reaction.

### 3.3 SRB presets (`SRB_PRESETS`)

| key | label | reaction | pressureBar | thermalEffPct | grainGeometry | exitDiameterM | grain r / wall / len | segments | gimbal |
|---|---|---|---|---|---|---|---|---|---|
| `small` | Small booster | DoubleBase | 45 | 90 | BoostSustain | 0.15 | 0.125 m / 3 mm / 0.25 m | 1 | off |
| `medium` | Medium booster | DoubleBase | 45 | 90 | BoostSustain | 0.32 | 0.25 m / 4 mm / 0.5 m | 1 | off |
| `large` | Large booster (default) | DoubleBase | 45 | 90 | BoostSustain | 0.64 | 0.5 m / 6 mm / 2 m | 1 | off |
| `heavy` | Heavy segmented | APCP | 70 | 95 | Neutral | 1.2 | 1 m / 8 mm / 2 m | 2 | 6°/6° |
| `superheavy` | Super-heavy | APCP | 63 | 95 | Neutral | 3.5 | 2 m / 10 mm / 3 m | 3 | 6°/6° |

Nozzle efficiencies for all SRB presets: flow 95 %, expansion 98 % (matches
`createSolidMotorNozzle` defaults). Grain wall material: `Steel.300(s)`.

### 3.4 RCS presets (`RCS_PRESETS`)

| key | label | reaction/MR | pressureBar | thermalEffPct | minPulseMs | exitDiameterM | areaRatio | flow/expansion % | layout |
|---|---|---|---|---|---|---|---|---|---|
| `blockLarge` | Thruster block, large (default) | MMH_NTO 1.6 | 7 | 95 | 5.4 | 0.8 | 40 | 100/70 | quad |
| `blockSmall` | Thruster block, small | MMH_NTO 1.6 | 7 | 95 | 5.4 | 0.4 | 40 | 100/70 | quad |
| `micro` | Micro (MMU-class) | MMH_NTO 1.6 | 21 | 75 | 1 | 0.03 | 50 | 72/50 | six |

---

## 4. Architecture

### 4.1 New files

```
src/ui/engine/wizard/
  EngineWizardDialog.tsx      dialog shell: family chooser, step rail, body, footer
  wizardModel.ts              WizardState types, init*State(), step defs, validateWizardStep(),
                              buildWizardPart()   ← pure, ZERO react/store imports
  wizardModel.test.ts
  wizardPresets.ts            §3 tables as consts + types
  wizardGeometry.ts           pure geometry math (§6) — box specs, positions, exhaust points,
                              collider extents
  wizardGeometry.test.ts
  steps/
    StepFamily.tsx            (only when opened without params.family)
    StepStart.tsx             identity + geometry source (all families)
    StepPerformance.tsx       liquid combustor+nozzle numbers, live thrust/Isp
    StepFeed.tsx              liquid/RCS feed source
    StepGimbal.tsx            liquid/SRB
    StepFx.tsx                all families
    StepStructure.tsx         dry mass + collider (all families)
    StepSrbPropellant.tsx     solid reaction + pressure + grain geometry
    StepSrbGrain.tsx          casing/grain dimensions + burn preview
    StepSrbNozzle.tsx
    StepRcsLayout.tsx         nozzle-set presets + per-nozzle table
    StepRcsPropellant.tsx
    StepReview.tsx            summary tree + findings + finish options
  wizardFields.tsx            ParamNumberField clone + shared row helpers
```

Modifications to existing files: `src/ksa/types.ts` (one constant), `src/state/editorStore.ts`
(export two helpers + add `applyEngineWizard`), `src/state/customAssetStore.ts` (export two
helpers), `src/state/dialogStore.ts`, `src/ui/shell/DialogRoot.tsx`,
`src/ui/commands/addCommands.ts`, `src/ui/menu/menuSpec.ts` + test,
`src/ui/engine/DefineEngineMenu.tsx` (one menu item).

### 4.2 Data flow

```
openDialog({id:'engine-wizard', params:{family?}})
        │
EngineWizardDialog
  state: useState<WizardState | null>   (null ⇒ family chooser)
  const part = useStore($part)          (frozen semantics: steps read it, never write)
  const reactions = useStore($allReactionIndex)
  result = buildWizardPart(part, state, mint)      // recomputed per render; React Compiler memoizes
  findings = validateEngines(result.part, reactions)
        │  Finish (enabled when no 'block' findings and every step valid)
        ▼
applyEngineWizard(result, detail)        // editorStore: ONE pushUndo + $part.set
await rebuildCustomMeshes()              // only when result.createdMeshIds.length > 0
closeDialog()
setMode('engine', {engineScope: result.engineScope})
activateEngine(result.engineScope); focusModule(result.focus)
if (state.review.armExhaustTool && result.exhaustNozzleRef)
    { setActiveNozzleRef(result.exhaustNozzleRef); setExhaustPlacing(true) }
toast('Engine created — <thrust summary>')
```

On dialog mount: `ensureReactionsLoaded()`; for SRB additionally
`ensureSolidCurveDataLoaded()` (fire-and-forget, same as engine mode's onEnter does).

### 4.3 Core model signatures (verbatim — implement exactly)

```ts
// wizardModel.ts — pure. Imports allowed: src/ksa/* (types, validation, physics,
// reactionCatalog, solidMotorPhysics), wizardPresets, wizardGeometry. NO react, NO stores.

export type WizardFamily = 'liquid' | 'srb' | 'rcs';

export type WizardGeometrySource =
  | { kind: 'generate' }
  | { kind: 'template'; templateId: string }
  | { kind: 'part' }; // RCS only

export interface WizardIdentity {
  /** Applied only when the current part id is unset/default; blank ⇒ leave untouched. */
  partId: string;
  displayName: string;
}

export interface LiquidWizardState {
  family: 'liquid';
  identity: WizardIdentity;
  geometry: WizardGeometrySource; // 'part' invalid for liquid
  gen: { bellWidthM: number; bellCrossM: number; bodyLengthM: number; bodyCrossM: number };
  presetKey: string | null; // last applied preset, display only
  reactionId: string;
  mixtureRatio: number | null;
  chamberPressureBar: number;
  minThrottlePct: number;
  thermalEffPct: number;
  exitDiameterM: number;
  areaRatio: number;
  flowEffPct: number;
  expansionEffPct: number;
  feed:
    | { kind: 'tank'; feedId: string; shape: 'Cylindrical' | 'Spherical';
        lengthM: number; outerRadiusM: number; wallMaterialId: string }
    | { kind: 'connector'; connectorId: string | null } // null ⇒ the wizard-created node
    | { kind: 'container'; containerId: string; subPartInstanceId: string | null };
  addAttachNode: boolean;       // default true when geometry.kind === 'generate'
  attachNodeBulkFluid: boolean; // default false; forced true when feed.kind==='connector' && connectorId===null
  gimbal: { enabled: boolean; maxYDeg: number; maxZDeg: number; constrainToCircle: boolean };
  fx: { volumetricExhaustId: string | null; fxExitDiameterM: number | null;
        exhaustLight: boolean; engineSound: boolean };
  structure: { dryMassKg: number | null; autoCollider: boolean };
  review: { armExhaustTool: boolean };
}

export interface SrbWizardState {
  family: 'srb';
  identity: WizardIdentity;
  geometry: WizardGeometrySource; // 'part' invalid
  gen: { casingOuterRadiusM: number; casingLengthM: number; nozzleBlockM: number };
  presetKey: string | null;
  reactionId: string;              // Solid category only
  defaultPressureBar: number;
  thermalEffPct: number;
  grainGeometryId: string;         // one of GRAIN_GEOMETRY_IDS
  grain: { outerRadiusM: number; wallThicknessMm: number; lengthM: number;
           wallMaterialId: string; segmentCount: number /* int 1..8 */ };
  acceptCaseSegmentsViaConnector: boolean; // adds SolidMotorCase connector + motor feed
  nozzle: { exitDiameterM: number; flowEffPct: number; expansionEffPct: number };
  gimbal: { enabled: boolean; maxYDeg: number; maxZDeg: number; constrainToCircle: boolean };
  fx: { plumeTrail: boolean; volumetricExhaustId: string | null;
        exhaustLight: boolean; engineSound: boolean };
  structure: { dryMassKg: number | null; autoCollider: boolean };
  review: { armExhaustTool: boolean };
}

export interface RcsNozzleSpec { location: Vec3; direction: Vec3 } // direction unit length

export interface RcsWizardState {
  family: 'rcs';
  identity: WizardIdentity;
  geometry: WizardGeometrySource; // all three kinds legal
  gen: { blockSizeM: number };
  presetKey: string | null;
  layout: { preset: 'single' | 'quad' | 'six' | 'custom'; nozzles: RcsNozzleSpec[] };
  reactionId: string;             // non-Solid; default 'MMH_NTO'
  mixtureRatio: number | null;
  maxPressureBar: number;
  thermalEffPct: number;
  minPulseMs: number;
  exitDiameterM: number;
  areaRatio: number;
  flowEffPct: number;
  expansionEffPct: number;
  feed:
    | { kind: 'connector'; connectorId: string | null }
    | { kind: 'tank'; feedId: string; outerRadiusM: number; wallMaterialId: string } // Spherical, roleAffinity 'Thruster'
    | { kind: 'container'; containerId: string; subPartInstanceId: string | null };
  addAttachNode: boolean;
  controlMapFlags: string[] | null; // null ⇒ auto (v1 UI: advanced disclosure, default null)
  fx: { volumetricExhaustId: string | null; exhaustLight: boolean; rcsSound: boolean };
  structure: { dryMassKg: number | null; autoCollider: boolean };
  review: { armExhaustTool: boolean };
}

export type WizardState = LiquidWizardState | SrbWizardState | RcsWizardState;

export function initLiquidState(part: EditingPart): LiquidWizardState; // defaults = 'balanced' preset + Hydrolox/5.5 + tank feed 'fuel_main'
export function initSrbState(part: EditingPart): SrbWizardState;      // defaults = 'large' preset
export function initRcsState(part: EditingPart): RcsWizardState;      // defaults = 'blockLarge' + quad layout

export type WizardStepId =
  | 'start' | 'performance' | 'feed' | 'gimbal' | 'fx' | 'structure'
  | 'srb-propellant' | 'srb-grain' | 'srb-nozzle'
  | 'rcs-layout' | 'rcs-propellant'
  | 'review';

export interface WizardStepDef { id: WizardStepId; title: string }
export function stepsFor(family: WizardFamily): readonly WizardStepDef[];
// liquid: start, performance, feed, gimbal, fx, structure, review
// srb:    start, srb-propellant, srb-grain, srb-nozzle, gimbal, fx, structure, review
// rcs:    start, rcs-layout, rcs-propellant, feed, fx, structure, review

/** Per-step blocking problems, as user-facing sentences. Empty ⇒ step valid, Next enabled. */
export function validateWizardStep(
  state: WizardState, step: WizardStepId, part: EditingPart,
  reactions: ReadonlyMap<string, ReactionData> | undefined,
): string[];

export interface WizardSummaryRow { kind: string; id: string; note: string }

export interface WizardBuildResult {
  part: EditingPart;                    // full candidate document
  summary: WizardSummaryRow[];
  engineScope: EngineEntryLike;         // {kind:'subpart', templateId} | {kind:'part'}
  focus: EngineModuleRefLike;           // {group, scope, index}
  createdMeshIds: string[];
  exhaustNozzleRef: NozzleRefLike | null;
  detail: string;                       // undo detail, e.g. 'liquid · bell_1'
}
// EngineEntryLike / EngineModuleRefLike / NozzleRefLike: structurally identical local type
// aliases of engineStore's EngineEntry / EngineModuleRef / NozzleRef, re-declared (or
// imported as types only) so wizardModel keeps zero runtime store imports.

export function buildWizardPart(
  current: EditingPart, state: WizardState, mint: () => string,
): WizardBuildResult;
```

---

## 5. `buildWizardPart` — exact algorithms

All families share the preamble and postamble; §5.2–§5.4 are the family cores. Every id that
must be unique in the engine-module namespace goes through
`uniqueModuleId(base, allEngineModuleIds(part).<pool>)` (exported by task W1.4). Clone with
`structuredClone`.

### 5.1 Preamble (all families)

1. `const part = structuredClone(current)`.
2. Identity: if `state.identity.partId.trim()` is non-blank AND the current `part.partId` is
   unset/default (locate and reuse the existing `isDefaultPartId` helper — search the repo;
   `partsStore.ts:429`'s comment names it), set `part.partId` to the sanitized draft. Sanitize
   with the same helper `addCustomMesh` uses for `subPartId` minting (a local function near
   `customAssetStore.ts:1379`; task W1.5 exports it as `sanitizeIdSegment`). If
   `displayName` non-blank ⇒ `part.gameData.displayName = displayName.trim()`.
3. Geometry:
   - `kind === 'generate'`: for each generated box from `wizardGeometry.ts` (§6):
     - Build a `CustomMesh` via the new exported pure helper
       `makePrimitiveCustomMesh(name, primitive, mint)` (task W1.5 extracts it from
       `addCustomMesh` so the field set can never drift) and push into
       `part.customMeshes`.
     - Push a `SubPartPlacement` `{instanceId, subPartTemplateId: mesh.subPartId,
       layerId: <current active layer — pass in as an arg? NO: use DEFAULT_LAYER_ID's
       equivalent by reusing the same "currentLayerId(part)" logic — export/copy the tiny
       helper from editorStore>, position: <from geometry math>, rotation: {x:0,y:0,z:0},
       scale: {x:1,y:1,z:1}}`. Instance id = `<last '_'-free lowercased mesh name>_1`
       matching `addSubPart` `:747` semantics.
     - Record ids in `createdMeshIds`.
     - The **engine host template** is the bell (liquid) / motor body (SRB) / block (RCS).
   - `kind === 'template'`: host template = `state.geometry.templateId`; host instance =
     its first placement's `instanceId` (or null if none — then gimbal step is disabled).
   - `kind === 'part'` (RCS only): no host template.
4. Attach node: when `state.addAttachNode` (default true only for generated geometry):
   push a `Connector` `{id: nextConnectorId(part) /* mirror addConnector :1200 */,
   position: <forward face x from geometry math>, rotation: 0, scale: 1, flags: [],
   capabilities: state.attachNodeBulkFluid ? ['BulkFluid'] : [], siblingIds: [],
   layerId: same as placements}`.

### 5.2 Liquid core

Let `spd = getOrCreateSubPartData(part, hostTemplateId)` (mirror `editorStore.ts:2709` —
task W1.4 exports it too).

1. Ids: `combId = uniqueModuleId('ThrustChamber', taken.combustors)`,
   `nozId = uniqueModuleId('Nozzle', taken.nozzles)`, `rocketId = uniqueModuleId('Engine',
   taken.rockets)`, `ctrlId = uniqueModuleId('Engine', taken.controllers)`.
2. Combustor: `createCombustor(combId)` then patch:
   `reactionId`, `mixtureRatio` (**null when the reaction is Fixed**; UI keeps it in sync via
   `ReactionPicker.onPick`), `maxPressurePa = chamberPressureBar * PA_PER_BAR`,
   `thermalEfficiency = thermalEffPct/100`, `minimumThrottle = minThrottlePct/100`,
   `plumbing: 'Bulk'`, `feeds: [{kind:'parent'}]`. Push to `spd.combustors`.
3. Nozzle: `createNozzle(nozId)` then patch: `exitDiameterM`, `areaRatio`,
   `flowEfficiency`, `expansionEfficiency`, `fxExitDiameterM: state.fx.fxExitDiameterM`,
   `exhaustLocation: {x: -bellWidthM/2, y: 0, z: 0}` for generated geometry
   (`{0,0,0}` for template geometry), `exhaustDirection: {x:-1,y:0,z:0}`,
   `exhaustLight: state.fx.exhaustLight`,
   `sound: state.fx.engineSound ? {action:'On', soundId: DEFAULT_ENGINE_SOUND_ID} : null`
   (read `RocketSoundEvent` in types.ts for exact field names before writing),
   `reactionPlumes: state.fx.volumetricExhaustId ? [{reactionId: null, isDefault: true,
   volumetricExhaustId: state.fx.volumetricExhaustId, plumeTrailId: null}] : []`
   (confirm `ReactionPlume` field names at `types.ts:~830`). Push to `spd.nozzles`.
4. Rocket: `createRocket(rocketId, combId, [nozId])` → `spd.rockets`.
5. Controller: `createRocketController(ctrlId, 'engine', [rocketId])`;
   `rocketRefs[0].subPartInstanceId = hostInstanceId` → `part.gameData.rocketControllers`.
6. Feed:
   - `tank`: push `{...createTank(), id: feedId, shape, lengthM, outerRadiusM,
     wallMaterialId, roleAffinity: 'Engine', locationAsmb: {x: <body centre x for
     generated, 0 otherwise>, y:0, z:0}}` to `part.gameData.tanks`. Wiring feed =
     `{kind:'container', containerId: feedId, subPartInstanceId: null}`.
   - `connector`: wiring feed = `{kind:'connector', connectorId: state.feed.connectorId ??
     <the wizard-created connector id>}`. (Step validation forces `attachNodeBulkFluid`
     true in the `null` case — rule §2.5.7.)
   - `container`: wiring feed = the picked `{kind:'container', ...}`.
   - Push `{consumerId: combId, subPartInstanceId: hostInstanceId, feeds: [feed]}` to
     `part.gameData.consumerFeedWiring`.
7. Gimbal: when `enabled && hostInstanceId != null && (maxYDeg > 0 || maxZDeg > 0)`:
   push `{subPartInstanceId: hostInstanceId, maxAngleYDeg, maxAngleZDeg,
   constrainToCircle}` to `part.gameData.gimbals`.
8. Tag: add `'Engines'` to `part.editorTags` if absent.
9. `engineScope = {kind:'subpart', templateId: hostTemplateId}`;
   `focus = {group:'combustor', scope:'sub', index: spd.combustors.length - 1}`;
   `exhaustNozzleRef = {scope:'subpart', templateId: hostTemplateId, instanceId:
   hostInstanceId, kind:'delaval', index: <nozzle index>, channel:'physics'}`.

### 5.3 SRB core

Host = single SubPart (generated: the casing mesh; the nozzle mesh is cosmetic only).

1. Ids: `motorId = uniqueModuleId('Motor', taken.combustors /* shared solid+liquid pool */)`,
   `nozId = uniqueModuleId('Nozzle', taken.nozzles)`, grains `Grain`/`Grain2`/…
   via `uniqueModuleId` against the `containers` pool, `rocketId = 'SRB'`, `ctrlId = 'SRB'`
   (both uniquified).
2. Grain segments: for `i in 1..segmentCount` push
   `{...createSolidGrainSegment(grainIdᵢ), wallMaterialId, outerRadiusM,
   wallThicknessMm, lengthM, locationAsmb: {x: <segment centre — generated geometry
   stacks them casing-aft-to-forward, §6.2>, y:0, z:0}}` to `spd.solidGrainSegments`.
3. Motor: `createSolidMotor(motorId)` patched: `reactionId`,
   `defaultPressurePa = defaultPressureBar * PA_PER_BAR`,
   `thermalEfficiency = thermalEffPct/100`, `grainGeometryId`,
   `feeds = [each grain: {kind:'container', containerId: grainIdᵢ, subPartInstanceId:
   null}] + (acceptCaseSegmentsViaConnector ? [{kind:'connector', connectorId:
   <case connector id>}] : [])` → `spd.solidMotors`.
4. Case connector (only when `acceptCaseSegmentsViaConnector`): a second `Connector` at
   the casing **forward** face with `capabilities: ['SolidMotorCase']`.
5. Nozzle: `createSolidMotorNozzle(nozId)` patched: `exitDiameterM`,
   `flowEfficiency/expansionEfficiency` (÷100), `exhaustLocation = {x: <aft face>, 0, 0}`,
   `exhaustLight`, sound as liquid, `reactionPlumes`: default plume with
   `plumeTrailId: fx.plumeTrail ? 'DefaultPlumeTrail' : null` and
   `volumetricExhaustId: fx.volumetricExhaustId` (drop the plume entirely when both null —
   use `withDefaultReactionPlume` `types.ts:855` which already handles that) →
   `spd.solidNozzles`.
6. Rocket `createRocket(rocketId, motorId, [nozId])` → `spd.rockets`; controller
   `createRocketController(ctrlId, 'engine', [rocketId])` with `subPartInstanceId` →
   part level. **Never `'thruster'`** (rule §2.5.4).
7. Tag `'Booster'`. Scope/focus: `{group:'solidMotor', scope:'sub', index:…}`;
   `exhaustNozzleRef.kind = 'solid'`.

### 5.4 RCS core

Host = SubPart template, or part level (`geometry.kind === 'part'`).

1. Ids: `combId = 'Thruster'`, `nozIdᵢ = 'Nozzle'/'Nozzle2'/…`, `rocketId = 'Rcs'`,
   `ctrlId = 'Thruster'` (all uniquified).
2. Combustor: `createCombustor(combId)` patched: `plumbing: 'Service'`, `reactionId`,
   `mixtureRatio`, `maxPressurePa`, `thermalEfficiency`,
   `minimumPulseTimeS = max(0.001, minPulseMs/1000)`, `minimumThrottle: 1`,
   `feeds`: SubPart host ⇒ `[{kind:'parent'}]`; part-level ⇒ the feed itself (see step 5).
3. Nozzles: for each `RcsNozzleSpec` push `createNozzle(nozIdᵢ)` patched:
   `exitDiameterM`, `areaRatio`, `flowEfficiency/expansionEfficiency`,
   `exhaustLocation: spec.location`, `exhaustDirection: spec.direction` (unit — layout
   presets emit exact unit vectors),
   `exhaustLight: fx.exhaustLight`,
   `sound: fx.rcsSound ? {action:'On', soundId: DEFAULT_RCS_SOUND_ID} : null`,
   `reactionPlumes`: default plume with `volumetricExhaustId: fx.volumetricExhaustId`
   (default `'RCS'`).
4. Rocket `createRocket(rocketId, combId, allNozIds)`; controller
   `createRocketController(ctrlId, 'thruster', [rocketId])`,
   `controlMapFlags: state.controlMapFlags`. SubPart host: rocket+combustor+nozzles on
   `spd`, controller part-level with `subPartInstanceId`. Part-level: everything in
   `part.gameData` (`nozzles`, `combustors`, `rockets`, `rocketControllers`).
5. Feed:
   - SubPart host: wiring entry `{consumerId: combId, subPartInstanceId: hostInstanceId,
     feeds: [feed]}` exactly as liquid §5.2.6 (tank variant: `shape:'Spherical'`,
     `roleAffinity:'Thruster'`, `lengthM` ignored by serializer for spherical).
   - Part-level: **no wiring entry**; set `combustor.feeds = [feed]` directly
     (`{kind:'parent'}` never appears at part level).
   - `connector` feed with empty capabilities is fine: Service plumbing rides the
     default `Electricity | ServiceFluid` (§2.5.7).
6. No gimbal step for RCS (off-X nozzle directions would trip
   `gimbal-thrust-axis-not-x`; stock RCS has no gimbals).
7. Tag `'RCS'`. Focus: `{group:'combustor', scope: host ? 'sub' : 'part', index:…}`.

### 5.5 Structure (all families, after the core)

1. `dryMassKg != null` ⇒ `part.gameData.customMass = dryMassKg` (plain kg number,
   `types.ts:1212`; leave `customMassExtras` alone).
2. `autoCollider && geometry.kind === 'generate'` ⇒ push one part-level `PartCollider`
   over the generated union AABB (analytic — §6.4). **Mirror `addCollider`
   `editorStore.ts:1226` + `setColliderSize` `:1294` exactly for how id, transform, and
   size are encoded** (read both first; acceptance = exported `<Collider>` has the §6.4
   extents). Liquid/RCS: `shape:'Box'`; SRB: `shape:'Cylinder'` around the casing (axis
   X — encode the axis the way `setColliderSize`/`fitCollider`'s `AXIS_ALIGN.x` does).
   `autoCollider` is forced off (and hidden) for template/part geometry.

### 5.6 Postamble

`summary` rows mirror the tutorial's "What you built" tree — one row per created entity
(placement, connector, tank/grain, each module, wiring, gimbal, collider), with ids and a
short note. `detail` = `` `${family} · ${hostName or partId}` ``.

### 5.7 Commit action (editorStore.ts, next to `addEngine`)

```ts
/** Engine-wizard commit: the ONE undo step for everything the wizard built. */
export function applyEngineWizard(result: WizardBuildResult, detail: string): void {
  pushUndo('engine wizard', detail);
  $part.set(result.part);
  clampSelection();            // same postlude as other composites — read addEngine's tail
  clampActiveLayer?.();        // apply whichever clamps the neighbors call; copy addEngine
}
```

The dialog (not the store) then awaits `rebuildCustomMeshes()` when meshes were created,
closes, and navigates (§4.2). Rationale: keeps editorStore free of async and of
customAssetStore imports.

---

## 6. Generated-geometry math (`wizardGeometry.ts` — pure, tested)

All boxes are **unrotated**, laid along X (Box Width = X). `PrimitiveSpec` shape:
`{kind:'box', params:{width, height, depth}}` — confirm exact param keys against
`src/ksa/types.ts:1620` (`PrimitiveSpec`) and `src/ui/primitiveParamFields.ts` before use.

### 6.1 Liquid (defaults: bellWidth 1.2, bellCross 1.2, bodyLength 2.5, bodyCross 1.2)

| Entity | Value |
|---|---|
| Bell box | W=bellWidthM, H=D=bellCrossM, position `(0,0,0)` — spans X `[-bW/2, +bW/2]` |
| Body box | W=bodyLengthM, H=D=bodyCrossM, position `(bW/2 + bodyLengthM/2, 0, 0)` |
| Connector | `(bW/2 + bodyLengthM, 0, 0)` (forward face; a connector faces its own +X — no rotation) |
| Tank `locationAsmb` | `(bW/2 + bodyLengthM/2, 0, 0)`; default lengthM = bodyLengthM, outerRadiusM = bodyCrossM/2 |
| Exhaust location | `(-bW/2, 0, 0)`; direction `(-1,0,0)` |
| Suggested exit diameter | `round(bellCrossM * 0.9, 1)` — used to seed `exitDiameterM` when the user edits `gen` before visiting Performance (recompute seed only while Performance untouched) |

### 6.2 SRB (defaults: casingOuterRadius 0.5, casingLength 2, nozzleBlock 0.6)

| Entity | Value |
|---|---|
| Nozzle box | W=H=D=nozzleBlockM, position `(0,0,0)` |
| Casing box | W=casingLengthM, H=D=2·casingOuterRadiusM, position `(nozzleBlockM/2 + casingLengthM/2, 0, 0)` |
| Grain segment i (of N) | lengthM = casingLengthM/N; `locationAsmb.x = nozzleBlockM/2 + (i - 0.5)·casingLengthM/N` |
| Attach node | `(nozzleBlockM/2 + casingLengthM, 0, 0)` |
| Case connector (optional) | same position, `capabilities:['SolidMotorCase']` |
| Exhaust location | `(-nozzleBlockM/2, 0, 0)` |

Grain dims default-link: `grain.outerRadiusM = casingOuterRadiusM`,
`grain.lengthM = casingLengthM/segmentCount` — seeded, then independently editable.

### 6.3 RCS (default blockSize 0.3)

Block box W=H=D=blockSizeM at origin. Layout presets (`s = blockSizeM/2`):

| Preset | Nozzles (location → direction) |
|---|---|
| `single` | `(-s,0,0) → (-1,0,0)` |
| `quad` | `(0,+s,0)→(0,1,0)`, `(0,-s,0)→(0,-1,0)`, `(0,0,+s)→(0,0,1)`, `(0,0,-s)→(0,0,-1)` |
| `six` | quad + `(+s,0,0)→(1,0,0)`, `(-s,0,0)→(-1,0,0)` |
| `custom` | user-edited table seeded from the last preset |

For template geometry the same presets emit locations scaled by `s = 0.15` (documented in
the step's helper text as "adjust after with the exhaust tool").

### 6.4 Auto-collider extents

- Liquid Box: X `[-bW/2, bW/2 + bodyLengthM]`, Y/Z `±max(bellCrossM, bodyCrossM)/2` ⇒
  centre `((bodyLengthM)/2, 0, 0)`, lengths `(bW + bodyLengthM, maxCross, maxCross)`.
- SRB Cylinder: axis X, radius `casingOuterRadiusM`, length `nozzleBlockM + casingLengthM`,
  centre `(casingLengthM/2, 0, 0)`.
- RCS Box: the block box itself.

---

## 7. Step-by-step UX spec

Shared dialog chrome (`EngineWizardDialog.tsx`):

- `Modal variant="fullscreen" className="max-w-2xl"`, `Dialog className="h-full"`,
  `DialogHeader title={familyTitle}` (e.g. "Engine Wizard — Liquid rocket").
- Desktop: left rail (`w-40 shrink-0 border-r border-border`) listing `stepsFor(family)`;
  rows show a number chip, title, and a state glyph (✓ done / ● current / ○ upcoming).
  Clicking any **previously visited** step navigates back; forward-jumping is allowed only
  through Next (so validation always runs in order). Phone (`useIsPhone()`): rail becomes a
  horizontal chip row above the body.
- Body: the current step component, `flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3`.
- Footer (pinned): left = Cancel (with `InlineConfirmStrip` swap-in when dirty, label
  "Discard wizard?"); right = `Back` (ghost, hidden on first step) + `Next` (primary) or
  `Finish` (primary, Review only). Next disabled when `validateWizardStep(...)` is
  non-empty — the reasons render under the footer border in `warningBox` style.
- Every numeric field: `WizardNumberField` in `wizardFields.tsx` — a verbatim clone of
  `ParamNumberField` (`CreateMeshDialog.tsx` bottom) with `label`, `suffix?` (unit chip),
  `min/max/step`.

### 7.1 `start` (all families)

- **Identity** section: Part Id (`TextField`, mono, prefilled with current `part.partId`
  when non-default, else `flexo_my_engine`/`flexo_my_srb`/`flexo_my_rcs`); Display Name.
  Helper note (noteBox): "Applied to the current part. Leave blank to keep as-is." When the
  current part already has a non-default id, show the id read-only with "(kept)".
- **Geometry** section: `ToggleButtonGroup` — `Generate primitive geometry` /
  `Use existing mesh` / (RCS only) `Part-level (no geometry)`.
  - Generate: the family's `gen` numeric fields (§6 defaults) + a static ASCII-art-free
    description line of what will be created ("Bell 1.2 m box + body 2.5 m box + forward
    attach node").
  - Existing mesh: `Select` over `defineTargetsOf(part, engineTemplateSet)` rows (template
    display name + placement count); empty ⇒ the option is disabled with reason "every mesh
    template already carries engine hardware" (or "no mesh templates yet").
- Validation: generate dims within (0, 50] m; template chosen when that mode; RCS part-level
  always valid. Family cannot change after leaving this step (the chooser only exists
  pre-init).

### 7.2 `performance` (liquid)

- **Preset** row: `Select` of `LIQUID_PRESETS` + "Apply" — applying overwrites the six
  numeric fields and `gimbal` defaults, sets `presetKey`, never touches reaction/feed.
- **Propellant**: `ReactionPicker kind="combustor"`; Mixture ratio `WizardNumberField`
  (hidden for Fixed reactions; bounds from `mixtureRatioBounds`, shown as helper text).
- **Chamber**: pressure (bar, 1–500), min throttle (%, 1–100; helper: "100 % = on/off
  only"), thermal efficiency (%, 1–100).
- **Nozzle**: exit diameter (m, 0.01–10), area ratio (1.1–300), flow/expansion eff (%).
- **Target thrust helper** (DisclosureSection "Size for a target thrust"): field
  `Target vacuum thrust (kN)` + button `Size exit diameter` →
  `exit' = exitDiameterM · sqrt(targetN / currentPerf.thrustVacN)` clamped to [0.01, 10]
  (valid because thrust scales with exit area at fixed AR/pressure/reaction). Disabled
  with reason when performance is unavailable.
- **Live readout** (bottom card, updates per keystroke commit): Thrust vac/SL, Isp vac/SL,
  mass flow, throat Ø — via `resolveReactionLut($allReactionIndex.get(reactionId),
  mixtureRatio)` + `predictPerformance`. When the LUT is unavailable (catalog still
  loading / unknown reaction) show "performance preview unavailable" — never NaN. Show the
  `flowSeparationSeveritySL` warning ("likely flow separation at sea level") when the
  physics reports it.
- Validation: all bounds; mixture ratio within bounds when Mixture; ratio null when Fixed.

### 7.3 `feed` (liquid, RCS)

- `ToggleButtonGroup`: **New tank** (default) / **From connector** / **Existing
  container** (only enabled when `feedTargetsOf(part).containers` is non-empty —
  `src/state/feedTargets.ts`).
- New tank: Feed id (default `fuel_main` / `rcs_prop`, must be non-blank + unique among
  container ids); liquid: shape select + length + outer radius; RCS: outer radius only
  (spherical); wall material `Select` (§2.4 list, default `Aluminum.2014(s)`).
- From connector: `Select` of existing connectors + "the new attach node" when
  `addAttachNode`; liquid additionally forces/checks **BulkFluid** on the chosen connector
  (auto-tick `attachNodeBulkFluid` for the wizard's own node; for an existing connector
  without BulkFluid show a blocking reason telling the user the wizard will add the
  capability — and add it in `buildWizardPart`). RCS: note "Service plumbing — default
  connector capabilities suffice".
- Attach node `Checkbox` (generated geometry only, default on): "Add a forward attach
  node".
- Validation: tank feedId non-blank/unique; connector selected; container selected.

### 7.4 `gimbal` (liquid, SRB)

`Switch` "Thrust vectoring" (liquid default on 8°/8°? — **default from preset**, tutorial
uses 8; SRB default off except heavy presets) + Max angle Y/Z (°, 0–45) + Constrain to
circle checkbox. Disabled entirely (with `noteBox` reason) when the host template has no
placement or geometry is template-less. Helper: "The gimbal deflects the whole SubPart;
thrust must run along its local X — the wizard guarantees this for generated geometry."

### 7.5 `fx` (all)

- Plume `Select`: `(none)` + `VOLUMETRIC_EXHAUST_IDS`; defaults: liquid `EngineAMed`, SRB
  `(none)` (SRBs use the trail; volumetric optional), RCS `RCS`.
- SRB extra: `Switch` "Plume trail (DefaultPlumeTrail)" default on.
- Liquid extra (Disclosure "Advanced"): Fx exit diameter override (m, optional).
- `Switch` Exhaust light (default on; RCS `micro` preset may set off — keep on, MMU's off
  is cosmetic); `Switch` Engine sound / RCS sound (default on).

### 7.6 `structure` (all)

- Dry mass (kg, optional; helper "Emitted as `<CustomMass>`; leave blank to skip — KSA
  requires Mass > 0 when present"). Preset seeds: liquid `sealevel` 1500, `vacuum` 300,
  `lander` 100, `balanced` 500; SRB small/medium/large/heavy/superheavy
  20/60/300/2000/9000; RCS 40 (blocks) / 5 (micro).
- `Checkbox` "Fit a collider around the generated geometry" (generated only, default on).

### 7.7 `srb-propellant`

`ReactionPicker kind="solid"`; Default pressure (bar) with live bounds readout from the
reaction (`minimumBurnPressurePa`/`maxStablePressurePa` of the `FixedReactionData` —
blocking validation outside `(min, max]`, mirroring `solid-motor-pressure-out-of-range`);
Thermal efficiency (%); Grain geometry `Select` over `GRAIN_GEOMETRY_IDS` with the stock
shape names as descriptions (Tubular=Progressive, Star=Neutral, Wagon Wheel=Regressive,
Double Anchor=BoostSustain, Slotted Tube=BoostSustainBoost).

### 7.8 `srb-grain`

Segment count (int 1–8, steppers), outer radius (m), wall thickness (mm), length per
segment (m), wall material select; `Checkbox` "Accept extra case segments via connector
(SolidMotorCase)". **Burn preview card**: when `$grainIndex`/`$solidDensities` are loaded,
call `sampleThrustCurve` (read its exact signature in `src/ksa/solidMotorPhysics.ts` first)
and show Burn time, Ignition/peak thrust, vac Isp, propellant mass; else "solid curve data
loading…". This card is display-only — no field writes.

### 7.9 `srb-nozzle`

Exit diameter (m), flow/expansion efficiency (%). Note: "Throat area is sized by KSA from
the grain and default pressure — there is no area-ratio field on a solid nozzle."

### 7.10 `rcs-layout`

- Preset `ToggleButtonGroup`: Single / Quad / Six / Custom (switching a preset regenerates
  `layout.nozzles`; editing any cell flips preset to Custom).
- Nozzle table (`GridList` rows): per nozzle, six `WizardNumberField`s (location X/Y/Z,
  direction X/Y/Z) + a per-row Normalize button (reuse the normalize math the
  `NozzleEditor` direction field uses) + remove; "＋ Add nozzle" (max 12).
- Validation: ≥1 nozzle; every direction unit-length within `UNIT_EPSILON` (1e-3, from
  `engineValidation.ts`).
- Advanced disclosure: Control map — default "Automatic (derived from geometry)";
  switching to Manual shows a 12-checkbox grid of the flags
  `RollRight RollLeft PitchUp PitchDown YawRight YawLeft TranslateForward
  TranslateBackward TranslateRight TranslateLeft TranslateDown TranslateUp` →
  `controlMapFlags`.

### 7.11 `rcs-propellant`

Reaction picker (combustor kind; default MMH_NTO), mixture ratio, max pressure (bar),
thermal efficiency (%), minimum pulse time (ms, helper "KSA floors this at 1 ms"), exit
diameter, area ratio, flow/expansion efficiency. Static `noteBox`: "Plumbing: Service —
RCS draws ServiceFluid, which every connector carries by default."

### 7.12 `review` (all)

- **Summary tree**: monospace block rendering `result.summary` (indented like the
  tutorial's "What you built").
- **Performance line**: liquid/RCS `predictPerformance` headline; SRB burn preview
  headline.
- **Findings**: `validateEngines(result.part, reactions)` rendered with severity chips
  (red block / amber warn) — reuse `FindingsList` if its props accept `(findings,
  onSelect?)` with selection disabled; else a 20-line local list. Empty state: "✓ no
  issues".
- **Options**: `Checkbox` "Open the exhaust placement tool after finishing" (visible only
  when `exhaustNozzleRef` exists; default on for template geometry, off for generated).
- **Finish** button label: "Create liquid engine" / "Create solid motor" / "Create RCS
  thrusters". Disabled while any `severity === 'block'` finding exists or any step
  invalid; disabled-reason tooltip lists the first blocker.

---

## 8. Task breakdown

Conventions for every task: run `pnpm test` and `pnpm typecheck` bare (no pipes); oxlint +
oxfmt must pass; no manual memoization (React Compiler); kit imports from the barrel;
follow `.claude/skills/react` rules. Tasks are ordered; within a phase they may be
parallelized unless a dependency is noted.

### Phase W0 — registration & shell (no behavior)

- [ ] **W0.1** `src/state/dialogStore.ts`: add `'engine-wizard'` to `DialogId`.
- [ ] **W0.2** `src/ui/engine/wizard/EngineWizardDialog.tsx`: shell only — Modal
      (fullscreen, max-w-2xl), DialogHeader, empty body "coming soon", footer with
      Cancel. Props: `{params?: unknown; onClose(): void}`; parse
      `params as {family?: WizardFamily}` defensively.
- [ ] **W0.3** `src/ui/shell/DialogRoot.tsx`: add the `'engine-wizard'` case per the
      header-comment checklist, passing `dlg.params` and `onClose={closeDialog}`.
- [ ] **W0.4** `src/ui/commands/addCommands.ts`: register `add.engineWizard`
      (`title: 'Engine Wizard…'`, `run: () => openDialog({id:'engine-wizard'})`).
- [ ] **W0.5** `src/ui/menu/menuSpec.ts`: `command('add.engineWizard')` in `ADD_MENU`
      directly under the existing `add.defineEngine` entry; update
      `src/ui/menu/menuSpec.test.ts` labels.
- [ ] **W0.6** `src/ui/engine/DefineEngineMenu.tsx`: append a `MenuSeparator` + MenuItem
      "Engine wizard…" to the ＋ menu, running the same `openDialog`.
      **Acceptance (W0)**: menu item opens the placeholder dialog; Escape closes; tests
      green.

### Phase W1 — exported plumbing (tiny, high-blast-radius — review carefully)

- [ ] **W1.1** `src/ksa/types.ts`: add
      `export const DEFAULT_RCS_SOUND_ID = 'DefaultRcsThruster';` next to
      `DEFAULT_ENGINE_SOUND_ID` (`:872`) with a doc comment citing
      `Content/Core/Sounds.xml:321`.
- [ ] **W1.2** `src/ui/engine/wizard/wizardPresets.ts`: the §3 tables as typed consts
      (`LIQUID_PRESETS`, `SRB_PRESETS`, `RCS_PRESETS`, `WIZARD_BOUNDS`,
      `WALL_MATERIAL_IDS`, `RCS_CONTROL_FLAGS`). Pure data, no imports beyond types.
- [ ] **W1.3** `src/ui/engine/wizard/wizardGeometry.ts` + test: §6 math as pure functions
      `liquidGeometry(gen)`, `srbGeometry(gen, segmentCount)`, `rcsLayout(preset, s)`,
      `colliderExtents(family, gen)` returning plain data (box specs, positions, points).
      Confirm `PrimitiveSpec` param keys against `types.ts:1620` first.
- [ ] **W1.4** `src/state/editorStore.ts`: add `export` to `uniqueModuleId` (`:3048`),
      `allEngineModuleIds` (`:3065`), `getOrCreateSubPartData` (`:2709`), and the
      current-layer + connector-id helpers used by `addConnector`/`addSubPart` (locate
      `currentLayerId` and `nextConnectorId`; export or extract them). No behavior change;
      grep for name collisions first.
- [ ] **W1.5** `src/state/customAssetStore.ts`: extract from `addCustomMesh` (`:1379`) a
      pure exported `makePrimitiveCustomMesh(name: string, primitive: PrimitiveSpec,
      mint: () => string, textureId?: string): CustomMesh` (all defaulted fields copied
      verbatim — `faceTextures` seeding from `PRIMITIVE_FACE_KEYS[kind]` included) and
      refactor `addCustomMesh` to call it (its own behavior unchanged — including its
      two-undo-step quirk; do NOT "fix" that here). Also export
      `rebuildCustomMeshes(): Promise<void>` wrapping the private `scheduleRebuild`
      (`:1073`), and export the id-segment sanitizer as `sanitizeIdSegment`.
      **Acceptance (W1)**: all existing tests green; `addCustomMesh` behavior identical
      (add a regression test asserting the CustomMesh field set of
      `makePrimitiveCustomMesh` matches what `addCustomMesh` used to build).

### Phase W2 — model core: liquid

- [ ] **W2.1** `wizardModel.ts`: types + `stepsFor` + `initLiquidState` exactly per §4.3
      (defaults: `balanced` preset, Hydrolox/5.5, tank feed `fuel_main`, gimbal on 8/8,
      plume `EngineAMed`, light+sound on, dryMass 500, autoCollider on, geometry
      generate with §6.1 defaults).
- [ ] **W2.2** `validateWizardStep` for liquid steps per §7 rules (bounds from
      `WIZARD_BOUNDS`; feed-id uniqueness against `feedTargetsOf`-style container ids —
      compute locally from the part to keep the model store-free: tank ids + grain ids
      across gameData + every SPD).
- [ ] **W2.3** `buildWizardPart` liquid path per §5.1/§5.2/§5.5/§5.6. Read
      `RocketSoundEvent` and `ReactionPlume` field names in types.ts before writing.
- [ ] **W2.4** `wizardModel.test.ts` (liquid): with a deterministic `mint`,
      (a) default state on `createEmptyPart()` ⇒ `validateEngines(result.part,
      fixtureReactions)` has **zero findings** (build `fixtureReactions` the way
      `engineValidation.test.ts` builds its reaction map — reuse its helpers);
      (b) module graph shape: 1 combustor/nozzle/rocket on the bell SPD, controller +
      wiring + tank + gimbal at part level, tags `['Engines']`, 2 placements,
      1–2 connectors, collider extents per §6.4, `customMass === 500`;
      (c) feed-variant matrix: connector feed forces BulkFluid on the wizard node;
      container feed produces no tank;
      (d) template-geometry variant: no meshes created, exhaust at origin,
      `exhaustNozzleRef` non-null;
      (e) id-collision: running on a part that already has `ThrustChamber`/`Nozzle`
      yields suffixed unique ids everywhere they're referenced (rocket refs, wiring
      consumerId).
- [ ] **W2.5** XML snapshot test (same file or `wizardExport.test.ts`): run the built
      part through `serializePartsXml`/`serializeGameDataXml`
      (`src/ksa/partXmlSerializer.ts:118/:165`) and assert: `<Gimbal>` present in BOTH
      documents; `<Combustor>` carries `<Reaction Id="Hydrolox"><MixtureRatio>`,
      `<MaxPressure Bar="75"/>`, `<MinimumThrottle Value="0.4"/>`;
      `<ConsumerFeedWiring Id="ThrustChamber" SubPartId="...">` with a
      `<FeedsFrom Container="fuel_main"/>`; `<ReactionPlume Default="true">` with
      `<VolumetricExhaust Id="EngineAMed"/>`; `<CustomMass>`; `<Collider>` box extents.

### Phase W3 — liquid UI

- [ ] **W3.1** `wizardFields.tsx`: `WizardNumberField` (ParamNumberField clone +
      `suffix`), `WizardRow`, `StepSection` (SectionTitle + gap column).
- [ ] **W3.2** `EngineWizardDialog.tsx` full shell per §7 chrome: family chooser (three
      `GridListItem` cards with the §1-D1 titles/descriptions) when `params.family`
      absent; step rail; footer with Back/Next/Finish + InlineConfirmStrip cancel;
      `dirty` tracking; `ensureReactionsLoaded()` on mount (+ solid-curve load when
      family srb).
- [ ] **W3.3** `StepStart.tsx` per §7.1 (family-agnostic; renders the family's `gen`
      fields from a small per-family descriptor in `wizardModel.ts`).
- [ ] **W3.4** `StepPerformance.tsx` per §7.2 incl. live readout + target-thrust helper.
- [ ] **W3.5** `StepFeed.tsx` per §7.3; `StepGimbal.tsx` per §7.4; `StepFx.tsx` per
      §7.5; `StepStructure.tsx` per §7.6.
- [ ] **W3.6** `StepReview.tsx` per §7.12 (findings via `validateEngines` on
      `result.part`).
      **Acceptance (W3)**: manual run-through (project-local Playwright per the
      browser-verification convention, base path `/flexo/`): defaults-only Liquid wizard
      on a new project reaches Review with "✓ no issues".

### Phase W4 — commit & navigation

- [ ] **W4.1** `editorStore.ts`: `applyEngineWizard(result, detail)` per §5.7 (copy the
      exact post-set clamps `addEngine`'s tail performs).
- [ ] **W4.2** Dialog Finish handler per §4.2 (commit → `rebuildCustomMeshes()` when
      needed → close → `setMode`/`activateEngine`/`focusModule` → optional exhaust-tool
      arm → toast with the vac-thrust headline).
- [ ] **W4.3** Undo test (`editorStore` or `engineStore` test file): snapshot
      `$historyList` length, run `applyEngineWizard` with a liquid result, assert exactly
      one new entry; `undo()`; assert `$part` deep-equals the pre-commit document.
- [ ] **W4.4** Manual acceptance: finish the wizard on an empty project → part renders
      (meshes rebuilt), Engine mode opens focused on the combustor, Performance card
      shows ~525 kN for `balanced`, Issues empty, `⌘Z` removes everything including
      meshes, `⇧⌘Z` restores (meshes re-render via the `$part` rebuild subscription —
      verify visually).

### Phase W5 — SRB

- [ ] **W5.1** `initSrbState` (defaults `large` preset) + SRB steps in `stepsFor` +
      `validateWizardStep` SRB rules (§7.7–7.9; pressure-vs-reaction bounds need the
      `reactions` arg).
- [ ] **W5.2** `buildWizardPart` SRB path per §5.3/§6.2.
- [ ] **W5.3** Tests: defaults ⇒ zero `validateEngines` findings (feed the fixture map an
      APCP/DoubleBase `FixedReactionData` with burn-rate + pressure bounds); segment
      count N ⇒ N grain segments each wired as a motor feed; connector-case variant adds
      the `SolidMotorCase` connector + feed; controller kind is `'engine'`; tag is
      `Booster`; XML snapshot: `<SolidMotor>` with `<DefaultPressure Bar="45"/>`,
      `<Grain Id="BoostSustain"/>`, `<FeedsFrom Container="Grain"/>`;
      `<SolidGrainSegment><Grain>` dims; `<SolidMotorNozzle>` WITHOUT `<AreaRatio>`.
- [ ] **W5.4** `StepSrbPropellant/Grain/Nozzle.tsx` per §7.7–7.9 (burn preview reads
      `$grainIndex`/`$solidDensities`; display-only).
- [ ] **W5.5** Manual acceptance: defaults ⇒ Review clean; deliberately set pressure
      160 bar on APCP ⇒ step blocks with the bounds message before Review.

### Phase W6 — RCS

- [ ] **W6.1** `initRcsState` (defaults `blockLarge`, quad, connector feed w/ attach
      node) + RCS steps + validation (§7.10–7.11; unit-direction check with
      `UNIT_EPSILON`).
- [ ] **W6.2** `buildWizardPart` RCS path per §5.4/§6.3 — three geometry modes.
- [ ] **W6.3** Tests: quad defaults on subpart ⇒ zero findings; part-level ⇒ modules in
      `part.gameData`, combustor feeds set directly, NO wiring entry; `minPulseMs: 0` ⇒
      `minimumPulseTimeS === 0.001`; `controlMapFlags` passthrough; XML: `<Plumbing>
      Service</Plumbing>`, `<MinimumPulseTime Seconds>`, `<RocketThrusterController>`
      (+`<ControlMap CSV>` when manual), 4 `<DeLavalNozzle>` with distinct
      locations/directions, plume `RCS`, sound `DefaultRcsThruster`.
- [ ] **W6.4** `StepRcsLayout.tsx` + `StepRcsPropellant.tsx` per §7.10–7.11 (reuse
      `StepFeed` with an RCS flag).
- [ ] **W6.5** Manual acceptance: quad block on generated geometry ⇒ clean Review; MMU
      part-level micro preset ⇒ clean Review on a part that has a container to feed
      from (or connector feed).

### Phase W7 — polish, docs, guards

- [ ] **W7.1** Phone pass: chip-row step nav, fields stack single-column, Sheet-free
      (fullscreen modal is fine); verify with Playwright mobile viewport.
- [ ] **W7.2** Empty-state integration: `EngineNavigator`'s empty state gains a secondary
      "Engine wizard…" button next to the existing define button.
- [ ] **W7.3** `docs/engine-wizards.md`: user-facing doc (per-family walkthrough, preset
      tables, the §2.5 rules in prose); add a pointer from `ENGINE_TUTORIAL.md`'s
      "Variations" section ("or let the Engine Wizard do all of this — see
      docs/engine-wizards.md").
- [ ] **W7.4** Sweep: oxlint/oxfmt clean; `menuSpec.test.ts`, `zIndexLiterals.test.ts`
      still green; no `crypto.randomUUID`; no literal z-index; every numeric input is a
      `useNumberDraft` TextField with `inputMode="url"`; no new `useEffect`-copies-state
      patterns.
- [ ] **W7.5** Full-suite manual QA matrix (one run each): liquid×(generate, template),
      srb×(generate, segments=3+connector case), rcs×(generate quad, part-level micro,
      template single) — each must export via ⌘E with zero pre-flight blockers and load
      order sanity-checked in the export preview tabs.

---

## 9. Testing summary

| Layer | File | What proves it |
|---|---|---|
| Geometry math | `wizardGeometry.test.ts` | positions/extents per §6 tables |
| Model, per family | `wizardModel.test.ts` | defaults ⇒ `validateEngines` zero findings; module-graph shape; id-collision suffixing; unit/bounds validation; UI→document unit conversion (bar→Pa, %→fraction, ms→s incl. 1 ms floor) |
| Export | XML snapshot assertions via `serializePartsXml`/`serializeGameDataXml` | gimbal in both docs; element inventories per family (§ W2.5 / W5.3 / W6.3) |
| Undo | editorStore test | exactly one history entry; undo restores deep-equal document |
| Registration | `menuSpec.test.ts` | menu entry present |
| E2E | project-local Playwright | W3/W4/W5/W6/W7 manual-acceptance items, scripted where cheap |

Fixture reactions: build the same `ReadonlyMap<string, ReactionData>` fixtures
`engineValidation.test.ts` uses (Hydrolox Mixture with bounds; APCP/DoubleBase Fixed with
burn-rate + pressure bounds; MMH_NTO Mixture) — factor them into a shared
`src/ksa/__fixtures__/reactionFixtures.ts` if they aren't already importable.

---

## 10. Out of scope (documented so nobody "helpfully" adds them)

1. **Gas-generator cycles / vernier clusters** (two rockets on one controller, part-level
   extra nozzles) — the module editors already allow hand-authoring this after the wizard.
2. **MMU-style multi-controller RCS batteries** with per-group `ControlMap` (D12) — a
   future `rcs-layout` "battery" preset.
3. **Multi-part segmented SRB stacks** (the wizard authors the connector acceptance only;
   segment *parts* are a separate authoring task).
4. **Engine-adjacent elements flexo does not model** (analytic mass primitives like
   `HollowOpenSemiEllipsoidMass`, `SolarTracker`, `Grab`, `SymmetryGroup`, `FuelPort`,
   `ConvexHull` colliders, `<VolumetricExhaust><Offset>`) — modeling any of these is a
   scope-catalog change first (§2.6).
5. **Viewport picking inside the wizard** (D6) and **live 3D ghost preview** of generated
   geometry — candidate follow-up via `GhostPartsLayer`, not v1.
6. **Editing existing engines** — the wizard only creates; editing stays in the module
   editors.
7. **Custom/derived reactions** — the wizard picks from the catalog; authoring propellants
   stays in `PropellantEditor`.
