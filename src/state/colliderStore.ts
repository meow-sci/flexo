import { atom } from 'nanostores'
import { persistentJSON } from '@nanostores/persistent'
import type { ColliderShape } from '../ksa/types'
import type { SamplePrecision } from '../three/samplePoints'

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
  | { kind: 'existing'; index: number }

export interface ColliderFitRequest {
  shape: ColliderShape
  target: ColliderFitTarget
  /**
   * Fit around the current selection when true (the common case: "wrap that tank").
   * When nothing is selected — or this is false — the whole Part is used.
   */
  useSelection: boolean
}

/** Pending fit request, consumed by `EditorScene`. Never persisted, never in undo. */
export const $colliderFitRequest = atom<ColliderFitRequest | null>(null)

/** Asks the 3D scene to fit a collider (see {@link $colliderFitRequest}). */
export function requestColliderFit(
  shape: ColliderShape,
  target: ColliderFitTarget = { kind: 'new' },
  useSelection = true,
): void {
  $colliderFitRequest.set({ shape, target, useSelection })
}

export interface ColliderSettings {
  /** How finely geometry is sampled when fitting. Vertex is exact but walks every buffer. */
  precision: SamplePrecision
  /**
   * Fractional inset (negative) / outset (positive) applied to every fitted dimension.
   * Core habitually shaves ~0.7% off a mesh AABB, hence the ±% knob rather than a flag.
   */
  margin: number
  /**
   * Fit in the last-selected placement's own rotated frame (so a tilted tank gets a tilted
   * cylinder) rather than world-aligned.
   */
  orientToSelection: boolean
}

export const DEFAULT_COLLIDER_SETTINGS: ColliderSettings = {
  precision: 'bbox',
  margin: 0,
  orientToSelection: true,
}

/** Persisted authoring preferences (view state, not document state). */
export const $colliderSettings = persistentJSON<ColliderSettings>(
  'flexo:colliders',
  DEFAULT_COLLIDER_SETTINGS,
)

export function setColliderSettings(patch: Partial<ColliderSettings>): void {
  $colliderSettings.set({ ...$colliderSettings.get(), ...patch })
}
