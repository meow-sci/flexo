/**
 * The Add browser's 3D preview (flexo's SubPartPreviewViewport pattern,
 * generalized): renders ANY catalog entry — a single piece, a Core prefab, or a
 * stock vessel Part — as its full set of (piece, transform) meshes under the
 * KSA static basis, so everything previews upright exactly as it will stand on
 * the ground. Orbit + zoom only; renders on demand; geometry/materials come
 * from the shared caches (never disposed here).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RenderLoop } from '../../../../src/three/RenderLoop';
import { SceneEnvironment } from '../../../../src/three/SceneEnvironment';
import { getSubPartGeometry } from '../../../../src/three/MeshAtlasCache';
import { initTextureSupport } from '../../../../src/three/textureSupport';
import { applyPlacement } from '../../../../src/three/coords';
import { applyStaticBasis } from './basis';
import { getStaticMaterial, reapplyPatches } from './materials';
import type { CatalogStaticPiece } from '../ksa/staticCatalog';
import type { Transform } from '../ksa/types';

export interface PreviewEntry {
  piece: CatalogStaticPiece;
  transform: Transform;
}

export class CatalogPreviewViewport {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly host: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly sceneEnv: SceneEnvironment;
  private readonly loop = new RenderLoop(() => this.renderFrame());
  /** KSA-basis root (+X up → meshes stand upright, like the editor). */
  private readonly root = new THREE.Group();

  private loadToken = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.scene.background = new THREE.Color(0x16171d);

    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 2000);
    this.camera.position.set(3, 2, 4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    initTextureSupport(this.renderer);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => this.loop.invalidate());

    // Fixed daylight matching the editor viewport, so a piece previews the way
    // it will render once placed.
    this.sceneEnv = new SceneEnvironment(this.renderer, this.scene);
    void this.sceneEnv
      .apply({
        environment: 'kloofendal',
        environmentIntensity: 0.6,
        showEnvironmentBackground: false,
        backgroundBlur: 0,
        exposure: 1,
        toneMapping: 'aces',
      })
      .then(() => this.loop.invalidate());
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(200, 300, 150);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x3a3d33, 0.5));

    applyStaticBasis(this.root);
    this.scene.add(this.root);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(host);
    this.loop.invalidate();
  }

  /** Loads and shows an entry set (clears the preview when empty). */
  async setEntries(entries: readonly PreviewEntry[]): Promise<void> {
    const token = ++this.loadToken;
    while (this.root.children.length > 0) {
      const child = this.root.children[this.root.children.length - 1] as THREE.Mesh;
      (child.material as THREE.Material | undefined)?.dispose?.();
      this.root.remove(child);
    }
    this.loop.invalidate();
    if (entries.length === 0) return;

    const meshes = await Promise.all(
      entries.map(async (entry) => {
        try {
          const [geometry, shared] = await Promise.all([
            getSubPartGeometry(entry.piece.atlasUrl, entry.piece.meshNodeName),
            getStaticMaterial(entry.piece),
          ]);
          const material = shared.clone();
          reapplyPatches(material);
          const mesh = new THREE.Mesh(geometry, material);
          if (material.transparent) mesh.renderOrder = 1;
          applyPlacement(mesh, entry.transform);
          return mesh;
        } catch (err) {
          console.warn(`CatalogPreviewViewport: failed to load '${entry.piece.id}'`, err);
          return null;
        }
      }),
    );
    if (token !== this.loadToken) {
      for (const mesh of meshes) (mesh?.material as THREE.Material | undefined)?.dispose?.();
      return;
    }
    for (const mesh of meshes) {
      if (mesh) this.root.add(mesh);
    }
    this.frame();
    this.loop.invalidate();
  }

  /** Frames the whole entry set from a 3/4 angle. */
  private frame(): void {
    const box = new THREE.Box3().expandByObject(this.root);
    if (box.isEmpty()) return;
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const radius = Math.max(sphere.radius, 0.001);
    const fov = (this.camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fov / 2)) * 1.25;
    const dir = new THREE.Vector3(1, 0.55, 1).normalize();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(dir, distance);
    this.camera.near = Math.max(distance / 100, 0.001);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private handleResize(): void {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.loop.invalidate();
  }

  private renderFrame(): void {
    if (this.controls.enableDamping && this.controls.update()) this.loop.invalidate();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.loadToken++;
    this.loop.dispose();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.sceneEnv.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
