import { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Modal,
  Dialog,
  DialogHeader,
  SectionTitle,
  Slider,
  Select,
  ListBoxItem,
  TextField,
  Switch,
  Button,
  ConfirmDialog,
} from './kit';
import {
  $connectorSettings,
  $ivaSeatSettings,
  $kittenTextureExport,
  $lightSettings,
  $selectionHighlight,
  $showFpsCounter,
  DEFAULT_LIGHT_SETTINGS,
  setConnectorSettings,
  setIvaSeatSettings,
  setKittenTextureExport,
  setLightSettings,
  setSelectionHighlight,
  setShowFpsCounter,
  type LightVizSettings,
} from '../state/settingsStore';
import type { KittenTextureExportSettings } from '../state/settingsStore';
import { $grids, setGrid, type Axis } from '../state/viewStore';
import {
  $lighting,
  ENVIRONMENT_PRESETS,
  setLighting,
  TONE_MAPPING_MODES,
  type ToneMappingMode,
} from '../state/lightingStore';
import { PreciseNumberInput } from './PreciseNumberInput';
import { nukeAndReload } from './nukeAndReload';

/**
 * Deep-link payload. The tabbed Settings rewrite honours `tab`; this interim flat-section
 * version accepts and ignores it so callers can already be written against the real API.
 */
export interface SettingsDialogParams {
  tab?: string;
}

const GRID_AXES: { axis: Axis; label: string }[] = [
  { axis: 'x', label: 'X' },
  { axis: 'y', label: 'Y' },
  { axis: 'z', label: 'Z' },
];

/**
 * "Settings" — every persistent preference, root-hosted by `DialogRoot` under the dialog
 * id `'settings'`.
 *
 * Beyond the v1 modal this now owns the numeric/slider half of the old View popover (grid
 * spacing, tone map, exposure, reflections, sky blur, light-coverage exposure): the split
 * rule is toggles/radios in the View menu, numerics/sliders in Settings. Every slider
 * live-commits to its store exactly as it did in the popover. It also owns the danger
 * zone — Reset Everything is reachable from here and nowhere else.
 *
 * None of these are document state, so nothing here enrolls in undo.
 */
export function SettingsDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accepted and ignored until the tabbed rewrite lands. */
  params?: SettingsDialogParams;
}) {
  const connectors = useStore($connectorSettings);
  const highlight = useStore($selectionHighlight);
  const ivaSeats = useStore($ivaSeatSettings);
  const kittenTex = useStore($kittenTextureExport);
  const showFps = useStore($showFpsCounter);
  const grids = useStore($grids);
  const lighting = useStore($lighting);
  // Resolved read: a settings object persisted before these fields existed must show its
  // defaults, not blank selects (see lightSettings()'s JSDoc).
  const lightViz = { ...DEFAULT_LIGHT_SETTINGS, ...useStore($lightSettings) };
  const envHasSky = ENVIRONMENT_PRESETS.find((p) => p.id === lighting.environment)?.file != null;
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetFsGrants, setResetFsGrants] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      variant="center"
      className="max-h-[85vh] w-full max-w-2xl"
    >
      <Dialog className="min-h-0">
        <DialogHeader title="Settings" onClose={() => onOpenChange(false)} />
        <div className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
          <SectionTitle>Viewport</SectionTitle>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg-muted">FPS counter</span>
            <Switch
              aria-label="Show FPS counter"
              isSelected={showFps}
              onChange={setShowFpsCounter}
            />
          </label>

          {/* Grid spacing (the per-axis show/hide switches stay in the View menu). */}
          {GRID_AXES.map(({ axis, label }) => (
            <label key={axis} className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg-muted">{label} grid spacing</span>
              <div className="flex items-center gap-1">
                <PreciseNumberInput
                  aria-label={`${label} grid spacing (m)`}
                  className="w-40"
                  min={0.05}
                  value={grids[axis].spacing}
                  onCommit={(spacing) => setGrid(axis, { spacing })}
                />
                <span className="text-xs text-fg-subtle">m</span>
              </div>
            </label>
          ))}

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

          <SectionTitle>Scene</SectionTitle>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-sm text-fg-muted">Tone map</span>
            <Select
              size="sm"
              className="flex-1"
              aria-label="Tone mapping"
              selectedKey={lighting.toneMapping}
              items={TONE_MAPPING_MODES}
              onSelectionChange={(k) => setLighting({ toneMapping: k as ToneMappingMode })}
            >
              {(m) => (
                <ListBoxItem id={m.id} textValue={m.label}>
                  {m.label}
                </ListBoxItem>
              )}
            </Select>
          </div>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-sm text-fg-muted">
              <span>Exposure</span>
              <span className="text-fg-subtle">{lighting.exposure.toFixed(2)}</span>
            </span>
            <Slider
              aria-label="Exposure"
              minValue={0.1}
              maxValue={3}
              step={0.05}
              value={lighting.exposure}
              onChange={(exposure) => setLighting({ exposure: exposure as number })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-sm text-fg-muted">
              <span>Reflections</span>
              <span className="text-fg-subtle">{lighting.environmentIntensity.toFixed(2)}</span>
            </span>
            <Slider
              aria-label="Reflections"
              minValue={0}
              maxValue={3}
              step={0.05}
              value={lighting.environmentIntensity}
              onChange={(v) => setLighting({ environmentIntensity: v as number })}
            />
          </label>

          {envHasSky && lighting.showEnvironmentBackground && (
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-sm text-fg-muted">
                <span>Sky blur</span>
                <span className="text-fg-subtle">{lighting.backgroundBlur.toFixed(2)}</span>
              </span>
              <Slider
                aria-label="Sky blur"
                minValue={0}
                maxValue={1}
                step={0.01}
                value={lighting.backgroundBlur}
                onChange={(v) => setLighting({ backgroundBlur: v as number })}
              />
            </label>
          )}

          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-sm text-fg-muted">Light exposure</span>
            <Select
              size="sm"
              className="flex-1"
              aria-label="Light coverage exposure"
              selectedKey={lightViz.exposureMode}
              onSelectionChange={(k) =>
                setLightSettings({ exposureMode: k as LightVizSettings['exposureMode'] })
              }
            >
              <ListBoxItem id="auto">Auto</ListBoxItem>
              <ListBoxItem id="absolute">Absolute</ListBoxItem>
            </Select>
            {lightViz.exposureMode === 'absolute' && (
              <PreciseNumberInput
                aria-label="Absolute coverage exposure"
                className="w-20 shrink-0"
                min={0}
                step={0.1}
                value={lightViz.vizExposure}
                onCommit={(vizExposure) => setLightSettings({ vizExposure })}
              />
            )}
          </div>
          <p className="text-xs leading-snug text-fg-subtle">
            <b>Auto</b> scales each light to its own brightness (best for editing one).{' '}
            <b>Absolute</b> shades every light against the same reference, so a dim light looks dim.
          </p>

          <SectionTitle>Kitten mesh textures (export)</SectionTitle>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg-muted">Source</span>
            <Select
              size="sm"
              aria-label="Kitten mesh texture export mode"
              className="w-52"
              selectedKey={kittenTex.mode}
              onSelectionChange={(k) =>
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

          <SectionTitle>Danger zone</SectionTitle>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs leading-snug text-fg-subtle">
              Deletes every saved project and all locally-stored data, then reloads.
            </span>
            <Button
              size="sm"
              variant="danger"
              className="shrink-0"
              onPress={() => {
                setResetFsGrants(false);
                setConfirmReset(true);
              }}
            >
              Reset Everything 🔥
            </Button>
          </div>
        </div>
      </Dialog>

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
