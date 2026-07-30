import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { ReadableAtom } from 'nanostores'
import type { CatalogSubPart } from '../ksa/catalog'
import type { CatalogPart } from '../ksa/partCatalog'
import { SubPartObject } from './SubPartObject'
import { ConnectorObject } from './ConnectorObject'
import { RenderLoop } from './RenderLoop'
import { SceneEnvironment } from './SceneEnvironment'
import { $connectorSettings } from '../state/settingsStore'
import { $lighting, type LightingSettings } from '../state/lightingStore'
import { initTextureSupport } from './textureSupport'

export interface PartPreviewViewportOptions {
  /** Store driving environment/tonemapping/background. Default: the global `$lighting`. */
  lighting?: ReadableAtom<LightingSettings>
  /** Render connector markers (default true, matching the Part browser popup). */
  showConnectors?: boolean
  /** Connector cube size in meters. Default: the global `$connectorSettings` size. */
  connectorSize?: number
  /**
   * When set, `frame()` makes the part's bounding sphere span this fraction of the
   * LIMITING viewport dimension (aspect-aware). Default: today's vertical-fov-only
   * `r / sin(fov/2) × 1.3` framing.
   */
  fillFraction?: number
  /**
   * Re-run `frame()` on resize until the user first interacts (orbit/zoom/pan).
   * Default false. Needed because iframes commonly lay out at 0×0 first and get
   * sized late.
   */
  reframeOnResize?: boolean
}

/**
 * A self-contained, read-only 3D preview of a whole Part (all of its SubPart
 * instances assembled at their relative transforms) for the Part importer
 * browser. Mirrors {@link SubPartPreviewViewport}'s lighting/tonemapping/IBL and
 * shares the same geometry/material caches via {@link SubPartObject}; it owns
 * only the renderer/controls/env plus the per-instance SubPartObjects it builds.
 *
 * Renders on demand ({@link RenderLoop}) — a browser dialog left open must not
 * cost a GPU frame every vsync just to show a part sitting still.
 *
 * {@link PartPreviewViewportOptions} lets an embedder (the standalone part-preview
 * mini app) swap the lighting store, hide connectors, use aspect-aware fill
 * framing, and re-frame on late resizes; every default reproduces the in-app
 * Part browser behavior exactly.
 */
export class PartPreviewViewport {
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly controls: OrbitControls
  private readonly host: HTMLElement
  private readonly resizeObserver: ResizeObserver
  private readonly sceneEnv: SceneEnvironment
  private readonly lightingUnsub: () => void
  private readonly loop = new RenderLoop(() => this.renderFrame())

  private readonly connectorSize: number | undefined
  private readonly fillFraction: number | undefined
  private readonly reframeOnResize: boolean

  private objects: SubPartObject[] = []
  private connectorObjects: ConnectorObject[] = []
  /** Bumped on each setPart so a superseded async load discards its result. */
  private loadToken = 0
  private showConnectors: boolean
  /** Distance chosen by the last {@link frame}; anchors {@link zoomBy}'s clamp. */
  private framedDistance = 0
  /** True once the user has orbited/zoomed/panned — suppresses `reframeOnResize`. */
  private hasInteracted = false
  /** Scratch vector for {@link zoomBy} (avoids a per-call allocation). */
  private readonly zoomScratch = new THREE.Vector3()

  constructor(host: HTMLElement, options: PartPreviewViewportOptions = {}) {
    this.host = host
    this.showConnectors = options.showConnectors ?? true
    this.connectorSize = options.connectorSize
    this.fillFraction = options.fillFraction
    this.reframeOnResize = options.reframeOnResize ?? false
    this.scene.background = new THREE.Color(0x16171d)

    const w = host.clientWidth || 1
    const h = host.clientHeight || 1

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000)
    this.camera.position.set(3, 2, 4)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)

    initTextureSupport(this.renderer)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.target.set(0, 0, 0)
    this.controls.update()
    this.controls.addEventListener('change', this.onNeedsRender)
    this.controls.addEventListener('start', this.onInteractionStart)

    // Environment/tonemapping/background driven by the $lighting store (global by default).
    this.sceneEnv = new SceneEnvironment(this.renderer, this.scene)
    this.lightingUnsub = (options.lighting ?? $lighting).subscribe((s) => {
      this.loop.invalidate()
      void this.sceneEnv.apply(s).then(() => this.loop.invalidate())
    })

    const hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 0.4)
    this.scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 2.0)
    dir.position.set(5, 10, 7)
    this.scene.add(dir)

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(host)
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onNeedsRender)

    this.loop.invalidate()
  }

  private readonly onNeedsRender = (): void => {
    this.loop.invalidate()
  }

  private readonly onInteractionStart = (): void => {
    this.hasInteracted = true
  }

  /**
   * Loads and shows the given Part (or clears the preview when null). `index`
   * resolves each placement's SubPart template id to its catalog entry; any
   * placement whose template is missing from the catalog is skipped.
   */
  async setPart(part: CatalogPart | null, index: Map<string, CatalogSubPart>): Promise<void> {
    const token = ++this.loadToken
    this.clearObjects()
    if (!part) return

    // Connectors build synchronously (cube + arrow), so add them up front. They
    // are always built (so toggling visibility is instant) but may start hidden.
    const size = this.connectorSize ?? $connectorSettings.get().size
    for (const connector of part.connectors) {
      const obj = new ConnectorObject(connector, size)
      obj.group.visible = this.showConnectors
      this.connectorObjects.push(obj)
      this.scene.add(obj.group)
    }

    try {
      const built = await Promise.all(
        part.placements.map(async (placement) => {
          const entry = index.get(placement.subPartTemplateId)
          if (!entry) return null
          return SubPartObject.create(entry, placement)
        }),
      )
      if (token !== this.loadToken) {
        for (const obj of built) obj?.dispose()
        return // a newer selection superseded this load
      }
      for (const obj of built) {
        if (!obj) continue
        this.objects.push(obj)
        this.scene.add(obj.group)
      }
      this.frame()
      this.loop.invalidate()
    } catch (err) {
      console.warn(`PartPreviewViewport: failed to load Part '${part.id}'`, err)
    }
  }

  private clearObjects(): void {
    for (const obj of this.objects) {
      this.scene.remove(obj.group)
      obj.dispose()
    }
    this.objects = []
    for (const obj of this.connectorObjects) {
      this.scene.remove(obj.group)
      obj.dispose()
    }
    this.connectorObjects = []
    this.loop.invalidate()
  }

  /** Frames the camera to the combined bounding box of the assembled Part. */
  private frame(): void {
    const box = new THREE.Box3()
    for (const obj of this.objects) box.expandByObject(obj.group)
    // Hidden connectors must not pad the framing with invisible geometry.
    if (this.showConnectors) {
      for (const obj of this.connectorObjects) box.expandByObject(obj.group)
    }
    if (box.isEmpty()) return

    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 0.001)
    const vHalf = (this.camera.fov * Math.PI) / 180 / 2
    let distance: number
    if (this.fillFraction != null) {
      // Aspect-aware: the sphere's projected diameter spans `fillFraction` of the
      // LIMITING viewport dimension. Screen-space extent is proportional to
      // tan(angle), so solve tan(θ) = fillFraction × tan(half) and then d = r/sin(θ)
      // (a sphere of radius r at distance d has silhouette half-angle asin(r/d)).
      const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect)
      const theta = Math.atan(this.fillFraction * Math.tan(Math.min(vHalf, hHalf)))
      distance = radius / Math.sin(theta)
    } else {
      distance = (radius / Math.sin(vHalf)) * 1.3
    }

    const dir = new THREE.Vector3(1, 0.6, 1).normalize()
    this.controls.target.copy(sphere.center)
    this.camera.position.copy(sphere.center).addScaledVector(dir, distance)
    this.camera.near = Math.max(distance / 100, 0.001)
    this.camera.far = distance * 100
    this.camera.updateProjectionMatrix()
    this.controls.update()
    this.framedDistance = distance
  }

  /**
   * Multiply the camera's distance to the orbit target by `factor` (clamped to a
   * sane range around the framed distance).
   */
  zoomBy(factor: number): void {
    const offset = this.zoomScratch.copy(this.camera.position).sub(this.controls.target)
    const dist = offset.length()
    if (dist === 0 || !Number.isFinite(factor)) return
    // Counts as user interaction (it IS one — the +/- buttons), so a late iframe
    // resize doesn't re-frame away the zoom they just chose.
    this.hasInteracted = true
    // Stay well inside the near/far window frame() picked (distance/100 .. distance*100).
    const anchor = this.framedDistance || dist
    const next = THREE.MathUtils.clamp(dist * factor, anchor / 20, anchor * 10)
    this.camera.position.copy(this.controls.target).addScaledVector(offset.divideScalar(dist), next)
    this.controls.update()
    this.loop.invalidate()
  }

  /** Show/hide the connector markers without re-loading or re-framing the part. */
  setShowConnectors(show: boolean): void {
    this.showConnectors = show
    for (const obj of this.connectorObjects) obj.group.visible = show
    this.loop.invalidate()
  }

  private handleResize(): void {
    const w = this.host.clientWidth || 1
    const h = this.host.clientHeight || 1
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    // An iframe commonly lays out 0×0 first and is sized late, so the initial
    // framing was computed against a bogus aspect — redo it until the user acts.
    if (this.reframeOnResize && !this.hasInteracted && this.objects.length > 0) this.frame()
    this.loop.invalidate()
  }

  private renderFrame(): void {
    // Damping here dispatches `change` → invalidate, so an inertial orbit keeps
    // asking for frames until it settles.
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.loop.dispose()
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onNeedsRender)
    this.controls.removeEventListener('change', this.onNeedsRender)
    this.controls.removeEventListener('start', this.onInteractionStart)
    this.clearObjects()
    this.controls.dispose()
    this.lightingUnsub()
    this.sceneEnv.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
