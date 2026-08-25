/**
 * Layers: editor-only grouping (never exported — KSA XML has no layers) PLUS
 * the placement OUTLINER: each layer expands (chevron) to list its individual
 * pieces for single-piece selection — click selects one, ⌘/Ctrl/Shift-click
 * toggles it into the selection — while the layer-level controls keep whole-
 * group select/move. Row controls: eye = visibility, padlock = lock (rendered
 * but unpickable), crosshair = isolate (solo; second press restores),
 * pointer = select contents, double-click = inline rename. Click = active
 * layer (new placements land there).
 */
import { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  ChevronDown,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  MousePointer2,
  Trash2,
} from 'lucide-react';
import { Button, Tooltip, cn } from '../../../../src/ui/kit';
import { DEFAULT_LAYER_ID } from '../ksa/types';
import { pieceShortName } from '../ksa/staticCatalog';
import {
  $activeLayerId,
  $activeObject,
  $colliderSelection,
  $selection,
  addLayer,
  isolateLayer,
  removeLayer,
  renameLayer,
  selectLayerContents,
  setLayerLocked,
  setLayerVisible,
  setPlacementsLayer,
} from '../state/docStore';

export function LayersPanel() {
  const obj = useStore($activeObject);
  const activeLayerId = useStore($activeLayerId);
  const selection = useStore($selection);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // The active layer starts expanded so the piece outliner is discoverable.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([activeLayerId]));
  const counts = new Map<string, number>();
  for (const pl of obj.placements) counts.set(pl.layerId, (counts.get(pl.layerId) ?? 0) + 1);
  const selected = new Set(selection);

  const commitRename = (layerId: string) => {
    const name = draft.trim();
    if (name) renameLayer(layerId, name);
    setEditingId(null);
  };

  const toggleExpanded = (layerId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  };

  const selectPlacement = (id: string, additive: boolean) => {
    $colliderSelection.set(null);
    if (!additive) {
      $selection.set([id]);
      return;
    }
    $selection.set(selected.has(id) ? selection.filter((s) => s !== id) : [...selection, id]);
  };

  return (
    <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Layers</div>
      {obj.layers.map((layer) => {
        const isExpanded = expanded.has(layer.id);
        const placements = obj.placements.filter((pl) => pl.layerId === layer.id);
        return (
          <div key={layer.id} className="flex flex-col">
            <div className="flex items-center gap-0.5">
              <Tooltip
                content={isExpanded ? 'Collapse piece list' : 'Show the pieces in this layer'}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} layer ${layer.name}`}
                  onPress={() => toggleExpanded(layer.id)}
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </Button>
              </Tooltip>
              <Tooltip content={layer.visible ? 'Hide this layer' : 'Show this layer'}>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`${layer.visible ? 'Hide' : 'Show'} layer ${layer.name}`}
                  onPress={() => setLayerVisible(layer.id, !layer.visible)}
                >
                  {layer.visible ? (
                    <Eye size={12} />
                  ) : (
                    <EyeOff size={12} className="text-fg-subtle" />
                  )}
                </Button>
              </Tooltip>
              <Tooltip
                content={
                  layer.locked ? 'Unlock (make pieces clickable)' : 'Lock (visible but unclickable)'
                }
              >
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`${layer.locked ? 'Unlock' : 'Lock'} layer ${layer.name}`}
                  onPress={() => setLayerLocked(layer.id, !layer.locked)}
                >
                  {layer.locked ? (
                    <Lock size={12} className="text-warning" />
                  ) : (
                    <LockOpen size={12} className="text-fg-subtle" />
                  )}
                </Button>
              </Tooltip>
              {editingId === layer.id ? (
                <input
                  className="min-w-0 flex-1 rounded border border-accent bg-panel-sunken px-1.5 py-0.5 text-sm text-fg outline-none"
                  value={draft}
                  autoFocus
                  aria-label={`Rename layer ${layer.name}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(layer.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(layer.id);
                    if (e.key === 'Escape') setEditingId(null);
                    e.stopPropagation();
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={cn(
                    'min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left text-sm hover:bg-wash-hover',
                    layer.id === activeLayerId ? 'bg-wash-selected text-fg' : 'text-fg-muted',
                  )}
                  title="Click: make active · double-click: rename"
                  onClick={() => $activeLayerId.set(layer.id)}
                  onDoubleClick={() => {
                    setEditingId(layer.id);
                    setDraft(layer.name);
                  }}
                >
                  {layer.name}
                  <span className="ml-1 text-[11px] text-fg-subtle">
                    {counts.get(layer.id) ?? 0}
                  </span>
                </button>
              )}
              <Tooltip content="Isolate: show only this layer (press again to restore)">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Isolate layer ${layer.name}`}
                  onPress={() => isolateLayer(layer.id)}
                >
                  <Crosshair size={12} />
                </Button>
              </Tooltip>
              <Tooltip content="Select every piece in this layer (move them together)">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Select contents of ${layer.name}`}
                  onPress={() => selectLayerContents(layer.id)}
                >
                  <MousePointer2 size={12} />
                </Button>
              </Tooltip>
              {layer.id !== DEFAULT_LAYER_ID && (
                <Tooltip content="Delete layer (pieces move to the default layer)">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete layer ${layer.name}`}
                    onPress={() => removeLayer(layer.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </Tooltip>
              )}
            </div>
            {isExpanded && (
              <div className="ml-5 flex flex-col border-l border-border/60 pl-1">
                {placements.length === 0 && (
                  <div className="px-1.5 py-0.5 text-[11px] text-fg-subtle">No pieces yet</div>
                )}
                {placements.map((pl) => (
                  <button
                    key={pl.instanceId}
                    type="button"
                    className={cn(
                      'truncate rounded px-1.5 py-0.5 text-left text-xs hover:bg-wash-hover',
                      selected.has(pl.instanceId) ? 'bg-accent/20 text-fg' : 'text-fg-muted',
                    )}
                    title="Click: select this piece · ⌘/Ctrl/Shift-click: add to selection"
                    aria-label={`Select piece ${pieceShortName(pl.pieceId)}`}
                    onClick={(e) =>
                      selectPlacement(pl.instanceId, e.metaKey || e.ctrlKey || e.shiftKey)
                    }
                  >
                    {pieceShortName(pl.pieceId)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-1">
        <Tooltip content="Create a new empty layer and make it active">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => addLayer(`Layer ${obj.layers.length + 1}`)}
          >
            + New layer
          </Button>
        </Tooltip>
        {selection.length > 0 && (
          <Tooltip content="Move the selected pieces into the active layer">
            <Button
              size="sm"
              variant="ghost"
              onPress={() => setPlacementsLayer(selection, activeLayerId)}
            >
              Move {selection.length} here
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
