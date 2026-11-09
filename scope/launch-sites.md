# Launch sites and system mods (ICRP)

ICRP targets the KSA build 5801 contract in `SystemTemplate.cs`,
`SystemBodyEntry.cs`, `AstronomicalTemplate.cs`, `LocationReference.cs`,
`LandmarkReference.cs`, `ModifierReference.cs`, `DecalModifierReference.cs`,
`Mod.cs`, and Core's `Astronomicals.xml`, `SolSystemAstronomicals.xml`,
`SolSystemVehicles.xml`, and `SolSystem.xml`.

A system is a top-level `<System Id>` in an `<Assets>` document. Its `Bodies`
array contains `<Body Ref HomeBody>` and its `Vehicles` array contains
`<Vehicle Ref>`. The game discovers the XML through `assets` in `mod.toml`;
there is no separate `systems` manifest field. Body definitions are top-level
assets, and `ParentBody Ref` belongs to the body. Vehicle definitions likewise
own a `ParentBody Ref` and a `Situation Ref`.

The exporter clones a body when a site targets it, gives the clone a distinct
mod-suffixed ID, redirects the system entry, and clones descendants and starting
vehicles whose `ParentBody` must refer to a renamed body. Other system fields,
body rows and vehicle references are retained. Core textures are global `Texture`
assets referenced by `Ref`, so the clone does not rewrite texture paths. The
private mirror currently omits `SolSystemAstronomicals.xml` and
`SolSystemVehicles.xml`; byte-identical 5801 copies are bundled as fallbacks and
should be refreshed with the game's Core data. Live mirror files take precedence.

Body `Landmarks` contain `<Landmark Key IsLaunchPad>` with a child
`<StaticObject Ref>` and latitude/longitude. A matching Key retargets the stock
landmark; otherwise a new row is appended. A terrain flattener is a keyed `Decal`
inside `Terrain/ProceduralModifiers`, with keyed `Biomes/Biome KeyRef`, a keyed
`Location`, and `<HeightMap Ref="Circle">`. The game evaluates both radius and
altitude in kilometre space. ICRP fields are metres and divide by 1000 at export.
Stock VSFB currently records `AltitudeOffset Km="180"`; this is not evidence
that the Km attribute means metres. `IsLaunchPad` gates pad rendering and
collision. The persisted ground-clutter scaffold is outside this update.

The stock pad can be extended at all its sites by patching its `StaticObject`
with array Extend operations. This update has source and unit-test verification,
but has not been loaded in KSA 5801; recheck spawning and rendering in-game.
