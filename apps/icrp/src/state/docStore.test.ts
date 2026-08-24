import { beforeEach, describe, expect, it } from 'vitest';
import {
  $activeLayerId,
  $activeObject,
  $selection,
  addLayer,
  addPlacement,
  importStockPart,
  removeLayer,
  resetProject,
  setLayerVisible,
  setPlacementsLayer,
  undo,
  DEFAULT_LAYER_ID,
} from './docStore';

beforeEach(() => {
  resetProject();
  $activeLayerId.set(DEFAULT_LAYER_ID);
});

describe('layers', () => {
  it('new placements land in the active layer', () => {
    const layerId = addLayer('Pads');
    expect($activeLayerId.get()).toBe(layerId);
    addPlacement('CoreLaunchPadA_Subpart_PadA');
    expect($activeObject.get().placements[0].layerId).toBe(layerId);
  });

  it('removeLayer reassigns its placements to Default and is undoable', () => {
    const layerId = addLayer('Pads');
    addPlacement('X');
    removeLayer(layerId);
    const obj = $activeObject.get();
    expect(obj.layers.some((l) => l.id === layerId)).toBe(false);
    expect(obj.placements[0].layerId).toBe(DEFAULT_LAYER_ID);
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID);
    undo();
    expect($activeObject.get().placements[0].layerId).toBe(layerId);
  });

  it('the Default layer cannot be removed', () => {
    removeLayer(DEFAULT_LAYER_ID);
    expect($activeObject.get().layers.some((l) => l.id === DEFAULT_LAYER_ID)).toBe(true);
  });

  it('hiding a layer deselects its placements (visibility is not an undo step)', () => {
    addPlacement('X');
    const instanceId = $activeObject.get().placements[0].instanceId;
    $selection.set([instanceId]);
    setLayerVisible(DEFAULT_LAYER_ID, false);
    expect($selection.get()).toEqual([]);
    expect($activeObject.get().layers[0].visible).toBe(false);
    // Not an undo step: undoing reverts the ADD, not the visibility.
    undo();
    expect($activeObject.get().placements).toHaveLength(0);
  });

  it('setPlacementsLayer moves placements in one undo step', () => {
    addPlacement('A');
    addPlacement('B');
    const ids = $activeObject.get().placements.map((pl) => pl.instanceId);
    const layerId = addLayer('Group');
    setPlacementsLayer(ids, layerId);
    expect($activeObject.get().placements.every((pl) => pl.layerId === layerId)).toBe(true);
    undo();
    expect($activeObject.get().placements.every((pl) => pl.layerId === DEFAULT_LAYER_ID)).toBe(
      true,
    );
  });
});

describe('importStockPart', () => {
  const part = {
    id: 'CoreFuelTankA_Prefab_LF1W1HA',
    placements: [
      {
        instanceId: 'tank_1',
        subPartTemplateId: 'CoreFuelTankA_Subpart_Tank',
        position: { x: 0.5, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 1.5708 },
        scale: { x: 1, y: 1, z: 1 },
      },
      {
        instanceId: 'nope_1',
        subPartTemplateId: 'CoreIVA_Subpart_NoMesh',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    ],
  };
  const anchorCollider = {
    id: 'CylinderCollider1',
    shape: 'Cylinder' as const,
    ownerTemplateId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: 'default',
  };
  const pieceExists = (id: string) => id === 'CoreFuelTankA_Subpart_Tank';

  it('explodes the part into placements on a NEW layer named after it, selecting them', () => {
    const result = importStockPart(part, { kind: 'new' }, pieceExists, [anchorCollider]);
    const obj = $activeObject.get();
    const layer = obj.layers.find((l) => l.id === result.layerId)!;
    expect(layer.name).toBe('LF1W1HA');
    expect(result.imported).toHaveLength(1);
    expect(result.skippedTemplates).toEqual(['CoreIVA_Subpart_NoMesh']);
    const pl = obj.placements[0];
    expect(pl.pieceId).toBe('CoreFuelTankA_Subpart_Tank');
    expect(pl.layerId).toBe(result.layerId);
    expect(pl.transform.position).toEqual({ x: 0.5, y: 0, z: 0 });
    expect(pl.transform.rotation.z).toBeCloseTo(1.5708, 9);
    // Anchor colliders land on the FIRST imported placement.
    expect(pl.colliders).toHaveLength(1);
    expect(pl.colliders![0].id).toBe('CylinderCollider1');
    expect($selection.get()).toEqual(result.imported);
    expect($activeLayerId.get()).toBe(result.layerId);
  });

  it('targets an existing layer and is one undo step', () => {
    const layerId = addLayer('Shared');
    importStockPart(part, { kind: 'existing', layerId }, pieceExists);
    expect($activeObject.get().placements[0].layerId).toBe(layerId);
    undo();
    expect($activeObject.get().placements).toHaveLength(0);
    // No new layer was minted for the existing-target import.
    expect($activeObject.get().layers.map((l) => l.name)).toContain('Shared');
  });
});
