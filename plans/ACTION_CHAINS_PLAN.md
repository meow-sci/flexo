# Action Chains — a command-palette for repetitive placement (issue #3)

> **Status**: planned, not implemented. Branch: `feature/action-chains`.
> **Source request**: GitHub issue #3 "generic action chaining" — *"chain together some actions and apply something repetitively … duplicate selected N times spaced +5m on X each … duplicate selected N times spaced +1m on X, +1m on Y, +15deg on X 15 times"* — extended by the maintainer with: radial placement around a tank's axis, grid arrays for solar cells, first-class circular-placement helpers per plane with accompanying rotation, all driven from a command-palette-style UI operating on the current selection.
>
> **Audience**: implementing agents. Every task below is written to be executed without further design decisions. When this plan cites `file:line`, the line numbers were verified against the repo at planning time (2026-07-31); re-locate by symbol name if drift occurred. **Where this plan conflicts with the live code, the live code's *conventions* win but this plan's *semantics* win — flag the conflict in your summary instead of silently improvising.**

---

## 0. What this is

A **chain** is an ordered list of **steps** applied to the currently selected SubPart placements (the **seeds**). Two families of steps:

- **Transform steps** — Translate / Rotate / Scale. They move the whole current working set (like the existing multi-select "transform by" panel, but stackable and previewed).
- **Array steps** — Linear Array / Radial Array / Grid Array. They *replicate* the working set into N instances. After an array step, subsequent steps apply to **all** instances, so arrays compose: `[Linear ×5 on X] [Linear ×3 on Y]` is a 15-cell grid; `[Radial ×6] [Translate +2 Y]` is a lifted ring.

The user opens a floating **chain palette** over the viewport (`mod+K` or the selection-toolbar "Chain" button), types to add steps ("rad…" → Radial Array), edits numeric parameters with live **ghost preview** in the 3D scene, and hits Apply (`mod+↵`). Apply is **one undo step**: seed placements may move; every other instance becomes a real cloned placement. Cancel/Escape discards everything (originals are never touched until Apply).

Motivating workflows this must make trivial:

1. **Radial RCS block**: place one thruster block at radius on a fuel tank → `mod+K` → "radial" → count 4 → Apply. Four blocks around the tank's long axis, each rotated to stay flush.
2. **Solar cell grid**: place one cell → "grid" → 6 × 4, spacing 0.42 / 0.42, plane XY → Apply.
3. **Issue example 2 (helix/staircase)**: select a step mesh → "linear" → count 15, offset (1, 1, 0), step-rotate (15°, 0, 0) → Apply.
4. **Precise compound transform**: "translate" (0, 0.25, 0) + "rotate" 45° about Y — numeric, previewed, one undo step.

---

## 1. Where flexo stands today (verified facts this plan builds on)

- **No array/mirror/radial/pattern feature exists anywhere in `src/`** (exhaustive keyword sweep done). The `<Sibling>`/`SymmetryGroup` XML fields are KSA game-side data round-tripped verbatim, deliberately without editor UI.
- **The document** is `$part: atom<EditingPart>` (`src/state/editorStore.ts:113`). Placements are a **flat array** `EditingPart.placements: SubPartPlacement[]` (`src/ksa/types.ts:2162`); no parenting. `SubPartPlacement extends Transform` = `{ position: Vec3; rotation: EulerXYZ (radians); scale: Vec3; instanceId; subPartTemplateId; layerId }` (`types.ts:29-46`).
- **Selection** is per-kind index arrays; SubParts: `$selectedIndices` (`editorStore.ts:119`), ordered by selection order. `PlacementTransform` (`editorStore.ts:107`) is the plain transform triple used by all transform writers.
- **Undo** is snapshot-based with a NON-NEGOTIABLE two-pattern enrollment invariant (`editorStore.ts:298-323`, `docs/editor-state.md`, `AGENTS.md:158`). A discrete mutation calls `pushUndo(description, detail)` itself. New mutators MUST get a test in `src/state/editorStore.test.ts`.
- **Bulk transform math already exists and is the semantic baseline**: `src/three/bulkTransform.ts` — `centroidOf:36`, `translatedTransform:51`, `scaledInPlaceTransform:60`, `scaledAroundOriginTransform:75`, `groupScaledTransform:113`, `rotatedAroundOriginTransform:130`, `quatFromEulerDeg:152`, `EULER_ORDER = 'ZYX':27`. The multi-select gizmo (`EditorScene.applyBulkFromPivot`, `EditorScene.ts:1974`) and the numeric `BulkTransformPanel` (`src/ui/TransformInspector.tsx:296-377`) both route through these — the chain engine MUST too, so all three produce identical results.
- **Coordinates**: KSA and three.js share the basis — right-handed, Y-up, −Z-forward, meters. Rotation stored as KSA Euler "XYZ" **radians**, which is bit-for-bit three.js `'ZYX'`; conversion isolated in `src/three/coords.ts` (`EULER_ORDER = 'ZYX'`, `coords.ts:28`). UI shows **degrees** (`RAD2DEG`/`DEG2RAD` from `src/ui/format.ts:3-4`). **A part's nose/long axis is its local +X** (connector forward `types.ts:91`, seat forward `ivaSeatAxes.ts:24`, light aim, "+X (nose)" preset `TransformInspector.tsx:685`) — this drives the Radial Array default axis.
- **Duplication precedent** (`duplicateSelected`, `editorStore.ts:1476`): copies are exact-in-place, keep `layerId`, get `instanceId = lastSegmentLower(templateId) + '_' + (count+1)` where count = current placements of that template (`:1510-1526`), copies are appended and selected. **No references (animations/gimbals/feeds/couplings) are remapped or carried** — a copy is a plain new placement. ⚠️ Known quirk: the count formula can collide with surviving ids after deletions (only guard: pre-export warning `ExportButton.tsx:45-56`). §3.6 deviates deliberately.
- **Scene**: vanilla three.js (no R3F). `EditorScene` (`src/three/EditorScene.ts`) reconciles `$part.placements` into `private readonly objects = new Map<string, SubPartObject>` keyed by `instanceId` (`:172`), public lookup `getObject(instanceId)` (`:651`). Geometry is **shared** via `MeshAtlasCache` and never disposed per-instance; materials are per-instance clones (`SubPartObject.ts:22-24,51-88,123-127`). Overlay-layer precedent: `MeasurementLayer`/`ContainerLayer` add their own group to `viewport.scene` (NOT `root`), so they escape `applyLayerView` (the ONLY writer of `group.visible`, `EditorScene.ts:907`) and escape `SelectionManager` picking (which raycasts `root.children` only). On-demand rendering: every scene mutation must end in `viewport.invalidate()`.
- **UI kit** (`src/ui/kit/`): `Button, TextField, SearchField, Select (value/onChange, searchable), Checkbox, GridList/GridListItem, Menu, Modal/Dialog, Popover, Tooltip, toast(…)`. AGENTS.md mandates kit imports + **GridList over ListBox**. Numeric input MUST be `useNumberDraft`-based text fields (`src/ui/numberDraft.ts:72`); reuse `PreciseNumberInput` (`src/ui/PreciseNumberInput.tsx`) and `Vec3Field` (`src/ui/Vec3Field.tsx` — `{label?, labelWidth?, value: Vec3, disabled?, onCommit(axis, value), onInteractionStart?}`). Never `type="number"`; the kit fields already use `inputMode="url"`.
- **Hotkeys**: single registry `src/ui/hotkeys/registry.ts` drives bindings AND the help overlay. Taken: `w a s d q e r f`, arrows, delete/backspace, `mod+c/v/z/y`, `mod+shift+z`, `?`, gated `escape`. **`mod+k` is free. `mod+enter` is free.** Shared options: `preventDefault: true`, `ignoreEventWhen: isTypingInField` (`GlobalHotkeys.tsx:43-47`); the lib default `enableOnFormTags: false` applies unless overridden per-binding.
- **Overlay UI**: absolutely-positioned Tailwind siblings of the canvas inside the `fixed inset-0` app root (`app.tsx:38`). Chrome recipe: `rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md` (`FloatingEditorPanel.tsx:5-6`). Z ladder: `z-10` cards < `z-30` floating panels < `z-40` import report < `z-50` modals < `z-[100]` toasts.
- **Locked layers**: transform tools no-op when any selected entity's layer is locked (`selectionTransform.ts:30`, via `isLayerLocked` from `src/state/layerStore.ts`). The chain guards at session **open** (§4.4).
- **Tests**: vitest (happy-dom), co-located `*.test.ts`. Commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm fmt`, `pnpm fmt:check`. Mandatory post-change order: fmt → lint → fmt:check (AGENTS.md:134-143).
- **Persistence default**: user-facing tool preferences persist via `@nanostores/persistent` (`persistentJSON`) unless there's a reason not to (AGENTS.md:157).
- **Negative scale**: unvalidated on placements today, but dangerous in-game (KSA back-face culls; a negative-scale placement renders invisible — `scope/custom-assets-and-mod-export.md:77`). Chain scale inputs therefore clamp **positive** (§3.5); a Mirror step is explicitly future work (§7).

**Game-contract impact: NONE.** Action chains only create/move ordinary placements through existing store paths. **No `scope/*.md` changes are required by this feature** — do not touch `scope/`.

---

## 2. UX specification

### 2.1 Session lifecycle

- **Open**: `mod+K`, or the "Chain" button on the selection toolbar. Guards, in order:
  1. No placements selected → `toast({ title: 'Select SubParts to chain', variant: 'warning' })`, do not open. (Only SubPart placements seed a chain; other selected kinds are ignored — if the selection has kinds but zero placements, same toast.)
  2. Any selected placement's layer locked (`isLayerLocked(layerId)`) → `toast({ title: 'Selection is on a locked layer', variant: 'warning' })`, do not open.
  3. Otherwise capture **seeds** = selected placements' `instanceId`s **in selection order**, open with an empty step list, focus the palette search field.
- **While open**: the palette is **non-modal**. Orbiting, clicking, gizmo drags, W/S/A/D/Q/E rotates, nudges, undo — all still work and the preview recomputes live from the *current* `$part` state of the frozen seed ids (adjusting a seed with the gizmo updates the whole ring live — this is a feature). Changing the *selection* does NOT change the seeds; the header shows the frozen seed count.
- **Seeds vanish mid-session** (deleted, undone away): evaluation drops missing ids; if none remain the palette body shows the error `Seeds no longer exist` with Apply disabled — the user closes it. No auto-close.
- **Apply** (`mod+↵` or the Apply button): commits as ONE undo entry (§4.5), closes the palette, clears ghosts, selects seeds+copies, toasts `Applied chain · +N SubParts` (or `· N transformed` when no copies).
- **Cancel** (Escape with focus in the palette but no dirty number field, the ✕ button, or the Cancel button): closes and clears ghosts. Originals were never touched — cancel is always safe. The per-step parameter values are remembered (§4.3 defaults persistence), so an accidental Escape only loses the step *list*, not the tuned numbers.
- **Project load** (`applyProjectSnapshot`) closes any open session. `newPart()` and other flows are covered by the seeds-vanish error path — no other auto-close wiring.

### 2.2 Palette layout (desktop)

Absolutely positioned floating card, **left side, top-anchored** (the right side is the inspector's): container `pointer-events-auto absolute left-3 top-16 z-30 flex w-[340px] max-h-[calc(100vh-8rem)] flex-col` + the standard chrome classes (`rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md`). Phone: `absolute inset-x-2 bottom-20 z-30 max-h-[45vh]` + same chrome (the `FloatingEditorPanel.tsx:31-33` split). Not draggable in v1. Known acceptable overlap: the measurement/container `FloatingEditorPanel` uses `left-3 top-1/2`.

Top-to-bottom:

1. **Header**: uppercase tracking title `ACTION CHAIN`, a muted chip `· N seeds`, spacer, ✕ close button (`Button size="sm" aria-label="Close"` — cancels).
2. **Search**: kit `SearchField size="sm"` `aria-label="Add step"` `placeholder="Add step — translate, radial, grid…"`, `autoFocus`. Below it, when the query is non-empty **or** the chain has zero steps: a kit `GridList aria-label="Chain commands"` of matching commands (`selectionMode="none"`, `onAction` adds the step). Each row: lucide icon + label + one-line muted description. Filter = the app's standard idiom: `q = query.trim().toLowerCase()`, match when `q === ''` or label/keywords `.includes(q)` (`MeshPickerModal.tsx:37-43` precedent), `dependencies={[query]}`. Adding a step clears the query and refocuses the search input (keep an `inputRef`).
3. **Step list**: the ops in order, each a **step card** (§2.3). Scroll container `min-h-0 flex-1 overflow-y-auto flex flex-col gap-2`.
4. **Footer**:
   - Readout line (`text-xs`): on error, danger-colored error text; else `"{totalInstances} instances · +{newCount} new"`, plus, when ghosts were capped (§4.6), a muted `· preview capped at 500`.
   - Buttons row: `Button variant="ghost"` **Cancel**, `Button variant="primary"` **Apply ⌘↵** (`isDisabled` when `error !== null || totalInstances === 0`).

### 2.3 Step cards

Card: `rounded-lg border border-border bg-panel-sunken p-2 flex flex-col gap-1.5`. Header row: lucide icon (14), step label (`text-xs font-medium`), spacer, then three `Button size="sm" variant="ghost" iconOnly` controls: move-up (`ChevronUp`), move-down (`ChevronDown`), remove (`X`). Up/down disabled at the ends.

Parameter rows use existing components ONLY: `Vec3Field` for vector triples, `PreciseNumberInput` for scalars, kit `Select size="sm"` (`value`/`onChange` API) for enums, kit `Checkbox` for booleans. Row labels are `Vec3Field`'s `label` prop or a `<span className="w-12 shrink-0 text-xs text-fg-muted">` for scalar rows. **No `onInteractionStart` on any chain field** — editing the session is not a document mutation, so there is no undo push (the single push happens at Apply).

Per-kind parameter forms (labels verbatim; ranges in §3.5):

| Step | Rows |
|---|---|
| **Translate** | `Move (m)` Vec3Field → `delta` |
| **Rotate** | `Rotate (°)` Vec3Field → `degreesDeg`; `Pivot` Select [`Centroid`, `Part origin`, `Custom`] → `pivot`; when `pivot === 'custom'`: `Center (m)` Vec3Field → `center` |
| **Scale** | `Factor (×)` Vec3Field → `factor`; `Mode` Select [`Smart (scale positions too)`, `In place`] → `mode`; `Pivot` Select + conditional `Center (m)` as Rotate (pivot row hidden when mode is `In place` — in-place scaling has no pivot) |
| **Linear Array** | `Count` scalar (int) → `count`; `Offset/step (m)` Vec3Field → `offset`; `Rotate/step (°)` Vec3Field → `stepRotateDeg`; `Scale/step (×)` Vec3Field → `stepScale` |
| **Radial Array** | `Count` scalar (int) → `count`; `Axis` Select [`X (part nose)`, `Y (world up)`, `Z`] → `axis`; `Center (m)` Vec3Field → `center`; `Start (°)` scalar → `startAngleDeg`; `Sweep (°)` scalar → `sweepDeg`; `Orient` Select [`Rotate with array`, `Keep orientation`] → `orient`; `Radial offset (m)` scalar → `radialOffset`; `Rise/step (m)` scalar → `axialStep` |
| **Grid Array** | `Plane` Select [`XY`, `XZ`, `YZ`] → `plane`; `Count A × B` two scalar ints side by side → `countA`, `countB`; `Spacing (m)` two scalars side by side → `spacingA`, `spacingB`; Checkbox `Center on seed` → `centered` |

Command palette entries (label · keywords · lucide icon — all six icon names, plus `Workflow`/`ChevronUp`/`ChevronDown`/`X`, verified present in the installed lucide-react):

| kind | label | keywords | icon |
|---|---|---|---|
| `translate` | Translate | move, offset, shift | `Move3d` |
| `rotate` | Rotate | spin, turn, orient | `Rotate3d` |
| `scale` | Scale | resize, grow, shrink | `Scale3d` |
| `linear-array` | Linear Array | repeat, duplicate, row, line, stack, helix | `MoveHorizontal` |
| `radial-array` | Radial Array | circle, ring, polar, around, radially, clock | `Orbit` |
| `grid-array` | Grid Array | grid, matrix, solar, cells, rows, columns | `Grid3x3` |

### 2.4 Keyboard model

- `mod+K` (global registry binding, new "Action chain" entry in the **Editing** group; label `Open action chain (selection)`): toggles — if a session is open, cancel it; else run the open guards. Registry entry auto-appears in the `?` help overlay.
- Inside the palette (component-local `useHotkeys` with `enableOnFormTags: true`):
  - `mod+enter` → Apply (when enabled).
  - `escape` → Cancel. Note the interplay: `useNumberDraft` swallows Escape while a field edit is dirty (revert-first), so a second Escape cancels the palette — this is the existing app-wide convention (`docs/editor-state.md`), do not fight it. The global gated seat-view Escape (`registry.ts:193-207`) is `preventDefault: false` and inert here.
- Search field: typing filters; `ArrowDown` moves focus into the command GridList (react-aria default); `Enter` on a row adds it (GridList `onAction`).
- All number fields: `useNumberDraft` semantics (live in-range commit, arrows step, Shift ×10, Alt ×0.1).
- Global single-key tools (W/S rotate etc.) intentionally stay live while palette focus is NOT in an input — they operate on the (frozen-seed) selection and the preview follows. Do not scope or disable them.

---

## 3. Semantic model (the contract the engine implements)

### 3.1 Working set and lineage

Evaluation is a pure fold. State: an ordered list of **groups**; each group is one rigid copy of the whole seed set:

```
Group = { members: PlacementTransform[]  // parallel to seeds, index = seedIndex
        , isSeedGroup: boolean }         // exactly one group has true, always
```

Initial state: one group, `members = seed transforms (deep copies, current $part values)`, `isSeedGroup: true`.

- A **transform step** maps every member of every group (the whole working set moves as the gizmo's bulk mode would).
- An **array step** replaces each group G with `count` groups; spawn `k = 0` is *derived from G unchanged-or-moved per the op's k=0 formula* and inherits `G.isSeedGroup`; spawns `k ≥ 1` get `false`. Group order after the op: for each input group in order, its spawns k = 0…count−1 consecutively.

Flattening (the eval output): for each final group in order, for each member in seed order, emit

```
ChainInstance = { seedIndex: number; transform: PlacementTransform; isSeed: boolean /* = group.isSeedGroup */ }
```

`totalInstances = finalGroups × seeds`. `newCount = totalInstances − seeds` (the seed group's members update the original placements at commit; every other instance becomes a clone). Note `isSeed` instances MAY have moved (a transform step, a radial `startAngle`, a centered grid all move the seed group) — commit then *moves the originals*, which is intended.

### 3.2 Transform steps — exact math

Pivot point resolution (shared): `'centroid'` → `centroidOf(positions of ALL members of ALL current groups)` (`bulkTransform.ts:36`); `'origin'` → `(0,0,0)` (the Part origin); `'custom'` → the op's `center`.

- **Translate** `{ delta: Vec3 }`: every member `T → translatedTransform(T, delta)`.
- **Rotate** `{ degreesDeg: EulerXYZ, pivot, center }`: `q = quatFromEulerDeg(degreesDeg)` (`bulkTransform.ts:152`; ZYX-order Euler like everything else); every member `T → rotatedAroundOriginTransform(T, q, pivotPoint)`.
- **Scale** `{ factor: Vec3, mode: 'smart'|'inPlace', pivot, center }`: every member `T → groupScaledTransform('subpart', T, factor, mode === 'smart' ? pivotPoint : null)` (`bulkTransform.ts:113`; kind is always `'subpart'`, so scale always applies).

These are exactly the `BulkTransformPanel` semantics (`TransformInspector.tsx:304,317,331`) with a pivot choice added — behavior parity is a test requirement.

### 3.3 Array steps — exact math

**Linear Array** `{ count, offset: Vec3, stepRotateDeg: EulerXYZ, stepScale: Vec3 }` — the issue's "duplicate N times spaced +… each" op. Iterated-delta semantics: copy k is k applications of the per-step delta, with rotation about the copy's **own moved centroid** (copies march in a straight line while turning in place — a straight line of turned copies, a staircase, or with a Y offset + Y rotation, a helix):

```
qStep = quatFromEulerDeg(stepRotateDeg)
C     = centroidOf(members of G)             // per input group, before the op
for k in 0 … count−1:
  qk = qStep applied k times                  // accumulate by quaternion multiply in the k-loop; NEVER quatFromEulerDeg(k·step) — not equal for multi-axis steps
  Ck = C + k·offset
  member T:
    t1 = translatedTransform(T, k·offset)
    t2 = rotatedAroundOriginTransform(t1, qk, Ck)
    t3 = scaledInPlaceTransform(t2, { x: stepScale.x^k, y: …^k, z: …^k })
  → t3
```

k = 0 is exactly identity. Scale is **in place** (positions don't compound with scale — documented behavior).

**Radial Array** `{ count, axis: 'x'|'y'|'z', center: Vec3, startAngleDeg, sweepDeg, orient: 'rotate'|'keep', radialOffset, axialStep }` — instances on a circle about the axis line through `center` along `axis`. Default axis `'x'` (KSA nose/long axis — a fuel tank lies along +X).

```
a = unit axis vector; C = centroidOf(members of G)
v = (C − center) − ((C − center)·a)a          // radial component of the group's offset from the axis
radialDir = |v| < 1e-6 ? FALLBACK(axis) : v/|v|
            FALLBACK: axis x → (0,1,0); axis y → (1,0,0); axis z → (1,0,0)
angleStep = |sweepDeg| === 360 ? sweepDeg/count : sweepDeg/(count−1)
            // full circle: evenly spaced, no overlap at 360°; partial sweep: endpoint-inclusive fan
for k in 0 … count−1:
  θk = (startAngleDeg + k·angleStep) in radians      // right-hand rule about +axis
  qk = new THREE.Quaternion().setFromAxisAngle(a, θk)
  member T:
    t1 = translatedTransform(T, radialDir·radialOffset)
    t2 = orient === 'rotate' ? rotatedAroundOriginTransform(t1, qk, center)
                             : rotatedPositionOnlyTransform(t1, qk, center)   // NEW helper §4.2: position orbits, rotation untouched
    t3 = translatedTransform(t2, a·(k·axialStep))
  → t3
```

Notes: `radialOffset` enables the seed-at-center workflow (seed on the axis + offset r ⇒ ring of radius r); with the seed already at radius, leave it 0 and the current radial distance is kept. `startAngleDeg ≠ 0` moves the seed group too (lineage still `k = 0`). `axialStep ≠ 0` makes helixes. `orient: 'keep'` is for things that must keep facing one way (solar panels in a ring).

**Grid Array** `{ plane: 'xy'|'xz'|'yz', countA, countB, spacingA, spacingB, centered }`:

```
(uA, uB): xy → ((1,0,0),(0,1,0)); xz → ((1,0,0),(0,0,1)); yz → ((0,1,0),(0,0,1))
base = centered ? −uA·((countA−1)·spacingA/2) − uB·((countB−1)·spacingB/2) : (0,0,0)
for i in 0 … countA−1: for j in 0 … countB−1:        // i outer, j inner — spawn order
  member T → translatedTransform(T, base + uA·(i·spacingA) + uB·(j·spacingB))
lineage: spawn (i=0, j=0)
```

Orientation and scale untouched. `centered` moves the seed group (lineage moves — fine).

### 3.4 Evaluation result

```ts
interface ChainEvalResult {
  instances: ChainInstance[];   // flattened per §3.1; EMPTY when error ≠ null
  totalInstances: number;       // groups × seeds (0 when error)
  newCount: number;             // totalInstances − seedCount (0 when error)
  error: string | null;
}
```

Deterministic, no randomness, no Date. Errors (checked in this order, first wins; all produce empty instances):

1. `seeds.length === 0` → `'Seeds no longer exist'`.
2. Any op fails validation (§3.5) → its message.
3. After applying each array op, running `groups × seeds > 2000` → `'Too many instances (N > 2000)'` (N = the offending product).

### 3.5 Parameter validation & clamps

`clampOp(op): ChainOp` (in the store module, §4.3) sanitizes every numeric field on write AND on defaults-restore; the engine **re-validates** (the store clamp is UX, the engine check is the authority). All counts are `Math.round`ed to integers by `clampOp`.

| Field | Clamp | UI `step` | Engine error when |
|---|---|---|---|
| linear `count` | int 2…500 | 1 | count < 2 (`'Count must be ≥ 2'`) |
| radial `count` | int 2…360 | 1 | count < 2 |
| grid `countA`, `countB` | int 1…500 | 1 | `countA·countB < 2` (`'Grid must produce at least 2 instances'`) or `> 500` (`'Grid too large (max 500)'`) |
| any linear/radial `count` | | | `> 500` (`'Array too large (max 500)'`) |
| `delta`/`offset`/`center`/`spacingA/B`/`radialOffset`/`axialStep` components | −10000…10000 | 0.1 | non-finite (clamp guards) |
| `degreesDeg`/`stepRotateDeg` components | −360…360 | 15 | — |
| `startAngleDeg` | −360…360 | 15 | — |
| `sweepDeg` | −360…360 | 15 | `|sweep| < 1e-6` (`'Sweep must be non-zero'`) |
| `factor`/`stepScale` components | 0.01…100 | 0.1 | ≤ 0 (`'Scale must be positive'`) — negative scale = mirror, deliberately excluded (§7) |

### 3.6 Commit semantics

One discrete undo entry. For each `ChainInstance` in eval order:

- `isSeed: true` → overwrite the original placement's `position/rotation/scale` (identity `instanceId`, template, layer untouched).
- `isSeed: false` → append a new placement: same `subPartTemplateId` and `layerId` as its seed, fresh `instanceId`.

**Fresh-id rule (deliberate deviation from `duplicateSelected`)**: start from the existing convention — `base = lastSegmentLower(templateId)`, `n = (current placements of that template) + 1` — then **increment `n` while `${base}_${n}` is already taken**. Rationale: the count formula alone collides after deletions (`bolt_1` deleted, `bolt_2` survives, count = 1 → next id `bolt_2` collides); a 100-copy array must not mass-produce colliding ids that only surface as the pre-export warning. Existing duplicate paths are NOT changed by this feature.

References are NOT remapped or carried (animations/joints, gimbals, feeds, couplings) — identical to `duplicateSelected`. Copies inherit template-keyed behavior automatically (`subPartGameData`, SubPart-owned colliders/lights, `internalFlags` key off `subPartTemplateId`).

After commit: select the seed placements + all new copies (`setSelectedPlacements`), so the user can immediately chain again or transform the whole result.

---

## 4. Architecture

### 4.1 New files & module layering

```
src/state/chainStore.ts        session atom + op types + actions + clampOp + persisted defaults   (NO three.js, NO react)
src/three/chainMath.ts         evalChain + radial/linear/grid math                                 (three.js math ONLY — no scene/WebGL)
src/three/chainEval.ts         $chainEval = computed([$part, $chainSession], …)                    (three layer; consumed by ui + scene)
src/three/ChainPreviewLayer.ts ghost overlay class                                                 (scene)
src/ui/chain/chainCommands.ts  command registry for the palette
src/ui/chain/openChainPalette.ts  open-guard orchestration (toasts + store call)
src/ui/chain/ChainPalette.tsx  the floating palette
src/ui/chain/ChainStepCard.tsx one step card (param forms)
```

Layering rules honored (docs/architecture.md:23-31): `state/` stays react-free AND three-free — the matrix math lives in `src/three/` beside `bulkTransform.ts` (its exact precedent), and the commit action receives fully-computed plain transforms (the "`setColliderOwner` precedent": the caller supplies converted transforms so the store stays three.js-free, `docs/editor-state.md`). `ui/` importing from `three/` is established (`registry.ts` imports `three/rotateSelection`). Import graph (all acyclic): `chainStore → editorStore (types only)`; `chainMath → chainStore, bulkTransform, editorStore (types), three`; `chainEval → chainMath, chainStore, editorStore`; `ChainPreviewLayer → chainEval, coords, Viewport, SubPartObject (type)`; ui files → all of the above + kit; `projectStore → chainStore` (one `closeChain()` call); `editorStore` imports **nothing** chain-related (it only gains the self-contained `applyActionChain`).

### 4.2 `src/three/chainMath.ts`

```ts
import * as THREE from 'three';
import type { EulerXYZ, Vec3 } from '../ksa/types';
import type { PlacementTransform } from '../state/editorStore';
import type { ChainOp } from '../state/chainStore';
import { centroidOf, groupScaledTransform, quatFromEulerDeg,
         rotatedAroundOriginTransform, scaledInPlaceTransform, translatedTransform } from './bulkTransform';

export interface ChainInstance { seedIndex: number; transform: PlacementTransform; isSeed: boolean }
export interface ChainEvalResult { instances: ChainInstance[]; totalInstances: number; newCount: number; error: string | null }

/** Rotates only the POSITION about `origin` (orientation and scale untouched) — radial 'keep' mode. */
export function rotatedPositionOnlyTransform(t: PlacementTransform, q: THREE.Quaternion, origin: Vec3): PlacementTransform
export const MAX_CHAIN_INSTANCES = 2000;
export const MAX_ARRAY_COUNT = 500;
export function evalChain(seeds: readonly PlacementTransform[], ops: readonly ChainOp[]): ChainEvalResult
```

Implementation constraints: implement §3 formulas EXACTLY; build the per-k linear/radial quaternion by *accumulating multiplication inside the k loop*; reuse the imported `bulkTransform` helpers for every translate/rotate/scale primitive (do not re-derive Euler handling — `rotatedAroundOriginTransform` already owns the `'ZYX'` conversion); deep-copy transforms at every boundary (the helpers already return fresh objects); no mutation of inputs; no `Date`/`Math.random`. `rotatedPositionOnlyTransform` mirrors `rotatedAroundOriginTransform` (`bulkTransform.ts:130-149`) minus the orientation update — put it in `chainMath.ts`, do NOT modify `bulkTransform.ts`.

### 4.3 `src/state/chainStore.ts`

```ts
import { atom } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent'; // same import every store uses (e.g. editorStore.ts:2)
import type { EulerXYZ, Vec3 } from '../ksa/types';

export type ChainOpKind = 'translate' | 'rotate' | 'scale' | 'linear-array' | 'radial-array' | 'grid-array';
export type ChainAxis = 'x' | 'y' | 'z';
export type ChainPlane = 'xy' | 'xz' | 'yz';
export type ChainPivotMode = 'centroid' | 'origin' | 'custom';

export interface TranslateOp   { id: string; kind: 'translate'; delta: Vec3 }
export interface RotateOp      { id: string; kind: 'rotate'; degreesDeg: EulerXYZ; pivot: ChainPivotMode; center: Vec3 }
export interface ScaleOp       { id: string; kind: 'scale'; factor: Vec3; mode: 'smart' | 'inPlace'; pivot: ChainPivotMode; center: Vec3 }
export interface LinearArrayOp { id: string; kind: 'linear-array'; count: number; offset: Vec3; stepRotateDeg: EulerXYZ; stepScale: Vec3 }
export interface RadialArrayOp { id: string; kind: 'radial-array'; count: number; axis: ChainAxis; center: Vec3;
                                 startAngleDeg: number; sweepDeg: number; orient: 'rotate' | 'keep';
                                 radialOffset: number; axialStep: number }
export interface GridArrayOp   { id: string; kind: 'grid-array'; plane: ChainPlane; countA: number; countB: number;
                                 spacingA: number; spacingB: number; centered: boolean }
export type ChainOp = TranslateOp | RotateOp | ScaleOp | LinearArrayOp | RadialArrayOp | GridArrayOp;

export interface ChainSession { seedIds: string[]; ops: ChainOp[] }
export const $chainSession = atom<ChainSession | null>(null);

export function defaultOp(kind: ChainOpKind): ChainOp          // hardcoded defaults (below) merged with $chainDefaults[kind], then clampOp
export function clampOp(op: ChainOp): ChainOp                  // §3.5 table; rounds counts; drops non-finite to the hardcoded default
export function openChain(seedIds: readonly string[]): void    // replaces any existing session
export function closeChain(): void
export function addChainOp(kind: ChainOpKind): string          // append defaultOp, return its id (no-op '' when no session)
export function updateChainOp(id: string, patch: Partial<ChainOp>): void  // merge → clampOp → write; also persists to $chainDefaults[kind] (op minus id)
export function removeChainOp(id: string): void
export function moveChainOp(id: string, dir: -1 | 1): void
```

Hardcoded defaults: translate `delta (0,0,0)`; rotate `degrees (0,0,0), pivot 'centroid', center (0,0,0)`; scale `factor (1,1,1), mode 'smart', pivot 'centroid', center (0,0,0)`; linear `count 3, offset (1,0,0), stepRotateDeg (0,0,0), stepScale (1,1,1)`; radial `count 6, axis 'x', center (0,0,0), startAngleDeg 0, sweepDeg 360, orient 'rotate', radialOffset 0, axialStep 0`; grid `plane 'xy', countA 3, countB 3, spacingA 1, spacingB 1, centered false`.

Defaults persistence: `const $chainDefaults = persistentJSON<Partial<Record<ChainOpKind, unknown>>>('flexo:chainDefaults', {})` — module-private. `defaultOp` merges the persisted blob field-by-field over the hardcoded default (only copying fields whose key exists on the hardcoded shape), then `clampOp` — this is the constitution-compliant defensive read (bad persisted data degrades to hardcoded defaults; NO migration code). Op `id`s come from `randomId()` (`src/state/ids.ts:12`).

Every session mutation replaces the session object immutably (`$chainSession.set({ ...s, ops: next })`) so subscribers fire. **None of this is document state — no `pushUndo` anywhere in this module** (the undo invariant applies to `$part` mutators only; the session is ephemeral UI state like selection).

### 4.4 `src/three/chainEval.ts`

```ts
import { computed } from 'nanostores';
import { $part, type PlacementTransform } from '../state/editorStore';
import { $chainSession, type ChainSession } from '../state/chainStore';
import { evalChain, type ChainEvalResult } from './chainMath';

export interface ChainEvalState {
  session: ChainSession;
  resolvedSeedIds: string[];             // ids that still resolve, in session order
  seedTransforms: PlacementTransform[];  // parallel to resolvedSeedIds
  result: ChainEvalResult;
}
export const $chainEval = computed([$part, $chainSession], (part, session): ChainEvalState | null => …)
```

`null` when no session. Resolution: for each `seedIds[i]`, `part.placements.findIndex(p => p.instanceId === id)` — first match wins (duplicate instanceIds are a pre-existing app quirk; deterministic first-match is fine), missing ids dropped. Zero resolved → `result = { instances: [], totalInstances: 0, newCount: 0, error: 'Seeds no longer exist' }` without calling `evalChain`. This computed re-fires on every `$part` change (gizmo drags of seeds, undo) and every session edit — that is the entire live-preview data path.

### 4.5 Commit — `applyActionChain` in `src/state/editorStore.ts`

Place it near `duplicatePlacement` (`:1749`). Discrete undo pattern.

```ts
export interface ChainCommitEntry { seedInstanceId: string; transform: PlacementTransform; isSeed: boolean }

/**
 * Applies an evaluated action chain: seed entries overwrite the original placement's
 * transform; non-seed entries append clones of their seed (same template + layer, fresh
 * collision-free instanceId). ONE undo entry. Selects seeds + copies. Returns the number
 * of placements created, or -1 when any seedInstanceId fails to resolve (no-op, no undo).
 */
export function applyActionChain(entries: readonly ChainCommitEntry[], detail: string): number
```

Algorithm (exact):
1. `if (entries.length === 0) return -1`. Resolve every distinct `seedInstanceId` → index via first-match `findIndex` on the CURRENT `$part`; any miss → return `-1` (no undo, no mutation).
2. `pushUndo('action chain', detail)`.
3. `const part = clone(current)`. First pass — seed entries: copy `position/rotation/scale` (fresh `{...}` objects) onto `part.placements[idx]`.
4. Second pass — non-seed entries in order: look up the seed placement (by the resolved index), push `{ instanceId: nextChainInstanceId(part, seed.subPartTemplateId), subPartTemplateId: seed.subPartTemplateId, position/rotation/scale: fresh copies of entry.transform, layerId: seed.layerId }`; record the new index. (`nextChainInstanceId` = private helper implementing §3.6's collision-skip rule; it recounts against the growing `part.placements` each call, exactly like the duplicate loop, then skips taken ids.)
5. `$part.set(part)`; `setSelectedPlacements([...seedIndices, ...newIndices])`; return `newIndices.length`.

Caller (palette Apply): read `$chainEval.get()` fresh, map `result.instances` → entries with `seedInstanceId = resolvedSeedIds[seedIndex]`, `detail = newCount > 0 ? '+' + newCount + ' SubParts' : totalInstances + ' transformed'`, call, then `closeChain()` and toast.

### 4.6 Ghost preview — `src/three/ChainPreviewLayer.ts`

```ts
export class ChainPreviewLayer {
  constructor(viewport: Viewport, getObject: (instanceId: string) => SubPartObject | undefined)
  refresh(): void
  dispose(): void
}
export const PREVIEW_MAX_GHOSTS = 500;
```

- Constructor: `this.group = new THREE.Group(); group.name = 'chain-preview'; viewport.scene.add(group)` — on `viewport.scene`, NOT `EditorScene.root` (MeasurementLayer precedent `MeasurementLayer.ts:131-153`): unpickable by `SelectionManager`, untouched by `applyLayerView`.
- Module-level singleton material: `const GHOST_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x2cfa1f, transparent: true, opacity: 0.35, depthWrite: false })` (the accent green; unlit translucent silhouette). Never disposed per-refresh.
- `refresh()`: `group.clear()` (NO geometry/material disposal — geometry is the shared cache's, the material is the singleton). Read `$chainEval.get()`; if `null` or `result.error` → `viewport.invalidate()`, done. Else iterate `result.instances`; ghost an instance when `!isSeed`, or when `isSeed` and its transform differs from the live placement's current transform (component-wise `> 1e-9` on any of the 9 numbers) — a moved seed shows a ghost at the target while the real object stays put. Stop creating after `PREVIEW_MAX_GHOSTS` ghosts. Per ghost: `src = getObject(resolvedSeedIds[seedIndex])`; if `undefined` (async build pending) skip — a later refresh catches it; `const ghost = src.group.clone(true)`; `ghost.traverse(o => { o.raycast = () => {}; if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = GHOST_MATERIAL; })`; `applyPlacement(ghost, instance.transform)` (`coords.ts:30` — fully overwrites p/r/s); `ghost.name = 'chain-ghost'; group.add(ghost)`. End with `viewport.invalidate()`.
  - `Group.clone(true)` shares geometry by reference and we immediately replace every material reference — no per-ghost GPU resources are created beyond scene-graph nodes. Selection-highlight emissive state on the source materials is irrelevant (materials are swapped out).
- `dispose()`: `viewport.scene.remove(group)`; `group.clear()`.
- **EditorScene wiring** (3 exact touch points): (1) instantiate next to the other layers (`EditorScene.ts:462-466` area) passing `(id) => this.objects.get(id)`; (2) `this.sub($chainEval, () => this.chainPreview.refresh())` beside the other subscriptions (`:528` area — `sub()` auto-invalidates, the extra invalidate inside refresh is harmless); note `$chainEval` already recomputes on `$part` changes, so this single subscription covers document edits, session edits, undo — everything except: (3) the async `SubPartObject.create(...).then(...)` completion block (`:679-699`) must also call `this.chainPreview.refresh()` (a seed that finished loading mid-session gets its ghosts). Dispose in `EditorScene.dispose()` beside `pivotHelper` teardown (`:2125` area).

### 4.7 Open orchestration — `src/ui/chain/openChainPalette.ts`

```ts
export function toggleChainPalette(): void
```

If `$chainSession.get()` non-null → `closeChain()`, return. Else: `part = $part.get()`; `indices = $selectedIndices.get()` filtered to valid range; placements = those entries. Guards per §2.1 with the exact toast texts (kit `toast`, variant `'warning'`). Pass `placements.map(p => p.instanceId)` (selection order) to `openChain`.

---

## 5. Phases

Every phase ends with the mandatory workflow — run ALL of: `pnpm run fmt` → `pnpm run lint` (fix everything) → `pnpm run fmt:check` → `pnpm typecheck` → `pnpm test`. UI phases additionally satisfy the Rules-of-React pre-submit checklist (AGENTS.md:95-105): no manual memoization, hooks top-level only, no render-body side effects/mutation. Each phase is independently landable.

### Phase 1 — chain domain: types, session store, math engine (no UI, no scene)

**T1.1 — `src/state/chainStore.ts`**: exactly §4.3 (types verbatim, atom, actions, `defaultOp`/`clampOp`, `flexo:chainDefaults` persistence; `persistentJSON` from `@nanostores/persistent`). No three.js/react imports (enforced conceptually by docs/architecture.md — the file gets checked in T5.1's doc update).

**T1.2 — `src/three/chainMath.ts`**: exactly §4.2 implementing §3.1–§3.5. Export everything listed. Keep `bulkTransform.ts` untouched.

**T1.3 — `src/three/chainMath.test.ts`** (vitest; construct `PlacementTransform`s inline). Required cases — assert positions/rotations with `toBeCloseTo` (6 places) and lineage/count/error fields exactly:
1. Empty ops → 1 group, instances = seeds, all `isSeed`, `newCount 0`.
2. Translate moves every seed by delta; rotate 90° about Y pivot `'origin'` maps position `(1,0,0) → (0,0,−1)` (right-hand rule, ZYX conversion exercised); scale `'smart'` about `'centroid'` matches `scaledAroundOriginTransform` directly; scale `'inPlace'` leaves positions.
3. Linear count 3, offset (2,0,0), no rotation: positions x = 0/2/4, exactly one `isSeed` group (k=0), `newCount = 2·seedCount`.
4. **Issue example**: linear count 15, offset (1,1,0), stepRotateDeg (15,0,0): copy k position = seed + (k,k,0); copy k orientation = k·15° about X composed on the seed (compare against a loop of `rotatedAroundOriginTransform` with accumulated quats); 15 instances.
5. Linear multi-axis stepRotate (15,30,0) count 3: instance 2's rotation equals qStep·qStep applied — NOT `quatFromEulerDeg(30,60,0)` (regression pin for the accumulate-don't-scale rule).
6. Linear stepScale (2,2,2) count 3: scales ×1/×2/×4, positions unaffected by scale.
7. Radial: seed at (0,3,0) [off-axis], axis 'x', center (0,0,0), count 4, sweep 360, orient 'rotate': positions (0,3,0), (0,0,3), (0,−3,0), (0,0,−3) (θ = 0/90/180/270 about +X); instance 1's orientation is seed-rotation pre-multiplied by 90°-about-X.
8. Radial orient 'keep': same positions as (7), every rotation equals the seed's.
9. Radial partial sweep: count 3, sweep 180 → θ = 0/90/180 (endpoint-inclusive `/(count−1)`); full 360 count 3 → θ = 0/120/240 (`/count`).
10. Radial seed ON the axis: seed at (5,0,0), axis 'x', radialOffset 2 → fallback dir (0,1,0), instance 0 at (5,2,0); ring of radius 2 in the YZ plane at x=5.
11. Radial axialStep 0.5, count 4 → instance k gains k·0.5 along the axis (helix).
12. Radial startAngle 45 → instance 0 is rotated 45° (seed group MOVES, `isSeed` still true).
13. Grid xz 3×2 spacing (2,1): 6 instances, position (i·2, 0, j·1) offsets, lineage at (0,0); `centered: true` shifts all by (−2, 0, −0.5).
14. Multi-seed rigid group: two seeds, radial count 2 sweep 180 → 4 instances; the two members of spawn k=1 preserve their relative offset (rotated as a unit).
15. Composition: [linear ×2 offset (4,0,0)] then [linear ×3 offset (0,2,0)] → 6 instances forming the 2×3 grid; exactly `seedCount` of them `isSeed`.
16. Composition: [radial ×4] then [translate (0,5,0)] → all 4 ring instances lifted by 5 (transform-after-array applies to all).
17. Errors: count 1 (via a hand-built op bypassing clampOp) → error; grid 1×1 → error; radial sweep 0 → error; scale factor 0 → `'Scale must be positive'`; 3 seeds × [linear ×500] × [linear ×2] → `'Too many instances (3000 > 2000)'`; error results have empty instances and totalInstances 0.
18. Purity: inputs (seeds array and its transforms, ops) are deep-equal to their pre-call snapshots after evaluation.

**T1.4 — `src/state/chainStore.test.ts`**: open/close/replace session; addChainOp appends defaultOp of each kind and returns its id; updateChainOp merges + clamps (count 9999 → 500; count 2.7 → 3; factor −1 → 0.01; sweep 400 → 360); remove/move (move clamps at ends; unknown id no-ops); defaults persist across `closeChain`/`openChain`+`addChainOp` (update linear count to 7 → close → open → add linear → count 7); a corrupted `flexo:chainDefaults` blob (e.g. `{"linear-array": {"count": "junk", "bogus": 5}}`) degrades to hardcoded defaults without throwing. Reset `localStorage` and `$chainSession` in `beforeEach` (follow patterns in `src/state/layerStore.test.ts` / `settingsStore.test.ts` for persistent-store test hygiene).

### Phase 2 — commit action + undo enrollment

**T2.1 — `applyActionChain` + `ChainCommitEntry` + private `nextChainInstanceId` in `src/state/editorStore.ts`**: exactly §4.5, placed after `duplicatePlacement`. Include the §3.6 collision-skip comment explaining the deviation. Follows discrete pattern: `pushUndo('action chain', detail)` before `clone`.

**T2.2 — extend `src/state/editorStore.test.ts`** (new `describe('applyActionChain')`):
1. Transform-only (all `isSeed`): transforms updated in place, placement count unchanged, ONE new undo entry, `undo()` restores prior transforms, `redo()` re-applies.
2. Clone entries: correct template/layer inherited from seed; transforms match entries; appended at the end; return value = clone count.
3. Fresh-id collision skip: seed part with placements `a_1`, `a_3` of the same template (build via direct `$part.set` like existing tests) → two clones get `a_4`, `a_5` (count+1 = 3 collides with nothing… construct so the naive `count+1` WOULD collide: placements `a_1`, `a_3` → count 2 → candidate `a_3` taken → `a_4`; second clone count 3 → candidate `a_4` taken → `a_5`).
4. Selection afterwards = seed indices + new indices, in that order (`$selectedIndices`).
5. Unresolvable `seedInstanceId` → returns −1, `$part` unchanged (deep-equal), `$canUndo` unchanged (no stray history entry).
6. `detail` shows up in `$historyList` / `$undoDescription` as `action chain`.
7. Mixed: 2 seeds moved + 4 clones in one call → single undo round-trips everything.

**T2.3 — doc touch**: add `applyActionChain` to the discrete-mutation list in `docs/editor-state.md` (§ "Undo/redo invariant", pattern-1 list) and to the invariant comment block in `editorStore.ts:311-313`'s examples.

### Phase 3 — palette UI, end-to-end (no 3D ghosts yet; footer counts prove the loop)

**T3.0 — `src/three/chainEval.ts`**: exactly §4.4.

**T3.1 — `src/ui/chain/chainCommands.ts`**: `interface ChainCommandDef { kind: ChainOpKind; label: string; description: string; keywords: string[]; icon: LucideIcon }` + `export const CHAIN_COMMANDS: ChainCommandDef[]` per the §2.3 table (order as listed: transforms first, arrays after). Descriptions (verbatim): Translate "Move the working set"; Rotate "Rotate the working set about a pivot"; Scale "Scale the working set"; Linear Array "Repeat in a line — offset, twist and scale per step"; Radial Array "Place copies around an axis"; Grid Array "Rows × columns on a plane".

**T3.2 — `src/ui/chain/openChainPalette.ts`**: exactly §4.7.

**T3.3 — `src/ui/chain/ChainStepCard.tsx`**: props `{ op: ChainOp; index: number; total: number }`. Renders §2.3's card + per-kind rows; every field writes through `updateChainOp(op.id, patch)`; up/down call `moveChainOp(op.id, ±1)` (disabled at ends), ✕ calls `removeChainOp(op.id)`. Number fields: `PreciseNumberInput` with min/max/step from the §3.5 table; vectors: `Vec3Field label="…" labelWidth="w-20"`; enums: kit `Select size="sm"` with the §2.3 option labels; `centered`: kit `Checkbox`. No `onInteractionStart` anywhere (per §2.3). Component must render purely from the `op` prop + store actions (React Compiler rules).

**T3.4 — `src/ui/chain/ChainPalette.tsx`**: §2.2 layout. `const session = useStore($chainSession); const evalState = useStore($chainEval); if (!session) return null;` Search + command GridList (`selectionMode="none"`, kit `GridList`, `dependencies={[query]}`, `onAction={(key) => { addChainOp(key as ChainOpKind); setQuery(''); inputRef.current?.focus(); }}`). Steps list from `session.ops` (`key={op.id}`). Footer per §2.2 driven by `evalState.result`. Apply handler per §4.5's caller spec. Component-local hotkeys: `useHotkeys('mod+enter', apply, { enableOnFormTags: true, preventDefault: true }, [/* deps per react-hotkeys-hook */])` and `useHotkeys('escape', cancel, { enableOnFormTags: true })` — consult the project `hotkeys` skill for exact option usage. Desktop/phone container classes per §2.2 via `useIsPhone()`.

**T3.5 — wiring**:
- `src/app.tsx`: render `<ChainPalette />` after the toolbar overlays (sibling order near `<TransformHud />`; it self-gates on the session atom).
- `src/ui/SelectionToolbar.tsx`: add a "Chain" `Button size="sm"` (lucide `Workflow` icon + text) beside the existing Duplicate button (`:70`), `onPress={toggleChainPalette}` — visible whenever the duplicate button is (placement-selection presence is re-checked by the open guards).
- `src/ui/hotkeys/registry.ts`: append to the **Editing** group: `{ id: 'action-chain', label: 'Action chain palette (selection)', keys: 'mod+k', chords: [['mod','K']], run: () => toggleChainPalette() }`. (Global shared options give `preventDefault: true`, which suppresses browser `ctrl+k`/`cmd+k` defaults.)
- `src/state/projectStore.ts` `applyProjectSnapshot`: call `closeChain()` alongside `clearSelection()` (import from `./chainStore` — acyclic).
- **Manual acceptance flow** (run `pnpm dev`, base path `/flexo/`): add two SubParts → select both → `mod+K` → palette opens focused; type "rad" → Enter → Radial card appears, footer shows `12 instances · +10 new` (2 seeds × 6); tweak count with arrows → footer follows; `mod+↵` → 12 placements in the Assets list, one undo step reverts all; `mod+K` with nothing selected → warning toast; Escape closes; help overlay `?` lists the new binding.

### Phase 4 — live ghost preview

**T4.1 — `src/three/ChainPreviewLayer.ts`**: exactly §4.6 (class, singleton material, `PREVIEW_MAX_GHOSTS`, refresh algorithm, dispose).

**T4.2 — EditorScene wiring**: the three touch points from §4.6 (instantiate ~`:462`; `this.sub($chainEval, …)` ~`:528`; refresh call inside the async-create `.then` block ~`:679-699`; dispose ~`:2125`). Use the existing `sub()` helper — direct `.subscribe` is forbidden in this class (`EditorScene.ts:637-640`).

**T4.3 — manual acceptance**: radial ×8 on a placed SubPart shows 7 (or 8, if startAngle ≠ 0 moves the seed) translucent green silhouettes updating live as count/axis/angles change; gizmo-dragging the seed placement re-flows the ring in real time; ghosts are never clickable/selectable; Cancel and Apply both leave zero ghosts; a grid 30×30 previews 500 ghosts + footer cap note but Applies the full 900 (within the 2000 cap); with the seed's layer hidden the ghosts still render (documented quirk, acceptable); WebGL resources stable across repeated open/edit/cancel (no per-refresh geometry/material creation — verify via `renderer.info` in devtools if in doubt).

**T4.4 — doc touch**: add a "Chain preview" bullet to the overlay/aids section of `docs/3d-workspace.md` (group on `viewport.scene`, unpickable, singleton ghost material, cap 500, refresh triggers).

### Phase 5 — docs, polish, verification

**T5.1 — `docs/action-chains.md`** (new): sections — what a chain is (§0 condensed); the op catalog with the §3 semantics tables (count-includes-original, lineage/seed-moves, iterated linear semantics, radial angle-step rule, +X default axis rationale); caps table (§3.5, 2000/500); what commit does and does not do (fresh ids with collision-skip; NO reference remapping — same as Duplicate); session lifecycle & keyboard reference; preview limitations (cap, hidden-layer quirk, async-load catch-up). Link it from `AGENTS.md`'s documentation list and from `docs/editor-state.md`'s panel list; add `$chainSession`/chainStore + `$chainEval` rows to `docs/editor-state.md`'s store table (note: session is ephemeral-by-design, `flexo:chainDefaults` is the persisted piece).

**T5.2 — sweep**: confirm the registry help entry renders in the `?` overlay; confirm `pnpm build` passes (tsc + both vite builds); re-run the full mandatory workflow; grep that `scope/` is untouched.

**T5.3 — browser verification (recommended)**: per project convention use **project-local Playwright** (`pnpm add -D playwright && pnpm exec playwright install chromium` if absent — dev-dependency only, never global). Script: launch `pnpm dev`, open `http://localhost:5173/flexo/`, add a SubPart via the catalog, open the palette (keyboard `Meta+K` / `Control+K`), add a Radial Array, screenshot (palette + ghosts), Apply, screenshot, assert the Assets list row count grew by 5. Attach screenshots to the PR/summary. Skip only if the environment cannot run a browser; say so explicitly.

---

## 6. Mandated maintenance (AGENTS.md compliance recap)

- `docs/editor-state.md` — Phase 2 (undo list) + Phase 5 (stores/actions/panels).
- `docs/3d-workspace.md` — Phase 4 (preview layer).
- `docs/action-chains.md` + `AGENTS.md` doc link — Phase 5.
- `src/state/editorStore.test.ts` — Phase 2 (undo mandate for the new mutator).
- `scope/` — **explicitly no changes** (editor-only feature; no game-contract surface). Do not "helpfully" add one.

## 7. Deliberate limits (v1) & future work

Not in v1 — do not implement, do not scaffold:

- **Mirror step**: blocked on the negative-scale problem — KSA back-face culls mirrored placements invisible (`scope/custom-assets-and-mod-export.md:77`); a correct Mirror needs baked winding-reversed geometry (the importer's approach), which is a custom-mesh pipeline feature, not a transform. Chain scale stays positive-only.
- **Other entity kinds as seeds** (connectors/colliders/lights/seats): per-kind clone rules (id schemes, pinned layers, owner frames) multiply the surface; placements are the 95% case. The `ChainInstance.seedIndex` indirection leaves room.
- **Saved/named chain presets, chain macros**: `flexo:chainDefaults` (per-op last values) covers most reuse; a preset library is a separate feature.
- **Custom pivot picking in the viewport** (click-to-set center), **draggable palette**, **drag-reorder of steps**, **per-instance random jitter**, **expression inputs** (`r*2`), **preview instance labels**.
- **Reference remapping for copies** (animations/gimbals/feeds): identical to the existing Duplicate behavior; revisit only if Duplicate itself grows it.

## 8. Decision log

1. **Self-contained ops, no "repeat consumes the previous step" magic** — every step's params live on the step; `Repeat`-style composition is expressed by array ops owning their own delta. Kills a whole ambiguity class for users and implementers.
2. **`count` = TOTAL instances including the original, everywhere, min 2** — "6 around the tank" must mean 6. Uniformity beats the "N copies" reading of the issue text; the live footer/ghosts disambiguate instantly.
3. **Linear arrays iterate the delta with rotation about the moving copy centroid** (march + turn in place) — the literal reading of issue example 2; circles/arcs belong to Radial (which does them better, with orient control).
4. **Radial default axis = X** — KSA's nose/long axis is local +X; "around the tank" is around X for a stock-style part.
5. **Full-circle sweep divides by `count`, partial sweep by `count−1` (endpoint-inclusive)** — the only pair of formulas that both avoids the 0°=360° overlap and puts a fan's last instance exactly on the end angle.
6. **Engine composes the existing `bulkTransform.ts` primitives on plain TRS** (no 4×4 compose/decompose pipeline) — inherits the calibrated `'ZYX'` handling, cannot produce shear, and guarantees parity with the gizmo/BulkTransformPanel.
7. **Math in `src/three/`, session in `src/state/`, commit takes precomputed plain transforms** — respects the documented layering carve-outs without extending them (`bulkTransform` + `setColliderOwner` precedents).
8. **Seeds frozen at open, resolved by id, evaluated against live `$part`** — gizmo/hotkey edits to seeds live-update the preview; deletes degrade to a visible error instead of crashes or auto-close surprises.
9. **Clone ids: existing count formula + collision-skip** — mass-producing the known `count+1` collision quirk ×500 would be indefensible; existing duplicate paths left untouched.
10. **Ghosts = `group.clone(true)` + one shared unlit material, on `viewport.scene`** — zero per-ghost GPU allocations, unpickable and layer-logic-free by construction, truthful silhouettes at 500 scale.
11. **Palette is non-modal and single-key tools stay live** — adjusting the seed *while watching the ring* is the killer interaction; modality would kill it.
12. **No undo enrollment for session edits; one discrete `pushUndo` at Apply** — the session is ephemeral UI state (selection-tier), and cancel-safety comes from never touching `$part` before Apply.
