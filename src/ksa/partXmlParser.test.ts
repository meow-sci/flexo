import { describe, it, expect, vi } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import {
  animationModulesFromGameData,
  connectorsFromPartElement,
  gameDataFromAssets,
  parseConnectorFlags,
  parsePartPlacements,
} from './partXmlParser'
import { serializeGameData, serializePart } from './partXmlSerializer'
import type { Connector, EditingPart } from './types'
import {
  createCombustor,
  createDefaultLayer,
  createEmptyGameData,
  createLight,
  createSubPartGameData,
  EDITOR_TAG_DEFS,
  identityTransform,
  createTank,
  DEFAULT_LAYER_ID,
  KNOWN_EDITOR_TAGS,
} from './types'

function editingPart(over: Partial<EditingPart>): EditingPart {
  return {
    partId: 'TestPart',
    editorTags: [],
    gameData: createEmptyGameData(),
    subPartGameData: [],
    layers: [createDefaultLayer()],
    placements: [],
    connectors: [],
    kittens: [],
    customTextures: [],
    customMeshes: [],
    animations: [],
    customReactions: [],
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
        siblingIds: [],
        layerId: DEFAULT_LAYER_ID,
      },
      {
        id: '_connector2',
        position: { x: -0.5, y: 0, z: 0 },
        rotation: { x: 3.14159, y: 0, z: 3.14159 },
        scale: { x: 1, y: 1, z: 1 },
        flags: ['Internal', 'FromSurface'],
        siblingIds: [],
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

  it('round-trips <Sibling> attach-node grouping (KSA 2026.7 multi-mount prefabs)', () => {
    const withSiblings = editingPart({
      connectors: [
        {
          id: '_connector1',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          flags: [],
          siblingIds: ['_connector2', '_connector3'],
          layerId: DEFAULT_LAYER_ID,
        },
      ],
    })
    const reparsed = connectorsFromPartElement(partElement(serializePart(withSiblings)))
    expect(reparsed[0].siblingIds).toEqual(['_connector2', '_connector3'])
  })
})

describe('gameDataFromAssets (round-trip with serializeGameData)', () => {
  const TANK_TMPL = 'CoreFuelTankA_Subpart_Skin2W1HB'
  const source = editingPart({
    partId: 'GD',
    editorTags: ['Tanks', 'Structural'],
    gameData: {
      ...createEmptyGameData(),
      displayName: 'Round Trip',
      customMass: 42,
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
      powerConsumer: { consumedWatts: 3, lightSwitch: true, lightIsActive: true },
      decoupler: { connectorId: '_c2', force: 750 },
      dockingPort: { connectorId: '_c3', latchingKineticEnergyJ: 6000, pushoffImpulseNs: 7000 },
      evaDoor: { connectorId: '_c3' },
    },
    subPartGameData: [
      {
        subPartTemplateId: TANK_TMPL,
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
      {
        id: '_c2',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        flags: ['ToSurface'],
        siblingIds: [],
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

  it('recovers part diameter (size class) and the command marker', () => {
    expect(parsed.gameData.diameterM).toBe(2)
    expect(parsed.gameData.controllable).toBe(true)
  })

  it('recovers lights per SubPart template (type, transform, color, angles, ray tracing)', () => {
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === TANK_TMPL)
    expect(spd?.lights.map((l) => l.type)).toEqual(['Spot', 'Point'])
    const spot = spd!.lights[0]
    expect(spot.transform.position).toEqual({ x: 0.38, y: 0.21, z: 0 })
    expect(spot.transform.rotation.z).toBeCloseTo(1.5708, 4)
    expect(spot.rangeM).toBe(5)
    expect(spot.intensity).toBe(10)
    expect(spot.color.r).toBeCloseTo(1, 5)
    expect(spot.color.g).toBeCloseTo(0.5, 5)
    expect(spot.color.b).toBeCloseTo(0.25, 5)
    expect(spot.innerAngleRad).toBeCloseTo(0.392599, 5)
    expect(spot.outerAngleRad).toBeCloseTo(0.785398, 5)
    expect(spot.rayTracing).toBe(true)
    // Point light: no ray tracing, cone angles fall back to KSA defaults.
    expect(spd!.lights[1].rayTracing).toBe(false)
    expect(spd!.lights[1].rangeM).toBe(2)
  })

  it('recovers tanks and solar panels per SubPart template (shape, material, dims)', () => {
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === TANK_TMPL)
    expect(spd?.tanks.map((t) => t.shape)).toEqual(['Cylindrical', 'Spherical'])
    expect(spd?.tanks[0].lengthM).toBe(3)
    expect(spd?.tanks[1].wallMaterialId).toBe('Steel(s)')
    expect(spd?.solarPanels[0].outputWatts).toBe(50)
  })

  it('recovers power and coupling', () => {
    expect(parsed.gameData.batteries[0].capacityWh).toBeCloseTo(0.5, 6)
    expect(parsed.gameData.generators[0].outputWatts).toBe(12)
    expect(parsed.gameData.solarPanels[0].outputWatts).toBe(200)
    expect(parsed.gameData.solarPanels[0].transform.rotation.y).toBeCloseTo(1.5708, 4)
    expect(parsed.gameData.powerConsumer).toEqual({
      consumedWatts: 3,
      lightSwitch: true,
      lightIsActive: true,
    })
    expect(parsed.gameData.decoupler).toEqual({ connectorId: '_c2', force: 750 })
    expect(parsed.gameData.dockingPort).toEqual({
      connectorId: '_c3',
      latchingKineticEnergyJ: 6000,
      pushoffImpulseNs: 7000,
    })
    expect(parsed.gameData.evaDoor).toEqual({ connectorId: '_c3' })
  })

  it('recovers connector flags by id', () => {
    expect(parsed.connectorFlags.get('_c2')).toEqual(['ToSurface'])
  })

  it('returns null for an unknown part id', () => {
    expect(gameDataFromAssets(serializeGameData(source), 'Nope', new DOMParser())).toBeNull()
  })
})

describe('engine modules (round-trip with serializeGameData)', () => {
  const TMPL = 'CorePropulsionA_Subpart_EngineALargeVacAssembly'
  const source = editingPart({
    partId: 'ENG',
    editorTags: ['Engines'],
    gameData: {
      ...createEmptyGameData(),
      rocketControllers: [
        {
          id: 'LR91-AJ-3',
          kind: 'engine',
          rocketRefs: [
            { id: 'Engine', subPartInstanceId: `${TMPL}2` },
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
          subPartInstanceId: `${TMPL}2`,
          maxAngleYDeg: 2,
          maxAngleZDeg: 2,
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
    // A custom propellant (clean ≤6-sig-fig numbers so G6 formatting round-trips exactly).
    customReactions: [
      {
        id: 'MyKerolox_2.6',
        name: 'Custom Kerolox',
        category: 'Bipropellant' as const,
        reactants: [
          { phaseId: 'Kerosene(l)', massShare: 1 },
          { phaseId: 'O2(l)', massShare: 2.6 },
        ],
        lut: [
          { lnPressure: 9.5, temperatureK: 3200, gamma: 1.22, molarMassGPerMol: 22.4 },
          { lnPressure: 15.4, temperatureK: 3650, gamma: 1.15, molarMassGPerMol: 23.1 },
        ],
      },
    ],
    subPartGameData: [
      {
        ...createSubPartGameData(TMPL),
        combustors: [
          {
            id: 'ThrustChamber',
            reactionId: 'Hydrolox',
            mixtureRatio: 5.5,
            maxPressurePa: 4_900_000,
            thermalEfficiency: 1,
            minimumThrottle: 0.1,
            minimumPulseTimeS: null,
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
            exhaustDirection: { x: -1, y: 0, z: 0 },
            fxExhaustLocation: null,
            fxExhaustDirection: null,
            volumetricExhaustId: 'EngineALarge',
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

  const parsed = gameDataFromAssets(serializeGameData(source), 'ENG', new DOMParser())!

  it('round-trips the reusable thrust chamber under SubPartGameData (combustor/nozzle/rocket)', () => {
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === TMPL)!
    expect(spd.combustors).toEqual(source.subPartGameData[0].combustors)
    expect(spd.nozzles).toEqual(source.subPartGameData[0].nozzles)
    expect(spd.rockets).toEqual(source.subPartGameData[0].rockets)
  })

  it('round-trips the part-level controller, gas-generator, and gimbals', () => {
    expect(parsed.gameData.rocketControllers).toEqual(source.gameData.rocketControllers)
    expect(parsed.gameData.rockets).toEqual(source.gameData.rockets)
    expect(parsed.gameData.combustors).toEqual(source.gameData.combustors)
    expect(parsed.gameData.gimbals).toEqual(source.gameData.gimbals)
  })

  it('round-trips a custom reaction (propellant)', () => {
    expect(parsed.customReactions).toEqual(source.customReactions)
  })

  it('parses RocketThrusterController + ControlMap as an RCS controller', () => {
    const rcs = gameDataFromAssets(
      `<Assets><PartGameData Id="P">
        <RocketThrusterController Id="RCS">
          <RocketReference Id="Thruster" SubPartId="t1" />
          <ControlMap CSV="PitchUp, YawRight" />
        </RocketThrusterController>
      </PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!
    expect(rcs.gameData.rocketControllers[0].kind).toBe('thruster')
    expect(rcs.gameData.rocketControllers[0].controlMapFlags).toEqual(['PitchUp', 'YawRight'])
  })
})

describe('gameDataFromAssets docking port (direct GameData XML)', () => {
  const parseDp = (inner: string) =>
    gameDataFromAssets(
      `<Assets><PartGameData Id="P"><DockingPort>${inner}</DockingPort></PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!.gameData.dockingPort

  it('parses the child-element form (ConnectorId / LatchingKineticEnergy J / PushoffImpulse Ns)', () => {
    expect(
      parseDp(
        '<ConnectorId Value="_connector2" /><LatchingKineticEnergy J="50" /><PushoffImpulse Ns="7000" />',
      ),
    ).toEqual({
      connectorId: '_connector2',
      latchingKineticEnergyJ: 50,
      pushoffImpulseNs: 7000,
    })
  })
})

describe('gameDataFromAssets diameter + control (direct GameData XML)', () => {
  const parse = (inner: string) =>
    gameDataFromAssets(
      `<Assets><PartGameData Id="P">${inner}</PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!.gameData

  it('parses <Diameter M> (size class) and a bare <Control/> command marker', () => {
    const g = parse('<Diameter M="1"/><Control />')
    expect(g.diameterM).toBe(1)
    expect(g.controllable).toBe(true)
  })

  it('reads sub-meter <Diameter Cm> via the distance reference', () => {
    expect(parse('<Diameter Cm="50"/>').diameterM).toBeCloseTo(0.5, 6)
  })

  it('defaults to null diameter / not-controllable when both are absent', () => {
    const g = parse('<EditorTag Value="Capsules" />')
    expect(g.diameterM).toBeNull()
    expect(g.controllable).toBe(false)
  })

  it('keeps every <Diameter> of a KSA 2026.7 multi-size adapter (first editable, rest preserved)', () => {
    const g = parse('<Diameter M="3"/><Diameter M="2"/>')
    expect(g.diameterM).toBe(3)
    expect(g.extraDiametersM).toEqual([2])

    // ...and re-emits both on export so the adapter keeps every size-class filter.
    const part = editingPart({ partId: 'P', gameData: g })
    const reparsed = gameDataFromAssets(serializeGameData(part), 'P', new DOMParser())!.gameData
    expect(reparsed.diameterM).toBe(3)
    expect(reparsed.extraDiametersM).toEqual([2])
  })
})

describe('editor-tag registry (gap 5)', () => {
  it('matches CoreEditorTagsGameData.xml order (build 4750)', () => {
    expect(KNOWN_EDITOR_TAGS).toEqual([
      'Capsules',
      'Engines',
      'RCS',
      'Fuel Tanks',
      'Electrical',
      'Coupling',
      'Structural',
      'Landing',
      'Interstage',
      'Passage',
      'Cargo',
      'Lights',
      'Radial',
      'NoFaceSnapping',
      'All',
      'Hidden',
    ])
  })

  it('drops obsolete `Tanks` and adds the new registry tags', () => {
    expect(KNOWN_EDITOR_TAGS).not.toContain('Tanks')
    expect(KNOWN_EDITOR_TAGS).toContain('Fuel Tanks')
    expect(KNOWN_EDITOR_TAGS).toEqual(expect.arrayContaining(['Landing', 'NoFaceSnapping', 'All']))
  })

  it('flags exactly the NotaCategory (functional) tags', () => {
    const functional = EDITOR_TAG_DEFS.filter((d) => d.notaCategory).map((d) => d.id)
    expect(functional).toEqual(['Interstage', 'Radial', 'NoFaceSnapping', 'All', 'Hidden'])
  })
})

describe('unmodeled-XML passthrough (gap 6)', () => {
  const xml = `<Assets>
    <PartGameData Id="P">
      <EditorTag Value="Fuel Tanks" />
      <Collider Id="Collider1">
        <Cylinder Id="Cyl1">
          <Radius M="0.5007" />
          <LengthY M="1.0197" />
        </Cylinder>
      </Collider>
      <SolidSphereMass><Mass Kg="50" /></SolidSphereMass>
    </PartGameData>
    <SubPartGameData Id="Tmpl" DisplayName="Wing Skin">
      <SubstanceStorageVolume Id="Vol1" />
    </SubPartGameData>
  </Assets>`
  const parsed = gameDataFromAssets(xml, 'P', new DOMParser())!

  it('captures unmodeled <PartGameData> children verbatim (tag/attrs/nested tree)', () => {
    expect(parsed.gameData.unknownChildren.map((n) => n.tag)).toEqual([
      'Collider',
      'SolidSphereMass',
    ])
    const collider = parsed.gameData.unknownChildren[0]
    expect(collider.attrs).toEqual({ Id: 'Collider1' })
    expect(collider.children[0].tag).toBe('Cylinder')
    expect(collider.children[0].children.map((c) => [c.tag, c.attrs])).toEqual([
      ['Radius', { M: '0.5007' }],
      ['LengthY', { M: '1.0197' }],
    ])
  })

  it('captures an unmodeled <SubPartGameData> DisplayName attr + child', () => {
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!
    expect(spd.unknownAttrs).toEqual({ DisplayName: 'Wing Skin' })
    expect(spd.unknownChildren.map((n) => n.tag)).toEqual(['SubstanceStorageVolume'])
    expect(spd.unknownChildren[0].attrs).toEqual({ Id: 'Vol1' })
  })

  it('round-trips the unmodeled XML through serialize → re-parse', () => {
    const part = editingPart({
      partId: 'P',
      editorTags: parsed.editorTags,
      gameData: parsed.gameData,
      subPartGameData: parsed.subPartGameData,
    })
    const reparsed = gameDataFromAssets(serializeGameData(part), 'P', new DOMParser())!
    expect(reparsed.gameData.unknownChildren).toEqual(parsed.gameData.unknownChildren)
    const spd = reparsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!
    expect(spd.unknownAttrs).toEqual({ DisplayName: 'Wing Skin' })
    expect(spd.unknownChildren).toEqual([
      { tag: 'SubstanceStorageVolume', attrs: { Id: 'Vol1' }, children: [] },
    ])
  })

  it('captures KSA 2026.7 <Aligned> connector groups verbatim (unmodeled → passthrough)', () => {
    const aligned = `<Assets><PartGameData Id="P">
      <Aligned><ConnectorRef Id="_connector19"/><ConnectorRef Id="_connector41"/></Aligned>
    </PartGameData></Assets>`
    const p = gameDataFromAssets(aligned, 'P', new DOMParser())!
    expect(p.gameData.unknownChildren).toEqual([
      {
        tag: 'Aligned',
        attrs: {},
        children: [
          { tag: 'ConnectorRef', attrs: { Id: '_connector19' }, children: [] },
          { tag: 'ConnectorRef', attrs: { Id: '_connector41' }, children: [] },
        ],
      },
    ])
    const part = editingPart({ partId: 'P', gameData: p.gameData })
    const reparsed = gameDataFromAssets(serializeGameData(part), 'P', new DOMParser())!
    expect(reparsed.gameData.unknownChildren).toEqual(p.gameData.unknownChildren)
  })
})

describe('SubPartGameData tank <RoleAffinity> (KSA 2026.7.5)', () => {
  const xml = `<Assets>
    <PartGameData Id="P"/>
    <SubPartGameData Id="Tmpl">
      <Tank Id="Tank1"><SphericalTank>
        <Material Id="Aluminum.2014(s)" />
        <OuterRadius M="0.5" />
        <WallThickness Mm="4" />
        <RoleAffinity>Thruster</RoleAffinity>
      </SphericalTank></Tank>
    </SubPartGameData>
  </Assets>`

  it('parses + round-trips the consumer role a <SphericalTank> feeds', () => {
    const parsed = gameDataFromAssets(xml, 'P', new DOMParser())!
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!
    expect(spd.tanks[0].roleAffinity).toBe('Thruster')

    const part = editingPart({ partId: 'P', subPartGameData: parsed.subPartGameData })
    const reparsed = gameDataFromAssets(serializeGameData(part), 'P', new DOMParser())!
    const rspd = reparsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!
    expect(rspd.tanks[0].roleAffinity).toBe('Thruster')
  })

  it('defaults an affinity-less tank to Engine and omits the element on emit', () => {
    const bare = `<Assets><PartGameData Id="P"/><SubPartGameData Id="Tmpl">
      <Tank Id="Tank1"><SphericalTank><OuterRadius M="0.5" /><WallThickness Mm="4" /></SphericalTank></Tank>
    </SubPartGameData></Assets>`
    const parsed = gameDataFromAssets(bare, 'P', new DOMParser())!
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!
    expect(spd.tanks[0].roleAffinity).toBe('Engine')

    const part = editingPart({ partId: 'P', subPartGameData: parsed.subPartGameData })
    expect(serializeGameData(part)).not.toContain('RoleAffinity')
  })

  it('normalizes a combined flags body', () => {
    const combined = `<Assets><PartGameData Id="P"/><SubPartGameData Id="Tmpl">
      <Tank Id="Tank1"><SphericalTank><OuterRadius M="0.5" /><WallThickness Mm="4" />
        <RoleAffinity>Thruster Engine</RoleAffinity>
      </SphericalTank></Tank>
    </SubPartGameData></Assets>`
    const parsed = gameDataFromAssets(combined, 'P', new DOMParser())!
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!
    expect(spd.tanks[0].roleAffinity).toBe('Engine Thruster')
  })
})

describe('animationModulesFromGameData', () => {
  const xml = `
    <PartGameData Id="SolarPanelB">
      <KeyframeAnimationModule Id="SolarPanelAnimation" ShowDeployRetract="true">
        <KeyframeAnimation Path="Animations/SolarPanelB_Anim.glb" Id="SolarPanelB_Anim" />
        <SolarTracking DegreesPerSecond="5" SubPart="DriveRotorB1">
          <ExcludeSubPart>DriveHousingB1</ExcludeSubPart>
        </SolarTracking>
      </KeyframeAnimationModule>
    </PartGameData>`
  const gd = new DOMParser()
    .parseFromString(xml, 'application/xml')
    .getElementsByTagName('PartGameData')[0] as unknown as Element

  it('parses the module, ShowDeployRetract, GLB path and solar tracking (original ids)', () => {
    const [m] = animationModulesFromGameData(gd)
    expect(m.moduleId).toBe('SolarPanelAnimation')
    expect(m.showDeployRetract).toBe(true)
    expect(m.glbPath).toBe('Animations/SolarPanelB_Anim.glb')
    expect(m.solarTracking).toEqual({
      degreesPerSecond: 5,
      subPartOriginalId: 'DriveRotorB1',
      excludeOriginalIds: ['DriveHousingB1'],
    })
  })

  it('defaults ShowDeployRetract to false when absent', () => {
    const x = new DOMParser()
      .parseFromString(
        `<PartGameData Id="X"><KeyframeAnimationModule Id="A"><KeyframeAnimation Path="Animations/A.glb" Id="A" /></KeyframeAnimationModule></PartGameData>`,
        'application/xml',
      )
      .getElementsByTagName('PartGameData')[0] as unknown as Element
    const [m] = animationModulesFromGameData(x)
    expect(m.showDeployRetract).toBe(false)
    expect(m.solarTracking).toBeNull()
  })
})

describe('PowerConsumer is collapsed to one per part (KSA Part.LightSwitch slot)', () => {
  it('keeps the LightSwitch consumer when several are present, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const xml = `<Assets><PartGameData Id="P">
        <PowerConsumer><Consumed W="4" /></PowerConsumer>
        <PowerConsumer LightSwitch="true" LightIsActive="true"><Consumed W="60" /></PowerConsumer>
      </PartGameData></Assets>`
    const parsed = gameDataFromAssets(xml, 'P', new DOMParser())!
    expect(parsed.gameData.powerConsumer).toEqual({
      consumedWatts: 60,
      lightSwitch: true,
      lightIsActive: true,
    })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('keeps the sole consumer (no warning) and null when there is none', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const one = gameDataFromAssets(
      `<Assets><PartGameData Id="P"><PowerConsumer><Consumed W="2" /></PowerConsumer></PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!
    expect(one.gameData.powerConsumer).toEqual({
      consumedWatts: 2,
      lightSwitch: false,
      lightIsActive: false,
    })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()

    const none = gameDataFromAssets(
      `<Assets><PartGameData Id="P"><EditorTag Value="Structural" /></PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!
    expect(none.gameData.powerConsumer).toBeNull()
  })
})
