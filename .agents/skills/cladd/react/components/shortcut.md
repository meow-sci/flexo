---
title: "Shortcut"
description: "Inline display of a keyboard shortcut."
links:
  doc: https://cladd.io/react/components/shortcut/
  api: https://cladd.io/react/components/shortcut/#api-reference
---

# Shortcut

`Shortcut` renders a keyboard shortcut as a row of small key surfaces — the right primitive for menu hotkeys, command-palette hints, tooltip annotations, and any "press X to do Y" affordance. Pass a string like `"cmd shift k"` and it splits on whitespace, swaps recognized tokens (`cmd`, `shift`, arrows, `enter`, `space`, …) for glyph icons, and uppercases the rest. On macOS `cmd` renders as the ⌘ glyph; on other platforms it falls back to `CTRL`.

`Shortcut` shares the `2xs → 2xl` size scale with [`Button`](/react/components/button/), [`Chip`](/react/components/chip/), and [`Spinner`](/react/components/spinner/), but sized one notch smaller than its size peers — a `md` shortcut fits flush inside the content row of a `md` button without extra adjustment.

![Overview](https://cladd.io/screenshots/components/shortcut/overview.png)

```tsx
<Shortcut>esc</Shortcut>
<Shortcut>cmd s</Shortcut>
<Shortcut>cmd shift p</Shortcut>
<Shortcut>shift up</Shortcut>
<Shortcut color="brand">enter</Shortcut>
<Shortcut variant="transparent">alt tab</Shortcut>
```

## Usage

```tsx
import { Shortcut } from '@cladd-ui/react';

<Shortcut>cmd shift k</Shortcut>;
```

The default rendering is a `gradient`-variant key with an outline ring, sized `md`, lifted two surface levels above its parent — the look you want for shortcuts displayed alongside button labels or in menus on top of a regular surface. Each whitespace-separated token in the string becomes its own key. Non-string children are passed through as-is, one per key — handy for numeric hints (`<Shortcut>1</Shortcut>`) or custom glyphs.

## Examples

### Sizes

`size` accepts the standard cladd scale — `2xs`, `xs`, `sm`, `md` (default), `lg`, `xl`, `2xl`. Unlike [`Button`](/react/components/button/) and [`Input`](/react/components/input/), the shortcut at a given size is intentionally a step shorter than its same-size button — the keys are meant to ride inside a button's content row, not stand alongside one as equal-height controls. Pick the same `size` token as the surrounding control and the proportions land correctly without manual fiddling.

In practice, stick to `sm` and up for standalone shortcuts. `2xs` and `xs` exist for the rare case where a shortcut is nested inside something already small (a tooltip on a `xs` toolbar button, a hint inside a tight inspector row) — at those sizes the glyphs and labels get tight enough that the keys start to look fragile rather than legible.

![Size](https://cladd.io/screenshots/components/shortcut/size.png)

```tsx
<Shortcut size={size}>cmd shift k</Shortcut>
```

### Inside a button

The canonical use: append a shortcut to a button's label so the hotkey reads as part of the action. Pass the same `size` to both — the shortcut's height settles inside the button's content row at the right proportion at every step of the scale. Works the same way in transparent buttons that act as command-palette entries.

![Inside button](https://cladd.io/screenshots/components/shortcut/inside-button.png)

```tsx
<Button size={size}>
  Save
  <Shortcut size={size}>cmd s</Shortcut>
</Button>
<Button size={size} variant="transparent" outline>
  Search
  <Shortcut size={size}>cmd k</Shortcut>
</Button>
```

### Inside a tooltip

A tooltip with a shortcut hint is the standard pattern for icon-only [`Toolbar`](/react/components/toolbar/) buttons — the icon carries the meaning, the tooltip names the action, and the shortcut tells you how to trigger it from the keyboard. The tooltip body accepts any `ReactNode`, so a flex `<span>` wrapping the label and the shortcut is all you need.

![Inside tooltip](https://cladd.io/screenshots/components/shortcut/inside-tooltip.png)

```tsx
<Tooltip
  tooltip={
    <span className="flex items-center gap-2">
      Bold
      <Shortcut variant="solid-fill">cmd b</Shortcut>
    </span>
  }
>
  <Button variant="transparent" outline aria-label="Bold">
    <BoldIcon />
  </Button>
</Tooltip>
<Tooltip
  tooltip={
    <span className="flex items-center gap-2">
      Italic
      <Shortcut variant="solid-fill">cmd i</Shortcut>
    </span>
  }
>
  <Button variant="transparent" outline aria-label="Italic">
    <ItalicIcon />
  </Button>
</Tooltip>
<Tooltip
  tooltip={
    <span className="flex items-center gap-2">
      Underline
      <Shortcut variant="solid-fill">cmd u</Shortcut>
    </span>
  }
>
  <Button variant="transparent" outline aria-label="Underline">
    <UnderlineIcon />
  </Button>
</Tooltip>
```

### Inside a list

Drop a `Shortcut` into [`ListButton`](/react/components/list-button/)'s `after` slot to build a dropdown menu, command palette, or context menu where each row reads as `[icon  Action            cmd X]`. The `transparent` variant with a soft `keyClassName` matches the look used by [`Select`](/react/components/select/) for its keyboard-navigation hints — the keys recede into the row instead of competing with the label.

![Inside list](https://cladd.io/screenshots/components/shortcut/inside-list.png)

```tsx
<Surface outline className="w-72 rounded-2xl" wrapContent={false}>
  <List>
    <ListButton
      icon={<CopyIcon />}
      after={
        <Shortcut
          variant="transparent"
          keyClassName="font-normal text-cladd-fg-soft"
        >
          cmd c
        </Shortcut>
      }
    >
      Copy
    </ListButton>
    <ListButton
      icon={<PlusIcon />}
      after={
        <Shortcut
          variant="transparent"
          keyClassName="font-normal text-cladd-fg-soft"
        >
          cmd d
        </Shortcut>
      }
    >
      Duplicate
    </ListButton>
    <ListButton
      icon={<CheckIcon />}
      after={
        <Shortcut
          variant="transparent"
          keyClassName="font-normal text-cladd-fg-soft"
        >
          enter
        </Shortcut>
      }
    >
      Mark as done
    </ListButton>
    <ListSeparator />
    <ListButton
      color="red"
      after={
        <Shortcut variant="transparent" keyClassName="font-normal">
          backspace
        </Shortcut>
      }
    >
      Delete
    </ListButton>
  </List>
</Surface>
```

### Glyph tokens

Recognized tokens render as keyboard glyphs instead of text. The full set: `cmd`, `ctrl`, `alt`, `shift`, `enter` (or `return`), `tab`, `space`, `esc` (or `escape`), `backspace` (or `delete`/`del`), and the four arrows `up`, `down`, `left`, `right`. Anything unrecognized is rendered as uppercase text — letters, digits, punctuation, function keys, all just work as `<Shortcut>cmd alt f12</Shortcut>`.

`cmd` and `alt` are platform-aware: on macOS they render as ⌘ and ⌥; on Windows/Linux `cmd` falls back to `CTRL` text and `alt` to `ALT`. Detection runs in a layout effect from `navigator.userAgent`, so the first paint matches the user's actual platform.

![Glyphs](https://cladd.io/screenshots/components/shortcut/glyphs.png)

```tsx
<Shortcut>cmd</Shortcut>
<Shortcut>ctrl</Shortcut>
<Shortcut>alt</Shortcut>
<Shortcut>shift</Shortcut>
<Shortcut>enter</Shortcut>
<Shortcut>tab</Shortcut>
<Shortcut>space</Shortcut>
<Shortcut>esc</Shortcut>
<Shortcut>backspace</Shortcut>
<Shortcut>up</Shortcut>
<Shortcut>down</Shortcut>
<Shortcut>left</Shortcut>
<Shortcut>right</Shortcut>
```

### Variant

`variant` picks the [`Surface`](/react/components/surface/) treatment of each key. The default `gradient` reads as a real elevated key against a regular surface. Use `transparent` for inline hints inside a list or menu where you want the keys to recede; use the `*-fill` variants when you want the shortcut to look like a tinted, primary-colored chip.

![Variant](https://cladd.io/screenshots/components/shortcut/variant.png)

```tsx
<Shortcut variant={variant}>cmd shift s</Shortcut>
```

### Outline

`outline` toggles the 1px ring around each key. With outline on (default), each key reads as a self-contained surface with a sharp edge — the look you want for free-standing shortcuts. Drop the outline for a softer, less boxy feel — works well when the shortcut sits inside a denser container and the rings would add visual noise.

![Outline](https://cladd.io/screenshots/components/shortcut/outline.png)

```tsx
<Shortcut outline={outline}>cmd k</Shortcut>
<Shortcut outline={outline} variant="transparent">
  cmd k
</Shortcut>
<Shortcut outline={outline} color="brand">
  enter
</Shortcut>
```

### Colors

`color` accepts any of the eleven cladd accent tokens. The accent tints the text on `gradient`/`solid`/`transparent` keys and tints the fill on `solid-fill`/`gradient-fill`. Use it sparingly — a colored shortcut reads as the primary action (a brand-tinted `enter` next to a list of options, a red `backspace` next to a destructive entry).

![Color](https://cladd.io/screenshots/components/shortcut/color.png)

```tsx
<Shortcut color={color}>cmd shift k</Shortcut>
```

### Playground

`size`, `variant`, `color`, and `outline` compose freely. Pair the playground with the same controls you'd reach for on [`Button`](/react/components/button/) — a `md` transparent shortcut for a list-row hint, a `md` gradient brand shortcut for a primary action, an `xl` solid-fill key for a marketing hero callout.

![Playground](https://cladd.io/screenshots/components/shortcut/playground.png)

```tsx
<Shortcut size={size} variant={variant} color={color} outline={outline}>
  cmd shift enter
</Shortcut>
```

## API Reference

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | Shortcut content. Strings are split on whitespace into individual keys.<br>Recognized tokens (`cmd`, `ctrl`, `alt`, `shift`, `enter`, `tab`, `space`, `up`, `down`, `left`, `right`, `backspace`, `delete`, `esc`, etc.) render as glyphs - others render as uppercase text.<br>Non-string children are rendered as-is in their own key. |
| `className?` | `string` | — | Extra classes for the shortcut root container. |
| `color?` | `Color` | — | Accent color token applied to each key surface. |
| `iconClassName?` | `string` | — | Extra classes for keyboard icon glyphs (cmd, shift, arrows, etc.). |
| `keyClassName?` | `string` | — | Extra classes for each individual key surface. |
| `keyContentClassName?` | `string` | — | Extra classes for the inner content of each key. |
| `outline?` | `boolean` | `true` | Render an outline ring on each key surface. Default `true`. |
| `size?` | `ShortcutSize` | `'md'` | Key dimension. Default `'md'`. Drives height, font size, icon size, and corner radius. |
| `surfaceLevel?` | `string \| number` | `'+2'` | Surface level for each key. Default `'+2'`.<br>Accepts the same absolute / relative (`"+1"`/`"-1"`) syntax as `Surface.level`. |
| `variant?` | `SurfaceVariant` | `'gradient'` | Surface variant for each key. Default `'gradient'`. |
