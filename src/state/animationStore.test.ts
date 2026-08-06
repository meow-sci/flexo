import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  $part,
  undo,
  redo,
  exportHistory,
  importHistory,
  clearSelection,
  select,
} from './editorStore';
import { $mode, setMode } from './modeStore';
import { $toolMode } from './editorStore';
import { createEmptyPart } from '../ksa/types';
import type { PartAnimation, SubPartPlacement, Transform } from '../ksa/types';
import { matrixFromTransform } from '../three/coords';
import {
  jointWorld,
  previewOverrideMatrix,
  restAnchorTime,
  sampleJointLocal,
} from '../ksa/animationRig';
import {
  $activeAnimationId,
  $activeJointId,
  $editKeyframeId,
  $animClipboard,
  $animPlaying,
  $jointPoseClipboard,
  $animScrubbing,
  $isPoseEditing,
  $membersView,
  $playheadParked,
  $playheadSec,
  $timelineSelection,
  $workingPivot,
  addAnimation,
  addJoint,
  attachToJoint,
  addKeyframe,
  beginScrub,
  closeMembersView,
  copyJointPose,
  copyKeyframes,
  duplicateAnimation,
  endScrub,
  initAnimationStore,
  moveKeyframes,
  openMembersView,
  parkPlayhead,
  pasteJointPose,
  pasteKeyframesAtPlayhead,
  pausePreview,
  detachMembers,
  paintMemberOnTarget,
  removeJoint,
  removeKeyframe,
  reorderJoint,
  reorientJointPivot,
  removeKeyframes,
  resetJointPoseToCurve,
  returnToRest,
  scrubTo,
  selectKeyframeForEditing,
  setJointChannelEasing,
  setJointPose,
  setJointParent,
  setAnimationDuration,
  setJointPivot,
  setLatched,
  setRestAnchor,
  moveJointPivot,
  setJointSegmentEasing,
  setSegmentEasingAllJoints,
  stepPlayhead,
  stepToKeyframe,
} from './animationStore';

const anim0 = () => $part.get().animations[0];

beforeEach(() => {
  $part.set(createEmptyPart());
  importHistory({ undo: [], redo: [] });
  $activeAnimationId.set(null);
  $activeJointId.set(null);
  $editKeyframeId.set(null);
  $animScrubbing.set(false);
  $animPlaying.set(false);
  clearSelection();
  $mode.set('build');
});

// ── pivot test helpers ─────────────────────────────────────────────────────────
const I3 = { x: 1, y: 1, z: 1 };
function tf(
  over: {
    pos?: [number, number, number];
    rot?: [number, number, number];
    scale?: [number, number, number];
  } = {},
): Transform {
  const [px, py, pz] = over.pos ?? [0, 0, 0];
  const [rx, ry, rz] = over.rot ?? [0, 0, 0];
  const [sx, sy, sz] = over.scale ?? [1, 1, 1];
  return {
    position: { x: px, y: py, z: pz },
    rotation: { x: rx, y: ry, z: rz },
    scale: { x: sx, y: sy, z: sz },
  };
}
function pl(instanceId: string, t: Transform): SubPartPlacement {
  return { instanceId, subPartTemplateId: 'T', layerId: 'default', ...t };
}
function positionOf(m: THREE.Matrix4): [number, number, number] {
  const p = new THREE.Vector3().setFromMatrixPosition(m);
  return [p.x, p.y, p.z];
}
function expectMatrixClose(a: THREE.Matrix4, b: THREE.Matrix4): void {
  for (let i = 0; i < 16; i++) expect(a.elements[i]).toBeCloseTo(b.elements[i], 5);
}
/** Each keyframe's pose for a joint, in time order. */
function jointPoses(anim: PartAnimation, jid: string): Transform[] {
  return [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec).map((k) => k.poses[jid]);
}
function expectPosesClose(a: Transform[], b: Transform[]): void {
  expect(a.length).toBe(b.length);
  a.forEach((pa, i) => expectMatrixClose(matrixFromTransform(pa), matrixFromTransform(b[i])));
}
function restKeyframeId(anim: PartAnimation): string {
  return anim.keyframes.find((k) => k.timeSec === 0)!.id;
}

/** A door: panel at x=1, a root joint (rest pivot at origin), 90°-about-Y pose at t=1. */
function setupDoor() {
  $part.set({ ...createEmptyPart(), placements: [pl('panel_1', tf({ pos: [1, 0, 0] }))] });
  const aid = addAnimation('Door', 'actuate');
  const jid = addJoint(aid, 'Hinge'); // no selection → rest pivot at origin (the "bug" baseline)
  attachToJoint(aid, jid, ['panel_1']);
  const kid = addKeyframe(aid, 1);
  setJointPose(aid, kid, jid, tf({ rot: [0, Math.PI / 2, 0] }));
  return { aid, jid, kid };
}

/** A 2-link chain: hip(root) → knee(local +x 1) → foot leaf at part-space x=2; hip turns 90° at t=1. */
function setupLeg() {
  $part.set({ ...createEmptyPart(), placements: [pl('foot_1', tf({ pos: [2, 0, 0] }))] });
  const aid = addAnimation('Leg');
  const hip = addJoint(aid, 'Hip');
  const knee = addJoint(aid, 'Knee', hip);
  setJointPose(aid, restKeyframeId(anim0()), knee, tf({ pos: [1, 0, 0] }));
  attachToJoint(aid, knee, ['foot_1']);
  const kid = addKeyframe(aid, 1);
  setJointPose(aid, kid, hip, tf({ rot: [0, Math.PI / 2, 0] }));
  setJointPose(aid, kid, knee, tf({ pos: [1, 0, 0] }));
  return { aid, hip, knee, kid };
}

describe('animationStore', () => {
  it('adds an animation and makes it active (undoable)', () => {
    const id = addAnimation('Door', 'deployRetract');
    expect($part.get().animations).toHaveLength(1);
    expect($activeAnimationId.get()).toBe(id);
    expect(anim0().mode).toBe('deployRetract');
    undo();
    expect($part.get().animations).toHaveLength(0);
    redo();
    expect($part.get().animations).toHaveLength(1);
  });

  it('adds a joint with an identity rest pose in every keyframe', () => {
    const aid = addAnimation('A');
    const jid = addJoint(aid, 'Hinge');
    const a = anim0();
    expect(a.joints).toHaveLength(1);
    // every keyframe (just the rest one) carries a pose for the new joint
    expect(a.keyframes.every((k) => k.poses[jid])).toBe(true);
  });

  it('attaching to a joint moves the part off any other joint in the same animation', () => {
    $part.set({ ...createEmptyPart(), placements: [pl('panel_1', tf())] });
    const aid = addAnimation('A');
    const j1 = addJoint(aid, 'J1');
    const j2 = addJoint(aid, 'J2');
    attachToJoint(aid, j1, ['panel_1']);
    expect(anim0().joints.find((j) => j.id === j1)!.memberInstanceIds).toContain('panel_1');
    attachToJoint(aid, j2, ['panel_1']);
    expect(anim0().joints.find((j) => j.id === j1)!.memberInstanceIds).not.toContain('panel_1');
    expect(anim0().joints.find((j) => j.id === j2)!.memberInstanceIds).toContain('panel_1');
  });

  it('adds a keyframe seeded with a pose for each joint and keeps t=0 first', () => {
    const aid = addAnimation('A');
    const jid = addJoint(aid, 'J');
    addKeyframe(aid, 1);
    const a = anim0();
    expect(a.keyframes).toHaveLength(2);
    const sorted = [...a.keyframes].sort((x, y) => x.timeSec - y.timeSec);
    expect(sorted[0].timeSec).toBe(0);
    expect(sorted[1].timeSec).toBeCloseTo(1);
    expect(sorted[1].poses[jid]).toBeTruthy();
  });

  it('captures a joint pose (streaming — no extra undo step)', () => {
    const aid = addAnimation('A');
    const jid = addJoint(aid, 'J');
    const kid = addKeyframe(aid, 1);
    setJointPose(aid, kid, jid, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 1.5, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    const kf = anim0().keyframes.find((k) => k.id === kid)!;
    expect(kf.poses[jid].rotation.y).toBeCloseTo(1.5);
  });

  it('never removes the rest (t=0) keyframe', () => {
    const aid = addAnimation('A');
    const rest = anim0().keyframes[0];
    removeKeyframe(aid, rest.id);
    expect(anim0().keyframes).toHaveLength(1);
  });

  it('rescales keyframe times when the duration changes', () => {
    const aid = addAnimation('A');
    addJoint(aid, 'J');
    const kid = addKeyframe(aid, 1); // at t=1 (duration 1)
    setAnimationDuration(aid, 2);
    const kf = anim0().keyframes.find((k) => k.id === kid)!;
    expect(kf.timeSec).toBeCloseTo(2);
    expect(anim0().durationSec).toBeCloseTo(2);
  });

  it('refuses to parent a joint to itself (cycle guard)', () => {
    const aid = addAnimation('A');
    const jid = addJoint(aid, 'J');
    setJointParent(aid, jid, jid);
    expect(anim0().joints.find((j) => j.id === jid)!.parentJointId).toBeNull();
  });
});

describe('animationStore — clip/joint/keyframe actions v2 (§4.3)', () => {
  it('duplicateAnimation clones with fresh ids and remaps every reference (one undo step)', () => {
    const { aid, jid, kid } = setupDoor();
    setJointSegmentEasing(aid, restKeyframeId(anim0()), jid, {
      kind: 'preset',
      preset: 'easeInOut',
    });
    setRestAnchor(aid, kid);
    const before = $part.get().animations.length;

    const copyId = duplicateAnimation(aid)!;
    const copy = $part.get().animations.find((a) => a.id === copyId)!;
    const src = $part.get().animations.find((a) => a.id === aid)!;
    expect($part.get().animations).toHaveLength(before + 1);
    expect(copy.name).toBe('Door (copy)');
    expect(copy.id).not.toBe(src.id);
    expect(copy.joints[0].id).not.toBe(src.joints[0].id);
    expect(copy.keyframes.map((k) => k.id)).not.toEqual(src.keyframes.map((k) => k.id));
    // pose + easing maps are keyed by the NEW joint id, and the anchor points at the copy's kf
    const copyJoint = copy.joints[0].id;
    expect(copy.keyframes.every((k) => !!k.poses[copyJoint])).toBe(true);
    const copyRest = copy.keyframes.find((k) => k.timeSec === 0)!;
    expect(copyRest.easings?.[copyJoint]).toBeTruthy();
    expect(copy.keyframes.some((k) => k.id === copy.restKeyframeId)).toBe(true);
    // members are the same placements (verbatim)
    expect(copy.joints[0].memberInstanceIds).toEqual(['panel_1']);
    expect($activeAnimationId.get()).toBe(copyId);
    undo();
    expect($part.get().animations).toHaveLength(before);
  });

  it("setAnimationDuration 'keepTimes' leaves times alone and clamps to the last keyframe", () => {
    const { aid } = setupDoor(); // keyframes at 0 and 1
    setAnimationDuration(aid, 3, 'keepTimes');
    expect(anim0().durationSec).toBeCloseTo(3);
    expect(
      anim0()
        .keyframes.map((k) => k.timeSec)
        .sort(),
    ).toEqual([0, 1]);
    setAnimationDuration(aid, 0.5, 'keepTimes'); // below the last keyframe → clamps up
    expect(anim0().durationSec).toBeCloseTo(1);
  });

  it('removeKeyframes refuses t=0 and the rest anchor, and batches into ONE undo step', () => {
    const { aid, kid } = setupDoor();
    const mid = addKeyframe(aid, 0.5);
    setRestAnchor(aid, kid); // deploy-style: the anchor is the LAST column
    const restId = restKeyframeId(anim0());
    const historyBefore = exportHistory().undo.length;

    const res = removeKeyframes(aid, [restId, kid, mid]);
    expect(res).toEqual({ removed: 1, skipped: 2 });
    expect(
      anim0()
        .keyframes.map((k) => k.id)
        .sort(),
    ).toEqual([restId, kid].sort());
    expect(exportHistory().undo.length).toBe(historyBefore + 1);
  });

  it('moveKeyframes keeps relative offsets under clamping and blocks t=0', () => {
    const { aid } = setupDoor(); // duration 1, columns at 0 and 1
    const a = addKeyframe(aid, 0.3);
    const b = addKeyframe(aid, 0.5);
    const restId = restKeyframeId(anim0());
    const res = moveKeyframes(aid, [restId, a, b], 0.9); // clamped by b hitting duration
    expect(res.blocked).toBe(true); // t=0 was in the set
    const at = (id: string) => anim0().keyframes.find((k) => k.id === id)!.timeSec;
    expect(at(restId)).toBe(0);
    expect(at(b)).toBeCloseTo(1);
    expect(at(b) - at(a)).toBeCloseTo(0.2); // offset preserved
  });

  it('copy/paste lands at the playhead, replaces collisions, and seeds missing joints', () => {
    const { aid, jid, kid } = setupDoor();
    const other = addJoint(aid, 'Other');
    copyKeyframes([kid]);
    expect($animClipboard.get()!.columns).toHaveLength(1);

    $activeAnimationId.set(aid);
    parkPlayhead(0.5);
    const historyBefore = exportHistory().undo.length;
    const res = pasteKeyframesAtPlayhead();
    expect(res.pasted).toBe(1);
    expect(exportHistory().undo.length).toBe(historyBefore + 1);
    const pasted = anim0().keyframes.find((k) => Math.abs(k.timeSec - 0.5) < 1e-9)!;
    // the copied joint's pose came from the clipboard verbatim…
    expect(pasted.poses[jid].rotation.y).toBeCloseTo(Math.PI / 2);
    // …and the joint the clipboard also carried stays on-curve
    expect(pasted.poses[other]).toBeTruthy();

    // pasting onto an existing column REPLACES it, keeping its id
    parkPlayhead(0.5);
    pasteKeyframesAtPlayhead();
    expect(anim0().keyframes.filter((k) => Math.abs(k.timeSec - 0.5) < 1e-9)).toHaveLength(1);
    expect(anim0().keyframes.find((k) => Math.abs(k.timeSec - 0.5) < 1e-9)!.id).toBe(pasted.id);
  });

  it('setRestAnchor stores the id, and deletes the field when pointed at the earliest', () => {
    const { aid, kid } = setupDoor();
    setRestAnchor(aid, kid);
    expect(anim0().restKeyframeId).toBe(kid);
    setRestAnchor(aid, restKeyframeId(anim0()));
    expect(anim0().restKeyframeId).toBeUndefined();
  });

  it('setJointChannelEasing writes one channel at a time (streaming, no undo push)', () => {
    const { aid, jid } = setupDoor();
    const restId = restKeyframeId(anim0());
    const historyBefore = exportHistory().undo.length;

    setJointChannelEasing(aid, restId, jid, 'rotation', { kind: 'preset', preset: 'easeIn' });
    let seg = anim0().keyframes.find((k) => k.id === restId)!.easings![jid];
    expect(seg).toEqual({ rotation: { kind: 'preset', preset: 'easeIn' } });

    setJointChannelEasing(aid, restId, jid, 'scale', { kind: 'preset', preset: 'easeOut' });
    seg = anim0().keyframes.find((k) => k.id === restId)!.easings![jid];
    expect(seg.position).toBeUndefined();
    expect(seg.rotation).toEqual({ kind: 'preset', preset: 'easeIn' });
    expect(seg.scale).toEqual({ kind: 'preset', preset: 'easeOut' });

    setJointChannelEasing(aid, restId, jid, 'uniform', { kind: 'preset', preset: 'easeInOut' });
    seg = anim0().keyframes.find((k) => k.id === restId)!.easings![jid];
    expect(seg.position).toEqual({ kind: 'preset', preset: 'easeInOut' });
    expect(seg.scale).toEqual({ kind: 'preset', preset: 'easeInOut' });

    setJointChannelEasing(aid, restId, jid, 'uniform', { kind: 'preset', preset: 'linear' });
    expect(anim0().keyframes.find((k) => k.id === restId)!.easings).toBeUndefined();
    expect(exportHistory().undo.length).toBe(historyBefore); // streaming: no internal push
  });

  it('attachToJoint skips ids that are not SubPart placements (connectors/kittens)', () => {
    const { aid, jid } = setupDoor();
    const res = attachToJoint(aid, jid, ['panel_1', '_connector1']);
    expect(res).toEqual({ attached: 1, skipped: 1 });
    expect(anim0().joints.find((j) => j.id === jid)!.memberInstanceIds).toEqual(['panel_1']);
  });
});

describe('animationStore — per-joint column edits (§5.2 diamond menu)', () => {
  it('resetJointPoseToCurve turns a ◆ back into a ◇ (one discrete undo step)', () => {
    const { aid, jid } = setupDoor(); // columns at 0 and 1; the joint turns 90° at t=1
    setAnimationDuration(aid, 2, 'keepTimes');
    const mid = addKeyframe(aid, 2); // a third column at the far end
    setJointPose(aid, mid, jid, tf({ rot: [0, Math.PI, 0] }));
    // Now shove the MIDDLE column off the curve.
    const kid = anim0().keyframes.find((k) => k.timeSec === 1)!.id;
    setJointPose(aid, kid, jid, tf({ rot: [0, 0.1, 0] }));
    expect(anim0().keyframes.find((k) => k.id === kid)!.poses[jid].rotation.y).toBeCloseTo(0.1);

    const historyBefore = exportHistory().undo.length;
    resetJointPoseToCurve(aid, kid, jid);

    // On-curve between 0 and π at the halfway column ⇒ π/2, i.e. exactly a hold-through.
    expect(anim0().keyframes.find((k) => k.id === kid)!.poses[jid].rotation.y).toBeCloseTo(
      Math.PI / 2,
      5,
    );
    expect(exportHistory().undo.length).toBe(historyBefore + 1);
    undo();
    expect(anim0().keyframes.find((k) => k.id === kid)!.poses[jid].rotation.y).toBeCloseTo(0.1);
  });

  it('copies and pastes ONE joint’s pose between columns (discrete)', () => {
    const { aid, jid, kid } = setupDoor();
    const restId = restKeyframeId(anim0());
    expect(copyJointPose(aid, kid, jid)).toBe(true);
    expect(pasteJointPose(aid, restId, jid)).toBe(true);
    expect(anim0().keyframes.find((k) => k.id === restId)!.poses[jid].rotation.y).toBeCloseTo(
      Math.PI / 2,
    );
    undo();
    expect(anim0().keyframes.find((k) => k.id === restId)!.poses[jid].rotation.y).toBeCloseTo(0);
  });

  it('pasting with an empty clipboard is a no-op, not an undo step', () => {
    const { aid, jid, kid } = setupDoor();
    $jointPoseClipboard.set(null);
    const before = exportHistory().undo.length;
    expect(pasteJointPose(aid, kid, jid)).toBe(false);
    expect(exportHistory().undo.length).toBe(before);
  });
});

describe('animationStore — playback state machine (§10)', () => {
  /** A deploy-style clip: rest anchored on the LAST keyframe (imported KSA convention). */
  function setupDeploy() {
    const { aid, jid, kid } = setupDoor();
    setRestAnchor(aid, kid); // anchor = the t=1 column
    $activeAnimationId.set(aid);
    returnToRest(); // setupDoor's addKeyframe leaves a pin behind
    return { aid, jid, kid };
  }

  it('selectKeyframeForEditing pins + parks and never writes $toolMode', () => {
    const { aid, kid } = setupDoor();
    $activeAnimationId.set(aid);
    $toolMode.set('scale');
    selectKeyframeForEditing(aid, kid);
    expect($editKeyframeId.get()).toBe(kid);
    expect($playheadSec.get()).toBeCloseTo(1);
    expect($playheadParked.get()).toBe(true);
    expect($toolMode.get()).toBe('scale'); // v1's auto tool pick is gone
  });

  it('parkPlayhead clears the pin and clamps to the clip', () => {
    const { aid, kid } = setupDoor();
    $activeAnimationId.set(aid);
    selectKeyframeForEditing(aid, kid);
    parkPlayhead(0.4);
    expect($editKeyframeId.get()).toBeNull();
    expect($playheadParked.get()).toBe(true);
    expect($playheadSec.get()).toBeCloseTo(0.4);
    parkPlayhead(99);
    expect($playheadSec.get()).toBeCloseTo(1); // durationSec
  });

  it('a scrub that started PINNED re-pins on release — latched or not', () => {
    for (const latched of [false, true]) {
      const { aid, kid } = setupDoor();
      $activeAnimationId.set(aid);
      setLatched(latched);
      selectKeyframeForEditing(aid, kid);
      beginScrub();
      scrubTo(0.2);
      expect($animScrubbing.get()).toBe(true);
      endScrub();
      expect($editKeyframeId.get()).toBe(kid);
      expect($playheadSec.get()).toBeCloseTo(1);
      expect($playheadParked.get()).toBe(true);
      expect($animScrubbing.get()).toBe(false);
    }
    setLatched(false);
  });

  it('parked + unlatched: release springs back to the pre-drag park time', () => {
    const { aid } = setupDoor();
    $activeAnimationId.set(aid);
    parkPlayhead(0.6);
    beginScrub();
    scrubTo(0.1);
    endScrub();
    expect($playheadSec.get()).toBeCloseTo(0.6);
    expect($playheadParked.get()).toBe(true);
  });

  it('un-parked + unlatched: release returns to the REST ANCHOR (not t=0)', () => {
    const { aid } = setupDeploy();
    expect(restAnchorTime(anim0())).toBeCloseTo(1);
    beginScrub();
    scrubTo(0.3);
    endScrub();
    expect($playheadParked.get()).toBe(false);
    expect($playheadSec.get()).toBeCloseTo(1); // the modeled (deployed) end
    expect($activeAnimationId.get()).toBe(aid);
  });

  it('latched + no pin: release parks at the release position', () => {
    const { aid } = setupDoor();
    $activeAnimationId.set(aid);
    returnToRest(); // no pin
    setLatched(true);
    beginScrub();
    scrubTo(0.35);
    endScrub();
    expect($playheadParked.get()).toBe(true);
    expect($playheadSec.get()).toBeCloseTo(0.35);
    setLatched(false);
  });

  it('pausePreview keeps a pin at its own time and drops one elsewhere', () => {
    const { aid, kid } = setupDoor();
    $activeAnimationId.set(aid);
    selectKeyframeForEditing(aid, kid);
    pausePreview(); // playhead is still at the pin time
    expect($editKeyframeId.get()).toBe(kid);
    $playheadSec.set(0.25);
    pausePreview();
    expect($editKeyframeId.get()).toBeNull();
    expect($playheadParked.get()).toBe(true);
  });

  it('stepToKeyframe pins the neighbouring column and does not wrap', () => {
    const { aid, kid } = setupDoor();
    $activeAnimationId.set(aid);
    const restId = restKeyframeId(anim0());
    returnToRest(); // playhead at t=0
    stepToKeyframe(1);
    expect($editKeyframeId.get()).toBe(kid);
    stepToKeyframe(1); // no later column — stays put
    expect($editKeyframeId.get()).toBe(kid);
    stepToKeyframe(-1);
    expect($editKeyframeId.get()).toBe(restId);
    stepToKeyframe(-1);
    expect($editKeyframeId.get()).toBe(restId);
  });

  it('stepPlayhead moves by whole bake frames and parks', () => {
    const { aid } = setupDoor();
    $activeAnimationId.set(aid);
    returnToRest();
    stepPlayhead(3);
    expect($playheadSec.get()).toBeCloseTo(3 / 30);
    expect($playheadParked.get()).toBe(true);
  });

  it('members view opens on the active joint and closes clean', () => {
    const { aid, jid } = setupDoor();
    $activeAnimationId.set(aid);
    $activeJointId.set(jid);
    openMembersView();
    expect($membersView.get()).toEqual({ open: true, targetJointId: jid });
    closeMembersView();
    expect($membersView.get()).toEqual({ open: false, targetJointId: null });
  });
});

describe('animationStore — v2 atom clamping', () => {
  it('drops dead keyframe ids, clamps the playhead, and clears a dead working pivot', () => {
    initAnimationStore();
    $part.set({ ...createEmptyPart(), placements: [pl('panel_1', tf({ pos: [1, 0, 0] }))] });
    const aid = addAnimation('Door');
    const jid = addJoint(aid, 'Hinge');
    const kid = addKeyframe(aid, 1);
    setAnimationDuration(aid, 2); // times rescale: the added column is now at t=2

    $timelineSelection.set([restKeyframeId(anim0()), kid]);
    $membersView.set({ open: true, targetJointId: jid });
    $workingPivot.set({
      kind: 'subpart',
      position: { x: 0, y: 0, z: 0 },
      sourceInstanceId: 'gone',
    });
    $playheadSec.set(2);

    removeKeyframe(aid, kid);

    expect($timelineSelection.get()).toEqual([restKeyframeId(anim0())]);
    expect($workingPivot.get()).toBeNull();
    expect($playheadSec.get()).toBeLessThanOrEqual(anim0().durationSec);

    removeJoint(aid, jid);
    expect($membersView.get()).toEqual({ open: true, targetJointId: null }); // stays OPEN
  });
});

describe('animationStore — joint pivots', () => {
  it('re-centers the swing on the hinge instead of the origin', () => {
    const { aid, jid } = setupDoor();
    // BEFORE: pivot at origin → the panel at x=1 swings out to (0,0,-1) at t=1.
    expect(
      positionOf(previewOverrideMatrix(anim0(), 'panel_1', 1, tf({ pos: [1, 0, 0] }))!)[2],
    ).toBeCloseTo(-1, 5);
    // Snap the pivot onto the hinge (x=1); now the door hinges in place.
    setJointPivot(aid, jid, tf({ pos: [1, 0, 0] }));
    const p = positionOf(previewOverrideMatrix(anim0(), 'panel_1', 1, tf({ pos: [1, 0, 0] }))!);
    expect(p[0]).toBeCloseTo(1, 5);
    expect(p[1]).toBeCloseTo(0, 5);
    expect(p[2]).toBeCloseTo(0, 5);
  });

  it('position-only setJointPivot equals moveJointPivot', () => {
    setupDoor();
    const { aid, jid } = { aid: anim0().id, jid: anim0().joints[0].id };
    setJointPivot(aid, jid, tf({ pos: [1, 0, 0] }), { orientation: false });
    const viaSet = jointPoses(anim0(), jid);

    const leg = setupDoor();
    moveJointPivot(leg.aid, leg.jid, { x: 1, y: 0, z: 0 });
    const viaMove = jointPoses(anim0(), leg.jid);

    expectPosesClose(viaSet, viaMove);
  });

  it('orientation snap adopts the hinge position + orientation and strips its scale', () => {
    const { aid, jid } = setupDoor();
    const hinge = tf({ pos: [2, 0.5, 0], rot: [0, 0, Math.PI / 2], scale: [2, 2, 2] });
    setJointPivot(aid, jid, hinge, { orientation: true });
    // The joint's rest WORLD frame becomes the hinge frame — but unit-scaled.
    expectMatrixClose(jointWorld(anim0(), jid, 0), matrixFromTransform({ ...hinge, scale: I3 }));
    // t=0 geometry is preserved (no jump): the leaf still renders at its placement.
    expectMatrixClose(
      previewOverrideMatrix(anim0(), 'panel_1', 0, tf({ pos: [1, 0, 0] }))!,
      matrixFromTransform(tf({ pos: [1, 0, 0] })),
    );
  });

  it('re-bases a child joint to the target frame and leaves the parent untouched', () => {
    const { aid, hip, knee } = setupLeg();
    const hipBefore = jointPoses(anim0(), hip);
    const target = tf({ pos: [2, 0, 0], rot: [0, Math.PI / 2, 0] });
    setJointPivot(aid, knee, target, { orientation: true });
    // The child's rest WORLD frame equals the target (parent-local conversion correct).
    expectMatrixClose(jointWorld(anim0(), knee, 0), matrixFromTransform({ ...target, scale: I3 }));
    // The parent joint's poses are unchanged.
    expectPosesClose(jointPoses(anim0(), hip), hipBefore);
  });

  it('setJointPivot is a single undo step', () => {
    const { aid, jid } = setupDoor();
    const before = jointPoses(anim0(), jid);
    setJointPivot(aid, jid, tf({ pos: [1, 0, 0] }));
    const after = jointPoses(anim0(), jid);
    expect(after).not.toEqual(before);
    undo();
    expectPosesClose(jointPoses(anim0(), jid), before);
    redo();
    expectPosesClose(jointPoses(anim0(), jid), after);
  });

  it('addJoint seeds the pivot at the selection centroid (no orientation guess)', () => {
    $part.set({
      ...createEmptyPart(),
      placements: [pl('a', tf({ pos: [0, 0, 0] })), pl('b', tf({ pos: [2, 0, 0] }))],
    });
    select([
      { kind: 'subpart', id: 'a' },
      { kind: 'subpart', id: 'b' },
    ]);
    const aid = addAnimation('A');
    const jid = addJoint(aid, 'J');
    const rest = anim0().keyframes.find((k) => k.timeSec === 0)!.poses[jid];
    expect(rest.position.x).toBeCloseTo(1); // centroid of x=0 and x=2
    expect(rest.position.y).toBeCloseTo(0);
    expect(rest.position.z).toBeCloseTo(0);
    expect(rest.rotation.x).toBeCloseTo(0);
    expect(rest.rotation.y).toBeCloseTo(0);
    expect(rest.rotation.z).toBeCloseTo(0);
  });

  it('leaving animation mode unpins the edited keyframe and stops playback', () => {
    const { aid, jid, kid } = setupDoor();
    setMode('animation');
    $activeAnimationId.set(aid);
    $activeJointId.set(jid);
    $editKeyframeId.set(kid);
    $animScrubbing.set(true);
    $animPlaying.set(true);
    $playheadSec.set(0.5);
    $playheadParked.set(true);

    setMode('build');

    expect($editKeyframeId.get()).toBe(null);
    expect($animPlaying.get()).toBe(false);
    expect($animScrubbing.get()).toBe(false);
    expect($playheadParked.get()).toBe(false);
    // The clip + joint survive so returning to the mode lands where you left off (§2.4).
    expect($activeAnimationId.get()).toBe(aid);
    expect($activeJointId.get()).toBe(jid);
  });

  it('$isPoseEditing is true only in animation mode with a joint + keyframe selected', () => {
    const { aid, jid, kid } = setupDoor();
    expect($isPoseEditing.get()).toBe(false); // Build mode by default
    setMode('animation');
    $activeAnimationId.set(aid);
    $activeJointId.set(jid);
    $editKeyframeId.set(kid);
    expect($isPoseEditing.get()).toBe(true);
    $activeJointId.set(null);
    expect($isPoseEditing.get()).toBe(false);
  });

  describe('segment easing', () => {
    it('stores an eased curve on the outgoing keyframe segment for one joint', () => {
      const { aid, jid } = setupDoor();
      const restId = restKeyframeId(anim0());
      setJointSegmentEasing(aid, restId, jid, { kind: 'preset', preset: 'easeInOut' });
      const rest = anim0().keyframes.find((k) => k.id === restId)!;
      // uniform authoring writes the SAME config to all three channels (design §3)
      expect(rest.easings?.[jid]).toEqual({
        position: { kind: 'preset', preset: 'easeInOut' },
        rotation: { kind: 'preset', preset: 'easeInOut' },
        scale: { kind: 'preset', preset: 'easeInOut' },
      });
    });

    it('clears the entry (and the map) when set to linear — keeps export byte-identical', () => {
      const { aid, jid } = setupDoor();
      const restId = restKeyframeId(anim0());
      setJointSegmentEasing(aid, restId, jid, {
        kind: 'cubicBezier',
        x1: 0.4,
        y1: 0,
        x2: 0.6,
        y2: 1,
      });
      setJointSegmentEasing(aid, restId, jid, { kind: 'preset', preset: 'linear' });
      const rest = anim0().keyframes.find((k) => k.id === restId)!;
      expect(rest.easings).toBeUndefined();
    });

    it('applies the same easing to every joint with "all joints"', () => {
      const { aid, hip, knee } = setupLeg();
      const restId = restKeyframeId(anim0());
      setSegmentEasingAllJoints(aid, restId, { kind: 'preset', preset: 'easeOut' });
      const rest = anim0().keyframes.find((k) => k.id === restId)!;
      const eased = { kind: 'preset', preset: 'easeOut' };
      expect(rest.easings?.[hip]).toEqual({ position: eased, rotation: eased, scale: eased });
      expect(rest.easings?.[knee]).toEqual({ position: eased, rotation: eased, scale: eased });
    });

    it('inserting a keyframe preserves the motion exactly (exact bézier split)', () => {
      for (const cfg of [
        { kind: 'preset', preset: 'easeInOut' } as const,
        { kind: 'cubicBezier', x1: 0.34, y1: 1.4, x2: 0.64, y2: 1 } as const, // overshoot
      ]) {
        const { aid, jid, kid } = setupDoor();
        // give the segment BOTH a position and a rotation delta so all channels matter
        setJointPose(aid, kid, jid, tf({ pos: [0, 0.7, 0.3], rot: [0, Math.PI / 2, 0] }));
        const restId = restKeyframeId(anim0());
        setJointSegmentEasing(aid, restId, jid, cfg);

        const ts = Array.from({ length: 97 }, (_, i) => i / 96);
        const before = ts.map((t) => sampleJointLocal(anim0(), jid, t));
        addKeyframe(aid, 0.37); // duration is 1s
        const after = ts.map((t) => sampleJointLocal(anim0(), jid, t));

        // the easing survived, split across the two sub-segments
        const rest = anim0().keyframes.find((k) => k.id === restId)!;
        expect(rest.easings?.[jid]).toBeTruthy();
        expect(anim0().keyframes.find((k) => k.timeSec === 0.37)!.easings?.[jid]).toBeTruthy();

        for (let i = 0; i < ts.length; i++) {
          const pa = new THREE.Vector3();
          const qa = new THREE.Quaternion();
          const pb = new THREE.Vector3();
          const qb = new THREE.Quaternion();
          before[i].decompose(pa, qa, new THREE.Vector3());
          after[i].decompose(pb, qb, new THREE.Vector3());
          expect(pa.distanceTo(pb)).toBeLessThan(1e-5);
          const deg = 2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb)))) * (180 / Math.PI);
          expect(deg).toBeLessThan(0.01);
        }
      }
    });

    it('addKeyframe within 1 ms of an existing column is a no-op returning its id', () => {
      const { aid, kid } = setupDoor();
      const historyBefore = exportHistory().undo.length;
      const again = addKeyframe(aid, 1.0005);
      expect(again).toBe(kid);
      expect(anim0().keyframes).toHaveLength(2);
      expect(exportHistory().undo.length).toBe(historyBefore);
      expect($editKeyframeId.get()).toBe(kid);
    });
  });
});

describe('animationStore — membership batch ops + member painting (§7)', () => {
  it('detachMembers strips a batch off whatever joint owns each, in ONE undo step', () => {
    $part.set({
      ...createEmptyPart(),
      placements: [pl('a', tf()), pl('b', tf()), pl('c', tf())],
    });
    const aid = addAnimation('A');
    const j1 = addJoint(aid, 'J1');
    const j2 = addJoint(aid, 'J2');
    attachToJoint(aid, j1, ['a', 'b']);
    attachToJoint(aid, j2, ['c']);

    const removed = detachMembers(aid, ['b', 'c']);
    expect(removed).toBe(2);
    const byId = (id: string) => anim0().joints.find((j) => j.id === id)!.memberInstanceIds;
    expect(byId(j1)).toEqual(['a']);
    expect(byId(j2)).toEqual([]);

    undo(); // ONE step puts both back
    expect(anim0().joints.find((j) => j.id === j1)!.memberInstanceIds).toEqual(['a', 'b']);
    expect(anim0().joints.find((j) => j.id === j2)!.memberInstanceIds).toEqual(['c']);
  });

  it('paint reassignment is exclusive within the clip and reverts in ONE undo', () => {
    $part.set({ ...createEmptyPart(), placements: [pl('panel_1', tf())] });
    const aid = addAnimation('A');
    const jointA = addJoint(aid, 'A');
    const jointB = addJoint(aid, 'B');
    attachToJoint(aid, jointB, ['panel_1']);
    $activeAnimationId.set(aid);
    $activeJointId.set(jointA); // the paint target
    $membersView.set({ open: false, targetJointId: null });

    const outcome = paintMemberOnTarget('panel_1');
    expect(outcome).toMatchObject({ result: 'reassigned', jointName: 'A', fromJointName: 'B' });
    const members = (id: string) => anim0().joints.find((j) => j.id === id)!.memberInstanceIds;
    expect(members(jointB)).toEqual([]);
    expect(members(jointA)).toEqual(['panel_1']);

    undo();
    expect(anim0().joints.find((j) => j.id === jointB)!.memberInstanceIds).toEqual(['panel_1']);
    expect(anim0().joints.find((j) => j.id === jointA)!.memberInstanceIds).toEqual([]);
  });

  it('painting an id already on the target DETACHES it; an unowned id attaches', () => {
    $part.set({ ...createEmptyPart(), placements: [pl('panel_1', tf())] });
    const aid = addAnimation('A');
    const jid = addJoint(aid, 'J');
    $activeAnimationId.set(aid);
    $activeJointId.set(jid);
    $membersView.set({ open: false, targetJointId: null });

    expect(paintMemberOnTarget('panel_1').result).toBe('attached');
    expect(anim0().joints[0].memberInstanceIds).toEqual(['panel_1']);
    expect(paintMemberOnTarget('panel_1').result).toBe('detached');
    expect(anim0().joints[0].memberInstanceIds).toEqual([]);
  });

  it('reorderJoint splices DOCUMENT order (one discrete undo step)', () => {
    const aid = addAnimation('A');
    const j1 = addJoint(aid, 'One');
    const j2 = addJoint(aid, 'Two');
    const j3 = addJoint(aid, 'Three');
    expect(anim0().joints.map((j) => j.id)).toEqual([j1, j2, j3]);

    reorderJoint(aid, j3, j1); // drop "Three" ahead of "One"
    expect(anim0().joints.map((j) => j.id)).toEqual([j3, j1, j2]);
    reorderJoint(aid, j3, null); // null appends
    expect(anim0().joints.map((j) => j.id)).toEqual([j1, j2, j3]);

    undo();
    expect(anim0().joints.map((j) => j.id)).toEqual([j3, j1, j2]);
  });
});

describe('animationStore — numeric pivot edits at the rest anchor (§8.3)', () => {
  it('re-orienting the pivot at a NON-zero anchor leaves the rest geometry exactly put', () => {
    const { aid, jid, kid } = setupDoor(); // panel at x=1, keyframes at 0 and 1
    setRestAnchor(aid, kid); // the anchor is now the LAST keyframe (an imported deploy clip)
    expect(restAnchorTime(anim0())).toBeCloseTo(1);

    const placement = tf({ pos: [1, 0, 0] });
    const restBefore = previewOverrideMatrix(anim0(), 'panel_1', 1, placement)!;

    // What the Joint card's "Pivot orientation (°)" field does: compose the entered Euler
    // into a Part-space frame at the joint's current rest position and rebase onto it.
    const world = jointWorld(anim0(), jid, restAnchorTime(anim0()));
    const pos = new THREE.Vector3().setFromMatrixPosition(world);
    reorientJointPivot(aid, jid, {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: 0, y: Math.PI / 3, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });

    // The pivot really moved…
    expectMatrixClose(
      jointWorld(anim0(), jid, restAnchorTime(anim0())),
      matrixFromTransform({
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: 0, y: Math.PI / 3, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      }),
    );
    // …and the modeled (anchor) geometry did not budge.
    expectMatrixClose(previewOverrideMatrix(anim0(), 'panel_1', 1, placement)!, restBefore);
  });
});
