import { useStore } from '@nanostores/react';
import type { Selection } from 'react-aria-components';
import { AlertTriangle, ChevronDown, ChevronRight, MoreVertical, Plus, Zap } from 'lucide-react';
import {
  Button,
  GridList,
  GridListItem,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  SubmenuTrigger,
  cn,
  useIsPhone,
} from '../kit';
import { PartScopeChip } from '../data/ScopeChip';
import { addBlankPropellant, cloneShippedPropellant } from './propellantCreate';
import { addGimbals, addModule, removeModule, solidMotorCount } from './moduleActions';
import {
  addGroupOf,
  buildModuleTree,
  gimbalCandidates,
  type GimbalAddBlocker,
  type IssueLevel,
  type ModuleTreeGroup,
  type ModuleTreeRow,
  type UnwiredRow,
} from './moduleTreeModel';
import {
  $part,
  addConsumerFeedWiring,
  autoWireUnwiredConsumers,
  duplicateEngineModule,
  undo,
} from '../../state/editorStore';
import {
  $activeEngineEntry,
  $activeModuleClamped,
  $engineFindings,
  $engineTreeCollapsed,
  $resolvedNozzleTargets,
  focusModule,
  moduleRefKey,
  setActiveNozzleRef,
  setExhaustPlacing,
  toggleEngineTreeGroup,
  type EngineEntry,
} from '../../state/engineStore';
import { $allReactions } from '../../state/reactionStore';
import { status } from '../../state/statusStore';
import { openInspectorSheet } from '../shell/phone/phoneSheets';

/**
 * **The module tree** — the Engine navigator's middle block (design:
 * design-data-engine-modes.md §B3.2; foundation §8.4 item 2).
 *
 * Eight fixed groups over the pure {@link buildModuleTree} row model, so every caption, count
 * and issue dot is tested without a DOM. Selecting a row focuses the LEFT editor: this list
 * answers *what is the engine made of*, the left panel answers *what does this one module
 * say* (S18's split, the fix for v1's 1806-line scroll).
 *
 * The `data-surface="engine-tree"` stamp puts the panel in that hotkey scope, which is what
 * keeps ⌘C/⌘X/⌘V/⌘D/⌫/⇧⌘I working on the ENTITY selection while the list has focus
 * (foundation §11.1 list-surface mirrors).
 *
 * **Undo enrollment: NONE of its own.** Collapse state and focus are view state; every
 * mutation reachable here (`＋`, ⋮ Duplicate, ⋮ Remove, Auto-wire) is a discrete editorStore
 * action that pushes its own single step.
 */
export function ModuleTree() {
  const part = useStore($part);
  const isPhone = useIsPhone();
  const entry = useStore($activeEngineEntry);
  const findings = useStore($engineFindings);
  const active = useStore($activeModuleClamped);
  const reactions = useStore($allReactions);
  // Collapse state lives in the STORE, not in component state: a Data-mode "Open in Engine
  // mode →" jump reveals a group from outside React, and copying a nonce'd intent into
  // `useState` inside an effect is the pattern the project bans (AGENTS.md).
  const collapsed = useStore($engineTreeCollapsed);

  const reactionNames = new Map(reactions.map((r) => [r.id, r.name]));
  const tree = buildModuleTree(part, entry, findings, reactionNames);

  const items: TreeItem[] = [];
  for (const group of tree) {
    const isEmpty = group.rows.length === 0 && group.unwired.length === 0;
    // Empty groups render collapsed with `⓪` (design §B3.2 last bullet) but still render:
    // a group that vanished would take its `＋` button with it.
    const open = !collapsed.has(group.id) && !isEmpty;
    items.push({ type: 'group', key: `g|${group.id}`, group, open, isEmpty });
    if (!open) continue;
    for (const row of group.rows) items.push({ type: 'row', key: row.key, row, group });
    for (const row of group.unwired) items.push({ type: 'unwired', key: row.key, row });
  }

  const onSelectionChange = (selection: Selection) => {
    if (selection === 'all') return;
    const key = [...selection][0];
    if (key === undefined) return;
    for (const item of items) {
      if (item.type === 'row' && item.key === key) {
        focusModule(item.row.ref);
        // Phone: the two sheets share one slot, so picking a module hands off from the Panel
        // sheet (this tree) to the Inspector sheet (its editor) — design §B8.
        if (isPhone) openInspectorSheet();
      }
    }
  };

  return (
    <div data-surface="engine-tree" className="flex min-h-0 flex-1 flex-col">
      <GridList
        aria-label="Engine modules"
        selectionMode="single"
        selectionBehavior="replace"
        disabledBehavior="selection"
        items={items}
        selectedKeys={active ? new Set([moduleRefKey(active)]) : new Set<string>()}
        disabledKeys={items.flatMap((i) => (i.type === 'row' ? [] : [i.key]))}
        onSelectionChange={onSelectionChange}
        dependencies={[part, findings, collapsed, active, reactions, isPhone]}
        className="flex flex-col gap-0.5 overflow-auto outline-none"
      >
        {(item: TreeItem) => (
          <GridListItem id={item.key} density="dense" textValue={itemText(item)}>
            {item.type === 'group' ? (
              <GroupHeader
                group={item.group}
                open={item.open}
                isEmpty={item.isEmpty}
                entry={entry}
                onToggle={() => toggleEngineTreeGroup(item.group.id)}
              />
            ) : item.type === 'row' ? (
              <ModuleRow row={item.row} entry={entry} isPhone={isPhone} />
            ) : (
              <UnwiredRowView row={item.row} />
            )}
          </GridListItem>
        )}
      </GridList>
    </div>
  );
}

// ── row items ───────────────────────────────────────────────────────────────

type TreeItem =
  | { type: 'group'; key: string; group: ModuleTreeGroup; open: boolean; isEmpty: boolean }
  | { type: 'row'; key: string; row: ModuleTreeRow; group: ModuleTreeGroup }
  | { type: 'unwired'; key: string; row: UnwiredRow };

function itemText(item: TreeItem): string {
  if (item.type === 'group') return item.group.title;
  if (item.type === 'row') return item.row.label;
  return `unwired ${item.row.consumer.consumerId}`;
}

function IssueDot({ level }: { level: IssueLevel }) {
  if (level === null) return null;
  return (
    <AlertTriangle
      size={11}
      className={cn('shrink-0', level === 'block' ? 'text-danger' : 'text-warning')}
      aria-label={level === 'block' ? 'blocking issue' : 'warning'}
    />
  );
}

function GroupHeader({
  group,
  open,
  isEmpty,
  entry,
  onToggle,
}: {
  group: ModuleTreeGroup;
  open: boolean;
  isEmpty: boolean;
  entry: EngineEntry | null;
  onToggle: () => void;
}) {
  const count = group.rows.length;
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <Button
        iconOnly
        size="xs"
        variant="ghost"
        className="size-4 shrink-0"
        aria-label={open ? `Collapse ${group.title}` : `Expand ${group.title}`}
        isDisabled={isEmpty}
        onPress={onToggle}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </Button>
      <IssueDot level={group.issue} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wide text-fg-muted">
        {group.title}
      </span>
      {/* The structural chip, not a prose banner (§A5): these four groups live on
          `<PartGameData>` whatever scope is open. */}
      {group.partLevel && <PartScopeChip />}
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-subtle">
        {count === 0 ? '⓪' : count}
      </span>
      {group.id === 'wiring' && group.unwired.length > 0 && (
        <Button
          size="xs"
          variant="ghost"
          className="shrink-0 text-warning"
          onPress={() => {
            autoWireUnwiredConsumers();
            status('Wiring entries added for every unwired consumer', { severity: 'info' });
          }}
        >
          <Zap size={11} /> Auto-wire
        </Button>
      )}
      <AddButton group={group} entry={entry} />
    </div>
  );
}

/** The group `＋` (or `＋▾` where the group has two kinds to add — design §B3.2). */
function AddButton({ group, entry }: { group: ModuleTreeGroup; entry: EngineEntry | null }) {
  const part = useStore($part);
  const scopeIsPart = entry?.kind === 'part';
  const hasSolid = group.id === 'nozzles' && solidMotorCount(part, entry) > 0;

  if (group.id === 'nozzles' && hasSolid) {
    return (
      <AddMenu label="Add nozzle">
        <MenuItem density="dense" onAction={() => addModule('nozzle', entry)}>
          De Laval nozzle
        </MenuItem>
        <MenuItem density="dense" onAction={() => addModule('solidNozzle', entry)}>
          Solid motor nozzle
        </MenuItem>
      </AddMenu>
    );
  }
  if (group.id === 'controllers') {
    return (
      <AddMenu label="Add controller">
        <MenuItem density="dense" onAction={() => addModule('controller', entry, 'engine')}>
          Engine controller — throttle + staging
        </MenuItem>
        <MenuItem density="dense" onAction={() => addModule('controller', entry, 'thruster')}>
          RCS controller — pulsed
        </MenuItem>
      </AddMenu>
    );
  }
  if (group.id === 'solid') {
    return (
      <AddMenu label="Add solid hardware">
        <MenuItem density="dense" onAction={() => addModule('solidMotor', entry)}>
          Solid motor
        </MenuItem>
        <MenuItem density="dense" onAction={() => addModule('grain', entry)}>
          Grain segment
        </MenuItem>
        <MenuItem density="dense" onAction={() => addModule('solidNozzle', entry)}>
          Solid nozzle
        </MenuItem>
      </AddMenu>
    );
  }
  if (group.id === 'propellants') return <AddPropellantMenu />;
  if (group.id === 'gimbals') return <AddGimbalMenu entry={entry} />;
  const target = addGroupOf(group.id);
  return (
    <Button
      iconOnly
      size="xs"
      variant="ghost"
      className="size-4 shrink-0"
      aria-label={`Add to ${group.title}`}
      isDisabled={!entry && !scopeIsPart}
      onPress={() => addModule(target, entry)}
    >
      <Plus size={12} />
    </Button>
  );
}

/**
 * The Gimbals `＋` (design §B4.9, amended). A `<Gimbal>` is keyed to a placed SubPart
 * instance, which is why this group once had NO `＋` at all — but the tree renders empty
 * groups precisely so their `＋` survives, so a permanently inert `Gimbals ⓪` row read as
 * "this group is import-only". The instance is CONTEXT, not a question: the open engine
 * already names the placements a gimbal could go on ({@link gimbalCandidates}).
 *
 * - one candidate ⇒ a plain `＋` that just adds it (the single-placement common case);
 * - several ⇒ `＋▾` with **All N placements** first, because a template placed N times is a
 *   cluster and a cluster you want to vector you want to vector whole;
 * - none ⇒ still a `＋▾`, whose one disabled item NAMES the reason. Going grey is what
 *   caused the confusion; a menu that answers "why not" does not.
 *
 * Re-homing an existing gimbal stays the editor's `[Instance: … ▾]` chip — that chip IS the
 * picker, and this button never duplicates it.
 */
function AddGimbalMenu({ entry }: { entry: EngineEntry | null }) {
  const part = useStore($part);
  const { instanceIds, blocker } = gimbalCandidates(part, entry);

  const add = (ids: readonly string[]) => {
    const n = addGimbals(ids);
    if (n === 0) return;
    status(n === 1 ? `Gimbal added on ${ids[0]}` : `Gimbals added on ${n} placements`, {
      severity: 'info',
      action: { label: 'Undo', run: undo },
    });
  };

  if (instanceIds.length === 1) {
    return (
      <Button
        iconOnly
        size="xs"
        variant="ghost"
        className="size-4 shrink-0"
        aria-label={`Add a gimbal on ${instanceIds[0]}`}
        onPress={() => add(instanceIds)}
      >
        <Plus size={12} />
      </Button>
    );
  }

  return (
    <AddMenu label="Add gimbal">
      {blocker ? (
        <MenuItem density="dense" isDisabled>
          {GIMBAL_BLOCKER_TEXT[blocker]}
        </MenuItem>
      ) : (
        <>
          <MenuItem density="dense" onAction={() => add(instanceIds)}>
            All {instanceIds.length} placements
          </MenuItem>
          {instanceIds.map((id) => (
            <MenuItem key={id} density="dense" textValue={id} onAction={() => add([id])}>
              {id}
            </MenuItem>
          ))}
        </>
      )}
    </AddMenu>
  );
}

/** Why the Gimbals `＋` has nothing to offer, in the menu's own words. */
const GIMBAL_BLOCKER_TEXT: Readonly<Record<GimbalAddBlocker, string>> = {
  'no-scope': 'Open an engine first',
  'no-placements': 'This engine decorates no placement yet',
  'all-taken': 'Every placement here already has a gimbal',
};

/**
 * The custom-propellant `＋▾` (design §B4.10 "Creation paths"): clone a shipped propellant —
 * the workflow that actually produces a sane gas table — or start blank. Both are ONE undo
 * step and focus the new module (`propellantCreate`).
 */
function AddPropellantMenu() {
  return (
    <AddMenu label="Add propellant">
      <SubmenuTrigger>
        <MenuItem density="dense">Clone a shipped propellant…</MenuItem>
        <Popover className="max-h-72 w-64 overflow-auto">
          <CloneMenuBody />
        </Popover>
      </SubmenuTrigger>
      <MenuItem density="dense" onAction={() => addBlankPropellant($allReactions.get())}>
        Blank propellant
      </MenuItem>
    </AddMenu>
  );
}

/** Mounted by its Popover, so the catalog list is rebuilt (never frozen) on each open. */
function CloneMenuBody() {
  const catalog = useStore($allReactions);
  return (
    <Menu aria-label="Clone a shipped propellant">
      {catalog.map((reaction) => (
        <MenuItem
          key={reaction.id}
          density="dense"
          textValue={reaction.name}
          onAction={() => cloneShippedPropellant(reaction, catalog)}
        >
          {reaction.name}
        </MenuItem>
      ))}
    </Menu>
  );
}

function AddMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <MenuTrigger>
      <Button iconOnly size="xs" variant="ghost" className="size-4 shrink-0" aria-label={label}>
        <Plus size={12} />
      </Button>
      {/* The Popover MOUNTS the menu body, so its predicates re-evaluate on every open rather
          than freezing at their first-open value (React Compiler). */}
      <Popover className="w-64">
        <Menu aria-label={label}>{children}</Menu>
      </Popover>
    </MenuTrigger>
  );
}

function ModuleRow({
  row,
  entry,
  isPhone,
}: {
  row: ModuleTreeRow;
  entry: EngineEntry | null;
  isPhone: boolean;
}) {
  return (
    <div
      className="flex w-full min-w-0 items-center gap-1 pl-5"
      // Phone: the hand-off must fire even when the row is ALREADY the focused module —
      // `onSelectionChange` does not, so re-tapping the open module would do nothing (§B8).
      // The row's own buttons (⋮) keep their tap.
      //
      // `onClick`, NOT `onPointerUp` — and that is the whole difference between a working
      // module editor and none at all. This div sits INSIDE the GridListItem, so a pointerup
      // handler runs BEFORE react-aria's press completes: `openInspectorSheet()` sets
      // `$panelSheetOpen = false`, which unmounts the sheet's ModalOverlay and the GridList
      // inside it, so `onSelectionChange` → `focusModule()` never ran. Every engine module
      // (nozzle, combustor, controller, gimbal, rocket, solid motor, grain) was unreachable
      // by touch: the sheet swapped to the engine OVERVIEW and the row never even selected.
      // Click fires after the press, which is why Data mode's identical hand-off works
      // (`DataNavigator.tsx`'s row label).
      onClick={
        isPhone
          ? (event) => {
              if (!(event.target as Element).closest?.('button')) openInspectorSheet();
            }
          : undefined
      }
    >
      <IssueDot level={row.issue} />
      <span className="min-w-0 flex-1 truncate text-xs text-fg">{row.label}</span>
      <span className="shrink-0 truncate text-[11px] text-fg-subtle">{row.caption}</span>
      <RowMenu row={row} entry={entry} />
    </div>
  );
}

function RowMenu({ row, entry }: { row: ModuleTreeRow; entry: EngineEntry | null }) {
  return (
    <MenuTrigger>
      <Button
        iconOnly
        size="xs"
        variant="ghost"
        className="size-4 shrink-0"
        aria-label={`${row.label} options`}
      >
        <MoreVertical size={12} />
      </Button>
      <Popover className="w-56">
        <RowMenuBody row={row} entry={entry} />
      </Popover>
    </MenuTrigger>
  );
}

function RowMenuBody({ row, entry }: { row: ModuleTreeRow; entry: EngineEntry | null }) {
  const targets = useStore($resolvedNozzleTargets);
  const isNozzle = row.ref.group === 'nozzle' || row.ref.group === 'solidNozzle';
  const handle = isNozzle
    ? targets.find(
        (t) =>
          t.ref.index === row.ref.index &&
          t.ref.kind === (row.ref.group === 'nozzle' ? 'delaval' : 'solid') &&
          t.ref.channel === 'physics',
      )
    : undefined;
  const templateId = entry?.kind === 'subpart' ? entry.templateId : null;

  return (
    <Menu aria-label={`${row.label} options`}>
      {row.canDuplicate && (
        <MenuItem
          density="dense"
          onAction={() => {
            duplicateEngineModule(row.ref, templateId);
            status(`Duplicated ${row.label}`, { severity: 'info' });
          }}
        >
          Duplicate
        </MenuItem>
      )}
      {handle && (
        <MenuItem
          density="dense"
          onAction={() => {
            setActiveNozzleRef(handle.ref);
            setExhaustPlacing(true);
          }}
        >
          Show exhaust handle
        </MenuItem>
      )}
      <MenuItem density="dense" onAction={() => void navigator.clipboard?.writeText(row.label)}>
        Copy id
      </MenuItem>
      <MenuItem
        density="dense"
        variant="danger"
        onAction={() => {
          removeModule(row.ref, entry);
          // Foundation §14.3: a ≤5-entity removal that undo can restore needs no confirm —
          // it needs a way BACK, which the status action is.
          status(`Removed ${row.label}`, {
            severity: 'info',
            action: { label: 'Undo', run: undo },
          });
        }}
      >
        Remove
      </MenuItem>
    </Menu>
  );
}

function UnwiredRowView({ row }: { row: UnwiredRow }) {
  return (
    <button
      type="button"
      className="flex w-full min-w-0 cursor-pointer items-center gap-1 pl-5 text-left"
      onClick={() => {
        addConsumerFeedWiring(row.consumer.consumerId, row.consumer.subPartInstanceId);
        focusModule({
          group: 'wiring',
          scope: 'part',
          index: $part.get().gameData.consumerFeedWiring.length - 1,
        });
      }}
    >
      <AlertTriangle size={11} className="shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate text-xs text-warning">
        unwired: {row.consumer.consumerId}
      </span>
      <span className="shrink-0 text-[11px] text-fg-subtle">wire it →</span>
    </button>
  );
}
