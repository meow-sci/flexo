import { atom, computed } from 'nanostores';
import type {
  SolidMotorNozzle,
  SubPartGameData,
  SubPartPlacement,
  Transform,
  Vec3,
} from '../ksa/types';
import {
  $part,
  $toolMode,
  updateNozzle,
  updatePartNozzle,
  updatePartSolidNozzle,
  updateSubPartSolidNozzle,
  type ToolMode,
} from './editorStore';
import { $mode, registerModeHooks, setMode } from './modeStore';

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

/** Whether the 3D exhaust gizmo is active for the targeted nozzle. */
export const $engineExhaustGizmo = atom<boolean>(false);

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
 */
export const $isExhaustPlacing = computed(
  [$mode, $engineExhaustGizmo, $activeNozzleTarget],
  (mode, on, target) => mode === 'engine' && on && target !== null,
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

/** Opens the Engine designer, optionally on a specific engine scope. */
export function enterEngineMode(entry?: EngineEntry | null): void {
  if (entry !== undefined) setActiveEngine(entry);
  setMode('engine');
}

/** Closes the Engine designer, returning to Build. */
export function exitEngineMode(): void {
  setMode('build');
}

/**
 * Leaving Engine mode (design: foundation.md §2.4). The gizmo teardown lives HERE, not in
 * {@link exitEngineMode}, so it runs on every route out of the mode — a digit key, the
 * menubar switcher, the status chip — and not only the designer's Close button. Hidden
 * but pickable nozzle handles steal viewport clicks (census invariant); the handles
 * themselves are disposed by EditorScene's `$mode` subscription.
 *
 * `$activeEngineEntry` is deliberately RETAINED so returning to the mode reopens the same
 * engine (§2.4 per-mode sub-state survives).
 */
registerModeHooks('engine', {
  onExit: () => {
    $engineExhaustGizmo.set(false);
  },
});

/** Selects which engine (scope) the designer edits, resetting its sub-selection. */
export function setActiveEngine(entry: EngineEntry | null): void {
  $activeEngineEntry.set(entry);
  $activeNozzleRef.set(null);
  $engineExhaustGizmo.set(false);
}

/** Selects the SubPart-template engine with the given id (null ⇒ none). */
export function setActiveEngineTemplate(id: string | null): void {
  setActiveEngine(id ? { kind: 'subpart', templateId: id } : null);
}

/** Targets one nozzle handle with the 3D gizmo (null ⇒ back to the first). */
export function setActiveNozzleRef(ref: NozzleRef | null): void {
  $activeNozzleRef.set(ref);
}

/** Toggles the 3D exhaust gizmo for the targeted nozzle. */
export function setEngineExhaustGizmo(on: boolean): void {
  $engineExhaustGizmo.set(on);
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
