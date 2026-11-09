# Scope — inert-mass definitions

**Baseline:** KSA **2026.11.10.5801**, verified against
`ksa-game-assemblies/current/decomp/KSA/` and `current/Content/Core/`.
**Status:** the nine stock shapes are editable at Part and SubPart scope, with
additive import, variant-safe export and a combined defined-mass preview.

## Contract anchors

- `PartTemplate.cs` declares `InertMasses` with polymorphic XML mass elements;
  the `InertMasses` wrapper lives on `<Part>` and `<SubPart>`. Same-tag
  `Modify="Patch"` rows modify these collections before deserialization;
  `ApplyGameData` and the old GameData XML tags are no longer the loading model.
- `AsmbTransformTemplate.cs`: `<LocationAsmb X Y Z>` in metres and
  `<Paf2Asmb X Y Z>` in Euler XYZ radians. These describe mass position and inertia
  orientation in the assembly frame, independently of render geometry.
- `AsmbVolumetricMassTemplate.cs`: `<Material Ref Phase>` resolves an incompressible solid
  or liquid substance phase; then a valid `<Density>`; then a valid `<Mass>`.
  Authored sources may coexist. Gas materials cannot supply geometric mass.
- `CustomMassTemplate.cs`: uses `<Mass>` directly, with optional
  `<MassSpecificInertia Ixx Iyy Izz>`. `InertiaTemplate.cs` defaults all three values
  to 1, including omitted axes, and replaces non-positive values with 1 at load.
- `AsmbRevolvedMassTemplate.cs`: optional `<Sweep Radians|Degrees>`; absent means
  `2π`. `RadianReference.cs` gives Radians precedence over Degrees.
- `MassReference.cs` adds `Kg`, `G`, `Mg`, `Gg`, `Tg`, `Pg`, `Eg`, `Zg`, `Yg`,
  `Tonnes`, `Lunars`, `Earths`, `Jupiters`, and `Suns`.
  `DensityReference.cs` adds `TonnePerM3`, `KgPerM3`, `GPerM3`, `MgPerM3`, `UgPerM3`,
  and `GPerCm3`. `DistanceReference.cs` adds `Mm`, `Cm`, `M`, `Km`, `Au`, and `Ly`.
- `SubstancePhaseName.cs` constructs phase ids with `(s)` / `(l)` / `(g)` suffixes.
  Densities come from `<Substance Id><Solid|Liquid><StorageDensity ...>` in
  `Materials.xml`, `Volatiles.xml`, and `SolidPropellants.xml`.

| XML shape                     | Distance children                                    |
| ----------------------------- | ---------------------------------------------------- |
| `CustomMass`                  | None                                                 |
| `SolidCuboidMass`             | `LengthX`, `LengthY`, `LengthZ`                      |
| `SolidSphereMass`             | `Radius`                                             |
| `HollowSphereMass`            | `Radius`, `WallThickness`                            |
| `SolidCylinderMass`           | `Length`, `Radius`                                   |
| `HollowOpenCylinderMass`      | `Length`, `OuterRadius`, `WallThickness`             |
| `HollowOpenTruncatedConeMass` | `Height`, `RadiusBase`, `RadiusTop`, `WallThickness` |
| `HollowOpenSemiEllipsoidMass` | `Length`, `Radius`, `WallThickness`                  |
| `HollowOpenOgiveMass`         | `Height`, `Radius`, `WallThickness`                  |

These correspond to the same-named `*Template.cs` classes. Core stock examples
include `CoreLifeSupportAGameData.xml`'s two supply-locker hollow spheres, `CoreElectricalAGameData.xml`'s radial battery B (52 kg cuboid),
`CoreLandingAGameData.xml`'s multi-shape landing leg, `PartGameData.xml`'s hollow
shells, and `CoreCommandAAssets.xml`'s custom inertia.

## Preview and export assumptions

`src/ksa/massDefinitions.ts` ports the volume terms and shell clamping from
`MassGeometry.cs`, including the ogive profile integral and semi-ellipsoid shell
approximation. It resolves the source using the precedence above.
`InertMass.cs` / `ScaleFactors.cs` scale explicit inert mass by the cube of the
largest placement scale axis. `combinedMassSummary` includes each placed template
instance; it does not include the separate `IInertMass` module contributions from
tank/grain walls or stored propellant. It reports unresolved contributions rather
than inventing a density.

`massDefinitionsOverride` records a SubPart's explicit definition list, including
an empty list. `modExport.ts` mints fresh built-in variants when this intent exists.
Explicit definitions are emitted in `<SubPart Id="…" Modify="Patch"><InertMasses>`;
independent copies minted for another setting retain the resolved catalog definitions.
The two paths never both emit the same mass. Editor ids never become KSA attributes.
Unsupported shapes remain raw GameData XML. Unmodeled mass entries remain unresolved in the preview and survive current-schema export.
Incompatible older projects follow the version gate described in [Part XML](part-and-subpart-xml.md).

## Recheck on a game update

Review mass XML declarations and prepass collection merging, every shape's
dimensions/defaults, `MassGeometry` volume formulas, source precedence, substance
phase ids/densities, inertia defaults, `Paf2Asmb` convention, and `ScaleFactors`.
Check that new stock shapes remain preserved until modeled. Run domain, XML,
catalog, variant-export, persistence and undo regressions, plus fixture drift.
