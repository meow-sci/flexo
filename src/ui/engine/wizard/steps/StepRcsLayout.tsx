import {
  Button,
  Checkbox,
  DisclosureSection,
  GridList,
  GridListItem,
  ToggleButton,
  ToggleButtonGroup,
  cn,
  warningBox,
} from '../../../kit';
import type { Vec3 } from '../../../../ksa/types';
import { UNIT_EPSILON } from '../../../../ksa/engineValidation';
import { rcsLayout, type RcsNozzleSpec } from '../wizardGeometry';
import { StepSection, WizardNumberField } from '../wizardFields';
import { RCS_CONTROL_FLAGS, WIZARD_BOUNDS } from '../wizardPresets';
import type { RcsWizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **RCS step — Layout** (`plans/ENGINE_WIZARD_PLAN.md` §7.10): where the block's thrusters
 * sit and which way each one fires, plus the optional manual control map.
 *
 * Two rules drive the whole screen:
 *
 * - **A preset is a starting point, not a mode.** Picking Single/Quad/Six regenerates the
 *   table from {@link rcsLayout}; editing any cell afterwards flips the preset to `custom`
 *   and keeps the edit. Nothing ever silently re-derives a row the user typed.
 * - **A direction must be unit length.** KSA applies thrust as
 *   `TotalThrust * ExhaustDirection` WITHOUT normalizing, so `(0, 2, 0)` is a silent 2×
 *   thrust multiplier. Each row warns and offers a one-click Normalize; the value is never
 *   rewritten behind the user's back.
 */

/** The half-extent the preset layouts are generated at (§7.10's template-geometry scale). */
function layoutScale(state: RcsWizardState): number {
  return state.geometry.kind === 'generate' ? state.gen.blockSizeM / 2 : 0.15;
}

const lengthOf = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

/** A fresh row for "Add nozzle": at the block centre, firing along KSA's default −X axis. */
const NEW_NOZZLE: RcsNozzleSpec = {
  location: { x: 0, y: 0, z: 0 },
  direction: { x: -1, y: 0, z: 0 },
};

export function StepRcsLayout({ state, patch }: WizardStepProps<RcsWizardState>) {
  const layout = state.layout;
  const nozzles = layout.nozzles;
  const maxNozzles = WIZARD_BOUNDS.rcsNozzleCount.max;

  /** Any per-row edit is a custom layout from then on — the preset can no longer describe it. */
  const writeNozzles = (next: RcsNozzleSpec[]) =>
    patch({ layout: { preset: 'custom', nozzles: next } });

  const editNozzle = (index: number, spec: RcsNozzleSpec) =>
    writeNozzles(nozzles.map((n, i) => (i === index ? spec : n)));

  const setPreset = (key: string) => {
    if (key === 'custom') {
      patch({ layout: { preset: 'custom', nozzles: [...nozzles] } });
      return;
    }
    if (key !== 'single' && key !== 'quad' && key !== 'six') return;
    patch({ layout: { preset: key, nozzles: rcsLayout(key, layoutScale(state)) } });
  };

  const flags = state.controlMapFlags;
  const toggleFlag = (flag: string, on: boolean) => {
    const current = new Set(flags ?? []);
    if (on) current.add(flag);
    else current.delete(flag);
    // Rebuilt in the canonical order, so the exported `[Flags]` body reads like KSA's own.
    patch({ controlMapFlags: RCS_CONTROL_FLAGS.filter((f) => current.has(f)) });
  };

  return (
    <div className="flex flex-col gap-4">
      <StepSection
        title="Layout"
        description="A preset lays the thrusters out on the block's faces. Editing any number below switches to Custom and keeps what you typed."
      >
        <ToggleButtonGroup
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[layout.preset]}
          onSelectionChange={(keys) => {
            const k = [...keys][0];
            if (k != null) setPreset(String(k));
          }}
        >
          <ToggleButton id="single" size="sm">
            Single
          </ToggleButton>
          <ToggleButton id="quad" size="sm">
            Quad
          </ToggleButton>
          <ToggleButton id="six" size="sm">
            Six
          </ToggleButton>
          <ToggleButton id="custom" size="sm">
            Custom
          </ToggleButton>
        </ToggleButtonGroup>
      </StepSection>

      <StepSection title={`Nozzles (${nozzles.length})`}>
        <GridList aria-label="RCS nozzles" selectionMode="none" className="gap-2 p-0">
          {nozzles.map((spec, index) => (
            <NozzleRow
              key={index}
              index={index}
              spec={spec}
              canRemove={nozzles.length > 1}
              onChange={(next) => editNozzle(index, next)}
              onRemove={() => writeNozzles(nozzles.filter((_, i) => i !== index))}
            />
          ))}
        </GridList>
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          isDisabled={nozzles.length >= maxNozzles}
          onPress={() => writeNozzles([...nozzles, { ...NEW_NOZZLE }])}
        >
          ＋ Add nozzle
        </Button>
        {nozzles.length >= maxNozzles && (
          <p className="text-xs leading-snug text-fg-subtle">
            A block carries at most {maxNozzles} nozzles.
          </p>
        )}
      </StepSection>

      <DisclosureSection title="Advanced">
        <StepSection
          title="Control map"
          description="Which pilot inputs fire these thrusters. KSA derives the map from where each nozzle points, which is right for every symmetric block."
        >
          <ToggleButtonGroup
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[flags === null ? 'auto' : 'manual']}
            onSelectionChange={(keys) => {
              const k = [...keys][0];
              if (k === 'auto') patch({ controlMapFlags: null });
              // A manual map starts as full authority: an empty one would mean a block that
              // answers no input at all, which is never what "switch to manual" asks for.
              else if (k === 'manual') patch({ controlMapFlags: [...RCS_CONTROL_FLAGS] });
            }}
          >
            <ToggleButton id="auto" size="sm">
              Automatic (derived from geometry)
            </ToggleButton>
            <ToggleButton id="manual" size="sm">
              Manual
            </ToggleButton>
          </ToggleButtonGroup>

          {flags !== null && (
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {RCS_CONTROL_FLAGS.map((flag) => (
                <Checkbox
                  key={flag}
                  isSelected={flags.includes(flag)}
                  onChange={(on) => toggleFlag(flag, on)}
                >
                  {flag}
                </Checkbox>
              ))}
            </div>
          )}
        </StepSection>
      </DisclosureSection>
    </div>
  );
}

/** One editable nozzle: its location, its firing direction, and the two row actions. */
function NozzleRow({
  index,
  spec,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  spec: RcsNozzleSpec;
  canRemove: boolean;
  onChange: (next: RcsNozzleSpec) => void;
  onRemove: () => void;
}) {
  const length = lengthOf(spec.direction);
  const isUnit = Number.isFinite(length) && Math.abs(length - 1) <= UNIT_EPSILON;

  const setLocation = (axis: keyof Vec3, v: number) =>
    onChange({ ...spec, location: { ...spec.location, [axis]: v } });
  const setDirection = (axis: keyof Vec3, v: number) =>
    onChange({ ...spec, direction: { ...spec.direction, [axis]: v } });

  const normalize = () => {
    // A zero vector has no direction to keep — there is nothing to scale, so the button does
    // nothing rather than inventing an axis.
    if (!(length > 0)) return;
    onChange({
      ...spec,
      direction: {
        x: spec.direction.x / length,
        y: spec.direction.y / length,
        z: spec.direction.z / length,
      },
    });
  };

  return (
    <GridListItem
      id={index}
      textValue={`Nozzle ${index + 1}`}
      className="flex-col items-stretch gap-2 rounded-md border border-border bg-panel-sunken p-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg-muted">Nozzle {index + 1}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" isDisabled={!(length > 0)} onPress={normalize}>
            Normalize
          </Button>
          <Button size="sm" variant="ghost" isDisabled={!canRemove} onPress={onRemove}>
            Remove
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <WizardNumberField
          label="Location X"
          suffix="m"
          value={spec.location.x}
          onChange={(v) => setLocation('x', v)}
          step={0.05}
        />
        <WizardNumberField
          label="Location Y"
          suffix="m"
          value={spec.location.y}
          onChange={(v) => setLocation('y', v)}
          step={0.05}
        />
        <WizardNumberField
          label="Location Z"
          suffix="m"
          value={spec.location.z}
          onChange={(v) => setLocation('z', v)}
          step={0.05}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <WizardNumberField
          label="Direction X"
          value={spec.direction.x}
          onChange={(v) => setDirection('x', v)}
          step={0.1}
        />
        <WizardNumberField
          label="Direction Y"
          value={spec.direction.y}
          onChange={(v) => setDirection('y', v)}
          step={0.1}
        />
        <WizardNumberField
          label="Direction Z"
          value={spec.direction.z}
          onChange={(v) => setDirection('z', v)}
          step={0.1}
        />
      </div>

      {!isUnit && (
        <div className={cn(warningBox, 'text-xs')}>
          {length > 0
            ? `Length ${length.toFixed(3)}, not 1 — KSA multiplies this nozzle's thrust by it.`
            : 'Zero length — this nozzle applies no thrust and has no plume axis.'}
        </div>
      )}
    </GridListItem>
  );
}
