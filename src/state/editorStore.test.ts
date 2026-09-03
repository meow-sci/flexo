import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';

// The model-import undo test drives customAssetStore, which persists the import GLB in
// IndexedDB and resolves its geometry through a blob: URL — neither exists in happy-dom.
// Both are stubbed with the same contract; the document mutation is what's under test.
vi.mock('./assetDb', () => {
  const store = new Map<string, Blob>();
  return {
    assetKeys: {
      textureSource: (id: string) => `tex-src:${id}`,
      textureKtx2: (id: string) => `tex-ktx2:${id}`,
      meshGlb: (id: string) => `mesh-glb:${id}`,
      importGlb: (id: string) => `import-glb:${id}`,
      emissivePaint: (id: string) => `emissive-paint:${id}`,
    },
    getAsset: async (key: string) => store.get(key),
    putAsset: async (key: string, data: Blob | Uint8Array, type = '') => {
      store.set(key, data instanceof Blob ? data : new Blob([data.slice()], { type }));
    },
    deleteAsset: async (key: string) => {
      store.delete(key);
    },
  };
});
vi.mock('../three/importedMeshCache', () => {
  const urls = new Map<string, string>();
  return {
    registerImportAtlas: (importId: string) => {
      const url = `blob:import/${importId}`;
      urls.set(importId, url);
      return url;
    },
    importAtlasUrl: (importId: string) => urls.get(importId) ?? null,
    ensureImportAtlas: async (importId: string) => urls.get(importId) ?? null,
    getImportedGeometry: async () => new THREE.BufferGeometry(),
    getImportedRawGeometry: async () => null,
    releaseImportAtlas: (importId: string) => urls.delete(importId),
    clearImportAtlases: () => urls.clear(),
  };
});
// The import creates real textures (decode → KTX2), but happy-dom has no working 2D canvas.
// Stub the DECODE only; the KTX2 encode underneath stays real.
vi.mock('../ktx/decodeImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ktx/decodeImage')>();
  const base = { width: 2, height: 2, rgba: new Uint8Array(16).fill(200) };
  return {
    ...actual,
    decodeImage: async () => ({ width: 2, height: 2, levels: actual.buildMipChain(base) }),
  };
});
// Loading a .ktx2 needs a WebGLRenderer to pick a transcode target — hand back plain textures.
vi.mock('../three/TextureCache', async () => {
  const THREE = await import('three');
  return {
    loadTexture: async () => new THREE.Texture(),
    loadWrappedTexture: async () => new THREE.Texture(),
  };
});
import { previewOverrideMatrix } from '../ksa/animationRig';
import { buildProjectExport, parseProjectImport, serializeProjectJson } from './projectTransfer';
import { validateEngines } from '../ksa/engineValidation';
import {
  $part,
  $activeLayerId,
  $selection,
  entityIdAt,
  entityIndexOf,
  select,
  toggleRef,
  type EntityKind,
  type SelectionRef,
  $canUndo,
  $historyList,
  $undoDescription,
  addCollider,
  applyActionChain,
  applyEngineWizard,
  removeCollider,
  addIvaSeat,
  addKittenAtSeat,
  aimIvaSeat,
  moveIvaSeat,
  removeIvaSeat,
  updateIvaSeatTransform,
  updateIvaSeatTransforms,
  updateSelectedTransform,
  setColliderOwner,
  setColliderShape,
  setColliderSize,
  copySelected,
  cutSelected,
  pasteClipboard,
  $clipboard,
  $gizmoSpace,
  $nudgeAxis,
  $nudgeStep,
  toggleGizmoSpace,
  addCombustor,
  addConnector,
  exportHistory,
  importHistory,
  importProjectData,
  addCustomReaction,
  addNozzle,
  addPartNozzle,
  addRcsEngine,
  addRocketController,
  addSolidEngine,
  addSubPartSolidMotor,
  duplicateEngineModule,
  updateReactionPlumes,
  addConsumerFeedWiring,
  addKitten,
  addLight,
  removeLight,
  setLightOwner,
  setLightPosition,
  setLightRayTracing,
  setLightRotation,
  setLightType,
  updateLight,
  updateLightTransform,
  clearSelection,
  deselectLayer,
  addPart,
  addPartCombustor,
  addSubPart,
  autoWireUnwiredConsumers,
  setCombustorFeeds,
  setConnectorCapabilities,
  setConsumerFeedWiringFeeds,
  setPartCombustorFeeds,
  setPartCombustorPlumbing,
  clearLayer,
  createLayer,
  deleteLayer,
  duplicateLayer,
  renameLayer,
  reorderLayers,
  selectLayerEntities,
  setActiveLayer,
  setLayerColor,
  setEditorTags,
  addSubPartSolarPanel,
  setEvaDoorEnabled,
  setEvaDoorSeat,
  setExtraDiameters,
  removeAllTemplateData,
  setPartId,
  setPlacementsInternal,
  updateSelectedTransforms,
  selectedTransformRefs,
  duplicatePlacement,
  duplicateSelected,
  moveEntityToLayer,
  moveSelectionToLayer,
  pushUndo,
  removeSelected,
  removePlacement,
  newPart,
  redo,
  setConnectorFlags,
  addTank,
  removeTank,
  setTankShape,
  updateTank,
  setControllable,
  setCustomMassEnabled,
  setDecouplerEnabled,
  setDecouplerForce,
  setDiameter,
  setDiameterEnabled,
  setDockingPortEnabled,
  setDockingPortLatchingKineticEnergy,
  setDockingPortPushoffImpulse,
  undo,
  updatePlacementTransform,
  scaleEverything,
} from './editorStore';
import {
  DEFAULT_LAYER_ID,
  ENTITY_ONLY_LAYER_IDS,
  IVA_SEAT_LAYER_ID,
  KITTEN_LAYER_ID,
  createCombustor,
  createEmptyPart,
  createSolidGrainSegment,
  createSolidMotor,
  createSubPartGameData,
  createTank,
} from '../ksa/types';
import type {
  Connector,
  ConnectorCapability,
  IvaSeat,
  PartCollider,
  PartLight,
  SubPartPlacement,
  Transform,
} from '../ksa/types';
import { $layerView, setLayerLocked, toggleLayerVisible } from './layerStore';
import { $activePartId, createPart, initPartsForNewProject, switchPart } from './partsStore';
import type { ChainCommitEntry, ImportedGameData, PlacementTransform } from './editorStore';
import {
  importModelAsMeshes,
  removeImport,
  replaceImport,
  setMeshTransparent,
} from './customAssetStore';
import { seatAxesFromRotation } from '../ksa/ivaSeatAxes';
// The world-pose-stability tests compose the SAME conversion the inspector's owner
// select performs (the frame math deliberately lives outside the store — see
// setLightOwner's JSDoc); importing coords here mirrors the UI, not the store.
import { lightLocalFromWorld, lightWorld, matrixFromTransform } from '../three/coords';
import { analyzeImport, DEFAULT_IMPORT_OPTIONS } from '../ksa/importPlan';
import { normalizeImport, type NormalizedImport } from '../ksa/importNormalize';
import type { ImportMaterialPlan } from '../ksa/importMaterials';

// ── index ⇄ ref helpers ──────────────────────────────────────────────────────
//
// P5A.17 deleted the six per-kind INDEX views and the per-kind index setters: the selection
// is now ONE ordered list of stable `{kind, id}` refs. The assertions below are about
// selection SEMANTICS (what stays selected across a delete, an undo, a duplicate, a layer
// lock), not about the storage shape, so the old index vocabulary is re-expressed here
// instead of being rewritten into a hundred id lookups. `entityIndexOf` / `entityIdAt` are
// the store's own resolvers, so these helpers cannot drift from it.

/** The ref for the entity currently at `index` (a dead index yields an unresolvable ref). */
const refAtIndex = (kind: EntityKind, index: number): SelectionRef => ({
  kind,
  id: entityIdAt($part.get(), kind, index) ?? `missing:${index}`,
});

/** The selection's indices of one kind, in selection order (dead refs dropped). */
const selIdx = (kind: EntityKind): number[] => {
  const part = $part.get();
  return $selection
    .get()
    .flatMap((r) => (r.kind === kind ? [entityIndexOf(part, kind, r.id)] : []))
    .filter((i) => i >= 0);
};

/** The PRIMARY index of one kind — the last of that kind added — or -1. */
const primaryIdx = (kind: EntityKind): number => {
  const indices = selIdx(kind);
  return indices.length > 0 ? indices[indices.length - 1] : -1;
};

/** Replaces the selection with the given indices of ONE kind (v1's per-kind setters). */
const selectOnly = (kind: EntityKind, ...indices: number[]): void =>
  select(indices.map((i) => refAtIndex(kind, i)));

/** Adds/removes one entity by index, leaving the rest alone (v1's `toggleEntity`). */
const toggleAt = (kind: EntityKind, index: number): void => toggleRef(refAtIndex(kind, index));

/**
 * Replaces the selection with a cross-kind index tuple — v1's `setSelection(sub, con, kit,
 * col, seat, lig)`, including its rule that an omitted list CLEARS that kind. The refs are
 * built in `KIND_ORDER`, which is what the store itself does.
 */
const selectAcross = (
  sub: readonly number[] = [],
  con: readonly number[] = [],
  kit: readonly number[] = [],
  col: readonly number[] = [],
  seat: readonly number[] = [],
  lig: readonly number[] = [],
): void =>
  select([
    ...sub.map((i) => refAtIndex('subpart', i)),
    ...con.map((i) => refAtIndex('connector', i)),
    ...col.map((i) => refAtIndex('collider', i)),
    ...seat.map((i) => refAtIndex('ivaSeat', i)),
    ...kit.map((i) => refAtIndex('kitten', i)),
    ...lig.map((i) => refAtIndex('light', i)),
  ]);

/** An {@link ImportedGameData} with every list empty — spread and override what a test needs. */
function emptyImportedGameData(): ImportedGameData {
  return {
    decoupler: null,
    dockingPort: null,
    evaDoor: null,
    diameterM: null,
    extraDiametersM: [],
    crashTolerancePa: null,
    controllable: false,
    customMass: null,
    customMassExtras: [],
    unknownAttrs: {},
    unknownChildren: [],
    batteries: [],
    generators: [],
    solarPanels: [],
    powerConsumer: null,
    subPartGameData: [],
    rocketControllers: [],
    rockets: [],
    combustors: [],
    nozzles: [],
    gimbals: [],
    tanks: [],
    solidMotors: [],
    solidNozzles: [],
    solidGrainSegments: [],
    consumerFeedWiring: [],
    colliders: [],
    ivaSeats: [],
    lights: [],
  };
}

/** Minimal entities for import tests — ids are in the SOURCE space and get regenerated. */
const placementOf = (instanceId: string): SubPartPlacement => ({
  instanceId,
  subPartTemplateId: 'Core.A',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  layerId: DEFAULT_LAYER_ID,
});
const connectorOf = (id: string): Connector => ({
  id,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  flags: [],
  capabilities: [],
  siblingIds: [],
  layerId: DEFAULT_LAYER_ID,
});
const importedCollider = (id: string): PartCollider => ({
  id,
  shape: 'Box',
  ownerTemplateId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  layerId: DEFAULT_LAYER_ID,
});
const importedSeat = (id: string): IvaSeat => ({
  id,
  ksaId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  layerId: IVA_SEAT_LAYER_ID,
});
const importedLight = (id: string): PartLight => ({
  id,
  type: 'Point',
  ownerTemplateId: null,
  rangeM: 1,
  intensity: 1,
  color: { r: 1, g: 1, b: 1 },
  innerAngleRad: Math.PI / 8,
  outerAngleRad: Math.PI / 4,
  rayTracing: false,
  ksaId: null,
  disableInIva: false,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  layerId: DEFAULT_LAYER_ID,
});

beforeEach(() => {
  newPart();
});

describe('editorStore', () => {
  it('adds SubParts with sequential lowercased instance ids and selects the last', () => {
    addSubPart('CoreStructuralA_Subpart_TrussBarA');
    addSubPart('CoreStructuralA_Subpart_TrussBarA');
    const ids = $part.get().placements.map((p) => p.instanceId);
    expect(ids).toEqual([
      'corestructurala_subpart_trussbara_1',
      'corestructurala_subpart_trussbara_2',
    ]);
    expect(primaryIdx('subpart')).toBe(1);
  });

  it('uses the last dot-segment for the instance base name', () => {
    addSubPart('Core.Screw.A');
    expect($part.get().placements[0].instanceId).toBe('a_1');
  });

  it('duplicates the selected placement with its transform and a new id', () => {
    addSubPart('Core.Bolt');
    updatePlacementTransform(0, {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    duplicateSelected();
    const p = $part.get().placements;
    expect(p.length).toBe(2);
    expect(p[1].instanceId).toBe('bolt_2');
    // Offset by one nudge step (default 0.1 m on Y) — see duplicateOffset.
    expect(p[1].position).toEqual({ x: 1, y: 2.1, z: 3 });
  });

  it('removes the selected placement and clamps selection', () => {
    addSubPart('Core.A');
    addSubPart('Core.B');
    removeSelected();
    expect($part.get().placements.map((p) => p.instanceId)).toEqual(['a_1']);
    expect(primaryIdx('subpart')).toBe(0);
  });

  it('supports undo/redo of additions', () => {
    addSubPart('Core.A');
    addSubPart('Core.B');
    expect($canUndo.get()).toBe(true);
    undo();
    expect($part.get().placements.map((p) => p.instanceId)).toEqual(['a_1']);
    redo();
    expect($part.get().placements.map((p) => p.instanceId)).toEqual(['a_1', 'b_1']);
  });

  it('adds connectors with sequential _connectorN ids and selects the connector', () => {
    addConnector();
    addConnector();
    expect($part.get().connectors.map((c) => c.id)).toEqual(['_connector1', '_connector2']);
    expect(primaryIdx('connector')).toBe(1);
    expect(primaryIdx('subpart')).toBe(-1);
  });

  it('keeps SubPart and connector selection mutually exclusive', () => {
    addSubPart('Core.A');
    expect(primaryIdx('subpart')).toBe(0);
    addConnector();
    expect(primaryIdx('subpart')).toBe(-1);
    expect(primaryIdx('connector')).toBe(0);
  });

  it('removeSelected deletes the selected connector', () => {
    addConnector();
    addConnector();
    removeSelected();
    expect($part.get().connectors.map((c) => c.id)).toEqual(['_connector1']);
    expect(primaryIdx('connector')).toBe(0);
  });

  it('reuses the next free connector id after deletion', () => {
    addConnector(); // _connector1
    addConnector(); // _connector2
    removeSelected(); // removes _connector2 (selected)
    addConnector(); // max existing is 1 -> _connector2
    expect($part.get().connectors.map((c) => c.id)).toEqual(['_connector1', '_connector2']);
  });

  it('sets connector flags (multi) with undo support', () => {
    addConnector();
    setConnectorFlags(0, ['Internal', 'ToSurface']);
    expect($part.get().connectors[0].flags).toEqual(['Internal', 'ToSurface']);
    undo();
    expect($part.get().connectors[0].flags).toEqual([]);
  });

  it('addPart imports connector flags and unions editor tags into the project', () => {
    setEditorTags(['Existing']);
    addPart(
      [],
      [
        {
          id: '_connector1',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          flags: ['ToSurface'],
          capabilities: [],
          siblingIds: [],
          layerId: DEFAULT_LAYER_ID,
        },
      ],
      ['Electrical', 'Existing'],
    );
    expect($part.get().connectors[0].flags).toEqual(['ToSurface']);
    // 'Existing' kept, 'Electrical' added, no duplicate.
    expect($part.get().editorTags).toEqual(['Existing', 'Electrical']);
  });

  it('addPart imports a docking port and rewires its connectorId to the regenerated connector', () => {
    addPart(
      [],
      [
        {
          id: '_connector5', // original KSA id; regenerated to _connector1 on import
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          flags: [],
          capabilities: [],
          siblingIds: [],
          layerId: DEFAULT_LAYER_ID,
        },
      ],
      [],
      undefined,
      undefined,
      {
        decoupler: null,
        dockingPort: {
          connectorId: '_connector5',
          latchingKineticEnergyJ: 6000,
          pushoffImpulseNs: 7000,
        },
        evaDoor: null,
        diameterM: null,
        extraDiametersM: [],
        crashTolerancePa: null,
        controllable: false,
        customMass: null,
        customMassExtras: [],
        unknownAttrs: {},
        unknownChildren: [],
        batteries: [],
        generators: [],
        solarPanels: [],
        powerConsumer: null,
        subPartGameData: [],
        rocketControllers: [],
        rockets: [],
        combustors: [],
        nozzles: [],
        gimbals: [],
        tanks: [],
        solidMotors: [],
        solidNozzles: [],
        solidGrainSegments: [],
        consumerFeedWiring: [],
        colliders: [],
        ivaSeats: [],
        lights: [],
      },
    );
    const dp = $part.get().gameData.dockingPort;
    // Values carried in, and the binding points at the regenerated connector id (not '_connector5').
    expect(dp?.latchingKineticEnergyJ).toBe(6000);
    expect(dp?.pushoffImpulseNs).toBe(7000);
    expect(dp?.connectorId).toBe($part.get().connectors[0].id);
    expect(dp?.connectorId).not.toBe('_connector5');
  });

  it('addPart appends imported lights with fresh ids, the import’s layer, and a pinned scale', () => {
    addLight(null); // occupies _light1, forcing the imported light to renumber
    // A light lands with the geometry it lights, so the import's layer wins — exactly
    // like the colliders beside it. The payload's own layer id is source-space and dead.
    const lamps = createLayer('Lamps'); // becomes active
    // addPart no-ops on an empty geometry import, so carry one placement.
    const placement = {
      instanceId: 'imp_1',
      subPartTemplateId: 'Core.A',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: DEFAULT_LAYER_ID,
    };
    addPart([placement], [], [], undefined, undefined, {
      ...emptyImportedGameData(),
      lights: [
        {
          id: '_light9', // stale source-space id — must be regenerated
          type: 'Point',
          ownerTemplateId: null,
          rangeM: 1.5,
          intensity: 0.05,
          color: { r: 1, g: 0.9, b: 0.7 },
          innerAngleRad: Math.PI / 8,
          outerAngleRad: Math.PI / 4,
          rayTracing: true,
          ksaId: null,
          disableInIva: false,
          position: { x: -0.275, y: 0, z: -0.8 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 2, y: 2, z: 2 }, // hand-edited payload — must be re-pinned
          layerId: 'a-layer-that-does-not-exist-here',
        },
      ],
    });
    const lights = $part.get().lights;
    expect(lights.map((l) => l.id)).toEqual(['_light1', '_light2']);
    const imported = lights[1];
    expect(imported.layerId).toBe(lamps);
    expect($part.get().placements[0].layerId).toBe(lamps); // same layer as the geometry
    expect(imported.scale).toEqual({ x: 1, y: 1, z: 1 }); // scale IS still re-pinned
    expect(imported.rangeM).toBe(1.5);
    expect(imported.intensity).toBe(0.05);
    expect(imported.color).toEqual({ r: 1, g: 0.9, b: 0.7 });
    expect(imported.rayTracing).toBe(true);
    expect(imported.position).toEqual({ x: -0.275, y: 0, z: -0.8 });
    undo();
    expect($part.get().lights.map((l) => l.id)).toEqual(['_light1']);
  });

  it('addPart does NOT re-add a template-owned light/collider the document already has', () => {
    // Core's LightSmallA and LightSmallB both place `…_Subpart_SpotlightA`, whose
    // <SubPartGameData> owns one <Light>. KSA registers that block ONCE and instantiates it
    // at every placement, so the second import must reuse the light already in the document
    // — appending a copy gave every spotlight two coincident lights, the extra one riding
    // the other import's placements (and would double them in game on export too).
    const owned = <T extends { ownerTemplateId: string | null }>(e: T): T => ({
      ...e,
      ownerTemplateId: 'Core.Spotlight',
    });
    const importOnce = (instanceId: string): void => {
      addPart(
        [{ ...placementOf(instanceId), subPartTemplateId: 'Core.Spotlight' }],
        [],
        [],
        undefined,
        undefined,
        {
          ...emptyImportedGameData(),
          colliders: [owned(importedCollider('_collider1'))],
          lights: [owned(importedLight('_light1'))],
        },
      );
    };
    importOnce('imp_1');
    importOnce('imp_2');
    const part = $part.get();
    expect(part.placements).toHaveLength(2); // both placements DO land
    expect(part.lights.map((l) => l.ownerTemplateId)).toEqual(['Core.Spotlight']);
    expect(part.colliders.map((c) => c.ownerTemplateId)).toEqual(['Core.Spotlight']);
  });

  it('addPart still imports every light a single template owns, and all part-level ones', () => {
    // The skip set is snapshotted BEFORE the append loop, so one import carrying two lights
    // for the same template keeps both; part-level (unowned) entities are never deduped.
    const owned = (id: string): PartLight => ({
      ...importedLight(id),
      ownerTemplateId: 'Core.Spotlight',
    });
    addPart([placementOf('imp_1')], [], [], undefined, undefined, {
      ...emptyImportedGameData(),
      lights: [owned('_light1'), owned('_light2'), importedLight('_light3')],
    });
    expect($part.get().lights.map((l) => l.ownerTemplateId)).toEqual([
      'Core.Spotlight',
      'Core.Spotlight',
      null,
    ]);
    // A second part-level light from another import is NOT a template duplicate — it lands.
    addPart([placementOf('imp_2')], [], [], undefined, undefined, {
      ...emptyImportedGameData(),
      lights: [importedLight('_light9')],
    });
    expect($part.get().lights).toHaveLength(4);
  });

  it('addPart selects everything it imported — SubParts, connectors, colliders, seats and lights', () => {
    // Pre-existing entities of every kind: they must NOT end up in the post-import selection.
    addSubPart('Core.Old');
    addConnector();
    addCollider('Box');
    addIvaSeat();
    addLight(null);
    addPart(
      [placementOf('imp_1'), placementOf('imp_2')],
      [connectorOf('_connector7')],
      [],
      undefined,
      undefined,
      {
        ...emptyImportedGameData(),
        colliders: [importedCollider('_collider9')],
        ivaSeats: [importedSeat('_ivaseat9')],
        lights: [importedLight('_light9')],
      },
    );
    // One pre-existing entity of each kind, so the imported ones are all at index 1.
    expect(selIdx('subpart')).toEqual([1, 2]);
    expect(selIdx('connector')).toEqual([1]);
    expect(selIdx('collider')).toEqual([1]);
    expect(selIdx('ivaSeat')).toEqual([1]);
    expect(selIdx('light')).toEqual([1]);
  });

  it('addPart leaves imported entities on a hidden or locked layer out of the selection', () => {
    try {
      // The import lands on the active layer, so hiding/locking THAT layer is what
      // excludes its connectors, colliders and lights from the post-import selection.
      toggleLayerVisible(DEFAULT_LAYER_ID); // layers default to visible
      setLayerLocked(DEFAULT_LAYER_ID, true);
      addPart([placementOf('imp_1')], [connectorOf('_connector7')], [], undefined, undefined, {
        ...emptyImportedGameData(),
        colliders: [importedCollider('_collider9')],
        lights: [importedLight('_light9')],
      });
      expect(selIdx('subpart')).toEqual([0]);
      expect(selIdx('connector')).toEqual([]); // hidden + locked
      expect(selIdx('collider')).toEqual([]); // hidden + locked
      expect(selIdx('light')).toEqual([]); // hidden + locked, like every ordinary kind
    } finally {
      $layerView.set({});
    }
  });

  it('addPart puts the Part’s connectors and colliders on the SAME layer as its SubParts', () => {
    const engines = createLayer('Engines'); // becomes active
    addPart([placementOf('imp_1')], [connectorOf('_connector7')], [], undefined, undefined, {
      ...emptyImportedGameData(),
      colliders: [importedCollider('_collider9')],
    });
    const p = $part.get();
    expect(p.placements[0].layerId).toBe(engines);
    expect(p.connectors[0].layerId).toBe(engines);
    expect(p.colliders[0].layerId).toBe(engines);
    // An explicit target layer wins over the active one, for every kind.
    const wings = createLayer('Wings');
    setActiveLayer(engines);
    addPart([placementOf('imp_2')], [connectorOf('_connector8')], [], wings, undefined, {
      ...emptyImportedGameData(),
      colliders: [importedCollider('_collider10')],
    });
    const q = $part.get();
    expect(q.placements[1].layerId).toBe(wings);
    expect(q.connectors[1].layerId).toBe(wings);
    expect(q.colliders[1].layerId).toBe(wings);
  });

  it('addPart rewrites <ConnectorRef>s inside preserved raw XML onto the regenerated connector ids', () => {
    addConnector(); // occupies _connector1, forcing the imported connectors to renumber
    const conn = (id: string) => ({
      id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      flags: [],
      capabilities: [],
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
    });
    addPart([], [conn('_connector19'), conn('_connector41')], [], undefined, undefined, {
      decoupler: null,
      dockingPort: null,
      evaDoor: null,
      diameterM: null,
      extraDiametersM: [],
      crashTolerancePa: null,
      controllable: false,
      customMass: null,
      customMassExtras: [],
      unknownAttrs: {},
      // KSA 2026.7 <Aligned> groups pair connectors by ref — ids in the SOURCE id space.
      unknownChildren: [
        {
          tag: 'Aligned',
          attrs: {},
          children: [
            { tag: 'ConnectorRef', attrs: { Id: '_connector19' }, children: [] },
            { tag: 'ConnectorRef', attrs: { Id: '_connector41' }, children: [] },
          ],
        },
      ],
      batteries: [],
      generators: [],
      solarPanels: [],
      powerConsumer: null,
      subPartGameData: [],
      rocketControllers: [],
      rockets: [],
      combustors: [],
      nozzles: [],
      gimbals: [],
      tanks: [],
      solidMotors: [],
      solidNozzles: [],
      solidGrainSegments: [],
      consumerFeedWiring: [],
      colliders: [],
      ivaSeats: [],
      lights: [],
    });
    const part = $part.get();
    // _connector19/_connector41 were regenerated to _connector2/_connector3…
    expect(part.connectors.map((c) => c.id)).toEqual(['_connector1', '_connector2', '_connector3']);
    // …and the Aligned group's refs follow them (no stale source-space ids).
    expect(part.gameData.unknownChildren).toEqual([
      {
        tag: 'Aligned',
        attrs: {},
        children: [
          { tag: 'ConnectorRef', attrs: { Id: '_connector2' }, children: [] },
          { tag: 'ConnectorRef', attrs: { Id: '_connector3' }, children: [] },
        ],
      },
    ]);
  });

  it('addPart remaps every feed + capability reference onto the regenerated ids', () => {
    addConnector(); // occupies _connector1, forcing the imported connectors to renumber
    const conn = (id: string, capabilities: ConnectorCapability[] = []) => ({
      id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      flags: [],
      capabilities,
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
    });
    const CHAMBER_TMPL = 'Core.ThrustChamberMesh';
    addPart(
      [
        {
          instanceId: 'CorePropulsionA_Subpart_EngineAMedBoostAssembly1',
          subPartTemplateId: CHAMBER_TMPL,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          layerId: DEFAULT_LAYER_ID,
        },
      ],
      [conn('_connector19', ['BulkFluid']), conn('_connector41', ['SolidMotorCase'])],
      [],
      undefined,
      undefined,
      {
        ...emptyImportedGameData(),
        // A part-level gas generator feeding from a connector + a scoped container.
        combustors: [
          {
            ...createCombustor('GasGeneratorChamber'),
            feeds: [
              { kind: 'connector', connectorId: '_connector19' },
              {
                kind: 'container',
                containerId: 'Grain',
                subPartInstanceId: 'CorePropulsionA_Subpart_EngineAMedBoostAssembly1',
              },
            ],
          },
        ],
        solidMotors: [
          {
            ...createSolidMotor('MotorCore'),
            feeds: [{ kind: 'connector', connectorId: '_connector41' }],
          },
        ],
        // The wiring entry references BOTH a placement (SubPartId) and a connector.
        consumerFeedWiring: [
          {
            consumerId: 'ThrustChamber',
            subPartInstanceId: 'CorePropulsionA_Subpart_EngineAMedBoostAssembly1',
            feeds: [{ kind: 'connector', connectorId: '_connector19' }],
          },
        ],
        // A SubPart-level chamber deferring to its placing part needs no remap...
        subPartGameData: [
          {
            ...createSubPartGameData(CHAMBER_TMPL),
            combustors: [{ ...createCombustor('ThrustChamber'), feeds: [{ kind: 'parent' }] }],
            // ...but a connector feed on a SubPart-level motor does.
            solidMotors: [
              {
                ...createSolidMotor('SubMotor'),
                feeds: [{ kind: 'connector', connectorId: '_connector41' }],
              },
            ],
          },
        ],
      },
    );
    const part = $part.get();
    const newInstanceId = part.placements[0].instanceId;
    expect(part.connectors.map((c) => c.id)).toEqual(['_connector1', '_connector2', '_connector3']);
    expect(newInstanceId).not.toBe('CorePropulsionA_Subpart_EngineAMedBoostAssembly1');

    // <Capabilities> rides through addPart (without BulkFluid the tank path is dead).
    expect(part.connectors.map((c) => c.capabilities)).toEqual([
      [],
      ['BulkFluid'],
      ['SolidMotorCase'],
    ]);
    // Every connector feed points at the REGENERATED id, never the source-space one.
    expect(part.gameData.combustors[0].feeds).toEqual([
      { kind: 'connector', connectorId: '_connector2' },
      { kind: 'container', containerId: 'Grain', subPartInstanceId: newInstanceId },
    ]);
    expect(part.gameData.solidMotors[0].feeds).toEqual([
      { kind: 'connector', connectorId: '_connector3' },
    ]);
    // The wiring entry's placement scope AND its feed point are both remapped.
    expect(part.gameData.consumerFeedWiring).toEqual([
      {
        consumerId: 'ThrustChamber',
        subPartInstanceId: newInstanceId,
        feeds: [{ kind: 'connector', connectorId: '_connector2' }],
      },
    ]);
    const spd = part.subPartGameData.find((s) => s.subPartTemplateId === CHAMBER_TMPL)!;
    expect(spd.combustors[0].feeds).toEqual([{ kind: 'parent' }]); // nothing to remap
    expect(spd.solidMotors[0].feeds).toEqual([{ kind: 'connector', connectorId: '_connector3' }]);
  });

  it('records undo for the plumbing mutations (capabilities, feeds, plumbing, wiring)', () => {
    addConnector();
    setConnectorCapabilities(0, ['BulkFluid']);
    expect($part.get().connectors[0].capabilities).toEqual(['BulkFluid']);
    undo();
    expect($part.get().connectors[0].capabilities).toEqual([]);

    addPartCombustor();
    const combustor = () => $part.get().gameData.combustors[0];
    setPartCombustorPlumbing(0, 'Service');
    expect(combustor().plumbing).toBe('Service');
    setPartCombustorFeeds(0, [{ kind: 'connector', connectorId: '_connector1' }]);
    expect(combustor().feeds).toEqual([{ kind: 'connector', connectorId: '_connector1' }]);
    undo(); // feeds
    expect(combustor().feeds).toEqual([{ kind: 'parent' }]);
    undo(); // plumbing
    expect(combustor().plumbing).toBe('Bulk');

    addConsumerFeedWiring('ThrustChamber', 'chamber_1');
    expect($part.get().gameData.consumerFeedWiring).toHaveLength(1);
    setConsumerFeedWiringFeeds(0, [{ kind: 'connector', connectorId: '_connector1' }]);
    expect($part.get().gameData.consumerFeedWiring[0].feeds).toHaveLength(1);
    undo(); // feeds
    expect($part.get().gameData.consumerFeedWiring[0].feeds).toEqual([]);
    undo(); // add
    expect($part.get().gameData.consumerFeedWiring).toEqual([]);
  });

  it('auto-wires only SubPart consumers that defer to the parent and lack an entry', () => {
    const TMPL = 'Core.ThrustChamberMesh';
    addSubPart(TMPL);
    addSubPart(TMPL); // same template placed twice ⇒ two distinct wiring targets
    addCombustor(TMPL);
    const instanceIds = $part.get().placements.map((p) => p.instanceId);
    const chamberId = $part.get().subPartGameData[0].combustors[0].id;

    autoWireUnwiredConsumers();
    expect($part.get().gameData.consumerFeedWiring).toEqual([
      { consumerId: chamberId, subPartInstanceId: instanceIds[0], feeds: [] },
      { consumerId: chamberId, subPartInstanceId: instanceIds[1], feeds: [] },
    ]);

    // Idempotent: everything is wired now, so a second run is a no-op (and no undo step).
    const before = $canUndo.get();
    autoWireUnwiredConsumers();
    expect($part.get().gameData.consumerFeedWiring).toHaveLength(2);
    expect($canUndo.get()).toBe(before);

    undo();
    expect($part.get().gameData.consumerFeedWiring).toEqual([]);

    // A consumer with a concrete feed (not Parent) never needs wiring.
    setCombustorFeeds(TMPL, 0, [
      { kind: 'container', containerId: 'Fuel', subPartInstanceId: null },
    ]);
    autoWireUnwiredConsumers();
    expect($part.get().gameData.consumerFeedWiring).toEqual([]);
  });

  it('adds/removes tanks per SubPart template as discrete undo steps and patches fields (streaming)', () => {
    const tmpl = 'CoreFuelTankA_Subpart_Skin1W1HA';
    addTank(tmpl);
    const spd = () => $part.get().subPartGameData.find((s) => s.subPartTemplateId === tmpl);
    expect(spd()?.tanks.length).toBe(1);
    setTankShape(tmpl, 0, 'Spherical');
    expect(spd()?.tanks[0].shape).toBe('Spherical');
    // updateTank is streaming (no internal undo) — emulate the field focus push.
    pushUndo('edit tank');
    updateTank(tmpl, 0, { outerRadiusM: 1.5 });
    expect(spd()?.tanks[0].outerRadiusM).toBe(1.5);
    undo(); // undo the radius edit
    expect(spd()?.tanks[0].outerRadiusM).toBe(0.5);
    undo(); // undo the shape change
    expect(spd()?.tanks[0].shape).toBe('Cylindrical');
    removeTank(tmpl, 0);
    expect(spd()).toBeUndefined(); // entry pruned when tanks empty
    undo();
    expect(spd()?.tanks.length).toBe(1);
  });

  it('adds a light (part-level or SubPart-owned), seeded or default, as one discrete undo step', () => {
    const tmpl = 'CoreElectricalA_Subpart_SpotlightA';
    const lights = () => $part.get().lights;

    addLight(tmpl);
    expect(lights()[0].id).toBe('_light1');
    expect(lights()[0].ownerTemplateId).toBe(tmpl);
    expect(lights()[0].layerId).toBe(DEFAULT_LAYER_ID); // the active layer
    expect(lights()[0].type).toBe('Spot');
    expect(lights()[0].color).toEqual({ r: 1, g: 1, b: 1 });

    // The glow panel's "Add matching light": KSA's <Emissive> can only add WHITE, so a coloured
    // <Light> is the only way a part reads as a coloured lamp in-game.
    addLight(tmpl, { type: 'Point', color: { r: 0, g: 1, b: 0 } });
    expect(lights()).toHaveLength(2);
    expect(lights()[1].id).toBe('_light2');
    expect(lights()[1].type).toBe('Point');
    expect(lights()[1].color).toEqual({ r: 0, g: 1, b: 0 });
    // Unspecified fields still come from createPartLight().
    expect(lights()[1].rangeM).toBe(5);

    // null owner ⇒ a part-level <Light> under <PartGameData>.
    addLight(null);
    expect(lights()[2].ownerTemplateId).toBeNull();
    expect(lights()[2].id).toBe('_light3');

    undo();
    undo();
    expect(lights()).toHaveLength(1);
  });

  it('addLight lands on the ACTIVE layer, and no seed can smuggle a different one', () => {
    const lamps = createLayer('Lamps'); // becomes active
    addLight(null);
    expect($part.get().lights[0].layerId).toBe(lamps);

    // The glow panel's "Add matching light" passes a seed straight through: identity, owner
    // and layer are the store's to decide, so a hand-built seed cannot override them.
    addLight('Core.A', { id: 'hijacked', ownerTemplateId: 'Core.Z', layerId: KITTEN_LAYER_ID });
    const seeded = $part.get().lights[1];
    expect(seeded.layerId).toBe(lamps);
    expect(seeded.id).toBe('_light2');
    expect(seeded.ownerTemplateId).toBe('Core.A');

    // Switching the active layer switches where the NEXT light lands.
    setActiveLayer(DEFAULT_LAYER_ID);
    addLight(null);
    expect($part.get().lights[2].layerId).toBe(DEFAULT_LAYER_ID);

    undo();
    expect($part.get().lights).toHaveLength(2);
  });

  it('removes / retypes / re-flags a light discretely and patches fields streaming, all undoable', () => {
    addLight(null);
    const lights = () => $part.get().lights;

    setLightType(0, 'Point');
    expect(lights()[0].type).toBe('Point');
    undo();
    expect(lights()[0].type).toBe('Spot');

    setLightRayTracing(0, true);
    expect(lights()[0].rayTracing).toBe(true);
    undo();
    expect(lights()[0].rayTracing).toBe(false);

    // updateLight / setLightPosition / setLightRotation are streaming (no internal undo) —
    // emulate the field-focus push.
    pushUndo('edit light');
    updateLight(0, { rangeM: 12, intensity: 3 });
    setLightPosition(0, { x: 1, y: 2, z: 3 });
    setLightRotation(0, { x: 0, y: 0, z: 1.5 });
    expect(lights()[0].rangeM).toBe(12);
    expect(lights()[0].intensity).toBe(3);
    expect(lights()[0].position).toEqual({ x: 1, y: 2, z: 3 });
    expect(lights()[0].rotation.z).toBe(1.5);
    undo(); // the whole typing session collapses into one step
    expect(lights()[0].rangeM).toBe(5);
    expect(lights()[0].position).toEqual({ x: 0, y: 0, z: 0 });

    removeLight(0);
    expect(lights()).toHaveLength(0);
    undo();
    expect(lights()).toHaveLength(1);

    // Out-of-range indices are ignored (no crash, no undo entry).
    removeLight(5);
    setLightType(-1, 'Point');
    expect(lights()).toHaveLength(1);
  });

  it('selects lights exclusively, toggles additively, and clears with the rest', () => {
    addLight(null);
    addLight(null);
    addCollider('Box'); // selects the collider
    expect(selIdx('collider')).toEqual([0]);

    selectOnly('light', 0);
    expect(selIdx('light')).toEqual([0]);
    expect(primaryIdx('light')).toBe(0);
    expect(selIdx('collider')).toEqual([]); // single-kind setters are exclusive

    toggleAt('light', 1); // additive within the kind
    expect(selIdx('light')).toEqual([0, 1]);
    toggleAt('light', 0);
    expect(selIdx('light')).toEqual([1]);

    selectOnly('light', 1, 0, 1, -2);
    expect(selIdx('light')).toEqual([1, 0]); // deduped, negatives dropped

    clearSelection();
    expect(selIdx('light')).toEqual([]);
    expect(primaryIdx('light')).toBe(-1);
  });

  it('deselectLayer prunes selected lights (the locked-layer contract) and selectLayerEntities picks them up', () => {
    const lamps = createLayer('Lamps'); // becomes active — lights land on it
    addLight(null);
    addLight('CoreElectricalA_Subpart_SpotlightA');

    selectOnly('light', 0, 1);
    deselectLayer(lamps);
    expect(selIdx('light')).toEqual([]);

    selectLayerEntities(lamps);
    expect(selIdx('light')).toEqual([0, 1]);
    // Sweeping another layer clears the light term (setSelection clears omitted kinds).
    selectLayerEntities(DEFAULT_LAYER_ID);
    expect(selIdx('light')).toEqual([]);
  });

  it('removeSelected deletes a selected light in one undo step and keeps a neighbor selected', () => {
    addLight(null);
    addLight(null);
    selectOnly('light', 0);
    removeSelected();
    expect($part.get().lights.map((l) => l.id)).toEqual(['_light2']);
    expect(selIdx('light')).toEqual([0]); // neighbor of the same kind
    undo();
    expect($part.get().lights).toHaveLength(2);
  });

  it('duplicateSelected clones a light (fresh id, same owner, SOURCE layer) and selects the copy', () => {
    const tmpl = 'CoreElectricalA_Subpart_SpotlightA';
    const lamps = createLayer('Lamps'); // becomes active
    addLight(tmpl, { rangeM: 7 });
    setActiveLayer(DEFAULT_LAYER_ID); // the copy follows the SOURCE, not the active layer
    selectOnly('light', 0);
    duplicateSelected();
    const lights = $part.get().lights;
    expect(lights).toHaveLength(2);
    expect(lights[1].id).toBe('_light2'); // fresh id — copies never collide
    expect(lights[1].ownerTemplateId).toBe(tmpl); // duplicate keeps the owner
    expect(lights[1].layerId).toBe(lamps);
    expect(lights[1].rangeM).toBe(7); // field-for-field copy
    expect(selIdx('light')).toEqual([1]); // selection moves to the duplicate
    undo();
    expect($part.get().lights).toHaveLength(1);
  });

  it("updateSelectedTransforms routes 'light' through assignLight — scale pinned, kitten at the same index untouched", () => {
    addKitten('hunter'); // kitten index 0, at the origin
    addLight(null); // light index 0, at the origin
    selectOnly('light', 0);
    pushUndo('move light');
    updateSelectedTransforms([
      {
        kind: 'light',
        id: '_light1',
        transform: {
          position: { x: 1, y: 2, z: 3 },
          rotation: { x: 0.1, y: 0, z: 0 },
          scale: { x: 4, y: 5, z: 6 }, // a scale write must be pinned away
        },
      },
    ]);
    const light = $part.get().lights[0];
    expect(light.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(light.rotation.x).toBeCloseTo(0.1, 12);
    expect(light.scale).toEqual({ x: 1, y: 1, z: 1 });
    // The misroute hazard this branch exists for: an unhandled kind would fall into the
    // final else and move the KITTEN at the same index instead.
    expect($part.get().kittens[0].position).toEqual({ x: 0, y: 0, z: 0 });
    undo();
    expect($part.get().lights[0].position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('updateLightTransform is a streaming owner-frame write with scale pinned', () => {
    addLight(null);
    // Streaming: no internal undo — emulate the interaction-start push.
    pushUndo('move light');
    updateLightTransform(0, {
      position: { x: -1, y: 0.5, z: 2 },
      rotation: { x: 0, y: 1.2, z: 0 },
      scale: { x: 9, y: 9, z: 9 },
    });
    // Out-of-range indices are ignored (no crash).
    updateLightTransform(5, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    const l = $part.get().lights[0];
    expect(l.position).toEqual({ x: -1, y: 0.5, z: 2 });
    expect(l.rotation.y).toBeCloseTo(1.2, 12);
    expect(l.scale).toEqual({ x: 1, y: 1, z: 1 });
    undo(); // the one pushed step reverts the whole session
    expect($part.get().lights[0].position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('setLightOwner keeps the WORLD pose stable through instance 0 (part-level ⇄ placed template), undoable', () => {
    const tmpl = 'CoreStructuralA_Subpart_TrussBarA';
    // Two placements so "instance 0 of the owner's placements" is meaningfully the
    // FIRST one (the plan §3.8 conversion frame), with a rotated + scaled frame.
    addSubPart(tmpl);
    addSubPart(tmpl);
    updatePlacementTransform(0, {
      position: { x: 1, y: 2, z: -3 },
      rotation: { x: 0.3, y: -1.1, z: 0.7 },
      scale: { x: 2, y: 1, z: 0.5 },
    });
    const seedPos = { x: 0.5, y: -0.25, z: 0.75 };
    const seedRot = { x: 0.4, y: -0.6, z: 1.2 };
    addLight(null, { position: seedPos, rotation: seedRot });
    const light = () => $part.get().lights[0];
    const owner0 = () => $part.get().placements[0];
    // Full-pose comparison via the composed matrix (scale pinned): position AND
    // rotation-including-roll must survive, not just the aim direction.
    const expectSamePose = (a: Transform, b: Transform) => {
      const ma = matrixFromTransform({ ...a, scale: { x: 1, y: 1, z: 1 } }).elements;
      const mb = matrixFromTransform({ ...b, scale: { x: 1, y: 1, z: 1 } }).elements;
      for (let i = 0; i < 16; i++) expect(ma[i]).toBeCloseTo(mb[i], 10);
    };

    // Part-level → placed template: the caller (the inspector) converts through
    // instance 0 and passes the result; the rendered part-frame pose must not move.
    const before = lightWorld(light(), null);
    setLightOwner(0, tmpl, lightLocalFromWorld(before, owner0()));
    expect(light().ownerTemplateId).toBe(tmpl);
    expectSamePose(lightWorld(light(), owner0()), before);
    // The local numbers really changed frames (the same pose expressed differently).
    expect(light().position).not.toEqual(seedPos);
    expect(light().scale).toEqual({ x: 1, y: 1, z: 1 });

    // ... and back to part-level: converting out through instance 0 again.
    const beforeBack = lightWorld(light(), owner0());
    setLightOwner(0, null, beforeBack);
    expect(light().ownerTemplateId).toBeNull();
    expectSamePose(lightWorld(light(), null), beforeBack);

    // Each re-home is ONE discrete undo step, restoring owner AND transform together.
    undo();
    expect(light().ownerTemplateId).toBe(tmpl);
    undo();
    expect(light().ownerTemplateId).toBeNull();
    expect(light().position).toEqual(seedPos);
    expect(light().rotation).toEqual(seedRot);
  });

  it('setLightOwner to an UNPLACED template keeps the local transform verbatim; same-owner is a no-op', () => {
    const seedPos = { x: 0.5, y: -0.25, z: 0.75 };
    const seedRot = { x: 0.4, y: -0.6, z: 1.2 };
    addLight(null, { position: seedPos, rotation: seedRot });
    const light = () => $part.get().lights[0];

    // The inspector passes NO converted transform for an unplaced target (plan §3.8):
    // the numbers stay verbatim and the light keeps rendering in the Part frame.
    setLightOwner(0, 'Never_Placed_Template');
    expect(light().ownerTemplateId).toBe('Never_Placed_Template');
    expect(light().position).toEqual(seedPos);
    expect(light().rotation).toEqual(seedRot);

    // Same owner again: no mutation, and crucially NO phantom undo entry —
    setLightOwner(0, 'Never_Placed_Template');
    // — so the first undo reverts the re-home ...
    undo();
    expect(light().ownerTemplateId).toBeNull();
    // ... and the next reverts the add itself.
    undo();
    expect($part.get().lights).toHaveLength(0);

    // Out-of-range index: ignored.
    setLightOwner(5, null);
    expect($part.get().lights).toHaveLength(0);
  });

  it('toggles custom mass and decoupler with undo', () => {
    setCustomMassEnabled(true);
    expect($part.get().gameData.customMass).toBe(100);
    undo();
    expect($part.get().gameData.customMass).toBeNull();

    setDecouplerEnabled(true);
    expect($part.get().gameData.decoupler).not.toBeNull();
    pushUndo('edit decoupler');
    setDecouplerForce(900);
    expect($part.get().gameData.decoupler?.force).toBe(900);
    undo();
    expect($part.get().gameData.decoupler?.force).toBe(500);
  });

  it('toggles a docking port (KSA defaults) and edits its energy/impulse with undo', () => {
    setDockingPortEnabled(true);
    expect($part.get().gameData.dockingPort).toEqual({
      connectorId: '',
      latchingKineticEnergyJ: 50,
      pushoffImpulseNs: 5000,
    });
    pushUndo('edit docking port');
    setDockingPortLatchingKineticEnergy(8000);
    setDockingPortPushoffImpulse(9000);
    expect($part.get().gameData.dockingPort?.latchingKineticEnergyJ).toBe(8000);
    expect($part.get().gameData.dockingPort?.pushoffImpulseNs).toBe(9000);
    undo();
    expect($part.get().gameData.dockingPort?.latchingKineticEnergyJ).toBe(50);
    expect($part.get().gameData.dockingPort?.pushoffImpulseNs).toBe(5000);
  });

  it('toggles part diameter (size class) and edits it with undo', () => {
    setDiameterEnabled(true);
    expect($part.get().gameData.diameterM).toBe(1); // DEFAULT_DIAMETER_M
    pushUndo('edit diameter');
    setDiameter(2.5);
    expect($part.get().gameData.diameterM).toBe(2.5);
    undo();
    expect($part.get().gameData.diameterM).toBe(1);
    undo();
    expect($part.get().gameData.diameterM).toBeNull();
  });

  it('toggles the command-capable marker with undo', () => {
    expect($part.get().gameData.controllable).toBe(false);
    setControllable(true);
    expect($part.get().gameData.controllable).toBe(true);
    undo();
    expect($part.get().gameData.controllable).toBe(false);
  });

  it('setEditorTags is undoable (self-records)', () => {
    setEditorTags(['Electrical']);
    setEditorTags(['Electrical', 'Structural']);
    expect($part.get().editorTags).toEqual(['Electrical', 'Structural']);
    undo();
    expect($part.get().editorTags).toEqual(['Electrical']);
    undo();
    expect($part.get().editorTags).toEqual([]);
  });

  it('setPartId reverts under undo when the caller pushed at interaction start', () => {
    // Mirrors Data mode's Identity section: pushUndo() on field focus, setPartId() per keystroke.
    pushUndo('edit part ID');
    setPartId('p');
    setPartId('part_id');
    expect($part.get().partId).toBe('part_id');
    // A single undo reverts the whole typing session (only one snapshot was pushed).
    undo();
    expect($part.get().partId).toBe('fixme_part_id');
  });

  it('updatePlacementTransform does not create an undo step', () => {
    addSubPart('Core.A'); // this pushes one undo snapshot (empty -> 1 placement)
    updatePlacementTransform(0, {
      position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    // A single undo should revert the whole add (transform update added no step).
    undo();
    expect($part.get().placements.length).toBe(0);
  });
});

describe('editorStore kittens', () => {
  it('adds a kitten on the Kittens layer with sequential ids and selects it', () => {
    addKitten('hunter');
    addKitten('polaris');
    const kittens = $part.get().kittens;
    expect(kittens.map((k) => k.id)).toEqual(['kitten_1', 'kitten_2']);
    expect(kittens.map((k) => k.kind)).toEqual(['hunter', 'polaris']);
    expect(kittens.every((k) => k.layerId === KITTEN_LAYER_ID)).toBe(true);
    expect(primaryIdx('kitten')).toBe(1);
  });

  it('selecting a kitten clears SubPart/connector selection (and vice versa)', () => {
    addSubPart('Core.A');
    addKitten('banjo');
    expect(primaryIdx('kitten')).toBe(0);
    expect(selIdx('subpart')).toEqual([]);
    expect(primaryIdx('connector')).toBe(-1);
    // Selecting a SubPart clears the kitten selection.
    addSubPart('Core.B');
    expect(selIdx('kitten')).toEqual([]);
  });

  it('removeSelected deletes the selected kitten and is undoable', () => {
    addKitten('hunter');
    removeSelected();
    expect($part.get().kittens.length).toBe(0);
    undo();
    expect($part.get().kittens.map((k) => k.id)).toEqual(['kitten_1']);
  });

  it('duplicateSelected copies the kitten (kind + Kittens layer preserved)', () => {
    addKitten('polaris');
    duplicateSelected();
    const kittens = $part.get().kittens;
    expect(kittens.length).toBe(2);
    expect(kittens[1].kind).toBe('polaris');
    expect(kittens[1].layerId).toBe(KITTEN_LAYER_ID);
    expect(kittens[1].id).toBe('kitten_2');
  });
});

describe('editorStore layers', () => {
  it('starts with built-in Default + IVA Seats + Kittens layers; Default is active', () => {
    expect($part.get().layers).toEqual([
      { id: DEFAULT_LAYER_ID, name: 'Default' },
      { id: IVA_SEAT_LAYER_ID, name: 'IVA Seats' },
      { id: KITTEN_LAYER_ID, name: 'Kittens' },
    ]);
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID);
  });

  it('createLayer adds a layer, makes it active, and is undoable', () => {
    const id = createLayer('Engines');
    expect($part.get().layers.map((l) => l.name)).toEqual([
      'Default',
      'IVA Seats',
      'Kittens',
      'Engines',
    ]);
    expect($activeLayerId.get()).toBe(id);
    undo();
    // Layer removed AND the active layer falls back to Default (it no longer exists).
    expect($part.get().layers.map((l) => l.name)).toEqual(['Default', 'IVA Seats', 'Kittens']);
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID);
  });

  it('SubParts, connectors, colliders AND lights all land in the active layer', () => {
    const id = createLayer('Engines'); // becomes active
    addSubPart('Core.A');
    addConnector();
    addCollider('Box');
    addLight(null);
    expect($part.get().placements[0].layerId).toBe(id);
    expect($part.get().connectors[0].layerId).toBe(id);
    expect($part.get().colliders[0].layerId).toBe(id);
    expect($part.get().lights[0].layerId).toBe(id);
  });

  it('an add never lands on a PINNED active layer — it falls back to Default', () => {
    // A pinned header renders the active-layer radio like any other, so the user can make
    // IVA Seats or Kittens active. An entity that landed there would be stuck: isMoveTarget
    // refuses every move OFF a pinned layer, so no UI could get it back.
    setActiveLayer(KITTEN_LAYER_ID);
    expect($activeLayerId.get()).toBe(KITTEN_LAYER_ID);
    addSubPart('Core.A');
    addConnector();
    addCollider('Box');
    addLight(null);
    expect($part.get().placements[0].layerId).toBe(DEFAULT_LAYER_ID);
    expect($part.get().connectors[0].layerId).toBe(DEFAULT_LAYER_ID);
    expect($part.get().colliders[0].layerId).toBe(DEFAULT_LAYER_ID);
    expect($part.get().lights[0].layerId).toBe(DEFAULT_LAYER_ID);

    setActiveLayer(IVA_SEAT_LAYER_ID);
    addLight(null);
    expect($part.get().lights[1].layerId).toBe(DEFAULT_LAYER_ID);

    // Kittens and seats are unaffected — they name their own pinned layer directly.
    addKitten('hunter');
    expect($part.get().kittens[0].layerId).toBe(KITTEN_LAYER_ID);
  });

  it('duplicate keeps the source layer for every layerable kind', () => {
    addSubPart('Core.A'); // active = Default
    const engines = createLayer('Engines');
    addSubPart('Core.C'); // in Engines
    duplicateSelected();
    const placements = $part.get().placements;
    expect(placements[placements.length - 1].layerId).toBe(engines);

    addConnector(); // in Engines too (the active layer)
    duplicateSelected();
    const connectors = $part.get().connectors;
    expect(connectors[connectors.length - 1].layerId).toBe(engines);

    addCollider('Box');
    duplicateSelected();
    const colliders = $part.get().colliders;
    expect(colliders[colliders.length - 1].layerId).toBe(engines);

    addLight(null);
    duplicateSelected();
    const lights = $part.get().lights;
    expect(lights[lights.length - 1].layerId).toBe(engines);
  });

  it('renameLayer changes the name and is undoable', () => {
    const id = createLayer('Engiens');
    renameLayer(id, 'Engines');
    expect($part.get().layers.find((l) => l.id === id)?.name).toBe('Engines');
    undo();
    expect($part.get().layers.find((l) => l.id === id)?.name).toBe('Engiens');
  });

  it('deleteLayer with delete-items removes the layer and its entities', () => {
    const id = createLayer('Scrap');
    addSubPart('Core.A'); // in Scrap
    setActiveLayer(DEFAULT_LAYER_ID);
    addSubPart('Core.B'); // in Default
    deleteLayer(id, { mode: 'delete-items' });
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      IVA_SEAT_LAYER_ID,
      KITTEN_LAYER_ID,
    ]);
    expect($part.get().placements.map((p) => p.subPartTemplateId)).toEqual(['Core.B']);
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID);
  });

  it('deleteLayer with move-items reassigns entities to the target layer', () => {
    const a = createLayer('A');
    addSubPart('Core.A'); // in A
    const b = createLayer('B');
    deleteLayer(a, { mode: 'move-items', targetLayerId: b });
    expect($part.get().placements[0].layerId).toBe(b);
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      IVA_SEAT_LAYER_ID,
      KITTEN_LAYER_ID,
      b,
    ]);
  });

  it('deleteLayer is undoable (restores layer + membership)', () => {
    const id = createLayer('Scrap');
    addSubPart('Core.A');
    deleteLayer(id, { mode: 'delete-items' });
    expect($part.get().placements.length).toBe(0);
    undo();
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      IVA_SEAT_LAYER_ID,
      KITTEN_LAYER_ID,
      id,
    ]);
    expect($part.get().placements[0].layerId).toBe(id);
  });

  // A light left behind by deleteLayer keeps a layerId nothing lists: it still renders and
  // still picks in 3D, but the Outliner (which only emits sections for layers that exist)
  // drops its row, and isMoveTarget then refuses to move it back. Both branches are pinned
  // here because the failure is invisible in the app.
  it('deleteLayer with delete-items removes a light on the layer, and undo restores it', () => {
    const lamps = createLayer('Lamps'); // becomes active
    addLight('CoreElectricalA_Subpart_SpotlightA');
    setActiveLayer(DEFAULT_LAYER_ID);
    addLight(null); // on Default — must survive
    deleteLayer(lamps, { mode: 'delete-items' });
    expect($part.get().lights.map((l) => l.id)).toEqual(['_light2']);
    expect($part.get().lights[0].layerId).toBe(DEFAULT_LAYER_ID);

    undo();
    const lights = $part.get().lights;
    expect(lights.map((l) => l.id)).toEqual(['_light1', '_light2']);
    expect(lights[0].layerId).toBe(lamps);
    expect($part.get().layers.map((l) => l.id)).toContain(lamps);
  });

  it('deleteLayer with move-items reassigns a light to the target layer, and undo restores it', () => {
    const lamps = createLayer('Lamps'); // becomes active
    addLight(null);
    const spare = createLayer('Spare');
    deleteLayer(lamps, { mode: 'move-items', targetLayerId: spare });
    expect($part.get().lights[0].layerId).toBe(spare);

    // An invalid target falls back to Default, never to the now-dead layer.
    deleteLayer(spare, { mode: 'move-items', targetLayerId: KITTEN_LAYER_ID });
    expect($part.get().lights[0].layerId).toBe(DEFAULT_LAYER_ID);

    undo();
    expect($part.get().lights[0].layerId).toBe(spare);
    undo();
    expect($part.get().lights[0].layerId).toBe(lamps);
  });

  it('refuses to delete the built-in Default, IVA Seats and Kittens layers', () => {
    addSubPart('Core.A');
    addConnector();
    deleteLayer(DEFAULT_LAYER_ID, { mode: 'delete-items' });
    deleteLayer(IVA_SEAT_LAYER_ID, { mode: 'delete-items' });
    deleteLayer(KITTEN_LAYER_ID, { mode: 'delete-items' });
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      IVA_SEAT_LAYER_ID,
      KITTEN_LAYER_ID,
    ]);
    expect($part.get().placements.length).toBe(1);
    expect($part.get().connectors.length).toBe(1);
  });

  it('clearLayer removes a layer’s items of every kind but keeps the layer (undoable)', () => {
    const scrap = createLayer('Scrap'); // becomes active
    addConnector(); // Scrap
    addConnector();
    addCollider('Box'); // Scrap
    addLight(null); // Scrap
    addKitten('hunter'); // pinned to the Kittens layer
    setActiveLayer(DEFAULT_LAYER_ID);
    addSubPart('Core.A'); // Default layer — must survive clearing Scrap
    clearLayer(scrap);
    expect($part.get().connectors.length).toBe(0);
    expect($part.get().colliders.length).toBe(0);
    expect($part.get().lights.length).toBe(0);
    expect($part.get().kittens.length).toBe(1);
    expect($part.get().placements.length).toBe(1);
    // The layer itself is untouched.
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      IVA_SEAT_LAYER_ID,
      KITTEN_LAYER_ID,
      scrap,
    ]);
    undo();
    expect($part.get().connectors.length).toBe(2);
    expect($part.get().lights.length).toBe(1);
  });

  // clearLayer counts what it is about to delete and bails at zero. Lights were absent from
  // that count, so a layer holding ONLY lights reported "empty" and the clear silently did
  // nothing — no error, no undo entry, the lights still there.
  it('clearLayer empties a layer holding ONLY lights, in one undo step, keeping the layer', () => {
    const lamps = createLayer('Lamps'); // becomes active
    addLight(null);
    addLight('CoreElectricalA_Subpart_SpotlightA');
    setActiveLayer(DEFAULT_LAYER_ID);
    addSubPart('Core.A'); // Default — must survive

    clearLayer(lamps);
    expect($part.get().lights).toHaveLength(0);
    expect($part.get().placements).toHaveLength(1);
    expect($part.get().layers.map((l) => l.id)).toContain(lamps); // the layer stays
    expect($undoDescription.get()).toBe('clear layer');

    // ONE undo step for both lights.
    undo();
    expect($part.get().lights.map((l) => l.id)).toEqual(['_light1', '_light2']);
    expect($part.get().lights.every((l) => l.layerId === lamps)).toBe(true);
  });

  it('clearLayer is a no-op for an empty layer (no undo entry)', () => {
    const empty = createLayer('Empty');
    setActiveLayer(DEFAULT_LAYER_ID);
    addSubPart('Core.A'); // Default
    clearLayer(empty); // nothing on it
    // No undo step was recorded: one undo still lands on "before the SubPart".
    undo();
    expect($part.get().placements.length).toBe(0);
  });

  it('reorderLayers reorders by id and is undoable', () => {
    const a = createLayer('A');
    const b = createLayer('B');
    reorderLayers([a, DEFAULT_LAYER_ID, IVA_SEAT_LAYER_ID, KITTEN_LAYER_ID, b]);
    expect($part.get().layers.map((l) => l.id)).toEqual([
      a,
      DEFAULT_LAYER_ID,
      IVA_SEAT_LAYER_ID,
      KITTEN_LAYER_ID,
      b,
    ]);
    undo();
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      IVA_SEAT_LAYER_ID,
      KITTEN_LAYER_ID,
      a,
      b,
    ]);
  });

  it('selectLayerEntities sweeps a layer’s SubParts AND its connectors together', () => {
    const id = createLayer('Mixed');
    addSubPart('Core.A');
    addSubPart('Core.B');
    addConnector(); // same (active) layer
    selectLayerEntities(id);
    expect(selIdx('subpart')).toEqual([0, 1]);
    expect(primaryIdx('connector')).toBe(0);

    // A layer holding nothing selects nothing.
    const empty = createLayer('Empty');
    selectLayerEntities(empty);
    expect(selIdx('subpart')).toEqual([]);
    expect(primaryIdx('connector')).toBe(-1);
  });

  it('duplicatePlacement copies one row by index, keeps its layer, selects the copy, and is undoable', () => {
    addSubPart('Core.A'); // active = Default
    const engines = createLayer('Engines');
    addSubPart('Core.B'); // in Engines, index 1
    updatePlacementTransform(1, {
      position: { x: 4, y: 5, z: 6 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    duplicatePlacement(1);
    const p = $part.get().placements;
    expect(p.length).toBe(3);
    expect(p[2].instanceId).toBe('b_2');
    expect(p[2].layerId).toBe(engines);
    expect(p[2].position).toEqual({ x: 4, y: 5.1, z: 6 }); // + one nudge step (P5B.02)
    expect(selIdx('subpart')).toEqual([2]);
    undo();
    expect($part.get().placements.length).toBe(2);
  });

  it('moveEntityToLayer refuses every entity-only built-in layer', () => {
    addSubPart('Core.A'); // index 0, Default
    for (const layerId of ENTITY_ONLY_LAYER_IDS) moveEntityToLayer('subpart', 0, layerId);
    expect($part.get().placements[0].layerId).toBe(DEFAULT_LAYER_ID);
    // A normal layer still works.
    const engines = createLayer('Engines');
    moveEntityToLayer('subpart', 0, engines);
    expect($part.get().placements[0].layerId).toBe(engines);
  });

  it('moveEntityToLayer moves a connector or a collider like any other row', () => {
    const engines = createLayer('Engines'); // active = Engines
    setActiveLayer(DEFAULT_LAYER_ID);
    addConnector(); // Default
    addCollider('Box'); // Default

    moveEntityToLayer('connector', 0, engines);
    moveEntityToLayer('collider', 0, engines);
    expect($part.get().connectors[0].layerId).toBe(engines);
    expect($part.get().colliders[0].layerId).toBe(engines);

    // Undoable, one step per move.
    undo();
    expect($part.get().colliders[0].layerId).toBe(DEFAULT_LAYER_ID);
    expect($part.get().connectors[0].layerId).toBe(engines);

    // And still refused for the pinned layers.
    for (const layerId of ENTITY_ONLY_LAYER_IDS) moveEntityToLayer('connector', 0, layerId);
    expect($part.get().connectors[0].layerId).toBe(engines);
  });

  it('moveEntityToLayer moves a light, labels the undo entry, and still refuses pinned layers', () => {
    const lamps = createLayer('Lamps'); // active = Lamps
    setActiveLayer(DEFAULT_LAYER_ID);
    addLight(null); // Default
    addLight(null); // Default — the index-addressed sibling must not move

    moveEntityToLayer('light', 0, lamps);
    expect($part.get().lights[0].layerId).toBe(lamps);
    expect($part.get().lights[1].layerId).toBe(DEFAULT_LAYER_ID);
    expect($undoDescription.get()).toBe('move to layer');
    expect($historyList.get().find((h) => h.stepsFromCurrent === -1)?.detail).toBe(
      '_light1 → Lamps',
    );

    undo();
    expect($part.get().lights[0].layerId).toBe(DEFAULT_LAYER_ID);

    // Pinned layers are refused — a light on IVA Seats or Kittens could never be moved back.
    for (const layerId of ENTITY_ONLY_LAYER_IDS) moveEntityToLayer('light', 0, layerId);
    expect($part.get().lights[0].layerId).toBe(DEFAULT_LAYER_ID);
    // An unknown layer and a dead index are no-ops too (no undo entry, no throw).
    const before = $part.get();
    moveEntityToLayer('light', 0, 'nope');
    moveEntityToLayer('light', 9, lamps);
    expect($part.get()).toBe(before);
  });

  it('moveSelectionToLayer moves every layerable kind, refuses pinned layers, keeps the active layer', () => {
    const engines = createLayer('Engines'); // active = Engines
    setActiveLayer(DEFAULT_LAYER_ID);
    addSubPart('Core.A'); // index 0, Default
    addSubPart('Core.B'); // index 1, Default
    addConnector(); // Default
    addCollider('Box'); // Default
    addLight(null); // Default
    addIvaSeat(); // pinned to IVA Seats
    addKitten('hunter'); // pinned to Kittens
    selectAcross([0, 1], [0], [0], [0], [0], [0]);

    for (const layerId of ENTITY_ONLY_LAYER_IDS) moveSelectionToLayer(layerId);
    expect($part.get().placements.every((p) => p.layerId === DEFAULT_LAYER_ID)).toBe(true);
    expect($part.get().connectors[0].layerId).toBe(DEFAULT_LAYER_ID);
    expect($part.get().lights[0].layerId).toBe(DEFAULT_LAYER_ID);

    moveSelectionToLayer(engines);
    expect($part.get().placements.every((p) => p.layerId === engines)).toBe(true);
    expect($part.get().connectors[0].layerId).toBe(engines);
    expect($part.get().colliders[0].layerId).toBe(engines);
    expect($part.get().lights[0].layerId).toBe(engines);
    // The pinned seat and kitten came along in the selection but stay on their own layers.
    expect($part.get().ivaSeats[0].layerId).toBe(IVA_SEAT_LAYER_ID);
    expect($part.get().kittens[0].layerId).toBe(KITTEN_LAYER_ID);
    // The active layer is unchanged (selection spans layers; no forced snap).
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID);

    // ONE undo step for the whole mixed move, labelled by the total item count.
    expect($undoDescription.get()).toBe('move to layer');
    expect($historyList.get().find((h) => h.stepsFromCurrent === -1)?.detail).toBe(
      '5 items → Engines',
    );
    undo();
    expect($part.get().placements.every((p) => p.layerId === DEFAULT_LAYER_ID)).toBe(true);
    expect($part.get().lights[0].layerId).toBe(DEFAULT_LAYER_ID);
  });

  it('moveSelectionToLayer moves a light-only selection and names it in the undo entry', () => {
    const lamps = createLayer('Lamps');
    setActiveLayer(DEFAULT_LAYER_ID);
    addLight(null);
    addLight(null);

    // One light ⇒ the entry names the light itself.
    selectOnly('light', 0);
    moveSelectionToLayer(lamps);
    expect($part.get().lights[0].layerId).toBe(lamps);
    expect($historyList.get().find((h) => h.stepsFromCurrent === -1)?.detail).toBe(
      '_light1 → Lamps',
    );

    // Several ⇒ the plural label, which lights only reach through entityCountLabel's
    // trailing `lig` parameter.
    selectOnly('light', 0, 1);
    moveSelectionToLayer(DEFAULT_LAYER_ID);
    expect($part.get().lights.every((l) => l.layerId === DEFAULT_LAYER_ID)).toBe(true);
    expect($historyList.get().find((h) => h.stepsFromCurrent === -1)?.detail).toBe(
      '2 lights → Default',
    );

    undo();
    expect($part.get().lights[0].layerId).toBe(lamps);
  });

  it('setPlacementsInternal writes one explicit flag per DISTINCT template, with undo', () => {
    const A = 'CoreIVAPropA_Subpart_SeatA';
    const B = 'CoreIVAPropA_Subpart_PanelA';
    addSubPart(A); // 0
    addSubPart(A); // 1 — same template, must collapse to ONE write
    addSubPart(B); // 2

    setPlacementsInternal([0, 1, 2], true);
    expect($part.get().internalFlags).toEqual({ [A]: true, [B]: true });

    // Discrete ⇒ exactly one undo step for the whole multi-selection.
    undo();
    expect($part.get().internalFlags).toEqual({});

    // `false` is STORED, not deleted — it must be able to override a catalogued <Internal>true.
    setPlacementsInternal([0], false);
    expect($part.get().internalFlags).toEqual({ [A]: false });
    expect(Object.hasOwn($part.get().internalFlags, A)).toBe(true);

    // Out-of-range indices are ignored (no throw, no extra keys).
    setPlacementsInternal([99], true);
    expect($part.get().internalFlags).toEqual({ [A]: false });
  });

  it('setPlacementsInternal skips glass meshes (KSA <PartModelGlass> has no <Internal>)', () => {
    const VISOR = 'flexo_hunter_visor_a';
    const SOLID = 'flexo_hunter_suit_a';
    $part.set({
      ...$part.get(),
      customMeshes: [
        {
          id: 'mesh_visor',
          name: 'Visor',
          subPartId: VISOR,
          kitten: {
            kind: 'hunter',
            specKey: 'visor',
            diffuse: 'Textures/x.ktx2',
            transparent: true,
          },
          surface: 'glassGlow',
          faceTextures: {},
        },
        {
          id: 'mesh_suit',
          name: 'Suit',
          subPartId: SOLID,
          kitten: { kind: 'hunter', specKey: 'suit', diffuse: 'Textures/y.ktx2' },
          faceTextures: {},
        },
      ],
    });
    addSubPart(VISOR); // 0
    addSubPart(SOLID); // 1

    setPlacementsInternal([0, 1], true);
    expect($part.get().internalFlags).toEqual({ [SOLID]: true });

    // A glass-only target writes nothing at all — and pushes no undo step.
    const before = $canUndo.get();
    setPlacementsInternal([0], true);
    expect($part.get().internalFlags).toEqual({ [SOLID]: true });
    expect($canUndo.get()).toBe(before);
  });

  it('setSelection allows a selection that spans SubParts, connectors, and kittens', () => {
    addSubPart('Core.A');
    addConnector();
    addKitten('hunter');
    selectAcross([0], [0], [0]);
    expect(selIdx('subpart')).toEqual([0]);
    expect(selIdx('connector')).toEqual([0]);
    expect(selIdx('kitten')).toEqual([0]);
  });

  it('toggleEntity adds/removes one kind without clearing the others', () => {
    addSubPart('Core.A');
    addConnector();
    selectAcross([0], [], []);
    toggleAt('connector', 0);
    expect(selIdx('subpart')).toEqual([0]); // SubPart kept
    expect(selIdx('connector')).toEqual([0]); // connector added
    toggleAt('connector', 0);
    expect(selIdx('subpart')).toEqual([0]);
    expect(selIdx('connector')).toEqual([]); // connector removed
  });

  it('removeSelected deletes a mixed selection in one undo step', () => {
    addSubPart('Core.A');
    addSubPart('Core.B');
    addConnector();
    addKitten('hunter');
    selectAcross([0, 1], [0], [0]);
    removeSelected();
    expect($part.get().placements.length).toBe(0);
    expect($part.get().connectors.length).toBe(0);
    expect($part.get().kittens.length).toBe(0);
    undo(); // a single step restores all three kinds
    expect($part.get().placements.length).toBe(2);
    expect($part.get().connectors.length).toBe(1);
    expect($part.get().kittens.length).toBe(1);
  });

  it('duplicateSelected copies every kind in a mixed selection and selects the copies', () => {
    addSubPart('Core.A');
    addConnector();
    addKitten('hunter');
    selectAcross([0], [0], [0]);
    duplicateSelected();
    expect($part.get().placements.length).toBe(2);
    expect($part.get().connectors.length).toBe(2);
    expect($part.get().kittens.length).toBe(2);
    expect(selIdx('subpart')).toEqual([1]);
    expect(selIdx('connector')).toEqual([1]);
    expect(selIdx('kitten')).toEqual([1]);
  });

  it('updateSelectedTransforms writes transforms across kinds in one store update', () => {
    addSubPart('Core.A');
    addConnector();
    addKitten('hunter');
    const t = (x: number) => ({
      position: { x, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    updateSelectedTransforms([
      { kind: 'subpart', id: 'a_1', transform: t(1) },
      { kind: 'connector', id: '_connector1', transform: t(2) },
      { kind: 'kitten', id: 'kitten_1', transform: t(3) },
    ]);
    expect($part.get().placements[0].position.x).toBe(1);
    expect($part.get().connectors[0].position.x).toBe(2);
    expect($part.get().kittens[0].position.x).toBe(3);
  });

  it('selectLayerEntities selects all kittens on the Kittens layer', () => {
    addKitten('hunter');
    addKitten('polaris');
    selectLayerEntities(KITTEN_LAYER_ID);
    expect(selIdx('kitten')).toEqual([0, 1]);
  });

  it('addPart returns the target layer and selects exactly the imported SubParts', () => {
    addSubPart('Core.Existing'); // pre-existing placement 0 on Default
    const engines = createLayer('Engines');
    const mk = (id: string) => ({
      instanceId: id,
      subPartTemplateId: id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: DEFAULT_LAYER_ID,
    });
    const layerId = addPart([mk('Core.A'), mk('Core.B')], [], [], engines);
    expect(layerId).toBe(engines);
    expect($part.get().placements.length).toBe(3);
    // Selection is exactly the two imported parts (indices 1 & 2), not the pre-existing one.
    expect([...selIdx('subpart')].sort((a, b) => a - b)).toEqual([1, 2]);
    expect($part.get().placements[1].layerId).toBe(engines);
  });
});

describe('editorStore layer color', () => {
  it('setLayerColor sets, changes and clears the swatch, and is undoable', () => {
    const id = createLayer('Engines');
    setLayerColor(id, 'teal');
    expect($part.get().layers.find((l) => l.id === id)?.color).toBe('teal');
    setLayerColor(id, 'rose');
    expect($part.get().layers.find((l) => l.id === id)?.color).toBe('rose');
    undo();
    expect($part.get().layers.find((l) => l.id === id)?.color).toBe('teal');
    setLayerColor(id, undefined);
    expect($part.get().layers.find((l) => l.id === id)?.color).toBeUndefined();
    // Cleared with no leftover key at all, so an uncolored layer encodes as it always did.
    expect(Object.keys($part.get().layers.find((l) => l.id === id)!)).toEqual(['id', 'name']);
    undo();
    expect($part.get().layers.find((l) => l.id === id)?.color).toBe('teal');
  });

  it('setLayerColor records ONE undo step labelled "layer color"', () => {
    const id = createLayer('Engines');
    setLayerColor(id, 'teal');
    expect($undoDescription.get()).toBe('layer color');
  });

  it('setLayerColor is a no-op for an unknown layer or an unchanged color', () => {
    const id = createLayer('Engines');
    setLayerColor(id, 'teal');
    const before = $part.get();
    setLayerColor(id, 'teal');
    setLayerColor('nope', 'red');
    expect($part.get()).toBe(before);
  });

  it('leaves the other layers untouched', () => {
    const id = createLayer('Engines');
    setLayerColor(id, 'lime');
    expect($part.get().layers.filter((l) => l.color !== undefined)).toHaveLength(1);
  });
});

describe('editorStore duplicateLayer', () => {
  it('inserts the copy directly after the source, named "<name> copy", carrying its color', () => {
    const engines = createLayer('Engines');
    createLayer('Wings');
    setLayerColor(engines, 'amber');
    const copy = duplicateLayer(engines);
    expect(copy).not.toBeNull();
    expect($part.get().layers.map((l) => l.name)).toEqual([
      'Default',
      'IVA Seats',
      'Kittens',
      'Engines',
      'Engines copy',
      'Wings',
    ]);
    expect($part.get().layers.find((l) => l.id === copy)?.color).toBe('amber');
    expect($activeLayerId.get()).toBe(copy);
  });

  it('clones only the movable kinds, with fresh ids, onto the new layer', () => {
    const engines = createLayer('Engines');
    addSubPart('Core.A');
    addConnector();
    addCollider('Box');
    addLight(null);
    addIvaSeat(); // pinned — lives on IVA Seats, must not be cloned
    addKitten('hunter'); // pinned likewise
    const copy = duplicateLayer(engines)!;
    const part = $part.get();
    expect(part.placements.filter((p) => p.layerId === copy)).toHaveLength(1);
    expect(part.connectors.filter((c) => c.layerId === copy)).toHaveLength(1);
    expect(part.colliders.filter((c) => c.layerId === copy)).toHaveLength(1);
    expect(part.lights.filter((l) => l.layerId === copy)).toHaveLength(1);
    expect(part.ivaSeats).toHaveLength(1);
    expect(part.kittens).toHaveLength(1);
    // Fresh ids everywhere — nothing collides with the source row.
    expect(new Set(part.placements.map((p) => p.instanceId)).size).toBe(2);
    expect(new Set(part.connectors.map((c) => c.id)).size).toBe(2);
    expect(new Set(part.colliders.map((c) => c.id)).size).toBe(2);
    expect(new Set(part.lights.map((l) => l.id)).size).toBe(2);
  });

  // Miss lights in duplicateLayer and the copy silently comes up short — or worse, a clone
  // carries the SOURCE layer id and the two rows overlap invisibly on one layer.
  it('clones lights onto the copy: fresh id, same owner and fields, selected, ONE undo step', () => {
    const lamps = createLayer('Lamps'); // becomes active
    const tmpl = 'CoreElectricalA_Subpart_SpotlightA';
    addLight(tmpl, { rangeM: 7, intensity: 3 });
    setLightPosition(0, { x: 1, y: 2, z: 3 });
    setActiveLayer(DEFAULT_LAYER_ID);
    addLight(null); // on Default — must NOT be cloned

    const copy = duplicateLayer(lamps)!;
    const lights = $part.get().lights;
    expect(lights).toHaveLength(3);
    const clone = lights[2];
    expect(clone.id).toBe('_light3'); // fresh id from the shared generator
    expect(clone.layerId).toBe(copy);
    expect(clone.ownerTemplateId).toBe(tmpl); // still drawn on every placement of that mesh
    expect(clone.rangeM).toBe(7);
    expect(clone.intensity).toBe(3);
    expect(clone.position).toEqual({ x: 1, y: 2, z: 3 }); // no position offset, like colliders
    expect(lights[1].layerId).toBe(DEFAULT_LAYER_ID); // the off-layer light is untouched

    // The clone joins the copies' selection…
    expect($selection.get()).toContainEqual({ kind: 'light', id: '_light3' });
    // …and the whole duplicate is a single undo step.
    expect($undoDescription.get()).toBe('duplicate layer');
    undo();
    expect($part.get().lights).toHaveLength(2);
    expect($part.get().layers.map((l) => l.name)).not.toContain('Lamps copy');
  });

  it('selects the copies', () => {
    const engines = createLayer('Engines');
    addSubPart('Core.A');
    addConnector();
    const copy = duplicateLayer(engines)!;
    const part = $part.get();
    expect($selection.get().map((r) => r.kind)).toEqual(['subpart', 'connector']);
    for (const ref of $selection.get()) {
      const layerId =
        ref.kind === 'subpart'
          ? part.placements.find((p) => p.instanceId === ref.id)?.layerId
          : part.connectors.find((c) => c.id === ref.id)?.layerId;
      expect(layerId).toBe(copy);
    }
  });

  it('is ONE undo step for the layer AND its clones', () => {
    const engines = createLayer('Engines');
    addSubPart('Core.A');
    addSubPart('Core.B');
    duplicateLayer(engines);
    expect($undoDescription.get()).toBe('duplicate layer');
    expect($part.get().placements).toHaveLength(4);
    undo();
    expect($part.get().placements).toHaveLength(2);
    expect($part.get().layers.map((l) => l.name)).not.toContain('Engines copy');
  });

  it('refuses the built-in layers', () => {
    expect(duplicateLayer(DEFAULT_LAYER_ID)).toBeNull();
    expect(duplicateLayer(KITTEN_LAYER_ID)).toBeNull();
    expect(duplicateLayer('nope')).toBeNull();
    expect($part.get().layers).toHaveLength(3);
    expect($canUndo.get()).toBe(false);
  });
});

describe('scaleEverything', () => {
  const tf = (
    pos: [number, number, number],
    rot: [number, number, number],
    scale: [number, number, number],
  ): Transform => ({
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    scale: { x: scale[0], y: scale[1], z: scale[2] },
  });

  it('scales placements, connectors, kittens, and animation poses per-axis around the origin, leaving rotation and timing untouched', () => {
    $part.set({
      ...createEmptyPart(),
      placements: [
        {
          instanceId: 'p1',
          subPartTemplateId: 'T',
          layerId: DEFAULT_LAYER_ID,
          ...tf([2, 4, 8], [0.1, 0.2, 0.3], [1, 2, 4]),
        },
      ],
      connectors: [
        {
          id: 'c1',
          flags: [],
          capabilities: [],
          siblingIds: [],
          layerId: DEFAULT_LAYER_ID,
          ...tf([1, 1, 1], [0, 0, 0], [1.5, 1.5, 1.5]),
        },
      ],
      kittens: [
        {
          id: 'k1',
          kind: 'hunter',
          layerId: KITTEN_LAYER_ID,
          ...tf([3, 0, 0], [0, 0, 0], [2, 2, 2]),
        },
      ],
      animations: [
        {
          id: 'a1',
          name: 'A',
          durationSec: 2,
          mode: 'actuate',
          joints: [{ id: 'j1', name: 'J', parentJointId: null, memberInstanceIds: ['p1'] }],
          keyframes: [
            { id: 'kf0', timeSec: 0, poses: { j1: tf([0, 0, 0], [0, 0, 0], [1, 1, 1]) } },
            { id: 'kf1', timeSec: 1, poses: { j1: tf([5, 6, 7], [0.5, 0, 0], [3, 1, 1]) } },
          ],
          restKeyframeId: 'kf0',
          solarTracking: null,
        },
      ],
    });

    scaleEverything({ x: 2, y: 3, z: 0.5 });

    const p = $part.get();
    expect(p.placements[0].position).toEqual({ x: 4, y: 12, z: 4 });
    expect(p.placements[0].scale).toEqual({ x: 2, y: 6, z: 2 });
    expect(p.placements[0].rotation).toEqual({ x: 0.1, y: 0.2, z: 0.3 }); // unchanged
    expect(p.connectors[0].position).toEqual({ x: 2, y: 3, z: 0.5 });
    // A connector MOVES but is never re-graded: its <Scale> is KSA's attach-node size
    // class, not the size of anything drawn (issue #6).
    expect(p.connectors[0].scale).toEqual({ x: 1.5, y: 1.5, z: 1.5 });
    expect(p.kittens[0].position).toEqual({ x: 6, y: 0, z: 0 });
    expect(p.kittens[0].scale).toEqual({ x: 4, y: 6, z: 1 });

    const a = p.animations[0];
    expect(a.durationSec).toBe(2); // timing untouched
    expect(a.keyframes[1].timeSec).toBe(1); // untouched
    // Joint poses are interior rig nodes: only the TRANSLATION scales; rotation
    // AND pose-scale stay put (scaling pose-scale double-scales the joint chain).
    expect(a.keyframes[1].poses.j1.position).toEqual({ x: 10, y: 18, z: 3.5 });
    expect(a.keyframes[1].poses.j1.scale).toEqual({ x: 3, y: 1, z: 1 }); // unchanged
    expect(a.keyframes[1].poses.j1.rotation).toEqual({ x: 0.5, y: 0, z: 0 }); // unchanged
  });

  it('keeps a multi-joint rig uniformly scaled: every animated leaf world pose scales by the factor at all times', () => {
    // hip(root) → knee(child, local offset) → foot leaf. BOTH joints articulate
    // (hip about Z, knee about Y) and the knee carries a non-origin local offset,
    // so the parent's bogus scale-factor can't cancel in W_J(t)·W_J(rest)⁻¹ — this
    // is the chain shape that shears apart when a pose's `scale` is wrongly scaled.
    const part = {
      ...createEmptyPart(),
      placements: [
        {
          instanceId: 'foot_1',
          subPartTemplateId: 'T',
          layerId: DEFAULT_LAYER_ID,
          ...tf([3, 0.5, 0], [0, 0, 0], [1, 1, 1]),
        },
      ],
      animations: [
        {
          id: 'a1',
          name: 'Leg',
          durationSec: 1,
          mode: 'actuate' as const,
          joints: [
            { id: 'hip', name: 'Hip', parentJointId: null, memberInstanceIds: [] },
            { id: 'knee', name: 'Knee', parentJointId: 'hip', memberInstanceIds: ['foot_1'] },
          ],
          keyframes: [
            {
              id: 'kf0',
              timeSec: 0,
              poses: {
                hip: tf([1, 0, 0], [0, 0, 0], [1, 1, 1]),
                knee: tf([2, 0.5, 0], [0, 0, 0], [1, 1, 1]),
              },
            },
            {
              id: 'kf1',
              timeSec: 1,
              poses: {
                hip: tf([1, 0, 0], [0, 0, Math.PI / 2], [1, 1, 1]),
                knee: tf([2, 0.5, 0], [0, Math.PI / 3, 0], [1, 1, 1]),
              },
            },
          ],
          restKeyframeId: 'kf0',
          solarTracking: null,
        },
      ],
    };
    $part.set(part);

    const leafWorldAt = (t: number): THREE.Vector3 => {
      const cur = $part.get();
      const m = previewOverrideMatrix(cur.animations[0], 'foot_1', t, cur.placements[0])!;
      return new THREE.Vector3().setFromMatrixPosition(m);
    };
    const before = [leafWorldAt(0), leafWorldAt(0.5), leafWorldAt(1)];

    const s = 2.5;
    scaleEverything({ x: s, y: s, z: s });

    // Under a uniform scale about the origin, the leaf's world position at EVERY
    // time must scale by exactly s — the invariant the chain double-scaling broke.
    before.forEach((b, i) => {
      const after = leafWorldAt([0, 0.5, 1][i]);
      expect(after.x).toBeCloseTo(b.x * s, 6);
      expect(after.y).toBeCloseTo(b.y * s, 6);
      expect(after.z).toBeCloseTo(b.z * s, 6);
    });
  });

  it('scales parametric propellant containers at both GameData scopes, radius/wall on the cross-section factor', () => {
    const base = createEmptyPart();
    $part.set({
      ...base,
      gameData: {
        ...base.gameData,
        // 2 m long, 0.5 m radius, 2 mm wall, offset 1 m up the stack.
        tanks: [{ ...createTank(), id: 'fuel', locationAsmb: { x: 1, y: 0, z: 0 } }],
        solidGrainSegments: [createSolidGrainSegment('Grain')],
      },
      subPartGameData: [
        {
          ...createSubPartGameData('T'),
          tanks: [{ ...createTank(), id: 'rcs', shape: 'Spherical' }],
        },
      ],
    });

    scaleEverything({ x: 2, y: 2, z: 2 });

    const g = $part.get().gameData;
    expect(g.tanks[0].lengthM).toBe(4);
    expect(g.tanks[0].outerRadiusM).toBe(1);
    // Wall thickness is an authored manufacturing spec, not geometry — never rescaled.
    expect(g.tanks[0].wallThicknessMm).toBe(2);
    expect(g.tanks[0].locationAsmb).toEqual({ x: 2, y: 0, z: 0 });
    expect(g.solidGrainSegments[0]).toMatchObject({
      lengthM: 2,
      outerRadiusM: 1,
      wallThicknessMm: 6, // unchanged
    });
    // A SubPart's own <Scale> never reaches its tank numbers in KSA, so they scale here too.
    expect($part.get().subPartGameData[0].tanks[0].outerRadiusM).toBe(1);
  });

  it('scales a tank so its enclosed volume follows x·y·z exactly under a non-uniform factor', () => {
    const base = createEmptyPart();
    const cyl = { ...createTank(), id: 'fuel' };
    const sph = { ...createTank(), id: 'rcs', shape: 'Spherical' as const };
    $part.set({ ...base, gameData: { ...base.gameData, tanks: [cyl, sph] } });
    // Cylinder volume ∝ r²·L, sphere volume ∝ r³ — both must land on x·y·z = 12.
    const cylVol = (t: { outerRadiusM: number; lengthM: number }) =>
      t.outerRadiusM ** 2 * t.lengthM;
    const sphVol = (t: { outerRadiusM: number }) => t.outerRadiusM ** 3;

    scaleEverything({ x: 2, y: 3, z: 2 });

    const [a, b] = $part.get().gameData.tanks;
    expect(cylVol(a) / cylVol(cyl)).toBeCloseTo(12, 6);
    expect(sphVol(b) / sphVol(sph)).toBeCloseTo(12, 6);
  });

  it('never negates a radius when an axis is mirrored', () => {
    const base = createEmptyPart();
    $part.set({
      ...base,
      gameData: {
        ...base.gameData,
        tanks: [{ ...createTank(), id: 'fuel', locationAsmb: { x: 0, y: 1, z: 0 } }],
      },
    });

    scaleEverything({ x: 1, y: -1, z: 1 });

    const t = $part.get().gameData.tanks[0];
    expect(t.outerRadiusM).toBe(0.5);
    expect(t.lengthM).toBe(2);
    // The mass OFFSET is a position, so it does flip with the mirror.
    expect(t.locationAsmb).toEqual({ x: 0, y: -1, z: 0 });
  });

  it('scales the VAB diameter size classes onto the 0.5 m rack grid, dropping collisions', () => {
    const base = createEmptyPart();
    $part.set({
      ...base,
      gameData: { ...base.gameData, diameterM: 1, extraDiametersM: [1.1, 2, 2.1, 3] },
    });

    // ×1.4 then snap: 1→1.5; the extras land on 1.5 (collides with the primary), 3, 3
    // (collides with the previous extra) and 4.
    scaleEverything({ x: 1.4, y: 1.4, z: 1.4 });

    const g = $part.get().gameData;
    expect(g.diameterM).toBe(1.5);
    expect(g.extraDiametersM).toEqual([3, 4]);
  });

  it('never snaps a size class below the smallest rack bucket, and leaves it off when disabled', () => {
    const base = createEmptyPart();
    $part.set({ ...base, gameData: { ...base.gameData, diameterM: 1, extraDiametersM: [] } });
    scaleEverything({ x: 0.1, y: 0.1, z: 0.1 });
    expect($part.get().gameData.diameterM).toBe(0.5);

    $part.set({ ...base, gameData: { ...base.gameData, diameterM: null } });
    scaleEverything({ x: 2, y: 2, z: 2 });
    expect($part.get().gameData.diameterM).toBeNull();
  });

  it('no-ops at factor 1 (no undo entry) and is a single undoable step otherwise', () => {
    $part.set({
      ...createEmptyPart(),
      placements: [
        {
          instanceId: 'p1',
          subPartTemplateId: 'T',
          layerId: DEFAULT_LAYER_ID,
          ...tf([2, 0, 0], [0, 0, 0], [1, 1, 1]),
        },
      ],
    });

    scaleEverything({ x: 1, y: 1, z: 1 });
    expect($canUndo.get()).toBe(false);

    scaleEverything({ x: 2, y: 2, z: 2 });
    expect($part.get().placements[0].position.x).toBe(4);
    expect($canUndo.get()).toBe(true);

    undo();
    expect($part.get().placements[0].position.x).toBe(2);
  });
});

describe('imported models', () => {
  /**
   * The material half of an import (see importMaterials): two textures + one shared material,
   * one of the meshes also glowing. Enough to prove the whole import is ONE undo step even
   * though `addCustomTexture`/`addCustomMaterial` would each push their own.
   */
  function materialPlan(normalized: NormalizedImport): ImportMaterialPlan {
    return {
      textures: [
        {
          key: 'k:base',
          name: 'basecolor',
          channel: 'baseColor',
          bytes: new Uint8Array([1]),
          mime: 'image/png',
        },
        {
          key: 'k:normal',
          name: 'normal',
          channel: 'normal',
          bytes: new Uint8Array([2]),
          mime: 'image/png',
        },
      ],
      materials: [
        {
          key: 'mat:0',
          name: 'Metal',
          baseColorTextureKey: 'k:base',
          normalTextureKey: 'k:normal',
          normalStrength: 1,
          metalness: 1,
          roughness: 0.4,
          glowPng: new Uint8Array([3]),
          glowColor: { r: 255, g: 0, b: 0 },
        },
      ],
      materialKeyByGroup: new Map(normalized.meshes.map((m) => [m.materialGroupKey, 'mat:0'])),
      warnings: [],
    };
  }

  /** A synthetic model: one object per entry, each placed `instances` times. */
  async function synthesizeModel(
    objects: { name: string; instances: number }[],
  ): Promise<NormalizedImport> {
    const material = new THREE.MeshStandardMaterial();
    material.name = 'Metal';
    const scene = new THREE.Group();
    for (const object of objects) {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      for (let i = 0; i < object.instances; i++) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = object.name;
        mesh.position.set(i * 2, 0, 0);
        scene.add(mesh);
      }
    }
    const plan = analyzeImport({ scene, fileName: 'pod.glb' }, DEFAULT_IMPORT_OPTIONS);
    return normalizeImport(plan, DEFAULT_IMPORT_OPTIONS);
  }

  /** Two objects, one of them placed twice → 2 SubParts, 3 placements (see importPlan). */
  async function importSyntheticModel(withMaterials = false): Promise<void> {
    const normalized = await synthesizeModel([
      { name: 'Hull', instances: 2 },
      { name: 'Nozzle', instances: 1 },
    ]);
    await importModelAsMeshes(
      normalized,
      'pod.glb',
      withMaterials ? materialPlan(normalized) : undefined,
    );
  }

  it('is ONE undo step: undo removes the meshes, placements and layer; redo restores them', async () => {
    const layersBefore = $part.get().layers.length;
    await importSyntheticModel();

    const imported = $part.get();
    expect(imported.customMeshes).toHaveLength(2);
    expect(imported.placements).toHaveLength(3);
    expect(imported.layers).toHaveLength(layersBefore + 1);
    const layer = imported.layers.at(-1)!;
    expect(layer.name).toBe('pod');
    expect($activeLayerId.get()).toBe(layer.id);

    undo();
    const reverted = $part.get();
    expect(reverted.customMeshes).toHaveLength(0);
    expect(reverted.placements).toHaveLength(0);
    expect(reverted.layers).toHaveLength(layersBefore);
    expect(reverted.layers.some((l) => l.id === layer.id)).toBe(false);

    redo();
    const restored = $part.get();
    expect(restored.customMeshes).toHaveLength(2);
    expect(restored.customMeshes.map((m) => m.imported?.meshName)).toEqual(
      imported.customMeshes.map((m) => m.subPartId),
    );
    expect(restored.placements).toHaveLength(3);
    expect(restored.layers.some((l) => l.id === layer.id)).toBe(true);
  });

  it('stays ONE undo step with textures and materials, which normally push their own', async () => {
    // addCustomTexture/addCustomMaterial each call mutate() (one undo entry each), so an
    // import creating 2 textures + 1 material + 2 meshes + 3 placements would be SIX steps
    // without the non-mutating createTextureAsset/buildCustomMaterialDescriptor split.
    await importSyntheticModel(true);

    const imported = $part.get();
    expect(imported.customTextures).toHaveLength(2);
    expect(imported.customMaterials).toHaveLength(1);
    expect(imported.customMeshes).toHaveLength(2);
    expect(
      imported.customMeshes.every((m) => m.materialId === imported.customMaterials[0].id),
    ).toBe(true);
    expect(imported.customMeshes.every((m) => m.emissive?.shape === 'painted')).toBe(true);

    undo();
    const reverted = $part.get();
    expect(reverted.customTextures).toHaveLength(0);
    expect(reverted.customMaterials).toHaveLength(0);
    expect(reverted.customMeshes).toHaveLength(0);
    expect(reverted.placements).toHaveLength(0);

    redo();
    const restored = $part.get();
    expect(restored.customTextures).toHaveLength(2);
    expect(restored.customMaterials).toHaveLength(1);
    expect(restored.customMeshes).toHaveLength(2);
    expect(restored.placements).toHaveLength(3);
  });

  it('removeImport is ONE undo step: undo restores meshes, placements, materials and textures', async () => {
    const layersBefore = $part.get().layers.length;
    await importSyntheticModel(true);
    const imported = $part.get();
    const importId = imported.customMeshes[0].imported!.importId;

    await removeImport(importId);
    const removed = $part.get();
    expect(removed.customMeshes).toHaveLength(0);
    expect(removed.placements).toHaveLength(0);
    expect(removed.customMaterials).toHaveLength(0);
    expect(removed.customTextures).toHaveLength(0);
    expect(removed.layers).toHaveLength(layersBefore);

    // ONE undo: the meshes, their placements, the collected material/textures and the layer
    // all come back together. (Their BINARIES do not — see removeImport's contract; the
    // confirm dialog says so.)
    undo();
    const back = $part.get();
    expect(back.customMeshes).toHaveLength(2);
    expect(back.placements).toHaveLength(3);
    expect(back.customMaterials).toHaveLength(1);
    expect(back.customTextures).toHaveLength(2);
    expect(back.layers).toHaveLength(layersBefore + 1);
    expect(back.customMeshes.every((m) => m.imported?.importId === importId)).toBe(true);

    redo();
    expect($part.get().customMeshes).toHaveLength(0);
  });

  it('replaceImport is ONE undo step: undo restores the geometry, materials and placements', async () => {
    await importSyntheticModel(true);
    const before = $part.get();
    const importId = before.customMeshes[0]!.imported!.importId;
    const hull = before.customMeshes[0]!;
    const nozzle = before.customMeshes[1]!;
    const materialId = before.customMaterials[0]!.id;

    // The re-export: Hull survives, Nozzle is gone, Skirt is new — with its own material set.
    const second = await synthesizeModel([
      { name: 'Hull', instances: 2 },
      { name: 'Skirt', instances: 1 },
    ]);
    await replaceImport(importId, second, { updateMaterials: true }, materialPlan(second));

    const swapped = $part.get();
    expect(swapped.customMeshes).toHaveLength(2);
    expect(swapped.customMeshes[0]!.subPartId).toBe(hull.subPartId); // identity preserved
    expect(swapped.customMeshes[0]!.imported!.importId).toBe(second.importId);
    expect(swapped.customMeshes.some((m) => m.id === nozzle.id)).toBe(false);
    expect(swapped.customMaterials.map((m) => m.id)).not.toContain(materialId);

    // ONE undo: the geometry reference, the swapped material/textures, the removed SubPart
    // and every placement come back together. (The BYTES do not — see replaceImport.)
    undo();
    const back = $part.get();
    expect(back.customMeshes.map((m) => m.id)).toEqual(before.customMeshes.map((m) => m.id));
    expect(back.customMeshes.map((m) => m.imported!.importId)).toEqual([importId, importId]);
    expect(back.customMeshes.map((m) => m.imported!.meshName)).toEqual(
      before.customMeshes.map((m) => m.imported!.meshName),
    );
    expect(back.customMaterials.map((m) => m.id)).toEqual([materialId]);
    expect(back.customTextures).toHaveLength(2);
    expect(back.placements).toEqual(before.placements);

    redo();
    expect($part.get().customMeshes[0]!.imported!.importId).toBe(second.importId);
  });

  it('setMeshTransparent enrolls in undo', async () => {
    await importSyntheticModel();
    const meshId = $part.get().customMeshes[0].id;

    await setMeshTransparent(meshId, true);
    expect($part.get().customMeshes[0].imported!.transparent).toBe(true);

    undo();
    expect($part.get().customMeshes[0].imported!.transparent).toBeUndefined();
    redo();
    expect($part.get().customMeshes[0].imported!.transparent).toBe(true);
  });
});

describe('importing a Part with colliders', () => {
  /** Imports a Part carrying `colliders` (plus one placement — every real catalog Part has geometry). */
  function importWithColliders(colliders: PartCollider[]): void {
    addPart(
      [
        {
          instanceId: 'foot_1',
          subPartTemplateId: 'CoreLandingA_Subpart_MediumFootA',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          layerId: DEFAULT_LAYER_ID,
        },
      ],
      [],
      [],
      undefined,
      undefined,
      { ...emptyImportedGameData(), colliders },
    );
  }

  const IMPORTED = [
    {
      id: 'CylinderCollider1',
      shape: 'Cylinder' as const,
      ownerTemplateId: null,
      position: { x: 0, y: 0, z: -0.17 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.39, y: 0.6, z: 0.39 },
      layerId: DEFAULT_LAYER_ID,
    },
    {
      id: 'Puck',
      shape: 'Cylinder' as const,
      ownerTemplateId: 'CoreLandingA_Subpart_MediumFootA',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 0.34, z: 1 },
      layerId: DEFAULT_LAYER_ID,
    },
  ];

  it('regenerates ids onto the import layer, keeping owner + geometry', () => {
    importWithColliders(IMPORTED);
    const colliders = $part.get().colliders;
    // Core reuses ids like "CylinderCollider1" across dozens of parts, so import
    // regenerates them exactly like connector ids.
    expect(colliders.map((c) => c.id)).toEqual(['_collider1', '_collider2']);
    expect(colliders.map((c) => c.ownerTemplateId)).toEqual([
      null,
      'CoreLandingA_Subpart_MediumFootA',
    ]);
    expect(colliders[1].scale).toEqual({ x: 1, y: 0.34, z: 1 });
    expect(colliders.every((c) => c.layerId === DEFAULT_LAYER_ID)).toBe(true);
  });

  it('keeps ids collision-free across a second import and is undoable', () => {
    importWithColliders(IMPORTED);
    importWithColliders(IMPORTED);
    // Only the PART-level cylinder repeats: the second `Puck` is owned by a template the
    // document already covers, and KSA instantiates a template's colliders at every
    // placement — so a second copy would double them. See templatesAlreadyOwning.
    expect($part.get().colliders.map((c) => c.id)).toEqual([
      '_collider1',
      '_collider2',
      '_collider3',
    ]);
    expect($part.get().colliders.map((c) => c.ownerTemplateId)).toEqual([
      null,
      'CoreLandingA_Subpart_MediumFootA',
      null,
    ]);
    undo();
    expect($part.get().colliders.map((c) => c.id)).toEqual(['_collider1', '_collider2']);
    undo();
    expect($part.get().colliders).toEqual([]);
  });

  it('does not mutate the source catalog entry’s colliders', () => {
    const src = structuredClone(IMPORTED);
    importWithColliders(src);
    expect(src).toEqual(IMPORTED);
  });
});

describe('importing a Part with IVA seats', () => {
  /** Imports a Part carrying `ivaSeats` (plus one placement — every real catalog Part has geometry). */
  function importWithSeats(ivaSeats: IvaSeat[]): void {
    addPart(
      [
        {
          instanceId: 'capsule_1',
          subPartTemplateId: 'CoreIVASpaceA_Subpart_MediumCapsuleA',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          layerId: DEFAULT_LAYER_ID,
        },
      ],
      [],
      [],
      undefined,
      undefined,
      { ...emptyImportedGameData(), ivaSeats },
    );
  }

  /** Core's two-seat capsule interior (CoreIVASpaceAGameData.xml:18-28), in document order. */
  const IMPORTED: IvaSeat[] = [
    {
      id: 'seatFromSource',
      ksaId: null,
      position: { x: -0.45, y: 0.42, z: -0.35 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: IVA_SEAT_LAYER_ID,
    },
    {
      id: 'seatFromSource',
      ksaId: null,
      position: { x: -0.45, y: -0.42, z: -0.35 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: IVA_SEAT_LAYER_ID,
    },
  ];

  it('regenerates ids onto the IVA Seats layer, keeping document order + transforms', () => {
    importWithSeats(IMPORTED);
    const seats = $part.get().ivaSeats;
    expect(seats.map((s) => s.id)).toEqual(['_seat1', '_seat2']);
    expect(seats.every((s) => s.layerId === IVA_SEAT_LAYER_ID)).toBe(true);
    // Order is KSA's seat CYCLE order — the first seat is the one IVA opens on.
    expect(seats.map((s) => s.position.y)).toEqual([0.42, -0.42]);
  });

  it('appends after existing seats, keeps ids collision-free, and is undoable', () => {
    importWithSeats(IMPORTED);
    importWithSeats(IMPORTED);
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2', '_seat3', '_seat4']);
    // The second import's seats land AFTER the first import's, in their own order.
    expect($part.get().ivaSeats.map((s) => s.position.y)).toEqual([0.42, -0.42, 0.42, -0.42]);
    undo();
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2']);
    undo();
    expect($part.get().ivaSeats).toEqual([]);
  });

  it('does not mutate the source catalog entry’s seats', () => {
    const src = structuredClone(IMPORTED);
    importWithSeats(src);
    expect(src).toEqual(IMPORTED);
  });
});

describe('collider mutations', () => {
  it('addCollider drops a unit shape on the active layer, selects it, and is undoable', () => {
    addCollider('Cylinder');
    addCollider('Box');
    const colliders = $part.get().colliders;
    expect(colliders.map((c) => [c.id, c.shape])).toEqual([
      ['_collider1', 'Cylinder'],
      ['_collider2', 'Box'],
    ]);
    expect(colliders.every((c) => c.layerId === DEFAULT_LAYER_ID)).toBe(true);
    expect(colliders[0].scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(colliders[0].ownerTemplateId).toBeNull();
    expect(primaryIdx('collider')).toBe(1);
    undo();
    expect($part.get().colliders.map((c) => c.id)).toEqual(['_collider1']);
  });

  it('selecting a collider clears the other kinds (and vice versa)', () => {
    addSubPart('Core.A');
    addCollider('Box');
    expect(selIdx('subpart')).toEqual([]);
    expect(selIdx('collider')).toEqual([0]);
    selectOnly('subpart', 0);
    expect(selIdx('collider')).toEqual([]);
  });

  it('setColliderShape re-snaps the size onto the new shape and is undoable', () => {
    addCollider('Box', {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 3, z: 1 },
    });
    setColliderShape(0, 'Cylinder');
    // A cylinder's X and Z are one diameter: max(2, 1) = 2.
    expect($part.get().colliders[0].scale).toEqual({ x: 2, y: 3, z: 2 });
    undo();
    expect($part.get().colliders[0].shape).toBe('Box');
    expect($part.get().colliders[0].scale).toEqual({ x: 2, y: 3, z: 1 });
  });

  it('setColliderSize normalizes so a cylinder can never be elliptical', () => {
    addCollider('Cylinder');
    setColliderSize(0, { x: 3, y: 4, z: 1 });
    expect($part.get().colliders[0].scale).toEqual({ x: 3, y: 4, z: 3 });
  });

  it('setColliderOwner re-homes with the converted transform and is undoable', () => {
    addSubPart('Core.Foot');
    addCollider('Cylinder');
    setColliderOwner(0, 'Core.Foot', {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    expect($part.get().colliders[0].ownerTemplateId).toBe('Core.Foot');
    expect($part.get().colliders[0].position).toEqual({ x: 1, y: 2, z: 3 });
    undo();
    expect($part.get().colliders[0].ownerTemplateId).toBeNull();
  });

  it('gizmo write-back normalizes the size (scale IS the size)', () => {
    addCollider('Sphere');
    updateSelectedTransforms([
      {
        kind: 'collider',
        id: '_collider1',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 5, z: 2 },
        },
      },
    ]);
    // A sphere is uniform: the largest axis wins.
    expect($part.get().colliders[0].scale).toEqual({ x: 5, y: 5, z: 5 });
  });

  it('duplicate / delete / copy-paste all cover colliders in one undo step', () => {
    addCollider('Box');
    duplicateSelected();
    expect($part.get().colliders.map((c) => c.id)).toEqual(['_collider1', '_collider2']);
    copySelected();
    pasteClipboard();
    expect($part.get().colliders).toHaveLength(3);
    undo(); // paste
    expect($part.get().colliders).toHaveLength(2);
    // Undo restores the document, not the selection — re-select before deleting.
    selectOnly('collider', 1);
    removeSelected();
    expect($part.get().colliders).toHaveLength(1);
    undo();
    expect($part.get().colliders).toHaveLength(2);
  });

  it('scaleEverything scales a collider’s position AND its size, re-normalized', () => {
    addCollider('Cylinder', {
      position: { x: 1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 4, z: 2 },
    });
    scaleEverything({ x: 2, y: 2, z: 2 });
    const c = $part.get().colliders[0];
    expect(c.position).toEqual({ x: 2, y: 0, z: 0 });
    expect(c.scale).toEqual({ x: 4, y: 8, z: 4 });
  });

  it('removeCollider drops one by index and is undoable', () => {
    addCollider('Box');
    addCollider('Sphere');
    removeCollider(0);
    expect($part.get().colliders.map((c) => c.shape)).toEqual(['Sphere']);
    undo();
    expect($part.get().colliders.map((c) => c.shape)).toEqual(['Box', 'Sphere']);
  });
});

describe('IVA seat mutations', () => {
  /** A transform with a distinctive rotation, so "rotation untouched" assertions can bite. */
  const AIMED: Transform = {
    position: { x: -0.45, y: 0.42, z: -0.35 },
    rotation: { x: 0, y: 0.5, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };

  it('addIvaSeat drops a seat on the IVA Seats layer, selects it, and is undoable', () => {
    addIvaSeat();
    addIvaSeat(AIMED);
    const seats = $part.get().ivaSeats;
    expect(seats.map((s) => s.id)).toEqual(['_seat1', '_seat2']);
    expect(seats.every((s) => s.layerId === IVA_SEAT_LAYER_ID)).toBe(true);
    // No transform ⇒ un-rotated at the origin, which IS KSA's schema default (+X / −Z).
    expect(seats[0].position).toEqual({ x: 0, y: 0, z: 0 });
    expect(seats[0].rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(seats[1].position).toEqual(AIMED.position);
    expect(seats[1].rotation).toEqual(AIMED.rotation);
    expect(primaryIdx('ivaSeat')).toBe(1);
    undo();
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat1']);
    redo();
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2']);
  });

  it('addIvaSeat pins scale to (1,1,1) — a seat has no size', () => {
    addIvaSeat({ ...AIMED, scale: { x: 3, y: 4, z: 5 } });
    expect($part.get().ivaSeats[0].scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('selecting a seat clears the other four kinds (and vice versa)', () => {
    addSubPart('Core.A');
    addConnector();
    addKitten('hunter');
    addCollider('Box');
    addIvaSeat();
    expect(selIdx('ivaSeat')).toEqual([0]);
    expect(selIdx('subpart')).toEqual([]);
    expect(selIdx('connector')).toEqual([]);
    expect(selIdx('kitten')).toEqual([]);
    expect(selIdx('collider')).toEqual([]);

    selectOnly('subpart', 0);
    expect(selIdx('ivaSeat')).toEqual([]);
    selectOnly('ivaSeat', 0);
    expect(selIdx('subpart')).toEqual([]);
    selectOnly('collider', 0);
    expect(selIdx('ivaSeat')).toEqual([]);
    selectOnly('ivaSeat', 0);
    expect(selIdx('collider')).toEqual([]);
    selectOnly('kitten', 0);
    expect(selIdx('ivaSeat')).toEqual([]);
    selectOnly('ivaSeat', 0);
    expect(selIdx('kitten')).toEqual([]);
    selectOnly('connector', 0);
    expect(selIdx('ivaSeat')).toEqual([]);
  });

  it('aimIvaSeat writes the rotation only and is undoable', () => {
    addIvaSeat(AIMED);
    aimIvaSeat(0, { x: 0, y: 0, z: Math.PI / 2 });
    expect($part.get().ivaSeats[0].rotation).toEqual({ x: 0, y: 0, z: Math.PI / 2 });
    expect($part.get().ivaSeats[0].position).toEqual(AIMED.position);
    undo();
    expect($part.get().ivaSeats[0].rotation).toEqual(AIMED.rotation);
  });

  it('updateIvaSeatTransform is streaming — the caller’s pushUndo bounds it', () => {
    addIvaSeat();
    pushUndo('move');
    updateIvaSeatTransform(0, { ...AIMED, position: { x: 1, y: 2, z: 3 } });
    updateIvaSeatTransform(0, { ...AIMED, position: { x: 4, y: 5, z: 6 } });
    expect($part.get().ivaSeats[0].position).toEqual({ x: 4, y: 5, z: 6 });
    undo(); // one step for the whole drag
    expect($part.get().ivaSeats[0].position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('updateIvaSeatTransforms writes several seats in one update, scale still pinned', () => {
    addIvaSeat();
    addIvaSeat();
    pushUndo('move');
    updateIvaSeatTransforms([
      { index: 0, transform: { ...AIMED, scale: { x: 9, y: 9, z: 9 } } },
      { index: 1, transform: { ...AIMED, position: { x: 1, y: 1, z: 1 } } },
    ]);
    const seats = $part.get().ivaSeats;
    expect(seats.map((s) => s.position)).toEqual([AIMED.position, { x: 1, y: 1, z: 1 }]);
    expect(seats.every((s) => s.scale.x === 1 && s.scale.y === 1 && s.scale.z === 1)).toBe(true);
    undo();
    expect($part.get().ivaSeats.every((s) => s.position.x === 0)).toBe(true);
  });

  it('a scale-mode gizmo drag on a seat is a no-op (assignIvaSeat pins the scale)', () => {
    addIvaSeat(AIMED);
    updateSelectedTransform({ ...AIMED, scale: { x: 5, y: 5, z: 5 } });
    expect($part.get().ivaSeats[0].scale).toEqual({ x: 1, y: 1, z: 1 });
    // …but position + rotation from the same write still land.
    expect($part.get().ivaSeats[0].rotation).toEqual(AIMED.rotation);
    updateSelectedTransforms([
      { kind: 'ivaSeat', id: '_seat1', transform: { ...AIMED, scale: { x: 2, y: 7, z: 3 } } },
    ]);
    expect($part.get().ivaSeats[0].scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('moveIvaSeat reorders the cycle order, follows the selection, and is undoable', () => {
    addIvaSeat({ ...AIMED, position: { x: 1, y: 0, z: 0 } });
    addIvaSeat({ ...AIMED, position: { x: 2, y: 0, z: 0 } });
    addIvaSeat({ ...AIMED, position: { x: 3, y: 0, z: 0 } });
    selectOnly('ivaSeat', 2);
    moveIvaSeat(2, -2); // last seat becomes the DEFAULT seat (the one IVA opens on)
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat3', '_seat1', '_seat2']);
    expect(selIdx('ivaSeat')).toEqual([0]);
    undo();
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2', '_seat3']);

    moveIvaSeat(0, 1);
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat2', '_seat1', '_seat3']);
  });

  it('moveIvaSeat clamps at both ends and is a no-op at the boundary', () => {
    addIvaSeat();
    addIvaSeat();
    addIvaSeat();
    const before = $part.get();

    moveIvaSeat(0, -1); // already first
    expect($part.get()).toBe(before);
    moveIvaSeat(2, +1); // already last
    expect($part.get()).toBe(before);
    moveIvaSeat(9, -1); // no such seat
    expect($part.get()).toBe(before);
    expect($canUndo.get()).toBe(true); // …only the three adds are on the stack

    moveIvaSeat(2, -99); // clamped to index 0
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat3', '_seat1', '_seat2']);
    moveIvaSeat(0, +99); // clamped to the last index
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2', '_seat3']);
  });

  it('removeIvaSeat drops one by index, shifting the selection, and is undoable', () => {
    addIvaSeat({ ...AIMED, position: { x: 1, y: 0, z: 0 } });
    addIvaSeat({ ...AIMED, position: { x: 2, y: 0, z: 0 } });
    selectOnly('ivaSeat', 1);
    removeIvaSeat(0);
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat2']);
    expect(selIdx('ivaSeat')).toEqual([0]);
    undo();
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2']);
  });

  it('duplicate / delete / copy-paste all cover seats in one undo step, with fresh ids', () => {
    addIvaSeat(AIMED);
    duplicateSelected();
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2']);
    // The copy is a real copy of the geometry, on the seats layer, at the END of the cycle —
    // offset one nudge step (default 0.1 m on Y) so it is never invisibly stacked (P5B.02).
    expect($part.get().ivaSeats[1].position).toEqual({
      ...AIMED.position,
      y: AIMED.position.y + 0.1,
    });
    expect($part.get().ivaSeats[1].layerId).toBe(IVA_SEAT_LAYER_ID);
    expect(selIdx('ivaSeat')).toEqual([1]);
    undo();
    expect($part.get().ivaSeats).toHaveLength(1);

    selectOnly('ivaSeat', 0);
    expect(copySelected()).toBe(1);
    expect(pasteClipboard()).toBe(1);
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat2']);
    expect($part.get().ivaSeats[1].position).toEqual(AIMED.position);
    undo(); // paste
    expect($part.get().ivaSeats).toHaveLength(1);

    selectOnly('ivaSeat', 0);
    removeSelected();
    expect($part.get().ivaSeats).toHaveLength(0);
    undo();
    expect($part.get().ivaSeats).toHaveLength(1);
  });

  it('removeSelected deletes seats alongside the other kinds in one undo step', () => {
    addSubPart('Core.A');
    addIvaSeat();
    addIvaSeat();
    selectAcross([0], [], [], [], [0, 1]);
    removeSelected();
    expect($part.get().ivaSeats).toHaveLength(0);
    expect($part.get().placements).toHaveLength(0);
    undo();
    expect($part.get().ivaSeats).toHaveLength(2);
    expect($part.get().placements).toHaveLength(1);
  });

  it('toggleEntity adds/removes a seat without clearing the other kinds', () => {
    addSubPart('Core.A');
    addIvaSeat();
    addIvaSeat();
    selectOnly('subpart', 0);
    toggleAt('ivaSeat', 1);
    expect(selIdx('subpart')).toEqual([0]);
    expect(selIdx('ivaSeat')).toEqual([1]);
    toggleAt('ivaSeat', 1);
    expect(selIdx('ivaSeat')).toEqual([]);
  });

  it('addKittenAtSeat places a kitten at the seat, facing the seat, undoably', () => {
    // Aimed along +X: forward (1,0,0) ⇒ the kitten (which faces its local −Z) yaws −90°.
    addIvaSeat({ ...AIMED, rotation: { x: 0, y: 0, z: 0 } });
    addKittenAtSeat(0);
    const kittens = $part.get().kittens;
    expect(kittens).toHaveLength(1);
    expect(kittens[0].layerId).toBe(KITTEN_LAYER_ID);
    expect(kittens[0].position).toEqual(AIMED.position);
    expect(kittens[0].rotation.x).toBe(0);
    expect(kittens[0].rotation.z).toBe(0);
    expect(kittens[0].rotation.y).toBeCloseTo(-Math.PI / 2, 12);
    expect(kittens[0].scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(primaryIdx('kitten')).toBe(0);
    undo();
    expect($part.get().kittens).toHaveLength(0);
    redo();
    expect($part.get().kittens).toHaveLength(1);
  });

  it('addKittenAtSeat takes the seat’s YAW only — a kitten is never tilted', () => {
    // Pitched down 30° and rolled: only the heading of the forward axis survives.
    addIvaSeat({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0.7, y: Math.PI / 6, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    addKittenAtSeat(0);
    const { forward } = seatAxesFromRotation($part.get().ivaSeats[0].rotation);
    const kitten = $part.get().kittens[0];
    expect(kitten.rotation.x).toBe(0);
    expect(kitten.rotation.z).toBe(0);
    expect(kitten.rotation.y).toBeCloseTo(Math.atan2(-forward.x, -forward.z), 12);
  });

  it('addKittenAtSeat on a seat that does not exist is a no-op', () => {
    const before = $part.get();
    addKittenAtSeat(0);
    expect($part.get()).toBe(before);
    expect($canUndo.get()).toBe(false);
  });

  it('scaleEverything scales a seat’s position and leaves its rotation and scale alone', () => {
    addIvaSeat({
      position: { x: 1, y: -2, z: 3 },
      rotation: { x: 0, y: 0.5, z: 0 },
      scale: AIMED.scale,
    });
    scaleEverything({ x: 2, y: 2, z: 2 });
    const seat = $part.get().ivaSeats[0];
    expect(seat.position).toEqual({ x: 2, y: -4, z: 6 });
    expect(seat.rotation).toEqual({ x: 0, y: 0.5, z: 0 });
    expect(seat.scale).toEqual({ x: 1, y: 1, z: 1 });
  });
});

describe('applyActionChain', () => {
  /** A {@link PlacementTransform} from three terse triples (rotation in radians). */
  const xf = (
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ): PlacementTransform => ({
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    scale: { x: scale[0], y: scale[1], z: scale[2] },
  });

  const seedEntry = (id: string, t: PlacementTransform): ChainCommitEntry => ({
    seedInstanceId: id,
    transform: t,
    isSeed: true,
  });
  const cloneEntry = (id: string, t: PlacementTransform): ChainCommitEntry => ({
    seedInstanceId: id,
    transform: t,
    isSeed: false,
  });

  const STRUTS_LAYER_ID = 'lay_struts';

  /** Seeds the document directly (the chain engine's input is always live `$part` state). */
  function setPlacements(
    entries: { id: string; template?: string; layer?: string; transform?: PlacementTransform }[],
  ): void {
    const base = createEmptyPart();
    $part.set({
      ...base,
      layers: [...base.layers, { id: STRUTS_LAYER_ID, name: 'Struts' }],
      placements: entries.map((e) => ({
        instanceId: e.id,
        subPartTemplateId: e.template ?? 'Core.Bolt',
        layerId: e.layer ?? DEFAULT_LAYER_ID,
        ...(e.transform ?? xf([0, 0, 0])),
      })),
    });
  }

  it('moves seed placements in place as one undoable step (no new placements)', () => {
    setPlacements([{ id: 'bolt_1' }, { id: 'bolt_2' }]);

    const created = applyActionChain(
      [
        seedEntry('bolt_1', xf([1, 2, 3], [0, Math.PI / 2, 0], [2, 2, 2])),
        seedEntry('bolt_2', xf([-1, 0, 0])),
      ],
      '2 transformed',
    );

    expect(created).toBe(0);
    const p = $part.get().placements;
    expect(p.length).toBe(2);
    expect(p[0].instanceId).toBe('bolt_1'); // identity untouched
    expect(p[0].position).toEqual({ x: 1, y: 2, z: 3 });
    expect(p[0].rotation).toEqual({ x: 0, y: Math.PI / 2, z: 0 });
    expect(p[0].scale).toEqual({ x: 2, y: 2, z: 2 });
    expect(p[1].position).toEqual({ x: -1, y: 0, z: 0 });

    expect($canUndo.get()).toBe(true);
    undo();
    const restored = $part.get().placements;
    expect(restored[0].position).toEqual({ x: 0, y: 0, z: 0 });
    expect(restored[0].scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(restored[1].position).toEqual({ x: 0, y: 0, z: 0 });
    expect($canUndo.get()).toBe(false);

    redo();
    expect($part.get().placements[0].position).toEqual({ x: 1, y: 2, z: 3 });
    expect($part.get().placements[1].position).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('appends clones that inherit their seed’s template and layer, with the entry transforms', () => {
    const struts = STRUTS_LAYER_ID;
    setPlacements([{ id: 'bolt_1', template: 'Core.Bolt', layer: struts }]);

    const created = applyActionChain(
      [
        seedEntry('bolt_1', xf([0, 0, 0])),
        cloneEntry('bolt_1', xf([2, 0, 0], [0.25, 0, 0])),
        cloneEntry('bolt_1', xf([4, 0, 0], [0.5, 0, 0], [1, 3, 1])),
      ],
      '+2 SubParts',
    );

    expect(created).toBe(2);
    const p = $part.get().placements;
    expect(p.length).toBe(3);
    expect(p.map((x) => x.subPartTemplateId)).toEqual(['Core.Bolt', 'Core.Bolt', 'Core.Bolt']);
    expect(p.map((x) => x.layerId)).toEqual([struts, struts, struts]);
    expect(p[1].position).toEqual({ x: 2, y: 0, z: 0 });
    expect(p[1].rotation).toEqual({ x: 0.25, y: 0, z: 0 });
    expect(p[2].position).toEqual({ x: 4, y: 0, z: 0 });
    expect(p[2].scale).toEqual({ x: 1, y: 3, z: 1 });
    expect(p.map((x) => x.instanceId)).toEqual(['bolt_1', 'bolt_2', 'bolt_3']);
  });

  it('skips instance ids the naive count+1 formula would collide with', () => {
    // `a_2` was deleted at some point: count is 2, so count+1 = `a_3` — already taken.
    setPlacements([
      { id: 'a_1', template: 'Core.A' },
      { id: 'a_3', template: 'Core.A' },
    ]);

    applyActionChain(
      [
        seedEntry('a_1', xf([0, 0, 0])),
        cloneEntry('a_1', xf([1, 0, 0])),
        cloneEntry('a_1', xf([2, 0, 0])),
      ],
      '+2 SubParts',
    );

    expect($part.get().placements.map((p) => p.instanceId)).toEqual(['a_1', 'a_3', 'a_4', 'a_5']);
  });

  it('selects the seeds followed by the new copies, in that order', () => {
    setPlacements([{ id: 'bolt_1' }, { id: 'bolt_2' }, { id: 'bolt_3' }]);

    applyActionChain(
      [
        seedEntry('bolt_1', xf([0, 0, 0])),
        seedEntry('bolt_3', xf([0, 1, 0])),
        cloneEntry('bolt_1', xf([2, 0, 0])),
        cloneEntry('bolt_3', xf([2, 1, 0])),
      ],
      '+2 SubParts',
    );

    expect(selIdx('subpart')).toEqual([0, 2, 3, 4]);
  });

  it('returns -1 without mutating or pushing undo when a seed no longer exists', () => {
    setPlacements([{ id: 'bolt_1' }]);
    const before = structuredClone($part.get());

    const created = applyActionChain(
      [seedEntry('bolt_1', xf([1, 0, 0])), cloneEntry('gone_9', xf([2, 0, 0]))],
      '+1 SubParts',
    );

    expect(created).toBe(-1);
    expect($part.get()).toEqual(before);
    expect($canUndo.get()).toBe(false);
    expect(applyActionChain([], 'nothing')).toBe(-1);
    expect($canUndo.get()).toBe(false);
  });

  it('labels the undo entry “action chain” and carries the caller’s detail', () => {
    setPlacements([{ id: 'bolt_1' }]);

    applyActionChain(
      [seedEntry('bolt_1', xf([0, 0, 0])), cloneEntry('bolt_1', xf([3, 0, 0]))],
      '+1 SubParts',
    );

    expect($undoDescription.get()).toBe('action chain');
    const entry = $historyList.get().find((h) => h.stepsFromCurrent === -1);
    expect(entry).toEqual({
      description: 'action chain',
      detail: '+1 SubParts',
      stepsFromCurrent: -1,
    });
  });

  it('round-trips a mixed commit (seeds moved + clones appended) through one undo', () => {
    setPlacements([
      { id: 'bolt_1', transform: xf([0, 0, 0]) },
      { id: 'bolt_2', transform: xf([0, 1, 0]) },
    ]);

    const created = applyActionChain(
      [
        seedEntry('bolt_1', xf([5, 0, 0])),
        seedEntry('bolt_2', xf([5, 1, 0])),
        cloneEntry('bolt_1', xf([6, 0, 0])),
        cloneEntry('bolt_2', xf([6, 1, 0])),
        cloneEntry('bolt_1', xf([7, 0, 0])),
        cloneEntry('bolt_2', xf([7, 1, 0])),
      ],
      '+4 SubParts',
    );

    expect(created).toBe(4);
    expect($part.get().placements.length).toBe(6);
    expect($part.get().placements.map((p) => p.position.x)).toEqual([5, 5, 6, 6, 7, 7]);

    undo();
    const after = $part.get().placements;
    expect(after.length).toBe(2);
    expect(after.map((p) => p.instanceId)).toEqual(['bolt_1', 'bolt_2']);
    expect(after.map((p) => p.position.x)).toEqual([0, 0]);

    redo();
    expect($part.get().placements.length).toBe(6);
    expect($part.get().placements.map((p) => p.position.x)).toEqual([5, 5, 6, 6, 7, 7]);
  });
});

/**
 * Select ▸ All and Select ▸ Invert — the two Select-menu actions with no v1 backing
 * (design: foundation §3 Select). Both sweep every selectable kind at once, both are
 * bounded by the same eligibility rule (listed + unlocked layers), and neither touches
 * the document, so neither may ever push an undo step.
 */
describe('stable-id selection', () => {
  const sub = (id: string): SelectionRef => ({ kind: 'subpart', id });

  it('survives a delete + undo without ever aliasing a different entity (census pain 14)', () => {
    addSubPart('Core.A'); // a_1
    addSubPart('Core.B'); // b_1
    addSubPart('Core.C'); // c_1
    const ids = $part.get().placements.map((p) => p.instanceId);
    expect(ids).toEqual(['a_1', 'b_1', 'c_1']);

    select([sub('c_1')]);
    // Deleting an EARLIER row shifts every later index down — v1 remapped by hand here.
    removePlacement(0);
    expect($selection.get()).toEqual([sub('c_1')]);
    expect(selIdx('subpart')).toEqual([1]); // resolved fresh, not remembered

    // The v1 bug: undo restored 3 placements, clampSelection let index 2 stand, and the
    // selection silently pointed at whatever now sat there.
    undo();
    expect($part.get().placements.map((p) => p.instanceId)).toEqual(['a_1', 'b_1', 'c_1']);
    expect($selection.get()).toEqual([sub('c_1')]);
    expect(selIdx('subpart')).toEqual([2]);
  });

  it('drops refs whose entity is gone, and only those', () => {
    addSubPart('Core.A');
    addSubPart('Core.B');
    select([sub('a_1'), sub('b_1')]);
    removePlacement(0);
    expect($selection.get()).toEqual([sub('b_1')]);
  });

  it('refuses to select an entity that does not exist', () => {
    addSubPart('Core.A');
    select([sub('a_1'), sub('ghost_9')]);
    expect($selection.get()).toEqual([sub('a_1')]);
  });

  it('toggleRef appends (primary = last) and removes, leaving the other kinds intact', () => {
    addSubPart('Core.A');
    addSubPart('Core.B');
    addConnector();
    select([sub('a_1')]);

    toggleRef({ kind: 'connector', id: '_connector1' });
    toggleRef(sub('b_1'));
    expect($selection.get()).toEqual([
      sub('a_1'),
      { kind: 'connector', id: '_connector1' },
      sub('b_1'),
    ]);
    expect($selection.get().at(-1)).toEqual(sub('b_1')); // primary = last

    toggleRef({ kind: 'connector', id: '_connector1' });
    expect($selection.get()).toEqual([sub('a_1'), sub('b_1')]);
  });

  it('select({additive}) never duplicates a ref and keeps first-occurrence order', () => {
    addSubPart('Core.A');
    addSubPart('Core.B');
    select([sub('a_1'), sub('b_1'), sub('a_1')]);
    expect($selection.get()).toEqual([sub('a_1'), sub('b_1')]);

    select([sub('a_1')], { additive: true });
    expect($selection.get()).toEqual([sub('a_1'), sub('b_1')]);
  });

  it('deselectLayer prunes every kind in ONE filter', () => {
    addSubPart('Core.A');
    addConnector();
    addCollider('Box');
    addIvaSeat();
    addLight(null);
    addKitten('hunter');
    selectLayerEntities(DEFAULT_LAYER_ID);
    const kept = $selection.get().length;
    expect(kept).toBe(4); // SubPart + connector + collider + light live on Default

    deselectLayer(DEFAULT_LAYER_ID);
    expect($selection.get()).toEqual([]);

    // …and the pinned layers prune independently.
    selectLayerEntities(KITTEN_LAYER_ID);
    expect($selection.get()).toEqual([{ kind: 'kitten', id: 'kitten_1' }]);
    deselectLayer(KITTEN_LAYER_ID);
    expect($selection.get()).toEqual([]);
  });

  it('moveIvaSeat keeps the selected seat selected across a reorder — no remap code', () => {
    addIvaSeat();
    addIvaSeat();
    addIvaSeat();
    select([{ kind: 'ivaSeat', id: '_seat3' }]);
    moveIvaSeat(2, -1);
    expect($part.get().ivaSeats.map((s) => s.id)).toEqual(['_seat1', '_seat3', '_seat2']);
    expect($selection.get()).toEqual([{ kind: 'ivaSeat', id: '_seat3' }]);
    expect(selIdx('ivaSeat')).toEqual([1]); // the view follows for free
  });

  it('a single-entity delete selects the NEXT entity of that kind by id', () => {
    addSubPart('Core.A');
    addSubPart('Core.B');
    addSubPart('Core.C');
    select([sub('b_1')]);
    removeSelected();
    expect($selection.get()).toEqual([sub('c_1')]);

    // Deleting the LAST one falls back to its predecessor.
    removeSelected();
    expect($selection.get()).toEqual([sub('a_1')]);

    // Deleting the only remaining one clears.
    removeSelected();
    expect($selection.get()).toEqual([]);
  });

  it('every add* selects exactly what it added', () => {
    addSubPart('Core.A');
    expect($selection.get()).toEqual([sub('a_1')]);
    addConnector();
    expect($selection.get()).toEqual([{ kind: 'connector', id: '_connector1' }]);
    addCollider('Box');
    expect($selection.get()).toEqual([{ kind: 'collider', id: '_collider1' }]);
    addIvaSeat();
    expect($selection.get()).toEqual([{ kind: 'ivaSeat', id: '_seat1' }]);
    addLight(null);
    expect($selection.get()).toEqual([{ kind: 'light', id: '_light1' }]);
    addKitten('hunter');
    expect($selection.get()).toEqual([{ kind: 'kitten', id: 'kitten_1' }]);
  });

  it('selection is never an undo step', () => {
    addSubPart('Core.A');
    addConnector();
    const canUndo = $canUndo.get();
    const description = $undoDescription.get();
    select([sub('a_1')]);
    toggleRef({ kind: 'connector', id: '_connector1' });
    clearSelection();
    selectLayerEntities(DEFAULT_LAYER_ID);
    expect($canUndo.get()).toBe(canUndo);
    expect($undoDescription.get()).toBe(description);
  });
});

describe('by-id transform write-back', () => {
  it('addresses a kitten and a light selected TOGETHER without the v1 index-order trap', () => {
    addKitten('hunter'); // kitten_1 at index 0
    addLight(null); // _light1 at index 0 — the same index, different list
    select([
      { kind: 'kitten', id: 'kitten_1' },
      { kind: 'light', id: '_light1' },
    ]);
    const t = (x: number) => ({
      position: { x, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 9, y: 9, z: 9 },
    });
    updateSelectedTransforms([
      { kind: 'kitten', id: 'kitten_1', transform: t(1) },
      { kind: 'light', id: '_light1', transform: t(2) },
    ]);
    expect($part.get().kittens[0].position.x).toBe(1);
    expect($part.get().lights[0].position.x).toBe(2);
    // Normalization is untouched: a light's scale stays pinned, a kitten's does not.
    expect($part.get().lights[0].scale).toEqual({ x: 1, y: 1, z: 1 });
    expect($part.get().kittens[0].scale).toEqual({ x: 9, y: 9, z: 9 });
  });

  it('skips an update whose entity is gone instead of writing to a neighbor', () => {
    addSubPart('Core.A');
    addSubPart('Core.B');
    updateSelectedTransforms([
      {
        kind: 'subpart',
        id: 'ghost_1',
        transform: {
          position: { x: 5, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
    ]);
    expect($part.get().placements.every((p) => p.position.x === 0)).toBe(true);
  });

  it('selectedTransformRefs flattens in KIND_ORDER regardless of selection order, carrying ids', () => {
    addLight(null);
    addSubPart('Core.A');
    addConnector();
    select([
      { kind: 'light', id: '_light1' },
      { kind: 'connector', id: '_connector1' },
      { kind: 'subpart', id: 'a_1' },
    ]);
    expect(selectedTransformRefs().map((r) => [r.kind, r.id, r.index])).toEqual([
      ['subpart', 'a_1', 0],
      ['connector', '_connector1', 0],
      ['light', '_light1', 0],
    ]);
  });

  it('updateSelectedTransform routes through the PRIMARY ref (last selected)', () => {
    addSubPart('Core.A');
    addKitten('hunter');
    select([
      { kind: 'subpart', id: 'a_1' },
      { kind: 'kitten', id: 'kitten_1' },
    ]);
    updateSelectedTransform({
      position: { x: 4, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    expect($part.get().kittens[0].position.x).toBe(4);
    expect($part.get().placements[0].position.x).toBe(0);
  });
});

describe('clipboard v2 — lights, cut, duplicate offset', () => {
  // The nudge posture is a PERSISTED global (`flexo:*`) and the duplicate offset reads it,
  // so every case pins it explicitly instead of inheriting a neighbor's edit.
  beforeEach(() => {
    $nudgeAxis.set('y');
    $nudgeStep.set(0.1);
  });

  it('copies and pastes a part-level light with a fresh id, keeping its SOURCE layer', () => {
    const lamps = createLayer('Lamps'); // becomes active
    addLight(null);
    setLightPosition(0, { x: 1, y: 2, z: 3 });
    select([{ kind: 'light', id: '_light1' }]);

    expect(copySelected()).toBe(1);
    expect($clipboard.get()?.lights).toHaveLength(1);
    setActiveLayer(DEFAULT_LAYER_ID); // the paste follows the SOURCE, not the active layer
    expect(pasteClipboard()).toBe(1);

    const lights = $part.get().lights;
    expect(lights).toHaveLength(2);
    expect(lights[1].id).not.toBe(lights[0].id);
    expect(lights[1].position).toEqual({ x: 1, y: 2, z: 3 });
    expect(lights[1].layerId).toBe(lamps);
    expect($selection.get()).toEqual([{ kind: 'light', id: lights[1].id }]);
    undo();
    expect($part.get().lights).toHaveLength(1);
  });

  // The clipboard outlives the layer it was copied from, so a paste is the second way a
  // light could end up with a layerId nothing lists.
  it('pastes a light onto the ACTIVE layer when its source layer is gone', () => {
    const lamps = createLayer('Lamps'); // becomes active
    addLight(null);
    select([{ kind: 'light', id: '_light1' }]);
    copySelected();

    const spare = createLayer('Spare'); // becomes active
    deleteLayer(lamps, { mode: 'delete-items' }); // takes the copied light's layer with it
    expect($part.get().lights).toHaveLength(0);

    expect(pasteClipboard()).toBe(1);
    expect($part.get().lights[0].layerId).toBe(spare);
    undo();
    expect($part.get().lights).toHaveLength(0);
  });

  it('keeps a template-owned light owned by the same template on paste', () => {
    addSubPart('Core.A');
    addLight('Core.A');
    select([{ kind: 'light', id: '_light1' }]);
    copySelected();
    pasteClipboard();

    const lights = $part.get().lights;
    expect(lights).toHaveLength(2);
    expect(lights[1].ownerTemplateId).toBe('Core.A');
  });

  it('cutSelected copies then deletes in ONE undo step', () => {
    addSubPart('Core.A');
    addLight(null);
    select([
      { kind: 'subpart', id: 'a_1' },
      { kind: 'light', id: '_light1' },
    ]);

    expect(cutSelected()).toBe(2);
    expect($part.get().placements).toHaveLength(0);
    expect($part.get().lights).toHaveLength(0);
    expect($undoDescription.get()).toContain('cut');

    undo();
    expect($part.get().placements).toHaveLength(1);
    expect($part.get().lights).toHaveLength(1);
    // The clipboard survives the undo — cut then undo then paste is legal.
    expect($clipboard.get()?.placements).toHaveLength(1);
    expect($clipboard.get()?.lights).toHaveLength(1);
  });

  it('cutSelected is a no-op with an empty selection', () => {
    addSubPart('Core.A');
    clearSelection();
    expect(cutSelected()).toBe(0);
    // No new undo step — the top of the stack is still the add.
    expect($undoDescription.get()).toContain('add');
    expect($part.get().placements).toHaveLength(1);
  });

  it('duplicateSelected offsets copies by the nudge step on the nudge axis', () => {
    $nudgeAxis.set('y');
    $nudgeStep.set(0.25);
    addSubPart('Core.A');
    select([{ kind: 'subpart', id: 'a_1' }]);

    duplicateSelected();

    const placements = $part.get().placements;
    expect(placements).toHaveLength(2);
    expect(placements[1].position).toEqual({ x: 0, y: 0.25, z: 0 });
  });

  it('duplicateSelected({offset:false}) lands the copy exactly on its source (⌥-drag)', () => {
    $nudgeAxis.set('y');
    $nudgeStep.set(0.25);
    addSubPart('Core.A');
    select([{ kind: 'subpart', id: 'a_1' }]);

    duplicateSelected({ offset: false });

    expect($part.get().placements[1].position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('offsets every kind, including a duplicated light and collider', () => {
    $nudgeAxis.set('x');
    $nudgeStep.set(1);
    addSubPart('Core.A');
    addCollider('Box');
    addLight(null);
    select([
      { kind: 'collider', id: '_collider1' },
      { kind: 'light', id: '_light1' },
    ]);

    duplicateSelected();

    const part = $part.get();
    expect(part.colliders[1].position.x).toBe(1);
    expect(part.lights[1].position.x).toBe(1);
  });

  it('duplicatePlacement offsets the row-menu copy too', () => {
    $nudgeAxis.set('z');
    $nudgeStep.set(0.5);
    addSubPart('Core.A');
    duplicatePlacement(0);
    expect($part.get().placements[1].position).toEqual({ x: 0, y: 0, z: 0.5 });
  });
});

describe('$gizmoSpace', () => {
  it('defaults to world and toggles', () => {
    expect($gizmoSpace.get()).toBe('world');
    toggleGizmoSpace();
    expect($gizmoSpace.get()).toBe('local');
    toggleGizmoSpace();
    expect($gizmoSpace.get()).toBe('world');
  });
});

// ---------------------------------------------------------------------------
// Data mode's two new document mutations (P6.03) + the D17 hatch↔seat link.
// ---------------------------------------------------------------------------

describe('setExtraDiameters (D3 — additional size classes)', () => {
  it('round-trips the list and pushes NO undo step of its own (streaming)', () => {
    const before = $historyList.get().length;
    setExtraDiameters([1.25, 2.5]);
    expect($part.get().gameData.extraDiametersM).toEqual([1.25, 2.5]);
    expect($historyList.get().length).toBe(before);

    // Copies, never aliases: mutating the caller's array must not reach the document.
    const source = [3];
    setExtraDiameters(source);
    source.push(99);
    expect($part.get().gameData.extraDiametersM).toEqual([3]);
  });
});

describe('removeAllTemplateData', () => {
  it('erases the template SubPartGameData + its lights in ONE undo step', () => {
    addSubPart('Core.Tank');
    const template = $part.get().placements[0].subPartTemplateId;
    addTank(template);
    addSubPartSolarPanel(template);
    addLight(template);
    addLight(null); // a part-level light must survive
    const before = $historyList.get().length;

    removeAllTemplateData(template);

    expect($part.get().subPartGameData).toEqual([]);
    expect($part.get().lights.map((l) => l.ownerTemplateId)).toEqual([null]);
    expect($historyList.get().length).toBe(before + 1);

    undo();
    const restored = $part.get();
    expect(restored.subPartGameData[0].tanks.length).toBe(1);
    expect(restored.subPartGameData[0].solarPanels.length).toBe(1);
    expect(restored.lights.filter((l) => l.ownerTemplateId === template).length).toBe(1);
  });

  it('is a no-op (no undo step) for a template with nothing authored', () => {
    addSubPart('Core.Tank');
    const before = $historyList.get().length;
    removeAllTemplateData($part.get().placements[0].subPartTemplateId);
    expect($historyList.get().length).toBe(before);
  });
});

describe('updateTank advanced fields (D3)', () => {
  it('round-trips roleAffinity and locationAsmb through the existing patch action', () => {
    addTank(null);
    updateTank(null, 0, { roleAffinity: 'Engine', locationAsmb: { x: 0, y: 1.5, z: -0.25 } });
    const tank = $part.get().gameData.tanks[0];
    expect(tank.roleAffinity).toBe('Engine');
    expect(tank.locationAsmb).toEqual({ x: 0, y: 1.5, z: -0.25 });
  });
});

describe('setEvaDoorSeat (D17)', () => {
  it('authors BOTH halves of the link in one undo step', () => {
    addIvaSeat();
    setEvaDoorEnabled(true);
    const before = $historyList.get().length;

    setEvaDoorSeat(0);

    const part = $part.get();
    const seatId = part.ivaSeats[0].ksaId;
    expect(seatId).toBeTruthy();
    expect(part.gameData.evaDoor?.seatId).toBe(seatId);
    expect($historyList.get().length).toBe(before + 1);

    undo();
    expect($part.get().ivaSeats[0].ksaId).toBe(null);
    expect($part.get().gameData.evaDoor?.seatId).toBe(null);
  });

  it('keeps an id the seat already carries, and dodges the shared component-id namespace', () => {
    addIvaSeat();
    addIvaSeat();
    addTank(null);
    updateTank(null, 0, { id: 'seat_2' }); // a tank squatting on the obvious name
    setEvaDoorEnabled(true);

    setEvaDoorSeat(1);
    expect($part.get().ivaSeats[1].ksaId).toBe('seat_3');

    // Re-picking the same seat reuses its id rather than minting another.
    setEvaDoorSeat(0);
    setEvaDoorSeat(1);
    expect($part.get().ivaSeats[1].ksaId).toBe('seat_3');
  });

  it('clears the link with null (the attribute is then omitted)', () => {
    addIvaSeat();
    setEvaDoorEnabled(true);
    setEvaDoorSeat(0);
    setEvaDoorSeat(null);
    expect($part.get().gameData.evaDoor?.seatId).toBe(null);
    // The seat KEEPS its authored id — it is real game data, not a side effect of the link.
    expect($part.get().ivaSeats[0].ksaId).toBeTruthy();
  });
});

// ── P7.02 — the define-new composites + module duplicate + plume entries ─────

describe('editorStore — engine define-new composites', () => {
  const TMPL = 'Core.Subpart.Thruster';

  beforeEach(() => {
    $part.set(createEmptyPart());
    importHistory({ undo: [], redo: [] });
    addSubPart(TMPL);
    importHistory({ undo: [], redo: [] });
  });

  const instanceId = () => $part.get().placements[0].instanceId;
  const spd = () => $part.get().subPartGameData.find((s) => s.subPartTemplateId === TMPL) ?? null;

  it('addRcsEngine authors a Service-plumbed chamber, an RCS controller and the RCS tag', () => {
    addRcsEngine(TMPL, instanceId());
    const s = spd()!;
    expect(s.combustors).toHaveLength(1);
    expect(s.combustors[0].plumbing).toBe('Service');
    expect(s.nozzles).toHaveLength(1);
    expect(s.rockets[0].core.id).toBe(s.combustors[0].id);
    const controller = $part.get().gameData.rocketControllers[0];
    expect(controller.kind).toBe('thruster');
    expect(controller.rocketRefs[0].subPartInstanceId).toBe(instanceId());
    expect($part.get().editorTags).toContain('RCS');
  });

  it('addRcsEngine targets the PART itself when given no template (the MMU pattern)', () => {
    addRcsEngine(null, null);
    expect(spd()).toBeNull();
    const g = $part.get().gameData;
    expect(g.combustors[0].plumbing).toBe('Service');
    expect(g.nozzles).toHaveLength(1);
    expect(g.rockets).toHaveLength(1);
  });

  it('addSolidEngine yields real solid hardware and an ALL-SOLID rocket', () => {
    addSolidEngine(TMPL, instanceId());
    const s = spd()!;
    expect(s.solidMotors).toHaveLength(1);
    expect(s.solidGrainSegments).toHaveLength(1);
    expect(s.solidNozzles).toHaveLength(1);
    // The motor feeds from its own grain — an empty list is the silent-no-thrust failure.
    expect(s.solidMotors[0].feeds).toEqual([
      { kind: 'container', containerId: s.solidGrainSegments[0].id, subPartInstanceId: null },
    ]);
    expect(s.rockets[0].core.id).toBe(s.solidMotors[0].id);
    expect(s.rockets[0].nozzles.map((n) => n.id)).toEqual([s.solidNozzles[0].id]);
    // No liquid nozzle anywhere: RocketTemplate.Create throws on a mixed rocket.
    expect(s.nozzles).toHaveLength(0);
  });

  it('addSolidEngine passes validateEngines with APCP in the index', () => {
    addSolidEngine(TMPL, instanceId());
    const reactions = new Map([
      [
        'APCP',
        {
          kind: 'Fixed' as const,
          id: 'APCP',
          name: 'APCP',
          category: 'Solid' as const,
          reactants: [],
          lut: { rows: [] },
          burnRate: { coefficientMPerS: 0.0045, exponent: 0.35 },
          minimumBurnPressurePa: 1.5e6,
          maxStablePressurePa: 1.5e7,
          exhaustCondensedFraction: 0.337,
        },
      ],
    ]);
    const blockers = validateEngines($part.get(), reactions).filter((i) => i.severity === 'block');
    expect(blockers).toEqual([]);
  });

  it.each([
    ['addRcsEngine', () => addRcsEngine(TMPL, instanceId())],
    ['addSolidEngine', () => addSolidEngine(TMPL, instanceId())],
  ])('%s is exactly ONE undo step that removes everything it created', (_label, run) => {
    const before = $part.get();
    run();
    expect($part.get()).not.toBe(before);
    undo();
    expect($part.get().subPartGameData).toEqual(before.subPartGameData);
    expect($part.get().gameData.rocketControllers).toEqual([]);
    expect($part.get().editorTags).toEqual(before.editorTags);
  });
});

describe('editorStore — duplicateEngineModule', () => {
  const TMPL = 'Core.Subpart.Chamber';

  beforeEach(() => {
    $part.set(createEmptyPart());
    importHistory({ undo: [], redo: [] });
    addSubPart(TMPL);
    addCombustor(TMPL);
    importHistory({ undo: [], redo: [] });
  });

  const spd = () => $part.get().subPartGameData.find((s) => s.subPartTemplateId === TMPL)!;

  it('clones a SubPart-scope module under a fresh id, as one undo step', () => {
    const original = spd().combustors[0];
    duplicateEngineModule({ group: 'combustor', scope: 'sub', index: 0 }, TMPL);
    const list = spd().combustors;
    expect(list).toHaveLength(2);
    expect(list[1].id).not.toBe(original.id);
    expect({ ...list[1], id: original.id }).toEqual(original);
    undo();
    expect(spd().combustors).toHaveLength(1);
  });

  it('re-ids against the SHARED core namespace so a solid motor cannot collide', () => {
    addSubPartSolidMotor(TMPL);
    const motorId = spd().solidMotors[0].id;
    duplicateEngineModule({ group: 'solidMotor', scope: 'sub', index: 0 }, TMPL);
    const ids = [...spd().combustors, ...spd().solidMotors].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(spd().solidMotors[1].id).not.toBe(motorId);
  });

  it('clones part-level controllers and custom propellants', () => {
    addRocketController('engine');
    duplicateEngineModule({ group: 'controller', scope: 'part', index: 0 }, null);
    expect($part.get().gameData.rocketControllers).toHaveLength(2);

    addCustomReaction({
      id: 'MyFuel',
      name: 'My Fuel',
      category: 'Monopropellant',
      reactants: [],
      lut: [],
      burnRate: null,
      minimumBurnPressurePa: null,
      maxStablePressurePa: null,
      exhaustCondensedFraction: null,
    });
    duplicateEngineModule({ group: 'propellant', scope: 'part', index: 0 }, null);
    expect($part.get().customReactions.map((r) => r.id)).toEqual(['MyFuel', 'MyFuel2']);
  });

  it('is a no-op for wiring and gimbal rows (both are keyed to something unique)', () => {
    addConsumerFeedWiring('x', null);
    const before = $part.get();
    duplicateEngineModule({ group: 'wiring', scope: 'part', index: 0 }, null);
    duplicateEngineModule({ group: 'gimbal', scope: 'part', index: 0 }, null);
    expect($part.get()).toBe(before);
  });

  it('ignores an out-of-range index', () => {
    const before = $part.get();
    duplicateEngineModule({ group: 'combustor', scope: 'sub', index: 7 }, TMPL);
    expect($part.get()).toBe(before);
  });
});

describe('editorStore — updateReactionPlumes', () => {
  const TMPL = 'Core.Subpart.Bell';

  it('replaces the whole entry list in one undo step, at both scopes', () => {
    $part.set(createEmptyPart());
    importHistory({ undo: [], redo: [] });
    addSubPart(TMPL);
    addNozzle(TMPL);
    addPartNozzle();
    importHistory({ undo: [], redo: [] });

    const entries = [
      {
        reactionId: null,
        isDefault: true,
        volumetricExhaustId: 'EngineALarge',
        plumeTrailId: null,
      },
      {
        reactionId: 'APCP',
        isDefault: false,
        volumetricExhaustId: null,
        plumeTrailId: 'DefaultPlumeTrail',
      },
    ];
    updateReactionPlumes({ templateId: TMPL, kind: 'delaval', index: 0 }, entries);
    const spd = () => $part.get().subPartGameData.find((s) => s.subPartTemplateId === TMPL)!;
    expect(spd().nozzles[0].reactionPlumes).toEqual(entries);
    expect($historyList.get().filter((h) => h.stepsFromCurrent < 0)).toHaveLength(1);

    updateReactionPlumes({ templateId: null, kind: 'delaval', index: 0 }, entries);
    expect($part.get().gameData.nozzles[0].reactionPlumes).toEqual(entries);
    expect($historyList.get().filter((h) => h.stepsFromCurrent < 0)).toHaveLength(2);

    undo();
    expect($part.get().gameData.nozzles[0].reactionPlumes).toEqual([]);
  });

  it('no-ops on a stale index', () => {
    $part.set(createEmptyPart());
    const before = $part.get();
    updateReactionPlumes({ templateId: null, kind: 'solid', index: 3 }, []);
    updateReactionPlumes({ templateId: 'nope', kind: 'delaval', index: 0 }, []);
    expect($part.get()).toBe(before);
  });
});

describe('importProjectData (archive merge)', () => {
  /** An archive-shaped part entry: a primitive mesh + its texture, with the backing table. */
  function archiveEntry() {
    const source = createEmptyPart();
    source.layers.push({ id: 'layer1', name: 'Hull' });
    source.customTextures.push({
      id: 'tex_1',
      name: 'Panel',
      width: 8,
      height: 8,
      channel: 'baseColor',
    });
    source.customMeshes.push({
      id: 'mesh_1',
      name: 'Box',
      subPartId: 'flexo_Box_src',
      primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
      faceTextures: {
        right: { textureId: 'tex_1', uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } },
      },
    });
    source.placements.push({
      instanceId: 'box_1',
      subPartTemplateId: 'flexo_Box_src',
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: 'layer1',
    });
    const json = serializeProjectJson(
      buildProjectExport(
        [
          {
            name: 'Part 1',
            visible: true,
            opacity: 1,
            offset: { x: 0, y: 0, z: 0 },
            includeInExport: true,
            part: source,
          },
        ],
        'Arch',
        { includeBinaryBacked: true },
      ),
    );
    const parsed = parseProjectImport(json, {
      binaryAssets: [
        { kind: 'tex-src', id: 'tex_1' },
        { kind: 'mesh-glb', id: 'mesh_1' },
      ],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    // The merge primitive takes ONE part entry (v11 envelopes are multi-part).
    return parsed.env.parts[0];
  }

  it('is exactly ONE undo step, adopted binaries included', () => {
    $part.set(createEmptyPart());
    importHistory({ undo: [], redo: [] });
    const before = $part.get();

    importProjectData(archiveEntry(), {
      adoption: {
        textures: new Map([['tex_1', 'tex_new']]),
        copiedTextures: new Map([['tex_1', 'tex_new']]),
        meshes: new Map([['mesh_1', 'mesh_new']]),
        imports: new Map(),
        hashes: new Map(),
      },
    });
    expect($part.get().customMeshes).toHaveLength(1);
    expect($part.get().customTextures.map((t) => t.id)).toEqual(['tex_new']);
    expect($part.get().placements).toHaveLength(1);
    expect($historyList.get().filter((h) => h.stepsFromCurrent < 0)).toHaveLength(1);

    // ONE ⌘Z removes everything the import added — descriptors included. (The BYTES stay in
    // the asset DB: undo restores descriptors, never binaries — unchanged contract.)
    undo();
    expect($part.get()).toEqual(before);
  });

  it('adopts nothing binary without a plan, but still rebuilds the primitive', () => {
    $part.set(createEmptyPart());
    importHistory({ undo: [], redo: [] });
    importProjectData(archiveEntry());
    const part = $part.get();
    // A primitive needs no bytes (it regenerates from its PrimitiveSpec), so it merges under
    // a self-minted id; the TEXTURE is pixels and cannot, so it does not.
    expect(part.customMeshes).toHaveLength(1);
    expect(part.customMeshes[0].id).not.toBe('mesh_1');
    expect(part.customTextures).toEqual([]);
    expect(part.customMeshes[0].faceTextures).toEqual({});
    expect(part.placements).toHaveLength(1);
  });
});

/**
 * The stacks belong to the DOCUMENT, so a part switch parks them with it and hands the
 * incoming part its own (`plans/MULTI_PART_PLAN.md` P1.04/P1.05) — which is what makes
 * `MAX_UNDO` a per-part cap rather than a project-wide one.
 */
describe('per-part undo history', () => {
  it('part switch parks and restores history stacks losslessly', () => {
    initPartsForNewProject();
    const first = $activePartId.get();
    addSubPart('Core.A');
    addSubPart('Core.B');
    undo(); // leave BOTH stacks loaded — a pending redo has to survive the trip too
    const firstHistory = exportHistory();
    expect(firstHistory.undo).toHaveLength(1);
    expect(firstHistory.redo).toHaveLength(1);

    const second = createPart();
    expect(exportHistory()).toEqual({ undo: [], redo: [] });
    addSubPart('Core.C');
    const secondHistory = exportHistory();

    // Round-trip twice: the stacks come back byte-for-byte, in both directions.
    expect(switchPart(first)).toBe(true);
    expect(exportHistory()).toEqual(firstHistory);
    expect(switchPart(second)).toBe(true);
    expect(exportHistory()).toEqual(secondHistory);
    expect(switchPart(first)).toBe(true);
    expect(exportHistory()).toEqual(firstHistory);
  });
});

/**
 * Copy in part A → paste in part B is the ONE deliberate cross-part conduit (D5). What makes
 * it need its own rule is I3: layer ids are minted sequentially per part (`layer1`, `layer2`,
 * …), so part B routinely owns an UNRELATED layer under the source layer's id and honouring
 * that match would silently file the paste under a stranger's grouping.
 */
describe('cross-part clipboard paste', () => {
  /** How many undo steps the editor is holding — the "exactly one step" assertions read this. */
  const undoDepth = () => $historyList.get().filter((item) => item.stepsFromCurrent < 0).length;

  beforeEach(() => {
    newPart();
    $layerView.set({});
    initPartsForNewProject();
  });

  it('re-homes onto the ACTIVE layer when the destination part reuses the source layer id', () => {
    const sourceLayer = createLayer('Struts'); // becomes active
    addSubPart('Core.A');
    select([{ kind: 'subpart', id: 'a_1' }]);
    expect(copySelected()).toBe(1);
    expect($part.get().placements[0].layerId).toBe(sourceLayer);

    createPart();
    // Part B's first user layer gets the SAME sequential id — a completely unrelated layer.
    const collision = createLayer('Tanks');
    expect(collision).toBe(sourceLayer);
    const target = createLayer('Landing gear'); // becomes active
    expect($activeLayerId.get()).toBe(target);

    const before = undoDepth();
    expect(pasteClipboard()).toBe(1);
    expect($part.get().placements[0].layerId).toBe(target);
    // The colliding layer is untouched — nothing was filed under it, and no mirror layer was
    // invented for the source (that is project import's job, not paste's).
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      IVA_SEAT_LAYER_ID,
      KITTEN_LAYER_ID,
      collision,
      target,
    ]);

    expect($undoDescription.get()).toBe('paste');
    expect(undoDepth()).toBe(before + 1);
    undo();
    expect($part.get().placements).toHaveLength(0);
  });

  it('still keeps the source layer when the paste lands back in the SAME part', () => {
    const sourceLayer = createLayer('Struts'); // becomes active
    addSubPart('Core.A');
    select([{ kind: 'subpart', id: 'a_1' }]);
    copySelected();

    const other = createLayer('Elsewhere'); // becomes active
    expect($activeLayerId.get()).toBe(other);

    const before = undoDepth();
    expect(pasteClipboard()).toBe(1);
    expect($part.get().placements[1].layerId).toBe(sourceLayer);

    expect(undoDepth()).toBe(before + 1);
    undo();
    expect($part.get().placements).toHaveLength(1);
  });

  it('sends a cross-part paste to Default when the destination active layer is a pinned one', () => {
    addSubPart('Core.A');
    select([{ kind: 'subpart', id: 'a_1' }]);
    copySelected();

    createPart();
    // The pinned entity-only layers can be made active, but nothing ordinary may land there.
    setActiveLayer(KITTEN_LAYER_ID);
    expect(pasteClipboard()).toBe(1);
    expect($part.get().placements[0].layerId).toBe(DEFAULT_LAYER_ID);
  });

  it('keeps the pinned kinds on their built-in layers across parts', () => {
    addIvaSeat();
    addKitten('hunter');
    select([
      { kind: 'ivaSeat', id: '_seat1' },
      { kind: 'kitten', id: 'kitten_1' },
    ]);
    expect(copySelected()).toBe(2);

    createPart();
    createLayer('Anything'); // becomes active — pinned kinds must ignore it
    expect(pasteClipboard()).toBe(2);
    expect($part.get().ivaSeats[0].layerId).toBe(IVA_SEAT_LAYER_ID);
    expect($part.get().kittens[0].layerId).toBe(KITTEN_LAYER_ID);
  });
});

// ---------------------------------------------------------------------------
// Engine wizard commit (plans/ENGINE_WIZARD_PLAN.md §5.7 / W4.3).
// ---------------------------------------------------------------------------

describe('applyEngineWizard', () => {
  it('commits a wholly-built document in exactly ONE undo step', () => {
    addSubPart('Core.Existing');
    const before = structuredClone($part.get());
    const historyBefore = $historyList.get().length;

    // Stand-in for what `buildWizardPart` returns: several entity kinds at once, which is
    // the whole point — a per-mutator route would have pushed one undo step for each.
    const built = structuredClone(before);
    built.customMeshes.push({
      id: 'mesh_wiz',
      name: 'Bell',
      subPartId: 'flexo_Bell_wiz',
      primitive: { kind: 'box', params: { width: 1.2, height: 1.2, depth: 1.2 } },
      faceTextures: {},
    });
    built.placements.push({
      instanceId: 'flexo_bell_wiz_1',
      subPartTemplateId: 'flexo_Bell_wiz',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: DEFAULT_LAYER_ID,
    });
    built.connectors.push({
      id: '_connector1',
      position: { x: 3.1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      flags: [],
      capabilities: [],
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
    });
    built.editorTags.push('Engines');
    built.gameData.customMass = 500;

    applyEngineWizard(built, 'liquid · flexo_Bell_wiz');

    expect($historyList.get().length).toBe(historyBefore + 1);
    expect($historyList.get().find((h) => h.stepsFromCurrent === -1)?.detail).toBe(
      'liquid · flexo_Bell_wiz',
    );
    expect($part.get().customMeshes).toHaveLength(1);
    expect($part.get().editorTags).toContain('Engines');

    undo();
    expect($part.get()).toEqual(before);

    redo();
    expect($part.get()).toEqual(built);
  });
});
