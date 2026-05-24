---
title: "SectionTitle"
description: "Heading label for grouping content inside panels, popovers, and settings."
links:
  doc: https://cladd.io/react/components/section-title/
  api: https://cladd.io/react/components/section-title/#api-reference
---

# SectionTitle

`SectionTitle` is the small uppercase eyebrow label cladd uses to break a dense panel into named groups — the line that sits above a cluster of form fields, the heading on a popover section, the divider between unrelated rows in a settings sheet. It renders a `<div>` with cladd's tuned typography (`text-cladd-xs`, `font-medium`, `text-cladd-fg-soft`, `uppercase`, non-selectable) and a `flex items-end gap-4` layout so you can drop a count chip, a status badge, or an inline action next to the title without any extra wrapper.

It's intentionally minimal — no levels, no sizes, no variants. The point is consistency: every section header across a cladd app reads the same way, so the eye picks them out instantly in information-rich UIs.

![Overview](https://cladd.io/screenshots/components/section-title/overview.png)

```tsx
<Surface
  outline
  className="w-80 rounded-3xl"
  contentClassName="flex flex-col gap-8 p-4"
>
  <div className="flex flex-col gap-2">
    <SectionTitle>Project</SectionTitle>
    <div className="flex items-center justify-between">
      <span className="font-medium">acme-marketing</span>
      <Chip color="green">Live</Chip>
    </div>
    <p className="text-cladd-fg-soft">
      Landing pages, lifecycle emails, and the press kit microsite.
    </p>
  </div>
  <div className="flex flex-col gap-2">
    <SectionTitle>Owner</SectionTitle>
    <div className="flex items-center justify-between">
      <span>Anna Whittaker</span>
      <span className="font-mono text-cladd-fg-softer">anna@acme</span>
    </div>
  </div>
</Surface>
```

## Usage

```tsx
import { SectionTitle } from '@cladd-ui/react';

<SectionTitle>Notifications</SectionTitle>;
```

Drop it ahead of a group of rows, fields, or list items. Pair it with a [`Surface`](/react/components/surface/) for a panel layout, with a [`Popover`](/react/components/popover/) to label sections inside a dropdown, or with a stack of [`Input`](/react/components/input/) and [`Switch`](/react/components/switch/) controls to head a settings group.

The component is `flex items-end gap-4`, so anything you put alongside the title text — a [`Chip`](/react/components/chip/) count, a small inline action — lines up with the baseline of the label automatically. Push extras to the right with `ml-auto`.

## Examples

### Inside a popover

`SectionTitle` is the natural way to organize a multi-group popover — workspace metadata in one section, notification toggles in another, without falling back to ad-hoc headings or extra dividers. Add `contentClassName="p-4"` to [`Popover`](/react/components/popover/) to give the sections breathing room (the popover surface ships unpadded so [`List`](/react/components/list/)-style content can sit flush with the edge), then stack groups with a `flex flex-col gap-6` wrapper.

![In popover](https://cladd.io/screenshots/components/section-title/in-popover.png)

```tsx
<PopoverRoot open={open} onOpenChange={setOpen}>
  <PopoverTrigger>
    <Button>Workspace settings</Button>
  </PopoverTrigger>
  <Popover className="w-72" offset={8} contentClassName="p-4 text-sm">
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionTitle>Workspace</SectionTitle>
        <div className="flex items-center justify-between">
          <span className="font-medium">acme-marketing</span>
          <Chip color="brand">Pro</Chip>
        </div>
        <span className="text-cladd-fg-soft">
          8 members · 42 projects
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <SectionTitle>Notifications</SectionTitle>
        <label className="flex items-center justify-between gap-4">
          <span>Email updates</span>
          <Switch as="div" checked={notify} onChange={setNotify} />
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
    </div>
  </Popover>
</PopoverRoot>
```

### Grouped form fields

In a settings sheet, `SectionTitle` is what tells the eye where one group of fields ends and the next begins. The uppercase eyebrow reads as structural rather than as another field label, so it doesn't fight with the [`Input`](/react/components/input/) labels or [`Switch`](/react/components/switch/) rows below it. Wrap each group in a `flex flex-col gap-2` container and separate groups with the parent's `gap-8` — the rhythm stays predictable even as fields are added or removed.

![Form group](https://cladd.io/screenshots/components/section-title/form-group.png)

```tsx
<Surface
  outline
  className="w-96 rounded-3xl"
  contentClassName="flex flex-col gap-8 p-4"
>
  <div className="flex flex-col gap-2">
    <SectionTitle>General</SectionTitle>
    <Input
      value={name}
      onChange={setName}
      placeholder="Project name"
      size="lg"
    />
    <Input
      value={slug}
      onChange={setSlug}
      placeholder="URL slug"
      inputClassName="pl-1"
      prefix={
        <span className="ml-2 text-xs text-cladd-fg-softer">
          cladd.io/
        </span>
      }
      size="lg"
    />
  </div>
  <div className="flex flex-col gap-2">
    <SectionTitle>Publishing</SectionTitle>
    <Input
      value={domain}
      onChange={setDomain}
      placeholder="Custom domain"
      size="lg"
    />
    <label className="flex items-center justify-between gap-4 pt-2">
      <div className="flex flex-col">
        <span>Analytics</span>
        <span className="text-cladd-fg-soft">
          Track page views and referrers
        </span>
      </div>
      <Switch checked={analytics} onChange={setAnalytics} />
    </label>
    <label className="flex items-center justify-between gap-4 pt-2">
      <div className="flex flex-col">
        <span>Search indexing</span>
        <span className="text-cladd-fg-soft">
          Allow search engines to crawl
        </span>
      </div>
      <Switch checked={indexing} onChange={setIndexing} />
    </label>
  </div>
</Surface>
```

### Rich content surface

When a [`Surface`](/react/components/surface/) carries more than one kind of content — a header block, a quick-action row, an activity feed — `SectionTitle` is what holds the structure together. Each section gets a one-line label and the surface's own padding does the spacing. This is the cladd-app pattern: dense, multi-section panels that stay legible because the section headers are consistent and quiet.

![Rich surface](https://cladd.io/screenshots/components/section-title/rich-surface.png)

```tsx
<Surface
  outline
  className="w-[28rem] rounded-3xl"
  contentClassName="flex flex-col gap-8 p-4"
>
  <div className="flex flex-col gap-2">
    <SectionTitle>
      <span>Overview</span>
      <Chip color="green" className="ml-auto normal-case">
        Synced
      </Chip>
    </SectionTitle>
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-lg font-semibold">acme-marketing</span>
      <span className="font-mono text-cladd-fg-softer">v2.4.1</span>
    </div>
    <p className="text-cladd-fg-soft">
      Landing pages, lifecycle emails, and the press kit microsite. Last
      deploy 14 minutes ago.
    </p>
    <div className="flex flex-wrap gap-1 pt-1">
      <Chip color="brand">marketing</Chip>
      <Chip color="cyan">nextjs</Chip>
      <Chip color="purple">mdx</Chip>
    </div>
  </div>

  <div className="flex flex-col gap-2">
    <SectionTitle>
      <span>Recent activity</span>
      <button
        type="button"
        className="ml-auto cursor-pointer text-cladd-primary normal-case hover:underline"
      >
        View all
      </button>
    </SectionTitle>
    <List className="-mx-4">
      <ListItem>
        <span className="text-sm">Deployed v2.4.1</span>
        <span className="ml-auto font-mono text-cladd-fg-softer">
          14m
        </span>
      </ListItem>
      <ListSeparator />
      <ListItem>
        <span className="text-sm">Anna merged "lifecycle-emails"</span>
        <span className="ml-auto font-mono text-cladd-fg-softer">2h</span>
      </ListItem>
      <ListSeparator />
      <ListItem>
        <span className="text-sm">Press kit page published</span>
        <span className="ml-auto font-mono text-cladd-fg-softer">1d</span>
      </ListItem>
    </List>
  </div>
</Surface>
```

### End slot

Because the root is `flex items-end gap-4`, anything passed as a child sits inline with the title. Drop a [`Chip`](/react/components/chip/) count next to the label, or push an action to the right with `ml-auto`. The container's `items-end` alignment keeps the extras anchored to the baseline of the uppercase label — small chips and short text sit cleanly without per-element tweaking.

The title's `uppercase` cascades to children, so add `normal-case` on any nested element (a "View all" link, a status chip) that should render mixed-case.

![End slot](https://cladd.io/screenshots/components/section-title/end-slot.png)

```tsx
<Surface
  outline
  className="w-96 rounded-3xl"
  contentClassName="flex flex-col gap-2 p-4"
>
  <SectionTitle>
    <span>Members</span>
    <Chip color="brand">8</Chip>
    <button
      type="button"
      className="ml-auto cursor-pointer text-cladd-primary normal-case hover:underline"
    >
      Invite
    </button>
  </SectionTitle>
  <div className="mt-4 flex items-center justify-between">
    <span>Anna Whittaker</span>
    <Chip color="brand">Owner</Chip>
  </div>
  <div className="flex items-center justify-between">
    <span>Jamie Park</span>
    <Chip>Editor</Chip>
  </div>
  <div className="flex items-center justify-between">
    <span>Riley Chen</span>
    <Chip>Viewer</Chip>
  </div>
</Surface>
```

## API Reference

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | Title content (typically a short uppercase section label). |
| `className?` | `string` | — | Extra classes for the section title root. |
