/** The objects list (right sidebar): switch / rename / delete / new. */
import { useStore } from '@nanostores/react';
import { Trash2 } from 'lucide-react';
import { Button, cn } from '../../../../src/ui/kit';
import {
  $activeObject,
  $project,
  addObject,
  removeObject,
  renameObject,
  switchObject,
} from '../state/docStore';

export function ObjectsPanel() {
  const project = useStore($project);
  const active = useStore($activeObject);
  return (
    <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Objects</div>
      {project.objects.map((o) => (
        <div key={o.id} className="flex items-center gap-1">
          <button
            type="button"
            className={cn(
              'flex-1 truncate rounded px-2 py-0.5 text-left text-sm hover:bg-wash-hover',
              o.id === active.id ? 'bg-wash-selected text-fg' : 'text-fg-muted',
            )}
            onClick={() => switchObject(o.id)}
            onDoubleClick={() => {
              const name = prompt('Object name', o.name);
              if (name) renameObject(o.id, name);
            }}
          >
            {o.name}
            <span className="ml-1 text-[11px] text-fg-subtle">{o.placements.length}</span>
          </button>
          {project.objects.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete ${o.name}`}
              onPress={() => removeObject(o.id)}
            >
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      ))}
      <Button size="sm" variant="ghost" onPress={() => addObject()}>
        + New object
      </Button>
      <div className="text-[11px] text-fg-subtle">
        Each object exports as one &lt;StaticObject&gt;; a launch site points at exactly one.
      </div>
    </div>
  );
}
