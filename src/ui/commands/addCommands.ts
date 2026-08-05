import type { Command } from '../../state/commandStore';
import { openDialog } from '../../state/dialogStore';
import {
  $part,
  addCollider,
  addConnector,
  addIvaSeat,
  addKitten,
  addLight,
  addSubPart,
  revealEntity,
} from '../../state/editorStore';
import { $hasSelection } from '../../state/selectors';
import { requestColliderFit } from '../../state/colliderStore';
import { makeKittenMeshPart, openImportModel } from '../../state/customAssetStore';
import {
  COLLIDER_SHAPES,
  COLLIDER_SHAPE_LABELS,
  KITTEN_KINDS,
  KITTEN_LABELS,
  meshKind,
  type LightType,
} from '../../ksa/types';
import { $mode, setMode } from '../../state/modeStore';
import { toast } from '../toast';
import type { EntityKind } from '../../state/editorStore';

/**
 * Add menu commands (design: foundation §3 "Add").
 *
 * The choreography EVERY instant entity item runs, in order (design §6.1 table row 1):
 * auto-switch to Build (S27) → the store action, which lands the entity on the ACTIVE layer
 * at the origin with KSA's own defaults (connector faces +X, seat looks +X, kitten faces
 * −Z) and selects it → `revealEntity` scrolls its Outliner row into view → a transient
 * status flash naming what landed. Asset dialogs open in place and run none of it.
 *
 * Undo enrollment: none here. `addConnector` / `addCollider` / `addIvaSeat` / `addLight` /
 * `addKitten` / `addSubPart` each push their own discrete undo step — never double-push.
 */

/**
 * The S27 auto-switch: an entity added from another mode would land in a sidebar that
 * cannot show it, so every entity add switches to Build first (design: foundation §2.5 —
 * a jump, not a stack). Selection, camera and undo history are untouched by the switch.
 */
function ensureBuildMode(): void {
  if ($mode.get() !== 'build') setMode('build');
}

/**
 * The tail of the choreography: reveal the entity the store just added and select-flashed,
 * then flash what landed. `id` is read from the document AFTER the action (the store
 * actions generate their own ids), so this is always the entity that was really appended.
 */
function landed(kind: EntityKind, id: string | undefined, label: string): void {
  if (id) revealEntity(kind, id);
  toast({ title: `${label} added` });
}

/** The id of the last entity of `kind` in the document — i.e. the one just appended. */
function lastId(
  kind: 'connector' | 'collider' | 'ivaSeat' | 'light' | 'kitten',
): string | undefined {
  const part = $part.get();
  const list =
    kind === 'connector'
      ? part.connectors
      : kind === 'collider'
        ? part.colliders
        : kind === 'ivaSeat'
          ? part.ivaSeats
          : kind === 'light'
            ? part.lights
            : part.kittens;
  return list[list.length - 1]?.id;
}

const colliderCommands: Command[] = COLLIDER_SHAPES.flatMap((shape) => [
  {
    id: `add.collider:${shape}`,
    title: COLLIDER_SHAPE_LABELS[shape],
    menuPath: 'Add ▸ Collider',
    keywords: `collider collision ${shape.toLowerCase()}`,
    keepOpen: true,
    run: () => {
      ensureBuildMode();
      addCollider(shape);
      landed('collider', lastId('collider'), 'Collider');
    },
  },
  {
    id: `add.colliderFit:${shape}`,
    title: COLLIDER_SHAPE_LABELS[shape],
    menuPath: 'Add ▸ Collider ▸ Fit to Selection',
    keywords: `collider fit wrap ${shape.toLowerCase()}`,
    keepOpen: true,
    // Fitting needs world geometry, so this publishes an intent the 3D scene consumes
    // rather than mutating the document here (see colliderStore).
    enabled: () => $hasSelection.get(),
    run: () => {
      ensureBuildMode();
      requestColliderFit(shape);
    },
  },
]);

const lightCommands: Command[] = (['Spot', 'Point'] as LightType[]).map((type) => ({
  id: `add.light:${type}`,
  title: type,
  menuPath: 'Add ▸ Light',
  keywords: `light lamp ${type.toLowerCase()}`,
  keepOpen: true,
  run: () => {
    ensureBuildMode();
    // Part-level at the origin — instantly visible and selectable. A SubPart-owned light
    // is authored from the SubPart Data dialog, where the owner template is unambiguous.
    // `addLight` selects what it added (like every other add*), so only the reveal is left.
    addLight(null, { type });
    landed('light', lastId('light'), 'Light');
  },
}));

const kittenCommands: Command[] = KITTEN_KINDS.map((kind) => ({
  id: `add.kitten:${kind}`,
  title: KITTEN_LABELS[kind],
  menuPath: 'Add ▸ Kitten',
  keywords: `kitten character scale reference ${kind}`,
  keepOpen: true,
  run: () => {
    ensureBuildMode();
    addKitten(kind);
    landed('kitten', lastId('kitten'), 'Kitten');
  },
}));

const kittenMeshCommands: Command[] = KITTEN_KINDS.map((kind) => ({
  id: `add.kittenMesh:${kind}`,
  title: KITTEN_LABELS[kind],
  menuPath: 'Add ▸ Make Kitten Mesh',
  keywords: `kitten mesh bake exportable ${kind}`,
  run: () =>
    void makeKittenMeshPart(kind).catch((err) =>
      console.error('flexo: make kitten mesh failed', err),
    ),
}));

export const ADD_COMMANDS: Command[] = [
  {
    id: 'add.subpart',
    title: 'SubPart…',
    menuPath: 'Add',
    keywords: 'catalog browser mesh part piece',
    run: () => openDialog({ id: 'subpart-browser' }),
  },
  {
    id: 'add.builtinPart',
    title: 'Built-in Part…',
    menuPath: 'Add',
    keywords: 'catalog browser import core part',
    run: () => openDialog({ id: 'part-browser' }),
  },
  {
    id: 'add.connector',
    title: 'Connector',
    menuPath: 'Add',
    keywords: 'attach node dock surface',
    keepOpen: true,
    run: () => {
      ensureBuildMode();
      addConnector();
      landed('connector', lastId('connector'), 'Connector');
    },
  },
  ...colliderCommands,
  {
    id: 'add.ivaSeat',
    title: 'IVA Seat',
    menuPath: 'Add',
    keywords: 'iva seat interior camera eye',
    keepOpen: true,
    run: () => {
      ensureBuildMode();
      // One kind of seat, so no submenu: it lands at the origin looking +X (KSA's own
      // <IVASeat> defaults) and the inspector aims it.
      addIvaSeat();
      landed('ivaSeat', lastId('ivaSeat'), 'IVA Seat');
    },
  },
  ...lightCommands,
  ...kittenCommands,
  {
    id: 'add.primitiveMesh',
    title: 'Primitive Mesh…',
    menuPath: 'Add',
    keywords: 'create mesh box cylinder sphere plane custom',
    run: () => openDialog({ id: 'create-mesh' }),
  },
  {
    id: 'add.importModel',
    title: 'Import Model…',
    menuPath: 'Add',
    keywords: 'glb gltf import model blender',
    // Opens with no files, i.e. on its drop/pick step (see ImportModelDialog).
    run: () => openImportModel(),
  },
  {
    id: 'add.uploadTexture',
    title: 'Upload Texture…',
    menuPath: 'Add',
    keywords: 'texture image ktx2 upload',
    run: () => openDialog({ id: 'upload-texture' }),
  },
  {
    id: 'add.newMaterial',
    title: 'New Material…',
    menuPath: 'Add',
    keywords: 'material pbr surface create',
    run: () => openDialog({ id: 'material' }),
  },
  ...kittenMeshCommands,
  {
    id: 'add.defineEngine',
    title: 'Define Engine…',
    menuPath: 'Add',
    keywords: 'engine rocket combustor nozzle thrust',
    // The Engine-mode jump keeps the designer's retained engine entry (§2.4). The payload
    // asks the designer to open on its NEW-engine picker rather than the retained scope
    // (design §6.4); the interim engine host has no `onEnter` hook, so it is accepted and
    // ignored until P7 builds the picker.
    run: () => setMode('engine', { defineNew: true }),
  },
];

/**
 * `Add ▸ Custom Mesh Instances` — every re-placeable custom SubPart (hand-authored
 * primitives AND imported glTF meshes). Kitten submeshes are excluded: they have their own
 * "Make Kitten Mesh" entry and would clutter the re-add list. The submenu is HIDDEN when
 * this returns nothing (capability-dependent item — foundation §3).
 */
export function customMeshInstanceCommands(): Command[] {
  return $part
    .get()
    .customMeshes.filter((m) => meshKind(m) !== 'kitten')
    .map((mesh) => ({
      id: `add.customMesh:${mesh.subPartId}`,
      title: mesh.name,
      menuPath: 'Add ▸ Custom Mesh Instances',
      keywords: 'custom mesh instance place again',
      keepOpen: true,
      run: () => {
        ensureBuildMode();
        addSubPart(mesh.subPartId);
        const placements = $part.get().placements;
        landed('subpart', placements[placements.length - 1]?.instanceId, 'SubPart');
      },
    }));
}
