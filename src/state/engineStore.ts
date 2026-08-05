import { atom, computed } from 'nanostores';
import type {
  EditingPart,
  SolidMotorNozzle,
  SubPartGameData,
  SubPartPlacement,
  Transform,
  Vec3,
} from '../ksa/types';
import { validateEngines, type EngineIssue } from '../ksa/engineValidation';
import {
  $part,
  $selection,
  $toolMode,
  updateNozzle,
  updatePartNozzle,
  updatePartSolidNozzle,
  updateSubPartSolidNozzle,
  type EngineModuleGroup,
  type EngineModuleRef,
  type ToolMode,
} from './editorStore';
import { $allReactionIndex, ensureReactionsLoaded } from './reactionStore';
import { ensureSolidCurveDataLoaded } from './solidCurveStore';
import { $activeTool, armTool, disarmTool, registerModeHooks, registerTool } from './modeStore';

/**
 * Ephemeral editor state for the Engine Designer — the `$mode === 'engine'` mode
 * (mirrors animationStore's ephemeral atoms). NONE of this is in
 * `$part`/undo: it is sub-selection, like which engine is open, which of its nozzles the
 * 3D handles target, and whether the exhaust gizmo is showing. The engine data itself
 * (combustors/nozzles/rockets/…) lives on `$part` and is mutated through editorStore's
 * discrete/streaming actions.
 *
 * An "engine" here is one of two things, because KSA allows engine hardware at BOTH
 * scopes (`PartTemplate.RocketNozzles` is legal under `<PartGameData>` and
 * `<SubPartGameData>` alike — `decomp/KSA/PartTemplate.cs:45-47,245`):
 *  - a **SubPart template** carrying a reusable thrust chamber (the main-engine pattern);
 *  - the **part itself**, which is how stock authors an RCS battery (the MMU puts its
 *    whole set of nozzles on `<PartGameData>`) and gas-generator cycles.
 */

/** Which scope the designer is editing: a reusable SubPart template, or the part itself. */
export type EngineEntry = { kind: 'subpart'; templateId: string } | { kind: 'part' };

/** The engine (scope) currently open in the designer, or null. */
export const $activeEngineEntry = atom<EngineEntry | null>(null);

/** The part-scope sentinel used as a Select key wherever an {@link EngineEntry} is a row. */
export const PART_ENGINE_ENTRY_KEY = '\0part';

/** Stable Select/GridList key for one engine scope (census invariant: sentinels preserved). */
export function engineEntryKey(entry: EngineEntry): string {
  return entry.kind === 'part' ? PART_ENGINE_ENTRY_KEY : entry.templateId;
}

/** The {@link EngineEntry} a {@link engineEntryKey} names. */
export function engineEntryFromKey(key: string): EngineEntry {
  return key === PART_ENGINE_ENTRY_KEY ? { kind: 'part' } : { kind: 'subpart', templateId: key };
}

/**
 * The ONE label helper for an engine scope (design §6.2 "single label helper in
 * engineStore"), replacing v1's duplicated `shortLabel`/`entryLabel` pairs in `EnginePanel`
 * and `EngineToolbar` (census pain 7). `part` is taken so the part-scope entry can name the
 * document rather than saying "Part-level" twice in a row next to the part's own title.
 */
export function engineEntryLabel(entry: EngineEntry, part: EditingPart): string {
  if (entry.kind === 'part') {
    const name = part.gameData.displayName.trim() || part.partId.trim();
    return name ? `Part-level (RCS / gas generator) — ${name}` : 'Part-level (RCS / gas generator)';
  }
  return entry.templateId;
}

/**
 * The short form for tight chrome (the tree header, the status chip): a template id's last
 * underscore segment with a trailing `Assembly` dropped — v1's `shortLabel`, verbatim.
 */
export function engineEntryShortLabel(entry: EngineEntry): string {
  if (entry.kind === 'part') return 'Part-level';
  const segment = entry.templateId.split('_').pop() ?? entry.templateId;
  return segment.replace(/Assembly$/, '');
}

/** De Laval (`<DeLavalNozzle>`) vs solid-motor (`<SolidMotorNozzle>`) — separate lists in KSA. */
export type NozzleKind = 'delaval' | 'solid';

/**
 * Which of a nozzle's two placement pairs a handle/gizmo edits:
 *  - `physics` — `<ExhaustLocation>`/`<ExhaustDirection>`: where thrust is applied and along
 *    which axis (thrust = `TotalThrust * -ExhaustDirection`);
 *  - `fx` — the optional `<FxExhaustLocation>`/`<FxExhaustDirection>` override, which stock
 *    content uses to desync the visible plume from the thrust axis. Absent ⇒ inherits the
 *    physics pair (`RocketNozzleTemplate.OnDataLoad`).
 */
export type NozzleChannel = 'physics' | 'fx';

/**
 * Names ONE nozzle handle anywhere in the part. Ephemeral (never serialized), and resolved
 * defensively against `$part` on every read — indices shift when a nozzle is removed, so a
 * stale ref simply resolves to nothing rather than editing the wrong nozzle.
 *
 * `instanceId` is the PLACEMENT the handle is drawn in, not a second nozzle: a SubPart-owned
 * nozzle is instantiated **once per placement of its owning template** (KSA turns each
 * `<SubPartRef>` into its own child `Part` carrying its own `RocketNozzle` module —
 * `decomp/KSA/Part.cs:1144-1152`), which is how every stock RCS block gets its 4 thrusters
 * from ONE `<DeLavalNozzle>`. Same shape as a SubPart-owned collider or light: N views of one
 * document entity, so the ref must name the frame an edit goes through.
 */
export type NozzleRef =
  | {
      scope: 'subpart';
      templateId: string;
      /** Placement whose frame this handle sits in; null ⇒ the template isn't placed. */
      instanceId: string | null;
      kind: NozzleKind;
      index: number;
      channel: NozzleChannel;
    }
  | { scope: 'part'; kind: NozzleKind; index: number; channel: NozzleChannel };

/** Stable identity for a {@link NozzleRef} — the scene's handle key and the chip list's key. */
export function nozzleRefKey(ref: NozzleRef): string {
  const scope = ref.scope === 'subpart' ? `${ref.templateId}@${ref.instanceId ?? ''}` : '';
  return `${ref.scope}|${scope}|${ref.kind}|${ref.index}|${ref.channel}`;
}

/**
 * One resolved 3D handle: a nozzle, the placement frame it is drawn in, and the effective
 * pose. `nozzle` is typed as {@link SolidMotorNozzle} because that IS the shared shape — a
 * `DeLavalNozzle` is structurally this plus `<AreaRatio>` — so one target type covers both
 * flavors (the same trick `RocketNozzleFields` uses).
 *
 * ⚠️ Several targets can name the SAME document nozzle (one per placement). Editing any of
 * them edits that one nozzle, so every sibling handle moves in sync — the light rule.
 */
export interface NozzleTarget {
  ref: NozzleRef;
  key: string;
  nozzle: SolidMotorNozzle;
  /**
   * The placement whose assembly frame {@link location}/{@link direction} are expressed
   * in; **null ⇒ the Part frame** (a part-level nozzle, or a template with no placement).
   */
  frame: Transform | null;
  /** Owner-frame location to draw at — for the fx channel, `fxExhaustLocation ?? exhaustLocation`. */
  location: Vec3;
  /** Owner-frame direction to aim along — for the fx channel, `fxExhaustDirection ?? exhaustDirection`. */
  direction: Vec3;
  /** 0-based position of {@link frame} among the owning template's placements. */
  instanceIndex: number;
  /** How many placements the owning template has (1 for part scope / an unplaced template). */
  instanceCount: number;
  /** The one target the gizmo is attached to (exactly one when any exist). */
  isActive: boolean;
}

/**
 * Display label for one nozzle handle: the nozzle id, `#N` when its template is placed more
 * than once (all those handles are the SAME nozzle in different frames, so the id alone
 * would repeat), and `· FX` for the plume-override channel.
 *
 * Lives here rather than in the Engine panel because the status bar's tool segment names
 * the same handle while exhaust placement is armed — two spellings of "which nozzle" would
 * be free to drift.
 */
export function nozzleTargetLabel(target: NozzleTarget): string {
  const instance = target.instanceCount > 1 ? ` #${target.instanceIndex + 1}` : '';
  return `${target.nozzle.id}${instance}${target.ref.channel === 'fx' ? ' · FX' : ''}`;
}

/** Which nozzle the 3D gizmo edits; null ⇒ the first resolved target. */
export const $activeNozzleRef = atom<NozzleRef | null>(null);

/** True for a SubPart template that carries any engine hardware (so the designer can reach it). */
function hasEngineModules(s: SubPartGameData): boolean {
  return (
    s.combustors.length > 0 ||
    s.solidMotors.length > 0 ||
    s.nozzles.length > 0 ||
    s.solidNozzles.length > 0
  );
}

/**
 * Every engine the designer can open: one entry per SubPart template carrying engine
 * hardware, plus a `part` entry whenever `<PartGameData>` carries any itself. Without the
 * part entry a stock-style RCS block (nozzles on the part, not on a SubPart) would not be
 * an "engine" to the designer at all.
 */
export const $engineEntries = computed([$part], (part): EngineEntry[] => {
  const entries: EngineEntry[] = part.subPartGameData
    .filter(hasEngineModules)
    .map((s) => ({ kind: 'subpart', templateId: s.subPartTemplateId }));
  const g = part.gameData;
  if (
    g.combustors.length > 0 ||
    g.solidMotors.length > 0 ||
    g.nozzles.length > 0 ||
    g.solidNozzles.length > 0
  ) {
    entries.push({ kind: 'part' });
  }
  return entries;
});

/** The active SubPart engine's `SubPartGameData` entry, or null (also null for the part entry). */
export const $activeEngineData = computed(
  [$part, $activeEngineEntry],
  (part, entry): SubPartGameData | null =>
    entry?.kind === 'subpart'
      ? (part.subPartGameData.find((s) => s.subPartTemplateId === entry.templateId) ?? null)
      : null,
);

/**
 * Every nozzle handle for the open engine: BOTH lists (De Laval + solid motor) × **every
 * placement of the owning template** × the `fx` channel where a nozzle overrides it.
 *
 * The per-placement fan-out is the one that matters for stock content. A SubPart-owned
 * nozzle is instantiated once per placement of its template, so `RCSALargeA`'s four
 * thrusters are ONE `<DeLavalNozzle>` placed four times — drawing only the first placement
 * left three real in-game thrusters with no handle at all. Part-scope nozzles and an
 * unplaced template get a single Part-frame handle (`frame: null`).
 *
 * Exactly one target is `isActive`: the {@link $activeNozzleRef} if it still resolves, else
 * the first (so a removed nozzle degrades to a sane target instead of a dead gizmo).
 *
 * Vectors are returned in their OWNER frame with the frame alongside; lifting them into
 * Part space is `src/three/coords.ts`'s job (`exhaustWorld*`), since only the two location
 * fields take the owner's scale and only the scene needs three.js.
 */
export const $resolvedNozzleTargets = computed(
  [$part, $activeEngineEntry, $activeNozzleRef],
  (part, entry, activeRef): NozzleTarget[] => {
    if (!entry) return [];
    const spd =
      entry.kind === 'subpart'
        ? part.subPartGameData.find((s) => s.subPartTemplateId === entry.templateId)
        : undefined;
    const groups: { kind: NozzleKind; list: readonly SolidMotorNozzle[] }[] =
      entry.kind === 'part'
        ? [
            { kind: 'delaval', list: part.gameData.nozzles },
            { kind: 'solid', list: part.gameData.solidNozzles },
          ]
        : [
            { kind: 'delaval', list: spd?.nozzles ?? [] },
            { kind: 'solid', list: spd?.solidNozzles ?? [] },
          ];
    // One frame per instantiation. `[null]` (not `[]`) for part scope and for an unplaced
    // template: both still get exactly one handle, drawn in the Part frame.
    const owners =
      entry.kind === 'subpart'
        ? part.placements.filter((p) => p.subPartTemplateId === entry.templateId)
        : [];
    const frames: (SubPartPlacement | null)[] = owners.length > 0 ? owners : [null];

    const out: NozzleTarget[] = [];
    for (const { kind, list } of groups) {
      for (const [index, nozzle] of list.entries()) {
        for (const [instanceIndex, frame] of frames.entries()) {
          const refFor = (channel: NozzleChannel): NozzleRef =>
            entry.kind === 'part'
              ? { scope: 'part', kind, index, channel }
              : {
                  scope: 'subpart',
                  templateId: entry.templateId,
                  instanceId: frame?.instanceId ?? null,
                  kind,
                  index,
                  channel,
                };
          const common = {
            nozzle,
            frame,
            instanceIndex,
            instanceCount: frames.length,
            isActive: false,
          };
          const physics = refFor('physics');
          out.push({
            ...common,
            ref: physics,
            key: nozzleRefKey(physics),
            location: nozzle.exhaustLocation,
            direction: nozzle.exhaustDirection,
          });
          // The fx handle exists ONLY when an override does — matching KSA's own debug
          // overlay, which draws the cyan plume arrow only for an overridden nozzle.
          if (nozzle.fxExhaustLocation !== null || nozzle.fxExhaustDirection !== null) {
            const fx = refFor('fx');
            out.push({
              ...common,
              ref: fx,
              key: nozzleRefKey(fx),
              location: nozzle.fxExhaustLocation ?? nozzle.exhaustLocation,
              direction: nozzle.fxExhaustDirection ?? nozzle.exhaustDirection,
            });
          }
        }
      }
    }

    const activeKey = activeRef ? nozzleRefKey(activeRef) : null;
    const found = activeKey ? out.findIndex((t) => t.key === activeKey) : -1;
    const active = found >= 0 ? found : 0;
    return out.map((t, i) => (i === active ? { ...t, isActive: true } : t));
  },
);

/** The one nozzle the exhaust gizmo edits, or null when the open engine has no nozzles. */
export const $activeNozzleTarget = computed(
  [$resolvedNozzleTargets],
  (targets): NozzleTarget | null => targets.find((t) => t.isActive) ?? null,
);

/**
 * True while the exhaust gizmo is actually attached to something. Drives the
 * translate/rotate toolbar, which is otherwise hidden without a viewport selection —
 * leaving the gizmo stuck on whichever tool was last used (and on dead scale handles).
 *
 * Derived straight from the `$activeTool` slot (design §B9): v1's separate boolean flag is
 * gone, so "armed" and "the slot says exhaust" can no longer disagree. The mode is not
 * re-checked — `registerTool('exhaust', {allowedModes: ['engine']})` below is what makes the
 * slot unreachable outside Engine mode, and `setMode` cancels it on the way out.
 */
export const $isExhaustPlacing = computed(
  [$activeTool, $activeNozzleTarget],
  (tool, target) => tool === 'exhaust' && target !== null,
);

/**
 * The tool mode the gizmo actually runs in, clamped for exhaust placement: a nozzle
 * placement is a point + a direction, so **Scale has nothing to drive** — KSA's nozzle
 * schema has no scale field at all (`decomp/KSA/RocketNozzleTemplate.cs`). Rather than
 * present dead handles, Scale degrades to Move while placing.
 *
 * ONE source of truth on purpose: both the gizmo (`EditorScene`) and the mode switcher
 * (the Tool bar window) read this, so the displayed tool can never disagree with the tool
 * the drag performs.
 */
export const $effectiveToolMode = computed(
  [$toolMode, $isExhaustPlacing],
  (mode, placing): ToolMode => (placing && mode === 'scale' ? 'translate' : mode),
);

/** Selects which engine (scope) the designer edits, resetting its sub-selection. */
export function setActiveEngine(entry: EngineEntry | null): void {
  $activeEngineEntry.set(entry);
  $activeNozzleRef.set(null);
  setExhaustPlacing(false);
}

/** Selects the SubPart-template engine with the given id (null ⇒ none). */
export function setActiveEngineTemplate(id: string | null): void {
  setActiveEngine(id ? { kind: 'subpart', templateId: id } : null);
}

/** Targets one nozzle handle with the 3D gizmo (null ⇒ back to the first). */
export function setActiveNozzleRef(ref: NozzleRef | null): void {
  $activeNozzleRef.set(ref);
}

/**
 * Exhaust placement's tenancy of the single `$activeTool` slot (foundation §2.6 row 3):
 * **Engine mode only**, so `setMode` cancels it on the way out and `armTool` refuses it
 * anywhere else. Arming measure or the marquee cancels it and vice versa — that single
 * slot is what formalizes v1's ad-hoc OR of suppression flags.
 *
 * There is no `onCancel`: the tool owns no state of its own any more. `$isExhaustPlacing`
 * reads the slot, so releasing the slot IS the teardown, and there is no second flag left
 * behind to desync (v1's `$engineExhaustGizmo`, retired here).
 */
registerTool('exhaust', { allowedModes: ['engine'] });

/**
 * Arms / disarms exhaust placement through the `$activeTool` slot (the Exhaust section's
 * toggle, the nozzle editor's "place this one", `X`, a handle click).
 *
 * `armTool` silently REFUSES a tool the current mode disallows, so callers outside Engine
 * mode get a no-op rather than a half-armed state — which is exactly why nothing here
 * mirrors the request into a second boolean.
 */
export function setExhaustPlacing(on: boolean): void {
  if (on) armTool('exhaust');
  else disarmTool('exhaust');
}

/** `X` / the Exhaust section switch: flips exhaust placement. */
export function toggleExhaustPlacing(): void {
  setExhaustPlacing($activeTool.get() !== 'exhaust');
}

/**
 * Steps the exhaust target one chip forward (`.`, `delta = 1`) or back (`,`, `delta = -1`),
 * wrapping at both ends (design §B10). Walks {@link $resolvedNozzleTargets} in chip order so
 * the keyboard and the chip list can never disagree about what "next" means; a no-op when
 * the open engine has no nozzles.
 */
export function cycleExhaustTarget(delta: 1 | -1): void {
  const targets = $resolvedNozzleTargets.get();
  if (targets.length === 0) return;
  const current = targets.findIndex((t) => t.isActive);
  const next = ((current < 0 ? 0 : current) + delta + targets.length) % targets.length;
  $activeNozzleRef.set(targets[next].ref);
}

/**
 * Streaming: patches whichever nozzle a {@link NozzleRef} names, dispatching to the right
 * scope+flavor store action. `Partial<SolidMotorNozzle>` is assignable to
 * `Partial<DeLavalNozzle>` (the De Laval type is a superset), so one patch shape serves
 * both. Every action revalidates its index, so a stale ref is a no-op. Caller pushes undo
 * once at drag/interaction start.
 */
export function updateNozzleAt(ref: NozzleRef, patch: Partial<SolidMotorNozzle>): void {
  if (ref.scope === 'subpart') {
    if (ref.kind === 'delaval') updateNozzle(ref.templateId, ref.index, patch);
    else updateSubPartSolidNozzle(ref.templateId, ref.index, patch);
    return;
  }
  if (ref.kind === 'delaval') updatePartNozzle(ref.index, patch);
  else updatePartSolidNozzle(ref.index, patch);
}

// ── module focus: which ONE module the left editor shows (design §B3.2/§B4/§B9) ──

/**
 * The module-tree groups + the module address, re-exported from `editorStore` (which owns
 * them: they are the address space of the document mutations). Listing them here keeps the
 * designer's imports in one store.
 */
export type { EngineModuleGroup, EngineModuleRef };

/** The groups that only ever exist on `<PartGameData>` — see {@link EngineModuleGroup}. */
export const PART_ONLY_MODULE_GROUPS: readonly EngineModuleGroup[] = [
  'controller',
  'wiring',
  'gimbal',
  'propellant',
];

/** Stable key for an {@link EngineModuleRef} — the tree row's GridList id. */
export function moduleRefKey(ref: EngineModuleRef): string {
  return `${ref.group}|${ref.scope}|${ref.index}`;
}

/** True when both refs name the same module. */
export function sameModuleRef(a: EngineModuleRef | null, b: EngineModuleRef | null): boolean {
  return a !== null && b !== null && moduleRefKey(a) === moduleRefKey(b);
}

/**
 * How many modules a `(group, scope)` pair holds right now — the ONE place that knows which
 * `$part` list backs each group, so the tree, the clamp and the editors can never disagree.
 */
export function engineModuleCount(
  part: EditingPart,
  entry: EngineEntry | null,
  group: EngineModuleGroup,
  scope: 'sub' | 'part',
): number {
  const g = part.gameData;
  if (PART_ONLY_MODULE_GROUPS.includes(group)) {
    if (scope !== 'part') return 0;
    switch (group) {
      case 'controller':
        return g.rocketControllers.length;
      case 'wiring':
        return g.consumerFeedWiring.length;
      case 'gimbal':
        return g.gimbals.length;
      default:
        return part.customReactions.length;
    }
  }
  const owner =
    scope === 'part'
      ? g
      : entry?.kind === 'subpart'
        ? part.subPartGameData.find((s) => s.subPartTemplateId === entry.templateId)
        : undefined;
  if (!owner) return 0;
  switch (group) {
    case 'combustor':
      return owner.combustors.length;
    case 'nozzle':
      return owner.nozzles.length;
    case 'solidMotor':
      return owner.solidMotors.length;
    case 'grain':
      return owner.solidGrainSegments.length;
    case 'solidNozzle':
      return owner.solidNozzles.length;
    default:
      return owner.rockets.length;
  }
}

/**
 * The RAW module focus. Readers should prefer {@link $activeModuleClamped}: a module list
 * shrinks under the focus every time one is removed or undone, and the clamp is what makes
 * that fall back to the overview card instead of rendering an editor over `undefined`.
 */
export const $activeModule = atom<EngineModuleRef | null>(null);

/**
 * Module focus, defensively re-resolved against `$part` on every read — the same contract
 * {@link $resolvedNozzleTargets} keeps for nozzle refs (census invariant: "stale refs
 * degrade, never edit the wrong module"). Null when the index is out of range, when a `sub`
 * ref outlives its scope, or when the open engine changed under it.
 */
export const $activeModuleClamped = computed(
  [$activeModule, $activeEngineEntry, $part],
  (ref, entry, part): EngineModuleRef | null => {
    if (!ref || ref.index < 0) return null;
    return ref.index < engineModuleCount(part, entry, ref.group, ref.scope) ? ref : null;
  },
);

/** Focuses one module in the left editor (null ⇒ the engine summary card). */
export function focusModule(ref: EngineModuleRef | null): void {
  $activeModule.set(ref);
}

/**
 * Opens an engine scope: {@link setActiveEngine} plus a module-focus reset, because a module
 * ref is indexed WITHIN a scope and would otherwise land on whatever happens to sit at the
 * same index in the new one.
 */
export function activateEngine(entry: EngineEntry | null): void {
  setActiveEngine(entry);
  $activeModule.set(null);
  closeDefineEngineFlow();
}

// ── the readout selector + the findings pipeline (design §B6, §B3.3) ────────

/** `$rocketReadoutSel` sentinel: the legacy first-combustor + first-nozzle readout (D6). */
export const FIRST_PAIR_ROCKET = '\0firstPair';

/**
 * Which `<Rocket>` the Performance card aggregates over, or {@link FIRST_PAIR_ROCKET} for
 * v1's first-pair readout. Ephemeral, never persisted, never undoable (§B11 last rows).
 */
export const $rocketReadoutSel = atom<string>(FIRST_PAIR_ROCKET);

export function setRocketReadoutSel(rocketId: string): void {
  $rocketReadoutSel.set(rocketId);
}

/**
 * Engine mode's findings pipeline (design §B3.3, D4) — the same `validateEngines` output the
 * export pre-flight and Data mode's strip read, so the three surfaces can never disagree
 * about what KSA will do with the part. `EngineIssue.source` (P6.02) is what lets a click
 * land on the offending module.
 */
export const $engineFindings = computed([$part, $allReactionIndex], (part, reactions) =>
  validateEngines(part, reactions),
);

/** Blocking-issue count — the Engine mode-switcher attention dot (foundation §2.2). */
export const $engineBlockerCount = computed(
  [$engineFindings],
  (findings) => findings.filter((f) => f.severity === 'block').length,
);

/**
 * A nonce'd "flash this field" intent consumed by the module editors (design §B3.3
 * click-through). The nonce is what lets the SAME field be flashed twice in a row — clicking
 * the same finding again must re-flash rather than silently do nothing.
 */
export const $moduleFlash = atom<{ key: string; nonce: number } | null>(null);

/** Field keys the findings click-through can flash (the field-addressable codes, §B3.3). */
export function flashModuleField(key: string): void {
  $moduleFlash.set({ key, nonce: ($moduleFlash.get()?.nonce ?? 0) + 1 });
}

/**
 * Maps one validation finding onto the module it belongs to, using the editor-targeting
 * metadata `validateEngines` already carries. Returns null when the issue names no module
 * (or names one this scope model has no group for), which the ISSUES list renders as a
 * non-navigating row rather than a jump to nowhere.
 */
export function moduleRefForIssue(
  issue: EngineIssue,
  part: EditingPart,
): { entry: EngineEntry; module: EngineModuleRef } | null {
  const source = issue.source;
  if (!source?.module) return null;
  const group = source.module as EngineModuleGroup;
  const partLevel = PART_ONLY_MODULE_GROUPS.includes(group) || source.templateId === null;
  const entry: EngineEntry = partLevel
    ? { kind: 'part' }
    : { kind: 'subpart', templateId: source.templateId! };
  const scope: 'sub' | 'part' = partLevel ? 'part' : 'sub';
  const index = source.index ?? 0;
  if (index >= engineModuleCount(part, entry, group, scope)) return null;
  return { entry, module: { group, scope, index } };
}

/**
 * ISSUES click-through (design §B3.3): open the finding's scope, focus its module, and flash
 * the offending field when the code is field-addressable. Lives here rather than in the list
 * component so the ISSUES section and the status-bar Engine chip behave identically.
 */
const FIELD_ADDRESSABLE: Readonly<Record<string, string>> = {
  'nozzle-direction-not-unit': 'exhaustDirection',
  'solid-motor-pressure-out-of-range': 'defaultPressure',
  'solid-motor-needs-solid-reaction': 'reactionId',
};

export function focusEngineIssue(issue: EngineIssue): void {
  const target = moduleRefForIssue(issue, $part.get());
  if (target) {
    if (
      engineEntryKey(target.entry) !== engineEntryKey($activeEngineEntry.get() ?? { kind: 'part' })
    )
      setActiveEngine(target.entry);
    focusModule(target.module);
  }
  const field = FIELD_ADDRESSABLE[issue.code];
  if (field) flashModuleField(field);
}

// ── mode entry / exit choreography (design §B2; foundation §2.4) ────────────

/** The cross-mode jump payload Engine mode understands (foundation §2.5, design §B2). */
export interface EngineModePayload {
  /** Add ▸ Define Engine… — open the navigator's define-new menu. */
  defineNew?: boolean;
  /** Seeds the define-new target picker (the placement/template the jump came from). */
  templateId?: string;
  /**
   * Data mode's "Open in Engine mode →" links. `'sub'` is the spelling those links already
   * use; `'subpart'` is {@link EngineEntry}'s. Both are accepted so neither side has to
   * translate.
   */
  engineScope?: { kind: 'part' } | { kind: 'sub' | 'subpart'; templateId: string };
  /** Scroll the module tree to this group (Data's Wiring/Advanced links). */
  group?: EngineModuleGroup;
}

/** The four things "Define new engine ▸" can create (design §B3.1, D12). */
export type EngineDefineKind = 'liquid' | 'rcs' | 'solid' | 'srb';

/**
 * The define-new flow's pushed sub-view, or null when the navigator shows the module tree.
 * `kind: null` = the four-kind chooser; a kind = its target picker (design §B3.1/D13).
 *
 * A STORE atom rather than component state on purpose: `Add ▸ Define Engine…` opens this flow
 * from outside React, and a nonce'd intent copied into `useState` inside an effect is exactly
 * the `useEffect` + `setState` pattern the project bans (AGENTS.md / Rules of React).
 */
export const $engineDefineFlow = atom<{
  kind: EngineDefineKind | null;
  /** Seeds the target picker with the template a cross-mode jump named. */
  templateId: string | null;
} | null>(null);

/** Opens the define-new flow: `null` kind shows the chooser, a kind opens its target picker. */
export function openDefineEngineFlow(
  kind: EngineDefineKind | null,
  templateId: string | null = null,
): void {
  $engineDefineFlow.set({ kind, templateId });
}

export function closeDefineEngineFlow(): void {
  $engineDefineFlow.set(null);
}

/** Asks the navigator to open its define-new chooser, optionally seeded with a template. */
export function requestDefineNewEngine(templateId: string | null = null): void {
  openDefineEngineFlow(null, templateId);
}

/**
 * The module tree's collapsed groups, by tree-group id. In the store rather than in the
 * component so a cross-mode jump can REVEAL a group without an effect writing state, and so
 * the collapse state survives a scope switch.
 */
export const $engineTreeCollapsed = atom<ReadonlySet<string>>(new Set());

export function toggleEngineTreeGroup(id: string): void {
  const next = new Set($engineTreeCollapsed.get());
  if (!next.delete(id)) next.add(id);
  $engineTreeCollapsed.set(next);
}

/** Which tree group each module group belongs to — the solid trio share one. */
const TREE_GROUP_OF: Readonly<Record<EngineModuleGroup, string>> = {
  combustor: 'combustors',
  nozzle: 'nozzles',
  solidMotor: 'solid',
  grain: 'solid',
  solidNozzle: 'solid',
  rocket: 'rockets',
  controller: 'controllers',
  wiring: 'wiring',
  gimbal: 'gimbals',
  propellant: 'propellants',
};

/** Expands the tree group that holds `group` — Data mode's "Open in Engine mode →" links. */
export function jumpToEngineGroup(group: EngineModuleGroup): void {
  const id = TREE_GROUP_OF[group];
  const current = $engineTreeCollapsed.get();
  if (!current.has(id)) return;
  const next = new Set(current);
  next.delete(id);
  $engineTreeCollapsed.set(next);
}

/** True when `entry` still names a scope that carries engine hardware. */
function entryStillValid(entry: EngineEntry | null): boolean {
  if (!entry) return false;
  const key = engineEntryKey(entry);
  return $engineEntries.get().some((e) => engineEntryKey(e) === key);
}

/** The engine scope of the LAST-selected SubPart placement, if that template is one. */
function selectedEngineEntry(): EngineEntry | null {
  const part = $part.get();
  const ids = new Set(
    $engineEntries.get().flatMap((e) => (e.kind === 'subpart' ? [e.templateId] : [])),
  );
  for (const ref of [...$selection.get()].reverse()) {
    if (ref.kind !== 'subpart') continue;
    const templateId = part.placements.find((p) => p.instanceId === ref.id)?.subPartTemplateId;
    if (templateId && ids.has(templateId)) return { kind: 'subpart', templateId };
  }
  return null;
}

let hooksRegistered = false;

/**
 * Registers Engine mode's entry choreography — **the scope ladder, first hit wins**
 * (design §B2):
 *
 * 1. a cross-mode `{engineScope}` jump always wins (and may scroll the tree to a group);
 * 2. else the surviving `$activeEngineEntry`, if it still carries hardware;
 * 3. else the selection's last SubPart, when its template is an engine scope;
 * 4. else the ONE engine scope, when the part has exactly one;
 * 5. else the navigator's empty state.
 *
 * Then `{defineNew}` (which is orthogonal — it opens the creation menu on top of whatever
 * scope the ladder settled on) and the reaction-catalog preload, moved here from the three
 * per-component `useEffect`s v1 had (design §B5, census pain 11).
 *
 * **Exit needs no hook**: `$activeEngineEntry` / `$activeNozzleRef` / `$activeModule` are
 * deliberately RETAINED for the return trip (foundation §2.4), the exhaust tool is cancelled
 * by `setMode` through its `registerTool` def, and the nozzle handles are disposed by
 * `EditorScene`'s `$mode` subscription (hidden-but-pickable handles steal clicks — census
 * invariant).
 *
 * Called from boot (`main.tsx`) like `initDataMode`, so registration order is explicit.
 * Idempotent — StrictMode's double boot is harmless.
 *
 * **DEVIATION (logged)**: the plan's P7.05 file list says "modify `src/state/modeStore.ts`
 * (engine hooks)". The hooks stay HERE: `modeStore` deliberately imports no feature store
 * (that would be a cycle — see its module doc), and area hooks register themselves.
 */
export function initEngineMode(): void {
  if (hooksRegistered) return;
  hooksRegistered = true;

  registerModeHooks('engine', {
    onEnter: (raw) => {
      const payload = raw as EngineModePayload | undefined;
      const jump = payload?.engineScope;
      if (jump) {
        activateEngine(
          jump.kind === 'part'
            ? { kind: 'part' }
            : { kind: 'subpart', templateId: jump.templateId },
        );
        if (payload?.group) jumpToEngineGroup(payload.group);
      } else if (!entryStillValid($activeEngineEntry.get())) {
        const entries = $engineEntries.get();
        activateEngine(selectedEngineEntry() ?? (entries.length === 1 ? entries[0] : null));
      }
      if (payload?.defineNew) requestDefineNewEngine(payload.templateId ?? null);
      else closeDefineEngineFlow();
      void ensureReactionsLoaded();
      // The solid thrust-curve libraries ride the same sanctioned preload (design D7): both
      // are read-only Core data, and both are legitimately absent in the OSS build.
      void ensureSolidCurveDataLoaded();
    },
  });
}
