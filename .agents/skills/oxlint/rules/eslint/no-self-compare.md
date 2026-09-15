---
title: "eslint/no-self-compare"
rule: "eslint/no-self-compare"
category: "Pedantic"
version: "0.0.3"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-self-compare"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow comparisons where both sides are exactly the same.

### Why is this bad?

Comparing a variable against itself is usually an error, either a typo or refactoring error.
It is confusing to the reader and may potentially introduce a runtime error.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var x = 10;
if (x === x) {
  x = 20;
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-self-compare": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-self-compare": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-self-compare)
