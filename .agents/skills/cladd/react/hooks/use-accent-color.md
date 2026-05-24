---
title: "useAccentColor"
description: "Read the app's current accent color."
links:
  doc: https://cladd.io/react/hooks/use-accent-color/
---

# useAccentColor

`useAccentColor()` returns the app-wide accent color published by [`CladdProvider`](/react/components/cladd-provider/) — one of the eleven cladd accent tokens (`'brand'`, `'red'`, `'orange'`, `'yellow'`, `'green'`, `'cyan'`, `'lime'`, `'blue'`, `'purple'`, `'pink'`, `'neutral'`). Cladd's own controls — [`Button`](/react/components/button/), [`Switch`](/react/components/switch/), [`Checkbox`](/react/components/checkbox/), [`Radio`](/react/components/radio/), [`Chip`](/react/components/chip/), [`Slider`](/react/components/slider/) — already fall back to this value when their `color` prop is unset, so most of the time you don't need to read it yourself.

Reach for it when you're building **custom** components that should pick up the same accent the rest of the app uses, or when you want to default a per-instance `color` prop to the app accent without hardcoding `'brand'`.

```tsx
<div className="flex flex-col items-center gap-4">
  <SectionTitle>App-wide accent</SectionTitle>
  <div className="flex items-center gap-2">
    <Chip color={accent} size="lg">
      {accent}
    </Chip>
    <Button color={accent} variant="gradient" size="lg">
      App accent
    </Button>
  </div>
  <span className="text-xs text-cladd-fg-soft">
    Default when no `accentColor` is passed to CladdProvider.
  </span>
</div>
```

## Usage

```tsx
import { Chip, useAccentColor } from '@cladd-ui/react';

function StatusChip({ children, color }) {
  const accent = useAccentColor();
  return <Chip color={color ?? accent}>{children}</Chip>;
}
```

Pass the result anywhere a `Color` token is expected — accent-aware components, your own [`Surface`](/react/components/surface/) wrappers, or as a class via `cladd-color-${accent}`.

## Signature

```ts
function useAccentColor(): Color;
```

`Color` is the eleven-token union exported from `@cladd-ui/react`. Outside [`CladdProvider`](/react/components/cladd-provider/) the hook falls back to the default (`'brand'`).

## Notes

- **No setter.** Like [`useTheme`](/react/hooks/use-theme/), the hook is read-only — to change the accent at runtime, drive the provider's `accentColor` prop from your own state.
- **Per-instance still wins.** Components that accept `color` only fall back to the app accent when no `color` is passed. `<Button color="red">Delete</Button>` stays red regardless of the app accent.
- **Not the only way to apply the accent.** Adding the `cladd-color-{name}` class to any element (or using the `color` prop on [`Surface`](/react/components/surface/)) sets the local accent for the subtree — `useAccentColor` is specifically the **app-wide** value published once at the root.
