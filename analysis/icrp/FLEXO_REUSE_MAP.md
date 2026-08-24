# ICRP (Inanimate Carbon Rod Placer) — flexo REUSE MAP

Audit date 2026-08-23. flexo @ `main` 45eabaf (KSA contract baseline 2026.8.22.5348).
All paths absolute unless prefixed `src/` (= `/Users/asherwin/repos/meow-sci/flexo/src/`).

## 0. Headline

1. **KSA static objects are structurally a clone of vessel Parts.** `<StaticSubObject>` ≡ `<SubPart>` (same `<PartModel><Mesh Id/><Material Id/>`, same `<Collider>` grammar, same `<MeshAtlas>`/`<PbrMaterial>`), `<StaticObject>` ≡ `<Part>` (child placements with `InstanceOf` + `<Transform><Position/><Rotation/><Scale/>`), `<StaticObjectGameData>` ≡ `<PartGameData>`. Only tag names differ (`SubPart→StaticSubObject`, instance `SubPart→SubObject`). The transform is applied by the SAME `S·R·T` + `CreateFromXyzRadians` code path (`ksa-game-assemblies/current/decomp/KSA/StaticObject.cs:228-235`), so flexo's `EULER_ORDER='ZYX'` calibration transfers exactly.
2. **The one real divergence: the static-object assembly frame is X-up, Y-east, Z-north** (`decomp/KSA/LocationReference.cs:156-179`), not three.js Y-up like vessel parts. Handle it as a single scene-root basis rotation; never bake it into `coords.ts`.
3. **flexo has zero code for static objects, landmarks, lat/lon, terrain or celestials** (4 incidental string hits in `src/`; `scope/part-and-subpart-xml.md:199-203` explicitly declares static objects out of scope). `<Terrain>` (gap T2), `<Alpha>` (gap T1) and `<ConvexHull>` (gap S1) are unmodeled in flexo and are exactly the static-object surface.
4. **flexo-private-assets does NOT ship the launch-pad assets today** — `copy-assets.ts:98` predicate only matches `<Part|SubPart`. A one-line widening pulls in `CoreLaunchPad{A,B,C}Assets.xml`, `CoreLaunchPadAGameData.xml`, 3 atlas GLBs and 10 ktx2 (must be re-run on the Windows machine; then re-run the UASTC re-encode).
5. **flexo is NOT a pnpm workspace.** `pnpm-workspace.yaml` only carries `minimumReleaseAgeExclude`; `apps/partpreview` is a second Vite root importing `../../../src/...` by relative path. That precedent is the recommended shape for ICRP (see §1).
6. **v2 docked shell is SHIPPED** (memory note "implementation NOT started" is stale): `src/app.tsx`, `src/ui/shell/`, `state/modeStore.ts` with 74 `setMode(` call sites, `scripts/smoke-v2.ts`. `docs/ui-shell.md` + `plans/flexo_v2/design/foundation.md` §0–§2 are the shell spec ICRP should adopt.
7. **Launch-blocking unknown:** `<Landmark>` lives inside `<AtmosphericBody>` in `Content/Core/Astronomicals.xml`; no decomp path was found for a mod to ADD a Landmark to an existing Core body (`StaticObjectGameData` overrides the object, not the location). Must be verified in-game before designing the lat/lon UI (options: mod ships a whole body via `<System>`+`<LoadFromLibrary>` as cartoon-moon does, or user hand-edits Core).

## 1. Repo / monorepo shape and where ICRP should live

**Current shape**
- Root `package.json` single package, `"type":"module"`, pnpm 11, Node 24. Scripts: `dev`, `build` = `tsc -b && vite build && vite build apps/partpreview`, `typecheck`, `lint`/`fmt` (oxlint/oxfmt), `test` (vitest happy-dom), `smoke`, `thumbs:partpreview`.
- `tsconfig.json` = project references → `tsconfig.app.json`, `tsconfig.node.json`, `apps/partpreview`.
- `apps/partpreview/vite.config.ts`: own `base:'/flexo/apps/partpreview/'`, `envDir: repoRoot`, `publicDir` serve-only, `define VITE_ASSET_BASE` = `'/flexo/'` on build so it fetches `ksa/`, `hdr/`, `basis/` from the main app's copy; `outDir dist/apps/partpreview`; `ksaAssets()` only in dev. Imports flexo code directly: `src/state/catalogStore`, `src/state/partCatalogStore`, `src/three/PartPreviewViewport`, `src/ui/kit`, `src/measure/*`, `src/state/lightingStore`, `src/state/environmentPresets`.
- `scripts/` is a separate Bun mini-package (`scripts/package.json`, `scripts/tsconfig.json`), legacy; NEW scripts are vanilla Node 24 type-stripping per `scripts/CLAUDE.md`.
- Deploy: one workflow `.github/workflows/deploy.yml` → GitHub Pages at `meow.science.fail/flexo/`; checks out `meow-sci/flexo-private-assets` via `FLEXO_PRIVATE_ASSETS_PAT`; no lint/test job in CI.

**Options**

| Option | Pros | Cons |
|---|---|---|
| **A. `apps/icrp/` inside flexo (partpreview precedent)** | Zero extraction work; imports `src/**` by relative path; shares `vite/ksaAssets.ts`, `public/basis|draco|hdr`, `.env KSA_ASSETS_DIR`, oxlint/oxfmt/tsconfig, deploy workflow, private-assets checkout, `assetBase()` asset sharing (dist ships no duplicate assets); one `scope/` catalog, one `upgrade-ksa` runbook. | ICRP is a full editor, not a viewer: it will need its OWN `$part`-equivalent, scene class, codec, commands/menus/dialog ids. Those closed unions (`Mode`, `Tool`, `DialogId`, `SURFACE_IDS`, `EntityKind`) are module-level singletons; a second editor in the same tree must NOT import flexo's `modeStore`/`dialogStore`/`hotkeyStore` values, only the pattern. Also `tailwind @source` list, `base` path, and `pnpm build` grow. `partpreview` only got away with it because it owns no document. |
| **B. New sibling repo `meow-sci/icrp` + extract shared packages** | Clean separation, own constitution/scope; forces the shared boundary to be explicit. | Requires creating a workspace (either turn flexo into a pnpm workspace with `packages/*`, or publish). Extraction cost is real (list below); two deploy pipelines, two private-asset checkouts, duplicated `public/basis|draco|hdr` (~180 MB of HDR) unless served cross-origin. |
| **C. Convert flexo to a pnpm workspace: `packages/ksa-core`, `packages/editor-core`, `packages/ui-kit`, `apps/flexo`, `apps/icrp`** | Best long-term; both editors consume the same packages; one repo, one CI, one scope catalog. | Largest up-front churn on a stable app (moving `src/` into `apps/flexo/`, rewriting every import path, splitting `tsconfig` references, retargeting `vite/ksaAssets`/`previewManifest`). Risky to do before ICRP's needs are known. |

**Recommendation: A now, graduating to C.** Start ICRP as `apps/icrp/` in the flexo repo, importing the pure modules by relative path (exactly as partpreview does), and **copying** (not importing) the singleton shell stores whose unions must differ. Keep a running list of every `../../../src/` import ICRP makes; that list IS the shared-package manifest for a later workspace conversion (option C), done once ICRP is real. Do not do B: it duplicates the asset/deploy plumbing and forces extraction before the seams are proven.

**What is already extractable with zero refactor (no `src/state` runtime import)**

- `src/assetBase.ts`
- `src/three/`: `MeshAtlasCache.ts`, `TextureCache.ts`, `textureSupport.ts`, `normalMapPatch.ts`, `MaterialFactory.ts` (shared-material half, lines 206-262), `coords.ts`, `SceneEnvironment.ts`, `envCache.ts`, `RenderLoop.ts`, `SelectionManager.ts`, `TransformGizmo.ts` (type-only imports), `cameraFraming.ts`, `marqueeSelect.ts`, `layerOpacity.ts`, `wireShapes.ts`, `samplePoints.ts`, `AxisGizmo.ts`, `axisColors.ts`, `viewportFocus.ts`, `primitives.ts`, `loadModelFile.ts`, `chainMath.ts`
- `src/ksa/`: `formatG6.ts`, `colliderSize.ts`, `colliderFit.ts`, `colliderValidation.ts`, `assetsXmlSerializer.ts`, `exportGlb.ts`, `catalog.ts` (imports only `assetBase` + `collidersFromElement`), pure halves of `partXmlParser.ts` / `partXmlSerializer.ts`, `importNormalize.ts` (needs `state/ids.randomId` injected)
- `src/ktx/*` (all five), `src/measure/*` (all), `src/util/zip.ts`, `src/state/tarArchive.ts`, `src/state/ids.ts`, `src/state/environmentPresets.ts`
- `src/ui/kit/**`, `src/ui/hotkeys/{escLadder,typingGuard,keys}.ts`, `src/ui/toast.ts`, `src/ui/palette/CommandPalette.tsx`, `src/ui/fuzzyMatch.ts`, `src/ui/{numberDraft,NumberField,PreciseNumberInput,Vec3Field,format}`
- Shell stores with no domain coupling: `commandStore`, `layoutStore`, `statusStore`, `notificationStore`, `modifierStore`, `snapStore`, `layerStore`, `hotkeyStore` (minus `SURFACE_IDS`), `dialogStore` (minus `DialogId`), `modeStore` (minus `Mode`/`Tool` unions)

**Blocked by a store import (needs a parameter seam before sharing):** `src/ksa/modExport.ts` (4 stores at `:34-37`; pure half `:77-133` + `:1236-1425` is liftable), `src/three/SubPartObject.ts` (only `customAssetStore`), `src/three/trackedLoad.ts` (`loadProgressStore`), `src/three/Viewport.ts` (6 view/lighting stores + seat-view), `src/ksa/exportIssues.ts` (type-only `modeStore`).

## 2. Subsystem classification

Legend: AS-IS / CHANGES / REWRITE / NOT NEEDED.

### 2.1 Asset pipeline — mostly AS-IS
| Module | Verdict | Notes |
|---|---|---|
| `vite/ksaAssets.ts` | AS-IS | Verbatim mirror of `KSA_ASSETS_DIR` → `/ksa/` in dev, `dist/ksa/` on build (`:40-92`). Serves launch-pad assets the moment they exist in the tree. |
| `src/assetBase.ts:13-15` | AS-IS | `VITE_ASSET_BASE \|\| BASE_URL`; the mini-app asset-sharing hook. |
| `src/three/MeshAtlasCache.ts:31-84` | AS-IS | `getSubPartGeometry(atlasUrl, nodeName)` = `gltf.scene.getObjectByName(nodeName)` → first mesh → clone → bake `matrixWorld` → MikkTSpace tangents. `<Mesh Id="X">` = glTF NODE name inside the file's default `<MeshAtlas>` unless `X` names an `Id`'d atlas (then whole scene). Launch pads follow this exactly (`CoreLaunchPadA_Subpart_FootpathA` node in `Meshes/CoreLaunchPadA_MeshAtlas.glb`). |
| `src/three/TextureCache.ts`, `textureSupport.ts` | AS-IS | KTX2Loader singleton, `setTranscoderPath(assetBase()+'basis/')`, `flipY=false`, color-space by channel. `public/basis/` + `public/draco/` must be copied if ICRP is a separate repo (draco re-copied on every three upgrade). |
| `src/three/normalMapPatch.ts:27-60` | AS-IS, but verify | RG normal + X-flip + emissive `pow(rrr*1.25,2.2)` replicates `MeshIndirect.frag`. Static objects use a DIFFERENT shader family (`Content/Core/DefaultAssets.xml:57-58` → `Shaders/Mesh/StaticObject.vert/.frag`, bucket logic in `decomp/KSA/StaticObjectModel.cs:260`). Read that shader before trusting the patch, especially for `<Alpha>` and `<Terrain>`. |
| `src/three/MaterialFactory.ts:206-262` | CHANGES | Add an `<Alpha Path>` branch (`alphaMap` + blended bucket; only `CoreLaunchPadBAssets.xml:9` uses it in Core). Drop the custom-material half (`:39-203`). |
| `src/ksa/catalog.ts:160-254` `parseAssetsFile` | CHANGES | Iterate `StaticSubObject` instead of/in addition to `SubPart`; add `alphaUrl` + `terrain` fields. Cross-file `InstanceOf` (pad A references B/C subobjects) already works via the flat merged `$catalogIndex`. |
| `src/ksa/partCatalog.ts` (484 lines, 45 fields) | REWRITE | Only `id`+`placements` apply. A `CatalogStaticObject {id, placements, groundOffsetM, surfaceHeightM, footprintRadiusM, colliders}` is ~60 lines; reuse `placementsFromPartElement` (`partXmlParser.ts:95-113`, retag `'SubPart'`→`'SubObject'`, drop `layerId`) and `collidersFromElement` (`:202-244`). |
| `src/state/catalogStore.ts` | REWRITE (trivial, 35 lines) | `$staticCatalog`. |
| `flexo-private-assets/copy-assets.ts:98` | CHANGES (1 line) | `hasParts = /<(Part\|SubPart\|StaticObject\|StaticSubObject)[\s>]/`. Optional extra branch for `Astronomicals.xml` (no `<Assets>` root, so `isAssets` rejects it) and `GroundClutter/`. |
| `flexo-private-assets/tools/reencode-textures-uastc.py` | AS-IS | BCn→UASTC via vendored `ktx` binary, `--assign-tf` re-tag without pixel conversion; idempotent. Re-run after widening the copy. Check the `_Alpha` (likely BC4) output. |
| `ksa-game-assemblies/copy-ksa.ts` | AS-IS | Copies DLLs + `Content/` then STRIPS all binaries (`:147-160`) — XML/decomp/shader reference only, includes `CoreLaunchPad*`, `Astronomicals.xml`, `GroundClutter/`, `Shaders/`. |
| `src/ktx/{decodeImage,encodeKtx2,zstd,channelTransforms}.ts` | AS-IS (authoring only) | `encodeKtx2` is the one place that knows KSA's UNORM+linear-tag rule. `glowComposite/glowRamp` NOT NEEDED (no `<Emissive>` on static objects). |
| `vite/previewManifest.ts` | CHANGES | Pattern worth copying: build-time manifest generated by the app's OWN parser from `KSA_ASSETS_DIR`. |

### 2.2 SubPart catalog + thumbnails
- `src/three/SubPartPreviewViewport.ts` (160 lines) — AS-IS: exactly a StaticSubObject browser preview.
- `src/three/assetThumbs.ts` — AS-IS pattern (one shared offscreen renderer + PMREM, idle queue); its inputs are custom-asset-specific.
- `apps/partpreview/src/thumbsSpec.ts` + `scripts/capture-part-thumbs.ts` + `deploy.yml` fingerprint cache — CHANGES; overkill for one Core `<StaticObject>` on day one, but the render-from-`dist`-with-the-app's-own-viewport architecture is right.

### 2.3 XML parse/serialize — HARVEST + REWRITE
- **Transform convention — the code ICRP must match, `src/three/coords.ts:28-47`:**
  ```ts
  const EULER_ORDER = 'ZYX' as const;   // KSA "XYZ" (CreateFromXyzRadians) == three 'ZYX'
  applyPlacement: obj.position.set(x,y,z); obj.rotation.set(rx,ry,rz,'ZYX'); obj.scale.set(...)
  readPlacementTransform: Euler().setFromQuaternion(obj.quaternion,'ZYX')
  ```
  Radians throughout, **no axis negation, no swap, no handedness flip** — vessel frame == three.js frame. `matrixFromTransform` (`:56-63`) = `compose(pos,quat,scale)` matching KSA `S·R·T` row-vector product. `StaticObject.GetMatrix` (`StaticObject.cs:228-235`) uses the identical composition, so **keep `'ZYX'` untouched**. Static-object colliders drop placement scale (`StaticObject.cs:184-216`) exactly like `colliderWorld` (`coords.ts:94-120`) already models.
  **New for ICRP:** static frame X=up, Y=east, Z=north (`LocationReference.cs:156-179`, row-vector `Double3Ex.cs:111-113`). Apply the proper rotation `e_x→(0,1,0), e_y→(1,0,0), e_z→(0,0,-1)` ONCE on the scene root; store/serialize raw KSA numbers. Pin with a `CoreLaunchPadA_Prefab_LaunchPadA` load test (colliders have small X ≈ -0.38 and large Y/Z, `SurfaceHeight 1.5537`).
  Drop `lightWorld`/`exhaust*` (`:184-386`). `src/three/debugCalibration.ts` → REWRITE as "load the Core pad and check it stands up".
- `src/ksa/formatG6.ts` — AS-IS (.NET G6).
- `src/ksa/partXmlSerializer.ts` harvest AS-IS: `prettyXml :1168`, `buildTransformElement :1125` + `buildVectorElement :1140` + `buildRotationElement :1159` (omit-at-identity, `EPSILON 1e-9`, safe because `Vector3Reference` defaults are 0 and `TransformReference?` is nullable), `buildSubPartElement :1093` (rename SubObject, drop Gimbal/TemplateRemap), `buildColliderElement :461` + `buildVec3Attrs :492` + `collidersByOwner :530` (use Core's `"Collider1"` id, drop the `flexoColliders` tank-avoidance sentinel), `buildDistanceElement :686` (CHANGES: always `M`, Core writes `<GroundOffset M="0.2"/>`), RawXmlNode emitters `elWithAttr/buildRawNode/applyUnknownAttrs :558-578`. Everything engine/tank/connector/IVA/light/animation NOT NEEDED.
- `src/ksa/partXmlParser.ts` harvest AS-IS: `collidersFromElement :202-244`, `subPartCollidersFromRoot :265`, `readTransform :452`, `directChildren/childElements :897-920`, RawXmlNode capture `:976-1042`, `readVec3Attrs :1058`, `readDistanceM :1087`.
- `src/ksa/types.ts` harvest: `Vec3`, `EulerXYZ`, `Transform`, `ColliderShape`/`PartCollider` (`:127-183`, "scale IS size in meters"), `Layer`, `RawXmlNode :1235`. ~15% applies.
- `src/ksa/assetsXmlSerializer.ts` — CHANGES: `<SubPart>`→`<StaticSubObject>`, add `<StaticObject>`/`<SubObject>` + `<StaticObjectGameData>` passes, add `<Terrain>true</Terrain>` after `<Material>`, **DELETE `<MeshView>` emission** (`:250-254`, `:307-311`; `decomp/KSA.GlbImport/StaticObjectAssetBundler.cs:38-44` skips `_VM` nodes, nothing raycasts static objects), keep `claimId :154` (global first-wins id registry), drop `ExportVariant`/`internalElement`/glass.
- Game-schema grounding (decomp): `StaticObjectTemplate.cs:7-98` (`SubObject[]`, `PartModel[]`, `Collider[]`, three `DistanceReference`s defaulting NaN = unset; GameData overrides distances only when set, lists are additive), `StaticSubObjectTemplate.cs:7-38`, `StaticSubObjectInstance.cs:5-29` (`Id`, `InstanceOf`, nullable `Transform`), `PartModelModule.cs:18-45` (`Mesh`, `Material`, `RayTracing`, `ShadowCaster`, `Internal`, `Terrain`), `LandmarkReference.cs:5-15` + `LocationReference.cs:11-22` (`IsLaunchPad` attr gates rendering; `StaticObject` attr; `<Latitude Degrees>`/`<Longitude Degrees>` RadianReference). Consumers: `Vehicle.cs:3952` (spawn altitude = GroundOffset+SurfaceHeight inside FootprintRadius), `GroundClutterPlacementData.cs:141` (clutter exclusion = FootprintRadius+50 m). Bundler conventions: material `<Stem>_Material`, PartModel `<node>_Model`, terrain from `_Terrain*` child node, colliders from `_ColPrim_{Box,Sphere,Capsule,Cylinder,Hull}`, `InstanceOf` = mesh name minus trailing `[.\d]+`.

### 2.4 Colliders — mostly AS-IS
`colliderSize.ts`, `colliderFit.ts`, `measure/colliderCoverage.ts`, `three/wireShapes.ts`, `three/ColliderObject.ts`, `three/samplePoints.ts`, `state/colliderStore.ts` AS-IS. `colliderValidation.ts` CHANGES: drop tank/docking rules, **raise/drop the >32 warning** (Core pad A ships hundreds of boxes: 146 Box + 4 Cylinder), add `<ConvexHull>` (gap S1 — matters more here). `ui/build/ColliderInspector.tsx` CHANGES: owner picker = StaticObject-level vs each referenced StaticSubObject. `editorStore` collider actions `:1226-1332` REWRITE into ICRP's store. Performance pass needed: per-collider scene node + per-vertex coverage sampling at 100s of colliders.

### 2.5 3D workspace
| Module | Verdict |
|---|---|
| `src/three/EditorScene.ts` (3334 lines) | REWRITE. Harvest: `reconcile :902-974` one-kind diff algorithm (wanted-set, template-identity guard, async landing re-check), `sub() :888` invalidate-after-callback discipline (~45 subscriptions), `attachGizmo :2309` / drag-start `pushUndo` `:505-534`, Escape = `controls.reset()` streaming restore `:869`, marquee `:2866`, `captureThumbnail :1867`, `nearestFaceVertex :3317` + Y=0 ground-plane fallback `:3184`. All owner-frame collider/light machinery NOT NEEDED. |
| `src/three/Viewport.ts` | CHANGES: delete seat-view (`:71-78, 259-384`), re-tune `near 0.01/far 1000` and `Grid.ts` `SIZE=10` for a 100–200 m pad + km ground; add a sun-direction light. |
| `RenderLoop`, `SelectionManager`, `TransformGizmo`, `cameraFraming`, `marqueeSelect`, `layerOpacity`, `AxisGizmo`, `SceneEnvironment`, `envCache`, `highlightSettings` | AS-IS |
| `SubPartObject.ts` | CHANGES → `SubObjectObject` (drop `customAssetStore`; note `Material.clone()` loses `onBeforeCompile`, re-apply patch `:87`). |
| `GhostPartsLayer.ts` + `ghostPlan.ts` | CHANGES — sibling-of-root unpickable ghosts = "other pads in the scene". |
| `ChainPreviewLayer`, `chainMath`, `chainEval` | CHANGES (seed type) — pure-fold array evaluator for "N masts around a pad". |
| `selectionTransform.ts` | REWRITE (owner frames collapse to identity). |
| `MeasurementLayer.ts`, `measure/format.ts` | CHANGES (`m\|km` units). |
| `PoseGizmo`, `JointMarkerLayer`, `TrajectoryLayer`, `ContainerLayer`, `Connector/IvaSeat/Light/Kitten/NozzleHandleObject`, `kittenBake`, `lightVolume` | NOT NEEDED |
| **Snapping** | flexo has ONLY gizmo grid/angle snap (`snapStore.ts`, `TransformGizmo.setSnap :62`, `⌃` inverts). No surface/vertex/object snapping — new work; ground-plane-constrained drag (Y-only rotate, XZ translate) is expressible via `TransformControls` axes but never done in flexo. |
| Layers (`layerStore.ts`, `docs/layers.md`) | AS-IS |

### 2.6 Undo/redo + editor state (nanostores)
- `editorStore.ts:465-739` undo machinery — CHANGES → `HistoryEntry<TDoc>`; it only `structuredClone`s the doc (+ two injected aid arrays via `registerEditorAidStores :443`), never inspects fields. Keep the **two-pattern invariant** (discrete mutators `pushUndo()` themselves; streaming push once at interaction start; `docs/editor-state.md:349-383`). `MAX_UNDO 50`, `exportHistory/importHistory :661/:686`, `$historyList`. Keep aids OUT of the entry (known wart, `docs/multi-part.md:313`).
- Selection `:117-296` — CHANGES; six-way `switch(kind)` in 5 places (`EntityKind :132`, `KIND_ORDER :154`) is the tax; single-kind ICRP collapses to `string[]`.
- `partsStore.ts` (park/hydrate registry, `switchPart :390`, `clearPartScopedIntents :336`, invariants I1–I3) — CHANGES for "N StaticObjects per project".
- `modeStore.ts` (single `$activeTool` slot, `setMode :212` choreography, `registerModeHooks/registerTool`) — copy, swap `Mode`/`Tool` unions. `viewStore.ts` camera intent atoms — CHANGES.
- Every domain store (`engine*`, `animation*`, `iva*`, `dataMode*`, `surfaceMode*`, `reaction*`, `solidCurve*`, `feedTargets`, `gameDataFindings`) NOT NEEDED.

### 2.7 Project persistence
- IndexedDB `flexo-projects` (meta/snapshots/history/thumbs, `projectDb.ts:36-38`), `flexo-assets` blobs keyed `pa:<project>:<kind>:<id>` (`assetDb.ts:90`), `flexo-fs` mods-folder handle; localStorage only `flexo:currentProjectId`; Web Locks `flexo:project:<id>` (secure-context only) + BroadcastChannel `flexo:projects`. **No OPFS.**
- `projectDb.ts` — CHANGES → generic over `TDoc` (only `SavedPartEntry.part` + 11 KSA `ProjectCounts` tallies are typed). `projectStore.ts` — CHANGES: inject `serialize/normalize/apply/deriveCounts`; keep two-debounce autosave (300 ms snapshot / 1500 ms history `:457`), `$autosaveHealth` loud failure, boot ladder `hydrateProjectOnBoot :709`, `PROJECT_SCHEMA_VERSION` purge-not-migrate. `projectIndexStore.ts` AS-IS (rename `flexo:` constants). `assetDb.ts` AS-IS. `tarArchive.ts` AS-IS; `projectArchive.ts` (`.flexo.tar.gz`, `manifest.json` first, two exact-version gates) CHANGES; `projectCodec.ts` (1663 lines of ksa types) REWRITE; `projectShareLink.ts` (zstd→base64 `?load=`) CHANGES.
- 36 `persistentJSON` keys, all `flexo:` prefixed; replayed verbatim, sanitize-on-read, never migrate (`docs/state-persistence.md`).

### 2.8 Mod export — SPLIT
- AS-IS pure half of `src/ksa/modExport.ts`: `serializeModToml :115` (`name`, `assets=[xml…]` only; binaries reached by relative `Path`), `sanitizeBaseName/uniqueFileName :83-133`, `writeModToFolder :1389-1425` (sandbox = user-granted `FileSystemDirectoryHandle` + segment-wise `getDirectoryHandle`, `..` fails lookup; XML never overwritten (suffixed), binaries overwritten, `mod.toml` rebuilt from the folder listing), `buildModZip :1300`, `buildMultiCustomBundle :1261` (binary dedupe must be byte-identical or throw). `state/modFolderStore.ts` AS-IS (rename key), `util/zip.ts` AS-IS.
- REWRITE plan builders (`buildPartBundlePlan :889-1235`, `buildMultiModContent :180`, kitten/glass/inset). Keep id namespacing discipline (`flexo_<base>_<ns>_<template>`, `<id>_Model`, `<id>_Material`; ids are globally first-wins in `ModLibrary`).
- ICRP layout: `icrp-statics/mod.toml`, `<Name>Assets.xml`, `<Name>GameData.xml`, `Meshes/<Name>_MeshAtlas.glb` (no `_VM`), `Textures/*.ktx2`. Landmark placement path: see §0.7.

### 2.9 Custom assets
All three KSA gotchas still apply (`docs/custom-assets.md`): (1) `exportGlb.nameMeshesFromNodes` copies node→mesh names (else NRE); (2) KTX2 tagged `R8G8B8A8_UNORM` + linear, never `_SRGB` (double gamma); (3) every `<PartModel>` needs `<Material>` with Diffuse+Normal+AoRoughMetal (1×1 solids `FlatNormal`/`NeutralORM`, R=AO G=rough B=metal, no TANGENT attribute). `exportGlb.ts` CHANGES: `viewMeshes:false`, drop meshopt decimation. `three/primitives.ts`, `ksa/importNormalize.ts` (+ `importMaterials/importPlan`, the Blender→GLB path — likely ICRP's primary authoring flow) AS-IS. `state/customAssetStore.ts` (2504 lines, 14 store imports) REWRITE harvesting ~40%.

### 2.10 UI kit / shell / hotkeys / palette / chains / wizards
- `src/ui/kit/**` AS-IS incl. `zIndex.ts` tokens (`canvasOverlay 10 / dock 20 / float 30 / overlay 50`) + `zIndexLiterals.test.ts`. `src/index.css` CHANGES (rename accent/keyframe; keep `source(none)` + explicit `@source` — auto-detection breaks the build on docs prose).
- Hotkeys: `escLadder.ts`, `typingGuard.ts`, `keys.ts` AS-IS (swap `Scope` union); `registry.ts` (1066 lines) REWRITE table, keep machinery (`:94-120` binding shape, `:1004-1044` scope precedence); `HelpDialog` generated from the registry.
- `commandStore.ts` AS-IS (throws on duplicate id, `$paletteRecents`); `dialogStore.ts` AS-IS minus `DialogId`; `ui/menu/menuSpec.ts` CHANGES (`MenuEntry` union + `command()/checkbox()/radio()` helpers); `ui/commands/index.ts` side-effect registration idiom; `chords.ts` AS-IS; `providers.ts` REWRITE; `palette/CommandPalette.tsx` + `fuzzyMatch.ts` AS-IS.
- Shell: `app.tsx:79-197` skeleton clone; `shell/Sidebar.tsx` AS-IS; `MenuBar/DialogRoot/ModeSwitcher/phone/*` CHANGES; `PartSwitcher` NOT NEEDED. `ui/toast.ts` AS-IS (imperative, routes into status bar + notification center; no floating toasts). `ui/status/*` keep generic segments, drop Data/Engine/Surface/PosedLock.
- Action chains (`ui/chain/*`, `state/chainStore.ts`, `docs/action-chains.md`) CHANGES — non-modal floating window, seeds frozen at open, one-undo-step commit; ideal for pad arrays.
- Wizard pattern (`ui/engine/wizard/wizardModel.ts:1-27` purity contract, `stepsFor :351`, `validateWizardStep :613`, `buildWizardPart :1193`; `applyEngineWizard` commits in one undo step) — copy the pattern for a "New launch site" wizard (body → lat/lon → pad → name → review).

### 2.11 Tooling / CI / verification
- Copy verbatim: `.oxlintrc.json` (react-hooks-js alias, `ListBoxItem` import ban, kit override), `.oxfmtrc.json` (singleQuote, `scripts/` ignored), `tsconfig.app.json` (es2023, bundler, `verbatimModuleSyntax`, `erasableSyntaxOnly`), `vite.config.ts` plugin order (tailwind → react → `@rolldown/plugin-babel` `reactCompilerPreset` → `ksaAssets`), `test.env.KSA_ASSETS_DIR` passthrough (real-asset tests skip when absent), `scripts/CLAUDE.md`.
- `scripts/smoke-v2.ts` (DOM-only Playwright over accessible names, spawns dev server, `pnpm smoke`) — replicate as the release gate. Playwright is a project-local devDependency only; screenshots are noise under WebGL by design.
- `deploy.yml`: Pages deploy, private-assets checkout via PAT, thumbnail cache; **no lint/typecheck/test job in CI** (enforced locally by the AGENTS.md workflow).
- Vendored fixtures `src/ksa/__fixtures__/` byte-identical to Core + drift test: replicate for `CoreLaunchPad*Assets.xml`.

## 3. Terrain / lat-lon / planet in flexo — confirmed nothing
- `src/` grep for lat/longitude/Landmark/Terrain/celestial/planet/GroundClutter/StaticObject: 4 prose/geometry hits (`wireShapes.ts:94`, `colliderCoverage.ts:5`, `colliderValidation.ts:9,125`). No `<Terrain>` passthrough (`<PartModel>` is MODELED, gap T2 `scope/part-and-subpart-xml.md:191-197`).
- Scope docs declare it out of charter: `scope/FULL_SCOPE.md:100-106`, `scope/ground-clutter.md:190-192`, `plans/FIX_CURRENT_GAPS_PLAN.md:621-623`. `scope/ground-clutter.md` is the model for ICRP's own `scope/static-objects.md` + `scope/landmarks.md`.
- `ksa-mods/cartoon-moon/` (git-ignored build output of `scripts/build-cartoon-moon.ts`, Bun, 802 lines): `mod.toml` (`assets=[…]`, `systems=[…]`), `systems/cartoon_sol.xml` (`<System>` + `<LoadFromLibrary Id Parent>` per body; scenarios are not merged), `assets/cartoon_moon.xml` = line-cloned Luna `<PlanetaryBody Id="Looney" Parent="Earth">` with Orbit/Rotation/surface textures (`Category="Terrain"`)/Biomes/`<Terrain>` procedural modifiers (incl. a `Decal` modifier with `<Location><Latitude/><Longitude/>`)/`<GroundClutter>`/`<MeanRadius>`/`<Mass>`/4 `<Landmark>` + 14 `<Crater>` lat-lon markers. **Authors NO launch sites** (Landmarks are plain Apollo markers, no `IsLaunchPad`/`StaticObject`). Its value to ICRP: proven `mod.toml` + `<System>` shape for shipping a whole body, KSA load-crash gotchas (5 LODs, `<Material Id/>` per LOD, global first-wins mesh/material names, mandatory Normal/ORM), and the "reuse `src/ktx/encodeKtx2` from a script" convention.
- `ksa-linux/Content/Core/Astronomicals.xml:1869-1888` has the 5 real launch-pad Landmarks (all → `CoreLaunchPadA_Prefab_LaunchPadA`) inside `<AtmosphericBody>` Earth; `CoreLaunchPadAAssets.xml:1120-1214` the 16–17 `<SubObject>` prefab; `CoreLaunchPadAGameData.xml` the three distances.

## 4. Constitution rules ICRP must inherit (AGENTS.md)
1. **Model ONLY the current KSA build**; NEVER write migration/back-compat/fallback code for game XML (no attribute fallbacks, no "read the old element too"). Stale data is discarded.
2. **Persisted project data: version + default-fill, never convert.** `PROJECT_SCHEMA_VERSION` (purge-at-boot switch) + `PROJECT_EXPORT_VERSION` (exact-match import); additive fields don't bump, breaking changes bump both with a `// vN:` changelog; when in doubt it's breaking.
3. **`scope/` catalog kept in sync in the SAME change** as any game-contract code (XML parse/serialize, ported math, asset/mesh/material naming, mod export, `coords.ts`, renderer quirks); new surface ⇒ new `scope/*.md` + row in `FULL_SCOPE.md`; game-update runbook `scope/GAME_UPDATE_CHECKLIST.md` / `upgrade-ksa` skill; baseline build stamped in `FULL_SCOPE.md`.
4. **Vendored byte-identical Core fixtures** + drift test against `$KSA_ASSETS_DIR`.
5. Tooling: pnpm (bare scripts, no pipes), oxlint + oxfmt only (no ESLint/Prettier), React 19 + React Compiler (no `useMemo/useCallback/memo`, no `"use no memo"`), Rules of React checklist, mandatory `fmt → lint → fmt:check → typecheck → test` before commit, vitest happy-dom, built-in `DOMParser`/`XMLSerializer` + `@xmldom/xmldom` in node, new scripts = vanilla Node 24 type-stripping (`.ts` import extensions, erasable syntax, no Bun/tsx).
6. Layering: `ksa/` and `state/` never import react; `three` only in math/export carve-outs; `three/` and `ui/` are the consumers; transforms cross the boundary only through `coords.ts`.
7. UI: kit primitives only (`ListBoxItem` lint-banned raw), `GridList` over `ListBox`, commands-as-data (every action registers in the command registry), dialogs via `dialogStore` mounted once in `DialogRoot`, no literal z-index, `toast()` facade (dock by default; two floating windows max), scoped hotkey registry + single Escape ladder, all numeric fields via `useNumberDraft` + `inputMode="url"`, persist-by-default via `@nanostores/persistent`.
8. Undo/redo invariant: every document mutator enrolls (discrete `pushUndo` inside, or streaming push-once-at-start); registry/lifecycle ops are not undo steps; add a test per mutation.
9. Docs: `docs/*.md` per feature updated with the change; AGENTS.md keeps repo-area references current; browser verification with project-local Playwright only (dev base path respected).

## 5. Suggested first tasks (asset side first, cheapest unblock)
1. Widen `flexo-private-assets/copy-assets.ts:98`; re-run on Windows; re-run `reencode-textures-uastc.py`; commit.
2. Verify in-game whether a mod can add a `<Landmark IsLaunchPad>` to Earth (or must ship a body). This decides the whole lat/lon UI.
3. `apps/icrp/` scaffold per `docs/wiki-part-preview.md` "adding another mini app" (own `base`, `envDir repoRoot`, `VITE_ASSET_BASE='/flexo/'` on build, root `build` script + `tsconfig.json` reference).
4. `parseStaticAssetsFile` + `CatalogStaticObject`; load `CoreLaunchPadA_Prefab_LaunchPadA` under the X-up root basis with `PartPreviewViewport`-derived viewer; calibration test.
5. Then the editor proper: generic one-kind reconciler, `HistoryEntry<TDoc>` undo, `projectDb<TDoc>`, copied shell stores with ICRP unions, serializer harvest, mod export pure half.
