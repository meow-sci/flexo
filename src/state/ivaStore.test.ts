import { describe, it, expect, beforeEach } from 'vitest';
import {
  $seatLook,
  $seatView,
  enterSeatView,
  exitSeatView,
  nudgeSeatLook,
  reclampSeatLook,
  seatLookDirection,
  type SeatAxes,
} from './ivaStore';
import { IVA_UP_DOT_LIMIT } from '../ksa/ivaLook';
import type { Vec3 } from '../ksa/types';

/** An un-rotated seat: KSA's schema defaults, forward `+X` and up `−Z`. */
const AXES: SeatAxes = { forward: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 } };

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** The two invariants the preview exists to honour — `IVAController.OnFrame:81-108`. */
function expectWithinLimits(look: Vec3, axes: SeatAxes = AXES): void {
  expect(Math.hypot(look.x, look.y, look.z)).toBeCloseTo(1, 12);
  expect(dot(look, axes.forward)).toBeGreaterThanOrEqual(-1e-12);
  expect(Math.abs(dot(look, axes.up))).toBeLessThanOrEqual(IVA_UP_DOT_LIMIT + 1e-9);
}

beforeEach(() => {
  $seatView.set(null);
  $seatLook.set(null);
});

describe('ivaStore — entering and leaving seat view', () => {
  it('enterSeatView records the seat ID and faces straight down the forward axis', () => {
    $seatLook.set({ x: 0, y: 1, z: 0 });
    enterSeatView('_seat2');
    expect($seatView.get()).toBe('_seat2');
    expect(seatLookDirection(AXES)).toEqual(AXES.forward);
  });

  it('enterSeatView on a second seat resets the look again', () => {
    enterSeatView('_seat1');
    nudgeSeatLook(0.3, 0.2, AXES);
    expect(seatLookDirection(AXES)).not.toEqual(AXES.forward);
    enterSeatView('_seat2');
    expect($seatView.get()).toBe('_seat2');
    expect(seatLookDirection(AXES)).toEqual(AXES.forward);
  });

  it('exitSeatView clears both atoms and is a no-op when not previewing', () => {
    enterSeatView('_seat1');
    nudgeSeatLook(0.3, 0.2, AXES);
    exitSeatView();
    expect($seatView.get()).toBeNull();
    expect($seatLook.get()).toBeNull();

    let notified = 0;
    const unsub = $seatView.listen(() => notified++);
    exitSeatView();
    unsub();
    expect(notified).toBe(0);
  });

  it('resolves an unaimed look to a UNIT forward, even for a non-unit axis', () => {
    enterSeatView('_seat1');
    const look = seatLookDirection({ forward: { x: 0, y: 3, z: 0 }, up: AXES.up });
    expect(look).toEqual({ x: 0, y: 1, z: 0 });
  });
});

describe('ivaStore — free-look, in the game’s own state representation', () => {
  it('turns the stored DIRECTION by the delta (drag right looks right, drag up looks up)', () => {
    enterSeatView('_seat1');
    // The viewport passes (-dx, -dy) · rad-per-px, so a rightward drag is a negative yaw.
    nudgeSeatLook(-0.25, 0, AXES);
    const right = seatLookDirection(AXES);
    // Seat right = forward × up = +X × −Z = +Y.
    expect(right.y).toBeGreaterThan(0);
    expect(right.z).toBeCloseTo(0, 12);

    enterSeatView('_seat1');
    nudgeSeatLook(0, 0.25, AXES);
    const up = seatLookDirection(AXES);
    // Seat up is −Z, so looking up means a negative z.
    expect(up.z).toBeLessThan(0);
    expect(up.y).toBeCloseTo(0, 12);
  });

  it('never leaves the forward hemisphere or enters the pole cone, however far you drag', () => {
    enterSeatView('_seat1');
    // The measured failure case of the old accumulator: a big yaw and a big pitch together.
    for (const [yaw, pitch] of [
      [Math.PI / 2, Math.PI / 2],
      [-Math.PI / 2, Math.PI / 2],
      [-Math.PI / 2, -Math.PI / 2],
      [Math.PI / 2, -Math.PI / 2],
    ]) {
      enterSeatView('_seat1');
      nudgeSeatLook(yaw, pitch, AXES);
      expectWithinLimits(seatLookDirection(AXES));
    }
  });

  it('stays inside both limits across a long sweep of small deltas', () => {
    enterSeatView('_seat1');
    for (let i = 0; i < 400; i++) {
      nudgeSeatLook(0.05, 0.05, AXES);
      expectWithinLimits(seatLookDirection(AXES));
    }
  });

  it('stays bounded when the same huge delta is repeated, instead of winding up', () => {
    enterSeatView('_seat1');
    // The old yaw/pitch accumulator wound past its own bound and needed the whole wind-up
    // unwound before the view moved. Feeding the clamps their own output cannot: every
    // step starts from a legal direction, so every step ends on one.
    for (let i = 0; i < 60; i++) {
      nudgeSeatLook(10, 10, AXES);
      expectWithinLimits(seatLookDirection(AXES));
    }
  });

  it('holds a clamped look as a FIXED POINT — a zero delta never drifts', () => {
    enterSeatView('_seat1');
    nudgeSeatLook(-1.2, 0.9, AXES); // hard against both clamps
    const settled = seatLookDirection(AXES);
    for (let i = 0; i < 10; i++) nudgeSeatLook(0, 0, AXES);
    expect(seatLookDirection(AXES)).toEqual(settled);
  });

  it('survives a fuzz of small drags and big flings without leaving either limit', () => {
    enterSeatView('_seat1');
    // Deterministic LCG: reproducible, and wide enough to hit both clamps repeatedly.
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648 - 0.5;
    };
    let minForward = 1;
    let maxUp = 0;
    for (let i = 0; i < 20000; i++) {
      const scale = i % 3 === 0 ? 6 : 0.05; // every third event is a fling
      nudgeSeatLook(rnd() * scale, rnd() * scale, AXES);
      const look = seatLookDirection(AXES);
      minForward = Math.min(minForward, dot(look, AXES.forward));
      maxUp = Math.max(maxUp, Math.abs(dot(look, AXES.up)));
    }
    // Both bounds are touched exactly, never crossed (float noise aside).
    expect(minForward).toBeGreaterThan(-1e-9);
    expect(minForward).toBeLessThan(1e-9);
    expect(maxUp).toBeLessThanOrEqual(IVA_UP_DOT_LIMIT + 1e-9);
    expect(maxUp).toBeGreaterThan(IVA_UP_DOT_LIMIT - 1e-9);
  });

  it('ignores deltas outside seat view (no stale look for the next entry)', () => {
    nudgeSeatLook(0.4, 0.4, AXES);
    expect($seatLook.get()).toBeNull();
  });
});

describe('ivaStore — reclampSeatLook', () => {
  it('resolves the unaimed state to a stored, clamped direction', () => {
    enterSeatView('_seat1');
    expect($seatLook.get()).toBeNull();
    reclampSeatLook(AXES);
    expect($seatLook.get()).toEqual(AXES.forward);
  });

  it('pulls a look back inside the limits when the seat is re-aimed under it', () => {
    enterSeatView('_seat1');
    nudgeSeatLook(-1.4, 0, AXES); // hard right, still legal for this seat
    const before = seatLookDirection(AXES);
    expect(dot(before, AXES.forward)).toBeGreaterThanOrEqual(0);

    // Re-aim the seat 180°: the stored look is now BEHIND the new forward.
    const flipped: SeatAxes = { forward: { x: -1, y: 0, z: 0 }, up: AXES.up };
    expect(dot(before, flipped.forward)).toBeLessThan(0);
    reclampSeatLook(flipped);
    expectWithinLimits(seatLookDirection(flipped), flipped);
  });

  it('does not notify when the stored look is already legal', () => {
    enterSeatView('_seat1');
    reclampSeatLook(AXES);
    let notified = 0;
    const unsub = $seatLook.listen(() => notified++);
    reclampSeatLook(AXES);
    reclampSeatLook(AXES);
    unsub();
    expect(notified).toBe(0);
  });

  it('is a no-op outside seat view', () => {
    reclampSeatLook(AXES);
    expect($seatLook.get()).toBeNull();
  });
});
