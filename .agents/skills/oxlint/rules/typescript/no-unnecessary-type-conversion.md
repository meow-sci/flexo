---
title: "typescript/no-unnecessary-type-conversion"
rule: "typescript/no-unnecessary-type-conversion"
category: "Suspicious"
version: "1.49.0"
default: false
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-unnecessary-type-conversion/"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | yes |


### What it does

Disallow unnecessary type conversion expressions.

### Why is this bad?

Type conversions that do not change a value's type or runtime behavior
add noise and can obscure intent.

### Examples

Examples of **incorrect** code for this rule:

```ts
const value = String("asdf");
```

Examples of **correct** code for this rule:

```ts
const value = "asdf";
```

## How to use

```json
{
  "rules": {
    "typescript/no-unnecessary-type-conversion": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-unnecessary-type-conversion": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.49.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-conversion/)
