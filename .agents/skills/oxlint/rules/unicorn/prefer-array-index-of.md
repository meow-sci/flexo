---
title: "unicorn/prefer-array-index-of"
rule: "unicorn/prefer-array-index-of"
category: "Style"
version: "0.16.12"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-array-index-of.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Enforces using `indexOf` or `lastIndexOf` instead of `findIndex` or `findLastIndex`
when the callback is a simple strict equality comparison.

### Why is this bad?

Using `findIndex(x => x === value)` is unnecessarily verbose when `indexOf(value)`
accomplishes the same thing more concisely and clearly. It also avoids the overhead
of creating a callback function.

### Examples

Examples of **incorrect** code for this rule:

```js
values.findIndex((x) => x === "foo");
values.findLastIndex((x) => x === "bar");
```

Examples of **correct** code for this rule:

```js
values.indexOf("foo");
values.lastIndexOf("bar");
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-array-index-of": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-array-index-of": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.12.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-array-index-of.md)
