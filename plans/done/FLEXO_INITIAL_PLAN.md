# Flexo — Initial Implementation Plan

A comprehensive, phase-by-phase plan for building **flexo**: a browser-based KSA (Kitten
Space Agency) **Part editor**. Flexo lets a user browse the game's **SubParts**, place them
into a full-screen 3D workspace, arrange them with translate/rotate/scale (via both 3D
gizmos and numeric inputs that share the same backing data), and export the result as KSA
**Part XML** suitable for a game mod.

This document is written to be executed by future coding-agent sessions with **no prior
context**. Every phase lists concrete files, data shapes, and acceptance criteria. Read the
"Domain Reference" section first — it is the source of truth for the data formats.

---

## 0. Orientation — read this before touching code

### 0.1 What flexo is replacing / mirroring

The reference implementation is `thirdparty/space-tape/` + `thirdparty/space-tape.lib/` — an
**in-game** (C# / ImGui) KSA mod that does exactly what flexo does, but inside the running
game. Flexo re-implements the same workflow as a standalone web app. Study these files as the
behavioral spec (do **not** port C# line-by-line — re-implement idiomatically in TypeScript):

| space-tape file | What to learn from it |
|---|---|
| `space-tape.lib/PartEditorState.cs` | The core data model: `EditingPart`, `SubPartPlacement`, `PartGameDataState`, and the `PartEditorController` (undo/redo, selection, add/remove/duplicate). Flexo's state model mirrors this. |
| `space-tape.lib/PartXmlSerializer.cs` | **Exact** Part→XML serialization rules (transform omission, rotation as Euler XYZ radians, `G6` number formatting). Flexo's exporter must match byte-for-byte semantics. |
| `space-tape.lib/GameDataXmlSerializer.cs` | GameData→XML rules (stretch goal in flexo). |
| `space-tape.lib/PartImporter.cs` | How an existing Part is read back into editor state (stretch goal: import). |
| `space-tape.lib/GameDataModels.cs` | State classes for Tank/Connector/Coupling/Battery/etc. (stretch goal). |
| `space-tape.lib/SubPartCatalog.cs` | How SubParts are enumerated (filter: `IsSubPart && !IsHidden`). |
| `space-tape/README.md` | Full feature list + hotkeys of the reference editor. Good for scoping later phases. |

### 0.2 Reference asset locations (read-only, do NOT modify)

- `thirdparty/ksa/` — decompiled KSA C# (reference only; large — read strategically).
- `thirdparty/ksa/Content/Core/` — the game's built-in "Core" mod data:
  - `Content/Core/*.xml` — SubPart / Part / material / gamedata definitions.
  - `Content/Core/Meshes/*.glb` — glTF binary mesh atlases.
  - `Content/Core/Textures/*.ktx2` / `*.dds` / `*.png` — texture atlases.

### 0.3 Confirmed tech stack (already scaffolded in `package.json`)

- **React 19** (`react`, `react-dom` 19.2.x) — NOT preact. (AGENTS.md mentions preact but the
  repo switched to React; `package.json` is authoritative.)
- **Vite 8** + `@vitejs/plugin-react`.
- **TypeScript 6**.
- **three.js 0.184** (`three`, `@types/three`).
- **cladd** (`@cladd-ui/react`) — React UI kit. **Not yet installed.** Requires React 19 +
  Tailwind CSS v4. Docs live locally at `.agents/skills/cladd/react/`. Use the `cladd` skill.
- ESLint 10 + typescript-eslint already configured.

The current `src/` is the stock Vite template (`app.tsx`, `main.tsx`, `app.css`, `index.css`,
`assets/`) and must be cleared out in Phase 1.

### 0.4 Local skills available (use them — do not reinvent)

threejs-fundamentals, threejs-geometry, threejs-materials, threejs-lighting, threejs-textures,
threejs-animation, threejs-loaders, threejs-shaders, threejs-postprocessing,
threejs-interaction, and **cladd** (`.agents/skills/cladd/`). The threejs-loaders and
threejs-interaction skills are directly relevant to Phases 4 and 6.

---

## Domain Reference (source of truth for data formats)

### D.1 The asset graph: SubPart → Mesh node → GLB atlas; SubPart → Material → texture atlas

A KSA `*Assets.xml` file (e.g. `Content/Core/CoreStructuralAAssets.xml`) declares, at the top
level inside `<Assets>`:

1. **One or more `<MeshAtlas>`** — points at a `.glb` file. Two forms:
   - File-default (no Id): `<MeshAtlas Path="Meshes/CoreStructuralA_MeshAtlas.glb" />`
   - Named: `<MeshAtlas Id="LightPartMesh" Path="Meshes/circle_light.glb"/>`
2. **`<PbrMaterial Id="...">`** — references texture atlas files:
   ```xml
   <PbrMaterial Id="CoreStructuralA_Material">
     <Diffuse Path="Textures/CoreStructuralA_TextureAtlas_Diffuse.ktx2" Category="Vessel" />
     <Normal Path="Textures/CoreStructuralA_TextureAtlas_Normal.ktx2" Category="Vessel" />
     <AoRoughMetal Path="Textures/CoreStructuralA_TextureAtlas_PBR.ktx2" Category="Vessel" />
     <Emissive Path="Textures/..._Emissive.ktx2" Category="Vessel" />  <!-- optional -->
   </PbrMaterial>
   ```
3. **`<SubPart Id="...">`** definitions:
   ```xml
   <SubPart Id="CoreStructuralA_Subpart_TrussBracingStrutA">
     <PartModel Id="..._Model">
       <Mesh Id="CoreStructuralA_Subpart_TrussBracingStrutA" />   <!-- render mesh -->
       <Material Id="CoreStructuralA_Material" />
     </PartModel>
     <MeshView>
       <Mesh Id="CoreStructuralA_Subpart_TrussBracingStrutA_VM" /> <!-- low-poly view/collision -->
     </MeshView>
   </SubPart>
   ```

**CRITICAL FACT (verified):** the value of `<Mesh Id="X"/>` is the **`name` of a node** inside
the atlas GLB. Example: `CoreStructuralA_MeshAtlas.glb`'s glTF JSON contains
`{"mesh":0,...,"name":"CoreStructuralA_Subpart_Endcap1WA"}` etc. So flexo's render path is:
**load the GLB → `scene.getObjectByName(meshId)` → clone that node's geometry.** The `_VM`
suffixed names are the low-detail "view meshes"; flexo renders the **non-`_VM`** `<PartModel>`
mesh. Each mesh node sits at its own local origin (node translations are ~0/epsilon), so the
Part-level transform is what positions it.

**Material→mesh mapping for textures (stretch goal):** the GLB mesh node already carries UVs
that index into the texture atlas. To render textured, load the `<Material>`'s `Diffuse`
(and Normal/AoRoughMetal) atlas and apply to the mesh. `.ktx2` requires three.js `KTX2Loader`
+ a Basis transcoder. Untextured (flat/standard material) is acceptable for the initial pass.

The `Category="Vessel"` attribute is a KSA texture-category hint; flexo can ignore it.

### D.2 SubPart catalog filter

Mirror `SubPartCatalog.cs`: the catalog is every `<SubPart>` that is **not hidden**. In XML,
a SubPart/Part is hidden via `<EditorTag Value="Hidden"/>`. For flexo's catalog, include all
top-level `<SubPart Id="...">` elements found across the Core `*Assets.xml` files. (Some
SubParts like `KittenBackPackSubPart` have no `<PartModel>` — skip catalog entries that have
no resolvable render mesh, logging the skip.)

### D.3 Part XML format (the export target)

A Part lives inside `<Assets>` and lists SubPart **instances** plus optional connectors:

```xml
<Part Id="CoreCouplingA_Prefab_DockingPort1WA">
  <SubPart Id="CoreCouplingA_Subpart_GuideRingA1" InstanceOf="CoreCouplingA_Subpart_GuideRingA">
    <Transform>
      <Position X="0.14270" Z="-0.06010" />
    </Transform>
  </SubPart>
  <SubPart Id="..._GuidePetalA3" InstanceOf="CoreCouplingA_Subpart_GuidePetalA">
    <Transform>
      <Position X="0.27990" Y="-0.56950" Z="0.32880" />
      <Rotation X="-2.09440" />
    </Transform>
  </SubPart>
  <!-- optional connectors -->
  <Connector Id="top">
    <Transform> <Position Y="1.0"/> </Transform>
    <Flags>Internal, ToSurface</Flags>
  </Connector>
</Part>
```

- `<SubPart Id>` = the **instance id** (unique within the Part). `InstanceOf` = the SubPart
  **template id** (catalog id).
- `<EditorTag Value="..."/>` may appear (e.g. `Hidden`, `Lights`, category tags).
- The whole document is wrapped `<?xml version="1.0" encoding="utf-8"?><Assets> ... </Assets>`.

### D.4 Transform serialization rules (from `PartXmlSerializer.cs` — match exactly)

- `<Transform>` is **omitted entirely** if position is (0,0,0) AND rotation is identity AND
  scale is (1,1,1).
- Within `<Transform>`, each of `<Position>`, `<Rotation>`, `<Scale>` is **omitted** if it
  equals its default (Position→0, Rotation→0, Scale→1), using epsilon `1e-9`.
- Within a vector element, **each axis attribute** (`X`/`Y`/`Z`) is omitted if that axis equals
  the default. (e.g. `<Position X="0.14270" Z="-0.06010" />` — no `Y` because Y==0.)
- Numbers are formatted with .NET `"G6"` (≈6 significant digits, no trailing zeros, may use
  exponential for very small/large). Flexo must replicate: 6 significant figures, trim trailing
  zeros, drop the decimal point if integral. (A small helper `formatG6(n: number): string`.)
- **Rotation is stored as Euler XYZ in radians**, derived from the placement quaternion via
  KSA's `quat.ToXyzRadians()`. Flexo stores rotation however is convenient internally (quaternion
  or Euler) but **must export Euler XYZ radians**. See D.5 for the order caveat.

### D.5 Coordinate system & rotation order — VERIFY EMPIRICALLY (do not assume)

- glTF/GLB is **right-handed, Y-up, meters**. three.js is also **right-handed, Y-up, meters**.
  So the default working hypothesis is: **load the GLB into three.js as-is and apply XML
  transforms directly** (no axis flip).
- KSA's rotation export is **Euler XYZ radians**. In three.js this maps to
  `new THREE.Euler(x, y, z, 'XYZ')`. The application order ('XYZ' vs 'ZYX' etc.) and any
  handedness flip is the #1 risk. Phase 4 includes a **calibration step**: import the known Core
  part `CoreCouplingA_Prefab_DockingPort1WA` (defined in `CoreCouplingAAssets.xml`, line ~191 —
  multiple subparts with radial rotations around X) and visually confirm the assembled shape is
  a coherent docking port. If it looks scrambled, try alternate Euler orders / axis sign flips
  and document the correct mapping in `src/ksa/coords.ts` with a comment explaining what was
  verified. **Until calibrated, do not hardcode assumptions elsewhere — route all
  XML↔three.js transform conversion through `coords.ts`.**

### D.6 GameData XML (STRETCH — phase 9 only, not required for initial pass)

A **separate** document (different file in a real mod) holds gameplay metadata:
`<Assets><PartGameData Id="..."><CustomMass><Mass Kg="..."/></CustomMass><Tank>...</Tank>
<Battery><MaximumCapacity KWh="..."/></Battery><Connector Id><Flags>...</Flags></Connector>
<Decoupler ConnectorId="..." Force="..."/>...</PartGameData></Assets>`. Full rules in
`GameDataXmlSerializer.cs`. Connectors appear in **both** the Assets `<Part>` (geometry +
flags) and GameData (flags only). Initial flexo only needs the Assets `<Part>` export.

---

## Architecture overview (target module layout under `src/`)

```
src/
  main.tsx                  # React entry; wraps <App/> in <CladdProvider>
  App.tsx                   # top-level layout: 3D viewport (fullscreen) + floating panels
  index.css                 # @import 'tailwindcss'; @import '@cladd-ui/react/css';

  ksa/                      # pure domain logic, no React, no three.js
    types.ts                # EditingPart, SubPartPlacement, GameData types (mirror D.x)
    coords.ts               # XML(Euler-radians) <-> three.js transform conversion (D.5)
    formatG6.ts             # .NET "G6" number formatter (D.4)
    catalog.ts              # SubPart catalog types + lookup
    partXmlSerializer.ts    # EditingPart -> Part XML string (D.3, D.4)

  assets-pipeline/          # build-time + dev asset access
    buildCatalog.ts         # Node script: parse Core *Assets.xml -> coreCatalog.json
    coreCatalog.json        # GENERATED: catalog of SubParts + atlas/material refs

  three/                    # three.js scene + rendering
    Viewport.ts             # renderer, scene, camera, resize, render loop
    CameraControls.ts       # orbit controls + snap views
    Grid.ts                 # reference grid + origin axes
    MeshAtlasCache.ts       # GLB load + getObjectByName + geometry clone cache
    SubPartObject.ts        # a placed SubPart's three.js Group (mesh + transform)
    TransformGizmo.ts       # wraps three TransformControls (translate/rotate/scale)
    SelectionManager.ts     # raycast pick + selection outline

  state/                    # framework-agnostic editor state (nanostores, no React/three imports)
    editorStore.ts          # nanostores atoms/maps + action functions = the controller
    selectors.ts            # computed() derived stores (selected placement, etc.)

  ui/                       # cladd-based React panels
    SubPartBrowser.tsx      # filterable catalog list, click-to-add
    PlacementList.tsx       # list of placed instances, select/delete/duplicate
    TransformInspector.tsx  # numeric X/Y/Z pos/rot/scale fields (two-way w/ gizmo)
    Toolbar.tsx             # tool mode (translate/rotate/scale), snap toggles, export
    ExportDialog.tsx        # shows Part XML, copy-to-clipboard
```

**Single source of truth principle:** the editor store (`state/editorStore.ts`) owns the
`EditingPart`. The 3D scene and every UI panel both read/write through it. Gizmo drags and
numeric-field edits both call the same `updatePlacementTransform(...)` action, so the two views
stay live-synced (a core requirement). The three.js scene subscribes to store changes and
reconciles objects; React panels subscribe via hooks.

**React-agnostic core (a deliberate goal).** State is managed with **nanostores** — a tiny
(~1 KB), framework-agnostic atomic store. This keeps all editor logic (the data model,
mutations, undo/redo, selection) in plain TypeScript with **zero React or three.js imports**,
so the core could be reused under Preact/Svelte/Vue/vanilla or driven headlessly in tests. The
two consumer layers attach without coupling the core to either:
- **three.js layer** subscribes with vanilla `store.subscribe(cb)` / `store.listen(cb)` (no
  React involved).
- **React UI** subscribes with `useStore($store)` from `@nanostores/react`.

Concretely: `src/state/` imports only `nanostores` (and `src/ksa/` types). It must never import
`react`, `react-dom`, `three`, or `@cladd-ui/react`. Treat that as an architectural invariant
(a lint rule / review check). See the **nanostores** skill at `.agents/skills/nanostores/`.

---

## Phase 1 — Project scaffolding, cladd + Tailwind, app shell

**Goal:** A running Vite app with cladd wired up, the stock template removed, and an empty
full-screen layout (viewport area + placeholder side panel).

### Steps
1. Install deps:
   ```bash
   npm install @cladd-ui/react
   npm install -D tailwindcss @tailwindcss/vite
   ```
   Add the state libs (**nanostores**, framework-agnostic, + its React binding):
   ```bash
   npm install nanostores @nanostores/react
   ```
   This is a deliberate choice for a React-agnostic core (see "React-agnostic core" in the
   Architecture overview). `nanostores` is ESM-only — fine under Vite.
   `@types/node` is already present for the build script.
2. Edit `vite.config.ts` to add the Tailwind plugin (keep `react()`):
   ```ts
   import tailwindcss from '@tailwindcss/vite';
   export default defineConfig({ plugins: [react(), tailwindcss()] });
   ```
   (Dev static-serving of KSA assets is added in Phase 3 — do not add it yet.)
3. Replace `src/index.css` contents with exactly:
   ```css
   @import 'tailwindcss';
   @import '@cladd-ui/react/css';
   ```
   Order matters (cladd tokens must layer after Tailwind).
4. Update `src/main.tsx` to wrap the root in `<CladdProvider>` (see
   `.agents/skills/cladd/react/installation/vite.md`). Import `./index.css`.
5. Delete stock template cruft: `src/app.css`, `src/assets/react.svg`, `preact.svg`,
   `vite.svg`, `hero.png`. Replace `src/App.tsx` with a minimal shell:
   - A full-viewport (`fixed inset-0`) `<div>` that will host the three.js canvas.
   - A floating panel (cladd `Surface`) on the right as a placeholder.
   - Confirm dark-first cladd styling renders (per the quickstart, use `bg-cladd-bg` etc.).
6. Read `.agents/skills/cladd/react/foundations/quickstart.md` and `surfaces.md` to adopt the
   canonical cladd app-shell composition before building real panels.

### Acceptance criteria
- `npm run dev` serves a dark full-screen page with a visible cladd `Surface` panel and no
  console errors. `npm run build` passes `tsc -b`.
- No references to the old template assets remain.

---

## Phase 2 — Domain types & XML serializer (pure, unit-testable, no UI/3D)

**Goal:** The data model and the export path exist and are verified against known-good output,
**before** any rendering. This de-risks the most format-sensitive code first.

### Steps
1. `src/ksa/types.ts` — mirror `PartEditorState.cs`:
   ```ts
   export interface Vec3 { x: number; y: number; z: number; }
   // Internal rotation representation: keep Euler XYZ radians to match export 1:1.
   // (If gizmos need quaternions, convert at the three.js boundary via coords.ts.)
   export interface EulerXYZ { x: number; y: number; z: number; } // radians

   export interface SubPartPlacement {
     instanceId: string;        // unique within part, e.g. "trussbara_1"
     subPartTemplateId: string; // catalog id, e.g. "CoreStructuralA_Subpart_TrussBarA"
     position: Vec3;            // default {0,0,0}
     rotation: EulerXYZ;        // radians, default {0,0,0}
     scale: Vec3;               // default {1,1,1}
   }

   export interface EditingPart {
     partId: string;            // default "fixme_part_id"
     placements: SubPartPlacement[];
     // GameData omitted in initial pass (see D.6 / Phase 9)
   }
   ```
2. `src/ksa/formatG6.ts` — implement `formatG6(n: number): string` matching .NET `"G6"`:
   - 6 significant digits, trailing zeros trimmed, no trailing `.`, sign preserved, `0` for
     zero. Use exponential form only when .NET would (very large/small) — for editor-range
     values plain decimal is fine; document the limitation. Write unit tests:
     `1.5 -> "1.5"`, `0.1427 -> "0.1427"`, `-2.0944 -> "-2.0944"`, `1 -> "1"`,
     `0.30000001 -> "0.3"`, `1234567 -> "1.23457E+06"` (match .NET; verify the exact .NET output
     for the exponential case and encode whatever .NET actually produces).
3. `src/ksa/partXmlSerializer.ts` — implement `serializePart(part): string` reproducing
   `PartXmlSerializer.cs` semantics (D.3, D.4):
   - Build the XML string (a tiny hand-rolled builder is fine; or use the browser's
     `XMLSerializer` with a `Document` built via `document.implementation`). Prefer a small
     pure string builder so it runs in Node tests without a DOM.
   - Apply transform/axis omission rules and `formatG6` to every number.
   - Wrap in `<?xml version="1.0" encoding="utf-8"?>\n<Assets>...</Assets>`.
   - Indentation: 4 spaces (match the Core XML style).
   - Connectors: stub the function signature but leave connectors out of the initial part
     model (they arrive in Phase 9). Document the TODO.
4. **Golden test:** add `src/ksa/__tests__/partXmlSerializer.test.ts`. Construct an
   `EditingPart` equivalent to `CoreCouplingA_Prefab_DockingPort1WA`'s first few subparts and
   assert the serialized `<SubPart>`/`<Transform>` blocks match the strings in
   `CoreCouplingAAssets.xml` (lines ~191–265). This locks the format. Use vitest:
   `npm install -D vitest` and add `"test": "vitest"` to scripts.

### Acceptance criteria
- `npm run test` passes; golden test output matches Core XML for at least 3 placements
  including position-only, rotation-only, and combined cases, plus an identity placement that
  emits `<SubPart .../>` with no `<Transform>`.

---

## Phase 3 — 3D viewport foundation (three.js mounted in React)

**Goal:** A full-screen three.js canvas with an orbit camera, lighting, a reference grid, and
origin axes. No SubParts yet.

### Steps
1. **Dev asset serving.** KSA GLB/texture files live under `thirdparty/ksa/Content/Core/`,
   outside `src/`/`public/`. Make them fetchable in dev:
   - Add to `vite.config.ts`:
     ```ts
     server: { fs: { allow: ['..', '.'] } }
     ```
     and a small dev middleware (or use `vite-plugin-static-copy`) to expose
     `thirdparty/ksa/Content/Core` at the URL prefix `/ksa/`. Recommended: write a tiny Vite
     plugin in `vite.config.ts` that, in `configureServer`, serves `GET /ksa/*` from the
     `thirdparty/ksa/Content/Core` directory (use `sirv` or a manual `fs.createReadStream`
     with correct `Content-Type` for `.glb` = `model/gltf-binary`).
   - For `npm run build`, copy `Content/Core/Meshes` (and later `Textures`) into `dist/ksa/`
     via `vite-plugin-static-copy`. Initial pass can be dev-only; document the prod copy step.
   - Net result: a GLB is fetchable at `/ksa/Meshes/CoreStructuralA_MeshAtlas.glb`.
2. `src/three/Viewport.ts` — a framework-agnostic class:
   - Constructor takes a host `HTMLElement`. Creates `WebGLRenderer({ antialias:true })`,
     `PerspectiveCamera`, `Scene`, appends `renderer.domElement`.
   - `ResizeObserver` on the host → update camera aspect + renderer size.
   - Render loop via `setAnimationLoop`. `dispose()` tears everything down.
   - Background: dark neutral matching cladd (`scene.background = new THREE.Color(0x1a1a1d)`).
3. `src/three/CameraControls.ts` — use three's `OrbitControls`
   (`three/examples/jsm/controls/OrbitControls.js`). Target the origin. Reasonable default
   distance (~5m). (Snap-view buttons are a later nicety; basic orbit/pan/zoom now.)
4. Lighting: a `HemisphereLight` + one `DirectionalLight` so untextured `MeshStandardMaterial`
   reads well. (See threejs-lighting skill.)
5. `src/three/Grid.ts` — `THREE.GridHelper` on the XZ plane (or the plane matching KSA's
   ground per D.5 calibration) plus `THREE.AxesHelper` at origin. Keep it subtle.
6. React glue: a `Viewport.tsx` component (or fold into `App.tsx`) that, in a `useEffect`,
   instantiates `Viewport` against a `ref`'d div and disposes on unmount. The canvas fills the
   screen; cladd panels float above with higher z-index.

### Acceptance criteria
- Full-screen 3D scene with grid + axes; mouse orbit/pan/zoom works; window resize is correct;
  no leaked WebGL contexts on HMR (dispose runs). Verify in browser.

---

## Phase 4 — SubPart catalog generation + GLB mesh rendering

**Goal:** Build a catalog of all Core SubParts, and render any chosen SubPart's mesh in the
viewport by extracting the named node from its GLB atlas. **Calibrate coordinates here.**

### Steps
1. **Catalog build script** `src/assets-pipeline/buildCatalog.ts` (Node, run via
   `tsx`/`ts-node` or compiled): parse every `thirdparty/ksa/Content/Core/*.xml` that has a
   root `<Assets>`. Use a Node XML parser (`fast-xml-parser`, `npm install -D fast-xml-parser`).
   For each file, build maps within that file's scope:
   - `meshAtlases`: default atlas (the `<MeshAtlas>` with no `Id`) + any `Id`-keyed atlases
     → resolve `Path` (e.g. `Meshes/CoreStructuralA_MeshAtlas.glb`).
   - `materials`: `<PbrMaterial Id>` → `{ diffuse, normal, aoRoughMetal, emissive }` paths.
   - For each `<SubPart Id>` with a `<PartModel>`: produce a catalog entry:
     ```ts
     interface CatalogSubPart {
       id: string;                 // SubPart Id (== template id)
       meshNodeName: string;       // <PartModel><Mesh Id> value (node name in GLB)
       atlasPath: string;          // resolved /ksa/Meshes/....glb URL path
       materialId?: string;        // <Material Id>
       diffusePath?: string;       // resolved from material (for textured stretch)
       normalPath?: string;
       aoRoughMetalPath?: string;
       sourceFile: string;         // for debugging
     }
     ```
     **Atlas resolution rule:** if `<Mesh Id>` matches a named `<MeshAtlas Id>`, that's a
     whole-file mesh (rare — e.g. `LightPartMesh`); otherwise the mesh node lives in the file's
     **default** `<MeshAtlas>` (no Id). Encode both cases.
   - Skip (and log) SubParts with no `<PartModel>` (e.g. `KittenBackPackSubPart`).
   - Output `src/assets-pipeline/coreCatalog.json` = `{ subParts: CatalogSubPart[] }`. Add an
     npm script `"build:catalog": "tsx src/assets-pipeline/buildCatalog.ts"`. Run it and commit
     the JSON (it's deterministic and avoids parsing 20+ XML files in the browser).
   - **Validation:** the script should assert every `meshNodeName` exists as a node `name` in
     its atlas GLB (parse the GLB JSON chunk) and report a count of valid vs. broken entries.
2. `src/three/MeshAtlasCache.ts`:
   - `async loadAtlas(atlasPath): Promise<GLTF>` using `GLTFLoader`
     (`three/examples/jsm/loaders/GLTFLoader.js`), memoized per path (Map<path, Promise>).
   - `async getGeometry(atlasPath, nodeName): Promise<BufferGeometry>` →
     `gltf.scene.getObjectByName(nodeName)`, find its `Mesh`, return `mesh.geometry` (clone if
     it'll be transformed/instanced independently). Bake the node's local transform into the
     geometry if non-trivial (most are identity). Cache by `atlasPath#nodeName`.
   - See the **threejs-loaders** skill for GLTF async/caching patterns.
3. `src/three/SubPartObject.ts`: given a `CatalogSubPart` + a `SubPartPlacement`, build a
   `THREE.Group`:
   - Mesh from `MeshAtlasCache.getGeometry(...)` with `MeshStandardMaterial`
     (`color: 0xbfc4cc, metalness: 0.6, roughness: 0.5`) for the untextured initial pass.
   - Apply placement transform via `coords.ts` (position, Euler XYZ rotation, scale).
   - Store `instanceId` on `group.userData` for raycast lookup.
4. **`src/ksa/coords.ts` + calibration:**
   - Implement `applyPlacementToObject3D(obj, placement)` and the inverse
     `readPlacementFromObject3D(obj): {position,rotation,scale}` used after gizmo drags.
   - Default mapping: direct — `obj.position.set(x,y,z)`,
     `obj.rotation.set(rx,ry,rz,'XYZ')`, `obj.scale.set(sx,sy,sz)`.
   - **Calibrate:** temporarily hardcode-load `CoreCouplingA_Prefab_DockingPort1WA` (build the
     placement list from `CoreCouplingAAssets.xml` ~line 191) and render. Confirm it forms a
     coherent docking port (radial petals/latches symmetric around one axis). If scrambled,
     adjust Euler order / sign and document the verified mapping in a comment. Remove the
     temporary load once verified (or keep behind a `?debug=docking` query flag).

### Acceptance criteria
- `coreCatalog.json` exists with a few hundred valid SubPart entries and the validation log
  shows ~all `meshNodeName`s resolve in their GLBs.
- Loading a single SubPart (e.g. `CoreStructuralA_Subpart_TrussBarA`) shows its untextured mesh
  at the origin, correctly scaled (meters).
- The docking-port calibration assembles into a recognizable, symmetric shape; `coords.ts`
  documents the verified transform mapping.

---

## Phase 5 — Editor store + SubPart browser + add-to-workspace

**Goal:** A user can browse/filter the catalog and click a SubPart to add it to the workspace;
it appears in the 3D scene at the origin and in a placements list.

### Steps
1. `src/state/editorStore.ts` — **nanostores** atoms + action functions mirroring
   `PartEditorController`. No React/three imports (invariant from the Architecture overview).
   - Stores (use `atom`; consider `map` only if you want per-key subscriptions):
     - `$part = atom<EditingPart>({ partId: 'fixme_part_id', placements: [] })`
     - `$selectedIndex = atom<number>(-1)`
     - `$toolMode = atom<'translate'|'rotate'|'scale'>('translate')`
     - `$snap = atom<{ translate?: number; rotateDeg?: number }>({})`
     - Undo/redo are kept as module-private arrays (not atoms): `undoStack`, `redoStack`, plus
       `$canUndo`/`$canRedo` atoms updated alongside them for the UI to read.
   - Treat `$part` as **immutable**: actions build a new `EditingPart` (e.g. via
     `structuredClone` + edit, or spread) and call `$part.set(next)`. Do not mutate the object
     held by the atom in place, or `useStore`/`listen` won't fire. (This matters for the
     two-way binding in Phase 7.)
   - Action functions (plain exported functions, the nanostores idiom — keep logic in the
     store, not components):
     `addSubPart(templateId)`, `removeSelected()`, `duplicateSelected()`,
     `selectPlacement(index)`, `updatePlacementTransform(index, {position,rotation,scale})`,
     `setPartId(id)`, `undo()`, `redo()`, `pushUndo()`.
   - Mirror `AddSubPart` instance-id generation: `baseName = lastDotSegment(templateId).toLowerCase()`,
     count existing of same template, `instanceId = ${baseName}_${count+1}`.
   - `pushUndo()`: push a deep clone (`structuredClone($part.get())`) onto `undoStack`, clear
     `redoStack`, cap depth at 50 (match C#). Call it at the start of each mutating action
     (and at gizmo drag-start in Phase 6).
2. `src/state/selectors.ts` — derived stores via `computed`, e.g.
   `$selectedPlacement = computed([$part, $selectedIndex], (part, i) => part.placements[i] ?? null)`.
   React panels and the gizmo read this instead of recomputing.
3. `src/three/SceneSync.ts` (or logic inside Viewport): subscribe to `$part` with the **vanilla**
   nanostores API — `$part.subscribe(part => reconcile(part))` (no React). On change, reconcile
   `SubPartObject` groups in the scene (add new, remove gone, update transforms). Keep a
   `Map<instanceId, Group>`. This is the bridge that keeps 3D in sync with the store — **the only
   place** that mutates scene objects from state. Hold the unsubscribe fn and call it on dispose.
3. `src/ui/SubPartBrowser.tsx` (cladd): a floating `Surface` panel with a cladd `SearchField`
   to filter `coreCatalog.json` by id substring, and a cladd `List` of results. Clicking a row
   calls `store.addSubPart(id)`. (Thumbnails are a later nicety — text rows are fine now.)
   Use cladd `List`, `SearchField`, `SectionTitle` (read their docs in
   `.agents/skills/cladd/react/components/`).
4. `src/ui/PlacementList.tsx` (cladd): list current `part.placements` (instanceId +
   templateId). Clicking selects (`selectPlacement`); show Delete + Duplicate buttons
   (cladd `Button`) wired to store actions. Highlight the selected row.

### Acceptance criteria
- Filtering the browser narrows the list live. Clicking adds the SubPart; it renders at origin
  and shows in the placements list. Delete/duplicate work and the 3D scene reflects changes
  immediately. Selecting a row marks it selected in state. Verify in browser.

---

## Phase 6 — Selection + transform gizmos (translate / rotate / scale)

**Goal:** Click a SubPart in 3D to select it; manipulate it with an interactive gizmo whose
mode (translate/rotate/scale) is chosen from the toolbar. Drags write back to the store.

### Steps
1. `src/three/SelectionManager.ts`: raycast on pointerdown against the SubPart group meshes
   (`three` `Raycaster`). On hit, resolve `instanceId` from `userData`, call
   `store.selectPlacement(index)`. Add a selection highlight (emissive tint or an outline —
   simplest: set selected mesh material emissive; outline pass is a stretch). See
   **threejs-interaction** skill for raycasting/selection.
2. `src/three/TransformGizmo.ts`: wrap three's `TransformControls`
   (`three/examples/jsm/controls/TransformControls.js`). Attach it to the selected group.
   - `setMode('translate'|'rotate'|'scale')` driven by `store.toolMode`.
   - On `dragging-changed`, disable `OrbitControls` while dragging (standard pattern).
   - On `objectChange`, read the object's transform via `coords.ts.readPlacementFromObject3D`
     and call `store.updatePlacementTransform(...)`. **Push one undo snapshot on drag start**
     (`mouseDown`), not per-frame.
   - Snap: if `store.snap.translate` set, `control.setTranslationSnap(v)`; for rotate
     `setRotationSnap(THREE.MathUtils.degToRad(rotateDeg))`.
3. `src/ui/Toolbar.tsx` (cladd): a `Toolbar` with a `Segmented` control for
   translate/rotate/scale (bind to `store.toolMode`), snap toggles + `NumberField`s for snap
   increments, and Undo/Redo buttons. (Read cladd `toolbar.md`, `segmented.md`.)
4. Keyboard niceties (optional, mirror space-tape): `W/E/R` for translate/rotate/scale modes;
   `Delete` removes selected. Keep minimal.

### Acceptance criteria
- Clicking a SubPart selects it (visual highlight + selected in placements list). The gizmo
  appears; switching toolbar mode switches the gizmo. Dragging moves/rotates/scales the SubPart
  and the change persists in the store (verify by checking the inspector in Phase 7 / export in
  Phase 8). Orbit is disabled mid-drag. One undo per drag reverts it. Verify in browser.

---

## Phase 7 — Transform inspector (numeric inputs, two-way bound with gizmo)

**Goal:** A numeric panel showing the selected placement's position/rotation/scale. Editing a
field updates the 3D object live; dragging the gizmo updates the fields live. **Both edit the
same store data** — this is the explicit requirement that one source of truth backs both views.

### Steps
1. `src/ui/TransformInspector.tsx` (cladd): when a placement is selected, render:
   - `instanceId` (editable text — cladd `Input`) and read-only `templateId`.
   - Position X/Y/Z, Rotation X/Y/Z, Scale X/Y/Z using cladd `NumberField` (or
     `NumberScrubber` for drag-to-edit — read `number-field.md` / `number-scrubber.md`).
   - **Rotation display unit:** store holds radians (export needs radians). Show **degrees** in
     the UI (convert on read/write) for usability; document this clearly. Keep internal radians.
   - Each field's `onChange` → `store.updatePlacementTransform(index, ...)`. Because the scene
     subscribes to the store (Phase 5 SceneSync) and the gizmo is attached to the same object,
     the 3D view updates immediately, and vice-versa.
2. **Live sync verification:** ensure the gizmo's `objectChange` write and the inspector's field
   write both funnel through `store.updatePlacementTransform`, and the inspector reads from
   `store.part.placements[selectedIndex]` (re-render on store change). The gizmo, when it is the
   active editor, should reflect external (field) changes too — have `TransformGizmo` re-sync
   its attached object from the store on store change when not actively dragging.

### Acceptance criteria
- With a SubPart selected: typing in a position field moves it in 3D in real time; dragging the
  gizmo updates the numeric fields in real time. No feedback loops/jitter. Rotation shown in
  degrees, exported in radians. Verify in browser.

---

## Phase 8 — Export to KSA Part XML

**Goal:** Produce the Part XML for the current `EditingPart` and present it (copy-to-clipboard
and/or a popup), satisfying the initial-pass export requirement.

### Steps
1. Add a Part-id field (cladd `Input`) somewhere in the toolbar/inspector bound to
   `store.part.partId` (default `fixme_part_id`).
2. `src/ui/ExportDialog.tsx` (cladd `Dialog` or `Popup`): an "Export XML" toolbar button calls
   `serializePart(store.part)` (Phase 2) and shows the result in a read-only
   `Textarea`/code block, with a **Copy** button (`navigator.clipboard.writeText`). Use cladd
   `useToast` to confirm "Copied".
3. Sanity: the exported XML must be valid against the Domain Reference (D.3/D.4) and re-importable
   by KSA conceptually (each `<SubPart InstanceOf>` references a real catalog template; each
   instance id unique). Add a lightweight pre-export check that warns on duplicate instance ids
   or empty `partId`.

### Acceptance criteria
- Placing a few SubParts, transforming them, and clicking Export shows correct Part XML
  (transform omission + `G6` formatting + Euler-radian rotations), and Copy puts it on the
  clipboard. Spot-check that a manually-recreated Core part round-trips to matching XML.

---

## Phase 9 — Stretch goals (only after Phases 1–8 are solid)

These are explicitly **out of scope for the initial pass** but documented so future sessions
can pick them up. Order by likely value:

1. **Textured rendering.** Load each SubPart material's `.ktx2` atlas via three.js `KTX2Loader`
   + Basis transcoder (`three/examples/jsm/loaders/KTX2Loader.js`; copy the basis transcoder
   files to `public/` and `setTranscoderPath`). Apply Diffuse/Normal/AoRoughMetal to a
   `MeshStandardMaterial` (`map`, `normalMap`, and split AO/rough/metal as needed). The mesh UVs
   already index the atlas. Add an environment map for PBR reflections (threejs-textures skill).
2. **Connectors.** Add `ConnectorState` to the model, color-coded gizmo cubes in 3D
   (Internal/ToSurface/FromSurface — see space-tape `ConnectorGizmo.cs` and README), serialize
   into the Part XML `<Connector>` blocks (D.3) and GameData flags (D.6).
3. **GameData panel + GameData XML export** (Tank, Mass, Batteries/Generators/Consumers,
   Coupling). Port `GameDataModels.cs` + `GameDataXmlSerializer.cs` (D.6).
4. **Import existing Part** into the editor (port `PartImporter.cs`): pick a Core Part, deep-read
   its SubPart instances + transforms into the store for editing.

> **API convention for the steps below:** with nanostores there is no `store` object — actions
> are exported functions and state lives in exported atoms. Read the shorthand `store.addSubPart(id)`
> as "call the exported action `addSubPart(id)` from `editorStore.ts`", and `store.toolMode` /
> `store.part` as "read the `$toolMode` / `$part` atom" (via `useStore($toolMode)` in React, or
> `$toolMode.get()` / `.subscribe()` in the three.js layer).
5. **Project save/load.** Serialize the editor store (`EditingPart`) to a JSON "flexo project"
   file (download/upload, or `localStorage`) per AGENTS.md ("workspace can be serialized and
   saved for restoration as a Part project").
6. **Catalog thumbnails** (render-to-texture previews per SubPart, like space-tape's thumbnail
   generation) and grid/list browser modes.
7. **Camera snap views** (Front/Back/Left/Right/Top/Bottom) and configurable reference grids,
   mirroring `CameraSnapController.cs`.
8. **Write directly to a mod directory** (instead of clipboard) — needs the File System Access
   API or a small local server; mirrors `PartModWriter.cs`.

---

## Cross-cutting conventions & guardrails

- **Single source of truth:** the nanostores `$part` atom owns `EditingPart`. The three.js `SceneSync` is
  the only writer to scene object transforms from state; gizmo drags and numeric fields both
  write only through `store.updatePlacementTransform`. Never let the 3D layer and UI layer hold
  divergent copies of a placement's transform.
- **All XML↔3D transform conversion goes through `src/ksa/coords.ts`.** No ad-hoc Euler/axis
  math elsewhere. This isolates the D.5 calibration.
- **Rotation:** internal + export are radians; only the inspector UI shows degrees.
- **Numbers in XML:** always via `formatG6`. Never `toString()`/`toFixed()` directly into XML.
- **Asset paths:** the catalog stores `/ksa/...` URL paths; the dev server maps `/ksa/` →
  `thirdparty/ksa/Content/Core/`. Do not hardcode absolute filesystem paths in `src/`.
- **Read, don't load-all:** `thirdparty/ksa` decompiled sources are large. Open specific files
  when a format question arises; don't bulk-read.
- **Verify in a browser** at the end of Phases 3–8 (per the repo's UI-testing guidance) — type
  checks alone don't prove the 3D/interaction behavior.
- **Keep `analysis/` for deep-dives:** if a phase requires nontrivial investigation (e.g. the
  KTX2 transcoder setup, or coordinate calibration findings), write a short note to
  `analysis/` per AGENTS.md so future sessions inherit it.

---

## Suggested execution order / milestones

1. **M1 (Phases 1–2):** app shell + verified XML serializer (no 3D). Lowest-risk, locks format.
2. **M2 (Phases 3–4):** 3D viewport + render one SubPart + coordinate calibration. Highest
   technical risk — do early.
3. **M3 (Phases 5–6):** browse/add + select + gizmos. The interactive core.
4. **M4 (Phases 7–8):** inspector two-way binding + export. Completes the initial-pass spec.
5. **M5 (Phase 9):** stretch goals as prioritized.

Each phase has standalone acceptance criteria; complete and verify one before starting the next.
