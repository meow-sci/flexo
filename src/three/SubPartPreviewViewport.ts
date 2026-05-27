import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { CatalogSubPart } from '../ksa/catalog'
import { getSubPartGeometry } from './MeshAtlasCache'
import { getSharedMaterial } from './MaterialFactory'
import { SceneEnvironment } from './SceneEnvironment'
import { $lighting } from '../state/lightingStore'
import { initTextureSupport } from './textureSupport'

/**
 * A self-contained, read-only 3D preview of a single SubPart for the catalog
 * browser. It mirrors the main {@link Viewport}'s lighting/tonemapping/IBL so a
 * part looks the same here as when placed, but carries none of the editor
 * machinery (no grid, gizmo, selection, or store coupling) — only orbit + zoom.
 *
 * Geometry and materials come from the same shared caches the editor uses, so
 * they are never disposed here; only the renderer/controls/env are owned.
 */
export class SubPartPreviewViewport {
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly controls: OrbitControls
  private readonly host: HTMLElement
  private readonly resizeObserver: ResizeObserver
  private readonly sceneEnv: SceneEnvironment
  private readonly lightingUnsub: () => void

  private current: THREE.Mesh | null = null
  /** Bumped on each setSubPart so a superseded async load discards its result. */
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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)

    // No-op if the main editor viewport already initialized it; same GPU, so the
    // detected compressed-texture support is identical either way.
    initTextureSupport(this.renderer)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.target.set(0, 0, 0)
    this.controls.update()

    // Environment/tonemapping/background driven by the global $lighting store.
    this.sceneEnv = new SceneEnvironment(this.renderer, this.scene)
    this.lightingUnsub = $lighting.subscribe((s) => void this.sceneEnv.apply(s))

    const hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 0.4)
    this.scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 2.0)
    dir.position.set(5, 10, 7)
    this.scene.add(dir)

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(host)

    this.renderer.setAnimationLoop(this.renderFrame)
  }

  /** Loads and shows the given SubPart (or clears the preview when null). */
  async setSubPart(entry: CatalogSubPart | null): Promise<void> {
    const token = ++this.loadToken
    if (this.current) {
      this.scene.remove(this.current)
      this.current = null
    }
    if (!entry) return

    try {
      const [geometry, material] = await Promise.all([
        getSubPartGeometry(entry.atlasUrl, entry.meshNodeName),
        getSharedMaterial(entry),
      ])
      if (token !== this.loadToken) return // a newer selection superseded this load
      const mesh = new THREE.Mesh(geometry, material)
      this.scene.add(mesh)
      this.current = mesh
      this.frame(geometry)
    } catch (err) {
      console.warn(`SubPartPreviewViewport: failed to load '${entry.id}'`, err)
    }
  }

  /** Frames the camera to the geometry's bounding sphere from a 3/4 angle. */
  private frame(geometry: THREE.BufferGeometry): void {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere()
    const sphere = geometry.boundingSphere!
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
    this.controls.dispose()
    this.lightingUnsub()
    this.sceneEnv.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
