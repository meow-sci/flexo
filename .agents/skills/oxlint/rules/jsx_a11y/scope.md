---
title: "jsx-a11y/scope"
rule: "jsx-a11y/scope"
category: "Correctness"
version: "0.0.19"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/scope.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

The scope prop should be used only on `<th>` elements.

### Why is this bad?

The scope attribute makes table navigation much easier for screen reader users, provided that it is used correctly.
Incorrectly used, scope can make table navigation much harder and less efficient.
A screen reader operates under the assumption that a table has a header and that this header specifies a scope. Because of the way screen readers function, having an accurate header makes viewing a table far more accessible and more efficient for people who use the device.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<div scope />
```

Examples of **correct** code for this rule:

```jsx
<th scope="col" />
<th scope={scope} />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/scope": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/scope": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/scope.md)
