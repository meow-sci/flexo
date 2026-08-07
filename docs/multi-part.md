# Multi-part projects

A project holds **N Parts**, and every editing surface still edits exactly **one** of them.
The **active part** lives in the ordinary stores — `$part`, `$selection`, `$layerView`,
`$activeLayerId`, the undo stacks, every mode sub-store — exactly as it did when a project held
one part. The others are **parked** documents: they draw in the viewport as non-interactive
ghosts, and **Export to KSA** emits all of them into the same three XML files. One project is
one mod is N `<Part>`s.

Design and rationale: `plans/MULTI_PART_PLAN.md`. Its §0.5 invariants (**I1**–**I9**) are cited
by name in the code and below.

## The registry — `src/state/partsStore.ts`

```
        ┌───────────────── src/state/partsStore.ts ─────────────────────┐
        │ $partEntries: readonly PartMetaEntry[]   every part's meta,    │
        │                                          in registry order     │
        │ $activePartId: string                                          │
        │ inactiveDocs:      Map<entryId, InactivePartDoc>  module-priv  │
        │ inactiveHistories: Map<entryId, HistorySnapshot>  module-priv  │
        │ $inactiveRevision: number   bumped whenever a parked doc moves │
        │ switchPart · createPart · duplicatePart · deletePart · …       │
        └────────────────┬──────────────────────────────────────────────┘
                         │ park ▲ / hydrate ▼ (a switch does both)
   ┌─────────────────────▼────────────────────────────────────────────┐
   │ THE ACTIVE PART — the whole existing editing surface, UNCHANGED   │
   │ $part · $selection · $layerView · $activeLayerId ·                │
   │ the undo/redo stacks · every mode sub-store (each self-clamping)  │
   └─────────────────────┬────────────────────────────────────────────┘
                         │ $part.set(…)
        ┌────────────────┴───────────────┐
        │ EditorScene reconcile          │   GhostPartsLayer
        │ root `flexo-part` — pickable   │   scene sibling — never pickable
        └────────────────────────────────┘
```

`PartMetaEntry` is meta only and never holds a document:

| Field | Meaning |
| --- | --- |
| `id` | stable editor id `pt_…`, minted once — never exported, never shown |
| `name` | display name ("Part 1"), renamable — never exported |
| `visible` · `opacity` · `offset` | how this part draws **as a ghost**; the active part ignores all three |
| `includeInExport` | whether Export to KSA emits it (default `true`) |
| `counts` | the chip breakdown (`deriveCounts`), refreshed on park / create / load — derived, never persisted |

An inactive part parks an `InactivePartDoc` = `{ part, layerView, activeLayerId }`: layers are
per part, so the layer view state travels with the document.

Three invariants shape everything else:

- **I1 — the active-part surface is sacred.** No existing store changed shape and no consumer
  of `$part` / `$selection` / `$layerView` / `$activeLayerId` / any mode store learns about
  parts. Only `partsStore`, persistence, export, the ghost layer and the switcher UI are
  part-aware.
- **I2 — single writer for parked state.** Only `partsStore` touches `inactiveDocs` /
  `inactiveHistories`; everything else reads through `snapshotParts()` (or its reactive twin
  `$partsSnapshot`) and `getInactiveDoc(id)`.
- **I3 — entity ids are per-part namespaces.** `_connector1`, `_light1`, instance ids and layer
  ids are unique only *within* one part: two parts may both contain `_light1`. Nothing may key
  a cross-part map by a bare entity id — anything project-wide keys by `(partEntryId, entityId)`.

Imports point one way: `partsStore` imports from `editorStore` / `layerStore` / `chainStore`,
never the reverse. The three places that need the arrow back are explicit seams — the
`$activePartId.subscribe(setActivePartEntryId)` mirror (which `editorStore` stamps onto the
clipboard and `ivaStore` reads), and the two injected slots `registerPartAssetSweeper` /
`registerPartAssetHydrator` that `customAssetStore` fills at init.

## Switching parts

`switchPart(id)` is a mini `applyProjectSnapshot`: park the outgoing document, its layer view
and its history into the registry maps, then hydrate the incoming one into the live stores.
Every write is synchronous, so autosave's debounced writers only ever observe the finished
state.

| Survives a switch | Resets on a switch |
| --- | --- |
| the **mode** (Build / Animation / Data / Engine / Surface) — the editor's posture belongs to the session, not the document | the **selection** (`clearSelection()`) |
| the **armed tool**, with one exception: seat view exits, because a seat id from the outgoing part is meaningless (and under I3 the incoming part may reuse it — `ivaStore` compares the entry-time part id, not just the seat id) | the open **action chain** (`closeChain()` — its seeds are outgoing instance ids) |
| the **camera** — the viewport frame is the shared workspace | four intent atoms: `$revealEntity`, `$colliderEditContext`, `$lightEditContext` and the collider `$coverageReport` (`clearPartScopedIntents()`) |
| every **app preference** — layout, snap, gizmo space, display filters, kind visibility | `$layerView` and `$activeLayerId`, which swap to the incoming part's |

Mode sub-state is neither in that table nor lost: `dataModeStore`, `animationStore`,
`surfaceModeStore` and the engine computeds all clamp themselves on the single `$part.set`,
exactly as they do when a project is opened. The four cleared atoms are the ones a clamp cannot
save: each names an outgoing entity by bare id (the two `EditContext` records would silently
anchor the gizmo to a placement the user never picked in this document) or is a *measurement*
of the outgoing geometry. The full atom-by-atom audit, with a verdict for every un-namespaced
intent atom in the app, is the comment block above `switchPart` in `partsStore.ts`.

**Registry operations are never undo steps** (**I6**). Create, switch, delete, duplicate,
rename, reorder and the view flags are lifecycle and view state, like project actions and
`$layerView` — none of them calls `pushUndo`. Deleting a part therefore destroys its undo
history, which is why both delete surfaces confirm first.

## Undo is per part

Each part carries its own undo/redo stacks. `switchPart` calls `exportHistory()` on the way out
and `importHistory()` on the way in, so `⌘Z` in part B can never reach into part A, the ↶ ↷
tooltips describe the part you are editing, and `MAX_UNDO` (50) is a per-part depth by
construction. A part created or duplicated starts with empty stacks.

Stacks are persisted per part too — see [projects.md](./projects.md) for the `history` record's
`byPart` shape.

One known wrinkle, accepted rather than fixed (limitation 8 below): an undo entry snapshots the
project-level editor **aids** (measurements, reference containers) alongside the part, so
undoing in one part can restore aids to that part's snapshot age.

## Layers are per part

Layer definitions and membership are document state, so they travel inside `EditingPart` and
have always been per part. What multi-part adds is that the **view** state travels too:
`$layerView` and `$activeLayerId` are parked with the document and swapped by `switchPart`,
so hiding a layer in one part does not touch the identically-named layer in another. Layer ids
are per-part namespaces (I3) — part B routinely owns an unrelated `layer2` — which is why a
cross-part paste re-homes to the active layer rather than trusting an id match. See
[layers.md](./layers.md).

## Ghosts — the other parts in the viewport

Every inactive part renders as a **ghost**: real geometry and real materials, never pickable,
never selectable, never framed, never thumbnailed. Per-part `visible` / `opacity` / `offset`
control it, and a ghost respects that part's own stored `layerView`. The offset is workspace
only — the active part always edits at the origin and no offset is ever exported.

The contract, the scene tree, the I5 exclusion table and the build/disposal rules are in
[3d-workspace.md ▸ Ghost parts](./3d-workspace.md#ghost-parts-the-projects-other-parts).

## Custom assets are per part

Textures, materials, meshes and custom reactions are fields of `EditingPart`, so **each part
owns its own** (D1). There is no shared project library: cross-part reuse is duplicate-the-part,
never a shared reference. The Asset Manager reads the active part and says so in its title once
a project has more than one part.

But **asset ids are project-unique** (**I4**), because the blob namespace is
`pa:<projectId>:<kind>:<assetId>` with no part segment (`assetDb.ts`), and because KSA registers
`<SubPart>` ids and GLB mesh names globally per mod. So `CustomTexture.id`, `CustomMaterial.id`,
`CustomMesh.id`, `ImportedMeshSource.importId` and a custom mesh's `subPartId` must not repeat
across parts. Fresh authoring guarantees that (random suffixes); the two operations that could
break it re-mint instead:

- **`duplicatePart`** clones through `clonePartWithFreshAssets` (`src/state/partClone.ts`),
  which re-mints five id families, rewrites every reference site and copies the backing blobs
  under the new keys. The per-family table of what is re-minted, what references it, and what is
  deliberately left alone (`imported.meshName`, instance/connector/layer/animation ids, reaction
  ids) is the module header plus `plans/MULTI_PART_PLAN.md` §P2.04.
- **Import as new part(s)** runs the archive's adoption plan against an empty destination
  document, so every incoming asset id is fresh in this project.

Two consequences worth knowing: blob hydration covers the **whole registry** — `hydrateCustomAssets`
iterates `snapshotParts()`, so a ghost part's textures have blob URLs — while the active-part
deleters (`removeCustomTexture`, `removeUnusedAssets`) stay active-part scoped, which is correct
because each part owns its assets. And `deletePart` sweeps exactly the doomed part's blobs
(`sweepPartAssets`, fire-and-forget), which is safe only because ids are project-unique.
See [custom-assets.md](./custom-assets.md).

## Export — N parts, one mod

Included parts are gathered in registry order by `partsForExport()`, mapped to `NamedExportPart`
(`entryId`, `name`, `ns`, `part`) by `exportPreviewStore.toNamedExportParts`, and handed to the
builders. Excluded parts are invisible to preflight, XML and binaries alike.

```
flexo-parts/
├── mod.toml
├── <Base>Part.xml        ← N × <Part Id=…> siblings, one per included part
├── <Base>GameData.xml    ← N × <PartGameData> + each part's <SubPartGameData> variants
│                            + the deduped <FixedReaction>s, all siblings under <Assets>
├── <Base>Assets.xml      ← N × <MeshAtlas> + each part's <PbrMaterial>/<SubPart> entries
├── Meshes/…              one atlas GLB per part that has custom meshes
├── Textures/…            id-/token-namespaced — collision-free under I4
└── Animations/…          anim-id-suffixed — collision-free
```

`<Base>` is still `sanitizeBaseName(projectName)`, and the file names are unchanged: what grew
is their contents. This is legal because an Assets XML file is a flat polymorphic list
(`KSA/AssetBundle.cs` — `[XmlRoot("Assets")]` over `List<SerializedId>`), so sibling
`<Part>` / `<PartGameData>` / `<SubPartGameData>` / `<MeshAtlas>` / `<FixedReaction>` elements
are first-class. `buildMultiModContent` plans the whole export (per part: `expandGlassGlow`, the
export-variant map, the remap) and serializes the Part + GameData documents;
`buildMultiCustomBundle` walks those plans **sequentially** and produces the one Assets XML plus
the union of the binaries.

Because KSA's registries are global and first-wins, a collision does not error at load — it
silently ships the wrong asset. Every registered id therefore has a named guarantor:

| Registered id | Guarantor |
| --- | --- |
| `<Part Id>` / `<PartGameData Id>` | preflight blocker on a duplicate `partId` |
| Export-variant `<SubPart Id>` = `flexo_<base>_<ns>_<templateId>` | the per-part `ns` token (`partExportNs(partId)` = `sanitizeBaseName`), preflight-checked for collisions |
| Custom-mesh `<SubPart Id>` · GLB mesh names · `_VM` names | I4 (project-unique `subPartId`, enforced by the clone re-mint) |
| `<PartModel Id>` = `<subPartId>_Model` / `<variantId>_Model` | follows the two rows above |
| `<PbrMaterial Id>` | mat-id- or bundle-token-suffixed per part; `assetsXmlSerializer.claimId` throws across plans |
| `<FixedReaction Id>` | cross-part dedupe of identical payloads; divergent duplicates are a preflight blocker |
| `<KeyframeAnimationModule Id>` / animation GLB paths | the random per-clip anim-id suffix in `animationNaming.ts` |
| Texture file names | texture-id / bundle-token suffixes — unique under I4 |

The variant namespace exists because KSA registers `<SubPartGameData Id="T">` **once globally**
per template id: two parts that both place the same built-in template with different SubPart
GameData would otherwise merge onto one entry. Namespacing every variant per part avoids the
collision structurally.

**Preflight** is `collectProjectExportIssues(parts, coreReactions, catalog)`
(`src/ksa/exportIssues.ts`, pure). It runs each part's existing per-part pass — against **that
part's own** reaction index, never a shared one — stamping `partEntryId`/`partName` onto every
issue. The dialog groups on that id (never on the name — two parts may share one), renders
cross-part findings first under **Project**, and a jump to a fix switches to the owning part
before setting the mode, since no mode can focus an entity that is not hydrated.

On top of the per-part passes, preflight adds five cross-part blockers: no parts included,
duplicate `partId`, Part Ids that collide after sanitization, a custom-mesh `subPartId` used by
two parts, and one `<FixedReaction>` id defined differently in two parts. The dialog's header
states "Exporting N of M parts" with a chip per included part and names how many are excluded.

## Persistence

The snapshot is `{ version, parts: SavedPartEntry[], activePartId, savedAt, camera,
measurements, containers }` at `PROJECT_SCHEMA_VERSION` **4**, and the history record is
`{ byPart: Record<entryId, {undo, redo}> }`. `camera`, `measurements` and `containers` stay
project-level — they are workspace aids in the shared world frame. The wire format
(`PROJECT_EXPORT_VERSION` 11) carries every part, including parts excluded from KSA export: a
share link or archive is a project transfer, not a mod build. Both numbers moved for multi-part,
which means pre-existing saved projects, archives and share links were purged rather than
converted, per the no-migration rule. Full detail — the storage table, the autosave triggers,
the boot purge probe and the archive's three import destinations — is in
[projects.md](./projects.md).

## UI

Every part action is a **command** first (`src/ui/commands/partCommands.ts`); the chip, the menu
and the palette are surfaces onto the same dataset, and all user feedback lives there —
`partsStore` never imports `src/ui`.

- **The part chip** sits at the head of the menubar's right cluster:
  `[Part ▾][Project ▾][↶][↷][⌘K]`. It opens the **parts popover** (`shell/PartSwitcher.tsx`),
  the one surface that shows every part at once. Each row, left to right: activate dot
  (the only control that closes the popover) · name (double-click to rename inline) ·
  an `excluded` chip when the part is out of the export · count chip with a hover breakdown ·
  eye · ghost opacity · workspace offset · a ⋮ menu with Rename… / Duplicate / Move Up /
  Move Down / Include in export / Delete…. A footer button runs **New Part**. On the active row
  the three ghost controls stay enabled and say "Applies when another part is active".
- **File menu**: New Part · Switch Part ▸ (provider rows, and the submenu hides itself in a
  single-part project) · Rename Part… · Duplicate Part · Delete Part….
- **⌘K palette**: those commands plus `Next Part` / `Previous Part` (palette-only) and one
  `Switch to part: <name>` row per part from the `parts` provider, with a ✓ on the active one.
- **Dialogs**: `'part-rename'` and `'part-delete-confirm'`, both mounted in `DialogRoot`. The
  in-popover delete uses an inline confirm strip instead — two entry points, one action.
- **Hotkeys** (registry group "Parts", all `global`): `⌥1`…`⌥9` activate that slot in registry
  order, `⌥.` next part, `⌥,` previous part. All are gated on "no dialog open **and** the
  project holds more than one part", so they are never dead chords or an invisible switch behind
  an overlay. The nine positional ids are documented synthetics (`part.activate1`…`9`) — the
  palette's provider rows are the real switch commands.

Part-scoped surfaces label themselves once a project has more than one part, all through the
single `$partScopeName` computed (null in a single-part project, so nothing reads differently
there): the Data navigator's pinned root row, the Engine navigator's part scope, and the Asset
Manager's title.

### Phone

Phone gets part switching through the shared datasets and nothing bespoke: the `☰` drill-down
renders the same `MENU_SPEC` File section, and the palette sheet reaches the provider rows. The
top bar's chip prefixes the active part name (`<part> — <project>`) once there is more than one.
The desktop popover manager — ghost opacity, offset, reorder, include-in-export — is **not**
ported to phone.

## Accepted limitations

1. Ghosts exclude editor furniture: connectors, colliders, IVA seats, light markers, joint
   markers and aids.
2. Measure and pivot picks cannot snap to a ghost surface — every editor raycast is root-scoped
   (I5), which is the same mechanism that keeps ghosts unpickable.
3. Phone gets menu and palette part switching only, not the popover manager.
4. Export variant ids changed form once (`flexo_<base>_<ns>_<templateId>`). Re-exporting into an
   existing mod folder produces `-2` suffixed XML under the standing non-overwrite rule — delete
   the stale files by hand, as before.
5. Overlapping translucent ghosts sort with three.js's default transparency caveats — the same
   class of artifact as the layer fade.
6. Registry meta edits (opacity, offset) mark the export preview stale even though they cannot
   change a byte of it. Over-invalidation only: preview rebuilds are lazy and memoized.
7. `⌥1`–`⌥9` reaches the first nine parts; beyond that, use the popover or the palette.
8. The aid-undo wormhole: an undo entry snapshots `$measurements` / `$containers` with the part,
   so undoing in one part can restore aids to that part's snapshot age, stepping on aid edits
   made while another part was active. Rare, and redo or any further edit recovers.

## Tests

`src/state/partsStore.test.ts` covers init, create, the switch round-trip (document, layer view,
active layer, revision bumps), undo isolation across a switch, delete (refusal at one part,
active-part fallback, history destruction), rename/reorder/view setters and `partsForExport`
filtering, plus `duplicatePart`'s placement, naming, empty history and `partId` suffixing.
`src/state/partClone.test.ts` is the I4 proof: zero id overlap across all five families, every
reference site rewritten, blobs copied under the new keys, and the deliberate non-remints left
byte-identical. `src/state/projectStore.test.ts` covers the v4 round-trip with two parts,
history `byPart`, the purge probe and the registry autosave triggers;
`src/ksa/exportIssues.test.ts` the cross-part blockers; `src/ksa/modExport.test.ts` and the two
serializer suites the multi-part XML; `src/three/ghostPlan.test.ts` the ghost inclusion rules;
`src/ui/commands/partCommands.test.ts` the commands, the provider and the enable rules.
`scripts/smoke-v2.ts` drives the whole loop in a browser: create a part from the palette, jump
back with `⌥1`, and switch forward again from the palette.
