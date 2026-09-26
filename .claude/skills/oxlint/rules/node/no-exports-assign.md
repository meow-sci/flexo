---
title: "node/no-exports-assign"
rule: "node/no-exports-assign"
category: "Style"
version: "0.9.3"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/no-exports-assign.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallows assignment to `exports`.

### Why is this bad?

Directly using `exports = {}` can lead to confusion and potential bugs
because it reassigns the `exports` object, which may break module
exports. It is more predictable and clearer to use `module.exports`
directly or in conjunction with `exports`.

This rule is aimed at disallowing `exports = {}`, but allows
`module.exports = exports = {}` to avoid conflict with `n/exports-style`
rule's `allowBatchAssign` option.

### Examples

Examples of **incorrect** code for this rule:

```js
exports = {};
```

Examples of **correct** code for this rule:

```js
module.exports.foo = 1;
exports.bar = 2;
module.exports = {};

// allows `exports = {}` if along with `module.exports =`
module.exports = exports = {};
exports = module.exports = {};
```

## How to use

```json
{
  "rules": {
    "node/no-exports-assign": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "node/no-exports-assign": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.3.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/no-exports-assign.md)
