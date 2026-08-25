import { describe, expect, it } from 'vitest';
import {
  bestAxisSnap,
  bestBoxSnap,
  bestConnectorSnap,
  connectorWorld,
  ksaBoxFromThree,
  shiftKsaBox,
  type KsaBox,
  type WorldConnector,
} from './snapEngine';
import type { Transform } from '../ksa/types';

const T = (over: Partial<Transform> = {}): Transform => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  ...over,
});

describe('connectorWorld', () => {
  it('composes position with the placement transform (scale included)', () => {
    // A tank's top connector: +0.5 up in the piece frame, facing up (+X).
    const w = connectorWorld(
      { id: 'c', position: { x: 0.5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      T({ position: { x: 2, y: 10, z: -3 }, scale: { x: 2, y: 2, z: 2 } }),
    );
    expect(w.position).toEqual({ x: 3, y: 10, z: -3 }); // 2 + 0.5·2
    expect(w.facing.x).toBeCloseTo(1);
  });

  it('the facing follows connector AND placement rotation', () => {
    // Bottom connector: rotated Z=π in the piece (faces −X / down), placement unrotated.
    const w = connectorWorld(
      { id: 'c', position: { x: -0.5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: Math.PI } },
      T(),
    );
    expect(w.facing.x).toBeCloseTo(-1);
    // Tip the whole placement on its side (rotate about north/z by +π/2): up-facing → east-facing.
    const tipped = connectorWorld(
      { id: 'c', position: { x: 0.5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      T({ rotation: { x: 0, y: 0, z: Math.PI / 2 } }),
    );
    expect(tipped.facing.y).toBeCloseTo(1);
    expect(Math.abs(tipped.facing.x)).toBeLessThan(1e-6);
  });
});

describe('bestConnectorSnap', () => {
  const up = (x: number, y = 0, z = 0): WorldConnector => ({
    position: { x, y, z },
    facing: { x: 1, y: 0, z: 0 },
  });
  const down = (x: number, y = 0, z = 0): WorldConnector => ({
    position: { x, y, z },
    facing: { x: -1, y: 0, z: 0 },
  });

  it('docks the nearest OPPOSING pair and returns the exact delta', () => {
    // Dragged tank's bottom node hovers 0.4 m above + 0.3 m east of a stationary top node.
    const snap = bestConnectorSnap([down(1.4, 0.3, 0)], [up(1, 0, 0)], 1);
    expect(snap).not.toBeNull();
    expect(snap!.delta.x).toBeCloseTo(-0.4);
    expect(snap!.delta.y).toBeCloseTo(-0.3);
  });

  it('never docks same-facing pairs (parts would overlap)', () => {
    expect(bestConnectorSnap([up(1.2)], [up(1)], 1)).toBeNull();
  });

  it('respects the radius', () => {
    expect(bestConnectorSnap([down(5)], [up(1)], 1)).toBeNull();
  });

  it('prefers the closer of two candidates', () => {
    const snap = bestConnectorSnap([down(0.2)], [up(0), up(1)], 2);
    expect(snap!.delta.x).toBeCloseTo(-0.2);
  });
});

describe('bestAxisSnap', () => {
  it('flush: moving min against a stationary max (touching, gap 0)', () => {
    // Stationary tank spans east [0, 2]; the drag hovers at [2.3, 4.3].
    const snap = bestAxisSnap([2.3, 4.3], [[0, 2]], 0.5);
    expect(snap!.kind).toBe('flush-min');
    expect(snap!.at).toBe(2);
    expect(snap!.delta).toBeCloseTo(-0.3);
  });

  it('center alignment wins when it is the smaller correction', () => {
    const snap = bestAxisSnap([0.1, 2.1], [[0, 2]], 0.5);
    expect(snap!.kind).toBe('center');
    expect(snap!.delta).toBeCloseTo(-0.1);
  });

  it('null outside the radius', () => {
    expect(bestAxisSnap([10, 12], [[0, 2]], 0.5)).toBeNull();
  });
});

describe('bestBoxSnap', () => {
  const box = (east: [number, number], north: [number, number]): KsaBox => ({
    up: [0, 1],
    east,
    north,
  });

  it('east flush only proposed by boxes NEAR on north (a far shed cannot yank the row)', () => {
    const moving = box([2.2, 4.2], [0, 2]);
    const nearNeighbor = box([0, 2], [0.5, 2.5]);
    const farShed = box([0, 1.9], [200, 202]);
    const withNear = bestBoxSnap(moving, [nearNeighbor], 0.5);
    expect(withNear.east!.kind).toBe('flush-min');
    expect(withNear.east!.delta).toBeCloseTo(-0.2);
    const withFarOnly = bestBoxSnap(moving, [farShed], 0.5);
    expect(withFarOnly.east).toBeNull();
  });

  it('axes resolve independently (east flush + north center together)', () => {
    const moving = box([2.2, 4.2], [0.15, 2.15]);
    const r = bestBoxSnap(moving, [box([0, 2], [0, 2])], 0.5);
    expect(r.east!.kind).toBe('flush-min');
    expect(r.north!.kind).toBe('center');
    expect(r.north!.delta).toBeCloseTo(-0.15);
  });
});

describe('ksaBoxFromThree / shiftKsaBox', () => {
  it('maps three axes to up/east/north (north flips sign)', () => {
    const b = ksaBoxFromThree({ min: { x: 1, y: 2, z: 3 }, max: { x: 4, y: 5, z: 6 } });
    expect(b).toEqual({ up: [2, 5], east: [1, 4], north: [-6, -3] });
  });

  it('shift moves the ground axes', () => {
    const b = shiftKsaBox({ up: [0, 1], east: [0, 1], north: [0, 1] }, 2, -3, 0.5);
    expect(b).toEqual({ up: [0.5, 1.5], east: [2, 3], north: [-3, -2] });
  });
});
