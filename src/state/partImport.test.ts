import { describe, expect, it } from 'vitest';
import { buildAnimationImportReport, type AnimationImportEntry } from './partImport';
import { identityTransform, type PartAnimation } from '../ksa/types';
import type { AnimationFitReport } from '../ksa/easingFit';

/**
 * The KSA import report's Animations block (design-animation-mode.md §11.3 item 3, P11E.02).
 *
 * `importBuiltInPart` itself needs a network fetch and a real `_Anim.glb`, so the report
 * assembly is a pure helper and THIS is what pins its wording: the numbers, the dense-fallback
 * joints named (not counted), the per-channel fit summary, and the two flags that change how
 * the clip behaves in the editor.
 */

function clip(over: Partial<PartAnimation> = {}): PartAnimation {
  return {
    id: 'anim_1',
    name: 'Deploy',
    durationSec: 2,
    mode: 'deployRetract',
    joints: [
      { id: 'j_hinge', name: 'Hinge', parentJointId: null, memberInstanceIds: ['panel_1'] },
      { id: 'j_strut', name: 'Strut', parentJointId: null, memberInstanceIds: ['strut_1'] },
    ],
    keyframes: [
      { id: 'kf0', timeSec: 0, poses: { j_hinge: identityTransform() } },
      { id: 'kf1', timeSec: 2, poses: { j_hinge: identityTransform() } },
    ],
    solarTracking: null,
    ...over,
  };
}

function fit(over: Partial<AnimationFitReport> = {}): AnimationFitReport {
  return {
    jointStats: [
      { jointId: 'j_hinge', kind: 'eased', easedChannels: ['rotation'] },
      { jointId: 'j_strut', kind: 'eased', easedChannels: ['position', 'rotation'] },
    ],
    keyframesIn: 61,
    keyframesOut: 2,
    ...over,
  };
}

const report = (entries: AnimationImportEntry[]) => buildAnimationImportReport(entries);

describe('buildAnimationImportReport', () => {
  it('reports the rig size and how much of the baked stream the fit kept', () => {
    const text = report([{ anim: clip(), report: fit() }]);
    expect(text).toContain('Deploy — 2 joints, 2 keyframes (fitted from 61 baked keys)');
  });

  it('summarises the per-channel fit by channel', () => {
    const text = report([{ anim: clip(), report: fit() }]);
    expect(text).toContain('eased channels: position ×1 · rotation ×2');
  });

  it('says so explicitly when nothing eased', () => {
    const text = report([
      {
        anim: clip(),
        report: fit({
          jointStats: [{ jointId: 'j_hinge', kind: 'const', easedChannels: [] }],
        }),
      },
    ]);
    expect(text).toContain('eased channels: none (all linear)');
  });

  it('NAMES the joints that kept their dense keys rather than counting them', () => {
    const text = report([
      {
        anim: clip(),
        report: fit({
          jointStats: [
            { jointId: 'j_hinge', kind: 'dense', easedChannels: [] },
            { jointId: 'j_strut', kind: 'eased', easedChannels: ['rotation'] },
          ],
        }),
      },
    ]);
    expect(text).toContain('dense keys kept (no curve fit): Hinge');
    expect(text).not.toContain('Strut,');
  });

  it('notes the deploy-clip rest anchor (restKeyframeId set ⇒ modeled deployed)', () => {
    const plain = report([{ anim: clip(), report: fit() }]);
    expect(plain).not.toContain('anchored at final keyframe');

    const deploy = report([{ anim: clip({ restKeyframeId: 'kf1' }), report: fit() }]);
    expect(deploy).toContain('anchored at final keyframe (modeled deployed)');
  });

  it('flags a CubicSpline-approximated clip', () => {
    const text = report([{ anim: clip({ cubicSplineApprox: true }), report: fit() }]);
    expect(text).toContain('CubicSpline sampling — imported approximately');
  });

  it('renders one block per clip', () => {
    const text = report([
      { anim: clip(), report: fit() },
      { anim: clip({ id: 'anim_2', name: 'Retract' }), report: fit() },
    ]);
    expect(text.split('\n\n')).toHaveLength(2);
    expect(text).toContain('Retract —');
  });
});
