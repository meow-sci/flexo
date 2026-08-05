import { SectionTitle } from '../../kit';
import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import { EngineModeLink } from '../EngineModeLink';
import { CapabilitiesSummaryCard } from '../CapabilitiesSummaryCard';
import {
  ConsumerFeedWiringSection,
  GimbalsSection,
  RocketControllersSection,
} from '../../EngineSections';
import type { EditingPart } from '../../../ksa/types';

/**
 * **Wiring** — the part-level plumbing and thrust-vectoring hardware: rocket controllers,
 * `<ConsumerFeedWiring>` entries (with auto-wire) and gimbals (design: §A4.1 Wiring, D9,
 * D10; census `engines.md` §1.9).
 *
 * TODO(P7.18): the three bodies below are the v1 `EngineSections` components, hosted here
 * deliberately for one phase. P7 replaces them with the shared `ControllerEditor` /
 * `FeedWiringEditor` / `GimbalEditor` that Engine mode also renders, which is what makes D11
 * ("the two views can never diverge in capability") true rather than aspirational. Do not
 * re-implement these fields in the meantime — RULE ZERO is satisfied by hosting them.
 *
 * Below them sits the D10 capabilities mirror: read-only, because the connector inspector in
 * Build stays the single editor for that field.
 *
 * **Undo enrollment**: unchanged v1 semantics inside the hosted components — discrete
 * adds/removes push internally, `autoWireUnwiredConsumers` is one `'auto-wire consumers'`
 * push, field edits stream.
 */
export function WiringSection({ part, meta }: { part: EditingPart; meta: SectionMeta }) {
  return (
    <DataSection
      sectionId="wiring"
      count={meta.count}
      issue={meta.issue}
      headerAction={<EngineModeLink scope={{ kind: 'part' }} />}
    >
      <div className="flex flex-col gap-2">
        <SectionTitle>Controllers</SectionTitle>
        <RocketControllersSection part={part} />
      </div>
      <div className="flex flex-col gap-2">
        <SectionTitle>Feed wiring</SectionTitle>
        <ConsumerFeedWiringSection part={part} />
      </div>
      <div className="flex flex-col gap-2">
        <SectionTitle>Gimbals</SectionTitle>
        <GimbalsSection part={part} />
      </div>
      <CapabilitiesSummaryCard part={part} />
    </DataSection>
  );
}
