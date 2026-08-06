import type { EditingPart, PartAnimation } from './types';

/**
 * Per-clip export diagnostics — the ONE engine every animation surface consumes: the clip
 * row's draft chip, the Clip card's EXPORT checklist, the timeline's ⚠ hints, the Animation
 * mode attention dot and the Export-to-KSA pre-flight (design-animation-mode.md §11.1).
 *
 * Pure and UI-free (guardrail 9): no store, no react, no three.
 *
 * **Blockers mirror `isAnimationExportable` (`src/ksa/animationNaming.ts`) exactly** — they
 * are computed from the same three predicates, so the exporter's silent skip and the
 * user-facing checklist can never drift (`clipIssues.test.ts` pins the equivalence as a
 * property test). Everything else is a WARNING: the clip still exports, it just probably
 * misbehaves in-game.
 */

export interface ClipIssue {
  id:
    | 'no-member-joint'
    | 'needs-second-keyframe'
    | 'zero-duration'
    | 'joint-without-members'
    | 'multi-clip-member'
    | 'solar-target-missing'
    | 'cubicspline-approx';
  severity: 'blocker' | 'warning';
  /** User-facing text, verbatim from the design. */
  message: string;
  /** The joint this issue is about (`joint-without-members`). */
  jointId?: string;
  /** The SubPart this issue is about (`multi-clip-member` / `solar-target-missing`). */
  instanceId?: string;
}

/** Every instance id driven by any joint of `anim`. */
function memberIds(anim: PartAnimation): Set<string> {
  const out = new Set<string>();
  for (const j of anim.joints) for (const id of j.memberInstanceIds) out.add(id);
  return out;
}

/**
 * Diagnostics for every clip on the part, keyed by animation id (always one entry per
 * animation, possibly an empty array).
 */
export function computeClipIssues(part: EditingPart): Record<string, ClipIssue[]> {
  // How many clips drive each SubPart — ≥2 means two KeyframeAnimationModules would fight
  // over its transform every frame (census §8 open question 12: warn, never block).
  const clipsPerMember = new Map<string, number>();
  for (const anim of part.animations)
    for (const id of memberIds(anim)) clipsPerMember.set(id, (clipsPerMember.get(id) ?? 0) + 1);

  const out: Record<string, ClipIssue[]> = {};
  for (const anim of part.animations) {
    const issues: ClipIssue[] = [];

    // ── blockers (the exporter skips the clip) ────────────────────────────────
    if (!anim.joints.some((j) => j.memberInstanceIds.length > 0)) {
      issues.push({
        id: 'no-member-joint',
        severity: 'blocker',
        message: 'needs a joint with members',
      });
    }
    if (anim.keyframes.length < 2) {
      issues.push({
        id: 'needs-second-keyframe',
        severity: 'blocker',
        message: 'needs a 2nd keyframe',
      });
    }
    if (!(Math.max(0, ...anim.keyframes.map((k) => k.timeSec)) > 0)) {
      issues.push({ id: 'zero-duration', severity: 'blocker', message: 'duration must be > 0' });
    }

    // ── warnings (the clip exports, but probably misbehaves) ──────────────────
    for (const j of anim.joints) {
      if (j.memberInstanceIds.length === 0) {
        issues.push({
          id: 'joint-without-members',
          severity: 'warning',
          message: `joint "${j.name}" has no members`,
          jointId: j.id,
        });
      }
    }
    for (const id of memberIds(anim)) {
      const n = clipsPerMember.get(id) ?? 1;
      if (n >= 2) {
        issues.push({
          id: 'multi-clip-member',
          severity: 'warning',
          message: `SubPart ${id} is a member in ${n} clips — KSA modules will fight over it`,
          instanceId: id,
        });
      }
    }
    const solar = anim.solarTracking;
    if (solar) {
      const target = solar.subPartInstanceId;
      const exists = part.placements.some((p) => p.instanceId === target);
      if (!target || !exists || !memberIds(anim).has(target)) {
        issues.push({
          id: 'solar-target-missing',
          severity: 'warning',
          message: 'solar tracking target missing / not a member',
          instanceId: target || undefined,
        });
      }
    }
    if (anim.cubicSplineApprox) {
      issues.push({
        id: 'cubicspline-approx',
        severity: 'warning',
        message: 'clip imported with CubicSpline sampling — approximated',
      });
    }

    out[anim.id] = issues;
  }
  return out;
}
