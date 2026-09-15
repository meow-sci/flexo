---
title: "jsx-a11y/aria-props"
rule: "jsx-a11y/aria-props"
category: "Correctness"
version: "0.0.22"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/aria-props.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Enforces that elements do not use invalid ARIA attributes.

### Why is this bad?

Using invalid ARIA attributes can mislead screen readers and other assistive technologies.
It may cause the accessibility features of the website to fail, making it difficult
for users with disabilities to use the site effectively.

This rule includes fixes for some common typos.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<input aria-labeledby="address_label" />
```

Examples of **correct** code for this rule:

```jsx
<input aria-labelledby="address_label" />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/aria-props": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/aria-props": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.22.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/aria-props.md)
