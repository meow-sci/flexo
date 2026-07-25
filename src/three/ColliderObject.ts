import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import type { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import type { ColliderShape, PartCollider, Transform, Vec3 } from '../ksa/types'
import { applyPlacement } from './coords'
import { applyMaterialOpacity, captureOpacityBase, type MaterialOpacityBase } from './layerOpacity'
import { capsuleEdges, cylinderEdges, edgesGeometry, RECT_EDGES, sphereEdges } from './wireShapes'

/** Scratch vector for the per-frame resolution sync (never escapes). */
const TMP_SIZE = new THREE.Vector2()

const COLOR_DEFAULT = 0xf59e0b // amber — distinct from the offwhite connectors
const COLOR_SELECTED = 0x22dd44 // matches ConnectorObject's selected green

/** Screen-space line width (px). Constant width keeps a squashed collider readable. */
const LINE_WIDTH = 2
/** Wireframe line count on the curved shapes. Fixed — colliders are coarse by nature. */
const SEGMENTS = 12
/** How solid the fill reads. Low enough to see the mesh it wraps, high enough to click. */
const FILL_OPACITY = 0.08

/**
 * One collision primitive in the scene: a fat-line wireframe outline plus a very
 * low-alpha solid fill (which doubles as the raycast target — a bare line is fiddly
 * to click).
 *
 * **All geometry is normalised into the unit box `[-0.5, 0.5]³`, and the group's `scale`
 * is the collider's SIZE IN METERS** (see {@link PartCollider}). That is what makes the
 * scale gizmo edit dimensions natively, and it is why the wireframe uses screen-space
 * line width — an object-space width would skew with a non-uniform size.
 *
 * The **capsule** is the one shape whose normalised outline depends on its proportions
 * (its hemispherical caps must be drawn as normalised ellipses to survive the non-uniform
 * scale), so its geometry is rebuilt when the diameter/height ratio changes.
 */
export class ColliderObject {
  readonly group = new THREE.Group()
  readonly id: string

  private shape: ColliderShape
  /** Diameter ÷ height the current capsule geometry was built for (`null` for other shapes). */
  private aspect: number | null = null

  private wireGeometry: LineSegmentsGeometry
  private readonly wireMaterial: LineMaterial
  private readonly wire: LineSegments2
  private fillGeometry: THREE.BufferGeometry
  private readonly fillMaterial: THREE.MeshBasicMaterial
  private readonly fill: THREE.Mesh
  private readonly opacityBases: MaterialOpacityBase[]

  /**
   * Which visual of this collider we are — a SubPart-owned collider is drawn once per
   * placement of its template, and a click must report WHICH one so the gizmo can write
   * back through that placement's frame. Always 0 for a part-level collider.
   */
  readonly instanceIndex: number

  constructor(collider: PartCollider, instanceIndex = 0) {
    this.id = collider.id
    this.instanceIndex = instanceIndex
    this.shape = collider.shape
    this.group.name =
      instanceIndex > 0 ? `collider:${collider.id}#${instanceIndex}` : `collider:${collider.id}`
    const selectable = { kind: 'collider', id: collider.id, instanceIndex }
    this.group.userData.selectable = selectable

    this.aspect = aspectFor(collider)
    this.wireGeometry = wireGeometryFor(collider.shape, this.aspect)
    this.wireMaterial = new LineMaterial({
      color: COLOR_DEFAULT,
      linewidth: LINE_WIDTH,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
    })
    this.wire = new LineSegments2(this.wireGeometry, this.wireMaterial)
    // The wireframe is decoration; the fill owns picking (see below).
    this.wire.raycast = () => {}
    // LineMaterial derives its SCREEN-SPACE width from `resolution`, so it must track the
    // renderer size. Syncing here (rather than on a resize hook) keeps it correct for free
    // even when nothing in the document changed.
    this.wire.onBeforeRender = (renderer) => {
      renderer.getSize(TMP_SIZE)
      this.wireMaterial.resolution.set(TMP_SIZE.x, TMP_SIZE.y)
    }
    this.group.add(this.wire)

    this.fillGeometry = fillGeometryFor(collider.shape, this.aspect)
    this.fillMaterial = new THREE.MeshBasicMaterial({
      color: COLOR_DEFAULT,
      transparent: true,
      opacity: FILL_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.fill = new THREE.Mesh(this.fillGeometry, this.fillMaterial)
    this.fill.userData.selectable = selectable
    this.group.add(this.fill)

    this.opacityBases = [
      captureOpacityBase(this.wireMaterial),
      captureOpacityBase(this.fillMaterial),
    ]

    this.setCollider(collider)
  }

  /**
   * Applies a collider's transform (and, if it changed, its shape/proportions) to the group.
   * `worldOverride` places the object somewhere other than the collider's own frame — used
   * for a SubPart-owned collider, which is drawn once per placement of its template.
   */
  setCollider(collider: PartCollider, worldOverride?: Transform): void {
    // Proportions always come from the collider's OWN size: KSA ignores the owning
    // placement's scale, so a world override never changes the shape's dimensions.
    const aspect = aspectFor(collider)
    if (collider.shape !== this.shape || !sameAspect(aspect, this.aspect)) {
      this.shape = collider.shape
      this.aspect = aspect
      this.rebuildGeometry()
    }
    applyPlacement(this.group, worldOverride ?? collider)
  }

  /** Bright green when selected, amber otherwise. */
  setSelected(selected: boolean): void {
    const hex = selected ? COLOR_SELECTED : COLOR_DEFAULT
    this.wireMaterial.color.setHex(hex)
    this.fillMaterial.color.setHex(hex)
  }

  /** Dims this collider to `factor` (0–1) of its base opacity for the layer fade. */
  setLayerOpacity(factor: number): void {
    applyMaterialOpacity(this.wireMaterial, this.opacityBases[0], factor)
    applyMaterialOpacity(this.fillMaterial, this.opacityBases[1], factor)
  }

  private rebuildGeometry(): void {
    const wire = wireGeometryFor(this.shape, this.aspect)
    this.wire.geometry = wire
    this.wireGeometry.dispose()
    this.wireGeometry = wire

    const fill = fillGeometryFor(this.shape, this.aspect)
    this.fill.geometry = fill
    this.fillGeometry.dispose()
    this.fillGeometry = fill
  }

  dispose(): void {
    this.wireGeometry.dispose()
    this.wireMaterial.dispose()
    this.fillGeometry.dispose()
    this.fillMaterial.dispose()
  }
}

/** Diameter ÷ outer height for a capsule (the only ratio-dependent shape); null otherwise. */
function aspectFor(collider: { shape: ColliderShape; scale: Vec3 }): number | null {
  if (collider.shape !== 'Capsule') return null
  const height = Math.max(1e-6, collider.scale.y)
  return Math.max(1e-4, Math.min(1, collider.scale.x / height))
}

/** Ratio comparison with a tolerance, so a gizmo drag doesn't rebuild geometry every frame. */
function sameAspect(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return Math.abs(a - b) < 1e-3
}

function wireGeometryFor(shape: ColliderShape, aspect: number | null): LineSegmentsGeometry {
  switch (shape) {
    case 'Box':
      return edgesGeometry(RECT_EDGES)
    case 'Sphere':
      return edgesGeometry(sphereEdges(SEGMENTS))
    case 'Cylinder':
      return edgesGeometry(cylinderEdges(SEGMENTS))
    case 'Capsule':
      return edgesGeometry(capsuleEdges(aspect ?? 1, SEGMENTS))
  }
}

function fillGeometryFor(shape: ColliderShape, aspect: number | null): THREE.BufferGeometry {
  switch (shape) {
    case 'Box':
      return new THREE.BoxGeometry(1, 1, 1)
    case 'Sphere':
      return new THREE.SphereGeometry(0.5, 24, 16)
    case 'Cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
    case 'Capsule': {
      // CapsuleGeometry(r, len) spans `len + 2r` along Y and `2r` across, so r = a/2 and
      // len = 1 − a give the right Y normalisation but leave X/Z at `a` instead of the
      // full 1. Widening X/Z by 1/a is what turns the caps into normalised ELLIPSOIDS —
      // which the group's non-uniform scale then renders as true hemispheres.
      const a = aspect ?? 1
      const geom = new THREE.CapsuleGeometry(a / 2, Math.max(0, 1 - a), 8, 24)
      geom.scale(1 / a, 1, 1 / a)
      return geom
    }
  }
}
