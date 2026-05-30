import type { Keys, Options } from 'react-hotkeys-hook'
import { redo, removeSelected, undo } from '../../state/editorStore'
import { toggleHelp } from '../../state/helpStore'
import { rotateSelectionAroundPair } from '../../three/rotateSelection'
import { FAST_NUDGE_MULTIPLIER, nudgeSelectionBy } from '../../three/nudgeSelection'
import { changeNudgeAxis, lowerNudgeStep, raiseNudgeStep } from '../nudgeControls'
import { changeRotateAxes, lowerRotateStep, raiseRotateStep } from '../rotateControls'
import { toast } from '../kit'

/**
 * The single source of truth for global hotkeys. This registry drives BOTH the
 * live bindings (GlobalHotkeys wires `useHotkeys` from `keys`/`options`/`run`) AND
 * the help overlay (which renders `chords`/`label` per group). Add a shortcut once
 * here and it shows up in both places — no risk of the docs drifting from behavior.
 */

/** One key chord, as display tokens (resolved to glyphs by {@link keyLabel}). */
export type KeyChord = string[]

export interface HotkeyBinding {
  id: string
  /** Human-readable description shown in the help table. */
  label: string
  /** react-hotkeys-hook key string(s) this binding listens for. */
  keys: Keys
  /**
   * The chords shown as <kbd> chips in help. Multiple chords render as alternatives
   * ("A or B"); usually a single chord matching `keys`.
   */
  chords: KeyChord[]
  /** Per-binding react-hotkeys-hook options (merged over the shared defaults). */
  options?: Options
  /** Invoked when the chord fires. Receives the keyboard event (e.g. to tell arrows apart). */
  run: (event: KeyboardEvent) => void
}

export interface HotkeyGroup {
  title: string
  bindings: HotkeyBinding[]
}

/** Undo/redo wrappers that mirror the toolbar buttons (run the action, toast the label). */
function runUndo(): void {
  const d = undo()
  if (d) toast({ title: `Undo: ${d}` }, { timeout: 1500 })
}
function runRedo(): void {
  const d = redo()
  if (d) toast({ title: `Redo: ${d}` }, { timeout: 1500 })
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
        id: 'delete',
        label: 'Delete selection',
        keys: ['delete', 'backspace'],
        chords: [['Delete'], ['Backspace']],
        run: () => removeSelected(),
      },
      {
        id: 'undo',
        label: 'Undo',
        keys: 'mod+z',
        chords: [['mod', 'Z']],
        run: runUndo,
      },
      {
        id: 'redo',
        label: 'Redo',
        keys: ['mod+y', 'mod+shift+z'],
        chords: [['mod', 'Y'], ['mod', 'shift', 'Z']],
        run: runRedo,
      },
    ],
  },
  {
    title: 'General',
    bindings: [
      {
        id: 'help',
        label: 'Show keyboard shortcuts',
        keys: '?',
        // Match the produced character so Shift+/ on US layouts (and any layout
        // where "?" needs Shift) fires it, regardless of physical key.
        options: { useKey: true },
        chords: [['?']],
        run: () => toggleHelp(),
      },
    ],
  },
]

/** Flattened bindings, for the component that wires `useHotkeys` per binding. */
export const ALL_BINDINGS: HotkeyBinding[] = HOTKEY_GROUPS.flatMap((g) => g.bindings)
