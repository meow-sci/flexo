> Companion reference for [KSP_CRAFT_PLAN.md](../KSP_CRAFT_PLAN.md). Extracted from io_object_mu (cfg grammar, craft/scale semantics, coordinate math, textures, shaders) from local checkouts (.tmp-repos/, .tmp-ksp/) on 2026-07-26; verify against those trees if in doubt.

# io_object_mu Reference Semantics (for TS .craft/.mu/.cfg → glTF converter)

Reference tree: `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/io_object_mu` (all cites relative to it unless absolute).
Spot-check data: BDB at `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/Bluedog-Design-Bureau`, stock KSP at `/Users/asherwin/repos/meow-sci/flexo/.tmp-ksp/ksp/GameData`.
Addon targets Blender ≥ 2.80 (`__init__.py:25`). README warns import is "mostly working for static meshes (minus normals and tangents)" (README.md:7).

---

## 1. ConfigNode grammar (cfgnode/cfgnode.py, cfgnode/script.py, cfgnode/parser.py)

### 1.1 File decoding
- `ConfigNode.loadfile` reads the file as **bytes** and maps each byte to `chr(byte)` — i.e. Latin-1, NOT UTF-8 decode (cfgnode/cfgnode.py:104-108). Multi-byte UTF-8 sequences become multiple chars; they survive round-trip but compare wrong. A UTF-8 BOM therefore appears as the 3-char string `"\xef\xbb\xbf"`.
- `Script.__init__` strips a leading `"\xef\xbb\xbf"` (3 raw bytes) or a real `U+FEFF` (script.py:30-33). `ParseNode` additionally skips a stray `"\xef\xbb\xbf"` token anywhere in the stream (cfgnode.py:59-60) — MM-concatenated files can embed BOMs mid-stream.
- DOS EOF chars `\x1a` and `\x04` are skipped as whitespace-ish (script.py:54-57).
- CRLF: `\r` satisfies `str.isspace()` so it terminates tokens naturally; values are `.strip()`ed so trailing `\r` is removed (cfgnode.py:76).

### 1.2 Tokenizer (`Script`)
Constructed for cfg parsing as `Script("", text, "{}=", False)` (cfgnode.py:93) — i.e.:
- **single-char tokens**: `{`, `}`, `=` only (script.py:110-112). All other tokens run until whitespace or a single-char (script.py:113-117).
- **quotes disabled** (`quotes=False`), so `"` is an ordinary character in cfg files (script.py:95 path not taken).
- **comments**: `//` to end of line, nothing else (no `/* */`, no `#`) (script.py:58-66).
- `tokenAvailable(crossline)`: skips whitespace; if it hits `\n` with `crossline=False` it reports no token (used to force values onto the `=` line) (script.py:42-68). Line counter increments on every `\n` consumed (script.py:47-50).
- `getLine()`: consumes to end of line **or** to a `//` (comment excluded from the value), returns raw text (script.py:69-86).
- Errors raise with `"%s:%d: %s" % (filename, line, message)`; for `ConfigNode.load` the filename is `""` (cfgnode.py:27-34, 93-94). `getToken(crossline=False)` failing mid-line raises "line is incomplete" (script.py:92-93).

### 1.3 Parser (`ConfigNode.ParseNode`, cfgnode.py:53-88)
Per entry:
1. Read first token (crossline). At top level, tokens `{`, `}`, `=` are an immediate error "unexpected X"; inside a node only `{` and `=` are errors, and `}` returns (ends the node) (cfgnode.py:61-64).
2. Token becomes the tentative `key`. Then loop, reading further tokens **across newlines**:
   - `=` → value = rest of the **current physical line**, comment-stripped, `.strip()`ed; empty if the line ends or a comment follows immediately (`tokenAvailable(False)` gate) (cfgnode.py:72-78). The value's stored `line` is the line of the `=` token.
   - `{` → recursively parse a child node named `key` (cfgnode.py:79-83). **The brace may be on the same or the next line** (crossline token read at cfgnode.py:68-69).
   - anything else → the key is **extended** to the raw text slice from the first token's start to the latest token's end: `key = script.text[token_start:token_end]` (cfgnode.py:84-86). This is how multi-word keys/node-names (`node stack top = …`, `Some Name { }`) work; the slice preserves interior whitespace exactly — including newlines if the `=`/`{` sits on a later line (divergence from KSP, which is line-based and discards bare lines that aren't followed by `{`).
3. EOF inside a node → error "unexpected end of file" (cfgnode.py:87-88). Dangling bare token at top level is silently dropped.

`load()` wraps everything: it parses the whole text into a single **anonymous wrapper node** whose `.values` are the file's top-level `key = value` lines and whose `.nodes` are the top-level blocks (`PART`, `MODULE`, …) (cfgnode.py:89-103). (The `len(nodes) != 1 → list` branch at 100-103 is effectively vestigial.) Craft files are read as this wrapper: `craft.GetValue("ship")`, `craft.GetNodes("PART")` (import_craft/import_craft.py:50, 56).

### 1.4 Semantics / edge cases checklist for a TS re-implementation
- `key = value` value = raw rest-of-line, trimmed; `=` **inside** a value is literal (`a = b = c` → value `b = c`); `{`/`}` inside a value are literal (getLine doesn't tokenize) — KSP's line-preformatter would instead split braces onto their own lines; io_object_mu deliberately doesn't.
- Empty values legal: `key =` → `""` (cfgnode.py:73-77); `key = // comment` → `""`.
- Duplicate keys and duplicate node names are **preserved in order**; `GetValue`/`GetNode` return the first match, `GetValues`/`GetNodes` return all (cfgnode.py:109-150). Craft `link`/`attN`/`srfN` and multi-`MODEL` parts depend on this.
- Values never span lines; no escapes; no quoting.
- Comment `//` can start anywhere, even mid-value (`v = 1 // c` → `1`).
- Comma vs whitespace vectors: `parse_vector_string` splits on `,`, falling back to whitespace when there is no comma (cfgnode/parser.py:113-117). Floats via bare `float()` — no `f` suffix, no locale (parser.py:119-121, "FIXME better parsing").
- Numbers with pipes (`attN` new format `0|-0.595|0`) are NOT handled anywhere — that key is simply never parsed.
- Error type: `ConfigNodeError` with `.message`, `.line`; craft import converts to a UI error (import_craft.py:46-48); GameData scan just prints and skips the file (gamedata.py:88-91).

### 1.5 cfg vector/quaternion converters (cfgnode/parser.py)
- `parse_vector`: KSP `(x, y, z)` → Blender `Vector((x, z, y))` — reads components into names `x, z, y` in that order (parser.py:123-126).
- `parse_quaternion`: KSP craft `(x, y, z, w)` → Blender `Quaternion((w, -x, -y, -z))` after the same y/z variable swap — i.e. Blender `(w, −qx, −qz, −qy)` in craft-file component order (parser.py:128-131).
- `${...}` expression interpolation with a sandboxed `eval` exists for prop/module cfg templating (`parse_node`, parser.py:66-111) — not used by craft/part import.

---

## 2. Craft import semantics

### 2.1 What a craft PART node contributes (import_craft/import_craft.py:41-72)
Consumed keys — **only three**:
- `part` → part id: `p.GetValue("part").split("_")[0]` (line 57). The trailing `_<u32>` craft id is dropped. Works because KSP itself replaces `_` with `.` in part names at load; the addon mirrors this on the cfg side: `self.name = cfg.GetValue("name").replace("_", ".")` (import_craft/part.py:53). Verified against BDB: cfg `name = bluedog_Apollo_CrewPod` (`Gamedata/Bluedog_DB/Parts/Apollo/bluedog_Apollo_CrewPod.cfg:3`) ↔ craft `part = bluedog.Apollo.CrewPod_4292980418` (`Craft Files/Apollo Block III.craft:17`).
- `pos` → `parse_vector` (line 58). **Vessel-frame absolute** position. The first `PART` in the file is treated as root; every part gets `location = pos − root_pos` (lines 61-63). No parenting; the vessel is a flat list of collection-instance empties in a new collection.
- `rot` → `parse_quaternion` (line 59), applied absolute per part (`rotation_mode='QUATERNION'`, lines 64-65).

Everything else in a PART node is **ignored**: `partName, persistentId, attPos, attPos0, attRot, attRot0, mir, symMethod, sym, istg, dstg, sidx, sqor, sepI, attm, autostrutMode, rigidAttachment, resPri, modCost/modMass/modSize, link, attN, srfN, EVENTS, ACTIONS, PARTDATA, MODULE, RESOURCE…` (all present in the BDB craft, e.g. `Apollo Block III.craft:18-47`). Notably: **no attach-node-based placement at all** — placement relies purely on `pos`/`rot` absolutes, and no mirror/symmetry handling (`mir` is ignored; parts written by symmetry carry their own pos/rot anyway).
Ship-level keys: only `ship` is used (name), with `#autoLOC_…` names resolved through the localization table (import_craft.py:50-52). Ship-level `rot`, `size`, `type`, `version` ignored.

### 2.2 GameData database (import_craft/gamedata.py)
- Recursive scan of the configured GameData root (Blender addon preference `GameData`, preferences/preferences.py:92-95). `recurse_tree` sorts each directory listing and **skips any file/dir starting with `.` or `_`** (gamedata.py:28-38) — so `__LOCAL`, `_backup` dirs are invisible.
- `.cfg` files → `ConfigNode.loadfile`, then every **top-level** node is dispatched by name (gamedata.py:85-97): `PART` → `Part`, `PROP` → `Prop`, `INTERNAL` → `Internal`, `RESOURCE_DEFINITION` → stored, `Localization` → `node.nodes[0]` (first language block only) flattened into `self.localizations` (gamedata.py:59-83).
- Duplicate part/prop names: **first wins** (existing entry kept, gamedata.py:62-64, 67-71); internals/resources: last wins (72-79).
- `.mu` files are indexed two ways (gamedata.py:49-57): `models[url]` where `url` = GameData-relative path without `.mu` (first wins), and `model_by_path[dir]` = sorted list of model basenames per directory (gamedata.py:135-136).
- **ModuleManager**: NOT implemented. The only support is: if `<GameData>/ModuleManager.ConfigCache` exists, it is parsed and its `UrlConfig` nodes' PART/PROP/INTERNAL/RESOURCE_DEFINITION/Localization children are used **instead of** raw cfgs (raw `process_cfg` becomes a no-op, gamedata.py:85-87, 108-134). So: with a cache present you get fully-patched configs for free; with no cache you get raw, unpatched cfgs (`:NEEDS`, `@PART[...]` patches, B9PartSwitch data never applied). No patch evaluation of any kind exists in the addon.
- Models/parts already loaded into the .blend are reused via `Model.Preloaded()`/`Part.Preloaded()` collections named `model:<url>` / `part:<name>` (model/model.py:89-96, part.py:35-45).

### 2.3 Model resolution for a part (model/model.py:31-64, import_craft/part.py)
`compile_model(db, path, type, name, cfg, collection)`:
- If the part cfg has `MODEL` nodes: for each, consumed keys are **`model` (URL), `position`, `rotation` (Euler degrees), `scale`** — each via `parse_vector` (model.py:37-50). **`texture = name,url` replacement and `parent =` are NOT read** (stock uses `texture`, e.g. `.tmp-ksp/ksp/GameData/Squad/Parts/Misc/AsteroidDay/HECS2.cfg:12-13` — such parts import with the .mu's original textures).
- If there are no `MODEL` nodes (legacy): it takes `db.model_by_path[part_dir][0]` — the **alphabetically first** `.mu` in the part's own directory; the actual `mesh = foo.mu` value is **ignored entirely** (model.py:52-59; legacy example `Squad/Parts/FuelTank/RCSFuelTankR1/RCSFuelTankR1.cfg:6`). (Matches modern KSP behavior, which also ignores the mesh filename, but breaks if the cfg lives in a directory without the .mu → `KeyError`.)
- MODEL `rotation` is applied as Blender euler: `rotation_mode='YXZ'`, `euler = −rot.xzy · π/180` — comment: "Unity's rotation order is ZXY, which makes it YXZ for blender" (model.py:75-82).

### 2.4 Scale math (exact)
- Defaults: `self.scale = 1.0`, `self.rescaleFactor = 1.25`; overridden by cfg keys `scale` / `rescaleFactor` (import_craft/part.py:55-60). 1.25 matches KSP's documented default.
- `Part.get_model()` instantiates the compiled model collection with object scale `Vector((1,1,1)) * rescaleFactor` (part.py:67-70).
- Each `MODEL` node's `scale` is applied on the sub-model instance object (model.py:47-50), *inside* the part collection, so the effective transform of a MODEL-node mesh vertex v is:

  `world = craft_pos + craft_rot · ( rescaleFactor · (MODEL.position + MODEL.rotation · (MODEL.scale ⊙ v)) )`

  i.e. **effective mesh scale = MODEL.scale × rescaleFactor** (per-axis MODEL.scale, uniform rescaleFactor), matching KSP.
- The part-level **`scale` key is parsed but never used** (part.py:57-58; no other reference) — faithful to KSP, where `scale` only rescales cfg-defined attach-node coordinates (which the addon doesn't import anyway).
- `Part.instantiate` ignores its `rot` argument entirely (sets only location/scale, part.py:73-79); craft import sets rotation afterwards on the returned object (import_craft.py:64-65).

### 2.5 Craft-level assembly details
- Each part is an Empty with `instance_type='COLLECTION'` pointing at the shared compiled part collection — N copies of a part share one mesh set (part.py:61-79).
- The vessel is itself wrapped in a collection instanced at the 3D cursor (import_craft.py:53-71).
- Missing part in the DB → raw `KeyError` from `gamedata.parts[pname]` (import_craft.py:60) — no graceful skip. This is the #1 failure mode for modded craft.

---

## 3. Coordinate conversions

### 3.1 io_object_mu's Unity↔Blender formulas (authoritative list)
Unity: LH, +Y up, +Z forward. Blender: RH, +Z up. The addon's basis map is the y/z swap `S = [[1,0,0],[0,0,1],[0,1,0]]` (det −1, S⁻¹ = S).

| Quantity | Unity → Blender (import) | Cite | Blender → Unity (export) | Cite |
|---|---|---|---|---|
| position / normal / any vec3 | `(x,y,z) → (x,z,y)` | mu.py:1071-1075 (`read_vector`; used for verts mu.py:498-499, normals 508-511, transforms 337-339) | `(x,y,z) → (x,z,y)` | mu.py:1142-1145 |
| quaternion (Unity file order x,y,z,w) | `→ Blender (w, −x, −z, −y)` ("swap y and z and reverse the rotation direction") | mu.py:1077-1083 | Blender `(w,x,y,z) → (−x, −z, −y, w)` | mu.py:1147-1152 |
| tangent (x,y,z,w) | `→ (x, z, y, −w)` | mu.py:1085-1088 | same swizzle, `−w` | mu.py:1154-1156; export w = `bitangent_sign` (export_mu/mesh.py:113-119) |
| triangle winding | reversed: `(a,b,c) → (c,b,a)` (or `(a,c,b)` when a==0, to dodge Blender's no-0-last rule — same orientation) | mu.py:525-539 | reversed `(a,c,b)` | mu.py:586-593 |
| UV / UV2 | **unchanged** (read raw) | mu.py:500-507; applied raw in import_mu/mesh.py:38-41, 73-76 | unchanged | export_mu/mesh.py:76-83 |
| bind pose matrix | `B = S · M · S` (conjugation by `Matrix_YZ`) | import_mu/armature.py:27-31, 94-99 | — | — |
| cfg euler (MODEL rotation) | Blender mode `'YXZ'`, `euler_B = −(rx, rz, ry)·π/180` | model/model.py:75-82 | — | — |
| animation curves | pos x→idx0, y→idx2, z→idx1 (mult 1); quat x→idx1, y→idx3, z→idx2 all mult −1, w→idx0; euler x→0,y→2,z→1 mult −π/180 | import_mu/animation.py:30-43 | — | — |
| cfg vectors (`pos`, MODEL position…) | `(x,y,z) → (x,z,y)` | cfgnode/parser.py:123-126 | `swapyz` | utils/utils.py:22-23, export_mu/attachnode.py:35-36 |
| cfg quaternion (craft `rot`) | `(x,y,z,w) → (w,−x,−z,−y)` | cfgnode/parser.py:128-131 | `swizzleq`: `(w,x,y,z)_B → (x,z,y,−w)`… (blender→unity only) | utils/utils.py:25-27 |
| camera/light orientation | extra post-rotation `Quaternion((√.5, √.5, 0, 0))` (+90° about X; Unity aims +Z, Blender cam/light aims −Z) | import_mu/camera.py:46, light.py:44, applied import_mu/import_mu.py:76-77 | — | — |
| `node_` attach empties | extra `Quaternion((√.5, −√.5, 0, 0))` (−90° X; Blender empty arrow is +Z, KSP node dir is Unity +Z = Blender +Y) | import_mu/import_mu.py:131-144 | node dir = object's +Z column swizzled | export_mu/attachnode.py:35-36 |

Light detail: Unity intensity → Watts ×1000, spot angle degrees→radians (light.py:30-41); camera FOV degrees→radians (camera.py:36).

### 3.2 Derived Unity → glTF conversion for the TS tool
glTF: RH, +Y up, −Z forward ("assets face +Z"). Derive by composing io_object_mu's Unity→Blender with Blender's standard glTF export (+Y-up rotation): Blender `(x,y,z) → glTF (x, z, −y)`.

Compose: `U (x,y,z) → B (x,z,y) → G (x, y, −z)`.

**Positions / directions / normals:**
```
p_gltf = ( p.x, p.y, −p.z )        // negate Z; det = −1 (handedness fix)
```
**Quaternions** (Unity storage order x,y,z,w; glTF storage order x,y,z,w):
```
q_gltf = ( −q.x, −q.y, q.z, q.w )  // negate the two non-mirrored axes
```
Check (via Blender chain): Blender q = (w, −ux, −uz, −uy); Blender→glTF vector part `(bx, bz, −by)` ⇒ glTF (−ux, −uy, uz, w). Sanity: Unity yaw +90° about Y `(0, sin45, 0, cos45)` → glTF `(0, −sin45, 0, cos45)` = −90° about Y, which correctly turns glTF −Z (mapped Unity forward) toward +X. ✓
**Scale:** componentwise unchanged: `(sx, sy, sz)` (axis-aligned sign map; the −1 cancels for scale).
**Matrices:** `M_gltf = C · M_unity · C` with `C = diag(1, 1, −1)` (mirror of armature.py:99's `S·M·S` pattern).
**Tangents:** `t_gltf = ( t.x, t.y, −t.z, −t.w )`. Derivation of w: Unity and glTF both define `bitangent = w · cross(normal, tangent)`; under improper C, `cross(Cn, Ct) = det(C)·C·cross(n,t) = −C·cross(n,t)`, so preserving the true bitangent direction requires `w' = −w`. Matches io_object_mu's `−w` on its own improper map (mu.py:1085-1088).
**Triangle winding:** must be reversed, `(a, b, c) → (a, c, b)` — any improper vertex transform flips orientation, and glTF requires CCW front faces; io_object_mu does exactly this for its swap (mu.py:529-539).
**UVs:** mu UVs are Unity-convention (origin bottom-left, V up); Blender shares that, hence io's pass-through. glTF's origin is **top-left (V down)** ⇒
```
uv_gltf = ( u, 1 − v )
```
Then all image files (PNG/decoded-DDS) are used in natural top-down row order and the addon's DDS-only V-flip hack (see §4) disappears entirely.
**Cameras/lights/attach nodes:** Unity forward +Z maps to glTF −Z, which is exactly glTF's camera/light/facing convention — with the negate-Z choice **no extra ±90° fixups are needed** (they exist in io_object_mu only because of Blender's object conventions).
**Craft assembly:** `node.translation = C(pos − root_pos)`, `node.rotation = qconv(rot)`, `node.scale = (rescaleFactor, rescaleFactor, rescaleFactor)` per §2.4.
**Euler MODEL rotation:** build the quaternion with Unity's own composition (Unity applies Z, then X, then Y: `q_u = Ry(y)·Rx(x)·Rz(z)`), then convert with `qconv`; avoids re-deriving Blender's `'YXZ'`+negation trick (model.py:75-82).

**The two common conventions:** negate-Z (ours, and what io_object_mu's swap composes to through Blender) vs negate-X (used by UnityGLTF and several Unity exporters). Both are valid RH conversions; they differ by a 180° Y rotation of the whole scene (a Unity part's "north" face ends up at glTF +Z under negate-Z). Pick **negate-Z** to match io_object_mu-derived expectations; mixing conventions between mesh data and node transforms is the classic mirror-image bug.

---

## 4. Texture handling (import_mu/textures.py)

### 4.1 Formats & loaders
- Extension resolution: candidate order `[".dds", ".mbm", ".tga", ".png"]`, rotated to start at the extension recorded in the mu texture name, trying each until a file exists (textures.py:79-91). (So a mu referencing `foo.mbm` will fall back to `foo.tga`, then `foo.png`, then `foo.dds`.)
- **DDS / PNG / TGA: no parsing in the addon at all** — delegated to `bpy.data.images.load` (textures.py:51-53). No DXT decompression code exists; whatever Blender's DDS loader supports (DXT1/3/5 classic; DX10/BC5/BC7 variants typically NOT) is what works. Unsupported DDS variants simply fail to load.
- **MBM: custom loader**, `load_mbm` (textures.py:28-44). Header = 20 bytes, little-endian `<5i`:

  | offset | field | notes |
  |---|---|---|
  | 0 | magic `0x50534B03` (bytes `03 4B 53 50` = "\x03KSP") | textures.py:31-33 |
  | 4 | width (int32) | |
  | 8 | height (int32) | |
  | 12 | bump flag (int32; 1 = normal map) | **read but ignored** by the addon |
  | 16 | bpp (int32): 32 or 24 only | else rejected (textures.py:42-43) |
  | 20… | raw pixels, row-major; 32bpp = RGBA byte quads; 24bpp = RGB triplets expanded to RGBA with A=255 (textures.py:34-41) | |

  Pixels are pushed straight into `img.pixels` (Blender = bottom row first); no flip is applied, i.e. the addon assumes MBM rows are stored bottom-up (OpenGL order).

### 4.2 Vertical flip
- Only DDS images are marked `muimageprop.invertY = True` (textures.py:54-56, 68). The flip is applied **in the material sampler**, not to pixels: `scale.y *= −1; offset.y = 1 − offset.y` on the texture node mapping (shader/textureprops.py:40-48). Reason: DDS stores rows top-down while Blender treats loaded rows as bottom-up. MBM/PNG/TGA get no flip.
- For a glTF pipeline this whole mechanism collapses into the single global `v → 1 − v` UV flip plus decoding DDS top-down into PNG (see §3.2).

### 4.3 Normal-map identification & DXT5nm
- Primary signal: the **mu texture `type` field** — `TT_TEXTURE = 0`, `TT_NORMAL_MAP = 1` (mu.py:161-166; `MuTexture` = name + int type, mu.py:168-179).
- Secondary: filename heuristic — basename ending `_n` or `nrm` forces normal-map treatment for dds/png/tga (textures.py:58-59).
- Normal maps get `colorspace is_data = True` (textures.py:70-72).
- **DXT5nm (AG-swizzled) detection**: samples up to 256 pixels; if `|2c−1|² of (r,g,b)` deviates from unit length by > 0.05 the image is flagged `convertNorm = True` (textures.py:57, 73-76) — i.e. "this is not a plain RGB normal map".
- **Reconstruction**: the `dxtNormal` node group (defined e.g. in shader/bumped.cfg, group dumped in §5.2) **always** rebuilds the normal as: `X = texture.A`, `Y = texture.G`, `Z = sqrt(clamp(1 − (2A−1)² − (2G−1)²))·0.5+0.5` — i.e. it assumes AG (DXT5nm) layout unconditionally. The `rgbNorm` switch that would bypass this for plain RGB maps is **commented out** (shader/textureprops.py:49-52). Plain RGB normal maps with A=1 therefore reconstruct wrong in Blender renders (X pinned to 1.0). For KSP data this mostly works because Unity/PartTools ship desktop normal maps as DXT5nm.
- For a glTF tool: convert DXT5nm → RGB (`X=A*2−1, Y=G*2−1, Z=sqrt(1−X²−Y²)`, re-pack 0..1) and remember KSP/Unity normal maps are +Y-up ("OpenGL-style" green); glTF is also +Y — no green flip — but the **X axis flips with the handedness conversion**, consistent with the tangent-w negation (do not flip the red channel if you negate tangent w; the two must be chosen together — io_object_mu's pairing is: geometry mirrored, tangent w negated, texture untouched).
- MBM `bump` header field would be a third normal signal but is discarded (textures.py:31 unpacks it to a dead variable).

---

## 5. Shader → material property semantics

### 5.1 Inventory
- Mu materials: version ≥ 4 files carry `shaderName` + typed property dicts (`color`, `vector`, `float2`, `float3`, `texture` props; prop types 0-4) (mu.py:195-215). Version 3 files carry a shader **enum** mapped through `MuEnum.ShaderNames` with fixed per-shader property layouts (mu.py:97-148, 217-283) — the definitive legacy property sets, including oddities like ST_ALPHA_SPECULAR's "#FIXME bogus" extra `_Gloss` float (mu.py:259-264).
- Node-graph configs exist for 17 shaders (shader/*.cfg, names at `shader/<file>.cfg:2` each); UI templates exist for 21 (preferences/shaders/*.py). Shaders with a template but **no node graph** (materials get properties but Blender prints "unknown shader", shader/shader.py:273-274): `KSP/Alpha/Cutoff Bumped`, `KSP/Alpha/Unlit Transparent`, `KSP/Particles/Additive`, `KSP/Particles/Alpha Blended`.
- Property→node binding is purely **by node name**: a node named `_MainTex` receives the image; a `Color4` group named `_Color` gets `inputs[0]=rgba, inputs[1]=a` (shader/shader.py:207-235, colorprops.py:27-34); float props set a Value node. Texture scale/offset from `MuMatTex` (index + 2×scale + 2×offset, mu.py:181-193) go onto the image node's texture_mapping (textureprops.py:32-52).

### 5.2 Shared node-group math (extracted from the cfg graphs; dump: scratchpad/shader_links.txt, groups.txt)
- `MainColor(VColor,VAlpha,CColor,CAlpha,TColor,TAlpha)` → `Color = VC·CC·TC`, `Alpha = VA·CA·TA` (vertex × _Color × _MainTex) (alpha_cutoff.cfg group).
- `StandardShader(BaseColor, Shininess, Gloss, EmissionColor, EmissionStrength, Alpha, NormalColor)` → Principled BSDF with:
  - `Roughness = sqrt(1 − Gloss)`
  - `Specular IOR Level = sqrt(Shininess)`
  - NormalColor via Normal Map node; Alpha straight in; Emission straight in.
- `EmissionColor(EmissionMap, EmissiveColor, EmissiveAlpha, Opacity)` → `Color = Emap.rgb · ECol.rgb · (EA · Opacity)`; also passes Opacity through to shader Alpha.
- `dxtNormal(RGB, Alpha)` → AG reconstruction (see §4.3).
- `SpecPBR(Albedo, Specular, Smoothness, EmissionColor, Alpha, Normal)` (Mapped shaders) → Eevee Specular node: `Roughness = sqrt(1 − Smoothness)`, Transparency = 1−Alpha.
- `SpecTint(Color, SABE, SpecMap, SpecTint)` → specular = `_SpecMap.rgb`, plus an additive "SpecBoost" emission term `= Albedo·SABE + SpecMap·_SpecTint`.
- `AmbientBoost(SABD, AmbientMult, VertColor, TexColor)` → albedo `= (VC·TC)·(1 + SABD·AmbientMult)` (approx; multiply-add wiring).
- `Lighting` (InternalSpace) → lightmap R·_LightColor1 + G·_LightColor2 + B·_LightAmbient·AmbientColor; AO lerp by `LMAlpha^_Occlusion`; produces both an AO tint and a baked-light emission term. Lightmap sampled with **UV2** (internal_space.cfg links `UV2 → _LightMap`).

### 5.3 Consolidated shader table
Wiring authority: `scratchpad/shader_links.txt` (generated from shader/*.cfg with the addon's own parser). Blend = Blender blend_method in the cfg `Material` block.

| KSP shader (cfg) | Texture props | Color props | Float props | Blend | Rendering semantics (glTF mapping guidance) |
|---|---|---|---|---|---|
| KSP/Diffuse | _MainTex | _Color | (_Opacity) | OPAQUE | base = vertColor·_Color·_MainTex.rgb; MainTex.a unused for opaque; spec-free (map: baseColor, roughness ≈ 1, metallic 0) |
| KSP/Specular | _MainTex | _Color, _SpecColor* | _Shininess (def 0.078125), _Opacity | OPAQUE | base as above; **gloss = combined alpha (VA·CA·MainTex.a)**; roughness = sqrt(1−gloss); specular strength = sqrt(_Shininess). *_SpecColor is in the template/mu data but NOT wired in the node graph (specular.cfg has no _SpecColor node) — KSP's real shader tints specular with it |
| KSP/Bumped | _MainTex, _BumpMap | _Color | (_Opacity) | OPAQUE | diffuse + AG normal map (dxtNormal) |
| KSP/Bumped Specular | _MainTex, _BumpMap | _Color, _SpecColor* | _Shininess (0.4), _Opacity | OPAQUE | Specular + normal map; gloss from MainTex.a |
| KSP/Bumped Specular (Mapped) | _MainTex, _BumpMap, _SpecMap | _RimColor, _TemperatureColor, _BurnColor (templates; unwired) | _SpecTint 0.05, _Shininess 0.4, _AmbientMultiplier 1, _Opacity 1, _RimFalloff 0.1, _UnderwaterFogFactor 0 | OPAQUE | KSP 1.x "Mapped" PBR-ish: **specular color = _SpecMap.rgb** (not MainTex.a), smoothness = _Shininess, small additive spec-tint emission; rim/temperature/burn ignored by graphs |
| KSP/Emissive/Diffuse | _MainTex, _Emissive | _Color, _EmissiveColor (def 0,0,0,1) | (_Opacity) | OPAQUE | emission = _Emissive.rgb·_EmissiveColor.rgb·(_EmissiveColor.a·_Opacity) — **_EmissiveColor.a scales emission** (KSP animates it) |
| KSP/Emissive/Specular | _MainTex, _Emissive | _Color, _SpecColor*, _EmissiveColor | _Shininess 0.4, _Opacity | OPAQUE | Specular + emission as above |
| KSP/Emissive/Bumped Specular | _MainTex, _BumpMap, _Emissive | _Color, _SpecColor*, _EmissiveColor | _Shininess 0.4, _Opacity | OPAQUE | all of the above (template: preferences/shaders/ksp_emissive_bumped_specular.py:24-44) |
| KSP/Emissive/Bumped Specular (Mapped) | _MainTex, _BumpMap, _Emissive, _SpecMap | _EmissiveColor | _SpecTint, _Shininess, _AmbientMultiplier, _Opacity | OPAQUE | Mapped + emission (EmissiveAdd sums spec-boost and emissive terms) |
| KSP/Alpha/Cutoff | _MainTex | _Color | _Cutoff (0.5) | CLIP | alpha-test at **fixed 0.5** (Material alpha_threshold; the _Cutoff mu value is NOT wired) → glTF alphaMode MASK, alphaCutoff from mu _Cutoff |
| KSP/Alpha/Cutoff Bumped | _MainTex, _BumpMap | _Color | _Cutoff 0.5 | (no graph) | template only; treat as Cutoff + normal map |
| KSP/Alpha/Translucent | _MainTex | _Color | _Fresnel 0, (_Opacity) | BLEND | alpha = VA·CA·TA·_Opacity → glTF BLEND; _Fresnel ignored by graph |
| KSP/Alpha/Translucent Additive | _MainTex | _TintColor | _Fresnel 0 | BLEND | additive: emission = (TintC·TexC)·(TintA·TexA) added over a base shader → glTF: BLEND + emissive, or KHR_materials_emissive_strength; true additive not expressible in core glTF |
| KSP/Alpha/Translucent Specular | _MainTex | _Color, _SpecColor | _Shininess 0.078125, _Fresnel 0, _Opacity | BLEND | alpha feeds BOTH gloss and (×_Opacity) blend alpha |
| KSP/Alpha/Unlit Transparent | _MainTex | _Color | _Fresnel 0 | (no graph) | unlit + blend (glTF: KHR_materials_unlit + BLEND) |
| KSP/Specular (Transparent) | _MainTex | _Color, _MainColor, _SpecColor | _Shininess 0.078125, _Opacity 1 | BLEND | oddity: `_Color` is wired into the **vertex-color** slot, `_MainColor` into the color slot (specular_transparent.cfg links) |
| KSP/Unlit | _MainTex | _Color | — | OPAQUE | pure emission = (VC·CC·TC), strength = combined alpha; camera-ray mix (glTF: KHR_materials_unlit) |
| KSP/UnlitColor | — | _Color | — | OPAQUE | emission = _Color.rgb, strength = _Color.a (unlit) |
| KSP/InternalSpace | _MainTex, _BumpMap, _LightMap | _SpecColor, _LightColor1, _LightColor2 | _Shininess 0.2, _LightAmbient 2.0, _Occlusion 0.8 | OPAQUE | IVA lightmapped shader; lightmap on UV2; gloss = MainTex.a·mean(_SpecColor); baked light → emission (glTF: bake lightmap into emissive or use occlusion texture on UV2) |
| KSP/Particles/Additive, KSP/Particles/Alpha Blended | _MainTex | _TintColor (0.5⁴) | _InvFade 1.0 | (no graph) | particle shaders, template-only |

Legacy (v3 mu) per-enum property layouts — exact read order for old files: mu.py:217-283 (e.g. ST_BUMPED_SPECULAR = _MainTex, _BumpMap, _SpecColor, _Shininess).

Key take-aways for glTF PBR mapping:
1. `_MainTex.a` is triple-duty: gloss mask on all Specular shaders, blend alpha on Alpha shaders (both at once on Translucent Specular), cutout on Cutoff.
2. `_Shininess` ∈ [0,1]; io maps roughness = sqrt(1 − glossAlpha) with specular level sqrt(_Shininess) — a reasonable glTF translation is `roughness = 1 − _Shininess·MainTex.a` or the io formula; KSP's real model is Blinn-Phong with `_SpecColor` tint (which io drops).
3. `_EmissiveColor.a × _Opacity` scales emission; `_EmissiveColor` rgb defaults to **black** (0,0,0,1) — parts look non-emissive until animated (ModuleColorChanger/Animator animate `_EmissiveColor`).
4. Texture tiling: every mu texture binding carries scale/offset (mu.py:181-193) → glTF KHR_texture_transform (remember the V-flip interacts with offset: `offset_gltf.v = 1 − offset.v − scale.v` when flipping).

---

## 6. Known jank / limitations (and likely causes of "unreliable modded craft imports")

Documented by the project itself:
- README.md:6-16: import "mostly working for static meshes (**minus normals and tangents**)"; "vertex tangents are broken (they are incorrectly treated as quaternions)… This is a bug"; "mu.py always writes version 5". README bug list (README.md:30-46): sizes "twice as original" reported, ~25 stock parts with broken armature/animation round-trips (HeatShield, GrapplingArm, launchClamp1, lights…).
- TODO (TODO:1-11): export armatures/skinned meshes unfinished; bone inherit flags; collection merge.
- FIXMEs in import path: tangents never applied to Blender meshes (import_mu/mesh.py:80-83); armature/animation "dont working all animations… missing Armatures" (import_mu/animation.py:130-131); `armature_obj` attribute crash guards (import_mu/import_mu.py:150-156, armature.py:121-125); triangle count assumption (mu.py:529); parse_float "better parsing" (cfgnode/parser.py:120); euler-vs-quaternion in model instancing (model/model.py:77-79).
- Unknown mu entry types are **silently ignored with no length info** (mu.py:977-979) — any new/modded component desyncs the whole read (binary format is not skippable), typically surfacing as EOFError or garbage meshes.

Craft-import-specific gaps (all verified in §2):
1. **No ModuleManager patching** — only the `ModuleManager.ConfigCache` shortcut (gamedata.py:108-134). Craft referencing MM-created or MM-renamed parts fail with `KeyError` (import_craft.py:60) when no cache is present; with a stale cache they use stale configs. **This plus #2 is the most probable cause of the user's unreliable modded-craft imports.**
2. **No B9PartSwitch / ModulePartVariants / ModuleJettison awareness** — every mesh in the .mu is imported and shown (variant meshes, shrouds, flag decals, all LODs), since the game hides GameObjects at runtime via modules the addon doesn't model. Modded (BDB!) craft appear with overlapping/duplicate geometry.
3. **MODEL `texture =` replacement ignored** (model.py:37-50) — re-textured stock-model parts (very common in mods, and stock e.g. HECS2.cfg:12) show the donor model's original textures.
4. **Legacy `mesh =` value ignored**; first .mu in the directory wins (model.py:52-55) — wrong mesh when a dir has several .mu files; KeyError when the cfg dir has none.
5. Any missing `part`/`pos`/`rot` key or unknown part name = uncaught exception aborting the entire craft import (import_craft.py:56-60); there is no per-part skip/report.
6. Attach-node data (`attN`/`srfN`/cfg `node_stack_*`) never used — fine for placement (pos/rot are absolute) but means no re-snapping and no structural hierarchy; `mir`/symmetry ignored (harmless for geometry).
7. **DDS coverage is whatever Blender supports** — no custom DDS decoder; DX10-header / BC5 / BC7 textures (increasingly common in mods) silently fail to load → magenta/blank materials. No sRGB handling beyond Blender defaults.
8. Shader coverage: unknown/modded shader names (TU/Textures Unlimited, Waterfall, etc.) produce property-only materials with a console warning and no nodes (shader.py:273-274). Four stock shaders have no graphs (§5.1). `_SpecColor` intentionally dropped in most graphs.
9. **Animations**: imported per-.mu as NLA strips (one action per clip/target, muted stacking, import_mu/animation.py:110-229) with tangent-preserving fcurves; bone-targeted curves are re-based against bind pose (animation.py:173-222) but flagged FIXME. **Craft import does not wire or play animations** — parts are collection instances; deployed states (`persistedState`, gear/panel positions in the craft file) are ignored. Material-property animation is supported for color/float props only ("animated texture properties not yet supported", animation.py:73-76).
10. **Skinned meshes**: importable (armature reconstruction + bindPose armature w/ copy-transform constraints, armature.py:94-238; mesh.py:100-108) but acknowledged fragile (README, FIXMEs); export of skins is on the TODO. Multiple skins sharing an armature handled heuristically via `find_bones` root-walking (armature.py:132-180).
11. **IVA/props**: PROP and INTERNAL nodes are indexed (gamedata.py:66-75) and props/internals can be imported standalone (prop/prop.py:73-94 via `import_prop`); INTERNAL is just `class Internal(Part)` (gamedata.py:40-41). Part cfg `INTERNAL { name }` references are NOT followed during craft import — no IVA appears in a craft. `Localization` supports only the first language block (gamedata.py:81-83).
12. GameData scan skips `_`-prefixed directories (gamedata.py:32-33) and, without an MM cache, parses **every** cfg in GameData at import time (slow on large installs; parse errors just print).
13. Craft `part` name splitting assumes no `_` in effective names (guaranteed by KSP's `_`→`.` mangling, but hand-edited cfgs with literal dots+underscores mixed could alias).
14. Vertex colors: mu byte colors ÷255 imported as FLOAT_COLOR point attribute, default white when absent (mu.py:541-545, import_mu/mesh.py:55-65) — several stock shaders multiply by vertex color, so dropping them in a converter changes tinting.

---

## Appendix: mu container facts useful for the TS reader
- Header: int32 magic `76543`, int32 version 0..5, then 7-bit-length-prefixed name string, then the root MuObject (mu.py:25-26, 1178-1192). Strings: 7-bit varint length + bytes (mu.py:1033-1049, 1096-1106).
- MuObject stream: transform (name + localPosition vec3 + localRotation quat + localScale vec3, mu.py:331-347), then tagged entries until `ET_CHILD_TRANSFORM_END`/EOF: tag/layer, colliders (5 kinds ×2 versions), mesh filter, renderer (castShadows/receiveShadows bytes when version>0 + material indices, mu.py:596-607), skinned mesh renderer (materials, center/size, quality, updateWhenOffscreen, bone name list, then inline mesh, mu.py:615-631), animation, camera, light (type/intensity/range/RGBA/cullingMask/spotAngle(v>1), mu.py:895-906), particles, materials block, textures block (mu.py:916-980).
- Mesh chunks: verts/uvs/uv2s/normals/tangents/boneWeights(4 idx+4 w)/bindPoses(16 floats)/triangles(index count then int32 triples)/byte vertex colors, framed by ET_MESH_START(count,submesh_count)…ET_MESH_END (mu.py:486-548). Only the **first submesh's material** is honored by KSP ("KSP supports only the first submesh", import_mu/mesh.py:31-36).
