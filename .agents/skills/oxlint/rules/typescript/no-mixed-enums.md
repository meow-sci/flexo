---
title: "typescript/no-mixed-enums"
rule: "typescript/no-mixed-enums"
category: "Pedantic"
version: "1.12.0"
default: false
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-mixed-enums/"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | yes |


### What it does

This rule disallows enums from having both string and numeric members.

### Why is this bad?

TypeScript enums can have string, numeric, or computed members. Having mixed string and numeric members in the same enum can lead to confusion and unexpected runtime behavior due to how TypeScript compiles enums.

### Examples

Examples of **incorrect** code for this rule:

```ts
enum Status {
  Open = 1,
  Closed = "closed",
}

enum Direction {
  Up = "up",
  Down = 2,
  Left = "left",
  Right = 4,
}
```

Examples of **correct** code for this rule:

```ts
// All numeric
enum Status {
  Open = 1,
  Closed = 2,
}

// All string
enum Direction {
  Up = "up",
  Down = "down",
  Left = "left",
  Right = "right",
}

// Auto-incremented numeric
enum Color {
  Red,
  Green,
  Blue,
}
```

## How to use

```json
{
  "rules": {
    "typescript/no-mixed-enums": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-mixed-enums": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-mixed-enums/)
