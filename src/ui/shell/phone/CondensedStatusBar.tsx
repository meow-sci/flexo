import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Check, ChevronDown, Lock, X } from 'lucide-react';
import { Button, Chip, cn, Dialog, Sheet } from '../../kit';
import { NotificationBell } from '../../status/NotificationBell';
import { MODE_ICONS, SEVERITY_DOT, SEVERITY_TEXT, TOOL_ICONS } from '../../status/statusTokens';
import { $interimMode, INTERIM_MODES } from '../../commands/interimMode';
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
import { exitSeatView } from '../../../state/ivaStore';
import { setMeasureTool } from '../../../state/measurementStore';
import { setEngineExhaustGizmo } from '../../../state/engineStore';

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
 * **Interim scope.** The strip carries the segments that EXIST after Phase 3. Deliberately
 * absent:
 * - Selection-count chip and snap chip — they arrive with their features (the Build-mode
 *   phase); their slots sit between the message channel and the bell.
 * - `ModeTabBar` will dock BELOW this strip when the mode machine lands.
 * - Modifier hints, rotate/nudge chips and the FPS readout are desktop-only by design
 *   (keyboard features; §8.1). The Inspector-sheet touch steppers that answer v1's phone
 *   nudge/rotate gap (§8.2) belong to the selection-area phase.
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
      <PhoneMessageChannel />
      <NotificationBell className="min-h-11 px-2" iconSize={16} />
      <ProgressUnderline />
    </div>
  );
}

/**
 * The mode chip — replaced by the ARMED TOOL whenever one is live, in which case tapping it
 * exits the tool (§8.1). With no tool it opens the mini mode menu: the same five `mode.*`
 * commands the desktop chip and the menubar switcher run.
 */
function ModeOrToolChip() {
  const mode = useStore($interimMode);
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
        onPress={() => cancelTool(tool.toolId)}
      >
        {ToolIcon && <ToolIcon size={16} className="shrink-0" />}
        <span className="max-w-[12ch] truncate">{tool.text}</span>
        <X size={14} className="shrink-0 text-fg-subtle" />
      </Button>
    );
  }

  const ModeIcon = MODE_ICONS[mode];
  const label = INTERIM_MODES.find((entry) => entry.id === mode)?.label ?? 'Build';

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

/** The phone's Esc: each armed tool's own disarm call (§8.1). */
function cancelTool(toolId: string): void {
  if (toolId === 'seat-view') exitSeatView();
  else if (toolId === 'measure') setMeasureTool('none');
  else if (toolId === 'exhaust') setEngineExhaustGizmo(false);
}

function ModeRows({ onDone }: { onDone(): void }) {
  return (
    <div className="flex flex-col p-1">
      {INTERIM_MODES.map((entry) => {
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
  const mode = useStore($interimMode);
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
