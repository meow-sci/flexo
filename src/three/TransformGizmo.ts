import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { Viewport } from './Viewport';
import type { ToolMode, SnapSettings } from '../state/editorStore';

/**
 * Wraps three's TransformControls for translate/rotate/scale of the attached
 * object. Disables orbit during a drag, pushes a single undo snapshot at drag
 * start, and streams per-frame transform changes back out via callbacks.
 */
export class TransformGizmo {
  private readonly controls: TransformControls;

  constructor(
    viewport: Viewport,
    callbacks: {
      onDragStart: () => void;
      onChange: (object: THREE.Object3D) => void;
      onDraggingChanged: (dragging: boolean) => void;
    },
  ) {
    this.controls = new TransformControls(viewport.camera, viewport.renderer.domElement);
    viewport.scene.add(this.controls.getHelper());

    // TransformControls raises `change` for every visible state it owns — the
    // hovered axis, the mode, attach/detach, and each drag step — so this one
    // hookup keeps the gizmo's own repaints on the on-demand loop.
    this.controls.addEventListener('change', () => viewport.invalidate());

    this.controls.addEventListener('dragging-changed', (event) => {
      const dragging = event.value as boolean;
      viewport.controls.enabled = !dragging;
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

  setMode(mode: ToolMode): void {
    this.controls.setMode(mode);
  }

  setSnap(snap: SnapSettings): void {
    this.controls.setTranslationSnap(snap.translate ?? null);
    this.controls.setRotationSnap(
      snap.rotateDeg != null ? THREE.MathUtils.degToRad(snap.rotateDeg) : null,
    );
    this.controls.setScaleSnap(null);
  }

  get isDragging(): boolean {
    return this.controls.dragging;
  }

  /**
   * Restores the transform the drag started from, mid-drag — TransformControls' own
   * built-in, which is exactly what the Escape ladder's rung 4 ("gizmo drag cancel") means.
   * It fires `objectChange`, so the restored transform streams back into the document the
   * same way every other drag step does. No-op when nothing is being dragged.
   */
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
