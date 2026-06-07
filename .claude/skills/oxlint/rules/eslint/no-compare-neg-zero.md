---
title: "eslint/no-compare-neg-zero"
rule: "eslint/no-compare-neg-zero"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "conditional_safe_fix_or_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-compare-neg-zero"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | conditional_safe_fix_or_suggestion |
| Type-aware | no |


### What it does

Disallow comparing against `-0`

### Why is this bad?

The rule should warn against code that tries to compare against `-0`,
since that will not work as intended. That is, code like `x === -0` will
pass for both `+0` and `-0`. The author probably intended `Object.is(x, -0)`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (x === -0) {
  // doSomething()...
}
```

```javascript
if (-0 > x) {
  // doSomething()...
}
```

Examples of **correct** code for this rule:

```javascript
if (x === 0) {
  // doSomething()...
}
```

```javascript
if (Object.is(x, -0)) {
  // doSomething()...
}
```

```javascript
if (0 > x) {
  // doSomething()...
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-compare-neg-zero": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-compare-neg-zero": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-compare-neg-zero)
