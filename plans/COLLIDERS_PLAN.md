# Colliders — authoring KSA part collision volumes in flexo

> **Status:** 📋 PLAN (not implemented). Research complete and verified against KSA build
> **2026.7.9.5018** (`ksa-game-assemblies/current/decomp` + `Content/Core`) and the real GLB
> meshes in `flexo-private-assets/assets/Meshes`.
>
> **Goal:** let a flexo user author the collision volume of a Part — the coarse shapes physics
> uses instead of the visual mesh — see it in the 3D workspace, fit it to the model with one
> click, and export it as KSA-legal `<Collider>` game data.

---

## 0. The headline correction: KSA has no collider *meshes*

The premise going in was "a collider is a low-fidelity mesh that approximates the visual model."
**That is not how KSA parts work.** KSA's part collision volume is a list of **analytic Bepu
primitives** — box, sphere, cylinder, capsule — and nothing else. There is no convex hull, no
triangle-soup collider, no "collision mesh" asset for parts.

Verified: `ColliderModule.Template` (`decomp/KSA/ColliderModule.cs:11-27`) accepts exactly four
child element types, and each maps 1:1 onto a Bepu shape:

| XML | C# template | Bepu shape |
| --- | --- | --- |
| `<Box>` | `BoxColliderTemplate.cs` | `BepuPhysics.Collidables.Box` |
| `<Sphere>` | `SphereColliderTemplate.cs` | `Sphere` |
| `<Cylinder>` | `CylinderColliderTemplate.cs` | `Cylinder` |
| `<Capsule>` | `CapsuleColliderTemplate.cs` | `Capsule` |

A grep of the entire shipped `Content/` tree finds **zero** mesh/hull colliders. (Triangle-mesh
collision exists only for *terrain* — `BepuHandles.CreateTerrainPatch` builds a `BigCompound` of
`Triangle`s — which is engine-internal, not authorable part data.)

**This makes the feature simpler than expected, not harder.** The user's mental model still
holds — you approximate the outer envelope of the visual model with a handful of cheap shapes —
you just do it with primitives instead of a decimated mesh. That is a job flexo is well suited to:
place a few boxes/cylinders in the 3D workspace, snap them to mesh bounds, done.

---

## 1. Game contract — how KSA colliders actually work

Every claim below cites the decompiled source and/or shipped asset evidence. This section is the
input for the new `scope/colliders.md`.

### 1.1 The XML schema

`<Collider>` is a **Part component** (`ModuleBase.TemplateDataBase`, `[XmlType(TypeName="Collider")]`)
holding a list of shapes. Real, shipped example — `CoreCommandA_Prefab_MediumCapsuleVariantA`
(`Content/Core/CoreCommandAGameData.xml`), a cylinder hull plus a sphere for the heat-shield end:

```xml
<Collider Id="Collider1">
  <Cylinder Id="CylinderCollider1">
    <LocationAsmb X="0" Y="0" Z="0" />
    <Collider2Asmb X="0" Y="0" Z="1.57" />
    <LengthY M="2" />
    <Radius M="0.5" />
  </Cylinder>
  <Sphere Id="SphereCollider1">
    <LocationAsmb X="-0.11" Y="0" Z="0" />
    <Collider2Asmb X="0" Y="0" Z="0" />
    <Radius M="0.89" />
  </Sphere>
</Collider>
```

Field-by-field (`ColliderTemplate.cs` + the four subclasses):

| Element / attr | Type | Meaning |
| --- | --- | --- |
| `<Collider Id>` | `TemplateDataBase.Id` (`[XmlAttribute]`) | Component id. **Shares the id namespace that `<FeedsFrom Container="…">` resolves against** (`PartTemplate.cs:551` scans every `Components[].Id`) — must not equal a `<Tank Id>` on the same owner. |
| `<Box\|Sphere\|Cylinder\|Capsule Id>` | `SerializedId.Id` | Per-shape id. Not registered in `ModLibrary`; Core reuses `"CylinderCollider1"` across dozens of parts, so it need not be globally unique. |
| `<LocationAsmb X Y Z>` | `Vector3Reference` (doubles, default 0) | Shape centre, in the **owner's assembly frame**, meters. |
| `<Collider2Asmb X Y Z>` | `Vector3Reference` | Shape orientation, **Euler XYZ radians** — built with `QuaternionEx.CreateFromXyzRadians` (`ColliderTemplate.Create`), the *identical* function `TransformReference.RotationValue` uses for placement `<Rotation>`. ⇒ flexo's existing `coords.ts` `EULER_ORDER = 'ZYX'` mapping applies verbatim. |
| `<LengthX\|LengthY\|LengthZ M>` | `DistanceReference` | Box full extents along local X/Y/Z. |
| `<Radius M>` | `DistanceReference` | Sphere / cylinder / capsule radius. |
| `<LengthY M>` | `DistanceReference` | Cylinder / capsule axial length (see §1.2). |

⚠️ **`DistanceReference` defaults to `NaN`, not 0** (`DistanceReference.cs:68-77`: `SetValue()`
leaves `_value = double.NaN` when every unit attribute is absent, and the implicit `double`
conversion returns it). An omitted `<Radius>` therefore produces `new Sphere(NaN)` and poisons the
physics shape. **flexo must ALWAYS emit every dimension element** — no omit-at-default. By
contrast `LocationAsmb` / `Collider2Asmb` are `Vector3Reference`s initialised to zero, so those
*are* safe to omit at default (Core writes them anyway).

### 1.2 Bepu shape semantics — verified against real meshes

Bepu isn't in the decomp, so the constructor semantics were confirmed against shipped collider
data vs. the actual GLB mesh bounds (POSITION accessor min/max in
`flexo-private-assets/assets/Meshes/*.glb`):

| Shape | Constructor | Semantics | Evidence |
| --- | --- | --- | --- |
| `Box(LengthX, LengthY, LengthZ)` | `new Box(w,h,l)` | **FULL extents** on local X/Y/Z | `CoreElectricalA_Subpart_SolarPanelA_CellA`: mesh AABB `0.80000 × 0.60000 × 0.02500`; collider Box `0.79467 × 0.59602 × 0.02531`. A half-extent reading would make it a 5 cm-thick, 1.6 m panel. |
| `Cylinder(Radius, LengthY)` | `new Cylinder(r,l)` | **Y-axis aligned**, FULL length | `CoreLandingA_Subpart_MediumFootA`: mesh AABB `0.33671 × …`; collider `<LengthY M="0.34">`. And `CoreCommandA`'s capsule sets `Collider2Asmb Z="1.57"` purely to lay a cylinder along **X** — only necessary if the default axis is Y. |
| `Capsule(Radius, LengthY)` | `new Capsule(r,l)` | **Y-axis aligned**; `LengthY` is the *cylindrical segment*, hemispherical caps add `Radius` at each end ⇒ tip-to-tip = `LengthY + 2·Radius` | Bepu v2 convention. **No Core part uses `<Capsule>`** (0 occurrences), so this is the one unverified-in-data semantic — flag it for in-game A/B. |
| `Sphere(Radius)` | — | radius | — |

Shape usage across all of `Content/`: **Cylinder 66 · Box 29 · Sphere 21 · Capsule 0** (89
`<Collider>` components total). Cylinder is the workhorse; make it the default shape.

### 1.3 Two authoring scopes — and their equivalence

`Components` is mapped by element name onto **every `PartTemplate` subclass** via
`XmlHelper.AttributeOverrides` (`XmlHelper.cs:33-43`). `PartGameDataReference : PartTemplate`,
`SubPartGameDataReference : PartGameDataReference`, and `SubPartTemplate : PartTemplate`. So
`<Collider>` is legal in **four** places:

1. Geometry `<Part>` (`Core*Assets.xml`)
2. Geometry `<SubPart>` **template** (`Core*Assets.xml`) — e.g. `CoreElectricalAAssets.xml:200,279`
3. `<PartGameData>` (`Core*GameData.xml`) — the common case
4. `<SubPartGameData>` — e.g. `CoreLandingA_Subpart_MediumFootA`

**1 and 3 are functionally identical; so are 2 and 4.** `PartGameDataReference.OnDataLoad` finds
the already-registered template of the same id and calls `ApplyGameData(this)`, whose last act is
`Components.AddRange(gameData.Components)` (`PartTemplate.cs:312`) — an **additive merge, no
dedupe**. ⇒ **flexo can normalise every collider into the GameData document** and be
byte-equivalent in meaning. This is what closes the long-open gap **E** (geometry-template
`<Collider>` drop) without needing raw `<Part>`-child passthrough.

What is **NOT** possible: a per-placement collider. A placement is a `PartInstance`, whose
`Components` list is `ModuleBase.SaveDataBase` (save-game state), not `TemplateDataBase`
(`PartInstance.cs` + `XmlHelper.cs:31`). A SubPart-owned collider therefore applies to **every
placement of that template**, in the **template's local frame**.

### 1.4 Runtime — what colliders actually do

| Behaviour | Source | Consequence for authoring |
| --- | --- | --- |
| A vehicle's collision body is a Bepu `BigCompound` of **every** `ColliderModule` in the vehicle, positioned relative to the centre of mass | `Vehicle.cs:1508-1521`, `CreateColliderCompound` `:1633` | A part with no collider contributes **nothing**: it passes through terrain and other vehicles. |
| **Fallback when a vehicle has zero colliders**: one `Box` from the *render* bounds | `Vehicle.cs:1523-1556`, `BepuHandles.Create` | A single collider-less part still collides via a crude box; add one collider anywhere in the vehicle and every collider-less part becomes non-collidable. |
| `_props.BoundingBoxAsmb` / `GeometricCenterAsmb` / `BoundingSphereRadiusBody` are derived **from the collider compound** when colliders exist | `Vehicle.cs:1514-1520` | An oversized collider inflates the vehicle bounding box (and the bounding sphere used by physics-radius logic). Bloat has a cost beyond "invisible wall". |
| A collider is positioned as `PositionPartAsmb.Transform(Parent.Asmb2VehicleAsmb) + Parent.PositionVehicleAsmb` | `ColliderModule.cs:38-42` | Rotation of the owning subpart applies; **scale never does** (see below). |
| **Animated subparts refresh their colliders**: `KeyframeAnimationModule.ApplyAnimationTransforms` sets `NeedsColliderUpdate` on every `ColliderModule` in the subtree; `ConstraintSim.UpdateShape` rebuilds the compound | `KeyframeAnimationModule.cs:359-364`, `ConstraintSim.cs:226-253` | **A SubPart-owned collider follows joint animation** — unlike connectors, which cannot animate (see [scope/connectors-coordinates-iva.md]). This is how landing legs get a deployed foot collider. |
| A contact's sub-shape index maps back to the owning `Part` | `VehicleUpdateState.TryGetContactPart:438` | Contact attribution (damage, sound, docking) depends on *which* part owns the touching collider. |
| **Docking requires collider contact**: `TryGetContactDockingPort` resolves the contacted collider → its `Part` → a `DockingPort` module in `part.FullPart.SubtreeModules` | `ConstraintSim.cs:762, 861-878` | ⚠️ **A docking-port part with no collider never docks.** Core's `CoreCouplingA` port carries a `<Cylinder LengthY 0.4 Radius 0.5>` puck at the docking face for exactly this reason. |
| Each vehicle is ONE dynamic body; a Bepu compound never self-collides. Kinematic/static pairs are filtered out | `NarrowPhaseCallbacks.cs:22-47` | **Overlapping colliders within a part are free.** Overlap is the *normal* way to build a composite shape — no need to seam them. |
| Colliders contribute **zero mass** (`PartTemplate.CalculateMass` only sums `InertMasses` + tanks + grain) | `PartTemplate.cs:622-648` | Collider size never affects mass or inertia. Mass stays a `<CustomMass>` / mass-primitive concern. |

### 1.5 The gotcha list (author these into the UI)

1. **Placement scale is ignored.** `ColliderModule` composes only position + rotation
   (`ColliderModule.cs:38-42`); neither the shape dimensions nor the local offset are scaled by
   the owning subpart's `Scale`. A SubPart-owned collider on a placement scaled 2× will be half
   the visual size in-game. ⇒ flexo must **warn** on non-unit placement scale.
2. **Missing dimension ⇒ NaN shape** (§1.1). Always emit.
3. **`<Collider Id>` shares the feed-container namespace** (§1.1). Never emit a collider component
   id equal to a `<Tank Id>` on the same owner.
4. **Export-variant inheritance hole (pre-existing latent bug).** `buildExportVariantMap`
   (`src/ksa/modExport.ts:183`) redeclares a *fresh* `<SubPart Id>` when a built-in template
   carries flexo GameData. The variant references the built-in mesh/material but **does not
   inherit the built-in template's own `<Collider>`** (authored on the geometry `<SubPart>` in
   Core's Assets XML). Today that's invisible because flexo never sees those colliders; once
   modelled, variants must copy them forward. Affects `CoreElectricalA_Subpart_SolarPanel[A|B]_CellA`.
5. **Core's colliders are deliberately coarse.** 76 of 132 shipped `<PartGameData>` entries have a
   collider; 56 (fairings, interstages, nosecones) have none. Where they exist they are often much
   looser than the mesh (the medium capsule wraps a ~2 m hull in a `r=0.5` cylinder + `r=0.89`
   sphere). ⇒ flexo's fitting tools should aim for "good enough envelope", not a tight hull, and
   "no collider" must be a **warning, not an error**.

### 1.6 The exemplar to build against: `CoreLandingA_Prefab_MediumLandingLegA`

The one Core part that uses both scopes — the reference case for the whole feature:

```
PartGameData  CoreLandingA_Prefab_MediumLandingLegA
  ├ KeyframeAnimationModule  LandingLegAnimation
  └ Collider Collider1
      └ Cylinder  LocationAsmb(-0.5501, 0.0013, 0.0464)
                  Collider2Asmb(3.0777, 0.008, 1.5705)   LengthY 2.1922  Radius 0.4361
SubPartGameData  CoreLandingA_Subpart_MediumFootA
  └ Collider Collider1
      └ Cylinder  LocationAsmb(0,0,0) Collider2Asmb(0,0,0) LengthY 0.34  Radius 0.5
```

The part-level cylinder is the static strut housing (rotated to lie along the leg). The
SubPart-level puck rides the animated foot. Both must round-trip, and — long term — both must be
editable in the 3D workspace.

---

## 2. Where flexo stands today

| Layer | Today | Verdict |
| --- | --- | --- |
| `src/ksa/types.ts` | No collider type. `<Collider>` is only mentioned as the canonical example of `RawXmlNode` passthrough (`:906`) | ❌ not modelled |
| `src/ksa/partXmlParser.ts` | `<Collider>` is absent from `KNOWN_PART_GAMEDATA_CHILDREN` (`:676`) and `KNOWN_SUBPART_GAMEDATA_CHILDREN` (`:703`) ⇒ swept into `unknownChildren` by `captureUnknownChildren` (`:733`) | 🟡 preserved, opaque |
| `src/ksa/partXmlSerializer.ts` | Re-emits the raw node last (`:265`, `:305`) | 🟡 preserved, opaque |
| `src/ksa/partCatalog.ts` / `catalog.ts` | Geometry `<Part>` / `<SubPart>` children are **not** captured | 🔴 **gap E** — importing `CoreElectricalA_Prefab_BayFuelcellSmall`, `…_InlineBatteryBankB`, or either solar cell and re-exporting **drops the collider** |
| `src/state/projectCodec.ts` | `uc?: RawXmlNode[]` carries it (`:280`, `:805`) | 🟡 |
| 3D / UI | Nothing. No visual, no editor | ❌ |

Net: flexo can *carry* a collider it imported from `<PartGameData>`, cannot *see* or *edit* one,
and *loses* the ones authored on geometry templates. A flexo-authored Part has **no collision
volume at all** unless the user hand-edits the exported XML.

---

## 3. Design

### 3.1 Document model — colliders are first-class 3D entities

Colliders are placed, oriented, dimensioned things you want to click, nudge, copy, hide and align
against the mesh. So they follow the **connector/kitten pattern** (a flat top-level list on
`EditingPart` pinned to a built-in layer), **not** the tank/light pattern (numbers buried in
`gameData`). That buys selection, the gizmo, multi-select, copy/paste, the Assets list, layer
visibility/lock/opacity and undo with almost no new machinery.

```ts
// src/ksa/types.ts

/** KSA collider primitive — the four Bepu shapes `ColliderModule.Template` accepts. */
export type ColliderShape = 'Box' | 'Sphere' | 'Cylinder' | 'Capsule'

/** All shapes, in UI order (Cylinder first — Core uses it 66× vs Box 29 / Sphere 21 / Capsule 0). */
export const COLLIDER_SHAPES: readonly ColliderShape[] = ['Cylinder', 'Box', 'Sphere', 'Capsule']

/**
 * One collision primitive. `Transform` is reused with a deliberate reinterpretation:
 *  - position → <LocationAsmb X Y Z>            (owner-frame metres, direct)
 *  - rotation → <Collider2Asmb X Y Z>           (Euler XYZ radians, same convention as
 *                                                placement <Rotation>; see coords.ts)
 *  - scale    → the collider's OUTER SIZE IN METRES, not a multiplier (see colliderSize.ts)
 *
 * Storing size in `scale` is what makes every existing transform path correct for free: the
 * scene object holds NORMALISED (unit-box) wire geometry, so `group.scale === size`, the scale
 * gizmo natively edits dimensions (exactly how ContainerLayer drives ReferenceContainer.size),
 * and every MULTIPLICATIVE bulk op (`scaleEverything`, bulk gizmo scale) is semantically right
 * for both a mesh scale factor and a collider metre size. KSA colliders have no scale field.
 */
export interface PartCollider extends Transform {
  /** Export/document id, e.g. "_collider1". Also the emitted shape `Id`. */
  id: string
  shape: ColliderShape
  /**
   * `null` ⇒ part-level (emitted under `<PartGameData>`, transform in the Part assembly frame).
   * Otherwise a `subPartTemplateId` ⇒ emitted under `<SubPartGameData Id>`, transform in that
   * SubPart TEMPLATE's local frame, applying to EVERY placement of it (KSA has no per-instance
   * collider — see §1.3) and following joint animation (§1.4).
   */
  ownerTemplateId: string | null
  /** Always {@link COLLIDER_LAYER_ID}; present for parity with the other layered entities. */
  layerId: string
}
```

`EditingPart` gains `colliders: PartCollider[]`; `createEmptyPart()` gains `colliders: []` and a
fourth built-in layer. Adding a key to `EditingPart` trips the sanctioned boot purge
(`snapshotMatchesModel` → `hasAllKeys`, `projectStore.ts:175`) — per AGENTS.md, **no migration**:
old snapshots are discarded.

```ts
export const COLLIDER_LAYER_ID = 'colliders'
export function createColliderLayer(): Layer { return { id: COLLIDER_LAYER_ID, name: 'Colliders' } }
export const BUILT_IN_LAYER_IDS = [DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID, COLLIDER_LAYER_ID, KITTEN_LAYER_ID]
```

### 3.2 size ↔ KSA dimensions (the one piece of new math)

New pure module `src/ksa/colliderSize.ts` — the single place that knows the mapping. Sizes are
**outer bounding dimensions in metres**; local Y is the cylinder/capsule axis (§1.2).

| Shape | `size` → XML | XML → `size` | Constraint (`normalizeColliderSize`) |
| --- | --- | --- | --- |
| Box | `LengthX=x`, `LengthY=y`, `LengthZ=z` | `(LengthX, LengthY, LengthZ)` | free |
| Sphere | `Radius = x/2` | `(2R, 2R, 2R)` | uniform: `x=y=z=max(x,y,z)` |
| Cylinder | `LengthY = y`, `Radius = x/2` | `(2R, LengthY, 2R)` | `x = z = max(x,z)` |
| Capsule | `LengthY = max(0, y − x)`, `Radius = x/2` | `(2R, LengthY + 2R, 2R)` | `x = z = max(x,z)`; `y = max(y, x)` (a capsule shorter than its diameter *is* a sphere) |

`normalizeColliderSize(shape, size)` mirrors `containerStore.normalizeSize` (`:89`) and is applied
by **both** the numeric fields and the scale gizmo, so a non-uniform drag snaps back. A minimum
size floor (`1e-4 m`) prevents degenerate/NaN Bepu shapes.

### 3.3 3D representation

New `src/three/ColliderObject.ts`, modelled on `ConnectorObject.ts` + `ContainerLayer`'s graphics:

- A `THREE.Group` carrying `userData.selectable = { kind: 'collider', id }`.
- A fat-line wireframe (`LineSegments2` + `LineMaterial`, screen-space width so non-uniform scale
  doesn't skew it) plus an optional very-low-alpha solid fill for readability. Amber
  (`#f59e0b`) default, bright green when selected (matching connectors' `COLOR_SELECTED`).
- Geometry is **normalised** into the unit box `[-0.5, 0.5]³` and the group's `scale` is the size
  in metres. For box/sphere/cylinder the normalised outline is size-independent (build once per
  shape). For **capsule** it depends on the radius/length ratio, so it is rebuilt when
  `size.x / size.y` changes — the same "swap in fresh edge geometry" move `ContainerLayer`
  already makes when `segments` changes (`ContainerLayer.ts:270-277`).
- **Refactor for reuse:** lift `ring` / `cylinderEdges` / `sphereEdges` / `edgesGeometry` /
  `outlineGeometry` out of `ContainerLayer.ts` (`:55-178`) into a shared
  `src/three/wireShapes.ts`, add `capsuleEdges`, and have `ContainerLayer` import from it. No
  behaviour change for containers.

Owner frames — `ColliderObject` is placed exactly as KSA composes it (`ColliderModule.cs:38-42`):

- `ownerTemplateId === null`: `applyPlacement(group, collider)`. Direct, identical to a connector.
- `ownerTemplateId === t`: **one visual per placement of `t`**, with (note: **no scale anywhere**)

  ```
  worldPos = placement.position + R(placement.rotation) · collider.position
  worldRot = R(placement.rotation) · R(collider.rotation)
  worldSize = collider.scale                       // placement scale deliberately ignored
  ```

  Write-back inverts it against the placement the gizmo is attached to:

  ```
  collider.position = R(placement.rotation)⁻¹ · (worldPos − placement.position)
  collider.rotation = eulerXYZ( R(placement.rotation)⁻¹ · worldRot )
  ```

  Both directions live in `src/three/coords.ts` as `colliderWorld()` / `colliderLocalFromWorld()`
  so the frame math stays in the one sanctioned place.

### 3.4 Selection, gizmo, inspector

Extend the existing three-kind machinery to four. Kittens are the closest template — copy that
shape exactly:

| Piece | Change |
| --- | --- |
| `SelectionManager.Selectable.kind` (`:5`) | `\| 'collider'` |
| `editorStore.SelectableKind` (`:1282`) | `\| 'collider'` |
| new atoms | `$selectedColliderIndices` / `$selectedColliderIndex` (mirroring `:135-139`) |
| actions | `addCollider(shape)`, `selectCollider`, `setSelectedColliders`, `updateColliderTransform(s)`, `setColliderShape`, `setColliderOwner`, `setColliderSize` |
| existing actions to extend | `clearSelection` `:1275`, `setSelection` `:1301`, `toggleEntity` `:1316`, `selectedTransformRefs` `:1353`, `updateSelectedTransforms` `:1472`, `updateSelectedTransform` `:1545`, `removeSelected` `:915`, `duplicateSelected` `:992`, `copySelected`/`pasteClipboard` `:1086`/`:1111` (+ `PartClipboard.colliders`), `scaleEverything` `:1518` |
| `EditorScene` | `colliderObjects: Map<string, ColliderObject[]>` (array — one per instance for subpart-owned), `reconcileColliders(part)` next to `reconcileConnectors` (`:600`), click-select branch (`:197`), selected-object collection (`:633`), gizmo lock/attach (`:722-750`) |
| `TransformGizmo` | unchanged — the group's `scale` *is* the size, so scale mode already edits dimensions. `handleGizmoChange` (`:779`) routes through `updateSelectedTransform`, which for a collider applies `normalizeColliderSize` before writing. |
| `TransformInspector` | new `ColliderHeader` (mirroring `ConnectorHeader` `:328`): shape `Select`, owner `Select` ("Part (assembly)" + every distinct placed template id), and shape-appropriate size fields. Relabel the third numeric group **"Size (m)"** with per-shape labels (Box: Length X/Y/Z · Sphere: Diameter · Cylinder/Capsule: Diameter + Height) instead of the generic "Scale". |
| `AssetsList` | `Kind` (`:45`) + `PREFIX` (`:68`) gain `collider` → `col`; a `COLLIDER_LAYER_ID` section branch alongside the connector/kitten ones (`:114-140`); exclude it from the move-to-layer target list (`:336`) like the other built-ins |
| `AddButton` | **Add → Collider ▸** `Cylinder / Box / Sphere / Capsule`, then a separator and **Fit to selection ▸** the same four (§3.6) |

Changing the owner **converts the transform** through the first placement of the new owner so the
collider doesn't visually jump.

### 3.5 XML emission

All colliders are normalised into the GameData document (§1.3 proves equivalence), so
`serializePart` is untouched. In `serializeGameData` (`partXmlSerializer.ts:131`):

- Group `part.colliders` by `ownerTemplateId`.
- `null` group → one `<Collider Id="…">` appended to `<PartGameData>`, before the passthrough.
- Each non-null group → its shapes appended to that template's `<SubPartGameData>` block
  (`:286-307`), which already routes the id through `templateRemap` — so the NotIVA/variant
  remap works for free.
- Component id: a single deterministic `<Collider Id="flexoColliders">` per owner, validated
  against that owner's `<Tank Id>`s (gotcha 3). Shape `Id` = the collider's document id.
- Always emit both `<LocationAsmb>` and `<Collider2Asmb>` (Core does; harmless) and **always**
  emit every dimension via the existing `buildDistanceElement` (`:425`) — never omit (§1.1).
- Numbers through `formatG6`, as everywhere else.

Parsing, four sites, all feeding the same typed model:

| Site | File | Note |
| --- | --- | --- |
| `<PartGameData><Collider>` | `partXmlParser.parseGameDataElement:380` | add `'Collider'` to `KNOWN_PART_GAMEDATA_CHILDREN:676` **in the same change** (else it double-emits: once typed, once as passthrough) |
| `<SubPartGameData><Collider>` | `partXmlParser.subPartGameDataFromRoot:586` | add to `KNOWN_SUBPART_GAMEDATA_CHILDREN:703` |
| geometry `<Part><Collider>` | `partCatalog.parsePartsFile` | **closes gap E** — read into the catalog Part's colliders, re-emitted into `<PartGameData>` |
| geometry `<SubPart><Collider>` | `catalog.ts` | **closes gap E** — stored on `CatalogSubPart.colliders`; consumed by the variant fix (gotcha 4) |

A shared `collidersFromElement(el, owner)` reads all four; `readDistanceM` (`:831`) and
`readVec3Attrs` (`:802`) already exist. Collider ids are regenerated on import/paste like
connector ids (they are not cross-referenced by anything, so no `idRemap` entry is needed — but
say so explicitly in the code comment so the next reader doesn't wonder).

**Placement-only import stays clean:** flexo does **not** copy a built-in template's collider into
`subPartGameData` when you merely place that SubPart. No `<SubPartGameData>` is emitted, the
placement references the built-in id directly, and the built-in collider applies in-game for free.
The catalog copy is used only when a variant is forced (gotcha 4).

### 3.6 Fitting tools — the "practical" half

Nobody wants to type `LengthY`. New pure module `src/ksa/colliderFit.ts` taking world-space sample
points + a frame quaternion and returning a `PartCollider` transform. Extract
`ContainerLayer.collectWorldPoints` (`:349`) into a shared `src/three/samplePoints.ts` (bbox
corners or per-vertex, the same fast/accurate choice containers already offer) and reuse
`computeSelectionBounds` (`src/measure/bounds.ts:30`) for the oriented AABB.

Given points `P` and frame `Q` (the last-selected placement's world rotation, or identity for
world-aligned), work in `Q⁻¹` space:

- **Box** — `size` = AABB extents, `position` = `Q·centre`, `rotation` = `Q`.
- **Sphere** — `position` = AABB centre, `size` = `(2r,2r,2r)` with `r = max‖p − centre‖`,
  `rotation` = 0.
- **Cylinder** — axis `a` = the longest AABB axis; `length` = extent along `a`; `r` = max radial
  distance from the axis line in the perpendicular plane; `rotation` = `Q · Q(Y→a)`
  (identity for Y, `RotZ(-90°)` for X, `RotX(+90°)` for Z — sign is irrelevant, the axis is a
  line); `size = (2r, length, 2r)`.
- **Capsule** — as Cylinder, then `size.y = length` (tip-to-tip) clamped `≥ size.x`.

Entry points:

1. **Add → Collider ▸ Fit to selection ▸ \<shape\>** — fits the selected placements; with nothing
   selected, fits the whole part.
2. **"Fit to…" in the collider inspector** — refits the *existing* collider (keeps its id/owner) to
   the current selection, so you can iterate.
3. **Owner inference** — fitting against exactly one placement offers "own it by that SubPart
   template" (which is what an animated leg needs), pre-converted into template-local space.

A tunable **inset/margin** (default 0, ±%) covers Core's habit of shaving ~0.7% off the mesh AABB.

### 3.7 Validation

New pure `src/ksa/colliderValidation.ts`, same shape as `engineValidation.ts` (`EngineIssue`
`:31`, `validateEngines` `:169`) so `ExportButton` (`:88-90`) can render it with the existing
block/warn treatment.

| Severity | Rule | Why (source) |
| --- | --- | --- |
| **block** | any dimension `≤ 0` or non-finite | emits a degenerate/NaN Bepu shape (§1.1) |
| **block** | a `<Collider Id>` equal to a `<Tank Id>` on the same owner | `<FeedsFrom Container>` could resolve to the collider (`PartTemplate.cs:551`) |
| warn | the part has **no collider at all** | won't collide; vehicle bounds fall back to render bounds (`Vehicle.cs:1523`) |
| warn | `gameData.dockingPort` set but no collider owned by the part/its subparts | **docking never triggers** (`ConstraintSim.cs:861`) |
| warn | collider owned by a template with a non-unit-scale placement | KSA ignores placement scale (gotcha 1) |
| warn | collider owned by a template that is no longer placed | dead data |
| warn | capsule `size.y < size.x` | degenerates to a sphere |
| warn | collider bounds far exceed the part's render bounds | invisible-wall / inflated vehicle bounding box |
| warn | more than ~32 colliders | compound rebuild cost per animation tick |

### 3.8 Coverage / QA readout (the "how good is my approximation" answer)

New pure `pointInCollider(point, collider)` in `src/measure/colliderCoverage.ts`, mirroring
`containment.evaluateViolations` (`src/measure/containment.ts:31`) — take the point into the
collider's local frame, compare against half-extents / radius (capsule = distance to its segment).

A **Check coverage** button in the collider panel then reports, from the shared sampler:

- `% of mesh sample points inside at least one collider` — gaps mean things clip through.
- `collider volume ÷ mesh AABB volume` — bloat means invisible walls.
- Uncovered sample points rendered as small dots so you can see *where* the hole is.

Deliberately a manual, on-demand check (like the container warn pass), not a live per-frame cost.

---

## 4. Phases

Each phase is independently shippable and independently verifiable.

### Phase 1 — Contract & round-trip (no UI) · closes gap E

The risky part; do it first and alone.

1. `src/ksa/types.ts` — `ColliderShape`, `COLLIDER_SHAPES`, `PartCollider`,
   `EditingPart.colliders`, `COLLIDER_LAYER_ID` + `createColliderLayer` + `BUILT_IN_LAYER_IDS`,
   `createEmptyPart`.
2. `src/ksa/colliderSize.ts` — the size ↔ dimension mapping + `normalizeColliderSize`.
3. `src/ksa/partXmlParser.ts` — `collidersFromElement`; wire into `parseGameDataElement` and
   `subPartGameDataFromRoot`; add `Collider` to **both** `KNOWN_*_GAMEDATA_CHILDREN` sets.
4. `src/ksa/partXmlSerializer.ts` — `buildColliderElement` + the owner grouping in
   `serializeGameData`.
5. `src/ksa/catalog.ts` + `partCatalog.ts` — read geometry-template `<Collider>` (gap E);
   `CatalogSubPart.colliders`, catalog Part colliders.
6. `src/state/partImport.ts` / `editorStore.addPart` / `applyImportedGameData` — bring an imported
   Part's colliders into the document with fresh ids on the Colliders layer.
7. `src/ksa/modExport.ts` — colliders count toward `isSubPartGameDataEmpty` /
   `hasSubPartGameData` (`:165`) so variants are forced; **copy a built-in template's catalog
   colliders onto its export variant** (gotcha 4).
8. `src/state/projectCodec.ts` — `CCollider` (`i/s/o/p/r/z`) + `cl?: CCollider[]` on
   `CompactProject`; bump `PROJECT_EXPORT_VERSION`.
9. `src/state/projectTransfer.ts` — merge colliders on paste/import with id remap.
10. Docs/scope (§5).

**Tests** (`partXmlParser.test.ts`, `partXmlSerializer` round-trip, `partCatalog.test.ts`,
`projectCodec.test.ts`, new `colliderSize.test.ts`):

- Parse the `CoreCommandA` cylinder+sphere block → 2 colliders with the exact expected sizes;
  re-serialize → semantically identical XML.
- The landing-leg fixture pattern: part-level + subpart-level colliders land on the right owners.
- **Vendored fixtures**: `CoreElectricalAAssets.xml` (already vendored) carries the two
  geometry-`<SubPart>` `<Box>` colliders — assert they now parse and re-emit under
  `<SubPartGameData>` (gap E closed) and that the `partCatalog.test.ts:339`
  `unknownChildren === ['Collider']` assertions flip to "modelled".
- Size math: `Capsule` `LengthY + 2R` round-trip; `normalizeColliderSize` per shape.
- Missing `<Radius>` on input → a sane default with a console warning, and output **always**
  carries every dimension.
- Undo test in `editorStore.test.ts` for every new mutation (AGENTS.md undo invariant).

### Phase 2 — 3D authoring, part-level

1. `src/three/wireShapes.ts` (extracted from `ContainerLayer`) + `capsuleEdges`.
2. `src/three/ColliderObject.ts`.
3. `src/three/coords.ts` — `colliderWorld` / `colliderLocalFromWorld` (used by Phase 3, added here).
4. Selection/gizmo/store plumbing per §3.4 (part-level colliders fully editable;
   subpart-owned ones render at every instance but are **not** gizmo targets yet).
5. `AddButton` menu, `TransformInspector` `ColliderHeader`, `AssetsList` section.
6. `src/ksa/colliderFit.ts` + `src/three/samplePoints.ts` + the Fit entry points.
7. Minimal `colliderValidation.ts` (the block rules + "no collider" / docking-port warnings) wired
   into `ExportButton`.
8. Hotkeys: colliders participate in existing nudge/rotate/duplicate/delete (nothing new to add
   once they're in `selectedTransformRefs`).

**Verify:** project-local Playwright against `/flexo/` (per the browser-verification rule) —
add a cylinder, fit it to a tank, drag each gizmo mode, confirm the exported XML numbers match
what the inspector shows.

### Phase 3 — SubPart-owned colliders, fully editable

1. Per-instance visuals become gizmo targets; write-back through
   `colliderLocalFromWorld` against the attached instance's placement.
2. Owner switching in the inspector with frame conversion.
3. Non-unit-placement-scale warning surfaced inline (not just at export).
4. Animation preview: while the anim scrubber is posed, subpart-owned colliders follow the posed
   transform (they do in-game — `KeyframeAnimationModule.cs:359`), reusing the existing
   preview-pose lock so a drag can't write a posed transform back.

**Verify in-game:** build the landing-leg case (part strut collider + animated foot puck), export,
land on Luna, confirm the leg takes the load in the deployed pose.

### Phase 4 — QA readout

`src/measure/colliderCoverage.ts` + the Check-coverage UI (§3.8), plus the remaining warn rules.

---

## 5. Mandated docs / scope updates (AGENTS.md, non-negotiable)

| File | Change |
| --- | --- |
| **`scope/colliders.md`** (new) | The §1 contract: schema, Bepu semantics + the mesh-bounds evidence, the four authoring sites and their equivalence, the runtime table, the gotcha list, flexo module map |
| `scope/FULL_SCOPE.md` | New row in the integration map (`:151`) pointing at `colliders.md`; note gap **E** closed |
| `scope/part-and-subpart-xml.md` | "Known gap" banner (`:14-17`) and the 4939 gap-E entry (`:131-140`) → **CLOSED**; `<Collider>` moves out of the passthrough list |
| `scope/gamedata-modules.md` | `Collider` moves from "passthrough" to **modelled** in the `Components` list (`:92`) |
| `plans/FIX_CURRENT_GAPS_PLAN.md` | Row **E** (`:129`) → ✅ DONE, with the "normalise into GameData" solution recorded (no raw `<Part>`-child passthrough needed) |
| **`docs/colliders.md`** (new) | The flexo-internal view: model, size-in-`scale` decision, layer/selection, fitting tools, coverage check, limits |
| `AGENTS.md` | Link the new doc in the documentation list; a "Colliders" section next to Engines/Kittens |
| `docs/xml-io.md` | The always-emit-dimensions rule and the owner-grouping emission |
| `docs/editor-state.md` | The 4th selection kind + the new mutators' undo enrolment |
| `docs/3d-workspace.md` | `ColliderObject`, `wireShapes.ts`, the scale-gizmo-as-dimensions behaviour |
| `docs/layers.md` | The built-in Colliders layer |
| `src/ksa/__fixtures__/` | No re-sync needed (`CoreElectricalAAssets.xml` + `CoreFuelTankAGameData.xml` already carry collider data); the drift test is unaffected |

---

## 6. Deliberate limits

- **No convex-hull / mesh colliders** — KSA cannot represent them (§0). If a shape genuinely needs
  a hull, the answer is more primitives.
- **No per-placement colliders** — KSA cannot represent them (§1.3). A SubPart-owned collider
  applies to every instance of that template; the UI must say so.
- **Placement scale is not honoured** — matching the game (gotcha 1); flexo warns instead of
  silently compensating.
- **Capsule semantics unverified in shipped data** (§1.2, Core uses zero capsules). Ship Phase 1
  with the Bepu-convention reading and confirm in-game before advertising capsules.
- **Automatic decomposition** (feed it a mesh, get N optimal primitives) is out of scope. Fit is
  one primitive per invocation, driven by the user's selection — which is exactly how Core's own
  colliders were authored.
- **Mass is untouched.** Colliders contribute none (§1.4); mass stays a `<CustomMass>` concern.
