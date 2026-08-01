import * as THREE from 'three';
import Stats from 'stats.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GridManager } from './Grid';
import { RenderLoop } from './RenderLoop';
import { SceneEnvironment } from './SceneEnvironment';
import { $cameraState, type CameraDir, type CameraState } from '../state/viewStore';
import { $lighting } from '../state/lightingStore';
import { $showFpsCounter } from '../state/settingsStore';
import {
  $seatLook,
  nudgeSeatLook,
  reclampSeatLook,
  seatLookDirection,
  type SeatAxes,
} from '../state/ivaStore';
import type { Vec3 } from '../ksa/types';

/**
 * An IVA seat's eye frame, in workspace coordinates: where the camera sits and the two
 * axes KSA authors as `<ForwardAxis>` / `<UpAxis>`. Both axes are unit length (they come
 * from `seatAxesFromRotation`), which is also the only case where `clampSeatLook` is
 * idempotent — see its doc comment.
 */
export interface SeatPose extends SeatAxes {
  position: Vec3;
}

/** Free-look sensitivity in radians per pixel of pointer travel. Editor feel, not KSA's. */
const SEAT_LOOK_RAD_PER_PX = 0.004;

/**
 * Framework-agnostic 3D workspace: renderer, scene, perspective camera, lighting,
 * reference grid, and orbit controls. Mounts its canvas into a host element and
 * runs a render loop. Later phases attach SubPart objects, gizmos, and selection
 * to `scene` / `camera` / `renderer`.
 *
 * The loop is ON-DEMAND ({@link RenderLoop}): a frame is drawn only when
 * {@link invalidate} is called. This class invalidates for what it owns — camera
 * motion, resize, environment/tonemapping, context restore — and everything that
 * mutates the scene from outside (EditorScene and its layers) must do the same.
 */
export class Viewport {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** HTML-label renderer overlaid on the canvas — used for 3D-anchored measurement labels. */
  readonly labelRenderer: CSS2DRenderer;
  readonly controls: OrbitControls;
  readonly grids = new GridManager();

  private readonly host: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly sceneEnv: SceneEnvironment;
  private readonly lightingUnsub: () => void;
  private readonly loop = new RenderLoop(() => this.renderFrame());
  /** FPS overlay (stats.js), mounted only while {@link $showFpsCounter} is on. */
  private stats: Stats | null = null;
  private readonly fpsUnsub: () => void;
  /**
   * Active IVA seat preview, or null. Holds everything {@link exitSeatView} has to undo:
   * the orbit camera as it was, and the `$seatLook` subscription that drives the camera.
   */
  private seatView: {
    pose: SeatPose;
    /** The orbit camera to put back on exit. */
    saved: CameraState;
    unsubLook: () => void;
  } | null = null;
  /** Pointer id currently dragging the seat free-look, and where it last was. */
  private seatDrag: { pointerId: number; x: number; y: number } | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    this.scene.background = new THREE.Color(0x16171d);

    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000);
    this.camera.position.set(3, 2, 4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    // sRGB output matching KSA's composite pass; tonemapping is driven by $lighting.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    // HTML labels overlaid on the canvas (measurement dimensions). The overlay
    // must not eat pointer events meant for orbit/selection.
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    const labelEl = this.labelRenderer.domElement;
    labelEl.style.position = 'absolute';
    labelEl.style.top = '0';
    labelEl.style.left = '0';
    labelEl.style.pointerEvents = 'none';
    host.appendChild(labelEl);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.controls.addEventListener('end', this.onControlsEnd);
    // Fires on every camera change — user input AND each damping step — which is
    // what keeps an inertial orbit rendering until it settles (see renderFrame).
    this.controls.addEventListener('change', this.onControlsChange);

    // Image-based lighting (so PBR metals reflect), tonemapping, and background,
    // all driven by the global $lighting store. subscribe() fires immediately.
    this.sceneEnv = new SceneEnvironment(this.renderer, this.scene);
    this.lightingUnsub = $lighting.subscribe((s) => {
      // apply() lands in two halves: exposure/tonemapping synchronously, then the
      // HDR + PMREM once loaded. Both change pixels, so both get a frame.
      this.invalidate();
      void this.sceneEnv.apply(s).then(() => this.invalidate());
    });

    const hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 0.4);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(5, 10, 7);
    this.scene.add(dir);

    this.scene.add(this.grids.group);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(host);

    // A lost/restored context (GPU switch, wake from sleep) leaves a blank canvas
    // until something redraws it — an on-demand loop has no next frame to fix it.
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);

    // FPS overlay, driven by the global setting. subscribe() fires immediately,
    // so a persisted-on counter mounts right away.
    this.fpsUnsub = $showFpsCounter.subscribe((on) => this.setFpsCounter(on));

    this.invalidate();
  }

  /** Requests a redraw. Cheap and coalescing — call it after anything visible changes. */
  invalidate(): void {
    this.loop.invalidate();
  }

  /**
   * Mount or remove the stats.js panel, pinned to the host's top-left corner.
   *
   * While it is up the loop runs continuously: the counter exists to answer "how
   * fast can this scene draw", and against an on-demand loop it would otherwise
   * read ~0 fps whenever the user stopped moving. Turning it on is therefore also
   * opting into the idle cost it measures.
   */
  private setFpsCounter(on: boolean): void {
    if (on === (this.stats !== null)) return;
    this.loop.setContinuous(on);
    if (on) {
      const stats = new Stats();
      stats.showPanel(0); // 0: FPS
      const el = stats.dom;
      // Scope it inside the host (the positioned viewport container) instead of
      // document.body so it stays within the 3D workspace.
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
      el.style.zIndex = '10';
      this.host.appendChild(el);
      this.stats = stats;
    } else if (this.stats) {
      this.stats.dom.remove();
      this.stats = null;
    }
  }

  /**
   * Snaps the camera to an axis-aligned orthographic-style view, recentering the
   * controls target on the origin so the snapped view looks straight down the
   * axis at (0,0,0). Preserves the current distance (zoom). `up` is adjusted for
   * the top/bottom views so the camera doesn't gimbal-lock looking straight
   * down/up.
   */
  snapCamera(dir: CameraDir): void {
    const target = this.controls.target;
    const distance = this.camera.position.distanceTo(target);
    target.set(0, 0, 0);

    const offset = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    switch (dir) {
      case 'right':
        offset.set(1, 0, 0);
        break;
      case 'left':
        offset.set(-1, 0, 0);
        break;
      case 'front':
        offset.set(0, 0, 1);
        break;
      case 'back':
        offset.set(0, 0, -1);
        break;
      case 'top':
        offset.set(0, 1, 0);
        up.set(0, 0, -1);
        break;
      case 'bottom':
        offset.set(0, -1, 0);
        up.set(0, 0, 1);
        break;
    }

    this.camera.up.copy(up);
    this.camera.position.copy(target).addScaledVector(offset, distance);
    this.camera.lookAt(target);
    this.controls.update();
    $cameraState.set(this.readCameraState());
  }

  /**
   * Sits the camera at `pose` — the IVA seat preview (plans/IVA_PLAN.md §3.6).
   *
   * The orbit camera is snapshotted and `OrbitControls` disabled (both its input AND its
   * per-frame `update()`, which would otherwise re-aim the camera at `controls.target`
   * every frame); pointer drags on the canvas turn the look direction in `$seatLook`, and
   * this subscribes to that atom so the camera follows. No FOV change: the camera is
   * already 50°, which is KSA's `GameSettings.FieldOfView` (`Camera.cs:51`).
   *
   * Idempotent — calling it again while previewing just re-poses the seat, so the caller
   * can push a fresh pose whenever the document moves the seat.
   */
  enterSeatView(pose: SeatPose): void {
    if (this.seatView) {
      this.seatView.pose = pose;
      // A moved/re-aimed seat can leave the stored look outside the new limits.
      reclampSeatLook(pose);
      this.applySeatCamera();
      return;
    }
    const saved = this.readCameraState();
    this.controls.enabled = false;
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onSeatPointerDown);
    dom.addEventListener('pointermove', this.onSeatPointerMove);
    dom.addEventListener('pointerup', this.onSeatPointerUp);
    dom.addEventListener('pointercancel', this.onSeatPointerUp);
    dom.style.cursor = 'grab';
    // Assign BEFORE subscribing: nanostores fires the listener immediately, and
    // applySeatCamera is a no-op until `seatView` is set.
    this.seatView = { pose, saved, unsubLook: () => {} };
    // Resolves the "face the seat's forward" reset to a real, clamped direction.
    reclampSeatLook(pose);
    this.seatView.unsubLook = $seatLook.subscribe(() => this.applySeatCamera());
  }

  /**
   * Leaves the seat preview and puts the orbit camera back exactly where it was.
   *
   * Removing the pointer listeners here is what keeps a leaked handler from fighting
   * `OrbitControls` for the rest of the session; {@link dispose} calls this too, so the
   * canvas can never outlive them. Safe to call when not previewing.
   */
  exitSeatView(): void {
    const view = this.seatView;
    if (!view) return;
    this.seatView = null;
    view.unsubLook();
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onSeatPointerDown);
    dom.removeEventListener('pointermove', this.onSeatPointerMove);
    dom.removeEventListener('pointerup', this.onSeatPointerUp);
    dom.removeEventListener('pointercancel', this.onSeatPointerUp);
    dom.style.cursor = '';
    if (this.seatDrag && dom.hasPointerCapture(this.seatDrag.pointerId)) {
      dom.releasePointerCapture(this.seatDrag.pointerId);
    }
    this.seatDrag = null;
    this.controls.enabled = true;
    this.restoreCamera(view.saved);
    this.invalidate();
  }

  /** True while the IVA seat preview owns the camera. */
  get isSeatView(): boolean {
    return this.seatView !== null;
  }

  /**
   * Points the camera down the stored look direction.
   *
   * No clamping happens here: `$seatLook` only ever holds a direction that has already
   * been through `clampSeatLook`, because the pointer handler feeds the clamp its own
   * output the way `IVAController.OnFrame` does. Re-composing a direction from a raw
   * yaw/pitch accumulator and clamping THAT once — which this used to do — hands the
   * clamp an input it never produced, so it under-corrects and the preview escapes both
   * of the game's limits (see `$seatLook`).
   */
  private applySeatCamera(): void {
    const view = this.seatView;
    if (!view) return;
    const { position, up } = view.pose;
    const look = seatLookDirection(view.pose);

    this.camera.position.set(position.x, position.y, position.z);
    const u = new THREE.Vector3(up.x, up.y, up.z);
    const l = new THREE.Vector3(look.x, look.y, look.z);
    // On the up pole `lookAt` has no defined roll — three.js only survives it by nudging
    // `up` by 1e-4 and producing an arbitrary one. The clamps stop the look 25.84° short
    // of the pole, so this is unreachable by dragging; keep the last good orientation
    // rather than spinning the view if a degenerate seat gets us here anyway.
    if (new THREE.Vector3().crossVectors(l, u).lengthSq() > 1e-12) {
      this.camera.up.copy(u);
      this.camera.lookAt(position.x + look.x, position.y + look.y, position.z + look.z);
    }
    this.invalidate();
  }

  private readonly onSeatPointerDown = (e: PointerEvent): void => {
    if (!this.seatView || this.seatDrag) return;
    this.seatDrag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.renderer.domElement.style.cursor = 'grabbing';
    e.preventDefault();
  };

  private readonly onSeatPointerMove = (e: PointerEvent): void => {
    const drag = this.seatDrag;
    const view = this.seatView;
    if (!drag || !view || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    // Both negated exactly as the game negates its cursor deltas (`IVAController.cs:71,76`
    // divide by -250): drag right -> look right, drag up -> look up.
    nudgeSeatLook(-dx * SEAT_LOOK_RAD_PER_PX, -dy * SEAT_LOOK_RAD_PER_PX, view.pose);
  };

  private readonly onSeatPointerUp = (e: PointerEvent): void => {
    if (!this.seatDrag || e.pointerId !== this.seatDrag.pointerId) return;
    const dom = this.renderer.domElement;
    if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    this.seatDrag = null;
    if (this.seatView) dom.style.cursor = 'grab';
  };

  restoreCamera(state: CameraState): void {
    this.camera.position.set(...state.position);
    this.camera.up.set(...state.up);
    this.controls.target.set(...state.target);
    this.controls.update();
  }

  private readonly onControlsEnd = (): void => {
    $cameraState.set(this.readCameraState());
  };

  private readonly onControlsChange = (): void => {
    this.invalidate();
  };

  private readonly onContextRestored = (): void => {
    this.invalidate();
  };

  private readCameraState(): CameraState {
    const p = this.camera.position;
    const t = this.controls.target;
    const u = this.camera.up;
    return {
      position: [p.x, p.y, p.z],
      target: [t.x, t.y, t.z],
      up: [u.x, u.y, u.z],
    };
  }

  private handleResize(): void {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.invalidate();
  }

  private renderFrame(): void {
    this.stats?.begin();
    // Damping is applied here, and a moved camera dispatches `change` → invalidate,
    // so an inertial orbit keeps requesting frames until it comes to rest. In seat view
    // the camera is ours: `update()` re-aims it at `controls.target` unconditionally
    // (it does not check `enabled`), which would undo every lookAt.
    if (!this.seatView) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    this.stats?.end();
  }

  dispose(): void {
    // Before anything else: drops the seat-view pointer listeners and the $seatLook
    // subscription (no-op when not previewing).
    this.exitSeatView();
    this.loop.dispose();
    this.fpsUnsub();
    this.setFpsCounter(false);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.controls.removeEventListener('end', this.onControlsEnd);
    this.controls.removeEventListener('change', this.onControlsChange);
    this.controls.dispose();
    this.grids.dispose();
    this.lightingUnsub();
    this.sceneEnv.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement);
    }
    if (this.labelRenderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.labelRenderer.domElement);
    }
  }
}
