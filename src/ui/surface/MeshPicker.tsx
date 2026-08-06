import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Selection } from 'react-aria-components';
import { AlertTriangle, Plus } from 'lucide-react';
import {
  Button,
  Chip,
  GridList,
  GridListItem,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  SearchField,
  SubmenuTrigger,
  Tooltip,
  cn,
} from '../kit';
import {
  $surfaceMeshId,
  $surfaceRevealRequest,
  pickSurfaceMesh,
} from '../../state/surfaceModeStore';
import { $assetUsage, $unplacedCustomMeshes } from '../../state/customAssetStore';
import { $part, addSubPart } from '../../state/editorStore';
import { runCommand } from '../../state/commandStore';
import { fuzzyAny } from '../fuzzyMatch';
import { toast } from '../toast';
import { KITTEN_KINDS, KITTEN_LABELS, meshKind, type CustomMesh } from '../../ksa/types';

/**
 * **The mesh picker** — Surface mode's pinned top section (design: design-surface-assets.md
 * §1.3 "Meshes"; foundation §8.5 item 1).
 *
 * Lists EVERY `CustomMesh`, kitten submeshes included (D6 — v1 hid them from the modal
 * because the modal was the only manager; v2's picker is where you see everything). Rows that
 * are placed ZERO times stay visible with a ⚠ chip, which is the fix for the v1
 * invisible-template bug AND the silent export drop (pains #14/#15): a template with no
 * placements simply is not shipped by `buildCustomBundle`, and nothing used to say so.
 *
 * **Undo enrollment: NONE of its own.** `＋` runs `addSubPart`, which pushes its own single
 * "add subpart" step; picking a mesh is mode sub-state and is never undoable.
 */
export function MeshPicker({ onPicked }: { onPicked?: () => void }) {
  const part = useStore($part);
  const picked = useStore($surfaceMeshId);
  const usage = useStore($assetUsage);
  const unplaced = useStore($unplacedCustomMeshes);
  const reveal = useStore($surfaceRevealRequest);
  const [search, setSearch] = useState('');
  // The kit SearchField renders its own <input>, so focus is reached through the wrapper —
  // the same route the Outliner's ⌘F takes.
  const searchRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const unplacedIds = new Set(unplaced.map((m) => m.id));
  const meshes = part.customMeshes.filter(
    (m) => !search.trim() || fuzzyAny(search, m.name, m.subPartId),
  );

  // Reveal: scroll the row into view and flash it, or focus the search field when the request
  // names no mesh ("[Pick a mesh →]" from the left empty state). A DOM side effect in an
  // effect — no setState, so the React Compiler rules stay satisfied.
  useEffect(() => {
    if (!reveal) return;
    if (!reveal.meshId) {
      searchRef.current?.querySelector('input')?.focus();
      return;
    }
    const row = listRef.current?.querySelector<HTMLElement>(`[data-mesh-id="${reveal.meshId}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    row.classList.add('row-flash');
    const timer = setTimeout(() => row.classList.remove('row-flash'), 600);
    return () => clearTimeout(timer);
  }, [reveal]);

  const onSelectionChange = (selection: Selection) => {
    if (selection === 'all') return;
    const key = [...selection][0];
    if (key === undefined) return;
    pickSurfaceMesh(String(key));
    // Picking scrolls the editor body back to the top (design §1.3): the sections below are
    // about the mesh you just picked, and landing mid-Glow would read as a broken pick.
    onPicked?.();
  };

  if (part.customMeshes.length === 0) return <EmptyState />;

  return (
    <div className="flex flex-col gap-1">
      <div ref={searchRef}>
        <SearchField
          size="sm"
          aria-label="Filter custom meshes"
          placeholder="Filter meshes…"
          value={search}
          onChange={setSearch}
        />
      </div>
      <div ref={listRef} className="max-h-56 overflow-auto">
        <GridList
          aria-label="Custom meshes"
          selectionMode="single"
          selectionBehavior="replace"
          items={meshes}
          selectedKeys={picked ? new Set([picked]) : new Set()}
          onSelectionChange={onSelectionChange}
          dependencies={[usage, unplacedIds, picked]}
          className="flex flex-col gap-0.5 outline-none"
        >
          {(mesh: CustomMesh) => (
            <GridListItem id={mesh.id} density="dense" textValue={mesh.name}>
              <MeshRow
                mesh={mesh}
                placements={usage.mesh.get(mesh.id)?.placements ?? 0}
                unplaced={unplacedIds.has(mesh.id)}
              />
            </GridListItem>
          )}
        </GridList>
      </div>
      <NewMeshMenu />
    </div>
  );
}

function MeshRow({
  mesh,
  placements,
  unplaced,
}: {
  mesh: CustomMesh;
  placements: number;
  unplaced: boolean;
}) {
  return (
    <div data-mesh-id={mesh.id} className="flex w-full min-w-0 items-center gap-1">
      <span className="min-w-0 flex-1 truncate text-xs text-fg" title={mesh.subPartId}>
        {mesh.name}
      </span>
      <Chip className="shrink-0">{KIND_CHIP[meshKind(mesh)]}</Chip>
      <span
        className={cn(
          'shrink-0 font-mono text-[11px]',
          unplaced ? 'text-warning' : 'text-fg-subtle',
        )}
      >
        ×{placements}
      </span>
      {unplaced && (
        <Tooltip content="No placements — this template will not be exported">
          <AlertTriangle size={11} className="shrink-0 text-warning" />
        </Tooltip>
      )}
      <Tooltip content="Add an instance on the active layer">
        <Button
          iconOnly
          size="xs"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label={`Add an instance of ${mesh.name}`}
          onPress={() => {
            // `addSubPart` lands it on the ACTIVE layer at the origin, selects it and reveals
            // its row — and pushes its own discrete undo step. Surface mode is NOT left: the
            // instance is arrangeable in Build whenever the user goes back (design §1.3).
            addSubPart(mesh.subPartId);
            const layerId = $part.get().placements.at(-1)?.layerId;
            const layer = $part.get().layers.find((l) => l.id === layerId);
            toast({ title: `Instance added to layer ${layer?.name ?? 'Default'}` });
          }}
        >
          <Plus size={12} />
        </Button>
      </Tooltip>
    </div>
  );
}

const KIND_CHIP: Record<ReturnType<typeof meshKind>, string> = {
  primitive: 'prim',
  imported: 'import',
  kitten: 'kitten',
};

/**
 * `＋ New Mesh ▾` — the three creation routes, running the SAME commands the Add menu does
 * (D1: both entry points, one command id each, so no behaviour can diverge).
 */
function NewMeshMenu() {
  return (
    <MenuTrigger>
      <Button size="sm" variant="ghost" className="self-start">
        <Plus size={12} /> New Mesh
      </Button>
      {/* The Popover MOUNTS the menu body, so predicates inside re-evaluate on every open
          rather than freezing at their first-open value (React Compiler). */}
      <Popover className="w-56">
        <NewMeshMenuBody />
      </Popover>
    </MenuTrigger>
  );
}

function NewMeshMenuBody() {
  return (
    <Menu aria-label="New mesh">
      <MenuItem density="dense" onAction={() => runCommand('add.primitiveMesh')}>
        Primitive…
      </MenuItem>
      <MenuItem density="dense" onAction={() => runCommand('add.importModel')}>
        Import Model…
      </MenuItem>
      <SubmenuTrigger>
        <MenuItem density="dense">Make Kitten Mesh</MenuItem>
        <Popover className="w-44">
          <KittenMeshMenuBody />
        </Popover>
      </SubmenuTrigger>
    </Menu>
  );
}

/** The three part-ifiable kittens, from the one `KITTEN_KINDS` dataset. */
function KittenMeshMenuBody() {
  return (
    <Menu aria-label="Make kitten mesh">
      {KITTEN_KINDS.map((kind) => (
        <MenuItem
          key={kind}
          id={kind}
          density="dense"
          onAction={() => runCommand(`add.kittenMesh:${kind}`)}
        >
          {KITTEN_LABELS[kind]}
        </MenuItem>
      ))}
    </Menu>
  );
}

/**
 * Zero custom meshes at all — the creation empty state (D1 verbatim). v1's modal empty state
 * gave NAVIGATION DIRECTIONS to a different menu ("Use 'Upload texture…' in the Add menu");
 * this one carries the buttons.
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-2 px-1 py-3">
      <p className="text-xs text-fg-muted">No custom meshes yet — build one:</p>
      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        onPress={() => runCommand('add.primitiveMesh')}
      >
        New Primitive Mesh…
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        onPress={() => runCommand('add.importModel')}
      >
        Import Model…
      </Button>
      <MenuTrigger>
        <Button size="sm" variant="secondary" className="w-full">
          Make Kitten Mesh ▾
        </Button>
        <Popover className="w-44">
          <KittenMeshMenuBody />
        </Popover>
      </MenuTrigger>
    </div>
  );
}
