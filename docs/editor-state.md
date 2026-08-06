# Editor State

Framework-agnostic editor state using **nanostores**. No React or three.js imports —
the 3D scene subscribes with vanilla `subscribe()`, React reads via
`useStore()` (`@nanostores/react`). Mirrors space-tape's `PartEditorController`.

## Stores — `src/state/editorStore.ts`

| Atom | Type | Meaning |
|---|---|---|
| `$part` | `EditingPart` | The whole part: `partId`, `editorTags`, `gameData` (display name, mass, tanks, power, coupling — the popup-only metadata with no 3D form), `layers[]`, `placements[]`, `connectors[]`, `colliders[]` (each carries a `layerId` naming an ordinary layer; connector `flags` is a `ConnectorFlag[]`). Treated as **immutable** — every mutation replaces it with a fresh object (so subscribers fire). |
| `$selection` | `readonly SelectionRef[]` | **THE selection** — one ordered list of `{kind, id}` refs spanning every entity kind (`'subpart' \| 'connector' \| 'collider' \| 'ivaSeat' \| 'light' \| 'kitten'`). The LAST element is the primary. Ephemeral: never persisted, never undone, survives mode switches. See "The selection" below. |
| `$lightEditContext` | `Record<string, number>` | Per light id, **which placement of its owner template** was last clicked. |
| `$activeLayerId` | `string` | Layer new items land in. Ephemeral (not persisted, not undone); clamped to a live layer. See [layers.md](./layers.md). |
| `$chainSession` | `ChainSession \| null` | The open action-chain session (`src/state/chainStore.ts`): frozen seed `instanceId`s + the ordered step list. **Ephemeral by design** — never persisted, never undone; the document is untouched until Apply, which is what makes Cancel unconditionally safe. The only persisted piece is the module-private `flexo:chainDefaults` (last-used parameters per op kind). See [action-chains.md](./action-chains.md). |
| `$toolMode` | `'translate'\|'rotate'\|'scale'` | Drives the 3D gizmo. |
| `$gizmoSpace` | `'world' \| 'local'` | Which axes the gizmo's handles use. Persisted (`flexo:gizmoSpace`), never undone; the Tool bar's **W/L** segmented control and the `tool.toggleGizmoSpace` command are its writers. |
| `$snap` | `{ translate?, rotateDeg? }` | Grid / rotation snap (0/undefined = off). **It has real UI now** — see "Snap" below; nothing else writes it. |
| `$clipboard` | `Clipboard \| null` | The copy/cut buffer: placements, connectors, kittens, colliders, IVA seats **and lights**, deep-cloned at copy time. Ephemeral, never undone. |
| `$canUndo` / `$canRedo` | `boolean` | Enablement for the menubar ↶ ↷ pair and the `edit.undo`/`edit.redo` commands. |

(`$lightEditContext` is ephemeral too — one atom, so the gizmo's write-back frame and the
inspector's part-frame fields can never disagree about which instance an edit converts
through.)

Per-layer **visibility/lock** is NOT in `$part` — it's persisted view state in
`src/state/layerStore.ts` (`$layerView`). See [layers.md](./layers.md).

## The selection — stable ids, never indices

`$selection` holds `SelectionRef = { kind: EntityKind; id: string }`, where `id` is the
entity's own stable id (`instanceId` for a SubPart, the entity id for everything else). It
replaced six per-kind **index** arrays, and the reason is a real bug those had: an index is
positional, so after an undo the old `clampSelection` could leave a surviving index pointing
at a **different** entity. An id either resolves or it does not, so "clamping" is now one
filter that drops dead refs and never re-points a live one.

**Actions** (all in `editorStore.ts`, none of them undoable):

| Action | Meaning |
|---|---|
| `select(refs, { additive? })` | Replace (or extend) the selection. Deduped by `kind:id`, first occurrence wins; refs whose entity does not exist are dropped. |
| `toggleRef(ref)` | Add/remove ONE ref, leaving the rest — the additive (⇧/⌘/⌃) viewport click. An appended ref becomes the primary. |
| `deselectRefs(refs)` | Drop several refs (the subtractive marquee). |
| `clearSelection()` | Empty it. |
| `selectLayerEntities(layerId)` / `deselectLayer(layerId)` | Every entity on a layer / everything on it, in one pass. |
| `selectAll()` / `invertSelection()` / `deselectAll()` | `src/state/selectionOps.ts` — the Select-menu ops. Their population is every entity on a **listed AND visible AND unlocked** layer. They live in their own module because they need both `editorStore` and `layerStore`, and `layerStore` already imports `editorStore`. |

**Resolution helpers**: `entityIndexOf(part, kind, id)` (→ `-1` when gone),
`entityIdAt(part, kind, index)`, `refLayerId(part, ref)`, and `KIND_ORDER` — the fixed kind
order (`subpart, connector, collider, ivaSeat, kitten, light`) every flattening uses, because
bulk-transform math pairs a snapshot with its write-back positionally.

**Derived views** live in `src/state/selectors.ts`: `$hasSelection`, `$hasMultiSelection`,
`$selectionCount`, `$selectionByKind` (all six keys always present), `primaryOf(kind)`,
`$selectedPlacement(s)`, `$selectedEntity` (non-null iff exactly one entity is selected), and
`$selectedRefs`.

**Transform write-back is by id.** `selectedTransformRefs()` returns
`{kind, id, index, transform, layerId, name}` per selected entity in `KIND_ORDER`, and
`updateSelectedTransforms([{kind, id, transform}])` resolves each id fresh and switches on the
kind exhaustively. (`index` is recomputed on every call and is transitional — only
`EditorScene`'s collider/light owner-frame lookups still use it.)
The v1 version indexed the arrays and fell through to a kitten default, so a kind that missed
its branch silently moved the kitten sitting at the same index; that trap is gone.

> **The v1 index layer is gone.** The six `$selected*Indices` / `$selected*Index` views and
> every per-kind setter (`selectPlacement`, `setSelectedColliders`, `setSelection`,
> `toggleEntity`, …) were deleted with their last consumer, the v1 assets list. There is
> nothing to migrate to: read the selection through `selectors.ts`, write it through
> `select` / `toggleRef` / `deselectRefs`. Note that `primaryOf(kind)` returns a **ref**, not
> an index, and — unlike the v1 name `$selectedConnectorIndex` suggested — nothing about the
> selection is single-kind or singular: one selection freely spans all six kinds.

## The mode machine — `src/state/modeStore.ts`

The editor's posture is one atom. There is no `$inspectorMode` any more: the v1 three-way
sidebar atom (`'assets' | 'anim' | 'engine'`) is gone, and every consumer reads `$mode`.

| Export | Meaning |
|---|---|
| `$mode` | `'build' \| 'animation' \| 'data' \| 'engine' \| 'surface'`. **Ephemeral** — boots to `'build'` on every reload, never persisted, **never an undo step**. |
| `$activeTool` | The single transient-tool slot (`'measure' \| 'seat-view' \| 'exhaust' \| 'marquee' \| 'member-paint' \| 'pivot-pick'`, or `null`). Arming one cancels the previous. The chain session is deliberately NOT in this slot — it is a parallel, non-modal session. |
| `MODES` / `TOOLS` | The display-order datasets the menubar switcher, the status chip, the phone tab bar, the palette and the hotkey validator all render from. |
| `setMode(next, payload?)` | **THE** choreography point: exit hooks → cancel the armed tool (unless its `ToolDef` says `survivesModeSwitch`) → set `$mode` → enter hooks. It never touches the document, `$part`, undo history, the selection, the camera, layer view state or the active layer. |
| `registerModeHooks` / `registerTool` | How an area store declares its own entry/exit choreography and tool teardown. Hooks are wrapped in try/catch — a broken area hook can never strand the UI between modes. |
| `resetModeForProjectLoad()` | Project load/switch: mode → Build, tool slot cleared. Called from `applyProjectSnapshot`. |

Two derived flags moved with it: `$isPoseEditing` and `$isExhaustPlacing` now derive from
`$mode` (plus their own area state) instead of the deleted inspector atom.

### Data mode's sub-state — `src/state/dataModeStore.ts`

Data mode is the canonical GameData surface, and everything that decides *what it is showing*
lives here. All of it is **ephemeral view state: never persisted, never an undo step.**

| Export | Meaning |
|---|---|
| `$dataScopeRaw` / `$dataScope` | The scope the left form shows: `{kind:'part'}` or `{kind:'template', templateId}`. The computed CLAMPS a template with zero placements back to Part, leaving the raw atom alone so undoing the deletion restores the scope. |
| `sectionsFor(scope)` / `sectionDef(id)` | The ONE section dataset. The navigator's child rows, the form's chip strip and the form's section stack all render from it, so the three can never disagree about order, wording or which sections a scope has. |
| `$dataSectionJump` / `jumpToSection(id, cardKey?)` | The nonce'd "scroll to + expand + flash" intent a chip, a navigator row or a finding fires. The nonce is what makes a second click on the same chip do something visible. |
| `$dataSearch` / `setDataSearch` | The navigator's fuzzy filter. |
| `$dataHighlight` | Instance ids of the scoped template's placements, in Data mode only — a persistent viewport TINT, not a selection. |
| `$dataFlash` / `flashPlacements` / `flashConnector` / `clearFlash` | The one-shot ~600 ms flash behind row hovers, scope chips and the Coupling section's "Show →" eye. Two id spaces, because placements and connector markers highlight through different scene paths. |
| `initDataMode()` | Registers the entry ladder (jump payload → surviving scope → selected SubPart's template → Part) plus the reaction-catalog preload. Exit has NO effects: the scope must survive for the return trip. |

### Engine mode's sub-state — `src/state/engineStore.ts`

Engine mode's designer state, all of it **ephemeral: never serialized, never an undo step**.
Every reference into `$part` is re-resolved on read, so a removed module or placement degrades
to a sane fallback instead of editing the wrong thing.

| Export | Meaning |
|---|---|
| `$activeEngineEntry` / `activateEngine(entry)` | The open engine SCOPE — a SubPart template or the part itself (`PART_ENGINE_ENTRY_KEY = '\0part'`). `activateEngine` also resets the module focus, since a module ref is indexed WITHIN a scope. |
| `engineEntryLabel` / `engineEntryShortLabel` / `engineEntryKey` / `engineEntryFromKey` | The ONE label + key helpers (v1 duplicated them across two components). |
| `$activeModule` / `$activeModuleClamped` / `focusModule(ref)` | Which module the LEFT editor shows: `{group, scope, index}`. The clamped read returns null once the index falls out of range, which is what makes removing the focused module fall back to the summary card instead of rendering over `undefined`. |
| `engineModuleCount(part, entry, group, scope)` | The one place that knows which `$part` list backs each module group. |
| `$activeNozzleRef` / `$resolvedNozzleTargets` / `$activeNozzleTarget` / `cycleExhaustTarget(±1)` | The exhaust handles: nozzle × flavor × placement × channel, exactly one active. `,` / `.` walk them in chip order. |
| `$isExhaustPlacing` / `$effectiveToolMode` / `setExhaustPlacing` / `toggleExhaustPlacing` | Exhaust placement's tenancy of the single `$activeTool` slot, plus the Scale→Move clamp the Tool bar displays truthfully. |
| `$engineFindings` / `$engineBlockerCount` / `moduleRefForIssue` / `focusEngineIssue` | `validateEngines` over the live catalog, the mode-switcher attention dot, and the click-through that opens a finding's scope, focuses its module and flashes the field. |
| `$moduleFlash` / `flashModuleField(key)` | The nonce'd field-flash intent the editors consume (`mixtureRatio`, `exhaustDirection`, `defaultPressure`, `reactionId`, `areaRatio`). |
| `$rocketReadoutSel` / `FIRST_PAIR_ROCKET` | Which `<Rocket>` the Performance card aggregates over. |
| `$engineDefineFlow` / `requestDefineNewEngine` / `$engineTreeCollapsed` / `jumpToEngineGroup` | The define-new pushed view and the tree's collapse state — in the store, not in component state, so a cross-mode jump can open or reveal them without an effect writing state. |
| `initEngineMode()` | Registers the entry ladder (jump payload → surviving scope → selected SubPart's template → the single scope → empty) plus the reaction + solid-curve preloads. **`enterEngineMode` / `exitEngineMode` are GONE** — `setMode('engine', payload)` is the single choreography point, and exit needs no hook (the refs are retained for the return trip, `setMode` cancels the tool, and `EditorScene` disposes the handles on `$mode`). |

Engine document mutations stay in `editorStore`: `addEngine` / `addRcsEngine` /
`addSolidEngine` / `addSrbEngine` are ONE-undo-step composites, `duplicateEngineModule(ref, templateId)`
clones and re-ids a module, and `updateReactionPlumes(locator, plumes)` is the discrete setter
behind the nozzle editor's `<ReactionPlume>` list.

### The findings pipeline — `src/state/gameDataFindings.ts`

`$gameDataFindings` is one derived list feeding all three validation surfaces: the navigator's
pinned strip, the status bar's Data segment and the click-through. Contents are
`validateEngines`' issues (codes, severities and KSA log wording UNCHANGED) re-addressed to a
`(scope, section, card)` target, plus a blank Part Id and duplicate tank feed ids within one
scope. `focusFinding(finding)` is the shared click-through — scope, then jump, then flash.

### The transient tools — one slot, six tenants

A tool is layered ON TOP of a mode, never a mode of its own. Each one declares its rules
once, at module scope in the store that owns its state, via `registerTool(id, def)`:

| Tool | Allowed modes | On mode switch | Status segment | Escape | Owner |
|---|---|---|---|---|---|
| `measure` | all | **cancels** (including a half-placed pick) | `Measure — click first point` → `…second point`, with an `Esc` chip | rung 5 — cancels the pending point AND disarms | `measurementStore.ts` |
| `seat-view` | all | **survives** (`survivesModeSwitch: true` — it is a camera state, not a mode-local affordance) | `Seat 2 / 4` plus the interactive `◀ ▶ ⓘ Exit` controls | rung **8** (never `preventDefault`ed — v1 contract) | `ivaStore.ts` |
| `exhaust` | **Engine only** | auto-off (the mode disallows it, so `setMode` cancels it) | `Exhaust: NozzleB #2 · FX` | rung 5 | `engineStore.ts` |
| `marquee` | all | cancels | `Box select — drag to select` → `…release to select` | rung 5 | `EditorScene.ts` |
| `member-paint` | **Animation only** | auto-off | `Paint members → <joint>` | rung 5 | `animationStore.ts` |
| `pivot-pick` | **Animation only** | auto-off | `Pick pivot point — click a surface` | rung 5 | `animationStore.ts` |

`$pivotEditing` — Animation's `⊕ Edit pivot` gizmo mode — deliberately does NOT hold the
slot (it is a gizmo routing change, not a pointer claim), but rung 5's `when` predicate
covers it so one Escape still ends it.

Two invariants fall out of the single slot and are worth stating plainly:

- **Arming any tool cancels the previous one.** Pressing `M` while seated exits seat view;
  arming the marquee while measuring discards the half-placed point. This replaced v1's
  ad-hoc OR of per-feature suppression flags.
- **Escape rung 5 is generic.** It runs `disarmTool()`, which runs whichever `onCancel` the
  armed tool registered. Adding a tool needs no new rung. (Seat view is the exception — it
  keeps rung 8 so its Escape can still reach a dialog underneath.)

A tool's own flag atom (`$measureTool`, `$engineExhaustGizmo`) survives as a MIRROR of the
slot, because the slot models "which tool", not "which kind of pick". Only the tool's
public setter writes both; an `onCancel` writes the mirror directly, never back through the
setter, or arming a successor would recurse.

### Snap

`snapStore.ts` (`flexo:snapEnabled` / `flexo:snapTranslateStep` / `flexo:snapRotateStep`)
computes and writes `$snap`; `TransformGizmo` reads `$snap` exactly as it always did. The
effective state is `enabled XOR invert`, where `invert` is "⌃ held during a drag" — holding
⌃ gives you the temporary opposite of whatever the toggle says. UI: the Tool bar's magnet +
its step popover, and the status bar's snap chip. Snap is view state: **never undoable**.

Scope state for the keyboard lives beside it in `src/state/hotkeyStore.ts`
(`$focusedSurface`, `$dialogOpen`, `$activeScopes`) — a binding declares one scope string and
is enabled iff that string is in `$activeScopes`. See
[3d-workspace.md](./3d-workspace.md#viewport-keys) for the viewport bindings and the Escape
ladder.

### The rest of the shell stores

Five more stores in `src/state/` belong to the chrome rather than the document, and all five
follow the same contract: **never in `$part`, never an undo step, never read by
`src/three/`** except through an explicit intent atom.

| Store | Atoms | Persistence |
|---|---|---|
| `layoutStore.ts` | `$layout` — `{left, right}` sidebar `{width, collapsed}`, `timeline {height, collapsed, hidden}`, `float` / `floatOrder` / `floatHidden`; plus `SIDEBAR_CLAMPS` (left 220–480, right 260–640) and `TIMELINE_MIN_HEIGHT` 120 | `flexo:layout` |
| `statusStore.ts` | `$statusMessage` (ONE slot — a new message overwrites, never queues), `$lastStatusMessage`, `$toolStatus`, `$statusConfirm`, `$fpsReport`, `$advisories`, computed `$progress` | none |
| `notificationStore.ts` | `$notifications` (ring of `NOTIFICATION_RING_MAX` = 100, newest first), `$unreadCount`, `$notificationCenterOpen`, `$notificationFocusId` | none — session-only |
| `modifierStore.ts` | `$heldModifiers`, `$hoverContext`, computed `$modifierHints` over registered providers | none |
| `commandStore.ts` | the command + provider registries, `$paletteOpen`, `$paletteRecents` (8 ids) | `flexo:paletteRecents` |
| `dialogStore.ts` | `$openDialog` — `{id, params} \| null` over 20 `DialogId`s | none |

`projectIndexStore.ts` sits alongside them but is backed by IndexedDB rather than
localStorage — see [projects.md](./projects.md). Full behavioural detail for all of these is
in [ui-shell.md](./ui-shell.md).

Undo/redo stacks are module-private arrays (depth 50), not atoms. They're exposed
for project persistence only via `exportHistory()` / `importHistory(snapshot)` (so
undo survives a reload) — see [projects.md](./projects.md).

## Actions (plain exported functions)

`addSubPart(templateId)`, `addPart(placements, connectors, tags)`, `addConnector()`,
`setConnectorFlags(index, flags[])`, `removeSelected()`, `duplicateSelected()`,
`updatePlacementTransform(index, {position,rotation,scale})`,
`updateSelectedTransform(t)`, `setPartId(id)`, `setEditorTags(tags)`,
`setToolMode(mode)`, `setSnap(snap)`, `newPart()`, `pushUndo()`, `undo()`, `redo()`.

**Collider actions** (`part.colliders`; see [colliders.md](./colliders.md)) — all enrolled
in undo: `addCollider(shape, transform?, owner?)`, `setColliderShape(index, shape)`,
`setColliderOwner(index, owner, converted?)`, `removeCollider(index)` are **discrete**
(they `pushUndo()` themselves); `setColliderSize(index, size)` and
`updateColliderTransform(s)` are **streaming** (the caller pushes once at field focus /
gizmo drag start, exactly like the placement/connector transform writers). Every one of
them routes the size through `normalizeColliderSize`, because a collider's `scale` is its
size in meters, not a multiplier.

**IVA seat actions** (`part.ivaSeats`; see [iva-seats.md](./iva-seats.md)) — all enrolled in
undo. **Discrete** (they `pushUndo()` themselves): `addIvaSeat(transform?)` (lands last, i.e.
last in the cycle order, and selects itself), `removeIvaSeat(index)`,
`moveIvaSeat(index, delta)` (the **reorder** — that order is exported game data, and the
selection follows the seat through the splice), `aimIvaSeat(index, rotation)` (the inspector's
aim presets and "Aim at selection", both one gesture), and `addKittenAtSeat(seatIndex, kind?)`
(which mutates `part.kittens`, not the seat). **Streaming** (the caller pushes once at gizmo
drag start, exactly like the placement writers): `updateIvaSeatTransform(index, t)` and
`updateIvaSeatTransforms(updates)`. Both route through the private `assignIvaSeat`, which
copies position + rotation and **pins `scale` to (1,1,1)** — KSA has no seat size, so a
scale-mode drag is a deliberate no-op.

**Light actions** (`part.lights`; see [lights.md](./lights.md)) — all enrolled in undo.
**Discrete** (they `pushUndo()` themselves): `addLight(ownerTemplateId, seed?)` (appends a
`createPartLight` default under a freshly generated `_lightN` id; the id, owner and layer are
never seed-overridable), `removeLight(index)`,
`setLightType(index, type)`, `setLightRayTracing(index, on)`, and
`setLightOwner(index, ownerTemplateId, converted?)` (the re-home between `<PartGameData>` and a
template's `<SubPartGameData>`; the caller supplies the frame-converted transform so the store
stays three.js-free — the `setColliderOwner` precedent). **Streaming** (the caller pushes once
at field focus / gizmo drag start): `updateLight(index, patch)` (the `<Light>` scalars — range,
intensity, colour, cone angles), `setLightPosition(index, position)`,
`setLightRotation(index, rotation)`, and `updateLightTransform(index, t)`. The three transform
writers route through the private `assignLight`, which copies position + rotation and **pins
`scale` to (1,1,1)** — KSA ignores light scale, so a scale-mode drag is a deliberate no-op (the
IVA-seat rule).

**`setPlacementsInternal(indices, internal)`** is discrete (one undo entry) and writes
`part.internalFlags` for the **distinct** SubPart templates behind the given placements — KSA
puts `<Internal>` on the template's `<PartModel>`, so it is never per-placement. Glass-exporting
templates are skipped (`isGlassTemplate`, exported so the menus can *disable* the item rather
than silently drop the write).

**GameData actions** (`part.gameData`, used by Data mode's scope form): `setDisplayName`,
`setCustomMassEnabled` / `setCustomMass`, tanks `addTank` / `removeTank` /
`setTankShape` / `updateTank`, power `add*`/`remove*`/`set*` for batteries / generators
/ power-consumers, and coupling `set{Decoupler,DockingPort,EvaDoor}Enabled` /
`set*Connector` / `setDecouplerForce` / `setDockingPort{LatchingImpulse,PushoffForce}`.
List add/remove, checkboxes and
Select picks are **discrete**; free-text/number field edits are **streaming**.

Three of them are Data mode's own:

- **`setExtraDiameters(list)`** — **streaming** over `gameData.extraDiametersM`, the repeated
  `<Diameter M/>` size classes an adapter declares. It pushes NO undo itself: the list editor
  streams like any other field, and its add/remove buttons push their own discrete
  `'add size class'` / `'remove size class'` step before calling it.
- **`removeAllTemplateData(templateId)`** — ONE discrete `'delete SubPart data'` push behind
  the scope header's whole-container confirm. It removes the template's `<SubPartGameData>`
  entry and its template-owned lights, and deliberately does NOT touch colliders: a
  template-owned collider is a Build entity with its own inspector.
- **`setEvaDoorSeat(seatIndex | null)`** — ONE discrete push authoring BOTH halves of the
  `<EVADoor SeatId>` ⇄ `<IVASeat Id>` link (minting `seat_<n>` against the shared component-id
  namespace when the seat has no authored id). Authoring one half ships a hatch with no
  in-game EVA button.

**Action-chain actions** (see [action-chains.md](./action-chains.md)) live in two places. The
**session** is `src/state/chainStore.ts` — `openChain(seedIds)` / `closeChain()` /
`addChainOp(kind)` / `updateChainOp(id, patch)` / `removeChainOp(id)` / `moveChainOp(id, ±1)`
/ `moveChainOpTo(id, index)` (the drag-reorder commit), plus `defaultOp` and `clampOp`. **None of them push undo**: the session is ephemeral UI state
(selection-tier), not document state, so the invariant below does not apply to them.
`updateChainOp` also writes the op's parameters to the persisted `flexo:chainDefaults` blob,
which `defaultOp` reads back defensively (unknown or malformed fields degrade to the hardcoded
defaults — no migration). The **commit** is `applyActionChain(entries, detail)` in
`editorStore.ts`, a discrete mutation that collapses seed moves *and* every clone into one undo
entry, and selects seeds + copies afterwards. The live evaluation between the two,
`$chainEval`, is a `computed([$part, $chainSession], …)` in **`src/three/chainEval.ts`** rather
than `src/state/` — it needs the three.js math engine (`chainMath.ts`), and it is what both the
palette footer and the ghost preview read.

Conventions:
- Instance ids: `lastDotSegment(templateId).toLowerCase() + "_" + (count+1)`
  (e.g. `Core.Screw.A` → `a_1`, `a_2`).
- Mutating actions clone `$part` (`structuredClone`), edit, then `$part.set(next)`.

### Duplicate, clipboard, delete

- **`duplicateSelected({ offset })`** — one undo step `'duplicate'` over every selected kind.
  By default each copy is offset by the **nudge chip's current step along its current axis**,
  so copies are never invisibly stacked on their originals; `{ offset: false }` is the
  in-place variant the ⌥-drag gesture uses (the drag itself supplies the displacement). The
  copies become the selection.
- **⌥-drag duplicate** — holding ⌥ when a gizmo drag STARTS duplicates first and then drags
  the copies, so the whole gesture is one undo step and a single ⌘Z removes the copies.
- **Clipboard** — `copySelected()` / `cutSelected()` / `pasteClipboard()`. All six kinds are
  carried, **lights included** (a v1 gap). `cutSelected` copies and deletes in ONE undo step
  labelled `'cut'`. Paste restores in place with regenerated ids, keeping each entity's
  original layer where that layer still exists.
- **Delete policy** — one rule (foundation §14.3): a small delete just happens and flashes an
  inline `[Undo]` in the status message channel; a large one (above the command's threshold)
  raises the status bar's inline confirm strip rather than a modal.

### Undo/redo invariant (must maintain)

History snapshots **`$part` only** (the serialized document: `partId`, `editorTags`,
`gameData`, `layers`, `placements`, `connectors`, `colliders`, `ivaSeats`, `lights`,
`internalFlags`, incl. each entity's `layerId`). Selection, `$toolMode`, `$snap` and
`$activeLayerId` are ephemeral UI and are intentionally excluded (so are `$gizmoSpace` and
the `snapStore` keys, which are persisted view preferences); selection + active layer are
*clamped* (not restored) after undo/redo. So are the seat-view and seat-aim atoms (`$seatView`
/ `$seatLook` in `ivaStore.ts`, `$ivaSeatAimRequest` in `ivaSeatStore.ts`) and the light
editing context (`$lightEditContext`) — an aim request only enters history through the
`aimIvaSeat` it eventually causes.
Per-layer visibility/lock is also excluded (it's persisted view state in
`layerStore.ts`). Every action that mutates `$part` MUST enroll in undo via exactly
one of two patterns:

1. **Discrete** (one gesture = one change): the action calls `pushUndo()` itself.
   `addSubPart`, `addPart`, `addConnector`, `removeSelected`, `duplicateSelected`,
   `applyActionChain` (a whole action chain — seed moves + every clone — is one step),
   `setConnectorFlags`, `setEditorTags`, the GameData list/toggle/Select actions
   (`addTank`/`removeTank`/`setTankShape`, power add/remove, coupling enable +
   `set*Connector`, `setCustomMassEnabled`), and the layer mutators `createLayer`,
   `renameLayer`, `deleteLayer`, `clearLayer`, `reorderLayers`, `moveEntityToLayer`,
   `moveSelectionToLayer` (see [layers.md](./layers.md)).
2. **Streaming** (rapid updates that collapse to one step — a gizmo drag or a typing
   session): the action does **not** push; the caller pushes once at interaction
   start (gizmo drag-start; field focus). `updatePlacementTransform(s)`,
   `updateConnectorTransform`, `updateSelectedTransform`, `setPartId`, and the GameData
   field setters (`setDisplayName`, `setCustomMass`, `updateTank`, power `set*`,
   `set*Force`) — all focus-pushed by the field itself, through
   `PreciseNumberInput`/`NumberField`'s `onInteractionStart`, wherever Data mode's
   `ui/data/sections/*` mounts it.

`newPart()` clears both stacks (a new document has no history). Adding a `$part`
mutator that picks neither pattern silently bypasses undo — that's a bug. The invariant
is also documented at the top of the undo/redo section in `editorStore.ts`.

## Selectors — `src/state/selectors.ts`

The read side of the selection is entirely derived. `$selectedPlacement`
(`computed([$part, $selection], …)` — the primary SubPart or `null`) is what the inspector
and the gizmo-attach logic read; the rest of the module is listed under
["The selection"](#the-selection--stable-ids-never-indices) above. Nothing outside this
module recomputes selection membership from `$part`.

## Two-way binding (gizmo ↔ inspector)

Both edit the same store:
- Gizmo drag → `EditorScene` → `updatePlacementTransform(index, …)`.
- Focus-editor field → `src/ui/build/TransformGroups.tsx` → `updateSelectedTransform(…)`.

The inspector uses a focus-scoped `draft` string per field so free typing works while
focused, and the field reflects live store values (e.g. gizmo drags) when not focused.
Rotation is shown in **degrees**, stored/exported in **radians**.

### Numeric fields — `src/ui/numberDraft.ts`

Every numeric input in the app (`NumberField`, `PreciseNumberInput`, `Vec3Field`, the
layer-opacity percent box) shares `useNumberDraft`, and all of them are **text** inputs —
never `type="number"`. A number input sanitizes its own DOM value, so a half-typed `-`,
`.`, `0.` or `1e-` reads back as `''` and the controlled re-render erases what was just
typed; that is what made fractional/negative entry feel like a fight. The shared rules:

- keystrokes are kept verbatim in a draft string while focused; junk that can't become a
  number (`isPartialNumber`) is dropped without rewriting the draft
- each keystroke that parses to an **in-range** number commits live, so the viewport
  follows along; out-of-range keystrokes are skipped rather than clamped (clamping `0` on
  the way to `0.5` would fight the typist)
- blur/Enter finalize: clamp to `[min, max]` and commit — or restore the pre-edit value if
  what's left isn't a number at all (empty, `-`, `.`)
- Escape cancels the whole edit and is swallowed only while the edit is dirty, so a second
  Escape still closes the popover the field lives in
- ArrowUp/ArrowDown step by `step` (default 1; Shift ⇒ ×10, Alt ⇒ ×0.1)

Focus is still the streaming-undo boundary (`onInteractionStart`), so a typing session —
live commits, arrow steps and all — collapses into one undo step.

## List selection — `src/ui/rangeSelect.ts`

The app's multi-select lists — the **Outliner** (`ui/outliner/OutlinerPanel.tsx`, the
sectioned SubParts/connectors/colliders/seats/lights/kittens tree) and the **SubPart Set
Grid** (`ui/SubPartSetGrid.tsx`, the layer-sectioned picker behind Animation mode's docked
Members view) — carry the usual desktop-list gestures: click
replaces, Cmd/Ctrl+click toggles one row, Cmd/Ctrl+A takes everything selectable,
Shift+arrows extend by a row, and **Shift+click extends across every row in between**.

Only the last one is ours. react-aria's `SelectionManager.extendSelection` reads the
range anchor off the `Selection` object it handed to `onSelectionChange` — and both
lists are **controlled** (the Outliner from the selection store, the
grid from its host's checked set), so what comes back down is a freshly built plain `Set` with
no `anchorKey`. react-aria then anchors on the clicked row itself and a Shift+click
degenerates into "add the one row you clicked", which is the bug behind issue #5.

`useShiftRangeSelect` takes the gesture over: `rowProps(key)` records a primary-button
Shift+click on pointer-down (before react-aria's own, anchorless extension runs), and
`resolveSelection` swaps react-aria's keys for the computed range at the top of
`onSelectionChange`. Every other gesture passes through untouched. The rule
(`shiftRangeSelection`, unit-tested in `rangeSelect.test.ts`):

- the range runs from the clicked row to the **nearest already-selected row**, inclusive,
  and is added to the current selection — so for the ordinary contiguous selection this
  is exactly the expected convention, in either direction
- it only ever **grows**: there is no persistent anchor to trim toward, because selection
  here also arrives from the 3D viewport and "select all in layer". A Shift+click inside
  the selection fills the closest gap instead of shrinking the range, and a
  Cmd/Ctrl-built non-contiguous selection keeps its other holes.
- rows that can't be selected are **skipped, not blocking**: in the Outliner a range
  spans past (and up to) rows on a hidden or locked layer without selecting them, the
  same rule click-selection and the 3D viewport already follow
- ranges are computed over the displayed row order with the layer sections flattened, so
  one range can span layers *and* entity kinds (`$selection` is one cross-kind list)

## The UI surface map (`src/ui/`)

Five surfaces, and every panel in the app belongs to exactly one of them. The shell mechanics
— layout, mode machine, commands, status bar, hotkeys, phone — are documented in
[ui-shell.md](./ui-shell.md); this is the state-layer's view of who reads what.

**Right sidebar — the mode primary.** `ModeSidebar.tsx` is one switch on `$mode`:
`outliner/OutlinerPanel.tsx` (Build) · `animation/AnimationSidebar.tsx` ·
`data/DataNavigator.tsx` · `engine/EngineNavigator.tsx` · `surface/SurfaceSidebar.tsx`. Each
reads its own mode sub-state store plus `$part`, and each is a collection view: the Outliner
is the layers + entities tree ([layers.md](./layers.md)), the Data navigator is the scope
list plus the validation strip, the Engine navigator is the module tree plus the live
performance readout, the Surface sidebar is the mesh picker **and** (LOCKED) the material /
glow / UV editor.

**Left sidebar — the focus editor.** `ModeFocusEditor.tsx` switches the same way:
`build/BuildFocusEditor.tsx` · `animation/AnimationFocusEditor.tsx` ·
`data/DataScopeForm.tsx` · `engine/ModuleEditor.tsx` · `surface/SurfaceLeftPanel.tsx`.
Content is a pure function of `(mode, focus)` where focus = selection ∪ mode sub-state ∪
active aid ∪ armed tool — there is exactly ONE focus slot, which is what structurally ended
v1's left-centre triple-booking. Build's per-kind cards are `SubPartInspector` /
`ConnectorInspector` / `ColliderInspector` / `SeatInspector` / `LightInspector` /
`KittenInspector`, all over the shared `TransformGroups`.

**Status bar** — `status/StatusBar.tsx`, sixteen segments over `statusStore` +
`notificationStore` + `modifierStore`. It is the only home for transient feedback: `toast()`
is a facade that routes into those stores, and no component renders its own floating
message surface.

**Dialogs** — `shell/DialogRoot.tsx` mounts every overlay once and renders the one
`dialogStore.$openDialog` names (20 ids, one open at a time, stacking banned). No dialog is
owned by a trigger button, which is what retired v1's controlled/uncontrolled dual APIs.

**Floating windows — exactly two**, both children of the workspace band:
`build/ToolBarWindow.tsx` (Move/Rotate/Scale, the **W/L** gizmo-space toggle, the snap magnet
and its step popover; `ToolBarStrip` is the phone variant) and `chain/ChainWindow.tsx` (the
non-modal action-chain session, self-gating on `$chainSession` —
[action-chains.md](./action-chains.md)). Positions live in `flexo:layout` → `float`.

Two cross-cutting notes for the state layer:

- **Engine editors are scope-agnostic.** Each takes a `templateId` (`null` ⇒
  `<PartGameData>`) and dispatches to the matching action family, which is why Data mode's
  Wiring / Advanced / template-Engine sections render the SAME components through
  `ModuleCardList.tsx` and the two routes can never diverge in capability. See
  [engines.md](./engines.md).
- **Data mode is the canonical GameData surface** — `data/sections/*` covers every
  `gameData` / `subPartGameData` field (see [xml-io.md](./xml-io.md)), and Build's
  "SubPart Data →" is a mode jump, not a dialog.

## Persistence

UI settings and user preferences that should survive page refresh use **localStorage persistence** via `@nanostores/persistent`. See [state-persistence.md](./state-persistence.md) for patterns on what to persist (panel visibility, tool modes, view settings) and what not to (transient selections).

The whole editing workspace is also persisted as a **project** (document + layer view
state + active layer + camera + editor aids + undo/redo history), autosaved to the
`flexo-projects` IndexedDB database and restored on boot. See [projects.md](./projects.md).

## Tests
`src/state/editorStore.test.ts` covers instance-id generation, add/remove/duplicate,
selection clamping, and undo/redo — including that discrete mutations self-record
(`setEditorTags`, `setConnectorFlags`), that streaming mutations add no step on their
own (`updatePlacementTransform`; `setPartId` reverts only when the caller pushed at
interaction start).

`src/ui/rangeSelect.test.ts` covers the Shift+click range rule (direction, gap filling,
ties, unselectable rows, rows filtered out by a search) plus the mounted-hook plumbing:
a Shift+click replaces react-aria's keys exactly once, and every other gesture — plain
click, Cmd/Ctrl+click, Cmd/Ctrl+A, Shift+secondary-button — passes straight through.
