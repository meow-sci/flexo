import type { EditingPart } from '../../ksa/types';
import type { EngineDefineKind } from '../../state/engineStore';

/**
 * **The define-new engine flow's data** (design: design-data-engine-modes.md §B3.1, D12/D13)
 * — the four kinds with the one-line descriptions that make the choice, and the candidate
 * targets. Split out of `DefineEngineMenu.tsx` so that file exports components only (the
 * fast-refresh rule) and so the target recipe is testable without a DOM.
 */

export interface EngineKindSpec {
  kind: EngineDefineKind;
  title: string;
  /** The inline description, verbatim from the design's menu copy. */
  description: string;
  /** Part-level is only meaningful for RCS — the stock MMU pattern (§B3.1). */
  allowsPartLevel: boolean;
  /** True for the legacy preset, which the menu separates and labels rather than hides. */
  legacy: boolean;
}

export const ENGINE_KINDS: readonly EngineKindSpec[] = [
  {
    kind: 'liquid',
    title: 'Liquid rocket',
    description: 'combustor + De Laval nozzle + rocket + controller',
    allowsPartLevel: false,
    legacy: false,
  },
  {
    kind: 'rcs',
    title: 'RCS thruster',
    description: 'Service-plumbed pulsed combustor + nozzle + RCS controller',
    allowsPartLevel: true,
    legacy: false,
  },
  {
    kind: 'solid',
    title: 'Solid motor',
    description: 'real <SolidMotor> + grain segment + solid nozzle + rocket + controller',
    allowsPartLevel: false,
    legacy: false,
  },
  {
    kind: 'srb',
    title: 'SRB preset (legacy)',
    description:
      'approximate: fixed-thrust liquid fake with sealed tank; no burn curve, can shut down. Prefer "Solid motor".',
    allowsPartLevel: false,
    legacy: true,
  },
];

export function engineKindSpec(kind: EngineDefineKind): EngineKindSpec {
  return ENGINE_KINDS.find((k) => k.kind === kind)!;
}

/** One candidate template: not an engine yet, with the placements it could be defined on. */
export interface DefineTarget {
  templateId: string;
  instanceIds: string[];
}

/** The part-level row's key — the same `'\0…'` sentinel idiom the scope select uses. */
export const PART_TARGET_KEY = '\0part';

/**
 * Every SubPart template that carries no engine hardware yet, ONE ROW EACH (decision D13).
 * v1 listed one row per placement, which implied per-instance engines that do not exist; the
 * placements come along so the row can offer the controller's instance sub-pick.
 */
export function defineTargetsOf(
  part: EditingPart,
  engineTemplateIds: ReadonlySet<string>,
): DefineTarget[] {
  const byTemplate = new Map<string, string[]>();
  for (const placement of part.placements) {
    if (engineTemplateIds.has(placement.subPartTemplateId)) continue;
    const list = byTemplate.get(placement.subPartTemplateId);
    if (list) list.push(placement.instanceId);
    else byTemplate.set(placement.subPartTemplateId, [placement.instanceId]);
  }
  return [...byTemplate].map(([templateId, instanceIds]) => ({ templateId, instanceIds }));
}
