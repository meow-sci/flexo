import type { Keys, Options } from 'react-hotkeys-hook';
import { $paletteOpen, closePalette, runCommand } from '../../state/commandStore';
import { closeDialog, isDialogOpen } from '../../state/dialogStore';
import { $activeScopes } from '../../state/hotkeyStore';
import { $chainSession, closeChain } from '../../state/chainStore';
import { $measureTool, setMeasureTool } from '../../state/measurementStore';
import { $isExhaustPlacing, setEngineExhaustGizmo } from '../../state/engineStore';
import { $activeJointId, $editKeyframeId } from '../../state/animationStore';
import { $mode } from '../../state/modeStore';
import { $seatView } from '../../state/ivaStore';
import { $gizmoDragging, requestGizmoCancel } from '../../state/viewStore';
import { rotateSelectionAroundPair } from '../../three/rotateSelection';
import { FAST_NUDGE_MULTIPLIER, nudgeSelectionBy } from '../../three/nudgeSelection';
import { changeNudgeAxis, lowerNudgeStep, raiseNudgeStep } from '../nudgeControls';
import { changeRotateAxes, lowerRotateStep, raiseRotateStep } from '../rotateControls';
import { applyChainSession } from '../chain/applyChainSession';
import { normalizeKeys, scopeRank, type Scope } from './keys';
import { isInteractiveCollectionFocus } from './typingGuard';
import { dispatchEsc, registerEscRung } from './escLadder';
import { validateRegistry } from './validateRegistry';

/**
 * The **scoped hotkey registry** — the single source of truth for every keyboard binding in
 * flexo (design: `plans/flexo_v2/design/foundation.md` §11.1; `design-system-services.md`
 * §4.1). It drives the live bindings (`GlobalHotkeys` wires one `useHotkeys` per entry), the
 * chord chips in menus / the palette / Help (`chordsFor`), and the conflict validator.
 *
 * **There are no off-registry bindings in v2** (design §4.1). A pure-key behavior with no
 * command — the WASDQER rotate keys, the nudge arrows — carries a synthetic `transform.*`
 * id so Help and conflict detection still see it. The one deliberate exception is
 * `useNumberDraft`'s per-field keys, which stay field-local by design and are documented in
 * Help's static section.
 *
 * **Binding ids ARE command ids** wherever a command exists, and those bindings do nothing
 * but `runCommand(id)`: that is what lets a menu item, a palette row and a chord chip all
 * describe one behavior, with the toast strings and enabled predicates living once in
 * `src/ui/commands/*.ts`.
 *
 * ## What changed from the v1 flat registry
 *
 * Every binding now declares a {@link Scope}, and `GlobalHotkeys` enables it only while that
 * scope is in `hotkeyStore.$activeScopes`. The visible consequences at this step:
 * - the spatial keys (WASDQER, the nudge arrows) and the edit chords (⌫, ⌘C/⌘X/⌘V/⌘D) are
 *   **viewport**-scoped: dead while an overlay dialog is open and dead while a react-aria
 *   list/menu has focus (its own row navigation owns those keys). ⌘Z stays **global**, so
 *   undo keeps working with a dialog open, exactly as in v1.
 * - Escape is ONE binding running the ordered ladder (`escLadder.ts`); the v1 seat-view
 *   binding, the chain palette's local hooks and the animation panel's raw window listener
 *   are all gone, absorbed as rungs 8, 6 and 7.
 *
 * ## Adding a binding (the rules later phases follow)
 *
 * 1. Pick the NARROWEST scope that works; `global` is for app-level chords only.
 * 2. `id` must be a registered command id, or a documented synthetic id (a `transform.*` id
 *    or an entry in `validateRegistry.ts`'s `SYNTHETIC_BINDING_IDS`).
 * 3. `chords` are platform-neutral display tokens (`['mod','K']`); `keyLabel` resolves ⌘ vs
 *    Ctrl at render. They must describe the same keys as `keys`.
 * 4. Anything that needs to cancel on Escape registers an {@link registerEscRung} rung
 *    instead of its own `escape` binding.
 */

/** One key chord, as display tokens (resolved to glyphs by `keyLabel`). */
export type KeyChord = string[];

export interface HotkeyBinding {
  /** `== commandId` where a command exists; otherwise a documented synthetic id. */
  id: string;
  /** Human-readable description shown in the help table. */
  label: string;
  /** react-hotkeys-hook key string(s) this binding listens for. `mod+` = ⌘ / Ctrl. */
  keys: Keys;
  /**
   * The chords shown as <kbd> chips in help, menus and the palette. Multiple chords render
   * as alternatives ("A or B"); usually a single chord matching `keys`.
   */
  chords: KeyChord[];
  /** Where this binding is allowed to fire (foundation §11.1). */
  scope: Scope;
  /** Cheap store-predicate gate, evaluated per event on top of the scope. */
  when?: () => boolean;
  /** Command ids this binding intentionally shadows — documents a deliberate conflict. */
  overrides?: string[];
  /** Esc-ladder position, for Help + the ordering assertion. See `escLadder.ts`. */
  escRung?: number;
  /** Per-binding react-hotkeys-hook options (merged over the shared defaults). */
  options?: Options;
  /** Invoked when the chord fires. Receives the keyboard event (e.g. to tell arrows apart). */
  run: (event: KeyboardEvent) => void;
}

export interface HotkeyGroup {
  title: string;
  bindings: HotkeyBinding[];
}

/**
 * The bindings, grouped for the (still v1) Help dialog.
 *
 * TODO(P4.11): Help regenerates from `scope` with the static sections and the rebind diff;
 * these titles are the interim grouping, not part of the registry contract.
 */
export const HOTKEY_GROUPS: HotkeyGroup[] = [
  {
    title: 'Rotate selection',
    bindings: [
      {
        id: 'transform.rotate.ws',
        label: 'Rotate selection — W/S pair',
        keys: ['w', 's'],
        chords: [['W', 'S']],
        scope: 'viewport',
        run: (e) => rotateSelectionAroundPair('ws', e.key.toLowerCase() === 'w' ? -1 : 1),
      },
      {
        id: 'transform.rotate.ad',
        label: 'Rotate selection — A/D pair',
        keys: ['a', 'd'],
        chords: [['A', 'D']],
        scope: 'viewport',
        run: (e) => rotateSelectionAroundPair('ad', e.key.toLowerCase() === 'a' ? 1 : -1),
      },
      {
        id: 'transform.rotate.qe',
        label: 'Rotate selection — Q/E pair',
        keys: ['q', 'e'],
        chords: [['Q', 'E']],
        scope: 'viewport',
        run: (e) => rotateSelectionAroundPair('qe', e.key.toLowerCase() === 'q' ? 1 : -1),
      },
      {
        id: 'transform.rotate.cycleAxes',
        label: 'Cycle rotation axes',
        keys: 'r',
        chords: [['R']],
        scope: 'viewport',
        run: () => changeRotateAxes(),
      },
      {
        // TODO(P4.08): rebound to `[` / `]` as two bindings, `transform.rotateStep.down/up`
        // (design: foundation S6). `F` becomes Frame Selection in P4.09.
        id: 'transform.rotateStep',
        label: 'Rotation step (F larger · ⇧F smaller)',
        keys: ['f', 'shift+f'],
        chords: [['F'], ['shift', 'F']],
        scope: 'viewport',
        run: (e) => (e.shiftKey ? lowerRotateStep() : raiseRotateStep()),
      },
    ],
  },
  {
    title: 'Nudge',
    bindings: [
      {
        id: 'transform.nudge.move',
        label: 'Nudge selection along axis',
        keys: ['up', 'down'],
        chords: [['↑', '↓']],
        scope: 'viewport',
        run: (e) => nudgeSelectionBy(e.key === 'ArrowDown' ? -1 : 1),
      },
      {
        id: 'transform.nudge.moveFast',
        label: `Nudge ×${FAST_NUDGE_MULTIPLIER} (coarse)`,
        keys: ['shift+up', 'shift+down'],
        chords: [['shift', '↑', '↓']],
        scope: 'viewport',
        run: (e) => nudgeSelectionBy(e.key === 'ArrowDown' ? -1 : 1, FAST_NUDGE_MULTIPLIER),
      },
      {
        id: 'transform.nudge.axis',
        label: 'Change axis (← back · → forward)',
        keys: ['left', 'right'],
        chords: [['←', '→']],
        scope: 'viewport',
        run: (e) => changeNudgeAxis(e.key === 'ArrowLeft' ? -1 : 1),
      },
      {
        id: 'transform.nudge.step',
        label: 'Change step (⇧← smaller · ⇧→ larger)',
        keys: ['shift+left', 'shift+right'],
        chords: [['shift', '←', '→']],
        scope: 'viewport',
        run: (e) => (e.key === 'ArrowLeft' ? lowerNudgeStep() : raiseNudgeStep()),
      },
    ],
  },
  {
    title: 'Editing',
    bindings: [
      {
        id: 'edit.delete',
        label: 'Delete selection',
        keys: ['delete', 'backspace'],
        chords: [['Delete'], ['Backspace']],
        scope: 'viewport',
        run: () => runCommand('edit.delete'),
      },
      {
        id: 'edit.copy',
        label: 'Copy selection',
        keys: 'mod+c',
        chords: [['mod', 'C']],
        scope: 'viewport',
        run: () => runCommand('edit.copy'),
      },
      {
        id: 'edit.cut',
        label: 'Cut selection',
        keys: 'mod+x',
        chords: [['mod', 'X']],
        scope: 'viewport',
        run: () => runCommand('edit.cut'),
      },
      {
        id: 'edit.paste',
        label: 'Paste in place',
        keys: 'mod+v',
        chords: [['mod', 'V']],
        scope: 'viewport',
        run: () => runCommand('edit.paste'),
      },
      {
        id: 'edit.duplicate',
        label: 'Duplicate selection',
        keys: 'mod+d',
        chords: [['mod', 'D']],
        scope: 'viewport',
        run: () => runCommand('edit.duplicate'),
      },
      {
        id: 'chain.begin',
        label: 'Begin action chain (selection)',
        // Rebound from ⌘K, which the command palette now owns (LOCKED). A session with
        // steps is never discarded silently — the command asks first.
        keys: 'mod+shift+k',
        chords: [['mod', 'shift', 'K']],
        scope: 'global',
        run: () => runCommand('chain.begin'),
      },
      {
        // Was a component-local `useHotkeys` in ChainPalette, invisible to Help (census
        // §1.3). `surface:chain` is active while the SESSION exists, so this reaches the
        // chain from anywhere — including mid-drag in the viewport, as before.
        id: 'chain.apply',
        label: 'Apply action chain',
        keys: 'mod+enter',
        chords: [['mod', '↵']],
        scope: 'surface:chain',
        // v1 options, verbatim: the chain applies from inside its own step fields.
        options: { enableOnFormTags: true, preventDefault: true },
        run: () => applyChainSession(),
      },
      {
        id: 'edit.undo',
        label: 'Undo',
        keys: 'mod+z',
        chords: [['mod', 'Z']],
        scope: 'global',
        run: () => runCommand('edit.undo'),
      },
      {
        id: 'edit.redo',
        label: 'Redo',
        keys: ['mod+y', 'mod+shift+z'],
        chords: [
          ['mod', 'Y'],
          ['mod', 'shift', 'Z'],
        ],
        scope: 'global',
        run: () => runCommand('edit.redo'),
      },
    ],
  },
  {
    title: 'Dialogs & app',
    bindings: [
      {
        id: 'palette.open',
        label: 'Search commands',
        keys: 'mod+k',
        chords: [['mod', 'K']],
        scope: 'global',
        run: () => runCommand('palette.open'),
      },
      {
        id: 'file.projects',
        label: 'Projects',
        keys: 'mod+o',
        chords: [['mod', 'O']],
        scope: 'global',
        run: () => runCommand('file.projects'),
      },
      {
        id: 'file.exportKsa',
        label: 'Export to KSA',
        keys: 'mod+e',
        chords: [['mod', 'E']],
        scope: 'global',
        run: () => runCommand('file.exportKsa'),
      },
      {
        id: 'window.assetManager',
        label: 'Asset Manager',
        keys: 'mod+shift+a',
        chords: [['mod', 'shift', 'A']],
        scope: 'global',
        run: () => runCommand('window.assetManager'),
      },
      {
        id: 'edit.settings',
        label: 'Settings',
        keys: 'mod+comma',
        chords: [['mod', ',']],
        scope: 'global',
        run: () => runCommand('edit.settings'),
      },
      {
        id: 'noop.autosaveFlash',
        // There is no Save: the workspace autosaves. ⌘S answers the reflex instead of
        // handing the user the browser's save-page dialog (the shared preventDefault).
        label: 'Save (autosave is always on)',
        keys: 'mod+s',
        chords: [['mod', 'S']],
        scope: 'global',
        run: () => runCommand('noop.autosaveFlash'),
      },
    ],
  },
  {
    title: 'General',
    bindings: [
      {
        id: 'help.shortcuts',
        label: 'Show keyboard shortcuts',
        keys: '?',
        chords: [['?']],
        scope: 'global',
        // Match the produced character ("?") regardless of physical key/layout, and
        // ignore modifiers: on US layouts "?" is Shift+/, and react-hotkeys-hook
        // otherwise rejects the match because the held Shift isn't part of the combo.
        options: { useKey: true, ignoreModifiers: true },
        // Toggling is v1 behavior worth keeping, and a command cannot express it (the
        // menu item must only ever OPEN); the close half stays here.
        run: () => (isDialogOpen('help') ? closeDialog() : void runCommand('help.shortcuts')),
      },
      {
        // The whole Escape ladder is this ONE binding (foundation §11.4). Never
        // preventDefault at the binding level — each rung declares its own contract, and
        // Escape must keep reaching dialogs, popovers and menus untouched when no rung
        // applies. `enableOnFormTags` so the chain can cancel from inside its own fields;
        // the ladder re-applies the typing guard per rung.
        id: 'esc.ladder',
        label: 'Cancel / dismiss (the Escape ladder)',
        keys: 'escape',
        chords: [['Escape']],
        scope: 'global',
        options: { preventDefault: false, enableOnFormTags: true },
        run: (e) => dispatchEsc(e),
      },
    ],
  },
];

/** Flattened bindings, for the component that wires `useHotkeys` per binding. */
export const ALL_BINDINGS: HotkeyBinding[] = HOTKEY_GROUPS.flatMap((g) => g.bindings);

// ── the Escape ladder's flexo-owned rungs (foundation §11.4) ─────────────────
//
// Registered here rather than in `escLadder.ts` so the ladder module stays a pure
// dispatcher, and so every key binding in the app — Escape included — is declared in this
// one file. Rungs 1 (numberDraft) and 2 (react-aria) are not registrable; see escLadder.ts.

registerEscRung({
  rung: 3,
  id: 'palette.close',
  label: 'Close the command palette',
  when: () => $paletteOpen.get(),
  run: () => closePalette(),
  preventDefault: true,
});

registerEscRung({
  rung: 4,
  id: 'gizmo.cancelDrag',
  label: 'Cancel the gizmo drag in flight',
  when: () => $gizmoDragging.get(),
  // EditorScene answers with TransformControls.reset(), restoring the drag-start transform.
  run: () => requestGizmoCancel(),
  // The drag owns the pointer, not the browser's default action.
  preventDefault: false,
});

registerEscRung({
  rung: 5,
  id: 'tool.cancel',
  label: 'Cancel the armed tool',
  // P5B re-points this to $activeTool (and adds marquee) once the tools route through the
  // single slot; the target functions stay the same.
  when: () => $measureTool.get() !== 'none' || $isExhaustPlacing.get(),
  run: () => {
    // EditorScene's existing $measureTool subscription cancels the half-placed pick and
    // restores the cursor, so disarming is the whole cancel.
    if ($measureTool.get() !== 'none') setMeasureTool('none');
    else setEngineExhaustGizmo(false);
  },
  preventDefault: true,
});

registerEscRung({
  rung: 6,
  id: 'chain.cancel',
  label: 'Cancel the action chain',
  when: () => $chainSession.get() !== null,
  // P4 keeps v1's silent cancel. The ≥1-step discard-confirm (LOCKED) ships with the chain
  // FloatingWindow in P5B.
  run: () => closeChain(),
  // v1 contract: Escape must still reach dialogs/popovers, and useNumberDraft's dirty
  // revert (rung 1) must win over cancelling the session.
  preventDefault: false,
  // v1 `enableOnFormTags: true` — cancel works from inside the step fields.
  enableWhileTyping: true,
});

registerEscRung({
  rung: 7,
  id: 'anim.unwind',
  label: 'Unwind: posed keyframe → active joint',
  when: () =>
    $mode.get() === 'animation' &&
    ($editKeyframeId.get() !== null || $activeJointId.get() !== null),
  run: () => {
    if ($editKeyframeId.get() !== null) $editKeyframeId.set(null);
    else $activeJointId.set(null);
  },
  // Deliberate change from v1's three-step unwind: the clip no longer closes on the third
  // Escape — "the mode itself never exits via Esc" (foundation §11.4 rung 7).
  preventDefault: true,
});

registerEscRung({
  rung: 8,
  id: 'seat.exit',
  label: 'Leave IVA seat view',
  when: () => $seatView.get() !== null,
  run: () => {
    runCommand('seat.exit');
  },
  // v1 contract, preserved verbatim: never preventDefault — Escape also dismisses
  // dialogs/popovers/menus and this must not shadow them.
  preventDefault: false,
});

// ── scope activation + precedence ────────────────────────────────────────────

/**
 * Is this scope live right now? `viewport` carries the extra DOM condition the store cannot
 * answer: focus must not be inside an interactive react-aria collection, whose own row
 * navigation owns the bare keys (foundation §11.1).
 */
export function isScopeActive(scope: Scope): boolean {
  if (!$activeScopes.get().has(scope)) return false;
  return scope !== 'viewport' || !isInteractiveCollectionFocus();
}

/**
 * Precedence — **surface > tool > mode > viewport > global** (foundation §11.1). Bindings
 * sharing a normalized key string are ranked once, at module init; at dispatch a lower-rank
 * binding is suppressed while any higher-rank one is currently active. This is what lets a
 * focused surface override a viewport key without a preventDefault fight.
 */
const higherPrecedence = new Map<HotkeyBinding, HotkeyBinding[]>();
{
  const byKey = new Map<string, HotkeyBinding[]>();
  for (const binding of ALL_BINDINGS) {
    for (const key of normalizeKeys(binding.keys)) {
      const group = byKey.get(key);
      if (group) group.push(binding);
      else byKey.set(key, [binding]);
    }
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    for (const binding of group) {
      const higher = group.filter(
        (other) => other !== binding && scopeRank(other.scope) > scopeRank(binding.scope),
      );
      if (higher.length === 0) continue;
      const existing = higherPrecedence.get(binding);
      if (existing) existing.push(...higher.filter((h) => !existing.includes(h)));
      else higherPrecedence.set(binding, higher);
    }
  }
}

/**
 * The enabled predicate `GlobalHotkeys` gates every event on: scope live, `when` true, and
 * nothing higher-precedence claiming the same keys. The typing guard is applied separately
 * (it depends on the binding's `enableOnFormTags`), see `GlobalHotkeys`.
 */
export function isBindingActive(binding: HotkeyBinding): boolean {
  if (!isScopeActive(binding.scope)) return false;
  if (binding.when?.() === false) return false;
  const higher = higherPrecedence.get(binding);
  return !higher?.some((other) => isScopeActive(other.scope) && other.when?.() !== false);
}

// ── dev-time validation ──────────────────────────────────────────────────────

if (import.meta.env.DEV) {
  // Deferred one microtask: the command modules (`src/ui/commands/index.ts`) register
  // AFTER this module is evaluated, and the "every binding id is a command" check needs
  // them. Reported rather than thrown at the top level so a registry mistake is loud in the
  // console without taking the whole app (or a unit-test file) down with it — the P4.13
  // suite calls `validateRegistry` directly and asserts on the throw.
  queueMicrotask(() => {
    try {
      validateRegistry(ALL_BINDINGS);
    } catch (err) {
      console.error(err);
    }
  });
}
