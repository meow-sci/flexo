import { useStore } from '@nanostores/react';
import { Boxes, Palette, PlayCircle, Rocket, Table2 } from 'lucide-react';
import { ToggleButton, ToggleButtonGroup } from '../kit';
import { getCommand, runCommand } from '../../state/commandStore';
import { $interimMode, INTERIM_MODES, type InterimMode } from '../commands/interimMode';

/**
 * The menubar's centered mode switcher (design: foundation §2.2, §3 layout line) — five
 * segmented chips, one per mode, Build first.
 *
 * It runs the `mode.*` COMMANDS rather than calling the mode setter directly, and reads
 * each chip's availability from the command's own `enabled()`. That is what makes the mode
 * phase a one-file change: it deletes `interimMode.ts` and re-points those commands, and
 * this component follows without an edit (it only still imports `INTERIM_MODES` for the
 * chip table and `$interimMode` for the reactive current-mode read — the two symbols that
 * phase swaps for the real mode store).
 *
 * Labels drop below ~1100px so the eight menus and the right cluster keep their room; the
 * icons and the accessible names stay. Attention dots (engine/animation) arrive with those
 * modes' own phases.
 *
 * Undo enrollment: NONE — mode is view state (foundation §13).
 */

const ICONS: Record<InterimMode, typeof Boxes> = {
  build: Boxes,
  animation: PlayCircle,
  data: Table2,
  engine: Rocket,
  surface: Palette,
};

export function ModeSwitcher() {
  const current = useStore($interimMode);

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
      {INTERIM_MODES.map((mode) => {
        const command = getCommand(`mode.${mode.id}`);
        const disabled = command?.enabled?.() === false;
        const Icon = ICONS[mode.id];
        return (
          // The wrapper carries the disabled explanation: a disabled react-aria button is
          // `pointer-events-none`, so the hover lands on this span instead — the kit
          // Tooltip would never fire on precisely the chips that need explaining.
          <span
            key={mode.id}
            className="inline-flex"
            title={disabled ? command?.disabledReason : undefined}
          >
            <ToggleButton
              id={mode.id}
              size="xs"
              isDisabled={disabled}
              aria-label={mode.label}
              className="flex-none px-2"
            >
              <Icon size={13} />
              <span className="hidden min-[1100px]:inline">{mode.label}</span>
            </ToggleButton>
          </span>
        );
      })}
    </ToggleButtonGroup>
  );
}
