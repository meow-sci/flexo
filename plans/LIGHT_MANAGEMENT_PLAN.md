# Light management — lights as first-class 3D entities, with gizmo editing and falloff visualization

**Status:** IN PROGRESS on `feature/light-management` — Phases 1–5 are **implemented and
committed**; see the per-phase status lines in §4 for the commit that landed each. Written
against KSA build **2026.7.9.5018** and flexo `main` @ `a3bcd33`.

**Goal:** Point and Spot part lights are currently data fields buried in a dialog — no 3D presence, no
sense of where they point or how far they reach. This plan makes every `<Light>` a selectable,
gizmo-movable/rotatable 3D entity (like colliders and IVA seats), adds owner-frame **and**
part-frame (world) numeric inputs, and renders each light's coverage: a falloff-graded volume
(nested shells driven by KSA's **exact** attenuation formulas — not a guess), a hard reach
boundary, and an optional live three.js light preview.

**Companion documents (background, do not re-derive):**

- `analysis/HOW_LIGHT_PARTS_WORK.md` — the `<Light>`/`<PowerConsumer>` object model, the single
  light-switch slot, id/InstanceOf matching. Everything there still holds.
- `plans/CLEANUP_LIGHTS_PLAN.md` — the (implemented) one-switch-per-part cleanup. Its §7 deferred
  "a 3D aim gizmo for the Spot cone" — this plan is that feature, fully generalized.
- `docs/colliders.md` + `plans/IVA_PLAN.md` — the two prior "promote GameData to a 3D entity"
  features. This plan deliberately mirrors their architecture; when in doubt, copy the collider.

> **For implementing agents:** every claim below carries a `file:line` citation into either this
> repo or the KSA tree at `ksa-game-assemblies/current/` (`decomp/` = decompiled C#, `Content/` =
> shipped assets). Citations were verified against the exact builds named above. If a line number
> has drifted, search for the quoted symbol — do not guess. Read AGENTS.md before writing any code:
> Rules of React are non-negotiable, manual memoization is banned, oxfmt/oxlint are mandatory, and
> **every numeric input must use `useNumberDraft` + `inputMode="url"`** (see §3.9).

---

## 1. Game contract (source-verified)

### 1.1 The `<Light>` schema

`LightModule.TemplateData`, `[XmlType(TypeName = "Light")]` — `decomp/KSA/LightModule.cs:11-53`:

| Element              | Type                | Default                       | Notes                                                              |
| -------------------- | ------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `<Type>`             | `Spot` \| `Point`   | `Spot` (enum 0)               | `LightType` enum, `LightModule.cs:14-18`                           |
| `<Transform>`        | `TransformReference`| identity                      | Position offset + aim (see §1.3). Scale parsed but **ignored**     |
| `<Range Value>`      | float (m)           | `1`                           | Hard falloff cutoff — illuminance is exactly 0 at `d ≥ Range`      |
| `<Intensity Value>`  | float               | `1`                           | Candela-like: illuminance ≈ `Intensity / d²` near the source       |
| `<Color R G B>`      | rgb 0–1             | Gray = `(0.5, 0.5, 0.5)`      | `Brutal.Numerics/Color.cs:93` (`float3.Grayscale(0.5)`)            |
| `<InnerAngle Value>` | float (**radians**) | `π/8 ≈ 0.3927` (22.5°)        | Spot full-bright cone **half**-angle                               |
| `<OuterAngle Value>` | float (**radians**) | `π/4 ≈ 0.7854` (45°)          | Spot outer cone **half**-angle; runtime-clamped, see §1.4          |
| `<RayTracing>`       | bool                | `false`                       | Routes to the RT light list only when IVA ray tracing is on        |

The element also legally carries an `Id` attribute (every `Components` entry does, via
`ModuleBase.TemplateDataBase.Id` — see `scope/gamedata-modules.md` "Container Ids"), but **no
shipped light authors one** and nothing addresses lights by id. flexo does not emit one (§3.1 D2).

### 1.2 Where `<Light>` is legal — and where Core actually authors it

`<Light>` is one of the `Components` element names legal under **both** `<PartGameData>` and
`<SubPartGameData>` (`scope/gamedata-modules.md` "What changed in 5018" lists the full set). Core
uses **both** sites — this is the modeling gap this plan closes (flexo currently models only the
SubPart site; a part-level `<Light>` rides the RawXmlNode passthrough, round-tripped but invisible):

| Where | Light | Values |
| --- | --- | --- |
| `<SubPartGameData Id="CoreElectricalA_Subpart_SpotlightA">` (`Content/Core/CoreElectricalAGameData.xml:97-107`) | Spot | pos (0.38, 0.21, 0), Range **5**, Intensity **10**, white, Inner **0.392599** (22.5°), Outer **0.785398** (45°) |
| `<SubPartGameData Id="CoreElectricalA_Subpart_FloodlightA">` (`…:111-121`) | Spot | pos (0.338, 0, 0), Range **3**, Intensity **10**, white, Inner **0.23** (13.2°), Outer **1.57** (≈90° — a hemisphere flood; exceeds the runtime clamp, see §1.4) |
| `<PartGameData Id>` in `Content/Core/CoreCommandAGameData.xml:19-39` | Spot ×2 | capsule headlights: pos (0.09, ±0.4364, −0.61633), Range 2.5, Intensity 2, white, Outer 1.57, Inner **defaulted** (π/8) |
| `<PartGameData Id="CoreIVASpaceA_Prefab_MediumCapsuleA">` (`Content/Core/CoreIVASpaceAGameData.xml:7-16`) | **Point** | interior light: pos (−0.275, 0, −0.80), Range 1.5, Intensity **0.05**, warm `(1.0, 0.9, 0.7)`, `RayTracing=true` |

Duplicate-`Id` GameData blocks **merge additively** — lights accumulate
(`PartTemplate.ApplyGameData`; flexo parser parity at `src/ksa/partXmlParser.ts:771-779`).

### 1.3 Runtime pose — how a light gets its world position and aim

`LightModule.UpdateRenderData`, `decomp/KSA/LightModule.cs:86-129` (the load-bearing part):

```csharp
double4x4 matrix = Parent.MatrixAsmb2Ego(in matrixVehicleAsmb2Ego);   // the OWNER's full matrix
// Point:
Light light2 = Light.CreatePointLight(Template.Transform.PositionValue.Transform(matrix), …);
// Spot:
doubleQuat rotationValue = Template.Transform.RotationValue;
double3 double5 = double3.UnitX.Transform(rotationValue);              // base aim = LOCAL +X
double5 = double3.Normalize(new double3(                               // rotated by the owner's
    double5.X * matrix.M11 + double5.Y * matrix.M21 + double5.Z * matrix.M31, …));  // upper-3×3
Light light = Light.CreateSpotLight(Template.Transform.PositionValue.Transform(matrix), double5, …);
```

Facts to encode:

1. **A Spot aims along local `+X`**, rotated first by the light's own `<Transform><Rotation>`,
   then by the owner's matrix. Same convention as every flexo marker (connector cube arrow, IVA
   seat forward cone, nozzle handle — see §3.5).
2. **The owner frame** is the SubPart *instance* for a SubPart-level light (`Parent` = the child
   Part of that instance) and the Part's **assembly frame** for a part-level light (`Parent` =
   the root Part). A SubPartGameData light therefore exists once **per placement** of its
   template, each aimed by that placement's transform.
3. **Position** is transformed by the owner's **full matrix — scale included**. This differs from
   colliders (whose `colliderWorld` ignores placement scale — `src/three/coords.ts:79-93`). Do
   **not** copy `colliderWorld` verbatim; see §3.4.
4. **Direction** goes through the upper-3×3 *including scale* and is then normalized — a
   non-uniformly scaled owner **skews** the aim. flexo's marker composes quaternions instead
   (exact for uniform scale) and `lightValidation` warns on non-uniform owner scale (§3.10).
5. `Range` is **not** scaled by the owner (`Template.Range` is passed through untouched) — the
   falloff radius is world meters regardless of instance scale. Consequence: light visuals must
   NOT be parented under (scaled) placement groups (§3.5 D4).
6. Lights render only when the part's single light switch (if any) is on and powered
   (`LightModule.cs:88-96`; full model in `analysis/HOW_LIGHT_PARTS_WORK.md` §4-5).

### 1.4 The falloff math — exact, from the shipped shaders

The clustered light pre-pass that lights part meshes: `Content/Core/Shaders/Lighting/LightPrePass.comp:274-297`
(struct: `Content/Core/Shaders/Lighting/LightData.glsl:19-30`):

```glsl
vec3 posToLight = light.position - worldPos;
float distSq = dot(posToLight, posToLight);
float invDist = inversesqrt(max(distSq, DIST_EPSILON));            // DIST_EPSILON = 1e-12
vec3 lightDir = posToLight * invDist;

float invRange = 1.0 / max(light.range, RANGE_EPSILON);            // RANGE_EPSILON = 1e-6
float x2 = distSq * invRange * invRange;                           // (d/range)²
float falloff = saturate(1.0 - x2 * x2);                           // 1 − (d/range)⁴
float rangeAtt = (invDist * invDist) * mix(1.0, falloff, step(RANGE_EPSILON, light.range));

// Spot attenuation
float isSpot = light.type == LIGHT_TYPE_SPOT ? 1.0 : 0.0;
float cosAng = dot(light.direction, -lightDir);
float denom = max(light.innerAngle - light.outerAngle, SPOT_DENOM_EPSILON);   // = 1e-4
float spotAtt = saturate((cosAng - light.outerAngle) / denom);
spotAtt *= spotAtt;

float att = rangeAtt * mix(1.0, spotAtt, isSpot) * light.intensity;
```

`light.innerAngle` / `light.outerAngle` arrive as **cosines** — the CPU packs them
(`decomp/KSA.Rendering.Lighting/Light.cs:97-101`: `float.Cos(OuterAngle)`, `float.Cos(InnerAngle)`).

`Light.CreateSpotLight` (`Light.cs:54-79`) sanitizes angles before packing:
**swap** when `inner > outer`, then `outer = clamp(outer, 1e-5, 1.5697963)` (≈ **89.943°** —
`MAX_OUTER_ANGLE`, `Light.cs:10`), then `inner = clamp(inner, 0, outer)`. Core's own
`OuterAngle=1.57` floodlights rely on this clamp.

A light with `Range ≤ 0` never renders — the cull is **CPU-side**:
`decomp/KSA.Rendering.Lighting/ClusteredLightSystem.cs:669` (`!inLight.Range.IsNearlyZero()`)
and `:760` (`!(light.Range <= 0f) && !(light.Intensity <= 0f)`); KSA's own debug draw also skips
it (`decomp/KSA.Rendering.Lighting/LightUtils.cs:67,80`). The shader itself would NOT reject it:
`step(RANGE_EPSILON, …)` merely disables the window (windowless `1/d²`), and
`TileFrustum.glsl:53`'s `inRange <= 0` branch is an apex-containment test, not a reject.

**The formulas flexo ports (the ONLY falloff model in this plan — no other approximation):**

```
E(d)     = Intensity · saturate(1 − (d/Range)⁴) / d²                     (illuminance at distance d)
spot(θ)  = saturate( (cosθ − cos(Outer)) / (cos(Inner) − cos(Outer)) )²  (1 inside inner cone, 0 outside outer)
E_spot   = E(d) · spot(θ)
```

Properties the visualization exploits: `E` is monotonically decreasing, **exactly 0 at `d = Range`**
(hard boundary sphere), and the spot term is exactly 0 on the outer cone / exactly 1 inside the
inner cone — so inner/outer cones and the range sphere are true iso-surfaces, not decoration.

### 1.5 Reference tables — REQUIRED unit-test vectors

Computed from the formulas above (tolerance `1e-3` relative unless noted). Pin these in
`src/ksa/lightFalloff.test.ts` (Phase 2).

**Distance falloff, on-axis — SpotlightA (I=10, R=5):**

| d (m) | E(d)      | Reinhard `E/(E+1)` |
| ----- | --------- | ------------------- |
| 0.25  | 159.999   | 0.9938              |
| 0.5   | 39.996    | 0.9756              |
| 1     | 9.984     | 0.9090              |
| 2     | 2.436     | 0.7090              |
| 3     | 0.96711   | 0.4916              |
| 4     | 0.36900   | 0.2695              |
| 4.5   | 0.16983   | 0.1452              |
| 4.9   | 0.03233   | 0.0313              |
| 5.0   | **0.0** (exact) | 0.0           |

**Angular falloff — inner 0.392599 (22.5°), outer 0.785398 (45°):**

| θ     | spot(θ)² |
| ----- | -------- |
| 0°    | 1.0000   |
| 10°   | 1.0000   |
| 22.5° | 0.9996   |
| 25°   | 0.8442   |
| 30°   | 0.5373   |
| 35°   | 0.2671   |
| 40°   | 0.0739   |
| 44°   | 0.0032   |
| 45°   | **0.0** (exact) |

**Dim point light — CoreIVASpaceA (I=0.05, R=1.5):** E(0.1)=4.9999, E(0.25)=0.79938,
E(0.5)=0.19753, E(1.0)=0.04012, E(1.4)=0.00615, E(1.5)=0 — this light justifies the auto-exposure
mode (§3.6): with a fixed display reference it is nearly invisible, which is *honest* but
unusable while editing it.

**Angle sanitizer parity:** `clampSpotAngles(0.23, 1.57)` → `(0.23, 1.5697963)`;
`clampSpotAngles(0.8, 0.4)` → swap → `(0.4, 0.8)`; `clampSpotAngles(0.5, 2.0)` → `(0.5, 1.5697963)`.

### 1.6 KSA's own light debug draw — and why flexo deviates on one point

KSA ships a debug visualization (`decomp/KSA.Rendering.Lighting/LightUtils.cs:65-104`):
- **Point:** a center dot + one screen-space circle at radius `Range` (`AddPointLight`).
- **Spot:** center dot, **12** lines from the apex, and two closed polylines (inner + outer rims)
  — but the rims are placed at axial distance `Range` with radius `Range · tan(angle)`
  (`RadiusFromConeAngle`, `LightUtils.cs:106-109`).

The `tan` construction **explodes for wide cones**: FloodlightA's `Outer=1.57` gives
`tan(89.95°) ≈ 1146` → a 3.4 km rim disc on a 3 m light. It also overstates reach: the true
extinction surface is the **sphere** `d = Range`, so a spot's boundary is a *spherical cap*, not a
flat disc. flexo therefore keeps KSA's 12-ray + rim-circle *language* but places the rim on the
range sphere: rim center at `x = R·cos(θ)`, rim radius `R·sin(θ)` (every rim point at exactly
`d = R` from the apex, where E = 0). This is a deliberate, documented deviation — record it in
`docs/lights.md` and `scope/` (§5).

---

## 2. Where flexo stands today (verified @ `a3bcd33`)

| Layer | Location | State |
| --- | --- | --- |
| Type | `src/ksa/types.ts:478-514` `Light` (nested `transform: Transform`), `createLight()` `:1197-1208` | SubPart-only, no `id`, no `layerId` |
| Attachment | `SubPartGameData.lights: Light[]` `types.ts:1128`, keyed by `subPartTemplateId` | per **template**; `isSubPartGameDataEmpty` counts lights `:1148-…` |
| Part-level `<Light>` | **passthrough only** — `'Light'` is absent from `KNOWN_PART_GAMEDATA_CHILDREN` (`src/ksa/partXmlParser.ts:837-864`) so it lands in `gameData.unknownChildren` verbatim | Core authors it (§1.2) — the gap |
| Parser | `lightFromElement` `partXmlParser.ts:509-527`, wired `:752`, duplicate-Id merge `:774` | correct for SubPart site |
| Serializer | `buildLightElement` `partXmlSerializer.ts:519-555` (Type / Transform without Scale / Range / Intensity / Color / angles Spot-only / RayTracing only-if-true), called `:322` | field-for-field correct — **reuse it** |
| Codec | `CLight` `src/state/projectCodec.ts:522-531`, enc `:533`, dec `:547`, `li?` `:878,:893,:909` | reshaped in Phase 1 |
| Store | `addLight` `editorStore.ts:2398` … `setLightRotation` `:2443`; discrete via `commitSubPartData` `:2268-2276`, streaming via `mutateSubPartData` `:2261-2266` | rewritten in Phase 1 |
| UI | `LightsSection` `src/ui/GameDataSections.tsx:296-435` inside the "SubPart Data" dialog (`ManageTanksModal.tsx:47-49`); "Add matching light" `ManageTexturesPanel.tsx:515-531` | data-only editing |
| 3D | **nothing** — the only three.js lights in `src/` are the 4 viewport key/fill rigs (`Viewport.ts:121-123` + the three preview viewports) | greenfield |
| Export variants | `hasSubPartGameData` `src/ksa/modExport.ts:222-228` already ORs SubPart GameData **and** subpart-owned colliders; a built-in template carrying either gets a fresh `flexo_<base>_<id>` variant (`buildExportVariantMap` `:255-303`) so its GameData never merges onto the shared Core template | lights must join this OR (Phase 1) |

Selection/gizmo/layer machinery to plug into (verified):

- `SelectableKind = 'subpart' | 'connector' | 'collider' | 'ivaSeat' | 'kitten'` — `editorStore.ts:1784`;
  same union in `Selectable`, `src/three/SelectionManager.ts:4-14`.
- Five parallel index stores (`$selectedIndices` `:115` … `$selectedIvaSeatIndices` `:165`) +
  `clearSelection` `:1775`, `setSelection` `:1805`, `toggleEntity` `:1824`, `revealEntity` `:1851`.
- `selectedTransformRefs()` `:1870-1908` / `updateSelectedTransforms` `:1998-2017` (collider branch
  routes through `assignCollider` `:2024-2029` — the "reinterpret scale" hook lights copy for the
  "pin scale" rule).
- `EditorScene` reconcile order `src/three/EditorScene.ts:593-602`; the 8-step "add an entity type"
  checklist is §3.7. Multi-instance pattern: `colliderObjects: Map<string, ColliderObject[]>`
  `:153`, `colliderOwners` `:927-930`, `colliderInstance` (last-clicked instance) `:160,:294`,
  `colliderGizmoFrame` `:1392-1400`.
- Gizmo: `TransformGizmo.ts` (70 lines, wraps `TransformControls`); undo pushed **once** in
  `onDragStart` (`EditorScene.ts:338-365`); `handleGizmoChange` `:1367-1385`.
- Coordinates: **KSA and three.js share the same basis** — no axis swap, only Euler order
  `'ZYX'` (`src/three/coords.ts:27-28`); KSA local `+X` ≡ three.js local `+X`.
- Layer trap (commit `3383681`): `deselectLayer` / `selectLayerEntities` MUST cover every
  selectable kind or locking a layer leaves the gizmo attached and the next drag silently moves
  the entity. Lights must be added to both + the two `layerStore.test.ts` tests extended.

---

## 3. Design

### 3.1 Decisions (rationale inline — do not relitigate during implementation)

- **D1 — Normalize lights into `EditingPart.lights: PartLight[]`** with
  `ownerTemplateId: string | null`, exactly like `PartCollider` (`types.ts:156-172`). `null` ⇒
  part-level `<Light>` under `<PartGameData>` (new capability, closes the Core gap §1.2);
  otherwise emitted into that template's `<SubPartGameData>`. `SubPartGameData.lights` is
  **removed**. Rationale: every selection/gizmo/layer/undo mechanism keys on flat top-level
  `$part` arrays whose entities `extends Transform`; the collider feature already proved this
  shape for a dual-site GameData component. Emitted XML grammar is unchanged (serializer
  re-groups by owner).
- **D2 — `id` is editor-only, NEVER emitted** (`_light1`, `_light2`, …) — the `IvaSeat.id`
  precedent (`types.ts:193`). Core authors no `<Light Id>`; emitting one would add contract
  surface for zero benefit. An incoming `Id` attribute is dropped (current behavior; note in
  scope doc).
- **D3 — Flat `extends Transform`, scale pinned to (1,1,1)** and never emitted (existing
  serializer rule, `scope/gamedata-modules.md` gotcha "Light Scale is never emitted"). `rotation`
  is stored/emitted for Point lights too (KSA ignores it; Core round-trips fine) — the inspector
  simply hides aim fields for Point (existing `LightsSection` behavior).
- **D4 — `LightObject`s are TOP-LEVEL children of the scene root, not children of placement
  groups.** Because `Range` is world-meters regardless of owner scale (§1.3 #5), parenting under
  a scaled placement would distort the falloff volume. World pose is computed by new
  `coords.lightWorld` (§3.4), mirroring how colliders do it — but with light rules.
- **D5 — Visualization = exact-formula nested shells + true boundary wireframe + optional live
  lights.** One `ShaderMaterial` implements §1.4 verbatim for both types (a spot's shells
  naturally render as spherical-cap "domes" — no cone mesh needed, no wide-angle degeneracy).
  Boundary wireframe per §1.6. Live preview via real `THREE.PointLight`/`SpotLight` (§3.8),
  default off.
- **D6 — Volumes and wireframes are never raycast targets** (`obj.raycast = () => {}`, the
  `ColliderObject.wire` precedent `ColliderObject.ts:80`); only the marker is clickable. A new
  `'light'` `SelectableKind`; `lightInstance: Map<string, number>` mirrors `colliderInstance` so
  the gizmo and part-frame fields know *which* placement's frame to write through.
- **D7 — Settings** in a persisted `$lightSettings` (`@nanostores/persistent`, §3.6/§3.9-style):
  marker size, volume visibility mode, exposure mode, live preview. Defaults keep the viewport
  calm: volumes on **selected lights only**.
- **D8 — Gizmo space stays `'world'`** (the selection gizmo never calls `setSpace` — verified).
  A local-space toggle is a possible follow-up, out of scope.
- **D9 — UI degrees, model radians** (existing convention: `RAD2DEG`/`DEG2RAD`,
  `src/ui/format.ts:3-4`; `LightsSection` already does this for aim + cone angles).
- **D10 — "World" inputs are PART-FRAME inputs.** The scene root (`flexo-part` group,
  `EditorScene.ts:143,:231-232`) sits at identity, so the part assembly frame IS scene world.
  Label them "part frame" for precision. For a part-level light, part frame == owner frame (show
  one set of fields). For a subpart-owned light, show owner-frame fields AND part-frame fields
  computed through the context instance (last-clicked, default 0), with an instance-context row.
- **D11 — Validation** in a new `src/ksa/lightValidation.ts` (mirror `colliderValidation.ts` /
  `ivaSeatValidation.ts` shape + `ExportButton.tsx` wiring), rules in §3.10.
- **D12 — Angle sanitizer parity, not enforcement.** flexo stores/emits what the user authors
  (Core itself authors `Outer=1.57` above the clamp); the *visualization* applies
  `clampSpotAngles` (swap + clamp — `Light.cs` parity) so it always shows what the game will do,
  and validation flags the swap case as a probable authoring mistake.

### 3.2 Document model (`src/ksa/types.ts`)

Add (near `PartCollider`, keep the JSDoc — it is the spec):

```ts
/**
 * One cast light of the Part being edited — a first-class 3D entity (like
 * {@link PartCollider} / {@link IvaSeat}), normalised out of per-template GameData
 * so it can be selected, gizmo-edited and visualized. Mirrors KSA's
 * `LightModule.TemplateData` (`<Light>`, legal under BOTH `<PartGameData>` and
 * `<SubPartGameData>` — Core authors both). See plans/LIGHT_MANAGEMENT_PLAN.md §1.
 *
 * {@link Transform} is reused with a deliberate reinterpretation:
 *  - `position` → `<Transform><Position>` — the emitter point in the OWNER frame
 *    (part assembly frame when {@link ownerTemplateId} is null, else the SubPart
 *    TEMPLATE's local frame), meters.
 *  - `rotation` → `<Transform><Rotation>` — Euler XYZ radians. Aims a Spot along
 *    the rotated local +X (`LightModule.UpdateRenderData` transforms
 *    `double3.UnitX`). Stored + emitted for Point too; KSA ignores it there.
 *  - `scale` → UNUSED. KSA ignores light scale; pinned (1,1,1), never emitted.
 */
export interface PartLight extends Transform {
  /** Editor-only document id, e.g. "_light1". NEVER emitted (Core authors no <Light Id>). */
  id: string
  type: LightType
  /**
   * `null` ⇒ part-level: emitted under `<PartGameData>`, transform in the Part's
   * assembly frame (Core: CoreCommandA headlights, CoreIVASpaceA interior light).
   * Otherwise a `subPartTemplateId` ⇒ emitted under that template's
   * `<SubPartGameData>` — the light applies to EVERY placement of the template and
   * rides each instance's transform (Core: CoreElectricalA spotlights). Emitting
   * under a BUILT-IN template id routes through the export-variant remap so Core's
   * shared template is never mutated (modExport.buildExportVariantMap).
   */
  ownerTemplateId: string | null
  /** Falloff distance in meters (<Range Value/>). Illuminance is EXACTLY 0 at d ≥ range (§1.4). */
  rangeM: number
  /** Brightness (<Intensity Value/>). Candela-like: E ≈ intensity/d² near the source. */
  intensity: number
  /** RGB color, channels 0–1 (<Color R G B/>). KSA schema default is Gray (0.5,0.5,0.5). */
  color: { r: number; g: number; b: number }
  /** Spot inner cone half-angle, radians (<InnerAngle Value/>). Full-bright inside. */
  innerAngleRad: number
  /** Spot outer cone half-angle, radians (<OuterAngle Value/>). Runtime-clamped to ≤ 1.5697963 (§1.4). */
  outerAngleRad: number
  /** <RayTracing>true</RayTracing> — IVA ray-traced list routing only. */
  rayTracing: boolean
  /** Always {@link LIGHT_LAYER_ID}; parity with the other layered entities. */
  layerId: string
}
```

Also:

- `export const LIGHT_LAYER_ID = 'lights'` + `createLightLayer()` (mirror
  `createColliderLayer` `types.ts:299`; display name **"Lights"**); append to
  `BUILT_IN_LAYER_IDS` (`:309-315`) and seed in `createEmptyPart()` (`:2095-2101`).
- `EditingPart.lights: PartLight[]` (next to `colliders`/`ivaSeats`, `types.ts:2045-2086`);
  `createEmptyPart()` initializes `lights: []`.
- `createPartLight(ownerTemplateId: string | null, id: string): PartLight` — defaults = the
  canonical SpotlightA (`Spot`, identity transform, rangeM 5, intensity 10, white, π/8, π/4,
  rayTracing false, `LIGHT_LAYER_ID`). Replaces `createLight()` (`:1197-1208` — delete it).
- **Delete** `SubPartGameData.lights` (`:1128`) and remove the lights term from
  `isSubPartGameDataEmpty` (`:1148-…`). Grep for every `.lights` consumer and rewire
  (`rg -n "\.lights" src/`); the known ones are the parser, serializer, codec, store mutators,
  `LightsSection`, `ManageTexturesPanel`, `PowerConsumerSection`'s `hasLights`
  (`GameDataSections.tsx:499-501` → now `part.lights.length > 0`), and `modExport`.
- Keep `LightType` (`:478-484`) unchanged.

No data migration — per the project constitution (AGENTS.md), stale persisted projects are purged
at boot, never converted.

### 3.3 XML I/O

**Parser (`src/ksa/partXmlParser.ts`):**

1. Add `'Light'` to `KNOWN_PART_GAMEDATA_CHILDREN` (`:837-864`) — part-level `<Light>` leaves the
   passthrough and becomes modeled.
2. In the `PartGameData` branch (the function returning at `:650-663`): parse
   `directChildren(gd, 'Light').map(lightFromElement)` into part-level `PartLight`s
   (`ownerTemplateId: null`), alongside the existing `colliders: collidersFromElement(gd, null)`.
3. In `subPartGameDataFromRoot` (`:744-763`): stop writing `spd.lights`; instead surface each
   `<Light>` as a `PartLight` with `ownerTemplateId = subPartTemplateId`. Duplicate-Id merge
   (`mergeSubPartGameDataInto` `:771-779`) becomes a plain list append — order within the
   document is preserved (KSA accumulates; nothing orders lights semantically).
4. `lightFromElement` (`:509-527`) keeps its defaults table (Range/Intensity **1**, white, π/8,
   π/4, false — beware: the **schema** default color is Gray, but `lightFromElement`'s
   white default only applies to a `<Color>` element with missing attrs; keep current behavior,
   note it in the scope doc) and now returns the flat shape + caller-assigned
   `id`/`ownerTemplateId`/`layerId`. Ids are assigned by the caller: `_light1…N` in document
   order (part-level first, then SubPartGameData blocks in document order).
5. Plumb the lists into the `EditingPart` the same way `colliders` flow (the assembly site is
   where `parsePartGameData`'s return is merged — follow `colliders` with `rg -n "colliders"
   src/ksa/partXmlParser.ts` and mirror).

**Serializer (`src/ksa/partXmlSerializer.ts`):** mirror the collider grouping exactly
(`collidersByOwner` usage `:150`, part-level emission `:274-276`, SPD ride-along `:304-335`,
orphan-owner blocks `:339-345`):

1. `const lightGroups = lightsByOwner(part.lights)` (new tiny helper next to
   `collidersByOwner`).
2. Part-level: emit each `lightGroups.get(null)` entry via `buildLightElement` under
   `<PartGameData>` — insert after the `<PowerConsumer>` block (`:205-214`), before
   `<Connector>`s (element order is irrelevant to KSA's `XmlSerializer`; this spot groups the
   electrical family for human readers, matching Core's own layout).
3. SPD loop `:309-335`: replace `for (const light of spd.lights)` (`:322`) with the owned group
   (`lightGroups.get(spd.subPartTemplateId)`), tracked with an `emittedLightOwners` set exactly
   like `emittedColliderOwners` (`:308-314`); the skip condition `:313` becomes
   `if (isSubPartGameDataEmpty(spd) && owned.length === 0 && ownedLights.length === 0) continue`.
4. Orphan owners (`:339-345`): generalize the loop to the UNION of collider-owner and light-owner
   template ids so a template whose only GameData is a light still gets its
   `<SubPartGameData>` block (with `templateRemap` applied — that remap is what routes GameData
   onto export-variant ids).
5. `buildLightElement` (`:519-555`) — keep verbatim except it now reads the flat fields
   (`light.position`/`light.rotation` instead of `light.transform.*`). Emission rules preserved:
   `<Transform>` omitted when identity, `<Scale>` never, angles Spot-only, `<RayTracing>` only
   when true, `formatG6` numbers.

**modExport (`src/ksa/modExport.ts`):** extend `hasSubPartGameData` (`:222-228`) with
`|| part.lights.some((l) => l.ownerTemplateId === templateId)` and update its doc comment. This
is the line that guarantees a light on a **built-in** SubPart triggers a fresh
`flexo_<base>_<id>` export variant instead of merging onto the shared Core template
(`buildExportVariantMap` doc `:230-253` — post-`a3bcd33` the custom-mesh crash path is already
guarded; do not re-add `materialId: null` anywhere).

**Codec (`src/state/projectCodec.ts`):** reshape `CLight` (`:522-531`) to the flat entity —
add `id`, `ot` (ownerTemplateId), `ly` (layerId), inline `p`/`r` position/rotation (drop the
nested transform + scale); move the array from the SPD record (`li?` `:878,:893,:909`) to the
top-level part record next to colliders. Follow the existing short-key style. Round-trip test
required (Phase 1). No back-compat decoding for the old shape.

**Transfer/paste (`src/state/projectTransfer.ts`):** mirror the collider paste block
(`:387-394` — fresh `_colliderN` ids, forced built-in layer): lights get fresh `_lightN` ids,
`layerId: LIGHT_LAYER_ID`, and `ownerTemplateId` passed through the SAME template-id treatment
the collider block applies to its `ownerTemplateId` (read that block and copy its handling
verbatim — if it carries owner ids untouched, do the same). Include lights in the transfer counts
(`:117,:528`) and the export payload (`:177,:248`).

### 3.4 Frame math (`src/three/coords.ts`)

Add two functions next to `colliderWorld`/`colliderLocalFromWorld` (`:94-152`), with this exact
contract (JSDoc it — the collider contrast is the trap):

```
lightWorld(light, owner):            owner = SubPartPlacement | null
  owner null →  world = light's own transform verbatim (assembly frame IS part frame)
  else:
    worldPos = owner.position + R_owner · (S_owner ∘ light.position)     // scale INCLUDED (≠ colliderWorld)
    worldRot = R_owner · R_light                                         // quaternion compose, EULER_ORDER
    worldScale = (1,1,1)                                                 // light scale unused

lightLocalFromWorld(world, owner):   exact inverse
  owner null →  local = world verbatim (scale pinned (1,1,1))
  else:
    light.position = S_owner⁻¹ ∘ (R_owner⁻¹ · (world.position − owner.position))
    light.rotation = R_owner⁻¹ · R_world
    scale pinned (1,1,1)
```

Implementation notes: build quaternions with `new THREE.Euler(x, y, z, EULER_ORDER)` exactly as
`colliderWorld` does (never hand-roll the order); `S_owner⁻¹` divides per-axis by the SIGNED
component, guarding `|s| < 1e-9 → treat as 1` (negative = mirrored placement is legal; zero is
degenerate and `lightValidation` warns). Round-trip test: `lightLocalFromWorld(lightWorld(l, p), p)`
reproduces `l`'s position/rotation to `1e-12` for a rotated + non-uniformly-scaled + mirrored
owner (mirror `coords.test.ts:78-129`'s collider cases).

Also export a tiny `lightWorldAim(worldRotation): Vec3` — the rotated `+X` unit vector (used by
the inspector aim fields and the live `SpotLight` target); implement via
`new THREE.Vector3(1,0,0).applyQuaternion(q)`.

### 3.5 3D representation — `src/three/LightObject.ts` (new)

One `LightObject` per **light instance**: part-level light → exactly one; subpart-owned →
one per placement of the owner template (`lightOwners(part, light)` mirrors `colliderOwners`
`EditorScene.ts:927-930`). Class shape mirrors `IvaSeatObject` (`IvaSeatObject.ts:79-248`):

```
LightObject
├─ group: THREE.Group                       // world pose ← coords.lightWorld; userData.selectable
│  ├─ bulb: Mesh(SphereGeometry(0.4·markerSize, 16, 12), MeshBasicMaterial(lightColor))
│  │        // the click target; userData.selectable stamped on group AND every solid child
│  │        // (raycast hits meshes, never groups — IvaSeatObject.ts:101,113 precedent)
│  ├─ aimCone (Spot only): Mesh(ConeGeometry(0.25·markerSize, 1.2·markerSize, 12))
│  │        // along local +X: cone.rotation.z = -Math.PI / 2  (ConnectorObject.ts:53 precedent)
│  │        // positioned x = 0.9·markerSize; same selectable stamp
│  ├─ wire: LineSegments(lightWireGeometry(light), LineBasicMaterial(lightColor))
│  │        // §1.6 boundary; wire.raycast = () => {}   (ColliderObject.ts:80 precedent)
│  └─ volume: InstancedMesh(UNIT_SPHERE, LightVolumeMaterial, SHELL_COUNT)
│           // §3.6; volume.raycast = () => {}; volume.frustumCulled = false
```

Constants: `COLOR_SELECTED = 0x22dd44` (shared green); default marker tint is the light's own
color, floored so near-black lights stay visible (`maxChannel < 0.25 → lerp toward 0.5 gray`).
Marker size from `$lightSettings.markerSize` (default `0.12`, matching seats); `EditorScene`
**rebuilds** all `LightObject`s when it changes (the `rebuildIvaSeats` pattern,
`EditorScene.ts:1165-1174`).

**Boundary wireframe (`lightWireGeometry`)** — one `Float32Array` of line-segment pairs:

- **Point:** three unit circles (64 segments each) in the XY / XZ / YZ planes, scaled by
  `rangeM`. (Optionally reuse `ring()` from `src/three/wireShapes.ts:62` — check its output
  format first; hand-building the pairs is equally acceptable.)
- **Spot** (after `clampSpotAngles`): with `a_o = R·cos(θ_o)`, `r_o = R·sin(θ_o)`:
  - 12 rays: `(0,0,0) → (a_o, r_o·cos φ_k, r_o·sin φ_k)`, `φ_k = k·2π/12` (12 = KSA's own
    `SPOT_BASE_SEGMENTS`, `LightUtils.cs:9`);
  - outer rim circle at `x = a_o`, radius `r_o` (48 segments);
  - inner rim circle at `x = R·cos(θ_i)`, radius `R·sin(θ_i)` (48 segments) — skip when
    `θ_i < 0.01`;
  - two cap arcs on the range sphere: `θ ∈ [−θ_o, +θ_o]` sampled 32×, points
    `(R·cosθ, R·sinθ, 0)` and `(R·cosθ, 0, R·sinθ)`.

Rebuild the wire geometry (dispose old) when `type/rangeM/innerAngleRad/outerAngleRad` change;
`setLight(light, world, instanceIndex)` otherwise just updates transforms, colors and uniforms.
`dispose()` releases geometries + materials (shared unit-sphere geometry and shader are
module-level singletons — do NOT dispose those per-object; dispose only per-object geometry:
wire, marker meshes reuse module-level geometries where easy).

**Depth/blending decisions (uniform with existing helpers):** markers + wire use default depth
behavior (colliders/seats precedent). The volume: `transparent: true`, `depthWrite: false`,
`blending: THREE.AdditiveBlending`, `side: THREE.BackSide` (BackSide gives exactly one face per
shell from BOTH outside and inside the volume — FrontSide would vanish when the camera enters,
DoubleSide would double-count), `depthTest: true` (occlusion by part geometry is depth-correct
and reads naturally; interior lights are viewed by hiding hull layers or orbiting inside —
document in docs/lights.md).

### 3.6 The falloff volume — `LightVolumeMaterial` (inside `LightObject.ts` or a sibling module)

**Concept:** `SHELL_COUNT = 16` concentric spheres at radii `s_i = ((i + 0.5) / 16) · rangeM`
(instance matrices = uniform scales, recomputed on range change;
`instanceMatrix.needsUpdate = true`). The fragment shader evaluates §1.4 **verbatim** at each
surface point, so each shell's brightness is the true illuminance at its radius — and for spots,
fragments outside the cone go black, so the stack reads as a graded spherical-cap "beam" with
zero cone geometry and no wide-angle degeneracy. Point lights get a graded ball. The unit-sphere
geometry is one module-level `new THREE.SphereGeometry(1, 32, 16)`.

```glsl
// vertex
varying vec3 vLocal;
void main() {
  vec4 p = instanceMatrix * vec4(position, 1.0);   // meters, light-local; +X = aim
  vLocal = p.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * p;
}
```

```glsl
// fragment — KSA Content/Core/Shaders/Lighting/LightPrePass.comp:281-296, display-tonemapped
uniform float uRange, uIntensity, uCosInner, uCosOuter, uIsSpot, uExposure, uMaxAlpha;
uniform vec3 uColor;
varying vec3 vLocal;
void main() {
  float d = length(vLocal);
  float x2 = (d * d) / (uRange * uRange);
  float win = clamp(1.0 - x2 * x2, 0.0, 1.0);                    // 1 − (d/R)⁴
  float E = uIntensity * win / max(d * d, 1e-4);
  float cosT = vLocal.x / max(d, 1e-6);
  float s = clamp((cosT - uCosOuter) / max(uCosInner - uCosOuter, 1e-4), 0.0, 1.0);
  E *= mix(1.0, s * s, uIsSpot);
  float a = uMaxAlpha * (E / (E + uExposure));                   // per-shell Reinhard for display
  gl_FragColor = vec4(uColor * a, 1.0);                          // additive: color IS the contribution
}
```

Notes for the implementer:

- `THREE.ShaderMaterial` + `InstancedMesh`: three.js auto-prepends the `instanceMatrix`
  attribute declaration for ShaderMaterial (the `USE_INSTANCING` prefix). Only
  `RawShaderMaterial` would need it declared manually — use `ShaderMaterial`.
- `frustumCulled = false` on the InstancedMesh — instance scaling breaks the unit bounding
  sphere.
- Uniforms per light instance ⇒ the **material is cloned per LightObject** (uniform objects are
  shared by reference on clone in three — build a fresh uniforms object per instance; the
  compiled program is still shared by three's program cache).
- `SHELL_MAX_ALPHA = 1.6 / SHELL_COUNT` (`uMaxAlpha`): a fully saturated view ray sums to ≲1.6 —
  bright but not blown out.
- `uCosInner`/`uCosOuter` come from `clampSpotAngles` output (D12); for Point set
  `uIsSpot = 0` and both cosines 0 (the shader's `mix` ignores them — same sentinel the game
  uses, `LightData.glsl:23,26`).
- **Exposure** (`uExposure` = the Reinhard knee `E₀`):
  - `exposureMode: 'auto'` (default): `E₀ = max(lightIlluminance(0.2·R, R, I), 1e-3) / 3` —
    every light spans the full gradient regardless of its absolute intensity (the
    I=0.05 IVA light and the I=10 spotlight both read well).
  - `'absolute'`: `E₀ = $lightSettings.vizExposure` (default 1) — brightness comparable
    ACROSS lights (SpotlightA's table §1.5 shows what absolute E₀=1 looks like).
- Volume visibility: `$lightSettings.showVolumes` — `'selected'` (default) | `'all'` | `'off'`;
  applied in `updateSelection()`/`applyLayerView()` passes, composed with layer visibility
  (never write `group.visible` outside `applyLayerView` — it is the single writer,
  `EditorScene.ts:774-780`; toggle the `volume.visible` child flag instead).

### 3.7 EditorScene integration — the exhaustive touch list

Follow the 8-step checklist (verified against `EditorScene.ts`):

1. `lightObjects: Map<string, LightObject[]>` (array per light id — one per owner placement;
   the `colliderObjects` pattern `:147-153`) + `lightInstance: Map<string, number>`
   (last-clicked instance, `colliderInstance` pattern `:160`).
2. `reconcileLights(part)` + `positionLights(part)` called in `reconcile()` after
   `reconcileIvaSeats` (`:593-596`); grow/shrink each id's array to
   `lightOwners(part, light).length || 1` (mirror `:901-916`); `positionLights` sets each
   object's world transform from `coords.lightWorld(light, owners[i] ?? null)`.
   Animation preview: colliders are re-posed under joint animation via `positionColliders(part,
   posed)` — check how `applyAnimationPreview` (`:602`) threads posed frames into
   `positionColliders`, and give lights the same treatment so a light on an animated SubPart
   follows the preview pose (subpart-owned lights only; part-level lights never move).
3. `applyLayerView()` (`:774-827`): a lights block mirroring colliders `:801-807` — layer
   visibility × (volume mode ≠ off), and per-child `volume.visible` per §3.6.
4. `selectedObjects()` (`:1177-1207`): return the **context instance** object for each selected
   light (via `lightInstance`, default 0).
5. Constructor: `this.sub($selectedLightIndices, …)` next to the other four (`:471-475`);
   include in `clearContainerOnSelect` (`:417-421`); `this.sub($lightSettings, …)` →
   `rebuildLights()` (the `$ivaSeatSettings` pattern `:501-504`).
6. `SelectionManager` callback (`:250-334`): a `'light'` branch mirroring colliders
   (`:286-302`) — resolve index by id in `part.lights`, locked-layer reject, visible-layer
   reject (comment verbatim: "three.js does not skip invisible objects during raycasting"),
   `this.lightInstance.set(id, selected.instanceIndex ?? 0)`, additive toggle vs
   `selectLight(index)`, `revealEntity('light', id)`.
7. `rebuildLights()` (the `rebuildIvaSeats` pattern `:1165-1174`).
8. `dispose()` (`:1654-1701`): dispose every `LightObject` + clear maps.

Gizmo plumbing:

- `updateSelection()` attach priority (`:1238-1340`): single selected light attaches the gizmo to
  the context instance's `LightObject.group` (the collider branch `:1326-1332` is the template);
  extend the `anyLocked` computation (`:1309-1314`) with the lights layer.
- `handleGizmoChange` (`:1367-1385`): a light branch keyed off `object.userData.selectable.kind
  === 'light'` — read `readPlacementTransform(object)` (world), convert
  `coords.lightLocalFromWorld(world, contextOwner)`, call `updateLightTransform(index, local)`.
  The context owner placement = `part.placements` filtered by `ownerTemplateId`, indexed by
  `lightInstance` (mirror `colliderGizmoFrame` `:1392-1400` as `lightGizmoFrame`).
- `worldTransformRefs()` (`:1216-1222`) lifts collider refs into part space for multi-select
  bulk drags — add the same lift for lights via `lightWorld`.
- Scale mode: `assignLight` pins scale (§3.8), so a scale drag is a visual no-op on the light —
  acceptable (seats behave the same way; see the `seatScaleOnly` guard `EditorScene.ts:346-350`
  and extend that guard's `every((r) => r.kind === 'ivaSeat')` to also treat `'light'` as a
  scale-inert kind so no empty undo step is pushed).
- Rotate on a Point light: allowed, harmless (D3) — the marker has no aim cone, nothing visibly
  changes, the rotation round-trips.

On-demand rendering rule: **anything that can change a pixel must invalidate**
(`docs/3d-workspace.md:37-58`). All store-driven paths go through `this.sub()` (which
invalidates); any async or imperative mutation added outside that must call
`this.viewport.invalidate()` explicitly.

### 3.8 Store / selection / undo (`src/state/editorStore.ts` + `selectors.ts`)

New stores + actions (mirror the seat block shapes):

- `$selectedLightIndices` (+ computed `$selectedLightIndex`) next to `:165`;
  `selectLight` / `setSelectedLights` / additive toggle (mirror `:1740-1758`).
- `SelectableKind` (`:1784`) += `'light'`; same union in `SelectionManager.ts:4-14`.
- `clearSelection` (`:1775`), `setSelection` (`:1805`), `toggleEntity` (`:1824`),
  `selectedTransformRefs` (`:1870` — light branch: `transform` = the light's **owner-local**
  transform, `name` = `light.id`, like colliders), `updateSelectedTransforms` (`:2009` — route
  through a new `assignLight(l, t)` that copies position/rotation and PINS
  `scale = {x:1,y:1,z:1}`, the `assignIvaSeat` pattern), `updateLightTransform(index, t)`
  (streaming single-entity write, mirror `updateConnectorTransform` `:1947-1956`).
- `removeSelected` (`:1281`) and `duplicateSelected` (`:1385`): handle lights (duplicate =
  structuredClone with fresh `_lightN` id, same owner; follow whatever offset/selection behavior
  the collider branch implements — read it first).
- **`deselectLayer` + `selectLayerEntities`** (`:3521+`): add the lights terms. This is the
  commit-`3383681` trap — a kind left un-pruned keeps the gizmo attached on a locked layer and
  the next drag silently moves it. Extend both `layerStore.test.ts` tests (`:75`, `:94`).
- Entity mutators (replace the SPD-keyed family `:2385-2450`):
  - `addLight(ownerTemplateId: string | null, seed?: Partial<PartLight>): void` — discrete
    (`pushUndo('add light', …)` internally); generates `_lightN` id (mirror the collider id
    generator); keeps the two existing call sites working: the SubPart Data dialog passes the
    template id, `AddMatchingLightButton` (`ManageTexturesPanel.tsx:515-531`) passes
    `mesh.subPartId` + a seed — only its import changes.
  - `removeLight(index)` — discrete.
  - `setLightType(index, type)`, `setLightRayTracing(index, on)`, `setLightOwner(index,
    ownerTemplateId | null)` — discrete. `setLightOwner` keeps the WORLD pose stable when both
    frames are resolvable: `newLocal = lightLocalFromWorld(lightWorld(light, oldOwner0),
    newOwner0)` using instance 0 of each owner; if the new owner has no placements, keep the
    local transform verbatim (validation will flag it).
  - `updateLight(index, patch)` — **streaming** (numeric fields push undo via
    `onInteractionStart`, the existing `LightsSection` pattern `GameDataSections.tsx:330-379`);
    color commits push undo on pointer-down (existing pattern `:380-392`).
- Selectors (`src/state/selectors.ts`): add light indices to `$hasSelection` (`:42`),
  `$hasMultiSelection` (`:52`), `$selectionCount` (`:58`), `$selectedRefs` deps (`:75`);
  `SelectedEntity` (`:93-97`) += `{ kind: 'light'; index: number; light: PartLight }`;
  `$selectedEntity` (`:99-114`) resolves it after colliders. (Colliders are absent from
  `$hasSelection`/`$hasMultiSelection` today — do NOT cargo-cult that; lights follow the
  seat treatment and are included.)
- Import/merge path: wherever project import merges entity lists (the collider handling is the
  template — `rg -n "colliders" src/state/projectTransfer.ts src/state/editorStore.ts`),
  lights concat with freshened ids.

Undo enrollment is NON-NEGOTIABLE (`editorStore.ts:283-308` invariant): every mutator above is
annotated discrete or streaming; a `$part` mutator enrolling in neither is a bug. Add cases to
`editorStore.test.ts` for each (the existing light test `:636-657` is the model — port it to the
new model and extend: add/remove/type/owner/transform/duplicate/delete + undo for each).

### 3.9 Inspector & UI

**TransformInspector (`src/ui/TransformInspector.tsx`):** add a `LightHeader` dispatched from the
entity switch (`:151-170`), modeled on `ColliderHeader`/`IvaSeatHeader`. Contents, in order:

1. Title: `Light — Spot` / `Light — Point`, subtitle: `part-level` or
   `via <ownerTemplateId> · N instance(s)`; when N > 1, an instance-context row
   ("editing through `<instanceId>`" — from `lightInstance`) + the note "one light per template —
   edits affect every instance".
2. Owner `Select`: "Part level" + every **distinct placed** template id → `setLightOwner`.
3. Type `Select` (Spot/Point) → `setLightType`.
4. **Position (m, owner frame)** — 3 `NumberField`s (the `posField` builder pattern `:117-125`);
   streaming `updateLight`/`updateLightTransform` with `onInteractionStart` pushing one undo.
5. **Aim rotation (°)** — Spot only; 3 fields, `RAD2DEG`/`DEG2RAD` at the boundary (`:126-134`
   pattern).
6. **Position (m, part frame)** — computed `lightWorld(light, contextOwner).position`; commit →
   `lightLocalFromWorld` → `updateLightTransform`. For part-level lights SKIP this group
   (identical to #4 — render only one, labeled "Position (m, part frame)").
7. **Aim (part frame, unit vector)** — Spot only; 3 fields showing
   `lightWorldAim(worldRotation)`. Commit: normalize input (reject `|v| < 1e-6` — keep prior);
   `ΔQ = setFromUnitVectors(currentWorldAim, newAim)`; `newWorldRot = ΔQ · currentWorldRot`
   (preserves roll continuity — roll is irrelevant to the cone but stabilizes the gizmo);
   convert back through `lightLocalFromWorld`.
8. Range (m, min 0), Intensity (min 0), Color (`<input type="color">` with the
   `rgb01ToHex`/`hexToRgb01` helpers `GameDataSections.tsx:63-77`), Inner/Outer angle
   (°, half-cone, min 0 max 90), Ray tracing switch — port the existing `LightsSection` controls.
9. Phase 7: the falloff mini-curve (§3.11).

**Every numeric field** uses the `PreciseNumberInput` / `NumberField` components (which wrap
`useNumberDraft`, `src/ui/numberDraft.ts:72`, and set `inputMode="url"` —
`PreciseNumberInput.tsx:26-40`). Never a raw controlled `<input type="number">` — the drafts are
what make "-", ".06", and empty-field states typeable.

**GameDataSections:** rewrite `LightsSection` (`:296-435`) as an owner-filtered view over
`part.lights` (`ownerTemplateId === subPartTemplateId`), same cards + `+ Light` →
`addLight(subPartTemplateId)`; add a "select in 3D" affordance per card
(`selectLight(index)` + `revealEntity`). Add a `PartLightsSection` (filter `null`) to the Part
Data dialog next to `PowerConsumerSection` (`:632`). `PowerConsumerSection`'s `hasLights`
(`:499-501`) now reads `part.lights.length > 0`.

**Add menu (`src/ui/AddButton.tsx`, locate the kitten entries via `rg -n "addKitten"`):**
`Add → Light → Spot light / Point light` → `addLight(null, { type })` + select the new light
(part-level at origin — instantly visible and gizmo-editable).

**AssetsList (`src/ui/AssetsList.tsx:152-256`):** a Lights-layer section row per light —
label `"{id} · Spot"` (+ owner suffix when subpart-owned), mirroring the collider section
(row click = select + reveal; respects `listed`/locked states).

**ViewButton (`src/ui/ViewButton.tsx`, Visibility section `:96-105`):** add a "Light coverage"
`Select` (`Selected / All / Off` → `$lightSettings.showVolumes`), an exposure mode `Select` +
conditional `PreciseNumberInput` (absolute E₀), and a "Preview lighting" `Switch`
(`livePreview`) with a one-line description each (the `Hide interior` copy pattern).

**Settings (`src/state/settingsStore.ts`):**

```ts
export interface LightVizSettings {
  markerSize: number                       // default 0.12 (parity with IVA seats)
  showVolumes: 'selected' | 'all' | 'off'  // default 'selected'
  exposureMode: 'auto' | 'absolute'        // default 'auto'  (§3.6)
  vizExposure: number                      // default 1 — absolute-mode E₀
  livePreview: boolean                     // default false   (§3.10)
}
export const $lightSettings = persistentJSON<LightVizSettings>('flexo:lightSettings', { … })
export function setLightSettings(patch: Partial<LightVizSettings>): void
```

(`$ivaSeatSettings` `:44-51` is the exact template; add a `settingsStore.test.ts` case.)

### 3.10 Live lighting preview (Phase 6)

When `$lightSettings.livePreview` is on, each `LightObject` additionally carries a real three.js
light so the part meshes are actually lit:

| KSA field | three.js (Point) | three.js (Spot) |
| --- | --- | --- |
| Intensity | `PointLight(color, intensity, rangeM, 2)` — candela, physical units | `SpotLight(color, intensity, rangeM, angle, penumbra, 2)` |
| Range | `distance = rangeM` (three cuts off there too) | same |
| Outer angle | — | `angle = clampSpotAngles(...).outerRad` |
| Inner angle | — | `penumbra = outer > 0 ? clamp(1 − inner/outer, 0, 1) : 0` |
| Aim | — | `light.target` parented into the group at local `(rangeM, 0, 0)` (three spots aim at their target; bare default is −Y — `docs`: three aims spot from position to target) |
| Color | `color` | `color` |
| Shadows | `castShadow = false` (perf; KSA's shadow config is out of scope) | same |

Documented approximation (put this table in docs/lights.md): three's distance window is
`(1 − (d/R)⁴)²` (squared) vs KSA's un-squared, and its spot edge is a smoothstep vs KSA's
squared-linear — close but not identical; plus the editor's ACES tonemap ≠ KSA's grading. The
preview is *indicative*; the shells are *exact*.

Constraints: cap at `MAX_PREVIEW_LIGHTS = 16` (document order; show "previewing first 16 of N"
in the View menu when exceeded). Toggling and add/remove of preview lights changes the scene's
light count → three re-links shader programs; acceptable for a toggle, one more reason default
is off. Preview lights live only in the editor scene — the three preview viewports and the GLB
exporter build their own scenes (`exportGlb.ts:177-212`) and are untouched by construction.

### 3.11 Validation — `src/ksa/lightValidation.ts` (new) + falloff curve

Mirror `colliderValidation.ts`'s exported shape and its `ExportButton.tsx` wiring (find with
`rg -n "colliderValidation" src/ui`). Rules:

| id | severity | condition | message sketch |
| --- | --- | --- | --- |
| `light-range-nonpositive` | warning | `rangeM <= 0` | culled in-game CPU-side — never renders (ClusteredLightSystem.cs:669,760) |
| `light-intensity-nonpositive` | warning | `intensity <= 0` | culled in-game CPU-side (same `:760` check) — contributes nothing |
| `light-owner-mirrored` | warning | any owner placement has a negative scale component (det < 0) | the game's aim transform is an improper map: a (−1,−1,−1) owner flips the beam 180° while flexo's quaternion-composed marker cannot show a reflection (coords.ts lightWorld JSDoc) |
| `light-angles-swapped` | warning | Spot && `innerAngleRad > outerAngleRad` | game silently swaps (Light.cs:56-61) — probably an authoring mistake |
| `light-outer-overclamp` | info | Spot && `outerAngleRad > 1.5697963` | clamped to ≈89.94° in-game (Core's floodlight does this deliberately) |
| `light-owner-unplaced` | warning | `ownerTemplateId` set && no placements of it | light is never instantiated |
| `light-owner-nonuniform-scale` | warning | any owner placement has non-uniform scale | in-game aim skews + offset scales (§1.3 #3-4); flexo's marker shows the uniform-scale approximation |
| `light-always-on` | info | `part.lights.length > 0` && no `lightSwitch` consumer | always on, no in-game checkbox (HOW_LIGHT_PARTS_WORK §8.1) |
| `light-color-black` | info | `max(r,g,b) < 0.01` | invisible light |

**Falloff mini-curve** (Phase 7, in `LightHeader`): a ~200×56 inline `<svg>` polyline of the
display-normalized illuminance along the aim axis — 48 samples `d ∈ [0.02·R, R]`,
`y = E(d)/(E(d)+E₀)` with the SAME `E₀` the 3D volume uses, so the curve and the shells agree.
Pure render from props (no effects, no memo — React Compiler handles it).

---

## 4. Phases

Every phase ends with the **mandatory workflow** (AGENTS.md): `pnpm run fmt` → `pnpm run lint` →
`pnpm run fmt:check` → `pnpm test` → `pnpm typecheck` — all run **bare** (no pipes/redirection).
A phase is done only when all pass and its acceptance list is checked. Conventional-commit
subjects are given per phase (scope `lights`).

### Phase 1 — Data model, XML round-trip, scope sync

> **Status: IMPLEMENTED** — `bdde502`.

**Goal:** `EditingPart.lights: PartLight[]` normalized model; part-level `<Light>` modeled; XML
grammar byte-compatible with today's output for SubPart lights; no visual change.

Tasks:

1. `types.ts` — everything in §3.2 (interface, layer, factory, `EditingPart.lights`, deletions).
2. Parser changes §3.3 (including `'Light'` → `KNOWN_PART_GAMEDATA_CHILDREN`).
3. Serializer changes §3.3 (grouping, part-level emission, orphan owners, flat-field
   `buildLightElement`).
4. `modExport.hasSubPartGameData` OR-term + doc comment.
5. Codec + transfer changes §3.3.
6. Store mutators + import/merge path (§3.8 — mutators only; selection stores land in Phase 3).
7. UI rewire only (no new UI): `LightsSection` filters `part.lights` by owner;
   `AddMatchingLightButton` new signature; `PowerConsumerSection.hasLights`.
8. **Scope sync (same change — AGENTS.md non-negotiable):** `scope/gamedata-modules.md` `Light`
   row → "under `<PartGameData>` AND `<SubPartGameData>`, both modeled; editor-only id never
   emitted; incoming `<Light Id>` dropped"; note `'Light'` joined `KNOWN_PART_GAMEDATA_CHILDREN`.
9. Tests: serializer (part-level `<Light>` under `<PartGameData>`; SubPart grouping identical to
   the pre-change fixture output; orphan light-only owner gets its own SPD block; variant remap
   routes an owned light onto the variant id; Transform omission rules), parser (both sites;
   duplicate-Id accumulate; ids assigned in document order), codec round-trip, editorStore
   mutator + undo cases, modExport variant trigger (light on built-in template ⇒ variant).

Acceptance: all existing suites green; a part with a SubPart light exports byte-identical
GameData XML (modulo the unchanged-by-design element order); CoreCommandA-style part-level
lights import → `part.lights` with `ownerTemplateId: null` → re-export under `<PartGameData>`.

**Commit:** `feat(lights): normalize lights into first-class part entities with part-level <Light> support`

### Phase 2 — Math ports (pure, no UI)

> **Status: IMPLEMENTED** — `fbc7ac1`.

**Goal:** the falloff + frame math exists, tested against §1.5.

1. `src/ksa/lightFalloff.ts` — pure, no three.js (the `ivaSeatAxes.ts` discipline):
   `MAX_OUTER_ANGLE_RAD = 1.5697963`, `MIN_OUTER_ANGLE_RAD = 1e-5`, `clampSpotAngles`,
   `lightIlluminance(d, rangeM, intensity)` (§1.4; returns 0 for `rangeM <= 0` or `d >= rangeM`),
   `spotAttenuation(cosTheta, innerRad, outerRad)` (already-squared). JSDoc cites the shader
   lines (§1.4) — this file is a **ported-math game contract**.
2. `src/three/coords.ts` — `lightWorld` / `lightLocalFromWorld` / `lightWorldAim` (§3.4).
3. Tests: `lightFalloff.test.ts` pins every §1.5 table row; `coords.test.ts` gains light
   round-trip cases (rotated + non-uniform + mirrored owner; part-level identity).
4. **Scope sync:** add a row to `scope/FULL_SCOPE.md`'s integration map — "Light falloff/aim
   math (visualization)" backed by `LightPrePass.comp` / `LightData.glsl` / `Light.cs` /
   `LightModule.cs` → `src/ksa/lightFalloff.ts`, `src/three/coords.ts`; add a re-verify item to
   `scope/GAME_UPDATE_CHECKLIST.md` (grep the shader for formula drift on each game update).

**Commit:** `feat(lights): port KSA falloff math and light frame transforms`

### Phase 3 — Markers, layer, selection

> **Status: IMPLEMENTED** — `d773337`. The per-instance editing context landed as the
> `$lightEditContext` STORE atom rather than an `EditorScene`-private map (§3.9-1), so the
> gizmo and the inspector's part-frame fields read one source.

**Goal:** every light renders as a selectable marker on a built-in Lights layer.

1. `src/three/LightObject.ts` — marker + aim cone + selectable stamps + `setLight` /
   `setSelected` / `setLayerOpacity` / `dispose` (§3.5; volume + wire land in Phase 5 — leave
   clean seams).
2. `SelectionManager.Selectable` kind union += `'light'`.
3. Store: selection stores/actions, `SelectableKind`, `clearSelection`/`setSelection`/
   `toggleEntity`/`revealEntity`, `selectedTransformRefs`, `removeSelected`/`duplicateSelected`,
   **`deselectLayer`/`selectLayerEntities`** (§3.8) + `layerStore.test.ts` extensions.
4. Selectors (§3.8).
5. EditorScene items 1–8 of §3.7 (minus gizmo write-back, Phase 4): reconcile, layer view,
   selection sync, click branch, rebuild-on-settings, dispose. `$lightSettings` with
   `markerSize` only for now (`settingsStore`).
6. UI: `AddButton` entries; `AssetsList` section; `LightsSection` "select in 3D".
7. Docs: create `docs/lights.md` (skeleton: what a light is, both owner sites, the layer,
   markers) + AGENTS.md documentation-list line + a lights row in `docs/3d-workspace.md`'s
   component table.
8. Tests: editorStore selection/prune/duplicate/delete cases.

Acceptance: Add → Light places a selectable marker at origin; clicking Core-style imported
lights selects them; locking the Lights layer deselects + blocks picking; markers follow their
owner placements when those are moved; delete/duplicate/undo all work.

**Commit:** `feat(lights): render selectable light markers on a built-in Lights layer`

### Phase 4 — Gizmo editing + inspector

> **Status: IMPLEMENTED** — `edab0b4`.

**Goal:** move/rotate via gizmo; owner-frame + part-frame numeric editing; aim vector input.

1. EditorScene gizmo plumbing (§3.7): attach branch, `lightGizmoFrame`, `handleGizmoChange`
   light branch, `worldTransformRefs` lift, `anyLocked` extension, scale-inert guard.
2. Store: `updateLightTransform`, `assignLight` in `updateSelectedTransforms`, `setLightOwner`.
3. `TransformInspector` `LightHeader` (§3.9 items 1–8).
4. Tests: `updateSelectedTransforms` light branch pins scale; `setLightOwner` world-pose
   stability; nudge/rotate/bulk suites gain a light ref case (`nudgeSelection.test.ts` style).

Acceptance: dragging a subpart-owned light's gizmo on instance B writes owner-local values that
keep instance B's marker under the cursor (and moves A's marker in sync); part-frame fields and
gizmo agree; aim-vector commit re-aims the cone without rolling the gizmo wildly; every numeric
field accepts "-", ".5", and empty-while-typing (useNumberDraft).

**Commit:** `feat(lights): gizmo editing and inspector transform fields for lights`

### Phase 5 — Coverage visualization + view settings

> **Status: IMPLEMENTED** — `16f1641`. The pure half of the volume (shell radii + the
> exposure derivation) lives in `src/three/lightVolume.ts` so it is unit-testable without a
> WebGL context; `LightObject.ts` owns everything that needs three.

**Goal:** the falloff volume + boundary wireframe, with visibility/exposure controls.

1. `LightVolumeMaterial` + shells (§3.6) and `lightWireGeometry` (§3.5) in `LightObject`.
2. `$lightSettings` grows `showVolumes`/`exposureMode`/`vizExposure`; ViewButton controls
   (§3.9); EditorScene applies visibility per §3.6/§3.7-3.
3. Uniform updates on every `setLight` (range/intensity/angles/color/type) — verify live update
   while dragging an Intensity field.
4. Docs: extend `docs/lights.md` — the formulas (link §1.4 sources), the §1.6 deviation, the
   exposure modes, screenshots.
5. Tests: shell radii + uniform derivation helpers (auto-E₀ formula vs the §1.5 IVA-light row);
   `clampSpotAngles` already covered.

Acceptance: SpotlightA (R=5, I=10, 22.5°/45°) shows a graded 45° half-angle dome-capped beam
ending exactly at 5 m with a brighter 22.5° core; FloodlightA (outer 1.57) shows a clean
hemisphere (no km-scale disc); the IVA point light (I=0.05) reads as a graded ball in auto mode
and near-invisible in absolute mode at E₀=1 (both correct); 'all' mode with 10+ lights stays
interactive (on-demand renderer: cost only on draw).

**Commit:** `feat(lights): falloff volume visualization and view settings`

### Phase 6 — Live lighting preview

§3.10 wholesale: per-LightObject preview lights, cap + View-menu note, docs approximation table.

Acceptance: toggling "Preview lighting" visibly lights adjacent part meshes with the light's
color; spot cone on a wall matches the wireframe cone footprint by eye; toggle off restores the
stock look; >16 lights shows the cap note.

**Commit:** `feat(lights): optional live three.js light preview`

### Phase 7 — Validation, falloff curve, polish, final docs

1. `lightValidation.ts` + tests (every §3.11 rule, positive + negative) + ExportButton surfacing.
2. Falloff mini-curve in `LightHeader` (§3.11).
3. Final docs pass: `docs/lights.md` complete; `docs/editor-state.md` mutator table entries;
   `scope/` rows re-checked against the code as merged.
4. QA sweep (§6 checklist) with project-local Playwright (`pnpm add -D playwright` if absent;
   dev server base path is `/flexo/`): script the Phase 3–6 acceptance walks, screenshot the
   §Phase-5 acceptance scenes.

**Commit:** `feat(lights): validation, falloff curve, docs and scope sync`

---

## 5. Mandated docs / scope updates (AGENTS.md, non-negotiable — folded into phases above)

| Artifact | Change | Phase |
| --- | --- | --- |
| `scope/gamedata-modules.md` | `Light` row: both sites modeled, editor-only id, `KNOWN_PART_GAMEDATA_CHILDREN` addition, parser color-default nuance | 1 |
| `scope/FULL_SCOPE.md` | new integration-map row: ported falloff/aim math | 2 |
| `scope/GAME_UPDATE_CHECKLIST.md` | re-verify `LightPrePass.comp` formulas + `Light.cs` clamps on game update | 2 |
| `docs/lights.md` (new) + AGENTS.md doc list | the feature doc — model, both owner sites, markers, gizmo, volumes (formulas + §1.6 deviation + exposure), preview approximations, validation table | 3 → 7 |
| `docs/3d-workspace.md` | `LightObject` component-table row + a "Lights" paragraph beside the seat-marker one | 3 |
| `docs/editor-state.md` | new mutators in the undo table | 7 |

## 6. Implementation pitfalls checklist (verify before every phase commit)

- [ ] `deselectLayer` / `selectLayerEntities` cover `'light'` (the `3383681` trap).
- [ ] Every scene subscription goes through `EditorScene.sub()`; imperative mutations invalidate.
- [ ] `volume`/`wire` have `raycast = () => {}`; `userData.selectable` sits on the group AND every
      solid child mesh; `volume.frustumCulled = false`.
- [ ] `LightObject`s are root children (never parented under placements); world pose only via
      `coords.lightWorld` (never `colliderWorld` — position scale rule differs, §3.4).
- [ ] Scale pinned everywhere a transform is written (`assignLight`, `setLight`).
- [ ] All Euler handling via `coords.ts` helpers (`EULER_ORDER` stays module-private).
- [ ] Dispose: geometries/materials per object; shared unit sphere + program-cached shader
      singletons NOT disposed per object; CSS2D-style leaks n/a (no badges).
- [ ] No `useMemo`/`useCallback`/`React.memo`; no render-body side effects; hooks top-level only.
- [ ] Every numeric input = `useNumberDraft` wrapper components with `inputMode="url"`.
- [ ] `pnpm` scripts run BARE; oxfmt/oxlint clean; vitest beside sources (`.test.ts` only).
- [ ] Undo: each mutator discrete XOR streaming, with a test.
- [ ] Export invariants: variant map OR-term present; no `<SubPartGameData>` emitted under a raw
      built-in id when it carries a light; `<Scale>` never emitted for lights.

## 7. Deliberate limits (documented, not bugs)

- **Per-instance lights don't exist** — KSA keys SubPart lights on the template; flexo shows one
  gizmo per instance but they edit the shared light (the UI says so). Distinct per-instance
  lights require distinct templates (out of scope).
- **Catalog ghost lights** (visualizing the lights a placed BUILT-IN template already carries in
  Core's own GameData, e.g. placing `CoreElectricalA_Subpart_SpotlightA`) — valuable, deferred:
  needs a read-only reconcile source from `partCatalog` data. Listed as a follow-up in
  `docs/lights.md`.
- **No volumetric raymarch** — the shell stack is deliberately cheap and exact at its sample
  radii; no participating-media look.
- **RayTracing lights** render identically in flexo (the flag only reroutes them in-game).
- **Preview shadows off**; preview capped at 16.
- **Non-uniform owner scale** shows the quaternion-composed aim (validation warns; the game
  skews — §1.3).

---

## 8. Orchestration protocol (for the coordinating agent — how to run this plan)

The plan above is self-sufficient: implementing agents need THIS FILE + AGENTS.md + the cited
sources, not the conversation that produced it.

**Branch & commits.** Work on `feature/light-management` off `main`. One commit per phase, subject
lines as given (§4), body listing the phase's acceptance results; append the session's standard
commit trailers. Never commit with failing fmt/lint/tests.

**Per phase:**

1. **Worker agent** (fresh context). Prompt it with: the phase number + this file's path
   (instruct: read §the-phase, §3 subsections it references, §6 checklist, and AGENTS.md first);
   the mandatory workflow; the acceptance list as its definition of done; and the instruction to
   follow cited line anchors by searching for quoted symbols when drifted. For UI phases point it
   at the `react`, `react-compiler`, `nanostores`, `hotkeys` skills; for scene phases at
   `threejs-fundamentals` / `threejs-geometry` / `threejs-shaders` / `threejs-interaction`.
2. **Validation agents** (fresh contexts, run AFTER the worker, before commit — each is told it
   is reviewing someone else's work, to assume defects exist, to report findings with file:line +
   severity, and NOT to fix anything):
   - **V1 Game-contract auditor:** given §1 + the diff; independently re-opens the decomp/shader
     sources and verifies schemas, defaults, formulas, clamp constants, emission grammar, and the
     variant-map guarantee. Must actively try to falsify the port (sign conventions, radians vs
     degrees, cos packing, element order, omission rules).
   - **V2 Editor-integration auditor:** given §3.7/§3.8/§6 + the diff; verifies the touch lists
     are COMPLETE (enumerate each site and check), undo enrollment per mutator, layer-lock prune,
     invalidate coverage, dispose paths, raycast opt-outs, Rules-of-React/compiler compliance,
     numeric-input mandate.
   - **V3 Runtime verifier:** runs the bare commands (fmt:check, lint, test, typecheck, build),
     boots the dev server, and walks the phase's acceptance list with project-local Playwright
     (base `/flexo/`), attaching screenshots for the visual criteria.
3. **Fix loop:** feed findings to a fixer agent (or the worker via follow-up); re-run the failed
   validator(s) on blockers; then commit.

Phases are strictly sequential (each builds on the last). If a validator contradicts this plan,
re-verify against the cited primary source — the source wins; update the plan file in the same
commit.

---

## 9. Reference index

**KSA (ksa-game-assemblies/current/):**

| Path | What |
| --- | --- |
| `decomp/KSA/LightModule.cs:11-53` | `<Light>` schema + defaults |
| `decomp/KSA/LightModule.cs:86-129` | pose math: +X aim, full-matrix position, per-instance lights, switch gates |
| `decomp/KSA.Rendering.Lighting/Light.cs:10-12,54-79,97-101` | angle swap/clamp constants, cos packing |
| `Content/Core/Shaders/Lighting/LightPrePass.comp:274-297` | THE falloff formulas |
| `Content/Core/Shaders/Lighting/LightData.glsl:19-30` | GPU light struct (cosine angles, type sentinel) |
| `decomp/KSA.Rendering.Lighting/ClusteredLightSystem.cs:669,760` | range ≤ 0 / intensity ≤ 0 culled CPU-side (the shader never rejects them) |
| `decomp/KSA.Rendering.Lighting/LightUtils.cs:65-109` | KSA's own debug draw (12 rays, tan rims — see §1.6 deviation) |
| `Brutal.Numerics/Color.cs:93` | Gray = (0.5, 0.5, 0.5) |
| `Content/Core/CoreElectricalAGameData.xml:97-121`, `CoreCommandAGameData.xml:16-39`, `CoreIVASpaceAGameData.xml:7-16` | all shipped lights (§1.2 census) |

**flexo:** every anchor is inlined above; the load-bearing ones — `types.ts:156-197`
(PartCollider/IvaSeat templates), `partXmlSerializer.ts:136-345` (GameData emission + grouping),
`partXmlParser.ts:504-527,744-779,837-887` (light parse, SPD merge, allow-lists),
`modExport.ts:222-303` (variant machinery), `editorStore.ts:283-308` (undo invariant),
`EditorScene.ts:250-334,338-379,546-602,774-827,889-953,1177-1400` (selection/gizmo/reconcile),
`coords.ts:27-152` (EULER_ORDER + collider frame math), `SelectionManager.ts:4-96`,
`IvaSeatObject.ts` / `ColliderObject.ts` / `ConnectorObject.ts` (marker anatomy),
`numberDraft.ts:46-150` + `PreciseNumberInput.tsx:26-40` (numeric inputs),
`layerStore.ts` + `layerStore.test.ts:75,94` (lock-prune contract),
`settingsStore.ts:44-51` (persisted settings pattern), `ViewButton.tsx:96-105` (visibility UI).
