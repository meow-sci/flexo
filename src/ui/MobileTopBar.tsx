import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Menu as MenuIcon, Redo, Undo } from 'lucide-react';
import {
  Toolbar,
  ToolbarSeparator,
  ToolbarButton,
  toast,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
} from './kit';
import { $canRedo, $canUndo, redo, undo } from '../state/editorStore';
import { AddButton } from './AddButton';
import { ProjectButton } from './ProjectButton';
import { ViewButton } from './ViewButton';
import { MeasureButton } from './MeasureButton';
import { HistoryButton } from './HistoryButton';
import { openDialog } from '../state/dialogStore';

/**
 * INTERIM phone-only top toolbar. Primary actions (Project, Add, Undo/Redo) are always
 * visible; secondary actions live in a react-aria Menu (☰) that auto-dismisses on
 * selection. Every overlay it reaches is now root-hosted behind a `dialogStore` id, so
 * this bar carries no dialog mounts of its own — except View / Measure / History, whose
 * popover components still own their bottom-sheet variants until the phone MenuSheet
 * replaces this bar.
 */
export function MobileTopBar() {
  const canUndo = useStore($canUndo);
  const canRedo = useStore($canRedo);

  const [viewOpen, setViewOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <>
      <Toolbar aria-label="Editor actions" className="rounded-none border-x-0 border-t-0 px-2">
        <ProjectButton />

        <div className="flex-1" />

        <AddButton />

        <ToolbarSeparator />

        <ToolbarButton
          isDisabled={!canUndo}
          aria-label="Undo"
          onPress={() => {
            const d = undo();
            if (d) toast({ title: `Undo: ${d}` }, { timeout: 1500 });
          }}
        >
          <Undo size={16} />
        </ToolbarButton>
        <ToolbarButton
          isDisabled={!canRedo}
          aria-label="Redo"
          onPress={() => {
            const d = redo();
            if (d) toast({ title: `Redo: ${d}` }, { timeout: 1500 });
          }}
        >
          <Redo size={16} />
        </ToolbarButton>

        <MenuTrigger>
          <ToolbarButton aria-label="Menu">
            <MenuIcon size={16} />
          </ToolbarButton>
          <Popover placement="bottom end" className="w-48">
            <Menu
              onAction={(key) => {
                if (key === 'partData') openDialog({ id: 'part-data' });
                else if (key === 'export') openDialog({ id: 'export-ksa' });
                else if (key === 'view') setViewOpen(true);
                else if (key === 'measure') setMeasureOpen(true);
                else if (key === 'scale') openDialog({ id: 'scale-everything' });
                else if (key === 'history') setHistoryOpen(true);
                else if (key === 'settings') openDialog({ id: 'settings' });
                else if (key === 'shortcuts') openDialog({ id: 'help' });
                else if (key === 'about') openDialog({ id: 'about' });
              }}
            >
              <MenuItem id="partData">Part Data</MenuItem>
              <MenuItem id="export">Export</MenuItem>
              <MenuItem id="view">View</MenuItem>
              <MenuItem id="measure">Measure</MenuItem>
              <MenuItem id="scale">Scale Everything</MenuItem>
              <MenuItem id="history">History</MenuItem>
              <MenuSeparator />
              <MenuItem id="settings">Settings</MenuItem>
              <MenuItem id="shortcuts">Shortcuts</MenuItem>
              <MenuItem id="about">About</MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </Toolbar>

      {/* The three surfaces that are still popovers rather than dialogStore dialogs.
          "Reset Everything" is deliberately absent: it now lives only in Settings, which
          also fixes the v1 phone bug where the phone's confirm skipped the
          reset-folder-grants switch. */}
      <ViewButton isOpen={viewOpen} onOpenChange={setViewOpen} />
      <MeasureButton isOpen={measureOpen} onOpenChange={setMeasureOpen} />
      <HistoryButton isOpen={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );
}
