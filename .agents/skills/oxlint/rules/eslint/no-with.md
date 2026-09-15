---
title: "eslint/no-with"
rule: "eslint/no-with"
category: "Correctness"
version: "0.2.14"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-with"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow [`with`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/with) statements.

### Why is this bad?

The with statement is potentially problematic because it adds members
of an object to the current scope, making it impossible to tell what a
variable inside the block actually refers to.

It is generally considered a bad practice and is forbidden in strict mode.

This rule is not necessary in TypeScript code if `alwaysStrict` is enabled.

### Examples

Examples of **incorrect** code for this rule:

```javascript
with (point) {
  r = Math.sqrt(x * x + y * y); // is r a member of point?
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-with": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-with": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-with)
