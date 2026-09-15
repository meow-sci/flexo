---
title: "jsx-a11y/aria-proptypes"
rule: "jsx-a11y/aria-proptypes"
category: "Correctness"
version: "1.36.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/aria-proptypes.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces that elements do not use invalid ARIA state and property values.

### Why is this bad?

Using invalid ARIA state and property values can mislead screen readers and other assistive technologies.
It may cause the accessibility features of the website to fail, making it difficult for users with disabilities to use the site effectively.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<div aria-level="yes" />
<div aria-relevant="additions removalss" />
```

Examples of **correct** code for this rule:

```jsx
<div aria-label="foo" />
<div aria-labelledby="foo bar" />
<div aria-checked={false} />
<div aria-invalid="grammar" />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/aria-proptypes": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/aria-proptypes": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.36.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/aria-proptypes.md)
