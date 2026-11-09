# KSA 5801 upgrade

Flexo now targets **KSA 2026.11.10.5801**, upgraded from its verified
2026.10.10.5554 baseline. The implementation covers current content resolution,
all current Part/SubPart templates, native Part appearance families, SubPart
appearance choices, export, rendering resources and shared ICRP consumers.

The supplied previous assemblies are 5707; the supplied previous private assets
are 5638. The complete source audit compares assemblies history `935a32b` to
`4de698e`, not only those previous checkouts. Reference repositories were read-only.
The existing private mirror already contained the new XML, models and UASTC textures.

## Implemented behavior

- A shared content prepass resolves ordered definitions, final-parent inheritance,
  same-tag Modify patches and explicit collection wrappers before parsing. Global
  Id/Ref and local Key/KeyRef are kept distinct. Invalid current content fails at
  the catalog boundary; no legacy XML parser was added.
- The current catalog has **256 Parts** and **571 SubParts**: 570 renderable templates
  plus the metadata-only KittenBackPackSubPart. All active packs and cross-pack
  resources are included. TestContent remains outside the normal catalog.
- **50 native Part families**, containing **128 members**, expose concrete choices.
  Exact member IDs remain searchable and addressable in the preview manifest.
  SubPart Related appearances use verified geometry groups and mutually exclusive
  same-stem alternatives within explicit native Part families. Imports retain the
  selected member's own geometry and metadata.
- Catalog models resolve global Mesh names, Material refs and Texture refs across
  packs. Every native render component is retained and previewed. Foil and cloth
  use the existing PBR/normal/UASTC pipeline; no special foil shader was needed.
- Exports declare identified Texture and MeshAtlas assets, keyed Components and
  ordered Part/SubPart patches. Edits to built-ins create independent resolved
  template copies and preserve model kinds, flags, MeshView and untouched metadata.
  Empty gameplay overrides remove the copied gameplay rather than modifying Core.
- Repeated imports allocate case-insensitive local keys and remap scoped feeds,
  controllers, gimbals, seats, lights and raw module references. Additional Habitat
  and singleton components survive. A present partial Scale uses native zero
  defaults for omitted axes; an absent Scale still means one.
- Current reaction/grain catalogs, editor tags, plume IDs, Edge connector flag and
  Air/Water tank roles are handled. HollowSphereMass is the ninth editable stock
  mass shape; other current native mass kinds survive as unresolved raw entries.
- ICRP uses current static wrappers and references, Assets-root System/body/vehicle
  rows, keyed landmarks and decals. Cloned systems preserve parent-body and starting
  vehicle links. Two missing mirror metadata files are bundled as byte-identical
  current Core XML; no planetary binaries were vendored.
- Production resource selection keeps all root XML, Part/static Path dependencies,
  characters, animations and decals. It omits unused planet/cloud payloads from the
  browser build: approximately **288 MB** in `dist/ksa`, versus a **2.3 GB** input
  mirror. The full build is approximately 476 MB including shared HDR and app assets.

## Fidelity findings fixed during integration

Schema acceptance alone did not establish data preservation. An independent stock
comparison found that SupplyLockerA's two new HollowSphereMass entries disappeared
inside a known InertMasses wrapper. The new mass model, opaque native mass handling,
source-derived volume/clamp tests and actual supply-locker round trip close that gap.

The complete engine audit also found that KittenBackPackPart carries RCS gameplay
without a render mesh. Excluding its SubPart from the render catalog blocked export.
The catalog now retains its metadata and raw template; rendering creates an empty
group without requesting an atlas. All **55 stock engine Parts** pass the
import/performance/export/reimport audit, covering 52 non-solid and 16 solid rockets.

## Source checks outside XML

The changes to DeLavalNozzleConfig, GasProperties, RocketDesign, FixedReactionTable
and IVAController preserve the ported algorithms; changed expressions are decompiler
presentation differences. CombustorConfig, NozzlePerformance, MixtureReactionTable,
ThermalReactionTable, BurnRateLaw, GrainGeometryTable and SolidMotorNozzle are
byte-identical. SolidMotor's preview and nozzle-sizing algorithms are unchanged;
its live activation gate now uses HasControlModule, outside Flexo's numeric preview.
EngineDesigner changed its XML generation. KeyframeAnimationData retains the same
node/transform/sample interpretation; file registration changed.

## Validation

- `pnpm test`: **150 files, 2,583 tests passed**, with current private assets present.
  The initial baseline had 40 failures against those assets. Obsolete overlay API
  tests were replaced by current prepass/catalog coverage; parser and export
  conversions retained their substantive cases.
- `pnpm typecheck`, `pnpm lint`, `pnpm run fmt`, `pnpm run fmt:check`, and
  `pnpm build` pass. The build includes the main app, partpreview and ICRP.
  Running the full test suite concurrently with a production compilation caused
  four five-second timeouts; the unchanged standalone run passed; the final full run after the empty-group fix
  also passed in 7.27 s.
- Main browser smoke passes all **15 steps**, including concrete Part/SubPart
  selection, current engines, mass editing, undo and reload. ICRP's **12-step smoke**
  and its placement/snap/docking journey pass. Production checks cover the main app,
  ICRP catalog/export and the exact-ID foil probe preview.
- Foil truss, flat foil patch and lander cloth were visually inspected in Chromium
  with ordinary extensions and with BCn extensions explicitly disabled. There were
  no failed asset requests or application errors. The flat patch is one-sided and
  visible from its front face. The software-rendered no-BCn probe needed more than
  three seconds to finish loading; its completed capture rendered correctly.
- Focused browser checks also confirm the metadata-only backpack placement and RCS
  controller data survive import/export without console or network errors. Supply
  Locker A shows two editable hollow-sphere definitions with the native radii, wall
  thickness and Aluminum.2014(s) material.
- The built apps successfully loaded their shared `/flexo/ksa/`, `/flexo/hdr/` and
  `/flexo/basis/` resources. An incidental ICRP `/favicon.ico` request was the only
  browser 404; its configured favicon.svg and application resources succeeded.
- Vendored fixture byte comparisons pass against current private assets. Their
  upstream CRLF bytes are intentionally retained. `git diff --check` is clean for
  first-party code/docs excluding those byte-identical upstream fixture files.

### Independent managed KSA validation

`scripts/ksa-schema-check` runs the game's actual ContentPrePass, native family
check and ContentDeserializer without loading payloads or initializing rendering.
The final exported stock corpus contains **2,015 input rows**, resolved to **1,369
rows**, with zero native prepass or deserialization errors. Structural comparison
of every native result with Flexo's result found **zero differences**. All 256
exported Parts are present, including the backpack RCS and both supply-locker shells.
The corpus harness does not reconstruct decoded animation clips; animation/import
regressions and browser smoke exercise those paths separately.

The browser-exported ICRP mod was validated with the entire native Core manifest:
**92 source files, 5,786 input rows, 5,524 flattened rows, zero errors**. A generated
custom asset sample covering opaque, internal and glass SubParts plus Texture,
Material and MeshAtlas declarations also passed: nine rows, zero errors.

The available KSA DLLs target x64; this ARM Mac has no Rosetta. Temporary Mono.Cecil
copies changed only architecture metadata to AnyCPU while retaining managed IL,
allowing schema-only execution on .NET 10. Original assemblies were unchanged.
This is not a claim that the running game, native libraries or GPU were exercised.
The reusable harness documents the normal architecture-compatible invocation.

Session-local evidence is under `/tmp/flexo-5801-native/` and
`/tmp/flexo-5801-validation/`, including native flattened XML, source-order JSON,
ZIP exports, network reports and screenshots. These temporary artifacts are not
required by the app or committed with licensed binaries.

## Compatibility and retained limits

This is a breaking project representation change: **PROJECT_SCHEMA_VERSION = 5**
and **PROJECT_EXPORT_VERSION = 12**. Existing boot/import rules purge incompatible
saved snapshots and reject older compact exports. There is no migration. Compatible
missing fields still receive constructor defaults under the established policy.

Actual game loading/rendering and real mobile-GPU validation remain unperformed.
Native glass, Alpha, ThinFilm/heat, terrain and exact illumination are not fully
simulated by the browser. Opaque Habitat/parachute modules can round-trip without
new dedicated authoring or simulation panels. A raw reference to an original
Collider component Key is not preserved when its shapes are combined under the
editor's generated module key; the audited stock has no such reference. Custom
collision-hull authoring and the historical ground-clutter scaffold gap R1 remain
outside this upgrade. See [FULL_SCOPE](../scope/FULL_SCOPE.md) for the current map.

## Research and commits

- [Schema findings](KSA_5801_SCHEMA_RESEARCH.md)
- [Variants and model inventory](KSA_5801_VARIANTS_RESEARCH.md)
- [Rendering and supporting assets](KSA_5801_RENDER_RESEARCH.md)
- [Full changed-file inventory](KSA_5801_FILE_AUDIT.md)

Research was committed as `5b257b1` (`docs: record KSA 5801 schema and asset audit`).
The implementation, current fixtures, documentation and regression suite form the
following breaking feature commit on `feature/part-variants`.
