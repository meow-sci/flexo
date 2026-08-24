/**
 * The store-driven scene (plans/ICRP_PLAN.md P2.01): owns the viewport, the
 * basis root, the ground plane, selection and the transform gizmo, and
 * reconciles the active object's placements into PieceObjects.
 *
 * Idioms harvested from flexo's EditorScene:
 *  - `sub()` — every store subscription invalidates AFTER its callback, so a
 *    missed manual invalidate can't leave a stale frame;
 *  - one-kind `reconcile` — wanted-set diff with a template-identity guard and
 *    an async-landing re-check (the placement may be gone, or its piece swapped,
 *    by the time the GLB lands);
 *  - gizmo drags stream through the store: undo pushed ONCE at drag start
 *    (`beginGesture`), each frame writes the document, the document subscription
 *    writes the object back — one source of truth.
 */
import * as THREE from 'three';
import { IcrpViewport } from './IcrpViewport';
import { GroundPlane } from './GroundPlane';
import { PieceObject } from './PieceObject';
import { IcrpGizmo, type GizmoMode } from './IcrpGizmo';
import { applyStaticBasis } from './basis';
import { SelectionManager } from '../../../../src/three/SelectionManager';
import { readPlacementTransform } from '../../../../src/three/coords';
import { ksaToThree } from './basis';
import {
  $activeObject,
  $selection,
  beginGesture,
  endGesture,
  getPlacement,
  setPlacementTransform,
} from '../state/docStore';
import { $pieceIndex } from '../state/catalogStore';
import { $tool, $groundLock, $snap } from '../state/toolStore';

export class StaticScene {
  readonly viewport: IcrpViewport;

  /** The basis root: children are placed with raw KSA transforms (I1). */
  private readonly root = new THREE.Group();
  private readonly ground: GroundPlane;
  private readonly gizmo: IcrpGizmo;
  private readonly selectionMgr: SelectionManager;
  private readonly objects = new Map<string, PieceObject>();
  private readonly unsubs: Array<() => void> = [];
  private disposed = false;

  constructor(host: HTMLElement) {
    this.viewport = new IcrpViewport(host);

    this.root.name = 'icrp-root';
    applyStaticBasis(this.root);
    this.viewport.scene.add(this.root);

    this.ground = new GroundPlane();
    this.viewport.scene.add(this.ground.group);

    this.selectionMgr = new SelectionManager(
      this.viewport.camera,
      this.viewport.renderer.domElement,
      this.root,
      (selected, additive) => {
        if (!selected) {
          if (!additive) $selection.set([]);
          return;
        }
        const current = $selection.get();
        if (additive) {
          $selection.set(
            current.includes(selected.id)
              ? current.filter((id) => id !== selected.id)
              : [...current, selected.id],
          );
        } else {
          $selection.set([selected.id]);
        }
      },
    );

    this.gizmo = new IcrpGizmo(
      {
        camera: this.viewport.camera,
        domElement: this.viewport.renderer.domElement,
        scene: this.viewport.scene,
        orbit: this.viewport.controls,
        invalidate: () => this.viewport.invalidate(),
      },
      {
        onDragStart: () => beginGesture('Transform'),
        onChange: (obj) => {
          // Parent is the basis root, so the read-back is KSA-frame numbers.
          const id = (obj.userData.selectable as { id: string } | undefined)?.id;
          if (!id) return;
          const t = readPlacementTransform(obj);
          setPlacementTransform(id, t);
        },
        onDraggingChanged: (dragging) => {
          this.selectionMgr.setSuppressed(dragging);
          if (!dragging) endGesture();
        },
      },
    );

    // --- Store subscriptions (invalidate-after-callback, flexo's sub() idiom) ---
    this.sub($activeObject, () => this.reconcile());
    this.sub($pieceIndex, () => this.reconcile());
    this.sub($selection, () => this.applySelection());
    this.sub($tool, () => this.applyTool());
    this.sub($groundLock, () => this.applyTool());
    this.sub($snap, () => this.applySnap());
  }

  private sub<T>(store: { subscribe(cb: (v: T) => void): () => void }, cb: () => void): void {
    this.unsubs.push(
      store.subscribe(() => {
        cb();
        this.viewport.invalidate();
      }),
    );
  }

  /** Frames the whole active object (or the origin area when empty). */
  frameAll(): void {
    const box = new THREE.Box3();
    let any = false;
    for (const obj of this.objects.values()) {
      box.expandByObject(obj.group);
      any = true;
    }
    if (!any) box.set(new THREE.Vector3(-60, 0, -60), new THREE.Vector3(60, 20, 60));
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    this.viewport.frameBounds(center, size.max(new THREE.Vector3(10, 10, 10)));
  }

  /** Frames the current selection (falls back to frame-all). */
  frameSelection(): void {
    const ids = $selection.get();
    if (ids.length === 0) {
      this.frameAll();
      return;
    }
    const box = new THREE.Box3();
    for (const id of ids) {
      const obj = this.objects.get(id);
      if (obj) box.expandByObject(obj.group);
    }
    if (box.isEmpty()) {
      this.frameAll();
      return;
    }
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    this.viewport.frameBounds(center, size.max(new THREE.Vector3(2, 2, 2)));
  }

  /** World (three-space) position of a KSA point — for overlays/tests. */
  ksaPointToWorld(p: { x: number; y: number; z: number }): THREE.Vector3 {
    return ksaToThree(p);
  }

  private reconcile(): void {
    const doc = $activeObject.get();
    const index = $pieceIndex.get();
    const wanted = new Map(doc.placements.map((pl) => [pl.instanceId, pl]));

    // Remove dead / piece-swapped instances.
    for (const [id, obj] of this.objects) {
      const pl = wanted.get(id);
      if (!pl || pl.pieceId !== obj.pieceId) {
        obj.dispose();
        this.objects.delete(id);
      }
    }

    // Update survivors, create newcomers.
    for (const pl of doc.placements) {
      const existing = this.objects.get(pl.instanceId);
      if (existing) {
        // Skip the write-back echo of the object currently being dragged: the
        // gizmo owns its transform mid-drag, and re-applying identical numbers
        // each frame would fight TransformControls.
        if (!(this.gizmo.isDragging && this.isGizmoTarget(pl.instanceId))) {
          existing.applyTransform(pl);
        }
        continue;
      }
      const piece = index.get(pl.pieceId);
      if (!piece) continue; // catalog still loading, or unknown piece
      void PieceObject.create(piece, pl).then((obj) => {
        // Async landing re-check: the placement may be gone or re-templated.
        const current = $activeObject.get().placements.find((x) => x.instanceId === obj.instanceId);
        if (this.disposed || !current || current.pieceId !== obj.pieceId) {
          obj.dispose();
          return;
        }
        const stale = this.objects.get(obj.instanceId);
        if (stale) stale.dispose();
        this.objects.set(obj.instanceId, obj);
        obj.applyTransform(current);
        this.root.add(obj.group);
        this.applySelection();
        this.viewport.invalidate();
      });
    }

    this.applySelection();
  }

  private isGizmoTarget(instanceId: string): boolean {
    const ids = $selection.get();
    return ids.length === 1 && ids[0] === instanceId;
  }

  private applySelection(): void {
    const ids = new Set($selection.get());
    for (const [id, obj] of this.objects) obj.setSelected(ids.has(id));

    // Gizmo: attach on single selection (multi-select transform lands with P4).
    const single = ids.size === 1 ? this.objects.get([...ids][0]) : undefined;
    if (!this.gizmo.isDragging) {
      this.gizmo.attach(single && getPlacement(single.instanceId) ? single.group : null);
    }
  }

  private applyTool(): void {
    const tool = $tool.get();
    if (tool === 'select') {
      this.gizmo.attach(null);
      return;
    }
    const mode: GizmoMode = tool;
    this.gizmo.setMode(mode);
    this.gizmo.setGroundLock($groundLock.get(), mode);
    this.applySelection();
  }

  private applySnap(): void {
    const snap = $snap.get();
    this.gizmo.setSnap(
      snap.enabled
        ? { translate: snap.translateM, rotateDeg: snap.rotateDeg }
        : { translate: null, rotateDeg: null },
    );
  }

  /** Escape ladder rung: cancel an in-flight gizmo drag. */
  cancelDrag(): boolean {
    if (!this.gizmo.isDragging) return false;
    this.gizmo.cancelDrag();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    for (const unsub of this.unsubs) unsub();
    for (const obj of this.objects.values()) obj.dispose();
    this.objects.clear();
    this.gizmo.dispose();
    this.selectionMgr.dispose();
    this.ground.dispose();
    this.viewport.dispose();
  }
}
