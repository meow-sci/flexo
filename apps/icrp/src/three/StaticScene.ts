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
import { GhostObjectsLayer } from './GhostObjectsLayer';
import { ColliderVisLayer, decodeColliderRef } from './ColliderVisLayer';
import { PieceObject } from './PieceObject';
import { IcrpGizmo, type GizmoMode } from './IcrpGizmo';
import { applyStaticBasis } from './basis';
import { SelectionManager } from '../../../../src/three/SelectionManager';
import {
  colliderLocalFromWorld,
  matrixFromTransform,
  readPlacementTransform,
  transformFromMatrix,
} from '../../../../src/three/coords';
import { collectWorldPoints } from '../../../../src/three/samplePoints';
import { fitCollider, IDENTITY_QUAT } from '../../../../src/ksa/colliderFit';
import { normalizeColliderSize } from '../../../../src/ksa/colliderSize';
import { ksaToThree } from './basis';
import {
  $activeObject,
  $colliderSelection,
  $project,
  $selection,
  addColliderTo,
  beginGesture,
  endGesture,
  getCollider,
  getPlacement,
  setPlacementTransform,
  setPlacementTransformsBatch,
  transformPlacements,
  updateCollider,
  type ColliderRef,
} from '../state/docStore';
import { $pieceIndex } from '../state/catalogStore';
import {
  $tool,
  $groundLock,
  $keepGrounded,
  $magnet,
  $snap,
  $overlaysVisible,
  $collidersVisible,
} from '../state/toolStore';
import {
  bestBoxSnap,
  bestConnectorSnap,
  connectorWorld,
  ksaBoxFromThree,
  shiftKsaBox,
  type KsaBox,
  type WorldConnector,
} from './snapEngine';
import { selectLayerContents } from '../state/docStore';
import { $mode } from '../state/modeStore';
import type { PartCollider } from '../ksa/types';
import type { Transform } from '../ksa/types';

export class StaticScene {
  readonly viewport: IcrpViewport;

  /** The basis root: children are placed with raw KSA transforms (I1). */
  private readonly root = new THREE.Group();
  private readonly ground: GroundPlane;
  private readonly footprints: FootprintLayer;
  private readonly ghosts: GhostObjectsLayer;
  private readonly colliderVis: ColliderVisLayer;
  private readonly gizmo: IcrpGizmo;
  private readonly selectionMgr: SelectionManager;
  private readonly objects = new Map<string, PieceObject>();
  private readonly unsubs: Array<() => void> = [];
  private disposed = false;
  private readonly pivot = new THREE.Object3D();
  private gizmoOnPivot = false;
  private pivotStart: {
    inverse: THREE.Matrix4;
    placements: Map<string, THREE.Matrix4>;
  } | null = null;
  /** Selected pieces' world-AABB bottoms at scale-drag start (keep-grounded). */
  private bottomsAtDragStart: Map<string, number> | null = null;

  constructor(host: HTMLElement) {
    this.viewport = new IcrpViewport(host);

    this.root.name = 'icrp-root';
    applyStaticBasis(this.root);
    this.viewport.scene.add(this.root);

    this.ground = new GroundPlane();
    this.viewport.scene.add(this.ground.group);

    this.footprints = new FootprintLayer();
    this.viewport.scene.add(this.footprints.group);

    this.ghosts = new GhostObjectsLayer(() => this.viewport.invalidate());
    this.root.add(this.ghosts.group);

    this.colliderVis = new ColliderVisLayer();
    this.root.add(this.colliderVis.group);
    this.root.add(this.snapGuides);

    this.selectionMgr = new SelectionManager(
      this.viewport.camera,
      this.viewport.renderer.domElement,
      this.root,
      (selected, additive) => {
        if (!selected) {
          if (!additive) {
            $selection.set([]);
            $colliderSelection.set(null);
          }
          return;
        }
        if (selected.kind === 'collider') {
          const ref = decodeColliderRef(selected.id);
          if (ref) {
            $selection.set([]);
            $colliderSelection.set(ref);
          }
          return;
        }
        $colliderSelection.set(null);
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
          if (obj === this.pivot) {
            this.applyPivotDelta();
            return;
          }
          // Parent is the basis root, so the read-back is KSA-frame numbers.
          const selectable = obj.userData.selectable as { kind?: string; id: string } | undefined;
          if (!selectable) return;
          const t = readPlacementTransform(obj);
          if (selectable.kind === 'collider') {
            const ref = decodeColliderRef(selectable.id);
            if (ref) this.writeColliderFromWorld(ref, t);
            return;
          }
          setPlacementTransform(selectable.id, t);
        },
        onDraggingChanged: (dragging) => {
          this.selectionMgr.setSuppressed(dragging);
          if (dragging) {
            if (this.gizmoOnPivot) this.capturePivotStart();
            if ($tool.get() === 'scale') this.captureBottomsAtDragStart();
          }
          if (!dragging) {
            this.pivotStart = null;
            // Keep-grounded: a scaled piece whose bottom sat ON the ground
            // before the drag is re-dropped (still inside the same gesture, so
            // scale + re-ground undo as ONE step). Below-grade pieces (terrain
            // skirts) had a negative bottom and are left alone.
            if ($tool.get() === 'scale' && $keepGrounded.get()) this.regroundScaled();
            this.bottomsAtDragStart = null;
            endGesture();
            // Converge: every mesh takes the document transform exactly (the
            // single-select echo-skip ends here), THEN re-center the pivot so
            // the next drag starts from identity.
            this.reconcile();
            this.applyColliderVis();
            this.applySelection();
            this.viewport.invalidate();
          }
        },
      },
    );

    // Multi-select pivot: an invisible handle at the selection centroid the
    // gizmo attaches to; drags replay the pivot's delta onto every selected
    // placement (translate + rotate-about-pivot). Child of the basis root, so
    // its local transform is KSA-frame like everything else.
    this.pivot.name = 'multi-select-pivot';
    this.root.add(this.pivot);

    // Grab-anywhere translate: pointer-dragging a PIECE BODY (not a gizmo
    // handle) slides the selection on the ground plane — the manipulation
    // everyone tries first; arrows stay for precise/vertical moves.
    this.bindBodyDrag();

    // --- Store subscriptions (invalidate-after-callback, flexo's sub() idiom) ---
    this.sub($activeObject, () => this.reconcile());
    this.sub($pieceIndex, () => this.reconcile());
    this.sub($selection, () => this.applySelection());
    this.sub($tool, () => this.applyTool());
    this.sub($groundLock, () => this.applyTool());
    this.sub($snap, () => this.applySnap());
    this.sub($activeObject, () => this.applyOverlays());
    this.sub($overlaysVisible, () => this.applyOverlays());
    this.sub($project, () => this.applyGhosts());
    this.sub($pieceIndex, () => this.applyGhosts());
    this.sub($activeObject, () => this.applyColliderVis());
    this.sub($pieceIndex, () => this.applyColliderVis());
    this.sub($collidersVisible, () => this.applyColliderVis());
    this.sub($colliderSelection, () => {
      this.colliderVis.setSelected($colliderSelection.get());
      this.applySelection();
    });
    this.sub($mode, () => {
      this.applyColliderVis();
      this.applyOverlays();
      this.applySelection();
    });
  }

  /** True while the gizmo is dragging the SELECTED COLLIDER's visual. */
  private draggingCollider = false;

  private applyColliderVis(): void {
    // Echo-skip: while the gizmo drags a collider visual, the write-back
    // rebuild would destroy the very object being dragged (converged on drag
    // end, same pattern as placements).
    if (this.draggingCollider && this.gizmo.isDragging) return;
    // The rebuild DISPOSES every collider visual — detach the gizmo first if it
    // holds one (TransformControls crashes updating a parentless object), then
    // re-attach to the freshly built visual via applySelection.
    if (this.draggingCollider) this.gizmo.attach(null);
    const collidersMode = $mode.get() === 'colliders';
    this.colliderVis.update(
      $activeObject.get(),
      $pieceIndex.get(),
      // Colliders mode forces the wires on; the View toggle still works elsewhere.
      $collidersVisible.get() || collidersMode,
      collidersMode,
    );
    this.colliderVis.setSelected($colliderSelection.get());
    if ($colliderSelection.get()) this.applySelection();
  }

  /** Writes a dragged collider visual's KSA-frame transform back to the doc. */
  private writeColliderFromWorld(ref: ColliderRef, world: Transform): void {
    const size = normalizeColliderSize(getCollider(ref)?.shape ?? 'Box', world.scale);
    if (ref.owner === null) {
      updateCollider(ref, { position: world.position, rotation: world.rotation, scale: size });
      return;
    }
    const pl = getPlacement(ref.owner);
    if (!pl) return;
    const frame: Transform = {
      position: pl.transform.position,
      rotation: pl.transform.rotation,
      scale: { x: 1, y: 1, z: 1 },
    };
    const local = colliderLocalFromWorld({ ...world, scale: size }, frame);
    updateCollider(ref, { position: local.position, rotation: local.rotation, scale: size });
  }

  // --- Collider authoring (details-panel commands) --------------------------------

  /** KSA-frame (object space) sample points of the selected placements. */
  private selectionKsaPoints(): { x: number; y: number; z: number }[] {
    const groups: THREE.Object3D[] = [];
    for (const id of $selection.get()) {
      const obj = this.objects.get(id);
      if (obj) groups.push(obj.group);
    }
    // collectWorldPoints returns THREE world points; root basis maps them back.
    return collectWorldPoints(groups, 'vertex').map((p) => ({ x: p.y, y: p.x, z: -p.z }));
  }

  /**
   * Fits `shape` around the selected placements' geometry and adds it as a
   * collider OWNED BY the first selected placement (so it follows the piece);
   * with nothing selected the fit is impossible (returns false).
   */
  addFittedCollider(shape: PartCollider['shape']): boolean {
    const ids = $selection.get();
    if (ids.length === 0) return false;
    const points = this.selectionKsaPoints();
    const fit = fitCollider(shape, points, IDENTITY_QUAT, 0);
    if (!fit) return false;
    const q = new THREE.Quaternion(
      fit.quaternion[0],
      fit.quaternion[1],
      fit.quaternion[2],
      fit.quaternion[3],
    );
    const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
    const world: Transform = {
      position: fit.position,
      rotation: { x: e.x, y: e.y, z: e.z },
      scale: fit.size,
    };
    const owner = ids[0];
    const pl = getPlacement(owner);
    if (!pl) return false;
    const frame: Transform = {
      position: pl.transform.position,
      rotation: pl.transform.rotation,
      scale: { x: 1, y: 1, z: 1 },
    };
    const local = colliderLocalFromWorld(world, frame);
    addColliderTo(owner, {
      shape,
      position: local.position,
      rotation: local.rotation,
      scale: fit.size,
    });
    return true;
  }

  /**
   * Adds a default 1 m collider at the selection centroid, owned by the first
   * selected placement (or object-level with nothing selected).
   */
  addManualCollider(shape: PartCollider['shape']): void {
    const ids = $selection.get();
    const owner = ids[0] ?? null;
    let centreKsa = { x: 0.5, y: 0, z: 0 };
    const box = new THREE.Box3();
    for (const id of ids) {
      const obj = this.objects.get(id);
      if (obj) box.expandByObject(obj.group);
    }
    if (!box.isEmpty()) {
      const c = new THREE.Vector3();
      box.getCenter(c);
      centreKsa = { x: c.y, y: c.x, z: -c.z };
    }
    const size = normalizeColliderSize(shape, { x: 1, y: 1, z: 1 });
    if (owner === null) {
      addColliderTo(null, {
        shape,
        position: centreKsa,
        rotation: { x: 0, y: 0, z: 0 },
        scale: size,
      });
      return;
    }
    const pl = getPlacement(owner);
    if (!pl) return;
    const frame: Transform = {
      position: pl.transform.position,
      rotation: pl.transform.rotation,
      scale: { x: 1, y: 1, z: 1 },
    };
    const local = colliderLocalFromWorld(
      { position: centreKsa, rotation: { x: 0, y: 0, z: 0 }, scale: size },
      frame,
    );
    addColliderTo(owner, {
      shape,
      position: local.position,
      rotation: local.rotation,
      scale: size,
    });
  }

  private lastGhostKey = '';

  /** Rebuilds ghosts only when the INACTIVE placements actually changed. */
  private applyGhosts(): void {
    const p = $project.get();
    const inactive = p.objects.filter((o) => o.id !== p.activeObjectId);
    const placements = inactive.flatMap((o) => o.placements);
    const key = `${p.activeObjectId}|${inactive
      .map(
        (o) =>
          `${o.id}:${o.placements.length}:${o.placements.map((pl) => pl.instanceId).join(',')}`,
      )
      .join(';')}`;
    if (key === this.lastGhostKey) return;
    this.lastGhostKey = key;
    this.ghosts.update(placements, $pieceIndex.get());
  }

  private applyOverlays(): void {
    const doc = $activeObject.get();
    this.footprints.update(doc);
    // Sites mode forces the site overlays on.
    this.footprints.setVisible($overlaysVisible.get() || $mode.get() === 'sites');
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

  // --- Auto-computed metres (plans/ICRP_PLAN.md P6.01) --------------------------

  /**
   * SurfaceHeight suggestion: the highest piece top among pieces whose ground
   * footprint contains the origin (where a vessel spawns), minus GroundOffset —
   * falls back to the global top. Core's 1.5537 ≈ the PadGrate deck.
   */
  suggestSurfaceHeightM(): number | null {
    let originTop: number | null = null;
    let globalTop: number | null = null;
    for (const [, obj] of this.objects) {
      const box = new THREE.Box3().expandByObject(obj.group);
      if (box.isEmpty()) continue;
      globalTop = Math.max(globalTop ?? -Infinity, box.max.y);
      const containsOrigin = box.min.x <= 0 && box.max.x >= 0 && box.min.z <= 0 && box.max.z >= 0;
      if (containsOrigin) originTop = Math.max(originTop ?? -Infinity, box.max.y);
    }
    const top = originTop ?? globalTop;
    return top === null ? null : Math.round(top * 10000) / 10000;
  }

  /** FootprintRadius suggestion: max horizontal reach of any piece AABB corner. */
  suggestFootprintRadiusM(): number | null {
    let r = 0;
    for (const [, obj] of this.objects) {
      const box = new THREE.Box3().expandByObject(obj.group);
      if (box.isEmpty()) continue;
      for (const x of [box.min.x, box.max.x]) {
        for (const z of [box.min.z, box.max.z]) {
          r = Math.max(r, Math.hypot(x, z));
        }
      }
    }
    return r === 0 ? null : Math.round(r * 10) / 10;
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

    const layerState = new Map(doc.layers.map((l) => [l.id, l]));
    const stateOf = (layerId: string) => {
      const layer = layerState.get(layerId);
      return {
        visible: layer?.visible ?? true,
        pickable: (layer?.visible ?? true) && !layer?.locked,
      };
    };

    // Update survivors, create newcomers.
    for (const pl of doc.placements) {
      const existing = this.objects.get(pl.instanceId);
      if (existing) {
        const st = stateOf(pl.layerId);
        existing.setLayerState(st.visible, st.pickable);
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
        const layer = $activeObject.get().layers.find((l) => l.id === current.layerId);
        obj.setLayerState(layer?.visible ?? true, (layer?.visible ?? true) && !layer?.locked);
        this.root.add(obj.group);
        this.applySelection();
        this.viewport.invalidate();
      });
    }

    this.applySelection();
  }

  /**
   * Should reconcile SKIP writing the doc transform back onto this placement's
   * mesh right now? ONLY for the single-select TransformControls drag, where
   * the gizmo moves the MESH directly and a write-back would fight it.
   *
   * During a PIVOT drag the gizmo moves only the (invisible) pivot — the doc
   * write-back IS how the meshes follow. Skipping them here was the
   * "group drags update nothing until something else teleports it" bug.
   */
  private isGizmoTarget(instanceId: string): boolean {
    if (this.gizmoOnPivot) return false;
    const ids = $selection.get();
    return ids.length === 1 && ids[0] === instanceId;
  }

  private captureBottomsAtDragStart(): void {
    const bottoms = new Map<string, number>();
    for (const id of $selection.get()) {
      const box = this.worldBox(id);
      if (box && !box.isEmpty()) bottoms.set(id, box.min.y);
    }
    this.bottomsAtDragStart = bottoms;
  }

  /** Re-grounds scaled pieces that were grounded before the drag (same gesture). */
  private regroundScaled(): void {
    const bottoms = this.bottomsAtDragStart;
    if (!bottoms) return;
    const updates = new Map<string, Transform>();
    for (const [id, bottomBefore] of bottoms) {
      if (Math.abs(bottomBefore) > 0.02) continue; // was not sitting on the ground
      const box = this.worldBox(id);
      if (!box || box.isEmpty()) continue;
      const t = this.liftedTransform(id, -box.min.y);
      if (t && Math.abs(box.min.y) > 1e-6) updates.set(id, t);
    }
    // Inside the still-open scale gesture — no extra undo step.
    for (const [id, t] of updates) setPlacementTransform(id, t);
  }

  /**
   * Drops newly added placements to the ground once their meshes land (adds
   * are async — the GLB may still be loading). Quiet: no extra undo step (the
   * add/import mutator owns the step; undoing it removes the placements).
   */
  /**
   * Keyboard re-orientation (builder convention, App's ⇧W/A/S/D/Q/E): rotates
   * the whole selection `deg` degrees about a world axis THROUGH the group's
   * box center — one undo step, and the group is lifted back above grade if
   * tipping buried it.
   */
  rotateSelection(axis: 'up' | 'east' | 'north', deg: number): void {
    const ids = $selection.get();
    if (ids.length === 0) return;
    const union = new THREE.Box3();
    for (const id of ids) {
      const box = this.worldBox(id);
      if (box && !box.isEmpty()) union.union(box);
    }
    if (union.isEmpty()) return;
    const c = new THREE.Vector3();
    union.getCenter(c);
    // three → KSA (basis: ksa = [y, x, -z]).
    const pivot = new THREE.Vector3(c.y, c.x, -c.z);
    const axisVec =
      axis === 'up'
        ? new THREE.Vector3(1, 0, 0)
        : axis === 'east'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
    const q = new THREE.Quaternion().setFromAxisAngle(axisVec, (deg * Math.PI) / 180);
    beginGesture('Rotate selection');
    const updates = new Map<string, Transform>();
    for (const id of ids) {
      const pl = getPlacement(id);
      if (!pl) continue;
      const p = new THREE.Vector3(
        pl.transform.position.x,
        pl.transform.position.y,
        pl.transform.position.z,
      )
        .sub(pivot)
        .applyQuaternion(q)
        .add(pivot);
      const plQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          pl.transform.rotation.x,
          pl.transform.rotation.y,
          pl.transform.rotation.z,
          'ZYX',
        ),
      );
      const e = new THREE.Euler().setFromQuaternion(q.clone().multiply(plQ), 'ZYX');
      updates.set(id, {
        ...pl.transform,
        position: { x: p.x, y: p.y, z: p.z },
        rotation: { x: e.x, y: e.y, z: e.z },
      });
    }
    setPlacementTransformsBatch(updates);
    this.reconcile();
    // Never leave a tipped part buried: lift the GROUP as one back to grade.
    const after = new THREE.Box3();
    for (const id of ids) {
      const box = this.worldBox(id);
      if (box && !box.isEmpty()) after.union(box);
    }
    if (!after.isEmpty() && after.min.y < -0.001) {
      const lift = -after.min.y;
      const lifted = new Map<string, Transform>();
      for (const id of ids) {
        const pl = getPlacement(id);
        if (!pl) continue;
        lifted.set(id, {
          ...pl.transform,
          position: { ...pl.transform.position, x: pl.transform.position.x + lift },
        });
      }
      setPlacementTransformsBatch(lifted);
    }
    endGesture();
    this.reconcile();
    this.applySelection();
    this.viewport.invalidate();
  }

  /**
   * A clear drop spot for library click-to-add: just east of everything already
   * placed (0 for an empty object).
   */
  spawnEast(): number {
    const union = new THREE.Box3();
    for (const obj of this.objects.values()) union.expandByObject(obj.group);
    if (union.isEmpty()) return 0;
    return union.max.x + 3; // three +X == KSA east
  }

  groundWhenLoaded(ids: readonly string[]): void {
    const deadline = Date.now() + 5000;
    const tick = () => {
      if (this.disposed || Date.now() > deadline) return;
      const pending = ids.filter((id) => getPlacement(id) !== undefined);
      if (pending.length === 0) return; // all gone (undone) — nothing to do
      if (pending.every((id) => this.objects.has(id))) {
        const updates = new Map<string, Transform>();
        // Ground the GROUP as one: lift everything by the same delta so the
        // lowest piece lands on the ground (an imported part keeps its shape).
        let minBottom = Infinity;
        for (const id of pending) {
          const box = this.worldBox(id);
          if (box && !box.isEmpty()) minBottom = Math.min(minBottom, box.min.y);
        }
        if (Number.isFinite(minBottom) && Math.abs(minBottom) > 1e-6) {
          for (const id of pending) {
            const t = this.liftedTransform(id, -minBottom);
            if (t) updates.set(id, t);
          }
          for (const [id, t] of updates) setPlacementTransform(id, t);
        }
        this.viewport.invalidate();
        return;
      }
      setTimeout(tick, 150);
    };
    setTimeout(tick, 150);
  }

  /** Snapshot at drag start: pivot pose + every selected placement's matrix. */
  private capturePivotStart(): void {
    this.pivot.updateMatrix();
    const placements = new Map<string, THREE.Matrix4>();
    for (const id of $selection.get()) {
      const pl = getPlacement(id);
      if (pl) placements.set(id, matrixFromTransform(pl.transform));
    }
    this.pivotStart = { inverse: this.pivot.matrix.clone().invert(), placements };
  }

  /** Streams pivotDelta ∘ startMatrix into each selected placement (ONE store write). */
  private applyPivotDelta(): void {
    const start = this.pivotStart;
    if (!start) return;
    this.pivot.updateMatrix();
    const delta = this.pivot.matrix.clone().multiply(start.inverse);
    const scratch = new THREE.Matrix4();
    const updates = new Map<string, Transform>();
    for (const [id, m0] of start.placements) {
      scratch.copy(delta).multiply(m0);
      updates.set(id, transformFromMatrix(scratch));
    }
    setPlacementTransformsBatch(updates);
  }

  private applySelection(): void {
    const ids = new Set($selection.get());
    for (const [id, obj] of this.objects) obj.setSelected(ids.has(id));
    if (this.gizmo.isDragging) return;

    // A selected collider owns the gizmo (all three tools; scale = resize).
    const colliderRef = $colliderSelection.get();
    if (colliderRef) {
      const target = this.colliderVis.getPickable(colliderRef);
      this.gizmoOnPivot = false;
      this.draggingCollider = !!target;
      this.gizmo.attach(target);
      return;
    }
    this.draggingCollider = false;

    if (ids.size === 1) {
      const single = this.objects.get([...ids][0]);
      this.gizmoOnPivot = false;
      this.gizmo.attach(single && getPlacement(single.instanceId) ? single.group : null);
      return;
    }
    if (ids.size > 1 && $tool.get() !== 'select') {
      // Pivot at the selection's three-space centroid, axis-aligned (world
      // handles). Scale on the pivot scales the GROUP about it — positions and
      // visual scales together (colliders never scale, I3 — preflight warns).
      const box = new THREE.Box3();
      for (const id of ids) {
        const obj = this.objects.get(id);
        if (obj) box.expandByObject(obj.group);
      }
      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        // three world → the pivot's KSA-frame local (parent is the basis root).
        this.pivot.position.set(center.y, center.x, -center.z);
        this.pivot.rotation.set(0, 0, 0);
        this.pivot.scale.set(1, 1, 1);
        this.pivot.updateMatrix();
        this.gizmoOnPivot = true;
        this.gizmo.attach(this.pivot);
        return;
      }
    }
    this.gizmoOnPivot = false;
    this.gizmo.attach(null);
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

  // --- Grab-anywhere ground drag -------------------------------------------------

  private bodyDrag: {
    pointerId: number;
    /** three-space horizontal plane at the grab height. */
    plane: THREE.Plane;
    /** KSA-frame start transforms of every dragged placement. */
    starts: Map<string, Transform>;
    grab: THREE.Vector3;
    moved: boolean;
    /** Magnet targets, captured once at drag start (stationary all drag). */
    staticConnectors: WorldConnector[];
    staticBoxes: KsaBox[];
    /** Dragged connectors as (placement id, connector) pairs. */
    movingConnectors: { id: string; conn: import('../ksa/types').SnapConnector }[];
    /** Union KSA box of the dragged group at drag start. */
    startBox: KsaBox | null;
  } | null = null;

  /** Snap feedback visuals (docking dot + alignment guide lines), KSA frame. */
  private readonly snapGuides = new THREE.Group();

  private clearSnapGuides(): void {
    while (this.snapGuides.children.length > 0) {
      const child = this.snapGuides.children[this.snapGuides.children.length - 1] as THREE.Mesh;
      child.geometry?.dispose();
      (child.material as THREE.Material | undefined)?.dispose?.();
      this.snapGuides.remove(child);
    }
  }

  private guideLine(a: THREE.Vector3, b: THREE.Vector3, color: number): void {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false }));
    line.renderOrder = 999;
    this.snapGuides.add(line);
  }

  /** Magnet radius: ~18 px at the grab point, so the pull feels zoom-constant. */
  private magnetRadius(at: THREE.Vector3): number {
    const cam = this.viewport.camera;
    const dist = cam.position.distanceTo(at);
    const h = this.viewport.renderer.domElement.clientHeight || 1;
    const worldPerPx = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / h;
    return Math.min(4, Math.max(0.25, 18 * worldPerPx));
  }

  private bindBodyDrag(): void {
    const el = this.viewport.renderer.domElement;
    el.addEventListener('pointerdown', this.onBodyDragDown);
    el.addEventListener('pointermove', this.onBodyDragMove);
    el.addEventListener('pointerup', this.onBodyDragUp);
    el.addEventListener('pointercancel', this.onBodyDragUp);
    el.addEventListener('dblclick', this.onCanvasDblClick);
  }

  private unbindBodyDrag(): void {
    const el = this.viewport.renderer.domElement;
    el.removeEventListener('pointerdown', this.onBodyDragDown);
    el.removeEventListener('pointermove', this.onBodyDragMove);
    el.removeEventListener('pointerup', this.onBodyDragUp);
    el.removeEventListener('pointercancel', this.onBodyDragUp);
    el.removeEventListener('dblclick', this.onCanvasDblClick);
  }

  /**
   * Double-click = select the piece's WHOLE LAYER (a stock-part import is a
   * layer, so this is "select the tank as a unit" — click stays single-piece).
   */
  private readonly onCanvasDblClick = (e: MouseEvent): void => {
    const hit = this.selectionMgr.pickAt(e.clientX, e.clientY);
    if (!hit) return;
    const pl = getPlacement(hit.id);
    if (pl) selectLayerContents(pl.layerId);
  };

  private raycastGroundPoint(e: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null {
    const el = this.viewport.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.viewport.camera);
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  private readonly onBodyDragDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    // Translate tool only: select/rotate/scale keep piece-drags free for
    // orbiting, and an additive (shift/cmd) click stays a SELECTION gesture.
    if ($tool.get() !== 'translate') return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    // A gizmo handle under the pointer wins — TransformControls owns that drag.
    if (this.gizmo.hoveredAxis) return;
    const hit = this.selectionMgr.pickAt(e.clientX, e.clientY);
    if (!hit) return;
    // Drag the existing selection when the grabbed piece is part of it;
    // otherwise select the grabbed piece and drag just it.
    let ids = $selection.get();
    if (!ids.includes(hit.id)) {
      $selection.set([hit.id]);
      ids = [hit.id];
    }
    const starts = new Map<string, Transform>();
    for (const id of ids) {
      const pl = getPlacement(id);
      if (pl) starts.set(id, structuredClone(pl.transform) as Transform);
    }
    if (starts.size === 0) return;
    // Grab plane: horizontal at the grab piece's base height, so the piece
    // slides with the cursor regardless of elevation.
    const grabBox = this.worldBox(hit.id);
    const planeY = grabBox && !grabBox.isEmpty() ? grabBox.min.y : 0;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const grab = this.raycastGroundPoint(e, plane);
    if (!grab) return;
    // Magnet targets: everything NOT dragged, on a visible layer (locked
    // layers still attract — the pad is usually locked and tanks snap to it).
    const staticConnectors: WorldConnector[] = [];
    const staticBoxes: KsaBox[] = [];
    if ($magnet.get()) {
      const obj = $activeObject.get();
      const visible = new Set(obj.layers.filter((l) => l.visible).map((l) => l.id));
      for (const pl of obj.placements) {
        if (starts.has(pl.instanceId) || !visible.has(pl.layerId)) continue;
        for (const conn of pl.connectors ?? []) {
          staticConnectors.push(connectorWorld(conn, pl.transform));
        }
        const box = this.worldBox(pl.instanceId);
        if (box && !box.isEmpty()) staticBoxes.push(ksaBoxFromThree(box));
      }
    }
    const movingConnectors: { id: string; conn: import('../ksa/types').SnapConnector }[] = [];
    const startUnion = new THREE.Box3();
    for (const id of starts.keys()) {
      const pl = getPlacement(id);
      for (const conn of pl?.connectors ?? []) movingConnectors.push({ id, conn });
      const box = this.worldBox(id);
      if (box && !box.isEmpty()) startUnion.union(box);
    }
    this.bodyDrag = {
      pointerId: e.pointerId,
      plane,
      starts,
      grab,
      moved: false,
      staticConnectors,
      staticBoxes,
      movingConnectors,
      startBox: startUnion.isEmpty() ? null : ksaBoxFromThree(startUnion),
    };
    this.viewport.controls.enabled = false;
    this.selectionMgr.setSuppressed(true);
    try {
      // Keep receiving moves outside the canvas.
      this.viewport.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // capture is best-effort
    }
  };

  private readonly onBodyDragMove = (e: PointerEvent): void => {
    const drag = this.bodyDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const here = this.raycastGroundPoint(e, drag.plane);
    if (!here) return;
    // three-space horizontal delta -> KSA east/north (basis: east = +X, north = -Z).
    let dEast = here.x - drag.grab.x;
    let dNorth = -(here.z - drag.grab.z);
    if (!drag.moved && Math.hypot(dEast, dNorth) < 0.01) return;
    if (!drag.moved) {
      drag.moved = true;
      beginGesture('Move');
    }
    const snap = $snap.get();
    if (snap.enabled && snap.translateM > 0) {
      dEast = Math.round(dEast / snap.translateM) * snap.translateM;
      dNorth = Math.round(dNorth / snap.translateM) * snap.translateM;
    }

    // --- Magnet pass (snapEngine): connector docking wins, else box align. ---
    let dUp = 0;
    this.clearSnapGuides();
    this.lastSnapKind = null;
    if ($magnet.get()) {
      const radius = this.magnetRadius(here);
      const candidate = (start: Transform): Transform => ({
        ...start,
        position: {
          x: start.position.x,
          y: start.position.y + dEast,
          z: start.position.z + dNorth,
        },
      });
      const moving: WorldConnector[] = drag.movingConnectors.flatMap(({ id, conn }) => {
        const start = drag.starts.get(id);
        return start ? [connectorWorld(conn, candidate(start))] : [];
      });
      const dock = bestConnectorSnap(moving, drag.staticConnectors, radius);
      if (dock) {
        dUp = dock.delta.x;
        dEast += dock.delta.y;
        dNorth += dock.delta.z;
        this.lastSnapKind = 'connector';
        // Docking dot at the joined node.
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(Math.min(0.25, radius * 0.4), 16, 12),
          new THREE.MeshBasicMaterial({ color: 0xff4fd8, depthTest: false }),
        );
        dot.renderOrder = 999;
        dot.position.set(dock.at.x, dock.at.y, dock.at.z);
        this.snapGuides.add(dot);
      } else if (drag.startBox) {
        const movingBox = shiftKsaBox(drag.startBox, dEast, dNorth);
        const boxSnap = bestBoxSnap(movingBox, drag.staticBoxes, radius);
        if (boxSnap.east) dEast += boxSnap.east.delta;
        if (boxSnap.north) dNorth += boxSnap.north.delta;
        if (boxSnap.east || boxSnap.north) this.lastSnapKind = 'box';
        // Guide lines on the ground plane at the snapped edge/center
        // (KSA frame: x=up, y=east, z=north).
        const snapped = shiftKsaBox(drag.startBox, dEast, dNorth);
        const GUIDE = 0xffd84f;
        if (boxSnap.east) {
          this.guideLine(
            new THREE.Vector3(0.05, boxSnap.east.at, snapped.north[0] - 2),
            new THREE.Vector3(0.05, boxSnap.east.at, snapped.north[1] + 2),
            GUIDE,
          );
        }
        if (boxSnap.north) {
          this.guideLine(
            new THREE.Vector3(0.05, snapped.east[0] - 2, boxSnap.north.at),
            new THREE.Vector3(0.05, snapped.east[1] + 2, boxSnap.north.at),
            GUIDE,
          );
        }
      }
    }
    this.viewport.invalidate();

    const updates = new Map<string, Transform>();
    for (const [id, start] of drag.starts) {
      updates.set(id, {
        ...start,
        position: {
          x: start.position.x + dUp,
          y: start.position.y + dEast,
          z: start.position.z + dNorth,
        },
      });
    }
    setPlacementTransformsBatch(updates);
  };

  /** Debug/tests: what the LAST body-drag move snapped with (null = no snap). */
  private lastSnapKind: 'connector' | 'box' | null = null;
  debugLastSnapKind(): 'connector' | 'box' | null {
    return this.lastSnapKind;
  }

  private readonly onBodyDragUp = (e: PointerEvent): void => {
    const drag = this.bodyDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.bodyDrag = null;
    this.clearSnapGuides();
    this.viewport.controls.enabled = true;
    this.selectionMgr.setSuppressed(false);
    if (drag.moved) {
      endGesture();
      this.reconcile(); // converge meshes to the doc
      this.applySelection(); // re-center the pivot on the new position
      this.viewport.invalidate();
    }
  };

  /** Debug/tests: the pivot's world position projected to canvas pixels. */
  debugPivotScreen(): { x: number; y: number; visible: boolean } {
    const world = new THREE.Vector3();
    this.pivot.updateMatrixWorld(true);
    world.setFromMatrixPosition(this.pivot.matrixWorld);
    const ndc = world.clone().project(this.viewport.camera);
    const el = this.viewport.renderer.domElement;
    return {
      x: ((ndc.x + 1) / 2) * el.clientWidth,
      y: ((1 - ndc.y) / 2) * el.clientHeight,
      visible: this.gizmoOnPivot,
    };
  }

  /** Debug/tests: gizmo hover axis. */
  debugHoveredAxis(): string | null {
    return this.gizmo.hoveredAxis;
  }

  /** Debug/tests: what a click at client coords resolves to. */
  debugPickAt(clientX: number, clientY: number): unknown {
    return this.selectionMgr.pickAt(clientX, clientY);
  }

  /**
   * Debug/tests: the RENDERED mesh's world position (three space) for a
   * placement — what the user actually sees, as opposed to the document.
   */
  debugMeshWorld(instanceId: string): { x: number; y: number; z: number } | null {
    const obj = this.objects.get(instanceId);
    if (!obj) return null;
    obj.group.updateMatrixWorld(true);
    const v = new THREE.Vector3().setFromMatrixPosition(obj.group.matrixWorld);
    return { x: v.x, y: v.y, z: v.z };
  }

  /** Escape ladder rung: cancel an in-flight gizmo OR body drag. */
  cancelDrag(): boolean {
    if (this.gizmo.isDragging) {
      this.gizmo.cancelDrag();
      return true;
    }
    const drag = this.bodyDrag;
    if (drag) {
      // Restore the grabbed transforms, then close the gesture.
      for (const [id, start] of drag.starts) setPlacementTransform(id, start);
      this.bodyDrag = null;
      this.clearSnapGuides();
      this.viewport.controls.enabled = true;
      this.selectionMgr.setSuppressed(false);
      if (drag.moved) endGesture();
      return true;
    }
    return false;
  }

  dispose(): void {
    this.disposed = true;
    this.unbindBodyDrag();
    for (const unsub of this.unsubs) unsub();
    for (const obj of this.objects.values()) obj.dispose();
    this.objects.clear();
    this.gizmo.dispose();
    this.selectionMgr.dispose();
    this.colliderVis.dispose();
    this.ghosts.dispose();
    this.footprints.dispose();
    this.ground.dispose();
    this.viewport.dispose();
  }
}
