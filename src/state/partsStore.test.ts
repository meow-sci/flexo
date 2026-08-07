import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The part registry (`plans/MULTI_PART_PLAN.md` P1). No mocks are needed: partsStore only
 * touches the live editor stores plus the pure `deriveCounts` helper — nothing here reaches
 * IndexedDB, so the real actions run end to end.
 *
 * What these pin is the switch choreography: a part's document, its per-part layer view and
 * its undo stacks travel together, and NOTHING here is undoable (I6 — the registry is
 * lifecycle + view state, so not one of these actions may push a history entry).
 */
import {
  $activePartId,
  $inactiveRevision,
  $partEntries,
  $partsSnapshot,
  addImportedParts,
  createPart,
  deletePart,
  duplicatePart,
  getInactiveDoc,
  inactiveHistoriesRecord,
  initPartsForNewProject,
  movePart,
  partsForExport,
  registerPartAssetSweeper,
  renamePart,
  setPartIncludeInExport,
  setPartOffset,
  setPartOpacity,
  setPartVisible,
  snapshotParts,
  switchPart,
} from './partsStore';
import {
  $activeLayerId,
  $canUndo,
  $historyList,
  $part,
  $selection,
  addSubPart,
  createLayer,
  exportHistory,
  newPart,
  setPartId,
  undo,
} from './editorStore';
import { $chainSession, closeChain, openChain } from './chainStore';
import { $layerView, setLayerOpacity } from './layerStore';
import {
  createEmptyPart,
  DEFAULT_LAYER_ID,
  DEFAULT_PART_ID,
  identityTransform,
  isDefaultPartId,
} from '../ksa/types';
import type { EditingPart } from '../ksa/types';

/** The meta entry for `id` — every registry assertion below reads through it. */
function entryOf(id: string) {
  return $partEntries.get().find((entry) => entry.id === id)!;
}

/** How many undo steps the LIVE editor is holding (0 when the stacks are empty). */
function undoDepth(): number {
  return $historyList.get().filter((item) => item.stepsFromCurrent < 0).length;
}

beforeEach(() => {
  newPart();
  $layerView.set({});
  closeChain();
  initPartsForNewProject();
});

describe('partsStore — init', () => {
  it('a new project starts with exactly one empty, active "Part 1"', () => {
    initPartsForNewProject();

    const entries = $partEntries.get();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'Part 1',
      visible: true,
      opacity: 1,
      offset: { x: 0, y: 0, z: 0 },
      includeInExport: true,
    });
    expect(entries[0].id).toMatch(/^pt_/);
    expect($activePartId.get()).toBe(entries[0].id);
    expect(entries[0].counts.subParts).toBe(0);
    expect(entries[0].counts.layers).toBe(createEmptyPart().layers.length);

    // Both module maps are empty: the one part IS the active one, so it has no parked doc.
    expect(getInactiveDoc(entries[0].id)).toBeNull();
    expect(inactiveHistoriesRecord()).toEqual({});
    // …and it composes out of the LIVE stores.
    expect(snapshotParts().map((p) => p.id)).toEqual([entries[0].id]);
    expect(snapshotParts()[0].part).toEqual($part.get());
  });
});

describe('partsStore — createPart', () => {
  it('parks the outgoing document and history, then hands over a clean slate', () => {
    const first = $activePartId.get();
    createLayer('Engines');
    addSubPart('Core.A');
    expect($canUndo.get()).toBe(true);

    const second = createPart();

    expect($activePartId.get()).toBe(second);
    expect(second).not.toBe(first);
    // A brand-new document, view state and history — nothing of the old part leaked through.
    // The Part Id is the one exception: it is de-collided against the part already in the
    // project, so it is the placeholder plus a counter rather than the bare placeholder.
    expect($part.get()).toEqual({ ...createEmptyPart(), partId: `${DEFAULT_PART_ID}_2` });
    expect($layerView.get()).toEqual({});
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID);
    expect($canUndo.get()).toBe(false);
    expect(undoDepth()).toBe(0);

    // The outgoing part is retrievable in full: document, view state AND its undo stacks.
    const parked = getInactiveDoc(first)!;
    expect(parked.part.placements).toHaveLength(1);
    expect(parked.activeLayerId).not.toBe(DEFAULT_LAYER_ID);
    expect(inactiveHistoriesRecord()[first].undo.length).toBeGreaterThan(0);
    // Parking re-derives the chips' counts from the parked document.
    expect(entryOf(first).counts.subParts).toBe(1);
  });

  it('mints unique display names', () => {
    createPart();
    createPart();
    expect($partEntries.get().map((e) => e.name)).toEqual(['Part 1', 'Part 2', 'Part 3']);
  });

  it('bumps the inactive revision so the ghost layer re-plans', () => {
    const before = $inactiveRevision.get();
    createPart();
    expect($inactiveRevision.get()).toBe(before + 1);
  });
});

describe('partsStore — switchPart round-trip', () => {
  it('restores the document, the layer view and the active layer exactly', () => {
    const a = $activePartId.get();
    const b = createPart();
    expect(switchPart(a)).toBe(true);

    const engines = createLayer('Engines'); // active = Engines
    addSubPart('Core.A');
    setLayerOpacity(engines, 0.4);
    const docA = structuredClone($part.get());
    const viewA = structuredClone($layerView.get());

    const before = $inactiveRevision.get();
    expect(switchPart(b)).toBe(true);
    expect($inactiveRevision.get()).toBe(before + 1);
    // B is untouched by everything that happened in A.
    expect($part.get().placements).toEqual([]);
    expect($layerView.get()).toEqual({});
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID);

    expect(switchPart(a)).toBe(true);
    expect($inactiveRevision.get()).toBe(before + 2);
    expect($part.get()).toEqual(docA);
    expect($layerView.get()).toEqual(viewA);
    expect($activeLayerId.get()).toBe(engines);
  });

  it('refuses a switch to the active part or to an id that names no entry', () => {
    const a = $activePartId.get();
    expect(switchPart(a)).toBe(false);
    expect(switchPart('pt_nothing')).toBe(false);
    expect($activePartId.get()).toBe(a);
  });

  it('clamps an active layer the incoming document no longer has', () => {
    const a = $activePartId.get();
    const engines = createLayer('Engines');
    const b = createPart();
    // Reach into the parked doc the way a stale snapshot would: the layer is gone, the
    // pointer at it is not.
    getInactiveDoc(a)!.part.layers = getInactiveDoc(a)!.part.layers.filter((l) => l.id !== engines);

    expect(switchPart(a)).toBe(true);
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID);
    expect(b).not.toBe(a);
  });
});

describe('partsStore — undo isolation', () => {
  it('gives every part its own stacks, and travels them with the switch', () => {
    const a = $activePartId.get();
    addSubPart('Core.A');
    expect($canUndo.get()).toBe(true);

    const b = createPart();
    expect($canUndo.get()).toBe(false); // a fresh part starts with nothing to undo

    addSubPart('Core.B');
    expect($part.get().placements).toHaveLength(1);
    undo(); // B's own mutation reverts…
    expect($part.get().placements).toEqual([]);
    expect($canUndo.get()).toBe(false); // …and B's stack is the only one that emptied

    expect(switchPart(a)).toBe(true);
    expect($canUndo.get()).toBe(true);
    expect($part.get().placements).toHaveLength(1);
    undo();
    expect($part.get().placements).toEqual([]);

    // Nothing about the registry itself is undoable (I6): B still holds exactly the one
    // redo it earned, and no create/switch step was ever pushed.
    expect(switchPart(b)).toBe(true);
    expect(undoDepth()).toBe(0);
  });
});

describe('partsStore — deletePart', () => {
  // The sweeper slot is module-global (injected once at startup), so the spy the sweep test
  // installs has to be handed back as a no-op — otherwise it outlives its own test.
  afterEach(() => {
    registerPartAssetSweeper(async () => {});
  });

  it('refuses to empty the project, and refuses an unknown id', () => {
    const only = $activePartId.get();
    expect(deletePart(only)).toBe(false);
    expect($partEntries.get()).toHaveLength(1);

    createPart();
    expect(deletePart('pt_nothing')).toBe(false);
    expect($partEntries.get()).toHaveLength(2);
  });

  it('deleting the active part falls back to the next entry, then to the previous', () => {
    const a = $activePartId.get();
    const b = createPart();
    const c = createPart();
    expect(switchPart(b)).toBe(true);

    expect(deletePart(b)).toBe(true); // next = C
    expect($activePartId.get()).toBe(c);
    expect($partEntries.get().map((e) => e.id)).toEqual([a, c]);
    expect(getInactiveDoc(b)).toBeNull();

    expect(deletePart(c)).toBe(true); // no next → previous = A
    expect($activePartId.get()).toBe(a);
    expect($partEntries.get().map((e) => e.id)).toEqual([a]);
  });

  it('deleting an inactive part leaves the active document exactly where it was', () => {
    const a = $activePartId.get();
    const b = createPart();
    addSubPart('Core.B');
    const live = $part.get();
    const depth = undoDepth(); // measured AFTER the one document edit B is allowed to have

    expect(deletePart(a)).toBe(true);
    expect($activePartId.get()).toBe(b);
    expect($part.get()).toBe(live); // not re-published, not re-hydrated
    expect($partEntries.get().map((e) => e.id)).toEqual([b]);
    expect(undoDepth()).toBe(depth); // I6: a lifecycle action, never an undo step
  });

  it("hands the doomed part's own document to the registered asset sweeper", () => {
    const a = $activePartId.get();
    const b = createPart();
    addSubPart('Core.B'); // B's document — the one whose blobs the delete has to sweep
    expect(switchPart(a)).toBe(true);
    const doomed = getInactiveDoc(b)!.part;

    const sweep = vi.fn(async (_doc: EditingPart) => {});
    registerPartAssetSweeper(sweep);
    expect(deletePart(b)).toBe(true);

    // I4: asset ids are project-unique, so exactly one sweep runs and it gets B's parked
    // document — not the live one, and not a copy the sweep could not match ids against.
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(sweep.mock.calls[0][0]).toBe(doomed);
    expect(sweep.mock.calls[0][0].placements).toHaveLength(1);
  });

  it("destroys the doomed part's parked history — a re-created namesake starts clean", () => {
    const a = $activePartId.get();
    const b = createPart(); // "Part 2"
    addSubPart('Core.B');
    expect(switchPart(a)).toBe(true);
    expect(inactiveHistoriesRecord()[b].undo.length).toBeGreaterThan(0);

    expect(deletePart(b)).toBe(true);
    expect(inactiveHistoriesRecord()[b]).toBeUndefined();
    expect(getInactiveDoc(b)).toBeNull();

    // The freed name comes back on a fresh entry — with none of the dead part's history.
    const revived = createPart();
    expect(revived).not.toBe(b);
    expect(entryOf(revived).name).toBe('Part 2');
    expect($part.get().placements).toEqual([]);
    expect($canUndo.get()).toBe(false);
  });
});

/**
 * `duplicatePart` (P2.05). The registry half is what these pin: where the copy lands, what it
 * is called, where the user ends up, and that the copy starts with an empty undo stack. The
 * custom-asset half — five re-minted id families and their blob copies — is
 * `clonePartWithFreshAssets`'s own suite (`partClone.test.ts`); the one case here proves this
 * action really routes through it, using a KITTEN mesh so no binary is ever read.
 */
describe('partsStore — duplicatePart', () => {
  it('lands the copy right after its source, switches to it, and starts it clean', async () => {
    const a = $activePartId.get();
    const b = createPart();
    expect(switchPart(a)).toBe(true);

    const engines = createLayer('Engines');
    addSubPart('Core.A');
    setLayerOpacity(engines, 0.4);
    const sourceDoc = structuredClone($part.get());
    const sourceView = $layerView.get();
    const sourceUndo = exportHistory().undo.length;
    expect(sourceUndo).toBeGreaterThan(0);

    const copy = await duplicatePart(a);
    expect(copy).not.toBeNull();

    // Right AFTER the source, not appended at the end — B is still last.
    expect($partEntries.get().map((e) => e.id)).toEqual([a, copy, b]);
    // You land in the copy, holding an identical but independent document — bar the Part Id,
    // which is de-collided against the two parts already in the project.
    expect($activePartId.get()).toBe(copy);
    expect($part.get()).toEqual({ ...sourceDoc, partId: `${DEFAULT_PART_ID}_3` });
    expect($part.get()).not.toBe(getInactiveDoc(a)!.part);
    expect(entryOf(copy!).counts.subParts).toBe(1);
    // …its own copy of the per-part layer view, and its active layer…
    expect($layerView.get()).toEqual(sourceView);
    expect($layerView.get()).not.toBe(sourceView);
    expect($activeLayerId.get()).toBe(engines);
    // …and an EMPTY undo stack: a copy has nothing to take back.
    expect($canUndo.get()).toBe(false);
    expect(undoDepth()).toBe(0);
    // The source keeps its document and its own history untouched (I6 — never an undo step).
    expect(getInactiveDoc(a)!.part).toEqual(sourceDoc);
    expect(inactiveHistoriesRecord()[a].undo).toHaveLength(sourceUndo);
    // The view flags are inherited from the source entry, not reset to the defaults.
    setPartOpacity(a, 0.5);
    setPartVisible(a, false);
    setPartIncludeInExport(a, false);
    const inherited = await duplicatePart(a);
    expect(entryOf(inherited!)).toMatchObject({
      opacity: 0.5,
      visible: false,
      includeInExport: false,
    });
  });

  it('names the copy "<source> copy", then dedupes with " 2"', async () => {
    const a = $activePartId.get();
    expect(renamePart(a, 'Booster')).toBe('Booster');

    const first = await duplicatePart(a);
    expect(entryOf(first!).name).toBe('Booster copy');
    const second = await duplicatePart(a);
    expect(entryOf(second!).name).toBe('Booster copy 2');
    expect($partEntries.get().map((e) => e.name)).toEqual([
      'Booster',
      'Booster copy 2',
      'Booster copy',
    ]);
  });

  it('de-collides the KSA Part Id, counting the placeholder too', async () => {
    const a = $activePartId.get();
    expect($part.get().partId).toBe(DEFAULT_PART_ID);

    // The placeholder gets no `_copy` — it stays recognizably "unset" — but it DOES take the
    // counter, because two parts sharing a Part Id is a P3 export-preflight blocker whether the
    // shared id is a real one or the placeholder.
    await duplicatePart(a);
    expect($part.get().partId).toBe(`${DEFAULT_PART_ID}_2`);
    expect(getInactiveDoc(a)!.part.partId).toBe(DEFAULT_PART_ID);
    expect(isDefaultPartId($part.get().partId)).toBe(true); // still reads as unset

    // A real Part Id gets `_copy`.
    setPartId('booster');
    const suffixed = await duplicatePart($activePartId.get());
    expect($part.get().partId).toBe('booster_copy');
    expect(getInactiveDoc(suffixed!)).toBeNull(); // the copy IS the active part now
  });

  it('adds a counter when `_copy` itself is taken', async () => {
    setPartId('booster');
    await duplicatePart($activePartId.get()); // → booster_copy
    expect($part.get().partId).toBe('booster_copy');

    // Copying the ORIGINAL again would mint a second `booster_copy` — the exact collision that
    // used to reach export as a `duplicate-part-id` block.
    const source = $partEntries.get()[0].id;
    await duplicatePart(source);
    expect($part.get().partId).toBe('booster_copy_2');

    await duplicatePart(source);
    expect($part.get().partId).toBe('booster_copy_3');
  });

  it('never lets N created parts share a Part Id', () => {
    createPart();
    createPart();
    createPart();
    const ids = $partsSnapshot.get().map((entry) => entry.part.partId);
    expect(ids).toEqual([
      DEFAULT_PART_ID,
      `${DEFAULT_PART_ID}_2`,
      `${DEFAULT_PART_ID}_3`,
      `${DEFAULT_PART_ID}_4`,
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('duplicates an INACTIVE part from its parked document', async () => {
    const a = $activePartId.get();
    addSubPart('Core.A');
    const b = createPart(); // parks A, active = B
    addSubPart('Core.B');

    const copy = await duplicatePart(a);
    expect($partEntries.get().map((e) => e.id)).toEqual([a, copy, b]);
    expect($activePartId.get()).toBe(copy);
    // The copy carries A's document, not the one that happened to be live.
    expect($part.get().placements.map((p) => p.subPartTemplateId)).toEqual(['Core.A']);
    expect(getInactiveDoc(a)!.part.placements.map((p) => p.subPartTemplateId)).toEqual(['Core.A']);
    expect(getInactiveDoc(b)!.part.placements.map((p) => p.subPartTemplateId)).toEqual(['Core.B']);
  });

  it("re-mints the copy's custom-asset ids and repoints its placements (I4)", async () => {
    const a = $activePartId.get();
    // A kitten submesh is pure data — it exercises the clone's id re-mint with no binary at all.
    $part.set({
      ...$part.get(),
      customMeshes: [
        {
          id: 'mesh_k',
          name: 'Hunter Suit',
          subPartId: 'flexo_hunter_suit_src',
          kitten: {
            kind: 'hunter',
            specKey: 'suit',
            diffuse: 'Textures/Characters/Kitten_EMU_A.ktx2',
          },
          faceTextures: {},
        },
      ],
      placements: [
        {
          instanceId: 'suit_1',
          subPartTemplateId: 'flexo_hunter_suit_src',
          layerId: DEFAULT_LAYER_ID,
          ...identityTransform(),
        },
      ],
    });

    const copy = await duplicatePart(a);
    const mesh = $part.get().customMeshes[0];
    expect(copy).toBe($activePartId.get());
    expect(mesh.id).not.toBe('mesh_k');
    expect(mesh.subPartId).not.toBe('flexo_hunter_suit_src');
    expect($part.get().placements[0].subPartTemplateId).toBe(mesh.subPartId);
    // The placement instance id is a per-part namespace (I3) and stays exactly as it was.
    expect($part.get().placements[0].instanceId).toBe('suit_1');
    // The SOURCE keeps its own ids — a clone copies identity, it never moves it.
    expect(getInactiveDoc(a)!.part.customMeshes[0].id).toBe('mesh_k');
    expect(getInactiveDoc(a)!.part.customMeshes[0].subPartId).toBe('flexo_hunter_suit_src');
  });

  it('returns null for an id that names no entry, changing nothing', async () => {
    const before = $partEntries.get();
    const active = $activePartId.get();
    expect(await duplicatePart('pt_nothing')).toBeNull();
    expect($partEntries.get()).toBe(before);
    expect($activePartId.get()).toBe(active);
  });
});

describe('partsStore — rename, reorder and view setters', () => {
  it('renaming dedupes with a " 2" suffix and keeps the current name for a blank one', () => {
    const depth = undoDepth();
    const a = $activePartId.get();
    const b = createPart();

    expect(renamePart(b, '  Booster  ')).toBe('Booster');
    expect(renamePart(a, 'Booster')).toBe('Booster 2'); // taken by B
    expect(renamePart(a, '   ')).toBe('Booster 2'); // blank keeps the current name
    expect(renamePart(a, 'Booster 2')).toBe('Booster 2'); // its own name is not a collision
    expect($partEntries.get().map((e) => e.name)).toEqual(['Booster 2', 'Booster']);
    expect(undoDepth()).toBe(depth); // I6: a name is registry state, never a document edit
  });

  it('movePart swaps neighbours and no-ops at either end', () => {
    const depth = undoDepth();
    const a = $activePartId.get();
    const b = createPart();
    const c = createPart();
    expect($partEntries.get().map((e) => e.id)).toEqual([a, b, c]);

    movePart(c, -1);
    expect($partEntries.get().map((e) => e.id)).toEqual([a, c, b]);
    movePart(a, -1); // already first
    movePart(b, 1); // already last
    expect($partEntries.get().map((e) => e.id)).toEqual([a, c, b]);
    movePart(a, 1);
    expect($partEntries.get().map((e) => e.id)).toEqual([c, a, b]);
    // Reordering never touches which part is being edited.
    expect($activePartId.get()).toBe(c);
    expect(undoDepth()).toBe(depth); // I6: order is registry state, never a document edit
  });

  it('clamps opacity to 0..1 and refuses a non-finite offset axis', () => {
    const a = $activePartId.get();

    setPartOpacity(a, 0.25);
    expect(entryOf(a).opacity).toBe(0.25);
    setPartOpacity(a, 4);
    expect(entryOf(a).opacity).toBe(1);
    setPartOpacity(a, -2);
    expect(entryOf(a).opacity).toBe(0);
    setPartOpacity(a, Number.NaN);
    expect(entryOf(a).opacity).toBe(1);

    setPartOffset(a, { x: 1, y: 2, z: 3 });
    expect(entryOf(a).offset).toEqual({ x: 1, y: 2, z: 3 });
    // A half-typed number field must not be able to wipe the offset.
    setPartOffset(a, { x: Number.NaN, y: 5, z: Number.POSITIVE_INFINITY });
    expect(entryOf(a).offset).toEqual({ x: 1, y: 5, z: 3 });

    setPartVisible(a, false);
    expect(entryOf(a).visible).toBe(false);
    // View state is never a document mutation (I6).
    expect($canUndo.get()).toBe(false);
  });

  it('includeInExport flips, and partsForExport filters in registry order', () => {
    const a = $activePartId.get();
    const b = createPart();
    expect(partsForExport().map((p) => p.entryId)).toEqual([a, b]);

    setPartIncludeInExport(a, false);
    expect(entryOf(a).includeInExport).toBe(false);

    const included = partsForExport();
    expect(included.map((p) => p.entryId)).toEqual([b]);
    expect(included[0].name).toBe('Part 2');
    expect(included[0].part).toEqual($part.get()); // B is active → the LIVE document

    setPartIncludeInExport(a, true);
    expect(partsForExport().map((p) => p.entryId)).toEqual([a, b]);
  });
});

describe('partsStore — a switch resets selection-tier state', () => {
  it('clears the selection and any open action chain', () => {
    const a = $activePartId.get();
    const b = createPart();
    expect(switchPart(a)).toBe(true);

    addSubPart('Core.A'); // selects what it added
    const instanceId = $part.get().placements[0].instanceId;
    openChain([instanceId]);
    expect($selection.get()).toEqual([{ kind: 'subpart', id: instanceId }]);
    expect($chainSession.get()?.seedIds).toEqual([instanceId]);

    expect(switchPart(b)).toBe(true);

    // Both are seeded by ids of the OUTGOING document, so both are meaningless here.
    expect($selection.get()).toEqual([]);
    expect($chainSession.get()).toBeNull();
  });
});

describe('partsStore — Part Id de-collision on import', () => {
  /** One `addImportedParts` row carrying `partId` — the rest of the doc is irrelevant here. */
  function row(name: string, partId: string) {
    return {
      name,
      visible: true,
      opacity: 1,
      offset: { x: 0, y: 0, z: 0 },
      includeInExport: true,
      doc: {
        part: { ...createEmptyPart(), partId },
        layerView: {},
        activeLayerId: DEFAULT_LAYER_ID,
      },
    };
  }

  it('de-collides an imported Part Id against the parts already in the project', () => {
    setPartId('booster');
    addImportedParts([row('Booster', 'booster')]);
    expect($partsSnapshot.get().map((e) => e.part.partId)).toEqual(['booster', 'booster_2']);
  });

  it('de-collides the incoming batch against ITSELF', () => {
    // An envelope may legitimately carry two parts on the same id (e.g. both still unset), so
    // seeding the taken-set from the project alone would let the batch collide with itself.
    addImportedParts([row('A', 'tank'), row('B', 'tank'), row('C', 'tank')]);
    expect($partsSnapshot.get().map((e) => e.part.partId)).toEqual([
      DEFAULT_PART_ID,
      'tank',
      'tank_2',
      'tank_3',
    ]);
  });

  it('leaves a free Part Id exactly as imported', () => {
    setPartId('booster');
    addImportedParts([row('Tank', 'tank')]);
    expect($partsSnapshot.get().map((e) => e.part.partId)).toEqual(['booster', 'tank']);
  });
});
