import { describe, it, expect } from 'vitest'
import { validateIvaSeats, hasBlockingIvaSeatIssue } from './ivaSeatValidation'
import {
  DEFAULT_LAYER_ID,
  IVA_SEAT_LAYER_ID,
  createEmptyPart,
  identityTransform,
  type CustomMesh,
  type EditingPart,
  type EulerXYZ,
  type IvaSeat,
  type Vec3,
} from './types'
import type { CatalogSubPart } from './catalog'

function seat(position: Vec3 = { x: 0, y: 0, z: 0 }, rotation?: EulerXYZ): IvaSeat {
  return {
    ...identityTransform(),
    position,
    ...(rotation ? { rotation } : {}),
    id: '_seat1',
    layerId: IVA_SEAT_LAYER_ID,
  }
}

function placed(templateId: string): EditingPart['placements'][number] {
  return {
    instanceId: `inst_${templateId}`,
    subPartTemplateId: templateId,
    ...identityTransform(),
    layerId: DEFAULT_LAYER_ID,
  }
}

function entry(id: string, over: Partial<CatalogSubPart> = {}): CatalogSubPart {
  return {
    id,
    atlasUrl: `/ksa/Meshes/${id}.glb`,
    meshNodeName: id,
    sourceFile: 'test.xml',
    ...over,
  }
}

/** A custom mesh template that exports through `<PartModelGlass>` (an imported BLEND mesh). */
function glassMesh(subPartId: string): CustomMesh {
  return {
    id: `mesh_${subPartId}`,
    name: subPartId,
    subPartId,
    faceTextures: {},
    imported: {
      importId: 'imp_1',
      meshName: subPartId,
      sourceFile: 'x.glb',
      sourceNode: subPartId,
      sourceMaterial: 'Glass',
      triangles: 12,
      vertices: 24,
      transparent: true,
    },
  }
}

const EMPTY_CATALOG: ReadonlyMap<string, CatalogSubPart> = new Map()

const codes = (part: EditingPart, catalog = EMPTY_CATALOG) =>
  validateIvaSeats(part, catalog).map((i) => i.code)

/** A part with one seat and one placed interior template — the healthy baseline. */
function healthyPart(): { part: EditingPart; catalog: Map<string, CatalogSubPart> } {
  const part = createEmptyPart()
  part.placements.push(placed('Interior'))
  part.ivaSeats.push(seat({ x: -0.45, y: 0.42, z: -0.35 }))
  const catalog = new Map([['Interior', entry('Interior', { internal: true })]])
  return { part, catalog }
}

describe('validateIvaSeats', () => {
  it('is silent for a part with a seat and interior geometry', () => {
    const { part, catalog } = healthyPart()
    expect(validateIvaSeats(part, catalog)).toEqual([])
  })

  it('is silent for a part with neither seats nor interior geometry', () => {
    const part = createEmptyPart()
    part.placements.push(placed('Hull'))
    expect(validateIvaSeats(part, new Map([['Hull', entry('Hull')]]))).toEqual([])
  })

  it('blocks a seat whose derived axes are non-finite', () => {
    const { part, catalog } = healthyPart()
    part.ivaSeats[0].rotation = { x: Number.NaN, y: 0, z: 0 }
    const issues = validateIvaSeats(part, catalog)
    expect(issues.map((i) => i.code)).toEqual(['iva-seat-non-finite'])
    expect(issues[0].message).toMatch(/Camera\.LookAtRotation/)
    expect(hasBlockingIvaSeatIssue(issues)).toBe(true)
  })

  it('blocks a non-finite seat POSITION too (same corrupted-payload path)', () => {
    const { part, catalog } = healthyPart()
    part.ivaSeats[0].position = { x: Number.POSITIVE_INFINITY, y: 0, z: 0 }
    expect(codes(part, catalog)).toEqual(['iva-seat-non-finite'])
  })

  it('blocks two seats sharing the identical position AND orientation', () => {
    const { part, catalog } = healthyPart()
    part.ivaSeats.push({ ...seat({ x: -0.45, y: 0.42, z: -0.35 }), id: '_seat2' })
    const issues = validateIvaSeats(part, catalog)
    expect(issues.map((i) => i.code)).toEqual(['iva-seat-duplicate'])
    expect(issues[0].severity).toBe('block')
    expect(hasBlockingIvaSeatIssue(issues)).toBe(true)
  })

  it('allows two seats at the same position facing different ways', () => {
    const { part, catalog } = healthyPart()
    part.ivaSeats.push({
      ...seat({ x: -0.45, y: 0.42, z: -0.35 }, { x: 0, y: 0, z: Math.PI / 2 }),
      id: '_seat2',
    })
    expect(validateIvaSeats(part, catalog)).toEqual([])
  })

  it('allows two seats with the same orientation at different positions', () => {
    const { part, catalog } = healthyPart()
    part.ivaSeats.push({ ...seat({ x: -0.45, y: -0.42, z: -0.35 }), id: '_seat2' })
    expect(validateIvaSeats(part, catalog)).toEqual([])
  })

  it('reports a duplicate only ONCE per offending seat', () => {
    const { part, catalog } = healthyPart()
    part.ivaSeats.push({ ...seat({ x: -0.45, y: 0.42, z: -0.35 }), id: '_seat2' })
    part.ivaSeats.push({ ...seat({ x: -0.45, y: 0.42, z: -0.35 }), id: '_seat3' })
    expect(codes(part, catalog)).toEqual(['iva-seat-duplicate', 'iva-seat-duplicate'])
  })

  it('warns when a part has seats but no interior geometry, naming the menu action', () => {
    const part = createEmptyPart()
    part.placements.push(placed('Hull'))
    part.ivaSeats.push(seat())
    const issues = validateIvaSeats(part, new Map([['Hull', entry('Hull')]]))
    expect(issues.map((i) => i.code)).toEqual(['iva-seat-no-interior'])
    expect(issues[0].severity).toBe('warn')
    expect(issues[0].message).toContain('Interior (IVA only)')
  })

  it('counts a user-flagged (internalFlags) template as interior geometry', () => {
    const part = createEmptyPart()
    part.placements.push(placed('Hull'))
    part.internalFlags.Hull = true
    part.ivaSeats.push(seat())
    expect(validateIvaSeats(part, new Map([['Hull', entry('Hull')]]))).toEqual([])
  })

  it('respects an internalFlags OVERRIDE that turns a built-in interior back into exterior', () => {
    const { part, catalog } = healthyPart()
    part.internalFlags.Interior = false
    expect(codes(part, catalog)).toEqual(['iva-seat-no-interior'])
  })

  it('warns when a part has interior geometry but no seats', () => {
    const { part, catalog } = healthyPart()
    part.ivaSeats.length = 0
    const issues = validateIvaSeats(part, catalog)
    expect(issues.map((i) => i.code)).toEqual(['iva-interior-no-seat'])
    expect(issues[0].severity).toBe('warn')
    expect(issues[0].message).toMatch(/EVERY camera mode/)
  })

  it('warns when an interior-flagged template exports through <PartModelGlass>', () => {
    const part = createEmptyPart()
    part.customMeshes.push(glassMesh('Window'))
    part.placements.push(placed('Window'))
    part.internalFlags.Window = true
    part.ivaSeats.push(seat())
    const issues = validateIvaSeats(part, EMPTY_CATALOG)
    expect(issues.map((i) => i.code)).toEqual(['iva-interior-on-glass'])
    expect(issues[0].severity).toBe('warn')
  })

  it('stays quiet about a NON-interior glass mesh', () => {
    const { part, catalog } = healthyPart()
    part.customMeshes.push(glassMesh('Window'))
    part.placements.push(placed('Window'))
    expect(validateIvaSeats(part, catalog)).toEqual([])
  })

  it('stays quiet about an interior mesh that is NOT glass', () => {
    const part = createEmptyPart()
    const opaque = glassMesh('Panel')
    delete opaque.imported!.transparent
    part.customMeshes.push(opaque)
    part.placements.push(placed('Panel'))
    part.internalFlags.Panel = true
    part.ivaSeats.push(seat())
    expect(validateIvaSeats(part, EMPTY_CATALOG)).toEqual([])
  })

  it('says nothing at all about an empty part', () => {
    expect(validateIvaSeats(createEmptyPart(), EMPTY_CATALOG)).toEqual([])
  })
})
