# ICRP coordinates

**KSA static-object assembly frame: +X = up (surface normal), +Y = east, +Z = north** —
right-handed (`LocationReference.GetAxesCcf` + the Asmb2Ego row basis; identical Bepu
pose; vessels on the pad share it, and vessel parts stack along +X). The UI vocabulary is
**U/E/N**, not X/Y/Z.

three.js is +Y-up with +X east ⇒ **north = −Z**. The whole mapping is ONE proper rotation
(`det = +1`) applied once to the scene root in
[`src/three/basis.ts`](../src/three/basis.ts):

```
three.x = ksa.y (east)    e_x(up)   → (0, 1, 0)
three.y = ksa.x (up)      e_y(east) → (1, 0, 0)
three.z = −ksa.z (north)  e_z(north)→ (0, 0, −1)
```

Everything under the root is placed with flexo's `applyPlacement` /
`readPlacementTransform` (`src/three/coords.ts`, `EULER_ORDER = 'ZYX'` — KSA's "XYZ"
radians) using **raw document numbers**; because the parent is the root, gizmo read-back
returns KSA numbers with no conversion. The document NEVER stores three.js axes
(invariant I1); scene code converts hit points/boxes at the boundary (`ksaToThree` /
`threeToKsa`, or delta-vectors for align/drop math).

Consequences to keep straight:

- "Height"/elevation is KSA **X**. The prefab stacks its deck layers by X only.
- Rotating a piece "on the ground" is a rotation about **X** (the up axis) — the ground
  lock restricts the rotate gizmo to it.
- The ground plane (KSA X=0) is native three Y=0, so grid/overlays/ground raycasts are
  built directly in three space.
- The compass: north arrow = three −Z (red), east = +X (yellow).
- Calibration tests: `src/three/basis.test.ts` + the catalog tests assert the Core pad's
  PadGrate deck is a +X lift and the crawler ramp runs north.
