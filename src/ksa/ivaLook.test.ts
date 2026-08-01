import { describe, it, expect } from 'vitest';
import { IVA_UP_DOT_LIMIT, clampSeatLook } from './ivaLook';
import type { Vec3 } from './types';

/**
 * Locks the verbatim port of `IVAController.OnFrame:80-108` — the two IVA view clamps.
 *
 * The load-bearing subtlety these tests pin down is the axis asymmetry: clamp 1 compares against
 * the NORMALIZED forward axis, clamp 2 against the RAW up axis. A non-unit `<UpAxis>` therefore
 * moves the pitch limit, which is why flexo always emits unit axes.
 */

const FORWARD_X: Vec3 = { x: 1, y: 0, z: 0 };
const UP_Z: Vec3 = { x: 0, y: 0, z: 1 };

const DEG = Math.PI / 180;

/** The 25.8419° the game leaves between the look and the up pole when `|up| == 1`. */
const ACOS_LIMIT = Math.acos(IVA_UP_DOT_LIMIT);

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function len(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

/** Angle in radians between two directions (either may be non-unit). */
function angleBetween(a: Vec3, b: Vec3): number {
  const d = dot(a, b) / (len(a) * len(b));
  return Math.acos(Math.min(1, Math.max(-1, d)));
}

/** A direction `alpha` radians off `+Z` (the up axis), in the XZ plane so it leans toward `+X`. */
function fromUpAngle(alpha: number): Vec3 {
  return { x: Math.sin(alpha), y: 0, z: Math.cos(alpha) };
}

/** A direction `theta` radians off `+X` (the forward axis), in the XY plane. */
function fromForwardAngle(theta: number): Vec3 {
  return { x: Math.cos(theta), y: Math.sin(theta), z: 0 };
}

function isFinite3(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

describe('clampSeatLook — clamp 1, the forward hemisphere', () => {
  it('pulls a 120° look back to EXACTLY 90° off forward', () => {
    const out = clampSeatLook(fromForwardAngle(120 * DEG), FORWARD_X, UP_Z);
    expect(angleBetween(out, FORWARD_X)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('pulls a 179° look back to exactly 90°, on the same side it came from', () => {
    const out = clampSeatLook(fromForwardAngle(179 * DEG), FORWARD_X, UP_Z);
    expect(angleBetween(out, FORWARD_X)).toBeCloseTo(Math.PI / 2, 9);
    expect(out.y).toBeGreaterThan(0); // did not flip through the forward axis
  });

  it('compares against the NORMALIZED forward axis: |forward| does not move the limit', () => {
    const look = fromForwardAngle(120 * DEG);
    const unit = clampSeatLook(look, FORWARD_X, UP_Z);
    const long = clampSeatLook(look, { x: 7, y: 0, z: 0 }, UP_Z);
    expect(long.x).toBeCloseTo(unit.x, 12);
    expect(long.y).toBeCloseTo(unit.y, 12);
    expect(long.z).toBeCloseTo(unit.z, 12);
  });
});

describe('clampSeatLook — clamp 2, the up-pole exclusion', () => {
  it('pushes a 10°-from-up look back to acos(0.9) ≈ 25.84°', () => {
    const out = clampSeatLook(fromUpAngle(10 * DEG), FORWARD_X, UP_Z);
    expect(angleBetween(out, UP_Z)).toBeCloseTo(ACOS_LIMIT, 12);
    expect(ACOS_LIMIT / DEG).toBeCloseTo(25.8419, 4);
  });

  it('is symmetric about the equator — 10° from the DOWN pole lands at 25.84° too', () => {
    const out = clampSeatLook(fromUpAngle(170 * DEG), FORWARD_X, UP_Z);
    expect(angleBetween(out, UP_Z)).toBeCloseTo(Math.PI - ACOS_LIMIT, 12);
  });

  it('is idempotent for a unit up axis (the game re-runs it every frame)', () => {
    const once = clampSeatLook(fromUpAngle(10 * DEG), FORWARD_X, UP_Z);
    const twice = clampSeatLook(once, FORWARD_X, UP_Z);
    expect(twice.x).toBeCloseTo(once.x, 12);
    expect(twice.y).toBeCloseTo(once.y, 12);
    expect(twice.z).toBeCloseTo(once.z, 12);
  });
});

describe('clampSeatLook — the RAW up axis, i.e. why |UpAxis| matters', () => {
  const UP_2: Vec3 = { x: 0, y: 0, z: 2 };
  /** `|up| == 2` ⇒ `|dot| > 0.9` ⇔ `cos α > 0.45`: the cone widens to 63.2563°. */
  const THRESHOLD_2 = Math.acos(IVA_UP_DOT_LIMIT / 2);

  it('|up| = 2 widens the excluded cone to acos(0.45) ≈ 63.26° (usable pitch ±~26.7°)', () => {
    expect(THRESHOLD_2 / DEG).toBeCloseTo(63.2563, 4);
    expect(90 - THRESHOLD_2 / DEG).toBeCloseTo(26.7437, 4);

    // Just OUTSIDE the cone: legal, returned unchanged.
    const outside = fromUpAngle(THRESHOLD_2 + 0.5 * DEG);
    const keptO = clampSeatLook(outside, FORWARD_X, UP_2);
    expect(angleBetween(keptO, outside)).toBeCloseTo(0, 12);

    // Just INSIDE the cone: clamped away from the pole.
    const inside = fromUpAngle(THRESHOLD_2 - 0.5 * DEG);
    const keptI = clampSeatLook(inside, FORWARD_X, UP_2);
    expect(angleBetween(keptI, UP_Z)).toBeGreaterThan(angleBetween(inside, UP_Z));

    // A unit up would have left BOTH of those alone — they sit well past acos(0.9).
    expect(angleBetween(clampSeatLook(inside, FORWARD_X, UP_Z), inside)).toBeCloseTo(0, 12);
  });

  it('|up| = 2 under-corrects in one step and converges over frames, like the game', () => {
    // safeAcos(dot) saturates at 0 while |dot| > 1, so a single application does not reach the
    // legal cone — the in-game camera gets there by re-running the clamp each frame.
    let dir = fromUpAngle(10 * DEG);
    dir = clampSeatLook(dir, FORWARD_X, UP_2);
    expect(angleBetween(dir, UP_Z)).toBeCloseTo(10 * DEG + ACOS_LIMIT, 12);
    expect(angleBetween(dir, UP_Z)).toBeLessThan(THRESHOLD_2); // still illegal after one step

    for (let i = 0; i < 8; i++) dir = clampSeatLook(dir, FORWARD_X, UP_2);
    expect(angleBetween(dir, UP_Z)).toBeGreaterThanOrEqual(THRESHOLD_2);
    expect(len(dir)).toBeCloseTo(1, 12);
  });

  it('|up| = 0.5 never engages the clamp — the look reaches the pole', () => {
    const UP_HALF: Vec3 = { x: 0, y: 0, z: 0.5 };
    // Straight up: dot = 0.5, below the 0.9 limit, so nothing happens.
    const atPole = clampSeatLook({ x: 0, y: 0, z: 1 }, FORWARD_X, UP_HALF);
    expect(angleBetween(atPole, UP_Z)).toBeCloseTo(0, 12);
    expect(atPole.z).toBeCloseTo(1, 12);

    // 1° off the pole is untouched as well, where a unit up would have moved it 24.8°.
    const near = fromUpAngle(1 * DEG);
    expect(angleBetween(clampSeatLook(near, FORWARD_X, UP_HALF), near)).toBeCloseTo(0, 12);
    expect(angleBetween(clampSeatLook(near, FORWARD_X, UP_Z), UP_Z)).toBeCloseTo(ACOS_LIMIT, 12);
  });
});

describe('clampSeatLook — legal input and invariants', () => {
  it('returns an already-legal direction unchanged (up to normalization)', () => {
    const look: Vec3 = { x: 2, y: 0.5, z: 0.3 }; // 5.7° off forward, 82.7° off up
    const out = clampSeatLook(look, FORWARD_X, UP_Z);
    expect(angleBetween(out, look)).toBeCloseTo(0, 12);
    expect(len(out)).toBeCloseTo(1, 12);
  });

  it('always returns a finite unit vector', () => {
    const ups: Vec3[] = [UP_Z, { x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 0.5 }, { x: 0, y: 1, z: 1 }];
    for (const up of ups) {
      for (let deg = -180; deg <= 180; deg += 7) {
        for (const look of [fromUpAngle(deg * DEG), fromForwardAngle(deg * DEG)]) {
          const out = clampSeatLook(look, FORWARD_X, up);
          expect(isFinite3(out)).toBe(true);
          expect(len(out)).toBeCloseTo(1, 12);
        }
      }
    }
  });
});

describe('clampSeatLook — degenerate edges', () => {
  it('a look exactly antiparallel to forward survives (the rotation axis degenerates)', () => {
    const out = clampSeatLook({ x: -1, y: 0, z: 0 }, FORWARD_X, UP_Z);
    expect(isFinite3(out)).toBe(true);
    expect(len(out)).toBeCloseTo(1, 12);
    // `cross(look, forward)` is zero, so the C#'s `toVector.Length() != 0.0` guard skips the
    // rotation and the look stays 180° off forward — the game's own behaviour, not a bug here.
    expect(angleBetween(out, FORWARD_X)).toBeCloseTo(Math.PI, 12);
  });

  it('a look exactly along up survives (same degenerate axis, clamp 2)', () => {
    const out = clampSeatLook(UP_Z, FORWARD_X, UP_Z);
    expect(isFinite3(out)).toBe(true);
    expect(len(out)).toBeCloseTo(1, 12);
    expect(angleBetween(out, UP_Z)).toBeCloseTo(0, 12);
  });

  it('a look exactly along the DOWN pole survives too', () => {
    const out = clampSeatLook({ x: 0, y: 0, z: -1 }, FORWARD_X, UP_Z);
    expect(isFinite3(out)).toBe(true);
    expect(len(out)).toBeCloseTo(1, 12);
  });

  it('never produces NaN for a zero look or zero axes', () => {
    const zero: Vec3 = { x: 0, y: 0, z: 0 };
    for (const out of [
      clampSeatLook(zero, FORWARD_X, UP_Z),
      clampSeatLook(zero, zero, zero),
      clampSeatLook({ x: 1, y: 0, z: 0 }, zero, UP_Z),
      clampSeatLook({ x: 1, y: 0, z: 0 }, FORWARD_X, zero),
    ]) {
      expect(isFinite3(out)).toBe(true);
      expect(len(out)).toBeCloseTo(1, 12);
    }
  });
});
