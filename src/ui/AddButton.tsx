import { useRef, useState } from 'react'
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
  toast,
} from './kit'
import { $part, addConnector, addKitten, addSubPart } from '../state/editorStore'
import { enterEngineMode } from '../state/engineStore'
import { importModelAsMeshes, makeKittenMeshPart } from '../state/customAssetStore'
import { loadModelFile } from '../three/loadModelFile'
import { analyzeImport, DEFAULT_IMPORT_OPTIONS } from '../ksa/importPlan'
import { normalizeImport } from '../ksa/importNormalize'
import type { KittenKind } from '../ksa/types'
import { SubPartPopup } from './SubPartBrowser'
import { PartPopup } from './PartBrowser'
import { CustomTextureDialog } from './CustomTextureDialog'
import { CreateMeshDialog } from './CreateMeshDialog'
import { MaterialDialog } from './MaterialDialog'

export function AddButton() {
  const part = useStore($part)
  // Kitten submeshes aren't user-editable primitives — they have their own "Make
  // Kitten Mesh" entry and shouldn't clutter the "Custom Meshes" re-add submenu.
  const customMeshes = part.customMeshes.filter((m) => !m.kitten)
  const [subPartOpen, setSubPartOpen] = useState(false)
  const [partOpen, setPartOpen] = useState(false)
  const [textureOpen, setTextureOpen] = useState(false)
  const [materialOpen, setMaterialOpen] = useState(false)
  const [meshOpen, setMeshOpen] = useState(false)
  const modelInput = useRef<HTMLInputElement>(null)

  /**
   * Import with the defaults, no questions asked.
   * TODO(phase 4): replace with `ImportModelDialog` — preview, stats, options (scale / up-axis /
   * bake / double-sided) and the warning list. See plans/IMPORT_MODELS.md §4.2.
   */
  const runImport = async (files: File[]) => {
    try {
      const model = await loadModelFile(files)
      const plan = analyzeImport(model, DEFAULT_IMPORT_OPTIONS)
      const normalized = await normalizeImport(plan, DEFAULT_IMPORT_OPTIONS)
      try {
        await importModelAsMeshes(normalized, model.fileName)
      } finally {
        // The normalized geometries are consumed by the atlas GLB; the editor renders from
        // that GLB via importedMeshCache, so these copies are ours to free.
        for (const mesh of normalized.meshes) mesh.geometry.dispose()
      }
      toast({
        title: 'Model imported',
        description: `${normalized.meshes.length} SubPart${
          normalized.meshes.length === 1 ? '' : 's'
        } from ${model.fileName}`,
        variant: 'success',
      })
    } catch (err) {
      console.error('flexo: model import failed', err)
      toast({
        title: 'Import failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'danger',
      })
    }
  }

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
              else if (key === 'import-model') modelInput.current?.click()
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
      {/* A `.gltf` needs its siblings (.bin + images) picked alongside it, hence `multiple`;
          `loadModelFile` picks the entry file out of the set and resolves the rest. */}
      <input
        ref={modelInput}
        type="file"
        accept=".glb,.gltf,.bin,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const input = e.currentTarget
          const files = Array.from(input.files ?? [])
          input.value = '' // re-picking the same file must fire change again
          if (files.length > 0) void runImport(files)
        }}
      />
    </>
  )
}
