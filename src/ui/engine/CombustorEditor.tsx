import { useStore } from '@nanostores/react';
import { Field, ListBoxItem, Select, Slider } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { FeedsField } from '../FeedsField';
import { ReactionPicker } from './ReactionPicker';
import { PA_PER_BAR, clamp01, clampThrottle, ownerOf } from './editorKit';
import { FlashField } from './FlashField';
import { $part, pushUndo } from '../../state/editorStore';
import {
  setCombustorFeeds,
  setCombustorPlumbing,
  setCombustorReaction,
  setPartCombustorFeeds,
  setPartCombustorPlumbing,
  setPartCombustorReaction,
  updateCombustor,
  updatePartCombustor,
} from '../../state/editorStore';
import { feedTargetsOf } from '../../state/feedTargets';
import { flashModuleField } from '../../state/engineStore';
import { $allReactionIndex } from '../../state/reactionStore';
import { mixtureRatioBounds } from '../../ksa/reactionCatalog';
import { KNOWN_REACTIONS, type Combustor, type PlumbingClass } from '../../ksa/types';

/**
 * **The combustor editor** (design: design-data-engine-modes.md §B4.2) — one `<Combustor>`,
 * at either scope.
 *
 * `templateId` picks the action family: a SubPart template id edits that template's
 * `<SubPartGameData>` (shared by every placement of the mesh), `null` edits `<PartGameData>`
 * (the stock RCS / gas-generator pattern). One component, two scopes, so Engine mode and Data
 * mode cannot drift apart (D11).
 *
 * Two KSA facts drive the copy: a **mixture reaction has no default ratio** — KSA refuses to
 * load a combustor without `<MixtureRatio>` — and **`MinimumThrottle = 1.0` means on/off
 * only**, which is why the field says so instead of leaving 100% to be read as "full power".
 *
 * **Undo enrollment**: field edits stream (one push at interaction start); the propellant pick
 * and the plumbing/feeds setters are discrete pushes inside the store actions (§B11).
 */
export function CombustorEditor({
  templateId,
  index,
}: {
  templateId: string | null;
  index: number;
}) {
  const part = useStore($part);
  const reactionIndex = useStore($allReactionIndex);

  const combustor = ownerOf(part, templateId)?.combustors[index];
  if (!combustor) return null;

  const isSub = templateId !== null;
  const begin = () => pushUndo('edit combustor', combustor.id);
  const update = (patch: Partial<Combustor>) =>
    isSub ? updateCombustor(templateId, index, patch) : updatePartCombustor(index, patch);

  const targets = feedTargetsOf(part);
  const reaction = reactionIndex.get(combustor.reactionId);
  const known = KNOWN_REACTIONS.find((k) => k.id === combustor.reactionId);
  // Whether this reaction takes an O/F ratio: the live catalog first, then the static
  // snapshot; an unknown id that already carries a ratio keeps the field editable.
  const isMixture = reaction
    ? reaction.kind === 'Mixture'
    : known
      ? known.kind === 'Mixture'
      : combustor.mixtureRatio != null;
  const bounds = reaction ? mixtureRatioBounds(reaction) : null;
  const ratioMin = bounds?.min ?? known?.ratioMin;
  const ratioMax = bounds?.max ?? known?.ratioMax;
  const defaultRatio =
    reaction?.kind === 'Mixture' ? reaction.defaultMixtureRatio : known?.defaultMixtureRatio;

  return (
    <div className="flex flex-col gap-2">
      <Field label="Plumbing (which fluid network it draws through)">
        <Select
          size="sm"
          aria-label="Plumbing class"
          value={combustor.plumbing}
          onChange={(k) =>
            isSub
              ? setCombustorPlumbing(templateId, index, k as PlumbingClass)
              : setPartCombustorPlumbing(index, k as PlumbingClass)
          }
        >
          <ListBoxItem id="Bulk">Bulk (main engine)</ListBoxItem>
          <ListBoxItem id="Service">Service (RCS)</ListBoxItem>
        </Select>
      </Field>
      <p className="text-[11px] leading-snug text-fg-subtle">
        <b>Service</b> draws through connectors that carry ServiceFluid — the default. <b>Bulk</b>{' '}
        needs <code>BulkFluid</code> on every connector in the path.
      </p>

      <FeedsField
        label="Feeds from"
        feeds={combustor.feeds}
        connectorIds={targets.connectorIds}
        containers={targets.containers}
        allowParent
        onChange={(feeds) =>
          isSub ? setCombustorFeeds(templateId, index, feeds) : setPartCombustorFeeds(index, feeds)
        }
      />

      <FlashField fieldKey="reactionId">
        <ReactionPicker
          label="Propellant (reaction)"
          kind="combustor"
          value={combustor.reactionId}
          onPick={(id, ratio) => {
            // ONE discrete step for the pick AND its O/F reset side effect (§B11), then the
            // flash that advertises the reset — KSA's own designer resets the same way.
            if (isSub) setCombustorReaction(templateId, index, id, ratio);
            else setPartCombustorReaction(index, id, ratio);
            flashModuleField('mixtureRatio');
          }}
        />
      </FlashField>

      {isMixture && (
        <FlashField fieldKey="mixtureRatio">
          <Field label="Mixture ratio (O/F by mass — required for mixtures)">
            <PreciseNumberInput
              aria-label="Mixture ratio"
              value={combustor.mixtureRatio ?? 0}
              min={ratioMin}
              max={ratioMax}
              step={0.1}
              onInteractionStart={begin}
              onCommit={(n) => update({ mixtureRatio: n > 0 ? n : null })}
            />
          </Field>
          {ratioMin !== undefined && ratioMax !== undefined && (
            <RatioSlider
              value={combustor.mixtureRatio ?? defaultRatio ?? ratioMin}
              min={ratioMin}
              max={ratioMax}
              defaultRatio={defaultRatio}
              onBegin={begin}
              onChange={(n) => update({ mixtureRatio: n })}
            />
          )}
          {combustor.mixtureRatio == null && (
            <p className="text-[11px] leading-snug text-warning">
              A mixture reaction needs an O/F ratio — KSA refuses to load the engine without one.
            </p>
          )}
        </FlashField>
      )}

      <Field label="Chamber pressure (bar)">
        <PreciseNumberInput
          aria-label="Chamber pressure in bar"
          value={combustor.maxPressurePa / PA_PER_BAR}
          min={0}
          onInteractionStart={begin}
          onCommit={(bar) => update({ maxPressurePa: bar * PA_PER_BAR })}
        />
      </Field>
      <Field label="Thermal efficiency (%)">
        <PreciseNumberInput
          aria-label="Thermal efficiency percent"
          value={combustor.thermalEfficiency * 100}
          min={0}
          max={100}
          onInteractionStart={begin}
          onCommit={(pct) => update({ thermalEfficiency: clamp01(pct / 100) })}
        />
      </Field>
      <Field label="Minimum throttle (%, 100 = on/off only)">
        <PreciseNumberInput
          aria-label="Minimum throttle percent"
          value={combustor.minimumThrottle * 100}
          min={1}
          max={100}
          onInteractionStart={begin}
          onCommit={(pct) => update({ minimumThrottle: clampThrottle(pct / 100) })}
        />
      </Field>
      <Field label="Min pulse time (s, 0 = none — for RCS)">
        <PreciseNumberInput
          aria-label="Minimum pulse time in seconds"
          value={combustor.minimumPulseTimeS ?? 0}
          min={0}
          step={0.01}
          onInteractionStart={begin}
          onCommit={(s) => update({ minimumPulseTimeS: s > 0 ? s : null })}
        />
      </Field>
    </div>
  );
}

/**
 * The micro-slider under the ratio field (§B5): it spans the reaction's LUT row range — the
 * same bounds KSA clamps into — and marks the reaction's default ratio with a tick, so the
 * usable band and the stock choice are both visible without reading two numbers.
 *
 * Streams through the same setter as the field, pushing ONE undo step at pointer-down.
 */
function RatioSlider({
  value,
  min,
  max,
  defaultRatio,
  onBegin,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  defaultRatio: number | undefined;
  onBegin: () => void;
  onChange: (n: number) => void;
}) {
  const tick =
    defaultRatio !== undefined && max > min ? ((defaultRatio - min) / (max - min)) * 100 : null;
  return (
    <div className="relative flex flex-col gap-0.5" onPointerDown={onBegin}>
      <Slider
        aria-label="Mixture ratio slider"
        minValue={min}
        maxValue={max}
        step={(max - min) / 500}
        value={value}
        onChange={(v) => onChange(v as number)}
      />
      {tick !== null && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 h-2 w-px bg-fg-subtle"
          style={{ left: `${tick}%` }}
        />
      )}
      <span className="text-[11px] text-fg-subtle">
        {min.toFixed(2)} – {max.toFixed(2)}
        {defaultRatio !== undefined && ` · default ${defaultRatio}`}
      </span>
    </div>
  );
}
