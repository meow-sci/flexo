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
import { buildWizardPart, initLiquidState, stepsFor, validateWizardStep } from './wizardModel';
import type { LiquidWizardState, WizardStepId } from './wizardModel';

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

  it('throws for the families that are not implemented yet', () => {
    const srb = { ...base, family: 'srb' } as unknown as LiquidWizardState;
    expect(() => validateWizardStep(srb, 'start' as WizardStepId, part, undefined)).toThrow(
      /not implemented/,
    );
    expect(() => buildWizardPart(part, srb, counter())).toThrow(/not implemented/);
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
