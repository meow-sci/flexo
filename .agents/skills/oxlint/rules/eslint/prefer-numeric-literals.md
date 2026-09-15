---
title: "eslint/prefer-numeric-literals"
rule: "eslint/prefer-numeric-literals"
category: "Style"
version: "0.7.0"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://eslint.org/docs/latest/rules/prefer-numeric-literals"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Disallow `parseInt()` and `Number.parseInt()` in favor of binary, octal, and hexadecimal
literals.

### Why is this bad?

The `parseInt()` and `Number.parseInt()` functions can be used to turn binary, octal, and
hexadecimal strings into integers. As binary, octal, and hexadecimal literals are supported
in ES2015, this rule encourages use of those numeric literals instead of `parseInt()` or
`Number.parseInt()`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
parseInt("111110111", 2) === 503;
parseInt(`111110111`, 2) === 503;
parseInt("767", 8) === 503;
parseInt("1F7", 16) === 503;
Number.parseInt("111110111", 2) === 503;
Number.parseInt("767", 8) === 503;
Number.parseInt("1F7", 16) === 503;
```

## How to use

```json
{
  "rules": {
    "eslint/prefer-numeric-literals": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/prefer-numeric-literals": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/prefer-numeric-literals)
