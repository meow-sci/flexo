import { describe, expect, it } from 'vitest';
import { boundsCenter, frameDistance } from './cameraFraming';

const CUBE = { x: 1, y: 1, z: 1 };
const FOV = 50;

describe('frameDistance', () => {
  it('fits a unit cube in front of the camera, not on top of it', () => {
    const radius = 0.5 * Math.sqrt(3);
    const d = frameDistance(CUBE, FOV, 16 / 9);
    expect(d).toBeGreaterThan(radius);
    expect(d).toBeLessThan(10);
  });

  it('falls back to a default distance for a degenerate (point) selection', () => {
    expect(frameDistance({ x: 0, y: 0, z: 0 }, FOV, 16 / 9)).toBe(5);
  });

  it('backs off further on a narrow viewport, where the horizontal field is the tighter fit', () => {
    const square = frameDistance(CUBE, FOV, 1);
    const tall = frameDistance(CUBE, FOV, 0.5);
    const wide = frameDistance(CUBE, FOV, 2);
    // aspect < 1 makes the horizontal half-angle the smaller of the two, so the camera must
    // retreat; at aspect >= 1 the vertical fov binds and the distance is the square case.
    expect(tall).toBeGreaterThan(square);
    expect(wide).toBeCloseTo(square, 10);
  });

  it('scales linearly with the size of the selection', () => {
    const one = frameDistance(CUBE, FOV, 16 / 9);
    const ten = frameDistance({ x: 10, y: 10, z: 10 }, FOV, 16 / 9);
    expect(ten).toBeCloseTo(one * 10, 10);
  });
});

describe('boundsCenter', () => {
  it('is the midpoint of the box', () => {
    expect(boundsCenter({ min: { x: -1, y: 0, z: 2 }, max: { x: 3, y: 4, z: 2 } })).toEqual({
      x: 1,
      y: 2,
      z: 2,
    });
  });
});
