---
title: "oxc/misrefactored-assign-op"
rule: "oxc/misrefactored-assign-op"
category: "Suspicious"
version: "0.1.1"
default: false
type_aware: false
fix: "fixable_suggestion"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

https://rust-lang.github.io/rust-clippy/master/#/misrefactored_assign_op

Checks for `a op= a op b` or `a op= b op a` patterns.

### Why is this bad?

Most likely these are bugs where one meant to write `a op= b`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
a += a + b;
a -= a - b;
```

Examples of **correct** code for this rule:

```javascript
a += b;
a -= b;
```

## How to use

```json
{
  "rules": {
    "oxc/misrefactored-assign-op": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/misrefactored-assign-op": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

