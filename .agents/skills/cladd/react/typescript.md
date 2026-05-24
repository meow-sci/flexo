---
title: "TypeScript"
description: "Component prop types, size unions, and shared types re-exported by cladd."
links:
  doc: https://cladd.io/react/typescript/
---

# TypeScript

`@cladd-ui/react` is written in TypeScript and ships its own types — no `@types/*` package needed. Every component re-exports its props as `<Name>Props`, every sized control re-exports its size union as `<Name>Size`, and a handful of shared types (`Color`, `TooltipPosition`, hook option types) are exported from the package root. You can use them to type wrapper components, forward props, or constrain configuration objects without restating the union by hand.

## Component prop types

Every component re-exports its props type alongside the component itself:

```tsx
import { Button, type ButtonProps } from '@cladd-ui/react';
```

The most common reason to reach for these is wrapping a cladd component in a project-specific one — a `<SaveButton>`, a `<SettingsRow>`, a `<DangerDialog>` — without having to restate the underlying API:

```tsx
import { Button, type ButtonProps } from '@cladd-ui/react';

interface SaveButtonProps extends Omit<ButtonProps, 'children' | 'color'> {
  label?: string;
}

export function SaveButton({ label = 'Save', ...props }: SaveButtonProps) {
  return (
    <Button color="brand" variant="gradient-fill" {...props}>
      {label}
    </Button>
  );
}
```

The same pattern works for every component: [`Input`](/react/components/input/) exports `InputProps`, [`Dialog`](/react/components/dialog/) exports `DialogProps` (and `DialogRootProps`, `DialogTriggerProps`, `DialogCloseProps`), [`Toolbar`](/react/components/toolbar/) exports `ToolbarProps`, and so on — there are no hidden internal types you have to redeclare.

## Size types

Components on the `2xs → 2xl` scale also export their size union, so you can use the same set of tokens in your own props without restating them. The unions are narrowed per component — [`Button`](/react/components/button/)'s `ButtonSize` covers the full seven steps, while [`Input`](/react/components/input/)'s `InputSize` starts at `sm`, and [`Switch`](/react/components/switch/)'s `SwitchSize` is only `'sm' | 'md'`. See [Sizing](/react/foundations/sizing/) for which component reads which slice of the scale.

```tsx
import { Button, type ButtonSize } from '@cladd-ui/react';

interface ToolbarActionProps {
  label: string;
  size?: ButtonSize;
}

export function ToolbarAction({ label, size = 'sm' }: ToolbarActionProps) {
  return <Button size={size}>{label}</Button>;
}
```

The full set: `ButtonSize`, `CheckboxSize`, `ChipSize`, `InputSize`, `NumberFieldSize`, `NumberScrubberSize`, `RadioSize`, `ShortcutSize`, `SliderSize`, `SpinnerSize`, `SwitchSize`, `TextareaSize`.

## Shared types

A few types aren't bound to a single component:

- **`Color`** — the eleven-token accent union shared by every component that takes a `color` prop. `'neutral' | 'brand' | 'red' | 'pink' | 'purple' | 'blue' | 'cyan' | 'lime' | 'green' | 'yellow' | 'orange'` (plus `(string & {})` to keep autocomplete open for custom accent tokens you've registered via CSS variables).
- **`SurfaceVariant`** — the five-token variant union shared by [`Surface`](/react/components/surface/) and every component that layers on top of it ([`Button`](/react/components/button/), [`Popover`](/react/components/popover/), [`Popup`](/react/components/popup/), [`Toast`](/react/components/toast/), [`Toolbar`](/react/components/toolbar/), etc.): `'transparent' | 'solid' | 'gradient' | 'solid-fill' | 'gradient-fill'`.
- **`TooltipPosition`** — the position union used by [`Tooltip`](/react/components/tooltip/) and `TooltipPrimitive` (`'top' | 'bottom' | 'left' | 'right'` and corner variants).
- **`PopoverPosition`** — the twelve-anchor position union used by [`Popover`](/react/components/popover/): the four sides (`'top'`, `'bottom'`, `'left'`, `'right'`) each in `-start`, plain, and `-end` alignment variants.

```tsx
import { Chip, type Color } from '@cladd-ui/react';

const statusColor: Record<'ok' | 'warn' | 'error', Color> = {
  ok: 'green',
  warn: 'yellow',
  error: 'red',
};

export function StatusChip({ status }: { status: keyof typeof statusColor }) {
  return <Chip color={statusColor[status]}>{status}</Chip>;
}
```

## Hook option types

The imperative hooks re-export the option shapes they accept, so you can build typed wrappers around your app's confirms, alerts, and toasts:

- [`useDialog`](/react/hooks/use-dialog/) — `UseDialogOptions`, `UseDialogAlertOptions`, `UseDialogConfirmOptions`.
- [`useToast`](/react/hooks/use-toast/) — `UseToastOptions`.

```tsx
import { useDialog, type UseDialogConfirmOptions } from '@cladd-ui/react';

const destructiveConfirm: Partial<UseDialogConfirmOptions> = {
  confirmButtonText: 'Delete',
  confirmButtonColor: 'red',
};

export function useDeleteConfirm() {
  const dialog = useDialog();
  return (text: string) =>
    dialog.confirm({ title: 'Delete?', text, ...destructiveConfirm });
}
```

## Polymorphic `as`

Components that accept an `as` prop ([`Button`](/react/components/button/), [`Link`](/react/components/link/), [`Surface`](/react/components/surface/), [`ListButton`](/react/components/list/), [`ToolbarButton`](/react/components/toolbar/), and others) are polymorphic — when you pass `as={NextLink}`, TypeScript narrows the props to include `NextLink`'s own props (`href`, `prefetch`, etc.) alongside the component's. You don't need a separate `LinkButtonProps` type; the existing `<Name>Props` adapts.

```tsx
import { Button } from '@cladd-ui/react';
import NextLink from 'next/link';

// `href` and `prefetch` are typed because `as={NextLink}` widens the prop set.
<Button as={NextLink} href="/docs" prefetch>
  Docs
</Button>;
```

If you're spreading external props into a wrapper, type the wrapper as generic over `as` or pin a concrete element — both work, and which one you reach for depends on how flexible the wrapper needs to be.
