import { describe, expect, it } from 'vitest'
import {
  CONNECTOR_LAYER_ID,
  DEFAULT_LAYER_ID,
  KITTEN_LAYER_ID,
  createEmptyPart,
  identityTransform,
  type EditingPart,
} from '../ksa/types'
import { buildProjectExport } from './projectTransfer'
import {
  PROJECT_EXPORT_FORMAT,
  PROJECT_EXPORT_VERSION,
  decodeProject,
  encodeProject,
  isCompactProject,
} from './projectCodec'

/** A transform whose every number is ≤6 decimals, so a single encode is lossless. */
function xf(p: [number, number, number], r: [number, number, number], s: [number, number, number]) {
  return {
    position: { x: p[0], y: p[1], z: p[2] },
    rotation: { x: r[0], y: r[1], z: r[2] },
    scale: { x: s[0], y: s[1], z: s[2] },
  }
}

/**
 * A maximally-populated project that exercises every codec branch: identity vs.
 * non-identity transforms, every GameData kind, both tank shapes, spot+point lights,
 * a glass kitten mesh with all material extras, and a chained animation with preset
 * AND bézier easings + solar tracking. All numbers are pre-rounded so one encode is
 * lossless and the decode must reproduce the input exactly.
 */
function richPart(): EditingPart {
  const p = createEmptyPart()
  p.partId = 'rich_part'
  p.editorTags = ['Structural', 'Lights']
  p.layers.push({ id: 'layer1', name: 'Engines' })

  p.placements.push(
    // Identity transform → compact form must omit p/r/s entirely.
    {
      instanceId: 'truss_1',
      subPartTemplateId: 'Core.TrussBarA',
      layerId: DEFAULT_LAYER_ID,
      ...identityTransform(),
    },
    {
      instanceId: 'wing_1',
      subPartTemplateId: 'Core.Wing',
      layerId: 'layer1',
      ...xf([1.5, -2.25, 0.125], [0.392699, 0, 1.570796], [2, 2, 2]),
    },
  )

  p.connectors.push({
    id: '_connector1',
    flags: ['Internal', 'ToSurface'],
    layerId: CONNECTOR_LAYER_ID,
    ...xf([0.5, 0, 0], [0, 0, 0], [1, 1, 1]),
  })

  p.kittens.push({
    id: 'kitten_1',
    kind: 'polaris',
    layerId: KITTEN_LAYER_ID,
    ...identityTransform(),
  })

  p.gameData.displayName = 'Rich Display'
  p.gameData.customMass = 1234.5
  p.gameData.batteries.push({ capacityWh: 5 }, { capacityWh: 10.25 })
  p.gameData.generators.push({ outputWatts: 100 })
  p.gameData.solarPanels.push(
    { outputWatts: 80, transform: identityTransform() },
    { outputWatts: 50, transform: xf([0, 1, 0], [0, 0.5, 0], [1, 1, 1]) },
  )
  p.gameData.powerConsumers.push({ consumedWatts: 12.5 })
  p.gameData.decoupler = { connectorId: '_connector1', force: 1000 }
  p.gameData.dockingPort = { connectorId: '_connector1', latchingImpulse: 50, pushoffForce: 25 }
  p.gameData.evaDoor = { connectorId: '_connector1' }

  p.subPartGameData.push({
    subPartTemplateId: 'Core.Wing',
    tanks: [
      {
        shape: 'Cylindrical',
        wallMaterialId: 'Aluminum.2014(s)',
        lengthM: 2,
        outerRadiusM: 0.5,
        wallThicknessMm: 2,
      },
      {
        shape: 'Spherical',
        wallMaterialId: 'Steel.A36(s)',
        lengthM: 0,
        outerRadiusM: 1.25,
        wallThicknessMm: 3,
      },
    ],
    solarPanels: [{ outputWatts: 30, transform: identityTransform() }],
    lights: [
      {
        type: 'Spot',
        transform: xf([0, 0, 1], [0, 0, 0], [1, 1, 1]),
        rangeM: 5,
        intensity: 10,
        color: { r: 1, g: 0.5, b: 0.25 },
        innerAngleRad: 0.392699,
        outerAngleRad: 0.785398,
        rayTracing: false,
      },
      {
        type: 'Point',
        transform: identityTransform(),
        rangeM: 8,
        intensity: 3,
        color: { r: 0.1, g: 0.2, b: 0.3 },
        innerAngleRad: 0,
        outerAngleRad: 0,
        rayTracing: true,
      },
    ],
  })

  p.customMeshes.push({
    id: 'mesh_k',
    name: 'Polaris Visor',
    subPartId: 'flexo_polaris_visor_abc',
    kitten: {
      kind: 'polaris',
      specKey: 'visor',
      diffuse: 'Textures/Characters/Kitten_Visor.ktx2',
      normal: 'Textures/Characters/Kitten_Visor_N.ktx2',
      aoRoughMetal: 'Textures/Characters/Kitten_Visor_ORM.ktx2',
      transparent: true,
    },
    faceTextures: {},
    emissive: { shape: 'whole', color: { r: 0, g: 255, b: 128 }, strength: 0.6 },
    glass: { tint: { r: 10, g: 200, b: 220 }, opacity: 0.45 },
    surface: 'glassGlow',
  })

  p.animations.push({
    id: 'anim_1',
    name: 'Deploy',
    durationSec: 3,
    mode: 'deployRetract',
    joints: [
      { id: 'joint_a', name: 'Hip', parentJointId: null, memberInstanceIds: ['wing_1'] },
      { id: 'joint_b', name: 'Knee', parentJointId: 'joint_a', memberInstanceIds: ['truss_1'] },
    ],
    keyframes: [
      {
        id: 'kf0',
        timeSec: 0,
        poses: { joint_a: identityTransform(), joint_b: identityTransform() },
        easings: { joint_a: { kind: 'preset', preset: 'easeInOut' } },
      },
      {
        id: 'kf1',
        timeSec: 3,
        poses: {
          joint_a: xf([0, 0, 0], [0, 0, 1.5], [1, 1, 1]),
          joint_b: xf([0, 0, 0], [0.75, 0, 0], [1, 1, 1]),
        },
        easings: { joint_b: { kind: 'cubicBezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } },
      },
    ],
    restKeyframeId: 'kf1',
    solarTracking: {
      degreesPerSecond: 10,
      subPartInstanceId: 'wing_1',
      excludeInstanceIds: ['truss_1'],
    },
  })

  return p
}

describe('projectCodec round-trip', () => {
  it('losslessly reconstructs a fully-populated project', () => {
    const env = buildProjectExport(richPart(), 'Rich')
    const decoded = decodeProject(encodeProject(env))
    expect(decoded.format).toBe(PROJECT_EXPORT_FORMAT)
    expect(decoded.version).toBe(PROJECT_EXPORT_VERSION)
    expect(decoded.projectName).toBe('Rich')
    expect(decoded.sourcePartId).toBe('rich_part')
    // The full data tree survives encode→decode unchanged (numbers are pre-rounded).
    expect(decoded.data).toEqual(env.data)
  })

  it('drops defaults from the wire form (identity transforms, constant layerIds)', () => {
    const env = buildProjectExport(richPart(), 'Rich')
    const c = encodeProject(env)
    // Identity placement carries only its ids — no transform keys.
    const identity = c.p?.find((x) => x.i === 'truss_1')
    expect(identity).toEqual({ i: 'truss_1', t: 'Core.TrussBarA', l: DEFAULT_LAYER_ID })
    // Connectors/kittens never serialize their (constant) layerId.
    expect(c.c?.[0]).not.toHaveProperty('l')
    expect(c.k?.[0]).not.toHaveProperty('l')
    // Cylindrical tank with the default material is the bare {l,r,w}; spherical sets sph.
    expect(c.sg?.[0].tk?.[0]).toEqual({ l: 2, r: 0.5, w: 2 })
    expect(c.sg?.[0].tk?.[1]).toMatchObject({ sph: 1, m: 'Steel.A36(s)' })
  })

  it('rounds high-precision floats to 6 decimals', () => {
    const p = createEmptyPart()
    p.placements.push({
      instanceId: 'a',
      subPartTemplateId: 'X',
      layerId: DEFAULT_LAYER_ID,
      ...xf([Math.PI, 0, 0], [0, 0, 0], [1, 1, 1]),
    })
    const decoded = decodeProject(encodeProject(buildProjectExport(p, 'P')))
    expect(decoded.data.placements[0].position.x).toBe(3.141593)
  })

  it('recognizes its own format marker', () => {
    expect(isCompactProject({ f: PROJECT_EXPORT_FORMAT, v: 1 })).toBe(true)
    expect(isCompactProject({ format: PROJECT_EXPORT_FORMAT })).toBe(false)
    expect(isCompactProject(null)).toBe(false)
  })
})
