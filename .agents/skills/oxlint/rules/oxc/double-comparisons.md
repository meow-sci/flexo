---
title: "oxc/double-comparisons"
rule: "oxc/double-comparisons"
category: "Correctness"
version: "0.0.22"
default: true
type_aware: false
fix: "fixable_fix"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule checks for double comparisons in logical expressions.

### Why is this bad?

Redundant comparisons can be confusing and make code harder to understand.

### Examples

Examples of **incorrect** code for this rule:

```javascript
x === y || x < y;
x < y || x === y;
```

Examples of **correct** code for this rule:

```javascript
x <= y;
x >= y;
```

## How to use

```json
{
  "rules": {
    "oxc/double-comparisons": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/double-comparisons": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.22.

## References

