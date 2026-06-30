# Cleanup: Light Parts & SubPart Lights

**Goal:** Make flexo's light modelling match how KSA actually works — **one light switch per Part**, with **per-SubPart light settings** retained — and verify the mod XML we emit carries the necessary SubPart light GameData.

**Background (read first):** `analysis/HOW_LIGHT_PARTS_WORK.md`. The load-bearing facts that drive this plan:

- A Part has exactly **one** light-switch slot. `Part.LightSwitch` is a single field; `Part.ResetModuleProperties` takes the **first** `PowerConsumer` with `LightSwitch=true` and `break`s (decomp `KSA/Part.cs:407,913-922`).
- Every cast light (`LightModule`) and every emissive mesh in the whole part subtree is gated by that one switch via `FullPart.LightSwitch` (decomp `KSA/LightModule.cs:88,93`; `KSA/PartModelModule.cs:95`).
- The in-game part window draws **one checkbox per power consumer in the subtree** (decomp `KSA/Part.cs:1595-1602`). So multiple `LightSwitch=true` consumers produce **multiple checkboxes, but only the first gates anything** — the extras are dead toggles that still **drain power**.
- `<Light>` lives on a **SubPart** (`SubPartGameData`); the switch lives on the **Part** (`PartGameData`). The light's aim follows the SubPart instance's orientation.

**The problem in flexo today:** the part-level power model is an unbounded `PowerConsumer[]` with a "+ Consumer" button and a per-consumer "Light switch" toggle. A user can (and the reporter did) create several `LightSwitch=true` consumers in one Part → the exact "nonsensical XML" case above.

---

## 1. Current state inventory (source-verified)

### 1.1 Part-level power consumers — the footgun

| Layer | Location | Behavior today |
| --- | --- | --- |
| Type | `src/ksa/types.ts:553` | `PartGameData.powerConsumers: PowerConsumer[]` (unbounded) |
| Default | `src/ksa/types.ts:658` | `powerConsumers: []` in `createEmptyGameData` |
| Parser | `src/ksa/partXmlParser.ts:323-327` | pushes **every** `<PowerConsumer>` into the array |
| Serializer | `src/ksa/partXmlSerializer.ts:147-155` | emits **every** consumer as `<PowerConsumer>` under `<PartGameData>` |
| Codec | `src/state/projectCodec.ts:235-247,258,280,310` | persists array `pc: CPowerConsumer[]` |
| Store | `src/state/editorStore.ts:1936-1965` | `addPowerConsumer` (unbounded push), `removePowerConsumer(i)`, index setters |
| UI | `src/ui/GameDataSections.tsx:471-503` | `PowerConsumersSection` — a card per consumer + "+ Consumer" button, each with its own "Light switch" + "Starts on" toggles |

KSA fact check: no shipped Part has more than one `<PowerConsumer>` in a single `<PartGameData>` (verified: `CoreElectricalAGameData.xml` has 4 consumers spread across 4 separate part blocks; `CoreCommandAGameData.xml` has 1). Collapsing to a single consumer loses nothing on import.

### 1.2 SubPart lights — already structurally correct

| Layer | Location | Behavior today |
| --- | --- | --- |
| Type | `src/ksa/types.ts:582-598` | `SubPartGameData.lights: Light[]`, keyed by `subPartTemplateId` |
| Empty check | `src/ksa/types.ts:601-612` | `isSubPartGameDataEmpty` **counts lights** → light-only SubParts are NOT pruned ✅ |
| Default light | `src/ksa/types.ts:635-646` | `createLight()` = canonical CoreElectricalA spotlight ✅ |
| Parser | `src/ksa/partXmlParser.ts:422` | `spd.lights = directChildren(spEl,'Light').map(lightFromElement)` ✅ |
| Serializer | `src/ksa/partXmlSerializer.ts:222-242,298-328` | emits `<SubPartGameData Id="…"><Light>…</Light></SubPartGameData>` ✅ |
| Codec | `src/state/projectCodec.ts:589,601,614` | persists `li: CLight[]` ✅ |
| Store | `src/state/editorStore.ts:1684-1763` | add/remove/update/set* light mutators ✅ |
| UI | `src/ui/ManageTanksModal.tsx:47-48` → `LightsSection` (`GameDataSections.tsx:279`) | full `<Light>` schema editor in the per-SubPart "SubPart Data" dialog ✅ |

**This half mostly works.** The cleanup here is verification + UX clarity, not a rebuild.

---

## 2. Mod-XML emission audit (the explicit ask)

> *"analyze how we generate our mod XML to ensure that the necessary game data is emitted for the subpart light settings"*

Trace, for a light SubPart, through `buildModZip`/`writeModToFolder` (`src/ksa/modExport.ts`):

1. **GameData** (`serializeGameData`, `partXmlSerializer.ts:94`): iterates `part.subPartGameData`; for each non-empty entry emits `<SubPartGameData Id=…>` and, inside, `for (const light of spd.lights) … buildLightElement` (`:234`). `buildLightElement` (`:298-328`) emits `Type / Transform(Position+Rotation, never Scale) / Range / Intensity / Color / InnerAngle+OuterAngle (Spot only) / RayTracing (only if true)` — a field-for-field match to `LightModule.TemplateData` (decomp `KSA/LightModule.cs:11-53`). ✅
2. **Assets** (`serializeAssets` via `buildCustomBundle`, `modExport.ts:384`): for a custom-mesh SubPart, declares `<SubPart Id="<subPartId>">` with its `<PartModel>`/`<Mesh>`/`<Material>`. The `subPartId` is the same string used as `subPartTemplateId`. ✅
3. **Part tree** (`serializePart`, `partXmlSerializer.ts:66`): each placement emits `<SubPart Id="<instanceId>" InstanceOf="<subPartTemplateId>">` (`:543-557`). ✅

**Id alignment (the thing that makes the merge work):** all three records key off the same template id — Part `InstanceOf` = GameData `<SubPartGameData Id>` = Assets `<SubPart Id>` = `subPartTemplateId`. KSA merges GameData onto the Asset by identical `Id` and instantiates per `InstanceOf` (analysis §1.1). So the `<Light>` reaches every placed instance and is aimed by each instance transform. ✅

**Conclusion:** the emission path for SubPart lights is **already correct**. There is **no missing GameData** for subpart lights. Gaps are limited to: (a) no automated test pinning this end-to-end alignment, and (b) two correctness guards worth adding (below). The part-level switch is where the real change is needed (§1.1).

**Two emission nuances to encode as tests, not fixes:**
- A SubPart that has **only** a light (no tank/solar/engine) must still be emitted — guaranteed by `isSubPartGameDataEmpty` counting `lights` (`types.ts:605`). Pin with a test.
- For a custom **glow** mesh, the visible bulb is an emissive texture (analysis §5.2-5.3), exported by the existing glow pipeline (`modExport.ts:emitGlowTextures`). The `<Light>` (cast light) and the emissive (glow) are independent; a light part usually wants **both**. Document this in the recipe (§6).

---

## 3. Design decision (one open fork)

**How to enforce "one power consumer + one switch" per Part.**

- **Recommended — single optional consumer.** Replace `powerConsumers: PowerConsumer[]` with `powerConsumer: PowerConsumer | null`. The model then *cannot* express multiple switches; the UI becomes one "Power & Light Switch" card with an enable/remove affordance. Cleanest, removes the footgun at the data layer, and the no-migration rule ([[feedback_no_data_migration]]) makes the breaking change free (stale projects are purged at boot). Loses the (unused, never-shipped) ability to model two consumers on one part.
- **Alternative — capped array.** Keep `PowerConsumer[]` but cap the UI at one and validate "≤1 `lightSwitch=true`". Less invasive (no codec/type churn) but leaves the footgun latent in the data model, codec, and parser, and keeps dead complexity.

This plan is written for the **recommended** option. If the alternative is chosen, skip Phases 1/4 and replace Phase 6 with a UI cap + validation only.

> Note on scope: KSA technically allows a part to carry a non-light power draw *and* a separate light switch (two consumers). No shipped part does, and it is out of scope for "light parts." If that ever matters, the single-consumer model can be widened to "one switch + one optional plain draw" without affecting any of the light wiring.

---

## 4. Implementation plan (recommended option)

### Phase 1 — Data model (`src/ksa/types.ts`)
- Change `PartGameData.powerConsumers: PowerConsumer[]` → `powerConsumer: PowerConsumer | null` (`:553`). Update the JSDoc (`:258-276`, `:533-571`) to state the one-switch-per-part rule and cite `analysis/HOW_LIGHT_PARTS_WORK.md`.
- `createEmptyGameData` (`:649-670`): `powerConsumer: null`.
- Add a `createPowerConsumer()` factory returning `{ consumedWatts: 60, lightSwitch: true, lightIsActive: false }` (60 W = `LightSmallA`'s draw; default to a light switch since that's the dominant use).

### Phase 2 — Parser (`src/ksa/partXmlParser.ts:323-327`)
- Read all `<PowerConsumer>` children but keep **one**: prefer the first with `LightSwitch=true`, else the first. Assign to `game.powerConsumer` (null when none).
- If >1 is encountered, `console.warn` (matches the existing IVA/mesh warning style) noting flexo keeps a single consumer per part. (Defensive only — no shipped part hits this.)

### Phase 3 — Serializer (`src/ksa/partXmlSerializer.ts:147-155`)
- Replace the `for (const pc of game.powerConsumers)` loop with a single `if (game.powerConsumer)` block emitting one `<PowerConsumer>` (same `Consumed` + conditional `LightSwitch`/`LightIsActive` attrs). No other change — SubPart `<Light>` emission (`:222-242`) stays as-is.

### Phase 4 — Codec (`src/state/projectCodec.ts`)
- `CGameData.pc` becomes a single optional `CPowerConsumer` (`:258`); `encGameData` (`:280`) writes `o.pc = encPowerConsumer(g.powerConsumer)` only when set; `decGameData` (`:310`) reads `g.powerConsumer = c.pc ? decPowerConsumer(c.pc) : null`. (Per [[feedback_no_data_migration]], no back-compat for the old array form.)

### Phase 5 — Store (`src/state/editorStore.ts:1936-1965`)
- Replace `addPowerConsumer`/`removePowerConsumer`/index setters with:
  - `setPowerConsumer(pc | null)` (or `enablePowerConsumer()` / `clearPowerConsumer()`),
  - `setPowerConsumerWatts(w)`, `setPowerConsumerLightSwitch(on)`, `setPowerConsumerLightIsActive(on)` operating on the single `game.powerConsumer` (guard when null).
- Update the import/merge path (`editorStore.ts:589`) that does `game.powerConsumers.push(...src.powerConsumers)` → single-field assignment (prefer existing target value; take source only when target is null).

### Phase 6 — UI (`src/ui/GameDataSections.tsx:471-503`, `556-587`)
- Rewrite `PowerConsumersSection` → **`PowerConsumerSection`** (singular): one card with Consumed (W) + "Acts as light switch" + "Starts on" (disabled unless light switch). An enable toggle / "+ Power consumer" when null and a remove (×) when present. No "+ Consumer" repeat button.
- Keep it inside `PowerSection` (`:584`).
- Add inline help: "A Part has a single light switch; it toggles **all** of this part's lights and glow in flight." (analysis §4-5.)

### Phase 7 — SubPart lights: retain + clarify (no model change)
- Keep `SubPartGameData.lights: Light[]` and the `LightsSection` editor.
- UX clarity in `LightsSection` (`GameDataSections.tsx:279`): a one-line note "Applies to **every** placed instance of this SubPart; each instance aims the light by its own rotation." (This is KSA's per-template behavior — analysis §1.1/§5.1 — not a bug.)
- (Optional, can defer) a 3D aim gizmo for the Spot cone, mirroring the existing pose/axes tooling ([[project_animation_editor_ux]]). Out of scope for this cleanup unless cheap.

### Phase 8 — Validation / warnings (lightweight, surfaced in the part UI)
Compute from `part.gameData.powerConsumer` + `part.subPartGameData[*].lights` (over placed templates):
- **Lights but no switch** → info: "These lights are always on in flight (no light switch on the part)." (analysis §8.1).
- **Light switch but no `<Light>` subparts and no emissive glow meshes** → warn: "Light switch controls nothing." (cross-check `part.customMeshes[*].emissive`).
- Multiple switches is now structurally impossible — the warning that would have caught the original bug is replaced by the model itself.

### Phase 9 — Tests
- `src/ksa/partXmlSerializer.test.ts`: (a) one `<PowerConsumer>` emitted with `LightSwitch`/`LightIsActive` attrs; (b) a SubPart with **only** a `<Light>` is emitted under `<SubPartGameData>` with matching `Id`; (c) Spot emits Inner/Outer angles, Point omits them; (d) `<Transform>` omits `<Scale>` for lights.
- `src/ksa/partXmlParser.test.ts`: parse a `<PartGameData>` with one consumer → single field; parse two consumers → keeps the `LightSwitch` one + warns.
- `src/ksa/modExport.test.ts`: end-to-end — a custom light SubPart yields aligned ids across Part `InstanceOf` / `<SubPartGameData Id>` / Assets `<SubPart Id>`, and the `<Light>` is present in the GameData XML.
- `src/state/projectCodec.test.ts`: round-trip a part with a light-switch consumer + a subpart light.

### Phase 10 — Docs / scope sync
- Update `scope/gamedata-modules.md` (`:19,:31,:54`) to describe `powerConsumer` as a single per-part field and note the one-switch rule (AGENTS.md mandates scope stays in sync — [[project_scope_catalog]]).
- Cross-link `analysis/HOW_LIGHT_PARTS_WORK.md` from the `PartGameData`/`Light` JSDoc.

---

## 5. Files to touch

| File | Phase | Change |
| --- | --- | --- |
| `src/ksa/types.ts` | 1 | `powerConsumer: PowerConsumer \| null`; `createPowerConsumer`; JSDoc |
| `src/ksa/partXmlParser.ts` | 2 | keep one consumer (prefer `LightSwitch`), warn on >1 |
| `src/ksa/partXmlSerializer.ts` | 3 | emit single `<PowerConsumer>` |
| `src/state/projectCodec.ts` | 4 | single optional `pc` |
| `src/state/editorStore.ts` | 5 | single-consumer mutators; fix merge path (`:589`) |
| `src/ui/GameDataSections.tsx` | 6,7,8 | singular consumer card; subpart-light note; validation |
| `src/ui/ManageTanksModal.tsx` | 7 | (only if note rendered here) |
| `src/ksa/*.test.ts`, `src/state/projectCodec.test.ts` | 9 | tests |
| `scope/gamedata-modules.md` | 10 | scope sync |

SubPart `<Light>` emission code (`partXmlSerializer.ts:222-242,298-328`) is **unchanged** — it is already correct.

---

## 6. Anatomy of a flexo "light part" (recipe the cleaned-up UI should make obvious)

A complete custom light part = three independently-authored pieces, all tied together by KSA's single switch:

1. **The glow** (optional, visual): a custom mesh with an **emissive** texture (existing glow pipeline). This is the bulb/lens that lights up. Gated by the switch via `StateBitFlag` bit `0x40` (analysis §5.2-5.3).
2. **The cast light** (optional, illuminates the scene): a `<Light>` on the mesh's **SubPart** (`LightsSection`). A `Spot` aims along the SubPart instance's local +X; reposition/re-aim via the light `Transform` (analysis §5.1).
3. **The switch** (one per part): a single `<PowerConsumer LightSwitch="true">` (`PowerConsumerSection`). Toggles #1 and #2 together in flight; `LightIsActive` sets the initial state. Omit it → lights are always on, no checkbox (analysis §8.1).

For **independent** switches, the part must be split into **separate exported Parts** — there is no single-Part XML that yields more than one working switch (analysis §7).

---

## 7. Risks & out of scope

- **Breaking persisted projects:** the `powerConsumers[]`→`powerConsumer` change invalidates the old codec shape. Acceptable and intended under [[feedback_no_data_migration]] (boot-time `projectStore` purge handles stale data; do **not** write conversion code).
- **Project export/import** ([[project_project_export_import]]) uses the same codec — its tests must move to the single field too (Phase 9).
- **Out of scope:** per-instance (vs per-template) lights — KSA keys lights on the SubPart template, so all instances share them (analysis §1.1); modelling per-instance lights would need distinct templates and is not a KSA capability worth emulating. The 3D Spot-cone aim gizmo (Phase 7) is optional.
- **Not a game-contract change:** the emitted XML grammar is unchanged (still `<PowerConsumer>` / `<Light>`); only flexo's internal multiplicity changes. No new `GAME_UPDATE_CHECKLIST` item — just the scope-doc wording (Phase 10).

---

## 8. Verification

- `pnpm test` (serializer/parser/codec/modExport suites above) — run **bare**, no pipes ([[feedback_flexo_tooling]]).
- `pnpm lint` (oxlint) clean.
- Browser check (project-local Playwright, base path `/flexo/` — [[feedback_browser_verification]]): add a custom mesh, give its SubPart a `<Light>`, enable the part light switch, export the mod zip, confirm the GameData XML contains one `<PowerConsumer LightSwitch="true">` and a `<SubPartGameData>` with the `<Light>`.
- Final ground truth: load the mod in KSA and confirm a **single** "Light Switch" checkbox toggles the part's light + glow.
