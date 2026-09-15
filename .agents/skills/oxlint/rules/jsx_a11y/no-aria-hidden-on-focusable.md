---
title: "jsx-a11y/no-aria-hidden-on-focusable"
rule: "jsx-a11y/no-aria-hidden-on-focusable"
category: "Correctness"
version: "0.0.22"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-aria-hidden-on-focusable.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces that `aria-hidden="true"` is not set on focusable elements.

### Why is this bad?

`aria-hidden="true"` on focusable elements can lead to confusion or unexpected behavior for screen reader users.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<div aria-hidden="true" tabIndex="0" />
```

Examples of **correct** code for this rule:

```jsx
<div aria-hidden="true" />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/no-aria-hidden-on-focusable": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/no-aria-hidden-on-focusable": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.22.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-aria-hidden-on-focusable.md)
