import { describe, it, expect } from 'vitest';
import { computeClipIssues } from './clipIssues';
import { isAnimationExportable } from './animationNaming';
import { createEmptyPart, createPartAnimation, identityTransform } from './types';
import type { EditingPart, PartAnimation, SubPartPlacement } from './types';

function pl(instanceId: string): SubPartPlacement {
  return {
    instanceId,
    subPartTemplateId: 'T',
    layerId: 'default',
    ...identityTransform(),
  };
}

/** A clip with one joint holding `members`, and `keyframes` columns over `durationSec`. */
function clip(
  id: string,
  opts: {
    members?: string[];
    columns?: number;
    lastTime?: number;
    jointName?: string;
    extraEmptyJoints?: number;
  } = {},
): PartAnimation {
  const a = createPartAnimation(id, id);
  const { members = [], columns = 2, lastTime = 1, jointName = 'Hinge' } = opts;
  a.joints.push({
    id: `${id}_j`,
    name: jointName,
    parentJointId: null,
    memberInstanceIds: members,
  });
  for (let i = 1; i < columns; i++) {
    a.keyframes.push({ id: `${id}_k${i}`, timeSec: (lastTime * i) / (columns - 1), poses: {} });
  }
  for (let i = 0; i < (opts.extraEmptyJoints ?? 0); i++) {
    a.joints.push({
      id: `${id}_e${i}`,
      name: `Empty${i}`,
      parentJointId: null,
      memberInstanceIds: [],
    });
  }
  return a;
}

function partWith(...anims: PartAnimation[]): EditingPart {
  const p = createEmptyPart();
  p.placements.push(pl('panel_1'), pl('panel_2'));
  p.animations.push(...anims);
  return p;
}

const idsOf = (issues: { id: string }[]) => issues.map((i) => i.id).sort();

describe('computeClipIssues', () => {
  it('a fresh empty clip reports all three blockers', () => {
    const p = createEmptyPart();
    p.animations.push(createPartAnimation('anim_1', 'Empty'));
    const issues = computeClipIssues(p)['anim_1'];
    expect(idsOf(issues.filter((i) => i.severity === 'blocker'))).toEqual([
      'needs-second-keyframe',
      'no-member-joint',
      'zero-duration',
    ]);
  });

  it('members + 2 keyframes + duration is clean', () => {
    const p = partWith(clip('anim_1', { members: ['panel_1'] }));
    expect(computeClipIssues(p)['anim_1']).toEqual([]);
  });

  it('warns per joint with no members, naming it', () => {
    const p = partWith(clip('anim_1', { members: ['panel_1'], extraEmptyJoints: 2 }));
    const warns = computeClipIssues(p)['anim_1'].filter((i) => i.id === 'joint-without-members');
    expect(warns).toHaveLength(2);
    expect(warns[0].message).toBe('joint "Empty0" has no members');
    expect(warns[0].jointId).toBe('anim_1_e0');
    expect(warns[0].severity).toBe('warning');
  });

  it('warns on BOTH clips when a SubPart is a member in two of them', () => {
    const p = partWith(
      clip('anim_1', { members: ['panel_1'] }),
      clip('anim_2', { members: ['panel_1', 'panel_2'] }),
    );
    const all = computeClipIssues(p);
    for (const id of ['anim_1', 'anim_2']) {
      const w = all[id].find((i) => i.id === 'multi-clip-member')!;
      expect(w.severity).toBe('warning');
      expect(w.instanceId).toBe('panel_1');
      expect(w.message).toBe(
        'SubPart panel_1 is a member in 2 clips — KSA modules will fight over it',
      );
    }
    // panel_2 is only in one clip → no warning for it
    expect(all['anim_2'].filter((i) => i.id === 'multi-clip-member')).toHaveLength(1);
  });

  it('warns when the solar-tracking target is dangling or not a member', () => {
    const dangling = clip('anim_1', { members: ['panel_1'] });
    dangling.solarTracking = {
      degreesPerSecond: 5,
      subPartInstanceId: 'ghost_9',
      excludeInstanceIds: [],
    };
    expect(
      computeClipIssues(partWith(dangling))['anim_1'].find((i) => i.id === 'solar-target-missing')!
        .message,
    ).toBe('solar tracking target missing / not a member');

    // present placement, but not driven by any joint → still wrong
    const notMember = clip('anim_2', { members: ['panel_1'] });
    notMember.solarTracking = {
      degreesPerSecond: 5,
      subPartInstanceId: 'panel_2',
      excludeInstanceIds: [],
    };
    expect(
      computeClipIssues(partWith(notMember))['anim_2'].some((i) => i.id === 'solar-target-missing'),
    ).toBe(true);

    // a real member is fine
    const ok = clip('anim_3', { members: ['panel_1'] });
    ok.solarTracking = {
      degreesPerSecond: 5,
      subPartInstanceId: 'panel_1',
      excludeInstanceIds: [],
    };
    expect(computeClipIssues(partWith(ok))['anim_3']).toEqual([]);
  });

  it('surfaces the CubicSpline import approximation', () => {
    const a = clip('anim_1', { members: ['panel_1'] });
    a.cubicSplineApprox = true;
    const w = computeClipIssues(partWith(a))['anim_1'].find((i) => i.id === 'cubicspline-approx')!;
    expect(w.severity).toBe('warning');
    expect(w.message).toBe('clip imported with CubicSpline sampling — approximated');
  });

  // The gate and the checklist may never drift: the exporter silently skips exactly the
  // clips this function marks with a blocker.
  it('blockers are empty ⇔ isAnimationExportable, across a matrix of clips', () => {
    const matrix: PartAnimation[] = [
      createPartAnimation('m0', 'empty'),
      clip('m1', { members: [] }),
      clip('m2', { members: ['panel_1'], columns: 1 }),
      clip('m3', { members: ['panel_1'], columns: 2, lastTime: 0 }),
      clip('m4', { members: ['panel_1'] }),
      clip('m5', { members: ['panel_1', 'panel_2'], columns: 4, lastTime: 3 }),
      clip('m6', { members: [], columns: 1, lastTime: 0 }),
    ];
    const p = partWith(...matrix);
    const all = computeClipIssues(p);
    for (const anim of matrix) {
      const blockers = all[anim.id].filter((i) => i.severity === 'blocker');
      expect(blockers.length === 0, anim.id).toBe(isAnimationExportable(anim));
    }
  });

  it('returns one entry per animation, even when clean', () => {
    const p = partWith(clip('anim_1', { members: ['panel_1'] }), clip('anim_2', { members: [] }));
    expect(Object.keys(computeClipIssues(p)).sort()).toEqual(['anim_1', 'anim_2']);
    expect(computeClipIssues(createEmptyPart())).toEqual({});
  });
});
