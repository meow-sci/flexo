# Area analysis: Part data / GameData editing, containers, plumbing & XML passthrough

Repo: `/Users/asherwin/repos/meow-sci/flexo`. All file refs relative to repo root unless absolute.

This area covers three distinct "data" surfaces plus the invisible XML round-trip machinery:

1. **Part Data dialog** (part-level `<PartGameData>` editing) — `src/ui/PartDataButton.tsx`
2. **SubPart Data dialog** (per-SubPart-template `<SubPartGameData>` editing) — `src/ui/ManageTanksModal.tsx`
3. **Reference containers** (editor-aid 3D volumes, *not* KSA tanks) — `src/ui/ContainerEditor.tsx`, `src/ui/ContainerList.tsx`, `src/state/containerStore.ts`
4. **RawXmlNode passthrough** (unmodeled-XML preservation, no UI at all) — `src/ksa/partXmlParser.ts`, `src/ksa/partXmlSerializer.ts`

A crucial naming trap for v2 designers: **"containers" means two unrelated things** in this codebase. (a) *Reference containers* — box/cylinder/sphere wireframe volumes that are an editor visual aid, persisted with the project, never exported. (b) *Feed containers* — KSA `<Tank>` / `<SolidGrainSegment>` elements addressable by `<FeedsFrom Container="…">` (see `src/state/feedTargets.ts:11-19`). Keep the vocabulary separated in v2.

---

## 1. Feature inventory

### 1.1 Part Data dialog (the "dense popup")

- **UI path (desktop):** top Toolbar → "Part Data" button (`src/ui/Toolbar.tsx:30`) → **fullscreen modal** (`variant="fullscreen"`, `src/ui/PartDataButton.tsx:70-75`).
- **UI path (phone):** MobileTopBar hamburger Menu → "Part Data" item (`src/ui/MobileTopBar.tsx:88,100,119`) → cover-variant modal. `PartDataButton` supports controlled open (`isOpen`/`onOpenChange` props) for this.
- **Component:** `src/ui/PartDataButton.tsx` (146 lines) — a scrollable stack of six `DisclosureSection`s, several with count badges computed at `PartDataButton.tsx:49-65`.
- **Data model:** `EditingPart` fields `partId`, `editorTags`, and the entire `PartGameData` interface (`src/ksa/types.ts:1128-1209`).
- **Store:** everything routes through `src/state/editorStore.ts` actions on `$part`; undo via `pushUndo` (`editorStore.ts:399`).

Sections and every field inside them:

#### Identity (defaultExpanded) — `PartDataButton.tsx:79-98`
| Field | Widget | Action | Notes |
|---|---|---|---|
| Part Id | mono TextField | `setPartId` (streaming; undo pushed on focus) | export id for the whole mod |
| Display Name | TextField (`IdentityFields`, `GameDataSections.tsx:112-125`) | `setDisplayName` | blank ⇒ Part Id used in-game |
| Editor Tags | `EditorTagsField` chips + "Add tag…" popover | `setEditorTags` | see §1.3 |
| Diameter size class | Switch + PreciseNumberInput (`SizeControlFields`, `GameDataSections.tsx:135-158`) | `setDiameterEnabled` / `setDiameter` | `<Diameter M/>` VAB filter, no physics. Only the FIRST diameter is editable — `extraDiametersM` (repeatable `<Diameter>` for adapters, `types.ts:1153-1162`) is preserved verbatim but **invisible in the UI** |
| Command capable | Switch | `setControllable` | bare `<Control/>` marker |

#### Mass (defaultExpanded) — `GameDataSections.tsx:162-182`
- Custom mass override Switch + Mass (kg) field → `setCustomMassEnabled` / `setCustomMass`.
- Hidden: `customMassExtras: RawXmlNode[]` (`types.ts:1139-1146`) — `<MassSpecificInertia>` etc. from imported parts, re-emitted inside `<CustomMass>` but never shown.

#### Tanks (badge = count, defaultExpanded) — `TanksSection` with `subPartTemplateId={null}` (`GameDataSections.tsx:186-270`)
Part-level `<Tank>`s (where Core authors prefab tanks; the only level an engine's `<FeedsFrom Container>` can address without a `SubPart=` scope — comment at `PartDataButton.tsx:105-107`). Per tank (`ItemCard`):
- Feed id (mono TextField — cross-referenced by FeedsField container pickers)
- Shape Select (Cylindrical / Spherical) → `setTankShape`
- Wall Material Id (TextField)
- Length m (cylindrical only), Outer Radius m, Wall Thickness mm (all `PreciseNumberInput`)
- "+ Tank" / per-card "Remove" → `addTank` / `removeTank`
- **Modeled but NOT editable in any UI:** `Tank.roleAffinity` (`types.ts:467-475`, serializer emits non-default at `partXmlSerializer.ts:551-556`) and `Tank.locationAsmb` (`<LocationAsmb>` mass offset). Round-trip only. v2 could expose them; must at minimum preserve them.

#### Power (badge = batteries+generators+solar+consumer) — `PowerSection` (`GameDataSections.tsx:593-624`)
- **Batteries** — number list (Wh) via generic `PowerList` (`GameDataSections.tsx:427-473`): add/remove/edit each.
- **Generators** — number list (W).
- **Solar Panels** — `SolarPanelsSection` (`GameDataSections.tsx:547-591`): per panel Produced (W) + Orientation Vec3 **in radians** (unlike lights, which show degrees — inconsistency).
- **Power consumer / light switch** — `PowerConsumerSection` (`GameDataSections.tsx:483-540`): at most ONE per part (KSA has a single `Part.LightSwitch` slot). Fields: Consumed (W), "Light switch" Switch, "Starts on" Switch (disabled unless lightSwitch). Contextual hints: "switch controls nothing" warning (no lights/glow exist — computed against placements + customMeshes at :485-493) and "lights always on" hint.

#### Coupling (badge) — `CouplingSection` (`GameDataSections.tsx:662-738`)
Three optional modules, each toggled by a Switch that creates/deletes the module:
- **Decoupler**: connector picker + Force (N).
- **Docking Port**: connector picker + Latching Kinetic Energy (J) + Pushoff Impulse (N·s).
- **EVA Door**: connector picker only. (Scope doc flags KSA 5117's new `<EVADoor SeatId>` as a known drift gap.)
- `ConnectorSelect` (`GameDataSections.tsx:629-660`) keeps a stale/deleted connector id selectable so it still displays, and shows "Add a connector in the workspace first." when none exist. Connectors themselves are created/edited in the 3D workspace (other area).

#### Engine (badge = 9 list lengths summed; collapsed by default) — `PartDataButton.tsx:118-140`
Composed from `src/ui/EngineSections.tsx` (1806 lines — the single biggest component file in this area):
- **Controllers** — `RocketControllersSection` (`EngineSections.tsx:1069-1172`): per controller: Controller id (mono TextField), Type Select (Engine throttle+staging / Thruster RCS pulsed), "Rockets driven" list of {rocket-id dropdown over ALL rockets part-wide (`allRocketIds` :1061-1066) + "on instance" dropdown with "(root part)" option}. Buttons: "+ Engine controller", "+ RCS controller".
- **Feed wiring** — `ConsumerFeedWiringSection` (`EngineSections.tsx:1187-1271`): per `<ConsumerFeedWiring>` entry: Consumer Select over `consumerOptionsOf(part)` (combustors + solid motors, part-level and per-placement; missing consumers stay selectable labelled "— not found"), then a `FeedsField` with `allowParent={false}` (KSA forbids wiring entries deferring to Parent — `ConsumerFeedWiring.OnDataLoad`). Warning line counts unwired parent-deferring consumers with KSA's exact log text; **"Auto-wire unwired consumers"** button (`autoWireUnwiredConsumers` in editorStore) appears when any exist. `unwiredConsumersOf` mirrors `PartTemplate.ResolveConsumerFeeds` lookup (`feedTargets.ts:101-120`).
- **Gimbals** — `GimbalsSection` (`EngineSections.tsx:1339-1405`): per-placement-instance gimbal cards (Max angle Y°, Max angle Z°, Constrain-to-circle Switch); "Add gimbal to instance" Select lists placements without one.
- **Engine issues** — `EngineIssuesPanel` (`src/ui/EngineIssuesPanel.tsx`): inline validation from `validateEngines` (`src/ksa/engineValidation.ts`) split "KSA would refuse to load (N)" (danger) vs "Loads, but misbehaves (N)" (warning). Renders nothing when clean.
- **Solid motor (SRB)** — nested DisclosureSection → `PartSolidMotorSection` (`EngineSections.tsx:1278-1337`): part-level `<SolidMotor>` (solid reaction Select filtered to Category="Solid" incl. custom reactions, grain profile Select, default chamber pressure bar, thermal eff %, FeedsField), `<SolidGrainSegment>` (feed id, casing material, outer radius, wall thickness mm, length, LocationAsmb Vec3), `<SolidMotorNozzle>` (nozzle fields minus area ratio — KSA auto-sizes throat = exitArea/12).
- **Gas generator (advanced)** — nested DisclosureSection → `PartGasGeneratorSection` (`EngineSections.tsx:1408-1467`): part-level Combustors, Nozzles, and Rockets whose core/nozzle refs can target other SubPart instances (`RocketFields` with `part` prop enables the `InstanceSelect`s).

Shared engine field groups (used both here and in SubPart Data / Engine mode):
- **CombustorFields** (`EngineSections.tsx:236-347`): Plumbing Select (Bulk = main engine / Service = RCS, with explanatory microcopy about connector `BulkFluid`), FeedsField (allowParent), Reaction Select (live `reactionStore` catalog with Core-snapshot fallback, picking resets O/F to `<DefaultMixtureRatio>` like KSA's designer), Mixture ratio (only for Mixture reactions; bounds from catalog LUT; missing-ratio warning), Chamber pressure (stored Pa, displayed **bar**), Thermal efficiency %, Minimum throttle % (100 = on/off), Min pulse time s.
- **NozzleFields / SolidNozzleFields / RocketNozzleFields** (`EngineSections.tsx:349-625`): Exit diameter, Area ratio (De Laval only; NaN-required trap displayed as 0), Flow/Expansion efficiency %, shared-by-N-placements warning banner (`instanceCount`), Exhaust location Vec3, Exhaust direction Vec3 (with **unit-length warning + one-click Normalize** — `DirectionLengthWarning` :639-664; KSA multiplies thrust by the raw length, value kept verbatim by design), FX override Switch (seeds/clears the fx location+direction pair as ONE authoring decision :429-434), FX exit diameter, Exhaust plume Select, Plume trail Select, Engine sound Switch, Exhaust light Switch.
- **RocketFields** (`EngineSections.tsx:967-1056`): rocket id, Core combustor dropdown, nozzle-ref list (id + optional instance).
- **CustomPropellantsSection** (`EngineSections.tsx:1494-1804`): user-authored `<FixedReaction>`s — clone-a-shipped-propellant Select, "+ Blank propellant"; per propellant: Name, Category Select (Bipropellant/Hypergolic/Monopropellant/Solid/Thermal), Reactants list (phase id + mass share), Solid-required burn-rate fields (a, n, min/max pressure, condensed fraction) with hard "will be omitted from export" banner via `isCustomReactionExportable`, and the 4-column gas LUT row editor (ln P, T·K, γ, g/mol). **Note: this section renders in the Engine sidebar mode only, NOT in the Part Data dialog** (`EnginePanel.tsx:176`).

#### Hidden part-level data in the dialog's scope (round-trip only, no widgets)
- `PartGameData.unknownAttrs` / `unknownChildren` (RawXmlNode passthrough, §1.5)
- `extraDiametersM`, `customMassExtras`, `Tank.roleAffinity`, `Tank.locationAsmb`
- Connector `<Sibling>` refs and `<Aligned>`/`<SymmetryGroup>` groupings (passthrough with id remap)

### 1.2 SubPart Data dialog (`ManageTanksModal` — the name is historical, it edits far more than tanks)

- **UI path:** right sidebar (RightPanel → InspectorContent assets mode → `AssetsList`) → placed-SubPart row → ⋮ "Asset options" menu → **"SubPart Data"** (`src/ui/AssetsList.tsx:586`, modal mounted at :624). Fullscreen (phone: cover).
- **Component:** `src/ui/ManageTanksModal.tsx` (63 lines) — thin shell over shared sections; `DialogHeader` title "SubPart Data — {templateId}".
- **Data model:** `SubPartGameData` (`types.ts:1218-1240`), keyed by **template id** — placing the same template twice shares one data entry (KSA's model). Engine sections synthesize an empty `createSubPartGameData` when none exists yet so "+ Combustor" can create it (`ManageTanksModal.tsx:26-27`).
- Sections:
  - **Tanks** — same `TanksSection` with `subPartTemplateId` set (feeds are then addressed per-placement: `<FeedsFrom SubPart=instance Container=id>`, see `feedTargets.ts:53-60`).
  - **Lights** — `LightsSection` (`GameDataSections.tsx:285-422`): full KSA `<Light>` schema for lights whose `ownerTemplateId` matches this template: Type (Spot/Point), Position m, Aim Rotation ° (Spot only; converts to stored radians), Range, Intensity, Color (native `<input type=color>`), Inner/Outer half-cone °, Ray tracing (IVA only) Switch, and **"Select in 3D"** (calls `selectLight` + `revealEntity` — but the fullscreen modal stays open over the viewport, see pain points). Indices passed to mutators are into `part.lights`, NOT the filtered view (documented at :287-289). Part-level lights (`ownerTemplateId === null`, created via Add menu, `AddButton.tsx:132`) are edited only via 3D selection + TransformInspector — there is no part-level LightsSection.
  - **Solar Panels** — same `SolarPanelsSection` wired to `addSubPartSolarPanel`/etc.
  - **Engine (thrust chamber)** DisclosureSection (badge) — `SubPartEngineSection` (`EngineSections.tsx:850-964`): combustors, nozzles, solid motors/nozzles/grain segments, and `<Rocket>` bindings that travel with the mesh. Nozzle cards show the shared-across-N-placements banner.

**Which rows support SubPart data:** only placed **SubPart** rows get the `SubPartRowMenu` with "SubPart Data" (`AssetsList.tsx:538+`) — every SubPart template qualifies, built-in or custom mesh (glass templates are only excluded from the *Interior/IVA* toggle, not from data). Connector / collider / IVA-seat / light / kitten rows get `SimpleRowMenu` (no data entry). Measurements and reference containers have no GameData at all. **v2's data mode should surface exactly this distinction: placements = data-capable; other entity kinds = not.**

### 1.3 Editor tags

- **UI path:** Part Data dialog → Identity → chip list + "Add tag…" popover.
- **Component:** `src/ui/EditorTagsField.tsx` (127 lines). React-aria `TagGroup` chips (removable), `DialogTrigger` + `Popover placement="bottom start"` with a SearchField.
- Search doubles as **free-form entry** ("Add ‘…’" button when no known tag matches); suggestions grouped **Categories** vs **Functional** using `EDITOR_TAG_DEFS.notaCategory` (`types.ts:408-427`, a static snapshot of `CoreEditorTagsGameData.xml` as of build 4939). Popover stays open across multiple adds.
- Store: `setEditorTags` on `$part.editorTags` (plain string list; serialized as `<EditorTag Value>`).

### 1.4 Plumbing: feeds, wiring, capabilities

- **FeedsField** (`src/ui/FeedsField.tsx`, 183 lines) — the single editor for every `<FeedsFrom>` list (combustors, solid motors, ConsumerFeedWiring entries). Per feed: kind Select (Parent part / Connector / Container(tank-grain) — Parent hidden when `allowParent=false`), then a target Select. Both target pickers keep an unknown/deleted target selectable (labelled "— not found") so a stale feed is never silently retargeted (`FeedsField.tsx:107-159`). Empty list shows the exact KSA log message it will cause ("declares no FeedsFrom feed points…" / "wires no feed points") as a danger note (:163-175). Container options are keyed `(subPartInstanceId, containerId)` because ids repeat across SubParts.
- **feedTargets.ts** (`src/state/feedTargets.ts`, pure functions): `feedTargetsOf` (connector ids + all addressable containers: part-level tanks/grain segments + per-**placement** SubPart tanks/grain segments — one template placed twice = two targets), `consumerOptionsOf`, `unwiredConsumersOf`. Blank-id containers are skipped (unaddressable in KSA).
- **Connector Capabilities** — edited NOT here but in the floating TransformInspector when a connector is selected (`src/ui/TransformInspector.tsx:440-511`): five Switches (`BulkFluid`, `SolidMotorCase`, `NoElectricity`, `NoServiceFluid`, `DecouplerJoint`) plus flags, with microcopy "None = electricity + service fluid only…". Semantics doc in `types.ts:59-104`: empty list = KSA default `Electricity|ServiceFluid`; the `No*` entries are inverted subtractions; canonical order re-emitted regardless of click order; flexo emits the same list in both the geometry `<Part>` and `<PartGameData>` docs (KSA merges with `|=`). This is cross-area (selection inspector) but plumbing-critical — a v2 data mode arguably wants capabilities visible next to feed wiring.

### 1.5 RawXmlNode passthrough (no UI — pure invariant)

- **Model:** `RawXmlNode` (`types.ts:1108-1126`) — plain-JSON XML subtree (tag/attrs/children/leaf text), so it survives the project codec and localStorage.
- **Capture:** `captureUnknownChildren` / `captureUnknownAttrs` (`partXmlParser.ts:972+`), driven by allow-lists `KNOWN_PART_GAMEDATA_CHILDREN` (26 tags, `partXmlParser.ts:905-934`), `KNOWN_SUBPART_GAMEDATA_CHILDREN` (10 tags, :940-952 — `IVASeat` deliberately absent with a "do not fix" comment: SubPart-level seats round-trip but are not editable per plans/IVA_PLAN.md §6), and attr sets (`Id`/`DisplayName` at part level; `Id` only at SubPart level).
- **Re-emit:** `buildRawNode` (`partXmlSerializer.ts:505-510`), appended after modeled children (`partXmlSerializer.ts:294`, `:350`); unknown attrs re-applied (`:156`, `:335`).
- **Import remap:** `remapRawConnectorRefs` (`partXmlParser.ts:995+`) rewrites `<ConnectorRef Id>` / `<Sibling Id>` at any depth through the freshly-generated `_connectorN` id map, because raw refs kept verbatim would dangle or collide.
- **Boundary:** passthrough exists **only inside `<PartGameData>` / `<SubPartGameData>`**. The geometry `<Part>` document is still a model-faithful re-emitter that drops unmodeled XML (open gap: geometry-template `<Collider>` passthrough — `scope/part-and-subpart-xml.md`, `plans/FIX_CURRENT_GAPS_PLAN.md`).
- There is **no viewer/inspector for preserved passthrough data** anywhere in the UI — users cannot see what invisible XML their part is carrying. (Candidate v2 feature; see open questions.)

### 1.6 Reference containers (editor aid)

- **Create / list / settings:** top Toolbar → "Measure" popover → "Reference containers" section (`src/ui/MeasureButton.tsx:136-173`): Box / Cylinder / Sphere buttons (`addContainer(shape)` → 1 m default at origin, becomes active, popover closes), `ContainerList` (single-select GridList; rows show color dot, shape icon, "warn" badge, per-row Lock/Unlock and Delete — `src/ui/ContainerList.tsx`), and the global "Warn check" Fast(bbox)/Accurate(vertex) toggle (`$containerSettings`, localStorage `flexo:containers`).
- **Mobile path:** MobileTopBar menu → Measure → bottom-sheet variant of the same content (`MeasureButton.tsx:207-222`).
- **Edit:** selecting a container opens the **floating ContainerEditor** (`src/ui/ContainerEditor.tsx`, mounted app-wide at `src/app.tsx:118`), a `FloatingEditorPanel` (desktop: absolute left-pinned vertically-centered `w-64` card, z-10; phone: full-width sheet above the inspector FAB — `src/ui/FloatingEditorPanel.tsx:31-33`). Unlocked body: Gizmo mode toggle (Move/Rotate/Scale → `$containerGizmoMode`, drives a workspace TransformControls in `src/three/ContainerLayer.ts`), Center Vec3, per-shape Dimensions (rect: full Vec3; cylinder: radius+height; sphere: radius — constrained via `normalizeSize`, `containerStore.ts:89-99`, which also snaps non-uniform gizmo drags back), surface-lines Slider (2–48, curved shapes only), Rotation° Vec3 (quat↔euler at `ContainerEditor.tsx:37-51`), Outline color+opacity (`ColorAlphaField`) and width slider (1–10 px), Containment warning Switch + warn color/opacity, Delete. Locked body: read-only Center/Size `<dl>`. Header: lock toggle + close (close leaves the container placed; re-open from the list).
- **Warn rendering:** `src/three/ContainerLayer.ts` highlights out-of-bounds regions using `warnPrecision` (:176).
- **Persistence/undo:** `$containers` saved in the project snapshot (`src/state/projectStore.ts:103-104,162,283,471` — subscribe → scheduleSave) and included in every undo snapshot (`editorStore.ts:399-406` snapshots part + containers + measurements together). Never exported to KSA XML.

### 1.7 The third rendering of the same data: Engine sidebar mode

`$inspectorMode === 'engine'` swaps the right sidebar body to `EngineToolbar` + `EnginePanel` (`src/ui/InspectorContent.tsx:37-46`). `EnginePanel` (`src/ui/EnginePanel.tsx`) re-renders **the identical section components**: `SubPartEngineSection`, `RocketControllersSection`, `GimbalsSection`, `PartGasGeneratorSection`, `PartSolidMotorSection` (part-scope entry), `CustomPropellantsSection` — plus engine-mode-only extras (active-engine Select, "define new engine/SRB on placement", live thrust/Isp `PerformanceReadout`, 3D exhaust-handle toggles via `engineStore`). The engine area agent covers that mode's own features; the fact that these *data editors* exist in 2–3 places at once is a core structural fact for this area.

---

## 2. UI surface map

| Surface | Kind | Mount / positioning | Stacking | Issues |
|---|---|---|---|---|
| Part Data dialog | Modal, `variant="fullscreen"` (phone: `cover`) | react-aria `ModalOverlay`, `fixed inset-0 z-50`, backdrop blur (`src/ui/kit/Modal.tsx:15,20`) | z-50 | Covers the entire viewport incl. 3D view; all data behind one button |
| SubPart Data dialog (`ManageTanksModal`) | Modal, fullscreen/cover | same kit Modal, mounted inside the AssetsList row component (`AssetsList.tsx:624`) | z-50 | Reached only via a row ⋮ menu; "Select in 3D" inside it can't show the 3D result |
| Editor-tags popover | Popover (`bottom start`, w-64) inside the Part Data modal | react-aria Popover portal | above modal | popover-in-fullscreen-modal nesting |
| Every Select in the dialogs | Popover listbox | react-aria portal | above modal | Deep stacks: modal → DisclosureSection → nested DisclosureSection → ItemCard → Select popover |
| Measure popover ("Reference containers" section) | Toolbar popover (`bottom`, ~22rem) / phone bottom sheet | `DialogTrigger`+`Popover` (`MeasureButton.tsx:225-232`) | popover layer | Containers share one popover with measurements; closes on add |
| ContainerEditor | Floating card | `absolute left-3 top-1/2 -translate-y-1/2 z-10` desktop; `absolute inset-x-2 bottom-20 z-10` phone (`FloatingEditorPanel.tsx:31-33`) | z-10 over viewport | Shares the exact left-center slot with MeasurementEditor (same `FloatingEditorPanel`) — both mounted in `app.tsx:115,118`; an active measurement + active container would overlap |
| EngineIssuesPanel | Inline block | inside Part Data Engine section and Engine sidebar | – | validation only visible while the section is open |
| Engine sidebar mode | Sidebar tab body | RightPanel via `$inspectorMode` | – | duplicates the dialogs' editors (see §4) |
| TransformInspector connector Capabilities | Floating inspector section | `FloatingInspector` (desktop) / inline phone sheet | – | plumbing config physically distant from feed wiring UI |

---

## 3. State & data flow

- **`src/state/editorStore.ts`** (4094 lines): the single `$part` atom holds `partId`, `editorTags`, `gameData: PartGameData`, `subPartGameData: SubPartGameData[]`, `customReactions`, `lights`, plus all geometry. ~80 fine-grained exported actions for this area (`setDisplayName`, `addTank`, `updateTank(subPartTemplateId|null, i, patch)`, `setCombustorFeeds`, `setGimbal`, `addConsumerFeedWiring`, `autoWireUnwiredConsumers`, `updateCustomReaction`, …). SubPart-scoped actions take the **template id**; wiring/gimbal actions take **instance ids**.
- **Undo/redo:** snapshot-based (`pushUndo` clones part + containers + measurements, `editorStore.ts:399-410`; MAX_UNDO cap; redo stack cleared on push). Convention: **discrete** actions (add/remove/switch/select) push their own undo; **streaming** inputs (text/number/color) push ONCE on focus/interaction-start, so a typing session = one undo step. `PreciseNumberInput.onInteractionStart` is the hook (`src/ui/PreciseNumberInput.tsx:14-16`). Undo/redo toasts show the description.
- **Persistence:** the whole part (gameData `g`, subPartGameData `sg`, editorTags `tg`, customReactions `cr`, part-level tanks `tk`, RawXmlNode passthrough included) is compact-encoded by `src/state/projectCodec.ts` (:1361-1427) into project snapshots autosaved by `src/state/projectStore.ts` (subscription → scheduleSave). Reference containers persist per-project (`projectStore.ts:103,162,283`); `$containerSettings.warnPrecision` is a **global** pref (`persistentJSON('flexo:containers')`). `$activeContainerId` / `$containerGizmoMode` are ephemeral atoms.
- **`src/state/reactionStore.ts`:** lazy-loaded live reaction catalog (`ensureReactionsLoaded()` fired from `useEffect` in `ReactionSelect`, `CustomPropellantsSection`, `EnginePanel`); `$allReactions` / `$allReactionIndex`; static `KNOWN_REACTIONS` fallback when the catalog hasn't loaded.
- **`src/state/feedTargets.ts`:** pure derivations (no store) computed on every render from `$part`.
- **XML I/O:** import via `src/ksa/partXmlParser.ts` (merges `<PartGameData>` sibling doc onto the part, captures passthrough); export via `src/ksa/partXmlSerializer.ts` (rebuilds both docs; emits modeled fields at current-KSA schema only, appends RawXmlNodes). No migration/back-compat code by project constitution.
- **Cross-store:** undo intentionally couples editorStore ↔ containerStore ↔ measurementStore via injected getters (`_getContainers` etc.); `ContainerLayer` (three) subscribes to `$containers` + `$containerSettings` + `$activeContainerId` + `$containerGizmoMode`.

---

## 4. Pain points (with evidence)

1. **Density / no overview — the user's stated #1 complaint.** ALL part-level data is behind one toolbar button opening a fullscreen modal of six collapsible sections, single-column, unlimited scroll (`PartDataButton.tsx:78-141`). An engine part nests modal → "Engine" DisclosureSection → "Solid motor (SRB)" / "Gas generator" DisclosureSections → ItemCards → per-card fields (3 levels of disclosure inside a modal). Count badges (`:49-65`) are the only at-a-glance signal. There is no search, no split view, no way to see Tanks and Feed wiring side by side even though they cross-reference each other by id.
2. **The same data is editable from three different surfaces built from the same components** — Part Data modal, SubPart Data modal, and Engine sidebar mode all render `RocketControllersSection`, `GimbalsSection`, `PartGasGeneratorSection`, `PartSolidMotorSection`, `SubPartEngineSection` (`PartDataButton.tsx:118-140`, `ManageTanksModal.tsx:56-58`, `EnginePanel.tsx:176-230`). Users can reasonably learn only one path and never find the others; conversely nothing tells them the three views are the same data.
3. **"SubPart Data" discoverability:** the only entry point is a per-row overflow menu in the assets list (`AssetsList.tsx:586`), under a component still named `ManageTanksModal`. Nothing in the 3D view or selection UI leads there. There is no list of "which templates already carry data".
4. **Modal-covers-viewport conflicts:** `LightsSection`'s "Select in 3D" (`GameDataSections.tsx:304-313`) selects and reveals the light while the fullscreen SubPart Data modal still covers the viewport — the user must close the modal manually to see the effect. Similarly, all feed/wiring editing is blind to the 3D scene (you pick container/connector ids from dropdowns with no spatial hint).
5. **Editing scope is subtle and explained only by prose banners:** SubPart data is per-TEMPLATE (all placements share it — nozzle vectors banner at `EngineSections.tsx:467-478`), gimbals/wiring are per-INSTANCE, tanks address per-PLACEMENT in feeds. Three different scoping rules meet in one dialog stack; v2's mode design should make scope structural rather than textual.
6. **Left-edge floating-card collision:** `MeasurementEditor` and `ContainerEditor` both use `FloatingEditorPanel`'s single desktop slot (`app.tsx:115-118`, `FloatingEditorPanel.tsx:33`) — an active measurement and an active container overlap at the same `left-3 top-1/2` position.
7. **Modeled-but-invisible fields:** `Tank.roleAffinity` and `Tank.locationAsmb` (`types.ts:467-483`) round-trip but have no widgets; `extraDiametersM` likewise (`types.ts:1153-1162`); passthrough XML is entirely invisible (no viewer). Users editing an imported Core part cannot tell that data exists.
8. **Index-keyed lists:** tanks/power/cards use `key={i}` (`GameDataSections.tsx:201`, `:448`, `:564`), fine for append/remove-at-end but causes React state bleed on middle-removal for focused inputs; also add/remove of list items is not reachable via any bulk operation.
9. **Naming debt:** `ManageTanksModal` edits tanks+lights+solar+engines; "Containers" is overloaded (see intro); `GameDataSections.tsx` also exports the generic `Field`/`ItemCard` primitives used by EngineSections (`EngineSections.tsx:6`) — a utility dependency hiding in a feature file.
10. **Unit inconsistencies:** solar-panel orientation edits in **radians** (`GameDataSections.tssx:575` label "Orientation (radians)") while lights and gimbals edit in degrees; pressure edits in bar but stores Pa; cone angles are half-angles. All intentional per KSA, but v2 should standardize the presentation conventions.
11. **`useEffect`-triggered catalog loads** scattered per-component (`EngineSections.tsx:142-144`, `:1495-1497`) rather than mode-entry loading.

---

## 5. Invariants & constraints (MUST survive v2)

1. **Round-trip fidelity via RawXmlNode passthrough** — importing a built-in part and re-exporting must never drop unmodeled `<PartGameData>`/`<SubPartGameData>` XML. The allow-list sets (`partXmlParser.ts:905-956`), `captureUnknownChildren`, `buildRawNode` re-emit, connector-ref remapping on import (`remapRawConnectorRefs`), `customMassExtras` re-nesting, and the deliberate `IVASeat` omission from the SubPart set (do-not-fix comment at `partXmlParser.ts:935-941`) are all load-bearing.
2. **Model the CURRENT KSA build only; no migration/back-compat code** (AGENTS.md constitution; memory `feedback_no_data_migration`). Stale persisted data is purged at boot, never converted.
3. **KSA plumbing semantics** (`scope/plumbing-and-feeds.md`, baseline 2026.7.9.5018): `FeedsFromReference` = exactly one of Container/Connector/Parent (enforced by the `FeedSource` union); ConsumerFeedWiring entries may NOT defer to Parent; empty `<Capabilities>` = `Electricity|ServiceFluid` with `No*` inversion; `[Flags]` bodies whitespace-separated; capabilities emitted identically in both XML docs; blank-Id containers are unaddressable and skipped; per-placement container addressing (`SubPart=` scope). Empty-feed warnings quote KSA's actual log strings — keep that fidelity.
4. **Stale-reference preservation in every picker:** deleted connectors/containers/consumers stay selectable and labeled rather than being silently retargeted or dropped (`GameDataSections.tsx:638`, `FeedsField.tsx:107-111,137-151`, `EngineSections.tsx:1213-1229`). Same philosophy as the verbatim non-unit exhaust direction (warn + explicit Normalize, never auto-rewrite — `EngineSections.tsx:627-664`).
5. **Numeric-input convention:** ALL numeric fields must use `useNumberDraft`-based `PreciseNumberInput` with `inputMode="url"` (mobile minus-key; no empty→0 stomp; ".06"/"-" typeable) — `src/ui/PreciseNumberInput.tsx:32`. Project-wide mandate.
6. **Undo conventions:** streaming fields push undo once on focus/interaction-start; discrete actions self-record; undo snapshots part+containers+measurements atomically. Descriptions feed the undo toast and HistoryButton.
7. **Domain unit/geometry facts:** pressures stored Pa shown bar (`PA_PER_BAR`); throttle stored 0–1 shown %, min 1%; MinimumThrottle 1.0 = on/off; AreaRatio NaN = required-but-unset; exhaust direction default −X and thrust = −direction × magnitude (unnormalized by KSA); solid nozzles have no area ratio (throat auto = exit/12); one power consumer per part (single `Part.LightSwitch` slot); cone angles are half-angles ≤90°; `<Rocket>` may bind only-solid or only-liquid; Category="Solid" reactions require the 4 burn-rate fields or export omits them; per-template SubPart data shared by all placements; gimbals keyed by instance; part-level tanks are the only `SubPart=`-less feed targets.
8. **Persistence formats:** projectCodec field encodings (`g`/`sg`/`tg`/`cr`…) and `flexo:containers` localStorage key; reference containers persist with the project and are never exported; `warnPrecision` is global.
9. **Editor tags free-form:** the registry only drives suggestions/grouping; arbitrary strings must remain addable (`EditorTagsField.tsx`, `types.ts:429-434`).
10. **`normalizeSize` shape constraints** for reference containers (cylinder x=z, sphere uniform) applied to both typed input and gizmo drags.

---

## 6. Hotkeys

**None registered by this area.** `src/ui/hotkeys/registry.ts` contains only workspace/transform/selection/undo entries (rotate, nudge, delete, copy/paste, action-chain, undo/redo, help, exit-seat). Relevant indirect keys: global **⌘Z/⌘⇧Z** undo-redo apply to all edits made in these dialogs (react-aria modals don't block them); `PreciseNumberInput` supports **arrow-key step, Shift ×10, Alt ×0.1** per field; Escape dismisses the dismissable modals/popovers (react-aria default). v2 could add direct hotkeys for the data mode — none exist to preserve.

## 7. Cross-area dependencies

- **Assets list / right sidebar** (other area) hosts the only entry to SubPart Data; its rows determine data-capability (placements vs other kinds).
- **TransformInspector / selection** (other area) owns connector Capabilities + flags — the other half of plumbing — and part-level light editing; `LightsSection` hands off via `selectLight`/`revealEntity`.
- **Engine area:** EnginePanel/EngineToolbar/engineStore render this area's section components; `validateEngines` + `enginePhysics` power the issues panel and readouts; reactionStore/reactionCatalog shared.
- **3D layer:** `ContainerLayer` renders/gizmos reference containers; exhaust/FX handles visualize nozzle vectors edited here; connectors created in the workspace feed the coupling/feed pickers.
- **Export/import:** ExportButton consumes the serializer; ImportModelDialog/part import populate gameData + passthrough; project export/import (data-only JSON) carries all of it; `scaleEverything` (`editorStore.ts:2349-2381`) deliberately does NOT scale tanks or reference containers.
- **Mobile shell:** MobileTopBar re-hosts Part Data and Measure as controlled modals/sheets.
- **Undo/History:** Toolbar undo/redo buttons + HistoryButton display the labels this area's actions push.

## 8. Open questions for v2

1. **One data mode or two?** Merge part-level and per-SubPart data into a single "data mode" tree (part root + template nodes, showing data-capable vs non-capable subparts), or keep part-level vs subpart-level as separate panels? The template-vs-instance-vs-placement scoping (SubPart data per template, gimbals/wiring per instance, feed targets per placement) needs a structural answer either way.
2. **Where does engine data live?** The same engine sections currently render in 3 surfaces. Should v2's data mode own controllers/wiring/gimbals while the engine mode owns chambers/nozzles/performance — or should the engine mode be the sole home with the data mode linking into it?
3. **Passthrough visibility:** should v2 add a read-only "unmodeled XML" viewer (tree of RawXmlNodes per part/template)? Pure win for trust, but risks inviting hand-editing.
4. **Expose currently-hidden modeled fields** (`Tank.roleAffinity`, `Tank.locationAsmb`, `extraDiametersM`)? They're round-tripped today; editing them is new scope.
5. **Reference containers' home:** they're currently a subsection of the Measure popover + a floating editor. In a sidebar-based v2, do containers/measurements become a sidebar tab (freeing the left-center floating slot and fixing the Measurement/Container overlap), with floating editors reserved for gizmo-adjacent controls only?
6. **Capabilities placement:** keep connector Capabilities with the connector's transform inspector, or mirror them into the plumbing/data view where FeedsFrom is edited (risk: two editors for one field — but that's already the norm here)?
7. **Validation surfacing:** EngineIssuesPanel is buried inside a collapsed section. Should data-mode validation move to the planned bottom status bar / notifications, with click-through to the offending module?
8. **Dialog vs sidebar for part data:** the density complaint suggests a persistent data sidebar/mode rather than a fullscreen modal — but tanks/lights/nozzles benefit from seeing the 3D view while editing; which sections need viewport co-visibility (lights, nozzle vectors, gimbals) vs which are pure forms (identity, mass, power)?
