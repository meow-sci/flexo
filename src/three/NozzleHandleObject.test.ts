import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../ksa/types';
import { identityTransform } from '../ksa/types';
import { exhaustLocalDirection, exhaustWorldDirection } from './coords';
import { NozzleHandleObject } from './NozzleHandleObject';

function coneAim(direction: Vec3): THREE.Vector3 {
  const size = 0.12;
  const handle = new NozzleHandleObject('test', 'physics', size);
  handle.setPose(new THREE.Vector3(), new THREE.Vector3(direction.x, direction.y, direction.z));
  handle.group.updateMatrixWorld(true);
  const cone = handle.group.children[1] as THREE.Mesh;
  // ConeGeometry's apex is on local +Y at half its height. Check the rendered tip,
  // including both the cone's own rotation and the handle group's direction.
  const tip = cone.localToWorld(new THREE.Vector3(0, size, 0));
  const aim = tip.sub(handle.group.position).normalize();
  handle.dispose();
  return aim;
}

describe('NozzleHandleObject', () => {
  it('aims the visible cone along each exhaust axis', () => {
    for (const direction of [
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 1 },
    ]) {
      const aim = coneAim(direction);
      expect(aim.x).toBeCloseTo(direction.x, 10);
      expect(aim.y).toBeCloseTo(direction.y, 10);
      expect(aim.z).toBeCloseTo(direction.z, 10);
    }
  });

  it('shows local −X as Part-space −Y when the SubPart is rotated around Z', () => {
    const owner = identityTransform();
    owner.rotation.z = Math.PI / 2;
    const world = exhaustWorldDirection({ x: -1, y: 0, z: 0 }, owner);
    const aim = coneAim(world);
    expect(aim.x).toBeCloseTo(0, 10);
    expect(aim.y).toBeCloseTo(-1, 10);
    expect(aim.z).toBeCloseTo(0, 10);
  });

  it('aims a rotated placement along chosen Part-space −X by writing a local vector', () => {
    const owner = identityTransform();
    owner.rotation.z = Math.PI / 2;
    const local = exhaustLocalDirection({ x: -1, y: 0, z: 0 }, owner);
    expect(local.x).toBeCloseTo(0, 10);
    expect(local.y).toBeCloseTo(1, 10);
    expect(local.z).toBeCloseTo(0, 10);

    const world = exhaustWorldDirection(local, owner);
    const aim = coneAim(world);
    expect(aim.x).toBeCloseTo(-1, 10);
    expect(aim.y).toBeCloseTo(0, 10);
    expect(aim.z).toBeCloseTo(0, 10);
  });
});
