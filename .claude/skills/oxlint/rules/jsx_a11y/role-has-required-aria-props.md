---
title: "jsx-a11y/role-has-required-aria-props"
rule: "jsx-a11y/role-has-required-aria-props"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/role-has-required-aria-props.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces that elements with ARIA roles must have all required attributes
for that role.

### Why is this bad?

Certain ARIA roles require specific attributes to express necessary
semantics for assistive technology.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<div role="checkbox" />
```

Examples of **correct** code for this rule:

```jsx
<div role="checkbox" aria-checked="false" />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/role-has-required-aria-props": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/role-has-required-aria-props": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/role-has-required-aria-props.md)
