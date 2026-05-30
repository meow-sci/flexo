import { describe, it, expect } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import {
  connectorsFromPartElement,
  gameDataFromAssets,
  parseConnectorFlags,
  parsePartPlacements,
} from './partXmlParser'
import { serializeGameData, serializePart } from './partXmlSerializer'
import type { Connector, EditingPart } from './types'
import { createDefaultLayer, createEmptyGameData, createTank, DEFAULT_LAYER_ID } from './types'

function editingPart(over: Partial<EditingPart>): EditingPart {
  return {
    partId: 'TestPart',
    editorTags: [],
    gameData: createEmptyGameData(),
    layers: [createDefaultLayer()],
    placements: [],
    connectors: [],
    kittens: [],
    customTextures: [],
    customMeshes: [],
    ...over,
  }
}

const part = editingPart({
  placements: [
    {
      instanceId: 'identity_1',
      subPartTemplateId: 'Core.A',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: DEFAULT_LAYER_ID,
    },
    {
      instanceId: 'b_1',
      subPartTemplateId: 'Core.B',
      position: { x: 0.1427, y: 0, z: -0.0601 },
      rotation: { x: 3.14159, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: DEFAULT_LAYER_ID,
    },
    {
      instanceId: 'c_1',
      subPartTemplateId: 'Core.C',
      position: { x: -0.02294, y: -0.19896, z: -0.56421 },
      rotation: { x: -0.3876, y: 0.36137, z: 0.71372 },
      scale: { x: 2, y: 2, z: 2 },
      layerId: DEFAULT_LAYER_ID,
    },
  ],
})

describe('parsePartPlacements (round-trip with serializer)', () => {
  const xml = serializePart(part)
  const parsed = parsePartPlacements(xml, 'TestPart', new DOMParser())

  it('recovers every placement', () => {
    expect(parsed.length).toBe(3)
    expect(parsed.map((p) => p.instanceId)).toEqual(['identity_1', 'b_1', 'c_1'])
    expect(parsed.map((p) => p.subPartTemplateId)).toEqual(['Core.A', 'Core.B', 'Core.C'])
  })

  it('recovers transforms within G6 precision', () => {
    const c = parsed[2]
    expect(c.position.x).toBeCloseTo(-0.02294, 5)
    expect(c.position.y).toBeCloseTo(-0.19896, 5)
    expect(c.position.z).toBeCloseTo(-0.56421, 5)
    expect(c.rotation.x).toBeCloseTo(-0.3876, 5)
    expect(c.rotation.y).toBeCloseTo(0.36137, 5)
    expect(c.rotation.z).toBeCloseTo(0.71372, 5)
    expect(c.scale.x).toBeCloseTo(2, 5)
  })

  it('defaults identity placement to zero/one', () => {
    const a = parsed[0]
    expect(a.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(a.rotation).toEqual({ x: 0, y: 0, z: 0 })
    expect(a.scale).toEqual({ x: 1, y: 1, z: 1 })
  })

  it('throws on unknown part id', () => {
    expect(() => parsePartPlacements(xml, 'Nope', new DOMParser())).toThrow()
  })
})

describe('parseConnectorFlags', () => {
  it('splits a comma-separated list, trimming and dropping unknowns', () => {
    expect(parseConnectorFlags('Internal, ToSurface')).toEqual(['Internal', 'ToSurface'])
    expect(parseConnectorFlags(' FromSurface ')).toEqual(['FromSurface'])
    expect(parseConnectorFlags('Bogus, Internal')).toEqual(['Internal'])
    expect(parseConnectorFlags('')).toEqual([])
    expect(parseConnectorFlags(null)).toEqual([])
  })
})

describe('connectorsFromPartElement (round-trip with serializer)', () => {
  const withConnectors = editingPart({
    connectors: [
      {
        id: '_connector1',
        position: { x: 0.5, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 2, y: 2, z: 2 },
        flags: [],
        layerId: DEFAULT_LAYER_ID,
      },
      {
        id: '_connector2',
        position: { x: -0.5, y: 0, z: 0 },
        rotation: { x: 3.14159, y: 0, z: 3.14159 },
        scale: { x: 1, y: 1, z: 1 },
        flags: ['Internal', 'FromSurface'],
        layerId: DEFAULT_LAYER_ID,
      },
    ],
  })

  function partElement(xml: string): Element {
    const doc = new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document
    return Array.from(doc.getElementsByTagName('Part'))[0]
  }

  const parsed: Connector[] = connectorsFromPartElement(partElement(serializePart(withConnectors)))

  it('recovers every connector id', () => {
    expect(parsed.map((c) => c.id)).toEqual(['_connector1', '_connector2'])
  })

  it('recovers connector transforms within G6 precision', () => {
    expect(parsed[0].position.x).toBeCloseTo(0.5, 5)
    expect(parsed[0].scale.x).toBeCloseTo(2, 5)
    expect(parsed[1].position.x).toBeCloseTo(-0.5, 5)
    expect(parsed[1].rotation.x).toBeCloseTo(3.14159, 5)
    expect(parsed[1].rotation.z).toBeCloseTo(3.14159, 5)
  })

  it('round-trips inline <Flags> (now emitted on the Part connector)', () => {
    expect(parsed[0].flags).toEqual([])
    expect(parsed[1].flags).toEqual(['Internal', 'FromSurface'])
  })
})

describe('gameDataFromAssets (round-trip with serializeGameData)', () => {
  const source = editingPart({
    partId: 'GD',
    editorTags: ['Tanks', 'Structural'],
    gameData: {
      ...createEmptyGameData(),
      displayName: 'Round Trip',
      customMass: 42,
      tanks: [
        { ...createTank(), shape: 'Cylindrical', lengthM: 3, outerRadiusM: 0.8, wallThicknessMm: 2.5 },
        { ...createTank(), shape: 'Spherical', wallMaterialId: 'Steel(s)', outerRadiusM: 1.2 },
      ],
      batteries: [{ capacityKWh: 0.5 }],
      generators: [{ outputWatts: 12 }],
      powerConsumers: [{ consumedWatts: 3 }],
      decoupler: { connectorId: '_c2', force: 750 },
      dockingPort: { connectorId: '_c3', force: 600 },
      evaDoor: { connectorId: '_c3' },
    },
    connectors: [
      {
        id: '_c2',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        flags: ['ToSurface'],
        layerId: DEFAULT_LAYER_ID,
      },
    ],
  })

  const parsed = gameDataFromAssets(serializeGameData(source), 'GD', new DOMParser())!

  it('recovers display name, tags, mass', () => {
    expect(parsed.gameData.displayName).toBe('Round Trip')
    expect(parsed.editorTags).toEqual(['Tanks', 'Structural'])
    expect(parsed.gameData.customMass).toBe(42)
  })

  it('recovers tanks (shape, material, dims)', () => {
    expect(parsed.gameData.tanks.map((t) => t.shape)).toEqual(['Cylindrical', 'Spherical'])
    expect(parsed.gameData.tanks[0].lengthM).toBe(3)
    expect(parsed.gameData.tanks[1].wallMaterialId).toBe('Steel(s)')
  })

  it('recovers power and coupling', () => {
    expect(parsed.gameData.batteries[0].capacityKWh).toBe(0.5)
    expect(parsed.gameData.generators[0].outputWatts).toBe(12)
    expect(parsed.gameData.powerConsumers[0].consumedWatts).toBe(3)
    expect(parsed.gameData.decoupler).toEqual({ connectorId: '_c2', force: 750 })
    expect(parsed.gameData.dockingPort).toEqual({ connectorId: '_c3', force: 600 })
    expect(parsed.gameData.evaDoor).toEqual({ connectorId: '_c3' })
  })

  it('recovers connector flags by id', () => {
    expect(parsed.connectorFlags.get('_c2')).toEqual(['ToSurface'])
  })

  it('returns null for an unknown part id', () => {
    expect(gameDataFromAssets(serializeGameData(source), 'Nope', new DOMParser())).toBeNull()
  })
})
