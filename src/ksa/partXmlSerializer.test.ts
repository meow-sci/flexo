import { describe, it, expect } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import type { Document as XmlDocument, Element as XmlElement } from '@xmldom/xmldom'
import { serializeGameData, serializePart } from './partXmlSerializer'
import type { Connector, EditingPart, SubPartPlacement } from './types'
import {
  createDefaultLayer,
  createEmptyGameData,
  createTank,
  DEFAULT_LAYER_ID,
  EULER_ZERO,
  VEC3_ONE,
  VEC3_ZERO,
} from './types'

function placement(p: Partial<SubPartPlacement>): SubPartPlacement {
  return {
    instanceId: 'x',
    subPartTemplateId: 'T',
    position: { ...VEC3_ZERO },
    rotation: { ...EULER_ZERO },
    scale: { ...VEC3_ONE },
    layerId: DEFAULT_LAYER_ID,
    ...p,
  }
}

/** Builds a full EditingPart with sensible defaults (incl. an empty gameData). */
function editingPart(over: Partial<EditingPart>): EditingPart {
  return {
    partId: 'P',
    editorTags: [],
    gameData: createEmptyGameData(),
    layers: [createDefaultLayer()],
    placements: [],
    connectors: [],
    ...over,
  }
}

function parse(xml: string): XmlDocument {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

function tags(parent: XmlDocument | XmlElement, tag: string): XmlElement[] {
  return Array.from(parent.getElementsByTagName(tag))
}

function subPartById(doc: XmlDocument, id: string): XmlElement {
  const el = tags(doc, 'SubPart').find((e) => e.getAttribute('Id') === id)
  if (!el) throw new Error(`SubPart not found: ${id}`)
  return el
}

/** First descendant element with the given tag, or null. */
function child(el: XmlElement, tag: string): XmlElement | null {
  return el.getElementsByTagName(tag)[0] ?? null
}

describe('serializePart', () => {
  // Reconstructed from CoreCouplingAAssets.xml's CoreCouplingA_Prefab_DockingPort1WA
  // (the calibration part). Asserts transform/axis omission + G6 formatting.
  const part = editingPart({
    partId: 'CoreCouplingA_Prefab_DockingPort1WA',
    placements: [
      placement({
        instanceId: 'identity_1',
        subPartTemplateId: 'CoreCouplingA_Subpart_InteriorTunnelA',
      }),
      placement({
        instanceId: 'CoreCouplingA_Subpart_GuideRingA1',
        subPartTemplateId: 'CoreCouplingA_Subpart_GuideRingA',
        position: { x: 0.1427, y: 0, z: -0.0601 },
      }),
      placement({
        instanceId: 'CoreCouplingA_Subpart_LatchHousingA4',
        subPartTemplateId: 'CoreCouplingA_Subpart_LatchHousingA',
        position: { x: 0, y: 0, z: 0.4731 },
        rotation: { x: 3.14159, y: 0, z: 0 },
      }),
      placement({
        instanceId: 'CoreCouplingA_Subpart_ActuatorMergedA1',
        subPartTemplateId: 'CoreCouplingA_Subpart_ActuatorMergedA',
        position: { x: -0.02294, y: -0.19896, z: -0.56421 },
        rotation: { x: -0.3876, y: 0.36137, z: 0.71372 },
      }),
    ],
  })

  const xml = serializePart(part)
  const doc = parse(xml)

  it('produces a valid, parseable Assets/Part document', () => {
    expect(tags(doc, 'parsererror').length).toBe(0)
    const partEl = tags(doc, 'Part')[0]
    expect(partEl.getAttribute('Id')).toBe('CoreCouplingA_Prefab_DockingPort1WA')
    expect(tags(doc, 'SubPart').length).toBe(4)
  })

  it('omits <Transform> for an identity placement', () => {
    const sp = subPartById(doc, 'identity_1')
    expect(sp.getAttribute('InstanceOf')).toBe('CoreCouplingA_Subpart_InteriorTunnelA')
    expect(child(sp, 'Transform')).toBeNull()
  })

  it('emits position-only transform and omits zero axes', () => {
    const sp = subPartById(doc, 'CoreCouplingA_Subpart_GuideRingA1')
    const pos = child(sp, 'Position')!
    expect(pos.getAttribute('X')).toBe('0.1427')
    expect(pos.getAttribute('Z')).toBe('-0.0601')
    expect(pos.hasAttribute('Y')).toBe(false)
    expect(child(sp, 'Rotation')).toBeNull()
    expect(child(sp, 'Scale')).toBeNull()
  })

  it('emits rotation in radians alongside position', () => {
    const sp = subPartById(doc, 'CoreCouplingA_Subpart_LatchHousingA4')
    expect(child(sp, 'Position')!.getAttribute('Z')).toBe('0.4731')
    const rot = child(sp, 'Rotation')!
    expect(rot.getAttribute('X')).toBe('3.14159')
    expect(rot.hasAttribute('Y')).toBe(false)
    expect(rot.hasAttribute('Z')).toBe(false)
  })

  it('emits all axes for a fully-transformed placement', () => {
    const sp = subPartById(doc, 'CoreCouplingA_Subpart_ActuatorMergedA1')
    const pos = child(sp, 'Position')!
    expect(pos.getAttribute('X')).toBe('-0.02294')
    expect(pos.getAttribute('Y')).toBe('-0.19896')
    expect(pos.getAttribute('Z')).toBe('-0.56421')
    const rot = child(sp, 'Rotation')!
    expect(rot.getAttribute('X')).toBe('-0.3876')
    expect(rot.getAttribute('Y')).toBe('0.36137')
    expect(rot.getAttribute('Z')).toBe('0.71372')
  })

  it('never emits <EditorTag> in the Part document (tags live on PartGameData)', () => {
    const tagged = serializePart(editingPart({ editorTags: ['Structural', 'RCS'] }))
    expect(tags(parse(tagged), 'EditorTag').length).toBe(0)
  })

  it('includes the XML declaration', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
  })
})

function connector(c: Partial<Connector>): Connector {
  return {
    id: '_connector1',
    position: { ...VEC3_ZERO },
    rotation: { ...EULER_ZERO },
    scale: { ...VEC3_ONE },
    flags: [],
    layerId: DEFAULT_LAYER_ID,
    ...c,
  }
}

describe('serializePart connectors', () => {
  const part = editingPart({
    connectors: [
      connector({ id: '_connector1' }), // identity, no flags
      connector({
        id: '_connector2',
        position: { x: -1, y: 0, z: 0 },
        rotation: { x: Math.PI, y: 0, z: Math.PI },
        scale: { x: 2, y: 2, z: 2 },
        flags: ['Internal', 'ToSurface'],
      }),
    ],
  })
  const doc = parse(serializePart(part))

  it('emits a <Connector> per connector with its Id', () => {
    const ids = tags(doc, 'Connector').map((e) => e.getAttribute('Id'))
    expect(ids).toEqual(['_connector1', '_connector2'])
  })

  it('omits <Transform> for an identity connector', () => {
    const c = tags(doc, 'Connector').find((e) => e.getAttribute('Id') === '_connector1')!
    expect(child(c, 'Transform')).toBeNull()
  })

  it('emits position/rotation/scale for a transformed connector', () => {
    const c = tags(doc, 'Connector').find((e) => e.getAttribute('Id') === '_connector2')!
    expect(child(c, 'Position')!.getAttribute('X')).toBe('-1')
    expect(child(c, 'Rotation')!.getAttribute('X')).toBe('3.14159')
    expect(child(c, 'Scale')!.getAttribute('X')).toBe('2')
  })

  it('emits ", "-joined <Flags> on the Part connector (matches space-tape)', () => {
    const c2 = tags(doc, 'Connector').find((e) => e.getAttribute('Id') === '_connector2')!
    expect(child(c2, 'Flags')!.textContent).toBe('Internal, ToSurface')
    const c1 = tags(doc, 'Connector').find((e) => e.getAttribute('Id') === '_connector1')!
    expect(child(c1, 'Flags')).toBeNull()
  })
})

describe('serializeGameData', () => {
  const part = editingPart({
    editorTags: ['Structural', 'RCS'],
    gameData: {
      ...createEmptyGameData(),
      displayName: 'My Tank',
      customMass: 250,
      tanks: [
        { ...createTank(), shape: 'Cylindrical', lengthM: 3, outerRadiusM: 0.8, wallThicknessMm: 2.5 },
        { ...createTank(), shape: 'Spherical', wallMaterialId: 'Steel(s)', outerRadiusM: 1.2 },
      ],
      batteries: [{ capacityKWh: 0.5 }],
      generators: [{ outputWatts: 12 }],
      powerConsumers: [{ consumedWatts: 3 }],
      decoupler: { connectorId: '_connector2', force: 750 },
      dockingPort: { connectorId: '_connector3', force: 600 },
      evaDoor: { connectorId: '_connector3' },
    },
    connectors: [
      connector({ id: '_connector1', flags: [] }),
      connector({ id: '_connector2', flags: ['ToSurface'] }),
      connector({ id: '_connector3', flags: ['Internal'] }),
    ],
  })
  const doc = parse(serializeGameData(part))
  const gd = tags(doc, 'PartGameData')[0]

  it('roots a <PartGameData> with the part id and DisplayName', () => {
    expect(gd.getAttribute('Id')).toBe('P')
    expect(gd.getAttribute('DisplayName')).toBe('My Tank')
  })

  it('emits editor tags here (not on the Part)', () => {
    expect(tags(doc, 'EditorTag').map((e) => e.getAttribute('Value'))).toEqual(['Structural', 'RCS'])
  })

  it('emits custom mass in kg', () => {
    expect(child(gd, 'CustomMass')!.getElementsByTagName('Mass')[0].getAttribute('Kg')).toBe('250')
  })

  it('emits cylindrical + spherical tanks (length only on the cylinder)', () => {
    const cyl = tags(doc, 'CylindricalTank')[0]
    expect(child(cyl, 'Length')!.getAttribute('M')).toBe('3')
    expect(child(cyl, 'OuterRadius')!.getAttribute('M')).toBe('0.8')
    expect(child(cyl, 'WallThickness')!.getAttribute('Mm')).toBe('2.5')
    const sph = tags(doc, 'SphericalTank')[0]
    expect(child(sph, 'Length')).toBeNull()
    expect(child(sph, 'Material')!.getAttribute('Id')).toBe('Steel(s)')
  })

  it('emits batteries/generators/consumers with their units', () => {
    expect(child(tags(doc, 'Battery')[0], 'MaximumCapacity')!.getAttribute('KWh')).toBe('0.5')
    expect(child(tags(doc, 'Generator')[0], 'Produced')!.getAttribute('W')).toBe('12')
    expect(child(tags(doc, 'PowerConsumer')[0], 'Consumed')!.getAttribute('W')).toBe('3')
  })

  it('emits every connector, with <Flags> only when set', () => {
    const connectors = tags(doc, 'Connector')
    expect(connectors.map((e) => e.getAttribute('Id'))).toEqual(['_connector1', '_connector2', '_connector3'])
    expect(child(connectors[0], 'Flags')).toBeNull()
    expect(child(connectors[1], 'Flags')!.textContent).toBe('ToSurface')
    expect(child(connectors[2], 'Flags')!.textContent).toBe('Internal')
  })

  it('emits decoupler / docking port / EVA door', () => {
    const dec = tags(doc, 'Decoupler')[0]
    expect(dec.getAttribute('ConnectorId')).toBe('_connector2')
    expect(dec.getAttribute('Force')).toBe('750')
    const dp = tags(doc, 'DockingPort')[0]
    expect(dp.getAttribute('ConnectorId')).toBe('_connector3')
    expect(dp.getAttribute('Force')).toBe('600')
    expect(tags(doc, 'EVADoor')[0].getAttribute('ConnectorId')).toBe('_connector3')
  })

  it('omits empty/default game data entirely', () => {
    const bare = parse(serializeGameData(editingPart({ connectors: [] })))
    const bareGd = tags(bare, 'PartGameData')[0]
    expect(bareGd.hasAttribute('DisplayName')).toBe(false)
    expect(tags(bare, 'CustomMass').length).toBe(0)
    expect(tags(bare, 'CylindricalTank').length).toBe(0)
    expect(tags(bare, 'Decoupler').length).toBe(0)
  })
})
