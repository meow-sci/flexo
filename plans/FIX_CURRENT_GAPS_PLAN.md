# Plan — Fix flexo gaps from KSA updates (running)

> **Latest review: `2026.8.19.5261` → `2026.8.22.5348` (see below). NO BREAKING gap; the two
> MISSING-CAPABILITY gaps that touched live data are ✅ FIXED in the review itself** — KSA rev 5329
> made `<Light Id>` load-bearing (duplicate `Components` ids now log an Error, and flexo emitted
> every light unnamed) and added `<Nozzle AreaRatioMultiplier>`, which re-apportions a solid
> motor's throat and which Core authors on the launch-escape tower (T0/T5 below).
> Newly 📋 OPEN from 5348: the `<Alpha>` material slot (T1), `<PartModel><Terrain>` (T2),
> `<PrimarySequenceModule>` (T3, passthrough-safe), and the retired kitten MMU asset (T4).
> Still 📋 OPEN from 5261: the `<ConvexHull>` collider primitive (S1) and the `<Grab>` handhold
> anchors (S2, passthrough-safe). Carried forward from 5168: the ground-clutter asset-bundler
> rework (R1, scaffold-only, widened again at 5348) and the "Control From Here"
> reference-orientation drift (R2, docs-only). Earlier reviews follow as history.

---

# 5348 review — `2026.8.19.5261` → `2026.8.22.5348`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — `diff -rq` of the two
provided asset trees (`ksa-game-assemblies_prev/current` @ 5261 vs `ksa-game-assemblies/current`
@ 5348), a sweep of all **268 changed `decomp/*.cs`** for `[XmlElement]` / `[XmlAttribute]` /
`[XmlType]` / `[XmlIgnore]` hunks, and a `cmp` byte-identity check over every verbatim-ported
class. `version.json` @ 5348 documents revs 5262–5346.

5348 is a **very large release** — ground-clutter collisions, destruction and substance-derived
mass; crew-portrait bone-tracked cameras; kitten swimming and low-gravity locomotion; a clustered
lighting VRAM rework; a **static-object** system with real launch-pad models; terrain
double-precision anchoring; electrical **circuits**; uniform editor part scaling; and sequencing
moved from parts down to modules — whose **entire XML schema delta is 13 declarations**, of which
six reach flexo.

**What the added/removed file lists flagged first:** `DecouplerTemplate.cs` appears in "Only in
PREVIOUS", which reads as a breaking removal until you follow it — the class became
`Decoupler.TemplateData` with `[XmlType(TypeName = "Decoupler")]` and the same two attributes, so
the wire form never moved. `RocketNozzleReference.cs` in "Only in CURRENT" is the real find: it is
the carrier of T5. The `StaticObject*` / `Clutter*Reference` additions are the two new top-level
`<Assets>` families.

## Priority summary (5348)

| # | Gap | Severity | Status | Scope doc |
|---|---|---|---|---|
| T0 | `PartTemplate.WarnOnDuplicateModuleIds` (rev 5329) logs an **Error** for two `Components` of the same type sharing an `Id`. `<Light>` IS such a module and flexo emitted every one **unnamed**, so any part with two lights collided; an authored `<Light Id>` was also dropped on import. Core named every shipped light in the same build | MISSING-CAPABILITY | ✅ **FIXED** (this review) | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-5348) |
| T5 | `RocketTemplate.Nozzles` became `List<RocketNozzleReference>`, adding `<Nozzle AreaRatioMultiplier>`; `SolidMotorNozzle.ThroatSizingArea` = `ExitArea / multiplier` and the stack-wide throat solve apportions by THAT. Core authors `1.0025` on a LES nozzle, so flexo both dropped it and mis-solved the stack | MISSING-CAPABILITY | ✅ **FIXED** (this review) | [engines](../scope/engines.md#what-changed-in-5348) |
| T1 | `PbrMaterialReference` gained `[XmlElement("Alpha")] TextureReference AlphaMap` (rev 5334); flexo models five slots, so it cannot author an alpha-cutout material and would drop the slot off a copied Core material | MISSING-CAPABILITY | 📋 **OPEN** | [custom-assets-and-mod-export](../scope/custom-assets-and-mod-export.md#what-changed-in-5348) |
| T2 | `PartModelModule.TemplateData` gained `[XmlElement("Terrain")] bool Terrain` (rev 5336); `<PartModel>` is MODELED so no passthrough covers it and an authored `<Terrain>` on a part is dropped | SCHEMA-DRIFT | 📋 **OPEN** | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-5348) |
| T3 | `PartTemplate` gained `<PrimarySequenceModule Id>` (rev 5329, sequencing moved onto modules). Core authors it under `<PartGameData>` where the passthrough preserves it, but it is opaque to the editor and dropped on a geometry `<Part>` — the exact twin of S2 | MISSING-CAPABILITY | 📋 **OPEN** | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-5348) |
| T4 | `CharacterAssets.xml` re-pointed the MMU from `KSA_Cat_MMU.gltf` to `SK_KSA_MMU.glb`; the legacy file still ships so flexo's kitten aide still loads, but it renders the retired model | COSMETIC | 📋 **OPEN** | [kittens](../scope/kittens.md#what-changed-in-5348) |
| — | Everything else | NONE | ✅ re-verified INTACT | — |

### T0 — `<Light Id>` became load-bearing — ✅ FIXED

**Severity: MISSING-CAPABILITY**, with an in-game consequence: an Error in the log for any
flexo-exported part carrying more than one light.

Game-side, `PartTemplate.OnDataLoad` now ends with `WarnOnDuplicateModuleIds()`:

```csharp
if (!(a.GetType() != b.GetType()) && !(a.Id != b.Id))
    log.Error($"Part {Id} has two {name} modules named '{a.Id}'; give them distinct Ids");
```

It walks `Components`. `XmlHelper`'s static constructor builds that list's element mapping by
reflecting every `ModuleBase.TemplateDataBase` subclass and keying it on `[XmlType(TypeName)]`, so
the Components element names are exactly five: `<Tank>`, `<SolidGrainSegment>`, `<FuelPort>`,
`<Light>` and (new at 5348) `<Decoupler>`. `TemplateDataBase` has always carried
`[XmlAttribute] string Id = ""`, so two unnamed lights are two modules named `""`.

flexo emitted `<Light>` with no `Id` at all, and `lightsFromElement` explicitly discarded an
authored one ("no shipped light authors one"). Both halves are now wrong: Core added
`<Light Id="RightWindow">` / `"LeftWindow"` (`CoreCommandAGameData.xml`), `"Right"` / `"Left"`
(`CoreIVASpaceAGameData.xml`) and `"PointLight"` / `"SpotLight"` (`PartAssets.xml`) in this build.

**Fix (landed):**

- `PartLight.ksaId: string | null` (`src/ksa/types.ts`) holds the authored id, `null` when absent.
- `lightFromElement` reads `Id`; `buildLightElement` **always** writes one — `ksaId ?? id`, where
  `id` is the `_lightN` document id, already unique across the part's merged light list.
- Persisted as the optional `ki` key in the compact codec, carried by project transfer, and
  default-filled in `projectStore.normalizePart` next to `IvaSeat.ksaId`.
- The auto-fill is safe where a seat's would not be: nothing in KSA addresses a light by id, so an
  `_lightN` entering the `Components` id namespace can only be reached by a
  `<FeedsFrom Container="_lightN">` no one would author.
- Round-trip is a fixed point: an unnamed light re-imports carrying its `_lightN` fallback, and the
  second export is byte-identical to the first (asserted in `partXmlParser.test.ts`).

The other four Components names were re-checked — flexo already emits an `Id` on `<Tank>` (when
non-blank) and `<SolidGrainSegment>`, never emits `<FuelPort>`, and never emits more than one
`<Decoupler>`.

### T5 — `<Nozzle AreaRatioMultiplier>` re-apportions a solid stack's throat — ✅ FIXED

**Severity: MISSING-CAPABILITY**, touching both round-trip fidelity and the ported physics.

`RocketTemplate.Nozzles` was `List<SubPartIdReference>`; at 5348 it is
`List<RocketNozzleReference>`, a subclass whose only addition is
`[XmlAttribute] double AreaRatioMultiplier = 1.0` (non-positive values are reset to 1 in
`OnDataLoad`). `SolidMotorNozzle` gained `ThroatSizingArea => Config.ExitArea / AreaRatioMultiplier`
and `SolidMotor` switched both stack-wide routines onto it:

```diff
-num2 += ((SolidMotorNozzle)n).Config.ExitArea;              // ResizeNozzles total
+num2 += ((SolidMotorNozzle)n).ThroatSizingArea;
-n.Config.ThroatArea = n.Config.ExitArea / num9;             // ResizeNozzles per-throat
+n.Config.ThroatArea = n.ThroatSizingArea / num9;
-float num5 = n.Config.ExitArea / totalExitArea;             // ComputeTotalThroatArea weight
+float num5 = n.ThroatSizingArea / totalSizingArea;
```

Core authors it on `CorePropulsionA_Prefab_LESA` / `…LESB`:
`<Nozzle Id="Nozzle" SubPartId="…NozzleA6" AreaRatioMultiplier="1.0025"/>`.

**Fix (landed):**

- `RocketNozzleRef extends SubPartIdRef` (`src/ksa/types.ts`) adds `areaRatioMultiplier`;
  `Rocket.nozzles` is now `RocketNozzleRef[]`.
- `nozzleRefFromElement` parses it with KSA's own non-positive guard; `buildRocketElement` emits it
  **only when ≠ 1**, so a part that never touches it stays byte-identical to its pre-5348 form.
- `solidMotorPhysics.ts` carries `ResolvedNozzle.throatSizingAreaM2` and uses it in `resizeNozzles`
  (total, per-throat, and the peak-chamber-pressure denominator) and in `computeTotalThroatArea`.
  `SolidMotorNozzleTemplate.Create`'s `exitArea / 12` seed still uses the RAW exit area, matching
  the game's ordering (the multiplier reaches the nozzle later, in `RocketTemplate.CreateComponents`).
- `SolidThrustCurveCard` keeps each binding `<Nozzle>` alongside its template so the multiplier
  reaches the preview; the engine wizards author 1.
- Persisted as the optional `m` key in the compact codec, preserved through paste/clone remaps and
  the nozzle picker, and default-filled by `projectStore.normalizeRockets` — an absent number would
  otherwise reach the serializer as `NaN`, which a boolean-shaped additive field never risks.

Behaviour worth knowing: on a **one-nozzle** motor the multiplier divides out exactly (it scales
that nozzle's sizing area and the stack total by the same factor). It only apportions expansion
between siblings — a multiplier > 1 makes that nozzle claim less of the shared throat and run at a
proportionally larger ratio, while its siblings run at a slightly smaller one.

### T1 — `<PbrMaterial><Alpha>` — 📋 OPEN

`PbrMaterialReference` gained `[XmlElement("Alpha")] TextureReference? AlphaMap` for the launch
pad's gravel trim. flexo's `CustomMaterial` models five slots
(`src/ksa/assetsXmlSerializer.ts`, `src/ui/MaterialDialog.tsx`). **Nothing is lost on a part path
today**: Core authors `<Alpha>` only in `CoreLaunchPadBAssets.xml`, and `PartModel.PerDrawData`
still binds exactly five texture indices, so the slot currently reaches only `StaticObject.frag`.
Worth modeling when KSA wires alpha into the part pipeline, or when a user wants a cutout material;
the change is one more `TextureReference` through `importMaterials` → `encodeKtx2` →
`assetsXmlSerializer`, not a new mechanism.

### T2 — `<PartModel><Terrain>` — 📋 OPEN

`PartModelModule.TemplateData` gained `[XmlElement("Terrain")] [DefaultValue(false)] bool Terrain`,
so a GLB node named `_Terrain` gets the terrain material. `<PartModel>` is MODELED end to end
(`assetsXmlSerializer.ts` emits `Internal` / `Mesh` / `Material` / `RayTracing` / `ShadowCaster`),
so no passthrough covers it and an authored `<Terrain>` would be dropped from an export variant.
Only static objects author it today. The fix, when wanted, is one more optional bool alongside
`shadowCaster` in `ExportVariantModel`.

### T3 — `<PrimarySequenceModule>` — 📋 OPEN

Sequencing moved from `Part.Sequence` down to per-module `ISequenced.Sequence`, so a part with more
than one sequenceable module names its primary one:
`<PrimarySequenceModule Id="LESMotor"/>`. It is a `SubPartIdReference` on `PartTemplate`, declared
in the same slot `<Decoupler>` vacated. Core authors it only under `<PartGameData>`, where flexo's
`RawXmlNode` passthrough round-trips it verbatim — so **nothing is lost today**, exactly as with
`<Grab>`/S2. It is dropped on a geometry `<Part>` and invisible to the editor. Modeling it means a
module-id picker (the ids it targets are `<RocketEngineController Id>`, `<Decoupler Id>`, … — the
same namespace `<Light Id>` now shares), which is why it waits.

### T4 — the kitten MMU asset moved — 📋 OPEN

`CharacterAssets.xml`: `KittenMMUGlb` now sources `Characters/KittenMMU/SK_KSA_MMU.glb` instead of
`KSA_Cat_MMU.gltf`. Both files ship in the 5348 mirror, so `kittenAssets.ts`'s hard-coded path
still resolves and the Add ▸ Kitten aide keeps rendering — it just shows the retired MMU. Editor
only: kittens are never exported as kittens. Following it needs the new GLB's mesh and material
names verified in a browser first (the aide depends on exact material names), which is why it is
not a blind path swap.

---

# 5261 review — `2026.8.5.5168` → `2026.8.19.5261`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — `diff -rq` of the two
provided asset trees (`ksa-game-assemblies_prev/current` @ 5168 vs `ksa-game-assemblies/current`
@ 5261), a sweep of all **244 changed `decomp/*.cs`** for `[XmlElement]` / `[XmlAttribute]` /
`[XmlType]` / `[XmlIgnore]` hunks, and a `cmp` byte-identity check over every verbatim-ported
class. `version.json` @ 5261 documents revs 5169–5258.

5261 is a **very large release** — kitten EVA locomotion (walking, jumping, tumbling, ladders,
grabbing), crew-portrait and resources gauges, per-canvas gauge visibility contexts, `SimTime`
replaced by 128-bit `UniverseTime`, physics-bubble and per-vehicle parallel job batching, a cursor
hover rework, and SOI departure-burn accuracy fixes — whose **entire XML schema delta is 8 files**,
of which four reach flexo.

**What the added/removed file lists flagged first:** `MeshColliderTemplate.cs` and
`ConvexHullColliderTemplate.cs` appear in "Only in CURRENT", which
[scope/colliders.md](../scope/colliders.md) had explicitly predicted as the shape a
MISSING-CAPABILITY in that area would take. `SimTimeReference.cs` and `INearestString.cs` appear in
"Only in PREVIOUS" — neither is a flexo dependency; the second is rev 5169's display refactor,
which accounts for the entire (large) diff across the unit-reference family whose **parse tables
are unchanged**.

## Priority summary (5261)

| # | Gap | Severity | Status | Scope doc |
|---|---|---|---|---|
| S0 | `SolidMotor.ResizeNozzles` re-ordered its area-ratio clamps (rev 5173) so the LOW bound wins where they cross, and **deleted** the `"Stack too large for the nozzle"` rejection; flexo's verbatim port had the pre-5261 ordering and refused thrust curves the game now sizes | BREAKING | ✅ **FIXED** (this review) | [engines](../scope/engines.md#what-changed-in-5261) |
| S1 | `ColliderModule` gained a **fifth** primitive, `<ConvexHull>` (rev 5185) — the first backed by a mesh rather than an analytic shape; flexo's `ColliderShape` union has four members, so a part authoring one round-trips lossy | MISSING-CAPABILITY | 📋 **OPEN** | [colliders](../scope/colliders.md#what-changed-in-5261) |
| S2 | `<Grab>` kitten-handhold anchors (rev 5203) declared on both `PartTemplate` and the GameData template; Core authors them only under `<PartGameData>` so the passthrough preserves them, but they are opaque to the editor and dropped if authored on a geometry `<Part>` | MISSING-CAPABILITY | 📋 **OPEN** | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-5261) |
| S3 | `LightModule.TemplateData` gained `<DisableInIva>` (always-on, EC-free, hidden in IVA), live on Core's new CoreIVASpaceA face-fill lights; `<Light>` is MODELED so the passthrough never covered it and a round-trip dropped the flag | MISSING-CAPABILITY | ✅ **FIXED** (this review) | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-5261) |
| S4 | Rev 5200's re-import dropped Core's last two `<ShadowCaster>false</ShadowCaster>`s, so no Core template authors the element; schema untouched, only a real-data test anchor moved | COSMETIC | ✅ **FIXED** (this review) | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-5261) |
| — | Everything else | NONE | ✅ re-verified INTACT | — |

### S0 — the solid-motor area-ratio clamps swapped precedence — ✅ FIXED

**Severity: BREAKING.** This is the first change to a verbatim-ported physics function since 5056.

Game-side (`decomp/KSA/SolidMotor.cs`, `ResizeNozzles`), before → after:

```csharp
// 5168
float num3 = ComputeTotalThroatArea(num, MaxStablePressure, num2);
MaxAreaRatioBound = num2 / num3;
if (MaxAreaRatioBound < 1.2f) return "Stack too large for the nozzle";
MinAreaRatioBound = ((num7 < float.MaxValue) ? Math.Clamp(num2 / num7, 1.2f, MaxAreaRatioBound)
                                            : MaxAreaRatioBound);

// 5261
MinAreaRatioBound = ((num6 < float.MaxValue) ? MathF.Max(num2 / num6, 1.2f) : 1.2f);
float num7 = ComputeTotalThroatArea(num, MaxStablePressure, num2);
MaxAreaRatioBound = MathF.Max(num2 / num7, MinAreaRatioBound);
```

Three behavioural deltas: the **low bound wins** where the two cross (it used to be clamped into
the high one); the no-finite-throat fallback is a flat `1.2` rather than `MaxAreaRatioBound`; and
the **rejection is gone** — a stack whose peak burning area demands a ratio under `1.2` now runs at
the `1.2` floor.

**flexo target:** `src/ksa/solidMotorPhysics.ts`, `resizeNozzles()` (the `maxAreaRatioBound` /
`minAreaRatioBound` derivation, ~L510–540) and the `ThrustCurveFailure` union (~L340).

**Fix applied**, framed per the no-migration rule — the old ordering was **replaced**, not gated:

- `minAreaRatioBound` is now `Math.max(totalExitArea / smallestThroat, SOLID_NOZZLE_MIN_AREA_RATIO)`,
  falling back to `SOLID_NOZZLE_MIN_AREA_RATIO`;
- `maxAreaRatioBound` is now `Math.max(totalExitArea / peakThroat, minAreaRatioBound)`, computed
  after it;
- `'stack-too-large'` was removed from `ThrustCurveFailure` entirely (no consumer outside the
  module referenced it).

No `PROJECT_SCHEMA_VERSION` bump — this is derived computation, nothing persisted.

**Regression test:** `src/ksa/solidMotorPhysics.test.ts` gained "lets a stack too large for its
nozzle run at the 1.2 floor instead of rejecting it" — a 40 m × 1.2 m-radius neutral grain on the
seeded nozzle. It resolves to `areaRatio === 1.2` **exactly**, i.e. the min bound raised the max
one, which is precisely the case the pre-5261 port returned `null` for.

### S1 — `<ConvexHull>`, a fifth collider primitive — 📋 OPEN

**Severity: MISSING-CAPABILITY.** Rev 5185 added
`[XmlElement("ConvexHull", typeof(ConvexHullColliderTemplate))]` to `ColliderModule.Template`,
alongside the four analytic shapes and in the same `List<ColliderTemplate>` — so it is authorable
at every site the others are.

- `MeshColliderTemplate` (new): `[XmlElement("Mesh")] MeshReference Mesh` +
  `[XmlElement("Scale")] Vector3Reference? Scale`. **Not directly authorable** — no element in
  `ColliderModule`, and `CreateShapeInto` throws `"cannot be registered with Bepu yet"`.
- `ConvexHullColliderTemplate` extends it and is the authorable one; `ConvexHullHelper.CreateShape`
  builds the hull at load and **throws** if the mesh "has no volume".
- `ColliderTemplate` also gained `[XmlIgnore] virtual double3 ShapeOffsetCollider => double3.Zero`,
  applied as `LocationAsmb + ShapeOffsetCollider.Transform(collider2Asmb)`. **Zero for all four
  analytic primitives**, so flexo's existing placement math is untouched.
- Only `Content/Core/GroundClutter/GenericRockAssets.xml` authors one today; no Core part does.

**flexo targets:** `src/ksa/types.ts:127` (`ColliderShape` union) and `:133` (`COLLIDER_SHAPES`);
collider parse/emit in `src/ksa/partXmlParser.ts` / `partXmlSerializer.ts`;
`src/ksa/colliderFit.ts` / `colliderSize.ts` / `colliderValidation.ts`;
`src/state/colliderStore.ts`; `src/three/ColliderObject.ts`;
`src/ui/build/ColliderInspector.tsx`.

**Fix (framed per the no-migration rule):** add the fifth member to `ColliderShape` outright. This
is genuinely more than a field addition, which is why it is left open rather than folded into this
review:

1. Parse/emit `<ConvexHull>` with its `<Mesh>` id reference and optional `<Scale>` — the first
   collider that references another asset, so it needs the same id-remap treatment on export that
   mesh references already get (`src/ksa/idRemap.ts`, `modExport.ts`).
2. Give it a viewport representation. The four analytic gizmos do not apply; the honest minimum is
   drawing the referenced mesh's own hull, and `colliderFit.ts` / `colliderSize.ts` (which think in
   `Transform.scale`) do not model it.
3. Add export validation that the referenced mesh is a **closed, non-degenerate solid** — KSA
   **throws at load** otherwise, which is a hard crash rather than a visual defect, so this belongs
   in `colliderValidation.ts` and `exportIssues.ts`.

Until then, the honest interim behaviour is what happens today: a `<ConvexHull>` on an imported
part is silently dropped. If that is judged too quiet, the cheap intermediate step is a parse-time
finding in `gameDataFindings.ts` naming the dropped element.

### S2 — `<Grab>` handhold anchors are opaque to the editor — 📋 OPEN

**Severity: MISSING-CAPABILITY, currently lossless.** Rev 5203 added `GrabTemplate`
(`[XmlAttribute] Id` / `Hidden`; `[XmlElement] <Position>` / `<Normal>`, the latter defaulting to
`(0,0,1)` and normalized) and declared `[XmlElement("Grab")] List<GrabTemplate> Grabs` on **both**
`PartTemplate` and the GameData template, merged by `PartTemplate.ApplyGameData`.

Core authors them only under `<PartGameData>`: five capsule spine handholds in
`CoreCommandAGameData.xml`, and the ladder's three rungs plus two `Hidden="true"` park anchors in
`CoreUtilityAGameData.xml`. That is inside flexo's `RawXmlNode` passthrough surface, so **they
round-trip verbatim today** and appear in `src/ui/data/PassthroughViewer.tsx`.

Open for two reasons: they are invisible to the editor (no marker, no inspector, no check that a
`<Position>` lies on the mesh), and a `<Grab>` on the geometry `<Part>` — schema-legal, just not
what Core does — falls outside the passthrough and **is dropped**.

**flexo targets if modeled:** `src/ksa/types.ts` (a `PartGrab` shaped like the existing
point-plus-direction records), parse/emit in `partXmlParser.ts` / `partXmlSerializer.ts`,
and — because it is a point with a normal — the connector/seat marker machinery in
`src/three/` is the natural template. Persisting it **would** need a `PROJECT_SCHEMA_VERSION`
bump only if grabs currently stored as passthrough `RawXmlNode`s were re-homed into a typed field,
since that changes the meaning of already-stored data; the boot purge in
`src/state/projectStore.ts` handles it.

### S3 — `<Light><DisableInIva>` was dropped on round-trip — ✅ FIXED

**Severity: MISSING-CAPABILITY (silent data loss on real Core data).**
`LightModule.TemplateData` gained `[XmlElement("DisableInIva")] public bool DisableInIva = false`.
It hides the light from the IVA viewport **and** — via the new `LightModule.IsActive`, which
short-circuits to `true` before consulting `LightSwitch` / `PowerConsumers` — makes it always-on
and EC-free. Core authors it on two new face-fill lights in `CoreIVASpaceAGameData.xml`, added for
the rev-5193 crew-portrait camera.

`<Light>` is a **MODELED** element, so the `<PartGameData>` passthrough (unmodeled children only)
never covered it: importing such a part and re-exporting turned a free, IVA-hidden fill light into
an EC-consuming one shining into the seated player's view.

**Fix applied** — modeled end to end:

- `src/ksa/types.ts` — `PartLight.disableInIva: boolean`, defaulted `false` in `createPartLight`.
- `src/ksa/partXmlParser.ts` — read in `lightFromElement`.
- `src/ksa/partXmlSerializer.ts` — emitted in `buildLightElement` **only when true** (KSA's default
  is `false`, matching how `<RayTracing>` is handled).
- `src/state/projectCodec.ts` — persisted as the optional `dii` key; `src/state/projectTransfer.ts`
  — carried across project import/paste.

**No `PROJECT_SCHEMA_VERSION` bump:** the key is additive and its absence decodes to `false`, which
is exactly what pre-5261 projects meant — no stored value changes meaning.

Authoring-only for now: flexo's viewport is never an IVA camera, so the flag changes nothing on
screen and no inspector control was added. `src/ui/build/LightInspector.tsx` /
`src/ui/data/sections/LightsSection.tsx` are where a toggle would go if it is wanted.

**Regression tests:** `partXmlSerializer.test.ts` gained "emits `<DisableInIva>` only when set", and
`partXmlParser.test.ts`'s real-fixture seat test now asserts the two new Core face-fill lights parse
with `disableInIva: true` while the original interior light stays `false`.

### S4 — Core stopped authoring `<ShadowCaster>` — ✅ FIXED

**Severity: COSMETIC.** Rev 5200 re-imported the command/fairing/landing/utility parts through the
game's own GLB→XML tool, and the re-import dropped Core's only two
`<ShadowCaster>false</ShadowCaster>` elements (the `CoreCommandA` medium-capsule windows). No Core
template authors the element at 5261.

The schema is **untouched** — `PartModelModule` is byte-identical and still declares
`[XmlElement("ShadowCaster")] public bool ShadowCaster = true` — so flexo's parse/emit is unchanged
and nothing regresses. The only casualty was the real-data anchor in `src/ksa/catalog.test.ts`,
which asserted `window.shadowCaster === false` against `CoreCommandA_Subpart_MediumCapsuleWindowA`.
It now asserts that **no** Core template authors one, so it flips back the moment a future
re-import re-authors it. The inline-XML suite in the same file remains the capture coverage, and it
runs without the private asset tree.

---

# 5168 review — `2026.8.3.5117` → `2026.8.5.5168`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — `diff -rq` of the two
provided asset trees (`ksa-game-assemblies_prev/current` @ 5117 vs `ksa-game-assemblies/current`
@ 5168), a sweep of all **226 changed `decomp/*.cs`** for `[XmlElement]` / `[XmlAttribute]` /
`[XmlType]` / `[XmlIgnore]` hunks, and a `cmp` byte-identity check over every verbatim-ported
class. `version.json` @ 5168 documents revs 5118–5166.

5168 is a **very large release** — kitten locomotion, an imgui UI restyle, a dynamic-rendering +
CMAA2 renderer rework, terrain/ocean accuracy work, flight-plan SOI fixes — whose **entire XML
schema delta is 8 files**, and only three reach flexo. Every verbatim-ported physics class is
byte-identical, so `enginePhysics.ts`, `solidMotorPhysics.ts`, `grainGeometryCatalog.ts`,
`reactionCatalog.ts`, `lightFalloff.ts` and `ivaLook.ts` need **no re-port**.

**The one thing that looked breaking and wasn't:** the collider classes (`ColliderModule`,
`ColliderTemplate`, all four primitives) all show up in the decomp diff. Every hunk is decompiler
noise — the Bepu DLLs were added to the snapshot, so the `//IL_xxxx: Unknown result type` comment
blocks vanished and `Shapes` resolved to `BepuPhysics.Collidables.Shapes`. No field or attribute
moved.

**The other:** rev 5133 shipped "Control From Here", exactly the `controlpoint` /
`referencetransform` feature `scope/connectors-coordinates-iva.md` had been told to grep for on
every update. It landed on the **vehicle save**, not on a part template — `Control` and
`ControlTemplate` are byte-identical empty markers — so flexo authors nothing new. See R2.

## Priority summary (5168)

| # | Gap | Severity | Status | Scope doc |
|---|---|---|---|---|
| R1 | Ground clutter moved onto the asset bundler: `ClutterObjectTemplate` is now a top-level id-referenced asset (`Atlas=`, `<Colliders>`, exactly 5 `<LOD>`s), `<LOD><Mesh>` is a `SerializedReference` id list, and the ecotype `<Material>` list became `[XmlIgnore]`/derived — `build-cartoon-moon.ts` emits the old form and the scaffold no longer loads | BREAKING (scaffold-only) | 📋 **OPEN** | [ground-clutter](../scope/ground-clutter.md#what-changed-in-5168) |
| R2 | "Control From Here" (rev 5133) makes the vehicle attitude reference the *control* frame via `Vehicle.Ctrl2Body`; no flexo schema change, but connector orientation is now load-bearing for flight control and the docs said "up follows the root" unconditionally | SCHEMA-DRIFT (docs) | ✅ **docs updated** / 📋 open for UI surfacing | [connectors-coordinates-iva](../scope/connectors-coordinates-iva.md#what-changed-in-5168) |
| R3 | Rev 5161's new `CoreUtilityAAssets.xml` (ladders) was absent from the hand-maintained `ASSET_FILES`, so the new parts were invisible in the Part/SubPart browsers with nothing failing | MISSING-CAPABILITY | ✅ **FIXED** (this review) | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-5168) |
| — | Everything else | NONE | ✅ re-verified INTACT | — |

### R1 — the ground-clutter asset-bundler rework — 📋 OPEN

**Severity: BREAKING, but contained.** Clutter is a data-only celestial mod scaffold
(`ksa-mods/cartoon-moon/`, generated by `scripts/build-cartoon-moon.ts` — a legacy Bun script run
from `scripts/`). It never touches the part editor, so nothing else is blocked.

Game-side, with class + member names:

- `ClutterObjectReference` was **renamed and re-homed** to `ClutterObjectTemplate`, now a
  `SerializedId` registered in `ModLibrary.AllClutterObjects` and declared at the top level of an
  `<Assets>` bundle (`AssetBundle` gained
  `[XmlElement("ClutterObject", typeof(ClutterObjectTemplate))]` and
  `[XmlElement("GroundClutterMaterial", typeof(GroundClutterMaterialReference))]`). It carries
  `[XmlAttribute("Atlas")] AtlasId`, `[XmlArray("LODs")]/[XmlArrayItem("LOD")] Lods`, and a new
  `[XmlArray("Colliders")]` accepting `Box`/`Capsule`/`Cylinder`/`Sphere` `ColliderTemplate`s.
- `ClutterEcotypeReference.ClutterObjects` is now `List<ClutterObjectTemplate>` resolved by **id**
  in `OnDataLoad` (`ClutterObjects[i] = ClutterObjects[i].Get()`), so `<ClutterObject>` under an
  `<Ecotype>` is an id reference, not an inline definition.
- `ClutterEcotypeReference.MaterialReferences` moved from `[XmlElement("Material")]` to
  **`[XmlIgnore]`**, derived by the new `PopulateMaterialReferences()` (walks every LOD's materials,
  dedupes by hash). Authoring `<Material>` on an ecotype is now silently ignored.
- `GroundClutterLodReference.MeshFileReference` (a `MeshAtlasFileReference`) became **`MeshIds`, a
  `List<SerializedReference>`**; `MaterialReferencesCount` / `MeshesMaterialCount` were replaced by
  an internal `_atlasToLocalMaterial` remap; `CastShadows` gained `[DefaultValue(true)]`.
- `ClutterObjectTemplate.IsValid()` now requires **exactly 5** LODs.
- Rev 5135 fixed a real validation bug: `ClutterEcotypeReference.IsValid()`'s uniform-scale check
  went from `Collideable && (flag2 || !flag3)` to `Collideable && (!flag2 || !flag3)`.
- Content: all clutter assets were reprocessed — textures are now all KTX2 (diffuse includes alpha;
  new **Opacity**/**Thickness** BC4 maps), the individual clutter model XMLs were removed, and
  Core's `mod.toml` now lists `GroundClutter/{GenericRock,Grass,EarthTrees}Assets.xml`.
  `Solid.frag` gained gamma correction keyed off diffuse alpha (the bundler emits linear textures).

**Fix (framed per the no-migration rule):** switch `groundClutterXml` / `clutterObjectXml` /
`lodsXml` / `buildBodyXml` in `scripts/build-cartoon-moon.ts` **wholesale** to the new form — emit
`<ClutterObject Id Atlas>` assets at bundle top level with 5 `<LOD>`s and id-referenced `<Mesh>`
children, reference them by id from the ecotype, and drop the ecotype `<Material>` emission
entirely. Do not teach it to emit both forms. Then regenerate `ksa-mods/cartoon-moon/` and re-check
in-game (that check was already pending from 5117).

### R2 — "Control From Here" moved the reference-orientation contract — 📋 partially open

**Severity: SCHEMA-DRIFT, docs-only. No flexo code change is required.**

`FlightComputer.ComputeControl` now computes attitude error against the **control** frame:

```csharp
Ctrl2Asmb = nav.Ctrl2Body;
UpdateAttitudeError(in inputs, GetCtrl2Cci(in nav), GetCtrlRates(in nav));
// GetCtrl2Cci  = Concatenate(nav.Ctrl2Body, nav.Body2Cci)
// GetCtrlRates = nav.BodyRates.Transform(nav.Ctrl2Body.Inverse())
```

with `Vehicle.Ctrl2Body => ControlConnector?.Asmb2VehicleAsmb ?? ControlPart?.Asmb2VehicleAsmb ??
doubleQuat.Identity`, and `Vehicle.SetControlPart(part, connector)` accepting only a part with a
`Control` module in its subtree or a `DockingPort` whose `Connector` matches.

Why flexo needs no change: `Control.cs` / `ControlTemplate.cs` are **byte-identical empty markers**
(no transform, no control-point field), and the selection persists on the **vehicle save** —
`VehicleData` gained `[XmlElement("ControlPartId")] uint` and `[XmlElement("ControlConnectorId")]
string`, written in `Vehicle.cs:1154-1155` and resolved in `CelestialSystem.DeserializeSave`. flexo
authors part templates, never `vehicle.xml`. `Ctrl2Body` also defaults to identity, so the
unselected case is the old root-part behaviour exactly.

**Done:** `scope/connectors-coordinates-iva.md` re-states the contract, and
`docs/ksa-part-connector-notes.md` gained a section explaining that a docking-port connector's
orientation can now become the navball frame — so a 90°-off connector produces a wrong navball, not
just a wrong attachment pose.

**Still open (optional, low priority):** flexo has no UI cue for this. A candidate is flagging
docking-port / `<Control/>`-bearing parts in the connector inspector so authors know that
connector's orientation is player-selectable as the control frame.

### R3 — new Core part file missing from `ASSET_FILES` — ✅ FIXED

Rev 5161 imported `CoreUtilityAAssets.xml` + `CoreUtilityAGameData.xml`
(`CoreUtilityA_Prefab_LadderA` and 11 `<SubPart>` templates; "not yet functional as ladders") and
registered both in Core's `mod.toml`. flexo's catalog reads a **hand-maintained** list —
`ASSET_FILES` in `src/ksa/catalog.ts:70` — which did not include it, so the parts were simply
absent from the Part and SubPart browsers, with no test failing. The private asset mirror already
carried the file plus its GLB atlas and three UASTC textures.

**Fixed:** `CoreUtilityAAssets.xml` added to `ASSET_FILES` (`GAMEDATA_FILES` derives the GameData
sibling automatically). To stop this recurring, `src/ksa/catalog.test.ts` gained a guard that
enumerates `Core*Assets.xml` in the live private tree and fails on any file `ASSET_FILES` omits
(skipped in open-source CI, where the private tree is absent).

---

# 5117 review — `2026.7.10.5056` → `2026.8.3.5117`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — `diff -rq` of the two
provided asset trees (`ksa-game-assemblies_prev/current` @ 5056 vs `ksa-game-assemblies/current`
@ 5117) plus a sweep of every changed `decomp/*.cs` for `[XmlElement]` / `[XmlAttribute]` /
`[XmlType]` hunks. `version.json` @ 5117 documents revs 5057–5116.

5117 is a **large release with a tiny schema surface**: crew/kitten rosters, burn-planning UX,
launch pads, whole-vehicle destruction, and plume-trail/atmosphere refactors — but the entire
XML-contract delta is **seven attribute/element hunks**, of which two reach flexo. Both come from
the same feature (rev 5085, EVA-door ↔ IVA-seat linking).

**The one thing that looked breaking and wasn't:** rev 5067 **deleted**
`Double3Ex.Up`/`Down`/`Right`/`Left`/`Forward`/`Backward`, a named anchor in
[connectors-coordinates-iva.md](../scope/connectors-coordinates-iva.md). The three surviving
vectors moved to `Camera.ForwardView` / `RightView` / `UpView` with **identical values**
(`-UnitZ` / `+UnitX` / `+UnitY`), and `QuaternionEx.GetAxis`'s fallback became the identical
`double3.UnitY`. `CreateFromXyzRadians` is byte-identical. No recalibration of `coords.ts`'s
`EULER_ORDER`; `ivaSeatAxes.test.ts` (the canary) passes.

## Priority summary (5117)

| # | Gap | Severity | Status | Scope doc |
|---|---|---|---|---|
| Q1 | `<EVADoor SeatId>` (new `[XmlAttribute]` on `EVADoorTemplate`, authored by Core) was dropped on import→export — the attribute sits on a MODELED child, so the GameData passthrough does not cover it | MISSING-CAPABILITY | ✅ **FIXED** (P6.04 — `EvaDoor.seatId`) | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-5117) |
| Q2 | `<IVASeat Id>` was discarded on import and never emitted, but is the target `<EVADoor SeatId>` resolves against — Core authors one on both capsule seats | MISSING-CAPABILITY | ✅ **FIXED** (P6.04 — `IvaSeat.ksaId`) | [connectors-coordinates-iva](../scope/connectors-coordinates-iva.md#what-changed-in-5117) |
| Q3 | Clutter ecotype `<Collideable Value>` renamed to `<CollisionType Value="None\|PrimitiveList\|Mesh">`; the cartoon-moon scaffold emits neither, so docs-only | SCHEMA-DRIFT (docs) | 📋 **OPEN** | [ground-clutter](../scope/ground-clutter.md#what-changed-in-5117) |
| Q4 | `validateEngines` has no parity with KSA's five new engine-wiring warnings (rev 5091) — all silent no-thrust failures | MISSING-CAPABILITY (low) | 📋 **OPEN** | [engines](../scope/engines.md#what-changed-in-5117) |
| — | Everything else | NONE | ✅ re-verified INTACT | — |

### Q1 + Q2 — the EVA-door ↔ seat link (fix these together) — ✅ FIXED

**Shipped in flexo v2 P6.04 (design decision D17), exactly as prescribed below.** `EvaDoor`
gained `seatId: string | null` and `IvaSeat` a user-authored `ksaId: string | null` (`null` ⇒ the
attribute is omitted); parser + serializer read/write both; the project codec carries them as
`ed.s` and `iv[].k` (additive, so NEITHER `PROJECT_SCHEMA_VERSION` nor `PROJECT_EXPORT_VERSION`
was bumped — an old payload lacking them decodes to `null`, which is exactly "no link"). The
editor half is Data mode's Coupling seat picker over `setEvaDoorSeat`, which mints the seat id
(uniquified against the shared `Components[].Id` namespace) and points the door at it in ONE
undo step. Round-trip tests: `src/ksa/partXmlSerializer.test.ts`
`describe('EVA door ⇄ IVA seat link (D17)')`. `partCatalog.ts` needed no change — it carries
whole `IvaSeat`/`EvaDoor` objects through the merge, so both fields ride along.

The original analysis is kept below as the record of WHY.

Rev 5085 wired hatches to specific seats. Game side:

```csharp
// decomp/KSA/EVADoorTemplate.cs — the class's FIRST field ever
[XmlAttribute("SeatId")]
public string SeatId = string.Empty;

// decomp/KSA/EVADoor.cs — ResolveAlignedSeats
if (!(iVASeat.TemplateId != eVADoor.SeatId)) { eVADoor.AlignedSeat = iVASeat; break; }
```

`IVASeat.TemplateId` comes from `ModuleBase.TemplateDataBase.Id` — the `Id` attribute that has
always been schema-legal on `<IVASeat>` and that flexo has always deliberately skipped. Core now
authors both ends (`Content/Core/PartGameData.xml` +
`Content/Core/CoreIVASpaceAGameData.xml`):

```xml
<SubPartGameData Id="CoreCommandA_Subpart_MediumCapsuleCrewDoorA">
    <EVADoor SeatId="CoreIVASpaceA_Prefab_MediumCapsuleA_SeatA" />
</SubPartGameData>

<IVASeat Id="CoreIVASpaceA_Prefab_MediumCapsuleA_SeatA"> … </IVASeat>
```

It is functionally load-bearing, not cosmetic: `EVADoor.ShowContextMenu` returns early — **no
EVA button at all** — when the aligned seat has no assigned kitten, and boarding targets that
seat specifically (with the range raised 15 m → 25 m).

**flexo `file:line` targets:**

| File | Symbol | Change |
|---|---|---|
| `src/ksa/types.ts` (`EvaDoor`, ~`:573`) | `interface EvaDoor { connectorId }` | add `seatId: string` (`''` ⇒ emit no attribute) |
| `src/ksa/types.ts` (`IvaSeat`, ~`:200`) | `id` is documented "NEVER emitted" | add a distinct user-authored `ksaId: string`; keep `id` as the internal `_seatN` document id |
| `src/ksa/partXmlParser.ts` ~`:674` | `const eva = directChildren(gd, 'EVADoor')[0]` | read `SeatId` alongside `ConnectorId` |
| `src/ksa/partXmlParser.ts` ~`:289` | `ivaSeatsFromElement` | keep `el.getAttribute('Id')` in `ksaId` instead of discarding it |
| `src/ksa/partXmlSerializer.ts` ~`:257` | the `<EVADoor>` builder | emit `SeatId` when non-empty |
| `src/ksa/partXmlSerializer.ts` ~`:456` | `buildIvaSeatElement` | emit `Id` when `ksaId` is non-empty; **update the doc comment** — its "nothing references a seat by id" premise is now false |
| `src/ksa/partCatalog.ts` ~`:147`/`:201` | seat merge across both authoring sites | carry `ksaId` through the merge/renumber |
| `src/state/projectCodec.ts` | seat + EVA-door codecs | add the two fields |
| UI | Part Data / seat inspector | a seat-id field, and an EVA-door seat picker offering the part's seat ids |

**Constraint that survives (do not lose it):** `TemplateDataBase.Id` shares the namespace
`<FeedsFrom Container="…">` resolves against (`PartTemplate.AddResolvedFeed` scans every
`Components[].Id`). So flexo must emit a **user-authored** id, never its internal `_seatN`, and
an empty `ksaId` must emit no attribute at all — matching Core's pre-5117 seats byte-for-byte.

**Per the no-migration rule:** this is a straight add of the current form. No fallback for
`<EVADoor>` without `SeatId` beyond "the attribute is absent", and stale persisted projects are
discarded by the boot purge (`sanitizeProjectStorage` → `snapshotMatchesModel`), not converted.

### Q3 — clutter `<Collideable>` → `<CollisionType>` (docs-only)

Rev 5099 replaced `ClutterEcotypeReference`'s `[XmlElement("Collideable")] BoolReference` with
`[XmlElement("CollisionType")] ClutterCollisionTypeReference` (new file; one
`[XmlAttribute("Value")]` enum `None` | `PrimitiveList` | `Mesh`, default `None`), keeping a
derived `[XmlIgnore] bool Collideable`. `ksa-mods/cartoon-moon/` emits **neither** element, so
the scaffold is valid under both spellings — the only work is the scope-doc correction (done)
plus recording rev 5098/5099's two new rules: collideable ecotypes must have **uniform** scale
(now an `IsValid` error) and placement scale is quantized to **16 discrete steps** between
`MinScale`/`MaxScale` (runtime only, no schema).

### Q4 — validator parity with KSA's new wiring warnings (low)

Rev 5091 added five `Warning`-level checks for engine modules "not wired up correctly in the
template XML" (`RocketControllerTemplate.OnDataLoad`, `Rocket`/`RocketCore`/`RocketNozzle`
`.OnFullPartCreated`, `RocketCore.BindFeedPoints`). `src/ksa/engineValidation.ts`'s
`validateEngines` (~`:193`) covers the cases KSA **throws** on but none of these — they are
silent no-thrust failures, exactly what that validator exists to catch. Add them at `warn`
severity with codes mirroring the game's wording.

### Non-gaps worth recording

- **`PartInstance.RuntimeId` (rev 5085) is a relaxation, not a break.** `<FeedsFrom SubPart=>`
  now resolves against `Id` → template `Id` → `InstanceOf` instead of the raw `PartInstance.Id`,
  so an id-less `<SubPart>` placement became addressable. flexo always emits explicit placement
  ids. [plumbing-and-feeds](../scope/plumbing-and-feeds.md#what-changed-in-5117).
- **`EditorTag.cs` gaining `Booster`/`Coupling`/`Cargo` statics is the C# side catching up** to
  `CoreEditorTagsGameData.xml`, which is **unchanged**. flexo's `EDITOR_TAG_DEFS` already lists
  all 17 registry entries in order — re-diffed, no refresh needed.
- **The kitten roster / crew assignment feature is save-game + UI only.** `KittenRosterData`,
  `IVASeat.SaveData` (`AssignedKittenName`), `VehicleData.HasLaunched` and `UniverseData`'s
  `<KittenRoster>` are all SAVE schema. flexo authors part templates, not vehicle saves.
- **`<Substance DefaultPhase>` + `<Color>`** (`Volatiles.xml` / `SolidPropellants.xml`) changed
  KSA's substance **display** names (`"Gaseous X"` → `"X Vapor"`; default phase renders bare).
  flexo consumes only substance-phase **ids** (`H2(l)` et al.), which are unchanged.
- **`<Landmark IsLaunchPad>`** (`LandmarkReference.cs`) + the launch-pad clutter exclusion zone
  is a celestial/landmark authoring surface with no flexo integration point. Not a new scope row
  unless flexo ever authors landmarks.
- **`AssetBundler.WarnIfUnappliedTransform` (rev 5060) confirms existing flexo behaviour** —
  KSA's importer now warns on non-identity mesh-atlas node TRS; `exportGlb.ts` writes no node
  TRS at all. [custom-assets](../scope/custom-assets-and-mod-export.md#what-changed-in-5117).
- **`ThumbnailRenderResources.cs` is byte-identical** ⇒ the un-guarded `NormalReference` /
  `AoRoughMetalReference` deref survives ⇒ synthetic Normal + ORM remain mandatory on every
  `<PbrMaterial>`.
- **Ported engine physics is byte-identical** — none of `DeLavalNozzleConfig`, `CombustorConfig`,
  `GasProperties`, `CombustionTable`, `NozzlePerformance`, `RocketDesign`, `RocketControllerData`
  or `EngineDesigner` appears in the decomp diff. Zero changes to `enginePhysics.ts`.
- **Content-only churn:** `CoreElectricalAGameData.xml` deleted redundant placeholder
  `<Collider>` blocks; `CoreFuelTankA/B` re-tuned tank oversizing (values + comments);
  `CorePropulsionAAssets.xml` was re-imported with transforms applied to vertices. All six
  vendored `src/ksa/__fixtures__/` files re-synced; `src/ksa` suite (614 tests) passes.

---

# 5056 review — `2026.7.9.5018` → `2026.7.10.5056`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — `git diff 3106557
13595c1` over the decomp + shipped Core XML, plus `diff -rq` of the two private-mirror
`assets/` trees. `version.json` @ 5056 documents revs 5019–5055.

Two load-bearing revs: **5022** (nozzles pick their exhaust FX from the configured reaction)
and **5034** (KSA's own keyframe-GLB loader fixed). A third, **5025**, moved the
`GlbToXmlUtility` in-tree and regenerated nine Core part files through it.

**Why 5022 was dangerous:** `<DeLavalNozzle>` and `<SolidMotorNozzle>` are MODELED elements, so
their unmodeled children never ride the `<PartGameData>`/`<SubPartGameData>` `RawXmlNode`
passthrough. When `<VolumetricExhaust>`/`<PlumeTrail>` moved one level down into
`<ReactionPlume>`, flexo read nothing and wrote a form the game ignores — plumes lost on import
AND on export, with no error either way.

## Priority summary (5056)

| # | Gap | Severity | Status | Scope doc |
|---|---|---|---|---|
| P0 | `<VolumetricExhaust>`/`<PlumeTrail>` re-homed into `<ReactionPlume Reaction Default>` ⇒ nozzle exhaust FX lost on import and on export | **BREAKING + DATA-LOSS** | ✅ **DONE** — `reactionPlumes: ReactionPlume[]` replaces the two scalars (no back-compat); parser/serializer/codec/UI updated | [engines](../scope/engines.md#what-changed-in-5056) |
| P1 | Reaction-keyed `<ReactionPlume Reaction="…">` entries round-trip but cannot be created or edited — the two editor selects only drive the unkeyed `Default="true"` entry | MISSING-CAPABILITY | 📋 **OPEN** | [engines](../scope/engines.md#what-changed-in-5056) |
| P2 | `KSA.GlbImport` (`AssetBundler.cs`/`ToolXml.cs`/`InputSet.cs`) — the game's own GLB→Assets.xml tool, now in-tree — maps to no scope row | DOCS | 📋 **OPEN** | [custom-assets](../scope/custom-assets-and-mod-export.md#what-changed-in-5056) |
| P3 | Clutter `SlopeMaskStrength`/`Contrast`/`Bias` + `<AltitudeDensityCurve>` not emitted by the cartoon-moon scaffold | SCHEMA-DRIFT (additive; defaults inert) | 📋 **OPEN** | [ground-clutter](../scope/ground-clutter.md#what-changed-in-5056) |
| — | Everything else | NONE | ✅ re-verified INTACT | — |

### P0 — what was changed (for the record)

| File | Change |
|---|---|
| `src/ksa/types.ts` | New `ReactionPlume` interface + `defaultReactionPlume()` / `withDefaultReactionPlume()` helpers; `DeLavalNozzle` and `SolidMotorNozzle` swap `volumetricExhaustId`/`plumeTrailId` for `reactionPlumes`; `createNozzle` / `createSolidMotorNozzle` updated |
| `src/ksa/partXmlParser.ts` | `commonNozzleFields` maps `directChildren(el, 'ReactionPlume')` |
| `src/ksa/partXmlSerializer.ts` | Emits one `<ReactionPlume>` per entry; omits `Reaction` when unkeyed and `Default` when false |
| `src/state/projectCodec.ts` | `ve`/`pt` scalars → an `rp[]` array (`CReactionPlume`) |
| `src/ui/EngineSections.tsx` | The two selects read/write the DEFAULT entry via the new helpers |
| tests | `partXmlParser.test.ts`, `partXmlSerializer.test.ts` (now asserts the two-entry keyed+default shape), `partCatalog.test.ts` (real LR91), `projectCodec.test.ts` |

### Non-gaps worth recording

- **rev 5034 needed no flexo change** — KSA's loader moved onto the semantics flexo already
  had. But it made the animation GLB's **scene-root TRS load-bearing**; flexo emits identity, so
  keep it that way. Detail in [animation.md](../scope/animation.md#what-changed-in-5056).
- **rev 5025's 4-significant-figure output** shifted every regenerated Core geometry value in its
  last digit. Fixtures re-synced; two collider assertions updated. Not a schema change.
- **Ported engine physics is byte-identical** — `DeLavalNozzleConfig`, `CombustorConfig`,
  `GasProperties`, `NozzlePerformance`, `RocketDesign`, `RocketControllerData`, `EngineDesigner`,
  `RocketCore`, `Combustor`, `FixedReaction`, `MixtureReaction`. Zero changes to
  `enginePhysics.ts`.
- **`SolidMotor.SaveData.Reaction` / `SolidGrainSegment.SaveData.Grain`** are vehicle-SAVE
  fields, not part-template schema. flexo does not author vehicle saves.

---

> **Previous review: `2026.7.8.4980` → `2026.7.9.5018` (see below). BREAKING — and unlike the
> last three updates it was NOT a patch list: KSA changed the SHAPE of how a Part declares
> propellant flow, and flexo's model had no equivalent concept. Every BREAKING / DATA-LOSS /
> MISSING-CAPABILITY / SCHEMA-DRIFT gap is ✅ DONE (implemented across
> [UPGRADE_PLAN_2026-07-24.md](UPGRADE_PLAN_2026-07-24.md) phases 0–7), including the
> long-open part-level `<Tank>` gap. Still 📋 OPEN: geometry-template `<Collider>`
> passthrough, `FuelPort` authoring, the clutter LOD retune (+ its new optional
> `<LOD CastShadows>`), and a solid-motor thrust-curve preview. In-game verification of the
> 5018 output is PENDING.** The earlier `4939 → 4980`, `4892 → 4939`, `4826 → 4892`,
> `4750 → 4826` and `4680 → 4750` reviews follow as history.

---

# 5018 review — `2026.7.8.4980` → `2026.7.9.5018`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — full decomp + shipped
Core XML + private-mirror diff over revs 4981–5016, recorded in
[UPGRADE_PLAN_2026-07-24.md](UPGRADE_PLAN_2026-07-24.md) (which holds the full change register
G1–G13 with game-side anchors, the target model, and the phase-by-phase implementation).

Three load-bearing revs: **4992** (solid rocket motors + connector Capabilities + explicit
engine feed sources), **5002** (solid modules on every booster part,
`HollowOpenSemiEllipsoidMass`, feeding from sub-parts), **5007** (decoupler joints became a
per-connector Capability).

**Why this one was dangerous:** `<Connector>`, `<Combustor>` and `<Tank>` are MODELED
elements, so they never rode the `<PartGameData>` passthrough — every addition was silent
data-loss, and every symptom was a log line rather than a load error. A flexo-exported engine
declared no feed points (dead in-game); a round-tripped Core fuel tank, decoupler or SRB
segment lost its `BulkFluid` / `DecouplerJoint` / `SolidMotorCase`.

## Priority summary (5018)

| # | Gap | Severity | Status | Scope doc |
|---|---|---|---|---|
| F1 | `<Capabilities>` silently dropped from every `<Connector>` (both documents) | BREAKING + DATA-LOSS | ✅ **DONE** — modeled as `Connector.capabilities`, emitted in both docs via one shared helper, merged by id on catalog import, authored in the inspector | [plumbing-and-feeds](../scope/plumbing-and-feeds.md), [connectors](../scope/connectors-coordinates-iva.md#what-changed-in-5018) |
| F2 | `<FeedsFrom>` dropped on `<Combustor>` ⇒ every exported engine reaches no propellant | BREAKING | ✅ **DONE** — `Combustor.feeds`, `createCombustor` defaults to `Parent` | [engines](../scope/engines.md#what-changed-in-5018) |
| F3 | `<Plumbing>` dropped ⇒ RCS thrusters demand `BulkFluid` and get nothing | BREAKING | ✅ **DONE** — `Combustor.plumbing`, `Service` authored from the Engine panel | [engines](../scope/engines.md#what-changed-in-5018) |
| F4 | `<ConsumerFeedWiring>` survived passthrough but its `SubPartId` + child refs went stale on import | BREAKING on import | ✅ **DONE** — modeled + remapped (`src/ksa/idRemap.ts`) | [plumbing-and-feeds](../scope/plumbing-and-feeds.md) |
| F5 | Same stale-reference problem for `<SolidMotor>`/`<SolidGrainSegment>` | BREAKING on import | ✅ **DONE** — modeled + remapped | [plumbing-and-feeds](../scope/plumbing-and-feeds.md) |
| F6 | No solid-motor authoring (`<SolidMotor>`/`<SolidMotorNozzle>`/`<SolidGrainSegment>`) | MISSING-CAPABILITY | ✅ **DONE** — full round-trip + a "Solid motor (SRB)" authoring section | [engines](../scope/engines.md#what-changed-in-5018) |
| F7 | Tanks had no `Id`, so no `<FeedsFrom Container>` could address a flexo tank | MISSING-CAPABILITY | ✅ **DONE** — `Tank.id` on the wrapping element + `<LocationAsmb>` | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-5018) |
| F8 | Part-level `<Tank>` not modeled (carried over as gap **F** from the 4939 review) | MISSING-CAPABILITY | ✅ **DONE** — `PartGameData.tanks` + a Part Data Tanks section | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-5018) |
| F9 | `PLUME_TRAIL_IDS = ['DefaultEngine']` — a dangling id after the template moved/renamed | SCHEMA-DRIFT | ✅ **DONE** — `['DefaultPlumeTrail']` | [engines](../scope/engines.md#what-changed-in-5018) |
| F10 | A `Category="Solid"` custom reaction without burn-rate data CRASHES the mod load | BREAKING (crash-class) | ✅ **DONE** — four fields modeled + round-tripped, seeded on clone, and an unexportable one is SKIPPED with a warning | [engines](../scope/engines.md#what-changed-in-5018) |
| F11 | Multi-token `[Flags]` separator wrong in BOTH directions (pre-existing latent bug) | BREAKING | ✅ **DONE** — emit whitespace, accept either | [connectors](../scope/connectors-coordinates-iva.md#what-changed-in-5018), [docs/xml-io](../docs/xml-io.md) |
| F12 | Vendored fixtures stale (`CoreFuelTankAGameData.xml`, `PartGameData.xml`) | BREAKING (CI) | ✅ **DONE** — re-synced; drift test green | — |
| F13 | `HollowOpenSemiEllipsoidMass` undocumented (passthrough-safe, no code change) | COSMETIC | ✅ **DONE** — recorded | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-5018) |
| F14 | Clutter `<LOD CastShadows>` unused by the cartoon-moon scaffold | COSMETIC (optional) | 📋 **OPEN** — folded into the clutter LOD retune (gap **H**); default `true` preserves today's behavior | [ground-clutter](../scope/ground-clutter.md#what-changed-in-5018) |

**Verified-intact (no action):** ported engine physics — the 13 classes behind
`enginePhysics.ts` are byte-identical, and the constants `9.80665` / `8.31446261815324` /
`101325` are unchanged; the editor-tag registry (`CoreEditorTagsGameData.xml` byte-identical);
animation, kittens and coordinates (no `KeyframeAnimation*`, `Character*`, `QuaternionEx` or
`Double3Ex` change); mod/asset loading (`AssetBundle.cs` gained exactly one line registering
`<GrainGeometry>`; `ThumbnailRenderResources.cs` absent from the diff ⇒ the synthetic
Normal + AoRoughMetal requirement still holds). Runtime-only renames
(`RocketNozzleState.Throttle`→`ThrustFraction`, `ActiveNozzle.ResourceManager`→`Core`,
`RocketCore.ResourceManager` moving down to `Combustor`, …) have no flexo surface.

**Still OPEN across reviews:** geometry-template `<Collider>` passthrough (**E**), `FuelPort`
authoring (**G**), cartoon-moon clutter LOD retune (**H**, now including F14), and — new —
a **solid-motor thrust-curve preview**, which needs a real port of
`SolidMotor.TrySampleThrustCurve` + `GrainGeometryTable` + `SolidGrainSegment.ComputeBurningAreaAtDepth`
(~200 lines) and was deliberately deferred.

**⚠ In-game verification PENDING.** Automated tests cannot prove KSA accepts the output; the
manual checklist is [UPGRADE_PLAN_2026-07-24.md](UPGRADE_PLAN_2026-07-24.md) Phase 8.

---

# 4980 review — `2026.7.6.4939` → `2026.7.8.4980`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — full `git diff 2423a02
cdb7391` inside `ksa-game-assemblies` + `diff -rq` of the 4939/4980 private-mirror `assets/`
trees + per-area contract re-verification (see each scope doc's "What changed in 4980").
`version.json` @ 4980 covers revs 4940–4978: HUD layouts, burn-UI gauge rework, navball
markers, screenshot capture, terrain texture streaming, cascaded-shadow spec constants, and
vehicle-runtime work (docking frame fixes, undock naming, fuel-flow-rule persistence,
event-driven sequence Δv) — none of it crosses flexo's part-template surface.

## Priority summary (4980)

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| A | Core retagged height-affecting celestial textures `Category="Terrain"` → `"TerrainHeight"` (new `TextureCategory` member, rev 4947 — exempts them from the terrain max-size downmip so rendered and collided terrain align); the cartoon-moon Luna-clone block carried the old tags | ✅ **DONE** (was COSMETIC — mod still loads; height textures could be downmipped → render/collision misalignment) | `ksa-mods/cartoon-moon/assets/cartoon_moon.xml` retagged (5 lines: Luna_Normal, Luna_Height, Luna_Biome_ID, Luna_Biome_Control, LunaTestDecalHeight); `build-cartoon-moon.ts` needs no change (clones the Luna block verbatim from Core) | [ground-clutter](../scope/ground-clutter.md#what-changed-in-4980) |

**Verified-intact (no action):** part/subpart templates + editor tags (no `*Template.cs` /
`EditorTagDefinition.cs` in the diff; shipped part XML content-identical — the 8 mirror-file
diffs are CRLF-only sync artifacts; fixtures untouched, drift test green); ported engine
physics + `Reactions.xml` (byte-identical; `SequencePerformanceList` Δv rework and the
`FlowRule` default flip `NearestToFurtherestSameStage`→`FurtherestToNearestSameStage` are
flight-runtime/save-side — flexo has no `FlowRule` surface); animation (no `KeyframeAnimation*`
diff; mirror GLBs byte-identical); kittens (`CharacterRenderResources` hunk = CSM spec constant
only); custom-assets/mod-export (`ThumbnailRenderResources` absent from diff ⇒ synthetic maps
still required; `ENABLE_EMISSIVE` still defined; `ModLibrary` log-noise only;
`TextureCategory.TerrainHeight` additive — parts stay `Vessel`); connectors/coords/IVA +
reference orientation (`QuaternionEx`/`Double3Ex` untouched; `ConnectAndMerge` rewrite keeps
the 180°-Z mate contract; root-identity pin consolidated into `PartTree.NormalizeRootRotation()`
— up-follows-root holds under the new multi-vehicle editor; `ControlTemplate` still an empty
marker — `ControlData.VehicleName`, `FlightComputerData.RCSMode`, RollMode default
`Up`→`Decoupled`, and docking `PreDockRootTransform` are vehicle-save state); ground-clutter
schema (all 7 `*Reference.cs` untouched; shadow-culling/draw-command-ownership changes are
GPU-side). New systems (HUD `LayoutSaves`, `ScreenshotCapture`, `BurnCanvasHost`,
`NavballMarkers`, `CelestialTextureStreamer`, `PartTreeData` vehicle-save shape,
`CollisionAvoidancePair`) are runtime/UI/save surfaces — **no new scope rows needed**.

---

# 4939 review — `2026.7.5.4892` → `2026.7.6.4939`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — full `git diff 7cf5c0a
2423a02` inside `ksa-game-assemblies` + shipped-Core-XML element-path diff + per-area contract
re-verification (see each scope doc's "What changed in 4939"). The update is mostly rendering
(screenspace particles, volumetric plume trails, clutter culling) and vehicle runtime (fuel
lines/ports, tank transfer, sequences); the part-template contract deltas are below. All fixes
follow the no-migration rule.

## Priority summary (4939)

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| A | `<PlumeTrail Id>` on `RocketNozzleTemplate` (Core sets `DefaultEngine` on every main engine; inside flexo's modeled nozzle surface ⇒ silently dropped on import→export) | ✅ **DONE** (was SCHEMA-DRIFT / silent data-loss) | `types.ts` (`plumeTrailId`, `PLUME_TRAIL_IDS`), `partXmlParser.ts`, `partXmlSerializer.ts`, `projectCodec.ts` (`pt`), `EngineSections.tsx` + parser/serializer/codec/catalog tests | [engines](../scope/engines.md#what-changed-in-4939) |
| B | New `Booster` editor tag (registry snapshot stale) | ✅ **DONE** (was SCHEMA-DRIFT) | `types.ts` `EDITOR_TAG_DEFS` + registry-order test | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-4939) |
| C | New asset packs CoreFuelTankB (bays) + CorePropulsionC (large SRBs) not in the catalog file list | ✅ **DONE** (was MISSING-CAPABILITY — parts invisible) | `catalog.ts` `ASSET_FILES` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-4939) |
| D | Vendored fixtures stale after the rev-4934 tank relocation (drift test fails vs the 4939 mirror) | ✅ **DONE** | `src/ksa/__fixtures__/` re-synced (`bun run sync-fixtures`); `partCatalog.test.ts` tank test re-targeted to the Part-level passthrough shape | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-4939) |
| E | Geometry-template `<Collider>` (2 CoreElectricalA `<Part>` prefabs + 2 `<SubPart>` cells) — geometry templates are NOT passthrough; import→export drops the collider (part loses collision in-game) | ✅ **DONE** (was SCHEMA-DRIFT) | Solved by MODELING `<Collider>` outright instead of raw `<Part>`-child passthrough: `PartCollider` + `EditingPart.colliders` + `COLLIDER_LAYER_ID` (`types.ts`, boot purge), `colliderSize.ts`, `collidersFromElement`/`subPartCollidersFromRoot` (`partXmlParser.ts`, both `KNOWN_*_GAMEDATA_CHILDREN`), `buildColliderElement` + owner grouping (`partXmlSerializer.ts`), `CatalogSubPart.colliders`/`CatalogPart.colliders` (`catalog.ts`/`partCatalog.ts`), variant carry-forward (`modExport.ts` + `assetsXmlSerializer.ts`), `partImport.ts`/`addPart`, `projectCodec.ts` (`cl`, v6) / `projectTransfer.ts`. **All four authoring sites are read and normalised into the GameData document** — legal because `PartTemplate.ApplyGameData` merges `Components` additively, so no `serializePart` change was needed | [colliders](../scope/colliders.md) |
| F | Part-LEVEL `<Tank>` (rev 4934: all Core tank data now on `<PartGameData>`, with optional `Id`, `<LocationAsmb>`, first `<SphericalTank>`) — preserved via passthrough but NOT editable; imported Core fuel tanks show no tank UI | ✅ **DONE** (was MISSING-CAPABILITY) | add `Tank` to `KNOWN_PART_GAMEDATA_CHILDREN` + parse into a part-level `tanks` list (`partXmlParser.ts:324` `parseGameDataElement`), emit in `serializeGameData` (`partXmlSerializer.ts:96`), `PartGameData.tanks` (`types.ts:616`, boot purge), Part Data dialog UI; model `locationAsmb`/`id` on `Tank` at the same time. Do TOGETHER with gap E so users eat ONE purge | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-4939) |
| G | New `FuelPort` GameData module (`MaxLength` attr + `<AnchorAsmb>`) — passthrough-preserved, opaque to the editor | 📋 **OPEN — MISSING-CAPABILITY (optional)** | model + UI if fuel-port authoring is wanted: `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, Part Data dialog | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-4939) |
| H | Cartoon-moon clutter `<LOD MinScreenSize>` values tuned for the pre-4901 (buggy) LOD selection; Core retuned ~4× | 📋 **OPEN — COSMETIC (advisory)** | retune `scripts/build-cartoon-moon.ts` LOD sizes against the fixed selection during the pending in-game check | [ground-clutter](../scope/ground-clutter.md#what-changed-in-4939) |

**Verified-intact (no action):** ported engine physics + `Reactions.xml` (byte-identical);
animation loader/schema; kittens; custom-assets/mod-export gotchas (`ThumbnailRenderResources`
null-deref unguarded, `ENABLE_EMISSIVE` defined, KTX2/`mod.toml`/`AssetBundle` contract);
connectors/coords/IVA + reference orientation (root still identity-pinned; `<Flags>`/`<Sibling>`
schema unchanged — `<SymmetryGroup>` is GameData sugar, passthrough-safe); ground-clutter schema
(all 7 `*Reference.cs` untouched); `VolumeReference` XML attrs (liters rework is display-only);
`Tank.SaveData.PropellantUseDisabled` + transfer modes (save-state, out of scope); removed
`CoreServiceModuleA_Prefab_MediumServiceModule[A|B]` (no flexo references); `FakeSubstances.xml`/
`FakeCombustion.xml` dropped from Core `mod.toml` (never referenced).

---

# 4892 review — `2026.7.3.4826` → `2026.7.5.4892`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — full `git diff 1265373
7cf5c0a` inside `ksa-game-assemblies` (the on-disk `_prev` tree was stale at 4750; the 4826
baseline came from git history) + shipped-Core-XML diff + per-area contract re-verification.
Headline change: rev 4884 ("!THIS BREAKS SAVED GAMES AND SAVED VEHICLES!") — **combustion
processes refactored into Reactions** (no hardcoded O/F ratio; ThermoToolkit-generated data;
prop-tank affinity). All fixes below follow the no-migration rule (model the new form only;
stale persisted projects are purged at boot by `snapshotMatchesModel`).

## Priority summary (4892)

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| A | Combustion → Reactions refactor (Combustion.xml deleted; `<Combustor><Combustion Id>` → `<Reaction Id>` + required `<MixtureRatio>`; custom propellants `<CombustionProcess>` no longer mapped by `AssetBundle`) | ✅ **DONE** (was BREAKING) | `reactionCatalog.ts` (new, replaces `combustionCatalog.ts`), `enginePhysics.ts`, `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `reactionStore.ts` (replaces `combustionStore.ts`), `editorStore.ts`, `EnginePanel.tsx`, `EngineSections.tsx`, `projectCodec.ts`, `projectTransfer.ts` | [engines](../scope/engines.md#what-changed-in-4892--the-reactions-refactor-rev-48844885) |
| B | Tank `<CombustionProcess>` → `<RoleAffinity>` (ConsumerRole flags) | ✅ **DONE** (was SCHEMA-DRIFT) | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `projectCodec.ts` | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-4892) |
| C | Ground clutter: LOD `<Material Id>` refs REQUIRED (load-time throw), ecotype materials need unique Ids | ✅ **DONE** (was BREAKING for the scaffold) | `scripts/build-cartoon-moon.ts`, `ksa-mods/cartoon-moon/` (regenerated; also fixed the latent shared-`card` GLB mesh-name first-wins collision) | [ground-clutter](../scope/ground-clutter.md#what-changed-in-4892) |
| D | `EngineALargeUpperStage` volumetric exhaust removed (LR91 Dev deleted) | ✅ **DONE** (was COSMETIC — stale dropdown option) | `types.ts` `VOLUMETRIC_EXHAUST_IDS` | [engines](../scope/engines.md#what-changed-in-4892--the-reactions-refactor-rev-48844885) |

### Gap A — Reactions refactor (BREAKING)

- **Contract:** `CombustorTemplate.Combustion: SerializedReference` → `Reaction: ReactionReference`
  (`<Reaction Id>` + optional-but-required-for-mixtures `<MixtureRatio>` text child;
  `ResolveReaction` throws on a ratio-less MixtureReaction and on ThermalReactions).
  `CombustionProcess`/`CombustionTable` class family deleted; `Reactions.xml` ships 6
  `<MixtureReaction>` (2-D O/F×lnP LUTs + `<DefaultMixtureRatio>`), 4 combustor-drivable
  `<FixedReaction>` (incl. `Category="Solid"` APCP/DoubleBase), 6 `<ThermalReaction>` (unusable —
  no thermal core template exists). `AssetBundle` maps the three new element names and no longer
  maps `<CombustionProcess>` — an old-style flexo export would be silently dropped.
- **Fix (DONE):** see [engines.md "What changed in 4892"](../scope/engines.md#what-changed-in-4892--the-reactions-refactor-rev-48844885)
  for the full flexo-side change list (catalog rewrite, `sliceLutAtMixtureRatio` port,
  `Combustor.reactionId`+`mixtureRatio`, custom propellants as `<FixedReaction>`, O/F UI,
  `KNOWN_REACTIONS` snapshot, SRB→APCP, fixtures + mirror re-sync). Regression: `reactionCatalog.test.ts`,
  `enginePhysics.test.ts` (slice port + re-pinned Hydrolox parity ≈ 445.4 s / 932.6 kN),
  `partXmlParser/Serializer.test.ts`, `partCatalog.test.ts` (4892 fixtures).

### Gap B — Tank `<RoleAffinity>` (SCHEMA-DRIFT)

- **Contract:** `AsmbTankTemplate.DefaultCombustionProcess` → `RoleAffinity: ConsumerRole`
  ([Flags] `None|Engine|Thruster`, default `Engine`, XmlSerializer space-separated text).
- **Fix (DONE):** `Tank.roleAffinity: TankRoleAffinity`, token-normalizing parse, emit only at
  non-default, codec key `ra`. Regression: `partXmlParser.test.ts` "tank `<RoleAffinity>`".

### Gap C — Ground-clutter multi-material schema (BREAKING for the scaffold)

- **Contract:** `GroundClutterLodReference.OnDataLoad` now **throws** on a LOD without
  `<Material Id>` references, on concrete LOD materials, and on ref-count ≠ GLB material count;
  `ClutterEcotypeReference.MaterialReferences` is a list and each ecotype `<Material>` needs a
  unique global Id (first-wins namespace now contains Core's `EarthGrassClutterMaterial`,
  `Trunk`, `Leaves`, `Tree0Cards`, `Tree1Cards`).
- **Fix (DONE):** `build-cartoon-moon.ts` emits one `<Material Id="CartoonMoonCrowdMaterial"/>`
  per LOD + the Id'd ecotype material; unique per-character GLB mesh names (`<name>Card`) fix the
  latent first-wins mesh collapse; scaffold regenerated. In-game re-verification pending (next
  KSA session).

### Gap D — Removed volumetric exhaust id (COSMETIC)

- `<VolumetricExhaustTemplate Id="EngineALargeUpperStage">` deleted with the LR91 Dev engine;
  dropped from `VOLUMETRIC_EXHAUST_IDS` so the nozzle FX dropdown no longer offers a dangling id.

### Not gaps (4892, re-verified intact)

- **Animation** (keyframe loader/schema byte-identical; rev-4875 refactor is kitten-skeletal only),
  **kittens** (render resources unchanged), **custom assets / mod export** (thumbnail null-deref,
  `ENABLE_EMISSIVE`, mesh-name contract, mod.toml all stand; `MeshReference.PrimitiveMaterialIds`
  is clutter-only), **connectors/coords/IVA/reference-orientation** (all anchors byte-identical;
  the rev-4876 "ASMB axes gizmo" is a display-only camera nav-ball; fuel links are vehicle-save
  state, not a part surface).
- **Persisted projects:** model shape changed (reaction/tank fields) → old snapshots are
  intentionally discarded by the boot purge, per the constitution.

---

# 4826 review — `2026.6.9.4750` → `2026.7.3.4826`

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review — full **decomp diff**
(`ksa-game-assemblies` @ 4826 vs `ksa-game-assemblies_prev` @ 4750) **+** shipped-Core-XML diff.
(An early pass mistook a stale checkout for "no 4826 decomp"; every finding below is verified against
the actual 4826 C#.) **One feature cluster** landed between 4751–4826 (undocumented in `version.json`,
recovered from the diffs): the game's new **part-symmetry** system (multi-mount adapter prefabs) +
hypergolic **service-module tanks** — three round-trip-fidelity gaps in flexo's Part-editor surface
(all silent data-loss; flexo rebuilds a fresh DOM from its typed model; none throw), plus one
**ground-clutter scaffold** watch-item. Each Part-editor fix is **faithful preservation** per the
no-migration rule — model the new form, no legacy fallback. The engine physics, animation, kitten,
custom-asset, and coordinate contracts were re-checked against the 4826 decomp and are **intact**
(see [FULL_SCOPE "Not gaps"](../scope/FULL_SCOPE.md#open-gaps-from-4826--plansfix_current_gaps_planmd)).

## Priority summary (4826)

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| A | `<Diameter>` now repeatable — extras dropped | ✅ **DONE** | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `partCatalog.ts`, `editorStore.ts`, `partImport.ts`, `projectCodec.ts` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md#what-changed-in-4826) |
| B | Tank `<CombustionProcess>` propellant dropped | ✅ **DONE** | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `projectCodec.ts` | [gamedata-modules](../scope/gamedata-modules.md#what-changed-in-4826) |
| C | Connector `<Sibling>` grouping dropped (`<Aligned>` already safe) | ✅ **DONE** | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `projectCodec.ts`, `editorStore.ts`, `projectTransfer.ts` | [connectors-coordinates-iva](../scope/connectors-coordinates-iva.md#what-changed-in-4826) |
| D | Ground-clutter LOD mesh → atlas (scaffold, not core) | 🟡 **WATCH** | none (hand-authored `ksa-mods/cartoon-moon/` XML + `scripts/build-cartoon-moon.ts`) | [ground-clutter](../scope/ground-clutter.md#what-changed-in-4826) |

### Gap A — `<Diameter>` repeatable (SCHEMA-DRIFT / round-trip-lossy)

- **Contract:** 4750 `PartTemplate.cs` = single `[XmlElement("Diameter")] DistanceReference? Diameter`. 4826 XML ships **multiple** `<Diameter M/>` per adapter part (e.g. `CoreFairingA_Prefab_InterstageBridge3W2WA` → `3` + `2`; `CoreStructuralA` engine plates). flexo read `directChildren(gd,'Diameter')[0]` and emitted one → the rest silently dropped.
- **Fix (DONE):** first `<Diameter>` → editable `PartGameData.diameterM`; the rest → `PartGameData.extraDiametersM: number[]`, parsed (`partXmlParser.ts:312`) and re-emitted after the primary (`partXmlSerializer.ts:119`). Threaded through `CatalogPart` + the local catalog `PartGameData`, `ImportedGameData` (import merge takes extras with the primary), `setDiameterEnabled(false)` clears them, and codec `xdm`. No multi-value UI (extras ride the primary). Test: `partXmlParser.test.ts` "multi-size adapter".

### Gap B — Tank `<CombustionProcess>` (MISSING-CAPABILITY / round-trip-lossy)

- **Contract (decomp-confirmed):** `AsmbTankTemplate.cs` (base of both tank shapes) gained `[XmlElement("CombustionProcess")] SerializedReference DefaultCombustionProcess` — so any tank may declare it. In shipped 4826 XML it's on 3 service-module `<SphericalTank>`s in `PartGameData.xml` as `<CombustionProcess Id="MMH_NTO_1.6" />`. `<Tank>` is a **modeled** `<SubPartGameData>` child (rebuilt from a typed model, below the passthrough surface), so the nested child was dropped on export.
- **Fix (DONE):** `Tank.combustionProcessId: string | null`, parsed in `tankFromElement` (covers **both** shapes, matching the base-class field), emitted in `buildTankElement` after `<WallThickness>`, persisted as codec `cp`. Not editable yet — preserved verbatim. Test: `partXmlParser.test.ts` "tank `<CombustionProcess>`".

### Gap C — Connector `<Sibling>` + GameData `<Aligned>` (SCHEMA-DRIFT / round-trip-lossy)

- **Contract (decomp-confirmed):** the game's new **part-symmetry** system. `Connector.TemplateBase.SymmetrySiblings` = `[XmlElement("Sibling")] List<ConnectorReference>` → `<Sibling Id/>` (child of the geometry `<Part>`'s `<Connector>`). `PartTemplate.Aligned` = `[XmlElement("Aligned")] List<AlignedConnectorsRef>`; `AlignedConnectorsRef` = `[XmlElement("ConnectorRef")] List<ConnectorReference>` → `<Aligned><ConnectorRef Id/></Aligned>` (child of `<PartGameData>`). The runtime `PartSymmetryInstance`/`SymmetryLayerInstance` are vehicle-assembly/save state, out of flexo scope.
- **`<Aligned>` — INTACT (no code):** not in `KNOWN_PART_GAMEDATA_CHILDREN`, so the gap-6 `RawXmlNode` passthrough already round-trips it. Locked by a regression test.
- **`<Sibling>` — Fix (DONE):** flexo re-emits geometry connectors (`serializePart`→`buildConnectorElement`) with no passthrough on connector children, so it was dropped. Now `Connector.siblingIds: string[]` (parse `connectorsFromPartElement`, emit `buildConnectorElement`, codec `sb`). On import (`addPart`) and project-paste (`projectTransfer`) the ids are **remapped through the regenerated-connector id map**, dropping refs outside the imported set so they never dangle; intra-part duplicate/stamp carry them as-is (same id space). Test: `partXmlParser.test.ts` "`<Sibling>` attach-node grouping".

### Gap D — Ground-clutter LOD mesh → atlas (WATCH — scaffold only)

- **Contract (decomp-confirmed):** `GroundClutterLodReference.MeshFileReference` changed type `MeshFileReference` → `MeshAtlasFileReference`; its single `Mesh` field became `Meshes` (a list — `MeshAtlasFileReference.DoLoad` loads every GLB mesh node, skipping `_`-prefixed, keyed by node name). The `[XmlElement("Mesh")]` name + `Id`/`Path` attrs (from the shared `FileReference` base) are unchanged.
- **Impact:** `ksa-mods/cartoon-moon/`'s `<LOD><Mesh Id Path/></LOD>` still **parses**, but per-LOD semantics shifted from one mesh to a whole atlas. **No flexo core-editor code involved** (clutter is hand-authored mod XML + `scripts/build-cartoon-moon.ts`). **Action:** re-verify the cartoon-moon mod loads + renders in 4826; tweak GLB mesh-node names / mod XML only if it regresses in-game (can't be checked from the decomp).

### Verified NOT gaps (4826, decomp-checked)

- **Engines:** `RocketControllerData.cs` changed only `GetAllRocketTemplates` (`List` → `Span`/`ArrayPool`, perf); thrust/Isp math + `DeLavalNozzleConfig`/`CombustorConfig`/`CombustionTable`/`Combustion.xml` byte-identical.
- **Animation:** `KeyframeAnimationModule.cs` only added `ApplyToMirroredParts` (symmetry mirroring, runtime); schema + GLB loader contract unchanged.
- **Power units:** `PowerReference.cs` only added a `ToNearest` display formatter; tokens/scales unchanged.
- **Custom-assets:** `PbrMaterialReference.cs` unchanged (null-deref gotcha holds); `MeshReference`/`MeshAtlasFileReference` gained multi-primitive **runtime** fields (no `[XmlElement]`) — watch the GLB node→SubPart mapping, but single-primitive exports are unaffected.
- **Kittens:** `CharacterRenderResources.cs` internal-only; `CharacterAssets.xml`/`Characters/` untouched (editor-only aide regardless).
- `CoreFuelTankAAssets.xml` `<PartModel>`→`<PartModelDynamic>` (33×) + `TFI_Heat` KTX2 + `<ThinFilm>` — thermal FX; `catalog.ts:156` reads either tag; meshes referenced by id.
- `CoreElectricalAGameData.xml` solar cell `<Produced W>` 50→100 — pure data (fixture + assertion refreshed).
- `CoreIVASpaceAGameData.xml` — line-ending normalization only.

### Follow-through (4826)

- Vendored fixtures re-synced (`scripts/sync-fixtures`): `CoreElectricalAGameData.xml`, `CoreFuelTankAAssets.xml`, `PartGameData.xml`. Drift test green.
- Scope docs re-baselined to `2026.7.3.4826` (decomp @ 4826); `FULL_SCOPE.md` map + open-gaps updated; every "intact" area re-checked against the real 4826 C#.
- 373 tests pass; typecheck/lint/fmt green.
- **Open follow-up:** (1) re-verify the `ksa-mods/cartoon-moon/` scaffold in-game (Gap D). (2) No editor UI for the three new Part fields (`extraDiametersM`/`combustionProcessId`/`siblingIds`) — deliberate (niche prefab data); revisit if users need to author multi-diameter adapters, assign tank propellants, or edit symmetry groups.

---

# 4750 review — Fix flexo gaps from KSA update 4680 → 4750 (history)

**Derived from:** the [scope/](../scope/FULL_SCOPE.md) catalog review of KSA build
`2026.6.8.4680` → `2026.6.9.4750`. Each gap links to the scope doc that defines the contract.
**Why these matter:** flexo is a model-faithful re-emitter — it reads a fixed allow-list and
rebuilds a fresh XML document, so a changed unit token silently round-trips to `0` and an added
element silently vanishes. None of these throw; all are silent correctness/round-trip failures.

> Before starting, re-read [scope/part-and-subpart-xml.md](../scope/part-and-subpart-xml.md#-master-invariant--flexo-rebuilds-a-fresh-dom-now-with-gamedata-passthrough)
> (the no-passthrough invariant) and [scope/gamedata-modules.md](../scope/gamedata-modules.md).
> Follow the mandatory workflow in [AGENTS.md](../AGENTS.md) (fmt → lint → fmt:check → tests) and
> update the matching `scope/*.md` baseline status as each gap closes.

## Priority summary

| # | Gap | Severity | Flexo touch-points | Scope doc |
|---|---|---|---|---|
| 1 | Electrical unit refactor (`Joules`/`Watts` → `J`/`W`) | ✅ **DONE** (uncommitted) | `partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts` | [gamedata-modules](../scope/gamedata-modules.md) |
| 2 | DockingPort schema (attrs → child elements, impulse→energy) | ✅ **DONE** (uncommitted) | `partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts`, UI | [gamedata-modules](../scope/gamedata-modules.md) |
| 3 | `<Diameter>` part-size element dropped | ✅ **DONE** (uncommitted) | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `partCatalog.ts` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |
| 4 | `<Control>` command marker dropped | ✅ **DONE** (uncommitted) | `types.ts`, `partXmlParser.ts`, `partXmlSerializer.ts`, `partCatalog.ts` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |
| 5 | Editor-tag list stale + face-snap docs | ✅ **DONE** (uncommitted) | `types.ts`, `EditorTagsField.tsx`, `docs/ksa-part-connector-notes.md` | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |
| 6 | Unknown-element passthrough (architectural) | ✅ **DONE** (uncommitted) | `partXmlParser.ts`, `partXmlSerializer.ts`, `types.ts`, `partCatalog.ts`, codec/transfer | [part-and-subpart-xml](../scope/part-and-subpart-xml.md) |

**All gaps (1–6) are now implemented** (✅, uncommitted — full details under each section below;
346 tests pass). Gap 6 (unmodeled-XML passthrough) closes the round-trip data-loss for good: the
"model-faithful re-emitter drops what it doesn't model" invariant no longer applies to
`<PartGameData>`/`<SubPartGameData>` child elements + root attributes (they're captured + re-emitted
verbatim). The only remaining items are intentionally out of scope (see each section's notes).

---

## Gap 1 — Electrical unit refactor (BREAKING)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** `partXmlParser.ts` now reads via
> `readEnergyJoules`/`readPowerWatts` (token tables `ENERGY_TOKENS`/`POWER_TOKENS`) over a shared
> `sumUnitChild`; `partXmlSerializer.ts` emits `<MaximumCapacity J>` and `<Produced/Consumed W>`;
> `types.ts` doc-comments updated. Parser + serializer + catalog tests refreshed to the new tokens.
> (Model field names were unchanged.) **Current form only — the plan's legacy `Joules`/`Watts`
> fallback below was intentionally dropped:** flexo models only the current game; stale data is
> purged at boot, never migrated.

**Game change.** `JoulesReference` → `EnergyReference` (energy) + `PowerReference` (power);
`BatteryJouleData` removed. Authored Core data now uses `<MaximumCapacity J="…"/>` and
`<Produced W="…"/>` / `<Consumed W="…"/>`. New token tables (× to SI):
- Energy (`EnergyReference.cs`): `J`×1, `KJ`×1e3, `MJ`×1e6, `GJ`×1e9, `TJ`×1e12, `Ws`×1, `Wh`×3600, `KWh`×3.6e6.
- Power (`PowerReference.cs`): `W`×1, `KW`×1e3, `MW`×1e6, `GW`×1e9, `TW`×1e12.

**Current flexo (wrong both ways).**
- `src/ksa/partXmlParser.ts` `readJoulesValue` (~L188) reads only `Joules` + `Watts` + `KWh×3.6e6` → returns `0` for new Core data → battery/generator/solar/consumer all import as 0.
- `src/ksa/partXmlSerializer.ts` emits `MaximumCapacity Joules=` (~L127), `Produced Watts=` (~L132, ~L226), `Consumed Watts=` (~L138) → the new `EnergyReference`/`PowerReference` ignore these attrs → 0 capacity/output in-game.
- The comment at `partXmlParser.ts` ~L186 ("the game does NOT recognize a bare `W` — only `Watts`") is now exactly backwards.

**Fix.**
1. Split `readJoulesValue` into two unit-aware readers (keep legacy tokens as fallback so old flexo projects + the OLD build still parse):
   - `readEnergyJoules(parent, childTag)` → sum of `J + Ws + Wh×3600 + KWh×3.6e6 + KJ×1e3 + MJ×1e6 + GJ×1e9 + TJ×1e12` **+ legacy `Joules`×1**.
   - `readPowerWatts(parent, childTag)` → `W + KW×1e3 + MW×1e6 + GW×1e9 + TW×1e12` **+ legacy `Watts`×1**.
   - Battery (`MaximumCapacity`) uses energy → `/3600` to Wh; Generator/Solar/Consumer (`Produced`/`Consumed`) use power.
2. Emit new tokens (match Core's authoring):
   - Battery: `<MaximumCapacity J="capacityWh*3600"/>`.
   - Generator/Solar/Consumer: `<Produced W="…"/>` / `<Consumed W="…"/>`.
3. Replace the inverted comment; update the `Battery`/`Generator`/`SolarPanel`/`PowerConsumer`
   doc-comments in `types.ts` (they say `Joules`/`Watts`).

**Tests.** Extend `src/ksa/partXmlParser.test.ts` + `partXmlSerializer.test.ts` with NEW-build
fixtures (`<MaximumCapacity J=…>`, `<Produced W=…>`) **and** a legacy fixture
(`<MaximumCapacity Joules=…>`) to prove the fallback. Round-trip a Core electrical part.

---

## Gap 2 — DockingPort schema (BREAKING)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** Model fields renamed
> `latchingImpulse`/`pushoffForce` → `latchingKineticEnergyJ`/`pushoffImpulseNs` (defaults 50 J /
> 5000 Ns) across `types.ts`, `partXmlParser.ts` (child-element form + `readImpulseNs`),
> `partXmlSerializer.ts` (emits `<ConnectorId Value>` + `<LatchingKineticEnergy J>` +
> `<PushoffImpulse Ns>`), `editorStore.ts` (renamed `DEFAULT_*` consts +
> `setDockingPortLatchingKineticEnergy`/`setDockingPortPushoffImpulse` actions),
> `GameDataSections.tsx` (relabelled fields), `projectCodec.ts` (`ke`/`pi` wire keys), and
> `projectTransfer.ts`. **Current form only — the plan's pre-4750 attribute fallback and the
> `li`/`po` codec migration were intentionally dropped** (flexo models only the current game; stale
> projects are purged at boot, not migrated). In the same pass the entire `projectStore.ts`
> migration system (`migratePart`/`migrateSnapshot`, `capacityKWh`→Wh, string-flags→array) was
> removed; boot-time validation (`snapshotMatchesModel`, now also checking top-level part keys)
> purges any non-current snapshot.

**Game change.** `<DockingPort>` moved from attributes to child elements, with renamed fields and
**new physical quantities** (`DockingPortTemplate.cs`):
```xml
<!-- OLD --> <DockingPort ConnectorId="_c2" LatchingImpulse="6000" PushoffForce="7000"/>
<!-- NEW --> <DockingPort>
               <ConnectorId Value="_c2" />
               <LatchingKineticEnergy J="50" />   <!-- was LatchingImpulse (N·s); now energy (J), default 50 -->
               <PushoffImpulse Ns="7000" />       <!-- was PushoffForce (N);  now impulse (N·s), default 5000 -->
             </DockingPort>
```

**Current flexo (wrong both ways).**
- `types.ts` `DockingPort` = `{ connectorId, latchingImpulse, pushoffForce }`.
- `partXmlSerializer.ts` (~L160-166) emits the dead attribute form → `ConnectorId` unset (now a child) → KSA `IsValid()` false → **docking port silently dropped in-game**.
- `partXmlParser.ts` (~L289-299) reads `dp.getAttribute('ConnectorId')` + `readNum(dp,'LatchingImpulse'|'PushoffForce')` (with a `Force` fallback) → all null on a NEW file → `connectorId=''`, `0`/`0`.

**Fix.** The field rename ripples wider than parse/emit — these are all the touch-points:
1. `src/ksa/types.ts` (~L281-286): rename `DockingPort` fields to `latchingKineticEnergyJ` (default 50) + `pushoffImpulseNs` (default 5000); update the doc-comment.
2. `src/ksa/partXmlSerializer.ts` (~L160-166): emit child elements `<ConnectorId Value=…/>`, `<LatchingKineticEnergy J=…/>`, `<PushoffImpulse Ns=…/>`.
3. `src/ksa/partXmlParser.ts` (~L289-299): read the child elements (reuse the energy reader from Gap 1 for `<LatchingKineticEnergy>`; read `Ns` for `<PushoffImpulse>`), with a **legacy fallback** to the old attributes (`ConnectorId` attr; `LatchingImpulse`/`PushoffForce`/`Force` attrs) so old XML still loads. (The impulse→energy quantity change makes the legacy numeric fallback approximate — acceptable for old in-flexo projects.)
4. `src/state/editorStore.ts` (~L1943-1964): rename `DEFAULT_LATCHING_IMPULSE`/`DEFAULT_PUSHOFF_FORCE` (now 50 J / 5000 Ns) and the `setDockingPortLatchingImpulse`/`setDockingPortPushoffForce` actions/params.
5. `src/ui/GameDataSections.tsx` (~L597,606): rename the bound fields + relabel units (J / N·s).
6. `src/state/projectCodec.ts`: this persists `gameData` (incl. docking port) to localStorage — **renaming fields breaks existing saved projects**. Either (a) add a codec migration that maps old `latchingImpulse`/`pushoffForce` → the new fields, or (b) keep reading the old keys on decode. Don't skip this — silently dropping the values on every saved project is the failure mode.
7. Update the test fixtures that hardcode the old field names: `state/projectCodec.test.ts`, `state/editorStore.test.ts`.

**Tests.** `partXmlParser.test.ts` + `partXmlSerializer.test.ts`: NEW element-form fixture + a
legacy attribute-form fixture; round-trip `CoreCouplingA_Prefab_DockingPort1WA`'s GameData. Add a
`projectCodec.test.ts` case for the old→new field migration.

---

## Gap 3 — `<Diameter>` part-size element (MISSING-CAPABILITY)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** `PartGameData.diameterM: number | null`
> added (`types.ts` + `createEmptyGameData`); `parseGameDataElement` reads `<Diameter>` via the
> existing `readDistanceM` helper (so `M`/`Cm`/etc. all parse, null when absent);
> `serializeGameData` emits `<Diameter M=…/>` in plain meters (matching Core, not flexo's
> Cm-under-1m style) right after `<EditorTag>`. Carried through `partCatalog.ts`
> (`CatalogPart` + local `PartGameData` + `parseGameDataFile` + `mergeGameData`), into the editor
> via `ImportedGameData`/`applyImportedGameData` + `importBuiltInPart`, and persisted by
> `projectCodec` (`dm` key) + `projectTransfer` merge. UI: a "Diameter size class" toggle + numeric
> field in Part Data → Identity (`SizeControlFields`, `setDiameterEnabled`/`setDiameter`, default
> 1 m). Round-trip + catalog + codec + store tests added.

**Game change.** `PartTemplate.cs` added `[XmlElement("Diameter")] DistanceReference? Diameter`.
Core now emits `<Diameter M="…"/>` as a child of `<PartGameData>` on nearly every part (command,
fuel tanks, structural, coupling, fairing, propulsion + the monolithic `PartGameData.xml`). It's
the VAB part-picker **size-class filter** (`DiameterFilterlist` editor tags). No physics effect.

**Current flexo.** No `Diameter` awareness → dropped on round-trip; flexo-authored parts won't
appear under a diameter-filtered catalog view.

**Fix.**
1. `types.ts`: add `diameterM: number | null` to `PartGameData` (+ `null` in `createEmptyGameData`).
2. `partCatalog.ts`: add `diameterM` to its `PartGameData` interface + carry it in `mergeGameData`.
3. `partXmlParser.ts` `parseGameDataElement`: read `<Diameter>` via the existing distance helper
   (the parser already reads `M`/`Cm` distances elsewhere). Core authors `M="0.5"` etc.
4. `partXmlSerializer.ts` `serializeGameData`: when `diameterM != null`, emit `<Diameter M=…/>`
   (plain `M`, matching Core — not flexo's Cm-under-1m style) after `<EditorTag>`.
5. (Optional) surface a "Part diameter (catalog size class)" numeric field in Part Data → Identity.

**Tests.** Round-trip a Core part that carries `<Diameter M=…>` and assert it survives.

---

## Gap 4 — `<Control>` command marker (MISSING-CAPABILITY)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** `PartGameData.controllable: boolean`
> added (default `false`); `parseGameDataElement` sets it from `directChildren(gd, 'Control').length
> > 0`; `serializeGameData` emits a bare `<Control/>` (no attrs/children) after `<CustomMass>` when
> true. Carried through `partCatalog.ts` (OR-merged across PartGameData entries), into the editor via
> `ImportedGameData`/`applyImportedGameData` + `importBuiltInPart`, and persisted by `projectCodec`
> (`co` key) + `projectTransfer` merge. UI: a "Command capable (controllable)" switch in Part Data →
> Identity (`SizeControlFields`, `setControllable`). Round-trip + catalog + codec + store tests added.

**Game change.** New `Control`/`ControlTemplate` module (empty marker). Core adds a bare
`<Control/>` to the capsule's `<PartGameData>` (`CoreCommandAGameData.xml`); it marks a part as
command-capable (`Vehicle.IsControllable`). `ControlTemplate.cs` has no fields.

**Current flexo.** Dropped on round-trip → a re-exported command pod is no longer controllable.

**Fix.**
1. `types.ts`: add `controllable: boolean` to `PartGameData` (default `false`).
2. `partXmlParser.ts`: `game.controllable = directChildren(gd, 'Control').length > 0`.
3. `partXmlSerializer.ts`: emit a bare `<Control/>` when `controllable`.
4. `partCatalog.ts`: carry `controllable` through `mergeGameData`.
5. (Optional) a "Command / Controllable" toggle in Part Data.

**Tests.** Round-trip a `<Control/>`-bearing part; assert the element survives.

---

## Gap 5 — Editor-tag list + face-snapping docs (SCHEMA-DRIFT / docs)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** `KNOWN_EDITOR_TAGS` (`types.ts`) regenerated
> to the exact registry set/order via a new typed `EDITOR_TAG_DEFS` (16 rows, each carrying the
> `NotaCategory` flag) — obsolete `Tanks` dropped, `Fuel Tanks`/`Landing`/`NoFaceSnapping`/`All`
> added. `EditorTagsField.tsx` now groups suggestions into **Categories** vs **Functional** using
> `notaCategory`. Docs: `docs/ksa-part-connector-notes.md` gained a "Face-snapping & editor tags"
> section (data-driven registry, +Z face-snap vs cosmetic +X connector arrow, `DiameterFilterlist`).
> **Decision — static registry, not live parse:** the plan's option-2 live parse of
> `CoreEditorTagsGameData.xml` was intentionally NOT taken — that file isn't synced into the served
> `/ksa/` assets, and the registry only drives freeform autocomplete (no correctness need). A static
> typed snapshot delivers the same suggestion + NotaCategory-grouping behavior with no network/asset
> dependency; modder tags simply aren't auto-suggested (still typeable). Tests in
> `partXmlParser.test.ts` assert the registry order + functional-tag set.

**Game change.** Editor tags are now a data-driven registry: `CoreEditorTagsGameData.xml` defines
16 `<EditorTagDef>` rows (`EditorTagDefinition.cs`), with `NotaCategory` + face-snap booleans;
the built-in `EditorTag` statics (`NoFaceSnapping`/`Tanks`/`Coupling`/`Structural`) were removed
from the game and are now registered from data. Face-snapping (`VehicleEditor.cs`) reads those
booleans and snaps off the part's **+Z** bounding face.

**Current flexo.** `KNOWN_EDITOR_TAGS` (`types.ts` ~L159) is a hardcoded suggestion list with
obsolete `Tanks` (now `Fuel Tanks`) and missing `Landing`/`NoFaceSnapping`/`All`. No data-loss
(tags are freeform passthrough) — stale autocomplete only.

**Fix.**
1. Regenerate `KNOWN_EDITOR_TAGS` to the registry set/order: `Capsules, Engines, RCS, Fuel Tanks,
   Electrical, Coupling, Structural, Landing, Interstage, Passage, Cargo, Lights, Radial,
   NoFaceSnapping, All, Hidden`. Drop `Tanks`.
2. *(Better, optional)* parse `CoreEditorTagsGameData.xml` at catalog-load time (it's a new sibling
   under `/ksa/`) to drive suggestions live, and use `NotaCategory` to group "categories" vs
   "functional" tags in `EditorTagsField.tsx`.
3. Docs: update `docs/ksa-part-connector-notes.md` to note that face-snapping is now data-driven
   via `EditorTagDefinition` (FaceSnap[Target]Blacklist/Whitelist, DiameterFilterlist) and that
   `NoFaceSnapping`/`Coupling`/`Structural`/`Tanks` are no longer hardcoded game-side; the
   connector "+X facing" arrow is cosmetic (the game snaps off the part's +Z face). The
   `<Connector>/<Flags>` schema itself is unchanged → export remains correct.

---

## Gap 6 — Unknown-element passthrough (OPTIONAL, architectural)

> **Status: ✅ IMPLEMENTED 2026-06-27 (uncommitted).** Unmodeled `<PartGameData>` /
> `<SubPartGameData>` **child elements** AND **root attributes** are now captured verbatim on import
> and re-emitted on export. Model: `RawXmlNode` (a JSON tree `{ tag, attrs, children, text? }`) +
> `unknownAttrs: Record<string,string>` / `unknownChildren: RawXmlNode[]` on `PartGameData` and
> `SubPartGameData` (`types.ts`). Parser (`partXmlParser.ts`): `captureUnknownChildren` /
> `captureUnknownAttrs` diff each container's direct children/attrs against the modeled allow-list
> (`KNOWN_PART_GAMEDATA_CHILDREN`/`…_ATTRS`, `KNOWN_SUBPART_GAMEDATA_*`). Serializer
> (`partXmlSerializer.ts`): `buildRawNode` rebuilds them, appended LAST (order-independent to the
> game). Carried through `partCatalog.ts` (catalog + `mergeGameData`), import
> (`ImportedGameData`/`applyImportedGameData`/`importBuiltInPart`), persistence (`projectCodec` `ua`/`uc`
> keys with tolerant `decRawNodes`/`decRawAttrs`, `projectTransfer` merge). This recovers
> real Core data flexo silently dropped: `<Collider>` (every fuel tank), the `SolidSphereMass`/
> `SolidCylinderMass`… mass family, `<IVASeat>`, `<SubstanceStorageVolume>`, and a SubPart's
> `DisplayName` attribute. Round-trip + catalog + codec tests added.
>
> **Design notes / deliberate scope:** captured as a structured JSON tree (NOT a raw XML string) so
> it (a) persists losslessly through the JSON codec and (b) is implementation-agnostic across the
> browser `DOMParser` and the `@xmldom` parser the tests inject (a string serializer would mismatch
> across the two DOM impls). Merge semantics are **fill-if-empty** (a part's leftover XML is treated
> as a unit — first non-empty source wins — never appended/deduped, which would risk duplicate
> `<Collider>`s). Known limitation: a `<SubPart>` child of `<PartGameData>` is "modeled" (gimbal
> overlay), so a `<SubPart>` carrying ONLY non-gimbal unmodeled data is not passed through; mixed
> text+element content isn't preserved (game-data XML has none). This does NOT conflict with the
> no-migration policy ([[no-data-migration]] is about not converting OLD formats; passthrough
> preserves CURRENT unknown game XML on round-trip).

**Problem.** flexo's "read allow-list → rebuild fresh DOM" design means **every** future game
element is a silent round-trip loss until explicitly modeled (today: `<Collider>`, and pre-fix
`<Diameter>`/`<Control>`). Gaps 3–4 are the symptom; this is the cure.

**Fix (stretch).** Capture unmodeled children/attributes on `PartGameData` / `SubPartGameData`
(store cloned `Element`s keyed by parent) in `parseGameDataElement`, and re-append them in
`serializeGameData`. This degrades future additions to harmless pass-through. Decide on ordering/
dedupe semantics so re-emitted unknowns don't collide with modeled ones. Larger change; sequence
after 1–5.

---

## Verified SAFE — do not touch (regression-protect, don't "fix")

The scope review confirmed these are **unchanged** in 4750; changing them would be wrong:
- **Engines** ([engines.md](../scope/engines.md)): `enginePhysics.ts` math/constants/schema are byte-identical to the game; the new thrust-from-template helper corroborates the port. Only the (separate) `<Diameter>` applies.
- **Animation** ([animation.md](../scope/animation.md)): `KeyframeAnimationData.cs` byte-identical; ServiceModule B/C/D are new content the importer already handles. (Pre-existing latent gap: CubicSpline accessor decode — out of scope here.)
- **Kittens** ([kittens.md](../scope/kittens.md)): `CharacterAssets.xml` md5-identical; the eye/glass shader merge confirms the cornea-hide + visor-tint assumptions. Optional doc-comment nit only.
- **Custom assets / mod export** ([custom-assets-and-mod-export.md](../scope/custom-assets-and-mod-export.md)): all schema classes byte-identical; thumbnail null-deref still present (keep synthetic Normal/ORM); mod loader + `mod.toml` unchanged; glow math unchanged. Watch-item: keep an eye on `ENABLE_EMISSIVE` gating, but no action now.
- **Coordinates / IVA-NotIVA / ground clutter**: `QuaternionEx`/`Double3Ex` unchanged (`EULER_ORDER='ZYX'` holds); `PartModel` IVA gate + schema unchanged; the 7 clutter schema classes unchanged.
- **Tank / CustomMass / Inertia / Decoupler**: schema byte-identical (diffs are logging/runtime).

## Suggested sequencing
1. Gap 1 (electrical) + Gap 2 (docking port) together — same two files, both BREAKING, shared
   unit-reader work. Land with new + legacy fixtures.
2. Gap 3 (`<Diameter>`) + Gap 4 (`<Control>`) together — both add a `PartGameData` field + a
   parse/emit pair + a `mergeGameData` carry.
3. Gap 5 (tag list + docs) — small, independent.
4. Gap 6 (passthrough) — optional hardening; do last.

After each: `pnpm test` (the `src/ksa/*.test.ts` encode the contract), `pnpm fmt` / `pnpm lint` /
`pnpm fmt:check`, and update the relevant `scope/*.md` baseline status from 🔴/🟡 to ✅.
