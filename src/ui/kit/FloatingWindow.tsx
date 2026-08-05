import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { ChevronDown, ChevronRight, GripHorizontal, X } from 'lucide-react';
import { $layout, raiseFloat, setFloatPos, type FloatPos } from '../../state/layoutStore';
import { Button } from './Button';
import { clampFloatPos, resolveAnchor, type FloatAnchor, type Rect } from './floatClamp';
import { ResizeHandle } from './ResizeHandle';
import { cn, panelChrome } from './styles';
import { useIsPhone } from './useIsPhone';
import { usePointerDrag } from './usePointerDrag';
import { z } from './zIndex';

/** The workspace band (menubar bottom → status bar top); Phase 1's shell stamps it. */
const BAND_SELECTOR = '[data-workspace-band]';
/** The viewport cell between the two sidebars — default anchors resolve against it. */
const CELL_SELECTOR = '[data-viewport-cell]';

/** Arrow-key move step, ⇧-arrow step (design-system-services.md §6.1). */
const MOVE_STEP = 8;
const MOVE_STEP_FAST = 32;

/** Windows that fit between `z.float` and `z.overlay` before the tiers collide. */
const MAX_STACKED = z.overlay - z.float - 1;

export interface FloatingWindowProps {
  /** Key into `layoutStore.float` / `floatOrder` / `floatHidden`. */
  id: string;
  /** Strip label; also the accessible name of the drag strip. */
  title: string;
  /** Strip shows grip + controls only — the title stays for screen readers (tool bar case). */
  titleHidden?: boolean;
  /** Where the window sits until the user drags it (resolved against the viewport cell). */
  defaultAnchor: FloatAnchor;
  minSize: { w: number; h: number };
  /** Adds a right-edge {@link ResizeHandle}. The width is session-only — never persisted. */
  resizable?: { minW: number; maxW: number };
  /** Adds a strip chevron that rolls the body up (session-only). */
  collapsible?: boolean;
  /** Adds a ✕ to the strip. */
  onClose?: () => void;
  children: React.ReactNode;
}

function rectOf(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function windowRect(): Rect {
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

/**
 * THE floating window primitive (design-system-services.md §6; foundation §6.1). Exactly
 * two tenants ship — the gizmo Tool bar and the Chain palette — and new floating surfaces
 * require a foundation escalation, not a new call site.
 *
 * **Mount it INSIDE the `[data-workspace-band]` element.** Positions are stored
 * band-absolute px and rendered with `position: absolute`, so the band is the offset
 * parent. When the band or the viewport cell is missing (before Phase 1 stamps them) the
 * whole window falls back to the browser window rect.
 *
 * Behavior: drag is the 20px title strip only (the body never drags, so a tenant's inputs
 * stay draft-safe); the position clamps to keep ≥120×28px on screen and re-clamps when the
 * band resizes; pointer-down raises the window within the `z.float` tier; arrow keys on the
 * focused strip move it 8px (32px with ⇧). Only `{x, y}` persists (`flexo:layout`) —
 * collapse and resizable width are session state. On phone it renders nothing: each tenant
 * mounts its own phone variant (§6.5).
 *
 * **Undo enrollment: NONE** — layout is view state (foundation §13).
 */
export function FloatingWindow({
  id,
  title,
  titleHidden = false,
  defaultAnchor,
  minSize,
  resizable,
  collapsible = false,
  onClose,
  children,
}: FloatingWindowProps) {
  const isPhone = useIsPhone();
  const layout = useStore($layout);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(resizable?.minW ?? 0);
  /** Resolved default anchor, measured; `null` until the first geometry read. */
  const [anchorPos, setAnchorPos] = useState<FloatPos | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  /** Latest band rect + own size, for the drag/keyboard clamps. */
  const geomRef = useRef<{ band: Rect; size: { w: number; h: number } } | null>(null);
  const dragStartRef = useRef<FloatPos>({ x: 0, y: 0 });

  const hidden = layout.floatHidden.includes(id);
  const visible = !isPhone && !hidden;
  const stored = layout.float[id] ?? null;
  const order = layout.floatOrder;
  const { h: anchorH, v: anchorV, dx: anchorDx, dy: anchorDy } = defaultAnchor;

  // Geometry: the ResizeObserver fires once on observe (first measurement) and again on
  // every band/self resize, re-resolving the default anchor and re-clamping a stored
  // position. Reading the store imperatively here keeps the observer off the render path.
  useEffect(() => {
    const el = rootRef.current;
    if (!visible || !el) return;

    const remeasure = () => {
      const band = rectOf(BAND_SELECTOR) ?? windowRect();
      const cell = rectOf(CELL_SELECTOR) ?? band;
      const size = { w: el.offsetWidth, h: el.offsetHeight };
      geomRef.current = { band, size };

      const anchored = resolveAnchor(
        { h: anchorH, v: anchorV, dx: anchorDx, dy: anchorDy },
        size,
        cell,
        band,
      );
      const next = clampFloatPos(anchored, size, band, window.innerWidth);
      setAnchorPos((prev) => (prev && prev.x === next.x && prev.y === next.y ? prev : next));

      const current = $layout.get().float[id];
      if (current) {
        const clamped = clampFloatPos(current, size, band, window.innerWidth);
        if (clamped.x !== current.x || clamped.y !== current.y) setFloatPos(id, clamped);
      }
    };

    const observer = new ResizeObserver(remeasure);
    observer.observe(el);
    const bandEl = document.querySelector(BAND_SELECTOR);
    if (bandEl) observer.observe(bandEl);
    window.addEventListener('resize', remeasure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', remeasure);
    };
  }, [visible, id, anchorH, anchorV, anchorDx, anchorDy]);

  useEffect(() => {
    if (import.meta.env.DEV && order.length > MAX_STACKED)
      console.warn(
        `FloatingWindow: ${order.length} windows stacked — only ${MAX_STACKED} fit between z.float and z.overlay.`,
      );
  }, [order.length]);

  const pos = stored ?? anchorPos;

  const moveTo = (x: number, y: number) => {
    const geom = geomRef.current;
    if (!geom) return;
    setFloatPos(id, clampFloatPos({ x, y }, geom.size, geom.band, window.innerWidth));
  };

  const { onPointerDown } = usePointerDrag({
    onStart: (e) => {
      // The strip's own controls (collapse / close) must not start a drag.
      if ((e.target as Element).closest('button')) return false;
      if (!pos) return false;
      dragStartRef.current = pos;
    },
    onMove: (dx, dy) => moveTo(dragStartRef.current.x + dx, dragStartRef.current.y + dy),
    cursor: 'grabbing',
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!pos) return;
    const step = e.shiftKey ? MOVE_STEP_FAST : MOVE_STEP;
    const delta =
      e.key === 'ArrowLeft'
        ? { x: -step, y: 0 }
        : e.key === 'ArrowRight'
          ? { x: step, y: 0 }
          : e.key === 'ArrowUp'
            ? { x: 0, y: -step }
            : e.key === 'ArrowDown'
              ? { x: 0, y: step }
              : null;
    if (!delta) return;
    e.preventDefault();
    moveTo(pos.x + delta.x, pos.y + delta.y);
  };

  if (!visible) return null;

  const stackIndex = Math.max(0, order.indexOf(id));

  return (
    <div
      ref={rootRef}
      data-surface={id}
      onPointerDownCapture={() => {
        if (order.at(-1) !== id) raiseFloat(id);
      }}
      className={cn(panelChrome, 'pointer-events-auto absolute flex flex-col overflow-hidden')}
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        zIndex: z.float + stackIndex,
        minWidth: minSize.w,
        minHeight: collapsed ? undefined : minSize.h,
        width: resizable ? width : undefined,
        visibility: pos ? undefined : 'hidden',
      }}
    >
      <div
        tabIndex={0}
        role="group"
        aria-label={title}
        aria-roledescription="Window title bar"
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="flex h-5 shrink-0 cursor-grab touch-none select-none items-center gap-1 px-1 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:cursor-grabbing"
      >
        <GripHorizontal size={12} className="shrink-0 text-fg-subtle" />
        <span
          className={cn(
            titleHidden ? 'sr-only' : 'min-w-0 flex-1 truncate text-xs font-medium text-fg-subtle',
          )}
        >
          {title}
        </span>
        {titleHidden && <div className="flex-1" />}
        {collapsible && (
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            className="size-4 rounded-sm"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            onPress={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </Button>
        )}
        {onClose && (
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            className="size-4 rounded-sm"
            aria-label="Close"
            onPress={onClose}
          >
            <X size={12} />
          </Button>
        )}
      </div>

      {!collapsed && <div className="min-h-0 flex-1 overflow-auto">{children}</div>}

      {resizable && !collapsed && (
        <div className="absolute inset-y-0 right-0">
          <ResizeHandle
            orientation="vertical"
            value={width}
            min={resizable.minW}
            max={resizable.maxW}
            onChange={setWidth}
            ariaLabel={`Resize ${title}`}
          />
        </div>
      )}
    </div>
  );
}
