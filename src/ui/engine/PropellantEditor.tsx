import { useStore } from '@nanostores/react';
import { Button, Field, ListBoxItem, Select, TextField } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { PropellantLutGrid } from './PropellantLutGrid';
import { PA_PER_BAR } from './editorKit';
import { $part, pushUndo, updateCustomReaction } from '../../state/editorStore';
import {
  isCustomReactionExportable,
  type CustomReaction,
  type ReactionCategory,
  type ReactionReactantSpec,
} from '../../ksa/types';

/**
 * **The custom-propellant editor** (design: design-data-engine-modes.md §B4.10, decision D8) —
 * one user-authored `<FixedReaction>`.
 *
 * Custom propellants are **project document data**, not library assets: they live on
 * `$part.customReactions`, they are undoable, and they export as top-level `<FixedReaction>`
 * elements — which is why Engine mode is their sole home (D8) and the Asset Manager stays
 * textures/materials/meshes. They merge into `$allReactions` instantly, so a propellant
 * authored here is selectable in every combustor and drives the live readout immediately.
 *
 * The solid case is the sharp edge: `FixedReactionTemplate.Create` **throws** without all four
 * burn-rate/pressure fields, so flexo's serializer omits an incomplete solid reaction rather
 * than shipping a mod that refuses to load — the banner says exactly that, in danger styling,
 * because a silent omission is the failure mode users cannot debug.
 *
 * **Undo enrollment**: every field streams (one push per typing session); reactant add/remove
 * are discrete pushes, as are the LUT row mutations inside {@link PropellantLutGrid}.
 */

const REACTION_CATEGORIES: readonly ReactionCategory[] = [
  'Bipropellant',
  'Hypergolic',
  'Monopropellant',
  'Solid',
  'Thermal',
];

export function PropellantEditor({ index }: { index: number }) {
  const part = useStore($part);
  const process = part.customReactions[index];
  if (!process) return null;

  const id = process.id;
  const begin = () => pushUndo('edit propellant', id);
  const setReactants = (reactants: ReactionReactantSpec[]) =>
    updateCustomReaction(id, { reactants });

  return (
    <div className="flex flex-col gap-2">
      <Field label="Name">
        <TextField
          size="sm"
          aria-label="Propellant name"
          value={process.name}
          onFocus={begin}
          onChange={(name) => updateCustomReaction(id, { name })}
        />
      </Field>
      <Field label="Id (referenced by combustors and the export)">
        <TextField
          size="sm"
          aria-label="Propellant id"
          inputClassName="font-mono"
          value={id}
          isReadOnly
        />
      </Field>
      <Field label="Category">
        <Select
          size="sm"
          aria-label="Reaction category"
          value={process.category}
          onChange={(k) => {
            begin();
            updateCustomReaction(id, { category: k as ReactionCategory });
          }}
        >
          {REACTION_CATEGORIES.map((c) => (
            <ListBoxItem key={c} id={c} textValue={c}>
              {c}
            </ListBoxItem>
          ))}
        </Select>
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-fg-subtle">Reactants (mixture by mass share)</span>
        {process.reactants.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label="Substance phase id">
                <TextField
                  size="sm"
                  aria-label={`Reactant ${i + 1} phase id`}
                  inputClassName="font-mono"
                  value={r.phaseId}
                  onFocus={begin}
                  onChange={(phaseId) =>
                    setReactants(process.reactants.map((x, j) => (j === i ? { ...x, phaseId } : x)))
                  }
                />
              </Field>
            </div>
            <div className="w-24 shrink-0">
              <Field label="Mass share">
                <PreciseNumberInput
                  aria-label={`Reactant ${i + 1} mass share`}
                  value={r.massShare}
                  min={0}
                  step={0.1}
                  onInteractionStart={begin}
                  onCommit={(massShare) =>
                    setReactants(
                      process.reactants.map((x, j) => (j === i ? { ...x, massShare } : x)),
                    )
                  }
                />
              </Field>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              aria-label={`Remove reactant ${i + 1}`}
              onPress={() => {
                pushUndo('remove reactant', id);
                setReactants(process.reactants.filter((_, j) => j !== i));
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onPress={() => {
            pushUndo('add reactant', id);
            setReactants([...process.reactants, { phaseId: '', massShare: 1 }]);
          }}
        >
          + Reactant
        </Button>
      </div>

      {process.category === 'Solid' && <SolidPropellantFields process={process} />}
      <PropellantLutGrid process={process} />
    </div>
  );
}

/**
 * The four fields KSA REQUIRES on a `Category="Solid"` FixedReaction. Without all four,
 * `FixedReactionTemplate.Create()` throws and the whole mod fails to load, so flexo's export
 * omits an incomplete one — hence the hard danger banner rather than a soft warning. Cloning
 * APCP or DoubleBase fills them in.
 */
function SolidPropellantFields({ process }: { process: CustomReaction }) {
  const id = process.id;
  const begin = () => pushUndo('edit propellant', id);
  const br = process.burnRate;
  const setBurnRate = (patch: Partial<NonNullable<CustomReaction['burnRate']>>) =>
    updateCustomReaction(id, {
      burnRate: { coefficientMPerS: 0, exponent: 0, ...br, ...patch },
    });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-fg-subtle">
        Solid propellant (required — burn-rate law r = a·pⁿ)
      </span>
      <Field label="Burn-rate coefficient a (m/s at 1 Pa — must be > 0)">
        <PreciseNumberInput
          aria-label="Burn rate coefficient in meters per second"
          value={br?.coefficientMPerS ?? 0}
          min={0}
          step={0.001}
          onInteractionStart={begin}
          onCommit={(n) => setBurnRate({ coefficientMPerS: n })}
        />
      </Field>
      <Field label="Burn-rate exponent n (0 ≤ n < 0.95)">
        <PreciseNumberInput
          aria-label="Burn rate exponent"
          value={br?.exponent ?? 0}
          min={0}
          max={0.95}
          step={0.01}
          onInteractionStart={begin}
          onCommit={(n) => setBurnRate({ exponent: n })}
        />
      </Field>
      <Field label="Minimum burn pressure (bar — the deflagration limit)">
        <PreciseNumberInput
          aria-label="Minimum burn pressure in bar"
          value={(process.minimumBurnPressurePa ?? 0) / PA_PER_BAR}
          min={0}
          onInteractionStart={begin}
          onCommit={(bar) =>
            updateCustomReaction(id, { minimumBurnPressurePa: bar > 0 ? bar * PA_PER_BAR : null })
          }
        />
      </Field>
      <Field label="Max stable pressure (bar — the slope-break limit)">
        <PreciseNumberInput
          aria-label="Max stable pressure in bar"
          value={(process.maxStablePressurePa ?? 0) / PA_PER_BAR}
          min={0}
          onInteractionStart={begin}
          onCommit={(bar) =>
            updateCustomReaction(id, { maxStablePressurePa: bar > 0 ? bar * PA_PER_BAR : null })
          }
        />
      </Field>
      <Field label="Exhaust condensed fraction (0 to < 1)">
        <PreciseNumberInput
          aria-label="Exhaust condensed fraction"
          value={process.exhaustCondensedFraction ?? 0}
          min={0}
          max={0.999999}
          step={0.01}
          onInteractionStart={begin}
          onCommit={(n) => updateCustomReaction(id, { exhaustCondensedFraction: n })}
        />
      </Field>
      {!isCustomReactionExportable(process) && (
        <p className="text-[11px] leading-snug text-danger">
          KSA refuses to load a solid reaction without a burn-rate law and pressure limits — this
          propellant will be omitted from the export.
        </p>
      )}
    </div>
  );
}
