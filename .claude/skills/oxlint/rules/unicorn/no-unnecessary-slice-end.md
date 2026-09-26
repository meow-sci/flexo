---
title: "unicorn/no-unnecessary-slice-end"
rule: "unicorn/no-unnecessary-slice-end"
category: "Pedantic"
version: "0.16.10"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unnecessary-slice-end.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallows unnecessarily passing a second argument to `slice(...)`, for
cases where it would not change the result.

### Why is this bad?

When using `.slice(...)` without a second argument, the second argument
defaults to the object's length. As such, passing the length explicitly

- or using `Infinity` - is unnecessary.

### Examples

Examples of **incorrect** code for this rule:

```js
const foo = string.slice(1, string.length);
const foo = string.slice(1, Infinity);
const foo = string.slice(1, Number.POSITIVE_INFINITY);
```

Examples of **correct** code for this rule:

```js
const foo = string.slice(1);
```

## How to use

```json
{
  "rules": {
    "unicorn/no-unnecessary-slice-end": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-unnecessary-slice-end": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.10.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unnecessary-slice-end.md)
