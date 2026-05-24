---
title: "Textarea"
description: "Multi-line text field that auto-grows with its content."
links:
  doc: https://cladd.io/react/components/textarea/
  api: https://cladd.io/react/components/textarea/#api-reference
---

# Textarea

`Textarea` is the long-form companion to [`Input`](/react/components/input/) — same [`SurfaceCut`](/react/components/surface-cut/) chrome, same size scale, the same `prefix` / `suffix` / `icon` / validation slots, but built around a `contenteditable` `<div>` instead of a native `<textarea>`. That swap is deliberate: the field grows with its contents instead of needing a manual resize handle, and the editing surface can hold richer markup than plain text — useful when you want to layer formatting, mentions, or inline tags on top.

![Overview](https://cladd.io/screenshots/components/textarea/overview.png)

```tsx
<Textarea
  className="w-96"
  value={notes}
  onChange={setNotes}
  placeholder="What changed in this release?"
  infoMessage="Release notes"
/>
<Textarea
  className="w-96"
  value={bug}
  onChange={setBug}
  placeholder="Describe the bug"
  icon={<NoteIcon />}
  contentClassName="items-start"
  suffix={
    <Chip size="sm" color="orange" className="mt-2 mr-2">
      triage
    </Chip>
  }
/>
<Textarea
  className="w-96"
  value={feedback}
  onChange={setFeedback}
  placeholder="Tell us what you think…"
  valid={feedback.length === 0 || feedback.length >= 20}
  infoMessage="Markdown supported"
  errorMessage="At least 20 characters"
/>
```

## Usage

```tsx
import { Textarea } from '@cladd-ui/react';

<Textarea
  value={notes}
  onChange={setNotes}
  placeholder="What changed in this release?"
/>;
```

Like [`Input`](/react/components/input/), `Textarea` is controlled — pass `value` and an `onChange` handler that receives `(value, event)`. The string you pass in is synced into the editor's `innerText`, so newlines round-trip just like a native textarea would.

For richer use-cases (a Markdown editor, a mention combobox, a rich-text host on top of tiptap or Lexical), pass `updateContentOnChange={false}` so cladd stops syncing `value → innerText` after the initial render. The wrapper keeps providing the surface, focus ring, and slots; your editor owns the DOM inside and won't have its caret stomped on every keystroke.

## Examples

### Sizes

`size` accepts `sm`, `md`, `lg` (default), `xl`, `2xl`. The size doesn't lock the height — every step sets a `min-height` so the field always opens to a comfortable starting size, then grows downward as the user types. The font stays compact at every step (cladd's dense-but-not-crowded principle); the padding and minimum height are what change.

![Size](https://cladd.io/screenshots/components/textarea/size.png)

```tsx
<Textarea
  className="w-96"
  size={size}
  value={value}
  onChange={setValue}
  placeholder="What's on your mind?"
/>
```

### Auto-grow

Because the editor is a `contenteditable` `<div>` rather than a native `<textarea>`, the height tracks the content natively — no `rows` to guess at, no `ResizeObserver` to wire up, no `auto-grow` library. The field opens at its `size`-derived `min-height` and grows downward as the user types, then shrinks back when content is deleted. Set `inputClassName="max-h-..."` if you need an upper bound; otherwise let it bloom.

![Auto grow](https://cladd.io/screenshots/components/textarea/auto-grow.png)

```tsx
<Textarea
  className="w-96"
  value={value}
  onChange={setValue}
  placeholder="Start typing…"
/>
```

### Icon

`icon` renders an absolutely-positioned glyph on the left and shifts the editor padding to make room. With a multi-line field you almost always want to add `contentClassName="items-start"` so the icon — and any `prefix` / `suffix` — anchors to the top of the field instead of floating in the vertical middle of the content. Reach for an icon to mark a field as a note, a journal entry, a message; for an interactive trailing element (a status chip, a character counter) use `suffix` instead.

![Icon](https://cladd.io/screenshots/components/textarea/icon.png)

```tsx
<Textarea
  className="w-96"
  size={size}
  icon={<NoteIcon />}
  contentClassName="items-start"
  value={value}
  onChange={setValue}
  placeholder="Journal entry…"
/>
```

### Prefix and suffix

`prefix` and `suffix` render inside the surface, before and after the editor. The wrapper is `flex items-center` by default — fine for a single-line value, but with a tall multi-line editor that floats the slot in the middle of the column. Pass `contentClassName="items-start"` to anchor them to the top, then add a `mt-2` to align with the first line of text. They're the natural home for a character counter, a "Markdown supported" tag, or a status [`Chip`](/react/components/chip/).

![Prefix suffix](https://cladd.io/screenshots/components/textarea/prefix-suffix.png)

```tsx
<Textarea
  className="w-96"
  size={size}
  value={message}
  onChange={setMessage}
  placeholder="Broadcast a status update"
  contentClassName="items-start"
  prefix={
    <Chip size={size} color="brand" className="mt-2 ml-2">
      status
    </Chip>
  }
  inputClassName="pl-1"
  suffix={
    <span className="mt-2 mr-2 font-mono text-cladd-fg-softer">
      {message.length}/{limit}
    </span>
  }
/>
```

### Validation

Same model as [`Input`](/react/components/input/): set `valid={false}` to switch the focus ring to red and surface `errorMessage` as a floating chip that's always visible. `infoMessage` is the calmer counterpart — a floating hint that appears on focus and uses the field's accent `color`. Useful for a length requirement on a bug report, a "supports Markdown" reminder above a freeform field, or a max-length cap.

![Validation](https://cladd.io/screenshots/components/textarea/validation.png)

```tsx
<Textarea
  className="w-96"
  value={summary}
  onChange={setSummary}
  placeholder="Release summary"
  infoMessage="Shown on the changelog page"
/>
<Textarea
  className="w-96"
  value={bug}
  onChange={setBug}
  placeholder="Steps to reproduce"
  valid={bug.length >= 20}
  errorMessage="At least 20 characters — give us steps to repro"
  infoMessage="Markdown supported"
/>
```

### Disabled and read-only

`disabled` dims the field to 50% and removes `contenteditable` entirely. `readOnly` is the subtler one: the field stays at full opacity and the user can still select and copy the value (handy for displaying a longer generated note, a one-time message, or a locked release log) but typing is blocked and `infoMessage` is hidden.

![States](https://cladd.io/screenshots/components/textarea/states.png)

```tsx
<Textarea
  className="w-96"
  value={RELEASE_NOTES}
  onChange={() => {}}
  readOnly={readOnly}
  disabled={disabled}
  infoMessage="Release notes"
/>
```

### Playground

`size`, `color`, `rounded`, and `icon` compose like any other cladd control — pair `rounded` `xl` with `color="brand"` for a hero feedback field, or a compact `sm` Textarea inside a sidebar comment thread.

![Playground](https://cladd.io/screenshots/components/textarea/playground.png)

```tsx
<Textarea
  className="w-96"
  size={size}
  color={color}
  rounded={rounded}
  value={value}
  onChange={setValue}
  placeholder="What's on your mind?"
  icon={withIcon ? <NoteIcon /> : undefined}
  contentClassName={withIcon ? 'items-start' : undefined}
  infoMessage="Markdown supported"
/>
```

## API Reference

**Generics:** `C extends ElementType = 'div'`

**Inherits from:** [`SurfaceCutOwn`](/react/components/surface-cut-own/)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `as?` | `ElementType` | `'div'` | Polymorphic wrapper element. Defaults to `'div'`. The editable area itself is always a `contenteditable` `<div>`. |
| `className?` | `string` | — | Extra classes for the outer wrapper. |
| `color?` | `Color` | — | Accent color token. Drives the focus ring and `infoMessage` colors. Default: theme accent. |
| `contentClassName?` | `string` | — | Extra classes for the inner content row (where prefix/editor/suffix live). |
| `disabled?` | `boolean` | — | Visually dim the textarea and remove `contenteditable`. |
| `errorMessage?` | `ReactNode` | — | Floating error label. Always visible when `valid === false`. |
| `icon?` | `ReactNode` | — | Icon node rendered absolutely positioned on the left. |
| `infoMessage?` | `ReactNode` | — | Floating label shown above the editor on focus. Hidden when `valid === false` or `readOnly`. |
| `inputClassName?` | `string` | — | Extra classes for the editable `[contenteditable]` `<div>`. |
| `inputPadding?` | `string` | — | Reserved - currently not applied in the rendered output. |
| `onBlur?` | `(e: FocusEvent<HTMLDivElement>) => void` | — | Forwarded to the editable area - fires when it loses focus. |
| `onChange?` | `(value: string, event?: FormEvent<HTMLDivElement>) => void` | — | Fires on every input event. First arg is the new text, second is the raw event. |
| `onFocus?` | `(e: FocusEvent<HTMLDivElement>) => void` | — | Forwarded to the editable area - fires when it gains focus. |
| `onKeyDown?` | `(e: KeyboardEvent<HTMLDivElement>) => void` | — | Forwarded to the editable area - fires on key down. |
| `placeholder?` | `string` | — | Placeholder text shown when the editor is empty. |
| `placeholderClassName?` | `string` | — | Extra classes for the placeholder layer. |
| `prefix?` | `ReactNode` | — | Slot rendered before the editable area. |
| `readOnly?` | `boolean` | — | Make the textarea non-editable but still selectable. |
| `rounded?` | `boolean` | `false` | Apply pill-style corners. Default `false` - uses size-specific radii. |
| `size?` | `TextareaSize` | `'lg'` | Textarea size token. Drives min-height, padding, and font size. Default `'lg'`. |
| `suffix?` | `ReactNode` | — | Slot rendered after the editable area. |
| `updateContentOnChange?` | `boolean` | — | When `true` (default), syncs the editable `innerText` whenever `value` changes from the outside.<br>Set to `false` for performance-sensitive editors that manage their own DOM (e.g. rich-text editors) - otherwise external `value` updates would stomp on caret position and selection. |
| `valid?` | `boolean` | `true` | Validity state. Default `true`.<br>When `false`, switches the focus ring to red and shows `errorMessage`. |
| `value?` | `string` | — | Controlled value. Synced into the editable `innerText` on change (see `updateContentOnChange`). |
