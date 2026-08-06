import { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Check,
  ChevronDown,
  Circle,
  CircleDot,
  Crosshair,
  MoreVertical,
  Package,
} from 'lucide-react';
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
  TextField,
  Tooltip,
  cn,
} from '../kit';
import { BlendIcon, EyeIcon, EyeOffIcon } from '../layerIcons';
import { useNumberDraft } from '../numberDraft';
import { Vec3Field } from '../Vec3Field';
import { toast } from '../toast';
import { runCommand } from '../../state/commandStore';
import {
  $activePartId,
  $activePartMeta,
  $partEntries,
  deletePart,
  duplicatePart,
  movePart,
  renamePart,
  setPartIncludeInExport,
  setPartOffset,
  setPartOpacity,
  setPartVisible,
  type PartMetaEntry,
} from '../../state/partsStore';
import type { ProjectCounts } from '../../state/projectDb';

/**
 * The menubar's **part switcher** — the chip that names the active part and the popover that
 * manages every part in the project (plan: `plans/MULTI_PART_PLAN.md` P4.04).
 *
 * A project holds N parts but every editing surface stays one-part-at-a-time (I1), so this is
 * the ONE surface that shows them all: activate · rename · count · ghost visibility · ghost
 * opacity · workspace offset (D3) · include-in-export (D4) · duplicate · reorder · delete.
 *
 * **Why a `Popover`, not a `Menu`.** The rows carry interactive controls (buttons, a slider,
 * number fields, a nested menu), and a react-aria `Menu` is a collection whose items may not
 * host focusable children — the same restriction documented at `LayerHeaderRow.tsx` for the
 * delete strip's target picker. The rows are therefore plain elements inside a `Dialog`.
 *
 * **Nested overlays are load-bearing here and were spiked first** (P4.04 item 2): with
 * react-aria-components 1.20 an inner `DialogTrigger`+`Popover` (opacity, offset) and an inner
 * `MenuTrigger` (the ⋮ menu) render inside this `PopoverDialog` with the outer popover staying
 * open throughout — pressing the trigger, dragging the inner slider, typing in the inner field
 * and running a menu item all leave it open, and Escape dismisses only the innermost overlay.
 * So the plan's fallback (inline expansion rows) is NOT used.
 *
 * **Feedback**: every part action that a user could look away from reports through the command
 * layer (`src/ui/commands/partCommands.ts`), which owns the toasts — `partsStore` is
 * deliberately toast-free. The two row actions the commands cannot express (they target the
 * ACTIVE part) emit the command's own wording themselves: see {@link PartRow}.
 *
 * **Undo enrollment: NONE** (invariant I6) — part create / delete / duplicate / rename /
 * reorder / visibility / opacity / offset / include-in-export are lifecycle + view state, never
 * document mutations.
 */
export function PartSwitcher() {
  const entries = useStore($partEntries);
  const activeId = useStore($activePartId);
  // Pre-hydration only (boot is awaited before first paint), but the empty chip must exist.
  const active = useStore($activePartMeta);
  const [open, setOpen] = useState(false);

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        size="xs"
        variant="ghost"
        className="min-w-0 gap-1 px-1.5"
        aria-label={active ? `Part: ${active.name}` : 'Part'}
      >
        <Package size={13} className="shrink-0" />
        <span className="max-w-[16ch] truncate">{active?.name ?? ''}</span>
        <ChevronDown size={12} className="shrink-0 text-fg-subtle" />
      </Button>
      <Popover placement="bottom end" className="w-80">
        <PopoverDialog className="flex flex-col p-1" aria-label="Parts">
          <div className="flex flex-col">
            {entries.map((entry, index) => (
              <PartRow
                key={entry.id}
                entry={entry}
                index={index}
                total={entries.length}
                isActive={entry.id === activeId}
                onActivated={() => setOpen(false)}
              />
            ))}
          </div>
          <Button
            size="xs"
            variant="secondary"
            className="mt-1 w-full"
            onPress={() => runCommand('part.new')}
          >
            ＋ New Part
          </Button>
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  );
}

/** The chip breakdown behind a row's count — everything the part holds, in one hover. */
function countTitle(counts: ProjectCounts): string {
  return [
    `${counts.subParts} SubParts`,
    `${counts.connectors} connectors`,
    ...(counts.colliders > 0 ? [`${counts.colliders} colliders`] : []),
    ...(counts.seats > 0 ? [`${counts.seats} IVA seats`] : []),
    ...(counts.lights > 0 ? [`${counts.lights} lights`] : []),
    ...(counts.kittens > 0 ? [`${counts.kittens} kittens`] : []),
    ...(counts.animations > 0 ? [`${counts.animations} animations`] : []),
    `${counts.layers} layers`,
  ].join(', ');
}

/** Said by every ghost-only control on the ACTIVE row — they stay enabled, they just don't bite. */
const GHOST_HINT = 'Applies when another part is active';

/**
 * One part's row: the {@link LayerHeaderRow}-style control set, left → right.
 *
 * The activate dot is the only control that CLOSES the popover: picking what you are editing
 * ends the errand. Everything else (visibility, opacity, offset, the ⋮ menu, the delete strip)
 * keeps it open so a manage-several-parts session is one visit. The footer's New Part also
 * leaves it open even though the new part becomes active — you want to see the row land, and
 * usually to rename it straight away.
 */
function PartRow({
  entry,
  index,
  total,
  isActive,
  onActivated,
}: {
  entry: PartMetaEntry;
  index: number;
  total: number;
  isActive: boolean;
  onActivated: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  // Destroying a part takes its undo history and custom assets with it, so it confirms — in
  // place, never a modal over a popover (foundation §14.3; the menubar's `part.delete` uses the
  // fuller `DeletePartConfirm`, and both end in the same `deletePart`).
  if (pendingDelete) {
    return (
      <div className="px-1 py-(--density-row-py)">
        <InlineConfirmStrip
          size="xs"
          label={`Delete “${entry.name}”? Undo history goes too.`}
          confirmLabel="Delete"
          onCancel={() => setPendingDelete(false)}
          onConfirm={() => {
            setPendingDelete(false);
            if (deletePart(entry.id)) toast({ title: `Deleted part: ${entry.name}` });
          }}
        />
      </div>
    );
  }

  const pct = Math.round(entry.opacity * 100);
  const shifted = entry.offset.x !== 0 || entry.offset.y !== 0 || entry.offset.z !== 0;

  const duplicate = () => {
    // `part.duplicate` targets the ACTIVE part, so only the active row can take the command
    // path (one feedback path, shell law 1). A non-active row duplicates ITSELF and therefore
    // owns the toast — with the command's exact wording, so the two paths read identically.
    if (isActive) {
      runCommand('part.duplicate');
      return;
    }
    void duplicatePart(entry.id).then((newId) => {
      if (!newId) return;
      // A fresh read, not the render-time snapshot: the copy is minted by the await above, so
      // no subscribed value could carry its (collision-suffixed) name. Event handler, not a
      // render body — the compiler-stale-read hazard does not apply here.
      const name = $partEntries.get().find((e) => e.id === newId)?.name ?? entry.name;
      toast({ title: `Duplicated: ${name}` });
    });
  };

  return (
    <div className="flex items-center gap-0.5 rounded-md px-1 py-(--density-row-py) hover:bg-wash-hover">
      <Tooltip content={isActive ? 'The part you are editing' : `Edit ${entry.name}`}>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label={`Edit part ${entry.name}`}
          aria-pressed={isActive}
          // A11y: the popover's focus lands on the part you are editing (react-aria's
          // FocusScope leaves an already-in-scope focus alone, so this wins over "first row").
          autoFocus={isActive}
          onPress={() => {
            // The `parts` provider row — so the "Editing:" toast has ONE definition, in
            // `partCommands.ts`. It resolves to nothing in a single-part project, where the
            // only row is already active and there is nothing to switch to.
            runCommand(`part:switch:${entry.id}`);
            onActivated();
          }}
        >
          {isActive ? (
            <CircleDot className="size-3.5 text-accent" />
          ) : (
            <Circle className="size-3 text-fg-subtle" />
          )}
        </Button>
      </Tooltip>

      {renaming ? (
        <RenameInput id={entry.id} name={entry.name} onDone={() => setRenaming(false)} />
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-xs"
          title="Double-click to rename"
          onDoubleClick={() => setRenaming(true)}
        >
          {entry.name}
        </span>
      )}

      {!entry.includeInExport && (
        <Chip
          className="shrink-0 px-1 py-0 text-[11px] text-fg-subtle"
          title="Excluded from Export to KSA"
        >
          excluded
        </Chip>
      )}

      <Chip className="shrink-0 px-1 py-0 text-[11px]" title={countTitle(entry.counts)}>
        {entry.counts.subParts}
      </Chip>

      <Tooltip content={isActive ? GHOST_HINT : entry.visible ? 'Hide ghost' : 'Show ghost'}>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label={
            entry.visible ? `Hide ghost for ${entry.name}` : `Show ghost for ${entry.name}`
          }
          onPress={() => setPartVisible(entry.id, !entry.visible)}
        >
          {entry.visible ? <EyeIcon /> : <EyeOffIcon />}
        </Button>
      </Tooltip>

      <DialogTrigger>
        <Tooltip content={isActive ? GHOST_HINT : 'Ghost opacity'}>
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            className={cn('size-5 shrink-0', pct < 100 && 'text-accent')}
            aria-label={`Ghost opacity for ${entry.name}`}
          >
            <BlendIcon />
          </Button>
        </Tooltip>
        <Popover placement="bottom">
          <PopoverDialog className="p-2" aria-label={`Ghost opacity for ${entry.name}`}>
            <OpacityFields id={entry.id} pct={pct} />
          </PopoverDialog>
        </Popover>
      </DialogTrigger>

      <DialogTrigger>
        <Tooltip content={isActive ? GHOST_HINT : 'Workspace offset'}>
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            className={cn('relative size-5 shrink-0', shifted && 'text-accent')}
            aria-label={`Workspace offset for ${entry.name}`}
          >
            <Crosshair className="size-4" />
            {shifted && (
              <span
                aria-hidden
                className="absolute right-0 top-0 size-1.5 rounded-full bg-accent"
              />
            )}
          </Button>
        </Tooltip>
        <Popover placement="bottom" className="w-64">
          <PopoverDialog className="p-2" aria-label={`Workspace offset for ${entry.name}`}>
            <div className="flex flex-col gap-1.5">
              <Vec3Field
                label="Offset"
                labelWidth="w-10"
                value={entry.offset}
                step={0.1}
                onCommit={(axis, value) =>
                  setPartOffset(entry.id, { ...entry.offset, [axis]: value })
                }
              />
              <span className="text-[11px] text-fg-subtle">
                Meters. Moves this part's ghost in the workspace only — never exported.
              </span>
            </div>
          </PopoverDialog>
        </Popover>
      </DialogTrigger>

      {/* The ⋮ trigger carries an `aria-label` but NO `Tooltip`, unlike every other icon
          button here — the `EntityRow` / `LayerHeaderRow` idiom this copies does the same, and
          the reason is measured: a react-aria tooltip dismisses ITSELF on Escape and stops the
          event, so the tooltip that opens when focus returns from the closed menu would eat the
          Escape that should close this popover. The menu it opens names its own actions. */}
      <MenuTrigger>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label={`${entry.name} options`}
        >
          <MoreVertical className="size-3.5" />
        </Button>
        <Popover placement="bottom end" className="w-56">
          <Menu aria-label={`${entry.name} options`}>
            <MenuItem density="dense" textValue="Rename" onAction={() => setRenaming(true)}>
              <GlyphRow label="Rename…" />
            </MenuItem>
            <MenuItem density="dense" textValue="Duplicate" onAction={duplicate}>
              <GlyphRow label="Duplicate" />
            </MenuItem>
            <MenuItem
              density="dense"
              textValue="Move Up"
              isDisabled={index === 0}
              onAction={() => movePart(entry.id, -1)}
            >
              <GlyphRow label="Move Up" />
            </MenuItem>
            <MenuItem
              density="dense"
              textValue="Move Down"
              isDisabled={index === total - 1}
              onAction={() => movePart(entry.id, 1)}
            >
              <GlyphRow label="Move Down" />
            </MenuItem>
            {/* Checkbox row the house way (`MenuSpecMenu`): the state lives in the store, the
                menu's `selectionMode` stays 'none', and every row in this menu reserves the
                glyph column so the labels stay aligned. */}
            <MenuItem
              density="dense"
              textValue="Include in export"
              onAction={() => setPartIncludeInExport(entry.id, !entry.includeInExport)}
            >
              <GlyphRow label="Include in export" checked={entry.includeInExport} />
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              variant="danger"
              density="dense"
              textValue="Delete"
              // A project always has at least one part — `deletePart` refuses too.
              isDisabled={total === 1}
              onAction={() => setPendingDelete(true)}
            >
              <GlyphRow label="Delete…" />
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
    </div>
  );
}

/** A ⋮-menu row: reserved check column + label (the `MenuSpecMenu` glyph-column convention). */
function GlyphRow({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="flex w-3.5 shrink-0 justify-center text-accent">
        {checked && <Check size={13} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </span>
  );
}

/**
 * Ghost opacity: the `LayerHeaderRow.OpacityFields` composition — a draft-aware 0–100 field
 * (never `type="number"`, which would erase a partial entry) beside a slider, both committing
 * to {@link setPartOpacity}. View state, never exported, never an undo step (I6).
 *
 * DEVIATION from the copied original, deliberate: it wraps `onKeyDown` in `stopPropagation()`
 * to protect its enclosing GridList's typeahead. There is no collection here, and swallowing
 * the bubble would keep Escape from dismissing this popover — `useNumberDraft` already stops
 * Escape only while there is a draft to cancel.
 */
function OpacityFields({ id, pct }: { id: string; pct: number }) {
  const field = useNumberDraft({
    value: pct,
    min: 0,
    max: 100,
    onCommit: (n) => setPartOpacity(id, Math.round(n) / 100),
  });
  return (
    <div className="flex items-center gap-2">
      <TextField
        size="sm"
        // must inputMode="url" so negative numbers can be managed on mobile devices, numeric/decimal/integer dont show "-" key
        inputMode="url"
        aria-label="Ghost opacity percent"
        className="w-14"
        {...field}
      />
      <Slider
        aria-label="Ghost opacity"
        className="w-36"
        minValue={0}
        maxValue={100}
        step={1}
        value={pct}
        onChange={(v) => setPartOpacity(id, v / 100)}
      />
    </div>
  );
}

/**
 * Inline rename (double-click the name, or ⋮ ▸ Rename…). Enter/blur commits, Escape abandons.
 * `renamePart` auto-suffixes a taken name, and the row re-renders showing what was applied —
 * which is why this path needs no flash of its own (the modal `RenamePartDialog`, whose result
 * the user cannot see behind the dialog, does status that).
 *
 * The keys stay component-local: they exist only while this input has focus, so registering
 * them would put chords into the conflict validator that nothing else could dispatch.
 */
function RenameInput({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    renamePart(id, draft);
    onDone();
  };
  return (
    <TextField
      size="sm"
      autoFocus
      aria-label="Part name"
      className="min-w-0 flex-1"
      value={draft}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(e) => {
        // Enter/Escape belong to the rename, not to the popover behind it.
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') onDone();
      }}
    />
  );
}
