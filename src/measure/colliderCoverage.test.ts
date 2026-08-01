import { describe, it, expect } from 'vitest';
import {
  colliderVolumeM3,
  evaluateCoverage,
  pointInCollider,
  type PlacedCollider,
} from './colliderCoverage';
import { DEFAULT_LAYER_ID, identityTransform, type ColliderShape, type Vec3 } from '../ksa/types';

const IDENTITY: readonly [number, number, number, number] = [0, 0, 0, 1];

function placed(
  shape: ColliderShape,
  size: Vec3,
  position: Vec3 = { x: 0, y: 0, z: 0 },
  quaternion = IDENTITY,
): PlacedCollider {
  return {
    collider: {
      id: 'c',
      shape,
      ownerTemplateId: null,
      ...identityTransform(),
      scale: size,
      layerId: DEFAULT_LAYER_ID,
    },
    position,
    quaternion,
  };
}

const p = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

describe('pointInCollider', () => {
  it('tests a box against its HALF-extents (size is the full extent)', () => {
    const box = placed('Box', p(2, 4, 6));
    expect(pointInCollider(p(0.9, 1.9, 2.9), box)).toBe(true);
    expect(pointInCollider(p(1, 2, 3), box)).toBe(true); // exactly on the corner
    expect(pointInCollider(p(1.1, 0, 0), box)).toBe(false);
    expect(pointInCollider(p(0, 0, 3.1), box)).toBe(false);
  });

  it('tests a sphere against half its diameter', () => {
    const sphere = placed('Sphere', p(2, 2, 2));
    expect(pointInCollider(p(0, 0.99, 0), sphere)).toBe(true);
    expect(pointInCollider(p(0.8, 0.8, 0), sphere)).toBe(false); // hypot 1.13 > 1
  });

  it('tests a cylinder as Y-aligned: axial half-length + radial distance', () => {
    const cyl = placed('Cylinder', p(2, 10, 2));
    expect(pointInCollider(p(0.99, 4.9, 0), cyl)).toBe(true);
    expect(pointInCollider(p(0, 5.1, 0), cyl)).toBe(false); // past the flat cap
    expect(pointInCollider(p(1.1, 0, 0), cyl)).toBe(false); // outside the barrel
  });

  it('tests a capsule against its SEGMENT, so the caps bulge past the cylinder', () => {
    // Outer height 4, diameter 2 ⇒ segment 2 (|y| ≤ 1), caps add r=1 to |y| ≤ 2.
    const cap = placed('Capsule', p(2, 4, 2));
    expect(pointInCollider(p(0, 1.9, 0), cap)).toBe(true); // inside the top cap
    expect(pointInCollider(p(0, 2, 0), cap)).toBe(true); // the very tip
    expect(pointInCollider(p(0, 2.1, 0), cap)).toBe(false);
    // At the cap's height the radius has shrunk — a cylinder would still contain this.
    expect(pointInCollider(p(0.99, 1.8, 0), cap)).toBe(false);
    expect(pointInCollider(p(0.99, 0.5, 0), cap)).toBe(true); // straight barrel section
  });

  it('honours the collider’s position and orientation', () => {
    // A cylinder laid along X by RotZ(-90°), centred at (5, 0, 0).
    const q: readonly [number, number, number, number] = [0, 0, -Math.SQRT1_2, Math.SQRT1_2];
    const cyl = placed('Cylinder', p(2, 10, 2), p(5, 0, 0), q);
    expect(pointInCollider(p(9.9, 0, 0), cyl)).toBe(true); // 4.9 m along the barrel
    expect(pointInCollider(p(5, 4.9, 0), cyl)).toBe(false); // that axis is now radial
  });
});

describe('colliderVolumeM3', () => {
  it('matches the closed forms', () => {
    expect(colliderVolumeM3(placed('Box', p(2, 3, 4)).collider)).toBeCloseTo(24, 9);
    expect(colliderVolumeM3(placed('Sphere', p(2, 2, 2)).collider)).toBeCloseTo(
      (4 / 3) * Math.PI,
      9,
    );
    expect(colliderVolumeM3(placed('Cylinder', p(2, 5, 2)).collider)).toBeCloseTo(Math.PI * 5, 9);
    // Capsule = barrel over the segment + one whole sphere of caps.
    expect(colliderVolumeM3(placed('Capsule', p(2, 4, 2)).collider)).toBeCloseTo(
      Math.PI * 2 + (4 / 3) * Math.PI,
      9,
    );
  });
});

describe('evaluateCoverage', () => {
  const cube = [
    p(-1, -1, -1),
    p(1, -1, -1),
    p(1, 1, -1),
    p(-1, 1, -1),
    p(-1, -1, 1),
    p(1, -1, 1),
    p(1, 1, 1),
    p(-1, 1, 1),
  ];

  it('reports full coverage when one collider wraps everything', () => {
    const r = evaluateCoverage(cube, [placed('Box', p(2, 2, 2))]);
    expect(r.sampled).toBe(8);
    expect(r.covered).toBe(8);
    expect(r.fraction).toBe(1);
    expect(r.uncovered).toEqual([]);
  });

  it('lists the points that fall through a gap', () => {
    // Only the lower half is wrapped.
    const r = evaluateCoverage(cube, [placed('Box', p(2, 1, 2), p(0, -0.5, 0))]);
    expect(r.covered).toBe(4);
    expect(r.fraction).toBe(0.5);
    expect(r.uncovered.every((u) => u.y === 1)).toBe(true);
  });

  it('counts a point covered by ANY collider (overlap is free in KSA)', () => {
    const r = evaluateCoverage(cube, [
      placed('Box', p(2, 1, 2), p(0, -0.5, 0)),
      placed('Box', p(2, 1, 2), p(0, 0.5, 0)),
    ]);
    expect(r.fraction).toBe(1);
  });

  it('reports bloat against the sample AABB volume', () => {
    // Sample AABB is 2×2×2 = 8 m³; a 4×4×4 box is 64 m³ ⇒ 8× bloat.
    const r = evaluateCoverage(cube, [placed('Box', p(4, 4, 4))]);
    expect(r.meshBoundsVolumeM3).toBeCloseTo(8, 9);
    expect(r.colliderVolumeM3).toBeCloseTo(64, 9);
    expect(r.bloat).toBeCloseTo(8, 9);
  });

  it('handles no colliders and no points without dividing by zero', () => {
    const none = evaluateCoverage(cube, []);
    expect(none.covered).toBe(0);
    expect(none.fraction).toBe(0);
    expect(none.bloat).toBeCloseTo(0, 9);

    const empty = evaluateCoverage([], [placed('Box', p(1, 1, 1))]);
    expect(empty.fraction).toBe(1); // nothing to miss
    expect(empty.bloat).toBeNull(); // degenerate bounds ⇒ no ratio
  });

  it('caps the RETURNED uncovered points without distorting the counts', () => {
    const many = Array.from({ length: 500 }, (_, i) => p(100 + i, 0, 0));
    const r = evaluateCoverage(many, [placed('Box', p(1, 1, 1))], 10);
    expect(r.sampled).toBe(500);
    expect(r.covered).toBe(0);
    expect(r.uncovered).toHaveLength(10);
  });
});
