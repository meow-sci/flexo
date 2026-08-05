import { useStore } from '@nanostores/react';
import { Boxes, Clapperboard, Rocket } from 'lucide-react';
import { Toolbar, Button } from './kit';
import { $part } from '../state/editorStore';
import { setMode } from '../state/modeStore';
import { $engineEntries } from '../state/engineStore';
import { openDialog } from '../state/dialogStore';
import { LayersButton } from './LayersButton';

/**
 * Toolbar above the Assets list. Holds the Layers button (stretches to fill,
 * shows the layer count + active layer), a "Custom (N)" button that opens the
 * root-hosted custom-assets manager (dialog id `'custom-assets'`; N = custom meshes +
 * uploaded textures), and an "Anim (N)" button that swaps the inspector to the
 * full-sidebar Animation editor.
 */
export function AssetsToolbar() {
  const part = useStore($part);
  const engineEntries = useStore($engineEntries);
  const customCount = part.customTextures.length + part.customMeshes.length;
  const animCount = part.animations.length;
  // Counts engine SCOPES, so a part whose engine hardware lives on `<PartGameData>` (the
  // stock RCS pattern) shows up too rather than reading as "no engines".
  const engineCount = engineEntries.length;

  return (
    <Toolbar aria-label="Assets">
      <div className="min-w-0 flex-1">
        <LayersButton />
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0"
        onPress={() => openDialog({ id: 'custom-assets' })}
      >
        <Boxes size={16} className="shrink-0" />
        Custom ({customCount})
      </Button>
      <Button size="sm" variant="secondary" className="shrink-0" onPress={() => setMode('engine')}>
        <Rocket size={16} className="shrink-0" />
        Engine{engineCount ? ` (${engineCount})` : ''}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0"
        onPress={() => setMode('animation')}
      >
        <Clapperboard size={16} className="shrink-0" />
        Anim{animCount ? ` (${animCount})` : ''}
      </Button>
    </Toolbar>
  );
}
