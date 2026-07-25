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
import { enterEngineMode } from '../state/engineStore'
import { makeKittenMeshPart, openImportModel } from '../state/customAssetStore'
import { meshKind, type KittenKind } from '../ksa/types'
import { SubPartPopup } from './SubPartBrowser'
import { PartPopup } from './PartBrowser'
import { CustomTextureDialog } from './CustomTextureDialog'
import { CreateMeshDialog } from './CreateMeshDialog'
import { MaterialDialog } from './MaterialDialog'

export function AddButton() {
  const part = useStore($part)
  // Every re-placeable custom SubPart — hand-authored primitives AND imported glTF meshes.
  // Kitten submeshes are the exception: they have their own "Make Kitten Mesh" entry and
  // shouldn't clutter the "Custom Meshes" re-add submenu.
  const customMeshes = part.customMeshes.filter((m) => meshKind(m) !== 'kitten')
  const [subPartOpen, setSubPartOpen] = useState(false)
  const [partOpen, setPartOpen] = useState(false)
  const [textureOpen, setTextureOpen] = useState(false)
  const [materialOpen, setMaterialOpen] = useState(false)
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
              else if (key === 'material') setMaterialOpen(true)
              else if (key === 'mesh') setMeshOpen(true)
              // Opens with no files, i.e. on its drop/pick step (see ImportModelDialog).
              else if (key === 'import-model') openImportModel()
              else if (key === 'engine') enterEngineMode()
            }}
          >
            <MenuHeader>Add</MenuHeader>
            <MenuItem id="subpart">SubPart</MenuItem>
            <MenuItem id="connector">Connector</MenuItem>
            <MenuItem id="part">Import built-in Part</MenuItem>
            <MenuItem id="engine">Define Engine…</MenuItem>
            <MenuItem id="texture">Upload texture…</MenuItem>
            <MenuItem id="material">Create material…</MenuItem>
            <MenuItem id="mesh">Create mesh…</MenuItem>
            <MenuItem id="import-model">Import model…</MenuItem>
            {customMeshes.length > 0 && (
              <SubmenuTrigger>
                <MenuItem id="custom-meshes">Custom Meshes</MenuItem>
                <Popover className="w-52">
                  <Menu onAction={(key) => addSubPart(String(key))}>
                    {customMeshes.map((m) => (
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
            <SubmenuTrigger>
              <MenuItem id="kitten-mesh">Make Kitten Mesh</MenuItem>
              <Popover className="w-40">
                <Menu
                  onAction={(key) =>
                    void makeKittenMeshPart(key as KittenKind).catch((err) =>
                      console.error('flexo: make kitten mesh failed', err),
                    )
                  }
                >
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
      {materialOpen && <MaterialDialog onClose={() => setMaterialOpen(false)} />}
      {meshOpen && <CreateMeshDialog onClose={() => setMeshOpen(false)} />}
    </>
  )
}
