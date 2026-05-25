import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { CatalogSubPart } from '../ksa/catalog'
import type { CatalogPart } from '../ksa/partCatalog'
import { SubPartObject } from './SubPartObject'
import { ConnectorObject } from './ConnectorObject'
import { $connectorSettings } from '../state/settingsStore'
import { initTextureSupport } from './textureSupport'

/**
 * A self-contained, read-only 3D preview of a whole Part (all of its SubPart
 * instances assembled at their relative transforms) for the Part importer
 * browser. Mirrors {@link SubPartPreviewViewport}'s lighting/tonemapping/IBL and
 * shares the same geometry/material caches via {@link SubPartObject}; it owns
 * only the renderer/controls/env plus the per-instance SubPartObjects it builds.
 */
export class PartPreviewViewport {
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly controls: OrbitControls
  private readonly host: HTMLElement
  private readonly resizeObserver: ResizeObserver
  private readonly envRenderTarget: THREE.WebGLRenderTarget

  private objects: SubPartObject[] = []
  private connectorObjects: ConnectorObject[] = []
  /** Bumped on each setPart so a superseded async load discards its result. */
  private loadToken = 0

  constructor(host: HTMLElement) {
    this.host = host
    this.scene.background = new THREE.Color(0x16171d)

    const w = host.clientWidth || 1
    const h = host.clientHeight || 1

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000)
    this.camera.position.set(3, 2, 4)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)

    initTextureSupport(this.renderer)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.target.set(0, 0, 0)
    this.controls.update()

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04)
    this.scene.environment = this.envRenderTarget.texture
    pmrem.dispose()

    const hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 0.4)
    this.scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 2.0)
    dir.position.set(5, 10, 7)
    this.scene.add(dir)

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(host)

    this.renderer.setAnimationLoop(this.renderFrame)
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

    // Connectors build synchronously (cube + arrow), so add them up front.
    const settings = $connectorSettings.get()
    for (const connector of part.connectors) {
      const obj = new ConnectorObject(connector, settings.size)
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
  }

  /** Frames the camera to the combined bounding box of the assembled Part. */
  private frame(): void {
    const box = new THREE.Box3()
    for (const obj of this.objects) box.expandByObject(obj.group)
    for (const obj of this.connectorObjects) box.expandByObject(obj.group)
    if (box.isEmpty()) return

    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 0.001)
    const fov = (this.camera.fov * Math.PI) / 180
    const distance = (radius / Math.sin(fov / 2)) * 1.3

    const dir = new THREE.Vector3(1, 0.6, 1).normalize()
    this.controls.target.copy(sphere.center)
    this.camera.position.copy(sphere.center).addScaledVector(dir, distance)
    this.camera.near = Math.max(distance / 100, 0.001)
    this.camera.far = distance * 100
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  private handleResize(): void {
    const w = this.host.clientWidth || 1
    const h = this.host.clientHeight || 1
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private readonly renderFrame = (): void => {
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.clearObjects()
    this.controls.dispose()
    this.envRenderTarget.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
