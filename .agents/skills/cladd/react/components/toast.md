---
title: "Toast"
description: "Auto-dismissing notification anchored to the corner of the screen."
links:
  doc: https://cladd.io/react/components/toast/
  api: https://cladd.io/react/components/toast/#api-reference
---

# Toast

`Toast` is the corner-anchored notification — the quick "saved", "copied", "build failed" line that appears, holds for a few seconds, then slides away. It renders into the overlay portal at `right-4 bottom-4`, stacks when more than one is open, and auto-dismisses after `timeout` ms (default 5000).

There are three ways to use it. The **compound API** — `ToastRoot` + `ToastTrigger` + `Toast` + `ToastClose` — wires a toast to a specific trigger element in JSX, the way `DialogRoot` does. **Controlled mode** drives `Toast` directly via `open` / `onOpenChange` — reach for it when the toast tracks state your app already owns. The imperative **`useToast` hook** fires a toast from anywhere in your app without writing any JSX for it — preferable for app-wide notifications like "Saved" or "Copied to clipboard" that aren't tied to a trigger button.

![Overview](https://cladd.io/screenshots/components/toast/overview.png)

```tsx
<ToastRoot>
  <ToastTrigger>
    <Button>Notify</Button>
  </ToastTrigger>
  <Toast
    icon={CheckIcon}
    title="Project published"
    text="It’s now live at acme.studio/launch."
  />
</ToastRoot>
```

## Usage

### Compound API

```tsx
import { Button, Toast, ToastRoot, ToastTrigger } from '@cladd-ui/react';

<ToastRoot>
  <ToastTrigger>
    <Button>Notify</Button>
  </ToastTrigger>
  <Toast title="Saved" text="Your changes are synced." />
</ToastRoot>;
```

`ToastRoot` owns the open state (uncontrolled by default). `ToastTrigger` **clones** its single child to attach an `onClick` that toggles the root — point it at any [`Button`](/react/components/button/) or other clickable element. `Toast` reads the root's open state automatically, renders the surface into the overlay portal, and dismisses itself after `timeout`.

### Controlled

```tsx
import { Button, Toast } from '@cladd-ui/react';

const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>Save</Button>
<Toast
  open={open}
  onOpenChange={setOpen}
  title="Saved"
  text="Your changes are synced."
/>;
```

Drop `ToastRoot`/`ToastTrigger` and drive `Toast` directly through `open` / `onOpenChange`. Use this when the toast represents state your app already owns — a network response, a long-running job — rather than a click on a specific button.

### useToast hook

```tsx
import { useToast } from '@cladd-ui/react';

function CopyButton() {
  const toast = useToast();
  return (
    <Button
      onClick={() => {
        navigator.clipboard.writeText(url);
        toast({ title: 'Copied', text: 'Share link is in your clipboard.' });
      }}
    >
      Copy link
    </Button>
  );
}
```

`useToast` returns a function that queues a new toast on the app-wide portal mounted by [`CladdProvider`](/react/components/cladd-provider/). Each call pushes a fresh entry; multiple toasts stack at the corner. The shape mirrors `Toast`'s props (`title`, `text`, `color`, `icon`, `iconProps`, `closeButton`, `onClosed`). Use this for one-off, fire-and-forget notifications.

## Examples

### Compound with custom action

`ToastClose` clones its child to attach an `onClick` that closes the surrounding `ToastRoot`. Use it to put an **"Undo"** or **"View"** action inside a toast — clicking the action dismisses the toast, just like the built-in close button would.

![Compound](https://cladd.io/screenshots/components/toast/compound.png)

```tsx
<ToastRoot>
  <ToastTrigger>
    <Button>Delete file</Button>
  </ToastTrigger>
  <Toast
    color="red"
    title="hero.png moved to trash"
    text="You can still restore it for the next 30 days."
    closeButton={false}
  >
    <ToastClose>
      <Button variant="transparent" outline={false}>
        Undo
      </Button>
    </ToastClose>
  </Toast>
</ToastRoot>
```

### Controlled

Pass `open` and `onOpenChange` directly to `Toast` to drive it from external state — useful when the toast represents a state your app already owns (e.g. "sync failed" tied to a network request, not to a button click). When `open` is provided, the surrounding `ToastRoot` is bypassed; you can drop `ToastRoot`/`ToastTrigger` entirely.

![Controlled](https://cladd.io/screenshots/components/toast/controlled.png)

```tsx
<Button onClick={() => setOpen(true)}>
  {open ? 'Toast is open' : 'Open toast'}
</Button>
<Toast
  open={open}
  onOpenChange={setOpen}
  title="Controlled toast"
  text="External state drives this one — the trigger above flips it."
/>
```

### Colors

`color` sets the accent token (`cladd-color-{name}`) applied to the toast surface — read by the gradient/solid fill, the icon tint, and the outline ring. Use it to signal severity: `green` for success, `red` for errors, `yellow` for warnings, `brand` (default-ish) for neutral product notifications. Defaults to `'neutral'`.

![Color](https://cladd.io/screenshots/components/toast/color.png)

```tsx
<ToastRoot>
  <ToastTrigger>
    <Button color={color}>Show {color} toast</Button>
  </ToastTrigger>
  <Toast color={color} title="New deploy" text={`Color is "${color}".`} />
</ToastRoot>
```

### Variants

`variant` picks the [`Surface`](/react/components/surface/) treatment of the toast shell. `'gradient'` (default) gives the slight angled-light look that reads well against any backdrop; `'solid'` is flatter and more utilitarian; the `*-fill` variants flood the toast with the accent color — louder, harder to miss, right for error or success toasts you really don't want users to scroll past.

![Variant](https://cladd.io/screenshots/components/toast/variant.png)

```tsx
<ToastRoot>
  <ToastTrigger>
    <Button>Show toast</Button>
  </ToastTrigger>
  <Toast
    variant={variant}
    color="brand"
    title="Variant preview"
    text={`Surface variant is "${variant}".`}
  />
</ToastRoot>
```

### With icon

`icon` is an `ElementType` rendered before the text content. Pair it with `color` for the canonical severity treatment — a green check for success, a red cross for failure. The icon component receives `iconProps` if you need to forward className or other props.

![Icon](https://cladd.io/screenshots/components/toast/icon.png)

```tsx
<ToastRoot>
  <ToastTrigger>
    <Button>Save changes</Button>
  </ToastTrigger>
  <Toast
    icon={CheckIcon}
    color="green"
    title="Saved"
    text="All edits synced to the cloud."
  />
</ToastRoot>
```

### Rich content

`title` and `text` are both optional — when you need a layout the default title/text slots can't express (an avatar + name + action buttons, a thumbnail with metadata, an inline progress bar), drop them entirely and render whatever you want into `children`. Children render between the icon and the close button, so you have the full surface to fill. Wrap actions in `ToastClose` to dismiss on click; pair with `closeButton={false}` when your custom actions already carry the dismiss behavior.

![Rich content](https://cladd.io/screenshots/components/toast/rich-content.png)

```tsx
<ToastRoot>
  <ToastTrigger>
    <Button>Invite teammate</Button>
  </ToastTrigger>
  <Toast closeButton={false} timeout={8000}>
    <div className="flex items-center gap-4">
      <div
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-cladd-primary font-semibold text-cladd-bg"
      >
        JS
      </div>
      <div className="flex flex-col">
        <span className="text-cladd-sm font-semibold">
          Jamie sent you an invite
        </span>
        <span className="text-cladd-xs text-cladd-fg-soft">
          Join the “Acme · Marketing” workspace
        </span>
      </div>
    </div>
    <div className="flex gap-1">
      <ToastClose>
        <Button size="sm" variant="transparent" outline={false}>
          Decline
        </Button>
      </ToastClose>
      <ToastClose>
        <Button size="sm" color="brand" variant="gradient">
          Accept
        </Button>
      </ToastClose>
    </div>
  </Toast>
</ToastRoot>
```

### Timeout

`timeout` controls auto-dismiss in milliseconds. Default `5000`. Pass `0` to disable auto-close — only the close button (or a `ToastClose`-wrapped action) will dismiss it. Use `0` sparingly: persistent toasts are easy to forget, and a [`Dialog`](/react/components/dialog/) is usually a better fit when the user must respond.

![Timeout](https://cladd.io/screenshots/components/toast/timeout.png)

```tsx
<ToastRoot>
  <ToastTrigger>
    <Button>{persistent ? 'Open sticky toast' : 'Open 4s toast'}</Button>
  </ToastTrigger>
  <Toast
    timeout={persistent ? 0 : 4000}
    title={persistent ? 'Sticks around' : 'Closes in 4s'}
    text={
      persistent
        ? 'With timeout={0}, only the close button dismisses it.'
        : 'Default is 5000 — this one is shorter.'
    }
  />
</ToastRoot>
```

### useToast

`useToast` is the easiest way to fire a toast from anywhere — event handlers, effects, network callbacks — without thinking about open state at all. It depends on the app-wide portal mounted by [`CladdProvider`](/react/components/cladd-provider/), so make sure that's at the root of your tree. Each call pushes a new toast onto the stack; they auto-dismiss independently.

![Use toast](https://cladd.io/screenshots/components/toast/use-toast.png)

```tsx
<div className="flex flex-wrap gap-2">
  <Button
    onClick={() =>
      toast({
        title: 'Copied',
        text: 'Share link is in your clipboard.',
        color: 'brand',
        icon: CheckIcon,
      })
    }
  >
    Copy link
  </Button>
  <Button
    color="green"
    variant="gradient"
    onClick={() =>
      toast({
        title: 'Deploy succeeded',
        text: 'api/v2 is live in 1.4s.',
        color: 'green',
        icon: CheckIcon,
      })
    }
  >
    Deploy
  </Button>
  <Button
    color="red"
    variant="gradient"
    onClick={() =>
      toast({
        title: 'Build failed',
        text: 'Check the logs for details.',
        color: 'red',
      })
    }
  >
    Break build
  </Button>
</div>
```

## API Reference

### Toast

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | Custom content rendered after the title/text block, before the close button. |
| `className?` | `string` | — | Extra classes applied to the toast root `Surface`. |
| `closeButton?` | `boolean` | `true` | Render the auto close button on the right. Default `true`. |
| `color?` | `Color` | `'neutral'` | Default `'neutral'`. |
| `icon?` | `ElementType<any>` | — | Icon component rendered before the text content. Receives `iconProps`. |
| `iconProps?` | `Record<string, unknown>` | — | Props forwarded to the `icon` component. |
| `onClosed?` | `() => void` | — | Fires after the close transition completes - use for unmount or post-dismiss cleanup. |
| `onOpenChange?` | `(open: boolean) => void` | — | Fires whenever the open state should change (close button, auto-timeout, etc.). |
| `open?` | `boolean` | — | Controlled open state. When omitted, falls back to the surrounding `ToastRoot` state, then `false`. |
| `outline?` | `boolean` | `true` | Outline ring on the toast surface. Default `true`. |
| `root?` | `string` | `'#app, #__next, #root'` | Portal target selector. Default `'#app, #__next, #root'`. |
| `stopPropagationOnClick?` | `boolean` | — | Stop click propagation on the toast surface. Use when the toast renders inside a clickable parent. |
| `surfaceLevel?` | `string \| number` | — | Forwarded to the underlying `Surface` as `level`.<br>Default depends on theme: `3` for dark theme, `1` for light theme - keeps the toast visually elevated above page content. |
| `text?` | `ReactNode` | — | Body text slot. Rendered as a smaller line under `title`. |
| `timeout?` | `number` | `5000` | Auto-close after this many ms. Pass `0` to disable auto-close. Default `5000`. |
| `title?` | `ReactNode` | — | Title slot. Rendered as a bold line above `text`. |
| `variant?` | `SurfaceVariant` | `'gradient'` | Surface variant. Default `'gradient'`. |

### ToastRoot

State container for the surrounding compound — owns the open state and provides it to `ToastTrigger`, `Toast`, and `ToastClose` through context.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Trigger + toast (+ optional close) elements. |
| `defaultOpen?` | `boolean` | `false` | Initial open state (uncontrolled). Default `false`. Ignored when `open` is provided. |
| `onOpenChange?` | `(open: boolean) => void` | — | Fires whenever the open state should change (trigger click, close button, auto-timeout). |
| `open?` | `boolean` | — | Controlled open state. When provided, internal state is bypassed. |

### ToastTrigger

**Clones** its single child to attach an `onClick` that toggles the surrounding `ToastRoot`'s open state — composed with any existing `onClick` on the child. No-ops (renders the child as-is) when used outside a `ToastRoot`.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Single React element to clone as the trigger. Must accept `onClick`. |

### ToastClose

**Clones** its single child to attach an `onClick` that flips the surrounding `ToastRoot`'s open state to `false`. Use it to wrap action buttons (Undo, View, Decline, Accept) so they dismiss the toast on click.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Single React element to clone as the close affordance. Must accept `onClick`. |

### useToast

`useToast()` is a thin wrapper over the portal queue mounted by [`CladdProvider`](/react/components/cladd-provider/). It returns a function that queues a fresh toast on each call — multiple toasts stack at the corner and auto-dismiss independently.

```ts
function useToast(): (options: UseToastOptions) => void;
```

#### Options

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `className?` | `string` | — | Extra classes applied to the toast root `Surface`. |
| `closeButton?` | `boolean` | `true` | Render the auto close button on the right. Default `true`. |
| `color?` | `Color` | `'neutral'` | Accent color token (`Color` enum). Default `'neutral'`. |
| `icon?` | `ElementType<any>` | — | Icon component rendered before the text content. Receives `iconProps`. |
| `iconProps?` | `Record<string, unknown>` | — | Props forwarded to the `icon` component. |
| `onClosed?` | `(closed: boolean) => void` | — | Fires after the close transition completes — use for unmount cleanup. |
| `text?` | `string \| ReactNode` | — | Toast body text — smaller line under `title`. At least one of `title` / `text` is expected. |
| `timeout?` | `number` | `5000` | Auto-close after this many ms. Pass `0` to disable auto-close. Default `5000`. |
| `title?` | `string` | — | Toast title — bold line above `text`. At least one of `title` / `text` is expected. |
