---
title: "eslint/prefer-exponentiation-operator"
rule: "eslint/prefer-exponentiation-operator"
category: "Style"
version: "0.4.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/prefer-exponentiation-operator"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow the use of `Math.pow` in favor of the `**` operator.

### Why is this bad?

Introduced in ES2016, the infix exponentiation operator `**` is an alternative for the
standard `Math.pow` function. Infix notation is considered to be more readable and thus more
preferable than the function notation.

### Examples

Examples of **incorrect** code for this rule:

```javascript
Math.pow(a, b);
```

Examples of **correct** code for this rule:

```javascript
a ** b;
```

## How to use

```json
{
  "rules": {
    "eslint/prefer-exponentiation-operator": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/prefer-exponentiation-operator": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/prefer-exponentiation-operator)
