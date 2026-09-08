import { DOMParser } from '@xmldom/xmldom';
import { readVendoredAsset } from './ksaTestAssets';
import { subPartGameDataFromDoc } from './partXmlParser';
import { describe, it, expect } from 'vitest';
import { validateEngines } from './engineValidation';
import type { EngineIssue } from './engineValidation';
import { REACTION_FIXTURES } from './__fixtures__/reactionFixtures';
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
const REACTIONS = REACTION_FIXTURES;

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
    p.gameData.rockets[0].nozzles.push({
      id: 'LiquidNozzle',
      subPartInstanceId: null,
      areaRatioMultiplier: 1,
    });
    expect(has(p, 'rocket-mixes-solid-and-liquid')).toBe(true);
  });

  it('flags a rocket that mixes a liquid core with a solid nozzle', () => {
    const p = goodLiquidPart();
    p.gameData.solidNozzles.push(createSolidMotorNozzle('SolidNozzle'));
    p.gameData.rockets[0].nozzles.push({
      id: 'SolidNozzle',
      subPartInstanceId: null,
      areaRatioMultiplier: 1,
    });
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
      description: '',
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
    // Blocking first, then every warning — including the 5091 `nozzle-not-referenced` the
    // emptied nozzle list now also earns (D16).
    expect(severities[0]).toBe('block');
    expect(severities.slice(1).every((s) => s === 'warn')).toBe(true);
    expect(severities.filter((s) => s === 'block')).toHaveLength(1);
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
    // …but an EMPTY one hands off to `wiring-entry-no-feeds` rather than going quiet: the
    // export drops it, so the consumer is still unwired in the shipped XML.
    expect(has(p, 'wiring-entry-no-feeds')).toBe(true);

    // …and so does an unscoped one (KSA's fallback lookup).
    p.gameData.consumerFeedWiring = [
      { consumerId: 'ThrustChamber', subPartInstanceId: null, feeds: [] },
    ];
    expect(has(p, 'consumer-not-wired')).toBe(false);
    expect(has(p, 'wiring-entry-no-feeds')).toBe(true);
  });

  // The gap that let a whole tutorial part validate clean while reaching no propellant:
  // `consumer-not-wired` only checks that an entry EXISTS, and `buildConsumerFeedWiringElement`
  // drops a feed-less one from the export.
  it('flags a wiring entry that wires no feed points, and stops once it has one', () => {
    const p = createEmptyPart();
    p.placements.push(placement('chamber_1', 'Core.Chamber'));
    p.subPartGameData.push({
      ...createSubPartGameData('Core.Chamber'),
      combustors: [createCombustor('ThrustChamber')],
    });
    p.gameData.tanks.push({ ...createTank(), id: 'fuel_main' });
    p.gameData.consumerFeedWiring.push({
      consumerId: 'ThrustChamber',
      subPartInstanceId: 'chamber_1',
      feeds: [],
    });
    const issue = validateEngines(p, REACTIONS).find((i) => i.code === 'wiring-entry-no-feeds')!;
    expect(issue.severity).toBe('warn');
    expect(issue.message).toContain('wires no feed points');
    expect(issue.source).toEqual({ templateId: null, module: 'wiring', index: 0 });

    p.gameData.consumerFeedWiring[0].feeds = [
      { kind: 'container', containerId: 'fuel_main', subPartInstanceId: null },
    ];
    expect(has(p, 'wiring-entry-no-feeds')).toBe(false);
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

describe('validateEngines — gimbals (Gimbal.cs / GimbalController.RecomputeStaticData)', () => {
  /** A liquid engine on a placed SubPart, with a gimbal on that placement. */
  function gimballed(exhaust = { x: -1, y: 0, z: 0 }) {
    const p = createEmptyPart();
    p.placements.push(placement('bell_1', 'Core.Bell'), placement('body_1', 'Core.Body'));
    const spd = createSubPartGameData('Core.Bell');
    spd.combustors.push(createCombustor('ThrustChamber'));
    spd.nozzles.push({ ...createNozzle('Nozzle'), exhaustDirection: exhaust });
    spd.rockets.push(createRocket('Engine', 'ThrustChamber', ['Nozzle']));
    p.subPartGameData.push(spd);
    p.gameData.rocketControllers.push(createRocketController('Engine', 'engine', ['Engine']));
    p.gameData.gimbals.push({
      subPartInstanceId: 'bell_1',
      transform: identityTransform(),
      maxAngleYDeg: 8,
      maxAngleZDeg: 8,
      constrainToCircle: true,
    });
    return p;
  }

  it('is quiet for a gimbal on the nozzle-carrying SubPart, thrust along local X', () => {
    const p = gimballed();
    expect(has(p, 'gimbal-vectors-nothing')).toBe(false);
    expect(has(p, 'gimbal-thrust-axis-not-x')).toBe(false);
    expect(has(p, 'gimbal-cannot-actuate')).toBe(false);
  });

  // RecomputeStaticData walks `Gimbal.Parent.Modules.Get<RocketNozzle>()` — its OWN SubPart.
  it('flags a gimbal on a SubPart that carries no nozzles', () => {
    const p = gimballed();
    p.gameData.gimbals[0].subPartInstanceId = 'body_1';
    const issue = validateEngines(p, REACTIONS).find((i) => i.code === 'gimbal-vectors-nothing')!;
    expect(issue.severity).toBe('warn');
    expect(issue.source).toEqual({ templateId: null, module: 'gimbal', index: 0 });
  });

  // UpdateState rotates about local Y and Z; RecomputeStaticData sizes authority with
  // `new float3(0, sin(MaxAngleY), sin(MaxAngleZ))` — thrust is assumed to lie along local X.
  it('flags a thrust axis that is not the SubPart local X', () => {
    const p = gimballed({ x: 0, y: 1, z: 0 }); // the "rotate the placement 90°" trap
    expect(has(p, 'gimbal-thrust-axis-not-x')).toBe(true);
  });

  it('accepts +X as readily as −X, and tolerates a mostly-X vector', () => {
    expect(has(gimballed({ x: 1, y: 0, z: 0 }), 'gimbal-thrust-axis-not-x')).toBe(false);
    expect(has(gimballed({ x: -0.98, y: 0.2, z: 0 }), 'gimbal-thrust-axis-not-x')).toBe(false);
  });

  // Gimbal.CanActuate() — a 0/0 gimbal is never even built.
  it('flags a 0/0 gimbal, and says nothing else about it', () => {
    const p = gimballed();
    p.gameData.gimbals[0] = { ...p.gameData.gimbals[0], maxAngleYDeg: 0, maxAngleZDeg: 0 };
    expect(has(p, 'gimbal-cannot-actuate')).toBe(true);
    expect(has(p, 'gimbal-thrust-axis-not-x')).toBe(false);
  });
});

describe('validateEngines — reaction lookup fallbacks', () => {
  it('uses the part’s own custom reaction when the live catalog lacks the id', () => {
    const p = goodSolidPart();
    p.gameData.solidMotors[0].reactionId = 'MyMono';
    p.customReactions.push({
      id: 'MyMono',
      name: 'My Mono',
      description: '',
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

// The `source` metadata is EDITOR targeting only (design D4 / §A7): it must never change a
// code, a message or a severity — the findings pipeline uses it to scope + scroll.
describe('validateEngines — issue source metadata', () => {
  it('tags a template-owned combustor issue with its template id', () => {
    const p = createEmptyPart();
    p.partId = 'Tmpl';
    p.placements.push(placement('thruster_1', 'ThrusterA'));
    p.subPartGameData.push({
      ...createSubPartGameData('ThrusterA'),
      combustors: [{ ...createCombustor('Chamber'), feeds: [] }],
    });

    const issue = validateEngines(p, REACTIONS).find((i) => i.code === 'consumer-no-feeds')!;
    expect(issue.source).toEqual({ templateId: 'ThrusterA', module: 'combustor' });
  });

  it('tags a part-level module with a null template id, and an unwired consumer as wiring', () => {
    const p = createEmptyPart();
    p.partId = 'Part';
    p.placements.push(placement('thruster_1', 'ThrusterA'));
    p.subPartGameData.push({
      ...createSubPartGameData('ThrusterA'),
      combustors: [{ ...createCombustor('Chamber'), feeds: [{ kind: 'parent' }] }],
    });
    p.gameData.nozzles.push({ ...createNozzle('Nozzle'), exhaustDirection: { x: -2, y: 0, z: 0 } });

    const issues = validateEngines(p, REACTIONS);
    expect(issues.find((i) => i.code === 'consumer-not-wired')!.source).toEqual({
      templateId: null,
      module: 'wiring',
    });
    expect(issues.find((i) => i.code === 'nozzle-direction-not-unit')!.source).toEqual({
      templateId: null,
      module: 'nozzle',
      index: 0,
    });
  });
});

// ── D16 — KSA rev-5091 wiring-warning parity (gap Q4) ───────────────────────

describe('validateEngines — 5091 wiring warnings (D16)', () => {
  const severityOf = (part: EditingPart, code: string) =>
    validateEngines(part, REACTIONS).find((i) => i.code === code)?.severity;

  it('stays silent on both clean fixtures', () => {
    for (const build of [goodLiquidPart, goodSolidPart]) {
      const found = codes(validateEngines(build(), REACTIONS));
      expect(found).toEqual([]);
    }
  });

  // RocketControllerTemplate.OnDataLoad (decomp: KSA/RocketControllerTemplate.cs:16-28)
  it('flags a controller that references no Rockets', () => {
    const p = goodLiquidPart();
    p.gameData.rocketControllers[0].rocketRefs = [];
    expect(severityOf(p, 'controller-no-rockets')).toBe('warn');
    expect(
      validateEngines(p, REACTIONS).find((i) => i.code === 'controller-no-rockets')?.source,
    ).toEqual({ templateId: null, module: 'controller', index: 0 });
  });

  // Rocket.OnFullPartCreated (decomp: KSA/Rocket.cs:21-42)
  it('flags a liquid rocket bound to a core but no nozzles', () => {
    const p = goodLiquidPart();
    p.gameData.rockets[0].nozzles = [];
    expect(severityOf(p, 'rocket-no-nozzles')).toBe('warn');
  });

  it('leaves the solid case to the existing BLOCK (RocketTemplate.Create throws)', () => {
    const p = goodSolidPart();
    p.gameData.rockets[0].nozzles = [];
    const found = codes(validateEngines(p, REACTIONS));
    expect(found).toContain('solid-rocket-needs-nozzle');
    expect(found).not.toContain('rocket-no-nozzles');
  });

  // RocketNozzle.OnFullPartCreated (decomp: KSA/RocketNozzle.cs:106-121)
  it('flags a nozzle no Rocket names', () => {
    const p = goodLiquidPart();
    p.gameData.nozzles.push(createNozzle('Orphan'));
    expect(severityOf(p, 'nozzle-not-referenced')).toBe('warn');
    expect(
      codes(validateEngines(p, REACTIONS)).filter((c) => c === 'nozzle-not-referenced'),
    ).toHaveLength(1);
  });

  // RocketCore.OnFullPartCreated, half 1 (decomp: KSA/RocketCore.cs:28-41)
  it('flags a core no Rocket names as its Core', () => {
    const p = goodLiquidPart();
    p.gameData.rockets[0].core = { id: 'Nonexistent', subPartInstanceId: null };
    expect(severityOf(p, 'core-not-referenced')).toBe('warn');
  });

  // RocketCore.OnFullPartCreated, half 2 (decomp: KSA/RocketCore.cs:43-58)
  it('flags a core whose Rocket no controller drives', () => {
    const p = goodLiquidPart();
    p.gameData.rocketControllers = [];
    const issue = validateEngines(p, REACTIONS).find((i) => i.code === 'core-not-referenced');
    expect(issue?.severity).toBe('warn');
    expect(issue?.message).toContain('no controller driving its Rocket');
  });

  // PartTemplate.AddResolvedFeed reached through a wiring entry (decomp: KSA/PartTemplate.cs:446-466)
  it('flags a ConsumerFeedWiring feed point that resolves to nothing', () => {
    const p = goodLiquidPart();
    p.gameData.consumerFeedWiring.push({
      consumerId: 'ThrustChamber',
      subPartInstanceId: null,
      feeds: [{ kind: 'container', containerId: '_ghost', subPartInstanceId: null }],
    });
    expect(severityOf(p, 'wiring-feed-unresolvable')).toBe('warn');
    expect(
      validateEngines(p, REACTIONS).find((i) => i.code === 'wiring-feed-unresolvable')?.source,
    ).toEqual({ templateId: null, module: 'wiring', index: 0 });
  });

  it('stays quiet on a wiring entry whose feed points resolve', () => {
    const p = goodLiquidPart();
    p.gameData.tanks.push({ ...createTank(), id: 'Fuel' });
    p.gameData.consumerFeedWiring.push({
      consumerId: 'ThrustChamber',
      subPartInstanceId: null,
      feeds: [
        { kind: 'container', containerId: 'Fuel', subPartInstanceId: null },
        { kind: 'connector', connectorId: '_connector1' },
      ],
    });
    expect(codes(validateEngines(p, REACTIONS))).not.toContain('wiring-feed-unresolvable');
  });

  it('addresses a SubPart-scope orphan nozzle to its own template', () => {
    const p = goodLiquidPart();
    const spd = createSubPartGameData('Core.Bell');
    spd.nozzles.push(createNozzle('SubOrphan'));
    p.subPartGameData.push(spd);
    p.placements.push(placement('bell_1', 'Core.Bell'));
    const issue = validateEngines(p, REACTIONS).find((i) => i.code === 'nozzle-not-referenced');
    expect(issue?.source).toEqual({ templateId: 'Core.Bell', module: 'nozzle', index: 0 });
  });
});

describe('validateEngines — module reference scopes', () => {
  function repeatedEngines() {
    const p = createEmptyPart();
    p.partId = 'Repeated';
    p.placements.push(placement('a', 'Chamber'), placement('b', 'Chamber'));
    const data = createSubPartGameData('Chamber');
    data.combustors.push(createCombustor('Core'));
    data.nozzles.push(createNozzle('Nozzle'));
    data.rockets.push(createRocket('Engine', 'Core', ['Nozzle']));
    p.subPartGameData.push(data);
    p.connectors.push(connector('Fuel', ['BulkFluid']));
    p.gameData.consumerFeedWiring.push({
      consumerId: 'Core',
      subPartInstanceId: null,
      feeds: [{ kind: 'connector', connectorId: 'Fuel' }],
    });
    const controller = createRocketController('Main', 'engine', []);
    controller.rocketRefs = [
      { id: 'Engine', subPartInstanceId: 'a' },
      { id: 'Engine', subPartInstanceId: 'b' },
    ];
    p.gameData.rocketControllers.push(controller);
    return p;
  }

  it('resolves local template modules separately for every placement', () => {
    expect(validateEngines(repeatedEngines(), REACTIONS)).toEqual([]);
  });

  it('does not let a controller reference one instance by naming another with the same ID', () => {
    const p = repeatedEngines();
    p.gameData.rocketControllers[0].rocketRefs.pop();
    const issues = validateEngines(p, REACTIONS);
    expect(issues.filter((i) => i.code === 'core-not-referenced')).toHaveLength(1);
    p.gameData.rocketControllers[0].rocketRefs[0].subPartInstanceId = null;
    expect(has(p, 'controller-rocket-unresolvable')).toBe(true);
  });

  it('blocks a local template ref that incorrectly names a peer placement', () => {
    const p = repeatedEngines();
    p.subPartGameData[0].rockets[0].core.subPartInstanceId = 'a';
    expect(has(p, 'rocket-core-unresolvable')).toBe(true);
  });

  it('distinguishes liquid and solid nozzles with identical IDs in different scopes', () => {
    const p = goodLiquidPart();
    p.placements.push(placement('solid', 'Solid'));
    p.subPartGameData.push({
      ...createSubPartGameData('Solid'),
      solidNozzles: [createSolidMotorNozzle('Nozzle')],
    });
    expect(has(p, 'rocket-mixes-solid-and-liquid')).toBe(false);
    p.gameData.rockets[0].nozzles[0].subPartInstanceId = 'solid';
    expect(has(p, 'rocket-mixes-solid-and-liquid')).toBe(true);
    expect(has(p, 'nozzle-not-referenced')).toBe(true);
  });

  it('blocks unknown nozzle refs even when another scope has the same nozzle ID', () => {
    const p = repeatedEngines();
    p.gameData.combustors.push(createCombustor('RootCore'));
    p.gameData.rockets.push(createRocket('RootEngine', 'RootCore', ['Nozzle']));
    expect(has(p, 'rocket-nozzle-unresolvable')).toBe(true);
  });

  it('checks solid cores and thruster controllers on template-owned rockets', () => {
    const p = repeatedEngines();
    p.subPartGameData[0].combustors = [];
    p.subPartGameData[0].solidMotors = [createSolidMotor('Core')];
    p.subPartGameData[0].nozzles = [];
    p.subPartGameData[0].solidNozzles = [createSolidMotorNozzle('Nozzle')];
    p.gameData.rocketControllers[0].kind = 'thruster';
    expect(has(p, 'solid-motor-on-thruster-controller')).toBe(true);
    p.subPartGameData[0].rockets[0].nozzles = [];
    expect(has(p, 'solid-rocket-needs-nozzle')).toBe(true);
  });

  it('blocks sharing a core or nozzle between Rockets', () => {
    const p = goodLiquidPart();
    p.gameData.rockets.push(createRocket('Duplicate', 'ThrustChamber', ['Nozzle']));
    expect(has(p, 'core-used-by-multiple-rockets')).toBe(true);
    expect(has(p, 'nozzle-used-by-multiple-rockets')).toBe(true);
  });
});

it('warns about the runtime ratio-1 fallback without claiming a KSA load failure', () => {
  const p = goodLiquidPart();
  p.gameData.nozzles[0].areaRatio = Number.NaN;
  const issues = validateEngines(p, REACTIONS);
  expect(issues).toHaveLength(1);
  expect(issues[0].code).toBe('nozzle-area-ratio-default');
  expect(issues[0].severity).toBe('warn');
  expect(issues[0].message).toContain('KSA uses 1');
});

it('blocks a missing mixture ratio even when the reaction catalog is unavailable', () => {
  const p = goodLiquidPart();
  p.gameData.combustors[0].mixtureRatio = null;
  expect(
    validateEngines(p).find((i) => i.code === 'combustor-mixture-ratio-required')?.severity,
  ).toBe('block');
  p.gameData.combustors[0].reactionId = 'HydrazineDecomposition';
  expect(has(p, 'combustor-mixture-ratio-required')).toBe(false);
});

describe('validateEngines — SubPart controllers', () => {
  function builtInRcs() {
    const doc = new DOMParser().parseFromString(
      readVendoredAsset('CorePropulsionBGameData.xml'),
      'application/xml',
    ) as unknown as Document;
    const p = createEmptyPart();
    p.subPartGameData = subPartGameDataFromDoc(doc);
    for (const data of p.subPartGameData) {
      p.placements.push(placement(data.subPartTemplateId + '_a', data.subPartTemplateId));
      p.placements.push(placement(data.subPartTemplateId + '_b', data.subPartTemplateId));
    }
    return p;
  }

  it('recognizes stock RD-4 controllers on every placed RCS template without mutating the document', () => {
    const p = builtInRcs();
    const before = structuredClone(p.subPartGameData);
    expect(p.subPartGameData).toHaveLength(3);
    expect(
      p.subPartGameData.every((data) =>
        data.rocketControllers.some((controller) => controller.kind === 'thruster'),
      ),
    ).toBe(true);
    const issues = validateEngines(p, REACTIONS);
    expect(
      issues.filter((i) => i.severity === 'block' || i.code === 'core-not-referenced'),
    ).toEqual([]);
    expect(p.subPartGameData).toEqual(before);
  });

  it('blocks a reference to a peer placement instead of treating it as a local Rocket', () => {
    const p = builtInRcs();
    const controller = p.subPartGameData[0].rocketControllers[0];
    controller.rocketRefs[0].subPartInstanceId = p.placements[1].instanceId;
    const issues = validateEngines(p, REACTIONS).filter(
      (i) => i.code === 'controller-rocket-unresolvable',
    );
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.severity === 'block')).toBe(true);
    expect(issues[0].source).toEqual({
      templateId: p.subPartGameData[0].subPartTemplateId,
      module: 'controller',
      index: 0,
    });
  });

  it('checks solid motor restrictions and empty references on template controllers', () => {
    const p = builtInRcs();
    const data = p.subPartGameData[0];
    const coreId = data.combustors[0].id;
    data.combustors = [];
    data.solidMotors = [createSolidMotor(coreId)];
    expect(has(p, 'solid-motor-on-thruster-controller')).toBe(true);
    data.rocketControllers[0].rocketRefs = [];
    expect(has(p, 'controller-no-rockets')).toBe(true);
  });
});

it('validates saved passthrough controllers and blocks duplicates of newly authored ones', () => {
  const p = goodLiquidPart();
  const data = createSubPartGameData('LegacyThruster');
  data.rocketControllers = [createRocketController('Local', 'thruster')];
  data.unknownChildren = [
    { tag: 'RocketThrusterController', attrs: { Id: 'Local' }, children: [], text: '' },
  ];
  p.subPartGameData.push(data);
  p.placements.push(placement('legacy', 'LegacyThruster'));
  expect(has(p, 'duplicate-controller-id')).toBe(true);
  data.rocketControllers = [];
  expect(has(p, 'duplicate-controller-id')).toBe(false);
  expect(has(p, 'controller-no-rockets')).toBe(true);
});

describe('current solid motor load constraints', () => {
  it('requires Fixed Solid reactions with a burn law and exactly one solid phase', () => {
    const part = goodSolidPart();
    const reaction = structuredClone(REACTIONS.get('APCP')!);
    if (reaction.kind !== 'Fixed') throw new Error('expected Fixed APCP fixture');
    const catalog = new Map([[reaction.id, reaction]]);
    const issues = () => codes(validateEngines(part, catalog));
    expect(issues()).not.toContain('solid-motor-needs-one-solid-reactant');
    reaction.reactants = [];
    expect(issues()).toContain('solid-motor-needs-one-solid-reactant');
    reaction.reactants = [{ phaseId: 'H2(l)', massShare: 1, massFraction: 1 }];
    expect(issues()).toContain('solid-motor-needs-one-solid-reactant');
    reaction.reactants = [{ phaseId: 'APCP(s)', massShare: 1, massFraction: 1 }];
    reaction.burnRate = null;
    expect(issues()).toContain('solid-motor-needs-burn-rate');
    const mixture = { ...REACTIONS.get('Hydrolox')!, id: 'APCP', category: 'Solid' as const };
    expect(codes(validateEngines(part, new Map([['APCP', mixture]])))).toContain(
      'solid-motor-needs-solid-reaction',
    );
  });

  it('matches the open minimum and closed maximum pressure boundaries', () => {
    const p = goodSolidPart();
    const motor = p.gameData.solidMotors[0];
    motor.defaultPressurePa = 1_500_000;
    expect(has(p, 'solid-motor-pressure-out-of-range')).toBe(true);
    motor.defaultPressurePa = 1_500_001;
    expect(has(p, 'solid-motor-pressure-out-of-range')).toBe(false);
    motor.defaultPressurePa = 15_000_000;
    expect(has(p, 'solid-motor-pressure-out-of-range')).toBe(false);
    motor.defaultPressurePa = 15_000_001;
    expect(has(p, 'solid-motor-pressure-out-of-range')).toBe(true);
  });

  it('validates inherited grain casing mass with material precedence in both scopes', () => {
    const p = createEmptyPart();
    const grain = createSolidGrainSegment('Case');
    grain.wallMaterialId = '';
    p.gameData.solidGrainSegments = [grain];
    expect(has(p, 'grain-mass-unspecified')).toBe(true);
    grain.massKg = 5;
    expect(has(p, 'grain-mass-unspecified')).toBe(false);
    grain.massKg = null;
    grain.densityKgM3 = 2700;
    expect(has(p, 'grain-mass-unspecified')).toBe(false);
    grain.wallMaterialId = 'N2(g)';
    expect(has(p, 'grain-material-not-incompressible')).toBe(true);
    grain.wallMaterialId = 'H2O(l)';
    expect(has(p, 'grain-material-not-incompressible')).toBe(false);
    const data = createSubPartGameData('Segment');
    data.solidGrainSegments = [{ ...grain, wallMaterialId: '', densityKgM3: 0 }];
    p.subPartGameData = [data];
    expect(
      validateEngines(p, REACTIONS).find((i) => i.code === 'grain-mass-unspecified')?.source,
    ).toEqual({ templateId: 'Segment', module: 'grain', index: 0 });
  });
});
