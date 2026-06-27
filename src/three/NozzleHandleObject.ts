import * as THREE from 'three'

const COLOR = 0xff8c2a // amber — reads as "exhaust"
const PLUS_X = new THREE.Vector3(1, 0, 0)

/**
 * A non-pickable 3D marker for a nozzle's exhaust: a small cube at the exhaust
 * LOCATION plus a cone pointing along the exhaust DIRECTION (the way gas leaves;
 * thrust acts opposite). Mirrors {@link import('./ConnectorObject').ConnectorObject}'s
 * cube+cone, but the cone aims at an arbitrary direction vector rather than local +X,
 * and it's never selectable — the {@link import('./TransformGizmo').TransformGizmo}
 * (attached to a proxy) provides the drag interaction, like the animation pose pivot.
 */
export class NozzleHandleObject {
  readonly group = new THREE.Group()
  private readonly cubeGeometry: THREE.BoxGeometry
  private readonly coneGeometry: THREE.ConeGeometry
  private readonly material: THREE.MeshBasicMaterial
  private readonly cone: THREE.Mesh

  /** `size` is the marker's world size in meters (cube edge). */
  constructor(size = 0.12) {
    this.group.name = 'nozzle-exhaust-handle'
    this.group.raycast = () => {} // never pickable
    this.material = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.9 })

    this.cubeGeometry = new THREE.BoxGeometry(size, size, size)
    const cube = new THREE.Mesh(this.cubeGeometry, this.material)
    cube.raycast = () => {}
    this.group.add(cube)

    const coneLength = size * 2
    this.coneGeometry = new THREE.ConeGeometry(size / 2, coneLength, 16)
    this.cone = new THREE.Mesh(this.coneGeometry, this.material)
    this.cone.raycast = () => {}
    // The cone is built around +Y; rotate so it points along the group's +X, then the
    // group's quaternion aims +X at the exhaust direction (set in setPose).
    this.cone.rotation.z = -Math.PI / 2
    this.cone.position.x = size / 2 + coneLength / 2
    this.group.add(this.cone)
  }

  /** Places the marker at a world position and aims its cone along a world direction. */
  setPose(worldPos: THREE.Vector3, worldDir: THREE.Vector3): void {
    this.group.position.copy(worldPos)
    const dir = worldDir.lengthSq() > 1e-9 ? worldDir.clone().normalize() : PLUS_X
    this.group.quaternion.setFromUnitVectors(PLUS_X, dir)
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  dispose(): void {
    this.cubeGeometry.dispose()
    this.coneGeometry.dispose()
    this.material.dispose()
  }
}
