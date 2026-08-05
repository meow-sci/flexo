# Area analysis: Export to KSA, mod folder, wiki previews & external integration

Analysis for the flexo v2 UI refactor. Verified against code at `main` (fcd5e07), 2026-08-04.
All paths relative to `/Users/asherwin/repos/meow-sci/flexo/` unless absolute.

---

## 1. Feature inventory

### 1.1 Export dialog (KSA part export) — the "Export" button

- **What**: The single entry point for turning the current project into KSA-loadable output.
  One modal with two modes (`xml` | `mod`) selected by a ToggleButtonGroup, plus a pre-flight
  validation report at the top.
- **UI path (desktop)**: top Toolbar → "Export" button (`src/ui/Toolbar.tsx:31`) → fullscreen-variant modal.
- **UI path (mobile)**: MobileTopBar → hamburger Menu → "Export" item (`src/ui/MobileTopBar.tsx:101,120`) —
  the same `ExportButton` component in *controlled* mode (`isOpen`/`onOpenChange` props,
  `src/ui/ExportButton.tsx:69-85`); when controlled it renders no trigger button of its own.
- **Implementing files**: `src/ui/ExportButton.tsx` (whole flow);
  `src/ksa/modExport.ts` (all content building); `src/ksa/partXmlSerializer.ts` (Part + GameData XML);
  `src/ksa/assetsXmlSerializer.ts` (Assets XML); `src/ksa/exportGlb.ts` (mesh-atlas GLB);
  `src/ksa/exportAnimationGlb.ts` + `src/ksa/animationRig.ts` + `src/ksa/animationNaming.ts` (animation GLBs);
  `src/state/modFolderStore.ts` (folder grant).
- **Data model**: reads `$part` (editorStore), `$projectName` (projectStore), `$catalogIndex`
  (catalogStore — merged built-in + custom catalog), `$allReactionIndex` (reactionStore),
  `$kittenTextureExport` (settingsStore), `$modFolder` (modFolderStore),
  `$modelImportSettings.decimateViewMeshes` (settingsStore, read inside modExport via `viewMeshBudget()`,
  `src/ksa/modExport.ts:761-763`).
- **Hotkeys**: none. Nothing in `src/ui/hotkeys/registry.ts` touches export.

#### 1.1.a Pre-flight validation report (inside the Export dialog)

- Computed on every render of the dialog (`src/ui/ExportButton.tsx:87-108`):
  - **Basic warnings** (`validate()`, :45-57): empty Part Id, duplicate instance ids, zero SubParts.
  - **Cross-domain issue list**, four validators concatenated (:100-105):
    `validateEngines(part, reactionIndex)` (`src/ksa/engineValidation.ts`),
    `validateColliders(part)` (`src/ksa/colliderValidation.ts`),
    `validateIvaSeats(part, catalog)` (`src/ksa/ivaSeatValidation.ts`),
    `validateLights(part)` (`src/ksa/lightValidation.ts`).
  - Three severities, each with its own styled box (:130-158):
    - `block` → red `dangerBox`: "KSA would refuse to load this mod (N issues)" — the game throws at load.
    - `warn` → `warningBox`: "Loads, but the part misbehaves (N)".
    - `info` → `noteBox`: "Worth knowing (N)" (e.g. legal-but-surprising light behavior; Core's own floodlight trips one).
- **Important**: these are advisory only — **nothing blocks the export buttons**. A `block`-severity
  issue does not disable "Export to mods folder" / "Download mod zip". v2 must keep the non-blocking
  policy (users may knowingly export WIP) or make gating an explicit decision (see open questions).
- The same engine validator output is rendered elsewhere by `src/ui/EngineIssuesPanel.tsx` (engine
  area) — the validators are shared modules, not export-only.

#### 1.1.b XML mode (`XmlPanel`, `src/ui/ExportButton.tsx:184-280`)

- Three tabs: **Part XML**, **GameData XML**, **Assets XML** (ToggleButtonGroup), read-only mono
  `<textarea>`, one "Copy to clipboard" button with a 1.5 s "Copied!" state.
- Part/GameData bodies are computed synchronously per render via
  `expandGlassGlow(part)` → `buildModContent(expandedPart, projectName, catalog)` (:206-207) — the
  *same* code path as the mod export, so the preview is guaranteed byte-identical to shipped XML
  (including built-in→variant id remapping).
- Assets XML is built **async** in an effect (`buildCustomBundle` fetches GLB geometry, encodes
  KTX2 textures, etc.); the panel shows "Building Assets XML…" until the built result's inputs
  match current inputs (stamp-and-compare, :195-237). When the project has no custom assets/variants,
  it shows an explanatory placeholder ("No Assets XML — …ships just Part + GameData XML").
- **Perf note**: the Assets-bundle build (full texture encode) runs on every part/name/catalog/settings
  change while the dialog is open, purely to preview XML. See pain points.

#### 1.1.c Part Mod mode (`ModPanel`, `src/ui/ExportButton.tsx:283-370`)

- Info box: writes a `flexo-parts` part mod — `mod.toml` + `<Name>Part.xml` + `<Name>GameData.xml`
  (+ `<Name>Assets.xml` + `Meshes/`, `Textures/`, `Animations/` binaries when needed);
  "Existing XML in the folder is never overwritten."
- **Export to mods folder** (primary button): `getWritableModFolder()` →
  `writeModToFolder(dir, part, projectName, kittenTex, catalog)` (`src/ksa/modExport.ts:1235-1279`).
  Success/failure surfaced via `toast(...)` (kit toast system). Disabled while busy or when the
  browser lacks the File System Access API.
- **Download mod zip** (ghost button): `buildModZip(...)` (`src/ksa/modExport.ts:1137-1179`) →
  Blob → synthetic `<a download="flexo-parts.zip">` click. Works in any browser; always a clean-slate
  folder layout inside the zip (no suffixing).
- **FolderGrant status row** (`FolderGrant`, :373-415) — four states from `$modFolder.status`:
  - `unsupported` → warning box "This browser can't write to folders. Use 'Download mod zip' instead."
  - `none` → big "Choose mods folder..." button → `pickModFolder()` (native `showDirectoryPicker`,
    `id: 'flexo-mods'`, mode `readwrite`).
  - `ready` → ✓ + folder name + "Change" button (re-pick).
  - `needs-permission` → warning "Access to “{name}” needs to be re-granted." + "Re-Grant" button
    (`requestModFolderPermission()` — permission re-request needs a user gesture).

#### 1.1.d Non-destructive folder write semantics (`writeModToFolder`)

- Creates/opens `<modsDir>/flexo-parts/`.
- Part/GameData/Assets XML written under **non-conflicting names** — case-insensitive collision check
  against existing files; on collision appends `-2`, `-3`, … (`uniqueFileName`, `src/ksa/modExport.ts:97-104`).
  Existing XML is *never* overwritten.
- Binaries (`Meshes/*.glb`, `Textures/*.ktx2`, `Animations/*.glb`) **are** overwritten — they are
  regenerated deterministically, same content ⇒ safe (:1263-1273). Binaries write even when there is
  no Assets XML (animation-only part on Core SubParts still ships `Animations/*.glb`).
- `mod.toml` is **rebuilt from disk**: lists every `.xml` actually present in the folder, sorted
  `localeCompare` (:1275-1276) — so multiple projects exported into the same folder accumulate into
  one mod.
- Returns `{partFile, gameDataFile, assetsFile, assets}`; the toast reports
  "`<part>` + `<gamedata>` → `<dir>/flexo-parts`".

#### 1.1.e What the export content contains (buildModContent / buildCustomBundle)

All in `src/ksa/modExport.ts`; this is game-contract machinery v2 must not touch, but the UI must
keep exposing every input to it:

- `sanitizeBaseName(projectName)` — filename base (strip non-alphanumerics; fallback "Mod") (:81-84).
- `expandGlassGlow(part)` (:703-736) — each placed kitten `glassGlow` visor becomes TWO SubParts
  (glass shell + synthetic `<id>_Glow` opaque emissive layer, geometry inset ×0.99). Runs before
  everything, feeds both serializers and the bundle. Kitten-only by design.
- `buildExportVariantMap(part, catalog, base)` (:260-308) — the current incarnation of the old
  "IVA→NotIVA" mechanism (the literal `NotIVA` naming is gone; see §5): each **built-in** SubPart
  template that (a) has a user-flipped `<Internal>` flag differing from the catalog value, or
  (b) carries flexo SubPart GameData (tank/solar/engine data, SubPart-owned collider or light), is
  re-declared as a fresh `flexo_<base>_<templateId>` variant reusing the built-in Mesh+Material
  and carrying forward the built-in's colliders / `<RayTracing>` / `<ShadowCaster>`. Custom meshes are
  *never* varianted (skipped by document lookup — the catalog-membership bug crashed KSA at startup;
  see the long comment at :247-259 and scope contract #19).
- Placements + GameData reference variant ids via `TemplateRemap`
  (`serializePart(part, remap)` / `serializeGameData(part, base, remap)`,
  `src/ksa/partXmlSerializer.ts:108,136`).
- `buildCustomBundle(part, base, kittenTex, variants, insetIds)` (:789-1129):
  - Animation GLBs — one `Animations/<base>_<AnimName>_<id>_Anim.glb` per exportable animation
    (`isAnimationExportable`: ≥1 joint with members, ≥2 keyframes, non-zero duration —
    `src/ksa/animationNaming.ts:40-44`); path deterministically matches the
    `<KeyframeAnimation Path>` the GameData serializer emits (`animGlbPath`/`animModuleId`).
    The GLB itself is hand-rolled (not GLTFExporter) in `src/ksa/exportAnimationGlb.ts` because KSA
    matches SubParts by exact node name and GLTFExporter prunes empty nodes. The rig bakes the
    rest-anchor semantics (`restAnchorTime`, `src/ksa/animationRig.ts:200-203` — deploy clips are
    modeled at their *deployed* keyframe, not t=0).
  - Mesh-atlas GLB — one named node per **placed** custom mesh; geometry per source kind
    (primitive params / kitten bake / imported *raw* geometry — never the tangented editor cache);
    paired decimated `<id>_VM` picking mesh per node (budget 2000 triangles,
    `VIEW_MESH_TRIANGLE_BUDGET`, `src/ksa/modExport.ts:752`; toggled off by
    `$modelImportSettings.decimateViewMeshes`). GLB post-processed to copy node names onto
    `meshes[i].name` (`src/ksa/exportGlb.ts` header — a wrong name is an in-game NRE).
  - Textures — stored KTX2 uploads copied from IndexedDB (`assetDb`), uniform channels
    deduped into 1×1 solids (`BundleTextures`: `_FlatNormal`, `_NeutralORM`, `_ORM_<hex>`,
    `_BaseColor_<hex>`), glow composites content-addressed and shared, packed ORM generated,
    normal-strength re-encodes. Kitten textures per the export setting: `'bundle'` copies the game's
    .ktx2 into the mod; `'reference'` writes absolute `{contentCorePath}\...` Windows paths (:622-631).
  - `serializeAssets(plan)` — `<MeshAtlas>`, deduped `<PbrMaterial>` list, `<SubPart>` blocks
    (`<PartModel>`|`<PartModelGlass>` + mandatory `<Material>` + `<MeshView>` → `<id>_VM`), and
    reference SubParts for the export variants (`src/ksa/assetsXmlSerializer.ts:147+`).

### 1.2 Mods-folder grant management

- **What**: A single global (project-independent) `FileSystemDirectoryHandle` to the user's
  `Documents/Kitten Space Agency/mods` folder, persisted in **IndexedDB** (`flexo-fs` DB,
  `handles` store, key `modsDir`) — `src/state/modFolderStore.ts`.
- **UI paths**:
  - Grant / change / re-grant: only inside the Export dialog's Part Mod mode (FolderGrant row).
  - Forget: "Reset Everything 🔥" confirm dialog has a "Reset folder access grants (if any)" Switch
    (`src/ui/SettingsButton.tsx:250-262`); `nukeAndReload({resetFsGrants})` deletes the `flexo-fs`
    DB only when checked (`src/ui/nukeAndReload.ts:7,21`). Same switch on the boot-time
    `BuildIdMismatchDialog` reset path (`src/ui/BuildIdMismatchDialog.tsx:11,38`).
  - There is **no** standalone "manage folder" surface outside the export dialog; `forgetModFolder()`
    exists in the store (`modFolderStore.ts:182-185`) but has no direct UI besides the nuke path.
- **Boot behavior**: `initModFolder()` called from `src/main.tsx:62` — reads the stored handle,
  passively queries permission (`queryPermission`, never prompts), sets status
  `ready`/`needs-permission`/`none`/`unsupported`.
- **Status model** (`ModFolderStatus`, `modFolderStore.ts:23-27`) — v2 must surface all four states.
- **Permission-gesture subtlety**: `getWritableModFolder()` may itself trigger the permission prompt
  (called from the export button press = a user gesture); `requestModFolderPermission()` exists for
  the explicit Re-Grant affordance.

### 1.3 Project Data export (data-only JSON)

- **What**: Copy/download the workspace as a versioned JSON envelope for pasting into another
  flexo project. Data-only: carries meshes(-as-data), layers, connectors, kittens, kitten meshes,
  animations, GameData, custom materials (uniform-only), custom reactions — but **no binary assets**.
- **UI path**: top Toolbar → Project button (shows project name) → popover → "Project Data" section →
  "Export..." (`src/ui/ProjectButton.tsx:94-102,121`) → `ExportProjectDialog`
  (`src/ui/ProjectTransferDialogs.tsx:24-100`).
- **Gating**: `hasCustomAssets(part)` (`src/state/projectTransfer.ts:155-157`) — blocked when the
  project has uploaded textures or any non-data-only mesh (primitive/imported); **kitten meshes are
  fine** (pure descriptors over built-in game assets). When blocked the dialog body is replaced by a
  warning box; export UI is entirely hidden. The warning text explicitly points to the KSA part-mod
  export as the alternative. (Comment marks this "Phase 1"; bundling binaries is a known Phase-2 TODO.)
- **Actions**: read-only mono textarea of the JSON; "Copy to clipboard" (1.5 s Copied!);
  "Download .json" → `<projectName>.flexo.json`.
- **Serialization**: `buildProjectExport` + `serializeProjectJson` (`src/state/projectTransfer.ts`),
  built on the compact `projectCodec` (short keys, dropped defaults). JSON only serialized while the
  dialog is open and unblocked (`ProjectTransferDialogs.tsx:37`).

### 1.4 Project Data import (additive paste)

- **UI path**: Project popover → "Import..." (`src/ui/ProjectButton.tsx:103-112,122`) →
  `ImportProjectDialog` (`src/ui/ProjectTransferDialogs.tsx:102-166`).
- **What**: paste JSON textarea → "Import" (disabled while empty) → `parseProjectImport(text)`
  (validated envelope) → `importProjectData(env)` (editorStore) — **additive merge, one undo step**;
  ids remapped (animations/couplings/feeds rewritten via `src/ksa/idRemap.ts` machinery inside
  editorStore/projectTransfer), imported layers mirrored as new layers. Success toast summarizes
  "N meshes, N connectors, N animations, N layers"; parse failure → danger toast, dialog stays open.
- Textarea content cleared when the dialog closes.

### 1.5 Share Project (stateless deep link)

- **UI path**: Project popover → "Share Project..." (`src/ui/ProjectButton.tsx:83-92,120`) →
  `ShareProjectDialog` (`src/ui/ShareProjectDialog.tsx`).
- **What**: encodes the ENTIRE project into a `?load=<payload>` URL:
  compact JSON → Zstd level 19 → URL-safe Base64 (`src/state/projectShareLink.ts:35-64`). No server.
- **Flow**: "Generate link" (async — Zstd WASM) → link shown in a `<pre>` with character count,
  "Regenerate", "Copy link" buttons; warning paragraph when length > 8000 chars (URL truncation risk,
  `ShareProjectDialog.tsx:117-122`); errors shown in a warning box.
- **Gating**: same `hasCustomAssets` gate as JSON export (binaries can't ride in a URL); same
  warning-box replacement pattern.
- **Consumption (boot)**: `src/main.tsx:48-78` — `readShareParam()` detects `?load=`; if present it
  suppresses the first-use About intro AND skips the build-id mismatch check (deliberately leaves
  `flexo_build_id` untouched so the safety prompt still fires on the next ordinary visit); async
  decode → `loadSharedProject(env)` (`src/state/projectStore.ts:390`) opens it as a **new local
  project** (never overwrites current); `clearShareParam()` strips the param via `replaceState`;
  success/danger toast. Decode failure never destroys the hydrated project.

### 1.6 Kitten-texture export mode setting

- **UI path**: top Toolbar → Menu (hamburger) → Settings → "Kitten mesh textures (export)" section
  (`src/ui/SettingsButton.tsx:128-159`).
- **What**: Select `reference` ("Reference game install") vs `bundle` ("Bundle copies into mod",
  default); `reference` reveals a mono TextField for the Windows `Content/Core` path with an
  explanatory footnote (mod becomes install-location-tied). Persisted at
  `localStorage flexo:kittenTextureExport` (`src/state/settingsStore.ts:207-224`).
- Consumed by `planKittenSubPart` (`src/ksa/modExport.ts:586-660`) and read live by both XmlPanel
  (Assets preview) and ModPanel.
- **Note**: this is an *export* setting living in the generic Settings modal, physically far from
  the Export dialog that consumes it — discoverability concern for v2.

### 1.7 View-mesh decimation setting (export-relevant import setting)

- `$modelImportSettings.decimateViewMeshes` (settingsStore) — set in the model-import UI area but
  consumed at export time (`viewMeshBudget()`, `src/ksa/modExport.ts:756-763`): ON (default) →
  `_VM` picking meshes decimated to 2000 triangles; OFF → full-resolution `_VM` (slow in-game hover).
  Global persisted preference, not per-project.

### 1.8 Built-in part import incl. animation GLB decode (inbound integration)

- Add → part browser imports a built-in catalog Part **including its keyframe animations**:
  `importBuiltInPart` (`src/state/partImport.ts`) fetches each `<KeyframeAnimationModule>`'s
  `_Anim.glb` from the served `ksa/` asset tree, decodes it (`src/ksa/animationImport.ts`), fits
  easing curves (`easingFit`), remaps to fresh instance ids, and sets `restKeyframeId` so KSA
  deploy clips (modeled deployed) anchor correctly. This is the read-side twin of the animation
  GLB export and shares `animationNaming` semantics. (UI entry is the Add/PartBrowser area; the
  GLB decode/rest-anchor logic is export-area domain knowledge.)

### 1.9 In-app part preview viewport (shared with wiki app)

- `src/ui/PartPreview.tsx` — thin React mount of `src/three/PartPreviewViewport.ts`; used by the
  Part browser popup (`src/ui/PartBrowser.tsx:153`) to preview the selected built-in Part before
  adding. Same viewport class powers the wiki mini-app's `PreviewCanvas`. v2 must keep the
  viewport-instance-survives-part-swap behavior (renderer not recreated on selection change).

### 1.10 Wiki Part Preview mini-app (`apps/partpreview/`) — standalone external integration

- **What**: A standalone Vite SPA (own root, own `vite.config.ts`, `base
  '/flexo/apps/partpreview/'`, built into `dist/apps/partpreview/` after the main build) that
  renders ONE built-in KSA Part chosen by `?part_id=`, meant to be iframed by an external wiki
  down to 200×200. It is *not* mounted inside the editor — no in-editor entry point links to it,
  and it deliberately never touches the editor's persistent stores (would leak/clobber user
  settings; in-memory atoms only, `apps/partpreview/src/settings.ts`).
- **Files**: `apps/partpreview/src/App.tsx` (error views for missing/unknown part_id, load bar),
  `PreviewCanvas.tsx`, `ZoomControls.tsx` (bottom-right `[−][+][⚙]` floating bar),
  `SettingsMenu.tsx` (flat cog menu: Show→Connectors, Show→Measurements, Lighting…, Reset settings),
  `LightingDialog.tsx` (environment select over all nine presets, show-sky switch, tone mapping /
  exposure / reflections / sky-blur — same ranges as the editor View menu),
  `MeasurementReadout.tsx` (bottom-center HTML `x × y × z m` copy-to-clipboard button with
  axis-colored arrows), `DownloadProgress.tsx` (bottom-edge progress bar), `capture.html` +
  `src/capture.ts` (headless thumbnail capture page exposing `window.__flexoCapture`),
  `src/thumbsSpec.ts` (shared naming/angle contract).
- **Wiki contract** (`docs/wiki-part-preview.md`): `manifest.json`
  (`part_ids`, `skybox_ids`, `ksa_build` cache-busting handle, optional `thumbs` /
  `partgifs` maps) written by the `vite/previewManifest.ts` plugin, which reuses the app's own
  `parsePartsFile` parser so the manifest can never advertise a part the viewer rejects; query
  params `part_id` (required), `skybox_id`, `connectors=1`, `measure=1`. Degrades gracefully
  (unknown part → inline message, no WebGL context; unknown skybox → procedural studio).
  Works fully sandboxed (`allow-scripts` without `allow-same-origin`).
- **Orientation triad**: `src/three/AxisGizmo.ts`, second-pass corner render, colors shared with the
  HTML readout via `src/three/axisColors.ts`; auto-sizes 20% of the smaller side, clamped 44–84 px,
  hides if it won't fit.
- **Thumbnails**: `scripts/capture-part-thumbs.ts` (vanilla Node 24 + Playwright Chromium + ffmpeg)
  renders 10-angle PNG turntables + looping GIFs into `dist/`, patching the manifest; run by CI
  between build and Pages upload. Order matters: build → thumbs, never a mini rebuild after.
- **Shared-asset mechanism**: `src/assetBase.ts` (`VITE_ASSET_BASE || BASE_URL`) lets the mini app
  fetch `ksa/`, `hdr/`, `basis/` from the *main* app's copy; must be called inside function bodies
  (Node imports the catalog chain for the manifest plugin).
- **Explicit limits**: built-in Parts only (no custom parts/kittens/animations/IVA); no deep links
  editor↔preview in either direction.

### 1.11 Animation preview scrubber (adjacent, shared surface)

- `src/ui/PreviewScrubber.tsx` — the spring-loaded animation scrub Slider + play-once button,
  shared by the inline inspector editor and the floating anim toolbar; drives
  `$animPreviewU`/`$animScrubbing` (animationStore). Included here only because the rest-anchor
  semantics it previews are exactly what the animation GLB export bakes; ownership belongs to the
  animation-editor area.

### 1.12 Build-id mismatch dialog (deployment integration)

- `src/ui/BuildIdMismatchDialog.tsx`, mounted at root in `src/main.tsx:84`; `checkBuildId()`
  compares a stored `flexo_build_id` against the deployed build; on mismatch shows a
  non-dismissable center modal ("New version available") offering "Reset everything" (with the
  fs-grant switch) or dismiss. Skipped entirely on share-link launches (main.tsx:50-59).

---

## 2. UI surface map

| Surface | Kind | Mounts / positioning | Notes |
| --- | --- | --- | --- |
| Export dialog | Modal (react-aria `Modal`, `variant="fullscreen"`, `max-w-2xl`) | Portal via kit Modal; trigger in top Toolbar (desktop) or opened from MobileTopBar menu | Contains mode toggle, validation boxes, tab group + textarea (XML mode) or grant row + 2 big buttons (mod mode). Scrollable body (`overflow-auto`). |
| Native directory picker | Browser chrome | `window.showDirectoryPicker` | Triggered from inside the Export modal — OS-level dialog over the modal. |
| Native permission prompt | Browser chrome | `requestPermission` | Can appear when pressing "Export to mods folder" (getWritableModFolder requests inline). |
| Export Project Data dialog | Modal (`fullscreen` variant, `max-w-2xl`) | Opened from Project popover (popover closes first — no modal-in-popover stacking) | Blocked-state swaps entire body for a warning box. |
| Import Project Data dialog | Modal (same variant) | ditto | Paste textarea + Import button. |
| Share Project dialog | Modal (same variant) | ditto | Generate/Regenerate/Copy; >8000-char warning. |
| Project popover | Popover (`bottom start`, w-64) | Anchored to Project toolbar button | Hosts the three Project-Data launchers + rename/new/load. |
| Load Project dialog | Modal (`center`, max-w-lg) | From Project popover | Contains nested `ConfirmDialog` for delete (modal-in-modal, kit-supported). |
| Settings modal → kitten-texture export section | Modal (`center`) | From hamburger Menu | Export-consumed setting lives here. |
| Reset-everything ConfirmDialog | Modal | From hamburger Menu / BuildIdMismatchDialog | Carries the "Reset folder access grants" switch (modFolder integration). |
| Build-id mismatch dialog | Modal (`center`, non-dismissable) | Root-mounted (`main.tsx`) | Plus nested ConfirmDialog. |
| Toasts | `GlobalToastRegion` (kit) root-mounted | Fixed overlay | Export success/failure, share-link open results, import summaries. |
| **Wiki app** zoom bar | Floating bar, bottom-right fixed | `apps/partpreview/src/ZoomControls.tsx` | `[−][+][⚙]`; cog opens a flat react-aria Menu (submenus can't fit at 200×200). |
| **Wiki app** Lighting dialog | Modal | partpreview | Env select, sky switch, tone-mapping/exposure sliders. |
| **Wiki app** measurement readout | HUD, bottom-center HTML | `MeasurementReadout.tsx` | Ghost Button whole-row copy-to-clipboard, ✓ 1.2 s. |
| **Wiki app** axis triad | Canvas overlay (second render pass), top-left | `src/three/AxisGizmo.ts` | Not DOM; auto-hides when too small. |
| **Wiki app** download progress | HUD bar hugging bottom edge | `DownloadProgress.tsx` | Indeterminate during catalog phase. |

Known stacking/flow notes:
- No z-index fights observed in this area; all modals go through the kit Modal portal.
- The Export dialog is one modal doing four jobs (validation report, XML preview ×3 tabs, folder
  grant management, two delivery actions) — density, not stacking, is the issue.
- Popover→dialog transitions always close the popover first (ProjectButton pattern), avoiding
  nested-overlay focus problems.

---

## 3. State & data flow

Stores and persistence:

| Store | File | Persistence | Role in this area |
| --- | --- | --- | --- |
| `$modFolder` | `src/state/modFolderStore.ts` | Handle in **IndexedDB** `flexo-fs/handles/modsDir`; status ephemeral, derived on boot | Folder grant status/name. Deliberately separate from projectStore (machine capability, not project data). |
| `$kittenTextureExport` | `src/state/settingsStore.ts:218` | **localStorage** `flexo:kittenTextureExport` | Kitten texture export mode + Content/Core path. |
| `$modelImportSettings.decimateViewMeshes` | settingsStore | localStorage | `_VM` decimation on/off, read at export. |
| `$part` | editorStore | project snapshot (localStorage via projectStore) + IndexedDB blobs | Everything exported. Includes `internalFlags` (per-template `<Internal>` overrides) which persist in the project codec (`projectCodec.ts:1394` key `ifl`) and transfer envelopes. |
| `$projectName` | projectStore | localStorage | Filename base + mod XML names. |
| `$catalogIndex` | catalogStore | ephemeral (fetched ksa/ tree) | Variant map source (built-in Internal/colliders/RayTracing/ShadowCaster values). |
| `$allReactionIndex` | reactionStore | ephemeral + custom reactions in project | Engine validation input. |
| assetDb | `src/state/assetDb.ts` | **IndexedDB** blobs | Texture KTX2/source bytes, emissive paint PNGs, import atlas GLBs — read during bundle build. |
| Wiki app settings | `apps/partpreview/src/settings.ts` | **in-memory only** (by contract) | Never touches editor persistent stores. |

Flow notes:
- **Nothing in the export path participates in undo/redo** — export is read-only over `$part`.
  The only undoable action in this area is Project Data **import** (`importProjectData` = one undo
  step).
- Export content building is pure functions over a snapshot of `$part` (`buildModContent`,
  `buildCustomBundle`) — no store writes; the only store writes are `$modFolder` status updates and
  toasts.
- The XML preview effect (`ExportButton.tsx:209-226`) subscribes to part/projectName/catalog/
  kittenTex and rebuilds the full assets bundle each change (cancellation via closure flag).
- Boot ordering (`src/main.tsx`): registerEditorAidStores → hydrateProjectOnBoot →
  initCustomAssets → initAnimationStore → share-param detection → checkBuildId (skipped on share) →
  `void initModFolder()` (async, updates export UI when ready) → async share decode/load.
- `nukeAndReload` preserves fs-grant DBs (`FS_GRANT_DBS`) unless the user opts in to resetting them.

---

## 4. Pain points

1. **One modal, four jobs** (`src/ui/ExportButton.tsx`): validation report + XML preview (3 tabs) +
   folder-grant management + two delivery actions all share one `max-w-2xl` scroll column. With a
   part that trips several validators, the warnings push the actual export controls below the fold.
   A v2 mode-based layout could split "preview XML" from "deliver mod" and give validation a
   persistent status-bar presence.
2. **Assets-XML preview is expensive and always-on**: the effect at `ExportButton.tsx:209-226` runs
   the FULL bundle build (KTX2 encodes, GLB atlas build, kitten bakes, glow composites) on every
   input change while the dialog is open — even when the user is on the Part XML tab and never looks
   at Assets. Cancellation only prevents the setState, not the wasted work. v2 should build lazily
   per tab or debounce.
3. **Export settings are scattered**: kitten-texture export mode lives in Settings → "Kitten mesh
   textures (export)" (`SettingsButton.tsx:128-159`); `_VM` decimation lives in model-import
   settings; the export dialog itself shows neither, nor links to them. A user exporting a
   part-ified kitten has no in-dialog indication of which mode will apply.
4. **Mod-folder management has no home**: grant/change/re-grant exist only inside the Export dialog;
   "forget" exists only as a switch buried in the Reset-Everything confirm. There is no way to see
   or clear the granted folder from a settings surface. (`forgetModFolder` is exported but UI-less
   outside nuke.)
5. **Non-blocking `block`-severity issues**: the dialog says "KSA would refuse to load this mod" yet
   both export buttons stay enabled (`ExportButton.tsx:355-366` — only folder support/busy disable
   them). Defensible (WIP exports), but the severity naming vs. behavior mismatch confuses.
6. **Three near-identical clipboard/download dialog implementations**: XmlPanel copy
   (`ExportButton.tsx:241-249`), ExportProjectDialog copy/download
   (`ProjectTransferDialogs.tsx:39-59`), ShareProjectDialog copy (`ShareProjectDialog.tsx:55-64`)
   each hand-roll `navigator.clipboard` + 1.5 s "Copied!" state and the `<a download>` dance.
   Should be one kit primitive in v2.
7. **hasCustomAssets gate is all-or-nothing and explains itself twice**: the same long warning
   paragraph is duplicated in ExportProjectDialog (:73-78) and ShareProjectDialog (:78-82) with
   slightly different wording; neither offers to *show* which assets are blocking (user must hunt
   through the assets panel). Phase-2 (bundle binaries into project export) is a known TODO
   (memory + comments).
8. **Project transfer entry points are 3 items deep**: Share/Export/Import live in a popover section
   under a button labeled with the project *name* (not "Project") — low discoverability for a
   first-time user hunting "how do I save this to a file".
9. **`validate()` duplicates work already modeled elsewhere**: the ad-hoc trio of basic warnings
   (empty part id / dupes / no placements) is separate from the four structured validators; there is
   no unified issue model with severities for these, so styling and copy diverge.
10. **XmlPanel derived-state stamping** (:195-237) — the "compare five stamped inputs to know if the
    build is fresh" pattern is correct but subtle; a v2 rework should encapsulate the async preview
    in a hook/store rather than re-implementing the stamp compare.
11. **Wiki app is invisible from the editor** — deliberate today (docs "Limits"), but if v2 grows a
    "modes" shell it's worth an explicit decision whether the preview app stays unlinked.
12. **Mobile export flow duplicates dialog-state plumbing**: MobileTopBar re-hosts every dialog as
    controlled state (`MobileTopBar.tsx:119-126`), a parallel copy of the desktop wiring — the v2
    menubar should own dialog state once.

---

## 5. Invariants & constraints (MUST survive)

Game-contract (all verified in code + `scope/custom-assets-and-mod-export.md`, baseline KSA
2026.8.3.5117 — INTACT):

- **The XML preview and the shipped mod must come from the same builder** (`buildModContent` /
  `expandGlassGlow` / `buildCustomBundle` shared by XmlPanel, buildModZip and writeModToFolder).
  Any v2 preview must keep this single-source property.
- **Non-overwrite folder contract**: existing XML in `flexo-parts/` is never overwritten
  (case-insensitive `-N` suffixing); binaries may overwrite; `mod.toml` rebuilt from the actual
  folder listing. Users rely on exporting multiple projects into one mod folder.
- **Export variant rules** (scope contract #19): variants minted only for built-in templates with
  changed `<Internal>` or attached SubPart GameData/colliders/lights; id
  `flexo_<base>_<templateId>` (the historical `_NotIVA` naming is gone — one naming rule, no
  interior-prop special case); custom meshes NEVER varianted (skip by `part.customMeshes` document
  lookup, not catalog absence — the other way crashes KSA at startup); variants carry forward
  built-in colliders, `<RayTracing>`, `<ShadowCaster>`; fresh `<PartModel Id>` mandatory (KSA dedupe).
- **Every `<PartModel>` carries `<Material>`; every `<PbrMaterial>` carries
  Diffuse+Normal+AoRoughMetal** (unguarded NRE at KSA startup otherwise); neutral fallback material
  `0xbfc4cc` matches the editor's untextured look.
- **GLB rules**: mesh name copied from node name; always indexed; only POSITION/NORMAL/TEXCOORD_0;
  paired distinct-geometry `_VM` view mesh per SubPart; `_VM` decimation preserves vertex arrays
  (index-only simplification); no node TRS.
- **KTX2 flavor**: `R8G8B8A8_UNORM` + linear DFD + Zstd, never `_SRGB`-tagged (double-decode bug).
- **Glass**: never `<Internal>`, never `<Emissive>`; `glassGlow` layered export is kitten-only,
  inset 0.99.
- **Animation export**: `animGlbPath`/`animModuleId` naming must stay in lockstep between GameData
  XML and bundle; `isAnimationExportable` gate; rest-anchor (`restKeyframeId`/`restAnchorTime`)
  semantics; hand-rolled GLB (named leaf nodes must exist — GLTFExporter would prune them).
- **Kitten reference-mode paths are Windows absolute** (`joinContentCore` uses `\`).
- **`formatG6`** number formatting for all XML numeric output (matches KSA's G6 round-trip).
- **`sanitizeBaseName` / `uniqueFileName` / `serializeModToml`** exact behaviors (mod.toml format:
  `name = "flexo-parts"` + `assets = [ ... ]`).

Persistence formats:
- IndexedDB `flexo-fs/handles/modsDir` (directory handle) — survives reloads; permission may lapse;
  re-grant requires a user gesture. The four-state status model must survive.
- `flexo:kittenTextureExport` localStorage shape `{mode, contentCorePath}`.
- Project export envelope (versioned; `projectTransfer.ts` + `projectCodec.ts`) and the
  `?load=` share-link pipeline (compact JSON → Zstd 19 → base64url; param name `load`) are public
  interchange formats — existing shared links and downloaded `.flexo.json` files must keep opening.
- `internalFlags` codec key `ifl` in saved projects.

Behavioral invariants:
- Project import is additive with id remapping and is ONE undo step.
- Share-link boot: suppress intro + skip build-check without consuming them; open as NEW project;
  strip `?load=` after consumption; never clobber the current project on decode failure.
- Export gate `hasCustomAssets` treats kitten meshes as data-only (exportable/sharable).
- Zip export works with zero filesystem permissions (any-browser fallback path must remain).
- Export never throws halfway on a bad mesh: unresolvable geometry warns + drops that SubPart, rest
  of the export ships (`modExport.ts:840-897`).
- Wiki app must never touch the editor's persistent stores (same-origin leak).
- Wiki-facing contract: `manifest.json` shape, query params, trailing-slash requirement, sandbox
  guarantees, `ksa_build` cache-busting — external consumers depend on all of it.
- Project-wide numeric-input convention (useNumberDraft + `inputMode="url"`) applies to any numeric
  field a v2 export/settings surface adds (the only numeric-ish input in this area today is the
  Content/Core path TextField, which is free text).

---

## 6. Hotkeys

**None.** No export-, share-, or mod-folder-related bindings exist in
`src/ui/hotkeys/registry.ts`; the Export dialog, Project-Data dialogs and wiki app register no
hotkeys. (The wiki app relies on stock OrbitControls gestures only.) v2 is free to add e.g.
Ctrl/Cmd+E without collision, but nothing must be preserved.

---

## 7. Cross-area dependencies

Inbound (other areas → export):
- **Validators**: engine/collider/IVA-seat/light validators are owned by their feature areas but
  surfaced in the export pre-flight; `EngineIssuesPanel.tsx` shows the engine set independently.
- **Interior (IVA-only) flag**: set via `MultiSelectToolbar` "Interior (IVA only)" toggle and
  `setPlacementsInternal` (`src/state/editorStore.ts:3896`) — the selection/inspector area writes
  the `internalFlags` the export variant map consumes. Glass exclusion logic is shared
  (`canSetInternal`-style gating in the toolbar, hard-forced off in export).
- **Custom assets/textures/materials area**: everything in IndexedDB assetDb; upload-time KTX2
  encoding conventions; `getPrimaryTextureId`, `glowFor`, `customMeshRenderCache` semantics.
- **Animation area**: `PartAnimation` model, restKeyframeId, `$animPreviewU` preview;
  `isAnimationExportable` decides what ships.
- **Kitten area**: `bakeKittenSubMeshes`, visor surface modes (`glass`/`glow`/`glassGlow`).
- **Model import area**: `getImportedRawGeometry` (raw vs tangented cache split), `decimateViewMeshes`
  setting, `imported.transparent` glass flag.
- **Settings area**: hosts the kitten-texture export mode UI; nuke/reset owns fs-grant clearing.
- **Project store area**: projectName, project envelope/codec, loadSharedProject.

Outbound (export → others / external):
- `writeModToFolder`/`buildModZip` consumed only by ExportButton today.
- `PartPreviewViewport` shared: editor Part browser popup + wiki app + thumbnail capture page.
- `src/assetBase.ts` indirection used by catalog/textureSupport/SceneEnvironment for the wiki app's
  shared-asset scheme — any refactor of asset URL building must keep it callable from Node and
  function-scoped.
- CI/deploy pipeline (`.github/workflows/deploy.yml`) runs the thumbnail capture between build and
  upload; `pnpm build` order (main → mini app) and `emptyOutDir` semantics are load-bearing.
- External wiki consumes `manifest.json` + iframe URLs — a public contract outside the repo.

---

## 8. Open questions for v2

1. **Should `block`-severity issues actually block export?** Today they don't (WIP exports are
   possible). Options: keep advisory; gate with an explicit "export anyway" override; or gate only
   the mods-folder write (zip stays free).
2. **Where does mod-folder management live in a menubar/status-bar world?** A Settings/Integrations
   page with grant status + forget; a status-bar chip showing `ready/needs-permission`; or keep it
   inline in the export flow only. The `needs-permission` re-grant needs a user gesture, which a
   passive status surface can host well.
3. **Export as dialog vs. mode?** The refactor introduces modes; export could be (a) a rich overlay
   dialog (closest to today), (b) a dedicated "export/preview" mode with the XML preview as a
   panel + live validation in the sidebar, or (c) a menubar File→Export submenu with direct actions
   (write folder / zip / copy XML) and a separate preview surface.
4. **Unify the three transfer dialogs (Share / Export JSON / Import JSON) into one "Project
   transfer" surface?** They share the gate, the clipboard/download patterns and the audience.
5. **Should export settings (kitten texture mode, `_VM` decimation) surface inside the export flow**
   (a collapsible "Export options" section with the applicable subset) instead of/in addition to
   the global Settings modal?
6. **Lazy vs. eager Assets-XML preview**: build on tab focus with an explicit "rebuild" affordance,
   or keep live-updating? (Cost is full texture encode.)
7. **Phase-2 project export with binaries**: when the `hasCustomAssets` gate falls, does project
   export converge with the mod zip (one "export bundle" writer) or stay a separate `.flexo.json` +
   sidecar format?
8. **Wiki preview app linkage**: keep fully unlinked, or add an editor "open in preview"/copy-embed
   affordance now that a menubar exists? (Current docs say no deep links, deliberately.)
9. **Per-project vs. global mod folder**: the grant is deliberately global; is a per-project
   override (different mods folders per game install) worth the complexity in v2?
10. **Validation placement**: with a bottom status bar in v2, should the pre-flight validators run
    continuously (issue counter chip → click to open the report) instead of only when the export
    dialog opens?
