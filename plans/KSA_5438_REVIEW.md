# KSA upgrade review — 5402 to 5438

## Outcome

flexo is updated for KSA **2026.9.10.5438** on the existing branch. Changes remain in the
working tree; no commits were created. The substantive changes are the solid-motor burn-profile
port, the current Core exhaust choices, and the crash-tolerance explanation. Current mass data
and parachute material choices are preserved by the existing GameData passthrough.

This completes the **5402 → 5438 compatibility upgrade**, not the historical authoring-feature
backlog. Existing limitations remain listed in [FIX_CURRENT_GAPS_PLAN.md](FIX_CURRENT_GAPS_PLAN.md).

## Inputs and method

| Input | Build / location |
| --- | --- |
| Current assemblies | `2026.9.10.5438`, `../ksa-game-assemblies/current`, git `93eb864` |
| Previous assemblies | `2026.9.7.5402`, `../ksa-game-assemblies_prev/current` |
| Previously verified flexo baseline | `2026.9.7.5402` — matches the supplied previous snapshot |
| Current private assets | `../flexo-private-assets/assets`, build `2026.9.10.5438`, git `ed08bd5` |
| Previous private assets | `../flexo-private-assets_prev/assets` |

Both assembly trees contain `decomp/`, `Content/Core/`, and `version.json`. Build values above
come from those JSON files. The current changelog covers revisions 5403–5437, with
`fromRevision: 5402`, `toRevision: 5438`. Actual code and XML hunks, rather than changelog
wording, determine the conclusions.

- Filtered C# inventory: **198 changed, 54 added, 5 removed**. The filter excludes
  Brutal/System/MIConvexHull/Planet namespace paths and non-C# project metadata. Relevant
  lower-level texture and coordinate dependencies were also checked by the reviewers.
- Content inventory: **25 changed, 4 added, 0 removed**.
- Counts are file differences, not a claim that every changed line is semantic. Renames count
  as one removal and one addition. Noise and runtime-only changes are distinguished in the
  [complete file audit](KSA_5438_FILE_AUDIT.md).
- All changed/added/removed serialization declarations were swept for geometry data loss,
  including modeled GameData children, new top-level Assets families, and fields added without
  a new declaration attribute. Multi-part bundle registration was reviewed explicitly.
- Luna at Extra High reasoning implemented the numerical port; an independent reviewer checked
  it against the current game methods and requested analytical regression coverage.

## Contract verdicts

| Area | Verdict and evidence |
| --- | --- |
| Solid motors | **BREAKING numeric drift, fixed.** `decomp/KSA/SolidMotor.cs:TryComputeBurnGrid` integrates reciprocal burn rate trapezoidally and appends an interpolated quench endpoint. `RecomputeUnburnableGrain` supplies the remaining mass. `TryEvaluateThrustProfile` uses `NozzlePerformance.GetRocketPerformance`. These replace the older preview timing and cutoff calculation in `src/ksa/solidMotorPhysics.ts`. |
| Liquid engines / reactions | **INTACT.** De Laval, combustor, gas and nozzle-performance equations; reaction tables; `Reactions.xml`, `SolidPropellants.xml`, `GrainGeometries.xml`; and the physical constants remain compatible. Game planner/cache refactors are not new editor features. |
| Exhaust ids | **SCHEMA-DRIFT, fixed.** `Content/Core/ExhaustAssets.xml` replaces the two auxiliary plume template ids with `EngineAAuxiliary`; `CorePropulsionAGameData.xml` now references it through `<ReactionPlume><VolumetricExhaust Id>`. flexo's chooser uses the six current ids. No alias or automatic conversion is introduced. |
| Part / SubPart XML | **INTACT.** `PartTemplate` and `SubPartTemplate` declarations are unchanged. The static editor-tag snapshot remains valid. `<Part CrashTolerance>` still stores an optional pressure in Pa on geometry, never on `<PartGameData>`. |
| Crash tolerance | **COSMETIC documentation drift, fixed.** `Part.CrashTolerancePascals` passes `ComputeSubtreeInertMass()` and `ColliderVolumeCubicMetres` to `PartStructuralLimits.ResolveCrashTolerance`. Derived strength is `9 MPa × clamp(density/330, .1, 8)` with final 0.1–100 MPa bounds. Invalid mass/volume uses 9 MPa; no bounding-box fallback. flexo does not simulate structural failure, so only its help text and contract descriptions change. |
| Mass / electrical / other GameData | **INTACT after fixture refresh.** New Core `<SolidCylinderMass>` and `<SolidCuboidMass>` children, including their location/dimension data, pass through unchanged. Existing units, battery/generator/tank/control forms and light attenuation/aim formulas remain valid. |
| Parachutes | **INTACT passthrough, authoring still limited.** `Parachute.TemplateData.Materials` adds ordered `<PbrMaterialRef Id>` children at Part and SubPart scope. The whole unknown `<Parachute>` module survives import/export. Historical U2 remains: no dedicated chute authoring UI. |
| Custom materials / GLB / multi-part export | **INTACT.** `PbrMaterialReference.DisplayName` labels Core canopy choices; part material references keep their Core ids. `MeshReference` runtime bounds and `PartModel*` dent buffers do not alter authored geometry. Normal/ORM remain required by `ThumbnailRenderResources.AddDraw`; named, indexed GLBs and flat N-Part/N-atlas registration remain required. |
| Animation / kittens | **INTACT for this update.** Animation loader and module unchanged; all ten private animation GLBs and all 43 character files are byte-identical. The MMU labels texture changed upstream. The old MMU attachment selection is historical T4, not a new regression. |
| Connectors / coordinates / IVA | **INTACT.** Current connector enums, rotations, seat axes/view clamps, and selected-control-frame behavior remain unchanged. Decompiled local-variable renames are not math changes. |
| Colliders | **INTACT authored shapes, changed game runtime use.** Analytic collider volumes now feed crash tolerance. The old unsupported `<ConvexHull>` feature remains S1; this update adds no collider shape. |
| ICRP / launch sites | **INTACT.** `DecalModifierReference.Apply` gains a distance guard; exported units and schema do not change. `ConstraintSim.UpdateStaticObjectCollider` still chooses one nearest pad within 300 m. A previous scope statement claiming simultaneous collision against all pads was incorrect and is corrected. |
| Plumbing | **INTACT authoring.** `ResourceManager`, `PartFlowTopology`, `FlowOrder` and consumer drain operations change runtime behavior. `<FeedsFrom>`, `<Plumbing>`, capabilities and container identities keep their existing contracts. |
| Ground clutter | **No new delta.** Historical R1 still prevents the old cartoon-moon scaffold from loading. The scope's contradictory introductory claim of compatibility is corrected; this upgrade does not rebuild that scaffold. |

Per-area member citations and assumptions are expanded in the updated [scope catalog](../scope/FULL_SCOPE.md).

## New schema outside Part authoring

- `AssetBundle.Assets` adds `<ExplosionVolume>` and `<Explosion>` with emitter/volume/sound
  references. These are global destruction-effect definitions, not new fields on Part geometry.
- `FxDeformation` adds `<FxDeformationData><Dent>` and `VehicleData` adds `IsDebris` for runtime
  vehicle saves. flexo exports fresh part definitions, not damage state or vehicle saves.
- `GalacticPlane` adds optional `<NorthCelestialPoleLongitude>`; flexo does not reproduce the
  celestial sky renderer. ICRP's `buildSystemXml` deep-clones the stock System, preserving its
  children before changing the site-hosting body references.
- Removed `PressureModifiers`/`ThrottleModifiers` and old MachDiamonds fields belong to the
  exhaust-definition renderer; flexo references Core exhaust templates by id rather than
  rebuilding those definitions.

These are explicitly routed outside the Part authoring surface. They are **not** claimed to be
protected by GameData passthrough and do not create a new flexo integration module.

## Asset and fixture follow-through

The current private mirror already contains the 5438 catalog (`ce1355b`) and UASTC conversion
(`ed08bd5`). Of the shared XML/JSON files, 35 match byte-for-byte and eight XML files differ only
in line endings; their parsed text is identical. The mirror-to-previous comparison has 15 changed
files plus a `.DS_Store` addition, no removals. Licensed binaries stay in the private repository.

The texture re-encoder dry run reports **0 conversions needed, 70 skipped**. All 70
non-character KTX2 files have transcodable `vkFormat=0`; no fresh BCn texture copy was made, so
no destructive mirror wipe or redundant re-encode was performed. Character textures keep their
existing game-export format.

Ran `bun run sync-fixtures --src …/flexo-private-assets/assets` from `scripts/`: all 16 existing
fixtures refreshed. Only electrical mass data and propulsion exhaust references changed bytes.
Added the byte-identical current `CoreUtilityAGameData.xml`, bringing the set to 17 fixtures,
with its README entry and portable ordered-material regression. The normal fixture drift test
also checks the newly added file automatically.

## Persistence

The burn curve is derived output, and crash-tolerance overrides still mean Pa. Neither changes
the saved document layout, units, or meanings. The exhaust reference remains an external asset
id; no old-id alias or conversion is added. Unknown exhaust ids now produce an engine/export warning against the current Core catalog,
including saved references to removed templates. A separate mod may still supply an external
id, so the warning does not destroy or rewrite the project. `PROJECT_SCHEMA_VERSION` stays 4
and `PROJECT_EXPORT_VERSION` stays 11; no migration or purge is needed.

## Validation

| Check | Result |
| --- | --- |
| `pnpm test` | **PASS:** 129 files, 2,542 tests, including the final analytical burn-exponent variants (0 and 0.35). |
| `pnpm typecheck` | **PASS** on the final code. |
| `pnpm run fmt`, `pnpm lint`, `pnpm run fmt:check` | **PASS.** |
| `pnpm smoke` | **PASS:** all 11 browser checks, including stock EngineA3 performance and RCS controls. |
| `pnpm build` | **PASS:** main editor, part preview, and ICRP bundles. Built assets report `2026.9.10.5438`; the preview manifest lists 174 parts. |
| Fixture identity | **PASS:** all 17 vendored XML files are byte-identical to the current private mirror. |
| `git diff --check` | **PASS.** |
| React rules | Only existing help text changed; no hooks, memoization, render effects, or mutation were added. |

The first browser attempt was blocked before tests by the macOS sandbox's Chromium IPC
restriction; the approved retry passed. The formatter initially attempted to rewrite read-only
skill reference files. `.oxfmtrc.json` now excludes the actual `.agents/**` directory in place of
the obsolete `.claude/**` entry; the required bare formatter and format check then passed.

An independent numerical review compared the neutral-grain preview with a closed-form quench
calculation. The updated result agreed within 1e-12 seconds and 1e-11 kg; the old integration
reported 39.9240 seconds versus the current 40.1475 seconds. Peak thrust stayed unchanged.

**Not run:** loading an exported mod in the running KSA game. The supplied source/assets,
serialization regressions, production build, and browser smoke checks do not substitute for
that in-game acceptance test. Historical authoring gaps remain documented above.
