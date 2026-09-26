---
title: "eslint/no-array-constructor"
rule: "eslint/no-array-constructor"
category: "Pedantic"
version: "0.0.3"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/no-array-constructor"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallows creating arrays with the `Array` constructor.

### Why is this bad?

Use of the `Array` constructor to construct a new array is generally
discouraged in favor of array literal notation because of the
single-argument pitfall and because the `Array` global may be redefined.
The exception is when the `Array` constructor is used to intentionally
create sparse arrays of a specified size by giving the constructor a
single numeric argument.

### Examples

Examples of **incorrect** code for this rule:

```javascript
let arr = new Array();
```

Examples of **correct** code for this rule:

```javascript
let arr = [];
let arr2 = Array.from(iterable);
let arr3 = new Array(9);
```

## How to use

```json
{
  "rules": {
    "eslint/no-array-constructor": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-array-constructor": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-array-constructor)
