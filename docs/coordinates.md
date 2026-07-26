# Coordinate System & Transforms

All conversion between KSA Part-space transforms (as stored in `$part` / XML) and
three.js `Object3D` transforms is isolated in **`src/three/coords.ts`**. If anything
about placement orientation looks wrong, fix it there — nowhere else does transform
math.

## The mapping (calibrated against KSA's Brutal engine)

KSA and three.js share the **same basis**: right-handed, **Y-up**, **-Z-forward**,
meters. KSA's engine defines `Up=(0,1,0)`, `Right=(1,0,0)`, `Forward=(0,0,-1)`
(`thirdparty/ksa/KSA/Double3Ex.cs`) — identical to glTF/three.js. So **position and
scale are applied directly**, with no axis swap or sign flip.

Rotation needs an **Euler-order** change. KSA stores rotation as Euler "XYZ" radians,
but its quaternion conversion (`QuaternionEx.CreateFromXyzRadians` / `ToXyzRadians`)
composes the axes in the **opposite multiplication order** from three.js's `'XYZ'`.
Numerically, KSA's "XYZ" is **bit-for-bit three.js `'ZYX'`** (verified by reproducing
both formulas). So:

- `applyPlacement(obj, placement)`: `obj.position.set(x,y,z)`,
  `obj.rotation.set(rx, ry, rz, 'ZYX')`, `obj.scale.set(sx,sy,sz)`.
- `readPlacementTransform(obj)`: inverse — reads position/scale and converts the
  quaternion back to Euler `'ZYX'`.

> Single-axis rotations are identical under `'XYZ'` and `'ZYX'`, which is why simple
> parts (and the docking-port guide petals, which are pure X-rotations) looked correct
> even before this fix. Only **multi-axis** rotations exposed the wrong order.

The stored values in `$part` / the XML `<Rotation>` element are still KSA's Euler
"XYZ" radians — the order conversion lives entirely in `coords.ts` / `bulkTransform.ts`.

## Calibration (`?debug=dockingport`)

Because the Euler order / handedness is the highest-risk assumption, open the app
with `http://localhost:5173/?debug=dockingport`. This loads the real Core part
`CoreCouplingA_Prefab_DockingPort1WA` from its Part XML (`debugCalibration.ts` +
`partXmlParser.ts`) and renders it.

- **Correct** → it forms a coherent, radially-symmetric docking port.
- **Scrambled** → adjust the Euler order or axis signs in `coords.ts` and document
  what was verified. The `EULER_ORDER` constant (currently `'ZYX'`) is the knob.

## The second consumer — `src/ksa/ivaSeatAxes.ts`

`coords.ts` is the chokepoint for *placements*, but it imports three.js, and one other
conversion needs the same calibration in a **pure** module: an IVA seat's stored rotation ⇄
its exported `<ForwardAxis>` / `<UpAxis>` pair (see [iva-seats.md](./iva-seats.md)).
`ivaSeatAxes.ts` therefore carries its own hand-rolled copy — `ksaQuatFromEulerXyz` (a
verbatim port of `QuaternionEx.CreateFromXyzRadians`) plus the `'ZYX'` Euler extraction
three.js's `Euler.setFromRotationMatrix` performs — with **no three.js import**, following the
`colliderFit.ts` precedent.

Two copies of a calibration is exactly how a knob stops being singular, so
`src/ksa/ivaSeatAxes.test.ts` pins them together: for each of the multi-axis rotation cases
`coords.test.ts` uses, it runs `applyPlacement` and asserts the object's rotated local +X
equals `seatAxesFromRotation(r).forward` and its rotated local −Z equals `.up`, to machine
epsilon. **If `EULER_ORDER` ever changes, that test fails** — which is the point. Change the
order in `coords.ts`; `ivaSeatAxes.ts` follows or the cross-check breaks.

## Why everything routes through coords.ts

The store can hold rotation however is convenient, but export must be Euler XYZ
radians and the 3D view must match the game. Centralizing the conversion means the
serializer ([xml-io.md](./xml-io.md)), the gizmo read-back, and the scene apply all
agree, and a calibration fix lands in exactly one place.

## Related
- Mesh local origins are baked in `MeshAtlasCache` so a SubPart sits at its authored
  origin; the placement transform then positions it. See
  [subpart-catalog.md](./subpart-catalog.md).
