---
title: "CladdProvider"
description: "App-wide provider for the theme, default accent color, and overlay portals."
links:
  doc: https://cladd.io/react/components/cladd-provider/
  api: https://cladd.io/react/components/cladd-provider/#api-reference
---

# CladdProvider

`CladdProvider` is the single wrapper every cladd app mounts at the root. It does a few small things, and they're all things the rest of the kit assumes are in place: it publishes the **theme** (`'dark'` or `'light'`) and the **app-wide accent color** through context, sets the **overlays root selector** that portalled surfaces target, exposes **per-component defaults** that override the kit's built-ins app-wide, and mounts the **dialog and toast portals** that back the imperative [`useDialog`](/react/components/dialog/) and [`useToast`](/react/components/toast/) hooks.

It does not render any visible UI of its own — wrap your app once and forget about it. Everything else in cladd reads from the context it provides: [`Button`](/react/components/button/), [`Switch`](/react/components/switch/), [`Checkbox`](/react/components/checkbox/), [`Radio`](/react/components/radio/), [`Chip`](/react/components/chip/) and other accent-aware controls fall back to `accentColor` when their own `color` prop is left unset; [`Popover`](/react/components/popover/), [`Dialog`](/react/components/dialog/), and [`Tooltip`](/react/components/tooltip/) flip their surface defaults (variant, outline, level) based on `theme`; [`useDialog`](/react/components/dialog/) and [`useToast`](/react/components/toast/) push into the portals it mounts.

## Usage

```tsx
import { CladdProvider } from '@cladd-ui/react';

export default function App({ Component, pageProps }) {
  return (
    <CladdProvider theme="dark" accentColor="brand">
      <Component {...pageProps} />
    </CladdProvider>
  );
}
```

Mount it once, as high in the tree as possible — typically in `pages/_app.tsx` (Next.js pages router), `app/layout.tsx` (Next.js app router), or the root component of a Vite/CRA app. All defaults are sensible (`theme="dark"`, `accentColor="brand"`, the standard overlays root selector), so the bare `<CladdProvider>{children}</CladdProvider>` form is usually all you need.

## Configuration

### theme

`'dark' | 'light'` · Default `'dark'`

Color scheme exposed to the rest of the tree via `useTheme()`. cladd is dark-first: the `'dark'` value is the one the design system is tuned for, and most surfaces look richer there. The `'light'` value flips the per-theme defaults that [`Popover`](/react/components/popover/), [`Dialog`](/react/components/dialog/), and [`Tooltip`](/react/components/tooltip/) read — they pick different `variant`, `outline`, and `surfaceLevel` values per theme so the floating surfaces stay legible against either backdrop.

`CladdProvider` only **publishes** the theme through context — it does not toggle a `class` on `<html>` or set CSS variables. Switching the actual color tokens is your app's job (e.g. add or remove a `data-theme="light"` attribute on the root and define both palettes in your CSS); `theme` then tells cladd's surface components which set of defaults to pick.

### accentColor

`Color` · Default `'brand'`

App-wide accent color, read by `useAccentColor()`. Used as the default `color` for interactive components that don't have their own — [`Button`](/react/components/button/), [`Switch`](/react/components/switch/), [`Checkbox`](/react/components/checkbox/), [`Radio`](/react/components/radio/), [`Chip`](/react/components/chip/), [`Slider`](/react/components/slider/), and friends all fall back to this when their `color` prop is left unset.

Set it once here and your whole app picks up the same accent without having to thread `color="brand"` through every component. Override per-instance whenever you need a semantic color — `<Button color="red">Delete</Button>`, `<Chip color="green">Live</Chip>` — and the rest of the tree keeps its app-wide tint.

The full color set is the eleven cladd accent tokens (`'brand'`, `'red'`, `'orange'`, `'yellow'`, `'green'`, `'cyan'`, `'blue'`, `'purple'`, `'pink'`, `'neutral'`, plus a couple of supporting tokens — see the [`Button`](/react/components/button/) docs for the full palette).

### overlaysRoot

`string` · Default `'#app, #__next, #root'`

CSS selector for the element(s) that portalled overlays target. [`Popover`](/react/components/popover/), [`Popup`](/react/components/popup/), [`Dialog`](/react/components/dialog/), [`Toast`](/react/components/toast/), and [`Tooltip`](/react/components/tooltip/) read this through `useOverlaysRoot()` and use the first matching element as their portal root.

The default covers the three conventional app shell ids — `#app` (Vite/CRA), `#__next` (Next.js pages router), `#root` (CRA, Vite-React). Override only when your app shell uses a custom container id, or when you specifically need overlays to portal into a different node (e.g. a Shadow DOM root, an embedded iframe app shell).

This matters mainly for the `inert` behavior on [`Dialog`](/react/components/dialog/) and [`Popup`](/react/components/popup/), which mark the overlays root as `inert` while open to lock out the rest of the page — pointing the selector at the wrong element means modals won't actually block input.

### defaults

`ComponentDefaults` · Default `{}`

Per-component default props, applied app-wide. Each entry is a `Partial` of that component's props — every component that opts in exports a `*DefaultProps` type (`ButtonDefaultProps`, `ChipDefaultProps`, `SurfaceDefaultProps`, etc.) describing exactly what's overridable.

```tsx
import { CladdProvider } from '@cladd-ui/react';

<CladdProvider
  accentColor="brand"
  defaults={{
    Button: { size: 'lg', outline: false },
    Chip: { variant: 'transparent' },
    Tooltip: { position: 'top' },
    Surface: { level: 2 },
    ListButton: { size: 'sm' },
  }}
>
  <App />
</CladdProvider>;
```

Precedence is **instance prop → context default → built-in default**. An explicit prop on a component instance always wins, and the component's own built-in defaults fill in anything you didn't override — so `defaults` only changes the values you list, not the rest of the component's behavior.

Polymorphic props (`as`, `ref`) and per-instance content (`children`, controlled values, event handlers) are intentionally excluded from the `*DefaultProps` types — they don't make sense as app-wide values.

Reach for this when an app consistently deviates from a kit default — a settings panel that wants every [`Surface`](/react/components/surface/) at `level={2}`, an admin app that drops the outline ring on all [`Button`](/react/components/button/) controls, a dense dashboard that wants every [`List`](/react/components/list/) at `size="sm"`. For a one-off, just pass the prop on the instance.

### children

The app tree. Everything that needs theme, accent, or the dialog/toast hooks should live inside this provider — in practice, just put it at the very top of your tree and you don't have to think about it again.

## What it mounts

Internally `CladdProvider` is a tiny composition:

```tsx
<ThemeProvider theme={...} accentColor={...} overlaysRoot={...}>
  <DialogsPortalProvider>
    <ToastsPortalProvider>
      {children}
      <DialogsPortal />
      <ToastsPortal />
    </ToastsPortalProvider>
  </DialogsPortalProvider>
</ThemeProvider>
```

- `ThemeProvider` publishes `{ theme, accentColor, overlaysRoot }` to descendants. Read it with `useTheme()` and `useAccentColor()`.
- `DialogsPortalProvider` + `DialogsPortal` back the [`useDialog`](/react/components/dialog/) hook — a single portal-rendered [`Dialog`](/react/components/dialog/) instance that `confirm()` / `alert()` calls drive imperatively.
- `ToastsPortalProvider` + `ToastsPortal` back the [`useToast`](/react/components/toast/) hook — a queue of portal-rendered [`Toast`](/react/components/toast/)s that stack at the bottom-right corner and auto-dismiss independently.

You don't typically reach for these inner pieces directly — `CladdProvider` is the documented surface. They exist as separate exports for the rare case where you need a different composition (e.g. a sub-tree with its own accent scope, or an app that only wants the theme context without the overlay portals).

## Hooks

The values published by `CladdProvider` are read through two thin hooks:

```ts
function useTheme(): 'dark' | 'light';
function useAccentColor(): Color;
```

Both are simple `useContext` reads — call them from any component below `CladdProvider` to branch on the current theme (e.g. swap a logo asset, pick a different illustration) or to use the app-wide accent as a default for your own custom components.

## API Reference

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `accentColor?` | `Color` | `'brand'` | App-wide accent color.<br>Default `'brand'`.<br>Read by `useAccentColor` and used as the default `color` for interactive components (Button, Switch, Checkbox, Radio, etc.). |
| `children?` | `ReactNode` | — | App tree wrapped by the provider. Overlays (Dialog, Toast) are portaled outside this subtree into `overlaysRoot`. |
| `defaults?` | `ComponentDefaults` | — | Per-component default props, applied app-wide.<br>Example: `defaults={{ Button: { outline: false, size: 'lg' } }}`.<br>Explicit props on a component instance always win over these defaults,<br>which in turn win over the component's built-in defaults. |
| `overlaysRoot?` | `string` | `'#app, #__next, #root'` | The root element(s) to insert overlays to.<br>Default `'#app, #__next, #root'`. |
| `theme?` | `'dark' \| 'light'` | `'dark'` | Color scheme. Default `'dark'`.<br>Read by `useTheme` and used to switch surface defaults (e.g. Popover/Dialog/Tooltip pick different `variant`, `outline`, and `surfaceLevel` per theme). |
