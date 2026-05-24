---
title: "Tooltip"
description: "Small floating label that appears on hover, focus, or touch."
links:
  doc: https://cladd.io/react/components/tooltip/
  api: https://cladd.io/react/components/tooltip/#api-reference
---

# Tooltip

`Tooltip` is the dense-app tooltip primitive — the right component for keyboard-shortcut hints on toolbar buttons, label tooltips on icon-only controls, and quick descriptions on chips, badges, and form rows. It runs in two modes from a single component: a **wrapper** mode where the tooltip cloneElements onto its trigger and handles hover/focus/touch automatically, and a **primitive** mode where you point it at any external element via `anchorRef` and drive `open` yourself. The wrapper is what you'll use ninety percent of the time; the primitive is there for the cases where the trigger lives outside the React subtree (a canvas hit, a far-away portal, a programmatic walkthrough).

![Overview](https://cladd.io/screenshots/components/tooltip/overview.png)

```tsx
<Toolbar>
  <Tooltip
    contentClassName="flex items-center gap-2"
    tooltip={
      <>
        Bold <Shortcut variant="gradient-fill">cmd B</Shortcut>
      </>
    }
  >
    <ToolbarButton aria-label="Bold">
      <BoldIcon />
    </ToolbarButton>
  </Tooltip>
  <Tooltip
    contentClassName="flex items-center gap-2"
    tooltip={
      <>
        Italic <Shortcut variant="gradient-fill">cmd I</Shortcut>
      </>
    }
  >
    <ToolbarButton aria-label="Italic">
      <ItalicIcon />
    </ToolbarButton>
  </Tooltip>
  <Tooltip
    contentClassName="flex items-center gap-2"
    tooltip={
      <>
        Underline <Shortcut variant="gradient-fill">cmd U</Shortcut>
      </>
    }
  >
    <ToolbarButton aria-label="Underline">
      <UnderlineIcon />
    </ToolbarButton>
  </Tooltip>
  <ToolbarSeparator />
  <Tooltip tooltip="Copy to clipboard" position="bottom" color="brand">
    <ToolbarButton aria-label="Copy">
      <CopyIcon />
    </ToolbarButton>
  </Tooltip>
</Toolbar>
```

## Usage

```tsx
import { Tooltip } from '@cladd-ui/react';

<Tooltip tooltip="Bold">
  <Button>
    <BoldIcon />
  </Button>
</Tooltip>;
```

Passing the `tooltip` prop switches the component into **wrapper mode**: `children` becomes the trigger (must be a single React element — `Tooltip` clones a ref onto it), and the value of `tooltip` is rendered as the floating content. The wrapper attaches its own pointer listeners — `pointerenter`/`pointerleave` for mouse, `pointerdown`/`pointerup` for touch — and handles the show/hide delay automatically. The tooltip is portaled into the [`CladdProvider`](/react/components/cladd-provider/) overlays root and anchored to the trigger via CSS anchor positioning.

Leave `tooltip` undefined and `Tooltip` switches into **primitive mode** — `children` is now the tooltip _content_, you pass `anchorRef` to point at the trigger, and you drive `open`/`onOpenChange` yourself. The same component is also exported as `TooltipPrimitive` for cases where the distinction matters at the import site. See the [controlled example](#controlled) below.

## Examples

### Wrapper mode

The standard pattern: drop a `Tooltip` around any single element. The wrapper clones a ref onto the child so the tooltip can anchor against it — any existing ref or `onClick` on the child is composed, not replaced.

![Wrapper](https://cladd.io/screenshots/components/tooltip/wrapper.png)

```tsx
<Tooltip tooltip="Hover me — this is a tooltip">
  <Button>Hover the button</Button>
</Tooltip>
```

### Position

`position` accepts `'top'` (default) or `'bottom'`. The tooltip uses CSS anchor positioning with a `flip-block` fallback, so if there's not enough room on the requested side it flips automatically — the prop sets the preferred side, not a hard placement.

![Position](https://cladd.io/screenshots/components/tooltip/position.png)

```tsx
<Tooltip tooltip="Hello from a tooltip" position={position}>
  <Button>Hover me</Button>
</Tooltip>
```

### Colors

`color` accepts any of the eleven cladd accent tokens and sets the `cladd-color-{name}` class on the tooltip surface. It tints the gradient fill behind the text — quietly on most surfaces, more loudly on `brand`, `red`, and the warm accents. Match it to the trigger when the tooltip is reinforcing a primary action; leave it default for plain label tooltips.

![Color](https://cladd.io/screenshots/components/tooltip/color.png)

```tsx
<Tooltip tooltip={color} color={color}>
  <Button color={color} variant="gradient">
    Hover me
  </Button>
</Tooltip>
```

### Timeout

`timeout` (default `true`) governs the show delay: 500ms on touch, 1000ms on mouse. The timer is _global_ — once one tooltip in the page has shown, the next hover within ~1s skips the wait. Same UX as system tooltips. Set `timeout={false}` for tooltips that should appear instantly — handy for "always-on" hints in playgrounds, design tools, or any context where the tooltip is the primary affordance rather than a secondary hint.

![Timeout](https://cladd.io/screenshots/components/tooltip/timeout.png)

```tsx
<Tooltip
  tooltip={timeout ? 'Standard delay' : 'Appears instantly'}
  timeout={timeout}
>
  <Button>Hover me</Button>
</Tooltip>
```

### Keyboard shortcuts

The canonical macOS-style tooltip pairs a label with its keyboard shortcut. Drop a [`Shortcut`](/react/components/shortcut/) into the `tooltip` slot — pick `size="2xs"` so the keycaps stay proportional to the tooltip's 12px text. Works on toolbar buttons, menu items, and anywhere a hover-revealed shortcut hint makes sense.

![Shortcut](https://cladd.io/screenshots/components/tooltip/shortcut.png)

```tsx
<Tooltip
  contentClassName="flex items-center gap-2"
  tooltip={
    <>
      Save document <Shortcut variant="gradient-fill">cmd S</Shortcut>
    </>
  }
>
  <Button color="brand" variant="gradient">
    Save
  </Button>
</Tooltip>
<Tooltip
  contentClassName="flex items-center gap-2"
  tooltip={
    <>
      Undo <Shortcut variant="gradient-fill">cmd Z</Shortcut>
    </>
  }
>
  <Button>Undo</Button>
</Tooltip>
<Tooltip
  contentClassName="flex items-center gap-2"
  tooltip={
    <>
      Quit <Shortcut variant="gradient-fill">cmd Q</Shortcut>
    </>
  }
>
  <Button>Quit</Button>
</Tooltip>
```

### Rich content

`tooltip` takes any `ReactNode`, not just a string — multi-line descriptions, formatted text, inline glyphs all work. For longer copy, widen the surface with `className="max-w-..."` and bump the inner padding with `contentClassName` so the text isn't crammed against the rounded corners.

![Rich content](https://cladd.io/screenshots/components/tooltip/rich-content.png)

```tsx
<Tooltip
  className="max-w-64"
  contentClassName="flex flex-col gap-1 px-4 py-2"
  tooltip={
    <>
      <span className="flex items-center justify-between gap-2 font-semibold">
        <span>Publish</span>
        <Shortcut variant="gradient-fill">cmd shift P</Shortcut>
      </span>
      <span className="text-cladd-fg-soft">
        Promote the current draft to production. Subscribers get notified
        within a few seconds.
      </span>
    </>
  }
>
  <Button color="brand" variant="gradient">
    Publish
  </Button>
</Tooltip>
```

### Size

There's no `size` prop — the tooltip's base text is fixed at `text-cladd-xs` and the inner padding at `px-2 py-1`. To tweak, override via `className` (text size, max width, anything that lives on the outer surface) and `contentClassName` (padding, alignment, anything inside the surface). The example below shows three densities: a compact `2xs` tooltip for icon strips, the default, and a roomier `sm` tooltip for descriptive copy.

![Size](https://cladd.io/screenshots/components/tooltip/size.png)

```tsx
<Tooltip
  tooltip="Compact tooltip"
  className="text-cladd-2xs"
  contentClassName="px-1 py-1"
>
  <Button size="xs">small</Button>
</Tooltip>
<Tooltip tooltip="Default tooltip">
  <Button>default</Button>
</Tooltip>
<Tooltip
  tooltip="Larger tooltip with more room to breathe"
  className="max-w-64 text-cladd-sm"
  contentClassName="px-4 py-2"
>
  <Button size="lg">large</Button>
</Tooltip>
```

### Controlled

Leave `tooltip` undefined and `Tooltip` switches into primitive mode (the same surface is also exported as `TooltipPrimitive`). `children` becomes the tooltip content, `anchorRef` points at the element to anchor against, and you drive `open`/`onOpenChange` from your own state. Use this when the trigger isn't a sibling — a canvas node, a far-away portal, a programmatic onboarding step — or when something other than the pointer should drive visibility.

```tsx
const anchorRef = useRef<HTMLElement>(null);
const [open, setOpen] = useState(false);

<Button ref={anchorRef}>Anchor</Button>
<Tooltip open={open} onOpenChange={setOpen} anchorRef={anchorRef}>
  Tooltip content here
</Tooltip>
```

![Controlled](https://cladd.io/screenshots/components/tooltip/controlled.png)

```tsx
<Button ref={anchorRef}>External trigger</Button>
<Button onClick={() => setOpen((o) => !o)} variant="gradient">
  {open ? 'Hide' : 'Show'} tooltip
</Button>
<Tooltip
  open={open}
  onOpenChange={setOpen}
  anchorRef={anchorRef}
  color="brand"
>
  Controlled tooltip — toggled by an unrelated button
</Tooltip>
```

## API Reference

<PropsTable
  component="Tooltip"
  rows={mergedPropsRows}
  extendsList={primitiveExtendsList}
/>
