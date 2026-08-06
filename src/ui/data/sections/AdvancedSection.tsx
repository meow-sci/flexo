import { SectionTitle } from '../../kit';
import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import { EngineModeBanner, EngineModeLink } from '../EngineModeLink';
import { ModuleCardList } from '../../engine/ModuleCardList';

/**
 * **Advanced** — the part-level engine hardware: a real `<SolidMotor>` (SRB) with its grain
 * segments and solid nozzle, and the gas-generator trio of part-level combustors, nozzles and
 * rockets whose refs can target other SubPart instances (design: §A4.1 Advanced, D11; census
 * §1.1 "Solid motor (SRB)" / "Gas generator").
 *
 * Collapsed by default: it is genuinely advanced, and the count badge is what tells a user
 * whether there is anything inside.
 *
 * The bodies are the SAME editors Engine mode renders, as a card list (D11) — one
 * implementation, two entrances, with the cross-link banner naming the other.
 *
 * **Undo enrollment**: discrete adds/removes push internally; field edits stream.
 */
export function AdvancedSection({ meta }: { meta: SectionMeta }) {
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
        <p className="text-xs text-fg-subtle">
          A <code>&lt;Rocket&gt;</code> may bind ONLY solid parts or ONLY liquid ones, and a solid
          rocket needs at least one nozzle — KSA throws at load otherwise. Grain segments stack
          across connectors that declare <b>SolidMotorCase</b>.
        </p>
        <ModuleCardList templateId={null} groups={['solidMotor', 'grain', 'solidNozzle']} />
      </div>
      <div className="flex flex-col gap-2">
        <SectionTitle>Gas generator (part-level rockets)</SectionTitle>
        <p className="text-xs text-fg-subtle">
          Part-level combustors and nozzles are how a gas-generator cycle is authored: a part-level{' '}
          <code>&lt;Rocket&gt;</code>&rsquo;s refs may point at hardware on any SubPart instance.
        </p>
        <ModuleCardList templateId={null} groups={['combustor', 'nozzle', 'rocket']} />
      </div>
    </DataSection>
  );
}
