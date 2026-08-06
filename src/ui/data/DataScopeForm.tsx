import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { ChevronLeft, MoreVertical } from 'lucide-react';
import {
  Button,
  InlineConfirmStrip,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  useIsPhone,
} from '../kit';
import { useInstanceIds } from './instances';
import { PartScopeChip, TemplateScopeChip } from './ScopeChip';
import { DataSection, IssueDot } from './DataSection';
import { EMPTY_SECTION_META, type SectionMeta } from './sectionMeta';
import { PassthroughViewer } from './PassthroughViewer';
import { IdentitySection } from './sections/IdentitySection';
import { MassSection } from './sections/MassSection';
import { TanksSection } from './sections/TanksSection';
import { PowerSection, SolarPanelsList } from './sections/PowerSection';
import { CouplingSection } from './sections/CouplingSection';
import { WiringSection } from './sections/WiringSection';
import { AdvancedSection } from './sections/AdvancedSection';
import { LightsSection } from './sections/LightsSection';
import { TemplateEngineSection } from './sections/TemplateEngineSection';
import { buildDataNavigator } from './dataNavigatorModel';
import {
  $dataScope,
  $gameDataFindings,
  jumpToSection,
  sectionDef,
  sectionsFor,
  type DataScope,
  type DataSectionId,
} from '../../state/dataModeStore';
import {
  $part,
  addLight,
  addSubPartSolarPanel,
  addTank,
  removeAllTemplateData,
  removeSubPartSolarPanel,
  revealEntity,
  select,
  setSubPartSolarPanelOutput,
  setSubPartSolarPanelRotation,
} from '../../state/editorStore';
import { setMode } from '../../state/modeStore';
import { openPanelSheet } from '../shell/phone/phoneSheets';
import type { EditingPart } from '../../ksa/types';

/**
 * **The Data scope form** — Data mode's left sidebar (design:
 * design-data-engine-modes.md §A4/§A5; foundation §7.3, §15.3).
 *
 * A sticky header naming the scope (with its §A5 chip and an overflow ⋮), a sticky
 * horizontally-scrollable section chip strip, and the section stack itself. Every GameData
 * field the two v1 modals owned lives in one of these sections — that is what let the modals
 * be deleted rather than merely hidden (RULE ZERO, §C1 rows 1–4).
 *
 * The two scopes render different stacks: Part = Identity · Mass · Tanks · Power · Coupling ·
 * Wiring · Advanced · Passthrough; Template = Tanks · Lights · Solar · Engine · Passthrough.
 * Both orders come from `sectionsFor()`, the one section dataset the navigator's child rows
 * and this form's chip strip also render from, so the three can never drift apart.
 *
 * **Undo enrollment: NONE of its own.** Scope, chips and expand flags are ephemeral; the one
 * mutation reachable from the header ("Delete all data…") is a single discrete editorStore
 * push behind the foundation §14.3 whole-container confirm.
 */
export function DataScopeForm({ children }: { children?: React.ReactNode }) {
  const scope = useStore($dataScope);
  const part = useStore($part);
  const name =
    scope.kind === 'part'
      ? part.gameData.displayName.trim() || part.partId.trim() || '(unnamed part)'
      : scope.templateId;

  return (
    <div className="flex min-h-0 flex-col">
      <ScopeHeader scope={scope} name={name} />
      <SectionChipStrip scope={scope} />
      <div className="flex flex-col gap-2 p-(--density-panel-p)">
        {children ??
          (scope.kind === 'part' ? (
            <PartSections part={part} />
          ) : (
            <TemplateSections part={part} templateId={scope.templateId} />
          ))}
      </div>
    </div>
  );
}

// ── section metadata (the ONE dataset, shared with the navigator) ────────────

/**
 * The per-section badge + issue level for a scope, read from the navigator's own row model so
 * a count can never mean one thing in the tree and another in the form.
 */
function useSectionMeta(part: EditingPart, scope: DataScope): (id: DataSectionId) => SectionMeta {
  const findings = useStore($gameDataFindings);
  const model = buildDataNavigator(part, findings);
  const rows =
    scope.kind === 'part'
      ? model.part.sections
      : (model.templates.find((t) => t.templateId === scope.templateId)?.sections ?? []);
  const byId = new Map(rows.map((row) => [row.sectionId, { count: row.count, issue: row.issue }]));
  return (id) => byId.get(id) ?? EMPTY_SECTION_META;
}

// ── Part scope (§A4.1) ───────────────────────────────────────────────────────

function PartSections({ part }: { part: EditingPart }) {
  const meta = useSectionMeta(part, { kind: 'part' });
  const g = part.gameData;

  return (
    <>
      <IdentitySection part={part} meta={meta('identity')} />
      <MassSection part={part} meta={meta('mass')} />
      <TanksSection owner={null} tanks={g.tanks} meta={meta('tanks')} />
      <PowerSection part={part} meta={meta('power')} />
      <CouplingSection part={part} meta={meta('coupling')} />
      <WiringSection part={part} meta={meta('wiring')} />
      <AdvancedSection meta={meta('advanced')} />
      <PassthroughViewer
        rootTag="PartGameData"
        unknownAttrs={g.unknownAttrs}
        unknownChildren={g.unknownChildren}
        customMassExtras={g.customMassExtras}
        meta={meta('passthrough')}
      />
    </>
  );
}

// ── Template scope (§A4.2) ───────────────────────────────────────────────────

function TemplateSections({ part, templateId }: { part: EditingPart; templateId: string }) {
  const meta = useSectionMeta(part, { kind: 'template', templateId });
  const spd = part.subPartGameData.find((s) => s.subPartTemplateId === templateId);
  const lightCount = part.lights.filter((l) => l.ownerTemplateId === templateId).length;
  const isEmpty =
    lightCount === 0 &&
    (!spd ||
      spd.tanks.length +
        spd.solarPanels.length +
        spd.combustors.length +
        spd.nozzles.length +
        spd.rockets.length +
        spd.solidMotors.length +
        spd.solidNozzles.length +
        spd.solidGrainSegments.length +
        spd.unknownChildren.length ===
        0);

  return (
    <>
      {isEmpty && <TemplateEmptyState templateId={templateId} />}
      <TanksSection owner={templateId} tanks={spd?.tanks ?? []} meta={meta('tanks')} />
      <LightsSection part={part} templateId={templateId} meta={meta('lights')} />
      <DataSection
        sectionId="solar"
        count={meta('solar').count}
        issue={meta('solar').issue}
        onAdd={() => addSubPartSolarPanel(templateId)}
      >
        <SolarPanelsList
          heading={false}
          solarPanels={spd?.solarPanels ?? []}
          onAdd={() => addSubPartSolarPanel(templateId)}
          onRemove={(i) => removeSubPartSolarPanel(templateId, i)}
          onChangeOutput={(i, watts) => setSubPartSolarPanelOutput(templateId, i, watts)}
          onChangeRotation={(i, rotation) => setSubPartSolarPanelRotation(templateId, i, rotation)}
        />
      </DataSection>
      <TemplateEngineSection templateId={templateId} spd={spd} meta={meta('engine')} />
      <PassthroughViewer
        rootTag="SubPartGameData"
        unknownAttrs={spd?.unknownAttrs ?? {}}
        unknownChildren={spd?.unknownChildren ?? []}
        meta={meta('passthrough')}
      />
    </>
  );
}

/**
 * A template scoped with nothing on it yet: the navigator's "＋ add data" menu, rendered as
 * buttons (design §A4.2 last line) so an empty scope still has a one-click way in.
 */
function TemplateEmptyState({ templateId }: { templateId: string }) {
  const add = (action: () => void, sectionId: DataSectionId) => () => {
    action();
    jumpToSection(sectionId);
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-panel p-2">
      <p className="text-xs text-fg-subtle">
        No data on this SubPart yet. Give it something KSA can use:
      </p>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onPress={add(() => addTank(templateId), 'tanks')}>
          Add tank
        </Button>
        <Button size="sm" onPress={add(() => addLight(templateId), 'lights')}>
          Add light
        </Button>
        <Button size="sm" onPress={add(() => addSubPartSolarPanel(templateId), 'solar')}>
          Add solar panel
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => setMode('engine', { defineNew: true, templateId })}
        >
          Add engine (thrust chamber) →
        </Button>
      </div>
    </div>
  );
}

// ── header (§A4) ─────────────────────────────────────────────────────────────

function ScopeHeader({ scope, name }: { scope: DataScope; name: string }) {
  const instanceIds = useInstanceIds(scope.kind === 'template' ? scope.templateId : '');
  const isPhone = useIsPhone();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="sticky top-0 z-1 flex flex-col gap-1 border-b border-border bg-panel px-(--density-panel-p) py-1">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* Phone only: the two sheets share one slot, so the form needs a way BACK to the
            scope list it was opened from (§A8). Desktop has both panels at once. */}
        {isPhone && (
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 shrink-0 gap-0.5 px-1"
            aria-label="Back to data scopes"
            onPress={openPanelSheet}
          >
            <ChevronLeft size={14} />
            <span>Scopes</span>
          </Button>
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg" title={name}>
          {scope.kind === 'part' ? 'Part — ' : 'Template — '}
          {name}
        </span>
        {scope.kind === 'part' ? (
          <PartScopeChip />
        ) : (
          <TemplateScopeChip templateId={scope.templateId} instanceIds={instanceIds} />
        )}
        <MenuTrigger>
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            className="size-5 shrink-0"
            aria-label="Scope options"
          >
            <MoreVertical size={12} />
          </Button>
          {/* Mounted by the Popover, so the item set is rebuilt (and re-predicated) on open. */}
          <Popover className="w-56">
            <ScopeMenu
              scope={scope}
              instanceIds={instanceIds}
              onRequestDelete={() => setConfirming(true)}
            />
          </Popover>
        </MenuTrigger>
      </div>
      {confirming &&
        scope.kind === 'template' && (
          // Whole-container destroy ⇒ confirm (foundation §14.3). The strip is in flow, so
          // nothing is overlaid; the ACTION behind it is one undo step.
          <InlineConfirmStrip
            label={`Delete all data on ${scope.templateId}?`}
            confirmLabel="Delete"
            onConfirm={() => {
              removeAllTemplateData(scope.templateId);
              setConfirming(false);
            }}
            onCancel={() => setConfirming(false)}
          />
        )}
    </div>
  );
}

function ScopeMenu({
  scope,
  instanceIds,
  onRequestDelete,
}: {
  scope: DataScope;
  instanceIds: readonly string[];
  onRequestDelete: () => void;
}) {
  const part = useStore($part);
  if (scope.kind === 'part') {
    return (
      <Menu aria-label="Part scope options">
        <MenuItem density="dense" onAction={() => void navigator.clipboard?.writeText(part.partId)}>
          Copy Part Id
        </MenuItem>
        <MenuItem
          density="dense"
          onAction={() => setMode('engine', { engineScope: { kind: 'part' } })}
        >
          Open in Engine mode →
        </MenuItem>
      </Menu>
    );
  }
  return (
    <Menu aria-label="Template scope options">
      <MenuItem
        density="dense"
        onAction={() => {
          const refs = instanceIds.map((id) => ({ kind: 'subpart' as const, id }));
          select(refs);
          if (refs[0]) revealEntity('subpart', refs[0].id);
        }}
      >
        Select placements in 3D
      </MenuItem>
      <MenuItem
        density="dense"
        onAction={() =>
          setMode('engine', { engineScope: { kind: 'sub', templateId: scope.templateId } })
        }
      >
        Open in Engine mode →
      </MenuItem>
      <MenuItem density="dense" variant="danger" onAction={onRequestDelete}>
        Delete all data…
      </MenuItem>
    </Menu>
  );
}

// ── section chip strip (§A4) ─────────────────────────────────────────────────

function SectionChipStrip({ scope }: { scope: DataScope }) {
  const findings = useStore($gameDataFindings);
  const part = useStore($part);
  // The chips mirror the navigator's child rows exactly — one dataset, one set of counts.
  const model = buildDataNavigator(part, findings);
  const sections =
    scope.kind === 'part'
      ? model.part.sections
      : (model.templates.find((t) => t.templateId === scope.templateId)?.sections ??
        sectionsFor(scope).map((def) => ({
          sectionId: def.id,
          label: def.label,
          count: 0,
          issue: null,
        })));

  return (
    <div className="sticky top-8 z-1 flex gap-1 overflow-x-auto border-b border-border bg-panel px-(--density-panel-p) py-1">
      {sections.map((section) => (
        <button
          key={section.sectionId}
          type="button"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-fg-muted hover:border-border-strong hover:text-fg"
          onClick={() => jumpToSection(section.sectionId)}
        >
          <IssueDot level={section.issue} size={10} />
          {sectionDef(section.sectionId).chip}
          {section.count > 0 && <span className="text-fg-subtle">{section.count}</span>}
        </button>
      ))}
    </div>
  );
}
