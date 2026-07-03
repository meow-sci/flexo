# Scope — Animation (keyframe import, rig, GLB export, easing)

> flexo imports KSA's built-in keyframe animations (deployable panels, service modules…),
> lets the user edit them, and re-exports animation GLBs that KSA's `KeyframeAnimationModule`
> loads. The load-bearing integration is the **animation-GLB node-structure convention**.

**Baseline:** re-vetted against KSA build **2026.7.3.4826** (decomp @ 4826 + shipped Core XML).
**Baseline status:** ✅ **INTACT** — the keyframe runtime, GLB-loader contract, GameData schema,
and bone/transform math are all unchanged. The only delta is 3 new content clips (ServiceModule
B/C/D) that flexo's existing importer already handles.

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
- Exactly one parentless **root** node = the Part node at identity.
- **Joints = animated nodes** (those targeted by a channel); parent chain = nearest _animated_ ancestor.
- **Members = SubPart leaves**: a node registered in `PartLookup[node.Name]` iff (i) it has **no** channels, (ii) `Name` is **non-empty**, (iii) it has an animated ancestor. **The leaf node `Name` MUST equal the SubPart instance Id** (the match key).
- Leaf static offset = the leaf node's own TRS.
- World matrix = leafLocal composed up the animated-ancestor chain.
- Duration = max last-input-time across channels.

**Easing / curves:**

- KSA's only interpolation vocabulary is `SampleType {Linear, Step, CubicSpline}` from the glTF sampler `interpolation`. **No easing/bézier/tangent concept in the part-animation runtime.**
- flexo's cubic-bézier easing is a **flexo-only authoring abstraction**, materialized by **baking eased segments to dense LINEAR samples at 30 fps**, and recovered on import by **reverse-fitting** LINEAR keys (gated to tol: pos 4 mm, rot 2.5°; else kept dense / lossless). flexo exports **only `interpolation: 'LINEAR'`**.

**Rest-anchor assumption ("deploy clips are modeled deployed = last keyframe"):**

- KSA overwrites each animated SubPart's placement from `EvaluateWorldMatrix(time)`; it does **not** use the SubPart's geometry `<Position>`.
- flexo overrides animated placements with the GLB-faithful rest pose (`memberRestPlacements`) and detects whether the modeled assembly matches t=0 or t=Duration (`restAtLastKeyframe` → `restKeyframeId`). A KSA _deploy_ clip is modeled fully-deployed (last keyframe; t=0 = stowed). Anchoring at t=0 would re-apply the whole deploy.

**Coordinate convention**: KSA "XYZ" Euler ≡ three.js `'ZYX'`; shared basis. All matrix math routes through `coords.ts` (`matrixFromTransform`/`transformFromMatrix`). See [connectors-coordinates-iva.md](connectors-coordinates-iva.md).

## Known gotchas

1. **Directly-animated SubPart node = silent no-op** (a node with channels is excluded from `PartLookup`). Every mover MUST be a non-animated leaf under a joint.
2. **Leaf must have non-empty `Name` === instance Id**, or it isn't registered — this is _why_ flexo hand-rolls the GLB exporter (three.js `GLTFExporter` prunes such nodes).
3. **Importer interpolation coverage is partial**: flexo handles only FLOAT accessors + LINEAR/STEP. KSA _does_ support **CubicSpline** → a CubicSpline-authored clip would be mis-decoded (silent corruption, not an error). Pre-existing; unverifiable from snapshots (GLBs not shipped).
4. Only `animations[0]` is read on both sides.
5. Wrong rest anchor re-applies the deploy (the reason `restKeyframeId` exists).

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
