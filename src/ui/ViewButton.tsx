import { useStore } from '@nanostores/react';
import {
  DialogTrigger,
  Popover,
  PopoverDialog,
  Modal,
  Dialog,
  DialogHeader,
  ToolbarButton,
  Button,
  Switch,
  Select,
  ListBoxItem,
  Slider,
  SectionTitle,
} from './kit';
import {
  $grids,
  $hideInterior,
  setGrid,
  setHideInterior,
  snapCamera,
  type Axis,
  type CameraDir,
} from '../state/viewStore';
import {
  $lighting,
  setLighting,
  ENVIRONMENT_PRESETS,
  TONE_MAPPING_MODES,
  type EnvironmentPreset,
  type ToneMappingMode,
} from '../state/lightingStore';
import {
  $lightPreviewCount,
  $lightSettings,
  DEFAULT_LIGHT_SETTINGS,
  setLightSettings,
  type LightVizSettings,
} from '../state/settingsStore';
import { MAX_PREVIEW_LIGHTS } from '../three/lightVolume';
import { PreciseNumberInput } from './PreciseNumberInput';

const SNAP_ROWS: [CameraDir, CameraDir][] = [
  ['left', 'right'],
  ['front', 'back'],
  ['top', 'bottom'],
];

const GRID_AXES: { axis: Axis; label: string }[] = [
  { axis: 'x', label: 'X' },
  { axis: 'y', label: 'Y' },
  { axis: 'z', label: 'Z' },
];

function ViewContent() {
  const grids = useStore($grids);
  const hideInterior = useStore($hideInterior);
  const lighting = useStore($lighting);
  // Resolved read: a settings object persisted before these fields existed must show
  // its defaults in the menu, not blank selects (see lightSettings()'s JSDoc).
  const lightViz = { ...DEFAULT_LIGHT_SETTINGS, ...useStore($lightSettings) };
  // Published by EditorScene each time the preview pass runs — ephemeral, so it always
  // describes the document on screen right now.
  const preview = useStore($lightPreviewCount);
  const envHasSky = ENVIRONMENT_PRESETS.find((p) => p.id === lighting.environment)?.file != null;

  return (
    <>
      <section className="flex flex-col gap-2">
        <SectionTitle>Camera Snap</SectionTitle>
        {SNAP_ROWS.map(([a, b]) => (
          <div key={a} className="flex gap-1.5">
            <Button size="sm" className="flex-1 capitalize" onPress={() => snapCamera(a)}>
              {a}
            </Button>
            <Button size="sm" className="flex-1 capitalize" onPress={() => snapCamera(b)}>
              {b}
            </Button>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Grids</SectionTitle>
        {GRID_AXES.map(({ axis, label }) => {
          const cfg = grids[axis];
          return (
            <div key={axis} className="flex items-center gap-2">
              <Switch
                aria-label={`Show ${label} grid`}
                isSelected={cfg.enabled}
                onChange={(enabled) => setGrid(axis, { enabled })}
              >
                <span className="w-4 text-sm text-fg-muted">{label}</span>
              </Switch>
              <PreciseNumberInput
                aria-label={`${label} grid spacing (m)`}
                className="flex-1"
                min={0.05}
                value={cfg.spacing}
                onCommit={(spacing) => setGrid(axis, { spacing })}
              />
              <span className="text-xs text-fg-subtle">m</span>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Visibility</SectionTitle>
        <Switch isSelected={hideInterior} onChange={setHideInterior}>
          Hide interior
        </Switch>
        <p className="text-xs leading-snug text-fg-subtle">
          Hides every mesh marked <b>Interior (IVA only)</b>, showing the part the way the game does
          outside IVA.
        </p>

        <div className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-sm text-fg-muted">Light coverage</span>
          <Select
            size="sm"
            className="flex-1"
            aria-label="Light coverage"
            value={lightViz.showVolumes}
            onChange={(k) =>
              setLightSettings({ showVolumes: k as LightVizSettings['showVolumes'] })
            }
          >
            <ListBoxItem id="selected">Selected</ListBoxItem>
            <ListBoxItem id="all">All</ListBoxItem>
            <ListBoxItem id="off">Off</ListBoxItem>
          </Select>
        </div>
        <p className="text-xs leading-snug text-fg-subtle">
          Draws each light's reach — the graded falloff volume plus its hard range boundary — using
          the game's own attenuation.
        </p>

        <div className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-sm text-fg-muted">Exposure</span>
          <Select
            size="sm"
            className="flex-1"
            aria-label="Light coverage exposure"
            value={lightViz.exposureMode}
            onChange={(k) =>
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

        <Switch
          isSelected={lightViz.livePreview}
          onChange={(livePreview) => setLightSettings({ livePreview })}
        >
          Preview lighting
        </Switch>
        <p className="text-xs leading-snug text-fg-subtle">
          Actually lights the part with each light's color, range and cone —{' '}
          <b>indicative, not exact</b> (the coverage volume is the precise read).
        </p>
        {lightViz.livePreview && preview.total > preview.enabled && (
          <p className="text-xs leading-snug text-warning">
            Previewing {preview.enabled} of {preview.total} light instances ({MAX_PREVIEW_LIGHTS}{' '}
            max) — the rest draw markers only.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle>Lighting</SectionTitle>
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-sm text-fg-muted">Environment</span>
          <Select
            size="sm"
            className="flex-1"
            aria-label="Environment"
            value={lighting.environment}
            items={ENVIRONMENT_PRESETS}
            onChange={(k) => setLighting({ environment: k as EnvironmentPreset })}
          >
            {(p) => (
              <ListBoxItem id={p.id} textValue={p.label}>
                {p.label}
              </ListBoxItem>
            )}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-sm text-fg-muted">Tone map</span>
          <Select
            size="sm"
            className="flex-1"
            aria-label="Tone mapping"
            value={lighting.toneMapping}
            items={TONE_MAPPING_MODES}
            onChange={(k) => setLighting({ toneMapping: k as ToneMappingMode })}
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

        <Switch
          isDisabled={!envHasSky}
          isSelected={envHasSky && lighting.showEnvironmentBackground}
          onChange={(showEnvironmentBackground) => setLighting({ showEnvironmentBackground })}
        >
          Show sky background
        </Switch>

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
      </section>
    </>
  );
}

interface ViewButtonProps {
  isOpen?: boolean;
  onOpenChange?: (v: boolean) => void;
}

/**
 * "View" action: camera snap, reference grids, and lighting controls.
 * Desktop: opens as a positioned popover. Mobile menu: opens as a bottom sheet.
 */
export function ViewButton({ isOpen: externalOpen, onOpenChange }: ViewButtonProps = {}) {
  const isControlled = externalOpen !== undefined;

  if (isControlled) {
    return (
      <Modal isOpen={externalOpen!} onOpenChange={onOpenChange} isDismissable variant="sheet">
        <Dialog>
          <DialogHeader title="View" onClose={() => onOpenChange?.(false)} />
          <div className="flex flex-col gap-4 overflow-auto p-3">
            <ViewContent />
          </div>
        </Dialog>
      </Modal>
    );
  }

  return (
    <DialogTrigger>
      <ToolbarButton>View</ToolbarButton>
      <Popover placement="bottom" className="w-[min(24rem,calc(100vw-1.5rem))]">
        <PopoverDialog className="flex max-h-[80vh] flex-col gap-4 overflow-auto p-3">
          <ViewContent />
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  );
}
