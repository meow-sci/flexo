import type { Keys, Options } from 'react-hotkeys-hook';
import { runCommand } from '../../state/commandStore';
import { closeDialog, isDialogOpen } from '../../state/dialogStore';
import { rotateSelectionAroundPair } from '../../three/rotateSelection';
import { FAST_NUDGE_MULTIPLIER, nudgeSelectionBy } from '../../three/nudgeSelection';
import { changeNudgeAxis, lowerNudgeStep, raiseNudgeStep } from '../nudgeControls';
import { changeRotateAxes, lowerRotateStep, raiseRotateStep } from '../rotateControls';

/**
 * The single source of truth for global hotkeys. This registry drives BOTH the
 * live bindings (GlobalHotkeys wires `useHotkeys` from `keys`/`options`/`run`) AND
 * the help overlay (which renders `chords`/`label` per group). Add a shortcut once
 * here and it shows up in both places — no risk of the docs drifting from behavior.
 *
 * **Binding ids ARE command ids** wherever a command exists, and those bindings do nothing
 * but `runCommand(id)`. That is what lets a menu item, a palette row and a chord chip all
 * describe one behavior (design: foundation §4): the toast strings, the enabled predicates
 * and the actual work live in `src/ui/commands/*.ts`, and `chordsFor(commandId)`
 * (`../commands/chords`) reads back this table. The remaining non-command bindings
 * (rotate/nudge) are the viewport spatial keys, which become scope-owned commands when the
 * scoped registry replaces this flat list.
 *
 * Deliberately NOT here yet: bare letters and digits (`1`–`5`, `T`, `B`, `M`, `F`,
 * `[`/`]`), the ⌘A select family and `⌥[`/`⌥]`. All of those are scope-sensitive — a bare
 * letter must never fire behind an open dialog — and they arrive with the scoped registry.
 * Their commands exist today; they simply render without a chord chip.
 */

/** One key chord, as display tokens (resolved to glyphs by {@link keyLabel}). */
export type KeyChord = string[];

export interface HotkeyBinding {
  id: string;
  /** Human-readable description shown in the help table. */
  label: string;
  /** react-hotkeys-hook key string(s) this binding listens for. */
  keys: Keys;
  /**
   * The chords shown as <kbd> chips in help. Multiple chords render as alternatives
   * ("A or B"); usually a single chord matching `keys`.
   */
  chords: KeyChord[];
  /** Per-binding react-hotkeys-hook options (merged over the shared defaults). */
  options?: Options;
  /** Invoked when the chord fires. Receives the keyboard event (e.g. to tell arrows apart). */
  run: (event: KeyboardEvent) => void;
}

export interface HotkeyGroup {
  title: string;
  bindings: HotkeyBinding[];
}

export const HOTKEY_GROUPS: HotkeyGroup[] = [
  {
    title: 'Rotate selection',
    bindings: [
      {
        id: 'rotate-ws',
        label: 'Rotate selection — W/S pair',
        keys: ['w', 's'],
        chords: [['W', 'S']],
        run: (e) => rotateSelectionAroundPair('ws', e.key.toLowerCase() === 'w' ? -1 : 1),
      },
      {
        id: 'rotate-ad',
        label: 'Rotate selection — A/D pair',
        keys: ['a', 'd'],
        chords: [['A', 'D']],
        run: (e) => rotateSelectionAroundPair('ad', e.key.toLowerCase() === 'a' ? 1 : -1),
      },
      {
        id: 'rotate-qe',
        label: 'Rotate selection — Q/E pair',
        keys: ['q', 'e'],
        chords: [['Q', 'E']],
        run: (e) => rotateSelectionAroundPair('qe', e.key.toLowerCase() === 'q' ? 1 : -1),
      },
      {
        id: 'rotate-cycle-axes',
        label: 'Cycle rotation axes',
        keys: 'r',
        chords: [['R']],
        run: () => changeRotateAxes(),
      },
      {
        id: 'rotate-step',
        label: 'Rotation step (F larger · ⇧F smaller)',
        keys: ['f', 'shift+f'],
        chords: [['F'], ['shift', 'F']],
        run: (e) => (e.shiftKey ? lowerRotateStep() : raiseRotateStep()),
      },
    ],
  },
  {
    title: 'Nudge',
    bindings: [
      {
        id: 'nudge-move',
        label: 'Nudge selection along axis',
        keys: ['up', 'down'],
        chords: [['↑', '↓']],
        run: (e) => nudgeSelectionBy(e.key === 'ArrowDown' ? -1 : 1),
      },
      {
        id: 'nudge-move-fast',
        label: `Nudge ×${FAST_NUDGE_MULTIPLIER} (coarse)`,
        keys: ['shift+up', 'shift+down'],
        chords: [['shift', '↑', '↓']],
        run: (e) => nudgeSelectionBy(e.key === 'ArrowDown' ? -1 : 1, FAST_NUDGE_MULTIPLIER),
      },
      {
        id: 'nudge-axis',
        label: 'Change axis (← back · → forward)',
        keys: ['left', 'right'],
        chords: [['←', '→']],
        run: (e) => changeNudgeAxis(e.key === 'ArrowLeft' ? -1 : 1),
      },
      {
        id: 'nudge-step',
        label: 'Change step (⇧← smaller · ⇧→ larger)',
        keys: ['shift+left', 'shift+right'],
        chords: [['shift', '←', '→']],
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
        run: () => runCommand('edit.delete'),
      },
      {
        id: 'edit.copy',
        label: 'Copy selection',
        keys: 'mod+c',
        chords: [['mod', 'C']],
        run: () => runCommand('edit.copy'),
      },
      {
        id: 'edit.cut',
        label: 'Cut selection',
        keys: 'mod+x',
        chords: [['mod', 'X']],
        run: () => runCommand('edit.cut'),
      },
      {
        id: 'edit.paste',
        label: 'Paste in place',
        keys: 'mod+v',
        chords: [['mod', 'V']],
        run: () => runCommand('edit.paste'),
      },
      {
        id: 'edit.duplicate',
        label: 'Duplicate selection',
        keys: 'mod+d',
        chords: [['mod', 'D']],
        run: () => runCommand('edit.duplicate'),
      },
      {
        id: 'chain.begin',
        label: 'Begin action chain (selection)',
        // Rebound from ⌘K, which the command palette now owns (LOCKED). A session with
        // steps is never discarded silently — the command asks first.
        keys: 'mod+shift+k',
        chords: [['mod', 'shift', 'K']],
        run: () => runCommand('chain.begin'),
      },
      {
        id: 'edit.undo',
        label: 'Undo',
        keys: 'mod+z',
        chords: [['mod', 'Z']],
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
        run: () => runCommand('palette.open'),
      },
      {
        id: 'file.projects',
        label: 'Projects',
        keys: 'mod+o',
        chords: [['mod', 'O']],
        run: () => runCommand('file.projects'),
      },
      {
        id: 'file.exportKsa',
        label: 'Export to KSA',
        keys: 'mod+e',
        chords: [['mod', 'E']],
        run: () => runCommand('file.exportKsa'),
      },
      {
        id: 'window.assetManager',
        label: 'Asset Manager',
        keys: 'mod+shift+a',
        chords: [['mod', 'shift', 'A']],
        run: () => runCommand('window.assetManager'),
      },
      {
        id: 'edit.settings',
        label: 'Settings',
        keys: 'mod+comma',
        chords: [['mod', ',']],
        run: () => runCommand('edit.settings'),
      },
      {
        id: 'noop.autosaveFlash',
        // There is no Save: the workspace autosaves. ⌘S answers the reflex instead of
        // handing the user the browser's save-page dialog (the shared preventDefault).
        label: 'Save (autosave is always on)',
        keys: 'mod+s',
        chords: [['mod', 'S']],
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
        // Match the produced character ("?") regardless of physical key/layout, and
        // ignore modifiers: on US layouts "?" is Shift+/, and react-hotkeys-hook
        // otherwise rejects the match because the held Shift isn't part of the combo.
        options: { useKey: true, ignoreModifiers: true },
        chords: [['?']],
        // Toggling is v1 behavior worth keeping, and a command cannot express it (the
        // menu item must only ever OPEN); the close half stays here.
        run: () => (isDialogOpen('help') ? closeDialog() : void runCommand('help.shortcuts')),
      },
      {
        id: 'seat.exit',
        label: 'Leave IVA seat view',
        keys: 'escape',
        chords: [['Escape']],
        // Never preventDefault: Escape also dismisses dialogs/popovers/menus (react-aria
        // and the browser both act on it), and this binding must not shadow those.
        options: { preventDefault: false },
        // Escape is everyone's dismiss key (dialogs, popovers, the gizmo drag). The
        // command's own `enabled` gate (seat view actually up) keeps this inert otherwise,
        // so it never eats an Escape meant for something layered above the viewport.
        run: () => {
          runCommand('seat.exit');
        },
      },
    ],
  },
];

/** Flattened bindings, for the component that wires `useHotkeys` per binding. */
export const ALL_BINDINGS: HotkeyBinding[] = HOTKEY_GROUPS.flatMap((g) => g.bindings);
