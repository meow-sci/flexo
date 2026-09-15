---
title: "eslint/no-unsafe-negation"
rule: "eslint/no-unsafe-negation"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/no-unsafe-negation"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallows negating the left operand of relational operators to prevent logical errors
caused by misunderstanding operator precedence or accidental use of negation.

This rule can be disabled for TypeScript code, as the TypeScript compiler
enforces this check.

### Why is this bad?

Negating the left operand of relational operators can result in unexpected behavior due to
operator precedence, leading to logical errors. For instance, `!a in b` may be interpreted
as `(!a) in b` instead of `!(a in b)`, which is not the intended logic.

### Examples

Examples of **incorrect** code for this rule:

<!-- prettier-ignore-start -->
```javascript
if (!key in object) {}

if (!obj instanceof Ctor) {}
```

Examples of **correct** code for this rule:
```javascript
if (!(key in object)) {}

if (!(obj instanceof Ctor)) {}
```
<!-- prettier-ignore-end -->

## Configuration

This rule accepts a configuration object with the following properties:

### enforceForOrderingRelations

type: `boolean`

default: `false`

The `enforceForOrderingRelations` option determines whether negation is allowed
on the left-hand side of ordering relational operators (<, >, <=, >=).

The purpose is to avoid expressions such as `!a < b` (which is equivalent to `(a ? 0 : 1) < b`)
when what is really intended is `!(a < b)`.

## How to use

```json
{
  "rules": {
    "eslint/no-unsafe-negation": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-unsafe-negation": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-unsafe-negation)
