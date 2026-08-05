import { describe, it, expect } from 'vitest';
import { marqueeHits, normalizeRect, rectsIntersect, type ScreenAabb } from './marqueeSelect';

const box = (over: Partial<ScreenAabb>): ScreenAabb => ({
  kind: 'subpart',
  id: 'a_1',
  minX: 0,
  minY: 0,
  maxX: 10,
  maxY: 10,
  ...over,
});

describe('normalizeRect', () => {
  it('is corner-order independent', () => {
    const forward = normalizeRect({ x0: 5, y0: 6, x1: 20, y1: 30 });
    const backward = normalizeRect({ x0: 20, y0: 30, x1: 5, y1: 6 });
    expect(forward).toEqual({ minX: 5, minY: 6, maxX: 20, maxY: 30 });
    expect(backward).toEqual(forward);
    // Mixed inversion (drag right-and-up) too.
    expect(normalizeRect({ x0: 5, y0: 30, x1: 20, y1: 6 })).toEqual(forward);
  });

  it('normalizes a zero-area rect to itself', () => {
    expect(normalizeRect({ x0: 3, y0: 4, x1: 3, y1: 4 })).toEqual({
      minX: 3,
      minY: 4,
      maxX: 3,
      maxY: 4,
    });
  });
});

describe('rectsIntersect', () => {
  const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('counts an edge touch as a hit', () => {
    expect(rectsIntersect(a, { minX: 10, minY: 10, maxX: 20, maxY: 20 })).toBe(true);
    expect(rectsIntersect(a, { minX: -5, minY: 0, maxX: 0, maxY: 3 })).toBe(true);
  });

  it('misses a disjoint box on either axis', () => {
    expect(rectsIntersect(a, { minX: 11, minY: 0, maxX: 20, maxY: 10 })).toBe(false);
    expect(rectsIntersect(a, { minX: 0, minY: 11, maxX: 10, maxY: 20 })).toBe(false);
  });

  it('counts full containment either way round', () => {
    expect(rectsIntersect(a, { minX: 2, minY: 2, maxX: 3, maxY: 3 })).toBe(true);
    expect(rectsIntersect({ minX: 2, minY: 2, maxX: 3, maxY: 3 }, a)).toBe(true);
  });
});

describe('marqueeHits', () => {
  it('returns nothing for an empty box list', () => {
    expect(marqueeHits({ x0: 0, y0: 0, x1: 100, y1: 100 }, [])).toEqual([]);
  });

  it('selects only the intersecting entities, in first-appearance order', () => {
    const hits = marqueeHits({ x0: 0, y0: 0, x1: 15, y1: 15 }, [
      box({ id: 'far', minX: 100, minY: 100, maxX: 110, maxY: 110 }),
      box({ id: 'b_1' }),
      box({ id: 'a_1', minX: 12, minY: 12, maxX: 14, maxY: 14 }),
    ]);
    expect(hits).toEqual([
      { ref: { kind: 'subpart', id: 'b_1' } },
      { ref: { kind: 'subpart', id: 'a_1' } },
    ]);
  });

  it('works with an inverted drag rectangle', () => {
    const hits = marqueeHits({ x0: 15, y0: 15, x1: 0, y1: 0 }, [box({ id: 'b_1' })]);
    expect(hits).toEqual([{ ref: { kind: 'subpart', id: 'b_1' } }]);
  });

  it('selects a multi-instance entity ONCE, reporting the first hit instance', () => {
    const hits = marqueeHits({ x0: 0, y0: 0, x1: 100, y1: 100 }, [
      box({ kind: 'collider', id: '_collider1', instanceIndex: 0, minX: 200, maxX: 210 }), // miss
      box({ kind: 'collider', id: '_collider1', instanceIndex: 2, minX: 20, maxX: 30 }),
      box({ kind: 'collider', id: '_collider1', instanceIndex: 3, minX: 40, maxX: 50 }),
    ]);
    expect(hits).toEqual([{ ref: { kind: 'collider', id: '_collider1' }, firstInstance: 2 }]);
  });

  it('reports no instance for a single-visual entity', () => {
    const hits = marqueeHits({ x0: 0, y0: 0, x1: 100, y1: 100 }, [
      box({ kind: 'ivaSeat', id: '_seat1' }),
    ]);
    expect(hits).toEqual([{ ref: { kind: 'ivaSeat', id: '_seat1' } }]);
    expect('firstInstance' in hits[0]).toBe(false);
  });

  it('keeps entities of different kinds that share an id apart', () => {
    const hits = marqueeHits({ x0: 0, y0: 0, x1: 100, y1: 100 }, [
      box({ kind: 'collider', id: 'x' }),
      box({ kind: 'light', id: 'x' }),
    ]);
    expect(hits.map((h) => h.ref)).toEqual([
      { kind: 'collider', id: 'x' },
      { kind: 'light', id: 'x' },
    ]);
  });

  it('selects a zero-area entity box the rect touches (a degenerate marker)', () => {
    const hits = marqueeHits({ x0: 0, y0: 0, x1: 10, y1: 10 }, [
      box({ kind: 'light', id: '_light1', minX: 5, maxX: 5, minY: 5, maxY: 5 }),
    ]);
    expect(hits).toEqual([{ ref: { kind: 'light', id: '_light1' } }]);
  });
});
