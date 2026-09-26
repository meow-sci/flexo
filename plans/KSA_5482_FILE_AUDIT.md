# KSA 5438 → 5482: complete filtered file audit

Every path in the review inventory is assigned below to a reviewed contract surface or an
explicitly excluded runtime surface. This is a routing ledger; the linked scope documents hold
the detailed contract verdicts and [KSA_5482_REVIEW.md](KSA_5482_REVIEW.md) holds the validation
results.

## Inputs and counting

- Previous snapshot: `ksa-game-assemblies_prev/current`, build **2026.9.10.5438** (the verified baseline).
- Current snapshot: `ksa-game-assemblies/current`, build **2026.9.22.5482** (assemblies git `a2f724f`).
- Decompiled source paths are relative to the snapshot root (`decomp/…`); asset paths are `Content/…`.
- `decomp/`: **150 changed, 35 added, 6 removed = 191** paths. The Brutal/System/MIConvexHull/Planet
  namespace filter excludes no path in this build; a plain `grep -v "System\."` would wrongly drop
  ten `*System.cs` files, so they are counted and routed here.
- `Content/`: **33 changed, 3 added, 0 removed = 36** paths.
- These are **raw file counts, not semantic-change counts**. Renamed classes appear as an added and
  a removed path (the mesh-bucket systems).
- Completeness was checked programmatically: each of the **227 inventory paths** appears in exactly
  one group below with its original status; none is unassigned or duplicated.

## Schema sweep

Every changed and added file was swept for `[XmlElement]`, `[XmlAttribute]`, `[XmlType]`,
`[XmlIgnore]` and `[DefaultValue]` hunks, and the reviewers checked the template classes behind
modeled elements for new public fields. The complete delta:

| Game declaration | Boundary and outcome |
| --- | --- |
| `Tank.TemplateData.Tank` + new `ConicalTankTemplate` | `<Tank><ConicalTank>` with `<Length>`, `<DomeHeightFraction>`, `<RadiusBase>`, `<RadiusTop>`, `<WallThickness>`. `<Tank>` is MODELED, so it was dropped whole; **W1, fixed**. |
| `ClutterObjectTemplate.AngularDamping` | Optional `[XmlAttribute]` float, default 0, overwritten by `ApplyGameData`. Ground-clutter scaffold only; documented (W3). |
| `GroundClutterMaterialReference.KeepBackfaceNormals` | Optional `<KeepBackfaceNormals Value>`, default false. Scaffold only; documented (W3). |
| `CelestialSystemData.GroundClutter` + new `ClutterEcotypeSaveData` | `universe.xml` save state (`<GroundClutter><Celestial|Ecotype|GridResolution|Cell|DisplacedObject>`), not asset schema; ICRP never writes saves. The ecotype-`Name` keying it introduces is documented (W4). |
| `DistantGlintReference` `[XmlIgnore]` runtime flag | Runtime-generated glint marker; not serialized. |

`PartTemplate`, `SubPartTemplate`, every GameData module template flexo models other than the tank
shapes, every static-object schema class, `SystemTemplate` and `PbrMaterialReference` are
byte-identical.

## Noise retained in the inventory

`CustomMassTemplate`, `InertiaTemplate`, `InertMass`, `ChuteCanopyPose`, `ClutterSubstanceReference`,
`BubbleOrigin` and `SlotScan` differ only in logged source-line numbers; `GlbColliders` and
`ClutterAssetBundler` add local renames alongside their real hunks; `RocketCoreState` changes one
UI label (`" %%"` → `" %"`). They are counted as changed files but not as behaviour changes.

## Routing

### Tanks, mass and Part/GameData modules

[GameData](../scope/gamedata-modules.md#what-changed-in-5482), [Part XML](../scope/part-and-subpart-xml.md#what-changed-in-5482), [plumbing](../scope/plumbing-and-feeds.md). The one real gap of this build lives here: `Tank.cs` gained `<ConicalTank>` and the new `ConicalTankTemplate.cs` defines it; Core's `CoreFairingAGameData.xml` authors it (gap W1, fixed). `TankGeometry`/`MassGeometry` refactor the game's own tank mass math (the cylinder path now delegates to the cone path and matches the old result to float32 rounding); flexo ports none of it. `Part.cs` changes are runtime (lazy part tree, `TryAttachSubPart`, a whole-part raycast early-out); `SerializedCollection.Deregister` serves only runtime distant glints; `PartFailure`, the lazy power/resource managers (`Generator`, `PowerConsumer`, `SolarPanel`, `PartTree`, `DerivedData*`) and the chute/deformation files are runtime. `CustomMassTemplate`, `InertiaTemplate`, `InertMass`, `ChuteCanopyPose` changed in logged line numbers only.

**28 paths:** 25 changed, 3 added, 0 removed.

**Changed**

- `Content/Core/CoreFairingAGameData.xml`
- `decomp/KSA/ChuteCanopyPose.cs`
- `decomp/KSA/ChuteRenderable.cs`
- `decomp/KSA/CustomMassTemplate.cs`
- `decomp/KSA/DockingPort.cs`
- `decomp/KSA/EVADoor.cs`
- `decomp/KSA/EnumCollections.cs`
- `decomp/KSA/FxDeformation.cs`
- `decomp/KSA/Generator.cs`
- `decomp/KSA/InertMass.cs`
- `decomp/KSA/InertiaTemplate.cs`
- `decomp/KSA/MassGeometry.cs`
- `decomp/KSA/Module.cs`
- `decomp/KSA/ModuleBase.cs`
- `decomp/KSA/ModuleStateful.cs`
- `decomp/KSA/Parachute.cs`
- `decomp/KSA/Part.cs`
- `decomp/KSA/PartArchetypes.cs`
- `decomp/KSA/PartFailure.cs`
- `decomp/KSA/PartTree.cs`
- `decomp/KSA/PowerConsumer.cs`
- `decomp/KSA/SerializedCollection.cs`
- `decomp/KSA/SolarPanel.cs`
- `decomp/KSA/Tank.cs`
- `decomp/KSA/TankGeometry.cs`

**Added**

- `decomp/KSA/ConicalTankTemplate.cs`
- `decomp/KSA/DerivedData.cs`
- `decomp/KSA/DerivedDataEx.cs`


### Engines, exhaust, explosions and plumbing runtime

[Engines](../scope/engines.md#what-changed-in-5482). No ported class is in this list; every class `enginePhysics.ts` / `solidMotorPhysics.ts` ports is byte-identical. `RocketControllerData.ComputeFromCores` (rev 5464) dropped an unused centre-of-mass term and shares one conditions solve between vacuum and sea level; flexo does not port it. `RocketNozzle`/`RocketCoreConditions` gained ImGui design-point readouts (rev 5440) that reproduce `predictPerformance`. `ResourceManager` (rev 5478 refill flag), sequencing, exhaust deep compositing (rev 5458) and explosion retuning (rev 5454) are runtime.

**23 paths:** 21 changed, 2 added, 0 removed.

**Changed**

- `Content/Core/ExplosionAssets.xml`
- `Content/Core/ParticleEmitterAssets.xml`
- `Content/Core/Shaders/VolumetricExhaust/ExhaustOit.comp`
- `Content/Core/Shaders/VolumetricExhaust/Upscaling/DepthWrite.frag`
- `Content/Core/Shaders/VolumetricExhaust/VolumetricExhaust.frag`
- `Content/Core/Shaders/VolumetricTrail/Preprocessing/FinalGrid/BuildSegmentEmptyVoxelSkips.comp`
- `decomp/KSA/BurnPlan.cs`
- `decomp/KSA/Combustor.cs`
- `decomp/KSA/EngineController.cs`
- `decomp/KSA/ExplosionEditor.cs`
- `decomp/KSA/ExplosionSystem.cs`
- `decomp/KSA/ExplosionVolumeSystem.cs`
- `decomp/KSA/ResourceManager.cs`
- `decomp/KSA/RocketControllerData.cs`
- `decomp/KSA/RocketCoreConditions.cs`
- `decomp/KSA/RocketCoreState.cs`
- `decomp/KSA/RocketNozzle.cs`
- `decomp/KSA/SequenceList.cs`
- `decomp/KSA/SequencePerformanceList.cs`
- `decomp/KSA/VolumetricExhaustRenderer.cs`
- `decomp/KSA/VolumetricTrailRenderer.cs`

**Added**

- `Content/Core/Shaders/VolumetricExhaust/ComposeWithClouds.glsl`
- `decomp/KSA/VolumetricExhaustOitData.cs`


### Part rendering, materials, GLB bundling and mod loading

[Custom assets](../scope/custom-assets-and-mod-export.md#what-changed-in-5482). Revs 5456/5474 moved part render state into the new `PartTreeRenderData.cs` and replaced the mesh/shadow bucket systems with pass/view handles; the state bits, the `<Internal>` gate condition and `ENABLE_EMISSIVE` placement are unchanged, and `ThumbnailRenderResources`, `PbrMaterialReference`, `MeshAtlasFileReference`, `GltfUtils`, `AssetBundle`, `Mod`, `ModLibrary` and `MeshIndirect.frag` are byte-identical. `Lighting.glsl`, `ModelPbr.frag` and `MeshIndirectRaytraced.frag` carry rev 5472's BRDF lookup fix (in-game look only). `PartAssetBundler`/`GlbExtras` are KSA's own bundler, which flexo does not mirror. Frame-queue/present files (rev 5443) and loader/app plumbing are runtime.

**49 paths:** 31 changed, 13 added, 5 removed.

**Changed**

- `Content/Core/Shaders/Common/Lighting.glsl`
- `Content/Core/Shaders/Mesh/MeshIndirectRaytraced.frag`
- `Content/Core/Shaders/Mesh/ModelPbr.frag`
- `decomp/Core/KSADeviceContextEx.cs`
- `decomp/Core/Renderer.cs`
- `decomp/KSA.GlbImport/GlbExtras.cs`
- `decomp/KSA.GlbImport/PartAssetBundler.cs`
- `decomp/KSA.Rendering.PBR/PbrSpheres.cs`
- `decomp/KSA.csproj`
- `decomp/KSA/App.cs`
- `decomp/KSA/ConfirmMods.cs`
- `decomp/KSA/IMeshRenderContext.cs`
- `decomp/KSA/IMeshRenderer.cs`
- `decomp/KSA/IModelDrawer.cs`
- `decomp/KSA/Loading.cs`
- `decomp/KSA/MeshRenderTechnique.cs`
- `decomp/KSA/PartModel.cs`
- `decomp/KSA/PartModelDynamic.cs`
- `decomp/KSA/PartModelDynamicModule.cs`
- `decomp/KSA/PartModelGlassModule.cs`
- `decomp/KSA/PartModelModule.cs`
- `decomp/KSA/PartModelRenderer.cs`
- `decomp/KSA/PartModelShadowCull.cs`
- `decomp/KSA/PrePassRenderer.cs`
- `decomp/KSA/Program.cs`
- `decomp/KSA/SelectSystem.cs`
- `decomp/KSA/ShadowRenderable.cs`
- `decomp/KSA/StaticMeshRenderable.cs`
- `decomp/KSA/SuperMeshRenderSystem.cs`
- `decomp/KSA/SuperMeshShadowCasterProvider.cs`
- `decomp/Properties/AssemblyInfo.cs`

**Added**

- `decomp/--y__InlineArray17.cs`
- `decomp/Core/FrameQueueLimit.cs`
- `decomp/Core/PresentQueue.cs`
- `decomp/Core/TaggedPresent.cs`
- `decomp/KSA/IShadowBoundsSource.cs`
- `decomp/KSA/MeshPass.cs`
- `decomp/KSA/PartTreeRenderData.cs`
- `decomp/RenderCore.Systems/ArrayFreeListIndexPool.cs`
- `decomp/RenderCore.Systems/GlobalMeshBucketHandle.cs`
- `decomp/RenderCore.Systems/MeshPassBucketSystem.cs`
- `decomp/RenderCore.Systems/MeshPassRenderer.cs`
- `decomp/RenderCore.Systems/PassId.cs`
- `decomp/RenderCore.Systems/ViewHandle.cs`

**Removed**

- `decomp/RenderCore.Systems/IMeshBucketSystem.cs`
- `decomp/RenderCore.Systems/MeshBucketHandle.cs`
- `decomp/RenderCore.Systems/MeshBucketSystem.cs`
- `decomp/RenderCore.Systems/ShadowBucketHandle.cs`
- `decomp/RenderCore.Systems/ShadowBucketSystem.cs`


### Kittens

[Kittens](../scope/kittens.md#what-changed-in-5482). Draw plumbing only; the socket correction and `AnimatedRenderable.GetBoneTransform` are unchanged, `Fur.frag` carries the BRDF fix in its ray-traced block (flexo skips fur), and the private character binaries are identical to the 5438 mirror.

**5 paths:** 5 changed, 0 added, 0 removed.

**Changed**

- `Content/Core/Shaders/Mesh/Fur.frag`
- `decomp/KSA/AnimatedRenderable.cs`
- `decomp/KSA/CatFurRenderable.cs`
- `decomp/KSA/KittenEva.cs`
- `decomp/KSA/KittenRenderable.cs`


### Connectors, coordinates, IVA, input and editor orientation

[Connectors/IVA](../scope/connectors-coordinates-iva.md#what-changed-in-5482). `IVAController` changed by one `in` keyword; `Camera.LookAtRotation` is unchanged. The rev 5449 binding refactor (`Binding*`, `KeySource`, `MouseButton*`, `IControlSource`) keeps **C** / **Shift+C** on seat cycling and camera modes. `VehicleEditor` still pins the root to identity; `Vehicle.cs` changes are runtime (bubble, debris, recovery, glint release) with the collider compound and zero-collider fallback text-identical.

**17 paths:** 9 changed, 8 added, 0 removed.

**Changed**

- `decomp/KSA/Camera.cs`
- `decomp/KSA/IVAController.cs`
- `decomp/KSA/Input.cs`
- `decomp/KSA/InputEvents.cs`
- `decomp/KSA/KeyAssignmentPopup.cs`
- `decomp/KSA/KeyBindingValue.cs`
- `decomp/KSA/Vehicle.cs`
- `decomp/KSA/VehicleEditor.cs`
- `decomp/RenderCore.Input/GlfwKeyEvent.cs`

**Added**

- `decomp/KSA/Binding.cs`
- `decomp/KSA/BindingValue.cs`
- `decomp/KSA/BindingValueKind.cs`
- `decomp/KSA/IControlSource.cs`
- `decomp/KSA/KeySource.cs`
- `decomp/KSA/MouseButtonBindingValue.cs`
- `decomp/KSA/MouseButtonSource.cs`
- `decomp/KSA/NullControlSource.cs`


### Colliders, static objects and ground clutter

[Colliders](../scope/colliders.md#what-changed-in-5482), [static objects](../scope/static-objects.md#what-changed-in-5482), [ground clutter](../scope/ground-clutter.md#what-changed-in-5482). Schema: `ClutterObjectTemplate` gained `AngularDamping` and `GroundClutterMaterialReference` gained `<KeepBackfaceNormals>` (both optional, inert for the scaffold); `ClutterEcotypeSaveData` is save state. `ConvexHullColliderTemplate` now reports a real volume (S1 unchanged). `StaticObjectAssetBundler`/`GlbColliders` output is unchanged (the golden tests stay valid); `GlbHullValidation` only warns. Pad selection, pad height and the exclusion zones in `ConstraintSim`/`GroundClutterPlacementData` are text-identical. Displacement physics, terrain sampling for clutter and the Earth tree colliders are runtime/content.

**34 paths:** 30 changed, 4 added, 0 removed.

**Changed**

- `Content/Core/GroundClutter/EarthTreesAssets.xml`
- `Content/Core/GroundClutter/_GameData.xml`
- `Content/Core/Shaders/Planet/GroundClutter/Common/GroundClutterCommon.glsl`
- `Content/Core/Shaders/Planet/GroundClutter/CullInstances.comp`
- `Content/Core/Shaders/Planet/GroundClutter/FinalizeGenerate.comp`
- `Content/Core/Shaders/Planet/GroundClutter/FinalizeGenerateCollision.comp`
- `Content/Core/Shaders/Planet/GroundClutter/PrepareInstances.comp`
- `Content/Core/Shaders/Planet/GroundClutter/Solid.frag`
- `Content/Core/Shaders/Planet/GroundClutter/Solid.vert`
- `decomp/KSA.Concurrency/BepuWorkerDispatcher.cs`
- `decomp/KSA.GlbImport/ClutterAssetBundler.cs`
- `decomp/KSA.GlbImport/GlbColliders.cs`
- `decomp/KSA.GlbImport/StaticObjectAssetBundler.cs`
- `decomp/KSA/BepuHandles.cs`
- `decomp/KSA/BubbleClutterStatics.cs`
- `decomp/KSA/ClutterCubeCellGrid.cs`
- `decomp/KSA/ClutterEcotypePhysicalData.cs`
- `decomp/KSA/ClutterEcotypeReference.cs`
- `decomp/KSA/ClutterEcotypeRenderData.cs`
- `decomp/KSA/ClutterObjectTemplate.cs`
- `decomp/KSA/ClutterSubstanceReference.cs`
- `decomp/KSA/ClutterViewResources.cs`
- `decomp/KSA/ConstraintSim.cs`
- `decomp/KSA/ConvexHullColliderTemplate.cs`
- `decomp/KSA/CubeCellGrid.cs`
- `decomp/KSA/GroundClutterMaterialReference.cs`
- `decomp/KSA/GroundClutterPlacementData.cs`
- `decomp/KSA/GroundClutterRenderer.cs`
- `decomp/KSA/NarrowPhaseCallbacks.cs`
- `decomp/KSA/PoseIntegratorCallbacks.cs`

**Added**

- `Content/Core/Shaders/Planet/GroundClutter/Common/ClutterSurfaceColor.glsl`
- `decomp/KSA.GlbImport/GlbHullValidation.cs`
- `decomp/KSA/ClutterEcotypeSaveData.cs`
- `decomp/KSA/ContactMapBufferPool.cs`


### Runtime-only: physics bubbles, terrain, sky, saves, orbit UI and diagnostics

No flexo surface. Physics-bubble islands and terrain patches (revs 5452/5455/5460/5461/5465/5471/5476/5479), the Milky Way basis fix (5469, `GalacticPlane` elements unchanged — ICRP copies them verbatim), ring shadows and cloud/atmosphere compositing (5446/5470), distant-sphere heightmaps (5457), save/list robustness (5441/5445/5453), orbit UI (5439/5462/5463/5480/5481), profiling and settings. `BubbleOrigin`, `SlotScan` changed in logged line numbers only.

**71 paths:** 62 changed, 8 added, 1 removed.

**Changed**

- `Content/AtmosphereLuts.glsl`
- `Content/Core/Shaders/Atmosphere/Atmosphere.comp`
- `Content/Core/Shaders/Atmosphere/AtmosphereDataUbo.glsl`
- `Content/Core/Shaders/Atmosphere/AtmosphereLuts.glsl`
- `Content/Core/Shaders/Clouds/RaymarchCloud.comp`
- `Content/Core/Shaders/Clouds/Upscaling/DilateMotionVectors.comp`
- `Content/Core/Shaders/Clouds/Upscaling/UpscaleCloud.comp`
- `Content/Core/Shaders/Clouds/Upscaling/UpscalingData.glsl`
- `Content/Core/Shaders/Clouds/Upscaling/UpscalingFunctions.glsl`
- `Content/Core/Shaders/Clouds/Upscaling/VolumetricUpscalingCommon.glsl`
- `Content/Core/Shaders/DistantSphere.frag`
- `Content/Core/Shaders/DistantSphere.vert`
- `Content/Core/Shaders/Planet/Planet.frag`
- `decomp/KSA.Atmosphere.Rendering.ShaderStructs/AtmosphereData.cs`
- `decomp/KSA.Atmosphere.Rendering.ShaderStructs/CloudUpscalingData.cs`
- `decomp/KSA.Atmosphere.Rendering/CloudRenderer.cs`
- `decomp/KSA.Rendering.Sun/SunMeshRenderable.cs`
- `decomp/KSA.Rendering.Sun/SunRenderer.cs`
- `decomp/KSA/AtmosphereRenderer.cs`
- `decomp/KSA/BubbleMergePredicate.cs`
- `decomp/KSA/BubbleOrigin.cs`
- `decomp/KSA/CelestialPosition.cs`
- `decomp/KSA/CelestialSystem.cs`
- `decomp/KSA/CelestialSystemData.cs`
- `decomp/KSA/ConjunctionAssessment.cs`
- `decomp/KSA/DigitRoller.cs`
- `decomp/KSA/DistantGlintReference.cs`
- `decomp/KSA/DistantSphereData.cs`
- `decomp/KSA/DistantSphereRenderer.cs`
- `decomp/KSA/FlyController.cs`
- `decomp/KSA/GalacticPlane.cs`
- `decomp/KSA/GameSave.cs`
- `decomp/KSA/GameSettings.cs`
- `decomp/KSA/IOrbiter.cs`
- `decomp/KSA/ImGuiHelper.cs`
- `decomp/KSA/JobSystems.cs`
- `decomp/KSA/LStrings.cs`
- `decomp/KSA/LayoutSave.cs`
- `decomp/KSA/MapController.cs`
- `decomp/KSA/Orbit.cs`
- `decomp/KSA/OrbitController.cs`
- `decomp/KSA/PhysicsBubble.cs`
- `decomp/KSA/PhysicsEnvironment.cs`
- `decomp/KSA/PhysicsStates.cs`
- `decomp/KSA/PlanetTransparenciesRenderer.cs`
- `decomp/KSA/Popup.cs`
- `decomp/KSA/Profiler.cs`
- `decomp/KSA/ProfilerCapture.cs`
- `decomp/KSA/SlotScan.cs`
- `decomp/KSA/TerrainPatch.cs`
- `decomp/KSA/TerrainPatchAnchor.cs`
- `decomp/KSA/TerrainPatchState.cs`
- `decomp/KSA/ThreadProfiler.cs`
- `decomp/KSA/UncompressedSave.cs`
- `decomp/KSA/UncompressedVehicleSave.cs`
- `decomp/KSA/Universe.cs`
- `decomp/KSA/UniverseData.cs`
- `decomp/KSA/UniverseManifest.cs`
- `decomp/KSA/VehicleSave.cs`
- `decomp/KSA/VehicleSaveData.cs`
- `decomp/KSA/VehicleUpdateState.cs`
- `decomp/KSA/VehicleUpdateTask.cs`

**Added**

- `Content/Core/Shaders/Common/RingShadows.glsl`
- `decomp/KSA/BubbleTerrainBasis.cs`
- `decomp/KSA/BubbleTerrainBlocks.cs`
- `decomp/KSA/BubbleTerrainGrid.cs`
- `decomp/KSA/DistantSphereMaterialData.cs`
- `decomp/KSA/OrbitHoverCandidate.cs`
- `decomp/KSA/SaveDirectory.cs`
- `decomp/KSA/TerrainRadiusCache.cs`

**Removed**

- `decomp/KSA/BubbleStepJob.cs`

