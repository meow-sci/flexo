import { describe, it, expect } from 'vitest';
import { computePerformance, rocketsInScope } from './performanceAggregation';
import type { ReactionData } from '../../ksa/reactionCatalog';
import {
  createCombustor,
  createEmptyPart,
  createNozzle,
  createRocket,
  createSolidGrainSegment,
  createSolidMotor,
  createSolidMotorNozzle,
  createSubPartGameData,
  DEFAULT_LAYER_ID,
  identityTransform,
} from '../../ksa/types';
import type { EditingPart } from '../../ksa/types';
import { FIRST_PAIR_ROCKET, type EngineEntry } from '../../state/engineStore';

/**
 * Hydrolox as `Reactions.xml` ships it, cut down to the two LUT rows the anchor case needs.
 * `enginePhysics.test.ts` asserts Hydrolox @ 5.5 ≈ 445.4 s Isp_vac against the full table;
 * this file only has to prove the AGGREGATION, so it asserts pairs against each other.
 */
const HYDROLOX: ReactionData = {
  kind: 'Mixture',
  id: 'Hydrolox',
  name: 'Hydrogen + Oxygen',
  category: 'Bipropellant',
  reactants: [],
  defaultMixtureRatio: 5.5,
  mixtureLut: {
    ratios: [5.5],
    slices: [
      {
        rows: [
          {
            lnPressure: Math.log(1e5),
            pressure: 1e5,
            temperature: 3200,
            gamma: 1.19,
            specificGasConstant: 693,
          },
          {
            lnPressure: Math.log(2e7),
            pressure: 2e7,
            temperature: 3600,
            gamma: 1.14,
            specificGasConstant: 660,
          },
        ],
      },
    ],
  },
};

const REACTIONS: ReadonlyMap<string, ReactionData> = new Map([['Hydrolox', HYDROLOX]]);

const TMPL = 'Core.Subpart.Chamber';
const SUB: EngineEntry = { kind: 'subpart', templateId: TMPL };

function placement(instanceId: string) {
  return {
    instanceId,
    subPartTemplateId: TMPL,
    ...identityTransform(),
    layerId: DEFAULT_LAYER_ID,
  };
}

/** A SubPart engine placed `placements` times, with `nozzles` nozzles on one rocket. */
function enginePart(placements = 1, nozzleIds = ['Nozzle']): EditingPart {
  const part = createEmptyPart();
  for (let i = 0; i < placements; i++) part.placements.push(placement(`chamber_${i + 1}`));
  const spd = createSubPartGameData(TMPL);
  spd.combustors.push({ ...createCombustor('ThrustChamber'), mixtureRatio: 5.5 });
  for (const id of nozzleIds) spd.nozzles.push(createNozzle(id));
  spd.rockets.push(createRocket('Engine', 'ThrustChamber', nozzleIds));
  part.subPartGameData.push(spd);
  return part;
}

const ok = (part: EditingPart, selection: string, entry: EngineEntry | null = SUB) => {
  const result = computePerformance(part, entry, selection, REACTIONS);
  expect(result.kind).toBe('ok');
  return result as Extract<typeof result, { kind: 'ok' }>;
};

describe('computePerformance — the first-pair fallback (v1 parity)', () => {
  it('matches the single-pair rocket exactly, un-multiplied', () => {
    const part = enginePart();
    const first = ok(part, FIRST_PAIR_ROCKET);
    const rocket = ok(part, 'Engine');
    expect(first.thrustVacN).toBeCloseTo(rocket.thrustVacN, 6);
    expect(first.ispVac).toBeCloseTo(rocket.ispVac, 6);
    expect(first.pairs).toHaveLength(1);
    expect(first.pairs[0].instanceCount).toBe(1);
  });

  it('stays per-thruster even when the template is placed many times', () => {
    // The legacy readout never multiplied — a returning user's numbers must not change.
    const single = ok(enginePart(1), FIRST_PAIR_ROCKET);
    const quad = ok(enginePart(4), FIRST_PAIR_ROCKET);
    expect(quad.thrustVacN).toBeCloseTo(single.thrustVacN, 6);
  });
});

describe('computePerformance — per-rocket aggregation (D6)', () => {
  it('sums thrust over two identical chambers and keeps Isp unchanged', () => {
    const one = ok(enginePart(1, ['Nozzle']), 'Engine');
    const two = ok(enginePart(1, ['NozzleA', 'NozzleB']), 'Engine');
    expect(two.pairs).toHaveLength(2);
    expect(two.thrustVacN).toBeCloseTo(one.thrustVacN * 2, 6);
    expect(two.massFlowRate).toBeCloseTo(one.massFlowRate * 2, 6);
    // Isp is ΣF/(g0·Σṁ) — twice the engine is not twice as efficient.
    expect(two.ispVac).toBeCloseTo(one.ispVac, 6);
    expect(two.ispSL).toBeCloseTo(one.ispSL, 6);
  });

  it('multiplies a SubPart nozzle by its placement count — one nozzle = N thrusters', () => {
    const one = ok(enginePart(1), 'Engine');
    const three = ok(enginePart(3), 'Engine');
    expect(three.pairs[0].instanceCount).toBe(3);
    expect(three.thrustVacN).toBeCloseTo(one.thrustVacN * 3, 6);
    expect(three.thrustSLN).toBeCloseTo(one.thrustSLN * 3, 6);
    expect(three.ispVac).toBeCloseTo(one.ispVac, 6);
  });

  it('keeps per-pair numbers per-thruster so the disclosure can show them', () => {
    const three = ok(enginePart(3), 'Engine');
    const one = ok(enginePart(1), 'Engine');
    expect(three.pairs[0].performance.thrustVacN).toBeCloseTo(
      one.pairs[0].performance.thrustVacN,
      6,
    );
  });

  it('reports the throat diameter of the first pair, not a sum', () => {
    const two = ok(enginePart(1, ['NozzleA', 'NozzleB']), 'Engine');
    const one = ok(enginePart(1, ['NozzleA']), 'Engine');
    expect(two.throatDiameterM).toBeCloseTo(one.throatDiameterM, 9);
  });

  it('lists the scope’s rockets in document order', () => {
    const part = enginePart();
    part.subPartGameData[0].rockets.push(createRocket('Second', 'ThrustChamber', ['Nozzle']));
    expect(rocketsInScope(part, SUB).map((r) => r.id)).toEqual(['Engine', 'Second']);
    expect(rocketsInScope(part, { kind: 'part' })).toEqual([]);
    expect(rocketsInScope(part, null)).toEqual([]);
  });
});

describe('computePerformance — degradation states', () => {
  it('reports a missing catalog rather than zeros', () => {
    const result = computePerformance(enginePart(), SUB, 'Engine', new Map());
    expect(result).toEqual({ kind: 'no-catalog', reactionId: 'Hydrolox' });
  });

  it('reports a mixture reaction with no O/F ratio', () => {
    const part = enginePart();
    part.subPartGameData[0].combustors[0].mixtureRatio = null;
    expect(computePerformance(part, SUB, 'Engine', REACTIONS)).toEqual({
      kind: 'no-ratio',
      reactionName: 'Hydrogen + Oxygen',
    });
  });

  it('hands a solid rocket to the thrust-curve card', () => {
    const part = createEmptyPart();
    part.placements.push(placement('booster_1'));
    const spd = createSubPartGameData(TMPL);
    spd.solidMotors.push(createSolidMotor('MotorCore'));
    spd.solidGrainSegments.push(createSolidGrainSegment('Grain'));
    spd.solidNozzles.push(createSolidMotorNozzle('Nozzle'));
    spd.rockets.push(createRocket('SRB', 'MotorCore', ['Nozzle']));
    part.subPartGameData.push(spd);
    expect(computePerformance(part, SUB, 'SRB', REACTIONS)).toEqual({ kind: 'solid' });
  });

  it('reports no modules for an empty scope, an unknown rocket and no scope at all', () => {
    expect(computePerformance(createEmptyPart(), SUB, FIRST_PAIR_ROCKET, REACTIONS)).toEqual({
      kind: 'no-modules',
    });
    expect(computePerformance(enginePart(), SUB, 'Nope', REACTIONS)).toEqual({
      kind: 'no-modules',
    });
    expect(computePerformance(enginePart(), null, 'Engine', REACTIONS)).toEqual({
      kind: 'no-modules',
    });
  });
});
