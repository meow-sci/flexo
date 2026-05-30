import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Menu as MenuIcon, Redo, Undo } from 'lucide-react'
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
  ConfirmDialog,
} from './kit'
import { $canRedo, $canUndo, redo, undo } from '../state/editorStore'
import { AddButton } from './AddButton'
import { ProjectButton } from './ProjectButton'
import { PartDataButton } from './PartDataButton'
import { ExportButton } from './ExportButton'
import { ViewButton } from './ViewButton'
import { MeasureButton } from './MeasureButton'
import { HistoryButton } from './HistoryButton'
import { SettingsModal } from './SettingsButton'
import { nukeAndReload } from './nukeAndReload'
import { openHelp } from '../state/helpStore'

/**
 * Phone-only top toolbar. Primary actions (Project, Add, Undo/Redo) are always
 * visible. Secondary actions live in a proper react-aria Menu (☰) that
 * auto-dismisses on selection. Each overlay is controlled from here so there's
 * no menu-inside-a-menu nesting.
 */
export function MobileTopBar() {
  const canUndo = useStore($canUndo)
  const canRedo = useStore($canRedo)

  const [partDataOpen, setPartDataOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [measureOpen, setMeasureOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <>
      <Toolbar
        aria-label="Editor actions"
        className="rounded-none border-x-0 border-t-0 px-2"
      >
        <ProjectButton />

        <div className="flex-1" />

        <AddButton />

        <ToolbarSeparator />

        <ToolbarButton
          isDisabled={!canUndo}
          aria-label="Undo"
          onPress={() => {
            const d = undo()
            if (d) toast({ title: `Undo: ${d}` }, { timeout: 1500 })
          }}
        >
          <Undo size={16} />
        </ToolbarButton>
        <ToolbarButton
          isDisabled={!canRedo}
          aria-label="Redo"
          onPress={() => {
            const d = redo()
            if (d) toast({ title: `Redo: ${d}` }, { timeout: 1500 })
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
                if (key === 'partData') setPartDataOpen(true)
                else if (key === 'export') setExportOpen(true)
                else if (key === 'view') setViewOpen(true)
                else if (key === 'measure') setMeasureOpen(true)
                else if (key === 'history') setHistoryOpen(true)
                else if (key === 'settings') setSettingsOpen(true)
                else if (key === 'shortcuts') openHelp()
                else if (key === 'reset') setConfirmReset(true)
              }}
            >
              <MenuItem id="partData">Part Data</MenuItem>
              <MenuItem id="export">Export</MenuItem>
              <MenuItem id="view">View</MenuItem>
              <MenuItem id="measure">Measure</MenuItem>
              <MenuItem id="history">History</MenuItem>
              <MenuSeparator />
              <MenuItem id="settings">Settings</MenuItem>
              <MenuItem id="shortcuts">Shortcuts</MenuItem>
              <MenuSeparator />
              <MenuItem id="reset" variant="danger">Reset Everything 🔥</MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </Toolbar>

      <PartDataButton isOpen={partDataOpen} onOpenChange={setPartDataOpen} />
      <ExportButton isOpen={exportOpen} onOpenChange={setExportOpen} />
      <ViewButton isOpen={viewOpen} onOpenChange={setViewOpen} />
      <MeasureButton isOpen={measureOpen} onOpenChange={setMeasureOpen} />
      <HistoryButton isOpen={historyOpen} onOpenChange={setHistoryOpen} />
      <SettingsModal isOpen={settingsOpen} onOpenChange={setSettingsOpen} />
      <ConfirmDialog
        isOpen={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset everything?"
        text="This permanently deletes every saved project, layer view state, the granted mods folder, and any other locally-stored data, then reloads the page. There's no undo."
        confirmLabel="RESET EVERYTHING 🔥"
        confirmVariant="danger"
        onConfirm={() => void nukeAndReload()}
      />
    </>
  )
}
