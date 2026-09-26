---
title: "typescript/prefer-enum-initializers"
rule: "typescript/prefer-enum-initializers"
category: "Pedantic"
version: "0.3.2"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://typescript-eslint.io/rules/prefer-enum-initializers/"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Require each enum member value to be explicitly initialized.

### Why is this bad?

In projects where the value of `enum` members are important, allowing implicit values for enums can cause bugs if enums are modified over time.

### Examples

Examples of **incorrect** code for this rule:

```typescript
// wrong, the value of `Close` is not constant
enum Status {
  Open = 1,
  Close,
}
```

Examples of **correct** code for this rule:

```typescript
enum Status {
  Open = 1,
  Close = 2,
}
```

## How to use

```json
{
  "rules": {
    "typescript/prefer-enum-initializers": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/prefer-enum-initializers": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.2.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/prefer-enum-initializers/)
