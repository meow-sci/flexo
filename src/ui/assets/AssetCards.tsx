import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { AlertTriangle, Box, Image as ImageIcon, MoreVertical, Palette } from 'lucide-react';
import { Button, Chip, Menu, MenuItem, MenuTrigger, Popover, Tooltip, cn } from '../kit';
import { $customTextureUrls, type AssetUsage } from '../../state/customAssetStore';
import {
  $thumbUrls,
  requestMaterialThumb,
  requestMeshThumb,
  thumbSignature,
} from '../../three/assetThumbs';
import { openMeshSurface } from '../surface/surfaceJump';
import { addSubPart } from '../../state/editorStore';
import { status } from '../../state/statusStore';
import { meshKind, type CustomMesh, type EditingPart } from '../../ksa/types';
import type { AssetItem } from './assetGroups';
import { plural } from './assetGroups';
import { useManagerNav } from './managerNav';
import { requestDeleteMaterial, requestDeleteMesh, requestDeleteTexture } from './assetActions';
import type { AssetCategory } from '../../state/assetManagerStore';

/**
 * **Asset Manager cards and rows** (design: design-surface-assets.md §2.1/§2.3, D1, D6, D10).
 *
 * One card per library entry: a thumbnail, the name, a kind/channel chip and the where-used
 * chips read from `$assetUsage`. The grid card and the list row render the same facts at two
 * densities — a card is not allowed to know something a row does not.
 *
 * **Thumbnails** (census pain #4 — "no previews where decisions are made"): textures are a
 * plain `<img>` off the existing source blob URL; materials and meshes go through the ONE
 * shared offscreen renderer (`three/assetThumbs.ts`), never a WebGL context per row. The
 * request is fired from an effect, never during render — enqueuing is a side effect, and a
 * 20-card grid re-rendering mid-drag must not queue 20 more jobs from its render body. A
 * thumb that has not been drawn yet (or cannot be — no render-cache entry, no WebGL) falls
 * back to the kind glyph.
 */

// ── thumbnails ───────────────────────────────────────────────────────────────

const CHECKER = {
  background: 'repeating-conic-gradient(rgb(255 255 255 / 6%) 0% 25%, rgb(0 0 0 / 25%) 0% 50%)',
  backgroundSize: '10px 10px',
};

function ThumbFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded border border-border text-fg-subtle',
        className,
      )}
      style={CHECKER}
    >
      {children}
    </span>
  );
}

export function TextureThumb({
  textureId,
  name,
  className,
}: {
  textureId: string;
  name: string;
  className?: string;
}) {
  const urls = useStore($customTextureUrls);
  const url = urls[textureId];
  return (
    <ThumbFrame className={className}>
      {url ? (
        <img src={url} alt={name} className="size-full object-contain" />
      ) : (
        <ImageIcon size={16} />
      )}
    </ThumbFrame>
  );
}

export function MaterialThumb({
  materialId,
  part,
  className,
}: {
  materialId: string;
  part: EditingPart;
  className?: string;
}) {
  const urls = useStore($thumbUrls);
  const sig = thumbSignature('material', materialId, part);
  useEffect(() => {
    requestMaterialThumb(materialId, part);
  }, [materialId, part, sig]);
  const url = urls[sig];
  return (
    <ThumbFrame className={className}>
      {url ? <img src={url} alt="" className="size-full object-contain" /> : <Palette size={16} />}
    </ThumbFrame>
  );
}

export function MeshThumb({
  mesh,
  part,
  className,
}: {
  mesh: CustomMesh;
  part: EditingPart;
  className?: string;
}) {
  const urls = useStore($thumbUrls);
  const sig = thumbSignature('mesh', mesh.id, part);
  useEffect(() => {
    requestMeshThumb(mesh, part);
  }, [mesh, part, sig]);
  const url = urls[sig];
  return (
    <ThumbFrame className={className}>
      {url ? <img src={url} alt="" className="size-full object-contain" /> : <Box size={16} />}
    </ThumbFrame>
  );
}

/** The right thumbnail for any item, at any size. */
export function AssetThumb({
  item,
  part,
  className,
}: {
  item: AssetItem;
  part: EditingPart;
  className?: string;
}) {
  if (item.kind === 'texture') {
    return <TextureThumb textureId={item.id} name={item.name} className={className} />;
  }
  if (item.kind === 'material') {
    return <MaterialThumb materialId={item.id} part={part} className={className} />;
  }
  const mesh = part.customMeshes.find((m) => m.id === item.id);
  if (!mesh) {
    return (
      <ThumbFrame className={className}>
        <Box size={16} />
      </ThumbFrame>
    );
  }
  return <MeshThumb mesh={mesh} part={part} className={className} />;
}

// ── chips ────────────────────────────────────────────────────────────────────

/** `baseColor` / `material` / `prim`·`import`·`kitten` — what this entry IS. */
function kindChip(item: AssetItem, part: EditingPart): string {
  if (item.kind === 'texture') {
    return part.customTextures.find((t) => t.id === item.id)?.channel ?? 'texture';
  }
  if (item.kind === 'material') return 'material';
  const mesh = part.customMeshes.find((m) => m.id === item.id);
  return mesh ? MESH_KIND_CHIP[meshKind(mesh)] : 'mesh';
}

const MESH_KIND_CHIP: Record<ReturnType<typeof meshKind>, string> = {
  primitive: 'prim',
  imported: 'import',
  kitten: 'kitten',
};

/**
 * Where-used chips, straight off `$assetUsage` (§2.4): texture `→N faces · N mat`, material
 * `→N meshes`, mesh `×N placed`. A mesh placed zero times additionally carries the D10
 * "not exported" warning — it is a template, not an orphan, and the mod export silently drops
 * it (census pain #14).
 */
export function UsageChips({ item, usage }: { item: AssetItem; usage: AssetUsage }) {
  if (item.kind === 'texture') {
    const use = usage.texture.get(item.id);
    return (
      <>
        <Chip>→{plural(use?.faces.length ?? 0, 'face')}</Chip>
        <Chip>→{use?.materials.length ?? 0} mat</Chip>
      </>
    );
  }
  if (item.kind === 'material') {
    const meshes = usage.material.get(item.id)?.meshes.length ?? 0;
    return <Chip>→{plural(meshes, 'mesh', 'meshes')}</Chip>;
  }
  const placements = usage.mesh.get(item.id)?.placements ?? 0;
  return (
    <>
      <Chip className={placements === 0 ? 'text-warning' : undefined}>×{placements} placed</Chip>
      {placements === 0 && (
        <Tooltip content="No placements — this template will not be exported">
          <span className="inline-flex items-center gap-1 text-[11px] text-warning">
            <AlertTriangle size={11} /> not exported
          </span>
        </Tooltip>
      )}
    </>
  );
}

// ── card / row bodies ────────────────────────────────────────────────────────

/**
 * The grid tile. Rendered inside a `GridListItem`, so every interactive control in here has
 * to be a real focusable element (the ⋮ menu is a Menu, never a Select — a react-aria Select
 * inside a collection crashes on `onAction`).
 */
export function AssetCardBody({
  item,
  part,
  usage,
  onAskInline,
}: {
  item: AssetItem;
  part: EditingPart;
  usage: AssetUsage;
  onAskInline: (item: AssetItem) => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <AssetThumb item={item} part={part} className="aspect-square w-full" />
      <div className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs text-fg" title={item.name}>
          {item.name}
        </span>
        <AssetActionsMenu item={item} part={part} usage={usage} onAskInline={onAskInline} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Chip>{kindChip(item, part)}</Chip>
        <UsageChips item={item} usage={usage} />
      </div>
    </div>
  );
}

/** The list row: 24px thumb + name + chips + inline actions. */
export function AssetRowBody({
  item,
  part,
  usage,
  onAskInline,
}: {
  item: AssetItem;
  part: EditingPart;
  usage: AssetUsage;
  onAskInline: (item: AssetItem) => void;
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <AssetThumb item={item} part={part} className="size-6" />
      <span className="min-w-0 flex-1 truncate text-xs text-fg" title={item.name}>
        {item.name}
      </span>
      <Chip className="shrink-0">{kindChip(item, part)}</Chip>
      <UsageChips item={item} usage={usage} />
      <AssetActionsMenu item={item} part={part} usage={usage} onAskInline={onAskInline} />
    </div>
  );
}

/**
 * The ⋮ menu — the SAME actions the detail view offers (§2.2 last line). Deletions route
 * through the §5.1 matrix in `assetActions`: tier-3 kinds push a confirm view, undoable ones
 * either ask inline on the row or just act and offer `[Undo]`.
 */
export function AssetActionsMenu({
  item,
  part,
  usage,
  onAskInline,
}: {
  item: AssetItem;
  part: EditingPart;
  usage: AssetUsage;
  onAskInline: (item: AssetItem) => void;
}) {
  const nav = useManagerNav();
  const mesh = item.kind === 'mesh' ? part.customMeshes.find((m) => m.id === item.id) : undefined;

  const remove = () => {
    if (item.kind === 'texture') {
      const texture = part.customTextures.find((t) => t.id === item.id);
      if (texture) requestDeleteTexture(nav, texture, usage);
      return;
    }
    if (item.kind === 'material') {
      const material = part.customMaterials.find((m) => m.id === item.id);
      if (material) requestDeleteMaterial(material, usage, () => onAskInline(item));
      return;
    }
    if (mesh) requestDeleteMesh(mesh, usage, () => onAskInline(item));
  };

  return (
    <MenuTrigger>
      <Button
        iconOnly
        size="xs"
        variant="ghost"
        className="size-5 shrink-0"
        aria-label={`Actions for ${item.name}`}
      >
        <MoreVertical size={12} />
      </Button>
      {/* The Popover MOUNTS the body, so the enabled/label predicates below re-evaluate on
          every open instead of freezing at their first-open values (React Compiler). */}
      <Popover className="w-52">
        <Menu aria-label={`Actions for ${item.name}`}>
          <MenuItem density="dense" onAction={() => nav.openDetail(item.kind, item.id)}>
            Open details…
          </MenuItem>
          {mesh && (
            <MenuItem
              density="dense"
              onAction={() => {
                addSubPart(mesh.subPartId);
                status(`Instance of “${mesh.name}” added`);
              }}
            >
              Add instance
            </MenuItem>
          )}
          {mesh && (
            <MenuItem
              density="dense"
              onAction={() => {
                nav.close();
                openMeshSurface(mesh.id);
              }}
            >
              Edit surface →
            </MenuItem>
          )}
          <MenuItem density="dense" variant="danger" onAction={remove}>
            Delete…
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

// ── empty states (D1 — buttons, never navigation directions) ─────────────────

/**
 * Per-category empty state (§2.3, wording verbatim). Every one of them CREATES: v1's modal
 * told you to go and use a different menu ("Use 'Upload texture…' in the Add menu"), which
 * was its own admission that creation and management had been split (census pain #1).
 */
export function CategoryEmpty({ category }: { category: AssetCategory }) {
  const nav = useManagerNav();
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <EmptyGlyph category={category} />
      <p className="text-sm text-fg-muted">{EMPTY_LINE[category]}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {(category === 'all' || category === 'textures') && (
          <Button size="sm" variant="secondary" onPress={nav.create.uploadTexture}>
            Upload Texture…
          </Button>
        )}
        {(category === 'all' || category === 'materials') && (
          <Button size="sm" variant="secondary" onPress={nav.create.newMaterial}>
            New Material…
          </Button>
        )}
        {(category === 'all' || category === 'meshes') && (
          <Button size="sm" variant="secondary" onPress={nav.create.newMesh}>
            New Primitive Mesh…
          </Button>
        )}
        {(category === 'all' || category === 'meshes' || category === 'imports') && (
          <Button size="sm" variant="secondary" onPress={nav.create.importModel}>
            Import Model…
          </Button>
        )}
      </div>
      {HINT[category] && <p className="text-xs text-fg-subtle">{HINT[category]}</p>}
    </div>
  );
}

const EMPTY_LINE: Record<AssetCategory, string> = {
  all: 'No custom assets yet.',
  textures: 'No uploaded textures.',
  materials: 'No materials yet.',
  meshes: 'No custom meshes.',
  imports: 'No imported models.',
  unused: 'Nothing unused — every texture and material is referenced.',
};

const HINT: Record<AssetCategory, string> = {
  all: '',
  textures: 'or paste an image with the upload dialog open',
  materials: '',
  meshes: '',
  imports: 'or drop a .glb onto the viewport',
  unused: '',
};

function EmptyGlyph({ category }: { category: AssetCategory }) {
  const size = 28;
  if (category === 'textures') return <ImageIcon size={size} className="text-fg-subtle" />;
  if (category === 'materials') return <Palette size={size} className="text-fg-subtle" />;
  return <Box size={size} className="text-fg-subtle" />;
}

/** The kind chip on its own — the list-view detail strip renders it beside the thumbnail. */
export function KindChip({ item, part }: { item: AssetItem; part: EditingPart }) {
  return <Chip>{kindChip(item, part)}</Chip>;
}
