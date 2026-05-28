import { useRef, useState } from 'react'

/**
 * Vertical splitter: stacks `top` over `bottom` with a draggable horizontal
 * divider. Split is local state (resets to `initialSplit` whenever the component
 * remounts — used by the Add SubPart / Add Part modals to reset to 50/50 each
 * time they open).
 */
export function VerticalSplit({
  top,
  bottom,
  initialSplit = 50,
  minPct = 15,
  maxPct = 85,
}: {
  top: React.ReactNode
  bottom: React.ReactNode
  initialSplit?: number
  minPct?: number
  maxPct?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPct, setSplitPct] = useState(initialSplit)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const onMove = (ev: PointerEvent) => {
      const pct = ((ev.clientY - rect.top) / rect.height) * 100
      setSplitPct(Math.max(minPct, Math.min(maxPct, pct)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 overflow-hidden" style={{ height: `${splitPct}%` }}>
        {top}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panels"
        onPointerDown={onPointerDown}
        className="group relative h-1 shrink-0 cursor-row-resize bg-border transition-colors hover:bg-accent"
      >
        {/* Wider invisible hit-area so the divider is easy to grab. */}
        <span className="absolute inset-x-0 -inset-y-1.5" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{bottom}</div>
    </div>
  )
}
