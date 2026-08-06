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
 * Pointer gestures that ship TODAY. The rule is strict: a row may only describe a gesture
 * that is actually implemented.
 *
 * EXTENDED in P11B.09 with the dopesheet's five gestures (design-animation-mode §12.4) and in
 * P11D.02 with the pose gizmo's drag-local gestures — the `X`/`Y`/`Z` axis lock is a
 * pointer-capture-local listener rather than a registry binding (design §12.1), which is
 * exactly the kind of key this section exists to document.
 */
export const POINTER_SECTION: HelpStaticSection = {
  title: 'Pointer & modifiers',
  rows: [
    {
      chords: [['mod', 'click']],
      text: 'Viewport — add the clicked entity to the selection instead of replacing it (⌃ and ⇧ do the same)',
    },
    {
      chords: [['shift', 'drag']],
      text: 'Viewport — drag a box from empty space to add everything it touches to the selection',
    },
    {
      chords: [['alt', 'shift', 'drag']],
      text: 'Viewport — drag a box to remove everything it touches from the selection',
    },
    {
      chords: [['shift', 'click']],
      text: 'List rows — select everything between the nearest selected row and the clicked one; it only ever grows the selection',
    },
    {
      chords: [['mod', 'click']],
      text: 'List rows — toggle one row, leaving the rest of the selection alone',
    },
    // The two transform-gizmo drag modifiers (foundation §14.2, LOCKED #7). They are
    // pointer-capture-local in `EditorScene` — `beginDuplicateDrag` reads ⌥ at drag START,
    // `applySnapToGizmo` reads ⌃ DURING the drag — so they can never be registry bindings,
    // which is exactly why they belong here. Their live counterparts are the `gizmo-drag`
    // hints in `src/ui/status/modifierHintProviders.ts`; keep the two in step.
    {
      chords: [['alt', 'drag']],
      text: 'Transform gizmo — hold ⌥ as the drag STARTS to duplicate the selection and drag the copies instead (one undo step)',
    },
    {
      chords: [['ctrl', 'drag']],
      text: 'Transform gizmo — hold ⌃ DURING a drag to invert the snap setting for that drag only',
    },
    {
      chords: [['drag']],
      text: 'Timeline — drag the ruler or a track to scrub; drag a diamond to retime that column (every joint moves with it)',
    },
    {
      chords: [['ctrl', 'drag']],
      text: 'Timeline — while retiming, snap to the other keyframes, the playhead and the clip’s start/end instead of the ruler grid',
    },
    {
      chords: [['shift', 'drag']],
      text: 'Timeline — drag over the tracks to marquee-select columns (a plain drag still scrubs)',
    },
    {
      chords: [['double-click']],
      text: 'Timeline — double-click a track to insert a keyframe at that time',
    },
    {
      chords: [['mod', 'wheel']],
      text: 'Timeline — zoom about the pointer; ⇧-wheel or a horizontal wheel pans',
    },
    {
      chords: [['drag']],
      text: 'Pose gizmo — drag a ring to rotate about the joint pivot, the centre disc to move in the camera plane, a stem or handle for one axis',
    },
    {
      chords: [['X'], ['Y'], ['Z']],
      text: 'Pose gizmo — DURING a drag, lock the gesture to that joint-local axis; tap the same letter again for the world axis, a third time to free it',
    },
    {
      chords: [['ctrl', 'drag']],
      text: 'Pose gizmo — invert the snap setting for this drag only',
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

/**
 * The Outliner's inline rename keys. Like the palette's navigation keys they are
 * component-local (`LayerHeaderRow`'s `RenameInput` owns them, and they only exist while that
 * field has focus), so they are DISPLAYED here rather than registered — a binding nothing can
 * dispatch outside one focused input would only add chords to the conflict validator. The
 * Outliner's one real binding, `⌘F`, comes from the registry.
 */
export const OUTLINER_SECTION: HelpStaticSection = {
  title: 'Outliner',
  rows: [
    { chords: [['double-click']], text: 'Rename a layer — double-click its name' },
    { chords: [['↵']], text: 'Commit the layer rename' },
    { chords: [['Escape']], text: 'Cancel the layer rename' },
    { chords: [['drag']], text: 'Drag entity rows onto a layer header to move them there' },
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
