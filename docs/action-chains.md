# Action Chains

A command-palette for repetitive placement: build an ordered list of steps, watch them
preview live over the viewport, and commit the whole thing as **one undo step**. It is how
you get four RCS blocks around a tank, a 6 × 4 solar-cell grid, or a fifteen-step helix
without duplicating and nudging fifteen times.

Action chains are **editor-only**. They create and move ordinary SubPart placements through
the existing store paths, so there is no KSA game contract here and no `scope/` entry —
everything a chain produces is indistinguishable from hand placement by the time it is
exported.

## What a chain is

A chain applies an ordered list of **steps** (ops) to the **seeds** — the SubPart placements
that were selected when the session opened. Two families:

- **Transform steps** — Translate / Rotate / Scale. They move the whole current working set,
  exactly as the multi-select "transform by" panel does, with a pivot choice added.
- **Array steps** — Linear / Radial / Grid Array. They **replicate** the working set into
  `count` instances.

Because a later step applies to *everything* the earlier steps produced, arrays **compose**:
`[Linear ×5 on X][Linear ×3 on Y]` is a 15-cell grid, and `[Radial ×6][Translate +2 Y]` is a
lifted ring.

Evaluation (`evalChain`, `src/three/chainMath.ts`) is a **pure fold** — no scene, no clock, no
randomness. Its state is a list of **groups**, each one rigid copy of the whole seed set
(`members[i]` is always seed `i`). A transform step maps every member of every group; an array
step replaces each group with `count` groups. That is what makes a multi-seed selection move
as a *unit* — a radial array of two seeds rotates the pair, it does not scatter them.

Exactly one group carries `isSeedGroup`, inherited by each array step's `k = 0` spawn. Its
members are the **originals**: at commit they overwrite the seed placements in place, and every
other instance becomes a clone. A seed group can and does move (a transform step, a radial
`startAngleDeg`, a centered grid all move it) — that is intended, not a bug.

The flattened output is `ChainInstance[]` (`{ seedIndex, transform, isSeed }`) in group order,
then seed order, with `totalInstances = groups × seeds` and `newCount = totalInstances − seeds`
— the two numbers the palette footer shows.

## The op catalog

Every translate/rotate/scale primitive is delegated to `src/three/bulkTransform.ts`, the same
module the transform gizmo and the numeric `BulkTransformPanel` use, so a chain can never
disagree with them about Euler order (`'ZYX'`, see [coordinates.md](./coordinates.md)) or
smart-scale semantics.

**`count` is the TOTAL number of instances including the original.** "6 around the tank" means
six things around the tank, which is why every array count clamps to ≥ 2. The live footer and
ghosts disambiguate instantly.

### Transform steps

| Step | Parameters | Math |
|---|---|---|
| **Translate** | `delta` (m) | `translatedTransform(T, delta)` |
| **Rotate** | `degreesDeg`, `pivot`, `center` | `rotatedAroundOriginTransform(T, quatFromEulerDeg(degreesDeg), pivotPoint)` |
| **Scale** | `factor`, `mode` (`smart`/`inPlace`), `pivot`, `center` | `groupScaledTransform('subpart', T, factor, mode === 'smart' ? pivotPoint : null)` |

The pivot resolves once per step (`pivotPoint` in `chainMath.ts`): `'centroid'` is the centroid
of **every member of every current group** (so a rotate after an array spins the whole array),
`'origin'` is the Part origin, `'custom'` is the typed `center`. `'inPlace'` scaling grows each
member where it stands, so the card hides the pivot row for it.

### Linear Array

`{ count, offset, stepRotateDeg, stepScale }` — the issue's *"duplicate N times spaced +5 m on
X each"*. **Iterated delta**: copy `k` is `k` applications of the per-step delta, rotating about
that copy's **own moved centroid**, so copies march in a straight line while turning in place —
a staircase, or a helix with a Y offset plus a Y twist. Per-step scale is `stepScale ** k`, and
it is **in place**: positions never compound with it.

The per-step quaternion **accumulates by multiplication inside the `k` loop**. Building it as
`quatFromEulerDeg(k · step)` would be wrong for any multi-axis step — Euler angles do not scale
linearly under composition, so `(15°, 30°, 0)` twice is *not* `(30°, 60°, 0)`. There is a
regression test pinning exactly that (`chainMath.test.ts`, "accumulates the step quaternion
instead of scaling Euler angles").

`k = 0` is exactly identity: an all-zero step rotation short-circuits the rotate call
(`isIdentityQuat`) rather than round-tripping through Euler angles, so an unmoved seed commits
back its own stored rotation instead of a re-canonicalized equivalent.

### Radial Array

`{ count, axis, center, startAngleDeg, sweepDeg, orient, radialOffset, axialStep }` — copies on
a circle about the axis line through `center`.

- **Default axis is `'x'`.** A KSA part's nose/long axis is its local **+X** — connector
  forward, IVA seat forward, light aim and the "+X (nose)" inspector preset all agree — so
  "around the tank" is around X for a stock-style part.
- **Angle step**: `|sweepDeg| === 360 ? sweepDeg / count : sweepDeg / (count − 1)`. A full
  circle divides by `count` so 0° and 360° don't stack two copies on top of each other; any
  partial sweep divides by `count − 1` so the last copy lands exactly on the end angle
  (endpoint-inclusive fan).
- **Radius** comes from the group centroid's radial component relative to the axis. With the
  seed already at radius, leave `radialOffset` at 0 and its current distance is kept. When the
  centroid sits *on* the axis (within `1e-6`) there is no radial component to preserve, so a
  fallback direction is used (+Y for axis X, +X for axis Y and Z) and `radialOffset` becomes
  "push it out this far, then ring it".
- **`orient`**: `'rotate'` turns each copy with the ring (`rotatedAroundOriginTransform` —
  thruster blocks stay flush to the tank); `'keep'` orbits the position only and leaves every
  orientation alone (`rotatedPositionOnlyTransform` — a ring of solar panels that must all face
  one way).
- `axialStep` adds `k · axialStep` along the axis, which is how you get a helix.
  `startAngleDeg ≠ 0` rotates the seed group too; it is still the seed group.

### Grid Array

`{ plane, countA, countB, spacingA, spacingB, centered }` — `i` outer, `j` inner over the
plane's two unit axes (`xy` → +X/+Y, `xz` → +X/+Z, `yz` → +Y/+Z). Orientation and scale are
untouched. `centered` shifts the whole grid back by half its extent so the seed ends up in the
middle instead of at the corner — which moves the seed group, same as a radial start angle.

## Caps

`clampOp` (`src/state/chainStore.ts`) sanitizes every field on write **and** on defaults-restore;
`evalChain` re-validates independently, because the store clamp is UX and the engine is the
authority (a session can hold ops that were never written through the clamp).

| Field | Clamp | UI step | Engine error |
|---|---|---|---|
| Linear `count` | int 2…500 | 1 | `Count must be ≥ 2` / `Array too large (max 500)` |
| Radial `count` | int 2…360 | 1 | same (360 = one instance per degree; finer is never intent) |
| Grid `countA`, `countB` | int 1…500 | 1 | product < 2 → `Grid must produce at least 2 instances`; > 500 → `Grid too large (max 500)` |
| Distances — `delta`, `offset`, `center`, `spacingA/B`, `radialOffset`, `axialStep` | ±10000 m | 0.1 | — |
| Angles — `degreesDeg`, `stepRotateDeg`, `startAngleDeg`, `sweepDeg` | ±360° | 15 | a sweep within `1e-6` of zero → `Sweep must be non-zero` |
| Scale — `factor`, `stepScale` | 0.01…100 | 0.1 | ≤ 0 → `Scale must be positive` |

Two engine ceilings, both in `chainMath.ts`: `MAX_ARRAY_COUNT = 500` per array step and
`MAX_CHAIN_INSTANCES = 2000` for the whole chain (`Too many instances (N > 2000)`). The total
is checked **before** an array step expands — nobody benefits from building a million
transforms only to reject them. An error result always carries an empty instance list and
zeroed counts, so the palette can disable Apply on the numbers alone.

The preview has its own, smaller cap: `PREVIEW_MAX_GHOSTS = 500` (see below). It does **not**
limit what Apply commits.

Anything non-finite, wrong-typed or out of range degrades to the hardcoded default rather than
being converted — the defensive read this codebase mandates instead of migration code.

## What Apply does — and does not do

`applyActionChain(entries, detail)` (`src/state/editorStore.ts`) is the only write:

- It resolves **every** distinct `seedInstanceId` first and returns `-1` (no mutation, no undo
  entry) if any is gone — a partial commit would be worse than none.
- One `pushUndo('action chain', detail)` for the whole thing: seed moves *and* every clone
  collapse into a single history step.
- Seed entries **overwrite** their original placement's `position`/`rotation`/`scale`; identity,
  template and layer are untouched.
- Non-seed entries **append** a clone of their seed: same `subPartTemplateId`, same `layerId`,
  fresh `instanceId`.
- Afterwards the seeds plus every new copy are selected (`setSelectedPlacements`), so the result
  can immediately be chained again or transformed as a whole.

**Fresh ids deviate from Duplicate, deliberately.** `nextChainInstanceId` starts from the
app-wide convention — `<last dot-segment, lowercased>_<count + 1>` counted against the growing
`part.placements` — and then **skips forward while the candidate id is already taken**.
`duplicateSelected`/`duplicatePlacement` stop at `count + 1` and therefore collide with
survivors of a deletion (delete `bolt_1`, keep `bolt_2` → count 1 → a second `bolt_2`). One odd
id from a single Duplicate is a tolerated quirk that only surfaces as the pre-export duplicate-id
warning; a chain stamps out up to 500 placements in one gesture, where the same formula would
mass-produce collisions. The existing duplicate paths are **not** changed by this feature.

**No reference remapping — the same as Duplicate.** Clones carry no animations, joints, gimbals,
propellant feeds or couplings; they are plain new placements. Everything keyed by
`subPartTemplateId` (SubPart game data, SubPart-owned colliders and lights, `internalFlags`)
applies to a clone automatically, because it is keyed by template, not by instance.

## Session lifecycle and keyboard

The session is `$chainSession` (`src/state/chainStore.ts`) — ephemeral, selection-tier state.
It is never persisted, never enrolled in undo, and the document is untouched until Apply, which
is what makes Cancel unconditionally safe.

| Gesture | Effect |
|---|---|
| `⇧⌘K`, **Edit ▸ Begin Action Chain…**, or the ⌘K command palette (`chain.begin`, keywords "array grid radial ring repeat") | `beginActionChain()` — opens over the current selection; see the discard rule below |
| The **Chain…** button in the left sidebar's multi-select focus card (`ui/build/MultiSelectPanel.tsx`) | `beginActionChain()` — the same entry point, same discard rule |
| `mod+↵` | Apply — registry binding `chain.apply` at scope `surface:chain`, `enableOnFormTags: true` |
| `Escape`, ✕, **Cancel** | Cancel — **rung 6 of the Escape ladder** |
| Typing in the search field | Filters the command list; `↓` moves into it, `↵` on a row adds that step |
| `↑`/`↓` in any number field | Step by the field's unit (Shift ⇒ ×10, Alt ⇒ ×0.1) — `useNumberDraft` semantics |

**`⌘K` is the command palette, not the chain.** The chain moved to `⇧⌘K` (`chain.begin`) so that
`⌘K` could become the app-wide command palette, and the move also killed the v1 trap where
re-pressing the binding threw away a session without a word: **a session with ≥1 step is never
discarded silently** — `beginActionChain()` raises a "Discard chain (N steps)?" confirm first. An
EMPTY session is re-seeded from the current selection silently, and no session at all just opens
one. The v1 `toggleChainPalette()` helper died with the floating SelectionToolbar that was its
only caller — every entry point now goes through `beginActionChain()`.

**Open guards** (`tryOpenChain`, `src/ui/chain/openChainPalette.ts`), in order: no SubPart
placements in the selection → the status bar's message channel flashes *"Select SubParts to
chain"*; any seed on a locked layer → *"Selection is on a locked layer"* (every other transform
tool refuses the same way).
Otherwise the selected placements' `instanceId`s are frozen **in selection order** as the seeds.

**While open the palette is non-modal**, on purpose. Orbiting, gizmo drags, the single-key
rotate/nudge tools and undo all stay live, and because `$chainEval` re-evaluates against the
*current* document, nudging a seed while watching the ring re-flow is the whole point of the
feature. Changing the **selection** does not change the seeds; the header chip shows the frozen
count.

**Seeds that vanish** (deleted, undone away) are dropped by `$chainEval`. When none survive, the
footer shows `Seeds no longer exist` and Apply is disabled — the palette does not auto-close.
Loading a project closes the session (`applyProjectSnapshot` → `closeChain()`).

**Escape interplay**: cancelling is **rung 6 of the one documented Escape ladder**
(`src/ui/hotkeys/escLadder.ts`; foundation §11.4), no longer a component-local hotkey. Its
contract is unchanged and is what the rung declares: `preventDefault: false`, because
`useNumberDraft` swallows Escape while a field edit is dirty (rung 1 — revert first, close
second), and `enableWhileTyping` so the session still cancels from inside its own step fields.
The rungs above it fire first, so a dirty field, an open menu/dialog and the ⌘K palette each
take the first press. The ≥1-step discard confirm on Escape is not wired yet — today Escape
cancels silently, exactly as in v1; it lands with the chain's FloatingWindow rehost.

**Apply** reads `$chainEval` fresh, maps instances to `ChainCommitEntry[]`, commits, closes and
flashes `Applied chain · +N SubParts` in the status bar's message channel (or `· N transformed`
when the chain created nothing). If a seed vanished between the last recompute and the click,
`applyActionChain` returns `-1` and the message says *"Chain not applied — seeds no longer
exist"* rather than claiming success.

While a session is open the status bar mirrors the chain window's footer as a read-only chip
(`⛓ N instances · +M new`, or the evaluation error in red) — `ToolSegment.tsx`, fed by
`$chainSession`/`$chainEval`.

Per-op parameters are remembered across sessions in the module-private `flexo:chainDefaults`
blob (written on every `updateChainOp`), so an accidental Escape loses the step *list*, not the
tuned numbers, and the next radial ring starts where the last one left off.

## Preview and its limits

`ChainPreviewLayer` (`src/three/ChainPreviewLayer.ts`) draws one translucent accent-green clone
per evaluated instance. Its scene-graph rules — group on `viewport.scene`, no-op `raycast`,
shared geometry, one singleton material — are documented in
[3d-workspace.md § Chain preview ghosts](./3d-workspace.md#chain-preview-ghosts). The honest
limits:

- **500 ghosts max** (`PREVIEW_MAX_GHOSTS`), against a chain that may legally evaluate 2000
  instances. Past the cap the preview stops adding and the footer appends
  `· preview capped at 500`. **Apply still commits the whole chain** — a 30 × 30 grid previews
  500 and applies 900. (The footer keys off `totalInstances`, so it can read one instance early
  when a seed's ghost is suppressed; tracking the layer's real tally is not worth the wiring.)
- **A hidden layer hides its ghosts.** The layer system never touches the preview group — but
  ghosts are made with `Group.clone(true)`, and three's `Object3D.copy` copies `visible`, so a
  seed whose layer is hidden clones into hidden ghosts. Conversely a layer's *opacity* fade does
  not carry, because every cloned mesh's material is replaced with the ghost singleton.
- **Async-load catch-up**: an instance whose source `SubPartObject` is still building is skipped,
  not queued. The `SubPartObject.create` completion block calls `refresh()`, so a seed that
  finishes loading mid-session gets its ghosts on the next tick.
- **A seed is only ghosted when the chain moves it** (any of its 9 transform numbers differs by
  more than `1e-9` from the live placement). That is what makes a pure-transform chain, which
  creates nothing, previewable at all: the ghost marks the target while the real object stays
  put.

## Deliberate limits (v1)

- **No Mirror step, and scale stays positive.** A mirror is a negative scale, and KSA back-face
  culls a negative-scale placement into invisibility (`scope/custom-assets-and-mod-export.md`).
  A correct mirror needs winding-reversed *geometry*, which is a custom-mesh pipeline feature,
  not a transform — so it is unreachable from a chain by construction (`clampOp` floors scale at
  0.01, `evalChain` rejects ≤ 0).
- **Placements only.** Connectors, colliders, lights, IVA seats and kittens cannot seed a chain:
  per-kind clone rules (id schemes, pinned layers, owner frames) multiply the surface, and
  placements are the 95% case. `ChainInstance.seedIndex` leaves room for more later.
- **No saved or named presets / macros.** `flexo:chainDefaults` (last values per op kind) covers
  most of the reuse; a preset library is a separate feature.
- **Layer lock is checked at open, not at Apply** — locking a seed's layer mid-session does not
  block the commit.
- Also out: viewport pivot picking (click-to-set `center`), a draggable palette, drag-reorder of
  steps, per-instance jitter, expression inputs, per-ghost labels.

## Tests

`src/three/chainMath.test.ts` covers the engine: bulk-transform parity, the issue's staircase
example, the accumulate-don't-scale quaternion pin, the radial angle-step pair (full circle vs
partial sweep), the on-axis fallback, helixes, multi-seed rigidity, array composition, every
error, and purity of the inputs. `src/state/chainStore.test.ts` covers the session lifecycle,
every clamp, and that a corrupted `flexo:chainDefaults` blob degrades to hardcoded defaults
without throwing. `src/state/editorStore.test.ts` (`describe('applyActionChain')`) covers the
single-undo round trip, clone template/layer inheritance, the fresh-id collision skip, the
resulting selection, and the `-1` no-op path.

## Files

| File | Role |
|---|---|
| `src/state/chainStore.ts` | `$chainSession`, op types, actions, `clampOp`/`defaultOp`, `flexo:chainDefaults` (no three.js, no React) |
| `src/three/chainMath.ts` | `evalChain` + `rotatedPositionOnlyTransform` + the caps (three.js math only) |
| `src/three/chainEval.ts` | `$chainEval` — the computed that resolves seeds against `$part` and evaluates |
| `src/three/ChainPreviewLayer.ts` | the ghost overlay |
| `src/ui/chain/openChainPalette.ts` | `beginActionChain()` (the `chain.begin` command) + `discardChainAndRestart()`, and the open guards they share |
| `src/ui/chain/ChainPalette.tsx`, `ChainStepCard.tsx`, `chainCommands.ts` | the floating palette, its step cards, and the command catalog |
| `src/state/editorStore.ts` | `applyActionChain` + `ChainCommitEntry` + `nextChainInstanceId` |

Layering follows [architecture.md](./architecture.md): the session store stays React- and
three-free, the matrix math lives in `src/three/` beside `bulkTransform.ts`, and the commit
action receives fully-computed plain transforms (the `setColliderOwner` precedent).
