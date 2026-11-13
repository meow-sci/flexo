import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { catalogFromContent, indexCatalog } from '../ksa/catalog';
import { resolveContent } from '../ksa/contentXml';
import { readVendoredAsset } from '../ksa/ksaTestAssets';
import { catalogPartsFromContent } from '../ksa/partCatalog';
import * as atlas from './MeshAtlasCache';
import * as materials from './MaterialFactory';
import { PartPreviewViewport } from './PartPreviewViewport';

// Keep the real scene, controls and SubPart objects; only GPU work is replaced.
vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: class {
    readonly domElement = document.createElement('canvas');
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {}
  },
}));
vi.mock('./SceneEnvironment', () => ({
  SceneEnvironment: class {
    async apply() {}
    dispose() {}
  },
}));
vi.mock('./textureSupport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./textureSupport')>()),
  initTextureSupport: vi.fn(),
}));

afterEach(() => vi.restoreAllMocks());

it('does not count the metadata-only EVA backpack as content when switching parts', async () => {
  const doc = new DOMParser().parseFromString(readVendoredAsset('PartAssets.xml'), 'text/xml');
  const content = resolveContent([{ file: 'PartAssets.xml', doc }]);
  const index = indexCatalog(
    catalogFromContent(content, { lightpartmesh: 'Meshes/circle_light.glb' }),
  );
  const parts = catalogPartsFromContent(content);
  const backpack = parts.find((part) => part.id === 'KittenBackPackPart')!;
  const light = parts.find((part) => part.id === 'LightPart')!;
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  const load = vi.spyOn(atlas, 'getSubPartGeometry').mockResolvedValue(geometry);
  vi.spyOn(materials, 'getSharedMaterial').mockResolvedValue(material);
  const viewport = new PartPreviewViewport(document.createElement('div'));
  try {
    expect(viewport.hasContent()).toBe(false);
    await viewport.setPart(backpack, index);
    expect(load).not.toHaveBeenCalled();
    expect(viewport.hasContent()).toBe(false);

    await viewport.setPart(light, index);
    expect(viewport.hasContent()).toBe(true);
    await viewport.setPart(backpack, index);
    expect(viewport.hasContent()).toBe(false);

    await viewport.setPart(
      { ...light, placements: [...backpack.placements, ...light.placements] },
      index,
    );
    expect(viewport.hasContent()).toBe(true);
    await viewport.setPart(null, index);
    expect(viewport.hasContent()).toBe(false);
  } finally {
    viewport.dispose();
    geometry.dispose();
    material.dispose();
  }
});
