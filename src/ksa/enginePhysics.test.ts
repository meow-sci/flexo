import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import {
  areaRatioFromMach,
  areaRatioFromPressure,
  characteristicVelocity,
  criticalPressureRatio,
  deriveAreaRatioForExhaustPressure,
  exhaustVelocity,
  G0,
  inverseNozzlePressureRatioFromMach,
  lutLookup,
  predictPerformance,
  sliceLutAtMixtureRatio,
  solveMachFromAreaRatio,
  UNIVERSAL_GAS_CONSTANT,
  type CombustionLut,
  type MixtureLut,
} from './enginePhysics';
import { parseReactionsFile, resolveReactionLut, type ReactionData } from './reactionCatalog';
import { hasKsaAssets, ksaAsset } from './ksaTestAssets';

/** A flat single-row LUT (constant γ/R/T at any pressure) for closed-form checks. */
function flatLut(gamma: number, R: number, T: number, pressure = 5_000_000): CombustionLut {
  return {
    rows: [
      { lnPressure: Math.log(pressure), pressure, temperature: T, gamma, specificGasConstant: R },
    ],
  };
}

describe('enginePhysics: closed-form identities', () => {
  it('area ratio at the throat (Mach 1) is exactly 1 for any γ', () => {
    for (const g of [1.1, 1.2, 1.4, 1.667]) {
      expect(areaRatioFromMach(1, g)).toBeCloseTo(1, 10);
    }
  });

  it('critical pressure ratio matches the closed form (2/(γ+1))^(γ/(γ−1))', () => {
    const g = 1.2;
    expect(criticalPressureRatio(g)).toBeCloseTo(Math.pow(2 / 2.2, 1.2 / 0.2), 12);
  });

  it('the Mach⇄area-ratio solver round-trips', () => {
    const g = 1.22;
    for (const ar of [2, 10, 25, 49, 120]) {
      const m = solveMachFromAreaRatio(g, ar);
      expect(m).toBeGreaterThan(1);
      expect(areaRatioFromMach(m, g)).toBeCloseTo(ar, 3);
    }
  });

  it('area-ratio-from-pressure agrees with area-ratio-from-Mach at the same exit Mach', () => {
    // Two independent closed forms must produce the same expansion ratio.
    const g = 1.2;
    for (const m of [1.5, 2.5, 4, 6]) {
      const pCoef = inverseNozzlePressureRatioFromMach(m, g); // = P_exit / P_stagnation
      const arFromP = areaRatioFromPressure(pCoef, 1, g); // stagnation pressure 1 ⇒ P_exit = pCoef
      expect(arFromP).toBeCloseTo(areaRatioFromMach(m, g), 4);
    }
  });

  it('exhaust velocity hits 0 at no expansion and the thermodynamic max at full expansion', () => {
    const g = 1.2;
    const R = 400;
    const stag = { pressure: 5_000_000, temperature: 3000 };
    // No expansion (P_exit = P_stagnation) ⇒ no kinetic energy extracted.
    expect(exhaustVelocity(g, R, stag, stag.pressure)).toBeCloseTo(0, 6);
    // Full expansion to a perfect vacuum (P_exit = 0) ⇒ √(2γ/(γ−1)·R·T).
    const vMax = Math.sqrt(((2 * g) / (g - 1)) * R * stag.temperature);
    expect(exhaustVelocity(g, R, stag, 0)).toBeCloseTo(vMax, 6);
    // A small but non-zero exit pressure stays just below the theoretical max.
    expect(exhaustVelocity(g, R, stag, 1)).toBeLessThan(vMax);
  });
});

describe('enginePhysics: combustion LUT lookup', () => {
  const lut: CombustionLut = {
    rows: [
      {
        lnPressure: Math.log(1e5),
        pressure: 1e5,
        temperature: 2000,
        gamma: 1.25,
        specificGasConstant: 350,
      },
      {
        lnPressure: Math.log(1e6),
        pressure: 1e6,
        temperature: 3000,
        gamma: 1.15,
        specificGasConstant: 450,
      },
      {
        lnPressure: Math.log(1e7),
        pressure: 1e7,
        temperature: 4000,
        gamma: 1.1,
        specificGasConstant: 500,
      },
    ],
  };

  it('interpolates linearly in ln(pressure) within a non-top interval', () => {
    // Geometric mean of rows 0,1 ⇒ exactly halfway in ln space ⇒ midpoint of each property.
    const mid = Math.sqrt(1e5 * 1e6);
    const { props, conditions } = lutLookup(lut, mid);
    expect(conditions.temperature).toBeCloseTo(2500, 6);
    expect(props.gamma).toBeCloseTo(1.2, 6);
    expect(props.specificGasConstant).toBeCloseTo(400, 6);
    expect(conditions.pressure).toBeCloseTo(mid, 3); // queried pressure is preserved
  });

  it('clamps below the lowest and above the highest tabulated pressure', () => {
    expect(lutLookup(lut, 1e3).props.gamma).toBeCloseTo(1.25, 6); // floor row
    expect(lutLookup(lut, 1e9).props.gamma).toBeCloseTo(1.1, 6); // ceiling row
    // Non-positive pressure falls back to the floor row without throwing.
    expect(lutLookup(lut, 0).conditions.temperature).toBeCloseTo(2000, 6);
  });

  it('reproduces the KSA quirk: the TOP interval clamps to the ceiling row (no interpolation)', () => {
    // CombustionTable.Lookup's `idx <= -NumPoints` branch fires for the highest
    // interval, so a pressure between the last two rows returns the ceiling row's
    // gas properties (it keeps the queried pressure). Faithful to the game; only
    // affects pressures near the very top of the table, far above any real engine.
    const inTopInterval = Math.sqrt(1e6 * 1e7);
    const { props, conditions } = lutLookup(lut, inTopInterval);
    expect(props.gamma).toBeCloseTo(1.1, 6); // ceiling row, NOT the 1.125 midpoint
    expect(conditions.temperature).toBeCloseTo(4000, 6);
  });
});

describe('enginePhysics: predictPerformance (synthetic gas)', () => {
  const lut = flatLut(1.2, 400, 3000);
  const perf = predictPerformance({
    lut,
    maxPressurePa: 5_000_000,
    exitDiameterM: 1,
    areaRatio: 25,
    thermalEfficiency: 1,
    flowEfficiency: 1,
    expansionEfficiency: 1,
  });

  it('passes the chamber gas state straight through at full throttle, efficiency 1', () => {
    expect(perf.chamberPressurePa).toBeCloseTo(5_000_000, 0);
    expect(perf.chamberTemperatureK).toBeCloseTo(3000, 6);
    expect(perf.exitPressurePa).toBeCloseTo(5_000_000, 0); // isochoric ×1
    expect(perf.gamma).toBeCloseTo(1.2, 6);
    expect(perf.molarMassGPerMol).toBeCloseTo((UNIVERSAL_GAS_CONSTANT / 400) * 1000, 6);
  });

  it('matches the independently computed choked mass flow ṁ = P·A_throat/c*', () => {
    const exitArea = Math.PI * 0.25;
    const throatArea = exitArea / 25;
    const cStar = characteristicVelocity(1.2, 400, 3000);
    const expected = (5_000_000 * throatArea) / cStar;
    expect(perf.massFlowRate).toBeCloseTo(expected, 3);
  });

  it('produces more thrust and Isp in vacuum than at sea level', () => {
    expect(perf.thrustSLN).toBeGreaterThan(0);
    expect(perf.thrustVacN).toBeGreaterThan(perf.thrustSLN);
    expect(perf.ispVac).toBeGreaterThan(perf.ispSL);
    // Isp ties thrust to mass flow: Isp = thrust / (ṁ·g₀).
    expect(perf.ispVac).toBeCloseTo(perf.thrustVacN / (perf.massFlowRate * G0), 4);
  });

  it('reports zeroed performance for degenerate inputs (no NaNs leak to the UI)', () => {
    const zero = predictPerformance({
      lut,
      maxPressurePa: 0,
      exitDiameterM: 1,
      areaRatio: 25,
      thermalEfficiency: 1,
      flowEfficiency: 1,
      expansionEfficiency: 1,
    });
    expect(zero.thrustVacN).toBe(0);
    expect(zero.ispVac).toBe(0);
    const nan = predictPerformance({
      lut,
      maxPressurePa: 5e6,
      exitDiameterM: 1,
      areaRatio: Number.NaN, // KSA's AreaRatio default — must not crash
      thermalEfficiency: 1,
      flowEfficiency: 1,
      expansionEfficiency: 1,
    });
    expect(Number.isFinite(nan.thrustVacN)).toBe(true);
    expect(nan.thrustVacN).toBe(0);
  });
});

describe('enginePhysics: sliceLutAtMixtureRatio (MixtureReactionTable.SliceAt port)', () => {
  const mix: MixtureLut = {
    ratios: [2, 4],
    slices: [
      flatLut(1.2, 400, 2000), // γ 1.2, R 400, T 2000 at ratio 2
      flatLut(1.3, 500, 3000), // γ 1.3, R 500, T 3000 at ratio 4
    ],
  };

  it('lerps temperature, gamma, and R between the neighbouring ratio rows', () => {
    const mid = sliceLutAtMixtureRatio(mix, 3);
    expect(mid.rows[0].temperature).toBeCloseTo(2500, 9);
    expect(mid.rows[0].gamma).toBeCloseTo(1.25, 9);
    expect(mid.rows[0].specificGasConstant).toBeCloseTo(450, 9);
    // The shared lnPressure axis is preserved untouched.
    expect(mid.rows[0].lnPressure).toBe(mix.slices[0].rows[0].lnPressure);
  });

  it('returns exact rows on an exact ratio hit and clamps out-of-range ratios', () => {
    expect(sliceLutAtMixtureRatio(mix, 2).rows[0].temperature).toBe(2000);
    expect(sliceLutAtMixtureRatio(mix, 0.5).rows[0].temperature).toBe(2000); // below → first row
    expect(sliceLutAtMixtureRatio(mix, 99).rows[0].temperature).toBe(3000); // above → last row
  });
});

// Real KSA reaction data: skipped in the open-source build (private assets absent).
describe('enginePhysics: real Hydrolox parity', () => {
  function loadReactions(): ReactionData[] {
    const text = readFileSync(ksaAsset('Reactions.xml'), 'utf-8');
    const doc = new DOMParser().parseFromString(text, 'application/xml') as unknown as Document;
    const out: ReactionData[] = [];
    parseReactionsFile(doc, out);
    return out;
  }

  /** Hydrolox baked at Core's 5.5:1 O/F — the LUT the game's own combustor resolves. */
  function hydroloxLutAt55(): CombustionLut {
    const hydrolox = loadReactions().find((p) => p.id === 'Hydrolox')!;
    expect(hydrolox.kind).toBe('Mixture');
    return resolveReactionLut(hydrolox, 5.5)!;
  }

  it.runIf(hasKsaAssets)('parses Hydrolox as a fuel+oxidizer mixture reaction', () => {
    const hydrolox = loadReactions().find((p) => p.id === 'Hydrolox')!;
    expect(hydrolox).toBeTruthy();
    expect(hydrolox.reactants).toHaveLength(2);
    expect(hydrolox.reactants.map((r) => r.phaseId)).toEqual(['H2(l)', 'O2(l)']);
    const lut = hydroloxLutAt55();
    expect(lut.rows.length).toBeGreaterThan(10);
  });

  it.runIf(hasKsaAssets)('predicts physically sane LR91-Vac Hydrolox performance', () => {
    // The real LR91 Vac thrust chamber: 49 bar, 2.5 m exit, area ratio 49, efficiency 1.
    const perf = predictPerformance({
      lut: hydroloxLutAt55(),
      maxPressurePa: 49 * 1e5,
      exitDiameterM: 2.5,
      areaRatio: 49,
      thermalEfficiency: 1,
      flowEfficiency: 1,
      expansionEfficiency: 1,
    });
    expect(perf.thrustVacN).toBeGreaterThan(perf.thrustSLN);
    expect(perf.thrustVacN).toBeGreaterThan(0);
    expect(perf.ispVac).toBeGreaterThan(perf.ispSL);
    // Regression snapshot of the faithful port (tolerant of float32-vs-double drift):
    // vacuum Isp ≈ 445.4 s and ≈ 933 kN thrust — textbook LH2/LOX figures under the
    // 2026.7.5 ThermoToolkit-regenerated Hydrolox LUT (sliced at Core's 5.5 O/F), and a
    // heavily over-expanded sea-level nozzle (the AR49 vacuum bell separates at SL).
    expect(perf.ispVac).toBeCloseTo(445.4, 0);
    expect(perf.thrustVacN / 1000).toBeCloseTo(932.6, 0);
    expect(perf.ispSL).toBeCloseTo(341, 0);
    expect(perf.flowSeparationSeveritySL).toBeGreaterThan(0.5);
    expect(perf.gamma).toBeGreaterThan(1.1);
    expect(perf.gamma).toBeLessThan(1.3);
    expect(perf.molarMassGPerMol).toBeGreaterThan(10);
    expect(perf.molarMassGPerMol).toBeLessThan(20);
    expect(perf.massFlowRate).toBeGreaterThan(0);
    expect(perf.throatDiameterM).toBeGreaterThan(0);
    expect(perf.throatDiameterM).toBeLessThan(2.5);
  });

  it.runIf(hasKsaAssets)('derives a sea-level area ratio below the vacuum one', () => {
    const arSeaLevel = deriveAreaRatioForExhaustPressure(
      hydroloxLutAt55(),
      49 * 1e5,
      101325,
      1,
      1,
      1,
    )!;
    expect(arSeaLevel).toBeGreaterThan(1);
    expect(arSeaLevel).toBeLessThan(49); // optimizing for SL needs less expansion than vacuum
  });
});
