---
name: upgrade-ksa
description: >-
  Validate flexo against a new or changed upstream Kitten Space Agency (KSA) game build and
  decide whether flexo needs changes. Use when a KSA update lands, when asked to "vet/upgrade
  KSA", "check if the game update breaks flexo", "diff the new KSA build", or "re-baseline the
  game version". Diffs a caller-provided CURRENT vs PREVIOUS KSA asset tree, maps every changed
  game-contract surface to flexo's dependent code, drives a per-area contract review, and
  produces a gap report. The caller MUST supply the current and previous KSA asset directories;
  this skill never assumes a path.
---

# upgrade-ksa — vet a KSA game build against flexo

flexo (`src/`) is a **fresh-rebuild editor** for KSA Parts/SubParts: it parses a fixed allow-list
of game XML into a typed model, ports a slice of the game's engine math verbatim, and re-emits
KSA-compliant XML / mod bundles. That makes flexo tightly coupled to the game contract. When KSA
ships a new build, some of what flexo bakes in may have moved. **This skill finds exactly which
flexo code a given KSA change puts at risk, and drives the review to confirm or fix it.**

The authoritative catalog of the flexo↔KSA break-surface already lives in the repo at
[`scope/`](../../../scope/FULL_SCOPE.md). This skill is the **parameterized runbook** over that
catalog: it abstracts the two game snapshots as inputs and gives you the consolidated surface-area
matrix and step order so a review can be done end-to-end.

---

## 0. Inputs — REQUIRED, never hard-coded

This skill operates on **two KSA asset trees the caller provides**. Do not assume, guess, or
reuse absolute machine paths (the `scope/` docs and `AGENTS.md` cite concrete paths as _their_
baseline examples — treat those as illustrative, not as inputs to this skill).

There are also **two KSA decompiled sources the caller provides**. Do not assume, guess ore reuse
absolute machine paths, treat the refs in `AGENTS.md` as illustrative and not inputs to this skill.

| Placeholder  | Meaning                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| `<CURRENT>`  | The **just-shipped** KSA build being vetted (the one flexo must catch up to). |
| `<PREVIOUS>` | The **last-vetted** KSA build flexo is currently known-good against.        |

> Naming bridge: the existing [`scope/GAME_UPDATE_CHECKLIST.md`](../../../scope/GAME_UPDATE_CHECKLIST.md)
> calls these `NEW` and `OLD`. `<CURRENT>` = `NEW`, `<PREVIOUS>` = `OLD`.

**Before doing anything else**, confirm both inputs are available. Each tree root must contain (possibly
nested under a `current/` subdirectory, per the repo convention — locate them, don't assume):

- `decomp/` — decompiled C# (the schema lives in `[XmlType]` / `[XmlElement]` / `[XmlAttribute]`
  attributes + public fields on the template classes).
- `Content/Core/` — the shipped game-data XML + GLSL shaders.
- `version.json` — a commit-by-commit changelog with a `build` field.

If either input is missing, or you cannot find those three items inside it, **STOP and ask the
caller to provide the CURRENT and PREVIOUS KSA asset directory paths.** Do not fall back to a
hard-coded path. Verify each build id with the `build` field of its `version.json` and state both
build ids back to the caller before proceeding.

---

## 1. The one cross-cutting invariant (read this first)

**flexo rebuilds a fresh `<Assets>` DOM from a typed model — it is NOT a byte-faithful editor.**
Parsers read a fixed allow-list; serializers emit only what they model. Two consequences shape
every check below:

- **Added schema is silent data-loss, not a crash.** If KSA adds a new element/attribute that
  flexo doesn't model, importing then exporting a part **silently drops it**. The one exception:
  `<PartGameData>` / `<SubPartGameData>` are passthrough-safe — their _unmodeled child elements and
  root attributes_ are captured as `RawXmlNode` and re-emitted verbatim (so `<Collider>` et al.
  survive). **Everywhere else** — the geometry `<Part>` / `<SubPart>` templates and any other
  top-level `<Assets>` child — an added unmodeled element is dropped. So every review must hunt for
  **added** schema outside that GameData child/attr surface, not only changed schema.
- **Removed / renamed classes/tokens are the breaking risk** — flexo's parser expects them and
  will now read wrong or empty.

## 2. The no-migration constitution (shapes every fix you propose)

Per `AGENTS.md`: **flexo models ONLY the current KSA build. Never write migration / back-compat /
fallback code** (no "read the old token too", no version-gated upcasting) for game-XML parsing OR
persisted projects. When a schema moves, the fix **replaces** the old handling; stale local
projects are **discarded** by the boot-time purge (`sanitizeProjectStorage` → `snapshotMatchesModel`
in `projectStore.ts`), not converted. Any gap you write up must be phrased as "switch flexo to the
new form," never "support both."

---

## 3. Procedure

Work top-down. Only descend into an area if the diff actually touched it.

### 3.1 Read the changelog first (cheap signal)

Read `<CURRENT>/version.json` (and diff against `<PREVIOUS>/version.json` if the range overlaps).
Skim the commit lines for keywords that map to scope areas:

> `Part`, `SubPart`, `GameData`, `XML`, `Editor`, `Tag`, `Category`, `Connector` / `snap` /
> `ToSurface` / `FromSurface`, `Docking`, `Engine` / `Rocket` / `Thrust` / `Nozzle` / `Combust`,
> `Animation` / `Keyframe`, `Character` / `Kitten` / `Eye` / `Glass` / `Visor`, `Mesh` /
> `Material` / `PBR` / `KTX` / `Thumbnail` / `Mod` / `AssetBundle`, `Clutter` / `Ecotype`,
> `Control` / `ControlPoint` / `reference transform`, and any unit rename
> (`Joules` / `Watts` / `Energy` / `Power` / `Impulse`).

The changelog points you at files. It is **not** proof — always read the actual code hunk.

### 3.2 File-level diff (the concrete change surface)

Diff the two provided trees. Use simple, statically-analyzable commands (per `AGENTS.md`):

```sh
# Asset data + shaders flexo reads/targets:
diff -rq <PREVIOUS>/Content <CURRENT>/Content
# Decompiled C# — exclude namespaces flexo never touches:
diff -rq <PREVIOUS>/decomp <CURRENT>/decomp | grep -vE "Brutal|System\.|MIConvexHull|Planet"
```

Call out **"Only in `<CURRENT>`"** (added → silent-data-loss risk, per §1) and **"Only in
`<PREVIOUS>`"** (removed/renamed → breaking risk) lines specifically.

### 3.3 Map changed files → the flexo surface-area matrix

For every changed / added / removed game file, find its row in the matrix in §4. A changed file
that maps to **no** row is either irrelevant (rendering internals, particles, networking, physics
solver) **or a NEW integration surface** — which needs a brand-new `scope/*.md` and a matrix row.
Flag those explicitly; they are the easiest thing to miss.

### 3.4 Per-area contract verification

For each area the diff touched, open its `scope/*.md` **"The contract — what flexo bakes in"**
section and check each stated assumption against the `<CURRENT>` code/XML. The high-value checks
per area are in §4. For each assumption, decide: intact / drifted / broken.

### 3.5 Separate real changes from decompiler noise

Before flagging any `.cs` as changed, read the hunk. Known noise this codebase has repeatedly seen
(NOT behavior changes):

- `"x".AsSpan()` → `"x"`
- `Log.Warning($"…")` → `LogString<Warning>` + `AppendLiteral` / `AppendFormatted`
- `Brutal.ShaderCompilerApi` → `Brutal.ShaderCApi`; `AddMacroDefinition` gaining a `ByteSize` arg
- log line-number / whitespace shifts

### 3.6 Record the outcome + re-baseline

- Update each touched `scope/*.md`: its **Baseline** line → `<CURRENT>` build, its **status**, and
  a "What changed in `<build>`" note. `scope/` staying in sync is a NON-NEGOTIABLE mandate in
  `AGENTS.md` — do it in the same change, citing the game-side class/asset path + exact XML
  element/attribute names.
- Bump the baseline table in [`scope/FULL_SCOPE.md`](../../../scope/FULL_SCOPE.md#baseline-game-version).
- For real gaps, write/refresh `plans/FIX_CURRENT_GAPS_PLAN.md` with severity + exact flexo
  `file:line` + the suggested change (framed per the no-migration rule, §2). Severities:
  **BREAKING** (parse/emit now wrong) · **MISSING-CAPABILITY** (game added something flexo now
  drops / should support) · **SCHEMA-DRIFT** (names/values moved; round-trip-lossy) · **COSMETIC**
  · **NONE**.
- **Re-sync flexo's private asset mirror** so the editor reads the `<CURRENT>` catalog (licensed
  binaries — kitten characters, `Animations/*.glb`, some textures, sometimes `Combustion.xml` —
  are not in the decomp snapshots; flexo serves them from `flexo-private-assets` at `/ksa/`). Some
  contracts (e.g. an animation clip's GLB node structure) can ONLY be verified against that mirror,
  not the decomp trees. See `scope/FULL_SCOPE.md` "OSS / asset availability."
- **Re-sync the vendored test fixtures** if any vendored file's structure changed: `src/ksa/__fixtures__/`
  holds byte-identical Core XML (the only real-data check in OSS CI). Run `cd scripts && bun run
  sync-fixtures` (the `scripts/` workspace is Bun-only), then update the affected parser/catalog
  code + tests in the same change. The drift test in `src/ksa/partCatalog.test.ts` fails on
  mismatch whenever the private tree is present.

### 3.7 Regression tests

flexo's `src/ksa/*.test.ts` (parser / serializer / engine-physics / animation / mod-export) encode
much of the contract. After ANY schema fix, extend the matching test with a `<CURRENT>`-build XML
fixture so the next update auto-catches a re-break. Then run the standard gate:
`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm run fmt:check`.

---

## 4. Flexo surface-area matrix — what each KSA area puts at risk

The complete map of every place a KSA change lands in flexo. Columns: the game-side anchors to
diff (under `<CURRENT>/decomp` + `<CURRENT>/Content/Core`), the flexo modules that depend on them,
the regression tests, and the highest-value checks. Each row's deep contract is in the linked
`scope/*.md`.

### A. Part / SubPart XML · catalog · editor tags · part size — [`scope/part-and-subpart-xml.md`](../../../scope/part-and-subpart-xml.md)

- **Game anchors:** `PartTemplate.cs`, `Part.cs`, `SubPartTemplate.cs`, `EditorTagDefinition.cs`;
  `*Assets.xml` / `*GameData.xml`, `PartGameData.xml`, `CoreEditorTagsGameData.xml`.
- **flexo:** `src/ksa/partXmlParser.ts`, `partXmlSerializer.ts`, `partCatalog.ts`, `catalog.ts`,
  `types.ts`, `src/state/partImport.ts`; UI: `src/ui/EditorTagsField.tsx`, `PartBrowser.tsx`,
  `PartDataButton.tsx`.
- **Tests:** `partXmlParser.test.ts`, `partXmlSerializer.test.ts`, `partCatalog.test.ts`, `catalog.test.ts`.
- **Check:** new `[XmlElement]` / `[XmlAttribute]` on `PartTemplate`/`SubPartTemplate` (→ a dropped
  element — see §1); attribute↔element form changes; renamed unit tokens; `<Diameter>` part-size
  and bare `<Control/>` markers still round-trip; re-diff `CoreEditorTagsGameData.xml` against the
  static `EDITOR_TAG_DEFS` / `KNOWN_EDITOR_TAGS` snapshot (it is NOT a live parse — a new tag/category
  needs a manual snapshot refresh); vendored `__fixtures__` drift.

### B. GameData module blocks — mass · electrical · tanks · decoupler · docking port · control · light — [`scope/gamedata-modules.md`](../../../scope/gamedata-modules.md)

- **Game anchors:** `BatteryTemplate.cs`, `DockingPortTemplate.cs`, `ControlTemplate.cs`, tank /
  decoupler / light templates; the unit reference classes `EnergyReference.cs`, `PowerReference.cs`,
  `ImpulseReference.cs`, `MassReference.cs` (the token→scale tables flexo must match).
- **flexo:** `src/ksa/partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts`.
- **Tests:** `partXmlParser.test.ts`, `partXmlSerializer.test.ts`.
- **Check:** unit token sets + scale factors (`J`/`W`/… — a rename is SCHEMA-DRIFT); attribute-form
  vs child-element form for each module (e.g. DockingPort moved attr→child); any new GameData
  module type flexo should model (added ones survive via `RawXmlNode` passthrough but are opaque to
  the editor).

### C. Engines — thrust/Isp physics + combustion — [`scope/engines.md`](../../../scope/engines.md)

- **Game anchors (ported VERBATIM — must stay byte-identical):** `DeLavalNozzleConfig.cs`,
  `CombustorConfig.cs`, `GasProperties.cs`, `CombustionTable.cs`, `NozzlePerformance.cs`,
  `RocketDesign.cs` / `RocketControllerData.cs`, `EngineDesigner.cs`; `Combustion.xml`.
- **flexo:** `src/ksa/enginePhysics.ts`, `combustionCatalog.ts`, `src/state/engineStore.ts`,
  `combustionStore.ts`; UI: `src/ui/EnginePanel.tsx`, `EngineSections.tsx`, `EngineToolbar.tsx`;
  `src/three/NozzleHandleObject.ts`.
- **Tests:** `enginePhysics.test.ts`, `combustionCatalog.test.ts`.
- **Check:** ANY real (non-noise) hunk in the ported classes is **BREAKING** — map it to the exact
  `enginePhysics.ts` function and re-port. Confirm the constants `9.80665`, `8.31446261815324`,
  `101325`. Watch defaults: `MinimumThrottle` (1.0 = on/off), `AreaRatio` (NaN = required),
  `FxExitDiameter` (visual-only). Electric engines / true SRBs remain impossible data-only — if the
  game added a data path for them, that's a MISSING-CAPABILITY to note.

### D. Animation — keyframe import/export — [`scope/animation.md`](../../../scope/animation.md)

- **Game anchors:** `KeyframeAnimationData.cs` (the GLB-loader contract), `KeyframeAnimationModule.cs`
  (schema); `Animations/*.glb` (only in the private mirror).
- **flexo:** `src/ksa/animationImport.ts`, `animationNaming.ts`, `animationRig.ts`,
  `exportAnimationGlb.ts`, `easing.ts`, `easingFit.ts`; `src/state/animationStore.ts`.
- **Tests:** `animationImport.test.ts`, `animationRig.test.ts`, `exportAnimationGlb.test.ts`,
  `easing.test.ts`, `easingFit.test.ts`.
- **Check:** loader contract + schema shape unchanged; new `<KeyframeAnimationModule>` content is
  fine if it matches the existing shape. Remember flexo models KSA deploy clips as **deployed** (=
  last keyframe, the rest anchor) — verify against the private-mirror GLB node structure, not the
  decomp.

### E. Kittens — Character rendering (EDITOR-ONLY aide) — [`scope/kittens.md`](../../../scope/kittens.md)

- **Game anchors:** `CharacterAssets.xml`, `KittenRenderable.cs`, `AnimatedRenderable.cs`,
  `CharacterRenderResources.cs`, `ModelTranslucent.frag`.
- **flexo:** `src/ksa/kittenAssets.ts`, `src/three/KittenObject.ts`, `kittenBake.ts`.
- **Check:** `CharacterAssets.xml` hash + the gltf material names (`Kitty_Suit`, `KittyHead_mt`,
  `M_CHA_Kitten_Head`, `KittyEye_mt`, `Eyes_KittySklera_mt`); socket bones (`Head_M`, `Chest_M`) +
  the `ATTACHMENT_CORRECTION` derivation; the embedded-`DefaultORM.png` redirect. A changed asset
  path / material name **degrades the editor aide only** — kittens are never exported, so severity
  is lower than an export-path break.

### F. Custom assets · textures · GLB · mod export — [`scope/custom-assets-and-mod-export.md`](../../../scope/custom-assets-and-mod-export.md)

- **Game anchors:** `ThumbnailRenderResources.cs` (the null-deref site), `Mod.cs`, `ModLibrary.cs`,
  `AssetBundle.cs`, `PbrMaterialReference.cs`, `MeshAtlasFileReference.cs`, `mod.toml`;
  `PartModelRenderer` (`ENABLE_EMISSIVE` / `BuildPipelineModel`).
- **flexo:** `src/ksa/modExport.ts`, `assetsXmlSerializer.ts`, `exportGlb.ts`; `src/ktx/encodeKtx2.ts`,
  `decodeImage.ts`; `src/state/customAssetStore.ts`, `assetDb.ts`; `src/three/primitives.ts`.
- **Tests:** `assetsXmlSerializer.test.ts`, `exportGlb.test.ts`, `modExport.test.ts`.
- **Check (each gotcha has already caused an in-game crash):** the null-deref in
  `ThumbnailRenderResources.AddDraw` still has **no** guard ⇒ synthetic Normal + AoRoughMetal still
  required on every `<PbrMaterial>`; KSA still reads the SubPart id from `meshes[i].name` ⇒ the GLB
  mesh-name post-process still needed; `ENABLE_EMISSIVE` still defined (else glow silently dies);
  `mod.toml` / `AssetBundle` loader contract; the KTX2 flavor KSA accepts (the real acceptance test
  is dropping an exported `flexo-parts/` mod into KSA).

### G. Connectors · coordinates · IVA/NotIVA · vehicle reference orientation — [`scope/connectors-coordinates-iva.md`](../../../scope/connectors-coordinates-iva.md)

- **Game anchors:** `Part.Connector` / `Part.cs`, `QuaternionEx.cs`, `Double3Ex.cs`,
  `VehicleEditor.cs`, `PartModel.cs` / `PartModelModule.cs`, `DockingPortTemplate.cs`,
  `Control.cs` / `ControlTemplate.cs`, `FlightComputer.cs`, `Vehicle.cs`.
- **flexo:** `src/three/coords.ts`, `ConnectorObject.ts`, `debugCalibration.ts`; connector
  parse/emit in `src/ksa/partXmlParser.ts` / `partXmlSerializer.ts`; `types.ts`.
- **Check:** `QuaternionEx.CreateFromXyzRadians` + `Double3Ex` axis conventions unchanged (else
  recalibrate `EULER_ORDER` in `coords.ts` — use `?debug=dockingport`); `Part.Connector.Flag` enum
  + `<Flags>` schema; the IVA render gate + `<Internal>` / `<RayTracing>` schema in `PartModel`.
  **Reference-orientation contract:** confirm `Control`/`ControlTemplate` are still empty markers
  (no transform / control-point field), `FlightComputer.UpdateAttitudeTrackError` still aims **Body
  +X** / rolls **+Z**, `VehicleEditor` still pins the root to identity at launch. A new
  `ControlPoint` / "control-from-here" / reference-transform would flip "up follows root" → "up
  follows selected part" — grep `<CURRENT>/decomp` for `controlpoint|control from here|referencetransform`.

### H. Ground clutter — data-only celestial mod — [`scope/ground-clutter.md`](../../../scope/ground-clutter.md)

- **Game anchors:** `GroundClutterReference.cs` + its 6 sibling schema classes (7 `*Reference.cs` total).
- **flexo:** the `ksa-mods/cartoon-moon/` scaffold; `scripts/build-cartoon-moon.ts`.
- **Check:** the 7 schema classes unchanged (`<GroundClutter>` / `Ecotype` / cards / `Opacity`
  cutout). first-wins + core-first load order still holds.

### Cross-cutting (always)

- **Added top-level `<Assets>` schema** outside the GameData child/attr passthrough surface (§1) —
  the silent-drop trap. Check even when no scope row obviously changed.
- **A game file mapping to no row** ⇒ candidate NEW integration surface ⇒ new `scope/*.md` + matrix row.

---

## 5. Deliverable

Produce a review report that states, for the `<PREVIOUS>` → `<CURRENT>` transition:

1. The two build ids (from each `version.json`).
2. The file-level diff summary (changed / added / removed, noise filtered out).
3. Per touched area: the contract assumptions checked and their verdict (intact / drift / broken),
   with game-side `class:member` + exact XML element/attribute names as evidence.
4. A gap list with severities (§3.6) and exact flexo `file:line` targets, each fix framed under the
   no-migration rule (§2).
5. The follow-through actions taken or needed: `scope/*.md` baseline bumps, `FULL_SCOPE.md` version
   bump, `plans/FIX_CURRENT_GAPS_PLAN.md`, private-mirror re-sync, fixture re-sync, new/updated
   regression tests.

If the diff is empty or purely decompiler noise, say so plainly and record **NONE** — a clean bill
of health with the baseline bumped is a valid, complete outcome.
