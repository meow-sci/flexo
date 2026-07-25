import { describe, it, expect } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import type { Document as XmlDocument, Element as XmlElement } from '@xmldom/xmldom'
import { serializeGameData, serializePart } from './partXmlSerializer'
import type { Connector, EditingPart, SubPartPlacement } from './types'
import {
  createCombustor,
  createDefaultLayer,
  createEmptyGameData,
  createLight,
  createNozzle,
  createSubPartGameData,
  identityTransform,
  createTank,
  DEFAULT_LAYER_ID,
  EULER_ZERO,
  KITTEN_LAYER_ID,
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
    subPartGameData: [],
    layers: [createDefaultLayer()],
    placements: [],
    connectors: [],
    kittens: [],
    customTextures: [],
    customMaterials: [],
    customMeshes: [],
    animations: [],
    customReactions: [],
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
    capabilities: [],
    siblingIds: [],
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
  const TANK_TMPL = 'CoreFuelTankA_Subpart_Skin2W1HB'
  const part = editingPart({
    editorTags: ['Structural', 'RCS'],
    gameData: {
      ...createEmptyGameData(),
      displayName: 'My Tank',
      customMass: 250,
      diameterM: 2,
      controllable: true,
      batteries: [{ capacityWh: 0.5 }],
      generators: [{ outputWatts: 12 }],
      solarPanels: [
        {
          outputWatts: 200,
          transform: { ...identityTransform(), rotation: { x: 0, y: 1.5708, z: 0 } },
        },
      ],
      powerConsumer: { consumedWatts: 5, lightSwitch: true, lightIsActive: true },
      decoupler: { connectorId: '_connector2', force: 750 },
      dockingPort: {
        connectorId: '_connector3',
        latchingKineticEnergyJ: 6000,
        pushoffImpulseNs: 7000,
      },
      evaDoor: { connectorId: '_connector3' },
    },
    subPartGameData: [
      {
        ...createSubPartGameData(TANK_TMPL),
        tanks: [
          {
            ...createTank(),
            shape: 'Cylindrical',
            lengthM: 3,
            outerRadiusM: 0.8,
            wallThicknessMm: 2.5,
          },
          { ...createTank(), shape: 'Spherical', wallMaterialId: 'Steel(s)', outerRadiusM: 1.2 },
        ],
        solarPanels: [{ outputWatts: 50, transform: identityTransform() }],
        lights: [
          {
            ...createLight(),
            type: 'Spot',
            transform: {
              ...identityTransform(),
              position: { x: 0.38, y: 0.21, z: 0 },
              rotation: { x: 0, y: 0, z: 1.5708 },
            },
            rangeM: 5,
            intensity: 10,
            color: { r: 1, g: 0.5, b: 0.25 },
            innerAngleRad: 0.392599,
            outerAngleRad: 0.785398,
            rayTracing: true,
          },
          { ...createLight(), type: 'Point', rangeM: 2, intensity: 2 },
        ],
        combustors: [],
        nozzles: [],
        rockets: [],
        unknownAttrs: {},
        unknownChildren: [],
      },
    ],
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
    expect(tags(doc, 'EditorTag').map((e) => e.getAttribute('Value'))).toEqual([
      'Structural',
      'RCS',
    ])
  })

  it('emits custom mass in kg', () => {
    expect(child(gd, 'CustomMass')!.getElementsByTagName('Mass')[0].getAttribute('Kg')).toBe('250')
  })

  it('emits <Diameter M> (plain meters) and a bare <Control/> marker', () => {
    const diameter = child(gd, 'Diameter')!
    expect(diameter.getAttribute('M')).toBe('2')
    expect(diameter.hasAttribute('Cm')).toBe(false)
    const control = child(gd, 'Control')!
    expect(control).not.toBeNull()
    expect(control.attributes.length).toBe(0)
    expect(control.childNodes.length).toBe(0)
  })

  it('emits tanks nested under <SubPartGameData><Tank><CylindricalTank/SphericalTank>', () => {
    const spd = tags(doc, 'SubPartGameData')[0]
    expect(spd.getAttribute('Id')).toBe(TANK_TMPL)
    const tankEls = tags(spd, 'Tank')
    expect(tankEls.length).toBe(2)
    const cyl = tankEls[0].getElementsByTagName('CylindricalTank')[0]
    expect(cyl.getElementsByTagName('Length')[0].getAttribute('M')).toBe('3')
    expect(cyl.getElementsByTagName('OuterRadius')[0].getAttribute('M')).toBe('0.8')
    expect(cyl.getElementsByTagName('WallThickness')[0].getAttribute('Mm')).toBe('2.5')
    const sph = tankEls[1].getElementsByTagName('SphericalTank')[0]
    expect(sph.getElementsByTagName('Length').length).toBe(0)
    expect(sph.getElementsByTagName('Material')[0].getAttribute('Id')).toBe('Steel(s)')
  })

  it('emits <Light> with Type/Transform/Range/Intensity/Color under <SubPartGameData>', () => {
    const spd = tags(doc, 'SubPartGameData')[0]
    const lightEls = tags(spd, 'Light')
    expect(lightEls.length).toBe(2)
    const spot = lightEls[0]
    expect(child(spot, 'Type')!.textContent).toBe('Spot')
    expect(child(spot, 'Range')!.getAttribute('Value')).toBe('5')
    expect(child(spot, 'Intensity')!.getAttribute('Value')).toBe('10')
    const color = child(spot, 'Color')!
    expect(color.getAttribute('R')).toBe('1')
    expect(color.getAttribute('G')).toBe('0.5')
    expect(color.getAttribute('B')).toBe('0.25')
    const rot = child(child(spot, 'Transform')!, 'Rotation')!
    expect(rot.getAttribute('Z')).toBe('1.5708')
    // Scale is never emitted for lights (KSA ignores it).
    expect(child(child(spot, 'Transform')!, 'Scale')).toBeNull()
  })

  it('emits InnerAngle/OuterAngle + <RayTracing> only for the right lights', () => {
    const spd = tags(doc, 'SubPartGameData')[0]
    const [spot, point] = tags(spd, 'Light')
    // Spot keeps cone angles (radians) and the explicit ray-tracing flag.
    expect(child(spot, 'InnerAngle')!.getAttribute('Value')).toBe('0.392599')
    expect(child(spot, 'OuterAngle')!.getAttribute('Value')).toBe('0.785398')
    expect(child(spot, 'RayTracing')!.textContent).toBe('true')
    // Point light omits cone angles, and an unset ray-tracing flag is dropped.
    expect(child(point, 'Type')!.textContent).toBe('Point')
    expect(child(point, 'InnerAngle')).toBeNull()
    expect(child(point, 'OuterAngle')).toBeNull()
    expect(child(point, 'RayTracing')).toBeNull()
  })

  it('emits a SubPart whose only data is a <Light> (not pruned as empty)', () => {
    const SP = 'Custom_Subpart_Lamp'
    const lightOnly = parse(
      serializeGameData(
        editingPart({
          subPartGameData: [{ ...createSubPartGameData(SP), lights: [createLight()] }],
        }),
      ),
    )
    const spd = tags(lightOnly, 'SubPartGameData').find((e) => e.getAttribute('Id') === SP)!
    expect(spd).toBeDefined()
    expect(tags(spd, 'Light').length).toBe(1)
  })

  it('emits power modules with KSA EnergyReference/PowerReference attributes (J / W)', () => {
    // Battery capacity is Wh in the model, joules in the XML (1 Wh = 3600 J).
    expect(child(tags(doc, 'Battery')[0], 'MaximumCapacity')!.getAttribute('J')).toBe('1800')
    expect(child(tags(doc, 'Generator')[0], 'Produced')!.getAttribute('W')).toBe('12')
    expect(child(tags(doc, 'PowerConsumer')[0], 'Consumed')!.getAttribute('W')).toBe('5')
  })

  it('emits a single <PowerConsumer> per part (KSA has one Part.LightSwitch slot)', () => {
    // The part defines one consumer; only one element is emitted.
    expect(tags(doc, 'PowerConsumer').length).toBe(1)
  })

  it('emits PowerConsumer LightSwitch/LightIsActive flags only when set', () => {
    const lit = tags(doc, 'PowerConsumer')[0]
    expect(lit.getAttribute('LightSwitch')).toBe('true')
    expect(lit.getAttribute('LightIsActive')).toBe('true')

    // Default-false flags are omitted; KSA reads absent attrs as false.
    const plainDoc = parse(
      serializeGameData(
        editingPart({
          gameData: {
            ...createEmptyGameData(),
            powerConsumer: { consumedWatts: 3, lightSwitch: false, lightIsActive: false },
          },
        }),
      ),
    )
    const plain = tags(plainDoc, 'PowerConsumer')[0]
    expect(plain.hasAttribute('LightSwitch')).toBe(false)
    expect(plain.hasAttribute('LightIsActive')).toBe(false)
  })

  it('emits part-level <SolarPanel> with Produced W + orientation Transform', () => {
    const sp = tags(doc, 'SolarPanel').find((el) => el.parentNode === gd)!
    expect(child(sp, 'Produced')!.getAttribute('W')).toBe('200')
    const rot = child(child(sp, 'Transform')!, 'Rotation')!
    expect(rot.getAttribute('Y')).toBe('1.5708')
  })

  it('emits SubPart-level <SolarPanel> alongside tanks', () => {
    const spd = tags(doc, 'SubPartGameData')[0]
    expect(child(spd, 'SolarPanel')!.getElementsByTagName('Produced')[0].getAttribute('W')).toBe(
      '50',
    )
  })

  it('emits every connector, with <Flags> only when set', () => {
    const connectors = tags(doc, 'Connector')
    expect(connectors.map((e) => e.getAttribute('Id'))).toEqual([
      '_connector1',
      '_connector2',
      '_connector3',
    ])
    expect(child(connectors[0], 'Flags')).toBeNull()
    expect(child(connectors[1], 'Flags')!.textContent).toBe('ToSurface')
    expect(child(connectors[2], 'Flags')!.textContent).toBe('Internal')
  })

  it('emits decoupler / docking port / EVA door', () => {
    const dec = tags(doc, 'Decoupler')[0]
    expect(dec.getAttribute('ConnectorId')).toBe('_connector2')
    expect(dec.getAttribute('Force')).toBe('750')
    const dp = tags(doc, 'DockingPort')[0]
    expect(child(dp, 'ConnectorId')!.getAttribute('Value')).toBe('_connector3')
    expect(child(dp, 'LatchingKineticEnergy')!.getAttribute('J')).toBe('6000')
    expect(child(dp, 'PushoffImpulse')!.getAttribute('Ns')).toBe('7000')
    expect(tags(doc, 'EVADoor')[0].getAttribute('ConnectorId')).toBe('_connector3')
  })

  it('omits empty/default game data entirely', () => {
    const bare = parse(serializeGameData(editingPart({ connectors: [] })))
    const bareGd = tags(bare, 'PartGameData')[0]
    expect(bareGd.hasAttribute('DisplayName')).toBe(false)
    expect(tags(bare, 'CustomMass').length).toBe(0)
    expect(tags(bare, 'SubPartGameData').length).toBe(0)
    expect(tags(bare, 'Decoupler').length).toBe(0)
    expect(tags(bare, 'Diameter').length).toBe(0)
    expect(tags(bare, 'Control').length).toBe(0)
  })

  // --- Engine modules ---

  it('emits a reusable thrust chamber (Rocket/Combustor/DeLavalNozzle) under SubPartGameData', () => {
    const TMPL = 'CorePropulsionA_Subpart_EngineALargeVacAssembly'
    const enginePart = editingPart({
      subPartGameData: [
        {
          ...createSubPartGameData(TMPL),
          combustors: [
            {
              id: 'ThrustChamber',
              reactionId: 'Hydrolox',
              mixtureRatio: 5.5,
              maxPressurePa: 4_900_000, // 49 bar
              thermalEfficiency: 1, // default → omitted
              minimumThrottle: 0.1, // non-default → emitted
              minimumPulseTimeS: null,
              feeds: [],
              plumbing: 'Bulk' as const,
            },
          ],
          nozzles: [
            {
              id: 'Nozzle',
              exitDiameterM: 2.5,
              fxExitDiameterM: 1.439,
              areaRatio: 49,
              flowEfficiency: 1,
              expansionEfficiency: 1,
              exhaustLocation: { x: -1.23, y: 0, z: 0 },
              exhaustDirection: { x: -1, y: 0, z: 0 }, // default → omitted
              fxExhaustLocation: null,
              fxExhaustDirection: null,
              volumetricExhaustId: 'EngineALarge',
              plumeTrailId: 'DefaultEngine',
              exhaustLight: true,
              sound: { action: 'On', soundId: 'DefaultEngineSoundBehavior' },
            },
          ],
          rockets: [
            {
              id: 'Engine',
              core: { id: 'ThrustChamber', subPartInstanceId: null },
              nozzles: [{ id: 'Nozzle', subPartInstanceId: null }],
            },
          ],
        },
      ],
    })
    const sdoc = parse(serializeGameData(enginePart))
    const spd = tags(sdoc, 'SubPartGameData').find((e) => e.getAttribute('Id') === TMPL)!

    const rocket = child(spd, 'Rocket')!
    expect(rocket.getAttribute('Id')).toBe('Engine')
    expect(child(rocket, 'Core')!.getAttribute('Id')).toBe('ThrustChamber')
    expect(child(rocket, 'Core')!.hasAttribute('SubPartId')).toBe(false)
    expect(child(rocket, 'Nozzle')!.getAttribute('Id')).toBe('Nozzle')

    const comb = child(spd, 'Combustor')!
    const reaction = child(comb, 'Reaction')!
    expect(reaction.getAttribute('Id')).toBe('Hydrolox')
    expect(child(reaction, 'MixtureRatio')!.textContent).toBe('5.5')
    expect(child(comb, 'MaxPressure')!.getAttribute('Bar')).toBe('49')
    expect(child(comb, 'ThermalEfficiency')).toBeNull() // default 1 omitted
    expect(child(comb, 'MinimumThrottle')!.getAttribute('Value')).toBe('0.1')

    const noz = child(spd, 'DeLavalNozzle')!
    expect(child(noz, 'ExitDiameter')!.getAttribute('M')).toBe('2.5')
    expect(child(noz, 'FxExitDiameter')!.getAttribute('M')).toBe('1.439')
    expect(child(noz, 'AreaRatio')!.getAttribute('Value')).toBe('49')
    expect(child(noz, 'FlowEfficiency')).toBeNull() // default 1 omitted
    expect(child(noz, 'ExhaustLocation')!.getAttribute('X')).toBe('-1.23')
    expect(child(noz, 'ExhaustDirection')).toBeNull() // default (-1,0,0) omitted
    expect(child(noz, 'VolumetricExhaust')!.getAttribute('Id')).toBe('EngineALarge')
    expect(child(noz, 'PlumeTrail')!.getAttribute('Id')).toBe('DefaultEngine')
    expect(child(noz, 'SoundEvent')!.getAttribute('SoundId')).toBe('DefaultEngineSoundBehavior')
    expect(child(noz, 'ExhaustLight')).toBeNull() // default true omitted
  })

  it('emits a small nozzle diameter as Cm (under 1 m)', () => {
    const part2 = editingPart({
      subPartGameData: [
        {
          ...createSubPartGameData('T'),
          nozzles: [{ ...createNozzle('N'), exitDiameterM: 0.268, exhaustLight: false }],
        },
      ],
    })
    const sdoc = parse(serializeGameData(part2))
    const noz = tags(sdoc, 'DeLavalNozzle')[0]
    expect(child(noz, 'ExitDiameter')!.getAttribute('Cm')).toBe('26.8')
    expect(child(noz, 'ExitDiameter')!.hasAttribute('M')).toBe(false)
    // ExhaustLight only emitted when disabled.
    expect(child(noz, 'ExhaustLight')!.getAttribute('Value')).toBe('false')
  })

  it('emits the part-level controller, gas-generator, and gimbal overlays', () => {
    const enginePart = editingPart({
      gameData: {
        ...createEmptyGameData(),
        rocketControllers: [
          {
            id: 'LR91-AJ-3',
            kind: 'engine',
            rocketRefs: [
              {
                id: 'Engine',
                subPartInstanceId: 'CorePropulsionA_Subpart_EngineALargeVacAssembly2',
              },
              { id: 'GasGenerator', subPartInstanceId: null },
            ],
            controlMapFlags: null,
          },
        ],
        rockets: [
          {
            id: 'GasGenerator',
            core: { id: 'GasGeneratorChamber', subPartInstanceId: null },
            nozzles: [{ id: 'TurbineExhaustNozzle', subPartInstanceId: 'turbo_2' }],
          },
        ],
        combustors: [createCombustor('GasGeneratorChamber')],
        gimbals: [
          {
            subPartInstanceId: 'asm_2',
            maxAngleYDeg: 5,
            maxAngleZDeg: 5,
            constrainToCircle: false,
          },
          {
            subPartInstanceId: 'turbo_2',
            maxAngleYDeg: 70,
            maxAngleZDeg: 0,
            constrainToCircle: true,
          },
        ],
      },
    })
    const sdoc = parse(serializeGameData(enginePart))

    const ctrl = tags(sdoc, 'RocketEngineController')[0]
    expect(ctrl.getAttribute('Id')).toBe('LR91-AJ-3')
    const refs = tags(ctrl, 'RocketReference')
    expect(refs[0].getAttribute('SubPartId')).toBe(
      'CorePropulsionA_Subpart_EngineALargeVacAssembly2',
    )
    expect(refs[1].hasAttribute('SubPartId')).toBe(false) // root-part rocket ref

    // Gas-generator nozzle ref carries its SubPart instance.
    const ggNozzle = child(tags(sdoc, 'Rocket')[0], 'Nozzle')!
    expect(ggNozzle.getAttribute('SubPartId')).toBe('turbo_2')

    // Two gimbal overlays under <SubPart Id=instance>; the actuating-Y-only one omits Z.
    const subPartOverlays = tags(sdoc, 'SubPart').filter((s) => child(s, 'Gimbal'))
    expect(subPartOverlays.map((s) => s.getAttribute('Id'))).toEqual(['asm_2', 'turbo_2'])
    const asmGimbal = child(subPartOverlays[0], 'Gimbal')!
    expect(child(asmGimbal, 'MaxAngleY')!.getAttribute('Degrees')).toBe('5')
    expect(child(asmGimbal, 'ConstrainToCircle')!.getAttribute('Value')).toBe('false')
    const turboGimbal = child(subPartOverlays[1], 'Gimbal')!
    expect(child(turboGimbal, 'MaxAngleY')!.getAttribute('Degrees')).toBe('70')
    expect(child(turboGimbal, 'MaxAngleZ')).toBeNull() // 0 → omitted
    expect(child(turboGimbal, 'ConstrainToCircle')).toBeNull() // default true → omitted
  })

  it('does not emit a fixed (0/0) gimbal overlay', () => {
    const part2 = editingPart({
      gameData: {
        ...createEmptyGameData(),
        gimbals: [
          { subPartInstanceId: 'x', maxAngleYDeg: 0, maxAngleZDeg: 0, constrainToCircle: true },
        ],
      },
    })
    const sdoc = parse(serializeGameData(part2))
    expect(tags(sdoc, 'Gimbal').length).toBe(0)
  })

  // Kittens are editor-only visual aides — they must never leak into export.
  it('never serializes kittens into Part or GameData XML', () => {
    const withKitten = editingPart({
      partId: 'HostPart',
      placements: [placement({ instanceId: 'p_1', subPartTemplateId: 'Core.A' })],
      kittens: [
        {
          id: 'kitten_1',
          kind: 'hunter',
          position: { ...VEC3_ZERO },
          rotation: { ...EULER_ZERO },
          scale: { ...VEC3_ONE },
          layerId: KITTEN_LAYER_ID,
        },
      ],
    })
    const partXml = serializePart(withKitten)
    const gameXml = serializeGameData(withKitten)
    for (const xml of [partXml, gameXml]) {
      expect(xml.toLowerCase()).not.toContain('kitten')
      expect(xml).not.toContain('hunter')
    }
    // The real part content is still emitted.
    expect(partXml).toContain('Core.A')
  })
})
