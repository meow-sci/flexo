---
title: "eslint/no-undef"
rule: "eslint/no-undef"
category: "Nursery"
version: "0.0.8"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-undef"
---

| Property | Value |
|----------|-------|
| Category | Nursery |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow the use of undeclared variables.

This rule can be disabled for TypeScript code, as the TypeScript compiler
enforces this check.

### Why is this bad?

It is most likely a potential ReferenceError caused by a misspelling
of a variable or parameter name.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var foo = someFunction();
var bar = a + 1;
```

## Configuration

This rule accepts a configuration object with the following properties:

### typeof

type: `boolean`

default: `false`

When set to `true`, warns on undefined variables used in a `typeof` expression.

## How to use

```json
{
  "rules": {
    "eslint/no-undef": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-undef": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.8.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-undef)
