import * as THREE from 'three'
import { Viewport } from './Viewport'
import { SubPartObject } from './SubPartObject'
import { ConnectorObject } from './ConnectorObject'
import { SelectionManager } from './SelectionManager'
import { TransformGizmo } from './TransformGizmo'
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
  $snap,
  $toolMode,
  clearSelection,
  pushUndo,
  selectConnector,
  selectPlacement,
  togglePlacement,
  updatePlacementTransforms,
  updateSelectedTransform,
  type PlacementTransform,
} from '../state/editorStore'
import { $catalogIndex } from '../state/catalogStore'
import { $connectorSettings, type ConnectorSettings } from '../state/settingsStore'
import { $cameraSnap, $grids } from '../state/viewStore'
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
  private readonly building = new Set<string>()
  private index: Map<string, CatalogSubPart> = new Map()
  private connectorSettings: ConnectorSettings = $connectorSettings.get()
  private readonly unsubscribers: Array<() => void> = []
  private readonly selection: SelectionManager
  private readonly gizmo: TransformGizmo
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

  constructor(host: HTMLElement) {
    this.viewport = new Viewport(host)
    // Must precede the store subscriptions below (they build SubParts, which
    // request textures through the loader initialized here).
    initTextureSupport(this.viewport.renderer)
    this.root.name = 'flexo-part'
    this.viewport.scene.add(this.root)
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
        } else {
          const connectors = $part.get().connectors
          const index = connectors.findIndex((c) => c.id === selected.id)
          if (index < 0) return
          const layerId = connectors[index].layerId
          if (isLayerLocked(layerId)) return
          if (!isLayerVisible(layerId)) return // three.js does not skip invisible objects during raycasting
          if (layerId !== activeLayerId) return // only select within the active layer
          selectConnector(index)
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
          const detail = ci >= 0
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
    this.applyLayerVisibility()
    this.updateSelection()
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
    const anyLocked =
      indices.some((i) => isLayerLocked(part.placements[i]?.layerId ?? '')) ||
      conIndices.some((ci) => isLayerLocked(part.connectors[ci]?.layerId ?? ''))
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

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub()
    this.unsubscribers.length = 0
    this.selection.dispose()
    this.gizmo.dispose()
    for (const obj of this.objects.values()) obj.dispose()
    this.objects.clear()
    for (const obj of this.connectorObjects.values()) obj.dispose()
    this.connectorObjects.clear()
    this.viewport.dispose()
  }
}
