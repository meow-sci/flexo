---
title: "jsx-a11y/tabindex-no-positive"
rule: "jsx-a11y/tabindex-no-positive"
category: "Correctness"
version: "0.0.21"
default: false
type_aware: false
fix: "fixable_dangerous_suggestion"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/tabindex-no-positive.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_dangerous_suggestion |
| Type-aware | no |


### What it does

Enforces that positive values for the `tabIndex` attribute are not used
in JSX.

### Why is this bad?

Using `tabIndex` values greater than `0` can make navigation and
interaction difficult for keyboard and assistive technology users,
disrupting the logical order of content.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<span tabIndex="1">foo</span>
```

Examples of **correct** code for this rule:

```jsx
<span tabIndex="0">foo</span>
<span tabIndex="-1">bar</span>
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/tabindex-no-positive": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/tabindex-no-positive": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.21.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/tabindex-no-positive.md)
