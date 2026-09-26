---
title: "eslint/require-yield"
rule: "eslint/require-yield"
category: "Correctness"
version: "0.0.4"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/require-yield"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

This rule generates warnings for generator functions that do not have the yield keyword.

### Why is this bad?

Probably a mistake.

### Examples

Examples of **incorrect** code for this rule:

```javascript
function* foo() {
  return 10;
}
```

## How to use

```json
{
  "rules": {
    "eslint/require-yield": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/require-yield": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/require-yield)
