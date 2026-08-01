import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { EulerXYZ, Vec3 } from '../ksa/types';
import type {
  ChainOp,
  GridArrayOp,
  LinearArrayOp,
  RadialArrayOp,
  RotateOp,
  ScaleOp,
  TranslateOp,
} from '../state/chainStore';
import type { PlacementTransform } from '../state/editorStore';
import {
  centroidOf,
  quatFromEulerDeg,
  rotatedAroundOriginTransform,
  scaledAroundOriginTransform,
  translatedTransform,
} from './bulkTransform';
import { evalChain, MAX_CHAIN_INSTANCES } from './chainMath';

/**
 * The chain engine is the ONLY place the plan's semantics live, so these tests pin the
 * semantics themselves, not the implementation: count includes the original, exactly one
 * group stays the seed group, linear arrays iterate their delta (they never scale Euler
 * angles), a full-circle radial divides by `count` while a partial sweep divides by
 * `count - 1`, and arrays compose.
 *
 * Ops are built by hand here — bypassing `clampOp` on purpose, since the engine must be
 * the authority on validity for sessions that never went through the store's clamp.
 */

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const ONE: Vec3 = { x: 1, y: 1, z: 1 };

function seed(position: Vec3, rotation: EulerXYZ = ZERO, scale: Vec3 = ONE): PlacementTransform {
  return { position: { ...position }, rotation: { ...rotation }, scale: { ...scale } };
}

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
}

function translate(delta: Vec3): TranslateOp {
  return { id: 'translate-op', kind: 'translate', delta };
}

function rotate(
  degreesDeg: EulerXYZ,
  pivot: RotateOp['pivot'] = 'centroid',
  center: Vec3 = ZERO,
): RotateOp {
  return { id: 'rotate-op', kind: 'rotate', degreesDeg, pivot, center };
}

function scale(
  factor: Vec3,
  mode: ScaleOp['mode'] = 'smart',
  pivot: ScaleOp['pivot'] = 'centroid',
  center: Vec3 = ZERO,
): ScaleOp {
  return { id: 'scale-op', kind: 'scale', factor, mode, pivot, center };
}

function linear(patch: Partial<Omit<LinearArrayOp, 'id' | 'kind'>>): LinearArrayOp {
  return {
    id: 'linear-op',
    kind: 'linear-array',
    count: 3,
    offset: { x: 1, y: 0, z: 0 },
    stepRotateDeg: ZERO,
    stepScale: ONE,
    ...patch,
  };
}

function radial(patch: Partial<Omit<RadialArrayOp, 'id' | 'kind'>>): RadialArrayOp {
  return {
    id: 'radial-op',
    kind: 'radial-array',
    count: 6,
    axis: 'x',
    center: ZERO,
    startAngleDeg: 0,
    sweepDeg: 360,
    orient: 'rotate',
    radialOffset: 0,
    axialStep: 0,
    ...patch,
  };
}

function grid(patch: Partial<Omit<GridArrayOp, 'id' | 'kind'>>): GridArrayOp {
  return {
    id: 'grid-op',
    kind: 'grid-array',
    plane: 'xy',
    countA: 3,
    countB: 3,
    spacingA: 1,
    spacingB: 1,
    centered: false,
    ...patch,
  };
}

/** Euler triple as a quaternion, for comparing orientations without Euler aliasing. */
function quatOf(rotation: EulerXYZ): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation.x, rotation.y, rotation.z, 'ZYX'),
  );
}

function expectSameOrientation(actual: EulerXYZ, expected: EulerXYZ): void {
  expect(quatOf(actual).angleTo(quatOf(expected))).toBeCloseTo(0, 6);
}

describe('evalChain — no ops', () => {
  it('returns the seeds untouched as a single seed group', () => {
    const seeds = [seed({ x: 1, y: 2, z: 3 }), seed({ x: -4, y: 0, z: 0.5 })];
    const result = evalChain(seeds, []);

    expect(result.error).toBeNull();
    expect(result.totalInstances).toBe(2);
    expect(result.newCount).toBe(0);
    expect(result.instances.map((i) => i.seedIndex)).toEqual([0, 1]);
    expect(result.instances.every((i) => i.isSeed)).toBe(true);
    expectVec(result.instances[0].transform.position, seeds[0].position);
    expectVec(result.instances[1].transform.position, seeds[1].position);
  });
});

describe('evalChain — transform steps (parity with the bulk transform panel)', () => {
  it('translate moves every seed by the delta', () => {
    const seeds = [seed({ x: 0, y: 0, z: 0 }), seed({ x: 2, y: 1, z: -1 })];
    const result = evalChain(seeds, [translate({ x: 0.5, y: -2, z: 3 })]);

    expectVec(result.instances[0].transform.position, { x: 0.5, y: -2, z: 3 });
    expectVec(result.instances[1].transform.position, { x: 2.5, y: -1, z: 2 });
    expect(result.newCount).toBe(0);
  });

  it('rotate 90° about Y around the Part origin maps (1,0,0) to (0,0,-1)', () => {
    const result = evalChain(
      [seed({ x: 1, y: 0, z: 0 })],
      [rotate({ x: 0, y: 90, z: 0 }, 'origin')],
    );

    expectVec(result.instances[0].transform.position, { x: 0, y: 0, z: -1 });
    expectSameOrientation(result.instances[0].transform.rotation, { x: 0, y: Math.PI / 2, z: 0 });
  });

  it('smart scale about the centroid matches scaledAroundOriginTransform exactly', () => {
    const seeds = [
      seed({ x: 0, y: 0, z: 0 }, ZERO, { x: 2, y: 2, z: 2 }),
      seed({ x: 4, y: 2, z: -2 }),
    ];
    const factor = { x: 0.25, y: 0.5, z: 2 };
    const origin = centroidOf(seeds.map((s) => s.position));
    const result = evalChain(seeds, [scale(factor, 'smart', 'centroid')]);

    for (const [index, s] of seeds.entries()) {
      const expected = scaledAroundOriginTransform(s, factor, origin);
      expectVec(result.instances[index].transform.position, expected.position);
      expectVec(result.instances[index].transform.scale, expected.scale);
    }
  });

  it('in-place scale leaves positions alone', () => {
    const seeds = [seed({ x: 4, y: 2, z: -2 })];
    const result = evalChain(seeds, [scale({ x: 3, y: 3, z: 3 }, 'inPlace')]);

    expectVec(result.instances[0].transform.position, { x: 4, y: 2, z: -2 });
    expectVec(result.instances[0].transform.scale, { x: 3, y: 3, z: 3 });
  });
});

describe('evalChain — linear array', () => {
  it('spaces copies by the iterated offset, keeping one seed group', () => {
    const seeds = [seed({ x: 0, y: 0, z: 0 }), seed({ x: 0, y: 1, z: 0 })];
    const result = evalChain(seeds, [linear({ count: 3, offset: { x: 2, y: 0, z: 0 } })]);

    expect(result.totalInstances).toBe(6);
    expect(result.newCount).toBe(4);
    expect(result.instances.map((i) => i.transform.position.x)).toEqual([0, 0, 2, 2, 4, 4]);
    expect(result.instances.filter((i) => i.isSeed)).toHaveLength(2);
    expect(result.instances.slice(0, 2).every((i) => i.isSeed)).toBe(true);
  });

  it('issue example: count 15, offset (1,1,0), 15° step twist about X (a staircase)', () => {
    const base = seed({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0.4 });
    const op = linear({
      count: 15,
      offset: { x: 1, y: 1, z: 0 },
      stepRotateDeg: { x: 15, y: 0, z: 0 },
    });
    const result = evalChain([base], [op]);

    expect(result.totalInstances).toBe(15);
    expect(result.newCount).toBe(14);

    const qStep = quatFromEulerDeg({ x: 15, y: 0, z: 0 });
    const accumulated = new THREE.Quaternion();
    for (let k = 0; k < 15; k++) {
      if (k > 0) accumulated.multiply(qStep);
      const offset = { x: k, y: k, z: 0 };
      const expected =
        k === 0
          ? base
          : rotatedAroundOriginTransform(
              translatedTransform(base, offset),
              accumulated,
              offset, // the copy's own moved centroid (single seed at the origin)
            );
      expectVec(result.instances[k].transform.position, { x: k, y: k, z: 0 });
      expectSameOrientation(result.instances[k].transform.rotation, expected.rotation);
    }
  });

  it('accumulates the step quaternion instead of scaling Euler angles', () => {
    const base = seed({ x: 0, y: 0, z: 0 });
    const step: EulerXYZ = { x: 15, y: 30, z: 0 };
    const result = evalChain([base], [linear({ count: 3, offset: ZERO, stepRotateDeg: step })]);

    const qStep = quatFromEulerDeg(step);
    const twice = qStep.clone().multiply(qStep);
    const naive = quatFromEulerDeg({ x: 30, y: 60, z: 0 });
    const actual = quatOf(result.instances[2].transform.rotation);

    expect(actual.angleTo(twice)).toBeCloseTo(0, 6);
    // Regression pin: the naive "k times the angle" reading is a DIFFERENT rotation.
    expect(actual.angleTo(naive)).toBeGreaterThan(1e-3);
  });

  it('compounds the per-step scale without touching positions', () => {
    const base = seed({ x: 0, y: 0, z: 0 }, ZERO, { x: 1, y: 1, z: 1 });
    const result = evalChain(
      [base],
      [linear({ count: 3, offset: { x: 1, y: 0, z: 0 }, stepScale: { x: 2, y: 2, z: 2 } })],
    );

    expect(result.instances.map((i) => i.transform.scale.x)).toEqual([1, 2, 4]);
    expect(result.instances.map((i) => i.transform.position.x)).toEqual([0, 1, 2]);
  });
});

describe('evalChain — radial array', () => {
  it('rings an off-axis seed about +X and turns each copy with the ring', () => {
    const base = seed({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 0.3 });
    const result = evalChain([base], [radial({ count: 4, sweepDeg: 360 })]);

    expect(result.totalInstances).toBe(4);
    expectVec(result.instances[0].transform.position, { x: 0, y: 3, z: 0 });
    expectVec(result.instances[1].transform.position, { x: 0, y: 0, z: 3 });
    expectVec(result.instances[2].transform.position, { x: 0, y: -3, z: 0 });
    expectVec(result.instances[3].transform.position, { x: 0, y: 0, z: -3 });

    const q90x = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const expected = rotatedAroundOriginTransform(base, q90x, ZERO);
    expectSameOrientation(result.instances[1].transform.rotation, expected.rotation);
  });

  it("orient 'keep' orbits the position and leaves every orientation alone", () => {
    const base = seed({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 0.3 });
    const result = evalChain([base], [radial({ count: 4, sweepDeg: 360, orient: 'keep' })]);

    expectVec(result.instances[1].transform.position, { x: 0, y: 0, z: 3 });
    expectVec(result.instances[2].transform.position, { x: 0, y: -3, z: 0 });
    for (const instance of result.instances) {
      expect(instance.transform.rotation).toEqual(base.rotation);
    }
  });

  it('divides a partial sweep by count-1 (endpoint inclusive) and a full circle by count', () => {
    const base = seed({ x: 0, y: 3, z: 0 });

    const fan = evalChain([base], [radial({ count: 3, sweepDeg: 180 })]);
    expectVec(fan.instances[0].transform.position, { x: 0, y: 3, z: 0 });
    expectVec(fan.instances[1].transform.position, { x: 0, y: 0, z: 3 });
    expectVec(fan.instances[2].transform.position, { x: 0, y: -3, z: 0 });

    const ring = evalChain([base], [radial({ count: 3, sweepDeg: 360 })]);
    const rad = (deg: number) => (deg * Math.PI) / 180;
    expectVec(ring.instances[1].transform.position, {
      x: 0,
      y: 3 * Math.cos(rad(120)),
      z: 3 * Math.sin(rad(120)),
    });
    expectVec(ring.instances[2].transform.position, {
      x: 0,
      y: 3 * Math.cos(rad(240)),
      z: 3 * Math.sin(rad(240)),
    });
  });

  it('pushes a seed sitting ON the axis out along the fallback direction', () => {
    const base = seed({ x: 5, y: 0, z: 0 });
    const result = evalChain([base], [radial({ count: 4, sweepDeg: 360, radialOffset: 2 })]);

    expectVec(result.instances[0].transform.position, { x: 5, y: 2, z: 0 });
    expectVec(result.instances[1].transform.position, { x: 5, y: 0, z: 2 });
    expectVec(result.instances[2].transform.position, { x: 5, y: -2, z: 0 });
    expectVec(result.instances[3].transform.position, { x: 5, y: 0, z: -2 });
  });

  it('rises along the axis for a helix', () => {
    const base = seed({ x: 0, y: 3, z: 0 });
    const result = evalChain([base], [radial({ count: 4, sweepDeg: 360, axialStep: 0.5 })]);

    expect(result.instances.map((i) => i.transform.position.x)).toEqual([0, 0.5, 1, 1.5]);
    expectVec(result.instances[1].transform.position, { x: 0.5, y: 0, z: 3 });
  });

  it('a start angle moves the seed group too (it stays the seed group)', () => {
    const base = seed({ x: 0, y: 3, z: 0 });
    const result = evalChain([base], [radial({ count: 4, sweepDeg: 360, startAngleDeg: 45 })]);

    const rad45 = Math.PI / 4;
    expect(result.instances[0].isSeed).toBe(true);
    expectVec(result.instances[0].transform.position, {
      x: 0,
      y: 3 * Math.cos(rad45),
      z: 3 * Math.sin(rad45),
    });
  });

  it('rotates a multi-seed group as one rigid unit', () => {
    const seeds = [seed({ x: 0, y: 3, z: 0 }), seed({ x: 0, y: 4, z: 0 })];
    const result = evalChain(seeds, [radial({ count: 2, sweepDeg: 180 })]);

    expect(result.totalInstances).toBe(4);
    expect(result.instances.filter((i) => i.isSeed)).toHaveLength(2);
    expectVec(result.instances[2].transform.position, { x: 0, y: -3, z: 0 });
    expectVec(result.instances[3].transform.position, { x: 0, y: -4, z: 0 });

    const before = seeds[1].position.y - seeds[0].position.y;
    const after =
      result.instances[3].transform.position.y - result.instances[2].transform.position.y;
    expect(after).toBeCloseTo(-before, 6); // the 180° turn carried the whole group
  });
});

describe('evalChain — grid array', () => {
  it('lays out rows × columns on the chosen plane', () => {
    const base = seed({ x: 0, y: 0, z: 0 });
    const result = evalChain(
      [base],
      [grid({ plane: 'xz', countA: 3, countB: 2, spacingA: 2, spacingB: 1 })],
    );

    expect(result.totalInstances).toBe(6);
    expect(result.newCount).toBe(5);
    expect(result.instances.map((i) => [i.transform.position.x, i.transform.position.z])).toEqual([
      [0, 0],
      [0, 1],
      [2, 0],
      [2, 1],
      [4, 0],
      [4, 1],
    ]);
    expect(result.instances[0].isSeed).toBe(true);
    expect(result.instances.filter((i) => i.isSeed)).toHaveLength(1);
  });

  it('centering shifts the whole grid (the seed group moves with it)', () => {
    const base = seed({ x: 0, y: 0, z: 0 });
    const result = evalChain(
      [base],
      [grid({ plane: 'xz', countA: 3, countB: 2, spacingA: 2, spacingB: 1, centered: true })],
    );

    expectVec(result.instances[0].transform.position, { x: -2, y: 0, z: -0.5 });
    expectVec(result.instances[5].transform.position, { x: 2, y: 0, z: 0.5 });
    expect(result.instances[0].isSeed).toBe(true);
  });
});

describe('evalChain — composition', () => {
  it('two linear arrays compose into a grid', () => {
    const base = seed({ x: 0, y: 0, z: 0 });
    const result = evalChain(
      [base],
      [
        linear({ count: 2, offset: { x: 4, y: 0, z: 0 } }),
        linear({ count: 3, offset: { x: 0, y: 2, z: 0 } }),
      ],
    );

    expect(result.totalInstances).toBe(6);
    expect(result.instances.map((i) => [i.transform.position.x, i.transform.position.y])).toEqual([
      [0, 0],
      [0, 2],
      [0, 4],
      [4, 0],
      [4, 2],
      [4, 4],
    ]);
    expect(result.instances.filter((i) => i.isSeed)).toHaveLength(1);
  });

  it('a transform step after an array applies to every instance', () => {
    const base = seed({ x: 0, y: 3, z: 0 });
    const result = evalChain(
      [base],
      [radial({ count: 4, sweepDeg: 360 }), translate({ x: 0, y: 5, z: 0 })],
    );

    expect(result.totalInstances).toBe(4);
    expectVec(result.instances[0].transform.position, { x: 0, y: 8, z: 0 });
    expectVec(result.instances[1].transform.position, { x: 0, y: 5, z: 3 });
    expectVec(result.instances[2].transform.position, { x: 0, y: 2, z: 0 });
    expectVec(result.instances[3].transform.position, { x: 0, y: 5, z: -3 });
  });
});

describe('evalChain — errors', () => {
  const base = seed({ x: 0, y: 1, z: 0 });

  function expectEmpty(error: string, ops: ChainOp[], seeds = [base]): void {
    const result = evalChain(seeds, ops);
    expect(result.error).toBe(error);
    expect(result.instances).toEqual([]);
    expect(result.totalInstances).toBe(0);
    expect(result.newCount).toBe(0);
  }

  it('reports missing seeds', () => {
    expectEmpty('Seeds no longer exist', [], []);
  });

  it('rejects an array count below 2', () => {
    expectEmpty('Count must be ≥ 2', [linear({ count: 1 })]);
    expectEmpty('Count must be ≥ 2', [radial({ count: 1 })]);
  });

  it('rejects a grid that produces fewer than 2 instances', () => {
    expectEmpty('Grid must produce at least 2 instances', [grid({ countA: 1, countB: 1 })]);
  });

  it('rejects a zero sweep', () => {
    expectEmpty('Sweep must be non-zero', [radial({ sweepDeg: 0 })]);
  });

  it('rejects a non-positive scale (a mirror is not a chain step)', () => {
    expectEmpty('Scale must be positive', [scale({ x: 0, y: 1, z: 1 })]);
    expectEmpty('Scale must be positive', [linear({ stepScale: { x: -1, y: 1, z: 1 } })]);
  });

  it('rejects oversized arrays and oversized totals', () => {
    expectEmpty('Array too large (max 500)', [linear({ count: 501 })]);
    expectEmpty('Grid too large (max 500)', [grid({ countA: 30, countB: 30 })]);

    const seeds = [base, seed({ x: 1, y: 0, z: 0 }), seed({ x: 2, y: 0, z: 0 })];
    expectEmpty(
      `Too many instances (3000 > ${MAX_CHAIN_INSTANCES})`,
      [linear({ count: 500 }), linear({ count: 2 })],
      seeds,
    );
  });
});

describe('evalChain — purity', () => {
  it('never mutates the seeds or the ops', () => {
    const seeds = [
      seed({ x: 1, y: 2, z: 3 }, { x: 0.1, y: 0.2, z: 0.3 }),
      seed({ x: -1, y: 0, z: 0 }),
    ];
    const ops: ChainOp[] = [
      radial({ count: 3, sweepDeg: 180, radialOffset: 1, axialStep: 0.25 }),
      rotate({ x: 10, y: 20, z: 30 }, 'custom', { x: 1, y: 1, z: 1 }),
      linear({ count: 2, offset: { x: 1, y: 1, z: 1 }, stepScale: { x: 2, y: 2, z: 2 } }),
      grid({ countA: 2, countB: 2, centered: true }),
      scale({ x: 2, y: 2, z: 2 }, 'inPlace'),
      translate({ x: 1, y: 0, z: 0 }),
    ];
    const seedsBefore = structuredClone(seeds);
    const opsBefore = structuredClone(ops);

    const result = evalChain(seeds, ops);

    expect(result.error).toBeNull();
    expect(seeds).toEqual(seedsBefore);
    expect(ops).toEqual(opsBefore);
  });
});
