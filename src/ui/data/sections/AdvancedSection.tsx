import { SectionTitle } from '../../kit';
import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import { EngineModeBanner, EngineModeLink } from '../EngineModeLink';
import { PartGasGeneratorSection, PartSolidMotorSection } from '../../EngineSections';
import type { EditingPart } from '../../../ksa/types';

/**
 * **Advanced** — the part-level engine hardware: a real `<SolidMotor>` (SRB) with its grain
 * segments and solid nozzle, and the gas-generator trio of part-level combustors, nozzles and
 * rockets whose refs can target other SubPart instances (design: §A4.1 Advanced, D11; census
 * §1.1 "Solid motor (SRB)" / "Gas generator").
 *
 * Collapsed by default: it is genuinely advanced, and the count badge is what tells a user
 * whether there is anything inside.
 *
 * TODO(P7.18): the two bodies are the v1 `EngineSections` components, hosted here for one
 * phase. P7 swaps them for the shared editors Engine mode renders (D11).
 *
 * **Undo enrollment**: unchanged v1 semantics inside the hosted components.
 */
export function AdvancedSection({ part, meta }: { part: EditingPart; meta: SectionMeta }) {
  return (
    <DataSection
      sectionId="advanced"
      count={meta.count}
      issue={meta.issue}
      defaultExpanded={false}
      headerAction={<EngineModeLink scope={{ kind: 'part' }} />}
    >
      <EngineModeBanner
        scope={{ kind: 'part' }}
        text="This hardware is also editable in Engine mode, with live performance and the module tree."
      />
      <div className="flex flex-col gap-2">
        <SectionTitle>Solid motor (SRB)</SectionTitle>
        <PartSolidMotorSection part={part} />
      </div>
      <div className="flex flex-col gap-2">
        <SectionTitle>Gas generator (part-level rockets)</SectionTitle>
        <PartGasGeneratorSection part={part} />
      </div>
    </DataSection>
  );
}
