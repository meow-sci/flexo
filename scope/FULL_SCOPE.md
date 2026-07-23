# flexo ↔ KSA integration scope

This folder is the **authoritative catalog of every point where flexo depends on the Kitten
Space Agency (KSA) game** — the exact game classes, asset-XML schemas, file conventions, math
constants, and renderer quirks flexo bakes in. Its purpose is single: **when KSA ships an
update, this is the checklist you diff against to find what breaks flexo.**

- For _how flexo works internally_, see [`docs/`](../docs). This folder is the opposite view:
  the **contract with the game**, i.e. the break-surface.
- To vet a new game build, follow [GAME_UPDATE_CHECKLIST.md](GAME_UPDATE_CHECKLIST.md).
- Open gaps from the last update are tracked in
  [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

> **Keep this current.** Per [AGENTS.md](../AGENTS.md), any change to a flexo↔game integration
> point (XML schema read/written, ported math, asset/mesh/material naming, mod-export format,
> coordinate mapping, renderer-quirk workaround) MUST update the relevant `scope/*.md` in the
> same change. A new integration ⇒ a new `scope/*.md` + a row in the map below.

---

## Baseline game version

|                      | Build           | Path                                                                                                                                                             |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verified against** | `2026.7.8.4980` | `/Users/asherwin/repos/meow-sci/ksa-game-assemblies/current` (decomp @ 4980, commit `cdb7391`) + `flexo-private-assets/assets` (Core XML @ 4980, re-encoded)     |
| Previous baseline    | `2026.7.6.4939` | `ksa-game-assemblies` git commit `2423a02` + the `flexo-private-assets_prev` dir copy (diff decomp via git history; the mirror \_prev copies go stale over time) |

Each snapshot holds `decomp/` (decompiled C#; schema lives in `[XmlType]`/`[XmlElement]`/
`[XmlAttribute]` + public fields), `Content/Core/` (the shipped game-data XML + GLSL shaders),
and `version.json` (a commit-by-commit changelog — the fastest first read on any update).

> **4980 review method.** Full `4939 → 4980` diff via **git history inside `ksa-game-assemblies`**
> (`git diff 2423a02 cdb7391`) + `diff -rq` of the two private-mirror `assets/` trees;
> `version.json` @ 4980 documents revs 4940–4978. The update is HUD layouts, the burn-UI gauge
> rework, navball markers, screenshots, terrain **texture streaming**, cascaded-shadow
> specialization constants, and vehicle-runtime work (docking frame fixes, undock naming, fuel
> flow-rule persistence, sequence Δv rework) — almost entirely outside flexo's surface.
> **Zero part-template/GameData/engine/animation schema drift**: no `*Template.cs`, unit
> reference, ported-physics, or `KeyframeAnimation*` class changed; the shipped part XML is
> content-identical (8 mirror files differ only in CRLF line endings — sync artifact; fixtures
> unaffected). Contract mechanics that MOVED but held: root-identity pin consolidated into
> `PartTree.NormalizeRootRotation()`; `Part.Connector.ConnectAndMerge` rewritten (same 180°-Z
> mate contract). Save-side-only schema: `ControlData.VehicleName`, `FlightComputerData.RCSMode`
> (+ RollMode default `Up`→`Decoupled`), `EngineController.SaveData.FlowRule` (default flow rule
> flipped to `FurtherestToNearestSameStage`), docking `PreDockRootTransform`. One data-side
> delta handled: new **`TextureCategory.TerrainHeight`** — Core retagged height-affecting
> celestial textures, and the cartoon-moon scaffold's Luna block was retagged to match (see
> [ground-clutter.md](ground-clutter.md#what-changed-in-4980)). No new integration surfaces;
> the 4939 OPEN gaps (geometry `<Collider>`, part-level `<Tank>`, FuelPort, clutter LOD retune)
> carry forward. All areas re-verified **INTACT/CURRENT**.
>
> **4939 review method.** Full `4892 → 4939` diff via **git history inside `ksa-game-assemblies`**
> (`git diff 7cf5c0a 2423a02`); `version.json` @ 4939 documents the whole rev range 4893–4939.
> The bulk of the update is rendering (screenspace particles, volumetric plume trails, clutter
> culling) and vehicle-runtime work (fuel lines/ports, tank transfer, sequence UI) — outside
> flexo's part-template scope. Real contract deltas, all handled: **`<PlumeTrail Id>`** on
> `RocketNozzleTemplate` (new `[XmlElement]`; Core now sets `DefaultEngine` on every main
> engine — modeled in flexo, see [engines.md](engines.md#what-changed-in-4939)); new
> **`Booster` editor tag** (registry snapshot refreshed); new asset packs
> **CoreFuelTankB** (bays) / **CorePropulsionC** (large SRBs, GameData unconfigured) added to
> `ASSET_FILES`; **tank GameData relocated** from SubPart-level entries in `PartGameData.xml`
> to Part-LEVEL `<Tank>` entries in `CoreFuelTankAGameData.xml` (flexo doesn't model part-level
> tanks — passthrough preserves them; fixtures re-synced); `<SymmetryGroup>` GameData sugar for
> connector `<Sibling>` (passthrough-safe; `[XmlElement("Sibling")]` schema unchanged); first
> **geometry-template `<Collider>`** children on 2 CoreElectricalA prefabs + 2 solar-cell
> SubParts (NOT passthrough-covered — recorded gap, see
> [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)); new `FuelPort`
> GameData module (passthrough-safe, opaque to the editor). `VolumeReference` XML schema
> unchanged (display-only liters rework). Animation, kittens, custom-assets/mod-export,
> connectors/coords/IVA, clutter schema all re-verified **INTACT**.
>
> **4892 review method.** Full `4826 → 4892` diff via **git history inside `ksa-game-assemblies`**
> (`git diff 1265373 7cf5c0a`) — the `_prev` directory was stale (4750), so the last-vetted 4826
> tree came from the repo's own history. `version.json` @ 4892 documents revs 4861–4892 only
> (4827–4860 have no changelog; the file diff is authoritative). Headline: the **rev-4884
> Reactions refactor** (Combustion.xml → Reactions.xml, `<Combustor><Reaction Id>` +
> `<MixtureRatio>`, tank `<RoleAffinity>`) — BREAKING, re-modeled in flexo (see
> [engines.md](engines.md#what-changed-in-4892), [gamedata-modules.md](gamedata-modules.md#what-changed-in-4892))
> — plus the **ground-clutter multi-material schema** (LOD `<Material Id>` refs now REQUIRED —
> the cartoon-moon scaffold was regenerated, see [ground-clutter.md](ground-clutter.md#what-changed-in-4892)).
> Animation, kittens, custom-assets/mod-export, and connectors/coords/IVA re-verified **INTACT**.
> New vehicle-level systems (fuel links, sequence performance, resource groups) are save-state,
> not part-template surfaces — no new scope rows needed.
>
> **4826 review method.** Full `4750 → 4826` **decomp diff** (`ksa-game-assemblies` @ 4826 vs
> `ksa-game-assemblies_prev` @ 4750) + shipped-Core-XML diff. (An early pass mistook a stale
> checkout for "no 4826 decomp"; the decomp _is_ at 4826 and every finding below was re-verified
> against the actual C#.) The 4826 `version.json` only documents revs 4824→4826 (terrain-perf); the
> real 4751→4826 delta was recovered from the decomp + XML diffs, not the changelog. The new
> `<Sibling>`/`<Aligned>` are the game's new **part-symmetry** system (`Connector.SymmetrySiblings`
> = `[XmlElement("Sibling")] List<ConnectorReference>`; `PartTemplate.Aligned` = `List<AlignedConnectorsRef>`);
> the runtime `PartSymmetryInstance`/`SymmetryLayerInstance` classes are **vehicle-assembly / save
> state, outside flexo's part-template scope** — only the connector-level template hints reach flexo.

---

## The one cross-cutting invariant (read first)

**flexo rebuilds a fresh `<Assets>` document from a typed model — it is not a byte-faithful
editor.** Its parsers read a fixed allow-list into typed objects; its serializers emit only what
they know. **As of gap 6 (2026-06-27) `<PartGameData>`/`<SubPartGameData>` are passthrough-safe:**
their unmodeled child elements + root attributes are captured (`RawXmlNode`) and re-emitted verbatim
(so `<Collider>` et al. survive). Everywhere ELSE — the geometry `<Part>`, `<SubPart>` templates,
other top-level `<Assets>` children — an unmodeled element is still silently dropped on the next
import → export (it rarely _crashes_ flexo; it just disappears). Every update review must still
check for _added_ schema outside the GameData child/attr surface, not just _changed_ schema. Full
detail: [part-and-subpart-xml.md](part-and-subpart-xml.md#-master-invariant--flexo-rebuilds-a-fresh-dom-now-with-gamedata-passthrough).

---

## Integration map (at a glance)

Status reflects the `4826 → 4892` review. 🔴 breaking · 🟡 missing/drift · 📝 docs · ✅ intact.

| Area                                                                                      | Detail doc                                                         | Primary game anchors                                                                                                                                                       | 4892 status                                                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Part / SubPart XML structure, catalog, editor tags, part size                             | [part-and-subpart-xml.md](part-and-subpart-xml.md)                 | `PartTemplate.cs`, `Part.cs`, `EditorTagDefinition.cs`, `*Assets.xml`/`*GameData.xml`, `CoreEditorTagsGameData.xml`                                                        | ✅ intact (dead part-level `Tank` removed; fixtures re-synced)                   |
| GameData module blocks (mass, electrical, tanks, decoupler, docking port, control, light) | [gamedata-modules.md](gamedata-modules.md)                         | `BatteryTemplate.cs`, `DockingPortTemplate.cs`, `EnergyReference.cs`/`PowerReference.cs`/`ImpulseReference.cs`, `ControlTemplate.cs`                                       | ✅ tank `<RoleAffinity>` modeled — FIXED (replaced `<CombustionProcess>`)        |
| Engines (thrust/Isp physics, reactions)                                                   | [engines.md](engines.md)                                           | `DeLavalNozzleConfig.cs`, `FixedReactionTable.cs`/`MixtureReactionTable.cs`, `ReactionTemplate.cs` family, `RocketControllerData.cs`, `EngineDesigner.cs`, `Reactions.xml` | 🔴→✅ Reactions refactor re-modeled — FIXED                                      |
| Animation (keyframe import/export)                                                        | [animation.md](animation.md)                                       | `KeyframeAnimationData.cs`, `KeyframeAnimationModule.cs`, `Animations/*.glb`                                                                                               | ✅ intact (rev-4875 refactor is skeletal-only)                                   |
| Kittens (Character rendering, editor-only)                                                | [kittens.md](kittens.md)                                           | `CharacterAssets.xml`, `KittenRenderable.cs`, `CharacterRenderResources.cs`, `ModelTranslucent.frag`                                                                       | ✅ intact (Characters/ untouched)                                                |
| Custom assets, textures, GLB, mod export                                                  | [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md) | `ThumbnailRenderResources.cs`, `Mod.cs`/`ModLibrary.cs`/`AssetBundle.cs`, `PbrMaterialReference.cs`, `MeshAtlasFileReference.cs`, `mod.toml`                               | ✅ intact (4826 MeshReference watch-item closed: clutter-only)                   |
| Connectors, coordinates, IVA/NotIVA                                                       | [connectors-coordinates-iva.md](connectors-coordinates-iva.md)     | `Part.Connector`, `QuaternionEx.cs`/`Double3Ex.cs`, `VehicleEditor.cs`, `PartModelModule.cs`, `DockingPortTemplate.cs`                                                     | ✅ intact (+X-up re-confirmed; fuel links = save state)                          |
| Ground clutter (data-only celestial mod)                                                  | [ground-clutter.md](ground-clutter.md)                             | `GroundClutterReference.cs` + 6 sibling schema classes                                                                                                                     | 🔴→✅ LOD `<Material Id>` refs — scaffold regenerated (in-game re-check pending) |

### Open gaps from 4892 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

All four 4892 gaps are **✅ FIXED** (per the no-migration rule; detail + game-side evidence in the
plan and the per-area docs): **(A)** the Reactions refactor — `Combustion.xml`/`<CombustionProcess>`
→ `Reactions.xml`/`<Reaction Id>`+`<MixtureRatio>`, flexo re-modeled end-to-end
([engines.md](engines.md#what-changed-in-4892--the-reactions-refactor-rev-48844885));
**(B)** tank `<CombustionProcess>` → `<RoleAffinity>`
([gamedata-modules.md](gamedata-modules.md#what-changed-in-4892)); **(C)** ground-clutter LOD
`<Material Id>` references now REQUIRED — cartoon-moon regenerated
([ground-clutter.md](ground-clutter.md#what-changed-in-4892), in-game re-check pending);
**(D)** `EngineALargeUpperStage` removed from `VOLUMETRIC_EXHAUST_IDS` (LR91 Dev deleted).
Old persisted projects/exports are intentionally discarded (boot purge + strict export-version
check), never converted.

### Gaps history: 4826 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

All three round-trip-fidelity gaps in flexo's **Part-editor** surface are **fixed** (faithful
preservation, per the no-migration rule), each confirmed against the 4826 decomp. They stem from one
game feature cluster: the new **part-symmetry** system (multi-mount adapter prefabs) + hypergolic
service-module tanks. A fourth item lands only on the separate **ground-clutter scaffold** (below).

1. ✅ **`<Diameter>` repeatable** _(DONE)_ — KSA 2026.7 made `<Diameter>` repeatable so adapter prefabs list every size they bridge (e.g. `<Diameter M="3"/><Diameter M="2"/>`). flexo modeled a single value and dropped the rest; now `PartGameData.diameterM` (editable primary) + `extraDiametersM[]` (preserved) round-trip all of them.
2. ✅ **Tank `<CombustionProcess>`** _(DONE)_ — new `<CombustionProcess Id/>` child of `<SphericalTank>` declares the propellant a hypergolic tank holds. flexo rebuilds tanks from a typed model, so it dropped the child; now `Tank.combustionProcessId` parses/emits it.
3. ✅ **Connector `<Sibling>` + GameData `<Aligned>`** _(DONE)_ — new attach-node symmetry grouping. Decomp: `Connector.TemplateBase.SymmetrySiblings` (`[XmlElement("Sibling")] List<ConnectorReference>` → `<Sibling Id/>`) + `PartTemplate.Aligned` (`AlignedConnectorsRef` → `<Aligned><ConnectorRef Id/></Aligned>`). `<Aligned>` (GameData) survives via the `RawXmlNode` passthrough, with its `<ConnectorRef>` ids now remapped through the regenerated connector ids on import/paste (`remapRawConnectorRefs` — verbatim re-emit left them stale after renumbering); `<Sibling>` (geometry `<Connector>` child) was dropped — now `Connector.siblingIds[]` preserves it (same remap).

4. 🟡 **Ground-clutter LOD mesh → atlas** _(WATCH — scaffold only, no flexo source)_ — `GroundClutterLodReference.MeshFileReference` changed type `MeshFileReference` → `MeshAtlasFileReference` and its single `Mesh` became a `Meshes` list (loads ALL meshes in the referenced GLB, skipping `_`-prefixed nodes). The `<Mesh Id=… Path=…/>` element + attrs are **unchanged** (both inherit `FileReference`), so `ksa-mods/cartoon-moon/` still _parses_, but its per-LOD single-card semantics shifted (mesh id now comes from the GLB node name, not `<Mesh Id>`). No flexo core-editor code involved; **re-verify the cartoon-moon mod in-game** before relying on it. Detail: [ground-clutter.md](ground-clutter.md#what-changed-in-4826).

**Not gaps (decomp-verified intact):** engines — `RocketControllerData.cs` changed only `GetAllRocketTemplates` (List→`Span`/`ArrayPool` perf); the thrust/Isp math + `DeLavalNozzleConfig`/`CombustorConfig`/`CombustionTable`/`Combustion.xml` are byte-identical. `PowerReference.cs` only added a `ToNearest` display formatter (tokens/scales unchanged). `Decoupler.cs` changed runtime deactivation (not schema). `KeyframeAnimationModule.cs` only added symmetry-mirroring (`ApplyToMirroredParts`), no schema change. `PbrMaterialReference.cs` unchanged (null-deref gotcha holds). `MeshReference`/`MeshAtlasFileReference` gained multi-primitive **runtime** fields (no `[XmlElement]`) — watch the custom-asset GLB node→SubPart mapping, but flexo's single-primitive exports are unaffected. Fuel-tank `<PartModel>`→`<PartModelDynamic>` + `TFI_Heat` + `<ThinFilm>` (thermal-FX; `catalog.ts:156` already reads either tag). Solar-cell `<Produced W>` 50→100 (data). `CoreIVASpaceAGameData.xml` diff (line-ending only). Runtime `PartSymmetryInstance`/`SymmetryLayerInstance` — vehicle-assembly/save state, out of flexo scope.

---

## Cross-cutting environmental notes

- **OSS / asset availability.** Licensed binaries (kitten characters, `Animations/*.glb`, some
  textures) plus `Reactions.xml` are not in every checkout — flexo serves them from
  its private asset mirror (`flexo-private-assets`, served at `/ksa/` by `vite/ksaAssets.ts`).
  After a game update, re-run `scripts/copy-ksa-assets-to-private-repo.ts` so the editor reads
  the new catalog. Some contracts (e.g. an animation clip's GLB node structure) can only be
  verified against that mirror, not the decomp snapshots.
- **Decompiler noise.** Across this build, many "diffs" are pure decompiler artifacts —
  `"x".AsSpan()`→`"x"`, `Log.Warning($"…")`→`LogString<Warning>` interpolation handlers,
  `Brutal.ShaderCompilerApi`→`Brutal.ShaderCApi`. Always read the actual hunk before treating a
  changed `.cs` as a real change.
