# Game-update checklist — vetting a new KSA build against flexo

Run this whenever KSA ships a new build. It turns the [scope catalog](FULL_SCOPE.md) into a
concrete diff procedure. Goal: find every change that breaks or drifts a flexo↔game integration
point **before** a user hits it.

> Convention used here: `OLD` = the previously-vetted snapshot, `NEW` = the just-shipped one.
> Both live under `/Users/asherwin/repos/meow-sci/ksa-game-assemblies*/current/`.

---

## 0. Set up the two snapshots

1. Keep the previously-vetted assemblies repo as `OLD` (rename its dir with the build suffix, as
   with `ksa-game-assemblies_2026.6.8.4680`).
2. Sync/checkout the `NEW` build into `ksa-game-assemblies/current` (decomp + `Content/`).
3. Confirm builds: `head version.json` in each (the `build` field).

## 1. Read the changelog first

`jq -r '.commits[] | "--- rev \(.rev) [\(.author)]\n" + (.lines|join("\n"))' NEW/version.json`
Skim for keywords that map to scope areas: `Part`, `SubPart`, `GameData`, `XML`, `Editor`,
`Tag`, `Category`, `Connector`/`snap`/`ToSurface`, `Docking`, `Engine`/`Rocket`/`Thrust`/
`Combust`, `Animation`/`Keyframe`, `Character`/`Kitten`/`Eye`/`Glass`, `Mesh`/`Material`/
`PBR`/`KTX`/`Thumbnail`/`Mod`, `Clutter`, and any unit rename (`Joules`/`Watts`/`Energy`/
`Impulse`). The changelog is the human summary — it points you at files; it is **not** proof.

## 2. File-level diffs (concrete change surface)

```
# Asset data + shaders flexo reads/targets:
diff -rq OLD/Content NEW/Content | sort
# Decompiled C# (exclude library namespaces flexo never touches):
diff -rq OLD/decomp NEW/decomp | grep -vE "Brutal|System\.|MIConvexHull|Planet" | sort
```

Note **Only in NEW** (added) and **Only in OLD** (removed) lines specially — added schema is the
silent-data-loss risk (see the master invariant), removed/renamed classes are the breaking risk.

## 3. Map changed files → scope docs

For each changed/added/removed file, find the scope doc that lists it as an anchor (see the
[integration map](FULL_SCOPE.md#integration-map-at-a-glance)). Anything that maps to **no** scope
doc is either irrelevant (rendering/particles/networking/physics-internals) or a **new
integration surface** that needs a new `scope/*.md`.

## 4. Per-area verification (only the areas the diff touched)

For each touched area, open its scope doc's **"The contract"** section and check each assumption
against the NEW code/XML. Highest-value checks, by area:

- **⚠ MODELED elements first — the passthrough does NOT cover them.** Before anything else,
  diff the template classes behind the elements flexo reads field-by-field:
  **`Part.Connector.TemplateBase`** (`<Connector>`), **`CombustorTemplate`** (`<Combustor>`),
  **`DeLavalNozzleTemplate`**/`RocketNozzleTemplate`, **`RocketTemplate`** (`<Rocket>`),
  **`AsmbTankTemplate`** (`<Tank>`), `RocketControllerTemplate`, `GimbalReference`,
  `LightModule.TemplateData`, `BatteryTemplate`/`GeneratorTemplate`/`SolarPanelTemplate`/
  `PowerConsumerTemplate`, `DecouplerTemplate`/`DockingPortTemplate`/`EVADoorTemplate`,
  `CustomMassTemplate`, and the `<PartGameData>`/`<SubPartGameData>` roots themselves.
  A new `[XmlElement]`/`[XmlAttribute]` on ANY of these is **silent data-loss** on the next
  import → export — the `RawXmlNode` passthrough only protects children flexo does NOT model.
  5018 is the cautionary tale: `<Capabilities>` on `<Connector>`, `<FeedsFrom>`/`<Plumbing>`
  on `<Combustor>` and `Id` on `<Tank>` were all dropped, and the result was dead-in-game
  hardware with no error anywhere. Cross-check the two allow-lists in `partXmlParser.ts`
  (`KNOWN_PART_GAMEDATA_CHILDREN` / `KNOWN_SUBPART_GAMEDATA_CHILDREN`): everything in them is
  modeled and therefore unprotected.
- **Static objects / ICRP** ([static-objects.md](static-objects.md),
  [launch-sites.md](launch-sites.md)) — everything ICRP reads is MODELED (there is no
  passthrough on this surface yet): diff `StaticObjectTemplate` / `StaticSubObjectTemplate` /
  `StaticSubObjectInstance` / `StaticObjectGameDataReference` for new `[XmlElement]`s;
  `StaticObjectModel.Bucket` + `StaticObject.frag` for new render buckets;
  `StaticObjectAssetBundler`/`GlbColliders`/`GlbTransforms` for output-format drift (the
  golden tests in `apps/icrp/src/ksa/staticXmlSerializer.test.ts` catch byte changes once the
  fixtures are re-synced); `LocationReference.GetAxesCcf` + `ComputeBody2Cce` for the
  X-up/Y-east/Z-north frame; `Vehicle.GetLaunchPadHeightAtDirCcf`, `UpdateStaticObjectCollider`
  (300 m), `GroundClutterPlacementData` (max-4, +50 m) for the metre semantics;
  `DecalModifierReference` (esp. whether `AltitudeOffset` is still consumed as metres);
  `SystemTemplate`/`AssetBundle.OnDataLoad` for the first-wins body-drop rule D2 rests on;
  and **hash the Core Earth block** in `Astronomicals.xml` — ICRP re-clones it per export, so
  a changed block only needs a re-export, but the mini fixtures under
  `apps/icrp/src/ksa/__fixtures__/` must be re-trimmed when the structure moves.
- **Plumbing topology** ([plumbing-and-feeds.md](plumbing-and-feeds.md)) —
  `ConnectorCapabilityFlags` / `ConnectorCapability` / `ConnectorCapabilityExtensions`
  (especially the `ToCapability()` inversion and the `Intersect()` default),
  `FeedsFromReference.IsValid`, `RocketCoreTemplate.OnDataLoad`, `ConsumerFeedWiring`, and
  `PartTemplate.ResolveConsumerFeedPoints`/`ResolveConsumerFeeds`/`AddResolvedFeed`. Most
  failures here are Error LOGS, not throws — the mod loads and the part just makes no thrust,
  so they cannot be caught by "did it load?".
- **`[Flags]` enum bodies** — any enum flexo emits as element text (`<Flags>`,
  `<Capabilities>`, `<RoleAffinity>`) MUST be **whitespace**-separated: .NET's
  `XmlSerializationReader.ToEnum` does `value.Split(null)` and throws
  `CreateUnknownConstantException` on an unknown token, so a comma-joined body fails the load.
  Core authors single-token bodies almost everywhere, so this will not show up in a diff —
  check flexo's emitters directly.

- **Part/SubPart + GameData** — diff `PartTemplate.cs` and the `*GameData.xml` files. Watch for:
  new `[XmlElement]`/`[XmlAttribute]` on `PartTemplate` (→ a dropped element); attribute↔element
  form changes; renamed unit tokens. Confirm `partXmlParser.ts` reads and `partXmlSerializer.ts`
  emits every element the contract lists. Re-diff `CoreEditorTagsGameData.xml` vs
  `KNOWN_EDITOR_TAGS`.
- **Engines** — these classes must stay **byte-identical** to keep the verbatim port valid:
  `DeLavalNozzleConfig`, `CombustorConfig`, `GasProperties`, `FixedReactionTable`/`MixtureReactionTable`, `NozzlePerformance`,
  `RocketDesign`, `EngineDesigner`. Any real (non-decompiler) hunk in them is BREAKING — map it
  to the matching `enginePhysics.ts` function. Confirm the constants `9.80665`, `8.31446261815324`,
  `101325`.
- **Solid motors** — the second verbatim port (`src/ksa/solidMotorPhysics.ts`, the thrust-curve
  preview) rides on `SolidMotor` (`TrySampleThrustCurve` / `SolveConditionsForArea` /
  `ResizeNozzles` / `ComputeTotalThroatArea`), `SolidGrainSegment`
  (`ComputeBurningAreaAtDepth` / `ComputeGrainMassAtDepth`), `BurnRateLaw`,
  `GrainGeometryTable` and `SolidMotorNozzle.RefreshTwoPhaseEfficiency`. Confirm the constants
  `0.5` (quench fraction), `1.02` (bound margin), `1.2`/`12` (area-ratio floor / template seed)
  and `0.076`/`0.046` (two-phase loss). The two data files it reads —
  `Content/Core/GrainGeometries.xml` and `Content/Core/SolidPropellants.xml` — must keep being
  copied by `flexo-private-assets/copy-assets.ts` (they carry no `<Part>`/`<SubPart>` element,
  so each has its own discovery predicate there).
- **Animation** — `KeyframeAnimationData.cs` (the GLB-loader contract) and
  `KeyframeAnimationModule.cs` (schema) must be unchanged. New `<KeyframeAnimationModule>` content
  is fine if it matches the existing shape.
- **Kittens** — `CharacterAssets.xml` md5 + the gltf material names; `KittenRenderable.cs` socket/
  eye math. A changed character asset path or material name is BREAKING for the editor aide.
- **Custom assets / mod export** — the null-deref site in `ThumbnailRenderResources.AddDraw`
  (still no null guard ⇒ synthetic Normal/ORM still required); `Mod.cs`/`AssetBundle.cs`/`mod.toml`
  loader contract; the PbrMaterial/MeshAtlas/SubPart schema classes; **`ENABLE_EMISSIVE` still
  defined in `PartModelRenderer.BuildPipelineModel`** (else glow silently dies).
- **Connectors / coords / IVA** — `QuaternionEx.CreateFromXyzRadians` + `Double3Ex` axes unchanged
  (else recalibrate `EULER_ORDER`); `Part.Connector.Flag` enum + `<Flags>` schema; `PartModel.cs`
  IVA render gate + `<Internal>`/`<RayTracing>` schema.
- **Vehicle reference orientation** (background contract, [connectors-coordinates-iva.md](connectors-coordinates-iva.md)/[analysis/HOW_UP_WORKS.md](../analysis/HOW_UP_WORKS.md)) — confirm `Control.cs`/`ControlTemplate.cs` are still empty markers (no transform/control-point field); `FlightComputer.UpdateAttitudeTrackError` still aims **Body +X** / rolls **+Z**; `Vehicle.Asmb2Cce => Body2Cce`; `VehicleEditor` still pins the **root** to identity at launch; `IsAllowedAsRootPart` rules + `EditorTagDef RootPartWhitelist`. A new `ControlPoint`/"control-from-here"/reference-transform would flip "up follows root" → "up follows selected part" (grep `controlpoint|control from here|referencetransform`).
- **Light falloff/aim math** ([gamedata-modules.md](gamedata-modules.md); ports in
  `src/ksa/lightFalloff.ts` + `src/three/coords.ts` `lightWorld` family, pinned by
  `lightFalloff.test.ts`) — grep `Content/Core/Shaders/Lighting/LightPrePass.comp` for the
  per-light attenuation block (`falloff = saturate(1.0 - x2 * x2)` / `spotAtt *= spotAtt`): the
  `1 − (d/range)⁴` distance window, the SQUARED spot edge, and the epsilons (`RANGE_EPSILON`
  1e-6, `SPOT_DENOM_EPSILON` 1e-4) must still match `lightFalloff.ts`; confirm
  `LightData.glsl` still packs `innerAngle`/`outerAngle` as COSINES. Diff
  `KSA.Rendering.Lighting/Light.cs`: `MAX_OUTER_ANGLE` (1.5697963) / `MIN_OUTER_ANGLE` (1e-5)
  and `CreateSpotLight`'s swap-THEN-clamp order vs `clampSpotAngles`. Confirm
  `LightModule.UpdateRenderData` still aims spots along local **+X** and transforms the light
  offset by the owner's **full matrix, scale included** (`coords.ts` `lightWorld` — the
  deliberate ≠-collider rule), and `ClusteredLightSystem.cs` still culls `Range <= 0` /
  `Intensity <= 0` lights CPU-side (`CreateLightInstance`'s `IsNearlyZero` guard + the
  `Range <= 0f` check — the shader itself never rejects them). Any change to those two
  formulas must be applied **twice**: `lightFalloff.ts` AND its GLSL mirror in
  `src/three/LightObject.ts` (`VOLUME_FRAGMENT_GLSL`, which shades the coverage volume).
  Then re-read `src/ksa/lightValidation.ts`: its warning messages **quote these members and
  line numbers back to the user** (`ClusteredLightSystem.cs:669,760`, `Light.cs:10` /
  `:56-61`, `LightModule.cs:88,93` / `:115-117`), so a drifted anchor turns a helpful
  warning into a confidently wrong one — `lightValidation.test.ts` pins the citations, not
  just the codes.
- **Ground clutter** — the 7 `*Reference.cs` schema classes unchanged.

## 5. Distinguish real changes from decompiler noise

Before flagging a `.cs` as changed, read the actual hunk. Known-noise patterns this codebase has
seen: `"x".AsSpan()` → `"x"`; `Log.Warning($"…")` → `LogString<Warning>` + `AppendLiteral`/
`AppendFormatted`; `Brutal.ShaderCompilerApi` → `Brutal.ShaderCApi`; `AddMacroDefinition` gaining
`ByteSize` args; log line-number shifts. None of these are behavior changes.

## 6. Record the outcome

- Update each touched scope doc's **Baseline** line to the NEW build and its **status** + "What
  changed in <build>" section.
- For real gaps, write/refresh `plans/FIX_CURRENT_GAPS_PLAN.md` (severity, exact flexo
  file:line, suggested change). Keep severities: **BREAKING** (parse/emit now wrong) ·
  **MISSING-CAPABILITY** (game added something flexo should support / now drops) ·
  **SCHEMA-DRIFT** (names/values moved; round-trip-lossy) · **COSMETIC** · **NONE**.
- Re-run `scripts/copy-ksa-assets-to-private-repo.ts` so the editor reads the NEW catalog, then
  bump the baseline pointer in [FULL_SCOPE.md](FULL_SCOPE.md#baseline-game-version).

## 7. Regression tests

flexo's `src/ksa/*.test.ts` (parser/serializer/engine-physics/animation) encode much of the
contract. After any schema fix, extend the matching test with a NEW-build XML fixture so the next
update catches a re-break automatically.
