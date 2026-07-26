# KSP_CRAFT_PLAN — `.craft`/`.mu` → glTF/GLB converter (`ksp2glb`)

Status: **PLANNED** (research complete 2026-07-26; not yet implemented)
Deliverable: a NEW sibling repo `/Users/asherwin/repos/meow-sci/ksp2glb` (this plan lives in flexo only because flexo is where planning happens).

---

## 0. How to use this plan

This is the master document. It is written so that implementing agents can execute each phase
without re-deriving anything. Byte-level and semantic detail lives in **companion reference
docs** in [`plans/ksp_craft/`](ksp_craft/) — each phase names exactly which companions to read.
Do not start a phase without reading its listed references; do not re-research things the
companions already settle (they were extracted from the actual local corpora and verified).

| Companion | Contents | Read for phases |
|---|---|---|
| [ksp_craft/MU_FORMAT.md](ksp_craft/MU_FORMAT.md) | Complete byte-level `.mu` spec: primitives, varint/strings, all 33 record types, version gates, worked hexdump, TS notes | 2, 4 |
| [ksp_craft/SEMANTICS.md](ksp_craft/SEMANTICS.md) | ConfigNode grammar (§1), craft-import semantics + scale math (§2), **Unity→glTF coordinate conversion with derivations (§3.2)**, texture flip/DXT5nm rules (§4), full KSP shader/property table (§5), known jank (§6) | 1, 3, 4, 5, 6 |
| [ksp_craft/BDB_SURVEY.md](ksp_craft/BDB_SURVEY.md) | BDB corpus census, fixture craft + full part-resolution tables, craft anatomy verbatim, B9PartSwitch usage & verbatim blocks, MM feature histogram, texture census, implementer gotchas (§9) | 1, 5, 6, 7, 8 |
| [ksp_craft/KSP_INSTALL.md](ksp_craft/KSP_INSTALL.md) | Stock KSP 1.12.5 census, stock fixtures (legacy `mesh=`, multi-MODEL, texture-replacement, variants), ModulePartVariants verbatim, PartDatabase.cfg, folder conventions | 1, 5, 6, 7 |
| [ksp_craft/WEB_RESEARCH.md](ksp_craft/WEB_RESEARCH.md) | ModuleManager patch-ordering + syntax authority, B9PartSwitch C# semantics, prior art, licensing | 7, 8 |

Reference checkouts (gitignored, already on disk — the tool must treat all of these as read-only inputs):

| Path | Role |
|---|---|
| `/Users/asherwin/repos/meow-sci/flexo/.tmp-ksp/ksp` | Stock KSP **1.12.5** install (Squad 422 parts + SquadExpansion 143; `Ships/VAB/*.craft` stock craft) |
| `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/Bluedog-Design-Bureau` | BDB mod repo. GameData root is `Gamedata/` (sic); 1438 PART defs, 1818 `.mu`, craft in `Craft Files/` |
| `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/io_object_mu` | Reference Python implementation (GPL — see §12 licensing). Consult only to settle spec ambiguities; the companions already extract everything needed |
| `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/B9PartSwitch`, `.../ModuleManager` | C# sources for variant/patch semantics (cloned for reference) |

**Paths contain spaces** (`Craft Files/`, `M1-3 Pod.dds`, `BD_Extras (No Warranty)`) — always quote.

---

## 1. Mission, goals, non-goals

**Mission.** A headless, reliable CLI that converts KSP's proprietary formats — `.craft`
(vessel), `.mu` (Unity model/mesh/material container), GameData `.cfg` (part database) — into
**glTF 2.0 binary (GLB)** with maximum fidelity, so BDB's Apollo CSM / LM / Saturn V (and any
other stock-or-modded craft) can be brought into Flexo and turned into KSA Parts/SubParts.

**Goals**
- G1: `convert mu` — any single `.mu` → valid GLB (hierarchy, meshes, materials, textures).
- G2: `convert part` — any part name → GLB with cfg-level composition applied (MODEL nodes,
  rescaleFactor, texture replacements, variant choice).
- G3: `convert craft` — any `.craft` → assembled GLB matching **in-game appearance** (variant
  switches honored from craft state; per-part GLB emission for the flexo pipeline).
- G4: **No silent guessing.** Every ambiguity (variant choice, missing part/texture,
  unsupported feature) either resolves from explicit data or fails loud with copy-pasteable
  instructions. `inspect` subcommands are the dry-run mode.
- G5: Lossless-where-possible: anything glTF can't express natively is preserved in
  `extras.ksp*` and the conversion report.
- G6: 100% pass over the local corpora: every stock + BDB `.mu` parses; every stock + BDB
  `.dds`/`.mbm` decodes; fixture craft convert clean.

**Non-goals (v1)**
- Animations and skinned deformation (Phase 10 is specced but **DEFERRED** — user decision).
  Static rest pose only; skinned meshes export rigid.
- IVA interiors (`Spaces/`, `Props/`, `INTERNAL{}`), kerbals, flags-as-agencies, particles FX,
  Waterfall plumes, procedural fairing membranes, struts/fuelLines (CompoundParts render as
  endpoints only — diagnostic).
- Running in a browser. This is Node-only, on a dev machine, pointed at a local KSP install
  the user owns. Nothing from KSP/BDB is ever committed to any repo.
- ModuleManager **full** compatibility. We implement the subset BDB actually uses (census in
  BDB_SURVEY §6) — measured, gated, and loud about what it skips.

---

## 2. Locked decisions (user-approved 2026-07-26 — do not relitigate)

1. **Tool home**: new sibling repo `meow-sci/ksp2glb` at `/Users/asherwin/repos/meow-sci/ksp2glb`.
2. **Variants**: full craft-driven resolution **with a decisions engine**: dry-run mode
   enumerates every choice; unresolved choices ⇒ exit non-zero with exact flags to add (§5).
3. **Animations**: static pose v1. Phase 10 fully specced, deferred.
4. **Language/runtime**: TypeScript executed directly by **Node ≥ 24** (erasable-syntax-only TS:
   no `enum`, no `namespace`, no parameter properties, type-only imports; **relative imports
   carry the `.ts` extension**). No transpiler, no tsx, no bundler. ESM only. pnpm. oxlint + oxfmt.
   Tests: `node:test` runner.
5. **Dependencies**: runtime = `@gltf-transform/core`, `@gltf-transform/extensions`,
   `@gltf-transform/functions` and nothing else. Everything else is **vendored**: ConfigNode
   parser, `.mu` reader, DDS/BCn/MBM/TGA decoders, PNG writer, normal-map reconstruction,
   mini-ModuleManager, B9PartSwitch/ModulePartVariants semantics. Dev-only deps allowed for
   verification (`typescript`, `@types/node`, `oxlint`, `gltf-validator`, `pngjs` as an
   independent PNG decoder for tests).
6. **No Python in the product.** An optional dev-time oracle script using io_object_mu is
   allowed under `tools/oracle/` (§11), never required by any test or workflow.
7. **Output**: GLB, embedded PNG textures. Two profiles: `archival` (default, max fidelity)
   and `flexo` (per-part GLBs + sidecar JSON shaped for flexo's importer — §6.4).
8. **Fail-loud philosophy**: defaults never degrade output silently; every degradation is an
   explicit `--allow-*`/`--defaults` opt-in, and everything degraded is in the report.

---

## 3. Architecture

### 3.1 Pipeline

```
                ┌────────────┐   ┌──────────────┐   ┌─────────────┐
 .cfg corpus ──▶│ ConfigNode │──▶│ GameData DB  │──▶│ Part index  │──────────────┐
 (multi-root)   │ parser     │   │ (URL space,  │   │ (runtime-   │              │
                └────────────┘   │  :NEEDS pass,│   │  name keyed)│              ▼
                                 │  mini-MM ph8)│   └─────────────┘      ┌──────────────┐
                                 └──────────────┘                        │ Part model   │
 .craft ──▶ craft parser ──▶ part instances (pos/rot/uid/module snaps) ─▶│ composition  │
                                        │                                │ (MODEL nodes,│
                                        ▼                                │  rescale)    │
                                 decisions engine ◀── CLI --choose ──────└──────┬───────┘
                                 (variants, jettison,                           │
                                  policies)                                     ▼
                                        │                          .mu reader ──▶ MuModel
                                        ▼                                        │
                              visibility resolution                              ▼
                              (B9PS transforms, DisableTransform,   texture resolve+decode
                               PartVariants GAMEOBJECTS)            (DDS/MBM/TGA/PNG → PNG)
                                        │                                        │
                                        └────────────┬───────────────────────────┘
                                                     ▼
                                        glTF builder (@gltf-transform)
                                        coords Unity→glTF · materials map ·
                                        extras.ksp · dedup/prune
                                                     │
                                     ┌───────────────┴────────────────┐
                                     ▼                                ▼
                               craft.glb / part.glb            report.json + report.md
                                     ▼
                             (flexo profile: per-part GLBs + <part>.ksp.json + layout.json)
```

### 3.2 Repo layout (create exactly this)

```
ksp2glb/
  package.json  tsconfig.json  .oxlintrc.json  .gitignore  README.md
  fixtures.local.json.example        # committed; real fixtures.local.json is gitignored
  docs/spec/                         # Phase 0 copies the 5 companion docs here verbatim
  src/
    cli/main.ts                      # subcommand dispatch (node:util parseArgs), shebang
    cli/args.ts                      # shared flag definitions + help text
    cli/commands/{inspectMu,inspectPart,inspectCraft,convertMu,convertPart,convertCraft,decodeTex,doctor}.ts
    util/cursor.ts                   # binary cursor (LE reads, varint, string, EOF typing)
    util/diag.ts                     # Diagnostics collector (codes, severities, subjects)
    util/text.ts                     # UTF-8-with-Latin-1-fallback decode, BOM strip, CRLF
    util/hash.ts                     # fnv1a64 / sha256 helpers
    util/png.ts                      # vendored PNG encoder (RGBA8, node:zlib)
    cfg/configNode.ts                # parser → ConfigNode {name, values[], nodes[]}
    cfg/needs.ts                     # :NEEDS[...] evaluation + strip pass for base cfgs
    gamedata/db.ts                   # multi-root virtual GameData, URL index (files by url)
    gamedata/partIndex.ts            # PART defs, runtime-name mapping, dup handling
    mu/enums.ts  mu/types.ts  mu/reader.ts  mu/stats.ts
    tex/dds.ts  tex/bcn.ts  tex/mbm.ts  tex/tga.ts  tex/normalmap.ts  tex/resolve.ts  tex/toPng.ts
    parts/model.ts                   # MODEL/mesh= composition, rescaleFactor, texture= repl
    parts/attach.ts                  # node_stack_*/node_attach/NODE{} extraction
    craft/parse.ts  craft/assemble.ts
    variants/{b9ps.ts,partVariants.ts,jettison.ts,visibility.ts,decisions.ts}
    mm/{order.ts,selectors.ts,patch.ts,vars.ts}          # Phase 8
    gltf/{coords.ts,convert.ts,materials.ts,extras.ts,profileFlexo.ts}
    report/report.ts
  tools/oracle/                      # OPTIONAL python cross-check (§11); quarantined
```

Unit tests live next to code as `*.test.ts`. Corpus-wide tests are `*.world.test.ts` (separate
script, skipped unless fixtures configured). Synthetic binary fixtures live in
`src/**/testdata/` as small committed files built by `testdata/gen.ts` scripts (so they are
reproducible and reviewable — never commit bytes copied from KSP/BDB).

### 3.3 Core types (shape, not law — refine while implementing)

```ts
// util/diag.ts
type Severity = 'error' | 'warn' | 'info';
interface Diagnostic { code: string; severity: Severity; subject: string; message: string; suggestion?: string; file?: string; line?: number }
class Diagnostics { add(d: Diagnostic): void; errors(): Diagnostic[]; throwIfErrors(context: string): void; toJSON(): Diagnostic[] }

// variants/decisions.ts
interface DecisionSubject { kind: 'partInstance' | 'partType'; runtimeName: string; uid?: string }
type DecisionDomain =
  | { kind: 'b9ps'; moduleId: string }
  | { kind: 'stockVariant' }
  | { kind: 'jettison'; moduleIndex: number };
interface Decision {
  subject: DecisionSubject; domain: DecisionDomain; options: string[];
  resolvedBy?: 'craft' | 'craft-default' | 'flag' | 'defaults-flag' | 'auto';
  chosen?: string;   // undefined ⇒ UNRESOLVED
  flagHint: string;  // ready-to-paste --choose string
}
```

### 3.4 Determinism (applies everywhere)

- Directory scans sorted (`readdir` + sort); Map iteration insertion-ordered from sorted input.
- glTF resource order: nodes in mu/craft stream order; materials/textures in first-use order.
- No timestamps, hostnames, or absolute paths inside GLB binaries (reports may carry them).
- Pin exact dep versions in `pnpm-lock.yaml`; GLB goldens are **structural** (JSON summaries),
  never byte hashes of gltf-transform output. Byte hashes are fine for our own outputs (PNG).
- `Math.random`/`Date.now` forbidden in conversion paths (lint rule or grep gate in CI test).

---

## 4. Format cheat-sheet (details in companions — this is the 60-second orientation)

- **ConfigNode** (`.cfg`, `.craft`): line-based `key = value` + named `{}` blocks. `//`
  comments (also trailing after values). Duplicate keys/nodes are ordered and significant.
  Values are raw rest-of-line (may contain spaces, brackets, `=`, `|`). Encodings: UTF-8 or
  Latin-1 (7 stock craft!), optional BOM, CRLF. SEMANTICS §1.
- **`.mu`**: little-endian tagged stream. Header `int32 magic=76543, int32 version(0..5),
  string name`, then a recursive object tree; strings are .NET 7-bit-varint length-prefixed
  UTF-8; quaternions on disk are `x,y,z,w`; materials+texture tables sit at the END of the
  file (indices resolve after parse). NOT skippable — unknown tag ⇒ must throw. MU_FORMAT.
- **Craft**: header + flat `PART{}` list. `part = <runtimeName>_<uid>` where runtimeName =
  cfg `name` with `_`→`.` (KSP PartLoader rename). `pos`/`rot` are **vessel-absolute**
  (quat x,y,z,w). Module snapshots carry variant selections (`currentSubtype`,
  `selectedVariant`). SEMANTICS §2, BDB_SURVEY §4, KSP_INSTALL §3.
- **Part cfg → geometry**: `MODEL{}` nodes (model/position/rotation°/scale/texture-replace) or
  legacy `mesh =`; effective mesh scale = `MODEL.scale × rescaleFactor`; **rescaleFactor
  defaults to 1.25 when absent**; part-level `scale` only affects attach-node coords. SEMANTICS §2.3–2.4.
- **Coordinates**: Unity LH Y-up → glTF RH Y-up via **negate-Z**: `p→(x,y,−z)`,
  `q→(−x,−y,z,w)`, tangent `→(x,y,−z,−w)`, triangles `(a,b,c)→(a,c,b)`, UV `v→1−v`.
  Full derivation + worked checks: SEMANTICS §3.2.
  ⚠ CONVENTION NOTE: UnityGLTF negates **X** instead (`p→(−x,y,z)`, `q→(x,−y,−z,w)`,
  tangent `(−x,y,z,−w)` — WEB_RESEARCH §8); both are valid mirrors differing by a 180° yaw.
  We deliberately use **negate-Z**: Unity forward (+Z) lands on glTF/KSA forward (−Z), and
  mu lights/cameras need no orientation fixups. Do NOT "fix" this to match UnityGLTF, and
  never mix the two recipes — one convention everywhere, pinned by the Phase 4 tests.
- **Textures**: DDS is DXT1/DXT5 only across both corpora (stock 1061: 873/188; BDB sample:
  82%/18%, zero DX10). KSP DDS/MBM store rows **bottom-up** → reverse row order when encoding
  PNG; PNG sources pass through byte-identical (see §8 Phase 3 for the derivation test).
  Normal maps are DXT5nm (X in **alpha**, Y in green) → reconstruct RGB. SEMANTICS §4.
- **Variants**: B9PartSwitch SUBTYPE `transform =` lists toggle mu GameObjects;
  `ModuleB9DisableTransform` hides permanently; stock `ModulePartVariants` VARIANT
  `GAMEOBJECTS{}` toggles + `TEXTURE{}` swaps. BDB_SURVEY §5, KSP_INSTALL §6, WEB_RESEARCH.

---

## 5. CLI specification

One binary, `ksp2glb` (`src/cli/main.ts`, shebang `#!/usr/bin/env node`).

### 5.1 Data roots

- `--ksp <dir>` — KSP install root **or** a GameData dir (auto-detect: if `<dir>/GameData`
  exists use that). Optional but recommended (stock parts, stock craft).
- `--mod <dir>` — additional GameData overlay root; repeatable, later roots win on URL
  collisions. For BDB pass its `Gamedata` dir. A root may also be a mod folder itself
  (auto-detect: if it contains no `*/` with cfgs but is itself a mod tree, mount as
  `GameData/<basename>`); keep detection simple and log what was mounted.
- Roots merge into one **virtual GameData URL space** (forward-slash relative paths, no
  extension for model/texture URLs — see Phase 1).

### 5.2 Commands

```
ksp2glb doctor        --ksp … --mod …                 # validate roots, print census
ksp2glb inspect mu    <file.mu>    [--json]           # parsed structure dump
ksp2glb inspect part  <partName>   [--json]           # resolution: cfg→MODELs→mu→textures→decisions
ksp2glb inspect craft <file.craft> [--json]           # THE dry-run: full resolution + decision table
ksp2glb convert mu    <file.mu>    -o out.glb
ksp2glb convert part  <partName>   -o out.glb  [--choose …] [--defaults]
ksp2glb convert craft <file.craft> -o out(.glb|dir)  [--choose …] [--defaults] [--emit craft|parts|both]
ksp2glb decode tex    <url|file>   -o out.png         # texture debugging (applies KSP decode rules)
```

### 5.3 Flags (global unless noted)

| Flag | Meaning |
|---|---|
| `--choose "<subject>:<domain>=<option>"` | Resolve one decision. `subject` = runtime part name, `name#uid`, or `*` (all instances of all parts where the domain exists). `domain` = B9PS `moduleID`, `variant` (stock), or `jettison[<i>]`. Repeatable. |
| `--choices <file.json>` | Same as many `--choose` (JSON array of `{subject,domain,option}`) |
| `--defaults` | Accept cfg defaults for all otherwise-UNRESOLVED decisions (explicit opt-in) |
| `--emit craft\|parts\|both` | craft mode: one assembled GLB (default), per-part GLBs + `layout.json`, or both |
| `--profile archival\|flexo` | Output profile (§6). Default `archival`. `flexo` implies `--emit parts` |
| `--allow-missing-parts` | Missing part ⇒ empty placeholder node + report entry (else error E100) |
| `--allow-missing-textures` | Missing texture ⇒ 4×4 magenta placeholder + report entry (else error E102) |
| `--assume-mod <name>` | Treat `<name>` as installed for `:NEEDS` evaluation (repeatable) |
| `--no-mm` | Skip the mini-MM patch pass (Phase 8+; base `:NEEDS` key stripping still runs) |
| `--colliders extras\|nodes\|omit` | Default `extras`: collider params recorded on parent node extras only. `nodes`: also emit hidden nodes (mesh colliders incl. geometry). |
| `--lights on\|off` | KHR_lights_punctual emission. Default on (archival) / off (flexo) |
| `--keep-origin` | Don't recenter craft on root part (default recenters: root part at origin) |
| `--report <path>` | Write `report.json` + `report.md` (default `<out>.report.{json,md}`) |
| `--json` | Machine output on stdout for `inspect`/`doctor` |
| `--verbose` | Debug logging to stderr |

### 5.4 Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (warnings allowed; they're in the report) |
| 1 | **Unresolved decisions** — output lists each with a ready-to-paste flag |
| 2 | Resolution errors (missing parts/models/textures without allow-flags; unknown subtype name) |
| 3 | Parse/internal errors (malformed mu/cfg/craft, bug) |

### 5.5 Decision-surfacing UX (the user's core requirement — implement exactly this shape)

`inspect craft` always prints the full decision table with provenance. Example (part mode,
where craft state is absent):

```
$ ksp2glb inspect part bluedog.Apollo.Block2.SM --ksp … --mod …
Part bluedog.Apollo.Block2.SM  (Bluedog_DB/Parts/Apollo/bluedog_Apollo_Block2_SM.cfg)
  MODEL Bluedog_DB/Parts/Apollo/bluedog_Apollo_Block2_SM  → ok (.mu found)
  rescaleFactor 1

Decisions (5 domains, 5 UNRESOLVED):
  SUBJECT                        DOMAIN                 OPTIONS                          STATE
  bluedog.Apollo.Block2.SM       b9ps:meshSwitchSIMbay  Historical | Empty | Universal Storage   UNRESOLVED
  bluedog.Apollo.Block2.SM       b9ps:configSwitch      …                                        UNRESOLVED
  …

error: 5 unresolved decisions. Resolve with e.g.:
  --choose "bluedog.Apollo.Block2.SM:meshSwitchSIMbay=Historical"
  …one line per decision, first option prefilled…
or pass --defaults to accept each module's default subtype.
(exit 1)
```

Resolution precedence per decision: **craft module snapshot** (`currentSubtype` /
`selectedVariant` string match) → `--choose` flag (flag beats craft only with an explicit
`subject#uid`; warn otherwise) → `craft-default` (module snapshot present but selection key
absent — older saves; KSP deterministically uses the cfg default, so we do too, logged as
INFO) → `--defaults` flag → otherwise **UNRESOLVED**. A craft-supplied subtype name that
doesn't exist in the cfg is exit-2 with the valid options listed. `convert craft` on a normal
craft therefore needs **zero flags** — craft state resolves everything, and the table shows it.

---

## 6. Output specification

### 6.1 GLB conventions (both profiles)

- glTF 2.0 GLB, +Y up, metres, right-handed, CCW front faces. Node hierarchy mirrors the mu
  GameObject tree verbatim (names untouched in archival); part instances are
  `<runtimeName>#<uid>` nodes; craft root node named after `ship`.
- Meshes: one glTF Mesh per mu mesh; one Primitive per submesh; attributes POSITION, NORMAL,
  TEXCOORD_0, TEXCOORD_1 (if uv2), TANGENT (if present in mu), COLOR_0 (if vertex colors).
  Indexed, uint16/uint32 as needed.
- Primitive→material pairing: `materials[min(i, materials.length-1)]` with W201 diagnostic on
  count mismatch (see Phase 4 census task).
- Shared geometry: one part type + one variant/texture state ⇒ one set of Mesh/Material
  objects reused by every instance node. Run `dedup()` + `prune()` from
  `@gltf-transform/functions` before write.
- Textures embedded as PNG. Slot color spaces per glTF spec (baseColor/emissive sRGB, rest
  linear). MuMatTex tiling/offset → `KHR_texture_transform` with V-flip compensation:
  `offset'.y = 1 − offset.y − scale.y`, scale unchanged (identity transforms omitted).
- Extensions used (archival): `KHR_materials_specular`, `KHR_materials_unlit`,
  `KHR_materials_emissive_strength` (only when factor > 1), `KHR_lights_punctual`,
  `KHR_texture_transform`. Flexo profile: **none** (flexo's importer warns on all of them).

### 6.2 `extras` schema (archival profile; version everything)

```ts
// glTF asset.extras
{ ksp2glb: { version: 1, profile: 'archival'|'flexo',
    sources: { ksp?: { path: string; version: string }, mods: { path: string; mounted: string }[] },
    craft?: { file: string; ship: string; kspVersion: string },
    decisions: Decision[] } }

// part-instance node extras
{ ksp: { part: { name: string; runtimeName: string; uid: string; cfgUrl: string; title?: string },
    rescaleFactor: number,
    attachNodes: { id: string; kind: 'stack'|'surface'; position: [x,y,z]; direction: [x,y,z]; size?: number }[],
    modules: string[],                       // module names in cfg order
    variants: { domain: string; chosen: string; options: string[] }[] } }

// mu-GameObject node extras (only when non-default)
{ ksp: { tag?: string; layer?: number; skinnedRigid?: true;
    colliders?: ({ type: 'box'; center: V3; size: V3 } | { type: 'sphere'; center: V3; radius: number }
               | { type: 'capsule'; center: V3; radius: number; height: number; direction: 0|1|2 }
               | { type: 'mesh'; convex: boolean; triangles: number }
               | { type: 'wheel'; center: V3; radius: number; suspensionDistance: number })[] ,
    camera?: {...MuCamera fields}, light?: {...MuLight fields} } }

// material extras — ALWAYS present (lossless dump)
{ ksp: { shader: string,
    properties: Record<string, { type: 'color'|'vector'|'float'|'texture';
                                 value?: number|[number,...]; url?: string; scale?: [x,y]; offset?: [x,y] }>,
    replacedBy?: { source: 'MODEL-texture'|'b9ps-TEXTURE'|'variant-TEXTURE'; url: string }[] } }
```

All positions/directions in extras are **already converted** to glTF space (document this in
README so nobody double-converts).

### 6.3 Report (`report.json` + human `report.md`)

```
{ tool: {name, version}, invocation: argv, inputs, decisions: Decision[],
  diagnostics: Diagnostic[],
  parts: [{runtimeName, uid, cfgUrl, models: [url], status: 'ok'|'placeholder'}],
  textures: [{url, sourceFormat: 'DXT1'|'DXT5'|'MBM24'|'MBM32'|'PNG'|'TGA', width, height,
              disposition: 'embedded'|'placeholder', normalMap: boolean}],
  materials: [{name, shader, mapping: 'pbr'|'unlit'|'fallback'}],
  coverage: {partCount, meshNodes, trianglesTotal, skinnedRigid: n, particlesSkipped: n,
             camerasRecorded: n, collidersRecorded: n},
  timings: {...} }
```

`report.md` renders the same content grouped by severity, decision table first. The report is
the fidelity contract — anything skipped/approximated MUST appear here (G5).

### 6.4 Flexo profile (`--profile flexo`)

Purpose: land KSP parts in flexo's importer with zero friction. Authority for these
constraints: flexo `docs/importing-models.md` + `docs/custom-assets.md` (verified against
`src/ksa/importPlan.ts` / `importNormalize.ts` / `importMaterials.ts` on branch feature/glowy).

Differences from archival:
1. **One GLB per part type** (flexo: one file = one import = one project/Part; multi-file
   drops rejected). Craft mode writes `<outdir>/<partName>.glb` per unique part +
   `<outdir>/<craft>.layout.json` with instance transforms
   (`{parts: [{ref: 'name#uid', glb, translation, rotationXYZW, scale}]}`).
2. Attributes: POSITION/NORMAL/TEXCOORD_0 **only** (strip TANGENT/COLOR_0/UV2 — flexo deletes
   them anyway; W208 when dropped data existed). Indexed always. No negative-determinant node
   transforms (bake mirrored geometry — but see E140: mirror never occurs in corpus).
3. Names are the API: node names `flexo`-safe ASCII `[A-Za-z0-9_]` (collapse runs, strip
   edges), stable across re-runs: `<partName>_<muNodeName>` (+ `_<n>` on collision). Material
   names stable + meaningful. (Re-import matching key is `(nodeName, materialName)`.)
4. Textures: embedded PNG, **≤2048 long edge** (downscale with 2×2 box like flexo; W-diag),
   power-of-two preferred (warn if source isn't). Emissive: keep `emissiveFactor` modest —
   flexo composes glow as white×mask; strong factors blow out (their docs recommend
   strength ≈ 0.2–0.4 post-import; we just pass through and note in report).
5. Materials: baseColor tex/factor; `roughnessFactor` = `sqrt(1 − _Shininess)` approx,
   `metallicFactor` 0; normal map as standard glTF normal (`scale` 1 — flexo owns the X-flip
   at its own encode step); emissive tex×factor. No extensions, no alphaMode MASK (flexo
   errors — convert Cutoff shaders to BLEND + W-diag), no KHR_texture_transform (bake by
   pre-transforming UVs when non-identity, else warn).
6. **Sidecar `<partName>.ksp.json`** (flexo reads glTF `extras` nowhere; sidecar is the
   forward-compatible carrier): part name/title/cfgUrl, attachNodes (glTF space), collider
   primitives (box/sphere/capsule/mesh-summary), `mass`, `cost`, module name list, decisions
   applied, texture provenance. Schema = the extras schema §6.2 re-rooted, `{version: 1}`.

---

## 7. Repo scaffold (Phase 0 content — exact files)

`package.json`:

```jsonc
{
  "name": "ksp2glb", "version": "0.1.0", "private": true, "type": "module",
  "license": "GPL-2.0-or-later",          // see §12 — derived-from-io_object_mu posture
  "engines": { "node": ">=24" },
  "bin": { "ksp2glb": "./src/cli/main.ts" },
  "scripts": {
    "ksp2glb": "node src/cli/main.ts",
    "test": "node --test src/**/*.test.ts",
    "test:world": "node --test src/**/*.world.test.ts",
    "typecheck": "tsc --noEmit",
    "lint": "oxlint",
    "fmt": "oxfmt ."
  },
  "dependencies": {
    "@gltf-transform/core": "^4.2.0",
    "@gltf-transform/extensions": "^4.2.0",
    "@gltf-transform/functions": "^4.2.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0", "@types/node": "^24.0.0",
    "oxlint": "latest", "gltf-validator": "^2.6.0",
    "pngjs": "^7.0.0", "@types/pngjs": "^6.0.0"
  }
}
```

`tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "target": "es2023", "lib": ["es2023"], "module": "nodenext", "moduleResolution": "nodenext",
    "types": ["node"], "strict": true, "noUncheckedIndexedAccess": true,
    "erasableSyntaxOnly": true, "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true, "noEmit": true, "skipLibCheck": true
  },
  "include": ["src", "tools"]
}
```

Rules that follow from this config (state them in README for agents): relative imports MUST
end in `.ts`; no `enum` (use `const … = {...} as const` + union types — mu enums are plain
`const` maps); no `namespace`; no constructor parameter properties; `import type` for types.

`fixtures.local.json.example`:

```json
{
  "ksp": "/Users/asherwin/repos/meow-sci/flexo/.tmp-ksp/ksp",
  "bdb": "/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/Bluedog-Design-Bureau"
}
```

Test helper `src/util/fixtures.ts`: loads `fixtures.local.json` (or `KSP2GLB_FIXTURES` env
JSON), exposes `stockPath(rel)` / `bdbPath(rel)`; when absent, world tests call
`t.skip('fixtures.local.json not configured — copy fixtures.local.json.example')`.

`.gitignore`: `node_modules/`, `fixtures.local.json`, `out/`, `*.glb`, `*.report.*` (outputs
never committed — they are KSP/BDB-derived; see §12).

---

## 8. Phases

Sequential; each phase's DoD gates the next. Within a phase, tasks are ordered but an agent
may parallelize where files don't overlap. **Every phase ends with: `pnpm lint`, `pnpm
typecheck`, `pnpm test` green, and the phase's world/DoD commands executed with output pasted
into the PR/commit message.**

---

### Phase 0 — Repo scaffold & shared kit

**Read first:** §3.2, §7 above. No companions needed.

Tasks:
1. `git init` the repo at `/Users/asherwin/repos/meow-sci/ksp2glb` (branch `main`); commit the
   scaffold from §7 (package.json, tsconfig, oxlint config `{ }` defaults, .gitignore, README
   stub stating mission + the §2 locked decisions + the import-extension rule).
   `pnpm install`; verify `pnpm ksp2glb` prints help and `node --version` ≥ 24.
2. Copy the 5 companion docs from `flexo/plans/ksp_craft/` into `docs/spec/` verbatim (the
   tool repo must be self-sufficient; flexo checkout not required to work on it).
3. `util/cursor.ts`: `class Cursor { buf: Uint8Array; off: number }` with `u8 i32 u32 f32
   vec2 vec3 quatRaw tangentRaw color4f varint str bytes(n) remaining() expectEof()`.
   All little-endian via one shared `DataView`. Errors: `MuEofError` (distinct class) on any
   short read; `varint` capped at 5 bytes (throw beyond — MU_FORMAT §1.1); `str` = varint
   byte length + UTF-8 decode; all counts validated `>= 0`. Every throw includes
   `offset 0x<hex>`.
   Tests: varint vectors `[0x00→0]`, `[0x7f→127]`, `[0x80,0x01→128]`, `[0xff,0xff,0xff,0xff,0x0f→u32max]`,
   6-byte varint throws; string round-trip incl. 2-byte UTF-8; EOF typing.
4. `util/text.ts`: `decodeText(bytes)` → try strict UTF-8 (`TextDecoder('utf-8',{fatal:true})`),
   on failure decode Latin-1; strip leading BOM (`﻿` or raw EF BB BF); normalize is NOT
   applied (keep bytes faithful); tolerate `\x1a`. Tests: UTF-8, Latin-1 high-byte, BOM.
5. `util/diag.ts` per §3.3 + the diagnostic **code catalog** (§10) as a typed const map.
6. `cli/main.ts` + `args.ts`: parseArgs-based dispatch, `--help` per command, exit-code
   plumbing (§5.4). `doctor` stub. No business logic yet.

DoD: `pnpm test` green; `pnpm ksp2glb --help` renders all §5.2 commands.

---

### Phase 1 — ConfigNode parser + GameData database

**Read first:** SEMANTICS §1 (grammar + edge cases), BDB_SURVEY §9 (gotchas 2,3,12),
KSP_INSTALL §9 (folder conventions, encodings).

Tasks:
1. `cfg/configNode.ts`. Implement the io_object_mu grammar (SEMANTICS §1 is the contract):
   tokens `{ } =`; `//` comments anywhere; value = raw rest-of-line after `=`, trimmed,
   comment-stripped, possibly empty; `{`/`}`/`=` literal inside values; duplicate keys/nodes
   preserved in order; node name may be multi-token (raw slice); brace on same or next line;
   BOM/`\x1a` tolerated mid-stream; CRLF transparent. API:
   `parseConfig(text, filename) → CfgNode` where
   `CfgNode = { name: string; values: {key,value,line}[]; nodes: CfgNode[]; line: number }`
   (anonymous root wrapper). Helpers `get/getAll/getNode/getNodes` (first-match get).
   Errors carry `file:line`.
   Unit tests (synthetic strings): every edge case in SEMANTICS §1.4 individually + verbatim
   snippets from the companions: the EVAFloodlight PART block (BDB_SURVEY §4b), the Rockomax32
   VARIANT block with bracketed/spaced texture URLs (KSP_INSTALL §6), `rescaleFactor = 0.75 //…`
   trailing comment, `ship = #autoLOC_501232 //… = Kerbal X`, empty value, `a = b = c`.
2. `cfg/needs.ts`: `:SUFFIX` handling on keys and node names **of non-patch cfgs**:
   `parentID:NEEDS[!RealFuels] = …` → evaluate NEEDS expression against the mod-name set
   (Phase 1 mod set = mounted root names + their top-level folder names + `--assume-mod`;
   `!` negation, `&`/`,` AND, `|` OR, case-insensitive); satisfied ⇒ keep key with suffix
   stripped; unsatisfied ⇒ drop the key/node. Other `:X[...]` suffixes on keys in base cfgs:
   leave untouched (only MM patch nodes use them; Phase 8's parser owns those).
   Tests: the `parentID:NEEDS[!RealFuels]` line from BDB_SURVEY §6.6 with and without
   `--assume-mod RealFuels`.
3. `gamedata/db.ts`: mount roots (§5.1 semantics); build the virtual tree:
   `urlOf(file) = <mount>/<relpath-without-ext>` with forward slashes;
   indexes: `filesByUrl: Map<url, {abs, ext}[]>` (all extensions grouped),
   `modelsByUrl` (`.mu`), `musByDir`, `cfgs: parsed lazily with cache`. Skip files/dirs
   starting with `.` or `_` at any depth (KSP loader rule, SEMANTICS §2.2) — note this hides
   `__MACOSX` etc. Duplicate URL across roots: later mount wins + I-diag.
4. `gamedata/partIndex.ts`: scan all cfgs; for every **top-level** `PART` node with a `name`,
   register `{cfgName, runtimeName: cfgName.replaceAll('_','.'), cfgUrl, node}`.
   Duplicate runtimeName: first wins + W-diag (matches KSP; BDB_SURVEY §9.9). Also index
   top-level `PARTUPGRADE` separately (never a part — the one BDB name collision is
   PART vs PARTUPGRADE).
5. `cli/commands/doctor.ts`: mount roots, print census: cfg files parsed / parse failures,
   PART count per mount, `.mu` count, texture counts by ext. Cross-check option
   `--against-partdb`: parse `<ksp>/PartDatabase.cfg` `url =` lines and report parts present
   there but missing from our index (KSP_INSTALL §7).
6. World tests (`cfg.world.test.ts`): parse **every** cfg under stock + BDB with zero throws;
   assert PART counts exactly: Squad **422**, SquadExpansion **143**, BDB Gamedata **1438**
   (update goldens only with a comment explaining why). Assert the 7 Latin-1 stock craft parse
   (`ComSat Lx.craft` etc. — they're ConfigNode files too).

DoD: `pnpm test` + `pnpm test:world` green with fixtures configured; `doctor` census output
committed into `docs/CENSUS.md` for reference.

---

### Phase 2 — `.mu` reader

**Read first:** MU_FORMAT (entire — it is the contract), SEMANTICS Appendix.

Tasks:
1. `mu/enums.ts`: every constant from MU_FORMAT §3 as `const` objects (`ET`, `ST`, `AT`, `TT`,
   `ShaderNames` value↔name maps). `mu/types.ts`: interfaces mirroring MU_FORMAT §5 records
   **raw** (on-disk values: quats x/y/z/w as read, no conversion, Unity conventions— the
   converter applies coordinate changes later; MU_FORMAT §1.3 warning).
2. `mu/reader.ts`: `readMu(bytes, {path}) → MuModel`. Follow MU_FORMAT §4 exactly:
   header (magic 76543, version 0..5 else throw E120 with found values), recursive object
   loop, EOF legal ONLY at root entry-tag position; **throw** on: unknown entry tag, unknown
   mesh block tag, unknown material propType, missing ET_MESH_START, `indexCount % 3 !== 0`,
   negative counts (deviations from the tolerant Python are deliberate — MU_FORMAT §8/§10).
   Version gates: exactly the three in MU_FORMAT §2.1. Materials/textures tables file-global,
   indices resolved post-parse (validate in range; throw E120 otherwise). Old-style materials
   (v≤3) per MU_FORMAT §5.9.2 including ST layout table; `ST_CUSTOM` ⇒ clear error.
   Implement the MuCurve `type==8` legacy fixup with the **intended** semantics
   (prefix-match `"material"`) and record a diagnostic when triggered (MU_FORMAT §5.10).
3. `mu/stats.ts`: per-file summary {version, nodeCount, meshCount, tris, entryTagHistogram,
   shaderNames, textureNames+types, clipNames, skinned?, particles?, matTexScaleOffsetNonIdentity?}
   + corpus aggregation.
4. `cli/commands/inspectMu.ts`: tree render (names, components per node) + `--json` full dump.
5. Unit tests: the annotated worked example — parse
   `bdbPath('Gamedata/Bluedog_DB/Parts/Apollo/bluedog_Apollo_AARDV_Antenna.mu')` (23,313 B)
   and assert: magic ok, version **5**, model name `bluedog_Apollo_AARDV_Antenna`, root
   transform name `AARDV_Antenna`, root localPosition.x ≈ −2.62, identity rotation
   (x,y,z,w = −0,−0,−0,1 — assert via Object.is for −0 where cheap), first entry = tag/layer
   `Untagged`/0 (MU_FORMAT §9 is the expected-value source). Golden structural parse of
   `stockPath('GameData/Squad/Parts/Utility/ladderRadial/model.mu')` (12,419 B) and
   `Mk1-3.mu` (190,011 B) — record node/mesh/material counts as goldens on first successful
   parse (commit with the numbers reviewed via `inspect mu`).
   Synthetic corrupt-buffer tests (bytes built in-test): unknown tag → error contains hex
   offset; truncated mid-record → MuEofError; negative count; non-multiple-of-3 indices;
   6-byte varint.
6. World test (`mu.world.test.ts`): parse **every** `.mu` under stock (551 + 151) and BDB
   (1818) — zero failures (G6 gate); assert `cursor.remaining() === 0` (full-file coverage)
   for every file; aggregate stats and write `docs/MU_CENSUS.md` (entry-tag histogram, shader
   name histogram, version histogram, count of files with: skins, particles, vertex colors,
   uv2, non-identity MuMatTex scale/offset, submesh/material count mismatches). These census
   numbers directly parameterize Phases 3/4 decisions — the task is not done until the doc is
   generated and committed.
7. OPTIONAL (skippable): `tools/oracle/dump_mu.py` — 30-line io_object_mu-based JSON dumper +
   `oracle.test.ts` comparing our parse of 10 sampled files (names/counts/first-verts) —
   auto-skips when `python3` or io_object_mu path is unavailable. Never a CI gate.

DoD: world parse 100% pass; `MU_CENSUS.md` committed; `inspect mu` usable for debugging.

---

### Phase 3 — Texture decoding

**Read first:** SEMANTICS §4 (flips, DXT5nm, MBM), BDB_SURVEY §7, KSP_INSTALL §4.

Tasks:
1. `tex/dds.ts`: parse the 128-byte header (magic `DDS `, height@12, width@16, flags,
   mipMapCount@28, pixelformat fourCC@84, masks). Accept fourCC `DXT1`→BC1, `DXT5`→BC3,
   and fourCC 0 with 32-bit masks (uncompressed BGRA) — anything else (incl. `DX10`) ⇒ E130
   with the fourCC in the message (corpus says this never fires; keep it loud). Decode top
   mip only.
2. `tex/bcn.ts`: vendored BC1 + BC3 block decoders.
   BC1: 2×u16 RGB565 endpoints + 32-bit 2-bit selectors; 4-color mode when c0>c1, else
   3-color+transparent-black. BC3: 8-byte alpha block (2×u8 endpoints + 48-bit 3-bit
   selectors; 8-alpha mode when a0>a1 else 6-alpha+0+255) + BC1-style color block (always
   4-color mode in BC3). Output RGBA8 rows top-to-first-block-row (file order).
   Unit tests with hand-computed vectors — commit these exact cases:
   - BC1 block `[0x00,0xF8, 0x1F,0x00, 0b01010101 ×4]` (c0=pure red 0xF800, c1=pure blue
     0x001F, all selectors=1) ⇒ all 16 texels = pure blue (255 exact: r=0,g=0,b=255,a=255).
   - BC1 3-color mode: c0=0x0000, c1=0xFFFF (c0<=c1), selectors=3 ⇒ transparent black (0,0,0,0).
   - BC3 alpha: a0=255,a1=0 (8-mode), selector 0 ⇒ 255; selector 1 ⇒ 0; selector 2 ⇒ 219
     (=(6·255+1·0)/7=218.57→ use exact integer formula ((7-i)·a0 + i·a1 + 3)/7? NO —
     use the D3D formula `((8-i)*a0 + (i-1)*a1)/7` for i=2..7; assert 219 for i=2 with
     integer division semantics — document the chosen rounding in code and test it).
   - One 8×8 two-block-row image to verify block→pixel placement (block (1,0) lands at x=4..7).
3. `tex/mbm.ts`: header `<5i` magic 0x50534B03, width, height, bumpFlag, bpp(24|32); payload
   raw RGB(A) rows (SEMANTICS §4.1). bpp 24 → expand A=255. Keep bumpFlag on the result.
4. `tex/tga.ts`: minimal — uncompressed type-2 (and type-10 RLE ⇒ E131 unless trivial),
   16/24/32bpp, honor origin bit (bottom-up default). Corpus contains ZERO tga — this exists
   only because the mu extension-fallback chain can reach it; keep it under 80 lines.
5. `util/png.ts`: RGBA8 encoder: IHDR (bit depth 8, color type 6), IDAT via
   `node:zlib.deflateSync` (level 9), filter byte 0 per row, CRC via `zlib.crc32`, IEND.
   Test: encode 2×2 known pixels → decode with `pngjs` (dev dep) → identical; also decode a
   pngjs-encoded buffer of random pixels round-trip.
6. `tex/toPng.ts` — THE orientation contract. KSP DDS/MBM store rows **bottom-up** (file row 0
   = image bottom; that's why they look flipped in normal viewers). We flip V on every UV
   (`v→1−v`, SEMANTICS §3.2), so PNG output must be **upright**: reverse row order for
   DDS/MBM; PNG passthrough byte-identical (no re-encode — copy source bytes into the GLB);
   TGA per its origin bit. Encode the worked example as a test: build a synthetic 1×2 DDS
   (uncompressed RGBA) whose file-order rows are [red],[blue] ⇒ output PNG row 0 must be
   **blue** (blue was bottom in file order ⇒ top when upright ⇒ wait — work it through in the
   test comment: file row 0 = bottom = red at bottom, blue at top ⇒ PNG row 0 (top) = blue).
   A texel sampled at Unity v≈1 (top) has glTF v'≈0 → samples PNG row 0 → blue. Consistent.
7. `tex/normalmap.ts`: DXT5nm→RGB reconstruction: `x=2A−1, y=2G−1,
   z=sqrt(max(0,1−x²−y²))`, output `rgb=((x+1)/2,(y+1)/2,(z+1)/2)`, a=255.
   Trigger rule (record which fired in the report): mu texture `type===1` (TT_NORMAL_MAP) OR
   bound to a `_BumpMap`-like slot OR basename ends `_NRM|_nrm|_n` (BDB census: 481 `_NRM`).
   Apply ONLY to BC3-decoded sources; PNG normal sources pass through (already standard RGB);
   MBM with bumpFlag=1 likewise reconstructed only if it fails a unit-length sample test
   (SEMANTICS §4.3's 256-pixel heuristic — reuse io's 0.05 threshold). Never flip green
   (Unity and glTF are both +Y); never flip red (pairs with tangent.w negation —
   SEMANTICS §4.3 pairing rule; put this sentence in the code comment).
8. `tex/resolve.ts`: URL → file resolution: candidate extension order rotated to start at the
   extension recorded in the mu texture name (`[dds,mbm,tga,png]` — SEMANTICS §4.1), searched
   (a) in the model's directory by basename, then (b) whole-GameData URL index (cross-folder
   refs are real — KSP_INSTALL §9.3). Missing ⇒ E102 (or magenta placeholder with
   `--allow-missing-textures`).
9. `cli/commands/decodeTex.ts` wiring (`decode tex`).
10. World test: decode every `.dds` (stock 1061 + BDB 1717) and `.mbm` (2 + 25) — zero
    failures, record format histogram (must equal the census: stock 873 DXT5/188 DXT1; BDB
    sample 82/18 — full-corpus numbers get recorded as the new golden). Golden byte-hash tests:
    `ladderRadial/model000.dds` (824 B) and `M1-3 Pod.dds` decode → sha256 of RGBA buffer
    (record on first run, review visually once via `decode tex` before committing — the ONE
    manual visual check in this phase; document it in the test comment).

DoD: world decode 100%; `decode tex` produces upright PNGs (manual spot-check of
`M1-3 Pod.dds` documented in commit message with what was seen).

---

### Phase 4 — Coordinates, materials, and `convert mu`

**Read first:** SEMANTICS §3 (whole), §5 (whole); MU_FORMAT §5.4–5.9; flexo constraints §6.4
(for what NOT to bake in yet).

Tasks:
1. `gltf/coords.ts`: the negate-Z conversion (SEMANTICS §3.2) as pure functions:
   `cPos([x,y,z])→[x,y,−z]`, `cQuat([x,y,z,w])→[−x,−y,z,w]`, `cScale` identity,
   `cTangent([x,y,z,w])→[x,y,−z,−w]`, `cWinding(idx)` reverse per-tri `(a,b,c)→(a,c,b)`,
   `cUv([u,v])→[u,1−v]`, `eulerZXYtoQuat(degXYZ)` building Unity `Ry(y)·Rx(x)·Rz(z)` then
   `cQuat`. Property test (no dep — fixed vector table + 100-case LCG loop):
   `rotate(cQuat(q), cPos(v)) ≈ cPos(unityRotate(q, v))` with `unityRotate` implemented
   independently (straight quaternion math). Include the worked check: Unity yaw+90
   `(0,.7071,0,.7071)` maps to glTF `(0,−.7071,0,.7071)` and sends glTF `(1,0,0)`→`(0,0,1)`.
2. `gltf/materials.ts`: shader → PBR mapping. Contract table (full property semantics:
   SEMANTICS §5.3; keep the raw dump in extras ALWAYS):

   | KSP shader | glTF recipe |
   |---|---|
   | Diffuse / Bumped | baseColor=_MainTex×_Color; rough 1.0; metal 0; (+normal) |
   | Specular / Bumped Specular (+ Mapped) | as above; metal 0; `KHR_materials_specular`: specularColorFactor=_SpecColor.rgb (Mapped: specularColorTexture=_SpecMap); roughness: **if _MainTex alpha is non-constant** bake metallicRoughnessTexture with G=sqrt(1−a) per pixel (gloss lives in diffuse alpha), else roughnessFactor=sqrt(1−_Shininess) |
   | Emissive/* | + emissiveTexture=_Emissive (sRGB), emissiveFactor=_EmissiveColor.rgb×_EmissiveColor.a; W202 when factor is black (animation-driven) |
   | Alpha/Cutoff (+Bumped) | alphaMode MASK, alphaCutoff=_Cutoff |
   | Alpha/Translucent (+Specular) | alphaMode BLEND, baseColor.a from combined alpha×_Opacity |
   | Alpha/Translucent Additive | BLEND + emissive=Tint×Tex + `extras.ksp.blend='additive'` + W203 |
   | Unlit / UnlitColor / Alpha Unlit | `KHR_materials_unlit` (+BLEND for the transparent one) |
   | Particles/* | as Additive + W205 context |
   | InternalSpace | fallback Diffuse + W200 (IVA out of scope) |
   | unknown (TU/Waterfall/…) | fallback: _MainTex if present else magenta factor; W200 |

   DXT1-sourced diffuse alpha is constant-255 ⇒ no roughness bake (fast path — note in code).
   Textures dedup by (sourceUrl, postprocess) key so shared sheets embed once.
3. `gltf/convert.ts`: MuModel → gltf-transform `Document`. Node per mu GameObject (names
   verbatim); TRS from cPos/cQuat/scale; meshes per §6.1 with converted attributes
   (positions/normals cPos, tangents cTangent, uv cUv, uv2 cUv, COLOR_0 normalized,
   indices cWinding); renderer→materials pairing with W201 on mismatch; skinned renderers:
   mesh attached rigid at node + `extras.ksp.skinnedRigid` + W204; colliders/lights/cameras/
   tag-layer/particles → extras + policy flags per §5.3/§6.2 (light transform: no extra
   rotation needed under negate-Z — SEMANTICS §3.2); `KHR_texture_transform` from MuMatTex
   with the §6.1 offset formula.
4. `cli/commands/convertMu.ts` + shared writer (`NodeIO` with extensions registered, then
   `dedup()`, `prune()`, validate with `gltf-validator` in tests).
5. Tests:
   - Unit: coords vectors (task 1); material mapping per shader (synthetic MuMaterials);
     tangent/normal pairing note test (red channel untouched).
   - Golden: `convert mu` on ladder `model.mu`, `Mk1-3.mu`, AARDV antenna → structural JSON
     (node tree names+TRS rounded 1e-5, mesh/primitive/material/texture counts, extension
     list) committed as goldens; `gltf-validator` reports **zero errors** on all three.
   - Bounds: ladder GLB world AABB equals raw mu bounds (scale enters in Phase 5).
   - World (`convertmu.world.test.ts`): convert every stock+BDB `.mu` to an in-memory
     Document (no disk write) — zero throws; validator on a 50-file sample.
6. Manual verification checkpoint (document in commit): open 2–3 GLBs in a viewer
   (`npx @gltf-transform/cli inspect` + any glTF viewer; Blender import) — check orientation
   (antenna dish faces −Z…), textures upright, no inside-out meshes.

DoD: three goldens + validator clean + world convert pass; visual checkpoint noted.

---

### Phase 5 — Part composition (`inspect/convert part`)

**Read first:** SEMANTICS §2.3–2.4 (resolution + scale math — the formula is the contract),
KSP_INSTALL §5/§9/§10, BDB_SURVEY §8/§9.

Tasks:
1. `parts/model.ts`: given a PART CfgNode →
   `PartModelPlan { models: ModelRef[]; rescaleFactor: number }` where
   `ModelRef { url; position: V3; rotationDeg: V3; scale: V3; textureReplacements: {muTexBaseName, url}[] }`.
   Rules: all `MODEL{}` nodes in order (keys `model, position, rotation, scale, texture`;
   tolerate unknown keys like `TextureNormalURL` with I-diag; `parent = <transform>` means
   "attach this MODEL under that transform of an earlier MODEL" (WEB_RESEARCH §6) — emit
   W-diag and ignore unless the Phase-1 census shows real usage, then implement to that
   spec); `texture = <name> , <url>` split on FIRST comma, both sides trimmed
   (spaces around comma occur — BDB_SURVEY §8); missing `MODEL` ⇒ legacy path: if the part
   dir contains exactly one `.mu` use it; if several, prefer the `mesh =` value's basename
   when that file exists, else alphabetically-first + W-diag (KSP ignores the filename;
   SEMANTICS §2.3); no `.mu` at all ⇒ E101. `rescaleFactor`: parse float, **default 1.25**;
   `scale` key: parsed, recorded in extras, never applied to geometry (attach-node-only).
2. `parts/attach.ts`: extract attach nodes for extras/sidecar:
   `node_stack_<id> = x,y,z, dx,dy,dz[, size]`, `node_attach`, and `NODE{ name, transform }`
   blocks (transform-anchored: position/direction = the named mu transform's world TRS —
   compute from the composed model; direction = transform's +Z axis). Scale rule for
   cfg-literal node coordinates: `position = cfgVector × scale × rescaleFactor` (the legacy
   part-level `scale` key applies HERE and only here — WEB_RESEARCH §6, blowfish/decompile;
   the sequential-parse caveat there is ignorable for sane cfgs). Transform-anchored NODE{}
   positions come out of the composed model, already carrying rescaleFactor. All converted
   to glTF space at emit time.
3. Composition in `gltf/convert.ts`: part root node (name = runtimeName) with uniform scale
   `rescaleFactor`; one child per ModelRef: translation=cPos(position),
   rotation=eulerZXYtoQuat(rotationDeg), scale=scale (raw); mu subtree under it. Effective
   vertex transform must equal SEMANTICS §2.4:
   `rescale·(MODEL.position + MODEL.rotation·(MODEL.scale⊙v))`.
   Texture replacements: before material build, rewrite the mu texture-table entry whose
   **basename (sans ext)** equals `muTexBaseName` to resolve via the replacement URL
   (report entry per §6.2 `replacedBy`).
4. `gamedata/partIndex.ts` finalization: craft-ref lookup
   `resolveCraftRef('bluedog.Apollo.CrewPod_4292980418') → {runtimeName, uid}` (split at LAST
   `_`, uid must be all digits; no digits ⇒ treat whole as name, uid ''). Unknown name ⇒ E100
   with top-3 Levenshtein suggestions.
5. `cli/commands/{inspectPart,convertPart}.ts`: inspect prints the §5.5 table (decisions are
   stubbed 'enumerate-only' until Phase 7 — list B9PS/variant module counts as INFO).
6. Tests (all against real fixtures):
   - `ladder1`: legacy path, no scale keys ⇒ rescale **1.25**; GLB AABB = 1.25 × Phase-4 raw
     AABB (assert componentwise ±1e-4).
   - `fuelTank` (FL-T400, `rescaleFactor = 1.0`, MODEL node): composed AABB X/Z diameter
     ≈ **1.25 m** ± 2% (the real tank is 1.25 m — dimensional ground truth).
   - `mk1-3pod`: AABB max diameter ≈ 2.5 m ± 5%.
   - `fairingSize1`: two MODEL nodes; second at position (0,0.22,0) — assert child node
     translation (0,0.22,0)→cPos and per-MODEL rotation 180° about Y applied.
   - `solidBoosterRT-10_v2`: texture replacement `SRB_O → …/SRB_W` — assert the GLB's texture
     source resolves to `SRB_W.dds` bytes (compare decoded hash vs direct decode of SRB_W).
   - `HECS2`: cross-folder replacement resolves via URL index.
   - `bluedog.Apollo.RCS.4X`: 4 MODEL nodes compose (BDB_SURVEY §3).
   - E101/E100 error-path tests with helpful messages.

DoD: all above green; `convert part fuelTank` visually checked once (tank upright, 1.25 m).

---

### Phase 6 — Craft parsing & assembly (`convert craft` static)

**Read first:** BDB_SURVEY §4 (anatomy + coordinates), KSP_INSTALL §3, SEMANTICS §2.1/§2.5.

Tasks:
1. `craft/parse.ts`: ConfigNode-parse the craft (util/text handles Latin-1); extract
   `{ship, version, parts: CraftPart[]}` where
   `CraftPart { ref, runtimeName, uid, pos: V3, rot: V4, mir: V3, istg, moduleSnapshots }`.
   `moduleSnapshots`: for each `MODULE{}` keep `{name, moduleID?, currentSubtype?,
   selectedVariant?, raw: CfgNode}` (raw kept for report/extras). Tolerate absent optional
   keys; `mir !== 1,1,1` (occurs as `1,1,-1` in SPH mirror-symmetry craft, never in the BDB
   corpus) ⇒ **ignore with W140**: `pos`/`rot` alone reproduce placement for stock craft
   (io_object_mu precedent + WEB_RESEARCH §5, high confidence — KSP "mirroring" is mostly
   rotational). An experimental `--mir scale` flag may apply `mir` as part-root scale with
   negative-determinant winding-flip bake, for future SPH-gear fidelity work. Ignore
   attN/srfN/sym for placement (pos/rot are absolute) but don't choke on their `|`-syntax.
2. `craft/assemble.ts`: instance node per PART named `<runtimeName>#<uid>`:
   `translation = cPos(pos − rootPos)` (root = first PART; `--keep-origin` skips the
   subtraction), `rotation = cQuat(rot)`; child = the Phase-5 composed part subtree.
   **Sharing**: cache composed part subtrees by (runtimeName + variant-state-key); same key ⇒
   reuse Mesh/Material objects, fresh Nodes (gltf-transform allows shared meshes).
   Extras per §6.2. Missing parts per §5.3 policy.
3. `cli/commands/{inspectCraft,convertCraft}.ts`: inspect = full resolution table (parts,
   models, textures, module census) + decision table (Phase 7 fills semantics; this phase
   lists detected variant modules as INFO rows). `--emit parts|both` writes per-part GLBs +
   `layout.json` (§6.4.1 schema — shared by both profiles).
4. Tests:
   - `Transit 4.craft` (**2** parts) end-to-end golden (structural JSON + validator clean).
   - `Kerbal X.craft` (**73** parts, all stock): converts exit 0; assert instance count 73,
     shared-mesh dedup happened (FL-T400 appears 21× but its geometry accessors exist once);
     recentring: root pod node at origin.
   - `Apollo 11 CSM.craft` (**19**) + `Apollo 11 MLEM.craft` (**12**): convert with
     overlapping-variant-mesh state EXPECTED this phase (assert exit 0 + W-diag noting
     variant modules present but unapplied — gets flipped in Phase 7).
   - Latin-1 craft `ComSat Lx.craft` parses (stock parts must resolve; convert exit 0).
   - Missing-part UX: run a `Advanced (NEEDS SAF AND CD)` craft ⇒ exit 2 listing
     `conformaldecals-*` parts with suggestions + `--allow-missing-parts` hint; with the flag ⇒
     exit 0 + placeholder nodes + report entries (BDB_SURVEY §1/§9.11 background).
   - Quaternion sanity: EVAFloodlight instance (BDB_SURVEY §4b: rot ≈ (0,0.8315,0,0.5556),
     96° about Y) — assert its glTF node rotation = cQuat of that (−y sign) and that the
     part's local +X axis lands where Unity would put it (reuse Phase-4 property helpers).

DoD: five fixture craft convert; goldens committed; report lists every skipped module class.

---

### Phase 7 — Variants, visibility & the decisions engine

**Read first:** BDB_SURVEY §5 + §9.5/9.6, KSP_INSTALL §6 + §3 (selectedVariant fallback),
WEB_RESEARCH (B9PartSwitch C# semantics — authoritative for defaults/matching).

Semantics to implement (provisional statements below are confirmed/corrected by
WEB_RESEARCH.md — where that doc disagrees, IT wins; leave a comment citing it):

- **ModuleB9PartSwitch** (`variants/b9ps.ts`) — semantics confirmed from C# source
  (WEB_RESEARCH §2, file:line cites; `.tmp-repos/B9PartSwitch` on disk):
  craft snapshot ↔ prefab module matched by **`moduleID`** (both persistent); selection key
  is `currentSubtype = <name string>` (never an index; match as string). Subtypes =
  `SUBTYPE{}` list in cfg order. Managed-transform set = union over subtypes of their
  `transform =` matchers. Applying subtype S: enable S's matches; disable (managed − S's).
  **Name matching uses B9PS `StringMatcher`**: full-string anchored with `*`→`.*`, `?`→`.`,
  and a value wrapped in `/…/` is a raw regex — matching ALL mu GameObjects with that name
  anywhere in the part's model trees. `SUBTYPE TRANSFORM{}` blocks (`name`,
  `positionOffset`, `rotationOffset` Euler°, `scaleOffset`) apply TRS offsets to the current
  subtype's matching transforms — implement (trivial) and record in extras. `node =` entries:
  attach-node availability only — extras, no geometry. `TEXTURE{}` keys (exact):
  `texture` (URL), `currentTexture` (filter: only replace where the current texture's
  basename after the last `/` matches), `transform` (exactly these renderers) vs
  `baseTransform` (these + children), `isNormalMap`, `shaderProperty`; slot default =
  `_BumpMap` if `isNormalMap` else `_MainTex`; no transform filters ⇒ all renderers of the
  part model. Default subtype when nothing chose one: highest `defaultSubtypePriority`,
  ties broken by cfg order (verify the exact tiebreak in
  `B9PartSwitch/PartSwitch/ModuleB9PartSwitch.cs` setup path while implementing — one look,
  then pin with a test).
- **ModuleB9DisableTransform** (`variants/b9ps.ts`): unconditional disable of each
  `transform =` value. ALWAYS applied, craft or part mode (BDB CrewPod hides `Painted`,
  `colorswitch_*` — without this the pod renders overlapping paint meshes).
- **ModulePartVariants** (`variants/partVariants.ts`): `VARIANT{}` list; selection from craft
  `selectedVariant` else cfg `baseVariant` else first VARIANT (KSP_INSTALL §3 fallback rule —
  Kerbal X exercises it 19×). Applying: `GAMEOBJECTS{ name = true|false }` toggles (names =
  mu GameObjects; entries absent from the chosen variant but present in ANY variant's set
  default to disabled-when-false semantics exactly as listed — only listed names are
  touched; mu GameObjects carry no stored active flag, so the base state is "everything
  visible"); `TEXTURE{}` = material overrides: optional `materialName` filter (limit to one
  material, else all), `mainTextureURL` (aliases `_MainTex`), arbitrary shader texture
  props (`_BumpMap = <url>`), optional `shader` swap (record in extras, don't emulate);
  `NODES{}` (attach-node repositioning) and `EXTRA_INFO{}` → extras only. WEB_RESEARCH §4.
- **ModuleJettison** (`variants/jettison.ts`): stock engine shrouds. `jettisonName` transforms
  shown only when the associated bottom node is occupied in the craft (`attN`/stack link
  present at `bottomNodeName`, default `bottom`). In craft mode auto-resolve from node
  occupancy (`resolvedBy: 'auto'`, I-diag); in part mode it's a Decision (options
  `shrouded|unshrouded`). BDB's `ModuleBdbJettison` (BDB.dll): treat identically when its cfg
  carries `jettisonName`-style keys; else W-diag listing its keys.
- **FlagDecal** (`variants/partVariants.ts`, small): `textureQuadName` transform textured with
  craft `missionFlag` URL (PNG under `Squad/Flags/…`); `--no-flags` disables the quad. If the
  flag URL is missing ⇒ hide quad + I-diag. (Low priority — implement last.)
- **Visibility mechanics** (`variants/visibility.ts`): disabled transform ⇒ its node subtree
  is **omitted** from the GLB (geometry never emitted; extras on the part node record the
  full variant map §6.2 so nothing is lost informationally). Texture overrides fork materials
  (dedup handles sharing).
- **Decisions engine** (`variants/decisions.ts`): enumerate domains per part instance
  (every B9PS module = one domain; stock variants = one; jettison = one when auto-resolution
  is impossible), resolve per §5.5 precedence, build `flagHint` strings, drive exit-1 UX.

Tests:
- CSM SM SIM bay: convert part `bluedog.Apollo.Block2.SM` with
  `--choose "…:meshSwitchSIMbay=Historical"` vs `=Empty` — golden node-name lists differ
  exactly by the SUBTYPE transform sets from BDB_SURVEY §5 (`SIMbayHistorical` vs `simBayBare`
  subtrees); `Universal Storage` (space in option value!) parses from the flag.
- CrewPod: `ModuleB9DisableTransform` hides `Painted`/`colorswitch_skylab`/`colorswitch_bp` in
  every conversion (assert absent from node names).
- `Apollo 11 CSM.craft` + `Apollo 11 MLEM.craft`: **exit 0 with zero flags**; decision table
  all `craft`/`craft-default`/`auto`; goldens re-recorded (overlap warnings from Phase 6 gone —
  assert no two visible meshes share identical world AABB centers as a cheap overlap check on
  the SM).
- `Kerbal X.craft`: 19 `craft-default` variant resolutions via baseVariant fallback; force one
  instance to `White` via `--choose "fuelTank#<uid>:variant=White"` — assert that instance's
  material baseColor texture switches to the `125Tanks_W` sheet while other instances keep
  `125Tanks_BW` (per-instance material fork + dedup for the rest).
- Part mode UNRESOLVED UX: `convert part bluedog.Apollo.Block2.SM` with no flags ⇒ exit 1,
  output contains one ready-to-paste `--choose` line per domain (snapshot-test the text);
  `--defaults` ⇒ exit 0 with `resolvedBy: 'defaults-flag'` in report.
- Craft naming a nonexistent subtype (synthetic edited craft in testdata) ⇒ exit 2 listing
  valid options.
- Numeric-looking subtype names: RCS quad `currentSubtype = 4` resolves by STRING (never
  coerce — BDB_SURVEY §4c).

DoD: Apollo CSM + MLEM convert clean, correct, and visually verified (side-by-side with
in-game screenshots if available; else viewer sanity: one SM bay, one paint layer, LM legs
present). This is milestone **M1: "Apollo in GLB"**.

---

### Phase 8 — mini-ModuleManager (BDB-scoped generality)

**Read first:** WEB_RESEARCH.md (MM ordering + syntax — authoritative), BDB_SURVEY §6
(feature census: `:NEEDS` 2644, `:FOR` 578, `:AFTER` 559, `:HAS` 1631, `#$…$` 1463,
`@MODULE` 1100, `!MODULE` 787, `%MODULE` 980, wildcards, only 4 `+PART`/4 `:FINAL`).

Purpose: without MM, fixture geometry is already correct (proven in Phase 7) — but paint
subtypes, `+PART` clones, and cross-part patches stay invisible. This phase makes the tool
faithful for **arbitrary** BDB(-like) content, still loud about gaps.

Tasks:
1. `mm/order.ts`: exact pass structure from MM source (WEB_RESEARCH §3, `PatchList.cs`):
   **:INSERT** (plain command-less nodes = the database) → **:FIRST** → **:LEGACY** (no pass
   suffix) → for each mod name in **case-insensitive sorted order**: `:BEFORE[m]` →
   `:FOR[m]` → `:AFTER[m]` (BEFORE/AFTER of a truly-absent mod are dropped gracefully; any
   `:FOR[X]` adds X to the mod list) → **`:LAST[m]`** in sorted order (the mod does NOT need
   to exist) → **:FINAL**. Within a pass: GameData file-traversal order (depth-first
   alphabetical). Root-node command restriction: only insert, `@`, `+`/`$`, `-`/`!` are
   legal at top level (`% & | # *` are subnode-only — error them loudly). Top-level name
   selector `@PART[a|b,c*]` splits on BOTH `,` and `|` as OR'd wildcard alternatives and has
   NO index addressing. Mod-name set: top-level GameData dir names (whitespace stripped) +
   every `:FOR[]` name (pseudo-mods like `Bluedog_DB_1`) + `--assume-mod` (we have no DLL
   assembly names — document the gap; bundled-DLL mods are covered by their folder names).
2. `mm/selectors.ts`: node selector grammar: `@NODE[nameGlob]`, wildcards `*`/`?` (node
   TYPE is wildcard-matched too in nested selectors), index suffix `,i`/`,*` with **negative
   i = from the end**, `:HAS[@CHILD[x],#key[valGlob],~key[…],!CHILD[y]]` (constraints
   AND-joined by `,`/`&`, numeric `<`/`>` compares in value matches, recursive `:HAS`
   nesting), `:NEEDS[expr]` (share cfg/needs.ts evaluator; terms containing `/` test
   directory existence).
3. `mm/patch.ts`: node/key command prefixes: `@` edit, `+`/`$` copy, `-`/`!` delete, `%`
   edit-or-create (adds the `name =` value automatically), `&` create-if-absent, `|` rename
   (value-position), `#` paste-by-path, `*` special-assign. Value grammar:
   `<cmd><name>[,index|,*][\[pos[,sep]\]] <op>= <value>` with trailing operators
   `+= -= *= /= != ^=` (`^=` is sed-style `:regex:replacement:`; `!=` is Math.pow).
   Implement exactly the subset in the census + WEB_RESEARCH §3 semantics; every
   unsupported construct encountered ⇒ **W210 with file:line and the construct**, patch
   skipped (never half-applied).
4. `mm/vars.ts`: `#$…$` substitution subset: sibling key, `../`, `@NODE/key`, indexed —
   scope per WEB_RESEARCH; unsupported forms ⇒ W210.
5. Wire into `gamedata/db.ts` behind `--no-mm` (default ON when any `--mod` root is present);
   `doctor` prints patch stats (applied/skipped/W210 census).
6. OPTIONAL: `ModuleManager.ConfigCache` ingestion — if the file exists under any root, offer
   `--mm-cache` to use it verbatim instead of patching (io_object_mu precedent, SEMANTICS
   §2.2; the cache IS ground truth from a real game run).
7. Tests:
   - Regression gate: Phase-7 goldens for CSM/MLEM/Kerbal X byte-for-byte structural-equal
     with MM ON (geometry must not change — the fixture-affecting patches are
     resource/FX-only, BDB_SURVEY §6).
   - CrewPod paint: with MM ON, `textureSwitchPaint` gains subtypes
     (Apollo7/ASTP/BP/Silver/Skylab/White…); `--choose "…:textureSwitchPaint=Skylab"` swaps
     the CM texture (assert new texture URL in report + different baseColor source hash).
   - `fuelSwitch` appears on SM/LM tanks (patch-added, resource-only) and resolves from craft
     without geometry effect.
   - `+PART` clone: `OldParts/Atlas` decoupler clone resolves as a part (BDB_SURVEY §6).
   - W210 loudness: synthetic patch using an unsupported construct produces the diagnostic
     with file:line.
   - World: apply MM across full stock+BDB DB — zero crashes; W210 census committed to
     `docs/MM_COVERAGE.md`.

DoD: paint-switch e2e works; W210 census reviewed (if any construct fires on BDB's own
patches at volume, schedule it into the subset — the census is the scope contract).

---

### Phase 9 — Fidelity report, flexo profile, end-to-end goldens, docs

**Read first:** §6.3/§6.4 above; flexo authority docs if editing profile details.

Tasks:
1. `report/report.ts` per §6.3 (json + md); wire `--report` default-on for `convert craft`.
2. `gltf/profileFlexo.ts` per §6.4 (strip attrs, sanitize names, ≤2048 downscale via 2×2 box,
   sidecar JSON, per-part emit, layout.json). Explicit test: node/material names stable across
   two runs (re-import identity).
3. End-to-end goldens (structural + validator + report snapshots):
   `Transit 4`, `Apollo 11 CSM`, `Apollo 11 MLEM`, `Kerbal X`, and **`Saturn V.craft`**
   (70 parts, stress: must finish < 60 s on the dev machine, peak RSS recorded in report;
   the 16.8 MB `bluedog_Saturn_S1D.mbm` exercises MBM at scale).
4. Negative-UX golden: one `Advanced` craft without ConformalDecals ⇒ exit-2 message snapshot
   (this is the missing-part UX users will actually meet).
5. Docs in the tool repo: `README.md` (quickstart: doctor → inspect craft → convert craft;
   the §5.5 workflow narrated), `docs/TROUBLESHOOTING.md` (every E/W code with what to do),
   `docs/FLEXO.md` (handoff: how outputs map to flexo import, what flexo ignores today,
   sidecar fields a future flexo importer could consume).
6. Optional nicety: `--threads n` for world-scale texture decode via `worker_threads`
   (measure first; only if Saturn V wall time is texture-dominated).

DoD: **M2 — "one command"**: fresh clone + `pnpm install` + fixtures.local.json + one
`convert craft` command yields Apollo CSM GLB + report; README documents it end-to-end.

---

### Phase 10 — DEFERRED: animations & skins (spec only — do not implement without user ask)

Scope when activated:
- Transform curves (`m_LocalPosition.*`, `m_LocalRotation.*`, `localEulerAnglesRaw.*`) →
  glTF animations. Unity keys are Hermite (time, value, inTangent, outTangent — MU_FORMAT
  §5.10); glTF CUBICSPLINE stores per-key (inTangent, value, outTangent) **in value-units
  per second — exactly Unity's units. Identity copy, NO ×dt scaling** (the glTF evaluator
  multiplies by segment duration itself — spec Appendix C; WEB_RESEARCH §9 has the verbatim
  formula). First in-tangent / last out-tangent SHOULD be zero. Per-component quaternion
  curves must be merged onto a union key timeline (resample missing components by Hermite
  eval), normalized, sign-continuity enforced (`dot(q_k, q_{k+1}) ≥ 0`), converted per cQuat
  (negating x/y of value AND tangents — tangents transform linearly). Stepped segments are
  encoded as ±Infinity tangents: all-stepped clip ⇒ `STEP` sampler; mixed ⇒ bake the jump
  with two keys ε apart and zero tangents. Euler curves (`localEulerAnglesRaw`): compose
  per-frame ZXY→quat (resample at union times; document error bound). Craft module deploy
  state (`deployState = EXTENDED`, robotics `currentRotation`) is the future input for
  posing deployables at a saved state.
- Path resolution: curve `path` = slash path relative to the Animation component's node.
- Material curves (`_EmissiveColor.*` etc.) → NOT representable: emit
  `extras.ksp.materialAnimations` dump + W-diag (KHR_animation_pointer optional future).
- WrapMode → `extras.ksp.wrapMode`.
- Skins: resolve the bind-pose row/column UNKNOWN (MU_FORMAT §5.4 note) empirically: pick a
  stock skinned part, compare rest-pose world vertex positions under both interpretations
  against the rigid interpretation — the matching one wins; then emit glTF skin
  (inverseBindMatrices = conjugated per SEMANTICS §3.2 matrix rule).
- Acceptance: LM leg deploy plays in a glTF viewer; solar panel rotation axis correct.

---

## 9. Milestones

| M | Meaning | Phase |
|---|---|---|
| M0 | `.mu` world-parse 100% + census docs | end of 2 |
| M0.5 | texture world-decode 100% | end of 3 |
| M1 | **Apollo CSM + LM GLBs, craft-driven variants, zero flags** | end of 7 |
| M2 | One-command UX + Saturn V stress + flexo profile | end of 9 |

## 10. Diagnostic code catalog (extend freely; never reuse numbers)

| Code | Sev | Meaning |
|---|---|---|
| E100 | error | Part not found (suggestions listed; `--allow-missing-parts` downgrades → W100) |
| E101 | error | MODEL url / part-dir `.mu` not found |
| E102 | error | Texture not found (`--allow-missing-textures` → W102 + magenta) |
| E110 | error | Unresolved decisions (exit 1 path) |
| E111 | error | Chosen subtype/variant name not in options |
| E120 | error | `.mu` parse failure (bad magic/version/tag/desync — includes hex offset) |
| E121 | error | cfg/craft parse failure (file:line) |
| E130 | error | Unsupported DDS (fourCC/DX10) |
| E131 | error | Unsupported TGA (RLE) |
| W140 | warn | `mir` ≠ (1,1,1) ignored (pos/rot reproduce placement; `--mir scale` is the experimental opt-in) |
| W200 | warn | Unknown/unmapped shader → fallback material |
| W201 | warn | Submesh/material count mismatch (pairing rule applied) |
| W202 | warn | Emissive present but factor is black (animation-driven in game) |
| W203 | warn | Additive blend approximated as BLEND+emissive |
| W204 | warn | Skinned mesh exported rigid |
| W205 | warn | Particle component recorded, FX not represented |
| W207 | warn | Non-identity texture transform (flexo profile: baked or warned) |
| W208 | warn | Vertex colors/UV2/tangents dropped (flexo profile) |
| W210 | warn | ModuleManager construct outside implemented subset (file:line; patch skipped) |
| W211 | warn | Jettison/shroud state auto-derived from node occupancy |
| I3xx | info | Provenance notes (duplicate URL shadowed, texture replaced, craft-default used…) |

## 11. Verification strategy (summary)

1. **World gates** (the reliability claim): parse ALL cfgs (Squad 422 + SqExp 143 + BDB 1438
   PARTs), ALL `.mu` (551+151+1818), decode ALL dds/mbm (1061+2, 1717+25) — zero failures,
   full-file byte coverage on mu.
2. **gltf-validator** zero-error gate on every golden.
3. **Dimensional ground truth**: FL-T400 = 1.25 m; ladder default-rescale 1.25×; Mk1-3 ≈ 2.5 m.
4. **Structural goldens** for fixtures (never byte-hash GLBs; byte-hash our own PNG output).
5. **Manual visual checkpoints** (three, each documented in a commit message): Phase 3 texture
   uprightness; Phase 4 orientation/winding; Phase 7 Apollo CSM/MLEM correctness (M1).
6. **Optional python oracle** (`tools/oracle/`): io_object_mu JSON dump cross-check on 10
   sampled `.mu`. Auto-skips without python3. Exists because io_object_mu is the only other
   independent `.mu` implementation on earth; never a required gate. (User dislikes Python —
   keep it quarantined and optional.)

## 12. Licensing & distribution posture

- **io_object_mu is GPL-2.0+**; our TS reader is written from the extracted spec
  (MU_FORMAT.md) which was itself derived by reading that GPL source. Treat `ksp2glb` as a
  derivative for licensing purposes: repo stays **private**; `package.json` license field
  `GPL-2.0-or-later`; if ever published, publish under GPL-2.0+ (or do a documented cleanroom
  re-derivation — not worth it). WEB_RESEARCH.md records the final check on this.
- **KSP assets & BDB art** (BDB art is CC-BY-NC-SA per its repo — WEB_RESEARCH confirms):
  converted GLBs are derivatives of game/mod assets. **Never commit outputs** to any repo,
  never redistribute; flexo-side usage stays local/private (flexo-private-assets territory).
  The tool itself contains zero KSP/BDB bytes (synthetic testdata only) — the only
  redistribution-sensitive things are its OUTPUTS.
- The tool requires the user to supply their own KSP install / mod checkouts (§5.1) — by
  design, so the tool itself stays clean.

## 13. Risk register / open questions

| Risk | Mitigation |
|---|---|
| B9PS default-subtype tiebreak (`defaultSubtypePriority`) unverified | One direct read of `ModuleB9PartSwitch.cs` setup in the local clone during Phase 7; everything else is source-confirmed (WEB_RESEARCH §2) |
| Stock `VARIANT{}` key set has the weakest sourcing of anything here | Ground truth = Squad's own cfgs in the local install (KSP_INSTALL §6 has verbatim blocks); read more of them while implementing partVariants.ts |
| SPH mirror craft (`mir = 1,1,-1`) visual fidelity | Ignored with W140 (io precedent, high confidence for stock craft); `--mir scale` experimental path specced |
| Submesh↔material mismatches in the wild | Phase 2 census counts them; W201 + pairing rule; revisit if census is non-trivial |
| `ST_ALPHA_SPECULAR` `_Gloss` field identity (`#FIXME bogus` upstream) | v≤3 files only; consume one float per spec; census says BDB/stock are v5 — record if any v≤3 encountered |
| Bind-pose matrix order UNKNOWN | Irrelevant until Phase 10; empirical resolution procedure specced there |
| MODEL `texture=` TU-style slot-name abuse (`_MetallicGlossMap, url`) | First token not matching any mu texture basename ⇒ I-diag + ignore (matches KSP behavior for unknown names) |
| gltf-transform major-version drift breaking structural goldens | Exact-pin in lockfile; goldens structural not byte-level |
| MM subset gaps on future mods | W210 census makes gaps measurable; `--mm-cache` escape hatch |
| KSP updates? | None coming (1.12.5 final) — this domain is frozen, a rare luxury |

## 14. Suggested delegation shape (for the orchestrating agent)

One phase = one implementing agent, sequentially; give each: this file, its "Read first"
companions, and the previous phase's committed code. Require each agent to (a) run the DoD
commands and paste outputs, (b) update goldens only with justification, (c) add every deviation
from this plan to a `DEVIATIONS.md` at repo root for review. Phases 3 and 4 may run as two
agents in parallel after Phase 2 (disjoint files: `tex/*` vs `gltf/coords+materials`), joining
at Phase 4 task 3. Nothing else parallelizes cleanly.
