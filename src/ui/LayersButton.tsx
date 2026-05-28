import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Layers } from 'lucide-react'
import { DialogTrigger, Popover, PopoverDialog, Button } from './kit'
import { $activeLayer } from '../state/selectors'
import { LayersPanel } from './LayersPanel'

/**
 * "Layers" action: opens a popover with the layer list (create, reorder,
 * visibility/lock, select-all, delete). The trigger shows the active layer's
 * name so it's clear where new items will land.
 */
export function LayersButton() {
  const activeLayer = useStore($activeLayer)
  const [open, setOpen] = useState(false)

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" className="w-full min-w-0 justify-start" aria-label="Layers">
        <Layers size={16} className="shrink-0" />
        <span className="truncate">{activeLayer?.name ?? 'Layers'}</span>
      </Button>
      <Popover placement="bottom end" className="w-[min(450px,calc(100vw-1.5rem))]">
        <PopoverDialog className="p-2">
          <LayersPanel onLayerSelected={() => setOpen(false)} />
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  )
}
