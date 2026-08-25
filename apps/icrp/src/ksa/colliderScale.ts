/**
 * Bakes a placement's SCALE into collider data (the collider-system follow-up).
 *
 * KSA never scales colliders with a placement (`StaticObject.cs:195-196`), so a
 * scaled placement's collision would drift from its visuals. ICRP makes scaling
 * "just work" by baking at export:
 *  - placement-OWNED colliders: scaled here, then composed object-level;
 *  - piece-TEMPLATE colliders: the placement is re-pointed at an auto-minted
 *    VARIANT `<StaticSubObject>` whose colliders are pre-scaled (modPlan).
 *
 * Exactness: positions scale per-axis. Sizes are exact for identity-rotated
 * colliders (per-axis) and for uniform scales; a NON-uniformly scaled ROTATED
 * collider has no primitive-preserving transform (it shears), so the volume-
 * preserving mean factor is used — documented approximation.
 */
import { normalizeColliderSize } from '../../../../src/ksa/colliderSize';
import type { PartCollider, Vec3 } from './types';

const EPS = 1e-9;

export function isUnitScale(s: Vec3): boolean {
  return Math.abs(s.x - 1) < EPS && Math.abs(s.y - 1) < EPS && Math.abs(s.z - 1) < EPS;
}

function isIdentityRotation(r: Vec3): boolean {
  return Math.abs(r.x) < EPS && Math.abs(r.y) < EPS && Math.abs(r.z) < EPS;
}

function isUniform(s: Vec3): boolean {
  return Math.abs(s.x - s.y) < EPS && Math.abs(s.y - s.z) < EPS;
}

/** Returns `collider` with the owner's scale baked into position + size. */
export function scaleCollider(collider: PartCollider, ownerScale: Vec3): PartCollider {
  if (isUnitScale(ownerScale)) return collider;
  const s = ownerScale;
  const position = {
    x: collider.position.x * s.x,
    y: collider.position.y * s.y,
    z: collider.position.z * s.z,
  };
  let size: Vec3;
  if (isUniform(s) || isIdentityRotation(collider.rotation)) {
    // Exact: the collider's local axes align with the owner's (or the scale is
    // isotropic), so each dimension takes its own factor.
    const f = isUniform(s) ? { x: s.x, y: s.x, z: s.x } : s;
    size = {
      x: collider.scale.x * f.x,
      y: collider.scale.y * f.y,
      z: collider.scale.z * f.z,
    };
  } else {
    // Approximation: volume-preserving mean factor for rotated colliders under
    // non-uniform scale (a sheared primitive cannot be represented).
    const f = Math.cbrt(Math.abs(s.x * s.y * s.z));
    size = { x: collider.scale.x * f, y: collider.scale.y * f, z: collider.scale.z * f };
  }
  return { ...collider, position, scale: normalizeColliderSize(collider.shape, size) };
}

/** A stable variant key for one (piece, scale) pair — dedupes minted variants. */
export function scaleVariantKey(pieceId: string, s: Vec3): string {
  const r = (n: number) => String(Math.round(n * 1e6) / 1e6);
  return `${pieceId}|${r(s.x)},${r(s.y)},${r(s.z)}`;
}
