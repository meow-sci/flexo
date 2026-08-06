import { atom } from 'nanostores';
import { deselectLayer } from './editorStore';

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
  visible: boolean;
  locked: boolean;
  /** Whether the layer's entities appear in the inspector "Assets" list. */
  listed: boolean;
  /**
   * Viewport opacity multiplier, 0–1 (default 1 = fully opaque). Fades the layer's
   * rendered meshes so parts behind show through while repositioning. Editor-only —
   * never affects the exported document.
   */
  opacity: number;
  /**
   * Whether the Outliner draws this layer's entity rows collapsed (header only). Purely a
   * list-display preference like {@link LayerViewState.listed} — the 3D scene never reads
   * it, and searching ignores it (a filtered Outliner always shows its matches).
   */
  collapsed: boolean;
}

export const DEFAULT_LAYER_STATE: Readonly<LayerViewState> = {
  visible: true,
  locked: false,
  listed: true,
  opacity: 1,
  collapsed: false,
};

/**
 * Map of layerId → view state. Entries are sparse (defaults filled on read by
 * {@link layerViewState}), so a field added to {@link LayerViewState} needs no migration —
 * an old entry simply reads its default.
 *
 * **Per-project, snapshot-only.** This is a plain atom: the project snapshot
 * (`projectStore.ProjectSnapshotV2.layerView`) is its ONE persistence, so hiding a layer in
 * one project no longer leaks into the next one you open. v1 dual-persisted it to a global
 * `flexo:layerView` key AND the snapshot, which meant the global key merely mirrored whichever
 * project loaded last (census pm §3 "Quirk"). That key is simply abandoned — never read,
 * never migrated (foundation §13).
 */
export const $layerView = atom<Record<string, LayerViewState>>({});

/** View state for a layer, filling in defaults for any unset fields. */
export function layerViewState(view: Record<string, LayerViewState>, id: string): LayerViewState {
  return { ...DEFAULT_LAYER_STATE, ...view[id] };
}

/** True when the layer is currently visible (default true). */
export function isLayerVisible(id: string): boolean {
  return layerViewState($layerView.get(), id).visible;
}

/** True when the layer is locked (default false). */
export function isLayerLocked(id: string): boolean {
  return layerViewState($layerView.get(), id).locked;
}

/** True when the layer's entities are shown in the Assets list (default true). */
export function isLayerListed(id: string): boolean {
  return layerViewState($layerView.get(), id).listed;
}

/** A layer's viewport opacity multiplier, 0–1 (default 1). */
export function layerOpacity(id: string): number {
  return layerViewState($layerView.get(), id).opacity;
}

function setLayerView(id: string, patch: Partial<LayerViewState>): void {
  const current = $layerView.get();
  $layerView.set({ ...current, [id]: { ...layerViewState(current, id), ...patch } });
}

/** Toggles a layer's visibility. Hidden layers render nothing in the viewport. */
export function toggleLayerVisible(id: string): void {
  setLayerView(id, { visible: !isLayerVisible(id) });
}

/**
 * Toggles whether a layer's entities appear in the Assets list. Purely a list-
 * display preference — unlike lock, it does NOT prune selection (cross-layer
 * selection persists even for layers hidden from the list).
 */
export function toggleLayerListed(id: string): void {
  setLayerView(id, { listed: !isLayerListed(id) });
}

/**
 * Ensures a layer is shown — visible in the viewport AND present in the Assets
 * list (idempotent). Used after importing into a layer so the import is never
 * hidden by a prior hide/unlist of that layer.
 */
export function revealLayer(id: string): void {
  setLayerView(id, { visible: true, listed: true });
}

/**
 * Sets a layer's lock. Locking also prunes that layer's entities out of the
 * current selection so a locked layer can't be transformed via an existing
 * selection (locked entities are also non-clickable; see EditorScene).
 */
export function setLayerLocked(id: string, locked: boolean): void {
  setLayerView(id, { locked });
  if (locked) deselectLayer(id);
}

/** Toggles a layer's lock (see {@link setLayerLocked}). */
export function toggleLayerLocked(id: string): void {
  setLayerLocked(id, !isLayerLocked(id));
}

/** True when the layer's entity rows are collapsed in the Outliner (default false). */
export function isLayerCollapsed(id: string): boolean {
  return layerViewState($layerView.get(), id).collapsed;
}

/** Toggles the Outliner's expand/collapse chevron for a layer. */
export function toggleLayerCollapsed(id: string): void {
  setLayerView(id, { collapsed: !isLayerCollapsed(id) });
}

/**
 * Ensures a layer's rows are expanded (idempotent). Used by `revealEntity` and the search
 * auto-expand, which must never leave a match hiding behind a collapsed header.
 */
export function expandLayer(id: string): void {
  if (isLayerCollapsed(id)) setLayerView(id, { collapsed: false });
}

/** Sets a layer's viewport opacity multiplier, clamped to 0–1. */
export function setLayerOpacity(id: string, opacity: number): void {
  setLayerView(id, { opacity: Math.min(1, Math.max(0, opacity)) });
}
