---
title: "typescript/no-useless-default-assignment"
rule: "typescript/no-useless-default-assignment"
category: "Correctness"
version: "1.49.0"
default: true
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-useless-default-assignment/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | yes |


### What it does

Disallow default assignments that can never be used.

### Why is this bad?

A default assignment is redundant when the value can never be `undefined`.
This adds runtime logic and noise without changing behavior.

### Examples

Examples of **incorrect** code for this rule:

```ts
[1, 2, 3].map((a = 0) => a + 1);
```

Examples of **correct** code for this rule:

```ts
[1, 2, 3].map((a) => a + 1);
```

## How to use

```json
{
  "rules": {
    "typescript/no-useless-default-assignment": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-useless-default-assignment": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.49.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-useless-default-assignment/)
