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
import { FootprintLayer } from './FootprintLayer';
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
  transformPlacements,
} from '../state/docStore';
import { $pieceIndex } from '../state/catalogStore';
import { $tool, $groundLock, $snap, $overlaysVisible } from '../state/toolStore';
import type { Transform } from '../ksa/types';

export class StaticScene {
  readonly viewport: IcrpViewport;

  /** The basis root: children are placed with raw KSA transforms (I1). */
  private readonly root = new THREE.Group();
  private readonly ground: GroundPlane;
  private readonly footprints: FootprintLayer;
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

    this.footprints = new FootprintLayer();
    this.viewport.scene.add(this.footprints.group);

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
    this.sub($activeObject, () => this.applyOverlays());
    this.sub($overlaysVisible, () => this.applyOverlays());
  }

  private applyOverlays(): void {
    const doc = $activeObject.get();
    this.footprints.update(doc);
    this.footprints.setVisible($overlaysVisible.get());
  }

  // --- Ground/stacking commands (plans/ICRP_PLAN.md P4.01) ----------------------

  /** three-space world AABB of one placed piece (parented under the basis root). */
  private worldBox(id: string): THREE.Box3 | null {
    const obj = this.objects.get(id);
    if (!obj) return null;
    return new THREE.Box3().expandByObject(obj.group);
  }

  /**
   * Applies a three-space vertical lift `dy` to a placement as a KSA up delta
   * (three +Y == KSA +X, see basis.ts).
   */
  private liftedTransform(id: string, dy: number): Transform | null {
    const pl = getPlacement(id);
    if (!pl) return null;
    return {
      ...pl.transform,
      position: { ...pl.transform.position, x: pl.transform.position.x + dy },
    };
  }

  /** Drop to ground: each selected piece's AABB bottom lands on three Y=0. */
  dropToGround(ids: readonly string[]): void {
    const updates = new Map<string, Transform>();
    for (const id of ids) {
      const box = this.worldBox(id);
      if (!box || box.isEmpty()) continue;
      const t = this.liftedTransform(id, -box.min.y);
      if (t) updates.set(id, t);
    }
    transformPlacements('Drop to ground', updates);
  }

  /**
   * Rest on top: raycast down from the piece's bottom footprint (5 sample
   * points) against the OTHER pieces; land on the highest hit (ground when
   * nothing is underneath).
   */
  restOnTop(ids: readonly string[]): void {
    const selected = new Set(ids);
    const targets: THREE.Object3D[] = [];
    for (const [id, obj] of this.objects) if (!selected.has(id)) targets.push(obj.group);
    const raycaster = new THREE.Raycaster();
    raycaster.ray.direction.set(0, -1, 0);

    const updates = new Map<string, Transform>();
    for (const id of ids) {
      const box = this.worldBox(id);
      if (!box || box.isEmpty()) continue;
      const samples = [
        new THREE.Vector3((box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2),
        new THREE.Vector3(box.min.x, 0, box.min.z),
        new THREE.Vector3(box.min.x, 0, box.max.z),
        new THREE.Vector3(box.max.x, 0, box.min.z),
        new THREE.Vector3(box.max.x, 0, box.max.z),
      ];
      let restY = 0; // ground
      for (const p of samples) {
        raycaster.ray.origin.set(p.x, box.min.y - 0.001, p.z);
        raycaster.far = box.min.y + 1000;
        for (const hit of raycaster.intersectObjects(targets, true)) {
          restY = Math.max(restY, hit.point.y);
          break; // nearest hit per sample is enough
        }
      }
      const t = this.liftedTransform(id, restY - box.min.y);
      if (t) updates.set(id, t);
    }
    transformPlacements('Rest on top', updates);
  }

  // --- Align / distribute (plans/ICRP_PLAN.md P4.04) ----------------------------

  /**
   * Aligns the selection on a KSA axis to the combined bounds' min/center/max.
   * Axis mapping (basis.ts): up = three Y, east = three X, north = three −Z —
   * deltas are computed in three space and written back as KSA deltas.
   */
  alignSelection(axis: 'east' | 'north' | 'up', mode: 'min' | 'center' | 'max'): void {
    const ids = $selection.get();
    if (ids.length < 2) return;
    const threeAxis = axis === 'east' ? 'x' : axis === 'up' ? 'y' : 'z';
    const boxes = new Map<string, THREE.Box3>();
    const combined = new THREE.Box3();
    for (const id of ids) {
      const box = this.worldBox(id);
      if (!box || box.isEmpty()) continue;
      boxes.set(id, box);
      combined.union(box);
    }
    if (boxes.size < 2) return;
    const target =
      mode === 'min'
        ? combined.min[threeAxis]
        : mode === 'max'
          ? combined.max[threeAxis]
          : (combined.min[threeAxis] + combined.max[threeAxis]) / 2;

    const updates = new Map<string, Transform>();
    for (const [id, box] of boxes) {
      const value =
        mode === 'min'
          ? box.min[threeAxis]
          : mode === 'max'
            ? box.max[threeAxis]
            : (box.min[threeAxis] + box.max[threeAxis]) / 2;
      const dThree = target - value;
      const pl = getPlacement(id);
      if (!pl || dThree === 0) continue;
      const dKsa =
        axis === 'east'
          ? { x: 0, y: dThree, z: 0 }
          : axis === 'up'
            ? { x: dThree, y: 0, z: 0 }
            : { x: 0, y: 0, z: -dThree }; // north = three −Z
      updates.set(id, {
        ...pl.transform,
        position: {
          x: pl.transform.position.x + dKsa.x,
          y: pl.transform.position.y + dKsa.y,
          z: pl.transform.position.z + dKsa.z,
        },
      });
    }
    transformPlacements(`Align ${axis} ${mode}`, updates);
  }

  /** Distributes the selection's centers evenly between the two extremes on an axis. */
  distributeSelection(axis: 'east' | 'north'): void {
    const ids = $selection.get();
    if (ids.length < 3) return;
    const threeAxis = axis === 'east' ? 'x' : 'z';
    const rows: { id: string; center: number }[] = [];
    for (const id of ids) {
      const box = this.worldBox(id);
      if (!box || box.isEmpty()) continue;
      rows.push({ id, center: (box.min[threeAxis] + box.max[threeAxis]) / 2 });
    }
    if (rows.length < 3) return;
    rows.sort((a, b) => a.center - b.center);
    const first = rows[0].center;
    const step = (rows[rows.length - 1].center - first) / (rows.length - 1);
    const updates = new Map<string, Transform>();
    rows.forEach((row, i) => {
      const dThree = first + step * i - row.center;
      const pl = getPlacement(row.id);
      if (!pl || dThree === 0) return;
      const dKsa = axis === 'east' ? { x: 0, y: dThree, z: 0 } : { x: 0, y: 0, z: -dThree };
      updates.set(row.id, {
        ...pl.transform,
        position: {
          x: pl.transform.position.x + dKsa.x,
          y: pl.transform.position.y + dKsa.y,
          z: pl.transform.position.z + dKsa.z,
        },
      });
    });
    transformPlacements(`Distribute ${axis}`, updates);
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
    this.footprints.dispose();
    this.ground.dispose();
    this.viewport.dispose();
  }
}
