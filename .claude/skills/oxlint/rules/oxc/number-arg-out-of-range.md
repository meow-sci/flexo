---
title: "oxc/number-arg-out-of-range"
rule: "oxc/number-arg-out-of-range"
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

Checks whether the radix or precision arguments of number-related functions exceeds the limit.

### Why is this bad?

The radix argument of `Number.prototype.toString` should be between 2 and 36.
The precision argument of `Number.prototype.toFixed` and `Number.prototype.toExponential` should be between 0 and 20.
The precision argument of `Number.prototype.toPrecision` should be between 1 and 21.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var x = 42;
var s_radix_64 = x.toString(64);
var s = x.toString(1);
```

Examples of **correct** code for this rule:

```javascript
var x = 42;
var s_radix_16 = x.toString(16);
```

## How to use

```json
{
  "rules": {
    "oxc/number-arg-out-of-range": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/number-arg-out-of-range": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

