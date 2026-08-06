import { describe, it, expect } from 'vitest';
import { identityTransform, type PartAnimation, type Transform } from '../../ksa/types';
import { anchorColumnId, buildDopeSheetModel, summaryMarks } from './dopeSheetModel';

/**
 * The design §17 "column significance (◆/◇) rule" test, plus the anchor flag, the collapsed
 * parent aggregate and the four segment-summary shapes.
 */

function pose(y: number): Transform {
  return { ...identityTransform(), rotation: { x: 0, y, z: 0 } };
}

/**
 * Two joints (`A` root, `B` child of `A`) over four columns at 0/1/2/3 s, posed from the
 * per-joint rotation tables passed in.
 */
function clip(a: number[], b: number[]): PartAnimation {
  return {
    id: 'anim',
    name: 'Deploy',
    durationSec: 3,
    mode: 'actuate',
    joints: [
      { id: 'A', name: 'HingeL', parentJointId: null, memberInstanceIds: ['p1', 'p2'] },
      { id: 'B', name: 'TipL', parentJointId: 'A', memberInstanceIds: [] },
    ],
    keyframes: a.map((ya, i) => ({
      id: `k${i}`,
      timeSec: i,
      poses: { A: pose(ya), B: pose(b[i]) },
    })),
    solarTracking: null,
  };
}

describe('buildDopeSheetModel — column significance (◆/◇)', () => {
  it('marks a joint ◆ where its pose changes and ◇ where it holds', () => {
    // A moves out of column 0 and again at 2; B holds through columns 1–2 then moves at 3.
    const { columns, rows } = buildDopeSheetModel(clip([0, 10, 20, 20], [0, 0, 0, 45]), {});
    expect(columns.map((c) => c.timeSec)).toEqual([0, 1, 2, 3]);
    const a = rows.find((r) => r.jointId === 'A')!;
    const b = rows.find((r) => r.jointId === 'B')!;
    // Column 0 is ◆ for A (it has outgoing motion) and ◇ for B (nothing leaves it).
    expect(a.marks).toEqual(['move', 'move', 'move', 'hold']);
    expect(b.marks).toEqual(['hold', 'hold', 'hold', 'move']);
  });

  it('a fully static joint is ◇ everywhere, and the ∑ row ORs the joints', () => {
    const { rows, ...model } = buildDopeSheetModel(clip([0, 0, 0, 0], [0, 5, 5, 5]), {});
    expect(rows.find((r) => r.jointId === 'A')!.marks).toEqual(['hold', 'hold', 'hold', 'hold']);
    expect(summaryMarks({ rows, ...model })).toEqual(['move', 'move', 'hold', 'hold']);
  });

  it('a single-column clip has no motion to compare against', () => {
    const anim = clip([0], [0]);
    anim.keyframes = anim.keyframes.slice(0, 1);
    const { rows } = buildDopeSheetModel(anim, {});
    expect(rows.every((r) => r.marks.every((m) => m === 'hold'))).toBe(true);
  });
});

describe('buildDopeSheetModel — rows, depth and collapse', () => {
  it('indents by the parent chain and reports member counts', () => {
    const { rows } = buildDopeSheetModel(clip([0, 1, 2, 3], [0, 0, 0, 0]), {});
    expect(rows.map((r) => [r.jointId, r.depth, r.memberCount])).toEqual([
      ['A', 0, 2],
      ['B', 1, 0],
    ]);
    // The disclosure caret follows CHILDREN, not the collapse state — an expanded parent
    // still needs a caret to collapse with.
    expect(rows.map((r) => r.hasChildren)).toEqual([true, false]);
  });

  it('a collapsed parent hides its child row and aggregates the child’s moves', () => {
    const { rows } = buildDopeSheetModel(clip([0, 0, 0, 0], [0, 0, 0, 45]), { A: true });
    expect(rows.map((r) => r.jointId)).toEqual(['A']);
    const a = rows[0];
    expect(a.collapsed).toBe(true);
    expect(a.aggregated).toBe(true);
    // A itself never moves; the aggregate reports the child's ◆ at the final column.
    expect(a.marks).toEqual(['hold', 'hold', 'hold', 'move']);
  });

  it('survives a corrupt parent cycle rather than hanging', () => {
    const anim = clip([0, 1, 2, 3], [0, 0, 0, 0]);
    anim.joints[0].parentJointId = 'B'; // A → B → A
    expect(buildDopeSheetModel(anim, {}).rows).toHaveLength(2);
  });
});

describe('buildDopeSheetModel — anchor flag', () => {
  it('defaults the ⚓ to the earliest column', () => {
    const { columns } = buildDopeSheetModel(clip([0, 1, 2, 3], [0, 0, 0, 0]), {});
    expect(columns.filter((c) => c.isAnchor).map((c) => c.kfId)).toEqual(['k0']);
    expect(columns[0].isRest0).toBe(true);
  });

  it('marks the LAST column on a deploy-style clip (modeled deployed)', () => {
    const anim = clip([0, 1, 2, 3], [0, 0, 0, 0]);
    anim.restKeyframeId = 'k3';
    expect(anchorColumnId(anim)).toBe('k3');
    const { columns } = buildDopeSheetModel(anim, {});
    expect(columns.map((c) => c.isAnchor)).toEqual([false, false, false, true]);
  });

  it('falls back to the earliest column when the stored anchor id is stale', () => {
    const anim = clip([0, 1, 2, 3], [0, 0, 0, 0]);
    anim.restKeyframeId = 'gone';
    expect(anchorColumnId(anim)).toBe('k0');
  });
});

describe('buildDopeSheetModel — segment easing summaries', () => {
  const base = () => clip([0, 1, 2, 3], [0, 0, 0, 0]);

  it('linear segments summarise as null (easing is stored ABSENT)', () => {
    const { rows } = buildDopeSheetModel(base(), {});
    expect(rows[0].segments).toEqual([null, null, null]);
  });

  it('a uniform preset reports the preset name', () => {
    const anim = base();
    const cfg = { kind: 'preset', preset: 'easeInOut' } as const;
    anim.keyframes[1].easings = { A: { position: cfg, rotation: cfg, scale: cfg } };
    expect(buildDopeSheetModel(anim, {}).rows[0].segments).toEqual([null, 'easeInOut', null]);
  });

  it('a uniform off-preset curve reports "custom"', () => {
    const anim = base();
    const cfg = { kind: 'cubicBezier', x1: 0.9, y1: 0.1, x2: 0.1, y2: 0.9 } as const;
    anim.keyframes[0].easings = { A: { position: cfg, rotation: cfg, scale: cfg } };
    expect(buildDopeSheetModel(anim, {}).rows[0].segments).toEqual(['custom', null, null]);
  });

  it('channels that disagree report "per-channel"', () => {
    const anim = base();
    anim.keyframes[0].easings = { A: { rotation: { kind: 'preset', preset: 'easeIn' } } };
    expect(buildDopeSheetModel(anim, {}).rows[0].segments).toEqual(['per-channel', null, null]);
  });

  it('a collapsed parent folds disagreeing subtree labels into "per-channel"', () => {
    const anim = base();
    const inOut = { kind: 'preset', preset: 'easeInOut' } as const;
    const easeIn = { kind: 'preset', preset: 'easeIn' } as const;
    anim.keyframes[0].easings = {
      A: { position: inOut, rotation: inOut, scale: inOut },
      B: { position: easeIn, rotation: easeIn, scale: easeIn },
    };
    expect(buildDopeSheetModel(anim, { A: true }).rows[0].segments).toEqual([
      'per-channel',
      null,
      null,
    ]);
  });
});
