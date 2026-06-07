---
title: "typescript/prefer-for-of"
rule: "typescript/prefer-for-of"
category: "Style"
version: "0.2.16"
default: false
type_aware: false
fix: "pending"
upstream: "https://typescript-eslint.io/rules/prefer-for-of/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Enforces the use of for-of loop instead of a for loop with a simple iteration.

### Why is this bad?

Using a for loop with a simple iteration over an array can be replaced with a more concise
and readable for-of loop. For-of loops are easier to read and less error-prone, as they
eliminate the need for an index variable and manual array access.

### Examples

Examples of **incorrect** code for this rule:

```typescript
for (let i = 0; i < arr.length; i++) {
  console.log(arr[i]);
}
```

Examples of **correct** code for this rule:

```typescript
for (const item of arr) {
  console.log(item);
}
```

## How to use

```json
{
  "rules": {
    "typescript/prefer-for-of": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/prefer-for-of": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.16.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/prefer-for-of/)
