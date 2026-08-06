import * as THREE from 'three';
import type { Viewport } from './Viewport';
import type { ToolMode } from '../state/editorStore';
import { AXIS_COLOR_CSS, type AxisKey } from './axisColors';
import { $snapEnabled, $snapRotateStep, $snapTranslateStep } from '../state/snapStore';
import { $heldModifiers } from '../state/modifierStore';
import { $poseDragActive, $poseDragLock } from '../state/animationStore';

/**
 * **The animation pose gizmo** (design-animation-mode.md §9.2; DECISIONS #8, LOCKED) — the
 * one thing in flexo that is NOT `TransformControls`.
 *
 * v1 posed joints with the shared `TransformControls`, which gives exactly one single-axis
 * handle at a time and rings of a fixed size wherever the joint happens to be. Posing a
 * hinge is a different job from placing a SubPart, so this gizmo is built for it:
 *
 * - **Rotate**: three orientation rings SIZED TO THE JOINT (radius = the member set's
 *   bounding-sphere radius, clamped in world metres AND in screen pixels) so the rings wrap
 *   the geometry they swing, plus an outer camera-plane ring for screen-space rotation.
 * - **Move**: a central free-drag DISC that translates in the camera plane — multi-axis in
 *   one gesture — plus three axis stems when a constrained move is wanted.
 * - **Scale**: three axis handles + a centre uniform handle.
 * - **Per-gesture axis locking**: tapping `X`/`Y`/`Z` mid-drag locks the gesture to that
 *   JOINT-LOCAL axis, tapping the same letter again to the WORLD axis, a third time frees
 *   it. A full-length coloured guide line shows the lock. It resets at drag end.
 * - **Working pivots** (§9.4): rotation is computed about `setPivotPoint`'s point when one
 *   is set (`ΔW = T(p)·R·T(p)⁻¹·W_joint`), while translation stays pivot-independent.
 *
 * **What it does NOT own**: the document. Exactly like `TransformGizmo`, it drives an
 * attached proxy object and streams `onChange` — `EditorScene.handlePoseGizmoChange` decides
 * whether that frame becomes a pose, a pivot move or a pivot re-orientation (§9.4 routing).
 * Undo is the caller's too: ONE push at `onDragStart` (streaming invariant), and Escape
 * mid-drag restores the drag-start frame rather than popping the stack.
 *
 * **Rendering**: handle geometry is unit-sized and the whole subtree is SCALED, so a camera
 * move is one `scale.setScalar` rather than a geometry rebuild. Nothing here runs a rAF loop
 * — the viewport is invalidated on the events that change pixels (guardrail 10).
 */

/** What one handle mesh stands for. */
interface PoseHandle {
  kind: 'rotate' | 'translate' | 'scale';
  /** `screen` = camera-plane rotate; `free` = camera-plane translate; `uniform` = all axes. */
  axis: AxisKey | 'screen' | 'free' | 'uniform';
}

export interface PoseGizmoCallbacks {
  /** Fires once at drag start — the caller's single `pushUndo` site (streaming invariant). */
  onDragStart(mode: ToolMode): void;
  /** Streaming: the attached target's frame just changed. */
  onChange(): void;
  onDraggingChanged(dragging: boolean): void;
}

/** Amber, the "you are moving the hinge, not the pose" colour (§9.4 pivot mode). */
const PIVOT_COLOR = '#ff9f0a';
/** The camera-plane ring / free-drag disc colour — deliberately axis-less. */
const SCREEN_COLOR = '#cbd5e1';

const RENDER_ORDER = 30;

/** Ring radius clamps: world metres, then screen pixels (design §9.2). */
const MIN_WORLD_RADIUS = 0.3;
const MAX_WORLD_RADIUS = 3;
const MIN_SCREEN_PX = 24;
const MAX_SCREEN_PX = 160;

/**
 * Half-length of the axis-lock guide line, in RING RADII (the subtree's own units). Screen-
 * relative by construction: at the 24–160 px ring clamps this spans roughly 290–1900 px, so
 * it reads as a full-length guide at every zoom.
 *
 * Deliberately not "infinite": a segment whose far endpoint sits hundreds of units BEHIND the
 * camera is dropped by the clipper (verified in-browser — a ±400 line drew nothing at all
 * while a ±4 one drew fine), so a guide the length of a screen is both the honest affordance
 * and the one that survives.
 */
const GUIDE_HALF_LENGTH = 12;

/**
 * Touch hit-target growth (design §14 row 5: "ring/handle hit targets scale ×1.6 on touch").
 *
 * Implemented as extra RAYS rather than bigger geometry: scaling the subtree would move the
 * rings outwards, so a tap on the drawn ring would start missing it. Instead a touch pick
 * casts the centre ray plus a ring of {@link TOUCH_RAYS} rays at {@link TOUCH_PAD_PX} around
 * it, which grows every handle's effective target — torus, stem, disc and cube alike — by the
 * same pad without touching what is drawn. The pad is ~0.6× a handle's ~10px on-screen
 * thickness, i.e. the ×1.6 the design asks for.
 */
const TOUCH_PAD_PX = 6;
const TOUCH_RAYS = 8;

const AXES: AxisKey[] = ['x', 'y', 'z'];
const UNIT: Record<AxisKey, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const AXIS_INDEX: Record<AxisKey, 'x' | 'y' | 'z'> = { x: 'x', y: 'y', z: 'z' };

export class PoseGizmo {
  private readonly viewport: Viewport;
  private readonly callbacks: PoseGizmoCallbacks;
  /** Everything the gizmo draws, in WORLD space (never under the pickable part root). */
  private readonly group = new THREE.Group();
  private readonly rotateGroup = new THREE.Group();
  private readonly translateGroup = new THREE.Group();
  private readonly scaleGroup = new THREE.Group();
  private readonly guide: THREE.Line;
  private readonly guideMaterial: THREE.LineBasicMaterial;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  /** Every pickable handle mesh, for the raycast. */
  private readonly handles: THREE.Mesh[] = [];

  private target: THREE.Object3D | null = null;
  private mode: ToolMode = 'rotate';
  private style: 'pose' | 'pivot' = 'pose';
  /** The working pivot, in world space, or null ⇒ rotate about the target's own origin. */
  private pivotPoint: THREE.Vector3 | null = null;
  /** The member set's bounding-sphere radius, before clamping. */
  private radiusSeed = 1;
  /** The clamped radius the subtree is currently scaled to. */
  private radius = 1;

  private hovered: THREE.Mesh | null = null;

  private drag: {
    handle: PoseHandle;
    pointerId: number;
    /** The target's world matrix at drag start — the Escape-cancel snapshot. */
    startMatrix: THREE.Matrix4;
    startPos: THREE.Vector3;
    startQuat: THREE.Quaternion;
    startScale: THREE.Vector3;
    /** The gizmo subtree's position at drag start (translate moves it with the drag). */
    startGizmoPos: THREE.Vector3;
    /** The rotation/scale anchor: the working pivot, else the target's origin. */
    pivot: THREE.Vector3;
    /** Where the drag ray first met the handle's working plane / axis. */
    grabPoint: THREE.Vector3;
    /** Scalar parameter along the axis at grab time (axis translate + axis scale). */
    grabScalar: number;
    /** Screen distance from the gizmo centre at grab time (uniform scale). */
    grabScreenDist: number;
    /** Live keydown listener for the X/Y/Z locks, removed at drag end. */
    onKeyDown: (e: KeyboardEvent) => void;
  } | null = null;

  /** The per-gesture axis lock (§9.2), mirrored from `$poseDragLock`. Reset at drag end. */
  private lock: { axis: AxisKey; space: 'local' | 'world' } | null = null;
  private readonly stopLockSub: () => void;

  private readonly ray = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  constructor(viewport: Viewport, callbacks: PoseGizmoCallbacks) {
    this.viewport = viewport;
    this.callbacks = callbacks;
    this.group.name = 'pose-gizmo';
    this.group.visible = false;
    // The SCENE, never the part root: the root is what `SelectionManager` raycasts, and a
    // gizmo handle must never resolve to a document entity.
    viewport.scene.add(this.group);
    this.group.add(this.rotateGroup, this.translateGroup, this.scaleGroup);

    this.buildRotate();
    this.buildTranslate();
    this.buildScale();

    const guideGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-GUIDE_HALF_LENGTH, 0, 0),
      new THREE.Vector3(GUIDE_HALF_LENGTH, 0, 0),
    ]);
    this.geometries.push(guideGeometry);
    this.guideMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    });
    this.materials.push(this.guideMaterial);
    this.guide = new THREE.Line(guideGeometry, this.guideMaterial);
    this.guide.renderOrder = RENDER_ORDER;
    this.guide.visible = false;
    this.group.add(this.guide);

    // `$poseDragLock` IS the lock (P11E.07): the X/Y/Z keys below and the phone's segmented
    // control both write it, and this subscription is the only thing that applies it — so the
    // two input routes can never drift apart. nanostores fires immediately with `null`.
    this.stopLockSub = $poseDragLock.subscribe((next) => this.syncLock(next));

    const dom = viewport.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    // A camera move changes how big the handles read, not what they mean — rescale in place.
    viewport.controls.addEventListener('change', this.onCameraChange);
  }

  // ── attachment + configuration ─────────────────────────────────────────────

  /** Attaches (or detaches with `null`) the proxy this gizmo drives. */
  attach(target: THREE.Object3D | null): void {
    if (this.drag) this.endDrag();
    this.target = target;
    this.refresh();
  }

  get attached(): THREE.Object3D | null {
    return this.target;
  }

  setMode(mode: ToolMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.refresh();
  }

  /** `'pivot'` paints every handle amber — "this drag moves the hinge" (§9.4). */
  setStyle(style: 'pose' | 'pivot'): void {
    if (this.style === style) return;
    this.style = style;
    this.applyColors();
  }

  /** The working pivot in world space, or null for the target's own origin (§9.4). */
  setPivotPoint(point: THREE.Vector3 | null): void {
    this.pivotPoint = point ? point.clone() : null;
    this.refresh();
  }

  /** The member set's bounding-sphere radius, in world metres (§9.2 ring sizing). */
  setRadius(radius: number): void {
    if (Number.isFinite(radius) && radius > 0) this.radiusSeed = radius;
    this.refresh();
  }

  get isDragging(): boolean {
    return this.drag !== null;
  }

  /** True when a handle is under this client point — the marquee's "don't steal it" guard. */
  hitTest(clientX: number, clientY: number): boolean {
    return this.pick(clientX, clientY) !== null;
  }

  /**
   * Escape ladder rung 4: restore the frame the drag started from and stream it back, so the
   * document returns to where it was WITHOUT popping the undo step the drag pushed (undoing
   * a no-op change is honest; silently editing the stack is not).
   */
  cancelDrag(): void {
    const drag = this.drag;
    const target = this.target;
    if (!drag || !target) return;
    target.position.copy(drag.startPos);
    target.quaternion.copy(drag.startQuat);
    target.scale.copy(drag.startScale);
    target.updateMatrixWorld(true);
    this.callbacks.onChange();
    this.endDrag();
  }

  /** Re-reads the target's frame and re-lays the handles out. Cheap; safe to spam. */
  refresh(): void {
    const target = this.target;
    this.group.visible = target !== null;
    if (!target) return;
    const origin = this.pivotPoint ?? new THREE.Vector3().setFromMatrixPosition(target.matrixWorld);
    if (!this.drag) this.group.position.copy(origin);
    this.rotateGroup.visible = this.mode === 'rotate';
    this.translateGroup.visible = this.mode === 'translate';
    // A pivot stays unit-scaled (kept invariant), so pivot mode has no scale handles at all.
    this.scaleGroup.visible = this.mode === 'scale' && this.style === 'pose';
    this.updateScale();
  }

  dispose(): void {
    if (this.drag) this.endDrag();
    this.stopLockSub();
    const dom = this.viewport.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointercancel', this.onPointerUp);
    this.viewport.controls.removeEventListener('change', this.onCameraChange);
    this.group.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  // ── geometry ───────────────────────────────────────────────────────────────

  /** A handle material: unlit, depth-test-free (a joint sits INSIDE the mesh it moves). */
  private makeMaterial(color: string, opacity: number): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.materials.push(material);
    return material;
  }

  private addHandle(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    color: string,
    handle: PoseHandle,
    opacity = 0.85,
  ): THREE.Mesh {
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, this.makeMaterial(color, opacity));
    mesh.renderOrder = RENDER_ORDER;
    mesh.userData.poseHandle = handle;
    mesh.userData.baseColor = color;
    parent.add(mesh);
    this.handles.push(mesh);
    return mesh;
  }

  /** Three axis rings (radius 1) + an outer camera-plane ring at 1.25. */
  private buildRotate(): void {
    for (const axis of AXES) {
      const torus = new THREE.TorusGeometry(1, 0.03, 8, 96);
      const mesh = this.addHandle(this.rotateGroup, torus, AXIS_COLOR_CSS[axis], {
        kind: 'rotate',
        axis,
      });
      // A torus is built in the XY plane; turn it so its NORMAL is the axis it rotates about.
      if (axis === 'x') mesh.rotation.y = Math.PI / 2;
      else if (axis === 'y') mesh.rotation.x = Math.PI / 2;
    }
    const screen = new THREE.TorusGeometry(1.25, 0.02, 8, 96);
    const mesh = this.addHandle(this.rotateGroup, screen, SCREEN_COLOR, {
      kind: 'rotate',
      axis: 'screen',
    });
    mesh.userData.faceCamera = true;
  }

  /** A camera-facing free-drag disc + three axis stems. */
  private buildTranslate(): void {
    const disc = new THREE.CircleGeometry(0.28, 32);
    const mesh = this.addHandle(
      this.translateGroup,
      disc,
      SCREEN_COLOR,
      { kind: 'translate', axis: 'free' },
      0.35,
    );
    mesh.userData.faceCamera = true;

    for (const axis of AXES) {
      const stem = new THREE.CylinderGeometry(0.025, 0.025, 1, 8);
      // A cylinder is built around +Y with its centre at the origin; shift it so the stem
      // runs from the gizmo centre outwards, then aim +Y at the axis.
      stem.translate(0, 0.5, 0);
      const stemMesh = this.addHandle(this.translateGroup, stem, AXIS_COLOR_CSS[axis], {
        kind: 'translate',
        axis,
      });
      aimY(stemMesh, axis);
      const cone = new THREE.ConeGeometry(0.07, 0.2, 12);
      cone.translate(0, 1.1, 0);
      const coneMesh = this.addHandle(this.translateGroup, cone, AXIS_COLOR_CSS[axis], {
        kind: 'translate',
        axis,
      });
      aimY(coneMesh, axis);
    }
  }

  /** Three axis cubes + a centre uniform cube. */
  private buildScale(): void {
    for (const axis of AXES) {
      const stem = new THREE.CylinderGeometry(0.015, 0.015, 1, 6);
      stem.translate(0, 0.5, 0);
      const stemMesh = this.addHandle(
        this.scaleGroup,
        stem,
        AXIS_COLOR_CSS[axis],
        { kind: 'scale', axis },
        0.6,
      );
      aimY(stemMesh, axis);
      const box = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      box.translate(0, 1, 0);
      const boxMesh = this.addHandle(this.scaleGroup, box, AXIS_COLOR_CSS[axis], {
        kind: 'scale',
        axis,
      });
      aimY(boxMesh, axis);
    }
    this.addHandle(this.scaleGroup, new THREE.BoxGeometry(0.16, 0.16, 0.16), SCREEN_COLOR, {
      kind: 'scale',
      axis: 'uniform',
    });
  }

  /** Amber in pivot mode, axis colours otherwise; the hovered handle brightens. */
  private applyColors(): void {
    for (const mesh of this.handles) {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const base = this.style === 'pivot' ? PIVOT_COLOR : (mesh.userData.baseColor as string);
      material.color.set(base);
      if (mesh === this.hovered) material.color.offsetHSL(0, 0, 0.25);
    }
    this.viewport.invalidate();
  }

  /**
   * Sizes the subtree: the member bounding-sphere radius clamped to
   * [{@link MIN_WORLD_RADIUS}, {@link MAX_WORLD_RADIUS}] metres and then to
   * [{@link MIN_SCREEN_PX}, {@link MAX_SCREEN_PX}] pixels at the current camera distance, so
   * the rings wrap a big panel AND stay grabbable on a 3 cm bracket.
   */
  private updateScale(): void {
    const camera = this.viewport.camera;
    let radius = Math.min(MAX_WORLD_RADIUS, Math.max(MIN_WORLD_RADIUS, this.radiusSeed));
    const distance = camera.position.distanceTo(this.group.position);
    const height = this.viewport.renderer.domElement.clientHeight || 1;
    // World metres per screen pixel at the gizmo's depth.
    const perPixel = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance) / height;
    if (perPixel > 0) {
      radius = Math.min(MAX_SCREEN_PX * perPixel, Math.max(MIN_SCREEN_PX * perPixel, radius));
    }
    this.radius = radius;
    this.group.scale.setScalar(radius);
    // The camera-plane ring and free-drag disc always face the viewer.
    const facing = new THREE.Quaternion();
    camera.getWorldQuaternion(facing);
    for (const mesh of this.handles) if (mesh.userData.faceCamera) mesh.quaternion.copy(facing);
  }

  private readonly onCameraChange = (): void => {
    if (this.group.visible) this.updateScale();
  };

  // ── picking ────────────────────────────────────────────────────────────────

  private pick(clientX: number, clientY: number, touch = false): THREE.Mesh | null {
    if (!this.group.visible || !this.target) return null;
    const dom = this.viewport.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    const visible = this.handles.filter((mesh) => isVisibleInTree(mesh, this.group));
    if (visible.length === 0) return null;

    const castAt = (x: number, y: number): THREE.Mesh | null => {
      this.pointer.set(
        ((x - rect.left) / rect.width) * 2 - 1,
        -((y - rect.top) / rect.height) * 2 + 1,
      );
      this.ray.setFromCamera(this.pointer, this.viewport.camera);
      return (this.ray.intersectObjects(visible, false)[0]?.object as THREE.Mesh) ?? null;
    };

    const direct = castAt(clientX, clientY);
    if (direct || !touch) return direct;
    // Fat-finger pass: a ring of rays one pad out, nearest-first by construction (the ring is
    // uniform, so whichever handle it meets is the one closest to the fingertip).
    for (let i = 0; i < TOUCH_RAYS; i++) {
      const angle = (i / TOUCH_RAYS) * Math.PI * 2;
      const hit = castAt(
        clientX + Math.cos(angle) * TOUCH_PAD_PX,
        clientY + Math.sin(angle) * TOUCH_PAD_PX,
      );
      if (hit) return hit;
    }
    return null;
  }

  // ── the drag ───────────────────────────────────────────────────────────────

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.drag || !this.target) return;
    const mesh = this.pick(e.clientX, e.clientY, e.pointerType === 'touch');
    if (!mesh) return;
    const handle = mesh.userData.poseHandle as PoseHandle;
    e.preventDefault();

    const target = this.target;
    target.updateMatrixWorld(true);
    const startMatrix = target.matrixWorld.clone();
    const startPos = new THREE.Vector3();
    const startQuat = new THREE.Quaternion();
    const startScale = new THREE.Vector3();
    startMatrix.decompose(startPos, startQuat, startScale);
    const pivot = this.pivotPoint ? this.pivotPoint.clone() : startPos.clone();

    const onKeyDown = (event: KeyboardEvent) => this.onLockKey(event);
    window.addEventListener('keydown', onKeyDown, true);

    this.drag = {
      handle,
      pointerId: e.pointerId,
      startMatrix,
      startPos,
      startQuat,
      startScale,
      startGizmoPos: this.group.position.clone(),
      pivot,
      grabPoint: new THREE.Vector3(),
      grabScalar: 0,
      grabScreenDist: 1,
      onKeyDown,
    };
    // Seed the grab reference from the same maths the move will use.
    this.readPointer(e);
    const seed = this.sample(handle, startQuat);
    if (seed) {
      this.drag.grabPoint.copy(seed.point);
      this.drag.grabScalar = seed.scalar;
    }
    this.drag.grabScreenDist = Math.max(4, this.screenDistanceFromCentre(e));

    this.viewport.renderer.domElement.setPointerCapture(e.pointerId);
    $poseDragActive.set(true);
    this.callbacks.onDraggingChanged(true);
    this.callbacks.onDragStart(this.mode);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.drag) {
      const mesh = this.pick(e.clientX, e.clientY);
      if (mesh !== this.hovered) {
        this.hovered = mesh;
        this.applyColors();
      }
      return;
    }
    if (e.pointerId !== this.drag.pointerId) return;
    e.preventDefault();
    this.readPointer(e);
    this.applyDrag(e);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.endDrag();
  };

  private endDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    window.removeEventListener('keydown', drag.onKeyDown, true);
    const dom = this.viewport.renderer.domElement;
    if (dom.hasPointerCapture(drag.pointerId)) dom.releasePointerCapture(drag.pointerId);
    this.drag = null;
    $poseDragLock.set(null); // → syncLock clears `this.lock` and hides the guide
    $poseDragActive.set(false);
    this.guide.visible = false;
    this.callbacks.onDraggingChanged(false);
    this.refresh();
  }

  private readPointer(e: PointerEvent): void {
    const rect = this.viewport.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.viewport.camera);
  }

  private screenDistanceFromCentre(e: PointerEvent): number {
    const dom = this.viewport.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    const centre = this.group.position.clone().project(this.viewport.camera);
    const cx = rect.left + ((centre.x + 1) / 2) * rect.width;
    const cy = rect.top + ((1 - centre.y) / 2) * rect.height;
    return Math.hypot(e.clientX - cx, e.clientY - cy);
  }

  /**
   * The axis a gesture actually runs on: the handle's own, unless a per-gesture lock
   * overrides it (§9.2 — first tap the joint-LOCAL axis, second the WORLD axis).
   */
  private effectiveAxis(handle: PoseHandle, startQuat: THREE.Quaternion): THREE.Vector3 | null {
    if (this.lock) {
      const unit = UNIT[this.lock.axis].clone();
      return this.lock.space === 'local' ? unit.applyQuaternion(startQuat).normalize() : unit;
    }
    if (handle.axis === 'screen' || handle.axis === 'free' || handle.axis === 'uniform') {
      const forward = new THREE.Vector3();
      this.viewport.camera.getWorldDirection(forward);
      return handle.kind === 'rotate' ? forward.negate() : null;
    }
    return UNIT[handle.axis].clone();
  }

  /**
   * Where the current ray meets this handle's working surface: the plane through the pivot
   * for a rotate / free translate, or the closest point on the axis line for a constrained
   * one. `scalar` is the signed distance along that axis.
   */
  private sample(
    handle: PoseHandle,
    startQuat: THREE.Quaternion,
  ): { point: THREE.Vector3; scalar: number } | null {
    const drag = this.drag;
    const pivot = drag ? drag.pivot : this.group.position;
    const axis = this.effectiveAxis(handle, startQuat);

    if (handle.kind === 'rotate') {
      const normal = axis ?? cameraForward(this.viewport.camera);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pivot);
      const point = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(plane, point)) return null;
      return { point, scalar: 0 };
    }

    if (!axis) {
      // Free drag / uniform: the camera plane through the gizmo centre.
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        cameraForward(this.viewport.camera).negate(),
        drag ? drag.startGizmoPos : this.group.position,
      );
      const point = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(plane, point)) return null;
      return { point, scalar: 0 };
    }

    // Constrained: the point on the axis line closest to the ray.
    const origin = drag ? drag.startGizmoPos : this.group.position;
    const scalar = closestPointOnLine(this.ray.ray, origin, axis);
    if (scalar === null) return null;
    return { point: origin.clone().addScaledVector(axis, scalar), scalar };
  }

  /** `⌃` held inverts the global snap setting for the duration of the drag (LOCKED #7). */
  private snapOn(): boolean {
    return $snapEnabled.get() !== $heldModifiers.get().ctrl;
  }

  private applyDrag(e: PointerEvent): void {
    const drag = this.drag;
    const target = this.target;
    if (!drag || !target) return;
    const { handle, startQuat, startPos, startScale, startMatrix } = drag;

    if (handle.kind === 'rotate') {
      const axis = this.effectiveAxis(handle, startQuat) ?? cameraForward(this.viewport.camera);
      const sampled = this.sample(handle, startQuat);
      if (!sampled) return;
      const from = drag.grabPoint.clone().sub(drag.pivot).projectOnPlane(axis);
      const to = sampled.point.clone().sub(drag.pivot).projectOnPlane(axis);
      if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return;
      let angle = Math.atan2(new THREE.Vector3().crossVectors(from, to).dot(axis), from.dot(to));
      if (this.snapOn()) {
        const step = THREE.MathUtils.degToRad(Math.max(1, $snapRotateStep.get()));
        angle = Math.round(angle / step) * step;
      }
      // ΔW = T(p) · R(axis, angle) · T(p)⁻¹ · W_start — the working-pivot form (§9.2). With
      // no working pivot `p` IS the joint origin, so this degenerates to an in-place spin.
      const delta = new THREE.Matrix4()
        .makeTranslation(drag.pivot.x, drag.pivot.y, drag.pivot.z)
        .multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
        .multiply(new THREE.Matrix4().makeTranslation(-drag.pivot.x, -drag.pivot.y, -drag.pivot.z));
      const next = delta.multiply(startMatrix);
      next.decompose(target.position, target.quaternion, target.scale);
      this.updateGuide(axis);
    } else if (handle.kind === 'translate') {
      const axis = this.effectiveAxis(handle, startQuat);
      const sampled = this.sample(handle, startQuat);
      if (!sampled) return;
      let delta: THREE.Vector3;
      if (axis) {
        let scalar = sampled.scalar - drag.grabScalar;
        if (this.snapOn()) scalar = snapScalar(scalar, $snapTranslateStep.get());
        delta = axis.clone().multiplyScalar(scalar);
        this.updateGuide(axis);
      } else {
        delta = sampled.point.clone().sub(drag.grabPoint);
        if (this.snapOn()) {
          const step = $snapTranslateStep.get();
          delta.set(
            snapScalar(delta.x, step),
            snapScalar(delta.y, step),
            snapScalar(delta.z, step),
          );
        }
      }
      target.position.copy(startPos).add(delta);
      target.quaternion.copy(startQuat);
      target.scale.copy(startScale);
      // The handles ride along with a translate so the drag stays under the pointer.
      this.group.position.copy(drag.startGizmoPos).add(delta);
    } else {
      // Scale is a LOCAL-axis operation (a joint pose's scale triple), so the lock's
      // world/local distinction does not apply — the locked letter simply picks the axis.
      const lockedAxis = this.lock?.axis ?? null;
      const next = startScale.clone();
      if (handle.axis === 'uniform' && !lockedAxis) {
        const factor = clampFactor(this.screenDistanceFromCentre(e) / drag.grabScreenDist);
        next.multiplyScalar(factor);
      } else {
        const key: AxisKey =
          lockedAxis ?? (handle.axis === 'uniform' ? 'x' : (handle.axis as AxisKey));
        const sampled = this.sample({ kind: 'translate', axis: key }, startQuat);
        if (!sampled) return;
        const factor = clampFactor(
          1 + (sampled.scalar - drag.grabScalar) / Math.max(this.radius, 1e-6),
        );
        next[AXIS_INDEX[key]] *= factor;
        this.updateGuide(UNIT[key].clone().applyQuaternion(startQuat).normalize());
      }
      target.position.copy(startPos);
      target.quaternion.copy(startQuat);
      target.scale.copy(next);
    }

    target.updateMatrixWorld(true);
    this.callbacks.onChange();
    this.viewport.invalidate();
  }

  /** The full-length coloured guide line along the locked axis (hidden when unlocked). */
  private updateGuide(axis: THREE.Vector3): void {
    if (!this.lock) {
      this.guide.visible = false;
      return;
    }
    this.guideMaterial.color.set(AXIS_COLOR_CSS[this.lock.axis]);
    // The line geometry runs along local +X, and the group carries the gizmo's scale.
    this.guide.quaternion.setFromUnitVectors(UNIT.x, axis.clone().normalize());
    this.guide.visible = true;
  }

  /**
   * The per-gesture axis lock (§9.2): `x`/`y`/`z` cycle joint-LOCAL → WORLD → free. Handled
   * by a drag-local window listener rather than the hotkey registry on purpose (design
   * §12.1) — it exists only while the pointer is captured, so it can never shadow a mode key.
   */
  private onLockKey(e: KeyboardEvent): void {
    if (!this.drag) return;
    const key = e.key.toLowerCase();
    if (key !== 'x' && key !== 'y' && key !== 'z') return;
    e.preventDefault();
    e.stopPropagation();
    const axis = key as AxisKey;
    const next =
      !this.lock || this.lock.axis !== axis
        ? ({ axis, space: 'local' } as const)
        : this.lock.space === 'local'
          ? ({ axis, space: 'world' } as const)
          : null;
    // The atom is the lock: writing it runs `syncLock`, which re-seeds the gesture.
    $poseDragLock.set(next);
  }

  /**
   * Applies a lock published on `$poseDragLock` (from the keys or from the phone control) and
   * re-seeds the gesture against the NEW axis, so the lock takes effect from here rather than
   * snapping the pose by whatever the old axis had accumulated.
   */
  private syncLock(next: { axis: AxisKey; space: 'local' | 'world' } | null): void {
    if (next?.axis === this.lock?.axis && next?.space === this.lock?.space) return;
    this.lock = next;
    if (!this.lock) this.guide.visible = false;
    const drag = this.drag;
    if (!drag) return;
    const seed = this.sample(drag.handle, drag.startQuat);
    if (seed) {
      drag.grabPoint.copy(seed.point);
      drag.grabScalar = seed.scalar;
    }
    drag.startMatrix.decompose(drag.startPos, drag.startQuat, drag.startScale);
    this.viewport.invalidate();
  }
}

/** Aims a +Y-built geometry along a world axis. */
function aimY(mesh: THREE.Mesh, axis: AxisKey): void {
  if (axis === 'x') mesh.rotation.z = -Math.PI / 2;
  else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
}

function cameraForward(camera: THREE.Camera): THREE.Vector3 {
  const v = new THREE.Vector3();
  camera.getWorldDirection(v);
  return v;
}

/** Is every ancestor up to (and including) `root` visible? */
function isVisibleInTree(mesh: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === root) return true;
  }
  return false;
}

/** Signed distance along `dir` (from `origin`) of the point closest to `ray`. */
function closestPointOnLine(
  ray: THREE.Ray,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
): number | null {
  const w0 = new THREE.Vector3().subVectors(origin, ray.origin);
  const a = dir.dot(dir);
  const b = dir.dot(ray.direction);
  const c = ray.direction.dot(ray.direction);
  const d = dir.dot(w0);
  const e = ray.direction.dot(w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-9) return null; // the axis points at the camera
  return (b * e - c * d) / denom;
}

function snapScalar(value: number, step: number): number {
  if (!(step > 0)) return value;
  return Math.round(value / step) * step;
}

/** Scale factors stay positive and sane — a mirrored or zero pose scale is never useful. */
function clampFactor(factor: number): number {
  return Math.min(100, Math.max(0.01, factor));
}
