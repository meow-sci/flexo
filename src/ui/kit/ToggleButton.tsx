import {
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup as AriaToggleButtonGroup,
  composeRenderProps,
  type ToggleButtonProps,
  type ToggleButtonGroupProps,
} from 'react-aria-components';
import { tv, type VariantProps } from 'tailwind-variants';
import { cn, focusRing, composeTw } from './styles';

const toggle = tv({
  extend: focusRing,
  base: 'inline-flex flex-1 select-none items-center justify-center gap-1.5 rounded-md font-medium transition-colors cursor-default disabled:opacity-45 disabled:pointer-events-none',
  variants: {
    size: {
      // Bars + sidebars only (design-system-services §7.2).
      xs: 'h-5 px-1.5 text-xs',
      sm: 'h-6 px-2.5 text-xs',
      md: 'h-8 px-3 text-sm',
    },
    isSelected: {
      false: 'text-fg-muted hover:bg-wash-hover hover:text-fg',
      true: 'bg-accent text-accent-fg',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface ToggleButtonKitProps
  extends ToggleButtonProps, Pick<VariantProps<typeof toggle>, 'size'> {}

/** Single toggle (also used as the item inside {@link ToggleButtonGroup}). */
export function ToggleButton({ size, className, ...props }: ToggleButtonKitProps) {
  return (
    <AriaToggleButton
      {...props}
      className={composeRenderProps(className, (cls, renderProps) =>
        toggle({ ...renderProps, size, className: cls }),
      )}
    />
  );
}

export interface ToggleButtonGroupKitProps extends ToggleButtonGroupProps {
  /** Tray density: `xs` tightens the tray for bars/sidebars (design-system-services §7.2). */
  size?: 'md' | 'xs';
}

/** Segmented control: a row of connected {@link ToggleButton}s. */
export function ToggleButtonGroup({ size = 'md', className, ...props }: ToggleButtonGroupKitProps) {
  return (
    <AriaToggleButtonGroup
      {...props}
      className={composeTw(
        cn(
          'inline-flex w-full rounded-lg border border-border bg-panel-sunken',
          size === 'xs' ? 'gap-px p-px' : 'gap-0.5 p-0.5',
        ),
        className,
      )}
    />
  );
}
