/**
 * Collider visualization (the collider-system follow-up): every collider in the
 * active object, drawn with flexo's ColliderObject (wire + translucent pick
 * fill; the node's scale IS the size in metres, which is what lets the scale
 * gizmo resize dimensions directly).
 *
 * Three kinds, one color language:
 *  - piece-TEMPLATE colliders (amber, dimmed, NOT pickable) — owned by the
 *    `<StaticSubObject>` declaration, shared by every placement; drawn per
 *    placement composed with its position/rotation only (KSA ignores placement
 *    scale — the export bakes scaled VARIANTS instead, so the dimmed wire shows
 *    the true in-game volume for unit-scale placements);
 *  - placement-OWNED colliders (full amber, pickable) — editable, composed with
 *    the placement's position/rotation;
 *  - OBJECT-level colliders (full amber, pickable) — editable, object frame.
 *
 * Pickable colliders carry `userData.selectable = { kind: 'collider', id }`
 * where id encodes the owner: `"<placementId>::<colliderId>"` or
 * `"@object::<colliderId>"` (SelectionManager passes it through).
 */
import * as THREE from 'three';
import { ColliderObject } from '../../../../src/three/ColliderObject';
import { colliderWorld } from '../../../../src/three/coords';
import type { CatalogStaticPiece } from '../ksa/staticCatalog';
import type { PartCollider, StaticObjectDoc, Transform } from '../ksa/types';
import type { ColliderRef } from '../state/docStore';

export const OBJECT_OWNER_TOKEN = '@object';

export function encodeColliderRef(ref: ColliderRef): string {
  return `${ref.owner ?? OBJECT_OWNER_TOKEN}::${ref.colliderId}`;
}

export function decodeColliderRef(id: string): ColliderRef | null {
  const sep = id.indexOf('::');
  if (sep < 0) return null;
  const owner = id.slice(0, sep);
  return { owner: owner === OBJECT_OWNER_TOKEN ? null : owner, colliderId: id.slice(sep + 2) };
}

const TEMPLATE_OPACITY = 0.3;

interface Entry {
  obj: ColliderObject;
  key: string;
}

export class ColliderVisLayer {
  /** Parent under the basis root (all placement math in KSA frame). */
  readonly group = new THREE.Group();
  private entries: Entry[] = [];
  private pickable = true;

  constructor() {
    this.group.name = 'collider-vis';
  }

  /**
   * Full rebuild (collider counts are small; a diff is not worth the state).
   * `pickable` = colliders-mode only: in build mode the wires render (when
   * toggled on) but never steal clicks from pieces.
   */
  update(
    doc: StaticObjectDoc,
    pieceIndex: ReadonlyMap<string, CatalogStaticPiece>,
    visible: boolean,
    pickable: boolean,
  ): void {
    this.clear();
    this.group.visible = visible;
    this.pickable = pickable;
    if (!visible) return;

    const placementFrame = (t: Transform): Transform => ({
      position: t.position,
      rotation: t.rotation,
      scale: { x: 1, y: 1, z: 1 }, // KSA never applies placement scale to colliders
    });

    for (const pl of doc.placements) {
      const frame = placementFrame(pl.transform);
      // Template colliders: read-only, dimmed.
      const piece = pieceIndex.get(pl.pieceId);
      for (const c of piece?.colliders ?? []) {
        this.add(c, this.composed(c, frame), null, `tpl:${pl.instanceId}:${c.id}`);
      }
      // Placement-owned: pickable.
      for (const c of pl.colliders ?? []) {
        this.add(
          c,
          this.composed(c, frame),
          encodeColliderRef({ owner: pl.instanceId, colliderId: c.id }),
          `own:${pl.instanceId}:${c.id}`,
        );
      }
    }
    for (const c of doc.objectColliders) {
      this.add(c, null, encodeColliderRef({ owner: null, colliderId: c.id }), `obj:${c.id}`);
    }
  }

  /** The pickable visual for a ref (gizmo attach target), or null. */
  getPickable(ref: ColliderRef): THREE.Object3D | null {
    const id = encodeColliderRef(ref);
    for (const e of this.entries) {
      const selectable = e.obj.group.userData.selectable as { id: string } | undefined;
      if (selectable && selectable.id === id) return e.obj.group;
    }
    return null;
  }

  /** Highlights the selected collider (and un-highlights the rest). */
  setSelected(ref: ColliderRef | null): void {
    const id = ref ? encodeColliderRef(ref) : null;
    for (const e of this.entries) {
      const selectable = e.obj.group.userData.selectable as { id: string } | undefined;
      e.obj.setSelected(!!selectable && selectable.id === id);
    }
  }

  private composed(c: PartCollider, frame: Transform): Transform {
    return colliderWorld({ position: c.position, rotation: c.rotation, scale: c.scale }, frame);
  }

  private add(
    collider: PartCollider,
    worldOverride: Transform | null,
    pickId: string | null,
    key: string,
  ): void {
    const obj = new ColliderObject(collider);
    obj.setCollider(collider, worldOverride ?? undefined);
    if (pickId && this.pickable) {
      // Re-point the selectable at OUR owner-encoded id (ColliderObject minted
      // its own from the raw collider id).
      const selectable = { kind: 'collider', id: pickId };
      obj.group.userData.selectable = selectable;
      obj.group.traverse((child) => {
        if (child.userData.selectable) child.userData.selectable = selectable;
      });
    } else {
      // Template colliders: dimmed and unpickable.
      obj.group.userData.selectable = undefined;
      obj.group.traverse((child) => {
        child.userData.selectable = undefined;
        const mesh = child as THREE.Mesh;
        if (mesh.raycast) mesh.raycast = () => {};
        const mat = (mesh as { material?: THREE.Material }).material;
        if (mat && 'opacity' in mat) mat.opacity *= TEMPLATE_OPACITY;
      });
    }
    this.group.add(obj.group);
    this.entries.push({ obj, key });
  }

  private clear(): void {
    for (const e of this.entries) e.obj.dispose();
    this.entries = [];
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[this.group.children.length - 1]);
    }
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
