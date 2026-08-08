import { useStore } from '@nanostores/react';
import { ChevronLeft, Crosshair, MoreVertical } from 'lucide-react';
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  cn,
  noteBox,
  useIsPhone,
  warningBox,
} from '../kit';
import { PartScopeChip, TemplateScopeChip } from '../data/ScopeChip';
import { CombustorEditor } from './CombustorEditor';
import { NozzleEditor, SolidNozzleEditor } from './NozzleEditor';
import { SolidMotorEditor } from './SolidMotorEditor';
import { GrainSegmentEditor } from './GrainSegmentEditor';
import { RocketEditor } from './RocketEditor';
import { ControllerEditor } from './ControllerEditor';
import { GimbalEditor } from './GimbalEditor';
import { FeedWiringEditor } from './FeedWiringEditor';
import { PropellantEditor } from './PropellantEditor';
import { addModule, removeModule } from './moduleActions';
import {
  MODULE_GROUP_LABEL,
  MODULE_TREE_GROUP_ORDER,
  buildModuleTree,
  findModuleRow,
  totalModuleCount,
} from './moduleTreeModel';
import { $part, duplicateEngineModule, undo } from '../../state/editorStore';
import {
  $activeEngineEntry,
  $activeModuleClamped,
  $engineFindings,
  engineEntryLabel,
  focusEngineIssue,
  setExhaustPlacing,
  type EngineEntry,
  type EngineModuleRef,
} from '../../state/engineStore';
import { $partScopeName } from '../../state/partsStore';
import { $allReactions } from '../../state/reactionStore';
import { status } from '../../state/statusStore';
import { openPanelSheet } from '../shell/phone/phoneSheets';

/**
 * **The Module Editor** — Engine mode's LEFT sidebar (design: design-data-engine-modes.md §B4;
 * foundation §7.4, §15.4).
 *
 * Exactly ONE module's fields are on screen at a time. That is the whole answer to v1's
 * 1806-line scroll (census pain 1/4): the right tree says what the engine is made of, this
 * panel says what one module says, and nothing else competes for the space.
 *
 * The header carries the module's identity — its label, the structural scope chip that says
 * whether these numbers are shared by N placements or belong to the part, and the ⋮ menu with
 * the same Duplicate / Remove / Copy id rules the tree row has (one dispatch table,
 * `moduleActions`, so the two menus can never disagree).
 *
 * With **no module focused** it is the engine summary: counts, the first blocker with a jump,
 * the solid-motor-vs-SRB-preset guidance (D12), and the quick actions that get a new engine
 * moving.
 *
 * **Undo enrollment: NONE of its own** — every mutation reachable here is a store action that
 * pushes its own step (§B11).
 */
export function ModuleEditor() {
  const part = useStore($part);
  const entry = useStore($activeEngineEntry);
  const active = useStore($activeModuleClamped);
  const findings = useStore($engineFindings);
  const reactions = useStore($allReactions);
  const isPhone = useIsPhone();
  // Null in a single-part project, so the header reads exactly as it did before (I8).
  const partScopeName = useStore($partScopeName);

  const tree = buildModuleTree(
    part,
    entry,
    findings,
    new Map(reactions.map((r) => [r.id, r.name])),
  );
  const row = active ? findModuleRow(tree, active) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-1 flex items-center gap-1 border-b border-border bg-panel px-(--density-panel-p) py-1">
        {/* Phone: the two sheets share one slot, so the editor needs a way back to the tree
            it was opened from (§B8). Desktop shows both panels at once. */}
        {isPhone && (
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 shrink-0 gap-0.5 px-1"
            aria-label="Back to engine modules"
            onPress={openPanelSheet}
          >
            <ChevronLeft size={14} />
            <span>Modules</span>
          </Button>
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
          {active
            ? `${MODULE_GROUP_LABEL[active.group]}${row?.label ? ` — ${row.label}` : ''}`
            : entry
              ? engineEntryLabel(entry, part, partScopeName)
              : 'Engine'}
        </span>
        <ScopeChipFor entry={entry} module={active} part={part} />
        {active && <ModuleMenu module={active} entry={entry} label={row?.label ?? ''} />}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-(--density-panel-p)">
        {active ? (
          <ModuleBody module={active} entry={entry} />
        ) : (
          <EngineSummary part={part} entry={entry} />
        )}
      </div>
    </div>
  );
}

/** Dispatch: the ONE table mapping a focused module onto its editor (design §B4). */
function ModuleBody({ module, entry }: { module: EngineModuleRef; entry: EngineEntry | null }) {
  // `scope` decides the owner list; a `sub` ref is indexed within the OPEN template.
  const templateId = module.scope === 'sub' && entry?.kind === 'subpart' ? entry.templateId : null;
  const { group, index } = module;

  switch (group) {
    case 'combustor':
      return <CombustorEditor templateId={templateId} index={index} />;
    case 'nozzle':
      return <NozzleEditor templateId={templateId} index={index} />;
    case 'solidMotor':
      return <SolidMotorEditor templateId={templateId} index={index} />;
    case 'grain':
      return <GrainSegmentEditor templateId={templateId} index={index} />;
    case 'solidNozzle':
      return <SolidNozzleEditor templateId={templateId} index={index} />;
    case 'rocket':
      return <RocketEditor templateId={templateId} index={index} />;
    case 'controller':
      return <ControllerEditor index={index} />;
    case 'wiring':
      return <FeedWiringEditor focusIndex={index} />;
    case 'gimbal':
      return <GimbalEditor index={index} />;
    default:
      return <PropellantEditor index={index} />;
  }
}

/**
 * The structural scope chip (§A5): `[Part]` for part-level data, `[Template ×N]` for a
 * SubPart's — hovering it flashes the placements these numbers really drive. The gimbal
 * editor renders its own `[Instance: … ▾]` chip, because there the chip IS the picker.
 */
function ScopeChipFor({
  entry,
  module,
  part,
}: {
  entry: EngineEntry | null;
  module: EngineModuleRef | null;
  part: ReturnType<typeof $part.get>;
}) {
  // No open scope ⇒ no chip: the summary card is not scoped to anything yet.
  if (!entry || module?.group === 'gimbal') return null;
  if (module?.scope === 'part' || entry.kind === 'part') return <PartScopeChip />;
  const instanceIds = part.placements
    .filter((p) => p.subPartTemplateId === entry.templateId)
    .map((p) => p.instanceId);
  return <TemplateScopeChip templateId={entry.templateId} instanceIds={instanceIds} />;
}

function ModuleMenu({
  module,
  entry,
  label,
}: {
  module: EngineModuleRef;
  entry: EngineEntry | null;
  label: string;
}) {
  const canDuplicate = module.group !== 'wiring' && module.group !== 'gimbal';
  return (
    <MenuTrigger>
      <Button
        iconOnly
        size="xs"
        variant="ghost"
        className="size-5 shrink-0"
        aria-label="Module options"
      >
        <MoreVertical size={12} />
      </Button>
      {/* Mounted by the Popover, so the item set is rebuilt (and re-predicated) on each open. */}
      <Popover className="w-56">
        <Menu aria-label="Module options">
          {canDuplicate && (
            <MenuItem
              density="dense"
              onAction={() => {
                duplicateEngineModule(module, entry?.kind === 'subpart' ? entry.templateId : null);
                status(`Duplicated ${label}`, { severity: 'info' });
              }}
            >
              Duplicate
            </MenuItem>
          )}
          <MenuItem density="dense" onAction={() => void navigator.clipboard?.writeText(label)}>
            Copy id
          </MenuItem>
          <MenuItem
            density="dense"
            variant="danger"
            onAction={() => {
              removeModule(module, entry);
              // Foundation §14.3: a single undoable removal needs a way BACK, not a confirm.
              status(`Removed ${label}`, {
                severity: 'info',
                action: { label: 'Undo', run: undo },
              });
            }}
          >
            Remove
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/**
 * The no-module state (§B4.1): what this engine is, what it is made of, what is wrong with it,
 * and the three things worth doing next.
 */
function EngineSummary({
  part,
  entry,
}: {
  part: ReturnType<typeof $part.get>;
  entry: EngineEntry | null;
}) {
  const findings = useStore($engineFindings);
  const reactions = useStore($allReactions);
  const partScopeName = useStore($partScopeName);

  if (!entry) {
    return (
      <p className="text-xs leading-snug text-fg-subtle">
        No engine open. Pick one in the Engine panel, or define a new one there — an engine
        decorates a placed SubPart, it adds no geometry of its own.
      </p>
    );
  }

  const tree = buildModuleTree(
    part,
    entry,
    findings,
    new Map(reactions.map((r) => [r.id, r.name])),
  );
  const nonEmpty = tree.filter((g) => g.rows.length > 0);
  const blocker = findings.find((f) => f.severity === 'block');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-fg">
          {engineEntryLabel(entry, part, partScopeName)}
        </span>
        <span className="text-[11px] text-fg-subtle">
          {totalModuleCount(part, entry)} modules across {MODULE_TREE_GROUP_ORDER.length} groups
        </span>
      </div>

      <div className="flex flex-col gap-0.5 rounded-md border border-border bg-panel-sunken p-2">
        {nonEmpty.length === 0 ? (
          <span className="text-[11px] text-fg-subtle">No modules yet.</span>
        ) : (
          nonEmpty.map((group) => (
            <div key={group.id} className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-fg-subtle">{group.title}</span>
              <span className="font-mono text-xs tabular-nums text-fg">{group.rows.length}</span>
            </div>
          ))
        )}
      </div>

      {blocker && (
        <button
          type="button"
          className={cn(warningBox, 'cursor-pointer text-left')}
          onClick={() => focusEngineIssue(blocker)}
        >
          {blocker.message}
        </button>
      )}

      <p className={cn(noteBox, 'text-[11px] leading-snug')}>
        <b>Solid motor</b> authors real <code>&lt;SolidMotor&gt;</code> hardware with a burn curve
        KSA simulates. The <b>SRB preset</b> is the legacy approximation — a fixed-thrust liquid
        engine with a sealed tank; it stays shutdown-able and has no burn curve. Prefer the solid
        motor unless you specifically want the old behavior.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onPress={() => addModule('combustor', entry)}>
          + Combustor
        </Button>
        <Button size="sm" onPress={() => addModule('nozzle', entry)}>
          + Nozzle
        </Button>
        <Button size="sm" variant="secondary" onPress={() => setExhaustPlacing(true)}>
          <Crosshair size={13} /> Place exhaust in 3D
        </Button>
      </div>
    </div>
  );
}
