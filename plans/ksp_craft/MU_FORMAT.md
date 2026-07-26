> Companion reference for [KSP_CRAFT_PLAN.md](../KSP_CRAFT_PLAN.md). Extracted from io_object_mu mu.py (byte-level .mu spec) from local checkouts (.tmp-repos/, .tmp-ksp/) on 2026-07-26; verify against those trees if in doubt.

# KSP `.mu` Binary Model Format — Complete Byte-Level Specification

**Source of truth:** `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/io_object_mu/mu.py` (1214 lines).
All line references below are into that file unless noted. `mu.py` imports only `struct.pack/unpack` (line 22) — it is fully self-contained for binary IO. `dump.py` and `import_mu/*` reuse the same `Mu` class; the only place they add format interpretation is bind-pose matrix construction (`import_mu/armature.py:94-99`), cited where relevant.

**Convention used in this spec:** field tables list fields in **exact stream order**. Types are the on-disk encodings. Where the Python reader applies a Unity(LHS)→Blender(RHS) conversion after reading, the table shows the **raw on-disk layout** and the conversion is called out separately — a TS reader targeting Unity semantics must NOT apply the Blender swizzles.

---

## 1. Primitive encodings

Everything in the file is **little-endian**. There is no alignment or padding anywhere; all records are packed byte streams.

| Primitive | Size | Encoding | mu.py |
|---|---|---|---|
| `byte` | 1 | unsigned 8-bit (`struct "<B"`) | 1013-1021 |
| `int32` | 4 | **signed** 32-bit LE (`"<i"`) — used for all counts, enums, indices | 1023-1031 |
| `uint32` | 4 | unsigned 32-bit LE (`"<I"`) — used only for `cullingMask` (camera, light) | 1051-1059 |
| `float` | 4 | IEEE-754 single LE (`"<f"`) — no doubles anywhere in the format | 1061-1069 |
| `varint` | 1–5 | 7-bit little-endian base-128 (see §1.1) — used **only** as string length prefix | 1033-1049 |
| `string` | varint + N | varint byte-length prefix, then N raw bytes (see §1.2) | 1096-1106 |
| `vec2` | 8 | 2 × float (x, y) | — |
| `vec3` | 12 | 3 × float, on disk in **Unity order (x, y, z)** | 1071-1075 |
| `quat` | 16 | 4 × float, on disk in **Unity component order (x, y, z, w)** | 1077-1083 |
| `tangent` | 16 | 4 × float (x, y, z, w) — w is the ±1 handedness/bitangent-sign component | 1085-1088 |
| `color4f` | 16 | 4 × float (r, g, b, a) | — |
| `color32` | 4 | 4 × byte (r, g, b, a), 0–255 | 541-545 |
| `matrix4` | 64 | 16 × float | 520-524 |

### 1.1 Varint (7-bit encoded int) — lines 1033-1049 (reader), 1118-1130 (writer)

This is the .NET `BinaryReader.Read7BitEncodedInt` algorithm (little-endian groups of 7 bits, continuation flag in bit 7):

```
value = 0; mult = 1
loop:
    b = read byte
    value += (b & 0x7F) * mult
    if b < 0x80: stop
    mult *= 128
```

- Least-significant 7 bits come **first**.
- The Python reader has **no byte-count cap** (arbitrary-precision ints; a malformed stream can consume unbounded bytes). The writer (1118-1130) caps values to 32 bits, converting negatives via two's complement (`val += 1<<32`), so it emits at most 5 bytes. **TS: cap at 5 bytes / mask to 32 bits and throw beyond that** (matches .NET).
- In real files it only ever encodes string byte-lengths, so values are small (usually 1 byte).

### 1.2 Strings — lines 1096-1106 (reader), 1169-1173 (writer)

```
length : varint          // byte count, NOT char count
bytes  : length × byte
```

- **Reader decode:** the Python builds the string with `chr(c)` per byte — i.e. effectively **Latin-1** (one codepoint per byte). (The `if type(data) == type("")` branch at 1101 is dead Python-2 leftover; in Py3 `file.read` returns `bytes`.)
- **Writer encode:** `data.encode()` = **UTF-8**, with `length` = UTF-8 byte count (1169-1173).
- This is a reader/writer asymmetry for non-ASCII (see §7). The authoritative producer (Unity PartTools via .NET `BinaryWriter`) writes UTF-8, so **TS should decode UTF-8**; every observed name is plain ASCII where the two agree.
- There is no NUL terminator and no padding.

### 1.3 Coordinate/handedness conversions applied by the Python (NOT part of the file format)

The addon converts Unity's left-handed Y-up convention to Blender's right-handed Z-up by swapping Y and Z. These happen **after** reading the raw values above:

| Read helper | On-disk order | Python returns | mu.py |
|---|---|---|---|
| `read_vector` | (x, y, z) | (x, z, y) | 1071-1075 |
| `read_quaternion` | (x, y, z, w) | (w, −x, −z, −y) — reorders to Blender wxyz AND swaps/negates for handedness | 1077-1083 |
| `read_tangent` | (x, y, z, w) | (x, z, y, −w) | 1085-1088 |
| triangle indices | (i0, i1, i2), Unity clockwise winding | (i2, i1, i0) reversed for RHS, with a special case to avoid index 0 in last position (Blender quirk) | 529-539 |
| bind poses | 16 floats | wrapped `Matrix_YZ @ M @ Matrix_YZ` | import_mu/armature.py:96-99 |

A TS reader that keeps Unity conventions reads the raw layouts and skips ALL of these.

---

## 2. File header and top-level layout — lines 1178-1192

| # | Field | Type | Meaning |
|---|---|---|---|
| 1 | `magic` | int32 | Must be **76543** (`0x00012AFF`; on disk `FF 2A 01 00`). Constant `MuEnum.MODEL_BINARY`, line 25. |
| 2 | `version` | int32 | File format version. Reader accepts **0 ≤ version ≤ 5** (`FILE_VERSION = 5`, line 26). Anything else → `Mu.read` returns `None` (no exception), lines 1183-1185. |
| 3 | `name` | string | Model name (e.g. the PartTools model name). |
| 4 | root object | MuObject | The whole object tree + inline material/texture tables (§4). Terminated by **EOF**, not by an end marker. |

There is no trailer, checksum, or footer. After the root object's entry loop hits EOF the file is done.

### 2.1 Version gates (complete list — these are the ONLY version-dependent reads)

| Version test | Effect | mu.py |
|---|---|---|
| `version >= 4` | Materials use the **new named-property format** (§5.9.1); `< 4` uses the **old shader-enum format** (§5.9.2) | 295-298 |
| `version > 0` | MuRenderer has `castShadows`/`receiveShadows` bytes; version 0 omits both (defaults 1/1) | 598-603 |
| `version > 1` | MuLight has trailing `spotAngle` float; versions 0-1 omit it | 904-905 |
| (none) | **No reader behavior differs between versions 4 and 5.** Version 2 vs 3 also identical. | — |

The writer always emits version 5 (line 1196). Modern KSP PartTools emits version 5; old files in the wild can be any of 0-5.

---

## 3. Record-type enums — lines 24-166

### 3.1 Entry types (`ET_*`) — lines 28-60. These int32 tags drive the object-tree stream (§4) and the mesh sub-stream (§5.4).

| Value | Name | Payload |
|---|---|---|
| 0 | `ET_CHILD_TRANSFORM_START` | child MuObject follows (recursive) |
| 1 | `ET_CHILD_TRANSFORM_END` | end of current MuObject's entry loop |
| 2 | `ET_ANIMATION` | MuAnimation |
| 3 | `ET_MESH_COLLIDER` | MuColliderMesh (no isTrigger) |
| 4 | `ET_SPHERE_COLLIDER` | MuColliderSphere (no isTrigger) |
| 5 | `ET_CAPSULE_COLLIDER` | MuColliderCapsule (no isTrigger) |
| 6 | `ET_BOX_COLLIDER` | MuColliderBox (no isTrigger) |
| 7 | `ET_MESH_FILTER` | MuMesh |
| 8 | `ET_MESH_RENDERER` | MuRenderer |
| 9 | `ET_SKINNED_MESH_RENDERER` | MuSkinnedMeshRenderer |
| 10 | `ET_MATERIALS` | material table (count + MuMaterial×count) |
| 11 | `ET_MATERIAL` | **never read or written** — source comment `#XXX not used?` (line 39). Falls into the reader's silent-ignore path. |
| 12 | `ET_TEXTURES` | texture table (count + MuTexture×count) |
| 13 | `ET_MESH_START` | opens a MuMesh block |
| 14 | `ET_MESH_VERTS` | vertex positions |
| 15 | `ET_MESH_UV` | UV set 0 |
| 16 | `ET_MESH_UV2` | UV set 1 |
| 17 | `ET_MESH_NORMALS` | normals |
| 18 | `ET_MESH_TANGENTS` | tangents |
| 19 | `ET_MESH_TRIANGLES` | one submesh's index list |
| 20 | `ET_MESH_BONE_WEIGHTS` | per-vertex bone weights |
| 21 | `ET_MESH_BIND_POSES` | bind-pose matrices |
| 22 | `ET_MESH_END` | closes a MuMesh block |
| 23 | `ET_LIGHT` | MuLight |
| 24 | `ET_TAG_AND_LAYER` | MuTagLayer |
| 25 | `ET_MESH_COLLIDER2` | MuColliderMesh **with** leading isTrigger byte |
| 26 | `ET_SPHERE_COLLIDER2` | MuColliderSphere with isTrigger |
| 27 | `ET_CAPSULE_COLLIDER2` | MuColliderCapsule with isTrigger |
| 28 | `ET_BOX_COLLIDER2` | MuColliderBox with isTrigger |
| 29 | `ET_WHEEL_COLLIDER` | MuColliderWheel |
| 30 | `ET_CAMERA` | MuCamera |
| 31 | `ET_PARTICLES` | MuParticles |
| 32 | `ET_MESH_VERTEX_COLORS` | per-vertex RGBA byte colors |

33 named values total (0-32). There is **no flare record type** in the format.

### 3.2 Shader types (`ST_*`, old-style materials only, version < 4) — lines 97-130, names 131-148

| Value | Name | Unity shader name (`ShaderNames`) |
|---|---|---|
| 0 | `ST_CUSTOM` | `""` — **not handled by the reader** (raises; see §8) |
| 1 | `ST_DIFFUSE` | `KSP/Diffuse` |
| 2 | `ST_SPECULAR` | `KSP/Specular` |
| 3 | `ST_BUMPED` | `KSP/Bumped` |
| 4 | `ST_BUMPED_SPECULAR` | `KSP/Bumped Specular` |
| 5 | `ST_EMISSIVE` | `KSP/Emissive/Diffuse` |
| 6 | `ST_EMISSIVE_SPECULAR` | `KSP/Emissive/Specular` |
| 7 | `ST_EMISSIVE_BUMPED_SPECULAR` | `KSP/Emissive/Bumped Specular` |
| 8 | `ST_ALPHA_CUTOFF` | `KSP/Alpha/Cutoff` |
| 9 | `ST_ALPHA_CUTOFF_BUMPED` | `KSP/Alpha/Cutoff Bumped` |
| 10 | `ST_ALPHA` | `KSP/Alpha/Translucent` |
| 11 | `ST_ALPHA_SPECULAR` | `KSP/Alpha/Translucent Specular` |
| 12 | `ST_ALPHA_UNLIT` | `KSP/Alpha/Unlit Transparent` |
| 13 | `ST_UNLIT` | `KSP/Unlit` |
| 14 | `ST_PARTICLES_ALPHA_BLENDED` | `KSP/Particles/Alpha Blended` |
| 15 | `ST_PARTICLES_ADDITIVE` | `KSP/Particles/Additive` |

### 3.3 Animation curve target types (`AT_*`) — lines 150-159

| Value | Name |
|---|---|
| 0 | `AT_TRANSFORM` |
| 1 | `AT_MATERIAL` |
| 2 | `AT_LIGHT` |
| 3 | `AT_AUDIO_SOURCE` |

### 3.4 Texture types (`TT_*`) — lines 161-166

| Value | Name | Meaning |
|---|---|---|
| 0 | `TT_TEXTURE` | ordinary (color) texture |
| 1 | `TT_NORMAL_MAP` | normal map (KSP runs its NRM conversion on load; mu.py itself does not interpret further) |

---

## 4. Object tree (`MuObject`) — lines 916-1002

A MuObject is: **one MuTransform, then a tag-driven entry loop.** There is no component count and no child count — the stream is self-delimiting via tags.

```
MuObject:
    transform : MuTransform                (§5.1 — read unconditionally, no tag)
    loop:
        entry : int32                      (ET_* tag)
        switch entry:
            0  ET_CHILD_TRANSFORM_START →  recurse: child MuObject (depth-first,
                                           in stream order); loop continues after
                                           the child's END tag is consumed by the child
            1  ET_CHILD_TRANSFORM_END   →  return from this MuObject
            24 ET_TAG_AND_LAYER         →  MuTagLayer (§5.2)
            3,4,5,6,25,26,27,28,29      →  collider of that type (§5.3)
            7  ET_MESH_FILTER           →  MuMesh (§5.4)
            8  ET_MESH_RENDERER         →  MuRenderer (§5.5)
            9  ET_SKINNED_MESH_RENDERER →  MuSkinnedMeshRenderer (§5.6)
            2  ET_ANIMATION             →  MuAnimation (§5.10)
            30 ET_CAMERA                →  MuCamera (§5.12)
            31 ET_PARTICLES             →  MuParticles (§5.13)
            23 ET_LIGHT                 →  MuLight (§5.11)
            10 ET_MATERIALS             →  count:int32, then count × MuMaterial (§5.9)
                                           — appended to the FILE-level material list
                                           regardless of nesting depth (968-972)
            12 ET_TEXTURES              →  count:int32, then count × MuTexture (§5.8)
                                           — appended to the FILE-level texture list (973-976)
            anything else               →  SILENTLY IGNORED, no payload consumed
                                           (lines 977-979 — see §8)
    EOFError while reading the entry tag → return (normal termination for the
                                           ROOT object only; lines 924-928)
```

Key facts:

- **Recursion order:** depth-first, children in stream order. `ET_CHILD_TRANSFORM_START` is immediately followed by the child's MuTransform. Each non-root object is terminated by its own `ET_CHILD_TRANSFORM_END` (value 1). The **root object has no START/END wrapper and ends only at EOF**.
- Components and children may interleave in any order; the reader is order-agnostic. (The writer emits a fixed order — see §7.)
- The materials (10) and textures (12) tables are file-global. In files written by this addon and by PartTools they appear once, at root level, **after** all children (the writer emits them last, lines 1199-1208), so the reader encounters them inside the root's entry loop just before EOF. The reader would accept them at any depth/position, and accepts multiple blocks (appending).
- Duplicate component tags on one object: the reader overwrites the single named slot (`self.renderer` etc.) but keeps every parsed component in a `components` list — format-wise, repeats are accepted.

### 4.1 Material/texture cross-referencing

- `MuRenderer.materials[]` and `MuSkinnedMeshRenderer.materials[]` hold int32 indices into the file-global **materials** table (order of appearance in the `ET_MATERIALS` block).
- `MuMatTex.index` holds an int32 index into the file-global **textures** table (`ET_TEXTURES` block order).
- Since the tables physically appear at the END of the file, index resolution must be deferred until parsing completes.

---

## 5. Record layouts

### 5.1 MuTransform — lines 331-347

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `name` | string | GameObject name |
| 2 | `localPosition` | vec3 | 3 × float, Unity (x, y, z) |
| 3 | `localRotation` | quat | 4 × float, **on-disk component order (x, y, z, w)** |
| 4 | `localScale` | vec3 | 3 × float |

Total: name + 40 bytes.

### 5.2 MuTagLayer (tag 24) — lines 349-361

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `tag` | string | Unity tag, e.g. `"Untagged"`, `"Icon_Hidden"` |
| 2 | `layer` | int32 | Unity layer number |

### 5.3 Colliders

Collider payloads share this rule (lines 645-793, factory at 781-793): the `*_COLLIDER2` variants (25/26/27/28) carry a **leading `isTrigger` byte**; the plain variants (3/4/5/6) do not (isTrigger defaults 0). Wheel (29) never has isTrigger.

**MuColliderMesh** (tags 3 / 25) — lines 649-666:

| # | Field | Type | Condition |
|---|---|---|---|
| 1 | `isTrigger` | byte | only tag 25 |
| 2 | `convex` | byte | |
| 3 | `mesh` | MuMesh | full mesh block incl. its own `ET_MESH_START`…`ET_MESH_END` framing (§5.4) |

**MuColliderSphere** (tags 4 / 26) — lines 668-685:

| # | Field | Type | Condition |
|---|---|---|---|
| 1 | `isTrigger` | byte | only tag 26 |
| 2 | `radius` | float | |
| 3 | `center` | vec3 | |

**MuColliderCapsule** (tags 5 / 27) — lines 687-707:

| # | Field | Type | Condition |
|---|---|---|---|
| 1 | `isTrigger` | byte | only tag 27 |
| 2 | `radius` | float | |
| 3 | `height` | float | |
| 4 | `direction` | int32 | axis: 0=X, 1=Y, 2=Z (Unity CapsuleCollider.direction; mu.py does not interpret) |
| 5 | `center` | vec3 | |

**MuColliderBox** (tags 6 / 28) — lines 709-726:

| # | Field | Type | Condition |
|---|---|---|---|
| 1 | `isTrigger` | byte | only tag 28 |
| 2 | `size` | vec3 | |
| 3 | `center` | vec3 | |

**MuColliderWheel** (tag 29) — lines 758-779, with MuSpring 728-739 and MuFriction 741-756:

| # | Field | Type |
|---|---|---|
| 1 | `mass` | float |
| 2 | `radius` | float |
| 3 | `suspensionDistance` | float |
| 4 | `center` | vec3 |
| 5 | `suspensionSpring.spring` | float |
| 6 | `suspensionSpring.damper` | float |
| 7 | `suspensionSpring.targetPosition` | float |
| 8 | `forwardFriction.extremumSlip` | float |
| 9 | `forwardFriction.extremumValue` | float |
| 10 | `forwardFriction.asymptoteSlip` | float |
| 11 | `forwardFriction.asymptoteValue` | float |
| 12 | `forwardFriction.stiffness` | float |
| 13-17 | `sidewaysFriction.*` | 5 × float, same 5 fields/order as forwardFriction |

Fixed size: 3×4 (mass/radius/suspensionDistance) + 12 (center) + 12 (spring) + 2×20 (frictions) = 76 bytes.

### 5.4 MuMesh (tag 7 as MeshFilter; also embedded in mesh colliders and skinned renderers) — lines 475-548

```
start        : int32    == 13 (ET_MESH_START); anything else → reader error
                          (bare `raise` at line 490 → RuntimeError in Py3)
num_verts    : int32    (line 491)
submesh_count: int32    (line 491 — informational; the reader IGNORES it and
                         just collects every ET_MESH_TRIANGLES block until
                         ET_MESH_END. The writer sets it to len(submeshes).)
loop:
    type : int32
    22 ET_MESH_END           → done
    14 ET_MESH_VERTS         → num_verts × vec3                     (12 B/vert)
    15 ET_MESH_UV            → num_verts × vec2  (u, v)             (8 B/vert)
    16 ET_MESH_UV2           → num_verts × vec2                     (8 B/vert)
    17 ET_MESH_NORMALS       → num_verts × vec3                     (12 B/vert)
    18 ET_MESH_TANGENTS      → num_verts × tangent (x,y,z,w)        (16 B/vert)
    20 ET_MESH_BONE_WEIGHTS  → num_verts × MuBoneWeight             (32 B/vert)
    21 ET_MESH_BIND_POSES    → num_poses : int32
                               num_poses × 16 float (matrix4)       (64 B each)
    19 ET_MESH_TRIANGLES     → num_indices : int32   (index count, NOT triangle
                               count — divided by 3 at line 529, with source
                               comment "#FIXME is this guaranteed?")
                               num_indices × int32   (i0,i1,i2 per tri, Unity
                               clockwise/LHS winding)
                               → appended as ONE submesh; block may repeat,
                               one block per submesh
    32 ET_MESH_VERTEX_COLORS → num_verts × color32 (r,g,b,a bytes; the reader
                               normalizes /255 — lines 541-545)
    anything else            → ValueError "MuMesh <hex offset> <type>" (547)
```

- **Attribute presence is signaled purely by which blocks occur** before `ET_MESH_END`; there are no presence flags. Blocks may appear in any order (writer order: verts, uv, uv2, normals, tangents, boneWeights, bindPoses, colors, then all triangle blocks — lines 549-594).
- **MuBoneWeight** (lines 461-473): per vertex, **4 interleaved (index, weight) pairs**: `int32 index0, float weight0, int32 index1, float weight1, int32 index2, float weight2, int32 index3, float weight3`. Indices refer to the owning SkinnedMeshRenderer's `bones[]` array.
- **Bind poses**: 16 raw floats each. `import_mu/armature.py:98` builds the matrix as **4 consecutive rows of 4** (`Matrix((bp[0:4], bp[4:8], bp[8:12], bp[12:16]))` — mathutils.Matrix takes rows) and later **inverts** it to get the bone's rest matrix (armature.py:111), i.e. the stored matrix is Unity's standard bindpose (world→bone). UNKNOWN: whether that row grouping equals Unity's `Matrix4x4` column-major memory order or its transpose — mu.py itself never interprets the 16 floats (line 524); only the armature importer's row treatment (+ its Y/Z conjugation) is documented behavior.
- Submeshes map 1:1 to material slots of the renderer on the same GameObject (Unity semantics; not enforced by mu.py).

### 5.5 MuRenderer (tag 8) — lines 596-613

| # | Field | Type | Condition |
|---|---|---|---|
| 1 | `castShadows` | byte | **only if version > 0**; default 1 (lines 598-603) |
| 2 | `receiveShadows` | byte | only if version > 0; default 1 |
| 3 | `num_mat` | int32 | |
| 4 | `materials` | num_mat × int32 | indices into the file-global material table |

### 5.6 MuSkinnedMeshRenderer (tag 9) — lines 615-643

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `num_mat` | int32 | |
| 2 | `materials` | num_mat × int32 | material-table indices |
| 3 | `center` | vec3 | local bounds center |
| 4 | `size` | vec3 | local bounds size |
| 5 | `quality` | int32 | Unity SkinQuality (0=Auto, 1, 2, 4 bones; uninterpreted by mu.py) |
| 6 | `updateWhenOffscreen` | byte | |
| 7 | `nBones` | int32 | |
| 8 | `bones` | nBones × string | bone names = MuTransform names elsewhere in the tree |
| 9 | `mesh` | MuMesh | inline, with full `ET_MESH_START…END` framing (§5.4) |

### 5.7 MuAnimation → see §5.10.

### 5.8 MuTexture (rows of the tag-12 table) — lines 168-179

The `ET_TEXTURES` payload is `tex_count:int32` then `tex_count` of:

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `name` | string | texture file name/relative path as authored (e.g. `"model000"`, may include directory separators) |
| 2 | `type` | int32 | §3.4: 0=texture, 1=normal map |

### 5.9 Materials (rows of the tag-10 table)

The `ET_MATERIALS` payload is `mat_count:int32` then `mat_count` MuMaterial records. Which record layout depends on the FILE version (line 295).

#### 5.9.1 New-style material, version ≥ 4 — lines 195-215

```
name           : string
shaderName     : string      (full Unity shader path, e.g. "KSP/Bumped Specular")
num_properties : int32
num_properties × {
    propName  : string       (e.g. "_MainTex", "_Color", "_Shininess")
    propType  : int32
    payload   : per propType:
        0 → color   : 4 × float (r,g,b,a)          [colorProperties]
        1 → vector  : 4 × float (x,y,z,w)          [vectorProperties]
        2 → float   : 1 × float                    [floatProperties2]
        3 → float   : 1 × float                    [floatProperties3]
        4 → texture : MuMatTex (below)             [textureProperties]
        other → NOTHING CONSUMED — silently skipped, stream desyncs (see §8)
}
```

Types 2 and 3 have identical payloads; the tag distinction mirrors Unity's shader property classes (2=Float, 3=Range — inference from Unity's ShaderUtil ordering Color/Vector/Float/Range/TexEnv; mu.py itself only preserves the tag, lines 207-210).

**MuMatTex** — lines 181-193:

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `index` | int32 | index into the file-global texture table |
| 2 | `scale` | vec2 | UV tiling (x, y) |
| 3 | `offset` | vec2 | UV offset (x, y) |

20 bytes fixed.

#### 5.9.2 Old-style material, version ≤ 3 — lines 217-283

```
name : string
type : int32     (ST_* shader enum, §3.2 — sets shaderName = ShaderNames[type])
then a FIXED field sequence depending on `type`:
```

| Shader type | Fields, in exact order |
|---|---|
| 1 `ST_DIFFUSE` | `_MainTex`:MuMatTex |
| 2 `ST_SPECULAR` | `_MainTex`:MuMatTex, `_SpecColor`:color4f, `_Shininess`:float |
| 3 `ST_BUMPED` | `_MainTex`:MuMatTex, `_BumpMap`:MuMatTex |
| 4 `ST_BUMPED_SPECULAR` | `_MainTex`:MuMatTex, `_BumpMap`:MuMatTex, `_SpecColor`:color4f, `_Shininess`:float |
| 5 `ST_EMISSIVE` | `_MainTex`:MuMatTex, `_Emissive`:MuMatTex, `_EmissiveColor`:color4f |
| 6 `ST_EMISSIVE_SPECULAR` | `_MainTex`:MuMatTex, `_SpecColor`:color4f, `_Shininess`:float, `_Emissive`:MuMatTex, `_EmissiveColor`:color4f |
| 7 `ST_EMISSIVE_BUMPED_SPECULAR` | `_MainTex`:MuMatTex, `_BumpMap`:MuMatTex, `_SpecColor`:color4f, `_Shininess`:float, `_Emissive`:MuMatTex, `_EmissiveColor`:color4f |
| 8 `ST_ALPHA_CUTOFF` | `_MainTex`:MuMatTex, `_Cutoff`:float |
| 9 `ST_ALPHA_CUTOFF_BUMPED` | `_MainTex`:MuMatTex, `_BumpMap`:MuMatTex, `_Cutoff`:float |
| 10 `ST_ALPHA` | `_MainTex`:MuMatTex |
| 11 `ST_ALPHA_SPECULAR` | `_MainTex`:MuMatTex, `_Gloss`:float, `_SpecColor`:color4f, `_Shininess`:float — source comment `#FIXME bogus` on `_Gloss` (line 261): the field's identity is suspect but ONE float is definitely consumed there |
| 12 `ST_ALPHA_UNLIT` | `_MainTex`:MuMatTex, `_Color`:color4f |
| 13 `ST_UNLIT` | `_MainTex`:MuMatTex, `_Color`:color4f |
| 14 `ST_PARTICLES_ALPHA_BLENDED` | `_MainTex`:MuMatTex, `_Color`:color4f, `_InvFade`:float |
| 15 `ST_PARTICLES_ADDITIVE` | `_MainTex`:MuMatTex, `_Color`:color4f, `_InvFade`:float |
| 0 `ST_CUSTOM` or any other value | **unhandled** → `raise ValueError("MuMaterial %d" % self.type)` (line 282) — itself buggy: `self.type` was never assigned (the local is `type`), so this actually raises `AttributeError`. Either way, old-style ST_CUSTOM is a hard reader failure. |

### 5.10 MuAnimation (tag 2) — lines 441-459, MuClip 418-439, MuCurve 381-416, MuKey 363-379

**MuAnimation:**

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `num_clips` | int32 | |
| 2 | `clips` | num_clips × MuClip | |
| 3 | `clip` | string | name of the default clip (Unity `Animation.clip`); may be empty |
| 4 | `autoPlay` | byte | writer carries `#XXX is this right?` (line 459) — field identity per reader is "playAutomatically" |

**MuClip:**

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `name` | string | clip name |
| 2 | `lbCenter` | vec3 | local bounds center |
| 3 | `lbSize` | vec3 | local bounds size |
| 4 | `wrapMode` | int32 | Unity WrapMode (Default=0, Once/Clamp=1, Loop=2, PingPong=4, ClampForever=8 — Unity values; mu.py does not interpret) |
| 5 | `num_curves` | int32 | |
| 6 | `curves` | num_curves × MuCurve | |

**MuCurve** (normal layout):

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `path` | string | slash-separated child path of the animated GameObject relative to the object owning the Animation component; `""` = the object itself |
| 2 | `property` | string | animated property, e.g. `m_LocalPosition.x`, `m_LocalRotation.w`, `localEulerAnglesRaw.x`, `_MainTex_ST.y`, `m_Intensity` |
| 3 | `type` | int32 | AT_* target-component type (§3.3) |
| 4 | `wrapMode` | 2 × int32 | (pre, post) wrap modes — line 389 comment `# pre, post` |
| 5 | `num_keys` | int32 | |
| 6 | `keys` | num_keys × MuKey | |

**Bad-PartTools-export fixup** (lines 391-403): some old exports omitted the `type` int entirely, so the reader mis-consumes `(type ← wrapPre, wrapMode ← (wrapPost, num_keys))`. Detection: `type == 8` (8 = WrapMode.ClampForever, impossible as an AT_* value). Recovery as coded:
- guess `type = 1` (material) if `path[:9] == "material"` else `type = 0` (transform). NOTE the test is buggy — a 9-char slice compared to the 8-char literal only matches when `path` is exactly `"material"`, so in practice the guess is almost always 0.
- `num_keys = wrapMode[1]` (the second consumed int was really the key count);
- `wrapMode = (type_guess, wrapMode[0])` — as coded, the pre-wrap slot ends up holding the guessed AT_* value (0/1), not the original 8. Looks like an upstream bug (`8` was presumably intended); replicate or fix consciously.

**MuKey** (28 bytes fixed):

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `time` | float | seconds |
| 2 | `value` | float | |
| 3 | `tangent` | 2 × float | (inTangent, outTangent) — line 370 comment `# in, out` |
| 4 | `tangentMode` | int32 | source comment: `# editable, smooth, linear, stepped (0..3?)` (line 372) — semantics UNCERTAIN in the source; Unity's serialized tangentMode is actually a bitfield. Preserve raw. |

### 5.11 MuLight (tag 23) — lines 895-914

| # | Field | Type | Condition / notes |
|---|---|---|---|
| 1 | `type` | int32 | Unity LightType (Spot=0, Directional=1, Point=2, Area=3 — Unity values; uninterpreted by mu.py) |
| 2 | `intensity` | float | |
| 3 | `range` | float | |
| 4 | `color` | color4f | r,g,b,a floats |
| 5 | `cullingMask` | uint32 | |
| 6 | `spotAngle` | float | **only if version > 1** (lines 904-905) |

### 5.12 MuCamera (tag 30) — lines 795-817

| # | Field | Type |
|---|---|---|
| 1 | `clearFlags` | int32 (Unity CameraClearFlags: Skybox=1, SolidColor=2, Depth=3, Nothing=4 — uninterpreted) |
| 2 | `backgroundColor` | color4f |
| 3 | `cullingMask` | uint32 |
| 4 | `orthographic` | byte |
| 5 | `fov` | float |
| 6 | `near` | float |
| 7 | `far` | float |
| 8 | `depth` | float |

Fixed 41 bytes. No version gating.

### 5.13 MuParticles (tag 31) — lines 819-893 (legacy Unity ParticleEmitter/Animator/Renderer combo)

Exact stream order (fixed size, 290 bytes):

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `emit` | byte | |
| 2 | `shape` | int32 | emitter shape id (uninterpreted) |
| 3 | `shape3d` | vec3 | ellipsoid |
| 4 | `shape2d` | vec2 | |
| 5 | `shape1d` | float | |
| 6 | `color` | color4f | |
| 7 | `useWorldSpace` | byte | field name in source is the typo `useUorldSpace` (line 829) |
| 8 | `size` | 2 × float | min, max |
| 9 | `energy` | 2 × float | min, max |
| 10 | `emission` | 2 × int32 | min, max |
| 11 | `worldVelocity` | vec3 | |
| 12 | `localVelocity` | vec3 | |
| 13 | `rndVelocity` | vec3 | |
| 14 | `emitterVelocityScale` | float | |
| 15 | `angularVelocity` | float | |
| 16 | `rndAngularVelocity` | float | |
| 17 | `rndRotation` | byte | |
| 18 | `doesAnimateColor` | byte | |
| 19 | `colorAnimation` | 5 × color4f | 5 gradient stops (80 bytes) |
| 20 | `worldRotationAxis` | vec3 | |
| 21 | `localRotationAxis` | vec3 | |
| 22 | `sizeGrow` | float | |
| 23 | `rndForce` | vec3 | |
| 24 | `force` | vec3 | |
| 25 | `damping` | float | |
| 26 | `castShadows` | byte | |
| 27 | `recieveShadows` | byte | (typo in source, line 851) |
| 28 | `lengthScale` | float | |
| 29 | `velocityScale` | float | |
| 30 | `maxParticleSize` | float | |
| 31 | `particleRenderMode` | int32 | |
| 32 | `uvAnimation` | 3 × int32 | xTile, yTile, cycles (line 856) |
| 33 | `count` | int32 | |

No version gating.

---

## 6. Writer overview (for round-trip context) — `Mu.write` lines 1193-1209, `MuObject.write` 981-1002

Emit order: magic, version **5**, name, root object, then (if non-empty) `ET_MATERIALS` block, then (if non-empty) `ET_TEXTURES` block. Per object: transform, tag_and_layer, collider, mesh filter (tag written by MuObject.write line 987), renderer, skinned renderer, animation, camera, light, then each child wrapped in START/END (999-1002). Component classes write their own leading tag ints (e.g. line 609, 633, 809, 908) except MuMesh-as-MeshFilter (tag emitted by the caller).

---

## 7. Writer asymmetries (writer output ≠ what the reader tolerates)

1. **Version pinning:** writer always emits version 5 with new-style materials, shadow bytes, and light `spotAngle` — it can't produce v<4 layouts even for data read from old files (lines 1196, 300-329, 610-611, 914).
2. **Particles are silently dropped on write:** `MuObject.write` (981-1002) has **no ET_PARTICLES branch**; `MuParticles.write` exists (859-893) but is never called and, unlike the other components, does **not** write its own leading tag. Read→write round-trips lose particle components.
3. **String encoding mismatch:** writer encodes UTF-8 (1170); reader decodes byte-per-byte Latin-1 style (1103-1106). Divergent only for non-ASCII names.
4. **Fixed emission order** (components then children; mesh attribute blocks in the canonical order of lines 554-593) vs the reader's any-order tolerance. Real PartTools files interleave differently (e.g. tag/layer, then children, then components in places); do not assume writer order when reading.
5. **Mesh attributes conditionally emitted:** an attribute array is written only when its length equals `len(verts)` (557-582); bind poses whenever non-empty (577). A reader-populated mesh with mismatched array lengths silently loses those arrays on write.
6. **Triangle winding & vertex data** are converted RHS→LHS on write (592, 1142-1156), inverse of the read conversion — lossless round-trip, but only if both sides' conversions are used together.
7. **Vertex colors:** read as bytes → floats /255 (543-544); written by clamping floats ×255 (1158-1160) — quantization is idempotent after one round trip.
8. **`MuTagLayer.write` always runs** (line 983 – no hasattr guard, unlike every other component): an object stream that lacked tag 24 on read crashes the writer (AttributeError) — i.e., the writer requires every object to have tag_and_layer.
9. **Renderer materials written via `mu.write_int(self.materials)`** as a tuple (613, 635) — matches read; no count asymmetry.

---

## 8. Reader tolerances, bugs, and known gaps

- **Bad magic/version → `None`:** `Mu.read` returns `None` instead of raising (1183-1185). Version must satisfy `0 ≤ v ≤ 5`.
- **Unknown entry types in the object loop are silently ignored WITHOUT consuming any payload** (977-979). The next 4 bytes are then re-interpreted as another tag — on real unknown records this desyncs and typically cascades until EOF (root) or garbage-tag soup. `ET_MATERIAL` (11) lands here too. **TS recommendation: throw on unknown tags instead.**
- **Root EOF is the only clean terminator** (924-928): `EOFError` while reading an entry tag ends the root object. An EOF anywhere else (mid-record) raises `EOFError` in the primitive readers (1016-1017 etc.) — all short reads raise.
- **Mesh framing asserts:** missing `ET_MESH_START` → bare `raise` (line 490 — a Py3 `RuntimeError: No active exception to re-raise`); unknown block tag inside a mesh → `ValueError` with hex file offset (547).
- **Triangle count division:** index count is divided by 3 with `#FIXME is this guaranteed?` (529) — remainder indices would be silently dropped (`int(n/3)` truncates).
- **Old-style `ST_CUSTOM`/unknown shader enum:** hard failure, and the raise expression itself is buggy (`self.type` unset → AttributeError, line 282).
- **New-style material with propType ∉ {0,1,2,3,4}:** silently skipped with **no bytes consumed** (203-214) → guaranteed desync. Throw in TS.
- **MuCurve `type == 8` fixup** for headerless old PartTools curves (391-401), including the two internal bugs documented in §5.10 (the `path[:9]` prefix test and the wrapMode[0] overwrite).
- **`read_7int` unbounded** (1033-1049): no 5-byte cap; malformed data can loop long and overflow 32 bits (Python bigints tolerate it; TS must bound it).
- **Counts are signed int32** and never validated; negative counts make Python's `range()` produce zero iterations (mostly harmless) but `read_int(n, True)` with negative n would `file.read(negative)` → reads to EOF then EOFError. Validate `count >= 0` in TS.
- **`num_verts`/`submesh_count`:** `submesh_count` is never checked against actual triangle blocks.
- **Uncertain semantics flagged in source:** key `tangentMode` values (`(0..3?)`, line 372), animation `autoPlay` (`#XXX is this right?`, 459), `_Gloss` in ST_ALPHA_SPECULAR (`#FIXME bogus`, 261).
- **Repo TODO file** (`.tmp-repos/io_object_mu/TODO`) lists only Blender-workflow gaps (export armatures/skinned meshes, constraints, collection merging) — nothing about unparsed binary content; the reader covers every tag the format defines except 11 (unused).
- **UNKNOWN:** bind-pose 16-float ordering relative to Unity's Matrix4x4 convention (mu.py line 524 reads raw; the armature importer treats groups of 4 as matrix rows — armature.py:98). Verify empirically against a skinned KSP part if skinning matters.

---

## 9. Worked example

File: `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/Bluedog-Design-Bureau/Gamedata/Bluedog_DB/Parts/Apollo/bluedog_Apollo_AARDV_Antenna.mu` (23 KB).

`xxd -l 160 <file>`:

```
00000000: ff2a 0100 0500 0000 1c62 6c75 6564 6f67  .*.......bluedog
00000010: 5f41 706f 6c6c 6f5f 4141 5244 565f 416e  _Apollo_AARDV_An
00000020: 7465 6e6e 610d 4141 5244 565f 416e 7465  tenna.AARDV_Ante
00000030: 6e6e 6114 ae27 c000 0000 0000 0000 0000  nna..'..........
00000040: 0000 8000 0000 8000 0000 8000 0080 3f00  ..............?.
00000050: 0080 3f00 0080 3f00 0080 3f18 0000 0008  ..?...?...?.....
00000060: 556e 7461 6767 6564 0000 0000 0000 0000  Untagged........
00000070: 0d41 4152 4456 5f41 6e74 656e 6e61 0000  .AARDV_Antenna..
00000080: 0000 0000 0000 0000 0000 0000 0000 0000  ................
00000090: 0000 0000 0000 0000 803f 0000 803f 0000  .........?...?..
```

Byte-by-byte against this spec:

| Offset | Bytes | Decoded | Spec section |
|---|---|---|---|
| 0x00-0x03 | `FF 2A 01 00` | int32 = 76543 — magic `MODEL_BINARY` | §2 |
| 0x04-0x07 | `05 00 00 00` | int32 = 5 — file version 5 (new-style materials, shadow bytes, spotAngle all present) | §2, §2.1 |
| 0x08 | `1C` | varint = 28 — model-name byte length | §1.1 |
| 0x09-0x24 | `62 6C ... 61` | `"bluedog_Apollo_AARDV_Antenna"` (28 bytes) | §1.2 |
| — | — | **root MuObject begins → MuTransform** | §4, §5.1 |
| 0x25 | `0D` | varint = 13 — transform name length | |
| 0x26-0x32 | `41 41 ... 61` | `"AARDV_Antenna"` | |
| 0x33-0x36 | `14 AE 27 C0` | float = −2.62 — localPosition.x | §5.1 |
| 0x37-0x3A | `00 00 00 00` | 0.0 — localPosition.y | |
| 0x3B-0x3E | `00 00 00 00` | 0.0 — localPosition.z | |
| 0x3F-0x42 | `00 00 00 80` | −0.0 — localRotation.**x** (on-disk order x,y,z,w) | §5.1, §1.3 |
| 0x43-0x46 | `00 00 00 80` | −0.0 — localRotation.y | |
| 0x47-0x4A | `00 00 00 80` | −0.0 — localRotation.z | |
| 0x4B-0x4E | `00 00 80 3F` | 1.0 — localRotation.w → identity quaternion | |
| 0x4F-0x52 | `00 00 80 3F` | 1.0 — localScale.x | |
| 0x53-0x56 | `00 00 80 3F` | 1.0 — localScale.y | |
| 0x57-0x5A | `00 00 80 3F` | 1.0 — localScale.z | |
| 0x5B-0x5E | `18 00 00 00` | int32 = 24 = `ET_TAG_AND_LAYER` — first entry tag | §3.1, §5.2 |
| 0x5F | `08` | varint = 8 — tag string length | |
| 0x60-0x67 | `55 6E ... 64` | `"Untagged"` | |
| 0x68-0x6B | `00 00 00 00` | int32 = 0 — layer 0 | |
| 0x6C-0x6F | `00 00 00 00` | int32 = 0 = `ET_CHILD_TRANSFORM_START` — first child MuObject | §4 |
| 0x70 | `0D` | varint = 13 — child transform name length | |
| 0x71-0x7D | `41 41 ... 61` | `"AARDV_Antenna"` (child of same name) | |
| 0x7E-0x89 | `00…00` | child localPosition = (0, 0, 0) | |
| 0x8A-0x99 | `00…00, 00 00 80 3F` | child localRotation = (0, 0, 0, 1); next comes scale (1,1,…) at 0x9A | |

(Decodes machine-verified: `struct.unpack('<i', ff2a0100) == 76543`, `struct.unpack('<f', 14ae27c0) == -2.6199999...`.)

Note the −0.0 (sign-bit-only) rotation components: Unity serializes exact float bit patterns; readers must not assume +0.0.

---

## 10. TS (Node 24) implementation notes

**Reader core.** Read the whole file into one `Buffer`/`Uint8Array` (real .mu files are 10 KB–5 MB) and walk it with a cursor object. Either `Buffer#readInt32LE/readUInt32LE/readFloatLE` or a single `DataView` with explicit `littleEndian = true` on **every** get call (`getInt32(off, true)` — forgetting `true` is the classic bug; default is big-endian). Keep one `{ buf, off }` cursor and small helpers mirroring mu.py: `i32()`, `u32()`, `f32()`, `u8()`, `varint()`, `str()`, `vec3()`, `quat()`, etc. Bounds-check every read and throw a distinct `EOF` error type — the object-tree loop must catch it **only** at the entry-tag read of the ROOT object (normal termination) and propagate everywhere else.

**Varint:**
```ts
function varint(c: Cursor): number {
  let v = 0, shift = 0;
  for (;;) {
    const b = u8(c);
    v |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return v >>> 0;
    shift += 7;
    if (shift > 28) throw new Error("varint too long"); // .NET caps at 5 bytes
  }
}
```

**Strings:** `new TextDecoder("utf-8").decode(buf.subarray(off, off + len))` (or `latin1` to bit-match the Python reader; identical for the ASCII names that occur in practice). Length is BYTES.

**Pitfalls checklist:**
- Quaternions are **x,y,z,w on disk**. Three.js `Quaternion.set(x,y,z,w)` matches directly. Do NOT copy the Python's `(w,−x,−z,−y)` — that's a Blender handedness conversion. Same for the vec3 `(x,z,y)` swizzle, tangent `−w`, and triangle rewind: apply Unity→three.js conversion (if any) as a deliberate, separate pass, not inside the decoder. (Unity and three.js differ in handedness: Unity LHS Y-up, three RHS Y-up — the usual conversion is negate Z of positions/normals, negate x,y of quats... decide once, outside the parser.)
- All counts are **signed** int32 — validate `>= 0`.
- The mesh block's `submesh_count` is a hint; trust the actual `ET_MESH_TRIANGLES` blocks. Triangle blocks give an **index count**; require `% 3 === 0` (mu.py truncates instead — line 529).
- Attribute presence in meshes = block occurrence, no flags. Preallocate `Float32Array(numVerts * k)` per block on first sight (k: verts/normals 3, uv 2, tangents 4, colors 4, boneWeights 4+4 in two arrays).
- Bone weights are **interleaved** `(int32 index, float32 weight) × 4` per vertex — not Unity's struct order of 4 weights then 4 indices.
- Vertex colors are 4 raw bytes RGBA (keep as `Uint8Array` or normalize /255 like mu.py).
- Version gates: keep `version` on the reader context; branch exactly the three gates in §2.1 (materials ≥4, renderer shadow bytes >0, light spotAngle >1). Accept 0–5, reject others with a clear error (don't mimic the `None` return).
- Material/texture tables arrive at the **end** of the stream — store renderer material indices and `MuMatTex.index` raw and resolve after parse.
- Unknown object-tree tags: **throw** (with hex offset) rather than mu.py's silent skip; unknown mesh-block tags and material propTypes likewise. Include `offset.toString(16)` in every parse error — mu.py's `"MuMesh %x"` pattern is genuinely useful.
- Floats can be −0.0, NaN, or denormal; pass through bit-exact where possible.
- Implement the MuCurve `type === 8` legacy fixup if old mods must load (BDB itself is modern/v5); if implemented, prefer the *intended* semantics (prefix-match `"material"`, preserve pre-wrap 8) over the two upstream bugs — but document the deviation.
- No alignment anywhere: never round the cursor.
