import { useStore } from '@nanostores/react';
import { ToggleButton, ToggleButtonGroup } from '../kit';
import { MODE_ICONS } from '../status/statusTokens';
import { runCommand } from '../../state/commandStore';
import { $mode, MODES } from '../../state/modeStore';

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
 * TODO(P7/P11): per-segment attention dots — Engine validation blockers (P7) and Animation
 * draft clips (P11). The `ModeTabSpec.attention` plumbing already exists for the phone tabs.
 *
 * Undo enrollment: NONE — mode is view state (foundation §13).
 */
export function ModeSwitcher() {
  const current = useStore($mode);

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
        return (
          <ToggleButton
            key={mode.id}
            id={mode.id}
            size="xs"
            aria-label={mode.label}
            className="flex-none px-2"
          >
            <Icon size={13} />
            <span className="hidden min-[1100px]:inline">{mode.label}</span>
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
}
