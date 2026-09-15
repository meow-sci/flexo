---
title: "eslint/no-unneeded-ternary"
rule: "eslint/no-unneeded-ternary"
category: "Suspicious"
version: "0.15.12"
default: false
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://eslint.org/docs/latest/rules/no-unneeded-ternary"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

Disallow ternary operators when simpler alternatives exist.

### Why is this bad?

It’s a common mistake in JavaScript to use a conditional expression to select between two
Boolean values instead of using ! to convert the test to a Boolean.

Another common mistake is using a single variable as both the conditional test and the
consequent. In such cases, the logical OR can be used to provide the same functionality.

### Examples

Examples of **incorrect** code for this rule:

```js
const isYes = answer === 1 ? true : false;
const isNo = answer === 1 ? false : true;

foo(bar ? bar : 1);
```

Examples of **correct** code for this rule:

```js
const isYes = answer === 1;
const isNo = answer !== 1;

foo(bar || 1);
```

## Configuration

This rule accepts a configuration object with the following properties:

### defaultAssignment

type: `boolean`

default: `true`

Whether to allow the default assignment pattern `x ? x : y`.

When set to `false`, the rule also flags cases like `x ? x : y` and suggests using
the logical OR form `x || y` instead. When `true` (default), such default assignments
are allowed and not reported.

## How to use

```json
{
  "rules": {
    "eslint/no-unneeded-ternary": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-unneeded-ternary": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.12.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-unneeded-ternary)
