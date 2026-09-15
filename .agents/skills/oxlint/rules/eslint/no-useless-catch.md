---
title: "eslint/no-useless-catch"
rule: "eslint/no-useless-catch"
category: "Correctness"
version: "0.0.5"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-useless-catch"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow unnecessary catch clauses.

### Why is this bad?

A catch clause that only rethrows the original error is redundant,
and has no effect on the runtime behavior of the program.
These redundant clauses can be a source of confusion and code bloat,
so it’s better to disallow these unnecessary catch clauses.

### Examples

Examples of **incorrect** code for this rule:

```javascript
try {
  doSomethingThatMightThrow();
} catch (e) {
  throw e;
}
```

Examples of **correct** code for this rule:

```javascript
doSomethingThatMightThrow();
```

## How to use

```json
{
  "rules": {
    "eslint/no-useless-catch": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-useless-catch": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.5.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-useless-catch)
