import { fuzzyAny } from '../fuzzyMatch';
import { sectionsFor, type DataScope, type DataSectionId } from '../../state/dataModeStore';
import type { GameDataFinding } from '../../state/gameDataFindings';
import type { EditingPart, PartGameData, SubPartGameData } from '../../ksa/types';
import type { EntityKind } from '../../state/editorStore';

/**
 * The **Data Navigator's row model** — pure, so the whole of design §A3's counting logic is
 * unit-testable without a DOM (design: design-data-engine-modes.md §A3; foundation §8.3).
 *
 * Three groups, in render order: the pinned Part root, one row per SubPart TEMPLATE with at
 * least one placement, and the "not data-capable" inventory (connectors, colliders, IVA
 * seats, part-level lights, kittens) the brief requires as a disabled-style list.
 *
 * The count recipes are ported from the v1 Part Data dialog's badges
 * (`src/ui/PartDataDialog.tsx:46-62`) so nothing changes meaning on the way over.
 */

/** The worst finding severity affecting a row/section, or null when clean. */
export type IssueLevel = 'block' | 'warn' | null;

/** A section child row under the Part root or a template row. */
export interface DataNavSection {
  sectionId: DataSectionId;
  label: string;
  /** Items in the section; 0 renders no badge. */
  count: number;
  issue: IssueLevel;
}

/** A content badge on a template row (design §A3 "⛁ tanks, 💡 lights, ☀ solar, 🚀 engine"). */
export interface DataNavBadge {
  icon: string;
  /** Accessible wording, e.g. "2 tanks". */
  label: string;
  count: number;
}

export interface DataNavPartRow {
  key: 'part';
  /** `Part — "Rover"` style label body: the display name if set, else the Part Id. */
  label: string;
  sections: DataNavSection[];
  issue: IssueLevel;
}

export interface DataNavTemplateRow {
  key: string;
  templateId: string;
  placementCount: number;
  /** Every placement of the template — what a hover flashes and the chip selects. */
  instanceIds: string[];
  badges: DataNavBadge[];
  /** True when the template carries no authored data at all ⇒ the "＋ add data" row. */
  empty: boolean;
  sections: DataNavSection[];
  issue: IssueLevel;
}

export interface DataNavEntityRow {
  key: string;
  kind: Exclude<EntityKind, 'subpart'>;
  id: string;
  label: string;
  /** Tooltip body: why it has no data, and where it IS edited. */
  explainer: string;
}

export interface DataNavModel {
  part: DataNavPartRow;
  templates: DataNavTemplateRow[];
  nonCapable: DataNavEntityRow[];
  /** Placements exist at all — drives the navigator's empty state. */
  hasPlacements: boolean;
}

const NON_CAPABLE_EXPLAINER: Record<DataNavEntityRow['kind'], string> = {
  connector: 'Connectors are Build entities — flags and capabilities are edited on selection.',
  collider: 'Colliders are Build entities — shape and size are edited on selection.',
  ivaSeat: 'IVA seats are Build entities — position and aim are edited on selection.',
  light: 'A part-level light is a Build entity. SubPart-owned lights live on their template row.',
  kitten: 'Kittens are editor-only scale references and are never exported.',
};

/** Worst severity among the findings a predicate accepts. */
function worst(findings: readonly GameDataFinding[], accept: (f: GameDataFinding) => boolean) {
  let level: IssueLevel = null;
  for (const finding of findings) {
    if (!accept(finding)) continue;
    if (finding.severity === 'block') return 'block';
    level = 'warn';
  }
  return level;
}

function sameScope(a: DataScope, b: DataScope): boolean {
  return a.kind === 'part'
    ? b.kind === 'part'
    : b.kind === 'template' && a.templateId === b.templateId;
}

/** `passthrough` counts nodes, not bytes: children + a synthetic row for the attrs. */
function passthroughCount(data: PartGameData | SubPartGameData): number {
  const extras = 'customMassExtras' in data ? data.customMassExtras.length : 0;
  return data.unknownChildren.length + (Object.keys(data.unknownAttrs).length > 0 ? 1 : 0) + extras;
}

/** Part-level engine hardware: the solid trio + the gas-generator trio (design §A4.1 Advanced). */
function partAdvancedCount(g: PartGameData): number {
  return (
    g.solidMotors.length +
    g.solidNozzles.length +
    g.solidGrainSegments.length +
    g.rockets.length +
    g.combustors.length +
    g.nozzles.length
  );
}

/** A template's engine modules — the thrust-chamber count its 🚀 badge shows. */
function templateEngineCount(spd: SubPartGameData | undefined): number {
  if (!spd) return 0;
  return (
    spd.combustors.length +
    spd.nozzles.length +
    spd.rockets.length +
    spd.solidMotors.length +
    spd.solidNozzles.length +
    spd.solidGrainSegments.length
  );
}

function sectionRows(
  scope: DataScope,
  counts: Partial<Record<DataSectionId, number>>,
  findings: readonly GameDataFinding[],
): DataNavSection[] {
  return sectionsFor(scope).map((def) => ({
    sectionId: def.id,
    label: def.label,
    count: counts[def.id] ?? 0,
    issue: worst(
      findings,
      (f) => f.target.sectionId === def.id && sameScope(f.target.scope, scope),
    ),
  }));
}

/**
 * Builds the navigator's rows for `part`, dotted with `findings` and filtered by `query`.
 *
 * The Part root is NEVER filtered out (design §A3) — it is the scope you always need a way
 * back to. Templates and non-capable rows filter on their id/label with the shared fuzzy
 * subsequence matcher, plus the names of their own sections, so typing "tank" finds the
 * template whose Tanks section is what you meant.
 */
export function buildDataNavigator(
  part: EditingPart,
  findings: readonly GameDataFinding[],
  query = '',
): DataNavModel {
  const g = part.gameData;
  const partScope: DataScope = { kind: 'part' };

  const partRow: DataNavPartRow = {
    key: 'part',
    label: g.displayName.trim() || part.partId.trim() || '(unnamed part)',
    sections: sectionRows(
      partScope,
      {
        tanks: g.tanks.length,
        power:
          g.batteries.length +
          g.generators.length +
          g.solarPanels.length +
          (g.powerConsumer ? 1 : 0),
        coupling: (g.decoupler ? 1 : 0) + (g.dockingPort ? 1 : 0) + (g.evaDoor ? 1 : 0),
        wiring: g.rocketControllers.length + g.consumerFeedWiring.length + g.gimbals.length,
        advanced: partAdvancedCount(g),
        passthrough: passthroughCount(g),
      },
      findings,
    ),
    issue: worst(findings, (f) => sameScope(f.target.scope, partScope)),
  };

  // One row per TEMPLATE with ≥1 placement, in first-placement order. Glass templates are
  // included: every SubPart template is data-capable (census §1.2).
  const order: string[] = [];
  const instancesOf = new Map<string, string[]>();
  for (const placement of part.placements) {
    const list = instancesOf.get(placement.subPartTemplateId);
    if (list) list.push(placement.instanceId);
    else {
      order.push(placement.subPartTemplateId);
      instancesOf.set(placement.subPartTemplateId, [placement.instanceId]);
    }
  }

  const templates: DataNavTemplateRow[] = order.map((templateId) => {
    const scope: DataScope = { kind: 'template', templateId };
    const spd = part.subPartGameData.find((s) => s.subPartTemplateId === templateId);
    const lights = part.lights.filter((l) => l.ownerTemplateId === templateId).length;
    const tanks = spd?.tanks.length ?? 0;
    const solar = spd?.solarPanels.length ?? 0;
    const engine = templateEngineCount(spd);
    const passthrough = spd ? passthroughCount(spd) : 0;

    const badges: DataNavBadge[] = [];
    if (tanks > 0) badges.push({ icon: '⛁', label: `${tanks} tanks`, count: tanks });
    if (lights > 0) badges.push({ icon: '💡', label: `${lights} lights`, count: lights });
    if (solar > 0) badges.push({ icon: '☀', label: `${solar} solar panels`, count: solar });
    if (engine > 0) badges.push({ icon: '🚀', label: `${engine} engine modules`, count: engine });

    return {
      key: `template:${templateId}`,
      templateId,
      placementCount: instancesOf.get(templateId)!.length,
      instanceIds: instancesOf.get(templateId)!,
      badges,
      empty: tanks + lights + solar + engine + passthrough === 0,
      sections: sectionRows(scope, { tanks, lights, solar, engine, passthrough }, findings),
      issue: worst(findings, (f) => sameScope(f.target.scope, scope)),
    };
  });

  const nonCapable: DataNavEntityRow[] = [
    ...part.connectors.map(
      (c): DataNavEntityRow => ({
        key: `connector:${c.id}`,
        kind: 'connector',
        id: c.id,
        label: c.id,
        explainer: NON_CAPABLE_EXPLAINER.connector,
      }),
    ),
    ...part.colliders.map(
      (c): DataNavEntityRow => ({
        key: `collider:${c.id}`,
        kind: 'collider',
        id: c.id,
        label: `${c.id} (${c.shape})`,
        explainer: NON_CAPABLE_EXPLAINER.collider,
      }),
    ),
    ...part.ivaSeats.map(
      (s, i): DataNavEntityRow => ({
        key: `ivaSeat:${s.id}`,
        kind: 'ivaSeat',
        id: s.id,
        // Seats have no name; their ORDINAL is the identity (and KSA's C-cycle order).
        label: `Seat ${i + 1}`,
        explainer: NON_CAPABLE_EXPLAINER.ivaSeat,
      }),
    ),
    ...part.lights
      .filter((l) => l.ownerTemplateId === null)
      .map(
        (l): DataNavEntityRow => ({
          key: `light:${l.id}`,
          kind: 'light',
          id: l.id,
          label: `${l.id} (part-level)`,
          explainer: NON_CAPABLE_EXPLAINER.light,
        }),
      ),
    ...part.kittens.map(
      (k): DataNavEntityRow => ({
        key: `kitten:${k.id}`,
        kind: 'kitten',
        id: k.id,
        label: k.id,
        explainer: NON_CAPABLE_EXPLAINER.kitten,
      }),
    ),
  ];

  return {
    part: partRow,
    templates: templates.filter((row) =>
      fuzzyAny(query, row.templateId, ...row.sections.map((s) => s.label)),
    ),
    nonCapable: nonCapable.filter((row) => fuzzyAny(query, row.label, row.id)),
    hasPlacements: part.placements.length > 0,
  };
}
