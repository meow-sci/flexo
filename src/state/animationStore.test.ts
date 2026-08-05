import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { $part, undo, redo, importHistory, $selectedIndices } from './editorStore';
import { $mode, setMode } from './modeStore';
import { createEmptyPart } from '../ksa/types';
import type { PartAnimation, SubPartPlacement, Transform } from '../ksa/types';
import { matrixFromTransform } from '../three/coords';
import { jointWorld, previewOverrideMatrix } from '../ksa/animationRig';
import {
  $activeAnimationId,
  $activeJointId,
  $editKeyframeId,
  $animPreviewU,
  $animPlaying,
  $animScrubbing,
  $isPoseEditing,
  addAnimation,
  addJoint,
  attachToJoint,
  addKeyframe,
  removeKeyframe,
  setJointPose,
  setJointParent,
  setAnimationDuration,
  setJointPivot,
  moveJointPivot,
  setJointSegmentEasing,
  setSegmentEasingAllJoints,
} from './animationStore';

const anim0 = () => $part.get().animations[0];

beforeEach(() => {
  $part.set(createEmptyPart());
  importHistory({ undo: [], redo: [] });
  $activeAnimationId.set(null);
  $activeJointId.set(null);
  $editKeyframeId.set(null);
  $animPreviewU.set(0);
  $animScrubbing.set(false);
  $animPlaying.set(false);
  $selectedIndices.set([]);
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
    $selectedIndices.set([0, 1]);
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
    $animPreviewU.set(0.5);

    setMode('build');

    expect($editKeyframeId.get()).toBe(null);
    expect($animPlaying.get()).toBe(false);
    expect($animScrubbing.get()).toBe(false);
    expect($animPreviewU.get()).toBe(0);
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
      expect(rest.easings?.[jid]).toEqual({ kind: 'preset', preset: 'easeInOut' });
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
      expect(rest.easings?.[hip]).toEqual({ kind: 'preset', preset: 'easeOut' });
      expect(rest.easings?.[knee]).toEqual({ kind: 'preset', preset: 'easeOut' });
    });

    it('clears the preceding segment easing when a keyframe splits it', () => {
      const { aid, jid } = setupDoor();
      const restId = restKeyframeId(anim0());
      setJointSegmentEasing(aid, restId, jid, { kind: 'preset', preset: 'easeInOut' });
      addKeyframe(aid, 0.5); // splits the [0 → 1] segment
      const rest = anim0().keyframes.find((k) => k.id === restId)!;
      expect(rest.easings).toBeUndefined();
    });
  });
});
