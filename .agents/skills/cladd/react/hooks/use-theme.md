---
title: "useTheme"
description: "Read whether the app is in dark or light mode."
links:
  doc: https://cladd.io/react/hooks/use-theme/
---

# useTheme

`useTheme()` reads the current color scheme — `'dark'` or `'light'` — published by [`CladdProvider`](/react/components/cladd-provider/). It's a one-line `useContext` read with no setter: cladd's job is to **publish** the theme, not to **toggle** it. Flipping the actual color tokens (a `data-theme` attribute on `<html>`, a CSS class, a media query) is your app's responsibility — `useTheme` is how the rest of the tree finds out which one is active.

Reach for it when you need to branch on theme in your own components: swap a logo asset, pick a different illustration, render a per-theme placeholder, or replicate the per-theme defaults the kit's own floating surfaces ([`Popover`](/react/components/popover/), [`Dialog`](/react/components/dialog/), [`Tooltip`](/react/components/tooltip/)) use under the hood.

```tsx
<div className="flex flex-col items-center gap-4">
  <SectionTitle>Current theme</SectionTitle>
  <Chip color={theme === 'dark' ? 'purple' : 'yellow'} size="lg">
    {theme}
  </Chip>
  <span className="text-xs text-cladd-fg-soft">
    Toggle via the theme switch in the header.
  </span>
</div>
```

## Usage

```tsx
import { useTheme } from '@cladd-ui/react';

function Logo() {
  const theme = useTheme();
  return (
    <img
      src={theme === 'dark' ? '/logo-dark.svg' : '/logo-light.svg'}
      alt="Cladd"
    />
  );
}
```

The hook must be called from a descendant of [`CladdProvider`](/react/components/cladd-provider/). Outside the provider it falls back to the default (`'dark'`) — cladd is dark-first.

## Signature

```ts
function useTheme(): 'dark' | 'light';
```

Returns the literal `'dark'` or `'light'`. The value is the same one passed to [`CladdProvider`](/react/components/cladd-provider/)'s `theme` prop — see the [provider docs](/react/components/cladd-provider/#theme) for what the kit does with it.

## Notes

- **No setter.** `useTheme` is read-only. To toggle the theme, lift state in your own app shell and pass the new value to [`CladdProvider`](/react/components/cladd-provider/)'s `theme` prop on the next render.
- **CSS tokens are your job.** The hook tells you which theme is _declared_; it doesn't apply the palette. Pair the provider's `theme` with a `data-theme` attribute (or class) on the root element and define both palettes in CSS.
- **SSR-safe.** It's a plain context read — the value is consistent across server and client as long as the provider gets the same `theme` prop on both.
