import { describe, it, expect } from 'vitest';
import {
  colliderExtents,
  LIQUID_GEN_DEFAULTS,
  liquidGeometry,
  RCS_GEN_DEFAULTS,
  rcsGeometry,
  rcsLayout,
  SRB_GEN_DEFAULTS,
  srbGeometry,
  type RcsNozzleSpec,
} from './wizardGeometry';

/** Every generated box is unrotated and laid along X, so a direction must stay unit length. */
function length(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

describe('liquidGeometry', () => {
  it('lays the bell at the origin and the body forward of it (plan §6.1 defaults)', () => {
    const g = liquidGeometry(LIQUID_GEN_DEFAULTS);
    expect(g.boxes[0]).toEqual({
      name: 'Bell',
      primitive: { kind: 'box', params: { width: 1.2, height: 1.2, depth: 1.2 } },
      position: { x: 0, y: 0, z: 0 },
    });
    expect(g.boxes[1]).toEqual({
      name: 'Body',
      primitive: { kind: 'box', params: { width: 2.5, height: 1.2, depth: 1.2 } },
      position: { x: 1.85, y: 0, z: 0 },
    });
    expect(g.hostIndex).toBe(0);
    expect(g.attachNodeX).toBe(3.1);
    expect(g.tankCenterX).toBe(1.85);
    expect(g.exhaustLocation).toEqual({ x: -0.6, y: 0, z: 0 });
    expect(g.suggestedExitDiameterM).toBe(1.1);
  });

  it('rounds the suggested exit diameter to one decimal', () => {
    const g = liquidGeometry({ ...LIQUID_GEN_DEFAULTS, bellCrossM: 2.5 });
    expect(g.suggestedExitDiameterM).toBe(2.3); // 2.5 × 0.9 = 2.25 → 2.3
  });
});

describe('srbGeometry', () => {
  it('plugs the nozzle block at the origin and the casing forward of it (plan §6.2)', () => {
    const g = srbGeometry(SRB_GEN_DEFAULTS, 1);
    expect(g.boxes[0]).toEqual({
      name: 'Nozzle Block',
      primitive: { kind: 'box', params: { width: 0.6, height: 0.6, depth: 0.6 } },
      position: { x: 0, y: 0, z: 0 },
    });
    expect(g.boxes[1]).toEqual({
      name: 'Casing',
      primitive: { kind: 'box', params: { width: 2, height: 1, depth: 1 } },
      position: { x: 1.3, y: 0, z: 0 },
    });
    expect(g.hostIndex).toBe(1);
    expect(g.attachNodeX).toBe(2.3);
    expect(g.exhaustLocation).toEqual({ x: -0.3, y: 0, z: 0 });
  });

  it('centres one grain segment on the casing', () => {
    const g = srbGeometry(SRB_GEN_DEFAULTS, 1);
    expect(g.grainCenterXs).toEqual([1.3]);
    expect(g.grainSegmentLengthM).toBe(2);
  });

  it('splits two grain segments evenly along the casing', () => {
    const g = srbGeometry(SRB_GEN_DEFAULTS, 2);
    expect(g.grainCenterXs).toEqual([0.8, 1.8]);
    expect(g.grainSegmentLengthM).toBe(1);
  });

  it('splits three grain segments evenly along the casing', () => {
    const g = srbGeometry(SRB_GEN_DEFAULTS, 3);
    expect(g.grainCenterXs).toHaveLength(3);
    expect(g.grainCenterXs[0]).toBeCloseTo(0.6333333333, 9);
    expect(g.grainCenterXs[1]).toBeCloseTo(1.3, 9);
    expect(g.grainCenterXs[2]).toBeCloseTo(1.9666666667, 9);
    expect(g.grainSegmentLengthM).toBeCloseTo(2 / 3, 12);
  });
});

describe('rcsGeometry', () => {
  it('is one cube at the origin with a forward-face attach node (plan §6.3)', () => {
    const g = rcsGeometry(RCS_GEN_DEFAULTS);
    expect(g.boxes).toEqual([
      {
        name: 'Thruster Block',
        primitive: { kind: 'box', params: { width: 0.3, height: 0.3, depth: 0.3 } },
        position: { x: 0, y: 0, z: 0 },
      },
    ]);
    expect(g.hostIndex).toBe(0);
    expect(g.attachNodeX).toBe(0.15);
  });
});

describe('rcsLayout', () => {
  const quad: RcsNozzleSpec[] = [
    { location: { x: 0, y: 0.15, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
    { location: { x: 0, y: -0.15, z: 0 }, direction: { x: 0, y: -1, z: 0 } },
    { location: { x: 0, y: 0, z: 0.15 }, direction: { x: 0, y: 0, z: 1 } },
    { location: { x: 0, y: 0, z: -0.15 }, direction: { x: 0, y: 0, z: -1 } },
  ];

  it('fires a single nozzle aft', () => {
    expect(rcsLayout('single', 0.15)).toEqual([
      { location: { x: -0.15, y: 0, z: 0 }, direction: { x: -1, y: 0, z: 0 } },
    ]);
  });

  it('puts the quad on ±Y then ±Z, in that order', () => {
    expect(rcsLayout('quad', 0.15)).toEqual(quad);
  });

  it('appends ±X to the quad for six', () => {
    expect(rcsLayout('six', 0.15)).toEqual([
      ...quad,
      { location: { x: 0.15, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      { location: { x: -0.15, y: 0, z: 0 }, direction: { x: -1, y: 0, z: 0 } },
    ]);
  });

  it('emits unit-length directions for every preset', () => {
    for (const preset of ['single', 'quad', 'six'] as const) {
      for (const nozzle of rcsLayout(preset, 0.15)) {
        expect(length(nozzle.direction)).toBeCloseTo(1, 12);
      }
    }
  });
});

describe('colliderExtents', () => {
  it('wraps the liquid bell + body in a box (plan §6.4)', () => {
    expect(colliderExtents('liquid', LIQUID_GEN_DEFAULTS)).toEqual({
      shape: 'Box',
      center: { x: 1.25, y: 0, z: 0 },
      size: { x: 3.7, y: 1.2, z: 1.2 },
    });
  });

  it('takes the larger cross-section when bell and body differ', () => {
    expect(colliderExtents('liquid', { ...LIQUID_GEN_DEFAULTS, bodyCrossM: 2 })).toEqual({
      shape: 'Box',
      center: { x: 1.25, y: 0, z: 0 },
      size: { x: 3.7, y: 2, z: 2 },
    });
  });

  it('wraps the SRB in an X-axis cylinder', () => {
    expect(colliderExtents('srb', SRB_GEN_DEFAULTS)).toEqual({
      shape: 'Cylinder',
      center: { x: 1, y: 0, z: 0 },
      size: { x: 2.6, y: 1, z: 1 },
    });
  });

  it('wraps the RCS block in its own box', () => {
    expect(colliderExtents('rcs', RCS_GEN_DEFAULTS)).toEqual({
      shape: 'Box',
      center: { x: 0, y: 0, z: 0 },
      size: { x: 0.3, y: 0.3, z: 0.3 },
    });
  });
});
