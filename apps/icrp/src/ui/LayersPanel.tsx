/**
 * Layers: editor-only grouping (never exported — KSA XML has no layers).
 * Row controls: eye = visibility, padlock = lock (rendered but unpickable),
 * ◎ = select contents, ◐ = isolate (solo; second press restores), double-click
 * = inline rename. Click = active layer (new placements land there).
 */
import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Crosshair, Eye, EyeOff, Lock, LockOpen, MousePointer2, Trash2 } from 'lucide-react';
import { Button, cn } from '../../../../src/ui/kit';
import { DEFAULT_LAYER_ID } from '../ksa/types';
import {
  $activeLayerId,
  $activeObject,
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
  const counts = new Map<string, number>();
  for (const pl of obj.placements) counts.set(pl.layerId, (counts.get(pl.layerId) ?? 0) + 1);

  const commitRename = (layerId: string) => {
    const name = draft.trim();
    if (name) renameLayer(layerId, name);
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Layers</div>
      {obj.layers.map((layer) => (
        <div key={layer.id} className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${layer.visible ? 'Hide' : 'Show'} layer ${layer.name}`}
            onPress={() => setLayerVisible(layer.id, !layer.visible)}
          >
            {layer.visible ? <Eye size={12} /> : <EyeOff size={12} className="text-fg-subtle" />}
          </Button>
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
              <span className="ml-1 text-[11px] text-fg-subtle">{counts.get(layer.id) ?? 0}</span>
            </button>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Isolate layer ${layer.name}`}
            onPress={() => isolateLayer(layer.id)}
          >
            <Crosshair size={12} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Select contents of ${layer.name}`}
            onPress={() => selectLayerContents(layer.id)}
          >
            <MousePointer2 size={12} />
          </Button>
          {layer.id !== DEFAULT_LAYER_ID && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete layer ${layer.name}`}
              onPress={() => removeLayer(layer.id)}
            >
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => addLayer(`Layer ${obj.layers.length + 1}`)}
        >
          + New layer
        </Button>
        {selection.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setPlacementsLayer(selection, activeLayerId)}
          >
            Move {selection.length} here
          </Button>
        )}
      </div>
    </div>
  );
}
