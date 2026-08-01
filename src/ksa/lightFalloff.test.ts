import { describe, expect, it } from 'vitest';
import {
  clampSpotAngles,
  lightIlluminance,
  MAX_OUTER_ANGLE_RAD,
  MIN_OUTER_ANGLE_RAD,
  spotAttenuation,
} from './lightFalloff';

/**
 * Pins every reference vector from plans/LIGHT_MANAGEMENT_PLAN.md §1.5 — computed
 * from KSA's shipped shader formulas (LightPrePass.comp:274-297). If any row here
 * drifts, the ported math no longer matches the game.
 */

const DEG2RAD = Math.PI / 180;

/**
 * §1.5 table check: the plan's 1e-3 RELATIVE tolerance, widened to an absolute
 * 5e-5 floor (half the table's last printed decimal) for rows whose PRINT precision
 * is coarser than 1e-3 relative — e.g. the 44° row prints `0.0032` (2 significant
 * figures), where the exact value 0.003183… differs by more than 0.0032·1e-3.
 */
function expectTable(actual: number, printed: number): void {
  const tol = Math.max(1e-3 * Math.abs(printed), 5e-5);
  expect(Math.abs(actual - printed)).toBeLessThanOrEqual(tol);
}

describe('lightIlluminance — SpotlightA distance falloff (I=10, R=5)', () => {
  // [d, E(d), Reinhard E/(E+1)] — plan §1.5 table 1.
  const rows: Array<[number, number, number]> = [
    [0.25, 159.999, 0.9938],
    [0.5, 39.996, 0.9756],
    [1, 9.984, 0.909],
    [2, 2.436, 0.709],
    [3, 0.96711, 0.4916],
    [4, 0.369, 0.2695],
    [4.5, 0.16983, 0.1452],
    [4.9, 0.03233, 0.0313],
  ];
  it.each(rows)('E(%f) ≈ %f (Reinhard %f)', (d, expected, reinhard) => {
    const e = lightIlluminance(d, 5, 10);
    expectTable(e, expected);
    expectTable(e / (e + 1), reinhard);
  });

  it('is EXACTLY 0 at d = Range — the hard boundary sphere', () => {
    expect(lightIlluminance(5, 5, 10)).toBe(0);
  });
});

describe('lightIlluminance — dim CoreIVASpaceA point light (I=0.05, R=1.5)', () => {
  // Plan §1.5 table 3 — the light that justifies the auto-exposure viz mode.
  const rows: Array<[number, number]> = [
    [0.1, 4.9999],
    [0.25, 0.79938],
    [0.5, 0.19753],
    [1.0, 0.04012],
    [1.4, 0.00615],
  ];
  it.each(rows)('E(%f) ≈ %f', (d, expected) => {
    expectTable(lightIlluminance(d, 1.5, 0.05), expected);
  });

  it('is EXACTLY 0 at d = Range', () => {
    expect(lightIlluminance(1.5, 1.5, 0.05)).toBe(0);
  });
});

describe('lightIlluminance guards', () => {
  it('returns 0 for rangeM <= 0 — KSA culls those CPU-side (ClusteredLightSystem.cs:669,760)', () => {
    expect(lightIlluminance(1, 0, 10)).toBe(0);
    expect(lightIlluminance(0.001, 0, 10)).toBe(0);
    expect(lightIlluminance(1, -2, 10)).toBe(0);
  });

  it('returns 0 for every d ≥ range', () => {
    expect(lightIlluminance(5, 5, 10)).toBe(0);
    expect(lightIlluminance(5.000001, 5, 10)).toBe(0);
    expect(lightIlluminance(500, 5, 10)).toBe(0);
  });

  it('is finite at d = 0 (the 1e-6 d² floor)', () => {
    const e0 = lightIlluminance(0, 5, 10);
    expect(Number.isFinite(e0)).toBe(true);
    expect(e0).toBe(10 / 1e-6);
  });

  it('decreases monotonically over (0, range)', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let i = 1; i <= 200; i++) {
      const d = (i / 201) * 5;
      const e = lightIlluminance(d, 5, 10);
      expect(e).toBeGreaterThan(0);
      expect(e).toBeLessThan(prev);
      prev = e;
    }
  });
});

describe('spotAttenuation — SpotlightA angular falloff (inner 0.392599, outer 0.785398)', () => {
  // Core's CoreElectricalA_Subpart_SpotlightA cone (22.5°/45°) — plan §1.5 table 2.
  const INNER = 0.392599;
  const OUTER = 0.785398;
  const at = (deg: number) => spotAttenuation(Math.cos(deg * DEG2RAD), INNER, OUTER);

  it('is EXACTLY 1 inside the inner cone (0°, 10°)', () => {
    expect(at(0)).toBe(1);
    expect(at(10)).toBe(1);
  });

  const rows: Array<[number, number]> = [
    [22.5, 0.9996],
    [25, 0.8442],
    [30, 0.5373],
    [35, 0.2671],
    [40, 0.0739],
    [44, 0.0032],
  ];
  it.each(rows)('spot(%f°)² ≈ %f', (deg, expected) => {
    expectTable(at(deg), expected);
  });

  it('is EXACTLY 0 on the outer cone (45°)', () => {
    expect(at(45)).toBe(0);
  });
});

describe('spotAttenuation clamping', () => {
  const INNER = Math.PI / 8;
  const OUTER = Math.PI / 4;

  it('saturates out-of-range cosines to [0, 1]', () => {
    expect(spotAttenuation(1.5, INNER, OUTER)).toBe(1);
    expect(spotAttenuation(-1, INNER, OUTER)).toBe(0);
    expect(spotAttenuation(-1.5, INNER, OUTER)).toBe(0);
  });

  it('inner === outer steps 0→1 through the 1e-4 denominator floor, never NaN', () => {
    const a = Math.PI / 6;
    expect(spotAttenuation(1, a, a)).toBe(1);
    expect(spotAttenuation(Math.cos(a) - 0.01, a, a)).toBe(0);
    expect(Number.isFinite(spotAttenuation(Math.cos(a), a, a))).toBe(true);
  });
});

describe('clampSpotAngles — CreateSpotLight parity (Light.cs:54-79)', () => {
  it('exports the Light.cs clamp constants verbatim', () => {
    expect(MAX_OUTER_ANGLE_RAD).toBe(1.5697963);
    expect(MIN_OUTER_ANGLE_RAD).toBe(1e-5);
  });

  // Plan §1.5 "Angle sanitizer parity" — all three cases.
  it('clamps an over-limit outer (Core FloodlightA authors 1.57)', () => {
    expect(clampSpotAngles(0.23, 1.57)).toEqual({ innerRad: 0.23, outerRad: 1.5697963 });
  });

  it('swaps when inner > outer, BEFORE clamping', () => {
    expect(clampSpotAngles(0.8, 0.4)).toEqual({ innerRad: 0.4, outerRad: 0.8 });
  });

  it('clamps a far-over outer while keeping inner', () => {
    expect(clampSpotAngles(0.5, 2.0)).toEqual({ innerRad: 0.5, outerRad: 1.5697963 });
  });

  it('floors a degenerate outer at MIN_OUTER_ANGLE_RAD', () => {
    expect(clampSpotAngles(0, 0)).toEqual({ innerRad: 0, outerRad: MIN_OUTER_ANGLE_RAD });
  });
});
