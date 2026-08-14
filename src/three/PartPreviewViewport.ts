import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ReadableAtom } from 'nanostores';
import type { CatalogSubPart } from '../ksa/catalog';
import type { CatalogPart } from '../ksa/partCatalog';
import { SubPartObject } from './SubPartObject';
import { ConnectorObject } from './ConnectorObject';
import { RenderLoop } from './RenderLoop';
import { SceneEnvironment } from './SceneEnvironment';
import { $connectorSettings } from '../state/settingsStore';
import { $lighting, type LightingSettings } from '../state/lightingStore';
import { initTextureSupport } from './textureSupport';
import { AxisGizmo } from './AxisGizmo';
import { computeSelectionBounds, type ComputedBounds } from '../measure/bounds';

/**
 * Extents-box color — the same cyan `MeasurementLayer` uses for the editor's
 * selection-bounds box, so the two read as one feature.
 */
const MEASURE_COLOR = 0x6ee7ff;

/**
 * The DEFAULT viewing direction {@link PartPreviewViewport.frame} places the
 * camera on — a three-quarter view from slightly above. Named because {@link
 * PartPreviewViewport.setViewAzimuth} rotates exactly this vector, so the
 * turntable's first angle reproduces the default framing bit for bit.
 * Overridable per viewport with {@link PartPreviewViewportOptions.viewDir}.
 */
const FRAME_DIR = new THREE.Vector3(1, 0.6, 1).normalize();

/** Turntable axis for {@link PartPreviewViewport.setViewAzimuth}. */
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface PartPreviewViewportOptions {
  /** Store driving environment/tonemapping/background. Default: the global `$lighting`. */
  lighting?: ReadableAtom<LightingSettings>;
  /** Render connector markers (default true, matching the Part browser popup). */
  showConnectors?: boolean;
  /** Connector cube size in meters. Default: the global `$connectorSettings` size. */
  connectorSize?: number;
  /**
   * When set, `frame()` makes the part's bounding sphere span this fraction of the
   * LIMITING viewport dimension (aspect-aware). Default: today's vertical-fov-only
   * `r / sin(fov/2) × 1.3` framing.
   */
  fillFraction?: number;
  /**
   * Re-run `frame()` on resize until the user first interacts (orbit/zoom/pan).
   * Default false. Needed because iframes commonly lay out at 0×0 first and get
   * sized late.
   */
  reframeOnResize?: boolean;
  /**
   * Called with the part's precise world-space bounds after each successful
   * `setPart` (null when cleared or empty). Lets an embedder show a readout
   * without reaching into the scene. Default: not called.
   */
  onBounds?: (bounds: ComputedBounds | null) => void;
  /**
   * Draw a world-orientation triad in the top-left corner ({@link AxisGizmo}).
   * Default false — the in-app Part browser popup shows none.
   */
  axisGizmo?: boolean;
  /**
   * World-space direction the camera sits on relative to the framed part, as raw
   * (unnormalized) `[x, y, z]`; only the direction matters, the distance always
   * comes from `frame()`. Default {@link FRAME_DIR}, the three-quarter view from
   * slightly above. A zero-length vector falls back to that default.
   *
   * The thumbnail capture's `--view-dir` is exactly this option — see
   * apps/partpreview/src/thumbsSpec.ts.
   */
  viewDir?: readonly [number, number, number];
  /**
   * World-space XYZ Euler rotation, in DEGREES, applied to the whole assembled
   * part (and its connector markers) before `frame()` measures it. Default
   * `[0, 0, 0]` — identity, i.e. the part exactly as the game models it.
   *
   * This is the only way to change which way a part FACES: {@link viewDir} moves
   * the camera, and the turntable orbits about world Y, so a part modeled lying
   * on its side reads that way from every camera angle.
   */
  partRotationDeg?: readonly [number, number, number];
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
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly host: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly sceneEnv: SceneEnvironment;
  private readonly lightingUnsub: () => void;
  private readonly loop = new RenderLoop(() => this.renderFrame());

  private readonly connectorSize: number | undefined;
  private readonly fillFraction: number | undefined;
  private readonly reframeOnResize: boolean;
  private readonly onBounds: ((bounds: ComputedBounds | null) => void) | undefined;
  /** Corner orientation triad, drawn in its own pass after the scene. Null when off. */
  private readonly axisGizmo: AxisGizmo | null;

  private objects: SubPartObject[] = [];
  private connectorObjects: ConnectorObject[] = [];
  /** Bumped on each setPart so a superseded async load discards its result. */
  private loadToken = 0;
  private showConnectors: boolean;
  /** Distance chosen by the last {@link frame}; anchors {@link zoomBy}'s clamp. */
  private framedDistance = 0;
  /** True once the user has orbited/zoomed/panned — suppresses `reframeOnResize`. */
  private hasInteracted = false;
  /** Scratch vector for {@link zoomBy} (avoids a per-call allocation). */
  private readonly zoomScratch = new THREE.Vector3();
  /** Scratch vector for {@link setViewAzimuth}. */
  private readonly azimuthScratch = new THREE.Vector3();
  /** Normalized direction the camera is framed on; {@link FRAME_DIR} unless overridden. */
  private readonly frameDir: THREE.Vector3;
  /**
   * Parent of every part object and connector marker, carrying {@link
   * PartPreviewViewportOptions.partRotationDeg}. Always present (identity by
   * default) so there is exactly one place parts get attached.
   */
  private readonly partRoot = new THREE.Group();
  /** The most recent {@link SceneEnvironment.apply}; awaited by {@link envApplied}. */
  private envPromise: Promise<void> = Promise.resolve();

  /** Precise world bounds of the loaded part, recomputed on each {@link setPart}. */
  private partBounds: ComputedBounds | null = null;
  private showMeasurements = false;
  /** Wireframe extents box; rebuilt whenever {@link partBounds} changes. */
  private measureBox: THREE.LineSegments | null = null;

  constructor(host: HTMLElement, options: PartPreviewViewportOptions = {}) {
    this.host = host;
    this.showConnectors = options.showConnectors ?? true;
    this.connectorSize = options.connectorSize;
    this.fillFraction = options.fillFraction;
    this.reframeOnResize = options.reframeOnResize ?? false;
    this.onBounds = options.onBounds;
    this.axisGizmo = options.axisGizmo ? new AxisGizmo() : null;
    // A degenerate vector would put the camera exactly on the orbit target, so it
    // is not honored — the default view is always a valid one.
    const viewDir = options.viewDir ? new THREE.Vector3(...options.viewDir) : null;
    this.frameDir = viewDir && viewDir.lengthSq() > 0 ? viewDir.normalize() : FRAME_DIR.clone();
    const rot = options.partRotationDeg;
    if (rot) {
      this.partRoot.rotation.set(
        THREE.MathUtils.degToRad(rot[0]),
        THREE.MathUtils.degToRad(rot[1]),
        THREE.MathUtils.degToRad(rot[2]),
      );
      // frame() measures world matrices BEFORE anything renders, and a child's
      // updateWorldMatrix composes against its parent's CURRENT matrixWorld — so
      // this static rotation has to land now, not at the first frame.
      this.partRoot.updateMatrixWorld(true);
    }
    this.scene.add(this.partRoot);
    this.scene.background = new THREE.Color(0x16171d);

    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000);
    this.camera.position.set(3, 2, 4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    initTextureSupport(this.renderer);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.controls.addEventListener('change', this.onNeedsRender);
    this.controls.addEventListener('start', this.onInteractionStart);

    // Environment/tonemapping/background driven by the $lighting store (global by default).
    this.sceneEnv = new SceneEnvironment(this.renderer, this.scene);
    this.lightingUnsub = (options.lighting ?? $lighting).subscribe((s) => {
      this.loop.invalidate();
      // Kept (rather than voided) so an offscreen capture can await the IBL being
      // ready before it renders — see envApplied().
      this.envPromise = this.sceneEnv.apply(s).then(() => this.loop.invalidate());
    });

    const hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 0.4);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(5, 10, 7);
    this.scene.add(dir);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(host);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onNeedsRender);

    this.loop.invalidate();
  }

  private readonly onNeedsRender = (): void => {
    this.loop.invalidate();
  };

  private readonly onInteractionStart = (): void => {
    this.hasInteracted = true;
  };

  /**
   * Loads and shows the given Part (or clears the preview when null). `index`
   * resolves each placement's SubPart template id to its catalog entry; any
   * placement whose template is missing from the catalog is skipped.
   */
  async setPart(part: CatalogPart | null, index: Map<string, CatalogSubPart>): Promise<void> {
    const token = ++this.loadToken;
    this.clearObjects();
    if (!part) return;

    // Connectors build synchronously (cube + arrow), so add them up front. They
    // are always built (so toggling visibility is instant) but may start hidden.
    const size = this.connectorSize ?? $connectorSettings.get().size;
    for (const connector of part.connectors) {
      const obj = new ConnectorObject(connector, size);
      obj.group.visible = this.showConnectors;
      this.connectorObjects.push(obj);
      this.partRoot.add(obj.group);
    }

    try {
      const built = await Promise.all(
        part.placements.map(async (placement) => {
          const entry = index.get(placement.subPartTemplateId);
          if (!entry) return null;
          return SubPartObject.create(entry, placement);
        }),
      );
      if (token !== this.loadToken) {
        for (const obj of built) obj?.dispose();
        return; // a newer selection superseded this load
      }
      for (const obj of built) {
        if (!obj) continue;
        this.objects.push(obj);
        this.partRoot.add(obj.group);
      }
      this.frame();
      // After the objects are in the scene (and framed, which needs their world
      // matrices anyway) — the extents box is never part of the framing input.
      this.updateBounds();
      this.loop.invalidate();
    } catch (err) {
      console.warn(`PartPreviewViewport: failed to load Part '${part.id}'`, err);
    }
  }

  private clearObjects(): void {
    for (const obj of this.objects) {
      this.partRoot.remove(obj.group);
      obj.dispose();
    }
    this.objects = [];
    for (const obj of this.connectorObjects) {
      this.partRoot.remove(obj.group);
      obj.dispose();
    }
    this.connectorObjects = [];
    this.clearBounds();
    this.loop.invalidate();
  }

  // --- Measurements (whole-part extents) --------------------------------------

  /**
   * Recomputes the part's extents from the loaded SubParts and rebuilds the box.
   *
   * Always the ACCURATE (per-vertex) world-space AABB: this app has no selection
   * and no precision setting, so "measure" means the true extents of the whole
   * part. Connector markers are editor affordances, not physical geometry, so
   * they are excluded here whatever `showConnectors` says.
   */
  private updateBounds(): void {
    this.partBounds = computeSelectionBounds(
      this.objects.map((o) => o.group),
      'world',
      true,
    );
    this.rebuildMeasureBox();
    this.onBounds?.(this.partBounds);
  }

  private clearBounds(): void {
    this.partBounds = null;
    this.disposeMeasureBox();
    this.onBounds?.(null);
  }

  /** Rebuilds the wireframe extents box from {@link partBounds}. */
  private rebuildMeasureBox(): void {
    this.disposeMeasureBox();
    const b = this.partBounds;
    if (!b) return;
    // 'world' bounds are axis-aligned (identity quaternion), so min/max are the
    // world corners and a Box3Helper needs no extra orientation.
    const box = new THREE.Box3(
      new THREE.Vector3(b.min.x, b.min.y, b.min.z),
      new THREE.Vector3(b.max.x, b.max.y, b.max.z),
    );
    const helper = new THREE.Box3Helper(box, new THREE.Color(MEASURE_COLOR));
    const material = helper.material as THREE.LineBasicMaterial;
    // Overlay, not geometry: always on top and never tone-mapped, so the color
    // stays exactly MEASURE_COLOR under any exposure/sky.
    material.depthTest = false;
    material.toneMapped = false;
    helper.renderOrder = 999;
    helper.visible = this.showMeasurements;
    // Deliberately NOT pushed into `objects`/`connectorObjects`: those two arrays
    // are what `frame()` measures, and the box must never influence framing.
    this.scene.add(helper);
    this.measureBox = helper;
    this.loop.invalidate();
  }

  private disposeMeasureBox(): void {
    if (!this.measureBox) return;
    this.scene.remove(this.measureBox);
    this.measureBox.geometry.dispose();
    (this.measureBox.material as THREE.Material).dispose();
    this.measureBox = null;
    this.loop.invalidate();
  }

  /** Show/hide a wireframe box around the whole part's extents. */
  setShowMeasurements(show: boolean): void {
    this.showMeasurements = show;
    if (this.measureBox) this.measureBox.visible = show;
    this.loop.invalidate();
  }

  /** Frames the camera to the combined bounding box of the assembled Part. */
  private frame(): void {
    const box = new THREE.Box3();
    for (const obj of this.objects) box.expandByObject(obj.group);
    // Hidden connectors must not pad the framing with invisible geometry.
    if (this.showConnectors) {
      for (const obj of this.connectorObjects) box.expandByObject(obj.group);
    }
    if (box.isEmpty()) return;

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.001);
    const vHalf = (this.camera.fov * Math.PI) / 180 / 2;
    let distance: number;
    if (this.fillFraction != null) {
      // Aspect-aware: the sphere's projected diameter spans `fillFraction` of the
      // LIMITING viewport dimension. Screen-space extent is proportional to
      // tan(angle), so solve tan(θ) = fillFraction × tan(half) and then d = r/sin(θ)
      // (a sphere of radius r at distance d has silhouette half-angle asin(r/d)).
      const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
      const theta = Math.atan(this.fillFraction * Math.tan(Math.min(vHalf, hHalf)));
      distance = radius / Math.sin(theta);
    } else {
      distance = (radius / Math.sin(vHalf)) * 1.3;
    }

    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(this.frameDir, distance);
    this.camera.near = Math.max(distance / 100, 0.001);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.framedDistance = distance;
  }

  /**
   * Multiply the camera's distance to the orbit target by `factor` (clamped to a
   * sane range around the framed distance).
   */
  zoomBy(factor: number): void {
    const offset = this.zoomScratch.copy(this.camera.position).sub(this.controls.target);
    const dist = offset.length();
    if (dist === 0 || !Number.isFinite(factor)) return;
    // Counts as user interaction (it IS one — the +/- buttons), so a late iframe
    // resize doesn't re-frame away the zoom they just chose.
    this.hasInteracted = true;
    // Stay well inside the near/far window frame() picked (distance/100 .. distance*100).
    const anchor = this.framedDistance || dist;
    const next = THREE.MathUtils.clamp(dist * factor, anchor / 20, anchor * 10);
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(offset.divideScalar(dist), next);
    this.controls.update();
    this.loop.invalidate();
  }

  // --- Offscreen capture (the thumbnail turntable) ----------------------------
  //
  // Four small hooks used by apps/partpreview/src/capture.ts to render a part from
  // N angles into PNGs (plans/PART_PREVIEW_THUMBS.md). All additive: nothing here
  // runs, or changes, in the interactive app.

  /**
   * Places the camera on the framed sphere at the configured view direction
   * ({@link PartPreviewViewportOptions.viewDir}, default {@link FRAME_DIR}) rotated
   * about world Y by `offsetRad`, keeping the elevation and the distance {@link
   * frame} chose.
   *
   * Offset 0 therefore reproduces `frame()`'s pose exactly, so a turntable's first
   * angle IS the view the embed shows on load. Rotating the camera (rather than the
   * part) means object transforms are never touched — at the cost of the world-fixed
   * key light sweeping across the part over a sequence.
   */
  setViewAzimuth(offsetRad: number): void {
    const dir = this.azimuthScratch.copy(this.frameDir).applyAxisAngle(WORLD_UP, offsetRad);
    this.camera.position.copy(this.controls.target).addScaledVector(dir, this.framedDistance);
    this.controls.update();
    this.loop.invalidate();
  }

  /**
   * Renders one frame and reads the canvas back as a PNG data URL.
   *
   * Synchronous by necessity: without `preserveDrawingBuffer` the drawing buffer is
   * only guaranteed to hold its contents until the task yields, so the render and
   * the `toDataURL` must happen in the same task. Deliberately does NOT go through
   * {@link RenderLoop} for the same reason.
   */
  renderToDataURL(): string {
    this.renderFrame();
    return this.renderer.domElement.toDataURL('image/png');
  }

  /**
   * Resolves once the latest lighting change's environment (PMREM room bake or HDR
   * fetch) has been applied. Rendering before it settles would capture the part
   * lit by the fallback lights alone.
   */
  envApplied(): Promise<void> {
    return this.envPromise;
  }

  /** True when the last {@link setPart} produced at least one SubPart object. */
  hasContent(): boolean {
    return this.objects.length > 0;
  }

  /** Show/hide the connector markers without re-loading or re-framing the part. */
  setShowConnectors(show: boolean): void {
    this.showConnectors = show;
    for (const obj of this.connectorObjects) obj.group.visible = show;
    this.loop.invalidate();
  }

  private handleResize(): void {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    // An iframe commonly lays out 0×0 first and is sized late, so the initial
    // framing was computed against a bogus aspect — redo it until the user acts.
    if (this.reframeOnResize && !this.hasInteracted && this.objects.length > 0) this.frame();
    this.loop.invalidate();
  }

  private renderFrame(): void {
    // Damping here dispatches `change` → invalidate, so an inertial orbit keeps
    // asking for frames until it settles.
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    // Second pass, over the finished frame — see AxisGizmo.render.
    this.axisGizmo?.render(this.renderer, this.camera);
  }

  dispose(): void {
    this.loop.dispose();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onNeedsRender);
    this.controls.removeEventListener('change', this.onNeedsRender);
    this.controls.removeEventListener('start', this.onInteractionStart);
    this.clearObjects();
    this.axisGizmo?.dispose();
    this.controls.dispose();
    this.lightingUnsub();
    this.sceneEnv.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement);
    }
  }
}
