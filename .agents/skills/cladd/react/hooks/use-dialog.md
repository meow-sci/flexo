---
title: "useDialog"
description: "Imperative confirms and alerts fired from event handlers and callbacks."
links:
  doc: https://cladd.io/react/hooks/use-dialog/
  api: https://cladd.io/react/hooks/use-dialog/#api-reference
---

# useDialog

`useDialog()` is the imperative half of the [`Dialog`](/react/components/dialog/) API. Call it once in your component to get `{ confirm, alert }`, then fire either helper from any event handler, effect, or callback — no `DialogRoot`, no `Dialog` JSX, no `open` state to thread through. Both helpers render through the app-wide dialog portal mounted by [`CladdProvider`](/react/components/cladd-provider/).

Reach for it when the trigger isn't an obvious button — a confirm at the tail of a network flow, an alert when an effect detects a stale tab, a destructive guard fired from a context menu — and writing JSX for the dialog just adds noise. For the compound / controlled JSX forms and the full prop reference, see the [`Dialog`](/react/components/dialog/) page.

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

## Usage

```tsx
import { Button, useDialog } from '@cladd-ui/react';

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

`confirm()` builds the standard cancel + confirm row and accepts the same `requireConfirmText` guard as the JSX form for irreversible actions. `alert()` builds a single-button "Ok" dialog for fire-and-forget notices. Both forward the standard [`Dialog`](/react/components/dialog/) props (`title`, `text`, `requireConfirmText`, `confirmButtonColor`, callbacks, …).

## Signature

```ts
function useDialog(options?: UseDialogOptions): {
  confirm: (options: UseDialogConfirmOptions) => void;
  alert: (options: UseDialogAlertOptions) => void;
};
```

The hook itself is a thin wrapper over the portal queue mounted by [`CladdProvider`](/react/components/cladd-provider/) — calling it has no per-render cost, and the returned helpers are stable across renders.

## API Reference

### useDialog options

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `lazy?` | `boolean` | `false` | Set to `true` when the dialog is rendered inside a React `lazy()` + `Suspense` boundary so it opens on the next tick (after the lazy chunk has resolved and mounted). Default `false`. |

### confirm() options

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

### alert() options

Opens a dialog with a single confirm button — the fire-and-forget "Ok" notice.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `confirmButtonText?` | `ReactNode` | `'Ok'` | Confirm button label. Default `'Ok'`. |
| `onClosed?` | `(closed: boolean) => void` | — | Fires after the close transition completes — use for unmount cleanup. |
| `onConfirm?` | `(confirmed: boolean) => void` | — | Fires when the confirm button is pressed. Always called with `true`. |
| `stopPropagationOnClick?` | `boolean` | — | Stop click propagation on backdrop and surface. Useful when the dialog is rendered inside a clickable parent. |
| `text?` | `string \| ReactNode` | — | Dialog body text — auto-wired to `aria-describedby`. |
| `title?` | `string` | — | Dialog title — auto-wired to `aria-labelledby`. |

## Notes

- **Needs `CladdProvider`.** The hook pushes onto the dialog portal mounted by the provider — calling it outside the provider is a no-op.
- **One at a time.** The portal renders a single dialog instance. If you fire two `confirm()`s back-to-back, the second replaces the first; queue them yourself if you really need a chain.
- **For the JSX form, see [`Dialog`](/react/components/dialog/).** Compound API, controlled mode, the `requireConfirmText` guard, the `buttons` slot, custom content — everything that takes more than `title` + `text` lives there.
