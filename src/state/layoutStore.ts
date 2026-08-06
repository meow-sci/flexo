import { persistentJSON } from '@nanostores/persistent';

/**
 * The v2 docked shell's single layout store (nanostores → localStorage). Sidebar
 * widths/collapse, the timeline dock, and floating-window positions/stacking/
 * visibility all live under one persisted key, `flexo:layout` (foundation.md §13,
 * S23). No React / three.js imports — layering constitution (AGENTS.md), like every
 * other `src/state/` module; React reads via `useStore`, `FloatingWindow` (P0.10)
 * persists its drag position and z-order through {@link $layout.float} /
 * {@link $layout.floatOrder} / {@link $layout.floatHidden} (design-system-services.md
 * §6.4).
 *
 * **Undo enrollment: NONE.** Layout is view state, not document state — every mutator
 * here writes `$layout` directly with no `pushUndo()`, matching foundation §13's
 * "mode/layout/status … never create undo steps".
 *
 * **No migration, ever.** The v1 keys `flexo:inspectorVisible` / `flexo:inspectorWidth`
 * / `flexo:inspectorFloatPos` / `flexo:animPreviewFloatPos` are simply abandoned —
 * nothing here reads them or converts their shape (constitution; design-system-
 * services.md §9). A stored `flexo:layout` value is read defensively instead: any
 * slice that doesn't match its expected shape falls back to that slice's default
 * (the same field-defaulting `lightSettings()` does in `src/state/settingsStore.ts`),
 * so a future field addition or a corrupted value degrades gracefully rather than
 * requiring a version bump.
 */

export interface SidebarLayout {
  width: number;
  collapsed: boolean;
}

export interface FloatPos {
  x: number;
  y: number;
}

export interface LayoutState {
  /** Left sidebar (the focus editor). Clamp 220–480, default 300 (foundation §1.1). */
  left: SidebarLayout;
  /** Right sidebar (the mode primary). Clamp 260–640, default 340. */
  right: SidebarLayout;
  /**
   * Bottom-docked Animation timeline. Height clamp 120–50vh, default 220.
   *
   * Two INDEPENDENT controls (design-animation-mode.md §5.1): `hidden` backs
   * **Window ▸ Timeline** (✓ = shown — the `floatHidden` precedent), `collapsed` backs the
   * transport's **⌄** control (the dock stays mounted as a 32px transport-only strip).
   */
  timeline: { height: number; collapsed: boolean; hidden: boolean };
  /** Per-window drag position, keyed by `FloatingWindow` id. `null` = default anchor (§6.4). */
  float: Record<string, FloatPos | null>;
  /** Float z-stack order, last = top (§6.3). Ids not present here render below any listed. */
  floatOrder: string[];
  /** Window ▸ Tool Bar-style visibility toggle backing, by `FloatingWindow` id (§6.4). */
  floatHidden: string[];
}

export const LAYOUT_DEFAULTS: LayoutState = {
  left: { width: 300, collapsed: false },
  right: { width: 340, collapsed: false },
  timeline: { height: 220, collapsed: false, hidden: false },
  float: {},
  floatOrder: [],
  floatHidden: [],
};

export const SIDEBAR_CLAMPS = {
  left: { min: 220, max: 480 },
  right: { min: 260, max: 640 },
} as const;

export const TIMELINE_MIN_HEIGHT = 120;

export const $layout = persistentJSON<LayoutState>('flexo:layout', LAYOUT_DEFAULTS);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** The timeline's max height in px: 50vh, or a fallback outside a `window` (SSR/tests). */
export function maxTimelineHeight(): number {
  return typeof window !== 'undefined' ? Math.round(window.innerHeight / 2) : 600;
}

function isSidebarLayout(v: unknown): v is SidebarLayout {
  return (
    typeof v === 'object' &&
    v !== null &&
    isFiniteNumber((v as Record<string, unknown>).width) &&
    typeof (v as Record<string, unknown>).collapsed === 'boolean'
  );
}

function sanitizeSidebar(
  raw: unknown,
  clamp: { min: number; max: number },
  fallback: SidebarLayout,
): SidebarLayout {
  if (!isSidebarLayout(raw)) return fallback;
  return { width: clampNum(raw.width, clamp.min, clamp.max), collapsed: raw.collapsed };
}

function isTimelineLayout(v: unknown): v is { height: number; collapsed: boolean } {
  return (
    typeof v === 'object' &&
    v !== null &&
    isFiniteNumber((v as Record<string, unknown>).height) &&
    typeof (v as Record<string, unknown>).collapsed === 'boolean'
  );
}

function sanitizeTimeline(raw: unknown): LayoutState['timeline'] {
  if (!isTimelineLayout(raw)) return LAYOUT_DEFAULTS.timeline;
  // `hidden` is read DEFENSIVELY, never migrated: a value stored before the flag existed
  // simply lacks the key and defaults to "shown" (constitution — no migration, ever).
  const hidden = (raw as Record<string, unknown>).hidden;
  return {
    height: clampNum(raw.height, TIMELINE_MIN_HEIGHT, maxTimelineHeight()),
    collapsed: raw.collapsed,
    hidden: typeof hidden === 'boolean' ? hidden : false,
  };
}

function isFloatPos(v: unknown): v is FloatPos {
  return (
    typeof v === 'object' &&
    v !== null &&
    isFiniteNumber((v as Record<string, unknown>).x) &&
    isFiniteNumber((v as Record<string, unknown>).y)
  );
}

function sanitizeFloatMap(raw: unknown): Record<string, FloatPos | null> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, FloatPos | null> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null) {
      out[id] = null;
    } else if (isFloatPos(value)) {
      out[id] = { x: value.x, y: value.y };
    }
    // else: drop the malformed entry
  }
  return out;
}

function sanitizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw) && raw.every((v) => typeof v === 'string') ? [...raw] : [];
}

/**
 * Defensive read: validates every slice of a raw (possibly stale, possibly corrupt)
 * `flexo:layout` value independently, falling back to that slice's DEFAULT — never
 * the whole object — when it doesn't match its expected shape. Widths/heights are
 * re-clamped into their current ranges even when otherwise valid, so a clamp range
 * tightened by a future change self-heals on next read.
 */
export function sanitizeLayout(raw: unknown): LayoutState {
  if (typeof raw !== 'object' || raw === null) return LAYOUT_DEFAULTS;
  const r = raw as Record<string, unknown>;
  return {
    left: sanitizeSidebar(r.left, SIDEBAR_CLAMPS.left, LAYOUT_DEFAULTS.left),
    right: sanitizeSidebar(r.right, SIDEBAR_CLAMPS.right, LAYOUT_DEFAULTS.right),
    timeline: sanitizeTimeline(r.timeline),
    float: sanitizeFloatMap(r.float),
    floatOrder: sanitizeStringArray(r.floatOrder),
    floatHidden: sanitizeStringArray(r.floatHidden),
  };
}

// Defensive read, once at module scope: heals a stored value against shape drift
// without ever migrating it (see the module doc comment).
$layout.set(sanitizeLayout($layout.get()));

/** Every mutator reads through {@link sanitizeLayout} so a stale stored shape self-heals. */
function currentLayout(): LayoutState {
  return sanitizeLayout($layout.get());
}

export function setSidebarWidth(side: 'left' | 'right', px: number): void {
  const current = currentLayout();
  const clamp = SIDEBAR_CLAMPS[side];
  $layout.set({
    ...current,
    [side]: { ...current[side], width: clampNum(px, clamp.min, clamp.max) },
  });
}

export function setSidebarCollapsed(side: 'left' | 'right', collapsed: boolean): void {
  const current = currentLayout();
  $layout.set({ ...current, [side]: { ...current[side], collapsed } });
}

export function toggleSidebar(side: 'left' | 'right'): void {
  const current = currentLayout();
  $layout.set({ ...current, [side]: { ...current[side], collapsed: !current[side].collapsed } });
}

export function setTimelineHeight(px: number): void {
  const current = currentLayout();
  const height = clampNum(px, TIMELINE_MIN_HEIGHT, maxTimelineHeight());
  $layout.set({ ...current, timeline: { ...current.timeline, height } });
}

/** The **⌄** control: collapse to the 32px transport-only strip, or expand again. */
export function toggleTimeline(): void {
  const current = currentLayout();
  $layout.set({
    ...current,
    timeline: { ...current.timeline, collapsed: !current.timeline.collapsed },
  });
}

/** **Window ▸ Timeline**: unmount / remount the whole dock (independent of `collapsed`). */
export function setTimelineHidden(hidden: boolean): void {
  const current = currentLayout();
  $layout.set({ ...current, timeline: { ...current.timeline, hidden } });
}

export function setFloatPos(id: string, pos: FloatPos | null): void {
  const current = currentLayout();
  $layout.set({ ...current, float: { ...current.float, [id]: pos } });
}

/** Moves `id` to the end of the z-stack (top); appends it if it wasn't already tracked. */
export function raiseFloat(id: string): void {
  const current = currentLayout();
  const floatOrder = [...current.floatOrder.filter((existing) => existing !== id), id];
  $layout.set({ ...current, floatOrder });
}

export function setFloatHidden(id: string, hidden: boolean): void {
  const current = currentLayout();
  const withoutId = current.floatHidden.filter((existing) => existing !== id);
  const floatHidden = hidden ? [...withoutId, id] : withoutId;
  $layout.set({ ...current, floatHidden });
}

/** Window ▸ Reset Window Layout. `nukeAndReload`'s `localStorage.clear()` already wipes the key. */
export function resetLayout(): void {
  $layout.set(LAYOUT_DEFAULTS);
}
