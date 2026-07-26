import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'

// The model-import undo test drives customAssetStore, which persists the import GLB in
// IndexedDB and resolves its geometry through a blob: URL — neither exists in happy-dom.
// Both are stubbed with the same contract; the document mutation is what's under test.
vi.mock('./assetDb', () => {
  const store = new Map<string, Blob>()
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
      store.set(key, data instanceof Blob ? data : new Blob([data.slice()], { type }))
    },
    deleteAsset: async (key: string) => {
      store.delete(key)
    },
  }
})
vi.mock('../three/importedMeshCache', () => {
  const urls = new Map<string, string>()
  return {
    registerImportAtlas: (importId: string) => {
      const url = `blob:import/${importId}`
      urls.set(importId, url)
      return url
    },
    importAtlasUrl: (importId: string) => urls.get(importId) ?? null,
    ensureImportAtlas: async (importId: string) => urls.get(importId) ?? null,
    getImportedGeometry: async () => new THREE.BufferGeometry(),
    getImportedRawGeometry: async () => null,
    releaseImportAtlas: (importId: string) => urls.delete(importId),
    clearImportAtlases: () => urls.clear(),
  }
})
// The import creates real textures (decode → KTX2), but happy-dom has no working 2D canvas.
// Stub the DECODE only; the KTX2 encode underneath stays real.
vi.mock('../ktx/decodeImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ktx/decodeImage')>()
  const base = { width: 2, height: 2, rgba: new Uint8Array(16).fill(200) }
  return {
    ...actual,
    decodeImage: async () => ({ width: 2, height: 2, levels: actual.buildMipChain(base) }),
  }
})
// Loading a .ktx2 needs a WebGLRenderer to pick a transcode target — hand back plain textures.
vi.mock('../three/TextureCache', async () => {
  const THREE = await import('three')
  return {
    loadTexture: async () => new THREE.Texture(),
    loadWrappedTexture: async () => new THREE.Texture(),
  }
})
import { previewOverrideMatrix } from '../ksa/animationRig'
import {
  $part,
  $activeLayerId,
  $selectedIndex,
  $selectedIndices,
  $selectedConnectorIndex,
  $selectedConnectorIndices,
  $selectedKittenIndex,
  $selectedKittenIndices,
  $selectedColliderIndex,
  $selectedColliderIndices,
  $canUndo,
  addCollider,
  removeCollider,
  selectCollider,
  selectPlacement,
  setColliderOwner,
  setColliderShape,
  setColliderSize,
  copySelected,
  pasteClipboard,
  addCombustor,
  addConnector,
  addConsumerFeedWiring,
  addKitten,
  addLight,
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
  renameLayer,
  reorderLayers,
  selectLayerEntities,
  setActiveLayer,
  setEditorTags,
  setPartId,
  setSelection,
  setSelectedPlacements,
  toggleEntity,
  updateSelectedTransforms,
  duplicatePlacement,
  duplicateSelected,
  movePlacementToLayer,
  moveSelectedPlacementsToLayer,
  pushUndo,
  removeSelected,
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
} from './editorStore'
import {
  COLLIDER_LAYER_ID,
  CONNECTOR_LAYER_ID,
  DEFAULT_LAYER_ID,
  KITTEN_LAYER_ID,
  createCombustor,
  createEmptyPart,
  createSolidMotor,
  createSubPartGameData,
} from '../ksa/types'
import type { ConnectorCapability, PartCollider, Transform } from '../ksa/types'
import type { ImportedGameData } from './editorStore'
import {
  importModelAsMeshes,
  removeImport,
  replaceImport,
  setMeshTransparent,
} from './customAssetStore'
import { analyzeImport, DEFAULT_IMPORT_OPTIONS } from '../ksa/importPlan'
import { normalizeImport, type NormalizedImport } from '../ksa/importNormalize'
import type { ImportMaterialPlan } from '../ksa/importMaterials'

/** An {@link ImportedGameData} with every list empty — spread and override what a test needs. */
function emptyImportedGameData(): ImportedGameData {
  return {
    decoupler: null,
    dockingPort: null,
    evaDoor: null,
    diameterM: null,
    extraDiametersM: [],
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
  }
}

beforeEach(() => {
  newPart()
})

describe('editorStore', () => {
  it('adds SubParts with sequential lowercased instance ids and selects the last', () => {
    addSubPart('CoreStructuralA_Subpart_TrussBarA')
    addSubPart('CoreStructuralA_Subpart_TrussBarA')
    const ids = $part.get().placements.map((p) => p.instanceId)
    expect(ids).toEqual([
      'corestructurala_subpart_trussbara_1',
      'corestructurala_subpart_trussbara_2',
    ])
    expect($selectedIndex.get()).toBe(1)
  })

  it('uses the last dot-segment for the instance base name', () => {
    addSubPart('Core.Screw.A')
    expect($part.get().placements[0].instanceId).toBe('a_1')
  })

  it('duplicates the selected placement with its transform and a new id', () => {
    addSubPart('Core.Bolt')
    updatePlacementTransform(0, {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })
    duplicateSelected()
    const p = $part.get().placements
    expect(p.length).toBe(2)
    expect(p[1].instanceId).toBe('bolt_2')
    expect(p[1].position).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('removes the selected placement and clamps selection', () => {
    addSubPart('Core.A')
    addSubPart('Core.B')
    removeSelected()
    expect($part.get().placements.map((p) => p.instanceId)).toEqual(['a_1'])
    expect($selectedIndex.get()).toBe(0)
  })

  it('supports undo/redo of additions', () => {
    addSubPart('Core.A')
    addSubPart('Core.B')
    expect($canUndo.get()).toBe(true)
    undo()
    expect($part.get().placements.map((p) => p.instanceId)).toEqual(['a_1'])
    redo()
    expect($part.get().placements.map((p) => p.instanceId)).toEqual(['a_1', 'b_1'])
  })

  it('adds connectors with sequential _connectorN ids and selects the connector', () => {
    addConnector()
    addConnector()
    expect($part.get().connectors.map((c) => c.id)).toEqual(['_connector1', '_connector2'])
    expect($selectedConnectorIndex.get()).toBe(1)
    expect($selectedIndex.get()).toBe(-1)
  })

  it('keeps SubPart and connector selection mutually exclusive', () => {
    addSubPart('Core.A')
    expect($selectedIndex.get()).toBe(0)
    addConnector()
    expect($selectedIndex.get()).toBe(-1)
    expect($selectedConnectorIndex.get()).toBe(0)
  })

  it('removeSelected deletes the selected connector', () => {
    addConnector()
    addConnector()
    removeSelected()
    expect($part.get().connectors.map((c) => c.id)).toEqual(['_connector1'])
    expect($selectedConnectorIndex.get()).toBe(0)
  })

  it('reuses the next free connector id after deletion', () => {
    addConnector() // _connector1
    addConnector() // _connector2
    removeSelected() // removes _connector2 (selected)
    addConnector() // max existing is 1 -> _connector2
    expect($part.get().connectors.map((c) => c.id)).toEqual(['_connector1', '_connector2'])
  })

  it('sets connector flags (multi) with undo support', () => {
    addConnector()
    setConnectorFlags(0, ['Internal', 'ToSurface'])
    expect($part.get().connectors[0].flags).toEqual(['Internal', 'ToSurface'])
    undo()
    expect($part.get().connectors[0].flags).toEqual([])
  })

  it('addPart imports connector flags and unions editor tags into the project', () => {
    setEditorTags(['Existing'])
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
    )
    expect($part.get().connectors[0].flags).toEqual(['ToSurface'])
    // 'Existing' kept, 'Electrical' added, no duplicate.
    expect($part.get().editorTags).toEqual(['Existing', 'Electrical'])
  })

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
      },
    )
    const dp = $part.get().gameData.dockingPort
    // Values carried in, and the binding points at the regenerated connector id (not '_connector5').
    expect(dp?.latchingKineticEnergyJ).toBe(6000)
    expect(dp?.pushoffImpulseNs).toBe(7000)
    expect(dp?.connectorId).toBe($part.get().connectors[0].id)
    expect(dp?.connectorId).not.toBe('_connector5')
  })

  it('addPart rewrites <ConnectorRef>s inside preserved raw XML onto the regenerated connector ids', () => {
    addConnector() // occupies _connector1, forcing the imported connectors to renumber
    const conn = (id: string) => ({
      id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      flags: [],
      capabilities: [],
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
    })
    addPart([], [conn('_connector19'), conn('_connector41')], [], undefined, undefined, {
      decoupler: null,
      dockingPort: null,
      evaDoor: null,
      diameterM: null,
      extraDiametersM: [],
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
    })
    const part = $part.get()
    // _connector19/_connector41 were regenerated to _connector2/_connector3…
    expect(part.connectors.map((c) => c.id)).toEqual(['_connector1', '_connector2', '_connector3'])
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
    ])
  })

  it('addPart remaps every feed + capability reference onto the regenerated ids', () => {
    addConnector() // occupies _connector1, forcing the imported connectors to renumber
    const conn = (id: string, capabilities: ConnectorCapability[] = []) => ({
      id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      flags: [],
      capabilities,
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
    })
    const CHAMBER_TMPL = 'Core.ThrustChamberMesh'
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
    )
    const part = $part.get()
    const newInstanceId = part.placements[0].instanceId
    expect(part.connectors.map((c) => c.id)).toEqual(['_connector1', '_connector2', '_connector3'])
    expect(newInstanceId).not.toBe('CorePropulsionA_Subpart_EngineAMedBoostAssembly1')

    // <Capabilities> rides through addPart (without BulkFluid the tank path is dead).
    expect(part.connectors.map((c) => c.capabilities)).toEqual([
      [],
      ['BulkFluid'],
      ['SolidMotorCase'],
    ])
    // Every connector feed points at the REGENERATED id, never the source-space one.
    expect(part.gameData.combustors[0].feeds).toEqual([
      { kind: 'connector', connectorId: '_connector2' },
      { kind: 'container', containerId: 'Grain', subPartInstanceId: newInstanceId },
    ])
    expect(part.gameData.solidMotors[0].feeds).toEqual([
      { kind: 'connector', connectorId: '_connector3' },
    ])
    // The wiring entry's placement scope AND its feed point are both remapped.
    expect(part.gameData.consumerFeedWiring).toEqual([
      {
        consumerId: 'ThrustChamber',
        subPartInstanceId: newInstanceId,
        feeds: [{ kind: 'connector', connectorId: '_connector2' }],
      },
    ])
    const spd = part.subPartGameData.find((s) => s.subPartTemplateId === CHAMBER_TMPL)!
    expect(spd.combustors[0].feeds).toEqual([{ kind: 'parent' }]) // nothing to remap
    expect(spd.solidMotors[0].feeds).toEqual([{ kind: 'connector', connectorId: '_connector3' }])
  })

  it('records undo for the plumbing mutations (capabilities, feeds, plumbing, wiring)', () => {
    addConnector()
    setConnectorCapabilities(0, ['BulkFluid'])
    expect($part.get().connectors[0].capabilities).toEqual(['BulkFluid'])
    undo()
    expect($part.get().connectors[0].capabilities).toEqual([])

    addPartCombustor()
    const combustor = () => $part.get().gameData.combustors[0]
    setPartCombustorPlumbing(0, 'Service')
    expect(combustor().plumbing).toBe('Service')
    setPartCombustorFeeds(0, [{ kind: 'connector', connectorId: '_connector1' }])
    expect(combustor().feeds).toEqual([{ kind: 'connector', connectorId: '_connector1' }])
    undo() // feeds
    expect(combustor().feeds).toEqual([{ kind: 'parent' }])
    undo() // plumbing
    expect(combustor().plumbing).toBe('Bulk')

    addConsumerFeedWiring('ThrustChamber', 'chamber_1')
    expect($part.get().gameData.consumerFeedWiring).toHaveLength(1)
    setConsumerFeedWiringFeeds(0, [{ kind: 'connector', connectorId: '_connector1' }])
    expect($part.get().gameData.consumerFeedWiring[0].feeds).toHaveLength(1)
    undo() // feeds
    expect($part.get().gameData.consumerFeedWiring[0].feeds).toEqual([])
    undo() // add
    expect($part.get().gameData.consumerFeedWiring).toEqual([])
  })

  it('auto-wires only SubPart consumers that defer to the parent and lack an entry', () => {
    const TMPL = 'Core.ThrustChamberMesh'
    addSubPart(TMPL)
    addSubPart(TMPL) // same template placed twice ⇒ two distinct wiring targets
    addCombustor(TMPL)
    const instanceIds = $part.get().placements.map((p) => p.instanceId)
    const chamberId = $part.get().subPartGameData[0].combustors[0].id

    autoWireUnwiredConsumers()
    expect($part.get().gameData.consumerFeedWiring).toEqual([
      { consumerId: chamberId, subPartInstanceId: instanceIds[0], feeds: [] },
      { consumerId: chamberId, subPartInstanceId: instanceIds[1], feeds: [] },
    ])

    // Idempotent: everything is wired now, so a second run is a no-op (and no undo step).
    const before = $canUndo.get()
    autoWireUnwiredConsumers()
    expect($part.get().gameData.consumerFeedWiring).toHaveLength(2)
    expect($canUndo.get()).toBe(before)

    undo()
    expect($part.get().gameData.consumerFeedWiring).toEqual([])

    // A consumer with a concrete feed (not Parent) never needs wiring.
    setCombustorFeeds(TMPL, 0, [
      { kind: 'container', containerId: 'Fuel', subPartInstanceId: null },
    ])
    autoWireUnwiredConsumers()
    expect($part.get().gameData.consumerFeedWiring).toEqual([])
  })

  it('adds/removes tanks per SubPart template as discrete undo steps and patches fields (streaming)', () => {
    const tmpl = 'CoreFuelTankA_Subpart_Skin1W1HA'
    addTank(tmpl)
    const spd = () => $part.get().subPartGameData.find((s) => s.subPartTemplateId === tmpl)
    expect(spd()?.tanks.length).toBe(1)
    setTankShape(tmpl, 0, 'Spherical')
    expect(spd()?.tanks[0].shape).toBe('Spherical')
    // updateTank is streaming (no internal undo) — emulate the field focus push.
    pushUndo('edit tank')
    updateTank(tmpl, 0, { outerRadiusM: 1.5 })
    expect(spd()?.tanks[0].outerRadiusM).toBe(1.5)
    undo() // undo the radius edit
    expect(spd()?.tanks[0].outerRadiusM).toBe(0.5)
    undo() // undo the shape change
    expect(spd()?.tanks[0].shape).toBe('Cylindrical')
    removeTank(tmpl, 0)
    expect(spd()).toBeUndefined() // entry pruned when tanks empty
    undo()
    expect(spd()?.tanks.length).toBe(1)
  })

  it('adds a light per SubPart template, seeded or default, as one discrete undo step', () => {
    const tmpl = 'CoreElectricalA_Subpart_SpotlightA'
    const lights = () =>
      $part.get().subPartGameData.find((s) => s.subPartTemplateId === tmpl)?.lights ?? []

    addLight(tmpl)
    expect(lights()[0].type).toBe('Spot')
    expect(lights()[0].color).toEqual({ r: 1, g: 1, b: 1 })

    // The glow panel's "Add matching light": KSA's <Emissive> can only add WHITE, so a coloured
    // <Light> is the only way a part reads as a coloured lamp in-game.
    addLight(tmpl, { type: 'Point', color: { r: 0, g: 1, b: 0 } })
    expect(lights()).toHaveLength(2)
    expect(lights()[1].type).toBe('Point')
    expect(lights()[1].color).toEqual({ r: 0, g: 1, b: 0 })
    // Unspecified fields still come from createLight().
    expect(lights()[1].rangeM).toBe(5)

    undo()
    expect(lights()).toHaveLength(1)
  })

  it('toggles custom mass and decoupler with undo', () => {
    setCustomMassEnabled(true)
    expect($part.get().gameData.customMass).toBe(100)
    undo()
    expect($part.get().gameData.customMass).toBeNull()

    setDecouplerEnabled(true)
    expect($part.get().gameData.decoupler).not.toBeNull()
    pushUndo('edit decoupler')
    setDecouplerForce(900)
    expect($part.get().gameData.decoupler?.force).toBe(900)
    undo()
    expect($part.get().gameData.decoupler?.force).toBe(500)
  })

  it('toggles a docking port (KSA defaults) and edits its energy/impulse with undo', () => {
    setDockingPortEnabled(true)
    expect($part.get().gameData.dockingPort).toEqual({
      connectorId: '',
      latchingKineticEnergyJ: 50,
      pushoffImpulseNs: 5000,
    })
    pushUndo('edit docking port')
    setDockingPortLatchingKineticEnergy(8000)
    setDockingPortPushoffImpulse(9000)
    expect($part.get().gameData.dockingPort?.latchingKineticEnergyJ).toBe(8000)
    expect($part.get().gameData.dockingPort?.pushoffImpulseNs).toBe(9000)
    undo()
    expect($part.get().gameData.dockingPort?.latchingKineticEnergyJ).toBe(50)
    expect($part.get().gameData.dockingPort?.pushoffImpulseNs).toBe(5000)
  })

  it('toggles part diameter (size class) and edits it with undo', () => {
    setDiameterEnabled(true)
    expect($part.get().gameData.diameterM).toBe(1) // DEFAULT_DIAMETER_M
    pushUndo('edit diameter')
    setDiameter(2.5)
    expect($part.get().gameData.diameterM).toBe(2.5)
    undo()
    expect($part.get().gameData.diameterM).toBe(1)
    undo()
    expect($part.get().gameData.diameterM).toBeNull()
  })

  it('toggles the command-capable marker with undo', () => {
    expect($part.get().gameData.controllable).toBe(false)
    setControllable(true)
    expect($part.get().gameData.controllable).toBe(true)
    undo()
    expect($part.get().gameData.controllable).toBe(false)
  })

  it('setEditorTags is undoable (self-records)', () => {
    setEditorTags(['Electrical'])
    setEditorTags(['Electrical', 'Structural'])
    expect($part.get().editorTags).toEqual(['Electrical', 'Structural'])
    undo()
    expect($part.get().editorTags).toEqual(['Electrical'])
    undo()
    expect($part.get().editorTags).toEqual([])
  })

  it('setPartId reverts under undo when the caller pushed at interaction start', () => {
    // Mirrors PartDataButton: pushUndo() on field focus, setPartId() per keystroke.
    pushUndo('edit part ID')
    setPartId('p')
    setPartId('part_id')
    expect($part.get().partId).toBe('part_id')
    // A single undo reverts the whole typing session (only one snapshot was pushed).
    undo()
    expect($part.get().partId).toBe('fixme_part_id')
  })

  it('updatePlacementTransform does not create an undo step', () => {
    addSubPart('Core.A') // this pushes one undo snapshot (empty -> 1 placement)
    updatePlacementTransform(0, {
      position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })
    // A single undo should revert the whole add (transform update added no step).
    undo()
    expect($part.get().placements.length).toBe(0)
  })
})

describe('editorStore kittens', () => {
  it('adds a kitten on the Kittens layer with sequential ids and selects it', () => {
    addKitten('hunter')
    addKitten('polaris')
    const kittens = $part.get().kittens
    expect(kittens.map((k) => k.id)).toEqual(['kitten_1', 'kitten_2'])
    expect(kittens.map((k) => k.kind)).toEqual(['hunter', 'polaris'])
    expect(kittens.every((k) => k.layerId === KITTEN_LAYER_ID)).toBe(true)
    expect($selectedKittenIndex.get()).toBe(1)
  })

  it('selecting a kitten clears SubPart/connector selection (and vice versa)', () => {
    addSubPart('Core.A')
    addKitten('banjo')
    expect($selectedKittenIndex.get()).toBe(0)
    expect($selectedIndices.get()).toEqual([])
    expect($selectedConnectorIndex.get()).toBe(-1)
    // Selecting a SubPart clears the kitten selection.
    addSubPart('Core.B')
    expect($selectedKittenIndices.get()).toEqual([])
  })

  it('removeSelected deletes the selected kitten and is undoable', () => {
    addKitten('hunter')
    removeSelected()
    expect($part.get().kittens.length).toBe(0)
    undo()
    expect($part.get().kittens.map((k) => k.id)).toEqual(['kitten_1'])
  })

  it('duplicateSelected copies the kitten (kind + Kittens layer preserved)', () => {
    addKitten('polaris')
    duplicateSelected()
    const kittens = $part.get().kittens
    expect(kittens.length).toBe(2)
    expect(kittens[1].kind).toBe('polaris')
    expect(kittens[1].layerId).toBe(KITTEN_LAYER_ID)
    expect(kittens[1].id).toBe('kitten_2')
  })
})

describe('editorStore layers', () => {
  it('starts with built-in Default + Connectors + Colliders + Kittens layers; Default is active', () => {
    expect($part.get().layers).toEqual([
      { id: DEFAULT_LAYER_ID, name: 'Default' },
      { id: CONNECTOR_LAYER_ID, name: 'Connectors' },
      { id: COLLIDER_LAYER_ID, name: 'Colliders' },
      { id: KITTEN_LAYER_ID, name: 'Kittens' },
    ])
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID)
  })

  it('createLayer adds a layer, makes it active, and is undoable', () => {
    const id = createLayer('Engines')
    expect($part.get().layers.map((l) => l.name)).toEqual([
      'Default',
      'Connectors',
      'Colliders',
      'Kittens',
      'Engines',
    ])
    expect($activeLayerId.get()).toBe(id)
    undo()
    // Layer removed AND the active layer falls back to Default (it no longer exists).
    expect($part.get().layers.map((l) => l.name)).toEqual([
      'Default',
      'Connectors',
      'Colliders',
      'Kittens',
    ])
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID)
  })

  it('SubParts land in the active layer; connectors always in the Connectors layer', () => {
    const id = createLayer('Engines') // becomes active
    addSubPart('Core.A')
    addConnector()
    expect($part.get().placements[0].layerId).toBe(id)
    expect($part.get().connectors[0].layerId).toBe(CONNECTOR_LAYER_ID)
  })

  it('duplicate keeps the source layer (connectors stay in the Connectors layer)', () => {
    addSubPart('Core.A') // active = Default
    const engines = createLayer('Engines')
    addSubPart('Core.C') // in Engines
    duplicateSelected()
    const placements = $part.get().placements
    expect(placements[placements.length - 1].layerId).toBe(engines)

    addConnector() // in Connectors layer
    duplicateSelected()
    const connectors = $part.get().connectors
    expect(connectors[connectors.length - 1].layerId).toBe(CONNECTOR_LAYER_ID)
  })

  it('renameLayer changes the name and is undoable', () => {
    const id = createLayer('Engiens')
    renameLayer(id, 'Engines')
    expect($part.get().layers.find((l) => l.id === id)?.name).toBe('Engines')
    undo()
    expect($part.get().layers.find((l) => l.id === id)?.name).toBe('Engiens')
  })

  it('deleteLayer with delete-items removes the layer and its entities', () => {
    const id = createLayer('Scrap')
    addSubPart('Core.A') // in Scrap
    setActiveLayer(DEFAULT_LAYER_ID)
    addSubPart('Core.B') // in Default
    deleteLayer(id, { mode: 'delete-items' })
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      CONNECTOR_LAYER_ID,
      COLLIDER_LAYER_ID,
      KITTEN_LAYER_ID,
    ])
    expect($part.get().placements.map((p) => p.subPartTemplateId)).toEqual(['Core.B'])
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID)
  })

  it('deleteLayer with move-items reassigns entities to the target layer', () => {
    const a = createLayer('A')
    addSubPart('Core.A') // in A
    const b = createLayer('B')
    deleteLayer(a, { mode: 'move-items', targetLayerId: b })
    expect($part.get().placements[0].layerId).toBe(b)
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      CONNECTOR_LAYER_ID,
      COLLIDER_LAYER_ID,
      KITTEN_LAYER_ID,
      b,
    ])
  })

  it('deleteLayer is undoable (restores layer + membership)', () => {
    const id = createLayer('Scrap')
    addSubPart('Core.A')
    deleteLayer(id, { mode: 'delete-items' })
    expect($part.get().placements.length).toBe(0)
    undo()
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      CONNECTOR_LAYER_ID,
      COLLIDER_LAYER_ID,
      KITTEN_LAYER_ID,
      id,
    ])
    expect($part.get().placements[0].layerId).toBe(id)
  })

  it('refuses to delete the built-in Default, Connectors, Colliders and Kittens layers', () => {
    addSubPart('Core.A')
    addConnector()
    deleteLayer(DEFAULT_LAYER_ID, { mode: 'delete-items' })
    deleteLayer(CONNECTOR_LAYER_ID, { mode: 'delete-items' })
    deleteLayer(COLLIDER_LAYER_ID, { mode: 'delete-items' })
    deleteLayer(KITTEN_LAYER_ID, { mode: 'delete-items' })
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      CONNECTOR_LAYER_ID,
      COLLIDER_LAYER_ID,
      KITTEN_LAYER_ID,
    ])
    expect($part.get().placements.length).toBe(1)
    expect($part.get().connectors.length).toBe(1)
  })

  it('clearLayer removes a built-in layer’s items but keeps the layer (undoable)', () => {
    addConnector() // Connectors layer
    addConnector()
    addKitten('hunter') // Kittens layer
    setActiveLayer(DEFAULT_LAYER_ID)
    addSubPart('Core.A') // Default layer — must survive clearing Connectors
    clearLayer(CONNECTOR_LAYER_ID)
    expect($part.get().connectors.length).toBe(0)
    expect($part.get().kittens.length).toBe(1)
    expect($part.get().placements.length).toBe(1)
    // The layer itself is untouched.
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      CONNECTOR_LAYER_ID,
      COLLIDER_LAYER_ID,
      KITTEN_LAYER_ID,
    ])
    undo()
    expect($part.get().connectors.length).toBe(2)
  })

  it('clearLayer is a no-op for an empty layer (no undo entry)', () => {
    addSubPart('Core.A')
    const before = $canUndo.get()
    clearLayer(CONNECTOR_LAYER_ID) // no connectors exist
    expect($canUndo.get()).toBe(before)
    expect($part.get().placements.length).toBe(1)
  })

  it('reorderLayers reorders by id and is undoable', () => {
    const a = createLayer('A')
    const b = createLayer('B')
    reorderLayers([a, DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID, COLLIDER_LAYER_ID, KITTEN_LAYER_ID, b])
    expect($part.get().layers.map((l) => l.id)).toEqual([
      a,
      DEFAULT_LAYER_ID,
      CONNECTOR_LAYER_ID,
      COLLIDER_LAYER_ID,
      KITTEN_LAYER_ID,
      b,
    ])
    undo()
    expect($part.get().layers.map((l) => l.id)).toEqual([
      DEFAULT_LAYER_ID,
      CONNECTOR_LAYER_ID,
      COLLIDER_LAYER_ID,
      KITTEN_LAYER_ID,
      a,
      b,
    ])
  })

  it('selectLayerEntities prefers SubParts, else first connector', () => {
    const id = createLayer('Mixed')
    addSubPart('Core.A')
    addSubPart('Core.B')
    selectLayerEntities(id)
    expect($selectedIndices.get()).toEqual([0, 1])
    expect($selectedConnectorIndex.get()).toBe(-1)

    // Connectors live in the built-in Connectors layer; selecting it picks the connector.
    addConnector()
    selectLayerEntities(CONNECTOR_LAYER_ID)
    expect($selectedIndices.get()).toEqual([])
    expect($selectedConnectorIndex.get()).toBe($part.get().connectors.length - 1)
  })

  it('duplicatePlacement copies one row by index, keeps its layer, selects the copy, and is undoable', () => {
    addSubPart('Core.A') // active = Default
    const engines = createLayer('Engines')
    addSubPart('Core.B') // in Engines, index 1
    updatePlacementTransform(1, {
      position: { x: 4, y: 5, z: 6 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })
    duplicatePlacement(1)
    const p = $part.get().placements
    expect(p.length).toBe(3)
    expect(p[2].instanceId).toBe('b_2')
    expect(p[2].layerId).toBe(engines)
    expect(p[2].position).toEqual({ x: 4, y: 5, z: 6 })
    expect($selectedIndices.get()).toEqual([2])
    undo()
    expect($part.get().placements.length).toBe(2)
  })

  it('movePlacementToLayer refuses the Connectors and Kittens layers', () => {
    addSubPart('Core.A') // index 0, Default
    movePlacementToLayer(0, CONNECTOR_LAYER_ID)
    movePlacementToLayer(0, KITTEN_LAYER_ID)
    expect($part.get().placements[0].layerId).toBe(DEFAULT_LAYER_ID)
    // A normal layer still works.
    const engines = createLayer('Engines')
    movePlacementToLayer(0, engines)
    expect($part.get().placements[0].layerId).toBe(engines)
  })

  it('moveSelectedPlacementsToLayer refuses special layers and does NOT change the active layer', () => {
    const engines = createLayer('Engines') // active = Engines
    setActiveLayer(DEFAULT_LAYER_ID)
    addSubPart('Core.A') // index 0, Default
    addSubPart('Core.B') // index 1, Default
    setSelectedPlacements([0, 1])

    moveSelectedPlacementsToLayer(KITTEN_LAYER_ID)
    expect($part.get().placements.every((p) => p.layerId === DEFAULT_LAYER_ID)).toBe(true)

    moveSelectedPlacementsToLayer(engines)
    expect($part.get().placements.every((p) => p.layerId === engines)).toBe(true)
    // The active layer is unchanged (selection spans layers; no forced snap).
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID)
  })

  it('setSelection allows a selection that spans SubParts, connectors, and kittens', () => {
    addSubPart('Core.A')
    addConnector()
    addKitten('hunter')
    setSelection([0], [0], [0])
    expect($selectedIndices.get()).toEqual([0])
    expect($selectedConnectorIndices.get()).toEqual([0])
    expect($selectedKittenIndices.get()).toEqual([0])
  })

  it('toggleEntity adds/removes one kind without clearing the others', () => {
    addSubPart('Core.A')
    addConnector()
    setSelection([0], [], [])
    toggleEntity('connector', 0)
    expect($selectedIndices.get()).toEqual([0]) // SubPart kept
    expect($selectedConnectorIndices.get()).toEqual([0]) // connector added
    toggleEntity('connector', 0)
    expect($selectedIndices.get()).toEqual([0])
    expect($selectedConnectorIndices.get()).toEqual([]) // connector removed
  })

  it('removeSelected deletes a mixed selection in one undo step', () => {
    addSubPart('Core.A')
    addSubPart('Core.B')
    addConnector()
    addKitten('hunter')
    setSelection([0, 1], [0], [0])
    removeSelected()
    expect($part.get().placements.length).toBe(0)
    expect($part.get().connectors.length).toBe(0)
    expect($part.get().kittens.length).toBe(0)
    undo() // a single step restores all three kinds
    expect($part.get().placements.length).toBe(2)
    expect($part.get().connectors.length).toBe(1)
    expect($part.get().kittens.length).toBe(1)
  })

  it('duplicateSelected copies every kind in a mixed selection and selects the copies', () => {
    addSubPart('Core.A')
    addConnector()
    addKitten('hunter')
    setSelection([0], [0], [0])
    duplicateSelected()
    expect($part.get().placements.length).toBe(2)
    expect($part.get().connectors.length).toBe(2)
    expect($part.get().kittens.length).toBe(2)
    expect($selectedIndices.get()).toEqual([1])
    expect($selectedConnectorIndices.get()).toEqual([1])
    expect($selectedKittenIndices.get()).toEqual([1])
  })

  it('updateSelectedTransforms writes transforms across kinds in one store update', () => {
    addSubPart('Core.A')
    addConnector()
    addKitten('hunter')
    const t = (x: number) => ({
      position: { x, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })
    updateSelectedTransforms([
      { kind: 'subpart', index: 0, transform: t(1) },
      { kind: 'connector', index: 0, transform: t(2) },
      { kind: 'kitten', index: 0, transform: t(3) },
    ])
    expect($part.get().placements[0].position.x).toBe(1)
    expect($part.get().connectors[0].position.x).toBe(2)
    expect($part.get().kittens[0].position.x).toBe(3)
  })

  it('selectLayerEntities selects all kittens on the Kittens layer', () => {
    addKitten('hunter')
    addKitten('polaris')
    selectLayerEntities(KITTEN_LAYER_ID)
    expect($selectedKittenIndices.get()).toEqual([0, 1])
  })

  it('addPart returns the target layer and selects exactly the imported SubParts', () => {
    addSubPart('Core.Existing') // pre-existing placement 0 on Default
    const engines = createLayer('Engines')
    const mk = (id: string) => ({
      instanceId: id,
      subPartTemplateId: id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: DEFAULT_LAYER_ID,
    })
    const layerId = addPart([mk('Core.A'), mk('Core.B')], [], [], engines)
    expect(layerId).toBe(engines)
    expect($part.get().placements.length).toBe(3)
    // Selection is exactly the two imported parts (indices 1 & 2), not the pre-existing one.
    expect([...$selectedIndices.get()].sort((a, b) => a - b)).toEqual([1, 2])
    expect($part.get().placements[1].layerId).toBe(engines)
  })
})

describe('scaleEverything', () => {
  const tf = (
    pos: [number, number, number],
    rot: [number, number, number],
    scale: [number, number, number],
  ): Transform => ({
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    scale: { x: scale[0], y: scale[1], z: scale[2] },
  })

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
          layerId: CONNECTOR_LAYER_ID,
          ...tf([1, 1, 1], [0, 0, 0], [1, 1, 1]),
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
    })

    scaleEverything({ x: 2, y: 3, z: 0.5 })

    const p = $part.get()
    expect(p.placements[0].position).toEqual({ x: 4, y: 12, z: 4 })
    expect(p.placements[0].scale).toEqual({ x: 2, y: 6, z: 2 })
    expect(p.placements[0].rotation).toEqual({ x: 0.1, y: 0.2, z: 0.3 }) // unchanged
    expect(p.connectors[0].position).toEqual({ x: 2, y: 3, z: 0.5 })
    expect(p.kittens[0].position).toEqual({ x: 6, y: 0, z: 0 })
    expect(p.kittens[0].scale).toEqual({ x: 4, y: 6, z: 1 })

    const a = p.animations[0]
    expect(a.durationSec).toBe(2) // timing untouched
    expect(a.keyframes[1].timeSec).toBe(1) // untouched
    // Joint poses are interior rig nodes: only the TRANSLATION scales; rotation
    // AND pose-scale stay put (scaling pose-scale double-scales the joint chain).
    expect(a.keyframes[1].poses.j1.position).toEqual({ x: 10, y: 18, z: 3.5 })
    expect(a.keyframes[1].poses.j1.scale).toEqual({ x: 3, y: 1, z: 1 }) // unchanged
    expect(a.keyframes[1].poses.j1.rotation).toEqual({ x: 0.5, y: 0, z: 0 }) // unchanged
  })

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
    }
    $part.set(part)

    const leafWorldAt = (t: number): THREE.Vector3 => {
      const cur = $part.get()
      const m = previewOverrideMatrix(cur.animations[0], 'foot_1', t, cur.placements[0])!
      return new THREE.Vector3().setFromMatrixPosition(m)
    }
    const before = [leafWorldAt(0), leafWorldAt(0.5), leafWorldAt(1)]

    const s = 2.5
    scaleEverything({ x: s, y: s, z: s })

    // Under a uniform scale about the origin, the leaf's world position at EVERY
    // time must scale by exactly s — the invariant the chain double-scaling broke.
    before.forEach((b, i) => {
      const after = leafWorldAt([0, 0.5, 1][i])
      expect(after.x).toBeCloseTo(b.x * s, 6)
      expect(after.y).toBeCloseTo(b.y * s, 6)
      expect(after.z).toBeCloseTo(b.z * s, 6)
    })
  })

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
    })

    scaleEverything({ x: 1, y: 1, z: 1 })
    expect($canUndo.get()).toBe(false)

    scaleEverything({ x: 2, y: 2, z: 2 })
    expect($part.get().placements[0].position.x).toBe(4)
    expect($canUndo.get()).toBe(true)

    undo()
    expect($part.get().placements[0].position.x).toBe(2)
  })
})

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
    }
  }

  /** A synthetic model: one object per entry, each placed `instances` times. */
  async function synthesizeModel(
    objects: { name: string; instances: number }[],
  ): Promise<NormalizedImport> {
    const material = new THREE.MeshStandardMaterial()
    material.name = 'Metal'
    const scene = new THREE.Group()
    for (const object of objects) {
      const geometry = new THREE.BoxGeometry(1, 1, 1)
      for (let i = 0; i < object.instances; i++) {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.name = object.name
        mesh.position.set(i * 2, 0, 0)
        scene.add(mesh)
      }
    }
    const plan = analyzeImport({ scene, fileName: 'pod.glb' }, DEFAULT_IMPORT_OPTIONS)
    return normalizeImport(plan, DEFAULT_IMPORT_OPTIONS)
  }

  /** Two objects, one of them placed twice → 2 SubParts, 3 placements (see importPlan). */
  async function importSyntheticModel(withMaterials = false): Promise<void> {
    const normalized = await synthesizeModel([
      { name: 'Hull', instances: 2 },
      { name: 'Nozzle', instances: 1 },
    ])
    await importModelAsMeshes(
      normalized,
      'pod.glb',
      withMaterials ? materialPlan(normalized) : undefined,
    )
  }

  it('is ONE undo step: undo removes the meshes, placements and layer; redo restores them', async () => {
    const layersBefore = $part.get().layers.length
    await importSyntheticModel()

    const imported = $part.get()
    expect(imported.customMeshes).toHaveLength(2)
    expect(imported.placements).toHaveLength(3)
    expect(imported.layers).toHaveLength(layersBefore + 1)
    const layer = imported.layers.at(-1)!
    expect(layer.name).toBe('pod')
    expect($activeLayerId.get()).toBe(layer.id)

    undo()
    const reverted = $part.get()
    expect(reverted.customMeshes).toHaveLength(0)
    expect(reverted.placements).toHaveLength(0)
    expect(reverted.layers).toHaveLength(layersBefore)
    expect(reverted.layers.some((l) => l.id === layer.id)).toBe(false)

    redo()
    const restored = $part.get()
    expect(restored.customMeshes).toHaveLength(2)
    expect(restored.customMeshes.map((m) => m.imported?.meshName)).toEqual(
      imported.customMeshes.map((m) => m.subPartId),
    )
    expect(restored.placements).toHaveLength(3)
    expect(restored.layers.some((l) => l.id === layer.id)).toBe(true)
  })

  it('stays ONE undo step with textures and materials, which normally push their own', async () => {
    // addCustomTexture/addCustomMaterial each call mutate() (one undo entry each), so an
    // import creating 2 textures + 1 material + 2 meshes + 3 placements would be SIX steps
    // without the non-mutating createTextureAsset/buildCustomMaterialDescriptor split.
    await importSyntheticModel(true)

    const imported = $part.get()
    expect(imported.customTextures).toHaveLength(2)
    expect(imported.customMaterials).toHaveLength(1)
    expect(imported.customMeshes).toHaveLength(2)
    expect(
      imported.customMeshes.every((m) => m.materialId === imported.customMaterials[0].id),
    ).toBe(true)
    expect(imported.customMeshes.every((m) => m.emissive?.shape === 'painted')).toBe(true)

    undo()
    const reverted = $part.get()
    expect(reverted.customTextures).toHaveLength(0)
    expect(reverted.customMaterials).toHaveLength(0)
    expect(reverted.customMeshes).toHaveLength(0)
    expect(reverted.placements).toHaveLength(0)

    redo()
    const restored = $part.get()
    expect(restored.customTextures).toHaveLength(2)
    expect(restored.customMaterials).toHaveLength(1)
    expect(restored.customMeshes).toHaveLength(2)
    expect(restored.placements).toHaveLength(3)
  })

  it('removeImport is ONE undo step: undo restores meshes, placements, materials and textures', async () => {
    const layersBefore = $part.get().layers.length
    await importSyntheticModel(true)
    const imported = $part.get()
    const importId = imported.customMeshes[0].imported!.importId

    await removeImport(importId)
    const removed = $part.get()
    expect(removed.customMeshes).toHaveLength(0)
    expect(removed.placements).toHaveLength(0)
    expect(removed.customMaterials).toHaveLength(0)
    expect(removed.customTextures).toHaveLength(0)
    expect(removed.layers).toHaveLength(layersBefore)

    // ONE undo: the meshes, their placements, the collected material/textures and the layer
    // all come back together. (Their BINARIES do not — see removeImport's contract; the
    // confirm dialog says so.)
    undo()
    const back = $part.get()
    expect(back.customMeshes).toHaveLength(2)
    expect(back.placements).toHaveLength(3)
    expect(back.customMaterials).toHaveLength(1)
    expect(back.customTextures).toHaveLength(2)
    expect(back.layers).toHaveLength(layersBefore + 1)
    expect(back.customMeshes.every((m) => m.imported?.importId === importId)).toBe(true)

    redo()
    expect($part.get().customMeshes).toHaveLength(0)
  })

  it('replaceImport is ONE undo step: undo restores the geometry, materials and placements', async () => {
    await importSyntheticModel(true)
    const before = $part.get()
    const importId = before.customMeshes[0]!.imported!.importId
    const hull = before.customMeshes[0]!
    const nozzle = before.customMeshes[1]!
    const materialId = before.customMaterials[0]!.id

    // The re-export: Hull survives, Nozzle is gone, Skirt is new — with its own material set.
    const second = await synthesizeModel([
      { name: 'Hull', instances: 2 },
      { name: 'Skirt', instances: 1 },
    ])
    await replaceImport(importId, second, { updateMaterials: true }, materialPlan(second))

    const swapped = $part.get()
    expect(swapped.customMeshes).toHaveLength(2)
    expect(swapped.customMeshes[0]!.subPartId).toBe(hull.subPartId) // identity preserved
    expect(swapped.customMeshes[0]!.imported!.importId).toBe(second.importId)
    expect(swapped.customMeshes.some((m) => m.id === nozzle.id)).toBe(false)
    expect(swapped.customMaterials.map((m) => m.id)).not.toContain(materialId)

    // ONE undo: the geometry reference, the swapped material/textures, the removed SubPart
    // and every placement come back together. (The BYTES do not — see replaceImport.)
    undo()
    const back = $part.get()
    expect(back.customMeshes.map((m) => m.id)).toEqual(before.customMeshes.map((m) => m.id))
    expect(back.customMeshes.map((m) => m.imported!.importId)).toEqual([importId, importId])
    expect(back.customMeshes.map((m) => m.imported!.meshName)).toEqual(
      before.customMeshes.map((m) => m.imported!.meshName),
    )
    expect(back.customMaterials.map((m) => m.id)).toEqual([materialId])
    expect(back.customTextures).toHaveLength(2)
    expect(back.placements).toEqual(before.placements)

    redo()
    expect($part.get().customMeshes[0]!.imported!.importId).toBe(second.importId)
  })

  it('setMeshTransparent enrolls in undo', async () => {
    await importSyntheticModel()
    const meshId = $part.get().customMeshes[0].id

    await setMeshTransparent(meshId, true)
    expect($part.get().customMeshes[0].imported!.transparent).toBe(true)

    undo()
    expect($part.get().customMeshes[0].imported!.transparent).toBeUndefined()
    redo()
    expect($part.get().customMeshes[0].imported!.transparent).toBe(true)
  })
})

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
    )
  }

  const IMPORTED = [
    {
      id: 'CylinderCollider1',
      shape: 'Cylinder' as const,
      ownerTemplateId: null,
      position: { x: 0, y: 0, z: -0.17 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.39, y: 0.6, z: 0.39 },
      layerId: COLLIDER_LAYER_ID,
    },
    {
      id: 'Puck',
      shape: 'Cylinder' as const,
      ownerTemplateId: 'CoreLandingA_Subpart_MediumFootA',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 0.34, z: 1 },
      layerId: COLLIDER_LAYER_ID,
    },
  ]

  it('regenerates ids onto the Colliders layer, keeping owner + geometry', () => {
    importWithColliders(IMPORTED)
    const colliders = $part.get().colliders
    // Core reuses ids like "CylinderCollider1" across dozens of parts, so import
    // regenerates them exactly like connector ids.
    expect(colliders.map((c) => c.id)).toEqual(['_collider1', '_collider2'])
    expect(colliders.map((c) => c.ownerTemplateId)).toEqual([
      null,
      'CoreLandingA_Subpart_MediumFootA',
    ])
    expect(colliders[1].scale).toEqual({ x: 1, y: 0.34, z: 1 })
    expect(colliders.every((c) => c.layerId === COLLIDER_LAYER_ID)).toBe(true)
  })

  it('keeps ids collision-free across a second import and is undoable', () => {
    importWithColliders(IMPORTED)
    importWithColliders(IMPORTED)
    expect($part.get().colliders.map((c) => c.id)).toEqual([
      '_collider1',
      '_collider2',
      '_collider3',
      '_collider4',
    ])
    undo()
    expect($part.get().colliders.map((c) => c.id)).toEqual(['_collider1', '_collider2'])
    undo()
    expect($part.get().colliders).toEqual([])
  })

  it('does not mutate the source catalog entry’s colliders', () => {
    const src = structuredClone(IMPORTED)
    importWithColliders(src)
    expect(src).toEqual(IMPORTED)
  })
})

describe('collider mutations', () => {
  it('addCollider drops a unit shape on the Colliders layer, selects it, and is undoable', () => {
    addCollider('Cylinder')
    addCollider('Box')
    const colliders = $part.get().colliders
    expect(colliders.map((c) => [c.id, c.shape])).toEqual([
      ['_collider1', 'Cylinder'],
      ['_collider2', 'Box'],
    ])
    expect(colliders.every((c) => c.layerId === COLLIDER_LAYER_ID)).toBe(true)
    expect(colliders[0].scale).toEqual({ x: 1, y: 1, z: 1 })
    expect(colliders[0].ownerTemplateId).toBeNull()
    expect($selectedColliderIndex.get()).toBe(1)
    undo()
    expect($part.get().colliders.map((c) => c.id)).toEqual(['_collider1'])
  })

  it('selecting a collider clears the other kinds (and vice versa)', () => {
    addSubPart('Core.A')
    addCollider('Box')
    expect($selectedIndices.get()).toEqual([])
    expect($selectedColliderIndices.get()).toEqual([0])
    selectPlacement(0)
    expect($selectedColliderIndices.get()).toEqual([])
  })

  it('setColliderShape re-snaps the size onto the new shape and is undoable', () => {
    addCollider('Box', {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 3, z: 1 },
    })
    setColliderShape(0, 'Cylinder')
    // A cylinder's X and Z are one diameter: max(2, 1) = 2.
    expect($part.get().colliders[0].scale).toEqual({ x: 2, y: 3, z: 2 })
    undo()
    expect($part.get().colliders[0].shape).toBe('Box')
    expect($part.get().colliders[0].scale).toEqual({ x: 2, y: 3, z: 1 })
  })

  it('setColliderSize normalizes so a cylinder can never be elliptical', () => {
    addCollider('Cylinder')
    setColliderSize(0, { x: 3, y: 4, z: 1 })
    expect($part.get().colliders[0].scale).toEqual({ x: 3, y: 4, z: 3 })
  })

  it('setColliderOwner re-homes with the converted transform and is undoable', () => {
    addSubPart('Core.Foot')
    addCollider('Cylinder')
    setColliderOwner(0, 'Core.Foot', {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })
    expect($part.get().colliders[0].ownerTemplateId).toBe('Core.Foot')
    expect($part.get().colliders[0].position).toEqual({ x: 1, y: 2, z: 3 })
    undo()
    expect($part.get().colliders[0].ownerTemplateId).toBeNull()
  })

  it('gizmo write-back normalizes the size (scale IS the size)', () => {
    addCollider('Sphere')
    updateSelectedTransforms([
      {
        kind: 'collider',
        index: 0,
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 5, z: 2 },
        },
      },
    ])
    // A sphere is uniform: the largest axis wins.
    expect($part.get().colliders[0].scale).toEqual({ x: 5, y: 5, z: 5 })
  })

  it('duplicate / delete / copy-paste all cover colliders in one undo step', () => {
    addCollider('Box')
    duplicateSelected()
    expect($part.get().colliders.map((c) => c.id)).toEqual(['_collider1', '_collider2'])
    copySelected()
    pasteClipboard()
    expect($part.get().colliders).toHaveLength(3)
    undo() // paste
    expect($part.get().colliders).toHaveLength(2)
    // Undo restores the document, not the selection — re-select before deleting.
    selectCollider(1)
    removeSelected()
    expect($part.get().colliders).toHaveLength(1)
    undo()
    expect($part.get().colliders).toHaveLength(2)
  })

  it('scaleEverything scales a collider’s position AND its size, re-normalized', () => {
    addCollider('Cylinder', {
      position: { x: 1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 4, z: 2 },
    })
    scaleEverything({ x: 2, y: 2, z: 2 })
    const c = $part.get().colliders[0]
    expect(c.position).toEqual({ x: 2, y: 0, z: 0 })
    expect(c.scale).toEqual({ x: 4, y: 8, z: 4 })
  })

  it('removeCollider drops one by index and is undoable', () => {
    addCollider('Box')
    addCollider('Sphere')
    removeCollider(0)
    expect($part.get().colliders.map((c) => c.shape)).toEqual(['Sphere'])
    undo()
    expect($part.get().colliders.map((c) => c.shape)).toEqual(['Box', 'Sphere'])
  })
})
