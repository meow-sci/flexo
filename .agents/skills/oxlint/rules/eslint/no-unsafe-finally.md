---
title: "eslint/no-unsafe-finally"
rule: "eslint/no-unsafe-finally"
category: "Correctness"
version: "0.0.5"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-unsafe-finally"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow control flow statements in `finally` blocks.

### Why is this bad?

JavaScript suspends the control flow statements of `try` and `catch`
blocks until the execution of a `finally` block finishes.

So, when `return`, `throw`, `break`, or `continue` is used in `finally`,
control flow statements inside `try` and `catch` are overwritten.
This is possibly unexpected behavior for the developer.

### Examples

Examples of **incorrect** code for this rule:

```javascript
// We expect this function to return 1;
(() => {
  try {
    return 1; // 1 is returned but suspended until finally block ends
  } catch (err) {
    return 2;
  } finally {
    return 3; // 3 is returned before 1, which we did not expect
  }
})();

// > 3
```

## How to use

```json
{
  "rules": {
    "eslint/no-unsafe-finally": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-unsafe-finally": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.5.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-unsafe-finally)
