import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createGrid } from './Grid'

/**
 * Framework-agnostic 3D workspace: renderer, scene, perspective camera, lighting,
 * reference grid, and orbit controls. Mounts its canvas into a host element and
 * runs a render loop. Later phases attach SubPart objects, gizmos, and selection
 * to `scene` / `camera` / `renderer`.
 */
export class Viewport {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls

  private readonly host: HTMLElement
  private readonly resizeObserver: ResizeObserver
  private readonly envRenderTarget: THREE.WebGLRenderTarget

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
    // PBR output: filmic tonemapping + sRGB output, matching KSA's composite pass.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.target.set(0, 0, 0)
    this.controls.update()

    // Image-based lighting so PBR metals reflect and aren't black (KSA uses IBL).
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04)
    this.scene.environment = this.envRenderTarget.texture
    pmrem.dispose()

    const hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 0.4)
    this.scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 2.0)
    dir.position.set(5, 10, 7)
    this.scene.add(dir)

    this.scene.add(createGrid())

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(host)

    this.renderer.setAnimationLoop(this.renderFrame)
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
    this.envRenderTarget.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
