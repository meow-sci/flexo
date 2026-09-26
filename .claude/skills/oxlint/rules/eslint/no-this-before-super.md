---
title: "eslint/no-this-before-super"
rule: "eslint/no-this-before-super"
category: "Correctness"
version: "0.2.6"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-this-before-super"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Requires calling `super()` before using `this` or `super`.

This rule can be disabled for TypeScript code, as the TypeScript compiler
enforces this check.

### Why is this bad?

In the constructor of derived classes, if `this`/`super` are used before `super()` calls,
it raises a `ReferenceError`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
class A1 extends B {
  constructor() {
    // super() needs to be called first
    this.a = 0;
    super();
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-this-before-super": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-this-before-super": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.6.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-this-before-super)
