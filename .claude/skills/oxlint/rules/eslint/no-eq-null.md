---
title: "eslint/no-eq-null"
rule: "eslint/no-eq-null"
category: "Restriction"
version: "0.2.14"
default: false
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://eslint.org/docs/latest/rules/no-eq-null"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

Disallow `null` comparisons without type-checking operators.

### Why is this bad?

Comparing to `null` without a type-checking operator (`==` or `!=`), can
have unintended results as the comparison will evaluate to `true` when
comparing to not just a `null`, but also an `undefined` value.

### Examples

Examples of **incorrect** code for this rule:

```js
if (foo == null) {
  bar();
}
if (baz != null) {
  bar();
}
```

Examples of **correct** code for this rule:

```js
if (foo === null) {
  bar();
}

if (baz !== null) {
  bar();
}

if (bang === undefined) {
  bar();
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-eq-null": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-eq-null": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-eq-null)
