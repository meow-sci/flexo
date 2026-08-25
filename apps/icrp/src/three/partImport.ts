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
import { colliderLocalFromWorld, matrixFromTransform } from '../../../../src/three/coords';
import * as THREE from 'three';
import type { CatalogPart } from '../../../../src/ksa/partCatalog';
import type { PartCollider, SnapConnector, Transform } from '../ksa/types';

export interface PreparedPartImport {
  placements: CatalogPart['placements'];
  /** Part-level colliders localized into the FIRST importable placement's frame. */
  anchorColliders: PartCollider[];
  /** Part connectors localized the same way — the magnetic snap points. */
  anchorConnectors: SnapConnector[];
  /** Part-level collider count that had no importable placement to ride. */
  droppedPartColliders: number;
}

/**
 * Re-expresses a part-frame connector in the anchor placement's local frame
 * (pos/rot only — connectors have no size; anchor scale divides out so the
 * composed world point lands back where the part authored it).
 */
function connectorLocalToAnchor(
  conn: { id: string; position: Transform['position']; rotation: Transform['rotation'] },
  anchor: Transform,
): SnapConnector {
  const inv = matrixFromTransform(anchor).invert();
  const p = new THREE.Vector3(conn.position.x, conn.position.y, conn.position.z).applyMatrix4(inv);
  const anchorQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(anchor.rotation.x, anchor.rotation.y, anchor.rotation.z, 'ZYX'),
  );
  const connQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(conn.rotation.x, conn.rotation.y, conn.rotation.z, 'ZYX'),
  );
  const local = new THREE.Euler().setFromQuaternion(anchorQ.invert().multiply(connQ), 'ZYX');
  return {
    id: conn.id,
    position: { x: p.x, y: p.y, z: p.z },
    rotation: { x: local.x, y: local.y, z: local.z },
  };
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
  if (!anchor) {
    return {
      placements: part.placements,
      anchorColliders: [],
      anchorConnectors: [],
      droppedPartColliders: partLevel.length,
    };
  }
  const anchorTransform: Transform = {
    position: anchor.position,
    rotation: anchor.rotation,
    scale: anchor.scale,
  };
  const anchorConnectors = (part.connectors ?? []).map((c) =>
    connectorLocalToAnchor(c, anchorTransform),
  );
  if (partLevel.length === 0) {
    return {
      placements: part.placements,
      anchorColliders: [],
      anchorConnectors,
      droppedPartColliders: 0,
    };
  }
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
  return {
    placements: part.placements,
    anchorColliders,
    anchorConnectors,
    droppedPartColliders: 0,
  };
}
