import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Menu as MenuIcon } from 'lucide-react';
import {
  MenuTrigger,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  Dialog,
  DialogHeader,
  SectionTitle,
  Slider,
  Select,
  ListBoxItem,
  TextField,
  Switch,
  ToolbarButton,
  ConfirmDialog,
  Popover,
} from './kit';
import {
  $connectorSettings,
  $ivaSeatSettings,
  $kittenTextureExport,
  $selectionHighlight,
  $showFpsCounter,
  setConnectorSettings,
  setIvaSeatSettings,
  setKittenTextureExport,
  setSelectionHighlight,
  setShowFpsCounter,
} from '../state/settingsStore';
import type { KittenTextureExportSettings } from '../state/settingsStore';
import { openHelp } from '../state/helpStore';
import { openAbout } from '../state/aboutStore';
import { PreciseNumberInput } from './PreciseNumberInput';
import { ScaleEverythingDialog } from './ScaleEverythingDialog';

import { nukeAndReload } from './nukeAndReload';

export function SettingsModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const connectors = useStore($connectorSettings);
  const highlight = useStore($selectionHighlight);
  const ivaSeats = useStore($ivaSeatSettings);
  const kittenTex = useStore($kittenTextureExport);
  const showFps = useStore($showFpsCounter);
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable variant="center">
      <Dialog>
        <DialogHeader title="Settings" onClose={() => onOpenChange(false)} />
        <div className="flex flex-col gap-3 overflow-auto p-4">
          <SectionTitle>Viewport</SectionTitle>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg-muted">FPS counter</span>
            <Switch
              aria-label="Show FPS counter"
              isSelected={showFps}
              onChange={setShowFpsCounter}
            />
          </label>

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

          <SectionTitle>IVA seats</SectionTitle>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg-muted">Marker size</span>
            <div className="flex items-center gap-1">
              <PreciseNumberInput
                aria-label="IVA seat marker size (m)"
                className="w-40"
                min={0.01}
                value={ivaSeats.markerSize}
                onCommit={(markerSize) => setIvaSeatSettings({ markerSize })}
              />
              <span className="text-xs text-fg-subtle">m</span>
            </div>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg-muted">Show gaze cone</span>
            <Switch
              aria-label="Show IVA seat gaze cone"
              isSelected={ivaSeats.showGazeCone}
              onChange={(showGazeCone) => setIvaSeatSettings({ showGazeCone })}
            />
          </label>
          <span className="text-xs text-fg-subtle">
            The gaze cone is indicative only — it shows roughly where a seat looks. In game the view
            is clamped to a 90° hemisphere around the seat's forward axis, so you can look anywhere
            ahead of the seat but never behind it.
          </span>

          <SectionTitle>Selection highlight</SectionTitle>
          <HighlightRow
            label="Meshes"
            color={highlight.meshColor}
            alpha={highlight.meshAlpha}
            onColor={(meshColor) => setSelectionHighlight({ meshColor })}
            onAlpha={(meshAlpha) => setSelectionHighlight({ meshAlpha })}
          />
          <HighlightRow
            label="Kittens"
            color={highlight.kittenColor}
            alpha={highlight.kittenAlpha}
            onColor={(kittenColor) => setSelectionHighlight({ kittenColor })}
            onAlpha={(kittenAlpha) => setSelectionHighlight({ kittenAlpha })}
          />

          <SectionTitle>Kitten mesh textures (export)</SectionTitle>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg-muted">Source</span>
            <Select
              size="sm"
              aria-label="Kitten mesh texture export mode"
              className="w-52"
              value={kittenTex.mode}
              onChange={(k) =>
                setKittenTextureExport({ mode: k as KittenTextureExportSettings['mode'] })
              }
            >
              <ListBoxItem id="reference">Reference game install</ListBoxItem>
              <ListBoxItem id="bundle">Bundle copies into mod</ListBoxItem>
            </Select>
          </label>
          {kittenTex.mode === 'reference' && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-fg-muted">Content/Core path</span>
              <TextField
                aria-label="Game Content/Core folder path"
                inputClassName="font-mono text-xs"
                placeholder="C:\Program Files\Kitten Space Agency\Content\Core"
                value={kittenTex.contentCorePath}
                onChange={(v) => setKittenTextureExport({ contentCorePath: v })}
              />
              <span className="text-xs text-fg-subtle">
                Kitten SubParts reference the game's own .ktx2 at this path (nothing copied into the
                mod). Tied to this install location — switch to “Bundle” for a portable mod.
              </span>
            </label>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}

/** A color swatch + strength slider row for one selection-highlight target. */
function HighlightRow({
  label,
  color,
  alpha,
  onColor,
  onAlpha,
}: {
  label: string;
  color: string;
  alpha: number;
  onColor: (hex: string) => void;
  onAlpha: (alpha: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-fg-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} highlight color`}
          value={color}
          onChange={(e) => onColor(e.target.value)}
          className="h-7 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent"
        />
        <Slider
          aria-label={`${label} highlight strength`}
          className="w-32"
          minValue={0}
          maxValue={1}
          step={0.05}
          value={alpha}
          onChange={(v) => onAlpha(v as number)}
        />
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-fg-subtle">
          {Math.round(alpha * 100)}%
        </span>
      </div>
    </div>
  );
}

export function SettingsButton() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetFsGrants, setResetFsGrants] = useState(false);

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
              if (key === 'scale') setScaleOpen(true);
              else if (key === 'settings') setSettingsOpen(true);
              else if (key === 'shortcuts') openHelp();
              else if (key === 'reset') {
                setResetFsGrants(false);
                setConfirmReset(true);
              } else if (key === 'about') openAbout();
            }}
          >
            <MenuItem id="scale">Scale Everything</MenuItem>
            <MenuSeparator />
            <MenuItem id="settings">Settings</MenuItem>
            <MenuItem id="shortcuts">Shortcuts</MenuItem>
            <MenuItem id="about">About</MenuItem>
            <MenuSeparator />
            <MenuItem id="reset" variant="danger">
              Reset Everything 🔥
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>

      <SettingsModal isOpen={settingsOpen} onOpenChange={setSettingsOpen} />

      <ScaleEverythingDialog isOpen={scaleOpen} onOpenChange={setScaleOpen} />

      <ConfirmDialog
        isOpen={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset everything?"
        text="This permanently deletes every saved project, layer view state, and any other locally-stored data, then reloads the page. There's no undo."
        confirmLabel="RESET EVERYTHING 🔥"
        confirmVariant="danger"
        onConfirm={() => void nukeAndReload({ resetFsGrants })}
      >
        <Switch isSelected={resetFsGrants} onChange={setResetFsGrants}>
          Reset folder access grants (if any)
        </Switch>
      </ConfirmDialog>
    </>
  );
}
