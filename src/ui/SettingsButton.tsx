import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Menu as MenuIcon } from 'lucide-react'
import {
  MenuTrigger,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  Dialog,
  DialogHeader,
  SectionTitle,
  ToolbarButton,
  ConfirmDialog,
  Popover,
} from './kit'
import { $connectorSettings, setConnectorSettings } from '../state/settingsStore'
import { openHelp } from '../state/helpStore'
import { PreciseNumberInput } from './PreciseNumberInput'

async function nukeAndReload(): Promise<void> {
  try {
    localStorage.clear()
    sessionStorage.clear()
    // indexedDB.databases() is supported in Chromium/WebKit; some older Firefox
    // builds lack it, in which case we can't enumerate — localStorage is still
    // cleared and the page still reloads.
    if (typeof indexedDB !== 'undefined' && 'databases' in indexedDB) {
      const dbs = await indexedDB.databases()
      await Promise.all(
        dbs.map((db) =>
          db.name
            ? new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(db.name!)
                req.onsuccess = req.onerror = req.onblocked = () => resolve()
              })
            : Promise.resolve(),
        ),
      )
    }
  } finally {
    window.location.reload()
  }
}

export function SettingsButton() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const connectors = useStore($connectorSettings)

  return (
    <>
      <MenuTrigger>
        <ToolbarButton aria-label="Menu">
          <MenuIcon size={16} />
          <span className="sm:hidden">Menu</span>
        </ToolbarButton>
        <Popover placement="bottom end" className="w-44">
          <Menu
            onAction={(key) => {
              if (key === 'settings') setSettingsOpen(true)
              else if (key === 'shortcuts') openHelp()
              else if (key === 'reset') setConfirmReset(true)
            }}
          >
            <MenuItem id="settings">Settings</MenuItem>
            <MenuItem id="shortcuts">Shortcuts</MenuItem>
            <MenuSeparator />
            <MenuItem id="reset" variant="danger">
              Reset Everything 🔥
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>

      <Modal isOpen={settingsOpen} onOpenChange={setSettingsOpen} isDismissable variant="center">
        <Dialog>
          <DialogHeader title="Settings" onClose={() => setSettingsOpen(false)} />
          <div className="flex flex-col gap-3 overflow-auto p-4">
            <SectionTitle>Connectors</SectionTitle>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg-muted">Connector size</span>
              <div className="flex items-center gap-1">
                <PreciseNumberInput
                  aria-label="Connector size (m)"
                  className="w-40"
                  min={0.01}
                  value={connectors.size}
                  onCommit={(size) => setConnectorSettings({ size })}
                />
                <span className="text-xs text-fg-subtle">m</span>
              </div>
            </label>
          </div>
        </Dialog>
      </Modal>

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
