# Flexo Engine Designer — Implementation Plan

**Companion analysis:** `analysis/KSA_ENGINE_DETAILS.md` (read it first — every schema/formula/default referenced here is verified there).

**Goal:** Let a flexo user design a complete, in-game-functional KSA rocket engine — choosing propellant/mixture, thrust/Isp via real nozzle physics, gimbal, and exhaust plume — and export it as valid KSA part GameData, reusing existing SubPart meshes.

---

## 1. The core insight that shapes everything

KSA already ships an "Engine Designer" — `EngineDesigner.cs`, a developer ImGui tool that:
1. takes physical inputs (propellant, exit diameter, chamber pressure, area ratio / target exhaust pressure, 3 efficiencies),
2. runs `RocketDesign.ComputeVacuum/AtmosphericEngineDesign` + the runtime thrust path to **predict sea-level & vacuum thrust and Isp live**, and
3. emits `<Combustor>` + `<DeLavalNozzle>` XML to the clipboard.

But it stops there. It does **not** emit the `<Rocket>` binding, the `<RocketEngineController>`, the `<Gimbal>`, the exhaust placement, the part metadata, or wire any of it to a mesh. A designer hand-authors all of that around the copied snippet.

**Flexo's Engine Designer should be that tool, plus the parts the in-game one omits, integrated with flexo's existing SubPart/Part/GameData model and one-click mod export.** Concretely it does four things the in-game tool can't:
- **Wires the engine** (Rocket + controller + gimbal + exhaust placement + mass/collider/tag) so the output is a *complete, fires-in-game* part, not a snippet.
- **Places exhaust/gimbal in 3D** against the actual mesh, using flexo's gizmo, instead of typing vectors blind.
- **Ports the physics** (`RocketDesign` + runtime math) to TypeScript for the same live thrust/Isp readout — in the browser, against the mesh you're looking at.
- **Round-trips** through flexo's project save / share-link / export, and imports the real Core engines for reference/cloning.

This reframes the whole feature: it is **not** "add some XML fields." It is "a guided physics+geometry authoring mode that produces correctly-wired engine GameData."

---

## 2. What the user meaningfully provides (the UX model)

The analysis tells us exactly which inputs matter. Grouped by how the user thinks about them:

### 2.1 Propellant (chemistry)
- **Pick a combustion process** from the library: `Hydrolox_5.5`, `Kerolox_2.4`, `MMH_NTO_1.6` (+ the easter egg). This is one dropdown. The mixture ratio (the "5.5") and the gas LUT come with it.
- **(Phase 2) Author a custom propellant**: name, reactant phases + mass shares (the mixture ratio), and the `<CombustionCondition>` LUT. The LUT is the hard part — it is CEA-style pre-solved thermodynamics, not hand-tunable. Options: (a) let the user paste/clone an existing process's LUT and just rename/re-mix; (b) provide a tiny set of "archetype" LUTs; (c) ship a generator. **Recommend deferring custom chemistry to Phase 2** and letting v1 reference existing process Ids.

### 2.2 Performance design (the physics sliders — mirror `EngineDesigner`)
- **Design mode:** Atmospheric (optimise for a target exhaust/ambient pressure) **or** Vacuum (set area ratio directly).
- **Exit diameter** (cm/m), **chamber pressure** (bar), and either **area ratio** (vacuum) or **target exhaust pressure** (atmospheric).
- **Thermal / Flow / Expansion efficiency** (%, default 95) — with the in-game tooltip semantics (thermal→thrust+Isp, flow→thrust, expansion→Isp).
- **Minimum throttle** (default expose at e.g. 100% = on/off, with a clear "throttleable down to X%" control). *This is the one knob the in-game tool forgets to emit — surface it prominently.*
- **Live readout (computed in-browser):** sea-level thrust, vacuum thrust, Isp SL, Isp vac, mass flow, throat diameter, flow-separation severity, optimum-expansion pressure. Optionally a TWR hint vs the part's dry mass.

### 2.3 Geometry / FX placement (the 3D part)
- **Exhaust location** (point) + **exhaust direction** (default −X) — edited with a 3D gizmo handle on the mesh (the thrust application point).
- **Fx exit diameter** (visual plume width) + **Fx location/direction** (optional, defaults to physical).
- **Exhaust plume:** pick one of the 8 shipped `VolumetricExhaust` Ids by archetype (main / vacuum / vernier / turbine / RCS / EVA). (Phase 2: author a custom plume template.)
- **Sound:** default `DefaultEngineSoundBehavior` on/off.

### 2.4 Mechanism / wiring
- **Controller type:** main engine (`RocketEngineController`, throttle + staging) or RCS (`RocketThrusterController`, pulsed, control-map). Default: main engine.
- **Gimbal:** which placed SubPart hosts the nozzle(s); max angle Y / Z (degrees); constrain-to-circle. A 0/0 gimbal = fixed.
- **(Advanced) extra rockets:** a gas-generator (second Combustor+Nozzle) grouped under the same controller — for power users; can be Phase 2.

### 2.5 Part identity
- Display name, editor tag (`Engines` / `RCS`), dry mass (`SolidSphereMass`), collider (reuse/auto/skip). Note: **no cost/description/tech-tree exists in KSA** — don't invent fields.

---

## 3. Recommended UX shape

Flexo has two precedents (per `notes_flexo.md`): the full-sidebar **Animation editor** (`$inspectorMode`) and the **Part Data / SubPart Data modals** (`GameDataSections.tsx`). Recommended hybrid:

- **Primary: a full-sidebar "Engine" designer mode** (`$inspectorMode: 'engine'`), mirroring the animation editor. Left/top = the engine list + physics calculator with the live thrust/Isp readout; below = the module editors; the 3D viewport shows the exhaust/gimbal handles. This is where the *iterative tuning* happens and where the physics preview lives. Entered from the Add menu ("Define Engine…") or an "Engine (N)" button.
- **Secondary: raw module sections** in the existing modals for parts imported/round-tripped from Core (so an engine that came in from `CorePropulsionAGameData.xml` is editable without the designer): a `CombustorSection`/`NozzleSection` in **SubPart Data** (`ManageTanksModal.tsx`) and a `RocketControllerSection`/`GimbalSection` in **Part Data** (`PartDataButton.tsx`).

Both write into the **same `EditingPart` fields** (§4); the designer mode is just a richer front-end over them. Start with whichever is cheaper to ship (the modal sections give round-trip + export with no 3D work), then layer the sidebar designer + physics preview on top.

---

## 4. Data model — `src/ksa/types.ts`

KSA splits an engine across the two containers flexo already models. Map them directly:

| KSA XML | KSA parent | flexo home |
|---|---|---|
| `<Combustor>`, `<DeLavalNozzle>`, `<Rocket>` (the thrust chamber that travels with a mesh) | `<SubPartGameData Id=templateId>` | **`SubPartGameData`** (next to `tanks`/`lights`) |
| `<RocketEngineController>` / `<RocketThrusterController>`, part-level `<Rocket>`/`<Combustor>` (gas generators), `<SubPart Id=instanceId><Gimbal>` | `<PartGameData Id=partId>` | **`PartGameData`** (referencing placement **instanceIds**) |
| `<CombustionProcess>` (custom propellant) | top-level Assets library | Phase 2: a new `customCombustionProcesses[]` + Assets emitter |

### New interfaces (sketch)
```ts
// references a CombustionProcess by id (library or custom)
export interface Combustor {
  id: string                      // <Combustor Id>
  combustionId: string            // <Combustion Id>  e.g. "Hydrolox_5.5"
  maxPressurePa: number           // <MaxPressure> (store SI Pa; emit Bar=)
  thermalEfficiency: number       // default 1
  minimumThrottle: number         // default 1 (on/off)
  minimumPulseTimeS: number | null // default null → omit (0.001)
}

export interface DeLavalNozzle {
  id: string
  exitDiameterM: number
  fxExitDiameterM: number | null
  areaRatio: number               // REQUIRED (no NaN in flexo; validate)
  flowEfficiency: number          // default 1
  expansionEfficiency: number     // default 1
  exhaustLocation: Vec3           // default (0,0,0)
  exhaustDirection: Vec3          // default (-1,0,0)
  fxExhaustLocation: Vec3 | null
  fxExhaustDirection: Vec3 | null
  volumetricExhaustId: string | null  // pick from the 8
  exhaustLight: boolean           // default true
  sound: { action: 'On'|'Off'; soundId: string } | null
}

export interface Rocket {
  id: string
  core: { id: string; subPartInstanceId: string | null }       // <Core Id [SubPartId]>
  nozzles: { id: string; subPartInstanceId: string | null }[]   // <Nozzle …> repeatable
}

export interface RocketController {
  id: string
  kind: 'engine' | 'thruster'
  rocketRefs: { id: string; subPartInstanceId: string | null }[]
  controlMapFlags: string[] | null   // thruster only (ThrusterMapFlags names)
}

export interface Gimbal {
  subPartInstanceId: string        // which placement it sits on
  maxAngleYDeg: number             // 0 ⇒ fixed on that axis
  maxAngleZDeg: number
  constrainToCircle: boolean       // default true
}
```
- Extend `SubPartGameData` with `combustors: Combustor[]`, `nozzles: DeLavalNozzle[]`, `rockets: Rocket[]`; update `isSubPartGameDataEmpty`.
- Extend `PartGameData` with `rocketControllers: RocketController[]`, part-level `rockets: Rocket[]`, `combustors: Combustor[]`, `nozzles: DeLavalNozzle[]`, and `gimbals: Gimbal[]`.
- Add `createCombustor()/createNozzle()/createRocket()/createController()/createGimbal()` factories with the analysis defaults; extend `createEmptyPart`/`createEmptyGameData`.

**Two reference kinds** the feature introduces (both must survive import/paste remapping): module→SubPart **instance id** (`subPartInstanceId`, like coupling→connectorId but pointing at `placement.instanceId`), and module→SubPart **template id** (the `SubPartGameData` key, same as tanks).

---

## 5. The physics engine (port `RocketDesign` + runtime math) — new `src/ksa/enginePhysics.ts`

This is what makes the designer "first-class" rather than a form. Port to pure TS (no three, no react — `ksa/` rules):
- `CombustionTable.Lookup` (binary search + lerp in ln(P)) — from `CombustionTable.cs`.
- `GasProperties` helpers: `c*`, `criticalPressureRatio`, isentropic/isothermal/isochoric processes — `GasProperties.cs`.
- `DeLavalNozzleConfig.ComputeConditions / ComputeMassFlowRate / ComputeExhaustVelocity / ComputePerformance` (incl. flow separation) — `DeLavalNozzleConfig.cs`.
- `NozzlePerformance.GetTotalThrust / GetRocketPerformance` — `NozzlePerformance.cs`.
- `RocketDesign.SolveMachNumberFromAreaRatio`, `ComputeAreaRatioFromMachNumber/FromPressure`, `ComputeVacuum/AtmosphericEngineDesign`, `ConstrainCoefficient` — `RocketDesign.cs`.
- Constants `g₀=9.80665`, `Ru=8.31446261815324`.

**Output API:** `predictPerformance(combustor, nozzle, lut)` → `{ thrustSLkN, thrustVackN, ispSL, ispVac, massFlow, throatDiaM, flowSeparationSeverity, optimumExpansionPa }`, computed by running the chamber at throttle 1 and evaluating at ambient 101325 Pa and 0 Pa (exactly as `EngineDesigner.cs:137-142`). Add a vitest suite that reproduces the in-game designer's numbers for `Hydrolox_5.5` at the LR91 settings (validates the port).

**LUT data source:** the physics needs the `<CombustionCondition>` rows. Load `Content/Core/Combustion.xml` (served under `/ksa/`, like the other Core files in `catalog.ts ASSET_FILES`) and parse into `{ id → { reactants, lutRows[] } }`. Add a small `combustionCatalog.ts` + `ensureCombustionLoaded()` store, parallel to `catalogStore`. Without this, flexo can still *emit* engine XML referencing a process by id, but can't show live thrust — so this is required for the headline feature, optional for a bare data-editor MVP.

---

## 6. State & actions — `src/state/editorStore.ts`

- Add discrete/streaming actions mirroring tanks/lights (per-subpart) and batteries/coupling (per-part), via the existing `commitSubPartData`/`mutateSubPartData` and `commitGameData`/`mutateGameData` helpers, obeying the **undo invariant** (discrete = action pushes; streaming = caller pushes at interaction start). Slider drags + numeric fields use the streaming path; add/remove/dropdown use discrete.
- Extend `ImportedGameData` + `applyImportedGameData` + `addPart`'s `idMap` so imported/pasted engine modules have their `subPartInstanceId` references **remapped** to new instance ids (the analysis stresses these are literal-string instance refs).
- For the sidebar designer, add ephemeral sub-selection atoms in a new `src/state/engineStore.ts` mirroring `animationStore.ts` (`$activeEngineId`, `$activeNozzleId`, `$engineHandleMode`) — **not** in `$part`/undo.

---

## 7. Serialization — `src/ksa/partXmlSerializer.ts`

Extend `serializeGameData`:
- In the per-`SubPartGameData` loop, emit `<Rocket>`, `<Combustor>`, `<DeLavalNozzle>`.
- At part level, emit `<RocketEngineController>`/`<RocketThrusterController>`, part-level `<Rocket>`/`<Combustor>`, and `<SubPart Id=instanceId><Gimbal>` overlays.
- New builders using existing helpers (`elWithAttr`, `buildVectorElement`, `formatG6`): `buildCombustorElement`, `buildNozzleElement`, `buildRocketElement`, `buildControllerElement`, `buildGimbalElement`.
- **Unit emission:** `MaxPressure` → `Bar=` (store Pa, emit `Pa/1e5`); `ExitDiameter`/`FxExitDiameter` → `M=` (or `Cm=` under 1 m); `MaxAngleY/Z` → `Degrees=`; `MinimumPulseTime` → `Seconds=`; everything else dimensionless `Value=`; vectors `X/Y/Z`. **Omit fields at their KSA default** (ThermalEfficiency=1, FlowEfficiency=1, ExpansionEfficiency=1, ExhaustDirection=(−1,0,0), ExhaustLight=true, ConstrainToCircle=true) to keep output diff-clean and game-byte-compatible.
- **Validation before emit:** AreaRatio must be finite & >0 (KSA default is NaN = broken); each `<Rocket>` Core/Nozzle id must resolve to an emitted module on the same/named subpart; each `subPartInstanceId` must match a real placement; gimbal host must own ≥1 nozzle. Surface these as designer warnings, not silent.

---

## 8. Parse / import / round-trip

- **`src/ksa/partXmlParser.ts`:** extend `parseGameDataElement` (part-level controller/rocket/combustor/gimbal) and `subPartGameDataFromRoot` (per-subpart rocket/combustor/nozzle). Add `combustorFromElement`, `nozzleFromElement`, `rocketFromElement`, `controllerFromElement`, `gimbalFromElement` using `readNum`/`readVec`/`directChildren`. Convert units back to SI on read (`Bar→Pa`, `Degrees→deg stored as deg`, etc.).
- **`src/ksa/partCatalog.ts`:** add the engine fields to `CatalogPart` + populate in `parseGameDataFile`/`mergeGameData`, so importing a Core engine (e.g. `CorePropulsionA_Prefab_EngineA3` "LR91 Vac") brings its modules in. This makes "import a real engine and tweak it" the fastest authoring path and a great test oracle.
- **`src/state/partImport.ts`:** ensure `importBuiltInPart`→`addPart` remaps engine instance refs through the idMap.

Add serialize↔parse **round-trip tests** (the repo expects them for every GameData module): import LR91 Vac, re-serialize, assert byte-equivalence modulo formatting.

---

## 9. Persistence — `src/state/projectCodec.ts` + `projectTransfer.ts`

- `projectCodec.ts`: add `encX`/`decX` for the new modules + fields on `CGameData`/`CSubPartGameData`; round floats, drop defaults. Consider bumping `PROJECT_EXPORT_VERSION`.
- `projectTransfer.ts`: extend `ProjectExportData`/`mergeProjectImport` to remap engine `subPartInstanceId` refs through `instanceIdMap` on additive paste.
- Tests: `projectCodec.test.ts`, `projectTransfer.test.ts`.

---

## 10. 3D — `src/three/`

- New `NozzleHandleObject` (copy `ConnectorObject.ts`: a cube + a +X-facing cone). KSA `ExhaustDirection` default is local −X and the connector cone faces +X — handle the flip in `coords.ts` mapping. Render one per nozzle for `ExhaustLocation`+`ExhaustDirection`; a second style for the gimbal pivot.
- In `EditorScene.ts`, subscribe to the engine sub-selection atoms and attach `TransformGizmo` to a synthetic group at the active nozzle's exhaust location (the `poseProxy` precedent). Drag updates the streaming action; drag-start pushes undo.
- Optional polish: a translucent cone preview of the nozzle bell (exit diameter) and a gimbal sweep arc.

---

## 11. UI — files & components

- **Add menu** (`src/ui/AddButton.tsx`): "Define Engine…" → enters engine designer mode (or opens a create dialog that picks the host SubPart, then enters the mode).
- **Mode plumbing:** `src/state/uiStore.ts` `$inspectorMode` gains `'engine'`; `src/ui/InspectorContent.tsx` dispatches to `<EngineToolbar/>`+`<EnginePanel/>` (copy `AnimToolbar`/`AnimationPanel`).
- **`EnginePanel`:** the physics calculator (sliders + live readout from `enginePhysics.ts`) + module editors + a SubPart/instance picker (`InstanceSelect` over `part.placements`, analogous to coupling's `ConnectorSelect`).
- **Modal sections** (`src/ui/GameDataSections.tsx`): `CombustorSection`, `NozzleSection` (rendered in `ManageTanksModal.tsx` "SubPart Data"); `RocketControllerSection`, `GimbalSection` (rendered in `PartDataButton.tsx`, new "Engine" `DisclosureSection`).
- Reuse `PreciseNumberInput`/`NumberField`/`Vec3Field`, `Select`/`ListBoxItem`, `Switch`, `DisclosureSection` from `src/ui/kit`. No manual memoization (React Compiler).

---

## 12. Electric engines — verdict & scope

Per the analysis (§9), **there is no electric/ion/cold-gas/monopropellant thrust path in KSA data or code** — thrust is always a `Combustor` burning a `CombustionProcess`, and combustors consume no electricity. So:
- **Do not build an electric-engine mode.** It can't produce an in-game-functional part.
- The only honest approximation is a combustor with a single hand-authored high-Isp "propellant" + LUT — still propellant-mass-limited, no power coupling. Treat this as a Phase-2 custom-propellant curiosity, clearly labelled "not a real electric engine," not a headline feature.
- If KSA later adds an electric `RocketCore` subclass, revisit. Track it; don't pre-build.

---

## 13. SRBs — what flexo can offer

Per the analysis (§10), SRBs are inert meshes with no code. Flexo **can** make them *appear and fire* via the data-only fake, but cannot make them behave like true SRBs (no thrust-vs-time curve, still shutdown-able, liquid-modelled propellant). Recommended:
- **Phase 2 "SRB (approximate)" preset** in the designer: a combustor with `MinimumThrottle=1`, a sealed internal tank preset, a single-reactant combustion, and the SRB nozzle exhaust placement — plus the missing `<PartGameData>` so the inert SRB prefabs become pickable. **Surface the limitations explicitly in the UI** (flat thrust, re-ignitable, liquid CoM) so users aren't surprised.
- Since the 16 SRB prefabs already exist as assets, a neat companion feature is "Adopt SRB mesh" — import an `SRB*` prefab's geometry and attach engine GameData to it.
- True SRB behaviour (burn-rate, grain regression, thrust curves, ignite-once) needs new **game** code and is out of flexo's reach; document it as such.

---

## 14. Open decisions for you (these change scope/emphasis)

1. **Live physics preview vs XML-only MVP?** Full value comes from the in-browser thrust/Isp readout, which requires porting `RocketDesign` + loading `Combustion.xml` (§5). A leaner MVP just edits/emits the XML with no preview. *Recommend: build the preview — it's the differentiator and the math is fully specified.*
2. **Sidebar designer mode vs modal sections first?** Modal sections give round-trip + export fastest with no 3D work; the sidebar mode + 3D handles are the premium experience (§3). *Recommend: ship modal sections + serialization first (Phase 1), then the designer mode (Phase 2).*
3. **Custom propellants in scope?** The mixture ratio is trivial; the LUT is CEA thermodynamics. *Recommend: v1 references existing process ids; Phase 3 adds clone-and-remix + paste-LUT.*
4. **RCS thrusters in scope for v1, or main engines only?** RCS adds the control-map + pulsed-thruster path. *Recommend: main engines v1, RCS Phase 2 (the data model already covers both via `RocketController.kind`).*
5. **Gas-generator / multi-rocket engines in v1?** Common in real Core engines (LR91). *Recommend: model it in types from day 1 (so import works), expose the editor in Phase 2.*
6. **Export gating:** custom assets currently gate project export (memory note `project_project_export_import`). Engines add no geometry, so they shouldn't gate — confirm engines export cleanly alongside the existing GameData path in `modExport.ts` (no changes expected).

---

## 15. Phased rollout

- **Phase 0 — Physics core (no UI):** `enginePhysics.ts` port + `Combustion.xml` loader + vitest parity tests against in-game numbers. De-risks the headline feature.
- **Phase 1 — Data + round-trip:** types, factories, editorStore actions (undo + remap), serializer, parser, partCatalog import, projectCodec/transfer, tests. Import LR91, edit numerically in the modal sections, export, load in game. *Milestone: a Core engine round-trips and a hand-edited clone fires in-game.*
- **Phase 2 — Designer mode + 3D:** `$inspectorMode='engine'`, `EnginePanel` with live preview, `NozzleHandleObject` + gizmo, gimbal/exhaust placement, plume picker, RCS + gas-generator editors. *Milestone: design an engine from scratch against a reused mesh, see live thrust/Isp, place the exhaust in 3D, export.*
- **Phase 3 — Custom chemistry & SRB preset:** custom `<CombustionProcess>` authoring (clone/remix/paste-LUT) + Assets emitter; the SRB-approximation preset + "adopt SRB mesh"; clearly-labelled limitations.

---

## 16. Risks & gotchas (from the analysis)

- **`MinimumThrottle` defaults to 1.0** (on/off). The in-game designer omits it. Flexo must surface it and default sensibly (recommend defaulting the UI to "throttleable" with a clear toggle, while still emitting the KSA default-omission rules correctly).
- **`AreaRatio` has no valid default (NaN).** Always validate finite & >0 before export.
- **`FxExitDiameter` ≠ `ExitDiameter`** — visual only; don't let them be conflated in the UI.
- **Instance-id references are literal strings** — the remap on import/paste is the single most bug-prone area; test it hard.
- **ExhaustAssets schema drift** — if Phase 3 emits custom plumes, emit **C# field names** (`AngleCurve`, not `ExpansionCurve`; no `ConcavityCurve`; no MachDiamonds `Brightness`) and don't depend on the (inert) modifier curves; rely on `FxExitDiameter` + physics for altitude/throttle response.
- **A `<Part>` with no `<PartGameData>` is invisible** — the designer must always emit both the prefab and its GameData (flexo already emits both files via `modExport.ts`).
- **`ConstrainCoefficient` clamps** the emitted efficiencies up to a floor in the in-game design math — match it in `enginePhysics.ts` so flexo's predicted numbers equal the game's.

---

## 17. File-touch checklist

| Area | File(s) |
|---|---|
| Physics | **new** `src/ksa/enginePhysics.ts`, **new** `src/ksa/combustionCatalog.ts`, `src/ksa/catalog.ts` (`ASSET_FILES` + `Combustion.xml`), **new** `src/state/combustionStore.ts` |
| Types | `src/ksa/types.ts` (+ factories) |
| State | `src/state/editorStore.ts`, `src/state/uiStore.ts`, **new** `src/state/engineStore.ts` |
| Serialize | `src/ksa/partXmlSerializer.ts` |
| Parse / import | `src/ksa/partXmlParser.ts`, `src/ksa/partCatalog.ts`, `src/state/partImport.ts` |
| Persistence | `src/state/projectCodec.ts`, `src/state/projectTransfer.ts` |
| 3D | **new** `src/three/NozzleHandleObject.ts`, `src/three/EditorScene.ts`, `src/three/coords.ts` |
| UI | `src/ui/GameDataSections.tsx`, `src/ui/PartDataButton.tsx`, `src/ui/ManageTanksModal.tsx`, `src/ui/AddButton.tsx`, `src/ui/InspectorContent.tsx`, **new** `src/ui/EngineToolbar.tsx`, **new** `src/ui/EnginePanel.tsx` |
| Tests | `partXmlSerializer.test.ts`, `partXmlParser.test.ts`, `projectCodec.test.ts`, `projectTransfer.test.ts`, **new** `enginePhysics.test.ts` |
| Docs | **new** `docs/engines.md`, update `docs/xml-io.md`, `docs/editor-state.md`, `AGENTS.md` |

---

## 18. Definition of done (Phase 1+2)

A user can: open the Engine designer, pick a reused thrust-chamber SubPart, choose `Kerolox_2.4`, set exit diameter / chamber pressure / area ratio / efficiencies / min-throttle and **watch sea-level & vacuum thrust + Isp update live**, place the exhaust point/direction with a 3D gizmo, set a ±5° gimbal, pick the `EngineALarge` plume, name it, give it a dry mass, and **export a mod that loads in KSA and fires correctly** — and re-importing that engine (or a Core engine like LR91 Vac) reproduces the same editable state.
