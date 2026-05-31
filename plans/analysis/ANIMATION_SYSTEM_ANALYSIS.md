# problem

the game now has a built-in animation system for parts

i want to know how this works in fine detail so that we can create custom part / subpart animations.

use all your knowledge about KSA and do a deep dive analysis of the games decompiled sources under `deomp/ksa` directory

place the analysis results into the `# analysis` section at the end of this ANIMATION_SYSTEM_ANALYSIS.md file

the analysis should contain fine details about how to go about creating custom part / subpart animations

note that in the KSA design that SubParts are the actual meshes with textures and Part's are arrangements of SubParts

i want instructions on what it will take for me to create my own animated robotics parts like a rotor, piston, hinge, etc.

# analysis

> Sourced from a deep read of the decompiled game in `decomp/ksa/`. Primary files:
> `KSA/KeyframeAnimationModule.cs`, `KSA/KeyframeAnimationData.cs`,
> `KSA/IKeyframeAnimationExtension.cs`, `KSA/SolarTrackingExtension.cs`,
> `KSA/SolarPanel.cs`, `KSA/Part.cs`, `KSA/PartTemplate.cs`, `KSA/ModuleList.cs`,
> `KSA/FileReference.cs`. Cross-checked against the `ksa-add-part` part-authoring schema.

## TL;DR

KSA has **two completely separate animation systems**. For rotors / pistons / hinges /
deployables you want the **`KeyframeAnimationModule`** — a data-driven, glTF-keyframe
system that animates the **TRS (translation/rotation/scale) of a Part's SubParts** over a
time axis. It needs **no C# code at all** for basic deploy/retract/actuate behaviour: you
ship a small animation `.glb` plus a few XML elements on your Part. Custom *active*
behaviour (a continuously spinning rotor, motorized hinge bound to action groups, torque)
needs either a mod that pokes `TimeGoal` each frame, or a custom transform driver.

The other system (`RenderCore.Animation.Skeleton`, `SkeletalAnimClip`, `AnimSkeletonSystem`,
`BoneAnimRuntime`, `IAnimProcessor`, `AnimatedRenderable`) is **skinned/bone animation for
characters** (the kitten/EVA avatar). It is *not* the path for rigid robotics parts and is
not covered in depth here.

---

## 1. Core concept: animation = scripted SubPart transforms

Recall the KSA part model: a **Part** is an arrangement of **SubParts**; SubParts carry the
actual mesh + material (`PartModel`). Every `Part` (including each SubPart, which is itself a
`Part` node in the tree) exposes a local transform relative to its parent:

```
Part.PositionParentAsmb   double3      // local translation in parent's assembly frame
Part.Asmb2ParentAsmb      doubleQuat   // local rotation
Part.Scale                double3      // local scale
```

`Part.MatrixAsmb2ParentAsmb = Scale ∘ Asmb2ParentAsmb ∘ PositionParentAsmb`
(`Part.cs:377-389`). The renderer walks the tree multiplying these matrices, so **anything
that writes these three fields each frame moves the rendered mesh.** That is the entire basis
of the animation system — it is literally a controller that overwrites those three fields on
the host Part's SubParts.

Two extra fields exist as the **rest pose** (`Part.cs:393-395`):

```
Part.PositionParentAsmbSafe   // the un-animated translation from the part-instance <Transform>
Part.Asmb2ParentAsmbSafe      // the un-animated rotation
```

These are captured from the XML `<Transform>` when the Part is constructed
(`Part.cs:681-685`). The animation module restores SubParts to these "safe" values when a
SubPart is *not* driven by the animation.

---

## 2. `KeyframeAnimationModule` — anatomy

`KeyframeAnimationModule` is a `ModuleStateful` part module (`KeyframeAnimationModule.cs`).
It is attached to the **top-level Part** and animates **that Part's direct SubParts**.

Key members:

| Member | Meaning |
|---|---|
| `Shared : KeyframeAnimationData` | The parsed, immutable animation curves (shared per template, see §3). |
| `TimeGoal : float` | Target time on the animation timeline the module is driving toward. |
| `State.TimeCurrent : float` | Current position on the timeline (the simulated state, saved/loaded). |
| `State.DeploymentState` | `Deployed / Retracted / Deploying / Retracting / Broken` derived from goal vs current. |
| `ShowDeployRetract : bool` | If true, UI shows **Deploy/Retract** buttons; else an **Actuate** 0→1 slider. |
| `Extension : IKeyframeAnimationExtension?` | Optional active behaviour layered on top (e.g. solar tracking). |
| `ExcludeSubPartIds : HashSet<string>?` | SubParts the extension's supplemental rotation should skip. |

### Template (XML-facing)

```csharp
[XmlType("KeyframeAnimationModule")]            // ← the XML element name
public class Template : TemplateDataBase {
    [XmlElement("KeyframeAnimation")] public KeyframeAnimationData.Template KeyframeAnimationTemplate; // glTF file ref
    [XmlAttribute("ShowDeployRetract")] public bool ShowDeployRetract;
    [XmlElement("SolarTracking")] public SolarTrackingTemplate? SolarTracking;   // optional extension
}
```

`KeyframeAnimationData.Template` derives from `FileReference` (`KeyframeAnimationData.cs:63`,
`FileReference.cs:10`), so it carries a `Path="..."` attribute pointing at the **animation
`.glb`** file (relative to the mod directory).

The module is created during part construction by `KeyframeAnimationModule.CreateComponents`
(`KeyframeAnimationModule.cs:86-118`), which is called from
`ModuleList.CreateModules` (`ModuleList.cs:81`). It iterates `template.Components` — the
polymorphic `List<ModuleBase.TemplateDataBase> Components` on `PartTemplate`
(`PartTemplate.cs:83`) — and instantiates one module per `<KeyframeAnimationModule>` element.
(This is the same `Components` bag where `LightModule`, `PartModelModule`, `FxTemperature`,
etc. live; the element name comes from each Template's `[XmlType]`.)

Note the last line of `CreateComponents`: it immediately calls
`ApplyAnimationTransforms(TimeGoal)` so the part loads in its goal pose.

---

## 3. How the animation `.glb` is parsed (`KeyframeAnimationData.Template.DoLoad`)

This is the most important part for an author to understand. The animation `.glb` is **not a
mesh atlas** — the loader never reads its geometry or materials. It reads only the **node
hierarchy** and **animation channels**. The meshes/textures still come from the SubParts'
own `PartModel`s in the regular mesh atlas.

The load logic (`KeyframeAnimationData.cs:65-210`):

1. Builds a parent-index array over all glTF `Nodes` and finds the **root** (the node with no
   parent).
2. Takes **only the first animation**: `gltfJson.Animations[0]`. Additional animations are
   ignored.
3. Groups that animation's channels by target node. Each channel/sampler pair becomes
   translation / rotation / scale curves on an `Animation` object, with:
   - `*Times` = sampler input accessor (keyframe times, seconds)
   - `Positions / Rotations / Scales` = sampler output accessor
   - `*SampleType` = interpolation (`Step`, `CubicSpline`, or default `Linear`).
   - The node's default TRS (`node.Translation/Rotation/Scale`) is stored as the fallback for
     any channel the node doesn't have.
4. **Duration** = the maximum keyframe time across every channel (`KeyframeAnimationData.cs:163`).
5. Links each animated node's `Animation` to its nearest *animated ancestor* (`Parent`),
   so transforms compose up the chain.
6. **Builds `PartLookup`** — a `Dictionary<string, AnimatedPart>` **keyed by glTF node name**
   (`KeyframeAnimationData.cs:195`). For every named node that is *not itself directly
   animated*, it records the node's static TRS plus a pointer to its nearest animated ancestor.
   (Directly-animated nodes are matched to SubParts via the same name route through the
   ancestor walk.)
7. Pre-computes `WorldMatrixStart` (t=0) and `WorldMatrixEnd` (t=Duration) per entry for fast
   clamping (`KeyframeAnimationData.cs:205-209`).

**➜ The single rule that matters: a glTF node's `name` must exactly equal the SubPart's
*instance* `Id`** (the `Id` on `<SubPart Id="..." InstanceOf="...">` inside your `<Part>`),
because `ApplyAnimationTransforms` looks SubParts up by `part.Id` against this `PartLookup`
(see §4). Names are case-sensitive.

### Sampling / interpolation (`EvaluateWorldMatrix` / `EvaluateLocalMatrix`)

`EvaluateWorldMatrix(part, time)` (`KeyframeAnimationData.cs:224`):
- Clamps: `time<=0` → cached start matrix; `time>=Duration` → cached end matrix.
- Otherwise builds the node's local matrix from its static TRS, then multiplies by each
  ancestor `Animation`'s sampled local matrix walking up the `Parent` chain.
- Per-channel sampling: binary-search the keyframe index (`FindKeyframeIndex`), then
  `float3.Lerp` for position/scale and `floatQuat.Slerp` for rotation.
  **Caveat:** `Step` is honoured, but `CubicSpline` is **not** — anything that isn't `Step`
  falls through to linear/slerp (`InterpolateFloat3`/`InterpolateQuat`,
  `KeyframeAnimationData.cs:280-322`). Author your curves expecting linear interpolation
  between keys; add intermediate keys if you need eased motion.

---

## 4. Applying transforms each frame (`ApplyAnimationTransforms`)

`KeyframeAnimationModule.ApplyAnimationTransforms(float time, doubleQuat? supplementalRotation)`
(`KeyframeAnimationModule.cs:222-264`) iterates the host Part's `SubParts`:

- If the SubPart's `Id` **is** in `Shared.PartLookup`:
  - `matrix = Shared.EvaluateWorldMatrix(entry, time)`, then `float4x4.Decompose` into
    scale / rotation / translation, written into `part.Scale`,
    `part.Asmb2ParentAsmb`, `part.PositionParentAsmb`.
- If the SubPart's `Id` is **not** in `PartLookup`:
  - It's reset to the rest pose (`PositionParentAsmbSafe` / `Asmb2ParentAsmbSafe`).
- A `supplementalRotation` (from an extension) is composed on top when present and the SubPart
  isn't excluded.
- Finally `Parent.UpdateBounds()`.

So **only the SubParts whose Ids appear in the animation file move; everything else stays at
its XML pose.**

---

## 5. The time axis: `TimeGoal`, `TimeCurrent`, deploy/retract/actuate

`UpdateModules` (`KeyframeAnimationModule.cs:133-186`) runs each simulation step and walks
`TimeCurrent` toward `TimeGoal`:

```
if TimeGoal > TimeCurrent:  TimeCurrent += DeltaTime   (clamped to TimeGoal)   → Deploying
if TimeGoal < TimeCurrent:  TimeCurrent -= DeltaTime   (clamped to TimeGoal)   → Retracting
```

**Timing semantics:** because it advances by raw `DeltaTime`, **1 second of sim time = 1 unit
of timeline = 1 second of glTF animation time.** ⇒ The animation's authored **Duration (in
seconds) directly equals the real-world time to fully deploy/retract.** Want a 4-second hinge
swing? Author 4 seconds of keyframes.

`DeriveDeploymentState(goal,current)` (`:120-131`):
- `goal < current` → `Retracting`; `goal > current` → `Deploying`;
- equal and `current<=0` → `Retracted`; equal and `current>0` → `Deployed`.

### Player UI (`ShowContextMenu`, `:188-220`)

- `ShowDeployRetract = true` → **binary**: a **Deploy** button sets `TimeGoal = Duration`; a
  **Retract** button sets `TimeGoal = 0`. Plus a text readout of the deployment state.
  (This is what solar panels / landing gear / antennae use.)
- `ShowDeployRetract = false` → a continuous **"Actuate"** slider 0→1 mapped to
  `TimeGoal = v * Duration`. **This is the mode you want for a hinge / piston / arm you can
  position to any angle/extension.**

`_transformsDirty` ensures transforms are re-applied when the goal is reached (so the part
settles exactly on the start/end cached matrices).

---

## 6. Extensions (`IKeyframeAnimationExtension`) — active behaviour on top

The interface (`IKeyframeAnimationExtension.cs`):

```csharp
doubleQuat? Rotation { get; }                    // supplemental rotation applied on top
void Update(module, timeCurrent, parentBody, vehicle, deltaTime);
void OnSave(SaveData); void OnLoad(SaveData, module); void DrawMenuInfo();
```

The only shipped implementation is **`SolarTrackingExtension`** (`SolarTrackingExtension.cs`).
It demonstrates the pattern that's directly relevant to **a continuously-rotating actuator**:
once the panel is `Deployed`, each `Update` it computes a target angle (sun direction), steps
`CurrentAngle` toward it at `RotationPerSecond` (rad/s), and exposes
`Rotation = doubleQuat.CreateFromAxisAngle(UnitX, CurrentAngle)`. The module then composes
this rotation onto the tracking SubPart in `ApplyAnimationTransforms`. The extension also
persists its angle via `OnSave`/`OnLoad`.

**Important limitation:** which extension gets attached is **hard-coded** in
`CreateComponents` — only `<SolarTracking>` is wired up (`KeyframeAnimationModule.cs:100-114`).
**You cannot register a custom `IKeyframeAnimationExtension` purely via XML.** To add custom
active behaviour you must either Harmony-patch `CreateComponents`/`UpdateModules`, or drive the
module from your own mod (see §9).

`SolarPanel.cs` shows the integration the other way round: a `SolarPanel` module finds the
Part's `KeyframeAnimationModule` in `OnPartCreated` and gates power production on
`DeploymentState == Deployed` (`SolarPanel.cs:44-51, 78-92`).

---

## 7. Authoring a custom animated part — the recipe

You need, on top of the normal part files from the `ksa-add-part` guide (mesh atlas, textures,
`SubPart`/`Part` in `*Assets.xml`, `*GameData.xml`):

1. **An animation `.glb`** (separate from the mesh atlas). In your DCC tool (Blender, etc.):
   - Create an empty / node **named exactly like each SubPart instance Id** you want to move.
   - Animate those nodes' rotation/translation/scale on **action #0** (KSA reads
     `Animations[0]`). Keyframe times are in seconds and define the deploy duration.
   - Parent moving nodes appropriately if you want compound motion (child inherits parent's
     animated transform — e.g. a piston rod inside a swinging arm).
   - Geometry is irrelevant in this file; only node names + the animation matter. Export `.glb`.
2. **Wire the module onto the Part** in `*Assets.xml` by adding a `<KeyframeAnimationModule>`
   child to your `<Part>` element:

```xml
<Part Id="MyMod_Hinge_Prefab_A">
  <SubPart Id="HingeBase"  InstanceOf="MyMod_Hinge_Subpart_Base"><Transform/></SubPart>
  <SubPart Id="HingeArm"   InstanceOf="MyMod_Hinge_Subpart_Arm">
    <Transform><Position X="0" Y="0.25" Z="0"/></Transform>
  </SubPart>

  <!-- node named "HingeArm" inside Hinge_Anim.glb drives the HingeArm SubPart -->
  <KeyframeAnimationModule ShowDeployRetract="false">
    <KeyframeAnimation Path="Animations/MyMod_Hinge_Anim.glb"/>
  </KeyframeAnimationModule>

  <Connector Id="_bottom"><Transform><Position Y="-0.25"/><Scale X="1" Y="1" Z="1"/></Transform></Connector>
</Part>
```

   - `ShowDeployRetract="false"` → Actuate slider (free positioning).
   - `ShowDeployRetract="true"` → Deploy/Retract buttons (binary).
   - The glTF node `"HingeArm"` must match the SubPart instance `Id="HingeArm"`.
3. (Optional) Add `<SolarTracking DegreesPerSecond="10" SubPart="PanelHead"/>` for sun-tracking
   solar panels.

No `GameData.xml` entry is required for the animation itself (mass/physics for the SubParts is
still defined as usual).

---

## 8. Robotics recipes

| Part | glTF setup | Module config | Notes |
|---|---|---|---|
| **Hinge** | One node (= the arm SubPart Id) with a **rotation** channel sweeping the desired arc over N seconds. | `ShowDeployRetract="false"` (Actuate slider). | Slider gives any angle 0→full. For a fixed open/closed door use `true`. |
| **Piston** | One node with a **translation** channel along the slide axis. | `ShowDeployRetract="false"`. | Duration = extend time. Stack a child node for a telescoping rod. |
| **Deployable** (solar/gear/antenna) | Node(s) with rotation/translation from stowed→deployed. | `ShowDeployRetract="true"`. | Matches stock solar-panel/landing-gear UX. |
| **Rotor / continuous spin** | *Not a good fit for pure keyframes* — the timeline clamps to `[0,Duration]` and stops. | — | Use an **extension-style continuous rotation** (§6) or drive the transform from a mod each frame (§9 / §9a). |

**Why a rotor needs code:** the keyframe system is a *finite* deploy/retract timeline; it can't
spin forever. The shipped `SolarTrackingExtension` is the template for continuous rotation
(`CurrentAngle += rate*dt`, expose as a `doubleQuat`), but extensions can't be added via XML.
So a rotor = either (a) Harmony-inject a custom `IKeyframeAnimationExtension`, or (b) a mod
module that writes `part.Asmb2ParentAsmb` each frame (see §9), bypassing the keyframe module
entirely.

---

## 9. Driving animations from a mod (programmatic control / action groups)

For controllable robotics (motorized hinge on a hotkey, rotor spin, action-group binding),
work through the module rather than the UI:

```csharp
// Find the module on a part (or across the vehicle):
KeyframeAnimationModule[] anims = part.SubtreeModules.Get<KeyframeAnimationModule>();
// or vehicle-wide:  vehicle.Parts.Modules.Get<KeyframeAnimationModule>();

foreach (var m in anims)
{
    float duration = m.Shared.Duration;
    m.TimeGoal = duration;        // deploy   (UpdateModules animates TimeCurrent toward this)
    // m.TimeGoal = 0f;           // retract
    // m.TimeGoal = 0.5f * duration; // actuate to mid-position
}
```

Setting `TimeGoal` is exactly what the Deploy/Retract buttons and Actuate slider do
internally, so the game animates smoothly and the state saves/loads correctly. Bind these
sets to your own ImGui buttons, hotkeys, or action groups (the repo's `red-alert` action-group
mod is a precedent for hooking actions).

For a **continuous rotor** or motion the keyframe timeline can't express, skip the keyframe
module and write the SubPart transform directly each frame from a `[StarMapAfterGui]`/update
hook:

```csharp
double angle = rate * Universe.GetElapsedSimTime().Seconds();
rotorSubPart.Asmb2ParentAsmb = doubleQuat.Concatenate(
    doubleQuat.CreateFromAxisAngle(double3.UnitX, angle),
    rotorSubPart.Asmb2ParentAsmbSafe);   // compose on top of the rest pose
```

(Mirror the math `ApplyAnimationTransforms` uses; respect `*Safe` as the base pose so you
don't accumulate drift.)

---

## 9a. Recipe: reuse stock SubParts + code-driven infinite rotor

The cleanest way to build a spinning rotor (e.g. reusing the stock solar-panel rotor's two
SubParts — a fixed base + a rotating head) is **pure SubPart reuse for the visuals + a tiny
mod for the motion**. No animation `.glb`, no `KeyframeAnimationModule`.

**Why this works:** SubParts are reusable visual building blocks — instancing a Core SubPart
template in your own `<Part>` gives you its mesh + material for free (Core is always loaded, so
the `InstanceOf` reference resolves during binding). The `KeyframeAnimationModule` lives on the
**Part**, not the SubPart, so reusing the SubParts does *not* drag any animation/solar logic
along — your Part is a clean slate.

**Step 1 — Arrange the two SubParts in your `*Assets.xml`** (no module added):

```xml
<Part Id="MyMod_Rotor_Prefab_A">
  <SubPart Id="RotorBase" InstanceOf="Core..._Subpart_RotorBase"><Transform/></SubPart>
  <SubPart Id="RotorHead" InstanceOf="Core..._Subpart_SolarPanelHead">
    <Transform><!-- replicate the stock part's relative offset of head vs. base --></Transform>
  </SubPart>
  <Connector Id="_bottom"><Transform><Position Y="-0.25"/><Scale X="1" Y="1" Z="1"/></Transform></Connector>
</Part>
```

Because you reuse the *same* SubPart whose node the stock animation rotated, its **mesh origin
already sits on the rotor axis** — so rotating its local `Asmb2ParentAsmb` spins it in place
with no pivot math. The stock spin axis is local **`UnitX`** (`SolarTrackingExtension.cs:52`
rotates the tracking subpart about `double3.UnitX`); confirm empirically with a fixed 90° test.

**Step 2 — Drive the head SubPart's rotation each frame** from your mod (e.g. `[StarMapAfterGui]`):

```csharp
// resolve once: the rotating SubPart by its instance Id
Part head = null;
foreach (var top in vehicle.Parts.Parts)
    foreach (var sp in top.SubParts)
        if (sp.Id == "RotorHead") head = sp;

// each frame:
double angle = ratePerSec * Universe.GetElapsedSimTime().Seconds();   // wraps naturally
head.Asmb2ParentAsmb = doubleQuat.Concatenate(
    doubleQuat.CreateFromAxisAngle(double3.UnitX, angle),  // axis: confirm UnitX
    head.Asmb2ParentAsmbSafe);                              // compose on the rest pose
```

**Key points** (all verified against decomp):
- **No `KeyframeAnimationModule` on the Part** — if one were present, its
  `ApplyAnimationTransforms` would overwrite your SubPart's TRS every step and fight your code.
  With no transform-driving module, nothing resets the SubPart, so your write persists.
- **Always compose onto `Asmb2ParentAsmbSafe`** (the rest rotation captured at construction,
  `Part.cs:393-395, 681-685`), never onto the live value — otherwise you accumulate drift.
- **Discover the real instance `Id` and axis at runtime** (log `sp.Id`, nudge by a fixed angle
  and eyeball the axis). The Id is the SubPart instance name *you* chose in your XML.
- A free-running `elapsedSimTime * rate` re-derives a consistent angle on load, so spin survives
  save/load without persisting anything.

---

## 10. Gotchas & limits

- **Node name = SubPart instance Id**, case-sensitive. A mismatch silently means "no
  animation" — the SubPart just sits at its rest pose.
- **Only `Animations[0]`** is read. One timeline per animation `.glb`; bake everything into it.
- **`CubicSpline` is silently treated as linear.** Add keyframes for easing.
- **Animation time is real seconds** (advanced by `DeltaTime`); Duration = deploy time.
- **Transforms are fully overwritten each frame** for animated SubParts — don't expect other
  code's writes to `PositionParentAsmb`/`Asmb2ParentAsmb`/`Scale` on those SubParts to stick
  while the module is active.
- **Custom extensions aren't XML-pluggable** — only `<SolarTracking>` is wired in
  `CreateComponents`. Custom active behaviour needs Harmony or a separate driver module.
- **The animation `.glb` carries no geometry/materials** — meshes come from the SubParts'
  `PartModel` in the mesh atlas; the animation file is purely a named-node TRS track.
- **Physics/mass is unaffected by the visual pose** — the keyframe module moves render
  transforms; it does not re-run the mass/inertia or resource-flow graphs. (Solar panels gate
  *power* on `DeploymentState`, but that's the `SolarPanel` module's own logic, not a generic
  physics coupling.) If you need a deployed arm to change CoM/drag you must drive that
  separately — see §11 for *why*, and how to make it count.

---

## 11. Mass / CoM / inertia: how they're computed and why animation doesn't move them

### How the vehicle's mass properties are built

The vehicle's rigid-body mass, centre of mass, and inertia tensor are aggregated by
`PartTree.RecomputeStaticMass()` (`PartTree.cs:301-314`):

```csharp
StaticMassPropsAsmb = OffsetMassProperties.Zero;
foreach (InertMass im in Modules.Get<InertMass>()) {
    float3    pos = float3.Pack(im.Parent.PositionVehicleAsmb);   // ← LIVE part position
    floatQuat rot = floatQuat.Pack(im.Parent.Asmb2VehicleAsmb);   // ← LIVE part rotation
    OffsetMassProperties b = im.MassPropertiesAsmb.Transform(rot); // rotate the inertia tensor
    b.Offset += pos;                                               // shift to the part's location
    StaticMassPropsAsmb += b;                                      // accumulate (see operator+)
}
```

- Each `Part`/`SubPart` that has mass owns an **`InertMass`** module whose `MassPropertiesAsmb`
  (mass + inertia + CoM offset in the part's *own* frame) is baked **once** from the template at
  part creation (`InertMass.cs:26-34`, from `SolidSphereMass`/`CustomMass`/… → `LocationBody`,
  `MassSpecificInertia`). It is intrinsic to the part and never changes at runtime.
- The `OffsetMassProperties +` operator (`OffsetMassProperties.cs:24-45`) is a proper
  rigid-body combine: it computes the mass-weighted CoM of the two operands and uses the
  parallel-axis theorem (`MassProperties.GetPropertiesAtOrigin`, `MassProperties.cs:25-47`) to
  shift each inertia to the combined CoM before summing. `MassProperties.Transform`
  (`MassProperties.cs:60-68`) rotates the inertia tensor.
- Tank propellant is added on top via `ComputePropellantMassPropertiesAsmb()`
  (`PartTree.cs:278, 413-427`).

**So the aggregation genuinely depends on each part's *live* `PositionVehicleAsmb` /
`Asmb2VehicleAsmb`** — which for a SubPart derive directly from its `PositionParentAsmb` /
`Asmb2ParentAsmb` (the exact fields animation writes, `Part.cs:315-345`). A moved/rotated
SubPart with an off-centre mass *would* shift the vehicle CoM and inertia — **if the
aggregation re-ran.**

### Why animation doesn't move them

The result is **cached in `StaticMassPropsAsmb`** and only refreshed when
`RecomputeAllDerivedData()` → `RecomputeStaticMass()` is explicitly called — i.e. at part
**creation, `Merge`, `Split`, staging, docking, and resource/fuel changes**.

Neither animation path triggers it:
- `KeyframeAnimationModule.ApplyAnimationTransforms` writes the SubPart TRS and then calls only
  `Parent.UpdateBounds()` — **render bounds, not mass** (`KeyframeAnimationModule.cs:263`).
- A custom per-frame transform write (§9/§9a) likewise touches only the transform fields.

The transform-field setters *do* invalidate the cached vehicle-frame transforms
(`ResetCachedPosMatrixValues()`, `Part.cs:359,373`), so the *next* recompute will see the new
pose — but nothing schedules that recompute. Result: physics keeps using the mass snapshot from
the last recompute (typically the load/goal pose). This is deliberate — recomputing mass every
frame for cosmetic motion would be wasteful and would also rebuild resource graphs and rocket
controls.

### How to make animation affect mass/CoM/inertia

Call it yourself after moving the part:

```csharp
movingSubPart.Asmb2ParentAsmb = /* new pose */;
vehicle.Parts.RecomputeAllDerivedData();   // re-aggregates StaticMassPropsAsmb from live poses
```

Caveats before you do this on a rotor/arm:
- **It's heavy.** `RecomputeAllDerivedData` (`PartTree.cs:231-238`) also rebuilds every
  `ResourceManager` (fuel-flow graphs), recomputes gimbal/thruster/engine control data, and
  resets stage/sequence caches. Calling it every frame is wasteful and can perturb
  engine/resource state — don't do it for a continuously spinning rotor.
- **A symmetric rotor spinning about its own axis through its CoM doesn't move the vehicle CoM
  anyway** (rotational symmetry), so recompute buys nothing. The mass effect only matters for
  *net displacement* of off-centre mass — e.g. a long arm/boom deploying to one side, or a
  panel translating outboard. For those, recompute **once when the motion settles** (e.g. when
  `TimeGoal` is reached / `DeploymentState == Deployed`), not per frame.
- **`Part.Scale` does not change mass.** The aggregation applies only rotation + translation;
  animating scale resizes the mesh but the intrinsic `MassPropertiesAsmb` is untouched.
- This recomputes the **rigid mass model only**. Aerodynamic drag/area is a separate system and
  is not updated by this call.