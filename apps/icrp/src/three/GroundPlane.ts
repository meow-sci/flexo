/**
 * The ground: a metre grid on the KSA X=0 plane (three Y=0), with north/east
 * arrows at the origin (plans/ICRP_PLAN.md P2.03). Lives OUTSIDE the basis root
 * — three's grid is Y-up-native, and the KSA ground plane maps onto three Y=0
 * exactly, so building it in three space avoids double-transforming.
 *
 * Sized for a launch complex: Core's pad spans ~164 m; the grid covers 1 km.
 */
import * as THREE from 'three';

const GRID_SIZE = 1000;

export class GroundPlane {
  readonly group = new THREE.Group();

  constructor() {
    this.group.name = 'ground';

    // 10 m divisions across 1 km, with a brighter 100 m super-grid.
    const fine = new THREE.GridHelper(GRID_SIZE, GRID_SIZE / 10, 0x2a2d32, 0x22252a);
    const coarse = new THREE.GridHelper(GRID_SIZE, GRID_SIZE / 100, 0x3a3e45, 0x2f333a);
    coarse.position.y = 0.001; // avoid z-fighting the fine grid
    this.group.add(fine, coarse);

    // Compass at the origin: north = three −Z (KSA +Z), east = three +X (KSA +Y).
    const north = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0.02, 0),
      12,
      0xef4444,
      3,
      1.5,
    );
    const east = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0.02, 0),
      12,
      0xf5c542,
      3,
      1.5,
    );
    this.group.add(north, east);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) for (const m of mat) m.dispose();
      else mat?.dispose();
    });
  }
}
