import { useStore } from '@nanostores/react'
import {
  Button,
  Checkbox,
  Popover,
  PopoverRoot,
  PopoverTrigger,
  SectionTitle,
  Select,
  Slider,
  ToolbarButton,
} from '@cladd-ui/react'
import {
  $grids,
  setGrid,
  snapCamera,
  type Axis,
  type CameraDir,
} from '../state/viewStore'
import {
  $lighting,
  setLighting,
  ENVIRONMENT_PRESETS,
  TONE_MAPPING_MODES,
  type EnvironmentPreset,
  type ToneMappingMode,
} from '../state/lightingStore'
import { PreciseNumberInput } from './PreciseNumberInput'

const SNAP_ROWS: [CameraDir, CameraDir][] = [
  ['left', 'right'],
  ['front', 'back'],
  ['top', 'bottom'],
]

const GRID_AXES: { axis: Axis; label: string }[] = [
  { axis: 'x', label: 'X' },
  { axis: 'y', label: 'Y' },
  { axis: 'z', label: 'Z' },
]

/**
 * Top-surface "View" action: a Popover with camera-snap buttons (snap to an
 * axis-aligned view, keeping the current zoom) and per-axis reference grids
 * (checkbox + meters spacing). Both drive the three.js layer via viewStore.
 */
const ENV_LABELS: Record<EnvironmentPreset, string> = Object.fromEntries(
  ENVIRONMENT_PRESETS.map((p) => [p.id, p.label]),
) as Record<EnvironmentPreset, string>

const TONE_LABELS: Record<ToneMappingMode, string> = Object.fromEntries(
  TONE_MAPPING_MODES.map((m) => [m.id, m.label]),
) as Record<ToneMappingMode, string>

export function ViewButton() {
  const grids = useStore($grids)
  const lighting = useStore($lighting)
  const envHasSky = ENVIRONMENT_PRESETS.find((p) => p.id === lighting.environment)?.file != null

  return (
    <PopoverRoot>
      <PopoverTrigger>
        <ToolbarButton>View</ToolbarButton>
      </PopoverTrigger>
      <Popover position="bottom" className="w-96 rounded-lg" contentClassName="p-3">
        <SectionTitle>Camera Snap</SectionTitle>
        <div className="mt-2 flex flex-col gap-1.5">
          {SNAP_ROWS.map(([a, b]) => (
            <div key={a} className="flex gap-1.5">
              <Button size="sm" className="flex-1 capitalize" onClick={() => snapCamera(a)}>
                {a}
              </Button>
              <Button size="sm" className="flex-1 capitalize" onClick={() => snapCamera(b)}>
                {b}
              </Button>
            </div>
          ))}
        </div>

        <SectionTitle className="mt-4">Grids</SectionTitle>
        <div className="mt-2 flex flex-col gap-2">
          {GRID_AXES.map(({ axis, label }) => {
            const cfg = grids[axis]
            return (
              <div key={axis} className="flex items-center gap-2">
                <Checkbox
                  size="sm"
                  checked={cfg.enabled}
                  onChange={(enabled) => setGrid(axis, { enabled })}
                />
                <span className="w-4 text-cladd-sm text-cladd-fg-soft">{label}</span>
                <PreciseNumberInput
                  className="flex-1"
                  min={0.05}
                  value={cfg.spacing}
                  onCommit={(spacing) => setGrid(axis, { spacing })}
                />
                <span className="text-xs text-cladd-fg-softer">m</span>
              </div>
            )
          })}
        </div>

        <SectionTitle className="mt-4">Lighting</SectionTitle>
        <div className="mt-2 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-cladd-sm text-cladd-fg-soft">Environment</span>
            <Select
              size="sm"
              className="flex-1"
              value={lighting.environment}
              options={ENVIRONMENT_PRESETS.map((p) => p.id)}
              renderOption={({ value }) => ENV_LABELS[value]}
              onChange={(v) => setLighting({ environment: v as EnvironmentPreset })}
            >
              {ENV_LABELS[lighting.environment]}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-cladd-sm text-cladd-fg-soft">Tone map</span>
            <Select
              size="sm"
              className="flex-1"
              value={lighting.toneMapping}
              options={TONE_MAPPING_MODES.map((m) => m.id)}
              renderOption={({ value }) => TONE_LABELS[value]}
              onChange={(v) => setLighting({ toneMapping: v as ToneMappingMode })}
            >
              {TONE_LABELS[lighting.toneMapping]}
            </Select>
          </div>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-cladd-sm text-cladd-fg-soft">
              <span>Exposure</span>
              <span className="text-cladd-fg-softer">{lighting.exposure.toFixed(2)}</span>
            </span>
            <Slider
              min={0.1}
              max={3}
              step={0.05}
              value={lighting.exposure}
              onChange={(exposure) => setLighting({ exposure })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-cladd-sm text-cladd-fg-soft">
              <span>Reflections</span>
              <span className="text-cladd-fg-softer">{lighting.environmentIntensity.toFixed(2)}</span>
            </span>
            <Slider
              min={0}
              max={3}
              step={0.05}
              value={lighting.environmentIntensity}
              onChange={(environmentIntensity) => setLighting({ environmentIntensity })}
            />
          </label>

          <div className="flex items-center gap-2">
            <Checkbox
              size="sm"
              disabled={!envHasSky}
              checked={envHasSky && lighting.showEnvironmentBackground}
              onChange={(showEnvironmentBackground) => setLighting({ showEnvironmentBackground })}
            />
            <span className="text-cladd-sm text-cladd-fg-soft">Show sky background</span>
          </div>

          {envHasSky && lighting.showEnvironmentBackground && (
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-cladd-sm text-cladd-fg-soft">
                <span>Sky blur</span>
                <span className="text-cladd-fg-softer">{lighting.backgroundBlur.toFixed(2)}</span>
              </span>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={lighting.backgroundBlur}
                onChange={(backgroundBlur) => setLighting({ backgroundBlur })}
              />
            </label>
          )}
        </div>
      </Popover>
    </PopoverRoot>
  )
}
