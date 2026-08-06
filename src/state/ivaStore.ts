import { atom } from 'nanostores';
import { clampSeatLook } from '../ksa/ivaLook';
import type { Vec3 } from '../ksa/types';
import { $part, activePartEntryId } from './editorStore';
import { armTool, disarmTool, registerTool } from './modeStore';

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
 *  - `Viewport` (`src/three/Viewport.ts`) points the camera down `$seatLook` and feeds its
 *    pointer deltas back into it through {@link nudgeSeatLook}.
 *  - `EditorScene` resolves `$seatView` against `$part` to a pose, and suppresses the
 *    gizmo / click-selection / seat markers while it is set.
 */

/** A seat's eye axes in workspace coordinates — KSA's `<ForwardAxis>` / `<UpAxis>`. */
export interface SeatAxes {
  forward: Vec3;
  /** RAW, magnitude included: {@link clampSeatLook}'s pole test is against the un-normalized axis. */
  up: Vec3;
}

/**
 * The seat currently being previewed from, or null. Ephemeral: never persisted, never in
 * undo.
 *
 * Keyed by seat **id**, not index, so reordering seats mid-preview (the inspector's
 * up/down buttons are still live) cannot silently move the camera into a different seat.
 * A vanished id — deleted seat, swapped project — is resolved by `EditorScene` as "exit
 * cleanly" rather than by reading a stale pose.
 */
export const $seatView = atom<string | null>(null);

/**
 * The current look DIRECTION in workspace coordinates (unit), or null before the seat has
 * been resolved to a pose — which reads as "face the seat's forward axis".
 *
 * The direction IS the state, exactly as it is in the game: `IVAController.OnFrame` keeps
 * the look on `Camera.LocalRotation`, applies the frame's mouse delta to THAT, and clamps
 * once. Holding a raw yaw/pitch accumulator here instead and recomposing the direction from
 * it every update would feed each clamp a fresh far-out direction that a single pass only
 * partially corrects — the clamps never see their own output, so they never converge and
 * the preview escapes both of them (measured: ~103° off forward, `|dot(look, up)| = 0.90`
 * against a 0.9 limit). Feeding the clamped result back is what makes the bound hold.
 */
export const $seatLook = atom<Vec3 | null>(null);

/**
 * The part entry {@link enterSeatView} was called in, or `''` outside seat view.
 *
 * Seat ids are per-part namespaces (I3 — `plans/MULTI_PART_PLAN.md` §0.5): part B may hold a
 * completely different seat under the SAME `_seat1` id, so "does the id still exist" is not
 * enough to notice a part switch. Pairing the id with the part it was entered in is what
 * makes the clamp below exit on EVERY switch rather than silently teleporting the camera into
 * whichever seat the incoming part happens to number the same.
 */
let seatViewPartEntryId = '';

/**
 * The camera teardown, with no knowledge of the tool slot. Idempotent, and deliberately
 * NOT a caller of `disarmTool` — it is the slot's own `onCancel`, so calling back into the
 * slot would either recurse or stomp the tool that just took the slot over.
 */
function teardownSeatView(): void {
  if ($seatView.get() === null) return;
  $seatView.set(null);
  $seatLook.set(null);
  seatViewPartEntryId = '';
}

/**
 * Seat view's tenancy of the single `$activeTool` slot (foundation §2.6 row 2).
 *
 * `survivesModeSwitch: true` and no `allowedModes`: it is a CAMERA state, not a
 * mode-local affordance — you can sit in a seat and then go read the part's GameData
 * without being ejected. Arming any OTHER tool (measure, marquee, exhaust) still cancels
 * it, because the slot holds exactly one tool.
 */
registerTool('seat-view', { survivesModeSwitch: true, onCancel: teardownSeatView });

/**
 * Sits in `seatId`, facing straight down its forward axis (the free-look resets), and
 * takes the tool slot — so measuring or box-selecting while seated cancels the preview
 * rather than fighting it for the pointer.
 */
export function enterSeatView(seatId: string): void {
  $seatLook.set(null);
  $seatView.set(seatId);
  seatViewPartEntryId = activePartEntryId();
  armTool('seat-view');
}

/** Leaves seat view. Safe to call when not in it. */
export function exitSeatView(): void {
  teardownSeatView();
  disarmTool('seat-view');
}

/**
 * Ends seat view the moment its seat stops existing.
 *
 * `survivesModeSwitch` deliberately keeps the camera seated across a mode change, so nothing
 * else was ever going to notice: before multi-part the seat could only vanish by being
 * deleted or by a project load, and `EditorScene` handled that as it resolved the pose. A
 * PART SWITCH is a third way, it happens through the same single `$part.set`, and it is the
 * one where a surviving id is actively dangerous (see {@link seatViewPartEntryId}).
 *
 * Module scope, next to the {@link registerTool} call, so seat view's whole lifecycle is
 * registered in one place and needs no boot wiring. The first (immediate) call is a no-op —
 * nothing can be seated before the app has run.
 */
$part.subscribe((part) => {
  const seatId = $seatView.get();
  if (seatId === null) return;
  if (seatViewPartEntryId !== activePartEntryId()) {
    exitSeatView();
    return;
  }
  if (!part.ivaSeats.some((seat) => seat.id === seatId)) exitSeatView();
});

/**
 * The direction the camera should point for a seat with these `axes`: the stored look, or
 * the seat's forward axis before the first {@link reclampSeatLook}. Always unit.
 */
export function seatLookDirection(axes: SeatAxes): Vec3 {
  const stored = $seatLook.get();
  if (stored) return stored;
  return normalizeOrNull(axes.forward) ?? { x: 1, y: 0, z: 0 };
}

/**
 * Applies one incremental pointer delta (radians) to the stored look and re-clamps it.
 *
 * The two rotation axes are the CAMERA's, not the seat's — `IVAController.OnFrame:69-78`
 * builds yaw about `Camera.GetUp()` and pitch about `Camera.GetRight()`, then composes
 * `qYaw · qPitch · LocalRotation`, i.e. pitch first, both axes read from the camera as it
 * was BEFORE this delta. `Camera.LookAtRotation` (`Camera.cs:190-196`) makes that basis
 * `right = look × up`, `camUp = right × look`, which is also what `camera.lookAt` gives us.
 *
 * A no-op outside seat view, so a stray pointer event can never leave a stale look behind
 * for the next entry.
 */
export function nudgeSeatLook(deltaYaw: number, deltaPitch: number, axes: SeatAxes): void {
  if ($seatView.get() === null) return;
  const dir = seatLookDirection(axes);
  // Degenerate only for a look sitting exactly on the up axis — which the clamps make
  // unreachable by dragging; any perpendicular keeps a degenerate seat draggable rather
  // than frozen (the game NaNs its camera there instead).
  const right = normalizeOrNull(cross(dir, axes.up)) ?? anyPerpendicular(dir);
  const camUp = normalizeOrNull(cross(right, dir)) ?? right;
  const pitched = rotateAboutAxis(dir, right, deltaPitch);
  const yawed = rotateAboutAxis(pitched, camUp, deltaYaw);
  $seatLook.set(clampSeatLook(yawed, axes.forward, axes.up));
}

/**
 * Re-runs the clamps against `axes` and stores the result. Called by the viewport whenever
 * the seat's pose lands on it: entering (which resolves the null "face forward" state to a
 * real direction) and any document change that moves or re-aims the seat under a seated
 * camera, either of which can leave a previously legal look outside the new limits.
 */
export function reclampSeatLook(axes: SeatAxes): void {
  if ($seatView.get() === null) return;
  const clamped = clampSeatLook(seatLookDirection(axes), axes.forward, axes.up);
  const stored = $seatLook.get();
  // Every reconcile pushes the pose again; skipping the no-op write keeps that from
  // invalidating a frame per document change.
  if (stored && near(stored, clamped)) return;
  $seatLook.set(clamped);
}

// --- Vector helpers. Duplicated from `ivaSeatAxes.ts` / `ivaLook.ts` rather than widening
// either module's API — the same ~20 lines of standard math those files already inline. ---

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Unit-length `v`, or `null` when `v` is (near) zero — where KSA would produce NaN. */
function normalizeOrNull(v: Vec3): Vec3 | null {
  const len = Math.hypot(v.x, v.y, v.z);
  if (!(len > 1e-12)) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** Some unit vector perpendicular to the UNIT `v` — cross with whichever axis `v` leans on least. */
function anyPerpendicular(v: Vec3): Vec3 {
  const seed = Math.abs(v.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  return normalizeOrNull(cross(v, seed)) ?? { x: 0, y: 1, z: 0 };
}

/** Rodrigues rotation of `v` about a UNIT `axis`, right-handed — as `QuaternionEx` does it. */
function rotateAboutAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  if (angle === 0) return v;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = cross(axis, v);
  const d = dot(axis, v) * (1 - c);
  return {
    x: v.x * c + k.x * s + axis.x * d,
    y: v.y * c + k.y * s + axis.y * d,
    z: v.z * c + k.z * s + axis.z * d,
  };
}

function near(a: Vec3, b: Vec3): boolean {
  return Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12 && Math.abs(a.z - b.z) < 1e-12;
}
