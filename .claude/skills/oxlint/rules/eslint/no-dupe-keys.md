---
title: "eslint/no-dupe-keys"
rule: "eslint/no-dupe-keys"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-dupe-keys"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow duplicate keys in object literals.

This rule can be disabled for TypeScript code, as the TypeScript compiler
enforces this check.

### Why is this bad?

Multiple properties with the same key in object literals can cause
unexpected behavior in your application.

### Examples

Examples of **incorrect** code for this rule:

```js
var foo = {
  bar: "baz",
  bar: "qux",
};

var foo = {
  bar: "baz",
  bar: "qux",
};

var foo = {
  0x1: "baz",
  1: "qux",
};
```

Examples of **correct** code for this rule:

```js
var foo = {
  bar: "baz",
  qux: "qux",
};
```

## How to use

```json
{
  "rules": {
    "eslint/no-dupe-keys": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-dupe-keys": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-dupe-keys)
