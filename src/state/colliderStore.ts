import { atom } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';
import type { ColliderShape } from '../ksa/types';
import type { SamplePrecision } from '../three/samplePoints';
import type { CoverageReport } from '../measure/colliderCoverage';

/**
 * Ephemeral + persisted state for collider AUTHORING. The colliders themselves are
 * document state on `$part` (see `EditingPart.colliders`); this module holds only the
 * knobs and the fit "intent" channel.
 *
 * **Why an intent atom.** Fitting a collider needs world-space geometry, which only lives
 * in the three.js scene — and `src/state` and `src/ui` are deliberately three-free (see
 * docs/architecture.md). So a menu/button PUBLISHES a request here, `EditorScene`
 * (which owns the scene) consumes it, samples the geometry, runs the pure
 * `colliderFit.fitCollider`, and writes the result through `editorStore`. Same shape as
 * `$revealEntity`: the consumer clears the atom once handled.
 */

/** What a fit request should do with its result. */
export type ColliderFitTarget =
  /** Add a NEW collider of the requested shape. */
  | { kind: 'new' }
  /** Refit the EXISTING collider at this index, keeping its id and owner. */
  | { kind: 'existing'; index: number };

export interface ColliderFitRequest {
  shape: ColliderShape;
  target: ColliderFitTarget;
  /**
   * Fit around the current selection when true (the common case: "wrap that tank").
   * When nothing is selected — or this is false — the whole Part is used.
   */
  useSelection: boolean;
}

/** Pending fit request, consumed by `EditorScene`. Never persisted, never in undo. */
export const $colliderFitRequest = atom<ColliderFitRequest | null>(null);

/** Asks the 3D scene to fit a collider (see {@link $colliderFitRequest}). */
export function requestColliderFit(
  shape: ColliderShape,
  target: ColliderFitTarget = { kind: 'new' },
  useSelection = true,
): void {
  $colliderFitRequest.set({ shape, target, useSelection });
}

export interface ColliderSettings {
  /** How finely geometry is sampled when fitting. Vertex is exact but walks every buffer. */
  precision: SamplePrecision;
  /**
   * Fractional inset (negative) / outset (positive) applied to every fitted dimension.
   * Core habitually shaves ~0.7% off a mesh AABB, hence the ±% knob rather than a flag.
   */
  margin: number;
  /**
   * Fit in the last-selected placement's own rotated frame (so a tilted tank gets a tilted
   * cylinder) rather than world-aligned.
   */
  orientToSelection: boolean;
}

export const DEFAULT_COLLIDER_SETTINGS: ColliderSettings = {
  precision: 'bbox',
  margin: 0,
  orientToSelection: true,
};

/** Persisted authoring preferences (view state, not document state). */
export const $colliderSettings = persistentJSON<ColliderSettings>(
  'flexo:colliders',
  DEFAULT_COLLIDER_SETTINGS,
);

export function setColliderSettings(patch: Partial<ColliderSettings>): void {
  $colliderSettings.set({ ...$colliderSettings.get(), ...patch });
}

// ── coverage check ───────────────────────────────────────────────────────────
//
// Same intent → scene → store round trip as fitting: the check needs world geometry, which
// only exists in three.

/** Pending coverage-check request, consumed by `EditorScene`. */
export const $coverageRequest = atom<boolean>(false);

/** Asks the 3D scene to score the current collision volume against the part's geometry. */
export function requestCoverageCheck(): void {
  $coverageRequest.set(true);
}

/**
 * The most recent coverage result, or null when it has never run / was dismissed.
 * `EditorScene` also renders {@link CoverageReport.uncovered} as dots so the hole is
 * visible, not just counted.
 */
export const $coverageReport = atom<CoverageReport | null>(null);

export function setCoverageReport(report: CoverageReport | null): void {
  $coverageReport.set(report);
}

/** Clears the readout and its viewport dots. */
export function clearCoverageReport(): void {
  $coverageReport.set(null);
}
