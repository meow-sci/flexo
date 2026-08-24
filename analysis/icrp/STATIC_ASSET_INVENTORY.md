# KSA static objects (launch pads) — asset inventory (build 2026.8.22.5348)

Sources: `/Users/asherwin/repos/meow-sci/ksa-linux/Content/Core` (full install),
`/Users/asherwin/repos/meow-sci/flexo-private-assets` (flexo binary subset),
`/Users/asherwin/repos/meow-sci/ksa-game-assemblies/current` (XML/shaders + decomp).
Parsers used: `scratchpad/glb.mjs`, `scratchpad/ktx2.mjs` (raw outputs in `glb_*.txt`, `ktx2.md`).

## 1. Coverage diff

### Files in ksa-linux that are static-object related

| File (Core-relative)                                                                                                                                                                                                                                                  | Size                                                                        | In flexo-private-assets | In ksa-game-assemblies/current/Content |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------- | -------------------------------------- |
| CoreLaunchPadAAssets.xml (8 SubObjects + prefab, 146 Box/4 Cyl colliders)                                                                                                                                                                                             | 45 KB                                                                       | NO                      | yes                                    |
| CoreLaunchPadAGameData.xml (GroundOffset/SurfaceHeight/FootprintRadius)                                                                                                                                                                                               | 207 B                                                                       | NO                      | yes                                    |
| CoreLaunchPadBAssets.xml (1 SubObject, has `<Alpha>`)                                                                                                                                                                                                                 | 891 B                                                                       | NO                      | yes                                    |
| CoreLaunchPadCAssets.xml (1 SubObject, `<Terrain>true</Terrain>`, 48 Box/1 Cyl)                                                                                                                                                                                       | 14 KB                                                                       | NO                      | yes                                    |
| Meshes/CoreLaunchPad{A,B,C}_MeshAtlas.glb                                                                                                                                                                                                                             | 463 K / 35 K / 111 K                                                        | NO                      | no (binaries stripped by design)       |
| Meshes/launchpad.glb                                                                                                                                                                                                                                                  | 2 KB                                                                        | NO                      | no                                     |
| Textures/CoreLaunchPad{A,B,C}_TextureAtlas_{Diffuse,Normal,PBR}.ktx2 (+ B `_Alpha`)                                                                                                                                                                                   | 10 files, 1.3–5.1 MB                                                        | NO                      | no                                     |
| Shaders/Mesh/StaticObject.vert/.frag                                                                                                                                                                                                                                  | 42 / 366 lines                                                              | n/a                     | yes                                    |
| Shaders/StaticCelestialDistance.vert/.frag                                                                                                                                                                                                                            | (NOT a static-object shader — distant-body/star octagon sprite PSF; ignore) | n/a                     | yes                                    |
| Textures/Planets/_Decals/circle.dds (BC4U 128×128, terrain HeightMap decal for the 5 launch-site `<Modifier Type="Decal">` in Astronomicals.xml)                                                                                                                      | 11 KB                                                                       | NO                      | no                                     |
| DefaultAssets.xml (Shader Ids `StaticObjectVert/Frag`), mod.toml (lists the 4 LaunchPad XML), Astronomicals.xml (`<Landmark IsLaunchPad="true" StaticObject="CoreLaunchPadA_Prefab_LaunchPadA">` ×5: CCSFS LC-39A, VSFB LC-4, Starbase OLM A, GSC ELA-4, Māhia LC-1A) | —                                                                           | NO                      | yes                                    |

`Meshes/launchpad.glb` (generator "KSA add_uvs.py (from COLLADA2GLTF box)", dated Aug 6, one 1 m unit cube, material "DarkGray" 0.03 grey, root node matrix rotates Y↔Z) is referenced by **nothing** in Content or decomp — legacy placeholder, safe to ignore.

### Why flexo-private-assets misses them

`copy-assets.ts` discovery predicate: `isAssets && (hasParts || isReactionLibrary || isSolidMotorLibrary)` with
`hasParts = /<(Part|SubPart)[\s>]/`. The LaunchPad XML contain `<StaticSubObject`, `<StaticObject`, `<PartModel` — none match (`<Part` is followed by `M`, `<SubPart` never appears). So the XML is skipped, and therefore its `Path="…"` binary refs (GLB + KTX2) are never collected. GameData sibling is only found via the Assets file, so `CoreLaunchPadAGameData.xml` is skipped too.

**Required change (copy-assets.ts):**

```ts
const hasParts = /<(Part|SubPart|StaticObject|StaticSubObject|StaticObjectGameData)[\s>]/.test(
  text,
);
```

That alone pulls: 4 XML + 3 GLB + 10 KTX2 (all `Path=` refs are `Meshes/*.glb` / `Textures/*.ktx2`, already-handled extensions). Optionally add `Textures/Planets/_Decals` to `COPY_DIRS` if the editor wants the terrain-decal footprint disc (DDS is already in BINARY_EXTENSIONS but it is referenced from Astronomicals.xml, which the scan never reads). `launchpad.glb` needs nothing.
Note the script is still Bun (`import { Glob } from 'bun'`, `Bun.file`) — unmigrated legacy, per memory.

**ksa-game-assemblies/copy-ksa.ts** needs **no change**: it `cp -R`s the whole Content folder then deletes Fonts/Versions and strips `ktx2 png ttf dds jpg ogg wav glb gltf bin` — so the LaunchPad XML + StaticObject shaders are already there; the binaries are intentionally absent.

### Decomp completeness

`copy-ksa.ts` decompiles every DLL matching `Brutal*.dll, KSA.dll, Planet*.dll, Bepu*.dll, Community*.dll` with `ilspycmd -p` (project mode, whole assembly, no type filter). `decomp/` has 30 `KSA*` namespace dirs; `decomp/KSA/` alone = 1201 .cs, 1432 across all `KSA*` dirs, 6348 total. All static-object types are present: `KSA/StaticObject.cs, StaticObjectTemplate.cs, StaticSubObjectTemplate.cs, StaticSubObjectInstance.cs, StaticObjectGameDataReference.cs, StaticObjectModel.cs, StaticObjectRenderer.cs, LandmarkReference.cs` and — importantly — the **whole GlbToXmlUtility pipeline** under `decomp/KSA.GlbImport/` (`StaticObjectAssetBundler.cs, PartAssetBundler.cs, GlbColliders.cs, GlbTransforms.cs, GlbExtras.cs, ToolXml.cs`). Verdict: complete KSA.dll decomp, not a subset.

## 2. GLB structure

All three atlases: glTF 2.0, generator `babylon.js glTF exporter for Autodesk Maya 2019.1 v20250723.2`, **no** extensions/extras/materials/textures/images/skins/animations, 1 buffer, 3 bufferViews (indices | interleaved-12B POSITION+NORMAL | 8B TEXCOORD_0). Every primitive: mode 4, `POSITION VEC3/f32, NORMAL VEC3/f32, TEXCOORD_0 VEC2/f32`, u16 indices, **no TANGENT, no COLOR, no TEXCOORD_1, no material index**. One node per mesh, same name. This is byte-for-byte the same convention as vessel atlases (`CoreStructuralA_MeshAtlas.glb`: same generator, same attrs, no materials) — flexo's `MeshAtlasCache.getSubPartGeometry(atlasUrl, nodeName)` (`getObjectByName` → first mesh → bake node matrix → MikkTSpace tangents) works unchanged.

Differences vs vessel atlases:

- Vessel atlases have **no `_VM` view-mesh in LaunchPad files** (structuralA has 49 `_VM` nodes); StaticObjectAssetBundler skips names starting `_` or ending `_VM` anyway.
- `_ColPrim_*` collider children (unit cube / unit cylinder meshes with node TRS = collider pose) already appear in vessel atlases (ServiceModuleA 96, LandingA 10, UtilityA 16…), so nothing new; flexo's `findFirstMesh` returns the parent mesh itself (isMesh short-circuit) so children are ignored — correct.
- **New marker: `_Terrain` child node** (Pad C only): a 0.28 m cube child under `CoreLaunchPadC_Subpart_BaseGrassA`; `StaticObjectAssetBundler.HasTerrainMarker` turns it into `<PartModel><Terrain>true</Terrain>`. It is not geometry to render. A loader that does `getObjectByName(subpart)` + first mesh is unaffected; a loader that merges all descendant meshes would need to skip `_Terrain*` and `_ColPrim*`.

Name mapping (from `StaticObjectAssetBundler.SubObject`): node name N → `<StaticSubObject Id="N"><PartModel Id="N_Model"><Mesh Id="N"/><Material Id="<Stem>_Material"/>` ; colliders from `_ColPrim_{Box,Sphere,Capsule,Cylinder}` children → `<Collider Id="Collider1">` with `LocationAsmb`/`Collider2Asmb`/`LengthX|Y|Z`/`Radius`. Prefab GLBs (not shipped) → `<StaticObject Id=<file stem>>` with `<SubObject Id=meshName InstanceOf=StripTrailingNumber(meshName)>` + `GlbTransforms.BuildTransform(node)`.

### Nodes / meshes

| Atlas | Scene roots | Node (mesh)                          | verts | tris | `_ColPrim` children                          |
| ----- | ----------- | ------------------------------------ | ----- | ---- | -------------------------------------------- |
| A     | 8           | CoreLaunchPadA_Subpart_FootpathA     | 1044  | 549  | 49 Box                                       |
| A     |             | CoreLaunchPadA_Subpart_RoadCircularA | 672   | 576  | 37 Box                                       |
| A     |             | CoreLaunchPadA_Subpart_PipeSupportA  | 88    | 82   | 1 Cyl                                        |
| A     |             | CoreLaunchPadA_Subpart_CrawlerRampA  | 914   | 472  | 14 Box                                       |
| A     |             | CoreLaunchPadA_Subpart_PadGrateA     | 1601  | 952  | 1 Cyl                                        |
| A     |             | CoreLaunchPadA_Subpart_FootpathStepA | 32    | 16   | 1 Box                                        |
| A     |             | CoreLaunchPadA_Subpart_PadGrateB     | 262   | 134  | 1 Box                                        |
| A     |             | CoreLaunchPadA_Subpart_PadA          | 1151  | 812  | 44 Box + 2 Cyl                               |
| B     | 1           | CoreLaunchPadB_Subpart_GravelTrimA   | 976   | 490  | none                                         |
| C     | 1           | CoreLaunchPadC_Subpart_BaseGrassA    | 648   | 960  | 48 Box + 1 Cyl, plus `_Terrain` marker child |

(A: 158 nodes/158 meshes total incl. 150 collider prims; C: 51/51.) Root subpart nodes carry no TRS (identity).

## 3. Bounding boxes (accessor min/max, glb/local space, metres)

| SubObject       | min (X,Y,Z)            | max (X,Y,Z)         | size X×Y×Z       | prefab Position (X,Y,Z) / Rotation                                 |
| --------------- | ---------------------- | ------------------- | ---------------- | ------------------------------------------------------------------ |
| A FootpathA     | -0.056,-44.269,-52.605 | 0.056,44.269,52.605 | 0.11×88.5×105.2  | (-0.170, 6.976, -2.737)                                            |
| A RoadCircularA | -0.051,-62.100,-62.100 | 0.051,62.100,62.100 | 0.10×124.2×124.2 | (-0.136, 0, 0)                                                     |
| A PipeSupportA  | -1.346,-0.750,-0.681   | 1.346,0.750,0.681   | 2.69×1.50×1.36   | 6 instances at X=0.469, r≈12.2 m ring, Rot (±π/2, 0.65–0.92, ±π/2) |
| A CrawlerRampA  | -0.923,-23.426,-6.542  | 0.923,23.426,6.542  | 1.85×46.9×13.1   | (0.637, 0, 32.69) Rot X=-π/2                                       |
| A PadGrateA     | -0.146,-7.669,-7.669   | 0.146,7.669,7.669   | 0.29×15.3×15.3   | (1.424, 0, 0) — topmost                                            |
| A FootpathStepA | -0.099,-0.790,-0.252   | 0.099,0.790,0.252   | 0.20×1.58×0.50   | (-0.083, 14.70, 5.28) Rot X=π/2                                    |
| A PadGrateB     | -0.080,-0.388,-2.449   | 0.080,0.388,2.449   | 0.16×0.78×4.90   | ×2 at (0.220, ±10.29, 0)                                           |
| A PadA          | -0.856,-14.924,-14.924 | 0.856,14.924,14.924 | 1.71×29.8×29.8   | (0.691, 0, 0)                                                      |
| B GravelTrimA   | -0.021,-63.415,-63.415 | 0.021,63.415,63.415 | 0.04×126.8×126.8 | (-0.130, 0, 0)                                                     |
| C BaseGrassA    | 0.343,-81.940,-81.940  | 0.491,81.940,81.940 | 0.15×163.9×163.9 | (-0.649, 0, 0) → world X -0.31..-0.16 (just below grade)           |

Axis convention: **+X is up** (surface normal). Every flat element is ~0.04–1.8 m thick in X and 15–164 m wide in Y/Z; the prefab stacks layers by X only (BaseGrass -0.65 < GravelTrim -0.13 < Road -0.14 < Pad 0.69 < PadGrate 1.42) and rotations about X spin things in the ground plane. Same convention as vessel parts (X = part axis). Overall prefab footprint ≈ 164 m square (BaseGrass) — `<FootprintRadius M="108.3">` ≈ half-diagonal of a 153 m square / covers the 164 m disc, `<GroundOffset M="0.2">`, `<SurfaceHeight M="1.5537">` (≈ PadGrateA top: 1.4235 + 0.146 = 1.57). The prefab's own `<GroundOffset/><SurfaceHeight/><FootprintRadius/>` are empty in Assets.xml and supplied by `CoreLaunchPadAGameData.xml` (`StaticObjectGameDataReference.ApplyGameData` overrides only set values). Terrain decal: `Astronomicals.xml` `<Modifier Type="Decal">` Radius 400 (m), `circle.dds` heightmap, flattens the site.

## 4. Textures (KTX2 headers)

| File                                              | vkFormat                             | size  | mips | supercomp          | DFD                                                      |
| ------------------------------------------------- | ------------------------------------ | ----- | ---- | ------------------ | -------------------------------------------------------- |
| CoreLaunchPad{A,B,C}_TextureAtlas_Diffuse         | 145 BC7_UNORM                        | 2048² | 12   | Zstd (`--zstd 20`) | model BC7, transfer LINEAR                               |
| CoreLaunchPad{A,B,C}_TextureAtlas_Normal          | 141 BC5_UNORM (RG only)              | 2048² | 12   | Zstd               | model BC5, LINEAR                                        |
| CoreLaunchPad{A,B,C}_TextureAtlas_PBR             | 145 BC7_UNORM                        | 2048² | 12   | Zstd               | model BC7, LINEAR                                        |
| CoreLaunchPadB_TextureAtlas_Alpha                 | **139 BC4_UNORM (single channel R)** | 2048² | 12   | Zstd               | model BC4, LINEAR, written by ktx 4.4.2 (the rest 4.4.0) |
| CoreStructuralA_TextureAtlas_Diffuse (vessel ref) | 145 BC7_UNORM                        | 2048² | 12   | Zstd               | identical                                                |

Identical pipeline to vessel atlases (same writer, same Zstd level, same LINEAR tag, 2048²). `Alpha` is the only `<Alpha>` KTX2 in all of Core (the other is `Empty_Alpha.png`); it is a separate 1-channel BC4 mask, sampled `.r` by the shader, and it is the first real user of the S-catalog gap **T1 `<PbrMaterial><Alpha>`**. `tools/reencode-textures-uastc.py` handles vkFormat 139/141/145/146 and skips only `Characters/` — so after the copy it converts all 10 files unchanged (BC4 → UASTC single-channel is in its table). flexo has no Alpha-slot code today (`grep -i alpha src/three/MaterialFactory.ts` = 0 hits) — the editor needs `alphaMap`(R) + `transparent` or alphaTest for GravelTrimA.

## 5. Shaders

`StaticObject.vert` (42 lines): inputs `pos, normal, uv`; per-instance `mat4 WorldMatrix` from SSBO (set 3) indexed by `gl_InstanceIndex`; outputs world pos, uv, world normal (`transpose(inverse(mat3(W)))`), flat `gl_DrawID`. Camera is ego-relative (`V = normalize(-worldPos)`), no model/view split. **Rigid only — no skinning, no animation**; instancing is how prefab SubObjects with repeated `InstanceOf` are drawn.

`StaticObject.frag` (366 lines) — one shader, two variants via `#ifdef SAMPLE_TERRAIN` (decomp: `StaticObjectModel.Bucket` = `OpaqueTerrain` when `<Terrain>true`, else `Blended` when material has AlphaMap, else `Opaque`; `StaticObjectRenderer` builds a separate `TerrainPipeline`, blended bucket uses `BlendColorAlpha`).

- Per-draw SSBO (set 2): bindless indices `diffuse/normal/pbr/emissive/tfi/alpha` (emissive & thin-film are declared but **never sampled** — statics have no emissive/heat).
- Non-terrain path: `color = gammaToLinear(diffuse.rgb)`, normal = RG*2-1 with derivative TBN (`getNormalFromMap_ShaderX`, no tangents — matches flexo's memory), PBR = R ao / G rough / B metal, `F0 = mix(0.04, color, metal)`, direct sun `getPBRLightingDirect` × (terrain shadow map × CSM × cloud shadows × celestial shadow), + light pre-pass + forward punctual lights, ambient = atmosphere LUT (`GetAmbient` × sunColor) → `getPBREnvironmentLightingPresampled`, or star/atmos ambient fallback. SSAO texture is sampled then **overridden `ao = 1.0`**. `alpha = alphaTextureIndex < 0 ? 1 : alphaTex.r` → `outColor = vec4(light, alpha)` (blend, **no alpha-test/cutout**, so GravelTrim edges are true alpha-blend).
- Terrain path (`<Terrain>true`, Pad C BaseGrass): **ignores the atlas textures entirely**. It samples the planet's biome cube maps at the fragment's sphere direction (colorMap / biomeId / biomeControl / scattering / surge), resolves top-K biome ground materials, samples their tiled diffuse/normal/ORM **biplanar in planet space** with height-blend (`HeightBlendWeights`) and distance tiling, then lights with the planet Hapke model (`getPBRLightingPlanet`) × `pbrExposure`; alpha = 1. i.e. the mesh is a shaped "skirt" that borrows the terrain's material so the pad blends into the ground; the atlas Diffuse/Normal/PBR for Pad C are effectively unused by the game at runtime (still referenced by the material). Comment in-shader: "No slope blending for now since static terrain objects are mostly just for launch sites".
- Editor approximation: normal path = flexo's existing MeshStandard-style PBR (same channel packing, linear diffuse, derivative normals) + optional `alphaMap`; terrain path = render with a flat ground-coloured, non-metallic rough material (or the planet biome colour) and no atlas textures.

`StaticCelestialDistance.*` = octagon point-sprite + Celestia PSF glow for distant bodies/stars; unrelated to statics despite the name.

## 6. Mod sample

`ksa-linux/Content/Sample/` exists but contains only `star_import_manifest.toml` — **no static-object (or any) example mod**. The only in-repo reference implementation is the Core LaunchPad XML + the `KSA.GlbImport.StaticObjectAssetBundler` decomp.
