import { DisclosureSection, ListBoxItem, Select, Switch } from '../../../kit';
import { VOLUMETRIC_EXHAUST_IDS } from '../../../../ksa/types';
import { NONE } from '../../editorKit';
import { StepSection, WizardOptionalNumberField } from '../wizardFields';
import type { WizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **Step 5 — Effects** (`plans/ENGINE_WIZARD_PLAN.md` §7.5): the plume, the exhaust light and
 * the engine sound. Nothing here changes what the engine does — it changes what it looks and
 * sounds like doing it.
 *
 * All three families walk this step, and their `fx` groups are three DIFFERENT shapes: liquid
 * carries an FX exit-diameter override, SRB carries the plume trail (its signature effect),
 * RCS carries the RCS sound instead of the engine sound. The three fields they share are
 * rendered by {@link FxCommon} from plain values, so each family branch below narrows
 * `state` once, writes its own group back whole, and no `fx` union is ever spread blind.
 */
export function StepFx({ state, patch }: WizardStepProps<WizardState>) {
  if (state.family === 'srb') {
    const fx = state.fx;
    return (
      <div className="flex flex-col gap-4">
        <FxCommon
          volumetricExhaustId={fx.volumetricExhaustId}
          exhaustLight={fx.exhaustLight}
          sound={fx.engineSound}
          soundLabel="Engine sound"
          onPlume={(id) => patch({ fx: { ...fx, volumetricExhaustId: id } })}
          onLight={(v) => patch({ fx: { ...fx, exhaustLight: v } })}
          onSound={(v) => patch({ fx: { ...fx, engineSound: v } })}
          plumeExtra={
            <Switch
              isSelected={fx.plumeTrail}
              onChange={(v) => patch({ fx: { ...fx, plumeTrail: v } })}
            >
              Plume trail (DefaultPlumeTrail)
            </Switch>
          }
        />
      </div>
    );
  }

  if (state.family === 'rcs') {
    const fx = state.fx;
    return (
      <div className="flex flex-col gap-4">
        <FxCommon
          volumetricExhaustId={fx.volumetricExhaustId}
          exhaustLight={fx.exhaustLight}
          sound={fx.rcsSound}
          soundLabel="RCS sound"
          onPlume={(id) => patch({ fx: { ...fx, volumetricExhaustId: id } })}
          onLight={(v) => patch({ fx: { ...fx, exhaustLight: v } })}
          onSound={(v) => patch({ fx: { ...fx, rcsSound: v } })}
        />
      </div>
    );
  }

  const fx = state.fx;
  return (
    <div className="flex flex-col gap-4">
      <FxCommon
        volumetricExhaustId={fx.volumetricExhaustId}
        exhaustLight={fx.exhaustLight}
        sound={fx.engineSound}
        soundLabel="Engine sound"
        onPlume={(id) => patch({ fx: { ...fx, volumetricExhaustId: id } })}
        onLight={(v) => patch({ fx: { ...fx, exhaustLight: v } })}
        onSound={(v) => patch({ fx: { ...fx, engineSound: v } })}
      />

      <DisclosureSection title="Advanced">
        <WizardOptionalNumberField
          label="FX exit diameter"
          suffix="m"
          placeholder="auto"
          value={fx.fxExitDiameterM}
          onChange={(v) => patch({ fx: { ...fx, fxExitDiameterM: v } })}
          min={0}
          step={0.1}
          description="Visual only — KSA sizes the plume from the exit diameter when blank."
        />
      </DisclosureSection>
    </div>
  );
}

/** The plume/light/sound controls every family shares, driven by plain values. */
function FxCommon({
  volumetricExhaustId,
  exhaustLight,
  sound,
  soundLabel,
  onPlume,
  onLight,
  onSound,
  plumeExtra,
}: {
  volumetricExhaustId: string | null;
  exhaustLight: boolean;
  sound: boolean;
  soundLabel: string;
  onPlume: (id: string | null) => void;
  onLight: (v: boolean) => void;
  onSound: (v: boolean) => void;
  /** Rendered under the plume Select — the SRB's trail switch, and nothing otherwise. */
  plumeExtra?: React.ReactNode;
}) {
  return (
    <>
      <StepSection title="Plume">
        <Select
          size="sm"
          label="Volumetric exhaust"
          selectedKey={volumetricExhaustId ?? NONE}
          onSelectionChange={(k) => {
            const key = String(k);
            onPlume(key === NONE ? null : key);
          }}
        >
          <ListBoxItem id={NONE} textValue="(none)">
            (none)
          </ListBoxItem>
          {VOLUMETRIC_EXHAUST_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
        {plumeExtra}
      </StepSection>

      <StepSection title="Light & sound">
        <Switch isSelected={exhaustLight} onChange={onLight}>
          Exhaust light
        </Switch>
        <Switch isSelected={sound} onChange={onSound}>
          {soundLabel}
        </Switch>
      </StepSection>
    </>
  );
}
