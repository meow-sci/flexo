import { describe, it, expect, beforeEach } from 'vitest';
import {
  $canUndo,
  $part,
  $selection,
  $undoDescription,
  addCollider,
  addConnector,
  addIvaSeat,
  addKitten,
  addLight,
  addSubPart,
  clearSelection,
  createLayer,
  newPart,
  select,
  setActiveLayer,
} from './editorStore';
import { deselectAll, hasAnyEntity, invertSelection, selectAll } from './selectionOps';
import { $layerView, setLayerLocked, toggleLayerListed, toggleLayerVisible } from './layerStore';
import { DEFAULT_LAYER_ID } from '../ksa/types';

beforeEach(() => {
  // Per-layer view state is persisted, so a lock/hide/unlist set by an earlier test would
  // otherwise leak into this one.
  $layerView.set({});
  newPart();
});

/** One entity of every selectable kind, each on its own (built-in or active) layer. */
function addOneOfEachKind(): void {
  addSubPart('Core.A');
  addConnector();
  addCollider('Box');
  addIvaSeat();
  addLight(null);
  addKitten('hunter');
}

const keys = () => $selection.get().map((r) => `${r.kind}:${r.id}`);

describe('selectAll', () => {
  it('sweeps every kind on listed, visible, unlocked layers', () => {
    addOneOfEachKind();
    clearSelection();

    selectAll();
    expect(keys()).toEqual([
      'subpart:a_1',
      'connector:_connector1',
      'collider:_collider1',
      'ivaSeat:_seat1',
      'kitten:kitten_1',
      'light:_light1',
    ]);
  });

  it('excludes LOCKED, HIDDEN and UNLISTED layers', () => {
    addSubPart('Core.A'); // Default
    const locked = createLayer('Locked'); // becomes active
    addSubPart('Core.B');
    const hidden = createLayer('Hidden');
    addSubPart('Core.C');
    const unlisted = createLayer('Unlisted');
    addSubPart('Core.D');
    setActiveLayer(DEFAULT_LAYER_ID);

    setLayerLocked(locked, true);
    toggleLayerVisible(hidden); // layers default to visible
    toggleLayerListed(unlisted);

    selectAll();
    expect(keys()).toEqual(['subpart:a_1']);

    // Restoring each layer brings its entity back — the rule is read live, never cached.
    setLayerLocked(locked, false);
    toggleLayerVisible(hidden);
    toggleLayerListed(unlisted);
    selectAll();
    expect(keys()).toEqual(['subpart:a_1', 'subpart:b_1', 'subpart:c_1', 'subpart:d_1']);
  });

  it('is empty on an empty document', () => {
    selectAll();
    expect($selection.get()).toEqual([]);
    expect(hasAnyEntity()).toBe(false);
    addSubPart('Core.A');
    expect(hasAnyEntity()).toBe(true);
  });
});

describe('invertSelection', () => {
  it('inverts an empty selection into the select-all result, and back to empty', () => {
    addOneOfEachKind();
    clearSelection();

    invertSelection();
    const inverted = keys();
    selectAll();
    expect(inverted).toEqual(keys());

    invertSelection();
    expect($selection.get()).toEqual([]);
  });

  it('yields the complement of a half-selection, and twice restores the original set', () => {
    addSubPart('Core.A');
    addSubPart('Core.B');
    addSubPart('Core.C');
    addConnector();
    select([{ kind: 'subpart', id: 'b_1' }]);

    invertSelection();
    expect(new Set(keys())).toEqual(
      new Set(['subpart:a_1', 'subpart:c_1', 'connector:_connector1']),
    );

    invertSelection();
    expect(keys()).toEqual(['subpart:b_1']);
  });

  it('never pulls in an entity on an ineligible layer, and drops one already there', () => {
    addSubPart('Core.A'); // Default
    const locked = createLayer('Locked');
    addSubPart('Core.B');
    setActiveLayer(DEFAULT_LAYER_ID);

    select([{ kind: 'subpart', id: 'b_1' }]); // selected BEFORE the lock
    setLayerLocked(locked, true);

    invertSelection();
    expect(keys()).toEqual(['subpart:a_1']); // b_1 is neither kept nor re-added
  });
});

describe('selectionOps', () => {
  it('deselectAll clears', () => {
    addOneOfEachKind();
    selectAll();
    deselectAll();
    expect($selection.get()).toEqual([]);
  });

  it('never pushes an undo step — selection is view state, not document state', () => {
    addSubPart('Core.A');
    addConnector();
    const document = $part.get();
    const canUndo = $canUndo.get();
    const description = $undoDescription.get();

    selectAll();
    invertSelection();
    invertSelection();
    deselectAll();

    expect($part.get()).toBe(document);
    expect($canUndo.get()).toBe(canUndo);
    expect($undoDescription.get()).toBe(description);
  });
});
