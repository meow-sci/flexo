import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { ChevronDown, ChevronRight, Circle, CircleDot, MoreVertical } from 'lucide-react';
import {
  Button,
  Chip,
  DialogTrigger,
  InlineConfirmStrip,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverDialog,
  Slider,
  SubmenuTrigger,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  cn,
} from '../kit';
import {
  $part,
  $selection,
  clearLayer,
  deleteLayer,
  duplicateLayer,
  moveSelectionToLayer,
  renameLayer,
  reorderLayers,
  selectLayerEntities,
  setActiveLayer,
  setLayerColor,
  $activeLayerId,
  type DeleteLayerOptions,
} from '../../state/editorStore';
import { $layerSummaries } from '../../state/selectors';
import {
  setLayerOpacity,
  toggleLayerListed,
  toggleLayerLocked,
  toggleLayerVisible,
} from '../../state/layerStore';
import { status } from '../../state/statusStore';
import { BUILT_IN_LAYER_IDS, ENTITY_ONLY_LAYER_IDS, KITTEN_LAYER_ID } from '../../ksa/types';
import {
  BlendIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  ListedIcon,
  LockIcon,
  UnlistedIcon,
  UnlockIcon,
} from '../layerIcons';
import { useNumberDraft } from '../numberDraft';
import { LAYER_COLORS, LAYER_COLOR_HEX, type LayerColor } from './layerColors';
import { computeReorder, movedOrdinary, ordinaryIds, withOrdinaryOrder } from './layerReorder';
import type { OutlinerLayerSection } from './outlinerTree';

/**
 * A layer's header row in the Outliner — the whole §2.2 control set (design:
 * design-build-mode.md §2.2, §2.3.4; foundation §8.1).
 *
 * Left→right: active radio dot · chevron · color dot (12-swatch popover) · name (double-click
 * to rename inline) · count chip · 👁 · ◐ opacity · 🔒 · ≡ listed · ⠿ drag grip · ⋮ menu, with
 * the delete/clear inline strip expanding UNDER the row.
 *
 * **Undo split, which the controls do not make obvious**: the document mutations (color,
 * rename, reorder, duplicate, clear, delete) push their own undo step inside the store
 * mutator; the four view toggles (visible / opacity / lock / listed) and the collapse chevron
 * and the active layer never do — they are per-user presentation state (`layerStore`).
 *
 * **Drag and drop is native HTML5, not react-aria's `useDragAndDrop`** — see the DND note at
 * the bottom of this file. This row is the drop target for BOTH gestures: another layer's
 * grip (reorder) and a set of entity rows (Change Layer for the whole movable selection).
 *
 * Rendered inside a react-aria `GridListHeader`, which is NOT a selectable row: clicking a
 * layer header can never disturb the entity selection.
 */

/** dataTransfer type carrying a dragged layer id (the ⠿ grip). */
export const DND_LAYER = 'application/x-flexo-layer';
/** dataTransfer type marking a drag of the current entity selection (an entity row). */
export const DND_ENTITY = 'application/x-flexo-entity';

export function LayerHeaderRow({
  section,
  collapsed,
  onToggleCollapsed,
}: {
  section: OutlinerLayerSection;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { layer, pinned, view, total, shown } = section;
  const part = useStore($part);
  const summaries = useStore($layerSummaries);
  const activeId = useStore($activeLayerId);
  const selection = useStore($selection);
  const [renaming, setRenaming] = useState(false);
  const [pending, setPending] = useState<'delete' | 'clear' | null>(null);
  const [dropHint, setDropHint] = useState<'entity' | 'before' | 'after' | null>(null);

  const isActive = activeId === layer.id;
  const filtering = shown !== total;
  const isBuiltIn = BUILT_IN_LAYER_IDS.includes(layer.id);
  // The Kittens layer cannot be deleted, so its destructive item empties it instead. Default
  // and the other two entity-only layers stay fully protected.
  const isClearable = layer.id === KITTEN_LAYER_ID;
  const summary = summaries.find((s) => s.layer.id === layer.id);
  const countTitle = summary
    ? [
        `${summary.subParts} SubParts`,
        `${summary.connectors} connectors`,
        ...(summary.colliders > 0 ? [`${summary.colliders} colliders`] : []),
        ...(summary.ivaSeats > 0 ? [`${summary.ivaSeats} IVA seats`] : []),
        ...(summary.lights > 0 ? [`${summary.lights} lights`] : []),
        ...(summary.kittens > 0 ? [`${summary.kittens} kittens`] : []),
      ].join(', ')
    : undefined;

  const ids = part.layers.map((l) => l.id);
  const ordinary = ordinaryIds(ids);
  const moveTargets = part.layers.filter(
    (l) => !ENTITY_ONLY_LAYER_IDS.includes(l.id) && l.id !== layer.id,
  );

  const move = (delta: 1 | -1) => {
    const next = movedOrdinary(ids, layer.id, delta);
    if (next) reorderLayers(next);
  };

  // ── drop handling (see the DND note) ──────────────────────────────────────
  const acceptsEntities = !pinned && !view.locked;
  const onDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes(DND_LAYER) && !pinned) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const box = e.currentTarget.getBoundingClientRect();
      setDropHint(e.clientY < box.top + box.height / 2 ? 'before' : 'after');
      return;
    }
    if (types.includes(DND_ENTITY) && acceptsEntities) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropHint('entity');
      return;
    }
    // A pinned header refuses both gestures — no preventDefault leaves the ⃠ cursor.
    e.dataTransfer.dropEffect = 'none';
  };

  const onDrop = (e: React.DragEvent) => {
    const hint = dropHint;
    setDropHint(null);
    const draggedLayer = e.dataTransfer.getData(DND_LAYER);
    if (draggedLayer && !pinned) {
      e.preventDefault();
      if (draggedLayer === layer.id) return;
      const next = computeReorder(
        ordinary,
        new Set([draggedLayer]),
        layer.id,
        hint === 'before' ? 'before' : 'after',
      );
      reorderLayers(withOrdinaryOrder(ids, next));
      return;
    }
    if (e.dataTransfer.types.includes(DND_ENTITY) && acceptsEntities) {
      e.preventDefault();
      moveSelectionToLayer(layer.id);
      // The pinned kinds cannot leave their own layer, so say so rather than silently
      // moving two of the three things the user dragged (design §2.4).
      const stayed = [...new Set(selection.map((r) => r.kind))].filter(
        (kind) => kind === 'ivaSeat' || kind === 'light' || kind === 'kitten',
      );
      if (stayed.length > 0) {
        const words: Record<string, string> = {
          ivaSeat: 'Seats stay on IVA Seats',
          light: 'Lights stay on Lights',
          kitten: 'Kittens stay on Kittens',
        };
        status(stayed.map((kind) => words[kind]).join(' · '), { severity: 'info' });
      }
    }
  };

  return (
    <div
      data-outliner-layer={layer.id}
      className={cn(
        'group/layer flex flex-col rounded-md',
        // An UNLISTED layer stays in the tree as a ghost header (v1 made it vanish, which is
        // how users lost track of a layer they had only unlisted). §2.2 ≡ row.
        !view.listed && 'opacity-40',
        dropHint === 'entity' && 'bg-accent/15 ring-1 ring-inset ring-accent',
        dropHint === 'before' && 'shadow-[inset_0_2px_0_0_var(--color-accent)]',
        dropHint === 'after' && 'shadow-[inset_0_-2px_0_0_var(--color-accent)]',
      )}
      onDragOver={onDragOver}
      onDragLeave={() => setDropHint(null)}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-0.5 px-1 py-(--density-row-py)">
        <Tooltip content={isActive ? 'Active layer — new items land here' : 'Make active'}>
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            className="size-5 shrink-0"
            aria-label={`Make ${layer.name} the active layer`}
            aria-pressed={isActive}
            onPress={() => setActiveLayer(layer.id)}
          >
            {isActive ? (
              <CircleDot className="size-3.5 text-accent" />
            ) : (
              <Circle className="size-3 text-fg-subtle" />
            )}
          </Button>
        </Tooltip>

        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label={collapsed ? `Expand ${layer.name}` : `Collapse ${layer.name}`}
          onPress={onToggleCollapsed}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Button>

        <ColorDot layer={layer.id} color={layer.color} name={layer.name} />

        {renaming ? (
          <RenameInput id={layer.id} name={layer.name} onDone={() => setRenaming(false)} />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wide text-fg-muted"
            title="Click to make active · double-click to rename"
            onClick={() => setActiveLayer(layer.id)}
            onDoubleClick={() => setRenaming(true)}
          >
            {layer.name}
          </span>
        )}

        <Chip className="shrink-0 px-1 py-0 text-[11px]" title={countTitle}>
          {filtering ? `${shown}/${total}` : total}
        </Chip>

        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label={view.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
          onPress={() => toggleLayerVisible(layer.id)}
        >
          {view.visible ? <EyeIcon /> : <EyeOffIcon />}
        </Button>

        <OpacityButton layerId={layer.id} opacity={view.opacity} />

        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label={view.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
          onPress={() => toggleLayerLocked(layer.id)}
        >
          {view.locked ? <LockIcon /> : <UnlockIcon />}
        </Button>

        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label={view.listed ? `Hide ${layer.name} rows` : `Show ${layer.name} rows`}
          onPress={() => toggleLayerListed(layer.id)}
        >
          {view.listed ? <ListedIcon /> : <UnlistedIcon />}
        </Button>

        {/* Pinned layers always sort last, so they are neither drag sources nor drop
            targets — no grip is rendered for them at all (design §2.3.4). */}
        {!pinned && (
          <span
            draggable
            role="button"
            tabIndex={0}
            aria-label={`Drag to reorder ${layer.name}`}
            className="shrink-0 cursor-grab text-fg-subtle opacity-0 outline-none focus-visible:opacity-100 group-hover/layer:opacity-100"
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_LAYER, layer.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
          >
            <GripVerticalIcon />
          </span>
        )}

        <MenuTrigger>
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            className="size-5 shrink-0"
            aria-label={`${layer.name} layer options`}
          >
            <MoreVertical className="size-3.5" />
          </Button>
          <Popover placement="bottom end" className="w-52">
            <Menu>
              <MenuItem onAction={() => setRenaming(true)}>Rename</MenuItem>
              <SubmenuTrigger>
                <MenuItem>Set Color</MenuItem>
                <Popover className="w-40">
                  <Menu
                    onAction={(key) =>
                      setLayerColor(layer.id, key === 'none' ? undefined : (key as LayerColor))
                    }
                  >
                    <MenuItem id="none">None</MenuItem>
                    {LAYER_COLORS.map((color) => (
                      <MenuItem key={color} id={color} textValue={color}>
                        <span className="flex items-center gap-2 capitalize">
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: LAYER_COLOR_HEX[color] }}
                          />
                          {color}
                        </span>
                      </MenuItem>
                    ))}
                  </Menu>
                </Popover>
              </SubmenuTrigger>
              <MenuItem
                isDisabled={total === 0 || view.locked}
                onAction={() => selectLayerEntities(layer.id)}
              >
                Select All in Layer
              </MenuItem>
              <MenuItem isDisabled={isBuiltIn} onAction={() => duplicateLayer(layer.id)}>
                Duplicate Layer
              </MenuItem>
              <MenuSeparator />
              {isClearable ? (
                <MenuItem variant="danger" onAction={() => setPending('clear')}>
                  Clear Layer…
                </MenuItem>
              ) : (
                <MenuItem
                  variant="danger"
                  isDisabled={isBuiltIn}
                  textValue="Delete Layer"
                  onAction={() => setPending('delete')}
                >
                  <span title={isBuiltIn ? 'Built-in layers cannot be deleted' : undefined}>
                    Delete Layer…
                  </span>
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem
                isDisabled={movedOrdinary(ids, layer.id, -1) === null}
                onAction={() => move(-1)}
              >
                Move Layer Up
              </MenuItem>
              <MenuItem
                isDisabled={movedOrdinary(ids, layer.id, 1) === null}
                onAction={() => move(1)}
              >
                Move Layer Down
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>

      {pending === 'delete' && (
        <DeleteLayerStrip
          name={layer.name}
          total={total}
          targets={moveTargets}
          onCancel={() => setPending(null)}
          onConfirm={(opts) => {
            setPending(null);
            deleteLayer(layer.id, opts);
          }}
        />
      )}
      {pending === 'clear' && (
        <div className="px-1 pb-1">
          <InlineConfirmStrip
            size="xs"
            label={`Delete all ${total} item${total === 1 ? '' : 's'} on “${layer.name}”?`}
            confirmLabel="Delete items"
            onCancel={() => setPending(null)}
            onConfirm={() => {
              setPending(null);
              clearLayer(layer.id);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** The 12-swatch + "none" color popover behind the header's color dot (design §2.3.1). */
function ColorDot({
  layer,
  color,
  name,
}: {
  layer: string;
  color: LayerColor | undefined;
  name: string;
}) {
  return (
    <DialogTrigger>
      <Button
        iconOnly
        size="sm"
        variant="ghost"
        className="size-5 shrink-0"
        aria-label={`Color for ${name}`}
      >
        <span
          aria-hidden
          className={cn('size-2.5 rounded-full', color ? '' : 'border border-border-strong')}
          style={color ? { background: LAYER_COLOR_HEX[color] } : undefined}
        />
      </Button>
      <Popover placement="bottom start">
        <PopoverDialog className="p-2">
          <div className="grid grid-cols-6 gap-1">
            {LAYER_COLORS.map((swatch) => (
              <Button
                key={swatch}
                iconOnly
                size="sm"
                variant="ghost"
                className="size-6"
                aria-label={swatch}
                onPress={() => setLayerColor(layer, swatch)}
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-3.5 rounded-full',
                    swatch === color && 'ring-2 ring-fg ring-offset-1 ring-offset-panel-raised',
                  )}
                  style={{ background: LAYER_COLOR_HEX[swatch] }}
                />
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 w-full"
            onPress={() => setLayerColor(layer, undefined)}
          >
            None
          </Button>
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  );
}

/**
 * Opacity control: a Blend-icon button opening a 0–100 field + slider, both driving
 * {@link setLayerOpacity}. Fading a layer makes its meshes see-through in the viewport so you
 * can reposition parts behind them — view state, never exported, never an undo step. The icon
 * tints accent while the layer is dimmed.
 */
function OpacityButton({ layerId, opacity }: { layerId: string; opacity: number }) {
  const pct = Math.round(opacity * 100);
  const dimmed = pct < 100;
  return (
    <DialogTrigger>
      <Button
        iconOnly
        size="sm"
        variant="ghost"
        aria-label="Layer opacity"
        className={cn('size-5 shrink-0', dimmed && 'text-accent')}
      >
        <BlendIcon />
      </Button>
      <Popover placement="bottom">
        <PopoverDialog className="p-2">
          <OpacityFields layerId={layerId} pct={pct} />
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  );
}

/** Number input (0–100) + slider, both committing to {@link setLayerOpacity}. */
function OpacityFields({ layerId, pct }: { layerId: string; pct: number }) {
  // Draft-aware text field (never type="number", which would erase a partial entry);
  // when not being edited it follows the store, so slider edits flow back into it.
  const field = useNumberDraft({
    value: pct,
    min: 0,
    max: 100,
    onCommit: (n) => setLayerOpacity(layerId, Math.round(n) / 100),
  });
  return (
    <div className="flex items-center gap-2">
      <TextField
        size="sm"
        // must inputMode="url" so negative numbers can be managed on mobile devices, numeric/decimal/integer dont show "-" key
        inputMode="url"
        aria-label="Layer opacity percent"
        className="w-14"
        {...field}
        onKeyDown={(e) => {
          // Keep grid typeahead/selection keys from stealing keystrokes.
          e.stopPropagation();
          field.onKeyDown(e);
        }}
      />
      <Slider
        aria-label="Layer opacity"
        className="w-36"
        minValue={0}
        maxValue={100}
        step={1}
        value={pct}
        onChange={(v) => setLayerOpacity(layerId, v / 100)}
      />
    </div>
  );
}

/**
 * Inline rename (design §2.2 "Name"). Enter/blur commits `renameLayer` (which owns its undo
 * step), Escape abandons the draft. The keys stay component-local BY DESIGN — they only exist
 * while this input has focus, so registering them would put two chords into the conflict
 * validator that nothing else could ever dispatch. They are listed in Help's static
 * "Outliner" section instead.
 */
function RenameInput({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    renameLayer(id, draft);
    onDone();
  };
  return (
    <TextField
      size="sm"
      autoFocus
      aria-label="Layer name"
      className="min-w-0 flex-1"
      value={draft}
      onChange={setDraft}
      onBlur={commit}
      // Keep grid typeahead/selection keys from stealing the keystrokes.
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') onDone();
      }}
    />
  );
}

/**
 * The delete-layer flow: an inline strip under the header row, NOT a modal (foundation §14.3
 * — a whole-container destroy always confirms, and the move-vs-delete choice is the canonical
 * case). Built-ins never reach here; `deleteLayer` refuses them anyway.
 */
function DeleteLayerStrip({
  name,
  total,
  targets,
  onConfirm,
  onCancel,
}: {
  name: string;
  total: number;
  targets: { id: string; name: string }[];
  onConfirm: (opts: DeleteLayerOptions) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<DeleteLayerOptions['mode']>('move-items');
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');

  return (
    <div className="flex flex-col gap-1 px-1 pb-1">
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <ToggleButtonGroup
            size="xs"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[mode]}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (next) setMode(next as DeleteLayerOptions['mode']);
            }}
          >
            <ToggleButton id="move-items" size="xs">
              Move items
            </ToggleButton>
            <ToggleButton id="delete-items" size="xs">
              Delete items
            </ToggleButton>
          </ToggleButtonGroup>
          {mode === 'move-items' &&
            targets.length > 0 && (
              // A MENU, not a Select: this strip renders inside a `GridListHeader`, and a
              // react-aria `Select` eagerly builds its own collection (its hidden native
              // select), which collides with the enclosing GridList's collection document and
              // crashes the panel. A Menu builds its items lazily inside its Popover.
              <MenuTrigger>
                <Button size="xs" variant="secondary" className="min-w-20">
                  {targets.find((l) => l.id === targetId)?.name ?? 'Default'}
                </Button>
                <Popover placement="bottom start" className="w-40">
                  <Menu onAction={(key) => setTargetId(String(key))}>
                    {targets.map((l) => (
                      <MenuItem key={l.id} id={l.id}>
                        {l.name}
                      </MenuItem>
                    ))}
                  </Menu>
                </Popover>
              </MenuTrigger>
            )}
        </div>
      )}
      <InlineConfirmStrip
        size="xs"
        label={
          total === 0
            ? `Delete “${name}” (empty)?`
            : `Delete “${name}” (${total} item${total === 1 ? '' : 's'})?`
        }
        confirmLabel="Delete"
        onCancel={onCancel}
        onConfirm={() => onConfirm({ mode, targetLayerId: targetId || undefined })}
      />
    </div>
  );
}

// ── DND note ─────────────────────────────────────────────────────────────────
//
// Both Outliner drags (layer reorder, entity → layer) use the platform's HTML5 drag events
// rather than react-aria's `useDragAndDrop`, which the v1 Layers popover used. The reason is
// structural, not stylistic: react-aria's collection DnD moves *items*, and a layer here is a
// `GridListSection` **header** — deliberately not a selectable row, so a header click can
// never disturb the entity selection (P5A.13). A header is therefore neither a drag source
// nor a drop target the collection hooks can see. `computeReorder` is still ported verbatim
// from the v1 Layers popover; only the event plumbing differs.
