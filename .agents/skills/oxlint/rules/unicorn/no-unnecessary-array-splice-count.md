---
title: "unicorn/no-unnecessary-array-splice-count"
rule: "unicorn/no-unnecessary-array-splice-count"
category: "Pedantic"
version: "1.20.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unnecessary-array-splice-count.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallows passing `.length` or `Infinity` as the `deleteCount` or `skipCount` argument of `Array#splice()` or `Array#toSpliced()`.

### Why is this bad?

When calling `Array#splice(start, deleteCount)` or `Array#toSpliced(start, skipCount)`,
omitting the `deleteCount` or `skipCount` argument will delete or skip all elements after `start`.
Using `.length` or `Infinity` is unnecessary and makes the code more verbose.

### Examples

Examples of **incorrect** code for this rule:

```js
array.splice(1, array.length);
array.splice(1, Infinity);
array.splice(1, Number.POSITIVE_INFINITY);
array.toSpliced(1, array.length);
```

Examples of **correct** code for this rule:

```js
array.splice(1);
array.toSpliced(1);
```

## How to use

```json
{
  "rules": {
    "unicorn/no-unnecessary-array-splice-count": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-unnecessary-array-splice-count": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unnecessary-array-splice-count.md)
