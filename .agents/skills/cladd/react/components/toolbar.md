---
title: "Toolbar"
description: "Grouped strip of action buttons for editors, inspectors, and app shells."
links:
  doc: https://cladd.io/react/components/toolbar/
  api: https://cladd.io/react/components/toolbar/#api-reference
---

# Toolbar

`Toolbar` is the canonical control strip for editor chrome, inspector headers, and dense app-shell layouts — the place to line up formatting toggles, view switchers, action buttons, and shortcuts without each one re-declaring its own size, shape, and surface treatment. The toolbar acts as a [`Surface`](/react/components/surface/) container and a context provider in one: `size`, `rounded`, `variant`, and `outline` set on the toolbar are forwarded to every `ToolbarButton` inside, so a row of buttons stays coherent with a single prop on the parent.

This page covers `Toolbar` together with its children, `ToolbarButton` and `ToolbarSeparator`. [`Segmented`](/react/components/segmented/) is designed to nest inside `Toolbar` as well — see the [Segmented example](#with-segmented) below.

![Overview](https://cladd.io/screenshots/components/toolbar/overview.png)

```tsx
<ExampleToolbar>
  <Tooltip tooltip="Bold">
    <ToolbarButton
      color={marks.bold ? 'brand' : undefined}
      variant={marks.bold ? 'gradient' : 'transparent'}
      outline={marks.bold}
      onClick={() => toggle('bold')}
      aria-label="Bold"
    >
      <BoldIcon />
    </ToolbarButton>
  </Tooltip>
  <Tooltip tooltip="Italic">
    <ToolbarButton
      color={marks.italic ? 'brand' : undefined}
      variant={marks.italic ? 'gradient' : 'transparent'}
      outline={marks.italic}
      onClick={() => toggle('italic')}
      aria-label="Italic"
    >
      <ItalicIcon />
    </ToolbarButton>
  </Tooltip>
  <Tooltip tooltip="Underline">
    <ToolbarButton
      color={marks.underline ? 'brand' : undefined}
      variant={marks.underline ? 'gradient' : 'transparent'}
      outline={marks.underline}
      onClick={() => toggle('underline')}
      aria-label="Underline"
    >
      <UnderlineIcon />
    </ToolbarButton>
  </Tooltip>
  <ToolbarSeparator />
  <Segmented>
    {ALIGNMENTS.map((a) => {
      const Icon = ALIGNMENT_ICONS[a];
      return (
        <SegmentedButton
          key={a}
          active={a === align}
          onClick={() => setAlign(a)}
          aria-label={a}
        >
          <Icon />
        </SegmentedButton>
      );
    })}
  </Segmented>
  <ToolbarSeparator />
  <ToolbarButton variant="gradient" color="green">
    <CheckIcon />
    Publish
  </ToolbarButton>
</ExampleToolbar>
```

## Usage

```tsx
import { Toolbar, ToolbarButton, ToolbarSeparator } from '@cladd-ui/react';

<Toolbar>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarSeparator />
  <ToolbarButton>Publish</ToolbarButton>
</Toolbar>;
```

`Toolbar` renders a pill-shaped `gradient` [`Surface`](/react/components/surface/) with an outline ring by default — the standard floating-toolbar look. It lays out children in a horizontal flex row with consistent padding.

`ToolbarButton` is the same as [`Button`](/react/components/button/) — it accepts the full `Button` API — except that `size`, `rounded`, `variant`, and `outline` default to values read from the surrounding toolbar context. The defaults are tuned to the typical app-toolbar look: `transparent` variant, no outline, so buttons fade into the toolbar surface until hovered, and the active/focused one reads as the real control. Pass any of those props explicitly on a `ToolbarButton` to override per slot.

`ToolbarSeparator` is a thin vertical rule for grouping items — it has no props beyond `className` and `children`.

## Examples

### Sizes

`size` accepts the standard `2xs → 2xl` scale. The value is forwarded to every `ToolbarButton` (and any nested [`Segmented`](/react/components/segmented/)) through context, so you set the rhythm of the whole toolbar with a single prop on the parent. Use `2xs`–`xs` for inspector panels, `sm`–`md` for editor toolbars, `lg`+ for prominent action bars.

![Size](https://cladd.io/screenshots/components/toolbar/size.png)

```tsx
<Toolbar size={size}>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarButton>
    <UnderlineIcon />
  </ToolbarButton>
  <ToolbarSeparator />
  <ToolbarButton>Publish</ToolbarButton>
</Toolbar>
```

### Container variant

`variant` picks the surface treatment of the toolbar **shell** itself — `'gradient'` (default) and `'solid'` read as a real floating toolbar; `'transparent'` makes the toolbar dissolve into its parent so only the buttons remain; the `*-fill` variants tint the shell with the accent color. Pair with `outline` and `color` to dial in exactly how loud the housing reads.

When you switch the shell to `'solid-fill'` or `'gradient-fill'`, set `buttonVariant` to the matching fill so the children inherit the same colored surface. Otherwise the default `'transparent'` buttons sit on top of the filled shell with no contrast and the labels become unreadable. The example below derives `buttonVariant` from `variant` automatically.

![Variant](https://cladd.io/screenshots/components/toolbar/variant.png)

```tsx
<Toolbar variant={variant} buttonVariant={buttonVariant}>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarButton>
    <UnderlineIcon />
  </ToolbarButton>
</Toolbar>
```

### Outline

`outline` toggles the ring around the toolbar shell. With outline on (default), the toolbar reads as a self-contained pill — the typical look for a floating editor toolbar. Without outline, the shell relies on its fill alone, which works well when the toolbar is already inside a contrasting [`Surface`](/react/components/surface/) and an extra ring would be noise.

![Outline](https://cladd.io/screenshots/components/toolbar/outline.png)

```tsx
<Toolbar outline={outline}>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarButton>
    <UnderlineIcon />
  </ToolbarButton>
</Toolbar>
```

### Colors

`color` sets the accent token applied to the toolbar (`cladd-color-{name}`). On its own it doesn't change much — the default toolbar shell is mostly neutral — but it tints anything inside that uses the accent: any `ToolbarButton` with `variant="gradient"`/`"solid-fill"`/`"gradient-fill"`, accent rings on outlined buttons, and the active segment of a nested [`Segmented`](/react/components/segmented/). Treat it as the toolbar's accent context, not its main fill.

![Color](https://cladd.io/screenshots/components/toolbar/color.png)

```tsx
<Toolbar color={color}>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarButton>
    <UnderlineIcon />
  </ToolbarButton>
  <ToolbarSeparator />
  <ToolbarButton variant="gradient">
    <CheckIcon />
    Publish
  </ToolbarButton>
</Toolbar>
```

### Rounded

`rounded` controls the shell's corner shape — pill (`true`, default) or the size-specific radius. The same flag is forwarded to child `ToolbarButton`s through context so the buttons' corners follow the shell. Pill is right for floating toolbars; the size-radius look pairs well with toolbars docked inside a panel header that already has square-ish corners.

![Rounded](https://cladd.io/screenshots/components/toolbar/rounded.png)

```tsx
<Toolbar rounded={rounded}>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarButton>
    <UnderlineIcon />
  </ToolbarButton>
  <ToolbarSeparator />
  <ToolbarButton>Publish</ToolbarButton>
</Toolbar>
```

### Button style

`buttonVariant` and `buttonOutline` control the look of every `ToolbarButton` inside, via context. The defaults (`'transparent'`, no outline) make buttons fade into the toolbar surface until hovered — the typical app-toolbar feel. Switch to `'solid'` if you want every slot to read as a discrete button (handy when the toolbar is also acting as a key/legend); add `buttonOutline` for sharp ringed buttons.

![Button style](https://cladd.io/screenshots/components/toolbar/button-style.png)

```tsx
<Toolbar buttonVariant={buttonVariant} buttonOutline={buttonOutline}>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarButton>
    <UnderlineIcon />
  </ToolbarButton>
</Toolbar>
```

### Per-button override

Anything set on a `ToolbarButton` directly wins over the toolbar's context defaults. Use this for one-off emphasis — a primary "Publish" with `variant="gradient" color="brand"`, a destructive "Discard" with `variant="solid" color="red"` — without disturbing the muted look of the surrounding buttons.

![Per button override](https://cladd.io/screenshots/components/toolbar/per-button-override.png)

```tsx
<Toolbar>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarButton>
    <UnderlineIcon />
  </ToolbarButton>
  <ToolbarSeparator />
  <ToolbarButton color="red" variant="solid">
    Discard
  </ToolbarButton>
  <ToolbarButton color="brand" variant="gradient">
    <CheckIcon />
    Publish
  </ToolbarButton>
</Toolbar>
```

### With separator

`ToolbarSeparator` is a 1px vertical rule used to group items inside a toolbar — formatting on one side, alignment on the other; navigation on one side, actions on the other. It's the simplest piece in the trio: no props beyond `className`, no behavior, just a thin line that picks up the toolbar's outline color.

![With separator](https://cladd.io/screenshots/components/toolbar/with-separator.png)

```tsx
<Toolbar>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarButton>
    <UnderlineIcon />
  </ToolbarButton>
  <ToolbarSeparator />
  <ToolbarButton>
    <AlignLeftIcon />
  </ToolbarButton>
  <ToolbarButton>
    <AlignCenterIcon />
  </ToolbarButton>
  <ToolbarButton>
    <AlignRightIcon />
  </ToolbarButton>
</Toolbar>
```

### With Segmented

[`Segmented`](/react/components/segmented/) is designed to drop straight into a `Toolbar`. It reads the toolbar's `size`, `rounded`, and `color` from context, so a view switcher or alignment picker stays in sync with the surrounding controls without any extra prop wiring. Pair `ToolbarButton`s for stateless actions with `Segmented` for single-select state — that's the canonical editor-toolbar shape.

![With segmented](https://cladd.io/screenshots/components/toolbar/with-segmented.png)

```tsx
<Toolbar>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarButton>
    <UnderlineIcon />
  </ToolbarButton>
  <ToolbarSeparator />
  <Segmented>
    {ALIGNMENTS.map((a) => {
      const Icon = ALIGNMENT_ICONS[a];
      return (
        <SegmentedButton
          key={a}
          active={a === align}
          onClick={() => setAlign(a)}
          aria-label={a}
        >
          <Icon />
        </SegmentedButton>
      );
    })}
  </Segmented>
</Toolbar>
```

### Playground

The toolbar exposes two parallel sets of style props — one for the shell (`variant`, `outline`, `color`), one for the children (`buttonVariant`, `buttonOutline`) — plus the shared layout knobs (`size`, `rounded`). They compose freely; the playground below combines them all.

![Playground](https://cladd.io/screenshots/components/toolbar/playground.png)

```tsx
<Toolbar
  variant={variant}
  color={color}
  size={size}
  outline={outline}
  rounded={rounded}
  buttonVariant={buttonVariant}
  buttonOutline={buttonOutline}
>
  <ToolbarButton>
    <BoldIcon />
  </ToolbarButton>
  <ToolbarButton>
    <ItalicIcon />
  </ToolbarButton>
  <ToolbarButton>
    <UnderlineIcon />
  </ToolbarButton>
  <ToolbarSeparator />
  <ToolbarButton>Publish</ToolbarButton>
</Toolbar>
```

## API Reference

### Toolbar

**Generics:** `C extends ElementType = 'div'`

**Inherits from:** [`Surface`](/react/components/surface/)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `as?` | `ElementType` | `'div'` | Polymorphic root element. Defaults to `'div'`. |
| `buttonOutline?` | `boolean` | `false` | Outline ring on child `ToolbarButton`s. Default `false`. |
| `buttonVariant?` | `SurfaceVariant` | `'transparent'` | Surface variant applied to child `ToolbarButton`s through context.<br>Default `'transparent'` - buttons fade into the toolbar surface until hovered. |
| `children?` | `ReactNode` | — | Toolbar items - typically `ToolbarButton` and `ToolbarSeparator`. |
| `className?` | `string` | — | Extra classes for the toolbar surface root. |
| `color?` | `Color` | — | Accent color token. Sets the toolbar's `cladd-color-{name}` class. |
| `contentClassName?` | `string` | — | Extra classes for the inner `SurfaceContent` wrapper (where toolbar items are laid out). |
| `outline?` | `boolean` | `true` | Outline ring on the toolbar **container**. Default `true`. |
| `rounded?` | `boolean` | `true` | Pill-shape the toolbar container (`rounded-full`). Default `true`.<br>Also forwarded via context as the default `rounded` for child `ToolbarButton`s. |
| `size?` | `ButtonSize` | `'md'` | Toolbar button size. Default `'md'`. Forwarded via context to child `ToolbarButton`s. |
| `surfaceLevel?` | `number \| string` | — | Forwarded to the underlying `Surface` as `level` - see `SurfaceProps.level`. |
| `variant?` | `SurfaceVariant` | `'gradient'` | Surface variant for the toolbar **container**. Default `'gradient'`. |

### ToolbarButton

**Generics:** `C extends ElementType = 'button'`

**Inherits from:** [`Button`](/react/components/button/)

_No own props — see inherited types above._

### ToolbarSeparator

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | Optional content rendered inside the separator (rare - the separator is normally just a thin rule). |
| `className?` | `string` | — | Extra classes for the separator element. |
