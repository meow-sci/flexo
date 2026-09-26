---
title: "jsx-a11y/aria-unsupported-elements"
rule: "jsx-a11y/aria-unsupported-elements"
category: "Correctness"
version: "0.1.1"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/aria-unsupported-elements.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces that reserved DOM elements do not contain ARIA roles, states,
or properties.

### Why is this bad?

Certain reserved DOM elements do not support ARIA roles, states and
properties. This is often because they are not visible, for example
`meta`, `html`, `script`, `style`. Adding ARIA attributes to these
elements is meaningless and can create confusion for screen readers.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<meta charset="UTF-8" aria-hidden="false" />
```

Examples of **correct** code for this rule:

```jsx
<meta charset="UTF-8" />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/aria-unsupported-elements": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/aria-unsupported-elements": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/aria-unsupported-elements.md)
