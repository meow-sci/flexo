/**
 * ICRP's 3D workspace host: renderer, scene, camera, orbit controls, IBL and the
 * on-demand render loop. A slim rebuild of flexo's Viewport (which is coupled to
 * flexo's view/lighting/IVA stores) tuned for ground-complex scale: near 0.05,
 * far 5000, camera starting three-quarters above a ~150 m pad.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RenderLoop } from '../../../../src/three/RenderLoop';
import { SceneEnvironment } from '../../../../src/three/SceneEnvironment';
import { frameDistance } from '../../../../src/three/cameraFraming';
import { initTextureSupport } from '../../../../src/three/textureSupport';

export class IcrpViewport {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private readonly host: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly sceneEnv: SceneEnvironment;
  private readonly loop = new RenderLoop(() => this.renderFrame());

  constructor(host: HTMLElement) {
    this.host = host;
    this.scene.background = new THREE.Color(0x16171d);

    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.05, 5000);
    this.camera.position.set(120, 80, 160);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    // KTX2 transcoder + anisotropy caps live in a renderer-fed singleton; every
    // texture load (TextureCache) throws until this runs.
    initTextureSupport(this.renderer);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.52; // barely below the horizon
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.controls.addEventListener('change', () => this.invalidate());

    // IBL + tonemapping via flexo's SceneEnvironment with fixed daylight-ish
    // settings (a lighting panel can drive this later).
    this.sceneEnv = new SceneEnvironment(this.renderer, this.scene);
    void this.sceneEnv
      .apply({
        environment: 'kloofendal', // daylight sky — the natural default for a ground site
        environmentIntensity: 0.6,
        showEnvironmentBackground: true,
        backgroundBlur: 0,
        exposure: 1,
        toneMapping: 'aces',
      })
      .then(() => this.invalidate());

    // The sun: statics are sunlit + ambient in-game (no point lights).
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(200, 300, 150);
    this.scene.add(sun);
    const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a3d33, 0.5);
    this.scene.add(hemi);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(host);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);

    this.invalidate();
  }

  /** Requests a redraw (coalescing, on-demand — flexo's RenderLoop contract). */
  invalidate(): void {
    this.loop.invalidate();
  }

  /** Frame the given three-space bounds, keeping the current view direction. */
  frameBounds(center: THREE.Vector3, size: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    if (dir.lengthSq() < 1e-12) dir.set(3, 2, 4);
    dir.normalize();
    const distance = frameDistance(size, this.camera.fov, this.camera.aspect);
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, distance);
    // Never frame from below the ground plane (a site is always viewed from above).
    this.camera.position.y = Math.max(this.camera.position.y, distance * 0.25, 3);
    this.camera.lookAt(center);
    this.controls.update();
    this.invalidate();
  }

  private renderFrame(): void {
    // Damping: keep drawing until the orbit settles.
    if (this.controls.enableDamping && this.controls.update()) this.invalidate();
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(): void {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.invalidate();
  }

  private readonly onContextRestored = (): void => {
    this.invalidate();
  };

  dispose(): void {
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.controls.dispose();
    this.sceneEnv.dispose();
    this.loop.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
