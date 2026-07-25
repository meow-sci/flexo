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

Phase 1 (contract + round-trip, closes gap **E**) is implemented. 3D authoring — the
`ColliderObject` visual, selection/gizmo, the Add menu, fitting tools, validation and the
coverage readout — is [plans/COLLIDERS_PLAN.md](../plans/COLLIDERS_PLAN.md) Phases 2–4.
