# Engine exhaust placement — multi-nozzle 3D handles, direction editing, FX overrides

**Status:** **IMPLEMENTED** (Phases 1–5). Written against KSA build **2026.7.9.5018** and flexo
`main` @ `01f071e`.

All eight gaps (G1–G8) are closed and every design decision (D1–D7) landed as specified, with
three deliberate refinements found during implementation:

- **G1/G2 needed a THIRD multiplicity axis the plan didn't name: PLACEMENT.** §1.2 and D2 read
  the stock RCS pattern as "many nozzle entries on one owner", so D2 specified handles for the
  active template's nozzles "at the resolved placement matrix" — one frame. That misses how
  every built-in RCS prefab is actually authored: `CorePropulsionB_Prefab_RCSALargeA` places
  ONE `<DeLavalNozzle Id="Nozzle">`-carrying SubPart **four times** at four Z rotations, and KSA
  makes each placement its own child `Part` with its own `RocketNozzle` module
  (`decomp/KSA/Part.cs:1144-1152`) — four real thrusters. Drawing only the resolved placement
  left three of them with no handle, i.e. the reported symptom survived the fix. (The plan's
  claim that the MMU RCS puts its battery on `<PartGameData>` is also off: those 56 nozzles are
  in the file `PartGameData.xml` but under `<SubPartGameData Id="KittenBackPackSubPart">`.)
  `NozzleRef` therefore carries an `instanceId` and `$resolvedNozzleTargets` fans out over
  nozzle × flavor × **placement** × channel — the SubPart-owned collider/light multi-instance
  rule, including its consequence: all N handles are views of ONE document nozzle, so a drag
  moves the siblings in sync and the panel says so (the `$lightEditContext` precedent). This
  also retired `$activeEngineInstanceId`/`$resolvedEngineInstanceId`, whose only job was
  picking that single frame.

- **The two exhaust vectors need DIFFERENT owner frames.** `ExhaustLocation` composes through
  the owner's full matrix (scale included), `ExhaustDirection` through its rotation **only** —
  KSA uses `MatrixAsmb2VehicleAsmb` vs the bare quaternion `Asmb2VehicleAsmb`
  (`decomp/KSA/RocketNozzle.cs:103-108`, `Part.cs:217,644-656`). The pre-existing code used
  `Vector3.transformDirection` (full upper-3×3, then normalize) for the direction, which skews
  under a non-uniform owner scale — harmless while it was display-only, wrong once a rotate
  drag writes back through the inverse. Both frames now live in `coords.ts` as
  `exhaustWorldLocation`/`exhaustLocalLocation`/`exhaustWorldDirection`/`exhaustLocalDirection`.
- **FX direction keeps its authored MAGNITUDE through a gizmo re-aim** (not just "isn't
  re-normalized"): the drag scales the new unit axis back to the old vector's length, so
  re-aiming a stock-style `(0, 0.550, -1.000)` plume can't quietly renormalize it.

Also: mode discipline (D5) is one computed — `$effectiveToolMode` — read by BOTH the gizmo and
the toolbar, so the displayed tool can never disagree with what a drag performs; and
`$engineEntries`' SubPart predicate accepts any engine hardware (combustor, solid motor,
nozzle, or solid nozzle), not just a combustor, so a template carrying only a
`<SolidMotorNozzle>` is reachable at all.

**Verified:** `pnpm typecheck` / `lint` / `fmt:check` clean, 1074 unit tests pass (new:
`src/state/engineStore.test.ts`, exhaust-frame cases in `coords.test.ts`, FX-emission cases in
`partXmlSerializer.test.ts`, direction-magnitude cases in `engineValidation.test.ts`), plus a
live Playwright pass over the real app: 3 nozzles → 3 keyed handles (1 amber active, 2 dimmed),
translate drag writes only the target's location, **rotate drag writes a unit
`exhaustDirection`**, viewport handle click re-targets, FX override adds the cyan handle and a
rotate on it preserves `|(0,0.55,-1)|` exactly, Scale disabled while placing, part-level entry
lists and renders. Plus the real built-in `CorePropulsionB_Prefab_RCSALargeA` import: 4
placements → **4 handles** at the 4 thruster positions, chips `Nozzle #1…#4`, and a `+Y` drag
on #1 moved the siblings `−Y`/`+X`/`−X` — the per-placement frames composing correctly through
rotated owners. **NOT done: §4 Phase 5.5 in-game verification** — that needs a KSA launch.

**Goal:** The Engine Designer's "Place exhaust in 3D" feature is a single translate-only handle
hard-wired to the **first DeLaval nozzle of the active engine's SubPart template**. KSA's actual
contract is richer on every axis: a part or subpart carries a **list** of nozzles (the MMU RCS
authors many on one part), each nozzle has an editable **direction** (`<ExhaustDirection>`), and
each has an independently overridable **FX pair** (`<FxExhaustLocation>`/`<FxExhaustDirection>`)
that stock content actively uses to desync the visual plume from the thrust axis. flexo's *data
model, parser, serializer and project codec already round-trip all of this* — the gap is purely
editor surface. This plan closes it: every nozzle (both scopes, both flavors) gets a visible,
clickable 3D handle; the gizmo gains rotation (writing `exhaustDirection`); and the FX override
pair becomes authorable.

**Companion documents (background, do not re-derive):**

- `plans/KSA_ENGINE_DESIGNER_PLAN.md` — the original engine designer. Its data model and
  store actions are the substrate here; nothing in it is being redesigned, only extended.
- `docs/engines.md` §"Place exhaust in 3D" — current user-facing description; update in Phase 5.
- `scope/FULL_SCOPE.md` + `scope/GAME_UPDATE_CHECKLIST.md` — must be synced in Phase 5 (AGENTS.md
  mandate: every game-contract-surface change updates scope/).

> **For implementing agents:** every claim carries a `file:line` citation into this repo or the KSA
> tree at `ksa-game-assemblies/current/` (`decomp/` = decompiled C#, `Content/` = shipped assets),
> verified against the builds named above. If a line drifted, search the quoted symbol — don't
> guess. Read AGENTS.md first: Rules of React, no manual memoization, oxfmt/oxlint, and **every
> numeric input uses `useNumberDraft` + `inputMode="url"`** (the existing `Vec3Field` /
> `PreciseNumberInput` already comply — reuse them). No migration code, ever: extend types with
> nullable/optional fields the codec already handles, or bump via the boot purge.
>
> ⚠️ Tooling note: `src/ui/EngineSections.tsx` contains a byte sequence that makes BSD grep treat
> it as binary — use `grep -a` (or ripgrep) when searching it.

---

## 1. Game contract (source-verified)

### 1.1 The nozzle schema — `RocketNozzleTemplate`

`decomp/KSA/RocketNozzleTemplate.cs` (abstract base of both nozzle flavors):

| Element                | Type                | Default            | Notes                                                       |
| ---------------------- | ------------------- | ------------------ | ----------------------------------------------------------- |
| `<ExhaustLocation>`    | `Vector3Reference`  | `(0,0,0)`          | Thrust application point, meters, owner Asmb frame          |
| `<ExhaustDirection>`   | `Vector3Reference`  | `(-1,0,0)` (−X)    | **Gas outflow** direction; thrust = `TotalThrust * -dir`    |
| `<FxExhaustLocation>`  | `Vector3Reference?` | `null` → inherits  | Visual emitter position; falls back to `ExhaustLocation`    |
| `<FxExhaustDirection>` | `Vector3Reference?` | `null` → inherits  | Plume axis; falls back to `ExhaustDirection`                |
| `<VolumetricExhaust>`  | ref                 | `null`             | Plume asset — has **no** placement fields of its own        |
| `<PlumeTrail>`         | ref                 | `null`             |                                                             |
| `<ExhaustLight>`       | bool                | `true`             |                                                             |
| `<SoundEvent>`         | `RocketSoundEvent?` | `null`             |                                                             |

The fallback is applied in `OnDataLoad`:

```csharp
if (FxExhaustLocation  == null) FxExhaustLocation  = ExhaustLocation;
if (FxExhaustDirection == null) FxExhaustDirection = ExhaustDirection;
```

`DeLavalNozzleTemplate.cs` adds `ExitDiameter` (default 1 m), `FxExitDiameter?` (visual bell lip,
falls back to `ExitDiameter`; stock always sets it *smaller* — 2.5→1.439), `AreaRatio`,
`FlowEfficiency`, `ExpansionEfficiency`. `SolidMotorNozzleTemplate.cs` is identical minus
`AreaRatio` (throat auto-sized to `ExitArea/12`). `Vector3Reference` is bare `[XmlAttribute]
X/Y/Z` doubles — **no normalization on load**.

**There is no rotation/quaternion/Euler field anywhere.** Orientation is a direction vector, full
stop. Roll about the exhaust axis is *undefined by design* — `Vehicle.SpawnThrusterSparks`
(`decomp/KSA/Vehicle.cs:4828-4830`) builds an arbitrary orthonormal basis from the direction; the
plume is axially symmetric. Searching the decomp for `ThrustAxis`, `ThrustVector`, `FxOffset`,
`ExhaustOffset` → zero hits. Nothing is derived from GLB bones/nodes.

### 1.2 Multi-nozzle is a first-class list, at BOTH scopes

`decomp/KSA/PartTemplate.cs`:

```csharp
[XmlElement("DeLavalNozzle",    typeof(DeLavalNozzleTemplate))]
[XmlElement("SolidMotorNozzle", typeof(SolidMotorNozzleTemplate))]
public List<RocketNozzleTemplate> RocketNozzles = new List<RocketNozzleTemplate>();
```

Legal under both `<PartGameData>` and `<SubPartGameData>`. Stock uses both: main engines put one
nozzle on the thrust-chamber SubPart; **the MMU RCS puts its whole battery of nozzles on the
parent part** (`Content/Core/PartGameData.xml`) with explicit per-nozzle vectors:

```xml
<ExhaustLocation  X="0" Y="0.2" Z="0.5" />
<ExhaustDirection X="0.707106" Y="0.000" Z="0.707106" />
<FxExhaustLocation X="-0.05" Y="0.220" Z="0.3150" />   <!-- no FxExhaustDirection → inherits -->
```

and cases where FX is deliberately desynced from physics (thrust straight −Z, plume canted):

```xml
<ExhaustDirection   X="0.0"  Y="0.0"   Z="-1.000" />
<FxExhaustLocation  X="-0.16" Y="0.23" Z="0.3120" />
<FxExhaustDirection X="0.0"  Y="0.550" Z="-1.000" />
```

Stock usage tally across `Content/`: ~30 `ExhaustDirection`, ~30 `FxExhaustLocation`,
24 `FxExhaustDirection`, 12 `FxExitDiameter`. These are mainstream authoring surfaces, not
esoterica.

### 1.3 Runtime semantics (frames, gotchas)

`decomp/KSA/RocketNozzle.cs` `ResetState`/`UpdateState`:

```csharp
state.ThrustDirectionVehicleAsmb    = (-ExhaustDirectionAsmb).Transform(rotation);  // negated
state.FxExhaustDirectionVehicleAsmb = FxExhaustDirectionAsmb.Transform(rotation);   // NOT negated
```

- **Frame:** vectors live in the owning Part/SubPart's own **Asmb frame**, composed up the chain
  by `Part.MatrixAsmb2VehicleAsmb` (`decomp/KSA/Part.cs:626-660`). A rotated
  `<SubPart><Transform><Rotation>` therefore rotates the exhaust *with* the mesh automatically —
  which is exactly why rotating a bell placement in flexo can never fix a wrong *relative*
  direction; only `ExhaustDirection` itself can.
- **Magnitude gotcha:** thrust is applied **unnormalized**
  (`decomp/KSA/VehicleUpdateState.cs:294`: `TotalThrust * ThrustDirectionVehicleAsmb`) — a
  non-unit `ExhaustDirection` silently scales thrust. FX consumers all `NormalizeOrZero()` first,
  and stock actually ships non-unit FX vectors (`0, 0.550, -1.000`). ⇒ flexo must keep the
  *physics* vector unit-length; the *FX* vector may be any length.
- **Gimbal** rotates both location and direction about the gimbal pivot at runtime — no authoring
  impact here.
- In-game debug overlay (`decomp/KSA/Vehicle.cs:5030+`): red/white arrow along `-ThrustDirection`;
  a **cyan/blue** arrow along `FxExhaustDirection` only when FX location ≠ physics location. Our
  handle colors mirror this (§3, D4).

### 1.4 Stock orientation convention (answers "how do built-ins do it")

**+X is nose, −X is aft; every stock engine bell mesh points down −X in its own subpart frame**,
and its nozzle XML says `<ExhaustDirection X="-1" Y="0" Z="0"/>` (redundantly — that's the
default). Corroborated by radial symmetry cloning about `(1,0,0)` (`decomp/KSA/Part.cs:143`).
Canted engines aim either by rotating the whole `<SubPart><Transform>` (verniers,
`Content/Core/CorePropulsionAAssets.xml:544-590`) while keeping the local `-1,0,0`, or by writing
a non-axial vector directly (RCS, §1.2). **A bell mesh authored along any other axis is fine — you
just set `ExhaustDirection` to match.** That is the user-visible answer to the "off by 90°"
symptom: it's not an XML limitation and not fixable by rotating the placement; it needs the
direction vector, which flexo today only exposes as a numeric field.

---

## 2. What flexo has today — gap analysis

### 2.1 Already complete (do not touch)

The **data layer round-trips everything in §1.1**, both scopes, both flavors:

- Types: `DeLavalNozzle` `src/ksa/types.ts:822-851`, `SolidMotorNozzle` `:940-980` — including
  `exhaustLocation`, `exhaustDirection` (default `(-1,0,0)`, `:1034`), `fxExhaustLocation`/
  `fxExhaustDirection` (`Vec3 | null`), `fxExitDiameterM`. Arrays at part scope
  (`PartGameDataModel.nozzles`/`solidNozzles`, `types.ts:1134-1145`) and subpart scope
  (`SubPartGameData.nozzles`/`solidNozzles`, `:1174-1181`).
- Parser: `commonNozzleFields()` `src/ksa/partXmlParser.ts:1184-1211` (fx pair → `null` when
  absent, matching the game's inherit semantics).
- Serializer: `buildRocketNozzleElement()` `src/ksa/partXmlSerializer.ts:720-774`
  (`ExhaustLocation`/`ExhaustDirection` omitted at defaults; fx pair emitted iff non-null).
  Round-trip tests `partXmlSerializer.test.ts:571-618`.
- Project codec: compact keys `el/ed/fl/fd` `src/state/projectCodec.ts:671-724`; tests
  `projectCodec.test.ts:244-250`.
- Store actions already indexed, not singular: `updateNozzle(templateId, index, patch)`
  `src/state/editorStore.ts:2841-2850`, plus `updatePartNozzle`, `updateSubPartSolidNozzle`,
  `updatePartSolidNozzle` (imported in `EngineSections.tsx:44-61`).
- Numeric UI already enumerates **all** nozzles: subpart DeLaval `EngineSections.tsx:726-732`,
  subpart solid `:750-779`, part-level DeLaval `:1281-1286`, part-level solid `:1155-1171`.
  `RocketNozzleFields` (`:393+`) edits `exhaustLocation` (`:438`), `exhaustDirection` (`:448`),
  `fxExitDiameterM` (`:458-461`), plume/volumetric/light.

### 2.2 The gaps

| # | Gap | Where |
| - | --- | ----- |
| G1 | 3D handle targets **only `spd.nozzles[0]`** of the active engine template — never index > 0, never `solidNozzles`, never part-level `part.gameData.nozzles`/`solidNozzles` | `EditorScene.engineEditTarget()` `src/three/EditorScene.ts:1835-1854` (`spd?.nozzles[0]`, `nozzleIndex: 0`) |
| G2 | Only **one** handle exists (`engineHandle: NozzleHandleObject \| null`) — an N-bell RCS block shows a single marker | `EditorScene.ts:241-248`, `applyEngineHandle()` `:1856-1883` |
| G3 | Gizmo is **translate-only by omission**: write-back reads only `engineProxy.position` → `exhaustLocation`; rotation drags silently discarded, proxy quaternion reset to identity each refresh | `handleEngineGizmoChange()` `:1891-1899`; reset at `:1602-1603` |
| G4 | Gizmo **mode is never set** for the exhaust proxy — it inherits whatever `$toolMode` was last (SelectionToolbar is hidden without a selection), so users can be stuck on dead rotate rings/scale handles | only `setMode` caller is `EditorScene.ts:592`; toolbar gate `SelectionToolbar.tsx:33` |
| G5 | `fxExhaustLocation`/`fxExhaustDirection` have **zero UI** (numeric or 3D) — round-trip-only fields a flexo author can never set; preview ignores them | grep: only types/parser/serializer/codec reference them |
| G6 | A part whose engine lives **at part level** (the stock RCS pattern) is not an "engine" to the designer at all: `$engineTemplateIds` requires a *subpart* combustor; part-level nozzles are buried in "Gas generator (advanced)" with no 3D toggle | `engineStore.ts:28-30`; `EnginePanel.tsx:130-141,190-192` |
| G7 | Nothing keeps `exhaustDirection` unit-length (physics gotcha §1.3); no validation warning | `RocketNozzleFields` writes raw axis values |
| G8 | Handles are not pickable — no way to *select* a nozzle from the viewport | `NozzleHandleObject.ts` (non-pickable by construction) |

Root causes of the two reported symptoms:

- **"Orientation off by 90° and rotating the part doesn't help"** — the imported bell mesh's axis
  isn't −X, the nozzle carries the default/imported `exhaustDirection`, and rotating the placement
  rotates mesh *and* exhaust together (§1.3 frame semantics). Fixable today only via the numeric
  "Exhaust direction" field; G3/G4 are why it *feels* impossible.
- **"RCS with N bells shows one placement"** — G1 + G2 (and, if the import landed the nozzles at
  part level like stock RCS, G6 hides them from the designer entirely).

---

## 3. Design decisions

- **D1 — Nozzle target ref.** Introduce a discriminated ref naming any nozzle in the part:

  ```ts
  type NozzleRef =
    | { scope: 'subpart'; templateId: string; kind: 'delaval' | 'solid'; index: number }
    | { scope: 'part'; kind: 'delaval' | 'solid'; index: number }
  ```

  Ephemeral (engineStore, like `$activeEngineTemplateId`), resolved defensively against `$part`
  every read (indices shift on remove — a stale ref resolves to `null` and deactivates, same
  pattern as `$resolvedEngineInstanceId` `engineStore.ts:44-51`).

- **D2 — All handles visible, one active.** When the exhaust gizmo is on, render a handle for
  *every* nozzle in the current context (active engine template → its subpart nozzles across the
  resolved placement; part-scope context → part-level nozzles at identity matrix). Active handle
  amber (current `0xff8c2a`), inactive handles dimmed; clicking any handle makes it the active
  target. This is what makes an N-bell RCS block legible at a glance.

- **D3 — Rotation writes `exhaustDirection`.** In rotate mode, the drag's world-space quaternion
  is applied to the nozzle's world direction, inverse-transformed to the owner frame, and
  **normalized** on every write (physics vector must stay unit, §1.3). Roll is meaningless (§1.1)
  and simply has no visible effect — acceptable; do not invent a roll lock.

- **D4 — FX pair as an explicit override, colored like the game.** In `RocketNozzleFields`, an
  "Override FX placement" switch: OFF ⇒ both fx fields `null` (inherit — game semantics); turning
  ON seeds them from the physics pair; turning OFF nulls both. In 3D, when the override is on, a
  second **cyan** handle (mirroring KSA's own debug overlay color, §1.3) renders at the fx pose
  and is targetable like any other handle (extend `NozzleRef` with `channel: 'physics' | 'fx'`).
  FX direction is *not* re-normalized (stock ships non-unit FX vectors).

- **D5 — Mode discipline.** While the exhaust proxy is attached, allowed gizmo modes are
  `translate` and `rotate`; if `$toolMode` is `scale`, force-display `translate`. Show the
  translate/rotate toolbar during exhaust placement (reuse `SelectionToolbar`'s buttons or its
  `$isPoseEditing`-style gate) so the mode is switchable without a selection. Fixes G4 even for
  users who never rotate.

- **D6 — Part-level engines become first-class in the designer.** `$engineTemplateIds` grows a
  sentinel entry (e.g. `{ kind: 'part' }` rendered as "Part-level (RCS / gas generator)") whenever
  `part.gameData` carries any combustor, nozzle, or solid motor. Selecting it shows the existing
  part-level sections (currently buried under "Gas generator (advanced)") as the active editor and
  enables the 3D toggle with part-frame (identity) handles. No data change — pure surfacing.

- **D7 — Unit-length guard, not silent rewrite.** Numeric direction edits are left verbatim
  (matching how the XML is authored), but a warning badge appears on the field and in the
  performance readout when `|exhaustDirection| − 1 > 1e-3`, with a one-click "Normalize" button.
  Gizmo writes always normalize (D3). FX direction: no warning.

---

## 4. Implementation phases

### Phase 1 — Multi-nozzle targeting + all-handles rendering (fixes G1, G2, G8)

1. `engineStore.ts`: add `NozzleRef` (D1), `$activeNozzleRef: atom<NozzleRef | null>`,
   `$resolvedNozzleTargets: computed` returning `{ ref, nozzle, instanceMatrix, isActive }[]` for
   the current designer context (subpart engine: all `nozzles` + `solidNozzles` of the active
   template at the resolved placement matrix; part scope per D6 in Phase 4). Reset the ref in
   `enterEngineMode`/`setActiveEngineTemplate` (default: first nozzle).
2. `EditorScene.ts`: replace `engineEditTarget()`/single `engineHandle` with a keyed
   `Map<string, NozzleHandleObject>` reconciled from `$resolvedNozzleTargets` (create/pose/remove;
   subscribe alongside the existing `:520-529` block). Gizmo attaches to the *active* ref's pose.
   `handleEngineGizmoChange()` looks up the active ref and dispatches to the matching store action
   (`updateNozzle` / `updateSubPartSolidNozzle` / `updatePartNozzle` / `updatePartSolidNozzle`).
3. `NozzleHandleObject.ts`: add `setActive(bool)` (dim inactive: same geometry, lower
   opacity/desaturated color) and make the cube pickable — register with the scene's raycaster the
   way other pickable helpers are, routing clicks to `$activeNozzleRef.set(ref)`.
4. `EnginePanel.tsx`: under the existing Switch, a compact nozzle chip list (id + index) mirroring
   viewport selection — click chip ⇒ set ref; active chip highlighted. (Chips, not a Select: N is
   small and spatial identity matters.)

### Phase 2 — Rotation (fixes G3, G4)

1. `EditorScene.ts` `updateSelection()` exhaust branch (`:1592-1610`): stop resetting the proxy
   quaternion to identity — pose the proxy with the active nozzle's world direction (quaternion
   from `setFromUnitVectors(+X, worldDir)`, matching `NozzleHandleObject.setPose`).
2. `handleEngineGizmoChange()`: translate branch unchanged; rotate branch converts the proxy's
   world quaternion back to a world direction (`+X` reference axis), inverse-rotates into the
   owner frame (`transformDirection` by inverted instance matrix), `normalize()`, writes
   `{ exhaustDirection }` via the same dispatch as Phase 1. One `pushUndo('exhaust', '')` per
   drag (existing `:400-404` hook covers both modes).
3. Mode discipline (D5): when attaching the exhaust proxy, clamp effective mode to
   translate/rotate; render the mode toolbar during exhaust placement (extend the
   `SelectionToolbar.tsx:33` gate with the exhaust-gizmo condition, disabling Scale).

### Phase 3 — FX override authoring (fixes G5)

1. `RocketNozzleFields` (`EngineSections.tsx:393+`): "Override FX placement" Switch per D4;
   when on, two `Vec3Field`s (location m / direction) bound to `fxExhaustLocation`/
   `fxExhaustDirection`. Seeding + nulling exactly as D4 (single undo step each toggle).
2. Extend `NozzleRef` with `channel: 'physics' | 'fx'`; `$resolvedNozzleTargets` emits an extra
   cyan target per overridden nozzle. Gizmo writes route to the fx fields; fx direction not
   normalized. `NozzleHandleObject` gains a color parameter (amber/cyan) — colors per D4.
3. Preview honors the game fallback: fx handle pose uses `fx* ?? physics*` (only rendered when an
   override exists, matching KSA's own debug-arrow gating §1.3).

### Phase 4 — Part-level engines in the designer (fixes G6)

1. `engineStore.ts`: `$engineTemplateIds` → `$engineEntries` (`{ kind: 'subpart', templateId } |
   { kind: 'part' }`), part entry present per D6. `$activeEngineTemplateId` absorbs the sentinel
   (union type, not a magic string).
2. `EnginePanel.tsx`: part entry renders the existing `PartEngineSection` content
   (`EngineSections.tsx:1248+`) plus solid-motor section as the active editor, with the same 3D
   Switch and performance readout where a part-level combustor+nozzle pair exists. The
   "Gas generator (advanced)" disclosure stays for subpart engines (it is genuinely advanced
   there) but the part entry is the primary home.
3. `$resolvedNozzleTargets`: part scope emits part-level nozzles with identity `instanceMatrix`
   (part frame, §1.3).

### Phase 5 — Validation, docs, scope sync (fixes G7)

1. Unit-length warning + Normalize button per D7 (`RocketNozzleFields`; also surface in the
   part-validation pass if one exists for engines).
2. Tests: store-level tests for the new ref resolution + rotate write-back math (world→owner
   frame, normalization); serializer tests already cover fx emission — add one asserting the
   Override-off path nulls both fields (no `<FxExhaust*>` emitted).
3. `docs/engines.md`: rewrite the placement section — multi-handle, rotation, FX override,
   part-level engines, the −X stock convention and the "rotating the placement can't fix relative
   direction" explanation (§1.3/1.4), the unit-length rule.
4. `scope/`: sync the engine/exhaust surface (FULL_SCOPE.md + any nozzle-related area doc) — fx
   pair now authorable, part-level nozzles now surfaced; note the in-game debug overlay as the
   verification aid.
5. In-game verification: export a test part with (a) a canted multi-nozzle RCS block, (b) an FX
   desync (thrust −X, plume canted), confirm against KSA's debug arrows.

---

## 5. Explicit non-goals

- **No roll control** on the exhaust axis — undefined in-game (§1.1).
- **No plume rendering** in the editor viewport — the handle cone remains the visualization;
  volumetric-exhaust preview is a separate feature if ever.
- **No nozzle auto-aim from mesh geometry** — KSA derives nothing from the GLB (§1.1), and
  guessing an axis from an arbitrary imported bell is out of scope. The 3D rotate handle is the
  ergonomic fix.
- **No data-model or XML changes** — the contract is fully modeled today (§2.1); this is entirely
  editor surface.
