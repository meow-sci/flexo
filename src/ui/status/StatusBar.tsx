/**
 * The docked shell's fixed slim bottom row — same recipe as {@link MenuBar}
 * (foundation.md §1.1 region rules: content height, never collapses, never resizes).
 *
 * Placeholder shell — the segments (mode chip, layer chip, tool segment, message
 * channel, progress, modifier hints, notification bell) land with `statusStore`
 * (foundation §5, §17 step 3). This file is already at its FINAL path so that phase
 * fills it in place (design-system-services.md §1.0). Until then TransformHud,
 * MeasurementInfo, SeatViewBar, WorkspaceLoadProgress and the toast region keep
 * working as floating chrome inside the viewport cell.
 */
export function StatusBar() {
  // `min-h-[21px]` spells out foundation §1.1's shared bar recipe — a `text-xs` line
  // box (1rem) + 2 × `--bar-py` + the 1px border — because an EMPTY bar has no line
  // box of its own and would otherwise collapse to a 5px sliver. It becomes a no-op
  // once the real segments land (foundation §5).
  return (
    <div className="flex min-h-[21px] flex-none select-none items-center border-t border-border bg-panel px-2 py-(--bar-py) text-xs text-fg-muted" />
  );
}
