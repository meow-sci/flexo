# Colliders

The **collision volume** of a Part — the coarse shapes KSA's physics uses instead of the
visual mesh. A flexo Part with no collider passes through terrain and other vehicles; a
docking port with no collider never docks. This doc is the flexo-internal view; the game
contract (schema, Bepu semantics, runtime behaviour, gotchas) lives in
[scope/colliders.md](../scope/colliders.md).

> **KSA has no collider meshes.** A collision volume is a handful of analytic primitives —
> **Cylinder, Box, Sphere, Capsule** — and nothing else. No convex hulls, no decimated
> collision meshes. If a shape needs a hull, the answer is more primitives.

## Document model

`EditingPart.colliders: PartCollider[]` — a flat top-level list pinned to the built-in
**Colliders** layer, following the connector/kitten pattern rather than burying numbers in
`gameData`. That buys selection, the transform gizmo, multi-select, copy/paste, the Assets
list, layer visibility/lock/opacity and undo with almost no new machinery.

```ts
interface PartCollider extends Transform {
  id: string                        // "_collider1"; also the emitted shape Id
  shape: 'Box' | 'Sphere' | 'Cylinder' | 'Capsule'
  ownerTemplateId: string | null    // null = part-level; else a subPartTemplateId
  layerId: string                   // always COLLIDER_LAYER_ID
}
```

### Size lives in `scale` — deliberately

`Transform` is reused with one reinterpretation: **`scale` is the collider's outer size in
METERS, not a multiplier.** KSA colliders have no scale field, so nothing is lost, and it
makes every existing transform path correct for free:

- the scene object holds **normalised** (unit-box) wire geometry, so `group.scale === size`;
- the scale gizmo therefore natively edits dimensions — exactly how `ContainerLayer` drives
  `ReferenceContainer.size`;
- every *multiplicative* bulk op (`scaleEverything`, bulk gizmo scale) is semantically right
  for both a mesh scale factor and a collider metre size.

`position` → `<LocationAsmb>` and `rotation` → `<Collider2Asmb>` are direct: the rotation is
Euler XYZ radians, the same convention as a placement `<Rotation>`, so `coords.ts` applies
verbatim.

### Ownership: part-level vs SubPart-owned

| `ownerTemplateId` | Emitted under                | Frame                    | Follows animation |
| ----------------- | ---------------------------- | ------------------------ | ----------------- |
| `null`            | `<PartGameData>`             | the Part assembly frame  | n/a               |
| a template id     | that `<SubPartGameData Id>`  | the SubPart TEMPLATE's local frame | ✅ yes  |

A SubPart-owned collider applies to **every placement of that template** — KSA has no
per-instance collider — and it **follows joint animation**, which is how a landing leg gets a
deployed foot collider. Connectors cannot do this.

## size ↔ KSA dimensions

`src/ksa/colliderSize.ts` is the single place that knows the mapping. Sizes are outer
bounding dimensions in meters; **local Y is the cylinder/capsule axis**.

| Shape    | `size` → XML                                | XML → `size`             | `normalizeColliderSize`               |
| -------- | ------------------------------------------- | ------------------------ | ------------------------------------- |
| Box      | `LengthX=x`, `LengthY=y`, `LengthZ=z`       | `(LX, LY, LZ)`           | free                                  |
| Sphere   | `Radius = x/2`                              | `(2R, 2R, 2R)`           | uniform: `x=y=z=max(x,y,z)`           |
| Cylinder | `LengthY = y`, `Radius = x/2`               | `(2R, LengthY, 2R)`      | `x = z = max(x,z)`                    |
| Capsule  | `LengthY = y − x`, `Radius = x/2`           | `(2R, LengthY + 2R, 2R)` | `x = z = max(x,z)`; `y = max(y, x)`   |

A capsule's `<LengthY>` is only the **cylindrical segment** — the hemispherical caps add a
radius at each end, so the outer height is `LengthY + 2·Radius`. A capsule shorter than its
diameter *is* a sphere, hence the `y ≥ x` clamp.

`normalizeColliderSize` is applied by both the numeric fields and the scale gizmo, so a
non-uniform drag snaps back. A `1e-4 m` floor prevents degenerate/NaN Bepu shapes.

## XML round-trip

Colliders are **read** from all four places KSA accepts them (geometry `<Part>`, geometry
`<SubPart>`, `<PartGameData>`, `<SubPartGameData>`) and **normalised into the GameData
document** on write — the two scopes are functionally identical in-game (KSA merges
`Components` additively), so this is semantically lossless and needs no raw `<Part>`-child
passthrough. See [docs/xml-io.md](xml-io.md#colliders) for the emission rules.

Two rules that are not negotiable:

- **Every dimension element is always emitted.** `DistanceReference` reads back as **NaN**
  when no unit attribute is present, so an omitted `<Radius>` builds a `new Sphere(NaN)`.
- **The `<Collider Id>` component id must not collide with a `<Tank Id>`** on the same owner
  — they share the namespace `<FeedsFrom Container>` resolves against. flexo emits one
  deterministic id per owner and validates it.

### Placement-only import stays clean

Placing a built-in SubPart does **not** copy its template's collider into your document. The
placement references the built-in id and the built-in collider applies in-game for free. The
catalog copy (`CatalogSubPart.colliders`) exists only for the export-variant case: when mod
export is forced to redeclare a built-in template under a fresh id (because it carries flexo
GameData or a flexo collider), the variant inherits **nothing** but the Mesh/Material it
names — so the built-in collision volume is explicitly copied forward onto it.

## 3D authoring

`src/three/ColliderObject.ts` renders each collider as a fat-line wireframe plus a very
low-alpha solid fill (which doubles as the raycast target — a bare line is fiddly to
click). Amber by default, green when selected, matching connectors.

All geometry is **normalised into the unit box** (`src/three/wireShapes.ts`, shared with
`ContainerLayer`), so `group.scale` IS the size in meters and the **scale gizmo edits
dimensions natively**. Line width is screen-space, so a squashed collider stays readable.
The **capsule** is the one ratio-dependent shape: its hemispherical caps are drawn as
normalised *ellipses* precisely so the non-uniform node scale renders them as true
hemispheres — its geometry is rebuilt when the diameter/height ratio changes.

A SubPart-owned collider draws **once per placement** of its template (KSA has no
per-instance collider, so every instance really does carry the shape), positioned exactly
as `ColliderModule` composes it — `colliderWorld` / `colliderLocalFromWorld` in
`src/three/coords.ts`, which keeps the Euler convention in its one sanctioned place.

Those visuals are all gizmo targets: clicking one records which instance you grabbed, and
a drag converts the Part-space result back through **that placement's** frame before
storing it. Every other visual of the same collider then moves with it — they are one
document entity. The bulk (multi-select) path lifts owned colliders into Part space for
the delta math and pushes them back down on write, so a mixed selection stays correct even
when the owner is rotated.

While the animation preview shows a **posed** frame, owned colliders ride their instance's
posed transform — they do in-game too (`KeyframeAnimationModule.ApplyAnimationTransforms`
flags `NeedsColliderUpdate` and `ConstraintSim` rebuilds the compound). The existing
preview lock extends to them, so a drag can never write a posed frame back as the modeled
one.

### Selection and the inspector

Colliders are the **fourth** `SelectableKind`, with the same machinery as the other three:
click-select, multi-select across kinds, nudge/rotate/duplicate/delete hotkeys, copy/paste,
the Assets list, and layer visibility/lock/opacity. The inspector's third numeric group
becomes **"Size (m)"** with per-shape fields (Box: X/Y/Z · Sphere: Ø · Cylinder/Capsule:
Ø + H) — only the axes a shape independently controls are shown, since
`normalizeColliderSize` derives the rest. Changing the **owner** converts the transform
through the old and new placements so the shape doesn't visually jump.

## Fitting

**Add → Collider ▸ Fit to selection ▸ \<shape\>** wraps the selected placements (or the
whole Part when nothing is selected); the inspector's **Fit to selection** button refits an
existing collider in place, keeping its id and owner.

`src/ksa/colliderFit.ts` is pure: it takes world-space sample points plus a frame
quaternion and returns position + orientation + outer size. A cylinder/capsule lays its
barrel along the longest axis of the oriented AABB, with the radius spanning the
perpendicular plane; a sphere stays axis-aligned (an arbitrary rotation on a sphere is just
noise in the XML). A tunable ±% margin covers Core's habit of shaving ~0.7% off a mesh
AABB.

Fitting needs world geometry, which only exists in the three.js scene — and `src/state` /
`src/ui` are deliberately three-free. So the menu publishes an intent
(`$colliderFitRequest` in `src/state/colliderStore.ts`) that `EditorScene` consumes,
samples (`src/three/samplePoints.ts`, shared with the container containment warnings), and
writes back through the store. Same pattern as `$revealEntity`.

## Validation

`src/ksa/colliderValidation.ts` grades every problem the way `engineValidation` does, and
the Export dialog renders both together:

| Severity  | Rule                                                        | Why                                                     |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| **block** | any size axis ≤ 0 or non-finite                             | degenerate/NaN Bepu shape                               |
| **block** | a `<Tank Id>` equal to the emitted collider component id     | `<FeedsFrom Container>` could resolve to the collider   |
| warn      | the Part has no collider at all                              | passes through terrain once anything else has one       |
| warn      | a docking port with no collider                              | docking is resolved from the contacted collider         |
| warn      | owner placed with a non-unit scale                           | KSA ignores placement scale for colliders               |
| warn      | owner template no longer placed                              | dead data                                               |
| warn      | capsule shorter than its diameter                            | it is just a sphere                                     |
| warn      | more than ~32 colliders                                      | the compound rebuilds on every animation tick           |

## Coverage check

**Check** in the collider panel scores the whole collision volume against the part's
sampled geometry (`src/measure/colliderCoverage.ts`, pure) and reports two numbers that
pull in opposite directions:

- **% of sample points covered** — geometry outside every collider clips through terrain
  and other vehicles. Uncovered points render as red dots in the viewport, so you can see
  *where* the hole is rather than just that there is one.
- **collider volume ÷ mesh-bounds volume** — bloat means invisible walls, and it inflates
  the vehicle `BoundingBoxAsmb` / `BoundingSphereRadiusBody` KSA derives from the collider
  compound. Overlap within a part is free in-game (a Bepu compound never self-collides), so
  an overlapping composite legitimately scores high — read it as a smell, not a rule.

A SubPart-owned collider is scored once per placement of its template, exactly as it exists
in-game. **Sample every vertex** trades speed for honesty: bounding-box corners are 8 points
per mesh (fast, far too coarse to trust a percentage from), per-vertex walks the whole
buffer. The setting also drives fitting, where it matters for rotated/irregular geometry.

Deliberately manual, never live: a vertex-precision sample of a real part is tens of
thousands of points against every collider.

## Layer

Colliders live on the built-in, undeletable **Colliders** layer
(`COLLIDER_LAYER_ID = 'colliders'`), between Connectors and Kittens. Like the other built-in
layers it can be hidden, locked and cleared but not deleted or renamed, and it is never
serialized to KSA XML. See [docs/layers.md](layers.md).

## Deliberate limits

- **No convex-hull / mesh colliders** — KSA cannot represent them.
- **No per-placement colliders** — KSA cannot represent them. A SubPart-owned collider
  applies to every instance of that template.
- **Placement scale is not honoured**, matching the game. flexo warns instead of silently
  compensating.
- **Capsule semantics are unverified in shipped data** — Core uses zero capsules. The
  implementation follows the Bepu v2 convention; confirm in-game before relying on it.
- **Automatic decomposition** (feed it a mesh, get N optimal primitives) is out of scope.
- **Mass is untouched.** Colliders contribute none; mass stays a `<CustomMass>` concern.

## Status

All four phases of [plans/COLLIDERS_PLAN.md](../plans/COLLIDERS_PLAN.md) are implemented:
the game contract + round-trip (closing gap **E**), 3D authoring, fully editable
SubPart-owned colliders, and the coverage readout.

**Not yet verified:** in-game behaviour of anything exported here; capsule semantics (Core
ships zero capsules, so the Bepu convention is unconfirmed against real data); and the
posed-animation collider preview, which is wired but has only been exercised at rest.
