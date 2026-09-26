---
title: "unicorn/prefer-array-find"
rule: "unicorn/prefer-array-find"
category: "Perf"
version: "0.16.12"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-array-find.md"
---

| Property | Value |
|----------|-------|
| Category | Perf |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Encourages using `Array.prototype.find` instead of `filter(...)[0]` or
similar patterns when only the first matching element is needed.

### Why is this bad?

Using `filter(...)[0]` to get the first match is less efficient and more verbose
than using `find(...)`. `find` short-circuits when a match is found,
whereas `filter` evaluates the entire array.

### Examples

Examples of **incorrect** code for this rule:

```js
const match = users.filter((u) => u.id === id)[0];
const match = users.filter(fn).shift();
```

Examples of **correct** code for this rule:

```js
const match = users.find((u) => u.id === id);
const match = users.find(fn);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-array-find": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-array-find": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.12.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-array-find.md)
