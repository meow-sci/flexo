import * as THREE from 'three'
import { Viewport } from './Viewport'
import { SubPartObject } from './SubPartObject'
import { ConnectorObject } from './ConnectorObject'
import { KittenObject } from './KittenObject'
import { SelectionManager } from './SelectionManager'
import { TransformGizmo } from './TransformGizmo'
import { MeasurementLayer } from './MeasurementLayer'
import { ContainerLayer } from './ContainerLayer'
import { readPlacementTransform } from './coords'
import {
  centroidOf,
  rotatedAroundOriginTransform,
  scaledInPlaceTransform,
  translatedTransform,
} from './bulkTransform'
import { initTextureSupport } from './textureSupport'
import type { CatalogSubPart } from '../ksa/catalog'
import type { EditingPart, Vec3 } from '../ksa/types'
import {
  $activeLayerId,
  $part,
  $selectedConnectorIndex,
  $selectedConnectorIndices,
  $selectedIndices,
  $selectedKittenIndex,
  $selectedKittenIndices,
  $snap,
  $toolMode,
  clearSelection,
  pushUndo,
  selectConnector,
  selectKitten,
  selectPlacement,
  togglePlacement,
  updatePlacementTransforms,
  updateSelectedTransform,
  type PlacementTransform,
} from '../state/editorStore'
import { $catalogIndex } from '../state/catalogStore'
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
import { $connectorSettings, type ConnectorSettings } from '../state/settingsStore'
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
 */
export class EditorScene {
  readonly viewport: Viewport
  private readonly root = new THREE.Group()
  private readonly objects = new Map<string, SubPartObject>()
  private readonly connectorObjects = new Map<string, ConnectorObject>()
  private readonly kittenObjects = new Map<string, KittenObject>()
  private readonly building = new Set<string>()
  private readonly kittenBuilding = new Set<string>()
  private index: Map<string, CatalogSubPart> = new Map()
  private connectorSettings: ConnectorSettings = $connectorSettings.get()
  private readonly unsubscribers: Array<() => void> = []
  private readonly selection: SelectionManager
  private readonly gizmo: TransformGizmo
  private readonly measurements: MeasurementLayer
  private readonly containers: ContainerLayer
  private highlighted: SelectableObject[] = []
  private attachedObject: THREE.Object3D | null = null
  /**
   * Empty group the gizmo attaches to when 2+ SubParts are selected. Positioned
   * at the selection centroid with identity rotation/scale; the gizmo drives it
   * and {@link applyBulkFromPivot} fans the delta out to every selected SubPart.
   */
  private readonly pivot = new THREE.Group()
  /** Per-SubPart starting transforms captured at the start of a bulk gizmo drag. */
  private bulkSnapshot: { centroid: Vec3; items: { index: number; base: PlacementTransform }[] } | null = null

  // Point-to-point measurement picking.
  private readonly raycaster = new THREE.Raycaster()
  private pendingMeasurementId: string | null = null
  private pickPointerDown: { x: number; y: number } | null = null

  constructor(host: HTMLElement) {
    this.viewport = new Viewport(host)
    // Must precede the store subscriptions below (they build SubParts, which
    // request textures through the loader initialized here).
    initTextureSupport(this.viewport.renderer)
    this.root.name = 'flexo-part'
    this.viewport.scene.add(this.root)
    if (import.meta.env.DEV) (window as unknown as { __editorScene?: EditorScene }).__editorScene = this
    this.pivot.name = 'bulk-pivot'
    this.root.add(this.pivot)

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
        const activeLayerId = $activeLayerId.get()
        if (selected.kind === 'subpart') {
          const placements = $part.get().placements
          const index = placements.findIndex((p) => p.instanceId === selected.id)
          if (index < 0) return
          const layerId = placements[index].layerId
          if (isLayerLocked(layerId)) return
          if (!isLayerVisible(layerId)) return // three.js does not skip invisible objects during raycasting
          if (layerId !== activeLayerId) return // only select within the active layer
          if (additive) togglePlacement(index)
          else selectPlacement(index)
        } else if (selected.kind === 'connector') {
          const connectors = $part.get().connectors
          const index = connectors.findIndex((c) => c.id === selected.id)
          if (index < 0) return
          const layerId = connectors[index].layerId
          if (isLayerLocked(layerId)) return
          if (!isLayerVisible(layerId)) return // three.js does not skip invisible objects during raycasting
          if (layerId !== activeLayerId) return // only select within the active layer
          selectConnector(index)
        } else {
          const kittens = $part.get().kittens
          const index = kittens.findIndex((k) => k.id === selected.id)
          if (index < 0) return
          const layerId = kittens[index].layerId
          if (isLayerLocked(layerId)) return
          if (!isLayerVisible(layerId)) return // three.js does not skip invisible objects during raycasting
          if (layerId !== activeLayerId) return // only select within the active layer
          selectKitten(index)
        }
      },
    )

    this.gizmo = new TransformGizmo(
      this.viewport.camera,
      this.viewport.renderer.domElement,
      this.viewport.scene,
      this.viewport.controls,
      {
        onDragStart: () => {
          const mode = $toolMode.get()
          const desc = mode === 'rotate' ? 'rotate' : mode === 'scale' ? 'scale' : 'move'
          const p = $part.get()
          const sel = $selectedIndices.get()
          const ci = $selectedConnectorIndex.get()
          const ki = $selectedKittenIndex.get()
          const detail = ki >= 0
            ? (p.kittens[ki]?.id ?? '')
            : ci >= 0
            ? (p.connectors[ci]?.id ?? '')
            : sel.length === 1
              ? (p.placements[sel[0]]?.instanceId ?? '')
              : sel.length > 1 ? `${sel.length} parts` : ''
          pushUndo(desc, detail)
          this.beginBulkDrag()
        },
        onChange: (object) => this.handleGizmoChange(object),
        onDraggingChanged: (dragging) => {
          this.selection.setSuppressed(dragging)
          if (!dragging) this.endBulkDrag()
        },
      },
    )

    this.measurements = new MeasurementLayer(this.viewport, () =>
      this.selectedObjects().map((o) => o.group),
    )
    this.containers = new ContainerLayer(this.viewport, () =>
      [...this.objects.values()].map((o) => o.group),
    )

    const dom = this.viewport.renderer.domElement
    dom.addEventListener('pointerdown', this.onPickPointerDown)
    dom.addEventListener('pointerup', this.onPickPointerUp)
    this.unsubscribers.push(
      $measureTool.subscribe((tool) => {
        const picking = tool !== 'none'
        this.selection.setSuppressed(picking)
        dom.style.cursor = picking ? 'crosshair' : ''
        if (!picking) this.cancelPendingMeasurement()
      }),
    )
    // Editing a measurement, editing a container, and selecting a mesh are all
    // mutually exclusive, so only one gizmo is ever active at a time.
    this.unsubscribers.push(
      $activeMeasurementId.subscribe((id) => {
        if (id) {
          clearSelection()
          setActiveContainer(null)
        }
      }),
    )
    this.unsubscribers.push(
      $activeContainerId.subscribe((id) => {
        if (id) {
          clearSelection()
          setActiveMeasurement(null)
        }
      }),
    )
    // Selecting any mesh closes container editing (its gizmo would otherwise fight
    // the selection gizmo).
    const clearContainerOnSelect = () => {
      if (this.selectedObjects().length > 0) setActiveContainer(null)
    }
    this.unsubscribers.push($selectedIndices.subscribe(clearContainerOnSelect))
    this.unsubscribers.push($selectedConnectorIndices.subscribe(clearContainerOnSelect))
    this.unsubscribers.push($selectedKittenIndices.subscribe(clearContainerOnSelect))

    // nanostores `subscribe` fires immediately with the current value.
    this.unsubscribers.push(
      $catalogIndex.subscribe((index) => {
        this.index = index
        this.reconcile($part.get())
      }),
    )
    this.unsubscribers.push($part.subscribe((part) => this.reconcile(part)))
    this.unsubscribers.push($selectedIndices.subscribe(() => this.updateSelection()))
    this.unsubscribers.push($selectedConnectorIndices.subscribe(() => this.updateSelection()))
    this.unsubscribers.push($selectedKittenIndices.subscribe(() => this.updateSelection()))
    this.unsubscribers.push(
      $connectorSettings.subscribe((settings) => {
        this.connectorSettings = settings
        this.rebuildConnectors()
      }),
    )
    this.unsubscribers.push($layerView.subscribe(() => this.applyLayerVisibility()))
    this.unsubscribers.push($toolMode.subscribe((mode) => this.gizmo.setMode(mode)))
    this.unsubscribers.push($snap.subscribe((snap) => this.gizmo.setSnap(snap)))
    this.unsubscribers.push($grids.subscribe((grids) => this.viewport.grids.setConfig(grids)))
    this.unsubscribers.push(
      $cameraSnap.subscribe((cmd) => {
        if (cmd) this.viewport.snapCamera(cmd.dir)
      }),
    )
    this.unsubscribers.push(
      $cameraRestore.subscribe((cmd) => {
        if (cmd) this.viewport.restoreCamera(cmd.state)
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
          const latest = $part
            .get()
            .placements.find((p) => p.instanceId === placement.instanceId)
          if (!latest) {
            obj.dispose() // removed while loading
            return
          }
          obj.setPlacement(latest)
          this.root.add(obj.group)
          this.objects.set(placement.instanceId, obj)
          this.applyLayerVisibility() // respect the layer's visibility for the new object
          this.updateSelection() // highlight/attach if this is the selected one
        })
        .catch((err) => {
          this.building.delete(placement.instanceId)
          console.warn(`EditorScene: failed to build '${placement.instanceId}'`, err)
        })
    }

    this.reconcileConnectors(part)
    this.reconcileKittens(part)
    this.applyLayerVisibility()
    this.updateSelection()
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
          this.applyLayerVisibility()
          this.updateSelection()
        })
        .catch((err) => {
          this.kittenBuilding.delete(kitten.id)
          console.warn(`EditorScene: failed to build kitten '${kitten.id}'`, err)
        })
    }
  }

  /**
   * Hides/shows each built entity by its layer's visibility (from `$layerView`).
   * Note: three.js does NOT skip invisible objects during raycasting, so the
   * `onSelect` callback guards against hidden/non-active-layer hits explicitly.
   */
  private applyLayerVisibility(): void {
    const part = $part.get()
    const view = $layerView.get()
    for (const p of part.placements) {
      const obj = this.objects.get(p.instanceId)
      if (obj) obj.group.visible = layerViewState(view, p.layerId).visible
    }
    for (const c of part.connectors) {
      const obj = this.connectorObjects.get(c.id)
      if (obj) obj.group.visible = layerViewState(view, c.layerId).visible
    }
    for (const k of part.kittens) {
      const obj = this.kittenObjects.get(k.id)
      if (obj) obj.group.visible = layerViewState(view, k.layerId).visible
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

  /** Rebuilds every connector from scratch (cube/arrow sizes are global settings). */
  private rebuildConnectors(): void {
    for (const obj of this.connectorObjects.values()) {
      this.root.remove(obj.group)
      obj.dispose()
    }
    this.connectorObjects.clear()
    this.reconcileConnectors($part.get())
    this.applyLayerVisibility()
    this.updateSelection()
  }

  /** Resolves the currently selected scene objects (SubParts or connectors) that are built. */
  private selectedObjects(): SelectableObject[] {
    const part = $part.get()
    const kitIndices = $selectedKittenIndices.get()
    if (kitIndices.length > 0) {
      const out: SelectableObject[] = []
      for (const i of kitIndices) {
        const kitten = part.kittens[i]
        const obj = kitten && this.kittenObjects.get(kitten.id)
        if (obj) out.push(obj)
      }
      return out
    }
    const conIndices = $selectedConnectorIndices.get()
    if (conIndices.length > 0) {
      const out: SelectableObject[] = []
      for (const i of conIndices) {
        const connector = part.connectors[i]
        const obj = connector && this.connectorObjects.get(connector.id)
        if (obj) out.push(obj)
      }
      return out
    }
    const out: SelectableObject[] = []
    for (const index of $selectedIndices.get()) {
      const placement = part.placements[index]
      const obj = placement && this.objects.get(placement.instanceId)
      if (obj) out.push(obj)
    }
    return out
  }

  /** Centroid of the currently selected SubParts, from store positions (not scene objects). */
  private selectionCentroid(): Vec3 {
    const part = $part.get()
    return centroidOf(
      $selectedIndices.get().flatMap((i) => {
        const p = part.placements[i]
        return p ? [p.position] : []
      }),
    )
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

    // 2+ SubParts -> attach to the centroid pivot for bulk transforms; otherwise
    // attach directly to the single selected object (SubPart or connector).
    const indices = $selectedIndices.get()
    const multi = indices.length > 1
    let target: THREE.Object3D | null

    // Suppress the gizmo when any selected entity is in a locked layer (items
    // can be selected from the Placed list for inspection but must not be moved).
    const part = $part.get()
    const conIndices = $selectedConnectorIndices.get()
    const kitIndices = $selectedKittenIndices.get()
    const anyLocked =
      indices.some((i) => isLayerLocked(part.placements[i]?.layerId ?? '')) ||
      conIndices.some((ci) => isLayerLocked(part.connectors[ci]?.layerId ?? '')) ||
      kitIndices.some((ki) => isLayerLocked(part.kittens[ki]?.layerId ?? ''))
    if (anyLocked) {
      target = null
    } else if (multi) {
      this.repositionPivot()
      target = this.pivot
    } else {
      target = selected[0]?.group ?? null
    }
    if (target !== this.attachedObject) {
      this.gizmo.attach(target)
      this.attachedObject = target
    }
  }

  /** Streams a gizmo change back to the store (single entity) or all selected (bulk). */
  private handleGizmoChange(object: THREE.Object3D): void {
    if (this.bulkSnapshot) {
      this.applyBulkFromPivot()
      return
    }
    updateSelectedTransform(readPlacementTransform(object))
  }

  /** Snapshots the selected SubParts' transforms at the start of a bulk gizmo drag. */
  private beginBulkDrag(): void {
    if ($selectedIndices.get().length <= 1) {
      this.bulkSnapshot = null
      return
    }
    const part = $part.get()
    const items = $selectedIndices.get().flatMap((index) => {
      const p = part.placements[index]
      if (!p) return []
      return [
        {
          index,
          base: {
            position: { ...p.position },
            rotation: { ...p.rotation },
            scale: { ...p.scale },
          },
        },
      ]
    })
    this.bulkSnapshot = { centroid: centroidOf(items.map((i) => i.base.position)), items }
  }

  /** Applies the pivot's delta (per the active tool mode) to every snapshotted SubPart. */
  private applyBulkFromPivot(): void {
    const snap = this.bulkSnapshot
    if (!snap) return
    const mode = $toolMode.get()
    const updates = snap.items.map(({ index, base }) => {
      if (mode === 'translate') {
        const delta = {
          x: this.pivot.position.x - snap.centroid.x,
          y: this.pivot.position.y - snap.centroid.y,
          z: this.pivot.position.z - snap.centroid.z,
        }
        return { index, transform: translatedTransform(base, delta) }
      }
      if (mode === 'rotate') {
        return {
          index,
          transform: rotatedAroundOriginTransform(base, this.pivot.quaternion, snap.centroid),
        }
      }
      const factor = { x: this.pivot.scale.x, y: this.pivot.scale.y, z: this.pivot.scale.z }
      return { index, transform: scaledInPlaceTransform(base, factor) }
    })
    updatePlacementTransforms(updates)
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
    const dom = this.viewport.renderer.domElement
    dom.removeEventListener('pointerdown', this.onPickPointerDown)
    dom.removeEventListener('pointerup', this.onPickPointerUp)
    dom.style.cursor = ''
    for (const unsub of this.unsubscribers) unsub()
    this.unsubscribers.length = 0
    this.selection.dispose()
    this.gizmo.dispose()
    this.measurements.dispose()
    this.containers.dispose()
    for (const obj of this.objects.values()) obj.dispose()
    this.objects.clear()
    for (const obj of this.connectorObjects.values()) obj.dispose()
    this.connectorObjects.clear()
    for (const obj of this.kittenObjects.values()) obj.dispose()
    this.kittenObjects.clear()
    this.viewport.dispose()
  }
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
