---
title: "eslint/use-isnan"
rule: "eslint/use-isnan"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "conditional_fix"
upstream: "https://eslint.org/docs/latest/rules/use-isnan"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Disallows checking against `NaN` without using `isNaN()` call.

### Why is this bad?

In JavaScript, `NaN` is a special value of the Number type.
It’s used to represent any of the “not-a-number” values represented
by the double-precision 64-bit format as specified by the IEEE Standard
for Binary Floating-Point Arithmetic.

Because `NaN` is unique in JavaScript by not being equal to anything, including itself,
the results of comparisons to `NaN` are confusing:

- `NaN === NaN` or `NaN == NaN` evaluate to false
- `NaN !== NaN` or `NaN != NaN` evaluate to true

Therefore, use `Number.isNaN()` or global `isNaN()` functions to test whether a value is `NaN`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
foo == NaN;
foo === NaN;
foo <= NaN;
foo > NaN;
```

## Configuration

This rule accepts a configuration object with the following properties:

### enforceForIndexOf

type: `boolean`

default: `false`

Whether to disallow NaN as arguments of `indexOf` and `lastIndexOf`

### enforceForSwitchCase

type: `boolean`

default: `true`

Whether to disallow NaN in switch cases and discriminants

## How to use

```json
{
  "rules": {
    "eslint/use-isnan": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/use-isnan": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/use-isnan)
