import { describe, expect, it } from 'vitest';
import { identityTransform } from '../../ksa/types';
import { exhaustLocalDirection, exhaustWorldDirection } from '../../three/coords';
import { axisLabel, nearestAxis, snapToAxis } from './exhaustAxes';

describe('exhaustAxes', () => {
  // The Sea Dragon vernier report: a Blender import lands as a placement rotated
  // (1.570796, 0, 1.570796) — six-decimal radians, NOT exact right angles — so aiming the
  // arrow along Part −X used to write (-3.27e-7, 3.27e-7, -1) and the local chooser fell back
  // to "Custom vector".
  const rotated = { ...identityTransform(), rotation: { x: 1.570796, y: 0, z: 1.570796 } };

  it('snaps a Part-axis choice back to the exact local cardinal axis', () => {
    const local = exhaustLocalDirection({ x: -1, y: 0, z: 0 }, rotated);
    expect(Math.abs(local.x)).toBeGreaterThan(1e-8); // the residue is real
    expect(snapToAxis(local)).toEqual({ x: 0, y: 0, z: -1 });
    expect(nearestAxis(local)?.label).toBe('−Z');
    const back = exhaustWorldDirection(snapToAxis(local), rotated);
    expect(nearestAxis(back)?.label).toBe('−X');
  });

  it('leaves a genuinely off-axis vector alone', () => {
    const v = { x: 0.7071, y: 0, z: -0.7071 };
    expect(nearestAxis(v)).toBeNull();
    expect(snapToAxis(v)).toEqual(v);
    expect(axisLabel(v)).toBe('(0.71, 0, -0.71)');
  });

  it('labels the rotated placement’s local axes in Part space', () => {
    const map = (['x', 'y', 'z'] as const).map((axis) =>
      axisLabel(exhaustWorldDirection({ x: 0, y: 0, z: 0, [axis]: 1 }, rotated)),
    );
    expect(map).toEqual(['+Y', '+Z', '+X']);
  });
});

describe('gimbalRotationAlignedTo', () => {
  it('turns the gimbal frame’s X onto a −Z bell’s thrust axis with an exact right angle', async () => {
    const { gimbalRotationAlignedTo } = await import('./moduleActions');
    const rotation = gimbalRotationAlignedTo({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    expect(rotation).toEqual({ x: 0, y: -Math.PI / 2, z: 0 });
  });

  it('is the identity for a stock −X bell', async () => {
    const { gimbalRotationAlignedTo } = await import('./moduleActions');
    expect(gimbalRotationAlignedTo({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
  });
});
