import * as THREE from 'three'
import { Viewport } from './Viewport'
import { SubPartObject } from './SubPartObject'
import { SelectionManager } from './SelectionManager'
import { TransformGizmo } from './TransformGizmo'
import { readPlacementTransform } from './coords'
import { initTextureSupport } from './textureSupport'
import type { CatalogSubPart } from '../ksa/catalog'
import type { EditingPart } from '../ksa/types'
import {
  $part,
  $selectedIndex,
  $snap,
  $toolMode,
  pushUndo,
  selectPlacement,
  updatePlacementTransform,
} from '../state/editorStore'
import { $catalogIndex } from '../state/catalogStore'

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
  private readonly building = new Set<string>()
  private index: Map<string, CatalogSubPart> = new Map()
  private readonly unsubscribers: Array<() => void> = []
  private readonly selection: SelectionManager
  private readonly gizmo: TransformGizmo
  private highlightedId: string | null = null
  private attachedId: string | null = null

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
      (instanceId) => {
        const index = instanceId
          ? $part.get().placements.findIndex((p) => p.instanceId === instanceId)
          : -1
        selectPlacement(index)
      },
    )

    this.gizmo = new TransformGizmo(
      this.viewport.camera,
      this.viewport.renderer.domElement,
      this.viewport.scene,
      this.viewport.controls,
      {
        onDragStart: () => pushUndo(),
        onChange: (object) => {
          const index = $selectedIndex.get()
          if (index < 0) return
          updatePlacementTransform(index, readPlacementTransform(object))
        },
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
    this.unsubscribers.push($toolMode.subscribe((mode) => this.gizmo.setMode(mode)))
    this.unsubscribers.push($snap.subscribe((snap) => this.gizmo.setSnap(snap)))
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

    this.updateSelection()
  }

  /** Syncs the selection highlight and gizmo attachment to $selectedIndex. */
  private updateSelection(): void {
    const index = $selectedIndex.get()
    const selectedId = $part.get().placements[index]?.instanceId ?? null

    // Highlight (toggle emissive on the affected objects).
    if (selectedId !== this.highlightedId) {
      if (this.highlightedId) this.objects.get(this.highlightedId)?.setSelected(false)
      if (selectedId) this.objects.get(selectedId)?.setSelected(true)
      this.highlightedId = selectedId
    }

    // Gizmo attachment — never re-attach mid-drag (it would reset the drag).
    if (this.gizmo.isDragging) return
    if (selectedId !== this.attachedId) {
      const obj = selectedId ? this.objects.get(selectedId) : undefined
      this.gizmo.attach(obj?.group ?? null)
      this.attachedId = obj ? selectedId : null
    }
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub()
    this.unsubscribers.length = 0
    this.selection.dispose()
    this.gizmo.dispose()
    for (const obj of this.objects.values()) obj.dispose()
    this.objects.clear()
    this.viewport.dispose()
  }
}
