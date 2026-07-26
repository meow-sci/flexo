import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
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
 * The seat's 1-based cycle-order badge, as a `CSS2DObject` hosted by the viewport's
 * existing `labelRenderer` (the one {@link MeasurementLayer} already drives — there is
 * exactly one CSS2D overlay, and it renders the whole scene, so a label anywhere in the
 * graph is picked up for free).
 *
 * It sits at the marker's LOCAL ORIGIN and is lifted clear of the eye sphere by the
 * CSS2DObject's own `center` (see {@link LABEL_CENTER}) rather than by a 3D offset, which
 * would swing around the marker as the seat is rolled/pitched.
 */
function makeIndexLabel(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = [
    'padding:0 5px',
    'min-width:16px',
    'text-align:center',
    'border-radius:8px',
    'font:700 11px/1.5 ui-monospace,monospace',
    'color:#0b1120',
    'background:rgba(56,189,248,0.92)',
    'white-space:nowrap',
    'user-select:none',
    'pointer-events:none',
  ].join(';')
  return el
}

/**
 * The badge's anchor, in element-relative units — `(0.5, 1.4)` is "horizontally centred,
 * 1.4 label-heights above the marker's origin", clearing the eye sphere.
 *
 * This MUST be expressed through `CSS2DObject.center`, not a CSS `transform` on the
 * element: `CSS2DRenderer` overwrites `element.style.transform` wholesale on every frame
 * with `translate(-100·center.x%, -100·center.y%) translate(<screen px>)`, so any
 * transform authored in the element's own style is silently thrown away.
 */
const LABEL_CENTER = { x: 0.5, y: 1.4 } as const

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
  /** The cycle-order badge's DOM node and its scene-graph wrapper — see {@link setIndex}. */
  private readonly labelEl: HTMLDivElement
  private readonly label: CSS2DObject

  constructor(seat: IvaSeat, markerSize = DEFAULT_MARKER_SIZE, showGazeCone = false, index = 0) {
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

    // The cycle-order badge. A child of the group, so it inherits the marker's position
    // AND its visibility (CSS2DRenderer hides an invisible object's whole subtree), which
    // is what keeps the numbers from floating in an empty interior in seat view.
    this.labelEl = makeIndexLabel()
    this.label = new CSS2DObject(this.labelEl)
    this.label.center.set(LABEL_CENTER.x, LABEL_CENTER.y)
    this.group.add(this.label)
    this.setIndex(index)

    this.setSeat(seat)
  }

  /**
   * Shows this seat's 1-based CYCLE ORDER in the viewport — `1` is the seat IVA opens on
   * and `C` walks the rest in this order, so the number is authored data, not decoration.
   * `EditorScene.reconcileIvaSeats` calls this with the document index on every reconcile,
   * which is what renumbers the markers after a reorder / add / remove.
   */
  setIndex(index: number): void {
    this.labelEl.textContent = String(index + 1)
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

  /**
   * Releases the GPU resources AND the label's DOM node.
   *
   * The DOM half is not optional: `CSS2DRenderer` appends the element to its own overlay
   * div and only ever removes it from three.js's `removed` event, which fires on the
   * object that is unparented — NOT on its descendants. `EditorScene` removes the marker's
   * GROUP from the scene, so the badge would be orphaned in the overlay and stay painted
   * on screen forever. Unparenting the label here fires that event; `labelEl.remove()` is
   * the belt-and-braces for a dispose that happens before the group is ever added.
   */
  dispose(): void {
    this.group.remove(this.label)
    this.labelEl.remove()
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
