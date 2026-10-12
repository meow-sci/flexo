import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { collisionMeshAtlasPaths } from './collisionAtlas';

describe('collision atlas references', () => {
  it('uses the host-only atlas rather than the preceding visual atlas for hull meshes', () => {
    const doc = new DOMParser().parseFromString(
      `<Assets>
      <MeshAtlas Path="Meshes/Visual.glb"/>
      <MeshAtlas Path="Meshes/Collision.glb" HostOnly="true"/>
      <Part Id="P"><Collider><ConvexHull><Mesh Id="_ColMesh_P_1"/></ConvexHull></Collider></Part>
      <SubPart Id="T"><Collider><ConvexHull><Mesh Id="_ColMesh_T_1"/></ConvexHull></Collider></SubPart>
    </Assets>`,
      'application/xml',
    ) as unknown as Document;
    expect([...collisionMeshAtlasPaths(doc)]).toEqual([
      ['_ColMesh_P_1', 'Meshes/Collision.glb'],
      ['_ColMesh_T_1', 'Meshes/Collision.glb'],
    ]);
  });
});
