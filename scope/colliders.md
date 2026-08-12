# Scope — Colliders (part collision volumes)

> Integration surface for how flexo **reads** and **emits** a Part's collision volume — the
> coarse analytic shapes KSA's physics uses instead of the visual mesh. Read alongside
> [docs/colliders.md](../docs/colliders.md) (the flexo-internal view) and
> [part-and-subpart-xml.md](part-and-subpart-xml.md) (which owns the surrounding `<Part>` /
> `<PartGameData>` document structure).

**Baseline:** re-verified against KSA build **2026.8.19.5261** (`decomp/` + shipped `Content/Core`)
and the real GLB meshes in `flexo-private-assets/assets/Meshes`.
**Baseline status:** 🟡 **MODELED, one primitive short.** The four analytic shapes are fully modeled
(closing the 4939 geometry-template `<Collider>` gap **E**), but 5261 added a **fifth**,
`<ConvexHull>` — gap **S1**, see [What changed in 5261](#what-changed-in-5261).

## What changed in 5261

**Verdict: MISSING-CAPABILITY (gap S1).** Rev 5185 ("Added asset bundler support for convex hull
shapes"; "Added `MeshColliderTemplate` and `ConvexHullColliderTemplate`") broke the long-standing
"there are exactly four analytic primitives, and there are NO collider meshes" invariant this doc
records.

- **`ColliderModule.Template` gained a fifth element type:**
  `[XmlElement("ConvexHull", typeof(ConvexHullColliderTemplate))]`, alongside the existing
  `Box`/`Capsule`/`Cylinder`/`Sphere`. Same `List<ColliderTemplate> Colliders` — so `<ConvexHull>`
  is authorable anywhere the other four are, at both the part-level and SubPart-owned sites.
- **`MeshColliderTemplate`** (new, abstract in practice) extends `ColliderTemplate` with
  `[XmlElement("Mesh")] MeshReference Mesh` and `[XmlElement("Scale")] Vector3Reference? Scale`
  (`ScaleValue` defaults to `double3.One`). `OnDataLoad` throws when `Mesh.Id` is empty. It is
  **not directly authorable**: `ColliderModule` declares no `<Mesh>` element for it, and its
  `CreateShapeInto` throws `"Mesh collider … cannot be registered with Bepu yet"`.
- **`ConvexHullColliderTemplate`** extends it and is the authorable one. `EnsureBaseHull` feeds the
  mesh's scaled position span to `ConvexHullHelper.CreateShape` and **throws** at load if the mesh
  "has no volume. It needs to be a closed, non-degenerate solid."
- **`ColliderTemplate` gained `[XmlIgnore] public virtual double3 ShapeOffsetCollider => double3.Zero`,**
  and `Create` now places the collider at
  `LocationAsmb.ToDouble3() + ShapeOffsetCollider.Transform(collider2Asmb)` — i.e. offset by the
  hull's centroid. **For all four analytic primitives this is `double3.Zero`, so flexo's placement
  math is unchanged.** The shape-creation signature also changed
  (`CreateShapeInto(in ShapesUnlock unlock, double scale, …)`, plus a new `CreateScaledShape`),
  and the primitives now multiply their dimensions by that `scale` — but the part path always
  passes `1.0`; the scaled path is for ground clutter.
- **Who authors it:** only `Content/Core/GroundClutter/GenericRockAssets.xml` today (the rocks'
  collision hulls). No `<Part>`/`<PartGameData>` in Core uses one.

**flexo impact (gap S1, 📋 OPEN).** `ColliderShape` in `src/ksa/types.ts:127` is a four-member union
and `COLLIDER_SHAPES` a four-element list, so a part authoring `<ConvexHull>` parses to nothing and
the element is dropped on export — colliders are MODELED, so the `RawXmlNode` passthrough does not
cover them. Supporting it is real work rather than a field addition: it needs a mesh reference
(pointing at a SubPart mesh or a custom-asset GLB), a viewport representation that is not one of
the four analytic gizmos, and export-side validation that the referenced mesh is a closed solid —
because KSA **throws at load** if it is not. Per the no-migration rule the fix adds the fifth
member outright rather than gating it.

**5168:** schema INTACT, verdict **NONE**. `ColliderModule.cs`, `ColliderTemplate.cs` and the four
`Box`/`Sphere`/`Cylinder`/`CapsuleColliderTemplate.cs` classes _do_ appear in the `5117 → 5168`
decomp diff, but every hunk is **decompiler noise**: the Bepu DLLs were added to the snapshot
(`ksa-game-assemblies` commit `a1c9eda`), so the `//IL_xxxx: Unknown result type (might be due to
invalid IL or missing references)` comment blocks disappeared and `Shapes` now resolves to its
fully-qualified `BepuPhysics.Collidables.Shapes`. No field, `[XmlElement]`, `[XmlAttribute]` or
behaviour changed — `Collider2Asmb`, `LocationAsmb`, the `Transform.scale`-carries-size rule, the
four authoring sites, and the zero-collider fallback all stand. Still exactly four analytic
primitives; no `MeshColliderTemplate` appeared. Note rev 5157 added collider processing **to the
ground-clutter path** and "support for multiple collider primitives per mesh" — that is
`ClutterObjectTemplate`'s new `[XmlArray("Colliders")]`, which _reuses these same four template
classes_ but does not change the part-collider surface (see
[ground-clutter.md](ground-clutter.md#what-changed-in-5168)).

**5117:** schema INTACT — `ColliderModule.cs` and all four
`Box`/`Sphere`/`Cylinder`/`CapsuleColliderTemplate.cs` classes are absent from the
`5056 → 5117` decomp diff. Core's collider DATA moved again: rev 5078 deleted several
now-redundant placeholder `<Collider>` blocks from `CoreElectricalAGameData.xml` (a cylinder on
`InlineBatteryBankA`, boxes on `RadialBatteryA`/`RadialBatteryB`) after re-importing that art
set. Vendored fixtures re-synced; `catalog.test.ts` / `partCatalog.test.ts` still pass.
`AssetBundler.Collider` gained only prefixed warning text (`Console.Error` → `Console.WriteLine`)
for skipped non-cylinder / stretched collider primitives. Unrelated but worth noting for the
future: `NarrowPhaseCallbacks.cs` and the new `VehicleStructuralLimits.cs` add whole-vehicle
destruction by g-limit / dynamic pressure (rev 5115) — vehicle-level, with no part-template field.

**5056:** schema INTACT — no collider template class changed. Core's collider VALUES did move,
because rev 5025/5026 regenerated nine part files through the in-repo `GlbToXmlUtility`, which
writes 4 significant figures where the old external tool wrote 5–6 (e.g. the solar cell's `<Box>`
went `0.79467 × 0.59602 × 0.02531` → `0.7947 × 0.596 × 0.0253`). Vendored fixtures were re-synced
and the two collider assertions in `catalog.test.ts` / `partCatalog.test.ts` updated. rev 5026's
new `Content/Core/CoreFuelPortGameData.xml` authors a `<Collider><Sphere>` in the same form flexo
already models.

---

## Flexo modules

| Path                                         | Role                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/types.ts`                           | `ColliderShape`, `COLLIDER_SHAPES`, `PartCollider`, `EditingPart.colliders` (a collider sits on an ordinary editor layer — `LayerableKind`). |
| `src/ksa/colliderSize.ts`                    | **The only place that knows the size ↔ `<LengthX\|Y\|Z>`/`<Radius>` mapping** and the per-shape `normalizeColliderSize` constraints.         |
| `src/ksa/partXmlParser.ts`                   | `collidersFromElement` (serves all four authoring sites) + `subPartCollidersFromRoot`; `'Collider'` in both `KNOWN_*_GAMEDATA_CHILDREN`.     |
| `src/ksa/partXmlSerializer.ts`               | `buildColliderElement` + `collidersByOwner`; owner grouping inside `serializeGameDataXml`. `COLLIDER_COMPONENT_ID`.                          |
| `src/ksa/catalog.ts`                         | `CatalogSubPart.colliders` — geometry `<SubPart><Collider>`, used ONLY for the export-variant carry-forward.                                 |
| `src/ksa/partCatalog.ts`                     | `CatalogPart.colliders` — geometry `<Part><Collider>` + `<PartGameData><Collider>` + the `<SubPartGameData><Collider>` of placed templates.  |
| `src/ksa/modExport.ts`                       | `hasSubPartGameData` counts colliders (forces a variant); `ExportVariant.colliders`.                                                         |
| `src/ksa/assetsXmlSerializer.ts`             | Re-declares an inherited built-in collider on a `ReferenceSubPartPlan` (`INHERITED_COLLIDER_COMPONENT_ID`).                                  |
| `src/state/editorStore.ts`                   | `ImportedGameData.colliders`; fresh `_colliderN` ids on import.                                                                              |
| `src/state/projectCodec.ts` / `-Transfer.ts` | `CCollider` (`cl`) wire form; additive paste with fresh ids.                                                                                 |
| `src/three/ColliderObject.ts`                | Unit-normalised wireframe + fill; `group.scale` IS the size in meters.                                                                       |
| `src/three/wireShapes.ts`                    | Shared unit outlines (incl. the ratio-dependent capsule), also used by `ContainerLayer`.                                                     |
| `src/three/coords.ts`                        | `colliderWorld` / `colliderLocalFromWorld` — the owner-frame composition, mirroring `ColliderModule.cs:38-42`.                               |
| `src/ksa/colliderFit.ts`                     | Pure primitive fitting around sampled points (`src/three/samplePoints.ts`).                                                                  |
| `src/ksa/colliderValidation.ts`              | The block/warn rules, each citing the game-side member it mirrors.                                                                           |
| `src/measure/colliderCoverage.ts`            | `pointInCollider` (Bepu shape semantics again, as a containment test) + the gap/bloat readout.                                               |

---

## 1. KSA has no collider _meshes_

KSA's part collision volume is a list of **analytic Bepu primitives** — and nothing else.
There is no convex hull, no triangle-soup collider, no "collision mesh" asset for parts.

`ColliderModule.Template` (`decomp/KSA/ColliderModule.cs:11-27`) accepts exactly four child
element types, each mapping 1:1 onto a Bepu shape:

| XML          | C# template                   | Bepu shape                    |
| ------------ | ----------------------------- | ----------------------------- |
| `<Box>`      | `BoxColliderTemplate.cs`      | `BepuPhysics.Collidables.Box` |
| `<Sphere>`   | `SphereColliderTemplate.cs`   | `Sphere`                      |
| `<Cylinder>` | `CylinderColliderTemplate.cs` | `Cylinder`                    |
| `<Capsule>`  | `CapsuleColliderTemplate.cs`  | `Capsule`                     |

A grep of the whole shipped `Content/` tree finds **zero** mesh/hull colliders. Triangle-mesh
collision exists only for _terrain_ (`BepuHandles.CreateTerrainPatch` builds a `BigCompound` of
`Triangle`s) — engine-internal, not authorable part data.

---

## 2. The XML schema

`<Collider>` is a **Part component** (`ModuleBase.TemplateDataBase`,
`[XmlType(TypeName="Collider")]`) holding a list of shapes. Real, shipped example —
`CoreCommandA_Prefab_MediumCapsuleVariantA` (`Content/Core/CoreCommandAGameData.xml`), a
cylinder hull plus a sphere for the heat-shield end:

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

| Element / attr                        | Type                                     | Meaning                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Collider Id>`                       | `TemplateDataBase.Id` (`[XmlAttribute]`) | Component id. **Shares the id namespace `<FeedsFrom Container="…">` resolves against** (`PartTemplate.cs:551` scans every `Components[].Id`) — must not equal a `<Tank Id>` on the same owner.                                                                                                  |
| `<Box\|Sphere\|Cylinder\|Capsule Id>` | `SerializedId.Id`                        | Per-shape id. Not registered in `ModLibrary`; Core reuses `"CylinderCollider1"` across dozens of parts, so it need not be globally unique.                                                                                                                                                      |
| `<LocationAsmb X Y Z>`                | `Vector3Reference` (doubles, default 0)  | Shape centre, in the **owner's assembly frame**, meters.                                                                                                                                                                                                                                        |
| `<Collider2Asmb X Y Z>`               | `Vector3Reference`                       | Shape orientation, **Euler XYZ radians** — built with `QuaternionEx.CreateFromXyzRadians` (`ColliderTemplate.Create`), the _identical_ function `TransformReference.RotationValue` uses for a placement `<Rotation>`. ⇒ `src/three/coords.ts`'s `EULER_ORDER = 'ZYX'` mapping applies verbatim. |
| `<LengthX\|LengthY\|LengthZ M>`       | `DistanceReference`                      | Box full extents along local X/Y/Z.                                                                                                                                                                                                                                                             |
| `<Radius M>`                          | `DistanceReference`                      | Sphere / cylinder / capsule radius.                                                                                                                                                                                                                                                             |
| `<LengthY M>`                         | `DistanceReference`                      | Cylinder / capsule axial length (see §3).                                                                                                                                                                                                                                                       |

⚠️ **`DistanceReference` defaults to `NaN`, not 0** (`DistanceReference.cs:68-77`: `SetValue()`
leaves `_value = double.NaN` when every unit attribute is absent, and the implicit `double`
conversion returns it). An omitted `<Radius>` therefore produces `new Sphere(NaN)` and poisons
the physics shape. **flexo ALWAYS emits every dimension element** — no omit-at-default. By
contrast `LocationAsmb` / `Collider2Asmb` are `Vector3Reference`s initialised to zero, so those
_are_ safe to omit at default (Core writes them anyway, and so does flexo).

---

## 3. Bepu shape semantics — verified against real meshes

Bepu isn't in the decomp, so the constructor semantics were confirmed against shipped collider
data vs. the actual GLB mesh bounds (POSITION accessor min/max in
`flexo-private-assets/assets/Meshes/*.glb`):

| Shape                            | Semantics                                                                                                                                   | Evidence                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Box(LengthX, LengthY, LengthZ)` | **FULL extents** on local X/Y/Z                                                                                                             | `CoreElectricalA_Subpart_SolarPanelA_CellA`: mesh AABB `0.80000 × 0.60000 × 0.02500`; collider Box `0.79467 × 0.59602 × 0.02531`. A half-extent reading would make it a 5 cm-thick, 1.6 m panel.                             |
| `Cylinder(Radius, LengthY)`      | **Y-axis aligned**, FULL length                                                                                                             | `CoreLandingA_Subpart_MediumFootA`: mesh AABB `0.33671 × …`; collider `<LengthY M="0.34">`. And `CoreCommandA` sets `Collider2Asmb Z="1.57"` purely to lay a cylinder along **X** — only necessary if the default axis is Y. |
| `Capsule(Radius, LengthY)`       | **Y-axis aligned**; `LengthY` is the _cylindrical segment_, hemispherical caps add `Radius` at each end ⇒ tip-to-tip = `LengthY + 2·Radius` | Bepu v2 convention. ⚠️ **No Core part uses `<Capsule>`** (0 occurrences) — the one semantic unverified in shipped data. Flagged for in-game A/B before capsules are advertised.                                              |
| `Sphere(Radius)`                 | radius                                                                                                                                      | —                                                                                                                                                                                                                            |

Shape usage across all of `Content/`: **Cylinder 66 · Box 29 · Sphere 21 · Capsule 0** (89
`<Collider>` components total). Cylinder is the workhorse and flexo's default shape.

---

## 4. Four authoring sites — and their equivalence

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
dedupe**.

⇒ **flexo reads all four and normalises every collider into the GameData document.** That is
byte-different but semantically identical, and it is what closes gap **E** without needing raw
`<Part>`-child passthrough.

What is **NOT** possible: a per-placement collider. A placement is a `PartInstance`, whose
`Components` list is `ModuleBase.SaveDataBase` (save-game state), not `TemplateDataBase`
(`PartInstance.cs` + `XmlHelper.cs:31`). A SubPart-owned collider therefore applies to **every
placement of that template**, in the **template's local frame**.

---

## 5. Runtime behaviour

| Behaviour                                                                                                                                                                       | Source                                                           | Consequence for authoring                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A vehicle's collision body is a Bepu `BigCompound` of **every** `ColliderModule` in the vehicle, positioned relative to the centre of mass                                      | `Vehicle.cs:1508-1521`, `CreateColliderCompound` `:1633`         | A part with no collider contributes **nothing**: it passes through terrain and other vehicles.                                                                                                                  |
| **Fallback when a vehicle has zero colliders**: one `Box` from the _render_ bounds                                                                                              | `Vehicle.cs:1523-1556`, `BepuHandles.Create`                     | A single collider-less part still collides via a crude box; add one collider anywhere in the vehicle and every collider-less part becomes non-collidable.                                                       |
| `_props.BoundingBoxAsmb` / `GeometricCenterAsmb` / `BoundingSphereRadiusBody` derive **from the collider compound** when colliders exist                                        | `Vehicle.cs:1514-1520`                                           | An oversized collider inflates the vehicle bounding box (and the physics-radius bounding sphere). Bloat costs more than "invisible wall".                                                                       |
| A collider is positioned as `PositionPartAsmb.Transform(Parent.Asmb2VehicleAsmb) + Parent.PositionVehicleAsmb`                                                                  | `ColliderModule.cs:38-42`                                        | Rotation of the owning subpart applies; **scale never does** (gotcha 1).                                                                                                                                        |
| **Animated subparts refresh their colliders**: `KeyframeAnimationModule.ApplyAnimationTransforms` sets `NeedsColliderUpdate`; `ConstraintSim.UpdateShape` rebuilds the compound | `KeyframeAnimationModule.cs:359-364`, `ConstraintSim.cs:226-253` | **A SubPart-owned collider follows joint animation** — unlike connectors, which cannot ([connectors-coordinates-iva.md](connectors-coordinates-iva.md)). This is how landing legs get a deployed foot collider. |
| A contact's sub-shape index maps back to the owning `Part`                                                                                                                      | `VehicleUpdateState.TryGetContactPart:438`                       | Contact attribution (damage, sound, docking) depends on _which_ part owns the touching collider.                                                                                                                |
| **Docking requires collider contact**: `TryGetContactDockingPort` resolves the contacted collider → its `Part` → a `DockingPort` module                                         | `ConstraintSim.cs:762, 861-878`                                  | ⚠️ **A docking-port part with no collider never docks.** Core's `CoreCouplingA` port carries a `<Cylinder LengthY 0.4 Radius 0.5>` puck at the docking face for exactly this reason.                            |
| Each vehicle is ONE dynamic body; a Bepu compound never self-collides. Kinematic/static pairs are filtered out                                                                  | `NarrowPhaseCallbacks.cs:22-47`                                  | **Overlapping colliders within a part are free.** Overlap is the _normal_ way to build a composite shape — no need to seam them.                                                                                |
| Colliders contribute **zero mass** (`PartTemplate.CalculateMass` sums only `InertMasses` + tanks + grain)                                                                       | `PartTemplate.cs:622-648`                                        | Collider size never affects mass or inertia. Mass stays a `<CustomMass>` / mass-primitive concern.                                                                                                              |

---

## 6. Gotchas (author these into the UI)

1. **Placement scale is ignored.** `ColliderModule` composes only position + rotation
   (`ColliderModule.cs:38-42`); neither the shape dimensions nor the local offset are scaled by
   the owning subpart's `Scale`. A SubPart-owned collider on a placement scaled 2× will be half
   the visual size in-game. ⇒ flexo **warns** on non-unit placement scale.
2. **Missing dimension ⇒ NaN shape** (§2). Always emit.
3. **`<Collider Id>` shares the feed-container namespace** (§2). flexo emits one deterministic
   component id per owner (`flexoColliders`, and `flexoInheritedColliders` on an export variant)
   and validates neither collides with a `<Tank Id>` on the same owner.
4. **Export-variant inheritance hole.** `buildExportVariantMap` (`src/ksa/modExport.ts`)
   redeclares a _fresh_ `<SubPart Id>` when a built-in template carries flexo GameData. The
   variant references the built-in mesh/material but inherits **nothing else** — so the built-in
   template's own geometry `<Collider>` must be **copied forward** onto it
   (`CatalogSubPart.colliders` → `ExportVariant.colliders` → `ReferenceSubPartPlan.colliders`).
   Affects `CoreElectricalA_Subpart_SolarPanel[A|B]_CellA`.
5. **Core's colliders are deliberately coarse.** 76 of 132 shipped `<PartGameData>` entries have
   a collider; 56 (fairings, interstages, nosecones) have none. Where they exist they are often
   much looser than the mesh (the medium capsule wraps a ~2 m hull in an `r=0.5` cylinder +
   `r=0.89` sphere). ⇒ fitting aims for "good enough envelope", not a tight hull, and
   "no collider" is a **warning, not an error**.

---

## 7. The exemplar: `CoreLandingA_Prefab_MediumLandingLegA`

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
SubPart-level puck rides the animated foot.

---

## 8. What to re-check on a game update

- `decomp/KSA/ColliderModule.cs` — a **fifth** `[XmlElement]` shape would be silently dropped by
  `collidersFromElement` (it skips unrecognised children). Adding one means a new
  `ColliderShape` + a `colliderSize.ts` mapping + a `wireShapes.ts` outline.
- The four `*ColliderTemplate.cs` `CreateShapeInto` bodies — an argument-order or
  radius/diameter change silently rescales every authored collider.
- `DistanceReference.cs` — if the default stopped being `NaN`, the always-emit rule could relax
  (it should not, but the rationale would change).
- `PartTemplate.ApplyGameData` `Components.AddRange` — if merging ever DEDUPED by component id,
  flexo's normalise-into-GameData strategy would start shadowing a built-in template's collider
  instead of adding to it.
- `Vehicle.cs` collider-compound + zero-collider fallback — the "no collider" warning's rationale.
- `ConstraintSim` docking-by-contact — the docking-port warning's rationale.
