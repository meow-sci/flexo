/**
 * Layers: editor-only grouping (never exported — KSA XML has no layers).
 * Click = active layer (new placements land there); eye = visibility (hidden
 * layers render nothing and are unpickable); ◎ selects the layer's contents —
 * with the multi-select gizmo that makes a layer behave like a movable
 * primitive (the point of stock-part imports).
 */
import { useStore } from '@nanostores/react';
import { Eye, EyeOff, MousePointer2, Trash2 } from 'lucide-react';
import { Button, cn } from '../../../../src/ui/kit';
import { DEFAULT_LAYER_ID } from '../ksa/types';
import {
  $activeLayerId,
  $activeObject,
  $selection,
  addLayer,
  removeLayer,
  renameLayer,
  selectLayerContents,
  setLayerVisible,
  setPlacementsLayer,
} from '../state/docStore';

export function LayersPanel() {
  const obj = useStore($activeObject);
  const activeLayerId = useStore($activeLayerId);
  const selection = useStore($selection);
  const counts = new Map<string, number>();
  for (const pl of obj.placements) counts.set(pl.layerId, (counts.get(pl.layerId) ?? 0) + 1);
  return (
    <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Layers</div>
      {obj.layers.map((layer) => (
        <div key={layer.id} className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${layer.visible ? 'Hide' : 'Show'} layer ${layer.name}`}
            onPress={() => setLayerVisible(layer.id, !layer.visible)}
          >
            {layer.visible ? <Eye size={12} /> : <EyeOff size={12} className="text-fg-subtle" />}
          </Button>
          <button
            type="button"
            className={cn(
              'flex-1 truncate rounded px-1.5 py-0.5 text-left text-sm hover:bg-wash-hover',
              layer.id === activeLayerId ? 'bg-wash-selected text-fg' : 'text-fg-muted',
            )}
            title="Click: make active · double-click: rename"
            onClick={() => $activeLayerId.set(layer.id)}
            onDoubleClick={() => {
              const name = prompt('Layer name', layer.name);
              if (name) renameLayer(layer.id, name);
            }}
          >
            {layer.name}
            <span className="ml-1 text-[11px] text-fg-subtle">{counts.get(layer.id) ?? 0}</span>
          </button>
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
