---
title: "Quickstart"
description: "Wrap your app in CladdProvider and compose the minimum app shell — the canonical layout cladd is designed around."
links:
  doc: https://cladd.io/react/foundations/quickstart/
---

# Quickstart

This page is the shortest path from `npm install` to a cladd app that actually looks like a cladd app. It assumes you've completed the [Installation](/react/installation/) (the npm package, the Tailwind CSS import) and want to know what the _first_ layout you build should look like.

cladd is dense, surface-based, and dark by default. The minimum app is three pieces: a [`CladdProvider`](/react/components/cladd-provider/) at the root, an app shell composed from [`Surface`](/react/components/surface/) panels, and content laid into those surfaces using [`Toolbar`](/react/components/toolbar/), [`List`](/react/components/list/), and the rest of the kit.

## Wrap your app

[`CladdProvider`](/react/components/cladd-provider/) is the single root provider. It publishes the theme and the app-wide accent color, sets the overlays root, and mounts the dialog / toast portals that [`useDialog`](/react/hooks/use-dialog/) and [`useToast`](/react/hooks/use-toast/) push into. Wrap your tree once, at the top, and forget about it:

```tsx
import { CladdProvider } from '@cladd-ui/react';

export default function App({ children }) {
  return (
    <CladdProvider theme="dark" accentColor="brand">
      {children}
    </CladdProvider>
  );
}
```

Both `theme` and `accentColor` have sensible defaults (`'dark'`, `'brand'`), so a bare `<CladdProvider>{children}</CladdProvider>` is also fine. Switching the actual color tokens — toggling `<html>` between dark and light palettes — is your app's responsibility; `theme` only tells cladd's floating surfaces (Popover, Dialog, Tooltip) which set of defaults to pick.

## A minimum app shell

The canonical cladd layout is a three-region shell: a [`Toolbar`](/react/components/toolbar/) running across the top, a [`List`](/react/components/list/) sidebar on the left, and a content [`Surface`](/react/components/surface/) on the right. Every region is a real cladd primitive — not a `<div>` styled to mimic one.

![App shell](https://cladd.io/screenshots/foundations/quickstart/app-shell.png)

```tsx
import {
  CladdProvider,
  Surface,
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
  List,
  ListButton,
  ListTitle,
  Chip,
  Button,
} from '@cladd-ui/react';

export default function App() {
  return (
    <CladdProvider>
      <div className="flex h-screen bg-cladd-bg text-xs text-cladd-fg">
        {/* Left rail — workspace navigation. A floating Surface inset
            with m-2 rounded-3xl is the cladd sidebar pattern; every
            region sits as a rounded panel on the page bg, never
            edge-to-edge. */}
        <Surface outline className="m-2 w-55 rounded-3xl">
          <List>
            <ListTitle>Workspace</ListTitle>
            <ListButton selected after={<Chip color="brand">12</Chip>}>
              Inbox
            </ListButton>
            <ListButton>Drafts</ListButton>
            <ListButton>Archive</ListButton>
          </List>
        </Surface>

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar — two Toolbars sharing one row. ml-auto on the
              second pushes it to the right edge; contextual actions on
              the left, chrome actions on the right, no custom flex
              layout needed. */}
          <div className="flex h-16 items-center gap-2 px-4">
            <Toolbar>
              <ToolbarButton>Compose</ToolbarButton>
              <ToolbarButton>Reply</ToolbarButton>
            </Toolbar>
            <Toolbar className="ml-auto">
              <ToolbarButton>Save</ToolbarButton>
              <ToolbarButton>Open</ToolbarButton>
              <ToolbarSeparator />
              <ToolbarButton color="brand" variant="gradient">
                Publish
              </ToolbarButton>
            </Toolbar>
          </div>

          {/* Main scroll region — a vertical stack of Surfaces, one per
              card. Each card is a real Surface, never a <div> styled
              to look like one. Add as many as your view needs. */}
          <main className="flex flex-1 flex-col gap-2 overflow-auto p-4">
            <Surface
              outline
              className="rounded-3xl"
              contentClassName="flex flex-col gap-4 p-4"
            >
              <h1 className="text-base">Inbox</h1>
              <p className="text-cladd-fg-soft">
                12 unread messages in your workspace.
              </p>
              <Button color="brand" rounded>
                Compose
              </Button>
            </Surface>
            <Surface
              outline
              className="rounded-3xl"
              contentClassName="flex flex-col gap-1 p-4"
            >
              <h2 className="text-sm">Anna Lindberg</h2>
              <p className="text-cladd-fg-soft">
                Quick question on the export pipeline
              </p>
              <p className="text-cladd-fg-softer">
                Staging run failed overnight — the schema validator is
                rejecting the new locale rows. Have you seen this on prod
                yet, or is it just the dev branch?
              </p>
            </Surface>
            <Surface
              outline
              className="rounded-3xl"
              contentClassName="flex flex-col gap-1 p-4"
            >
              <h2 className="text-sm">Marcus Webb</h2>
              <p className="text-cladd-fg-soft">
                Design review notes — week 18
              </p>
              <p className="text-cladd-fg-softer">
                Loved the new inspector layout. Two small notes on toolbar
                spacing and one question about how the accent ring renders
                in light mode — happy to walk through tomorrow.
              </p>
            </Surface>
          </main>
        </div>
      </div>
    </CladdProvider>
  );
}
```

That's the entire shell. From here, fill the content surface with whatever your app needs — [`Input`](/react/components/input/), [`Select`](/react/components/select/), [`Dialog`](/react/components/dialog/), [`Popover`](/react/components/popover/), and the rest of the kit are designed to drop straight in.

## Reach for cladd primitives, not divs

The fastest way to make cladd code feel generic is to skip the primitives and style raw `<div>`s instead. The mapping:

| You want...                                         | Use...                                             |
| --------------------------------------------------- | -------------------------------------------------- |
| A panel, card, or any framed region                 | [`Surface`](/react/components/surface/)            |
| An inset / recessed slot (code blocks, input wells) | [`SurfaceCut`](/react/components/surface-cut/)     |
| A horizontal strip of action buttons                | [`Toolbar`](/react/components/toolbar/)            |
| A vertical row stack (sidebars, menus)              | [`List`](/react/components/list/)                  |
| A status tag, count, or label                       | [`Chip`](/react/components/chip/)                  |
| A keyboard shortcut hint                            | [`Shortcut`](/react/components/shortcut/)          |
| A grouped section eyebrow label                     | [`SectionTitle`](/react/components/section-title/) |
| A floating anchored panel                           | [`Popover`](/react/components/popover/)            |
| A full-screen detail sheet                          | [`Popup`](/react/components/popup/)                |

If you find yourself stacking `bg-cladd-surface` + `border` + `rounded-*` on a `<div>`, you almost certainly want a [`Surface`](/react/components/surface/) instead. Same goes for any "row of buttons" that ends up styled by hand — that's a [`Toolbar`](/react/components/toolbar/).

## Use the cladd tokens

For the parts that _aren't_ primitives — page backgrounds, soft body text, outline strokes — cladd exposes a tight set of Tailwind tokens:

- **Backgrounds** — `bg-cladd-bg`, `bg-cladd-surface`, `bg-cladd-surface-cut`, `bg-cladd-surface-minus`, `bg-cladd-surface-plus`
- **Text** — `text-cladd-fg`, `text-cladd-fg-soft`, `text-cladd-fg-softer`, `text-cladd-fg-softest`
- **Strokes** — `border-cladd-outline`
- **Accent** — `text-cladd-primary`

Do **not** invent suffixes (`bg-cladd-surface-2`, `text-cladd-fg-2`) — they don't exist. Stick to the exposed names.

## Icons

cladd is icon-agnostic — it ships no icon set. Use whatever your project already has: [Lucide](https://lucide.dev/), [Heroicons](https://heroicons.com/), [Tabler Icons](https://tabler.io/icons), or hand-rolled SVG components.

Two integration patterns:

- Components with an explicit `icon` prop ([`Chip`](/react/components/chip/), [`ListButton`](/react/components/list/)) take a component or a node:

  ```tsx
  <Chip icon={CheckIcon} color="green">Active</Chip>
  <ListButton icon={<InboxIcon />}>Inbox</ListButton>
  ```

- Everywhere else ([`Button`](/react/components/button/), [`ToolbarButton`](/react/components/toolbar/)), render the icon as a child:

  ```tsx
  <Button color="brand">
    <PlusIcon />
    Add
  </Button>
  ```

## Where to go next

Three foundation pages, in order:

1. [Surfaces](/react/foundations/surfaces/) — the depth model: levels, nesting, recessed vs. raised, contextual `useSurface`.
2. [Sizing](/react/foundations/sizing/) — the `2xs → 2xl` scale and how nested primitives like [`Chip`](/react/components/chip/) and [`Shortcut`](/react/components/shortcut/) auto-fit inside a [`Button`](/react/components/button/) or [`Input`](/react/components/input/) row.
3. [Colors](/react/foundations/colors/) — the eleven accent tokens and how to retune them with OKLCH variables.

Read those three and the remaining 90% of cladd is just looking up the right component.
