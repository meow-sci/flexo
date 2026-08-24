# KSA Static Objects — schema + runtime semantics (build 2026.8.22.5348)

All C# paths are relative to `/Users/asherwin/repos/meow-sci/ksa-game-assemblies/current/decomp/`.
All content paths are relative to `/Users/asherwin/repos/meow-sci/ksa-linux/Content/Core/`.

Changelog provenance (`version.json`, build 2026.8.22.5348, revisions 5261→5348):
- r5328 (2026-08-20, JPLRepoRocketWerkz): "Added static objects and static object rendering pipeline", "first real launchpad object model", "export of static objects to the glb to xml export tool".
- r5330 (Dan Southon): statics take clustered lighting + SSAO, terrain cloud shadows + atmosphere ambient.
- r5334: alpha map support (`<Alpha>` on PbrMaterial), CoreLaunchPadB alpha texture.
- r5336 (Linx-RW): terrain sampling (`<Terrain>true</Terrain>`, `_Terrain` glb marker), decals flatten each launch site, StaticObjectRenderer built after PlanetRenderer.

---

## 1. Class map and XML element names

Registered in `KSA/AssetBundle.cs` (root `<Assets>`):

| XML element | C# class | file |
|---|---|---|
| `<StaticObject>` | `StaticObjectTemplate` | AssetBundle.cs:32 → StaticObjectTemplate.cs |
| `<StaticSubObject>` | `StaticSubObjectTemplate` | AssetBundle.cs:33 → StaticSubObjectTemplate.cs |
| `<StaticObjectGameData>` | `StaticObjectGameDataReference : StaticObjectTemplate` | AssetBundle.cs:34 → StaticObjectGameDataReference.cs |
| `<SubObject>` (child of StaticObject) | `StaticSubObjectInstance` | StaticObjectTemplate.cs:9-10 → StaticSubObjectInstance.cs |
| `<PartModel>` | `PartModelModule.Template` (shared with vessel parts) | PartModelModule.cs:19 |
| `<Collider>` | `ColliderModule.Template` (shared with vessel parts) | ColliderModule.cs:11-19 |
| `<Transform>` | `TransformReference` (shared) | TransformReference.cs |

Runtime (non-serialized): `StaticObject` (StaticObject.cs), `StaticObjectModel` (StaticObjectModel.cs), `StaticObjectRenderer` (StaticObjectRenderer.cs).

### 1.1 `<StaticObject>` — `StaticObjectTemplate : SerializedId, IKeyed` (StaticObjectTemplate.cs)

```
public class StaticObjectTemplate : SerializedId, IKeyed
{
    [XmlElement("SubObject")]        List<StaticSubObjectInstance> SubObjectInstances;   // :9-10
    [XmlElement("PartModel")]        List<PartModelModule.Template> Models;             // :12-13
    [XmlElement("Collider")]         List<ColliderModule.Template> Colliders;           // :15-16
    [XmlElement("GroundOffset")]     DistanceReference GroundOffset;                    // :18-19
    [XmlElement("SurfaceHeight")]    DistanceReference SurfaceHeight;                   // :21-22
    [XmlElement("FootprintRadius")]  DistanceReference FootprintRadius;                 // :24-25
    [XmlIgnore] protected bool _isGameData;                                             // :27-28
    double GroundOffsetMeters / SurfaceHeightMeters / FootprintRadiusMeters  // NaN → 0.0 (:33-42)
}
```
- `Id` attribute inherited from `SerializedId`.
- A StaticObject can carry its OWN `<PartModel>`s and `<Collider>`s directly (Models/Colliders) in addition to `<SubObject>` instances. The shipped launchpad uses only SubObjects + a prefab-level `<Collider>`.
- `OnDataLoad` (:49-71): loads children, then `if (!_isGameData) ModLibrary.Register(this)`. So the Assets-file variant registers into `ModLibrary.AllStaticObjects`; the GameData variant does not register there.
- `ApplyGameData(StaticObjectGameDataReference)` (:73-90): **appends** the GameData's SubObjectInstances/Models/Colliders to the asset's lists; GroundOffset/SurfaceHeight/FootprintRadius are **replaced only if set** (non-NaN) in the GameData.
- `DistanceReference` (DistanceReference.cs:9-25): attributes `Ly`,`Au`,`Km`,`M`,`Cm`,`Mm` all default NaN; value = sum of the non-NaN ones (:67-99); all-NaN → NaN → treated as "not set". Hence `<GroundOffset M="0.2" />`.

### 1.2 `<StaticSubObject>` — `StaticSubObjectTemplate : SerializedId, IKeyed` (StaticSubObjectTemplate.cs)

```
[XmlElement("PartModel")] List<PartModelModule.Template> Models;   // :9-10
[XmlElement("Collider")]  List<ColliderModule.Template> Colliders; // :12-13
OnDataLoad → ModLibrary.Register(this)                              // :18-30
```
No Transform, no GroundOffset etc. It is a pure reusable "prefab piece": meshes + colliders, in its own local Asmb frame. **It has NO `<SubObject>` list, so sub-objects cannot nest.**

### 1.3 `<SubObject Id InstanceOf>` — `StaticSubObjectInstance : IDataReference` (StaticSubObjectInstance.cs)

```
[XmlAttribute] string Id;                       // :7-8   (informational; never looked up)
[XmlAttribute] string InstanceOf;               // :10-11
[XmlElement("Transform")] TransformReference? Transform;  // :13-14
GetTemplate() => ModLibrary.Get<StaticSubObjectTemplate>(InstanceOf);   // :26-29
```
- `InstanceOf` resolves **only** through `ModLibrary.Get<StaticSubObjectTemplate>` → `AllStaticSubObjects.Find(KeyHash)` (ModLibrary.cs:1284-1291). It **cannot** reference a `<Part>`, `<SubPart>`, or another `<StaticObject>` — those live in different collections (`AllParts`, `AllStaticObjects`). A missing id throws `NullReferenceException` (ModLibrary.cs:1288) which `StaticObject.Resolve` catches and logs "Static object 'X' references missing sub-object 'Y'" (StaticObject.cs:117-137), then skips it.
- **No nesting of StaticObjects**: `StaticObjectTemplate` has no field referencing other StaticObjects; `StaticSubObjectTemplate` has no SubObject list. Hierarchy is exactly two levels: StaticObject → StaticSubObject instances.
- The `Id` attribute of `<SubObject>` is unused at runtime (`IsValid()` only checks InstanceOf, :16-19). The bundler fills it with the glb mesh name (e.g. `..._PadGrateB2`).
- Cross-file references are fine: `CoreLaunchPadA_Prefab_LaunchPadA` instances `CoreLaunchPadB_Subpart_GravelTrimA` and `CoreLaunchPadC_Subpart_BaseGrassA` defined in the B/C asset files (resolution is deferred to `StaticObject.ResolveAll`, called at the end of `ModLibrary.AttachGameData`, ModLibrary.cs:1881, after all mods loaded).

### 1.4 `<StaticObjectGameData>` — `StaticObjectGameDataReference` (StaticObjectGameDataReference.cs)

- Constructor sets `_isGameData = true` (:8-11).
- `OnDataLoad` (:13-20): `base.OnDataLoad` (loads children, does NOT register into AllStaticObjects because `_isGameData`), then `ModLibrary.Register(this)` into `AllStaticObjectGameData`; **if that Register returns false (duplicate id already in AllStaticObjectGameData) it merges itself into the earlier GameData entry** via `AllStaticObjectGameData.Find(...).ApplyGameData(this)` — i.e. multiple GameData files for the same id stack additively (lists append, scalars last-set-wins).
- Later, `ModLibrary.AttachGameData` (ModLibrary.cs:1862-1873): for each GameData, `AllStaticObjects.Find(id)` → `staticObjectTemplate.ApplyGameData(item3)`; if no asset matches, logs error "Static object game data 'X' does not match any static object asset".
- Then `StaticObject.ResolveAll()` (ModLibrary.cs:1881).

Shipped example (`CoreLaunchPadAGameData.xml`, complete file):
```xml
<Assets>
<StaticObjectGameData Id="CoreLaunchPadA_Prefab_LaunchPadA">
    <GroundOffset M="0.2" />
    <SurfaceHeight M="1.5537" />
    <FootprintRadius M="108.3" />
</StaticObjectGameData>
</Assets>
```
Assets side (`CoreLaunchPadAAssets.xml`, generated) ends the StaticObject with empty `<GroundOffset />`, `<SurfaceHeight />`, `<FootprintRadius />` (all-NaN → not set), so the GameData values win. Split therefore mirrors Part/PartGameData: geometry/materials/colliders in the autogenerated Assets file, hand-tuned gameplay numbers in GameData.

### 1.5 ModLibrary registration / lookup (ModLibrary.cs)

- Collections: `AllStaticObjects` (:92), `AllStaticSubObjects` (:94), `AllStaticObjectGameData` (:96) — `SerializedCollection<T>`; `Register` returns false for empty Id or duplicate hash (first-wins, SerializedCollection.cs `Register`).
- `Register(StaticObjectTemplate)` :682, `Register(StaticSubObjectTemplate)` :687, `Register(StaticObjectGameDataReference)` :692.
- `TryGet<T>` :1001-1019 and `Get<T>` :1276-1291 dispatch on `typeof(T)` to `AllStaticObjects.Find` / `AllStaticSubObjects.Find`.
- `AssetBundle.OnDataLoad` (AssetBundle.cs:81-106): non-astronomical assets get `asset.OnDataLoad(mod)` unless the mod is a `Preload` mod (then only Vehicle/Situation). Statics load in the normal pass.
- `StaticObject.Find(id)` (StaticObject.cs:42-45) looks in the runtime `Objects` dictionary populated by `ResolveAll` (:47-66), which also calls `LocationReference.ResolveStaticObject()` for every celestial location (:68-78).

---

## 2. Instance transform: units, axes, Euler order, scale

`TransformReference` (TransformReference.cs):
```
[XmlElement("Position")] Vector3Reference? _positionRaw;  // :8-9
[XmlElement("Rotation")] Vector3Reference? _rotationRaw;  // :11-12
[XmlElement("Scale")]    Vector3Reference? _scaleRaw;     // :14-15
PositionValue => _positionRaw?.ToDouble3() ?? 0                              // :17-28
RotationValue => QuaternionEx.CreateFromXyzRadians(_rotationRaw) ?? Identity // :30-41
ScaleValue    => _scaleRaw?.ToDouble3() ?? (1,1,1)                           // :43-54
```
`Vector3Reference` = attributes `X`,`Y`,`Z` (doubles, default 0; Vector3Reference.cs:10-17). Position is **raw metres** (no unit attribute; the bundler writes `node.Translation` straight in, GlbTransforms.cs:15). Rotation is **radians**, XYZ Euler, via `QuaternionEx.CreateFromXyzRadians` (QuaternionEx.cs:179-192):
```
w =  cx*cy*cz + sx*sy*sz
x = -cx*sy*sz + cy*cz*sx
y =  cx*cz*sy + sx*cy*sz
z =  cx*cy*sz - sx*cz*sy
```
(the standard "Rx then Ry then Rz" intrinsic-XYZ / extrinsic-ZYX composition used everywhere else in KSA — identical to SubPart `<Transform>` on vessel parts (`Part.TemplateBase.Transform`, Part.cs:206-207; `PartInstance.Transform`, PartInstance.cs:33-34) and to collider `Collider2Asmb`). Omitted axes serialize as absent attributes → 0 (bundler writes NaN which `NaNFilteringXmlWriter` drops, ToolXml.cs:52).

**Scale IS supported for the visual models but NOT for colliders:**
- Visual: `StaticObject.GetMatrix` (StaticObject.cs:228-235) = `CreateScale(Scale) * CreateFromQuaternion(Rot) * CreateTranslation(Pos)` (row-vector convention: scale, then rotate, then translate).
- Colliders: `BuildCollisionShape` (StaticObject.cs:195-196) passes only `PositionValue`/`RotationValue` to `AddColliders`; scale is ignored (colliders are not rescaled).
- The bundler only emits `<Scale>` when the glb node scale ≠ 1 (GlbTransforms.cs:18).

**Instance transform composition** (StaticObject.cs:203-216): for each collider in a sub-object, `collider2 = CreateFromXyzRadians(Collider2Asmb)`; `local = LocationAsmb + ShapeOffsetCollider·collider2`; pose position = `subObjPos + local·subObjRot`, orientation = `collider2 ∘ subObjRot`. i.e. sub-object Transform is applied on top of the collider's own Asmb placement. Visual = `Model2Asmb(instance) * Asmb2Ego` (StaticObject.cs:104).

---

## 3. Assembly frame ("Asmb") placement on the planet — coordinate convention

`LocationReference` (LocationReference.cs):
- `ForwardCcf` = unit radial from lat/lon (:45-50).
- `GetAxesCcf` (:148-154):
  ```
  upCcf    = ForwardCcf
  d        = normalize(cross(cross(UnitZ, up), up))   // = local SOUTH
  eastCcf  = cross(up, d)                              // = EAST
  northCcf = -d                                        // = NORTH
  ```
- `UpdateStaticObjectRenderData` (:156-180): only if `ShowGroundMarker` (true only for `LandmarkReference` with `IsLaunchPad="true"`, LandmarkReference.cs:9-14). Builds
  ```
  origin        = surfacePosition(lat,lon) + up * GroundOffset          // :175
  matrixAsmb2Ego = rows [ up ; east ; north ; origin ]                    // :176
  ```
  `double4x4(row0=up, row1=east, row2=north, row3=translation)` with KSA's row-vector convention (`v * M`; cf. `Model2Asmb * matrixAsmb2Ego` at StaticObject.cs:104 and `CreateScale*CreateFromQuaternion*CreateTranslation` at :234).

**Therefore the static object's local (Asmb) frame is: +X = UP (surface normal), +Y = EAST, +Z = NORTH.** Right-handed (up × east = north ✓).

Physics uses the identical basis: ConstraintSim.cs:519-527 builds the Bepu static pose from `CreateFromRotationMatrix(rows up,east,north)` with position `surface + up*GroundOffset`.

Cross-check with vessels: `Vehicle.GetInitialKinematicStateForLocation` (Vehicle.cs:3898-3933) computes `upCce = cross(cross(spinAxis, radial), radial)` (= south) and `ComputeBody2Cce(forward=radial, up=south)` (Vehicle.cs:3002-3006) = rows `[radial ; radial×south = east ; -south = north]` → vessel body frame on the pad is also X=up, Y=east, Z=north. Vessel vertical extent is taken along X (`centerMassAsmb.X - boundsMinAsmb.X`, Vehicle.cs:3922). So statics and vessels share the same frame: **X is vertical**. This matches the shipped data: SubObject `<Position X="0.6914" />` etc. are small vertical lifts while Y/Z span ±40 m horizontally.

For a glb→xml tool: the GLB is read verbatim (glTF node translation → Position XYZ, rotation → XYZ radians, scale → Scale) with **no axis conversion**, so the source GLB must already be authored with +X up, +Y east, +Z north (same convention as KSA vessel part GLBs).

---

## 4. `<PartModel>` / `<Collider>` reuse — exactly the vessel classes

`StaticObjectTemplate.Models` / `StaticSubObjectTemplate.Models` are `List<PartModelModule.Template>` (StaticObjectTemplate.cs:13, StaticSubObjectTemplate.cs:10); Colliders are `List<ColliderModule.Template>` (:16 / :13). Same XML as vessel parts.

`PartModelModule.Template` (PartModelModule.cs:19-46):
```
[XmlElement("Mesh")]         MeshReference? Mesh;
[XmlElement("Material")]     PbrMaterialReference? Material;
[XmlElement("RayTracing")]   RaytracingMode RayTracing = Disabled;
[XmlElement("ShadowCaster")] bool ShadowCaster = true;
[XmlElement("Internal")]     bool Internal = false;
[XmlElement("Terrain")]      bool Terrain = false;        // :43-44  (the static-specific flag)
```
`PbrMaterialReference` (PbrMaterialReference.cs:9-25): `<Diffuse>`, `<Normal>`, `<AoRoughMetal>`, `<Emissive>`, `<ThinFilm>`, **`<Alpha>`** (`AlphaMap`, :24-25). `AlphaMap` is read only by `StaticObjectModel` (StaticObjectModel.cs:260, :314); the vessel `PartModel` per-draw data has no alpha slot (PartModel.cs:459-463). `Terrain` is read only by `StaticObjectModel.Bucket` (StaticObjectModel.cs:260). So both are static-only in effect, though the schema accepts them on parts.

What statics use from PartModel: `Mesh` (must be non-null — else error "has a PartModel 'X' with no mesh" and it is skipped, StaticObject.cs:148-163), `Material` (diffuse/normal/pbr/alpha), `Terrain`. **Ignored for statics**: `RayTracing` (only `RayTracers` list via OnDataLoad; static renderer never consults it), `ShadowCaster`, `Internal`; there is no animation, no `PartModelDynamic`, no lights, no highlight/selection state. Emissive and ThinFilm handles ARE uploaded (`EmissiveTextureIndex`, `TfiTextureIndex`, StaticObjectModel.cs:312-313) but **the fragment shader never samples them** (StaticObject.frag:283-294, 357-365) and `thinFilmInterference:false` is pushed (StaticObjectRenderer.cs:362). So emissive/TFI are dead for statics.

Draw bucketing (StaticObjectModel.cs:16-21, :260):
```
Bucket = Terrain ? OpaqueTerrain : (Material.AlphaMap != null ? Blended : Opaque)
```
- `Opaque`, `OpaqueTerrain`: depth test+write, drawn in the pre-pass (`WriteCommandsPrePass`, StaticObjectRenderer.cs:367-379 using `PrePassIndirectFrag` = `Shaders/Mesh/MeshNormalIndirect.frag`, DefaultAssets.xml:61) and in the main colour pass right after `PartModelRenderer` (Program.cs:4237-4238).
- `Blended`: `DepthTestNoWrite` (StaticObjectRenderer.cs:188), `BlendColorAlpha` (:189), drawn after `SuperMeshRenderSystem.RenderMainPass` (Program.cs:4241). Alpha = `texture(alpha).r` (frag:360-362). It is a real **alpha blend, not a cutout** — no discard, so blended pieces do not write depth and are not in the pre-pass (no SSAO/normal contribution).
- `OpaqueTerrain` pipeline compiles the frag with `SAMPLE_TERRAIN` (StaticObjectRenderer.cs:136-139). It is only drawn when the nearby celestial has a planet-UBO slot and `IsBillboarded()` (:315). The frag ignores the material textures entirely and instead samples the planet's biome/colour/material cubemaps biplanarly at the fragment's world position (frag:142-246), uses the Hapke planet BRDF (frag:312-314), alpha forced 1.0 (frag:358). Slope/cliff materials are deliberately skipped (frag:117-123). This is how `CoreLaunchPadC_Subpart_BaseGrassA` (`<Terrain>true</Terrain>`, CoreLaunchPadCAssets.xml) blends into the ground.
- Note frag:330-332: SSAO is sampled and then `ao = 1.0f;` — **SSAO is effectively disabled** for statics despite the changelog.
- Pipeline: back-face culling, CCW front (StaticObjectRenderer.cs:173-174); vertex layout pos/normal/uv interleaved 32 bytes (:184) from the shared `DeviceMeshInterleaved` buffer (StaticObjectModel.cs:234, 297-303) → meshes must come from a `<MeshAtlas>` (`Interleaved = true`, MeshAtlasFileReference.cs:35).
- Sampler: linear/trilinear, repeat, 8× aniso (StaticObjectRenderer.cs:42-59).
- Lighting: sun w/ atmosphere transmittance, CSM + terrain sun shadows + cloud shadows + celestial eclipse (frag:303-325), clustered point lights via `SampleLightPrePass`/`SampleMeshForwardLights` (frag:327-328), atmosphere ambient LUT (frag:335-353).

`ColliderModule.Template` (ColliderModule.cs:11-19): `<Collider Id>` with children `<Box>`, `<Capsule>`, `<Cylinder>`, `<Sphere>`, `<ConvexHull>`; base fields `<LocationAsmb X Y Z>` and `<Collider2Asmb X Y Z>` (XYZ radians) (ColliderTemplate.cs:12-16). Cylinder/Capsule axis is Y (`LengthY`, `Radius`, CylinderColliderTemplate.cs:8-12). ConvexHull adds a centroid `ShapeOffsetCollider` (ConvexHullColliderTemplate.cs:17-40).

---

## 5. Instancing / rendering pipeline

- `StaticObject.Resolve` (StaticObject.cs:110-142): flattens own Models (identity) + each SubObject's Models (with `GetMatrix(Transform)`) into `_models: List<ModelInstance{Model, Model2Asmb}>`. `StaticObjectModel.Get(template)` dedupes by **PartModel Id** (StaticObjectModel.cs:262-274) — all instances of the same PartModel id share one `StaticObjectModel`, which is the GPU instancing unit. (Consequence: two different PartModels with the same `Id` across files collide — the first wins.)
- Per frame: `Celestial.UpdateRenderData` → every location's `UpdateStaticObjectRenderData` (Celestial.cs:1713-1723) → `StaticObject.UpdateRenderData` packs `float4x4(Model2Asmb * Asmb2Ego)` per instance (StaticObject.cs:96-108) → `StaticObjectRenderer.UpdateRenderData` (Program.cs:4085) → `WriteInstancesToGpu` emits one `VkDrawIndexedIndirectCommand` per (model, viewport, bucket) with `InstanceCount = n` plus `PerDrawData` (6 bindless texture indices) and the instance matrices (StaticObjectModel.cs:292-321). Draw = one `DrawIndexedIndirect` per bucket (:225-237). Vertex shader: `WorldMatrix * pos`, normal via inverse-transpose (StaticObject.vert:27-41), so non-uniform scale is handled.
- Descriptor sets (StaticObjectRenderer.cs:98-108): 0 global, 1 bindless textures, 2 per-draw SSBO+sampler, 3 per-instance SSBO, 4 CSM, 5 terrain shadow map, 6 lights, 7 AO, 8 cloud shadows, 9 planet textures.
- Visibility: only rendered when `camera.NearbyCelestial != null` (:308-312) and per-location `camera.IsVisibleTo(dir, celestial)` (LocationReference.cs:168). No frustum/distance culling per sub-object beyond that.
- `StaticObjectRenderer.Build()` runs after `PlanetRenderer` (Program.cs:1123-1125); `Rebuild()` on settings change (:4809); `Dispose` (:1359) and `StaticObject.Dispose` (:1384) free the Bepu shapes.

**Limitation:** a `StaticObject=` attribute on a Landmark that is not `IsLaunchPad="true"` neither renders (`ShowGroundMarker` gate, LocationReference.cs:158) nor collides (ConstraintSim.cs:494 filter) nor excludes clutter. Only `<Landmark>` (LandmarkReference) has `IsLaunchPad`; City/Crater/Mountain locations (CelestialTemplate.cs:37-40) can carry the attribute but it does nothing. Three shipped sites all reference the one `CoreLaunchPadA_Prefab_LaunchPadA` (Astronomicals.xml:1869-1880).

---

## 6. GroundOffset / SurfaceHeight / FootprintRadius consumers

| field | consumer | semantics |
|---|---|---|
| `GroundOffset` | LocationReference.cs:175 (render origin = surface + up·GroundOffset); ConstraintSim.cs:523 (static collider pose, same); Vehicle.cs:3954 | Lifts the whole Asmb frame (models AND colliders) above the terrain sample at lat/lon along the surface normal. Terrain height sampled at the landmark centre (`GetTerrainHeightFromDirCcf`, ConstraintSim.cs:501). |
| `SurfaceHeight` | Vehicle.cs:3954 only | Height of the pad's standing surface above the Asmb origin. `GetLaunchPadHeightAtDirCcf` (Vehicle.cs:3935-3959) returns `GroundOffset + SurfaceHeight` if the spawn lat/lon is within `FootprintRadius` of a launch-pad landmark (great-circle chord × MeanRadius, :3951-3952), else 0. Added to the vessel's initial radial position (:3923) so the vessel spawns resting on the pad top instead of the terrain. Not used by physics/rendering. |
| `FootprintRadius` | Vehicle.cs:3952 (spawn height test); GroundClutterPlacementData.cs:137-146 | Clutter exclusion: for up to **4** launch-pad landmarks (:134-137 `if (i >= 4) break`), an exclusion zone `float4(dirCcf, (FootprintRadius + 50) / MeanRadius)` is pushed to the clutter shader; skipped if FootprintRadius ≤ 0. `LocationReference.CLUTTER_CLEARANCE_METERS = 50f` (LocationReference.cs:31) is the 50 m pad (the constant is defined but the literal `50.0` is inlined at GroundClutterPlacementData.cs:143). Not used by collision. |

Not consumed anywhere else (grep across decomp confirms). The bundler never emits values for these (only empty elements), they are GameData-authored.

---

## 7. Physics

- Shape build (StaticObject.cs:175-201): at `ResolveAll` a single Bepu `BigCompound` of kinematic children is built from own colliders + every sub-object's colliders (transformed by the instance Position/Rotation only, §2). `ColliderTemplate.GetShape()` caches one shared unscaled shape per template (ColliderTemplate.cs:34-52). Zero colliders → no shape (`CollisionShape.Exists == false`) → never added to the sim.
- Per-vehicle static body (ConstraintSim.cs:479-537): `UpdateStaticObjectCollider` finds the nearest launch-pad landmark whose static has a shape, within `sqrt(90000) = 300 m` of the vehicle (:483, :505-511), and adds/updates ONE `Simulation.Statics` entry stored in `BepuHandles.StaticObjectCollider` (BepuHandles.cs:29) positioned at `surface + up·GroundOffset` relative to the physics origin with orientation rows (up,east,north) (:519-527), using `StaticsShouldntAwakenBodies`. Called alongside terrain updates: on vehicle add (:278), `UpdateSimFromVehicle` when in physics radius (:332) else removed (:339), `UpdateVehicleFromSim` (:356), `UpdateTerrainForNextStep` (:373); removed with the vehicle (:217-228).
- **Collision with vessels is live**: the vehicle body collides against this static like terrain. `BepuHandles.IsGroundSurface` treats it as ground (BepuHandles.cs:33-36); ground-impact events set `IsLaunchPad = (hitStatic == StaticObjectCollider)` (ConstraintSim.cs:1012-1014).
- Limitations: one static per vehicle at a time (nearest within 300 m); statics do not collide with each other or with clutter; the compound is per-static, shared across vehicles (Bepu static instances reference the same `TypedIndex`).

---

## 8. GLB → XML bundler (`KSA.GlbImport/StaticObjectAssetBundler.cs`)

Input discovery (`PartInputSet.FromDirectory`, PartInputSet.cs:31-49): files grouped by **stem = filename up to the first `_`** (:52-56). Per stem:
- `<Stem>_MeshAtlas.glb` → MeshAtlasGlb (:63-65)
- `*_Anim.glb` → animations (unused for statics)
- any `.glb` whose name contains `_Prefab` → `PrefabGlbs` (:71-73) — each becomes one `<StaticObject>`
- PNGs by substring (case-insensitive): `diffuse`, `normal`, `pbr`, `tfi` (+`tfi_heat`), `emissive`, `alpha` (:84-108)

`Build(setPrefix, set)` (StaticObjectAssetBundler.cs:15-53) emits, in order:
1. `<MeshAtlas Path="Meshes/<file>.glb" />` (:22-30)
2. `<PbrMaterial Id="<Stem>_Material">` with `<Diffuse|Normal|AoRoughMetal|ThinFilm|Emissive|Alpha Path="Textures/<png-stem>.ktx2" Category="Vessel" />` (:55-102). Normal is a `TexturePowerReference`. One material per stem.
3. One `<StaticSubObject>` per **top-level-eligible node** of the MeshAtlas glb: every node whose name does not start with `_` and does not end with `_VM` (:39-46). (Note: it iterates ALL nodes, not just roots, so any non-underscore, non-`_VM` node anywhere in the atlas becomes a sub-object; `_ColPrim`/`_Terrain` children are skipped by the `_` rule.)
4. One `<StaticObject>` per prefab glb (:48-51).

`SubObject(node)` (:104-130):
```xml
<StaticSubObject Id="{node.Name}">
  <PartModel Id="{node.Name}_Model">
    <Mesh Id="{node.Name}" />            <!-- mesh looked up by NAME from the MeshAtlas -->
    <Material Id="{Stem}_Material" />
    <Terrain>true</Terrain>              <!-- only if a DIRECT child node name starts with "_Terrain" (:180-196) -->
  </PartModel>
  <Collider Id="Collider1"> ... </Collider>   <!-- from DIRECT children named _ColPrim* (:198-215), omitted if none -->
</StaticSubObject>
```
Important: `<Mesh Id>` uses the **node** name, but `MeshAtlasFileReference` registers meshes by the glTF **mesh** name (MeshAtlasFileReference.cs:31-34, first-wins). Node name and mesh name must therefore match for sub-objects. The node's own transform in the atlas is ignored (mesh data is used as-is).

`StaticObject(prefab)` (:132-178):
```xml
<StaticObject Id="{prefab filename without .glb}">          <!-- e.g. CoreLaunchPadA_Prefab_LaunchPadA -->
  <SubObject Id="{meshName}" InstanceOf="{meshName with trailing [.digits] stripped}">
    <Transform><Position .../><Rotation .../><Scale .../></Transform>   <!-- omitted entirely if identity -->
  </SubObject>
  ...
  <Collider Id="Collider1">…</Collider>   <!-- from ALL nodes anywhere named _ColPrim* (:141-148, :172-176) -->
  <GroundOffset /><SurfaceHeight /><FootprintRadius />   <!-- empty; NaN attrs filtered -->
</StaticObject>
```
- For every node not starting with `_` that has a mesh: `Id = meshes[node.Mesh].Name`, `InstanceOf = Regex("[\.\d]+$") → ""` applied to that mesh name (:156-169, :217-227). So Blender-style duplicates `Foo.001`, `Foo1`, `Foo2` all instance `Foo`. (Beware: a base name legitimately ending in a digit, e.g. `PadB`, is fine, but `Pad2` would be stripped to `Pad`.)
- Transform = `GlbTransforms.BuildTransform(node)` (GlbTransforms.cs:13-29): raw glTF node TRS (no parent composition — prefab instance nodes are assumed to be root-level), rotation quaternion → XYZ-radians via the game's own `TransformReference.RotationValue` setter (:66-74), components rounded to 8 decimals, zero components omitted, Scale omitted when ≈1 (ε=1e-5).
- Prefab-level colliders: `_ColPrim*` nodes anywhere in the prefab, again using raw node-local TRS (no parent composition — `relativeTo = -1`).
- Colliders (`GlbColliders.BuildList`, GlbColliders.cs:30-145): marker node name prefix selects type: `_ColPrim_Box`, `_ColPrim_Sphere`, `_ColPrim_Capsule`, `_ColPrim_Cylinder`, `_ColPrim_Hull` (unknown → warning + skip). Sizes come from node **scale**: Box `LengthX/Y/Z = scale`; Sphere `Radius = 0.5·scale.X`; Cylinder/Capsule `LengthY = scale.Y`, `Radius = 0.5·scale.X` (X/Z must match within 1 % else skipped); Hull → `<Mesh Id>` = the marker's own mesh (mesh data name must equal the node name, single primitive; :214-236) with optional `<Scale>`. Ids are `"{Type}Collider{n}"` numbered per type; `LocationAsmb` = translation, `Collider2Asmb` = XYZ radians. Container id is always `"Collider1"`.
- Output serialized by `ToolXml.Write` with the banner comment "This file is autogenerated by GlbToXmlUtility from source assets." (ToolXml.cs:43-55). `_VM` (view-mesh) nodes are excluded from static sub-objects.
- Nothing in the bundler emits `<Terrain>` other than via the `_Terrain` child marker, and nothing emits GroundOffset/SurfaceHeight/FootprintRadius values.

Shipped naming: `CoreLaunchPadA_Subpart_FootpathA` (sub-object), `CoreLaunchPadA_Prefab_LaunchPadA` (static object) — the `Subpart_`/`Prefab_` tokens are **artist convention only**; the code keys on `_MeshAtlas.glb`, `_Prefab` in the glb filename, and leading `_` markers.

---

## 9. Shipped content summary

- `CoreLaunchPadAAssets.xml`: MeshAtlas + material (Diffuse/Normal/AoRoughMetal), 8 `<StaticSubObject>` (146 Box + 4 Cylinder colliders), 1 `<StaticObject Id="CoreLaunchPadA_Prefab_LaunchPadA">` with 16 `<SubObject>` (6 PipeSupportA instances share one template), 10 with `<Rotation>`, none with `<Scale>`.
- `CoreLaunchPadBAssets.xml`: material with `<Alpha>`; one sub-object `GravelTrimA` (Blended bucket), no colliders.
- `CoreLaunchPadCAssets.xml`: one sub-object `BaseGrassA` with `<Terrain>true</Terrain>` + 48 Box colliders.
- `CoreLaunchPadAGameData.xml`: GroundOffset 0.2 m, SurfaceHeight 1.5537 m, FootprintRadius 108.3 m.
- `Astronomicals.xml:1869-1880`: three `<Landmark IsLaunchPad="true" StaticObject="CoreLaunchPadA_Prefab_LaunchPadA">`.
- Shaders registered in `DefaultAssets.xml:57-58,61`.
