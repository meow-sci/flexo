import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  $projectName,
  consumeRemovedProjectsNotice,
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  projectExists,
  renameCurrentProject,
  saveCurrentProject,
  uniqueProjectName,
  hydrateProjectOnBoot,
  DEFAULT_PROJECT_NAME,
  PROJECT_SCHEMA_VERSION,
} from './projectStore';
import { DEFAULT_LAYER_ID, createGlow, createSubPartGameData } from '../ksa/types';

beforeEach(() => {
  localStorage.clear();
  newPart();
  $layerView.set({});
  $projectName.set(DEFAULT_PROJECT_NAME);
});

describe('projectStore persistence', () => {
  it('round-trips the document, active layer, layer view, and history', () => {
    $projectName.set('Rocket');
    const engines = createLayer('Engines'); // active = Engines, undoable
    addSubPart('Core.A'); // lands in Engines
    addConnector(); // lands in Engines too — connectors are ordinary layer citizens
    toggleLayerVisible(engines);
    setLayerLocked(DEFAULT_LAYER_ID, true);
    expect($canUndo.get()).toBe(true);
    saveCurrentProject();

    // Wipe the workspace, then reload from storage.
    newPart();
    $layerView.set({});
    $projectName.set('scratch');
    expect($part.get().placements.length).toBe(0);

    expect(loadProject('Rocket')).toBe(true);
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
  });

  it('clamps a stale active layer to Default on load', () => {
    $projectName.set('Stale');
    saveCurrentProject();
    // Hand-craft a snapshot pointing at a layer that does not exist.
    const raw = JSON.parse(localStorage.getItem('flexo:project:Stale')!);
    raw.activeLayerId = 'ghost-layer';
    localStorage.setItem('flexo:project:Stale', JSON.stringify(raw));

    loadProject('Stale');
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID);
  });

  it('lists saved projects most-recent-first with summaries', () => {
    $projectName.set('Older');
    addSubPart('Core.A');
    saveCurrentProject();
    // Force a strictly later savedAt for the second project.
    const older = JSON.parse(localStorage.getItem('flexo:project:Older')!);
    older.savedAt = 1000;
    localStorage.setItem('flexo:project:Older', JSON.stringify(older));

    newPart();
    $projectName.set('Newer');
    addSubPart('Core.A');
    addSubPart('Core.B');
    saveCurrentProject();
    const newer = JSON.parse(localStorage.getItem('flexo:project:Newer')!);
    newer.savedAt = 2000;
    localStorage.setItem('flexo:project:Newer', JSON.stringify(newer));

    const list = listProjects();
    expect(list.map((p) => p.name)).toEqual(['Newer', 'Older']);
    expect(list[0].subPartCount).toBe(2);
    expect(list[1].subPartCount).toBe(1);
  });

  it('createProject starts a fresh, saved, current project', () => {
    addSubPart('Core.A');
    $projectName.set('HasStuff');
    saveCurrentProject();

    createProject('Brand New');
    expect($projectName.get()).toBe('Brand New');
    expect($part.get().placements.length).toBe(0);
    expect(projectExists('Brand New')).toBe(true);
    // The previous project is untouched on disk.
    expect(projectExists('HasStuff')).toBe(true);
  });

  it('renameCurrentProject re-keys storage (old key removed)', () => {
    $projectName.set('OldName');
    saveCurrentProject();
    renameCurrentProject('NewName');
    expect($projectName.get()).toBe('NewName');
    expect(projectExists('NewName')).toBe(true);
    expect(projectExists('OldName')).toBe(false);
  });

  it('deleting the current project switches to the most recent remaining one', () => {
    $projectName.set('Keep');
    addSubPart('Core.A');
    saveCurrentProject();
    const keep = JSON.parse(localStorage.getItem('flexo:project:Keep')!);
    keep.savedAt = 500;
    localStorage.setItem('flexo:project:Keep', JSON.stringify(keep));

    createProject('Doomed'); // becomes current
    deleteProject('Doomed');
    expect(projectExists('Doomed')).toBe(false);
    expect($projectName.get()).toBe('Keep');
    expect($part.get().placements.length).toBe(1);
  });

  it('deleting the only project falls back to a fresh default', () => {
    createProject('Solo');
    deleteProject('Solo');
    expect($projectName.get()).toBe(DEFAULT_PROJECT_NAME);
    expect(projectExists(DEFAULT_PROJECT_NAME)).toBe(true);
  });

  it('purges a project stamped with an older schema version at boot and warns', () => {
    // A valid project saved by the current build.
    $projectName.set('Good');
    addSubPart('Core.A');
    saveCurrentProject();

    // A project from a build whose snapshot format we don't migrate from.
    $projectName.set('Old');
    saveCurrentProject();
    const stale = JSON.parse(localStorage.getItem('flexo:project:Old')!);
    stale.version = PROJECT_SCHEMA_VERSION - 1;
    localStorage.setItem('flexo:project:Old', JSON.stringify(stale));
    // Pointer references the now-incompatible project.
    localStorage.setItem('flexo:currentProject', JSON.stringify({ name: 'Old' }));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hydrateProjectOnBoot();

    // The bad one is gone (with a warning), the good one survives.
    expect(projectExists('Old')).toBe(false);
    expect(projectExists('Good')).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('incompatible'),
      expect.arrayContaining(['flexo:project:Old']),
    );
    // The dangling pointer was cleared, so boot fell back to the surviving project.
    expect($projectName.get()).toBe('Good');
    warn.mockRestore();
  });

  it('purges a project stamped with an unknown newer schema version', () => {
    $projectName.set('FromTheFuture');
    saveCurrentProject();
    const future = JSON.parse(localStorage.getItem('flexo:project:FromTheFuture')!);
    future.version = 999;
    localStorage.setItem('flexo:project:FromTheFuture', JSON.stringify(future));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hydrateProjectOnBoot();
    expect(projectExists('FromTheFuture')).toBe(false); // thrown away, not migrated
    warn.mockRestore();
  });

  it('purges a project with no schema version stamp', () => {
    $projectName.set('Unstamped');
    saveCurrentProject();
    const unstamped = JSON.parse(localStorage.getItem('flexo:project:Unstamped')!);
    delete unstamped.version;
    localStorage.setItem('flexo:project:Unstamped', JSON.stringify(unstamped));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hydrateProjectOnBoot();
    expect(projectExists('Unstamped')).toBe(false);
    warn.mockRestore();
  });

  it('keeps a same-version project missing additive fields and fills the current defaults', () => {
    // The version matches, so the snapshot is compatible by contract — it just predates a
    // few additive fields. Boot keeps it and the load-time normalizer fills the live
    // constructors' defaults (this is default-filling, NOT migration).
    $projectName.set('Additive');
    addSubPart('Core.A');
    saveCurrentProject();
    const stale = JSON.parse(localStorage.getItem('flexo:project:Additive')!);
    stale.part.subPartGameData = [createSubPartGameData('Core.A')];
    stale.part.customMeshes = [
      {
        id: 'mesh_1',
        name: 'Lamp',
        subPartId: 'flexo_Lamp',
        faceTextures: {},
        emissive: createGlow(),
      },
    ];
    // One stripped field at each of the four levels the normalizer covers.
    delete stale.part.kittens; // EditingPart
    delete stale.part.gameData.rocketControllers; // PartGameData
    delete stale.part.subPartGameData[0].solidMotors; // SubPartGameData entry
    delete stale.part.customMeshes[0].emissive.coverage; // EmissiveConfig
    localStorage.setItem('flexo:project:Additive', JSON.stringify(stale));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hydrateProjectOnBoot();
    expect(warn).not.toHaveBeenCalled();
    expect(projectExists('Additive')).toBe(true); // preserved, not purged
    warn.mockRestore();

    expect(loadProject('Additive')).toBe(true);
    const part = $part.get();
    expect(part.kittens).toEqual([]);
    expect(part.gameData.rocketControllers).toEqual([]);
    expect(part.subPartGameData[0].solidMotors).toEqual([]);
    expect(part.customMeshes[0].emissive?.coverage).toBe(createGlow().coverage);
    // The data that WAS there came through untouched.
    expect(part.placements.length).toBe(1);
  });

  it('normalizes the part inside every undo/redo history entry', () => {
    $projectName.set('History');
    addSubPart('Core.A');
    addSubPart('Core.B');
    expect($canUndo.get()).toBe(true);
    saveCurrentProject();

    const stale = JSON.parse(localStorage.getItem('flexo:project:History')!);
    expect(stale.history.undo.length).toBeGreaterThan(0);
    for (const entry of stale.history.undo) delete entry.part.kittens;
    localStorage.setItem('flexo:project:History', JSON.stringify(stale));

    expect(loadProject('History')).toBe(true);
    undo();
    // Undo landed on a complete document, not the field-shy one that was stored.
    expect($part.get().placements.length).toBe(1);
    expect($part.get().kittens).toEqual([]);
  });

  it('never overwrites values a stored project already carries', () => {
    $projectName.set('Intact');
    addSubPart('Core.A');
    saveCurrentProject();
    const snap = JSON.parse(localStorage.getItem('flexo:project:Intact')!);
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
    localStorage.setItem('flexo:project:Intact', JSON.stringify(snap));

    expect(loadProject('Intact')).toBe(true);
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

  it('reports the purged projects once via consumeRemovedProjectsNotice', () => {
    $projectName.set('Doomed');
    saveCurrentProject();
    const stale = JSON.parse(localStorage.getItem('flexo:project:Doomed')!);
    stale.version = PROJECT_SCHEMA_VERSION - 1;
    localStorage.setItem('flexo:project:Doomed', JSON.stringify(stale));
    // A corrupt entry has no readable name — it's reported by its key suffix.
    localStorage.setItem('flexo:project:Corrupt', '{ not valid json');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hydrateProjectOnBoot();
    warn.mockRestore();

    expect(consumeRemovedProjectsNotice().sort()).toEqual(['Corrupt', 'Doomed']);
    // Handed out once, so a component remount can't re-notify.
    expect(consumeRemovedProjectsNotice()).toEqual([]);
  });

  it('reports no purge notice when every stored project is compatible', () => {
    $projectName.set('AllFine');
    saveCurrentProject();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hydrateProjectOnBoot();
    warn.mockRestore();
    expect(consumeRemovedProjectsNotice()).toEqual([]);
  });

  it('keeps a project whose glow carries the full current model', () => {
    $projectName.set('NewGlow');
    addSubPart('Core.A');
    saveCurrentProject();
    const snap = JSON.parse(localStorage.getItem('flexo:project:NewGlow')!);
    snap.part.customMeshes = [
      {
        id: 'mesh_1',
        name: 'Lamp',
        subPartId: 'flexo_Lamp',
        faceTextures: {},
        emissive: { ...createGlow(), color: { r: 0, g: 255, b: 0 } },
      },
    ];
    localStorage.setItem('flexo:project:NewGlow', JSON.stringify(snap));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hydrateProjectOnBoot();
    expect(projectExists('NewGlow')).toBe(true);
    warn.mockRestore();
  });

  it('purges unparseable project entries at boot', () => {
    localStorage.setItem('flexo:project:Corrupt', '{ not valid json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hydrateProjectOnBoot();
    expect(localStorage.getItem('flexo:project:Corrupt')).toBeNull();
    warn.mockRestore();
  });

  it('leaves a fully valid project untouched at boot', () => {
    $projectName.set('Fine');
    addSubPart('Core.A');
    saveCurrentProject();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hydrateProjectOnBoot();
    expect(warn).not.toHaveBeenCalled();
    expect(projectExists('Fine')).toBe(true);
    expect($projectName.get()).toBe('Fine');
    warn.mockRestore();
  });

  it('uniqueProjectName avoids collisions', () => {
    expect(uniqueProjectName('Untitled')).toBe('Untitled');
    createProject('Untitled');
    expect(uniqueProjectName('Untitled')).toBe('Untitled 2');
    createProject('Untitled 2');
    expect(uniqueProjectName('Untitled')).toBe('Untitled 3');
  });
});
