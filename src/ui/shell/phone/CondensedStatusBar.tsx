import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { AlertTriangle, Check, ChevronDown, Lock, Magnet, X } from 'lucide-react';
import { Button, Chip, cn, Dialog, Sheet } from '../../kit';
import { NotificationBell } from '../../status/NotificationBell';
import { FindingsList } from '../../data/FindingsList';
import { closePhoneSheets } from './phoneSheets';
import { MODE_ICONS, SEVERITY_DOT, SEVERITY_TEXT, TOOL_ICONS } from '../../status/statusTokens';
import { $mode, MODES } from '../../../state/modeStore';
import { getCommand, runCommand } from '../../../state/commandStore';
import {
  $lastStatusMessage,
  $progress,
  $statusMessage,
  $toolStatus,
} from '../../../state/statusStore';
import { openNotificationCenter } from '../../../state/notificationStore';
import { $activeLayer, $layerSummaries } from '../../../state/selectors';
import { $layerView, layerViewState } from '../../../state/layerStore';
import { setActiveLayer } from '../../../state/editorStore';
import { disarmTool } from '../../../state/modeStore';
import { $selectionCount } from '../../../state/selectors';
import { $snapEnabled, toggleSnap } from '../../../state/snapStore';
import { $gameDataFindings, focusFinding } from '../../../state/dataModeStore';

/**
 * The phone's status strip (design: `plans/flexo_v2/design/design-system-services.md` §8.1;
 * foundation §12 — phone parity is LOCKED, not a fallback). One row above the bottom edge:
 *
 * `[mode/tool chip] [Layer: <name>] [message channel] [🔔badge]`
 *
 * It is the phone home for everything this phase deleted from the canvas: the toasts (now
 * the message channel), and `SeatViewBar`'s phone Exit — **while a tool is armed the
 * mode/tool chip becomes the tool, and tapping it CANCELS the tool**. That tap is the
 * phone's Esc, and today it is the only pointer route out of seat view, the measure tool and
 * exhaust placement.
 *
 * Deliberately absent: modifier hints, the rotate/nudge chips and the FPS readout are
 * desktop-only by design (keyboard features; §8.1) — their ACTIONS reach touch through the
 * Inspector sheet's `TouchNudgeCluster` instead. The mode/tool chip's mini mode menu is kept
 * even though `ModeTabBar` now docks below this strip: the chip is what the tool takes over,
 * and the menu is the reachable route while a tool is armed.
 *
 * Sized on the `sm` tier with explicit 44px rows (foundation §14.4 — `sm` alone is a 28px
 * control, which is not a touch target).
 *
 * Undo enrollment: NONE. Everything it edits (active layer, tool arm state, notification
 * read state) is ephemeral or persisted view state owned elsewhere.
 */
export function CondensedStatusBar() {
  return (
    <div className="relative flex min-h-11 flex-none items-center gap-1 border-t border-border bg-panel px-1 text-xs text-fg-muted">
      <ModeOrToolChip />
      <LayerChip />
      <DataIssueChip />
      <PhoneMessageChannel />
      <SelectionChip />
      <SnapChip />
      <NotificationBell className="min-h-11 px-2" iconSize={16} />
      <ProgressUnderline />
    </div>
  );
}

/**
 * The Data-mode issue chip (design-data-engine-modes.md §A8) — `⚠ N`, tapping opens the
 * findings list as a sheet. It is the phone's stand-in for the desktop status bar's Data
 * segment, and picking a finding closes the sheet and jumps to the offending card, which is
 * the same `focusFinding` the navigator's validation strip uses.
 *
 * Absent outside Data mode and absent when the part is clean.
 */
function DataIssueChip() {
  const mode = useStore($mode);
  const findings = useStore($gameDataFindings);
  const [open, setOpen] = useState(false);

  if (mode !== 'data' || findings.length === 0) return null;

  const blocks = findings.filter((f) => f.severity === 'block').length;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11 shrink-0 gap-1 px-2"
        aria-label={`${findings.length} data issues`}
        onPress={() => setOpen(true)}
      >
        <AlertTriangle size={16} className={cn(blocks > 0 ? 'text-danger' : 'text-warning')} />
        <span className="font-mono tabular-nums">{findings.length}</span>
      </Button>

      {/* Mounted only while open, so the list re-reads the live findings on every open. */}
      <Sheet isOpen={open} onOpenChange={setOpen} detent="50" ariaLabel="Data issues">
        <Dialog className="min-h-0 flex-1 overflow-y-auto p-2">
          <FindingsList
            findings={findings}
            onSelect={(finding) => {
              setOpen(false);
              closePhoneSheets();
              focusFinding(finding);
            }}
          />
        </Dialog>
      </Sheet>
    </>
  );
}

/** The selection-count chip (§8.1) — the phone's echo of the desktop selection readout. */
function SelectionChip() {
  const count = useStore($selectionCount);

  if (count === 0) return null;
  return (
    <Chip className="shrink-0" aria-label={`${count} selected`}>
      {count}
    </Chip>
  );
}

/**
 * The snap chip (§8.1), mirroring the Tool bar strip's magnet. Tapping toggles it — the
 * "hold ⌃ for the temporary opposite" half is a keyboard feature and simply does not exist
 * on touch.
 */
function SnapChip() {
  const enabled = useStore($snapEnabled);

  return (
    <Button
      size="sm"
      variant="ghost"
      className={cn('min-h-11 shrink-0 px-2', enabled && 'text-accent')}
      aria-label="Snap while dragging"
      aria-pressed={enabled}
      onPress={() => toggleSnap()}
    >
      <Magnet size={16} />
    </Button>
  );
}

/**
 * The mode chip — replaced by the ARMED TOOL whenever one is live, in which case tapping it
 * cancels the tool (§8.1). That tap IS the phone's Escape, and since every transient tool is
 * a tenant of the single `$activeTool` slot (foundation §2.6), one `disarmTool()` runs
 * whichever teardown the armed tool registered — the measure tool's pending point, the
 * marquee's rect, seat view's camera, the exhaust gizmo.
 *
 * With no tool it opens the mini mode menu: the same five `mode.*` commands the desktop chip
 * and the menubar switcher run.
 */
function ModeOrToolChip() {
  const mode = useStore($mode);
  const tool = useStore($toolStatus);
  const [menuOpen, setMenuOpen] = useState(false);

  if (tool) {
    const ToolIcon = TOOL_ICONS[tool.icon];
    return (
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11 min-w-0 gap-1 px-2 text-fg"
        aria-label={`${tool.text} — tap to exit`}
        onPress={() => disarmTool()}
      >
        {ToolIcon && <ToolIcon size={16} className="shrink-0" />}
        <span className="max-w-[12ch] truncate">{tool.text}</span>
        <X size={14} className="shrink-0 text-fg-subtle" />
      </Button>
    );
  }

  const ModeIcon = MODE_ICONS[mode];
  const label = MODES.find((entry) => entry.id === mode)?.label ?? 'Build';

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11 min-w-0 gap-1 px-2 text-fg"
        aria-label={`Editing mode: ${label}`}
        onPress={() => setMenuOpen(true)}
      >
        <ModeIcon size={16} className="shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="shrink-0 text-fg-subtle" />
      </Button>

      {/* The sheet renders `null` while closed, so the rows below re-read every command's
          `enabled()`/`checked()` on each open instead of freezing a first-render snapshot. */}
      <Sheet isOpen={menuOpen} onOpenChange={setMenuOpen} detent="50" ariaLabel="Editing mode">
        <Dialog className="min-h-0 flex-1 overflow-y-auto">
          <ModeRows onDone={() => setMenuOpen(false)} />
        </Dialog>
      </Sheet>
    </>
  );
}

function ModeRows({ onDone }: { onDone(): void }) {
  return (
    <div className="flex flex-col p-1">
      {MODES.map((entry) => {
        const command = getCommand(`mode.${entry.id}`);
        const Icon = MODE_ICONS[entry.id];
        return (
          <Button
            key={entry.id}
            size="sm"
            variant="ghost"
            className="min-h-11 justify-start gap-2 px-3 font-normal"
            isDisabled={command?.enabled?.() === false}
            onPress={() => {
              runCommand(`mode.${entry.id}`);
              onDone();
            }}
          >
            <span className="flex w-4 shrink-0 justify-center text-accent">
              {command?.checked?.() === true && <Check size={14} />}
            </span>
            <Icon size={16} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{entry.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

/**
 * `Layer: <name>` — Build and Animation only, matching the desktop segment. Tapping opens
 * the same layer list as a sheet; picking one sets the layer new entities land on (view
 * state, not undoable). This is the v1 phone-FAB parity item foundation §12 calls out.
 */
function LayerChip() {
  const mode = useStore($mode);
  const layer = useStore($activeLayer);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (mode !== 'build' && mode !== 'animation') return null;

  const name = layer?.name ?? 'None';
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11 min-w-0 gap-1 px-2"
        aria-label={`Active layer: ${name}`}
        onPress={() => setPickerOpen(true)}
      >
        <span className="shrink-0 text-fg-subtle">Layer:</span>
        <span className="max-w-[10ch] truncate text-fg">{name}</span>
        <ChevronDown size={14} className="shrink-0 text-fg-subtle" />
      </Button>

      <Sheet isOpen={pickerOpen} onOpenChange={setPickerOpen} detent="50" ariaLabel="Active layer">
        <Dialog className="min-h-0 flex-1 overflow-y-auto">
          <LayerRows onDone={() => setPickerOpen(false)} />
        </Dialog>
      </Sheet>
    </>
  );
}

function LayerRows({ onDone }: { onDone(): void }) {
  const summaries = useStore($layerSummaries);
  const active = useStore($activeLayer);
  const view = useStore($layerView);

  return (
    <div className="flex flex-col p-1">
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
          <Button
            key={summary.id}
            size="sm"
            variant="ghost"
            className="min-h-11 justify-start gap-2 px-3 font-normal"
            onPress={() => {
              setActiveLayer(summary.id);
              onDone();
            }}
          >
            <span className="flex w-4 shrink-0 justify-center text-accent">
              {summary.id === active?.id && <Check size={14} />}
            </span>
            <span className="min-w-0 flex-1 truncate text-left">{summary.layer.name}</span>
            {locked && <Lock size={12} className="shrink-0 text-fg-subtle" />}
            <Chip className="shrink-0">{count}</Chip>
          </Button>
        );
      })}
    </div>
  );
}

/**
 * The message channel, same single-slot overwrite semantics and the same severity tints as
 * the desktop segment — but the whole strip of text is the tap target for the notification
 * sheet, because the phone has no bell-sized precision (§8.1).
 */
function PhoneMessageChannel() {
  const message = useStore($statusMessage);
  const shown = useStore($lastStatusMessage);

  return (
    <Button
      size="sm"
      variant="ghost"
      className="min-h-11 min-w-0 flex-1 justify-start gap-1.5 px-2 font-normal"
      aria-label="Notifications"
      onPress={() => openNotificationCenter(shown?.notificationId)}
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'flex min-w-0 items-center gap-1.5 transition-opacity duration-[120ms]',
          message ? 'opacity-100' : 'opacity-0',
        )}
      >
        {shown && (
          <>
            <span
              className={cn('size-[2px] shrink-0 rounded-full', SEVERITY_DOT[shown.severity])}
            />
            <span className={cn('truncate', SEVERITY_TEXT[shown.severity])}>{shown.text}</span>
          </>
        )}
      </div>
    </Button>
  );
}

/**
 * Progress has no segment of its own down here — it is a 2px accent underline across the
 * whole strip (§8.1), determinate where the aggregate knows its totals.
 */
function ProgressUnderline() {
  const progress = useStore($progress);

  if (!progress.active) return null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute inset-x-0 bottom-0 h-[2px] bg-accent',
        progress.percent === null && 'animate-pulse',
      )}
      style={progress.percent === null ? undefined : { width: `${progress.percent}%` }}
    />
  );
}
