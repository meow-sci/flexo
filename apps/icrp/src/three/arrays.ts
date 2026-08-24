/**
 * Array generators (plans/ICRP_PLAN.md P4.05): linear / radial / grid copies of
 * a seed placement, all in RAW KSA-frame numbers (+X up, +Y east, +Z north).
 * Count semantics follow flexo's action chains: `count` = TOTAL instances
 * including the seed; the seed itself is never duplicated (index 0 skipped).
 *
 * Math via three.js (the sanctioned math carve-out) using KSA components
 * directly — a rotation about "up" is a rotation about the X component axis,
 * and euler extraction uses the calibrated 'ZYX' order (== KSA "XYZ").
 */
import * as THREE from 'three';
import type { Transform, Vec3 } from '../ksa/types';

const EULER_ORDER = 'ZYX' as const;

function quatFromKsaEuler(r: Vec3): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x, r.y, r.z, EULER_ORDER));
}

function ksaEulerFromQuat(q: THREE.Quaternion): Vec3 {
  const e = new THREE.Euler().setFromQuaternion(q, EULER_ORDER);
  return { x: e.x, y: e.y, z: e.z };
}

/** `count-1` copies stepped by `delta` metres (E/N/U as y/z/x components). */
export function linearArray(seed: Transform, count: number, delta: Vec3): Transform[] {
  const out: Transform[] = [];
  for (let i = 1; i < count; i++) {
    out.push({
      position: {
        x: seed.position.x + delta.x * i,
        y: seed.position.y + delta.y * i,
        z: seed.position.z + delta.z * i,
      },
      rotation: { ...seed.rotation },
      scale: { ...seed.scale },
    });
  }
  return out;
}

/**
 * `count-1` copies of the seed rotated about the UP axis (KSA +X) around
 * `center` (a ground-plane point; its x is ignored), evenly over a full circle.
 * Each copy is co-rotated (Core's pipe-support ring pattern).
 */
export function radialArray(
  seed: Transform,
  count: number,
  center: { y: number; z: number },
): Transform[] {
  const out: Transform[] = [];
  const seedQuat = quatFromKsaEuler(seed.rotation);
  const up = new THREE.Vector3(1, 0, 0);
  for (let i = 1; i < count; i++) {
    const theta = (i * 2 * Math.PI) / count;
    const spin = new THREE.Quaternion().setFromAxisAngle(up, theta);
    const rel = new THREE.Vector3(
      seed.position.x,
      seed.position.y - center.y,
      seed.position.z - center.z,
    ).applyQuaternion(spin);
    out.push({
      position: { x: rel.x, y: rel.y + center.y, z: rel.z + center.z },
      rotation: ksaEulerFromQuat(spin.clone().multiply(seedQuat)),
      scale: { ...seed.scale },
    });
  }
  return out;
}

/** rows × cols grid on the ground plane (east × north spacing); seed = cell (0,0). */
export function gridArray(
  seed: Transform,
  rows: number,
  cols: number,
  spacingEastM: number,
  spacingNorthM: number,
): Transform[] {
  const out: Transform[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue;
      out.push({
        position: {
          x: seed.position.x,
          y: seed.position.y + c * spacingEastM,
          z: seed.position.z + r * spacingNorthM,
        },
        rotation: { ...seed.rotation },
        scale: { ...seed.scale },
      });
    }
  }
  return out;
}
