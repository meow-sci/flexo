import { useStore } from '@nanostores/react';
import { CirclePlus } from 'lucide-react';
import {
  MenuTrigger,
  Menu,
  MenuItem,
  MenuHeader,
  Popover,
  SubmenuTrigger,
  ToolbarButton,
} from './kit';
import {
  $part,
  addCollider,
  addConnector,
  addIvaSeat,
  addKitten,
  addLight,
  addSubPart,
  revealEntity,
  selectLight,
} from '../state/editorStore';
import { requestColliderFit } from '../state/colliderStore';
import { enterEngineMode } from '../state/engineStore';
import { makeKittenMeshPart, openImportModel } from '../state/customAssetStore';
import {
  COLLIDER_SHAPES,
  meshKind,
  type ColliderShape,
  type KittenKind,
  type LightType,
} from '../ksa/types';
import { openDialog } from '../state/dialogStore';

/**
 * INTERIM v1 toolbar "Add" menu. Its five dialogs are now root-hosted behind `dialogStore`
 * ids; the instant actions still call their store mutators directly until the Add menu
 * becomes commands. The menubar replaces this button and this file dies with the old
 * toolbar.
 */
export function AddButton() {
  const part = useStore($part);
  // Every re-placeable custom SubPart — hand-authored primitives AND imported glTF meshes.
  // Kitten submeshes are the exception: they have their own "Make Kitten Mesh" entry and
  // shouldn't clutter the "Custom Meshes" re-add submenu.
  const customMeshes = part.customMeshes.filter((m) => meshKind(m) !== 'kitten');

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
              if (key === 'subpart') openDialog({ id: 'subpart-browser' });
              else if (key === 'connector') addConnector();
              else if (key === 'part') openDialog({ id: 'part-browser' });
              else if (key === 'texture') openDialog({ id: 'upload-texture' });
              else if (key === 'material') openDialog({ id: 'material' });
              else if (key === 'mesh') openDialog({ id: 'create-mesh' });
              // Opens with no files, i.e. on its drop/pick step (see ImportModelDialog).
              else if (key === 'import-model') openImportModel();
              else if (key === 'engine') enterEngineMode();
              // One kind of seat, so no submenu: it lands at the origin looking +X
              // (KSA's own `<IVASeat>` defaults) and the inspector aims it.
              else if (key === 'iva-seat') addIvaSeat();
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
              <MenuItem id="collider">Collider</MenuItem>
              <Popover className="w-56">
                <Menu onAction={(key) => addCollider(key as ColliderShape)}>
                  <MenuHeader>Add at origin</MenuHeader>
                  {COLLIDER_SHAPES.map((shape) => (
                    <MenuItem key={shape} id={shape}>
                      {shape}
                    </MenuItem>
                  ))}
                </Menu>
                {/* Fitting needs world geometry, so it publishes an intent the 3D scene
                    consumes (see colliderStore) rather than calling a store mutator here. */}
                <Menu onAction={(key) => requestColliderFit(key as ColliderShape)}>
                  <MenuHeader>Fit to selection</MenuHeader>
                  {COLLIDER_SHAPES.map((shape) => (
                    <MenuItem key={`fit-${shape}`} id={shape}>
                      {shape}
                    </MenuItem>
                  ))}
                </Menu>
              </Popover>
            </SubmenuTrigger>
            <MenuItem id="iva-seat">IVA Seat</MenuItem>
            <SubmenuTrigger>
              <MenuItem id="light">Light</MenuItem>
              <Popover className="w-44">
                {/* Part-level at the origin — instantly visible and selectable. A
                    SubPart-owned light is authored from the SubPart Data dialog, where
                    the owner template is unambiguous. addLight appends, so the new
                    light is the last entry (it returns nothing). */}
                <Menu
                  onAction={(key) => {
                    addLight(null, { type: key as LightType });
                    const lights = $part.get().lights;
                    selectLight(lights.length - 1);
                    revealEntity('light', lights[lights.length - 1].id);
                  }}
                >
                  <MenuItem id="Spot">Spot light</MenuItem>
                  <MenuItem id="Point">Point light</MenuItem>
                </Menu>
              </Popover>
            </SubmenuTrigger>
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
    </>
  );
}
