import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { KSA_STATIC_TO_THREE, ksaToThree, threeToKsa } from './basis';

describe('KSA static frame basis (fact F5: +X up, +Y east, +Z north)', () => {
  it('is a proper rotation (det = +1, orthonormal)', () => {
    expect(KSA_STATIC_TO_THREE.determinant()).toBeCloseTo(1, 12);
    const m = KSA_STATIC_TO_THREE.clone();
    const mt = KSA_STATIC_TO_THREE.clone().transpose();
    const id = m.multiply(mt);
    const expected = new THREE.Matrix4().identity();
    for (let i = 0; i < 16; i++) expect(id.elements[i]).toBeCloseTo(expected.elements[i], 12);
  });

  it('maps up→three +Y, east→three +X, north→three −Z', () => {
    const up = new THREE.Vector3(1, 0, 0).applyMatrix4(KSA_STATIC_TO_THREE);
    const east = new THREE.Vector3(0, 1, 0).applyMatrix4(KSA_STATIC_TO_THREE);
    const north = new THREE.Vector3(0, 0, 1).applyMatrix4(KSA_STATIC_TO_THREE);
    expect(up.toArray()).toEqual([0, 1, 0]);
    expect(east.toArray()).toEqual([1, 0, 0]);
    expect(north.toArray()).toEqual([0, 0, -1]);
  });

  it('ksaToThree/threeToKsa agree with the matrix and invert each other', () => {
    const p = { x: 1.5, y: -2.25, z: 3.75 }; // up, east, north
    const viaMatrix = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(KSA_STATIC_TO_THREE);
    expect(ksaToThree(p).toArray()).toEqual(viaMatrix.toArray());
    expect(threeToKsa(ksaToThree(p))).toEqual(p);
  });

  it('calibration: the Core pad stacks along three +Y (heights) with Y/Z spread horizontal', () => {
    // PadGrateA sits at KSA Position X=1.4235 (a vertical lift): in three it must be +Y.
    const padGrate = ksaToThree({ x: 1.4235, y: 0, z: 0 });
    expect(padGrate.y).toBeCloseTo(1.4235, 9);
    expect(padGrate.x).toBe(0);
    expect(padGrate.z).toBe(-0);
    // CrawlerRamp at KSA Z=32.6905 (north of the pad): three −Z.
    const ramp = ksaToThree({ x: 0.6366, y: 0, z: 32.6905 });
    expect(ramp.z).toBeCloseTo(-32.6905, 9);
  });
});
