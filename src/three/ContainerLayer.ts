import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { Viewport } from './Viewport'
import {
  $activeContainerId,
  $containerGizmoMode,
  $containerSettings,
  $containers,
  normalizeSize,
  updateContainer,
  type ContainerSettings,
  type ReferenceShape,
  type WarnPrecision,
} from '../state/containerStore'
import { $part } from '../state/editorStore'
import { evaluateViolations } from '../measure/containment'
import type { Vec3 } from '../ksa/types'

// --- Static unit geometries (centered at origin, scaled per container) --------

/** Unit-cube (±0.5) edge segments as flat xyz pairs. */
const RECT_EDGES = ((): number[] => {
  const h = 0.5
  const c: Record<string, [number, number, number]> = {
    a: [-h, -h, -h], b: [h, -h, -h], cc: [h, -h, h], d: [-h, -h, h],
    e: [-h, h, -h], f: [h, h, -h], g: [h, h, h], k: [-h, h, h],
  }
  const edges: [string, string][] = [
    ['a', 'b'], ['b', 'cc'], ['cc', 'd'], ['d', 'a'],
    ['e', 'f'], ['f', 'g'], ['g', 'k'], ['k', 'e'],
    ['a', 'e'], ['b', 'f'], ['cc', 'g'], ['d', 'k'],
  ]
  return edges.flatMap(([p, q]) => [...c[p], ...c[q]])
})()

/** Builds segment pairs for a ring of `n` chords; `at(cos, sin)` maps to a point. */
function ring(n: number, at: (cos: number, sin: number) => [number, number, number]): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n
    const a1 = (2 * Math.PI * (i + 1)) / n
    out.push(...at(Math.cos(a0), Math.sin(a0)), ...at(Math.cos(a1), Math.sin(a1)))
  }
  return out
}

const R = 0.5
const RING_SEGMENTS = 48
/** Chords per drawn circle — fixed so curves stay smooth regardless of line count. */
const CIRCLE_SMOOTH = 64
/** Clamp for the user-controlled wireframe line count on curved surfaces. */
const MIN_SEGMENTS = 2
const MAX_SEGMENTS = 64

const clampSegments = (n: number): number =>
  Number.isFinite(n) ? Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, Math.round(n))) : 16

/**
 * Unit cylinder (r=0.5, h=1, axis Y): smooth top + bottom rings plus `struts`
 * evenly-spaced vertical lines on the side (the user-controlled count).
 */
function cylinderEdges(struts: number): number[] {
  const bottom = ring(CIRCLE_SMOOTH, (c, s) => [c * R, -0.5, s * R])
  const top = ring(CIRCLE_SMOOTH, (c, s) => [c * R, 0.5, s * R])
  const verticals: number[] = []
  for (let i = 0; i < struts; i++) {
    const a = (2 * Math.PI * i) / struts
    const c = Math.cos(a) * R
    const s = Math.sin(a) * R
    verticals.push(c, -0.5, s, c, 0.5, s)
  }
  return [...bottom, ...top, ...verticals]
}

/**
 * Unit sphere (r=0.5): `rings` meridian great-circles (around Y) plus `rings - 1`
 * latitude rings — a globe whose line density the user controls.
 */
function sphereEdges(rings: number): number[] {
  const out: number[] = []
  for (let i = 0; i < rings; i++) {
    const ang = (Math.PI * i) / rings // meridian plane angle
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    out.push(...ring(CIRCLE_SMOOTH, (c, s) => [c * ca * R, s * R, c * sa * R]))
  }
  for (let j = 1; j < rings; j++) {
    const y = -R + (2 * R * j) / rings
    const rad = Math.sqrt(Math.max(0, R * R - y * y))
    out.push(...ring(CIRCLE_SMOOTH, (c, s) => [c * rad, y, s * rad]))
  }
  return out
}

function edgesGeometry(positions: number[]): LineSegmentsGeometry {
  const geom = new LineSegmentsGeometry()
  geom.setPositions(positions)
  return geom
}

/** Builds the outline edge geometry for a shape at the given line count. */
function outlineGeometry(shape: ReferenceShape, segments: number): LineSegmentsGeometry {
  const n = clampSegments(segments)
  const positions =
    shape === 'rect' ? RECT_EDGES : shape === 'cylinder' ? cylinderEdges(n) : sphereEdges(n)
  return edgesGeometry(positions)
}

// Shared warn-region geometries (unit, centered; scaled by the container node).
const PLANE_GEOM = new THREE.PlaneGeometry(1, 1)
const CIRCLE_GEOM = new THREE.CircleGeometry(R, RING_SEGMENTS)
const CYL_SIDE_GEOM = new THREE.CylinderGeometry(R, R, 1, RING_SEGMENTS, 1, true)
const SPHERE_GEOM = new THREE.SphereGeometry(R, 32, 24)

/** Region keys per shape; an entry's mesh is shown when that region is violated. */
type RegionSpec = { key: string; geom: THREE.BufferGeometry; pos: Vec3; rot: Vec3 }

const RECT_REGIONS: RegionSpec[] = [
  { key: 'x+', geom: PLANE_GEOM, pos: { x: 0.5, y: 0, z: 0 }, rot: { x: 0, y: Math.PI / 2, z: 0 } },
  { key: 'x-', geom: PLANE_GEOM, pos: { x: -0.5, y: 0, z: 0 }, rot: { x: 0, y: -Math.PI / 2, z: 0 } },
  { key: 'y+', geom: PLANE_GEOM, pos: { x: 0, y: 0.5, z: 0 }, rot: { x: -Math.PI / 2, y: 0, z: 0 } },
  { key: 'y-', geom: PLANE_GEOM, pos: { x: 0, y: -0.5, z: 0 }, rot: { x: Math.PI / 2, y: 0, z: 0 } },
  { key: 'z+', geom: PLANE_GEOM, pos: { x: 0, y: 0, z: 0.5 }, rot: { x: 0, y: 0, z: 0 } },
  { key: 'z-', geom: PLANE_GEOM, pos: { x: 0, y: 0, z: -0.5 }, rot: { x: 0, y: Math.PI, z: 0 } },
]

const CYLINDER_REGIONS: RegionSpec[] = [
  { key: 'side', geom: CYL_SIDE_GEOM, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } },
  { key: 'top', geom: CIRCLE_GEOM, pos: { x: 0, y: 0.5, z: 0 }, rot: { x: -Math.PI / 2, y: 0, z: 0 } },
  { key: 'bottom', geom: CIRCLE_GEOM, pos: { x: 0, y: -0.5, z: 0 }, rot: { x: Math.PI / 2, y: 0, z: 0 } },
]

const SPHERE_REGIONS: RegionSpec[] = [
  { key: 'sphere', geom: SPHERE_GEOM, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } },
]

function regionsFor(shape: ReferenceShape): RegionSpec[] {
  if (shape === 'rect') return RECT_REGIONS
  if (shape === 'cylinder') return CYLINDER_REGIONS
  return SPHERE_REGIONS
}

interface ContainerGfx {
  shape: ReferenceShape
  /** Line count the current outline geometry was built with (for rebuild checks). */
  segments: number
  node: THREE.Object3D
  outline: LineSegments2
  geom: LineSegmentsGeometry
  lineMaterial: LineMaterial
  warnMaterial: THREE.MeshBasicMaterial
  warnMeshes: Map<string, THREE.Mesh>
}

/**
 * Renders reference-container graphics (rect / cylinder / sphere outlines plus
 * containment-warning highlights) and provides a transform gizmo for the active,
 * unlocked container. Owned by {@link EditorScene}; mirrors {@link MeasurementLayer}.
 *
 * Containers are an editor aid: they live in their own scene group (never the
 * exported `flexo-part` root) and never touch the document store.
 */
export class ContainerLayer {
  private readonly viewport: Viewport
  private readonly getPartObjects: () => THREE.Object3D[]
  private readonly group = new THREE.Group()
  private settings: ContainerSettings = $containerSettings.get()
  private readonly unsubs: Array<() => void> = []
  private readonly materials = new Set<LineMaterial>()
  private readonly gfx = new Map<string, ContainerGfx>()

  private controls: TransformControls | null = null
  private attachedId: string | null = null
  private dragging = false

  constructor(viewport: Viewport, getPartObjects: () => THREE.Object3D[]) {
    this.viewport = viewport
    this.getPartObjects = getPartObjects
    this.group.name = 'containers'
    viewport.scene.add(this.group)
    this.unsubs.push(
      $containerSettings.subscribe((s) => {
        this.settings = s
        this.refresh()
      }),
    )
    this.unsubs.push($containers.subscribe(() => this.refresh()))
    this.unsubs.push($activeContainerId.subscribe(() => this.refresh()))
    this.unsubs.push($containerGizmoMode.subscribe(() => this.refresh()))
    // Warnings depend on mesh positions, so recompute when the document changes.
    this.unsubs.push($part.subscribe(() => this.refresh()))
  }

  /** Recomputes all container graphics from the current store/document state. */
  refresh(): void {
    this.updateContainers()
    this.updateGizmo()
    this.updateResolution()
  }

  private updateContainers(): void {
    const containers = $containers.get()
    const activeId = $activeContainerId.get()
    const wanted = new Set(containers.map((c) => c.id))

    for (const [id, g] of this.gfx) {
      if (!wanted.has(id)) {
        this.disposeGfx(g)
        this.gfx.delete(id)
      }
    }

    // Collect part sample points once (shared across containers) only when needed.
    const anyWarn = containers.some((c) => c.warnEnabled)
    const worldPoints = anyWarn ? this.collectWorldPoints(this.settings.warnPrecision) : []

    for (const c of containers) {
      let g = this.gfx.get(c.id)
      if (g && g.shape !== c.shape) {
        this.disposeGfx(g)
        this.gfx.delete(c.id)
        g = undefined
      }
      if (!g) {
        g = this.makeGfx(c.shape, c.segments)
        this.gfx.set(c.id, g)
      } else if (g.segments !== c.segments) {
        // Same shape, different line count: swap in fresh edge geometry.
        const geom = outlineGeometry(c.shape, c.segments)
        g.outline.geometry = geom
        g.geom.dispose()
        g.geom = geom
        g.segments = c.segments
      }

      // Outline style.
      g.lineMaterial.color.set(c.color)
      g.lineMaterial.opacity = c.lineOpacity
      g.lineMaterial.linewidth = c.lineWidth
      g.warnMaterial.color.set(c.warnColor)
      g.warnMaterial.opacity = c.warnOpacity

      // Transform — the gizmo owns the active container's node while dragging.
      if (!(c.id === activeId && this.dragging)) {
        g.node.position.set(c.center.x, c.center.y, c.center.z)
        g.node.quaternion.set(c.rotation[0], c.rotation[1], c.rotation[2], c.rotation[3])
        g.node.scale.set(c.size.x || 1e-4, c.size.y || 1e-4, c.size.z || 1e-4)
      }

      // Warning regions.
      const regions = c.warnEnabled ? evaluateViolations(worldPoints, c) : new Set<string>()
      for (const [key, mesh] of g.warnMeshes) mesh.visible = regions.has(key)
    }
  }

  private makeGfx(shape: ReferenceShape, segments: number): ContainerGfx {
    const node = new THREE.Object3D()
    this.group.add(node)

    const lineMaterial = new LineMaterial({
      color: 0xffffff,
      linewidth: 1,
      depthTest: false,
      transparent: true,
    })
    this.materials.add(lineMaterial)
    const geom = outlineGeometry(shape, segments)
    const outline = new LineSegments2(geom, lineMaterial)
    outline.renderOrder = 999
    node.add(outline)

    const warnMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.33,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const warnMeshes = new Map<string, THREE.Mesh>()
    for (const r of regionsFor(shape)) {
      const mesh = new THREE.Mesh(r.geom, warnMaterial)
      mesh.position.set(r.pos.x, r.pos.y, r.pos.z)
      mesh.rotation.set(r.rot.x, r.rot.y, r.rot.z)
      mesh.renderOrder = 998
      mesh.visible = false
      node.add(mesh)
      warnMeshes.set(r.key, mesh)
    }

    return { shape, segments, node, outline, geom, lineMaterial, warnMaterial, warnMeshes }
  }

  private disposeGfx(g: ContainerGfx): void {
    g.node.removeFromParent()
    g.geom.dispose()
    g.lineMaterial.dispose()
    g.warnMaterial.dispose()
    this.materials.delete(g.lineMaterial)
    // Warn-region geometries are shared module-level singletons (not disposed);
    // the outline geometry (g.geom) is per-container and disposed above.
  }

  // --- Containment sampling --------------------------------------------------

  /** World-space sample points for every part object (bbox corners or all vertices). */
  private collectWorldPoints(mode: WarnPrecision): Vec3[] {
    const objects = this.getPartObjects()
    const out: Vec3[] = []
    if (mode === 'bbox') {
      const box = new THREE.Box3()
      for (const obj of objects) {
        box.setFromObject(obj)
        if (box.isEmpty()) continue
        const { min, max } = box
        for (const x of [min.x, max.x])
          for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) out.push({ x, y, z })
      }
      return out
    }
    const v = new THREE.Vector3()
    for (const obj of objects) {
      obj.updateWorldMatrix(true, true)
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh
        const pos = (mesh.geometry as THREE.BufferGeometry | undefined)?.attributes?.position as
          | THREE.BufferAttribute
          | undefined
        if (!mesh.isMesh || !pos) return
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
          out.push({ x: v.x, y: v.y, z: v.z })
        }
      })
    }
    return out
  }

  // --- Gizmo -----------------------------------------------------------------

  private updateGizmo(): void {
    const activeId = $activeContainerId.get()
    const c = activeId ? $containers.get().find((x) => x.id === activeId) : undefined
    if (!c || c.locked) {
      this.detachGizmo()
      return
    }
    const controls = this.ensureControls()
    const g = this.gfx.get(c.id)
    if (!g) return
    if (this.attachedId !== c.id) {
      controls.attach(g.node)
      this.attachedId = c.id
    }
    controls.setMode($containerGizmoMode.get())
    controls.setSpace('local')
  }

  private ensureControls(): TransformControls {
    if (this.controls) return this.controls
    const controls = new TransformControls(this.viewport.camera, this.viewport.renderer.domElement)
    controls.setSpace('local')
    this.viewport.scene.add(controls.getHelper())
    controls.addEventListener('dragging-changed', (e) => {
      this.dragging = e.value as boolean
      this.viewport.controls.enabled = !this.dragging
      if (!this.dragging) this.refresh() // re-seed node from normalized store on release
    })
    controls.addEventListener('objectChange', () => this.handleGizmoChange())
    this.controls = controls
    return controls
  }

  private handleGizmoChange(): void {
    const activeId = $activeContainerId.get()
    const c = activeId ? $containers.get().find((x) => x.id === activeId) : undefined
    if (!c) return
    const g = this.gfx.get(c.id)
    if (!g) return
    const n = g.node
    updateContainer(c.id, {
      center: { x: n.position.x, y: n.position.y, z: n.position.z },
      rotation: [n.quaternion.x, n.quaternion.y, n.quaternion.z, n.quaternion.w],
      size: normalizeSize(c.shape, { x: n.scale.x, y: n.scale.y, z: n.scale.z }),
    })
  }

  private detachGizmo(): void {
    if (this.controls && this.attachedId !== null) {
      this.controls.detach()
      this.attachedId = null
    }
  }

  private updateResolution(): void {
    const res = this.viewport.renderer.getSize(new THREE.Vector2())
    for (const m of this.materials) m.resolution.set(res.x, res.y)
  }

  dispose(): void {
    for (const unsub of this.unsubs) unsub()
    this.unsubs.length = 0
    for (const g of this.gfx.values()) this.disposeGfx(g)
    this.gfx.clear()
    if (this.controls) {
      this.controls.detach()
      this.controls.getHelper().removeFromParent()
      this.controls.dispose()
    }
    this.group.removeFromParent()
  }
}
