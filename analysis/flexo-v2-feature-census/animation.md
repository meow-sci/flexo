# Animation system & animation UX — v2 refactor analysis (deep dive)

Repo: `/Users/asherwin/repos/meow-sci/flexo`. All paths below are repo-relative unless absolute.
Verified against the actual code (docs/plans consulted and cross-checked; `plans/ANIMATION_UX_CLEANUP_TODOS.md` items are ALL already implemented — see §4.15).

---

## 0. Mental model (current)

An animation is document data on the part: `EditingPart.animations: PartAnimation[]` (`src/ksa/types.ts:2067-2092`). A `PartAnimation` is:

- `joints: AnimationJoint[]` (`types.ts:1989-1998`) — a small skeleton. Each joint has `id`, `name`, `parentJointId` (nullable → chains), `memberInstanceIds` (placed SubPart instance ids rigidly attached to it).
- `keyframes: AnimationKeyframe[]` (`types.ts:2031-2046`) — global time points; each keyframe stores `poses: Record<jointId, Transform>` (every joint has an entry at every keyframe) and optional `easings: Record<jointId, EasingConfig>` for the OUTGOING segment.
- `durationSec`, `mode: 'actuate' | 'deployRetract'` (maps to KSA `ShowDeployRetract`), `solarTracking: SolarTrackingSpec | null`, and **`restKeyframeId?`** — flexo-internal marker of which keyframe's composed pose equals the static modeled placements (absent ⇒ t=0). Imported KSA _deploy_ clips are modeled DEPLOYED = the LAST keyframe (`types.ts:2079-2089`).

KSA mandate (verified in decomp, `scope/animation.md`): animation channels must target JOINT nodes; every moving SubPart is a NON-animated GLB leaf node named exactly its instance id, parented under its joint. World of a leaf at time t = `W_J(t) · W_J(rest)⁻¹ · placement` — so the joint's rest position IS the pivot/rotation anchor; there is no separate per-subpart pivot concept anywhere.

The editor never mutates placements to animate: the 3D preview overrides `SubPartObject.group` transforms ephemeral-only (`EditorScene.applyAnimationPreview`, `src/three/EditorScene.ts:814-864`).

---

## 1. Feature inventory

### 1.1 Enter/exit the Animation editor (full-sidebar mode)

- **UI path:** right inspector → Assets toolbar → **"Anim (N)"** button (`src/ui/AssetsToolbar.tsx:52-59`) → `setInspectorMode('anim')`. Exit: AnimToolbar → **Close** (`src/ui/AnimToolbar.tsx:33-41`) → back to `'assets'`.
- **Implementation:** `$inspectorMode` atom (`src/state/uiStore.ts:17-22`, ephemeral, resets to `'assets'` on reload); `InspectorContent` switches the entire sidebar body (`src/ui/InspectorContent.tsx:26-35`) to `AnimToolbar` + `AnimationPanel`. In anim mode the Assets list is **hidden** — placed parts are reachable only through the Mesh Picker dialog or by clicking meshes in the 3D viewport.
- Entering anim mode also flips `EditorScene`'s preview gating (`$inspectorMode` subscription, `EditorScene.ts:552`) — outside anim mode the animation preview/pose gizmo/pivot marker are all off even though the anim atoms persist across mode switches.

### 1.2 Animation list: create / rename / delete / open-close / mode / duration

- **UI path:** AnimationPanel top section (max-h-44 scroll list of `AnimationRow`s + "＋ Animation" button; `src/ui/AnimationPanel.tsx:96-125,127-156`).
- Create: `addAnimation()` (`src/state/animationStore.ts:176-187`) — fresh clip with one rest keyframe at t=0 (`createPartAnimation`, `types.ts:2127-2137`), auto-opened. Draft indicator "(draft)" when `!isAnimationExportable` and a warning line "N animation(s) won't export yet…" (`AnimationPanel.tsx:110-115`).
- Open/close: clicking a row toggles active (`$activeAnimationId`); re-click closes and `stopAnimationPreview()` (`AnimationPanel.tsx:64-69,138`).
- Rename: TextField with focus-draft, commit on blur (`AnimationPanel.tsx:172-183`; `renameAnimation`, store L201).
- Delete: trash button per row → `removeAnimation` (store L189-199).
- Mode: Select "Actuate (0→1 slider)" / "Deploy / Retract" (`AnimationPanel.tsx:187-196`; `setAnimationMode` store L211). Deploy/Retract additionally unlocks the SolarTracking editor.
- Duration: `NumberField` labeled "s" (w-20) — `setAnimationDuration` **rescales every keyframe time proportionally** (store L219-230, streaming with `onInteractionStart` undo push).

### 1.3 Joints (pivots): create / rename / delete / select / re-parent

- **UI path:** AnimationPanel → "Joints (pivots)" section (`AnimationPanel.tsx:317-345`), one `JointRow` card per joint + "＋ Joint".
- Create: `addJoint` (store L247-262) — rest pose seeded at the **current viewport selection's centroid** (identity if none) so a fresh joint hinges near its parts (store L269-288); auto-selected.
- Select: crosshair icon toggles `$activeJointId`; clicking **anywhere in the card** also selects (guarded `!active`; `AnimationPanel.tsx:363-390`). Deselect: crosshair re-click (also clears `$editKeyframeId`) or Escape.
- Rename: inline TextField (`renameJoint` store L304).
- Delete: trash → `removeJoint` (store L290-302) — children re-parented to the removed joint's parent (chain stays connected), poses purged from every keyframe.
- Re-parent: searchable Select "Root (Part)" / "under X" per row (`AnimationPanel.tsx:423-440`; `setJointParent` store L314-326, cycle-guarded L329-340). Chains are flat rows — there is **no tree rendering** of the hierarchy.

### 1.4 Joint membership (attach/detach SubParts) — the painful flow

Two paths:

1. **"Attach N selected"** button per JointRow (`AnimationPanel.tsx:414-421`) — attaches the current 3D-viewport selection (`$selectedPlacements`) to that joint. Disabled with no selection. Since the Assets list is hidden in anim mode, selection must be made by clicking meshes in the viewport (shift/cmd-click multi-select via `SelectionManager`).
2. **Mesh Picker** modal — AnimToolbar → "Mesh Picker" (`AnimToolbar.tsx:21-29`) → `MeshPickerModal` (`src/ui/MeshPickerModal.tsx:22-136`): searchable multi-select GridList of ALL placements (rows = instanceId + template id text only, **no thumbnails/no 3D linkage**), desktop list gestures incl. Shift+click range via `useShiftRangeSelect` (`src/ui/rangeSelect.ts`; docs/editor-state.md §List selection), "Attach N to <joint>" attaches to the **active joint only** and closes. Warning "Select a joint first to attach." when no active joint.

- Store: `attachToJoint` (store L346-365) removes the ids from any other joint **in the same animation** (a SubPart can't be driven twice within one module) then appends; `detachFromJoint` (L367-372) per-row trash in the joint's member GridList (`AnimationPanel.tsx:479-495`, raw monospace instance ids).
- **SubParts only — deliberate**: connectors/kittens can't be driven by a joint (KSA limitation verified in decomp 4939; `MeshPickerModal.tsx:19-21` comment). MUST survive v2.

### 1.5 Keyframes (poses): add / remove / retime / select-for-edit

- **UI path:** AnimationPanel → "Poses (keyframes)" section (`AnimationPanel.tsx:506-578`).
- Add: single button **"＋ Pose at {duration}s"** — always inserts at the END time (`addKeyframe(anim.id, anim.durationSec)`, L516-523). `addKeyframe` (store L381-400) clamps t>0, seeds every joint's pose from the current curve at that time (on-path), **deletes the preceding keyframe's easing** (segment split would halve the eased span — documented tradeoff), sorts, and selects the new keyframe for editing. There is no "insert at playhead/current scrub time" affordance.
- Remove: trash per row; `removeKeyframe` silently refuses the rest keyframe t=0 (store L402-411; the row simply hides the trash button for Rest).
- Retime: tiny `NumberField` "t" (w-16) per non-rest row; `setKeyframeTime` streaming, clamped to (0, duration], can't move rest off 0 (store L414-423).
- Select for editing: clicking the row label calls `selectKeyframeForEditing` (store L78-85) — sets `$editKeyframeId` (pins the preview to that time) and **auto-picks the gizmo tool**: `translate` when the keyframe is at `restAnchorTime(anim)` (a drag relocates the pivot), else `rotate`. Re-click deselects (back to free scrub).

### 1.6 Pose editing — numeric PoseEditor + 3D pose gizmo (poseProxy)

- **Numeric:** `PoseEditor` (`AnimationPanel.tsx:581-680`) appears once a joint AND keyframe are selected. Position (m) XYZ and Rotation (°) XYZ NumberFields, streaming through `setJointPose` with `pushUndo('pose', …)` on interaction start. **No scale fields** — scale poses can only be authored via the gizmo's Scale tool.
- **3D gizmo:** `EditorScene.poseProxy` (`EditorScene.ts:243`) — an empty Group positioned at the joint's world frame `jointWorld(anim, jointId, kf.timeSec)`; `updateSelection` attaches the shared `TransformGizmo` to it with **precedence over the selection gizmo** (`EditorScene.ts:1619-1628`). Drag → `handlePoseGizmoChange` (`EditorScene.ts:1839-1872`): converts the proxy's Part-space frame to parent-local and:
  - **kf.timeSec === 0 special case** (the pivot): Move → `moveJointPivot` delta (rigid pivot relocate, all keyframes shifted equally, rendered geometry unchanged at every t — store L502-515); Rotate → `reorientJointPivot` (streaming pivot rebase via `rebaseJointToWorld`, store L534-548, 592-598); Scale is a documented no-op (a pivot stays unit-scaled).
  - otherwise → `setJointPose` for just that keyframe.
- Undo: one push at gizmo drag-start (`onDragStart` pose branch, `EditorScene.ts:419-424`); the store mutations are streaming.
- `$isPoseEditing` computed (`animationStore.ts:67-70`: anim mode + anim + joint + keyframe) makes `SelectionToolbar` show the Move/Rotate/Scale switcher even though the viewport selection is empty (`src/ui/SelectionToolbar.tsx:36-66`) — otherwise the tool switcher would be unreachable while posing. Duplicate/Chain/Delete stay gated on a real selection.

### 1.7 Joint pivot tooling ("pivot IS the rotation center")

- **"Set pivot to <instanceId>"** button per JointRow (`AnimationPanel.tsx:443-463`): enabled with exactly ONE viewport-selected placement; snaps the joint's REST frame onto that placement (position + orientation) via `setJointPivot` (store L572-584, discrete undo). Tooltip explains; **"pos only"** ghost button variant keeps the joint's current orientation (`orientation:false`, L464-476) so you can rotate about a world axis.
- Math: `rebaseJointToWorld` rewrites every keyframe's local pose `P'(t) = W_parent(t)⁻¹ · B · W_J(t)` with `B = Wtgt · W_J(rest)⁻¹` — preserves the rest-anchor geometry exactly (no load/preview jump), rigidly carries authored motion to swing about the new pivot.
- **AxesHelper pivot marker:** always-on 0.4-unit `THREE.AxesHelper` at the active joint's rest world frame while the anim editor is open with a joint selected; non-pickable (`EditorScene.ts:249, 292-295, 1727-1743`).
- ⚠️ Inconsistency (see §4.6): the marker and the pivot-drag special case are hard-coded to **t=0**, but `restAnchorTime` may be the LAST keyframe for imported deploy clips; `selectKeyframeForEditing` auto-picks Move for the rest-ANCHOR keyframe. For an imported deploy clip these three disagree.

### 1.8 Segment easing

- **UI path:** PoseEditor → "Easing → next pose" (only when a later keyframe exists; `AnimationPanel.tsx:658-677`) → `EasingEditor` (`src/ui/EasingEditor.tsx`): 10-preset dropdown (linear/easeIn/Out/InOut × plain/cubic/sine; `easing.ts:21-32`) + a draggable 2-handle CSS-style cubic-bézier SVG curve. Handle x clamped [0,1] (monotonic time), y free within [-0.5, 1.5] (overshoot/anticipation allowed). "Custom curve" appears in the dropdown when the points match no preset.
- Store: per-joint per-segment `setJointSegmentEasing` (streaming; store L467-477); linear configs are stored as ABSENT (`applyEasing` L449-459) so exports stay byte-identical. **"All joints"** button copies the current easing to every joint on the segment (`setSegmentEasingAllJoints`, discrete; L480-491).
- Semantics: the easing warps segment progress alpha for the WHOLE pose (pos lerp + quat slerp + scale lerp share one alpha; `animationRig.ts:100-130`). There is no per-channel or per-axis easing.

### 1.9 Preview: spring-loaded scrubber + play, two surfaces

- **Shared control:** `PreviewScrubber` (`src/ui/PreviewScrubber.tsx`) — Slider (0→1) + Play/Stop icon button, driving `$animPreviewU` / `$animScrubbing` / `$animPlaying`.
  - Drag: takes over playback if playing (`cancelPlayback`), sets `$animScrubbing=true`, **clears `$editKeyframeId`** (exits pose pinning), streams u. Release (`onChangeEnd`): scrubbing off, u→0 — **spring-loaded**: the override only applies while held; releasing snaps the 3D view back to the static modeled pose. This is what lets an imported deploy clip sit deployed at rest yet fold to stowed while you drag.
  - Play: `playAnimationPreview` (store L121-141) — rAF loop, real speed, once, then `stopAnimationPreview` (snap back to rest). Stop button while playing = immediate reset. No loop, no speed control, no pause-in-place.
- **Surface A (inline):** inside AnimationEditor with a `PreviewProgressLabel` status line ("Preview 43%" / "(pinned to edited pose)" / "(drag, or ▶ to play)"); the label is isolated into its own leaf component because subscribing `$animPreviewU` higher up cascaded a full react-aria subtree reconcile ~120×/s and tanked FPS (`AnimationPanel.tsx:223-244` — an important perf lesson for v2).
- **Surface B (floating):** `FloatingPreviewToolbar` (`src/ui/FloatingPreviewToolbar.tsx`) — desktop: absolute z-30 draggable bar (grip handle), default top-center at `top:4rem` just below the main toolbar, position persisted in `$animPreviewFloatPos` (`uiStore.ts:69-76`, localStorage, cleared by global data reset), clamped on-screen after viewport resizes. Phone: static bar pinned into the top toolbar stack (mounted by `App`, `src/app.tsx:92`), no drag. Mounted at `src/app.tsx:107` (desktop). Self-gates: renders only in anim mode with a clip open.
- **Viewport application:** `applyAnimationPreview` (`EditorScene.ts:814-864`): reverts previous overrides, then, only while `editKf` pinned or scrubbing, sets each member's group matrix to `previewOverrideMatrix` = `W_J(t)·W_J(rest)⁻¹·placement` (`animationRig.ts:211-222`). SubPart-owned **colliders and lights follow the posed frame** (`positionColliders`/`positionLights` with the posed map — mirrors KSA's collider refresh).

### 1.10 Gizmo write-back protection while posed

While the preview shows a posed (non-rest) frame and any selected SubPart (or a SubPart-owned collider/light whose owner is animated) is a joint member, the selection gizmo is **detached** (`previewLocked`; `isPreviewPosed` + `selectedIsAnimated`, `EditorScene.ts:776-812, 1675-1681`) so a drag can never bake the previewed pose into the document as a static placement. Silent — no toast/indicator (§4.8).

### 1.11 Rest anchor (`restKeyframeId` / `restAnchorTime`) — deploy clips modeled DEPLOYED

- `restAnchorTime(anim)` (`animationRig.ts:200-203`): timeline time of the modeled-rest keyframe; defaults to earliest (t=0, hand-authoring convention); importer points it at the LAST keyframe for KSA deploy clips (part is modeled fully-deployed; t=0 is stowed — anchoring at 0 would re-apply the whole deploy on load).
- Set on import: `decodeAnimationGlb` compares each leaf's GLB world position at first vs last keyframe against the modeled placement and picks the closer end (`restAtLastKeyframe`, `animationImport.ts:316-335`); `importBuiltInPart` maps it to the fitted clip's last keyframe id (`partImport.ts:70-72`).
- Used by: preview override, GLB export leaf offsets (`buildAnimationRig` anchorT, `animationRig.ts:282-291`), pivot rebasing (`rebaseJointToWorld`), keyframe auto-tool pick. Flexo-internal ONLY — never serialized to KSA XML; persisted in project JSON as `rk` (`projectCodec.ts:1238,1251,1270`).
- There is **no UI** showing or changing which keyframe is the rest anchor (§8 open question).

### 1.12 KSA clip import (built-in Part → editable animation)

- **UI path:** Add → Part browser → import a built-in KSA Part (out of this area's scope UI-wise); animations ride along automatically.
- Flow (`src/state/partImport.ts:20-107`): fetch each `<KeyframeAnimationModule>`'s `_Anim.glb` from the asset mirror → `decodeAnimationGlb` (hand-rolled GLB parse; FLOAT accessors, LINEAR/STEP only — **CubicSpline clips would silently mis-decode**, scope gotcha #3) → override each animated SubPart's placement with the GLB-faithful rest pose (`memberRestPlacements` — KSA ignores geometry `<Position>` for animated SubParts) → `addPart` regenerates instance ids and `remapImportedAnimation` (`animationImport.ts:376-416`) rewrites member/solar refs through the old→new map in the same undo step → `fitAnimationEasing` (`src/ksa/easingFit.ts`) reverse-fits the dense ~24-30fps baked keys back to a handful of keyframes + cubic-bézier easing (tolerances: 4 mm pos, 2.5° rot; joints that don't fit keep their dense keys losslessly) → `restKeyframeId` set when `restAtLastKeyframe`.
- Solar tracking (`<SolarTracking DegreesPerSecond SubPart>` + `<ExcludeSubPart>`) round-trips through the same remap.

### 1.13 GLB + XML export

- `buildAnimationRig` (`animationRig.ts:250-333`): Part root node at **identity** (load-bearing since KSA 5056 — a non-identity root would shift clips in-game), one node per joint (base TRS = rest local pose), leaves named === instance id with static offset `W_J(rest)⁻¹·placement`, channels baked per joint — eased segments densified to `BAKE_FPS = 30` LINEAR samples (KSA plays only LINEAR/STEP), linear segments stay sparse; consecutive quaternions hemisphere-matched so KSA's slerp takes the short way; scale channel emitted only when it varies.
- `buildAnimationGlb` (`src/ksa/exportAnimationGlb.ts:30`): hand-rolled 2-chunk binary GLB (three's GLTFExporter would prune the empty named leaf nodes KSA requires).
- XML: `partXmlSerializer.ts:175-177` emits one `<KeyframeAnimationModule>` per exportable animation via `buildAnimationModuleElement` (L965+): `ShowDeployRetract="true"` for deployRetract, `<KeyframeAnimation Path Id>`, `<SolarTracking>` passthrough. Ids/paths from `animationNaming.ts` (`animModuleId`, `animGlbPath` — `<base>_<sanitizedName>_<idSuffix>_Anim`).
- Export gate: `isAnimationExportable` (`animationNaming.ts:40-44`) — ≥1 joint with members, ≥2 keyframes, max time > 0. Non-exportable clips are silently skipped by the exporter and flagged "(draft)" in the list.
- Mod bundle: `modExport.ts:798-804` writes `Animations/<id>.glb` **independently of custom meshes** (a Core-only part can still be animated; L1271-1272).

### 1.14 Solar tracking editor

- **UI path:** AnimationPanel → SolarTrackingEditor (only when mode = Deploy/Retract; `AnimationPanel.tsx:246-315`): Switch "Sun tracking (solar panel)", Select "Rotates to track" (choices = the union of all joints' memberInstanceIds — raw instance-id strings), NumberField "°/s", and per-member "Stays fixed (doesn't track)" Switches (exclude list).
- Store: `setSolarTracking` (store L232-237), whole-spec replace, discrete undo.

### 1.15 Escape unwinding + ephemeral-state clamping

- Escape (raw `window` keydown listener in AnimationPanel, `AnimationPanel.tsx:83-94`; skipped while typing in inputs): unwinds deepest-first — edited keyframe → active joint → active animation (which also stops playback).
- `initAnimationStore` (`animationStore.ts:607-624`, called from `src/main.tsx:45`): `$part.subscribe` clamps `$activeAnimationId/$activeJointId/$editKeyframeId` to entities that still exist after undo/redo/project swap.

### 1.16 Cross-cutting: undo/redo, project transfer

- All discrete animation mutations push one undo (`mutate`, store L150-155); streaming mutations (`stream`) rely on caller pushing at interaction start (gizmo drag-start, NumberField focus, easing drag start). Undo history is on `$part`; the anim atoms are ephemeral like selection.
- Project export/import (data-only JSON paste): animations cloned with fresh ids; member and solar refs remapped through the placement instance-id map; dropped refs pruned (`src/state/projectTransfer.ts:515-535`).

---

## 2. UI surface map

| Surface                    | Kind                   | Mounts / positioning                                                                                                                                                                         | Notes                                                                                                                                                                                                                                                            |
| -------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Anim (N)" button          | toolbar button         | Assets toolbar (sidebar top, assets mode)                                                                                                                                                    | entry point; count badge                                                                                                                                                                                                                                         |
| `AnimToolbar`              | sidebar toolbar        | top of inspector body in anim mode (`InspectorContent`)                                                                                                                                      | Mesh Picker + clip name + Close                                                                                                                                                                                                                                  |
| `AnimationPanel`           | sidebar panel (full)   | inspector body, fills sidebar; desktop `RightPanel` (absolute right-3 top-3 bottom-3, resizable 240-640px persisted) / phone `MobileInspector` bottom sheet                                  | ONE scrolling column containing: clip list (max-h-44), name/mode/duration, preview label+scrubber, Joints section, Poses section, PoseEditor, SolarTracking                                                                                                      |
| `PoseEditor`               | inline card            | inside AnimationPanel                                                                                                                                                                        | accent-bordered; numeric pose + easing                                                                                                                                                                                                                           |
| `EasingEditor`             | inline widget          | inside PoseEditor                                                                                                                                                                            | SVG bézier w/ pointer-captured handle drags; `overflow: visible` (handles can overhang the box)                                                                                                                                                                  |
| `PreviewScrubber` (inline) | inline                 | inside AnimationPanel                                                                                                                                                                        | duplicated by the floating bar (shared atoms keep them in sync)                                                                                                                                                                                                  |
| `FloatingPreviewToolbar`   | floating draggable bar | desktop: `absolute z-30` over workspace, default `left:50% top:4rem translateX(-50%)`, drag-grip, persisted pos, on-screen clamped; phone: static, in the top-center stack (`app.tsx:88-95`) | **default position overlaps the SelectionToolbar/MultiSelectToolbar stack area** (both anchor top-center below the main toolbar); during pose editing SelectionToolbar IS visible → the two float within px of each other until the user drags the scrubber away |
| `MeshPickerModal`          | modal dialog           | react-aria Modal, `variant="fullscreen"` `max-w-2xl` (portal, overlay)                                                                                                                       | covers the viewport — you cannot look at/click the 3D scene while picking; rows are text-only instance ids                                                                                                                                                       |
| `SelectionToolbar`         | floating bar           | top-center stack under main toolbar (`app.tsx:87-95`)                                                                                                                                        | shown for `$isPoseEditing` even with empty selection (tool switcher for the pose gizmo)                                                                                                                                                                          |
| Pose gizmo (poseProxy)     | 3D HUD                 | three.js `TransformControls` attached to an empty group in the scene                                                                                                                         | shared single gizmo instance with selection/engine proxies; precedence: pose > engine > selection                                                                                                                                                                |
| Joint pivot marker         | 3D HUD                 | `THREE.AxesHelper(0.4)` in scene root                                                                                                                                                        | non-pickable, shows active joint's t=0 world frame                                                                                                                                                                                                               |
| Draft/export warnings      | inline text            | AnimationPanel list area                                                                                                                                                                     | "(draft)" chip + warning paragraph                                                                                                                                                                                                                               |

Known stacking: floating scrubber z-30; SelectionToolbar lives in a plain flex stack (no z), main toolbar above; the react-aria Modal overlays everything. No portal for the floating scrubber (plain absolute in App root).

---

## 3. State & data flow

**Document (undo-tracked, persisted):** `$part.animations` — full `PartAnimation[]` incl. `restKeyframeId` and easings. Persisted via `projectCodec` compact form (`CAnimation {id,n,d,dr?,j,kf,rk?,st?}`, `src/state/projectCodec.ts:1150-1279`) into project JSON (projectStore persistence; schema-versioned, boot-purge on mismatch — no migration ever). Linear easings deliberately not stored; deployRetract encoded as presence flag `dr:1`.

**Ephemeral (never persisted, not undo):** `$activeAnimationId`, `$activeJointId`, `$editKeyframeId`, `$animPreviewU`, `$animScrubbing`, `$animPlaying` (`animationStore.ts:37-54`), `$inspectorMode` (uiStore). Clamped against `$part` by `initAnimationStore`.

**Persisted UI prefs (localStorage):** `$animPreviewFloatPos` (floating scrubber position), `$inspectorWidth`/`$inspectorVisible` (shared sidebar).

**Undo model:** discrete `mutate()` = pushUndo + structuredClone + publish; streaming `stream()` = clone+publish only, caller pushes once at interaction start (gizmo `onDragStart`, NumberField focus, EasingEditor `onEditStart`). Matches the project-wide convention documented in editorStore.

**Cross-store subscriptions (EditorScene):** `$activeAnimationId/$activeJointId/$animPreviewU/$animScrubbing/$editKeyframeId/$inspectorMode` → `applyAnimationPreview` + `updateSelection` (`EditorScene.ts:541-552`); `$part` reconcile re-applies preview and pivot marker. All through `EditorScene.sub()` (on-demand render invalidation — mandatory pattern, docs/3d-workspace.md).

**Derived/computed:** `$activeAnimation` (part × id), `$isPoseEditing` (mode × anim × joint × kf).

---

## 4. Pain points (with evidence)

1. **Everything lives in one cramped sidebar column.** `AnimationPanel` stacks clip list, metadata, scrubber, joints, keyframes, pose editor, easing curve, and solar tracking into one 240-640px scroll column (`AnimationPanel.tsx:96-124,158-220`). With a few joints + keyframes the panel is multiple screens tall; the pose editor and the keyframe you're editing can be scrolled apart.
2. **Joint membership assignment is laborious.** Attaching many subparts means either (a) viewport click-selection with the Assets list hidden (no list to select from in anim mode — `InspectorContent.tsx:15-17` comment) then "Attach N selected" per joint, or (b) the Mesh Picker modal, which: covers the 3D view (fullscreen modal), lists **raw instance ids + template ids as text** with no thumbnails, no indication of which joint (if any) a row is already attached to, and can only attach to the single **active** joint per open/close cycle (`MeshPickerModal.tsx:58-62`). Multi-joint rigs (landing legs, bay doors) require N modal round-trips.
3. **No timeline.** Keyframes are a vertical row list with a tiny `t` NumberField (w-16, `AnimationPanel.tsx:556-564`); no horizontal timeline/dopesheet, no dragging keys in time, no visualization of which joints move at which keys, no snapping between keys.
4. **Keyframe insertion is end-only.** The only add button is "＋ Pose at {duration}s" (`AnimationPanel.tsx:516-523`); inserting mid-clip = add at end, then retype the time. No "add key at current scrub position".
5. **Single shared 3-mode gizmo; single-axis interaction; no animation-specific tooling beyond the joint pivot.** The gizmo is stock `TransformControls` (`src/three/TransformGizmo.ts`) — one tool at a time (Move/Rotate/Scale via `$toolMode`), per-axis handle drags, no combined move+rotate, no screen-space rotate for poses, no rotate-around-arbitrary-point at t>0. Moving a part along multiple axes over a clip's life means many keyframes, each posed axis-by-axis with a single per-joint per-segment easing shared by ALL channels (`animationRig.ts:120-129` — one alpha warps pos+rot+scale together). No per-axis/per-channel curves, no graph editor.
6. **Rest-anchor vs t=0 inconsistency in pivot tooling.** `handlePoseGizmoChange` special-cases the pivot at `kf.timeSec === 0` (`EditorScene.ts:1854-1868`) and `updatePivotHelper` draws the marker at `jointWorld(…, 0)` (`EditorScene.ts:1738`), but `selectKeyframeForEditing` auto-picks Move for the keyframe at `restAnchorTime(anim)` (`animationStore.ts:83`) — which for an imported deploy clip is the LAST keyframe. On such clips: selecting the last (rest-anchor) keyframe arms Move but a drag edits the pose (not the pivot); selecting t=0 arms Rotate but a rotate-drag silently rebases the pivot. The pivot marker also doesn't sit on the modeled rest frame for those clips.
7. **Scrubbing silently exits pose editing.** `PreviewScrubber.onChange` clears `$editKeyframeId` (`PreviewScrubber.tsx:39`) — grabbing the slider to check the motion throws away the "editing" pin, and getting back requires re-clicking the keyframe row.
8. **Silent gizmo lock.** With a posed preview shown, selecting an animated SubPart just detaches the gizmo (`previewLocked`, `EditorScene.ts:1675-1681`) with no toast or visual reason — feels broken until you learn the rule.
9. **Escape overload via a raw window listener.** AnimationPanel's window keydown (`AnimationPanel.tsx:83-94`) coexists with react-aria dialog dismissal, the seat-view Escape hotkey, and NumberField's Escape-cancels-edit; the panel handler only exempts focused inputs, so an Escape aimed at a popover/dialog can also unwind the animation sub-selection.
10. **No animation hotkeys at all.** The global registry (`src/ui/hotkeys/registry.ts`) has zero animation bindings — no play/pause, no next/prev keyframe, no add-key; the W/S/A/D/Q/E rotate and arrow-nudge hotkeys act on the (empty-during-posing) selection, so the keyboard is inert while posing except Escape.
11. **Joint chains rendered flat.** Parent is a per-row Select ("under X"); there is no tree/hierarchy view, no drag-to-reparent, no indication of chain depth (`AnimationPanel.tsx:423-440`).
12. **Solar tracking selects raw instance ids** (`AnimationPanel.tsx:273-281`) — unreadable for imported parts with generated ids.
13. **No scale fields in PoseEditor** (`AnimationPanel.tsx:630-657` has only position+rotation) — scale animation exists in the data model and export, but is authorable only by gizmo drag, and not numerically.
14. **High-frequency atom fragility.** `$animPreviewU` updates every rAF; the `PreviewProgressLabel` isolation comment (`AnimationPanel.tsx:223-229`) records that subscribing it in the wrong component tanked playback FPS — v2's transport/timeline must keep high-frequency preview state out of wide React subtrees.
15. **Prior cleanup round already spent:** every item in `plans/ANIMATION_UX_CLEANUP_TODOS.md` (GridList members, searchable parent select, click-card-selects-joint, floating draggable scrubber, play button with rest-snap) is implemented — the remaining pain is structural, not polish.
16. **Two scrubbers by design** (inline + floating) — synced but redundant; the floating one's default anchor collides with the SelectionToolbar stack (§2).
17. **Preview limitations:** play-once only, no loop, no speed multiplier, no pause-and-hold (Stop snaps to rest), no frame-step.
18. **Add-keyframe kills the previous segment's easing** (`animationStore.ts:392-397`) — documented and geometrically justified, but surprising with no UI warning.
19. **Duration edits rescale all keyframe times** (`animationStore.ts:219-230`) — often what you want, but there's no "keep times, extend tail" alternative.
20. **Export failures are quiet:** non-exportable animations are skipped with only the "(draft)" chip and a summary warning; nothing points at WHICH requirement (joint members vs keyframes vs duration) is missing per clip.

---

## 5. Invariants & constraints (MUST survive v2)

**KSA game contract (scope/animation.md, baseline 2026.8.3.5117 — INTACT):**

- GLB node convention: exactly one parentless root = the Part node, **identity TRS** (load-bearing since 5056); joints = animated nodes; every mover is a NON-animated leaf whose `Name` === SubPart instance id, statically offset under its joint; a directly-animated SubPart node is silently a no-op; only `animations[0]` is read.
- Export: **LINEAR samplers only**; eased segments baked to dense LINEAR at `BAKE_FPS = 30`; quaternion hemisphere continuity across the dense stream; scale channel only when varying; hand-rolled GLB writer (GLTFExporter would prune the required empty leaves).
- XML: `<KeyframeAnimationModule Id>` + `<KeyframeAnimation Path Id>`; `ShowDeployRetract` ⇔ deployRetract mode; `<SolarTracking DegreesPerSecond SubPart>` + `<ExcludeSubPart>` children; deterministic naming via `animModuleId`/`animGlbPath`.
- Import: KSA positions animated SubParts SOLELY from the GLB (geometry `<Position>` ignored) → placement override with `memberRestPlacements`; rest-keyframe detection (first vs last) → `restKeyframeId`.
- **Connectors/kittens can never be joint members** (MeshPickerModal SubParts-only gate is deliberate; KSA limitation).
- Coordinate convention: KSA "XYZ" Euler ≡ three.js `'ZYX'`; ALL matrix math through `coords.ts` `matrixFromTransform`/`transformFromMatrix`.

**Data/persistence:**

- Project JSON compact codec for animations (`CAnimation` et al.) — schema-versioned; **no migration code ever** (boot purge policy). `restKeyframeId` is flexo-internal, never serialized to KSA.
- Linear easing stored as ABSENT (byte-identical export + clean data).
- Project transfer (paste) remaps animation ids + member/solar refs and prunes dropped ones.

**Editor semantics users depend on:**

- Rest anchoring: preview/export math `W_J(t)·W_J(rest)⁻¹·placement` with `restAnchorTime`; spring-loaded scrubber (override ONLY while scrubbing/pinned; release snaps to modeled pose); imported deploy clips display deployed at rest.
- Pivot semantics: joint rest pose IS the rotation center; `moveJointPivot` (rigid, geometry-invariant at every t), `setJointPivot`/"Set pivot to selection" (rest-geometry-preserving rebase, orientation optional), pivot stays unit-scaled.
- Attach exclusivity within one animation (a SubPart driven by at most one joint per clip); cycle-guarded reparenting; removing a joint reparents its children.
- Rest keyframe (t=0) is undeletable and unmovable; keyframe seeding is on-curve; duration rescale behavior.
- SubPart-owned colliders and lights follow the posed preview; gizmo write-back locked while a posed frame is shown.
- `isAnimationExportable` gate + draft skipping.
- Undo conventions: discrete vs streaming with interaction-start push; ephemeral id clamping after undo/redo.
- **Numeric inputs:** every numeric field MUST be `useNumberDraft`-based (`NumberField`/`PreciseNumberInput`, text inputs with `inputMode="url"`) — project-wide mandate.
- Perf: on-demand rendering (`EditorScene.sub` invalidation); high-frequency preview atoms must not fan out into wide React subtrees.

---

## 6. Hotkeys

Animation-specific: **none in the global registry** (`src/ui/hotkeys/registry.ts` — verified; groups are Rotate selection, Nudge, Editing, General).

- **Escape** — AnimationPanel-local raw `window` keydown (`AnimationPanel.tsx:83-94`): unwind keyframe → joint → animation (ignored while typing). Not in the registry/help overlay.
- Registry hotkeys that INTERACT with the area: `mod+z`/`mod+y` undo/redo (animation mutations are on `$part`); Delete/Backspace, W/S/A/D/Q/E rotate, arrows nudge etc. act on the viewport selection — which the user still uses in anim mode to select subparts to attach ("Attach N selected" / "Set pivot to selection"). During pose editing the selection is empty so these are inert.
- NumberField built-ins apply to all animation numeric fields: ArrowUp/Down step (Shift ×10, Alt ×0.1), Escape cancels a dirty edit.
- Mesh Picker list: click / Cmd-click / Cmd+A / Shift+click range / Shift+arrows (`useShiftRangeSelect`).

---

## 7. Cross-area dependencies

**Animation depends on:**

- `editorStore`: `$part` (document), `pushUndo`, `$selectedIndices`/selectors (attach + centroid seeding + Set-pivot), `$toolMode` (auto tool pick writes it).
- `uiStore.$inspectorMode` (mode gate for panel, preview, gizmo, pivot marker, floating bar).
- `EditorScene`/`TransformGizmo`: the ONE shared gizmo, with attach precedence pose > engine-exhaust > selection; `SelectionManager` viewport picking for attach flows.
- `catalogStore`/`partCatalogStore` + asset mirror fetches (import GLBs); `coords.ts`.
- Layers: locked/invisible layers block viewport selection of would-be members (`EditorScene` onSelect guards).

**Other areas depending on animation:**

- `SelectionToolbar` reads `$isPoseEditing` (show tool switcher with empty selection).
- `modExport` + `partXmlSerializer` (GLB + XML emit; export independent of custom assets).
- `projectCodec` / `projectTransfer` (persistence + paste remap).
- Colliders & lights rendering: `positionColliders`/`positionLights` accept posed frames; collider/light gizmo locking consults joint membership (`selectedIsAnimated`).
- Engine designer shares the `$inspectorMode` full-sidebar pattern and the same gizmo/toolbar conventions — v2's mode design should treat 'anim' and 'engine' symmetrically.
- App shell: `FloatingPreviewToolbar` mounted twice in `app.tsx` (phone stack / desktop floating).

---

## 8. Open questions for the v2 design

1. **Timeline representation:** horizontal timeline/dopesheet (per-joint tracks, draggable keys, playhead-anchored insertion) vs keeping a compact list? A real timeline resolves pains 3/4/17 but costs sidebar width — does it live in the bottom status-bar region, a bottom panel in anim mode, or the right sidebar?
2. **Where does pose editing live:** keep the single shared TransformControls gizmo with mode auto-pick, or add an animation-specific gizmo (rotate-about-pivot ring at the pivot marker, multi-axis pose manipulation, screen-space rotate)?
3. **Pivot editing as an explicit tool:** today "pivot mode" is implicit (t=0 keyframe + Move/Rotate). Should v2 make "Edit pivot" a named mode/tool — and should it anchor on `restAnchorTime` rather than t=0 (fixing the §4.6 inconsistency), with the marker following?
4. **Rest anchor exposure:** keep `restKeyframeId` invisible/automatic, or surface it (badge on the anchor keyframe, "re-anchor here" action) for users hand-authoring deploy-style clips?
5. **Membership UX:** replace the Mesh Picker modal with (a) a non-modal sidebar list visible in anim mode (assets list with per-joint assignment column), (b) a click-in-viewport "paint members onto active joint" mode, or (c) both? How to show current joint ownership per subpart?
6. **Easing model:** keep one easing per joint per segment (whole-pose alpha), or move toward per-channel curves (position/rotation/scale, possibly per-axis)? Per-channel is exportable (bake handles it) but changes the data model and the fit importer.
7. **Preview transport:** keep the spring-loaded scrubber semantics (beloved: release = modeled pose) or add a latching mode (loop, pause-in-place, speed) — and if both, which is default? Does the transport belong in the new bottom status bar?
8. **Two scrubbers:** does the floating draggable bar survive when v2 has a proper transport bar, or is it exactly the kind of floating bar that no longer "earns its place"?
9. **Keyboard:** which animation hotkeys to add (space play/pause, ,/. keyframe step, K add key…) and how they cooperate with the existing selection-centric global registry + the Escape-unwind chain.
10. **Hierarchy UI:** joint tree view with drag-reparent vs current per-row Select; should joints be selectable/pickable in the 3D viewport (clicking the pivot marker)?
11. **Draft diagnostics:** per-clip export-blocker checklist (needs members / needs 2nd keyframe / zero duration) vs today's single aggregate warning.
12. **Multi-clip semantics:** should the UI warn when a SubPart is a member in TWO different animations (KSA modules would fight over its transform — noted in `types.ts:2063-2066` but unenforced today)?
