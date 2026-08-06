import { useStore } from '@nanostores/react';
import { Zap } from 'lucide-react';
import { Button, Field, ItemCard, ListBoxItem, Select, cn } from '../kit';
import { FeedsField } from '../FeedsField';
import { CapabilitiesSummaryCard } from '../data/CapabilitiesSummaryCard';
import { $part, undo } from '../../state/editorStore';
import {
  addConsumerFeedWiring,
  autoWireUnwiredConsumers,
  removeConsumerFeedWiring,
  setConsumerFeedWiringFeeds,
  setConsumerFeedWiringTarget,
} from '../../state/editorStore';
import { consumerOptionsOf, feedTargetsOf, unwiredConsumersOf } from '../../state/feedTargets';
import { status } from '../../state/statusStore';

/**
 * **The feed-wiring editor** (design: design-data-engine-modes.md §B4.8, decisions D9/D10;
 * DECISIONS.md LOCKED #1) — `<ConsumerFeedWiring>`: how this Part answers a placed SubPart's
 * `<FeedsFrom Parent="true"/>`.
 *
 * This component is the whole point of LOCKED #1. In v1 it existed ONLY inside the Part Data
 * modal, so finishing an engine's plumbing forced a trip out of the designer into a fullscreen
 * dialog (census pain 2) — and an engine with no wiring makes **zero thrust with no load
 * error**, which is the worst possible thing to hide behind a mode switch. Here it is a module
 * group inside Engine mode, and Data mode's Wiring section renders this same component (D9:
 * one implementation, two entrances).
 *
 * Two KSA rules are non-negotiable: a wiring entry may **never itself defer to Parent**
 * (`ConsumerFeedWiring.OnDataLoad` rejects it — hence `allowParent={false}`), and a consumer
 * the part no longer carries stays SELECTABLE labelled "— not found", so re-pointing it is an
 * explicit act rather than a silent retarget.
 *
 * Below the entries sits the read-only capabilities mirror (D10): plumbing needs the connector
 * capability list co-visible — a Bulk path is dead unless every connector declares
 * `BulkFluid` — but capabilities stay editable only on the connector itself.
 *
 * **Undo enrollment**: add / remove / auto-wire / re-target are discrete pushes inside the
 * store actions; the feed rows go through `setConsumerFeedWiringFeeds`, also discrete.
 */
export function FeedWiringEditor({ focusIndex }: { focusIndex?: number }) {
  const part = useStore($part);
  const wiring = part.gameData.consumerFeedWiring;
  const consumers = consumerOptionsOf(part);
  const targets = feedTargetsOf(part);
  const unwired = unwiredConsumersOf(part);

  return (
    <div className="flex flex-col gap-2">
      {wiring.map((entry, i) => (
        <div key={i} className={cn('rounded-md', i === focusIndex && 'ring-1 ring-accent')}>
          <ItemCard
            title={`Wiring — ${entry.consumerId || '(no consumer)'}`}
            onRemove={() => {
              removeConsumerFeedWiring(i);
              // Foundation §14.3: one undoable entity ⇒ no confirm, a way back instead.
              status(`Removed wiring for ${entry.consumerId || '(no consumer)'}`, {
                severity: 'info',
                action: { label: 'Undo', run: undo },
              });
            }}
          >
            <Field label="Consumer (combustor / solid motor)">
              <Select
                size="sm"
                aria-label="Wired consumer"
                placeholder="Select a consumer"
                value={consumerKey(entry.consumerId, entry.subPartInstanceId) || null}
                onChange={(k) => {
                  const option = consumers.find(
                    (c) => consumerKey(c.consumerId, c.subPartInstanceId) === String(k),
                  );
                  if (option) {
                    setConsumerFeedWiringTarget(i, option.consumerId, option.subPartInstanceId);
                  }
                }}
              >
                {(consumers.some(
                  (c) =>
                    consumerKey(c.consumerId, c.subPartInstanceId) ===
                    consumerKey(entry.consumerId, entry.subPartInstanceId),
                )
                  ? consumers
                  : [
                      {
                        consumerId: entry.consumerId,
                        subPartInstanceId: entry.subPartInstanceId,
                        defersToParent: false,
                        label: `${entry.consumerId || '(none)'} — not found`,
                      },
                      ...consumers,
                    ]
                ).map((c) => (
                  <ListBoxItem
                    key={consumerKey(c.consumerId, c.subPartInstanceId)}
                    id={consumerKey(c.consumerId, c.subPartInstanceId)}
                    textValue={c.label}
                  >
                    {c.label}
                  </ListBoxItem>
                ))}
              </Select>
            </Field>
            {/* A wiring entry may NOT itself defer to Parent (ConsumerFeedWiring.OnDataLoad). */}
            <FeedsField
              label="Feeds from"
              feeds={entry.feeds}
              connectorIds={targets.connectorIds}
              containers={targets.containers}
              allowParent={false}
              onChange={(feeds) => setConsumerFeedWiringFeeds(i, feeds)}
            />
          </ItemCard>
        </div>
      ))}

      {unwired.length > 0 && (
        <p className="text-[11px] leading-snug text-warning">
          {unwired.length} consumer{unwired.length === 1 ? '' : 's'} feed from the parent part with
          no wiring — KSA will log <i>&ldquo;has no ConsumerFeedWiring wiring for it&rdquo;</i> and
          they will reach no propellant.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onPress={() => addConsumerFeedWiring()}>
          + Wiring entry
        </Button>
        {unwired.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              autoWireUnwiredConsumers();
              status('Wiring entries added for every unwired consumer', { severity: 'info' });
            }}
          >
            <Zap size={13} /> Auto-wire unwired consumers
          </Button>
        )}
      </div>

      <CapabilitiesSummaryCard part={part} />
    </div>
  );
}

/** Encodes a consumer choice as one Select key (a consumer id repeats across placements). */
function consumerKey(consumerId: string, subPartInstanceId: string | null): string {
  return `${subPartInstanceId ?? ''} ${consumerId}`;
}
