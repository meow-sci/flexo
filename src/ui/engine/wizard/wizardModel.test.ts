import { describe, it, expect } from 'vitest';
import { REACTION_FIXTURES } from '../../../ksa/__fixtures__/reactionFixtures';
import { validateEngines } from '../../../ksa/engineValidation';
import { serializeGameDataXml, serializePartsXml } from '../../../ksa/partXmlSerializer';
import {
  createEmptyPart,
  createTank,
  DEFAULT_LAYER_ID,
  identityTransform,
} from '../../../ksa/types';
import type { EditingPart } from '../../../ksa/types';
import {
  buildWizardPart,
  initLiquidState,
  initRcsState,
  initSrbState,
  stepsFor,
  validateWizardStep,
} from './wizardModel';
import type { LiquidWizardState, RcsWizardState, SrbWizardState } from './wizardModel';
import { rcsLayout, srbGeometry, SRB_GEN_DEFAULTS } from './wizardGeometry';

/**
 * A deterministic `mint` — the wizard's only source of "randomness". Fresh per test; the
 * prefix distinguishes two runs on the same document (each mints its own mesh templates).
 */
function counter(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** The default liquid wizard run on a blank document. */
function buildDefault(): ReturnType<typeof buildWizardPart> {
  const part = createEmptyPart();
  return buildWizardPart(part, initLiquidState(part), counter());
}

/** The default state with `patch` merged over it. */
function liquidState(part: EditingPart, patch: Partial<LiquidWizardState>): LiquidWizardState {
  return { ...initLiquidState(part), ...patch };
}

const LIQUID_STEP_IDS = stepsFor('liquid').map((s) => s.id);

describe('stepsFor', () => {
  it('lists each family in wizard order', () => {
    expect(LIQUID_STEP_IDS).toEqual([
      'start',
      'performance',
      'feed',
      'gimbal',
      'fx',
      'structure',
      'review',
    ]);
    expect(stepsFor('srb').map((s) => s.id)).toEqual([
      'start',
      'srb-propellant',
      'srb-grain',
      'srb-nozzle',
      'gimbal',
      'fx',
      'structure',
      'review',
    ]);
    expect(stepsFor('rcs').map((s) => s.id)).toEqual([
      'start',
      'rcs-layout',
      'rcs-propellant',
      'feed',
      'fx',
      'structure',
      'review',
    ]);
  });
});

describe('buildWizardPart — liquid defaults', () => {
  it('builds a part validateEngines has nothing to say about', () => {
    const { part } = buildDefault();
    expect(validateEngines(part, REACTION_FIXTURES)).toEqual([]);
  });

  it('never mutates the part it was given', () => {
    const current = createEmptyPart();
    const before = structuredClone(current);
    buildWizardPart(current, initLiquidState(current), counter());
    expect(current).toEqual(before);
  });

  it('produces the expected module graph', () => {
    const result = buildDefault();
    const { part } = result;

    expect(part.customMeshes).toHaveLength(2);
    expect(part.placements).toHaveLength(2);
    expect(part.connectors).toHaveLength(1);
    expect(result.createdMeshIds).toHaveLength(2);

    // The bell (host, index 0) carries the combustor/nozzle/rocket.
    const hostTemplateId = part.customMeshes[0].subPartId;
    expect(result.engineScope).toEqual({ kind: 'subpart', templateId: hostTemplateId });
    const spd = part.subPartGameData.find((s) => s.subPartTemplateId === hostTemplateId);
    expect(spd?.combustors).toHaveLength(1);
    expect(spd?.nozzles).toHaveLength(1);
    expect(spd?.rockets).toHaveLength(1);
    expect(part.subPartGameData).toHaveLength(1);

    // The controller / wiring / tank / gimbal are always part-level.
    expect(part.gameData.rocketControllers).toHaveLength(1);
    expect(part.gameData.consumerFeedWiring).toHaveLength(1);
    expect(part.gameData.tanks).toHaveLength(1);
    expect(part.gameData.gimbals).toHaveLength(1);
    expect(part.gameData.gimbals[0].subPartInstanceId).toBe(part.placements[0].instanceId);

    expect(part.editorTags).toEqual(['Engines']);
    expect(part.gameData.customMass).toBe(500);

    expect(part.colliders).toHaveLength(1);
    expect(part.colliders[0].shape).toBe('Box');
    expect(part.colliders[0].ownerTemplateId).toBeNull();
    expect(part.colliders[0].position).toEqual({ x: 1.25, y: 0, z: 0 });
    expect(part.colliders[0].scale).toEqual({ x: 3.7, y: 1.2, z: 1.2 });

    expect(result.focus).toEqual({ group: 'combustor', scope: 'sub', index: 0 });
    expect(result.exhaustNozzleRef).toEqual({
      scope: 'subpart',
      templateId: hostTemplateId,
      instanceId: part.placements[0].instanceId,
      kind: 'delaval',
      index: 0,
      channel: 'physics',
    });
    expect(result.summary.map((r) => r.kind)).toEqual([
      'mesh',
      'placement',
      'mesh',
      'placement',
      'connector',
      'tank',
      'combustor',
      'nozzle',
      'rocket',
      'controller',
      'wiring',
      'gimbal',
      'collider',
      'mass',
    ]);
  });

  it('converts authored units into the SI the document stores', () => {
    const { part } = buildDefault();
    const spd = part.subPartGameData[0];
    expect(spd.combustors[0].maxPressurePa).toBe(7_500_000);
    expect(spd.combustors[0].thermalEfficiency).toBe(1);
    expect(spd.combustors[0].minimumThrottle).toBe(0.4);
    expect(spd.combustors[0].mixtureRatio).toBe(5.5);
    expect(spd.combustors[0].plumbing).toBe('Bulk');
    expect(spd.nozzles[0].areaRatio).toBe(25);
    expect(spd.nozzles[0].exitDiameterM).toBe(1.1);
    expect(spd.nozzles[0].exhaustLocation.x).toBe(-0.6);
    expect(spd.nozzles[0].exhaustDirection).toEqual({ x: -1, y: 0, z: 0 });
  });
});

describe('buildWizardPart — feed variants', () => {
  it('feeds through the wizard attach node, forcing BulkFluid on it', () => {
    const current = createEmptyPart();
    const state = liquidState(current, {
      feed: { kind: 'connector', connectorId: null },
      attachNodeBulkFluid: false,
    });
    const { part } = buildWizardPart(current, state, counter());

    expect(part.gameData.tanks).toHaveLength(0);
    expect(part.gameData.consumerFeedWiring[0].feeds).toEqual([
      { kind: 'connector', connectorId: '_connector1' },
    ]);
    expect(part.connectors[0].id).toBe('_connector1');
    expect(part.connectors[0].capabilities).toContain('BulkFluid');
    expect(validateEngines(part, REACTION_FIXTURES)).toEqual([]);
  });

  it('adds BulkFluid to an EXISTING connector the feed names', () => {
    const current = createEmptyPart();
    current.connectors.push({
      id: '_connector7',
      ...identityTransform(),
      flags: [],
      capabilities: [],
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
    });
    const state = liquidState(current, { feed: { kind: 'connector', connectorId: '_connector7' } });
    const { part } = buildWizardPart(current, state, counter());

    expect(part.connectors.find((c) => c.id === '_connector7')?.capabilities).toEqual([
      'BulkFluid',
    ]);
    expect(part.gameData.consumerFeedWiring[0].feeds).toEqual([
      { kind: 'connector', connectorId: '_connector7' },
    ]);
  });

  it('reuses an existing container without creating a tank', () => {
    const current = createEmptyPart();
    current.gameData.tanks.push({ ...createTank(), id: 'x' });
    const state = liquidState(current, {
      feed: { kind: 'container', containerId: 'x', subPartInstanceId: null },
    });
    const { part } = buildWizardPart(current, state, counter());

    expect(part.gameData.tanks).toHaveLength(1);
    expect(part.gameData.tanks[0].id).toBe('x');
    expect(part.gameData.consumerFeedWiring[0].feeds).toEqual([
      { kind: 'container', containerId: 'x', subPartInstanceId: null },
    ]);
    expect(validateEngines(part, REACTION_FIXTURES)).toEqual([]);
  });
});

describe('buildWizardPart — template geometry', () => {
  it('hosts the engine on an existing placement and creates no geometry', () => {
    const current = createEmptyPart();
    current.placements.push({
      instanceId: 'engine_1',
      subPartTemplateId: 'flexo_Existing_abc',
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    });
    const state = liquidState(current, {
      geometry: { kind: 'template', templateId: 'flexo_Existing_abc' },
    });
    const result = buildWizardPart(current, state, counter());

    expect(result.createdMeshIds).toEqual([]);
    expect(result.part.customMeshes).toEqual(current.customMeshes);
    expect(result.part.placements).toHaveLength(1);
    expect(result.part.connectors).toHaveLength(0);
    expect(result.part.colliders).toHaveLength(0);

    const spd = result.part.subPartGameData[0];
    expect(spd.subPartTemplateId).toBe('flexo_Existing_abc');
    expect(spd.nozzles[0].exhaustLocation).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.exhaustNozzleRef).not.toBeNull();
    expect(result.exhaustNozzleRef?.scope === 'subpart' && result.exhaustNozzleRef.instanceId).toBe(
      'engine_1',
    );
    // The tank has no generated body to sit inside, so it stays at the part origin.
    expect(result.part.gameData.tanks[0].locationAsmb).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('buildWizardPart — id collisions', () => {
  it('suffixes every id and keeps all four references in agreement', () => {
    const first = buildDefault();
    const state = liquidState(first.part, {
      feed: {
        kind: 'tank',
        feedId: 'fuel_second',
        shape: 'Cylindrical',
        lengthM: 2.5,
        outerRadiusM: 0.6,
        wallMaterialId: 'Aluminum.2014(s)',
      },
    });
    const second = buildWizardPart(first.part, state, counter('snd'));
    const { part } = second;

    const hostTemplateId =
      second.engineScope.kind === 'subpart' ? second.engineScope.templateId : '';
    const spd = part.subPartGameData.find((s) => s.subPartTemplateId === hostTemplateId)!;
    expect(spd.combustors[0].id).toBe('ThrustChamber2');
    expect(spd.nozzles[0].id).toBe('Nozzle2');
    expect(spd.rockets[0].id).toBe('Engine2');
    expect(spd.rockets[0].core.id).toBe('ThrustChamber2');
    expect(spd.rockets[0].nozzles[0].id).toBe('Nozzle2');

    const controller = part.gameData.rocketControllers[1];
    expect(controller.id).toBe('Engine2');
    expect(controller.rocketRefs[0].id).toBe('Engine2');

    const wiring = part.gameData.consumerFeedWiring[1];
    expect(wiring.consumerId).toBe('ThrustChamber2');
    expect(wiring.feeds).toEqual([
      { kind: 'container', containerId: 'fuel_second', subPartInstanceId: null },
    ]);

    expect(validateEngines(part, REACTION_FIXTURES)).toEqual([]);
  });
});

describe('validateWizardStep — liquid', () => {
  const part = createEmptyPart();
  const base = initLiquidState(part);

  it('passes every step of the default state', () => {
    for (const step of LIQUID_STEP_IDS) {
      expect(validateWizardStep(base, step, part, REACTION_FIXTURES), step).toEqual([]);
    }
  });

  it('bounds the chamber pressure', () => {
    const low = { ...base, chamberPressureBar: 0.5 };
    const high = { ...base, chamberPressureBar: 600 };
    expect(validateWizardStep(low, 'performance', part, REACTION_FIXTURES)).not.toEqual([]);
    expect(validateWizardStep(high, 'performance', part, REACTION_FIXTURES)).not.toEqual([]);
  });

  it('rejects generated dimensions outside (0, 50] m', () => {
    const bad = { ...base, gen: { ...base.gen, bellWidthM: 0 } };
    expect(validateWizardStep(bad, 'start', part, REACTION_FIXTURES)).not.toEqual([]);
    const huge = { ...base, gen: { ...base.gen, bodyLengthM: 51 } };
    expect(validateWizardStep(huge, 'start', part, REACTION_FIXTURES)).not.toEqual([]);
  });

  it('requires a non-blank, unique tank feed id', () => {
    const blank = liquidState(part, {
      feed: { ...base.feed, kind: 'tank', feedId: '  ' } as LiquidWizardState['feed'],
    });
    expect(validateWizardStep(blank, 'feed', part, REACTION_FIXTURES)).not.toEqual([]);

    const taken = createEmptyPart();
    taken.gameData.tanks.push({ ...createTank(), id: 'fuel_main' });
    expect(validateWizardStep(base, 'feed', taken, REACTION_FIXTURES)).not.toEqual([]);
  });

  it('requires the wizard attach node when the feed names it', () => {
    const state = liquidState(part, {
      feed: { kind: 'connector', connectorId: null },
      addAttachNode: false,
    });
    expect(validateWizardStep(state, 'feed', part, REACTION_FIXTURES)).not.toEqual([]);
  });

  it('grades the mixture ratio against the reaction kind', () => {
    const fixedWithRatio = liquidState(part, { reactionId: 'APCP', mixtureRatio: 2 });
    expect(validateWizardStep(fixedWithRatio, 'performance', part, REACTION_FIXTURES)).not.toEqual(
      [],
    );
    const mixtureWithoutRatio = liquidState(part, { mixtureRatio: null });
    expect(
      validateWizardStep(mixtureWithoutRatio, 'performance', part, REACTION_FIXTURES),
    ).not.toEqual([]);
    // A catalog that is still loading must never block.
    expect(validateWizardStep(fixedWithRatio, 'performance', part, undefined)).toEqual([]);
  });

  it('refuses part-level geometry for a liquid engine', () => {
    const state = liquidState(part, { geometry: { kind: 'part' } });
    expect(validateWizardStep(state, 'start', part, REACTION_FIXTURES)).not.toEqual([]);
  });
});

// ── SRB (Phase W5) ────────────────────────────────────────────────────────────

/** The default SRB state with `patch` merged over it. */
function srbState(part: EditingPart, patch: Partial<SrbWizardState>): SrbWizardState {
  return { ...initSrbState(part), ...patch };
}

/** The default SRB wizard run on a blank document. */
function buildSrb(patch: Partial<SrbWizardState> = {}): ReturnType<typeof buildWizardPart> {
  const part = createEmptyPart();
  return buildWizardPart(part, srbState(part, patch), counter('srb'));
}

describe('buildWizardPart — SRB', () => {
  it('builds a booster validateEngines has nothing to say about', () => {
    const { part } = buildSrb();
    expect(validateEngines(part, REACTION_FIXTURES)).toEqual([]);
  });

  it('hosts the motor on the CASING, not the nozzle block', () => {
    const result = buildSrb();
    const { part } = result;
    // srbGeometry's hostIndex is 1: box 0 is the cosmetic nozzle plug.
    const casingTemplateId = part.customMeshes[1].subPartId;
    expect(result.engineScope).toEqual({ kind: 'subpart', templateId: casingTemplateId });
    expect(result.detail).toBe(`srb · ${casingTemplateId}`);

    const spd = part.subPartGameData.find((s) => s.subPartTemplateId === casingTemplateId);
    expect(spd?.solidMotors).toHaveLength(1);
    expect(spd?.solidNozzles).toHaveLength(1);
    expect(spd?.rockets).toHaveLength(1);
    expect(spd?.combustors).toHaveLength(0);
    expect(part.subPartGameData).toHaveLength(1);

    expect(spd?.solidMotors[0].defaultPressurePa).toBe(4_500_000);
    expect(spd?.solidMotors[0].thermalEfficiency).toBeCloseTo(0.9, 10);
    expect(spd?.solidMotors[0].reactionId).toBe('DoubleBase');
    expect(spd?.solidMotors[0].grainGeometryId).toBe('BoostSustain');
    expect(spd?.solidNozzles[0].exitDiameterM).toBe(0.64);
    expect(spd?.solidNozzles[0].exhaustDirection).toEqual({ x: -1, y: 0, z: 0 });
    expect(result.focus).toEqual({ group: 'solidMotor', scope: 'sub', index: 0 });
    expect(result.exhaustNozzleRef?.kind).toBe('solid');
  });

  it('drives the motor with an ENGINE controller — a thruster controller throws in KSA', () => {
    const { part } = buildSrb();
    expect(part.gameData.rocketControllers).toHaveLength(1);
    expect(part.gameData.rocketControllers[0].kind).toBe('engine');
    expect(part.gameData.rocketControllers[0].id).toBe('SRB');
    expect(part.gameData.rocketControllers[0].rocketRefs[0].subPartInstanceId).toBe(
      part.placements[1].instanceId,
    );
  });

  it('tags the part Booster, not Engines, and fits a cylinder collider', () => {
    const { part } = buildSrb();
    expect(part.editorTags).toContain('Booster');
    expect(part.editorTags).not.toContain('Engines');
    expect(part.colliders).toHaveLength(1);
    expect(part.colliders[0].shape).toBe('Cylinder');
    // KSA's cylinder axis is local Y, so an X-axis case is turned −90° about Z.
    expect(part.colliders[0].rotation.z).toBeCloseTo(-Math.PI / 2, 10);
    expect(part.colliders[0].scale).toEqual({ x: 1, y: 2.6, z: 1 });
    // A booster carries no gimbal at this size.
    expect(part.gameData.gimbals).toHaveLength(0);
  });

  it('stacks N grain segments at the geometry centres and wires each as a motor feed', () => {
    const { part } = buildSrb({
      grain: { ...initSrbState(createEmptyPart()).grain, segmentCount: 3 },
    });
    const spd = part.subPartGameData[0];
    expect(spd.solidGrainSegments.map((g) => g.id)).toEqual(['Grain', 'Grain2', 'Grain3']);

    const expectedXs = srbGeometry(SRB_GEN_DEFAULTS, 3).grainCenterXs;
    expect(spd.solidGrainSegments.map((g) => g.locationAsmb.x)).toEqual(expectedXs);
    expect(spd.solidGrainSegments.map((g) => g.wallMaterialId)).toEqual([
      'Steel.300(s)',
      'Steel.300(s)',
      'Steel.300(s)',
    ]);
    expect(spd.solidMotors[0].feeds).toEqual([
      { kind: 'container', containerId: 'Grain', subPartInstanceId: null },
      { kind: 'container', containerId: 'Grain2', subPartInstanceId: null },
      { kind: 'container', containerId: 'Grain3', subPartInstanceId: null },
    ]);
    expect(validateEngines(part, REACTION_FIXTURES)).toEqual([]);
  });

  it('adds a SolidMotorCase connector plus its motor feed when asked', () => {
    const { part } = buildSrb({ acceptCaseSegmentsViaConnector: true });
    expect(part.connectors).toHaveLength(2);
    expect(part.connectors[0].capabilities).toEqual([]);
    expect(part.connectors[1].capabilities).toEqual(['SolidMotorCase']);
    expect(part.subPartGameData[0].solidMotors[0].feeds).toEqual([
      { kind: 'container', containerId: 'Grain', subPartInstanceId: null },
      { kind: 'connector', connectorId: part.connectors[1].id },
    ]);
    expect(validateEngines(part, REACTION_FIXTURES)).toEqual([]);
  });

  it('never mutates the part it was given', () => {
    const current = createEmptyPart();
    const before = structuredClone(current);
    buildWizardPart(current, initSrbState(current), counter('srb'));
    expect(current).toEqual(before);
  });
});

describe('validateWizardStep — SRB', () => {
  const part = createEmptyPart();
  const base = initSrbState(part);

  it('passes every step of the default state', () => {
    for (const step of stepsFor('srb')) {
      expect(validateWizardStep(base, step.id, part, REACTION_FIXTURES), step.id).toEqual([]);
    }
  });

  it('holds the default pressure inside the reaction stable band', () => {
    // APCP is 15…150 bar: 160 is above MaxStablePressure, 10 is at/below MinimumBurnPressure.
    const high = srbState(part, { reactionId: 'APCP', defaultPressureBar: 160 });
    const low = srbState(part, { reactionId: 'APCP', defaultPressureBar: 10 });
    const ok = srbState(part, { reactionId: 'APCP', defaultPressureBar: 70 });
    expect(validateWizardStep(high, 'srb-propellant', part, REACTION_FIXTURES)).not.toEqual([]);
    expect(validateWizardStep(low, 'srb-propellant', part, REACTION_FIXTURES)).not.toEqual([]);
    expect(validateWizardStep(ok, 'srb-propellant', part, REACTION_FIXTURES)).toEqual([]);
    // A catalog that is still loading must never block.
    expect(validateWizardStep(high, 'srb-propellant', part, undefined)).toEqual([]);
  });

  it('refuses a non-solid reaction and an unknown grain geometry', () => {
    const liquidFuel = srbState(part, { reactionId: 'Hydrolox' });
    expect(validateWizardStep(liquidFuel, 'srb-propellant', part, REACTION_FIXTURES)).not.toEqual(
      [],
    );
    const badGrain = srbState(part, { grainGeometryId: 'Doughnut' });
    expect(validateWizardStep(badGrain, 'srb-propellant', part, REACTION_FIXTURES)).not.toEqual([]);
  });

  it('bounds the grain segment count, dimensions and wall thickness', () => {
    const grade = (patch: Partial<SrbWizardState['grain']>) =>
      validateWizardStep(
        srbState(part, { grain: { ...base.grain, ...patch } }),
        'srb-grain',
        part,
        REACTION_FIXTURES,
      );
    expect(grade({ segmentCount: 0 })).not.toEqual([]);
    expect(grade({ segmentCount: 9 })).not.toEqual([]);
    expect(grade({ segmentCount: 2.5 })).not.toEqual([]);
    expect(grade({ outerRadiusM: 0 })).not.toEqual([]);
    expect(grade({ lengthM: 0 })).not.toEqual([]);
    expect(grade({ wallThicknessMm: 0 })).not.toEqual([]);
    // 0.5 m outer radius ⇒ a 500 mm wall leaves no propellant.
    expect(grade({ wallThicknessMm: 500 })).not.toEqual([]);
    expect(grade({ segmentCount: 4 })).toEqual([]);
  });

  it('refuses part-level geometry for a solid motor', () => {
    const state = srbState(part, { geometry: { kind: 'part' } });
    expect(validateWizardStep(state, 'start', part, REACTION_FIXTURES)).not.toEqual([]);
  });
});

describe('the built SRB serializes to the XML KSA expects', () => {
  const { part } = buildSrb();
  const remap = new Map<string, string>();
  const gameDataXml = serializeGameDataXml([{ part, remap }], 'FlexoTest');

  it('emits the motor with its pressure, grain shape and grain feed', () => {
    expect(gameDataXml).toContain('<SolidMotor');
    expect(gameDataXml).toContain('<DefaultPressure Bar="45"');
    expect(gameDataXml).toContain('<Grain Id="BoostSustain"');
    expect(gameDataXml).toContain('<FeedsFrom Container="Grain"');
  });

  it('emits the grain segment and an AreaRatio-free solid nozzle', () => {
    expect(gameDataXml).toContain('<SolidGrainSegment');
    expect(gameDataXml).toContain('<SolidMotorNozzle');
    // SolidMotorNozzleTemplate derives the throat from the exit area — there is no such field.
    const solidNozzle = gameDataXml.slice(gameDataXml.indexOf('<SolidMotorNozzle'));
    expect(solidNozzle.slice(0, solidNozzle.indexOf('</SolidMotorNozzle>'))).not.toContain(
      '<AreaRatio',
    );
    expect(gameDataXml).toContain('<RocketEngineController');
  });
});

// ── RCS (Phase W6) ────────────────────────────────────────────────────────────

/** The default RCS state with `patch` merged over it. */
function rcsState(part: EditingPart, patch: Partial<RcsWizardState>): RcsWizardState {
  return { ...initRcsState(part), ...patch };
}

/** The default RCS wizard run on a blank document. */
function buildRcs(patch: Partial<RcsWizardState> = {}): ReturnType<typeof buildWizardPart> {
  const part = createEmptyPart();
  return buildWizardPart(part, rcsState(part, patch), counter('rcs'));
}

describe('buildWizardPart — RCS', () => {
  it('builds a quad block validateEngines has nothing to say about', () => {
    const { part } = buildRcs();
    expect(validateEngines(part, REACTION_FIXTURES)).toEqual([]);
  });

  it('puts the quad nozzles exactly where rcsLayout does', () => {
    const result = buildRcs();
    const spd = result.part.subPartGameData[0];
    expect(spd.nozzles).toHaveLength(4);
    expect(spd.nozzles.map((n) => n.id)).toEqual(['Nozzle', 'Nozzle2', 'Nozzle3', 'Nozzle4']);
    expect(spd.nozzles.map((n) => n.exhaustLocation)).toEqual(
      rcsLayout('quad', 0.15).map((s) => s.location),
    );
    expect(spd.nozzles.map((n) => n.exhaustDirection)).toEqual(
      rcsLayout('quad', 0.15).map((s) => s.direction),
    );
    expect(spd.rockets[0].nozzles.map((n) => n.id)).toEqual([
      'Nozzle',
      'Nozzle2',
      'Nozzle3',
      'Nozzle4',
    ]);
    expect(result.part.editorTags).toEqual(['RCS']);
    expect(result.part.gameData.gimbals).toHaveLength(0);
    expect(result.part.colliders[0].shape).toBe('Box');
  });

  it('plumbs the chamber as Service and floors the minimum pulse at 1 ms', () => {
    const spd = buildRcs().part.subPartGameData[0];
    expect(spd.combustors[0].plumbing).toBe('Service');
    expect(spd.combustors[0].minimumThrottle).toBe(1);
    expect(spd.combustors[0].minimumPulseTimeS).toBeCloseTo(0.0054, 10);
    expect(spd.combustors[0].mixtureRatio).toBe(1.6);
    expect(spd.combustors[0].maxPressurePa).toBe(700_000);

    const floored = buildRcs({ minPulseMs: 0 }).part.subPartGameData[0];
    expect(floored.combustors[0].minimumPulseTimeS).toBe(0.001);
  });

  it('carries a manual control map onto the controller', () => {
    const { part } = buildRcs({ controlMapFlags: ['RollRight', 'PitchUp'] });
    expect(part.gameData.rocketControllers[0].kind).toBe('thruster');
    expect(part.gameData.rocketControllers[0].controlMapFlags).toEqual(['RollRight', 'PitchUp']);
  });

  it('hosts a part-level battery in PartGameData with no wiring entry at all', () => {
    const current = createEmptyPart();
    current.gameData.tanks.push({ ...createTank(), id: 'rcs_prop' });
    const state = rcsState(current, {
      geometry: { kind: 'part' },
      feed: { kind: 'container', containerId: 'rcs_prop', subPartInstanceId: null },
    });
    const result = buildWizardPart(current, state, counter('rcs'));
    const { part } = result;

    expect(part.subPartGameData).toHaveLength(0);
    expect(part.customMeshes).toHaveLength(0);
    expect(part.colliders).toHaveLength(0);
    expect(part.gameData.combustors).toHaveLength(1);
    expect(part.gameData.nozzles).toHaveLength(4);
    expect(part.gameData.rockets).toHaveLength(1);
    // The chamber names its own source — `{kind:'parent'}` never appears at part level.
    expect(part.gameData.combustors[0].feeds).toEqual([
      { kind: 'container', containerId: 'rcs_prop', subPartInstanceId: null },
    ]);
    expect(part.gameData.consumerFeedWiring).toEqual([]);
    // The controller is part-level in BOTH hosting modes.
    expect(part.gameData.rocketControllers).toHaveLength(1);
    expect(part.gameData.rocketControllers[0].rocketRefs[0].subPartInstanceId).toBeNull();

    expect(result.engineScope).toEqual({ kind: 'part' });
    expect(result.focus).toEqual({ group: 'combustor', scope: 'part', index: 0 });
    expect(result.exhaustNozzleRef).toEqual({
      scope: 'part',
      kind: 'delaval',
      index: 3,
      channel: 'physics',
    });
    expect(result.detail).toBe('rcs · part');
    expect(validateEngines(part, REACTION_FIXTURES)).toEqual([]);
  });

  it('never mutates the part it was given', () => {
    const current = createEmptyPart();
    const before = structuredClone(current);
    buildWizardPart(current, initRcsState(current), counter('rcs'));
    expect(current).toEqual(before);
  });
});

describe('validateWizardStep — RCS', () => {
  const part = createEmptyPart();
  const base = initRcsState(part);

  it('passes every step of the default state', () => {
    for (const step of stepsFor('rcs')) {
      expect(validateWizardStep(base, step.id, part, REACTION_FIXTURES), step.id).toEqual([]);
    }
  });

  it('accepts part-level geometry, unlike a liquid engine', () => {
    const state = rcsState(part, { geometry: { kind: 'part' } });
    expect(validateWizardStep(state, 'start', part, REACTION_FIXTURES)).toEqual([]);
  });

  it('rejects a non-unit nozzle direction and names the row', () => {
    const state = rcsState(part, {
      layout: {
        preset: 'custom',
        nozzles: [{ location: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 1, z: 0 } }],
      },
    });
    const findings = validateWizardStep(state, 'rcs-layout', part, REACTION_FIXTURES);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Nozzle 1');
  });

  it('bounds the nozzle count', () => {
    const spec = { location: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    const none = rcsState(part, { layout: { preset: 'custom', nozzles: [] } });
    expect(validateWizardStep(none, 'rcs-layout', part, REACTION_FIXTURES)).not.toEqual([]);
    const tooMany = rcsState(part, {
      layout: { preset: 'custom', nozzles: Array.from({ length: 13 }, () => spec) },
    });
    expect(validateWizardStep(tooMany, 'rcs-layout', part, REACTION_FIXTURES)).not.toEqual([]);
  });

  it('grades the propellant bounds and the mixture-ratio rule', () => {
    expect(
      validateWizardStep(
        rcsState(part, { minPulseMs: -1 }),
        'rcs-propellant',
        part,
        REACTION_FIXTURES,
      ),
    ).not.toEqual([]);
    expect(
      validateWizardStep(
        rcsState(part, { areaRatio: 400 }),
        'rcs-propellant',
        part,
        REACTION_FIXTURES,
      ),
    ).not.toEqual([]);
    expect(
      validateWizardStep(
        rcsState(part, { mixtureRatio: null }),
        'rcs-propellant',
        part,
        REACTION_FIXTURES,
      ),
    ).not.toEqual([]);
  });

  it('blocks a feed through an attach node that will not exist', () => {
    const noNode = rcsState(part, { addAttachNode: false });
    expect(validateWizardStep(noNode, 'feed', part, REACTION_FIXTURES)).not.toEqual([]);
    const partLevel = rcsState(part, { geometry: { kind: 'part' } });
    expect(validateWizardStep(partLevel, 'feed', part, REACTION_FIXTURES)).not.toEqual([]);
  });
});

describe('the built RCS block serializes to the XML KSA expects', () => {
  const { part } = buildRcs();
  const remap = new Map<string, string>();
  const gameDataXml = serializeGameDataXml([{ part, remap }], 'FlexoTest');

  it('emits a Service chamber with a minimum pulse time', () => {
    expect(gameDataXml).toContain('<Plumbing>Service');
    expect(gameDataXml).toContain('<MinimumPulseTime');
    expect(gameDataXml).toContain('<Reaction Id="MMH_NTO"');
  });

  it('emits four nozzles under a thruster controller, with the RCS plume and sound', () => {
    expect(gameDataXml).toContain('<RocketThrusterController');
    expect(gameDataXml.match(/<DeLavalNozzle/g)).toHaveLength(4);
    expect(gameDataXml).toContain('<VolumetricExhaust Id="RCS"');
    expect(gameDataXml).toContain('DefaultRcsThruster');
  });
});

describe('the built part serializes to the XML KSA expects', () => {
  const { part } = buildDefault();
  const remap = new Map<string, string>();
  const partsXml = serializePartsXml([{ part, remap }]);
  const gameDataXml = serializeGameDataXml([{ part, remap }], 'FlexoTest');

  it('declares the gimbal in BOTH documents', () => {
    expect(partsXml).toContain('<Gimbal');
    expect(gameDataXml).toContain('<Gimbal');
  });

  it('emits the combustor chemistry and chamber numbers', () => {
    expect(gameDataXml).toContain('<Reaction Id="Hydrolox"');
    expect(gameDataXml).toContain('<MixtureRatio');
    expect(gameDataXml).toContain('<MaxPressure Bar="75"');
    expect(gameDataXml).toContain('<MinimumThrottle Value="0.4"');
  });

  it('wires the chamber to the tank', () => {
    expect(gameDataXml).toContain('<ConsumerFeedWiring Id="ThrustChamber"');
    expect(gameDataXml).toContain('<FeedsFrom Container="fuel_main"');
  });

  it('emits the plume, the mass override and the collider', () => {
    expect(gameDataXml).toContain('<ReactionPlume');
    expect(gameDataXml).toContain('<VolumetricExhaust Id="EngineAMed"');
    expect(gameDataXml).toContain('<CustomMass');
    expect(gameDataXml).toContain('<Collider');
  });
});
