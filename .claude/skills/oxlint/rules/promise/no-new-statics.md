---
title: "promise/no-new-statics"
rule: "promise/no-new-statics"
category: "Correctness"
version: "0.6.1"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-new-statics.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallows calling new on static `Promise` methods.

### Why is this bad?

Calling a static `Promise` method with `new` is invalid and will result
in a `TypeError` at runtime.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const x = new Promise.resolve(value);
```

Examples of **correct** code for this rule:

```javascript
const x = Promise.resolve(value);
```

## How to use

```json
{
  "rules": {
    "promise/no-new-statics": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/no-new-statics": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.6.1.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-new-statics.md)
