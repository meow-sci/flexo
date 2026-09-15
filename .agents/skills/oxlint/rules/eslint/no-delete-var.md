---
title: "eslint/no-delete-var"
rule: "eslint/no-delete-var"
category: "Correctness"
version: "0.0.4"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-delete-var"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

The purpose of the `delete` operator is to remove a property from an
object.

### Why is this bad?

Using the `delete` operator on a variable might lead to unexpected
behavior.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var x;
delete x;
```

Examples of **correct** code for this rule:

```javascript
var x;

var y;
delete y.prop;
```

## How to use

```json
{
  "rules": {
    "eslint/no-delete-var": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-delete-var": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-delete-var)
