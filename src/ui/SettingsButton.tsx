import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { NumberField, Popup, PopupContent, SectionTitle, ToolbarButton, Tooltip } from '@cladd-ui/react'
import { $connectorSettings, setConnectorSettings } from '../state/settingsStore'

function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

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
          <CogIcon />
        </ToolbarButton>
      </Tooltip>
      <Popup
        open={open}
        onOpenChange={setOpen}
        contentClassName="max-w-md"
        headerLeft={<span className="px-2 pb-1 text-cladd-sm font-semibold">Settings</span>}
      >
        <PopupContent>
          <SectionTitle>Connectors Settings</SectionTitle>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-cladd-sm text-cladd-fg-soft">Connector size</span>
              <div className="flex items-center gap-1">
                <NumberField
                  size="sm"
                  className="w-28"
                  min={0.01}
                  step={0.05}
                  value={connectors.size}
                  onChange={(size) => setConnectorSettings({ size })}
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
