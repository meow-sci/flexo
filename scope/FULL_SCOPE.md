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

|                      | Build           | Path                                                                                                                    |
| -------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Verified against** | `2026.7.3.4826` | `/Users/asherwin/repos/meow-sci/ksa-game-assemblies/current` (decomp @ 4826) + `flexo-private-assets/assets` (Core XML) |
| Previous baseline    | `2026.6.9.4750` | `/Users/asherwin/repos/meow-sci/ksa-game-assemblies_prev/current`                                                       |

Each snapshot holds `decomp/` (decompiled C#; schema lives in `[XmlType]`/`[XmlElement]`/
`[XmlAttribute]` + public fields), `Content/Core/` (the shipped game-data XML + GLSL shaders),
and `version.json` (a commit-by-commit changelog — the fastest first read on any update).

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

Status reflects the `4750 → 4826` review. 🔴 breaking · 🟡 missing/drift · 📝 docs · ✅ intact.

| Area                                                                                      | Detail doc                                                         | Primary game anchors                                                                                                                         | 4826 status                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Part / SubPart XML structure, catalog, editor tags, part size                             | [part-and-subpart-xml.md](part-and-subpart-xml.md)                 | `PartTemplate.cs`, `Part.cs`, `EditorTagDefinition.cs`, `*Assets.xml`/`*GameData.xml`, `CoreEditorTagsGameData.xml`                          | ✅ `<Diameter>` now repeatable — FIXED (see gaps) |
| GameData module blocks (mass, electrical, tanks, decoupler, docking port, control, light) | [gamedata-modules.md](gamedata-modules.md)                         | `BatteryTemplate.cs`, `DockingPortTemplate.cs`, `EnergyReference.cs`/`PowerReference.cs`/`ImpulseReference.cs`, `ControlTemplate.cs`         | ✅ tank `<CombustionProcess>` modeled — FIXED     |
| Engines (thrust/Isp physics, combustion)                                                  | [engines.md](engines.md)                                           | `DeLavalNozzleConfig.cs`, `CombustionTable.cs`, `RocketControllerData.cs`, `EngineDesigner.cs`, `Combustion.xml`                             | ✅ intact (Combustion.xml byte-identical)         |
| Animation (keyframe import/export)                                                        | [animation.md](animation.md)                                       | `KeyframeAnimationData.cs`, `KeyframeAnimationModule.cs`, `Animations/*.glb`                                                                 | ✅ intact (no schema/clip change)                 |
| Kittens (Character rendering, editor-only)                                                | [kittens.md](kittens.md)                                           | `CharacterAssets.xml`, `KittenRenderable.cs`, `CharacterRenderResources.cs`, `ModelTranslucent.frag`                                         | ✅ intact (Characters/ untouched)                 |
| Custom assets, textures, GLB, mod export                                                  | [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md) | `ThumbnailRenderResources.cs`, `Mod.cs`/`ModLibrary.cs`/`AssetBundle.cs`, `PbrMaterialReference.cs`, `MeshAtlasFileReference.cs`, `mod.toml` | ✅ intact (fuel-tank thermal FX read by ref)      |
| Connectors, coordinates, IVA/NotIVA                                                       | [connectors-coordinates-iva.md](connectors-coordinates-iva.md)     | `Part.Connector`, `QuaternionEx.cs`/`Double3Ex.cs`, `VehicleEditor.cs`, `PartModelModule.cs`, `DockingPortTemplate.cs`                       | ✅ `<Sibling>`/`<Aligned>` preserved — FIXED      |
| Ground clutter (data-only celestial mod)                                                  | [ground-clutter.md](ground-clutter.md)                             | `GroundClutterReference.cs` + 6 sibling schema classes                                                                                       | 🟡 clutter-LOD mesh → atlas (re-verify scaffold)  |

### Open gaps from 4826 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)

All three round-trip-fidelity gaps in flexo's **Part-editor** surface are **fixed** (faithful
preservation, per the no-migration rule), each confirmed against the 4826 decomp. They stem from one
game feature cluster: the new **part-symmetry** system (multi-mount adapter prefabs) + hypergolic
service-module tanks. A fourth item lands only on the separate **ground-clutter scaffold** (below).

1. ✅ **`<Diameter>` repeatable** _(DONE)_ — KSA 2026.7 made `<Diameter>` repeatable so adapter prefabs list every size they bridge (e.g. `<Diameter M="3"/><Diameter M="2"/>`). flexo modeled a single value and dropped the rest; now `PartGameData.diameterM` (editable primary) + `extraDiametersM[]` (preserved) round-trip all of them.
2. ✅ **Tank `<CombustionProcess>`** _(DONE)_ — new `<CombustionProcess Id/>` child of `<SphericalTank>` declares the propellant a hypergolic tank holds. flexo rebuilds tanks from a typed model, so it dropped the child; now `Tank.combustionProcessId` parses/emits it.
3. ✅ **Connector `<Sibling>` + GameData `<Aligned>`** _(DONE)_ — new attach-node symmetry grouping. Decomp: `Connector.TemplateBase.SymmetrySiblings` (`[XmlElement("Sibling")] List<ConnectorReference>` → `<Sibling Id/>`) + `PartTemplate.Aligned` (`AlignedConnectorsRef` → `<Aligned><ConnectorRef Id/></Aligned>`). `<Aligned>` (GameData) already survives via the `RawXmlNode` passthrough; `<Sibling>` (geometry `<Connector>` child) was dropped — now `Connector.siblingIds[]` preserves it (remapped through regenerated connector ids on import/paste).

4. 🟡 **Ground-clutter LOD mesh → atlas** _(WATCH — scaffold only, no flexo source)_ — `GroundClutterLodReference.MeshFileReference` changed type `MeshFileReference` → `MeshAtlasFileReference` and its single `Mesh` became a `Meshes` list (loads ALL meshes in the referenced GLB, skipping `_`-prefixed nodes). The `<Mesh Id=… Path=…/>` element + attrs are **unchanged** (both inherit `FileReference`), so `ksa-mods/cartoon-moon/` still _parses_, but its per-LOD single-card semantics shifted (mesh id now comes from the GLB node name, not `<Mesh Id>`). No flexo core-editor code involved; **re-verify the cartoon-moon mod in-game** before relying on it. Detail: [ground-clutter.md](ground-clutter.md#what-changed-in-4826).

**Not gaps (decomp-verified intact):** engines — `RocketControllerData.cs` changed only `GetAllRocketTemplates` (List→`Span`/`ArrayPool` perf); the thrust/Isp math + `DeLavalNozzleConfig`/`CombustorConfig`/`CombustionTable`/`Combustion.xml` are byte-identical. `PowerReference.cs` only added a `ToNearest` display formatter (tokens/scales unchanged). `Decoupler.cs` changed runtime deactivation (not schema). `KeyframeAnimationModule.cs` only added symmetry-mirroring (`ApplyToMirroredParts`), no schema change. `PbrMaterialReference.cs` unchanged (null-deref gotcha holds). `MeshReference`/`MeshAtlasFileReference` gained multi-primitive **runtime** fields (no `[XmlElement]`) — watch the custom-asset GLB node→SubPart mapping, but flexo's single-primitive exports are unaffected. Fuel-tank `<PartModel>`→`<PartModelDynamic>` + `TFI_Heat` + `<ThinFilm>` (thermal-FX; `catalog.ts:156` already reads either tag). Solar-cell `<Produced W>` 50→100 (data). `CoreIVASpaceAGameData.xml` diff (line-ending only). Runtime `PartSymmetryInstance`/`SymmetryLayerInstance` — vehicle-assembly/save state, out of flexo scope.

---

## Cross-cutting environmental notes

- **OSS / asset availability.** Licensed binaries (kitten characters, `Animations/*.glb`, some
  textures, sometimes `Combustion.xml`) are not in the decomp snapshots — flexo serves them from
  its private asset mirror (`flexo-private-assets`, served at `/ksa/` by `vite/ksaAssets.ts`).
  After a game update, re-run `scripts/copy-ksa-assets-to-private-repo.ts` so the editor reads
  the new catalog. Some contracts (e.g. an animation clip's GLB node structure) can only be
  verified against that mirror, not the decomp snapshots.
- **Decompiler noise.** Across this build, many "diffs" are pure decompiler artifacts —
  `"x".AsSpan()`→`"x"`, `Log.Warning($"…")`→`LogString<Warning>` interpolation handlers,
  `Brutal.ShaderCompilerApi`→`Brutal.ShaderCApi`. Always read the actual hunk before treating a
  changed `.cs` as a real change.
