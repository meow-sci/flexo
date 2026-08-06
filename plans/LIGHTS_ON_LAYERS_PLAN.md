# Lights on ordinary layers

Make `PartLight` an ordinary layer citizen — exactly what commit **`a3cdf5b`** ("feat(layers):
connectors and colliders live on ordinary layers", 2026-07-31) did for `Connector` and
`PartCollider`. The built-in **Lights** layer is removed outright; lights land on the active
layer, mix freely with SubParts/connectors/colliders on any layer, and move between layers from
the row menu, the multi-select toolbar and Outliner drag-and-drop.

After this change only **two** kinds stay pinned: **IVA seats** (their row order IS the game's
seat-cycle order) and **kittens** (editor-only aides that never reach the export).

> **READ FIRST — `git show a3cdf5b`.** It is the template for every decision here: which symbols
> get deleted, how the doc comments read afterwards, and how the commit is scoped. This plan
> only records where lights differ from it.

> **GREP HAZARD (read before you search).** `src/state/editorStore.test.ts` contains a literal
> NUL byte at line 228 (`` ?? `\0missing:${index}` ``), so `file(1)` reports it as `data` and
> **plain `grep -r` silently skips it**. That file holds ~20 `LIGHT_LAYER_ID` sites and the only
> coverage of `deleteLayer` / `clearLayer` / `duplicateLayer` / `moveEntityToLayer` /
> `moveSelectionToLayer`. Always use `grep -a` (or `rg`) in this repo. Task 3.3 removes the byte.

---

## 1. Locked decisions

| # | Decision | Ruling |
|---|---|---|
| D1 | Remove the Lights layer as a built-in/pinned layer **entirely** (delete `LIGHT_LAYER_ID`, `createLightLayer`, drop it from `BUILT_IN_LAYER_IDS`, `ENTITY_ONLY_LAYER_IDS` and `createEmptyPart`). | **Adopted.** Parity with the precedent; a demoted-but-still-seeded layer would be a third category nothing else in the model has. |
| D2a | Do **not** bump `PROJECT_SCHEMA_VERSION` (stays `3`). | **Adopted.** See §1.1. |
| D2b | Do **not** bump `PROJECT_EXPORT_VERSION` (stays `9`). | **OVERRULED → bump to `10`.** See §1.1. |
| D3 | Clamp an entity whose `layerId` names no existing layer to `DEFAULT_LAYER_ID`. | **Adopted, as a separately-revertable task** (Wave 3). |
| D4 | `GlowSection`'s "Add matching light" lands on the active layer. | **Adopted — and it needs zero code.** See §1.2. |
| D5 | Clamp `currentLayerId()` so an *add* never lands on a pinned layer. | **Adopted, as a separately-revertable task** (Wave 3), flagged in the commit message because it also changes where connectors/colliders land when a pinned layer is active. |

### 1.1 The version question (D2)

**`PROJECT_SCHEMA_VERSION` — no bump. This is AGENTS.md case 1.**
Snapshots in `flexo-projects` store the whole `EditingPart`. Every stored light carries
`layerId: 'lights'`, and every stored `part.layers` contains `{id:'lights', name:'Lights'}` —
that layer could never be deleted, and `normalizePart`'s `{...createEmptyPart(), ...part}` keeps
the stored `layers` array verbatim. So an old project loads with its lights intact on a now-
ordinary, now-deletable layer called "Lights". Nothing loads *wrong*; the user's own work is not
purged. Identical to what the precedent shipped.

**`PROJECT_EXPORT_VERSION` — bump `9 → 10`. This is AGENTS.md case 2 (changed meaning).**
The wire format is a *different* contract from the snapshot, and import is **exact-match**
(`projectTransfer.ts:319`, `projectArchive.ts:284`) — a v9 payload written by today's build is
still accepted by tomorrow's build unless the number moves. Today `CLight.ly` is optional and its
**absence means the constant `LIGHT_LAYER_ID`** (`projectCodec.ts:596,614`); every real payload
in the wild therefore omits it. After this change that layer id has no privileged meaning, so a
v9 payload's lights would decode either to `''` (dangling — see D3) or silently onto Default,
while the payload's own "Lights" layer arrives empty. The codec's own header comment sets the
test: *"Only a BREAKING wire/model change (an existing token's shape or meaning changes, or a new
field whose default would decode silently wrong) bumps it"* — this is precisely that, and
AGENTS.md rule 3 ("when in doubt, it is breaking") settles the remainder.

Three supporting arguments:

1. **No back-compat residue is possible otherwise.** Keeping the old default alive means keeping
   `LIGHT_LAYER_ID` as a decode fallback — literally "read the old key's old default", which
   AGENTS.md forbids and D1 deletes.
2. **The precedent did not survive on its merits.** `a3cdf5b` did not bump either, so a
   pre-a3cdf5b payload decoded connectors/colliders with `layerId: str(undefined) === ''`. That
   hole was only closed later and by accident, when the unrelated `v8 → v9` easing bump (1b84cbf)
   made those payloads unreadable. There is no such safety net queued behind this change.
3. **The token rename comes free.** Connectors and colliders spell layer id `l` and always emit
   it; lights should match (`ly → l`, required). A key rename is the constitution's own cited
   example of a wire-only bump.

Cost: `.flexo.json` / share links / `.flexo.tar.gz` archives written at v9 are rejected with the
existing "re-export it from a matching flexo version" message. IndexedDB projects — the actual
user work — are untouched because `PROJECT_SCHEMA_VERSION` does not move. `ARCHIVE_VERSION`
stays `1`.

> **If the owner overrules this and keeps v9:** then `decLight` must read
> `layerId: str(c.l ?? c.ly ?? DEFAULT_LAYER_ID)`-style tolerance, do **not** rename `ly → l`,
> and Wave 3's D3 clamp becomes mandatory rather than optional. Say so in the commit message.

### 1.2 "Add matching light" (D4)

No change required. `GlowSection.AddMatchingLightButton` (`src/ui/surface/GlowSection.tsx:207-226`)
already calls `addLight(mesh.subPartId, seed)` with no layer argument, and `addLight` will use
`currentLayerId(part)` after Task 1.2. The seed cannot smuggle a layer in (`addLight` overwrites
`id` / `ownerTemplateId` / `layerId` after the spread — keep that). Only the doc comment on
`addLight` needs its "always the built-in Lights layer" clause rewritten.

---

## 2. What the research got right, and the corrections

**Confirmed verbatim:** `PartLight.layerId` already exists and is shaped like a connector's
(`types.ts:262`); **`src/three/` needs zero changes** (`EditorScene.ts:1210,1484,1526,2883` and
`selectionTransform.ts` all read `light.layerId` generically); `selectionOps.ts`, `selectors.ts`
`$layerSummaries`, `outlinerTree.ts` `candidatesFor('light')`, `layerReorder.ts`,
`subPartSetModel.ts`, `PartBrowserDialog.tsx`, `OutlinerPanel.tsx` drag source, `EntityMenu`'s
`entityIndexOf`/`refLayerId`, `addCommands.landed`/`revealEntity` and the delete/clear confirm
strips are all already kind-generic and auto-follow `ENTITY_ONLY_LAYER_IDS`.
`partXmlSerializer.ts` contains zero occurrences of "layer" — **the game contract is untouched.**

**Corrections / additions found while verifying:**

- **`src/ui/build/MultiSelectPanel.tsx:150`** — `movable = byKind.subpart + byKind.connector +
  byKind.collider > 0` gates the whole "Change Layer" button. A light-only selection shows no
  button. **Missing from the research's list.**
- **`src/state/editorStore.test.ts` has extensive layer coverage after all** — ~20 `LIGHT_LAYER_ID`
  sites plus full `describe('editorStore layers')` and `describe('editorStore duplicateLayer')`
  blocks covering `deleteLayer` (4 tests), `clearLayer` (2), `duplicateLayer` (5),
  `moveEntityToLayer` (2), `moveSelectionToLayer` (1). The research's "no coverage at all" claim
  came from grep skipping the NUL-byte file. What is genuinely absent is **lights inside those
  tests** — every one of them asserts on placements/connectors/colliders only.
- **Two more test files** the research missed: `src/three/selectionTransform.test.ts:11,68` and
  `src/ui/data/dataNavigatorModel.test.ts:14,96,173,174`.
- **`projectCodec.test.ts` has two extra sites** at `:299,312` (a `CGameData` round-trip) beyond
  the `:770-815` light block.
- **`createPartLight` keeps its 2-arg signature.** It hardcodes `layerId: LIGHT_LAYER_ID`
  (`types.ts:1368`); change it to `DEFAULT_LAYER_ID` rather than adding a parameter — every real
  caller (`addLight`, `lightsFromElement`) overrides `layerId` explicitly right after the spread,
  and ~8 test call sites keep compiling.
- **`duplicateSelected`'s light block** just needs its `layerId: LIGHT_LAYER_ID` line **deleted** —
  the surrounding `structuredClone(src)` already carries the source layer (that is exactly how the
  collider block at `editorStore.ts:1728-1734` works).
- **Comment drift to fix while you are in there:** `LayerHeaderRow.tsx:110` ("Default and the other
  **two** entity-only layers") and `duplicateLayer`'s doc ("the **three** entity-only layers are
  pinned") both become "one"/"two".
- **Grep collision warning:** `dataModeStore.ts` uses `'lights'` as a *Data-mode section id*
  (`:41,67,85`), and `ImportProjectDialog`/`ProjectManagerDialog` use `'lights'` as a count label.
  None of those are layer ids. Do not touch them.
- `scope/` mentions lights only in `gamedata-modules.md` (the `<Light>` XML contract) and never
  mentions layers. **No `scope/` sync — see §7.**

---

## 3. Waves

**Parallel-safety summary**

| Wave | Agents | Parallel? | Why |
|---|---|---|---|
| 1 — production source | **1 agent, sequential** | **NO** | Deleting an exported symbol (`LIGHT_LAYER_ID`) is a whole-program edit; no split of it can be compile-green. |
| 2 — tests + docs | **4 agents** | **YES**, file-disjoint | Each agent owns files no other agent touches. All four start only after Wave 1 typechecks. |
| 3 — deliberate extras | **1 agent, sequential** | NO (and it must land last) | Two behavior changes that must stay easy to back out; each has its own tests. |

Waves 1+2 are **one commit** (the precedent's shape). Wave 3 is a **second commit** so it can be
dropped without touching the first.

---

### Wave 1 — production source (one agent, in this order)

Order is the precedent's: types → store → IO → UI. The tree does **not** typecheck between tasks
1.1 and 1.6 (that is expected — `LIGHT_LAYER_ID` disappears in 1.1 and its importers are fixed
through 1.6). The **compile-green boundary is the end of Wave 1**: `pnpm typecheck` must pass with
only test files failing.

#### Task 1.1 — types

**File:** `src/ksa/types.ts`
- `PartLight.layerId` (`:261-262`) — replace the "Always `LIGHT_LAYER_ID`" doc with the wording
  `Connector.layerId` / `PartCollider.layerId` use ("An ORDINARY layer, exactly like a
  placement's — a light is organized, hidden and locked alongside the SubParts it illuminates").
- Delete `LIGHT_LAYER_ID` (`:369-374`) and `createLightLayer()` (`:391-394`).
- `BUILT_IN_LAYER_IDS` (`:397-402`) → `[DEFAULT_LAYER_ID, IVA_SEAT_LAYER_ID, KITTEN_LAYER_ID]`.
- `ENTITY_ONLY_LAYER_IDS` (`:405-421`) → `[IVA_SEAT_LAYER_ID, KITTEN_LAYER_ID]`, and **rewrite the
  rationale paragraph**: it currently argues lights are pinned because "their rows are
  ordinals/markers rather than geometry". That thesis is reversed — a light ships inside the Part
  and belongs in the same logical grouping as the geometry it lights; what stays pinned is IVA
  seats (array order IS the game's cycle order, so the layer's rows are ordinals) and kittens
  (editor-only, never exported).
- `LayerableKind` (`:428`) → `'subpart' | 'connector' | 'collider' | 'light'`, doc updated.
- `createPartLight` (`:1368`) → `layerId: DEFAULT_LAYER_ID`.
- `createEmptyPart` (`:2289`) → `[createDefaultLayer(), createIvaSeatLayer(), createKittenLayer()]`.

**Verify:** `grep -arn "LIGHT_LAYER_ID\|createLightLayer" src` returns only files scheduled below.

#### Task 1.2 — store: add / duplicate / paste / import

**File:** `src/state/editorStore.ts` (drop the `LIGHT_LAYER_ID` import at `:72`)
- `addLight` (`:2726-2745`) — `layerId: currentLayerId(part)`; keep the "never seed-overridable"
  triple but reword its comment (identity + owner + the **active** layer).
  *Undo: unchanged — already `pushUndo('add light', newId)`.*
- `duplicateSelected` (`:1760`) — delete the `layerId: LIGHT_LAYER_ID` line; `structuredClone(src)`
  carries the source layer. *Undo: unchanged (caller-pushed).*
- `pasteClipboard` (`:1935`) — `layerId: pasteLayerId(part, src.layerId)`; rewrite the comment
  above it (it currently promises re-pinning). *Undo: unchanged.*
- `applyImportedGameData` (`:927-939`) — lights take the import's `layerId` parameter, like the
  collider loop directly above (`:906-915`); update the comment to say a light lands with the
  geometry it lights.
- `addPart` selection gate (`:1071`) — delete `if (selectable(LIGHT_LAYER_ID))
  tailRefs('light', …)` and move the `light` tail into the existing `if (importedOnLayer) {…}`
  block beside `connector`/`collider`.

**Verify:** `pnpm typecheck` still fails only on not-yet-touched files; no `LIGHT_LAYER_ID` left
in this file.

#### Task 1.3 — store: the layer mutators (**the correctness core**)

**File:** `src/state/editorStore.ts`. Missing any one of these strands lights on a dangling layer id.
- `layerableList` (`:4177-4183`) — add `kind === 'light' ? part.lights`.
- `moveEntityToLayer` (`:4195-4220`) — add the light branch to the undo-label name lookup.
  *Undo: `pushUndo('move to layer', …)` already there.*
- `moveSelectionToLayer` (`:4223-4273`) — add `const lig = selectionIndicesOf(current, 'light')`;
  include it in `total`, in the single-entity `only` chain, in the `[kind, indices]` loop, and pass
  it to `entityCountLabel(sub, con, 0, col, 0, lig)` (the 6th positional param already exists,
  `:1778-1790`). Update the doc line "pinned kinds — IVA seats, lights, kittens" → seats + kittens.
- `deleteLayer` (`:4111-4142`) — lights in **both** branches (`move-items` reassign, `delete-items`
  filter). *Undo: unchanged.*
- `clearLayer` (`:4144-4162`) — lights in the `total` count **and** the filter (a layer holding only
  lights must stop being a no-op). *Undo: unchanged.*
- `duplicateLayer` (`:4040-4108`) — add a light clone loop after the collider loop: `nextLightId`,
  `structuredClone`, `layerId: newId`, no position offset (matching connectors/colliders), and push
  `{kind:'light', id}` into `copies`. Also fix the doc's "three entity-only layers" → two.
  *Undo: unchanged — one `pushUndo('duplicate layer', …)` for the layer AND its clones.*

**Verify:** re-read each of the six functions and confirm `part.lights` appears in every place
`part.colliders` does.

#### Task 1.4 — store: import-removal safety

**File:** `src/state/customAssetStore.ts` (`planImportRemoval`, `:1690-1702`)
Add `&& !part.lights.some((l) => l.layerId === id)` to the "layer is empty" predicate, beside the
existing connectors/colliders/kittens clauses. Without it, removing an import batch deletes a layer
that still holds lights.

#### Task 1.5 — IO

- **`src/ksa/partXmlParser.ts`** (`:9` import, `:567`) — `lightsFromElement` assigns
  `DEFAULT_LAYER_ID` with the precedent's comment ("XML carries no layers: everything parsed lands
  on Default, exactly like the placements it sits with — an import then re-homes the whole Part").
- **`src/state/projectCodec.ts`** (`:61` import, `:565-620`) —
  rename `CLight.ly?: string` → `l: string` (**required**), always emit it in `encLight`
  (`o.l = l.layerId`, drop the `!== LIGHT_LAYER_ID` conditional), decode `layerId: str(c.l)`.
  Rewrite the `CLight` doc block (it currently explains the constant). **Bump
  `PROJECT_EXPORT_VERSION` 9 → 10** (`:108`) and append above it:
  `// v10: <Light> layer id — CLight.ly (optional, absent ⇒ the pinned Lights layer) becomes a`
  `// required CLight.l naming ANY ordinary layer; a v9 payload's lights would decode onto a`
  `// layer that no longer has that meaning.`
- **`src/state/projectTransfer.ts`** (`:28,32` imports) —
  `ensureBuiltInLayers` (`:487`): delete the Lights line.
  `mergeProjectImport` lights (`:715-731`): `layerId: getOrCreateImportLayer(src.layerId)` and
  rewrite the comment to match the collider one at `:690-702`. Also update the function's header
  doc (`:483` region) which lists which kinds reuse a built-in layer.
  `envelopeToPart`: no change (layers come from the payload wholesale).

#### Task 1.6 — UI

- **`src/ui/outliner/EntityRow.tsx:219-221`** — add `|| row.kind === 'light'` to the
  `ChangeLayerItem` gate; update `ChangeLayerItem`'s doc list ("SubParts, connectors, colliders")
  to include lights.
- **`src/ui/outliner/LayerHeaderRow.tsx:177-186`** — drop `'light'` from the `stayed` filter and
  `light: 'Lights stay on Lights'` from the `words` map (this is what makes drag-to-layer work for
  lights; the drop handler already calls `moveSelectionToLayer`). Fix the `:110` comment
  ("the other two entity-only layers" → "the other entity-only layer").
- **`src/ui/build/MultiSelectPanel.tsx:150,169-171`** — add `+ byKind.light.length` to `movable`
  and update the comment above `ChangeLayerButton` (only seats/kittens are left where they are).

**Verify (Wave 1 exit gate):** `pnpm typecheck` passes for all non-test sources; `pnpm lint`;
`pnpm fmt:check`. `grep -arn "LIGHT_LAYER_ID\|createLightLayer" src` returns **nothing**.

---

### Wave 2 — tests + docs (4 agents, run in parallel, file-disjoint)

All four start after Wave 1's exit gate. Exit gate for the wave: `pnpm test` green.

#### Agent 2A — `src/state/editorStore.test.ts` (**owns this file exclusively**)

Use `grep -a`. Updates:
- `:184` import, `:358` light fixture `layerId` → `DEFAULT_LAYER_ID`.
- `:573` — `applyImportedGameData` test: the hand-edited `layerId: 'not-the-lights-layer'` is no
  longer re-pinned; assert the light lands on the **import's** layer (same expectation the collider
  in that test gets), while `scale` is still re-pinned to (1,1,1).
- `:916` — `addLight` lands on the **active** layer; add a case that creates a layer, makes it
  active, and asserts the new light gets it.
- `:1008-1011` — the `deselectLayer`/`selectLayerEntities` light test must build its own layer
  instead of using the Lights layer.
- `:1038` — duplicate-a-light keeps the **source** layer.
- `:1303, 1376, 1392, 1407, 1419-1424, 1448, 1469-1482` — every built-in-layer list literal loses
  `LIGHT_LAYER_ID` (also the `it(...)` title at `:1299`).
- `:3067-3069`, `:3225` — same treatment (locked-layer pruning; paste keeps its source layer).

**New tests (this is where the real risk is retired):**
1. `deleteLayer` with `mode:'delete-items'` removes a light on that layer; with `mode:'move-items'`
   reassigns it to the target — and is undoable.
2. `clearLayer` on a layer holding **only** a light is no longer a no-op: it clears the light,
   records one undo step, and keeps the layer.
3. `duplicateLayer` clones lights onto the copy with fresh `_lightN` ids, same owner
   (`ownerTemplateId`) and same field values, selects them, and is ONE undo step.
4. `moveEntityToLayer('light', 0, layer)` moves a light, is undoable, and is still refused for
   every `ENTITY_ONLY_LAYER_IDS` member.
5. `moveSelectionToLayer` moves a mixed subpart+connector+collider+light selection in one step,
   leaves seats/kittens behind, and labels the undo entry `N items`
   (extend the existing test at `:1556` with the `lig` argument of `selectAcross`).
6. `addLight` after `setActiveLayer(custom)` → the light is on `custom`; `pasteClipboard` of a light
   whose source layer was deleted falls back to the active layer.

#### Agent 2B — the rest of `src/state/*.test.ts`

- **`layerStore.test.ts`** (`:29,105-132`) — the two lights tests must create their own layer
  (`createLayer('Lamps')`) instead of relying on the built-in; keep the assertion that locking a
  layer prunes selected lights (that contract does not change).
- **`projectCodec.test.ts`** (`:6,299,312,770-815`) — light fixtures use `DEFAULT_LAYER_ID`; the
  round-trip asserts `layerId` survives a **non-default** layer (that is the point of the required
  `l` token now); the "drops defaults from the wire form" test must now expect `l: 'default'` in the
  minimal encoding and its title/comment loses "layerId".
  **The version guard is at `:525-526`** — `it('stamps wire version 9 (per-channel keyframe
  easing)')` / `expect(PROJECT_EXPORT_VERSION).toBe(9)` must become **10** with a title naming the
  new reason (the `<Light>` layer-id token). `:423` and the `v: PROJECT_EXPORT_VERSION` fixtures at
  `:685,694` are relative and need no edit; `:583-592` (older-version rejection) likewise.
  `projectArchive.test.ts:135,180,190` are all relative to the constant — verify, do not edit.
- **`projectTransfer.test.ts`** (`:6,759,901,904-908,910-930`) —
  drop `LIGHT_LAYER_ID` from the built-in-layer list test; **delete** "restores the Lights layer
  when a payload omits it"; rewrite "appends pasted lights … on the built-in Lights layer" to assert
  a light follows its **source layer through `getOrCreateImportLayer`**, mirroring the existing
  collider import test.
  **New:** an import whose lights sit on the source's Default land on the mirrored new layer, not on
  the destination's Default.
- **`selectionOps.test.ts`** — **no `LIGHT_LAYER_ID` import and probably no assertion change**:
  `addOneOfEachKind` (`:30-38`) runs with Default active, so the light still lands on Default and
  `selectAll`'s `KIND_ORDER` output is unchanged. Only the helper's comment ("each on its own
  (built-in or active) layer") goes stale. **Run it, do not pre-emptively edit it.**
- **`projectStore.test.ts`** — verified clean: no `layers` assertions, no `LIGHT_LAYER_ID`. Listed
  only so you can confirm and move on.
- **`customAssetStore.test.ts`** — **new:** `planImportRemoval` does **not** propose deleting a
  layer that still holds a light (mirror of the existing collider case, if present).

#### Agent 2C — `src/ksa`, `src/three`, `src/ui` tests

- `src/ksa/partXmlParser.test.ts:31,311` — parsed lights are on `DEFAULT_LAYER_ID`.
- `src/ksa/partCatalog.test.ts:5,443` — same.
- `src/three/selectionTransform.test.ts:11,68` — fixture uses `DEFAULT_LAYER_ID`.
- `src/ui/outliner/outlinerTree.test.ts:6,66,91-101,110,132,190` — the tree no longer emits a
  pinned Lights section; the light row now appears in the **ordinary** layer's `LIGHTS` group.
  **New:** a light and a SubPart on the same ordinary layer produce two kind groups in
  `KIND_DISPLAY_ORDER` under one section.
- `src/ui/outliner/layerReorder.test.ts:7,42,48-56,64-65` — `ordinaryIds` now includes what used to
  be the Lights layer; the pinned set is seats + kittens.
- `src/ui/data/dataNavigatorModel.test.ts:14,96,173,174` — fixtures use `DEFAULT_LAYER_ID`.

#### Agent 2D — docs (**owns `docs/` exclusively**)

- **`docs/lights.md`** — rewrite the whole "**The Lights layer**" section (`:53-58`) as "Layers":
  a light lives on an ordinary layer like a SubPart; it lands on the active layer; visibility/fade/
  lock behave exactly as before (lock still blocks picking AND prunes selection — unchanged
  contract); it can be moved from the row menu, the multi-select toolbar or by dragging onto a layer
  header. Keep the pointer to `layers.md`.
- **`docs/layers.md`** — "Ordinary layers vs. pinned kinds" (`:52-73`): `LayerableKind` becomes four
  kinds; the pinned list drops to IVA Seats + Kittens; delete the **Lights** bullet and remove
  `LIGHT_LAYER_ID` from the built-in list. "Membership rules" (`:75-90`): lights land on the active
  layer, `duplicate`/`paste` keep the source layer, `mergeProjectImport` routes lights through the
  layer mapping, `applyImportedGameData` puts an imported Part's lights on the import's layer.
  "Transforms" (`:100-108`): keep the lights row but reword — lights are position/rotation-only
  because KSA has no light size, **not** because they are pinned. Actions table: note that
  `deleteLayer`/`clearLayer`/`duplicateLayer`/`moveEntityToLayer`/`moveSelectionToLayer` all cover
  lights.
- **`docs/editor-state.md`** — `:11` (`$part` row: lights now carry an ordinary `layerId` too),
  `:240` (`addLight` doc: "the id, owner and layer are never seed-overridable" → the layer is the
  **active** one), `:313` (paste keeps the original layer — now true for lights as well).
- **Version-bump follow-through:** `docs/architecture.md:154` ("`PROJECT_EXPORT_VERSION` 9 today")
  → 10; `docs/projects.md:266` (manifest sample `"exportVersion": 9`) → 10 and `:345` ("currently
  **9**") → 10 with the v10 reason. Leave `docs/animation-editor.md:144` and `docs/iva-seats.md`
  alone — those are historical statements about earlier bumps.
- Do **not** touch `scope/` (§7).

---

### Wave 3 — deliberate extras (one agent, second commit, after Wave 2 is green)

Both are pre-existing holes this change would otherwise widen. Keep them in **one separate commit**
titled so it can be dropped (`fix(layers): clamp adds and dangling layer ids`).

#### Task 3.1 — D5: an add never lands on a pinned layer

`setActiveLayer` and `currentLayerId` (`editorStore.ts:526-529`) only check that the layer exists,
and `LayerHeaderRow` renders the active-radio on pinned headers too — so a user can make **Kittens**
active and then `addLight` (or `addSubPart`/`addConnector`/`addCollider`) drops an entity onto a
layer `isMoveTarget` will not let it leave.
**Change:** `currentLayerId` returns `DEFAULT_LAYER_ID` when the active layer is in
`ENTITY_ONLY_LAYER_IDS`. One line, fixes every ordinary kind at once.
**Flag in the commit body:** this also changes where connectors/colliders land today when a pinned
layer is active.
**Tests:** `setActiveLayer(KITTEN_LAYER_ID)` then `addLight(null)` / `addSubPart` / `addConnector` /
`addCollider` → all land on Default.

#### Task 3.2 — D3: clamp a dangling `layerId`

A dangling `layerId` fails **silently**: the Outliner only emits sections for layers that exist, so
the entity vanishes from the tree while still rendering, still selecting, still being swept by
Select All — and `isMoveTarget` will not let you rescue it.
**Change:** a small exported helper (suggested: `clampLayerIds(part)` in `projectStore.ts`) that
rewrites any `placements`/`connectors`/`colliders`/`lights` entry whose `layerId` is not in
`part.layers` to `DEFAULT_LAYER_ID`; call it from `normalizePart` (`projectStore.ts:183-209`) and
from `envelopeToPart` right after `ensureBuiltInLayers` (`projectTransfer.ts:478-489`). Pinned kinds
are excluded — their layers are guaranteed by `ensureBuiltInLayers`.
**Note the tension explicitly in the doc comment:** `normalizePart` otherwise promises "never
overwrites a present value"; this is a repair of an *unrepresentable* value, not a migration, and it
is not version-gated.
**Decode path:** with the v10 bump, `decLight`/`decConnector`/`decCollider` always receive a real
token, so no codec change is needed — the clamp is the backstop for hand-edited and foreign
payloads.
**Tests:** a snapshot whose light/connector names a deleted layer loads on Default and is visible in
the Outliner tree.

#### Task 3.3 — hygiene: the NUL byte

`src/state/editorStore.test.ts:228` — replace `` `\0missing:${index}` `` with `` `missing:${index}` ``
so the file stops being invisible to grep. It is a never-matched sentinel id; confirm `pnpm test`
stays green.

---

## 4. Complete test inventory

**Must be updated** (all fail otherwise):

| File | Sites |
|---|---|
| `src/state/editorStore.test.ts` | `184, 358, 573, 916, 1008, 1011, 1038, 1299(title), 1303, 1376, 1392, 1407, 1419, 1424, 1448, 1469, 1474, 1482, 3067, 3069, 3225` |
| `src/state/layerStore.test.ts` | `29, 105-132` |
| `src/state/projectCodec.test.ts` | `6, 299, 312, 525-526` (**version guard → 10**), `770, 783, 788, 793-815` |
| `src/state/projectTransfer.test.ts` | `6, 759, 901, 904-908, 910-930` |
| `src/state/selectionOps.test.ts` | `30-38` — stale comment only; expected to pass unchanged (verify) |
| `src/state/projectStore.test.ts` | verified clean — no change expected |
| `src/ksa/partXmlParser.test.ts` | `31, 311` |
| `src/ksa/partCatalog.test.ts` | `5, 443` |
| `src/three/selectionTransform.test.ts` | `11, 68` |
| `src/ui/outliner/outlinerTree.test.ts` | `6, 66, 91-101, 110, 132, 190` |
| `src/ui/outliner/layerReorder.test.ts` | `7, 42, 48-56, 64-65` |
| `src/ui/data/dataNavigatorModel.test.ts` | `14, 96, 173, 174` |

**Must be added** (none of this is covered today):

1. `deleteLayer` — lights deleted / lights reassigned / undo restores them. *(highest value: this is
   the strand-a-light bug)*
2. `clearLayer` — a lights-only layer is no longer a no-op; undo restores.
3. `duplicateLayer` — lights cloned with fresh ids onto the copy, selected, one undo step.
4. `moveEntityToLayer('light', …)` — moves, undoes, still refuses pinned layers.
5. `moveSelectionToLayer` — mixed selection including a light; seats/kittens stay behind.
6. `addLight` lands on the active layer; `pasteClipboard` keeps a light's source layer and falls
   back when it is gone.
7. `mergeProjectImport` — a light follows its source layer into the mirrored import layer.
8. `planImportRemoval` — a layer holding a light is not proposed for deletion.
9. `outlinerTree` — a light and a SubPart co-exist as two kind groups under one ordinary section.
10. *(Wave 3)* pinned active layer → adds land on Default; dangling `layerId` → clamped to Default.

---

## 5. Docs to change

`docs/lights.md` (the whole "The Lights layer" section), `docs/layers.md` (ordinary-vs-pinned, the
built-in list, membership rules, transforms note, actions table), `docs/editor-state.md`
(`:11, :240, :313`), plus the version follow-through in `docs/architecture.md:154` and
`docs/projects.md:266,345`.

---

## 6. Commit messages

Wave 1+2 — model it on `a3cdf5b`, including a "No migration" paragraph that is **explicit about the
asymmetry**: `PROJECT_SCHEMA_VERSION` stays 3 (stored projects keep their old Lights layer as an
ordinary, now-deletable layer with its contents intact) while `PROJECT_EXPORT_VERSION` goes 9 → 10
(the `ly`/`l` token's meaning changed; v9 payloads are rejected, never converted).

---

## 7. `scope/` needs NO sync — and why

`scope/` catalogs the flexo↔KSA **game-contract** break surface. Layers are editor-only and have no
KSA representation: `partXmlSerializer.ts` contains zero occurrences of "layer", and no `scope/*.md`
mentions `LIGHT_LAYER_ID` or the Lights layer. `scope/gamedata-modules.md` owns `<Light>` (its XML
grammar, defaults and the ported falloff math) and none of that moves. The only `LayerableKind`
reference in `scope/` is a parenthetical in `scope/colliders.md:39` about colliders, which stays
true. **Do not open the game-update checklist for this change.**

---

## 8. Known limitations — recorded, not fixed

- **SubPart-owned light × layer.** An owned light draws one marker per placement of its owning
  template, and those placements may sit on **different** layers, while the light has exactly one
  `layerId`. So hiding a layer hides the marker for placements on other layers too. Colliders have
  the identical structure and the identical wart today; this change neither creates nor worsens it.
  Fixing it would mean per-instance layer resolution across the whole marker pipeline.
- **Two import paths do the same job differently.** `applyImportedGameData` (built-in Part import)
  and `mergeProjectImport` (project envelope) each re-home imported entities with their own rules
  and their own comments. Both are corrected here; neither is unified.
- **`entityCountLabel`'s positional-optional signature** (`sub, con, kit, col, seat=0, lig=0`) is a
  trap — `moveSelectionToLayer` calls it with four arguments today and gains a sixth here, with a
  literal `0` threaded through the middle. A named-object signature would be better; out of scope.
- **The Outliner's pinned/ordinary display partition** now shows lights inside ordinary sections in
  `KIND_DISPLAY_ORDER`; a part with many lights on one layer will render a long `LIGHTS` group.
  No grouping/collapse work is planned.

---

## 9. Riskiest part, and what catches it

**The risk is a light stranded on a layer id that no longer exists.** `deleteLayer`, `clearLayer`
and `duplicateLayer` each enumerate the layerable kinds **by hand**; miss lights in any one of them
and the light survives with a `layerId` naming a deleted layer. The failure is silent by
construction — the light keeps rendering and keeps being selectable in 3D, but it disappears from
the Outliner (which only emits sections for layers that exist), and `isMoveTarget` will not let the
user move it back. Nothing in the current test suite would notice.

**What catches it:** new tests 1-3 in §4 (delete/clear/duplicate a layer holding a light, asserting
both the light's fate and the undo round-trip), backed by Wave 3's `clampLayerIds` as the
defence-in-depth net if a *future* kind is added and the same omission recurs.

**Second-order risk:** the version ruling. If the bump is dropped without also adding a tolerant
decode default, every v9 export decodes lights to `layerId: ''` — the same stranding, arriving
through the wire instead of through a mutator. §1.1's overrule note spells out the required
fallback if that path is taken.
