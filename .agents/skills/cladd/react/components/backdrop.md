---
title: "Backdrop"
description: "Dimming layer that sits behind dialogs, popups, and other overlays."
links:
  doc: https://cladd.io/react/components/backdrop/
  api: https://cladd.io/react/components/backdrop/#api-reference
---

# Backdrop

`Backdrop` is the thin primitive that sits behind cladd's modal surfaces — a `fixed inset-0 z-50` `<div>` with the tuned dim tint (`bg-cladd-backdrop/90`) that [`Dialog`](/react/components/dialog/), [`Popup`](/react/components/popup/), and (optionally) [`Popover`](/react/components/popover/) drop in front of the app when they open. There's no logic on it: no portal, no focus trap, no open state — it's a styled rectangle.

You usually won't reach for it directly. Those three overlays already render their own backdrop and wire it up to the right close-on-click and `inert` behavior. Export this when you're building **a one-off overlay of your own** — a custom drawer, a tutorial spotlight, a heavy loading scrim, the dimmed step in an onboarding flow — and you want the dim to match the rest of the app instead of hand-rolling a `bg-black/50` div.

![Overview](https://cladd.io/screenshots/components/backdrop/overview.png)

```tsx
<Button onClick={() => setOpen(true)}>Show overlay</Button>
{open && (
  <>
    <Backdrop onClick={() => setOpen(false)} />
    <Surface
      outline
      className="fixed top-1/2 left-1/2 z-50 w-80 max-w-full -translate-x-1/2 -translate-y-1/2 rounded-cladd-dialog"
      contentClassName="flex flex-col gap-4 p-4"
    >
      <h2 className="text-cladd-lg font-semibold">Custom overlay</h2>
      <p className="text-cladd-fg-soft">
        The card sits as a sibling of the backdrop. Click the dimmed area
        to dismiss, or use the button below.
      </p>
      <Button onClick={() => setOpen(false)} className="self-end">
        Close
      </Button>
    </Surface>
  </>
)}
```

## Usage

```tsx
import { Backdrop } from '@cladd-ui/react';

<Backdrop onClick={close} />;
```

Render it next to your overlay content — siblings, not nested. The backdrop is the click target that dismisses; your card or panel sits on top with its own `fixed` (or `absolute`) positioning at the same or higher `z-50`. This is the shape cladd's own overlays use internally.

`Backdrop` spreads any extra `HTMLDivElement` props (`onClick`, `onPointerDown`, `role`, `aria-*`, refs, …) onto the root, and `className` is merged on top of the defaults — so you can swap the tint, add `backdrop-blur-*`, raise the `z-*`, or drop into `pointer-events-none` for a purely decorative dim.

## Examples

### Custom overlay

The canonical shape: `Backdrop` as one sibling, your content [`Surface`](/react/components/surface/) as another, both inside a fragment that mounts when the overlay is open. The backdrop owns the dismiss click, the surface owns the content. This is what [`Dialog`](/react/components/dialog/) does internally — reach for the bare `Backdrop` when you need that same scrim under something custom (a side drawer, a guided-tour spotlight, a non-modal sheet that still wants the app to step back).

![Overview](https://cladd.io/screenshots/components/backdrop/overview.png)

```tsx
<Button onClick={() => setOpen(true)}>Show overlay</Button>
{open && (
  <>
    <Backdrop onClick={() => setOpen(false)} />
    <Surface
      outline
      className="fixed top-1/2 left-1/2 z-50 w-80 max-w-full -translate-x-1/2 -translate-y-1/2 rounded-cladd-dialog"
      contentClassName="flex flex-col gap-4 p-4"
    >
      <h2 className="text-cladd-lg font-semibold">Custom overlay</h2>
      <p className="text-cladd-fg-soft">
        The card sits as a sibling of the backdrop. Click the dimmed area
        to dismiss, or use the button below.
      </p>
      <Button onClick={() => setOpen(false)} className="self-end">
        Close
      </Button>
    </Surface>
  </>
)}
```

### Loading scrim

`Backdrop` accepts `children`, so it doubles as a centered flex container for a one-off loading state. Drop a [`Spinner`](/react/components/spinner/) and a short status string inside, add `flex items-center justify-center` via `className`, and you've got the "the app is busy, please wait" scrim — same dim as a real modal, no extra setup. Use this for blocking operations where a [`Toast`](/react/components/toast/) is too quiet but a full [`Dialog`](/react/components/dialog/) is too much ceremony.

![Loading scrim](https://cladd.io/screenshots/components/backdrop/loading-scrim.png)

```tsx
<Button onClick={() => setLoading(true)} disabled={loading}>
  Run task
</Button>
{loading && (
  <Backdrop className="flex items-center justify-center gap-4">
    <Spinner size="lg" color="brand" />
    <span className="text-cladd-fg">Working…</span>
  </Backdrop>
)}
```

### Tinted backdrop

Because `className` merges through cladd's `cn`, you can override the default `bg-cladd-backdrop/90` with any background utility — a brand tint for a celebratory step, a `backdrop-blur-*` for a glassier feel, a `pointer-events-none` decorative dim that doesn't capture clicks. The base classes stay (`fixed inset-0 z-50`), so the layer keeps its viewport-covering role; only the paint changes.

![Tinted](https://cladd.io/screenshots/components/backdrop/tinted.png)

```tsx
<Button onClick={() => setOpen(true)}>Show tinted backdrop</Button>
{open && (
  <Backdrop
    onClick={() => setOpen(false)}
    className="bg-cladd-primary/30 backdrop-blur-sm"
  />
)}
```

## API Reference

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | Optional content rendered above the backdrop tint (rarely needed - backdrops are usually empty). |
| `className?` | `string` | — | Extra classes for the backdrop root. |
