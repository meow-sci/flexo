import { ENTITY_ONLY_LAYER_IDS, type EditingPart, type Layer } from '../ksa/types';
import { layerViewState, type LayerViewState } from '../state/layerStore';
import { fuzzyAny } from './fuzzyMatch';

/**
 * The row model behind {@link import('./SubPartSetGrid').SubPartSetGrid} — foundation §10.11's
 * shared SubPart Set Picker (design-animation-mode.md §7.3).
 *
 * Pure: no react, no stores, no three. Everything it needs — the document, the layer view
 * map, the current ownership map, the query and the filter — is passed in, which is what makes
 * the layer partition, the filter semantics and the tri-state header math unit-testable.
 *
 * Two deliberate differences from the Build Outliner's tree:
 * - **SubParts only.** Connectors and kittens can never be joint members (a real KSA
 *   limitation, verified in the decomp); the host renders them in its own inert
 *   "Not animatable" section instead.
 * - **Unlisted layers are INCLUDED.** The picker must be able to see everything; `listed` is
 *   an Outliner display preference, not a statement about what may be animated (§7.3).
 */

/** What a row's ownership chip says: which joint (if any) already drives this SubPart. */
export interface SubPartOwner {
  jointId: string;
  jointName: string;
}

export interface SubPartSetRow {
  instanceId: string;
  /** Trailing `_Subpart_Foo` segment of the template id — what a user actually reads. */
  templateCaption: string;
  templateId: string;
  owner: SubPartOwner | null;
  /** Another clip already drives this SubPart — the amber `⚠ also in "<clip>"` chip. */
  conflictClip: string | null;
  /** Locked layer: the row is inert (react-aria disabled) with a tooltip. */
  disabled: boolean;
  /** Hidden layer: dimmed 40%, but still assignable (the section eye un-hides in one click). */
  dimmed: boolean;
}

export interface SubPartSetSection {
  layer: Layer;
  view: LayerViewState;
  /** Rows surviving the search + filter. */
  rows: SubPartSetRow[];
  /** SubParts on the layer before filtering — the header's row count. */
  total: number;
  /** How many of {@link total} are members of ANY joint of the active clip. */
  assigned: number;
}

/** The four filter chips (design §7.2). */
export type SubPartSetFilter = 'all' | 'unassigned' | 'this' | 'other';

/** Trailing `_Subpart_Foo` segment of a template id — mirrors the Outliner's caption rule. */
export function templateCaption(templateId: string): string {
  return templateId.split('_').pop() || templateId;
}

export interface SubPartSetModelInput {
  part: EditingPart;
  layerView: Record<string, LayerViewState>;
  /** instanceId → the joint of the ACTIVE clip that drives it. */
  ownership: ReadonlyMap<string, SubPartOwner>;
  /** instanceId → the name of ANOTHER clip that also drives it. */
  conflictClips: ReadonlyMap<string, string>;
  targetJointId: string | null;
  search: string;
  filter: SubPartSetFilter;
}

/** Does a row survive the filter chip? */
function passesFilter(
  owner: SubPartOwner | null,
  filter: SubPartSetFilter,
  targetJointId: string | null,
): boolean {
  switch (filter) {
    case 'unassigned':
      return owner === null;
    case 'this':
      return owner !== null && owner.jointId === targetJointId;
    case 'other':
      return owner !== null && owner.jointId !== targetJointId;
    default:
      return true;
  }
}

/**
 * Layer sections in display order (ordinary layers first, the pinned entity-only built-ins
 * after — they hold no SubParts, so they drop out anyway). Layers with no SubParts at all are
 * omitted; a layer whose rows are all filtered away keeps its header so its eye and counts
 * stay reachable.
 */
export function buildSubPartSetSections(input: SubPartSetModelInput): SubPartSetSection[] {
  const { part, layerView, ownership, conflictClips, targetJointId, search, filter } = input;
  const ordinary = part.layers.filter((l) => !ENTITY_ONLY_LAYER_IDS.includes(l.id));
  const pinned = part.layers.filter((l) => ENTITY_ONLY_LAYER_IDS.includes(l.id));

  const sections: SubPartSetSection[] = [];
  for (const layer of [...ordinary, ...pinned]) {
    const view = layerViewState(layerView, layer.id);
    const placements = part.placements.filter((p) => p.layerId === layer.id);
    if (placements.length === 0) continue;

    const rows: SubPartSetRow[] = [];
    let assigned = 0;
    for (const placement of placements) {
      const owner = ownership.get(placement.instanceId) ?? null;
      if (owner) assigned++;
      if (!passesFilter(owner, filter, targetJointId)) continue;
      const caption = templateCaption(placement.subPartTemplateId);
      if (
        !fuzzyAny(
          search,
          placement.instanceId,
          placement.subPartTemplateId,
          caption,
          layer.name,
          owner?.jointName ?? '',
        )
      ) {
        continue;
      }
      rows.push({
        instanceId: placement.instanceId,
        templateCaption: caption,
        templateId: placement.subPartTemplateId,
        owner,
        conflictClip: conflictClips.get(placement.instanceId) ?? null,
        disabled: view.locked,
        dimmed: !view.visible,
      });
    }
    sections.push({ layer, view, rows, total: placements.length, assigned });
  }
  return sections;
}

/** Every ENABLED row currently rendered, in display order — the ⇧-range's universe. */
export function enabledRowIds(sections: readonly SubPartSetSection[]): string[] {
  return sections.flatMap((s) => s.rows.filter((r) => !r.disabled).map((r) => r.instanceId));
}

/** A section header's `[□ all]` tri-state over its ENABLED rows. */
export function sectionCheckState(
  section: SubPartSetSection,
  checked: ReadonlySet<string>,
): { checked: boolean; indeterminate: boolean; enabledIds: string[] } {
  const enabledIds = section.rows.filter((r) => !r.disabled).map((r) => r.instanceId);
  const hit = enabledIds.filter((id) => checked.has(id)).length;
  return {
    checked: enabledIds.length > 0 && hit === enabledIds.length,
    indeterminate: hit > 0 && hit < enabledIds.length,
    enabledIds,
  };
}
