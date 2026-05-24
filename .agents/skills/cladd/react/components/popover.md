---
title: "Popover"
description: "Floating panel anchored to a trigger for menus and inline editors."
links:
  doc: https://cladd.io/react/components/popover/
  api: https://cladd.io/react/components/popover/#api-reference
---

# Popover

`Popover` is the anchored floating surface — the one you reach for when the user has a **secondary** decision to make next to the thing that triggered it. Sort pickers, action menus, account dropdowns, properties inspectors, hover cards, inline editors: anywhere a button or row should reveal extra controls without taking the user away from the page. Unlike [`Dialog`](/react/components/dialog/), which centers on the viewport and blocks the page until the user responds, a popover anchors to its trigger via CSS anchor positioning, auto-flips when it would overflow, and dismisses on outside-click without inert-ing the rest of the page.

There are two ways to drive it. The **compound API** — `PopoverRoot` + `PopoverTrigger` + `Popover` (+ optional `PopoverClose`) — wires a popover to a specific trigger element in JSX. **Controlled mode** drives `Popover` directly via `open` / `onOpenChange` — reach for it when the open state is owned by your app, or when the trigger lives outside the React subtree (a canvas hit, a context-menu pointer position via `anchorRect`, a programmatic walkthrough).

The popover composes naturally with [`List`](/react/components/list/) and its row primitives — `ListButton`, `ListTitle`, `ListSeparator`, `ListItem` — which is how you build the dense option menus and action sheets that dominate real app UIs.

![Overview](https://cladd.io/screenshots/components/popover/overview.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button>Sort by</Button>
  </PopoverTrigger>
  <Popover className="w-56" offset={8}>
    <List>
      <ListTitle>Sort by</ListTitle>
      {OPTIONS.map((o) => (
        <ListButton
          key={o.id}
          size="md"
          selected={sort === o.id}
          onClick={() => setSort(o.id)}
          after={sort === o.id ? <CheckIcon /> : undefined}
        >
          {o.label}
        </ListButton>
      ))}
      <ListSeparator />
      <ListButton size="md" icon={<PlusIcon />}>
        Add custom sort
      </ListButton>
    </List>
  </Popover>
</PopoverRoot>
```

## Usage

### Compound API

```tsx
import {
  Button,
  List,
  ListButton,
  ListTitle,
  Popover,
  PopoverRoot,
  PopoverTrigger,
} from '@cladd-ui/react';

<PopoverRoot>
  <PopoverTrigger>
    <Button>Sort by</Button>
  </PopoverTrigger>
  <Popover className="w-56" offset={8}>
    <List>
      <ListTitle>Sort by</ListTitle>
      <ListButton size="md">Last updated</ListButton>
      <ListButton size="md">Date created</ListButton>
      <ListButton size="md">Name</ListButton>
    </List>
  </Popover>
</PopoverRoot>;
```

`PopoverRoot` owns the open state (uncontrolled by default) and the anchor ref. `PopoverTrigger` **clones** its single child to register the element as the anchor and attach an `onClick` that toggles the root — point it at any [`Button`](/react/components/button/), [`Chip`](/react/components/chip/), or other clickable element. `Popover` reads the root's open state and anchor ref automatically, then renders a portalled [`Surface`](/react/components/surface/) anchored against the trigger via CSS anchor positioning.

### Controlled

```tsx
import { Button, Popover } from '@cladd-ui/react';

const [open, setOpen] = useState(false);
const anchorRef = useRef<HTMLButtonElement>(null);

<Button ref={anchorRef} onClick={() => setOpen((o) => !o)}>
  Open
</Button>
<Popover open={open} onOpenChange={setOpen} anchorRef={anchorRef}>
  ...
</Popover>;
```

Drop `PopoverRoot`/`PopoverTrigger` and drive `Popover` directly through `open` / `onOpenChange`. You also pass `anchorRef` yourself when there's no surrounding root. Use this when the popover represents state your app already owns (a hover-card opened from a keyboard event, an inline editor toggled from a save-conflict response), or when the trigger lives outside the React subtree — pass an `anchorRect` instead of `anchorRef` to anchor against a static pointer position (e.g. a right-click context menu).

## Examples

### Compound

The canonical shape — `PopoverRoot` wraps the trigger and the popover as siblings. The root owns the open state and the anchor ref, so trigger and popover stay in sync through context without prop-drilling. `PopoverClose` (used in this example) wraps any child you want to dismiss on click, the same way `PopoverTrigger` works for opening.

![Compound](https://cladd.io/screenshots/components/popover/compound.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button>Open popover</Button>
  </PopoverTrigger>
  <Popover className="w-64" offset={8}>
    <div className="flex flex-col gap-2 p-4">
      <SectionTitle>Compound API</SectionTitle>
      <p className="text-sm">
        Trigger, popover, and close all live inside PopoverRoot. The root
        owns the open state and the anchor ref.
      </p>
      <PopoverClose>
        <Button size="sm" className="self-end">
          Got it
        </Button>
      </PopoverClose>
    </div>
  </Popover>
</PopoverRoot>
```

### Controlled

Pass `open` and `onOpenChange` directly to `Popover` to drive it from external state. The surrounding `PopoverRoot` is bypassed when `open` is provided, so you can drop it entirely — but you'll need to supply an `anchorRef` yourself for the popover to find its anchor. Use this when the popover tracks state your app already owns rather than a click on a specific button.

![Controlled](https://cladd.io/screenshots/components/popover/controlled.png)

```tsx
<div className="flex items-center gap-2">
  <Button ref={anchorRef} onClick={() => setOpen((o) => !o)}>
    {open ? 'Close' : 'Open'} from external state
  </Button>
  <Chip color={open ? 'green' : 'neutral'}>
    {open ? 'open' : 'closed'}
  </Chip>
</div>
<Popover
  open={open}
  onOpenChange={setOpen}
  anchorRef={anchorRef}
  className="w-56"
  offset={8}
>
  <div className="flex flex-col gap-2 p-4">
    <SectionTitle>Controlled</SectionTitle>
    <p className="text-sm">
      open, onOpenChange, and anchorRef come from the surrounding
      component — no PopoverRoot needed.
    </p>
    <Button size="sm" className="self-end" onClick={() => setOpen(false)}>
      Close
    </Button>
  </div>
</Popover>
```

### Context menu

A right-click handler is the canonical use case for `anchorRect`. On `contextmenu`, prevent the browser's native menu, snapshot the pointer position as a zero-size `DOMRect` (`new DOMRect(e.clientX, e.clientY, 0, 0)`), and pass it to `Popover` — the position-area system anchors against the rect the same way it would against a real DOM element. `position="bottom-start"` plus the built-in `flip-block, flip-inline` fallbacks reproduce native context-menu behavior, flipping at viewport edges so the menu always stays in bounds. Drop in a [`List`](/react/components/list/) of [`ListButton`s](/react/components/list/) and you're done.

```tsx
<SurfaceCut
  onContextMenu={(e) => {
    e.preventDefault();
    setRect(new DOMRect(e.clientX, e.clientY, 0, 0));
    setOpen(true);
  }}
  className="w-full rounded-2xl"
  contentClassName="flex min-h-64 items-center justify-center select-none text-sm text-cladd-fg-softer"
>
  Right-click anywhere in this area
</SurfaceCut>
<Popover
  open={open}
  onOpenChange={setOpen}
  anchorRect={rect ?? undefined}
  position="bottom-start"
  className="fixed! w-56"
>
  <List>
    <ListButton
      icon={<CopyIcon />}
      after={<Shortcut size="sm">cmd c</Shortcut>}
    >
      Copy
    </ListButton>
    <ListButton
      icon={<PlusIcon />}
      after={<Shortcut size="sm">cmd d</Shortcut>}
    >
      Duplicate
    </ListButton>
    <ListButton icon={<EnvelopeIcon />}>Send to…</ListButton>
    <ListSeparator />
    <ListButton icon={<ArchiveIcon />}>Archive</ListButton>
    <ListButton color="red">Delete</ListButton>
  </List>
</Popover>
```

### With list

[`List`](/react/components/list/) and its row primitives drop straight into a popover — this is the workhorse pattern for action menus, sort pickers, navigation dropdowns, and command palettes. Use [`ListTitle`](/react/components/list/) for section eyebrows, [`ListSeparator`](/react/components/list/) to group rows, and the `after` slot on `ListButton` for a right-aligned [`Shortcut`](/react/components/shortcut/) hint or [`Chip`](/react/components/chip/). Drop `ListButton`'s `size` to `md` (or `sm`) — the default `lg` is tuned for sidebars, not popover menus.

![With list](https://cladd.io/screenshots/components/popover/with-list.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button>Project actions</Button>
  </PopoverTrigger>
  <Popover className="w-64" offset={8}>
    <List>
      <ListTitle>Workspace</ListTitle>
      <ListButton
        size="md"
        icon={<EnvelopeIcon />}
        after={<Shortcut size="2xs">cmd 1</Shortcut>}
      >
        Inbox
      </ListButton>
      <ListButton
        size="md"
        icon={<NoteIcon />}
        after={<Shortcut size="2xs">cmd 2</Shortcut>}
      >
        Drafts
      </ListButton>
      <ListButton
        size="md"
        icon={<ArchiveIcon />}
        after={<Shortcut size="2xs">cmd 3</Shortcut>}
      >
        Archive
      </ListButton>
      <ListSeparator />
      <ListTitle>Actions</ListTitle>
      <ListButton
        size="md"
        icon={<CopyIcon />}
        after={<Shortcut size="2xs">cmd d</Shortcut>}
      >
        Duplicate
      </ListButton>
      <ListButton
        size="md"
        icon={<PlusIcon />}
        after={<Shortcut size="2xs">cmd n</Shortcut>}
      >
        New project
      </ListButton>
      <ListSeparator />
      <ListButton size="md" color="red">
        Delete project
      </ListButton>
    </List>
  </Popover>
</PopoverRoot>
```

### Rich content

Not every popover is a list — `children` is any `ReactNode`, so you can drop in a [`SectionTitle`](/react/components/section-title/), a stack of [`Switch`es](/react/components/switch/), inline [`Input`s](/react/components/input/), or any combination. Workspace settings, quick filters, mini account panels — all live happily inside a popover.

![Rich content](https://cladd.io/screenshots/components/popover/rich-content.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button>Workspace settings</Button>
  </PopoverTrigger>
  <Popover className="w-72 text-sm" offset={8}>
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <SectionTitle>Workspace</SectionTitle>
        <div className="flex items-center justify-between">
          <span className="font-medium">acme-marketing</span>
          <Chip color="brand">Pro</Chip>
        </div>
        <span className="text-cladd-fg-soft">
          8 members · 42 projects
        </span>
      </div>
      <SurfaceCut className="rounded-full" contentClassName="h-px" />
      <div className="flex flex-col gap-2">
        <SectionTitle>Notifications</SectionTitle>
        <label className="flex items-center justify-between gap-4">
          <span>Email updates</span>
          <Switch as="div" checked={notify} onChange={setNotify} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>Mentions</span>
          <Switch as="div" checked={mentions} onChange={setMentions} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>Weekly digest</span>
          <Switch as="div" checked={digest} onChange={setDigest} />
        </label>
      </div>
    </div>
  </Popover>
</PopoverRoot>
```

### Custom width

The default `Popover` surface is `w-40`. Override it with a Tailwind width on `className` (`w-56`, `w-64`, `w-72`, `w-96`, or any arbitrary value). The popover caps at `max-w-[calc(100vw-16px)]` so it never overflows the viewport, and the inner content area scrolls vertically past `max-h-[70vh]` — adjust either via `contentClassName` when you need to.

![Size](https://cladd.io/screenshots/components/popover/size.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button>Open popover</Button>
  </PopoverTrigger>
  <Popover className={width} offset={8} closeOnBackdropClick={false}>
    <List>
      <ListTitle>Custom width</ListTitle>
      <ListItem>
        <span className="text-cladd-fg-soft">Width</span>
        <span className="ml-auto font-mono">{width}</span>
      </ListItem>
      <ListSeparator />
      <ListButton size="md" icon={<NoteIcon />}>
        The popover stretches to the className width
      </ListButton>
      <ListButton size="md" icon={<CheckIcon />}>
        Long rows wrap inside the surface
      </ListButton>
    </List>
  </Popover>
</PopoverRoot>
```

### Position

`position` accepts twelve values — four sides (`top`, `bottom`, `left`, `right`) and three alignments per side (`-start`, center, `-end`), giving you fine-grained control over both which edge of the anchor the popover sits on and which corner of the anchor it lines up with. The bare-side values (`top`, `bottom`, `left`, `right`) center along the anchor's perpendicular axis. Default is `'bottom'`. Position is a _preference_: a `positionTryFallbacks` of `flip-block, flip-inline, flip-block flip-inline` means the popover automatically flips to the opposite side when it would overflow the viewport.

![Position](https://cladd.io/screenshots/components/popover/position.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button>Anchor</Button>
  </PopoverTrigger>
  <Popover
    className="w-48"
    offset={8}
    position={position}
    closeOnBackdropClick={false}
  >
    <div className="flex flex-col gap-1 p-3">
      <SectionTitle>Position</SectionTitle>
      <span className="font-mono text-sm">{position}</span>
    </div>
  </Popover>
</PopoverRoot>
```

### Offset

`offset` controls the gap between the anchor and the popover. A single number/string sets the **main-axis** spacing (push away from the anchor); a `[main, cross]` tuple also shifts the popover along the anchor's edge. Numbers are pixels; strings pass through (so `'8px'`, `'1rem'`, or `'50%'` all work — `%` resolves against `anchor-size(width|height)` depending on the position).

![Offset](https://cladd.io/screenshots/components/popover/offset.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button>Anchor</Button>
  </PopoverTrigger>
  <Popover className="w-48" offset={offset} closeOnBackdropClick={false}>
    <div className="flex flex-col gap-1 p-3">
      <SectionTitle>Offset</SectionTitle>
      <span className="font-mono text-sm">{offset}px</span>
    </div>
  </Popover>
</PopoverRoot>
```

### Backdrop

`backdrop` adds a dimming layer behind the popover that captures clicks for dismiss. Use it for popovers that _demand_ attention before the user does anything else — a quick-action confirm, a "name your file" prompt — where you want to lock the rest of the page out without the full [`Dialog`](/react/components/dialog/) treatment. `backdropTransparent` keeps the click-capturing layer but drops the visual dim — handy when you want easy outside-click dismiss without darkening the page.

![Backdrop](https://cladd.io/screenshots/components/popover/backdrop.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button>Open with backdrop</Button>
  </PopoverTrigger>
  <Popover
    className="w-64"
    offset={8}
    backdrop={backdrop}
    backdropTransparent={transparent}
  >
    <div className="flex flex-col gap-2 p-4">
      <SectionTitle>Backdrop</SectionTitle>
      <p className="text-sm">
        Click anywhere outside the popover to close it. The backdrop dims
        the page below — turn on transparent to keep the dismiss surface
        without the visual dim.
      </p>
    </div>
  </Popover>
</PopoverRoot>
```

### Color

`color` sets the `cladd-color-{name}` token on the popover surface. It tints the gradient fill, the outline ring, and propagates to any color-aware children (Chips, ListButtons, Buttons set to `color={undefined}` inheriting from context). Keep it neutral for most menus; bring color in when the popover represents a decision tied to a specific accent (an error-tinted "what went wrong" popover, a brand-colored upsell).

![Color](https://cladd.io/screenshots/components/popover/color.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button color={color}>Open {color} popover</Button>
  </PopoverTrigger>
  <Popover
    className="w-56"
    offset={8}
    color={color}
    closeOnBackdropClick={false}
  >
    <div className="flex flex-col gap-2 p-4">
      <SectionTitle>Accent color</SectionTitle>
      <p className="text-sm">
        color tints the surface, ring, and any cladd-color-aware children
        like Chips.
      </p>
      <div className="flex gap-1">
        <Chip color={color}>{color}</Chip>
        <Chip color={color}>chip</Chip>
      </div>
    </div>
  </Popover>
</PopoverRoot>
```

### Surface variant

`variant` picks the [`Surface`](/react/components/surface/) treatment of the popover shell. `'gradient'` (default in dark theme) gives the slight angled-light look that reads as elevated; `'solid'` is flatter and more utilitarian; the `*-fill` variants flood the surface with the accent — louder, harder to miss, right for popovers that need to read as a single semantic block.

![Variant](https://cladd.io/screenshots/components/popover/variant.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button>Show popover</Button>
  </PopoverTrigger>
  <Popover
    className="w-64"
    offset={8}
    variant={variant}
    closeOnBackdropClick={false}
  >
    <div className="flex flex-col gap-2 p-4">
      <SectionTitle>Surface variant</SectionTitle>
      <p className="text-sm">
        The popover surface uses the "{variant}" variant. Fill variants
        flood the surface with the accent.
      </p>
    </div>
  </Popover>
</PopoverRoot>
```

## API Reference

### Popover

**Inherits from:** [`Surface`](/react/components/surface/)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `anchorRect?` | `DOMRect \| React.RefObject<DOMRect>` | — | Static rect (or ref to one) to anchor against when there's no DOM anchor element (e.g. for a context menu opened at a pointer position). Ignored if `anchorRef.current` exists. |
| `anchorRef?` | `React.RefObject<HTMLElement \| null>` | — | Ref to the element the popover should anchor against. Defaults to the anchor registered by `PopoverRoot` + `PopoverTrigger`.<br>CSS anchor positioning is used - an `anchor-name` is auto-applied to the element if it doesn't already have one. |
| `backdrop?` | `boolean` | `false` | Render a backdrop behind the popover. Default `false`. |
| `backdropTransparent?` | `boolean` | — | Make the backdrop transparent (still captures clicks for outside-close). |
| `children?` | `ReactNode` | — | Popover content. |
| `className?` | `string` | — | Extra classes applied to the popover root `Surface`. |
| `closeOnBackdropClick?` | `boolean` | `true` | Default `true`. |
| `closeOnEscape?` | `boolean` | `true` | Default `true`. Suppressed automatically when this popover has a child popover/dialog open. |
| `color?` | `Color` | — | Accent color token (`Color` enum). Sets the popover's `cladd-color-{name}` class - used by border/ring/text helpers. |
| `contentClassName?` | `string` | — | Extra classes applied to the inner scrollable content area. Default includes `max-h-[70vh] overflow-auto`. |
| `lazy?` | `boolean` | — | Set to `true` when the popover is rendered inside a React `lazy()` + `Suspense` boundary so it opens on the next tick (after the lazy chunk has resolved and mounted). |
| `offset?` | `OffsetValue \| [ OffsetValue, OffsetValue ]` | — | Spacing from anchor. Either a single value (main axis only) or `[main, cross]`.<br>Numbers are pixels; strings pass through (e.g. `'8px'`, `'50%'` - `%` resolves against `anchor-size(width\|height)` depending on the position). |
| `onClose?` | `() => void` | — | Fires when the close transition begins (after `open` flips to `false`, before the animation). |
| `onClosed?` | `() => void` | — | Fires after the close transition completes - use for unmount/cleanup work tied to dismissal. |
| `onOpen?` | `() => void` | — | Fires when the open transition begins (after `open` flips to `true`, before the animation). |
| `onOpenChange?` | `(open: boolean) => void` | — | Fires whenever the open state should change. When omitted, falls back to the `PopoverRoot` setter. |
| `onOpened?` | `() => void` | — | Fires after the open transition completes (`transitionend` on the surface). |
| `open?` | `boolean` | — | Controlled open state. When omitted, falls back to the surrounding `PopoverRoot` state, then `false`. |
| `outline?` | `boolean` | `true` | Outline ring on the popover surface. Default `true` for non-light themes. |
| `position?` | `PopoverPosition` | `'bottom'` | Anchor side + alignment. See `PopoverPosition`. Default `'bottom'`. |
| `root?` | `string \| boolean` | `'#app, #__next, #root'` | Portal target. CSS selector string (default `'#app, #__next, #root'` - first match wins), or `false` to render inline without portalling. |
| `surfaceLevel?` | `number \| string` | — | Forwarded to the underlying `Surface` as `level`. Default depends on theme: `1` for light theme, `undefined` (parent + 1) for dark theme. |
| `variant?` | `SurfaceVariant` | — | Surface variant. Default depends on theme: `'gradient'` for dark, `'solid'` for light. |
| `viewportMargin?` | `number` | `4` | Minimum gap (px) the popover should keep from the viewport edge when it would otherwise be clamped there. Default `4`. Set to `0` to disable. |

### PopoverRoot

State container for the surrounding compound — owns the open state and the anchor ref, and provides both to `PopoverTrigger`, `Popover`, and `PopoverClose` through context.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Trigger + popover (+ optional close) elements. |
| `defaultOpen?` | `boolean` | `false` | Initial open state (uncontrolled). Default `false`. Ignored when `open` is provided. |
| `onOpenChange?` | `(open: boolean) => void` | — | Fires whenever the open state should change (clicks on trigger, outside-clicks, escape). |
| `open?` | `boolean` | — | Controlled open state. When provided, internal state is bypassed. |

### PopoverTrigger

**Clones** its single child to attach (1) a `ref` callback that registers the element as the popover's anchor, and (2) an `onClick` handler that toggles the surrounding `PopoverRoot`'s open state. Both are composed with any existing `ref` / `onClick` on the child, not replaced. No-ops (renders the child as-is) when used outside a `PopoverRoot`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Single React element to use as the trigger. Must accept `ref` and `onClick`. |

### PopoverClose

**Clones** its single child to attach an `onClick` that flips the surrounding `PopoverRoot`'s open state to `false` — the popover equivalent of [`DialogClose`](/react/components/dialog/). Wrap any inner button or row that should dismiss the popover on click.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Single React element to use as the close affordance. Must accept `onClick`. |
