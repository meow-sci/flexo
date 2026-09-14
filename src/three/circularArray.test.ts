import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ColliderShape, Vec3 } from '../ksa/types';
import type { ChainAxis, CircularArrayOp, ScaleOp } from '../state/chainStore';
import type { PlacementTransform } from '../state/editorStore';
import { evalChain } from './chainMath';

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

function seed(
  position: Vec3 = ZERO,
  scale: Vec3 = { x: 4, y: 0.8, z: 4 },
  rotation: Vec3 = ZERO,
): PlacementTransform {
  return { position: { ...position }, rotation: { ...rotation }, scale: { ...scale } };
}

function circular(patch: Partial<CircularArrayOp> = {}): CircularArrayOp {
  return {
    id: 'ring',
    kind: 'circular-array',
    count: 16,
    axis: 'y',
    openingDiameter: 2,
    ...patch,
  };
}

function quaternion(rotation: Vec3): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation.x, rotation.y, rotation.z, 'ZYX'),
  );
}

function axisRotation(axis: ChainAxis): Vec3 {
  const euler = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(AXES.y, AXES[axis]),
    'ZYX',
  );
  return { x: euler.x, y: euler.y, z: euler.z };
}

function vec(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

/** Independent boundary samples in meters, without the production support formula. */
function surfacePoints(shape: ColliderShape, size: Vec3): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  if (shape === 'Box') {
    for (const side of [-0.5, 0.5]) {
      for (let i = 0; i <= 10; i++) {
        for (let j = 0; j <= 10; j++) {
          const u = i / 10 - 0.5;
          const v = j / 10 - 0.5;
          points.push(new THREE.Vector3(side * size.x, u * size.y, v * size.z));
          points.push(new THREE.Vector3(u * size.x, side * size.y, v * size.z));
          points.push(new THREE.Vector3(u * size.x, v * size.y, side * size.z));
        }
      }
    }
    return points;
  }
  const radius = size.x / 2;
  for (let longitude = 0; longitude < 48; longitude++) {
    const theta = (longitude * Math.PI * 2) / 48;
    if (shape === 'Cylinder') {
      for (const y of [-size.y / 2, size.y / 2]) {
        points.push(new THREE.Vector3(radius * Math.cos(theta), y, radius * Math.sin(theta)));
      }
      continue;
    }
    for (let latitude = -12; latitude <= 12; latitude++) {
      const phi = (latitude * Math.PI) / 24;
      const capOffset = shape === 'Capsule' ? (Math.sign(latitude) * (size.y - size.x)) / 2 : 0;
      points.push(
        new THREE.Vector3(
          radius * Math.cos(phi) * Math.cos(theta),
          radius * Math.sin(phi) + capOffset,
          radius * Math.cos(phi) * Math.sin(theta),
        ),
      );
    }
  }
  return points;
}

describe('circular collider arrangement', () => {
  it.each(['x', 'y', 'z'] as const)(
    'makes 16 cylinders with the requested bore and preserved width around %s',
    (axis) => {
      const center = { x: 7, y: -2, z: 11 };
      const source = seed(center, { x: 4, y: 0.8, z: 4 }, axisRotation(axis));
      const result = evalChain([source], [circular({ axis })], ['Cylinder']);

      expect(result.error).toBeNull();
      expect(result.totalInstances).toBe(16);
      expect(result.newCount).toBe(15);
      expect(result.instances.filter((instance) => instance.isSeed)).toHaveLength(1);
      expect(result.warnings ?? []).toHaveLength(0);
      const mean = new THREE.Vector3();
      for (const instance of result.instances) {
        const transform = instance.transform;
        const offset = vec(transform.position).sub(vec(center));
        expect(offset.dot(AXES[axis])).toBeCloseTo(0, 8);
        expect(offset.length() - transform.scale.x / 2).toBeCloseTo(1, 8);
        expect(offset.length() + transform.scale.x / 2).toBeCloseTo(5, 8);
        expect(transform.scale).toEqual(source.scale);
        const cylinderAxis = AXES.y.clone().applyQuaternion(quaternion(transform.rotation));
        expect(Math.abs(cylinderAxis.dot(AXES[axis]))).toBeCloseTo(1, 8);
        mean.add(vec(transform.position));
      }
      expect(mean.divideScalar(16).distanceTo(vec(center))).toBeLessThan(1e-8);
      const first = vec(result.instances[0].transform.position);
      const second = vec(result.instances[1].transform.position);
      expect(first.distanceTo(second)).toBeLessThan(source.scale.x);
      expect(source).toEqual(seed(center, source.scale, axisRotation(axis)));
    },
  );

  it.each(['x', 'y', 'z'] as const)(
    'keeps a mixed rotated group rigid and its entire surface outside the bore around %s',
    (axis) => {
      const shapes: ColliderShape[] = ['Box', 'Sphere', 'Cylinder', 'Capsule'];
      const seeds = [
        seed({ x: 8, y: 1, z: 2 }, { x: 4, y: 0.5, z: 2 }, { x: 0.3, y: 0.6, z: 0.9 }),
        seed({ x: 5, y: 3, z: 5 }, { x: 2, y: 2, z: 2 }),
        seed({ x: 3, y: 0, z: 4 }, { x: 3, y: 0.8, z: 3 }, { x: 0.8, y: 0.3, z: 0.5 }),
        seed({ x: 4, y: 4, z: 1 }, { x: 1.2, y: 4, z: 1.2 }, { x: 0.7, y: 0.4, z: 0.2 }),
      ];
      const before = structuredClone(seeds);
      const center = seeds
        .reduce((sum, source) => sum.add(vec(source.position)), new THREE.Vector3())
        .divideScalar(4);
      const result = evalChain(seeds, [circular({ axis, openingDiameter: 3 })], shapes);
      expect(result.error).toBeNull();
      expect(result.totalInstances).toBe(64);
      expect(result.newCount).toBe(60);
      expect(result.instances.filter((instance) => instance.isSeed)).toHaveLength(4);

      let minRadius = Infinity;
      for (const instance of result.instances) {
        const transform = instance.transform;
        expect(transform.scale).toEqual(seeds[instance.seedIndex].scale);
        const q = quaternion(transform.rotation);
        for (const point of surfacePoints(shapes[instance.seedIndex], transform.scale)) {
          const relative = point.applyQuaternion(q).add(vec(transform.position)).sub(center);
          relative.addScaledVector(AXES[axis], -relative.dot(AXES[axis]));
          minRadius = Math.min(minRadius, relative.length());
        }
      }
      expect(minRadius).toBeGreaterThanOrEqual(1.5 - 1e-8);
      for (let groupIndex = 0; groupIndex < 16; groupIndex++) {
        const q = new THREE.Quaternion().setFromAxisAngle(AXES[axis], (groupIndex * Math.PI) / 8);
        const members = result.instances.slice(groupIndex * 4, groupIndex * 4 + 4);
        for (let i = 1; i < 4; i++) {
          const expectedOffset = vec(seeds[i].position)
            .sub(vec(seeds[0].position))
            .applyQuaternion(q);
          const actualOffset = vec(members[i].transform.position).sub(
            vec(members[0].transform.position),
          );
          expect(actualOffset.distanceTo(expectedOffset)).toBeLessThan(1e-8);
          const expectedOrientation = q.clone().multiply(quaternion(seeds[i].rotation));
          expect(
            quaternion(members[i].transform.rotation).angleTo(expectedOrientation),
          ).toBeLessThan(1e-7);
        }
      }
      expect(seeds).toEqual(before);
    },
  );

  it('fits the actual normalized cylinder after a nonuniform scale step', () => {
    const scale: ScaleOp = {
      id: 'scale',
      kind: 'scale',
      factor: { x: 0.5, y: 2, z: 3 },
      mode: 'inPlace',
      pivot: 'centroid',
      center: ZERO,
    };
    const result = evalChain([seed()], [scale, circular()], ['Cylinder']);
    expect(result.error).toBeNull();
    for (const instance of result.instances) {
      expect(instance.transform.scale).toEqual({ x: 12, y: 1.6, z: 12 });
      expect(
        Math.hypot(instance.transform.position.x, instance.transform.position.z) - 6,
      ).toBeCloseTo(1, 8);
    }
  });

  it('warns when neighboring aligned cylinders leave gaps', () => {
    const result = evalChain(
      [seed(ZERO, { x: 0.2, y: 1, z: 0.2 })],
      [circular({ openingDiameter: 10 })],
      ['Cylinder'],
    );
    expect(result.error).toBeNull();
    expect(result.warnings?.length).toBeGreaterThan(0);
  });

  it('warns when the cylinder axis is tilted away from the ring axis', () => {
    const result = evalChain(
      [seed(ZERO, { x: 4, y: 0.8, z: 4 }, { x: 0.4, y: 0, z: 0 })],
      [circular()],
      ['Cylinder'],
    );
    expect(result.error).toBeNull();
    expect(result.warnings?.join(' ')).toMatch(/parallel|align|axis/i);
  });

  it('allows zero opening diameter', () => {
    const result = evalChain([seed()], [circular({ openingDiameter: 0 })], ['Cylinder']);
    expect(result.error).toBeNull();
    expect(vec(result.instances[0].transform.position).length()).toBeCloseTo(2, 8);
  });

  it.each([-1, NaN, Infinity])('rejects invalid opening diameter %s', (openingDiameter) => {
    const result = evalChain([seed()], [circular({ openingDiameter })], ['Cylinder']);
    expect(result.error).not.toBeNull();
    expect(result.instances).toHaveLength(0);
  });

  it.each([0, 1, 2.5, 501, NaN, Infinity])('rejects invalid count %s', (count) => {
    const result = evalChain([seed()], [circular({ count })], ['Cylinder']);
    expect(result.error).not.toBeNull();
    expect(result.instances).toHaveLength(0);
  });

  it('checks the compound instance cap before expanding a later ring', () => {
    const result = evalChain(
      [seed()],
      [circular(), circular({ id: 'second', count: 128 })],
      ['Cylinder'],
    );
    expect(result.error).toMatch(/too many|max|2000/i);
    expect(result.instances).toHaveLength(0);
  });

  it('rejects circular arrangement without collider shapes', () => {
    const result = evalChain([seed()], [circular()]);
    expect(result.error).toMatch(/collider/i);
    expect(result.instances).toHaveLength(0);
  });
});
