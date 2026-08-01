import { atom } from 'nanostores';

/**
 * Ephemeral state for IVA-seat AUTHORING. The seats themselves are document state on
 * `$part` (see `EditingPart.ivaSeats`); this module holds only the "aim" intent channel.
 *
 * **Why an intent atom.** Aiming a seat at the current selection needs world-space
 * geometry — the centroid of the selected placements — which only lives in the three.js
 * scene, and `src/state` and `src/ui` are deliberately three-free (see
 * docs/architecture.md). So the inspector PUBLISHES a request here, `EditorScene` (which
 * owns the scene) consumes it, computes the centroid, derives the seat rotation through
 * the pure `src/ksa/ivaSeatAxes.seatRotationFromAxes`, and writes it back with
 * `editorStore.aimIvaSeat` (which records the single undo step).
 *
 * Same shape as `colliderStore.$colliderFitRequest` and `$revealEntity`: the consumer
 * clears the atom once handled. Never persisted, never in undo — the DOCUMENT change the
 * request eventually causes is what enters history, through `aimIvaSeat`.
 *
 * Purely persisted seat VIEW preferences (marker size, gaze cone) are not here — they
 * live with the other view settings in `settingsStore.ts`.
 */

export interface IvaSeatAimRequest {
  /** Index into `EditingPart.ivaSeats` of the seat to re-aim. */
  index: number;
  /**
   * Keep the seat's current up axis when the new forward leaves it usable (non-parallel),
   * rather than deriving a fresh one. True for the inspector's button: re-aiming a seat
   * shouldn't silently roll the camera.
   */
  keepUp: boolean;
}

/** Pending aim request, consumed by `EditorScene`. Never persisted, never in undo. */
export const $ivaSeatAimRequest = atom<IvaSeatAimRequest | null>(null);

/** Asks the 3D scene to aim seat `index` at the current selection (see {@link $ivaSeatAimRequest}). */
export function requestIvaSeatAim(index: number, keepUp = true): void {
  if (index < 0) return;
  $ivaSeatAimRequest.set({ index, keepUp });
}

/** Drops a pending aim request — called by the consumer once it has been handled. */
export function clearIvaSeatAimRequest(): void {
  $ivaSeatAimRequest.set(null);
}
