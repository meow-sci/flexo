import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Popup, PopupContent, SectionTitle, ToolbarButton, Tooltip } from '@cladd-ui/react'
import { $connectorSettings, setConnectorSettings } from '../state/settingsStore'
import { PreciseNumberInput } from './PreciseNumberInput'
import { Settings } from 'lucide-react'


/**
 * Top-surface "Settings" action (cog, last button): opens a full-screen Popup of
 * global editor settings. Currently the Connectors section (cube size + arrow
 * length), which drive the 3D connector gizmos via settingsStore.
 */
export function SettingsButton() {
  const [open, setOpen] = useState(false)
  const connectors = useStore($connectorSettings)

  return (
    <>
      <Tooltip tooltip="Settings">
        <ToolbarButton square onClick={() => setOpen(true)} aria-label="Settings">
          <Settings />
        </ToolbarButton>
      </Tooltip>
      <Popup
        open={open}
        onOpenChange={setOpen}
        contentClassName="max-w-md [&>.rounded-cladd-popup]:rounded-lg"
        headerLeft={<span className="px-2 pb-1 text-cladd-sm font-semibold">Settings</span>}
      >
        <PopupContent>
          <SectionTitle>Connectors Settings</SectionTitle>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-cladd-sm text-cladd-fg-soft">Connector size</span>
              <div className="flex items-center gap-1">
                <PreciseNumberInput
                  className="w-40"
                  min={0.01}
                  value={connectors.size}
                  onCommit={(size) => setConnectorSettings({ size })}
                />
                <span className="text-xs text-cladd-fg-softer">m</span>
              </div>
            </label>
          </div>
        </PopupContent>
      </Popup>
    </>
  )
}
