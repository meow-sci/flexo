import type { ReactNode } from 'react';
import { Button, cn, type ButtonKitProps } from '../kit';

/**
 * The status bar's chip vocabulary (design: `plans/flexo_v2/design/design-system-services.md`
 * §1.0). EVERY status-bar segment is built from these three pieces so the bar reads as one
 * row of chips rather than a strip of ad-hoc spans:
 *
 * - {@link StatusChip} — a PASSIVE readout (selection dims, FPS, a tool instruction).
 * - {@link StatusChipButton} — an INTERACTIVE chip: a kit `xs` ghost Button wearing the
 *   same recipe (mode chip, layer chip, rotate/nudge chips, snap chip, bell).
 * - {@link StatusDivider} — the 1px vertical rule between segment groups.
 *
 * Numbers inside a chip render `font-mono tabular-nums` (§1.0) — that is per-call-site,
 * because only part of a chip's text is usually numeric.
 */

/** The shared chip recipe. Exported for the rare segment that needs it on its own element. */
export const statusChipClass =
  'inline-flex h-full cursor-default items-center gap-1 px-1.5 text-xs';

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

/** A passive readout chip — no hover wash, no press target. */
export function StatusChip({ className, ...props }: StatusChipProps) {
  return <span {...props} className={cn(statusChipClass, 'text-fg-muted', className)} />;
}

/**
 * An interactive chip. A kit `xs` ghost Button (which already carries the hover
 * `bg-wash-hover` and press washes), de-emphasized to chip weight.
 */
export interface StatusChipButtonProps extends Omit<ButtonKitProps, 'className'> {
  className?: string;
}

export function StatusChipButton({ className, ...props }: StatusChipButtonProps) {
  return (
    <Button
      size="xs"
      variant="ghost"
      {...props}
      className={cn('gap-1 px-1.5 font-normal text-fg-muted', className)}
    />
  );
}

/** The 1px vertical rule between segments, with the density gap on both sides. */
export function StatusDivider() {
  return <span aria-hidden="true" className="mx-(--density-gap) h-3 w-px shrink-0 bg-border" />;
}
