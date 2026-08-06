import { describe, it, expect } from 'vitest';
import { identityTransform, type PartAnimation } from '../../ksa/types';
import {
  growOnlyColumnRange,
  marqueeColumns,
  resolveGesture,
  resolveRetimeDt,
  rulerSteps,
  snapCandidates,
  toggleColumn,
  type GestureModifiers,
  type TimelineHit,
} from './dopeSheetInteractions';

const NO_MODS: GestureModifiers = { shift: false, meta: false, ctrl: false, alt: false };

function clip(times: number[]): PartAnimation {
  return {
    id: 'anim',
    name: 'Deploy',
    durationSec: 3,
    mode: 'actuate',
    joints: [{ id: 'A', name: 'Hinge', parentJointId: null, memberInstanceIds: [] }],
    keyframes: times.map((t, i) => ({
      id: `k${i}`,
      timeSec: t,
      poses: { A: identityTransform() },
    })),
    solarTracking: null,
  };
}

const ruler: TimelineHit = { kind: 'ruler', timeSec: 1.2 };
const track: TimelineHit = { kind: 'track', timeSec: 1.2, rowIndex: 0 };
const diamond: TimelineHit = { kind: 'diamond', timeSec: 1, rowIndex: 0, kfId: 'k1' };
const segment: TimelineHit = { kind: 'segment', timeSec: 1.4, rowIndex: 0, kfId: 'k1' };

describe('resolveGesture — the §5.3 pointer table', () => {
  it('clicks park and drags scrub, on the ruler and on empty track alike', () => {
    expect(resolveGesture(ruler, NO_MODS, false)).toEqual({ kind: 'park', timeSec: 1.2 });
    expect(resolveGesture(track, NO_MODS, false)).toEqual({ kind: 'park', timeSec: 1.2 });
    expect(resolveGesture(ruler, NO_MODS, true)).toEqual({ kind: 'scrub' });
    expect(resolveGesture(track, NO_MODS, true)).toEqual({ kind: 'scrub' });
  });

  it('⇧-drag marquees over the tracks but still scrubs on the ruler', () => {
    const shift = { ...NO_MODS, shift: true };
    expect(resolveGesture(track, shift, true)).toEqual({ kind: 'marquee' });
    expect(resolveGesture(ruler, shift, true)).toEqual({ kind: 'scrub' });
  });

  it('selects a diamond by click, toggles with ⌘ and ranges with ⇧', () => {
    expect(resolveGesture(diamond, NO_MODS, false)).toEqual({
      kind: 'select-column',
      kfId: 'k1',
      mode: 'replace',
    });
    expect(resolveGesture(diamond, { ...NO_MODS, meta: true }, false)).toMatchObject({
      mode: 'toggle',
    });
    expect(resolveGesture(diamond, { ...NO_MODS, shift: true }, false)).toMatchObject({
      mode: 'range',
    });
  });

  it('a drag that starts on a diamond retimes the column', () => {
    expect(resolveGesture(diamond, NO_MODS, true)).toEqual({ kind: 'retime', kfId: 'k1' });
    // …even with ⇧ held: ⇧ only changes what a CLICK does, and marquee needs empty track.
    expect(resolveGesture(diamond, { ...NO_MODS, shift: true }, true)).toEqual({
      kind: 'retime',
      kfId: 'k1',
    });
  });

  it('a segment span selects its LEFT column on click and scrubs on drag', () => {
    expect(resolveGesture(segment, NO_MODS, false)).toEqual({
      kind: 'select-column',
      kfId: 'k1',
      mode: 'replace',
    });
    expect(resolveGesture(segment, NO_MODS, true)).toEqual({ kind: 'scrub' });
  });

  it('a cluster pill zooms into its columns', () => {
    const hit: TimelineHit = { kind: 'cluster', timeSec: 1, rowIndex: 0, kfIds: ['k1', 'k2'] };
    expect(resolveGesture(hit, NO_MODS, false)).toEqual({
      kind: 'zoom-cluster',
      kfIds: ['k1', 'k2'],
    });
  });
});

describe('column selection maths', () => {
  const order = ['k0', 'k1', 'k2', 'k3', 'k4'];

  it('⇧-click grows from the nearest selected column and never shrinks', () => {
    expect(growOnlyColumnRange('k3', order, ['k1'])).toEqual(['k1', 'k2', 'k3']);
    // Clicking INSIDE the selection fills the closest gap rather than trimming.
    expect(growOnlyColumnRange('k2', order, ['k0', 'k4'])).toEqual(['k0', 'k1', 'k2', 'k4']);
  });

  it('⇧-click with nothing selected is just a click', () => {
    expect(growOnlyColumnRange('k2', order, [])).toEqual(['k2']);
  });

  it('⌘-click toggles membership', () => {
    expect(toggleColumn('k2', ['k1'])).toEqual(['k1', 'k2']);
    expect(toggleColumn('k1', ['k1', 'k2'])).toEqual(['k2']);
  });

  it('marquee ADDS the swept columns, in timeline order', () => {
    const anim = clip([0, 1, 2, 3]);
    expect(marqueeColumns(anim, 2.4, 0.9, ['k3'])).toEqual(['k1', 'k2', 'k3']);
  });
});

describe('ruler + retime snapping', () => {
  it('picks tick steps that keep minor ticks ≥ 8px and major ≥ 60px apart', () => {
    expect(rulerSteps(200)).toEqual({ minor: 0.05, major: 0.5 });
    expect(rulerSteps(20)).toEqual({ minor: 0.5, major: 5 });
  });

  it('the ⌃ candidate set is the other keys + the playhead + both clip ends', () => {
    const anim = clip([0, 1, 2, 3]);
    expect(snapCandidates(anim, ['k2'], 1.5)).toEqual([0, 0, 1, 1.5, 3, 3]);
  });

  it('snaps to the ruler grid by default', () => {
    const dt = resolveRetimeDt({
      anchorTime: 1,
      rawDt: 0.37,
      pxPerSec: 200,
      gridSec: 0.05,
      ctrlHeld: false,
      candidates: [],
    });
    expect(1 + dt).toBeCloseTo(1.35, 6);
  });

  it('⌃ snaps to a nearby candidate…', () => {
    const dt = resolveRetimeDt({
      anchorTime: 1,
      rawDt: 0.97,
      pxPerSec: 200,
      gridSec: 0.05,
      ctrlHeld: true,
      candidates: [0, 2, 3],
    });
    expect(1 + dt).toBeCloseTo(2, 6);
  });

  it('…but never yanks a column from beyond the tolerance window', () => {
    const dt = resolveRetimeDt({
      anchorTime: 1,
      rawDt: 0.5,
      pxPerSec: 200, // 8px tolerance = 0.04s; the nearest candidate is 0.5s away
      gridSec: 0,
      ctrlHeld: true,
      candidates: [0, 2, 3],
    });
    expect(dt).toBeCloseTo(0.5, 6);
  });
});
