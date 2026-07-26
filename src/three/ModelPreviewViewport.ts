import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { RenderLoop } from './RenderLoop'
import { SceneEnvironment } from './SceneEnvironment'
import { $lighting } from '../state/lightingStore'
import { initTextureSupport } from './textureSupport'

/**
 * A self-contained, read-only 3D preview of a JUST-LOADED glTF model, for the import dialog.
 * Same shape as {@link SubPartPreviewViewport} (own renderer + controls + SceneEnvironment,
 * the editor's lighting/tonemapping, orbit only) — it differs in what it shows and why.
 *
 * WHAT THIS PREVIEW ANSWERS: "is this model oriented, scaled and split the way I meant?" It
 * renders the loaded scene with ITS OWN glTF materials, because that is the picture the user
 * can compare against Blender. It deliberately does NOT run the glTF → KSA material
 * translation (factors baked to pixels, ORM packed, emissive composited into the diffuse):
 * the authoritative surface preview is the EDITOR viewport after import, which renders the
 * real `CustomMaterial` through the same path the mod export uses. The dialog says so in its
 * helper text; do not "improve" this into a fake surface preview.
 *
 * OWNERSHIP: the loaded glTF's geometries and materials belong to the caller (the dialog
 * keeps the model alive across option changes, and the import pass reads the same objects),
 * so this class NEVER disposes them. It disposes only what it creates: the renderer, the
 * controls, the environment and its own grid.
 *
 * Renders on demand ({@link RenderLoop}) — the import dialog can sit open for a long
 * while, and a still model must not cost a GPU frame every vsync.
 */
export class ModelPreviewViewport {
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly controls: OrbitControls
  private readonly host: HTMLElement
  private readonly resizeObserver: ResizeObserver
  private readonly sceneEnv: SceneEnvironment
  private readonly lightingUnsub: () => void
  private readonly loop = new RenderLoop(() => this.renderFrame())

  /** Transform holder for the model clone: the import correction (scale + up-axis) lives here. */
  private readonly root = new THREE.Group()
  /** The source object currently cloned into {@link root} — identity check, never rendered. */
  private source: THREE.Object3D | null = null
  private model: THREE.Object3D | null = null
  private grid: THREE.GridHelper | null = null

  constructor(host: HTMLElement) {
    this.host = host
    this.scene.background = new THREE.Color(0x16171d)
    this.scene.add(this.root)

    const w = host.clientWidth || 1
    const h = host.clientHeight || 1

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000)
    this.camera.position.set(3, 2, 4)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)

    // No-op if the editor viewport already initialized it (same GPU, same support).
    initTextureSupport(this.renderer)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.update()
    this.controls.addEventListener('change', this.onNeedsRender)

    this.sceneEnv = new SceneEnvironment(this.renderer, this.scene)
    this.lightingUnsub = $lighting.subscribe((s) => {
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

  /**
   * Shows `scene` under the given import correction, or clears the preview when null.
   *
   * The correction MIRRORS `importPlan.correctionMatrix`: uniform scale, plus `RotX(-90°)`
   * when the file is Z-up — so what is framed here is what the placements will be.
   *
   * Re-calling with the SAME source object only re-applies the transform (and re-frames):
   * the clone is the expensive part, and the dialog calls this on every scale keystroke.
   */
  setModel(scene: THREE.Object3D | null, opts: { scale: number; upAxis: 'y' | 'z' }): void {
    if (scene !== this.source) {
      if (this.model) this.root.remove(this.model)
      this.model = null
      this.source = scene
      // Clone rather than re-parent: the caller's scene is live data (analyzeImport walks it,
      // the import bakes it) and must not acquire a parent transform from the preview.
      // SkeletonUtils.clone keeps a SkinnedMesh bound to ITS OWN cloned skeleton; a plain
      // Object3D.clone() would leave it pointing at the original bones. Geometry and
      // materials are shared with the source by both — which is why we never dispose them.
      if (scene) {
        this.model = cloneSkeleton(scene)
        this.root.add(this.model)
      }
    }

    const rotation = opts.upAxis === 'z' ? -Math.PI / 2 : 0
    this.root.rotation.set(rotation, 0, 0)
    const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1
    this.root.scale.setScalar(scale)
    this.root.updateMatrixWorld(true)

    this.rebuildGrid()
    this.frame()
    this.loop.invalidate()
  }

  /** World-space bounds of the corrected model, in metres. Empty when nothing is loaded. */
  private bounds(): THREE.Box3 {
    const box = new THREE.Box3()
    if (this.model) box.setFromObject(this.model)
    return box
  }

  /**
   * A metric grid under the model: scale is only legible against something known, and a
   * regular ruler under the mesh is the cheapest way to show it. The cell is the nearest
   * power of ten METRES to the model's size (1 m for a typical part, 0.01 m for a model
   * exported in centimetres and not yet corrected), so the grid stays readable across the
   * 10 000× range a wrong unit setting produces instead of vanishing off-frustum.
   * Owned here, so disposed here.
   */
  private rebuildGrid(): void {
    if (this.grid) {
      this.scene.remove(this.grid)
      this.grid.geometry.dispose()
      ;(this.grid.material as THREE.Material).dispose()
      this.grid = null
    }
    const box = this.bounds()
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const footprint = Math.max(size.x, size.z, 1e-6)
    const cell = 10 ** Math.floor(Math.log10(footprint))
    // At least 2 cells across, and never so many lines that the grid reads as a solid plane.
    const cells = Math.min(40, Math.max(2, Math.ceil((footprint * 1.5) / cell)))
    const grid = new THREE.GridHelper(cells * cell, cells, 0x4a5568, 0x2c313c)
    grid.position.set(0, box.min.y, 0)
    const material = grid.material as THREE.Material
    material.transparent = true
    material.opacity = 0.5
    this.scene.add(grid)
    this.grid = grid
  }

  /** Frames the camera on the model's bounding sphere from a 3/4 angle. */
  private frame(): void {
    const box = this.bounds()
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
    this.controls.dispose()
    this.lightingUnsub()
    this.sceneEnv.dispose()
    if (this.grid) {
      this.grid.geometry.dispose()
      ;(this.grid.material as THREE.Material).dispose()
      this.grid = null
    }
    // The model clone shares the loaded glTF's geometry + materials — remove it, never
    // dispose it (the dialog still owns the model, and the import reads the same objects).
    if (this.model) this.root.remove(this.model)
    this.model = null
    this.source = null
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
