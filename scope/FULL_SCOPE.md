# Flexo ↔ KSA integration scope

This is the current catalog of Flexo's dependencies on Kitten Space Agency: XML,
resource identities, imported assets, ported physics, coordinates and rendering.
For internal behavior see [docs](../docs); for upgrade procedure see
[GAME_UPDATE_CHECKLIST.md](GAME_UPDATE_CHECKLIST.md).

## Baseline game version

| Role                             | Build               | Source                                                          |
| -------------------------------- | ------------------- | --------------------------------------------------------------- |
| Current source and asset target  | **2026.11.10.5801** | `ksa-game-assemblies/current` and `flexo-private-assets/assets` |
| Previous verified Flexo baseline | 2026.10.10.5554     | assemblies snapshot git `935a32b`                               |
| Supplied previous assemblies     | 2026.10.25.5707     | `ksa-game-assemblies_prev/current`                              |
| Supplied previous private assets | 2026.10.19.5638     | `flexo-private-assets_prev/assets`                              |

The source audit covers the full baseline-to-current range, not only the supplied
previous checkout. The complete changed-file inventory is in
[KSA_5801_FILE_AUDIT.md](../plans/KSA_5801_FILE_AUDIT.md). Implementation decisions,
validation results and remaining limits are in
[KSA_5801_UPGRADE.md](../plans/KSA_5801_UPGRADE.md). Actual running-game validation
must be distinguished from source, managed-schema and browser checks in that report.
Earlier reviews in `plans/KSA_*_REVIEW.md` are historical and are not current XML
specifications.

## The cross-cutting invariant

**Resolve the current content prepass before interpreting a template.** Current KSA
uses top-level `Id`, global `Ref`, local `Key`/`KeyRef`, explicit collection wrappers,
`Parent`, and same-tag `Modify` rows. `PartGameData`/`SubPartGameData` survive as
filenames and Flexo domain type names, not XML tags. Full schema semantics and
limitations are in [Part XML](part-and-subpart-xml.md).

Flexo rebuilds exports from typed fields plus raw passthrough. Unknown direct row
fields and component modules survive; new fields _inside a modeled module_ require
explicit audit. A successful preview does not prove a valid export, and a valid XML
row does not prove the simulation or GPU appearance. Review both import and export.

Current project schema is **5**, compact project export version **12**. The changed
reference and raw-module representation requires the existing incompatibility gate;
there is no migration or legacy parser. Compatible missing fields still receive
constructor defaults under the established persistence policy.

## Integration map

| Area                         | Contract                                         | 5801 result                                                                                                            |
| ---------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Part/SubPart XML and catalog | [Part XML](part-and-subpart-xml.md)              | Shared ordered prepass; all active packs; explicit Part families and concrete appearance imports                       |
| Component modules            | [GameData modules](gamedata-modules.md)          | Components wrappers and keyed local references; new opaque modules preserved; named Battery/status-light data retained |
| Mass                         | [Mass definitions](mass-definitions.md)          | Current wrappers and material Ref/Phase; nine current stock mass shape editors                                         |
| Engines and reactions        | [Engines](engines.md)                            | Wrapped engine arrays, current reaction/grain catalogs and reference shapes; ported numerical formulas audited         |
| Animation                    | [Animation](animation.md)                        | KeyframeAnimation global refs and keyed component/placement refs; existing GLB transform interpretation retained       |
| Kittens                      | [Kittens](kittens.md)                            | Character assets remain a separate editor-aide pipeline; no native fur/animation simulation                            |
| Custom assets and mod export | [Custom assets](custom-assets-and-mod-export.md) | Identified Texture/MeshAtlas rows, Components, independent resolved built-in copies and ordered patches                |
| Connectors, coordinates, IVA | [Connectors/IVA](connectors-coordinates-iva.md)  | Keyed wrappers, Edge flag and keyed seats; coordinate mapping and view clamps retained                                 |
| Colliders                    | [Colliders](colliders.md)                        | Components/Colliders wrappers and Mesh Ref; stock HostOnly hull resources retained                                     |
| Static objects               | [Static objects](static-objects.md)              | Current static template wrappers, local references and shared resource resolution in ICRP                              |
| Launch sites and systems     | [Launch sites](launch-sites.md)                  | Assets-root System/body/vehicle definitions, landmark wrappers, keyed decals and referenced textures                   |
| Plumbing and feeds           | [Plumbing](plumbing-and-feeds.md)                | FeedsFroms, explicit Container/Connector KeyRef and SubPart scope; Air/Water flags                                     |
| Ground clutter               | [Ground clutter](ground-clutter.md)              | Separate historical scaffold limitation remains; no new clutter-authoring feature                                      |
| Textures and foil            | [Custom assets](custom-assets-and-mod-export.md) | Ordinary PBR channels; UASTC tested with and without simulated BCn capability                                          |

## Catalog and renderer acceptance

The current Core corpus contains 50 explicit Part appearance families, with 128
members and 78 alternate members. Every concrete renderable Part remains individually
addressable in previews. SubPart relationships are editor conveniences backed by
geometry or mutually exclusive usage within native Part families, not arbitrary
suffix inference. Every selected appearance uses its own concrete template.

The browser consumes every model component and resolves meshes across atlases by
GLB mesh name. Foil/cloth have no special shader requirement. Stock meshes have one
primitive each. Built-in Dynamic/Glass module kinds and optional material references
are preserved on export even where preview fidelity is limited.

## Retained limits

- New Habitat, parachute, Grab and similar modules can round-trip as raw data but do
  not gain dedicated authoring or simulation panels in this upgrade.
- The browser does not replicate every native Alpha, glass, ThinFilm, temperature,
  wetness or terrain effect. Existing custom material previews remain approximations.
- Arbitrary new convex collision-hull authoring remains outside the stock hull workflow.
- Native Part family validation is supported; creating a new native family from
  unrelated user assemblies is not an editor feature.
- Core's metadata-only KittenBackPackSubPart has no mesh; it retains its gameplay data
  for Part import and export while remaining absent from the visual SubPart picker.
- Historical ground-clutter scaffold incompatibility **R1** remains open. The
  cartoon-moon generator was not converted as part of the Part upgrade.
- Raw references to an authored Collider component Key cannot be preserved if they
  depend on its original identity: Flexo represents collider shapes together and
  exports a generated component key. The audited stock corpus has no such reference.
- Running-game load/render verification and real mobile-GPU validation are distinct
  from the managed XML and Chromium software-renderer checks recorded in the report.

## Environmental notes

Licensed models and textures remain in the separate private asset mirror. Development
serves them at `/ksa/`; production selects the referenced Part/static resources and
editor aides, preserving metadata without copying unused planetary/cloud payloads.
Private source trees are reference material and were not modified by this upgrade.

Decompiler-only changes are common. Compare semantic hunks before treating changed
files as changed behavior. The full file inventory and focused source reports are
kept with this upgrade so the next review has a reproducible baseline.
