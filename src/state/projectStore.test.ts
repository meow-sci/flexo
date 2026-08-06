import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * In-memory stand-in for the four `flexo-projects` object stores (happy-dom has no
 * indexedDB) — the same `vi.mock` pattern customAssetStore.test.ts uses for `assetDb`.
 * Everything above the storage boundary (normalization, autosave debounces, the boot
 * fallback ladder, the schema purge, the lifecycle actions) is exercised for real.
 */
const db = {
  meta: new Map<string, ProjectMetaLike>(),
  snapshots: new Map<string, unknown>(),
  history: new Map<string, unknown>(),
  thumbs: new Map<string, Blob>(),
  /** Flipped by a test to make every write throw, exercising the loud-failure path. */
  failWrites: false,
};

interface ProjectMetaLike {
  id: string;
  name: string;
  savedAt: number;
  schemaVersion: number;
  [key: string]: unknown;
}

vi.mock('./projectDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./projectDb')>();
  return {
    ...actual,
    putMeta: async (meta: ProjectMetaLike) => {
      if (db.failWrites) throw new Error('QuotaExceededError');
      db.meta.set(meta.id, meta);
    },
    getMeta: async (id: string) => db.meta.get(id),
    listMeta: async () => [...db.meta.values()],
    putSnapshot: async (id: string, snap: unknown) => {
      if (db.failWrites) throw new Error('QuotaExceededError');
      db.snapshots.set(id, structuredClone(snap));
    },
    getSnapshot: async (id: string) => db.snapshots.get(id),
    putHistory: async (id: string, h: unknown) => {
      if (db.failWrites) throw new Error('QuotaExceededError');
      db.history.set(id, structuredClone(h));
    },
    getHistory: async (id: string) => db.history.get(id),
    putThumb: async (id: string, blob: Blob) => {
      db.thumbs.set(id, blob);
    },
    getThumb: async (id: string) => db.thumbs.get(id),
    deleteProjectRecords: async (id: string) => {
      db.meta.delete(id);
      db.snapshots.delete(id);
      db.history.delete(id);
      db.thumbs.delete(id);
    },
  };
});

// The blob store is a different database; project lifecycle only sweeps/copies prefixes.
const assetBlobs = new Map<string, Blob>();
vi.mock('./assetDb', () => ({
  assetKeys: {
    textureSource: (p: string, id: string) => `pa:${p}:tex-src:${id}`,
    textureKtx2: (p: string, id: string) => `pa:${p}:tex-ktx2:${id}`,
    meshGlb: (p: string, id: string) => `pa:${p}:mesh-glb:${id}`,
    importGlb: (p: string, id: string) => `pa:${p}:import-glb:${id}`,
    emissivePaint: (p: string, id: string) => `pa:${p}:emissive-paint:${id}`,
  },
  getAsset: async (key: string) => assetBlobs.get(key),
  putAsset: async (key: string, data: Blob) => {
    assetBlobs.set(key, data);
  },
  deleteAsset: async (key: string) => {
    assetBlobs.delete(key);
  },
  listProjectBlobs: async (id: string) =>
    [...assetBlobs.keys()].filter((key) => key.startsWith(`pa:${id}:`)),
  deleteProjectAssets: async (id: string) => {
    const doomed = [...assetBlobs.keys()].filter((key) => key.startsWith(`pa:${id}:`));
    for (const key of doomed) assetBlobs.delete(key);
  },
  copyProjectAssets: async (from: string, to: string) => {
    const source = [...assetBlobs.entries()].filter(([key]) => key.startsWith(`pa:${from}:`));
    for (const [key, blob] of source) {
      assetBlobs.set(`pa:${to}:${key.slice(`pa:${from}:`.length)}`, blob);
    }
  },
  purgeUnprefixedAssetKeys: async () => 0,
}));

import {
  $activeLayerId,
  $canUndo,
  $part,
  addConnector,
  addSubPart,
  createLayer,
  newPart,
  undo,
} from './editorStore';
import { $layerView, setLayerLocked, toggleLayerVisible } from './layerStore';
import {
  createProject,
  deleteProject,
  duplicateProject,
  flushAutosave,
  hydrateProjectOnBoot,
  openProject,
  purgeV1Storage,
  PROJECT_SCHEMA_VERSION,
} from './projectStore';
import {
  $autosaveHealth,
  $currentProjectId,
  $projectIndex,
  $projectName,
  DEFAULT_PROJECT_NAME,
  renameProject,
  uniqueProjectName,
} from './projectIndexStore';
import { $notifications } from './notificationStore';
import { DEFAULT_LAYER_ID, createGlow, createSubPartGameData } from '../ksa/types';
import type { ProjectSnapshotV2 } from './projectDb';

function snapshotOf(id: string): ProjectSnapshotV2 {
  return db.snapshots.get(id) as ProjectSnapshotV2;
}

beforeEach(() => {
  localStorage.clear();
  db.meta.clear();
  db.snapshots.clear();
  db.history.clear();
  db.thumbs.clear();
  db.failWrites = false;
  assetBlobs.clear();
  $notifications.set([]);
  $projectIndex.set([]);
  $currentProjectId.set('');
  $projectName.set(DEFAULT_PROJECT_NAME);
  $autosaveHealth.set('ok');
  newPart();
  $layerView.set({});
});

describe('project persistence', () => {
  it('round-trips the document, active layer, layer view, and history', async () => {
    const id = await createProject('Rocket');
    const engines = createLayer('Engines'); // active = Engines, undoable
    addSubPart('Core.A'); // lands in Engines
    addConnector(); // lands in Engines too — connectors are ordinary layer citizens
    toggleLayerVisible(engines);
    setLayerLocked(DEFAULT_LAYER_ID, true);
    expect($canUndo.get()).toBe(true);
    await flushAutosave();

    // Switch to a scratch project, then come back.
    const scratch = await createProject('Scratch');
    expect($part.get().placements.length).toBe(0);

    expect(await openProject(id)).toBe(true);
    expect($currentProjectId.get()).toBe(id);
    expect($projectName.get()).toBe('Rocket');
    expect($part.get().placements.map((p) => p.layerId)).toEqual([engines]);
    expect($part.get().connectors.map((c) => c.layerId)).toEqual([engines]);
    expect($activeLayerId.get()).toBe(engines);
    expect($layerView.get()[engines]?.visible).toBe(false);
    expect($layerView.get()[DEFAULT_LAYER_ID]?.locked).toBe(true);

    // History came back: a single undo removes the connector that was added last.
    expect($canUndo.get()).toBe(true);
    undo();
    expect($part.get().connectors.length).toBe(0);
    expect(scratch).not.toBe(id);
  });

  it('stores history in its own record, never inside the snapshot', async () => {
    const id = await createProject('Split');
    addSubPart('Core.A');
    await flushAutosave();
    expect(snapshotOf(id)).not.toHaveProperty('history');
    expect((db.history.get(id) as { undo: unknown[] }).undo.length).toBeGreaterThan(0);
  });

  it('caps the persisted history at MAX_UNDO', async () => {
    const id = await createProject('Deep');
    for (let i = 0; i < 60; i++) addSubPart('Core.A');
    await flushAutosave();
    const history = db.history.get(id) as { undo: unknown[] };
    expect(history.undo.length).toBeLessThanOrEqual(50);
  });

  it('writes the snapshot at 300 ms and the history at 1500 ms', async () => {
    // Autosave's subscriptions are wired by boot, so this needs a real hydrate first.
    await hydrateProjectOnBoot();
    const id = await createProject('Debounced');
    db.snapshots.delete(id);
    db.history.delete(id);

    vi.useFakeTimers();
    try {
      addSubPart('Core.A');

      await vi.advanceTimersByTimeAsync(320);
      expect(db.snapshots.has(id)).toBe(true);
      expect(db.history.has(id)).toBe(false); // still inside the slower window

      await vi.advanceTimersByTimeAsync(1300);
      expect(db.history.has(id)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clamps a stale active layer to Default on load', async () => {
    const id = await createProject('Stale');
    await flushAutosave();
    db.snapshots.set(id, { ...snapshotOf(id), activeLayerId: 'ghost-layer' });

    await createProject('Elsewhere');
    await openProject(id);
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID);
  });

  it('lists saved projects most-recent-first with derived counts', async () => {
    const older = await createProject('Older');
    addSubPart('Core.A');
    await flushAutosave();
    db.meta.get(older)!.savedAt = 1000;

    const newer = await createProject('Newer');
    addSubPart('Core.A');
    addSubPart('Core.B');
    await flushAutosave();
    db.meta.get(newer)!.savedAt = 2000;

    await hydrateProjectOnBoot();
    const list = $projectIndex.get();
    expect(list.map((p) => p.name)).toEqual(['Newer', 'Older']);
    expect(list[0].counts.subParts).toBe(2);
    expect(list[1].counts.subParts).toBe(1);
  });

  it('createProject starts a fresh, saved, current project', async () => {
    const first = await createProject('HasStuff');
    addSubPart('Core.A');
    await flushAutosave();

    const second = await createProject('Brand New');
    expect($projectName.get()).toBe('Brand New');
    expect($part.get().placements.length).toBe(0);
    expect(db.meta.has(second)).toBe(true);
    // The previous project is untouched.
    expect(db.meta.has(first)).toBe(true);
    expect((snapshotOf(first) as ProjectSnapshotV2).part.placements.length).toBe(1);
  });

  it('renaming onto a taken name auto-suffixes and never touches the other project', async () => {
    const rover = await createProject('Rover');
    const lander = await createProject('Lander');
    expect(await renameProject(lander, 'Rover')).toBe('Rover 2');
    expect(db.meta.get(rover)!.name).toBe('Rover'); // the v1 clobber regression
    expect(db.meta.get(lander)!.name).toBe('Rover 2');
    expect($projectName.get()).toBe('Rover 2');
  });

  it('deleting the current project switches to the most recent remaining one', async () => {
    const keep = await createProject('Keep');
    addSubPart('Core.A');
    await flushAutosave();
    db.meta.get(keep)!.savedAt = 500;

    const doomed = await createProject('Doomed');
    await deleteProject(doomed);
    expect(db.meta.has(doomed)).toBe(false);
    expect($projectName.get()).toBe('Keep');
    expect($part.get().placements.length).toBe(1);
  });

  it('deleting the only project falls back to a fresh default', async () => {
    const solo = await createProject('Solo');
    await deleteProject(solo);
    expect($projectName.get()).toBe(DEFAULT_PROJECT_NAME);
    expect(db.meta.size).toBe(1);
  });

  it('deleting a project sweeps its asset blobs, and only its own', async () => {
    const keeper = await createProject('Keeper');
    assetBlobs.set(`pa:${keeper}:tex-src:t1`, new Blob(['a']));
    const doomed = await createProject('Doomed');
    assetBlobs.set(`pa:${doomed}:tex-src:t1`, new Blob(['b']));
    assetBlobs.set(`pa:${doomed}:import-glb:i1`, new Blob(['c']));

    await deleteProject(doomed);
    expect([...assetBlobs.keys()]).toEqual([`pa:${keeper}:tex-src:t1`]);
  });

  it('duplicate copies the snapshot and the blobs but NOT the history, and does not switch', async () => {
    const source = await createProject('Rover');
    addSubPart('Core.A');
    await flushAutosave();
    assetBlobs.set(`pa:${source}:tex-src:t1`, new Blob(['a']));

    const copy = await duplicateProject(source);
    expect(copy).toBeTruthy();
    expect($currentProjectId.get()).toBe(source); // still on the original
    expect(db.meta.get(copy!)!.name).toBe('Rover copy');
    expect(snapshotOf(copy!).part.placements.length).toBe(1);
    expect(db.history.has(copy!)).toBe(false);
    expect(assetBlobs.has(`pa:${copy}:tex-src:t1`)).toBe(true);
  });

  it('openProject replaces the undo stacks wholesale', async () => {
    const withHistory = await createProject('Busy');
    addSubPart('Core.A');
    addSubPart('Core.B');
    await flushAutosave();
    const fresh = await createProject('Fresh');
    expect($canUndo.get()).toBe(false); // create resets the stacks

    await openProject(withHistory);
    expect($canUndo.get()).toBe(true);
    await openProject(fresh);
    expect($canUndo.get()).toBe(false); // the incoming project's (empty) stacks won
  });
});

describe('boot purge', () => {
  it('purges v1 localStorage projects, reporting names read from the keys', () => {
    localStorage.setItem('flexo:project:Old Rover', '{"anything":true}');
    localStorage.setItem('flexo:project:Corrupt', '{ not valid json');
    localStorage.setItem('flexo:currentProject', JSON.stringify({ name: 'Old Rover' }));
    localStorage.setItem('flexo:layout', '{"kept":true}');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    purgeV1Storage();
    warn.mockRestore();

    expect(localStorage.getItem('flexo:project:Old Rover')).toBeNull();
    expect(localStorage.getItem('flexo:project:Corrupt')).toBeNull();
    expect(localStorage.getItem('flexo:currentProject')).toBeNull();
    // Unrelated persisted preferences are untouched.
    expect(localStorage.getItem('flexo:layout')).toBe('{"kept":true}');

    const notice = $notifications.get()[0];
    expect(notice.severity).toBe('warning');
    expect(notice.title).toContain('previous flexo version');
    // Names come from the KEYS — the corrupt entry is named as well as the intact one.
    expect(notice.body).toBe('Corrupt, Old Rover');
  });

  it('is a silent no-op when there is no v1 data', () => {
    purgeV1Storage();
    expect($notifications.get()).toEqual([]);
  });

  it('boot cleanup removes abandoned v1 layout keys', () => {
    const dead = [
      'flexo:inspectorVisible',
      'flexo:inspectorWidth',
      'flexo:inspectorFloatPos',
      'flexo:animPreviewFloatPos',
      'flexo:layerView',
    ];
    for (const key of dead) localStorage.setItem(key, '"whatever"');
    // A representative slice of the LIVE v2 key set, which must survive byte-identical.
    const live: Record<string, string> = {
      'flexo:layout': '{"left":{"width":300}}',
      'flexo:snapEnabled': 'true',
      'flexo:snapTranslateStep': '0.25',
      'flexo:snapRotateStep': '15',
      'flexo:gizmoSpace': '"local"',
      'flexo:kindVisibility': '{"light":false}',
      'flexo:paletteRecents': '["edit.undo"]',
      'flexo:currentProjectId': 'p-123',
      'flexo:aboutSeen': 'true',
      'flexo:grids': '{"y":{"visible":true}}',
    };
    for (const [key, value] of Object.entries(live)) localStorage.setItem(key, value);

    purgeV1Storage();

    for (const key of dead) expect(localStorage.getItem(key)).toBeNull();
    for (const [key, value] of Object.entries(live)) expect(localStorage.getItem(key)).toBe(value);
    // Layout preferences are not the user's work — removing them says nothing.
    expect($notifications.get()).toEqual([]);
  });

  it('purges a project stamped with a different schema version and names it', async () => {
    const good = await createProject('Good');
    addSubPart('Core.A');
    await flushAutosave();
    const old = await createProject('Old');
    await flushAutosave();
    db.meta.get(old)!.schemaVersion = PROJECT_SCHEMA_VERSION - 1;
    assetBlobs.set(`pa:${old}:tex-src:t1`, new Blob(['x']));
    localStorage.setItem('flexo:currentProjectId', old);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await hydrateProjectOnBoot();
    warn.mockRestore();

    expect(db.meta.has(old)).toBe(false);
    expect(db.snapshots.has(old)).toBe(false);
    expect(assetBlobs.size).toBe(0); // the purge sweeps blobs too
    expect(db.meta.has(good)).toBe(true);
    // The dangling pointer fell through to the surviving project.
    expect($currentProjectId.get()).toBe(good);
    expect($notifications.get()[0].body).toContain('Old');
  });

  it('purges an unstamped or newer-versioned project rather than converting it', async () => {
    const future = await createProject('FromTheFuture');
    await flushAutosave();
    db.meta.get(future)!.schemaVersion = 999;
    const unstamped = await createProject('Unstamped');
    await flushAutosave();
    delete (db.meta.get(unstamped) as { schemaVersion?: number }).schemaVersion;

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await hydrateProjectOnBoot();
    warn.mockRestore();

    expect(db.meta.has(future)).toBe(false);
    expect(db.meta.has(unstamped)).toBe(false);
  });

  it('purges a project whose snapshot is missing or unreadable', async () => {
    const broken = await createProject('Broken');
    await flushAutosave();
    db.snapshots.delete(broken);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await hydrateProjectOnBoot();
    warn.mockRestore();
    expect(db.meta.has(broken)).toBe(false);
  });

  it('posts no notice when every stored project is compatible', async () => {
    await createProject('AllFine');
    await flushAutosave();
    $notifications.set([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await hydrateProjectOnBoot();
    warn.mockRestore();
    expect($notifications.get()).toEqual([]);
  });
});

describe('boot restore', () => {
  it('restores the pointed-at project', async () => {
    const first = await createProject('First');
    addSubPart('Core.A');
    await flushAutosave();
    await createProject('Second');
    localStorage.setItem('flexo:currentProjectId', first);

    await hydrateProjectOnBoot();
    expect($projectName.get()).toBe('First');
    expect($part.get().placements.length).toBe(1);
  });

  it('falls back to the newest save, then to a fresh Untitled', async () => {
    const older = await createProject('Older');
    await flushAutosave();
    db.meta.get(older)!.savedAt = 100;
    const newest = await createProject('Newest');
    await flushAutosave();
    db.meta.get(newest)!.savedAt = 900;
    localStorage.removeItem('flexo:currentProjectId');

    await hydrateProjectOnBoot();
    expect($projectName.get()).toBe('Newest');

    db.meta.clear();
    db.snapshots.clear();
    localStorage.removeItem('flexo:currentProjectId');
    await hydrateProjectOnBoot();
    expect($projectName.get()).toBe(DEFAULT_PROJECT_NAME);
    expect(db.meta.size).toBe(1);
  });
});

describe('normalization (default-fill, never conversion)', () => {
  it('keeps a same-version project missing additive fields and fills current defaults', async () => {
    const id = await createProject('Additive');
    addSubPart('Core.A');
    await flushAutosave();

    const stale = structuredClone(snapshotOf(id)) as unknown as {
      part: Record<string, unknown> & {
        gameData: Record<string, unknown>;
        subPartGameData: Record<string, unknown>[];
        customMeshes: Record<string, unknown>[];
      };
    };
    stale.part.subPartGameData = [
      createSubPartGameData('Core.A') as unknown as Record<string, unknown>,
    ];
    stale.part.customMeshes = [
      {
        id: 'mesh_1',
        name: 'Lamp',
        subPartId: 'flexo_Lamp',
        faceTextures: {},
        emissive: createGlow(),
      },
    ] as unknown as Record<string, unknown>[];
    // One stripped field at each of the four levels the normalizer covers.
    delete stale.part.kittens; // EditingPart
    delete stale.part.gameData.rocketControllers; // PartGameData
    delete stale.part.subPartGameData[0].solidMotors; // SubPartGameData entry
    delete (stale.part.customMeshes[0].emissive as Record<string, unknown>).coverage;
    db.snapshots.set(id, stale);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await hydrateProjectOnBoot();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();

    expect(db.meta.has(id)).toBe(true); // preserved, not purged
    const part = $part.get();
    expect(part.kittens).toEqual([]);
    expect(part.gameData.rocketControllers).toEqual([]);
    expect(part.subPartGameData[0].solidMotors).toEqual([]);
    expect(part.customMeshes[0].emissive?.coverage).toBe(createGlow().coverage);
    // The data that WAS there came through untouched.
    expect(part.placements.length).toBe(1);
  });

  it('normalizes the part inside every undo/redo history entry', async () => {
    const id = await createProject('History');
    addSubPart('Core.A');
    addSubPart('Core.B');
    await flushAutosave();

    const stale = structuredClone(db.history.get(id)) as {
      undo: { part: Record<string, unknown> }[];
    };
    expect(stale.undo.length).toBeGreaterThan(0);
    for (const entry of stale.undo) delete entry.part.kittens;
    db.history.set(id, stale);

    await createProject('Elsewhere');
    await openProject(id);
    undo();
    // Undo landed on a complete document, not the field-shy one that was stored.
    expect($part.get().placements.length).toBe(1);
    expect($part.get().kittens).toEqual([]);
  });

  it('never overwrites values a stored project already carries', async () => {
    const id = await createProject('Intact');
    addSubPart('Core.A');
    await flushAutosave();
    const snap = structuredClone(snapshotOf(id)) as unknown as {
      part: Record<string, unknown> & { gameData: Record<string, unknown> };
    };
    snap.part.partId = 'MyPart';
    snap.part.editorTags = ['tag-a'];
    snap.part.gameData.displayName = 'Lander';
    snap.part.gameData.controllable = true;
    snap.part.customMeshes = [
      {
        id: 'mesh_1',
        name: 'Lamp',
        subPartId: 'flexo_Lamp',
        faceTextures: {},
        emissive: { ...createGlow(), strength: 0.9, coverage: 0.25 },
      },
    ];
    db.snapshots.set(id, snap);

    await createProject('Elsewhere');
    await openProject(id);
    const part = $part.get();
    expect(part.partId).toBe('MyPart');
    expect(part.editorTags).toEqual(['tag-a']);
    expect(part.gameData.displayName).toBe('Lander');
    expect(part.gameData.controllable).toBe(true);
    expect(part.customMeshes[0].emissive).toEqual({
      ...createGlow(),
      strength: 0.9,
      coverage: 0.25,
    });
  });
});

describe('autosave health', () => {
  it('flips to failing with one danger notification and recovers on the next good write', async () => {
    await createProject('Fragile');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    db.failWrites = true;
    addSubPart('Core.A');
    await flushAutosave();
    expect($autosaveHealth.get()).toBe('failing');
    const danger = $notifications.get().filter((n) => n.severity === 'danger');
    expect(danger.length).toBe(1);
    expect(danger[0].title).toContain('Autosave failing');

    // Still failing → no second notification (dedupe).
    await flushAutosave();
    expect($notifications.get().filter((n) => n.severity === 'danger').length).toBe(1);

    db.failWrites = false;
    await flushAutosave();
    expect($autosaveHealth.get()).toBe('ok');
    warn.mockRestore();
  });
});

describe('uniqueProjectName', () => {
  it('suffixes against the live index', async () => {
    expect(uniqueProjectName('Untitled')).toBe('Untitled');
    await createProject('Untitled');
    expect(uniqueProjectName('Untitled')).toBe('Untitled 2');
    await createProject('Untitled');
    expect(uniqueProjectName('Untitled')).toBe('Untitled 3');
    expect($projectName.get()).toBe('Untitled 2');
  });
});
