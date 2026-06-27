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

- **Part/SubPart + GameData** — diff `PartTemplate.cs` and the `*GameData.xml` files. Watch for:
  new `[XmlElement]`/`[XmlAttribute]` on `PartTemplate` (→ a dropped element); attribute↔element
  form changes; renamed unit tokens. Confirm `partXmlParser.ts` reads and `partXmlSerializer.ts`
  emits every element the contract lists. Re-diff `CoreEditorTagsGameData.xml` vs
  `KNOWN_EDITOR_TAGS`.
- **Engines** — these classes must stay **byte-identical** to keep the verbatim port valid:
  `DeLavalNozzleConfig`, `CombustorConfig`, `GasProperties`, `CombustionTable`, `NozzlePerformance`,
  `RocketDesign`, `EngineDesigner`. Any real (non-decompiler) hunk in them is BREAKING — map it
  to the matching `enginePhysics.ts` function. Confirm the constants `9.80665`, `8.31446261815324`,
  `101325`.
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
