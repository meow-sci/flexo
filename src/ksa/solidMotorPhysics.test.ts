import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import {
  evaluateBurnRate,
  grainLookup,
  sampleThrustCurve,
  twoPhaseEfficiency,
  type SolidMotorInput,
} from './solidMotorPhysics';
import {
  grainInitialArea,
  grainMaxDepth,
  parseGrainGeometriesFile,
  parseSolidPropellantsFile,
  substanceIdOfPhase,
  type GrainGeometryTable,
} from './grainGeometryCatalog';
import { UNIVERSAL_GAS_CONSTANT, type CombustionLut } from './enginePhysics';

/**
 * A three-row APCP-like gas table. Real `Reactions.xml` rows are ~24 wide, but the LUT is
 * only ever read through `lutLookup`'s ln-P interpolation, so three rows exercise the same
 * path — and keeping the numbers here means the test needs no licensed asset tree.
 */
function apcpLut(): CombustionLut {
  const rows = [
    { pressure: 2e4, temperature: 2800 },
    { pressure: 7e6, temperature: 3004 },
    { pressure: 4e7, temperature: 3100 },
  ];
  return {
    rows: rows.map((r) => ({
      lnPressure: Math.log(r.pressure),
      pressure: r.pressure,
      temperature: r.temperature,
      gamma: 1.2387586499949759,
      specificGasConstant: UNIVERSAL_GAS_CONSTANT / (22.999621013751863 * 0.001),
    })),
  };
}

/**
 * A synthetic grain profile with the given normalized perimeter curve. Depth and port area
 * must be STRICTLY increasing (the game's own load rule); port area is integrated from the
 * perimeter so the geometry is self-consistent.
 */
function grain(id: string, perimeters: number[], maxDepth = 0.6): GrainGeometryTable {
  const n = perimeters.length;
  const depth: number[] = [];
  const portArea: number[] = [];
  let area = 0.38;
  for (let i = 0; i < n; i++) {
    const d = (maxDepth * i) / (n - 1);
    depth.push(d);
    if (i > 0) area += perimeters[i - 1] * (d - depth[i - 1]);
    portArea.push(area);
  }
  return { id, name: id, shape: '', description: '', depth, perimeter: [...perimeters], portArea };
}

const NEUTRAL = grain('Neutral', [2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2]);
const PROGRESSIVE = grain('Progressive', [1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0]);
const REGRESSIVE = grain('Regressive', [4.0, 3.6, 3.2, 2.8, 2.4, 2.0, 1.6, 1.2]);

/** A one-segment APCP motor with a single 0.5 m nozzle — Core's SRB proportions. */
function motorWith(
  geometry: GrainGeometryTable,
  overrides: Partial<SolidMotorInput> = {},
): SolidMotorInput {
  return {
    lut: apcpLut(),
    thermalEfficiency: 0.95,
    authoredChamberPressurePa: 7_000_000,
    burnRate: { coefficientMPerS: 0.0045, exponent: 0.35 },
    minimumBurnPressurePa: 1_500_000,
    maxStablePressurePa: 15_000_000,
    exhaustCondensedFraction: 0.33696528908145584,
    storageDensityKgPerM3: 1780,
    segments: [{ outerRadiusM: 0.6, wallThicknessMm: 6, lengthM: 4, geometry }],
    nozzles: [{ exitDiameterM: 0.5, flowEfficiency: 0.95, expansionEfficiency: 0.98 }],
    ...overrides,
  };
}

describe('grainLookup — GrainGeometryTable.Lookup', () => {
  it('interpolates between depth conditions', () => {
    const table = grain('T', [1, 3], 1);
    expect(grainLookup(table, 0).perimeter).toBeCloseTo(1, 10);
    expect(grainLookup(table, 1).perimeter).toBeCloseTo(3, 10);
    expect(grainLookup(table, 0.5).perimeter).toBeCloseTo(2, 10);
  });

  it('clamps at both ends rather than extrapolating', () => {
    const table = grain('T', [1, 3], 1);
    expect(grainLookup(table, -5).perimeter).toBeCloseTo(1, 10);
    expect(grainLookup(table, 99).perimeter).toBeCloseTo(3, 10);
  });

  it('exposes MaxDepth and InitialGrainArea as KSA computes them', () => {
    expect(grainMaxDepth(NEUTRAL)).toBeCloseTo(0.6, 10);
    expect(grainInitialArea(NEUTRAL)).toBeCloseTo(Math.PI - 0.38, 10);
  });
});

describe('BurnRateLaw.Evaluate + the two-phase efficiency', () => {
  it('evaluates Vieille’s law in MPa', () => {
    // a·(p·1e-6)^n at 1 MPa is exactly a.
    expect(evaluateBurnRate({ coefficientMPerS: 0.0045, exponent: 0.35 }, 1e6)).toBeCloseTo(
      0.0045,
      12,
    );
    expect(evaluateBurnRate({ coefficientMPerS: 0.0045, exponent: 0.35 }, 7e6)).toBeCloseTo(
      0.0045 * Math.pow(7, 0.35),
      12,
    );
  });

  it('costs exhaust velocity in proportion to condensed fraction and ln(area ratio)', () => {
    expect(twoPhaseEfficiency(0, 12)).toBe(1);
    const eta = twoPhaseEfficiency(0.337, 12);
    expect(eta).toBeCloseTo(1 - 0.337 * (0.076 + 0.046 * Math.log(12)), 12);
    expect(eta).toBeLessThan(1);
    // Clamped at 0.5 no matter how punishing the inputs get.
    expect(twoPhaseEfficiency(0.99, 1e9)).toBe(0.5);
  });
});

describe('sampleThrustCurve — SolidMotor.TrySampleThrustCurve', () => {
  it('produces a burning motor with a monotonic time base', () => {
    const curve = sampleThrustCurve(motorWith(NEUTRAL), 64);
    expect(curve).not.toBeNull();
    const c = curve!;
    expect(c.burnSeconds).toBeGreaterThan(0);
    expect(c.peakThrustN).toBeGreaterThan(0);
    expect(c.times).toHaveLength(64);
    expect(c.thrustN).toHaveLength(64);
    for (let i = 1; i < c.times.length; i++)
      expect(c.times[i]).toBeGreaterThanOrEqual(c.times[i - 1]);
    expect(c.times[c.times.length - 1]).toBeCloseTo(c.burnSeconds, 3);
    expect(c.vacuumIspS).toBeGreaterThan(100);
    expect(c.unburnableGrainKg).toBeGreaterThanOrEqual(0);
  });

  it('holds thrust roughly flat on a neutral grain', () => {
    const c = sampleThrustCurve(motorWith(NEUTRAL), 64)!;
    expect(c.ignitionThrustN).toBeGreaterThan(0.9 * c.peakThrustN);
  });

  it('peaks later on a Progressive grain than on a Regressive one', () => {
    const argMax = (a: Float32Array) => a.reduce((best, v, i) => (v > a[best] ? i : best), 0);
    const progressive = sampleThrustCurve(motorWith(PROGRESSIVE), 64)!;
    const regressive = sampleThrustCurve(motorWith(REGRESSIVE), 64)!;
    expect(argMax(progressive.thrustN)).toBeGreaterThan(argMax(regressive.thrustN));
    // And the shape reads the way the names promise.
    expect(progressive.ignitionThrustN).toBeLessThan(progressive.peakThrustN * 0.9);
    expect(regressive.ignitionThrustN).toBeCloseTo(regressive.peakThrustN, 0);
  });

  it('sizes the throat itself rather than taking the template seed', () => {
    // `SolidMotorNozzleTemplate.Create` seeds exit/12, but `SolidMotor.ResizeNozzles` derives
    // the ratio from the peak burning area — so a 4× longer grain runs a different nozzle.
    const short = sampleThrustCurve(motorWith(NEUTRAL), 16)!;
    const long = sampleThrustCurve(
      motorWith(NEUTRAL, {
        segments: [{ outerRadiusM: 0.6, wallThicknessMm: 6, lengthM: 16, geometry: NEUTRAL }],
      }),
      16,
    )!;
    expect(long.areaRatio).not.toBeCloseTo(short.areaRatio, 3);
    expect(long.areaRatio).toBeGreaterThanOrEqual(1.2);
    expect(long.peakThrustN).toBeGreaterThan(short.peakThrustN);
  });

  it('lets a stack too large for its nozzle run at the 1.2 floor instead of rejecting it', () => {
    // Build 5261 (rev 5200/5173) reordered SolidMotor.ResizeNozzles: MinAreaRatioBound is now
    // derived first and floored at 1.2, then MaxAreaRatioBound is raised to meet it — the LOW
    // bound wins where they cross. Before 5261 Max was computed first and a peak burning area
    // demanding a ratio under 1.2 returned "Stack too large for the nozzle"; that rejection is
    // gone. A very long, wide grain on the seeded nozzle is exactly that case.
    const huge = sampleThrustCurve(
      motorWith(NEUTRAL, {
        segments: [{ outerRadiusM: 1.2, wallThicknessMm: 6, lengthM: 40, geometry: NEUTRAL }],
      }),
      16,
    );
    expect(huge).not.toBeNull();
    expect(huge!.areaRatio).toBeGreaterThanOrEqual(1.2);
    expect(huge!.peakThrustN).toBeGreaterThan(0);
  });

  it('scales burn time with grain web thickness', () => {
    const thin = sampleThrustCurve(motorWith(NEUTRAL), 16)!;
    const thick = sampleThrustCurve(
      motorWith(NEUTRAL, {
        segments: [{ outerRadiusM: 1.2, wallThicknessMm: 6, lengthM: 4, geometry: NEUTRAL }],
      }),
      16,
    )!;
    expect(thick.burnSeconds).toBeGreaterThan(thin.burnSeconds);
  });

  it.each([
    ['no grain segments', { segments: [] }],
    ['no nozzles', { nozzles: [] }],
    ['no storage density — a CUSTOM propellant', { storageDensityKgPerM3: 0 }],
    ['no burn-rate law', { burnRate: { coefficientMPerS: 0, exponent: 0.35 } }],
    ['no reaction LUT', { lut: { rows: [] } }],
    ['no pressure window', { minimumBurnPressurePa: 0, maxStablePressurePa: 0 }],
    [
      'a zero-length segment',
      { segments: [{ outerRadiusM: 0.6, wallThicknessMm: 6, lengthM: 0, geometry: NEUTRAL }] },
    ],
    [
      'a wall thicker than the casing',
      { segments: [{ outerRadiusM: 0.05, wallThicknessMm: 600, lengthM: 4, geometry: NEUTRAL }] },
    ],
  ] as [string, Partial<SolidMotorInput>][])('degrades to null with %s', (_label, overrides) => {
    expect(sampleThrustCurve(motorWith(NEUTRAL, overrides), 32)).toBeNull();
  });

  it('refuses a sample count below two (KSA returns false there too)', () => {
    expect(sampleThrustCurve(motorWith(NEUTRAL), 1)).toBeNull();
  });
});

describe('grainGeometryCatalog parsing', () => {
  const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

  it('reads a GrainGeometry into parallel ascending columns', () => {
    const out: GrainGeometryTable[] = [];
    parseGrainGeometriesFile(
      parse(`<Assets>
        <GrainGeometry Id="Neutral">
          <Name Value="Neutral" /><Shape Value="Star" />
          <DepthCondition><Depth Value="0.0" /><Perimeter Value="2.2" /><PortArea Value="0.38" /></DepthCondition>
          <DepthCondition><Depth Value="0.5" /><Perimeter Value="2.3" /><PortArea Value="1.5" /></DepthCondition>
        </GrainGeometry>
      </Assets>`) as unknown as Document,
      out,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'Neutral', name: 'Neutral', shape: 'Star' });
    expect(out[0].depth).toEqual([0, 0.5]);
    expect(out[0].perimeter).toEqual([2.2, 2.3]);
  });

  it.each([
    [
      'fewer than two conditions',
      '<DepthCondition><Depth Value="0" /><Perimeter Value="1" /><PortArea Value="1" /></DepthCondition>',
    ],
    [
      'a first depth that is not zero',
      '<DepthCondition><Depth Value="0.1" /><Perimeter Value="1" /><PortArea Value="1" /></DepthCondition><DepthCondition><Depth Value="0.5" /><Perimeter Value="1" /><PortArea Value="2" /></DepthCondition>',
    ],
    [
      'a port area that does not increase',
      '<DepthCondition><Depth Value="0" /><Perimeter Value="1" /><PortArea Value="1" /></DepthCondition><DepthCondition><Depth Value="0.5" /><Perimeter Value="1" /><PortArea Value="1" /></DepthCondition>',
    ],
    [
      'a negative perimeter',
      '<DepthCondition><Depth Value="0" /><Perimeter Value="-1" /><PortArea Value="1" /></DepthCondition><DepthCondition><Depth Value="0.5" /><Perimeter Value="1" /><PortArea Value="2" /></DepthCondition>',
    ],
  ])('skips a profile with %s rather than throwing', (_label, body) => {
    const out: GrainGeometryTable[] = [];
    parseGrainGeometriesFile(
      parse(
        `<Assets><GrainGeometry Id="Bad">${body}</GrainGeometry></Assets>`,
      ) as unknown as Document,
      out,
    );
    expect(out).toEqual([]);
  });

  it('reads solid storage densities and maps a phase id back to its substance', () => {
    const out = new Map<string, number>();
    parseSolidPropellantsFile(
      parse(`<Assets>
        <Substance Id="APCP" DefaultPhase="Solid">
          <Solid><StorageDensity KgPerM3="1780.0" /></Solid>
        </Substance>
        <Substance Id="Kerosene"><Liquid><StorageDensity KgPerM3="810" /></Liquid></Substance>
      </Assets>`) as unknown as Document,
      out,
    );
    expect([...out]).toEqual([['APCP', 1780]]);
    expect(substanceIdOfPhase('APCP(s)')).toBe('APCP');
    expect(substanceIdOfPhase('APCP')).toBe('APCP');
  });
});
