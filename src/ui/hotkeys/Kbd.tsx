/**
 * A single keycap chip, shared by the help overlay and any inline shortcut hints
 * (e.g. the nudge-bubble tooltip) so all keyboard glyphs render identically.
 */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-panel-raised px-1.5 py-0.5 font-mono text-xs font-medium text-fg-muted shadow-sm">
      {children}
    </kbd>
  )
}
