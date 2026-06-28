# How KSA Treats "Up" on a Vehicle (Flight-Computer Reference Orientation)

**Question:** When the flight computer points the ship "Up" / "Down" / "Prograde" / "Radial-out" /
etc., *which* axis of the vehicle is it pointing, and *what* decides that axis? Is the "up"
reference defined in part XML (so a custom data-only Part could set it), or is it baked into game
code (e.g. the root part)?

**Short answer:** It's the **root part**, decided in code — not a data flag.

- The flight computer always points the vehicle's **Body-frame +X axis** (the "nose"/forward axis) at
  the chosen world direction. Roll is referenced off Body **+Z**.
- The **Body frame is identical to the Assembly (editor build) frame**, and the **root part is pinned
  to identity** in that frame at launch. So **the root part's own local coordinate frame *is* the
  vehicle's reference frame.** Whatever direction the root part's local +X points becomes the ship's
  "forward/up".
- The `<Control/>` module (the thing that makes a craft controllable) is a **bare marker** — it
  carries **no transform and no orientation**. There is **no "control point" / "control from here" /
  reference-transform concept** anywhere in the current build.
- Therefore you **cannot** make a passive part that, when *attached* to an existing craft, re-orients
  "up". A part only influences "up" by **being the root** (or by being **re-rooted** to). That *is*
  data-reachable, though: any part with the right editor tag + a stack connector is root-eligible, and
  its authored local frame defines the reference.

Everything below is from the decompiled build at
`ksa-game-assemblies/current/decomp` and the Core content XML
(`ksa-game-assemblies/current/Content/Core`). Baseline build: 2026.6.9.4750.

---

## 1. The problem has two independent halves

When the computer is in "point at Up" mode it needs two things:

1. **A target direction in the world** — "where is Up right now?" (depends on the planet, the orbit,
   the velocity, the target vessel, …). This is fully code-computed from orbital state; parts play no
   role.
2. **A reference axis on the vehicle** — "which way is the ship's nose, so I know how far off I am?"
   This is the part that the user's question is really about.

The autopilot then drives (2) onto (1). Let's take them in order.

---

## 2. Half A — the world-space target directions ("where is Up")

### The mode list

`KSA/FlightComputerAttitudeTrackTarget.cs` is the enum of every auto-point mode:

```
None, Custom, Forward, Backward, Up, Down, Ahead, Behind, RadialOut, RadialIn,
Prograde, Retrograde, Normal, AntiNormal, Outward, Inward, PositiveDv, NegativeDv,
Toward, Away, Antivel, Align
```

(`FlightComputerAttitudeMode.cs` is a *different*, smaller enum — just `Manual`/`Auto`. The
direction list is the one above.)

### Each mode → a world reference frame

`KSA/FlightComputerAttitudeTrackTargetEx.cs:23` (`GetTarget`) maps each mode to a frame builder in
`VehicleReferenceFrameEx`, producing a target quaternion `Target2Cci` (target-frame → Central-body
Inertial). Highlights:

| Mode | Builder (`VehicleReferenceFrameEx`) | Physical meaning of the target |
|------|--------------------------------------|--------------------------------|
| `Up` | `GetTail2Cci` | nose → **radial-out / local zenith** (away from surface) |
| `Down` | `GetTail2Cci` + 180° pitch | nose → toward surface |
| `Forward` | `GetFlp2Cci` | nose → **surface-relative horizontal velocity** (where you're going over the ground) |
| `Backward` | `GetFlp2Cci` + 180° | opposite |
| `Ahead`/`Behind`/`RadialOut`/`RadialIn` | `GetLvlh2Cci` (+ rot) | orbital LVLH frame (radial/along-track) |
| `Prograde`/`Retrograde`/`Normal`/`AntiNormal`/`Outward`/`Inward` | `GetVlfBody2Cci` (+ rot) | orbital velocity frame (prograde + normal/radial) |
| `PositiveDv`/`NegativeDv` | the planned burn's `BurnBody2Cci` | maneuver-node direction |
| `Toward`/`Away`/`Antivel` | `GetTgt2Cci` / `GetTvel2Cci` | relative to the selected target vessel |
| `Align` | `GetDock2Cci(target)` | the **target vehicle's Body frame**, yaw-flipped (nose-to-nose docking) |

For example `GetTail2Cci` (`VehicleReferenceFrameEx.cs:253`) builds a matrix whose first row is
`positionCci/|positionCci|` (radial out). `CreateFromRotationMatrix` treats that first row as the
**+X basis** of the frame, so "Up" literally means *"make Body +X equal to the radial-out vector."*
"Forward" (`GetFlp2Cci:200`) puts surface-relative velocity in that first row, etc.

**Key point: in every mode the thing being aimed is the frame's +X axis.** None of these builders
read anything from parts; they are pure functions of orbital state vectors (`FlightComputerNavigation`
in `FlightComputerNavigation.cs`: position/velocity/`Body2Cci`/target).

There's also a separate **navball** reference-frame mapping
(`FlightComputerAttitudeTrackTargetEx.cs:77` `GetNavballReferenceFrame`) — e.g. Up/Down/Forward/Backward
display in the **ENU** (East-North-Up) frame. That's display-only and doesn't change the steering.

---

## 3. Half B — the vehicle's own reference axis ("which way is the nose")

### The autopilot works entirely in the "Body" frame, aiming +X

`FlightComputer.ComputeControl` (`FlightComputer.cs:308`) calls `UpdateAttitudeTrackError`
(`FlightComputer.cs:966`). That method:

```csharp
doubleQuat rotation = Concatenate(AttitudeTarget.Target2Cci, body2Cci.Inverse()); // target relative to body
double3 vector = double3.UnitX.Transform(rotation);                               // <-- +X is the pointing axis
double  num    = SafeAcos(Dot(vector, double3.UnitX));                            // angle error off +X
...
double3 double8 = double3.UnitZ.Transform(rotation);                             // <-- +Z is the roll reference
num5 = RollMode.Angle() + -Atan2(-double8.Y, double8.Z);                         // roll error
```

So:

- **Body +X = the nose / forward / "point this at the target" axis.**
- **Body +Z = the roll reference** (`RollMode.Up` → 0, `RollMode.Down` → π;
  `FlightComputerRollModeEx.cs`, default `RollMode = Up` at `FlightComputer.cs:48`).
- Body +Y is the remaining lateral axis.

The only vehicle input is `body2Cci` (the vehicle's Body→Inertial orientation, from physics). So the
entire question reduces to: **what defines the vehicle's Body frame?**

### The Body frame *is* the Assembly (editor) frame

`Vehicle.cs`:

- `:423` `Body2Cce` (the live orientation) initial value is `BODY2UPFRAME`.
- `:440-456` — `Asmb2Cce`, `Asmb2Ego`, `Body2Ego` **all return `Body2Cce`**. The **Assembly frame and
  the Body frame are the same frame**. ("Asmb" = the coordinate system parts are placed in in the
  editor.)
- `:256` `BODY2UPFRAME = diag(1, -1, -1)` — a fixed 180°-about-X axis convention rotation (it flips Y
  and Z signs between "body" and the navigation "up-frame"). It is a *constant*, not data.

### The Control module is a pure marker — it does **not** define orientation

- `Control.cs` — the whole class:
  ```csharp
  public class Control : Module<Control> {
      public static void CreateComponents(Part part, PartTemplate template, PartInstance? instance) {
          if (template.Control != null) { part.Modules.Add(new Control { Parent = part }); }
      }
  }
  ```
  No transform, no axis, no reference. `ControlTemplate.cs` is likewise empty.
- `Vehicle.cs:526` `IsControllable => _overrideIsControllable || Parts.Controls.NumModules > 0`. A
  control module **anywhere** in the tree makes the craft controllable. It does **not** have to be the
  root, and it contributes **nothing** to orientation.
- In `CoreCommandAGameData.xml` the command pod simply has a bare `<Control />` element among its other
  modules. That's the entire "command pod" contract.

> Consequence: the popular intuition "the command pod decides which way is up" is *incidental*. What
> actually decides up is the **root part**. The command pod is usually the first part you place, hence
> usually the root — but if you root your craft on a structural part and hang the pod off it as a
> child, "up" follows the **structural part**, not the pod.

### The root part is pinned to identity → the root part's local frame is the reference

When you launch (`VehicleEditor.cs:830-848`):

```csharp
doubleQuat asmb2ParentAsmb = EditingSpace.Parts.Root.Asmb2ParentAsmb;            // root's editor orientation
ExistingVehicle = Vehicle.CreateVehicle(..., Concatenate(asmb2ParentAsmb, initial.Body2Cce), ...);
// ...bake that rotation into every child so the craft keeps its shape...
ExistingVehicle.Parts.Root.Asmb2ParentAsmb     = doubleQuat.Identity;            // <-- ROOT FORCED TO IDENTITY
ExistingVehicle.Parts.Root.Asmb2ParentAsmbSafe = doubleQuat.Identity;
```

The root part's editor orientation is **folded into the vehicle's world orientation** and the root is
then set to **identity within the Body/Assembly frame**. For a top-level (non-subpart) part,
`Asmb2VehicleAsmb == Asmb2ParentAsmb` (`Part.cs:431-443`), so an identity-rotated root means:

> **The root part's local coordinate axes == the vehicle Body axes.**
> Root local **+X = vehicle nose = what every "point at …" mode aims.**

This is exactly why "whatever the (root) capsule points at becomes up." In
`CoreCommandAAssets.xml:232-243` the capsule's two stack connectors sit at local **+X** (`_connector1`,
the nose) and **−X** (`_connector2`, the tail, rotated 180° about Z to mate downward). Its long axis is
+X, so its nose is +X, so on the pad its nose = zenith = the computer's "Up".

### Re-rooting changes "up"; attaching a child does not

- `PartTree.Reroot` (`PartTree.cs:665`) only relinks tree parent/child topology — it does **not**
  move/rotate parts by itself.
- But the editor's **"Reroot"** button (`VehicleEditor.cs:3919`) plus the **launch-time identity pin**
  above means: **whichever part is root at launch supplies the reference frame.** Reroot to a different
  part → that part's local frame becomes "up".
- `VehicleEditor.EditorResetRotation` (`:1466`) and the connector-mate logic
  `Part.Connector.ConnectAndMerge` (`Part.cs:163`, note the `CreateFromAxisAngle(UnitZ, π)` mating
  flip) show the general pattern: rotations are always expressed **relative to the root**, and the root
  is the anchor.
- Merely adding a part as a **child** never changes the Body frame. There is no per-part control
  transform for it to contribute.

### What makes a part eligible to be the root

`VehicleEditor.IsAllowedAsRootPart` (`VehicleEditor.cs:746`):

```csharp
bool IsAllowedAsRootPart(PartTemplate part) {
    if (EditorTag.MatchAny(part.EditorTags, _rootPartWhitelist)) {
        if (part.Connectors.Count == 0) return false;                  // must have >=1 connector
        foreach (var c in part.Connectors)
            if (IsSet(c.Flags, ToSurface) || IsSet(c.Flags, FromSurface)) return false;  // no surface-attach nodes
        return true;
    }
    return false;
}
```

with connector flags (`Part.cs:94`):

```csharp
[Flags] enum Flag { Internal = 1, ToSurface = 2, FromSurface = 4 }
```

The whitelist is **data-driven**: `EditorTagDefinition.RootPartWhitelist` in the editor-tags XML
(`VehicleEditor.cs:4404-4433`) plus hardcoded fallbacks `Capsules`, `Engines`, `Interstage`
(`:4449/4468/4478`). In `CoreEditorTagsGameData.xml` the tags flagged `RootPartWhitelist="true"` are:

```
Capsules, Engines, Fuel Tanks, Coupling, Structural, Interstage, Cargo
```

So a root part must: (a) carry one of those editor tags (or a custom tag you define with
`RootPartWhitelist="true"`), (b) have **≥1 stack connector**, and (c) have **no surface-attach
connectors** (`ToSurface`/`FromSurface`).

---

## 4. The axis convention, precisely

- **Body +X** — longitudinal "nose"/forward. Aimed by every attitude mode. = root part local +X.
- **Body +Z** — roll-up reference.
- **Body +Y** — remaining lateral axis.
- `BODY2UPFRAME = diag(1,-1,-1)` (`Vehicle.cs:256`) only converts between the body axes and the
  navigation "up-frame" sign convention; it does not depend on any part.
- Connector transforms (`Part.Connector.TemplateBase`, `Part.cs:102`) are authored as a
  `<Transform>` (Position + Rotation + Scale) in the part's local frame, e.g.
  `CoreCommandAAssets.xml`:
  ```xml
  <Connector Id="_connector1"><Transform><Position X="1.03252"/></Transform></Connector>      <!-- nose, +X -->
  <Connector Id="_connector2"><Transform><Position X="-1.01143"/><Rotation Z="3.14159"/>      <!-- tail, -X, flipped -->
              <Scale X="2.5" Y="2.5" Z="2.5"/></Transform></Connector>
  ```

---

## 5. Summary of the data-vs-code split

| Thing | Where it lives | Data-reachable? |
|-------|----------------|-----------------|
| Set of point-at modes (Up/Down/Prograde/…) | code enum `FlightComputerAttitudeTrackTarget` | No |
| World direction of each mode | code (`VehicleReferenceFrameEx`, orbital math) | No |
| Pointing axis = Body +X, roll = Body +Z | code (`FlightComputer.UpdateAttitudeTrackError`) | No |
| Body frame == Assembly frame | code (`Vehicle.Asmb2Cce => Body2Cce`) | No |
| **Body frame = root part's local frame** | code (launch pins root to identity) | **Indirect — via which part is root + that part's authored frame** |
| "Control point" / per-part reference transform | **does not exist** | — |
| `<Control/>` capability | part XML — but it's a **marker only**, no orientation | Yes (capability), No (orientation) |
| Which parts may be root | editor-tag whitelist + connector rules | **Yes** (editor tags + connectors are XML) |
| Root part's local axes / connector layout | part XML/mesh (`<Connector><Transform>`) | **Yes** |

---

## 6. Practical plan — what XML-only Parts can and can't do

### ❌ Not possible (data-only, current build)

- A **passive "attitude reference" part** you simply *attach* to an existing craft to re-define "up".
  There is no control-point mechanism for it to hook into; the autopilot reads only the vehicle Body
  frame (= root frame). A non-root child contributes nothing.
- **Selecting "control from here"** at runtime, KSP-style. The feature does not exist in this build.
- Anything needing new game code (the orientation pipeline is entirely in C#).

### ✅ Possible (data-only), because "up" == the root part's frame

The lever you actually have is **"which part is root, and how is that part's local frame authored."**
Both are reachable from a data-only `PartGameData` (+ its mesh/connector assets).

**Option A — a custom root "reference/command block."**
Author a small Part that is root-eligible:
- give it a root-whitelisted `EditorTag` (reuse `Structural`/`Capsules`/`Coupling`, or define your own
  `<EditorTagDef Id="MyControlBlock" RootPartWhitelist="true"/>`),
- give it **one stack `<Connector>`** (flag `Internal` or plain; **no** `ToSurface`/`FromSurface`),
- add `<Control/>` so the craft is controllable,
- author its local frame so **+X points the direction you want to be "forward/up"**, with the
  connector on the face where the rest of the craft attaches.

Build (or **Reroot**) the craft onto this block and its +X becomes the flight-computer reference.

**Option B — six orientation variants (the up/down/left/right/fwd/back idea).**
Make six copies of Option A that are visually identical but whose **local frame is rotated 90°/180°**
relative to the attach connector — i.e. the single stack connector is placed on the **+X / −X / +Y /
−Y / +Z / −Z** face respectively (with the connector's own `<Rotation>` set so the craft still mates
flush). Because "forward" is always local +X while the craft hangs off whichever face holds the
connector, each variant makes the autopilot treat a **different physical direction of the attached
craft** as "forward/up." Pick the variant = pick the reference orientation. This is the closest
data-only analog to a "control-from-here, but rotated" part.

> Note: with a single rigid frame, +X is simultaneously the connector-layout axis *and* the control
> axis. The variants work by moving the connector to a different face so the same +X points a different
> way relative to the stack. You can't decouple "where the craft attaches" from "which way is forward"
> within one part — that decoupling would need a real control-point feature (code).

**Option C — no custom part at all.**
Since the root defines "up," you can re-orient an existing craft's reference by **rerooting** to a
different existing part (editor **Reroot** button) or by **rotating the root part** in the editor before
launch (its orientation is baked into the launch attitude, `VehicleEditor.cs:830`). Useful to verify
the model before investing in custom parts.

### Recommended path

For flexo's purposes, Option A/B as a **data-only `PartGameData` + primitive GLB connector mesh**
(flexo already builds primitive GLB meshes and connector-bearing parts) is the realistic deliverable:
a tiny root-eligible "reference cube" with a chosen +X, optionally shipped as a 6-pack of rotations.
The craft must be **rooted on it** (built from it or rerooted to it) — that's the one unavoidable
constraint, and it's a player action, not something the part can force.

---

## 7. Caveats / future-proofing

- KSA is in active development; the control/parts area changes fast. The findings above are the
  **2026.6.9.4750** build. The load-bearing facts to re-verify on each game sync:
  1. `Control.cs` / `ControlTemplate.cs` are still empty markers (no orientation/control-point fields).
  2. `FlightComputer.UpdateAttitudeTrackError` still aims **Body +X** (and rolls on **+Z**).
  3. `Vehicle.Asmb2Cce => Body2Cce` (Body frame still == Assembly frame).
  4. Launch still pins the **root** part to identity (`VehicleEditor.cs` ~`:845`).
  5. `IsAllowedAsRootPart` rules + `_rootPartWhitelist` / `EditorTagDef RootPartWhitelist`.
- If a real **"control from here" / ControlPoint** ever lands (watch for a transform field on `Control`
  / `ControlTemplate`, or a `ControlPoint`/`ReferenceTransform` type, or a docking-port-as-control-ref
  path), Option A/B's "must be root" constraint would relax into "attach anywhere + select." That would
  be the single most relevant change for this feature, so it's worth grepping for on each update:
  `grep -riE "controlpoint|control from here|referencetransform|controlfrom"`.

## 8. Key source references

- `KSA/FlightComputerAttitudeTrackTarget.cs` — the mode enum.
- `KSA/FlightComputerAttitudeTrackTargetEx.cs:23` — mode → world target frame.
- `KSA/VehicleReferenceFrameEx.cs` — `GetTail2Cci`(Up) `:253`, `GetFlp2Cci`(Forward) `:200`,
  `GetVlfBody2Cci`(Prograde) `:176`, `GetLvlh2Cci` `:131`, `GetDock2Cci`(Align) `:384`.
- `KSA/FlightComputer.cs:308` `ComputeControl`, `:966` `UpdateAttitudeTrackError` (aims +X / rolls +Z),
  `:48` default `RollMode`, `:526`-area controllability.
- `KSA/Vehicle.cs:256` `BODY2UPFRAME`, `:423-456` Body==Assembly frame, `:526` `IsControllable`.
- `KSA/Control.cs`, `KSA/ControlTemplate.cs` — empty marker module.
- `KSA/PartTree.cs:49` `Controls` list, `:665` `Reroot`.
- `KSA/VehicleEditor.cs:746` `IsAllowedAsRootPart`, `:830-848` launch pins root to identity,
  `:3919` Reroot button, `:4404-4489` root whitelist construction.
- `KSA/Part.cs:92-117` `Connector` + `Flag` enum, `:163` `ConnectAndMerge`, `:415-447` part Asmb
  transforms, `:661` `IsRoot`.
- `Content/Core/CoreCommandAGameData.xml` — `<Control/>` marker + geometry along X.
- `Content/Core/CoreCommandAAssets.xml:232-243` — nose(+X)/tail(−X) connectors.
- `Content/Core/CoreEditorTagsGameData.xml` — `EditorTagDef … RootPartWhitelist`.
