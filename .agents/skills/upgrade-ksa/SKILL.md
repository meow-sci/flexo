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

> **`scope/` outranks this file.** The matrix in §5 is a routing table — area → flexo modules →
> tests → high-value checks. The *contract itself* (every assumption, with game-side citations and
> a per-build verdict) lives in the linked `scope/*.md`, which is updated on every contract change
> and is therefore always fresher. If they disagree, believe `scope/` and fix the matrix row.

You can also reference the decompiled game sources under the included ksa-game-assemblies
repository that is included in this session.

---

## 0. Inputs — REQUIRED, never hard-coded

This skill operates on **two KSA asset trees the caller provides**. Do not assume, guess, or
reuse absolute machine paths (the `scope/` docs and `AGENTS.md` cite concrete paths as _their_
baseline examples — treat those as illustrative, not as inputs to this skill).

There are also **two KSA decompiled sources the caller provides**. Do not assume, guess or reuse
absolute machine paths; treat the refs in `AGENTS.md` as illustrative and not inputs to this skill.

| Placeholder  | Meaning                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| `<CURRENT>`  | The **just-shipped** KSA build being vetted (the one flexo must catch up to). |
| `<PREVIOUS>` | The **last-vetted** KSA build flexo is currently known-good against.          |

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

**Then read the "Baseline game version" table at the top of
[`scope/FULL_SCOPE.md`](../../../scope/FULL_SCOPE.md#baseline-game-version)** — it names the build
flexo is *actually* verified against, plus any newer-but-unvetted build already sitting in the
working dirs and the areas its changelog already flags. If the caller's `<PREVIOUS>` is NOT that
verified baseline, say so: the review must span baseline → `<CURRENT>`, not just the caller's two
directories, and the older deltas are recoverable from `ksa-game-assemblies` git history (the
`_prev` mirror goes stale as builds land).

---

## 1. The three cross-cutting invariants (read these first)

### 1.1 flexo rebuilds a fresh DOM — it is NOT a byte-faithful editor

Parsers read a fixed allow-list; serializers emit only what they model. Two consequences shape
every check below:

- **Added schema is silent data-loss, not a crash.** If KSA adds a new element/attribute that
  flexo doesn't model, importing then exporting a part **silently drops it**. The one exception:
  `<PartGameData>` / `<SubPartGameData>` are passthrough-safe — their _unmodeled child elements and
  root attributes_ are captured as `RawXmlNode` and re-emitted verbatim. **Everywhere else** — the
  geometry `<Part>` / `<SubPart>` templates and any other top-level `<Assets>` child — an added
  unmodeled element is dropped. So every review must hunt for **added** schema outside that
  GameData child/attr surface, not only changed schema.
- **Removed / renamed classes/tokens are the breaking risk** — flexo's parser expects them and
  will now read wrong or empty.

### 1.2 One project = N Parts = ONE mod

flexo projects hold **multiple Parts** (`src/state/partsStore.ts`; the active part's document is
`$part`, the rest are parked). An export emits **every included part into the same three KSA
files** — N `<Part>` / `<PartGameData>` / `<MeshAtlas>` siblings in one `*Assets.xml` /
`*GameData.xml` / atlas set, with per-part namespaced export-variant ids
(`flexo_<base>_<ns>_<templateId>`, see `partExportNs` / `buildMultiModContent` in
`src/ksa/modExport.ts`) and cross-part dedupe of shared game data. This is legal per
`AssetBundle`'s flat `List<SerializedId>` — **so any KSA change to how a bundle enumerates or
dedupes assets, or to id uniqueness rules, is now a multiplied risk**, not a single-part one.
Check it explicitly against `Mod.cs` / `ModLibrary.cs` / `AssetBundle.cs`. Contract detail:
[`scope/custom-assets-and-mod-export.md`](../../../scope/custom-assets-and-mod-export.md);
flexo-side behavior: [`docs/multi-part.md`](../../../docs/multi-part.md).

### 1.3 The no-migration constitution (shapes every fix you propose)

Per `AGENTS.md`: **flexo models ONLY the current KSA build. Never write migration / back-compat /
fallback code** (no "read the old token too", no version-gated upcasting) for game-XML parsing OR
persisted projects. When a schema moves, the fix **replaces** the old handling; stale local
projects are **discarded, never converted**, by the boot purge:
`purgeIncompatibleProjects()` inside `hydrateProjectOnBoot()` in `src/state/projectStore.ts`
deletes any stored project whose `schemaVersion !== PROJECT_SCHEMA_VERSION` (currently 4) along
with its asset blobs. **If a schema fix changes the meaning of persisted document data, bump
`PROJECT_SCHEMA_VERSION`** — that is the entire migration story. Any gap you write up must be
phrased as "switch flexo to the new form," never "support both."

---

## 2. Procedure

Work top-down. Only descend into an area if the diff actually touched it.

### 2.1 Read the changelog first (cheap signal)

Read `<CURRENT>/version.json` (and diff against `<PREVIOUS>/version.json` if the range overlaps).
Skim the commit lines for keywords that map to scope areas:

> `Part`, `SubPart`, `GameData`, `XML`, `Editor`, `Tag`, `Category`, `Connector` / `snap` /
> `ToSurface` / `FromSurface`, `Capabilit*` / `FeedsFrom` / `Plumbing` / `Container`, `Docking`,
> `Collider` / `Collision`, `Engine` / `Rocket` / `Thrust` / `Nozzle` / `Combust` / `Reaction` /
> `Plume`, `Solid` / `Grain` / `Motor`, `Animation` / `Keyframe`, `IVA` / `Seat` / `EVADoor`,
> `Light` / `falloff`, `Character` / `Kitten` / `Eye` / `Glass` / `Visor`, `Mesh` / `Material` /
> `PBR` / `KTX` / `Thumbnail` / `Mod` / `AssetBundle`, `Clutter` / `Ecotype`, `Control` /
> `ControlPoint` / `reference transform`, and any unit rename
> (`Joules` / `Watts` / `Energy` / `Power` / `Impulse` / `Area` / `Distance`).

The changelog points you at files. It is **not** proof — always read the actual code hunk.

### 2.2 File-level diff (the concrete change surface)

Diff the two provided trees. Use simple, statically-analyzable commands (per `AGENTS.md`):

```sh
# Asset data + shaders flexo reads/targets:
diff -rq <PREVIOUS>/Content <CURRENT>/Content
# Decompiled C# — exclude namespaces flexo never touches:
diff -rq <PREVIOUS>/decomp <CURRENT>/decomp | grep -vE "Brutal|System\.|MIConvexHull|Planet"
```

Call out **"Only in `<CURRENT>`"** (added → silent-data-loss risk, per §1.1) and **"Only in
`<PREVIOUS>`"** (removed/renamed → breaking risk) lines specifically.

If `<PREVIOUS>` is not the verified baseline (§0), diff the baseline instead via
`ksa-game-assemblies` git history rather than trusting the stale `_prev` mirror.

### 2.3 Map changed files → the flexo surface-area matrix

For every changed / added / removed game file, find its row in the matrix in §5. A changed file
that maps to **no** row is either irrelevant (rendering internals, particles, networking, physics
solver) **or a NEW integration surface** — which needs a brand-new `scope/*.md` and a matrix row.
Flag those explicitly; they are the easiest thing to miss.

### 2.4 Per-area contract verification

For each area the diff touched, open its `scope/*.md` **"The contract — what flexo bakes in"**
section and check each stated assumption against the `<CURRENT>` code/XML. The high-value checks
per area are in §5. For each assumption, decide: intact / drifted / broken.

### 2.5 Separate real changes from decompiler noise

Before flagging any `.cs` as changed, read the hunk. Known noise this codebase has repeatedly seen
(NOT behavior changes):

- `"x".AsSpan()` → `"x"`
- `Log.Warning($"…")` → `LogString<Warning>` + `AppendLiteral` / `AppendFormatted`
- `Brutal.ShaderCompilerApi` → `Brutal.ShaderCApi`; `AddMacroDefinition` gaining a `ByteSize` arg
- log line-number / whitespace shifts

### 2.6 Record the outcome + re-baseline

- Update each touched `scope/*.md`: its **Baseline** line → `<CURRENT>` build, its **status**, and
  a "What changed in `<build>`" note. `scope/` staying in sync is a NON-NEGOTIABLE mandate in
  `AGENTS.md` — do it in the same change, citing the game-side class/asset path + exact XML
  element/attribute names.
- Bump the baseline table AND the per-area status table in
  [`scope/FULL_SCOPE.md`](../../../scope/FULL_SCOPE.md#baseline-game-version) (the status-column
  header carries the build number — move it), and clear/re-word the "newer unvetted build" warning
  callout if `<CURRENT>` is the build it was warning about.
- If flexo behavior changed (not just the catalog), update the matching **`docs/*.md`** too —
  `AGENTS.md` mandates it separately from `scope/`. The matrix rows below name the doc.
- For real gaps, write/refresh `plans/FIX_CURRENT_GAPS_PLAN.md` with severity + exact flexo
  `file:line` + the suggested change (framed per the no-migration rule, §1.3). Severities:
  **BREAKING** (parse/emit now wrong) · **MISSING-CAPABILITY** (game added something flexo now
  drops / should support) · **SCHEMA-DRIFT** (names/values moved; round-trip-lossy) · **COSMETIC**
  · **NONE**.
- **Re-sync flexo's private asset mirror** so the editor reads the `<CURRENT>` catalog (licensed
  binaries — kitten characters, `Animations/*.glb`, some textures, sometimes `Reactions.xml` —
  are not in the decomp snapshots; flexo serves them from `flexo-private-assets` at `/ksa/`). Some
  contracts (e.g. an animation clip's GLB node structure) can ONLY be verified against that mirror,
  not the decomp trees. See `scope/FULL_SCOPE.md` "OSS / asset availability."
  **After any texture re-sync, re-run the UASTC re-encode** (`flexo-private-assets/tools/reencode-textures-uastc.py`)
  — freshly copied SubPart atlases are BCn and flexo requires UASTC for universal device support.
- **Re-sync the vendored test fixtures** if any vendored file's structure changed: `src/ksa/__fixtures__/`
  holds byte-identical Core XML (the only real-data check in OSS CI). Run `cd scripts && bun run
  sync-fixtures` (the `scripts/` workspace still runs *that* legacy script on Bun; new scripts there
  are vanilla Node — see `scripts/CLAUDE.md`), then update the affected parser/catalog code + tests
  in the same change. The drift test in `src/ksa/partCatalog.test.ts` fails on mismatch whenever the
  private tree is present.

### 2.7 Regression tests + the gate

flexo's `src/ksa/*.test.ts` and `src/state/*.test.ts` (parser / serializer / engine + solid-motor
physics / colliders / lights / animation / import / mod-export / multi-part) encode much of the
contract. After ANY schema fix, extend the matching test with a `<CURRENT>`-build XML fixture so
the next update auto-catches a re-break. If the fix touched the persisted document model, also
extend `src/state/projectStore.test.ts` (purge behavior) and `projectCodec.test.ts` /
`projectTransfer.test.ts` (archive/transfer round-trip).

Then run the standard gate, bare (per `AGENTS.md`):

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm run fmt:check
pnpm smoke          # scripts/smoke-v2.ts — headless end-to-end pass over the v2 shell
```

---

## 3. What is NOT a KSA-contract concern

The v2 refactor added a large amount of editor surface that has **no game-side counterpart** and
must not be dragged into a game-update review: the five-mode machine and docked shell
(`src/ui/shell/`, `src/state/modeStore.ts`, `layoutStore.ts`), commands/menus/hotkeys
(`src/ui/commands/`, `menu/`, `hotkeys/`, `src/state/commandStore.ts`, `hotkeyStore.ts`), the
outliner (`src/ui/outliner/`), the project manager and `.flexo.tar.gz` archives
(`src/ui/projects/`, `src/state/projectManagerStore.ts`, `projectArchive.ts`, `tarArchive.ts`),
action chains (`src/ui/chain/`, `src/three/chainEval.ts`), layers, measurements, snapping, ghosts
(`src/three/GhostPartsLayer.ts`), and the kitten aide.

A KSA change only reaches these if it moves a *contract* they render. Judge by the matrix, not by
which files a feature happens to touch.

---

## 4. Where the contract lives in flexo (layering)

`src/ksa/` is the only layer allowed to know the game's XML/math contract; `src/state/` holds the
editor model; `src/three/` the viewport; `src/ui/` the React surfaces. **A game-schema fix should
land in `src/ksa/` + `types.ts` first**, and only ripple outward to a store/editor/UI when the new
field needs authoring. That ordering keeps the blast radius of an update small and is why the
matrix below lists `src/ksa/` modules first in every row.

---

## 5. Flexo surface-area matrix — what each KSA area puts at risk

The complete map of every place a KSA change lands in flexo. Columns: the game-side anchors to
diff (under `<CURRENT>/decomp` + `<CURRENT>/Content/Core`), the flexo modules that depend on them,
the regression tests, and the highest-value checks. Each row's deep contract is in the linked
`scope/*.md`; the flexo-internal view is in the linked `docs/*.md`.

### A. Part / SubPart XML · catalog · editor tags · part size — [`scope/part-and-subpart-xml.md`](../../../scope/part-and-subpart-xml.md) · [`docs/xml-io.md`](../../../docs/xml-io.md), [`docs/subpart-catalog.md`](../../../docs/subpart-catalog.md)

- **Game anchors:** `PartTemplate.cs`, `Part.cs`, `SubPartTemplate.cs`, `EditorTagDefinition.cs`;
  `*Assets.xml` / `*GameData.xml`, `PartGameData.xml`, `CoreEditorTagsGameData.xml`.
- **flexo:** `src/ksa/partXmlParser.ts`, `partXmlSerializer.ts`, `partCatalog.ts`, `catalog.ts`,
  `types.ts`; `src/state/partImport.ts`, `partCatalogStore.ts`, `catalogStore.ts`; UI:
  `src/ui/EditorTagsField.tsx`, `src/ui/build/PartBrowserDialog.tsx`, `SubPartBrowserDialog.tsx`,
  `src/ui/data/sections/IdentitySection.tsx`.
- **Tests:** `partXmlParser.test.ts`, `partXmlSerializer.test.ts`, `partCatalog.test.ts`,
  `catalog.test.ts`, `partImport.test.ts`.
- **Check:** new `[XmlElement]` / `[XmlAttribute]` on `PartTemplate`/`SubPartTemplate` (→ a dropped
  element — see §1.1); attribute↔element form changes; renamed unit tokens; `<Diameter>` part-size
  and bare `<Control/>` markers still round-trip; re-diff `CoreEditorTagsGameData.xml` against the
  static `EDITOR_TAG_DEFS` / `KNOWN_EDITOR_TAGS` snapshot in `src/ksa/types.ts` (it is NOT a live
  parse — a new tag/category needs a manual snapshot refresh); vendored `__fixtures__` drift.

### B. GameData module blocks — mass · electrical · tanks · decoupler · docking port · control · light — [`scope/gamedata-modules.md`](../../../scope/gamedata-modules.md) · [`docs/lights.md`](../../../docs/lights.md)

- **Game anchors:** `BatteryTemplate.cs`, `DockingPortTemplate.cs`, `ControlTemplate.cs`, tank /
  decoupler templates; `LightModule.cs` + `KSA.Rendering.Lighting/Light.cs` +
  `Content/Core/Shaders/Lighting/LightPrePass.comp` / `LightData.glsl` (the ported falloff/aim
  math); the unit reference classes `EnergyReference.cs`, `PowerReference.cs`,
  `ImpulseReference.cs`, `MassReference.cs`, `DistanceReference.cs`, `AreaReference.cs` (the
  token→scale tables flexo must match).
- **flexo:** `src/ksa/partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts`, `lightFalloff.ts`,
  `lightValidation.ts`; `src/three/coords.ts` (`lightWorld` / `lightLocalFromWorld` /
  `lightWorldAim`), `LightObject.ts` (`VOLUME_FRAGMENT_GLSL`), `lightVolume.ts`;
  `src/state/dataModeStore.ts`, `gameDataFindings.ts`; UI: `src/ui/data/sections/` (Mass, Power,
  Tanks, Lights, Coupling, Advanced), `src/ui/build/LightInspector.tsx`, `CoveragePanel.tsx`,
  `src/ui/LightFalloffCurve.tsx`.
- **Tests:** `partXmlParser.test.ts`, `partXmlSerializer.test.ts`, `lightFalloff.test.ts`,
  `lightValidation.test.ts`, `gameDataFindings.test.ts`, `dataModeStore.test.ts`.
- **Check:** unit token sets + scale factors (`J`/`W`/… — a rename is SCHEMA-DRIFT); attribute-form
  vs child-element form for each module; any new GameData module type flexo should model (added
  ones survive via `RawXmlNode` passthrough but are opaque to the editor — `src/ui/data/PassthroughViewer.tsx`
  shows them, which is the cheap way to spot one). For lights: the falloff/aim formulas are a
  **port** — any real hunk in the shader or `Light.cs` means re-porting `lightFalloff.ts` AND
  re-checking that `lightValidation.ts`'s warning strings still quote real members.

### C. Engines — thrust/Isp physics · reactions · solid motors · nozzle exhaust — [`scope/engines.md`](../../../scope/engines.md) · [`docs/engines.md`](../../../docs/engines.md)

- **Game anchors (ported VERBATIM — must stay byte-identical):** `DeLavalNozzleConfig.cs`,
  `CombustorConfig.cs`, `GasProperties.cs`, `CombustionTable.cs`, `NozzlePerformance.cs`,
  `RocketDesign.cs` / `RocketControllerData.cs`, `EngineDesigner.cs`; the reaction family
  (`ReactionTemplate.cs`, `FixedReactionTable.cs`, `MixtureReactionTable.cs`) + `Reactions.xml`;
  solid motors (grain geometry / burn-rate classes, `AreaReference.cs`);
  `RocketNozzleTemplate.cs` (`OnDataLoad` FX fallback, `<ReactionPlume>`), `RocketNozzle.cs`
  (`ResetState` frames), `PartTemplate.cs` (`RocketNozzles` list, both scopes), `Part.cs`
  (`MatrixAsmb2VehicleAsmb` vs `Asmb2VehicleAsmb`), `Vehicle.cs` (roll-free plume).
- **flexo:** `src/ksa/enginePhysics.ts`, `reactionCatalog.ts`, `solidMotorPhysics.ts`,
  `grainGeometryCatalog.ts`, `engineValidation.ts`; `src/state/engineStore.ts`, `reactionStore.ts`,
  `solidCurveStore.ts`; UI: `src/ui/engine/` (`EngineNavigator.tsx`, `DefineEngineMenu.tsx`,
  `defineEngineModel.ts`), `src/ui/data/sections/TemplateEngineSection.tsx`,
  `src/ui/data/EngineModeLink.tsx`; `src/three/NozzleHandleObject.ts`.
- **Tests:** `enginePhysics.test.ts`, `reactionCatalog.test.ts`, `solidMotorPhysics.test.ts`,
  `engineValidation.test.ts`, `engineStore.test.ts`.
- **Check:** ANY real (non-noise) hunk in the ported classes is **BREAKING** — map it to the exact
  `enginePhysics.ts` / `solidMotorPhysics.ts` function and re-port. Confirm the constants
  `9.80665`, `8.31446261815324`, `101325`. Watch defaults: `MinimumThrottle` (1.0 = on/off),
  `AreaRatio` (NaN = required), `FxExitDiameter` (visual-only). Confirm the `<Reaction Id>` +
  `<MixtureRatio>` combustor form and the Mixture-2D-LUT-sliced-at-load vs Fixed-1D split still
  match `reactionCatalog.ts`. Confirm `<ReactionPlume Reaction Default>` is still a repeatable
  element (flexo models `reactionPlumes[]`, not two scalars). Electric engines remain impossible
  data-only — if the game added a data path, that's a MISSING-CAPABILITY to note.

### D. Animation — keyframe import/export — [`scope/animation.md`](../../../scope/animation.md) · [`docs/animation-editor.md`](../../../docs/animation-editor.md)

- **Game anchors:** `KeyframeAnimationData.cs` (the GLB-loader contract), `KeyframeAnimationModule.cs`
  (schema); `Animations/*.glb` (only in the private mirror).
- **flexo:** `src/ksa/animationImport.ts`, `animationNaming.ts`, `animationRig.ts`,
  `exportAnimationGlb.ts`, `easing.ts`, `easingFit.ts`, `clipIssues.ts`;
  `src/state/animationStore.ts`; `src/three/PoseGizmo.ts`, `JointMarkerLayer.ts`,
  `TrajectoryLayer.ts`; UI: `src/ui/animation/`.
- **Tests:** `animationImport.test.ts`, `animationRig.test.ts`, `exportAnimationGlb.test.ts`,
  `easing.test.ts`, `easingFit.test.ts`, `clipIssues.test.ts`, `animationStore.test.ts`.
- **Check:** loader contract + schema shape unchanged; new `<KeyframeAnimationModule>` content is
  fine if it matches the existing shape; the scene ROOT node's TRS still applies (a live
  constraint since the rev-5034 loader fix). Remember flexo models KSA deploy clips as **deployed**
  (= last keyframe, the rest anchor) — verify against the private-mirror GLB node structure, not
  the decomp. Connectors still cannot animate with joints (verified limitation — the
  SubParts-only gate in the mesh picker is correct, not a bug).

### E. Kittens — Character rendering (EDITOR-ONLY aide) — [`scope/kittens.md`](../../../scope/kittens.md)

- **Game anchors:** `CharacterAssets.xml`, `KittenRenderable.cs`, `AnimatedRenderable.cs`,
  `CharacterRenderResources.cs`, `ModelTranslucent.frag`.
- **flexo:** `src/ksa/kittenAssets.ts`, `src/three/KittenObject.ts`, `kittenBake.ts`;
  `src/ui/build/KittenInspector.tsx`.
- **Check:** `CharacterAssets.xml` hash + the gltf material names (`Kitty_Suit`, `KittyHead_mt`,
  `M_CHA_Kitten_Head`, `KittyEye_mt`, `Eyes_KittySklera_mt`); socket bones (`Head_M`, `Chest_M`) +
  the `ATTACHMENT_CORRECTION` derivation; the embedded-`DefaultORM.png` redirect. A changed asset
  path / material name **degrades the editor aide only** — kittens are never exported *as kittens*,
  so severity is lower than an export-path break. Exception: "Make Kitten Mesh" bakes a kitten into
  real SubParts, so a mesh/bone change also reaches the export path via `kittenBake.ts`.

### F. Custom assets · textures · GLB import+export · multi-part mod export — [`scope/custom-assets-and-mod-export.md`](../../../scope/custom-assets-and-mod-export.md) · [`docs/custom-assets.md`](../../../docs/custom-assets.md), [`docs/importing-models.md`](../../../docs/importing-models.md), [`docs/multi-part.md`](../../../docs/multi-part.md)

- **Game anchors:** `ThumbnailRenderResources.cs` (the null-deref site), `Mod.cs`, `ModLibrary.cs`,
  `AssetBundle.cs`, `PbrMaterialReference.cs`, `MeshAtlasFileReference.cs`, `MeshReference.cs`,
  `mod.toml`; `RenderCore.Gltf/GltfUtils.cs`; `PartModelModule.cs` / `PartModelRenderer.cs`
  (`ENABLE_EMISSIVE` / `BuildPipelineModel`); `Part.cs` (`RayCastEgoSubPart`).
- **flexo:** `src/ksa/modExport.ts`, `assetsXmlSerializer.ts`, `exportGlb.ts`, `exportIssues.ts`,
  `importPlan.ts`, `importMaterials.ts`, `importNormalize.ts`, `importEstimates.ts`, `idRemap.ts`;
  `src/ktx/encodeKtx2.ts`, `decodeImage.ts`; `src/state/customAssetStore.ts`, `assetDb.ts`,
  `exportPreviewStore.ts`, `modFolderStore.ts`, `partClone.ts`; `src/three/primitives.ts`,
  `MeshAtlasCache.ts`, `TextureCache.ts`, `textureSupport.ts`; UI: `src/ui/ExportKsaDialog.tsx`,
  `src/ui/assets/`, `src/ui/surface/`, `src/ui/MaterialDialog.tsx`, `CreateMeshDialog.tsx`.
- **Tests:** `assetsXmlSerializer.test.ts`, `exportGlb.test.ts`, `modExport.test.ts`,
  `exportIssues.test.ts`, `exportPreviewStore.test.ts`, `importPlan.test.ts`,
  `importMaterials.test.ts`, `importNormalize.test.ts`, `importEstimates.test.ts`,
  `customAssetStore.test.ts`, `assetDb.test.ts`, `partClone.test.ts`.
- **Check (each gotcha has already caused an in-game crash):** the null-deref in
  `ThumbnailRenderResources.AddDraw` still has **no** guard ⇒ synthetic Normal + AoRoughMetal still
  required on every `<PbrMaterial>`; KSA still reads the SubPart id from `meshes[i].name` ⇒ the GLB
  mesh-name post-process still needed; `ENABLE_EMISSIVE` still defined (else glow silently dies)
  and still absent from `BuildPipelineDynamic`; no `<EmissiveLut>`/tint slot appeared on
  `PbrMaterialReference` (that would let flexo ship a ramp instead of baking it); `mod.toml` /
  `AssetBundle` loader contract **including the multi-part case (§1.2)** — N `<Part>`s and N mesh
  atlases in one bundle, id uniqueness, first-wins dedupe; the KTX2 flavor KSA accepts (flexo ships
  UASTC for SubPart atlases, BC7 for kitten `Characters/`). The real acceptance test is dropping an
  exported `flexo-parts/` mod into KSA.

### G. Connectors · coordinate mapping · IVA seats · vehicle reference orientation — [`scope/connectors-coordinates-iva.md`](../../../scope/connectors-coordinates-iva.md) · [`docs/coordinates.md`](../../../docs/coordinates.md), [`docs/iva-seats.md`](../../../docs/iva-seats.md), [`docs/ksa-part-connector-notes.md`](../../../docs/ksa-part-connector-notes.md)

- **Game anchors:** `Part.Connector` / `Part.cs`, `QuaternionEx.cs`, `Double3Ex.cs`,
  `VehicleEditor.cs`, `PartModel.cs` / `PartModelModule.cs`, `DockingPortTemplate.cs`,
  `Control.cs` / `ControlTemplate.cs`, `FlightComputer.cs`, `Vehicle.cs`; for seats
  `IVASeat.cs`, `IVASeatTemplate`, `IVAController.cs`, `Camera.cs` (`LookAtRotation`, the 50° FOV),
  `AttachedInternal.cs`, `EVADoorTemplate.cs`, `Input.cs` (`C` / `Shift+C` bindings).
- **flexo:** `src/three/coords.ts`, `ConnectorObject.ts`, `debugCalibration.ts`,
  `IvaSeatObject.ts`; connector parse/emit in `src/ksa/partXmlParser.ts` / `partXmlSerializer.ts`,
  `types.ts`; seats in `src/ksa/ivaSeatAxes.ts` (the `EULER_ORDER` calibration's second consumer),
  `ivaLook.ts`, `ivaSeatValidation.ts`; `src/state/ivaSeatStore.ts`, `ivaStore.ts`; the
  `<Internal>` flag in `modExport.resolveInternal` / `assetsXmlSerializer.ts`; UI:
  `src/ui/build/ConnectorInspector.tsx`, `SeatInspector.tsx`.
- **Tests:** `ivaSeatAxes.test.ts`, `ivaLook.test.ts`, `ivaSeatValidation.test.ts`,
  `ivaStore.test.ts`, `partXmlParser.test.ts`, `partXmlSerializer.test.ts`.
- **Check:** `QuaternionEx.CreateFromXyzRadians` + `Double3Ex` axis conventions unchanged (else
  recalibrate `EULER_ORDER` in `coords.ts` — use `?debug=dockingport`; `ivaSeatAxes.test.ts`
  fails first if it drifts); `Part.Connector.Flag` enum + `<Flags>` schema (`[Flags]` bodies are
  **whitespace-separated**); the IVA render gate + `<Internal>` / `<RayTracing>` / `<ShadowCaster>`
  schema in `PartModel` (and that `<Internal>` is still the ONLY `[XmlElement("Internal")]` in the
  decomp — `<PartModelGlass>` gaining one would change what flexo may mark interior-only);
  `IVASeatTemplate`'s three `Vector3Reference` fields + defaults, the load-bearing `<IVASeat Id>`,
  `<EVADoor SeatId>`, and `IVAController`'s two view clamps (`ivaLook.ts` is a line-for-line port —
  re-diff `OnFrame` and the seat-cycling/`OnSwitchOn` order semantics).
  **Reference-orientation contract:** confirm `Control`/`ControlTemplate` are still empty markers
  (no transform / control-point field), `FlightComputer.UpdateAttitudeTrackError` still aims **Body
  +X** / rolls **+Z**, `VehicleEditor` still pins the root to identity at launch. A new
  `ControlPoint` / "control-from-here" / reference-transform would flip "up follows root" → "up
  follows selected part" — grep `<CURRENT>/decomp` for `controlpoint|control from here|referencetransform`.

### H. Colliders — part collision volumes — [`scope/colliders.md`](../../../scope/colliders.md) · [`docs/colliders.md`](../../../docs/colliders.md)

- **Game anchors:** `ColliderModule.cs` + `Box|Sphere|Cylinder|CapsuleColliderTemplate.cs`,
  `ColliderTemplate.cs`, `DistanceReference.cs`, `Vehicle.cs` (collider compound + zero-collider
  fallback), `ConstraintSim.cs` (docking by contact), `PartTemplate.ApplyGameData`.
- **flexo:** `src/ksa/colliderFit.ts`, `colliderSize.ts`, `colliderValidation.ts`, and the
  collider parse/emit in `partXmlParser.ts` / `partXmlSerializer.ts` / `types.ts`;
  `src/state/colliderStore.ts`; `src/three/ColliderObject.ts`; UI:
  `src/ui/build/ColliderInspector.tsx`.
- **Tests:** `colliderFit.test.ts`, `colliderSize.test.ts`, `colliderValidation.test.ts`.
- **Check:** still exactly four analytic primitives (there are NO collider meshes — a new
  `MeshColliderTemplate` would be a MISSING-CAPABILITY); size still carried in `Transform.scale`;
  the four XML authoring sites (part-level vs SubPart-owned × the two nesting forms) that flexo
  normalizes into one still all parse in-game; the zero-collider fallback unchanged.

### I. Plumbing topology — capabilities · feeds · containers — [`scope/plumbing-and-feeds.md`](../../../scope/plumbing-and-feeds.md) · [`docs/engines.md`](../../../docs/engines.md)

- **Game anchors:** `ConnectorCapability*.cs`, `FeedsFromReference.cs`, `ConsumerFeedWiring.cs`,
  `RocketCoreTemplate.cs`, `PartTemplate.ResolveConsumerFeedPoints`.
- **flexo:** capability/feed parse+emit in `src/ksa/partXmlParser.ts` / `partXmlSerializer.ts` /
  `types.ts`; `src/state/containerStore.ts`, `feedTargets.ts`; UI: `src/ui/FeedsField.tsx`,
  `src/ui/data/sections/WiringSection.tsx`, `TanksSection.tsx`,
  `src/ui/data/CapabilitiesSummaryCard.tsx`, `src/ui/build/ContainerEditorCard.tsx`.
- **Tests:** `partXmlParser.test.ts`, `partXmlSerializer.test.ts`, `gameDataFindings.test.ts`.
- **Check:** empty `<Capabilities>` still defaults to `Electricity|ServiceFluid`; passthrough still
  does NOT cover MODELED elements; container `Id`s still load-bearing; `[Flags]` bodies still
  whitespace-separated; `DecouplerJoint` and any new capability token present in flexo's enum.

### J. Ground clutter — data-only celestial mod — [`scope/ground-clutter.md`](../../../scope/ground-clutter.md)

- **Game anchors:** `GroundClutterReference.cs` + its sibling schema classes (`*Reference.cs`),
  incl. `GroundClutterPlacementReference`.
- **flexo:** the `ksa-mods/cartoon-moon/` scaffold; `scripts/build-cartoon-moon.ts` (a legacy
  **Bun** script — run it from `scripts/`, not via `pnpm` at the root).
- **Check:** the schema classes unchanged (`<GroundClutter>` / `Ecotype` / cards / `Opacity`
  cutout); every LOD still needs `<Material Id/>` refs whose count equals the GLB material count
  (a mismatch **throws** at load); meshes still register by GLB mesh NAME, first-wins + core-first.
  This area is scaffold-only — it never touches the part editor, so a break here is contained.

### Cross-cutting (always)

- **Added top-level `<Assets>` schema** outside the GameData child/attr passthrough surface (§1.1) —
  the silent-drop trap. Check even when no scope row obviously changed.
- **Multi-part amplification (§1.2)** — any bundle/id/dedupe rule change is N× the risk.
- **A game file mapping to no row** ⇒ candidate NEW integration surface ⇒ new `scope/*.md` + matrix
  row + a `FULL_SCOPE.md` map entry.

---

## 6. Deliverable

Produce a review report that states, for the `<PREVIOUS>` → `<CURRENT>` transition:

1. The two build ids (from each `version.json`), plus flexo's currently-verified baseline from
   `scope/FULL_SCOPE.md` if it differs from `<PREVIOUS>`.
2. The file-level diff summary (changed / added / removed, noise filtered out).
3. Per touched area: the contract assumptions checked and their verdict (intact / drift / broken),
   with game-side `class:member` + exact XML element/attribute names as evidence.
4. A gap list with severities (§2.6) and exact flexo `file:line` targets, each fix framed under the
   no-migration rule (§1.3), noting any that require a `PROJECT_SCHEMA_VERSION` bump.
5. The follow-through actions taken or needed: `scope/*.md` baseline bumps, `FULL_SCOPE.md` version
   + status-table bump, `docs/*.md` updates, `plans/FIX_CURRENT_GAPS_PLAN.md`, private-mirror
   re-sync (+ UASTC re-encode), fixture re-sync, new/updated regression tests, and the gate result
   (`test` / `typecheck` / `lint` / `fmt:check` / `smoke`).

If the diff is empty or purely decompiler noise, say so plainly and record **NONE** — a clean bill
of health with the baseline bumped is a valid, complete outcome.
