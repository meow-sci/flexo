import { describe, it, expect, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import {
  animationModulesFromGameData,
  connectorsFromPartElement,
  gameDataFromAssets,
  parseConnectorCapabilities,
  parseConnectorFlags,
  parsePartPlacements,
  remapRawConnectorRefs,
} from './partXmlParser';
import { serializeGameDataXml, serializePartsXml, type TemplateRemap } from './partXmlSerializer';
import type { Connector, EditingPart, IvaSeat, RawXmlNode } from './types';
import {
  DEFAULT_LAYER_ID,
  createCombustor,
  createCustomReaction,
  createDefaultLayer,
  createEmptyGameData,
  createPartLight,
  createRocketController,
  createSolidGrainSegment,
  createSolidMotor,
  createSolidMotorNozzle,
  createSubPartGameData,
  EDITOR_TAG_DEFS,
  identityTransform,
  createTank,
  IVA_SEAT_LAYER_ID,
  KNOWN_EDITOR_TAGS,
} from './types';
import { readVendoredAsset } from './ksaTestAssets';

/**
 * Single-entry calls through the multi-part serializers (MULTI_PART_PLAN P3.03) — the
 * round-trip fixtures below are all single-part, and one entry emits exactly the document
 * the parser has always read back (invariant I8).
 */
const serializePart = (part: EditingPart, remap: TemplateRemap = new Map()) =>
  serializePartsXml([{ part, remap }]);
const serializeGameData = (part: EditingPart, base = '', remap: TemplateRemap = new Map()) =>
  serializeGameDataXml([{ part, remap }], base);

function editingPart(over: Partial<EditingPart>): EditingPart {
  return {
    partId: 'TestPart',
    editorTags: [],
    gameData: createEmptyGameData(),
    subPartGameData: [],
    layers: [createDefaultLayer()],
    placements: [],
    connectors: [],
    colliders: [],
    ivaSeats: [],
    lights: [],
    internalFlags: {},
    kittens: [],
    customTextures: [],
    customMaterials: [],
    customMeshes: [],
    animations: [],
    customReactions: [],
    ...over,
  };
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
});

describe('parsePartPlacements (round-trip with serializer)', () => {
  const xml = serializePart(part);
  const parsed = parsePartPlacements(xml, 'TestPart', new DOMParser());

  it('recovers every placement', () => {
    expect(parsed.length).toBe(3);
    expect(parsed.map((p) => p.instanceId)).toEqual(['identity_1', 'b_1', 'c_1']);
    expect(parsed.map((p) => p.subPartTemplateId)).toEqual(['Core.A', 'Core.B', 'Core.C']);
  });

  it('recovers transforms within G6 precision', () => {
    const c = parsed[2];
    expect(c.position.x).toBeCloseTo(-0.02294, 5);
    expect(c.position.y).toBeCloseTo(-0.19896, 5);
    expect(c.position.z).toBeCloseTo(-0.56421, 5);
    expect(c.rotation.x).toBeCloseTo(-0.3876, 5);
    expect(c.rotation.y).toBeCloseTo(0.36137, 5);
    expect(c.rotation.z).toBeCloseTo(0.71372, 5);
    expect(c.scale.x).toBeCloseTo(2, 5);
  });

  it('defaults identity placement to zero/one', () => {
    const a = parsed[0];
    expect(a.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(a.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(a.scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('throws on unknown part id', () => {
    expect(() => parsePartPlacements(xml, 'Nope', new DOMParser())).toThrow();
  });
});

describe('parseConnectorFlags', () => {
  // .NET's XmlSerializationReader.ToEnum does value.Split(null) — whitespace. That is
  // the form KSA authors and the form flexo emits; commas are tolerated on the way in.
  it('splits a whitespace-separated list, trimming and dropping unknowns', () => {
    expect(parseConnectorFlags('Internal ToSurface')).toEqual(['Internal', 'ToSurface']);
    expect(parseConnectorFlags('Internal, ToSurface')).toEqual(['Internal', 'ToSurface']);
    expect(parseConnectorFlags(' FromSurface ')).toEqual(['FromSurface']);
    expect(parseConnectorFlags('Bogus Internal')).toEqual(['Internal']);
    expect(parseConnectorFlags('')).toEqual([]);
    expect(parseConnectorFlags(null)).toEqual([]);
  });
});

describe('parseConnectorCapabilities', () => {
  it('splits a whitespace-separated list, trimming and dropping unknowns', () => {
    expect(parseConnectorCapabilities('BulkFluid SolidMotorCase')).toEqual([
      'BulkFluid',
      'SolidMotorCase',
    ]);
    expect(parseConnectorCapabilities(' DecouplerJoint ')).toEqual(['DecouplerJoint']);
    expect(parseConnectorCapabilities('NoElectricity NoServiceFluid')).toEqual([
      'NoElectricity',
      'NoServiceFluid',
    ]);
    expect(parseConnectorCapabilities('Bogus BulkFluid')).toEqual(['BulkFluid']);
    // Empty is NOT "no capabilities" — it means KSA's Electricity|ServiceFluid default.
    expect(parseConnectorCapabilities('')).toEqual([]);
    expect(parseConnectorCapabilities(null)).toEqual([]);
  });
});

describe('connectorsFromPartElement (round-trip with serializer)', () => {
  const withConnectors = editingPart({
    connectors: [
      {
        id: '_connector1',
        position: { x: 0.5, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 2, y: 2, z: 2 },
        flags: [],
        capabilities: [],
        siblingIds: [],
        layerId: DEFAULT_LAYER_ID,
      },
      {
        id: '_connector2',
        position: { x: -0.5, y: 0, z: 0 },
        rotation: { x: 3.14159, y: 0, z: 3.14159 },
        scale: { x: 1, y: 1, z: 1 },
        flags: ['Internal', 'FromSurface'],
        capabilities: [],
        siblingIds: [],
        layerId: DEFAULT_LAYER_ID,
      },
    ],
  });

  function partElement(xml: string): Element {
    const doc = new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
    return Array.from(doc.getElementsByTagName('Part'))[0];
  }

  const parsed: Connector[] = connectorsFromPartElement(partElement(serializePart(withConnectors)));

  it('recovers every connector id', () => {
    expect(parsed.map((c) => c.id)).toEqual(['_connector1', '_connector2']);
  });

  it('recovers connector transforms within G6 precision', () => {
    expect(parsed[0].position.x).toBeCloseTo(0.5, 5);
    expect(parsed[0].scale.x).toBeCloseTo(2, 5);
    expect(parsed[1].position.x).toBeCloseTo(-0.5, 5);
    expect(parsed[1].rotation.x).toBeCloseTo(3.14159, 5);
    expect(parsed[1].rotation.z).toBeCloseTo(3.14159, 5);
  });

  it('round-trips inline <Flags> (now emitted on the Part connector)', () => {
    expect(parsed[0].flags).toEqual([]);
    expect(parsed[1].flags).toEqual(['Internal', 'FromSurface']);
  });

  it('round-trips <Sibling> attach-node grouping (KSA 2026.7 multi-mount prefabs)', () => {
    const withSiblings = editingPart({
      connectors: [
        {
          id: '_connector1',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          flags: [],
          capabilities: [],
          siblingIds: ['_connector2', '_connector3'],
          layerId: DEFAULT_LAYER_ID,
        },
      ],
    });
    const reparsed = connectorsFromPartElement(partElement(serializePart(withSiblings)));
    expect(reparsed[0].siblingIds).toEqual(['_connector2', '_connector3']);
  });
});

describe('gameDataFromAssets (round-trip with serializeGameData)', () => {
  const TANK_TMPL = 'CoreFuelTankA_Subpart_Skin2W1HB';
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
      evaDoor: { seatId: null },
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
        combustors: [],
        nozzles: [],
        rockets: [],
        unknownAttrs: {},
        unknownChildren: [],
      },
    ],
    lights: [
      {
        ...createPartLight(TANK_TMPL, '_light1'),
        type: 'Spot',
        position: { x: 0.38, y: 0.21, z: 0 },
        rotation: { x: 0, y: 0, z: 1.5708 },
        rangeM: 5,
        intensity: 10,
        color: { r: 1, g: 0.5, b: 0.25 },
        innerAngleRad: 0.392599,
        outerAngleRad: 0.785398,
        rayTracing: true,
      },
      { ...createPartLight(TANK_TMPL, '_light2'), type: 'Point', rangeM: 2, intensity: 2 },
    ],
    connectors: [
      {
        id: '_c2',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        flags: ['ToSurface'],
        capabilities: [],
        siblingIds: [],
        layerId: DEFAULT_LAYER_ID,
      },
    ],
  });

  const parsed = gameDataFromAssets(serializeGameData(source), 'GD', new DOMParser())!;

  it('recovers display name, tags, mass', () => {
    expect(parsed.gameData.displayName).toBe('Round Trip');
    expect(parsed.editorTags).toEqual(['Tanks', 'Structural']);
    expect(parsed.gameData.customMass).toBe(42);
  });

  it('recovers part diameter (size class) and the command marker', () => {
    expect(parsed.gameData.diameterM).toBe(2);
    expect(parsed.gameData.controllable).toBe(true);
  });

  it('recovers SubPart-owned lights as flat PartLights (owner, transform, color, angles, ray tracing)', () => {
    expect(parsed.lights.map((l) => l.type)).toEqual(['Spot', 'Point']);
    expect(parsed.lights.every((l) => l.ownerTemplateId === TANK_TMPL)).toBe(true);
    expect(parsed.lights.every((l) => l.layerId === DEFAULT_LAYER_ID)).toBe(true);
    // Ids regenerated in document order — never read from the XML.
    expect(parsed.lights.map((l) => l.id)).toEqual(['_light1', '_light2']);
    const spot = parsed.lights[0];
    expect(spot.position).toEqual({ x: 0.38, y: 0.21, z: 0 });
    expect(spot.rotation.z).toBeCloseTo(1.5708, 4);
    expect(spot.scale).toEqual({ x: 1, y: 1, z: 1 }); // pinned — KSA ignores light scale
    expect(spot.rangeM).toBe(5);
    expect(spot.intensity).toBe(10);
    expect(spot.color.r).toBeCloseTo(1, 5);
    expect(spot.color.g).toBeCloseTo(0.5, 5);
    expect(spot.color.b).toBeCloseTo(0.25, 5);
    expect(spot.innerAngleRad).toBeCloseTo(0.392599, 5);
    expect(spot.outerAngleRad).toBeCloseTo(0.785398, 5);
    expect(spot.rayTracing).toBe(true);
    // Point light: no ray tracing, cone angles fall back to KSA defaults.
    expect(parsed.lights[1].rayTracing).toBe(false);
    expect(parsed.lights[1].rangeM).toBe(2);
    // The SubPartGameData entry holds only its tanks/solar panels — no lights.
    expect(parsed.subPartGameData.find((s) => s.subPartTemplateId === TANK_TMPL)).toBeDefined();
  });

  it('recovers tanks and solar panels per SubPart template (shape, material, dims)', () => {
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === TANK_TMPL);
    expect(spd?.tanks.map((t) => t.shape)).toEqual(['Cylindrical', 'Spherical']);
    expect(spd?.tanks[0].lengthM).toBe(3);
    expect(spd?.tanks[1].wallMaterialId).toBe('Steel(s)');
    expect(spd?.solarPanels[0].outputWatts).toBe(50);
  });

  it('recovers power and coupling', () => {
    expect(parsed.gameData.batteries[0].capacityWh).toBeCloseTo(0.5, 6);
    expect(parsed.gameData.generators[0].outputWatts).toBe(12);
    expect(parsed.gameData.solarPanels[0].outputWatts).toBe(200);
    expect(parsed.gameData.solarPanels[0].transform.rotation.y).toBeCloseTo(1.5708, 4);
    expect(parsed.gameData.powerConsumer).toEqual({
      consumedWatts: 3,
      lightSwitch: true,
      lightIsActive: true,
    });
    expect(parsed.gameData.decoupler).toEqual({ connectorId: '_c2', force: 750 });
    expect(parsed.gameData.dockingPort).toEqual({
      connectorId: '_c3',
      latchingKineticEnergyJ: 6000,
      pushoffImpulseNs: 7000,
    });
    // `EVADoorTemplate` has ONLY `SeatId` — the hatch is not connector-bound.
    expect(parsed.gameData.evaDoor).toEqual({ seatId: null });
  });

  it('recovers connector flags by id', () => {
    expect(parsed.connectorFlags.get('_c2')).toEqual(['ToSurface']);
  });

  it('returns null for an unknown part id', () => {
    expect(gameDataFromAssets(serializeGameData(source), 'Nope', new DOMParser())).toBeNull();
  });
});

// `<Light>` is legal (and Core-authored) at BOTH GameData sites: `<PartGameData>` (CoreCommandA
// headlights, CoreIVASpaceA's interior light) and `<SubPartGameData>` (CoreElectricalA spot/flood
// lights). flexo normalises every light into one flat PartLight list keyed by owner.
describe('part-level and SubPart-level <Light> parsing (direct GameData XML)', () => {
  it('parses both sites, assigning _lightN ids in document order (part-level first)', () => {
    const parsed = gameDataFromAssets(
      `<Assets>
        <PartGameData Id="P">
          <Light>
            <Type>Spot</Type>
            <Transform><Position X="0.09" Y="0.4364" Z="-0.61633" /></Transform>
            <Range Value="2.5" />
            <Intensity Value="2" />
            <Color R="1" G="1" B="1" />
            <OuterAngle Value="1.57" />
          </Light>
          <Light>
            <Type>Point</Type>
            <Range Value="1.5" />
            <Intensity Value="0.05" />
            <Color R="1" G="0.9" B="0.7" />
            <RayTracing>true</RayTracing>
          </Light>
        </PartGameData>
        <SubPartGameData Id="Tmpl">
          <Light>
            <Type>Spot</Type>
            <Range Value="5" />
            <Intensity Value="10" />
          </Light>
        </SubPartGameData>
      </Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(parsed.lights.map((l) => [l.id, l.ownerTemplateId])).toEqual([
      ['_light1', null],
      ['_light2', null],
      ['_light3', 'Tmpl'],
    ]);
    // The CoreCommandA-style headlight: Inner defaults to π/8 when absent.
    expect(parsed.lights[0].position).toEqual({ x: 0.09, y: 0.4364, z: -0.61633 });
    expect(parsed.lights[0].innerAngleRad).toBeCloseTo(Math.PI / 8, 6);
    expect(parsed.lights[0].outerAngleRad).toBeCloseTo(1.57, 6);
    // The CoreIVASpaceA-style interior light: Point + RayTracing.
    expect(parsed.lights[1].type).toBe('Point');
    expect(parsed.lights[1].rayTracing).toBe(true);
    expect(parsed.lights[1].color.g).toBeCloseTo(0.9, 6);
    // Nothing leaked into the passthrough or the SPD entries.
    expect(parsed.gameData.unknownChildren).toEqual([]);
    expect(parsed.subPartGameData).toEqual([]);
  });

  it('accumulates lights across duplicate-Id <SubPartGameData> blocks in document order', () => {
    const parsed = gameDataFromAssets(
      `<Assets>
        <PartGameData Id="P" />
        <SubPartGameData Id="Tmpl"><Light><Range Value="1" /></Light></SubPartGameData>
        <SubPartGameData Id="Tmpl"><Light><Range Value="2" /></Light></SubPartGameData>
      </Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(parsed.lights.map((l) => [l.id, l.ownerTemplateId, l.rangeM])).toEqual([
      ['_light1', 'Tmpl', 1],
      ['_light2', 'Tmpl', 2],
    ]);
  });

  it('drops an authored <Light Id> attribute (editor ids are flexo-local, never emitted)', () => {
    const parsed = gameDataFromAssets(
      `<Assets><PartGameData Id="P">
        <Light Id="Headlight"><Range Value="3" /></Light>
      </PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(parsed.lights[0].id).toBe('_light1');
    // Re-export never writes an Id back.
    const xml = serializeGameData(editingPart({ partId: 'P', lights: parsed.lights }));
    expect(xml).toContain('<Light>');
    expect(xml).not.toContain('<Light Id=');
  });

  it('round-trips a part-level light back under <PartGameData>', () => {
    const source = editingPart({
      partId: 'P',
      lights: [
        {
          ...createPartLight(null, '_light1'),
          type: 'Point',
          position: { x: -0.275, y: 0, z: -0.8 },
          rangeM: 1.5,
          intensity: 0.05,
          color: { r: 1, g: 0.9, b: 0.7 },
          rayTracing: true,
        },
      ],
    });
    const back = roundTrip(source);
    expect(back.lights).toEqual(source.lights);
  });
});

describe('engine modules (round-trip with serializeGameData)', () => {
  const TMPL = 'CorePropulsionA_Subpart_EngineALargeVacAssembly';
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
      // feeds/plumbing are not yet parsed or emitted (see partXmlParser TODOs); a
      // part-level gas generator would really declare a container/connector feed.
      combustors: [{ ...createCombustor('GasGeneratorChamber'), feeds: [] }],
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
        burnRate: null,
        minimumBurnPressurePa: null,
        maxStablePressurePa: null,
        exhaustCondensedFraction: null,
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
            exhaustDirection: { x: -1, y: 0, z: 0 },
            fxExhaustLocation: null,
            fxExhaustDirection: null,
            reactionPlumes: [
              {
                reactionId: null,
                isDefault: true,
                volumetricExhaustId: 'EngineALarge',
                plumeTrailId: 'DefaultPlumeTrail',
              },
              {
                reactionId: 'DoubleBase',
                isDefault: false,
                volumetricExhaustId: 'EngineAMed',
                plumeTrailId: null,
              },
            ],
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
  });

  const parsed = gameDataFromAssets(serializeGameData(source), 'ENG', new DOMParser())!;

  it('round-trips the reusable thrust chamber under SubPartGameData (combustor/nozzle/rocket)', () => {
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === TMPL)!;
    expect(spd.combustors).toEqual(source.subPartGameData[0].combustors);
    expect(spd.nozzles).toEqual(source.subPartGameData[0].nozzles);
    expect(spd.rockets).toEqual(source.subPartGameData[0].rockets);
  });

  it('round-trips the part-level controller, gas-generator, and gimbals', () => {
    expect(parsed.gameData.rocketControllers).toEqual(source.gameData.rocketControllers);
    expect(parsed.gameData.rockets).toEqual(source.gameData.rockets);
    expect(parsed.gameData.combustors).toEqual(source.gameData.combustors);
    expect(parsed.gameData.gimbals).toEqual(source.gameData.gimbals);
  });

  it('round-trips a custom reaction (propellant)', () => {
    expect(parsed.customReactions).toEqual(source.customReactions);
  });

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
    )!;
    expect(rcs.gameData.rocketControllers[0].kind).toBe('thruster');
    expect(rcs.gameData.rocketControllers[0].controlMapFlags).toEqual(['PitchUp', 'YawRight']);
  });
});

describe('gameDataFromAssets docking port (direct GameData XML)', () => {
  const parseDp = (inner: string) =>
    gameDataFromAssets(
      `<Assets><PartGameData Id="P"><DockingPort>${inner}</DockingPort></PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!.gameData.dockingPort;

  it('parses the child-element form (ConnectorId / LatchingKineticEnergy J / PushoffImpulse Ns)', () => {
    expect(
      parseDp(
        '<ConnectorId Value="_connector2" /><LatchingKineticEnergy J="50" /><PushoffImpulse Ns="7000" />',
      ),
    ).toEqual({
      connectorId: '_connector2',
      latchingKineticEnergyJ: 50,
      pushoffImpulseNs: 7000,
    });
  });
});

describe('gameDataFromAssets diameter + control (direct GameData XML)', () => {
  const parse = (inner: string) =>
    gameDataFromAssets(
      `<Assets><PartGameData Id="P">${inner}</PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!.gameData;

  it('parses <Diameter M> (size class) and a bare <Control/> command marker', () => {
    const g = parse('<Diameter M="1"/><Control />');
    expect(g.diameterM).toBe(1);
    expect(g.controllable).toBe(true);
  });

  it('reads sub-meter <Diameter Cm> via the distance reference', () => {
    expect(parse('<Diameter Cm="50"/>').diameterM).toBeCloseTo(0.5, 6);
  });

  it('defaults to null diameter / not-controllable when both are absent', () => {
    const g = parse('<EditorTag Value="Capsules" />');
    expect(g.diameterM).toBeNull();
    expect(g.controllable).toBe(false);
  });

  it('keeps every <Diameter> of a KSA 2026.7 multi-size adapter (first editable, rest preserved)', () => {
    const g = parse('<Diameter M="3"/><Diameter M="2"/>');
    expect(g.diameterM).toBe(3);
    expect(g.extraDiametersM).toEqual([2]);

    // ...and re-emits both on export so the adapter keeps every size-class filter.
    const part = editingPart({ partId: 'P', gameData: g });
    const reparsed = gameDataFromAssets(serializeGameData(part), 'P', new DOMParser())!.gameData;
    expect(reparsed.diameterM).toBe(3);
    expect(reparsed.extraDiametersM).toEqual([2]);
  });
});

describe('editor-tag registry (gap 5)', () => {
  it('matches CoreEditorTagsGameData.xml order (build 4939)', () => {
    expect(KNOWN_EDITOR_TAGS).toEqual([
      'Booster',
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
    ]);
  });

  it('drops obsolete `Tanks` and adds the new registry tags', () => {
    expect(KNOWN_EDITOR_TAGS).not.toContain('Tanks');
    expect(KNOWN_EDITOR_TAGS).toContain('Fuel Tanks');
    expect(KNOWN_EDITOR_TAGS).toEqual(expect.arrayContaining(['Landing', 'NoFaceSnapping', 'All']));
  });

  it('flags exactly the NotaCategory (functional) tags', () => {
    const functional = EDITOR_TAG_DEFS.filter((d) => d.notaCategory).map((d) => d.id);
    expect(functional).toEqual(['Interstage', 'Radial', 'NoFaceSnapping', 'All', 'Hidden']);
  });
});

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
  </Assets>`;
  const parsed = gameDataFromAssets(xml, 'P', new DOMParser())!;

  it('captures unmodeled <PartGameData> children verbatim (tag/attrs/nested tree)', () => {
    // <Collider> is MODELED now (it lands in `colliders`, not the passthrough).
    expect(parsed.gameData.unknownChildren.map((n) => n.tag)).toEqual(['SolidSphereMass']);
    const mass = parsed.gameData.unknownChildren[0];
    expect(mass.children.map((c) => [c.tag, c.attrs])).toEqual([['Mass', { Kg: '50' }]]);
  });

  it('reads the <PartGameData><Collider> into the typed model instead of passthrough', () => {
    expect(parsed.colliders).toEqual([
      {
        id: 'Cyl1',
        shape: 'Cylinder',
        ownerTemplateId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        // Cylinder size = (2R, LengthY, 2R).
        scale: { x: 1.0014, y: 1.0197, z: 1.0014 },
        layerId: DEFAULT_LAYER_ID,
      },
    ]);
  });

  it('captures an unmodeled <SubPartGameData> DisplayName attr + child', () => {
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!;
    expect(spd.unknownAttrs).toEqual({ DisplayName: 'Wing Skin' });
    expect(spd.unknownChildren.map((n) => n.tag)).toEqual(['SubstanceStorageVolume']);
    expect(spd.unknownChildren[0].attrs).toEqual({ Id: 'Vol1' });
  });

  it('round-trips the unmodeled XML through serialize → re-parse', () => {
    const part = editingPart({
      partId: 'P',
      editorTags: parsed.editorTags,
      gameData: parsed.gameData,
      subPartGameData: parsed.subPartGameData,
    });
    const reparsed = gameDataFromAssets(serializeGameData(part), 'P', new DOMParser())!;
    expect(reparsed.gameData.unknownChildren).toEqual(parsed.gameData.unknownChildren);
    const spd = reparsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!;
    expect(spd.unknownAttrs).toEqual({ DisplayName: 'Wing Skin' });
    expect(spd.unknownChildren).toEqual([
      { tag: 'SubstanceStorageVolume', attrs: { Id: 'Vol1' }, children: [] },
    ]);
  });

  it('captures KSA 2026.7 <Aligned> connector groups verbatim (unmodeled → passthrough)', () => {
    const aligned = `<Assets><PartGameData Id="P">
      <Aligned><ConnectorRef Id="_connector19"/><ConnectorRef Id="_connector41"/></Aligned>
    </PartGameData></Assets>`;
    const p = gameDataFromAssets(aligned, 'P', new DOMParser())!;
    expect(p.gameData.unknownChildren).toEqual([
      {
        tag: 'Aligned',
        attrs: {},
        children: [
          { tag: 'ConnectorRef', attrs: { Id: '_connector19' }, children: [] },
          { tag: 'ConnectorRef', attrs: { Id: '_connector41' }, children: [] },
        ],
      },
    ]);
    const part = editingPart({ partId: 'P', gameData: p.gameData });
    const reparsed = gameDataFromAssets(serializeGameData(part), 'P', new DOMParser())!;
    expect(reparsed.gameData.unknownChildren).toEqual(p.gameData.unknownChildren);
  });

  it('remapRawConnectorRefs rewrites ConnectorRef/Sibling Ids at any depth, leaving unmapped ids alone', () => {
    const nodes: RawXmlNode[] = [
      {
        tag: 'Aligned',
        attrs: {},
        children: [
          { tag: 'ConnectorRef', attrs: { Id: '_connector19' }, children: [] },
          { tag: 'ConnectorRef', attrs: { Id: '_connector41' }, children: [] },
        ],
      },
      {
        tag: 'SymmetryGroup',
        attrs: {},
        children: [
          { tag: 'ConnectorRef', attrs: { Id: '_connector19' }, children: [] },
          // No mapping — a ref to a connector outside the imported set stays verbatim.
          { tag: 'ConnectorRef', attrs: { Id: '_connector99' }, children: [] },
        ],
      },
      // Non-ref tags keep their Id even when it collides with a mapped connector id.
      { tag: 'Whatever', attrs: { Id: '_connector19' }, children: [], text: 'keep' },
    ];
    const map = new Map([
      ['_connector19', '_connector1'],
      ['_connector41', '_connector2'],
    ]);
    const out = remapRawConnectorRefs(nodes, map);
    expect(out).toEqual([
      {
        tag: 'Aligned',
        attrs: {},
        children: [
          { tag: 'ConnectorRef', attrs: { Id: '_connector1' }, children: [] },
          { tag: 'ConnectorRef', attrs: { Id: '_connector2' }, children: [] },
        ],
      },
      {
        tag: 'SymmetryGroup',
        attrs: {},
        children: [
          { tag: 'ConnectorRef', attrs: { Id: '_connector1' }, children: [] },
          { tag: 'ConnectorRef', attrs: { Id: '_connector99' }, children: [] },
        ],
      },
      { tag: 'Whatever', attrs: { Id: '_connector19' }, children: [], text: 'keep' },
    ]);
    // Pure: the input trees are untouched.
    expect(nodes[0].children[0].attrs.Id).toBe('_connector19');
  });
});

describe('<CustomMass> fidelity (Kg modeled, inertia/offset children preserved)', () => {
  // Mirrors Core's CoreCommandA capsule: CustomMass with an offset + specific inertia.
  const xml = `<Assets>
    <PartGameData Id="P">
      <CustomMass>
        <LocationBody X="-0.3601690873" />
        <Mass Kg="1800" />
        <MassSpecificInertia Ixx="0.3252281349" Iyy="0.668371379" Izz="0.668371379" />
      </CustomMass>
    </PartGameData>
  </Assets>`;
  const parsed = gameDataFromAssets(xml, 'P', new DOMParser())!;

  it('parses the Kg scalar and captures the other CustomMass children verbatim', () => {
    expect(parsed.gameData.customMass).toBe(1800);
    expect(parsed.gameData.customMassExtras).toEqual([
      { tag: 'LocationBody', attrs: { X: '-0.3601690873' }, children: [] },
      {
        tag: 'MassSpecificInertia',
        attrs: { Ixx: '0.3252281349', Iyy: '0.668371379', Izz: '0.668371379' },
        children: [],
      },
    ]);
    expect(parsed.gameData.unknownChildren).toEqual([]);
  });

  it('round-trips the extras inside <CustomMass> through serialize → re-parse', () => {
    const part = editingPart({ partId: 'P', gameData: parsed.gameData });
    const doc = new DOMParser().parseFromString(serializeGameData(part), 'application/xml');
    const custom = doc.getElementsByTagName('CustomMass');
    expect(custom.length).toBe(1);
    expect(custom[0].getElementsByTagName('MassSpecificInertia')[0].getAttribute('Ixx')).toBe(
      '0.3252281349',
    );
    const reparsed = gameDataFromAssets(serializeGameData(part), 'P', new DOMParser())!;
    expect(reparsed.gameData.customMass).toBe(1800);
    expect(reparsed.gameData.customMassExtras).toEqual(parsed.gameData.customMassExtras);
  });

  it('keeps a CustomMass flexo cannot model (no valid <Mass Kg>) whole via passthrough', () => {
    const dens = `<Assets><PartGameData Id="P">
      <CustomMass><Density KgPerM3="2700" /><MassSpecificInertia Ixx="1" Iyy="1" Izz="1" /></CustomMass>
    </PartGameData></Assets>`;
    const p = gameDataFromAssets(dens, 'P', new DOMParser())!;
    expect(p.gameData.customMass).toBeNull();
    expect(p.gameData.customMassExtras).toEqual([]);
    expect(p.gameData.unknownChildren.map((n) => n.tag)).toEqual(['CustomMass']);
    expect(p.gameData.unknownChildren[0].children.map((c) => c.tag)).toEqual([
      'Density',
      'MassSpecificInertia',
    ]);
  });

  it('keeps repeat <CustomMass> entries beyond the first (InertMasses is a list) via passthrough', () => {
    const two = `<Assets><PartGameData Id="P">
      <CustomMass><Mass Kg="10" /></CustomMass>
      <CustomMass><Mass Kg="5" /><MassSpecificInertia Ixx="2" Iyy="2" Izz="2" /></CustomMass>
    </PartGameData></Assets>`;
    const p = gameDataFromAssets(two, 'P', new DOMParser())!;
    expect(p.gameData.customMass).toBe(10);
    expect(p.gameData.unknownChildren).toEqual([
      {
        tag: 'CustomMass',
        attrs: {},
        children: [
          { tag: 'Mass', attrs: { Kg: '5' }, children: [] },
          { tag: 'MassSpecificInertia', attrs: { Ixx: '2', Iyy: '2', Izz: '2' }, children: [] },
        ],
      },
    ]);
  });
});

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
  </Assets>`;

  it('parses + round-trips the consumer role a <SphericalTank> feeds', () => {
    const parsed = gameDataFromAssets(xml, 'P', new DOMParser())!;
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!;
    expect(spd.tanks[0].roleAffinity).toBe('Thruster');

    const part = editingPart({ partId: 'P', subPartGameData: parsed.subPartGameData });
    const reparsed = gameDataFromAssets(serializeGameData(part), 'P', new DOMParser())!;
    const rspd = reparsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!;
    expect(rspd.tanks[0].roleAffinity).toBe('Thruster');
  });

  it('defaults an affinity-less tank to Engine and omits the element on emit', () => {
    const bare = `<Assets><PartGameData Id="P"/><SubPartGameData Id="Tmpl">
      <Tank Id="Tank1"><SphericalTank><OuterRadius M="0.5" /><WallThickness Mm="4" /></SphericalTank></Tank>
    </SubPartGameData></Assets>`;
    const parsed = gameDataFromAssets(bare, 'P', new DOMParser())!;
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!;
    expect(spd.tanks[0].roleAffinity).toBe('Engine');

    const part = editingPart({ partId: 'P', subPartGameData: parsed.subPartGameData });
    expect(serializeGameData(part)).not.toContain('RoleAffinity');
  });

  it('normalizes a combined flags body', () => {
    const combined = `<Assets><PartGameData Id="P"/><SubPartGameData Id="Tmpl">
      <Tank Id="Tank1"><SphericalTank><OuterRadius M="0.5" /><WallThickness Mm="4" />
        <RoleAffinity>Thruster Engine</RoleAffinity>
      </SphericalTank></Tank>
    </SubPartGameData></Assets>`;
    const parsed = gameDataFromAssets(combined, 'P', new DOMParser())!;
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!;
    expect(spd.tanks[0].roleAffinity).toBe('Engine Thruster');
  });
});

describe('animationModulesFromGameData', () => {
  const xml = `
    <PartGameData Id="SolarPanelB">
      <KeyframeAnimationModule Id="SolarPanelAnimation" ShowDeployRetract="true">
        <KeyframeAnimation Path="Animations/SolarPanelB_Anim.glb" Id="SolarPanelB_Anim" />
        <SolarTracking DegreesPerSecond="5" SubPart="DriveRotorB1">
          <ExcludeSubPart>DriveHousingB1</ExcludeSubPart>
        </SolarTracking>
      </KeyframeAnimationModule>
    </PartGameData>`;
  const gd = new DOMParser()
    .parseFromString(xml, 'application/xml')
    .getElementsByTagName('PartGameData')[0] as unknown as Element;

  it('parses the module, ShowDeployRetract, GLB path and solar tracking (original ids)', () => {
    const [m] = animationModulesFromGameData(gd);
    expect(m.moduleId).toBe('SolarPanelAnimation');
    expect(m.showDeployRetract).toBe(true);
    expect(m.glbPath).toBe('Animations/SolarPanelB_Anim.glb');
    expect(m.solarTracking).toEqual({
      degreesPerSecond: 5,
      subPartOriginalId: 'DriveRotorB1',
      excludeOriginalIds: ['DriveHousingB1'],
    });
  });

  it('defaults ShowDeployRetract to false when absent', () => {
    const x = new DOMParser()
      .parseFromString(
        `<PartGameData Id="X"><KeyframeAnimationModule Id="A"><KeyframeAnimation Path="Animations/A.glb" Id="A" /></KeyframeAnimationModule></PartGameData>`,
        'application/xml',
      )
      .getElementsByTagName('PartGameData')[0] as unknown as Element;
    const [m] = animationModulesFromGameData(x);
    expect(m.showDeployRetract).toBe(false);
    expect(m.solarTracking).toBeNull();
  });
});

describe('PowerConsumer is collapsed to one per part (KSA Part.LightSwitch slot)', () => {
  it('keeps the LightSwitch consumer when several are present, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const xml = `<Assets><PartGameData Id="P">
        <PowerConsumer><Consumed W="4" /></PowerConsumer>
        <PowerConsumer LightSwitch="true" LightIsActive="true"><Consumed W="60" /></PowerConsumer>
      </PartGameData></Assets>`;
    const parsed = gameDataFromAssets(xml, 'P', new DOMParser())!;
    expect(parsed.gameData.powerConsumer).toEqual({
      consumedWatts: 60,
      lightSwitch: true,
      lightIsActive: true,
    });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('keeps the sole consumer (no warning) and null when there is none', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const one = gameDataFromAssets(
      `<Assets><PartGameData Id="P"><PowerConsumer><Consumed W="2" /></PowerConsumer></PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(one.gameData.powerConsumer).toEqual({
      consumedWatts: 2,
      lightSwitch: false,
      lightIsActive: false,
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();

    const none = gameDataFromAssets(
      `<Assets><PartGameData Id="P"><EditorTag Value="Structural" /></PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(none.gameData.powerConsumer).toBeNull();
  });
});

// ── KSA 2026.7.9 plumbing topology ────────────────────────────────────────────
// Connector capabilities, consumer feed points, consumer feed wiring, addressable
// tank containers and the solid-motor trio. Each asserts a full parse → serialize →
// re-parse round trip, so a drop on either side fails.

/** Round-trips a GameData document through the serializer and back. */
function roundTrip(source: EditingPart) {
  return gameDataFromAssets(serializeGameData(source), source.partId, new DOMParser())!;
}

describe('<Capabilities> round-trip', () => {
  const source = editingPart({
    partId: 'CAP',
    connectors: [
      {
        id: '_connector1',
        ...identityTransform(),
        flags: ['Internal', 'ToSurface'],
        capabilities: ['BulkFluid', 'SolidMotorCase'],
        siblingIds: [],
        layerId: DEFAULT_LAYER_ID,
      },
      {
        id: '_connector2',
        ...identityTransform(),
        flags: [],
        capabilities: ['DecouplerJoint'],
        siblingIds: [],
        layerId: DEFAULT_LAYER_ID,
      },
      {
        id: '_connector3',
        ...identityTransform(),
        flags: [],
        capabilities: [],
        siblingIds: [],
        layerId: DEFAULT_LAYER_ID,
      },
    ],
  });

  it('round-trips through the GameData document, keyed by connector id', () => {
    const parsed = roundTrip(source);
    expect(parsed.connectorCapabilities.get('_connector1')).toEqual([
      'BulkFluid',
      'SolidMotorCase',
    ]);
    expect(parsed.connectorCapabilities.get('_connector2')).toEqual(['DecouplerJoint']);
    // A capability-less connector records nothing (KSA's implicit default applies).
    expect(parsed.connectorCapabilities.has('_connector3')).toBe(false);
  });

  it('round-trips through the geometry <Part> document', () => {
    const doc = new DOMParser().parseFromString(
      serializePart(source),
      'application/xml',
    ) as unknown as Document;
    const partEl = Array.from(doc.getElementsByTagName('Part'))[0];
    expect(connectorsFromPartElement(partEl).map((c) => c.capabilities)).toEqual([
      ['BulkFluid', 'SolidMotorCase'],
      ['DecouplerJoint'],
      [],
    ]);
  });

  it('drops unknown capability tokens on the way in', () => {
    const parsed = gameDataFromAssets(
      `<Assets><PartGameData Id="P"><Connector Id="_c1">
         <Capabilities>Bogus BulkFluid</Capabilities>
       </Connector></PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(parsed.connectorCapabilities.get('_c1')).toEqual(['BulkFluid']);
  });
});

describe('<FeedsFrom> / <Plumbing> round-trip', () => {
  const source = editingPart({
    partId: 'FEED',
    gameData: {
      ...createEmptyGameData(),
      combustors: [
        {
          ...createCombustor('BulkChamber'),
          feeds: [
            { kind: 'parent' },
            { kind: 'connector', connectorId: '_connector2' },
            { kind: 'container', containerId: 'Fuel', subPartInstanceId: null },
            { kind: 'container', containerId: 'Grain', subPartInstanceId: 'seg_1' },
          ],
        },
        { ...createCombustor('RcsChamber'), feeds: [{ kind: 'parent' }], plumbing: 'Service' },
      ],
    },
  });

  it('round-trips every feed-point kind, in order', () => {
    const parsed = roundTrip(source);
    expect(parsed.gameData.combustors[0].feeds).toEqual(source.gameData.combustors[0].feeds);
  });

  it('round-trips <Plumbing>Service and omits the Bulk default', () => {
    const xml = serializeGameData(source);
    expect(xml.match(/<Plumbing>/g)).toHaveLength(1);
    expect(xml).toContain('<Plumbing>Service</Plumbing>');
    const parsed = roundTrip(source);
    expect(parsed.gameData.combustors.map((c) => c.plumbing)).toEqual(['Bulk', 'Service']);
  });

  it('drops a <FeedsFrom> that names more than one target (KSA logs an error for it)', () => {
    const parsed = gameDataFromAssets(
      `<Assets><PartGameData Id="P"><Combustor Id="C">
         <FeedsFrom Container="Fuel" Connector="_c1" />
         <FeedsFrom Parent="true" Container="Fuel" />
         <FeedsFrom />
         <FeedsFrom Connector="_c1" />
       </Combustor></PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(parsed.gameData.combustors[0].feeds).toEqual([
      { kind: 'connector', connectorId: '_c1' },
    ]);
  });

  it('never emits a feed point whose target id is blank', () => {
    const blank = editingPart({
      partId: 'B',
      gameData: {
        ...createEmptyGameData(),
        combustors: [
          {
            ...createCombustor('C'),
            feeds: [
              { kind: 'connector', connectorId: '  ' },
              { kind: 'container', containerId: '', subPartInstanceId: null },
            ],
          },
        ],
      },
    });
    expect(serializeGameData(blank)).not.toContain('<FeedsFrom');
  });
});

describe('<ConsumerFeedWiring> round-trip', () => {
  it('round-trips the consumer id, SubPartId scope and feed points', () => {
    const source = editingPart({
      partId: 'WIRE',
      gameData: {
        ...createEmptyGameData(),
        consumerFeedWiring: [
          {
            consumerId: 'ThrustChamber',
            subPartInstanceId: 'chamber_1',
            feeds: [{ kind: 'connector', connectorId: '_connector2' }],
          },
          {
            consumerId: 'ThrustChamber',
            subPartInstanceId: null,
            feeds: [{ kind: 'container', containerId: 'Fuel', subPartInstanceId: null }],
          },
        ],
      },
    });
    expect(roundTrip(source).gameData.consumerFeedWiring).toEqual(
      source.gameData.consumerFeedWiring,
    );
  });

  it('drops a Parent="true" child (KSA: "cannot itself defer to Parent")', () => {
    const parsed = gameDataFromAssets(
      `<Assets><PartGameData Id="P">
         <ConsumerFeedWiring Id="C"><FeedsFrom Parent="true" /><FeedsFrom Connector="_c1" /></ConsumerFeedWiring>
       </PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(parsed.gameData.consumerFeedWiring[0].feeds).toEqual([
      { kind: 'connector', connectorId: '_c1' },
    ]);
  });

  it('omits an entry that wires no feed points, or names no consumer', () => {
    const empty = editingPart({
      partId: 'E',
      gameData: {
        ...createEmptyGameData(),
        consumerFeedWiring: [
          { consumerId: 'C', subPartInstanceId: null, feeds: [] },
          { consumerId: 'C', subPartInstanceId: null, feeds: [{ kind: 'parent' }] },
          { consumerId: '  ', subPartInstanceId: null, feeds: [{ kind: 'parent' }] },
        ],
      },
    });
    expect(serializeGameData(empty)).not.toContain('<ConsumerFeedWiring');
  });
});

describe('<Tank Id> round-trip at both levels', () => {
  const TMPL = 'Core.TankSkin';
  const source = editingPart({
    partId: 'TANKS',
    gameData: {
      ...createEmptyGameData(),
      tanks: [{ ...createTank(), id: 'Fuel', lengthM: 3, outerRadiusM: 0.8 }],
    },
    subPartGameData: [
      {
        ...createSubPartGameData(TMPL),
        tanks: [
          {
            ...createTank(),
            id: 'PropellantTank',
            shape: 'Spherical',
            lengthM: 0, // a spherical tank emits no <Length> (radius-defined)
            outerRadiusM: 0.276,
            wallThicknessMm: 4,
            roleAffinity: 'Thruster',
            locationAsmb: { x: 0.5, y: 0, z: -0.25 },
          },
        ],
      },
    ],
  });

  it('round-trips a part-level <Tank Id> (the feed container an engine addresses)', () => {
    expect(roundTrip(source).gameData.tanks).toEqual(source.gameData.tanks);
  });

  it('round-trips a SubPart-level <Tank Id> with its <LocationAsmb>', () => {
    const parsed = roundTrip(source);
    expect(parsed.subPartGameData.find((s) => s.subPartTemplateId === TMPL)!.tanks).toEqual(
      source.subPartGameData[0].tanks,
    );
  });

  it('puts the Id on the wrapping <Tank>, not the shape element, and omits a blank one', () => {
    const xml = serializeGameData(source);
    expect(xml).toContain('<Tank Id="Fuel">');
    expect(xml).toContain('<Tank Id="PropellantTank">');
    const anon = editingPart({
      partId: 'A',
      gameData: { ...createEmptyGameData(), tanks: [createTank()] },
    });
    expect(serializeGameData(anon)).toContain('<Tank>');
  });
});

describe('solid rocket motors round-trip', () => {
  // Modeled on Core's CorePropulsionC_Prefab_SRBDThrustAssemblyA (@ 2026.7.9.5018).
  const SEG_TMPL = 'CorePropulsionC_Subpart_SRBSizeDThrustAssemblyA';
  const source = editingPart({
    partId: 'CorePropulsionC_Prefab_SRBDThrustAssemblyA',
    editorTags: ['Booster'],
    connectors: [
      {
        id: '_connector25',
        ...identityTransform(),
        flags: [],
        capabilities: ['SolidMotorCase'],
        siblingIds: [],
        layerId: DEFAULT_LAYER_ID,
      },
    ],
    gameData: {
      ...createEmptyGameData(),
      diameterM: 1,
      rocketControllers: [createRocketController('SRBDMotor', 'engine', ['Motor'])],
      rockets: [
        {
          id: 'Motor',
          core: { id: 'MotorCore', subPartInstanceId: null },
          nozzles: [{ id: 'Nozzle', subPartInstanceId: 'srb_thrust_1' }],
        },
      ],
      solidMotors: [
        {
          ...createSolidMotor('MotorCore'),
          feeds: [
            { kind: 'container', containerId: 'Grain', subPartInstanceId: null },
            { kind: 'connector', connectorId: '_connector25' },
          ],
        },
      ],
      solidGrainSegments: [
        {
          ...createSolidGrainSegment('Grain'),
          wallMaterialId: 'Steel.300(s)',
          outerRadiusM: 1,
          wallThicknessMm: 8,
          lengthM: 0.65227,
        },
      ],
    },
    subPartGameData: [
      {
        ...createSubPartGameData(SEG_TMPL),
        solidNozzles: [
          {
            ...createSolidMotorNozzle('Nozzle'),
            exitDiameterM: 1.2,
            fxExitDiameterM: 0.587008,
            exhaustLocation: { x: -0.470039, y: 0, z: 0 },
            sound: { action: 'On', soundId: 'DefaultEngineSoundBehavior' },
          },
        ],
      },
    ],
  });

  const parsed = roundTrip(source);

  it('round-trips the part-level <SolidMotor> with both feed points', () => {
    expect(parsed.gameData.solidMotors).toEqual(source.gameData.solidMotors);
  });

  it('round-trips the <SolidGrainSegment> container', () => {
    expect(parsed.gameData.solidGrainSegments).toEqual(source.gameData.solidGrainSegments);
  });

  it('round-trips the SubPart-level <SolidMotorNozzle>', () => {
    expect(
      parsed.subPartGameData.find((s) => s.subPartTemplateId === SEG_TMPL)!.solidNozzles,
    ).toEqual(source.subPartGameData[0].solidNozzles);
  });

  it('emits Core’s exact SRB element shapes', () => {
    const xml = serializeGameData(source);
    expect(xml).toContain('<SolidMotor Id="MotorCore">');
    expect(xml).toContain('<Reaction Id="APCP"/>');
    expect(xml).toContain('<DefaultPressure Bar="70"/>');
    expect(xml).toContain('<Grain Id="Neutral"/>');
    expect(xml).toContain('<FeedsFrom Container="Grain"/>');
    expect(xml).toContain('<FeedsFrom Connector="_connector25"/>');
    expect(xml).toContain('<SolidGrainSegment Id="Grain">');
    expect(xml).toContain('<WallThickness Mm="8"/>');
    expect(xml).toContain('<SolidMotorNozzle Id="Nozzle">');
    expect(xml).toContain('<Capabilities>SolidMotorCase</Capabilities>');
  });

  // SolidMotorNozzleTemplate.Create derives the throat as exitArea/12 — the schema has
  // no AreaRatio slot at all, so emitting one would be an unknown element to KSA.
  it('never emits <AreaRatio> on a solid nozzle', () => {
    expect(serializeGameData(source)).not.toContain('AreaRatio');
  });

  it('omits <Grain Id> when the motor takes the library default', () => {
    const anon = editingPart({
      partId: 'A',
      gameData: {
        ...createEmptyGameData(),
        solidMotors: [{ ...createSolidMotor('M'), grainGeometryId: '' }],
      },
    });
    expect(serializeGameData(anon)).not.toContain('<Grain Id=');
    expect(roundTrip(anon).gameData.solidMotors[0].grainGeometryId).toBe('');
  });
});

describe('solid custom reactions (KSA hard requirements)', () => {
  /** APCP's real burn-rate data from Core's Reactions.xml @ 5018. */
  function apcpLike(over: Partial<ReturnType<typeof createCustomReaction>> = {}) {
    return {
      ...createCustomReaction('MyAPCP', 'My APCP'),
      category: 'Solid' as const,
      reactants: [{ phaseId: 'APCP(s)', massShare: 1 }],
      // ≤6-sig-fig numbers so a single G6 encode round-trips exactly.
      lut: [{ lnPressure: 9.90349, temperatureK: 3003.97, gamma: 1.23876, molarMassGPerMol: 23 }],
      burnRate: { coefficientMPerS: 0.0045, exponent: 0.35 },
      minimumBurnPressurePa: 1_500_000,
      maxStablePressurePa: 15_000_000,
      exhaustCondensedFraction: 0.336965,
      ...over,
    };
  }

  it('round-trips the burn-rate law and pressure limits', () => {
    const source = editingPart({ partId: 'R', customReactions: [apcpLike()] });
    expect(roundTrip(source).customReactions).toEqual(source.customReactions);
    const xml = serializeGameData(source);
    expect(xml).toContain('<BurnRate CoefficientMPerS="0.0045" Exponent="0.35"/>');
    expect(xml).toContain('<MinimumBurnPressure Bar="15"/>');
    expect(xml).toContain('<MaxStablePressure Bar="150"/>');
    expect(xml).toContain('<ExhaustCondensedFraction Value="0.336965"/>');
  });

  // FixedReactionTemplate.Create() THROWS on a Solid reaction missing any of these,
  // which fails the ENTIRE mod load — flexo must omit it rather than ship a crash.
  it('skips a Solid reaction that KSA would refuse to load, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = editingPart({
      partId: 'R',
      customReactions: [
        apcpLike({ burnRate: null }), // no <BurnRate>: "must specify a BurnRate"
        apcpLike({ id: 'NoMin', minimumBurnPressurePa: null }),
        apcpLike({ id: 'BadExp', burnRate: { coefficientMPerS: 0.0045, exponent: 1.2 } }),
        apcpLike({ id: 'MaxBelowMin', maxStablePressurePa: 1_000_000 }),
        apcpLike({ id: 'BadCondensed', exhaustCondensedFraction: 1 }),
      ],
    });
    const xml = serializeGameData(broken);
    expect(xml).not.toContain('<FixedReaction');
    expect(warn).toHaveBeenCalledTimes(5);
    warn.mockRestore();
  });

  it('still emits a non-Solid reaction with no burn-rate data', () => {
    const mono = editingPart({
      partId: 'R',
      customReactions: [createCustomReaction('MyMono', 'My Mono')],
    });
    expect(serializeGameData(mono)).toContain('<FixedReaction Id="MyMono"');
  });
});

// ── colliders ────────────────────────────────────────────────────────────────
//
// The KSA contract these lock down (verified against decomp/KSA/*ColliderTemplate.cs
// and the shipped Core data — see scope/colliders.md):
//   Box(LengthX, LengthY, LengthZ) full extents · Cylinder(Radius, LengthY) Y-aligned
//   full length · Capsule(Radius, LengthY) where LengthY is the SEGMENT only ·
//   Sphere(Radius) · <Collider2Asmb> is Euler XYZ radians.

describe('colliders', () => {
  /** The real `CoreCommandA_Prefab_MediumCapsuleVariantA` collision volume. */
  const MEDIUM_CAPSULE = `<Assets>
    <PartGameData Id="CoreCommandA_Prefab_MediumCapsuleVariantA">
      <Collider Id="Collider1">
        <Cylinder Id="CylinderCollider1">
          <LocationAsmb X="0" Y="0" Z="0" />
          <Collider2Asmb X="0" Y="0" Z="1.57" />
          <LengthY M="2" />
          <Radius M="0.5" />
        </Cylinder>
        <Sphere Id="SphereCollider1">
          <LocationAsmb X="-0.11" Y="0" Z="0" />
          <Collider2Asmb X="0" Y="0" Z="0" />
          <Radius M="0.89" />
        </Sphere>
      </Collider>
    </PartGameData>
  </Assets>`;

  it('parses a real Core cylinder + sphere block into typed part-level colliders', () => {
    const parsed = gameDataFromAssets(
      MEDIUM_CAPSULE,
      'CoreCommandA_Prefab_MediumCapsuleVariantA',
      new DOMParser(),
    )!;
    expect(parsed.colliders).toEqual([
      {
        id: 'CylinderCollider1',
        shape: 'Cylinder',
        ownerTemplateId: null,
        position: { x: 0, y: 0, z: 0 },
        // Euler XYZ radians — the Z=1.57 that lays the cylinder along X.
        rotation: { x: 0, y: 0, z: 1.57 },
        scale: { x: 1, y: 2, z: 1 }, // (2R, LengthY, 2R)
        layerId: DEFAULT_LAYER_ID,
      },
      {
        id: 'SphereCollider1',
        shape: 'Sphere',
        ownerTemplateId: null,
        position: { x: -0.11, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1.78, y: 1.78, z: 1.78 },
        layerId: DEFAULT_LAYER_ID,
      },
    ]);
  });

  it('re-serializes that block to semantically identical XML', () => {
    const parsed = gameDataFromAssets(
      MEDIUM_CAPSULE,
      'CoreCommandA_Prefab_MediumCapsuleVariantA',
      new DOMParser(),
    )!;
    const part = editingPart({
      partId: 'CoreCommandA_Prefab_MediumCapsuleVariantA',
      colliders: parsed.colliders,
    });
    expect(roundTrip(part).colliders).toEqual(parsed.colliders);
    const xml = serializeGameData(part);
    expect(xml).toContain('<Cylinder Id="CylinderCollider1">');
    expect(xml).toContain('<Collider2Asmb X="0" Y="0" Z="1.57"/>');
    expect(xml).toContain('<Sphere Id="SphereCollider1">');
    expect(xml).toContain('<LocationAsmb X="-0.11" Y="0" Z="0"/>');
  });

  // The exemplar: CoreLandingA_Prefab_MediumLandingLegA — a part-level strut cylinder
  // plus a SubPart-owned foot puck that rides the animated joint.
  it('routes part-level and SubPart-owned colliders to the right owners, both ways', () => {
    const xml = `<Assets>
      <PartGameData Id="Leg">
        <Collider Id="Collider1">
          <Cylinder Id="Strut">
            <LocationAsmb X="-0.5501" Y="0.0013" Z="0.0464" />
            <Collider2Asmb X="3.0777" Y="0.008" Z="1.5705" />
            <LengthY M="2.1922" />
            <Radius M="0.4361" />
          </Cylinder>
        </Collider>
      </PartGameData>
      <SubPartGameData Id="CoreLandingA_Subpart_MediumFootA">
        <Collider Id="Collider1">
          <Cylinder Id="Puck">
            <LocationAsmb X="0" Y="0" Z="0" />
            <Collider2Asmb X="0" Y="0" Z="0" />
            <LengthY M="0.34" />
            <Radius M="0.5" />
          </Cylinder>
        </Collider>
      </SubPartGameData>
    </Assets>`;
    const parsed = gameDataFromAssets(xml, 'Leg', new DOMParser())!;
    expect(parsed.colliders.map((c) => [c.id, c.ownerTemplateId])).toEqual([
      ['Strut', null],
      ['Puck', 'CoreLandingA_Subpart_MediumFootA'],
    ]);

    const back = roundTrip(editingPart({ partId: 'Leg', colliders: parsed.colliders }));
    expect(back.colliders).toEqual(parsed.colliders);
    // The foot has NO other GameData, so its <SubPartGameData> block exists purely to
    // carry the collider — it must still be emitted.
    const out = serializeGameData(editingPart({ partId: 'Leg', colliders: parsed.colliders }));
    expect(out).toContain('<SubPartGameData Id="CoreLandingA_Subpart_MediumFootA">');
  });

  it('emits SubPart-owned colliders INTO an existing <SubPartGameData> block, not a second one', () => {
    const part = editingPart({
      partId: 'P',
      subPartGameData: [{ ...createSubPartGameData('Tmpl'), tanks: [createTank()] }],
      lights: [createPartLight('Tmpl', '_light1')],
      colliders: [
        {
          id: '_collider1',
          shape: 'Box',
          ownerTemplateId: 'Tmpl',
          ...identityTransform(),
          layerId: DEFAULT_LAYER_ID,
        },
      ],
    });
    const xml = serializeGameData(part);
    expect(xml.match(/<SubPartGameData Id="Tmpl">/g)).toHaveLength(1);
    const back = roundTrip(part);
    expect(back.colliders[0].ownerTemplateId).toBe('Tmpl');
    // The owned light rides the same single block.
    expect(back.lights[0].ownerTemplateId).toBe('Tmpl');
  });

  it('ALWAYS emits every dimension (an omitted one reads back as NaN in KSA)', () => {
    const part = editingPart({
      partId: 'P',
      colliders: [
        {
          id: 'b',
          shape: 'Box',
          ownerTemplateId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }, // every extent at its "default" — still emitted
          layerId: DEFAULT_LAYER_ID,
        },
      ],
    });
    const xml = serializeGameData(part);
    expect(xml).toContain('<LengthX M="1"/>');
    expect(xml).toContain('<LengthY M="1"/>');
    expect(xml).toContain('<LengthZ M="1"/>');
    // …and both frame vectors, all three axes, even at zero.
    expect(xml).toContain('<LocationAsmb X="0" Y="0" Z="0"/>');
    expect(xml).toContain('<Collider2Asmb X="0" Y="0" Z="0"/>');
  });

  it('defaults a missing dimension to a visible size and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = gameDataFromAssets(
      `<Assets><PartGameData Id="P"><Collider Id="C">
        <Sphere Id="s" />
      </Collider></PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(parsed.colliders[0].scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('<Radius>');
    warn.mockRestore();
  });

  it('ignores a child element that is not one of the four Bepu primitives', () => {
    const parsed = gameDataFromAssets(
      `<Assets><PartGameData Id="P"><Collider Id="C">
        <ConvexHull Id="nope" />
        <Box Id="yes"><LengthX M="1"/><LengthY M="1"/><LengthZ M="1"/></Box>
      </Collider></PartGameData></Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(parsed.colliders.map((c) => c.id)).toEqual(['yes']);
  });

  it('keeps <Collider> out of the unmodeled passthrough on both GameData levels', () => {
    const parsed = gameDataFromAssets(
      `<Assets>
        <PartGameData Id="P"><Collider Id="C"><Sphere Id="s"><Radius M="1"/></Sphere></Collider></PartGameData>
        <SubPartGameData Id="T"><Collider Id="C"><Sphere Id="t"><Radius M="1"/></Sphere></Collider></SubPartGameData>
      </Assets>`,
      'P',
      new DOMParser(),
    )!;
    expect(parsed.gameData.unknownChildren).toEqual([]);
    // The SubPartGameData holds ONLY a collider, so it isn't materialized as an entry.
    expect(parsed.subPartGameData).toEqual([]);
    expect(parsed.colliders.map((c) => c.ownerTemplateId)).toEqual([null, 'T']);
  });
});

// `<IVASeat>` — KSA's interior camera vantage points. The orientation is authored as a
// (<ForwardAxis>, <UpAxis>) pair and stored as an equivalent rotation (src/ksa/ivaSeatAxes.ts),
// so identity rotation ⇔ KSA's own schema defaults (forward +X, up −Z). See plans/IVA_PLAN.md.
describe('IVA seats', () => {
  /**
   * Core's `CoreIVASpaceA_Prefab_MediumCapsuleA` seat block, verbatim (the only shipped one).
   * The `Id`s arrived with KSA 2026.8.3.5117's crew feature — they are what the capsule's
   * `<EVADoor SeatId>`s resolve against (`CoreIVASpaceAGameData.xml:18-28`).
   */
  const CORE_CAPSULE = `<Assets>
    <PartGameData Id="CoreIVASpaceA_Prefab_MediumCapsuleA">
        <EditorTag Value="Hidden"/>

        <IVASeat Id="CoreIVASpaceA_Prefab_MediumCapsuleA_SeatA">
            <Position X="-0.45" Y="0.42" Z="-0.35" />
            <ForwardAxis X="1" />
            <UpAxis Z="-1" />
        </IVASeat>

        <IVASeat Id="CoreIVASpaceA_Prefab_MediumCapsuleA_SeatB">
            <Position X="-0.45" Y="-0.42" Z="-0.35" />
            <ForwardAxis X="1" />
            <UpAxis Z="-1" />
        </IVASeat>
    </PartGameData>
  </Assets>`;

  const parseSeats = (xml: string, partId = 'P') =>
    gameDataFromAssets(xml, partId, new DOMParser())!;

  /**
   * Seats with `-0` collapsed to `0`. `Math.asin(-0)` is `-0`, so an identity rotation comes
   * out as `y: -0` — numerically identical to `0`, but `toEqual` tells the two apart.
   */
  const seats = (parsed: { ivaSeats: IvaSeat[] }): IvaSeat[] =>
    parsed.ivaSeats.map((s) => ({
      ...s,
      rotation: { x: s.rotation.x + 0, y: s.rotation.y + 0, z: s.rotation.z + 0 },
    }));

  it('parses Core’s two-seat capsule into identity-rotation seats (the convention regression)', () => {
    const parsed = parseSeats(CORE_CAPSULE, 'CoreIVASpaceA_Prefab_MediumCapsuleA');
    expect(seats(parsed)).toEqual([
      {
        id: '_seat1',
        ksaId: 'CoreIVASpaceA_Prefab_MediumCapsuleA_SeatA',
        position: { x: -0.45, y: 0.42, z: -0.35 },
        // <ForwardAxis X="1"/> + <UpAxis Z="-1"/> ARE flexo's local axes ⇒ no rotation.
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        layerId: IVA_SEAT_LAYER_ID,
      },
      {
        id: '_seat2',
        ksaId: 'CoreIVASpaceA_Prefab_MediumCapsuleA_SeatB',
        position: { x: -0.45, y: -0.42, z: -0.35 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        layerId: IVA_SEAT_LAYER_ID,
      },
    ]);
  });

  it('keeps <IVASeat> out of the unmodeled passthrough', () => {
    const parsed = parseSeats(CORE_CAPSULE, 'CoreIVASpaceA_Prefab_MediumCapsuleA');
    expect(parsed.gameData.unknownChildren.map((n) => n.tag)).toEqual([]);
  });

  it('preserves document order (KSA’s seat cycle order)', () => {
    const parsed = parseSeats(`<Assets><PartGameData Id="P">
      <IVASeat><Position X="1" /></IVASeat>
      <IVASeat><Position X="2" /></IVASeat>
      <IVASeat><Position X="3" /></IVASeat>
    </PartGameData></Assets>`);
    expect(parsed.ivaSeats.map((s) => [s.id, s.position.x])).toEqual([
      ['_seat1', 1],
      ['_seat2', 2],
      ['_seat3', 3],
    ]);
  });

  it('takes the C# FIELD defaults when the axis ELEMENTS are absent entirely', () => {
    const parsed = parseSeats(
      `<Assets><PartGameData Id="P"><IVASeat><Position X="1" /></IVASeat></PartGameData></Assets>`,
    );
    expect(seats(parsed)).toEqual([
      {
        id: '_seat1',
        // No `Id` attribute ⇒ no authored KSA id.
        ksaId: null,
        position: { x: 1, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        layerId: IVA_SEAT_LAYER_ID,
      },
    ]);
  });

  it('captures the authored <IVASeat Id> separately from the regenerated editor id', () => {
    const parsed = parseSeats(
      `<Assets><PartGameData Id="P"><IVASeat Id="pilot"><Position X="1" /></IVASeat></PartGameData></Assets>`,
    );
    expect(parsed.ivaSeats[0].id).toBe('_seat1');
    expect(parsed.ivaSeats[0].ksaId).toBe('pilot');
  });

  it('drops a seat whose axis element is PRESENT but empty (each attr defaults to 0), and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A present <ForwardAxis/> reads (0,0,0) — a zero look direction KSA NaNs the camera on.
    const parsed = parseSeats(
      `<Assets><PartGameData Id="P"><IVASeat><ForwardAxis /></IVASeat></PartGameData></Assets>`,
    );
    expect(parsed.ivaSeats).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('<IVASeat>');
    warn.mockRestore();
  });

  it('drops a seat whose axes are parallel, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parseSeats(`<Assets><PartGameData Id="P"><IVASeat>
      <ForwardAxis X="1" /><UpAxis X="1" />
    </IVASeat></PartGameData></Assets>`);
    expect(parsed.ivaSeats).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('leaves a <SubPartGameData><IVASeat> riding the passthrough (Part-level seats only)', () => {
    const xml = `<Assets>
      <PartGameData Id="P"><EditorTag Value="Hidden" /></PartGameData>
      <SubPartGameData Id="Tmpl">
        <IVASeat><Position X="0.5" /><ForwardAxis X="1" /><UpAxis Z="-1" /></IVASeat>
      </SubPartGameData>
    </Assets>`;
    const parsed = parseSeats(xml);
    expect(parsed.ivaSeats).toEqual([]);
    const spd = parsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!;
    expect(spd.unknownChildren.map((n) => n.tag)).toEqual(['IVASeat']);
    // …and it survives serialize → re-parse verbatim.
    const source = editingPart({ partId: 'P', subPartGameData: parsed.subPartGameData });
    const reparsed = roundTrip(source);
    expect(
      reparsed.subPartGameData.find((s) => s.subPartTemplateId === 'Tmpl')!.unknownChildren,
    ).toEqual(spd.unknownChildren);
  });

  it('reads the real Core seats from the vendored fixture', () => {
    const parsed = gameDataFromAssets(
      readVendoredAsset('CoreIVASpaceAGameData.xml'),
      'CoreIVASpaceA_Prefab_MediumCapsuleA',
      new DOMParser(),
    )!;
    expect(seats(parsed).map((s) => [s.id, s.position, s.rotation])).toEqual([
      ['_seat1', { x: -0.45, y: 0.42, z: -0.35 }, { x: 0, y: 0, z: 0 }],
      ['_seat2', { x: -0.45, y: -0.42, z: -0.35 }, { x: 0, y: 0, z: 0 }],
    ]);
    // The fixture's part-level `<Light>` is MODELED (the warm ray-traced interior Point
    // light) — nothing rides the passthrough anymore.
    expect(parsed.gameData.unknownChildren).toEqual([]);
    expect(parsed.lights.map((l) => [l.id, l.ownerTemplateId, l.type])).toEqual([
      ['_light1', null, 'Point'],
      ['_light2', null, 'Point'],
      ['_light3', null, 'Point'],
    ]);
    expect(parsed.lights[0].position).toEqual({ x: -0.275, y: 0, z: -0.8 });
    expect(parsed.lights[0].rangeM).toBe(1.5);
    expect(parsed.lights[0].intensity).toBe(0.05);
    expect(parsed.lights[0].color).toEqual({ r: 1, g: 0.9, b: 0.7 });
    expect(parsed.lights[0].rayTracing).toBe(true);
    expect(parsed.lights[0].disableInIva).toBe(false);
    // …and the two seat face-fill lights build 5261 added, which carry <DisableInIva>.
    expect(parsed.lights.slice(1).map((l) => l.disableInIva)).toEqual([true, true]);
    expect(parsed.lights[1].position).toEqual({ x: -0.1, y: 0.42, z: -0.6 });
    expect(parsed.lights[2].position).toEqual({ x: -0.1, y: -0.42, z: -0.6 });
  });
});
