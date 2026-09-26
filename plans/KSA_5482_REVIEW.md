# KSA upgrade review — 5438 to 5482

## Outcome

flexo is updated for KSA **2026.9.22.5482**. One change needed code: Core now authors a new tank
shape, `<Tank><ConicalTank>`, on two nosecones, and flexo dropped those tanks whole on import and
export. The shape is now modeled end to end. Everything else in this build is intact for flexo or
needed documentation only. Changes remain in the working tree; no commits were created.

This completes the **5438 → 5482 compatibility upgrade**. Historical authoring gaps (U2, U3, T1–T4,
S1, S2, R1) remain open and are listed in [FIX_CURRENT_GAPS_PLAN.md](FIX_CURRENT_GAPS_PLAN.md).

## Inputs and method

| Input | Build / location |
| --- | --- |
| Current assemblies | `2026.9.22.5482`, `../ksa-game-assemblies/current`, git `a2f724f` |
| Previous assemblies | `2026.9.10.5438`, `../ksa-game-assemblies_prev/current`, git `93eb864` |
| Previously verified flexo baseline | `2026.9.10.5438`, which matches the supplied previous snapshot |
| Current private assets | `../flexo-private-assets/assets`, build `2026.9.22.5482`, git `dd8149a` |

Both assembly trees contain `decomp/`, `Content/Core/` and `version.json`; the build ids come from
those files. The changelog covers revisions 5439–5481 (`fromRevision: 5438`,
`toRevision: 5482`). Code and XML hunks, not changelog wording, decide every verdict.

- Decompiled sources: **150 changed, 35 added, 6 removed**. No path fell in the excluded
  Brutal/System/MIConvexHull/Planet namespaces.
- Content: **33 changed, 3 added, 0 removed**.
- All changed and added files were swept for serialization declarations, and the template
  classes behind modeled elements were checked for new public fields. Every path is routed in
  [KSA_5482_FILE_AUDIT.md](KSA_5482_FILE_AUDIT.md).
- Three independent reviewers covered engines/plumbing, rendering/parts/IVA and
  colliders/static objects/ground clutter; their key claims (the BRDF hunk, the clutter
  attributes and save keying, capsule usage, hull volume, line citations) were re-checked against
  the decomp before being written into `scope/`.

## Contract verdicts

| Area | Verdict and evidence |
| --- | --- |
| Tanks (GameData) | **MISSING-CAPABILITY, fixed (W1).** `decomp/KSA/Tank.cs` `TemplateData.Tank` gained `[XmlElement("ConicalTank", typeof(ConicalTankTemplate))]`; the new `ConicalTankTemplate` has `<Length>`, `<DomeHeightFraction>`, `<RadiusBase>`, `<RadiusTop>`, `<WallThickness>`. `Content/Core/CoreFairingAGameData.xml` authors it on `CoreFairingA_Prefab_NoseconeE`/`NoseconeG`. `<Tank>` is a modeled child, so flexo's passthrough never saw it and the whole tank vanished. |
| Part / SubPart XML | **INTACT.** `PartTemplate`, `SubPartTemplate`, `ModuleList`, the editor-tag registry and `PartStructuralLimits` are byte-identical. Rev 5475 rewrote seven CoreFairingA blocks into fuel tanks (tags, `BulkFluid` connectors, removed decouplers); every element except the conical shape was already modeled. |
| Engines / reactions / solid motors | **INTACT.** Every class `enginePhysics.ts` and `solidMotorPhysics.ts` ports, and every engine data file, is byte-identical. `RocketControllerData.ComputeFromCores` (rev 5464) is a numerically identical refactor flexo does not port; the new in-game design-point readout (rev 5440) reproduces `predictPerformance`. |
| Plumbing | **INTACT.** Every capability, feed, wiring and flow-topology class is byte-identical; Core's new `BulkFluid` connectors use a modeled token, emitted whitespace-separated. |
| Custom assets / multi-part export | **INTACT export contract; COSMETIC in-game look (W5).** Thumbnail null-deref, mesh-name registry, `ENABLE_EMISSIVE` placement, `PbrMaterialReference`, `MeshIndirect.frag`, `AssetBundle`/`Mod`/`ModLibrary` unchanged. Rev 5472 fixed `Lighting.glsl`'s BRDF lookup to `(dotNV, roughness)`, so exported materials shade differently in game (flexo's three.js preview already uses that convention). Part render state moved to `PartTreeRenderData.cs` with equivalent logic. |
| Kittens | **INTACT.** Character assets and socket math unchanged; `KittenRenderable` draw plumbing only; private character binaries identical. |
| Connectors / coordinates / IVA | **INTACT.** Seat, EVA-door, docking-port, quaternion and control classes byte-identical; **C** / **Shift+C** bindings survive the input refactor; `<Internal>` gate moved without changing its condition. |
| Lights / animation | **INTACT.** Light classes and shaders byte-identical (every `lightValidation.ts` citation holds); animation loader, module and private GLBs unchanged. |
| Colliders | **INTACT schema.** Still `<Box>`/`<Capsule>`/`<Cylinder>`/`<Sphere>`/`<ConvexHull>`; a hull now reports its real volume. S1 unchanged. |
| Static objects / launch sites (ICRP) | **INTACT.** Schema, renderer, bundler output, pad selection and system XML unchanged. Fact 12 (dark metal statics) predates the BRDF fix and needs the [V1]/[V1b] in-game re-run. |
| Ground clutter | **R1 unchanged; documented (W3, W4).** Two optional knobs (`<ClutterObject AngularDamping>`, `<GroundClutterMaterial><KeepBackfaceNormals>`) and a new save rule: the ecotype `Name` keys saved clutter, so names must be unique per body and stable. |

## The fix (W1)

- `TankShape` gained `'Conical'` and `Tank` gained `radiusTopM`; `outerRadiusM` doubles as the
  cone's `<RadiusBase>`, because KSA builds a cylinder as a cone with equal radii
  (`TankGeometry.ComputeCylindricalTank` now delegates to `ComputeConicalTank`).
- The parser reads `<ConicalTank>`, the serializer emits `<Length>`, `<RadiusBase>`, `<RadiusTop>`
  (no `<OuterRadius>`), the project codec carries `con`/`rt`, Scale Everything scales both radii
  on the cross-section factor, switching a tank to Conical starts from equal radii, and the Tanks
  section offers the shape with base and top radius fields.
- `<DomeHeightFraction>` and a tank's `<Paf2Asmb>` remain unmodeled for every shape (W2); Core
  authors neither on a tank.
- `CoreFairingAGameData.xml` joins the vendored fixtures, so open-source CI checks the real data.

## Persistence

`radiusTopM` is additive: old tanks are cylindrical or spherical, where the field is ignored, and
`normalizePart` fills it from `createTank`. `PROJECT_SCHEMA_VERSION` stays 4 and
`PROJECT_EXPORT_VERSION` stays 11. Old export payloads decode as before (no `con` means
Cylindrical). Projects that imported the seven changed CoreFairingA parts before 5482 keep their
older, still valid, decoupler data; nothing is purged or converted.

## Asset and fixture follow-through

The private mirror was already updated to 5482 (`c05ab4a`, `dd8149a`). Every shared XML file
matches the game's `Content/Core` except eight whose only difference is line endings. The
re-encoder dry run reports **0 conversions needed, 70 skipped**, so all non-character atlases are
already UASTC. `bun run sync-fixtures` re-copied all fixtures with no byte change to the existing
17; `CoreFairingAGameData.xml` was added as the 18th, with a README entry and a regression that
checks both conical nosecones.

## Documentation

Every touched `scope/*.md` has a 5482 baseline and a "What changed in 5482" section, and
`FULL_SCOPE.md`'s baseline table and status table moved to 5482. Also updated: `docs/xml-io.md`
(tank XML), `docs/engines.md` (in-game design-point readout), `docs/texturing.md` and
`docs/custom-assets.md` (BRDF fix), `docs/colliders.md` (limits that contradicted its own
header), `apps/icrp/VERIFICATION.md` ([V1] re-run), drifted game citations across `scope/`,
`docs/` and `analysis/`, and the upgrade-ksa skill's engine row (it listed `CombustionTable`,
deleted at 4892, and `RocketControllerData`, never ported, as verbatim ports).

Left as written (older than this build, noted for a later pass): `analysis/HOW_LIGHT_PARTS_WORK.md`
does not mention `<Light><DisableInIva>` (a light with it set ignores the part's light switch), and
`docs/iva-seats.md` / `docs/importing-models.md` describe the `<Internal>` gate without its
`<RayTracing>ShadowProxy</RayTracing>` term, which `scope/connectors-coordinates-iva.md` states in full.

## Validation

| Check | Result |
| --- | --- |
| `pnpm test` | **PASS:** 130 files, 2,551 tests. |
| `pnpm typecheck` | **PASS.** |
| `pnpm run fmt`, `pnpm lint`, `pnpm run fmt:check` | **PASS.** |
| `pnpm smoke` | **PASS:** all 11 browser checks. |
| `pnpm build` | **PASS:** main editor, part preview and ICRP bundles. |
| Browser check of the fix | **PASS:** importing `CoreFairingA_Prefab_NoseconeE` shows a Conical tank with base radius 1 and top radius 0.6843 in Data mode. |
| Fixture identity | **PASS:** all 18 vendored XML files are byte-identical to the private mirror. |

`pnpm run fmt` also rewrote the vendored skill files under `.claude/skills/`, which commit
`bef1f85` added; those edits were reverted and `.claude/**` was added to `.oxfmtrc.json`'s ignore
list beside `.agents/**`, matching how the 5438 review handled the same problem.

**Not run:** loading an exported mod in the running KSA game. The in-game checks still open are
the conical tank's propellant volume, the material look after the BRDF fix, and ICRP's [V1]/[V1b].
