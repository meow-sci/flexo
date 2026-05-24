---
title: "SearchField"
description: "Search bar for filtering lists, menus, and option sheets."
links:
  doc: https://cladd.io/react/components/search-field/
  api: https://cladd.io/react/components/search-field/#api-reference
---

# SearchField

`SearchField` is a thin wrapper around [`Input`](/react/components/input/) that bakes in the search-field conventions: a left-aligned search glyph, a pill shape, an inline clear button that fades out when the query is empty, and an `onClear` that resets the value for you. Reach for it as a floating pill inside a [`Popover`](/react/components/popover/), [`List`](/react/components/list/), or command palette — or wrap it in a sticky [`Surface`](/react/components/surface/) to pin it as a header bar above a scrolling list.

![Overview](https://cladd.io/screenshots/components/search-field/overview.png)

```tsx
<Surface outline className="w-72 rounded-3xl">
  <div className="max-h-72 overflow-auto">
    <Surface
      className="sticky top-0 z-20 rounded-t-cladd-popover"
      contentClassName="p-1.5"
      outline
    >
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search projects"
      />
    </Surface>
    <List>
      {filtered.length === 0 ? (
        <ListItem className="text-cladd-fg-softer">No matches</ListItem>
      ) : (
        filtered.map((p) => (
          <ListButton key={p} icon={<NoteIcon />}>
            {p}
          </ListButton>
        ))
      )}
    </List>
  </div>
</Surface>
```

## Usage

```tsx
import { List, ListButton, SearchField } from '@cladd-ui/react';

const [query, setQuery] = useState('');

<SearchField value={query} onChange={setQuery} placeholder="Search projects" />;
```

`SearchField` is controlled — pass `value` and an `onChange` handler. The handler also fires with `''` when the user presses the inline clear button, so you don't need a separate `onClear`. Everything else is plain [`Input`](/react/components/input/) — every `InputProps` prop (`size`, `color`, `rounded`, `clearButton`, `prefix`, `suffix`, …) passes straight through, with the search-field defaults applied (`size="lg"`, `rounded`, `clearButton`, `placeholder="Search"`, and the search glyph as the leading `icon`).

For the pinned header-bar layout, wrap the field in a sticky [`Surface`](/react/components/surface/) yourself:

```tsx
<Surface outline className="w-72 rounded-3xl">
  <Surface
    className="sticky top-0 z-20 rounded-t-cladd-popover"
    contentClassName="p-1.5"
    outline
  >
    <SearchField value={query} onChange={setQuery} />
  </Surface>
  <List>{/* …filtered rows… */}</List>
</Surface>
```

## Examples

### Sizes

`size` accepts `sm`, `md`, `lg` (default), `xl`, `2xl` — the same scale as [`Input`](/react/components/input/), [`Button`](/react/components/button/), and the rest of the form controls. Match the field's `size` to the rows of the [`List`](/react/components/list/) underneath so they read as one stack: a `sm` filter for a dense sidebar, an `xl` field for a hero command palette.

![Size](https://cladd.io/screenshots/components/search-field/size.png)

```tsx
<Surface outline className="w-80 rounded-3xl">
  <Surface
    className="sticky top-0 z-20 rounded-t-cladd-popover"
    contentClassName="p-1.5"
    outline
  >
    <SearchField
      size={size}
      value={query}
      onChange={setQuery}
      placeholder="Search projects"
    />
  </Surface>
  <List>
    {PROJECTS.filter((p) => matches(query, p))
      .slice(0, 3)
      .map((p) => (
        <ListButton key={p} icon={<NoteIcon />}>
          {p}
        </ListButton>
      ))}
  </List>
</Surface>
```

### Inside a popover

Render `SearchField` directly inside a [`Popover`](/react/components/popover/) or [`List`](/react/components/list/) to get a floating pill that reads as one row among many — useful below a [`SectionTitle`](/react/components/section-title/), between [`ListSeparator`](/react/components/list/)s, or as the first row of an action menu. Add horizontal margins (`mx-2`) so it doesn't bleed into the popover edge; that's the pattern [`Select`](/react/components/select/) uses for its built-in search.

![Inset](https://cladd.io/screenshots/components/search-field/inset.png)

```tsx
<PopoverRoot>
  <PopoverTrigger>
    <Button>Run command</Button>
  </PopoverTrigger>
  <Popover className="w-64" offset={8} closeOnBackdropClick={false}>
    <SectionTitle className="px-4 pt-4">Commands</SectionTitle>
    <SearchField
      value={query}
      onChange={setQuery}
      placeholder="Filter commands"
      className="mx-2 mt-2 w-auto"
    />
    <List>
      {filtered.length === 0 ? (
        <ListItem className="text-cladd-fg-softer">No matches</ListItem>
      ) : (
        filtered.map((c) => (
          <ListButton
            key={c.id}
            after={
              <span className="font-mono text-cladd-fg-softer">
                {c.kbd}
              </span>
            }
          >
            {c.label}
          </ListButton>
        ))
      )}
    </List>
  </Popover>
</PopoverRoot>
```

### Playground

`size` is the main knob. Toggle the layout switch to see the two composition patterns side-by-side: the floating pill on its own (drop it anywhere) versus a sticky [`Surface`](/react/components/surface/) wrapper that pins it as a header above a scrolling list (`rounded-t-cladd-popover` to align with the rounded parent surface).

![Playground](https://cladd.io/screenshots/components/search-field/playground.png)

```tsx
<Surface outline className="w-72 rounded-3xl">
  {inset && <SectionTitle className="px-4 pt-4">Search</SectionTitle>}
  {inset ? (
    <SearchField
      size={size}
      value={query}
      onChange={setQuery}
      placeholder="Search projects"
      className={'mx-2 mt-2 w-auto'}
    />
  ) : (
    <Surface
      className="sticky top-0 z-20 rounded-t-cladd-popover"
      contentClassName="p-1.5"
      outline
    >
      <SearchField
        size={size}
        value={query}
        onChange={setQuery}
        placeholder="Search projects"
      />
    </Surface>
  )}

  <List>
    {filtered.slice(0, 4).map((p) => (
      <ListButton key={p} icon={<EnvelopeIcon />}>
        {p}
      </ListButton>
    ))}
    {filtered.length === 0 && (
      <ListItem className="text-cladd-fg-softer">No matches</ListItem>
    )}
  </List>
</Surface>
```

## API Reference

**Inherits from:** [`Input`](/react/components/input/)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `onChange?` | `(value: string, event?: ChangeEvent<HTMLInputElement>) => void` | — | Fires on every keystroke. Also fires with `''` when the clear button is pressed. |
