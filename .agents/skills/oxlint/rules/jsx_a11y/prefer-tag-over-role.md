---
title: "jsx-a11y/prefer-tag-over-role"
rule: "jsx-a11y/prefer-tag-over-role"
category: "Correctness"
version: "0.1.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/prefer-tag-over-role.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces using semantic HTML tags over `role` attribute.

### Why is this bad?

Using semantic HTML tags can improve accessibility and readability of the code.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<div role="button" />
```

Examples of **correct** code for this rule:

```jsx
<button />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/prefer-tag-over-role": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/prefer-tag-over-role": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/prefer-tag-over-role.md)
