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
  envelopeToPart,
  hasCustomAssets,
  mergeProjectImport,
  parseProjectImport,
  serializeProjectJson,
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
    {
      instanceId: 'trussbara_1',
      subPartTemplateId: 'Core.TrussBarA',
      layerId: DEFAULT_LAYER_ID,
      ...t(1),
    },
    { instanceId: 'trussbara_2', subPartTemplateId: 'Core.TrussBarA', layerId: 'layer1', ...t(2) },
    { instanceId: 'wing_1', subPartTemplateId: 'Core.Wing', layerId: 'layer2', ...t(3) },
  )
  p.connectors.push({
    id: '_connector1',
    flags: ['Internal'],
    layerId: CONNECTOR_LAYER_ID,
    ...t(0),
  })
  p.kittens.push({ id: 'kitten_1', kind: 'hunter', layerId: KITTEN_LAYER_ID, ...t(0) })
  p.editorTags.push('Structural')
  p.gameData.displayName = 'Source Display'
  p.gameData.customMass = 1234
  p.gameData.batteries.push({ capacityWh: 5 })
  p.gameData.solarPanels.push({ outputWatts: 80, transform: identityTransform() })
  p.gameData.decoupler = { connectorId: '_connector1', force: 1000 }
  // Engine modules whose SubPart-instance refs (→ trussbara_2) must be remapped on import.
  p.gameData.rocketControllers.push({
    id: 'Engine1',
    kind: 'engine',
    rocketRefs: [{ id: 'Engine', subPartInstanceId: 'trussbara_2' }],
    controlMapFlags: null,
  })
  p.gameData.gimbals.push({
    subPartInstanceId: 'trussbara_2',
    maxAngleYDeg: 3,
    maxAngleZDeg: 3,
    constrainToCircle: false,
  })
  p.customCombustionProcesses.push({
    id: 'MyKerolox_2.6',
    name: 'Custom Kerolox',
    reactants: [{ phaseId: 'Kerosene(l)', massShare: 1 }],
    lut: [{ lnPressure: 9.5, temperatureK: 3200, gamma: 1.22, molarMassGPerMol: 22.4 }],
  })
  p.subPartGameData.push({
    subPartTemplateId: 'Core.TrussBarA',
    tanks: [createTank()],
    solarPanels: [],
    lights: [],
    combustors: [],
    nozzles: [],
    rockets: [],
  })
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
    solarTracking: {
      degreesPerSecond: 10,
      subPartInstanceId: 'trussbara_2',
      excludeInstanceIds: ['trussbara_1'],
    },
  })
  return p
}

/** A part-ified kitten submesh descriptor (pure data — references game assets). */
function kittenMesh(subPartId = 'flexo_hunter_suit_abc') {
  return {
    id: 'mesh_k',
    name: 'Hunter Suit',
    subPartId,
    kitten: {
      kind: 'hunter' as const,
      specKey: 'suit',
      diffuse: 'Textures/Characters/Kitten_EMU_A.ktx2',
    },
    faceTextures: {},
  }
}

/** A primitive (binary-backed) custom mesh descriptor. */
function primitiveMesh() {
  return {
    id: 'mesh_1',
    name: 'M',
    subPartId: 'sp_1',
    primitive: { kind: 'box' as const, params: { width: 1, height: 1, depth: 1 } },
    faceTextures: {},
  }
}

describe('buildProjectExport', () => {
  it('carries kitten meshes, drops primitive meshes + uploaded textures, stamps provenance', () => {
    const src = sourcePart()
    src.customTextures.push({ id: 'tex_1', name: 'T', width: 4, height: 4 })
    src.customMeshes.push(primitiveMesh(), kittenMesh())
    const env = buildProjectExport(src, 'MyShip')
    expect(env.format).toBe(PROJECT_EXPORT_FORMAT)
    expect(env.version).toBe(PROJECT_EXPORT_VERSION)
    expect(env.projectName).toBe('MyShip')
    expect(env.sourcePartId).toBe('source_part')
    // Only the kitten mesh is carried; the primitive is dropped; textures never exported.
    expect(env.data.customMeshes).toHaveLength(1)
    expect(env.data.customMeshes[0].subPartId).toBe('flexo_hunter_suit_abc')
    const data = env.data as unknown as Record<string, unknown>
    expect(data.customTextures).toBeUndefined()
  })
})

describe('hasCustomAssets', () => {
  it('flags uploaded textures and primitive meshes, but not kitten meshes', () => {
    expect(hasCustomAssets(createEmptyPart())).toBe(false)

    const withTex = createEmptyPart()
    withTex.customTextures.push({ id: 'tex_1', name: 'T', width: 1, height: 1 })
    expect(hasCustomAssets(withTex)).toBe(true)

    const withPrimitive = createEmptyPart()
    withPrimitive.customMeshes.push(primitiveMesh())
    expect(hasCustomAssets(withPrimitive)).toBe(true)

    const withKitten = createEmptyPart()
    withKitten.customMeshes.push(kittenMesh())
    expect(hasCustomAssets(withKitten)).toBe(false)
  })
})

describe('mergeProjectImport with a kitten mesh', () => {
  function kittenSource(): EditingPart {
    const p = createEmptyPart()
    p.layers.push({ id: 'layer1', name: 'Hunter Mesh' })
    p.customMeshes.push(kittenMesh())
    p.placements.push({
      instanceId: 'hunter_suit_1',
      subPartTemplateId: 'flexo_hunter_suit_abc',
      layerId: 'layer1',
      ...t(0),
    })
    return p
  }

  it('restores the kitten mesh under a fresh subPartId and repoints its placement', () => {
    const env = buildProjectExport(kittenSource(), 'K')
    const { part } = mergeProjectImport(createEmptyPart(), env)
    expect(part.customMeshes).toHaveLength(1)
    const mesh = part.customMeshes[0]
    expect(mesh.kitten?.specKey).toBe('suit')
    expect(mesh.subPartId).not.toBe('flexo_hunter_suit_abc') // fresh, collision-free id
    expect(mesh.subPartId.startsWith('flexo_hunter_suit_')).toBe(true)
    // The placement points at the NEW template id, and nothing references the source's.
    expect(part.placements.some((pl) => pl.subPartTemplateId === mesh.subPartId)).toBe(true)
    expect(part.placements.some((pl) => pl.subPartTemplateId === 'flexo_hunter_suit_abc')).toBe(
      false,
    )
  })

  it('duplicates the kitten mesh under another fresh id on a second import (additive)', () => {
    const env = buildProjectExport(kittenSource(), 'K')
    const once = mergeProjectImport(createEmptyPart(), env).part
    const twice = mergeProjectImport(once, env).part
    const ids = twice.customMeshes.map((m) => m.subPartId)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2) // distinct ids, no collision
    const kittenPlacements = twice.placements.filter((pl) =>
      pl.subPartTemplateId.startsWith('flexo_hunter_suit_'),
    )
    expect(kittenPlacements).toHaveLength(2)
    expect(kittenPlacements.every((pl) => new Set(ids).has(pl.subPartTemplateId))).toBe(true)
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
    const names = part.layers
      .filter((l) => newLayerIds.includes(l.id))
      .map((l) => l.name)
      .sort()
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
    // The custom propellant + engine controller/gimbal are carried in.
    expect(part.customCombustionProcesses.map((c) => c.id)).toEqual(['MyKerolox_2.6'])
    expect(part.gameData.rocketControllers).toHaveLength(1)
    expect(part.gameData.gimbals).toHaveLength(1)
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

    // Engine controller + gimbal refs that targeted 'trussbara_2' follow it to 'trussbara_3'.
    expect(part.gameData.rocketControllers[0].rocketRefs[0].subPartInstanceId).toBe('trussbara_3')
    expect(part.gameData.gimbals[0].subPartInstanceId).toBe('trussbara_3')
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
  it('accepts a well-formed compact project', () => {
    const json = serializeProjectJson(buildProjectExport(sourcePart(), 'X'))
    const result = parseProjectImport(json)
    expect(result.ok).toBe(true)
  })

  it('rejects empty, non-JSON, wrong-format, and future-version input', () => {
    expect(parseProjectImport('').ok).toBe(false)
    expect(parseProjectImport('not json').ok).toBe(false)
    expect(parseProjectImport('{}').ok).toBe(false) // no format marker
    expect(parseProjectImport(JSON.stringify({ f: 'something-else', v: 1 })).ok).toBe(false)
    expect(parseProjectImport(JSON.stringify({ f: PROJECT_EXPORT_FORMAT, v: 999 })).ok).toBe(false)
  })

  it('backfills every optional field from a bare-marker payload', () => {
    const result = parseProjectImport(
      JSON.stringify({ f: PROJECT_EXPORT_FORMAT, v: PROJECT_EXPORT_VERSION }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.env.data.editorTags).toEqual([])
      expect(result.env.data.layers).toEqual([])
      expect(result.env.data.placements).toEqual([])
      expect(result.env.data.subPartGameData).toEqual([])
      expect(result.env.data.customMeshes).toEqual([])
      expect(result.env.data.gameData.customMass).toBeNull()
    }
  })
})

describe('envelopeToPart', () => {
  it('faithfully reconstructs a standalone part (no id remapping) with built-in layers', () => {
    const env = buildProjectExport(sourcePart(), 'MyShip')
    const part = envelopeToPart(env)
    expect(part.partId).toBe('source_part')
    // Ids preserved verbatim — unlike the additive merge, nothing is regenerated.
    expect(part.placements.map((p) => p.instanceId)).toEqual([
      'trussbara_1',
      'trussbara_2',
      'wing_1',
    ])
    expect(part.connectors[0].id).toBe('_connector1')
    expect(part.animations[0].id).toBe('anim_src1')
    expect(part.gameData.decoupler?.connectorId).toBe('_connector1')
    // The three undeletable built-in layers are present.
    for (const id of [DEFAULT_LAYER_ID, CONNECTOR_LAYER_ID, KITTEN_LAYER_ID]) {
      expect(part.layers.some((l) => l.id === id)).toBe(true)
    }
    // Binary-backed assets always start empty.
    expect(part.customTextures).toEqual([])
  })
})
