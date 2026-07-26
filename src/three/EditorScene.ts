import * as THREE from 'three'
import type { ReadableAtom } from 'nanostores'
import { Viewport } from './Viewport'
import { SubPartObject } from './SubPartObject'
import { ConnectorObject } from './ConnectorObject'
import { ColliderObject } from './ColliderObject'
import { IvaSeatObject } from './IvaSeatObject'
import { collectWorldPoints } from './samplePoints'
import { fitCollider, IDENTITY_QUAT, type Quat } from '../ksa/colliderFit'
import {
  $colliderFitRequest,
  $colliderSettings,
  $coverageReport,
  $coverageRequest,
  setCoverageReport,
  type ColliderFitRequest,
} from '../state/colliderStore'
import {
  $ivaSeatAimRequest,
  clearIvaSeatAimRequest,
  type IvaSeatAimRequest,
} from '../state/ivaSeatStore'
import { $seatView, exitSeatView } from '../state/ivaStore'
import { SEAT_LOCAL_UP, seatAxesFromRotation, seatRotationFromAxes } from '../ksa/ivaSeatAxes'
import { evaluateCoverage, type PlacedCollider } from '../measure/colliderCoverage'
import { KittenObject } from './KittenObject'
import { SelectionManager } from './SelectionManager'
import { TransformGizmo } from './TransformGizmo'
import { MeasurementLayer } from './MeasurementLayer'
import { ContainerLayer } from './ContainerLayer'
import { NozzleHandleObject } from './NozzleHandleObject'
import {
  colliderLocalFromWorld,
  colliderWorld,
  matrixFromTransform,
  readPlacementTransform,
  transformFromMatrix,
} from './coords'
import {
  centroidOf,
  rotatedAroundOriginTransform,
  scaledAroundOriginTransform,
  scaledInPlaceTransform,
  translatedTransform,
} from './bulkTransform'
import { initTextureSupport } from './textureSupport'
import type { CatalogSubPart } from '../ksa/catalog'
import type { EditingPart, PartCollider, SubPartPlacement, Transform, Vec3 } from '../ksa/types'
import {
  $bulkScaleMode,
  $part,
  $selectedColliderIndices,
  $selectedConnectorIndices,
  $selectedIndices,
  $selectedIvaSeatIndices,
  $selectedKittenIndices,
  $snap,
  $toolMode,
  aimIvaSeat,
  clearSelection,
  pushUndo,
  revealEntity,
  addCollider,
  selectCollider,
  selectConnector,
  selectIvaSeat,
  updateColliderTransform,
  selectKitten,
  selectPlacement,
  selectedTransformRefs,
  toggleEntity,
  updateNozzle,
  updateSelectedTransform,
  updateSelectedTransforms,
  type SelectedTransformRef,
} from '../state/editorStore'
import { $catalogIndex, $customCatalog } from '../state/catalogStore'
import {
  $activeMeasurementId,
  $measureTool,
  addMeasurement,
  removeMeasurement,
  setActiveMeasurement,
  setMeasureTool,
  updateMeasurement,
} from '../state/measurementStore'
import { $activeContainerId, setActiveContainer } from '../state/containerStore'
import {
  $activeAnimationId,
  $activeJointId,
  $animPreviewU,
  $animScrubbing,
  $editKeyframeId,
  moveJointPivot,
  reorientJointPivot,
  setJointPose,
} from '../state/animationStore'
import { jointWorld, previewOverrideMatrix } from '../ksa/animationRig'
import type { DeLavalNozzle, PartAnimation } from '../ksa/types'
import { $inspectorMode } from '../state/uiStore'
import {
  $activeEngineTemplateId,
  $activeEngineInstanceId,
  $engineExhaustGizmo,
  $resolvedEngineInstanceId,
} from '../state/engineStore'
import {
  $connectorSettings,
  $ivaSeatSettings,
  $selectionHighlight,
  type ConnectorSettings,
  type IvaSeatSettings,
} from '../state/settingsStore'
import { $cameraRestore, $cameraSnap, $grids } from '../state/viewStore'
import { $layerView, isLayerLocked, isLayerVisible, layerViewState } from '../state/layerStore'

/** A highlightable scene entity — both SubPartObject and ConnectorObject match. */
interface SelectableObject {
  readonly group: THREE.Group
  setSelected(selected: boolean): void
}

/**
 * Owns the three.js {@link Viewport} and keeps the rendered scene in sync with
 * the editor store. This is the ONLY place that mutates scene objects from
 * state: it subscribes to `$part` (and the catalog index) and reconciles a
 * Map<instanceId, SubPartObject>. SubPart geometry loads asynchronously, so
 * builds are guarded against placements that were removed mid-load.
 *
 * Selection highlight and transform gizmos attach here in Phase 6.
 *
 * RENDERING IS ON-DEMAND. The viewport draws only when invalidated, so every
 * store subscription goes through {@link sub} (which invalidates for you) and
 * every async build invalidates when it lands. Subscribing directly would leave
 * the change invisible until something else happened to trigger a frame.
 */
export class EditorScene {
  readonly viewport: Viewport
  private readonly root = new THREE.Group()
  private readonly objects = new Map<string, SubPartObject>()
  private readonly connectorObjects = new Map<string, ConnectorObject>()
  private readonly kittenObjects = new Map<string, KittenObject>()
  /**
   * Collider visuals, keyed by collider id. An ARRAY per collider because a SubPart-owned
   * one is drawn once per PLACEMENT of its template — KSA has no per-instance collider, so
   * every instance really does carry the same shape (see scope/colliders.md §4). A
   * part-level collider always has exactly one entry.
   */
  private readonly colliderObjects = new Map<string, ColliderObject[]>()
  /**
   * Collider id → which of its per-placement visuals the gizmo edits (set by the last
   * click on it; defaults to 0). Only meaningful for a SubPart-owned collider — the one
   * document entity is drawn N times, so a drag has to name the frame it writes back
   * through. Ephemeral view state.
   */
  private readonly colliderInstance = new Map<string, number>()
  /**
   * IVA seat markers, keyed by seat id. ONE visual per seat — a seat is Part-level data
   * (`<IVASeat>` on `<PartGameData>`), so unlike a collider it is never drawn per placement.
   */
  private readonly seatObjects = new Map<string, IvaSeatObject>()
  /** Red dots marking sample points outside every collider (the last coverage check). */
  private coverageDots: THREE.Points | null = null
  private readonly building = new Set<string>()
  private readonly kittenBuilding = new Set<string>()
  private index: Map<string, CatalogSubPart> = new Map()
  private connectorSettings: ConnectorSettings = $connectorSettings.get()
  private ivaSeatSettings: IvaSeatSettings = $ivaSeatSettings.get()
  private readonly unsubscribers: Array<() => void> = []
  private readonly selection: SelectionManager
  private readonly gizmo: TransformGizmo
  private readonly measurements: MeasurementLayer
  private readonly containers: ContainerLayer
  private highlighted: SelectableObject[] = []
  private attachedObject: THREE.Object3D | null = null
  /** Instance ids whose group transform is currently overridden by the animation preview. */
  private animOverridden = new Set<string>()
  /**
   * Empty group the gizmo attaches to when 2+ SubParts are selected. Positioned
   * at the selection centroid with identity rotation/scale; the gizmo drives it
   * and {@link applyBulkFromPivot} fans the delta out to every selected SubPart.
   */
  private readonly pivot = new THREE.Group()
  /** Per-SubPart starting transforms captured at the start of a bulk gizmo drag. */
  private bulkSnapshot: { centroid: Vec3; items: SelectedTransformRef[] } | null = null
  /**
   * Empty group the gizmo attaches to while editing a joint pose. Positioned at the
   * joint's world frame W_J(t) of the edited keyframe; a gizmo drag moves it, and
   * {@link handlePoseGizmoChange} reads it back to the joint's local pose (Part-space
   * since {@link root} is at identity). Takes precedence over the selection gizmo.
   */
  private readonly poseProxy = new THREE.Group()
  /**
   * Always-on marker at the active joint's REST pivot (the rotation anchor) while the
   * Animations editor is open, so it's obvious where attached parts swing from (and that
   * a fresh joint's pivot sits at the origin until moved). Non-pickable, read-only.
   */
  private readonly pivotHelper = new THREE.AxesHelper(0.4)

  /**
   * Engine designer: a marker at the active nozzle's exhaust point (+ direction cone),
   * and an empty proxy the gizmo attaches to so a drag relocates the exhaust LOCATION.
   * Only present while the Engine designer ($inspectorMode==='engine') has an active
   * engine; the gizmo attaches only when {@link $engineExhaustGizmo} is on. Mirrors the
   * pose pivot/proxy pair.
   */
  private engineHandle: NozzleHandleObject | null = null
  private readonly engineProxy = new THREE.Group()

  // Point-to-point measurement picking.
  private readonly raycaster = new THREE.Raycaster()
  private pendingMeasurementId: string | null = null
  private pickPointerDown: { x: number; y: number } | null = null

  // Click-selection is suppressed by several independent modes at once, so each keeps
  // its own flag and {@link applySelectionSuppression} ORs them — a shared boolean would
  // let whichever mode ended last re-enable picking under one that is still active.
  private suppressPickDrag = false
  private suppressPickMeasure = false
  private suppressPickSeatView = false

  constructor(host: HTMLElement) {
    this.viewport = new Viewport(host)
    // Must precede the store subscriptions below (they build SubParts, which
    // request textures through the loader initialized here).
    initTextureSupport(this.viewport.renderer)
    this.root.name = 'flexo-part'
    this.viewport.scene.add(this.root)
    if (import.meta.env.DEV)
      (window as unknown as { __editorScene?: EditorScene }).__editorScene = this
    this.pivot.name = 'bulk-pivot'
    this.root.add(this.pivot)
    this.poseProxy.name = 'pose-proxy'
    this.root.add(this.poseProxy)
    this.pivotHelper.name = 'joint-pivot'
    this.pivotHelper.visible = false
    this.pivotHelper.raycast = () => {} // never selectable / pickable
    this.root.add(this.pivotHelper)
    this.engineProxy.name = 'engine-exhaust-proxy'
    this.root.add(this.engineProxy)

    this.selection = new SelectionManager(
      this.viewport.camera,
      this.viewport.renderer.domElement,
      this.root,
      (selected, additive) => {
        if (!selected) {
          if (!additive) clearSelection()
          return
        }
        setActiveMeasurement(null) // selecting a mesh closes any measurement edit
        if (selected.kind === 'subpart') {
          const placements = $part.get().placements
          const index = placements.findIndex((p) => p.instanceId === selected.id)
          if (index < 0) return
          const layerId = placements[index].layerId
          if (isLayerLocked(layerId)) return
          if (!isLayerVisible(layerId)) return // three.js does not skip invisible objects during raycasting
          if (additive) {
            const added = !$selectedIndices.get().includes(index)
            toggleEntity('subpart', index)
            if (added) revealEntity('subpart', selected.id) // scroll the just-added row into view in the Assets list
          } else {
            selectPlacement(index)
            revealEntity('subpart', selected.id)
          }
        } else if (selected.kind === 'connector') {
          const connectors = $part.get().connectors
          const index = connectors.findIndex((c) => c.id === selected.id)
          if (index < 0) return
          const layerId = connectors[index].layerId
          if (isLayerLocked(layerId)) return
          if (!isLayerVisible(layerId)) return // three.js does not skip invisible objects during raycasting
          if (additive) {
            const added = !$selectedConnectorIndices.get().includes(index)
            toggleEntity('connector', index)
            if (added) revealEntity('connector', selected.id)
          } else {
            selectConnector(index)
            revealEntity('connector', selected.id)
          }
        } else if (selected.kind === 'collider') {
          const colliders = $part.get().colliders
          const index = colliders.findIndex((c) => c.id === selected.id)
          if (index < 0) return
          const layerId = colliders[index].layerId
          if (isLayerLocked(layerId)) return
          if (!isLayerVisible(layerId)) return // three.js does not skip invisible objects during raycasting
          // Remember WHICH visual was clicked so the gizmo edits that instance's frame.
          this.colliderInstance.set(selected.id, selected.instanceIndex ?? 0)
          if (additive) {
            const added = !$selectedColliderIndices.get().includes(index)
            toggleEntity('collider', index)
            if (added) revealEntity('collider', selected.id)
          } else {
            selectCollider(index)
            revealEntity('collider', selected.id)
          }
        } else if (selected.kind === 'ivaSeat') {
          const seats = $part.get().ivaSeats
          const index = seats.findIndex((s) => s.id === selected.id)
          if (index < 0) return
          const layerId = seats[index].layerId
          if (isLayerLocked(layerId)) return
          if (!isLayerVisible(layerId)) return // three.js does not skip invisible objects during raycasting
          if (additive) {
            const added = !$selectedIvaSeatIndices.get().includes(index)
            toggleEntity('ivaSeat', index)
            if (added) revealEntity('ivaSeat', selected.id)
          } else {
            selectIvaSeat(index)
            revealEntity('ivaSeat', selected.id)
          }
        } else {
          const kittens = $part.get().kittens
          const index = kittens.findIndex((k) => k.id === selected.id)
          if (index < 0) return
          const layerId = kittens[index].layerId
          if (isLayerLocked(layerId)) return
          if (!isLayerVisible(layerId)) return // three.js does not skip invisible objects during raycasting
          if (additive) {
            const added = !$selectedKittenIndices.get().includes(index)
            toggleEntity('kitten', index)
            if (added) revealEntity('kitten', selected.id)
          } else {
            selectKitten(index)
            revealEntity('kitten', selected.id)
          }
        }
      },
    )

    this.gizmo = new TransformGizmo(this.viewport, {
      onDragStart: () => {
        // Editing a joint pose: one undo step, no bulk snapshot.
        const pose = this.attachedObject === this.poseProxy ? this.poseEditTarget() : null
        if (pose) {
          const when = pose.kf.timeSec === 0 ? 'rest' : `${pose.kf.timeSec}s`
          pushUndo('pose', `${pose.joint.name} @ ${when}`)
          return
        }
        // Placing a nozzle exhaust: one undo step, no bulk snapshot.
        if (this.attachedObject === this.engineProxy) {
          pushUndo('exhaust', '')
          return
        }
        const mode = $toolMode.get()
        const desc = mode === 'rotate' ? 'rotate' : mode === 'scale' ? 'scale' : 'move'
        const refs = selectedTransformRefs()
        const detail =
          refs.length === 1 ? refs[0].name : refs.length > 1 ? `${refs.length} items` : ''
        pushUndo(desc, detail)
        this.beginBulkDrag()
      },
      onChange: (object) => {
        if (object === this.poseProxy) this.handlePoseGizmoChange()
        else if (object === this.engineProxy) this.handleEngineGizmoChange()
        else this.handleGizmoChange(object)
      },
      onDraggingChanged: (dragging) => {
        this.suppressPickDrag = dragging
        this.applySelectionSuppression()
        if (!dragging) {
          this.endBulkDrag()
          this.updateSelection() // re-snap the pose proxy to the committed pose
        }
      },
    })

    this.measurements = new MeasurementLayer(this.viewport, () =>
      this.selectedObjects().map((o) => o.group),
    )
    this.containers = new ContainerLayer(this.viewport, () =>
      [...this.objects.values()].map((o) => o.group),
    )

    const dom = this.viewport.renderer.domElement
    dom.addEventListener('pointerdown', this.onPickPointerDown)
    dom.addEventListener('pointerup', this.onPickPointerUp)
    this.sub($measureTool, (tool) => {
      const picking = tool !== 'none'
      this.suppressPickMeasure = picking
      this.applySelectionSuppression()
      dom.style.cursor = picking ? 'crosshair' : ''
      if (!picking) this.cancelPendingMeasurement()
    })
    // Editing a measurement, editing a container, and selecting a mesh are all
    // mutually exclusive, so only one gizmo is ever active at a time.
    this.sub($activeMeasurementId, (id) => {
      if (id) {
        clearSelection()
        setActiveContainer(null)
      }
    })
    this.sub($activeContainerId, (id) => {
      if (id) {
        clearSelection()
        setActiveMeasurement(null)
      }
    })
    // Selecting any mesh closes container editing (its gizmo would otherwise fight
    // the selection gizmo).
    const clearContainerOnSelect = () => {
      if (this.selectedObjects().length > 0) setActiveContainer(null)
    }
    this.sub($selectedIndices, clearContainerOnSelect)
    this.sub($selectedConnectorIndices, clearContainerOnSelect)
    this.sub($selectedKittenIndices, clearContainerOnSelect)
    this.sub($selectedColliderIndices, clearContainerOnSelect)
    this.sub($selectedIvaSeatIndices, clearContainerOnSelect)

    // nanostores `subscribe` fires immediately with the current value.
    this.sub($catalogIndex, (index) => {
      this.index = index
      this.reconcile($part.get())
    })
    // A custom template's geometry/texture can change in place (the catalog entry's
    // atlas/diffuse blob URL changes) while its placements keep the same template id.
    // reconcile() never rebuilds existing objects, so dispose the affected ones and
    // let reconcile re-create them from the fresh entry.
    this.sub($customCatalog, (custom) => {
      const customIds = new Set(custom.map((c) => c.id))
      const part = $part.get()
      for (const [id, obj] of this.objects) {
        const placement = part.placements.find((p) => p.instanceId === id)
        if (placement && customIds.has(placement.subPartTemplateId)) {
          this.root.remove(obj.group)
          obj.dispose()
          this.objects.delete(id)
        }
      }
      this.index = $catalogIndex.get()
      this.reconcile(part)
    })
    this.sub($part, (part) => this.reconcile(part))
    // Animation preview: re-apply the joint-driven transform override when the active
    // animation, scrub position, or edited keyframe changes ($part changes already
    // re-apply via reconcile). Fires immediately on subscribe (harmless no-op at rest).
    const onPreviewChange = () => {
      this.applyAnimationPreview()
      this.updateSelection() // re-evaluate gizmo suppression for posed animated parts
    }
    this.sub($activeAnimationId, onPreviewChange)
    this.sub($activeJointId, onPreviewChange)
    this.sub($animPreviewU, onPreviewChange)
    this.sub($animScrubbing, onPreviewChange)
    this.sub($editKeyframeId, onPreviewChange)
    // Leaving/entering the Animation editor toggles the preview + pose gizmo on/off.
    this.sub($inspectorMode, onPreviewChange)
    // Engine designer: refresh the exhaust marker + (re)attach the exhaust gizmo when
    // the active engine / target instance / gizmo toggle / mode changes.
    const onEngineChange = () => {
      this.applyEngineHandle()
      this.updateSelection()
    }
    this.sub($activeEngineTemplateId, onEngineChange)
    this.sub($activeEngineInstanceId, onEngineChange)
    this.sub($engineExhaustGizmo, onEngineChange)
    this.sub($inspectorMode, onEngineChange)
    this.sub($selectedIndices, () => this.updateSelection())
    this.sub($selectedConnectorIndices, () => this.updateSelection())
    this.sub($selectedKittenIndices, () => this.updateSelection())
    this.sub($selectedColliderIndices, () => this.updateSelection())
    this.sub($selectedIvaSeatIndices, () => this.updateSelection())
    // Collider fitting needs world geometry, which only exists here — the UI publishes an
    // intent and this consumes it (see colliderStore).
    this.sub($colliderFitRequest, (req) => {
      if (req) this.handleColliderFit(req)
    })
    this.sub($coverageRequest, (wanted) => {
      if (wanted) this.handleCoverageCheck()
    })
    // The uncovered-point dots are a snapshot of one check; editing invalidates them.
    this.sub($coverageReport, () => this.applyCoverageDots())
    // Aiming a seat needs the world-space centroid of the selection, which only exists
    // here — same intent → scene → store round trip as the collider fit (see ivaSeatStore).
    this.sub($ivaSeatAimRequest, (req) => {
      if (req) this.handleIvaSeatAim(req)
    })
    // Sitting in a seat: resolve the previewed seat id against the document and hand the
    // pose to the viewport (reconcile does the same on every document change, so a moved
    // or deleted seat is picked up there).
    this.sub($seatView, () => this.applySeatView())
    this.sub($connectorSettings, (settings) => {
      this.connectorSettings = settings
      this.rebuildConnectors()
    })
    // Marker size / gaze cone are global view settings, not document data: the markers
    // have no in-place resize, so a change rebuilds them (as $connectorSettings does).
    this.sub($ivaSeatSettings, (settings) => {
      this.ivaSeatSettings = settings
      this.rebuildIvaSeats()
    })
    // Re-apply the highlight tint to the current selection when the color/strength
    // setting changes (fires immediately on subscribe — a harmless no-op when nothing
    // is selected).
    this.sub($selectionHighlight, () => this.updateSelection())
    this.sub($layerView, () => this.applyLayerView())
    this.sub($toolMode, (mode) => this.gizmo.setMode(mode))
    this.sub($snap, (snap) => this.gizmo.setSnap(snap))
    this.sub($grids, (grids) => this.viewport.grids.setConfig(grids))
    this.sub($cameraSnap, (cmd) => {
      if (cmd) this.viewport.snapCamera(cmd.dir)
    })
    this.sub($cameraRestore, (cmd) => {
      if (cmd) this.viewport.restoreCamera(cmd.state)
    })
  }

  /**
   * Subscribes to a store, tracks the unsubscribe, and redraws once the callback
   * has run.
   *
   * Every subscription in this class exists to mutate the scene, and the viewport
   * only draws when asked ({@link RenderLoop}) — so invalidating here, in one
   * place, is what keeps "the state changed" and "the viewport shows it" from
   * drifting apart. Use this for ALL store subscriptions; a bare `.subscribe()`
   * would leave its change on screen only by luck.
   */
  private sub<T>(store: ReadableAtom<T>, run: (value: T) => void): void {
    this.unsubscribers.push(
      store.subscribe((value) => {
        run(value)
        this.viewport.invalidate()
      }),
    )
  }

  /** Returns the scene object for a placed instance, if built. */
  getObject(instanceId: string): SubPartObject | undefined {
    return this.objects.get(instanceId)
  }

  private reconcile(part: EditingPart): void {
    const wanted = new Set(part.placements.map((p) => p.instanceId))

    // Remove objects whose placement is gone.
    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.root.remove(obj.group)
        obj.dispose()
        this.objects.delete(id)
      }
    }

    // Add new objects; update transforms of existing ones.
    for (const placement of part.placements) {
      const existing = this.objects.get(placement.instanceId)
      if (existing) {
        existing.setPlacement(placement)
        continue
      }
      if (this.building.has(placement.instanceId)) continue

      const entry = this.index.get(placement.subPartTemplateId)
      if (!entry) continue // catalog not ready or unknown template

      this.building.add(placement.instanceId)
      void SubPartObject.create(entry, placement)
        .then((obj) => {
          this.building.delete(placement.instanceId)
          const latest = $part.get().placements.find((p) => p.instanceId === placement.instanceId)
          if (!latest) {
            obj.dispose() // removed while loading
            return
          }
          obj.setPlacement(latest)
          this.root.add(obj.group)
          this.objects.set(placement.instanceId, obj)
          this.applyLayerView() // respect the layer's visibility + opacity for the new object
          this.updateSelection() // highlight/attach if this is the selected one
          this.applyAnimationPreview() // re-apply if this object is animation-driven
          this.viewport.invalidate() // geometry landed after the store change that asked for it
        })
        .catch((err) => {
          this.building.delete(placement.instanceId)
          console.warn(`EditorScene: failed to build '${placement.instanceId}'`, err)
        })
    }

    this.reconcileConnectors(part)
    this.reconcileColliders(part)
    this.reconcileIvaSeats(part)
    this.reconcileKittens(part)
    this.applyLayerView()
    this.updateSelection()
    this.applyAnimationPreview()
    this.applyEngineHandle()
    // Last: the previewed seat may have moved, been re-aimed, or vanished with this change.
    this.applySeatView()
  }

  /**
   * Keeps the IVA seat preview in sync with the document (plans/IVA_PLAN.md §3.6).
   *
   * `$seatView` names a seat by ID, so this is where it becomes a pose — and where a
   * previewed seat that no longer exists (deleted, or the whole project swapped) exits
   * cleanly instead of leaving the camera parked on a stale eye point.
   *
   * While seated, three things are suppressed: the transform gizmo (nothing to drag from
   * inside a seat, and the gizmo would be drawn at the camera), click-selection, and the
   * seat markers — you are INSIDE the marker you sat in, so it would fill the screen.
   */
  private applySeatView(): void {
    const seatId = $seatView.get()
    const seat = seatId ? $part.get().ivaSeats.find((s) => s.id === seatId) : undefined
    if (seatId && !seat) {
      // Re-enters through the $seatView subscription with a null id, which tears down.
      exitSeatView()
      return
    }
    if (seat) {
      const { forward, up } = seatAxesFromRotation(seat.rotation)
      this.viewport.enterSeatView({ position: seat.position, forward, up })
    } else {
      this.viewport.exitSeatView()
    }
    this.suppressPickSeatView = seat != null
    this.applySelectionSuppression()
    this.applyLayerView() // shows/hides the seat markers
    this.updateSelection() // attaches/detaches the gizmo
  }

  /** Applies the OR of every reason click-selection is currently off. */
  private applySelectionSuppression(): void {
    this.selection.setSuppressed(
      this.suppressPickDrag || this.suppressPickMeasure || this.suppressPickSeatView,
    )
  }

  /**
   * Drives the active animation's attached SubParts to the previewed pose in the
   * viewport (editor-only; never mutates the document). The effective time is the
   * edited keyframe's time when posing, else the scrub slider mapped to [0,duration].
   * Each attached SubPart's group matrix is set to W_J(t)·W_J(0)⁻¹·placement (the same
   * transform KSA will render); everything else stays at its static placement.
   *
   * Reconcile resets every group to its placement first (via setPlacement), so this
   * just overlays the overrides on top; previously-overridden ids are reverted when
   * the animation changes/clears.
   */
  /** True when the preview shows a posed (non-rest) frame: editing a keyframe, or scrubbing past 0. */
  private isPreviewPosed(): boolean {
    if ($inspectorMode.get() !== 'anim') return false
    if ($editKeyframeId.get()) return true
    return $animScrubbing.get() && $animPreviewU.get() > 1e-6
  }

  /** True when any selected SubPart is attached to a joint of the active animation. */
  private selectedIsAnimated(): boolean {
    const animId = $activeAnimationId.get()
    const part = $part.get()
    const anim = animId ? part.animations.find((a) => a.id === animId) : null
    if (!anim) return false
    const members = new Set<string>()
    for (const j of anim.joints) for (const id of j.memberInstanceIds) members.add(id)
    if ($selectedIndices.get().some((i) => members.has(part.placements[i]?.instanceId ?? '')))
      return true
    // A SubPart-owned collider rides its instance, so while a POSED frame is shown its
    // gizmo would write back through the posed (not modeled) frame — lock it too.
    return $selectedColliderIndices.get().some((i) => {
      const owner = part.colliders[i]?.ownerTemplateId
      if (!owner) return false
      return part.placements.some((p) => p.subPartTemplateId === owner && members.has(p.instanceId))
    })
  }

  private applyAnimationPreview(): void {
    const part = $part.get()
    const byId = new Map(part.placements.map((p) => [p.instanceId, p]))
    // Revert last round's overrides to their static placement.
    for (const id of this.animOverridden) {
      const obj = this.objects.get(id)
      const placement = byId.get(id)
      if (obj && placement) obj.setPlacement(placement)
    }
    this.animOverridden.clear()

    // Preview only runs while the Animation editor is open (its atoms persist across
    // inspector mode switches); in assets mode parts show their static placements.
    const animId = $inspectorMode.get() === 'anim' ? $activeAnimationId.get() : null
    const anim = animId ? part.animations.find((a) => a.id === animId) : null
    if (!anim) {
      this.positionColliders(part) // back to static frames
      return
    }
    const editKf = $editKeyframeId.get()
    // Override only while actively posing a keyframe or dragging the scrubber; otherwise
    // SubParts rest at their static modeled placement (an imported deploy clip's rest is
    // its DEPLOYED last keyframe, so this keeps it shown deployed until you scrub).
    if (!editKf && !$animScrubbing.get()) {
      this.positionColliders(part)
      return
    }
    const posed = new Map<string, Transform>()
    const pinned = editKf ? anim.keyframes.find((k) => k.id === editKf) : null
    const u = Math.min(1, Math.max(0, $animPreviewU.get()))
    const t = pinned ? pinned.timeSec : u * anim.durationSec

    for (const joint of anim.joints) {
      for (const instId of joint.memberInstanceIds) {
        const obj = this.objects.get(instId)
        const placement = byId.get(instId)
        if (!obj || !placement) continue
        const m = previewOverrideMatrix(anim, instId, t, placement)
        if (!m) continue
        m.decompose(obj.group.position, obj.group.quaternion, obj.group.scale)
        this.animOverridden.add(instId)
        posed.set(instId, transformFromMatrix(m))
      }
    }
    // A SubPart-owned collider rides its instance, so it must follow the pose too.
    this.positionColliders(part, posed)
  }

  /** Builds/updates/removes kitten visual aides (async, like SubParts). */
  private reconcileKittens(part: EditingPart): void {
    const wanted = new Set(part.kittens.map((k) => k.id))
    for (const [id, obj] of this.kittenObjects) {
      if (!wanted.has(id)) {
        this.root.remove(obj.group)
        obj.dispose()
        this.kittenObjects.delete(id)
      }
    }
    for (const kitten of part.kittens) {
      const existing = this.kittenObjects.get(kitten.id)
      if (existing) {
        existing.setInstance(kitten)
        continue
      }
      if (this.kittenBuilding.has(kitten.id)) continue
      this.kittenBuilding.add(kitten.id)
      void KittenObject.create(kitten.kind, kitten)
        .then((obj) => {
          this.kittenBuilding.delete(kitten.id)
          const latest = $part.get().kittens.find((k) => k.id === kitten.id)
          if (!latest || latest.kind !== kitten.kind) {
            obj.dispose() // removed or changed kind while loading
            return
          }
          obj.setInstance(latest)
          this.root.add(obj.group)
          this.kittenObjects.set(kitten.id, obj)
          this.applyLayerView()
          this.updateSelection()
          this.viewport.invalidate() // as above: the build landed after its store change
        })
        .catch((err) => {
          this.kittenBuilding.delete(kitten.id)
          console.warn(`EditorScene: failed to build kitten '${kitten.id}'`, err)
        })
    }
  }

  /**
   * Applies each layer's view state (from `$layerView`) to its built entities:
   * visibility (eye toggle) and opacity (fade slider). Note: three.js does NOT skip
   * invisible objects during raycasting, so the `onSelect` callback guards against
   * hidden/non-active-layer hits explicitly.
   */
  private applyLayerView(): void {
    const part = $part.get()
    const view = $layerView.get()
    for (const p of part.placements) {
      const obj = this.objects.get(p.instanceId)
      if (obj) {
        const lv = layerViewState(view, p.layerId)
        obj.group.visible = lv.visible
        obj.setLayerOpacity(lv.opacity)
      }
    }
    for (const c of part.connectors) {
      const obj = this.connectorObjects.get(c.id)
      if (obj) {
        const lv = layerViewState(view, c.layerId)
        obj.group.visible = lv.visible
        obj.setLayerOpacity(lv.opacity)
      }
    }
    for (const c of part.colliders) {
      const lv = layerViewState(view, c.layerId)
      for (const obj of this.colliderObjects.get(c.id) ?? []) {
        obj.group.visible = lv.visible
        obj.setLayerOpacity(lv.opacity)
      }
    }
    // Every seat marker is hidden while sitting in one: the camera is inside the marker
    // it sat in (it would fill the screen), and the others are eye points, not scenery.
    const inSeatView = $seatView.get() !== null
    for (const s of part.ivaSeats) {
      const obj = this.seatObjects.get(s.id)
      if (obj) {
        const lv = layerViewState(view, s.layerId)
        obj.group.visible = lv.visible && !inSeatView
        obj.setLayerOpacity(lv.opacity)
      }
    }
    for (const k of part.kittens) {
      const obj = this.kittenObjects.get(k.id)
      if (obj) {
        const lv = layerViewState(view, k.layerId)
        obj.group.visible = lv.visible
        obj.setLayerOpacity(lv.opacity)
      }
    }
  }

  /** Connectors build synchronously (cube + arrow), so reconciliation is simple. */
  private reconcileConnectors(part: EditingPart): void {
    const wanted = new Set(part.connectors.map((c) => c.id))
    for (const [id, obj] of this.connectorObjects) {
      if (!wanted.has(id)) {
        this.root.remove(obj.group)
        obj.dispose()
        this.connectorObjects.delete(id)
      }
    }
    for (const connector of part.connectors) {
      const existing = this.connectorObjects.get(connector.id)
      if (existing) {
        existing.setConnector(connector)
        continue
      }
      const obj = new ConnectorObject(connector, this.connectorSettings.size)
      this.root.add(obj.group)
      this.connectorObjects.set(connector.id, obj)
    }
  }

  /**
   * IVA seat markers build synchronously (sphere + cone + stick), and a seat is Part-level
   * data with exactly one visual — so this is the connector reconcile, not the collider one.
   */
  private reconcileIvaSeats(part: EditingPart): void {
    const wanted = new Set(part.ivaSeats.map((s) => s.id))
    for (const [id, obj] of this.seatObjects) {
      if (!wanted.has(id)) {
        this.root.remove(obj.group)
        obj.dispose()
        this.seatObjects.delete(id)
      }
    }
    for (const seat of part.ivaSeats) {
      const existing = this.seatObjects.get(seat.id)
      if (existing) {
        existing.setSeat(seat)
        continue
      }
      const obj = new IvaSeatObject(
        seat,
        this.ivaSeatSettings.markerSize,
        this.ivaSeatSettings.showGazeCone,
      )
      this.root.add(obj.group)
      this.seatObjects.set(seat.id, obj)
    }
  }

  /**
   * Colliders build synchronously (unit wireframe + fill). A SubPart-owned collider gets
   * ONE visual per placement of its owning template, positioned exactly as KSA composes it
   * ({@link colliderWorld}); a part-level one gets a single visual in the Part frame.
   */
  private reconcileColliders(part: EditingPart): void {
    const wanted = new Set(part.colliders.map((c) => c.id))
    for (const [id, objs] of this.colliderObjects) {
      if (wanted.has(id)) continue
      for (const obj of objs) {
        this.root.remove(obj.group)
        obj.dispose()
      }
      this.colliderObjects.delete(id)
    }

    for (const collider of part.colliders) {
      const wanted = this.colliderOwners(part, collider).length || 1
      let objs = this.colliderObjects.get(collider.id)
      if (!objs) {
        objs = []
        this.colliderObjects.set(collider.id, objs)
      }
      while (objs.length > wanted) {
        const obj = objs.pop()!
        this.root.remove(obj.group)
        obj.dispose()
      }
      while (objs.length < wanted) {
        const obj = new ColliderObject(collider, objs.length)
        this.root.add(obj.group)
        objs.push(obj)
      }
    }
    this.positionColliders(part)
  }

  /**
   * Placements a collider's visuals ride on. Empty for a part-level collider — and also
   * for one whose owner template is no longer placed, which then renders once in the Part
   * frame so it can be found and re-homed rather than silently vanishing (validation
   * flags it as dead data).
   */
  private colliderOwners(part: EditingPart, collider: PartCollider): SubPartPlacement[] {
    if (!collider.ownerTemplateId) return []
    return part.placements.filter((p) => p.subPartTemplateId === collider.ownerTemplateId)
  }

  /**
   * Positions every collider visual. `posed` supplies the ANIMATED transform of an
   * instance when the animation preview is showing a non-rest frame — SubPart-owned
   * colliders follow joint animation in-game (`KeyframeAnimationModule` flags
   * `NeedsColliderUpdate` and `ConstraintSim` rebuilds the compound), so the editor shows
   * the same thing. An empty/absent map means "everything at its static placement".
   */
  private positionColliders(part: EditingPart, posed?: ReadonlyMap<string, Transform>): void {
    for (const collider of part.colliders) {
      const objs = this.colliderObjects.get(collider.id)
      if (!objs) continue
      const owners = this.colliderOwners(part, collider)
      if (owners.length === 0) {
        objs[0]?.setCollider(collider)
        continue
      }
      for (let i = 0; i < owners.length && i < objs.length; i++) {
        const frame = posed?.get(owners[i].instanceId) ?? owners[i]
        objs[i].setCollider(collider, colliderWorld(collider, frame))
      }
    }
  }

  /**
   * Scores the current collision volume against the part's sampled geometry and publishes
   * the report (which also drives the uncovered-point dots). Runs here rather than in the
   * store because both halves — the geometry sample and the owner-frame resolution — need
   * the scene.
   */
  private handleCoverageCheck(): void {
    $coverageRequest.set(false)
    const part = $part.get()
    const points = collectWorldPoints(
      [...this.objects.values()].map((o) => o.group),
      $colliderSettings.get().precision,
    )
    // Every collider, lifted into Part space — a SubPart-owned one is scored once per
    // placement of its template, exactly as it exists in-game.
    const placed: PlacedCollider[] = []
    for (const collider of part.colliders) {
      const owners = this.colliderOwners(part, collider)
      const frames: Transform[] =
        owners.length > 0 ? owners.map((o) => colliderWorld(collider, o)) : [collider]
      for (const f of frames) {
        // Through coords.matrixFromTransform so the Euler convention stays in one place.
        const q = new THREE.Quaternion()
        matrixFromTransform(f).decompose(new THREE.Vector3(), q, new THREE.Vector3())
        placed.push({ collider, position: { ...f.position }, quaternion: [q.x, q.y, q.z, q.w] })
      }
    }
    setCoverageReport(evaluateCoverage(points, placed))
  }

  /** Draws (or clears) the uncovered sample points from the latest coverage report. */
  private applyCoverageDots(): void {
    const report = $coverageReport.get()
    const points = report?.uncovered ?? []
    if (points.length === 0) {
      if (this.coverageDots) {
        this.root.remove(this.coverageDots)
        this.coverageDots.geometry.dispose()
        ;(this.coverageDots.material as THREE.Material).dispose()
        this.coverageDots = null
      }
      return
    }
    const positions = new Float32Array(points.length * 3)
    points.forEach((p, i) => {
      positions[i * 3] = p.x
      positions[i * 3 + 1] = p.y
      positions[i * 3 + 2] = p.z
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    if (this.coverageDots) {
      this.coverageDots.geometry.dispose()
      this.coverageDots.geometry = geometry
      return
    }
    const dots = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xff3355, size: 6, sizeAttenuation: false }),
    )
    dots.name = 'collider-coverage-gaps'
    dots.raycast = () => {} // a readout, never selectable
    this.coverageDots = dots
    this.root.add(dots)
  }

  /**
   * Runs a pending collider fit: samples the requested geometry, fits the primitive in the
   * chosen frame (the pure {@link fitCollider}), and writes it back through the store.
   * Clears the request either way so a repeated identical fit still fires.
   */
  private handleColliderFit(req: ColliderFitRequest): void {
    $colliderFitRequest.set(null)
    const settings = $colliderSettings.get()
    const part = $part.get()

    // "Fit to selection" means the selected MESHES; with nothing selected (or when the
    // caller asked for it) fall back to the whole part — an empty part fits nothing.
    const selected = req.useSelection
      ? $selectedIndices.get().flatMap((i) => {
          const obj = part.placements[i] && this.objects.get(part.placements[i].instanceId)
          return obj ? [obj.group] : []
        })
      : []
    const targets = selected.length > 0 ? selected : [...this.objects.values()].map((o) => o.group)
    const points = collectWorldPoints(targets, settings.precision)
    if (points.length === 0) {
      console.warn('flexo: nothing to fit a collider to (no geometry loaded yet?)')
      return
    }

    // Orient to the LAST selected placement so a tilted tank gets a tilted cylinder.
    const frameSource = selected.length > 0 ? selected[selected.length - 1] : null
    let frame: Quat = IDENTITY_QUAT
    if (settings.orientToSelection && frameSource) {
      const q = frameSource.getWorldQuaternion(new THREE.Quaternion())
      frame = [q.x, q.y, q.z, q.w]
    }

    const fit = fitCollider(req.shape, points, frame, settings.margin)
    if (!fit) return
    // Quaternion → KSA Euler goes through coords.ts, the one sanctioned place.
    const transform = transformFromMatrix(
      new THREE.Matrix4().compose(
        new THREE.Vector3(fit.position.x, fit.position.y, fit.position.z),
        new THREE.Quaternion(...fit.quaternion),
        new THREE.Vector3(fit.size.x, fit.size.y, fit.size.z),
      ),
    )

    if (req.target.kind === 'new') {
      addCollider(req.shape, transform)
      return
    }
    const existing = part.colliders[req.target.index]
    if (!existing) return
    // Refit keeps the collider's id and owner; a SubPart-owned one must come back into
    // its template's local frame or it would jump by the placement transform.
    const owner = existing.ownerTemplateId
      ? part.placements.find((p) => p.subPartTemplateId === existing.ownerTemplateId)
      : undefined
    const local = owner ? colliderLocalFromWorld(transform, owner) : transform
    pushUndo('fit collider', existing.id)
    updateColliderTransform(req.target.index, local)
  }

  /**
   * Runs a pending "aim at selection": points the seat's forward axis at the world-space
   * centroid of the selected placements and writes the resulting rotation back through
   * {@link aimIvaSeat} (which owns the single undo step). Clears the request either way so
   * a repeated identical aim still fires.
   *
   * With nothing selected — which is the norm, since selecting a seat clears the SubPart
   * selection — the whole part's geometry is the target, the same fallback
   * {@link handleColliderFit} uses.
   */
  private handleIvaSeatAim(req: IvaSeatAimRequest): void {
    clearIvaSeatAimRequest()
    const part = $part.get()
    const seat = part.ivaSeats[req.index]
    if (!seat) return

    const centroid = this.selectedGeometryCentroid()
    if (!centroid) {
      console.warn('flexo: nothing to aim an IVA seat at (no geometry loaded yet?)')
      return
    }
    const forward = {
      x: centroid.x - seat.position.x,
      y: centroid.y - seat.position.y,
      z: centroid.z - seat.position.z,
    }
    // Keep the seat's current up where it survives the new forward, so re-aiming doesn't
    // silently roll the camera; otherwise take a default that is not parallel to forward.
    const current = req.keepUp ? seatAxesFromRotation(seat.rotation).up : null
    const up = current && !isParallel(forward, current) ? current : perpendicularUp(forward)
    // Degenerate (seat sitting exactly on the centroid, or an unusable up): do NOTHING
    // rather than store a NaN rotation — that is what the null return is for.
    const rotation = seatRotationFromAxes(forward, up)
    if (!rotation) return
    aimIvaSeat(req.index, rotation)
  }

  /**
   * World-space centroid of the selected SubPart placements' geometry (their bounding-box
   * centers, averaged), falling back to every built SubPart when nothing is selected.
   * Null when the part has no built geometry at all.
   *
   * Reads the SCENE, not the store — which is exactly why aiming is an intent atom the
   * scene consumes rather than a store action (see ivaSeatStore).
   */
  private selectedGeometryCentroid(): Vec3 | null {
    const part = $part.get()
    const selected = $selectedIndices.get().flatMap((i) => {
      const obj = part.placements[i] && this.objects.get(part.placements[i].instanceId)
      return obj ? [obj.group] : []
    })
    const groups = selected.length > 0 ? selected : [...this.objects.values()].map((o) => o.group)
    const centers: Vec3[] = []
    const box = new THREE.Box3()
    const center = new THREE.Vector3()
    for (const group of groups) {
      box.setFromObject(group)
      if (box.isEmpty()) continue
      box.getCenter(center)
      centers.push({ x: center.x, y: center.y, z: center.z })
    }
    return centers.length > 0 ? centroidOf(centers) : null
  }

  /** Rebuilds every connector from scratch (cube/arrow sizes are global settings). */
  private rebuildConnectors(): void {
    for (const obj of this.connectorObjects.values()) {
      this.root.remove(obj.group)
      obj.dispose()
    }
    this.connectorObjects.clear()
    this.reconcileConnectors($part.get())
    this.applyLayerView()
    this.updateSelection()
  }

  /** Rebuilds every seat marker from scratch (marker size / gaze cone are global settings). */
  private rebuildIvaSeats(): void {
    for (const obj of this.seatObjects.values()) {
      this.root.remove(obj.group)
      obj.dispose()
    }
    this.seatObjects.clear()
    this.reconcileIvaSeats($part.get())
    this.applyLayerView()
    this.updateSelection()
  }

  /** Resolves all currently selected scene objects (SubParts + connectors + colliders + seats + kittens) that are built. */
  private selectedObjects(): SelectableObject[] {
    const part = $part.get()
    const out: SelectableObject[] = []
    for (const i of $selectedIndices.get()) {
      const placement = part.placements[i]
      const obj = placement && this.objects.get(placement.instanceId)
      if (obj) out.push(obj)
    }
    for (const i of $selectedConnectorIndices.get()) {
      const connector = part.connectors[i]
      const obj = connector && this.connectorObjects.get(connector.id)
      if (obj) out.push(obj)
    }
    for (const i of $selectedColliderIndices.get()) {
      const collider = part.colliders[i]
      // Every instance of a SubPart-owned collider highlights together — they are one
      // document entity, so highlighting only the gizmo target would read as a bug.
      for (const obj of (collider && this.colliderObjects.get(collider.id)) ?? []) out.push(obj)
    }
    for (const i of $selectedIvaSeatIndices.get()) {
      const seat = part.ivaSeats[i]
      const obj = seat && this.seatObjects.get(seat.id)
      if (obj) out.push(obj)
    }
    for (const i of $selectedKittenIndices.get()) {
      const kitten = part.kittens[i]
      const obj = kitten && this.kittenObjects.get(kitten.id)
      if (obj) out.push(obj)
    }
    return out
  }

  /**
   * Every selected entity's transform in PART space. Identical to
   * {@link selectedTransformRefs} except for a SubPart-owned collider, whose stored
   * transform is in its owner's local frame — bulk gizmo math (and the centroid the pivot
   * sits on) has to work in one shared space, so those are lifted through
   * {@link colliderWorld} here and pushed back down on write.
   */
  private worldTransformRefs(): SelectedTransformRef[] {
    return selectedTransformRefs().map((ref) => {
      if (ref.kind !== 'collider') return ref
      const frame = this.colliderGizmoFrame(ref.index)
      return frame ? { ...ref, transform: colliderWorld(ref.transform, frame) } : ref
    })
  }

  /** Centroid of all selected entities, from Part-space positions. */
  private selectionCentroid(): Vec3 {
    return centroidOf(this.worldTransformRefs().map((r) => r.transform.position))
  }

  /** Resets the pivot to the selection centroid with identity rotation/scale. */
  private repositionPivot(): void {
    const c = this.selectionCentroid()
    this.pivot.position.set(c.x, c.y, c.z)
    this.pivot.quaternion.identity()
    this.pivot.scale.set(1, 1, 1)
  }

  /** Syncs the selection highlight and gizmo attachment to the current selection. */
  private updateSelection(): void {
    this.updatePivotHelper() // before any early-return below; tracks the pivot live during drags
    const selected = this.selectedObjects()
    const next = new Set(selected)
    for (const obj of this.highlighted) if (!next.has(obj)) obj.setSelected(false)
    for (const obj of selected) obj.setSelected(true)
    this.highlighted = selected
    this.measurements.refresh()
    // Recompute container out-of-bounds warnings here too: this runs after
    // reconcile (so removed meshes are already gone) and inside the async SubPart
    // build callback (so newly-added meshes exist with geometry loaded). The
    // layer's own `$part` subscription only catches mesh *moves*, firing before
    // reconcile — too early to see adds/removes.
    this.containers.refresh()

    // Gizmo attachment — never re-attach mid-drag (it would reset the drag).
    if (this.gizmo.isDragging) return

    // Pose-editing takes precedence: when a joint + keyframe are active, the gizmo
    // edits the joint's pose via an empty proxy positioned at the joint's world frame.
    const poseTarget = this.poseEditTarget()
    if (poseTarget) {
      const m = jointWorld(poseTarget.anim, poseTarget.joint.id, poseTarget.kf.timeSec)
      m.decompose(this.poseProxy.position, this.poseProxy.quaternion, this.poseProxy.scale)
      this.poseProxy.updateMatrixWorld(true)
      if (this.attachedObject !== this.poseProxy) {
        this.gizmo.attach(this.poseProxy)
        this.attachedObject = this.poseProxy
      }
      return
    }

    // Engine designer: when the exhaust gizmo is on, attach it to a proxy at the active
    // nozzle's exhaust world position so a drag relocates the exhaust point.
    const engine = this.engineEditTarget()
    if (engine && $engineExhaustGizmo.get()) {
      const world = new THREE.Vector3(
        engine.nozzle.exhaustLocation.x,
        engine.nozzle.exhaustLocation.y,
        engine.nozzle.exhaustLocation.z,
      ).applyMatrix4(engine.instanceMatrix)
      this.engineProxy.position.copy(world)
      this.engineProxy.quaternion.identity()
      this.engineProxy.scale.setScalar(1)
      this.engineProxy.updateMatrixWorld(true)
      if (this.attachedObject !== this.engineProxy) {
        this.gizmo.attach(this.engineProxy)
        this.attachedObject = this.engineProxy
      }
      return
    }

    // 2+ entities -> attach to the centroid pivot for bulk transforms; otherwise
    // attach directly to the single selected object (SubPart, connector, seat, ...).
    const part = $part.get()
    const indices = $selectedIndices.get()
    const conIndices = $selectedConnectorIndices.get()
    const kitIndices = $selectedKittenIndices.get()
    const colIndices = $selectedColliderIndices.get()
    const seatIndices = $selectedIvaSeatIndices.get()
    const multi =
      indices.length +
        conIndices.length +
        kitIndices.length +
        colIndices.length +
        seatIndices.length >
      1
    let target: THREE.Object3D | null

    // Suppress the gizmo when any selected entity is in a locked layer (items
    // can be selected from the Assets list for inspection but must not be moved).
    const anyLocked =
      indices.some((i) => isLayerLocked(part.placements[i]?.layerId ?? '')) ||
      conIndices.some((ci) => isLayerLocked(part.connectors[ci]?.layerId ?? '')) ||
      kitIndices.some((ki) => isLayerLocked(part.kittens[ki]?.layerId ?? '')) ||
      colIndices.some((i) => isLayerLocked(part.colliders[i]?.layerId ?? '')) ||
      seatIndices.some((i) => isLayerLocked(part.ivaSeats[i]?.layerId ?? ''))
    // While the preview shows a POSED frame (t>0 / editing), an animated SubPart's
    // group sits at its animated transform — suppress the gizmo so a drag can't write
    // the posed transform back as the static placement. At rest (t=0) it's safe.
    const previewLocked = this.isPreviewPosed() && this.selectedIsAnimated()
    // Sitting in a seat: the gizmo would render at (or inside) the camera and there is
    // nothing to aim it with — the whole viewport is the preview.
    if (anyLocked || previewLocked || $seatView.get() !== null) {
      target = null
    } else if (multi) {
      this.repositionPivot()
      target = this.pivot
    } else if (colIndices.length === 1) {
      // A SubPart-owned collider has one visual PER PLACEMENT; attach to whichever the
      // user last clicked (see colliderInstance) so the drag has an unambiguous frame.
      const collider = part.colliders[colIndices[0]]
      const objs = collider ? (this.colliderObjects.get(collider.id) ?? []) : []
      const i = Math.min(this.colliderInstance.get(collider?.id ?? '') ?? 0, objs.length - 1)
      target = objs[Math.max(0, i)]?.group ?? null
    } else {
      target = selected[0]?.group ?? null
    }
    if (target !== this.attachedObject) {
      this.gizmo.attach(target)
      this.attachedObject = target
    }
  }

  /**
   * Positions the always-on pivot marker at the active joint's REST world frame while the
   * Animations editor is open with a joint selected; hides it otherwise. Read-only — safe
   * under the preview lock and during drags. Driven from {@link updateSelection} (which
   * runs on preview, selection, $part, and drag-end changes).
   */
  private updatePivotHelper(): void {
    const animId = $activeAnimationId.get()
    const jointId = $activeJointId.get()
    const anim = animId ? $part.get().animations.find((a) => a.id === animId) : undefined
    const joint = anim?.joints.find((j) => j.id === jointId)
    if ($inspectorMode.get() !== 'anim' || !anim || !joint) {
      this.pivotHelper.visible = false
      return
    }
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    jointWorld(anim, joint.id, 0).decompose(pos, quat, new THREE.Vector3())
    this.pivotHelper.position.copy(pos)
    this.pivotHelper.quaternion.copy(quat)
    this.pivotHelper.scale.setScalar(1) // strip any pivot scale; always a clean unit frame
    this.pivotHelper.visible = true
  }

  /** Streams a gizmo change back to the store (single entity) or all selected (bulk). */
  private handleGizmoChange(object: THREE.Object3D): void {
    if (this.bulkSnapshot) {
      this.applyBulkFromPivot()
      return
    }
    const world = readPlacementTransform(object)
    // A collider visual sits in PART space; its document transform is in its owner's
    // frame, so a SubPart-owned one has to be converted back before it is stored.
    const sel = object.userData.selectable as { kind?: string; id?: string } | undefined
    if (sel?.kind === 'collider') {
      const index = $part.get().colliders.findIndex((c) => c.id === sel.id)
      if (index >= 0) {
        const frame = this.colliderGizmoFrame(index)
        updateColliderTransform(index, frame ? colliderLocalFromWorld(world, frame) : world)
        return
      }
    }
    updateSelectedTransform(world)
  }

  /**
   * The placement a collider's gizmo currently edits through — the instance the user last
   * clicked (see {@link colliderInstance}). Null for a part-level collider, or one whose
   * owner template isn't placed: those live directly in Part space.
   */
  private colliderGizmoFrame(index: number): Transform | null {
    const part = $part.get()
    const collider = part.colliders[index]
    if (!collider) return null
    const owners = this.colliderOwners(part, collider)
    if (owners.length === 0) return null
    const i = Math.min(this.colliderInstance.get(collider.id) ?? 0, owners.length - 1)
    return owners[Math.max(0, i)] ?? null
  }

  /** The active pose-edit target (active animation + joint + keyframe), or null. */
  private poseEditTarget(): {
    anim: PartAnimation
    joint: PartAnimation['joints'][number]
    kf: PartAnimation['keyframes'][number]
  } | null {
    // Only while the Animation editor is open (its atoms persist across mode switches).
    if ($inspectorMode.get() !== 'anim') return null
    const animId = $activeAnimationId.get()
    const jointId = $activeJointId.get()
    const kfId = $editKeyframeId.get()
    if (!animId || !jointId || !kfId) return null
    const anim = $part.get().animations.find((a) => a.id === animId)
    const joint = anim?.joints.find((j) => j.id === jointId)
    const kf = anim?.keyframes.find((k) => k.id === kfId)
    if (!anim || !joint || !kf) return null
    return { anim, joint, kf }
  }

  /**
   * Writes a pose-gizmo drag back to the joint's local pose. The proxy's local matrix
   * is the joint's world frame (root is at identity), so the new local pose is
   * parentWorld(t)⁻¹ · proxy. At the rest keyframe with the Move tool this is a PIVOT
   * move — the delta is applied to every keyframe (the rotation anchor relocates with
   * no mesh jump); otherwise it sets just this keyframe's pose. STREAMING (drag-start
   * pushed undo once).
   */
  private handlePoseGizmoChange(): void {
    const target = this.poseEditTarget()
    if (!target) return
    const { anim, joint, kf } = target
    const proxyWorld = new THREE.Matrix4().compose(
      this.poseProxy.position,
      this.poseProxy.quaternion,
      this.poseProxy.scale,
    )
    const parentWorld = joint.parentJointId
      ? jointWorld(anim, joint.parentJointId, kf.timeSec)
      : new THREE.Matrix4()
    const newLocal = parentWorld.invert().multiply(proxyWorld)
    const t = transformFromMatrix(newLocal)

    if (kf.timeSec === 0) {
      // The rest pose IS the pivot. Move relocates the anchor; Rotate re-orients it.
      // Both preserve the t=0 geometry and rigidly carry t>0 motion; scale is ignored
      // (a pivot must stay unit-scaled), so a scale drag at rest is a no-op.
      if ($toolMode.get() === 'translate') {
        const cur = kf.poses[joint.id]?.position ?? { x: 0, y: 0, z: 0 }
        moveJointPivot(anim.id, joint.id, {
          x: t.position.x - cur.x,
          y: t.position.y - cur.y,
          z: t.position.z - cur.z,
        })
      } else if ($toolMode.get() === 'rotate') {
        // proxyWorld is the pivot's Part-space frame; rebase converts to parent-local.
        reorientJointPivot(anim.id, joint.id, transformFromMatrix(proxyWorld))
      }
    } else {
      setJointPose(anim.id, kf.id, joint.id, t)
    }
  }

  /**
   * The active engine-exhaust edit target while the Engine designer is open: the active
   * thrust-chamber template's first nozzle, plus the world matrix of the placement
   * instance it's anchored to (root is at identity, so that's the placement transform —
   * an unplaced engine anchors at the origin). Null when not applicable.
   */
  private engineEditTarget(): {
    templateId: string
    nozzleIndex: number
    nozzle: DeLavalNozzle
    instanceMatrix: THREE.Matrix4
  } | null {
    if ($inspectorMode.get() !== 'engine') return null
    const templateId = $activeEngineTemplateId.get()
    if (!templateId) return null
    const part = $part.get()
    const spd = part.subPartGameData.find((s) => s.subPartTemplateId === templateId)
    const nozzle = spd?.nozzles[0]
    if (!nozzle) return null
    const instanceId = $resolvedEngineInstanceId.get()
    const placement = instanceId
      ? part.placements.find((p) => p.instanceId === instanceId)
      : undefined
    const instanceMatrix = placement ? matrixFromTransform(placement) : new THREE.Matrix4()
    return { templateId, nozzleIndex: 0, nozzle, instanceMatrix }
  }

  /** Shows/positions the exhaust marker for the active engine's nozzle (hidden otherwise). */
  private applyEngineHandle(): void {
    const target = this.engineEditTarget()
    if (!target) {
      this.engineHandle?.setVisible(false)
      return
    }
    if (!this.engineHandle) {
      this.engineHandle = new NozzleHandleObject()
      this.root.add(this.engineHandle.group)
    }
    const { nozzle, instanceMatrix } = target
    const worldPos = new THREE.Vector3(
      nozzle.exhaustLocation.x,
      nozzle.exhaustLocation.y,
      nozzle.exhaustLocation.z,
    ).applyMatrix4(instanceMatrix)
    // Direction transforms by the instance's rotation only (no translation).
    const worldDir = new THREE.Vector3(
      nozzle.exhaustDirection.x,
      nozzle.exhaustDirection.y,
      nozzle.exhaustDirection.z,
    )
      .transformDirection(instanceMatrix)
      .normalize()
    this.engineHandle.setPose(worldPos, worldDir)
    this.engineHandle.setVisible(true)
  }

  /**
   * Writes an exhaust-gizmo drag back to the nozzle's exhaust LOCATION. The proxy's
   * world position is converted into the placement instance's local (assembly) frame —
   * exactly where {@link DeLavalNozzle.exhaustLocation} lives. STREAMING (drag-start
   * pushed undo once).
   */
  private handleEngineGizmoChange(): void {
    const target = this.engineEditTarget()
    if (!target) return
    const inv = target.instanceMatrix.clone().invert()
    const local = this.engineProxy.position.clone().applyMatrix4(inv)
    updateNozzle(target.templateId, target.nozzleIndex, {
      exhaustLocation: { x: local.x, y: local.y, z: local.z },
    })
  }

  /** Snapshots all selected entities' transforms at the start of a bulk gizmo drag. */
  private beginBulkDrag(): void {
    const refs = this.worldTransformRefs()
    if (refs.length <= 1) {
      this.bulkSnapshot = null
      return
    }
    this.bulkSnapshot = { centroid: centroidOf(refs.map((r) => r.transform.position)), items: refs }
  }

  /** Applies the pivot's delta (per the active tool mode) to every snapshotted entity. */
  private applyBulkFromPivot(): void {
    const snap = this.bulkSnapshot
    if (!snap) return
    const mode = $toolMode.get()
    const updates = snap.items.map(({ kind, index, transform: base }) => {
      if (mode === 'translate') {
        const delta = {
          x: this.pivot.position.x - snap.centroid.x,
          y: this.pivot.position.y - snap.centroid.y,
          z: this.pivot.position.z - snap.centroid.z,
        }
        return { kind, index, transform: translatedTransform(base, delta) }
      }
      if (mode === 'rotate') {
        return {
          kind,
          index,
          transform: rotatedAroundOriginTransform(base, this.pivot.quaternion, snap.centroid),
        }
      }
      const factor = { x: this.pivot.scale.x, y: this.pivot.scale.y, z: this.pivot.scale.z }
      return {
        kind,
        index,
        transform:
          $bulkScaleMode.get() === 'smart'
            ? scaledAroundOriginTransform(base, factor, snap.centroid)
            : scaledInPlaceTransform(base, factor),
      }
    })
    // Owner-local again on the way back down (see worldTransformRefs).
    updateSelectedTransforms(
      updates.map((u) => {
        if (u.kind !== 'collider') return u
        const frame = this.colliderGizmoFrame(u.index)
        return frame ? { ...u, transform: colliderLocalFromWorld(u.transform, frame) } : u
      }),
    )
  }

  /** Ends a bulk drag: drops the snapshot and re-centers the pivot on the new layout. */
  private endBulkDrag(): void {
    if (!this.bulkSnapshot) return
    this.bulkSnapshot = null
    this.repositionPivot()
  }

  private readonly onPickPointerDown = (e: PointerEvent): void => {
    if ($measureTool.get() === 'none') return
    this.pickPointerDown = { x: e.clientX, y: e.clientY }
  }

  private readonly onPickPointerUp = (e: PointerEvent): void => {
    if ($measureTool.get() === 'none') return
    const down = this.pickPointerDown
    this.pickPointerDown = null
    // Treat >4px of movement as an orbit drag, not a pick.
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return

    const point = this.pickWorldPoint(e)
    if (!point) return

    if (this.pendingMeasurementId === null) {
      const id = addMeasurement({ source: 'point', a: point, b: point })
      this.pendingMeasurementId = id
      setActiveMeasurement(null) // keep the editor/gizmo away until the 2nd click
    } else {
      updateMeasurement(this.pendingMeasurementId, { b: point })
      setActiveMeasurement(this.pendingMeasurementId)
      this.pendingMeasurementId = null
      setMeasureTool('none')
    }
  }

  /** Raycasts the pointer against part meshes, snapping to the nearest face vertex. */
  private pickWorldPoint(e: PointerEvent): Vec3 | null {
    const dom = this.viewport.renderer.domElement
    const rect = dom.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.viewport.camera)
    const hits = this.raycaster.intersectObjects(this.root.children, true)
    const hit = hits[0]
    if (hit) {
      const snapped = nearestFaceVertex(hit)
      const p = snapped ?? hit.point
      return { x: p.x, y: p.y, z: p.z }
    }
    // No mesh under the cursor: fall back to the Y=0 ground plane so points can
    // be placed in empty space.
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const target = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(ground, target)) {
      return { x: target.x, y: target.y, z: target.z }
    }
    return null
  }

  private cancelPendingMeasurement(): void {
    if (this.pendingMeasurementId !== null) {
      removeMeasurement(this.pendingMeasurementId)
      this.pendingMeasurementId = null
    }
  }

  dispose(): void {
    // The scene going away takes the preview with it — the bar must not survive it.
    exitSeatView()
    if (this.coverageDots) {
      this.root.remove(this.coverageDots)
      this.coverageDots.geometry.dispose()
      ;(this.coverageDots.material as THREE.Material).dispose()
      this.coverageDots = null
    }
    for (const objs of this.colliderObjects.values()) {
      for (const obj of objs) {
        this.root.remove(obj.group)
        obj.dispose()
      }
    }
    this.colliderObjects.clear()
    const dom = this.viewport.renderer.domElement
    dom.removeEventListener('pointerdown', this.onPickPointerDown)
    dom.removeEventListener('pointerup', this.onPickPointerUp)
    dom.style.cursor = ''
    for (const unsub of this.unsubscribers) unsub()
    this.unsubscribers.length = 0
    this.selection.dispose()
    this.gizmo.dispose()
    this.root.remove(this.poseProxy)
    this.root.remove(this.pivotHelper)
    this.pivotHelper.dispose()
    this.root.remove(this.engineProxy)
    if (this.engineHandle) {
      this.root.remove(this.engineHandle.group)
      this.engineHandle.dispose()
      this.engineHandle = null
    }
    this.measurements.dispose()
    this.containers.dispose()
    for (const obj of this.objects.values()) obj.dispose()
    this.objects.clear()
    for (const obj of this.connectorObjects.values()) obj.dispose()
    this.connectorObjects.clear()
    for (const obj of this.seatObjects.values()) {
      this.root.remove(obj.group)
      obj.dispose()
    }
    this.seatObjects.clear()
    for (const obj of this.kittenObjects.values()) obj.dispose()
    this.kittenObjects.clear()
    this.viewport.dispose()
  }
}

/** True when `a` and `b` point along (or against) the same line — where `seatRotationFromAxes` NaNs. */
function isParallel(a: Vec3, b: Vec3): boolean {
  const la = Math.hypot(a.x, a.y, a.z)
  const lb = Math.hypot(b.x, b.y, b.z)
  if (!(la > 0) || !(lb > 0)) return true
  const cx = a.y * b.z - a.z * b.y
  const cy = a.z * b.x - a.x * b.z
  const cz = a.x * b.y - a.y * b.x
  return Math.hypot(cx, cy, cz) / (la * lb) < 1e-6
}

/**
 * A usable up axis for `forward` when the seat's own is unusable: KSA's own default up
 * (`SEAT_LOCAL_UP`, i.e. −Z) unless `forward` runs along it, in which case +Y. Need not be
 * perpendicular — `seatRotationFromAxes` orthogonalises exactly as the game does.
 */
function perpendicularUp(forward: Vec3): Vec3 {
  if (!isParallel(forward, SEAT_LOCAL_UP)) return { ...SEAT_LOCAL_UP }
  return { x: 0, y: 1, z: 0 }
}

/**
 * Snaps a raycast hit to the nearest of its triangle's three vertices (in world
 * space), so point measurements land on geometry corners. Returns null if the
 * intersection has no usable face/geometry.
 */
function nearestFaceVertex(hit: THREE.Intersection): THREE.Vector3 | null {
  const face = hit.face
  const mesh = hit.object as THREE.Mesh
  const geom = mesh.geometry as THREE.BufferGeometry | undefined
  const pos = geom?.attributes?.position as THREE.BufferAttribute | undefined
  if (!face || !pos) return null
  let best: THREE.Vector3 | null = null
  let bestDist = Infinity
  for (const idx of [face.a, face.b, face.c]) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, idx).applyMatrix4(mesh.matrixWorld)
    const d = v.distanceToSquared(hit.point)
    if (d < bestDist) {
      bestDist = d
      best = v
    }
  }
  return best
}
