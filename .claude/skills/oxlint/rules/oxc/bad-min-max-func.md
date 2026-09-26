---
title: "oxc/bad-min-max-func"
rule: "oxc/bad-min-max-func"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Checks whether the clamp function `Math.min(Math.max(x, y), z)` always evaluate to a
constant result because the arguments are in the wrong order.

### Why is this bad?

The `Math.min(Math.max(x, y), z)` function is used to clamp a value between two other values.
If the arguments are in the wrong order, the function will always evaluate to a constant result.

### Examples

Examples of **incorrect** code for this rule:

```javascript
Math.min(Math.max(100, x), 0);
Math.max(1000, Math.min(0, z));
```

Examples of **correct** code for this rule:

```javascript
Math.max(0, Math.min(100, x));
Math.min(1000, Math.max(0, z));
```

## How to use

```json
{
  "rules": {
    "oxc/bad-min-max-func": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/bad-min-max-func": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

