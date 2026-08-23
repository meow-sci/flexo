# flexo ↔ KSA integration scope

This folder is the **authoritative catalog of every point where flexo depends on the Kitten
Space Agency (KSA) game** — the exact game classes, asset-XML schemas, file conventions, math
constants, and renderer quirks flexo bakes in. Its purpose is single: **when KSA ships an
update, this is the checklist you diff against to find what breaks flexo.**

- For _how flexo works internally_, see [`docs/`](../docs). This folder is the opposite view:
  the **contract with the game**, i.e. the break-surface.
- To vet a new game build, follow [GAME_UPDATE_CHECKLIST.md](GAME_UPDATE_CHECKLIST.md).
- Open gaps from the last update are tracked in
  [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

> **Keep this current.** Per [AGENTS.md](../AGENTS.md), any change to a flexo↔game integration
> point (XML schema read/written, ported math, asset/mesh/material naming, mod-export format,
> coordinate mapping, renderer-quirk workaround) MUST update the relevant `scope/*.md` in the
> same change. A new integration ⇒ a new `scope/*.md` + a row in the map below.

---

## Baseline game version

|                      | Build            | Path                                                                                                                                                               |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Verified against** | `2026.8.22.5348` | `ksa-game-assemblies/current` (decomp @ 5348) + `flexo-private-assets/assets` (Core XML @ 5348, UASTC re-encoded); also `ksa-game-assemblies` git commit `c465abb` |
| Previous baseline    | `2026.8.19.5261` | `ksa-game-assemblies_prev/current`, also git commit `1401af7` (the mirror \_prev copies go stale over time — diff the decomp via git history)                      |
| Baseline before that | `2026.8.5.5168`  | `ksa-game-assemblies` git commit `c9c5221` (diff decomp via git history)                                                                                           |

> ✅ **No unvetted build outstanding.** `ksa-game-assemblies/current` and the private asset mirror
> are both at **`2026.8.22.5348`**, and that is the build this catalog is now verified against.
> The mirror had already been advanced to 5348 alongside the decomp snapshot and re-encoded
> (commits `1c9158b` + `9ea18f2`), so no further sync or UASTC pass was needed. Two of the six
> vendored `src/ksa/__fixtures__/` files (`PartGameData.xml`, `CoreIVASpaceAGameData.xml`) were
> re-synced — `<Light Id>` and the MMU rocket-id rename, both real schema-adjacent movement.

Each snapshot holds `decomp/` (decompiled C#; schema lives in `[XmlType]`/`[XmlElement]`/
`[XmlAttribute]` + public fields), `Content/Core/` (the shipped game-data XML + GLSL shaders),
and `version.json` (a commit-by-commit changelog — the fastest first read on any update).

> **5348 review method.** Full `5261 → 5348` diff via `diff -rq` of the two provided asset trees
> (`ksa-game-assemblies_prev/current` @ 5261 vs `ksa-game-assemblies/current` @ 5348), a sweep of
> all **268 changed `decomp/*.cs`** for `[XmlElement]`/`[XmlAttribute]`/`[XmlType]`/`[XmlIgnore]`
> hunks — the only way an XML contract can move — and a `cmp` byte-identity check over every
> verbatim-ported class. `version.json` @ 5348 documents revs 5262–5346: a very large release
> (ground-clutter collisions + destruction + substances/mass, crew-portrait bone-tracked cameras,
> kitten swimming and low-gravity locomotion, clustered-lighting VRAM rework, a **static-object**
> system with real launch-pad models, terrain double-precision anchoring, electrical **circuits**,
> uniform editor part scaling, and sequencing moved from parts onto modules) whose **entire XML
> schema delta is 13 declarations**, of which six reach flexo.
>
> Findings: two **MISSING-CAPABILITY**, both now fixed. (1) Rev 5329 added
> `PartTemplate.WarnOnDuplicateModuleIds`, which logs an **Error** for two `Components` of the same
> type sharing an `Id` — and `<Light>` is a Component (`LightModule.TemplateData` derives
> `ModuleBase.TemplateDataBase`; `XmlHelper` maps every such class by its `[XmlType]` name). flexo
> emitted every `<Light>` without an `Id`, so any part with two lights tripped it, and an authored
> `<Light Id>` was dropped on import. Core reacted in the SAME build by naming every shipped light
> (`<Light Id="RightWindow">`, `Id="Right"`/`"Left"`, `Id="PointLight"`/`"SpotLight"`). flexo now
> keeps the authored id in `PartLight.ksaId` and always emits one, falling back to the document id.
> (2) Rev 5329 promoted `RocketTemplate.Nozzles` from `List<SubPartIdReference>` to
> `List<RocketNozzleReference>`, adding `[XmlAttribute] double AreaRatioMultiplier = 1`. It is
> load-bearing physics, not decoration: `SolidMotorNozzle.ThroatSizingArea` is now
> `ExitArea / AreaRatioMultiplier` and `SolidMotor.ResizeNozzles` / `ComputeTotalThroatArea`
> apportion the stack's throat by THAT, not the raw exit area. Core authors it
> (`CorePropulsionA_Prefab_LESA`, `AreaRatioMultiplier="1.0025"`), so flexo both dropped it on
> round-trip and mis-solved such a stack; `types.ts`'s new `RocketNozzleRef` and the re-ported
> `solidMotorPhysics.ts` close both halves.
>
> Three **SCHEMA-DRIFT / MISSING-CAPABILITY, open**: `PbrMaterialReference` gained
> `[XmlElement("Alpha")] TextureReference AlphaMap` (gap **T1**, alpha-cutout materials —
> Core uses it only on the launch pad, and `PartModel.PerDrawData` still binds five textures, so
> nothing on a part path is lost today); `PartModelModule.TemplateData` gained
> `[XmlElement("Terrain")] bool Terrain` (gap **T2** — a MODELED element, so no passthrough covers
> it; only static objects author it); and `SubPartIdReference`-shaped `<PrimarySequenceModule>`
> replaced `PartTemplate.Decoupler` in the template's element list (gap **T3** — Core authors it
> under `<PartGameData>` where flexo's `RawXmlNode` passthrough preserves it, but it is dropped on
> a geometry `<Part>` and opaque to the editor, exactly like `<Grab>`/gap **S2**).
>
> One **COSMETIC, open**: `CharacterAssets.xml` re-pointed `KittenMMUGlb` from
> `Characters/KittenMMU/KSA_Cat_MMU.gltf` to a new `SK_KSA_MMU.glb`. Both still ship, so flexo's
> kitten aide keeps loading — but it now shows the retired MMU (gap **T4**).
>
> **The decoupler moved but the wire format did not.** `DecouplerTemplate.cs` was deleted and
> `PartTemplate` lost `[XmlElement("Decoupler")]`; a decoupler is now `Decoupler.TemplateData`, a
> `Components` module carrying `[XmlType(TypeName = "Decoupler")]` with the same `ConnectorId` +
> `Force` attributes. `<Decoupler ConnectorId Force/>` therefore still parses identically under both
> `<Part>` and `<PartGameData>` — flexo needed no change. Two consequences worth knowing: a
> decoupler is now **repeatable** (`CreateComponents` loops the whole `Components` list) and
> `ApplyGameData` **appends** rather than overrides, so a part authoring `<Decoupler>` in BOTH the
> geometry `<Part>` and its `<PartGameData>` now gets two. flexo emits it only under
> `<PartGameData>`, so it is unaffected.
>
> **Editor part scaling (rev 5329) is a runtime feature, not authored data.** `IRescale`/
> `ScaleFactors` rescale a live part uniformly (0.5×–2×, `ScaleFactors(double3)` takes the
> **largest** axis), and `Part.ScaleTotal` changed from an additive quaternion-transformed
> composition to a plain component-wise product. Nothing in the XML moved and **rendering still
> uses the non-uniform `CreateScale(Scale)`**, so flexo's authored SubPart transforms are unmoved.
> The one thing to know: KSA's own GLB importer now warns that "the simulation scales uniformly and
> will size this from the largest axis" for a non-uniform `_connector` / mesh node scale.
>
> **Static objects are a NEW top-level `<Assets>` family, deliberately out of scope.**
> `AssetBundle` gained `<StaticObject>` / `<StaticSubObject>` / `<StaticObjectGameData>` (launch-pad
> scenery, rev 5328) and `<ClutterObjectGameData>` (rev 5304). flexo never emits or re-emits a whole
> Core `<Assets>` file, so there is nothing to silently drop on the part path; the clutter half
> widens the ground-clutter scaffold gap **R1** instead (`ClutterObjectTemplate` gained a repeatable
> `[XmlElement("Substance")]` with a `<Volume>`, and a collideable clutter object with no mass now
> warns).
>
> Explicitly **re-verified intact**: every verbatim-ported class is byte-identical —
> `DeLavalNozzleConfig` / `CombustorConfig` / `GasProperties` / `NozzlePerformance` / `RocketDesign`
> / `EngineDesigner`, the whole reaction family (`ReactionTemplate` / `FixedReactionTable` /
> `MixtureReactionTable` / `Reaction`), `GrainGeometryTemplate` and every unit reference
> (`Area`/`Distance`/`Mass`/`Energy`/`Power`/`Impulse`). `KeyframeAnimationData` /
> `KeyframeAnimationModule`, `GltfUtils` and `ThumbnailRenderResources` changed **only** by the
> `ReadOnlySpanExtensions.Cast<>(x)` → `x.Cast<>()` and `SpanExtensions.AsBytes<>(x)` → `x.AsBytes()`
> decompiler-shape churn — so the animation loader contract and the mandatory synthetic Normal + ORM
> both stand. `ColliderModule`/`ColliderTemplate` gained only the runtime rescale path;
> `ComputeAuthoredLocationPartAsmb()` is the same `LocationAsmb + ShapeOffsetCollider.Transform(q)`
> formula, and the primitive list is still the four analytic shapes plus 5261's `<ConvexHull>`.
> `IVASeat`'s seat basis is unchanged (the rewritten `GetSeatAxesAsmb` + `SeatToAsmbRotation` build
> the identical matrix rows `[forward; right; cross(forward, right)]`), so `ivaSeatAxes.ts`'s
> `EULER_ORDER` calibration and `ivaLook.ts` stand — only the seated **kitten** placement changed
> (`SEATED_SCALE` 0.5 → 1.0, `SEATED_DOWN_OFFSET` replaced by `KittenLocomotionTuning.SeatedOffset`),
> which flexo does not render. `Mod` / `ModLibrary` / `AssetBundle` changed only by the new
> static-object/clutter registrations, so the multi-part bundle contract is unmoved.
> `RocketControllerData.ComputeFromRocketTemplates` was **deleted** (rev 5340 removed the
> "parallel universe" that computed part characteristics from XML templates in favour of
> instantiating a real `Part`); the surviving instance-side `ComputeFromRockets` is byte-identical
> and the physics is unchanged, so `enginePhysics.ts` needs no re-port — only the citation moved.
> `DeLavalNozzleTemplate.Create` now routes the throat through
> `DeLavalNozzle.ComputeThroatArea(exitArea, areaRatio)` = `areaRatio > 0 ? exitArea / areaRatio :
exitArea`, a **new guard** that makes a NaN/zero `<AreaRatio>` degrade to ratio 1 instead of
> producing NaN thrust; flexo still requires the value (`engineValidation.ts`), which stays correct.
>
> Content-side: Core added a parachute bay + launch-escape tower (`CoreUtilityA`,
> `CorePropulsionA_Prefab_LESA`), a second small SRB-C segment, and `<Grab Id>` handrail anchors;
> re-imported the A5/LES art to remove thrust asymmetry; renamed the MMU's eight
> `<Rocket>`/`<RocketReference>` ids to `…Rocket` (they collided with the thruster-controller ids —
> the same duplicate-id hygiene push as `<Light Id>`); and shrank a CoreCommandA cylinder collider
> radius 0.5 → 0.49. `CoreServiceModuleAAssets.xml` flipped three more connector rotations
> (`X="-1.5708"` → `X="1.5708"`), continuing the 5261 sweep behind gap **R2**.

> **5261 review method.** Full `5168 → 5261` diff via `diff -rq` of the two provided asset trees
> (`ksa-game-assemblies_prev/current` @ 5168 vs `ksa-game-assemblies/current` @ 5261), a sweep of
> all **244 changed `decomp/*.cs`** for `[XmlElement]`/`[XmlAttribute]`/`[XmlType]`/`[XmlIgnore]`
> hunks — the only way an XML contract can move — and a `cmp` byte-identity check over every
> verbatim-ported class. `version.json` @ 5261 documents revs 5169–5258: a very large release
> (kitten EVA locomotion — walking, jumping, tumbling, ladders and grabbing — a crew-portrait and
> resources gauge system, per-canvas gauge visibility contexts, `SimTime` → 128-bit `UniverseTime`,
> physics-bubble and per-vehicle parallel job batching, cursor-hover rework, SOI departure-burn
> accuracy) whose **entire XML schema delta is 8 files**, of which four reach flexo.
>
> Findings: one **BREAKING**, now fixed — rev 5173 reordered `SolidMotor.ResizeNozzles`'s area-ratio
> bounds so the LOW bound wins where the two cross (`MinAreaRatioBound` is derived first and floored
> at 1.2, then `MaxAreaRatioBound` is raised to meet it), and **deleted** the
> `"Stack too large for the nozzle"` rejection entirely; flexo's verbatim port had the pre-5261
> ordering, so an oversized stack that the game now runs at the 1.2 floor was refused a thrust curve.
> One **MISSING-CAPABILITY**, now fixed — `LightModule.TemplateData` gained
> `[XmlElement("DisableInIva")]`, which Core authors on the two new CoreIVASpaceA seat face-fill
> lights; `<Light>` is a MODELED element so the passthrough does not cover it and a round-trip
> silently dropped the flag. One **MISSING-CAPABILITY, open** — `ColliderModule.Template` gained a
> **fifth** primitive, `[XmlElement("ConvexHull", typeof(ConvexHullColliderTemplate))]` (rev 5185),
> the first collider backed by a mesh rather than an analytic shape; flexo models exactly four
> (gap **S1**). One **COSMETIC** — rev 5200's re-import of the command parts dropped Core's only
> two `<ShadowCaster>false</ShadowCaster>`s, so no Core template authors the element anymore; the
> schema is untouched (`PartModelModule` is byte-identical) and only the real-data test anchor moved.
>
> `<Grab>` (rev 5203's ladder/handhold anchors, new `GrabTemplate.cs`) is declared on **both**
> `PartTemplate` and the GameData template, and Core authors it only under `<PartGameData>` — where
> flexo's `RawXmlNode` passthrough preserves it verbatim. It is opaque to the editor and a `<Grab>`
> authored on a geometry `<Part>` would still be dropped (gap **S2**).
>
> Explicitly **re-verified intact**: every remaining verbatim-ported class is byte-identical —
> `DeLavalNozzleConfig` / `CombustorConfig` / `GasProperties` / `NozzlePerformance` / `RocketDesign`
> / `RocketNozzleTemplate`, the whole reaction family, `SolidTemplate` / `SolidGrainSegmentTemplate`
> / `GrainGeometry` / `GrainGeometryTable` and every solid mass template, `KeyframeAnimationData` /
> `KeyframeAnimationModule`, `ThumbnailRenderResources` (so flexo's synthetic Normal + ORM stay
> mandatory), `PbrMaterialReference` (still no emissive-LUT slot), `PartModelModule`, `IVASeatTemplate`
> / `IVAController` / `EVADoorTemplate` / `DockingPortTemplate`, `BatteryTemplate`,
> `ConsumerFeedWiring` / `FeedsFromReference` / `RocketCoreTemplate`, `SubPartTemplate` /
> `EditorTagDefinition`, and `Control` / `ControlTemplate` (still empty markers).
> `QuaternionEx.CreateFromXyzRadians` is untouched — the class only lost `Slerp` and gained
> `GetTwistAboutAxis` — so `coords.ts`'s `EULER_ORDER` calibration stands. `Mod` / `ModLibrary` /
> `AssetBundle` changed by formatting only, so the multi-part bundle contract is unmoved. The whole
> unit-reference family (`Energy`/`Power`/`Impulse`/`Mass`/`Distance`/`Area`) shows large diffs that
> are **entirely** rev 5169's display refactor — `ToNearest` moved from an instance method to a
> static `SpanBuilder` one and the `INearestString` interface was deleted; every **token → scale
> parse table** is unchanged.
>
> Content-side: `Reactions.xml` re-formulated the double-base solid propellant
> (`BurnRate CoefficientMPerS` 0.0024 → 0.0047, `Exponent` 0.65 → 0.3, `MinimumBurnPressure`
> 30 → 15 bar) — values flexo reads live from the mirror, no code change. Revs 5238/5239 re-imported
> CoreElectricalA / CoreFuelTankA / CorePassageA / CorePropulsionA to **fix flipped connectors**
> (`<Rotation X= Z=>` → `<Rotation Z=>`), and rev 5225 added a suspicious-connector-orientation
> warning to the game's own GLB→XML importer. Rev 5190 removed the placeholder colliders from the
> landing legs and solar panels now that those parts have art-authored ones. Five of the six vendored
> `src/ksa/__fixtures__/` files were re-synced (values only — no schema movement).

> **5168 review method.** Full `5117 → 5168` diff via `diff -rq` of the two provided asset trees
> (`ksa-game-assemblies_prev/current` @ 5117 vs `ksa-game-assemblies/current` @ 5168), plus a sweep
> of all **226 changed `decomp/*.cs`** for `[XmlElement]`/`[XmlAttribute]`/`[XmlType]`/`[XmlIgnore]`
> hunks — the only way an XML contract can move — and a `cmp` byte-identity check over every
> verbatim-ported class. `version.json` @ 5168 documents revs 5118–5166: a very large release
> (kitten locomotion, an imgui UI restyle, dynamic-rendering + CMAA2 renderer rework, terrain and
> ocean accuracy work, flight-plan SOI fixes), whose **entire XML schema delta is 8 files**.
>
> **No BREAKING item on any part-editor path**, and every verbatim-ported class is byte-identical:
> `DeLavalNozzleConfig` / `CombustorConfig` / `GasProperties` / `NozzlePerformance` / `RocketDesign` /
> `RocketControllerData` / `EngineDesigner` / `RocketNozzleTemplate`, the reaction family, the whole
> solid-motor template + grain-geometry set, `QuaternionEx`, `KeyframeAnimationData`,
> `ThumbnailRenderResources` (so flexo's synthetic Normal + ORM stay mandatory),
> `PbrMaterialReference` (no emissive-LUT slot appeared), `PartModelModule`, `IVASeat` /
> `IVAController` / `EVADoorTemplate` / `DockingPortTemplate`, `BatteryTemplate`, `LightModule`, the
> unit-reference family, `ConsumerFeedWiring` / `FeedsFromReference` / `RocketCoreTemplate`, and
> `SubPartTemplate` / `EditorTagDefinition`. The collider classes' diffs are **pure decompiler
> noise** — the Bepu DLLs were added to the snapshot, so the `//IL_xxxx: Unknown result type`
> comments disappeared and `Shapes` resolved to `BepuPhysics.Collidables.Shapes`.
>
> Findings: one **BREAKING** item confined to the ground-clutter scaffold (revs 5136–5138/5157
> reworked clutter onto the asset bundler — see [ground-clutter.md](ground-clutter.md)); one
> **MISSING-CAPABILITY**, now fixed (rev 5161's new `CoreUtilityAAssets.xml` was missing from the
> hand-maintained `ASSET_FILES`, so the ladder parts were invisible in the browsers — a drift guard
> in `catalog.test.ts` now enumerates the live tree); and one **SCHEMA-DRIFT (docs-only)**: rev
> 5133's "Control From Here" makes the vehicle attitude reference the _control_ frame
> (`FlightComputer` now uses `Ctrl2Body`), overridable per-vehicle to any `Control`-bearing part or
> docking-port connector. Critically, `Control` / `ControlTemplate` are **byte-identical empty
> markers** — the choice persists on `VehicleData` (`<ControlPartId>` / `<ControlConnectorId>`),
> never on a part template — so flexo authors nothing new; the consequence is that connector
> orientation is now load-bearing for flight control, not just snapping. Rev 5166's two new
> `<SolidOgiveMass>` / `<HollowOpenOgiveMass>` mass elements ride the existing GameData
> passthrough. The only vendored-fixture movement was `PartGameData.xml`, and it is **values only**
> (rev 5119's RCS retune + the kitten MMU's new feet-at-origin part frame, `Z -= 0.431`).
>
> **5117 review method.** Full `5056 → 5117` diff via `diff -rq` of the two provided asset
> trees (`ksa-game-assemblies_prev/current` @ 5056 vs `ksa-game-assemblies/current` @ 5117),
> plus a sweep of every changed `decomp/*.cs` for `[XmlElement]`/`[XmlAttribute]`/`[XmlType]`
> hunks — the only way an XML contract can move. `version.json` @ 5117 documents revs
> 5057–5116: a large release (crew/kitten roster, burn-planning UX, launch pads, vehicle
> destruction, plume-trail and atmosphere refactors) whose **entire XML schema delta is seven
> lines**, of which two touch flexo. **No BREAKING item.** Two **MISSING-CAPABILITY** gaps,
> both from the same feature (rev 5085, EVA-door ↔ seat linking): `<EVADoor SeatId>` is a new
> attribute flexo drops, and `<IVASeat Id>` — long schema-legal via `ModuleBase.TemplateDataBase`
> and deliberately never emitted by flexo — became **load-bearing** as the target of that link
> (`EVADoor.ResolveAlignedSeats` matches `IVASeat.TemplateId` against `EVADoor.SeatId`), with
> Core now authoring both ends. One **SCHEMA-DRIFT** (docs-only): rev 5099 replaced the clutter
> ecotype's `<Collideable Value>` with `<CollisionType Value="None|PrimitiveList|Mesh">`; the
> cartoon-moon scaffold emits neither, so no generator change is required.
>
> Explicitly **re-verified intact**: every ported engine-physics class is byte-identical
> (`DeLavalNozzleConfig` / `CombustorConfig` / `GasProperties` / `CombustionTable` /
> `NozzlePerformance` / `RocketDesign` / `EngineDesigner` all unchanged); the coordinate
> convention survived rev 5067's **deletion of `Double3Ex.Up/Down/Right/Left/Forward/Backward`**
> — the vectors moved to `Camera.ForwardView`/`RightView`/`UpView` with **identical values**
> (`-UnitZ` / `+UnitX` / `+UnitY`) and `QuaternionEx.GetAxis`'s fallback became the equally
> identical `double3.UnitY`, so `coords.ts`'s `EULER_ORDER` calibration is untouched;
> `QuaternionEx.CreateFromXyzRadians`, `KeyframeAnimationData`/`KeyframeAnimationModule`,
> `Control`/`ControlTemplate` (still empty markers — a `controlpoint`/`referencetransform`
> grep over the 5117 decomp finds only Vulkan tessellation and spline-editor hits),
> `FlightComputer.UpdateAttitudeTrackError` (still aims body **+X**), `PartModelModule`'s
> `[XmlElement("Internal")]` (still the only one in the tree), `Mod`/`ModLibrary`/`AssetBundle`/
> `PbrMaterialReference`, `CharacterAssets.xml` + `KittenRenderable`, and
> `ThumbnailRenderResources` (byte-identical — the un-guarded `Material.NormalReference`/
> `AoRoughMetalReference` deref survives, so flexo's synthetic Normal + ORM stay mandatory).
> `ModelTranslucent.frag`/`Fur.frag` changed by exactly one line each (a `GetCloudShadow`
> multiply), which does not touch the kitten material contract.
>
> Content-side: `CoreElectricalAGameData.xml` dropped placeholder `<Collider>` blocks and
> `CoreFuelTankA/B` re-tuned tank oversizing (values + comments, no schema); `CorePropulsionAAssets.xml`
> was re-imported with transforms applied to vertices; `Volatiles.xml`/`SolidPropellants.xml`
> gained `DefaultPhase=` + `<Color>` on `<Substance>` (flexo consumes only substance-phase **ids**
> like `H2(l)`, which are unchanged). All six vendored `src/ksa/__fixtures__/` files were
> re-synced from the 5117 mirror and the full `src/ksa` suite (614 tests) passes.

> **5056 review method.** Full `5018 → 5056` diff via **git history inside
> `ksa-game-assemblies`** (`git diff 3106557 13595c1`) + `diff -rq` of the two private-mirror
> `assets/` trees; `version.json` @ 5056 documents revs 5019–5055. One **BREAKING** schema
> move and a large amount of regenerated content. The break: **rev 5022** pulled
> `<VolumetricExhaust>` / `<PlumeTrail>` off `RocketNozzleTemplate` and re-homed both inside a
> repeatable `<ReactionPlume Reaction Default>` (new `ReactionPlumeReference.cs`) so a nozzle
> can switch exhaust style with the core's configured reaction. Because `<DeLavalNozzle>` /
> `<SolidMotorNozzle>` are **modeled** elements they never rode the GameData passthrough, so
> flexo both lost the plume on import and emitted XML the game now ignores. Fixed by replacing
> the two scalar fields with a `reactionPlumes: ReactionPlume[]` list (no back-compat, per the
> no-migration rule); the two existing editor selects now drive the unkeyed `Default="true"`
> entry and reaction-keyed entries round-trip untouched.
>
> The other load-bearing rev is **5034**, which fixed KSA's own `KeyframeAnimationData` GLB
> loader: it used to build an `Animation` only for ANIMATED nodes and walk parentage past
> non-animated intermediates, silently dropping their local transforms — the "landing leg
> animates incorrectly" bug. It now builds an `Animation` for EVERY glTF node and links each to
> its IMMEDIATE parent. **flexo needed no change**: `animationImport.decodeAnimationGlb` already
> treated a non-animated ancestor-of-a-member-leaf as a joint (`hasLeafDescendant`) and composed
> the full chain in `nodeWorld`, so flexo was already right and the game caught up. Verified
> concretely against the mirror: `CoreLandingA_Prefab_MediumLandingLegA_Anim.glb` carries a
> non-animated `CoreLandingLegA_RootJoint` with a non-identity rotation between the scene root
> and the animated chain. NEW live constraint the fix creates: the scene ROOT node's own TRS now
> contributes to `EvaluateWorldMatrix` (it was ignored before) — flexo emits an identity root in
> `animationRig.ts`, so this holds, but it is now load-bearing.
>
> Everything else re-verified **INTACT**: the byte-identical ported physics
> (`DeLavalNozzleConfig` / `CombustorConfig` / `GasProperties` / `NozzlePerformance` /
> `RocketDesign` / `EngineDesigner` / `RocketCore` / `Combustor` / `FixedReaction`), and
> `QuaternionEx` / `Double3Ex` / `Control` / `ControlTemplate` / `FlightComputer` / `IVASeat` /
> `IVAController` / `PbrMaterialReference` / `AssetBundle` / `ThumbnailRenderResources` /
> `PartModelRenderer` / kitten rendering / `EditorTagDefinition` / `SubPartTemplate` /
> `KeyframeAnimationModule` are all unchanged. `<Internal>` is still the only
> `[XmlElement("Internal")]` in the decomp and `ENABLE_EMISSIVE` is still defined. No
> `ControlPoint` / reference-transform appeared, so "up follows root" holds. `Part.Connector`
> and `Tank` gained only `ShouldSerialize*` write-side helpers — the `<Flags>` / `<Capabilities>`
> wire format is unchanged. Rev **5028** added `[DefaultValue]` to `PartModelModule.RayTracing`
> (`Disabled`) / `.ShadowCaster` (`true`) / `.Internal` (`false`) and the two
> `PartModelGlassModule` bools (both `false`); these are WRITE-side suppression only and confirm
> the defaults flexo already assumes. `PartTemplate.EditorTags` gained `[XmlIgnore]` — the wire
> element is still `<EditorTag>` via `EditorTagsStrings`.
>
> Content-side, rev **5025** moved the `GlbToXmlUtility` into the codebase (new `KSA.GlbImport`
> namespace: `AssetBundler.cs` / `ToolXml.cs` / `InputSet.cs`) and rev **5026** regenerated nine
> Core part files through it. It is the game's own reference implementation of what flexo's
> `assetsXmlSerializer.ts` / `exportGlb.ts` emit, and it independently confirms flexo's
> conventions (`_VM` view meshes, `<Stem>_Material`, `_ColPrim*` / `_connector` / `_pivot` /
> `_glass` / `_raytrace*` node prefixes, synthetic Normal + AoRoughMetal). It also writes **4
> significant figures** where the old external tool wrote 5–6, so every regenerated collider /
> transform value in Core shifted in the last digit — a content change, not a schema one.
> Rev **5026** additionally split the fuel port into its own `CoreFuelPortGameData.xml`;
> `<FuelPort MaxLength>` remains a `<PartGameData>` child (passthrough-safe) and an OPEN gap.
>
> **5018 review method.** Full `4980 → 5018` diff via **git history inside
> `ksa-game-assemblies`** + `diff -rq` of the two private-mirror `assets/` trees;
> `version.json` @ 5018 documents revs 4981–5016. Unlike the last three updates this one is
> **not a patch list — KSA changed the SHAPE of how a Part declares propellant flow**, and
> flexo's model had no equivalent concept. Three load-bearing revs: **4992** (solid rocket
> motors + connector Capabilities + explicit engine feed sources), **5002** (solid modules on
> every booster part, `HollowOpenSemiEllipsoidMass`, feeding from sub-parts) and **5007**
> (decoupler joints became a per-connector Capability). What used to be implicit — a combustor
> searching the whole vehicle for tanks — is now explicitly authored topology in three layers:
> connector `<Capabilities>`, consumer `<FeedsFrom>`, and Part `<ConsumerFeedWiring>`. Because
> `<Connector>`, `<Combustor>` and `<Tank>` are **modeled** elements they never rode the
> GameData passthrough, so every addition was silent data-loss: a flexo-exported engine
> declared no feed points (dead in-game) and a round-tripped fuel tank / decoupler / SRB
> segment lost its `BulkFluid` / `DecouplerJoint` / `SolidMotorCase`. New surface doc:
> [plumbing-and-feeds.md](plumbing-and-feeds.md). Also handled: solid-motor authoring
> (`<SolidMotor>`/`<SolidMotorNozzle>`/`<SolidGrainSegment>` + `GrainGeometries.xml`), the
> mandatory solid-reaction burn-rate data (`FixedReactionTemplate.Create` THROWS without it —
> a crash-class export bug), the `DefaultEngine` → `DefaultPlumeTrail` rename (Core now uses
> trails on SRBs only), and a **pre-existing latent bug** promoted to breaking: flexo emitted
> comma-joined `[Flags]` bodies, but .NET's `XmlSerializationReader.ToEnum` splits on
> WHITESPACE and throws on the resulting `"Internal,"` token. Ported physics
> (`enginePhysics.ts`) is byte-identical and needed zero changes; animation, kittens,
> coordinates, mod/asset loading all re-verified **INTACT**. Full detail:
> [plans/UPGRADE_PLAN_2026-07-24.md](../plans/UPGRADE_PLAN_2026-07-24.md).
>
> **4980 review method.** Full `4939 → 4980` diff via **git history inside `ksa-game-assemblies`**
> (`git diff 2423a02 cdb7391`) + `diff -rq` of the two private-mirror `assets/` trees;
> `version.json` @ 4980 documents revs 4940–4978. The update is HUD layouts, the burn-UI gauge
> rework, navball markers, screenshots, terrain **texture streaming**, cascaded-shadow
> specialization constants, and vehicle-runtime work (docking frame fixes, undock naming, fuel
> flow-rule persistence, sequence Δv rework) — almost entirely outside flexo's surface.
> **Zero part-template/GameData/engine/animation schema drift**: no `*Template.cs`, unit
> reference, ported-physics, or `KeyframeAnimation*` class changed; the shipped part XML is
> content-identical (8 mirror files differ only in CRLF line endings — sync artifact; fixtures
> unaffected). Contract mechanics that MOVED but held: root-identity pin consolidated into
> `PartTree.NormalizeRootRotation()`; `Part.Connector.ConnectAndMerge` rewritten (same 180°-Z
> mate contract). Save-side-only schema: `ControlData.VehicleName`, `FlightComputerData.RCSMode`
> (+ RollMode default `Up`→`Decoupled`), `EngineController.SaveData.FlowRule` (default flow rule
> flipped to `FurtherestToNearestSameStage`), docking `PreDockRootTransform`. One data-side
> delta handled: new **`TextureCategory.TerrainHeight`** — Core retagged height-affecting
> celestial textures, and the cartoon-moon scaffold's Luna block was retagged to match (see
> [ground-clutter.md](ground-clutter.md#what-changed-in-4980)). No new integration surfaces;
> the 4939 OPEN gaps (geometry `<Collider>`, part-level `<Tank>`, FuelPort, clutter LOD retune)
> carry forward. All areas re-verified **INTACT/CURRENT**.
>
> **4939 review method.** Full `4892 → 4939` diff via **git history inside `ksa-game-assemblies`**
> (`git diff 7cf5c0a 2423a02`); `version.json` @ 4939 documents the whole rev range 4893–4939.
> The bulk of the update is rendering (screenspace particles, volumetric plume trails, clutter
> culling) and vehicle-runtime work (fuel lines/ports, tank transfer, sequence UI) — outside
> flexo's part-template scope. Real contract deltas, all handled: **`<PlumeTrail Id>`** on
> `RocketNozzleTemplate` (new `[XmlElement]`; Core now sets `DefaultEngine` on every main
> engine — modeled in flexo, see [engines.md](engines.md#what-changed-in-4939)); new
> **`Booster` editor tag** (registry snapshot refreshed); new asset packs
> **CoreFuelTankB** (bays) / **CorePropulsionC** (large SRBs, GameData unconfigured) added to
> `ASSET_FILES`; **tank GameData relocated** from SubPart-level entries in `PartGameData.xml`
> to Part-LEVEL `<Tank>` entries in `CoreFuelTankAGameData.xml` (flexo doesn't model part-level
> tanks — passthrough preserves them; fixtures re-synced); `<SymmetryGroup>` GameData sugar for
> connector `<Sibling>` (passthrough-safe; `[XmlElement("Sibling")]` schema unchanged); first
> **geometry-template `<Collider>`** children on 2 CoreElectricalA prefabs + 2 solar-cell
> SubParts (NOT passthrough-covered — recorded gap, see
> [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)); new `FuelPort`
> GameData module (passthrough-safe, opaque to the editor). `VolumeReference` XML schema
> unchanged (display-only liters rework). Animation, kittens, custom-assets/mod-export,
> connectors/coords/IVA, clutter schema all re-verified **INTACT**.
>
> **4892 review method.** Full `4826 → 4892` diff via **git history inside `ksa-game-assemblies`**
> (`git diff 1265373 7cf5c0a`) — the `_prev` directory was stale (4750), so the last-vetted 4826
> tree came from the repo's own history. `version.json` @ 4892 documents revs 4861–4892 only
> (4827–4860 have no changelog; the file diff is authoritative). Headline: the **rev-4884
> Reactions refactor** (Combustion.xml → Reactions.xml, `<Combustor><Reaction Id>` +
> `<MixtureRatio>`, tank `<RoleAffinity>`) — BREAKING, re-modeled in flexo (see
> [engines.md](engines.md#what-changed-in-4892), [gamedata-modules.md](gamedata-modules.md#what-changed-in-4892))
> — plus the **ground-clutter multi-material schema** (LOD `<Material Id>` refs now REQUIRED —
> the cartoon-moon scaffold was regenerated, see [ground-clutter.md](ground-clutter.md#what-changed-in-4892)).
> Animation, kittens, custom-assets/mod-export, and connectors/coords/IVA re-verified **INTACT**.
> New vehicle-level systems (fuel links, sequence performance, resource groups) are save-state,
> not part-template surfaces — no new scope rows needed.
>
> **4826 review method.** Full `4750 → 4826` **decomp diff** (`ksa-game-assemblies` @ 4826 vs
> `ksa-game-assemblies_prev` @ 4750) + shipped-Core-XML diff. (An early pass mistook a stale
> checkout for "no 4826 decomp"; the decomp _is_ at 4826 and every finding below was re-verified
> against the actual C#.) The 4826 `version.json` only documents revs 4824→4826 (terrain-perf); the
> real 4751→4826 delta was recovered from the decomp + XML diffs, not the changelog. The new
> `<Sibling>`/`<Aligned>` are the game's new **part-symmetry** system (`Connector.SymmetrySiblings`
> = `[XmlElement("Sibling")] List<ConnectorReference>`; `PartTemplate.Aligned` = `List<AlignedConnectorsRef>`);
> the runtime `PartSymmetryInstance`/`SymmetryLayerInstance` classes are **vehicle-assembly / save
> state, outside flexo's part-template scope** — only the connector-level template hints reach flexo.

---

## The one cross-cutting invariant (read first)

**flexo rebuilds a fresh `<Assets>` document from a typed model — it is not a byte-faithful
editor.** Its parsers read a fixed allow-list into typed objects; its serializers emit only what
they know. **As of gap 6 (2026-06-27) `<PartGameData>`/`<SubPartGameData>` are passthrough-safe:**
their unmodeled child elements + root attributes are captured (`RawXmlNode`) and re-emitted verbatim
(so `<Collider>` et al. survive). Everywhere ELSE — the geometry `<Part>`, `<SubPart>` templates,
other top-level `<Assets>` children — an unmodeled element is still silently dropped on the next
import → export (it rarely _crashes_ flexo; it just disappears). Every update review must still
check for _added_ schema outside the GameData child/attr surface, not just _changed_ schema. Full
detail: [part-and-subpart-xml.md](part-and-subpart-xml.md#-master-invariant--flexo-rebuilds-a-fresh-dom-now-with-gamedata-passthrough).

> **The passthrough does not cover MODELED elements — and that is the sharp edge.**
> `<Connector>`, `<Combustor>`, `<DeLavalNozzle>`, `<Rocket>`, `<Tank>` and the rest of the
> allow-list are read field-by-field, so schema ADDED to one of them is dropped on the next
> import → export even though the surrounding document round-trips perfectly. **5018 is the
> canonical example**: `<Capabilities>` on a connector, `<FeedsFrom>`/`<Plumbing>` on a
> combustor, and `Id` on a `<Tank>` were all silently lost, turning an imported Core fuel
> tank or a flexo-authored engine into dead hardware in-game with no error anywhere. When
> vetting an update, diff the modeled elements' template classes specifically — the
> passthrough will not save you there (see
> [GAME_UPDATE_CHECKLIST.md](GAME_UPDATE_CHECKLIST.md)).

---

## Integration map (at a glance)

Status reflects the `5261 → 5348` review. 🔴 breaking · 🟡 missing/drift · 📝 docs · ✅ intact.
Rows whose contract did not move at 5348 keep their prior verdict and are marked "re-verified".

**5348 deltas to the table below:** _GameData modules_ → 🟡 **fixed in this review** (rev 5329's
`PartTemplate.WarnOnDuplicateModuleIds` made `<Light Id>` load-bearing — flexo now round-trips it
and always emits one). _Engines_ → 🟡 **fixed in this review** (`<Nozzle AreaRatioMultiplier>`, new
on `RocketNozzleReference`, re-apportions a solid stack's throat via
`SolidMotorNozzle.ThroatSizingArea`; parsed, emitted and re-ported into `solidMotorPhysics.ts`).
_Custom assets / mod export_ → 🟡 (`PbrMaterialReference` gained `<Alpha>` — gap **T1**).
_Part/SubPart XML_ stays 🟡 and widens (`<PrimarySequenceModule>` joins `<Grab>` on the
passthrough-only list — gap **T3**; `PartModelModule` gained `<Terrain>` — gap **T2**). _Kittens_ →
📝 (the MMU asset moved to `SK_KSA_MMU.glb`; the legacy `.gltf` still ships so the aide still loads
— gap **T4**). _Colliders_ stays 🟡 on gap **S1**; _Ground clutter_ stays 🔴 on gap **R1**, now
wider again (`<Substance>`/`<Volume>` mass data, and a collideable object without mass warns).
_Connectors/coordinates/IVA_ stays 📝 on gap **R2**. Every other row re-verified ✅ against 5348.

**Superseded 5261 deltas:** _Engines_ → 🔴 **fixed in this review** (rev 5173 reordered
`SolidMotor.ResizeNozzles`'s area-ratio bounds — the low bound now wins where they cross — and
deleted the `"Stack too large for the nozzle"` rejection; `solidMotorPhysics.ts` re-ported).
_GameData modules_ → 🟡 **fixed in this review** (`LightModule.TemplateData` gained
`[XmlElement("DisableInIva")]`, live on Core's new CoreIVASpaceA face-fill lights; `<Light>` is
MODELED so the passthrough never covered it — now parsed, emitted and persisted). _Colliders_ → 🟡
(rev 5185 added a **fifth** primitive, `<ConvexHull>`, the first backed by a mesh; flexo models four
— gap **S1**). _Part/SubPart XML_ → 🟡 (rev 5203's `<Grab>` anchors ride the GameData passthrough
where Core authors them, but are dropped on a geometry `<Part>` and opaque to the editor — gap
**S2**; separately, Core no longer authors `<ShadowCaster>` anywhere, which moved a test anchor
only). _Ground clutter_ stays 🔴 on gap **R1**, which rev 5185 widens (clutter LODs can now carry
`<ConvexHull>` colliders). Every other row re-verified ✅ against 5261, with all remaining
verbatim-ported classes confirmed byte-identical.

**Superseded 5168 deltas:** _Ground clutter_ → 🔴 (revs 5136–5138/5157 moved clutter onto
the asset bundler: `ClutterObjectReference` → a top-level, id-referenced `ClutterObjectTemplate`
with `Atlas=`/`<Colliders>`/exactly-5-`<LOD>`s, per-LOD `<Mesh>` became a `SerializedReference` id
list, and the ecotype's `<Material>` list became `[XmlIgnore]`/derived — the `cartoon-moon`
scaffold no longer loads; gap **R1**). _Part/SubPart XML_ was 🟡 for the missing
`CoreUtilityAAssets.xml` (rev 5161's ladders, invisible in the browsers) — **now fixed plus a drift
guard**, so ✅. _Connectors/coordinates/IVA_ → 📝 (rev 5133 "Control From Here" makes the attitude
reference the _control_ frame; `Control`/`ControlTemplate` stay byte-identical empty markers and
the choice persists on `VehicleData`, so no flexo schema change — but connector orientation is now
load-bearing for flight control; gap **R2**). Every other row re-verified ✅ against 5168, with all
verbatim-ported physics classes confirmed byte-identical.

| Area                                                                                      | Detail doc                                                         | Primary game anchors                                                                                                                                                                                                                                                                                                         | 5348 status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Part / SubPart XML structure, catalog, editor tags, part size                             | [part-and-subpart-xml.md](part-and-subpart-xml.md)                 | `PartTemplate.cs`, `Part.cs`, `EditorTagDefinition.cs`, `*Assets.xml`/`*GameData.xml`, `CoreEditorTagsGameData.xml`                                                                                                                                                                                                          | 🟡 @5261 — structure unchanged, but `PartTemplate` gained `[XmlElement("Grab")] List<GrabTemplate>` (rev 5203 ladder/handhold anchors: `Id`, `Hidden`, `<Position>`, `<Normal>`). Core authors `<Grab>` only under `<PartGameData>`, where the `RawXmlNode` passthrough preserves it verbatim, so nothing is lost today — but it is opaque to the editor and a `<Grab>` on a geometry `<Part>` is dropped (gap **S2**). Rev 5200's re-import also removed Core's last two `<ShadowCaster>false</ShadowCaster>`s; the schema is untouched (`PartModelModule` byte-identical) and only the real-data test anchor moved. `CoreEditorTagsGameData.xml` unchanged. Prior @5168: `CoreUtilityAAssets.xml` added to `ASSET_FILES` with a live-tree drift guard · **@5348**: `PartTemplate` lost `[XmlElement("Decoupler")]` (a decoupler is now a `Components` module with the SAME `<Decoupler ConnectorId Force/>` wire form — repeatable, and `ApplyGameData` appends instead of overriding) and gained `[XmlElement("PrimarySequenceModule")] SubPartIdReference` (sequencing moved from parts onto modules). Core authors `<PrimarySequenceModule Id="LESMotor"/>` only under `<PartGameData>`, where the passthrough preserves it — dropped on a geometry `<Part>`, opaque to the editor (gap **T3**, the twin of **S2**). `PartModelModule.TemplateData` also gained `[XmlElement("Terrain")] bool` (gap **T2**; only static objects author it) |
| GameData module blocks (mass, electrical, tanks, decoupler, docking port, control, light) | [gamedata-modules.md](gamedata-modules.md)                         | `BatteryTemplate.cs`, `DockingPortTemplate.cs`, `EnergyReference.cs`/`PowerReference.cs`/`ImpulseReference.cs`, `ControlTemplate.cs`                                                                                                                                                                                         | 🟡→✅ **fixed at 5261** — `LightModule.TemplateData` gained `[XmlElement("DisableInIva")] bool DisableInIva = false`, which hides a light from the IVA viewport AND makes it always-on/EC-free (`LightModule.IsActive` short-circuits before consulting `LightSwitch`/`PowerConsumer`). Core authors it on the two new CoreIVASpaceA seat face-fill lights. `<Light>` is a MODELED element so the passthrough never covered it — flexo now parses, emits and persists the flag (`types.ts` `PartLight.disableInIva`). Every unit-reference token→scale table re-verified unchanged (rev 5169 refactored only the `ToNearest` display path). Prior: container `Id`s load-bearing; `<SolidGrainSegment>` + part-level `<Tank>` modeled · **@5348 fixed** — rev 5329's `PartTemplate.WarnOnDuplicateModuleIds` logs an Error for two same-type `Components` sharing an `Id`, and `<Light>` IS a Component, so flexo's id-less lights collided; the authored `<Light Id>` was also dropped on import. flexo now keeps it in `PartLight.ksaId` and always emits an `Id` (falling back to the `_lightN` document id). Core named every shipped light in the same build. `<Decoupler>`'s wire form is unchanged by its move into `Components`                                                                                                                                                                                                          |
| Engines (thrust/Isp physics, reactions)                                                   | [engines.md](engines.md)                                           | `DeLavalNozzleConfig.cs`, `FixedReactionTable.cs`/`MixtureReactionTable.cs`, `ReactionTemplate.cs` family, `RocketControllerData.cs`, `EngineDesigner.cs`, `Reactions.xml`                                                                                                                                                   | 🔴→✅ **fixed at 5261** — rev 5173 reordered `SolidMotor.ResizeNozzles`: `MinAreaRatioBound` is now derived first and floored at 1.2 (and is a flat 1.2 when neither ignition nor valley throat is finite), then `MaxAreaRatioBound = max(exit/peakThroat, Min)` — the **low bound wins** where they cross, the inverse of the pre-5261 order — and the `"Stack too large for the nozzle"` rejection was **deleted**, so such a stack now simply runs at the 1.2 floor. `solidMotorPhysics.ts` re-ported and `'stack-too-large'` removed from `ThrustCurveFailure`. `Reactions.xml` also re-formulated the double-base propellant (values only). All other ported physics byte-identical · **@5348 fixed** — rev 5329 promoted `RocketTemplate.Nozzles` to `List<RocketNozzleReference>`, adding `[XmlAttribute] double AreaRatioMultiplier = 1`; `SolidMotorNozzle.ThroatSizingArea` = `ExitArea / multiplier` and `ResizeNozzles` / `ComputeTotalThroatArea` now apportion the stack's throat by it. Core authors `1.0025` on a LES nozzle. Modeled as `RocketNozzleRef` and re-ported. `RocketControllerData.ComputeFromRocketTemplates` was deleted (rev 5340) — a citation move only, the surviving instance path is byte-identical. `DeLavalNozzle.ComputeThroatArea` adds a `areaRatio > 0` guard                                                                                                                                        |
| **Nozzle exhaust placement** (multi-nozzle lists, FX override, frames, thrust magnitude)  | [engines.md](engines.md)                                           | `RocketNozzleTemplate.cs` (`OnDataLoad` FX fallback), `RocketNozzle.cs` (`ResetState` frames), `PartTemplate.cs:45-47,245` (`RocketNozzles` list, both scopes), `Part.cs:217,644-660` (`MatrixAsmb2VehicleAsmb` vs `Asmb2VehicleAsmb`), `VehicleUpdateState.cs:294`, `Vehicle.cs:4828,5030+` (roll-free plume, debug arrows) | 🔴→✅ **`<ReactionPlume>` at 5056** — `RocketNozzleTemplate` moved `<VolumetricExhaust>`/`<PlumeTrail>` into a repeatable `<ReactionPlume Reaction Default>`; flexo now models `reactionPlumes[]` (was two scalars)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Animation (keyframe import/export)                                                        | [animation.md](animation.md)                                       | `KeyframeAnimationData.cs`, `KeyframeAnimationModule.cs`, `Animations/*.glb`                                                                                                                                                                                                                                                 | ✅ intact @5056 — KSA's loader fix (rev 5034) moved the GAME to the semantics flexo already had; new live constraint: the scene ROOT node's TRS now applies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Kittens (Character rendering, editor-only)                                                | [kittens.md](kittens.md)                                           | `CharacterAssets.xml`, `KittenRenderable.cs`, `CharacterRenderResources.cs`, `ModelTranslucent.frag`                                                                                                                                                                                                                         | ✅ re-verified @5261 — `CharacterAssets.xml` gained five kitten **locomotion** clips (`AnimLadder`/`AnimJump`/`AnimTumble`/`AnimJumpLand`, and `AnimWalk` re-pointed from the Run clip to a new Walk clip); flexo consumes none of them, and the material names, socket bones and the `DefaultORM` redirect are unchanged. `ModelTranslucent.frag`/`Fur.frag` changed for the portrait-camera lights only · **📝 @5348** — `CharacterAssets.xml` re-pointed `KittenMMUGlb` to a new `Characters/KittenMMU/SK_KSA_MMU.glb` and renamed the walk/run clips; the legacy `KSA_Cat_MMU.gltf` still ships, so the aide still loads, but it now shows the RETIRED MMU (gap **T4**). Body/helmet/visor paths, material names, socket bones and the `DefaultORM` redirect are unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Custom assets, textures, GLB **import + export**, **multi-part** mod export               | [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md) | `ThumbnailRenderResources.cs`, `Mod.cs`/`ModLibrary.cs`/`AssetBundle.cs`, `PbrMaterialReference.cs`, `MeshAtlasFileReference.cs`, `mod.toml`, `RenderCore.Gltf/GltfUtils.cs`, `MeshReference.cs`, `PartModelModule.cs`, `PartModelRenderer.cs`, `Part.cs` (`RayCastEgoSubPart`)                                              | ✅ intact (`AssetBundle.cs` gained one line, `<GrainGeometry>`; thumbnail rule holds). **flexo-side: one mod now ships N parts** — N `<Part>`/`<PartGameData>`/`<MeshAtlas>` siblings in the same three files (legal by `AssetBundle`'s flat `List<SerializedId>`), export-variant ids namespaced `flexo_<base>_<ns>_<templateId>`, `<FixedReaction>`s deduped first-wins; the two-atlas load is ⏳ pending in-game verification (contract #20) · **🟡 @5348** — `PbrMaterialReference` gained `[XmlElement("Alpha")] TextureReference AlphaMap` (gap **T1**): flexo cannot author an alpha-cutout material, and would drop the slot off a copied Core material. Nothing is lost on a part path today — Core uses it only on the launch pad and `PartModel.PerDrawData` still binds exactly five textures. `ThumbnailRenderResources` / `GltfUtils` / `Mod` / `ModLibrary` / `AssetBundle` re-verified: the null-deref rule and the multi-part bundle contract both stand                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Connectors, coordinates, IVA (seats + the `<Internal>` render gate)                       | [connectors-coordinates-iva.md](connectors-coordinates-iva.md)     | `Part.Connector`, `QuaternionEx.cs`/`Double3Ex.cs`, `VehicleEditor.cs`, `PartModelModule.cs`, `PartModel.cs`, `IVASeat.cs`, `IVAController.cs`, `Camera.cs` (`LookAtRotation`), `DockingPortTemplate.cs`                                                                                                                     | 📝 @5168 — schema intact (`QuaternionEx`, `IVASeat`/`IVAController`/`EVADoorTemplate`/`DockingPortTemplate` byte-identical, so `EULER_ORDER` and the `ivaLook.ts` port stand), but rev 5133 **moved the vehicle attitude reference to the _control_ frame** (`FlightComputer` now uses `Vehicle.Ctrl2Body`, defaulting to identity = root). `Control`/`ControlTemplate` remain byte-identical empty markers and the choice persists on `VehicleData`, so flexo authors nothing new — the consequence is that **connector orientation is now load-bearing for flight control**, not just snapping (gap **R2**, docs-only). Prior: `<Capabilities>` modeled (incl. `DecouplerJoint`); `[Flags]` separator fixed; `<IVASeat>` MODELED and `<Internal>` is user data · **@5261**: `QuaternionEx.CreateFromXyzRadians` still byte-identical (the class only lost `Slerp` and gained `GetTwistAboutAxis`), `IVASeatTemplate`/`IVAController`/`EVADoorTemplate`/`DockingPortTemplate` unchanged, and `Control`/`ControlTemplate` are still empty markers. Revs 5238/5239 re-imported four Core part files to **fix flipped connectors** (`<Rotation X= Z=>` → `<Rotation Z=>`) and rev 5225 added a suspicious-orientation warning to the game's own GLB→XML importer — both reinforce gap **R2**: connector orientation is load-bearing                                                                                                               |
| **Colliders** (part collision volumes)                                                    | [colliders.md](colliders.md)                                       | `ColliderModule.cs` + `Box\|Sphere\|Cylinder\|CapsuleColliderTemplate.cs`, `ColliderTemplate.cs`, `DistanceReference.cs`, `Vehicle.cs` (collider compound + zero-collider fallback), `ConstraintSim.cs` (docking by contact), `PartTemplate.ApplyGameData`                                                                   | 🟡 @5261 — `ColliderModule.Template` gained a **fifth** primitive, `[XmlElement("ConvexHull", typeof(ConvexHullColliderTemplate))]` (rev 5185), the first collider backed by a **mesh** (`MeshColliderTemplate`: `<Mesh>` id reference + optional `<Scale>`; the hull is built with `ConvexHullHelper.CreateShape` and throws if the mesh has no volume). `ColliderTemplate` also gained a virtual `ShapeOffsetCollider` that offsets placement by the hull centroid — `double3.Zero` for all four analytic primitives, so flexo's placement math is unmoved. Only ground clutter authors `<ConvexHull>` today, but it is schema-legal on a part and flexo would drop it (gap **S1**). Prior: the four analytic primitives modeled, closing the 4939 geometry-template gap **E** · **@5348** re-verified: `ColliderModule` gained only the runtime `IRescale` path and `ColliderTemplate.ComputeAuthoredLocationPartAsmb()` is the same `LocationAsmb + ShapeOffsetCollider.Transform(q)` formula, so flexo's placement math is unmoved and the primitive list is still four analytic shapes + `<ConvexHull>`                                                                                                                                                                                                                                                                                                                                   |
| Ground clutter (data-only celestial mod)                                                  | [ground-clutter.md](ground-clutter.md)                             | `GroundClutterReference.cs` + 6 sibling schema classes                                                                                                                                                                                                                                                                       | 🔴 @5261 — gap **R1** still OPEN and now slightly wider: rev 5185 added asset-bundler convex-hull support and gave the clutter rocks `<ConvexHull>` colliders, and rev 5205 gave every tree but the shrubs colliders. Prior @5168: clutter moved onto the asset bundler (revs 5136–5138, 5157) — `ClutterObjectTemplate` is a top-level id-referenced asset (`Atlas=`, `<Colliders>`, exactly 5 `<LOD>`s), `<LOD><Mesh>` is a `SerializedReference` id list, and the ecotype `<Material>` list is `[XmlIgnore]`/derived. `build-cartoon-moon.ts` emits the old form and **no longer loads**. Scaffold-only — no editor code involved · **@5348** wider again: rev 5304 added a `<ClutterObjectGameData>` top-level asset and a `GroundClutter/_Materials.xml` substance library, `ClutterObjectTemplate` gained a repeatable `[XmlElement("Substance")] ClutterSubstanceReference` (`Id` + `<Volume>`) that gives an object mass, and rev 5307 warns when a collideable clutter object has none                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Plumbing topology** (connector capabilities, consumer feed points, containers)          | [plumbing-and-feeds.md](plumbing-and-feeds.md)                     | `ConnectorCapability*.cs`, `FeedsFromReference.cs`, `ConsumerFeedWiring.cs`, `RocketCoreTemplate.cs`, `PartTemplate.ResolveConsumerFeedPoints`                                                                                                                                                                               | 🔴→✅ modeled (NEW surface at 5018)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Light falloff/aim math** (editor coverage visualization — ported formulas + pose rules) | [gamedata-modules.md](gamedata-modules.md)                         | `Content/Core/Shaders/Lighting/LightPrePass.comp` + `LightData.glsl`, `KSA.Rendering.Lighting/Light.cs`, `LightModule.cs`                                                                                                                                                                                                    | ✅ ported @5018 (NEW surface — `src/ksa/lightFalloff.ts` + `src/three/coords.ts` `lightWorld`/`lightLocalFromWorld`/`lightWorldAim`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

> **The glTF contract is bidirectional and lives in one place.** flexo now both WRITES GLB
> (mesh atlases) and READS it (the Blender model importer,
> [docs/importing-models.md](../docs/importing-models.md)) — and the import path is shaped
> entirely by what the EXPORT path must be able to emit: KSA's accepted attribute set, the
> mandatory index buffer, the float32/tight accessor rule, node transforms being ignored,
> one material per `<PartModel>`, unconditional back-face culling, and the `<MeshView>` CPU
> budget. All of it is contracts **#10–#11 and #13–#17** in
> [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md), verified @5018 — there
> is no separate "import" scope doc to check.

> **The emissive contract is a hard engine limit, not a flexo gap.** `<Emissive>` is a
> single-channel mask added as `white × mask × 1.25` AFTER lighting, with no colour, tint or
> LUT field anywhere in `PbrMaterialReference` — so a glow is achromatic in shadow and colour
> can only come from a `<Light>`'s `<Color>` (or the hard-coded battery status light). The
> greyscale-map-keyed-to-a-1px-gradient technique the engine does implement is the
> **temperature** channel, on the `<PartModelDynamic>` shader variant that has emissive
> compiled out. Contracts **#12 and #18** in
> [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md); full source-cited
> derivation in [analysis/KSA_EMISSIVE_AND_LUT.md](../analysis/KSA_EMISSIVE_AND_LUT.md).
> **Re-check on a game update:** an `<EmissiveLut>`/tint slot appearing on
> `PbrMaterialReference`, or `ENABLE_EMISSIVE` reaching `BuildPipelineDynamic`, would let
> flexo ship the ramp instead of baking it.

### Open gaps from 5261 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

The `5168 → 5261` review found **one BREAKING item**, fixed in the review itself, plus one
round-trip data loss (also fixed) and two that remain 📋 OPEN:

- **S0 — the solid-motor area-ratio bounds were re-ordered (🔴 BREAKING) — ✅ FIXED.**
  Rev 5173 ("Clarified which of the area ratio clamps win in the case where they cross each
  other") rewrote `SolidMotor.ResizeNozzles`. Before: `MaxAreaRatioBound = totalExitArea /
peakThroat` was computed first, a value below `1.2` returned `"Stack too large for the nozzle"`,
  and `MinAreaRatioBound` was then `Clamp(…, 1.2, MaxAreaRatioBound)`. After: `MinAreaRatioBound =
Max(totalExitArea / smallestThroat, 1.2)` — or a flat `1.2` when neither the ignition nor the
  valley throat is finite — is derived **first**, then `MaxAreaRatioBound = Max(totalExitArea /
peakThroat, MinAreaRatioBound)`. The **low bound wins** where they cross, and the rejection is
  **gone**: an oversized stack now runs at the 1.2 floor instead of being refused. flexo's verbatim
  port in `src/ksa/solidMotorPhysics.ts` had the old ordering, so it returned a null thrust curve
  for motors the game happily sizes. Re-ported; `'stack-too-large'` removed from
  `ThrustCurveFailure` (no back-compat, per the no-migration rule) and covered by a new
  `solidMotorPhysics.test.ts` case that lands exactly on the 1.2 floor.
- **S1 — `<ConvexHull>`, a fifth collider primitive (🟡 MISSING-CAPABILITY) — 📋 OPEN.**
  Rev 5185 added `ConvexHullColliderTemplate` (extending the new `MeshColliderTemplate`) and wired
  it into `ColliderModule.Template` as
  `[XmlElement("ConvexHull", typeof(ConvexHullColliderTemplate))]`. It is the first collider backed
  by a **mesh** rather than an analytic shape: `<Mesh>` is a `MeshReference` id and `<Scale>` an
  optional `Vector3Reference`; the hull is built via `ConvexHullHelper.CreateShape` and **throws**
  at load if the mesh has no volume. Only the ground-clutter rocks author it today, but it is
  schema-legal on a part, and flexo's `ColliderShape` union
  (`src/ksa/types.ts:127`) has exactly four members — so a part authoring one round-trips lossy.
  Note `MeshColliderTemplate` itself is **not** authorable: `CreateShapeInto` throws
  `"cannot be registered with Bepu yet"` and `ColliderModule` declares no `<Mesh>` element.
- **S2 — `<Grab>` anchors are opaque to the editor (🟡 MISSING-CAPABILITY) — 📋 OPEN.**
  Rev 5203 ("Kittens can now grab onto ladders and capsules") added `GrabTemplate`
  (`[XmlAttribute] Id` / `Hidden`, `[XmlElement] <Position>` / `<Normal>`) and declared
  `[XmlElement("Grab")] List<GrabTemplate> Grabs` on **both** `PartTemplate` and the GameData
  template, merged by `PartTemplate.ApplyGameData` (`Grabs.AddRange(gameData.Grabs)`). Core authors
  them only under `<PartGameData>` — `CoreCommandAGameData.xml` (5 capsule spine handholds) and
  `CoreUtilityAGameData.xml` (the ladder's rungs plus two `Hidden` end anchors) — where flexo's
  `RawXmlNode` passthrough preserves them verbatim, so **nothing is lost today**. Open because they
  are invisible in the editor (only `PassthroughViewer` shows them) and a `<Grab>` authored on a
  geometry `<Part>` **is** dropped.
- **S3 — Core stopped authoring `<ShadowCaster>` (COSMETIC) — ✅ FIXED.**
  Rev 5200's re-import of the command parts dropped both of Core's
  `<ShadowCaster>false</ShadowCaster>`s, so no Core template authors the element. The schema is
  unchanged — `PartModelModule` is byte-identical and still declares
  `[XmlElement("ShadowCaster")] bool ShadowCaster = true` — so flexo's handling is untouched; only
  `catalog.test.ts`'s real-data anchor moved, and it now asserts the absence (flipping back if a
  future re-import re-authors one). The inline-XML suite remains the capture coverage.

### Open gaps from 5168 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

The `5117 → 5168` review found **no BREAKING item on any part-editor path**. Three gaps, of which
**R3 is FIXED** in the review itself and R1/R2 remain 📋 OPEN:

- **R1 — the ground-clutter scaffold no longer loads (🔴 BREAKING, scaffold-only) — 📋 OPEN.**
  Revs 5136–5138 and 5157 moved clutter onto the asset bundler: `ClutterObjectReference` became a
  top-level, id-referenced `ClutterObjectTemplate` (`[XmlAttribute("Atlas")]`, `[XmlArray("LODs")]`,
  a new `[XmlArray("Colliders")]`, and `IsValid()` now requiring **exactly 5** LODs);
  `GroundClutterLodReference.MeshFileReference` became `MeshIds`, a `List<SerializedReference>`;
  and `ClutterEcotypeReference.MaterialReferences` moved from `[XmlElement("Material")]` to
  `[XmlIgnore]`, derived by the new `PopulateMaterialReferences()`. `AssetBundle` gained
  `<ClutterObject>` and `<GroundClutterMaterial>` element types. `scripts/build-cartoon-moon.ts`
  emits the 5117-era inline form and must be **switched wholesale** to the new one (no-migration
  rule) — see [ground-clutter.md](ground-clutter.md#what-changed-in-5168). No editor code involved.
- **R2 — the reference-orientation contract moved (📝 SCHEMA-DRIFT, docs-only) — 📋 OPEN.**
  Rev 5133's "Control From Here": `FlightComputer.ComputeControl` now drives attitude off
  `Vehicle.Ctrl2Body` (`ControlConnector?.Asmb2VehicleAsmb ?? ControlPart?.Asmb2VehicleAsmb ??
Identity`) rather than the body frame. `Control`/`ControlTemplate` are **byte-identical empty
  markers** and the selection persists on `VehicleData` (`<ControlPartId>`/`<ControlConnectorId>`),
  so **no flexo code or schema change is required** — but `docs/coordinates.md` and
  `docs/ksa-part-connector-notes.md` state "up follows the root part" unconditionally, which is now
  only the default, and a docking-port connector's orientation can become the navball frame.
- **R3 — new Core part file missing from the catalog (🟡 MISSING-CAPABILITY) — ✅ FIXED.**
  Rev 5161 imported `CoreUtilityAAssets.xml` / `CoreUtilityAGameData.xml`
  (`CoreUtilityA_Prefab_LadderA` + 11 `<SubPart>` templates) and added them to Core's `mod.toml`,
  but flexo's hand-maintained `ASSET_FILES` (`src/ksa/catalog.ts`) did not list the file, so the
  parts were silently absent from the Part/SubPart browsers with no test failing. The file is now
  listed, and `src/ksa/catalog.test.ts` gained a guard that enumerates `Core*Assets.xml` in the live
  private tree and fails on any `ASSET_FILES` omits.

### Open gaps from 5117

The `5056 → 5117` review found **no BREAKING item**. Four gaps from the review — **Q1, Q2 and Q4
are now FIXED**, Q3 remains 📋 OPEN — plus **Q5**, a flexo-side invention found while closing Q1
and fixed at the end of the v2 refactor:

- **Q1 — `<EVADoor SeatId>` was dropped (🟡 MISSING-CAPABILITY) — ✅ FIXED.** Rev 5085 added
  `[XmlAttribute("SeatId")]` to `EVADoorTemplate`; Core authors it
  (`Content/Core/PartGameData.xml` →
  `<EVADoor SeatId="CoreIVASpaceA_Prefab_MediumCapsuleA_SeatA" />`). Because the attribute sits
  on a **modeled** child it never rode the GameData passthrough, so importing then exporting a
  crew-door part silently unlinked the hatch from its seat. flexo's `EvaDoor` now carries
  `seatId: string | null`, parsed and emitted (omitted when unset).
- **Q2 — `<IVASeat Id>` was never emitted, but is the link target (🟡 MISSING-CAPABILITY) —
  ✅ FIXED.** Paired with Q1: `EVADoor.ResolveAlignedSeats` matches `IVASeat.TemplateId`
  (= `ModuleBase.TemplateDataBase.Id`) against `EVADoor.SeatId`, and Core now authors
  `<IVASeat Id="…_SeatA">`. `IvaSeat` gained a **user-authored** `ksaId` distinct from the
  regenerated `_seatN` editor id, emitted only when set — the serializer's old rationale
  ("nothing references a seat by id") was retired, while its still-true half survives: the id
  shares the namespace `<FeedsFrom Container=>` resolves against, so flexo never auto-fills it
  with an internal id.
- **Q4 — rev-5091 engine-wiring warnings were unmirrored (🟡 MISSING-CAPABILITY) — ✅ FIXED.**
  KSA added five `Warning`-level "wired up wrong" checks whose common symptom is an engine that
  loads and then makes no thrust. `validateEngines` now emits all five at `warn` severity —
  `controller-no-rockets`, `rocket-no-nozzles`, `nozzle-not-referenced`, `core-not-referenced`,
  `wiring-feed-unresolvable` — each with `EngineIssue.source` so the findings surfaces jump to
  the offending module. Game-side sites and the two deliberate narrowings are tabulated in
  [engines.md](engines.md#what-changed-in-5117).
- **Q5 — flexo emitted a `<EVADoor ConnectorId>` that is not in KSA's schema (🟡 FLEXO-SIDE
  INVENTION) — ✅ FIXED (flexo v2 P12.16).** Found while closing Q1 and deliberately deferred by
  Phase 6 (removing it changes exported bytes). Re-verified from the decompiled class at
  **5117 and 5168**: `EVADoorTemplate` declares exactly one `[XmlAttribute]`, `SeatId`, and the
  runtime `EVADoor` module (`EVADoor.CreateComponents`) copies only that — an EVA hatch is not
  connector-bound, unlike `DecouplerTemplate`/`DockingPortTemplate` which really do carry
  `ConnectorId`. Core authors `<EVADoor SeatId="…" />`
  (`Content/Core/PartGameData.xml:670,674`). `XmlSerializer` discarded the unknown attribute so
  it was inert in-game, but flexo was writing a nonexistent field into exported mod files and
  showing a meaningless connector picker for the hatch. `EvaDoor` is now `{ seatId }` only;
  parser, serializer, project codec, project merge and the Coupling section all follow.
  **This changes exported bytes** for any part with an EVA door (one attribute fewer) — the only
  export-byte change in the entire v2 refactor.
- **Q3 — clutter `<Collideable>` → `<CollisionType>` (📝 SCHEMA-DRIFT, docs-only).** Rev 5099
  replaced `ClutterEcotypeReference`'s `[XmlElement("Collideable")] BoolReference` with
  `[XmlElement("CollisionType")] ClutterCollisionTypeReference` (`Value="None|PrimitiveList|Mesh"`,
  new `ClutterCollisionTypeReference.cs`). `ksa-mods/cartoon-moon/` emits neither element and
  both defaults mean "no collision", so nothing is broken — but `scope/ground-clutter.md`
  documents the old name and must be corrected. Rev 5098 also made ecotype scale **16 discrete
  steps** between `MinScale`/`MaxScale` (runtime only, no schema) and rev 5099 made
  non-uniform scale an `IsValid` **error** for collideable ecotypes.

### Open gaps from 5056 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

The `5018 → 5056` review found **one BREAKING** item, now **✅ FIXED**: the
`<ReactionPlume>` re-homing of nozzle exhaust FX (rev 5022). Still **📋 OPEN** from 5056:

- **P1 — reaction-keyed plume authoring (MISSING-CAPABILITY) — ✅ FIXED (flexo v2 P7, decision
  D15).** flexo always round-tripped keyed `<ReactionPlume Reaction="…">` entries faithfully,
  but the editor's two selects only drove the unkeyed `Default="true"` entry, so a keyed entry
  could not be created or edited. Engine mode's Nozzle editor now carries a **"Plume entries"**
  disclosure over the FULL list (add / remove / re-key / per-entry exhaust + trail selects,
  `src/ui/engine/NozzleEditor.tsx`), each mutation one discrete undo step through
  `updateReactionPlumes` (`src/state/editorStore.ts`). The two headline selects remain the fast
  path onto the default entry. Core's SRB nozzle (`CorePropulsionCGameData.xml`) is still the
  only shipped user. See [engines.md](engines.md#what-changed-in-5056--reactionplume-breaking-and-nothing-else).
- **P2 — `KSA.GlbImport` is an unmapped integration surface (📝 docs).** Rev 5025 brought the
  game's own `GlbToXmlUtility` in-tree. It is the authoritative reference for what flexo's
  `assetsXmlSerializer.ts` / `exportGlb.ts` emit and deserves either a scope row of its own or
  a cross-reference from [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md).
- **P3 — clutter `SlopeMask*` + `<AltitudeDensityCurve>` (🟡 drift).** Rev 5041 added four
  `GroundClutterPlacementReference` fields; the `ksa-mods/cartoon-moon/` scaffold does not
  emit them. Defaults are inert (`SlopeMaskStrength` 0), so this is additive, not breaking.

Carried forward and still **📋 OPEN**: `FuelPort` authoring (**G**), the cartoon-moon clutter
LOD retune (**H**) and the optional clutter `<LOD CastShadows>` (**F14**). The solid-motor
thrust-curve preview is **✅ DONE** — `src/ksa/solidMotorPhysics.ts` ports
`SolidMotor.TrySampleThrustCurve` + `ResizeNozzles` + `GrainGeometryTable`; see
[engines.md](engines.md#solid-thrust-curve-preview--srcksasolidmotorphysicsts-ported-was-a-documented-gap).

### Open gaps from 5018 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

The 5018 review's gap register (F1–F14) is in
[plans/UPGRADE_PLAN_2026-07-24.md](../plans/UPGRADE_PLAN_2026-07-24.md) §2. All BREAKING,
DATA-LOSS, MISSING-CAPABILITY and SCHEMA-DRIFT rows are **✅ FIXED**; part-level `<Tank>`
(carried-forward gap **F** from 4939) is closed too, and the geometry-template `<Collider>`
gap (**E**) is now closed by MODELING `<Collider>` outright ([colliders.md](colliders.md)).
Still **📋 OPEN**: `FuelPort`
authoring (**G**), the cartoon-moon clutter LOD retune (**H**) and the optional clutter
`<LOD CastShadows>` (**F14**). The solid-motor thrust-curve preview is **✅ DONE**: the port of
`SolidMotor.TrySampleThrustCurve` + `ResizeNozzles` + `GrainGeometryTable` lives in
`src/ksa/solidMotorPhysics.ts` ([engines.md](engines.md)).
**In-game verification of the 5018 output is PENDING** (see the upgrade plan's Phase 8).

### Open gaps from 4892 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

All four 4892 gaps are **✅ FIXED** (per the no-migration rule; detail + game-side evidence in the
plan and the per-area docs): **(A)** the Reactions refactor — `Combustion.xml`/`<CombustionProcess>`
→ `Reactions.xml`/`<Reaction Id>`+`<MixtureRatio>`, flexo re-modeled end-to-end
([engines.md](engines.md#what-changed-in-4892--the-reactions-refactor-rev-48844885));
**(B)** tank `<CombustionProcess>` → `<RoleAffinity>`
([gamedata-modules.md](gamedata-modules.md#what-changed-in-4892)); **(C)** ground-clutter LOD
`<Material Id>` references now REQUIRED — cartoon-moon regenerated
([ground-clutter.md](ground-clutter.md#what-changed-in-4892), in-game re-check pending);
**(D)** `EngineALargeUpperStage` removed from `VOLUMETRIC_EXHAUST_IDS` (LR91 Dev deleted).
Old persisted projects/exports are intentionally discarded (boot purge + strict export-version
check), never converted.

### Gaps history: 4826 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

All three round-trip-fidelity gaps in flexo's **Part-editor** surface are **fixed** (faithful
preservation, per the no-migration rule), each confirmed against the 4826 decomp. They stem from one
game feature cluster: the new **part-symmetry** system (multi-mount adapter prefabs) + hypergolic
service-module tanks. A fourth item lands only on the separate **ground-clutter scaffold** (below).

1. ✅ **`<Diameter>` repeatable** _(DONE)_ — KSA 2026.7 made `<Diameter>` repeatable so adapter prefabs list every size they bridge (e.g. `<Diameter M="3"/><Diameter M="2"/>`). flexo modeled a single value and dropped the rest; now `PartGameData.diameterM` (editable primary) + `extraDiametersM[]` (preserved) round-trip all of them.
2. ✅ **Tank `<CombustionProcess>`** _(DONE)_ — new `<CombustionProcess Id/>` child of `<SphericalTank>` declares the propellant a hypergolic tank holds. flexo rebuilds tanks from a typed model, so it dropped the child; now `Tank.combustionProcessId` parses/emits it.
3. ✅ **Connector `<Sibling>` + GameData `<Aligned>`** _(DONE)_ — new attach-node symmetry grouping. Decomp: `Connector.TemplateBase.SymmetrySiblings` (`[XmlElement("Sibling")] List<ConnectorReference>` → `<Sibling Id/>`) + `PartTemplate.Aligned` (`AlignedConnectorsRef` → `<Aligned><ConnectorRef Id/></Aligned>`). `<Aligned>` (GameData) survives via the `RawXmlNode` passthrough, with its `<ConnectorRef>` ids now remapped through the regenerated connector ids on import/paste (`remapRawConnectorRefs` — verbatim re-emit left them stale after renumbering); `<Sibling>` (geometry `<Connector>` child) was dropped — now `Connector.siblingIds[]` preserves it (same remap).

4. 🟡 **Ground-clutter LOD mesh → atlas** _(WATCH — scaffold only, no flexo source)_ — `GroundClutterLodReference.MeshFileReference` changed type `MeshFileReference` → `MeshAtlasFileReference` and its single `Mesh` became a `Meshes` list (loads ALL meshes in the referenced GLB, skipping `_`-prefixed nodes). The `<Mesh Id=… Path=…/>` element + attrs are **unchanged** (both inherit `FileReference`), so `ksa-mods/cartoon-moon/` still _parses_, but its per-LOD single-card semantics shifted (mesh id now comes from the GLB node name, not `<Mesh Id>`). No flexo core-editor code involved; **re-verify the cartoon-moon mod in-game** before relying on it. Detail: [ground-clutter.md](ground-clutter.md#what-changed-in-4826).

**Not gaps (decomp-verified intact):** engines — `RocketControllerData.cs` changed only `GetAllRocketTemplates` (List→`Span`/`ArrayPool` perf); the thrust/Isp math + `DeLavalNozzleConfig`/`CombustorConfig`/`CombustionTable`/`Combustion.xml` are byte-identical. `PowerReference.cs` only added a `ToNearest` display formatter (tokens/scales unchanged). `Decoupler.cs` changed runtime deactivation (not schema). `KeyframeAnimationModule.cs` only added symmetry-mirroring (`ApplyToMirroredParts`), no schema change. `PbrMaterialReference.cs` unchanged (null-deref gotcha holds). `MeshReference`/`MeshAtlasFileReference` gained multi-primitive **runtime** fields (no `[XmlElement]`) — watch the custom-asset GLB node→SubPart mapping, but flexo's single-primitive exports are unaffected. Fuel-tank `<PartModel>`→`<PartModelDynamic>` + `TFI_Heat` + `<ThinFilm>` (thermal-FX; `catalog.ts:156` already reads either tag). Solar-cell `<Produced W>` 50→100 (data). `CoreIVASpaceAGameData.xml` diff (line-ending only). Runtime `PartSymmetryInstance`/`SymmetryLayerInstance` — vehicle-assembly/save state, out of flexo scope.

---

## Cross-cutting environmental notes

- **OSS / asset availability.** Licensed binaries (kitten characters, `Animations/*.glb`, some
  textures) plus `Reactions.xml` are not in every checkout — flexo serves them from
  its private asset mirror (`flexo-private-assets`, served at `/ksa/` by `vite/ksaAssets.ts`).
  After a game update, re-run `scripts/copy-ksa-assets-to-private-repo.ts` so the editor reads
  the new catalog. Some contracts (e.g. an animation clip's GLB node structure) can only be
  verified against that mirror, not the decomp snapshots.
- **Decompiler noise.** Across this build, many "diffs" are pure decompiler artifacts —
  `"x".AsSpan()`→`"x"`, `Log.Warning($"…")`→`LogString<Warning>` interpolation handlers,
  `Brutal.ShaderCompilerApi`→`Brutal.ShaderCApi`. Always read the actual hunk before treating a
  changed `.cs` as a real change.
