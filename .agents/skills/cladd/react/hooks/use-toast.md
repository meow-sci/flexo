---
title: "useToast"
description: "Imperative toasts fired from event handlers and callbacks."
links:
  doc: https://cladd.io/react/hooks/use-toast/
  api: https://cladd.io/react/hooks/use-toast/#api-reference
---

# useToast

`useToast()` is the imperative half of the [`Toast`](/react/components/toast/) API. Call it once to get a function, then fire a toast from anywhere — event handlers, effects, network callbacks — without writing any toast JSX or tracking open state. Each call pushes a fresh toast onto the app-wide queue mounted by [`CladdProvider`](/react/components/cladd-provider/); multiple toasts stack at the bottom-right corner and auto-dismiss independently.

This is what you reach for for app-wide notifications that aren't tied to a specific button — "Saved", "Copied to clipboard", "Sync failed", "Build finished". For toasts wired to a specific trigger in JSX, or for fully-controlled open state, see the [`Toast`](/react/components/toast/) page.

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

## Usage

```tsx
import { Button, useToast } from '@cladd-ui/react';

function CopyButton({ url }) {
  const toast = useToast();
  return (
    <Button
      onClick={() => {
        navigator.clipboard.writeText(url);
        toast({
          title: 'Copied',
          text: 'Share link is in your clipboard.',
        });
      }}
    >
      Copy link
    </Button>
  );
}
```

The shape of the options object mirrors [`Toast`](/react/components/toast/)'s props — `title`, `text`, `color`, `icon`, `iconProps`, `closeButton`, `timeout`, `onClosed`. Pass `timeout: 0` to disable auto-close (rare — usually a [`Dialog`](/react/components/dialog/) is the right call if the user must respond).

## Signature

```ts
function useToast(): (options: UseToastOptions) => void;
```

The returned function is stable across renders. Each call enqueues a fresh toast — there's no return value, no handle to dismiss programmatically; use `onClosed` for cleanup that needs to run after the toast leaves.

## API Reference

### Options

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

## Notes

- **Needs `CladdProvider`.** The hook pushes onto the toast portal mounted by the provider — calling it outside the provider is a no-op.
- **Toasts stack, dialogs replace.** Multiple `toast()` calls queue up and animate in independently; this is the opposite of [`useDialog`](/react/hooks/use-dialog/), which renders one dialog at a time. Plan accordingly — a chatty server can flood the corner if you toast every event.
- **For the JSX form, see [`Toast`](/react/components/toast/).** Compound API, controlled mode, custom action buttons, rich content, all the variant/color knobs — everything that takes more than `title` + `text` lives there.
