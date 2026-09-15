---
title: "unicorn/prefer-type-error"
rule: "unicorn/prefer-type-error"
category: "Pedantic"
version: "0.0.16"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-type-error.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce throwing a `TypeError` instead of a generic `Error` after a type checking if-statement.

### Why is this bad?

Throwing a `TypeError` instead of a generic `Error` after a type checking if-statement is more specific and helps to catch bugs.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (Array.isArray(foo)) {
  throw new Error("Expected foo to be an array");
}
```

Examples of **correct** code for this rule:

```javascript
if (Array.isArray(foo)) {
  throw new TypeError("Expected foo to be an array");
}
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-type-error": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-type-error": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-type-error.md)
