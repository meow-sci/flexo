import { computed } from 'nanostores';
import { validateEngines, type EngineIssue } from '../ksa/engineValidation';
import type { EditingPart } from '../ksa/types';
import type { ReactionData } from '../ksa/reactionCatalog';
import { $part } from './editorStore';
import { $allReactionIndex } from './reactionStore';
import type { DataScope, DataSectionId } from './dataModeStore';

/**
 * **The Data-mode findings pipeline** (design:
 * `plans/flexo_v2/design/design-data-engine-modes.md` §A7, decision D4).
 *
 * ONE store feeds all three of D4's surfaces — the navigator's pinned validation strip, the
 * status bar's Data segment, and the click-through that scopes + jumps + flashes the
 * offending card. A finding is an {@link EngineIssue} (unchanged codes, severities and KSA
 * log wording — census `engines.md` §5 invariant) re-addressed to a Data-mode
 * `(scope, section, card)` target, plus two id checks that belong to this store rather than
 * to the game-contract validator.
 *
 * **Layering (constitution)**: zero react / three imports. The `dataModeStore` types are
 * imported TYPE-ONLY, so the convenience re-export there creates no runtime cycle.
 *
 * **Undo enrollment: NONE.** Derived read-only view of `$part`.
 */

export interface GameDataFinding {
  severity: 'block' | 'warn';
  /** Stable kebab-case code — the same one `validateEngines` emits, where it came from there. */
  code: string;
  message: string;
  target: {
    scope: DataScope;
    sectionId: DataSectionId;
    /** Identifies a card inside the section, for the flash (see `useSectionJump`). */
    cardKey?: string;
  };
}

/**
 * Modules whose fix lives on the PART's Wiring section rather than on the module's own
 * editor: controllers, `<ConsumerFeedWiring>` entries and gimbals are all part-level
 * (design §A4.1 Wiring).
 */
const WIRING_MODULES = new Set(['controller', 'wiring', 'gimbal']);

/** Re-addresses one engine issue to the Data-mode surface that can fix it. */
function targetOf(issue: EngineIssue): GameDataFinding['target'] {
  const source = issue.source;
  const cardKey =
    source?.module && source.index !== undefined ? `${source.module}:${source.index}` : undefined;

  if (!source) return { scope: { kind: 'part' }, sectionId: 'advanced' };
  if (source.module && WIRING_MODULES.has(source.module)) {
    return { scope: { kind: 'part' }, sectionId: 'wiring', cardKey };
  }
  if (source.templateId !== null) {
    return {
      scope: { kind: 'template', templateId: source.templateId },
      sectionId: 'engine',
      cardKey,
    };
  }
  // Part-level engine hardware — solid motor + gas generator — lives under Advanced, and so
  // do custom propellants' export blockers (their editor is Engine mode's own tree, D8; the
  // Advanced section is the closest Data-mode landing spot and carries the cross-link).
  return { scope: { kind: 'part' }, sectionId: 'advanced', cardKey };
}

/** Tank feed ids that repeat within one scope, as `{index, id}` of each repeat after the first. */
function duplicateFeedIds(tanks: readonly { id: string }[]): { index: number; id: string }[] {
  const seen = new Set<string>();
  const out: { index: number; id: string }[] = [];
  tanks.forEach((tank, index) => {
    const id = tank.id.trim();
    if (!id) return; // a blank id is unaddressable in KSA, not a collision
    if (seen.has(id)) out.push({ index, id });
    else seen.add(id);
  });
  return out;
}

/**
 * Every Data-mode finding for `part`: the engine/plumbing validator's issues re-addressed,
 * plus a blank Part Id (KSA has nothing to key the mod entry on) and duplicate tank feed ids
 * within one scope (`<FeedsFrom Container>` resolves the FIRST match, so the second tank is
 * silently unreachable). Blocking findings first, mirroring `validateEngines`' own order.
 */
export function computeGameDataFindings(
  part: EditingPart,
  reactions: ReadonlyMap<string, ReactionData>,
): GameDataFinding[] {
  const findings: GameDataFinding[] = [];

  if (part.partId.trim().length === 0) {
    findings.push({
      severity: 'block',
      code: 'part-id-blank',
      message: 'The Part Id is blank — KSA needs an id to register the part under.',
      target: { scope: { kind: 'part' }, sectionId: 'identity' },
    });
  }

  for (const issue of validateEngines(part, reactions)) {
    findings.push({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      target: targetOf(issue),
    });
  }

  for (const dup of duplicateFeedIds(part.gameData.tanks)) {
    findings.push({
      severity: 'warn',
      code: 'tank-feed-id-duplicate',
      message:
        `Two part-level tanks share the feed id '${dup.id}' — a <FeedsFrom Container> ` +
        `resolves the first one, so the other is unreachable.`,
      target: { scope: { kind: 'part' }, sectionId: 'tanks', cardKey: String(dup.index) },
    });
  }
  for (const spd of part.subPartGameData) {
    for (const dup of duplicateFeedIds(spd.tanks)) {
      findings.push({
        severity: 'warn',
        code: 'tank-feed-id-duplicate',
        message:
          `Two tanks on ${spd.subPartTemplateId} share the feed id '${dup.id}' — a ` +
          `<FeedsFrom Container> resolves the first one, so the other is unreachable.`,
        target: {
          scope: { kind: 'template', templateId: spd.subPartTemplateId },
          sectionId: 'tanks',
          cardKey: String(dup.index),
        },
      });
    }
  }

  return [
    ...findings.filter((f) => f.severity === 'block'),
    ...findings.filter((f) => f.severity === 'warn'),
  ];
}

/** Live findings for the current document (design §A7 store row). */
export const $gameDataFindings = computed([$part, $allReactionIndex], computeGameDataFindings);
