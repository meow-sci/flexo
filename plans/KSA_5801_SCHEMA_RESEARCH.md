# KSA 5801 XML contract research

Research only, 2026-11-08. This compares Flexo's verified **5554** baseline
(`ksa-game-assemblies` git `935a32b`) with current **2026.11.10.5801**
(`d07b870` / snapshot commit `4de698e`). The supplied `_prev` snapshot is **5707**,
not Flexo's baseline. Sources below are relative to
`../ksa-game-assemblies/current/`; all game and private-asset sources were read only.

The decisive change is revision 5708's generic XML prepass. This is a contract
replacement affecting import **and every exported XML document**; changing the
catalog alone cannot produce a loadable mod.

## Independent implementation ownership and interfaces

1. **Catalog/prepass:** `src/ksa/contentXml.ts` (new), `catalog.ts`,
   `partCatalog.ts`. Read native manifest order; flatten current rows before typed
   parsing. Publish a `Document` with live, concrete `<Assets>` rows, no
   `Modify`/`Parent`/`Abstract`. Preserve provenance separately. Typed parser APIs
   taking `Element`/`Document` should remain usable. Global registries resolve
   Texture/Material/Mesh/animation refs across files. Parent can refer forward;
   Modify targets must exist earlier. Do not pair a file with its GameData sibling
   and simulate the old C# overlay behavior.
2. **Domain parser/serializer:** `partXmlParser.ts`, `partXmlSerializer.ts`, related
   XML tests and the small shared type additions below. Parse flattened current
   Part/SubPart rows; emit new geometry rows followed by same-tag/Id Patch rows
   when retaining the two-file export format. Keep internal editor field names
   where their meaning is unchanged: `instanceId` is a placement Key, typed module
   `id` is its Key, and `SubPartIdRef.id` is a KeyRef.
3. **Asset export:** `assetsXmlSerializer.ts`, `modExport.ts`, asset-export tests.
   Top-level identified MeshAtlas/Texture/KeyframeAnimation rows, proper Ref/Key,
   Components wrapper, full template clone fidelity. Coordinate `ReferenceSubPartPlan`
   and multi-render-model catalog representation with the catalog owner.
4. **Integration/supporting catalogs:** reaction/grain/material-density catalogs,
   fixtures, project versions/codec/normalizer, ICRP readers/writers, docs/scope.

No legacy fallback or game-XML migration belongs in any owner. A source XML
prepass implementing the **current** merge language is not a legacy migration.

## Identity: exact bindings

| XML identity | Current meaning | Source |
| --- | --- | --- |
| `Id` | Every direct Assets row needs a nonempty Id. Nested Id is illegal. | `SerializedId.cs`, `ContentShapeCheck.cs` |
| `Ref` | Typed reference to a top-level asset. | `DataReference.cs` |
| `Key` | Local identity on an `IKeyed` object: placement, connector, module, gimbal, collider shape. | `KeyedTemplate.cs`, `TransformDataReference.cs`, `Part.cs` |
| `KeyRef` | Typed local reference in the owning asset's scope. | `KeyReference.cs`, `ContentRefLookup.cs` |
| `SubPart` | Optional KeyRef scope selector naming a **placement Key**, never a template Id. | `KeyReference.cs`, `ModuleKeyReference.cs` |
| `Parent` | Same-tag asset inheritance, row level only. | `ContentPrePass.cs` |

Rows are identified by case-sensitive tag plus case-insensitive Id. Local keys
and refs compare without case. Different row tags may share a registry and still
collide (`Part` and `SubPart` share parts; material types share materials).

`ModuleBase.TemplateDataBase` supplies a **default Key equal to its XmlType name**.
An unkeyed-looking `<Tank>` is Key `Tank`, `<Battery>` is Key `Battery`, and
`<SolarPanel>` is Key `SolarPanel`. This matters to `<Container KeyRef="Tank"/>`.
Do not parse absent component Key as an empty string. The default does not justify
duplicating a module type without explicit distinct keys.

## Current Part/SubPart shape

`PartTemplate.cs` and inherited `SubPartTemplate.cs` declare these arrays. All are
explicit wrappers, not direct repeated children:

| Wrapper | Items |
| --- | --- |
| `SubParts` | `SubPart Key="placement" Ref="template"` + optional Transform |
| `Gimbals` | `Gimbal Key` |
| `RocketEngineControllers` | `RocketEngineController Key` |
| `RocketThrusterControllers` | `RocketThrusterController Key` |
| `EditorTags` | `EditorTag Ref` (Value is obsolete) |
| `Variants` | `Part Ref` |
| `Rockets` | `Rocket Key` |
| `RocketCores` | `Combustor`, `SolidMotor`, `ThermalCore`, `AntimatterRamCore`, all Key |
| `ConsumerFeedWirings` | `ConsumerFeedWiring KeyRef [SubPart]` |
| `RocketNozzles` | `DeLavalNozzle`, `MagneticNozzle`, `SolidMotorNozzle`, all Key |
| `InertMasses` | CustomMass and the existing stock mass-shape types; these are value objects, not keyed modules |
| `Diameters` | `Diameter` distance wrappers |
| `Connectors` | `Connector Key` |
| `Grabs` | `Grab` |
| `AlignedGroups` | `Aligned` |
| `SymmetryGroups` | `SymmetryGroup` |
| `SubPartGroups` | `SubPartGroup` |
| `Components` | All ModuleBase template types, with Key/default key |

Row attributes remain Id/DisplayName/CrashTolerance and now include FaceSnapMode.
`PrimarySequenceModule` is a single ModuleKeyReference (KeyRef/SubPart).
`ThumbnailRotation` is a vector. Components include PartModel, PartModelDynamic,
PartModelGlass, MeshView, Collider, Light, Tank, Battery, Generator, PowerConsumer,
SolarPanel, IVASeat, EVADoor, AttachedInternal, Control, KeyframeAnimationModule,
Decoupler, DockingPort, SolidGrainSegment, MagneticScoop, Habitat, FuelPort,
Parachute and SolarTracker. Read `XmlHelper.cs` for registration, not a guessed list.

Removed overlay tags `PartGameData`, `SubPartGameData`, `StaticObjectGameData`, and
`StaticSubObjectGameData` must never be emitted. A file may still be *named*
`PartGameData.xml`: filenames do not confer schema or merge semantics.

## Nested field changes requiring explicit edits

| Old Flexo shape | Current 5801 shape | Anchors / consequence |
| --- | --- | --- |
| `SubPart Id InstanceOf` direct under Part | `SubParts/SubPart Key Ref` | `TransformDataReference.cs` |
| Connector Id, bare Sibling Id | Connectors/Connector Key; Siblings/Sibling KeyRef | `Part.cs`; add new `Edge` flag |
| direct PartModel/MeshView under SubPart | Components/PartModel Key; Components/MeshView | `PartModelModule.cs`, `MeshViewModule.cs` |
| Mesh Id / Material Id | Mesh Ref / Material Ref | typed DataReference |
| inline PbrMaterial Diffuse Path etc. | top-level Texture Id Path Category, slot Ref | `PbrMaterialReference.cs` |
| Collider Id with bare Box/etc. | Components/Collider Key/Colliders/Box Key etc. | `ColliderModule.cs`, `ColliderTemplate.cs`; ConvexHull/Mesh Ref |
| component Id | component Key (or default XmlType key) | `ModuleBase.cs` |
| direct mass children | InertMasses wrapper | mass objects do not implement IKeyed |
| mass/tank/grain Material Id="Aluminum.2014(s)" | Material Ref="Aluminum.2014" Phase="Solid" | `SubstancePhaseReference.cs`; Phase mandatory |
| Gimbal inside placement | separate Gimbals/Gimbal Key with SubPart KeyRef | `GimbalReference.cs`; retains pivot Transform + angles |
| Rocket/Core Id/SubPartId | Core KeyRef/SubPart | `RocketTemplate.cs` |
| bare Rocket/Nozzle children | Rockets/Rocket; each Rocket has Nozzles/Nozzle KeyRef/SubPart | `RocketTemplate.cs`, `RocketControllerTemplate.cs` |
| FeedFrom attributes Container/Connector/Parent | FeedsFroms/FeedsFrom with FromParent="true", OR child Container KeyRef/SubPart, OR child Connector KeyRef/SubPart | `FeedsFromReference.cs`; exactly one selector |
| ConsumerFeedWiring Id/SubPartId | ConsumerFeedWirings/ConsumerFeedWiring KeyRef/SubPart/FeedsFroms | `ConsumerFeedWiring.cs` |
| Reaction Id | Reaction Ref (MixtureRatio remains child text) | `ReactionReference.cs` |
| SolidMotor Grain Id | Grain Ref | `SolidMotorTemplate.cs` |
| ReactionPlume Reaction="id" | ReactionPlumes/ReactionPlume/Reaction Ref | `ReactionPlumeReference.cs` |
| VolumetricExhaust/PlumeTrail Id | Ref | typed asset refs |
| SoundEvent SoundId | SoundEvent Ref Action | `RocketSoundEvent.cs`, `SoundEvent.cs` |
| Decoupler ConnectorId attr | Decoupler/Connector KeyRef | `Decoupler.cs`; Force unchanged |
| DockingPort/ConnectorId Value | DockingPort/Connector KeyRef | `DockingPort.cs`; energy J / impulse Ns unchanged |
| AttachedInternal/Internal Id or InstanceOf | Internal Ref | `AttachedInternal.cs` |
| inline KeyframeAnimation Id/Path | top-level KeyframeAnimation Id Path; module Key + KeyframeAnimation Ref | `KeyframeAnimationModule.cs`; native file-backed row |
| SolarTracking SubPart attr | SolarTracking/Tracked KeyRef | same source |
| bare text ExcludeSubPart | ExcludeSubParts/ExcludeSubPart KeyRef | same source |
| bare Reactant / PressureCondition | Reactants/Reactant and PressureConditions/PressureCondition | ReactionTemplate/FixedReactionTemplate |
| MixtureRatioCondition bare | MixtureRatioConditions/MixtureRatioCondition/PressureConditions | MixtureReactionTemplate/MixtureRatioCondition |
| TemperatureCondition bare | TemperatureConditions/TemperatureCondition/PressureConditions | ThermalReactionTemplate/TemperatureCondition |
| DepthCondition bare | DepthConditions/DepthCondition | `GrainGeometryTemplate.cs` |
| Reactant Id="H2(l)" | Reactant Ref="H2" Phase="Liquid" MassShare | `ReactantReference.cs` |
| Antimatter/ReactionMass/Collects Id compound phase | Ref substance Id + explicit Phase | AntimatterRamCoreTemplate/MagneticScoop |

Do not change unit wrappers generically: Float/DoubleReference uses Value;
MixtureRatio and DefaultMixtureRatio are text; distances and pressures keep their
typed unit attributes. Flags remain whitespace-separated, ControlMap CSV stays CSV.

The runtime still constructs phase IDs `H2(l)`, `APCP(s)`, etc. in
`SubstanceTemplate.Create()`. Keeping such strings internally is valid if the
current XML boundary deliberately parses/emits Ref + Phase; it is not a legacy
fallback. Explicit phase metadata is preferable for new typed APIs.

## Required document-model decisions

Minimal additive types needed beyond changed XML mapping:

- Add `unknownComponents: RawXmlNode[]` separately to PartGameData and
  SubPartGameData, with empty constructor defaults, normalizer and codec coverage.
  Unknown Part row children stay `unknownChildren`. Parse Components' unknown
  *items*, not the Components wrapper itself. Emit one Components wrapper containing
  typed modules and unknown component items. This prevents both duplicate wrappers
  and a later patch replacing the modeled modules accidentally.
- Preserve raw unknown arrays/singletons at their actual row site. Existing unknown
  wrapper content must not be flattened arbitrarily into Components.
- Extend ConnectorFlag with `Edge`. Extend tank role flags to include `Air` and
  `Water` and combinations: current `ConsumerRole` is flags Engine=1, Thruster=2,
  Air=4, Water=8. The current narrow TankRoleAffinity union would lose life-support
  tank affinity. Use a representation capable of preserving every legal combination.
- Add `key` to Gimbal only if it must differ from subPartInstanceId; emitting an
  intentional deterministic unique Key from the existing instance id can avoid a
  breaking model redesign while still using a separate Gimbals array.
- New Habitat and FuelPort may remain well-placed unknown Components for import/
  export fidelity; authoring UI would require typed models. Habitat has
  HabitableVolume, StorageVolume, LocationAsmb, BlockedConnectors/Connector KeyRef,
  PassesSurfaceAttachments, Suit, Carry. FuelPort has MaxLength, AnchorAsmb,
  SubPart KeyRef, ConnectorMaxAngle, ConnectorPivot, ConnectorTip, ConnectorLeadOut.

The remapper must understand KeyRef in current unknown XML, including Connector,
Tracked, ExcludeSubPart, SubPart, PrimarySequenceModule, and module references with
SubPart selectors. Old ConnectorId/SubPartId-only string remapping is insufficient.
Know the target type before remapping: equal key strings can belong to different
typed scopes. Never turn every Ref into a KeyRef or every KeyRef into a connector.

**Version recommendation:** bump both PROJECT_SCHEMA_VERSION (currently 4) and
PROJECT_EXPORT_VERSION (currently 11). Existing snapshots can carry unknown XML in
old tags/attributes and typed values whose old game contracts are no longer valid;
default filling does not repair it. This is an incompatible current-game contract,
not a reason to write migrations. Append required changelog comments. If an owner
proves a purely additive isolated type change compatible, it alone would not need
a bump, but that does not make the overall stored old raw XML valid.

## Patch semantics export must honor

Source authority: `ContentPrePass.cs`, `ChildMerge.cs`, `ModifyVerbs.cs`.

- Row `Patch`, `Replace`, `Remove`, and corresponding `IfExists` operate on an
  earlier live same-tag/Id row. Extend is **not** a row verb.
- Unmarked child in a Patch **replaces its whole subtree**; it does not recursively
  merge. Patch every singleton ancestor that should retain data.
- Arrays use one wrapper with `Modify="Extend"`. An unmarked item appends.
  Item Patch/Replace/Remove selects **Key first, otherwise Ref**; KeyRef is not a
  merge selector. Duplicate keys, repeated patch child names, missing targets, and
  directives nested in fresh content are rejected.
- A newly declared Part's gameplay patch can Extend empty/missing arrays. A
  connector already declared in geometry must be patched by Key inside Extend,
  otherwise duplicate-key validation fails.
- Patching Components with only gameplay items must retain geometry Components.
  This is especially important for fresh reference SubPart variants that define
  PartModel/MeshView before their gameplay patch.
- Parent copies the parent's **final flattened** definition, including its later
  patches, and derived unmarked arrays replace inherited arrays. Parent may point
  forward. A derived row is not a frozen copy at its appearance in manifest order.
- File-backed Path belongs to the original defining row's mod even after
  Patch/Replace. Define a fresh Texture/file asset in the exporting mod and patch
  the consumer Ref; do not repoint a Core row's Path at a mod-relative binary.

## Source-verified compact fixture shapes

The following are current grammar examples derived from shipped rows, not promises
of a fully game-tested mod. A minimal exported geometry/gameplay pair should look
like this (with concrete referenced stock IDs and payloads supplied):

```xml
<Assets>
  <MeshAtlas Id="Example_MeshAtlas" Path="Meshes/Example.glb" />
  <Texture Id="Example_Diffuse" Path="Textures/Example.ktx2" Category="Vessel" />
  <PbrMaterial Id="Example_Material">
    <Diffuse Ref="Example_Diffuse" />
    <Normal Ref="EmptyNormal" />
    <AoRoughMetal Ref="EmptyWhite" />
  </PbrMaterial>
  <SubPart Id="Example_SubPart">
    <Components>
      <PartModel Key="Example_Model">
        <Mesh Ref="Example_Mesh" />
        <Material Ref="Example_Material" />
      </PartModel>
      <MeshView><Mesh Ref="Example_Mesh_VM" /></MeshView>
    </Components>
  </SubPart>
  <Part Id="Example_Part">
    <SubParts><SubPart Key="body" Ref="Example_SubPart" /></SubParts>
    <Connectors><Connector Key="top"><Transform><Position X="1" /></Transform></Connector></Connectors>
  </Part>
  <Part Id="Example_Part" Modify="Patch" DisplayName="Example">
    <Connectors Modify="Extend">
      <Connector Key="top" Modify="Patch"><Capabilities>BulkFluid</Capabilities></Connector>
    </Connectors>
    <EditorTags Modify="Extend"><EditorTag Ref="Fuel Tanks" /></EditorTags>
    <InertMasses Modify="Extend"><CustomMass><Mass Kg="5" /></CustomMass></InertMasses>
    <Components Modify="Extend">
      <Tank Key="tank"><SphericalTank><OuterRadius M="0.5" /><WallThickness Mm="4" /><Material Ref="Aluminum.2014" Phase="Solid" /></SphericalTank></Tank>
    </Components>
  </Part>
</Assets>
```

For tests use *actual shipped* defaults rather than assuming illustrative texture
IDs above exist. Strong fixture anchors are:

- `CoreFuelTankAAssets.xml` LF1W1HA/B/C Parent + Variants and connector keys;
  `CoreFuelTankAGameData.xml` keyed connector Patch and tank Components.
- `CorePropulsionAGameData.xml` EngineALargeVacAssembly: all engine wrappers,
  FromParent, Reaction Ref, plume refs, SoundEvent Ref; later Part rows use
  Gimbals and ConsumerFeedWirings.
- `CorePropulsionBGameData.xml`: inherited RCS controllers and service plumbing.
- `CoreElectricalAGameData.xml`: top-level animation file rows, current module refs,
  Collider wrappers, and default Battery keys.
- `CoreIVASpaceAGameData.xml`: ordered seats and interior Components.
- `CoreCommandBAssets.xml`, `CoreCommandCAssets.xml`, `CoreSurfacesBAssets.xml`:
  expanded models, cross-file foil references, cosmetic variants.
- `CoreLifeSupportAGameData.xml` and `PartGameData.xml`: Habitat, Air/Water tanks.
- `Reactions.xml`, `GrainGeometries.xml`, `Materials.xml`: current physics catalogs.
- `CoreLaunchPad{A,B,C}Assets.xml` + A GameData: current ICRP schema.

Vendored XML must be recopied byte-for-byte from the live private mirror. Do not
hand-edit a vendor fixture to make old parser tests pass. Add missing dependency
fixtures when testing flattened rows; partial corpus tests otherwise report false
missing-target or missing-ref failures.

## Export correctness inventory

### Main part export

- `serializePartsXml`: SubParts, Connectors wrappers; Key/Ref; gimbal separate.
- `serializeGameDataXml`: Part/SubPart Patch rows; every proper array wrapper;
  shared top-level reactions and animations; Components retained with Extend.
- `buildColliderElement`: component Key, nested Colliders wrapper, shape Key,
  ConvexHull Mesh Ref. No nested Id anywhere.
- `buildFixedReactionElement`: Reactants + PressureConditions; explicit Phase.
- `buildAnimationModuleElement`: hoisted file definition and nested Ref;
  current tracking/exclusion refs.
- `serializeAssets`: identified MeshAtlas, top-level Texture rows, material slots
  Ref, Components, model Key, Mesh/Material Ref, MeshView.
- `buildExportVariantMap`/ReferenceSubPartPlan: a fresh variant must retain the
  original template's full render component set and non-overridden gameplay.
  Parent is a valid way to clone current asset definitions, but intentional
  Components replacement and later gameplay Extend must agree. Do not copy only
  the first model or lose glass/dynamic/occlusion metadata. These isolated
  SubPart export copies are distinct from in-game Part variant families.
- `mod.toml`: custom definition assets before strict gameplay patches. One
  gameplay row per shared template per export plan, with per-part unique IDs.
- `exportIssues`/`engineValidation`/`colliderValidation`: current keys and ref
  validity; legal default component keys; nested raw data cannot bypass invalid
  old schema. XML preview and all delivery routes must share these builders.

### ICRP and other writers

`StaticObjectTemplate.cs` now has SubObjects/SubObject **Key + Ref**,
PartModels/PartModel (model Key, Mesh/Material Ref), and
Colliders/Collider Key/Colliders/shape Key. StaticSubObject inherits this schema.
GameData is same-tag StaticObject Modify=Patch, with SubObjects/Colliders Extend
when appending to stock pads. This directly affects:

- `apps/icrp/src/ksa/staticCatalog.ts` and `staticXmlSerializer.ts`;
- `apps/icrp/src/ksa/modPlan.ts` (extend-stock-pad, cloning and ID ownership);
- `apps/icrp/src/ksa/systemXml.ts`, `landmarkXml.ts` and corpus loading (the
  celestial/system schema also changed; inspect current owner annotations, do not
  mechanically swap Id attributes);
- `scripts/build-cartoon-moon.ts` (old inline file refs and older clutter grammar).

The old ICRP comment about first-wins and rewriting every relative inline texture
Path is obsolete under typed global refs and the new content loader. Verify
landmark and body schemas against current sources before claiming system export.

## Minimum meaningful verification

1. Current vendored real-data fixtures match the live mirror; parse a complete
   ordered corpus. Assert live Part/SubPart counts, expanded files represented,
   nonempty mesh/material URLs, and no bare old tags.
2. Prepass tests cover Parent with later parent patches, row Patch, child replacement,
   retained singleton Patch, array Extend, Key/Ref item matching, duplicate keys,
   unknown verbs, removed rows, abstract rows, and missing target errors.
3. Import a fuel tank variant, a liquid engine, inherited RCS, SRB stack, animated
   solar panel, collider-bearing part, IVA seats, and Habitat/Air-Water data.
   Assert typed modeled data and raw current unknown module fidelity.
4. Export the same cases, merge the exported files in manifest order together with
   a stock corpus, and reparse. Compare gameplay and transforms. Check that all
   serialized nested identities use Key/Ref/KeyRef correctly and file rows have Id.
5. A self-consistent Flexo round trip is insufficient when both parser and writer
   share a wrong shape. Validate output against current source annotations or a
   bounded native ContentPrePass/deserializer harness. Explicitly state if actual
   game loading/rendering was not exercised.

The parent audit found a local .NET 10 SDK and verified the numerical preview
ports separately: DeLavalNozzleConfig, GasProperties, RocketDesign,
FixedReactionTable and IVAController changes are semantic no-ops; several other
config files are identical. This schema research does not imply preview math
needs rewriting. The parent's baseline suite was 40 failures / 2599 passes.

A native **shape-validation** harness can use public
`ContentPrePass.Resolve(List<XElement>, ContentErrors)` and
`ContentDeserializer.Deserialize(FlatRow, ContentTagBinding, ContentTagTable,
IContentLoadProgress?, ContentErrors)` with `ModLibrary.TagTable` (and its
`TryGet(tag, out binding)`). `FlatRow` is a public record taking XElement, Tag,
Id, Mod, ModIndex, File, FileIndex, RowIndex, ContributingFiles. The deserializer's
public overload uses no RowScope: it validates the actual serializer grammar,
unknown attributes/elements and enums without loading native payloads, but does
**not** establish typed reference resolution or runtime readiness. Keep that
verification limit explicit. See current `ContentDeserializer.cs:99` and
`FlatRow.cs`.
