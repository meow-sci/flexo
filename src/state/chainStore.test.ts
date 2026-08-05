import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ChainOp, LinearArrayOp, RadialArrayOp, ScaleOp, TranslateOp } from './chainStore';

/**
 * The session store is ephemeral UI state — no undo, no document writes — so what these
 * tests pin is the two things a user actually feels: every parameter is clamped into a
 * range the engine accepts (counts are integers >= 2, scales stay positive), and the last
 * values used for a kind come back on the next chain.
 *
 * Each test gets a FRESH module instance: `persistentJSON` snapshots localStorage when the
 * module is first evaluated, and nanostores keeps a store mounted for a second after its
 * last reader, so seeding storage after import would be silently ignored (and one test's
 * remembered defaults would leak into the next).
 */
type ChainStore = typeof import('./chainStore');

async function loadStore(defaultsBlob?: string): Promise<ChainStore> {
  localStorage.clear();
  if (defaultsBlob !== undefined) localStorage.setItem('flexo:chainDefaults', defaultsBlob);
  vi.resetModules();
  return await import('./chainStore');
}

let store: ChainStore;

beforeEach(async () => {
  store = await loadStore();
});

/** The open session's steps, or none — keeps the assertions free of optional chaining. */
function sessionOps(from: ChainStore = store): ChainOp[] {
  return from.$chainSession.get()?.ops ?? [];
}

describe('chain session lifecycle', () => {
  it('opens with the given seed ids and no steps', () => {
    store.openChain(['a_1', 'b_2']);
    expect(store.$chainSession.get()).toEqual({ seedIds: ['a_1', 'b_2'], ops: [] });
  });

  it('copies the seed ids instead of aliasing the caller array', () => {
    const ids = ['a_1'];
    store.openChain(ids);
    ids.push('b_2');
    expect(store.$chainSession.get()?.seedIds).toEqual(['a_1']);
  });

  it('replaces an existing session and drops its steps', () => {
    store.openChain(['a_1']);
    store.addChainOp('translate');
    store.openChain(['c_3']);
    expect(store.$chainSession.get()).toEqual({ seedIds: ['c_3'], ops: [] });
  });

  it('closes to null', () => {
    store.openChain(['a_1']);
    store.closeChain();
    expect(store.$chainSession.get()).toBeNull();
  });
});

describe('addChainOp', () => {
  beforeEach(() => {
    store.openChain(['a_1']);
  });

  it('appends a step and returns its id', () => {
    const first = store.addChainOp('translate');
    const second = store.addChainOp('rotate');
    const ops = sessionOps();

    expect(first).not.toBe('');
    expect(second).not.toBe(first);
    expect(ops.map((op) => op.id)).toEqual([first, second]);
    expect(ops.map((op) => op.kind)).toEqual(['translate', 'rotate']);
  });

  it('appends each kind with its hardcoded defaults', () => {
    for (const kind of [
      'translate',
      'rotate',
      'scale',
      'linear-array',
      'radial-array',
      'grid-array',
    ] as const) {
      store.addChainOp(kind);
    }
    const ops = sessionOps();

    expect(ops[0]).toMatchObject({ kind: 'translate', delta: { x: 0, y: 0, z: 0 } });
    expect(ops[1]).toMatchObject({
      kind: 'rotate',
      degreesDeg: { x: 0, y: 0, z: 0 },
      pivot: 'centroid',
      center: { x: 0, y: 0, z: 0 },
    });
    expect(ops[2]).toMatchObject({
      kind: 'scale',
      factor: { x: 1, y: 1, z: 1 },
      mode: 'smart',
      pivot: 'centroid',
    });
    expect(ops[3]).toMatchObject({
      kind: 'linear-array',
      count: 3,
      offset: { x: 1, y: 0, z: 0 },
      stepRotateDeg: { x: 0, y: 0, z: 0 },
      stepScale: { x: 1, y: 1, z: 1 },
    });
    expect(ops[4]).toMatchObject({
      kind: 'radial-array',
      count: 6,
      axis: 'x',
      startAngleDeg: 0,
      sweepDeg: 360,
      orient: 'rotate',
      radialOffset: 0,
      axialStep: 0,
    });
    expect(ops[5]).toMatchObject({
      kind: 'grid-array',
      plane: 'xy',
      countA: 3,
      countB: 3,
      spacingA: 1,
      spacingB: 1,
      centered: false,
    });
  });

  it('gives every step its own parameter objects', () => {
    const first = store.addChainOp('translate');
    store.addChainOp('translate');
    store.updateChainOp(first, { delta: { x: 5, y: 0, z: 0 } });
    const ops = sessionOps() as TranslateOp[];

    expect(ops[0].delta.x).toBe(5);
    expect(ops[1].delta.x).toBe(0);
  });

  it('no-ops without a session', () => {
    store.closeChain();
    expect(store.addChainOp('translate')).toBe('');
    expect(store.$chainSession.get()).toBeNull();
  });
});

describe('updateChainOp', () => {
  beforeEach(() => {
    store.openChain(['a_1']);
  });

  it('merges the patch, leaving untouched fields alone', () => {
    const id = store.addChainOp('radial-array');
    store.updateChainOp(id, { axis: 'y', startAngleDeg: 45 });
    const op = sessionOps()[0] as RadialArrayOp;

    expect(op).toMatchObject({ axis: 'y', startAngleDeg: 45, count: 6, sweepDeg: 360 });
  });

  it('clamps counts into range and rounds them to integers', () => {
    const id = store.addChainOp('linear-array');

    store.updateChainOp(id, { count: 9999 });
    expect((sessionOps()[0] as LinearArrayOp).count).toBe(500);

    store.updateChainOp(id, { count: 2.7 });
    expect((sessionOps()[0] as LinearArrayOp).count).toBe(3);

    store.updateChainOp(id, { count: 1 });
    expect((sessionOps()[0] as LinearArrayOp).count).toBe(2);
  });

  it('caps a radial count at one instance per degree', () => {
    const id = store.addChainOp('radial-array');
    store.updateChainOp(id, { count: 9999 });
    expect((sessionOps()[0] as RadialArrayOp).count).toBe(360);
  });

  it('clamps scale factors positive (a negative scale would be an invisible mirror)', () => {
    const id = store.addChainOp('scale');
    store.updateChainOp(id, { factor: { x: -1, y: 0, z: 1000 } });
    expect((sessionOps()[0] as ScaleOp).factor).toEqual({
      x: 0.01,
      y: 0.01,
      z: 100,
    });
  });

  it('clamps angles to a full turn', () => {
    const id = store.addChainOp('radial-array');
    store.updateChainOp(id, { sweepDeg: 400, startAngleDeg: -900 });
    expect(sessionOps()[0]).toMatchObject({
      sweepDeg: 360,
      startAngleDeg: -360,
    });
  });

  it('replaces non-finite and wrong-typed values with the hardcoded default', () => {
    const id = store.addChainOp('linear-array');
    store.updateChainOp(id, {
      count: Number.NaN,
      offset: { x: Number.POSITIVE_INFINITY, y: 999999, z: 'nope' as unknown as number },
    });
    const op = sessionOps()[0] as LinearArrayOp;

    // Unusable values fall back to the hardcoded default (count 3, offset x 1, z 0);
    // a merely out-of-range one still clamps to the limit.
    expect(op.count).toBe(3);
    expect(op.offset).toEqual({ x: 1, y: 10000, z: 0 });
  });

  it('never changes a step id or kind', () => {
    const id = store.addChainOp('translate');
    store.updateChainOp(id, { id: 'hacked', kind: 'rotate' } as never);
    expect(sessionOps()[0]).toMatchObject({ id, kind: 'translate' });
  });

  it('no-ops for an unknown id or without a session', () => {
    const id = store.addChainOp('translate');
    store.updateChainOp('nope', { delta: { x: 9, y: 9, z: 9 } });
    expect(sessionOps()[0]).toMatchObject({ id, delta: { x: 0, y: 0, z: 0 } });

    store.closeChain();
    store.updateChainOp(id, { delta: { x: 9, y: 9, z: 9 } });
    expect(store.$chainSession.get()).toBeNull();
  });
});

describe('removeChainOp / moveChainOp', () => {
  beforeEach(() => {
    store.openChain(['a_1']);
  });

  it('removes by id and ignores unknown ids', () => {
    const first = store.addChainOp('translate');
    const second = store.addChainOp('rotate');

    store.removeChainOp('nope');
    expect(sessionOps()).toHaveLength(2);

    store.removeChainOp(first);
    expect(sessionOps().map((op) => op.id)).toEqual([second]);
  });

  it('moves a step up and down, stopping at the ends', () => {
    const first = store.addChainOp('translate');
    const second = store.addChainOp('rotate');
    const third = store.addChainOp('scale');
    const order = () => sessionOps().map((op) => op.id);

    store.moveChainOp(third, -1);
    expect(order()).toEqual([first, third, second]);

    store.moveChainOp(third, 1);
    expect(order()).toEqual([first, second, third]);

    store.moveChainOp(first, -1);
    expect(order()).toEqual([first, second, third]);

    store.moveChainOp(third, 1);
    expect(order()).toEqual([first, second, third]);

    store.moveChainOp('nope', 1);
    expect(order()).toEqual([first, second, third]);
  });

  it('moveChainOpTo re-inserts at an absolute index (drag-reorder)', () => {
    const first = store.addChainOp('translate');
    const second = store.addChainOp('rotate');
    const third = store.addChainOp('scale');
    const order = () => sessionOps().map((op) => op.id);

    // first → last
    store.moveChainOpTo(first, 2);
    expect(order()).toEqual([second, third, first]);

    // middle → 0
    store.moveChainOpTo(third, 0);
    expect(order()).toEqual([third, second, first]);

    // out of range clamps to the ends, in both directions
    store.moveChainOpTo(third, 99);
    expect(order()).toEqual([second, first, third]);
    store.moveChainOpTo(third, -5);
    expect(order()).toEqual([third, second, first]);

    // unchanged index and unknown id are both no-ops
    store.moveChainOpTo(third, 0);
    expect(order()).toEqual([third, second, first]);
    store.moveChainOpTo('nope', 2);
    expect(order()).toEqual([third, second, first]);
  });
});

describe('persisted per-kind defaults', () => {
  it('remembers the last values of a kind for the next session', () => {
    store.openChain(['a_1']);
    const id = store.addChainOp('linear-array');
    store.updateChainOp(id, { count: 7, offset: { x: 0, y: 0.5, z: 0 } });
    store.closeChain();

    store.openChain(['b_2']);
    store.addChainOp('linear-array');
    expect(sessionOps()[0]).toMatchObject({
      count: 7,
      offset: { x: 0, y: 0.5, z: 0 },
    });

    // Written through to localStorage, so the next app session starts there too.
    const stored = JSON.parse(localStorage.getItem('flexo:chainDefaults') ?? '{}');
    expect(stored['linear-array']).toMatchObject({ count: 7 });
    expect(stored['linear-array'].id).toBeUndefined();
  });

  it('leaves other kinds on their hardcoded defaults', () => {
    store.openChain(['a_1']);
    const id = store.addChainOp('linear-array');
    store.updateChainOp(id, { count: 7 });
    store.addChainOp('radial-array');
    expect(sessionOps()[1]).toMatchObject({ count: 6 });
  });

  it('degrades a corrupted persisted blob to the hardcoded defaults without throwing', async () => {
    const corrupted = await loadStore(
      JSON.stringify({
        'linear-array': { count: 'junk', bogus: 5, offset: { x: 2, y: null, z: 3 } },
        'radial-array': 'not an object',
        'grid-array': null,
      }),
    );

    corrupted.openChain(['a_1']);
    corrupted.addChainOp('linear-array');
    corrupted.addChainOp('radial-array');
    corrupted.addChainOp('grid-array');
    const ops = sessionOps(corrupted);

    expect(ops[0]).toMatchObject({
      kind: 'linear-array',
      count: 3,
      // Good fields of a bad blob still apply; bad components fall back per-component.
      offset: { x: 2, y: 0, z: 3 },
    });
    expect(ops[0]).not.toHaveProperty('bogus');
    expect(ops[1]).toMatchObject({ kind: 'radial-array', count: 6, axis: 'x', sweepDeg: 360 });
    expect(ops[2]).toMatchObject({ kind: 'grid-array', countA: 3, countB: 3, plane: 'xy' });
  });
});
