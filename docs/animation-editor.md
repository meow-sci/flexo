# Animation Editor

Animation mode: authoring KSA's keyframe clips — deployable panels, service-module doors,
landing legs — inside the docked v2 shell. This doc covers the **editor**. The game contract
(the `_Anim.glb` node-structure convention, `<KeyframeAnimationModule>`, the rig math, the
LINEAR-sampler export rule) is owned by [scope/animation.md](../scope/animation.md) and is
never duplicated here.

## 1. Mental model and vocabulary

| Term | What it is |
| --- | --- |
| **Clip** | A `PartAnimation` on `$part.animations`: `{id, name, durationSec, mode, joints[], keyframes[], restKeyframeId?, cubicSplineApprox?, solarTracking}`. `mode` is `'deployRetract'` or `'actuate'`. |
| **Joint** | An `AnimationJoint`: `{id, name, parentJointId, memberInstanceIds[]}`. A joint is a hinge with a pivot and a set of SubParts that swing with it. |
| **Member** | A SubPart placement attached to a joint, by `instanceId`. Membership is **exclusive within a clip** — `attachToJoint` strips the id from every other joint first. |
| **Keyframe / column** | An `AnimationKeyframe`: `{id, timeSec, poses: Record<jointId, Transform>, easings?}`. It is a *column* in the dopesheet, because every joint has a pose entry at every keyframe. |
| **Segment** | The span between one keyframe and the next, **for one joint**. Easing is a property of the outgoing segment, so it is stored on the earlier keyframe. |
| **Pin** | `$editKeyframeId` — the keyframe you are posing. While pinned, the gizmo writes into that column. |
| **Park** | `$playheadParked` — the playhead is deliberately held off the rest anchor without being pinned to a column. |
| **Rest anchor** | The keyframe whose composed pose equals the modelled placements. See §4. |

## 2. The mode surfaces

**Right sidebar — `animation/AnimationSidebar.tsx`** (the navigator), four sections:

1. **Clips** (`ClipsSection.tsx`) — one row per clip with name, duration, mode, a `⚓end`
   micro-chip when the rest anchor is the last keyframe, and a **draft** chip whose tooltip is
   the blocker checklist (§5). Create, rename, duplicate, delete.
2. **Joints** (`JointTreeSection.tsx`) — a real tree, indented by `parentJointId`, with
   drag-to-reparent (cycle-guarded), member counts, "Attach selected (N)" and "Choose
   members…". Collapse state lives in `$jointTreeCollapsed`, **shared with the timeline's
   track headers** so the two can never disagree.
3. **Easing** (`EasingOverviewSection.tsx`) — the per-channel overview of the selected
   segment, with ✎ jumps into the editor and "Apply to all joints".
4. **Solar tracking** (`SolarTrackingSection.tsx`) — §7.

**Left sidebar — `animation/AnimationFocusEditor.tsx`** (the focus editor), one card per
focus: `AnimClipCard` (name, mode, duration with its rescale note, the EXPORT ✓/✗ checklist
with jump links), `AnimJointCard` (name, parent, membership list, pivot tools, the pose
editor's position/rotation/**scale** numerics, the per-channel easing editor) and
`AnimKeyframeCard` (time, per-joint pose summary, easing).

**Timeline dock — `animation/TimelineDock.tsx`** — §3.

**Members view — `animation/MembersView.tsx`** — "Choose members…" replaces the right sidebar
body with a docked, **non-modal** host for the shared `SubPartSetGrid`. It is deliberately not
a dialog: a modal would kill member painting and the live layer-eye interaction, and the
viewport has to stay visible. Above the grid sit a fuzzy search and a four-chip filter
(all / unassigned / this / other) plus **🖌 Paint in 3D**; below it, the "not animatable"
inventory and the assign/unassign footer (one discrete undo step each).

## 3. The timeline dock

A real flex sibling between the workspace band and the status bar, mounted only in Animation
mode and only on desktop. Two independent visibility flags in `flexo:layout`:
`timeline.hidden` is **Window ▸ Timeline** (unmount) and `timeline.collapsed` is the
transport's ⌄ (stay mounted as a 32px strip). Height is drag-resizable from the top edge,
clamped 120px–50vh.

**Transport** (`TransportBar.tsx`): play/pause (`Space`) · stop · loop · speed
0.25/0.5/1/2× · **⚓ to-rest** · prev/next keyframe (`,` / `.`) · the time readout · a state
chip · ＋Key (`K`) · the **latch** padlock · the motion-trails menu · collapse.

**Track area** (`DopeSheetCanvas.tsx` + `TrackHeaderColumn.tsx`): one row per joint, ordered
and indented to mirror the sidebar tree. Draggable keyframe diamonds retime; clicking an
empty track or the ruler moves the playhead; double-clicking a track inserts a keyframe there;
`K` inserts at the playhead. The rest-anchor column is badged **⚓** and its context menu
carries **Re-anchor here**. Per-segment easing indicators show the resolved preset, `custom`,
or `per-channel` when the three channels differ.

The header column is plain DOM and the track area is **two stacked canvases** — a static one
redrawn from React on document/view/selection change, and a dynamic one carrying only the
playhead and the marquee rectangle. The two are kept in lockstep by shared row-height
constants and a shared `$timelineScrollTop` atom rather than DOM overflow. The track-header
width persists as `flexo:animTrackHeaderW`.

## 4. Preview honesty

This is the part that is easy to get wrong, so it is stated plainly.

**Imported KSA deploy clips are modelled DEPLOYED.** The placements in the document are the
panel *extended*, and the clip's rest state is therefore its **last** keyframe, not `t = 0`.
`restKeyframeId` records which column that is, and `restAnchorTime(anim)` (in
`src/ksa/animationRig.ts`) resolves it to a time — falling back to `0` when the field is
absent or stale. Everything that needs "where does the geometry actually sit" goes through it:
the preview override matrix (`W_J(t) · W_J(rest)⁻¹ · placement`), the joint markers, the
trajectory anchor ring, the pivot marker, and `EditorScene`'s "is the preview posed" test. It
is flexo-internal and never serialized to KSA.

`restKeyframeId` is not restricted to the first or last column: **Re-anchor here** points it at
any keyframe, and deletes the field when the target is the earliest column (absent ⇒ earliest).
`removeKeyframes` refuses to delete the `t = 0` column or the anchor column, and the retime
paths refuse to move `t = 0`.

**Scrubbing is spring-loaded.** `beginScrub()` snapshots `{playhead, parked, pin}`;
`endScrub()` resolves in strict precedence: a pinned keyframe wins (restore the pin and park
at its time) → else the **latch** is on and the pose holds at the release point → else the
pre-drag park is restored → else `returnToRest()`. So letting go of an unlatched scrub snaps
back to the modelled pose, and scrubbing no longer silently exits pose editing.

**Gizmo write-back is protected.** `PoseGizmo` never touches the document;
`EditorScene.handlePoseGizmoChange` decides what a new frame *means*. At the rest-anchor
column (`$pivotRouting`) Move is `moveJointPivot` and Rotate is `reorientJointPivot` — Scale is
absent, because a pivot stays unit-scaled, so it degrades to Move and the Tool bar disables it.
Every other column is a plain `setJointPose`. That routing is the fix for v1's `t = 0` special
case, which disagreed with `restAnchorTime` on any imported deploy clip. When the placement
gizmo would be lying — the selection contains something the clip drives and the playhead is off
the anchor — `EditorScene` publishes `$posedPlacementLock` and the status bar says so, with a
click action back to rest; v1 detached the gizmo silently.

## 5. Per-channel easing

Easing is per joint, per segment, **per channel** (position / rotation / scale):

```ts
export type EasingChannel = 'position' | 'rotation' | 'scale';
export interface JointSegmentEasing {
  position?: EasingConfig;
  rotation?: EasingConfig;
  scale?: EasingConfig;
}
```

An **absent channel is linear** — that is the whole storage discipline. `src/ksa/easing.ts`
owns it: `normalizeSegmentEasing` drops linear channels and returns `undefined` when nothing is
left, and the store then deletes the joint's entry and, if it was the last one, the keyframe's
whole `easings` map. So an all-linear clip carries no easing data at all.

Authoring is `EasingCurveEditor.tsx`: a `Uniform / Position / Rotation / Scale` tab strip over
ten presets plus a draggable two-handle cubic-bézier curve (handle x clamped to `[0,1]`, y free
in `[-0.5, 1.5]` so overshoot is authorable). The dopesheet's segment context menu offers the
presets directly, plus copy/paste easing.

**The Uniform rule** is one predicate, `segmentEasingUniform(seg)`, returning the shared
`EasingConfig`, the string `'mixed'`, or `undefined` (linear). Four surfaces render it
consistently: the overview says `Uniform: mixed`, the curve editor's Uniform tab shows
**Mixed** with a `[Make uniform]` button (which copies the *position* channel to all three),
the dopesheet segment label reads `per-channel`, and the keyframe card says the same. There is
no fourth spelling of "the channels differ".

This is the one **breaking** persisted-model change v2 made: `AnimationKeyframe.easings` values
changed shape from a single `EasingConfig` to a `JointSegmentEasing`, so a v2-era snapshot's
single whole-pose easing would default-fill to all-linear and load the WRONG motion.
`PROJECT_SCHEMA_VERSION` moved to **3** and `PROJECT_EXPORT_VERSION` to **9** for exactly that
reason (see [projects.md](./projects.md)). On the wire a keyframe's `es[jointId]` is
`{p?, r?, s?}`.

## 6. Diagnostics

`src/ksa/clipIssues.ts` — `computeClipIssues(part): Record<animId, ClipIssue[]>` — is pure and
UI-free, and is the single source for every draft/export warning surface. `$clipIssues` derives
it and `$draftClipCount` counts clips with any blocker (that is the mode switcher's attention
dot).

**Blockers — the clip will not export.** These mirror `isAnimationExportable` in
`src/ksa/animationNaming.ts`, and the equivalence is pinned by a property test.

| id | Message |
| --- | --- |
| `no-member-joint` | `needs a joint with members` |
| `needs-second-keyframe` | `needs a 2nd keyframe` |
| `zero-duration` | `duration must be > 0` |

**Warnings — the clip exports anyway.**

| id | Message |
| --- | --- |
| `joint-without-members` | `joint "<name>" has no members` |
| `multi-clip-member` | `SubPart <id> is a member in N clips — KSA modules will fight over it` |
| `solar-target-missing` | `solar tracking target missing / not a member` |
| `cubicspline-approx` | `clip imported with CubicSpline sampling — approximated` |

The last one is the honesty flag for import: a glTF `CUBICSPLINE` sampler stores
`[inTangent, value, outTangent]` triplets, and `animationImport.ts` keeps only the value rows.
The clip is therefore an approximation with its tangents dropped, `cubicSplineApprox` records
it on the clip, the KSA import report says so, and the warning keeps saying so afterwards.
flexo itself exports LINEAR samplers only — see [scope/animation.md](../scope/animation.md).

Consumers of the same list: the Clips-section draft chip, the clip card's export checklist,
the Members view, the Solar Tracking section, the mode switcher and phone tab dots, and the
Export to KSA dialog's pre-flight.

## 7. Solar tracking

`PartAnimation.solarTracking` is a passthrough to KSA's `<SolarTracking DegreesPerSecond
SubPart>` plus its `<ExcludeSubPart>` list. The section gates on mode: solar tracking requires
`deployRetract`, so in `actuate` it renders only an explanation and a `[Switch mode]` button.
Turning it on seeds `{degreesPerSecond: 5, subPartInstanceId: <first member>,
excludeInstanceIds: []}`; the tracking target is picked from the clip's members, and any member
can be marked "stays fixed". Every write is a **whole-spec replace** through
`setSolarTracking`, so each is one discrete undo step.

## 8. Undo enrollment

The store has exactly two primitives, and every mutator uses one of them: `mutate(description,
detail, fn)` pushes undo then edits, `stream(fn)` edits without pushing. The rule is the
editor-wide one ([editor-state.md](./editor-state.md#undoredo-invariant-must-maintain)) — a
mutator that uses neither silently bypasses undo, and that is a bug.

**Discrete** (`mutate`, one gesture = one step): `addAnimation` · `duplicateAnimation` ·
`removeAnimation` · `renameAnimation` · `setAnimationMode` · `setSolarTracking` · `addJoint` ·
`removeJoint` · `renameJoint` · `setJointParent` · `attachToJoint` · `detachFromJoint` ·
`detachMembers` · `reorderJoint` · `addKeyframe` · `removeKeyframes` / `removeKeyframe` ·
`pasteKeyframesAtPlayhead` · `setRestAnchor` · `resetJointPoseToCurve` · `pasteJointPose` ·
`setSegmentEasingAllJoints` · `setJointPivot` (and its `…ToCentroid` / `…Point` wrappers) ·
`paintMemberOnTarget` (one step per painted click).

**Streaming** (`stream`; the caller pushes once at interaction start):
`setAnimationDuration` · `moveKeyframes` · `setKeyframeTime` · `setJointPose` ·
`setJointSegmentEasing` · `setJointChannelEasing` · `moveJointPivot` · `reorientJointPivot`.
The push sites are in `src/ui/animation/`: the pose fields and the pose gizmo push `'pose'`,
the pivot fields push `'move pivot'` / `'reorient pivot'`, the duration field pushes
`'animation duration'`, the keyframe time field pushes `'keyframe time'`, and the easing editor
and the dopesheet's retime drag / preset / paste each push `'segment easing'` or
`'retime keyframe'`.

`addKeyframe` is a deliberate no-op — and pushes **no** undo — when a column already exists
within `COLUMN_EPS_SEC` (1 ms) of the requested time.

Everything else the store exports is view state and enrolls in nothing: clip/joint/keyframe
selection, the playhead and its park/pin flags, scrub and playback, the transport
preferences, the members view, the pivot tools, the timeline selection and clipboard.

## 9. Performance

**`$playheadSec` is the high-frequency atom** — every rAF tick of playback writes it. Only
leaf components and imperative canvas layers may subscribe; a wide React tree subscribing to it
is the v1 `PreviewProgressLabel` mistake, and it is binding. The sanctioned subscribers are
exhaustive: the dopesheet's dynamic canvas (a direct `subscribe`, never through React), exactly
two leaves in `TransportBar` (the time readout and the state chip), one leaf in
`PhoneTransportChip`, `EditorScene.sub()` for scene invalidation, and `TrajectoryLayer`'s own
imperative subscription, which moves only the playhead bead.

Neither timeline canvas participates in the three.js render loop, so scrubbing and dragging the
marquee never force a frame. Scene invalidation stays in `EditorScene`, which keeps the
on-demand loop intact ([3d-workspace.md](./3d-workspace.md#rendering-is-on-demand)).

## 10. Constraints

- **SubParts only.** Connectors and kittens can never be joint members — that is a KSA
  limitation, not a UI simplification, so the Members grid never offers them. Connectors
  cannot animate with joints at all.
- **Membership is exclusive within a clip**, but a SubPart *can* end up in two clips; that is
  the `multi-clip-member` warning, because KSA's modules will fight over it at runtime.
- **The mode never exits via Escape.** Rung 7 unwinds *inside* Animation — selected columns →
  the pin → the park → back to the rest anchor → the active joint — and stops there.
- **Timeline keys are `surface:timeline`-scoped**, live only while the dock has focus, and the
  arrow keys declare `overrides` against the viewport nudge bindings so stepping the playhead
  wins while the timeline is focused. The mode-scoped keys (`Space`, `,`, `.`, `K`) stack on
  the viewport scope, so `W`/`S` and the nudge arrows still act on the placement selection
  while you pose. Both sets are listed in Help, generated from the registry — see
  [ui-shell.md](./ui-shell.md#6-hotkeys).

## 11. Viewport layers

Three scene layers are Animation-only, all gated on `$mode`: `PoseGizmo` (flexo's only
hand-built gizmo), `JointMarkerLayer` (a pickable marker per joint drawn at the joint's rest
frame) and `TrajectoryLayer` (member-set centroid trails, keyframe ticks, the anchor ring and
the playhead bead — `View ▸ Motion Trails ▸` writes the persisted `flexo:animTrails`). Their
anatomy and the gizmo contract are in
[3d-workspace.md](./3d-workspace.md#animation-viewport-layers).

## 12. Tests

`src/state/animationStore.test.ts` covers the store's mutators and their undo enrollment;
`src/ksa/clipIssues.test.ts` covers the issue catalog and pins the blocker set against
`isAnimationExportable`; `src/ui/animation/dopeSheetModel.test.ts` and
`dopeSheetInteractions.test.ts` cover the pure timeline row/hit models.
