import { describe, it, expect, beforeEach } from 'vitest';
import {
  $layerView,
  DEFAULT_LAYER_STATE,
  expandLayer,
  isLayerCollapsed,
  isLayerListed,
  isLayerVisible,
  layerViewState,
  revealLayer,
  toggleLayerCollapsed,
  setLayerLocked,
  toggleLayerListed,
  toggleLayerVisible,
} from './layerStore';
import {
  $canUndo,
  $selection,
  addCollider,
  addIvaSeat,
  addLight,
  addSubPart,
  clearSelection,
  createLayer,
  newPart,
  select,
  selectLayerEntities,
  type EntityKind,
} from './editorStore';
import { DEFAULT_LAYER_ID, IVA_SEAT_LAYER_ID } from '../ksa/types';

/** Ids of the selected entities of one kind, in selection order. */
const selectedIds = (kind: EntityKind): string[] =>
  $selection
    .get()
    .filter((r) => r.kind === kind)
    .map((r) => r.id);

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
      collapsed: false,
    });
  });

  it('toggling listed does NOT prune the selection (unlike lock)', () => {
    addSubPart('Core.A'); // lands on the active Default layer
    select([{ kind: 'subpart', id: 'a_1' }]);
    expect(selectedIds('subpart')).toEqual(['a_1']);

    toggleLayerListed(DEFAULT_LAYER_ID);
    expect(selectedIds('subpart')).toEqual(['a_1']); // still selected

    setLayerLocked(DEFAULT_LAYER_ID, true);
    expect(selectedIds('subpart')).toEqual([]); // lock prunes
  });

  // Regression: `deselectLayer` used to prune only placements/connectors/kittens, so locking
  // a layer holding a collider or an IVA seat left the gizmo attached to an already-selected
  // entity — `EditorScene` only re-checks the lock when the SELECTION changes, so the next
  // drag moved it.
  it('locking a layer prunes EVERY selectable kind, including colliders, IVA seats and lights', () => {
    addCollider('Box');
    addIvaSeat();
    // A light is an ordinary layer citizen, so park it on its own layer to prove the prune
    // is per-layer rather than "every light, whenever any layer locks".
    const lamps = createLayer('Lamps'); // …which also makes it the active layer
    addLight(null);

    // Each kind is checked on its own so a pruning gap in one can't hide behind another.
    select([{ kind: 'collider', id: '_collider1' }]);
    expect(selectedIds('collider')).toEqual(['_collider1']);
    setLayerLocked(IVA_SEAT_LAYER_ID, true);
    expect(selectedIds('collider')).toEqual(['_collider1']); // a different layer — untouched
    setLayerLocked(DEFAULT_LAYER_ID, true);
    expect(selectedIds('collider')).toEqual([]);

    setLayerLocked(IVA_SEAT_LAYER_ID, false);
    select([{ kind: 'ivaSeat', id: '_seat1' }]);
    expect(selectedIds('ivaSeat')).toEqual(['_seat1']);
    setLayerLocked(IVA_SEAT_LAYER_ID, true);
    expect(selectedIds('ivaSeat')).toEqual([]);

    select([{ kind: 'light', id: '_light1' }]);
    expect(selectedIds('light')).toEqual(['_light1']);
    setLayerLocked(DEFAULT_LAYER_ID, true);
    expect(selectedIds('light')).toEqual(['_light1']); // a different layer — untouched
    setLayerLocked(lamps, true);
    expect(selectedIds('light')).toEqual([]);
  });

  it('selectLayerEntities selects a layer’s colliders, IVA seats and lights', () => {
    addCollider('Box');
    addIvaSeat();
    const lamps = createLayer('Lamps'); // …which also makes it the active layer
    addLight(null);
    clearSelection();

    selectLayerEntities(IVA_SEAT_LAYER_ID);
    expect(selectedIds('ivaSeat')).toEqual(['_seat1']);
    expect(selectedIds('collider')).toEqual([]);
    expect(selectedIds('light')).toEqual([]);

    selectLayerEntities(DEFAULT_LAYER_ID);
    expect(selectedIds('collider')).toEqual(['_collider1']);
    expect(selectedIds('ivaSeat')).toEqual([]);
    expect(selectedIds('light')).toEqual([]);

    selectLayerEntities(lamps);
    expect(selectedIds('light')).toEqual(['_light1']);
    expect(selectedIds('collider')).toEqual([]);
    expect(selectedIds('ivaSeat')).toEqual([]);
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

describe('layerStore — Outliner collapsed flag', () => {
  it('defaults to expanded for a layer with no stored entry', () => {
    expect(DEFAULT_LAYER_STATE.collapsed).toBe(false);
    expect(isLayerCollapsed('engines')).toBe(false);
    expect(layerViewState({}, 'engines').collapsed).toBe(false);
  });

  it('fills the default for a stored entry written before the field existed', () => {
    // A snapshot from an earlier build: the other four fields, no `collapsed`.
    $layerView.set({
      engines: { visible: false, locked: true, listed: true, opacity: 0.5 } as never,
    });
    expect(isLayerCollapsed('engines')).toBe(false);
    expect(isLayerVisible('engines')).toBe(false);
  });

  it('toggleLayerCollapsed flips and persists into $layerView', () => {
    toggleLayerCollapsed('engines');
    expect(isLayerCollapsed('engines')).toBe(true);
    expect($layerView.get().engines?.collapsed).toBe(true);
    toggleLayerCollapsed('engines');
    expect(isLayerCollapsed('engines')).toBe(false);
  });

  it('expandLayer is idempotent and never collapses', () => {
    expandLayer('engines');
    expect(isLayerCollapsed('engines')).toBe(false);
    toggleLayerCollapsed('engines');
    expandLayer('engines');
    expandLayer('engines');
    expect(isLayerCollapsed('engines')).toBe(false);
  });

  it('creates no undo step (layer view state is never undo-tracked)', () => {
    expect($canUndo.get()).toBe(false);
    toggleLayerCollapsed('engines');
    expandLayer('engines');
    expect($canUndo.get()).toBe(false);
  });

  it('leaves the other view fields alone', () => {
    toggleLayerVisible('engines');
    toggleLayerCollapsed('engines');
    expect(isLayerVisible('engines')).toBe(false);
    expect(isLayerCollapsed('engines')).toBe(true);
    expect(isLayerListed('engines')).toBe(true);
  });
});
