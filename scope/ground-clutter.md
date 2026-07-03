# Scope — Ground clutter (data-only celestial mod)

> A separate mod type from part editing: flexo's `build-cartoon-moon.ts` generates a
> data-only KSA mod that adds a celestial body with `<GroundClutter>` (cards/meshes scattered
> on the terrain), using **no custom game code**. Reference scaffold for clutter modding.

**Baseline:** re-vetted against KSA build **2026.7.3.4826** (decomp @ 4826 + shipped Core XML).
**Baseline status:** 🟡 **WATCH (scaffold only)** — six of the seven authored-schema classes are
unchanged, but **`GroundClutterLodReference` changed its LOD mesh from a single `MeshFileReference`
to a `MeshAtlasFileReference` (a `Meshes` list)** in 4826. The `<Mesh Id Path/>` element + attrs are
unchanged (both inherit `FileReference`), so the cartoon-moon scaffold still _parses_ — but its
per-LOD single-card semantics shifted, so **re-verify it in-game** (see
[What changed in 4826](#what-changed-in-4826)). No flexo core-editor code is involved (clutter is
hand-authored mod XML + a build script).

---

## Flexo modules

| Path                                  | Role                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/build-cartoon-moon.ts` (Bun) | Packs PNGs → one shared KTX2 atlas + per-face GLB cards, then regenerates `ksa-mods/cartoon-moon/`: a Luna-clone `<PlanetaryBody Id="Looney">` whose `<GroundClutter>` has one `<Ecotype>` with one `<ClutterObject>` per face. Key fns: `groundClutterXml`, `clutterObjectXml`, `lodsXml`, `buildBodyXml`, `buildMod`. |

## Game-side anchors (`decomp/KSA/`, `decomp/KSA.Terrain.Physics/`)

| Concern                                 | Class                                                                                                                                                                                                                               | Schema                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clutter schema (authored)               | `ClutterEcotypeReference.cs`, `GroundClutterReference.cs`, `GroundClutterMaterialReference.cs`, `GroundClutterPlacementReference.cs`, `GroundClutterLodReference.cs`, `ClutterObjectReference.cs`, `ClutterOrientationReference.cs` | `<GroundClutter><Ecotype><Placement/><ClutterObject><LODs><LOD><Mesh/></LOD></LODs></ClutterObject><Material>…</Material></Ecotype></GroundClutter>` |
| Render / physics (runtime, no `[Xml*]`) | `GroundClutterRenderer.cs`, `KSA.Terrain.Physics/ClutterEcotypePhysicalData.cs`                                                                                                                                                     | —                                                                                                                                                    |

## The contract — what flexo bakes in

`<GroundClutter>` → one `<Ecotype Name>` → `<Placement Biomes>` (`ObjectSeparation M`, `GenerationRange M`, `MinScale/MaxScale`, `Orientation Mode="SurfaceNormal"`, `MinRotation/MaxRotation Degrees`, `DistributionTexture Id`, `DistributionTextureTiling Value`, `UseObjectTypeTexture Value`) → N× `<ClutterObject Name>` each with `<LODs>` of **exactly 5** `<LOD MinScreenSize><Mesh Id Path/></LOD>` → `<Material>` (`<Diffuse>`, `<Normal>`, `<AoRoughMetal>`, optional `<Opacity>` for cutout cards, `UseTerrainMask`, `DoubleSided`, `CastShadows`, `ReceiveShadows`, `BiasNormalsUp`). Body registered via `<LoadFromLibrary>` in the system scenario.

**Baked engine quirks** (the data-only constraints):

- **Exactly 5 LODs** read unconditionally (`Lods[0..4]`).
- Synthetic **flat-Normal + neutral-ORM** maps required (the renderer dereferences them — same family of quirk as the part thumbnail renderer).
- **One Ecotype only** (placement RNG seeded by cell position) + a **spare ClutterObject** (objectId off-by-one).
- **Diffuse authored ~×0.5** brightness (KSA decodes clutter diffuse ~×2).
- **Opacity** cut where R < 0.5 (cutout cards).
- First-wins + core-first load order, so a clutter mod can **add** a body & reuse textures by `Id`.
- Loading is gated by the scenario's `<LoadFromLibrary>`.

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
