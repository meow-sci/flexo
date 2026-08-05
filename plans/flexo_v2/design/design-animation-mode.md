# flexo v2 — ANIMATION MODE (end-to-end design)

Status: area design, plugs into `foundation.md` (LAW). Census of record: `analysis/animation.md`
(primary), `analysis/selection-transform.md`, `analysis/catalog-placement-layers.md`,
`analysis/shell-layout.md`, `analysis/ui-kit-hotkeys.md`. All LOCKED decisions honored
(DECISIONS #5 timeline, #8 animation capabilities, #6 phone parity). RULE ZERO ledger in §17.
Foundation deviations (three, all minor extensions) in §16.

Verified against code: `src/ksa/types.ts` (PartAnimation/AnimationJoint/AnimationKeyframe/
EasingConfig/SolarTrackingSpec), `src/ksa/easing.ts` (cubic-bézier model), `src/ksa/animationRig.ts`
(`restAnchorTime`, preview/export math), `src/state/animationStore.ts` inventory per analysis.

---

## 0. What this design fixes (the pain ledger it must retire)

| # | v1 pain (animation.md §4) | v2 answer (section) |
|---|---|---|
| 1 | Everything in one cramped sidebar column | Timeline dock + right navigator + left focus editor (§2) |
| 2 | Joint membership laborious (modal, text-only, one joint per round-trip) | **Members view** — docked, non-modal, layer-grouped, paintable (§7) |
| 3 | No timeline | Dopesheet dock (§5) |
| 4 | Keyframe insertion end-only | Insert at playhead `K`, double-click track, transport ＋Key (§5.4) |
| 5 | Single shared gizmo, single-axis posing | `PoseGizmo` — rings sized to joint, screen-space free-drag, per-gesture axis lock (§9.2) |
| 6 | t=0 vs restAnchorTime pivot inconsistency | ALL pivot ops anchored on `restAnchorTime`; explicit Pivot tool (§9.4) |
| 7 | Scrubbing silently exits pose editing | Pin survives scrubs; re-pins on release (§10.3) |
| 8 | Silent gizmo lock on posed preview | Status-bar lock chip + disabled Tool bar with tooltip (§9.6) |
| 9 | Escape via raw window listener | Registered `mode:animation` Esc rung 7 (§12.3) |
| 10 | Zero animation hotkeys | Full `mode:animation` + `surface:timeline` scope set (§12) |
| 11 | Joint chains rendered flat | Real tree, drag-reparent, cycle guard, 3D-pickable joints (§6.2, §9.3) |
| 12 | Solar tracking selects raw instance ids | Readable member labels everywhere (§6.4) |
| 13 | No scale fields in PoseEditor | Pose card has position/rotation/scale numerics (§8.3) |
| 14 | High-frequency atom fragility | Canvas dopesheet, leaf-only transport subscription (§5.8) |
| 16 | Two scrubbers, colliding float | ONE transport in the dock; FloatingPreviewToolbar deleted (§5.5) |
| 17 | Play-once only | Loop, speed 0.25–2×, pause-in-place, frame-step (§10.2) |
| 18 | Add-keyframe kills segment easing | **Exact bézier subdivision** — motion-identical split (§5.4) |
| 19 | Duration edits always rescale | Rescale / Keep-times choice (§8.2) |
| 20 | Export failures quiet | Per-clip blocker checklist, chips, tooltips (§11.1) |

---

## 1. Scope & vocabulary

Animation mode owns: clips (PartAnimation CRUD + settings + solar tracking), joints (tree,
membership, pivots), keyframes (dopesheet, retime, multi-select, clipboard), posing (gizmo +
numerics + working pivots), easing (per-channel, LOCKED #8), preview/transport, per-clip export
diagnostics, KSA clip import surfacing.

Terms used below (consistent with foundation §0.1 plus mode-local):
- **Clip** — one `PartAnimation` (UI word; "animation" in stores/types stays).
- **Column** — one `AnimationKeyframe` (a global time point; every joint has a pose entry).
- **Pin** — `$editKeyframeId`: the keyframe being pose-edited; parks the playhead and attaches
  the pose gizmo.
- **Park** — playhead deliberately held at a time (pose preview shown) without a pin.
- **Anchor** — the rest-anchor keyframe (`restKeyframeId`, default earliest/t=0): the column whose
  composed pose equals the modeled placements. Badged **⚓** everywhere.
- **Real pivot** — a joint's rest frame at `restAnchorTime` (KSA truth: the joint's rest position IS
  the rotation center). **Working pivot** — a throwaway posing anchor (LOCKED #8), never exported.

---

## 2. Shell integration — regions in Animation mode

Per foundation §2.1/§15.2. Entering via mode switcher segment `[▶ Animation]`, hotkey `2`,
palette "Go to Animation mode", or cross-mode jumps.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ File Edit Add Select View Tools Window Help   [⬚][▶Animation][☰][🚀][◧]  Rover-7 ▾  ↶ ↷  ⌘K │
├───────────────┬──────────────────────────────────────────────────────────┬───────────────────┤
│ LEFT: focus   │  VIEWPORT                                                │ RIGHT: navigator  │
│ editor (§8)   │   · pose gizmo (§9.2)      ┌──────────────────────┐      │  Clips (§6.1)     │
│  clip card /  │   · joint markers (§9.3)   │ ⠿ ◇Move ◆Rot ◇Scl ⧉▾ │      │  Joints (§6.2)    │
│  joint card / │   · real-pivot marker      └──────────────────────┘      │  Easing (§6.3)    │
│  keyframe card│   · working-pivot ◇         Tool bar (floating)          │  Solar (§6.4)     │
│               │   · motion trails (§9.5)                                 │  — or —           │
│               │   · membership tints (§7.6)                              │  Members view (§7)│
├───────────────┴──────────────────────────────────────────────────────────┴───────────────────┤
│ TIMELINE DOCK (§5) — full width, resizable 120px–50vh, collapsible to 32px transport strip   │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▶Anim │Layer: Hull ▾│ tool segment │ sel readout │ message… │ hints │↻Y 45°│⇅Y 0.1m│⧉│🔔    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Mode enter/exit choreography (owned by `modeStore.setMode`, foundation §2.4 — restated as this
area's contract):
- **Enter**: preview gating on; restore `$activeAnimationId`/`$activeJointId` (clamped); playhead
  initializes to `restAnchorTime(activeAnim)` (deploy imports open showing the modeled deployed
  pose — preview honesty); timeline dock mounts; no clips → right sidebar empty state (§6.1).
  If the current selection contains joint members, their joints' tree rows highlight (reveal).
- **Exit**: `$editKeyframeId = null`, stop playback, un-park (spring to modeled rest pose), detach
  PoseGizmo, hide joint markers + working pivot + trails, disarm `member-paint`/`pivot-pick`,
  close Members view, timeline unmounts. `$activeAnimationId/$activeJointId` survive for return.
- Selection survives the switch (cross-mode context: attach flows consume it).
- Mode switches never create undo steps.

---

## 3. Data model (document) — the one schema change

`PartAnimation`, `AnimationJoint`, `SolarTrackingSpec`, `restKeyframeId` semantics: **unchanged**
(`src/ksa/types.ts`). One change for LOCKED #8 per-channel easing:

```ts
// types.ts — v2
export type EasingChannel = 'position' | 'rotation' | 'scale';

/** Per-joint easing over the OUTGOING segment. Absent channel = linear.
 *  Uniform authoring writes the same config to all three channels; the UI
 *  renders "Uniform" when the three are structurally equal. */
export interface JointSegmentEasing {
  position?: EasingConfig;
  rotation?: EasingConfig;
  scale?: EasingConfig;
}

export interface AnimationKeyframe {
  id: string;
  timeSec: number;
  poses: Record<string, Transform>;
  easings?: Record<string, JointSegmentEasing>;   // was Record<string, EasingConfig>
}
```

- **Storage discipline preserved**: linear channels stored ABSENT; an all-absent
  `JointSegmentEasing` is dropped entirely; empty `easings` dropped — exports stay byte-identical
  for linear clips. `projectCodec` `CAnimation` gains per-channel sparse encoding
  (`e: {p?, r?, s?}` per joint). Schema version bumps; **no migration ever** — clean-slate
  projects per LOCKED #3, boot purge policy covers any stray v1 data.
- **Sampling** (`animationRig.sampleJointLocal`): three alphas instead of one —
  `posLerp(easePos(α))`, `slerp(easeRot(α))`, `scaleLerp(easeScale(α))`. Export baker is
  unaffected structurally (it densifies eased segments to LINEAR at `BAKE_FPS = 30` from the same
  sampler; a segment is "eased" when ANY channel is non-linear). Hemisphere matching, scale-channel
  -only-when-varying, identity Part root, hand-rolled GLB writer: untouched.
- **Import fitter** (`easingFit.ts`): extended to fit per channel (LOCKED #8) — same tolerances
  (4 mm pos, 2.5° rot), per-channel bézier fit against the dense samples; joints that don't fit
  any channel keep dense keys losslessly (existing fallback).
- **KSA contract restated verbatim (scope/animation.md — untouchable)**: channels target JOINT
  nodes only; movers are NON-animated leaves named exactly their instance id, statically offset
  `W_J(rest)⁻¹·placement`; exactly one parentless Part root at identity TRS; LINEAR samplers only;
  only `animations[0]` read; `<KeyframeAnimationModule Id>` + `<KeyframeAnimation Path Id>` +
  `ShowDeployRetract` ⇔ deployRetract + `<SolarTracking DegreesPerSecond SubPart>` +
  `<ExcludeSubPart>`; deterministic naming via `animModuleId`/`animGlbPath`; `restKeyframeId`
  flexo-internal, never serialized to KSA; KSA "XYZ" Euler ≡ three `'ZYX'`, all matrix math via
  `coords.ts`. **Connectors/kittens can never be joint members.**

---

## 4. Store design — `animationStore` v2 (all `src/state/`, zero react/three imports)

### 4.1 Ephemeral atoms (never persisted, never undo; clamped vs `$part` by `initAnimationStore`)

| Atom | Shape | Notes |
|---|---|---|
| `$activeAnimationId` | `string \| null` | kept |
| `$activeJointId` | `string \| null` | kept |
| `$editKeyframeId` | `string \| null` | the **pin** |
| `$playheadSec` | `number` | replaces `$animPreviewU` (seconds, not normalized); derived `$playheadU` computed for rig sampling. High-frequency — leaf subscriptions only (§5.8) |
| `$playheadParked` | `boolean` | park state (§10.1); false ⇒ playhead sits at anchor, no override |
| `$animScrubbing` | `boolean` | pointer currently dragging playhead |
| `$animPlaying` | `boolean` | rAF playback live |
| `$timelineSelection` | `string[]` | selected keyframe (column) ids, multi |
| `$animClipboard` | `{ columns: {dt: number; poses; easings?}[] } \| null` | keyframe clipboard, relative times; in-app, ephemeral |
| `$workingPivot` | `{ kind: 'centroid' \| 'subpart' \| 'point'; position: Vec3; sourceInstanceId?: string } \| null` | §9.4; cleared on joint/clip change, mode exit |
| `$pivotEditing` | `boolean` | explicit Pivot tool armed (§9.4) |
| `$membersView` | `{ open: boolean; targetJointId: string \| null }` | right-sidebar takeover (§7) |
| `$timelineView` | `{ startSec: number; pxPerSec: number }` | zoom/pan; re-fit on clip switch |
| `$jointTreeCollapsed` | `Record<string, boolean>` | tree disclosure |
| `$isPoseEditing` | computed | mode=animation ∧ clip ∧ joint ∧ pin — consumed by Tool bar (`$effectiveToolMode` display) |
| `$clipIssues` | computed `Record<animId, ClipIssue[]>` | §11.1 |

### 4.2 Persisted UI prefs (`@nanostores/persistent`)

| Key | Shape | Default |
|---|---|---|
| `flexo:animTransport` | `{ loop: boolean; speed: 0.25\|0.5\|1\|2; latched: boolean }` | `{loop:false, speed:1, latched:false}` |
| `flexo:animTrails` | `'selected' \| 'all' \| 'off'` | `'selected'` |

Timeline dock height/collapse live in `layoutStore.$layout.timeline` (foundation §1.1).

### 4.3 Actions (with undo enrollment — foundation invariant: discrete push internally, streaming push once at interaction start)

| Action | Undo | Notes |
|---|---|---|
| `addAnimation()` | discrete "add animation" | fresh clip: one rest keyframe at 0, auto-opened (kept) |
| `duplicateAnimation(id)` | discrete | NEW convenience: deep clone, fresh ids, "(copy)" suffix |
| `removeAnimation(id)` | discrete | confirm (whole-container, policy §14.3) |
| `renameAnimation`, `setAnimationMode` | discrete | kept |
| `setAnimationDuration(id, sec, mode: 'rescale' \| 'keepTimes')` | streaming | rescale = v1 proportional; keepTimes clamps ≥ last keyframe time (§8.2) |
| `setSolarTracking(id, spec)` | discrete | kept |
| `addJoint(parentId?)` | discrete | rest pose seeded at selection centroid (kept); `parentId` for "Add child joint" |
| `removeJoint` | discrete | children re-parented to grandparent, poses purged (kept) |
| `renameJoint` | discrete | kept |
| `setJointParent(jointId, parentId)` | discrete | cycle-guarded (kept); drives drag-reparent + Select |
| `attachToJoint(jointId, instanceIds)` | discrete "attach to <joint>" | exclusivity within clip kept (removes from other joints); non-SubPart ids rejected with skip count |
| `detachFromJoint(jointId, instanceIds)` | discrete | kept |
| `setJointPivot(jointId, target, {orientation})` | discrete | snap rest frame to ONE placement, "pos only" variant kept; **anchored at `restAnchorTime`** |
| `setJointPivotToCentroid(jointId)` | discrete | NEW: pos-only snap to multi-selection centroid |
| `setJointPivotPoint(jointId, worldPos)` | discrete | NEW: from `pivot-pick` surface click (pos only) |
| `moveJointPivot(jointId, delta)` | streaming | rigid relocate, geometry invariant at every t (kept; now keyed to anchor, not t=0) |
| `reorientJointPivot(jointId, quat)` | streaming | rebase via `rebaseJointToWorld` (kept) |
| `addKeyframe(animId, timeSec)` | discrete "add keyframe" | clamps (0, duration]; on-curve pose seed kept; **exact easing subdivision** (§5.4) replaces easing deletion; selects + pins result |
| `removeKeyframes(animId, ids[])` | discrete | refuses t=0 column and the anchor column (§5.6) |
| `setKeyframeTime(animId, kfId, t)` / `moveKeyframes(animId, ids[], dt)` | streaming | clamped (0, duration], t=0 immovable; continuous re-sort kept |
| `copyKeyframes(ids)` / `pasteKeyframesAtPlayhead()` | — / discrete "paste keys" | §5.7 |
| `setJointPose(animId, kfId, jointId, transform)` | streaming | kept; **routed to pivot ops when kfId is the anchor** (§9.4) |
| `setJointChannelEasing(animId, kfId, jointId, channel \| 'uniform', cfg)` | streaming | linear stored absent |
| `setSegmentEasingAllJoints(animId, kfId, easing)` | discrete | copies the full per-channel set (kept, upgraded) |
| `setRestAnchor(animId, kfId)` | discrete "re-anchor rest" | exposes `restKeyframeId` (§5.6); status flash + [Undo] |
| `selectKeyframeForEditing(kfId)` | — | pin: parks playhead at its time, attaches gizmo. **No auto tool pick** — the anchor special-case is replaced by pivot routing (§9.4) |
| `parkPlayhead(sec)` / `returnToRest()` | — | §10.1 |
| `playAnimationPreview()` / `pausePreview()` / `stopAnimationPreview()` | — | §10.2 |
| `setLoop/setSpeed/setLatched` | — | persisted prefs |
| `openMembersView(jointId?)` / `closeMembersView` | — | §7 |

`initAnimationStore` clamping extended to `$editKeyframeId ∈ keyframes`, `$membersView.target`,
`$timelineSelection`, `$workingPivot.sourceInstanceId` after undo/redo/project swap (kept pattern).

---

## 5. Timeline dock (LOCKED #5; foundation §9 — this section is the full spec)

### 5.1 Layout

Full-width row between workspace band and status bar. Default 220px tall, drag top edge
(clamp 120px–50vh), collapse ⌄ → 32px transport-only strip. `Window → Timeline` toggles.
Floating windows may overlap it (foundation §6.1).

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▶ ⏸ ⏹ │ ⟲ │ 1×▾ │ ⏮⚓ │ , . │ t [1.240] / 3.00 s │ ＋Key K │ 🔓 latch │ ↝ trails ▾ │    ⌄  │ ← TransportBar (32px)
├───────────────┬────────────────────────────────────────────────────────────────────────────┤
│ Deploy ▾ 2/4  │ 0s        0.5       1.0       1.5       2.0       2.5       3.0            │ ← ruler
│───────────────│────────────────────────────────────────────╥───────────────────────────────│
│ ∑ All joints  │ ◆─────────◆─────────────◆──────────────────║───────────────⚓◆             │ ← summary row
│ ▾ Root        │ ◇─────────◇─────────────◇──────────────────║───────────────⚓◇             │
│    HingeL (3) │ ◆─────────◆══easeInOut══◆──────────────────║────────────────◆             │ ← joint rows
│      TipL (1) │ ◇─────────◆─────────────◆∙∙∙per-chan∙∙∙────║────────────────◆             │   (indent mirrors tree)
│    HingeR (0)⚠│ ◇─────────◇─────────────◇──────────────────║────────────────◇             │
└───────────────┴────────────────────────────────────────────╨───────────────────────────────┘
        ↑ TrackHeaderColumn (resizable 100–280px, default 140)      ║ = playhead
```

- **TrackHeaderColumn**: top cell = active clip name (Select ▾ to switch clips without visiting
  the sidebar) + keyframe count. Rows mirror the right-sidebar joint tree **order + indent +
  collapse state** (`$jointTreeCollapsed` shared); row = name, member-count chip, ⚠ badge when
  0 members (export-relevant, §11.1). Click row = set `$activeJointId` (syncs tree + left card).
  Collapsing a parent collapses its child rows (summary diamonds on the parent row aggregate
  descendants, rendered hollow-stacked).
- **Summary row** (`∑`, sticky under ruler): one diamond per column. This is the truth surface for
  the global-column model (§5.2).
- Vertical scroll when joints overflow; header column and track area scroll-locked together.
  Ruler + summary row sticky.

### 5.2 Column model — design decision (global keyframes kept)

`AnimationKeyframe` columns are GLOBAL (every joint has a pose at every column). v2 **keeps this
model** (BRIEF: minimize business-feature refactors; the union-of-times pattern already supports
joints moving in sub-windows via holds + per-joint easing). The dopesheet still reads per-joint:

- **Solid diamond ◆** on a joint row at column k: the joint's pose *changes* there (differs from
  its pose at the previous column, or first column with any outgoing motion).
- **Hollow diamond ◇**: pass-through/hold (pose equal to neighbor within epsilon). Still clickable
  (selects the column, pins for this joint) and draggable (drags the column).
- Retiming any diamond retimes the **column** for all joints. The drag tooltip and status bar say
  so: `@1.20s → 1.35s · all joints`. This is the honest data model, made legible.
- Per-joint control WITHOUT per-joint times, via the diamond context menu (right-click / ⋮):
  - **Reset joint here to on-curve** — recomputes this joint's pose at the column from its
    neighboring segment (turns ◆ into ◇). Discrete undo "reset pose".
  - **Copy pose / Paste pose** — single-joint pose transfer between columns (discrete).
  - **Re-anchor here** (⚓, column-level — §5.6), **Delete keyframe** (column-level).

### 5.3 Pointer interactions (desktop)

| Gesture | Target | Result |
|---|---|---|
| click | ruler or empty track | **park** playhead at that time (§10.1); clears pin |
| drag | ruler or empty track | scrub (spring/latch semantics §10.3) |
| click | diamond | select column (replace) + **pin** it (playhead parks at its time, gizmo attaches for `$activeJointId`; clicking a diamond on a joint row also sets that joint active) |
| ⌘-click | diamond | toggle column in `$timelineSelection` (pin unchanged) |
| ⇧-click | diamond | grow-only range from nearest selected column (list convention, `useShiftRangeSelect` semantics) |
| ⇧-drag | empty track area | **marquee** over diamonds → additive column selection (mirrors viewport marquee modifier; plain drag stays scrub) |
| drag | diamond | retime (streaming; one undo push at drag start "retime keyframe"). If the diamond is in `$timelineSelection` with others, all selected columns move by Δt (relative offsets kept). Default snap: adaptive ruler minor-tick grid; **hold ⌃: snap to other keyframes + playhead + clip start/end** (foundation §9); t=0 column immovable (drag refuses with shake + status note) |
| double-click | empty track | **insert keyframe at that time** (§5.4) |
| double-click | segment span between two diamonds (joint row) | select left column + pin + focus the left-sidebar Easing card for that joint/segment |
| click | segment span | select left column + pin (playhead moves there) |
| right-click | diamond / segment / track | context menu (§5.2 items; segment adds "Easing ▸ presets / Edit…", "Copy easing", "Paste easing") |
| drag | top edge of dock | resize dock height (layoutStore, live) |
| drag | TrackHeaderColumn right edge | resize header column |

Diamond hit targets ≥ 12×12px regardless of zoom; overlapping diamonds at high zoom-out render a
count pill `◆3` and click zooms into the cluster.

### 5.4 Inserting keyframes — and the exact-easing-split fix

`K` (mode scope), transport **＋Key**, double-click track, palette "Insert keyframe at playhead".
All call `addKeyframe(activeAnim, $playheadSec)`:
- Time clamped (0, duration]; if a column already exists within 1 ms → no-op, select + pin it,
  status: "Keyframe already at 1.20s — selected".
- Every joint's pose seeded **on-curve** at that time (kept invariant — inserting never changes
  the motion).
- **v2 fix for pain 18**: instead of deleting the preceding column's easing, the incoming
  segment's easing is **subdivided exactly**: for each joint and channel, split the cubic-bézier
  time-warp at the insertion parameter by De Casteljau, renormalize both halves to the unit
  square. Because position/scale lerp is affine and quaternion slerp along one geodesic satisfies
  `slerp(q0, slerp(q0,q1,ys), y′) = slerp(q0, q1, y′·ys)`, the composed motion is **identical**
  before and after the split (unit-tested against dense samples). Result: inserting a key is
  always motion-neutral — no warning needed, no easing lost. Split halves that resolve to a
  preset render as that preset; otherwise "Custom curve".
- New column selected + pinned; status flash "Keyframe added @1.20s".

### 5.5 TransportBar (single home for playback — FloatingPreviewToolbar and the inline
PreviewScrubber are deleted; foundation §6.3 death list)

Contents left→right (all `xs` controls):
1. **▶/⏸** play/pause (`Space`). Play starts from the parked/pinned playhead; from rest (un-parked)
   it starts at 0. Pause = pause-in-place (parks at the pause time).
2. **⏹** stop — stop playback AND return to rest (⚓); hidden when not playing and not parked.
3. **⟲ loop** toggle (persisted).
4. **Speed** menu `0.25× / 0.5× / 1× / 2×` (persisted).
5. **⏮⚓ "to rest"** — return playhead to `restAnchorTime`, clear park + pin (the explicit
   spring). Tooltip: "Show the modeled pose (rest anchor)".
6. **, / .** prev / next keyframe — parks + pins the neighboring column (wraps: no).
7. **Time readout** `t [1.240] / 3.00 s` — the current time is a `useNumberDraft` numeric field
   (`inputMode="url"`, mono, tabular-nums); typing parks the playhead at the entered time.
   Duration is a read-only label here (edited in the clip card §8.2).
8. **＋Key (K)** button.
9. **🔓/🔒 latch** toggle (persisted) — §10.3.
10. **↝ trails ▾** — Motion Trails mini-menu (Selected / All / Off), mirrors View ▸ Motion Trails
    (§9.5; S15 mirror-chip precedent).
11. Right edge: **⌄ collapse** (dock → 32px strip; strip = TransportBar only, keyframe area hidden).
12. **State chip** (between 7 and 8, flex): `● pinned @1.20s` / `parked @1.42s` / `rest ⚓` /
    `▶ 0.86s` — the always-visible answer to "why does the scene look like this". Replaces v1's
    PreviewProgressLabel. Amber tint while a posed preview locks placement gizmos (§9.6).

### 5.6 Rest anchor — `restKeyframeId` exposed (decision: YES, fully surfaced)

- The anchor column's diamonds carry the **⚓ badge** (summary row + joint rows). Tooltip:
  "Rest anchor — this pose equals the modeled placements. Preview and export are anchored here."
- Context menu on any OTHER column: **"Re-anchor here"** → `setRestAnchor` (discrete undo).
  Status flash: "Rest anchor moved to @2.00s — this keyframe now matches the modeled placements
  [Undo]". No confirm (fully undoable, single document field).
- Keyframe card (§8.4) shows an `⚓ Rest anchor` chip or a "Re-anchor here" button.
- **Protections**: the anchor column and the t=0 column are undeletable (delete refuses with
  status: "This keyframe is the rest anchor — re-anchor another keyframe first" / "The first
  keyframe pins the clip start"); t=0 is unmovable (kept invariant). The anchor column IS
  retimeable when it isn't t=0 (retiming doesn't change which pose is the anchor).
- Hand-authoring deploy-style clips is now a first-class flow: author stowed→deployed, model the
  part deployed, re-anchor at the last keyframe — exactly what the importer does automatically.

### 5.7 Keyframe multi-select clipboard

While the timeline has focus (`surface:timeline` scope — overrides the viewport clipboard):
- `⌘C` copy selected columns → `$animClipboard` (times normalized to first = 0, full poses +
  easings). `⌘X` = copy + delete (respecting §5.6 protections; protected columns skipped with
  status count). `⌫` delete selected (≤5 columns: no confirm + status [Undo]; >5: confirm strip
  in the dock: "Delete 8 keyframes? [Delete] [Cancel]" — policy §14.3).
- `⌘V` paste at playhead: first column lands at `$playheadSec`, others keep relative offsets;
  times clamped to (0, duration] (overflow clamps to duration with status note); a pasted column
  colliding with an existing one (< 1 ms) **replaces that column's poses/easings**. Joint ids
  matched by id; poses for joints that no longer exist are dropped; joints missing from the
  clipboard keep on-curve seeds. One undo step "paste keys". Pasting across clips is allowed
  (same rules) — the clipboard survives clip switches within the session.
- `⌘A` select all columns; `⌥⌘A` deselect.

### 5.8 Rendering & perf (the PreviewProgressLabel lesson, binding)

- The ruler + summary + tracks area is **one 2D `<canvas>`** (`DopeSheetCanvas`), imperatively
  redrawn on: `$part` animation slice change, `$timelineView`, `$timelineSelection`,
  `$activeJointId`, `$jointTreeCollapsed`, size changes — and on `$playheadSec` via a direct
  store subscription that repaints ONLY the playhead layer (two stacked canvases: static keys
  layer + dynamic playhead/scrub layer).
- React renders only: TransportBar (leaf components subscribe `$playheadSec` for the readout/state
  chip), TrackHeaderColumn (list), collapse/resize chrome. No wide tree ever subscribes
  `$playheadSec`.
- Playback rAF lives in the store action (as today); every tick writes `$playheadSec` →
  EditorScene invalidates via its existing `sub()` path (on-demand loop preserved; playback
  and scrubbing are the invalidation sources, foundation §14.5).
- Hit-testing is done in canvas coordinates by `DopeSheetCanvas` (diamond index built per draw).
  Accessibility fallback: every column is also reachable via the keyframe list in the left
  keyframe card and `,`/`.` stepping — canvas is not the only path.

### 5.9 Timeline zoom / pan

- `⌘wheel` / pinch: zoom `pxPerSec` about the cursor time (clamp 20–2000 px/s).
- wheel-x / ⇧wheel / middle-drag: pan `startSec` (clamped to [-10% clip, +110%]).
- `surface:timeline` keys: `=`/`-` zoom in/out about playhead; `F` fit clip; `⇧F` fit selected
  columns (mnemonic parity with viewport Frame Selection — different scope, no conflict).
- Clip switch → auto-fit. Zoom state ephemeral.

### 5.10 Empty states

- **No clip**: dock body shows "No animation clips — create one to start" + [＋ Animation]
  button (creates + opens). Transport disabled except the button.
- **Clip with 1 keyframe (rest only)**: tracks render the single ⚓ column + inline hint
  "Move the playhead, pose a joint, then press K — or double-click a track to add a keyframe."
- **Clip with joints but 0 members**: header rows show ⚠; hint row under summary:
  "Joints need members to animate — open Members (§7)". Click → `openMembersView()`.

---

## 6. Right sidebar — the mode navigator (LOCKED #5: clips + joint tree + easing)

Slim mode header: `▶ Animation` + header actions: `[＋ Clip]` `[Members…]`. Body =
`SidebarSection`s (dense, sticky headers). When the Members view is open it REPLACES this body
(§7). Empty state (no clips): icon + "Animate parts by attaching SubParts to joints and posing
them over a timeline." + [＋ Animation] + [Import a built-in Part…] (opens the Part browser —
imported parts bring editable clips).

### 6.1 CLIPS section

```
CLIPS (2)                                   ＋
──────────────────────────────────────────────
● Deploy            2.0s  deploy   ⚓end     ⋮
○ Antenna Sweep     3.5s  actuate  (draft)  ⋮
```

- Row: active dot (radio — the open clip), name (double-click = inline rename, Enter/Esc),
  duration chip, mode chip (`actuate`/`deploy`), **draft chip** when not exportable — tooltip is
  the per-clip blocker checklist (§11.1); `⚓end` micro-chip when the anchor is not t=0 (deploy
  imports) — tooltip explains modeled-deployed anchoring.
- Click row = open clip (`$activeAnimationId`; playhead → its anchor). Re-click does NOT close
  (a clip is always open while the mode has clips; v1's "re-click closes" is retired — closing a
  clip meant "stop preview", which the transport now owns. Esc/⏹ covers it).
- Row ⋮ menu: Rename · Duplicate clip · Re-anchor… (submenu listing keyframes, radio on current
  anchor) · Export status (disabled info row: "exports as `<animGlbPath>`" or "draft — N
  blockers") · Delete… (confirm: "Delete clip 'Deploy'? 2 joints, 5 keyframes. [Delete]
  [Cancel]" — whole-container per policy).
- ＋ creates a clip (discrete undo) and opens it.

### 6.2 JOINTS section — a real tree

```
JOINTS (3)                     ＋ joint  Members…
──────────────────────────────────────────────
▾ ⌖ Root            (0) ⚠                    ⋮
    ⌖ HingeL        (3)  [Attach 2 sel]      ⋮
       ⌖ TipL       (1)                      ⋮
    ⌖ HingeR        (0) ⚠                    ⋮
```

- Rows indented by `parentJointId` chains; caret collapses subtrees (state shared with the
  timeline header column). Member-count chip; ⚠ when 0 members (tooltip: "No members — this
  joint won't export").
- **Selection**: click row = `$activeJointId` (crosshair highlight; timeline row highlights;
  left card focuses the joint; viewport marker enlarges). The active joint row shows the inline
  `[Attach N sel]` button whenever the viewport selection contains ≥1 SubPart (count = eligible
  SubParts only; ineligible kinds noted in the status flash on use, §7.5).
- **Drag-to-reparent**: row grip (⠿ on hover) drags; drop ON another joint row = become its
  child; drop on the section header ("JOINTS") = become root. **Cycle guard**: while dragging,
  own-descendant drop targets render disabled (no-drop cursor) and drop is refused with status
  "Can't parent a joint under its own descendant" — same rule as `setJointParent`. Reorder among
  siblings by dropping between rows (document order = timeline row order).
- Inline rename: double-click name.
- Row ⋮ menu: Rename · Add child joint · Re-parent ▸ (searchable list — a11y/phone fallback for
  drag) · Select members (selects the member SubParts in the viewport + reveals) · Attach
  selected (N) · Members… (opens §7 targeted at this joint) · Set pivot ▸ (to selection / pos
  only / centroid / pick in 3D…) · Detach all… (confirm when >5 members) · Delete joint…
  (confirm; states "children re-parent to <parent>, poses removed").
- ＋ joint: adds a root joint seeded at the selection centroid (kept), selects it, and — when the
  viewport selection is non-empty — status hint: "Joint added · [Attach 2 selected]" with an
  inline action.

### 6.3 EASING section (overview; the editor lives in the left card §8.3)

For the pinned column's outgoing segment and active joint:

```
EASING — HingeL @1.20→2.00s
 Position   easeInOut        ✎
 Rotation   custom curve     ✎
 Scale      linear (—)       ✎
 [Uniform: mixed]  [Apply to all joints]
```

- Three channel rows: preset name or "custom curve" or "linear (—)"; ✎ focuses the left Easing
  card on that channel. "Uniform" chip states `linear`/preset when all three equal, else "mixed".
- **Apply to all joints** = `setSegmentEasingAllJoints` (kept, now copies the per-channel set).
- Empty states: no pin → "Select a keyframe to edit its outgoing easing"; last column → "Final
  keyframe — no outgoing segment" (kept semantic: easing ignored on the final keyframe).

### 6.4 SOLAR TRACKING section

Enabled only when the clip mode is Deploy/Retract (otherwise the section shows: "Solar tracking
requires Deploy/Retract mode" + [Switch mode] inline action).

Fields (all existing semantics kept, labels fixed — pain 12):
- Switch **"Sun tracking (solar panel)"** — toggles `solarTracking` null ↔ spec.
- Select **"Rotates to track"** — choices = union of all joints' `memberInstanceIds`, rendered as
  `panel_a_1 · SolarPanelA · → HingeL` (instance id mono + template caption + owning-joint chip).
  Searchable.
- **"°/s"** NumberField (`degreesPerSecond`).
- **"Stays fixed (doesn't track)"** — per-member Switch list (exclude list), same readable labels.
- Validation chip when the tracked member id no longer exists (dangling ref): amber "target
  missing — re-pick" (§11.1 warning).

---

## 7. MEMBERS VIEW — joint membership, the flagship fix

A **docked, NON-modal right-sidebar takeover** in Animation mode (see deviation D1, §16): while
open it replaces the navigator body; the viewport stays fully interactive (required for member
painting and live highlight). It renders the shared `SubPartSetGrid` component — the same guts
foundation §10.11's SubPart Set Picker dialog uses for any future pick-a-set need.

Entry points: right header `[Members…]`, joint-tree row ⋮ → Members…, left joint card
`[Choose members…]`, timeline ⚠ hint, palette "Edit joint members". Opening with no joints
prompts inline: "Create a joint first — [＋ Joint]".

### 7.1 Layout

```
‹ Joints   MEMBERS                               ✕
──────────────────────────────────────────────────
Target joint  [⌖ HingeL          ▾]  (＋ new joint)
🔍 [fuzzy search…            ]  [All|Unassigned|This joint|Other]
[🖌 Paint in 3D]                       3/12 → HingeL
──────────────────────────────────────────────────
▾ Hull (8)                    2 assigned   👁  [□ all]
  ☑ panel_a_1     SolarPanelA        → HingeL
  ☑ panel_a_2     SolarPanelA        → HingeL
  ☐ strut_1       StrutS             → HingeR
  ☐ tank_2        TankB              —
▸ Wings (4) — hidden          1 assigned   👁̶  [□ all]
▾ Dish Mesh (3)               0 assigned   👁  [□ all]
  ☐ dish_1        Dish  ⚠ also in "Sweep"     —
──────────────────────────────────────────────────
▸ Not animatable (5) — connectors, kittens…   ⓘ
──────────────────────────────────────────────────
[Assign 2 → HingeL]   [Unassign 1]        [Done]
```

### 7.2 Header

- **Back chevron** `‹ Joints` and `✕`/`[Done]` both close the view (restore navigator).
- **Target joint** — searchable Select rendering the tree indented; switching targets keeps the
  view, search, filters and checked set **intact** — a multi-joint rig (landing legs, bay doors)
  is rigged in ONE session (kills pain 2's N round-trips). `(＋ new joint)` creates a joint
  (centroid-seeded) and targets it without leaving.
- **Fuzzy search** (subsequence match — foundation §8 upgrade) over instance id + template id +
  template caption + layer name.
- **Filter chips** (radio): All · Unassigned · This joint · Other joints.
- **🖌 Paint in 3D** toggle — arms the `member-paint` tool (§7.4).
- Live count `3/12 → HingeL` = checked / visible rows, target chip.

### 7.3 Body — layer-sectioned GridList (fixes MeshPickerModal's layer-blindness)

- One section per layer that contains SubParts, in layer display order; **unlisted** layers
  included here (the picker must see everything — unlike the Build Outliner). Section header:
  collapse caret · layer name · row count · "N assigned" chip · **👁 eye** (toggles the REAL
  `$layerView` visibility so the viewport matches what you're picking — view state, no undo) ·
  `[□ all]` tri-state checkbox (checks every enabled row in the section).
- Rows (GridList, multi-select = the checked set): checkbox · instance id (mono) · template
  caption · **ownership chip**: `→ HingeL` (accent when = target, neutral for other joints, `—`
  when unassigned) · amber `⚠ also in "<clip>"` chip when the SubPart is a member in ANOTHER
  clip (multi-clip conflict warning — KSA modules would fight over its transform; §11.1).
- Row states honoring `$layerView` (foundation §10.11): **locked layer** → row disabled,
  tooltip "Layer is locked"; **hidden layer** → row dimmed 40% but assignable (animating
  currently-hidden geometry is legitimate — the section eye un-hides in one click).
- Gestures: click row = toggle its checkbox; ⇧-click grow-only range; ⌘A checks all enabled
  visible rows; ⌘-click = plain toggle (same as click — checkboxes are the model). The view
  registers the list-focus edit-chord mirrors at `surface:members` (foundation §11.1) so the
  entity-selection edit chords (`⌘C ⌘X ⌘V ⌘D ⌫ ⇧⌘I`) keep working while it has focus; its
  own ⌘A (check-all) keeps precedence over the viewport ⌘A.
- **Live viewport linkage**: hovering a row pulses that placement's highlight; checked rows get a
  persistent selection-tint; assigned-to-target members always render the accent outline while
  the view is open (§7.6). Rows scroll-into-view when their mesh is clicked in paint mode.
  **Touch equivalent** (no hover — LOCKED #6): toggling a row's checkbox flashes that
  placement's highlight (~600 ms) so the which-placement-is-which information survives, and a
  **long-press on a row pulses the placement without toggling** (the hover-preview gesture).
- Empty search result: "No SubParts match — clear filters?" [Clear].

### 7.4 Member painting (click-in-viewport)

Arming **🖌 Paint in 3D** sets `$activeTool = 'member-paint'` (single-slot tool, Animation-only;
deviation D2):
- Viewport clicks resolve to SubPart placements only (same raycast guards as selection: locked
  layers refused with status note, hidden layers not pickable — un-hide via the section eyes).
- Click semantics: unassigned → **assign to target**; assigned-to-target → **unassign**;
  assigned to another joint → **reassign to target** (status: "panel_b_1: HingeR → HingeL").
  Each click = one discrete undo step ("attach panel_b_1 → HingeL") — undo peels click-by-click.
- Clicking a connector/kitten/collider/seat/light: nothing changes; status flash explains
  (§7.5). Clicking empty space: nothing (no deselect surprise while painting).
- Cursor: brush; the status-bar tool segment reads
  `Paint members → HingeL · click SubParts to toggle · Esc done`.
- Normal selection, gizmo picking and orbit are suspended while painting (tool-slot pick
  suppression — same contract as measure). Esc disarms (ladder rung 5); toggling the button or
  closing the Members view disarms; mode switch cancels (tool table rule).
- Painting works with the Members view visible (rows flash as they change) AND on phone with the
  sheet dismissed (§14).

### 7.5 Ineligibility presentation (connectors/kittens — KSA limitation, constitution)

- The body lists **SubParts only**. A collapsed bottom section **"Not animatable (N)"** lists the
  part's connectors, kittens, colliders, seats and lights disabled-style with an ⓘ header
  popover: *"KSA can only animate SubParts parented under joints. Connectors and kittens always
  stay static — for a connector on a moving panel, author the part in its deployed pose
  instead."* (deployed-pose workaround per census). Rows are inert (no checkbox).
- Everywhere an attach acts on a mixed selection ("Attach N selected", paste-into-members,
  paint): SubParts attach, others are skipped with a status flash:
  "Attached 3 SubParts — 1 connector skipped (KSA can't animate connectors)".
- SubPart-owned colliders/lights are not members themselves but follow their owner's posed frame
  in preview (kept invariant) — the ⓘ popover notes this ("owned colliders and lights ride
  along automatically").

### 7.6 Membership tints (viewport, while Members view open or painting)

Overlay tint pass (EditorScene flag `membershipViz`): target-joint members = accent outline;
other-joint members (same clip) = neutral blue outline; unassigned = none; hovered row's mesh =
pulse. Cleared when the view closes. Uses the existing selection-highlight pipeline (no new
continuous rendering; invalidate on state change only).

---

## 8. Left sidebar — the focus editor (LOCKED #5: selected joint/keyframe details)

Focus resolution (foundation §7 stack): tool parameter card (paint/pivot-pick status) → focus
card by `(clip, joint, pin, timelineSelection)`:

| Focus state | Card |
|---|---|
| no clip | mode cheat-card: one line ("Attach SubParts to joints, pose them on the timeline"), hotkeys (Space, K, `,`/`.`, B?, Esc), [＋ Animation] |
| clip, no joint | **Clip card** (§8.2) |
| joint active (± pin) | **Joint card** (§8.3) — the workhorse |
| column selected in timeline, no joint active | **Keyframe card** (§8.4) |

Header row: focus title (clip name / joint name / "Keyframe @1.20s") + ⋮ overflow carrying the
focus object's commands (same items as its right-sidebar row menu). All numerics
`useNumberDraft` + `inputMode="url"`; streaming undo via `onInteractionStart` (constitution).

### 8.2 Clip card

```
CLIP: Deploy                                  ⋮
──────────────────────────────────────────────
Name      [Deploy               ]
Mode      [Deploy / Retract   ▾]   (Actuate = 0→1 slider)
Duration  [2.00] s   ( ◉ Rescale keys  ○ Keep times )
Rest anchor   ⚓ @2.00s (final keyframe)   [change ▾]
──────────────────────────────────────────────
EXPORT
 ✓ has joint with members
 ✓ ≥ 2 keyframes
 ✓ duration > 0
 → exports as  flexo_rover_deploy_a1b2_Anim.glb
──────────────────────────────────────────────
SOLAR TRACKING   tracking ON · panel_a_1 · 5°/s  →
```

- **Mode** select: "Actuate (0→1 slider)" / "Deploy / Retract" (`ShowDeployRetract`); switching
  away from Deploy with solar tracking set warns inline: "Solar tracking requires
  Deploy/Retract — it will be kept but won't export" (spec preserved, exporter already gates).
- **Duration**: NumberField (streaming, undo at focus) + behavior radio: **Rescale keys**
  (v1 proportional rescale, default) / **Keep times** (tail extends/shrinks; input clamps to
  ≥ last keyframe time with a note "min 2.00s — last keyframe"). The radio is an ephemeral
  editing preference (persisted `flexo:animTransport`? no — it rides `flexo:animDurationMode`,
  tiny persisted pref).
- **Rest anchor** row: current anchor chip + `[change ▾]` menu of keyframes (radio) →
  `setRestAnchor`.
- **EXPORT** checklist: live `computeClipIssues` (§11.1) with ✓/✗ rows; failing rows are links
  (✗ "has joint with members" → opens Members view).
- **SOLAR TRACKING** summary row → focuses the right section.

### 8.3 Joint card (with pin — the posing cockpit)

```
JOINT: HingeL                                 ⋮
──────────────────────────────────────────────
Name    [HingeL        ]   Parent [Root     ▾]
──────────────────────────────────────────────
MEMBERS (3)                      [Choose members…]
  panel_a_1   SolarPanelA · Hull            ✕
  panel_a_2   SolarPanelA · Hull            ✕
  strut_3     StrutS · Hull                 ✕
  [Attach 2 selected]
──────────────────────────────────────────────
PIVOT  (rest frame ⚓ @2.00s)
  [⊕ Edit pivot]        ← explicit tool toggle (§9.4)
  Set to: [selection] [pos only] [centroid] [pick in 3D…]
──────────────────────────────────────────────
POSE @ 1.20s                       ● pinned
  Position (m)   X[0.000] Y[0.412] Z[0.000]
  Rotation (°)   X[0]     Y[85.0]  Z[0]
  Scale (×)      X[1]     Y[1]     Z[1]
──────────────────────────────────────────────
WORKING PIVOT                         (none)
  [Selection centroid] [Picked subpart ▾] [Pick point…] [Clear]
──────────────────────────────────────────────
EASING → next @2.00s     [Uniform|Pos|Rot|Scale]
  Preset [easeInOut ▾]        [Apply to all joints]
  ┌──────────────┐
  │  ╭──●        │   2-handle cubic-bézier editor
  │ ●╯           │   (x∈[0,1], y free −0.5…1.5)
  └──────────────┘
```

- **Parent** searchable Select ("Root (Part)" / "under X") — kept as the a11y/phone alternative
  to drag-reparent; cycle-guarded options disabled.
- **MEMBERS**: rows show instance id + template caption + layer; row click selects that placement
  in the viewport (reveal); ✕ = detach (discrete). `[Attach N selected]` (eligible-SubPart count).
  `[Choose members…]` opens the Members view targeted here.
- **PIVOT** (§9.4 for tool semantics): label states the anchor time explicitly — the marker,
  the tool and all snap actions operate at `restAnchorTime` (the §4.6 fix). Set-to buttons:
  **selection** (exactly one placement selected; position+orientation — `setJointPivot`),
  **pos only** (orientation kept — kept feature), **centroid** (≥1 selected; pos-only — new),
  **pick in 3D…** (arms `pivot-pick`: one click on any mesh surface sets pivot position
  pos-only; Esc cancels; status segment guides).
- **POSE @t**: appears when pinned. Position/Rotation/Scale numerics (scale closes census gap
  13), streaming `setJointPose`, one undo per typing session. Live-mirrors gizmo drags.
  **When the pinned column is the anchor**, this card swaps to **PIVOT @rest**: the same three
  groups relabeled "Pivot position (m) / Pivot orientation (°)" (scale hidden — pivots stay
  unit-scaled, kept invariant), routed through `moveJointPivot`/`reorientJointPivot`
  (compensated, geometry-invariant) — closing the v1 trap where numeric editing at rest skewed
  the whole clip uncompensated. An inline note reads: "Rest anchor — the pose here equals the
  modeled placements; these fields move the pivot."
- **WORKING PIVOT** (§9.4): current state chip (`none` / `centroid` / `panel_a_1` / `point
  (1.2, 0.4, 0.0)`); setters + Clear.
- **EASING**: channel tabs — **Uniform** edits all three together (shows "Mixed" + a
  [Make uniform] action when channels differ; editing from Uniform overwrites all three);
  Pos/Rot/Scale tabs edit one channel. Per tab: 10-preset dropdown + the existing 2-handle
  bézier SVG (drag = streaming, undo push on `onEditStart` — all v1 curve semantics verbatim:
  x clamped [0,1] monotonic, y free [-0.5,1.5] overshoot/anticipation, "Custom curve" label when
  off-preset, linear stored absent). `[Apply to all joints]` kept (copies per-channel set).
  Hidden on the final column ("no outgoing segment").

### 8.4 Keyframe card (timeline column selected, no joint active)

```
KEYFRAME @ [1.200] s          ⚓? / [Re-anchor here]
──────────────────────────────────────────────
Moves at this key:
  HingeL   pos rot          [easing: easeInOut]
  TipL     rot              [easing: —]
  HingeR   (hold)
──────────────────────────────────────────────
[Delete keyframe]     [Copy]      [Paste pose set]
```

- Time = NumberField (streaming retime; t=0 read-only with note).
- Per-joint summary rows: changed-channel chips (pos/rot/scale) or "(hold)"; clicking a row sets
  `$activeJointId` (jumps to the Joint card pinned here). Easing chips → Joint card easing.
- Anchor chip / Re-anchor button; Delete (respects protections); Copy/Paste wire to §5.7 (single
  column).
- With multi-column `$timelineSelection`: header "N keyframes selected", times list, bulk
  [Delete N…] [Copy] — the timeline is the primary multi surface; this card mirrors it.

---

## 9. Viewport — animation affordances

### 9.1 Affordance flags (set by `modeStore.setMode` → EditorScene)

`poseGizmo`, `jointMarkers`, `pivotMarker` (real pivot), `workingPivotMarker`, `trajectories`,
`membershipViz` (§7.6). All off outside Animation mode (kept: anim atoms persist across modes
but render nothing — `$inspectorMode` subscription re-pointed at `$mode`).

### 9.2 `PoseGizmo` — the animation-specific pose gizmo (LOCKED #8; replaces reused
TransformControls for posing; TransformControls remains for Build/Engine)

Attached when `$isPoseEditing` (clip + joint + pin) at the joint's world frame at the pinned
time — or at the **working pivot** when set. Tool follows `$effectiveToolMode` (Tool bar window
displays/edits it; `T`/`⇧T` cycles):

- **Rotate** (the default posing tool): three orientation rings **sized to the joint** — ring
  radius = bounding-sphere radius of the member set at the pinned time (clamped 0.3–3 m world,
  24–160 px screen) so the rings wrap the geometry they move; plus an outer screen-space ring
  (camera-plane rotate). Drag any ring = streaming `setJointPose` (or pivot reorient at anchor);
  when a working pivot is set the rotation is computed about it
  (`ΔW = T(p)·R·T(p)⁻¹ · W_joint`) and written back as the joint pose.
- **Move**: central **free-drag disc** — dragging translates in the camera plane (multi-axis in
  one gesture, LOCKED) — plus three axis stems for constrained moves. Working pivot does not
  affect translation (pivot-independent).
- **Scale**: three axis handles + center uniform handle (parity: scale posing existed via gizmo).
  Disabled at the anchor column (pivots stay unit-scaled — status tooltip explains).
- **Per-gesture axis locking** (LOCKED): while dragging, tap `X`/`Y`/`Z` → lock the gesture to
  that joint-LOCAL axis; tap the same letter again → the WORLD axis; third tap → unlock.
  The status-bar modifier-hint segment live-shows `X/Y/Z lock axis` during pose drags; the locked
  axis renders as a full-length colored guide line (axis colors X red / Y green / Z blue —
  convention). Lock state resets at drag end.
- **Snapping**: the global snap chip applies — rotate snaps at `$snapRotateStep`, translate at
  `$snapTranslateStep`; ⌃ held = temporary opposite (LOCKED #7 conventions).
- Undo: ONE push at drag start (label 'pose' / 'move pivot' / 'reorient pivot'), streaming after
  (kept contract). Esc mid-drag cancels the drag (ladder rung 4).
- Orbit disabled during drag; picking suppressed (kept).
- Numeric mirror: Joint card POSE fields update live.

### 9.3 Joint markers — 3D-pickable joints

Every joint of the open clip renders a pivot glyph at its **rest frame at `restAnchorTime`**
(the §4.6 fix — markers now sit on the modeled geometry for imported deploy clips):
- Inactive joints: small screen-space octahedron (10 px, fg-muted) — **pickable**: click =
  `$activeJointId` (SelectionManager gains kind `'joint'`; priority above subpart picks within
  12 px, below nozzle handles' rule precedent). Hover = accent tint + name tooltip (CSS2D).
- Active joint: tri-axis marker (upgraded AxesHelper, 0.4 u, axis-colored) + name label.
- While `$pivotEditing`: the active marker swaps to the Pivot tool's handle set (§9.4).
- Hidden while `member-paint` armed (clicks belong to painting).

### 9.4 Pivot editing — an explicit tool anchored on `restAnchorTime` (fix for pain 6)

The v1 magic ("t=0 keyframe + auto tool pick ⇒ gizmo edits the pivot") is replaced by ONE
explicit, always-anchored mechanism:

- **`⊕ Edit pivot` toggle** (Joint card; also palette "Edit joint pivot", and the pose-gizmo
  context: right-click active marker → "Edit pivot"). Arming it:
  1. Parks + pins the playhead at `restAnchorTime` (the only frame where pivot edits are
     well-defined).
  2. Swaps PoseGizmo to **pivot mode** — visually distinct (amber handles): Move = `moveJointPivot`
     (rigid relocate; geometry unchanged at every t — live tooltip "moving the hinge, not the
     pose"), Rotate = `reorientJointPivot` (rebase, rest geometry preserved), Scale absent.
  3. Status tool segment: `Edit pivot — HingeL · drag to relocate the hinge · Esc done`.
- Exiting (toggle off / Esc rung 5 / selecting another joint keeps it? NO — joint switch keeps
  the tool armed for the new joint, deliberate for rigging several hinges; clip switch and mode
  exit disarm).
- **Anchor-column routing** (belt-and-braces): even WITHOUT the explicit tool, a pose-gizmo drag
  while the pinned column is the anchor routes Move→`moveJointPivot`, Rotate→`reorientJointPivot`
  (there is no meaningful "pose" at the anchor). The state chip shows `● pinned @⚓ (pivot)`.
  This preserves v1's quick workflow while making it consistent: **anchor time, not t=0** —
  on an imported deploy clip the pivot edits now happen at the final (modeled) keyframe and the
  marker sits on the modeled geometry. Selecting t=0 on such a clip simply pose-edits the stowed
  keyframe like any other (v1's silent-rebase trap is gone).
- Numeric path: §8.3 POSE-card swap at anchor (compensated pivot fields).
- Snap actions (`Set to selection` / pos-only / centroid / pick) are one-shot discrete ops —
  usable with or without the tool armed.

### 9.5 Motion trajectories (LOCKED #8 — read-only visualization)

- Per animated joint (≥1 member, pose varies): a 3D polyline of the **member-set centroid** path
  over [0, duration] (shows swing arcs for pure hinges, where the joint origin wouldn't move),
  sampled adaptively (~64 samples/segment, eased); plus a fainter joint-origin path when the
  origin itself translates.
- **Keyframe ticks**: small diamonds on the curve at column times (⚓ tick ringed). **Scrub
  highlight**: a bead slides along the curve at `$playheadSec` (subscribes the playhead atom
  imperatively in the three layer — no React).
- Display mode `flexo:animTrails` = Selected (active joint full-opacity; default) / All (active
  full, others 40%) / Off. Homes: **View ▸ Motion Trails ▸** (radio; disabled outside Animation
  mode) + transport `↝` mirror menu (§5.5).
- Strictly read-only (no dragging ticks — LOCKED wording); recomputed on document change only;
  invalidates the on-demand loop, never forces continuous rendering.

### 9.6 Posed-preview gizmo detach — now with feedback (fix for pain 8)

Rule kept verbatim: while the preview shows a non-rest pose (parked/pinned/playing/scrubbing)
and the selection contains a joint member (or a SubPart-owned collider/light whose owner is
animated), the placement gizmo detaches — a drag must never bake a posed transform into the
document. v2 makes it legible:
- Status-bar message (persistent while the condition holds, info tint):
  `Posed preview — placements locked · ⏮⚓ to rest to move parts` (the ⏮⚓ text is a click
  action = `returnToRest()`).
- The floating Tool bar renders Move/Rotate/Scale disabled with tooltip "Locked while a posed
  preview is shown (this SubPart is animated)".
- Transport state chip tints amber (§5.5).

---

## 10. Playback & preview — the reconciled state machine

### 10.1 Playhead states

```
        click ruler/track          ⏮⚓ / Esc / stop
 REST ───────────────────▶ PARKED ─────────────────▶ REST
  ⚓    click diamond               click elsewhere
 (no override;           PINNED ◀──────────────────▶ PARKED
  scene = modeled pose)   (park + gizmo)
```

- **REST**: playhead at `restAnchorTime`, no preview override — the scene IS the modeled part.
  (For deploy imports this is the deployed end — kept semantic.)
- **PARKED** (`$playheadParked`): override active at `$playheadSec`; playhead line solid; state
  chip `parked @t`. Deliberate (a click or latched release) — preview honesty is maintained by
  the always-visible chip + the §9.6 lock messaging, not by forbidding parking.
- **PINNED**: parked at a column + `$editKeyframeId` set + PoseGizmo attached.

### 10.2 Playback

- **Play** (Space/▶): from parked/pinned time; from REST plays from 0. rAF loop at `speed`×;
  **loop** repeats seamlessly; pin suspends during playback.
- **Pause** (Space/⏸): parks at the pause time (pause-in-place — new capability). The suspended
  pin is cleared on pause-at-a-different-time (deliberate departure from the keyframe).
- **Stop** (⏹): stop + `returnToRest()` (v1's play-once-then-snap lives here and remains the
  default END behavior when loop is off AND latch is off; with latch on, reaching the end parks
  at the final keyframe).
- Playback keeps `$animPlaying` true; scene invalidation via `$playheadSec` (on-demand loop
  contract).

### 10.3 Scrub / latch / pin reconciliation (fixes pain 7; foundation §9 wording honored)

- **Drag** on ruler/track (>4 px): `$animScrubbing = true`; pose follows live.
  - Release, **unlatched** (🔓, default): SPRING — playhead returns to where it was before the
    drag began (the pinned column if pinned, the parked time if parked, else REST ⚓). The
    **pin survives and re-pins** — grabbing the scrubber to check motion and releasing puts you
    exactly back into editing (the v1 pin-loss is dead).
  - Release, **latched** (🔒): playhead parks at the release point — EXCEPT while pinned: the pin
    wins and re-pins (latch governs free scrubbing only; leaving a pinned keyframe is always an
    explicit act: click elsewhere, `,`/`.`, Esc).
- **Click** (≤4 px): parks at the clicked time; clears the pin (deliberate departure). Clicking a
  diamond pins instead (§5.3).
- **Esc** (ladder rung 7): pinned → unpin (stay parked at that time) → parked → `returnToRest()`
  → active joint cleared. (Registered `mode:animation`; the raw window listener is deleted.)
- Spring-loaded semantics on mode exit / project switch: forced `returnToRest()` (foundation
  §2.4).

---

## 11. Diagnostics, export & import

### 11.1 Per-clip export diagnostics (`computeClipIssues` — pure fn in `src/ksa/`)

Blockers (clip skipped by exporter — `isAnimationExportable` gate kept verbatim):
`needs a joint with members` · `needs a 2nd keyframe` · `duration must be > 0`.
Warnings: `joint "<name>" has no members` (won't contribute) · `SubPart <id> is a member in N
clips — KSA modules will fight over it` (open question 12, resolved: warn, never block) ·
`solar tracking target missing / not a member` · `clip imported with CubicSpline sampling —
approximated` (import-time flag, §11.3).

Surfaced at: clip-row draft chip tooltip (checklist with ✓/✗), Clip card EXPORT section (rows are
jump links), timeline ⚠ hints, Animation mode-switcher attention dot (draft clips exist —
foundation §2.2), Export-to-KSA pre-flight (export area consumes the same function; wording
"draft clips are skipped" + per-clip list). Non-blocking export policy retained (foundation §10.6).

### 11.2 Export (unchanged contract, restated)

One `<KeyframeAnimationModule>` per exportable clip; GLB via `buildAnimationRig` +
`buildAnimationGlb` (hand-rolled writer — GLTFExporter prunes required empty leaves; identity
Part root; leaves named instance-id with static offsets; per-joint channels; eased segments
densified to LINEAR @30 fps — "eased" now = any channel non-linear; hemisphere-matched quats;
scale channel only when varying). Mod bundle writes `Animations/<id>.glb` independent of custom
meshes. Naming via `animNaming` (`animModuleId`/`animGlbPath`) unchanged.

### 11.3 KSA import flow (Part browser → clips ride along)

Mechanics kept: fetch `_Anim.glb` → `decodeAnimationGlb` (FLOAT accessors, LINEAR/STEP) →
placement override with GLB-faithful rest poses → id remap in the same undo step → easing
reverse-fit → `restKeyframeId` at the matched end (deploy = last keyframe).
v2 deltas:
1. Fitter fits **per channel** (LOCKED #8) — same tolerances; per-joint dense-key fallback kept.
2. **CubicSpline detection**: samplers with CUBICSPLINE interpolation no longer silently
   mis-decode — the importer flags the clip (imported approximately from the keyframe values)
   and the flag feeds §11.1 + the import report.
3. The **import report** (notification-center rich entry, foundation §5.1) gains an Animations
   block: per clip — name, joints, keyframes kept vs dense-fallback joints, per-channel fit
   summary, and "anchored at final keyframe (modeled deployed)" note when applicable.
4. Project-transfer paste remap (fresh ids, member/solar refs remapped, dropped refs pruned):
   unchanged, now including per-channel easings verbatim.

---

## 12. Hotkeys (scoped registry — foundation §11)

### 12.1 `mode:animation` (stacks on viewport scope; suppressed while typing)

| Keys | Action |
|---|---|
| `Space` | play / pause |
| `,` / `.` | previous / next keyframe (parks + pins) |
| `K` | insert keyframe at playhead |
| `⇧K` | insert keyframe at playhead for **later**: reserved — NOT bound in v2 (kept free) |
| `Esc` | ladder rung 7 unwind (§10.3; registered, replaces the window listener) |

Viewport-scope keys keep working in Animation mode (S8): W/S A/D Q/E rotate + arrows nudge act
on the **placement selection** (used for attach flows / pivot-set); while `$isPoseEditing` with
an empty selection they are inert exactly as v1. `T`/`⇧T` cycles the pose tool when the
PoseGizmo is attached (`$effectiveToolMode` is the single source — kept). `X/Y/Z` during a pose
drag = per-gesture axis lock (§9.2; pointer-capture-local, not registry — documented in Help's
static pointer-modifier section).

### 12.2 `surface:timeline` (timeline focused; overrides viewport/global on conflict)

| Keys | Action |
|---|---|
| `←`/`→` | step playhead ± 1/30 s (bake frame); parks |
| `⇧←`/`⇧→` | snap playhead to previous / next keyframe |
| `⌘A` / `⌥⌘A` | select all / none (columns) |
| `⌘C` `⌘X` `⌘V` `⌫` | keyframe clipboard ops (§5.7) |
| `=` / `-` | zoom in / out about playhead |
| `F` / `⇧F` | fit clip / fit selected columns |
| `Esc` | clear column selection, then blur to ladder |

The timeline claims focus on pointer-down in the dock (like the viewport host); clicking the
viewport returns focus there (kept focus-stealing contract).

### 12.3 Escape ladder integration (foundation §11.4 — animation rungs)

Rung 4: pose-gizmo drag cancel. Rung 5: armed tool (`member-paint`, `pivot-pick`, measure…)
disarm. Rung 7 (mode:animation): pin → park → rest → active joint (§10.3) — never exits the
mode, never clears the placement selection.

### 12.4 Help dialog

All the above register through the scoped registry → render in Help under "Animation mode" and
"Timeline" groups (foundation §11.5). Static sections gain: pose-drag axis locking, timeline
drag modifiers (⌃ snap-to-keys, ⇧-marquee), paint-click semantics.

---

## 13. Status bar & menu contributions (foundation extension points)

- **Segments**: mode chip `▶Anim`; active-layer chip (Build+Animation — kept); tool segment
  (paint / pivot-pick / measure instructions); **posed-lock message** (§9.6); selection readout
  unchanged; modifier hints provider: pose-drag (`X/Y/Z lock axis · ⌃ temp snap`), timeline
  hover (`⌃ snap to keys · ⇧ marquee`), member rows (`⇧ range · ⌘ toggle`).
- **MenuSpec additions**: View ▸ **Motion Trails ▸** (◉ Selected / All / Off; disabled outside
  Animation). No new top-level menus. Palette commands: "Go to Animation mode", "Insert keyframe
  at playhead", "Play/Pause preview", "Edit joint members", "Edit joint pivot", "Re-anchor rest
  at selected keyframe", "New animation clip", dynamic "Open clip: <name>".
- **Window ▸ Timeline** ✓ (Animation only — foundation).

---

## 14. Phone (<640 px) — FULL parity (LOCKED #6; foundation §12 primitives only)

| Surface | Phone variant |
|---|---|
| Timeline | **Fullscreen Timeline sheet** (LOCKED). Opened from the **transport chip** docked above the condensed status bar in Animation mode: `[▶] Deploy ▓▓▓░ 1.2s [⤢]` (mini play + progress + expand). Sheet = TransportBar (sm density, wrapped to 2 rows) + DopeSheetCanvas. Touch: tap track/ruler = park; tap diamond = pin; **long-press (250 ms) + drag diamond = retime** (snap defaults on); pinch = zoom; two-finger drag = pan; ⇧-marquee replaced by a `[☑ select]` toggle in the sheet header (tap-toggles columns while on); selected-column actions row appears (Copy / Paste / Delete / Re-anchor). Close (grabber drag / ✕) returns to viewport; playback continues |
| Right navigator (Clips/Joints/Easing/Solar) | **Panel sheet** (re-tap the ▶ tab). Same components at `sm` density; joint drag-reparent falls back to the Re-parent ▸ menu (kept for exactly this) |
| Members view | Pushed view inside the Panel sheet (back header `‹ Members`). **Paint mode**: arming 🖌 dismisses the sheet; a pinned chip `🖌 → HingeL · Done` docks above the condensed status bar; tap meshes to toggle; Done/chip reopens the sheet with changes flashed |
| Left focus editor | **Inspector sheet** via the selection/focus FAB (badge shows joint or keyframe context). Pose card gains touch steppers on each numeric (foundation census-gap rule); Easing curve editor works with touch drag (handles ≥ 32 px hit) |
| Pose gizmo | Same PoseGizmo; ring/handle hit targets scale ×1.6 on touch; axis-lock taps unavailable → an axis-lock segmented control `[free|X|Y|Z]` appears in the Tool bar strip while a pose drag target exists |
| Pivot tool / pivot-pick / working-pivot pick | Armed from the Inspector sheet; sheet auto-dismisses; status chip guides; tap completes; result flash |
| Transport hotkeys | n/a (keyboard features are desktop-only per foundation; every action has a touch control listed above) |
| Notifications / import report | standard phone sheets (foundation) |

---

## 15. Undo & persistence matrix (per interaction)

| Interaction | Undo | Persistence |
|---|---|---|
| clip create/rename/delete/mode/duration/solar/re-anchor | discrete (duration streaming) | document (project snapshot) |
| joint create/rename/reparent/delete | discrete | document |
| attach/detach (buttons, picker, paint — per click) | discrete, labeled with names | document |
| pivot set/snap actions | discrete | document |
| pivot move/reorient drags; pose drags; pose/easing numerics & curve drags | streaming — ONE push at drag/focus/editStart | document |
| keyframe insert/delete/paste/reset-pose/copy-pose | discrete | document |
| diamond retime drag | streaming (push at drag start) | document |
| playhead park/pin/scrub/play/loop/speed/latch | **never undo** | loop/speed/latch persisted `flexo:animTransport`; playhead ephemeral |
| timeline selection, clipboard, zoom/pan, tree collapse | never | ephemeral |
| working pivot set/clear; Members view open/target; trails mode | never | trails persisted `flexo:animTrails`; rest ephemeral |
| timeline dock height/collapse | never | `flexo:layout.timeline` |
| animation clipboard | never | ephemeral (session) |

Undo/redo restore clamps all ephemeral ids (`initAnimationStore` extended, §4.3). Mode switches,
dock resizes, view toggles never create undo steps (constitution).

---

## 16. Foundation deviations (explicit, minimal)

| # | Deviation | Rationale |
|---|---|---|
| D1 | §10.11's SubPart Set Picker, when invoked for joint membership in Animation mode, renders **docked as the right-sidebar Members view (non-modal)** instead of an M overlay dialog | Member painting and live show/hide-layer interaction require a live viewport; a kit Modal blocks all canvas input. The component (`SubPartSetGrid`) is shared — the M-dialog host remains for future non-Animation callers, so §10.11 stays intact for them. The brief's own words ("popups that make it easy… must be flexible") are satisfied with strictly more capability. **Finalization note: foundation §10.11/§7.2/§8.2 have been amended to bless exactly this hosting split — no longer a deviation; row kept for the record** |
| D2 | `$activeTool` union gains `'member-paint'` and `'pivot-pick'` (Animation-only; cancel on mode switch; own status segments + Esc rungs) | Foundation §2.6 enumerates four tools but §17 lets areas contribute scope entries; these follow every slot rule (single slot, pick suppression, Esc rung 5, status segment). Listed here because the union type itself is foundation-owned |
| D3 | Clip rows no longer close on re-click (v1: re-click closed the clip + stopped preview) | The transport (⏹/Esc/⏮⚓) owns "stop preview"; a mode with clips always has one open. Behavior, not capability, changes — noted for the parity table |

---

## 17. RULE ZERO — feature parity table (v1 animation census → v2 home)

| v1 feature (animation.md) | v2 home |
|---|---|
| §1.1 Enter/exit anim editor ("Anim (N)" button, Close, `$inspectorMode` gating of preview/gizmo/marker) | Mode switcher segment / `2` / palette; `$mode` drives affordance flags (§2, §9.1) |
| §1.2 Clip list create/open/rename/delete; draft "(draft)" indicator + aggregate warning | CLIPS section (§6.1); draft chip + per-clip checklist (§11.1) — richer, nothing lost |
| §1.2 Mode select Actuate/DeployRetract; duration rescale | Clip card (§8.2); rescale kept as default + Keep-times added |
| §1.3 Joint create (centroid-seeded) / rename / delete (children re-parented) / select / re-parent Select, cycle guard | JOINTS tree (§6.2): ＋ joint, inline rename, ⋮ delete, drag-reparent + Select fallback, same store ops |
| §1.4 "Attach N selected" per joint | Tree row + Joint card `[Attach N selected]` (§6.2, §8.3) |
| §1.4 Mesh Picker modal (search, multi-select, shift-range, attach to active joint, SubParts-only gate) | **Members view** (§7): fuzzy search, layer sections, ⇧-range/⌘A, target-joint selector, paint mode; SubParts-only gate kept + explained (§7.5) |
| §1.4 attach exclusivity within a clip; detach per row | kept (`attachToJoint` semantics §4.3); detach via ✕ rows, Unassign, paint |
| §1.5 Add pose at end | `K`/＋Key/double-click at playhead (§5.4) — park at end reproduces "add at end" |
| §1.5 Remove keyframe (rest undeletable) / retime NumberField / on-curve seeding / select-for-edit + auto tool pick | Timeline delete + Keyframe card (§5.7, §8.4); retime = diamond drag + time field; on-curve seed kept; pin replaces select-for-edit; auto tool pick replaced by anchor pivot-routing (§9.4) |
| §1.5 add-keyframe easing deletion | replaced by exact bézier subdivision — motion-neutral (§5.4) |
| §1.6 PoseEditor numerics (pos/rot; no scale) | Pose card with pos/rot/**scale** (§8.3) |
| §1.6 pose gizmo via poseProxy; precedence over selection gizmo; t=0 pivot special-case; drag-start undo | `PoseGizmo` (§9.2); precedence kept; anchor routing (§9.4); undo contract kept |
| §1.6 `$isPoseEditing` shows tool switcher with empty selection | kept — Tool bar reads `$effectiveToolMode`/`$isPoseEditing` (foundation §6.2) |
| §1.7 Set pivot to selection / pos-only; `rebaseJointToWorld` math; AxesHelper marker | Pivot card set-to row (+centroid, +pick — additive); same math; marker at **anchor** (§9.3–9.4) |
| §1.7 t=0 marker/drag inconsistency | FIXED: everything anchored on `restAnchorTime` (§9.4) |
| §1.8 EasingEditor: 10 presets + 2-handle bézier, overshoot, "Custom curve", linear-absent, "All joints" | Easing card (§8.3) — verbatim widget semantics, now per-channel (LOCKED #8); "Apply to all joints" kept |
| §1.9 spring-loaded scrubber; play-once + snap-to-rest; PreviewProgressLabel; floating + inline scrubbers | Transport (§5.5) + state machine (§10): spring kept as default; latch/loop/speed/pause added; state chip replaces the label; both v1 scrubbers deleted (single home — foundation death list) |
| §1.9 preview override math incl. colliders/lights following posed frames | unchanged (`applyAnimationPreview` consumes `$playheadSec`) |
| §1.10 gizmo write-back protection while posed (silent) | kept + surfaced (§9.6) |
| §1.11 restKeyframeId / restAnchorTime semantics; importer sets it; project-JSON `rk`; never exported | kept; now **exposed**: ⚓ badges, Re-anchor actions, protections (§5.6) |
| §1.12 KSA clip import (decode, placement override, remap, easing fit, solar round-trip) | kept + per-channel fit + CubicSpline warning + rich import report (§11.3) |
| §1.13 GLB/XML export, BAKE_FPS 30, hemisphere, scale-when-varying, identity root, naming, draft skipping, mod bundle | untouched contract (§11.2); draft skipping now visible (§11.1) |
| §1.14 Solar tracking editor (switch, target, °/s, excludes) | §6.4 with readable labels + dangling-ref warning |
| §1.15 Escape unwind; ephemeral clamping | registry rung 7 (§12.3); clamping extended (§4.3) |
| §1.16 undo conventions; project transfer remap | §15; §11.3 item 4 |
| Two-scrubber sync; FloatingPreviewToolbar drag/persist/phone-pin | superseded by the docked transport (positions obsolete; `flexo:animPreviewFloatPos` abandoned per no-migration policy) |
| MeshPicker `$browserPopupCount`? (not used by picker) — n/a | — |
| Selection-transform hooks: pose 'pose' undo label; `$toolMode` auto-pick write | label kept; auto-pick write removed (replaced by anchor routing — no store write on keyframe select) |
| Phone: pinned scrubber bar, sheet-hosted AnimationPanel | Phone transport chip + Timeline sheet + Panel/Inspector sheets (§14) |

Constitution checks: connectors/kittens never members (§7.5); chain palette co-exists (chain is
Build-only; opening ⇧⌘K from Animation prompts per foundation §2.6 — unchanged); numeric fields
all `useNumberDraft` + `inputMode="url"`; `src/ksa/`+`src/state/` react-free (DopeSheetCanvas is
UI-layer; `computeClipIssues` pure in ksa/); on-demand render loop preserved (§5.8, §9.5);
dark-only; coords.ts/formatG6 untouched; scope/animation.md + docs/ to be updated by
implementation.

---

## 18. Implementation notes (for the planner)

- **Components** (`src/ui/animation/`): `TimelineDock` = `TransportBar` + `TrackHeaderColumn` +
  `DopeSheetCanvas` (2-canvas static/dynamic split); `AnimationSidebar` = `ClipsSection`,
  `JointTreeSection`, `EasingOverviewSection`, `SolarTrackingSection`, `MembersView`
  (hosts shared `SubPartSetGrid`); left: `AnimClipCard`, `AnimJointCard` (Members/Pivot/Pose/
  WorkingPivot/Easing sub-cards), `AnimKeyframeCard`; `EasingCurveEditor` (v1 widget + channel
  tabs). Three-layer: `PoseGizmo`, `JointMarkerLayer` (pickable kind `'joint'`),
  `TrajectoryLayer`, paint/pick controllers keyed off `$activeTool`.
- **Stores**: extend `animationStore` per §4 (no new store; timeline view state included);
  document type change §3 + codec + rig sampler + fitter; `computeClipIssues` in `src/ksa/`.
- **Order** (fits foundation §17 step 6 "Animation + timeline last"): (a) store/type/codec/
  sampler + subdivision math with tests; (b) TimelineDock against new atoms (old panel still
  mounted); (c) right navigator + left cards replace AnimationPanel; (d) MembersView + paint;
  (e) PoseGizmo + pivot tool + markers + trails; (f) delete AnimationPanel, MeshPickerModal,
  FloatingPreviewToolbar, PreviewScrubber, window-listener Esc. Repo compiles at every step.
- **Tests to carry/add**: easing subdivision exactness (dense-sample diff ≈ 0 for pos/rot/scale),
  per-channel fit round-trip, column significance (◆/◇) rule, clamping after undo, paint
  reassignment exclusivity, `computeClipIssues` matrix.
