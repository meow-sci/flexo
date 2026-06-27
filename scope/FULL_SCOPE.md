# flexo ↔ KSA integration scope

This folder is the **authoritative catalog of every point where flexo depends on the Kitten
Space Agency (KSA) game** — the exact game classes, asset-XML schemas, file conventions, math
constants, and renderer quirks flexo bakes in. Its purpose is single: **when KSA ships an
update, this is the checklist you diff against to find what breaks flexo.**

- For *how flexo works internally*, see [`docs/`](../docs). This folder is the opposite view:
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

| | Build | Path |
|---|---|---|
| **Verified against** | `2026.6.9.4750` | `/Users/asherwin/repos/meow-sci/ksa-game-assemblies/current` |
| Previous baseline | `2026.6.8.4680` | `/Users/asherwin/repos/meow-sci/ksa-game-assemblies_2026.6.8.4680/current` |

Each snapshot holds `decomp/` (decompiled C#; schema lives in `[XmlType]`/`[XmlElement]`/
`[XmlAttribute]` + public fields), `Content/Core/` (the shipped game-data XML + GLSL shaders),
and `version.json` (a commit-by-commit changelog — the fastest first read on any update).

---

## The one cross-cutting invariant (read first)

**flexo does not preserve unknown XML.** Its parsers read a fixed allow-list of elements/
attributes into typed objects; its serializers rebuild a brand-new `<Assets>` document and emit
only what they know. **Anything the game adds that flexo doesn't model is silently dropped on the
next import → export.** So a new game element rarely *crashes* flexo — it quietly disappears
from round-tripped parts. Every update review must therefore check for *added* schema, not just
*changed* schema. Full detail: [part-and-subpart-xml.md](part-and-subpart-xml.md#-master-invariant--flexo-does-not-preserve-unknown-xml).

---

## Integration map (at a glance)

Status reflects the `4680 → 4750` review. 🔴 breaking · 🟡 missing/drift · 📝 docs · ✅ intact.

| Area | Detail doc | Primary game anchors | 4750 status |
|---|---|---|---|
| Part / SubPart XML structure, catalog, editor tags, part size | [part-and-subpart-xml.md](part-and-subpart-xml.md) | `PartTemplate.cs`, `Part.cs`, `EditorTagDefinition.cs`, `*Assets.xml`/`*GameData.xml`, `CoreEditorTagsGameData.xml` | 🟡 `<Diameter>` + `<Control>` dropped; tag list stale |
| GameData module blocks (mass, electrical, tanks, decoupler, docking port, control, light) | [gamedata-modules.md](gamedata-modules.md) | `BatteryTemplate.cs`, `DockingPortTemplate.cs`, `EnergyReference.cs`/`PowerReference.cs`/`ImpulseReference.cs`, `ControlTemplate.cs` | 🔴 electrical units + DockingPort schema; 🟡 `<Control>` |
| Engines (thrust/Isp physics, combustion) | [engines.md](engines.md) | `DeLavalNozzleConfig.cs`, `CombustionTable.cs`, `RocketControllerData.cs`, `EngineDesigner.cs`, `Combustion.xml` | ✅ zero math drift |
| Animation (keyframe import/export) | [animation.md](animation.md) | `KeyframeAnimationData.cs`, `KeyframeAnimationModule.cs`, `Animations/*.glb` | ✅ intact (+3 new clips, already supported) |
| Kittens (Character rendering, editor-only) | [kittens.md](kittens.md) | `CharacterAssets.xml`, `KittenRenderable.cs`, `CharacterRenderResources.cs`, `ModelTranslucent.frag` | ✅ intact (shader merge confirms contract) |
| Custom assets, textures, GLB, mod export | [custom-assets-and-mod-export.md](custom-assets-and-mod-export.md) | `ThumbnailRenderResources.cs`, `Mod.cs`/`ModLibrary.cs`/`AssetBundle.cs`, `PbrMaterialReference.cs`, `MeshAtlasFileReference.cs`, `mod.toml` | ✅ intact (2 watch-items) |
| Connectors, coordinates, IVA/NotIVA | [connectors-coordinates-iva.md](connectors-coordinates-iva.md) | `Part.Connector`, `QuaternionEx.cs`/`Double3Ex.cs`, `VehicleEditor.cs`, `PartModelModule.cs`, `DockingPortTemplate.cs` | 🔴 DockingPort (shared); 📝 face-snap docs |
| Ground clutter (data-only celestial mod) | [ground-clutter.md](ground-clutter.md) | `GroundClutterReference.cs` + 6 sibling schema classes | ✅ intact |

### Open gaps from 4750 → [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md)
1. 🔴 **Electrical unit refactor** — `Joules`/`Watts` attrs → `J`/`W`; flexo parse + emit both wrong (battery/generator/solar/consumer read/export as 0).
2. 🔴 **DockingPort schema** — attribute-form → child-element form + impulse→energy units; flexo parse + emit both wrong (docking port dropped in-game).
3. 🟡 **`<Diameter>` part size** — new on most parts; flexo drops it (round-trip loss + no VAB size filter).
4. 🟡 **`<Control>` marker** — new on command pods; flexo drops it (re-exported capsule not controllable).
5. 📝 **Editor tags + face-snapping** — refresh `KNOWN_EDITOR_TAGS` from `CoreEditorTagsGameData.xml`; document the data-driven face-snap model.
6. 🧱 **(Architectural, optional)** unknown-element passthrough — would turn every future "added element" from data-loss into harmless round-trip.

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
