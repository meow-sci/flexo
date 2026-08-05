import { atom, computed } from 'nanostores';
import { $part, $selection } from './editorStore';
import { $mode, registerModeHooks } from './modeStore';
import { ensureReactionsLoaded } from './reactionStore';
import type { GameDataFinding as GameDataFindingType } from './gameDataFindings';

/**
 * **Data mode's sub-state** (design: `plans/flexo_v2/design/design-data-engine-modes.md`
 * §A2/§A3/§A5/§B9; foundation §2.4 the Data scope ladder, §13 store rules).
 *
 * Three ephemeral designer atoms — the scope the left form is showing, a section-jump
 * intent, and the navigator's search text — plus the viewport highlight/flash intents the
 * three-layer scene consumes.
 *
 * **Layering (constitution)**: zero react / three imports.
 *
 * **Undo enrollment: NONE. Persistence: NONE.** Everything here is view state (design §A10:
 * "scope/section selection, search, section collapse → none / not persisted"). `$dataScope`
 * deliberately SURVIVES a mode switch so re-entering Data returns you where you were
 * (foundation §2.4) — it is cleared by nothing except a project load, which resets the whole
 * document anyway.
 */

export type DataScope = { kind: 'part' } | { kind: 'template'; templateId: string };

/**
 * Every section a scope form can host. `tanks` and `passthrough` render at BOTH scopes; the
 * rest are scope-specific (design §A4.1 / §A4.2).
 */
export type DataSectionId =
  // Part scope, in form order.
  | 'identity'
  | 'mass'
  | 'tanks'
  | 'power'
  | 'coupling'
  | 'wiring'
  | 'advanced'
  | 'passthrough'
  // Template-scope extras (template order: tanks · lights · solar · engine · passthrough).
  | 'lights'
  | 'solar'
  | 'engine';

/**
 * The ONE section dataset (foundation Law 4): the navigator's child rows, the form's chip
 * strip and the form's section stack all render from this, in this order, so they can never
 * drift out of sync. `label` is the user-facing wording — "Tanks (feed containers)" is
 * binding vocabulary (§A1), not decoration.
 */
export interface DataSectionDef {
  id: DataSectionId;
  label: string;
  /** Short label for the horizontally-scrolled chip strip. */
  chip: string;
}

const SECTION_DEFS: Readonly<Record<DataSectionId, DataSectionDef>> = {
  identity: { id: 'identity', label: 'Identity', chip: 'Identity' },
  mass: { id: 'mass', label: 'Mass', chip: 'Mass' },
  tanks: { id: 'tanks', label: 'Tanks (feed containers)', chip: 'Tanks' },
  power: { id: 'power', label: 'Power', chip: 'Power' },
  coupling: { id: 'coupling', label: 'Coupling', chip: 'Coupling' },
  wiring: { id: 'wiring', label: 'Wiring', chip: 'Wiring' },
  advanced: { id: 'advanced', label: 'Advanced', chip: 'Advanced' },
  passthrough: { id: 'passthrough', label: 'Passthrough XML', chip: 'Passthrough' },
  lights: { id: 'lights', label: 'Lights', chip: 'Lights' },
  solar: { id: 'solar', label: 'Solar panels', chip: 'Solar' },
  engine: { id: 'engine', label: 'Engine (thrust chamber)', chip: 'Engine' },
};

const PART_SECTION_ORDER: readonly DataSectionId[] = [
  'identity',
  'mass',
  'tanks',
  'power',
  'coupling',
  'wiring',
  'advanced',
  'passthrough',
];

const TEMPLATE_SECTION_ORDER: readonly DataSectionId[] = [
  'tanks',
  'lights',
  'solar',
  'engine',
  'passthrough',
];

/** The sections a scope hosts, in form order. */
export function sectionsFor(scope: DataScope): readonly DataSectionDef[] {
  const order = scope.kind === 'part' ? PART_SECTION_ORDER : TEMPLATE_SECTION_ORDER;
  return order.map((id) => SECTION_DEFS[id]);
}

/** One section's display metadata. */
export function sectionDef(id: DataSectionId): DataSectionDef {
  return SECTION_DEFS[id];
}

/**
 * The RAW scope, exactly as last set. Readers should prefer {@link $dataScope}, whose
 * clamp is what makes a deleted template fall back to the Part rather than showing a form
 * for something that no longer exists.
 */
export const $dataScopeRaw = atom<DataScope>({ kind: 'part' });

/**
 * Clamped view: a scope naming a template with zero placements falls back to Part (foundation
 * §2.4 rung 2 — "stale template → next rung"). The raw atom is left untouched, so undoing the
 * deletion silently restores the scope.
 */
export const $dataScope = computed(
  [$dataScopeRaw, $part],
  (scope, part): DataScope =>
    scope.kind === 'template' &&
    !part.placements.some((p) => p.subPartTemplateId === scope.templateId)
      ? { kind: 'part' }
      : scope,
);

/**
 * A pending "scroll to + expand + flash" intent. The nonce is what lets the SAME section be
 * jumped to twice in a row (a second click on the same chip must re-flash).
 */
export const $dataSectionJump = atom<{
  sectionId: DataSectionId;
  /** Optional card within the section (a tank index, a finding's subject) to flash. */
  cardKey?: string;
  nonce: number;
} | null>(null);

/** The navigator's fuzzy search text. */
export const $dataSearch = atom<string>('');

/**
 * Whether the user has picked a scope this session. It is what separates "Part scope because
 * that is what I chose" from "Part scope because nothing has happened yet" — rung 2 of the
 * entry ladder honours the first and falls through on the second (foundation §2.4).
 */
let scopeEverSet = false;

export function setDataScope(scope: DataScope): void {
  scopeEverSet = true;
  const current = $dataScopeRaw.get();
  if (
    current.kind === scope.kind &&
    (current.kind !== 'template' ||
      current.templateId === (scope as { templateId: string }).templateId)
  ) {
    return;
  }
  $dataScopeRaw.set(scope);
}

export function jumpToSection(sectionId: DataSectionId, cardKey?: string): void {
  $dataSectionJump.set({
    sectionId,
    cardKey,
    nonce: ($dataSectionJump.get()?.nonce ?? 0) + 1,
  });
}

export function setDataSearch(query: string): void {
  $dataSearch.set(query);
}

// ── viewport affordances (design §A2 "Extra affordances", §A5) ───────────────

/**
 * The placement instance ids the scoped template owns, while Data mode is active — a
 * persistent TINT (not a selection) that says "the form you are editing drives these
 * meshes". Empty in every other mode and at Part scope.
 */
export const $dataHighlight = computed([$mode, $dataScope, $part], (mode, scope, part): string[] =>
  mode === 'data' && scope.kind === 'template'
    ? part.placements
        .filter((p) => p.subPartTemplateId === scope.templateId)
        .map((p) => p.instanceId)
    : [],
);

/**
 * A one-shot ~600ms flash of specific placements — hovering a navigator row, a scope chip, a
 * feed target. Nonce'd so flashing the same set twice re-fires. The timer lives HERE (not in
 * a component) so the store stays the single source of truth and the flash survives a
 * re-render; the scene subscribes and re-tints.
 */
export const $dataFlash = atom<{ instanceIds: readonly string[]; nonce: number } | null>(null);

/** How long a hover/eye-button flash stays lit (design §A5 touch rule: "~600 ms"). */
export const DATA_FLASH_MS = 600;

let flashTimer: ReturnType<typeof setTimeout> | null = null;

/** Flashes `instanceIds` for {@link DATA_FLASH_MS}. An empty list clears any live flash. */
export function flashPlacements(instanceIds: readonly string[]): void {
  if (flashTimer !== null) clearTimeout(flashTimer);
  if (instanceIds.length === 0) {
    flashTimer = null;
    $dataFlash.set(null);
    return;
  }
  $dataFlash.set({ instanceIds: [...instanceIds], nonce: ($dataFlash.get()?.nonce ?? 0) + 1 });
  flashTimer = setTimeout(() => {
    flashTimer = null;
    $dataFlash.set(null);
  }, DATA_FLASH_MS);
}

/** Drops a live flash early (pointer left the row before the timer expired). */
export function clearFlash(): void {
  flashPlacements([]);
}

// ── mode entry (foundation §2.4 "Entering Data", design §A2) ────────────────

/** The cross-mode jump payload Data mode understands (foundation §2.5). */
export interface DataModePayload {
  scope?: DataScope;
  sectionId?: DataSectionId;
}

/** The template of the LAST-selected SubPart placement, or null. */
function selectedTemplateId(): string | null {
  const ref = $selection
    .get()
    .filter((r) => r.kind === 'subpart')
    .at(-1);
  if (!ref) return null;
  return $part.get().placements.find((p) => p.instanceId === ref.id)?.subPartTemplateId ?? null;
}

let hooksRegistered = false;

/**
 * Registers Data mode's entry choreography — **the scope ladder, first hit wins**
 * (foundation §2.4):
 *
 * 1. a cross-mode jump payload (`SubPart Data →`) always wins;
 * 2. else the surviving `$dataScope`, if the user ever picked one and it is still valid
 *    (a template whose last placement was deleted clamps to Part and falls through);
 * 3. else the selection's last SubPart → that template's scope;
 * 4. else Part scope.
 *
 * Then the reaction catalog preload — the ONE sanctioned mode-entry effect (read-only, and
 * side-effect-free with respect to the document). **Exit has no effects at all**: `$dataScope`
 * must survive for the return trip.
 *
 * Called from boot (`main.tsx`) rather than run at module scope so the registration order is
 * explicit and can never depend on which component happened to import this store first.
 * Idempotent — StrictMode's double boot is harmless.
 */
export function initDataMode(): void {
  if (hooksRegistered) return;
  hooksRegistered = true;

  registerModeHooks('data', {
    onEnter: (payload) => {
      const jump = payload as DataModePayload | undefined;
      if (jump?.scope) {
        setDataScope(jump.scope);
        if (jump.sectionId) jumpToSection(jump.sectionId);
      } else if (!scopeEverSet || $dataScope.get().kind !== $dataScopeRaw.get().kind) {
        const templateId = selectedTemplateId();
        setDataScope(templateId ? { kind: 'template', templateId } : { kind: 'part' });
      }
      void ensureReactionsLoaded();
    },
  });
}

export { $gameDataFindings, type GameDataFinding } from './gameDataFindings';

/**
 * Click-through for a finding (design D4): scope to its target and fire the section jump the
 * form scroll-expands-and-flashes on. Shared by the navigator's validation strip and the
 * status bar's Data chip, so the two can never behave differently.
 */
export function focusFinding(finding: GameDataFindingType): void {
  setDataScope(finding.target.scope);
  jumpToSection(finding.target.sectionId, finding.target.cardKey);
}
