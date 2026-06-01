import { describe, expect, it } from 'vitest'
import {
  CONNECTOR_LAYER_ID,
  DEFAULT_LAYER_ID,
  KITTEN_LAYER_ID,
  createEmptyPart,
  createTank,
  identityTransform,
  type EditingPart,
} from '../ksa/types'
import {
  PROJECT_EXPORT_FORMAT,
  PROJECT_EXPORT_VERSION,
  buildProjectExport,
  hasCustomAssets,
  mergeProjectImport,
  parseProjectImport,
} from './projectTransfer'

/** A transform with all three components set to `n` (scale defaults to 1). */
function t(n = 0, scale = 1) {
  return {
    position: { x: n, y: n, z: n },
    rotation: { x: n, y: n, z: n },
    scale: { x: scale, y: scale, z: scale },
  }
}

/**
 * A representative source project: meshes across Default + 2 custom layers, a flagged
 * connector with a decoupler bound to it, a kitten, tanks, and an animation whose joint
 * member + solar-tracking reference specific placements (the references we must remap).
 */
function sourcePart(): EditingPart {
  const p = createEmptyPart()
  p.partId = 'source_part'
  p.layers.push({ id: 'layer1', name: 'Engines' }, { id: 'layer2', name: 'Wings' })
  p.placements.push(
    { instanceId: 'trussbara_1', subPartTemplateId: 'Core.TrussBarA', layerId: DEFAULT_LAYER_ID, ...t(1) },
    { instanceId: 'trussbara_2', subPartTemplateId: 'Core.TrussBarA', layerId: 'layer1', ...t(2) },
    { instanceId: 'wing_1', subPartTemplateId: 'Core.Wing', layerId: 'layer2', ...t(3) },
  )
  p.connectors.push({ id: '_connector1', flags: ['Internal'], layerId: CONNECTOR_LAYER_ID, ...t(0) })
  p.kittens.push({ id: 'kitten_1', kind: 'hunter', layerId: KITTEN_LAYER_ID, ...t(0) })
  p.editorTags.push('Structural')
  p.gameData.displayName = 'Source Display'
  p.gameData.customMass = 1234
  p.gameData.batteries.push({ capacityKWh: 5 })
  p.gameData.decoupler = { connectorId: '_connector1', force: 1000 }
  p.subPartGameData.push({ subPartTemplateId: 'Core.TrussBarA', tanks: [createTank()] })
  p.animations.push({
    id: 'anim_src1',
    name: 'Deploy',
    durationSec: 2,
    mode: 'actuate',
    joints: [{ id: 'joint_a', name: 'Hinge', parentJointId: null, memberInstanceIds: ['wing_1'] }],
    keyframes: [
      { id: 'kf0', timeSec: 0, poses: { joint_a: identityTransform() } },
      { id: 'kf1', timeSec: 2, poses: { joint_a: identityTransform() } },
    ],
    solarTracking: { degreesPerSecond: 10, subPartInstanceId: 'trussbara_2', excludeInstanceIds: ['trussbara_1'] },
  })
  return p
}

describe('buildProjectExport', () => {
  it('strips custom assets and stamps provenance', () => {
    const src = sourcePart()
    src.customTextures.push({ id: 'tex_1', name: 'T', width: 4, height: 4 })
    src.customMeshes.push({
      id: 'mesh_1',
      name: 'M',
      subPartId: 'sp_1',
      primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
      faceTextures: {},
    })
    const env = buildProjectExport(src, 'MyShip')
    expect(env.format).toBe(PROJECT_EXPORT_FORMAT)
    expect(env.version).toBe(PROJECT_EXPORT_VERSION)
    expect(env.projectName).toBe('MyShip')
    expect(env.sourcePartId).toBe('source_part')
    const data = env.data as unknown as Record<string, unknown>
    expect(data.customMeshes).toBeUndefined()
    expect(data.customTextures).toBeUndefined()
  })
})

describe('hasCustomAssets', () => {
  it('is false for a clean part and true with any custom mesh or texture', () => {
    expect(hasCustomAssets(createEmptyPart())).toBe(false)
    const withTex = createEmptyPart()
    withTex.customTextures.push({ id: 'tex_1', name: 'T', width: 1, height: 1 })
    expect(hasCustomAssets(withTex)).toBe(true)
  })
})

describe('mergeProjectImport into an empty project', () => {
  const env = buildProjectExport(sourcePart(), 'MyShip')
  const { part, summary, newLayerIds } = mergeProjectImport(createEmptyPart(), env)

  it('appends all meshes, connectors, kittens, and the animation', () => {
    expect(part.placements).toHaveLength(3)
    expect(part.connectors).toHaveLength(1)
    expect(part.kittens).toHaveLength(1)
    expect(part.animations).toHaveLength(1)
    expect(summary).toEqual({ meshes: 3, connectors: 1, kittens: 1, newLayers: 3, animations: 1 })
  })

  it('mirrors every source layer (including Default) as a NEW layer, leaving the existing Default empty', () => {
    expect(newLayerIds).toHaveLength(3)
    const names = part.layers.filter((l) => newLayerIds.includes(l.id)).map((l) => l.name).sort()
    expect(names).toEqual(['Default', 'Engines', 'Wings'])
    // The built-in Default still exists but holds nothing imported.
    expect(part.layers.some((l) => l.id === DEFAULT_LAYER_ID)).toBe(true)
    expect(part.placements.some((p) => p.layerId === DEFAULT_LAYER_ID)).toBe(false)
    expect(part.connectors[0].layerId).toBe(CONNECTOR_LAYER_ID)
    expect(part.kittens[0].layerId).toBe(KITTEN_LAYER_ID)
  })

  it('gives the animation a fresh id and points its member at an existing placement', () => {
    const anim = part.animations[0]
    expect(anim.id).not.toBe('anim_src1')
    const placementIds = new Set(part.placements.map((p) => p.instanceId))
    expect(anim.joints[0].memberInstanceIds.every((id) => placementIds.has(id))).toBe(true)
    expect(anim.solarTracking?.subPartInstanceId).toBe('trussbara_2')
    expect(anim.solarTracking?.excludeInstanceIds).toEqual(['trussbara_1'])
  })

  it('fills empty GameData fields and remaps the decoupler to the new connector', () => {
    expect(part.gameData.displayName).toBe('Source Display')
    expect(part.gameData.customMass).toBe(1234)
    expect(part.gameData.batteries).toHaveLength(1)
    expect(part.gameData.decoupler?.connectorId).toBe(part.connectors[0].id)
    expect(part.subPartGameData).toHaveLength(1)
  })
})

describe('mergeProjectImport into a non-empty project (remapping)', () => {
  it('avoids instanceId collisions and remaps animation references to the new ids', () => {
    const dest = createEmptyPart()
    dest.placements.push({
      instanceId: 'trussbara_1',
      subPartTemplateId: 'Core.TrussBarA',
      layerId: DEFAULT_LAYER_ID,
      ...t(0),
    })
    dest.gameData.displayName = 'Existing'
    dest.gameData.customMass = 99

    const env = buildProjectExport(sourcePart(), 'MyShip')
    const { part } = mergeProjectImport(dest, env)

    // Existing trussbara_1 + two imported TrussBarA → _2, _3 (no collision).
    const trussIds = part.placements
      .filter((p) => p.subPartTemplateId === 'Core.TrussBarA')
      .map((p) => p.instanceId)
    expect(trussIds).toEqual(['trussbara_1', 'trussbara_2', 'trussbara_3'])

    // Source solar-tracking drove 'trussbara_2' → must now point at the new 'trussbara_3'.
    const anim = part.animations[0]
    expect(anim.joints[0].memberInstanceIds).toEqual(['wing_1'])
    expect(anim.solarTracking?.subPartInstanceId).toBe('trussbara_3')
    expect(anim.solarTracking?.excludeInstanceIds).toEqual(['trussbara_2'])

    // Singular GameData kept; arrays appended; decoupler filled (was null) + remapped.
    expect(part.gameData.displayName).toBe('Existing')
    expect(part.gameData.customMass).toBe(99)
    expect(part.gameData.batteries).toHaveLength(1)
    expect(part.connectors.map((c) => c.id)).toContain(part.gameData.decoupler?.connectorId)
  })

  it('skips a coupling whose connector was not imported', () => {
    const src = sourcePart()
    src.connectors = [] // decoupler still references the (now absent) _connector1
    const env = buildProjectExport(src, 'X')
    const { part } = mergeProjectImport(createEmptyPart(), env)
    expect(part.gameData.decoupler).toBeNull()
  })

  it('drops solar-tracking when its drive subpart is dangling', () => {
    const src = sourcePart()
    src.animations[0].solarTracking!.subPartInstanceId = 'ghost_99'
    const env = buildProjectExport(src, 'X')
    const { part } = mergeProjectImport(createEmptyPart(), env)
    expect(part.animations[0].solarTracking).toBeNull()
  })
})

describe('parseProjectImport', () => {
  it('accepts a well-formed envelope', () => {
    const env = buildProjectExport(sourcePart(), 'X')
    const result = parseProjectImport(JSON.stringify(env))
    expect(result.ok).toBe(true)
  })

  it('rejects empty, non-JSON, wrong-format, future-version, and missing-data input', () => {
    const env = buildProjectExport(sourcePart(), 'X')
    expect(parseProjectImport('').ok).toBe(false)
    expect(parseProjectImport('not json').ok).toBe(false)
    expect(parseProjectImport('{}').ok).toBe(false)
    expect(parseProjectImport(JSON.stringify({ ...env, version: 999 })).ok).toBe(false)
    expect(parseProjectImport(JSON.stringify({ format: PROJECT_EXPORT_FORMAT, version: 1 })).ok).toBe(false)
  })

  it('backfills missing optional fields (editorTags, gameData, subPartGameData)', () => {
    const minimal = {
      format: PROJECT_EXPORT_FORMAT,
      version: 1,
      data: { layers: [], placements: [], connectors: [], kittens: [], animations: [] },
    }
    const result = parseProjectImport(JSON.stringify(minimal))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.env.data.editorTags).toEqual([])
      expect(result.env.data.subPartGameData).toEqual([])
      expect(result.env.data.gameData.customMass).toBeNull()
    }
  })
})
