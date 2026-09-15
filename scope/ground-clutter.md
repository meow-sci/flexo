# Scope — Ground clutter (data-only celestial mod)

> A separate mod type from part editing: flexo's `build-cartoon-moon.ts` generates a
> data-only KSA mod that adds a celestial body with `<GroundClutter>` (cards/meshes scattered
> on the terrain), using **no custom game code**. Reference scaffold for clutter modding.

**Baseline:** re-verified against KSA build **2026.9.10.5438** (decomp + shipped Core XML).
**Baseline status:** 🔴 **HISTORICAL BREAKING GAP R1 — scaffold still uses pre-5168 XML.**
The current clutter schema is unchanged from 5402, but `scripts/build-cartoon-moon.ts`
still emits inline `<ClutterObject Name>` definitions and ecotype-level `<Material>` entries.
The current loader requires top-level asset definitions and id references; see the current
contract below and [What changed in 5168](#what-changed-in-5168). This is a pre-existing
scaffold limitation, not a new 5438 regression, and it does not affect the part editor.

---

## Flexo modules

| Path                                  | Role                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/build-cartoon-moon.ts` (Bun) | Packs PNGs → one shared KTX2 atlas + per-face GLB cards, then regenerates `ksa-mods/cartoon-moon/`: a Luna-clone `<PlanetaryBody Id="Looney">` whose `<GroundClutter>` has one `<Ecotype>` with one `<ClutterObject>` per face. Key fns: `groundClutterXml`, `clutterObjectXml`, `lodsXml`, `buildBodyXml`, `buildMod`. |

## Game-side anchors (`decomp/KSA/`, `decomp/KSA.Terrain.Physics/`)

| Concern                                 | Class                                                                                                                                                                                                                              | Schema                                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clutter schema (authored)               | `ClutterEcotypeReference.cs`, `GroundClutterReference.cs`, `GroundClutterMaterialReference.cs`, `GroundClutterPlacementReference.cs`, `GroundClutterLodReference.cs`, `ClutterObjectTemplate.cs`, `ClutterOrientationReference.cs` | Top-level `<ClutterObject Id Atlas>` / `<GroundClutterMaterial Id>` assets; `<GroundClutter><Ecotype><Placement/><ClutterObject Id/>…</Ecotype></GroundClutter>` |
| Render / physics (runtime, no `[Xml*]`) | `GroundClutterRenderer.cs`, `KSA.Terrain.Physics/ClutterEcotypePhysicalData.cs`                                                                                                                                                    | —                                                                                                                                                                |

## The contract — what flexo bakes in

The current loader uses the asset bundler (`decomp/KSA/AssetBundle.cs`):

- Top-level `<ClutterObject Id Atlas>` (`ClutterObjectTemplate`) declares `<LODs>` with
  exactly five `<LOD MinScreenSize CastShadows>` entries, optional `<Colliders>` containing
  `Box`/`Capsule`/`Cylinder`/`Sphere`/`ConvexHull`, and repeated
  `<Substance Id><Volume M3/></Substance>`. `<ClutterObjectGameData Id>` replaces its substance
  list when nonempty. Collider mass is density × substance volume, scaled cubically at runtime.
- Top-level `<GroundClutterMaterial Id>` assets carry the material definitions. A LOD contains
  one or more `<Mesh Id/>` references and ordered `<Material Id/>` references; `Path` is not
  part of the LOD mesh contract. `GroundClutterLodReference.BuildMaterialIndirection` requires
  the material count to match the **distinct atlas material indices used by its meshes**,
  ordered by increasing atlas index. Missing materials, concrete definitions in a LOD, and
  mismatched counts throw. Materials must be defined as assets, not inside the ecotype.
- A body's `<GroundClutter><Ecotype Name>` references those assets with `<ClutterObject Id/>`.
  Its material list is derived by `ClutterEcotypeReference.PopulateMaterialReferences`, not
  authored. Optional `<CollisionType Value="None|PrimitiveList|Mesh">` defaults to None.
  `<Placement Biomes>` retains `ObjectSeparation M`, `GenerationRange M`, `MinScale/MaxScale`,
  `Orientation Mode`, `MinRotation/MaxRotation Degrees`, `DistributionTexture Id`,
  `DistributionTextureTiling Value`, `UseObjectTypeTexture Value`, slope masks and altitude curve.
- Collideable ecotypes require uniform scales and forbid `SurfaceNormalSmooth`; scale is
  quantized to 16 values. Meshes register by GLB mesh name, first-wins, including underscore
  names since 5261. Use unique ids for meshes/materials/objects and load the body through the
  chosen system scenario. Opacity is a cutout channel; supply the normal and ORM maps required
  by the renderer.

The scaffold's current old-form XML and spare-object workaround are historical implementation
facts, **not valid current contract rules**. R1 requires replacing that generated form wholesale;
no migration or dual-schema output. Current material-count and id rules supersede the 4892
historical sections below.

## What changed in 5438

**No new schema gap.** `GroundClutterReference`, `GroundClutterPlacementReference`,
`GroundClutterPlacementData`, `ClutterEcotypeReference`, `ClutterObjectTemplate`,
`ClutterObjectGameDataReference`, `GroundClutterLodReference`, `GroundClutterMaterialReference`
and `ClutterOrientationReference` are byte-identical to 5402; `Content/Core/GroundClutter/`
is unchanged. `GroundClutterRenderer` only renames locals in shadow-distance calculations.
The common analytic collider classes now report volume for the part crash model, but clutter
still derives its mass from `<Substance><Volume M3>` and its template schema is unchanged.

This review corrects the stale lead status/contract above, which previously called the scaffold
unaffected even though its own 5168 section recorded the load-breaking R1 gap. R1 remains
historical backlog; no part-editor schema bump follows from this area.

## What changed in 5402

**Schema unchanged; runtime classes moved.** `GroundClutterReference` and every sibling
`*Reference` schema class are byte-identical, and nothing under `Content/Core/GroundClutter/`
changed. The runtime side did move — `ClutterEcotypePhysicalData`, `ClutterEcotypeRenderData`,
`GroundClutterRenderer` and `BubbleClutterStatics` are in the diff — but they were not read further
in this review (the scaffold already does not load: gap **R1** stands as at 5348).

---

## What changed in 5348

**Clutter objects gained mass, via a new GameData asset and a substance library** (revs 5304–5307),
which widens gap **R1** again — the scaffold already does not load.

- `AssetBundle` gained `[XmlElement("ClutterObjectGameData", typeof(ClutterObjectGameDataReference))]`,
  a **separate GameData document** for clutter, mirroring how parts split assets from game data.
  Core ships it as `Content/Core/GroundClutter/_GameData.xml`, plus a new
  `GroundClutter/_Materials.xml` substance library; both are listed in `mod.toml`.
- `ClutterObjectTemplate` gained a repeatable `[XmlElement("Substance")] List<ClutterSubstanceReference>`.
  Each entry is `<Substance Id="Rock.Anorthosite"><Volume M3="3227"/></Substance>`;
  `MassKg = Solid.StorageDensity * Volume.InMetersCubed()` and `GetMass(scale)` cubes the scale.
- Rev 5307 makes destruction energy-gated (25 J/kg by default) and **logs a warning when a
  collideable clutter object has no mass**, so a collideable object now needs a `<Substance>`.
- Rev 5263 temporarily removed the three smallest shrub types (no colliders yet); rev 5345 fixed
  two off-by-one errors that made the last object type and last scale in an ecotype exceedingly
  rare, and raised the grass ecotype's object separation 1.3 → 1.45 m.

Still scaffold-only — `ksa-mods/cartoon-moon/` and `scripts/build-cartoon-moon.ts` are the entire
flexo surface, and no part-editor code is involved.

---

## What changed in 5261

**Verdict: gap R1 still OPEN, and slightly wider.** No new schema _shape_, but two content/feature
revs extend what the scaffold must emit once R1 is addressed:

- **Rev 5185** added asset-bundler support for **convex hull shapes** and gave the clutter rocks
  convex-hull colliders. `ClutterObjectTemplate` gained
  `[XmlArrayItem("ConvexHull", typeof(ConvexHullColliderTemplate))]` inside its `<Colliders>` array,
  and `Content/Core/GroundClutter/GenericRockAssets.xml` is the only shipped file authoring one.
  The same rev also **removed** the mesh-atlas rule that skipped loading meshes whose name starts
  with `_` — the atlas now stores every mesh, because clutter references them to build its own data.
  (The collider class itself is documented in [colliders.md](colliders.md#what-changed-in-5261).)
- **Rev 5205** gave every tree except the tiny shrubs colliders, and fixed LOD distances not being
  set beyond the defaults for tree types past 3.

`GroundClutterReference` and its sibling schema classes are otherwise unchanged from 5168, so the
fix framed there — switching `scripts/build-cartoon-moon.ts` wholesale to the bundler form — is
still the whole of R1; it now just has an optional `<ConvexHull>` collider it _may_ emit.

## What changed in 5168

**Verdict: 🔴 BREAKING for the `ksa-mods/cartoon-moon/` scaffold.** Revs 5136-5138 and 5157
reworked ground clutter end-to-end: it now loads through the **asset bundler**, the same path parts
use. This is by far the largest contract movement in 5168, and it is entirely contained to this
scaffold — **no part-editor code is involved**, which is why the overall 5168 verdict elsewhere is
intact.

What moved, class by class:

- **`ClutterObjectReference` → `ClutterObjectTemplate`** (renamed _and_ re-homed). It is now a
  `SerializedId` **top-level asset**, registered in `ModLibrary.AllClutterObjects` and declared in
  an `<Assets>` bundle via the new `[XmlElement("ClutterObject", typeof(ClutterObjectTemplate))]` on
  `AssetBundle`. It carries `[XmlAttribute("Atlas")] AtlasId`, an `[XmlArray("LODs")]` /
  `[XmlArrayItem("LOD")]` list, and a new `[XmlArray("Colliders")]` with
  `Box`/`Capsule`/`Cylinder`/`Sphere` items (rev 5157, reusing the part `ColliderTemplate` classes).
- **The ecotype now references clutter objects by ID.** `ClutterEcotypeReference.ClutterObjects` is
  a `List<ClutterObjectTemplate>` resolved in `OnDataLoad` via `ClutterObjects[i] = ClutterObjects[i].Get()`
  (an `ModLibrary.Get<ClutterObjectTemplate>(Id)` lookup) — so `<ClutterObject>` under an `<Ecotype>`
  is now an _id reference_, not an inline definition.
- **The ecotype's `<Material>` list is gone from the schema.** `MaterialReferences` moved from
  `[XmlElement("Material")]` to **`[XmlIgnore]`** and is now derived by the new
  `PopulateMaterialReferences()`, which walks every LOD's materials and dedupes by hash. Authoring
  `<Material>` on an ecotype is now silently ignored. `GroundClutterMaterial` became its own
  top-level asset element instead.
- **`<LOD><Mesh>` changed shape.** `GroundClutterLodReference.MeshFileReference`
  (a `MeshAtlasFileReference`) became **`MeshIds`, a `List<SerializedReference>`** — meshes are now
  resolved by id out of the object's atlas rather than each LOD naming its own atlas file. The
  derived `MaterialReferencesCount` / `MeshesMaterialCount` helpers were replaced by an internal
  `_atlasToLocalMaterial` remap, and `CastShadows` gained `[DefaultValue(true)]`.
- **Exactly 5 LODs are now required** — `ClutterObjectTemplate.IsValid()` errors with
  "defines N LODs. Exactly 5 are required".
- **A real validation bug was fixed** (rev 5135): `ClutterEcotypeReference.IsValid()`'s uniform-scale
  check went from `Collideable && (flag2 || !flag3)` to `Collideable && (!flag2 || !flag3)` — it was
  previously rejecting uniform `MinScale` instead of non-uniform.
- **Content:** every clutter asset was reprocessed through the bundler. Textures are now all KTX2
  (diffuse now includes the alpha channel; new **Opacity** and **Thickness** BC4 maps), the
  individual clutter model XMLs were removed, and Core's `mod.toml` now lists
  `GroundClutter/GenericRockAssets.xml`, `GroundClutter/GrassAssets.xml` and
  `GroundClutter/EarthTreesAssets.xml`. `Solid.frag` gained gamma correction keyed off diffuse alpha
  because the bundler emits linear textures.

**Consequence:** `scripts/build-cartoon-moon.ts` emits the 5117-era form — inline `<ClutterObject>`
definitions inside the ecotype, per-LOD `<Mesh>` atlas paths, and ecotype-level `<Material Id/>`
lists — none of which the 5168 loader accepts. Per the no-migration rule the generator must be
**switched wholesale** to the new form (top-level `<ClutterObject Id Atlas>` assets + id references
from the ecotype + 5 LODs + id-referenced meshes), not taught to emit both. Tracked as a gap in
[plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md); the scaffold is a reference
mod, not part of the editor, so this blocks nothing else.

---

## What changed in 5117

**One renamed element (`<Collideable>` → `<CollisionType>`) plus two new authoring rules. The
scaffold emits none of them, so this is docs-only (gap Q3).**

Rev 5099 ("Split 'Collideable' into three collideable types 'None', 'PrimitiveList' and 'Mesh'
ahead of bepu integration") changed `decomp/KSA/ClutterEcotypeReference.cs`:

```csharp
-   [XmlElement("Collideable")]
-   public BoolReference Collideable = new BoolReference(value: false);
+   [XmlElement("CollisionType")]
+   public ClutterCollisionTypeReference CollisionType =
+       new ClutterCollisionTypeReference(ClutterEcotypePhysicalData.CollisionType.None);
+
+   [XmlIgnore]
+   public bool Collideable => CollisionType.Type != ClutterEcotypePhysicalData.CollisionType.None;
```

The new `decomp/KSA/ClutterCollisionTypeReference.cs` is a one-field `IDataReference`:
`[XmlAttribute("Value")] ClutterEcotypePhysicalData.CollisionType Type` (enum
`None` | `PrimitiveList` | `Mesh`, default `None`), validated by `Enum.IsDefined`. So the
authored form went from `<Collideable Value="true"/>` to
`<CollisionType Value="Mesh"/>`. Everything downstream still keys off the derived
`Collideable` bool — the `SurfaceNormalSmooth` throw and the `SnapToMesh` inversion are unchanged.

Two rules landed alongside it:

- **Uniform scale is now required for collideable ecotypes.** `ClutterEcotypeReference.IsValid`
  fails with _"is collideable and has non-uniform scale"_ (rev 5098's "Added a warning for
  non-uniform scale for collideable ground clutter objects").
- **Scale is quantized to 16 discrete steps.** `GroundClutterPlacementReference.ToParameters`
  now builds an `EcotypeScalesArray` of 16 `Lerp(MinScale, MaxScale, i/15)` entries instead of
  passing the min/max pair (rev 5098, for Bepu). **Runtime only — no schema change**;
  `<MinScale>`/`<MaxScale>` are authored exactly as before.

**Impact on flexo: none in code.** `scripts/build-cartoon-moon.ts` emits `<Placement>` with
uniform `MinScale`/`MaxScale` (6/6/6 → 12/12/12), `Orientation Mode="SurfaceNormal"` and **no**
collision element at all, so it is valid under both spellings. The 7 schema classes are otherwise
unchanged (`ClutterObjectReference` moved by one log line number only), and first-wins + core-first
load order still holds. Also new but outside this surface: `<Landmark IsLaunchPad="true">`
(`LandmarkReference.cs`) with a clutter **exclusion zone** around launch pads — a celestial/landmark
authoring surface flexo does not model.

## What changed in 5056

**Four additive placement fields; no break, but the scaffold does not emit them yet (gap P3).**
rev 5041 ("Masked trees by slope and altitude…; Added altitude density curve and LUT to ground
clutter with res 1024") added to `decomp/KSA/GroundClutterPlacementReference.cs`:

```csharp
[XmlElement("SlopeMaskStrength")] public FloatReference SlopeMaskStrength = new(0f);
[XmlElement("SlopeMaskContrast")] public FloatReference SlopeMaskContrast = new(1f);
[XmlElement("SlopeMaskBias")]     public FloatReference SlopeMaskBias     = new(0f);
[XmlElement("AltitudeDensityCurve")] // a CubicHermiteSpline, edited via CubicHermiteSplineEditor
```

Shipped usage is in `Content/Core/Astronomicals.xml` (`<SlopeMask*>` ×4 each,
`<AltitudeDensityCurve>` ×3 with `<SplinePoint>`/`<Key>`/`<InTangent>`/`<OutTangent>`/`<Value>`
children), plus a `<Collideable Value="true"/>` ecotype flag and `<GenerationRange>`. rev 5044
also made "collideable"-tagged ecotypes deterministic (no regeneration) and re-enabled clutter on
the Moon and Mars.

**Severity: 🟡 additive only.** Every default is inert (`SlopeMaskStrength = 0` disables the mask;
an absent curve means uniform density), so the existing `ksa-mods/cartoon-moon/` scaffold still
loads and behaves as before. Emitting them is an enhancement, not a fix — filed as **P3**.
`ClutterObjectReference.cs`'s ≤5-LOD rule and the `<Material Id/>`-per-LOD requirement are
unchanged, and `GroundClutterReference.cs` itself did not move.

## What changed in 5018

One additive, optional schema field; **no flexo code change and the cartoon-moon scaffold is
unchanged**.

### `<LOD CastShadows>` (revs 5009–5011)

`GroundClutterLodReference` gained `[XmlAttribute] public bool CastShadows = true`, so a LOD
can opt OUT of the ground-clutter shadow pass:

```xml
<LOD CastShadows="false" Distance="...">…</LOD>
```

Default `true` ⇒ omitting it preserves today's behavior, which is why the scaffold still
loads unchanged. It is a cheap perf lever for the far LODs (Core uses it to drop distant
tree instances from shadow casting) and is worth applying during the still-open clutter LOD
retune — filed as gap **F14** / **H** rather than done blind, since tuning it without an
in-game look would be guesswork.

Nothing else in the clutter schema changed: `GroundClutterReference.cs` and its six sibling
schema classes are otherwise unchanged from 4980. Earth gained three small tree variants and
a forest distribution texture — content, not contract.

## What changed in 4980

**Schema INTACT; scaffold retagged for the new `TerrainHeight` texture category.** All 7
`*Reference.cs` clutter schema classes are again absent from the 4939→4980 diff. The clutter
churn is renderer-only: per-cascade shadow culling (rev 4966/4967 — `CullInstances.comp` split
into shadow/non-shadow mains, draw-command ownership moved `ClutterEcotypeRenderData` →
`ClutterViewResources`), and the non-uniform-indexing extension enabled for clutter/terrain
shaders (rev 4960, fixes device-specific flicker) — none of it touches the mod XML contract.

The data-side delta is celestial: rev 4947 added **`TextureCategory.TerrainHeight`** for
textures that affect height calculations (exempt from the terrain-texture max-size downmip, so
rendered and collided terrain stay aligned), and Core's `Astronomicals.xml` retagged every
height-affecting celestial texture (`<Height>`, `<Normal>`, `<BiomeIDMap>`,
`<BiomeControlMap>`, decal `<HeightMap>`, height-modifier `<Texture>`) `Terrain` →
`TerrainHeight` (clutter card/ground-material textures stay `Terrain`). The scaffold's
Luna-clone block carried the old tags, so `ksa-mods/cartoon-moon/assets/cartoon_moon.xml` was
retagged to match (5 lines — Luna_Normal / Luna_Height / Luna_Biome_ID / Luna_Biome_Control /
LunaTestDecalHeight). `build-cartoon-moon.ts` needs **no change**: it clones the
`<PlanetaryBody Id="Luna">` block verbatim from the caller's Astronomicals.xml, so the next
regeneration against 4980 Core produces the same tags; its hardcoded clutter textures correctly
stay `Terrain`. The 4939 LOD `MinScreenSize` retune advisory + in-game re-check remain pending.

## What changed in 4939

**Schema INTACT; LOD-selection behavior changed (scaffold retune advisory).** All 7 `*Reference.cs`
schema classes (`GroundClutterReference` et al.) are absent from the 4892→4939 diff — the
`<GroundClutter>`/Ecotype/LOD/`<Material Id>` contract from 4892 holds. Rev 4901 reworked the
RENDERER: culling split into prepare/cull compute passes (`ClutterViewResources`, per-view
culling, `Evaluate.comp`/`BuildDispatchCommands.comp` deleted), shadow culling added, and —
load-bearing for mods — **bounding-sphere radius + LOD selection were FIXED**, so Core retuned
every clutter `<LOD MinScreenSize>` in `Astronomicals.xml` (~4×: 128→512, 64→316, 32→256 …) and
added real Lod2/Lod3 meshes. The cartoon-moon scaffold still LOADS fine, but its `MinScreenSize`
values were tuned against the old buggy selection — expect different pop-in distances until
retuned to Core's new scale (`scripts/build-cartoon-moon.ts`). In-game re-check (already pending
from 4892) should cover this.

## What changed in 4892

**Multi-material clutter renderer — the LOD/material contract is now explicit and validated
(BREAKING for old-schema XML).** Decomp diff (`ksa-game-assemblies_prev` @ 4826 →
`ksa-game-assemblies` @ 4892):

- **`GroundClutterLodReference`** gained `[XmlElement("Material")] List<GroundClutterMaterialReference>? MaterialReferences`.
  Its `OnDataLoad` now **throws** when refs are missing/empty ("No material references defined" —
  i.e. **pre-4892 XML hard-fails at data load**), when a LOD carries a _concrete_ material
  definition ("All materials must be defined in the Ecotype, then ID-Referenced by the LOD"), and
  when `MaterialReferencesCount != MeshesMaterialCount` (`MeshAtlasFileReference.MaterialCount` =
  the GLB's glTF `materials`-array length, **default 1 when the array is absent**).
- **`ClutterEcotypeReference.MaterialReferences`** is now a `List<GroundClutterMaterialReference>`
  (was a single `MaterialReference` field, same `<Material>` element name). Each entry needs a
  unique authored `Id` — `PbrMaterialReference.OnDataLoad` assigns unreferencable `Anon_<hash>`
  ids to anonymous ones — and registers in the global first-wins material namespace. (The
  **Collideable × `SurfaceNormalSmooth` throw** in `ToParameters` predates 4892 — it was already
  in 4826 — but is now recorded in the contract above.)
- **`MeshReference.PrimitiveMaterialIds`** (new) records each primitive's glTF material index, so
  the renderer can bind each primitive to its LOD material-ref slot — the mechanism the
  count/order contract feeds.
- **Core Earth now ships a second ecotype** (`Tree`, two tree `ClutterObject`s whose near LODs use
  two material refs `Trunk`+`Leaves` and far LODs one `Tree0Cards`/`Tree1Cards`) — multi-ecotype
  per body is shipped practice, and Core thereby claims `EarthGrassClutterMaterial`, `Trunk`,
  `Leaves`, `Tree0Cards`, `Tree1Cards` in the global material-id namespace.

**Scaffold fixes** (`scripts/build-cartoon-moon.ts`, mod regenerated — no back-compat per the
no-migration rule):

- `lodsXml` now emits exactly one `<Material Id="CartoonMoonCrowdMaterial"/>` after each LOD's
  `<Mesh>` (the card GLBs have no glTF `materials` array → count 1).
- The ecotype `<Material>` carries `Id="CartoonMoonCrowdMaterial"` (project-unique vs Core's
  claimed ids).
- **Latent defect fixed:** every generated GLB used to name its mesh the constant `card` — since
  4826 the loader registers clutter meshes globally by GLB mesh name with first-wins dedupe, so
  all characters resolved to the FIRST loaded card's geometry/tile. `packGlb` now takes a
  per-character mesh name (`<name>Card`), and `<Mesh Id>` matches that name.

## What changed in 4826

**`GroundClutterLodReference` mesh reference: single mesh → mesh atlas.** Decomp diff
(`ksa-game-assemblies_prev` @ 4750 → `ksa-game-assemblies` @ 4826):

- 4750: `[XmlElement("Mesh")] public MeshFileReference? MeshFileReference;` + `public MeshReference Mesh;` (loaded the one mesh in the referenced GLB).
- 4826: `[XmlElement("Mesh")] public MeshAtlasFileReference? MeshFileReference;` + `public List<MeshReference> Meshes => MeshFileReference.Meshes;`. `MeshAtlasFileReference.DoLoad()` iterates **every** GLB mesh node (skipping `_`-prefixed names), each registered under its **GLB node name**.

The XML element stays `<Mesh>` and both `MeshFileReference`/`MeshAtlasFileReference` inherit `Id`/`Path`
from `FileReference`, so `ksa-mods/cartoon-moon/`'s `<LOD><Mesh Id="Archer_LOD0" Path="…ArcherCard.glb"/></LOD>`
**still deserializes**. What shifted: the LOD now loads a whole atlas rather than one mesh, and the
mesh id comes from the GLB node name, not the `<Mesh Id>`. For a single-mesh card GLB this is
functionally the same **iff** the node isn't `_`-prefixed. **Action: re-verify the cartoon-moon mod
loads and renders in 4826** — it's a scaffold, not flexo core (no source change), so at most
`scripts/build-cartoon-moon.ts` or the mod XML may need a mesh-node-name tweak.

Sibling clutter refs (`ClutterEcotypeReference`, `ClutterObjectReference`) only gained a
`GetNumMeshPrimitives()` helper (multi-primitive counting); `GroundClutterMaterialReference` swapped a
`MaterialFlags` enum for `PopulateShaderMacros` (shader-macro generation, not authored schema).

## What changed in 4750

- ✅ All seven authored-schema classes (`ClutterEcotypeReference`, `GroundClutterReference`, `GroundClutterMaterialReference`, `GroundClutterPlacementReference`, `GroundClutterLodReference`, `ClutterObjectReference`, `ClutterOrientationReference`) = **zero diff**. The cartoon-moon `<GroundClutter>` scaffold is fully current.
- ✅ `GroundClutterRenderer.cs` diff = `Brutal.ShaderCompilerApi`→`Brutal.ShaderCApi` + macro-API + log line shifts. _COSMETIC._
- ✅ `ClutterEcotypePhysicalData.cs` = pure runtime GPU/physics buffer management (no `[Xml*]`; cell reallocation, double-buffering). Not an authored schema. _NONE._
