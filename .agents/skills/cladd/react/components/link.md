---
title: "Link"
description: "Navigational text link that flows inline with content and prose."
links:
  doc: https://cladd.io/react/components/link/
  api: https://cladd.io/react/components/link/#api-reference
---

# Link

`Link` is the small text-link primitive — the right control for "Forgot password?", "Edit profile", inline actions inside prose, and footer-style navigation. It's deliberately minimal: a 12px label, a pointer cursor, an `active:opacity-50` press state, and a keyboard focus ring drawn by the same `FocusableLayer` as the rest of the kit. There's no underline by default — pick a `color` and the text takes on the accent, otherwise it inherits whatever the surrounding text is using.

Polymorphism is automatic: pass `href` and `Link` renders as `<a>`; leave `href` off and it renders as `<button>`. Override with `as` when you need a router-aware component (Next's `Link`, React Router's `Link`) without losing the styling.

![Overview](https://cladd.io/screenshots/components/link/overview.png)

```tsx
<Link color="brand">Forgot password?</Link>
<Link>Edit profile</Link>
<Link color="red">Cancel subscription</Link>
<Link
  as="a"
  color="cyan"
  href="https://cladd.io/"
  target="_blank"
  rel="noreferrer"
>
  Read the docs
</Link>
```

## Usage

```tsx
import { Link } from '@cladd-ui/react';

<Link color="brand" onClick={() => signOut()}>
  Sign out
</Link>;
```

A bare `Link` with no `href` renders a `<button type="button">` — semantic, focusable, and won't navigate. Add an `href` and it becomes an `<a>` automatically. Pass `color` to tint the text with one of the eleven accent tokens; without it, the link inherits the surrounding `color` / text color (so a Link inside a `text-cladd-fg-soft` paragraph reads as soft).

## Examples

### Colors

`color` accepts any of the eleven cladd accent tokens and routes through `text-cladd-primary`. Use `brand` for primary inline CTAs, `red` for destructive actions ("Cancel subscription", "Delete account"), and a tinted accent (`cyan`, `purple`, `green`) when you need the link to stand out from body copy. Omit `color` entirely to let the link inherit — useful for footer links or compact toolbars where every link should match the surrounding text.

![Color](https://cladd.io/screenshots/components/link/color.png)

```tsx
<Link color={color}>Continue with {color}</Link>
```

### Inline in prose

`Link` is sized to fit cleanly inside body text — the 12px base reads as a footnote inside a paragraph, and the keyboard focus ring sits clear of the line height. Drop one or more `Link`s between text spans for inline actions: switching accounts, opening a side panel, jumping to a related setting. No surrounding markup needed.

![Inline](https://cladd.io/screenshots/components/link/inline.png)

```tsx
<Surface
  outline
  className="max-w-96 rounded-2xl"
  contentClassName="p-4 text-cladd-fg-soft leading-relaxed"
>
  You're signed in as{' '}
  <span className="text-cladd-fg">vladimir@cladd.io</span>.{' '}
  <Link color="brand">Switch account</Link> or{' '}
  <Link color="red">sign out</Link> when you're done.
</Surface>
```

### Polymorphic root

By default, `Link` chooses its element from `href`: present → `<a>`, absent → `<button>`. Override with `as` when you need a routing-aware component — pass Next's `Link` (`as={NextLink}`), React Router's `Link`, or any component, and `Link` will forward props through and keep the cladd styling on top.

![Polymorphic](https://cladd.io/screenshots/components/link/polymorphic.png)

```tsx
<Link onClick={() => {}}>button (default)</Link>
<Link href="/react/components/button/">anchor (href)</Link>
<Link
  as="a"
  href="https://cladd.io/"
  target="_blank"
  rel="noreferrer"
  color="brand"
>
  as="a"
</Link>
```

### Disabled

`disabled` dims the link via the native attribute (and `data-disabled` for styling). On the rendered `<button>`, browsers suppress clicks and focus for free; on an `<a>` the attribute is non-standard but the `data-disabled` hook still lets you wire up your own pointer-events rule if you need to lock a navigation link.

![Disabled](https://cladd.io/screenshots/components/link/disabled.png)

```tsx
<div className="flex flex-col items-center gap-4">
  <Link
    color="brand"
    disabled={disabled}
    onClick={() => setCount((c) => c + 1)}
  >
    Resend verification email
  </Link>
  <span className="font-mono text-cladd-fg-softer">clicks: {count}</span>
</div>
```

### Read-only

`readOnly` blocks the `onClick` handler while keeping the link visually intact — full opacity, focusable, ring still draws. It's the right state for a link that should read as active but shouldn't react: a "current" navigation item, a link locked while a parallel action is in flight, a "verification sent" indicator that you don't want re-pressed before the cooldown.

![Read only](https://cladd.io/screenshots/components/link/read-only.png)

```tsx
<div className="flex flex-col items-center gap-4">
  <Link
    color="brand"
    readOnly={readOnly}
    onClick={() => setCount((c) => c + 1)}
  >
    Resend verification email
  </Link>
  <span className="font-mono text-cladd-fg-softer">clicks: {count}</span>
</div>
```

## API Reference

**Generics:** `C extends ElementType = 'button'`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `as?` | `ElementType` | `'a'` | Polymorphic element. When omitted, defaults to `'a'` if `href` is provided, otherwise `'button'`. Pass an explicit value to override (e.g. a router `Link` component). |
| `children?` | `ReactNode` | — | Link content. |
| `className?` | `string` | — | Extra classes for the link element. |
| `color?` | `Color` | — | Accent color token |
| `disabled?` | `boolean` | — | Native `disabled` attribute. |
| `focusable?` | `boolean` | `true` | Renders a `FocusableLayer` ring on keyboard focus. Defaults to `true`. |
| `href?` | `string` | — | Native `href` - when provided, the polymorphic default switches from `'button'` to `'a'`. |
| `onClick?` | `() => void` | — | Click handler. |
| `readOnly?` | `boolean` | — | Native `readOnly` attribute. |
