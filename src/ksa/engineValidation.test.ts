import { describe, it, expect } from 'vitest';
import { validateEngines } from './engineValidation';
import type { EngineIssue } from './engineValidation';
import type { ReactionData } from './reactionCatalog';
import {
  createCombustor,
  createEmptyPart,
  createNozzle,
  createRocket,
  createRocketController,
  createSolidGrainSegment,
  createSolidMotor,
  createSolidMotorNozzle,
  createSubPartGameData,
  createTank,
  DEFAULT_LAYER_ID,
  identityTransform,
} from './types';
import type { ConnectorCapability, EditingPart } from './types';

/** The reaction facts the solid-motor checks read, as the live catalog would supply them. */
const REACTIONS: ReadonlyMap<string, ReactionData> = new Map<string, ReactionData>([
  [
    'APCP',
    {
      kind: 'Fixed',
      id: 'APCP',
      name: 'APCP',
      category: 'Solid',
      reactants: [],
      lut: { rows: [] },
      burnRate: { coefficientMPerS: 0.0045, exponent: 0.35 },
      minimumBurnPressurePa: 1_500_000,
      maxStablePressurePa: 15_000_000,
      exhaustCondensedFraction: 0.336965,
    },
  ],
  [
    'Hydrolox',
    {
      kind: 'Mixture',
      id: 'Hydrolox',
      name: 'Hydrogen + Oxygen',
      category: 'Bipropellant',
      reactants: [],
      mixtureLut: { ratios: [1], slices: [{ rows: [] }] },
      defaultMixtureRatio: 5.5,
    },
  ],
]);

const codes = (issues: EngineIssue[]) => issues.map((i) => i.code);
const has = (part: EditingPart, code: string) =>
  codes(validateEngines(part, REACTIONS)).includes(code);

function connector(id: string, capabilities: ConnectorCapability[] = []) {
  return {
    id,
    ...identityTransform(),
    flags: [],
    capabilities,
    siblingIds: [],
    layerId: DEFAULT_LAYER_ID,
  };
}

function placement(instanceId: string, subPartTemplateId: string) {
  return { instanceId, subPartTemplateId, ...identityTransform(), layerId: DEFAULT_LAYER_ID };
}

/**
 * A well-formed LIQUID engine: a chamber feeding from a BulkFluid connector, one nozzle,
 * a rocket binding them, and an engine controller. Every check must stay silent on it.
 */
function goodLiquidPart(): EditingPart {
  const p = createEmptyPart();
  p.partId = 'GoodLiquid';
  p.connectors.push(connector('_connector1', ['BulkFluid']));
  p.gameData.combustors.push({
    ...createCombustor('ThrustChamber'),
    feeds: [{ kind: 'connector', connectorId: '_connector1' }],
  });
  p.gameData.nozzles.push(createNozzle('Nozzle'));
  p.gameData.rockets.push(createRocket('Engine', 'ThrustChamber', ['Nozzle']));
  p.gameData.rocketControllers.push(createRocketController('Main', 'engine', ['Engine']));
  return p;
}

/** A well-formed SOLID booster: motor + grain container + solid nozzle + rocket. */
function goodSolidPart(): EditingPart {
  const p = createEmptyPart();
  p.partId = 'GoodSolid';
  p.connectors.push(connector('_connector25', ['SolidMotorCase']));
  p.gameData.solidGrainSegments.push(createSolidGrainSegment('Grain'));
  p.gameData.solidMotors.push({
    ...createSolidMotor('MotorCore'),
    feeds: [
      { kind: 'container', containerId: 'Grain', subPartInstanceId: null },
      { kind: 'connector', connectorId: '_connector25' },
    ],
  });
  p.gameData.solidNozzles.push(createSolidMotorNozzle('Nozzle'));
  p.gameData.rockets.push(createRocket('Motor', 'MotorCore', ['Nozzle']));
  p.gameData.rocketControllers.push(createRocketController('SRB', 'engine', ['Motor']));
  return p;
}

describe('validateEngines — clean parts', () => {
  it('reports nothing for a well-formed liquid engine', () => {
    expect(validateEngines(goodLiquidPart(), REACTIONS)).toEqual([]);
  });

  it('reports nothing for a well-formed solid booster', () => {
    expect(validateEngines(goodSolidPart(), REACTIONS)).toEqual([]);
  });

  it('reports nothing for an empty part', () => {
    expect(validateEngines(createEmptyPart(), REACTIONS)).toEqual([]);
  });
});

describe('validateEngines — KSA throws at load (blocking)', () => {
  // RocketTemplate.Create: "Rocket X mixes solid and liquid components"
  it('flags a rocket that mixes a solid core with a liquid nozzle', () => {
    const p = goodSolidPart();
    p.gameData.nozzles.push(createNozzle('LiquidNozzle'));
    p.gameData.rockets[0].nozzles.push({ id: 'LiquidNozzle', subPartInstanceId: null });
    expect(has(p, 'rocket-mixes-solid-and-liquid')).toBe(true);
  });

  it('flags a rocket that mixes a liquid core with a solid nozzle', () => {
    const p = goodLiquidPart();
    p.gameData.solidNozzles.push(createSolidMotorNozzle('SolidNozzle'));
    p.gameData.rockets[0].nozzles.push({ id: 'SolidNozzle', subPartInstanceId: null });
    expect(has(p, 'rocket-mixes-solid-and-liquid')).toBe(true);
  });

  // RocketTemplate.Create: "Solid motor rocket X needs at least one nozzle"
  it('flags a solid rocket with no nozzles', () => {
    const p = goodSolidPart();
    p.gameData.rockets[0].nozzles = [];
    expect(has(p, 'solid-rocket-needs-nozzle')).toBe(true);
  });

  // A liquid rocket with no nozzles is legal at load (it just makes no thrust).
  it('does not flag a LIQUID rocket with no nozzles', () => {
    const p = goodLiquidPart();
    p.gameData.rockets[0].nozzles = [];
    expect(has(p, 'solid-rocket-needs-nozzle')).toBe(false);
  });

  // RocketThrusterControllerTemplate.Create: "Solid motor X cannot be driven by thruster…"
  it('flags a thruster controller driving a solid motor', () => {
    const p = goodSolidPart();
    p.gameData.rocketControllers = [createRocketController('RCS', 'thruster', ['Motor'])];
    expect(has(p, 'solid-motor-on-thruster-controller')).toBe(true);
  });

  it('does not flag an ENGINE controller driving a solid motor', () => {
    expect(has(goodSolidPart(), 'solid-motor-on-thruster-controller')).toBe(false);
  });

  // SolidMotorTemplate.Create: "Solid motor X requires a solid reaction"
  it('flags a solid motor pointed at a non-solid reaction', () => {
    const p = goodSolidPart();
    p.gameData.solidMotors[0].reactionId = 'Hydrolox';
    expect(has(p, 'solid-motor-needs-solid-reaction')).toBe(true);
  });

  // SolidMotorTemplate.Create: pressure must be > MinimumBurnPressure and <= MaxStablePressure.
  it('flags a default pressure at or below the deflagration limit', () => {
    const p = goodSolidPart();
    p.gameData.solidMotors[0].defaultPressurePa = 1_500_000; // exactly the minimum ⇒ throws
    expect(has(p, 'solid-motor-pressure-out-of-range')).toBe(true);
  });

  it('flags a default pressure above the max stable pressure', () => {
    const p = goodSolidPart();
    p.gameData.solidMotors[0].defaultPressurePa = 16_000_000;
    expect(has(p, 'solid-motor-pressure-out-of-range')).toBe(true);
  });

  it('accepts a default pressure exactly at the max stable pressure', () => {
    const p = goodSolidPart();
    p.gameData.solidMotors[0].defaultPressurePa = 15_000_000;
    expect(has(p, 'solid-motor-pressure-out-of-range')).toBe(false);
  });

  // FixedReactionTemplate.Create throws on an incomplete Category="Solid" reaction.
  it('flags a solid custom reaction missing its burn-rate data', () => {
    const p = goodSolidPart();
    p.customReactions.push({
      id: 'MyAPCP',
      name: 'My APCP',
      category: 'Solid',
      reactants: [{ phaseId: 'APCP(s)', massShare: 1 }],
      lut: [],
      burnRate: null,
      minimumBurnPressurePa: null,
      maxStablePressurePa: null,
      exhaustCondensedFraction: null,
    });
    expect(has(p, 'solid-reaction-incomplete')).toBe(true);
  });

  it('lists blocking issues before warnings', () => {
    const p = goodSolidPart();
    p.gameData.rockets[0].nozzles = []; // blocking
    p.gameData.solidMotors[0].feeds.push({ kind: 'connector', connectorId: '_ghost' }); // warning
    const severities = validateEngines(p, REACTIONS).map((i) => i.severity);
    expect(severities).toEqual(['block', 'warn']);
  });
});

describe('validateEngines — KSA logs and the part misbehaves (warnings)', () => {
  // PartTemplate.AddResolvedFeed: "feeds from unknown container '…'"
  it('flags a container feed naming no tank or grain segment', () => {
    const p = goodSolidPart();
    p.gameData.solidMotors[0].feeds[0] = {
      kind: 'container',
      containerId: 'Ghost',
      subPartInstanceId: null,
    };
    expect(has(p, 'feed-unknown-container')).toBe(true);
  });

  it('resolves a container feed scoped to a placed SubPart', () => {
    const p = createEmptyPart();
    p.placements.push(placement('seg_1', 'Core.Segment'));
    p.subPartGameData.push({
      ...createSubPartGameData('Core.Segment'),
      solidGrainSegments: [createSolidGrainSegment('Grain')],
    });
    p.gameData.solidMotors.push({
      ...createSolidMotor('MotorCore'),
      feeds: [{ kind: 'container', containerId: 'Grain', subPartInstanceId: 'seg_1' }],
    });
    expect(has(p, 'feed-unknown-container')).toBe(false);
    // …and the same id is NOT reachable without the SubPart= scope.
    p.gameData.solidMotors[0].feeds = [
      { kind: 'container', containerId: 'Grain', subPartInstanceId: null },
    ];
    expect(has(p, 'feed-unknown-container')).toBe(true);
  });

  it('ignores an unnamed tank (a blank Id is unaddressable)', () => {
    const p = goodLiquidPart();
    p.gameData.tanks.push(createTank()); // id: ''
    p.gameData.combustors[0].feeds = [
      { kind: 'container', containerId: '', subPartInstanceId: null },
    ];
    expect(has(p, 'feed-unknown-container')).toBe(true);
  });

  // PartTemplate.AddResolvedFeed: "feeds from unknown connector '…'"
  it('flags a connector feed naming no connector', () => {
    const p = goodLiquidPart();
    p.gameData.combustors[0].feeds = [{ kind: 'connector', connectorId: '_ghost' }];
    expect(has(p, 'feed-unknown-connector')).toBe(true);
  });

  // A Bulk path is dead unless every connector along it declares BulkFluid.
  it('flags a Bulk combustor feeding through a connector without BulkFluid', () => {
    const p = goodLiquidPart();
    p.connectors[0].capabilities = [];
    expect(has(p, 'feed-connector-missing-bulkfluid')).toBe(true);
  });

  it('does not flag a Service combustor on a capability-less connector (that IS the default)', () => {
    const p = goodLiquidPart();
    p.connectors[0].capabilities = [];
    p.gameData.combustors[0].plumbing = 'Service';
    expect(has(p, 'feed-connector-missing-bulkfluid')).toBe(false);
  });

  it('flags a solid motor feeding through a connector without SolidMotorCase', () => {
    const p = goodSolidPart();
    p.connectors[0].capabilities = [];
    expect(has(p, 'feed-connector-missing-solidmotorcase')).toBe(true);
  });

  // PartTemplate.ResolveConsumerFeeds: "…has no ConsumerFeedWiring wiring for it"
  it('flags a SubPart consumer deferring to the parent with no wiring entry', () => {
    const p = createEmptyPart();
    p.placements.push(placement('chamber_1', 'Core.Chamber'));
    p.subPartGameData.push({
      ...createSubPartGameData('Core.Chamber'),
      combustors: [createCombustor('ThrustChamber')], // defaults to FeedsFrom Parent
    });
    expect(has(p, 'consumer-not-wired')).toBe(true);

    // An instance-scoped wiring entry satisfies it…
    p.gameData.consumerFeedWiring.push({
      consumerId: 'ThrustChamber',
      subPartInstanceId: 'chamber_1',
      feeds: [],
    });
    expect(has(p, 'consumer-not-wired')).toBe(false);

    // …and so does an unscoped one (KSA's fallback lookup).
    p.gameData.consumerFeedWiring = [
      { consumerId: 'ThrustChamber', subPartInstanceId: null, feeds: [] },
    ];
    expect(has(p, 'consumer-not-wired')).toBe(false);
  });

  it('does not require wiring for a PART-level consumer deferring to the parent', () => {
    const p = createEmptyPart();
    p.gameData.combustors.push(createCombustor('Chamber')); // FeedsFrom Parent, at part level
    expect(has(p, 'consumer-not-wired')).toBe(false);
  });

  // RocketCoreTemplate.OnDataLoad: "declares no FeedsFrom feed points…"
  it('flags a consumer with no feed points at all', () => {
    const p = goodLiquidPart();
    p.gameData.combustors[0].feeds = [];
    expect(has(p, 'consumer-no-feeds')).toBe(true);
  });

  // RocketNozzleTemplate loads Vector3Reference verbatim and VehicleUpdateState applies
  // `TotalThrust * ThrustDirectionVehicleAsmb` — so the vector's LENGTH scales thrust.
  it('flags a non-unit ExhaustDirection (a silent thrust multiplier)', () => {
    const p = goodLiquidPart();
    p.gameData.nozzles[0].exhaustDirection = { x: -2, y: 0, z: 0 };
    const issue = validateEngines(p, REACTIONS).find(
      (i) => i.code === 'nozzle-direction-not-unit',
    )!;
    expect(issue.severity).toBe('warn'); // KSA loads it; the thrust is just wrong
    expect(issue.message).toContain('2.00×');
  });

  it('flags a zero-length ExhaustDirection', () => {
    const p = goodLiquidPart();
    p.gameData.nozzles[0].exhaustDirection = { x: 0, y: 0, z: 0 };
    const issue = validateEngines(p, REACTIONS).find(
      (i) => i.code === 'nozzle-direction-not-unit',
    )!;
    expect(issue.message).toContain('zero-length');
  });

  it('checks SubPart-owned and solid nozzles too, and stays quiet on canted unit vectors', () => {
    const p = goodSolidPart();
    p.gameData.solidNozzles[0].exhaustDirection = { x: 0, y: 0, z: 3 };
    p.placements.push(placement('rcs_1', 'Core.Rcs'));
    p.subPartGameData.push({
      ...createSubPartGameData('Core.Rcs'),
      // Core's own RCS vector: unit-length but non-axial — must NOT be flagged.
      nozzles: [
        { ...createNozzle('Thruster'), exhaustDirection: { x: 0.707106, y: 0, z: 0.707106 } },
      ],
    });
    expect(
      codes(validateEngines(p, REACTIONS)).filter((c) => c === 'nozzle-direction-not-unit'),
    ).toHaveLength(1);
  });

  it('ignores the FX direction, which stock deliberately ships non-unit', () => {
    const p = goodLiquidPart();
    p.gameData.nozzles[0].fxExhaustDirection = { x: 0, y: 0.55, z: -1 };
    expect(has(p, 'nozzle-direction-not-unit')).toBe(false);
  });
});

describe('validateEngines — reaction lookup fallbacks', () => {
  it('uses the part’s own custom reaction when the live catalog lacks the id', () => {
    const p = goodSolidPart();
    p.gameData.solidMotors[0].reactionId = 'MyMono';
    p.customReactions.push({
      id: 'MyMono',
      name: 'My Mono',
      category: 'Monopropellant',
      reactants: [],
      lut: [],
      burnRate: null,
      minimumBurnPressurePa: null,
      maxStablePressurePa: null,
      exhaustCondensedFraction: null,
    });
    expect(has(p, 'solid-motor-needs-solid-reaction')).toBe(true);
  });

  it('falls back to the static Core snapshot with no catalog injected', () => {
    const p = goodSolidPart();
    p.gameData.solidMotors[0].reactionId = 'Hydrolox';
    expect(codes(validateEngines(p))).toContain('solid-motor-needs-solid-reaction');
  });

  it('stays silent on a reaction id nothing knows (rather than guessing)', () => {
    const p = goodSolidPart();
    p.gameData.solidMotors[0].reactionId = 'ModdedUnknown';
    expect(has(p, 'solid-motor-needs-solid-reaction')).toBe(false);
    expect(has(p, 'solid-motor-pressure-out-of-range')).toBe(false);
  });
});
