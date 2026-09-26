---
title: "typescript/no-array-delete"
rule: "typescript/no-array-delete"
category: "Correctness"
version: "1.12.0"
default: true
type_aware: true
fix: "fixable_suggestion"
upstream: "https://typescript-eslint.io/rules/no-array-delete/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_suggestion |
| Type-aware | yes |


### What it does

This rule disallows using the delete operator on array values.

### Why is this bad?

When using the delete operator on an array, the element is not actually removed, but instead the array slot is turned into `undefined`. This is usually not the intended behavior. Instead, you should use methods like `Array.prototype.splice()` to properly remove elements from an array.

### Examples

Examples of **incorrect** code for this rule:

```ts
declare const arr: number[];
delete arr[0];
```

Examples of **correct** code for this rule:

```ts
declare const arr: number[];
arr.splice(0, 1);

// or with a filter
const filteredArr = arr.filter((_, index) => index !== 0);

// delete on object is allowed
declare const obj: { a?: number };
delete obj.a;
```

## How to use

```json
{
  "rules": {
    "typescript/no-array-delete": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-array-delete": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-array-delete/)
