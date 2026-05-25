import * as THREE from 'three'
import type { Connector } from '../ksa/types'
import { applyPlacement } from './coords'

const COLOR_DEFAULT = 0xf2f0e9
const COLOR_SELECTED = 0x22dd44

/**
 * A connector in the scene: an untextured cube (the attachment point) plus a
 * cone pointing along its facing direction (local +X). The cone's diameter
 * matches the cube width and its length is 1.5x that, with its base flush
 * against the +X face. The Group carries the connector id for raycast selection.
 * The cube size is a global editor setting (see {@link ConnectorSettings}); the
 * connector's own transform is applied to the Group on top of that base size.
 */
export class ConnectorObject {
  readonly group = new THREE.Group()
  readonly id: string

  private readonly cubeGeometry: THREE.BoxGeometry
  private readonly cubeMaterial: THREE.MeshStandardMaterial
  private readonly coneGeometry: THREE.ConeGeometry
  private readonly coneMaterial: THREE.MeshStandardMaterial

  constructor(connector: Connector, size: number) {
    this.id = connector.id
    this.group.name = `connector:${connector.id}`
    this.group.userData.selectable = { kind: 'connector', id: connector.id }

    this.cubeGeometry = new THREE.BoxGeometry(size, size, size)
    this.cubeMaterial = new THREE.MeshStandardMaterial({
      color: COLOR_DEFAULT,
      roughness: 0.6,
      metalness: 0.1,
    })
    const cube = new THREE.Mesh(this.cubeGeometry, this.cubeMaterial)
    cube.userData.selectable = { kind: 'connector', id: connector.id }
    this.group.add(cube)

    // Cone shows the facing direction (local +X): diameter == cube width, length
    // == 1.5x cube width, base flush against the +X face.
    const coneLength = size * 1.5
    this.coneGeometry = new THREE.ConeGeometry(size / 2, coneLength, 24)
    this.coneMaterial = new THREE.MeshStandardMaterial({
      color: COLOR_DEFAULT,
      roughness: 0.5,
      metalness: 0.1,
    })
    const cone = new THREE.Mesh(this.coneGeometry, this.coneMaterial)
    cone.userData.selectable = { kind: 'connector', id: connector.id }
    cone.rotation.z = -Math.PI / 2 // cone's default +Y axis -> +X
    cone.position.x = size / 2 + coneLength / 2
    this.group.add(cone)

    this.setConnector(connector)
  }

  /** Applies the connector's transform to the group. */
  setConnector(connector: Connector): void {
    applyPlacement(this.group, connector)
  }

  /** Bright green when selected, offwhite otherwise (cube + cone). */
  setSelected(selected: boolean): void {
    const hex = selected ? COLOR_SELECTED : COLOR_DEFAULT
    this.cubeMaterial.color.setHex(hex)
    this.coneMaterial.color.setHex(hex)
  }

  dispose(): void {
    this.cubeGeometry.dispose()
    this.cubeMaterial.dispose()
    this.coneGeometry.dispose()
    this.coneMaterial.dispose()
  }
}
