---
title: "unicorn/no-array-reduce"
rule: "unicorn/no-array-reduce"
category: "Restriction"
version: "0.0.19"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-reduce.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow `Array#reduce()` and `Array#reduceRight()`.

### Why is this bad?

`Array#reduce()` and `Array#reduceRight()` usually result in [hard-to-read](https://twitter.com/jaffathecake/status/1213077702300852224) and [less performant](https://www.richsnapp.com/article/2019/06-09-reduce-spread-anti-pattern) code. In almost every case, it can be replaced by `.map`, `.filter`, or a `for-of` loop.

It's only somewhat useful in the rare case of summing up numbers, which is allowed by default.

### Examples

Examples of **incorrect** code for this rule:

```javascript
array.reduce(reducer, initialValue);
array.reduceRight(reducer, initialValue);
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowSimpleOperations

type: `boolean`

default: `true`

When set to `true`, allows simple operations (like summing numbers) in `reduce` and `reduceRight` calls.

## How to use

```json
{
  "rules": {
    "unicorn/no-array-reduce": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-array-reduce": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-reduce.md)
