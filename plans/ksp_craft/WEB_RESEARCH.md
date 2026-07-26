> Companion reference for [KSP_CRAFT_PLAN.md](../KSP_CRAFT_PLAN.md). Web + cloned-source research (B9PartSwitch, ModuleManager, UnityGLTF clones under .tmp-repos/) dated 2026-07-26; every claim carries a source + confidence rating.

# Web research: KSP .craft + .mu + GameData cfg → glTF/GLB converter (TypeScript / Node 24)

Research date: 2026-07-26. Confidence scale: **high** = primary source (source code, spec text, changelog, real data files) read directly; **med** = credible secondary (known modder statement, API doc mirror, README of widely-used tool); **low** = inference / uncorroborated forum lore.

Cloned/available repos (all under `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/`):

| repo | how obtained | why |
|---|---|---|
| `io_object_mu` | pre-existing clone | taniwha's .mu reader/writer + craft importer — the de-facto .mu spec |
| `Bluedog-Design-Bureau` | pre-existing clone | licensing check + real-world cfg corpus |
| `B9PartSwitch` | `git clone --depth 1 https://github.com/blowfishpro/B9PartSwitch` | item 2 |
| `ModuleManager` | `git clone --depth 1 https://github.com/sarbian/ModuleManager` | item 3 |
| `UnityGLTF` | `git clone --depth 1 --filter=blob:none` (full checkout) | item 8 axis-conversion source |

---

## 1. Prior art: .mu / .craft parsers and converters

**Bottom line: there is no maintained standalone .mu→glTF converter outside the io_object_mu + Blender pipeline. io_object_mu is the only complete third-party .mu implementation, and it was already cloned locally, so no additional prior-art clones were needed.**

- **taniwha/io_object_mu** — https://github.com/taniwha/io_object_mu — "mu.py is the main workhorse: it reads and writes .mu files. It is independent of blender" (README.md). Local path: `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/io_object_mu`. Key files skimmed: `mu.py` (complete binary format: magic `76543`, `FILE_VERSION = 5`, every entry type enum `ET_*` at `mu.py:24-60`), `import_craft/part.py` + `import_craft/import_craft.py` (craft assembly incl. scale rules), `import_mu/textures.py` (MBM header, DDS flip, extension fallback), `export_mu/animation.py` + `import_mu/animation.py` (Unity animation property paths + tangent math). **Confidence: high** (source read directly). This is the de-facto format spec; the README warns "vertex tangents are broken (they are incorrectly treated as quaternions)" — read tangents as float4, not quaternion, in our port.
- **KSP itself parses .mu at runtime** via `PartReader` (namespace `PartTools`/`PartToolsLib` in Assembly-CSharp) — the load-time counterpart of PartTools' PartWriter; forum posts reference `PartReader.ReadAnimation` in part-loading stack traces (https://forum.kerbalspaceprogram.com/topic/89242-help-part-tools-model-compilingunity/ search snippet). The KSPDocsSite API mirror (https://kspmoddinglibs.github.io/KSPDocsSite/) documents runtime classes but I found no PartReader page (404). **Confidence: med** for the class name, high for the fact KSP loads .mu at runtime.
- **spencerarrasmith/io_kspblender** — https://github.com/spencerarrasmith/io_kspblender — "KSP .craft Importer Addon for Blender", built on top of io_object_mu (Blender 2.7-era, unmaintained). Superseded by taniwha's own `import_craft/` subpackage (which is newer and already local), so not cloned. **Confidence: high** that it exists/what it is; low value.
- **KerbalX (katateochi)** — craft parsing lives in Ruby: https://github.com/Sujimichi/KerbalX/blob/master/kerbalx_part_mapper.rb (part-name extraction for mod detection, no geometry). KerbalXMod is the in-game C# uploader. **Confidence: high**. Not useful for geometry.
- **JS/TS ecosystem**: `@kspcommunity/craft-file-reader` (https://github.com/kspcommunity/Craft-File-Reader) is a single `index.js` doing line-oriented extraction of ship name/part names only — **not** a real ConfigNode parser (verified by reading `index.js`; it string-splits lines, no nesting). `ksp-sfs-to-json` (https://github.com/gisikw/ksp-sfs-to-json) parses the ConfigNode syntax of sfs/craft into JSON — closest JS prior art for the *syntax* layer only. `jcalero/kerbal-parser` (cfg syntax lib), `rmeno12/craft-parser` (python analysis script). **Confidence: high** (repos inspected/search-verified). Conclusion: our ConfigNode parser is trivial to write fresh; nothing worth vendoring.
- **Blender 5.x compat fork** of io_object_mu exists per search ("compatibility-maintenance port of the legacy io_object_mu addon, updated to work with Blender 5.1") — relevant only as evidence io_object_mu remains the canonical route. **Confidence: med** (search result snippet).
- convert.guru's ".MU Converter" web service (https://convert.guru/mu-converter) — closed-source web wrapper; not analyzable prior art. **Confidence: high it exists, low usefulness.**

## 2. B9PartSwitch semantics (from source, local clone)

All paths relative to `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/B9PartSwitch/B9PartSwitch/`. **Confidence: high throughout (C# read directly).**

### Craft-file persistence — what identifies the chosen subtype
`PartSwitch/ModuleB9PartSwitch.cs:59-69`:
```csharp
[NodeData(name = "currentSubtype", persistent = true)]
public string CurrentSubtypeName
{
    get => subtypes.Count > 0 ? CurrentSubtype?.Name : null;
    private set { int index = subtypes.FindIndex(subtype => subtype.Name == value); ... currentSubtypeIndex = index; }
}
```
→ The MODULE snapshot in a .craft stores **`currentSubtype = <subtype name string>`** (resolved back to an index at load by name match). `currentSubtypeIndex` (`:72-74`) is a `[KSPField]` **without** `isPersistant` (UI only), and `currentSubtypeTitle` (`:76-77`) likewise. Additionally `CustomPartModule.cs:16-17` declares `[NodeData(persistent = true)] public string moduleID;` — when a part has multiple ModuleB9PartSwitch modules, **match craft MODULE snapshots to prefab modules by `moduleID`**, not by order alone (ModuleMatcher.cs handles this in-game).

### SUBTYPE{} keys that matter for visuals (`PartSwitch/PartSubtype.cs:16-119`)
- `name` (subtypeName), `title`, `descriptionSummary/Detail`, `defaultSubtypePriority`.
- **`transform` (repeatable)** → `List<IStringMatcher> transformNames` (`:40-41`). Semantics (`PartSubtype.cs:415-429` + `PartModifiers/TransformToggler.cs`): every model transform whose **name** matches gets a `TransformToggler`; the active subtype's togglers `Activate()` (re-enable GameObject), all *other* subtypes' togglers `Deactivate()` → `transform.Disable()` (SetActive(false)). So: **union of all subtypes' `transform` lists = switchable set; enable only the selected subtype's matches**. There is no `transformDisable` key in SUBTYPE — but see standalone module below.
- **`TRANSFORM{}` blocks** → `TransformModifierInfo.cs:14-25`: `name` (IStringMatcher), `positionOffset` (Vector3, local +), `rotationOffset` (Vector3 **Euler degrees**, applied as `Quaternion.Euler`), `scaleOffset` (Vector3 via ScaleParser). Applied to matching transforms of the *current* subtype.
- **`TEXTURE{}` blocks** → `TextureSwitchInfo.cs:14-30`:
  ```csharp
  [NodeData(name = "currentTexture")] public string currentTextureName;   // filter: replace only where current texture basename matches
  [NodeData(name = "baseTransform")]  public List<IStringMatcher> baseTransformNames; // renderers in children too
  [NodeData(name = "transform")]      public List<IStringMatcher> transformNames;     // renderers on exactly these
  [NodeData(name = "texture")]        public string newTexturePath;      // GameDatabase URL
  [NodeData]                          public bool isNormalMap = false;
  [NodeData(name = "shaderProperty")] public string shaderPropName;
  ```
  Default shader property (`:60-65`): `_BumpMap` if `isNormalMap` else `_MainTex`. If no transform filters → all renderers of the part model. `currentTexture` compares against `texture.name` basename after the last `/` (`:86-90`).
- **`NODE{}` blocks** → `AttachNodeModifierInfo` (attach-node position changes) and **`node` key** → `nodeNames` toggling attach nodes on/off (`PartSubtype.cs:43-44`, applied `:380-402` via `AttachNodeToggler`). Note (blowfish, issue #118 comment): "`NODE {}` doesn't actually affect whether the node is enabled or not… having no `NODE {}` and one without a `position` will have the same effect".
- **No `MODEL` support inside SUBTYPE** — the field list has no MODEL node; model switching is done purely by toggling transforms of models that are all loaded via the part's own `MODEL{}` nodes.
- Non-visual keys we can ignore for rendering: tankType, volume*, addedMass/addedCost, maxTemp, crashTolerance, `MODULE{}` modifier blocks (moduleModifierInfos — module data edits), `mirrorSymmetrySubtype`, `allowSwitchInFlight`.
- Wildcards in all IStringMatcher names (`Utils/StringMatcher.cs`): `*` → `.*`, `?` → `.`, full-string anchored; a string wrapped in `/.../` is treated as a raw regex; leading `\/` escapes a literal `/`.
- **Standalone `ModuleB9DisableTransform`** (`ModuleB9DisableTransform.cs`): cfg module with repeatable `transform = <name>` values; permanently `SetActive(false)` those transforms at load, then removes itself. Our converter must honor it (parts use it to hide stock meshes).

## 3. ModuleManager semantics (from source, local clone)

Paths relative to `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/ModuleManager/ModuleManager/`. **Confidence: high (source read); wiki cross-check** https://github.com/sarbian/ModuleManager/wiki/Module-Manager-Syntax agrees ("Edits the node or value in place if it exists"; `%`: "This will edit the value if it exists, otherwise, it will create new value as though this was an insert"; indexes "Zero-based… negative indexes count backward (-1 = last)").

### Command prefixes (`CommandParser.cs`) — first char of a key/node name
`@` Edit · `%` Replace (create-or-edit) · `-` or `!` Delete · `+` or `$` Copy · `|` Rename · `#` Paste · `*` Special · `&` Create · no prefix = Insert.
**Top-level (root patch) restriction** (`PatchExtractor.cs:52-76`): only Insert, `@`, `+`/`$`, `-`/`!` are legal on root nodes; `% & | # *` are errors at top level (subnode/value-only).

### Value operators (`OperatorParser.cs`) — last char of key, must be preceded by a space
`+`= add, `-`= subtract, `*`= multiply, `/`= divide, `!`= exponentiate (Math.Pow), `^`= regex replace (`FindAndReplaceValue`, MMPatchLoader.cs:1448-1467: value format `^= :regex:replacement:` — first char is the delimiter, sed-style). No trailing-op char (or no preceding space) = plain assign.

### Value command grammar (`MMPatchLoader.cs:570` regex + `:644-861`)
`<cmd><name-with-wildcards>[,<index|*>][\[<posIndex|*>[,<sepChar>]\]] <op>= <value>`
- `,index` selects the index-th matching value (0-based); `,*` = all matches (loop `:746-786`). Negative index supported in `FindValueIn`? — value lookup uses forward scan with decrement (`:1760-1773`), wildcard names allowed; **negative value-indexes are not supported for values** (only for nodes).
- `[i]` addresses element i of a separator-joined "vector" inside the value; default separator `,`, override with `[i,<char>]`; `[*]` = all elements (`FindAndReplaceValue` `:1431-1506`).
- `%key = v` → `RemoveValues(key); AddValueSafe(key, v)` (`:713-737`; no index/wildcard/operators allowed with `%`).
- `&key = v` → add only if `!HasValue(key)` (`:835-859`).
- `!key = whatever` / `-key` → delete; with no index deletes ALL matching (`:789-823`, "Default is to delete ALL values that match. (backwards compatibility)"); wildcard delete loops all matches.
- `@key` edit; `+key` copy-then-edit appends result as new value (`:773-776`).
- `*` Special (`:598-641`): `*key = #$path$`-style assignment where the *target* takes the value found by variable search (also supports arithmetic ops against it).
- `|` on a value inside a node = **node rename** (`:826-832`, `newNode.name = modVal.value`; illegal on root).

### Node command grammar (`MMPatchLoader.cs:871-1093`)
`@NODETYPE[nameWildcard,index]:HAS[...] { ... }` — parse order: strip `:HAS[...]` (`:949-953`), then `,tag` (index or `*`), then `[name]`. Selection (`:976-1003`): `,*` or presence of `:HAS` → iterate ALL matching nodes via repeated `FindConfigNodeIn` + `CheckConstraints`; else single node at index. `FindConfigNodeIn` (`:1712-1758`): node **type** is wildcard-matched too; name matched against the node's `name` value with wildcards; **negative index = from the end** (`nodes[Math.Max(0, nodeCount + index)]`).
- `@` edit in place; `!`/`-` remove; `+`/`$` copy (modified copy appended); `%` = edit first match else create (adds `name = <nodeName>` value automatically, `:1005-1031`); `&` create only if absent (`:1033-1049`); `#nodePath` pastes a node found by path search (`RecurseNodeSearch`), `#...,index` inserts at index; plain `NODE,index {}` inserts at position.
- Insertion into node lists groups by node type (`InsertNode` `:1673-1691`).
- `NODE:HAS[...]` filters: (`CheckConstraints` `:1538-1633`) — `@SUB[name]` has-node (recursive `:HAS` nesting allowed), `!SUB[name]` lacks-node, `#key[value]` has-value (wildcards + `<`/`>` numeric compare in `WildcardMatchValues` `:1635-1654`), `~key[]` key absent / `~key[value]` value-not-equal. Multiple constraints separated by `,` or `&` = AND (`SplitConstraints` `:1515-1534`); OR only via node-name alternation.
- Top-level name selector: `@PART[a|b,c*]` — name field is split on **`,` and `|`** into OR'd wildcard patterns (`NodeMatcher.cs:26` `namePatterns = name.Split(',', '|')`), matched against the `name =` value; top-level node **type** must match exactly (`node.name != type`). Top-level has **no** `,index` addressing (a `,`-segment is treated as another name alternative).

### `#$...$` variable substitution (`ProcessVariableSearch` `:1383-1410`)
Value starting `#` with ≥2 `$`: split on `$`, odd segments are paths resolved by `RecurseVariableSearch` (`:1222+`): `/` path segments, `..` = parent, `@ROOT[name]` jumps to another top-level node, `NODE[name],index/…` node addressing, trailing `key[,index][\[pos\]]` via `parseVarKey` regex `:1219`. Result concatenated back into the value string.

### :NEEDS (`NeedsChecker.cs:46-101`)
Expression split on `,`/`&` → AND groups; each group split on `|` → OR; leading `!` negates. Term true if it case-insensitively matches the **mod list**, or (if it contains `/`) if that GameData directory path exists (`CheckNeedsWithDirectories`). `:NEEDS[...]` is also stripped/evaluated recursively on **every node and value name** inside configs (`CheckNeedsRecursive`).

### Mod list derivation (`ModListGenerator.cs`)
Union of: (1) loaded plugin **assembly names**; (2) every name appearing in a `:FOR[X]` anywhere (`:92-118` — "check for FOR[] blocks that don't match loaded DLLs and add them to the pass list"); (3) **top-level directory names under GameData** (`:120-129`, whitespace removed); (4) names contributed by assemblies via static `ModuleManagerAddToModList()` (`:167+`). Finally `mods.Sort()`. For our offline mini-MM: mod list = GameData subdir names + all `:FOR[]` names (no DLLs).

### THE ORDERING ALGORITHM (`PatchList.cs`, `PatchApplier.cs`) — exact pass structure
1. `:INSERT` — all plain (command-less) nodes are "inserted" first (they define the database).
2. `:FIRST` patches.
3. `:LEGACY` — patches with **no** pass specifier.
4. For **each mod name in case-insensitive sorted order** (`SortedDictionary(StringComparer.InvariantCultureIgnoreCase)`): `:BEFORE[mod]`, then `:FOR[mod]`, then `:AFTER[mod]` (PatchList.cs:110-116). `:BEFORE/:FOR/:AFTER[X]` **require X to be in the mod list** (EnsureMod throws otherwise — but any `:FOR[X]` puts X in the list, so only BEFORE/AFTER of a truly absent mod are dropped; the pass-specifier's `CheckNeeds` drops them gracefully with progress message: see `Patches/PassSpecifiers/*.cs`).
5. `:LAST[mod]` passes in sorted order of mod name — **the mod does *not* need to exist** (separate `lastPasses` dictionary, `PatchList.cs:87-95`).
6. `:FINAL`.
Within a pass, patches run in **GameData file-traversal order** (the order UrlConfigs were enumerated — depth-first alphabetical directory walk). Each patch applies to the entire current database sequentially (`PatchApplier.ApplyPatches`). Pass specifier syntax is parsed case-insensitively in `ProtoPatchBuilder.cs` (`"FIRST"`, `"BEFORE"`, …); duplicate pass specifiers → first wins with warning; `:NEEDS` and `:HAS` allowed once each; `:HAS` on the primary tag also supported.

## 4. Stock ModulePartVariants

- **Craft persistence**: MODULE snapshot stores **`selectedVariant = <variant name string>`**. Verified in a real craft (downloaded https://raw.githubusercontent.com/friznit/Unofficial-Tantares-Wiki/master/%5BSoyuz%5D%20TM.craft, KSP 1.11.1):
  ```
  MODULE {
      name = ModulePartVariants
      isEnabled = True
      useVariantMass = True
      stagingEnabled = True
      selectedVariant = tantares_black
      ...
  }
  ```
  **Confidence: high** (real data). If the key is absent, the part's `baseVariant` (cfg `baseVariant = <name>`, else first variant) applies. (**med** for the fallback rule.)
- **API surface** (KSP API docs mirror https://kspmoddinglibs.github.io/KSPDocsSite/class_module_part_variants.html): `List<PartVariant> variantList` — "The List of available variants in this module (includes the base variant)"; `SelectedVariant` property; `bool useVariantMass`; `useMultipleDragCubes`; `SetVariant(string variantName)` — "Tries to set a variant by name". PartVariant (…/class_part_variant.html): `List<PartGameObjectInfo> InfoGameObjects`, `List<Material> Materials` — "The templetes materials for this part variant. Generated from the Texture node", `UpdateMaterialFromExtraInfo(Material)` — "You can specify a shader, its properties and what material is the target", `UpdateModel(Transform partRoot)`, `DisabledAnimations`/`DisabledEvents`. **Confidence: med-high** (doc mirror of the game API).
- **cfg VARIANT{} syntax** (community-documented; forum "PartVariant Guide" thread https://forum.kerbalspaceprogram.com/topic/173441-partvariant-guide/ is Cloudflare-blocked to fetchers, structure corroborated by search snippets + judicator/SimpleRepaint patches + API fields):
  ```
  MODULE {
    name = ModulePartVariants
    baseVariant = <name>            // optional
    useMultipleDragCubes = false
    VARIANT {
      name = <id>
      displayName = ...
      themeName = ...
      primaryColor = #rrggbb
      secondaryColor = #rrggbb
      sizeGroup = ...               // grouping for editor UI
      mass = / cost =               // additive deltas
      GAMEOBJECTS {                 // mesh toggling: transformName = true|false
        MeshA = true
        MeshB = false
      }
      TEXTURE {                     // per-material texture/shader overrides
        materialName = <material>   // limit to a material (else all)
        mainTextureURL = <GameData URL>
        _BumpMap = <URL>            // arbitrary shader texture properties
        shader = <shader name>      // optional shader swap
        _Color = ...                // shader properties
      }
      NODES { node_stack_top = ... }// attach-node repositioning
      EXTRA_INFO { ... }            // e.g. flag decal transforms
    }
  }
  ```
  Semantics: `GAMEOBJECTS` sets each named transform's GameObject active state to the given bool (names not mentioned keep current state — **best practice is every variant lists all switchable objects**); `TEXTURE` generates a template material ("Generated from the Texture node") copied onto matching renderers. **Confidence: med** (structure), **high** for GAMEOBJECTS=bool-per-transform and TEXTURE/materialName/mainTextureURL keys (multiple corroborating mod patches).

## 5. Craft file semantics

Primary evidence: real craft file (Tantares Soyuz TM, above) + taniwha's working importer (`io_object_mu/import_craft/import_craft.py`). The wiki page `wiki.kerbalspaceprogram.com/wiki/Craft_file` is currently behind an Anubis bot-wall and has **no** Wayback snapshot — could not be cited.

- **`pos` / `rot` are absolute in one common vessel/editor space** — NOT parent-relative. taniwha places every part directly: `part.location = pos - root_pos; part.rotation_quaternion = rot` with all parts siblings under one collection (`import_craft.py:57-66`; root_pos subtraction is only recentering). The VAB origin is at the floor: root part of the sample sits at `pos = 0,15,0`. **Confidence: high.** → Converter: place each PART at (pos, rot) under a vessel root; parenting via `link`/`attN` is irrelevant for visuals.
- **Quaternion component order: x, y, z, w.** Identity serialized as `rot = 0,0,0,1` (sample craft, many parts); `parse_quaternion` (`cfgnode/parser.py:128-131`) reads components in file order x,y,z,w (the swap to Blender w-first + negation is Blender-side handedness conversion). **Confidence: high.**
- **`attPos0`/`attRot0` vs `pos`/`rot`**: Part API docs (KSPDocsSite class_part.html): `attPos0` "Initial/stored attachment position", `attRotation0` "Initial/stored attachment rotation" vs current `attPos`(usually `0,0,0`)/`attRot`. In practice `attPos0 == pos` and `attRot0 == attRot == rot`-at-attach for editor-built craft; they feed re-attachment/offset-gizmo logic. **For visuals use `pos` + `rot` only.** **Confidence: high** for "use pos/rot", med for the exact role description.
- **`mir` (mirror vector)**: sample values `mir = 1,1,1` (normal) / `1,1,-1` (SPH mirror counterpart). Maps to `Part.mirrorVector` (API docs: `Vector3 mirrorVector = Vector3.one`, `bool isMirrored` — "set to true if mirrorVector != Vector3.one", `void SetMirror(Vector3 mirrorVector)`). KSP's editor mirror symmetry is mostly **rotational** ("KSP's 'mirroring' is actually rotational symmetry", 2014 plugin thread — but modern parts *can* opt into real mesh mirroring; `ModuleMirrorPlacement` "implemented on Parts that require rotation changes when being placed in the editor scene in Mirror symmetry mode", KSPDocsSite). io_object_mu **ignores `mir` entirely** and imports look right for stock craft. Recipe: start by ignoring `mir`; if fidelity issues appear on mirrored gear/wings, apply `mir` as part-root localScale (negative-determinant ⇒ flip winding). **Confidence: high** that pos/rot alone reproduce placement for typical craft; **low-med** on exact stock runtime application of mirrorVector to visuals.
- **`symMethod`** = `Radial` | `Mirror` (SymmetryMethod enum; both observed in craft files). `sym = <other part id>` lists symmetry counterparts. Visual no-op. **Confidence: high.**
- **`link` / `attN` / `srfN`** (structure only; visuals don't need them): `link = <partname_id>` child links; stack attach: modern extended format `attN = top,tantares.parachute.s0.1_4291675362_0|0.5|0_0|1|0_0|0.5|0_0|1|0` = `nodeId,partRef_pos_orient_pos0_orient0` with `|`-separated vector components (observed in 1.11.1 craft); legacy short form was `attN = top,partname_id`. Surface attach: `srfN = srfAttach,partname_id[...]`. **Confidence: high** (read from real file) — exact field meaning within the underscore groups **med**.
- **Noise to ignore**: `autostrutMode` (Off/Root/Heaviest/Grandparent/Force*…), `rigidAttachment`, `attm` (attach mode 0 stack/1 srf), `istg/dstg/sqor/sidx/sepI/resPri` (staging), `modCost/modMass/modSize`, `persistentId`, `sameVesselCollision`, `EVENTS{}/ACTIONS{}/PARTDATA{}`, `steamPublishedFileId`, per-craft `OverrideDefault…` blocks. MODULE snapshots matter ONLY for: ModulePartVariants.selectedVariant, ModuleB9PartSwitch.currentSubtype(+moduleID), deploy-state fields of animation modules (e.g. `deployState = EXTENDED`, `currentRotation` on robotics) if we choose to pose them. **Confidence: high** (enumerated from real file).

## 6. PART CFG SCALE RULES (the trap) — final rules for KSP 1.12

Sources, strongest first:
1. **KSP API docs** (KSPDocsSite class_part.html): `float rescaleFactor = 1.25f` — "scale factor that's applied after loading. It rescales the model and any nodes. Use to convert from model space to world space." and `float scaleFactor = 1f` — "scale factor used in the mesh exporter." **[high]**
2. **blowfish** (B9PartSwitch author, decompile-informed) in https://github.com/blowfishpro/B9PartSwitch/issues/118: "So it looks like `Part.scaleFactor` is `scale / rescaleFactor` from the config, and **attach node positions are multiplied by `scale * rescaleFactor`** (assuming that the `scale` appears before that particular stack node)." **[high — named modder, decompile-based]**
3. **jsolson quoting NathanKell**, same thread: "NathanKell claims that `scale` does not rescale the model, just the node positions. `rescaleFactor` does rescale the model, and the nodes (again)." **[med-high]**
4. **Tiberion (via Squad dev C7)**, forum topic 52683 (fetched via Wayback snapshot 20240615215311): "`scale = Z` outside of the MODEL{} node has NOTHING to do with the scale your model appears as… This ONLY affects the positions of Stack nodes and FX offsets" · "The default rescaleFactor is NOT 1.0, it's 1.25." (with in-game screenshot experiment). **[high for these two claims]**
5. **KSP 1.1.0 changelog** (https://pastebin.com/iPfWPF1r): "**Fix bug with rescaleFactor of not 1.0 and MODEL nodes.**" **[high]** — this is the fix for the notorious historical bug: pre-1.1 (0.20–1.0.5), parts using `MODEL{}` needed the community workaround `MODEL.scale = 1/rescaleFactor` because rescaleFactor was effectively applied on top of MODEL scale twice/incorrectly (Tiberion, same thread: "you can correctly use rescale factor by setting your MODEL{} node scale to 1/Y — this is a bug and is hopefully on the chopping block to get fixed"). **Fixed in KSP 1.1.0 (April 2016).**
6. **taniwha's implementation** (`import_craft/part.py:55-70`): defaults `scale = 1.0`, `rescaleFactor = 1.25`; applies `rescaleFactor` as uniform scale on the whole compiled part model; `MODEL{}.scale` applied per-MODEL underneath (`model/model.py:32-59`). **[high]**
7. KSP wiki CFG_File_Documentation (Wayback 2018 snapshot): "The default value for rescaleFactor is 1.25 but can be changed to any value." **[med — community wiki; its MODEL.scale prose is confused, disregard it]**

**FINAL RULES (KSP 1.1 → 1.12), for the converter:**
- `rescaleFactor` — default **1.25** when absent. Applied as a uniform scale on the part's model root. Every mesh: effective scale = `rescaleFactor × MODEL.scale` (component-wise; `MODEL.scale` default `1,1,1`). Legacy `mesh =` parts: effective scale = `rescaleFactor` alone.
- `MODEL {}`: `model` = GameData-relative URL (no extension); `position` (Vector3, default 0,0,0); `rotation` (**Euler degrees, Unity ZXY application order**); `scale` (Vector3 default 1,1,1); `texture = <matchName>,<GameData URL>` replacement pairs; `parent = <transform>` (attach this MODEL under a transform of a previous MODEL). MODEL position/rotation are in the part's model space, i.e. also scaled by rescaleFactor when the root scale is applied above them.
- Legacy top-level `scale` — default **1.0** (taniwha; NOT 1.25). Affects **only attach-node/FX cfg coordinates, never the mesh**.
- Attach nodes (`node_stack_* = px,py,pz, nx,ny,nz[, size]`): world position = cfg vector × `scale` × `rescaleFactor`. Order caveat (blowfish): stock loader applies the `scale` value **as parsed sequentially** — a `scale` line only affects node definitions after it; sane cfgs put scale first.
- Runtime `part.scaleFactor` = `scale / rescaleFactor` (needed only if replicating plugin math). Don't confuse with the prefab default 1.
- We do NOT need to reproduce the pre-1.1 double-application bug; craft built in 1.12 never see it. If a cfg still carries a `MODEL.scale = 0.8`-style compensation it is intentional current data — just apply the plain rules.

## 7. KSP texture loading (GameDatabase)

- **Formats**: `.dds`, `.mbm` (KSP proprietary), `.png`, `.tga`, `.truecolor` (uncompressed png-like), (`.jpg` accepted for generic textures). GameDatabase keys every texture by **extensionless URL** (`GameData/...` path without extension). `GetTexture(string url, bool asNormalMap)` — "Retrieves Texture2D of given url" (KSPDocsSite class_game_database.html). **Confidence: high** for dds/mbm/png/tga; med for truecolor/jpg.
- **Resolution when a .mu references a texture** (mu embeds a filename like `foo.png`... but actually `foo` — MuTexture stores a name that may include an original extension i.e. `model000.dds`): KSP looks up the extensionless URL in the database, so **any on-disk extension satisfies the reference**. io_object_mu's fallback order when the recorded extension is missing on disk: rotate through `[".dds", ".mbm", ".tga", ".png"]` starting at the recorded one (`import_mu/textures.py:79-90`). For duplicate basenames with different extensions, KSP's winner = last one the loader processed (alphabetical iteration) — **[low, don't rely; warn instead]**.
- **MBM header** (`import_mu/textures.py:28-45`): little-endian `int32 ×5`: magic `0x50534b03` ("\x03KSP"), width, height, **bump flag** (1 = normal map — this is the format's own normal-map marker), bpp (32 = RGBA8, 24 = RGB8), followed by raw bottom-up pixel rows. **Confidence: high.**
- **DDS vertical flip**: KSP `.dds` files are stored **vertically flipped relative to their PNG/TGA equivalents**. Evidence: io_object_mu sets `img.muimageprop.invertY = True` for `.dds` only (`textures.py:55-57, 70`); DDS4KSP converter: "TGA and PNG files are flipped automatically during a conversion" (https://github.com/Telanor/DDS4KSP README/search snippet). Direction for us: **after decoding a KSP DDS, flip rows vertically to recover the PNG-oriented image**, then treat all textures identically (glTF UV rule below). **Confidence: high.**
- **Normal-map detection**, three independent signals:
  1. `.mu` material texture slot: `MuTexture.type == 1` (normal) vs 0 (diffuse) — `mu.py:168-179`; also any texture bound to `_BumpMap` in the material (material4 property type 4 texture props). **[high]**
  2. `.mbm` header bump flag = 1. **[high]**
  3. Filename suffix `NRM` — Unity/KSP asset-pipeline convention (see below); io_object_mu additionally heuristics `_n`/`nrm` suffixes (`textures.py:58-59`). **[high for NRM, med for _n]**
- **PNG normal maps get converted at load** (Unity NRM conversion), TextureReplacer README (shaw/ducakar, https://raw.githubusercontent.com/ducakar/TextureReplacer/master/README.md) — verbatim:
  > "Unity uses _grey_ normal maps (RGBA = YYYX) to minimise artefacts when applying DXT5 texture compression on them. When a normal map has a `NRM` suffix Unity converts it from RGB = XYZ (_blue_) to RGBA = YYYX (_grey_) normal map **unless it is in DDS format**. … _Grey_ normal maps can be created by saving the standard _blue_ normal maps as DDS with DXT5nm compression or by manually shuffling channels: RGBA -> GGGR."
  GameDatabase exposes `static Texture2D BitmapToUnityNormalMap(Texture2D tex)` (KSPDocsSite) doing this AG-swizzle for `asNormalMap=true` loads. **Confidence: high.**
- **DXT5nm layout**: X in **alpha**, Y in **green** (R,B garbage/Y-copies). Shader reconstruction (Unity UnpackNormal): `x = 2a−1; y = 2g−1; z = sqrt(max(0, 1−x²−y²))`. **BC5 variant**: X in **red**, Y in **green**, same z reconstruction (KSP 1.x stock shaders accept both via UnpackNormalDXT5nm; BC5 used by some mods; KSP's own loader treats DDS normal maps as pre-swizzled). Converter recipe to glTF (which wants RGB = XYZ "blue" maps): from DXT5nm take (A,G) → (x,y), reconstruct z, emit RGB; from BC5 take (R,G); from "blue" PNG referenced as normal (type-1 slot but three-channel content) pass through; io_object_mu even sniffs pixels to decide if conversion is needed (`textures.py:74-79`). Also remember the DDS row flip happens **before** swizzle. **Confidence: high** on DXT5nm/AG and z-formula (multiple sources: TextureReplacer quote, forum "Converting to DDS turns normal maps pink" thread title corroborates the pink=AG look); **med** on BC5 stock support.

## 8. Unity → glTF conversion conventions

Primary source read from local clone `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/UnityGLTF/Runtime/Plugins/GLTFSerialization/Schema/SchemaExtensions.cs`. **Confidence: high.**

- `SchemaExtensions.cs:16-18`: "multiply by a negative X scale to convert handedness" → `public static readonly GLTF.Math.Vector3 CoordinateSpaceConversionScale = new GLTF.Math.Vector3(-1, 1, 1);`
- `:34`: `public static readonly GLTF.Math.Vector4 TangentSpaceConversionScale = new GLTF.Math.Vector4(-1, 1, 1, -1);`
- Quaternion (`ToGltfQuaternionConvert` `:179-186`): axis = `axisFlipScale * Scale((x,y,z), (-1,1,1))` with `axisFlipScale = -1` (handedness flip) ⇒ **(x, y, z, w)_unity → (x, −y, −z, w)_gltf** (and identically back).
- Matrix (`:193-199`): `unityMat = S · gltfMat · S` with `S = diag(-1,1,1,1)` (similarity transform, self-inverse).
- Positions/normals/translations/morph deltas: componentwise multiply by (−1,1,1) (`ExporterMeshes.cs:260-263`, `:482-524`).
- Triangle winding (`ExporterMeshes.cs:352` → `SchemaExtensions.FlipTriangleFaces` `:689-697`): swap indices 0↔2 of every triangle (**reverse winding**) — required because a single-axis mirror inverts orientation.
- UVs (`ExporterMeshes.cs:274-284` → `FlipTexCoordArrayVAndCopy` `:567-585`): **V′ = 1 − V** ("Flip the V component of the UV (1-V)").
- Tangents: xyz gets the same (−1,1,1) *plus* the w (bitangent sign) negated via TangentSpaceConversionScale = (−1,1,1,−1).
- glTFast contrast (https://github.com/atteneder/glTFast/issues/47): "Initially glTFast simply scaled the root node by -1 in the Z-axis" — glTFast negates **Z** instead of X (their quaternion becomes (−x,−y,z,w)). Both are valid mirror choices; **standard recipe = UnityGLTF's X-negation**:

**RECIPE (Unity/KSP → glTF), the one to implement:**
1. positions, normals, node translations, morph deltas: `x → −x`.
2. quaternions (node rotations, animation rotation keys): `(x,y,z,w) → (x,−y,−z,w)`.
3. node scale: unchanged.
4. matrices: `S·M·S`, `S = diag(−1,1,1)`.
5. triangles: reverse winding (swap first/last index).
6. UV: `v → 1 − v`.
7. tangents: `(x,y,z,w) → (−x,y,z,−w)`.
8. cameras/lights (KSP mu lights): direction vectors get x→−x like normals.

## 9. Unity legacy Animation → glTF

**.mu animation structure** (`io_object_mu/mu.py:363-460`, high confidence): `MuAnimation` = list of `MuClip{name, lbCenter, lbSize, wrapMode, curves[]}` + default `clip` name + `autoPlay` byte. `MuCurve{path, property, type, wrapMode(pre,post), keys[]}`; `MuKey{time, value, tangent[in,out], tangentMode}` — i.e. **Unity `AnimationCurve` Hermite keyframes: (time, value, inTangent, outTangent, tangentMode)**. `curve.path` = slash-separated child path relative to the animated object ("" = itself); `curve.type`: 0 = Transform, 1 = Material, 2 = Light (from `export_mu/animation.py` ctyp column + `mu.py:390-395` bad-export guesser mapping "material" → 1).

**Property paths used by KSP .mu curves** (from `export_mu/animation.py:135-166` and `import_mu/animation.py:30-43`, high confidence):
- Transform: `m_LocalPosition.x|y|z`, `m_LocalRotation.x|y|z|w` (quaternion — animated per-component!), `m_LocalScale.x|y|z`, and the Euler form `localEulerAnglesRaw.x|y|z` (degrees).
- Material: shader property with component suffix, e.g. `_EmissiveColor.r|g|b|a`, `_MainTex.offsetY`, `_Color.a` (importer resolves any non-transform property against the object's material properties, `import_mu/animation.py:62-83`).
- Light: `m_Intensity`, `m_Color.r|g|b|a`.

**Hermite → glTF CUBICSPLINE conversion.** glTF 2.0 spec Appendix C (fetched from https://raw.githubusercontent.com/KhronosGroup/glTF/main/specification/2.0/Specification.adoc, lines 3322-3422, high confidence) — verbatim:
> "let … t_d = t_{k+1} − t_k be the duration of the interpolation segment; t = (t_c − t_k)/t_d be the segment-normalized interpolation factor" · "For each timestamp stored in the animation sampler, there are three associated keyframe values: in-tangent, property value, and out-tangent." (a_k, v_k, b_k)
> `v_t = (2t³ − 3t² + 1)·v_k + t_d(t³ − 2t² + t)·b_k + (−2t³ + 3t²)·v_{k+1} + t_d(t³ − t²)·a_{k+1}`
> "When the animation sampler targets a node's rotation property, the interpolated quaternion MUST be normalized" · "The first in-tangent a_1 and last out-tangent b_n SHOULD be zeros".
Because the evaluator multiplies stored tangents by `t_d` itself, **glTF tangents are value-units per second — exactly Unity's inTangent/outTangent units. The conversion is an identity copy: a_k = inTangent_k, v_k = value_k, b_k = outTangent_k. NO ×dt scaling at export.** (The famous "×(t_{k+1}−t_k)" rule belongs to conversions from normalized-parameter Hermite/Bézier handles, e.g. Blender FCurve handles — see io_object_mu doing exactly that division by fps/dx when converting *Blender handles* to per-second mu tangents, `export_mu/animation.py:117-133` — and to runtimes that pre-scale, e.g. three.js GLTFCubicSplineInterpolant multiplies by t_d at evaluation, matching the spec.) Output element order per sampler keyframe: (in-tangent, value, out-tangent) — spec §animations: "tangents (a_k, b_k) and values (v_k) are grouped within keyframes" (adoc line 2629).
- **Rotation curves**: .mu animates quaternion components independently; sample/convert all four `m_LocalRotation.*` curves on the union of key times, normalize per the spec, and apply the item-8 sign flips (−y, −z) to each key AND its tangents (tangents transform linearly). Watch for sign flips between adjacent keys (q vs −q): enforce dot(q_k, q_{k+1}) ≥ 0 ("exporters SHOULD take care" note, adoc:3414-3419).
- **tangentMode / stepped keys**: `MuKey.tangentMode` is Unity's serialized enum (`mu.py` comment: "editable, smooth, linear, stepped (0..3?)" — in practice PartTools writes 0/10/21 style bitfields; treat it as advisory only, the tangents themselves already encode the shape). A **stepped** segment is expressed with `outTangent = +Infinity` (or `float.PositiveInfinity` on the in-tangent of the next key). Infinity is not storable in glTF: handle by (a) if ALL segments stepped → emit sampler `interpolation: "STEP"`; else (b) replace the infinite tangent pair with two keys epsilon apart (bake the jump) and tangents 0. **[high for the mechanism, med for PartTools' exact tangentMode values]**
- **WrapMode**: `MuClip.wrapMode` / per-curve pre/post wrap use Unity's `WrapMode` enum: Default=0, Once=1, Loop=2, PingPong=4, ClampForever=8. glTF has no wrap semantics — document per-clip wrap as extras (`extras.wrapMode`) and let the player loop. KSP module animations (ModuleAnimateGeneric etc.) drive normalized time explicitly, so Once/ClampForever is the norm. **[high enum values, med KSP usage claim]**

## 10. Licensing

- **BDB** — local clone README.md (quoted verbatim): "Bluedog Design Bureau by Matthew (CobaltWolf) Mlodzienski is licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License." → **CC-BY-NC-SA 4.0** for the art/configs (plugin source under `Source/` may differ per-file — check before redistributing any converted BDB asset; NC bars commercial distribution of conversions; SA applies to derivatives). **Confidence: high.**
- **io_object_mu** — local `COPYING` is the **GPLv2** text ("GNU GENERAL PUBLIC LICENSE Version 2, June 1991") and source headers say "either version 2 of the License, or (at your option) any later version" → **GPLv2+**. **Confidence: high.**
  **Implication for our TS port**: a port written by reading mu.py is a derivative work of GPL code in the copyright-orthodox view. Standard postures: (a) **accept GPLv2+ for the tool** (fine for an internal, never-distributed tool — GPL obligations trigger on distribution; also fine if we're willing to ship the converter itself as GPL); (b) **spec-mediated cleanroom**: one person writes a format spec document from mu.py (facts/format layouts are not copyrightable; the binary layout is dictated by KSP/PartTools anyway, and mu.py itself is an independent reimplementation of Squad's PartReader), another implements from the spec; (c) treat the format knowledge as unprotectable facts and write fresh code without copying expression — defensible but less rigorous than (b). Flag for the plan: decide (a) vs (b) before writing the .mu reader. Output assets converted BY the tool are not GPL-affected (GPL covers the program, not its output).
- **KSP EULA / extracting assets**: KSP is proprietary (Take-Two; Unity assets + GameData). The PD/T2 EULA does not grant redistribution of game assets; personal-use extraction/conversion on the user's own install is the community-tolerated norm (the entire modding/texture-replacement ecosystem depends on reading GameData; Squad historically encouraged mod tooling). **Posture: the tool ships no KSP assets and requires the user to point it at their own install — low risk.** Redistributing converted stock/BDB models is the thing to avoid (stock: EULA; BDB: NC-SA terms). **Confidence: med (legal reading), high (community practice).**

## 11. .mu format documentation & version history

- **The only real documentation is io_object_mu itself** (README: "importing is mostly working"; wiki has usage pages only — no format page: wiki page list fetched 2026-07-26: Home / Animating for KSP / Calc Mu Volume / CraftImport / Installation / ModelingForKSP / Rodger's tips). **Confidence: high.**
- Format versioning (from `mu.py`, high confidence): header = `int32 magic 76543 (MODEL_BINARY)`, `int32 version`, then root object name string. `FILE_VERSION = 5` current; reader accepts 0…5. Version gates in the reader: `version > 0` → MuRenderer gains castShadows/receiveShadows bytes (`mu.py:600-603`); `version > 1` → MuLight gains `spotAngle` (`:904`); `version >= 4` → new material format `read_material4` (shader name string + typed keyed properties: 0 Color,1 Vector,2/3 Float,4 Texture[index,scale,offset]) replacing the old fixed per-shader-enum layouts (`:293-297`, `:195-283`). "mu.py always writes version 5 .mu files" (README).
- **Which KSP/PartTools produced which version** (from taniwha's commit log on mu.py, fetched via GitHub API — dates give the mapping; **confidence: med**):
  - 2013-07-29 "Support version 0 .mu (partially?)" — v0 = earliest PartTools (KSP ~0.15-0.19 era).
  - v1/v2/v3 — incremental PartTools updates through KSP 0.20–1.0 (renderer shadow flags, light spotAngle; "Fix a bunch of versioning errors" 2013-12-21).
  - 2015-11-03 "**Add support for .mu version 4**" + 2015-12-07 "Read mu 3- materials into a mu 4 material object." — v4 = the keyed-material format introduced with the Unity-5 PartTools for KSP 1.1 (bundled prerelease late 2015).
  - 2017-07-02 "**Version is now 5. Dunno what's different.**" — v5 appeared with KSP 1.3-era PartTools (May-July 2017); no structural difference found by taniwha (likely just a bump; vertex-color mesh entry ET_MESH_VERTEX_COLORS=32 exists in the enum).
  - 2020-05-23 "Add a work-around for broken PartTools exports" — the `type == 8` curve bug guard (`mu.py:389-401`): some PartTools builds omitted the curve type int; recover by guessing from path prefix "material". Our parser should replicate this guard.
- PartTools public releases referenced by modders: 0.20, 0.23, "PartTools 1.1" (Unity 5.2.4 for KSP 1.1), later AssetBundle-based "Part Tools" for KSP 1.4+ (Unity 2017) — forum lore, e.g. FASA-RO vendored "PartTools 023" (https://github.com/KSP-RO/FASA-RO/tree/master/Source/Unity%20Projects/FASA_SHARE/Assets/PartTools). **Confidence: med.**
- All stock parts of a modern install are v4/v5; a converter targeting KSP 1.12 GameData + mod DLC needs **v2–v5 read support** to be safe (some mods ship ancient v2 files — e.g. 2013-era mod meshes still in circulation). **Confidence: med.**

---

## Risks / open questions for the plan
1. **ModulePartVariants VARIANT{} exact key set** is the weakest primary sourcing (forum guide unfetchable; structure assembled from mod patches + API docs). Mitigate during implementation by reading Squad's own `.cfg` files from the user's install (they are the ground truth and always available at runtime).
2. **`mir` mirror semantics** for genuinely mirrored parts (gear) unverified at decompile level — start by ignoring, add localScale=mir + winding flip behind a flag if visual bugs show.
3. **DDS edge cases**: BC4/BC5/DXT1-with-alpha and cubemaps in mods; and the double-question of row-flip + AG-swizzle ordering — unit-test against a known stock texture pair (dds vs original png from old KSP versions).
4. **GPL posture for the mu reader port** must be decided before code is written (item 10).
5. **MM mini-engine scope**: full `#$…$` variable search and `RecurseNodeSearch` path grammar are the deep 20% — most GameData patches need only @/%/!/+ nodes, :NEEDS/:HAS/:FOR ordering, and wildcards. Implement the pass structure exactly (it's cheap) and the path-search lazily.
6. **Craft `attN` extended format** internals (underscore groups) documented only empirically; harmless since visuals don't need attN.
7. KSP wiki is behind an Anubis bot-wall (and its 2026 Wayback snapshots captured the wall, not content) — future wiki citations must go through pre-2025 Wayback snapshots.
