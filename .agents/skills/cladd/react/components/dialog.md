---
title: "Dialog"
description: "Modal window for confirms, alerts, and short focused flows."
links:
  doc: https://cladd.io/react/components/dialog/
  api: https://cladd.io/react/components/dialog/#api-reference
---

# Dialog

`Dialog` is the centered, focus-trapping modal — the surface you reach for when the user has to **respond** before going further. Unlike [`Toast`](/react/components/toast/), which fades in from the corner and auto-dismisses, a dialog blocks the page (sets `inert` on the app shell, captures focus, dims the backdrop) until the user makes a decision. Use it for confirms, destructive actions, type-to-confirm guards, and short forms that don't warrant a full [`Popup`](/react/components/popup/).

There are three ways to use it. The **compound API** — `DialogRoot` + `DialogTrigger` + `Dialog` + `DialogClose` — wires a dialog to a specific trigger element in JSX. **Controlled mode** drives `Dialog` directly via `open` / `onOpenChange` — reach for it when the open state is owned by your app. The imperative **`useDialog` hook** exposes `confirm()` and `alert()` helpers for the cases where you just need a quick yes/no prompt without writing any JSX for it.

![Overview](https://cladd.io/screenshots/components/dialog/overview.png)

```tsx
<DialogRoot>
  <DialogTrigger>
    <Button>Publish project</Button>
  </DialogTrigger>
  <Dialog
    title="Publish project?"
    text="The project will go live at acme.studio/launch and become visible to anyone with the link."
    cancelButtonText="Cancel"
    confirmButtonText="Publish"
  />
</DialogRoot>
```

## Usage

### Compound API

```tsx
import { Button, Dialog, DialogRoot, DialogTrigger } from '@cladd-ui/react';

<DialogRoot>
  <DialogTrigger>
    <Button>Publish</Button>
  </DialogTrigger>
  <Dialog
    title="Publish project?"
    text="The project will go live at acme.studio/launch."
    cancelButtonText="Cancel"
    confirmButtonText="Publish"
    onConfirm={() => publish()}
  />
</DialogRoot>;
```

`DialogRoot` owns the open state (uncontrolled by default). `DialogTrigger` **clones** its single child to attach an `onClick` that toggles the root — point it at any [`Button`](/react/components/button/) or other clickable element. `Dialog` reads the root's open state automatically, renders a portalled, focus-trapping `Surface` over a [`Backdrop`](/react/components/backdrop/), and auto-builds the cancel/confirm button row from `cancelButtonText` and `confirmButtonText` props.

### Controlled

```tsx
import { Button, Dialog } from '@cladd-ui/react';

const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>Confirm</Button>
<Dialog
  open={open}
  onOpenChange={setOpen}
  title="Are you sure?"
  text="This action cannot be undone."
  cancelButtonText="Cancel"
  confirmButtonText="Continue"
  onConfirm={() => proceed()}
/>;
```

Drop `DialogRoot`/`DialogTrigger` and drive `Dialog` directly through `open` / `onOpenChange`. Use this when the dialog represents state your app already owns — a guarded route navigation, a save-conflict response, the tail end of a long-running job — rather than a click on a specific button.

### useDialog hook

```tsx
import { useDialog } from '@cladd-ui/react';

function DeleteButton({ name }) {
  const dialog = useDialog();
  return (
    <Button
      color="red"
      onClick={() =>
        dialog.confirm({
          title: `Delete ${name}?`,
          text: 'This cannot be undone.',
          confirmButtonText: 'Delete',
          confirmButtonColor: 'red',
          onConfirm: () => destroy(name),
        })
      }
    >
      Delete
    </Button>
  );
}
```

`useDialog()` returns `{ confirm, alert }` — two helpers that pop a dialog on the app-wide portal mounted by [`CladdProvider`](/react/components/cladd-provider/), without writing any JSX for it. `confirm()` builds the standard cancel + confirm row; `alert()` builds a single-button "Ok" dialog for fire-and-forget notices. Both forward the standard `Dialog` props (`title`, `text`, `requireConfirmText`, `confirmButtonColor`, callbacks, …).

## Examples

### Compound

The canonical shape — `DialogRoot` wraps the trigger and the dialog as siblings. Use this when the trigger element lives near the dialog in your JSX and you don't need to read open state from anywhere else. `DialogClose` (not shown here) wraps any child you want to dismiss on click, the same way `DialogTrigger` works for opening.

![Compound](https://cladd.io/screenshots/components/dialog/compound.png)

```tsx
<DialogRoot>
  <DialogTrigger>
    <Button>Open dialog</Button>
  </DialogTrigger>
  <Dialog
    title="Compound API"
    text="Trigger, dialog, and close all sit inside DialogRoot. The root owns the open state and wires the parts together through context."
    confirmButtonText="Got it"
  />
</DialogRoot>
```

### Controlled

Pass `open` and `onOpenChange` directly to `Dialog` to drive it from external state. The surrounding `DialogRoot` is bypassed when `open` is provided, so you can drop it entirely. The confirm callback should usually close the dialog itself (`setOpen(false)`) or trigger whatever side effect resolves the state.

![Controlled](https://cladd.io/screenshots/components/dialog/controlled.png)

```tsx
<Button onClick={() => setOpen(true)}>Open from external state</Button>
<Dialog
  open={open}
  onOpenChange={setOpen}
  title="Controlled"
  text="open and onOpenChange come from the surrounding component — no DialogRoot needed."
  confirmButtonText="Close"
  onConfirm={() => setOpen(false)}
/>
```

### Destructive (type-to-confirm)

`requireConfirmText` adds a "type the exact name to confirm" guard — the confirm button stays disabled until the user types the value verbatim. Use it for **irreversible** destructive actions (delete a workspace, drop a database, wipe a draft) where an accidental click would cost real work. Pair with `confirmButtonColor="red"` so the action reads as dangerous before the user gets there.

![Destructive](https://cladd.io/screenshots/components/dialog/destructive.png)

```tsx
<DialogRoot>
  <DialogTrigger>
    <Button color="red" variant="gradient">
      Delete workspace
    </Button>
  </DialogTrigger>
  <Dialog
    title="Delete acme-marketing?"
    text="This permanently removes the workspace, all of its projects, and 42 file versions. This action cannot be undone."
    requireConfirmText="acme-marketing"
    cancelButtonText="Cancel"
    confirmButtonText="Delete workspace"
    confirmButtonColor="red"
  />
</DialogRoot>
```

### Custom content

Anything you pass as `children` renders **between `text` and the auto-generated button row** — the slot for short forms, inline previews, or extra context that doesn't fit in `text`. Inputs, switches, and small lists all work; for anything more complex than a couple of fields, reach for a [`Popup`](/react/components/popup/) instead.

![Custom content](https://cladd.io/screenshots/components/dialog/custom-content.png)

```tsx
<DialogRoot>
  <DialogTrigger>
    <Button>Rename project</Button>
  </DialogTrigger>
  <Dialog
    title="Rename project"
    text="Pick a new name. This will update the URL slug."
    cancelButtonText="Cancel"
    confirmButtonText="Rename"
  >
    <Input
      value={name}
      onChange={setName}
      placeholder="Project name"
      size="lg"
    />
  </Dialog>
</DialogRoot>
```

### Custom button row

The `buttons` slot replaces the auto-generated cancel/confirm row entirely — drop `cancelButtonText`/`confirmButtonText` and render whatever buttons you want. Wrap each in [`DialogClose`](#dialogclose) so they dismiss the dialog on click. The "save / discard / keep editing" three-way choice is the canonical case.

![Custom buttons](https://cladd.io/screenshots/components/dialog/custom-buttons.png)

```tsx
<DialogRoot>
  <DialogTrigger>
    <Button>Unsaved changes</Button>
  </DialogTrigger>
  <Dialog
    title="You have unsaved changes"
    text="Pick how to handle the edits you've made since the last save."
    buttons={
      <>
        <DialogClose>
          <Button rounded size="lg" variant="transparent">
            Keep editing
          </Button>
        </DialogClose>
        <DialogClose>
          <Button rounded size="lg" color="red" variant="transparent">
            Discard
          </Button>
        </DialogClose>
        <DialogClose>
          <Button rounded size="lg" color="brand" variant="gradient">
            Save & exit
          </Button>
        </DialogClose>
      </>
    }
  />
</DialogRoot>
```

### Confirm button color

`confirmButtonColor` sets the accent on the confirm button — useful when the action carries its own semantic. `'red'` for destructive, `'green'` for affirmative, your theme accent (the default) for neutral confirms. `cancelButtonColor` works the same way for the cancel button (defaults to `'neutral'`).

![Color](https://cladd.io/screenshots/components/dialog/color.png)

```tsx
<DialogRoot>
  <DialogTrigger>
    <Button color={color}>Open {color} dialog</Button>
  </DialogTrigger>
  <Dialog
    title="Confirm button color"
    text={`Confirm and cancel buttons accept their own color tokens. Confirm color is "${color}".`}
    cancelButtonText="Cancel"
    confirmButtonText="Confirm"
    confirmButtonColor={color}
  />
</DialogRoot>
```

### Surface variant

`variant` picks the [`Surface`](/react/components/surface/) treatment of the dialog shell. `'gradient'` (default in dark theme) gives the slight angled-light look that reads as elevated; `'solid'` is flatter; the `*-fill` variants flood the surface with the accent — louder, harder to ignore, right for "you really need to read this" prompts. Pair with `surfaceLevel` and `outline` to dial the elevation in.

![Variant](https://cladd.io/screenshots/components/dialog/variant.png)

```tsx
<DialogRoot>
  <DialogTrigger>
    <Button>Show dialog</Button>
  </DialogTrigger>
  <Dialog
    variant={variant}
    title="Surface variant"
    text={`The dialog surface uses the "${variant}" variant.`}
    confirmButtonText="Got it"
  />
</DialogRoot>
```

### useDialog

`useDialog` is the easiest way to fire a confirm or alert from anywhere — event handlers, effects, callbacks — without writing JSX. It depends on the app-wide portal mounted by [`CladdProvider`](/react/components/cladd-provider/). `alert()` renders a single-button "Ok" dialog; `confirm()` renders the standard cancel + confirm pair and accepts the same `requireConfirmText` guard as the JSX form.

![Use dialog](https://cladd.io/screenshots/components/dialog/use-dialog.png)

```tsx
<div className="flex flex-wrap gap-2">
  <Button
    onClick={() =>
      dialog.alert({
        title: 'Build finished',
        text: 'api/v2 deployed in 1.4s. Logs are in the deploy panel.',
      })
    }
  >
    Show alert
  </Button>
  <Button
    color="brand"
    variant="gradient"
    onClick={() =>
      dialog.confirm({
        title: 'Send invite?',
        text: 'jamie@acme.studio will get an email with a join link.',
        confirmButtonText: 'Send invite',
      })
    }
  >
    Confirm action
  </Button>
  <Button
    color="red"
    variant="gradient"
    onClick={() =>
      dialog.confirm({
        title: 'Reset all settings?',
        text: 'This restores defaults across every panel. Your saved presets are kept.',
        confirmButtonText: 'Reset',
        confirmButtonColor: 'red',
        requireConfirmText: 'reset',
      })
    }
  >
    Destructive confirm
  </Button>
</div>
```

## API Reference

### Dialog

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `aria-describedby?` | `string` | — | Override the auto-wired description id. By default this is the `text` element's id. |
| `aria-label?` | `string` | — | ARIA label fallback when no `aria-labelledby`/`title` is set. |
| `aria-labelledby?` | `string` | — | Override the auto-wired label id. By default this is the `title` element's id. |
| `buttons?` | `ReactNode` | — | Custom button row. Rendered after the auto-generated cancel/confirm buttons (if any). |
| `cancelButtonColor?` | `Color` | `'neutral'` | Color for the cancel button. Default `'neutral'`. |
| `cancelButtonText?` | `ReactNode` | — | Label for the cancel button. When omitted, the cancel button is not rendered. |
| `children?` | `ReactNode` | — | Custom content rendered between `text` and the optional confirm-input/buttons row. |
| `className?` | `string` | — | Extra classes applied to the dialog root `Surface`. |
| `closeOnBackdropClick?` | `boolean` | `true` | Default `true`. |
| `closeOnEscape?` | `boolean` | `true` | Default `true`. Suppressed automatically when this dialog has a child popover/dialog open. |
| `confirmButtonColor?` | `Color` | — | Color for the confirm button. Default: theme accent color. |
| `confirmButtonText?` | `ReactNode` | — | Label for the confirm button. When omitted, the confirm button is not rendered. |
| `contentClassName?` | `string` | — | Extra classes applied to the inner content area. Default includes `flex flex-col gap-4 p-4`. |
| `inertContainer?` | `string` | `'.app-container'` | Selector for the container made `inert` while the dialog is open. Default `'.app-container'`.<br>Used to block focus/interaction with the rest of the app while the modal is shown. |
| `lazy?` | `boolean` | — | Set to `true` when the dialog is rendered inside a React `lazy()` + `Suspense` boundary so it opens on the next tick (after the lazy chunk has resolved and mounted). |
| `onCancel?` | `() => void` | — | Fires after the cancel button is pressed (the dialog also closes). |
| `onClosed?` | `() => void` | — | Fires after the close transition completes - use for unmount or post-dismiss cleanup. |
| `onConfirm?` | `() => void` | — | Fires after the confirm button is pressed and the `requireConfirmText` guard (if any) is satisfied. |
| `onOpenChange?` | `(open: boolean) => void` | — | Fires whenever the open state should change. When omitted, falls back to the `DialogRoot` setter. |
| `open?` | `boolean` | — | Controlled open state. When omitted, falls back to the surrounding `DialogRoot` state, then `false`. |
| `outline?` | `boolean` | `true` | Outline ring on the dialog surface. Default `true` for dark, `false` for light. |
| `requireConfirmText?` | `string` | — | "Type to confirm" guard. When set, renders an `Input` and disables the confirm button until the user types this exact string - used for destructive actions (e.g. type the project name to delete). |
| `root?` | `string` | `'#app, #__next, #root'` | Portal target selector. Default `'#app, #__next, #root'` (first match wins). |
| `stopPropagationOnClick?` | `boolean` | — | Stop click propagation on backdrop and surface. Useful when the dialog is rendered inside a clickable parent. |
| `surfaceLevel?` | `string \| number` | `1` | Forwarded to the underlying `Surface` as `level`. Default `1`. |
| `text?` | `ReactNode` | — | Body text slot. Rendered as `<div>` with `text-cladd-sm leading-relaxed`. Auto-wired to `aria-describedby`. |
| `title?` | `ReactNode` | — | Title slot. Rendered as `<div>` with `text-cladd-md font-semibold`. Auto-wired to `aria-labelledby`. |
| `variant?` | `SurfaceVariant` | — | Surface variant. Default depends on theme: `'solid'` for light, `'gradient'` for dark. |

### DialogRoot

State container for the surrounding compound — owns the open state and provides it to `DialogTrigger`, `Dialog`, and `DialogClose` through context.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Trigger + dialog (+ optional close) elements. |
| `defaultOpen?` | `boolean` | `false` | Initial open state (uncontrolled). Default `false`. Ignored when `open` is provided. |
| `onOpenChange?` | `(open: boolean) => void` | — | Fires whenever the open state should change (trigger click, outside click, escape, button press). |
| `open?` | `boolean` | — | Controlled open state. When provided, internal state is bypassed. |

### DialogTrigger

**Clones** its single child to attach an `onClick` that toggles the surrounding `DialogRoot`'s open state — composed with any existing `onClick` on the child. No-ops (renders the child as-is) when used outside a `DialogRoot`. Unlike [`PopoverTrigger`](/react/components/popover/), this does **not** register an anchor ref — dialogs are centered on the viewport, not anchored to the trigger.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Single React element to clone as the trigger. Must accept `onClick`. |

### DialogClose

**Clones** its single child to attach an `onClick` that flips the surrounding `DialogRoot`'s open state to `false`. Use it to wrap action buttons inside the `buttons` slot (or in `children`) so they dismiss the dialog on click.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Single React element to clone as the close affordance. Must accept `onClick`. |

### useDialog

`useDialog()` is a thin wrapper over the portal queue mounted by [`CladdProvider`](/react/components/cladd-provider/). Call it once in your component to get `{ confirm, alert }`, then fire either helper from any event handler, effect, or callback.

```ts
function useDialog(options?: UseDialogOptions): {
  confirm: (options: UseDialogConfirmOptions) => void;
  alert: (options: UseDialogAlertOptions) => void;
};
```

#### useDialog options

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `lazy?` | `boolean` | `false` | Set to `true` when the dialog is rendered inside a React `lazy()` + `Suspense` boundary so it opens on the next tick (after the lazy chunk has resolved and mounted). Default `false`. |

#### confirm() options

Opens a dialog with the standard cancel + confirm row. Accepts the same `requireConfirmText` guard as the JSX form for destructive flows.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `cancelButtonColor?` | `Color` | `'neutral'` | Cancel button color. Default `'neutral'`. |
| `cancelButtonText?` | `ReactNode` | `'Cancel'` | Cancel button label. Default `'Cancel'`. |
| `confirmButtonColor?` | `Color` | — | Confirm button color. Default: theme accent color. |
| `confirmButtonText?` | `ReactNode` | `'Confirm'` | Confirm button label. Default `'Confirm'`. |
| `onCancel?` | `(cancelled: boolean) => void` | — | Fires when the cancel button is pressed. Always called with `false`. |
| `onClosed?` | `(closed: boolean) => void` | — | Fires after the close transition completes — use for unmount cleanup. |
| `onConfirm?` | `(confirmed: boolean) => void` | — | Fires when the confirm button is pressed (and the `requireConfirmText` guard passes). Always called with `true`. |
| `requireConfirmText?` | `boolean \| string \| ReactNode` | — | Type-to-confirm guard. When set, renders an `Input` and disables the confirm button until the user types this exact value verbatim — used for irreversible destructive actions. |
| `stopPropagationOnClick?` | `boolean` | — | Stop click propagation on backdrop and surface. Useful when the dialog is rendered inside a clickable parent. |
| `text?` | `string \| ReactNode` | — | Dialog body text — auto-wired to `aria-describedby`. |
| `title?` | `string` | — | Dialog title — auto-wired to `aria-labelledby`. |

#### alert() options

Opens a dialog with a single confirm button — the fire-and-forget "Ok" notice.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `confirmButtonText?` | `ReactNode` | `'Ok'` | Confirm button label. Default `'Ok'`. |
| `onClosed?` | `(closed: boolean) => void` | — | Fires after the close transition completes — use for unmount cleanup. |
| `onConfirm?` | `(confirmed: boolean) => void` | — | Fires when the confirm button is pressed. Always called with `true`. |
| `stopPropagationOnClick?` | `boolean` | — | Stop click propagation on backdrop and surface. Useful when the dialog is rendered inside a clickable parent. |
| `text?` | `string \| ReactNode` | — | Dialog body text — auto-wired to `aria-describedby`. |
| `title?` | `string` | — | Dialog title — auto-wired to `aria-labelledby`. |
