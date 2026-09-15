---
title: "promise/valid-params"
rule: "promise/valid-params"
category: "Correctness"
version: "0.7.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/valid-params.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces the proper number of arguments are passed to Promise functions.

This rule is generally unnecessary if using TypeScript.

### Why is this bad?

Calling a Promise function with the incorrect number of arguments can lead to unexpected
behavior or hard to spot bugs.

### Examples

Examples of **incorrect** code for this rule:

```javascript
Promise.resolve(1, 2);
```

Examples of **correct** code for this rule:

```javascript
Promise.resolve(1);
```

## How to use

```json
{
  "rules": {
    "promise/valid-params": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/valid-params": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.1.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/valid-params.md)
