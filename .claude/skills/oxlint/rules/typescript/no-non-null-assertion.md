---
title: "typescript/no-non-null-assertion"
rule: "typescript/no-non-null-assertion"
category: "Restriction"
version: "0.5.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://typescript-eslint.io/rules/no-non-null-assertion/"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow non-null assertions using the `!` postfix operator.

### Why is this bad?

TypeScript's `!` non-null assertion operator asserts to the type system that an expression is non-nullable, as in not `null` or `undefined`. Using assertions to tell the type system new information is often a sign that code is not fully type-safe. It's generally better to structure program logic so that TypeScript understands when values may be nullable.

### Examples

Examples of **incorrect** code for this rule:

```ts
x!;
x!.y;
x.y!;
```

Examples of **correct** code for this rule:

```ts
x;
x?.y;
x.y;
```

## How to use

```json
{
  "rules": {
    "typescript/no-non-null-assertion": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-non-null-assertion": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-non-null-assertion/)
