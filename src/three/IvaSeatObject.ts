import * as THREE from 'three'
import type { IvaSeat } from '../ksa/types'
import { applyPlacement } from './coords'
import { applyMaterialOpacity, captureOpacityBase, type MaterialOpacityBase } from './layerOpacity'

/** Sky — deliberately distinct from the connectors' offwhite and the colliders' amber. */
const COLOR_DEFAULT = 0x38bdf8
/** The shared selection green (matches ConnectorObject/ColliderObject). */
const COLOR_SELECTED = 0x22dd44
/** The up stick's contrasting colour, so roll reads against the sky-coloured body. */
const COLOR_UP = 0xfb7185

/**
 * Fallback marker size in meters. Mirrors `$ivaSeatSettings.markerSize`'s default
 * (which is what the scene actually passes in).
 */
const DEFAULT_MARKER_SIZE = 0.12

/** Length of the indicative gaze cone, in meters. */
const GAZE_LENGTH = 1

/**
 * One IVA seat in the scene: a small eye sphere at the vantage point, a cone along
 * the seat's local **+X** (its look direction — KSA's `<ForwardAxis>` default) and a
 * thin stick along local **−Z** (its up axis — KSA's `<UpAxis>` default). The stick is
 * not decoration: without it a seat rolled 90° looks identical to an unrolled one.
 *
 * The forward cone is built exactly the way {@link ConnectorObject}'s facing cone is
 * (same radius, same `rotation.z`, same flush-against-the-body offset) so the two
 * markers read consistently in the viewport.
 *
 * The Group and every child mesh carry the seat id for raycast selection (the ray hits
 * a mesh, never the group).
 *
 * The marker's size is a global editor setting, NOT document data — see {@link setSeat}.
 * `EditorScene` rebuilds every marker (dispose + recreate) when `$ivaSeatSettings`
 * changes, exactly as it does for connectors, so there is no in-place resize path;
 * {@link dispose} is what has to be correct.
 */
export class IvaSeatObject {
  readonly group = new THREE.Group()
  readonly id: string

  private readonly eyeGeometry: THREE.SphereGeometry
  private readonly eyeMaterial: THREE.MeshStandardMaterial
  private readonly coneGeometry: THREE.ConeGeometry
  private readonly coneMaterial: THREE.MeshStandardMaterial
  private readonly upGeometry: THREE.CylinderGeometry
  private readonly upMaterial: THREE.MeshStandardMaterial
  private readonly gazeGeometry: THREE.ConeGeometry | null = null
  private readonly gazeMaterial: THREE.MeshBasicMaterial | null = null
  /** Materials the layer fade applies to, with their captured base render state. */
  private readonly fadeMaterials: THREE.Material[] = []
  private readonly opacityBases: MaterialOpacityBase[] = []

  constructor(seat: IvaSeat, markerSize = DEFAULT_MARKER_SIZE, showGazeCone = false) {
    this.id = seat.id
    this.group.name = `ivaSeat:${seat.id}`
    this.group.userData.selectable = { kind: 'ivaSeat', id: seat.id }

    const size = markerSize

    // The eye point itself — and the click target.
    this.eyeGeometry = new THREE.SphereGeometry(size / 2, 24, 16)
    this.eyeMaterial = new THREE.MeshStandardMaterial({
      color: COLOR_DEFAULT,
      roughness: 0.6,
      metalness: 0.1,
    })
    const eye = new THREE.Mesh(this.eyeGeometry, this.eyeMaterial)
    eye.userData.selectable = { kind: 'ivaSeat', id: seat.id }
    this.group.add(eye)

    // Look direction (local +X): diameter == the eye sphere's, length == 2x the marker
    // size, base flush against the sphere. Same construction as the connector arrow.
    const coneLength = size * 2
    this.coneGeometry = new THREE.ConeGeometry(size / 2, coneLength, 24)
    this.coneMaterial = new THREE.MeshStandardMaterial({
      color: COLOR_DEFAULT,
      roughness: 0.5,
      metalness: 0.1,
    })
    const cone = new THREE.Mesh(this.coneGeometry, this.coneMaterial)
    cone.userData.selectable = { kind: 'ivaSeat', id: seat.id }
    cone.rotation.z = -Math.PI / 2 // cone's default +Y axis -> +X
    cone.position.x = size / 2 + coneLength / 2
    this.group.add(cone)

    // Up axis (local -Z), in a contrasting colour: this is the ONLY cue for roll.
    const upLength = size * 1.2
    this.upGeometry = new THREE.CylinderGeometry(size / 10, size / 10, upLength, 12)
    this.upMaterial = new THREE.MeshStandardMaterial({
      color: COLOR_UP,
      roughness: 0.5,
      metalness: 0.1,
    })
    const up = new THREE.Mesh(this.upGeometry, this.upMaterial)
    up.userData.selectable = { kind: 'ivaSeat', id: seat.id }
    up.rotation.x = Math.PI / 2 // cylinder's default +Y axis -> +Z
    up.position.z = -(size * 0.6)
    this.group.add(up)

    if (showGazeCone) {
      // PURELY INDICATIVE, and deliberately NOT the real limit: KSA clamps the look to
      // within 90 degrees of <ForwardAxis>, i.e. a HEMISPHERE — a half-space, which has no
      // readable shape to draw. This is a 45-degree half-angle cone that says "the seat
      // looks roughly this way". Do not "correct" the angle to 90; that would draw a disc
      // plane, not a cone. The exact limits belong in the seat-view preview.
      this.gazeGeometry = new THREE.ConeGeometry(GAZE_LENGTH, GAZE_LENGTH, 32, 1, true)
      this.gazeMaterial = new THREE.MeshBasicMaterial({
        color: COLOR_DEFAULT,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const gaze = new THREE.Mesh(this.gazeGeometry, this.gazeMaterial)
      gaze.userData.selectable = { kind: 'ivaSeat', id: seat.id }
      gaze.rotation.z = Math.PI / 2 // apex (cone's +Y tip) -> -X, so it opens toward +X
      gaze.position.x = GAZE_LENGTH / 2 // apex at the eye point, mouth 1 m ahead
      this.group.add(gaze)
    }

    for (const mat of [this.eyeMaterial, this.coneMaterial, this.upMaterial, this.gazeMaterial]) {
      if (!mat) continue
      this.fadeMaterials.push(mat)
      this.opacityBases.push(captureOpacityBase(mat))
    }

    this.setSeat(seat)
  }

  /**
   * Applies the seat's transform to the group.
   *
   * `scale` is pinned to 1: KSA has no seat size ({@link IvaSeat}'s `scale` is unused and
   * never emitted), so the marker must never scale with the document. Only `markerSize`
   * changes how big it draws.
   */
  setSeat(seat: IvaSeat): void {
    applyPlacement(this.group, { ...seat, scale: { x: 1, y: 1, z: 1 } })
  }

  /**
   * Bright green when selected, sky otherwise. The up stick keeps its contrasting
   * colour in both states so roll stays readable while the seat is selected.
   */
  setSelected(selected: boolean): void {
    const hex = selected ? COLOR_SELECTED : COLOR_DEFAULT
    this.eyeMaterial.color.setHex(hex)
    this.coneMaterial.color.setHex(hex)
    this.gazeMaterial?.color.setHex(hex)
  }

  /** Dims this seat marker to `factor` (0–1) of its base opacity for the layer fade. */
  setLayerOpacity(factor: number): void {
    for (let i = 0; i < this.fadeMaterials.length; i++) {
      applyMaterialOpacity(this.fadeMaterials[i], this.opacityBases[i], factor)
    }
  }

  dispose(): void {
    this.eyeGeometry.dispose()
    this.eyeMaterial.dispose()
    this.coneGeometry.dispose()
    this.coneMaterial.dispose()
    this.upGeometry.dispose()
    this.upMaterial.dispose()
    this.gazeGeometry?.dispose()
    this.gazeMaterial?.dispose()
  }
}
