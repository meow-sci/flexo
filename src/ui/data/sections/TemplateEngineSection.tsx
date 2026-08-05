import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import { EngineModeBanner, EngineModeLink } from '../EngineModeLink';
import { SubPartEngineSection } from '../../EngineSections';
import { createSubPartGameData, type SubPartGameData } from '../../../ksa/types';

/**
 * **Engine (thrust chamber)** (template scope) — the combustors, nozzles, solid hardware and
 * `<Rocket>` bindings that travel with the mesh (design: §A4.2 Engine, D11; census §1.2).
 *
 * When the template has no `<SubPartGameData>` yet, a synthetic empty entry is handed to the
 * body so its "+ Combustor" button has something to render against — the real entry is
 * created lazily by the editorStore action on first edit. That is v1's behaviour, kept.
 *
 * TODO(P7.18): the body is the v1 `SubPartEngineSection`. P7 swaps it for the same
 * `CombustorEditor` / `NozzleEditor` / `RocketEditor` components Engine mode renders (D11), at
 * which point the cross-link banner stops being the only thing tying the two views together.
 *
 * **Undo enrollment**: unchanged v1 semantics inside the hosted component.
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
  const engineSpd = spd ?? createSubPartGameData(templateId);

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
      <SubPartEngineSection spd={engineSpd} />
    </DataSection>
  );
}
