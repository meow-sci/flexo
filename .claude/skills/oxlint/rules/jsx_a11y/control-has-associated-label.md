---
title: "jsx-a11y/control-has-associated-label"
rule: "jsx-a11y/control-has-associated-label"
category: "Correctness"
version: "1.65.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/control-has-associated-label.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce that a control (an interactive element) has a text label.

### Why is this bad?

An interactive element (such as a `<button>`) without an accessible
text label makes it difficult or impossible for users of assistive
technologies to understand the purpose of the control.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<button />
<input type="text" />
<a href="/path" />
<th />
<div role="button" />
<div role="checkbox" />
```

Examples of **correct** code for this rule:

```jsx
<button>Save</button>
<button aria-label="Save" />
<label>Name <input type="text" /></label>
<a href="/path">Learn more</a>
<th>Column Header</th>
<div role="button">Submit</div>
<div role="checkbox" aria-labelledby="label_id" />
```

## Configuration

This rule accepts a configuration object with the following properties:

### controlComponents

type: `string[]`

default: `[]`

Custom JSX components to be treated as interactive controls.

### depth

type: `integer`

default: `2`

Maximum depth to search for an accessible label within the element.
Defaults to `2`.

### ignoreElements

type: `string[]`

default: `[]`

Elements to ignore (in addition to the default ignore list).
Defaults to `[]`.

### ignoreRoles

type: `string[]`

default: `[]`

Interactive roles to ignore.
Defaults to `[]`.

### labelAttributes

type: `string[]`

default: `[]`

Additional attributes to check for accessible label text.

## How to use

```json
{
  "rules": {
    "jsx-a11y/control-has-associated-label": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/control-has-associated-label": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.65.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/control-has-associated-label.md)
