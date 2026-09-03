# Launch sites & system mods (`apps/icrp`)

How KSA defines **launch sites** and what a mod can (and cannot) do about them —
the contract behind ICRP's site management + self-contained system-mod export.
Full evidence: [analysis/icrp/KSA_LAUNCH_SITES_AND_MODS.md](../analysis/icrp/KSA_LAUNCH_SITES_AND_MODS.md)
and [analysis/icrp/PEBKAC_SYSTEM_MODS.md](../analysis/icrp/PEBKAC_SYSTEM_MODS.md);
plan: [plans/ICRP_PLAN.md](../plans/ICRP_PLAN.md) §0.3 (L1–L9) + §Phase 7.

**Baseline:** re-verified against KSA build **2026.9.7.5402** — schema classes byte-identical; the
physics now collides against every launch pad on a body, not just the nearest; see
[What changed in 5402](#what-changed-in-5402).

## Contract facts

1. **A mod cannot patch a Core body** (L1): `<Landmark>`s and terrain `<Modifier>`s live
   only inside the body element (`CelestialTemplate.cs:37-41`,
   `ProceduralModifiersReference.cs:17-18`); a second `<AtmosphericBody Id="Earth">` is
   **silently dropped** first-wins (`AssetBundle.cs:86-92`, `SerializedCollection.cs:20-35`).
   No patch element exists. Hence ICRP ships a whole `<System>` (D2).
2. **Inline bodies in a mod's own `<System>` don't collide with Core** (`SystemTemplate.cs:21-27,
43-48` — system-local lookup; Core inlines Titan/Neptune itself). `<LoadFromLibrary Id Parent>`
   pulls Core bodies. A mod's `systems=[…]` files appear in the game's system picker
   (`Mod.cs:417-441`). Writer: `apps/icrp/src/ksa/systemXml.ts`.
3. **The one partial-override hook**: `<StaticObjectGameData Id="CoreLaunchPadA_Prefab_LaunchPadA">`
   appends sub-objects/colliders to the stock pad — at **all 5** stock Earth sites at once
   (they share the prefab, `Astronomicals.xml:1869-1888`). ICRP's "extend stock pad" mode.
4. **`<Landmark>` schema** (`LocationReference.cs:15-22`, `LandmarkReference.cs:9-10`):
   `Id`, `IsLaunchPad` (default false), `StaticObject` attr; `<Latitude|Longitude Degrees|Radians>`.
   **No heading/rotation** — orientation is fixed up/east/north from lat/lon; rotate the
   complex by rotating its placements about up.
5. **`IsLaunchPad="true"` gates everything**: static rendering (`ShowGroundMarker`),
   the pad collider, the spawn bump, clutter exclusion. But **the launch-site pickers do
   NOT filter on it** — every `LandmarkReference` on a body is offered
   (`VehicleLaunchMenu.cs:310-326`).
6. **Terrain decal** (`DecalModifierReference.cs`): `<Modifier Type="Decal" Name Biomes>` with
   Amplitude/Order/Radius (metres)/Rotation/`<Location>`(lat-lon; its Id is never looked up)/
   `AltitudeOffset`/`SmoothFactor`/`HeightMap`. **`AltitudeOffset Km=` is consumed as METRES**
   (`CelestialRenderData.cs:168-170`, `PrepareModifiers.comp:165`) — the site's local terrain
   height. Core's `circle.dds` height map is reusable by `Id="Circle"`. Builder:
   `apps/icrp/src/ksa/landmarkXml.ts`.
7. **Spawn** (`Vehicle.cs:3898-3959`): altitude = mean radius + max terrain height under the
   4 bottom bbox corners (CPU terrain evaluation **includes decals**) + half-height +
   `GroundOffset + SurfaceHeight`; body frame X=up/Y=east/Z=north; co-rotating, Landed.
8. **Texture references in a cloned body — IN-GAME VERIFIED (2026-08-24)**: a
   `Documents/mods` install can NOT reach Core textures by relative `Path`, and Id-only
   references (stripped `Path`) **do not work in practice** ([V5a] FAILED) despite
   `FileReference.cs:42-49` suggesting otherwise. The reliable form is an **absolute
   `Path` into the game install** (`<install>/Content/Core/<path>`; .NET `Path.Combine`
   keeps an absolute second argument — user-verified working). ICRP rewrites every
   relative `Path=` under cloned/inline bodies (authored `Id=`s kept); `../Core/<path>`
   remains as an option for `Content/<mod>/` installs. Never apply path rewrites to
   ICRP's own asset XML.
9. **A system-INLINE body's landmarks NEVER resolve their static objects — IN-GAME
   VERIFIED (2026-08-24, the blank-pad bug)**: `StaticObject.ResolveAll`
   (`StaticObject.cs:47-66`) calls `ResolveStaticObject()` only for bodies in
   `ModLibrary.TemplateLookup` (+ their runtime `.Bodies`), and inline `<System>` bodies
   live in the system-local lookup (`SystemTemplate.cs:43-48`) — landmark `_staticObject`
   stays null: nothing renders, no collider, no spawn bump. Site-hosting bodies must
   therefore ship as TOP-LEVEL bodies in an `<Assets>` file under a **mod-suffixed id**
   (`Earth_<modId>` — a second "Earth" loses first-wins to Core) referenced from the
   system via `<LoadFromLibrary>`; registration is gated on the selected scenario
   requiring the id (`AssetBundle.cs:86-92`, `SystemInfo.Requires`). Starting-vehicle
   rows bind their celestial via the ROW's `Parent=` (situations are pure orbits), so
   the rename only touches `Parent` attributes.
10. **Mod loading** (`Mod.cs:26-76`, `ModManifest.cs`): `manifest.toml` order = load order,
    **new mods append disabled** (the export dialog says so); `mod.toml` lists `assets=[…]`
    and `systems=[…]` explicitly (no directory scan); paths are mod-dir-relative;
    `Category=` is a texture size cap. Emitter: `apps/icrp/src/ksa/modPlan.ts`.

## Break-surface (re-check on a game update)

`D/KSA/`: `LocationReference.cs`, `LandmarkReference.cs`, `CelestialTemplate.cs`,
`AstronomicalTemplate.cs`, `SystemTemplate.cs`, `SystemInfo.cs`, `AstronomicalReference.cs`,
`DecalModifierReference.cs`, `ModifierReference.cs`, `ProceduralModifiersReference.cs`,
`Mod.cs`, `ModManifest.cs`, `ModLibrary.cs`, `FileReference.cs`, `VehicleLaunchMenu.cs`,
`Vehicle.cs` (spawn), `Celestial.cs` (`GetTerrainHeightFromDirCcf`).
`C/Core/`: `Astronomicals.xml` (the Earth block **hash** — ICRP stamps it per body override
and re-clones on export; drift = re-export), `SolSystem.xml` (**mixed**: `LoadFromLibrary` rows AND ~45 inline bodies carrying 21 Id'd
`Path=` attrs — the texture rules run over EVERY inline body in ICRP's output),
`mod.toml`, `manifest.toml`, `Textures/Planets/_Decals/circle.dds`.

## What changed in 5402

**Nothing in the schema.** `LandmarkReference`, `DecalModifierReference`, `SystemTemplate`,
`Mod.cs`, `ModManifest` and `Astronomicals.xml` / `SolSystem.xml` are unchanged; `LocationReference`
changed only by `IGameViewport` types and a cursor hit-test guard in its debug UI. One behavioural
move worth knowing for site export: `ConstraintSim` used to pick the single nearest launch-pad
landmark within 300 m as the static collider; at 5402 `ResolveLaunchPads` builds a `LaunchPadPose`
list of **every** `LandmarkReference { IsLaunchPad }` on the current celestial whose
`GetStaticObject().CollisionShape.Exists`, posed by `ForwardCcf × (MeanRadius + terrain height)`
and `LandmarkReference.GetAxesCcf(out up, out east, out north)`. Two ICRP sites placed close
together therefore both collide now, instead of the farther one being ignored.
