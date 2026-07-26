import { atom } from 'nanostores'

/**
 * Ephemeral state for the IVA SEAT VIEW — "sit in this seat and look around".
 *
 * KSA's vehicle editor has no IVA preview at all (the only in-game check is launch →
 * `Shift+C` twice → `C` to cycle), so this mode is what makes seat authoring possible
 * instead of guesswork: the camera goes to the seat's eye point, at KSA's 50° vertical
 * FOV, and free-look runs through the game's own clamps (`src/ksa/ivaLook.ts`).
 * See plans/IVA_PLAN.md §3.6.
 *
 * NOTHING here is document data: it is never persisted, never in undo, and never
 * exported. Seat AUTHORING intents live in `ivaSeatStore.ts`; the seats themselves are
 * on `$part` (`EditingPart.ivaSeats`).
 *
 * Who reads what:
 *  - `Viewport` (`src/three/Viewport.ts`) drives the camera from `$seatLook` and writes
 *    the accumulated free-look back into it from its pointer handlers.
 *  - `EditorScene` resolves `$seatView` against `$part` to a pose, and suppresses the
 *    gizmo / click-selection / seat markers while it is set.
 */

/** Free-look offset from the seat's forward axis, in radians. */
export interface SeatLook {
  /** Left/right, positive = toward the seat's left (rotation about its up axis). */
  yaw: number
  /** Up/down, positive = toward the seat's up axis (rotation about its right axis). */
  pitch: number
}

/**
 * Hard bound on each accumulated free-look angle, in radians.
 *
 * The game's clamps (`clampSeatLook`) are what the user actually sees stop the view, but
 * they act on the composed DIRECTION — an unbounded accumulator would happily wind up to
 * 40 radians of yaw against a look that stopped moving at 90°, and then need the whole 40
 * unwound before the view budged again. Clamp 1 already kills everything past 90° from
 * forward, so bounding the accumulator there costs no reachable direction and keeps a
 * drag reversible the moment it reverses.
 */
export const SEAT_LOOK_LIMIT = Math.PI / 2

/**
 * The seat currently being previewed from, or null. Ephemeral: never persisted, never in
 * undo.
 *
 * Keyed by seat **id**, not index, so reordering seats mid-preview (the inspector's
 * up/down buttons are still live) cannot silently move the camera into a different seat.
 * A vanished id — deleted seat, swapped project — is resolved by `EditorScene` as "exit
 * cleanly" rather than by reading a stale pose.
 */
export const $seatView = atom<string | null>(null)

/** Free-look offset while in seat view (radians). Reset on enter. */
export const $seatLook = atom<SeatLook>({ yaw: 0, pitch: 0 })

/** Sits in `seatId`, facing straight down its forward axis (the free-look resets). */
export function enterSeatView(seatId: string): void {
  $seatLook.set({ yaw: 0, pitch: 0 })
  $seatView.set(seatId)
}

/** Leaves seat view. Safe to call when not in it. */
export function exitSeatView(): void {
  if ($seatView.get() === null) return
  $seatView.set(null)
  $seatLook.set({ yaw: 0, pitch: 0 })
}

/**
 * Accumulates a free-look delta (radians), bounded by {@link SEAT_LOOK_LIMIT}. A no-op
 * outside seat view, so a stray pointer event can never leave a stale offset behind for
 * the next entry.
 */
export function nudgeSeatLook(deltaYaw: number, deltaPitch: number): void {
  if ($seatView.get() === null) return
  const { yaw, pitch } = $seatLook.get()
  $seatLook.set({
    yaw: bound(yaw + deltaYaw),
    pitch: bound(pitch + deltaPitch),
  })
}

function bound(angle: number): number {
  return Math.min(SEAT_LOOK_LIMIT, Math.max(-SEAT_LOOK_LIMIT, angle))
}
