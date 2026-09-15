---
title: "eslint/no-setter-return"
rule: "eslint/no-setter-return"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-setter-return"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Setters cannot return values.

This rule can be disabled for TypeScript code, as the TypeScript compiler
enforces this check.

### Why is this bad?

While returning a value from a setter does not produce an error, the returned value is
being ignored. Therefore, returning a value from a setter is either unnecessary or a
possible error, since the returned value cannot be used.

### Examples

Examples of **incorrect** code for this rule:

```javascript
class URL {
  set origin() {
    return true;
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-setter-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-setter-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-setter-return)
