import { persistentJSON } from '@nanostores/persistent'
import { deselectLayer } from './editorStore'

/**
 * Per-layer VIEW state: visibility (eye) and lock. Unlike layer definitions and
 * membership (which are document state in `$part`, undo-tracked), visibility and
 * lock are ephemeral presentation preferences — persisted to localStorage and
 * deliberately NOT in undo/redo, mirroring grid/inspector view prefs.
 *
 * Keyed by layer id. A missing entry means the default {@link DEFAULT_LAYER_STATE}
 * (visible, unlocked), so brand-new layers need no write until toggled. Stale
 * entries for deleted layers are harmless (ignored when the layer is gone).
 *
 * No React / three.js imports — UI reads via `useStore`, the 3D scene subscribes
 * with vanilla `subscribe()`.
 */

export interface LayerViewState {
  visible: boolean
  locked: boolean
  /** Whether the layer's entities appear in the inspector "Assets" list. */
  listed: boolean
}

export const DEFAULT_LAYER_STATE: Readonly<LayerViewState> = {
  visible: true,
  locked: false,
  listed: true,
}

/** Map of layerId → view state. Entries are sparse (defaults filled on read). */
export const $layerView = persistentJSON<Record<string, LayerViewState>>('flexo:layerView', {})

/** View state for a layer, filling in defaults for any unset fields. */
export function layerViewState(view: Record<string, LayerViewState>, id: string): LayerViewState {
  return { ...DEFAULT_LAYER_STATE, ...view[id] }
}

/** True when the layer is currently visible (default true). */
export function isLayerVisible(id: string): boolean {
  return layerViewState($layerView.get(), id).visible
}

/** True when the layer is locked (default false). */
export function isLayerLocked(id: string): boolean {
  return layerViewState($layerView.get(), id).locked
}

/** True when the layer's entities are shown in the Assets list (default true). */
export function isLayerListed(id: string): boolean {
  return layerViewState($layerView.get(), id).listed
}

function setLayerView(id: string, patch: Partial<LayerViewState>): void {
  const current = $layerView.get()
  $layerView.set({ ...current, [id]: { ...layerViewState(current, id), ...patch } })
}

/** Toggles a layer's visibility. Hidden layers render nothing in the viewport. */
export function toggleLayerVisible(id: string): void {
  setLayerView(id, { visible: !isLayerVisible(id) })
}

/**
 * Toggles whether a layer's entities appear in the Assets list. Purely a list-
 * display preference — unlike lock, it does NOT prune selection (cross-layer
 * selection persists even for layers hidden from the list).
 */
export function toggleLayerListed(id: string): void {
  setLayerView(id, { listed: !isLayerListed(id) })
}

/**
 * Ensures a layer is shown — visible in the viewport AND present in the Assets
 * list (idempotent). Used after importing into a layer so the import is never
 * hidden by a prior hide/unlist of that layer.
 */
export function revealLayer(id: string): void {
  setLayerView(id, { visible: true, listed: true })
}

/**
 * Sets a layer's lock. Locking also prunes that layer's entities out of the
 * current selection so a locked layer can't be transformed via an existing
 * selection (locked entities are also non-clickable; see EditorScene).
 */
export function setLayerLocked(id: string, locked: boolean): void {
  setLayerView(id, { locked })
  if (locked) deselectLayer(id)
}

/** Toggles a layer's lock (see {@link setLayerLocked}). */
export function toggleLayerLocked(id: string): void {
  setLayerLocked(id, !isLayerLocked(id))
}
