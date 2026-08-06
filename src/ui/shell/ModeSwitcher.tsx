import { useStore } from '@nanostores/react';
import { ToggleButton, ToggleButtonGroup } from '../kit';
import { MODE_ICONS } from '../status/statusTokens';
import { runCommand } from '../../state/commandStore';
import { $mode, MODES } from '../../state/modeStore';
import { $engineBlockerCount } from '../../state/engineStore';
import { $draftClipCount } from '../../state/animationStore';

/**
 * The menubar's centered mode switcher (design: foundation §2.2, §3 layout line) — five
 * segmented chips, one per mode, Build first. Together with the status bar's mode chip it
 * is the fix for v1's biggest orientation gap: the sidebar swapped whole bodies with no
 * visible indicator of which mode you were in.
 *
 * It runs the `mode.*` COMMANDS rather than calling `setMode` directly — commands are the
 * only action path (foundation §4), so the switcher, the status chip, the phone sheet, the
 * palette and the digit chords can never disagree about what a mode switch does.
 *
 * Icons come from the shared {@link MODE_ICONS} table, so a mode cannot look like one thing
 * up here and another in the status bar.
 *
 * Labels drop below ~1100px so the eight menus and the right cluster keep their room; the
 * icons and the accessible names stay.
 *
 * **Attention dots** (foundation §2.2): each segment may carry a small dot fed by its own
 * area store. Engine's is the blocking-validation count — the replacement for v1's
 * "Engine (N)" toolbar button, which counted SCOPES and so told you nothing about whether the
 * part would load. Animation's is the DRAFT-CLIP count (`$draftClipCount` over
 * `computeClipIssues`): clips the exporter silently skips, which v1 announced only as a
 * "(draft)" chip inside a panel you had to already be looking at (census pain 20).
 *
 * The two dots differ in tone on purpose: an Engine blocker means KSA refuses to LOAD the
 * mod (danger), a draft clip means one clip is left out of an export that otherwise succeeds
 * (warning) — the same severity split the export pre-flight draws.
 *
 * Undo enrollment: NONE — mode is view state (foundation §13).
 */
export function ModeSwitcher() {
  const current = useStore($mode);
  const engineBlockers = useStore($engineBlockerCount);
  const draftClips = useStore($draftClipCount);

  return (
    <ToggleButtonGroup
      size="xs"
      selectionMode="single"
      disallowEmptySelection
      aria-label="Editor mode"
      className="w-auto"
      selectedKeys={new Set([current])}
      onSelectionChange={(keys) => {
        const [id] = [...keys];
        if (typeof id === 'string') runCommand(`mode.${id}`);
      }}
    >
      {MODES.map((mode) => {
        const Icon = MODE_ICONS[mode.id];
        const attention =
          mode.id === 'engine' && engineBlockers > 0
            ? {
                tone: 'bg-danger',
                note: `${engineBlockers} blocking issue${engineBlockers === 1 ? '' : 's'}`,
              }
            : mode.id === 'animation' && draftClips > 0
              ? {
                  tone: 'bg-warning',
                  note: `${draftClips} draft clip${draftClips === 1 ? '' : 's'} won’t export`,
                }
              : null;
        return (
          <ToggleButton
            key={mode.id}
            id={mode.id}
            size="xs"
            aria-label={attention ? `${mode.label} — ${attention.note}` : mode.label}
            className="flex-none px-2"
          >
            {/* A native `title` on the icon span rather than a kit Tooltip: the group's
                children must stay ToggleButtons for react-aria's roving focus. */}
            <span
              className="relative flex items-center justify-center"
              title={attention ? attention.note : undefined}
            >
              <Icon size={13} />
              {attention && (
                <span
                  className={`absolute -right-1 -top-1 size-1.5 rounded-full ${attention.tone}`}
                />
              )}
            </span>
            <span className="hidden min-[1100px]:inline">{mode.label}</span>
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
}
