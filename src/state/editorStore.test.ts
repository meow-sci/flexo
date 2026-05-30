import { describe, it, expect, beforeEach } from 'vitest'
import {
  $part,
  $activeLayerId,
  $selectedIndex,
  $selectedIndices,
  $selectedConnectorIndex,
  $selectedKittenIndex,
  $selectedKittenIndices,
  $canUndo,
  addConnector,
  addKitten,
  addPart,
  addSubPart,
  createLayer,
  deleteLayer,
  renameLayer,
  reorderLayers,
  selectLayerEntities,
  setActiveLayer,
  setEditorTags,
  setPartId,
  duplicateSelected,
  pushUndo,
  removeSelected,
  newPart,
  redo,
  setConnectorFlags,
  addTank,
  removeTank,
  setTankShape,
  updateTank,
  setCustomMassEnabled,
  setDecouplerEnabled,
  setDecouplerForce,
  undo,
  updatePlacementTransform,
} from './editorStore'
import { CONNECTOR_LAYER_ID, DEFAULT_LAYER_ID, KITTEN_LAYER_ID } from '../ksa/types'

beforeEach(() => {
  newPart()
})

describe('editorStore', () => {
  it('adds SubParts with sequential lowercased instance ids and selects the last', () => {
    addSubPart('CoreStructuralA_Subpart_TrussBarA')
    addSubPart('CoreStructuralA_Subpart_TrussBarA')
    const ids = $part.get().placements.map((p) => p.instanceId)
    expect(ids).toEqual(['corestructurala_subpart_trussbara_1', 'corestructurala_subpart_trussbara_2'])
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
          layerId: DEFAULT_LAYER_ID,
        },
      ],
      ['Electrical', 'Existing'],
    )
    expect($part.get().connectors[0].flags).toEqual(['ToSurface'])
    // 'Existing' kept, 'Electrical' added, no duplicate.
    expect($part.get().editorTags).toEqual(['Existing', 'Electrical'])
  })

  it('adds/removes tanks as discrete undo steps and patches fields (streaming)', () => {
    addTank()
    expect($part.get().gameData.tanks.length).toBe(1)
    setTankShape(0, 'Spherical')
    expect($part.get().gameData.tanks[0].shape).toBe('Spherical')
    // updateTank is streaming (no internal undo) — emulate the field focus push.
    pushUndo('edit tank')
    updateTank(0, { outerRadiusM: 1.5 })
    expect($part.get().gameData.tanks[0].outerRadiusM).toBe(1.5)
    undo() // undo the radius edit
    expect($part.get().gameData.tanks[0].outerRadiusM).toBe(0.5)
    undo() // undo the shape change
    expect($part.get().gameData.tanks[0].shape).toBe('Cylindrical')
    removeTank(0)
    expect($part.get().gameData.tanks.length).toBe(0)
    undo()
    expect($part.get().gameData.tanks.length).toBe(1)
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
  it('starts with built-in Default + Connectors + Kittens layers; Default is active', () => {
    expect($part.get().layers).toEqual([
      { id: DEFAULT_LAYER_ID, name: 'Default' },
      { id: CONNECTOR_LAYER_ID, name: 'Connectors' },
      { id: KITTEN_LAYER_ID, name: 'Kittens' },
    ])
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID)
  })

  it('createLayer adds a layer, makes it active, and is undoable', () => {
    const id = createLayer('Engines')
    expect($part.get().layers.map((l) => l.name)).toEqual(['Default', 'Connectors', 'Kittens', 'Engines'])
    expect($activeLayerId.get()).toBe(id)
    undo()
    // Layer removed AND the active layer falls back to Default (it no longer exists).
    expect($part.get().layers.map((l) => l.name)).toEqual(['Default', 'Connectors', 'Kittens'])
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
    expect($part.get().layers.map((l) => l.id)).toEqual([DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID, KITTEN_LAYER_ID])
    expect($part.get().placements.map((p) => p.subPartTemplateId)).toEqual(['Core.B'])
    expect($activeLayerId.get()).toBe(DEFAULT_LAYER_ID)
  })

  it('deleteLayer with move-items reassigns entities to the target layer', () => {
    const a = createLayer('A')
    addSubPart('Core.A') // in A
    const b = createLayer('B')
    deleteLayer(a, { mode: 'move-items', targetLayerId: b })
    expect($part.get().placements[0].layerId).toBe(b)
    expect($part.get().layers.map((l) => l.id)).toEqual([DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID, KITTEN_LAYER_ID, b])
  })

  it('deleteLayer is undoable (restores layer + membership)', () => {
    const id = createLayer('Scrap')
    addSubPart('Core.A')
    deleteLayer(id, { mode: 'delete-items' })
    expect($part.get().placements.length).toBe(0)
    undo()
    expect($part.get().layers.map((l) => l.id)).toEqual([DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID, KITTEN_LAYER_ID, id])
    expect($part.get().placements[0].layerId).toBe(id)
  })

  it('refuses to delete the built-in Default, Connectors and Kittens layers', () => {
    addSubPart('Core.A')
    addConnector()
    deleteLayer(DEFAULT_LAYER_ID, { mode: 'delete-items' })
    deleteLayer(CONNECTOR_LAYER_ID, { mode: 'delete-items' })
    deleteLayer(KITTEN_LAYER_ID, { mode: 'delete-items' })
    expect($part.get().layers.map((l) => l.id)).toEqual([DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID, KITTEN_LAYER_ID])
    expect($part.get().placements.length).toBe(1)
    expect($part.get().connectors.length).toBe(1)
  })

  it('reorderLayers reorders by id and is undoable', () => {
    const a = createLayer('A')
    const b = createLayer('B')
    reorderLayers([a, DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID, KITTEN_LAYER_ID, b])
    expect($part.get().layers.map((l) => l.id)).toEqual([a, DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID, KITTEN_LAYER_ID, b])
    undo()
    expect($part.get().layers.map((l) => l.id)).toEqual([DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID, KITTEN_LAYER_ID, a, b])
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
})
