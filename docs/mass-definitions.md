# Mass definitions

Data → Mass edits the KSA inert-mass definitions for the Part or a placed SubPart
template. Definitions add together. Editing a template affects every placement of
that template in the current Part; other project Parts keep their own data.

The initial shape set covers every shape currently authored by Core:
custom mass, solid cuboid, solid sphere, solid cylinder, open hollow cylinder,
open hollow truncated cone, open hollow semi-ellipsoid, and open hollow ogive.
Each card exposes its mass source, dimensions, assembly-frame location and
orientation. Revolved shapes also expose sweep. Custom mass exposes the three
principal mass-specific inertia values in square metres.

Geometric mass sources follow KSA precedence: Material, then positive Density,
then positive Mass. Imported sources can coexist and remain preserved until the
user changes the source. Materials name physical substance phases such as
`Aluminum.2014(s)`, rather than rendering materials. Custom mass always uses Mass.

**Combined defined mass** sums Part definitions and one contribution for every
placed SubPart. The largest placement scale axis is cubed, matching KSA's
`ScaleFactors`. Template definitions are counted once per placement, not once per
template. Unplaced templates contribute nothing. This sum excludes tank walls,
solid-grain module mass and stored propellant. An unresolved material or preserved
opaque mass makes the readout explicitly partial.

Material densities load from `/ksa/Materials.xml`, `/ksa/Volatiles.xml`, and
`/ksa/SolidPropellants.xml`. Without those libraries, explicit mass and density
remain usable; material-based contributions are reported as unresolved.

## Import and export

Mass definitions are read from geometry `<Part>` / `<SubPart>` and from
`<PartGameData>` / `<SubPartGameData>`. Geometry and GameData contributions append,
including repeated entries. Fresh imports put the supported shapes into editable
cards. Unsupported shapes and additional unknown XML remain preserved.

The serializer emits normalized current KSA units: kilograms, kilograms per cubic
metre, metres, and radians. It preserves source precedence, repetitions, transforms,
custom inertia, root attributes and unknown child elements. Numeric values use the
same six-significant-digit formatting as the rest of Flexo's KSA export.

Built-in template edits export through a fresh SubPart variant. Its mass replaces
the inherited definition, including when the last card is deleted. A variant made
for another setting carries inherited mass forward without duplicating an explicit
override. No shared Core template is changed globally.

## State and history

`massStore.ts` owns scoped mutations. Add, remove and shape changes record one undo
step internally. Numeric, vector and text edits push once at interaction start;
source, sweep and inertia switches push once before the update.

Definition lists and template override intent persist in project snapshots, undo
history, compact exports and share links. The additions default to empty lists and
no override, so project schema versions stay unchanged. Existing custom-mass
scalars remain editable. Existing raw mass XML stays in passthrough without
conversion and is reported as an unresolved contribution.

The game contract and math anchors are in
[scope/mass-definitions.md](../scope/mass-definitions.md).
