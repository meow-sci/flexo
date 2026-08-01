import { useStore } from '@nanostores/react';
import {
  Dialog,
  DialogHeader,
  ListBoxItem,
  Modal,
  Select,
  Slider,
  Switch,
} from '../../../src/ui/kit';
import { ENVIRONMENT_PRESETS, type EnvironmentPreset } from '../../../src/state/environmentPresets';
import { TONE_MAPPING_MODES, type ToneMappingMode } from '../../../src/state/lightingStore';
import { $previewLighting, setPreviewLighting } from './settings';

/**
 * Everything about how the part is lit — the environment, whether its sky is
 * visible, and the numeric knobs — in a dismissable modal rather than inline in
 * the settings menu: a react-aria `Menu` owns pointer/keyboard for its items, so
 * a slider (or a Select) inside the collection is unsupported.
 *
 * Ranges/steps are copied verbatim from the main editor's `src/ui/ViewButton.tsx`
 * so both UIs agree on what each value means.
 */
export function LightingDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const lighting = useStore($previewLighting);
  // Pure render-body derivation (what React Compiler memoizes) — the studio
  // environment is procedural and has no sky to show or blur.
  const envHasSky = ENVIRONMENT_PRESETS.find((p) => p.id === lighting.environment)?.file != null;

  return (
    // An ABSOLUTE max height (not `max-h-full`): the kit Dialog inherits it via
    // `max-h-[inherit]`, which is what lets the body below actually scroll instead
    // of running off the bottom of a 200×200 iframe. `2rem` = the overlay's p-4.
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="max-h-[calc(100vh-2rem)]"
    >
      <Dialog>
        <DialogHeader title="Lighting" onClose={() => onOpenChange(false)} />
        <div className="flex flex-col gap-2.5 overflow-auto p-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-fg-muted">Environment</span>
            <Select
              size="sm"
              aria-label="Environment"
              value={lighting.environment}
              items={ENVIRONMENT_PRESETS}
              // Only the environment changes: whether its sky is VISIBLE is the
              // separate toggle below, which deliberately survives switching
              // presets (picking a different sky while showing one keeps showing it).
              onChange={(k) => setPreviewLighting({ environment: k as EnvironmentPreset })}
            >
              {(p) => (
                <ListBoxItem id={p.id} textValue={p.label}>
                  {p.label}
                </ListBoxItem>
              )}
            </Select>
          </label>

          {/* The environment always lights the part; this only controls whether it
              is also drawn behind it, exactly like the main editor's View menu.
              Disabled for the procedural studio, which has no sky to draw. */}
          <Switch
            className="text-xs"
            isSelected={lighting.showEnvironmentBackground}
            isDisabled={!envHasSky}
            onChange={(v) => setPreviewLighting({ showEnvironmentBackground: v })}
          >
            Show sky background
          </Switch>

          <label className="flex flex-col gap-1">
            <span className="text-fg-muted">Tone mapping</span>
            <Select
              size="sm"
              aria-label="Tone mapping"
              value={lighting.toneMapping}
              items={TONE_MAPPING_MODES}
              onChange={(k) => setPreviewLighting({ toneMapping: k as ToneMappingMode })}
            >
              {(m) => (
                <ListBoxItem id={m.id} textValue={m.label}>
                  {m.label}
                </ListBoxItem>
              )}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-fg-muted">
              <span>Exposure</span>
              <span className="text-fg-subtle">{lighting.exposure.toFixed(2)}</span>
            </span>
            <Slider
              aria-label="Exposure"
              minValue={0.1}
              maxValue={3}
              step={0.05}
              value={lighting.exposure}
              onChange={(v) => setPreviewLighting({ exposure: v as number })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-fg-muted">
              <span>Reflections</span>
              <span className="text-fg-subtle">{lighting.environmentIntensity.toFixed(2)}</span>
            </span>
            <Slider
              aria-label="Reflections"
              minValue={0}
              maxValue={3}
              step={0.05}
              value={lighting.environmentIntensity}
              onChange={(v) => setPreviewLighting({ environmentIntensity: v as number })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-fg-muted">
              <span>Sky blur</span>
              <span className="text-fg-subtle">{lighting.backgroundBlur.toFixed(2)}</span>
            </span>
            <Slider
              aria-label="Sky blur"
              isDisabled={!envHasSky || !lighting.showEnvironmentBackground}
              minValue={0}
              maxValue={1}
              step={0.01}
              value={lighting.backgroundBlur}
              onChange={(v) => setPreviewLighting({ backgroundBlur: v as number })}
            />
          </label>
        </div>
      </Dialog>
    </Modal>
  );
}
