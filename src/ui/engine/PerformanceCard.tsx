import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ListBoxItem, SectionTitle, Select, cn, noteBox } from '../kit';
import { SolidThrustCurveCard } from './SolidThrustCurveCard';
import {
  computePerformance,
  rocketsInScope,
  type PerformanceResult,
} from './performanceAggregation';
import { $part } from '../../state/editorStore';
import { $allReactionIndex } from '../../state/reactionStore';
import {
  $activeEngineEntry,
  $rocketReadoutSel,
  FIRST_PAIR_ROCKET,
  setRocketReadoutSel,
} from '../../state/engineStore';

/**
 * **The Performance card** (design: design-data-engine-modes.md §B6, decision D6) — the live
 * thrust/Isp readout, aggregated over one `<Rocket>`'s chamber+nozzle pairs.
 *
 * `predictPerformance` is a verbatim port of KSA's engine math and stays untouched; all this
 * component does is choose a rocket, call {@link computePerformance}, and render. The
 * headline (the first two numbers) is what the navigator shows at a glance; the metric rows
 * and the per-pair disclosure sit under it.
 *
 * Both of v1's degradation states are preserved word-for-word, because they are the
 * difference between "your engine is broken" and "this build has no catalog": no reaction
 * data → *"the engine still exports correctly"*, and a mixture reaction with no O/F ratio →
 * *"set the combustor's O/F mixture ratio to preview"*.
 *
 * **Undo enrollment: NONE.** The rocket selection is ephemeral designer state (§B11).
 */
export function PerformanceCard() {
  const part = useStore($part);
  const entry = useStore($activeEngineEntry);
  const reactions = useStore($allReactionIndex);
  const selection = useStore($rocketReadoutSel);
  const [openPairs, setOpenPairs] = useState(false);

  const rockets = rocketsInScope(part, entry);
  // "First pair" is the LEGACY fallback, not a peer option: it only exists for a scope with
  // no `<Rocket>` at all, and the select hides itself there (v1 behavior preserved).
  const effective = rockets.some((r) => r.id === selection) ? selection : FIRST_PAIR_ROCKET;
  const result = computePerformance(part, entry, effective, reactions);

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-t border-border pt-1.5">
      <div className="flex items-center gap-2 px-1">
        <SectionTitle className="flex-1">Performance</SectionTitle>
        {rockets.length > 0 && (
          <Select
            size="xs"
            aria-label="Rocket to read out"
            className="w-32"
            value={effective}
            onChange={(k) => setRocketReadoutSel(String(k))}
          >
            {rockets.map((rocket) => (
              <ListBoxItem key={rocket.id} id={rocket.id} textValue={rocket.id}>
                {rocket.id}
              </ListBoxItem>
            ))}
          </Select>
        )}
      </div>

      <div className="px-1">
        <PerformanceBody
          result={result}
          openPairs={openPairs}
          onTogglePairs={() => setOpenPairs((v) => !v)}
        />
      </div>

      <SolidThrustCurveCard />
    </div>
  );
}

function PerformanceBody({
  result,
  openPairs,
  onTogglePairs,
}: {
  result: PerformanceResult;
  openPairs: boolean;
  onTogglePairs: () => void;
}) {
  if (result.kind === 'no-modules') {
    return (
      <p className="text-[11px] leading-snug text-fg-subtle">
        Add a combustor and a nozzle to see live thrust and Isp.
      </p>
    );
  }
  if (result.kind === 'solid') {
    return (
      <p className="text-[11px] leading-snug text-fg-subtle">
        A solid motor&rsquo;s thrust is a curve, not a number — see the burn preview below.
      </p>
    );
  }
  if (result.kind === 'no-catalog') {
    return (
      <div className={noteBox}>
        Live performance needs the reaction catalog (Reactions.xml). Pick a known propellant, or
        it&rsquo;s unavailable in this build — the engine still exports correctly.
      </div>
    );
  }
  if (result.kind === 'no-ratio') {
    return (
      <div className={noteBox}>
        {result.reactionName} is a mixture reaction — set the combustor&rsquo;s O/F mixture ratio to
        preview performance (KSA requires it to load the engine).
      </div>
    );
  }

  const kN = (n: number) => `${(n / 1000).toFixed(1)} kN`;
  const s = (n: number) => `${n.toFixed(1)} s`;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-panel-sunken p-2">
      {/* The headline: the two numbers that answer "is this engine any good?" at a glance. */}
      <div className="font-mono text-sm tabular-nums text-fg">
        {kN(result.thrustVacN)} vac · Isp {s(result.ispVac)}
      </div>
      <div className="text-[11px] text-fg-subtle">{result.reactionName}</div>
      <Metric label="Thrust (vacuum)" value={kN(result.thrustVacN)} />
      <Metric label="Thrust (sea level)" value={kN(result.thrustSLN)} />
      <Metric label="Isp (vacuum)" value={s(result.ispVac)} />
      <Metric label="Isp (sea level)" value={s(result.ispSL)} />
      <Metric label="Mass flow" value={`${result.massFlowRate.toFixed(1)} kg/s`} />
      <Metric label="Throat diameter" value={`${(result.throatDiameterM * 100).toFixed(1)} cm`} />
      {result.flowSeparationSeveritySL > 0 && (
        <Metric
          label="⚠ Flow separation (SL)"
          value={`${(result.flowSeparationSeveritySL * 100).toFixed(0)}%`}
          hint="The nozzle over-expands at sea level — fine for a vacuum engine, but it would shake apart low in the atmosphere."
        />
      )}
      <Metric
        label="Optimum expansion"
        value={`${(result.optimumExpansionPa / 1000).toFixed(2)} kPa`}
        hint="Ambient pressure at which the exhaust is perfectly expanded."
      />

      {result.pairs.length > 1 && (
        <>
          <button
            type="button"
            className="mt-1 flex cursor-pointer items-center gap-1 text-left text-[11px] text-fg-subtle hover:text-fg-muted"
            onClick={onTogglePairs}
            aria-expanded={openPairs}
          >
            {openPairs ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {result.pairs.length} chamber/nozzle pairs
          </button>
          {openPairs &&
            result.pairs.map((pair, i) => (
              <Metric
                key={`${pair.coreId}|${pair.nozzleId}|${i}`}
                label={`${pair.coreId} → ${pair.nozzleId}${pair.instanceCount > 1 ? ` ×${pair.instanceCount}` : ''}`}
                value={kN(pair.performance.thrustVacN * pair.instanceCount)}
              />
            ))}
        </>
      )}
    </div>
  );
}

/** A two-column metric row (ported verbatim from v1's `PerformanceReadout`). */
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2" title={hint}>
      <span className="text-xs text-fg-subtle">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The two-number headline on its own (design §B8): thrust and Isp, pinned to the bottom of the
 * phone Panel sheet so they stay visible while scrolling the module tree.
 *
 * Renders nothing when there are no numbers — a hint has no business in a one-line footer, and
 * the full card above it already explains why.
 */
export function PerformanceHeadline({ className }: { className?: string }) {
  const part = useStore($part);
  const entry = useStore($activeEngineEntry);
  const reactions = useStore($allReactionIndex);
  const selection = useStore($rocketReadoutSel);

  const rockets = rocketsInScope(part, entry);
  const effective = rockets.some((r) => r.id === selection) ? selection : FIRST_PAIR_ROCKET;
  const result = computePerformance(part, entry, effective, reactions);
  if (result.kind !== 'ok') return null;

  return (
    <div
      className={cn(
        'shrink-0 border-t border-border bg-panel px-2 py-1 font-mono text-xs tabular-nums text-fg',
        className,
      )}
    >
      {(result.thrustVacN / 1000).toFixed(1)} kN vac · Isp {result.ispVac.toFixed(1)} s
    </div>
  );
}
