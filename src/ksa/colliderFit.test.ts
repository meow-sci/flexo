import { describe, it, expect } from 'vitest';
import { fitCollider, IDENTITY_QUAT, type Quat } from './colliderFit';
import type { Vec3 } from './types';

/** The 8 corners of an axis-aligned box centred at `c` with full extents `size`. */
function boxCorners(c: Vec3, size: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-0.5, 0.5])
    for (const sy of [-0.5, 0.5])
      for (const sz of [-0.5, 0.5])
        out.push({ x: c.x + sx * size.x, y: c.y + sy * size.y, z: c.z + sz * size.z });
  return out;
}

const near = (a: Vec3, b: Vec3, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
  expect(a.z).toBeCloseTo(b.z, digits);
};

describe('fitCollider', () => {
  const CENTRE = { x: 1, y: -2, z: 0.5 };
  const SIZE = { x: 2, y: 6, z: 1 };
  const corners = boxCorners(CENTRE, SIZE);

  it('returns null with nothing to fit', () => {
    expect(fitCollider('Box', [])).toBeNull();
  });

  it('fits a box to the AABB extents and centre', () => {
    const fit = fitCollider('Box', corners)!;
    near(fit.position, CENTRE);
    near(fit.size, SIZE);
    expect(fit.quaternion).toEqual(IDENTITY_QUAT);
  });

  it('fits a sphere to the circumscribing radius, axis-aligned', () => {
    const fit = fitCollider('Sphere', corners)!;
    near(fit.position, CENTRE);
    // Half-diagonal of a 2 × 6 × 1 box = hypot(1, 3, 0.5).
    const r = Math.hypot(1, 3, 0.5);
    expect(fit.size.x).toBeCloseTo(2 * r, 6);
    expect(fit.size.y).toBeCloseTo(fit.size.x, 6);
    // A sphere is rotation-invariant; inheriting the frame would just be XML noise.
    expect(fit.quaternion).toEqual(IDENTITY_QUAT);
  });

  it('lays a cylinder along the LONGEST axis with the enclosing radius', () => {
    const fit = fitCollider('Cylinder', corners)!;
    near(fit.position, CENTRE);
    // Longest extent is Y (6), so no re-orientation is needed: local Y IS the KSA axis.
    expect(fit.quaternion).toEqual(IDENTITY_QUAT);
    expect(fit.size.y).toBeCloseTo(6, 6);
    // Radius spans the X/Z corners: hypot(1, 0.5).
    expect(fit.size.x).toBeCloseTo(2 * Math.hypot(1, 0.5), 6);
    expect(fit.size.z).toBeCloseTo(fit.size.x, 6); // cylinder X and Z are one diameter
  });

  it('rotates the cylinder when the longest axis is X or Z', () => {
    // Long along X: the fit must rotate local +Y onto X.
    const alongX = boxCorners({ x: 0, y: 0, z: 0 }, { x: 8, y: 1, z: 1 });
    const fitX = fitCollider('Cylinder', alongX)!;
    expect(fitX.size.y).toBeCloseTo(8, 6); // barrel length always lands on local Y
    // RotZ(−90°) maps +Y → +X.
    expect(fitX.quaternion[2]).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(fitX.quaternion[3]).toBeCloseTo(Math.SQRT1_2, 6);

    const alongZ = boxCorners({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 8 });
    const fitZ = fitCollider('Cylinder', alongZ)!;
    expect(fitZ.size.y).toBeCloseTo(8, 6);
    // RotX(+90°) maps +Y → +Z.
    expect(fitZ.quaternion[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(fitZ.quaternion[3]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('fits in a rotated frame, so a tilted mesh gets a tilted collider', () => {
    // 90° about Z: the frame's local Y is world −X.
    const frame: Quat = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    // A box long along WORLD X — in the frame's space that is its local Y.
    const pts = boxCorners({ x: 0, y: 0, z: 0 }, { x: 8, y: 1, z: 1 });
    const fit = fitCollider('Cylinder', pts, frame)!;
    // The barrel length is still 8 and, because the frame already aligns with it, the
    // cylinder needs no extra axis rotation on top of the frame.
    expect(fit.size.y).toBeCloseTo(8, 6);
    near(fit.position, { x: 0, y: 0, z: 0 });
    expect(fit.quaternion[2]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('returns a capsule sized tip-to-tip (colliderSize subtracts the caps at emit)', () => {
    const fit = fitCollider('Capsule', corners)!;
    expect(fit.size.y).toBeCloseTo(6, 6);
    expect(fit.size.y).toBeGreaterThanOrEqual(fit.size.x); // never degenerates to a sphere
  });

  it('applies the margin as a fraction of every dimension', () => {
    // Core habitually shaves ~0.7% off a mesh AABB.
    const fit = fitCollider('Box', corners, IDENTITY_QUAT, -0.007)!;
    near(fit.size, { x: 2 * 0.993, y: 6 * 0.993, z: 1 * 0.993 });
    near(fit.position, CENTRE); // margin never moves the centre
  });

  it('normalizes the result, so a fit can never describe an illegal shape', () => {
    const skewed = boxCorners({ x: 0, y: 0, z: 0 }, { x: 4, y: 10, z: 1 });
    const fit = fitCollider('Cylinder', skewed)!;
    expect(fit.size.x).toBe(fit.size.z);
  });
});
