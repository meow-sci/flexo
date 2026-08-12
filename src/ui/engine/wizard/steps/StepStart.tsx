import {
  ListBoxItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  noteBox,
} from '../../../kit';
import { isDefaultPartId } from '../../../../ksa/types';
import type { EditingPart } from '../../../../ksa/types';
import { defineTargetsOf } from '../../defineEngineModel';
import { StepSection, WizardNumberField, WizardRow } from '../wizardFields';
import { GEN_FIELDS, type WizardState } from '../wizardModel';
import { WIZARD_BOUNDS } from '../wizardPresets';
import type { WizardStepProps } from './stepProps';

/**
 * **Step 1 — Start** (`plans/ENGINE_WIZARD_PLAN.md` §7.1): who the part is, and where the
 * engine's hardware is going to live.
 *
 * Family-agnostic: the generated-geometry dimensions come from {@link GEN_FIELDS} rather than
 * a per-family branch, so the SRB and RCS wizards render their own `gen` groups here without
 * this file learning about them.
 */

/**
 * Templates that already carry engine hardware — `$engineEntries`' SubPart rule
 * (`src/state/engineStore.ts`), recomputed from the passed-in part. A step component never
 * subscribes to a store: everything it renders must be derivable from its props, so the
 * Review preview and the live dialog can never disagree about what is offered.
 */
function engineTemplateIdsOf(part: EditingPart): Set<string> {
  return new Set(
    part.subPartGameData
      .filter(
        (s) =>
          s.combustors.length > 0 ||
          s.solidMotors.length > 0 ||
          s.nozzles.length > 0 ||
          s.solidNozzles.length > 0,
      )
      .map((s) => s.subPartTemplateId),
  );
}

/** What "Generate primitive geometry" will actually build, in the live dimensions. */
function generatedSummary(state: WizardState): string {
  if (state.family === 'liquid') {
    return `Bell ${state.gen.bellWidthM} m box + body ${state.gen.bodyLengthM} m box + forward attach node`;
  }
  if (state.family === 'srb') {
    return `Nozzle block ${state.gen.nozzleBlockM} m box + casing ${state.gen.casingLengthM} m box + forward attach node`;
  }
  return `Thruster block ${state.gen.blockSizeM} m box + forward attach node`;
}

export function StepStart({ state, patch, part }: WizardStepProps<WizardState>) {
  const keepsPartId = !isDefaultPartId(part.partId);
  const targets = defineTargetsOf(part, engineTemplateIdsOf(part));
  const noTemplates = targets.length === 0;
  const templateReason =
    part.placements.length === 0
      ? 'no mesh templates yet'
      : 'every mesh template already carries engine hardware';
  const geometryKey = state.geometry.kind;
  const selectedTemplateId =
    state.geometry.kind === 'template' ? state.geometry.templateId : (targets[0]?.templateId ?? '');
  // Indexed generically so one loop renders any family's dimensions; every `gen` value is a
  // metre-valued number, which is what makes the erasure safe.
  const genValues = state.gen as unknown as Record<string, number>;

  return (
    <div className="flex flex-col gap-4">
      <StepSection title="Identity">
        {keepsPartId ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-fg-subtle">Part id</span>
            <span className="font-mono text-xs text-fg">
              {part.partId} <span className="text-fg-subtle">(kept)</span>
            </span>
          </div>
        ) : (
          <TextField
            label="Part id"
            size="sm"
            inputClassName="font-mono"
            value={state.identity.partId}
            onChange={(v) => patch({ identity: { ...state.identity, partId: v } })}
          />
        )}
        <TextField
          label="Display name"
          size="sm"
          value={state.identity.displayName}
          onChange={(v) => patch({ identity: { ...state.identity, displayName: v } })}
        />
        <div className={noteBox}>Applied to the current part. Leave blank to keep as-is.</div>
      </StepSection>

      <StepSection title="Geometry">
        <ToggleButtonGroup
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[geometryKey]}
          onSelectionChange={(keys) => {
            const k = [...keys][0];
            if (k === 'generate') patch({ geometry: { kind: 'generate' } });
            else if (k === 'template') {
              patch({ geometry: { kind: 'template', templateId: selectedTemplateId } });
            } else if (k === 'part') patch({ geometry: { kind: 'part' } });
          }}
        >
          <ToggleButton id="generate" size="sm">
            Generate primitive geometry
          </ToggleButton>
          <ToggleButton id="template" size="sm" isDisabled={noTemplates}>
            Use existing mesh
          </ToggleButton>
          {state.family === 'rcs' && (
            <ToggleButton id="part" size="sm">
              Part-level (no geometry)
            </ToggleButton>
          )}
        </ToggleButtonGroup>

        {noTemplates && (
          <p className="text-xs leading-snug text-fg-subtle">
            &ldquo;Use existing mesh&rdquo; is unavailable — {templateReason}.
          </p>
        )}

        {state.geometry.kind === 'generate' && (
          <>
            <WizardRow>
              {GEN_FIELDS[state.family].map((field) => (
                <WizardNumberField
                  key={field.key}
                  label={field.label}
                  suffix={field.suffix}
                  min={WIZARD_BOUNDS.genDimM.min}
                  max={WIZARD_BOUNDS.genDimM.max}
                  step={0.1}
                  value={genValues[field.key]}
                  onChange={(v) =>
                    patch({
                      gen: { ...genValues, [field.key]: v },
                    } as unknown as Partial<WizardState>)
                  }
                />
              ))}
            </WizardRow>
            <p className="text-xs leading-snug text-fg-subtle">{generatedSummary(state)}</p>
          </>
        )}

        {state.geometry.kind === 'template' && (
          <Select
            size="sm"
            label="Mesh template"
            selectedKey={selectedTemplateId || null}
            onSelectionChange={(k) =>
              patch({ geometry: { kind: 'template', templateId: String(k) } })
            }
          >
            {targets.map((target) => (
              <ListBoxItem
                key={target.templateId}
                id={target.templateId}
                textValue={target.templateId}
              >
                {target.templateId} · {target.instanceIds.length}{' '}
                {target.instanceIds.length === 1 ? 'placement' : 'placements'}
              </ListBoxItem>
            ))}
          </Select>
        )}

        {state.geometry.kind === 'part' && (
          <div className={noteBox}>
            The thrusters hang off <code>&lt;PartGameData&gt;</code> itself — no SubPart is created,
            so there is nothing to gimbal and nothing to place a collider around.
          </div>
        )}
      </StepSection>
    </div>
  );
}
