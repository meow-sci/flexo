/**
 * Generated-geometry math for the engine wizard — pure, tested, framework-free
 * (`plans/ENGINE_WIZARD_PLAN.md` §6).
 *
 * Every box the wizard generates is an UNROTATED primitive Box laid along local X, because
 * KSA's thrust axis is local X (§2.5 rule 1: the nozzle's default `ExhaustDirection` is
 * `(-1,0,0)` and the gimbal authority vector is `float3(0, sin Y, sin Z)`, so thrust off X
 * would turn one gimbal axis into a useless roll). `BoxParams.width` is therefore the X
 * extent, and nothing here ever emits a rotation.
 */

import type { BoxParams, PrimitiveSpec, Vec3 } from '../../../ksa/types';

/** One generated primitive box: what to build, what to call it, and where to place it. */
export interface GeneratedBox {
  name: string;
  primitive: PrimitiveSpec;
  position: Vec3;
}

/** User-editable dimensions of the generated liquid-engine geometry (§6.1 defaults). */
export interface LiquidGen {
  bellWidthM: number;
  bellCrossM: number;
  bodyLengthM: number;
  bodyCrossM: number;
}

/** User-editable dimensions of the generated SRB geometry (§6.2 defaults). */
export interface SrbGen {
  casingOuterRadiusM: number;
  casingLengthM: number;
  nozzleBlockM: number;
}

/** User-editable dimensions of the generated RCS geometry (§6.3 defaults). */
export interface RcsGen {
  blockSizeM: number;
}

/** An auto-fitted collider. `size` is FULL lengths in metres; a Cylinder's axis is X. */
export interface ColliderExtents {
  shape: 'Box' | 'Cylinder';
  center: Vec3;
  size: Vec3;
}

/** One RCS nozzle placement: where it sits and which way it fires. */
export interface RcsNozzleSpec {
  location: Vec3;
  direction: Vec3;
}

export const LIQUID_GEN_DEFAULTS: LiquidGen = {
  bellWidthM: 1.2,
  bellCrossM: 1.2,
  bodyLengthM: 2.5,
  bodyCrossM: 1.2,
};

export const SRB_GEN_DEFAULTS: SrbGen = {
  casingOuterRadiusM: 0.5,
  casingLengthM: 2,
  nozzleBlockM: 0.6,
};

export const RCS_GEN_DEFAULTS: RcsGen = { blockSizeM: 0.3 };

function box(name: string, params: BoxParams, position: Vec3): GeneratedBox {
  return { name, primitive: { kind: 'box', params }, position };
}

/**
 * The liquid engine's two boxes plus the anchors the rest of the build hangs off.
 *
 * The BELL is the engine host (index 0) — its SubPart carries the combustor/nozzle/rocket
 * modules, so the exhaust leaves the bell's aft face.
 */
export function liquidGeometry(gen: LiquidGen): {
  boxes: [GeneratedBox, GeneratedBox];
  hostIndex: 0;
  attachNodeX: number;
  tankCenterX: number;
  exhaustLocation: Vec3;
  suggestedExitDiameterM: number;
} {
  const { bellWidthM, bellCrossM, bodyLengthM, bodyCrossM } = gen;
  const bell = box(
    'Bell',
    { width: bellWidthM, height: bellCrossM, depth: bellCrossM },
    { x: 0, y: 0, z: 0 },
  );
  const body = box(
    'Body',
    { width: bodyLengthM, height: bodyCrossM, depth: bodyCrossM },
    { x: bellWidthM / 2 + bodyLengthM / 2, y: 0, z: 0 },
  );
  return {
    boxes: [bell, body],
    hostIndex: 0,
    attachNodeX: bellWidthM / 2 + bodyLengthM,
    tankCenterX: bellWidthM / 2 + bodyLengthM / 2,
    exhaustLocation: { x: -bellWidthM / 2, y: 0, z: 0 },
    suggestedExitDiameterM: Math.round(bellCrossM * 0.9 * 10) / 10,
  };
}

/**
 * The SRB's two boxes, its grain-segment centres, and the anchors the build hangs off.
 *
 * The CASING is the engine host (index 1) — the solid motor + grain segments live with the
 * case, and the nozzle block is only the aft plug the exhaust leaves from.
 */
export function srbGeometry(
  gen: SrbGen,
  segmentCount: number,
): {
  boxes: [GeneratedBox, GeneratedBox];
  hostIndex: 1;
  attachNodeX: number;
  grainCenterXs: number[];
  grainSegmentLengthM: number;
  exhaustLocation: Vec3;
} {
  const { casingOuterRadiusM, casingLengthM, nozzleBlockM } = gen;
  const nozzle = box(
    'Nozzle Block',
    { width: nozzleBlockM, height: nozzleBlockM, depth: nozzleBlockM },
    { x: 0, y: 0, z: 0 },
  );
  const casing = box(
    'Casing',
    { width: casingLengthM, height: 2 * casingOuterRadiusM, depth: 2 * casingOuterRadiusM },
    { x: nozzleBlockM / 2 + casingLengthM / 2, y: 0, z: 0 },
  );
  const grainCenterXs: number[] = [];
  for (let i = 0; i < segmentCount; i++) {
    grainCenterXs.push(nozzleBlockM / 2 + ((i + 0.5) * casingLengthM) / segmentCount);
  }
  return {
    boxes: [nozzle, casing],
    hostIndex: 1,
    attachNodeX: nozzleBlockM / 2 + casingLengthM,
    grainCenterXs,
    grainSegmentLengthM: casingLengthM / segmentCount,
    exhaustLocation: { x: -nozzleBlockM / 2, y: 0, z: 0 },
  };
}

/** The RCS block: one cube at the origin, with its attach node on the forward face. */
export function rcsGeometry(gen: RcsGen): {
  boxes: [GeneratedBox];
  hostIndex: 0;
  attachNodeX: number;
} {
  const { blockSizeM } = gen;
  const block = box(
    'Thruster Block',
    { width: blockSizeM, height: blockSizeM, depth: blockSizeM },
    { x: 0, y: 0, z: 0 },
  );
  return { boxes: [block], hostIndex: 0, attachNodeX: blockSizeM / 2 };
}

/**
 * Nozzle placements for an RCS layout preset, `s` metres out from the block centre
 * (production passes half the block size). Every direction is already unit length.
 */
export function rcsLayout(preset: 'single' | 'quad' | 'six', s: number): RcsNozzleSpec[] {
  if (preset === 'single') {
    return [{ location: { x: -s, y: 0, z: 0 }, direction: { x: -1, y: 0, z: 0 } }];
  }
  const quad: RcsNozzleSpec[] = [
    { location: { x: 0, y: s, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
    { location: { x: 0, y: -s, z: 0 }, direction: { x: 0, y: -1, z: 0 } },
    { location: { x: 0, y: 0, z: s }, direction: { x: 0, y: 0, z: 1 } },
    { location: { x: 0, y: 0, z: -s }, direction: { x: 0, y: 0, z: -1 } },
  ];
  if (preset === 'quad') return quad;
  return [
    ...quad,
    { location: { x: s, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    { location: { x: -s, y: 0, z: 0 }, direction: { x: -1, y: 0, z: 0 } },
  ];
}

/** The collider that wraps a family's generated geometry (§6.4). */
export function colliderExtents(family: 'liquid', gen: LiquidGen): ColliderExtents;
export function colliderExtents(family: 'srb', gen: SrbGen): ColliderExtents;
export function colliderExtents(family: 'rcs', gen: RcsGen): ColliderExtents;
export function colliderExtents(
  family: 'liquid' | 'srb' | 'rcs',
  gen: LiquidGen | SrbGen | RcsGen,
): ColliderExtents {
  if (family === 'liquid') {
    const { bellWidthM, bellCrossM, bodyLengthM, bodyCrossM } = gen as LiquidGen;
    const maxCross = Math.max(bellCrossM, bodyCrossM);
    return {
      shape: 'Box',
      center: { x: bodyLengthM / 2, y: 0, z: 0 },
      size: { x: bellWidthM + bodyLengthM, y: maxCross, z: maxCross },
    };
  }
  if (family === 'srb') {
    const { casingOuterRadiusM, casingLengthM, nozzleBlockM } = gen as SrbGen;
    return {
      shape: 'Cylinder',
      center: { x: casingLengthM / 2, y: 0, z: 0 },
      size: {
        x: nozzleBlockM + casingLengthM,
        y: 2 * casingOuterRadiusM,
        z: 2 * casingOuterRadiusM,
      },
    };
  }
  const { blockSizeM } = gen as RcsGen;
  return {
    shape: 'Box',
    center: { x: 0, y: 0, z: 0 },
    size: { x: blockSizeM, y: blockSizeM, z: blockSizeM },
  };
}
