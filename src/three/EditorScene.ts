import * as THREE from 'three'
import { Viewport } from './Viewport'
import { SubPartObject } from './SubPartObject'
import { ConnectorObject } from './ConnectorObject'
import { SelectionManager } from './SelectionManager'
import { TransformGizmo } from './TransformGizmo'
import { readPlacementTransform } from './coords'
import { initTextureSupport } from './textureSupport'
import type { CatalogSubPart } from '../ksa/catalog'
import type { EditingPart } from '../ksa/types'
import {
  $part,
  $selectedConnectorIndex,
  $selectedIndex,
  $snap,
  $toolMode,
  clearSelection,
  pushUndo,
  selectConnector,
  selectPlacement,
  updateSelectedTransform,
} from '../state/editorStore'
import { $catalogIndex } from '../state/catalogStore'
import { $connectorSettings, type ConnectorSettings } from '../state/settingsStore'
import { $cameraSnap, $grids } from '../state/viewStore'

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
  private highlighted: SelectableObject | null = null
  private attachedGroup: THREE.Group | null = null

  constructor(host: HTMLElement) {
    this.viewport = new Viewport(host)
    // Must precede the store subscriptions below (they build SubParts, which
    // request textures through the loader initialized here).
    initTextureSupport(this.viewport.renderer)
    this.root.name = 'flexo-part'
    this.viewport.scene.add(this.root)

    this.selection = new SelectionManager(
      this.viewport.camera,
      this.viewport.renderer.domElement,
      this.root,
      (selected) => {
        if (!selected) {
          clearSelection()
          return
        }
        if (selected.kind === 'subpart') {
          selectPlacement(
            $part.get().placements.findIndex((p) => p.instanceId === selected.id),
          )
        } else {
          selectConnector($part.get().connectors.findIndex((c) => c.id === selected.id))
        }
      },
    )

    this.gizmo = new TransformGizmo(
      this.viewport.camera,
      this.viewport.renderer.domElement,
      this.viewport.scene,
      this.viewport.controls,
      {
        onDragStart: () => pushUndo(),
        onChange: (object) => updateSelectedTransform(readPlacementTransform(object)),
        onDraggingChanged: (dragging) => this.selection.setSuppressed(dragging),
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
    this.unsubscribers.push($selectedIndex.subscribe(() => this.updateSelection()))
    this.unsubscribers.push($selectedConnectorIndex.subscribe(() => this.updateSelection()))
    this.unsubscribers.push(
      $connectorSettings.subscribe((settings) => {
        this.connectorSettings = settings
        this.rebuildConnectors()
      }),
    )
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
          this.updateSelection() // highlight/attach if this is the selected one
        })
        .catch((err) => {
          this.building.delete(placement.instanceId)
          console.warn(`EditorScene: failed to build '${placement.instanceId}'`, err)
        })
    }

    this.reconcileConnectors(part)
    this.updateSelection()
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
    this.updateSelection()
  }

  /** Resolves the currently selected scene object (SubPart or connector), if built. */
  private selectedObject(): SelectableObject | null {
    const part = $part.get()
    const placement = part.placements[$selectedIndex.get()]
    if (placement) return this.objects.get(placement.instanceId) ?? null
    const connector = part.connectors[$selectedConnectorIndex.get()]
    if (connector) return this.connectorObjects.get(connector.id) ?? null
    return null
  }

  /** Syncs the selection highlight and gizmo attachment to the current selection. */
  private updateSelection(): void {
    const selected = this.selectedObject()

    if (selected !== this.highlighted) {
      this.highlighted?.setSelected(false)
      selected?.setSelected(true)
      this.highlighted = selected
    }

    // Gizmo attachment — never re-attach mid-drag (it would reset the drag).
    if (this.gizmo.isDragging) return
    const group = selected?.group ?? null
    if (group !== this.attachedGroup) {
      this.gizmo.attach(group)
      this.attachedGroup = group
    }
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
