import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { Viewport } from './Viewport'
import {
  closestPointsBetweenBoxes,
  computeSelectionBounds,
  distance as vecDistance,
  type ComputedBounds,
} from '../measure/bounds'
import { formatLength, formatVec } from '../measure/format'
import {
  $activeEndpoint,
  $activeMeasurementId,
  $measurements,
  $measurementSettings,
  $measureTool,
  $selectionBounds,
  snappedToAxis,
  updateMeasurement,
  type MeasurementSettings,
} from '../state/measurementStore'
import type { Vec3 } from '../ksa/types'

const SELECTION_COLOR = 0x6ee7ff
const PER_MESH_COLOR = 0x94a3b8
const DISTANCE_COLOR = 0xfbbf24

/** Unit-cube (±0.5) edge segments as flat xyz pairs — scaled/oriented per box. */
const UNIT_CUBE_EDGES = ((): number[] => {
  const h = 0.5
  const c: Record<string, [number, number, number]> = {
    a: [-h, -h, -h], b: [h, -h, -h], c: [h, -h, h], d: [-h, -h, h],
    e: [-h, h, -h], f: [h, h, -h], g: [h, h, h], k: [-h, h, h],
  }
  const edges: [string, string][] = [
    ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'], // bottom
    ['e', 'f'], ['f', 'g'], ['g', 'k'], ['k', 'e'], // top
    ['a', 'e'], ['b', 'f'], ['c', 'g'], ['d', 'k'], // verticals
  ]
  return edges.flatMap(([p, q]) => [...c[p], ...c[q]])
})()

/** Builds a styled HTML label wrapped in a CSS2DObject. */
function makeLabel(): { obj: CSS2DObject; el: HTMLDivElement } {
  const el = document.createElement('div')
  el.style.cssText = [
    'padding:1px 5px',
    'border-radius:4px',
    'font:600 11px/1.4 ui-monospace,monospace',
    'color:#e5e7eb',
    'background:rgba(15,17,23,0.78)',
    'border:1px solid rgba(148,163,184,0.35)',
    'white-space:nowrap',
    'user-select:none',
    'transform:translate(-50%,-50%)',
  ].join(';')
  const obj = new CSS2DObject(el)
  return { obj, el }
}

interface BoxGfx {
  lines: LineSegments2
  material: LineMaterial
}

interface MeasurementGfx {
  line: BoxGfx
  markerA: THREE.Mesh
  markerB: THREE.Mesh
  markerMat: THREE.MeshBasicMaterial
  label: ReturnType<typeof makeLabel>
}

const MARKER_GEOMETRY = new THREE.SphereGeometry(0.025, 16, 12)

/**
 * Renders measurement graphics into the scene and keeps {@link $selectionBounds}
 * in sync for the React readout. Owned by {@link EditorScene}, which calls
 * {@link refresh} whenever the selection or document changes.
 *
 * Measurements are an editor aid: they live in their own scene group (never the
 * exported `flexo-part` root) and never touch the document store.
 */
export class MeasurementLayer {
  private readonly viewport: Viewport
  private readonly getSelected: () => THREE.Object3D[]
  private readonly group = new THREE.Group()
  private settings: MeasurementSettings = $measurementSettings.get()
  private readonly unsubs: Array<() => void> = []
  private readonly materials = new Set<LineMaterial>()

  // Selection bounding box: one reusable fat-line cube + 3 axis labels.
  private selectionBox: BoxGfx | null = null
  private readonly boxLabels = [makeLabel(), makeLabel(), makeLabel()]

  // Per-mesh dimension boxes (pooled, one per selected mesh).
  private perMesh: { box: BoxGfx; label: ReturnType<typeof makeLabel> }[] = []

  // Mesh-to-mesh distance: one segment + label.
  private distanceLine: BoxGfx | null = null
  private readonly distanceLabel = makeLabel()

  // Placed line measurements (reference / point-to-point), keyed by id.
  private readonly measurementGfx = new Map<string, MeasurementGfx>()

  // Endpoint editing gizmo for the active, unlocked measurement.
  private endpointControls: TransformControls | null = null
  private readonly endpointProxy = new THREE.Object3D()
  private gizmoAttached = false

  constructor(viewport: Viewport, getSelected: () => THREE.Object3D[]) {
    this.viewport = viewport
    this.getSelected = getSelected
    this.group.name = 'measurements'
    viewport.scene.add(this.group)
    for (const l of this.boxLabels) {
      l.obj.visible = false
      this.group.add(l.obj)
    }
    this.distanceLabel.obj.visible = false
    this.group.add(this.distanceLabel.obj)
    this.group.add(this.endpointProxy)
    this.unsubs.push(
      $measurementSettings.subscribe((s) => {
        this.settings = s
        this.refresh()
      }),
    )
    this.unsubs.push($measurements.subscribe(() => this.refresh()))
    this.unsubs.push($activeMeasurementId.subscribe(() => this.refresh()))
    this.unsubs.push($activeEndpoint.subscribe(() => this.refresh()))
    this.unsubs.push($measureTool.subscribe(() => this.refresh()))
  }

  /** Recomputes all measurement graphics from the current selection/settings. */
  refresh(): void {
    const objects = this.getSelected()
    this.updateSelectionBox(objects)
    this.updatePerMesh(objects)
    this.updateMeshDistance(objects)
    this.updateMeasurements()
    this.updateEndpointGizmo()
    this.updateResolution()
  }

  // --- Selection bounding box ------------------------------------------------

  private updateSelectionBox(objects: THREE.Object3D[]): void {
    if (!this.settings.showSelectionBounds || objects.length === 0) {
      this.hideSelectionBox()
      $selectionBounds.set(null)
      return
    }
    const bounds = computeSelectionBounds(objects, this.settings.boundsMode)
    if (!bounds) {
      this.hideSelectionBox()
      $selectionBounds.set(null)
      return
    }
    $selectionBounds.set({
      size: bounds.size,
      min: bounds.min,
      max: bounds.max,
      mode: this.settings.boundsMode,
    })

    if (!this.selectionBox) this.selectionBox = this.makeBox(SELECTION_COLOR)
    placeBox(this.selectionBox.lines, bounds)
    this.selectionBox.lines.visible = true

    const size = new THREE.Vector3(bounds.size.x, bounds.size.y, bounds.size.z)
    const center = new THREE.Vector3(bounds.center.x, bounds.center.y, bounds.center.z)
    const quat = new THREE.Quaternion(...bounds.quaternion)
    const half = size.clone().multiplyScalar(0.5)
    const offsets = [
      new THREE.Vector3(0, -half.y, -half.z), // X edge
      new THREE.Vector3(-half.x, 0, -half.z), // Y edge
      new THREE.Vector3(-half.x, -half.y, 0), // Z edge
    ]
    const dims = [bounds.size.x, bounds.size.y, bounds.size.z]
    offsets.forEach((offset, i) => {
      const world = offset.clone().applyQuaternion(quat).add(center)
      const { obj, el } = this.boxLabels[i]
      obj.position.copy(world)
      obj.visible = true
      el.textContent = formatLength(dims[i], this.settings.unit)
    })
  }

  private hideSelectionBox(): void {
    if (this.selectionBox) this.selectionBox.lines.visible = false
    for (const l of this.boxLabels) l.obj.visible = false
  }

  // --- Per-mesh dimensions ---------------------------------------------------

  private updatePerMesh(objects: THREE.Object3D[]): void {
    const wanted = this.settings.showPerMesh ? objects.length : 0
    // Grow / shrink the pool to match.
    while (this.perMesh.length < wanted) {
      this.perMesh.push({ box: this.makeBox(PER_MESH_COLOR), label: this.addLabel() })
    }
    while (this.perMesh.length > wanted) {
      const item = this.perMesh.pop()!
      this.disposeBox(item.box)
      item.label.obj.removeFromParent()
      item.label.el.remove()
    }
    for (let i = 0; i < wanted; i++) {
      const bounds = computeSelectionBounds([objects[i]], 'world')
      const { box, label } = this.perMesh[i]
      if (!bounds) {
        box.lines.visible = false
        label.obj.visible = false
        continue
      }
      placeBox(box.lines, bounds)
      box.lines.visible = true
      const top = new THREE.Vector3(bounds.center.x, bounds.max.y, bounds.center.z)
      label.obj.position.copy(top)
      label.obj.visible = true
      label.el.textContent = formatVec(bounds.size, this.settings.unit)
    }
  }

  // --- Mesh-to-mesh distance -------------------------------------------------

  private updateMeshDistance(objects: THREE.Object3D[]): void {
    if (!this.settings.showMeshDistance || objects.length !== 2) {
      if (this.distanceLine) this.distanceLine.lines.visible = false
      this.distanceLabel.obj.visible = false
      return
    }
    const boxA = new THREE.Box3().setFromObject(objects[0])
    const boxB = new THREE.Box3().setFromObject(objects[1])
    if (boxA.isEmpty() || boxB.isEmpty()) return
    const { a, b, distance } = closestPointsBetweenBoxes(boxA.min, boxA.max, boxB.min, boxB.max)

    if (!this.distanceLine) this.distanceLine = this.makeSegment(DISTANCE_COLOR)
    const geom = this.distanceLine.lines.geometry as LineSegmentsGeometry
    geom.setPositions([a.x, a.y, a.z, b.x, b.y, b.z])
    this.distanceLine.lines.computeLineDistances()
    this.distanceLine.lines.visible = true

    this.distanceLabel.obj.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    this.distanceLabel.obj.visible = true
    this.distanceLabel.el.textContent = formatLength(distance, this.settings.unit)
  }

  // --- Placed line measurements ----------------------------------------------

  private updateMeasurements(): void {
    const measurements = $measurements.get()
    const activeId = $activeMeasurementId.get()
    const wanted = new Set(measurements.map((m) => m.id))

    // Remove graphics for deleted measurements.
    for (const [id, gfx] of this.measurementGfx) {
      if (!wanted.has(id)) {
        this.disposeMeasurementGfx(gfx)
        this.measurementGfx.delete(id)
      }
    }

    for (const m of measurements) {
      let gfx = this.measurementGfx.get(m.id)
      if (!gfx) {
        gfx = this.makeMeasurementGfx()
        this.measurementGfx.set(m.id, gfx)
      }
      const color = new THREE.Color(m.color)
      gfx.line.material.color.copy(color)
      gfx.markerMat.color.copy(color)

      const geom = gfx.line.lines.geometry as LineSegmentsGeometry
      geom.setPositions([m.a.x, m.a.y, m.a.z, m.b.x, m.b.y, m.b.z])
      gfx.line.lines.computeLineDistances()

      gfx.markerA.position.set(m.a.x, m.a.y, m.a.z)
      gfx.markerB.position.set(m.b.x, m.b.y, m.b.z)
      const editing = m.id === activeId && !m.locked
      const markerScale = editing ? 1.6 : 1
      gfx.markerA.scale.setScalar(markerScale)
      gfx.markerB.scale.setScalar(markerScale)

      gfx.label.obj.position.set((m.a.x + m.b.x) / 2, (m.a.y + m.b.y) / 2, (m.a.z + m.b.z) / 2)
      gfx.label.obj.visible = true
      const len = vecDistance(m.a, m.b)
      gfx.label.el.textContent =
        m.axisLock === 'none'
          ? formatLength(len, this.settings.unit)
          : `${m.axisLock.toUpperCase()}: ${formatLength(len, this.settings.unit)}`
    }
  }

  // --- Endpoint editing gizmo ------------------------------------------------

  private updateEndpointGizmo(): void {
    const activeId = $activeMeasurementId.get()
    const m = activeId ? $measurements.get().find((x) => x.id === activeId) : undefined
    const end = $activeEndpoint.get()

    if (!m || m.locked || $measureTool.get() !== 'none') {
      this.detachGizmo()
      return
    }
    const controls = this.ensureEndpointControls()
    if (controls.dragging) return // never re-place mid-drag

    const p = end === 'a' ? m.a : m.b
    this.endpointProxy.position.set(p.x, p.y, p.z)
    if (!this.gizmoAttached) {
      controls.attach(this.endpointProxy)
      this.gizmoAttached = true
    }
    // Axis lock hides the non-locked handles so the endpoint stays on-axis.
    controls.showX = m.axisLock === 'none' || m.axisLock === 'x'
    controls.showY = m.axisLock === 'none' || m.axisLock === 'y'
    controls.showZ = m.axisLock === 'none' || m.axisLock === 'z'
  }

  private ensureEndpointControls(): TransformControls {
    if (this.endpointControls) return this.endpointControls
    const controls = new TransformControls(this.viewport.camera, this.viewport.renderer.domElement)
    controls.setMode('translate')
    controls.setSpace('world')
    this.viewport.scene.add(controls.getHelper())
    controls.addEventListener('dragging-changed', (e) => {
      this.viewport.controls.enabled = !(e.value as boolean)
    })
    controls.addEventListener('objectChange', () => this.handleEndpointChange())
    this.endpointControls = controls
    return controls
  }

  private handleEndpointChange(): void {
    const activeId = $activeMeasurementId.get()
    const m = activeId ? $measurements.get().find((x) => x.id === activeId) : undefined
    if (!m) return
    const end = $activeEndpoint.get()
    const pos: Vec3 = {
      x: this.endpointProxy.position.x,
      y: this.endpointProxy.position.y,
      z: this.endpointProxy.position.z,
    }
    if (end === 'a') {
      // Snap the moved endpoint (a) so the segment stays parallel to the axis.
      const a = m.axisLock === 'none' ? pos : snappedToAxis(m.b, pos, m.axisLock)
      updateMeasurement(m.id, { a })
    } else {
      const b = m.axisLock === 'none' ? pos : snappedToAxis(m.a, pos, m.axisLock)
      updateMeasurement(m.id, { b })
    }
  }

  private detachGizmo(): void {
    if (this.endpointControls && this.gizmoAttached) {
      this.endpointControls.detach()
      this.gizmoAttached = false
    }
  }

  private makeMeasurementGfx(): MeasurementGfx {
    const line = this.makeSegment(0xffffff)
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })
    const markerA = new THREE.Mesh(MARKER_GEOMETRY, markerMat)
    const markerB = new THREE.Mesh(MARKER_GEOMETRY, markerMat)
    markerA.renderOrder = 1000
    markerB.renderOrder = 1000
    this.group.add(markerA, markerB)
    const label = this.addLabel()
    return { line, markerA, markerB, markerMat, label }
  }

  private disposeMeasurementGfx(gfx: MeasurementGfx): void {
    this.disposeBox(gfx.line)
    gfx.markerA.removeFromParent()
    gfx.markerB.removeFromParent()
    gfx.markerMat.dispose()
    gfx.label.obj.removeFromParent()
    gfx.label.el.remove()
  }

  // --- Shared helpers --------------------------------------------------------

  private makeBox(colorHex: number): BoxGfx {
    const geom = new LineSegmentsGeometry()
    geom.setPositions(UNIT_CUBE_EDGES)
    return this.makeLineObject(geom, colorHex)
  }

  private makeSegment(colorHex: number): BoxGfx {
    const geom = new LineSegmentsGeometry()
    geom.setPositions([0, 0, 0, 0, 0, 0])
    return this.makeLineObject(geom, colorHex)
  }

  private makeLineObject(geom: LineSegmentsGeometry, colorHex: number): BoxGfx {
    const material = new LineMaterial({
      color: colorHex,
      linewidth: 2,
      depthTest: false,
      transparent: true,
    })
    const lines = new LineSegments2(geom, material)
    lines.renderOrder = 999
    this.materials.add(material)
    this.group.add(lines)
    return { lines, material }
  }

  private disposeBox(box: BoxGfx): void {
    box.lines.removeFromParent()
    box.lines.geometry.dispose()
    box.material.dispose()
    this.materials.delete(box.material)
  }

  private addLabel(): ReturnType<typeof makeLabel> {
    const label = makeLabel()
    label.obj.visible = false
    this.group.add(label.obj)
    return label
  }

  private updateResolution(): void {
    const res = this.viewport.renderer.getSize(new THREE.Vector2())
    for (const m of this.materials) m.resolution.set(res.x, res.y)
  }

  dispose(): void {
    for (const unsub of this.unsubs) unsub()
    this.unsubs.length = 0
    if (this.selectionBox) this.disposeBox(this.selectionBox)
    if (this.distanceLine) this.disposeBox(this.distanceLine)
    for (const item of this.perMesh) {
      this.disposeBox(item.box)
      item.label.el.remove()
    }
    for (const gfx of this.measurementGfx.values()) this.disposeMeasurementGfx(gfx)
    this.measurementGfx.clear()
    if (this.endpointControls) {
      this.endpointControls.detach()
      this.endpointControls.getHelper().removeFromParent()
      this.endpointControls.dispose()
    }
    for (const l of [...this.boxLabels, this.distanceLabel]) {
      l.obj.removeFromParent()
      l.el.remove()
    }
    this.group.removeFromParent()
  }
}

/** Positions/orients/scales a unit-cube box object to match the given bounds. */
function placeBox(lines: LineSegments2, b: ComputedBounds): void {
  lines.position.set(b.center.x, b.center.y, b.center.z)
  lines.quaternion.set(...b.quaternion)
  lines.scale.set(b.size.x || 1e-4, b.size.y || 1e-4, b.size.z || 1e-4)
}
