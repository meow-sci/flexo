# Scope — Ground clutter (data-only celestial mod)

> A separate mod type from part editing: flexo's `build-cartoon-moon.ts` generates a
> data-only KSA mod that adds a celestial body with `<GroundClutter>` (cards/meshes scattered
> on the terrain), using **no custom game code**. Reference scaffold for clutter modding.

**Baseline:** re-verified against KSA build **2026.7.5.4892** (decomp @ 4892 + shipped Core XML).
**Baseline status:** 🟢 **CURRENT (scaffold updated, in-game re-check pending)** — 4892 turned the
4826 mesh-atlas change load-bearing: every `<LOD>` now **requires `<Material Id/>` ID-references
after its `<Mesh>`** and the ecotype `<Material>` became an Id-carrying **list**, so the old
scaffold XML **throws at data load** (`GroundClutterLodReference.OnDataLoad`). Per the no-migration
rule, `build-cartoon-moon.ts` was switched entirely to the new form and the mod regenerated
(which also fixed a latent first-wins GLB mesh-name collision); see
[What changed in 4892](#what-changed-in-4892). No flexo core-editor code is involved (clutter is
hand-authored mod XML + a build script).

---

## Flexo modules

| Path                                  | Role                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/build-cartoon-moon.ts` (Bun) | Packs PNGs → one shared KTX2 atlas + per-face GLB cards, then regenerates `ksa-mods/cartoon-moon/`: a Luna-clone `<PlanetaryBody Id="Looney">` whose `<GroundClutter>` has one `<Ecotype>` with one `<ClutterObject>` per face. Key fns: `groundClutterXml`, `clutterObjectXml`, `lodsXml`, `buildBodyXml`, `buildMod`. |

## Game-side anchors (`decomp/KSA/`, `decomp/KSA.Terrain.Physics/`)

| Concern                                 | Class                                                                                                                                                                                                                               | Schema                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clutter schema (authored)               | `ClutterEcotypeReference.cs`, `GroundClutterReference.cs`, `GroundClutterMaterialReference.cs`, `GroundClutterPlacementReference.cs`, `GroundClutterLodReference.cs`, `ClutterObjectReference.cs`, `ClutterOrientationReference.cs` | `<GroundClutter><Ecotype><Placement/><ClutterObject><LODs><LOD><Mesh/><Material Id/>…</LOD></LODs></ClutterObject><Material Id>…</Material>…</Ecotype></GroundClutter>` |
| Render / physics (runtime, no `[Xml*]`) | `GroundClutterRenderer.cs`, `KSA.Terrain.Physics/ClutterEcotypePhysicalData.cs`                                                                                                                                                     | —                                                                                                                                                                       |

## The contract — what flexo bakes in

`<GroundClutter>` → `<Ecotype Name>` (a list — Core Earth now ships two) → optional `<Collideable Value>` → `<Placement Biomes>` (`ObjectSeparation M`, `GenerationRange M`, `MinScale/MaxScale`, `Orientation Mode="SurfaceNormal"`, `MinRotation/MaxRotation Degrees`, `DistributionTexture Id`, `DistributionTextureTiling Value`, `UseObjectTypeTexture Value`) → N× `<ClutterObject Name>` each with `<LODs>` of **exactly 5** `<LOD MinScreenSize>`, each LOD = `<Mesh Id Path/>` followed by **one `<Material Id/>` ID-reference per glTF material of the GLB** (a GLB with **no** `materials` array counts as **1**; order-matched to the GLB material order) → ecotype-level `<Material Id="…">` **list** (`<Diffuse>`, `<Normal>`, `<AoRoughMetal>`, optional `<Opacity>` for cutout cards, `UseTerrainMask`, `DoubleSided`, `CastShadows`, `ReceiveShadows`, `BiasNormalsUp`). Body registered via `<LoadFromLibrary>` in the system scenario.

**Baked engine quirks** (the data-only constraints):

- **Exactly 5 LODs** read unconditionally (`Lods[0..4]`).
- **LOD `<Material Id/>` refs are mandatory and validated** (`GroundClutterLodReference.OnDataLoad` **throws** on: missing/empty refs, a _concrete_ material definition on a LOD — all materials must be defined on the Ecotype and ID-referenced — and ref count ≠ the GLB's material count).
- **Ecotype `<Material>` entries need a unique authored `Id`** — an anonymous material registers as an unreferencable `Anon_<hash>`. Material ids live in the **global first-wins ModLibrary namespace**; Core now claims `EarthGrassClutterMaterial`, `Trunk`, `Leaves`, `Tree0Cards`, `Tree1Cards` — the scaffold uses the project-unique `CartoonMoonCrowdMaterial`.
- **Clutter meshes register globally by GLB mesh name** (first-wins; `_`-prefixed names skipped) → each GLB needs a **unique glTF mesh name**; the scaffold uses `<name>Card` and matches `<Mesh Id>` to it.
- **`Collideable` forbids `Orientation Mode="SurfaceNormalSmooth"`** (`ClutterEcotypeReference.ToParameters` throws — use `SurfaceNormal`).
- Synthetic **flat-Normal + neutral-ORM** maps required (the renderer dereferences them — same family of quirk as the part thumbnail renderer).
- **One Ecotype for the mixed-face crowd** (placement RNG is seeded by cell position, so ecotypes with identical placement params scatter at identical spots and z-fight; multi-ecotype is fine when placements differ — Core Earth's Grass vs Tree) + a **spare ClutterObject** (objectId off-by-one).
- **Diffuse authored ~×0.5** brightness (KSA decodes clutter diffuse ~×2).
- **Opacity** cut where R < 0.5 (cutout cards).
- First-wins + core-first load order, so a clutter mod can **add** a body & reuse textures by `Id`.
- Loading is gated by the scenario's `<LoadFromLibrary>`.

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
