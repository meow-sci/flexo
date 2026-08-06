import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import { EngineModeBanner, EngineModeLink } from '../EngineModeLink';
import { ModuleCardList } from '../../engine/ModuleCardList';
import type { SubPartGameData } from '../../../ksa/types';

/**
 * **Engine (thrust chamber)** (template scope) — the combustors, nozzles, solid hardware and
 * `<Rocket>` bindings that travel with the mesh (design: §A4.2 Engine, D11; census §1.2).
 *
 * The body is the SAME editor set Engine mode focuses one module at a time, rendered as a card
 * list in this scope's document order (D11). A template with no `<SubPartGameData>` yet simply
 * shows empty groups: the real entry is created lazily by the store action behind the first
 * `＋`, which is v1's behaviour kept.
 *
 * **Undo enrollment**: discrete adds/removes push internally; field edits stream.
 */
export function TemplateEngineSection({
  templateId,
  spd,
  meta,
}: {
  templateId: string;
  spd: SubPartGameData | undefined;
  meta: SectionMeta;
}) {
  return (
    <DataSection
      sectionId="engine"
      count={meta.count}
      issue={meta.issue}
      headerAction={<EngineModeLink scope={{ kind: 'sub', templateId }} />}
    >
      <EngineModeBanner
        scope={{ kind: 'sub', templateId }}
        text="This hardware is also editable in Engine mode, with live thrust and Isp."
      />
      <ModuleCardList
        templateId={templateId}
        groups={['combustor', 'nozzle', 'solidMotor', 'grain', 'solidNozzle', 'rocket']}
      />
      {spd === undefined && (
        <p className="text-[11px] leading-snug text-fg-subtle">
          This template carries no data yet — adding the first module creates its
          <code> &lt;SubPartGameData&gt;</code> entry.
        </p>
      )}
    </DataSection>
  );
}
