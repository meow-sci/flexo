---
title: "unicorn/prefer-set-size"
rule: "unicorn/prefer-set-size"
category: "Correctness"
version: "0.0.19"
default: true
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-set-size.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefer `Set#size` over `Set#length` when the `Set` is converted to an array.

### Why is this bad?

Using `Set#size` is more readable and performant.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const length = [...new Set([1, 2, 3])].length;
```

Examples of **correct** code for this rule:

```javascript
const size = new Set([1, 2, 3]).size;
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-set-size": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-set-size": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-set-size.md)
