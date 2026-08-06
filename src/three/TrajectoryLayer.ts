import * as THREE from 'three';
import type { Viewport } from './Viewport';
import { jointWorld, previewOverrideMatrix, restAnchorTime } from '../ksa/animationRig';
import type { PartAnimation, Transform } from '../ksa/types';
import { $part } from '../state/editorStore';
import { $mode } from '../state/modeStore';
import {
  $activeAnimationId,
  $activeJointId,
  $animTrails,
  $playheadSec,
} from '../state/animationStore';

/**
 * **Motion trajectories** (design-animation-mode.md §9.5; DECISIONS #8) — a read-only 3D
 * curve per animated joint showing where its parts actually travel.
 *
 * The curve is the MEMBER-SET CENTROID path, not the joint origin's: a pure hinge's origin
 * never moves, so an origin-only trail would draw nothing for the single most common rig.
 * The joint origin gets a fainter second polyline only when it genuinely translates.
 * Keyframe columns are marked with diamonds (the rest anchor's is ringed) and the playhead
 * rides the curve as a bead.
 *
 * **Cost discipline (guardrail 10)**: the curves are rebuilt ONLY on a document / clip /
 * joint / preference change — the caller's `sub()` channels decide when. Playback moves the
 * BEAD and nothing else, through a direct `$playheadSec` subscription that invalidates the
 * on-demand loop; no rAF of this layer's own, and `'off'` builds nothing at all.
 */

/** Samples across an EASED segment (the curve has to show the ease), and across a linear one. */
const EASED_SAMPLES = 64;
const LINEAR_SAMPLES = 4;

const ACTIVE_COLOR = 0x6ee7ff;
const OTHER_COLOR = 0x94a3b8;
const ORIGIN_COLOR = 0x64748b;
const BEAD_COLOR = 0xfbbf24;

/** Below this the joint origin is treated as stationary and its faint path is skipped. */
const ORIGIN_MOVE_EPS = 1e-4;

interface JointTrail {
  jointId: string;
  /** Centroid samples, in Part space (== world: the part root is at identity). */
  points: THREE.Vector3[];
  /** Sample times, parallel to {@link points} — what the bead interpolates against. */
  times: number[];
}

export class TrajectoryLayer {
  private readonly group = new THREE.Group();
  private readonly disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  private trails: JointTrail[] = [];
  private bead: THREE.Mesh | null = null;
  private beadTrail: JointTrail | null = null;
  private readonly unsubPlayhead: () => void;

  constructor(viewport: Viewport) {
    this.group.name = 'motion-trails';
    // The SCENE, not the part root: a trail is an editor aid and must never be pickable.
    viewport.scene.add(this.group);
    // Subscribed IMPERATIVELY (design §9.5): the playhead is high-frequency, and only the
    // bead's position depends on it. Never a React subscription, never a rebuild.
    this.unsubPlayhead = $playheadSec.subscribe(() => {
      if (this.moveBead()) viewport.invalidate();
    });
  }

  /** Rebuilds every curve from the document. Called from `EditorScene`'s `sub()` channels. */
  refresh(): void {
    this.clear();
    const mode = $animTrails.get();
    const anim = this.activeAnimation();
    if (!anim || mode === 'off' || anim.durationSec <= 0) return;

    const activeId = $activeJointId.get();
    const part = $part.get();
    const placements = new Map<string, Transform>(part.placements.map((p) => [p.instanceId, p]));
    const anchorT = restAnchorTime(anim);
    const times = sampleTimes(anim);

    for (const joint of anim.joints) {
      const active = joint.id === activeId;
      if (mode === 'selected' && !active) continue;
      const members = joint.memberInstanceIds.filter((id) => placements.has(id));
      if (members.length === 0) continue;

      const points: THREE.Vector3[] = [];
      const origins: THREE.Vector3[] = [];
      // Parallel to `points` — a sample the rig could not resolve is dropped from BOTH, so
      // the bead's time→point lookup can never slip a frame.
      const kept: number[] = [];
      for (const t of times) {
        const centroid = new THREE.Vector3();
        let n = 0;
        for (const id of members) {
          const m = previewOverrideMatrix(anim, id, t, placements.get(id)!);
          if (!m) continue;
          centroid.add(new THREE.Vector3().setFromMatrixPosition(m));
          n++;
        }
        if (n === 0) continue;
        points.push(centroid.divideScalar(n));
        origins.push(new THREE.Vector3().setFromMatrixPosition(jointWorld(anim, joint.id, t)));
        kept.push(t);
      }
      if (points.length < 2 || !varies(points)) continue;

      const opacity = active ? 0.95 : 0.4;
      this.addLine(points, active ? ACTIVE_COLOR : OTHER_COLOR, opacity);
      if (varies(origins)) this.addLine(origins, ORIGIN_COLOR, opacity * 0.5);

      // Column ticks ON the curve, with the rest anchor's ringed — the ⚓ the whole preview
      // and export math is anchored on (§5.6).
      for (const kf of anim.keyframes) {
        const at = pointAt(points, kept, kf.timeSec);
        if (!at) continue;
        const anchor = Math.abs(kf.timeSec - anchorT) < 1e-6;
        this.addTick(at, active ? ACTIVE_COLOR : OTHER_COLOR, opacity, anchor);
      }

      const trail: JointTrail = { jointId: joint.id, points, times: kept };
      this.trails.push(trail);
      if (active) this.beadTrail = trail;
    }

    if (this.trails.length > 0) {
      this.beadTrail ??= this.trails[0];
      this.addBead();
      this.moveBead();
    }
  }

  dispose(): void {
    this.unsubPlayhead();
    this.clear();
    this.group.removeFromParent();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private activeAnimation(): PartAnimation | null {
    if ($mode.get() !== 'animation') return null;
    const id = $activeAnimationId.get();
    return (id ? $part.get().animations.find((a) => a.id === id) : null) ?? null;
  }

  private addLine(points: THREE.Vector3[], color: number, opacity: number): void {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
    });
    this.disposables.push(geometry, material);
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 15;
    this.group.add(line);
  }

  private addTick(at: THREE.Vector3, color: number, opacity: number, anchor: boolean): void {
    const geometry = new THREE.OctahedronGeometry(anchor ? 0.022 : 0.014, 0);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      wireframe: anchor, // the ⚓ column reads as a RING around its tick
    });
    this.disposables.push(geometry, material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 16;
    mesh.raycast = () => {};
    mesh.position.copy(at);
    this.group.add(mesh);
  }

  private addBead(): void {
    const geometry = new THREE.SphereGeometry(0.02, 12, 8);
    const material = new THREE.MeshBasicMaterial({
      color: BEAD_COLOR,
      depthTest: false,
      depthWrite: false,
    });
    this.disposables.push(geometry, material);
    this.bead = new THREE.Mesh(geometry, material);
    this.bead.renderOrder = 17;
    this.bead.raycast = () => {};
    this.group.add(this.bead);
  }

  /** Slides the bead to `$playheadSec`. Returns true when it actually moved. */
  private moveBead(): boolean {
    const bead = this.bead;
    const trail = this.beadTrail;
    if (!bead || !trail) return false;
    const at = pointAt(trail.points, trail.times, $playheadSec.get());
    if (!at || bead.position.distanceToSquared(at) < 1e-12) return false;
    bead.position.copy(at);
    return true;
  }

  private clear(): void {
    this.group.clear();
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
    this.trails = [];
    this.bead = null;
    this.beadTrail = null;
  }
}

/**
 * The sample times: every column boundary, subdivided densely across EASED segments and
 * sparsely across linear ones (a linear segment is a straight line between two poses, so
 * more samples would only add vertices).
 */
function sampleTimes(anim: PartAnimation): number[] {
  const columns = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec);
  if (columns.length < 2) return [];
  const times: number[] = [];
  for (let i = 0; i < columns.length - 1; i++) {
    const from = columns[i];
    const to = columns[i + 1];
    const eased = !!from.easings && Object.keys(from.easings).length > 0;
    const steps = eased ? EASED_SAMPLES : LINEAR_SAMPLES;
    for (let s = 0; s < steps; s++)
      times.push(from.timeSec + ((to.timeSec - from.timeSec) * s) / steps);
  }
  times.push(columns[columns.length - 1].timeSec);
  return times;
}

/** Does this sampled path go anywhere at all? A held joint draws nothing. */
function varies(points: THREE.Vector3[]): boolean {
  const first = points[0];
  return points.some((p) => p.distanceToSquared(first) > ORIGIN_MOVE_EPS * ORIGIN_MOVE_EPS);
}

/** The point on a sampled path at time `t` (linear between samples, clamped at the ends). */
function pointAt(points: THREE.Vector3[], times: number[], t: number): THREE.Vector3 | null {
  if (points.length === 0) return null;
  if (t <= times[0]) return points[0].clone();
  const last = times.length - 1;
  if (t >= times[last]) return points[Math.min(last, points.length - 1)].clone();
  for (let i = 0; i < last; i++) {
    if (t > times[i + 1]) continue;
    const span = times[i + 1] - times[i];
    const alpha = span > 0 ? (t - times[i]) / span : 0;
    return points[i].clone().lerp(points[i + 1], alpha);
  }
  return points[points.length - 1].clone();
}
