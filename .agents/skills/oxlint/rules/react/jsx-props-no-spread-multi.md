---
title: "react/jsx-props-no-spread-multi"
rule: "react/jsx-props-no-spread-multi"
category: "Correctness"
version: "0.7.2"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-props-no-spread-multi.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces that any unique expression is only spread once.

### Why is this bad?

Generally spreading the same expression twice is an indicator of a mistake since any attribute between the spreads may be overridden when the intent was not to.
Even when that is not the case this will lead to unnecessary computations being performed.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<App {...props} myAttr="1" {...props} />
```

Examples of **correct** code for this rule:

```jsx
<App myAttr="1" {...props} />
<App {...props} myAttr="1" />
```

## How to use

```json
{
  "rules": {
    "react/jsx-props-no-spread-multi": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/jsx-props-no-spread-multi": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.2.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-props-no-spread-multi.md)
