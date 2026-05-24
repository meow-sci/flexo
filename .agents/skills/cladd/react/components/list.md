---
title: "List"
description: "Vertically stacked rows for sidebars, navigation panels, and menus."
links:
  doc: https://cladd.io/react/components/list/
  api: https://cladd.io/react/components/list/#api-reference
---

# List

`List` and its companions are the building blocks of vertical row layouts — sidebars, navigation panels, settings sheets, and dropdown menus. The five pieces are designed to compose:

- `List` — the container. A flex column with `p-2`; pass `className` to size it (`w-64`, `w-full`, etc.).
- `ListButton` — the interactive row primitive. Wraps [`Button`](/react/components/button/) with list-tuned defaults (`size="lg"`, transparent variant, `multiline`) plus slots for `icon`, `header`, `footer`, and `after`.
- `ListItem` — the static row primitive. Same vertical rhythm as `ListButton` but renders a plain `<div>` — for read-only metadata rows.
- `ListSeparator` — a hairline that bleeds into the list's padding, for grouping rows.
- `ListTitle` — an uppercase eyebrow label for naming a group of rows.

In practice these are most often dropped into a [`Popover`](/react/components/popover/) to build option menus, sort pickers, account dropdowns, and command-palette rows — see the [popover example](#in-a-popover) below.

![Overview](https://cladd.io/screenshots/components/list/overview.png)

```tsx
<Surface outline className="w-72 rounded-3xl">
  <List>
    <ListTitle>Workspace</ListTitle>
    <ListButton
      icon={<EnvelopeIcon />}
      selected={selected === 'inbox'}
      onClick={() => setSelected('inbox')}
      after={<Chip color="brand">12</Chip>}
    >
      Inbox
    </ListButton>
    <ListButton
      icon={<NoteIcon />}
      selected={selected === 'drafts'}
      onClick={() => setSelected('drafts')}
    >
      Drafts
    </ListButton>
    <ListButton
      icon={<ArchiveIcon />}
      selected={selected === 'archive'}
      onClick={() => setSelected('archive')}
    >
      Archive
    </ListButton>
    <ListSeparator />
    <ListTitle>Storage</ListTitle>
    <ListItem>
      <span className="text-cladd-fg-soft">Used</span>
      <span className="ml-auto font-mono">4.2 / 10 GB</span>
    </ListItem>
    <ListSeparator />
    <ListButton icon={<PlusIcon />} color="brand">
      New project
    </ListButton>
  </List>
</Surface>
```

## Usage

```tsx
import {
  List,
  ListButton,
  ListItem,
  ListSeparator,
  ListTitle,
} from '@cladd-ui/react';

<List className="w-64">
  <ListTitle>Workspace</ListTitle>
  <ListButton selected>Inbox</ListButton>
  <ListButton>Drafts</ListButton>
  <ListSeparator />
  <ListButton icon={<PlusIcon />}>New project</ListButton>
</List>;
```

A bare `List` is a flex column with `p-2`. Drop in any combination of `ListTitle`, `ListSeparator`, `ListButton`, and `ListItem` — they all share the list's padding rhythm so spacing stays consistent without per-row tuning.

`ListButton` inherits the full [`Button`](/react/components/button/) API. Notable defaults that differ from `Button`: `size="lg"` (lists usually want more vertical space than a toolbar), `variant="transparent"`, `outline={false}`, and `multiline` so long titles wrap instead of truncating.

## Examples

### With icon

`ListButton`'s `icon` slot takes a node — typically an SVG — and renders it in a size-matched square ahead of the title. The wrapper applies the size class for you, so the same icon stays in proportion as you change the row's `size`. Use it for action menus and navigation rows where the leading glyph carries most of the recognition load.

![With icon](https://cladd.io/screenshots/components/list/with-icon.png)

```tsx
<Surface outline className="w-64 rounded-3xl">
  <List>
    <ListButton icon={<PlusIcon />}>New file</ListButton>
    <ListButton icon={<CopyIcon />}>Duplicate</ListButton>
    <ListButton icon={<CheckIcon />}>Mark as done</ListButton>
  </List>
</Surface>
```

### Header, footer & after

`header` and `footer` are small `cladd-xs` labels stacked above and below the title — the right slots for an eyebrow date/category and a metadata line. `after` is a right-aligned end slot for badges, chevrons, [`Chip`s](/react/components/chip/), or [`Shortcut`s](/react/components/shortcut/). Combine them to build the dense, three-line rows you'd see in a task list, an inbox, or an activity feed.

![Header footer](https://cladd.io/screenshots/components/list/header-footer.png)

```tsx
<Surface outline className="w-80 rounded-3xl">
  <List>
    <ListButton
      icon={<CheckIcon />}
      header="Today, 09:14"
      footer="Reviewed by 3 people"
      after={<Chip color="green">Done</Chip>}
    >
      Ship onboarding redesign
    </ListButton>
    <ListButton
      icon={<CopyIcon />}
      header="Yesterday, 17:32"
      footer="Owner: Anna"
      after={<Chip color="yellow">In review</Chip>}
    >
      Migrate billing webhooks
    </ListButton>
    <ListButton
      icon={<PlusIcon />}
      header="2 days ago"
      footer="No assignee yet"
      after={<Chip color="neutral">Backlog</Chip>}
    >
      Draft Q3 retrospective notes
    </ListButton>
  </List>
</Surface>
```

### Selected

`selected` marks the active row. Internally it forces `variant="gradient"` and `outline={true}` regardless of the props you pass, so a selected row always reads as the live one. Pair with `color` to tint the highlight — neutral by default, `"brand"` for the typical app accent.

![Selected](https://cladd.io/screenshots/components/list/selected.png)

```tsx
<Surface outline className="w-64 rounded-3xl">
  <List>
    {VIEWS.map((v) => (
      <ListButton
        key={v}
        selected={v === active}
        color="brand"
        onClick={() => setActive(v)}
      >
        {v}
      </ListButton>
    ))}
  </List>
</Surface>
```

### Sizes

`size` accepts the same `2xs → 2xl` scale as [`Button`](/react/components/button/). The default is `lg` — one step up from `Button`'s default — because list rows want more vertical air than toolbar buttons. Stay around `md`–`lg` for typical menus and sidebars; drop to `sm` or `xs` for dense option sheets opened in a [`Popover`](/react/components/popover/).

![Size](https://cladd.io/screenshots/components/list/size.png)

```tsx
<Surface outline className="w-64 rounded-3xl">
  <List>
    <ListButton size={size} icon={<EnvelopeIcon />} selected>
      Inbox
    </ListButton>
    <ListButton size={size} icon={<NoteIcon />}>
      Drafts
    </ListButton>
    <ListButton size={size} icon={<ArchiveIcon />}>
      Archive
    </ListButton>
  </List>
</Surface>
```

### Color

`color` tints the row's text and accent treatment (the highlight under hover, the gradient under `selected`). Use it in isolation to mark a destructive row — a red `"Delete"` row at the end of a menu — without changing the surrounding rhythm, or pair it with `selected` for a colored active-row highlight.

![Color](https://cladd.io/screenshots/components/list/color.png)

```tsx
<Surface outline className="w-64 rounded-3xl">
  <List>
    <ListButton icon={<CopyIcon />} color={color}>
      Duplicate
    </ListButton>
    <ListButton icon={<PlusIcon />} color={color} selected>
      Add to favorites
    </ListButton>
    <ListSeparator />
    <ListButton color="red">Delete project</ListButton>
  </List>
</Surface>
```

### Static info rows

`ListItem` is the non-interactive sibling of `ListButton` — same vertical rhythm, but it renders a plain `<div>` with no button behavior, no hover overlay, and smaller `cladd-xs` text. Use it for read-only metadata rows in a settings panel, account header rows, or anywhere a row needs to line up with surrounding `ListButton`s but stay static. It composes with [`Chip`](/react/components/chip/) for inline status, and with `ListSeparator` and `ListTitle` for sectioning.

![List item](https://cladd.io/screenshots/components/list/list-item.png)

```tsx
<Surface outline className="w-72 rounded-3xl">
  <List>
    <ListTitle>Account</ListTitle>
    <ListItem>
      <span className="text-cladd-fg-soft">Plan</span>
      <span className="ml-auto">
        <Chip color="brand">Pro</Chip>
      </span>
    </ListItem>
    <ListItem>
      <span className="text-cladd-fg-soft">Seats</span>
      <span className="ml-auto font-mono">8 / 10</span>
    </ListItem>
    <ListItem>
      <span className="text-cladd-fg-soft">Renews</span>
      <span className="ml-auto">May 24, 2026</span>
    </ListItem>
    <ListSeparator />
    <ListButton icon={<CheckIcon />}>Manage billing</ListButton>
  </List>
</Surface>
```

### In a popover

The List family was designed to drop straight into a [`Popover`](/react/components/popover/). The popover supplies the floating surface, the anchoring against the trigger, and the open/close transitions; the list supplies the rows. Wire `selected` to your selection state and you have a sort picker, an account menu, or a properties dropdown in a few lines.

When using `ListButton` inside a popover, drop the `size` to `md` (or `sm` for very dense menus) — popovers are typically narrower than sidebars and the default `lg` rows can feel oversized. Override the popover's default width via `className` (`w-56`, `w-64`) to match the longest row.

![In popover](https://cladd.io/screenshots/components/list/in-popover.png)

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

## API Reference

### List

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | List rows (typically `ListButton`, `ListItem`, `ListTitle`, or `ListSeparator`). |
| `className?` | `string` | — | Extra classes for the list root. |

### ListButton

**Generics:** `C extends ElementType = 'button'`

**Inherits from:** [`Button`](/react/components/button/)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `after?` | `ReactNode` | — | Slot rendered right-aligned at the end of the row (e.g. badge, chevron). |
| `as?` | `ElementType` | `'button'` | Polymorphic root element. Defaults to `'button'`. Pass `'a'` for navigation list rows. |
| `children?` | `ReactNode` | — | Title content of the row (the main text/element on the row). |
| `className?` | `string` | — | Extra classes for the row's surface root. |
| `color?` | `Color` | — | Accent color token. Forwarded to `Button.color`. |
| `contentClassName?` | `string` | — | Extra classes for the row's inner content area. |
| `disabled?` | `boolean` | — | Visually dim the row and disable pointer events. |
| `footer?` | `ReactNode` | — | Small text rendered below the title. Typically secondary metadata. |
| `footerClassName?` | `string` | — | Extra classes for the `footer` element. |
| `header?` | `ReactNode` | — | Small text rendered above the title. Typically a category, date, or eyebrow label. |
| `headerClassName?` | `string` | — | Extra classes for the `header` element. |
| `icon?` | `ReactNode` | — | Icon node rendered on the left, before the inner content column. |
| `iconClassName?` | `string` | — | Extra classes for the icon wrapper. |
| `innerContentClassName?` | `string` | — | Extra classes for the inner column (the wrapper around `header`/title/`footer`). |
| `outline?` | `boolean` | `false` | Outline ring on the row. Default `false`. Effective value is `outline \|\| selected`, so a selected row always shows the ring. |
| `readOnly?` | `boolean` | — | Block clicks while keeping the row visually enabled. |
| `rounded?` | `boolean` | `true` | Default `true`. Forwarded to the underlying `Button`. |
| `selected?` | `boolean` | — | Marks this list row as selected. When `true`, forces `variant` to `'gradient'` and `outline` to `true` regardless of the props passed - used for the active row in a list. |
| `size?` | `ButtonSize` | `'lg'` | Default `'lg'` (vs Button's `'md'`) - list rows usually want more vertical space. |
| `titleClassName?` | `string` | — | Extra classes for the title row (the wrapper around `children`). |
| `variant?` | `SurfaceVariant` | `'transparent'` | Surface variant. Default `'transparent'` so rows blend into the list surface.<br>Overridden to `'gradient'` when `selected` is `true`. |

### ListItem

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | Row content. Non-interactive list row (use `ListButton` for clickable rows). |
| `className?` | `string` | — | Extra classes for the row root. |

### ListSeparator

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | Optional content rendered on the divider (rarely used). |
| `className?` | `string` | — | Extra classes for the separator root. |

### ListTitle

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | Title content (typically a short uppercase label). |
| `className?` | `string` | — | Extra classes for the title root. |
