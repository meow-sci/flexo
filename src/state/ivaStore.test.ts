import { describe, it, expect, beforeEach } from 'vitest'
import {
  $seatLook,
  $seatView,
  SEAT_LOOK_LIMIT,
  enterSeatView,
  exitSeatView,
  nudgeSeatLook,
} from './ivaStore'

beforeEach(() => {
  $seatView.set(null)
  $seatLook.set({ yaw: 0, pitch: 0 })
})

describe('ivaStore — entering and leaving seat view', () => {
  it('enterSeatView records the seat ID and faces straight down the forward axis', () => {
    $seatLook.set({ yaw: 1, pitch: -0.5 })
    enterSeatView('_seat2')
    expect($seatView.get()).toBe('_seat2')
    expect($seatLook.get()).toEqual({ yaw: 0, pitch: 0 })
  })

  it('enterSeatView on a second seat resets the look again', () => {
    enterSeatView('_seat1')
    nudgeSeatLook(0.3, 0.2)
    enterSeatView('_seat2')
    expect($seatView.get()).toBe('_seat2')
    expect($seatLook.get()).toEqual({ yaw: 0, pitch: 0 })
  })

  it('exitSeatView clears both atoms and is a no-op when not previewing', () => {
    enterSeatView('_seat1')
    nudgeSeatLook(0.3, 0.2)
    exitSeatView()
    expect($seatView.get()).toBeNull()
    expect($seatLook.get()).toEqual({ yaw: 0, pitch: 0 })

    let notified = 0
    const unsub = $seatView.listen(() => notified++)
    exitSeatView()
    unsub()
    expect(notified).toBe(0)
  })
})

describe('ivaStore — free-look accumulation', () => {
  it('accumulates deltas while in seat view', () => {
    enterSeatView('_seat1')
    nudgeSeatLook(0.1, 0.2)
    nudgeSeatLook(0.1, -0.05)
    const look = $seatLook.get()
    expect(look.yaw).toBeCloseTo(0.2, 12)
    expect(look.pitch).toBeCloseTo(0.15, 12)
  })

  it('bounds each angle at SEAT_LOOK_LIMIT so a long drag stays reversible', () => {
    enterSeatView('_seat1')
    nudgeSeatLook(50, 50)
    expect($seatLook.get()).toEqual({ yaw: SEAT_LOOK_LIMIT, pitch: SEAT_LOOK_LIMIT })
    // One small reverse delta moves the view immediately — the whole point of the bound.
    nudgeSeatLook(-0.1, -0.1)
    expect($seatLook.get().yaw).toBeCloseTo(SEAT_LOOK_LIMIT - 0.1, 12)
    expect($seatLook.get().pitch).toBeCloseTo(SEAT_LOOK_LIMIT - 0.1, 12)

    nudgeSeatLook(-50, -50)
    expect($seatLook.get()).toEqual({ yaw: -SEAT_LOOK_LIMIT, pitch: -SEAT_LOOK_LIMIT })
  })

  it('ignores deltas outside seat view (no stale offset for the next entry)', () => {
    nudgeSeatLook(0.4, 0.4)
    expect($seatLook.get()).toEqual({ yaw: 0, pitch: 0 })
  })
})
