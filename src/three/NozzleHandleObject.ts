import * as THREE from 'three';
import type { NozzleChannel } from '../state/engineStore';

/** Amber — the PHYSICS channel (`<ExhaustLocation>`/`<ExhaustDirection>`, i.e. the thrust axis). */
const COLOR_PHYSICS = 0xff8c2a;

/**
 * Cyan — the FX override channel. Mirrors KSA's own in-game debug overlay, which draws the
 * `FxExhaustDirection` arrow in Cyan/Blue (`decomp/KSA/Vehicle.cs:3542`, `:5051`) while the
 * thrust arrow stays red/white. Keeping the game's colour language means a flexo author can
 * read the debug overlay against what they authored without a translation step.
 */
const COLOR_FX = 0x2ad4ff;

/**
 * How far an inactive handle's colour is pulled toward black. Applied in the renderer's
 * LINEAR working space (three's colour management converts the sRGB literal on the way in),
 * so it reads as ~70% brightness on screen rather than 45% — deliberately gentle, since
 * {@link OPACITY_INACTIVE} already carries "secondary" and the whole point of drawing every
 * nozzle is that the inactive ones stay legible.
 */
const DIM_FACTOR = 0.45;
const OPACITY_ACTIVE = 0.95;
const OPACITY_INACTIVE = 0.4;

/** Draw order for the depth-test-free handles; above geometry, below nothing else we own. */
const RENDER_ORDER = 10;

const PLUS_X = new THREE.Vector3(1, 0, 0);

/**
 * A pickable 3D marker for one nozzle exhaust placement: a small cube at the exhaust
 * LOCATION plus a cone pointing along the exhaust DIRECTION (the way gas leaves; thrust
 * acts opposite). Mirrors {@link import('./ConnectorObject').ConnectorObject}'s cube+cone,
 * but the cone aims at an arbitrary direction vector rather than local +X.
 *
 * One of these exists per nozzle per channel while the Engine designer is open, so an
 * N-bell RCS block reads at a glance. Clicking one makes it the gizmo's target
 * (`userData.selectable`, resolved by {@link import('./SelectionManager').SelectionManager}
 * to `kind: 'nozzle'`); the {@link import('./TransformGizmo').TransformGizmo} still drags a
 * proxy rather than this object, like the animation pose pivot.
 *
 * DEPTH TESTING IS OFF by design: an exhaust point normally sits inside or at the lip of a
 * nozzle bell, so a depth-tested marker would be swallowed by the very mesh it describes —
 * invisible and, now that it is pickable, unclickable.
 */
export class NozzleHandleObject {
  readonly group = new THREE.Group();
  private readonly cubeGeometry: THREE.BoxGeometry;
  private readonly coneGeometry: THREE.ConeGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly baseColor: THREE.Color;

  /**
   * `selectableId` is the {@link import('../state/engineStore').NozzleTarget.key} this
   * handle stands for — click-selection routes it straight back to a `NozzleRef`. `size`
   * is the marker's world size in meters (cube edge).
   */
  constructor(selectableId: string, channel: NozzleChannel, size = 0.12) {
    this.group.name = `nozzle-exhaust-handle:${selectableId}`;
    const selectable = { kind: 'nozzle', id: selectableId };
    this.group.userData.selectable = selectable;
    this.baseColor = new THREE.Color(channel === 'fx' ? COLOR_FX : COLOR_PHYSICS);
    this.material = new THREE.MeshBasicMaterial({
      color: this.baseColor.clone(),
      transparent: true,
      opacity: OPACITY_ACTIVE,
      depthTest: false,
      depthWrite: false,
    });

    this.cubeGeometry = new THREE.BoxGeometry(size, size, size);
    const cube = new THREE.Mesh(this.cubeGeometry, this.material);
    cube.renderOrder = RENDER_ORDER;
    cube.userData.selectable = selectable;
    this.group.add(cube);

    const coneLength = size * 2;
    this.coneGeometry = new THREE.ConeGeometry(size / 2, coneLength, 16);
    const cone = new THREE.Mesh(this.coneGeometry, this.material);
    cone.renderOrder = RENDER_ORDER;
    cone.userData.selectable = selectable;
    // The cone is built around +Y; rotate so it points along the group's +X, then the
    // group's quaternion aims +X at the exhaust direction (set in setPose).
    cone.rotation.z = -Math.PI / 2;
    cone.position.x = size / 2 + coneLength / 2;
    this.group.add(cone);
  }

  /** Places the marker at a world position and aims its cone along a world direction. */
  setPose(worldPos: THREE.Vector3, worldDir: THREE.Vector3): void {
    this.group.position.copy(worldPos);
    const dir = worldDir.lengthSq() > 1e-9 ? worldDir.clone().normalize() : PLUS_X;
    this.group.quaternion.setFromUnitVectors(PLUS_X, dir);
  }

  /** Full colour for the gizmo's target; dimmed for the other nozzles of the same engine. */
  setActive(active: boolean): void {
    this.material.color.copy(this.baseColor);
    if (!active) this.material.color.multiplyScalar(DIM_FACTOR);
    this.material.opacity = active ? OPACITY_ACTIVE : OPACITY_INACTIVE;
  }

  dispose(): void {
    this.cubeGeometry.dispose();
    this.coneGeometry.dispose();
    this.material.dispose();
  }
}
