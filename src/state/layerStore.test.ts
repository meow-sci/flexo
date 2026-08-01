import { describe, it, expect, beforeEach } from 'vitest';
import {
  $layerView,
  DEFAULT_LAYER_STATE,
  isLayerListed,
  isLayerVisible,
  layerViewState,
  revealLayer,
  setLayerLocked,
  toggleLayerListed,
  toggleLayerVisible,
} from './layerStore';
import {
  $selectedColliderIndices,
  $selectedIndices,
  $selectedIvaSeatIndices,
  $selectedLightIndices,
  addCollider,
  addIvaSeat,
  addLight,
  addSubPart,
  clearSelection,
  newPart,
  selectLayerEntities,
  setSelectedColliders,
  setSelectedIvaSeats,
  setSelectedLights,
  setSelectedPlacements,
} from './editorStore';
import { DEFAULT_LAYER_ID, IVA_SEAT_LAYER_ID, LIGHT_LAYER_ID } from '../ksa/types';

beforeEach(() => {
  $layerView.set({});
  newPart();
});

describe('layerStore — listed flag', () => {
  it('defaults to listed for an unset layer', () => {
    expect(DEFAULT_LAYER_STATE.listed).toBe(true);
    expect(isLayerListed('whatever')).toBe(true);
  });

  it('toggleLayerListed flips and persists into $layerView', () => {
    toggleLayerListed('engines');
    expect(isLayerListed('engines')).toBe(false);
    expect($layerView.get().engines?.listed).toBe(false);
    toggleLayerListed('engines');
    expect(isLayerListed('engines')).toBe(true);
  });

  it('back-fills listed/opacity defaults for legacy entries missing the fields', () => {
    // A persisted entry from before the `listed`/`opacity` fields existed.
    $layerView.set({ x: { visible: false, locked: true } as never });
    expect(isLayerListed('x')).toBe(true);
    expect(layerViewState($layerView.get(), 'x')).toEqual({
      visible: false,
      locked: true,
      listed: true,
      opacity: 1,
    });
  });

  it('toggling listed does NOT prune the selection (unlike lock)', () => {
    addSubPart('Core.A'); // lands on the active Default layer
    setSelectedPlacements([0]);
    expect($selectedIndices.get()).toEqual([0]);

    toggleLayerListed(DEFAULT_LAYER_ID);
    expect($selectedIndices.get()).toEqual([0]); // still selected

    setLayerLocked(DEFAULT_LAYER_ID, true);
    expect($selectedIndices.get()).toEqual([]); // lock prunes
  });

  // Regression: `deselectLayer` used to prune only placements/connectors/kittens, so locking
  // a layer holding a collider or an IVA seat left the gizmo attached to an already-selected
  // entity — `EditorScene` only re-checks the lock when the SELECTION changes, so the next
  // drag moved it.
  it('locking a layer prunes EVERY selectable kind, including colliders, IVA seats and lights', () => {
    addCollider('Box');
    addIvaSeat();
    addLight(null);

    // The kinds are mutually exclusive, so each is checked on its own.
    setSelectedColliders([0]);
    expect($selectedColliderIndices.get()).toEqual([0]);
    setLayerLocked(IVA_SEAT_LAYER_ID, true);
    expect($selectedColliderIndices.get()).toEqual([0]); // a different layer — untouched
    setLayerLocked(DEFAULT_LAYER_ID, true);
    expect($selectedColliderIndices.get()).toEqual([]);

    setLayerLocked(IVA_SEAT_LAYER_ID, false);
    setSelectedIvaSeats([0]);
    expect($selectedIvaSeatIndices.get()).toEqual([0]);
    setLayerLocked(IVA_SEAT_LAYER_ID, true);
    expect($selectedIvaSeatIndices.get()).toEqual([]);

    setSelectedLights([0]);
    expect($selectedLightIndices.get()).toEqual([0]);
    setLayerLocked(DEFAULT_LAYER_ID, true);
    expect($selectedLightIndices.get()).toEqual([0]); // a different layer — untouched
    setLayerLocked(LIGHT_LAYER_ID, true);
    expect($selectedLightIndices.get()).toEqual([]);
  });

  it('selectLayerEntities selects a layer’s colliders, IVA seats and lights', () => {
    addCollider('Box');
    addIvaSeat();
    addLight(null);
    clearSelection();

    selectLayerEntities(IVA_SEAT_LAYER_ID);
    expect($selectedIvaSeatIndices.get()).toEqual([0]);
    expect($selectedColliderIndices.get()).toEqual([]);
    expect($selectedLightIndices.get()).toEqual([]);

    selectLayerEntities(DEFAULT_LAYER_ID);
    expect($selectedColliderIndices.get()).toEqual([0]);
    expect($selectedIvaSeatIndices.get()).toEqual([]);

    selectLayerEntities(LIGHT_LAYER_ID);
    expect($selectedLightIndices.get()).toEqual([0]);
    expect($selectedColliderIndices.get()).toEqual([]);
    expect($selectedIvaSeatIndices.get()).toEqual([]);
  });

  it('revealLayer makes a hidden + unlisted layer visible and listed again', () => {
    toggleLayerVisible('engines'); // -> hidden
    toggleLayerListed('engines'); // -> unlisted
    expect(isLayerVisible('engines')).toBe(false);
    expect(isLayerListed('engines')).toBe(false);
    revealLayer('engines');
    expect(isLayerVisible('engines')).toBe(true);
    expect(isLayerListed('engines')).toBe(true);
  });
});
