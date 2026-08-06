/**
 * **The unified export pre-flight issue model** (design:
 * `plans/flexo_v2/design/design-projects-export.md` §6.1 "Validation"; census:
 * `analysis/flexo-v2-feature-census/export-integration.md` §1.1.a + pain #9).
 *
 * v1's export dialog reported two unrelated things in two unrelated shapes: an ad-hoc trio
 * of strings (`validate()` — empty Part Id / duplicate instance ids / no SubParts) rendered
 * as one amber box, and the four structured validators concatenated into three severity
 * boxes. Styling and copy could — and did — drift apart. This module is the ONE model both
 * feed, so the dialog renders severities, not sources.
 *
 * **The four validators are untouched.** They are shared with the Data/Engine findings
 * surfaces (`gameDataFindings`, `EngineIssuesPanel`'s successor) and each one is a
 * game-contract statement about what KSA does at load; this module maps their output 1:1 —
 * same severity, same message, verbatim — and adds only the editor-side targeting a jump
 * link needs.
 *
 * **Layering (constitution)**: pure. No stores, no react, no three; `Mode` is a TYPE-only
 * import (erased at compile time, so `src/ksa/` gains no runtime dependency on
 * `src/state/`). **Undo enrollment: NONE** — a read-only view of the document.
 */

import { validateColliders } from './colliderValidation';
import { validateEngines } from './engineValidation';
import { validateIvaSeats } from './ivaSeatValidation';
import { validateLights } from './lightValidation';
import type { EngineIssueSource } from './engineValidation';
import type { CatalogSubPart } from './catalog';
import type { ReactionData } from './reactionCatalog';
import type { EditingPart } from './types';
import type { Mode } from '../state/modeStore';

/**
 * `block` ⇒ KSA refuses to load the mod · `warn` ⇒ it loads but the part misbehaves ·
 * `info` ⇒ legal and probably intended, but worth knowing (Core's own data trips these,
 * so they must never read as mistakes).
 */
export type IssueSeverity = 'block' | 'warn' | 'info';

/** Which authoring surface an issue came from — grouping/telemetry only, never gating. */
export type IssueArea = 'part' | 'engine' | 'collider' | 'seat' | 'light' | 'asset';

/**
 * Where an issue's fix lives (foundation §2.5 "jump with context"): the dialog closes,
 * `modeStore.setMode(mode, focus)` runs, and the target mode's entry hook scopes itself
 * from `focus`.
 *
 * Build mode takes no entry payload (foundation §2.3), so a Build-bound jump spells its
 * target as `focus: {entity}` instead and the jump helper turns that into a selection.
 */
export interface ExportJumpTarget {
  mode: Mode;
  /**
   * The `setMode` payload — `{scope, sectionId}` for Data, `{engineScope, group}` for
   * Engine, `{entity: {kind, id}}` for Build (consumed by the caller, ignored by setMode).
   */
  focus?: unknown;
}

export interface ExportIssue {
  severity: IssueSeverity;
  area: IssueArea;
  /** Stable kebab-case code — tests and jump wiring match on this, never on the prose. */
  code: string;
  message: string;
  jumpTarget?: ExportJumpTarget;
}

/** `EngineIssueSource` → the Engine-mode jump payload that opens the offending module. */
function engineJump(source: EngineIssueSource | undefined): ExportJumpTarget {
  if (!source) return { mode: 'engine' };
  const engineScope =
    source.templateId === null
      ? ({ kind: 'part' } as const)
      : ({ kind: 'subpart', templateId: source.templateId } as const);
  // `EngineIssueSource.module` and `EngineModuleGroup` are the same ten tokens, so the
  // module name IS the tree group to scroll to.
  return { mode: 'engine', focus: { engineScope, group: source.module } };
}

/**
 * Every pre-flight issue for `part`, in source order: the basic trio, then engines,
 * colliders, IVA seats, lights, then the custom-asset notes. The UI groups by severity —
 * this list is deliberately NOT pre-sorted, so a group renders its issues in the order the
 * validators emit them (which is their own authored priority).
 */
export function collectExportIssues(
  part: EditingPart,
  reactions: ReadonlyMap<string, ReactionData>,
  catalog: ReadonlyMap<string, CatalogSubPart>,
): ExportIssue[] {
  const issues: ExportIssue[] = [];

  // ── the basic trio (v1's export-dialog `validate()`, copy verbatim) ─────────
  if (!part.partId.trim()) {
    issues.push({
      severity: 'warn',
      area: 'part',
      code: 'part-id-empty',
      message: 'Part Id is empty.',
      // The Part Id field lives on Data mode's Identity section.
      jumpTarget: { mode: 'data', focus: { scope: { kind: 'part' }, sectionId: 'identity' } },
    });
  }

  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const placement of part.placements) {
    if (seen.has(placement.instanceId)) dupes.add(placement.instanceId);
    seen.add(placement.instanceId);
  }
  if (dupes.size > 0) {
    // A `block`: KSA keys placements by instance id and refuses a Part that repeats one.
    issues.push({
      severity: 'block',
      area: 'part',
      code: 'duplicate-instance-ids',
      message: `Duplicate instance ids: ${[...dupes].join(', ')}`,
      jumpTarget: { mode: 'build' },
    });
  }

  if (part.placements.length === 0) {
    issues.push({
      severity: 'warn',
      area: 'part',
      code: 'no-subparts',
      message: 'No SubParts placed.',
      jumpTarget: { mode: 'build' },
    });
  }

  // ── the four shared validators, mapped 1:1 ─────────────────────────────────
  for (const issue of validateEngines(part, reactions)) {
    issues.push({
      severity: issue.severity,
      area: 'engine',
      code: issue.code,
      message: issue.message,
      jumpTarget: engineJump(issue.source),
    });
  }

  for (const issue of validateColliders(part)) {
    // `ColliderIssue` carries no entity id (the collider's id is inside the prose), so
    // there is nothing to focus — the jump would land on an arbitrary selection.
    issues.push({
      severity: issue.severity,
      area: 'collider',
      code: issue.code,
      message: issue.message,
    });
  }

  for (const issue of validateIvaSeats(part, catalog)) {
    issues.push({
      severity: issue.severity,
      area: 'seat',
      code: issue.code,
      message: issue.message,
    });
  }

  for (const issue of validateLights(part)) {
    issues.push({
      severity: issue.severity,
      area: 'light',
      code: issue.code,
      message: issue.message,
      // `light-always-on` is a property of the Part's power wiring, not of one light, and
      // reports `lightId: null` — no entity to select.
      jumpTarget: issue.lightId
        ? { mode: 'build', focus: { entity: { kind: 'light', id: issue.lightId } } }
        : undefined,
    });
  }

  // ── custom meshes that will not ship (design D10; the P8.27 hand-off) ──────
  // The SAME zero-placement rule as `customAssetStore.$unplacedCustomMeshes` and the export
  // skip in `modExport.buildCustomBundle` (`meshes = customMeshes.filter(placed.has(...))`).
  // Restated rather than imported: this module may not read a store's computed.
  const placedTemplates = new Set(part.placements.map((p) => p.subPartTemplateId));
  const unplaced = part.customMeshes.filter((m) => !placedTemplates.has(m.subPartId));
  if (unplaced.length > 0) {
    issues.push({
      severity: 'info',
      area: 'asset',
      code: 'custom-mesh-unplaced',
      message:
        `${unplaced.length} custom mesh${unplaced.length === 1 ? '' : 'es'} ` +
        `${unplaced.length === 1 ? 'has' : 'have'} no placements and will not ship: ` +
        unplaced.map((m) => m.name).join(', '),
      jumpTarget: { mode: 'surface' },
    });
  }

  return issues;
}

/** How many issues of each severity — the dialog's box headings and button relabel. */
export function countBySeverity(issues: readonly ExportIssue[]): Record<IssueSeverity, number> {
  return {
    block: issues.filter((i) => i.severity === 'block').length,
    warn: issues.filter((i) => i.severity === 'warn').length,
    info: issues.filter((i) => i.severity === 'info').length,
  };
}
