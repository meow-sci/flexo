---
title: "promise/no-return-in-finally"
rule: "promise/no-return-in-finally"
category: "Nursery"
version: "0.7.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-return-in-finally.md"
---

| Property | Value |
|----------|-------|
| Category | Nursery |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow return statements in a `finally()` callback of a promise.

### Why is this bad?

Disallow return statements inside a callback passed to finally(), since nothing would
consume what's returned.

### Examples

Examples of **incorrect** code for this rule:

```javascript
myPromise.finally(function (val) {
  return val;
});
```

Examples of **correct** code for this rule:

```javascript
Promise.resolve(1).finally(() => {
  console.log(2);
});
```

## How to use

```json
{
  "rules": {
    "promise/no-return-in-finally": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/no-return-in-finally": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.1.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-return-in-finally.md)
