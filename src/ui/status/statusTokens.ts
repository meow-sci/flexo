import {
  Boxes,
  BoxSelect,
  Eye,
  Flame,
  Palette,
  PlayCircle,
  Rocket,
  Ruler,
  Table2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Severity } from '../../state/statusStore';
import type { Mode } from '../../state/modeStore';

/**
 * The lookup tables the **desktop status bar and the phone's `CondensedStatusBar` share**
 * (design: `plans/flexo_v2/design/design-system-services.md` §1.2, §8.1). They live in a
 * JSX-free module for one reason: a component file may not export non-components
 * (`react/only-export-components`), and these maps are read by both frames of the same bar.
 *
 * Keeping them in ONE place is what stops the two frames drifting — a mode that gains an
 * icon on the desktop cannot silently keep the old one on the phone.
 */

/** Mode → chip icon (segment 1 / the phone's mode-or-tool chip). */
export const MODE_ICONS: Record<Mode, LucideIcon> = {
  build: Boxes,
  animation: PlayCircle,
  data: Table2,
  engine: Rocket,
  surface: Palette,
};

/**
 * The lucide names `statusStore.ToolStatus.icon` may carry. `ToolStatus` is state, so it
 * names its icon as a STRING and this map resolves it UI-side (`src/state/` imports no
 * react).
 */
export const TOOL_ICONS: Record<string, LucideIcon> = {
  Eye,
  Ruler,
  Flame,
  BoxSelect,
};

/** The message channel's 2px leading severity dot (§1.2 #5). */
export const SEVERITY_DOT: Record<Severity, string> = {
  info: 'bg-fg-muted',
  success: 'bg-accent',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/** The message channel's severity text tint. */
export const SEVERITY_TEXT: Record<Severity, string> = {
  info: 'text-fg-muted',
  success: 'text-fg',
  warning: 'text-warning',
  danger: 'text-danger',
};
