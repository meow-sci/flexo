/**
 * Site overlays (plans/ICRP_PLAN.md P4.08), drawn from the active object's
 * metres in THREE space (the ground plane is native three Y=0):
 *  - FootprintRadius disc (spawn-bump + clutter gate area, fact F8);
 *  - clutter-clearance ring at FootprintRadius + 50 m;
 *  - the 300 m collider pick radius (a vessel farther from the landmark gets
 *    no pad collision, fact F9);
 *  - SurfaceHeight plane at up = GroundOffset + SurfaceHeight (vessel spawn
 *    altitude, fact L6).
 */
import * as THREE from 'three';

const COLLIDER_PICK_RADIUS_M = 300;
const CLUTTER_CLEARANCE_M = 50;

function ring(radius: number, color: number, opacity: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(radius - 0.4, radius + 0.4, 128);
  const mat = new THREE.MeshBasicMaterial({
    color,
    opacity,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export class FootprintLayer {
  readonly group = new THREE.Group();

  constructor() {
    this.group.name = 'footprint-overlays';
    this.group.renderOrder = 2;
  }

  /** Rebuilds the overlays from the object's metres (null = unset = hidden). */
  update(meters: {
    groundOffsetM: number | null;
    surfaceHeightM: number | null;
    footprintRadiusM: number | null;
  }): void {
    this.clear();

    if (meters.footprintRadiusM !== null && meters.footprintRadiusM > 0) {
      const r = meters.footprintRadiusM;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(r, 128),
        new THREE.MeshBasicMaterial({
          color: 0x2cfa1f,
          opacity: 0.06,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.05;
      this.group.add(disc);
      this.group.add(ring(r, 0x2cfa1f, 0.5));
      this.group.add(ring(r + CLUTTER_CLEARANCE_M, 0x8a8f98, 0.3));
    }

    this.group.add(ring(COLLIDER_PICK_RADIUS_M, 0xf5c542, 0.25));

    if (meters.surfaceHeightM !== null) {
      const y = (meters.groundOffsetM ?? 0) + meters.surfaceHeightM;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshBasicMaterial({
          color: 0x54a8fb,
          opacity: 0.12,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = y;
      this.group.add(plane);
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  private clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[this.group.children.length - 1];
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
      this.group.remove(child);
    }
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
