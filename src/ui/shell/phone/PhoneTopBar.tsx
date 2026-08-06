import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { FolderOpen, Menu as MenuIcon, Redo, Undo } from 'lucide-react';
import { Button } from '../../kit';
import { MenuSheet } from './MenuSheet';
import { runCommand } from '../../../state/commandStore';
import { $canRedo, $canUndo } from '../../../state/editorStore';
import { $projectName } from '../../../state/projectStore';
import { $mode, MODES } from '../../../state/modeStore';
import { $activePartMeta, $partEntries } from '../../../state/partsStore';

/**
 * The phone's one slim top row (design: `plans/flexo_v2/design/foundation.md` §12 phone
 * frame): `☰ · mode name · project chip · ↶ ↷`. It is an in-flow flex child of the shell
 * column, exactly like the desktop menubar — nothing here floats over the viewport.
 *
 * Everything except the `☰` runs a COMMAND, so the phone and the desktop menubar cannot
 * drift: the undo/redo pair reads the same `$canUndo`/`$canRedo` and gets the same step
 * flash (emitted by `edit.undo` / `edit.redo` themselves), and the project chip opens the
 * same Project Manager dialog. The `☰` opens {@link MenuSheet}, which renders the whole
 * `MENU_SPEC` — this bar deliberately promotes NO menu item to a button of its own.
 *
 * Sized on the `sm` tier (foundation §14.4: `xs` in chrome, `sm` on phone).
 *
 * Undo enrollment: NONE.
 */
export function PhoneTopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const mode = useStore($mode);
  const projectName = useStore($projectName);
  const canUndo = useStore($canUndo);
  const canRedo = useStore($canRedo);
  const partEntries = useStore($partEntries);
  const activePart = useStore($activePartMeta);

  const modeLabel = MODES.find((entry) => entry.id === mode)?.label ?? '';
  // Multi-part projects prefix the chip with the part being edited (MULTI_PART_PLAN P4.06).
  // A single-part project reads exactly as before — the switcher only earns the space once
  // there is something to switch to.
  const partLabel = partEntries.length > 1 ? (activePart?.name ?? null) : null;

  return (
    <>
      <div className="flex flex-none items-center gap-1 border-b border-border bg-panel px-1 py-(--bar-py) text-xs text-fg">
        <Button
          size="sm"
          iconOnly
          variant="ghost"
          aria-label="Menu"
          onPress={() => setMenuOpen(true)}
        >
          <MenuIcon size={16} />
        </Button>

        <span className="shrink-0 px-1 font-medium">{modeLabel}</span>

        <div className="flex-1" />

        <Button
          size="sm"
          variant="ghost"
          className="min-w-0 gap-1 px-2"
          aria-label={
            partLabel ? `Part: ${partLabel} · Project: ${projectName}` : `Project: ${projectName}`
          }
          onPress={() => runCommand('file.projects')}
        >
          <FolderOpen size={14} className="shrink-0" />
          {/* Each half truncates at the chip's existing `max-w`, so a long part name can
              never squeeze the project out (or the row off the phone). */}
          {partLabel !== null && (
            <>
              <span className="max-w-[12ch] truncate">{partLabel}</span>
              <span className="shrink-0 text-fg-muted">—</span>
            </>
          )}
          <span className="max-w-[12ch] truncate">{projectName}</span>
        </Button>

        <Button
          size="sm"
          iconOnly
          variant="ghost"
          isDisabled={!canUndo}
          aria-label="Undo"
          onPress={() => runCommand('edit.undo')}
        >
          <Undo size={16} />
        </Button>
        <Button
          size="sm"
          iconOnly
          variant="ghost"
          isDisabled={!canRedo}
          aria-label="Redo"
          onPress={() => runCommand('edit.redo')}
        >
          <Redo size={16} />
        </Button>
      </div>

      <MenuSheet isOpen={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
