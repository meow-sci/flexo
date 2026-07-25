/**
 * Pre-flight validation for a Part's collision volume.
 *
 * Same two severities as {@link import('./engineValidation').validateEngines}, and the
 * difference is what the game does with the result:
 *  - **block** — the exported shape would be degenerate or would shadow another
 *    component's id. flexo must not ship it.
 *  - **warn**  — KSA loads it fine, but the part behaves in a way the author almost
 *    certainly didn't intend (passes through terrain, never docks, invisible walls).
 *
 * Every check names the game-side member it mirrors so a future KSA update can be
 * re-verified against the decomp rather than against this file's prose. Pure: no stores,
 * no React, no three.
 */

import { MIN_COLLIDER_SIZE_M } from './colliderSize'
import { COLLIDER_COMPONENT_ID } from './partXmlSerializer'
import type { EditingPart } from './types'

/** `block` ⇒ flexo refuses to export; `warn` ⇒ it exports but the part misbehaves. */
export type ColliderIssueSeverity = 'block' | 'warn'

export interface ColliderIssue {
  severity: ColliderIssueSeverity
  /** Stable kebab-case code — the UI and tests match on this, not on the prose. */
  code: string
  message: string
}

/**
 * More colliders than this on one Part is a performance smell: an animated subtree
 * rebuilds the vehicle's Bepu compound every time its transforms change
 * (`KeyframeAnimationModule.ApplyAnimationTransforms` → `ConstraintSim.UpdateShape`).
 */
const MANY_COLLIDERS = 32

export function validateColliders(part: EditingPart): ColliderIssue[] {
  const issues: ColliderIssue[] = []
  const block = (code: string, message: string) => issues.push({ severity: 'block', code, message })
  const warn = (code: string, message: string) => issues.push({ severity: 'warn', code, message })

  const placedTemplates = new Set(part.placements.map((p) => p.subPartTemplateId))

  for (const c of part.colliders) {
    // Checks the RAW document size, not the emitted dimensions: `colliderDimensions`
    // clamps, so reading through it would mask exactly the corruption this catches (a
    // hand-edited payload, or a decode that produced NaN). KSA feeds the value straight
    // into a Bepu shape constructor, and shipping a degenerate collidable is worse than
    // refusing to export.
    const bad = (['x', 'y', 'z'] as const).filter(
      (axis) => !Number.isFinite(c.scale[axis]) || c.scale[axis] < MIN_COLLIDER_SIZE_M,
    )
    if (bad.length > 0) {
      block(
        'collider-degenerate',
        `Collider "${c.id}" has a non-positive or non-finite size on ${bad.join(', ')} — ` +
          `KSA would build a degenerate ${c.shape} collidable from it.`,
      )
    }

    if (c.shape === 'Capsule' && c.scale.y < c.scale.x - 1e-9) {
      warn(
        'collider-capsule-degenerate',
        `Capsule "${c.id}" is shorter than its diameter, so it is just a sphere. ` +
          `Use a Sphere, or make it taller.`,
      )
    }

    if (c.ownerTemplateId && !placedTemplates.has(c.ownerTemplateId)) {
      warn(
        'collider-owner-unplaced',
        `Collider "${c.id}" is owned by "${c.ownerTemplateId}", which this Part doesn't ` +
          `place — it is dead data and will not be exported anywhere useful.`,
      )
    }

    // ColliderModule composes only position + rotation (ColliderModule.cs:38-42): the
    // owning placement's Scale is NEVER applied, so the in-game shape won't match the mesh.
    if (c.ownerTemplateId) {
      const scaled = part.placements.filter(
        (p) =>
          p.subPartTemplateId === c.ownerTemplateId &&
          (p.scale.x !== 1 || p.scale.y !== 1 || p.scale.z !== 1),
      )
      if (scaled.length > 0) {
        warn(
          'collider-owner-scaled',
          `Collider "${c.id}" is owned by a template placed with a non-unit scale ` +
            `(${scaled[0].instanceId}). KSA ignores placement scale for colliders, so the ` +
            `in-game shape will not match the mesh.`,
        )
      }
    }
  }

  // A `<Collider Id>` shares the id namespace `<FeedsFrom Container="…">` resolves against
  // (PartTemplate scans every Components[].Id), so a tank named the same as the emitted
  // collider component would make a feed resolve to a collision shape.
  const owners = new Set(part.colliders.map((c) => c.ownerTemplateId))
  if (owners.has(null) && part.gameData.tanks.some((t) => t.id === COLLIDER_COMPONENT_ID)) {
    block(
      'collider-id-collides-with-tank',
      `A part-level <Tank Id="${COLLIDER_COMPONENT_ID}"> collides with the collider ` +
        `component id — a <FeedsFrom Container> could resolve to the collision shape.`,
    )
  }
  for (const spd of part.subPartGameData) {
    if (!owners.has(spd.subPartTemplateId)) continue
    if (spd.tanks.some((t) => t.id === COLLIDER_COMPONENT_ID)) {
      block(
        'collider-id-collides-with-tank',
        `SubPart "${spd.subPartTemplateId}" has a <Tank Id="${COLLIDER_COMPONENT_ID}"> that ` +
          `collides with the collider component id on the same owner.`,
      )
    }
  }

  // A vehicle with ZERO colliders falls back to one Box from the render bounds
  // (Vehicle.cs:1523) — so a lone collider-less part still collides. Add ONE collider
  // anywhere in the vehicle and every collider-less part becomes non-collidable.
  if (part.colliders.length === 0 && part.placements.length > 0) {
    warn(
      'collider-none',
      `This Part has no collider. It will pass through terrain and other vehicles as soon ` +
        `as anything else in the vehicle has one.`,
    )
  }

  // Docking resolves the CONTACTED COLLIDER back to its Part, then looks for a DockingPort
  // module on it (ConstraintSim.cs:861-878). No collider ⇒ no contact ⇒ it never docks.
  if (part.gameData.dockingPort && part.colliders.length === 0) {
    warn(
      'collider-docking-port',
      `This Part has a docking port but no collider. KSA resolves a dock from the collider ` +
        `that made contact, so it will never dock.`,
    )
  }

  if (part.colliders.length > MANY_COLLIDERS) {
    warn(
      'collider-count',
      `${part.colliders.length} colliders — the vehicle's collision compound is rebuilt ` +
        `whenever an animated subpart moves, so keep the count low.`,
    )
  }

  return issues
}

/** True when any issue would stop the export. */
export function hasBlockingColliderIssue(issues: readonly ColliderIssue[]): boolean {
  return issues.some((i) => i.severity === 'block')
}
