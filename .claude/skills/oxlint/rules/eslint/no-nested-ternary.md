---
title: "eslint/no-nested-ternary"
rule: "eslint/no-nested-ternary"
category: "Style"
version: "0.15.4"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-nested-ternary"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows nested ternary expressions to improve code readability and maintainability.

### Why is this bad?

Nested ternary expressions make code harder to read and understand. They can lead to complex, difficult-to-debug logic.

### Examples

Examples of **incorrect** code for this rule:

```js
const result = condition1 ? (condition2 ? "a" : "b") : "c";
```

Examples of **correct** code for this rule:

```js
let result;
if (condition1) {
  result = condition2 ? "a" : "b";
} else {
  result = "c";
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-nested-ternary": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-nested-ternary": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-nested-ternary)
