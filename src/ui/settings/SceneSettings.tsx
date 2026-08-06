import { useStore } from '@nanostores/react';
import { ListBoxItem, SectionTitle, Select, Slider, Switch } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import {
  $lightSettings,
  $simulateGlass,
  DEFAULT_LIGHT_SETTINGS,
  setLightSettings,
  setSimulateGlass,
  type LightVizSettings,
} from '../../state/settingsStore';
import {
  $lighting,
  ENVIRONMENT_PRESETS,
  setLighting,
  TONE_MAPPING_MODES,
  type ToneMappingMode,
} from '../../state/lightingStore';
import type { EnvironmentPreset } from '../../state/environmentPresets';

/**
 * **Settings ▸ Scene** (design: foundation §10.7).
 *
 * The look-dev tab: environment, tone mapping, exposure, reflections, sky blur, the light
 * coverage exposure mode, and the in-game glass simulation. Every slider LIVE-COMMITS to its
 * store — that is what makes the tab usable at all, and the dialog frame anchors itself off to
 * the right while this tab is active so the model stays visible behind it (the v1 live View
 * popover's one real advantage, kept).
 *
 * The View menu's Environment / Show Sky rows write these SAME stores: this tab is a mirror,
 * never a second source of truth. Same for `$simulateGlass`, which Surface mode also toggles.
 */
export function SceneSettings() {
  const lighting = useStore($lighting);
  const lightViz = { ...DEFAULT_LIGHT_SETTINGS, ...useStore($lightSettings) };
  const simulateGlass = useStore($simulateGlass);
  const envHasSky = ENVIRONMENT_PRESETS.find((p) => p.id === lighting.environment)?.file != null;

  return (
    <>
      <SectionTitle>Environment</SectionTitle>
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-sm text-fg-muted">Preset</span>
        <Select
          size="sm"
          className="flex-1"
          aria-label="Environment preset"
          selectedKey={lighting.environment}
          items={ENVIRONMENT_PRESETS}
          onSelectionChange={(key) => setLighting({ environment: key as EnvironmentPreset })}
        >
          {(preset) => (
            <ListBoxItem id={preset.id} textValue={preset.label}>
              {preset.label}
            </ListBoxItem>
          )}
        </Select>
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Show sky background</span>
        <Switch
          aria-label="Show sky background"
          isSelected={lighting.showEnvironmentBackground}
          onChange={(showEnvironmentBackground) => setLighting({ showEnvironmentBackground })}
        />
      </label>

      <SectionTitle>Tone mapping</SectionTitle>
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

      <SliderField
        label="Exposure"
        value={lighting.exposure}
        min={0.1}
        max={3}
        step={0.05}
        onChange={(exposure) => setLighting({ exposure })}
      />
      <SliderField
        label="Reflections"
        value={lighting.environmentIntensity}
        min={0}
        max={3}
        step={0.05}
        onChange={(environmentIntensity) => setLighting({ environmentIntensity })}
      />
      {envHasSky && lighting.showEnvironmentBackground && (
        <SliderField
          label="Sky blur"
          value={lighting.backgroundBlur}
          min={0}
          max={1}
          step={0.01}
          onChange={(backgroundBlur) => setLighting({ backgroundBlur })}
        />
      )}

      <SectionTitle>Light coverage</SectionTitle>
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
        <b>Auto</b> scales each light to its own brightness (best for editing one). <b>Absolute</b>{' '}
        shades every light against the same reference, so a dim light looks dim.
      </p>

      <SectionTitle>Materials preview</SectionTitle>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Simulate in-game glass</span>
        <Switch
          aria-label="Simulate in-game glass"
          isSelected={simulateGlass}
          onChange={setSimulateGlass}
        />
      </label>
      <span className="text-xs text-fg-subtle">
        Kitten visor preview — on, tinted glass renders the muted way KSA's glass shader does; off,
        the tint shows vividly (best for picking a colour). Surface mode toggles the same setting.
      </span>
    </>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-sm text-fg-muted">
        <span>{label}</span>
        <span className="text-fg-subtle tabular-nums">{value.toFixed(2)}</span>
      </span>
      <Slider
        aria-label={label}
        minValue={min}
        maxValue={max}
        step={step}
        value={value}
        onChange={(next) => onChange(next as number)}
      />
    </label>
  );
}
