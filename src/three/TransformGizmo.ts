import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { ToolMode, SnapSettings } from '../state/editorStore'

interface TransformGizmoCallbacks {
  onDragStart: () => void
  onChange: (object: THREE.Object3D) => void
  onDraggingChanged: (dragging: boolean) => void
}

/**
 * Wraps three's TransformControls for translate/rotate/scale of the attached
 * object. Disables orbit during a drag, pushes a single undo snapshot at drag
 * start, and streams per-frame transform changes back out via callbacks.
 */
export class TransformGizmo {
  private readonly controls: TransformControls
  private readonly orbit: OrbitControls
  private readonly callbacks: TransformGizmoCallbacks

  // Handlers are instance fields so dispose() can unregister them from the
  // controls' event dispatcher.
  private readonly onDraggingChanged = (event: { value: unknown }) => {
    const dragging = event.value as boolean
    this.orbit.enabled = !dragging
    this.callbacks.onDraggingChanged(dragging)
    if (dragging) this.callbacks.onDragStart()
  }

  private readonly onObjectChange = () => {
    const obj = this.controls.object
    if (obj) this.callbacks.onChange(obj)
  }

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    scene: THREE.Scene,
    orbit: OrbitControls,
    callbacks: TransformGizmoCallbacks,
  ) {
    this.orbit = orbit
    this.callbacks = callbacks
    this.controls = new TransformControls(camera, domElement)
    scene.add(this.controls.getHelper())

    this.controls.addEventListener('dragging-changed', this.onDraggingChanged)
    this.controls.addEventListener('objectChange', this.onObjectChange)
  }

  attach(object: THREE.Object3D | null): void {
    if (object) this.controls.attach(object)
    else this.controls.detach()
  }

  setMode(mode: ToolMode): void {
    this.controls.setMode(mode)
  }

  setSnap(snap: SnapSettings): void {
    this.controls.setTranslationSnap(snap.translate ?? null)
    this.controls.setRotationSnap(
      snap.rotateDeg != null ? THREE.MathUtils.degToRad(snap.rotateDeg) : null,
    )
    this.controls.setScaleSnap(null)
  }

  get isDragging(): boolean {
    return this.controls.dragging
  }

  dispose(): void {
    this.controls.removeEventListener('dragging-changed', this.onDraggingChanged)
    this.controls.removeEventListener('objectChange', this.onObjectChange)
    this.controls.detach()
    const helper = this.controls.getHelper()
    helper.removeFromParent()
    this.controls.dispose()
  }
}
