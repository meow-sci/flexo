import type { Keys } from 'react-hotkeys-hook';
import { runCommand } from '../../state/commandStore';
import type { SurfaceId } from '../../state/hotkeyStore';
import type { HotkeyBinding, KeyChord } from './registry';

/**
 * **List-surface edit mirrors** (design: foundation.md §11.1 "List-surface edit mirrors";
 * design-system-services.md §4.4, last row).
 *
 * The viewport scope deliberately switches OFF while focus is inside an interactive
 * react-aria collection, so a focused list keeps its own row navigation — that is what stops
 * `W`, the arrow keys and `T` from fighting it. But the MODIFIER-CHORD edit commands were
 * plain globals in v1: range-select a few rows in a list, press ⌫, and the entities were
 * deleted. Narrowing the scope silently took that away.
 *
 * These mirrors give it back. A selection-carrying list surface registers six bindings at
 * its own `surface:*` scope — higher precedence than `viewport`, so they win cleanly with no
 * preventDefault fight — and each one runs the **same command** as the viewport binding.
 * Behavior can therefore never fork: `edit.delete` is one implementation with two chords
 * pointing at it.
 *
 * Two deliberate omissions:
 * - **No `⌘A` mirror.** Each list's own react-aria row select-all keeps precedence while it
 *   has focus (foundation §11.2 table, exception line).
 * - **No `enableOnFormTags`.** A rename field inside the list must keep ⌘C for its own text,
 *   and the shared typing guard (`isTypingInField`) is what delivers that — exactly the v1
 *   behavior, where these chords were globals suppressed while typing.
 *
 * ## "Register"
 *
 * The registry is a module constant (`HOTKEY_GROUPS`), and `GlobalHotkeys` mounts one
 * `useHotkeys` per binding for the life of the app — a binding list that changed at runtime
 * would break the Rules of Hooks. So registering a surface's mirrors means spreading this
 * function's result into a group at module scope:
 *
 * ```ts
 * { title: 'List surfaces', bindings: [...registerListSurfaceEditMirrors('outliner')] }
 * ```
 */

interface MirrorSpec {
  /** Trailing segment of the binding id: `mirror.<surface>.<suffix>`. */
  suffix: string;
  /** The command both this mirror and the viewport binding run. */
  commandId: string;
  label: string;
  keys: Keys;
  chords: KeyChord[];
}

const MIRRORS: readonly MirrorSpec[] = [
  {
    suffix: 'copy',
    commandId: 'edit.copy',
    label: 'Copy selection',
    keys: 'mod+c',
    chords: [['mod', 'C']],
  },
  {
    suffix: 'cut',
    commandId: 'edit.cut',
    label: 'Cut selection',
    keys: 'mod+x',
    chords: [['mod', 'X']],
  },
  {
    suffix: 'paste',
    commandId: 'edit.paste',
    label: 'Paste in place',
    keys: 'mod+v',
    chords: [['mod', 'V']],
  },
  {
    suffix: 'duplicate',
    commandId: 'edit.duplicate',
    label: 'Duplicate selection',
    keys: 'mod+d',
    chords: [['mod', 'D']],
  },
  {
    suffix: 'delete',
    commandId: 'edit.delete',
    label: 'Delete selection',
    keys: ['delete', 'backspace'],
    chords: [['Delete'], ['Backspace']],
  },
  {
    suffix: 'invertSelection',
    commandId: 'select.invert',
    label: 'Invert selection',
    keys: 'mod+shift+i',
    chords: [['mod', 'shift', 'I']],
  },
];

/**
 * The six edit/select mirror bindings for one list surface, at scope `surface:<surface>`.
 * See the module doc for what "register" means and why ⌘A is not among them.
 */
export function registerListSurfaceEditMirrors(surface: SurfaceId): HotkeyBinding[] {
  return MIRRORS.map((mirror) => ({
    id: `mirror.${surface}.${mirror.suffix}`,
    label: mirror.label,
    keys: mirror.keys,
    chords: mirror.chords,
    scope: `surface:${surface}` as const,
    run: () => {
      runCommand(mirror.commandId);
    },
  }));
}
