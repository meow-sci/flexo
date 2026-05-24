---
title: "Popup"
description: "Full-screen overlay for task editors, settings panels, and detail sheets."
links:
  doc: https://cladd.io/react/components/popup/
  api: https://cladd.io/react/components/popup/#api-reference
---

# Popup

`Popup` is the **full-screen scrollable overlay** — the surface you reach for when there's too much content for a [`Dialog`](/react/components/dialog/) or [`Popover`](/react/components/popover/), but you still want the rest of the app to step out of the way. Task detail views, file inspectors, settings panels, multi-section forms — anything that wants a column of stacked cards over a dimmed app shell. It's powering the task-edit sheets and similar long-form views in [**t0ggles**](https://t0ggles.com), [**Swiper Studio**](https://studio.swiperjs.com) and [**PaneFlow**](https://paneflow.com).

It sits next to the other overlays as the "biggest hammer":

- [`Toast`](/react/components/toast/) — corner notification, auto-dismisses, doesn't block.
- [`Popover`](/react/components/popover/) — small, anchored to a trigger, dismisses on outside-click.
- [`Dialog`](/react/components/dialog/) — centered, focus-trapping, blocks the page until the user picks a button.
- **`Popup`** — full-height column over the app shell, **scrollable**, focus-trapped, built to hold a lot of content.

A popup portals into the overlay root, `inert`s the app shell while open (default selector `.app-container`), traps focus inside its tree, and centers a vertically-scrolling content column. Children stack inside that column — usually as one or more `PopupContent` cards — and a built-in header (with `headerLeft`, `headerRight`, and an auto close button) rides at the top.

There are two ways to drive it. The **compound API** — `PopupRoot` + `PopupTrigger` + `Popup` (+ optional `PopupClose`) — wires a popup to a trigger element in JSX. **Controlled mode** drives `Popup` directly via `open` / `onOpenChange` for state owned outside the popup tree.

![Overview](https://cladd.io/screenshots/components/popup/overview.png)

```tsx
<PopupRoot>
  <PopupTrigger>
    <Button>Open task</Button>
  </PopupTrigger>
  <Popup
    headerLeft={
      <div className="flex items-center gap-2 px-2 pb-1">
        <NoteIcon className="size-4 text-cladd-fg-soft" />
        <span className="text-cladd-sm font-semibold">Cladd UI</span>
      </div>
    }
    headerRight={
      <ExampleToolbar rounded>
        <Button rounded variant="transparent" outline={false}>
          <EnvelopeIcon />
        </Button>
        <Button rounded variant="transparent" outline={false}>
          <ArchiveIcon />
        </Button>
        <Button rounded variant="transparent" outline={false}>
          <CopyIcon />
        </Button>
      </ExampleToolbar>
    }
  >
    <PopupContent>
      <div className="flex items-start justify-between gap-4">
        <span className="text-cladd-xs text-cladd-fg-soft uppercase">
          CLADD-5
        </span>
        <div className="flex items-center gap-2">
          <Chip color="green">In Progress</Chip>
          <Chip variant="transparent">0</Chip>
        </div>
      </div>
      <h2 className="text-cladd-lg mt-2 font-semibold">Website docs</h2>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Input placeholder="Add tags" />
        <Input placeholder="Add priority" />
        <Input placeholder="Add start & due date" />
        <Input placeholder="Assign person" />
      </div>
    </PopupContent>
    <PopupContent>
      <SectionTitle>Description</SectionTitle>
      <div className="mt-2 flex flex-col gap-2 text-cladd-sm">
        <p>
          Documentation site for the cladd component library. Covers
          hooks, guides, and component reference pages with live examples.
        </p>
        <ul className="ml-4 list-disc text-cladd-fg-soft">
          <li>Hooks: useDevice, useTheme, useSurface, useToast</li>
          <li>Guides: Colors, Customization</li>
          <li>Components: Backdrop, Button, Chip, etc.</li>
        </ul>
      </div>
    </PopupContent>
  </Popup>
</PopupRoot>
```

## Usage

### Compound API

```tsx
import {
  Button,
  Popup,
  PopupContent,
  PopupRoot,
  PopupTrigger,
} from '@cladd-ui/react';

<PopupRoot>
  <PopupTrigger>
    <Button>Open task</Button>
  </PopupTrigger>
  <Popup headerLeft={<span>Task</span>}>
    <PopupContent>…</PopupContent>
  </Popup>
</PopupRoot>;
```

`PopupRoot` owns the open state (uncontrolled by default). `PopupTrigger` **clones** its single child to attach an `onClick` that toggles the root — point it at any [`Button`](/react/components/button/), [`Chip`](/react/components/chip/), or other clickable element. `Popup` reads the root's open state automatically, portals into the overlay root, and renders its header + scrollable content column.

### Controlled

```tsx
import { Button, Popup, PopupContent } from '@cladd-ui/react';

const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>Open</Button>
<Popup open={open} onOpenChange={setOpen}>
  <PopupContent>…</PopupContent>
</Popup>;
```

Drop `PopupRoot`/`PopupTrigger` and drive `Popup` directly through `open` / `onOpenChange`. Use this when the popup represents state your app already owns — opening a record from a URL param, surfacing a detail panel from a board cell click, a programmatic walkthrough.

### Composing with PopupContent

```tsx
<Popup headerLeft={<span>Task</span>}>
  <PopupContent>{/* header row, title, fields */}</PopupContent>
  <PopupContent>{/* description */}</PopupContent>
  <PopupContent>{/* attachments */}</PopupContent>
  <PopupContent>{/* comments */}</PopupContent>
</Popup>
```

`PopupContent` is the **card surface** you stack inside a popup — a rounded [`Surface`](/react/components/surface/) with padded content area, tuned to read as one of several sibling cards in the popup's scroll column. Use one for short popups; stack two or three for task editors, settings panels, and the like. Anything that fits in a regular Surface fits in a `PopupContent`.

You don't have to use it — `children` is any `ReactNode`, so you can render whatever surface treatment you want — but `PopupContent` is the sized-and-spaced default, and it's what the rest of the cladd app shell uses for these views.

## Examples

### Compound

The canonical shape — `PopupRoot` wraps the trigger and the popup as siblings. The root owns the open state, so trigger and popup stay in sync through context without prop-drilling. `PopupClose` (used here) wraps any child you want to dismiss on click — the same shape as [`DialogClose`](/react/components/dialog/) and [`PopoverClose`](/react/components/popover/).

![Compound](https://cladd.io/screenshots/components/popup/compound.png)

```tsx
<PopupRoot>
  <PopupTrigger>
    <Button>Open popup</Button>
  </PopupTrigger>
  <Popup
    headerLeft={
      <span className="px-2 pb-1 text-cladd-sm font-semibold">
        Compound API
      </span>
    }
  >
    <PopupContent>
      <p className="text-cladd-sm">
        Trigger, popup, and close all sit inside PopupRoot. The root owns
        the open state and wires the parts together through context.
      </p>
      <PopupClose>
        <Button className="mt-4">Dismiss</Button>
      </PopupClose>
    </PopupContent>
  </Popup>
</PopupRoot>
```

### Controlled

Pass `open` and `onOpenChange` directly to `Popup` to drive it from external state. The surrounding `PopupRoot` is bypassed when `open` is provided, so you can drop it entirely. Useful when the popup represents app state — `/tasks/:id` deep links, "open last task on Cmd+K", a save-conflict response — rather than a click on a specific button.

![Controlled](https://cladd.io/screenshots/components/popup/controlled.png)

```tsx
<div className="flex items-center gap-2">
  <Button onClick={() => setOpen(true)}>Open from external state</Button>
  <Chip color={open ? 'green' : 'neutral'}>
    {open ? 'open' : 'closed'}
  </Chip>
</div>
<Popup
  open={open}
  onOpenChange={setOpen}
  headerLeft={
    <span className="px-2 pb-1 text-cladd-sm font-semibold">
      Controlled
    </span>
  }
>
  <PopupContent>
    <p className="text-cladd-sm">
      open and onOpenChange come from the surrounding component — no
      PopupRoot needed.
    </p>
    <Button className="mt-4" onClick={() => setOpen(false)}>
      Close
    </Button>
  </PopupContent>
</Popup>
```

### Multiple PopupContent cards

A popup's `children` render inside a vertical scrollable column — stack as many `PopupContent` cards as the view needs and they'll flow naturally with a consistent gap. This is the dominant pattern: one card for the header/title, one for properties, one for description, one for comments. The scroll wrap caps at the viewport height with safe-area padding so the column never gets clipped.

![Multiple content](https://cladd.io/screenshots/components/popup/multiple-content.png)

```tsx
<PopupRoot>
  <PopupTrigger>
    <Button>Open settings</Button>
  </PopupTrigger>
  <Popup
    headerLeft={
      <span className="px-2 pb-1 text-cladd-sm font-semibold">
        Workspace settings
      </span>
    }
  >
    <PopupContent>
      <SectionTitle>General</SectionTitle>
      <div className="mt-2 flex flex-col gap-2">
        <Input placeholder="Workspace name" />
        <Input placeholder="Slug" />
      </div>
    </PopupContent>
    <PopupContent>
      <SectionTitle>Notifications</SectionTitle>
      <div className="mt-2 flex flex-col gap-2 text-cladd-sm">
        <label className="flex items-center justify-between gap-4">
          <span>Email updates</span>
          <Switch as="div" checked={email} onChange={setEmail} />
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
    </PopupContent>
    <PopupContent>
      <SectionTitle>Members</SectionTitle>
      <List className="-mx-4 mt-2">
        <ListItem>jamie@acme.studio</ListItem>
        <ListItem>sam@acme.studio</ListItem>
        <ListItem>alex@acme.studio</ListItem>
        <ListSeparator />
        <ListButton icon={<PlusIcon />}>Invite teammate</ListButton>
      </List>
    </PopupContent>
  </Popup>
</PopupRoot>
```

### PopupContent variant

`variant` on `PopupContent` is forwarded straight to the underlying [`Surface`](/react/components/surface/) — same five values: `transparent`, `solid` (default), `gradient`, `solid-fill`, `gradient-fill`. Combine with a `cladd-color-*` class on the same element (or with a parent that sets the accent token) to tint the fill and outline. `surfaceLevel` bumps the elevation step; `outline` toggles the ring.

![Popup content variant](https://cladd.io/screenshots/components/popup/popup-content-variant.png)

```tsx
<PopupRoot>
  <PopupTrigger>
    <Button color={color}>Open popup</Button>
  </PopupTrigger>
  <Popup
    headerLeft={
      <span className="px-2 pb-1 text-cladd-sm font-semibold">
        PopupContent variant
      </span>
    }
    closeButtonColor={color}
  >
    <PopupContent variant={variant} className={`cladd-color-${color}`}>
      <p className="text-cladd-sm">
        PopupContent forwards <code>variant</code> to the underlying
        Surface — same set as Surface itself: transparent, solid,
        gradient, solid-fill, gradient-fill. Tint with a{' '}
        <code>cladd-color-*</code> class on the wrapper.
      </p>
    </PopupContent>
    <PopupContent
      variant={variant}
      className={`cladd-color-${color}`}
      surfaceLevel={2}
    >
      <p className="text-cladd-sm">
        <code>surfaceLevel</code> bumps the elevation step (default{' '}
        <code>1</code>) — same relative <code>"+1"</code>/
        <code>"-1"</code> syntax as Surface.
      </p>
    </PopupContent>
  </Popup>
</PopupRoot>
```

### Custom close + action buttons

Drop the auto close button with `closeButton={false}` and put your own actions in `headerRight`. Wrap each in `PopupClose` so they dismiss the popup on click. This is the right shape for editor-style popups where "Cancel" and "Save" are the two real actions and the X glyph would be redundant. You can also override only the glyph via `closeButtonContent` (string or `ReactNode`) and the accent via `closeButtonColor`.

![Custom close](https://cladd.io/screenshots/components/popup/custom-close.png)

```tsx
<PopupRoot>
  <PopupTrigger>
    <Button>Open editor</Button>
  </PopupTrigger>
  <Popup
    headerLeft={
      <span className="px-2 pb-1 text-cladd-sm font-semibold">
        Edit task
      </span>
    }
    closeButton={false}
    headerRight={
      <ExampleToolbar>
        <PopupClose>
          <Button variant="transparent" rounded outline={false}>
            Cancel
          </Button>
        </PopupClose>
        <PopupClose>
          <Button color="brand" variant="gradient" rounded>
            Save
          </Button>
        </PopupClose>
      </ExampleToolbar>
    }
  >
    <PopupContent>
      <div className="flex flex-col gap-2">
        <Input placeholder="Task title" />
        <Textarea placeholder="Description" />
      </div>
    </PopupContent>
  </Popup>
</PopupRoot>
```

### Custom size

The popup's content column defaults to `max-w-162` (~648px) — wide enough for a task editor with two-column fields, narrow enough not to swim on a big monitor. Override with `contentClassName`: drop in `max-w-96` for a tight confirm-style prompt, `max-w-240` for a wider workspace, or `max-w-full` to fill the viewport. Width is the only thing you'd usually want to change — height comes from content and caps at the viewport's safe-area-padded max-height automatically.

![Custom size](https://cladd.io/screenshots/components/popup/custom-size.png)

```tsx
<PopupRoot>
  <PopupTrigger>
    <Button>Open {active.label} popup</Button>
  </PopupTrigger>
  <Popup
    contentClassName={active.className}
    headerLeft={
      <span className="px-2 pb-1 text-cladd-sm font-semibold">
        Custom size
      </span>
    }
  >
    <PopupContent>
      <p className="text-cladd-sm">
        The popup's content column defaults to <code>max-w-162</code>{' '}
        (~648px) — wide enough for a content, narrow enough to feel
        focused on a big monitor. Override with{' '}
        <code>contentClassName</code> when you want a tighter prompt or a
        wider workspace.
      </p>
    </PopupContent>
    <PopupContent>
      <p className="text-cladd-sm">
        Current size: <code>{active.id}</code>
        {active.className ? (
          <>
            {' '}
            · <code>{active.className}</code>
          </>
        ) : null}
      </p>
    </PopupContent>
  </Popup>
</PopupRoot>
```

### Full-screen scrollable

A popup is built to **hold a lot**. The scroll wrap caps at the viewport height with safe-area padding, and any overflow inside it scrolls naturally — so you can stack as many `PopupContent` cards as the view needs without worrying about clipping. This is why a popup beats a [`Dialog`](/react/components/dialog/) for task detail sheets, changelogs, multi-section settings, file inspectors: the user can read top-to-bottom without dismissing first.

![Scrollable](https://cladd.io/screenshots/components/popup/scrollable.png)

```tsx
<PopupRoot>
  <PopupTrigger>
    <Button>Open changelog</Button>
  </PopupTrigger>
  <Popup
    headerLeft={
      <span className="px-2 pb-1 text-cladd-sm font-semibold">
        Changelog
      </span>
    }
  >
    {RELEASES.map((release) => (
      <PopupContent key={release.version}>
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-cladd-md font-semibold">
            v{release.version}
          </h3>
          <Chip>{release.date}</Chip>
        </div>
        <p className="mt-2 text-cladd-sm text-cladd-fg-soft">
          {release.summary}
        </p>
        <ul className="mt-4 ml-4 flex list-disc flex-col gap-1 text-cladd-sm">
          {release.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      </PopupContent>
    ))}
  </Popup>
</PopupRoot>
```

### Nested popups

Open a popup from inside a popup and the previous one slides back and shrinks slightly — the cladd surface stack reads as a visible depth ladder, the way native iOS sheets do. Drill three levels deep and you get three layers stacked behind the active one. Each popup gets its own focus trap and its own `inert` on what's underneath, so keyboard and screen-reader users still land on the right surface as they navigate down.

`closeOnEscape` is suppressed automatically on the popup that's been pushed back, so Escape always dismisses the **top** popup first — no accidental top-down close.

![Nested](https://cladd.io/screenshots/components/popup/nested.png)

```tsx
<Button onClick={() => setOpenA(true)}>Open account settings</Button>

<Popup
  open={openA}
  onOpenChange={setOpenA}
  headerLeft={
    <span className="px-2 pb-1 text-cladd-sm font-semibold">
      Account settings
    </span>
  }
>
  <PopupContent>
    <p className="text-cladd-sm">
      Account-level preferences. Open the security panel to drill in
      further — the popup stack pushes this one back as you go.
    </p>
    <div className="mt-4 flex justify-end">
      <Button onClick={() => setOpenB(true)}>Open security</Button>
    </div>
  </PopupContent>
</Popup>

<Popup
  open={openB}
  onOpenChange={setOpenB}
  headerLeft={
    <span className="px-2 pb-1 text-cladd-sm font-semibold">
      Security
    </span>
  }
>
  <PopupContent>
    <p className="text-cladd-sm">
      Sessions, recovery codes, two-factor. Drill one more level to change
      your password.
    </p>
    <div className="mt-4 flex justify-end">
      <Button onClick={() => setOpenC(true)}>Change password</Button>
    </div>
  </PopupContent>
</Popup>

<Popup
  open={openC}
  onOpenChange={setOpenC}
  headerLeft={
    <span className="px-2 pb-1 text-cladd-sm font-semibold">
      Change password
    </span>
  }
>
  <PopupContent>
    <div className="flex flex-col gap-2">
      <Input placeholder="Current password" type="password" />
      <Input placeholder="New password" type="password" />
      <Input placeholder="Confirm new password" type="password" />
    </div>
    <p className="mt-4 text-cladd-sm text-cladd-fg-soft">
      {PASSWORD_HINT_TEXT}
    </p>
  </PopupContent>
</Popup>
```

## API Reference

### Popup

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `aria-describedby?` | `string` | — | Id of the element describing this popup. |
| `aria-label?` | `string` | — | ARIA label for the dialog role. Use when there's no visible title. |
| `aria-labelledby?` | `string` | — | Id of the element labelling this popup. |
| `backdrop?` | `boolean` | `true` | Render the backdrop. Default `true`. |
| `backdropClassName?` | `string` | — | Extra classes for the backdrop element. |
| `beforeContent?` | `ReactNode` | — | Slot rendered above the header, inside the popup content wrapper. |
| `children?` | `ReactNode` | — | Popup content. Rendered inside the inner content column, after the header. |
| `className?` | `string` | — | Extra classes applied to the outer popup container (positioning + overflow). |
| `closeButton?` | `boolean` | `true` | Render the auto close button in the header. Default `true`. |
| `closeButtonColor?` | `Color` | — | Accent color token for the close button. |
| `closeButtonContent?` | `ReactNode` | — | Override the close-button glyph. Default is an inline SVG "X". |
| `closeOnBackdropClick?` | `boolean` | `true` | Default `true`. |
| `closeOnEscape?` | `boolean` | `true` | Default `true`. Suppressed automatically when this popup contains another popover/dialog/popup, or task-edit overlays. |
| `closeRef?` | `React.RefObject<(() => void) \| null>` | — | Imperative escape hatch - assigned the popup's `close()` function so callers can dismiss it from outside the React tree (e.g. from a non-child callback).<br>The ref's `.current` is set on mount. |
| `contentClassName?` | `string` | — | Extra classes for the inner content column (where children + header live). |
| `header?` | `boolean` | `true` | Render the top header (with close button + slots). Default `true`. |
| `headerClassName?` | `string` | — | Extra classes for the header row. |
| `headerLeft?` | `ReactNode` | — | Slot rendered on the left side of the header (e.g. title, breadcrumbs). |
| `headerRight?` | `ReactNode` | — | Slot rendered on the right side of the header, before the auto-rendered close button. |
| `inertContainer?` | `string` | `'.app-container'` | Selector for the container made `inert` while the popup is open. Default `'.app-container'`. |
| `lazy?` | `boolean` | `false` | Set to `true` when the popup is rendered inside a React `lazy()` + `Suspense` boundary so it opens on the next tick (after the lazy chunk has resolved and mounted). Default `false`. |
| `onClose?` | `() => void` | — | Fires when the close transition begins. |
| `onCloseButtonClick?` | `() => void` | — | Fires before the popup closes from the close-button click. The popup also closes regardless. |
| `onClosed?` | `() => void` | — | Fires after the close transition completes. |
| `onOpen?` | `() => void` | — | Fires when the open transition begins. |
| `onOpenChange?` | `(open: boolean) => void` | — | Fires whenever the open state should change. |
| `onOpened?` | `() => void` | — | Fires after the open transition completes (`transitionend`). |
| `open?` | `boolean` | — | Controlled open state. When omitted, falls back to the surrounding `PopupRoot` state, then `false`. |
| `root?` | `string` | `'#app, #__next, #root'` | Portal target selector. Default `'#app, #__next, #root'`. |
| `wrapClassName?` | `string` | — | Extra classes for the scrollable wrap that holds the content column. |

### PopupContent

A pre-styled [`Surface`](/react/components/surface/) card sized for the popup column — rounded, padded, outlined by default. Use one for a single section; stack multiple for the [t0ggles](https://t0ggles.com)-style task-detail layout (header → properties → description → attachments → comments).

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Card content. |
| `className?` | `string` | — | Extra classes for the card `Surface`. |
| `contentClassName?` | `string` | — | Extra classes for the inner content area. Default includes `!h-auto w-full p-4`. |
| `outline?` | `boolean` | `true` | Render the outline ring. Default `true`. |
| `surfaceLevel?` | `number` | `1` | Forwarded to the underlying `Surface` as `level`. Default `1`. Accepts the relative (`"+1"`/`"-1"`) syntax via `Surface.level`. |
| `variant?` | `SurfaceVariant` | `'solid'` | Surface variant for the popup card. Default `'solid'`. |

### PopupRoot

State container for the surrounding compound — owns the open state and provides it to `PopupTrigger`, `Popup`, and `PopupClose` through context.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Trigger + popup (+ optional close) elements. |
| `defaultOpen?` | `boolean` | `false` | Initial open state (uncontrolled). Default `false`. Ignored when `open` is provided. |
| `onOpenChange?` | `(open: boolean) => void` | — | Fires whenever the open state should change. |
| `open?` | `boolean` | — | Controlled open state. When provided, internal state is bypassed. |

### PopupTrigger

**Clones** its single child to attach an `onClick` that toggles the surrounding `PopupRoot`'s open state — composed with any existing `onClick` on the child. No-ops (renders the child as-is) when used outside a `PopupRoot`. Unlike [`PopoverTrigger`](/react/components/popover/), this does **not** register an anchor ref — popups fill the viewport, not a slot next to the trigger.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Single React element to clone as the trigger. Must accept `onClick`. |

### PopupClose

**Clones** its single child to attach an `onClick` that flips the surrounding `PopupRoot`'s open state to `false`. Wrap inner action buttons (Cancel, Save, Done) so they dismiss the popup on click.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Single React element to clone as the close affordance. Must accept `onClick`. |
