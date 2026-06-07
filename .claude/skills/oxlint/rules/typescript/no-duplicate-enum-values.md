---
title: "typescript/no-duplicate-enum-values"
rule: "typescript/no-duplicate-enum-values"
category: "Correctness"
version: "0.0.8"
default: true
type_aware: false
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-duplicate-enum-values/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow duplicate enum member values.

### Why is this bad?

Although TypeScript supports duplicate enum member values, people
usually expect members to have unique values within the same enum.
Duplicate values can lead to bugs that are hard to track down.

### Examples

This rule disallows defining an enum with multiple members initialized
to the same value. Members without initializers will not be checked.

Example of **incorrect** code:

```ts
enum E {
  A = 0,
  B = 0,
}
```

```ts
enum E {
  A = "A",
  B = "A",
}
```

Example of **correct** code:

```ts
enum E {
  A = 0,
  B = 1,
}
```

```ts
enum E {
  A = "A",
  B = "B",
}
```

```ts
enum E {
  A,
  B,
}
```

## How to use

```json
{
  "rules": {
    "typescript/no-duplicate-enum-values": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-duplicate-enum-values": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.8.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-duplicate-enum-values/)
