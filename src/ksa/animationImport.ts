import * as THREE from 'three';
import { transformFromMatrix } from '../three/coords';
import type { CatalogAnimationModule, PartAnimation, Transform } from './types';

/**
 * Decodes a KSA `_Anim.glb` back into flexo's {@link PartAnimation} — the inverse of
 * {@link import('./animationRig').buildAnimationRig}. KSA animation GLBs use the exact
 * joint-skeleton convention flexo exports: a Part root node, nested JOINT nodes that
 * carry the TRS animation channels, and SubPart leaf nodes (named === their instance
 * id) parented statically under their joint. So importing is: classify nodes (joint vs
 * member leaf), rebuild the joint chain from the nesting, and sample each joint's local
 * pose at the union of channel keyframe times.
 *
 * This is the FALLBACK importer — it keeps the GLB's dense baked keyframes verbatim
 * (an eased deploy comes in as ~fps keys). {@link import('./easingFit')} compresses
 * those back to a few eased keyframes; until then the dense form round-trips losslessly.
 *
 * Sampler coverage: FLOAT accessors with LINEAR, STEP or CUBICSPLINE interpolation. KSA's
 * `SampleType` enum allows all three; flexo has no tangent model, so a CUBICSPLINE sampler
 * is decoded from its keyframe VALUES only (the middle element of each
 * [inTangent, value, outTangent] triplet) and the clip is flagged
 * {@link ImportedAnimation.cubicSplineApprox} — exact at the keys, approximated between.
 *
 * Leaf/solar-tracking references come out in the ORIGINAL KSA instance-id space; the
 * editor regenerates instance ids on import, so {@link remapImportedAnimation} swaps
 * them via the old→new map the importer builds.
 */

const COMPONENT_FLOAT = 5126;

// ── GLB / glTF reading ─────────────────────────────────────────────────────────

interface GltfNode {
  name?: string;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}
interface GltfSampler {
  input: number;
  output: number;
  interpolation?: string;
}
interface GltfAnimation {
  name?: string;
  channels: { sampler: number; target: { node: number; path: string } }[];
  samplers: GltfSampler[];
}
interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
}
interface Gltf {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  animations?: GltfAnimation[];
  accessors?: GltfAccessor[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Splits a binary GLB into its glTF JSON object and the binary buffer chunk. */
export function parseGlb(buffer: ArrayBuffer): { json: Gltf; bin: DataView } {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== GLB_MAGIC)
    throw new Error('animationImport: not a GLB (bad magic)');
  let off = 12;
  let json: Gltf | null = null;
  let bin: DataView | null = null;
  while (off + 8 <= dv.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (type === CHUNK_JSON)
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
    else if (type === CHUNK_BIN) bin = new DataView(buffer, start, len);
    off = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error('animationImport: GLB has no JSON chunk');
  return { json, bin: bin ?? new DataView(new ArrayBuffer(0)) };
}

/** Reads a FLOAT accessor as rows (one number[] per element; SCALAR rows have length 1). */
function readAccessor(json: Gltf, bin: DataView, index: number): number[][] {
  const acc = json.accessors?.[index];
  if (!acc) throw new Error(`animationImport: missing accessor ${index}`);
  if (acc.componentType !== COMPONENT_FLOAT)
    throw new Error('animationImport: only FLOAT accessors supported');
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv) throw new Error('animationImport: missing bufferView');
  const comps = COMPS[acc.type] ?? 1;
  const stride = bv.byteStride ?? comps * 4;
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const rows: number[][] = [];
  for (let i = 0; i < acc.count; i++) {
    const row: number[] = [];
    for (let c = 0; c < comps; c++) row.push(bin.getFloat32(base + i * stride + c * 4, true));
    rows.push(row);
  }
  return rows;
}

// ── channel sampling ─────────────────────────────────────────────────────────--

interface Channel {
  times: number[];
  values: number[][];
  step: boolean;
}

/** Samples a channel at time `t` (clamped); LINEAR lerp / quaternion slerp, or STEP hold. */
function sampleChannel(ch: Channel, t: number): number[] {
  const { times, values } = ch;
  const n = times.length;
  if (n === 0) return [];
  if (t <= times[0]) return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  let i = 0;
  while (i < n - 1 && times[i + 1] <= t) i++;
  const a = values[i];
  const b = values[i + 1];
  if (ch.step) return a;
  const u = (t - times[i]) / (times[i + 1] - times[i]);
  if (a.length === 4) {
    const q = new THREE.Quaternion(a[0], a[1], a[2], a[3]).slerp(
      new THREE.Quaternion(b[0], b[1], b[2], b[3]),
      u,
    );
    return [q.x, q.y, q.z, q.w];
  }
  return a.map((v, k) => v + (b[k] - v) * u);
}

// ── decode ─────────────────────────────────────────────────────────────────────

/** One decoded joint, in ORIGINAL instance-id space and node-index parent references. */
interface ImportedJoint {
  name: string;
  parentIndex: number | null;
  memberOriginalIds: string[];
  poses: Transform[]; // aligned to ImportedAnimation.keyframeTimes
}

/** A decoded animation before instance-id remapping / fresh-id assignment. */
export interface ImportedAnimation {
  name: string;
  durationSec: number;
  showDeployRetract: boolean;
  keyframeTimes: number[];
  joints: ImportedJoint[];
  /**
   * True when the part's modeled placements match the LAST keyframe (the deployed end)
   * rather than the first — i.e. the GLB is a deploy clip whose t=0 is the stowed state.
   * The importer uses this to set {@link import('./types').PartAnimation.restKeyframeId}
   * to the last keyframe so the preview/export anchor on the deployed (modeled) pose.
   */
  restAtLastKeyframe: boolean;
  /**
   * True when ANY sampler in the source GLB used CUBICSPLINE interpolation. flexo decoded
   * only the keyframe VALUES (tangents dropped), so the in-between motion is approximated.
   * Rides through to {@link import('./types').PartAnimation.cubicSplineApprox}.
   */
  cubicSplineApprox: boolean;
  /**
   * Each animated member's Part-local transform at the rest keyframe, computed straight
   * from the GLB (== KSA's `EvaluateWorldMatrix(leaf, restTime)`), keyed by ORIGINAL
   * instance id. KSA positions animated SubParts SOLELY from the GLB and ignores their
   * geometry `<Position>` (it's overwritten on spawn — see {@link import('./animationRig')}),
   * so the importer overrides each animated SubPart's placement with this GLB-faithful
   * pose. For correctly-authored clips this equals the geometry placement (a no-op); when
   * the two disagree (a stale/rotated geometry placement) it's what keeps flexo matching
   * the game instead of anchoring the joint motion to the wrong spot.
   */
  memberRestPlacements: Map<string, Transform>;
  solarTracking: {
    degreesPerSecond: number;
    subPartOriginalId: string;
    excludeOriginalIds: string[];
  } | null;
}

function uniqSorted(times: number[]): number[] {
  const out = [...new Set(times.map((t) => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b);
  if (out.length === 0 || out[0] !== 0) out.unshift(0);
  return out;
}

/**
 * Decodes the GLB into an {@link ImportedAnimation}. `instanceIds` is the set of the
 * Part's ORIGINAL KSA SubPart instance ids (== the GLB leaf node names); any node not
 * in it (and not a scene root) is treated as a joint. Returns null when the GLB carries
 * no animation channels.
 */
export function decodeAnimationGlb(
  buffer: ArrayBuffer,
  opts: {
    instanceIds: ReadonlySet<string>;
    module: CatalogAnimationModule;
    /** Part-relative SubPart placements (original instance-id space) — used to detect
     *  which keyframe the modeled assembly matches (see {@link ImportedAnimation.restAtLastKeyframe}).
     *  Omitted ⇒ detection no-ops and rest stays the first keyframe (t=0). */
    placements?: ReadonlyMap<string, Transform>;
  },
): ImportedAnimation | null {
  const { json, bin } = parseGlb(buffer);
  const nodes = json.nodes ?? [];
  const anim = json.animations?.[0];
  if (!anim || anim.channels.length === 0) return null;

  const childToParent = new Map<number, number>();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => childToParent.set(c, i)));
  const roots = new Set<number>(
    (json.scenes?.[json.scene ?? 0]?.nodes ?? []).filter((i) => nodes[i]),
  );
  const isLeaf = (i: number) => !!nodes[i]?.name && opts.instanceIds.has(nodes[i].name!);

  // Per-node TRS channels.
  const nodeChannels = new Map<
    number,
    { translation?: Channel; rotation?: Channel; scale?: Channel }
  >();
  let sawCubicSpline = false;
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler];
    if (!s) continue;
    const rows = readAccessor(json, bin, s.output);
    // CUBICSPLINE stores each key as an [inTangent, value, outTangent] triplet (3× the
    // input count). flexo has no tangent model, so keep the VALUES and treat the segments
    // as LINEAR — the keyframes are exact, the in-between motion is approximated. The
    // clip is flagged so the import report + clip diagnostics can say so (design §11.3).
    const cubic = s.interpolation === 'CUBICSPLINE';
    if (cubic) sawCubicSpline = true;
    const channel: Channel = {
      times: readAccessor(json, bin, s.input).map((r) => r[0]),
      values: cubic ? rows.filter((_, i) => i % 3 === 1) : rows,
      step: s.interpolation === 'STEP',
    };
    const entry = nodeChannels.get(ch.target.node) ?? {};
    entry[ch.target.path as 'translation' | 'rotation' | 'scale'] = channel;
    nodeChannels.set(ch.target.node, entry);
  }

  // A node is "relevant" (⇒ a joint) if animated or an ancestor of a member leaf.
  const hasLeafDescendant = (i: number): boolean => {
    for (const c of nodes[i]?.children ?? []) if (isLeaf(c) || hasLeafDescendant(c)) return true;
    return false;
  };
  const jointNodeIndices: number[] = [];
  nodes.forEach((_, i) => {
    if (roots.has(i) || isLeaf(i)) return;
    if (nodeChannels.has(i) || hasLeafDescendant(i)) jointNodeIndices.push(i);
  });
  const jointArrayIndexByNode = new Map(
    jointNodeIndices.map((nodeIdx, arrIdx) => [nodeIdx, arrIdx]),
  );

  // Keyframe times = union of every channel's input times (always including 0).
  const allTimes: number[] = [];
  for (const entry of nodeChannels.values())
    for (const ch of [entry.translation, entry.rotation, entry.scale])
      if (ch) allTimes.push(...ch.times);
  const keyframeTimes = uniqSorted(allTimes);

  const nearestJointAncestor = (nodeIdx: number): number | null => {
    let cur = childToParent.get(nodeIdx);
    while (cur !== undefined && !roots.has(cur)) {
      if (jointArrayIndexByNode.has(cur)) return jointArrayIndexByNode.get(cur)!;
      cur = childToParent.get(cur);
    }
    return null;
  };

  const base = (n: GltfNode) => ({
    t: n.translation ?? [0, 0, 0],
    r: n.rotation ?? [0, 0, 0, 1],
    s: n.scale ?? [1, 1, 1],
  });

  // A node's local / Part-space matrix at time `t` (mirrors the joint sampling above,
  // but for ANY node — used to place member leaves for the rest-keyframe detection).
  const nodeLocal = (i: number, t: number): THREE.Matrix4 => {
    const ch = nodeChannels.get(i) ?? {};
    const b = base(nodes[i]);
    const tr = ch.translation ? sampleChannel(ch.translation, t) : b.t;
    const ro = ch.rotation ? sampleChannel(ch.rotation, t) : b.r;
    const sc = ch.scale ? sampleChannel(ch.scale, t) : b.s;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(tr[0], tr[1], tr[2]),
      new THREE.Quaternion(ro[0], ro[1], ro[2], ro[3]),
      new THREE.Vector3(sc[0], sc[1], sc[2]),
    );
  };
  const nodeWorld = (i: number, t: number): THREE.Matrix4 => {
    let m = nodeLocal(i, t);
    let cur = childToParent.get(i);
    while (cur !== undefined && !roots.has(cur)) {
      m = nodeLocal(cur, t).multiply(m);
      cur = childToParent.get(cur);
    }
    return m;
  };

  const joints: ImportedJoint[] = jointNodeIndices.map((nodeIdx) => {
    const node = nodes[nodeIdx];
    const ch = nodeChannels.get(nodeIdx) ?? {};
    const b = base(node);
    const poses = keyframeTimes.map((t) => {
      const tr = ch.translation ? sampleChannel(ch.translation, t) : b.t;
      const ro = ch.rotation ? sampleChannel(ch.rotation, t) : b.r;
      const sc = ch.scale ? sampleChannel(ch.scale, t) : b.s;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(tr[0], tr[1], tr[2]),
        new THREE.Quaternion(ro[0], ro[1], ro[2], ro[3]),
        new THREE.Vector3(sc[0], sc[1], sc[2]),
      );
      return transformFromMatrix(m);
    });
    const memberOriginalIds = (node.children ?? []).filter(isLeaf).map((c) => nodes[c].name!);
    return {
      name: node.name ?? 'Joint',
      parentIndex: nearestJointAncestor(nodeIdx),
      memberOriginalIds,
      poses,
    };
  });

  // Which keyframe does the part's MODELED placement match — the first (t=0) or the
  // last? KSA parts are modeled in their DEPLOYED configuration, but a deploy GLB runs
  // stowed(t=0) → deployed(tEnd); for those the placements line up with the last
  // keyframe. Compare each member leaf's GLB world position at the first vs last time
  // against its placement and pick the closer end (ties / non-movers don't sway it).
  const tFirst = keyframeTimes[0];
  const tLast = keyframeTimes[keyframeTimes.length - 1];
  let resFirst = 0;
  let resLast = 0;
  if (tLast > tFirst && opts.placements) {
    for (let i = 0; i < nodes.length; i++) {
      if (!isLeaf(i)) continue;
      const placement = opts.placements.get(nodes[i].name!);
      if (!placement) continue;
      const p = new THREE.Vector3(placement.position.x, placement.position.y, placement.position.z);
      resFirst += p.distanceTo(new THREE.Vector3().setFromMatrixPosition(nodeWorld(i, tFirst)));
      resLast += p.distanceTo(new THREE.Vector3().setFromMatrixPosition(nodeWorld(i, tLast)));
    }
  }
  const restAtLastKeyframe = resLast < resFirst;

  // Each animated member's GLB-faithful Part-local pose at the rest keyframe — the same
  // matrix KSA assigns the SubPart on spawn (its leaf-static-offset carried up the joint
  // chain). The importer uses this to OVERRIDE the geometry placement so flexo positions
  // animated SubParts from the GLB, exactly like the game (which never trusts the
  // geometry `<Position>` for them). `restTime` mirrors restAnchorTime: t=0 for an
  // actuate/authored clip, the last keyframe for an imported deploy.
  const restTime = restAtLastKeyframe ? tLast : tFirst;
  const memberRestPlacements = new Map<string, Transform>();
  for (let i = 0; i < nodes.length; i++) {
    if (!isLeaf(i) || nearestJointAncestor(i) === null) continue;
    memberRestPlacements.set(nodes[i].name!, transformFromMatrix(nodeWorld(i, restTime)));
  }

  return {
    name: opts.module.moduleId || anim.name || 'Animation',
    durationSec: keyframeTimes[keyframeTimes.length - 1] ?? 0,
    showDeployRetract: opts.module.showDeployRetract,
    keyframeTimes,
    joints,
    restAtLastKeyframe,
    cubicSplineApprox: sawCubicSpline,
    memberRestPlacements,
    solarTracking: opts.module.solarTracking
      ? {
          degreesPerSecond: opts.module.solarTracking.degreesPerSecond,
          subPartOriginalId: opts.module.solarTracking.subPartOriginalId,
          excludeOriginalIds: opts.module.solarTracking.excludeOriginalIds,
        }
      : null,
  };
}

// ── remap to editor instance ids + fresh ids ─────────────────────────────────--

/**
 * Finalizes an {@link ImportedAnimation} into a {@link PartAnimation}: assigns fresh
 * anim/joint/keyframe ids via `makeId`, and remaps every ORIGINAL instance-id reference
 * (joint members + solar-tracking SubParts) through `idMap` (the importer's old→new map),
 * dropping references whose placement wasn't imported.
 */
export function remapImportedAnimation(
  imported: ImportedAnimation,
  idMap: ReadonlyMap<string, string>,
  makeId: (prefix: string) => string,
): PartAnimation {
  const animId = makeId('anim');
  const jointIds = imported.joints.map(() => makeId('joint'));
  const remap = (origId: string): string | undefined => idMap.get(origId);

  const joints = imported.joints.map((j, i) => ({
    id: jointIds[i],
    name: j.name,
    parentJointId: j.parentIndex != null ? jointIds[j.parentIndex] : null,
    memberInstanceIds: j.memberOriginalIds.map(remap).filter((id): id is string => !!id),
  }));

  const keyframes = imported.keyframeTimes.map((timeSec, ti) => ({
    id: makeId('kf'),
    timeSec,
    poses: Object.fromEntries(imported.joints.map((j, i) => [jointIds[i], j.poses[ti]])),
  }));

  const st = imported.solarTracking;
  const solarTracking = st
    ? {
        degreesPerSecond: st.degreesPerSecond,
        subPartInstanceId: remap(st.subPartOriginalId) ?? '',
        excludeInstanceIds: st.excludeOriginalIds.map(remap).filter((id): id is string => !!id),
      }
    : null;

  return {
    id: animId,
    name: imported.name,
    durationSec: imported.durationSec,
    mode: imported.showDeployRetract ? 'deployRetract' : 'actuate',
    joints,
    keyframes,
    ...(imported.cubicSplineApprox ? { cubicSplineApprox: true as const } : {}),
    solarTracking,
  };
}
