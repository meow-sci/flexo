import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GridManager } from './Grid'
import { $cameraState, type CameraDir, type CameraState } from '../state/viewStore'

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
  readonly grids = new GridManager()

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
    this.controls.addEventListener('end', this.onControlsEnd)

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

    this.scene.add(this.grids.group)

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(host)

    this.renderer.setAnimationLoop(this.renderFrame)
  }

  /**
   * Snaps the camera to an axis-aligned orthographic-style view, recentering the
   * controls target on the origin so the snapped view looks straight down the
   * axis at (0,0,0). Preserves the current distance (zoom). `up` is adjusted for
   * the top/bottom views so the camera doesn't gimbal-lock looking straight
   * down/up.
   */
  snapCamera(dir: CameraDir): void {
    const target = this.controls.target
    const distance = this.camera.position.distanceTo(target)
    target.set(0, 0, 0)

    const offset = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    switch (dir) {
      case 'right': offset.set(1, 0, 0); break
      case 'left': offset.set(-1, 0, 0); break
      case 'front': offset.set(0, 0, 1); break
      case 'back': offset.set(0, 0, -1); break
      case 'top': offset.set(0, 1, 0); up.set(0, 0, -1); break
      case 'bottom': offset.set(0, -1, 0); up.set(0, 0, 1); break
    }

    this.camera.up.copy(up)
    this.camera.position.copy(target).addScaledVector(offset, distance)
    this.camera.lookAt(target)
    this.controls.update()
    $cameraState.set(this.readCameraState())
  }

  restoreCamera(state: CameraState): void {
    this.camera.position.set(...state.position)
    this.camera.up.set(...state.up)
    this.controls.target.set(...state.target)
    this.controls.update()
  }

  private readonly onControlsEnd = (): void => {
    $cameraState.set(this.readCameraState())
  }

  private readCameraState(): CameraState {
    const p = this.camera.position
    const t = this.controls.target
    const u = this.camera.up
    return {
      position: [p.x, p.y, p.z],
      target: [t.x, t.y, t.z],
      up: [u.x, u.y, u.z],
    }
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
    this.controls.removeEventListener('end', this.onControlsEnd)
    this.controls.dispose()
    this.grids.dispose()
    this.envRenderTarget.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
