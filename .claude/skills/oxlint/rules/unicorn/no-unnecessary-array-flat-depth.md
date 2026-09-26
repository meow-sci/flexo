---
title: "unicorn/no-unnecessary-array-flat-depth"
rule: "unicorn/no-unnecessary-array-flat-depth"
category: "Pedantic"
version: "0.16.12"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unnecessary-array-flat-depth.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallows passing `1` to `Array.prototype.flat`.

### Why is this bad?

Passing `1` is unnecessary.

### Examples

Examples of **incorrect** code for this rule:

```js
foo.flat(1);
```

Examples of **correct** code for this rule:

```js
foo.flat();
```

## How to use

```json
{
  "rules": {
    "unicorn/no-unnecessary-array-flat-depth": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-unnecessary-array-flat-depth": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.12.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unnecessary-array-flat-depth.md)
