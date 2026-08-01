import { describe, it, expect } from 'vitest';
import {
  controlPointsOf,
  evalEasing,
  evalBezierPoints,
  isLinearEasing,
  EASING_PRESETS,
} from './easing';
import type { EasingConfig } from './types';

describe('evalEasing', () => {
  it('is the identity for absent / linear easing', () => {
    for (const a of [0, 0.1, 0.5, 0.9, 1]) {
      expect(evalEasing(undefined, a)).toBe(a);
      expect(evalEasing({ kind: 'preset', preset: 'linear' }, a)).toBe(a);
      expect(evalEasing({ kind: 'cubicBezier', x1: 0, y1: 0, x2: 1, y2: 1 }, a)).toBe(a);
    }
  });

  it('pins the endpoints exactly for any curve', () => {
    const ease: EasingConfig = { kind: 'cubicBezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
    expect(evalEasing(ease, 0)).toBe(0);
    expect(evalEasing(ease, 1)).toBe(1);
    // out-of-range inputs clamp at the endpoints
    expect(evalEasing(ease, -0.5)).toBe(0);
    expect(evalEasing(ease, 1.5)).toBe(1);
  });

  it('matches the known CSS `ease` value at the midpoint', () => {
    // cubic-bezier(.25,.1,.25,1) at x=0.5 ≈ 0.8025 (browser reference)
    expect(
      evalEasing({ kind: 'cubicBezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }, 0.5),
    ).toBeCloseTo(0.8025, 2);
  });

  it('ease-in lags and ease-out leads at the midpoint', () => {
    expect(evalEasing({ kind: 'preset', preset: 'easeIn' }, 0.5)).toBeLessThan(0.5);
    expect(evalEasing({ kind: 'preset', preset: 'easeOut' }, 0.5)).toBeGreaterThan(0.5);
    expect(evalEasing({ kind: 'preset', preset: 'easeInOut' }, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('is monotonically increasing for a monotone curve', () => {
    const ease: EasingConfig = { kind: 'preset', preset: 'easeInOutCubic' };
    let prev = -Infinity;
    for (let a = 0; a <= 1.0001; a += 0.05) {
      const v = evalEasing(ease, a);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('overshoots past 1 for a back-ease (y2 > 1)', () => {
    // a "back out" curve overshoots before settling
    const back: EasingConfig = { kind: 'cubicBezier', x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 };
    let maxV = 0;
    for (let a = 0; a < 1; a += 0.02)
      maxV = Math.max(maxV, evalBezierPoints(controlPointsOf(back), a));
    expect(maxV).toBeGreaterThan(1);
  });

  it('falls back to linear on NaN / unknown control points', () => {
    expect(evalEasing({ kind: 'cubicBezier', x1: NaN, y1: 0, x2: 1, y2: 1 }, 0.3)).toBe(0.3);
    expect(isLinearEasing({ kind: 'cubicBezier', x1: NaN, y1: 0, x2: 1, y2: 1 })).toBe(true);
  });
});

describe('EASING_PRESETS', () => {
  it('linear resolves to the identity control points', () => {
    expect(EASING_PRESETS.linear).toEqual([0, 0, 1, 1]);
    expect(isLinearEasing({ kind: 'preset', preset: 'linear' })).toBe(true);
  });

  it('every non-linear preset has monotone x control points in [0,1]', () => {
    for (const [name, [x1, , x2]] of Object.entries(EASING_PRESETS)) {
      expect(x1, name).toBeGreaterThanOrEqual(0);
      expect(x1, name).toBeLessThanOrEqual(1);
      expect(x2, name).toBeGreaterThanOrEqual(0);
      expect(x2, name).toBeLessThanOrEqual(1);
    }
  });
});
