import { useStore } from '@nanostores/react';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { Chip, Menu, MenuItem, MenuTrigger, Popover, Tooltip } from '../kit';
import { MODE_ICONS } from './statusTokens';
import { StatusChipButton, StatusDivider } from './StatusChip';
import { MessageChannel } from './MessageChannel';
import { NotificationBell } from './NotificationBell';
import { ToolSegment } from './ToolSegment';
import { DataSegment } from './DataSegment';
import { EngineSegment } from './EngineSegment';
import { SurfaceSegment } from './SurfaceSegment';
import { SelectionReadout } from './SelectionReadout';
import { ProgressSegment } from './ProgressSegment';
import { TransformChips } from './TransformChips';
import { SnapChip } from './SnapChip';
import { AdvisoryChips } from './AdvisoryChips';
import { ModifierHints } from './ModifierHints';
import { FpsSegment } from './FpsSegment';
import { getCommand, runCommand } from '../../state/commandStore';
import { $mode, MODES } from '../../state/modeStore';
import { $activeLayer, $layerSummaries } from '../../state/selectors';
import { $layerView, layerViewState } from '../../state/layerStore';
import { setActiveLayer } from '../../state/editorStore';

/**
 * The docked shell's fixed slim bottom row — the **status bar** (design:
 * `plans/flexo_v2/design/design-system-services.md` §1; foundation §5). Same bar recipe as
 * {@link MenuBar}: content height, never collapses, never resizes (foundation §1.1).
 *
 * Three alignment groups in ONE flex row — left (posture), center (`flex-1`, the message
 * channel + progress), right (hints, chips, bell). The left and right groups are
 * `flex-none` and the center absorbs all the slack, which is what stops a segment
 * unmounting from shifting its siblings (§1.0).
 *
 * No z-index: the bar is in flow. v1's top toast layer is deleted (foundation §1.3) —
 * transient feedback renders HERE, and anything persistent lives in the notification
 * center popover.
 *
 * Undo enrollment: NONE. The bar's own state is ephemeral; the persisted state it *edits*
 * (active layer, and later bounds mode / snap / nudge-rotate prefs) stays owned by the
 * stores that already persist it (§1.6).
 */
export function StatusBar() {
  return (
    <div className="flex flex-none select-none items-center border-t border-border bg-panel px-2 py-(--bar-py) text-xs text-fg-muted">
      {/* Left group — posture. Never shifts: `flex-none`. */}
      <div className="flex flex-none items-center">
        <ModeChip />
        <LayerChip />
        <DataSegment />
        <EngineSegment />
        <SurfaceSegment />
        <ToolSegment />
        <SelectionReadout />
      </div>

      {/* Center group — segments 5 and 6. Absorbs all slack. */}
      <MessageChannel />
      <ProgressSegment />

      {/* Right group — hints and chips. Never shifts: `flex-none`. */}
      <div className="flex flex-none items-center">
        <AdvisoryChips />
        <ModifierHints />
        <TransformChips />
        <SnapChip />
        <FpsSegment />
        <NotificationBell />
      </div>
    </div>
  );
}

/**
 * Segment 1 — the mode chip. Permanent (design §1.7: the bar never fully empties), and the
 * fix for v1's "which mode am I in?" invisibility.
 *
 * Reads `modeStore` directly for the icon + label, and runs the `mode.*` COMMANDS from its
 * menu — the same dataset the menubar switcher and the palette use.
 */
function ModeChip() {
  const mode = useStore($mode);
  const Icon = MODE_ICONS[mode];
  const label = MODES.find((m) => m.id === mode)?.label ?? 'Build';

  return (
    <MenuTrigger>
      <Tooltip content="Editing mode — 1–5 to switch">
        <StatusChipButton aria-label={`Editing mode: ${label}`} className="text-fg">
          <Icon size={13} />
          <span>{label}</span>
          <ChevronDown size={11} className="text-fg-subtle" />
        </StatusChipButton>
      </Tooltip>
      {/* The body is a component the Popover MOUNTS, so `enabled()`/`checked()` are
          evaluated on every open — see MenuSpecMenu's header for why building the items
          here instead would freeze them under React Compiler memoization. */}
      <Popover className="w-48">
        <ModeMenuBody />
      </Popover>
    </MenuTrigger>
  );
}

function ModeMenuBody() {
  return (
    <Menu aria-label="Editing mode">
      {MODES.map((mode) => {
        const command = getCommand(`mode.${mode.id}`);
        const disabled = command?.enabled?.() === false;
        const checked = command?.checked?.() === true;
        const Icon = MODE_ICONS[mode.id];
        return (
          <MenuItem
            key={mode.id}
            id={mode.id}
            density="dense"
            textValue={mode.label}
            isDisabled={disabled}
            onAction={() => {
              runCommand(`mode.${mode.id}`);
            }}
          >
            {/* Native `title`, not the kit Tooltip: a disabled react-aria menu item is not
                hoverable, so a TooltipTrigger would never fire on the rows that need it. */}
            <span
              className="flex min-w-0 flex-1 items-center gap-2"
              title={disabled ? command?.disabledReason : undefined}
            >
              <span className="flex w-3.5 shrink-0 justify-center text-accent">
                {checked && <Check size={13} />}
              </span>
              <Icon size={13} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{mode.label}</span>
            </span>
          </MenuItem>
        );
      })}
    </Menu>
  );
}

/**
 * Segment 2 — the active layer chip, shown in Build and Animation only.
 *
 * This closes the v1 gap where the layer new entities land on was visible NOWHERE (design
 * §1.2 #2). Locked layers stay selectable, matching v1 semantics: the active layer only
 * targets adds. Setting it is view state — not undoable.
 */
function LayerChip() {
  const mode = useStore($mode);
  const layer = useStore($activeLayer);

  if (mode !== 'build' && mode !== 'animation') return null;

  const name = layer?.name ?? 'None';
  return (
    <>
      <StatusDivider />
      <MenuTrigger>
        <Tooltip content="Active layer — new items land here">
          <StatusChipButton aria-label={`Active layer: ${name}`}>
            <span className="text-fg-subtle">Layer:</span>
            <span className="max-w-[14ch] truncate text-fg">{name}</span>
            <ChevronDown size={11} className="text-fg-subtle" />
          </StatusChipButton>
        </Tooltip>
        <Popover className="w-64">
          <LayerMenuBody />
        </Popover>
      </MenuTrigger>
    </>
  );
}

function LayerMenuBody() {
  const summaries = useStore($layerSummaries);
  const active = useStore($activeLayer);
  const view = useStore($layerView);

  return (
    <Menu aria-label="Active layer">
      {summaries.map((summary) => {
        const count =
          summary.subParts +
          summary.connectors +
          summary.kittens +
          summary.ivaSeats +
          summary.colliders +
          summary.lights;
        const locked = layerViewState(view, summary.id).locked;
        return (
          <MenuItem
            key={summary.id}
            id={summary.id}
            density="dense"
            textValue={summary.layer.name}
            onAction={() => setActiveLayer(summary.id)}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="flex w-3.5 shrink-0 justify-center text-accent">
                {summary.id === active?.id && <Check size={13} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{summary.layer.name}</span>
              {locked && <Lock size={11} className="shrink-0 text-fg-subtle" />}
              <Chip className="shrink-0">{count}</Chip>
            </span>
          </MenuItem>
        );
      })}
    </Menu>
  );
}
