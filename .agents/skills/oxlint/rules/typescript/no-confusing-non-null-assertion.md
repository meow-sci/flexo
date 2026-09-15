---
title: "typescript/no-confusing-non-null-assertion"
rule: "typescript/no-confusing-non-null-assertion"
category: "Suspicious"
version: "0.6.1"
default: false
type_aware: false
fix: "pending"
upstream: "https://typescript-eslint.io/rules/no-confusing-non-null-assertion/"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow non-null assertion in locations that may be confusing.

### Why is this bad?

Using a non-null assertion (!) next to an assign or equals check (= or == or ===) creates code that is confusing as it looks similar to a not equals check (!= !==).

### Examples

Examples of **incorrect** code for this rule:

```ts
a! == b; // a non-null assertions(`!`) and an equals test(`==`)
a !== b; // not equals test(`!==`)
a! === b; // a non-null assertions(`!`) and an triple equals test(`===`)
```

Examples of **correct** code for this rule:

```ts
a == b;
a !== b;
a === b;
```

## How to use

```json
{
  "rules": {
    "typescript/no-confusing-non-null-assertion": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-confusing-non-null-assertion": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.6.1.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-confusing-non-null-assertion/)
