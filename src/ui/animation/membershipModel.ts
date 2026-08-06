import type { PartAnimation } from '../../ksa/types';
import type { ClipIssue } from '../../ksa/clipIssues';
import type { SubPartOwner } from '../subPartSetModel';

/**
 * The two membership lookups every Animation surface needs — the Members view's rows, the
 * joint card's member list and the solar target's readable labels (design-animation-mode.md
 * §6.4, §7.3). Pure, so the three consumers can never derive ownership differently.
 */

/** instanceId → the joint of `anim` that drives it (membership is exclusive within a clip). */
export function ownershipOf(anim: PartAnimation | null): Map<string, SubPartOwner> {
  const out = new Map<string, SubPartOwner>();
  for (const joint of anim?.joints ?? [])
    for (const id of joint.memberInstanceIds)
      out.set(id, { jointId: joint.id, jointName: joint.name });
  return out;
}

/**
 * instanceId → the name of ANOTHER clip that also drives it (the amber `⚠ also in "<clip>"`
 * chip). WHICH ids conflict comes from `computeClipIssues`'s `multi-clip-member` warning, so
 * the chip and the export diagnostics can never disagree; only the other clip's NAME is
 * resolved here.
 */
export function conflictClipsOf(
  animations: readonly PartAnimation[],
  anim: PartAnimation | null,
  issues: readonly ClipIssue[],
): Map<string, string> {
  const out = new Map<string, string>();
  if (!anim) return out;
  for (const issue of issues) {
    const instanceId = issue.instanceId;
    if (issue.id !== 'multi-clip-member' || !instanceId) continue;
    const other = animations.find(
      (a) => a.id !== anim.id && a.joints.some((j) => j.memberInstanceIds.includes(instanceId)),
    );
    if (other) out.set(instanceId, other.name);
  }
  return out;
}

/** Document-order joint rows with their tree depth — the indented target/parent selects. */
export function jointOptions(anim: PartAnimation): { id: string; name: string; depth: number }[] {
  const parentOf = new Map(anim.joints.map((j) => [j.id, j.parentJointId]));
  const depthOf = (id: string): number => {
    let depth = 0;
    const seen = new Set<string>([id]);
    let cur = parentOf.get(id) ?? null;
    // Cycle- and missing-parent-safe, like `dopeSheetModel.ancestorsOf`: a corrupt chain must
    // render, not hang.
    while (cur && parentOf.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      depth++;
      cur = parentOf.get(cur) ?? null;
    }
    return depth;
  };
  return anim.joints.map((j) => ({ id: j.id, name: j.name, depth: depthOf(j.id) }));
}
