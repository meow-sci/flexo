import { describe, it, expect } from 'vitest';
import { capsuleEdges, clampSegments, cylinderEdges, RECT_EDGES, sphereEdges } from './wireShapes';

/** Every builder returns flat xyz segment PAIRS; the bounds must stay in the unit box. */
function bounds(positions: readonly number[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], positions[i + a]);
      max[a] = Math.max(max[a], positions[i + a]);
    }
  }
  return { min, max };
}

describe('wireShapes', () => {
  it('emits whole segment pairs', () => {
    for (const p of [RECT_EDGES, cylinderEdges(8), sphereEdges(8), capsuleEdges(0.5, 8)]) {
      expect(p.length % 6).toBe(0);
      expect(p.length).toBeGreaterThan(0);
    }
  });

  it('normalises every shape into the unit box [-0.5, 0.5]³', () => {
    // This is the contract that makes the owning node's `scale` mean "size in meters".
    for (const p of [RECT_EDGES, cylinderEdges(8), sphereEdges(8), capsuleEdges(0.4, 8)]) {
      const { min, max } = bounds(p);
      for (let a = 0; a < 3; a++) {
        expect(min[a]).toBeGreaterThanOrEqual(-0.5 - 1e-9);
        expect(max[a]).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });

  it('fills the full unit box on every axis (a shape must not float inside its size)', () => {
    for (const p of [RECT_EDGES, cylinderEdges(8), sphereEdges(8), capsuleEdges(0.4, 8)]) {
      const { min, max } = bounds(p);
      for (let a = 0; a < 3; a++) {
        expect(max[a] - min[a]).toBeCloseTo(1, 2);
      }
    }
  });

  it('draws the capsule’s caps as normalised ELLIPSES so the group scale un-squashes them', () => {
    // aspect = diameter/height. At 0.25 the caps occupy 1/8 of the height at each end but
    // the full 0.5 across, which the non-uniform node scale turns into true hemispheres.
    const { min, max } = bounds(capsuleEdges(0.25, 6));
    expect(max[1]).toBeCloseTo(0.5, 6);
    expect(min[1]).toBeCloseTo(-0.5, 6);
    expect(max[0]).toBeCloseTo(0.5, 6);

    // A capsule whose diameter equals its height IS a sphere: the caps meet in the middle.
    const sphereLike = bounds(capsuleEdges(1, 6));
    expect(sphereLike.max[1]).toBeCloseTo(0.5, 6);
  });

  it('clamps the segment count into a sane range', () => {
    expect(clampSegments(0)).toBe(2);
    expect(clampSegments(1000)).toBe(64);
    expect(clampSegments(Number.NaN)).toBe(16);
    expect(clampSegments(12.4)).toBe(12);
  });

  it('scales line count with the requested segments (curved shapes only)', () => {
    expect(cylinderEdges(16).length).toBeGreaterThan(cylinderEdges(4).length);
    expect(sphereEdges(16).length).toBeGreaterThan(sphereEdges(4).length);
    expect(capsuleEdges(0.5, 16).length).toBeGreaterThan(capsuleEdges(0.5, 4).length);
  });
});
