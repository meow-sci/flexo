import { describe, it, expect } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { connectorsFromPartElement, parsePartPlacements } from './partXmlParser'
import { serializePart } from './partXmlSerializer'
import type { Connector, EditingPart } from './types'

const part: EditingPart = {
  partId: 'TestPart',
  editorTags: [],
  connectors: [],
  placements: [
    {
      instanceId: 'identity_1',
      subPartTemplateId: 'Core.A',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    {
      instanceId: 'b_1',
      subPartTemplateId: 'Core.B',
      position: { x: 0.1427, y: 0, z: -0.0601 },
      rotation: { x: 3.14159, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    {
      instanceId: 'c_1',
      subPartTemplateId: 'Core.C',
      position: { x: -0.02294, y: -0.19896, z: -0.56421 },
      rotation: { x: -0.3876, y: 0.36137, z: 0.71372 },
      scale: { x: 2, y: 2, z: 2 },
    },
  ],
}

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

describe('connectorsFromPartElement (round-trip with serializer)', () => {
  const withConnectors: EditingPart = {
    partId: 'TestPart',
    editorTags: [],
    placements: [],
    connectors: [
      {
        id: '_connector1',
        position: { x: 0.5, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 2, y: 2, z: 2 },
        flags: 'None',
      },
      {
        id: '_connector2',
        position: { x: -0.5, y: 0, z: 0 },
        rotation: { x: 3.14159, y: 0, z: 3.14159 },
        scale: { x: 1, y: 1, z: 1 },
        flags: 'None',
      },
    ],
  }

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

  it('defaults flags to None when no <Flags> is present in the Part XML', () => {
    expect(parsed.every((c) => c.flags === 'None')).toBe(true)
  })
})
