import { useStore } from '@nanostores/react';
import { Rocket, X } from 'lucide-react';
import { Toolbar, Button } from './kit';
import { $activeEngineEntry, engineEntryShortLabel, type EngineEntry } from '../state/engineStore';
import { setMode } from '../state/modeStore';

/** What the toolbar calls the open engine — a template's short name, or the part scope. */
function entryLabel(entry: EngineEntry | null): string {
  return entry ? engineEntryShortLabel(entry) : 'Engine Designer';
}

/**
 * Toolbar shown above the Engine designer while the inspector is in 'engine' mode
 * (the Assets list is hidden). Shows the active engine and a "Close" that returns to
 * the Assets list. Mirrors {@link import('./AnimToolbar').AnimToolbar}.
 */
export function EngineToolbar() {
  const activeEntry = useStore($activeEngineEntry);
  const label = entryLabel(activeEntry);
  return (
    <Toolbar aria-label="Engine">
      <Rocket size={16} className="shrink-0 text-fg-subtle" />
      <span
        className="min-w-0 flex-1 truncate px-1 text-sm text-fg-subtle"
        title={activeEntry?.kind === 'subpart' ? activeEntry.templateId : label}
      >
        {label}
      </span>
      <Button size="sm" variant="secondary" className="shrink-0" onPress={() => setMode('build')}>
        <X size={16} className="shrink-0" />
        Close
      </Button>
    </Toolbar>
  );
}
