import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as atlas from './MeshAtlasCache';
import { SubPartObject } from './SubPartObject';
import { identityTransform, DEFAULT_LAYER_ID } from '../ksa/types';
import type { CatalogRenderModel, CatalogSubPart } from '../ksa/catalog';
import { catalogRenderModels } from './catalogRenderModels';

describe('catalogRenderModels', () => {
  it('retains every native model and uses the scalar binding for synthetic entries', () => {
    const models = [
      { kind: 'PartModel', meshNodeName: 'one' },
      { kind: 'PartModelGlass', meshNodeName: 'two' },
    ] as CatalogRenderModel[];
    const entry = {
      id: 'test',
      atlasUrl: 'atlas',
      meshNodeName: 'one',
      sourceFile: 'test',
      models,
    } satisfies CatalogSubPart;
    expect(catalogRenderModels(entry)).toEqual(models);
    const synthetic = { ...entry, models: undefined };
    expect(catalogRenderModels(synthetic)).toEqual([synthetic]);
    expect(catalogRenderModels({ ...entry, models: [] })).toEqual([]);
  });
  it('creates and updates a metadata-only placement without requesting geometry', async () => {
    const load = vi.spyOn(atlas, 'getSubPartGeometry');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const placement = {
      instanceId: 'hidden',
      subPartTemplateId: 'hidden',
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    };
    const obj = await SubPartObject.create(
      { id: 'hidden', atlasUrl: '', meshNodeName: null, models: [], sourceFile: 'test' },
      placement,
    );
    expect(obj.group.children).toHaveLength(0);
    expect(load).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    obj.setSelected(true);
    obj.setFaceHighlight(0, false);
    obj.setLayerOpacity(0.5);
    obj.setGeometryOverride(new THREE.BufferGeometry());
    obj.setGeometryOverride(null);
    obj.dispose();
    load.mockRestore();
    error.mockRestore();
  });
});
