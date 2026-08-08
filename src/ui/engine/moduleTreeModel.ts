import type { EditingPart, SubPartGameData } from '../../ksa/types';
import type { EngineIssue } from '../../ksa/engineValidation';
import type { ConsumerOption } from '../../state/feedTargets';
import { unwiredConsumersOf } from '../../state/feedTargets';
import {
  engineModuleCount,
  moduleRefForIssue,
  moduleRefKey,
  PART_ONLY_MODULE_GROUPS,
  type EngineEntry,
  type EngineModuleGroup,
  type EngineModuleRef,
} from '../../state/engineStore';

/**
 * **The module tree's row model** (design: design-data-engine-modes.md §B3.2) — pure, so
 * every group order, caption recipe and issue-dot rule is tested without a DOM, the way
 * `dataNavigatorModel` is for Data mode.
 *
 * The tree answers *what is this engine made of?* for ONE open scope. Its shape is fixed:
 * eight groups in one order, never sorted or filtered, so the same module sits in the same
 * place every time you come back to it.
 *
 * **Four groups are always part-level** regardless of the open scope — controllers, feed
 * wiring, gimbals and custom propellants. KSA authors all four on `<PartGameData>` only, so
 * a SubPart scope shows them too, wearing the `[Part]` chip that says why (§A5's chip
 * system, not a prose banner).
 */

export type IssueLevel = 'block' | 'warn' | null;

/** The eight fixed groups. `solid` folds the motor + grain + solid-nozzle lists into one. */
export type ModuleTreeGroupId =
  | 'combustors'
  | 'nozzles'
  | 'solid'
  | 'rockets'
  | 'controllers'
  | 'wiring'
  | 'gimbals'
  | 'propellants';

export interface ModuleTreeRow {
  key: string;
  ref: EngineModuleRef;
  /** The module's own id (or a synthetic label for a wiring/gimbal row). */
  label: string;
  /** The one-line summary under the label (design §B3.2 row spec). */
  caption: string;
  issue: IssueLevel;
  /** Duplicate is offered for every group except wiring + gimbals (see `duplicateEngineModule`). */
  canDuplicate: boolean;
}

/** A `⚠ unwired: <consumer>` row — a consumer that NEEDS a wiring entry and has none. */
export interface UnwiredRow {
  key: string;
  consumer: ConsumerOption;
}

export interface ModuleTreeGroup {
  id: ModuleTreeGroupId;
  title: string;
  /** True when the group's contents live on `<PartGameData>` whatever the open scope is. */
  partLevel: boolean;
  rows: ModuleTreeRow[];
  /** Feed wiring only: the synthetic unwired-consumer rows (§B3.2). */
  unwired: UnwiredRow[];
  /** The worst issue among the group's rows — the collapsed header's dot. */
  issue: IssueLevel;
}

const GROUP_TITLES: Readonly<Record<ModuleTreeGroupId, string>> = {
  combustors: 'Combustors',
  nozzles: 'Nozzles',
  solid: 'Solid motor',
  rockets: 'Rockets',
  controllers: 'Controllers',
  wiring: 'Feed wiring',
  gimbals: 'Gimbals',
  propellants: 'Custom propellants',
};

/**
 * The singular name of one module — the left editor's header title and the summary card's
 * count rows. Kept beside the group titles so the two spellings can never drift.
 */
export const MODULE_GROUP_LABEL: Readonly<Record<EngineModuleGroup, string>> = {
  combustor: 'Combustor',
  nozzle: 'Nozzle',
  solidMotor: 'Solid motor',
  grain: 'Grain segment',
  solidNozzle: 'Solid nozzle',
  rocket: 'Rocket',
  controller: 'Controller',
  wiring: 'Feed wiring',
  gimbal: 'Gimbal',
  propellant: 'Custom propellant',
};

/** Which module groups each tree group draws its rows from, in row order. */
const GROUP_SOURCES: Readonly<Record<ModuleTreeGroupId, readonly EngineModuleGroup[]>> = {
  combustors: ['combustor'],
  nozzles: ['nozzle'],
  solid: ['solidMotor', 'grain', 'solidNozzle'],
  rockets: ['rocket'],
  controllers: ['controller'],
  wiring: ['wiring'],
  gimbals: ['gimbal'],
  propellants: ['propellant'],
};

/** The fixed render order (design §B3.2 — "groups in fixed order"). */
export const MODULE_TREE_GROUP_ORDER: readonly ModuleTreeGroupId[] = [
  'combustors',
  'nozzles',
  'solid',
  'rockets',
  'controllers',
  'wiring',
  'gimbals',
  'propellants',
];

/** The worse of two levels (`block` beats `warn` beats none). */
function worse(a: IssueLevel, b: IssueLevel): IssueLevel {
  if (a === 'block' || b === 'block') return 'block';
  return a === 'warn' || b === 'warn' ? 'warn' : null;
}

/** A number for a caption: trimmed to 3 decimals, without a trailing `.000`. */
function num(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '—';
}

/** The `<SubPartGameData>` of the open scope, or null (part scope / unknown template). */
function scopeData(part: EditingPart, entry: EngineEntry | null): SubPartGameData | null {
  if (entry?.kind !== 'subpart') return null;
  return part.subPartGameData.find((s) => s.subPartTemplateId === entry.templateId) ?? null;
}

/**
 * One caption per group, per design §B3.2's row spec. `reactionNames` is injected (not read
 * from `reactionStore`) so the model stays pure and testable, and so a missing catalog simply
 * degrades to the raw reaction id.
 */
function captionFor(
  group: EngineModuleGroup,
  module: Record<string, unknown>,
  reactionNames: ReadonlyMap<string, string>,
): string {
  const reaction = (id: unknown) =>
    typeof id === 'string' ? (reactionNames.get(id) ?? (id || '(no propellant)')) : '';
  switch (group) {
    case 'combustor':
    case 'solidMotor':
      return reaction(module.reactionId);
    case 'nozzle':
    case 'solidNozzle':
      return `⌀${num(module.exitDiameterM as number)} m`;
    case 'grain':
      return `⌀${num((module.outerRadiusM as number) * 2)} m × ${num(module.lengthM as number)} m`;
    case 'rocket': {
      const core = (module.core as { id: string } | undefined)?.id;
      return core ? `core: ${core}` : 'no core';
    }
    case 'controller':
      return module.kind === 'thruster' ? 'RCS (pulsed)' : 'engine (throttle + staging)';
    case 'wiring': {
      const consumer = (module.consumerId as string) || '(no consumer)';
      const feeds = module.feeds as { kind: string; containerId?: string; connectorId?: string }[];
      const first = feeds[0];
      const target = !first
        ? 'nothing'
        : first.kind === 'container'
          ? (first.containerId ?? '?')
          : first.kind === 'connector'
            ? (first.connectorId ?? '?')
            : 'Parent';
      return `${consumer} ← ${target}${feeds.length > 1 ? ` +${feeds.length - 1}` : ''}`;
    }
    case 'gimbal': {
      const y = num(module.maxAngleYDeg as number);
      const z = num(module.maxAngleZDeg as number);
      return `${y}° / ${z}°`;
    }
    default:
      return String(module.category ?? '');
  }
}

/** The row LABEL: a module id where there is one, else what identifies the row instead. */
function labelFor(group: EngineModuleGroup, module: Record<string, unknown>): string {
  if (group === 'gimbal') return String(module.subPartInstanceId ?? '(no instance)');
  if (group === 'wiring') return String(module.consumerId || '(unassigned)');
  if (group === 'propellant') return String(module.name || module.id || '(unnamed)');
  return String(module.id ?? '');
}

/** The live list a `(group, scope)` pair addresses. */
function listFor(
  part: EditingPart,
  entry: EngineEntry | null,
  group: EngineModuleGroup,
): Record<string, unknown>[] {
  const g = part.gameData;
  switch (group) {
    case 'controller':
      return g.rocketControllers as unknown as Record<string, unknown>[];
    case 'wiring':
      return g.consumerFeedWiring as unknown as Record<string, unknown>[];
    case 'gimbal':
      return g.gimbals as unknown as Record<string, unknown>[];
    case 'propellant':
      return part.customReactions as unknown as Record<string, unknown>[];
    default:
      break;
  }
  const owner = entry?.kind === 'part' ? g : scopeData(part, entry);
  if (!owner) return [];
  switch (group) {
    case 'combustor':
      return owner.combustors as unknown as Record<string, unknown>[];
    case 'nozzle':
      return owner.nozzles as unknown as Record<string, unknown>[];
    case 'solidMotor':
      return owner.solidMotors as unknown as Record<string, unknown>[];
    case 'grain':
      return owner.solidGrainSegments as unknown as Record<string, unknown>[];
    case 'solidNozzle':
      return owner.solidNozzles as unknown as Record<string, unknown>[];
    default:
      return owner.rockets as unknown as Record<string, unknown>[];
  }
}

/** The scope a group's rows are indexed within — part-only groups are always `'part'`. */
export function scopeOfGroup(group: EngineModuleGroup, entry: EngineEntry | null): 'sub' | 'part' {
  if (PART_ONLY_MODULE_GROUPS.includes(group)) return 'part';
  return entry?.kind === 'part' ? 'part' : 'sub';
}

/**
 * Builds the whole tree for one open scope. Groups always render — an empty one shows `⓪`
 * and collapses (design §B3.2), because a group that disappears when empty is a group the
 * user cannot use its `＋` button on.
 */
export function buildModuleTree(
  part: EditingPart,
  entry: EngineEntry | null,
  findings: readonly EngineIssue[] = [],
  reactionNames: ReadonlyMap<string, string> = new Map(),
): ModuleTreeGroup[] {
  // Issue dots, keyed by the module each finding addresses. `moduleRefForIssue` is the ONE
  // mapping, shared with the ISSUES section's click-through, so a dot and a jump can never
  // disagree about which row an issue belongs to.
  const dots = new Map<string, IssueLevel>();
  for (const issue of findings) {
    const target = moduleRefForIssue(issue, part);
    if (!target) continue;
    const key = moduleRefKey(target.module);
    dots.set(key, worse(dots.get(key) ?? null, issue.severity));
  }

  const unwired = unwiredConsumersOf(part);

  return MODULE_TREE_GROUP_ORDER.map((id): ModuleTreeGroup => {
    const rows: ModuleTreeRow[] = [];
    for (const group of GROUP_SOURCES[id]) {
      const scope = scopeOfGroup(group, entry);
      const list = listFor(part, entry, group);
      list.forEach((module, index) => {
        const ref: EngineModuleRef = { group, scope, index };
        const key = moduleRefKey(ref);
        rows.push({
          key,
          ref,
          label: labelFor(group, module),
          caption: captionFor(group, module, reactionNames),
          issue: dots.get(key) ?? null,
          canDuplicate: group !== 'wiring' && group !== 'gimbal',
        });
      });
    }
    const groupUnwired: UnwiredRow[] =
      id === 'wiring'
        ? unwired.map((consumer) => ({
            key: `unwired|${consumer.consumerId}|${consumer.subPartInstanceId ?? ''}`,
            consumer,
          }))
        : [];
    return {
      id,
      title: GROUP_TITLES[id],
      partLevel: GROUP_SOURCES[id].every((g) => PART_ONLY_MODULE_GROUPS.includes(g)),
      rows,
      unwired: groupUnwired,
      issue: rows.reduce<IssueLevel>(
        (level, row) => worse(level, row.issue),
        groupUnwired.length > 0 ? 'warn' : null,
      ),
    };
  });
}

/** The built row for one module ref, or null — the left editor's header reads its label here. */
export function findModuleRow(
  groups: readonly ModuleTreeGroup[],
  ref: EngineModuleRef,
): ModuleTreeRow | null {
  const key = moduleRefKey(ref);
  for (const group of groups) {
    const row = group.rows.find((r) => r.key === key);
    if (row) return row;
  }
  return null;
}

/** The `＋` button's target group for a tree group (the first source that can be added to). */
export function addGroupOf(id: ModuleTreeGroupId): EngineModuleGroup {
  return GROUP_SOURCES[id][0];
}

/** Why the Gimbals `＋` has nothing to offer — the menu says this instead of going grey. */
export type GimbalAddBlocker = 'no-scope' | 'no-placements' | 'all-taken';

/**
 * What the Gimbals `＋` can add to, for the OPEN engine scope. A `<Gimbal>` is keyed to one
 * placed SubPart instance, so the candidates are placements that do not already have one:
 * the open template's placements at a SubPart scope, every placement at the part scope
 * (a part-level RCS/gas-generator engine names no template of its own).
 *
 * Returning a `blocker` rather than an empty list is the point — the tree's Gimbals group
 * renders even when empty, so a `＋` that could only ever go grey is what taught people the
 * group was read-only. The menu names the reason instead.
 */
export function gimbalCandidates(
  part: EditingPart,
  entry: EngineEntry | null,
): { instanceIds: string[]; blocker: GimbalAddBlocker | null } {
  if (!entry) return { instanceIds: [], blocker: 'no-scope' };
  const scoped =
    entry.kind === 'part'
      ? part.placements
      : part.placements.filter((p) => p.subPartTemplateId === entry.templateId);
  if (scoped.length === 0) return { instanceIds: [], blocker: 'no-placements' };
  const taken = new Set(part.gameData.gimbals.map((g) => g.subPartInstanceId));
  const instanceIds = scoped.map((p) => p.instanceId).filter((id) => !taken.has(id));
  return { instanceIds, blocker: instanceIds.length === 0 ? 'all-taken' : null };
}

/** Total module count in the open scope, for the summary card + the scope select caption. */
export function totalModuleCount(part: EditingPart, entry: EngineEntry | null): number {
  let total = 0;
  for (const groups of Object.values(GROUP_SOURCES)) {
    for (const group of groups) {
      total += engineModuleCount(part, entry, group, scopeOfGroup(group, entry));
    }
  }
  return total;
}
