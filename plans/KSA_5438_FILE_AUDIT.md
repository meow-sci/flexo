# KSA 5402 → 5438: complete filtered file audit

Every path in the review inventory is assigned below to a reviewed contract surface or an
explicitly excluded runtime surface. This is a routing ledger; the linked scope documents
contain the detailed contract verdicts and the main upgrade report owns validation results.

## Inputs and counting

- Previous snapshot: `ksa-game-assemblies_prev/current`, build **2026.9.7.5402**.
- Current snapshot: `ksa-game-assemblies/current`, build **2026.9.10.5438**.
- Source inventory: `/tmp/ksa-5438-inventory.json`, generated from the snapshot comparison.
- Decompiled source paths below are relative to `decomp/`; asset paths are relative to `Content/`.
- The provided namespace-filtered `.cs` inventory has **198 changed, 54 added, 5 removed = 257** paths.
- Content has **25 changed, 4 added, 0 removed = 29** paths.
- These are **raw file counts, not semantic-change counts**. A rename is represented by an added
  and a removed path. Excluded namespaces, project metadata outside the filtered `.cs` set,
  and private binaries are not implicitly included in these totals. Private assets and unchanged
  high-value anchors have separate checks in the scope review.
- Completeness was checked programmatically: each of the **286 inventory paths** appears in
  exactly one primary group below, with its original status; no path is unassigned or duplicated.

## Added and removed schema sweep

The review examined changed XML serialization declarations and the template/reference hunks,
including additions on existing modeled containers. Unknown GameData children are safe only
inside PartGameData/SubPartGameData; that guarantee does not extend to arbitrary Assets children.

| Game declaration | Exact boundary and outcome |
| --- | --- |
| `Parachute.TemplateData.Materials` | Repeatable `<Parachute><PbrMaterialRef Id>`; ordered choices, first is default. Whole Parachute nodes survive GameData passthrough. `Parachute.SaveData.CanopyMaterial` is vehicle save state. |
| `PbrMaterialReference.DisplayName` | Optional `<PbrMaterial DisplayName>` label. Core canopy material references resolve the original definitions; flexo does not import these declarations as editable custom metadata. Material ids/texture slots are unchanged. |
| `AssetBundle.Assets` | New top-level `<ExplosionVolume>` and `<Explosion>` asset kinds. Explicitly outside Part-only import/export; not raw-GameData passthrough. Existing Part/SubPart/MeshAtlas registries and multi-part bundles remain valid. |
| `ExplosionVolumeTemplate`, `ExplosionReference`, `ExplosionFlashSpec`, `ExplosionEmitterRef`, `ExplosionVolumeRef` | New destruction-effect data: lifetime/noise/envelopes/color, Flash, SoundEvent, EmitterRef and VolumeRef, pressure/intensity/delay/fallback controls. These are standalone effect catalogs, not geometry or PartGameData fields. |
| `ParticleEmitterReference`, `ParticleColorStops`, `ParticleEnvelopeStops` | Particle Drag/Density and optional ScaleEnvelope/AlphaEnvelope/ColorStops, plus Spokes/LifetimeEnvelope enum additions; former GravityStrength handling removed. Standalone particle definitions remain outside flexo authoring. |
| `FxDeformation.SaveData` / `DentData` | `<FxDeformationData><Dent>` with position, direction, radius and depth attributes records runtime collision damage. ModuleList creates deformation modules automatically; no new Part template declaration appeared. |
| `VehicleData.IsDebris` | `<Vehicle … IsDebris>` save-state attribute, not a Part mod attribute. |
| `GalacticPlane.NorthCelestialPoleLongitude` | Optional `<System><GalacticPlane><NorthCelestialPoleLongitude Degrees|Radians>`; the game defaults to 122.93192° when absent and computes the rotation itself. ICRP `buildSystemXml` deep-clones the entire stock System using `doc.importNode(corpus.stockSystem, true)` (`apps/icrp/src/ksa/systemXml.ts:246`), preserving the child if authored. Stock SolSystem.xml is unchanged. No ICRP field, math port or schema bump is required. |
| `VolumetricExhaustTemplate`, `MachDiamonds`, removed `PressureModifiers` / `ThrottleModifiers` | Exhaust appearance schema reorganized; removed modifier blocks and incident-shock/color fields are effect-definition concerns. Flexo stores referenced exhaust ids, whose current stock choices are reviewed in the engine surface. |
| `MeshReference.BoundsCenter` / `BoundsRadius` | New `[XmlIgnore]` runtime mesh bounds, not serialized asset fields. |
| `ColliderTemplate.VolumeCubicMetres` and four analytic overrides | Computed getter, not a new input field; volumes now feed derived crash pressure. No authoring schema extension. |

`PartTemplate` and `SubPartTemplate` are byte-identical, so there is no added geometry/model
field silently dropped by their existing allow-lists. `ColorRgbReference.ToXmlAttributes`
is a new export helper, not a change to color field names. `Constants.cs` has exactly one delta:
`DESTRUCTION_KINETIC_DENSITY_FLOOR_KGM3 = 0.02`, used by destruction effects; the physical constants
used by flexo engine calculations did not change there.

## Noise is retained in the inventory

For example, `Core/Transform.LookAt` changes the local name `vector` to `a` without changing
its cross products or matrix; `QuaternionEx.LookToRotation`, `Camera.LookAtRotation`,
`IVAController.OnFrame`, `MathEx` and `Ray` contain similar local-name changes. `CustomMassTemplate`
and `InertiaTemplate` shift source-line numbers in logs. `DeviceMeshInterleaved` changes the
Vulkan enum spelling `Uint32`/`Uint16` to `UInt32`/`UInt16`, retaining the index widths.
These are not counted as new behavioral defects just because their files differ.

## Decompiled source routing

### 1. Part/GameData, colliders, lights and crash behavior

[Part XML](../scope/part-and-subpart-xml.md#what-changed-in-5438), [GameData](../scope/gamedata-modules.md#what-changed-in-5438), [colliders](../scope/colliders.md#what-changed-in-5438). Authored shape/module schema remains compatible. New stock mass nodes and ordered parachute material references survive GameData passthrough. Collider volume changes only the game-derived crash pressure; help text is corrected. Part failure, contact bookkeeping, and deformation module registration are runtime behavior, not new Part authoring fields.

**28 paths:** 28 changed, 0 added, 0 removed.

**Changed**

- `KSA.Rendering.Lighting/LightDebug.cs`
- `KSA.Rendering.Lighting/LightUtils.cs`
- `KSA/BoxColliderTemplate.cs`
- `KSA/CapsuleColliderTemplate.cs`
- `KSA/ChuteClothTopology.cs`
- `KSA/ChuteRenderable.cs`
- `KSA/ColliderModule.cs`
- `KSA/ColliderTemplate.cs`
- `KSA/ColorRgbReference.cs`
- `KSA/Constants.cs`
- `KSA/CustomMassTemplate.cs`
- `KSA/CylinderColliderTemplate.cs`
- `KSA/DockingPort.cs`
- `KSA/InertMass.cs`
- `KSA/InertiaTemplate.cs`
- `KSA/ModuleList.cs`
- `KSA/Parachute.cs`
- `KSA/Part.cs`
- `KSA/PartContactLoad.cs`
- `KSA/PartContactLoadDebug.cs`
- `KSA/PartFailure.cs`
- `KSA/PartFailureEvent.cs`
- `KSA/PartStructuralLimits.cs`
- `KSA/PartTree.cs`
- `KSA/SolarPanel.cs`
- `KSA/SolarTracker.cs`
- `KSA/SolarTrackingExtension.cs`
- `KSA/SphereColliderTemplate.cs`

### 2. Engines and exhaust

[Engines](../scope/engines.md). Review covers rocket design-load recomputation, solid-motor flow behavior, nozzle state and the exhaust schema replacement. Flexo stores exhaust template references and updates its offered Core ids; it does not author the removed pressure/throttle modifier classes or port the plume renderer. Renamed gas-dynamics/deformation helpers are accounted for as added/removed paths. The detailed engine review distinguishes ported performance formulas from runtime simulation.

**42 paths:** 22 changed, 16 added, 4 removed.

**Changed**

- `KSA/Combustor.cs`
- `KSA/CoreDrainState.cs`
- `KSA/ExhaustInstance.cs`
- `KSA/MachDiamonds.cs`
- `KSA/PlumeData.cs`
- `KSA/Rocket.cs`
- `KSA/RocketControllerData.cs`
- `KSA/RocketControllerTemplate.cs`
- `KSA/RocketCore.cs`
- `KSA/RocketNozzle.cs`
- `KSA/RocketNozzleState.cs`
- `KSA/RocketTemplate.cs`
- `KSA/SolidGrainSegment.cs`
- `KSA/SolidMotor.cs`
- `KSA/ThrusterController.cs`
- `KSA/TrailCursor.cs`
- `KSA/TrailSegmentData.cs`
- `KSA/TrailSegmentLodFrame.cs`
- `KSA/VolumetricExhaustInstance.cs`
- `KSA/VolumetricExhaustRenderer.cs`
- `KSA/VolumetricExhaustTemplate.cs`
- `KSA/VolumetricTrailRenderer.cs`

**Added**

- `KSA/ExhaustAxialFade.cs`
- `KSA/ExhaustBendTarget.cs`
- `KSA/ExhaustBlendedTemplateValues.cs`
- `KSA/ExhaustCombiner.cs`
- `KSA/ExhaustDeformation.cs`
- `KSA/ExhaustDiamondFade.cs`
- `KSA/ExhaustGasDynamics.cs`
- `KSA/ExhaustHierarchy.cs`
- `KSA/ExhaustInteraction.cs`
- `KSA/ExhaustLobes.cs`
- `KSA/ExhaustMergeConstants.cs`
- `KSA/ExhaustNode.cs`
- `KSA/ExhaustPlumeBoundary.cs`
- `KSA/ExhaustSubmission.cs`
- `KSA/TrailSegmentMotionData.cs`
- `KSA/WeightedExhaustTemplate.cs`

**Removed**

- `KSA/ExhaustPlumeDeformation.cs`
- `KSA/ExhaustPlumeGasDynamics.cs`
- `KSA/PressureModifiers.cs`
- `KSA/ThrottleModifiers.cs`

### 3. Feed topology and resource runtime

[Plumbing](../scope/plumbing-and-feeds.md). New flow-order/topology structures change vehicle-level resource evaluation. Connector capability tokens, FeedsFrom/ConsumerFeedWiring forms and container ids remain the authored boundary; these runtime graph implementations are not copied into flexo.

**9 paths:** 7 changed, 2 added, 0 removed.

**Changed**

- `KSA/BiDirectionalGraph.cs`
- `KSA/FuelLinkList.cs`
- `KSA/PowerManager.cs`
- `KSA/ResourceManager.cs`
- `KSA/ResourceManagerBase.cs`
- `KSA/SequencePerformanceList.cs`
- `KSA/Tank.cs`

**Added**

- `KSA/FlowOrder.cs`
- `KSA/PartFlowTopology.cs`

### 4. Materials, GLB/textures, bundle loading and mesh pipelines

[Custom assets and mod export](../scope/custom-assets-and-mod-export.md#what-changed-in-5438). Reviewed material DisplayName metadata, global id/bundle rules, mesh bounds and indexed raycasts, texture loading, emissive pipeline and required thumbnail texture guards. Runtime dent-buffer binding does not add template fields. Core material references retain the original material definitions. Multi-part export remains legal.

**19 paths:** 19 changed, 0 added, 0 removed.

**Changed**

- `KSA.Rendering.Thumbnails/ThumbnailDynamic.cs`
- `KSA.Rendering.Thumbnails/ThumbnailRenderResources.cs`
- `KSA/AssetBundle.cs`
- `KSA/DeviceMeshInterleaved.cs`
- `KSA/FileReference.cs`
- `KSA/MeshReference.cs`
- `KSA/Mod.cs`
- `KSA/ModLibrary.cs`
- `KSA/PartModel.cs`
- `KSA/PartModelDynamic.cs`
- `KSA/PartModelDynamicModule.cs`
- `KSA/PartModelGlass.cs`
- `KSA/PartModelModule.cs`
- `KSA/PartModelRenderer.cs`
- `KSA/PbrMaterialReference.cs`
- `KSA/Ray.cs`
- `KSA/ShaderReference.cs`
- `KSA/SoundReference.cs`
- `RenderCore/TextureAsset.cs`

### 5. Connectors, coordinate mapping, IVA and vehicle state

[Coordinates and IVA](../scope/connectors-coordinates-iva.md#what-changed-in-5438), [launch sites](../scope/launch-sites.md#what-changed-in-5438). Relevant pose/control/IVA changes are local-variable renames; inherited vehicle-frame contracts remain intact. VehicleData.IsDebris is saved vehicle state, not Part XML. Vehicle destruction/runtime additions are outside Part authoring.

**8 paths:** 8 changed, 0 added, 0 removed.

**Changed**

- `KSA/Camera.cs`
- `KSA/FlightComputer.cs`
- `KSA/IVAController.cs`
- `KSA/QuaternionEx.cs`
- `KSA/Vehicle.cs`
- `KSA/VehicleData.cs`
- `KSA/VehicleEditor.cs`
- `KSA/VehicleReferenceFrameEx.cs`

### 6. Animation

[Animation](../scope/animation.md#what-changed-in-5438). AnimationUtils changes a temporary variable name in a matrix iteration. Keyframe import/export contracts and private GLB structure were checked separately; this file adds no authoring field.

**1 paths:** 1 changed, 0 added, 0 removed.

**Changed**

- `RenderCore.Animation/AnimationUtils.cs`

### 7. Kitten aides and crew runtime

[Kittens](../scope/kittens.md#what-changed-in-5438), [coordinates and IVA](../scope/connectors-coordinates-iva.md#what-changed-in-5438). Eye, portrait and ladder hunks rename temporary vectors/quaternions; they add no mesh/material/bone or template change. Gameplay locomotion remains outside the editor aide.

**4 paths:** 4 changed, 0 added, 0 removed.

**Changed**

- `KSA/CatEyeAnim.cs`
- `KSA/CrewPortraitPanel.cs`
- `KSA/KittenLocomotion.cs`
- `KSA/LadderMath.cs`

### 8. ICRP systems and terrain evaluation

[Launch sites](../scope/launch-sites.md#what-changed-in-5438). Decal distance rejection and optimized erosion/tile sampling are game-side terrain behavior, not flexo ports. GalacticPlane is a system-level XML addition safely retained by ICRP deep cloning; see the schema sweep below.

**8 paths:** 7 changed, 1 added, 0 removed.

**Changed**

- `KSA/Celestial.cs`
- `KSA/ComplexCratersModifierReference.cs`
- `KSA/DecalModifierReference.cs`
- `KSA/DunesModifierReference.cs`
- `KSA/GalacticPlane.cs`
- `KSA/NoiseFunctions.cs`
- `KSA/TilingDetailModifierReference.cs`

**Added**

- `KSA/FastMath.cs`

### 9. Ground clutter

[Ground clutter](../scope/ground-clutter.md#what-changed-in-5438). Runtime physical/rendering changes do not move the authored clutter schema. The existing scaffold incompatibility R1 remains historical backlog, explicitly separated from this update.

**2 paths:** 2 changed, 0 added, 0 removed.

**Changed**

- `KSA/ClutterEcotypePhysicalData.cs`
- `KSA/GroundClutterRenderer.cs`

### 10. Explosion, particle and dent effects outside Part authoring

[Custom assets](../scope/custom-assets-and-mod-export.md#what-changed-in-5438). New standalone effect definitions are outside the Part importer/exporter. They are not protected by GameData passthrough. Dent records are saved runtime damage; flexo creates undeformed meshes and does not simulate damage. Their common material/light hooks were reviewed in the relevant contract groups.

**26 paths:** 5 changed, 21 added, 0 removed.

**Changed**

- `KSA.Rendering.Particles.MeshBuffers/ParticleMeshBuffer.cs`
- `KSA.Rendering.Particles/GpuEmitterParams.cs`
- `KSA.Rendering.Particles/ParticleEmitter.cs`
- `KSA.Rendering.Particles/ParticleEmitterReference.cs`
- `KSA.Rendering.Particles/ParticleSpawnPresets.cs`

**Added**

- `KSA.Deformation/Dent.cs`
- `KSA.Deformation/DentAddResult.cs`
- `KSA.Deformation/DentField.cs`
- `KSA.Deformation/DentFieldParams.cs`
- `KSA.Deformation/DentLimits.cs`
- `KSA.Deformation/PerInstanceDent.cs`
- `KSA.Rendering.Particles/ExplosionEmitterRef.cs`
- `KSA.Rendering.Particles/ExplosionReference.cs`
- `KSA.Rendering.Particles/ExplosionVolumeRef.cs`
- `KSA.Rendering.Particles/ParticleColorStops.cs`
- `KSA.Rendering.Particles/ParticleEnvelopeStops.cs`
- `KSA.Rendering/ExplosionIntensity.cs`
- `KSA/ExplosionContext.cs`
- `KSA/ExplosionEditor.cs`
- `KSA/ExplosionFlashSpec.cs`
- `KSA/ExplosionVolumeDebugEditor.cs`
- `KSA/ExplosionVolumeTemplate.cs`
- `KSA/FxDeformation.cs`
- `KSA/FxDeformationState.cs`
- `KSA/MeshDeformationEditor.cs`
- `KSA/PartModelDentBuffers.cs`

### 11. Simulation and orbital runtime outside flexo authoring

Physics-bubble jobs, state integration, trajectories, contact solving, debris and orbital utilities are game simulation internals. ConstraintSim was additionally checked against the collider and ICRP contracts: it still chooses one nearest pad within 300 m. OrbitTemplate retains its wire shape; its hunk only renames a local. No new Part/System authoring fields were found in this group.

**27 paths:** 22 changed, 5 added, 0 removed.

**Changed**

- `KSA/Astronomical.cs`
- `KSA/BoundingBoxCdA.cs`
- `KSA/BubbleMergePredicate.cs`
- `KSA/Burn.cs`
- `KSA/BurnPlan.cs`
- `KSA/ConstraintSim.cs`
- `KSA/CorrectionBurnTask.cs`
- `KSA/FlightPlan.cs`
- `KSA/MergePairSlot.cs`
- `KSA/Orbit.cs`
- `KSA/OrbitPointCce.cs`
- `KSA/OrbitTemplate.cs`
- `KSA/OrbitalTransfers.cs`
- `KSA/PatchedConic.cs`
- `KSA/PhysicsBubble.cs`
- `KSA/PhysicsStates.cs`
- `KSA/StateVectors.cs`
- `KSA/TerrainPatch.cs`
- `KSA/Universe.cs`
- `KSA/VehiclePropertiesEx.cs`
- `KSA/VehicleUpdateState.cs`
- `KSA/VehicleUpdateTask.cs`

**Added**

- `KSA/BubbleBeginStepJob.cs`
- `KSA/BubbleEndStepJob.cs`
- `KSA/BubblePostWorkJob.cs`
- `KSA/BubbleStepSegmentJob.cs`
- `KSA/ClusterMergeState.cs`

### 12. Game UI, settings, scheduling and profiling outside flexo authoring

Native window/monitor selection, ImGui, audio control, localization, input events, profiling and job scheduling are game internals. GameSettings TOML controls the game application, not exported mod.toml. CpuFrame removal belongs to the new ProfilerFrame/UI structure. These changes do not reach the web editor shell or authored KSA assets.

**44 paths:** 37 changed, 6 added, 1 removed.

**Changed**

- `KSA/AveragedFrameBuilder.cs`
- `KSA/BiomeSoundController.cs`
- `KSA/CpuProfiler.cs`
- `KSA/CubicHermiteSplineEditor.cs`
- `KSA/EnumCollections.cs`
- `KSA/FixedController.cs`
- `KSA/FlyController.cs`
- `KSA/FontManager.cs`
- `KSA/ForceX11Arg.cs`
- `KSA/GameAudio.cs`
- `KSA/GameSettings.cs`
- `KSA/GpuProfiler.cs`
- `KSA/IProfilerSource.cs`
- `KSA/ImGuiBackendGlfwImpl.cs`
- `KSA/ImGuiBackendVulkanImpl.cs`
- `KSA/ImGuiFontExtensions.cs`
- `KSA/ImGuiHelper.cs`
- `KSA/ImGuiWindow.cs`
- `KSA/InputEvents.cs`
- `KSA/JobSystems.cs`
- `KSA/KsaVmaAllocator.cs`
- `KSA/LStrings.cs`
- `KSA/OrbitController.cs`
- `KSA/ParticleEmitterDebugEditor.cs`
- `KSA/Profiler.cs`
- `KSA/ProfilerCapture.cs`
- `KSA/ProfilerMetric.cs`
- `KSA/ProfilerPlots.cs`
- `KSA/ProfilerStackedArea.cs`
- `KSA/ProfilerViewState.cs`
- `KSA/ProfilerWindow.cs`
- `KSA/ProfilerWindowBase.cs`
- `KSA/ProfilerZoneStats.cs`
- `KSA/Program.cs`
- `KSA/Sample.cs`
- `KSA/SlotScan.cs`
- `KSA/WorkerProfilerWindow.cs`

**Added**

- `KSA/MemoryProfiler.cs`
- `KSA/ProfilerFrame.cs`
- `KSA/ProfilerTreeSort.cs`
- `KSA/ProfilerUi.cs`
- `KSA/ScreenSelection.cs`
- `KSA/VramProfiler.cs`

**Removed**

- `KSA/CpuFrame.cs`

### 13. Game renderer and general math outside flexo authoring

Vulkan allocation, raytracing, atmosphere/ocean/star rendering and native camera controls are game renderer internals. Shared mesh/texture boundary files were routed to the assets group instead. Core/Transform, MathEx and BoundingCone hunks only rename locals. RenderCore mesh/Vulkan enum spelling changes do not change the glTF file contract. No added Part template fields appear here.

**34 paths:** 34 changed, 0 added, 0 removed.

**Changed**

- `Core/Renderer.cs`
- `Core/Transform.cs`
- `KSA.Atmosphere.Rendering/CloudLayerRenderData.cs`
- `KSA.Atmosphere.Rendering/CloudShadowVolume.cs`
- `KSA.Atmosphere.Rendering/OceanRenderData.cs`
- `KSA.Rendering.Atmosphere.Rendering/TransparenciesMsaaResolve.cs`
- `KSA.Rendering.Lighting/ShadowUtils.cs`
- `KSA.Rendering.Lighting/SunShadowTechnique.cs`
- `KSA.Rendering.Raytracing/AccelerationStructureAllocator.cs`
- `KSA.Rendering.Raytracing/AccelerationStructureUtils.cs`
- `KSA.Rendering.Raytracing/RaytraceBlasUtils.cs`
- `KSA.Rendering.Raytracing/RaytracingRenderer.cs`
- `KSA.Rendering.Water.Rendering/OceanRenderer.cs`
- `KSA.Rendering/BoundingVolumeHierarchy.cs`
- `KSA.Rendering/RenderTarget.cs`
- `KSA.Rendering/Tetrahedron.cs`
- `KSA.Rendering/Utils.cs`
- `KSA/BoundingCone.cs`
- `KSA/CubeCellGrid.cs`
- `KSA/CubeMesh.cs`
- `KSA/FxTemperature.cs`
- `KSA/FxWetness.cs`
- `KSA/GridPass.cs`
- `KSA/InstancedStarTechnique.cs`
- `KSA/MathEx.cs`
- `KSA/NavBallRenderer.cs`
- `KSA/StaticCelestialDistanceRendering.cs`
- `Render/WindowsFullScreenExclusive.cs`
- `RenderCore.Input.Controllers/FlyController.cs`
- `RenderCore.Input.Controllers/OrbitController.cs`
- `RenderCore.Mesh/SimpleVkMesh.cs`
- `RenderCore.Mesh/SimpleVkMeshAtlas.cs`
- `RenderCore/HalfEdgeMeshUtils.cs`
- `RenderCore/MeshGenerator.cs`

### 14. Compiler-generated and assembly metadata

Generated delegates/inline arrays and assembly version metadata are not authored KSA schema or flexo dependencies.

**5 paths:** 2 changed, 3 added, 0 removed.

**Changed**

- `--f__AnonymousDelegate2.cs`
- `Properties/AssemblyInfo.cs`

**Added**

- `--f__AnonymousDelegate3.cs`
- `--y__InlineArray11.cs`
- `--y__InlineArray5.cs`

## Content routing

All 29 asset/shader paths are listed individually. No Content path was removed.

| Status | Path under Content | Routing and verdict |
| --- | --- | --- |
| changed | `Core/CoreElectricalAGameData.xml` | GameData: added analytic inert masses; passthrough-safe; fixture refresh. |
| changed | `Core/CoreLandingAGameData.xml` | GameData: added landing-leg analytic masses; passthrough-safe. |
| changed | `Core/CorePropulsionAGameData.xml` | Engines: auxiliary nozzle exhaust reference changed to EngineAAuxiliary; fixture refresh. |
| changed | `Core/CoreStructuralAGameData.xml` | GameData: added radial-decoupler cuboid masses; passthrough-safe. |
| changed | `Core/CoreUtilityAGameData.xml` | GameData: ordered parachute PbrMaterialRef choices; passthrough-safe. |
| changed | `Core/DefaultAssets.xml` | Assets/effects: registers LifetimeEnvelope updater shader. |
| changed | `Core/ExhaustAssets.xml` | Engines: current exhaust definitions and ids; editor suggestion snapshot reviewed. |
| added | `Core/ExplosionAssets.xml` | Outside Part authoring: new standalone explosion catalog. |
| changed | `Core/ParachuteAssets.xml` | Assets: six canopy materials and DisplayName labels; Core references remain resolvable. |
| changed | `Core/ParticleEmitterAssets.xml` | Outside Part authoring: particle/explosion emitter definitions. |
| changed | `Core/Shaders/Clouds/Upscaling/UpscalingFunctions.glsl` | Outside Part authoring: game atmosphere upscaling. |
| added | `Core/Shaders/Mesh/DentField.glsl` | Assets/rendering: new runtime dent evaluation; undeformed authored meshes remain valid. |
| changed | `Core/Shaders/Mesh/MeshIndirect.vert` | Assets/rendering: deformation integration; no glTF input contract change. |
| changed | `Core/Shaders/Particles/ParticleShared.glsl` | Outside Part authoring: game particle shader/runtime movement and envelope data. |
| changed | `Core/Shaders/Particles/Render/Screenspace/Shared.glsl` | Outside Part authoring: game particle shader/runtime movement and envelope data. |
| added | `Core/Shaders/Particles/Update/LifetimeEnvelope.comp` | Outside Part authoring: game particle shader/runtime movement and envelope data. |
| changed | `Core/Shaders/Particles/Update/SimpleMovement.comp` | Outside Part authoring: game particle shader/runtime movement and envelope data. |
| changed | `Core/Shaders/Particles/Update/VehicleAttachedMovement.comp` | Outside Part authoring: game particle shader/runtime movement and envelope data. |
| changed | `Core/Shaders/ShadowPassNoPush.vert` | Assets/rendering: deformation in shadow pass. |
| changed | `Core/Shaders/ShadowPassNoPushCSM.vert` | Assets/rendering: deformation in cascaded shadow pass. |
| changed | `Core/Shaders/VolumetricExhaust/Data/InstanceData.glsl` | Engines/effects: game exhaust renderer data, bounds, raymarching or upscaling; no flexo rendering port. |
| changed | `Core/Shaders/VolumetricExhaust/Data/PassData.glsl` | Engines/effects: game exhaust renderer data, bounds, raymarching or upscaling; no flexo rendering port. |
| changed | `Core/Shaders/VolumetricExhaust/Upscaling/VolumetricExhaustPrePass.frag` | Engines/effects: game exhaust renderer data, bounds, raymarching or upscaling; no flexo rendering port. |
| added | `Core/Shaders/VolumetricExhaust/VolumeBounds.glsl` | Engines/effects: game exhaust renderer data, bounds, raymarching or upscaling; no flexo rendering port. |
| changed | `Core/Shaders/VolumetricExhaust/VolumetricExhaust.frag` | Engines/effects: game exhaust renderer data, bounds, raymarching or upscaling; no flexo rendering port. |
| changed | `Core/Shaders/VolumetricTrail/RaymarchVolumetricTrail.comp` | Engines/effects: game trail GPU layout/raymarcher; authored PlumeTrail references reviewed separately. |
| changed | `Core/Shaders/VolumetricTrail/SegmentData.glsl` | Engines/effects: game trail GPU layout/raymarcher; authored PlumeTrail references reviewed separately. |
| changed | `Core/mod.toml` | Bundle loading: registers new effect catalog; existing flat assets list contract intact. |
| changed | `SegmentData.glsl` | Outside Part authoring: snapshot-root trail segment GPU data; separately counted from Core shader. |
