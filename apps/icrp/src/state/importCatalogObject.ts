/** Imports a Core `<StaticObject>` prefab as the project's active object. */
import { randomId } from '../../../../src/state/ids';
import type { CatalogStaticObject } from '../ksa/staticCatalog';
import { defaultLayer } from '../ksa/types';
import { $project, ICRP_PROJECT_SCHEMA_VERSION, resetProject } from './docStore';
import { getScene } from '../three/sceneHandle';

export function importCatalogObject(obj: CatalogStaticObject): void {
  const id = `icrp_object_${randomId().slice(0, 8)}`;
  resetProject({
    schemaVersion: ICRP_PROJECT_SCHEMA_VERSION,
    modName: $project.get().modName,
    objects: [
      {
        id,
        name: obj.id,
        layers: [defaultLayer()],
        placements: obj.placements.map((pl) => ({
          instanceId: pl.instanceId,
          pieceId: pl.instanceOf,
          transform: structuredClone(pl.transform),
          layerId: 'default',
        })),
        objectColliders: structuredClone(obj.colliders),
        groundOffsetM: obj.groundOffsetM,
        surfaceHeightM: obj.surfaceHeightM,
        footprintRadiusM: obj.footprintRadiusM,
      },
    ],
    activeObjectId: id,
    sites: [],
  });
  setTimeout(() => getScene()?.frameAll(), 300);
}
