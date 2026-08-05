import { Eye } from 'lucide-react';
import { Button, Menu, MenuItem, MenuTrigger, Popover, Tooltip, cn, useIsPhone } from '../kit';
import { select } from '../../state/editorStore';
import { clearFlash, flashPlacements } from '../../state/dataModeStore';

/**
 * **The scope-chip system** (design: design-data-engine-modes.md §A5) — the one place v1's
 * three prose scoping banners become a visible, interactive control:
 *
 * - `[Part]` — part-level data, one per part. Inert.
 * - `[Template ×N]` — shared by all N placements. Hover flashes them; click selects them.
 * - `[Instance: <id> ▾]` — instance-scoped cards (gimbals, wiring, controller rocket refs):
 *   the chip IS the picker, and hovering an option flashes that one placement.
 *
 * **Touch equivalent** (LOCKED #6 — no hover on phone): the hover flash becomes an
 * on-selection flash, and an extra "Show →" eye button re-flashes a target without
 * re-picking it. The eye renders on phone only.
 *
 * **Undo enrollment: NONE.** Flashing and selecting are view state.
 */

const chipBase =
  'inline-flex shrink-0 items-center gap-1 rounded border border-border bg-panel-sunken px-1.5 py-0.5 text-[11px] text-fg-muted';

export function PartScopeChip() {
  return <span className={chipBase}>Part</span>;
}

export function TemplateScopeChip({
  templateId,
  instanceIds,
}: {
  templateId: string;
  instanceIds: readonly string[];
}) {
  const isPhone = useIsPhone();
  const count = instanceIds.length;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <Tooltip
        content={`Shared by ${count} placement${count === 1 ? '' : 's'} of ${templateId} — click to select them`}
      >
        <button
          type="button"
          className={cn(chipBase, 'cursor-pointer hover:border-border-strong')}
          onPointerEnter={isPhone ? undefined : () => flashPlacements(instanceIds)}
          onPointerLeave={isPhone ? undefined : clearFlash}
          onClick={() => {
            flashPlacements(instanceIds);
            select(instanceIds.map((id) => ({ kind: 'subpart' as const, id })));
          }}
        >
          Template ×{count}
        </button>
      </Tooltip>
      {isPhone && <ShowButton instanceIds={instanceIds} label={templateId} />}
    </span>
  );
}

export function InstanceScopeChip({
  instanceId,
  options,
  onChange,
}: {
  instanceId: string | null;
  /** Placement instance ids to choose between, in document order. */
  options: readonly string[];
  onChange: (instanceId: string) => void;
}) {
  const isPhone = useIsPhone();
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <MenuTrigger>
        <Button size="xs" variant="ghost" className={cn(chipBase, 'cursor-pointer')}>
          Instance: {instanceId ?? '—'} ▾
        </Button>
        {/* Mounted by the Popover, so the option list is rebuilt on every open. */}
        <Popover className="w-56">
          <Menu aria-label="Instance">
            {options.map((id) => (
              <MenuItem
                key={id}
                id={id}
                density="dense"
                textValue={id}
                onAction={() => {
                  flashPlacements([id]);
                  onChange(id);
                }}
              >
                <span
                  className="flex-1 truncate"
                  onPointerEnter={isPhone ? undefined : () => flashPlacements([id])}
                >
                  {id}
                </span>
              </MenuItem>
            ))}
          </Menu>
        </Popover>
      </MenuTrigger>
      {isPhone && instanceId && <ShowButton instanceIds={[instanceId]} label={instanceId} />}
    </span>
  );
}

/** Phone's stand-in for hover: re-flash a target without re-picking it (§A5 touch rule). */
function ShowButton({ instanceIds, label }: { instanceIds: readonly string[]; label: string }) {
  return (
    <Button
      iconOnly
      size="xs"
      variant="ghost"
      className="size-5 shrink-0"
      aria-label={`Show ${label} in the viewport`}
      onPress={() => flashPlacements(instanceIds)}
    >
      <Eye size={11} />
    </Button>
  );
}
