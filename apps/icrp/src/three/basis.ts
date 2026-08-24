/**
 * The ONE place that knows the KSA static-object assembly frame
 * (plans/ICRP_PLAN.md D4/I1, fact F5).
 *
 * KSA places a static object at its landmark with local **+X = up** (surface
 * normal), **+Y = east**, **+Z = north** — right-handed (up × east = north);
 * `LocationReference.GetAxesCcf` + the Asmb2Ego row basis
 * (decomp/KSA/LocationReference.cs:148-177), and the identical Bepu pose
 * (ConstraintSim.cs:519-527). Vessels on the pad share the frame, and vessel
 * parts stack along +X, so vessel meshes stand upright with no correction.
 *
 * three.js is +Y up with +X east, so north must be −Z. The scene ROOT gets this
 * matrix once (`matrixAutoUpdate = false`); every piece is a child placed with
 * flexo's `applyPlacement` using raw KSA numbers, and gizmo read-back via
 * `readPlacementTransform` returns KSA numbers because the parent is the root.
 * The document NEVER stores three.js axes.
 */
import * as THREE from 'three';
import type { Vec3 } from '../ksa/types';

/**
 * Proper rotation (det = +1) mapping the KSA static frame into three.js:
 * e_x(up)→(0,1,0), e_y(east)→(1,0,0), e_z(north)→(0,0,−1).
 */
export const KSA_STATIC_TO_THREE = new THREE.Matrix4().set(
  // three.x = ksa.y (east)
  0,
  1,
  0,
  0,
  // three.y = ksa.x (up)
  1,
  0,
  0,
  0,
  // three.z = −ksa.z (north is −Z in three)
  0,
  0,
  -1,
  0,
  0,
  0,
  0,
  1,
);

/** Inverse mapping (the matrix is orthonormal, so inverse = transpose — but keep it explicit). */
export const THREE_TO_KSA_STATIC = KSA_STATIC_TO_THREE.clone().invert();

/** Applies the basis to a scene root. Call once at scene construction. */
export function applyStaticBasis(root: THREE.Object3D): void {
  root.matrixAutoUpdate = false;
  root.matrix.copy(KSA_STATIC_TO_THREE);
}

/** KSA static-frame point → three.js world point (root at origin). */
export function ksaToThree(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p.y, p.x, -p.z);
}

/** three.js world point → KSA static-frame point (root at origin). */
export function threeToKsa(v: THREE.Vector3): Vec3 {
  return { x: v.y, y: v.x, z: -v.z };
}
