import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { selectBrowserAssets } from './assetSelection';

const assets = process.env.KSA_ASSETS_DIR;
describe.skipIf(!assets)('browser asset selection against current Core', () => {
  it('keeps all referenced part/static resources and editor aides without planetary payloads', () => {
    const files = selectBrowserAssets(assets!);
    expect(files.has('Astronomicals.xml')).toBe(true);
    expect(files.has('SolSystem.xml')).toBe(true);
    expect(files.has('Characters/Kitten/KSA_Cat.gltf')).toBe(true);
    expect(files.has('Meshes/CoreSurfacesB_MeshAtlas.glb')).toBe(true);
    expect(files.has('Textures/CoreSurfacesB_TextureAtlas_Diffuse.ktx2')).toBe(true);
    expect(files.has('Textures/Earth_Height.ktx2')).toBe(false);
    expect([...files].some((file) => file.startsWith('Textures/Clouds/'))).toBe(false);
    for (const file of files) {
      expect(existsSync(join(assets!, file)), file).toBe(true);
      expect(statSync(join(assets!, file)).isFile(), file).toBe(true);
    }
  });
});
