# Custom Animations in Flexo — Feasibility & Implementation Plan

## Context

KSA ships a built-in, **data-driven keyframe animation system** (`KeyframeAnimationModule`)
that the Core mod uses for landing legs, spotlights, and deploying solar panels. It needs
**no game code** for basic deploy/retract/actuate behaviour — only an animation `.glb` plus a
few XML elements on a part. Flexo's remit is to build **asset-only KSA mods** (no game-code
changes), so this system is a near-perfect fit and lets us add custom animated parts (opening
bay doors, hinges, pistons, posable jointed legs) entirely within Flexo's existing export
pipeline.

This plan is the output of a deep re-read of the **current** decompiled sources in
`thirdparty/ksa/` (the prior `plans/analysis/ANIMATION_SYSTEM_ANALYSIS.md` was written against
an older decompile and contains one **critical error**, corrected below), the four built-in
animated parts and their `.glb`/XML data, and Flexo's own data model + export pipeline.

**Decisions taken with the user (2026-05-31):**
1. **Scope** — specify the pure-data tier (no game code) in full; include the generic
   code-mod tier as a researched design *sketch* (a separate later effort).
2. **Authoring UX** — **pose-based snapshots** (reuse the existing gizmo to pose joints;
   snapshot transforms as keyframes), not a per-track timeline editor.
3. **Rig depth** — ship a **single-joint MVP first** (doors/hinges/pistons/lids/chair), then
   add nested joint hierarchies (kinematic chains: spider legs) as a follow-up phase.

---

## Feasibility verdict

| Capability | Pure data (XML + `.glb`, no game code)? | Notes |
|---|---|---|
| Deploy / Retract button (bay doors, gear, antennae) | ✅ Yes | `ShowDeployRetract="true"` |
| Actuate 0→1 slider (manual hinge/piston/lid/chair angle) | ✅ Yes | `ShowDeployRetract="false"` |
| Multi-joint kinematic chain, **posable** (spider leg, articulated gear) | ✅ Yes | Nested joints in the `.glb`; Phase 2 |
| Sun-tracking solar panel | ✅ Yes | Built-in `<SolarTracking>` extension |
| **Continuous loop / auto-play** (a walking *gait*, a free-spinning rotor/chair) | ❌ No | Timeline clamps to `[0,Duration]`, never loops — needs the code-mod tier |
| Action-group / hotkey binding, velocity-phased motion | ❌ No | Needs the code-mod tier |
| Animation moves mass/CoM/inertia | ❌ No | Visual only; physics uses a cached mass snapshot |

**Bottom line:** Custom animations are **practical and fit Flexo's asset-only remit** for the
deploy/retract + actuate use-cases, which cover the rocket-bay doors and a manually-posable
spinning chair outright, and the spider-leg rover's *structure* (posable legs). A true
automatic **walking gait** or **continuous spin** is the one thing that needs a small generic
companion code mod (Tier 2, sketched at the end).

---

## How KSA's keyframe animation system actually works (verified against `thirdparty/ksa/`)

### The data flow
`<KeyframeAnimationModule>` is a part module declared on **`<PartGameData>`** in a
`*GameData.xml` file (NOT on `<Part>` in `*Assets.xml`). It points at an animation `.glb`. At
part construction `KeyframeAnimationModule.CreateComponents` builds the module and immediately
calls `ApplyAnimationTransforms(TimeGoal)` (`KeyframeAnimationModule.cs:86-118`). Each sim step
`UpdateModules` walks `TimeCurrent` toward `TimeGoal` by raw `DeltaTime` and re-applies
transforms (`:133-186`). **1 s of sim = 1 unit of timeline = 1 s of glTF time** ⇒ the authored
**Duration *is* the deploy time**.

### The UI toggle (`ShowContextMenu`, `KeyframeAnimationModule.cs:188-220`) — verified exact
```csharp
if (ShowDeployRetract) {                       // Deploy/Retract buttons
    if (state == Retracted && Button("Deploy"))  TimeGoal = Shared.Duration;
    else if (state == Deployed && Button("Retract")) TimeGoal = 0f;
} else {                                        // "Actuate" slider
    float v = TimeGoal / Shared.Duration;
    if (SliderFloat("Actuate", ref v, 0, 1))   TimeGoal = v * Shared.Duration;
}
```
The user's observed light "Actuate" slider = the `ShowDeployRetract="false"` branch.

### ⚠️ Critical correction to the prior analysis — the **joint-skeleton rule**
The prior `ANIMATION_SYSTEM_ANALYSIS.md` claims you can name a glTF node = a SubPart Id and
animate it directly. **That is wrong and silently produces no motion.** Verified in
`KeyframeAnimationData.cs:178-204`:

- The loader groups animation channels by target node into a `dictionary` of **animated
  nodes** (`:101-114`).
- It then builds `PartLookup` (keyed by node name) **only from nodes NOT in that dictionary**:
  `if (dictionary.ContainsKey(m)) continue;` (`:180`) — i.e. it **skips every directly-animated
  node** — and for each remaining *named* node walks up to its **nearest animated ancestor**,
  storing the node's own static TRS + a pointer to that ancestor (`:184-202`).
- `ApplyAnimationTransforms` looks subparts up by `part.Id` in `PartLookup` (`:233`). A subpart
  not found is **reset to its rest pose** (`:242-243`).

⇒ If you animate a node named like the subpart, it lands in `dictionary`, is skipped from
`PartLookup`, never matches, and the subpart sits still. **The mandatory pattern (exactly what
every Core `.glb` does) is:**

1. Build a skeleton of **joint nodes** (`*_RotaryJoint`, `*_PistonJoint`, …) that carry the
   animation channels.
2. Each moving subpart is a **non-animated leaf node, named === its SubPart instance `Id`**,
   parented **directly under** the joint that should drive it.
3. The leaf's static local TRS is its offset from the joint; KSA composes
   `world(leaf,t) = leafStatic × jointLocal(t) × …up the chain` (`EvaluateWorldMatrix`,
   `:224-243`) and assigns the decomposed result to the subpart's Part-local transform.

The Core landing leg proves the chain pattern (extracted from
`Animations/CoreLandingA_Prefab_MediumLandingLegA_Anim.glb`):
```
Part(root) → RotaryJoint → {MediumBoreA1(leaf)}  and  ActuatorRootJoint
   → ActuatorJoint → {MediumStrutsA1(leaf)}
   → PistonJoint   → {MediumPistonA1(leaf)} → FootSocketJoint → {MediumFootA1(leaf)}
```
Every `*Joint` carries rotation/translation channels; every `*_Subpart_*1` is a static leaf.
This is a baked FK rig — and it is exactly the structure a spider leg needs.

### Other verified facts (unchanged from prior analysis)
- **Only `Animations[0]` is read** (`:100`). One timeline per `.glb`.
- **Interpolation:** `Step` and `Linear` honoured; **`CubicSpline` is parsed but silently
  falls through to linear** (`InterpolateFloat3/Quat`, `:280-322`). ⇒ author with linear keys;
  add intermediate keys for easing. Rotations use `Slerp`, translations/scales `Lerp`.
- **Duration** = max keyframe time over all channels (`:163`).
- **Extensions are not XML-pluggable** — only `<SolarTracking>` is hard-wired in
  `CreateComponents` (`:100-114`). Custom active behaviour needs code.
- **Mass/CoM/inertia are not recomputed** by animation (render-transform only).

### Where the XML lives (verified against Core `*GameData.xml`)
```xml
<!-- CoreElectricalAGameData.xml -->
<PartGameData Id="CoreElectricalA_Prefab_SolarPanelB">
  <KeyframeAnimationModule Id="SolarPanelAnimation" ShowDeployRetract="true">
    <KeyframeAnimation Path="Animations/CoreElectricalA_Prefab_SolarPanelB_Anim.glb" Id="..._Anim"/>
    <SolarTracking DegreesPerSecond="5" SubPart="CoreStructuralA_Subpart_DriveRotorB1">
      <ExcludeSubPart>CoreStructuralA_Subpart_DriveHousingB1</ExcludeSubPart>
    </SolarTracking>
  </KeyframeAnimationModule>
</PartGameData>
```

---

## The three concrete examples, mapped to phases

| Example | What's achievable | Tier / Phase |
|---|---|---|
| **Cylindrical rocket bay with doors that open** | Each door = a joint at its hinge edge, panel subparts attached, rotate closed→open. Deploy/Retract (or Actuate for partial). | Pure data — **Phase 1** (one joint per door) |
| **Chair that can spin** | *Manual* positioning via the Actuate slider. | Pure data — **Phase 1** |
| …chair that spins **continuously by itself** | Free-running spin. | **Tier 2** code mod |
| **Walking rover, jointed spider legs** | Leg *structure* + posable / deployable multi-segment chains (landing-leg pattern). | Pure data — **Phase 2** (chains) |
| …legs that actually **walk** (gait cycle) | Looping, velocity-phased gait. | **Tier 2** code mod |

---

## Flexo implementation plan — pure-data tier

### Guiding convention
The editor's static pose (placements) **is the animation's rest state at t=0** (closed /
retracted / default). Target poses are authored at t>0. This guarantees the part loads with no
jump (KSA calls `ApplyAnimationTransforms(TimeGoal=0)` at construction) and keeps the placement
transforms authoritative for both the editor and KSA's fallback rest pose.

### 1. Data model (`src/ksa/types.ts`)
Add animation entities to `EditingPart`. Joints are scoped **inside** each animation (a subpart
should be driven by at most one module, so each animation owns its rig):

```ts
/** A pivot frame the animation rotates/translates; subparts attach to it rigidly. */
export interface AnimationJoint {
  id: string
  name: string
  /** Rest pivot frame (t=0) in Part space, KSA convention — same shape as a placement. */
  pivot: Transform
  /** Phase 2 chains: parent joint within the same animation, or null (root-level). */
  parentJointId: string | null
  /** Placement instanceIds rigidly attached to this joint (become leaf nodes). */
  memberInstanceIds: string[]
}

/** A snapshot of every driven joint's frame at one time on the 0→Duration axis. */
export interface AnimationKeyframe {
  timeSec: number
  /** jointId → that joint's frame (Part space) at this time. t=0 frame === joint.pivot. */
  poses: Record<string, Transform>
}

export type AnimationMode = 'deployRetract' | 'actuate' // → ShowDeployRetract bool

export interface PartAnimation {
  id: string
  name: string                 // basis for the module Id + glb filename
  durationSec: number
  mode: AnimationMode
  joints: AnimationJoint[]      // Phase 1: exactly one, parentJointId=null
  keyframes: AnimationKeyframe[] // sorted; keyframes[0].timeSec === 0 (rest)
  /** Optional passthrough to the built-in extension (real solar panels). */
  solarTracking?: { degreesPerSecond: number; subPartInstanceId: string; excludeInstanceIds: string[] }
}
```
Add `animations: PartAnimation[]` to `EditingPart` and `animations: []` to `createEmptyPart()`.
No change to `SubPartPlacement` — joints reference placements by `instanceId`.

### 2. Rig generation + the transform math (new `src/ksa/animationRig.ts`)
KSA reproduces standard scene-graph world transforms (its row-vector `leaf × joint × …` equals a
glTF column-vector hierarchy — verified against `EvaluateWorldMatrix`). So compute everything in
standard three.js terms:

- **Joint node**: world(t) = the joint's posed frame; **local(t) = parentWorld(t)⁻¹ · pose(t)**
  (Phase 1, parent = root identity ⇒ local(t) = pose(t)). Emit translation + rotation (+ scale
  if used) tracks sampled at each keyframe time.
- **Leaf node** (per attached placement, **name = `instanceId`**, no channels):
  **localStatic = jointWorld(0)⁻¹ · placementMatrix** = `pivot⁻¹ · placement`. Constant.
  Then KSA's `world(leaf,t) = pose(t) · pivot⁻¹ · placement` ⇒ equals `placement` at t=0 and is
  carried rigidly by the joint's delta thereafter.

Use three.js `Matrix4`/`Quaternion` and the existing KSA↔three.js mapping in `src/three/coords.ts`
so the animation `.glb` shares the **exact axis convention already validated in-game** for the
mesh atlas. Output: a small node tree (`{name, translation, rotation(quat xyzw), scale, children}`)
+ per-joint `{times[], translations[]?, rotations[]?}` tracks.

### 3. Animation GLB writer (new `src/ksa/exportAnimationGlb.ts`)
**Hand-roll the glb** (recommended over `GLTFExporter`): KSA's loader is strict about node
names/hierarchy and `GLTFExporter` prunes empty, non-animated leaf nodes (exactly our subpart
leaves). The structure is tiny and fully deterministic — `nodes` (hierarchy + names + TRS),
**one** `animation` (samplers: input=time accessor, output=TRS accessor; channels: target node +
path), one binary buffer. No meshes/materials/images (KSA ignores them in the animation loader).
Reuse the GLB chunk-packing approach already in `src/ksa/exportGlb.ts:nameMeshesFromNodes`
(`buildAnimationGlb()` mirrors its header/chunk layout + 4-byte padding). Include `min`/`max` on
the time accessor for glTF-validator cleanliness (cheap; KSA doesn't need it).

### 4. XML emission (`src/ksa/partXmlSerializer.ts`, `serializeGameData`)
Emit one `<KeyframeAnimationModule>` per animation inside `<PartGameData>` (the verified
location). Pattern to add after the editor tags block (`:81-86`):
```ts
for (const anim of part.animations) {
  const mod = doc.createElement('KeyframeAnimationModule')
  mod.setAttribute('Id', animModuleId(anim))           // e.g. `${base}_${anim.id}`
  if (anim.mode === 'deployRetract') mod.setAttribute('ShowDeployRetract', 'true')
  const ref = doc.createElement('KeyframeAnimation')
  ref.setAttribute('Path', animGlbPath(base, anim))     // "Animations/…_Anim.glb"
  ref.setAttribute('Id', animModuleId(anim))
  mod.appendChild(ref)
  // optional <SolarTracking …><ExcludeSubPart>… from anim.solarTracking
  gd.appendChild(mod)
}
```
The glb path must match what the bundle writes — derive it from a **shared deterministic helper**
keyed on `(base, anim.id)` so `serializeGameData` and `buildCustomBundle` agree. This requires
threading `base` into `serializeGameData` (small signature change: `serializeGameData(part, base)`;
`buildModContent` already computes `base`).

### 5. Export bundle wiring (`src/ksa/modExport.ts`, `buildCustomBundle`)
After the mesh-atlas GLB, for each `part.animations` build the rig (§2), serialize via
`buildAnimationGlb` (§3), and push `{ path: animGlbPath(base, anim), data }` into `binaries`
(written into `Animations/` by the existing `writeBinaryAtPath` / zip paths — no I/O changes
needed). The bundle already supports arbitrary relative binary paths.

### 6. UI — pose-based authoring (`src/ui/`)
A new **Animations** section in the inspector (sibling to the Assets/Layers UI in
`InspectorContent.tsx`; mirror `LayersPanel.tsx`/`AssetsList.tsx` structure and the
`react-aria`/`nanostores` patterns already in use):

- **Animation list**: create (choose `mode`, name, duration) / rename / delete.
- **Joint**: add a joint → place its pivot frame with the **existing `TransformGizmo`**; assign
  the current multi-selection of placements via "Attach to joint" (reuse `MultiSelectToolbar`).
  Phase 1 caps at one joint per animation; Phase 2 unlocks "set parent joint".
- **Poses (keyframes)**: a compact list of times (e.g. `0.0 Rest`, `Duration Open`). "Add pose
  at t" enters **pose-edit mode**: the gizmo manipulates the joint(s); on commit Flexo snapshots
  each joint frame into `keyframes[i].poses`. The t=0 rest pose is captured automatically from
  the joint pivots. Reuse the `TransformInspector.tsx` numeric-field pattern for precise pivot/
  time entry.
- **Preview**: a 0→1 scrubber that drives §7 in the viewport (linear interp, matching KSA).

### 7. Scene preview (`src/three/EditorScene.ts`)
Add an editor-only preview that, given a scrub value `u∈[0,1]` → `t=u·Duration`, computes each
joint's interpolated world frame (linear/slerp between bracketing keyframes — mirror
`InterpolateFloat3/Quat`) and sets each attached `SubPartObject`'s matrix to
`jointWorld(t) · jointWorld(0)⁻¹ · placementMatrix`. This is a transient visual override (no
document mutation); when preview is off, objects render at their placement rest pose via the
existing reconciliation path. Drive recompute on scrub (and an optional low-rate rAF for a "play"
toggle). No change needed in `SubPartObject.create`.

### 8. Store / undo (`src/state/customAssetStore.ts`, `editorStore.ts`)
All animation/joint/keyframe edits go through the existing `mutate(description, detail, fn)` so
they enroll in the undo stack exactly like custom-mesh edits. Add focused action creators
(`addAnimation`, `attachToJoint`, `capturePose`, `setAnimationDuration`, …) alongside the current
custom-asset actions. No new persistence machinery — `EditingPart` is already the serialized,
undo-tracked document, and animation descriptors are lightweight (no IndexedDB blob; the glb is
regenerated at export, like the mesh atlas).

### 9. Tests (Vitest, mirroring `editorStore.test.ts` / `exportGlb.test.ts`)
- **Rig math** (`animationRig.test.ts`): re-implement KSA's `world = leafStatic × jointLocal(t)`
  in the test and assert the generated rig reproduces the placement at t=0 and the target pose at
  t=Duration, for single-joint and (Phase 2) a 2-link chain.
- **GLB** (`exportAnimationGlb.test.ts`): valid magic/chunks; node names === instanceIds + joint
  names; exactly one animation; expected channels/paths; `Duration` = max time.
- **XML** (`partXmlSerializer.test.ts`): `<KeyframeAnimationModule>` Path/Id/`ShowDeployRetract`
  and `<SolarTracking>` emitted correctly; glb Path matches the bundle path.
- **Bundle** (`modExport.test.ts`): `Animations/*.glb` present; path/XML agreement.
- **Store**: create/attach/capture/delete are undoable.

### 10. Phasing
- **Phase 1 — single-joint MVP (pure data).** One auto-managed joint per animation, N subparts
  attached, two-pose (rest→target) Deploy/Retract or Actuate. Ships doors, hinges, pistons, lids,
  a posable chair. **Gate: in-game axis calibration** (below) before building out the full UI.
- **Phase 1.5 — `<SolarTracking>` passthrough** for real deploying solar panels (trivial once
  Phase 1 lands; pure XML).
- **Phase 2 — joint chains (pure data).** Nested joints (`parentJointId`) + a small hierarchy
  editor → multi-segment kinematic chains (spider legs, articulated landing gear). Export/rig math
  already generalises; the work is UI (build/edit the skeleton) + chain preview.

---

## Code-mod tier — design sketch (separate later effort, per scope decision)

For motion the keyframe timeline can't express — a **walking gait**, a **continuous spin**,
**action-group/hotkey** deploy, **velocity-phased** legs — ship a small **generic companion C#
mod** (e.g. `flexo-animator`) distributed alongside the asset mod. The Flexo-authored animation
`.glb` and rig are **identical**; only playback control differs. Two approaches:

1. **TimeGoal driver (preferred, reuses the built-in module).** The mod discovers
   `KeyframeAnimationModule`s (by an Id convention Flexo emits, plus a small per-part config file
   Flexo writes) and drives `TimeGoal`/`TimeCurrent` each frame per a mode: `loop`, `pingpong`,
   `once-on-event`, or `velocity-phased`, plus action-group/hotkey bindings. Pingpong (forward
   then reverse) gives a clean gait with no authoring constraints; a one-direction `loop` needs
   the animation authored so pose(Duration) ≈ pose(0) to avoid a snap. Bind via the precedent
   action-group mod referenced in the prior analysis.
2. **Direct transform driver (max flexibility).** A custom module that writes subpart
   `Asmb2ParentAsmb` each frame, composing on `*Safe` rest pose — true continuous loops, rotor
   spin, gait tied to vehicle velocity. Heavier; bypasses the keyframe module entirely.

Flexo's role: emit the per-part config (which animations loop/pingpong/bind-to-key, speeds) and
document installing the companion DLL. Optionally call `vehicle.Parts.RecomputeAllDerivedData()`
**once on settle** for big deployed booms that should shift CoM (never per frame). This tier is
out of Flexo's pure-data remit and is intentionally deferred.

---

## Verification (end-to-end)

1. **Unit**: `pnpm test` — rig-math, GLB, XML, bundle, store suites above.
2. **In-game axis calibration (Phase 1 gate).** Author a trivial animation (translate one subpart
   +1 on a single axis; rotate 90° about one axis), `writeModToFolder` into
   `Documents/Kitten Space Agency/mods/`, load KSA, place the part, and confirm the in-game
   direction/handedness matches the editor. Bake any needed remap **once** inside
   `exportAnimationGlb`/`animationRig` (mirroring the "fix axis HERE only" guidance in
   `exportGlb.ts`). This de-risks the one unknown — that glb node transforms decompose into the
   expected KSA Part-local axes.
3. **In-game functional**: build a door (Deploy/Retract) and a hinge (Actuate); confirm the
   buttons/slider appear in the part popup and the motion is correct, with no load-time jump
   (rest pose matches). Phase 2: a 2-segment leg poses correctly through the chain.
4. **UI**: project-local Playwright (per project convention; dev server base path `/flexo/`) to
   drive create-animation → attach → capture-pose → scrub-preview and assert the viewport updates.

---

## Risks & limitations
- **Axis/handedness of decomposed node transforms** — the one genuine unknown; resolved by the
  calibration gate (step 2) before UI build-out.
- **`GLTFExporter` prunes empty leaves** — avoided by hand-rolling `buildAnimationGlb`.
- **Linear interpolation only** — no eased curves; add intermediate poses for shaping.
- **No physics coupling** — deployed mass/CoM unchanged (visual only) unless the Tier-2 mod opts
  into a settle-time recompute.
- **One module per moving subpart** — overlapping animations on the same subpart fight; the UI
  should prevent attaching a placement to two animations.
- **Rest-pose discipline** — every animation's t=0 must equal the placement pose (enforced by
  construction in §2).

---

## Key files
- **KSA reference (read-only):** `thirdparty/ksa/KSA/KeyframeAnimationData.cs` (parsing/eval,
  the joint-skeleton rule at `:178-204`), `KeyframeAnimationModule.cs` (UI/apply/update),
  `thirdparty/ksa/Content/Core/CoreElectricalAGameData.xml` + `CoreLandingAGameData.xml` +
  `Content/Core/Animations/*.glb` (worked examples).
- **New:** `src/ksa/animationRig.ts`, `src/ksa/exportAnimationGlb.ts` (+ tests); new
  Animations UI components under `src/ui/`.
- **Modify:** `src/ksa/types.ts` (`PartAnimation`/`AnimationJoint`/`AnimationKeyframe` +
  `EditingPart.animations`), `src/ksa/partXmlSerializer.ts` (`serializeGameData` emits the
  module; `+base` param), `src/ksa/modExport.ts` (`buildCustomBundle` emits `Animations/*.glb`),
  `src/state/customAssetStore.ts` (action creators via `mutate`), `src/three/EditorScene.ts`
  (preview override), `src/ui/InspectorContent.tsx` (host the Animations section).
- **Reuse:** `src/three/coords.ts` (KSA↔three.js mapping), `src/three/TransformGizmo.ts` +
  `selectionTransform.ts` (pose editing), `src/ksa/exportGlb.ts` (GLB chunk-packing pattern).
