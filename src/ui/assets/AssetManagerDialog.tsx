import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Selection } from 'react-aria-components';
import { AlertTriangle, LayoutGrid, List, Plus, RefreshCw } from 'lucide-react';
import {
  Button,
  Chip,
  Dialog,
  DialogViewStack,
  GridList,
  GridListItem,
  InlineConfirmStrip,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuTrigger,
  Modal,
  Popover,
  SearchField,
  Select,
  SubmenuTrigger,
  ToggleButton,
  ToggleButtonGroup,
  cn,
  useDialogViewStack,
  useIsPhone,
  type DialogView,
} from '../kit';
import { $part } from '../../state/editorStore';
import { $assetUsage, openImportModel, type AssetUsage } from '../../state/customAssetStore';
import { assetKeys, getAsset } from '../../state/assetDb';
import {
  $assetManagerPrefs,
  setAssetManagerPrefs,
  type AssetCategory,
  type AssetManagerSort,
} from '../../state/assetManagerStore';
import { runCommand } from '../../state/commandStore';
import { fuzzyAny } from '../fuzzyMatch';
import { KITTEN_KINDS, KITTEN_LABELS, meshKind, type EditingPart } from '../../ksa/types';
import { UploadTextureForm } from '../CustomTextureDialog';
import { CreateMeshForm } from '../CreateMeshDialog';
import {
  buildItems,
  filterItems,
  groupImports,
  plural,
  sortItems,
  unusedAssets,
  type AssetItem,
  type ImportBatch,
} from './assetGroups';
import {
  AssetCardBody,
  AssetRowBody,
  AssetThumb,
  CategoryEmpty,
  KindChip,
  UsageChips,
} from './AssetCards';
import {
  deleteMaterialLabel,
  deleteMaterialNow,
  deleteMeshLabel,
  deleteMeshNow,
  requestDeleteAllUnused,
  requestRemoveImport,
} from './assetActions';
import {
  ManagerNavContext,
  useManagerNav,
  type ManagerConfirm,
  type ManagerNav,
} from './managerNav';
import { TextureDetail } from './TextureDetail';
import { MaterialDetail } from './MaterialDetail';
import { MeshDetail } from './MeshDetail';

/**
 * **The Asset Manager overlay** (dialog id `'asset-manager'`, size L, `⇧⌘A` — design:
 * design-surface-assets.md §2; foundation §10.3, S30).
 *
 * The one place the project's textures, materials, meshes and import batches are all
 * visible, with thumbnails, where-used chips, post-creation editing, orphan review and
 * honest deletion. It replaces v1's `CustomAssetsModal`, which was reachable only through a
 * right-sidebar button labelled "Custom (N)" — a number that conflated textures and meshes
 * and excluded materials (census pain #13) — and whose empty states gave navigation
 * directions to the Add menu instead of buttons (pain #1).
 *
 * **No modal-in-modal anywhere** (foundation §10.1): creation forms, per-item details and
 * every tier-3 confirm are pushed views of ONE `DialogViewStack`. Escape pops a view before
 * it dismisses the dialog. The two handoffs that genuinely land elsewhere — Import Model /
 * Replace… and Make Kitten Mesh — are JUMPS: the manager closes and the existing `add.*`
 * command runs (D8/S27).
 *
 * **Undo enrollment: none of its own.** Every mutation it triggers is one discrete step
 * inside its store helper; the view prefs are localStorage view state and never undoable.
 */
export function AssetManagerDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      variant="cover"
      className="sm:w-[95vw] sm:max-w-[75rem]"
    >
      <Dialog className="h-full">
        <ManagerBody onClose={() => onOpenChange(false)} />
      </Dialog>
    </Modal>
  );
}

/** The root view. A module const, so the stack's root element is one stable descriptor. */
const BROWSER_VIEW: DialogView = {
  id: 'browser',
  title: 'Asset Manager',
  element: <AssetBrowser />,
};

/**
 * Owns the view stack and publishes the {@link ManagerNav} every view navigates through.
 *
 * Nav travels by context rather than by prop because the ROOT view element is built in the
 * same render as the stack that would have to supply it. Pushed views render under this
 * provider too, so a detail view three levels deep reaches the identical object.
 */
function ManagerBody({ onClose }: { onClose: () => void }) {
  const stack = useDialogViewStack(BROWSER_VIEW);

  const nav: ManagerNav = {
    push: stack.push,
    pop: stack.pop,
    reset: stack.reset,
    close: onClose,
    openDetail: (kind, id) => stack.push(detailView(kind, id)),
    confirm: (request) =>
      stack.push({
        id: `confirm:${request.title}`,
        title: request.title,
        element: <ConfirmView request={request} />,
      }),
    create: {
      uploadTexture: () =>
        stack.push({
          id: 'upload-texture',
          title: 'Upload Texture',
          element: (
            <FormFrame>
              <UploadTextureForm onDone={stack.pop} onCancel={stack.pop} />
            </FormFrame>
          ),
        }),
      newMaterial: () =>
        stack.push({
          id: 'new-material',
          title: 'New Material',
          element: <MaterialDetail />,
        }),
      newMesh: () =>
        stack.push({
          id: 'create-mesh',
          title: 'New Primitive Mesh',
          element: (
            <FormFrame>
              <CreateMeshForm onDone={stack.pop} onCancel={stack.pop} />
            </FormFrame>
          ),
        }),
      // Both of these LAND somewhere else — Import Review, or Build mode with the part-ified
      // submeshes selected — so the manager gets out of the way first (D8/S27).
      importModel: () => {
        onClose();
        runCommand('add.importModel');
      },
      kittenMesh: (kind) => {
        onClose();
        runCommand(`add.kittenMesh:${kind}`);
      },
    },
  };

  return (
    <ManagerNavContext value={nav}>
      <DialogViewStack stack={stack} onClose={onClose} />
    </ManagerNavContext>
  );
}

/**
 * A pushed FORM view's column. The forms were authored for an S dialog (`max-w-md`); left to
 * fill an L cover they become a 1200px-wide row of fields, which is unreadable.
 */
function FormFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">{children}</div>;
}

/** The pushed detail view for one asset (§2.2). Titles stay live across a rename. */
function detailView(kind: 'texture' | 'material' | 'mesh', id: string): DialogView {
  if (kind === 'texture') {
    return {
      id: `texture:${id}`,
      title: <DetailTitle kind="texture" id={id} />,
      element: <TextureDetail textureId={id} />,
    };
  }
  if (kind === 'material') {
    return {
      id: `material:${id}`,
      title: <DetailTitle kind="material" id={id} />,
      element: <MaterialDetail materialId={id} />,
    };
  }
  return {
    id: `mesh:${id}`,
    title: <DetailTitle kind="mesh" id={id} />,
    element: <MeshDetail meshId={id} />,
  };
}

/** The header title of a detail view, read live so a rename inside it retitles the view. */
function DetailTitle({ kind, id }: { kind: 'texture' | 'material' | 'mesh'; id: string }) {
  const part = useStore($part);
  const name =
    kind === 'texture'
      ? part.customTextures.find((t) => t.id === id)?.name
      : kind === 'material'
        ? part.customMaterials.find((m) => m.id === id)?.name
        : part.customMeshes.find((m) => m.id === id)?.name;
  return <>{name ?? 'Asset'}</>;
}

// ── the browser (root view) ──────────────────────────────────────────────────

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  all: 'All',
  textures: 'Textures',
  materials: 'Materials',
  meshes: 'Meshes',
  imports: 'Imported models',
  unused: 'Unused',
};

const SORT_LABELS: Record<AssetManagerSort, string> = {
  name: 'Name',
  kind: 'Kind',
  recent: 'Recently added',
  usage: 'Usage',
};

/** `texture:tex_1` — collection keys have to be unique across the three id spaces. */
function itemKey(item: AssetItem): string {
  return `${item.kind}:${item.id}`;
}

function AssetBrowser() {
  const part = useStore($part);
  const usage = useStore($assetUsage);
  const prefs = useStore($assetManagerPrefs);
  const isPhone = useIsPhone();
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** The row currently showing its inline destructive strip (§5.1 undoable tier). */
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const category = prefs.category;
  const items = buildItems(part, usage);
  const batches = groupImports(part);
  const unused = unusedAssets(part, usage);
  const unusedIds = new Set([
    ...unused.textures.map((t) => t.id),
    ...unused.materials.map((m) => m.id),
  ]);
  const importedMeshIds = new Set(
    part.customMeshes.filter((m) => meshKind(m) === 'imported').map((m) => m.id),
  );

  const counts: Record<AssetCategory, number> = {
    all: items.length,
    textures: part.customTextures.length,
    materials: part.customMaterials.length,
    meshes: part.customMeshes.length - importedMeshIds.size,
    imports: batches.length,
    unused: unusedIds.size,
  };

  const inCategory = (item: AssetItem): boolean => {
    switch (category) {
      case 'all':
        return item.kind !== 'mesh' || !importedMeshIds.has(item.id);
      case 'textures':
        return item.kind === 'texture';
      case 'materials':
        return item.kind === 'material';
      case 'meshes':
        return item.kind === 'mesh' && !importedMeshIds.has(item.id);
      case 'imports':
        // Imported SubParts render under their batch header, never loose.
        return false;
      case 'unused':
        return item.kind !== 'mesh' && unusedIds.has(item.id);
    }
  };

  const visible = sortItems(filterItems(items.filter(inCategory), query), prefs.sort);
  const showBatches = category === 'all' || category === 'imports';
  const itemsByKey = new Map(items.map((i) => [itemKey(i), i]));
  const visibleBatches = showBatches
    ? batches
        .map((batch) => ({
          ...batch,
          meshes: query
            ? batch.meshes.filter((m) =>
                fuzzyAny(
                  query,
                  m.name,
                  m.subPartId,
                  batch.sourceFile,
                  m.imported.sourceNode,
                  m.imported.sourceMaterial,
                ),
              )
            : batch.meshes,
        }))
        .filter((batch) => batch.meshes.length > 0)
    : [];

  const selected = selectedKey ? (itemsByKey.get(selectedKey) ?? null) : null;
  const empty = visible.length === 0 && visibleBatches.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      <CategoryRail counts={counts} category={category} horizontal={isPhone} />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <SearchField
            size="sm"
            aria-label="Search assets"
            placeholder="Search name, SubPart id, channel, source file…"
            value={query}
            onChange={setQuery}
            className="min-w-40 flex-1"
          />
          <ToggleButtonGroup
            size="xs"
            className="w-auto shrink-0"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[prefs.view]}
            onSelectionChange={(keys) => {
              const v = [...keys][0];
              if (v === 'grid' || v === 'list') setAssetManagerPrefs({ view: v });
            }}
          >
            <ToggleButton id="grid" size="sm" className="w-8 flex-none" aria-label="Grid view">
              <LayoutGrid size={13} />
            </ToggleButton>
            <ToggleButton id="list" size="sm" className="w-8 flex-none" aria-label="List view">
              <List size={13} />
            </ToggleButton>
          </ToggleButtonGroup>
          <Select
            aria-label="Sort by"
            size="sm"
            className="w-40"
            selectedKey={prefs.sort}
            onSelectionChange={(k) => setAssetManagerPrefs({ sort: k as AssetManagerSort })}
          >
            {(Object.keys(SORT_LABELS) as AssetManagerSort[]).map((s) => (
              <ListBoxItem key={s} id={s}>
                Sort: {SORT_LABELS[s]}
              </ListBoxItem>
            ))}
          </Select>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 flex-1 overflow-auto">
            {category === 'unused' && (
              <UnusedBanner part={part} usage={usage} count={counts.unused} />
            )}
            {empty && query.trim() ? (
              // A filtered-to-nothing library is NOT an empty library: showing the creation
              // empty state here would tell the user to make what they already have.
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <p className="text-sm text-fg-muted">No assets match “{query.trim()}”.</p>
                <Button size="sm" variant="secondary" onPress={() => setQuery('')}>
                  Clear search
                </Button>
              </div>
            ) : empty ? (
              <CategoryEmpty category={category} />
            ) : (
              <>
                {visible.length > 0 && (
                  <ItemCollection
                    items={visible}
                    part={part}
                    usage={usage}
                    view={prefs.view}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                    pendingKey={pendingKey}
                    onAskInline={(item) => setPendingKey(itemKey(item))}
                    onClearPending={() => setPendingKey(null)}
                  />
                )}
                {visibleBatches.map((batch) => (
                  <ImportBatchGroup
                    key={batch.importId}
                    batch={batch}
                    part={part}
                    usage={usage}
                    view={prefs.view}
                    itemsByKey={itemsByKey}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                    pendingKey={pendingKey}
                    onAskInline={(item) => setPendingKey(itemKey(item))}
                    onClearPending={() => setPendingKey(null)}
                  />
                ))}
              </>
            )}
          </div>
          {prefs.view === 'list' && !isPhone && selected && (
            <DetailStrip item={selected} part={part} usage={usage} />
          )}
        </div>

        {/* Phone footer FAB-row (design §2.6): the rail's creation menu, reachable without
            scrolling the chip row. */}
        {isPhone && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-2">
            <NewAssetMenu />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The category rail with PER-KIND counts — the fix for v1's single conflated "Custom (N)"
 * badge (census pain #13). `⚠ Unused` is a filter row, not a kind (§2.5).
 */
function CategoryRail({
  counts,
  category,
  horizontal,
}: {
  counts: Record<AssetCategory, number>;
  category: AssetCategory;
  horizontal: boolean;
}) {
  const rows: AssetCategory[] = ['all', 'textures', 'materials', 'meshes', 'imports'];
  return (
    <div
      className={cn(
        'flex shrink-0 gap-1 border-border p-2',
        horizontal ? 'overflow-x-auto border-b' : 'w-48 flex-col border-r',
      )}
    >
      {rows.map((row) => (
        <RailRow key={row} row={row} count={counts[row]} active={category === row} />
      ))}
      <div className={horizontal ? 'w-px shrink-0 bg-border' : 'my-1 h-px bg-border'} />
      <RailRow row="unused" count={counts.unused} active={category === 'unused'} warn />
      {/* On the phone the rail is a horizontally-scrolling chip row, so `＋ New` would sit
          off the right edge behind six chips. It moves to the footer FAB-row instead
          (design §2.6) — same menu component, mounted once either way. */}
      {!horizontal && (
        <>
          <div className="flex-1" />
          <NewAssetMenu />
        </>
      )}
    </div>
  );
}

function RailRow({
  row,
  count,
  active,
  warn,
}: {
  row: AssetCategory;
  count: number;
  active: boolean;
  warn?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      className={cn('shrink-0 justify-between gap-2 sm:w-full', active && 'ring-1 ring-accent')}
      onPress={() => setAssetManagerPrefs({ category: row })}
    >
      <span className="flex items-center gap-1 truncate">
        {warn && <AlertTriangle size={12} className="text-warning" />}
        {CATEGORY_LABELS[row]}
      </span>
      <Chip className={cn('shrink-0', warn && count > 0 && 'text-warning')}>{count}</Chip>
    </Button>
  );
}

/**
 * `＋ New ▾` — the same five routes as the Add menu (D1). The first three push a view inside
 * this dialog; the last two close it and run the existing `add.*` command.
 */
function NewAssetMenu() {
  const nav = useManagerNav();
  return (
    <MenuTrigger>
      <Button size="sm" variant="secondary" className="shrink-0 sm:w-full">
        <Plus size={13} /> New
      </Button>
      {/* The Popover MOUNTS the body, so its items re-evaluate on every open (React Compiler). */}
      <Popover className="w-56">
        <Menu aria-label="New asset">
          <MenuItem density="dense" onAction={nav.create.uploadTexture}>
            Upload Texture…
          </MenuItem>
          <MenuItem density="dense" onAction={nav.create.newMaterial}>
            New Material…
          </MenuItem>
          <MenuItem density="dense" onAction={nav.create.newMesh}>
            New Primitive Mesh…
          </MenuItem>
          <MenuItem density="dense" onAction={nav.create.importModel}>
            Import Model…
          </MenuItem>
          <SubmenuTrigger>
            <MenuItem density="dense">Make Kitten Mesh</MenuItem>
            <Popover className="w-44">
              <Menu aria-label="Make kitten mesh">
                {KITTEN_KINDS.map((kind) => (
                  <MenuItem
                    key={kind}
                    id={kind}
                    density="dense"
                    onAction={() => nav.create.kittenMesh(kind)}
                  >
                    {KITTEN_LABELS[kind]}
                  </MenuItem>
                ))}
              </Menu>
            </Popover>
          </SubmenuTrigger>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

// ── collections ──────────────────────────────────────────────────────────────

interface CollectionProps {
  items: AssetItem[];
  part: EditingPart;
  usage: AssetUsage;
  view: 'grid' | 'list';
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  pendingKey: string | null;
  onAskInline: (item: AssetItem) => void;
  onClearPending: () => void;
}

/**
 * Cards (grid) or rows (list). `GridList`, never `ListBox`, because every entry embeds its
 * own ⋮ menu while still taking part in selection and keyboard navigation (AGENTS.md).
 * Single click selects; double-click / Enter opens the detail view (react-aria's own
 * selection-plus-action gesture split).
 */
function ItemCollection({
  items,
  part,
  usage,
  view,
  selectedKey,
  onSelect,
  pendingKey,
  onAskInline,
  onClearPending,
}: CollectionProps) {
  const nav = useManagerNav();
  const onSelectionChange = (selection: Selection) => {
    if (selection === 'all') return;
    const key = [...selection][0];
    onSelect(key === undefined ? null : String(key));
  };
  return (
    <GridList
      aria-label="Assets"
      selectionMode="single"
      selectionBehavior="replace"
      items={items}
      selectedKeys={selectedKey ? new Set([selectedKey]) : new Set()}
      onSelectionChange={onSelectionChange}
      dependencies={[part, usage, view, pendingKey]}
      className={cn(
        'p-2',
        view === 'grid'
          ? 'grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] items-start gap-2'
          : 'flex flex-col gap-0.5',
      )}
    >
      {(item: AssetItem) => (
        <GridListItem
          id={itemKey(item)}
          textValue={item.name}
          onAction={() => nav.openDetail(item.kind, item.id)}
          className={
            view === 'grid'
              ? cn(
                  'flex-col items-stretch border border-border p-2',
                  // A confirming card spans the row: the strip's label is one truncating
                  // line, and a 9rem tile would clip the count off the question.
                  pendingKey === itemKey(item) && 'col-span-full',
                )
              : ''
          }
        >
          {pendingKey === itemKey(item) ? (
            <InlineDelete item={item} part={part} usage={usage} onDone={onClearPending} />
          ) : view === 'grid' ? (
            <AssetCardBody item={item} part={part} usage={usage} onAskInline={onAskInline} />
          ) : (
            <AssetRowBody item={item} part={part} usage={usage} onAskInline={onAskInline} />
          )}
        </GridListItem>
      )}
    </GridList>
  );
}

/**
 * The undoable half of the confirm matrix, rendered IN the row (§5.1): a material still worn
 * by meshes, or a mesh with more than five placements. Byte-backed deletions never come here
 * — they push a confirm view carrying the full warning.
 */
function InlineDelete({
  item,
  part,
  usage,
  onDone,
}: {
  item: AssetItem;
  part: EditingPart;
  usage: AssetUsage;
  onDone: () => void;
}) {
  const material = part.customMaterials.find((m) => m.id === item.id);
  const mesh = part.customMeshes.find((m) => m.id === item.id);
  const label =
    item.kind === 'material' && material
      ? deleteMaterialLabel(material, usage)
      : mesh
        ? deleteMeshLabel(mesh, usage)
        : `Delete “${item.name}”?`;
  return (
    <InlineConfirmStrip
      label={label}
      confirmLabel="Delete"
      onConfirm={() => {
        if (item.kind === 'material' && material) deleteMaterialNow(material);
        else if (mesh) deleteMeshNow(mesh, usage);
        onDone();
      }}
      onCancel={onDone}
    />
  );
}

/** List view's right-hand strip: the selected entry at a glance, with its detail entry. */
function DetailStrip({
  item,
  part,
  usage,
}: {
  item: AssetItem;
  part: EditingPart;
  usage: AssetUsage;
}) {
  const nav = useManagerNav();
  return (
    <div className="flex w-60 shrink-0 flex-col gap-2 overflow-auto border-l border-border p-3">
      <AssetThumb item={item} part={part} className="aspect-square w-full" />
      <span className="truncate text-sm text-fg" title={item.name}>
        {item.name}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <KindChip item={item} part={part} />
        <UsageChips item={item} usage={usage} />
      </div>
      <Button size="sm" variant="secondary" onPress={() => nav.openDetail(item.kind, item.id)}>
        Open details…
      </Button>
    </div>
  );
}

// ── import batches ───────────────────────────────────────────────────────────

/**
 * One import batch: a header card with its provenance, totals and stored GLB size, its two
 * batch actions, then its SubParts (§2.1 "Imported models category groups by batch").
 */
function ImportBatchGroup({
  batch,
  part,
  usage,
  view,
  itemsByKey,
  selectedKey,
  onSelect,
  pendingKey,
  onAskInline,
  onClearPending,
}: {
  batch: ImportBatch;
  itemsByKey: Map<string, AssetItem>;
} & Omit<CollectionProps, 'items'>) {
  const nav = useManagerNav();
  const items = batch.meshes
    .map((m) => itemsByKey.get(`mesh:${m.id}`))
    .filter((i): i is AssetItem => !!i);
  return (
    <section className="m-2 rounded-lg border border-border bg-panel-sunken/40">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm text-fg" title={batch.importId}>
          {batch.sourceFile}
        </span>
        <span className="text-xs text-fg-subtle">
          {plural(batch.meshes.length, 'SubPart')} · {plural(batch.placements, 'placement')} ·{' '}
          {plural(batch.textures.length, 'texture')} · {plural(batch.materials, 'material')} ·{' '}
          {batch.triangles.toLocaleString()} tris · <ImportGlbSize importId={batch.importId} />
        </span>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            // Jump, not stack: Import Review is an L dialog of its own (D8).
            nav.close();
            openImportModel([], batch.importId);
          }}
        >
          <RefreshCw size={13} /> Replace…
        </Button>
        <Button
          size="sm"
          variant="danger-ghost"
          onPress={() => requestRemoveImport(nav, part, batch)}
        >
          Remove import…
        </Button>
      </header>
      <ItemCollection
        items={items}
        part={part}
        usage={usage}
        view={view}
        selectedKey={selectedKey}
        onSelect={onSelect}
        pendingKey={pendingKey}
        onAskInline={onAskInline}
        onClearPending={onClearPending}
      />
    </section>
  );
}

/**
 * The batch's stored geometry size, read through `assetDb` — never a literal key string, so
 * the per-project key namespacing that lands in the projects phase is one module's change.
 */
function ImportGlbSize({ importId }: { importId: string }) {
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAsset(assetKeys.importGlb(importId))
      .then((blob) => {
        if (!cancelled) setSize(blob?.size ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [importId]);
  if (size === null) return <span>…</span>;
  const mb = size / 1_048_576;
  return (
    <span>
      {mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`} GLB
    </span>
  );
}

// ── unused review ────────────────────────────────────────────────────────────

/** The ⚠ Unused banner + bulk delete (§2.5). Review only — GC never runs on its own. */
function UnusedBanner({
  part,
  usage,
  count,
}: {
  part: EditingPart;
  usage: AssetUsage;
  count: number;
}) {
  const nav = useManagerNav();
  return (
    <div className="m-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-panel-sunken/60 px-3 py-2">
      <p className="min-w-0 flex-1 text-xs text-fg-muted">
        Unused assets are never deleted automatically.
      </p>
      <Button
        size="sm"
        variant="danger-ghost"
        isDisabled={count === 0}
        onPress={() => requestDeleteAllUnused(nav, part, usage)}
      >
        Delete all unused…
      </Button>
    </div>
  );
}

// ── the confirm view (tier 3 — never a stacked dialog) ───────────────────────

/**
 * A destructive confirm as a PUSHED VIEW (foundation §10.1 + §14.3): the counts, every item
 * named, and the irreversibility paragraph in full — a truncating one-line strip could not
 * carry the bytes-vs-descriptor sentence, which is the whole point of the tier.
 */
function ConfirmView({ request }: { request: ManagerConfirm }) {
  const nav = useManagerNav();
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto p-4">
      <p className="text-sm text-fg">{request.body}</p>
      {request.items && request.items.length > 0 && (
        <ul className="max-h-60 overflow-auto rounded-md border border-border bg-panel-sunken p-2 text-xs text-fg-muted">
          {request.items.map((name) => (
            <li key={name} className="truncate py-0.5">
              {name}
            </li>
          ))}
        </ul>
      )}
      {request.warning && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs leading-snug text-warning">
          {request.warning}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={nav.pop}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="danger"
          onPress={() => {
            request.onConfirm();
            if (request.returnTo === 'back') nav.pop();
            else nav.reset();
          }}
        >
          {request.confirmLabel}
        </Button>
      </div>
    </div>
  );
}
