# KSA 5554 upgrade review

flexo now models the current thermal/fusion and antimatter propulsion modules, magnetic
containment, and stock convex-hull colliders. The current catalog, XML fixtures, category
snapshot, validation evidence and scope baseline have been refreshed. Changes are additive;
compatible saved projects remain valid, with no migration or schema-version bump.

Review date: **2026-10-11**. Changes are uncommitted.

## Inputs and comparison range

| Input                   | Caller-supplied root                                       | Located tree / build                                                           |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Current sources         | `/Users/asherwin/repos/meow-sci/ksa-game-assemblies`       | `current/{decomp,Content/Core,version.json}`; `2026.10.10.5554`, git `935a32b` |
| Previous sources        | `/Users/asherwin/repos/meow-sci/ksa-game-assemblies_prev`  | `current/{decomp,Content/Core,version.json}`; `2026.10.7.5541`                 |
| Current private assets  | `/Users/asherwin/repos/meow-sci/flexo-private-assets`      | `assets/`; `2026.10.10.5554`, git `97042ce`                                    |
| Previous private assets | `/Users/asherwin/repos/meow-sci/flexo-private-assets_prev` | `assets/`; `2026.9.22.5482`                                                    |

The verified flexo baseline at the start was **2026.9.22.5482**, assemblies git `a2f724f`.
The source `_prev` checkout is newer than that baseline, so comparing only 5541 → 5554
would miss thermal and antimatter additions. This review uses `a2f724f` → `935a32b` for
sources/Content and the supplied 5482 → 5554 private mirrors. Both changelogs were read;
their claims were checked against actual source/XML changes.

## File diff and schema sweep

Rename detection was disabled, so renames appear as additions and removals.

| Tree                                                                   | Changed | Added | Removed |
| ---------------------------------------------------------------------- | ------: | ----: | ------: |
| Decompiled source, raw                                                 |     232 |    48 |       4 |
| Decompiled source, prescribed Brutal/System/MIConvexHull/Planet filter |     213 |    46 |       3 |
| Content                                                                |     146 |    12 |       0 |
| Private mirror, excluding `.DS_Store`                                  |      22 |     3 |       0 |

Thirteen modified C# files are identical after normalizing only diagnostic source-line
numbers and compiler-generated anonymous-delegate numbering. The remaining filtered
source set contains 200 modified files plus the additions/removals; real runtime changes
are distinguished from decompiler noise. The three filtered removals are the generated
inline-array rename and two retired plume-trail scheduling classes. None is an authored
Part schema removal. Added collision GLBs, propulsion templates, celestial templates and
plume-cache shaders are explicitly routed in [the complete file audit](KSA_5554_FILE_AUDIT.md).

The annotation sweep found **18 source files** with changed XML/default declarations.
A separate public-field sweep checked declarations without explicit XML annotations.
Vehicle burn/save data and interstellar celestial data were separated from Part authoring.
Sixty existing contract anchor files are byte-identical to 5482, including unit references,
fixed-engine math, animation loaders, IVA/connector templates, static-object schema,
PBR/mesh registries and thumbnail material handling.

The broad namespace filter also matches names such as `ClusteredLightSystem.cs`, so these
relevant runtime files were reviewed beyond the filtered list. No new Part/XML issue was
found outside the engine, tank and collider changes below.

## Contract verdicts

| Area                                | Verdict and game-side evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Part/SubPart XML and tags           | **Drift fixed.** `PartTemplate.RocketCores`, `RocketNozzles`, `MagneticScoops` add `<ThermalCore>`, `<AntimatterRamCore>`, `<MagneticNozzle>`, `<MagneticScoop>` at geometry/GameData owner scopes. `CoreEditorTagsGameData.xml` adds `<EditorTagDef Id="Interstellar" RootPartWhitelist="true" FaceSnapTargetWhitelist="true"/>` after Lights. Existing geometry structure and tag-definition class remain intact.                                                                                                                        |
| GameData tanks                      | **Silent loss fixed.** `Tank.TemplateData.MagneticTrap` adds `<Tank><MagneticTrap Value>`. `Tank.CanHold` compares it with `Substance.RequiresMagneticContainment`; `SubstanceTemplate` adds `<RequiresMagneticContainment Value>`. Core's `CoreFuelTankA_Prefab_MagneticTrapA` authors the flag. Mass, electrical, docking, decoupler and unit forms are intact.                                                                                                                                                                          |
| Engines/reactions                   | **New capabilities modeled.** `ThermalCoreTemplate.Create` requires a `ThermalReaction`; its `<CoreTemperature K>`, pressure, efficiency, timing and feeds are modeled. `ThermalReactionTable.SliceAt` interpolates linearly in temperature; current FusionH2 joins six existing thermal tables. `AntimatterRamCoreTemplate` authors jet power, annihilation efficiency, carried exhaust fraction, phases and timing; `ComputeDrive` is ported, including 40-step carried-flow bisection. Fixed chemical and solid formulas remain intact. |
| Nozzles/scoops/feeds                | **New capabilities modeled.** `MagneticNozzleTemplate` preserves inherited exhaust/FX/sound/plume fields plus `<FxExitDiameter>`. `MagneticNozzle.ComputePerformance` shares its core's carried flow across nozzle count. `MagneticScoopTemplate` authors `<CaptureRadius>` and `<Collects Id>`. PlumbedCore feed targeting replaces the Combustor-only runtime specialization; capability flags and `<ConsumerFeedWiring>` format are unchanged. `DefaultPlumeTrail` lifetime changes 1200 → 420 seconds without an id change.            |
| Colliders                           | **Stock data loss fixed.** `GlbColliders.BuildList` accepts `_ColMesh`; `GlbCollisionAtlas.Emit/Write` emits `<MeshAtlas HostOnly="true">` with named meshes in its binary GLB. Six stock hulls use `<Collider><ConvexHull><Mesh Id>` and optional `<Scale X Y Z>`. `ColliderTemplate.Create` calls `Resolve`; hull volume/centroid compensation remains as in 5482. Four analytic templates, MeshColliderTemplate and ColliderModule are unchanged.                                                                                       |
| Custom assets and multi-part export | **Intact.** `Mod`, `ModLibrary` changes are diagnostics/delegate noise; flat bundle/id/first-wins rules remain valid for N Parts and atlases. `AssetBundle` adds Barycenter only. PbrMaterialReference, MeshReference, MeshAtlasFileReference and ThumbnailRenderResources are unchanged; synthetic Normal/ORM and named indexed GLB meshes remain required. `GltfUtils.LoadImageData` adds a debug name only.                                                                                                                             |
| PBR/normal/glow                     | **Part contract intact.** PartModelRenderer and shaders change bindless descriptors/pipeline caches; emissive versus temperature variants, normal mapping, gamma and PBR channel semantics remain. Planet Hapke guards/phase-angle math change terrain's appearance, not vessel material serialization. Existing static-metal/shadow observations still require an in-game recheck.                                                                                                                                                        |
| Light falloff/aim                   | **Intact; citations fixed.** LightModule, Lighting/Light and LightData.glsl are byte-identical. LightPrePass changes include/descriptor setup only; attenuation/spot math is unchanged. Current ClusteredLightSystem retains the nearly-zero guard at line 899 and range/intensity gate at line 1083; warnings/tests now cite them.                                                                                                                                                                                                        |
| Animation                           | **Intact.** KeyframeAnimationData, KeyframeAnimationModule, Skeleton and ten private part-animation GLBs are unchanged. Solar tracking now uses the closest star at runtime; XML and rest-anchor conventions do not move.                                                                                                                                                                                                                                                                                                                  |
| Kittens                             | **Intact.** CharacterAssets, KittenRenderable, CharacterAvatar and private binaries are unchanged. AnimatedRenderable adds shadow bounds; CharacterRenderResources/ModelTranslucent change bindings. Material/socket/bake inputs remain valid. Historical retired-MMU limitation T4 remains.                                                                                                                                                                                                                                               |
| Coordinates/connectors/IVA          | **Intact.** Quaternion XYZ convention, connector flags/capabilities, seat axes/order/clamps and Internal restriction remain. IVAController now uses vehicle-relative Camera.PositionCce for precision. LQI/adaptive TVC remains vehicle runtime. Existing Control From Here still uses a selected control frame; it adds no Part-authored fields.                                                                                                                                                                                          |
| ICRP/static/launch sites            | **Existing corpus intact; inherited hulls preserved.** Static templates, location/decal and nearest-pad contracts are unchanged; shared hull serializer/duplication now preserves Mesh/Scale. Earth adds Metline city and current clone includes it. Selected miniature Earth/SolSystem fields match 5554. New Barycenter/stellar-orbit/interstellar-gas declarations and scenarios are outside ICRP's served Solar corpus; no claim is made that ICRP indexes those scenarios.                                                            |
| Ground clutter                      | **No new authored drift.** Reference classes and material/mesh-name contract are intact. Renderer scheduling/culling/bindings and optional hull bundling are runtime/upstream-tool changes. Historical scaffold incompatibility R1 remains open.                                                                                                                                                                                                                                                                                           |

These extensions belong to existing engine, collider, export and celestial scope areas;
no unrelated editor-only shell feature or new integration category was introduced.

## Resolved gaps and exact implementation targets

| Gap     | Severity                                            | Current fix / targets                                                                                                                                                                                                                                                                                                                                                               |
| ------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1      | MISSING-CAPABILITY / broken stock rocket references | Switch to current distinct engine module lists. Parse/emit/catalog/import/author/validate/persist both owner scopes. Thermal LUT and carried-ram readouts match the current design point. `src/ksa/partXmlParser.ts:1274`, `src/ksa/reactionCatalog.ts:430`, `src/ksa/enginePhysics.ts:505`, `src/state/editorStore.ts:4954`; UI in `src/ui/engine/AdvancedPropulsionEditor.tsx:1`. |
| X2      | MISSING-CAPABILITY / silent tank child loss         | Model `Tank.magneticTrap`, default false, emit wrapper child only when true; compact `mt` and undoable Advanced setting. `src/ksa/types.ts:572`, `src/ksa/partXmlParser.ts:506`, `src/ksa/partXmlSerializer.ts:627`, `src/ui/data/sections/TanksSection.tsx:1`.                                                                                                                     |
| X3 / S1 | MISSING-CAPABILITY / dropped stock hulls            | Preserve fifth shape, mesh reference and multiplier; resolve HostOnly atlas and directly decode vertex accessors; render and measure actual hulls; retain references in variants/transfers/ICRP duplication. `src/ksa/types.ts:175`, `src/ksa/collisionAtlas.ts:2`, `src/three/CollisionMeshCache.ts:1`, `src/ksa/partXmlSerializer.ts:489`, `src/state/projectTransfer.ts:777`.    |
| X4      | COSMETIC / stale category suggestions               | Refresh Interstellar in static registry and its order regression. `src/ksa/types.ts:493`.                                                                                                                                                                                                                                                                                           |
| X5      | COSMETIC / stale warning evidence                   | Replace old light source-line citations with current gates; no formula change. `src/ksa/lightValidation.ts:89`.                                                                                                                                                                                                                                                                     |

S1's **stock import/export loss is closed**. Creating arbitrary new collision meshes,
primitive fitting to a new hull, hull Circular Arrangement and packaging new hull atlases
remain deliberately unavailable. Existing unrelated U2/U3/T1/T2/T3/T4/S2/R1 limits remain
explicit in [the running gap plan](FIX_CURRENT_GAPS_PLAN.md).

All model changes are additive. `PROJECT_SCHEMA_VERSION = 4`
(`src/state/projectStore.ts:148`) and `PROJECT_EXPORT_VERSION = 11`
(`src/state/projectCodec.ts:121`) stay unchanged. Constructors plus existing nested tank
normalization fill missing snapshot/history fields. Project-export decoding fills missing
module fields, including vectors. Current XML is modeled directly; no old-format aliases,
upcasting, migration or conversion is added.

## Asset and documentation follow-through

The current private mirror was already 5554 and stays clean. Its 43 XML files match
current Core after newline normalization (seven CRLF-only differences); all 103 catalog
binary paths and 858 referenced mesh ids resolve. The three additions are Command,
Fairing and Structural collision atlases. Structural render meshes also add
TrussMergeTestA and its `_VM` companion.

All **70 non-character KTX2** textures are UASTC (vkFormat 0, color model 166).
The required re-encode check completed with **0 conversions / 70 skips**. The 24 character
textures remain unchanged upstream BCn (16 BC1, eight BC7), with the existing kitten
material/socket behavior. All ten part-animation GLBs remain byte-identical.
The assembly snapshot contains no licensed binaries; mirror binaries were checked against
references and the supplied previous mirror, not an independently installed game copy.

Fixture sync refreshed **18 files**, of which six changed: ElectricalA, FuelTankA and
PropulsionA Assets/GameData pairs. Current fixtures exercise magnetic modules and tanks in
open-source CI. Existing ICRP miniature fixtures retained current selected fields and needed
no trim. New tests cover XML/real catalog imports, thermal LUT/ram numerics, actual collision
GLB decoding and coverage, undo, scoped references, codec defaults, snapshot preservation,
export variants, transfers and ICRP serialization/duplication. Browser smoke adds stock
FusionCore/RamCore editor and performance checks.

Touched scope files and the master status table are re-baselined to 5554. Feature docs,
AGENTS.md, fixture README, the running gap plan and this report are updated. The upgrade
skill's stale four-collider and body-frame routing statements were corrected. Asset docs
now name the actual private `copy-assets.ts` utility and its UASTC step.

## Final validation

All final checks passed after independent review corrected generated magnetic-nozzle IDs,
geometry-module catalog preservation, and compact-module nested defaults.

| Check                | Result                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`          | **2,588 passed across 134 files**                                                                                           |
| `pnpm typecheck`     | Passed                                                                                                                      |
| `pnpm lint`          | Passed                                                                                                                      |
| `pnpm run fmt:check` | Passed; changed ignored docs/scripts/skill were also explicitly formatted and checked with oxfmt                            |
| `pnpm build`         | Passed: main editor, Part preview and ICRP bundles                                                                          |
| `pnpm smoke`         | Passed: shell, catalog, undo, modes, projects, multi-Part, chemical/RCS, and stock FusionCore/RamCore authoring/performance |
| `pnpm smoke:icrp`    | All steps passed: catalog/pad/stock-Part imports, arrays, dragging, collider mode, layers and export                        |
| `git diff --check`   | Passed                                                                                                                      |

The live engine integration census covers **40 stock engine Parts**, **37 non-solid rocket
definitions** and **16 solid rocket definitions**, comparing design performance and export/reimport.
Initial sandbox browser launch was denied by macOS; both local browser tests succeeded with
normal browser permissions. React Compiler checks were reviewed, with pure renders, static
hooks, kit primitives, undo enrollment and no manual memoization added.

In-game KSA load/render acceptance was not performed. The automated checks validate current
schema, source math, catalog assets, persistence, browser workflows and generated exports.
