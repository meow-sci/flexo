import { describe, expect, it } from 'vitest';
import { computeReorder, movedOrdinary, ordinaryIds, withOrdinaryOrder } from './layerReorder';

// The document order a fresh project has: Default, the two pinned entity-only layers, then
// whatever the user added — plus "lamps", an ordinary user layer deliberately placed BETWEEN
// the two pinned ones. Pinned ids sit between ordinary ones (and vice versa), which is the
// whole reason the ordinary partition has to be lifted out and put back rather than sliced.
const IDS = ['default', 'ivaSeats', 'lamps', 'kittens', 'layer1', 'layer2'];

describe('computeReorder', () => {
  it('moves a key before the target', () => {
    expect(computeReorder(['a', 'b', 'c'], new Set(['c']), 'a', 'before')).toEqual(['c', 'a', 'b']);
  });

  it('moves a key after the target', () => {
    expect(computeReorder(['a', 'b', 'c'], new Set(['a']), 'c', 'after')).toEqual(['b', 'c', 'a']);
  });

  it('leaves the order untouched when the target is one of the moving keys', () => {
    expect(computeReorder(['a', 'b', 'c'], new Set(['b']), 'b', 'before')).toEqual(['a', 'b', 'c']);
  });
});

describe('withOrdinaryOrder', () => {
  it('keeps every pinned layer at its document position', () => {
    expect(withOrdinaryOrder(IDS, ['layer2', 'lamps', 'layer1', 'default'])).toEqual([
      'layer2',
      'ivaSeats',
      'lamps',
      'kittens',
      'layer1',
      'default',
    ]);
  });

  it('is a permutation of the input', () => {
    const out = withOrdinaryOrder(IDS, ['layer1', 'default', 'lamps', 'layer2']);
    expect([...out].sort()).toEqual([...IDS].sort());
  });
});

describe('ordinaryIds', () => {
  it('drops the pinned entity-only layers — only IVA seats and kittens', () => {
    expect(ordinaryIds(IDS)).toEqual(['default', 'lamps', 'layer1', 'layer2']);
  });
});

describe('movedOrdinary', () => {
  it('swaps with the ordinary neighbour, skipping the pinned layers between them', () => {
    expect(movedOrdinary(IDS, 'lamps', -1)).toEqual([
      'lamps',
      'ivaSeats',
      'default',
      'kittens',
      'layer1',
      'layer2',
    ]);
  });

  it('returns null at either end of the ordinary partition', () => {
    expect(movedOrdinary(IDS, 'default', -1)).toBeNull();
    expect(movedOrdinary(IDS, 'layer2', 1)).toBeNull();
  });

  it('returns null for a pinned or unknown layer', () => {
    expect(movedOrdinary(IDS, 'kittens', 1)).toBeNull();
    expect(movedOrdinary(IDS, 'nope', 1)).toBeNull();
  });
});
