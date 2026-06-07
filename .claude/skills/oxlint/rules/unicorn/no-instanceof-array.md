---
title: "unicorn/no-instanceof-array"
rule: "unicorn/no-instanceof-array"
category: "Pedantic"
version: "0.0.8"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-instanceof-array.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Require `Array.isArray()` instead of `instanceof Array`.

### Why is this bad?

The `instanceof Array` check doesn't work across realms/contexts.
For example, frames/windows in browsers or the `vm` module in Node.js.

### Examples

Examples of **incorrect** code for this rule:

```javascript
array instanceof Array;
[1, 2, 3] instanceof Array;
```

Examples of **correct** code for this rule:

```javascript
Array.isArray(array);
Array.isArray([1, 2, 3]);
```

## How to use

```json
{
  "rules": {
    "unicorn/no-instanceof-array": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-instanceof-array": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.8.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-instanceof-array.md)
