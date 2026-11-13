# Scope — Part and SubPart XML

**Baseline: KSA 2026.11.10.5801.** This is the current contract. Earlier build reviews
remain in `plans/KSA_*_REVIEW.md`; their XML examples are historical.

## Game-side anchors

Paths are relative to `ksa-game-assemblies/current/decomp/KSA/`.

| Surface                                           | Source                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Ordered definitions, inheritance and modification | `ContentLoader`, `ContentPrePass`, `ChildMerge`, `ContentDeserializer` |
| Global IDs and references                         | `SerializedId`, `DataReference`, `ContentTagTable`, `GameContentTags`  |
| Local keys and references                         | `KeyedTemplate`, `KeyReference`, `ContentRefLookup`, `ModuleBase`      |
| Part and SubPart shape                            | `PartTemplate`, `SubPartTemplate`, `PartInstance`                      |
| Native appearance families                        | `PartTemplate.Variants`, `VariantFamilyCheck`, `PartVariantSwap`       |
| Polymorphic Components                            | `XmlHelper.BuildAttributeOverrides`, component template classes        |

The source-derived details and corpus counts are in
[the schema research](../plans/KSA_5801_SCHEMA_RESEARCH.md) and
[the variant research](../plans/KSA_5801_VARIANTS_RESEARCH.md).

## Current contract

An XML file has an `<Assets>` root. Only top-level assets use `Id`. References to
global assets use `Ref`. Child identities use `Key`; local references use `KeyRef`,
with an optional `SubPart` placement key selecting their scope.

```xml
<Assets>
  <Part Id="Example">
    <SubParts><SubPart Key="body" Ref="CoreBody"/></SubParts>
    <Connectors><Connector Key="top"/></Connectors>
  </Part>
  <Part Id="Example" Modify="Patch" DisplayName="Example">
    <EditorTags><EditorTag Ref="Structural"/></EditorTags>
    <Components Modify="Extend"><Battery Key="cell"><MaximumCapacity J="3600"/></Battery></Components>
  </Part>
</Assets>
```

There are no `PartGameData` or `SubPartGameData` XML element types. Those names still
appear in Flexo's TypeScript domain model and shipped filenames, but gameplay rows
are now `<Part Id="…" Modify="Patch">` and `<SubPart Id="…" Modify="Patch">`.
Geometry and gameplay are one final template after the content prepass.

`src/ksa/contentXml.ts` resolves the ordered file corpus before parsing. A derived
row reads its parent's final patched value, including later parent patches.
Unmarked child replacement, array `Modify="Extend"`, keyed item patches and removes
follow the current prepass. A patch requires an existing same-tag target; fresh
rows, duplicate keys, unsupported directives and cycles are validated. Flexo fails
the catalog on invalid input; the game can report and recover per row. This loader
serves Core's single-mod corpus, not arbitrary mod-order or file-ownership emulation.

All collection wrappers matter: `SubParts`, `Connectors`, `EditorTags`, `Components`,
`Rockets`, `RocketCores`, `RocketNozzles`, `RocketEngineControllers`, `Gimbals`,
and the corresponding nested collections. IVA seats are items in `Components`. Module default keys come
from their XML type names. Imported explicit keys must survive export.

Global substance references separate their `Ref` from their `Phase`; Flexo's internal
phase-suffixed substance strings are an editor representation. Connector flags now
include `Edge`; tank role flags include `Air` and `Water`.

## Catalog and variants

`coreFiles.ts` lists the relevant Core files in manifest order. `coreContent.ts`
loads them once. `catalogPartsFromContent` and `catalogFromContent` consume the same
resolved document. Files containing definitions or patches are all scanned; the
file suffix does not determine a row's purpose. TestContent is excluded.

The current catalog includes all active Part/SubPart packs, including Command B/C,
Life Support A, Structural B and Surfaces A/B. The live-corpus tests check that all
concrete templates, including metadata-only SubParts, and referenced placements are represented and that vendored
XML is byte-identical to the supplied private assets.

Native Part families are explicit `<Variants><Part Ref="…"/></Variants>` lists.
The current corpus has 50 families, 128 members and 78 alternate members. The game
requires family gameplay to agree while allowing SubPart composition to differ.
Flexo groups these families and imports the selected concrete Part. Exact-ID search
and preview manifests retain every concrete member. There is no persisted synthetic
variant field and no suffix-based replacement of arbitrary templates.

SubParts have no native family declaration. The browser's **Related appearances**
are editor relationships: verified geometry-equivalent pairs plus same-stem,
final-capital alternatives used mutually exclusively in explicit Part family
members. Co-occurring components and suffix-only standalones do not form a family.
Selecting an appearance imports that concrete template and its own metadata.

## Rendering resources

`Texture` and `MeshAtlas` are identified top-level assets. Materials reference
textures with `Ref`; model components reference `Mesh` and `Material` with `Ref`.
Mesh identity is the GLB `meshes[i].name`, globally indexed across non-HostOnly
atlases. There is no per-file default atlas. `vite/meshIndex.ts` produces the same
mesh index for development, production and the preview manifest.

SubPart rendering lives under `Components`. The catalog preserves all
`PartModel`, `PartModelDynamic`, `PartModelGlass` and `MeshView` components, their
keys, flags and raw fields. The editor and previews draw every render model.
Material and atlas resolution can cross pack boundaries. Foil/cloth use the same
Diffuse/Normal/AoRoughMetal path; see [custom assets](custom-assets-and-mod-export.md).

`Content/Core/PartAssets.xml` also declares `<SubPart Id="KittenBackPackSubPart">`
without any model component and places it in `<Part Id="KittenBackPackPart">` using
`<SubPart Key="KittenBackPackSubPart" Ref="KittenBackPackSubPart"/>`. This template
remains available for gameplay import/export, but its empty scene object has no
geometry bounds. Preview capture skips it and removes cached thumbnail/turntable
outputs without failing the run; it remains listed in the manifest's `part_ids`.

## Master invariant — typed fields and passthrough

Flexo rebuilds XML from its document model; it is not a byte-faithful XML editor.
Unmodeled direct children and root attributes are preserved as `RawXmlNode` data.
Unmodeled component modules are stored separately in `unknownComponents`, so there
is exactly one Components wrapper on export. Habitat and other newly introduced
modules can survive import without a dedicated authoring panel.

Passthrough does **not** automatically protect new fields inside a modeled module.
Every game update must inspect those template classes. The 5801 audit added explicit
Battery keys and `HasStatusLight`, component keys, Gimbal keys and the current
reference shapes. Full simulation or authoring of Habitat, parachutes and arbitrary
future modules remains outside this change.

An imported built-in SubPart retains its resolved raw template. Exporting an edited
template creates a fresh project-unique copy instead of modifying Core globally.
The copy preserves all render components and untouched metadata. An explicit empty
SubPart gameplay override is meaningful: it removes inherited gameplay rather than
silently restoring it. See [custom assets](custom-assets-and-mod-export.md).

## Multi-part export

One mod can contain multiple Part definitions and multiple mesh atlases. Its
`mod.toml` lists asset definitions before the geometry/gameplay patches that depend
on them. All exported top-level IDs and mesh names must be unique across the mod;
local Keys are unique within the relevant owner/collection. Case-insensitive
collisions are rejected at export boundaries.

The selected native Part appearance is imported as concrete geometry; Flexo's
private exported SubPart copies are a separate concept. No native Variants family
is synthesized for an arbitrary user assembly.

## Persistence and verification

The Key/Ref and passthrough representation is incompatible with earlier project
snapshots: `PROJECT_SCHEMA_VERSION` is 5 and `PROJECT_EXPORT_VERSION` is 12.
Old incompatible snapshots are purged and old compact exports rejected under the
repository's existing version policy. There is no migration or legacy XML parser.

Verification is recorded in [the 5801 upgrade report](../plans/KSA_5801_UPGRADE.md).
Important regressions include final-parent resolution, strict patch semantics,
current catalog completeness, actual selected-member import, preserved multi-model
render declarations, phase references, module keys and resolved export round trips.
