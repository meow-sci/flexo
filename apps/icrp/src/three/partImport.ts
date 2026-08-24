/**
 * Stock-part import math (the quaternion carve-out that keeps state/ three-free).
 *
 * A vessel `<Part>`'s collision volume is often authored PART-level (the fuel
 * tanks' cylinders live under `<PartGameData><Collider>`, owner = null). Those
 * shapes are in the PART frame; ICRP anchors them onto the first importable
 * placement by re-expressing each in that placement's local frame with flexo's
 * calibrated `colliderLocalFromWorld` (position/rotation compose, scale = size
 * in metres — never composed, matching KSA, fact F4/I3).
 */
import { colliderLocalFromWorld } from '../../../../src/three/coords';
import type { CatalogPart } from '../../../../src/ksa/partCatalog';
import type { PartCollider, Transform } from '../ksa/types';

export interface PreparedPartImport {
  placements: CatalogPart['placements'];
  /** Part-level colliders localized into the FIRST importable placement's frame. */
  anchorColliders: PartCollider[];
  /** Part-level collider count that had no importable placement to ride. */
  droppedPartColliders: number;
}

/**
 * Splits a stock part into importable placements + anchor colliders.
 * SubPart-template-owned colliders are NOT taken here — they already ride the
 * piece templates (catalogStore's GameData-collider enrichment).
 */
export function preparePartImport(
  part: CatalogPart,
  pieceExists: (pieceId: string) => boolean,
): PreparedPartImport {
  const partLevel = part.colliders.filter((c) => c.ownerTemplateId === null);
  const anchor = part.placements.find((pl) => pieceExists(pl.subPartTemplateId));
  if (!anchor || partLevel.length === 0) {
    return {
      placements: part.placements,
      anchorColliders: [],
      droppedPartColliders: anchor ? 0 : partLevel.length,
    };
  }
  const anchorTransform: Transform = {
    position: anchor.position,
    rotation: anchor.rotation,
    scale: anchor.scale,
  };
  const anchorColliders = partLevel.map((c) => {
    const local = colliderLocalFromWorld(
      { position: c.position, rotation: c.rotation, scale: c.scale },
      anchorTransform,
    );
    return {
      ...c,
      ownerTemplateId: null,
      position: local.position,
      rotation: local.rotation,
      scale: local.scale,
    };
  });
  return { placements: part.placements, anchorColliders, droppedPartColliders: 0 };
}
