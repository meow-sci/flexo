import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { CirclePlus } from 'lucide-react'
import {
  MenuTrigger,
  Menu,
  MenuItem,
  MenuHeader,
  Popover,
  SubmenuTrigger,
  ToolbarButton,
} from './kit'
import { $part, addConnector, addKitten, addSubPart } from '../state/editorStore'
import type { KittenKind } from '../ksa/types'
import { SubPartPopup } from './AddSubPartButton'
import { PartPopup } from './AddPartButton'
import { CustomTextureDialog } from './CustomTextureDialog'
import { CreateMeshDialog } from './CreateMeshDialog'

export function AddButton() {
  const part = useStore($part)
  const [subPartOpen, setSubPartOpen] = useState(false)
  const [partOpen, setPartOpen] = useState(false)
  const [textureOpen, setTextureOpen] = useState(false)
  const [meshOpen, setMeshOpen] = useState(false)

  return (
    <>
      <MenuTrigger>
        <ToolbarButton>
          <CirclePlus size={16} />
          Add
        </ToolbarButton>
        <Popover placement="bottom start" className="w-52">
          <Menu
            onAction={(key) => {
              if (key === 'subpart') setSubPartOpen(true)
              else if (key === 'connector') addConnector()
              else if (key === 'part') setPartOpen(true)
              else if (key === 'texture') setTextureOpen(true)
              else if (key === 'mesh') setMeshOpen(true)
            }}
          >
            <MenuHeader>Add</MenuHeader>
            <MenuItem id="subpart">SubPart</MenuItem>
            <MenuItem id="connector">Connector</MenuItem>
            <MenuItem id="part">Import built-in Part</MenuItem>
            <MenuItem id="texture">Upload texture…</MenuItem>
            <MenuItem id="mesh">Create mesh…</MenuItem>
            {part.customMeshes.length > 0 && (
              <SubmenuTrigger>
                <MenuItem id="custom-meshes">Custom Meshes</MenuItem>
                <Popover className="w-52">
                  <Menu onAction={(key) => addSubPart(String(key))}>
                    {part.customMeshes.map((m) => (
                      <MenuItem key={m.id} id={m.subPartId}>
                        {m.name}
                      </MenuItem>
                    ))}
                  </Menu>
                </Popover>
              </SubmenuTrigger>
            )}
            <SubmenuTrigger>
              <MenuItem id="kitten">Kitten</MenuItem>
              <Popover className="w-40">
                <Menu onAction={(key) => addKitten(key as KittenKind)}>
                  <MenuItem id="hunter">Hunter</MenuItem>
                  <MenuItem id="polaris">Polaris</MenuItem>
                  <MenuItem id="banjo">Banjo</MenuItem>
                </Menu>
              </Popover>
            </SubmenuTrigger>
          </Menu>
        </Popover>
      </MenuTrigger>
      <SubPartPopup open={subPartOpen} onOpenChange={setSubPartOpen} />
      <PartPopup open={partOpen} onOpenChange={setPartOpen} />
      {textureOpen && <CustomTextureDialog onClose={() => setTextureOpen(false)} />}
      {meshOpen && <CreateMeshDialog onClose={() => setMeshOpen(false)} />}
    </>
  )
}
