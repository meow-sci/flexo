import { escRungs } from './escLadder';
import type { KeyChord } from './registry';

/**
 * The **hand-authored** half of the Help dialog (design: `design-system-services.md` §5.1;
 * foundation §11.5). Everything the registry cannot describe: pointer gestures, the numeric
 * fields' own key handling, the Escape ladder as an ordered list, and the command palette's
 * component-local navigation keys.
 *
 * These arrays live next to the registry ON PURPOSE — they are the part of Help that CAN
 * drift, so a reviewer editing a gesture sees the Help line in the same diff. The rule that
 * keeps them honest: **names never lie**. A row appears here only once the behavior ships;
 * the `EXTEND` comments name the phase that adds the rest.
 */

export interface HelpStaticRow {
  /** Display-token chords, same vocabulary as `HotkeyBinding.chords` (`keyLabel` resolves). */
  chords: KeyChord[];
  text: string;
}

export interface HelpStaticSection {
  title: string;
  /** Optional paragraph under the rows. */
  note?: string;
  rows: HelpStaticRow[];
}

/**
 * Pointer gestures that ship TODAY. The marquee (`⇧`-drag add / `⌥⇧`-drag subtract),
 * `⌥`-drag duplicate, the `⌃` snap invert and the timeline's double-click insert are all
 * real design commitments but are NOT implemented yet, so they are deliberately absent.
 *
 * EXTEND in P5A (marquee), P5B (⌥-drag duplicate, ⌃ snap invert), P11 (timeline gestures).
 */
export const POINTER_SECTION: HelpStaticSection = {
  title: 'Pointer & modifiers',
  rows: [
    {
      chords: [['mod', 'click']],
      text: 'Viewport — add the clicked entity to the selection instead of replacing it (⌃ and ⇧ do the same)',
    },
    {
      chords: [['shift', 'click']],
      text: 'List rows — select everything between the nearest selected row and the clicked one; it only ever grows the selection',
    },
    {
      chords: [['mod', 'click']],
      text: 'List rows — toggle one row, leaving the rest of the selection alone',
    },
  ],
};

/**
 * `useNumberDraft`'s per-field keys. They stay field-local by design (design §4.1 — the one
 * deliberate exception to "no off-registry bindings"), which is exactly why they need a
 * static Help section.
 */
export const NUMERIC_FIELD_SECTION: HelpStaticSection = {
  title: 'Numeric fields',
  note: 'Every keystroke that parses to an in-range number commits live, so the 3D view follows along while you type. Out-of-range keystrokes are skipped rather than clamped — the clamp happens once, when the edit finishes.',
  rows: [
    { chords: [['↑'], ['↓']], text: 'Step the value by the field’s own step' },
    { chords: [['shift', '↑', '↓']], text: 'Step ×10' },
    { chords: [['alt', '↑', '↓']], text: 'Step ×0.1' },
    { chords: [['↵']], text: 'Commit the edit (focus stays in the field)' },
    {
      chords: [['Escape']],
      text: 'Revert to the value the field held when the edit began — only while it is dirty',
    },
  ],
};

/**
 * The ⌘K palette's navigation keys. They are component-local virtual-focus handling inside
 * `CommandPalette` (the input keeps DOM focus for the whole session), not registry bindings —
 * registering fake bindings just to list them here would put four chords into the conflict
 * validator that nothing dispatches. Escape is the exception: it is ladder rung 3, and shows
 * up in the Escape section too.
 *
 * EXTEND in P5A.14 (Outliner inline rename: Enter commits, Escape cancels).
 */
export const PALETTE_SECTION: HelpStaticSection = {
  title: 'Command palette',
  rows: [
    { chords: [['↑'], ['↓']], text: 'Move the highlighted row' },
    { chords: [['↵']], text: 'Run the highlighted command' },
    { chords: [['mod', '↵']], text: 'Run it and keep the palette open' },
    { chords: [['Escape']], text: 'Close the palette' },
  ],
};

/** One numbered row of "What Esc does". */
export interface EscLadderRow {
  rung: number;
  label: string;
  /** Who answers this rung — shown so the two non-registrable rungs read as deliberate. */
  owner: string;
}

/**
 * The Escape ladder as Help renders it: the registered rungs (`escLadder.ts`) in ladder
 * order, wrapped by the three rungs no module can register — 1 and 2 run inside the field /
 * the react-aria overlay before the dispatcher ever sees the event, and 9 is "nothing".
 */
export function escLadderRows(): EscLadderRow[] {
  return [
    { rung: 1, label: 'Revert a dirty numeric field', owner: 'the field itself' },
    { rung: 2, label: 'Close the open menu, popover or dialog', owner: 'react-aria' },
    ...escRungs().map((rung) => ({ rung: rung.rung, label: rung.label, owner: 'flexo' })),
    {
      rung: 9,
      label: 'Nothing. Escape never clears the selection and never leaves a mode',
      owner: '—',
    },
  ];
}
