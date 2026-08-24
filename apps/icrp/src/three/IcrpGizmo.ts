/**
 * TransformControls wrapper — a decoupled copy of flexo's `TransformGizmo`
 * (which types its constructor against flexo's Viewport class and store unions).
 * Listed under "Copied" in SHARED_IMPORTS.md; behavioral parity is deliberate:
 * orbit disabled during drag, single undo push at drag start (via onDragStart),
 * per-frame streaming via onChange, Escape cancel via {@link cancelDrag}.
 */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface GizmoSnap {
  /** Translate snap in metres, or null. */
  translate: number | null;
  /** Rotate snap in degrees, or null. */
  rotateDeg: number | null;
}

export class IcrpGizmo {
  private readonly controls: TransformControls;

  constructor(
    deps: {
      camera: THREE.Camera;
      domElement: HTMLElement;
      scene: THREE.Scene;
      orbit: OrbitControls;
      invalidate: () => void;
    },
    callbacks: {
      onDragStart: () => void;
      onChange: (object: THREE.Object3D) => void;
      onDraggingChanged: (dragging: boolean) => void;
    },
  ) {
    this.controls = new TransformControls(deps.camera, deps.domElement);
    deps.scene.add(this.controls.getHelper());

    this.controls.addEventListener('change', () => deps.invalidate());

    this.controls.addEventListener('dragging-changed', (event) => {
      const dragging = event.value as boolean;
      deps.orbit.enabled = !dragging;
      callbacks.onDraggingChanged(dragging);
      if (dragging) callbacks.onDragStart();
    });

    this.controls.addEventListener('objectChange', () => {
      const obj = this.controls.object;
      if (obj) callbacks.onChange(obj);
    });
  }

  attach(object: THREE.Object3D | null): void {
    if (object) this.controls.attach(object);
    else this.controls.detach();
  }

  setMode(mode: GizmoMode): void {
    this.controls.setMode(mode);
  }

  setSpace(space: 'world' | 'local'): void {
    this.controls.setSpace(space);
  }

  setSnap(snap: GizmoSnap): void {
    this.controls.setTranslationSnap(snap.translate);
    this.controls.setRotationSnap(
      snap.rotateDeg != null ? THREE.MathUtils.degToRad(snap.rotateDeg) : null,
    );
    this.controls.setScaleSnap(null);
  }

  /**
   * Ground lock (plan P4.01): shows only the handles that keep the piece on the
   * ground plane — translate in KSA Y/Z (three X/Z) and rotate about up.
   */
  setGroundLock(locked: boolean, mode: GizmoMode): void {
    if (mode === 'translate') {
      this.controls.showX = true;
      this.controls.showZ = true;
      this.controls.showY = !locked;
    } else if (mode === 'rotate') {
      this.controls.showY = true;
      this.controls.showX = !locked;
      this.controls.showZ = !locked;
    } else {
      this.controls.showX = true;
      this.controls.showY = true;
      this.controls.showZ = true;
    }
  }

  get isDragging(): boolean {
    return this.controls.dragging;
  }

  cancelDrag(): void {
    this.controls.reset();
  }

  dispose(): void {
    this.controls.detach();
    const helper = this.controls.getHelper();
    helper.removeFromParent();
    this.controls.dispose();
  }
}
