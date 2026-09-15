---
title: "unicorn/prefer-negative-index"
rule: "unicorn/prefer-negative-index"
category: "Style"
version: "0.13.2"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-negative-index.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefer using a negative index over `.length - index` when possible.

### Why is this bad?

Using a negative index with `at` or `slice` is generally more readable
and concise than using `.length - index`.

### Examples

Examples of **incorrect** code for this rule:

```js
foo.slice(foo.length - 2, foo.length - 1);
foo.at(foo.length - 1);
```

Examples of **correct** code for this rule:

```js
foo.slice(-2, -1);
foo.at(-1);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-negative-index": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-negative-index": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.13.2.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-negative-index.md)
