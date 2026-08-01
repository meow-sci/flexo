import * as THREE from 'three';
import type { EulerXYZ, Transform, Vec3 } from '../ksa/types';

/**
 * The single chokepoint for converting between KSA Part-space transforms (as
 * stored in XML / the editor store) and three.js Object3D transforms.
 *
 * COORDINATE MAPPING (calibrated against KSA's Brutal engine source):
 *   KSA and three.js share the SAME basis — right-handed, Y-up, -Z-forward,
 *   meters (KSA: Up=(0,1,0), Right=(1,0,0), Forward=(0,0,-1), see Double3Ex.cs).
 *   So position and scale are applied DIRECTLY, no axis swap or sign flip.
 *
 *   Rotation needs an Euler-ORDER change, though. KSA stores rotation as Euler
 *   "XYZ" radians, but its quat<->euler conversion (QuaternionEx.CreateFromXyzRadians /
 *   ToXyzRadians) composes the axes in the opposite multiplication order from
 *   three.js's 'XYZ'. Numerically, KSA's "XYZ" is bit-for-bit three.js 'ZYX'.
 *   Single-axis rotations are identical under either order (which is why simple
 *   parts looked fine), but multi-axis rotations only match with 'ZYX'.
 *
 * CALIBRATION: load the Core part `CoreCouplingA_Prefab_DockingPort1WA`
 * (open the app with `?debug=dockingport`) and confirm it assembles into a
 * coherent, radially-symmetric docking port. If it ever looks scrambled, the
 * Euler order / axis mapping is the knob — change it HERE ONLY; every other
 * module routes transforms through these two functions.
 */

// KSA's Euler "XYZ" equals three.js 'ZYX' (opposite compose order) — see above.
const EULER_ORDER = 'ZYX' as const;

export function applyPlacement(obj: THREE.Object3D, p: Transform): void {
  obj.position.set(p.position.x, p.position.y, p.position.z);
  obj.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z, EULER_ORDER);
  obj.scale.set(p.scale.x, p.scale.y, p.scale.z);
}

export function readPlacementTransform(obj: THREE.Object3D): {
  position: Vec3;
  rotation: EulerXYZ;
  scale: Vec3;
} {
  const euler = new THREE.Euler().setFromQuaternion(obj.quaternion, EULER_ORDER);
  return {
    position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
    rotation: { x: euler.x, y: euler.y, z: euler.z },
    scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
  };
}

/**
 * Builds the local matrix for a KSA-space {@link Transform}, routing the rotation
 * through the SAME calibrated euler order ({@link EULER_ORDER}) as
 * {@link applyPlacement}. The single source of truth for "Transform → matrix" used
 * by the animation rig math (which must agree bit-for-bit with how placements are
 * rendered, so an animation's rest pose matches the static pose).
 */
export function matrixFromTransform(t: Transform): THREE.Matrix4 {
  const pos = new THREE.Vector3(t.position.x, t.position.y, t.position.z);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(t.rotation.x, t.rotation.y, t.rotation.z, EULER_ORDER),
  );
  const scale = new THREE.Vector3(t.scale.x, t.scale.y, t.scale.z);
  return new THREE.Matrix4().compose(pos, quat, scale);
}

/** Inverse of {@link matrixFromTransform}: decomposes a matrix back to a KSA Transform. */
export function transformFromMatrix(m: THREE.Matrix4): Transform {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  const euler = new THREE.Euler().setFromQuaternion(quat, EULER_ORDER);
  return {
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotation: { x: euler.x, y: euler.y, z: euler.z },
    scale: { x: scale.x, y: scale.y, z: scale.z },
  };
}

/**
 * Places a SubPart-owned {@link import('../ksa/types').PartCollider} into Part space, exactly
 * as KSA composes it (`ColliderModule.PositionVehicleAsmb` / `Collider2VehicleAsmb`,
 * `decomp/KSA/ColliderModule.cs:38-42`):
 *
 * ```
 * worldPos  = placement.position + R(placement.rotation) · collider.position
 * worldRot  = R(placement.rotation) · R(collider.rotation)
 * worldSize = collider.scale                            // placement scale IGNORED
 * ```
 *
 * The scale omission is not a simplification — `ColliderModule` composes only position and
 * rotation, so a collider on a placement scaled 2× really is half the visual size in-game.
 * flexo renders that faithfully and warns instead of compensating (see scope/colliders.md).
 */
export function colliderWorld(collider: Transform, placement: Transform): Transform {
  const parentQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(placement.rotation.x, placement.rotation.y, placement.rotation.z, EULER_ORDER),
  );
  const localPos = new THREE.Vector3(
    collider.position.x,
    collider.position.y,
    collider.position.z,
  ).applyQuaternion(parentQuat);
  const worldQuat = parentQuat
    .clone()
    .multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(collider.rotation.x, collider.rotation.y, collider.rotation.z, EULER_ORDER),
      ),
    );
  const euler = new THREE.Euler().setFromQuaternion(worldQuat, EULER_ORDER);
  return {
    position: {
      x: placement.position.x + localPos.x,
      y: placement.position.y + localPos.y,
      z: placement.position.z + localPos.z,
    },
    rotation: { x: euler.x, y: euler.y, z: euler.z },
    scale: { ...collider.scale },
  };
}

/** Inverse of {@link colliderWorld}: a Part-space transform back into the owner's local frame. */
export function colliderLocalFromWorld(world: Transform, placement: Transform): Transform {
  const parentInv = new THREE.Quaternion()
    .setFromEuler(
      new THREE.Euler(
        placement.rotation.x,
        placement.rotation.y,
        placement.rotation.z,
        EULER_ORDER,
      ),
    )
    .invert();
  const localPos = new THREE.Vector3(
    world.position.x - placement.position.x,
    world.position.y - placement.position.y,
    world.position.z - placement.position.z,
  ).applyQuaternion(parentInv);
  const localQuat = parentInv
    .clone()
    .multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(world.rotation.x, world.rotation.y, world.rotation.z, EULER_ORDER),
      ),
    );
  const euler = new THREE.Euler().setFromQuaternion(localQuat, EULER_ORDER);
  return {
    position: { x: localPos.x, y: localPos.y, z: localPos.z },
    rotation: { x: euler.x, y: euler.y, z: euler.z },
    scale: { ...world.scale },
  };
}

/**
 * Places a {@link import('../ksa/types').PartLight} into Part space, exactly as KSA
 * poses it (`LightModule.UpdateRenderData`, `decomp/KSA/LightModule.cs:86-129`:
 * `Template.Transform.PositionValue.Transform(matrix)` with the OWNER's full matrix):
 *
 * ```
 * worldPos   = owner.position + R(owner.rotation) · (owner.scale ∘ light.position)
 * worldRot   = R(owner.rotation) · R(light.rotation)
 * worldScale = (1,1,1)                                  // KSA ignores light scale
 * ```
 *
 * ⚠️ The owner's **scale IS applied to the light's position offset** — deliberately
 * UNLIKE {@link colliderWorld}, whose `ColliderModule` composes only position +
 * rotation. Copying the collider math here is the trap: a light on a placement
 * scaled 2× really does sit twice as far from the placement origin in-game.
 *
 * A Spot's aim is its rotated local +X (`double3.UnitX.Transform(rotationValue)`,
 * then the owner's upper-3×3 — `LightModule.cs:115-117`). flexo composes quaternions
 * instead: exact for uniform POSITIVE owner scale. A NON-uniform scale skews the
 * in-game aim, and a MIRRORED owner (any negative scale component, det < 0) is an
 * improper map that survives the game's normalize — a (−1,−1,−1) owner flips the
 * in-game beam a full 180° while the quaternion compose (which can never produce a
 * reflection) still shows the unflipped aim. `lightValidation` must warn on BOTH
 * (non-uniform, and any negative component) rather than reproducing them.
 *
 * `light` is the light's owner-frame transform (a `PartLight`; its own scale is
 * unused); `owner` is the owning SubPart placement — or a posed animation frame of
 * it — and `null` for a part-level light, whose transform already IS the part-frame
 * pose (returned verbatim, scale pinned).
 */
export function lightWorld(light: Transform, owner: Transform | null): Transform {
  if (owner === null) {
    return {
      position: { ...light.position },
      rotation: { ...light.rotation },
      scale: { x: 1, y: 1, z: 1 },
    };
  }
  const ownerQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(owner.rotation.x, owner.rotation.y, owner.rotation.z, EULER_ORDER),
  );
  const offset = new THREE.Vector3(
    light.position.x * owner.scale.x,
    light.position.y * owner.scale.y,
    light.position.z * owner.scale.z,
  ).applyQuaternion(ownerQuat);
  const worldQuat = ownerQuat
    .clone()
    .multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(light.rotation.x, light.rotation.y, light.rotation.z, EULER_ORDER),
      ),
    );
  const euler = new THREE.Euler().setFromQuaternion(worldQuat, EULER_ORDER);
  return {
    position: {
      x: owner.position.x + offset.x,
      y: owner.position.y + offset.y,
      z: owner.position.z + offset.z,
    },
    rotation: { x: euler.x, y: euler.y, z: euler.z },
    scale: { x: 1, y: 1, z: 1 },
  };
}

/**
 * Exact inverse of {@link lightWorld}: a Part-space pose back into the light's
 * owner-frame transform (what the gizmo writes through).
 *
 * ```
 * light.position = owner.scale⁻¹ ∘ (R(owner.rotation)⁻¹ · (world.position − owner.position))
 * light.rotation = R(owner.rotation)⁻¹ · R(world.rotation)
 * ```
 *
 * The per-axis scale division uses the SIGNED component — a mirrored (negative
 * scale) owner is legal and must round-trip — guarding `|s| < 1e-9` by treating
 * that axis's scale as 1 (a zero-scaled owner is degenerate; `lightValidation`
 * warns). Scale is pinned to (1,1,1), like everything light-transform-shaped.
 */
export function lightLocalFromWorld(world: Transform, owner: Transform | null): Transform {
  if (owner === null) {
    return {
      position: { ...world.position },
      rotation: { ...world.rotation },
      scale: { x: 1, y: 1, z: 1 },
    };
  }
  const ownerInv = new THREE.Quaternion()
    .setFromEuler(
      new THREE.Euler(owner.rotation.x, owner.rotation.y, owner.rotation.z, EULER_ORDER),
    )
    .invert();
  const rotated = new THREE.Vector3(
    world.position.x - owner.position.x,
    world.position.y - owner.position.y,
    world.position.z - owner.position.z,
  ).applyQuaternion(ownerInv);
  const localQuat = ownerInv
    .clone()
    .multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(world.rotation.x, world.rotation.y, world.rotation.z, EULER_ORDER),
      ),
    );
  const euler = new THREE.Euler().setFromQuaternion(localQuat, EULER_ORDER);
  return {
    position: {
      x: rotated.x / signedScaleOrOne(owner.scale.x),
      y: rotated.y / signedScaleOrOne(owner.scale.y),
      z: rotated.z / signedScaleOrOne(owner.scale.z),
    },
    rotation: { x: euler.x, y: euler.y, z: euler.z },
    scale: { x: 1, y: 1, z: 1 },
  };
}

/** Signed scale divisor for {@link lightLocalFromWorld}: `|s| < 1e-9` degenerates to 1. */
function signedScaleOrOne(s: number): number {
  return Math.abs(s) < 1e-9 ? 1 : s;
}

/**
 * Lifts a nozzle's exhaust LOCATION out of its owner's assembly frame into Part space,
 * exactly as KSA composes it (`RocketNozzle.ResetState`, `decomp/KSA/RocketNozzle.cs:103-108`):
 *
 * ```csharp
 * state.ThrustLocationVehicleAsmb = LocationAsmb.Transform(Parent.MatrixAsmb2VehicleAsmb);
 * ```
 *
 * `MatrixAsmb2VehicleAsmb` is `Scale · Rotation · Translation` (`decomp/KSA/Part.cs:217`),
 * so the owner's **scale DOES apply** to the offset — a nozzle on a placement scaled 2×
 * really does sit twice as far out in-game. `owner` is the placement the nozzle's
 * `<SubPartGameData>` travels with, or **null** for a part-level `<PartGameData>` nozzle,
 * whose vectors already are Part-space (KSA makes the SubPart its own child `Part` with the
 * `<SubPartRef><Transform>`, `decomp/KSA/Part.cs:1131-1152`).
 */
export function exhaustWorldLocation(location: Vec3, owner: Transform | null): Vec3 {
  if (owner === null) return { ...location };
  const v = new THREE.Vector3(location.x, location.y, location.z).applyMatrix4(
    matrixFromTransform(owner),
  );
  return { x: v.x, y: v.y, z: v.z };
}

/** Exact inverse of {@link exhaustWorldLocation} — what a translate drag writes back. */
export function exhaustLocalLocation(world: Vec3, owner: Transform | null): Vec3 {
  if (owner === null) return { ...world };
  const v = new THREE.Vector3(world.x, world.y, world.z).applyMatrix4(
    matrixFromTransform(owner).invert(),
  );
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Lifts a nozzle's exhaust DIRECTION out of its owner's assembly frame into Part space.
 *
 * ⚠️ Deliberately **rotation-only** — unlike {@link exhaustWorldLocation}. KSA transforms
 * the direction by `Parent.Asmb2VehicleAsmb`, a *quaternion* (`RocketNozzle.cs:104,107`;
 * `Part.cs:644-656`), so a non-uniform owner scale skews the mesh but NOT the thrust axis.
 * Running the direction through the full matrix (the `Vector3.transformDirection` trap)
 * would shear it and, worse, write the sheared vector back through the inverse.
 *
 * MAGNITUDE IS PRESERVED, not normalized: thrust is applied unnormalized
 * (`decomp/KSA/VehicleUpdateState.cs`: `TotalThrust * ThrustDirectionVehicleAsmb`) so the
 * physics vector's length is real data, and stock ships non-unit FX vectors
 * (`0, 0.550, -1.000`). Normalizing is the caller's policy decision, per channel.
 */
export function exhaustWorldDirection(direction: Vec3, owner: Transform | null): Vec3 {
  if (owner === null) return { ...direction };
  const v = new THREE.Vector3(direction.x, direction.y, direction.z).applyQuaternion(
    ownerQuat(owner),
  );
  return { x: v.x, y: v.y, z: v.z };
}

/** Exact inverse of {@link exhaustWorldDirection} — what a rotate drag writes back. */
export function exhaustLocalDirection(world: Vec3, owner: Transform | null): Vec3 {
  if (owner === null) return { ...world };
  const v = new THREE.Vector3(world.x, world.y, world.z).applyQuaternion(ownerQuat(owner).invert());
  return { x: v.x, y: v.y, z: v.z };
}

/** The owner placement's rotation as a quaternion, through the calibrated euler order. */
function ownerQuat(owner: Transform): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(owner.rotation.x, owner.rotation.y, owner.rotation.z, EULER_ORDER),
  );
}

/**
 * The AIM of a light rotation: the rotated local **+X** unit vector — KSA aims a
 * Spot along `double3.UnitX.Transform(rotationValue)` (`LightModule.cs:115`), the
 * same "facing = local +X" convention as every flexo marker. Feed it a light's
 * stored rotation for the owner-frame aim, or {@link lightWorld}'s rotation for the
 * part-frame aim (the inspector aim fields and the live SpotLight target).
 */
export function lightWorldAim(rotation: EulerXYZ): Vec3 {
  const aim = new THREE.Vector3(1, 0, 0).applyQuaternion(
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation.x, rotation.y, rotation.z, EULER_ORDER),
    ),
  );
  return { x: aim.x, y: aim.y, z: aim.z };
}

/**
 * Re-aims a light rotation at `newAim` while preserving ROLL CONTINUITY: the
 * minimal rotation ΔQ taking the current aim ({@link lightWorldAim} of
 * `rotation`) onto the normalized `newAim` is composed ON TOP of the current
 * rotation — `ΔQ · R` (plans/LIGHT_MANAGEMENT_PLAN.md §3.9-7). Roll around the
 * aim axis is irrelevant to a Spot's cone, but carrying it through keeps the
 * gizmo (and the aim-rotation fields) from spinning wildly when the inspector's
 * aim-vector fields are committed. Works in whatever frame `rotation` is
 * expressed in — feed it a part-frame rotation and a part-frame aim.
 *
 * Degenerate inputs are safe by construction:
 *  - `|newAim| < 1e-6` → **null** (the caller keeps the prior rotation);
 *  - `newAim` parallel to the current aim → ΔQ = identity (rotation unchanged);
 *  - antiparallel → three's `Quaternion.setFromUnitVectors` picks a stable
 *    perpendicular axis for the 180° flip (never NaN).
 */
export function lightAimRotation(rotation: EulerXYZ, newAim: Vec3): EulerXYZ | null {
  const len = Math.hypot(newAim.x, newAim.y, newAim.z);
  if (len < 1e-6) return null;
  const target = new THREE.Vector3(newAim.x / len, newAim.y / len, newAim.z / len);
  const current = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation.x, rotation.y, rotation.z, EULER_ORDER),
  );
  const currentAim = new THREE.Vector3(1, 0, 0).applyQuaternion(current);
  const deltaQ = new THREE.Quaternion().setFromUnitVectors(currentAim, target);
  const euler = new THREE.Euler().setFromQuaternion(deltaQ.multiply(current), EULER_ORDER);
  return { x: euler.x, y: euler.y, z: euler.z };
}
