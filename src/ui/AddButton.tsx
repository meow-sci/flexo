import { useState } from 'react'
import { List, ListButton, ListTitle, Popover, PopoverRoot, PopoverTrigger, ToolbarButton } from '@cladd-ui/react'
import { CirclePlus } from 'lucide-react'
import { addConnector } from '../state/editorStore'
import { SubPartPopup } from './AddSubPartButton'
import { PartPopup } from './AddPartButton'

export function AddButton() {
  const [open, setOpen] = useState(false)
  const [subPartOpen, setSubPartOpen] = useState(false)
  const [partOpen, setPartOpen] = useState(false)

  return (
    <>
      <PopoverRoot open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <ToolbarButton>
            <span className="flex items-center gap-1.5">
              <CirclePlus size={16} />
              Add
            </span>
          </ToolbarButton>
        </PopoverTrigger>
        <Popover position="bottom-start" className="w-52 rounded-lg">
          <List>
            <ListTitle>Add</ListTitle>
            <ListButton size="md" onClick={() => { setOpen(false); setSubPartOpen(true) }}>
              SubPart
            </ListButton>
            <ListButton size="md" onClick={() => { setOpen(false); addConnector() }}>
              Connector
            </ListButton>
            <ListButton size="md" onClick={() => { setOpen(false); setPartOpen(true) }}>
              Import built-in Part
            </ListButton>
          </List>
        </Popover>
      </PopoverRoot>
      <SubPartPopup open={subPartOpen} onOpenChange={setSubPartOpen} />
      <PartPopup open={partOpen} onOpenChange={setPartOpen} />
    </>
  )
}
