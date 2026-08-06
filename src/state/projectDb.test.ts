import { describe, it, expect } from 'vitest';
import { deriveCounts, newProjectId } from './projectDb';
import { createEmptyPart } from '../ksa/types';
import type { EditingPart } from '../ksa/types';

// happy-dom has no indexedDB, so only the PURE half of projectDb is covered here (the same
// split customAssetStore.test.ts uses for assetDb). The IDB plumbing is exercised through
// projectStore.test.ts's in-memory mock and in the browser.

describe('newProjectId', () => {
  it('mints the documented shape', () => {
    expect(newProjectId()).toMatch(/^p_[0-9a-z]{12}$/);
  });

  it('mints unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newProjectId());
    expect(ids.size).toBe(1000);
  });
});

describe('deriveCounts', () => {
  it('is all zeros for an empty part except the built-in layers', () => {
    const counts = deriveCounts(createEmptyPart());
    expect(counts).toEqual({
      subParts: 0,
      connectors: 0,
      colliders: 0,
      seats: 0,
      lights: 0,
      kittens: 0,
      animations: 0,
      // Default + IVA Seats + Lights + Kittens ship with every fresh document.
      layers: 4,
      customTextures: 0,
      customMaterials: 0,
      customMeshes: 0,
    });
  });

  it('counts a populated part', () => {
    const part: EditingPart = {
      ...createEmptyPart(),
      placements: [{}, {}, {}] as EditingPart['placements'],
      connectors: [{}] as EditingPart['connectors'],
      colliders: [{}, {}] as EditingPart['colliders'],
      ivaSeats: [{}] as EditingPart['ivaSeats'],
      lights: [{}, {}] as EditingPart['lights'],
      kittens: [{}] as EditingPart['kittens'],
      animations: [{}, {}] as EditingPart['animations'],
      customTextures: [{}] as EditingPart['customTextures'],
      customMaterials: [{}, {}] as EditingPart['customMaterials'],
      customMeshes: [{}, {}, {}] as EditingPart['customMeshes'],
    };
    expect(deriveCounts(part)).toEqual({
      subParts: 3,
      connectors: 1,
      colliders: 2,
      seats: 1,
      lights: 2,
      kittens: 1,
      animations: 2,
      layers: 4,
      customTextures: 1,
      customMaterials: 2,
      customMeshes: 3,
    });
  });
});
