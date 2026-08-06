import type { Keys, Options } from 'react-hotkeys-hook';
import { $paletteOpen, closePalette, runCommand } from '../../state/commandStore';
import { closeDialog, isDialogOpen } from '../../state/dialogStore';
import { $activeScopes, $dialogOpen, $focusedSurface } from '../../state/hotkeyStore';
import { $chainSession } from '../../state/chainStore';
import {
  $activeJointId,
  $editKeyframeId,
  $pivotEditing,
  $playheadParked,
  $timelineSelection,
  returnToRest,
  setPivotEditing,
  stepPlayhead,
  stepToKeyframe,
} from '../../state/animationStore';
import {
  clearColumnSelection,
  copySelectedColumns,
  cutSelectedColumns,
  deleteSelectedColumns,
  fitClip,
  fitSelection,
  insertKeyframeAtPlayhead,
  pasteColumnsAtPlayhead,
  selectAllColumns,
  snapPlayheadToKeyframe,
  togglePlayback,
  zoomTimelineAboutPlayhead,
} from '../animation/timelineActions';
import { $activeTool, $mode, disarmTool, MODES } from '../../state/modeStore';
import { $seatView } from '../../state/ivaStore';
import { $gizmoDragging, requestGizmoCancel } from '../../state/viewStore';
import { rotateSelectionAroundPair } from '../../three/rotateSelection';
import { FAST_NUDGE_MULTIPLIER, nudgeSelectionBy } from '../../three/nudgeSelection';
import { changeNudgeAxis, lowerNudgeStep, raiseNudgeStep } from '../nudgeControls';
import { changeRotateAxes, lowerRotateStep, raiseRotateStep } from '../rotateControls';
import { applyChainSession } from '../chain/applyChainSession';
import { cancelChainSession } from '../chain/openChainPalette';
import { normalizeKeys, scopeRank, type Scope } from './keys';
import { isInteractiveCollectionFocus } from './typingGuard';
import { dispatchEsc, registerEscRung } from './escLadder';
import { registerListSurfaceEditMirrors } from './listSurfaceMirrors';
import { focusOutlinerSearch } from '../outliner/outlinerSearch';
import {
  glowPaintCanRedo,
  glowPaintCanUndo,
  glowPaintRedo,
  glowPaintUndo,
} from '../glowPaintControls';
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
 * The bindings. The grouping is **source organization only** — it keeps related bindings
 * together in this file and nothing consumes the titles: Help groups by `scope`
 * (`HelpDialog.tsx`), and every other consumer reads the flat {@link ALL_BINDINGS}. Add a
 * binding to whichever group reads best, or start a new one.
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
        // REBOUND from `⇧F` (design: foundation S6 — "the bracket pair reads as
        // smaller/larger"); `F` is Frame Selection now. One key per binding so the Help
        // chips read `[` and `]` rather than one two-chord row.
        //
        // `bracketleft`, not `[`: react-hotkeys-hook matches `event.code` by default, and
        // `event.key` only with `useKey`. Naming the physical key is what makes ⌥[ work on
        // macOS, where Option+[ produces `“` rather than `[` (the same reason the Settings
        // binding is spelled `mod+comma`).
        id: 'transform.rotateStep.down',
        label: 'Rotation step — smaller',
        keys: 'bracketleft',
        chords: [['[']],
        scope: 'viewport',
        run: () => lowerRotateStep(),
      },
      {
        id: 'transform.rotateStep.up',
        label: 'Rotation step — larger',
        keys: 'bracketright',
        chords: [[']']],
        scope: 'viewport',
        run: () => raiseRotateStep(),
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
    title: 'Camera',
    bindings: [
      {
        // THE rebind (LOCKED #7): `F` was the v1 rotate-step key, which moved to `[`/`]`.
        // Frames the selection, or the whole part when nothing is selected.
        id: 'view.frameSelection',
        label: 'Frame selection',
        keys: 'f',
        chords: [['F']],
        scope: 'viewport',
        run: () => runCommand('view.frameSelection'),
      },
    ],
  },
  {
    title: 'Selection',
    bindings: [
      {
        // Viewport-scoped so a focused react-aria list keeps its own row select-all
        // (foundation §11.1 exception) — `isScopeActive` drops `viewport` on collection
        // focus, and the list mirrors deliberately omit ⌘A.
        id: 'select.all',
        label: 'Select all',
        keys: 'mod+a',
        chords: [['mod', 'A']],
        scope: 'viewport',
        run: () => runCommand('select.all'),
      },
      {
        id: 'select.none',
        label: 'Deselect all',
        keys: 'alt+mod+a',
        chords: [['alt', 'mod', 'A']],
        scope: 'viewport',
        run: () => runCommand('select.none'),
      },
      {
        id: 'select.invert',
        label: 'Invert selection',
        keys: 'mod+shift+i',
        chords: [['mod', 'shift', 'I']],
        scope: 'viewport',
        run: () => runCommand('select.invert'),
      },
    ],
  },
  {
    title: 'Tools',
    bindings: [
      {
        id: 'tool.cycleGizmo',
        label: 'Cycle gizmo tool (⇧T backward)',
        keys: ['t', 'shift+t'],
        chords: [['T'], ['shift', 'T']],
        scope: 'viewport',
        run: (e) => runCommand('tool.cycleGizmo', e.shiftKey ? -1 : 1),
      },
      {
        // Arms the one-shot replace marquee (design-build-mode.md §1.4; foundation §14.1).
        // Viewport-scoped for the same C5 reason as `M`: a tool must never arm invisibly
        // behind a dialog. Escape disarms it through ladder rung 5. Spelled `b`, the
        // physical key — react-hotkeys-hook matches `event.code` by default.
        id: 'tool.marquee',
        label: 'Box select (marquee)',
        keys: 'b',
        chords: [['B']],
        scope: 'viewport',
        run: () => runCommand('tool.marquee'),
      },
      {
        // Viewport-scoped for symmetry with `B` (design §4.4, the C5 fix): a tool must never
        // arm invisibly behind a dialog. Escape disarms it through ladder rung 5.
        id: 'tool.measure',
        label: 'Measure point-to-point',
        keys: 'm',
        chords: [['M']],
        scope: 'viewport',
        run: () => runCommand('tool.measure'),
      },
      {
        // Mode-scoped: exhaust placement only exists inside the Engine designer
        // (design: design-data-engine-modes.md §B10 — v1 had no engine hotkeys at all).
        id: 'engine.toggleExhaust',
        label: 'Toggle exhaust placement',
        keys: 'x',
        chords: [['X']],
        scope: 'mode:engine',
        // `mode:*` survives an open dialog, so the bare letter needs its own gate to satisfy
        // the C5 assertion (`validateRegistry` rule 4).
        when: () => !$dialogOpen.get(),
        run: () => runCommand('engine.toggleExhaust'),
      },
      {
        // Tool-scoped: cycling only means something while the exhaust tool holds the slot,
        // and the chip list + the 3D handles are the same ordered set (design §B10). The
        // `,`/`.` collision with `mode:animation`'s transport is nominal — different scopes,
        // never both active.
        id: 'engine.prevExhaustTarget',
        label: 'Previous exhaust target',
        keys: 'comma',
        chords: [[',']],
        scope: 'tool:exhaust',
        // `tool:*` survives an open dialog like `mode:*` does, and re-targeting a nozzle
        // behind the Export dialog would be an invisible edit to what the gizmo drags next.
        when: () => !$dialogOpen.get(),
        run: () => runCommand('engine.prevExhaustTarget'),
      },
      {
        id: 'engine.nextExhaustTarget',
        label: 'Next exhaust target',
        keys: 'period',
        chords: [['.']],
        scope: 'tool:exhaust',
        when: () => !$dialogOpen.get(),
        run: () => runCommand('engine.nextExhaustTarget'),
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
        // `⌥[` / `⌥]` — spelled by physical key (`bracketleft`) rather than `[`, because
        // Option+[ produces `“` on macOS and `useKey` would never match it.
        id: 'window.toggleLeft',
        label: 'Toggle the left sidebar',
        keys: 'alt+bracketleft',
        chords: [['alt', '[']],
        scope: 'global',
        run: () => runCommand('window.toggleLeft'),
      },
      {
        id: 'window.toggleRight',
        label: 'Toggle the right sidebar',
        keys: 'alt+bracketright',
        chords: [['alt', ']']],
        scope: 'global',
        run: () => runCommand('window.toggleRight'),
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
    title: 'Modes',
    // Digits `1`–`5` in `MODES` order, one binding each. They are `global` (a mode switch is
    // an app-level move, not a viewport gesture) but carry the `when` gate the design spells
    // out: a mode must never switch invisibly behind an overlay dialog (design §4.4 row 1,
    // the C5 fix — and the validator's bare-digit assertion depends on exactly this `when`).
    bindings: MODES.map((mode, index) => ({
      id: `mode.${mode.id}`,
      label: `Go to ${mode.label} mode`,
      keys: `${index + 1}`,
      chords: [[`${index + 1}`]],
      scope: 'global' as const,
      when: () => !$dialogOpen.get(),
      run: () => runCommand(`mode.${mode.id}`),
    })),
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
  {
    // The Animation mode's transport keys (design-animation-mode.md §12.1). They STACK on
    // the viewport scope, so W/S/A/D/Q/E and the nudge arrows keep acting on the placement
    // selection while posing — unchanged from v1 (S8). `⇧K` stays deliberately UNBOUND.
    //
    // Every one carries the `!$dialogOpen` gate: `mode:*` survives an open dialog, and a
    // transport that plays (or inserts a keyframe!) behind the Export dialog is exactly the
    // C5 regression class the validator's rule 4 exists to catch.
    title: 'Animation mode',
    bindings: [
      {
        id: 'anim.playPause',
        label: 'Play / pause the preview',
        keys: 'space',
        chords: [['Space']],
        scope: 'mode:animation',
        when: () => !$dialogOpen.get(),
        run: () => togglePlayback(),
      },
      {
        // `comma`/`period`, not `,`/`.`: `,` is react-hotkeys-hook's own alternatives
        // delimiter. The nominal clash with `tool:exhaust`'s target stepping is resolved by
        // precedence (tool > mode) and can only arise inside the Engine mode anyway.
        id: 'anim.prevKeyframe',
        label: 'Previous keyframe (parks + pins)',
        keys: 'comma',
        chords: [[',']],
        scope: 'mode:animation',
        when: () => !$dialogOpen.get(),
        run: () => stepToKeyframe(-1),
      },
      {
        id: 'anim.nextKeyframe',
        label: 'Next keyframe (parks + pins)',
        keys: 'period',
        chords: [['.']],
        scope: 'mode:animation',
        when: () => !$dialogOpen.get(),
        run: () => stepToKeyframe(1),
      },
      {
        id: 'anim.insertKeyframe',
        label: 'Insert a keyframe at the playhead',
        keys: 'k',
        chords: [['K']],
        scope: 'mode:animation',
        when: () => !$dialogOpen.get(),
        run: () => insertKeyframeAtPlayhead(),
      },
    ],
  },
  {
    // The dopesheet's own keys (design §12.2), live only while the dock has FOCUS — which is
    // what lets `←`/`→` step frames over the viewport's nudge arrows and `F` fit the clip
    // over Frame Selection, by precedence rather than a preventDefault fight. Clicking the
    // viewport hands focus back and the viewport bindings return.
    title: 'Timeline',
    bindings: [
      {
        id: 'timeline.stepFrame',
        label: 'Step the playhead one bake frame (1/30 s)',
        keys: ['left', 'right'],
        chords: [['←', '→']],
        scope: 'surface:timeline',
        when: () => !$dialogOpen.get(),
        overrides: ['transform.nudge.axis'],
        run: (e) => stepPlayhead(e.key === 'ArrowLeft' ? -1 : 1),
      },
      {
        id: 'timeline.snapKeyframe',
        label: 'Snap the playhead to the previous / next keyframe',
        keys: ['shift+left', 'shift+right'],
        chords: [['shift', '←', '→']],
        scope: 'surface:timeline',
        when: () => !$dialogOpen.get(),
        overrides: ['transform.nudge.step'],
        // Parks WITHOUT pinning — deliberately distinct from `,`/`.` (design §12.2).
        run: (e) => snapPlayheadToKeyframe(e.key === 'ArrowLeft' ? -1 : 1),
      },
      {
        id: 'timeline.selectAll',
        label: 'Select all columns',
        keys: 'mod+a',
        chords: [['mod', 'A']],
        scope: 'surface:timeline',
        when: () => !$dialogOpen.get(),
        run: () => selectAllColumns(),
      },
      {
        id: 'timeline.selectNone',
        label: 'Deselect all columns',
        keys: 'alt+mod+a',
        chords: [['alt', 'mod', 'A']],
        scope: 'surface:timeline',
        when: () => !$dialogOpen.get(),
        run: () => clearColumnSelection(),
      },
      {
        id: 'timeline.copy',
        label: 'Copy the selected keyframes',
        keys: 'mod+c',
        chords: [['mod', 'C']],
        scope: 'surface:timeline',
        when: () => !$dialogOpen.get(),
        run: () => copySelectedColumns(),
      },
      {
        id: 'timeline.cut',
        label: 'Cut the selected keyframes',
        keys: 'mod+x',
        chords: [['mod', 'X']],
        scope: 'surface:timeline',
        when: () => !$dialogOpen.get(),
        run: () => cutSelectedColumns(),
      },
      {
        id: 'timeline.paste',
        label: 'Paste keyframes at the playhead',
        keys: 'mod+v',
        chords: [['mod', 'V']],
        scope: 'surface:timeline',
        when: () => !$dialogOpen.get(),
        run: () => pasteColumnsAtPlayhead(),
      },
      {
        id: 'timeline.delete',
        label: 'Delete the selected keyframes',
        keys: ['delete', 'backspace'],
        chords: [['Delete'], ['Backspace']],
        scope: 'surface:timeline',
        when: () => !$dialogOpen.get(),
        run: () => deleteSelectedColumns(),
      },
      {
        id: 'timeline.zoom',
        label: 'Zoom in / out about the playhead',
        keys: ['equal', 'minus'],
        chords: [['='], ['-']],
        scope: 'surface:timeline',
        when: () => !$dialogOpen.get(),
        run: (e) => zoomTimelineAboutPlayhead(e.code === 'Minus' ? 1 / 1.3 : 1.3),
      },
      {
        id: 'timeline.fit',
        label: 'Fit the clip (⇧F fits the selected columns)',
        keys: ['f', 'shift+f'],
        chords: [['F'], ['shift', 'F']],
        scope: 'surface:timeline',
        when: () => !$dialogOpen.get(),
        run: (e) => (e.shiftKey ? fitSelection() : fitClip()),
      },
    ],
  },
  {
    title: 'Lists',
    // The edit chords, mirrored onto the selection-carrying list surfaces so range-selecting
    // rows and pressing ⌫ keeps working after the viewport scope stopped covering collection
    // focus (foundation §11.1). One entry per stamped surface; the rest arrive with their
    // panels (see the DEFERRED ledger below).
    bindings: [
      ...registerListSurfaceEditMirrors('outliner'),
      ...registerListSurfaceEditMirrors('data-navigator'),
      ...registerListSurfaceEditMirrors('engine-tree'),
      ...registerListSurfaceEditMirrors('members'),
      {
        // The Outliner's own search. Scoped to the panel, so ⌘F stays the browser's Find
        // everywhere else — and so it can never fight the field-local keys of another list.
        id: 'outliner.search',
        label: 'Search the Outliner',
        keys: 'mod+f',
        chords: [['mod', 'F']],
        scope: 'surface:outliner',
        run: () => focusOutlinerSearch(),
      },
    ],
  },
  {
    title: 'Glow paint',
    // Per-STROKE undo inside the paint canvas (design-surface-assets.md D2). Scoped
    // `surface:glow-paint`, which outranks `global` (foundation §11.1 precedence
    // surface > … > global) — that is the whole point: while the painter is open ⌘Z must step
    // a stroke, not the DOCUMENT. Global bindings stay active behind dialogs by design, so
    // without this scope binding ⌘Z would reach `edit.undo` through the open painter.
    //
    // `enableOnFormTags` because the dialog's brush/intensity sliders and colour input can
    // hold focus while painting; the `when` gate keeps the chord falling through to the
    // document's undo when there is no stroke to step.
    bindings: [
      {
        id: 'glowPaint.undo',
        label: 'Undo paint stroke',
        keys: 'mod+z',
        chords: [['mod', 'Z']],
        scope: 'surface:glow-paint',
        when: () => glowPaintCanUndo(),
        overrides: ['edit.undo'],
        options: { enableOnFormTags: true, preventDefault: true },
        run: () => glowPaintUndo(),
      },
      {
        id: 'glowPaint.redo',
        label: 'Redo paint stroke',
        keys: 'mod+shift+z',
        chords: [['mod', 'shift', 'Z']],
        scope: 'surface:glow-paint',
        when: () => glowPaintCanRedo(),
        overrides: ['edit.redo'],
        options: { enableOnFormTags: true, preventDefault: true },
        run: () => glowPaintRedo(),
      },
    ],
  },
];

/** Flattened bindings, for the component that wires `useHotkeys` per binding. */
export const ALL_BINDINGS: HotkeyBinding[] = HOTKEY_GROUPS.flatMap((g) => g.bindings);

// ── DEFERRED bindings ledger ─────────────────────────────────────────────────
//
// Every row of the AUTHORITATIVE binding table (`plans/flexo_v2/design/FINAL_DESIGN_INDEX.md`
// "Consolidated hotkey table") that is NOT live above, pinned to the phase that owns the
// behavior it would drive. A binding lands only WITH its behavior — an enabled chord that
// does nothing is worse than an absent one.
//
// **Implementers of later phases: delete your row as you land it.**
//
// | Binding (authoritative-table row)                                        | Owning phase |
// |--------------------------------------------------------------------------|--------------|
// | ModeSwitcher / ModeTabBar attention dots                                  | P11E (draft clips; Engine blockers landed in P7) |
//
// **Struck in P11C.02**: the `surface:members` edit-mirror row — the docked Members view
// stamps `data-surface="members"` and its six mirrors are live in the Lists group above.
//
// **Struck in P11B.09**: the `mode:animation` row (`Space` · `,`/`.` · `K`) and the
// `surface:timeline` row (`←→ ⇧←→ ⌘A ⌥⌘A ⌘C ⌘X ⌘V ⌫ = - F ⇧F Esc`) are both live above.
// The timeline's `Esc` is folded into Esc-ladder rung 7 rather than registered as a chord —
// see the rung below for why.
//
// **Closed, not deferred**: `surface:palette` `↑↓ ↩ ⌘↩` stay component-local in
// `CommandPalette` (the input owns DOM focus for the whole session) and are documented as a
// STATIC Help section (`helpStatics.ts` `PALETTE_SECTION`) rather than registered — a fake
// binding nothing dispatches would only add four chords to the conflict validator. Palette
// Esc is already ladder rung 3. The Outliner's inline-rename `↩`/`Esc` closed the same way in
// P5A.14 (`helpStatics.ts` `OUTLINER_SECTION`): they live inside one focused text field.

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
  label: 'Cancel the armed tool (or the pivot tool)',
  // Fully generic since P5B.25–27: EVERY transient tool is a tenant of the single
  // `$activeTool` slot, so one `disarmTool()` runs whichever `onCancel` is registered —
  // the marquee's rect teardown, the measure tool's half-placed pick + crosshair, exhaust
  // placement's gizmo, `pivot-pick`'s target. Seat view is the one tool NOT cancelled here:
  // it has its own rung (8) because its contract is "never preventDefault".
  //
  // `⊕ Edit pivot` rides this rung WITHOUT holding the slot (design-animation-mode.md §9.4):
  // it is a mode of the pose gizmo, not a pointer tool, but its Esc contract is the tool
  // contract — so it unwinds here, after any armed tool, and always before the animation
  // unwind of rung 7.
  when: () =>
    ($activeTool.get() !== null && $activeTool.get() !== 'seat-view') || $pivotEditing.get(),
  run: () => {
    if ($activeTool.get() !== null && $activeTool.get() !== 'seat-view') {
      disarmTool();
      return;
    }
    setPivotEditing(false);
  },
  preventDefault: true,
});

registerEscRung({
  rung: 6,
  id: 'chain.cancel',
  label: 'Cancel the action chain',
  when: () => $chainSession.get() !== null,
  // ≥1 step raises the discard-confirm (LOCKED); an empty session closes silently. Same
  // call the window's ✕ and its footer Cancel make.
  run: () => cancelChainSession(),
  // v1 contract: Escape must still reach dialogs/popovers, and useNumberDraft's dirty
  // revert (rung 1) must win over cancelling the session.
  preventDefault: false,
  // v1 `enableOnFormTags: true` — cancel works from inside the step fields.
  enableWhileTyping: true,
});

registerEscRung({
  rung: 7,
  id: 'anim.unwind',
  label: 'Unwind: columns → pin → park → rest ⚓ → active joint',
  when: () =>
    $mode.get() === 'animation' &&
    (timelineColumnsSelected() ||
      $editKeyframeId.get() !== null ||
      $playheadParked.get() ||
      $activeJointId.get() !== null),
  // The design-animation-mode.md §10.3 / §12.3 ladder, which SUPERSEDES foundation §11.4's
  // two-step summary. The timeline's own Esc (§12.2 "clear the column selection, then blur
  // to the ladder") is folded in as the first step rather than registered as a separate
  // rung: both only apply in Animation mode, and one rung keeps the ladder's nine integer
  // positions intact.
  run: () => {
    if (timelineColumnsSelected()) {
      $timelineSelection.set([]);
      return;
    }
    // 1) unpin but STAY parked at that time — leaving a keyframe is one step, not two.
    if ($editKeyframeId.get() !== null) {
      $editKeyframeId.set(null);
      return;
    }
    // 2) parked ⇒ spring back to the modeled pose at the rest anchor.
    if ($playheadParked.get()) {
      returnToRest();
      return;
    }
    // 3) finally the active joint. The mode itself NEVER exits via Esc, and Esc never
    //    clears the placement selection (foundation §11.4 rung 9).
    $activeJointId.set(null);
  },
  preventDefault: true,
});

/** Columns are selected AND the dock owns focus — the §12.2 half of rung 7. */
function timelineColumnsSelected(): boolean {
  return $focusedSurface.get() === 'timeline' && $timelineSelection.get().length > 0;
}

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
