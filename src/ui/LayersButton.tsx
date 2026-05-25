import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Popover, PopoverRoot, PopoverTrigger, ToolbarButton, Tooltip } from '@cladd-ui/react'
import { $activeLayer } from '../state/selectors'
import { LayersPanel } from './LayersPanel'
import { Layers } from 'lucide-react'

/**
 * Sidebar-toolbar "Layers" action: opens a popover with the layer list (create,
 * reorder, visibility/lock, select-all, delete). The trigger shows the active
 * layer's name so it's clear where new items will land.
 */
export function LayersButton() {
  const activeLayer = useStore($activeLayer)
  const [open, setOpen] = useState(false)

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Tooltip tooltip="Layers">
          <ToolbarButton aria-label="Layers" className="w-full justify-start">
            <span className="flex w-full min-w-0 items-center gap-1.5">
              <Layers size={18}/>
              <span className="truncate">{activeLayer?.name ?? 'Layers'}</span>
            </span>
          </ToolbarButton>
        </Tooltip>
      </PopoverTrigger>
      {/* Padding lives on the inner content area (not the root) so the focus rings
          of the name input + rows aren't clipped by the content area's overflow. */}
      <Popover position="bottom-end" className="w-[340px] rounded-lg" contentClassName="p-2">
        <LayersPanel onLayerSelected={() => setOpen(false)} />
      </Popover>
    </PopoverRoot>
  )
}
