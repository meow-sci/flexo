import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Settings } from 'lucide-react'
import {
  Modal,
  Dialog,
  DialogHeader,
  SectionTitle,
  ToolbarButton,
  Button,
  ConfirmDialog,
} from './kit'
import { $connectorSettings, setConnectorSettings } from '../state/settingsStore'
import { PreciseNumberInput } from './PreciseNumberInput'

/**
 * Wipes all client-persisted state — Web Storage (localStorage + sessionStorage)
 * AND every IndexedDB database (e.g. the granted mods-folder handle). Used by
 * the "RESET EVERYTHING" action; the page is reloaded immediately after so the
 * editor boots from defaults.
 */
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

/**
 * Top-surface "Settings" action (cog, last button): opens a modal of global
 * editor settings. Currently the Connectors section (cube size), which drives
 * the 3D connector gizmos via settingsStore, plus a destructive "Reset
 * Everything" action that wipes all client storage.
 */
export function SettingsButton() {
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const connectors = useStore($connectorSettings)

  return (
    <>
      <ToolbarButton onPress={() => setOpen(true)} aria-label="Settings">
        <Settings size={16} />
        {/* Label visible only on phone (overflow menu); desktop toolbar stays icon-only. */}
        <span className="sm:hidden">Settings</span>
      </ToolbarButton>
      <Modal isOpen={open} onOpenChange={setOpen} isDismissable variant="center">
        <Dialog>
          <DialogHeader title="Settings" onClose={() => setOpen(false)} />
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

            <SectionTitle className="mt-4">Danger Zone</SectionTitle>
            <Button variant="danger" size="md" onPress={() => setConfirmReset(true)}>
              RESET EVERYTHING 🔥
            </Button>
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
