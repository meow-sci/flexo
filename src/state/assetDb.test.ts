import { describe, it, expect } from 'vitest';
import { assetKeys } from './assetDb';

/**
 * happy-dom has no indexedDB, so only the PURE key math is covered here — which is exactly
 * the part the project namespacing depends on: the range bound used by `listProjectBlobs` /
 * `deleteProjectAssets` / `copyProjectAssets` is `[pa:<id>: , pa:<id>;)`, and that is only
 * correct if every real key sorts strictly inside it.
 */

const PROJECT = 'p_abc123def456';
const OTHER = 'p_zzz999zzz999';

describe('assetKeys', () => {
  it('namespaces every kind under the project prefix', () => {
    expect(assetKeys.textureSource(PROJECT, 't1')).toBe(`pa:${PROJECT}:tex-src:t1`);
    expect(assetKeys.textureKtx2(PROJECT, 't1')).toBe(`pa:${PROJECT}:tex-ktx2:t1`);
    expect(assetKeys.meshGlb(PROJECT, 'm1')).toBe(`pa:${PROJECT}:mesh-glb:m1`);
    expect(assetKeys.importGlb(PROJECT, 'i1')).toBe(`pa:${PROJECT}:import-glb:i1`);
    expect(assetKeys.emissivePaint(PROJECT, 'g1')).toBe(`pa:${PROJECT}:emissive-paint:g1`);
  });

  it('keeps the same asset id distinct across projects', () => {
    expect(assetKeys.textureSource(PROJECT, 't1')).not.toBe(assetKeys.textureSource(OTHER, 't1'));
  });

  it('sorts every key strictly inside the project range bound', () => {
    // The sweep range is [`pa:<id>:`, `pa:<id>;`) — ';' is ':' + 1, so it is the tight
    // exclusive upper bound for anything sharing the prefix.
    const lower = `pa:${PROJECT}:`;
    const upper = `pa:${PROJECT};`;
    const keys = [
      assetKeys.textureSource(PROJECT, ''),
      assetKeys.textureSource(PROJECT, 't1'),
      assetKeys.textureKtx2(PROJECT, 'zzzz'),
      assetKeys.meshGlb(PROJECT, '~~~'),
      assetKeys.importGlb(PROJECT, 'i1'),
      assetKeys.emissivePaint(PROJECT, 'g1'),
    ];
    for (const key of keys) {
      expect(key >= lower).toBe(true);
      expect(key < upper).toBe(true);
    }
    // Another project's keys — and a longer id that merely STARTS with this one — fall
    // outside, so a sweep can never take a neighbour's bytes with it.
    expect(
      assetKeys.textureSource(OTHER, 't1') < lower || assetKeys.textureSource(OTHER, 't1') >= upper,
    ).toBe(true);
    const longer = assetKeys.textureSource(`${PROJECT}x`, 't1');
    expect(longer >= upper).toBe(true);
  });
});
