import { describe, expect, it } from 'vitest';
import { buildMeshIndex } from './meshIndex';
import { hasKsaAssets, KSA_ASSETS_DIR } from '../src/ksa/ksaTestAssets';

describe('Core mesh index', () => {
  it.runIf(hasKsaAssets)('indexes stock static meshes by their GLB names', () => {
    const index = buildMeshIndex(KSA_ASSETS_DIR);
    expect(index.corelaunchpada_subpart_footpatha).toBe('Meshes/CoreLaunchPadA_MeshAtlas.glb');
    expect(index.corelaunchpadb_subpart_graveltrima).toBe('Meshes/CoreLaunchPadB_MeshAtlas.glb');
  });
});
