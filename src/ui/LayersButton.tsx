import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Layers } from 'lucide-react'
import { DialogTrigger, Popover, PopoverDialog, Button, Tooltip } from './kit'
import { $part } from '../state/editorStore'
import { $activeLayer } from '../state/selectors'
import { LayersPanel } from './LayersPanel'

/**
 * "Layers" action: opens a popover with the layer list (create, reorder,
 * visibility/lock, list toggle, select-all, delete). The trigger shows the layer
 * count and the active layer's name (where new items land); it stretches to fill
 * the toolbar and ellipsis-truncates a long name, with a tooltip for the full name.
 */
export function LayersButton() {
  const part = useStore($part)
  const activeLayer = useStore($activeLayer)
  const [open, setOpen] = useState(false)

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Tooltip content={activeLayer?.name ?? 'Layers'}>
        <Button variant="secondary" size="sm" className="w-full min-w-0 justify-start" aria-label="Layers">
          <Layers size={16} className="shrink-0" />
          <span className="shrink-0">Layers ({part.layers.length})</span>
          {activeLayer && <span className="min-w-0 flex-1 truncate text-fg-muted">· {activeLayer.name}</span>}
        </Button>
      </Tooltip>
      <Popover placement="bottom end" className="w-[min(450px,calc(100vw-1.5rem))]">
        <PopoverDialog className="p-2">
          <LayersPanel onLayerSelected={() => setOpen(false)} />
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  )
}
