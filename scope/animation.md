# Scope — Animation (keyframe import, rig, GLB export, easing)

> flexo imports KSA's built-in keyframe animations (deployable panels, service modules…),
> lets the user edit them, and re-exports animation GLBs that KSA's `KeyframeAnimationModule`
> loads. The load-bearing integration is the **animation-GLB node-structure convention**.

**Baseline:** re-verified against KSA build **2026.8.19.5261** (decomp @ 5261 + shipped Core XML);
contract established at **2026.7.10.5056** and unchanged since.
**Baseline status:** ✅ **INTACT** — but 5056 rewrote KSA's own GLB loader (rev 5034) to the
semantics flexo already implemented, and in doing so made the scene ROOT node's transform
load-bearing for the first time. See [What changed in 5056](#what-changed-in-5056). The
GameData schema (`KeyframeAnimationModule`) and the bone/transform math are unchanged.

---

## Flexo modules

| Path                                                | Role                                                                                                                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/animationImport.ts`                        | Decodes a KSA `_Anim.glb` → `ImportedAnimation` (hand-rolled `parseGlb`, per-node TRS sampling, joint-vs-leaf classification, rest-keyframe detection, instance-id remap).                                        |
| `src/ksa/animationRig.ts`                           | Builds the joint-skeleton rig KSA requires (`buildAnimationRig`) + the shared sampling math (`sampleJointLocal`, `jointWorld`, `restAnchorTime`). Bakes eased segments → dense LINEAR samples at `BAKE_FPS = 30`. |
| `src/ksa/exportAnimationGlb.ts`                     | Serializes `AnimRig` → 2-chunk binary GLB. FLOAT accessors, **LINEAR samplers only**, names every leaf node.                                                                                                      |
| `src/ksa/animationNaming.ts`                        | Deterministic module-Id / GLB-path naming (`animModuleId`, `animGlbPath`); `isAnimationExportable` gate.                                                                                                          |
| `src/ksa/easing.ts` / `src/ksa/easingFit.ts`        | flexo-only cubic-bézier easing authoring; reverse-fits dense imported clips back to few keyframes + bézier.                                                                                                       |
| `src/state/animationStore.ts`                       | Document actions + ephemeral editor state (joints/keyframes/poses, pivot rebasing, spring-loaded scrubber).                                                                                                       |
| `src/state/partImport.ts`                           | Fetches each module's GLB, calls `decodeAnimationGlb`, applies `memberRestPlacements`, sets `restKeyframeId`.                                                                                                     |
| `src/ksa/partXmlParser.ts` / `partXmlSerializer.ts` | `animationModulesFromGameData` parses / `buildAnimationModuleElement` emits `<KeyframeAnimationModule>`.                                                                                                          |

## Game-side anchors (`decomp/KSA/`)

- **`KeyframeAnimationModule.cs`** — the part module. `[XmlType("KeyframeAnimationModule")]`; `ShowDeployRetract` attr; `SolarTrackingTemplate`; `ApplyAnimationTransforms`.
- **`KeyframeAnimationData.cs`** — the GLB loader + sampler. `Template.DoLoad` (the authoritative GLB node-structure schema); `SampleType {Linear, Step, CubicSpline}`; `EvaluateWorldMatrix`/`EvaluateLocalMatrix`.
- **`SolarTrackingExtension.cs`** — the optional `<SolarTracking>` runtime.
- Asset XML (`Content/Core/CoreServiceModuleAGameData.xml`):
  ```xml
  <KeyframeAnimationModule Id="…_SetAHeightA_Anim">
    <KeyframeAnimation Path="Animations/…_SetAHeightA_Anim.glb" Id="…_SetAHeightA_Anim" />
  </KeyframeAnimationModule>
  ```
- ⚠️ The binary `Animations/*.glb` node files are **NOT** in either decomp snapshot — flexo fetches them from its own asset mirror at runtime. The C# loader + XML wiring can be verified from the snapshots; the actual node naming/interpolation of a clip can only be checked against flexo's mirror.

## The contract — what flexo bakes in

**GameData XML schema** (`KeyframeAnimationModule.cs`):

- `<KeyframeAnimationModule Id>` with required `<KeyframeAnimation Path Id>` (a `FileReference`; `Path` is the mod-relative GLB).
- Optional attr `ShowDeployRetract` (bool) → flexo mode `deployRetract` vs `actuate`.
- Optional `<SolarTracking DegreesPerSecond SubPart>` + zero+ `<ExcludeSubPart>` text children.

**Animation-GLB node structure** (from `KeyframeAnimationData.Template.DoLoad` — the load-bearing convention):

- Reads **only `animations[0]`**. Extra glTF animations ignored.
- Exactly one parentless **root** node = the Part node. Since 5056 (rev 5034) its **own TRS is applied**, so it MUST stay identity — flexo emits identity in `buildAnimationRig`.
- **Every glTF node gets an `Animation`** (since 5056), defaulting to that node's own TRS; a node targeted by a channel samples its channels instead. `Animation.Parent` is the **immediate** parent node. (At 5018 only ANIMATED nodes got one and the parent link skipped to the nearest animated ancestor, silently dropping every non-animated intermediate's transform — the rev-5034 landing-leg bug.)
- **Members = SubPart leaves**: a node registered in `PartLookup[node.Name]` iff (i) it has **no** channels, (ii) `Name` is **non-empty**, (iii) **some** ancestor is animated. Its `ParentAnimation` is the **immediate** parent's `Animation`. **The leaf node `Name` MUST equal the SubPart instance Id** (the match key).
- Leaf static offset = the leaf node's own TRS.
- World matrix = leafLocal composed up the **full** parent chain — non-animated intermediates included, contributing their static TRS.
- A TRS channel whose accessor is **empty** falls back to the node's default TRS (the 5056 `array.Length > 0` guard).
- Duration = max last-input-time across channels.

**Easing / curves:**

- KSA's only interpolation vocabulary is `SampleType {Linear, Step, CubicSpline}` from the glTF sampler `interpolation`. **No easing/bézier/tangent concept in the part-animation runtime.**
- flexo's cubic-bézier easing is a **flexo-only authoring abstraction**, authored **PER CHANNEL** — an independent curve for `position`, `rotation` and `scale` on each joint-segment (`JointSegmentEasing` in `src/ksa/types.ts`; an absent channel is linear, and an all-linear segment is stored ABSENT so linear clips export byte-identically). It is materialized by **baking eased segments to dense LINEAR samples at 30 fps**, where a segment counts as eased when **ANY** channel is non-linear (`isLinearSegmentEasing`); the three channels share one sample-time set, so a scale-only ease densifies the whole segment. On import the curves are recovered by **per-channel reverse-fitting** against the same tolerances (pos 4 mm, rot 2.5°, scale 3e-3), with the per-joint dense-key fallback unchanged (kept losslessly when no fit passes the gate). flexo exports **only `interpolation: 'LINEAR'`**.

**Rest-anchor assumption ("deploy clips are modeled deployed = last keyframe"):**

- KSA overwrites each animated SubPart's placement from `EvaluateWorldMatrix(time)`; it does **not** use the SubPart's geometry `<Position>`.
- flexo overrides animated placements with the GLB-faithful rest pose (`memberRestPlacements`) and detects whether the modeled assembly matches t=0 or t=Duration (`restAtLastKeyframe` → `restKeyframeId`). A KSA _deploy_ clip is modeled fully-deployed (last keyframe; t=0 = stowed). Anchoring at t=0 would re-apply the whole deploy.

**Coordinate convention**: KSA "XYZ" Euler ≡ three.js `'ZYX'`; shared basis. All matrix math routes through `coords.ts` (`matrixFromTransform`/`transformFromMatrix`). See [connectors-coordinates-iva.md](connectors-coordinates-iva.md).

## Known gotchas

1. **Directly-animated SubPart node = silent no-op** (a node with channels is excluded from `PartLookup`). Every mover MUST be a non-animated leaf under a joint.
2. **Leaf must have non-empty `Name` === instance Id**, or it isn't registered — this is _why_ flexo hand-rolls the GLB exporter (three.js `GLTFExporter` prunes such nodes).
3. **CubicSpline clips import APPROXIMATED, not corrupted** (was: silent corruption). KSA supports **CubicSpline** (`KeyframeAnimationData.cs` `SampleType {Linear, Step, CubicSpline}`); glTF stores such a sampler's output as `[inTangent, value, outTangent]` triplets (3× the input count). `decodeAnimationGlb` now **detects** `interpolation === 'CUBICSPLINE'`, keeps only the middle (VALUE) row of each triplet and treats the segments as LINEAR — so the keyframes are exact and only the in-between motion is approximated (the tangents are dropped; flexo has no tangent model). The clip is flagged `PartAnimation.cubicSplineApprox`, which feeds the KSA import report and the clip diagnostics (`computeClipIssues` → "clip imported with CubicSpline sampling — approximated"). Still unverifiable against a real asset from the snapshots (the `Animations/*.glb` are not shipped in the decomp); every shipped clip checked through flexo's mirror is LINEAR. flexo still handles FLOAT accessors only.
4. Only `animations[0]` is read on both sides.
5. Wrong rest anchor re-applies the deploy (the reason `restKeyframeId` exists).

## What changed in 5261

**Verdict: NONE.** `KeyframeAnimationData.cs` and `KeyframeAnimationModule.cs` are both
**byte-identical** to 5168, so the GLB-loader contract and the module schema are unmoved — including
the rev-5034 rule that the scene ROOT node's own TRS contributes to `EvaluateWorldMatrix`, which
`animationRig.ts` satisfies by emitting an identity root.

The release added a large amount of _kitten_ animation (walk, jump, tumble, ladder climb — five new
`<GltfFile>`s in `CharacterAssets.xml`), but that is the Character/skeletal system, an entirely
separate path from the `KeyframeAnimation` module flexo authors; see
[kittens.md](kittens.md#what-changed-in-5261). Connectors still cannot animate with joints, so the
SubParts-only gate in flexo's mesh picker remains correct.

## What changed in 5168

**Verdict: ✅ INTACT.** `KeyframeAnimationData.cs` — the GLB-loader contract flexo's
`animationImport.ts` / `exportAnimationGlb.ts` are written against, including the scene-ROOT-node
TRS handling from the rev-5034 loader fix — is **byte-identical** at 5168.

`KeyframeAnimationModule.cs` changed by exactly one hunk, and it is runtime-only: the per-frame
extension callback now takes `context.States` instead of a captured `Vehicle readOnlyVehicle`
(`module.Extension?.Update(module, current.State.TimeCurrent, closestParent, context.States,
context.Step.DeltaTime)`). That is rev 5133's "modules using the render vehicle position instead of
the current physics position in their updates" fix. **No `[XmlElement]`/`[XmlAttribute]` moved**, so
the `<KeyframeAnimationModule>` schema, the clip/keyframe shape, and the deployed-pose rest-anchor
model are all unaffected.

Connectors still cannot animate with joints — nothing in 5168 changes that, so the SubParts-only
gate in the mesh picker remains correct.

---

## What changed in 5117

**Nothing in this area — re-verified INTACT.** Neither `KeyframeAnimationData.cs` (the GLB-loader
contract) nor `KeyframeAnimationModule.cs` (the schema) appears in the `5056 → 5117` decomp diff,
so every rule the 5056 review established — identity scene root, an `Animation` per glTF node,
immediate-parent links, the empty-accessor TRS fallback — still holds unchanged, and the
rest-anchor / deployed-pose modeling is unaffected. No `Animations/*.glb` changed in the private
mirror's 5117 sync.

## What changed in 5056

**KSA's GLB loader was fixed to match what flexo already did — no flexo change needed.**
rev 5034 ("Fixed a rare parsing bug for Part Keyframe Animations that was causing the landing
leg to animate incorrectly") rewrote the node-graph pass in
`decomp/KSA/KeyframeAnimationData.cs`:

|                                | 5018 (buggy)                                   | 5056 (fixed)                                              |
| ------------------------------ | ---------------------------------------------- | --------------------------------------------------------- |
| `Animation` built for          | only nodes with channels                       | **every** glTF node (defaults from the node's own TRS)    |
| `Animation.Parent`             | walk ancestors to the nearest **animated** one | the **immediate** parent                                  |
| `AnimatedPart.ParentAnimation` | nearest animated ancestor                      | immediate parent, gated on _some_ ancestor being animated |
| `EvaluateLocalMatrix`          | `array != null`                                | `array != null && array.Length > 0`                       |

The old form silently **dropped the local transform of every non-animated intermediate node**,
because the parent walk skipped straight past it. The landing leg is the shipped case:
`Animations/CoreLandingA_Prefab_MediumLandingLegA_Anim.glb` has a non-animated
`CoreLandingLegA_RootJoint` carrying `R = (0, 0.16549, 0, 0.98621)` sitting between the scene
root and the animated `CoreLandingLegA_RotaryJoint` — that rotation used to vanish.

**flexo was already correct.** `decodeAnimationGlb` (`src/ksa/animationImport.ts`) classifies a
node as a joint if it is animated **or** `hasLeafDescendant(i)` — which `RootJoint` is — and
`nodeWorld` composes the entire ancestor chain regardless of animation. So flexo modeled that
rotation all along; 5056 moved the game onto flexo's semantics rather than away from them.

**NEW load-bearing constraint:** because `dictionary2` now contains every node, the SCENE ROOT's
own TRS is part of the `Parent` chain that `EvaluateWorldMatrix` multiplies — at 5018 a root
transform was ignored. flexo's importer deliberately stops the walk at `roots`, and
`buildAnimationRig` (`src/ksa/animationRig.ts`) pushes the Part root as
`push(partId, new THREE.Matrix4())` — identity — so both directions still agree. **If flexo ever
emits a non-identity root node, exported clips will shift in-game.** Every shipped KSA clip also
uses an identity root (verified across the 5056 mirror).

**Asset-side note:** rev 5025's in-repo `GlbToXmlUtility` re-exported nine `Animations/*.glb`.
Node ORDER changed (root-first depth-first) and several base quaternions are negated (`q` and
`−q` are the same rotation). No flexo change; the only visible effect was the real-asset
easing-fit tolerance in `easingFit.test.ts` — per-joint angular error held at 2.70° → 2.83°,
while the ~4 m chain's amplification of it moved 6.6 cm → 12.6 cm, so the position bound was
relaxed 10 cm → 15 cm and annotated.

## What changed in 5018

**Nothing in this area.** The `4980 → 5018` diff touches no `KeyframeAnimation*` class, no
`SolarTracking`, no GLB-loader path and no bone/transform math (`QuaternionEx`/`Double3Ex`
unchanged). The update is the plumbing-topology + solid-rocket-motor work — see
[plumbing-and-feeds.md](plumbing-and-feeds.md). Re-verified **INTACT**.

## What changed in 4980

**INTACT — no flexo change, no diff.** Neither `KeyframeAnimationData.cs` nor
`KeyframeAnimationModule.cs` appears in the 4939→4980 diff, and the private mirror's
`Animations/*.glb` are byte-identical between the 4939 and 4980 syncs. The 4980 update is
HUD-layout/burn-UI/texture-streaming/vehicle-runtime work that never crosses the animation
contract. NONE.

## What changed in 4939

**INTACT — no flexo change.** `KeyframeAnimationData.cs` (the GLB-loader contract) is absent from
the 4892→4939 diff; `KeyframeAnimationModule.cs`'s hunks are runtime-only (a static
`AnyAnimating()` helper and rev 4930's collider refresh — animating parts now set
`ColliderModule.NeedsColliderUpdate`, plus `IKeyframeAnimationExtension.IsAnimating` for
solar-tracking). No schema or loader-contract drift; `Animations/*.glb` in the private mirror
(@ 4939) unchanged.

## What changed in 4892

**Nothing on the keyframe path — INTACT.** `KeyframeAnimationData.cs` and
`KeyframeAnimationModule.cs` are byte-identical 4826→4892. The rev-4875 sampling refactor
("sampled in local space then transformed into TRS", the rotation-only `SampleRotations`
sampler, the blink-sampling gate) lives entirely in the **character/skeletal** pipeline
(`AnimatedRenderable`/`SkeletalAnimClip`/`IAnimProcessor.UpdateLocalPose`) that part keyframe
clips never touch; `AnimExtensions.SearchKeyAtTime` went linear→binary search
(behavior-identical) and `TransformTRS.CreateMatrix` was rewritten algebraically-identically
(same S·R·T row-vector composition). No flexo change; rest-anchor, GLB node contract, and
LINEAR-only export all re-verified.

## What changed in 4826

**Schema intact.** Decomp diff (4750 → 4826): `KeyframeAnimationModule.cs` changed only by adding a
runtime `ApplyToMirroredParts(...)` method — it propagates a deploy-anim to a part's **symmetry
mirror copies** (`Part.SymmetryLink.Symmetries`), part of the new part-symmetry feature. No
`[XmlElement]`/`[XmlAttribute]`/schema change; `KeyframeAnimationData.cs` (the GLB-loader contract)
unchanged; no new/changed `Animations/*.glb`. flexo's import/export contract is unaffected (and
symmetry mirroring is a runtime vehicle behavior, outside flexo's part-template scope).

## What changed in 4750

- ✅ `KeyframeAnimationData.cs` byte-identical (the GLB-structure + sampler + rest-anchor contract is unchanged).
- ✅ `KeyframeAnimationModule.cs` + `AnimatedRenderable.cs` diffs = decompiler `.AsSpan()` artifacts only. Schema (`ShowDeployRetract`, `SolarTracking`/`DegreesPerSecond`/`SubPart`/`ExcludeSubPart`) identical.
- ✅ **rev 4691** added 3 `<KeyframeAnimationModule>` blocks (ServiceModule `SetAHeightB/C/D`), structurally identical to the existing `SetAHeightA` (Actuate mode). Flexo's importer already handles the exact shape. _NONE._ Suggested: add B/C/D to the import regression set; after the next asset-mirror sync, confirm the 3 new GLBs decode (they must be LINEAR-sampled — the only unverifiable risk per gotcha #3).
- ✅ `CoreServiceModuleAAssets.xml` has heavy geometry/connector churn but the `SetA*` SubPart instance-Id set is byte-identical, so every animation leaf reference stays valid (geometry-placement edits don't affect import — flexo overrides from the GLB).
