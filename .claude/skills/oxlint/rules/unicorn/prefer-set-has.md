---
title: "unicorn/prefer-set-has"
rule: "unicorn/prefer-set-has"
category: "Perf"
version: "0.13.2"
default: false
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-set-has.md"
---

| Property | Value |
|----------|-------|
| Category | Perf |
| Default | no |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

Prefer `Set#has()` over `Array#includes()` when checking for existence or non-existence.

### Why is this bad?

`Set#has()` is faster than `Array#includes()`.

### Examples

Examples of **incorrect** code for this rule:

```js
const array = [1, 2, 3];
const hasValue = (value) => array.includes(value);
```

Examples of **correct** code for this rule:

```js
const set = new Set([1, 2, 3]);
const hasValue = (value) => set.has(value);
```

```js
const array = [1, 2, 3];
const hasOne = array.includes(1);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-set-has": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-set-has": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.13.2.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-set-has.md)
