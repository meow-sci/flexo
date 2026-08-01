import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Boxes, X } from 'lucide-react';
import { Toolbar, Button } from './kit';
import { $activeAnimation } from '../state/animationStore';
import { setInspectorMode } from '../state/uiStore';
import { MeshPickerModal } from './MeshPickerModal';

/**
 * Toolbar shown above the Animation editor while the inspector is in 'anim' mode
 * (the Assets list is hidden). "Mesh Picker" opens the searchable SubPart grid for
 * attaching parts to the active joint; "Close" returns to the Assets list.
 */
export function AnimToolbar() {
  const active = useStore($activeAnimation);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <Toolbar aria-label="Animation">
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onPress={() => setPickerOpen(true)}
        >
          <Boxes size={16} className="shrink-0" />
          Mesh Picker
        </Button>
        <span className="min-w-0 flex-1 truncate px-1 text-sm text-fg-subtle" title={active?.name}>
          {active?.name ?? 'Animations'}
        </span>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onPress={() => setInspectorMode('assets')}
        >
          <X size={16} className="shrink-0" />
          Close
        </Button>
      </Toolbar>
      <MeshPickerModal isOpen={pickerOpen} onOpenChange={setPickerOpen} />
    </>
  );
}
