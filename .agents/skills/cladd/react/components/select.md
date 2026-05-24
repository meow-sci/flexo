---
title: "Select"
description: "Dropdown for picking one or many options from a list."
links:
  doc: https://cladd.io/react/components/select/
  api: https://cladd.io/react/components/select/#api-reference
---

# Select

`Select` is the application-grade dropdown — a [`Button`](/react/components/button/) trigger that opens a [`Popover`](/react/components/popover/) full of options. It covers the boring app-shell cases (one-of-many enum pickers, multi-select labels, filterable country lists) and the harder ones too — object options keyed by `id`, custom option rendering with subtext and per-row indicator colours, numeric quick-pick hints, sectioned lists, controlled popovers anchored to your own trigger.

![Overview](https://cladd.io/screenshots/components/select/overview.png)

```tsx
<Select
  className="w-64"
  title="Default view"
  options={VIEWS}
  value={view}
  onChange={(v) => setView(v as string)}
  icon={<NoteIcon />}
/>

<Select
  className="w-64"
  title="Assignee"
  options={PEOPLE}
  value={assigneeId}
  getOptionValue={(p) => p.id}
  onChange={(v) => setAssigneeId(v as string)}
  renderOption={({ value }) => value.name}
  renderOptionInfo={({ value }) => value.role}
  optionIndicatorColor={({ value }) => value.color}
  color="brand"
  icon={
    <span
      className={`block size-2 shrink-0 rounded-full bg-cladd-primary cladd-color-${assignee?.color}`}
    />
  }
>
  {assignee?.name}
</Select>

<Select
  className="w-64"
  multiple
  title="Labels"
  options={['Bug', 'Feature', 'Chore', 'Frontend', 'Backend', 'Docs']}
  value={labels}
  onChange={(v) => setLabels(v as string[])}
  placeholder="No labels"
  color="purple"
  multiline
>
  {labels.length ? (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <Chip key={l}>{l}</Chip>
      ))}
    </span>
  ) : (
    'No labels'
  )}
</Select>
```

## Usage

```tsx
import { Select } from '@cladd-ui/react';

<Select
  title="Priority"
  options={['Low', 'Medium', 'High']}
  value={priority}
  onChange={(v) => setPriority(v)}
/>;
```

`Select` is controlled — pass `value` plus an `onChange` handler. In single-select mode the handler receives the key (`V`); in [`multiple`](#multi-select) mode it receives an array (`V[]`). Options themselves (`T`) can be any shape — strings (the default, with `V = T`) or objects with `getOptionValue` to extract a stable key (see [object options](#object-options)).

## Examples

### Sizes

`size` runs the standard `2xs → 2xl` scale shared with [`Button`](/react/components/button/), [`Chip`](/react/components/chip/), and the rest of the size-aware controls — pass the same token you'd use on a sibling button and the select sits at the matching height. The popover, options list, and keyboard-hint glyphs are independent: they don't scale with the trigger.

![Size](https://cladd.io/screenshots/components/select/size.png)

```tsx
<Select
  className="w-64"
  size={size}
  options={PRIORITIES}
  value={value}
  onChange={(v) => setValue(v as string)}
  title="Priority"
/>
```

### Colors

`color` accents the trigger button (forwarded to [`Button.color`](/react/components/button/)). `indicatorColor` sets the default colour for the per-option [`Radio`](/react/components/radio/) (or [`Checkbox`](/react/components/checkbox/) in `multiple` mode) — usually you want both to match. To colour individual options differently — a status badge whose hue depends on the value — use `optionIndicatorColor`, demoed in the [custom rendering](#custom-option-rendering) example.

![Color](https://cladd.io/screenshots/components/select/color.png)

```tsx
<Select
  className="w-64"
  color={color}
  indicatorColor={color}
  options={VIEWS}
  value={value}
  onChange={(v) => setValue(v as string)}
  title="Default view"
/>
```

### Surface style

`surface` picks the trigger style. Default `'surface'` reads as a raised button — the right call when the select is a primary action in a toolbar or form. `'cut'` makes the trigger an inset/recessed [`SurfaceCut`](/react/components/surface-cut/) — pairs well with [`Input`](/react/components/input/) and [`Textarea`](/react/components/textarea/) in a form, so the row reads as a single recessed field stack.

![Surface](https://cladd.io/screenshots/components/select/surface.png)

```tsx
<Select
  className="w-64"
  options={PRIORITIES}
  value={a}
  onChange={(v) => setA(v as string)}
  title="Priority"
/>
<Select
  className="w-64"
  surface="cut"
  options={PRIORITIES}
  value={b}
  onChange={(v) => setB(v as string)}
  title="Priority"
/>
```

### Multi-select

Set `multiple` to flip the per-option indicator from [`Radio`](/react/components/radio/) to [`Checkbox`](/react/components/checkbox/) and make `onChange` emit a `T[]` array. The popover stays open between picks (`closeOnSelect` has no effect in multi-mode), so users can rapid-fire several options without re-opening. `String(value)` won't render an array sensibly, so pass `children` to render the value display yourself — a row of [`Chip`](/react/components/chip/)s is the canonical pattern.

![Multiple](https://cladd.io/screenshots/components/select/multiple.png)

```tsx
<Select
  className="w-72"
  multiple
  title="Labels"
  options={[
    'Bug',
    'Feature',
    'Chore',
    'Frontend',
    'Backend',
    'Docs',
    'Design',
    'Infra',
  ]}
  value={labels}
  onChange={(v) => setLabels(v as string[])}
  placeholder="No labels"
  color="brand"
  indicatorColor="brand"
  multiline
>
  {labels.length ? (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <Chip key={l}>{l}</Chip>
      ))}
    </span>
  ) : (
    'No labels'
  )}
</Select>
```

### Search

Set `search` to mount a [`SearchField`](/react/components/search-field/) at the top of the popover, and pair it with `onSearch(query) => T[]` to do the filtering — `Select` doesn't carry any internal filter state, so the matching logic stays with you (fuzzy match, server-side lookup, whatever). `searchFocus` auto-focuses the input when the popover opens (skipped on iOS/Android to avoid the soft keyboard popping up). Pair with `keyboardHints={false}` so digits can be typed into the search field without selecting options.

![Search](https://cladd.io/screenshots/components/select/search.png)

```tsx
<Select
  className="w-72"
  title="Country"
  options={COUNTRIES}
  value={country}
  onChange={(v) => setCountry(v as string)}
  search
  searchFocus
  searchPlaceholder="Search countries"
  keyboardHints={false}
  popoverClassName="w-64 max-h-80"
  onSearch={(q) =>
    COUNTRIES.filter((c) => c.toLowerCase().includes(q.toLowerCase()))
  }
/>
```

### Keyboard hints

`keyboardHints` (default `true`) shows numeric quick-pick hints next to each option and binds `0`–`9` to select them. Two layouts:

- **Straight ordering** (default) — `1, 2, 3, …, 9, 0` for the tenth option.
- **Semantic ordering** — set `noneOptionValue` to the value of your "none/initial" option (e.g. `'None'`, `null`, `0`). That option gets the `0` key and the rest get `1`–`9` in order, so the user can always thumb-pick "clear" with `0`.

Numeric selection is desktop-only — the hints aren't shown on touch devices, and the keydown handler ignores digit keys while the search input is focused (so typing `42` into a country search does the obvious thing). `↑` / `↓` / `Tab` walk the list, `Enter` / `Space` confirms.

![Keyboard hints](https://cladd.io/screenshots/components/select/keyboard-hints.png)

```tsx
<Select
  className="w-64"
  title="Priority"
  options={PRIORITIES}
  value={priority}
  onChange={(v) => setPriority(v as string)}
  noneOptionValue="None"
  optionIndicatorColor={({ value }) => PRIORITY_COLOR[value]}
  color={priority === 'None' ? 'neutral' : PRIORITY_COLOR[priority]}
/>
<p className="max-w-xs text-center text-cladd-fg-softer">
  Open the popover and press <kbd>0</kbd>–<kbd>4</kbd> to select.
  <br />
  <kbd>↑</kbd> / <kbd>↓</kbd> / <kbd>Tab</kbd> walk the list.
</p>
```

### Object options

`Select<T, V = T>` takes an option type `T` and a key type `V`. Default `V = T` covers string options. For object options, point `getOptionValue` at the field that identifies the row (typically `id`) and store **that key** in state, not the full object — `value`, `onChange`, and `noneOptionValue` all speak in `V`. The render slots (`renderOption`, `renderOptionInfo`, `optionIndicatorColor`, `renderBeforeOption`, `isOptionDisabled`) still receive the full `T`, so you can render names, roles, colours, and anything else off the option.

The trigger button defaults to `String(value)`, which would render the bare key — pass `children` to render the current selection however you like (an avatar, a colour swatch, a [`Chip`](/react/components/chip/) row).

![Object options](https://cladd.io/screenshots/components/select/object-options.png)

```tsx
<Select
  className="w-72"
  title="Assignee"
  options={PEOPLE}
  value={assigneeId}
  getOptionValue={(p) => p.id}
  onChange={(v) => setAssigneeId(v as string)}
  renderOption={({ value }) => value.name}
  renderOptionInfo={({ value }) => value.role}
  optionIndicatorColor={({ value }) => value.color}
  icon={
    <span
      className={`block size-3 rounded-full bg-cladd-primary cladd-color-${assignee?.color}`}
    />
  }
>
  {assignee?.name ?? 'Unassigned'}
</Select>
```

### Custom option rendering

`renderOption`, `renderOptionInfo`, and `optionIndicatorColor` all accept the same `{ value, index, selected }` params — use them together to build status pickers, member pickers, and other rich rows. The `selected` flag is the same boolean the indicator uses, so you can mirror its treatment in the label too if you want (e.g. bolden the selected row).

![Custom render](https://cladd.io/screenshots/components/select/custom-render.png)

```tsx
<Select
  className="w-64"
  title="Priority"
  options={PRIORITIES}
  value={priority}
  onChange={(v) => setPriority(v as string)}
  noneOptionValue="None"
  renderOption={({ value }) => (
    <span className="flex items-center gap-2">
      <span
        className={`size-2 rounded-full bg-cladd-primary cladd-color-${PRIORITY_COLOR[value]}`}
      />
      {value}
    </span>
  )}
  optionIndicatorColor={({ value }) => PRIORITY_COLOR[value]}
  color={priority === 'None' ? 'neutral' : PRIORITY_COLOR[priority]}
>
  <span className="flex items-center gap-2">
    <span
      className={`size-2 rounded-full bg-cladd-primary cladd-color-${PRIORITY_COLOR[priority]}`}
    />
    {priority}
  </span>
</Select>
```

### Sections and slots

The popover has three extension points around the option list:

- `beforeOptions` / `afterOptions` — slot nodes rendered above and below the entire list, inside the popover. Use for help text, a "create new…" footer, etc.
- `renderBeforeOption` / `renderAfterOption` — per-option slots. Render a section header before the first option of each group to turn a flat list into a sectioned one (no separate group config required — read the group off the option itself).

![Sections](https://cladd.io/screenshots/components/select/sections.png)

```tsx
<Select
  className="w-64"
  options={GROUPED_VIEWS}
  value={viewId}
  getOptionValue={(v) => v.id}
  onChange={(v) => setViewId(v as string)}
  renderOption={({ value }) => value.label}
  keyboardHints={false}
  renderBeforeOption={(value, index) => {
    const prev = index > 0 ? GROUPED_VIEWS[index - 1] : null;
    if (prev && prev.group === value.group) return null;
    return (
      <div className="px-2 pt-4 pb-1 text-cladd-xs font-medium tracking-wide text-cladd-fg-softer uppercase">
        {value.group}
      </div>
    );
  }}
  beforeOptions={
    <div className="px-4 pt-4 text-sm text-cladd-fg-soft">
      Pick where this task should land.
    </div>
  }
  afterOptions={
    <div className="border-t border-cladd-outline p-2">
      <Button
        variant="transparent"
        outline={false}
        className="w-full justify-start"
        contentClassName="gap-2"
        rounded
      >
        <PlusIcon /> New view…
      </Button>
    </div>
  }
>
  {current?.label}
</Select>
```

### Disabled and read-only

`disabled` dims the trigger and prevents the popover from opening — the canonical "not available right now". `readOnly` keeps the trigger at full opacity and still shows the current value, but blocks the popover from opening — read as "locked, but the value is real" (an enforced setting, a value that's correct but not yours to change right now).

![States](https://cladd.io/screenshots/components/select/states.png)

```tsx
<div className="flex flex-col items-center gap-2">
  <span className="font-mono text-cladd-fg-softer">disabled</span>
  <Select
    className="w-64"
    disabled
    options={PRIORITIES}
    value="Medium"
    icon={<NoteIcon />}
  />
</div>
<div className="flex flex-col items-center gap-2">
  <span className="font-mono text-cladd-fg-softer">readOnly</span>
  <Select
    className="w-64"
    readOnly
    options={PRIORITIES}
    value="High"
    color="orange"
    icon={<CheckIcon />}
  />
</div>
```

### Playground

Most of the props compose freely — `multiple` and `search` are independent of each other, `keyboardHints` works in both single and multi modes, sizes run the full `2xs → 2xl` scale at any colour.

![Playground](https://cladd.io/screenshots/components/select/playground.png)

```tsx
<Select
  className="w-64"
  size={size}
  color={color}
  rounded={rounded}
  multiple={multiple}
  search={search}
  keyboardHints={keyboardHints}
  title="Fruit"
  options={FRUITS}
  value={multiple ? many : single}
  onChange={(v) =>
    multiple ? setMany(v as string[]) : setSingle(v as string)
  }
  onSearch={(q) =>
    FRUITS.filter((f) => f.toLowerCase().includes(q.toLowerCase()))
  }
  placeholder="Pick a fruit"
>
  {multiple
    ? many.length
      ? many.join(', ')
      : 'Pick a few'
    : single || 'Pick one'}
</Select>
```

## API Reference

**Generics:** `T = string, V = T`

**Inherits from:** [`Button`](/react/components/button/)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `afterOptions?` | `ReactNode` | — | Slot rendered inside the popover, **below** the option list. |
| `anchorRef?` | `React.RefObject<HTMLElement \| null>` | — | External anchor ref. When provided, the trigger button is **not rendered** - useful when the popover should anchor to an existing element controlled by the caller (the caller is then responsible for the trigger and `popoverState` wiring). |
| `beforeOptions?` | `ReactNode` | — | Slot rendered inside the popover, **above** the option list (after title/search field). |
| `children?` | `ReactNode` | — | Custom node rendered inside the trigger button in place of `String(value) \|\| placeholder`.<br>Use to render a richer value display (e.g. with icons or formatting). |
| `className?` | `string` | — | Extra classes for the trigger button. |
| `closeOnSelect?` | `boolean` | `true` | Close the popover after a single-select pick. Default `true`. Has no effect when `multiple`. |
| `color?` | `Color` | — | Accent color for the trigger button. Forwarded to `Button.color`. |
| `contentClassName?` | `string` | — | Extra classes for the trigger button's inner content row. |
| `disabled?` | `boolean` | — | Visually dim the trigger and prevent the popover from opening. |
| `dropdownIcon?` | `boolean` | `true` | Show the chevron-down indicator on the right of the trigger. Default `true`. |
| `getOptionValue?` | `(option: T) => V` | — | Extracts the comparable key `V` from each option. Default: identity (`V = T`).<br>Required when options are objects and `value` should be a key (e.g. `id`)<br>rather than a full option reference. |
| `icon?` | `ReactNode` | — | Icon node rendered inside the trigger button. |
| `indicatorColor?` | `Color` | — | Default color for the per-option indicator (Radio/Checkbox). Overridden per-option by `optionIndicatorColor`. |
| `isChecked?` | `(value: T) => boolean` | — | Custom "is this option selected?" predicate - overrides the built-in equality check. |
| `isOptionDisabled?` | `(value: T) => boolean` | — | Predicate that disables individual options - dims them and prevents selection. |
| `keyboardHints?` | `boolean` | `true` | Show numeric quick-pick hints (0–9) next to options, and bind `0`–`9` keys to select them.<br>Default `true`. See `noneOptionValue` for how the digits map to options. |
| `keyboardHintsClassName?` | `string` | — | Extra classes for the per-option `Shortcut` hint's key element. |
| `keyboardHintsOutline?` | `boolean` | `false` | `outline` forwarded to the per-option `Shortcut` hint. Default `false`. |
| `keyboardHintsSize?` | `ShortcutSize` | `'md'` | `size` forwarded to the per-option `Shortcut` hint. Default `'md'`. |
| `keyboardHintsVariant?` | `SurfaceVariant` | `'transparent'` | `variant` forwarded to the per-option `Shortcut` hint. Default `'transparent'`. |
| `multiline?` | `boolean` | — | Forwarded to the trigger `Button` - allows wrapping the value across multiple lines. |
| `multiple?` | `boolean` | — | Multi-select mode - uses `Checkbox` instead of `Radio` and emits `T[]` to `onChange`. |
| `noneOptionValue?` | `V` | — | Value of the "none/initial" option that should be mapped to the 0 key.<br> If set, this option gets hint "0" and remaining options get 1-9 in order.<br> If not set, straight ordering: 1, 2, 3, ..., 9, 0 (for 10th). |
| `onChange?` | `(value: V \| V[]) => void` | — | Fires after a selection. In single-select mode receives `V`; in `multiple` receives `V[]`. |
| `onClick?` | `(e: MouseEvent) => void` | — | Fires when the trigger button is clicked (before the popover state toggles). |
| `onPopoverState?` | `(state: boolean) => void` | — | Fires whenever the popover open state changes. Acts as the controlled setter when `popoverState` is provided, and as an observer otherwise. |
| `onSearch?` | `(query: string) => T[]` | — | Filter callback invoked with the current query - return the filtered list of options.<br>The Select does not maintain any internal filter state; callers control matching. |
| `optionIndicatorColor?` | `(params: SelectOptionRenderParams<T>) => Color \| undefined` | — | Per-option indicator color. Return `undefined` to fall back to `indicatorColor`. |
| `options?` | `T[]` | — | All available options. Compared against `value` via `getOptionValue` (default: identity). |
| `outline?` | `boolean` | — | Render the trigger button's surface outline ring. Forwarded to `Button.outline`. |
| `placeholder?` | `ReactNode` | — | Placeholder node shown in the trigger when `value` is empty and no `children` are provided. |
| `placeholderClassName?` | `string` | — | Extra classes applied to the value/placeholder container inside the trigger. |
| `popoverClassName?` | `string` | `'w-auto min-w-[160px]'` | Default `'w-auto min-w-[160px]'`. |
| `popoverColor?` | `Color` | — | Accent color for the popover. Forwarded to `Popover.color`. |
| `popoverOffset?` | `PopoverOffset` | `['-50%', 4]` | Default `['-50%', 4]` - half-width inward shift on the cross axis, 4px main-axis gap. |
| `popoverPosition?` | `PopoverPosition` | `'bottom-end'` | Default `'bottom-end'`. |
| `popoverState?` | `boolean` | — | Controlled popover open state. Pair with `onPopoverState`. |
| `popoverSurfaceLevel?` | `number \| string` | — | Surface level for the popover.<br>Default same as Popover's `surfaceLevel` prop. |
| `readOnly?` | `boolean` | — | Show the trigger with the current value but block opening the popover. |
| `renderAfterOption?` | `(value: T, index: number) => ReactNode` | — | Slot rendered below each option. |
| `renderBeforeOption?` | `(value: T, index: number) => ReactNode` | — | Slot rendered above each option (e.g. group header before the first item in a section). |
| `renderOption?` | `(params: SelectOptionRenderParams<T>) => ReactNode` | `String(value)` | Custom option label renderer. Default: `String(value)`. |
| `renderOptionInfo?` | `(params: SelectOptionRenderParams<T>) => ReactNode` | — | Subtext rendered under the option label. |
| `reverse?` | `boolean` | — | Reverse the visual order of `icon` ↔ value inside the trigger button. |
| `rounded?` | `boolean` | — | Pill-style trigger button. Forwarded to `Button.rounded`. |
| `scrollToSelected?` | `boolean` | — | Scroll the popover so the currently selected option is centered when it opens. |
| `search?` | `boolean` | — | Render a search bar at the top of the popover. Pair with `onSearch` to filter options. |
| `searchFocus?` | `boolean` | — | Auto-focus the search input when the popover opens (skipped on iOS/Android to avoid keyboard popup). |
| `searchNotFound?` | `string` | `'Nothing found'` | Empty-state text. Default `'Nothing found'`. |
| `searchPlaceholder?` | `string` | `'Search'` | Default `'Search'`. |
| `size?` | `ButtonSize` | — | Trigger button size. Forwarded to `Button.size`. |
| `surface?` | `'surface' \| 'cut'` | — | Trigger button surface type, forwarded to the underlying `Button.surface`: `'surface'` (default) for a regular button, `'cut'` for an inset/recessed look. |
| `title?` | `string` | — | Title shown at the top of the popover (above the search bar, if any). |
| `value?` | `V \| V[]` | — | Selected value (single-select) or array of selected values (when `multiple`).<br>Always the **key** type `V` — not the full option `T`. When options are<br>objects and `getOptionValue` extracts a key (e.g. `id`), store that key<br>in state, not the object itself. |
| `valueClassName?` | `string` | — | Extra classes for the value display inside the trigger button. |
