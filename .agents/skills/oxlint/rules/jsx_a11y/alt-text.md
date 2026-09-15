---
title: "jsx-a11y/alt-text"
rule: "jsx-a11y/alt-text"
category: "Correctness"
version: "0.0.16"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/alt-text.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce that all elements that require alternative text have meaningful
information to relay back to the end user.

### Why is this bad?

Alternative text is a critical component of accessibility for screen
reader users, enabling them to understand the content and function of
an element. Missing or inadequate alt text makes content inaccessible
to users who rely on assistive technologies.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<img src="flower.jpg" />
<img src="flower.jpg" alt="" />
<object />
<area />
```

Examples of **correct** code for this rule:

```jsx
<img src="flower.jpg" alt="A close-up of a white daisy" />
<img src="decorative.jpg" alt="" role="presentation" />
<object aria-label="Interactive chart" />
<area alt="Navigation link" />
```

## Configuration

This rule accepts a configuration object with the following properties:

### area

type: `string[]`

default: `[]`

Custom components to check for alt text on `area` elements.

### img

type: `string[]`

default: `[]`

Custom components to check for alt text on `img` elements.

### input[type="image"]

type: `string[]`

default: `[]`

Custom components to check for alt text on `input[type="image"]` elements.

### object

type: `string[]`

default: `[]`

Custom components to check for alt text on `object` elements.

## How to use

```json
{
  "rules": {
    "jsx-a11y/alt-text": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/alt-text": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/alt-text.md)
