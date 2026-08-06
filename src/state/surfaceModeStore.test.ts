import { describe, it, expect, beforeEach } from 'vitest';
import { $part, newPart, select } from './editorStore';
import { $mode, setMode } from './modeStore';
import {
  $faceHighlight,
  $surfaceFace,
  $surfaceMeshId,
  faceKeysFor,
  initSurfaceMode,
  pickSurfaceFace,
  pickSurfaceMesh,
} from './surfaceModeStore';
import type { CustomMesh, EditingPart } from '../ksa/types';

/**
 * Surface mode's sub-state (design-surface-assets.md §1.1; foundation §2.4).
 *
 * The contract worth testing without a DOM is the CLAMP and the ENTRY LADDER: a pick that
 * outlives its mesh (undo past creation, remove-import) must not leave the sidebar editing a
 * ghost, and entering the mode has to answer "which mesh?" the same way every time.
 */

// The `$part` clamp subscription lives here; registration is idempotent, so calling it once
// for the file is enough.
initSurfaceMode();

function boxMesh(over: Partial<CustomMesh> = {}): CustomMesh {
  return {
    id: 'mesh_box',
    name: 'Hull Box',
    subPartId: 'flexo_HullBox_a1',
    primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
    faceTextures: {},
    ...over,
  };
}

function setPart(patch: Partial<EditingPart>): void {
  $part.set({ ...$part.get(), ...patch });
}

beforeEach(() => {
  newPart();
  setMode('build');
  pickSurfaceMesh(null);
});

describe('faceKeysFor', () => {
  it('returns the primitive kind’s ordered keys, and nothing for the other kinds', () => {
    expect(faceKeysFor(boxMesh())).toEqual(['right', 'left', 'top', 'bottom', 'front', 'back']);
    expect(
      faceKeysFor(
        boxMesh({
          primitive: { kind: 'cylinder', params: { radius: 1, height: 1, radialSegments: 8 } },
        }),
      ),
    ).toEqual(['side', 'top', 'bottom']);
    expect(
      faceKeysFor(boxMesh({ primitive: { kind: 'sphere', params: { radius: 1, segments: 8 } } })),
    ).toEqual(['all']);
    expect(faceKeysFor(boxMesh({ primitive: undefined }))).toEqual([]);
    expect(faceKeysFor(undefined)).toEqual([]);
  });
});

describe('picking', () => {
  it('seeds the face to the mesh’s first key, and null for a mesh with no face grid', () => {
    setPart({ customMeshes: [boxMesh()] });
    pickSurfaceMesh('mesh_box');
    expect($surfaceFace.get()).toBe('right');

    setPart({
      customMeshes: [
        boxMesh({
          id: 'mesh_imported',
          primitive: undefined,
          imported: {
            importId: 'imp',
            meshName: 'n',
            sourceFile: 'f.glb',
            sourceNode: 'n',
            sourceMaterial: 'm',
            triangles: 1,
            vertices: 3,
          },
        }),
      ],
    });
    pickSurfaceMesh('mesh_imported');
    expect($surfaceFace.get()).toBeNull();
  });

  it('refuses a face key the picked mesh does not have', () => {
    setPart({ customMeshes: [boxMesh()] });
    pickSurfaceMesh('mesh_box');
    pickSurfaceFace('side'); // a cylinder key
    expect($surfaceFace.get()).toBe('right');
    pickSurfaceFace('top');
    expect($surfaceFace.get()).toBe('top');
    pickSurfaceFace(null);
    expect($surfaceFace.get()).toBeNull();
  });
});

describe('clamping vs $part', () => {
  it('nulls the pick when the mesh is removed', () => {
    setPart({ customMeshes: [boxMesh()] });
    pickSurfaceMesh('mesh_box');
    expect($surfaceMeshId.get()).toBe('mesh_box');

    setPart({ customMeshes: [] });
    expect($surfaceMeshId.get()).toBeNull();
    expect($surfaceFace.get()).toBeNull();
  });

  it('falls back to the first key when the primitive kind changes underneath it', () => {
    setPart({ customMeshes: [boxMesh()] });
    pickSurfaceMesh('mesh_box');
    pickSurfaceFace('back');
    expect($surfaceFace.get()).toBe('back');

    // A box resized into a cylinder no longer has a 'back' face group.
    setPart({
      customMeshes: [
        boxMesh({
          primitive: { kind: 'cylinder', params: { radius: 1, height: 1, radialSegments: 8 } },
        }),
      ],
    });
    expect($surfaceFace.get()).toBe('side');
  });
});

describe('$faceHighlight', () => {
  it('is null outside Surface mode and non-null inside it', () => {
    setPart({ customMeshes: [boxMesh()] });
    pickSurfaceMesh('mesh_box');
    expect($faceHighlight.get()).toBeNull();

    setMode('surface');
    expect($faceHighlight.get()).toEqual({ meshId: 'mesh_box', faceKey: 'right' });

    // Leaving clears it — the derivation IS the exit effect (foundation §2.4).
    setMode('build');
    expect($faceHighlight.get()).toBeNull();
  });
});

describe('mode entry', () => {
  it('auto-picks the template of a selected custom-mesh placement', () => {
    setPart({
      customMeshes: [boxMesh()],
      placements: [
        {
          instanceId: 'hull_1',
          subPartTemplateId: 'flexo_HullBox_a1',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          layerId: 'default',
        },
      ],
    });
    select([{ kind: 'subpart', id: 'hull_1' }]);

    setMode('surface');
    expect($mode.get()).toBe('surface');
    expect($surfaceMeshId.get()).toBe('mesh_box');
    expect($surfaceFace.get()).toBe('right');
  });

  it('a jump payload always wins over the selection', () => {
    setPart({
      customMeshes: [boxMesh(), boxMesh({ id: 'mesh_b', subPartId: 'flexo_B_b1', name: 'B' })],
      placements: [
        {
          instanceId: 'hull_1',
          subPartTemplateId: 'flexo_HullBox_a1',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          layerId: 'default',
        },
      ],
    });
    select([{ kind: 'subpart', id: 'hull_1' }]);

    setMode('surface', { surfaceMeshId: 'mesh_b', surfaceFace: 'top' });
    expect($surfaceMeshId.get()).toBe('mesh_b');
    expect($surfaceFace.get()).toBe('top');
  });

  it('exit preserves the picked mesh for the return trip', () => {
    setPart({ customMeshes: [boxMesh()] });
    pickSurfaceMesh('mesh_box');
    setMode('surface');
    setMode('build');
    expect($surfaceMeshId.get()).toBe('mesh_box');
    // …and re-entering with nothing selected restores it rather than emptying the picker.
    setMode('surface');
    expect($surfaceMeshId.get()).toBe('mesh_box');
  });
});
