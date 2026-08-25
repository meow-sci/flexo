import { describe, expect, it } from 'vitest';
import { isUnitScale, scaleCollider, scaleVariantKey } from './colliderScale';
import type { PartCollider } from './types';

const BOX: PartCollider = {
  id: 'BoxCollider1',
  shape: 'Box',
  ownerTemplateId: null,
  position: { x: 1, y: 2, z: 3 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 2, z: 4 },
  layerId: 'default',
};

describe('scaleCollider', () => {
  it('unit scale is identity', () => {
    expect(scaleCollider(BOX, { x: 1, y: 1, z: 1 })).toBe(BOX);
    expect(isUnitScale({ x: 1, y: 1, z: 1 })).toBe(true);
  });

  it('per-axis exact for identity-rotated colliders', () => {
    const out = scaleCollider(BOX, { x: 2, y: 3, z: 0.5 });
    expect(out.position).toEqual({ x: 2, y: 6, z: 1.5 });
    expect(out.scale).toEqual({ x: 2, y: 6, z: 2 });
  });

  it('uniform scale exact for rotated colliders', () => {
    const rotated = { ...BOX, rotation: { x: 0.3, y: 0.5, z: -0.2 } };
    const out = scaleCollider(rotated, { x: 2, y: 2, z: 2 });
    expect(out.scale).toEqual({ x: 2, y: 4, z: 8 });
    expect(out.rotation).toEqual(rotated.rotation);
  });

  it('volume-preserving mean for rotated + non-uniform (documented approximation)', () => {
    const rotated = { ...BOX, rotation: { x: 0.3, y: 0, z: 0 } };
    const out = scaleCollider(rotated, { x: 2, y: 4, z: 1 });
    const f = Math.cbrt(8);
    expect(out.scale.x).toBeCloseTo(1 * f, 9);
    expect(out.scale.y).toBeCloseTo(2 * f, 9);
  });

  it('cylinder radius axes stay coupled through normalize', () => {
    const cyl: PartCollider = { ...BOX, shape: 'Cylinder', scale: { x: 2, y: 5, z: 2 } };
    const out = scaleCollider(cyl, { x: 3, y: 1, z: 2 });
    // normalizeColliderSize couples x/z for a cylinder (radius must be one value).
    expect(out.scale.x).toBe(out.scale.z);
  });

  it('variant keys dedupe identical scales and split different ones', () => {
    expect(scaleVariantKey('P', { x: 2, y: 2, z: 2 })).toBe(
      scaleVariantKey('P', { x: 2, y: 2, z: 2 }),
    );
    expect(scaleVariantKey('P', { x: 2, y: 2, z: 2 })).not.toBe(
      scaleVariantKey('P', { x: 2, y: 2, z: 2.5 }),
    );
  });
});
