/**
 * The docked shell's fixed slim top row (foundation.md §1: content height =
 * `text-xs` line + 2 × `--bar-py` + 1px border ≈ 22px). Never collapses, never
 * resizes — see the §1.1 region-rules table.
 *
 * Placeholder shell — the real MenuSpec menubar (foundation §3) lands in the
 * commands/menubar phase and replaces `EditorToolbar`. Until then the old toolbar
 * keeps floating inside the viewport cell.
 */
export function MenuBar() {
  return (
    <div className="flex flex-none select-none items-center border-b border-border bg-panel px-2 py-(--bar-py) text-xs text-fg-muted">
      <span className="font-semibold text-fg">flexo</span>
    </div>
  );
}
