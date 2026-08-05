# flexo v2 — Surface mode & Asset Manager (end-to-end design)

Area design under the Foundation spec (design/foundation.md — LAW). Feature census of
record: analysis/custom-assets.md (primary), catalog-placement-layers.md,
export-integration.md, shell-layout.md. Every v1 feature in this area is mapped in the
parity table (§9). Field names verified against `src/ksa/types.ts`,
`src/three/primitives.ts`, `src/state/customAssetStore.ts`.

**Foundation deviations: none.** Every ruling this design leans on (S27, S29, S30, §2.4,
§2.5, §8.5, §10.3, §10.4, §10.7, §14.3) is applied verbatim. Decisions the task delegates
to this design are logged in §0.

---

## 0. Decisions log (delegated to this area — resolved here)

| # | Question | Decision | Rationale |
|---|---|---|---|
| D1 | Creation entry points: Add menu vs Asset Manager | **Both.** Add menu keeps its four asset items (foundation §3 Add tree, verbatim); the Asset Manager gets per-category "＋" creation buttons AND creation buttons inline in every empty state | Kills the v1 "empty state gives navigation directions to a different menu" self-admission (CustomAssetsModal.tsx:186); duplication costs one MenuSpec commandId reuse |
| D2 | Glow paint: dialog vs evolve to viewport tool | **Stays an overlay dialog** (S29 already rules this) with three bounded upgrades: per-stroke undo (surface-scoped ⌘Z), composited-diffuse underlay for orientation, live 3D preview on stroke end through the same `glowComposite` path | Self-contained canvas workflow; 3D paint mode is a scope explosion for a 512² UV bitmap |
| D3 | Byte deletion: warning vs trash can | **Keep immediate byte deletion + always-confirm** (§14.3 tier 3). No trash can. The wording is standardized and now honest for **all** byte-backed kinds (v1 stated it for imports only — pain #10) | "Undo restores descriptors, not bytes" is a named binding constraint of this task; a trash can changes the storage-growth profile and the confirm contract for marginal benefit |
| D4 | `decimateViewMeshes` + kitten-texture-mode home | **Settings → Import & Export is the single editable home** (foundation §10.7 already places them there); Export dialog shows them as **read-only chips with deep-links** (§10.6); Import Review keeps its decimate toggle writing the same store, captioned "affects export" | One home per preference (Law 1); export-time visibility fixes pains custom-assets #8/#9 and export #3 |
| D5 | Per-project IndexedDB namespacing | **Adopt.** All asset blob keys gain a project-id prefix (§7.3), aligned with LOCKED #3 stable project ids. Boot purges unprefixed keys (no migration — constitution). Project delete/duplicate handle blobs | Fixes orphan accumulation ("orphans possible after deleting a project" — analysis §3) and is required anyway for the .tar.gz archive and project-duplicate features |
| D6 | Kitten meshes in the library UIs | **Listed** in the Surface-mode mesh picker (foundation §8.5 says so) **and** in the Asset Manager Meshes category with a `kitten` chip; still **excluded** from Add ▸ Custom Mesh Instances (foundation §3, verbatim) | v1 hid them from the modal because the modal was the only manager and they're "managed as placed SubParts"; v2's manager is the one place to see *everything*, and their 0-instance invisibility bug bites them too |
| D7 | Surface mode on built-in SubParts | Left sidebar shows a **read-only "Built-in surface" card** (catalog texture set + material id, with thumbnails) below the selection inspector; the right-sidebar editor stays scoped to the picker | Gives Surface mode a useful answer for every selection instead of a dead end; data already exists in `CatalogSubPart` |
| D8 | Manager → Import Review handoff | **Jump, not stack**: "Replace…"/"＋ Import Model…" closes the Asset Manager and opens Import Review (both L). Completion posts the rich notification with an "Open Asset Manager" action | No modal-in-modal (§10.1); the notification restores the return path |
| D9 | MaterialDialog hosting | From the Surface sidebar → normal **overlay dialog** (nothing else is open); inside the Asset Manager → **pushed view** in the manager's DialogViewStack | Same component, two mounts, zero stacked modals |
| D10 | Unplaced-mesh export silence (pain #14) | 0-instance templates get a **"not exported" warning chip** in picker + manager; a new `unplacedCustomMeshes` selector feeds an `info`-severity export pre-flight row ("N custom meshes have no placements and will not ship") | Surfaces the silent drop in both the library and the export flow |
| D11 | The leftover-0.01-scale trap | Per-import options (scale, prefix, double-sided, bake-transforms, merge) are **reset on every dialog open**; scale shows an amber `≠1` badge whenever not 1. Sticky options render in a visually separate "Saved preferences" group with a pin glyph | Enforces the "persist a preference, never a correction" split structurally, not by convention |
| D12 | Face-highlight scope | Face selection is **template-scoped**: the selected face highlights on **all placements** of the picked mesh | Mirrors Data mode's template-placement highlight; face config is per-template data |

---

## 1. Surface mode — overview

Surface mode answers: *what does this custom mesh look like?* Right sidebar = mesh picker
+ the full surface editor for the picked mesh (LOCKED #1, foundation S19/§8.5). Left
sidebar = the face-focus card (+ selection inspector). Viewport = selected-face
highlighting on every placement of the picked mesh.

### 1.1 Mode sub-state (in `modeStore` per-mode sub-state, ephemeral, clamped vs `$part`)

```ts
// modeStore surface sub-state (re-exported; zero react/three imports)
$surfaceMeshId: atom<string | null>   // picked CustomMesh.id; null = picker empty state
$surfaceFace:   atom<string | null>   // face key of the picked mesh ('right'|'left'|'top'|
                                      // 'bottom'|'front'|'back'|'side'|'all'); null = none
```

- Clamping: a `$part` subscription nulls `$surfaceMeshId` when the mesh no longer exists
  (undo past creation, remove-import); `$surfaceFace` re-validates against
  `PRIMITIVE_FACE_KEYS[kind]` and falls back to the first key (non-primitives → `null`,
  except sphere/plane whose only key is `all`).
- Entry choreography (`modeStore.setMode('surface')`, per foundation §2.4): a selected
  custom-mesh placement auto-picks its template; else the last-picked mesh is restored;
  else the picker empty state. Exit clears the viewport face highlight and closes
  GlowPaintDialog via its normal cancel semantics; `$surfaceMeshId` survives for return.
- `$managingMeshId` and the floating ManageTexturesPanel are **deleted** (death list §6.3).
- View-affordance flag consumed by EditorScene: `faceHighlight: {meshId, faceKey} | null`
  derived from the two atoms; mode switch away sets it null.

### 1.2 Entry points (all roads into Surface mode)

| From | Gesture | Result |
|---|---|---|
| Menubar mode switcher / `5` / palette "Go to Surface mode" | click/key | mode switch, §2.4 choreography |
| Build left-sidebar SubPart inspector → **"Edit Surface →"** (custom meshes only) | click | jump: mode=surface, mesh picked, face = first key |
| Build Outliner entity row ⋮ → **"Edit Surface →"** (shown only on custom-mesh rows) | click | same jump |
| Asset Manager mesh card → **"Edit surface →"** | click | dialog closes, jump (foundation §2.5: a jump, not a stack) |
| Phone: ModeTabBar ◧ tab | tap | mode switch; re-tap opens the Panel sheet |
| Notification "Import finished" rich entry → "Edit surfaces →" action | click | jump, first imported mesh picked |

### 1.3 Right sidebar — mesh picker + surface editor (the mode primary)

Slim mode header: `◧ Surface` + header action **"Asset Manager… ⇧⌘A"**. Body =
`SidebarSection`s (dense, sticky headers, `xs` controls).

```
┌─ ◧ SURFACE ──────────────── [Asset Mgr… ⇧⌘A] ┐
│ MESHES                                    🔍 │  ← pinned; fuzzy search
│ ▣ Hull Box        prim      ×2    [＋]       │  ← picked row (accent)
│ ▢ Dish            import    ×1    [＋]       │
│ ▢ Radiator Fin    prim      ×0 ⚠  [＋]       │  ← ⚠ "No placements — won't export"
│ ▢ hunter_visor    kitten    ×1    [＋]       │
│   [＋ New Mesh ▾]                            │  ← menu: Primitive… / Import Model… /
│──────────────────────────────────────────────│          Make Kitten Mesh ▸
│ ▾ IDENTITY — Hull Box                        │
│   Name        [Hull Box            ]         │
│   SubPart id  flexo_HullBox_a1b2  (mono, ro) │
│   Kind        Primitive · Box                │
│   Width (m) [1.000] Height [1.000]           │
│   Depth (m) [1.000]                          │  ← per-kind params (§1.3.1)
│ ▾ MATERIAL                                   │
│   [Steel ▾]                    [✎ Edit][＋ New]│
│   ⚠ Faces mix 2 textures — KSA export        │
│     applies the first face's texture…        │
│ ▾ FACES                                      │
│   [+X*] [−X] [+Y] [−Y] [+Z] [−Z]             │  ← chips; * = selected; ● = textured dot
│   (edits in the left Face card)              │
│ ▾ GLOW (EMISSIVE)                            │
│   Mode  [Whole mesh ▾]  (Off/Whole/Painted)  │
│   Color [■ #78DCFF]   Coverage  [====○ 1.00] │
│   Emissive [==○   0.30]  ⚠ >0.6 washes out…  │
│   Ramp  [gradient bar ◆──◆──◆]  [Presets ▾]  │
│         [＋ stop] [Import from image…]        │
│   [Edit paint…]        (Painted mode only)   │
│   [Add Matching Light]                       │
│ ▾ VISOR SURFACE          (glass-capable only)│
│   Surface [Glass + Glow ▾]                   │
│   Tint    [■ #AAD4FF  α 0.45]                │
│   Simulate in-game glass  [⊙ on]  (global)   │
│ ▾ IMPORTED               (imported only)     │
│   From  rcs_pod.glb · node "Pod_L" ·         │
│         mat "PodMetal" · 4.2k tri · 2.1k vtx │
│   Render as glass  [⊙ off]                   │
│     (editor stays opaque by design — KSA     │
│      glass is one fixed shader)              │
│   Batch  [Replace…] [Remove import…]         │
└──────────────────────────────────────────────┘
```

#### Section-by-section spec

**Meshes (picker, pinned top)** — lists every `CustomMesh` (primitives, imported, kitten
— D6). Row: kind chip (`prim`/`import`/`kitten`), placed-instance count (0-instance rows
visible with the ⚠ chip — fixes v1 invisibility, pain #15/#14), `＋` = add instance
(`addSubPart(subPartId)` on the active layer at origin, select + reveal; Build-mode
entities stay editable there — the instance is added without leaving Surface mode; status
flash "Instance added to layer <name>"). Row click = pick (`$surfaceMeshId`); picking
scrolls the editor to top. Fuzzy search filters by name + subPartId. Empty state (no
custom meshes at all): icon + "No custom meshes yet — build one:" +
`[New Primitive Mesh…] [Import Model…] [Make Kitten Mesh ▾]` (D1).

**Identity** — closes the census UI gaps (analysis §1.9, pain #5):
- `Name` TextField — commits on blur/Enter via `updateCustomMesh(id, {name})`; one undo
  step "rename mesh". Display-name only; `subPartId` never changes (constraint).
- `SubPart id` — read-only mono with copy-on-click (subPartId == GLB node name ==
  Assets.xml id; shown so users can correlate with export XML).
- Kind caption: `Primitive · Box` / `Imported glTF` / `Kitten · hunter visor`.
- **Primitive params** (primitives only), all `PreciseNumberInput` (useNumberDraft +
  `inputMode="url"`): box `Width/Height/Depth (m)`; cylinder `Radius/Height (m)`,
  `Radial segments`; sphere `Radius (m)`, `Segments`; plane `Width/Height (m)`. Commit →
  `updateCustomMesh(id, {primitive})`, one undo step "resize mesh", atlas rebuild via the
  existing mesh-signature diff (placements survive — that's the whole point vs delete+recreate).

**Material** — assign Select listing `customMaterials` + "(none)" →
`setMeshMaterial(id, matId|null)` (discrete undo). `✎ Edit` / `＋ New` open MaterialDialog
as an overlay dialog (D9) — on create, auto-assigns (v1 behavior kept). The
first-face-texture-wins warning renders whenever >1 distinct face texture (verbatim rule).
MaterialDialog contents (guts unchanged, rehosted): Name; Base color mode Color/Image
(color picker | baseColor-channel texture select); Metalness slider 0–1 or map; Roughness
slider 0–1 or map; 9 named presets row; Advanced maps disclosure (Normal map + strength
slider 0–2, Packed ORM ["overrides AO/rough/metal maps"], AO map, Roughness map, Metalness
map — selects filtered by declared channel); live PBR preview sphere. Texture selects gain
**thumbnail swatches** (from `textureSrcUrls`) — fixes pain #4.

**Faces** (primitives with >1 face key; hidden for sphere/plane whose only key is `all`,
and for imported/kitten meshes which have no face config) — chip row from
`PRIMITIVE_FACE_KEYS[kind]` labeled per `FACE_LABELS` tooltips. Chip click = select face
(`$surfaceFace`); clicking the active chip deselects. A small dot on chips that carry a
`FaceTextureConfig`. The face's *editor* is the left Face card (§1.4) — LOCKED split.

**Glow (emissive)** — full v1 inventory:
- `Mode` select: Off (deletes `emissive`, discrete undo) / Whole mesh / Painted spots
  (`setMeshGlow`).
- `Color` swatch → kit color popover (ignored when a ramp is set — caption says so).
- `Coverage` slider 0–1 (blends glow color into diffuse — visible when lit).
- `Emissive` slider 0–1 (white mask; **wash-out warning above 0.6 verbatim**: "KSA adds
  this as pure white — above 0.6 it swamps the color").
- `Ramp` — gradient bar with draggable stops (≥2 enforced; drag reorders `at`; click bar
  adds a stop at that key; per-stop popover: color + `at` numeric 0–1 + delete), Presets
  menu (v1 preset list retained verbatim), "Import from image…" (file pick, reads middle
  row — v1 behavior). Painted mode paints *through* the ramp when set.
- `[Edit paint…]` (Painted mode only) → GlowPaintDialog (§1.6).
- `[Add Matching Light]` → `addLight(null, {type:'point', color: glowColor})`, select, one
  undo step; status flash `Light added — edit in Build mode [Go →]` (the only colored-light
  path — KSA emissive is white-only; both facts stated in the section's help tooltip).
- Slider undo: streaming (push once at interaction start). Mode/color/ramp edits: discrete.
- **Live preview == export**: every change re-runs the shared `glowComposite` /
  `glowRamp` math (single code path constraint — preview diffuse+mask are exactly the
  exported pair).

**Visor Surface** (only when `kitten.transparent` — glass-capable): `Surface` select
Glass / Glow (opaque) / Glass + Glow (layered) (`setMeshSurface`); `Tint` ColorAlphaField
(`setMeshGlass` — tint + editor-preview opacity, default 0.45; caption: "in-game opacity
is engine-fixed ≈0.75"); `Simulate in-game glass` Switch — writes the **global**
`$simulateGlass` (labeled "(global)"; it's a preview preference, not document data —
mirrored in Settings → Scene). Glow controls reuse the Glow section (glassGlow shows both).

**Imported** (imported meshes only): provenance line — `sourceFile` · node `sourceNode` ·
mat `sourceMaterial` · `triangles` tri · `vertices` vtx (all from `ImportedMeshSource`);
`Render as glass` Switch (`setMeshTransparent`) with the deliberate-opaque-preview one-liner
kept verbatim; batch actions `[Replace…]` (jump to Import Review in replace mode for this
`importId` — D8) and `[Remove import…]` (opens the byte-deletion confirm, §5.2 wording).

### 1.4 Left sidebar — face-focus card + selection inspector (the focus editor)

Stack, top→bottom (foundation §7 priority):

```
┌ FACE: Right (+X) — Hull Box            ⋮ ┐
│ Texture   [plate_diffuse ▾]  (swatches)   │   ← baseColor-channel textures + "(none)"
│ Wrap      [Repeat ▾]  (Repeat/Mirror/Clamp)│
│ UV scale   X [2.00]  Y [2.00]             │
│ UV offset  X [0.00]  Y [0.00]             │
│ [Copy to all faces]  [Clear face]         │
├───────────────────────────────────────────┤
│ SELECTION  (standard Build inspector card │
│  when a placement is selected — transform │
│  groups + per-kind sections, §7.1 rules)  │
├───────────────────────────────────────────┤
│ BUILT-IN SURFACE     (built-in SubParts)  │   ← D7; read-only
│  Template  Core/.../TankB                 │
│  Material  M_TankB        (mono)          │
│  [thumb] Diffuse    Tank_B_D.ktx2         │
│  [thumb] Normal     Tank_B_N.ktx2         │
│  [thumb] AoRoughMetal  …                  │
│  [thumb] Emissive   —                     │
│  ⓘ Built-in surfaces are game assets and  │
│    can't be edited. Import a model or     │
│    create a primitive to author surfaces. │
└───────────────────────────────────────────┘
```

- **Face card** renders when `$surfaceFace` ≠ null on a primitive. Texture select filtered
  to `channel === 'baseColor'` (+ "(none)"), thumbnail swatches. UV fields =
  `PreciseNumberInput` (useNumberDraft, `inputMode="url"`). **Preview vs commit**: draft
  values stream to the scene live as you type (view-only, via a `$faceDraft` scene report
  atom); the document commit (`updateMeshFaceConfig`, one undo step) happens on field
  commit (Enter/blur) — conforms to the streaming/discrete invariant while keeping v1's
  live-preview-as-you-type feel. `Copy to all faces` writes the config to every face key
  (one undo step); `Clear face` removes the entry (discrete).
- **Selection inspector** — the standard Build focus card mounts beneath whenever a
  placement is selected (selection survives mode switches; users tweak transform while
  texturing). Its ⋮ carries "Open in Build mode →".
- **Built-in surface card** (D7) when the selection is a built-in SubPart: read-only
  catalog data (`CatalogSubPart` diffuse/normal/aoRoughMetal/emissive URLs as thumbs,
  materialId, source XML file). No editor — the ⓘ line explains why and names the two
  authoring paths.
- **Empty state** (no pick, no selection): mode cheat-card — "Surface mode edits custom
  meshes' materials, glow and UVs." + hotkeys (`5` mode, `⇧⌘A` assets, `F` frame) +
  `[Pick a mesh →]` (focuses picker search) / `[New Primitive Mesh…]` / `[Import Model…]`.

### 1.5 Viewport behavior in Surface mode

- **Face highlight**: the selected face key tints on **every placement** of the picked
  mesh (D12) — accent overlay via a per-group highlight material swap (same mechanism
  family as selection highlight; on-demand render invalidate, no continuous loop). Sphere/
  plane/`all` = whole-mesh tint. Imported/kitten meshes: whole-mesh tint when picked (they
  have no face keys).
- **Click-to-pick**: clicking a **custom-mesh placement** selects the placement (normal
  selection rules: locked/hidden guards verbatim) AND picks its template; for primitives
  the raycast hit's geometry group resolves the face key under the cursor →
  `$surfaceFace`. Clicking a built-in entity = normal selection (left shows D7 card).
  Empty-click clears selection (convention) but keeps `$surfaceMeshId`/`$surfaceFace`
  (mode sub-state, not selection).
- Gizmo/marquee/⌥-drag-duplicate all work as in Build (viewport-scope keys are mode-wide,
  S8) — Surface mode never locks out arranging.
- Status bar segments: mode chip `◧ Surface`; tool segment unused; **surface context
  chip** in the selection readout area: `mesh: Hull Box · face +X` (click = scroll picker
  to the mesh). Modifier hint while hovering a custom placement: `⌥ Duplicate drag ·
  click Pick face`.

### 1.6 GlowPaintDialog (S center; canvas workflow — S29)

Opened by `[Edit paint…]`; `dialogStore.$openDialog = {id:'glow-paint', params:{meshId}}`.

```
┌ Glow paint — Hull Box                    ✕ ┐
│ ┌───────────── 512×512 canvas ───────────┐ │
│ │  (underlay: composited diffuse @50% —  │ │
│ │   D2; checkerboard beneath)            │ │
│ └────────────────────────────────────────┘ │
│ Brush [====○   48px]   Intensity [==○ 0.8] │
│ [ ] Eraser        Color ■ (ramp overrides) │
│ [Clear]                  [Cancel]  [Apply] │
└────────────────────────────────────────────┘
```

- Pointer-capture painting, radial soft-falloff stamps (8 steps), rgb = brush color,
  alpha = greyscale key; paints **through the ramp** when set — all v1 semantics verbatim.
- **Per-stroke undo** (D2): in-dialog stack (≤32 strokes); `⌘Z` registered at scope
  `surface:glow-paint` (wins over global undo per §11.1 precedence — global bindings stay
  active in dialogs, so this scope binding is required to keep ⌘Z from hitting the
  document). `⇧⌘Z` redo likewise.
- **Live 3D preview on stroke end** (pointer-up): the working bitmap runs through
  `glowComposite` and updates the picked mesh's editor material (view-only until Apply).
- `Apply` → `setMeshGlowPainted` (PNG → IndexedDB `emissive-paint:<meshId>` under the
  project prefix, shape='painted', one undo step). `Cancel`/Esc with unsaved strokes →
  discard confirm (§14.3, "discard dirty glow paint" — named tier-3 case). `Clear` wipes
  the working canvas (in-dialog, stroke-undoable).
- Imported glTF emissive textures load into this same dialog (stored under 'painted' —
  retouchable, v1 behavior kept).
- Phone: S → center per S22, canvas scales to fit width; touch painting via the same
  pointer events; brush/intensity sliders `sm` size.

### 1.7 Hotkeys & commands added by Surface mode

No new raw keys beyond the shell defaults (mode `5`, `⇧⌘A`, viewport set). Palette/menu
commands registered: `surface.pickMesh` (dynamic provider: "Edit surface: <mesh>"),
`assets.openManager` (⇧⌘A), `assets.uploadTexture`, `assets.newMaterial`,
`assets.newPrimitiveMesh`, `assets.importModel`, `assets.makeKittenMesh.<kind>`,
`surface.editGlowPaint` (enabled when picked mesh glow mode = painted). Scope
`surface:glow-paint`: `⌘Z`/`⇧⌘Z` stroke undo/redo, `Esc` via ladder rung 2 (dialog).

### 1.8 Undo / persistence per interaction (Surface mode)

| Interaction | Undo | Bytes |
|---|---|---|
| Rename mesh / assign material / face texture / wrap / glow mode / ramp edit / visor surface / render-as-glass | discrete step each | — |
| Primitive param commit | discrete "resize mesh"; atlas rebuild via signature diff | — |
| UV scale/offset typing | live view-only draft; discrete step on field commit | — |
| Glow color/coverage/emissive/tint sliders | streaming — one push at interaction start | — |
| Glow paint Apply | one discrete step | PNG written before the mutate (one-step batching rule) |
| Add Matching Light | discrete step "add light" | — |
| Add instance | discrete step "add subpart" | — |
| `$surfaceMeshId` / `$surfaceFace` / picker search / `$simulateGlass` | never undo | — |

---

## 2. Asset Manager overlay (L) — Window ▸ Asset Manager… `⇧⌘A` (S30)

The unified library: textures, materials, meshes, import batches — with previews,
where-used, rename, post-creation editing, orphan review, and honest deletion.

### 2.1 Layout

```
┌ Asset Manager ──────────────────────────────────────────────────────── ✕ ┐
│ ┌ rail ─────┐  🔍 [search…            ]   [⊞ Grid|☰ List]  [Sort: Name ▾]│
│ │ All    47 │ ┌──────────────────────────────────────────────────────────┐│
│ │ Textures12│ │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          ││
│ │ Materials 6│ │ │ [thumb] │ │ [thumb] │ │ [thumb] │ │ [thumb] │          ││
│ │ Meshes   9│ │ │plate_diff│ │ Steel ● │ │Hull Box │ │Radiator ⚠│         ││
│ │ Imports  2│ │ │baseColor│ │material │ │prim ×2  │ │prim ×0  │          ││
│ │───────────│ │ │→2 faces │ │→3 meshes│ │         │ │not expor│          ││
│ │ ⚠ Unused 3│ │ │→1 mat   │ │         │ │         │ │-ted     │          ││
│ └───────────┘ │ └─────────┘ └─────────┘ └─────────┘ └─────────┘          ││
│  ＋ New ▾     │  ── Imported: rcs_pod.glb · 3 SubParts · 8 tex · 2 mat ──││
│               │  [Replace…] [Remove import…]   (batch header card)       ││
│               │ ┌─────────┐ ┌─────────┐ ┌─────────┐                      ││
│               │ │ Pod_L ×1│ │ Pod_R ×1│ │ Tank  ×2│  …                   ││
│               └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

- Two panes (foundation §10.3): left **category rail** — All / Textures / Materials /
  Meshes / Imported models, each with a count badge (per-kind — kills the conflated
  "Custom (N)" number, pain #13) — plus an **⚠ Unused (N)** filter row (§2.5). Rail footer
  `＋ New ▾` menu: Upload Texture… / New Material… / New Primitive Mesh… / Import Model… /
  Make Kitten Mesh ▸ (D1; the first three open as **pushed views** in this dialog's
  DialogViewStack; Import Model and part-ify jump per D8/S27).
- Right pane: fuzzy search (name + subPartId + channel + provenance), Grid/List toggle,
  Sort (Name / Kind / Recently added / Usage). View prefs persist
  (`flexo:assetManager` → `{view, sort, category}`).
- **Imported models** category groups by batch: a header card (sourceFile, SubPart/
  texture/material counts, GLB size, `Replace…` / `Remove import…`) above its mesh cards.
- Grid card = thumbnail, name, kind/channel chip, usage chips; List row = 24px thumb +
  name + chips + inline actions. Selection: single (drives a right-side detail strip in
  List view; Grid opens detail as a pushed view on double-click/Enter).

**Thumbnails** (fixes pain #4): textures — `<img>` from the existing `textureSrcUrls`
blob URLs; materials — preview-sphere render; meshes — turntable-still render. Material +
mesh thumbs come from **one shared offscreen thumbnail renderer** (module
`three/assetThumbs.ts`: single WebGLRenderer, render queue on idle, cache keyed by
content signature, session-only) — never one WebGL context per row (the v1
MaterialPreview-per-dialog cost). Missing/pending thumb = kind glyph placeholder.

### 2.2 Per-item detail & actions

Pushed detail view (DialogViewStack: `‹ Back · <name>`) per kind. Row/card ⋮ menus carry
the same actions.

**Texture** detail: large preview (checkerboard, 1:1 / fit toggle), `Name` TextField
(rename — new `renameCustomTexture(id, name)`, discrete undo), `Channel` Select
(re-encode via `setTextureChannel`, v1 semantics: silent re-encode from stored source;
normal-channel pick shows the OpenGL/glTF hint), dimensions readout, **Replace image…**
(new: file pick/paste → re-encode under the same id — always-confirm, tier 3: "Replaces
the stored image bytes. Undo cannot restore the old image."), **Where used** list (§2.4),
Delete (§5.2).

**Material** detail: the MaterialDialog form as a pushed view (D9) + `Duplicate`
(copy with " copy" suffix) + Where-used (meshes) + Delete ("N meshes revert to the
neutral look" — count wording kept).

**Mesh** detail (primitive/kitten/imported): thumbnail, Name (rename), kind + params
summary, instance count, `[Add instance]`, `[Edit surface →]` (jump, closes dialog),
primitives: dimension fields (same editors as §1.3 Identity), Where-used (placements:
"×3 on layers Hull, Wings" + `Select placements` action — selects them and closes the
dialog revealing Build/current mode), Delete ("Deletes the mesh and its N placements").
Kitten meshes (D6): rename / add instance / edit surface / delete; params read-only
("baked from <kind> kitten").

**Import batch** header actions: `Replace…` → jump to Import Review replace mode (D8);
`Remove import…` → confirm with the full inventory (SubParts, placements, orphaned
materials/textures to be GC'd, the batch layer if empty) + byte warning (§5.2) —
`planImportRemoval`/`removeImport` semantics verbatim.

### 2.3 Empty states (per category — D1, kills the v1 navigation-directions problem)

Each category's empty state = icon + one line + inline creation buttons:
- Textures: "No uploaded textures." `[Upload Texture…]` — "or paste an image with the
  upload dialog open".
- Materials: "No materials yet." `[New Material…]`.
- Meshes: "No custom meshes." `[New Primitive Mesh…] [Make Kitten Mesh ▾]`.
- Imports: "No imported models." `[Import Model…]` — "or drop a .glb onto the viewport".

### 2.4 Where-used (reverse references)

New computed selector in customAssetStore (no react/three imports):

```ts
$assetUsage: computed([$part], part => ({
  texture: Map<texId, { faces: {meshId, faceKey}[]; materials: {matId, slot}[] }>,
  material: Map<matId, { meshes: meshId[] }>,
  mesh:     Map<meshId, { placements: number; layers: layerId[] }>,
}))  // built from materialTextureIds() + faceTextures + placements —
     // the same graph planOrphanedAssets already walks
```

Usage chips on cards ("→2 faces · 1 mat", "→3 meshes", "×2 placed"); clicking a chip in
detail views navigates: face ref → jump to Surface mode with mesh+face picked; material
ref → push that material's view; placement ref → `Select placements` (close + select +
reveal). Delete confirms read their counts from the same selector (ends the v1 ad-hoc
per-render recomputation, pain #12, and the no-where-used gap, pain #6).

### 2.5 Orphan review ("Unused" filter)

`⚠ Unused (N)` rail row filters to assets with zero usage: textures referenced by no face
and no material channel; materials assigned to no mesh; meshes with zero placements are
**not** orphans (they're templates — they show the "not exported" chip instead, D10).
Header banner in this view: "Unused assets are never deleted automatically." +
`[Delete all unused…]` → tier-3 confirm listing every item by name with the byte warning.
(Automatic GC stays exactly what it is today: reference-count collection only on
remove/replace-import — constraint preserved.)

### 2.6 Phone variant

L → cover (S22). Category rail → horizontal chip row under the search field; grid 2-col;
detail views push as sheet views with back header; `＋ New` is a footer FAB-row. All
actions identical; thumbnail renderer unchanged.

---

## 3. Import pipeline (Import Review dialog — L, §10.4)

One dialog, `dialogStore` id `import-review`, params `{files?, replaceImportId?}`. Three
views in its DialogViewStack: **Drop → Review → Importing** (v1's 3-state flow kept).
Entry points: viewport `.glb`/`.gltf` drop (straight to Review — unchanged), Add ▸ Import
Model… (Drop view), Manager ＋/Replace (D8), Surface Imported section Replace.

### 3.1 Drop view
Drop zone + file picker (`.glb`, or `.gltf` + `.bin` + images multi-pick) + the "How to
export from Blender" recipe disclosure — verbatim. Replace mode adds a banner: "Replacing
import: rcs_pod.glb — matched by node + material name".

### 3.2 Review view (the densest-surface redesign)

```
┌ Import model — rcs_pod.glb                                    ‹ Back  ✕ ┐
│ ┌──────────────────────────────┐ ┌ THIS IMPORT ONLY ────────────────────┐│
│ │                              │ │ Name prefix [rcs_pod ]               ││
│ │      3D PREVIEW              │ │ Scale [1.000] ⚠≠1  [0.001|0.01|0.1|1]││
│ │  (live: scale/up-axis)       │ │ Bake transforms to origin   [ ]      ││
│ │                              │ │ Make double-sided           [ ]      ││
│ │                              │ │ Merge into one SubPart      [ ]  (1) ││
│ ├──────────────────────────────┤ │ Update materials from file  [✓] (R)  ││
│ │ 3 SubParts · 5 placements ·  │ ├ SAVED PREFERENCES 📌 ────────────────┤│
│ │ 2 materials · 4.2k tri ·     │ │ Up axis        [Y ▾]                 ││
│ │ 8 textures · 1.2×0.8×0.8 m · │ │ Max texture    [2048 ▾]              ││
│ │ mod ≈ 3.1 MB · VRAM ≈ 14 MB ⓘ│ │ Bake scale into geometry    [✓]      ││
│ ├──────────────────────────────┤ │ Decimate view meshes        [✓]      ││
│ │ ▸ What KSA can't represent(3)│ │   affects export — Settings →        ││
│ │ ▸ Replace match: 2 kept ·    │ └──────────────────────────────────────┘│
│ │   1 new · 1 removed (named)  │                                         │
│ └──────────────────────────────┘        [Cancel]  [Import 3 SubParts]    │
└──────────────────────────────────────────────────────────────────────────┘
```

- Left column: preview viewport (reflecting scale/up-axis live), the 9-stat grid
  (SubParts, placements, materials, tris, verts, textures, measured bounds, est. mod
  size, est. VRAM with tooltip), warnings disclosure (grouped, each with its remedy —
  verbatim content), replace-mode match summary (**removed SubParts named**).
- Right column — **the sticky/per-import split made structural** (D11): two labeled
  groups. "This import only" resets on every open (scale=1 with the amber `≠1` badge when
  changed; prefix defaults from filename; double-sided/bake/merge off; merge only enabled
  when `canMerge` — single-material; "(R)" = replace mode only, default on). "Saved
  preferences 📌" reads/writes `$modelImportSettings` (up axis Y/Z, texture cap
  1024/2048/4096 [re-runs material translation], bake-scale, decimate-view-meshes with
  its "affects export" caption + Settings deep-link, D4).
- Scale field = `PreciseNumberInput` (>0 enforced) + `SCALE_PRESETS` buttons.
- Confirm button: `Import N SubParts` / replace mode `Replace (2 kept, 1 new, 1 removed)`.
- Phone: cover; preview on top (40vh), stats strip, then the two option groups as
  accordions; same reset rules.

### 3.3 Importing view
Phase text ("Translating materials… / Normalizing geometry… / Encoding textures and
creating SubParts…"), indeterminate bar, **undismissable** (view stack back + Esc + ✕
disabled) — verbatim. Commit semantics untouched: binaries first, then ONE mutate = one
undo step (new layer named after file, textures, materials, meshes, placements; layer
activated + revealed; placements selected). Replace: `(sourceNode, sourceMaterial)` match
key, matched SubParts keep `id`+`subPartId`+arranged placements, orphan GC — all verbatim.

### 3.4 Import report → notification center (rich entry)

`notify({kind:'rich', …})` on completion (foundation §5.1 — the ImportReportCard surface
is deleted). Entry body: mode icon + filename; counts row (kept/added/placements/
textures/materials/removed); **removed SubParts named** (hard requirement); non-blocking
warnings in a disclosure; actions `[Open Asset Manager]` `[Edit surfaces →]`. Sticky
until dismissed; replaced-by-next-import behavior dropped — entries accumulate in the
center (ring 100), the status flash shows the one-line summary. Import failure →
`danger` notification (persistent).

### 3.5 Kitten part-ify flow

Add ▸ Make Kitten Mesh ▸ Hunter/Polaris/Banjo (also Manager ＋ New ▾ and the mesh-picker
empty state). Entity-creating command → auto-switch to Build (S27) so the result is
visible: one undo step, "<Kitten> Mesh" layer created + activated + revealed, submesh
placements selected. Status flash: `Kitten meshes added ✓ — [Edit surfaces →]` (jump
action picks the visor). Kitten meshes then appear in picker/manager per D6. Geometry
stays session-baked (never persisted); textures stay Content/Core references with the
export-mode setting in Settings → Import & Export (D4).

---

## 4. Live preview == export (single-code-path contract)

Binding on every Surface-mode surface: the editor preview and the export bundle derive
from the same functions — `glowComposite`/`glowRamp` (glow), `prepareChannelImage`/
`encodeKtx2` transforms (channel semantics, UNORM+linear tagging, normal X-flip +
strength-baked-RG), ORM packing rules (packed overrides separates identically),
`applyFaceUvTransforms` (UV baking), `buildMeshAtlasGlb` naming (subPartId == GLB
mesh/node name). The two deliberate preview divergences are kept and labeled in-UI:
imported render-as-glass (opaque editor preview by design) and visor glass
(vivid-vs-muted via `$simulateGlass`). No new preview path may be invented by the
implementation — extend these modules only.

---

## 5. Deletion & byte policy (D3)

### 5.1 Confirm matrix (applies §14.3)

| Action | Tier | Confirm |
|---|---|---|
| Delete texture | not-fully-undoable | always; usage counts + §5.2 wording |
| Replace texture image | not-fully-undoable | always; "old image bytes are gone" |
| Delete material | undoable (descriptor-only) | >0 uses → inline strip with count; else none + status `[Undo]` |
| Delete mesh (+N placements) | undoable descriptor; ≤5 placements no confirm + `[Undo]`; >5 confirm | counts stated |
| Remove import | not-fully-undoable | always; full inventory + §5.2 |
| Delete all unused | not-fully-undoable | always; items named |

### 5.2 Standard byte-warning wording (one string, all byte-backed kinds)
> "This deletes the stored file bytes from this browser. **Undo restores the entry, not
> the bytes** — anything using it will render untextured until re-uploaded."
(Import removal appends: "Imported geometry has no other copy and cannot be recreated.")

---

## 6. What happened to v1 surfaces (area death-list confirmations)

| v1 surface | v2 |
|---|---|
| CustomAssetsModal ("Custom (N)") | Asset Manager (§2) |
| AssetsToolbar "Custom (N)" button + count | deleted; per-kind counts live in the manager rail; Window menu + ⇧⌘A are the entries |
| ManageTexturesPanel (floating w-64 card) | Surface mode right sidebar (§1.3) + left face card (§1.4) |
| AssetsList row ⋮ "Manage Textures"/"Manage Material" (name varies by kind) | one label everywhere: **"Edit Surface →"** (custom-mesh rows only) |
| ImportReportCard corner overlay | notification center rich entry (§3.4) |
| MaterialDialog (3 hosts, modal-over-modal) | overlay dialog (Surface) / pushed view (Manager) — never stacked (D9) |
| CustomTextureDialog / CreateMeshDialog | kept (S dialogs); openable from Add menu AND as Manager pushed views; paste-while-open + `.gltf` sidecar multi-pick + drop preserved |
| Settings "Kitten mesh textures (export)" section | Settings → Import & Export (D4) + Export dialog read-only chip |

---

## 7. Store-level data model (sketches)

### 7.1 customAssetStore (kept as orchestrator; additions marked ＋)

```ts
// document arrays (unchanged): $part.customTextures / customMaterials / customMeshes
// mutations (kept): createTextureAsset, setTextureChannel, removeCustomTexture,
//   addCustomMaterial, updateCustomMaterial, removeCustomMaterial, setMeshMaterial,
//   addCustomMesh, updateCustomMesh (name/primitive — NOW HAS UI), updateMeshFaceConfig,
//   setMeshGlow, setMeshGlowPainted, setMeshSurface, setMeshGlass, setMeshTransparent,
//   makeKittenMeshPart, importModelAsMeshes, replaceImport, removeImport,
//   planImportRemoval, planOrphanedAssets, removeCustomMesh
＋ renameCustomTexture(id, name)            // discrete undo
＋ replaceTextureImage(id, file)            // re-encode same id; bytes overwritten (D3)
＋ $assetUsage                              // computed reverse-reference graph (§2.4)
＋ $unplacedCustomMeshes                    // computed; feeds picker/manager chips +
                                           //   export pre-flight info row (D10)
// ephemeral UI atoms: $importModelRequest (kept), $importReport → RETIRED in favor of
//   notify(); $managingMeshId / $glowPaintMeshId → replaced by modeStore.$surfaceMeshId /
//   dialogStore 'glow-paint' params
// hydration lifecycle (initCustomAssets / hydrateCustomAssets / meshSignature rebuild /
//   ensureCurrentKtx2 legacy re-encode / $simulateGlass refresh): UNCHANGED
```

### 7.2 New/changed UI-side state

```ts
// modeStore surface sub-state: $surfaceMeshId, $surfaceFace          (§1.1, ephemeral)
// assetManagerStore (tiny): $assetManagerPrefs = persistentJSON('flexo:assetManager',
//   { view:'grid'|'list', sort:'name'|'kind'|'recent'|'usage', category:'all'|... })
// three/assetThumbs.ts: shared offscreen thumbnail renderer + session cache   (§2.1)
// scene report atom: $faceDraft {meshId, faceKey, cfg} | null  — live UV typing preview
// dialog ids: 'asset-manager' | 'import-review' | 'glow-paint' | 'material' |
//   'create-mesh' | 'upload-texture'
```

### 7.3 Per-project IndexedDB namespacing (D5, aligned with LOCKED #3)

- **The key scheme and blob lifecycle are OWNED by the projects area**
  (design-projects-export.md §1.5/D7) — this design adopts that contract **by
  reference**, no second literal lives here: keys are
  **`pa:<projectId>:<kind>:<assetId>`** with kinds unchanged (`tex-src`, `tex-ktx2`,
  `import-glb`, `emissive-paint`, `mesh-glb`). The boot purge of unprefixed keys, the
  project-delete range sweep and the duplicate-copies-blobs mechanics are all specified
  there (single owner — a range sweep implemented against a second prefix spelling would
  silently sweep nothing).
- This area's obligations: `assetKeys` takes the project id from the project store (all
  call sites already go through `assetKeys` — analysis §5 — so the change is one module),
  and it provides ＋**`listProjectBlobs(projectId)`** — the enumeration API the archive
  builder, project duplicate and project delete consume.
- Import Project writes archive blobs back under the destination project's prefix during
  the additive merge (before the single mutate — one-undo-step batching rule kept). This
  kills the `hasCustomAssets` export/share gate; Share Link keeps the asset-less flow and
  the "Export archive instead" explanation (both dialogs owned by the projects area).

---

## 8. Interaction quick-reference (clicks / drags / keys)

| Where | Gesture | Effect |
|---|---|---|
| Picker row | click | pick mesh |
| Picker row ＋ | click | add instance (active layer, origin, select) |
| Faces chip | click / click active | select / deselect face |
| Viewport custom-mesh placement | click | select placement + pick template + face under cursor |
| Viewport built-in entity | click | select; left shows read-only surface card |
| Ramp bar | click empty | add stop at key |
| Ramp stop | drag | move `at`; popover on click |
| Glow canvas | pointer drag | paint stroke; pointer-up → 3D preview refresh |
| Glow dialog | ⌘Z / ⇧⌘Z | stroke undo/redo (surface:glow-paint scope) |
| Manager card | click / double-click / Enter | select / open detail view |
| Manager usage chip | click | navigate to referrer (§2.4) |
| Anywhere | ⇧⌘A | Asset Manager |
| Anywhere | `5` | Surface mode |

---

## 9. FEATURE PARITY TABLE — every v1 feature in this area → v2 home

| v1 feature (analysis ref) | v2 home |
|---|---|
| Upload texture: dialog, drag-drop, clipboard paste, channel select + normal hint, name-from-filename (1.1) | CustomTextureDialog kept verbatim — Add ▸ Upload Texture…, Manager ＋ New, Manager Textures empty state (§2.2/§2.3) |
| Change texture channel post-upload + silent re-encode (1.2) | Texture detail view Channel select (§2.2) |
| Delete texture w/ face-use count (1.3) | Texture detail / card ⋮ Delete — usage from `$assetUsage`, byte warning now stated (§5) |
| Create material: full field set, presets, advanced maps, packed-ORM override, live preview sphere, channel-typed selects (1.4) | MaterialDialog kept — overlay from Surface sidebar, pushed view in Manager (§1.3, §2.2, D9) |
| Delete material w/ mesh-use count + neutral-look wording (1.5) | Material detail Delete (§2.2, §5.1) |
| Assign/clear mesh material; first-face-texture-wins warning (1.6) | Surface sidebar Material section (§1.3) |
| Create primitive mesh (per-kind params, name, optional material/texture seed, place+select) (1.7) | CreateMeshDialog kept — Add menu, Manager, picker empty state |
| Add instance ×3 entry points (1.8) | Add ▸ Custom Mesh Instances ▸ (foundation §3) + picker row ＋ + Manager mesh detail + copy/paste |
| Primitive param & name editing post-creation — store-only gap (1.9) | **UI gap closed**: Surface Identity section + Manager mesh detail (§1.3, §2.2) |
| Per-face texture/wrap/UV editing w/ live preview; face selector hidden for 1-face (1.10) | Faces chips (right) + Face card (left) + viewport face pick/highlight (§1.3–1.5) |
| Glow: Off/Whole/Painted, color+coverage, ramp (drag stops, presets, import-from-image), independent emissive + 0.6 washout warning, Add Matching Light (1.11) | Glow section (§1.3), preview==export via glowComposite (§4) |
| Glow paint canvas: 512², soft stamps, ramp-through, brush/intensity/eraser, Clear/Cancel/Apply; imported emissive retouchable (1.12) | GlowPaintDialog (§1.6) + stroke undo, underlay, live preview (D2) |
| Visor surface: Glass/Glow/GlassGlow, tint+opacity, simulate-glass global toggle (1.13) | Visor Surface section (§1.3); $simulateGlass mirrored in Settings → Scene |
| Render as glass (imported) w/ deliberate opaque preview (1.14) | Imported section switch + one-liner kept (§1.3) |
| Import model: 3-state flow, all 10 options, sticky/per-import split, stats grid, warnings+remedies, canMerge gate, preview viewport, undismissable commit (1.15) | Import Review dialog (§3.2–3.3); split made structural (D11) |
| Import report card: counts, removed named, warnings, persistent (1.16) | Notification-center rich entry (§3.4) |
| Replace import: (sourceNode, sourceMaterial) match, kept ids + arranged placements, update-materials toggle, match summary, labeled confirm (1.17) | Import Review replace mode (§3.2), entries from Manager batch + Surface Imported section |
| Remove import: full inventory confirm, orphan GC, layer cleanup, byte warning (1.18) | Manager batch "Remove import…" + Surface Imported section (§2.2, §5) |
| Delete single mesh (instance count; batch GLB deliberately kept) (1.19) | Manager mesh detail / picker ⋮ Delete (§2.2) |
| Make Kitten Mesh: layer + submeshes + identity placements, one undo step, select + activate (1.20) | Add ▸ Make Kitten Mesh ▸ + Manager + picker empty state; S27 Build switch + jump chip (§3.5) |
| Kitten meshes excluded from modal/Add-submenu, managed as placed SubParts (1.20) | Add-submenu exclusion kept; **now listed** in picker + Manager (D6 — deliberate change, rationale logged) |
| Kitten texture export mode + Content/Core path (1.21) | Settings → Import & Export + Export-dialog read-only chip (D4) |
| Mod export of custom assets: atlas GLB, deduped PbrMaterials, 1×1 solids, verbatim ktx2 copies, ORM packing, glow composite, `_VM` decimation (1.22) | untouched business logic; unplaced-mesh silent drop now surfaced (D10) |
| decimateViewMeshes sticky import setting read at export (1.22/1.15) | Settings → Import & Export (editable) + Import Review toggle + Export chip (D4) |
| Project JSON export/share `hasCustomAssets` gate (1.23) | **gate removed** per LOCKED #3 (.tar.gz archive); this area supplies `listProjectBlobs` (§7.3); Share Link asset-less flow kept |
| Hydration lifecycle: boot reload, legacy `_SRGB` re-encode, signature-diff rebuild, simulateGlass refresh (1.24) | unchanged (§7.1) |
| Viewport `.glb` drop zone + dashed overlay (§2 map) | unchanged (canvas-cell overlay, foundation §1) |
| Add-menu asset entries (Upload/Material/Mesh/Import/Kitten-mesh/Custom-Mesh-Instances) | foundation §3 Add tree verbatim + Manager duplicates (D1) |
| "Custom (N)" AssetsToolbar button + conflated count | retired; per-kind rail badges (§2.1, pain #13) |
| Unplaced template invisibility (pain #15) | 0-instance rows visible everywhere + ⚠ chip (D10) |
| Where-used ad-hoc counts in delete confirms (pain #6/#12) | `$assetUsage` selector + chips + navigation (§2.4) |
| Window-paste into texture dialog; `.gltf` sidecar multi-pick | preserved (dialog kept verbatim) |
| Constraints: subPartId==GLB mesh name survival, one-mesh-one-material, UNORM+linear tags, raw-geometry export, X-flip normals, ORM packing, white-only emissive, glassGlow kitten-only, meshKind discrimination, one-undo-step batching, ref-count GC, sticky/per-import split | all restated as binding in §4, §5, §7, D11 — implementation may not alter them |

Cross-area integration notes for other planners: export area adds the D10 pre-flight info
row and the two read-only Settings chips (§10.6); projects area consumes
`listProjectBlobs`/prefix scheme (§7.3) for archive + duplicate + delete; Build Outliner
adds the "Edit Surface →" row item (custom meshes only); Settings dialog owns the D4
fields under Import & Export.
